import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AcresConfigService } from '../config/acres-config.service';
import {
  TenantTransactionService,
  type TenantTransactionClient,
} from '../prisma/tenant-transaction.service';

export type OutboxEventType =
  'upload.completed' | 'export.requested' | 'ingestion.run';

export interface ClaimedOutboxEvent {
  readonly id: string;
  readonly organizationId: string | null;
  // Persisted strings are untrusted; the dispatcher validates them.
  readonly eventType: string;
  readonly aggregateType: string;
  readonly lockedBy: string;
  readonly aggregateId: string;
  readonly payload: unknown;
  readonly attempts: number;
  readonly maxAttempts: number;
}

export const OUTBOX_DISPATCH_EXHAUSTED_CODE = 'queue_unavailable' as const;
export const OUTBOX_DISPATCH_EXHAUSTED_MESSAGE =
  'Outbox dispatch attempts exhausted.' as const;
export const OUTBOX_FAILURES = {
  queue_unavailable: OUTBOX_DISPATCH_EXHAUSTED_MESSAGE,
  outbox_event_invalid: 'Outbox event identity is invalid.',
  outbox_job_mismatch: 'Outbox job identity does not match.',
} as const;
export type OutboxFailureCode = keyof typeof OUTBOX_FAILURES;

@Injectable()
export class OutboxService {
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

  async appendIngestionRun(
    tx: TenantTransactionClient,
    input: { organizationId: string; ingestionRunId: string },
  ) {
    return tx.outboxEvent.upsert({
      where: {
        eventType_aggregateType_aggregateId_aggregateVersion: {
          eventType: 'ingestion.run',
          aggregateType: 'IngestionRun',
          aggregateId: input.ingestionRunId,
          aggregateVersion: 1,
        },
      },
      update: {},
      create: {
        organizationId: input.organizationId,
        eventType: 'ingestion.run',
        aggregateType: 'IngestionRun',
        aggregateId: input.ingestionRunId,
        aggregateVersion: 1,
        payload: { ingestionRunId: input.ingestionRunId },
        maxAttempts: this.config.outboxMaxAttempts,
      },
    });
  }

  async claimReady(): Promise<ClaimedOutboxEvent[]> {
    // Per operation, not per singleton: overlapping invocations cannot share ownership.
    const token = `dispatch-${randomUUID()}`;
    return this.tenants.workerScoped(
      (tx) => tx.$queryRaw<ClaimedOutboxEvent[]>`
      WITH candidates AS MATERIALIZED (
        SELECT "id" FROM "OutboxEvent"
        WHERE "state" IN ('pending', 'retrying')
          AND "nextAttemptAt" <= clock_timestamp()
          AND ("lockedUntil" IS NULL OR "lockedUntil" <= clock_timestamp())
          AND "attempts" < "maxAttempts"
        ORDER BY "createdAt", "id"
        LIMIT ${this.config.outboxClaimBatchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "OutboxEvent" AS event
      SET "state" = 'retrying', "lockedBy" = ${token},
          "lockedUntil" = clock_timestamp() + (${this.config.outboxClaimLeaseMs} * interval '1 millisecond'),
          "attempts" = event."attempts" + 1, "updatedAt" = clock_timestamp()
      FROM candidates WHERE event."id" = candidates."id"
      RETURNING event."id", event."organizationId", event."eventType", event."aggregateType", event."aggregateId",
                event."payload", event."attempts", event."maxAttempts", event."lockedBy"
    `,
    );
  }

  async ownsClaim(event: ClaimedOutboxEvent): Promise<boolean> {
    const rows = await this.tenants.workerScoped(
      (tx) => tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "OutboxEvent"
      WHERE "id" = ${event.id} AND "lockedBy" = ${event.lockedBy}
        AND "state" = 'retrying' AND "lockedUntil" > clock_timestamp()
    `,
    );
    return rows.length === 1;
  }

  async markDispatched(event: ClaimedOutboxEvent): Promise<boolean> {
    const count = await this.tenants.workerScoped(
      (tx) => tx.$executeRaw`
      UPDATE "OutboxEvent"
      SET "state" = 'dispatched', "dispatchedAt" = clock_timestamp(),
          "lockedBy" = NULL, "lockedUntil" = NULL, "updatedAt" = clock_timestamp()
      WHERE "id" = ${event.id} AND "lockedBy" = ${event.lockedBy}
        AND "state" = 'retrying' AND "lockedUntil" > clock_timestamp()
    `,
    );
    return count === 1;
  }

  async markRetry(event: ClaimedOutboxEvent): Promise<boolean> {
    const count = await this.tenants.workerScoped(
      (tx) => tx.$executeRaw`
      UPDATE "OutboxEvent"
      SET "state" = 'retrying', "lastErrorCode" = 'queue_unavailable',
          "lockedBy" = NULL, "lockedUntil" = NULL,
          "nextAttemptAt" = clock_timestamp() + (${this.config.queueBackoffMs} * interval '1 millisecond'),
          "updatedAt" = clock_timestamp()
      WHERE "id" = ${event.id} AND "lockedBy" = ${event.lockedBy}
        AND "state" = 'retrying' AND "lockedUntil" > clock_timestamp()
    `,
    );
    return count === 1;
  }

  async markDeadLetter(
    event: ClaimedOutboxEvent,
    code: OutboxFailureCode = 'queue_unavailable',
  ): Promise<boolean> {
    return this.tenants.workerScoped(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; organizationId: string | null }[]
      >`
        UPDATE "OutboxEvent"
        SET "state" = 'dead_lettered', "lastErrorCode" = ${code},
            "lockedBy" = NULL, "lockedUntil" = NULL, "updatedAt" = clock_timestamp()
        WHERE "id" = ${event.id} AND "lockedBy" = ${event.lockedBy}
          AND "state" = 'retrying' AND "lockedUntil" > clock_timestamp()
        RETURNING "id", "organizationId"
      `;
      for (const row of rows) await this.appendDeadLetter(tx, row, code);
      return rows.length === 1;
    });
  }

  /** Separate bounded recovery prevents final-claim crashes from stranding intent. */
  recoverExhausted(): Promise<number> {
    return this.tenants.workerScoped(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; organizationId: string | null }[]
      >`
        WITH candidates AS MATERIALIZED (
          SELECT "id" FROM "OutboxEvent"
          WHERE "state" IN ('pending', 'retrying') AND "attempts" >= "maxAttempts"
            AND ("lockedUntil" IS NULL OR "lockedUntil" <= clock_timestamp())
          ORDER BY "createdAt", "id"
          LIMIT ${this.config.outboxClaimBatchSize}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "OutboxEvent" AS event
        SET "state" = 'dead_lettered', "lastErrorCode" = 'queue_unavailable',
            "lockedBy" = NULL, "lockedUntil" = NULL, "updatedAt" = clock_timestamp()
        FROM candidates WHERE event."id" = candidates."id"
        RETURNING event."id", event."organizationId"
      `;
      for (const row of rows)
        await this.appendDeadLetter(tx, row, 'queue_unavailable');
      return rows.length;
    });
  }

  private appendDeadLetter(
    tx: TenantTransactionClient,
    row: { id: string; organizationId: string | null },
    code: OutboxFailureCode,
  ) {
    // Never persist provider exceptions or unvalidated event payloads.
    return tx.jobDeadLetter.create({
      data: {
        organizationId: row.organizationId,
        outboxEventId: row.id,
        reasonCode: code,
        reasonMessage: OUTBOX_FAILURES[code],
      },
    });
  }
}
