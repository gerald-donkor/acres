import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AcresConfigService } from '../config/acres-config.service';
import {
  TenantTransactionService,
  type TenantTransactionClient,
} from '../prisma/tenant-transaction.service';

export interface ClaimedOutboxEvent {
  readonly id: string;
  readonly organizationId: string | null;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly payload: unknown;
  readonly attempts: number;
  readonly maxAttempts: number;
}

@Injectable()
export class OutboxService {
  private readonly workerId = `worker-${randomUUID()}`;

  constructor(
    private readonly tenants: TenantTransactionService,
    private readonly config: AcresConfigService,
  ) {}

  appendUploadCompleted(
    tx: TenantTransactionClient,
    input: { organizationId: string; uploadId: string; version: number },
  ) {
    return tx.outboxEvent.create({
      data: {
        organizationId: input.organizationId,
        eventType: 'upload.completed',
        aggregateType: 'Upload',
        aggregateId: input.uploadId,
        aggregateVersion: input.version,
        payload: { uploadId: input.uploadId },
        maxAttempts: this.config.outboxMaxAttempts,
      },
    });
  }

  appendExportRequested(
    tx: TenantTransactionClient,
    input: { organizationId: string; exportRequestId: string },
  ) {
    return tx.outboxEvent.create({
      data: {
        organizationId: input.organizationId,
        eventType: 'export.requested',
        aggregateType: 'ExportRequest',
        aggregateId: input.exportRequestId,
        aggregateVersion: 1,
        payload: { exportRequestId: input.exportRequestId },
        maxAttempts: this.config.outboxMaxAttempts,
      },
    });
  }

  async claimReady(): Promise<ClaimedOutboxEvent[]> {
    const leaseUntil = new Date(Date.now() + this.config.outboxClaimLeaseMs);
    return this.tenants.workerScoped(async (tx) => {
      const rows = await tx.$queryRaw<ClaimedOutboxEvent[]>`
        UPDATE "OutboxEvent"
        SET "state" = 'retrying',
            "lockedBy" = ${this.workerId},
            "lockedUntil" = ${leaseUntil},
            "attempts" = "attempts" + 1,
            "updatedAt" = now()
        WHERE "id" IN (
          SELECT "id"
          FROM "OutboxEvent"
          WHERE "state" IN ('pending', 'retrying')
            AND "nextAttemptAt" <= now()
            AND ("lockedUntil" IS NULL OR "lockedUntil" < now())
            AND "attempts" < "maxAttempts"
          ORDER BY "createdAt"
          LIMIT ${this.config.outboxClaimBatchSize}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING "id", "organizationId", "eventType", "aggregateId", "payload", "attempts", "maxAttempts"
      `;
      return rows;
    });
  }

  async markDispatched(id: string): Promise<void> {
    await this.tenants.workerScoped(async (tx) => {
      await tx.outboxEvent.update({
        where: { id },
        data: {
          state: 'dispatched',
          dispatchedAt: new Date(),
          lockedBy: null,
          lockedUntil: null,
        },
      });
    });
  }

  async markRetry(id: string, code: string): Promise<void> {
    await this.tenants.workerScoped(async (tx) => {
      await tx.outboxEvent.update({
        where: { id },
        data: {
          state: 'retrying',
          lastErrorCode: code,
          lockedBy: null,
          lockedUntil: null,
          nextAttemptAt: new Date(Date.now() + this.config.queueBackoffMs),
        },
      });
    });
  }

  async markDeadLetter(
    id: string,
    input: {
      organizationId: string | null;
      reasonCode: string;
      reasonMessage: string;
      payload?: unknown;
    },
  ): Promise<void> {
    await this.tenants.workerScoped(async (tx) => {
      await tx.outboxEvent.update({
        where: { id },
        data: {
          state: 'dead_lettered',
          lastErrorCode: input.reasonCode,
          lockedBy: null,
          lockedUntil: null,
        },
      });
      await tx.jobDeadLetter.create({
        data: {
          organizationId: input.organizationId,
          outboxEventId: id,
          reasonCode: input.reasonCode,
          reasonMessage: input.reasonMessage,
          payload: input.payload as object,
        },
      });
    });
  }
}
