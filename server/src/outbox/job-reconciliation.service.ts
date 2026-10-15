import { Injectable } from '@nestjs/common';
import { AcresConfigService } from '../config/acres-config.service';
import {
  Prisma,
  type DurableJob,
  type OutboxEvent,
} from '../generated/prisma/client';
import {
  TenantTransactionService,
  type TenantTransactionClient,
} from '../prisma/tenant-transaction.service';
import { parseQueueMessage } from '../queue/queue-message';
import { aggregateLedgerState } from '../worker/aggregate-ledger-state';
import { OUTBOX_FAILURES, type OutboxFailureCode } from './outbox.service';

export interface JobReconciliationResult {
  enabled: boolean;
  /** Selected rows; mutation counts below describe committed transitions only. */
  examined: number;
  rearmed: number;
  repaired: number;
  exhausted: number;
  rejected: number;
}

export const RECOVERY_EXHAUSTED_CODE = 'queue_recovery_exhausted';
export const RECOVERY_EXHAUSTED_MESSAGE =
  'Queue retention recovery attempts exhausted.';

/** Shared with real-database query-plan and exact-cutoff acceptance. */
export function reconciliationCandidates(staleMs: number, batchSize: number) {
  return Prisma.sql`
        WITH candidates AS MATERIALIZED (
          SELECT e."id" FROM "OutboxEvent" e
          JOIN "DurableJob" j ON j."deterministicKey" = e."eventType" || ':' || e."aggregateId"
          WHERE e."state" = 'dispatched' AND e."dispatchedAt" IS NOT NULL
            AND j."state" NOT IN ('succeeded', 'cancelled', 'dead_lettered')
            AND NOT COALESCE((j."state" = 'failed' AND j."organizationId" = e."organizationId" AND j."jobType" = e."eventType" AND (
              (e."eventType" = 'upload.completed' AND e."aggregateType" = 'Upload' AND j."uploadId" = e."aggregateId" AND EXISTS (SELECT 1 FROM "Upload" a WHERE a."id" = e."aggregateId" AND a."organizationId" = e."organizationId" AND a."state" = 'rejected')) OR
              (e."eventType" = 'ingestion.run' AND e."aggregateType" = 'IngestionRun' AND EXISTS (SELECT 1 FROM "IngestionRun" a WHERE a."id" = e."aggregateId" AND a."organizationId" = e."organizationId" AND a."uploadId" = j."uploadId" AND a."state" IN ('failed', 'validation_failed'))) OR
              (e."eventType" = 'export.requested' AND e."aggregateType" = 'ExportRequest' AND j."uploadId" IS NULL AND EXISTS (SELECT 1 FROM "ExportRequest" a WHERE a."id" = e."aggregateId" AND a."organizationId" = e."organizationId" AND a."status" = 'failed'))
            )), false)
            AND (j."leaseUntil" IS NULL OR j."leaseUntil" <= now())
            AND GREATEST(e."dispatchedAt", e."updatedAt", j."updatedAt", j."startedAt", j."finishedAt", j."leaseUntil") <= now() - (${staleMs} * interval '1 millisecond')
          ORDER BY e."createdAt", e."id"
          LIMIT ${batchSize}
          FOR UPDATE OF e SKIP LOCKED
        )
        SELECT e.* FROM "OutboxEvent" e JOIN candidates c ON c."id" = e."id"
        ORDER BY e."createdAt", e."id"
      `;
}

/** Database-only operation; the caller must separately await dispatch. */
@Injectable()
export class JobReconciliationService {
  constructor(
    private readonly tenants: TenantTransactionService,
    private readonly config: AcresConfigService,
  ) {}

  async reconcileOnce(): Promise<JobReconciliationResult> {
    const result: JobReconciliationResult = {
      enabled: this.config.queueProvider === 'vercel',
      examined: 0,
      rearmed: 0,
      repaired: 0,
      exhausted: 0,
      rejected: 0,
    };
    if (!result.enabled) return result;
    // Maximum validated inputs give 608,460,000 ms, safely inside JS integer range.
    const staleMs =
      this.config.vercelQueueRetentionSeconds * 1000 +
      this.config.jobLeaseMs +
      60000;
    return this.tenants.workerScoped(async (tx) => {
      // Lock order: ordered events, then one job, then its aggregate. SKIP LOCKED
      // on downstream locks avoids inversions with aggregate-first API commands.
      const events = await tx.$queryRaw<OutboxEvent[]>(
        reconciliationCandidates(staleMs, this.config.outboxClaimBatchSize),
      );
      result.examined = events.length;
      for (const event of events) {
        const jobs = await tx.$queryRaw<DurableJob[]>`
          SELECT * FROM "DurableJob" WHERE "deterministicKey" = ${`${event.eventType}:${event.aggregateId}`}
          FOR UPDATE SKIP LOCKED
        `;
        const job = jobs[0];
        if (!job) continue;
        // Recheck after acquiring the job: selection may have seen an old snapshot.
        const eligible = await tx.$queryRaw<{ id: string }[]>`
          SELECT j."id" FROM "DurableJob" j JOIN "OutboxEvent" e ON e."id" = ${event.id}
          WHERE j."id" = ${job.id} AND e."state" = 'dispatched' AND e."dispatchedAt" IS NOT NULL
            AND j."state" NOT IN ('succeeded', 'cancelled', 'dead_lettered')
            AND (j."leaseUntil" IS NULL OR j."leaseUntil" <= now())
            AND GREATEST(e."dispatchedAt", e."updatedAt", j."updatedAt", j."startedAt", j."finishedAt", j."leaseUntil") <= now() - (${staleMs} * interval '1 millisecond')
        `;
        if (!eligible.length) continue;
        let message: ReturnType<typeof parseQueueMessage>;
        try {
          message = parseQueueMessage({
            v: 1,
            jobName: event.eventType,
            id: event.aggregateId,
            outboxEventId: event.id,
          });
        } catch {
          await this.reject(tx, event, 'outbox_event_invalid');
          result.rejected++;
          continue;
        }
        const table =
          message.jobName === 'upload.completed'
            ? Prisma.sql`"Upload"`
            : message.jobName === 'ingestion.run'
              ? Prisma.sql`"IngestionRun"`
              : Prisma.sql`"ExportRequest"`;
        const expectedType =
          message.jobName === 'upload.completed'
            ? 'Upload'
            : message.jobName === 'ingestion.run'
              ? 'IngestionRun'
              : 'ExportRequest';
        const columns =
          message.jobName === 'export.requested'
            ? Prisma.sql`"organizationId", "status"`
            : message.jobName === 'ingestion.run'
              ? Prisma.sql`"organizationId", "uploadId", "state"`
              : Prisma.sql`"organizationId", "state"`;
        const aggregates = await tx.$queryRaw<
          {
            organizationId: string;
            uploadId?: string;
            state?: string;
            status?: string;
          }[]
        >(Prisma.sql`
          SELECT ${columns} FROM ${table} WHERE "id" = ${message.id} FOR UPDATE SKIP LOCKED
        `);
        if (!aggregates.length) {
          // Distinguish a busy aggregate (defer) from missing authority (reject).
          const exists = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT "id" FROM ${table} WHERE "id" = ${message.id}`,
          );
          if (exists.length) continue;
          await this.reject(tx, event, 'outbox_job_mismatch');
          result.rejected++;
          continue;
        }
        const aggregate = aggregates[0];
        const uploadId =
          message.jobName === 'upload.completed'
            ? message.id
            : message.jobName === 'ingestion.run'
              ? aggregate.uploadId
              : null;
        if (
          event.aggregateType !== expectedType ||
          aggregate.organizationId !== event.organizationId ||
          job.organizationId !== aggregate.organizationId ||
          job.jobType !== message.jobName ||
          job.uploadId !== uploadId
        ) {
          await this.reject(tx, event, 'outbox_job_mismatch');
          result.rejected++;
          continue;
        }
        const state = aggregateLedgerState(
          message.jobName,
          aggregate.state ?? aggregate.status ?? '',
        );
        if (state !== 'running') {
          if (job.state !== state) {
            await tx.$executeRaw`UPDATE "DurableJob" SET "state" = ${state}::"DurableJobState", "finishedAt" = COALESCE("finishedAt", now()), "leaseOwner" = NULL, "leaseUntil" = NULL, "updatedAt" = now() WHERE "id" = ${job.id}`;
            result.repaired++;
          }
          continue;
        }
        if (
          job.attempts >= job.maxAttempts ||
          event.attempts >= event.maxAttempts
        ) {
          await tx.$executeRaw`UPDATE "DurableJob" SET "state" = 'dead_lettered', "finishedAt" = COALESCE("finishedAt", now()), "leaseOwner" = NULL, "leaseUntil" = NULL, "updatedAt" = now() WHERE "id" = ${job.id}`;
          await tx.$executeRaw`UPDATE "OutboxEvent" SET "state" = 'dead_lettered', "lastErrorCode" = ${RECOVERY_EXHAUSTED_CODE}, "lockedBy" = NULL, "lockedUntil" = NULL, "updatedAt" = now() WHERE "id" = ${event.id}`;
          await tx.jobDeadLetter.create({
            data: {
              organizationId: event.organizationId,
              durableJobId: job.id,
              outboxEventId: event.id,
              reasonCode: RECOVERY_EXHAUSTED_CODE,
              reasonMessage: RECOVERY_EXHAUSTED_MESSAGE,
            },
          });
          result.exhausted++;
        } else {
          await tx.$executeRaw`UPDATE "OutboxEvent" SET "state" = 'pending', "nextAttemptAt" = now(), "lockedBy" = NULL, "lockedUntil" = NULL, "updatedAt" = now() WHERE "id" = ${event.id}`;
          result.rearmed++;
        }
      }
      // No result escapes unless the enclosing transaction commits.
      return result;
    });
  }

  private async reject(
    tx: TenantTransactionClient,
    event: OutboxEvent,
    code: OutboxFailureCode,
  ) {
    await tx.$executeRaw`UPDATE "OutboxEvent" SET "state" = 'dead_lettered', "lastErrorCode" = ${code}, "lockedBy" = NULL, "lockedUntil" = NULL, "updatedAt" = now() WHERE "id" = ${event.id}`;
    await tx.jobDeadLetter.create({
      data: {
        organizationId: event.organizationId,
        outboxEventId: event.id,
        reasonCode: code,
        reasonMessage: OUTBOX_FAILURES[code],
      },
    });
  }
}
