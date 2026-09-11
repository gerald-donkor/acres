import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AcresConfigService } from '../config/acres-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';
import { JobRunsService } from './job-runs.service';

export const UPLOADS_RETENTION_JOB = 'uploads.purge-expired';
export const IDEMPOTENCY_RETENTION_JOB = 'idempotency.purge-expired';
export const TOKENS_RETENTION_JOB = 'tokens.purge-expired';
export const EXPORTS_RETENTION_JOB = 'exports.purge-expired';

/**
 * Stored on the durable `JobRun.message` row when a retention purge throws
 * unexpectedly. The original error is logged server-side only; durable message
 * columns must never carry raw exception text (database connection or
 * transaction internals).
 */
export const UPLOAD_PURGE_UNEXPECTED_FAILURE_MESSAGE =
  'Upload purge failed unexpectedly.';
export const IDEMPOTENCY_PURGE_UNEXPECTED_FAILURE_MESSAGE =
  'Idempotency purge failed unexpectedly.';
export const TOKEN_PURGE_UNEXPECTED_FAILURE_MESSAGE =
  'Token purge failed unexpectedly.';
export const EXPORT_PURGE_UNEXPECTED_FAILURE_MESSAGE =
  'Export purge failed unexpectedly.';

/**
 * Maximum expired export requests reclaimed per hourly tick. The next tick
 * repeats the bounded scan, so a backlog drains without an unbounded query.
 */
export const EXPORTS_PURGE_BATCH_LIMIT = 500;

/**
 * Scheduled maintenance jobs for data retention and garbage collection.
 * Executes strictly on the single instance with SCHEDULER_ENABLED=true.
 */
@Injectable()
export class RetentionMaintenanceJob {
  private readonly logger = new Logger(RetentionMaintenanceJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantTransactionService,
    private readonly runs: JobRunsService,
    private readonly config: AcresConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: UPLOADS_RETENTION_JOB })
  async purgeExpiredUploads(): Promise<void> {
    if (!this.config.schedulerEnabled) return;

    let runId: string;
    try {
      runId = await this.runs.start(UPLOADS_RETENTION_JOB);
    } catch (error) {
      this.logger.error(
        `Could not record job run for ${UPLOADS_RETENTION_JOB}: ${describe(error)}`,
      );
      return;
    }

    try {
      const now = new Date();
      const count = await this.tenants.workerScoped(async (tx) => {
        const expired = await tx.upload.findMany({
          where: {
            state: 'pending_upload',
            expiresAt: { lte: now },
          },
          select: { id: true, storedObjectId: true },
        });
        if (expired.length === 0) return 0;
        const uploadIds = expired.map((u) => u.id);
        const storedObjectIds = expired.map((u) => u.storedObjectId);

        await tx.upload.updateMany({
          where: { id: { in: uploadIds } },
          data: { state: 'expired' },
        });
        await tx.storedObject.updateMany({
          where: { id: { in: storedObjectIds }, state: 'pending_upload' },
          data: { state: 'deleted', deletedAt: now },
        });
        return expired.length;
      });

      await this.runs.finish(
        runId,
        'succeeded',
        `purged ${count} expired upload(s)`,
      );
      this.logger.log(`Purged ${count} expired upload(s)`);
    } catch (error) {
      const message = describe(error);
      this.logger.error(`Upload purge failed: ${message}`);
      await this.runs
        .finish(runId, 'failed', UPLOAD_PURGE_UNEXPECTED_FAILURE_MESSAGE)
        .catch(() => this.logger.error('Could not record failed job run'));
    }
  }

  @Cron(CronExpression.EVERY_HOUR, { name: IDEMPOTENCY_RETENTION_JOB })
  async purgeExpiredIdempotency(): Promise<void> {
    if (!this.config.schedulerEnabled) return;

    let runId: string;
    try {
      runId = await this.runs.start(IDEMPOTENCY_RETENTION_JOB);
    } catch (error) {
      this.logger.error(
        `Could not record job run for ${IDEMPOTENCY_RETENTION_JOB}: ${describe(error)}`,
      );
      return;
    }

    try {
      const now = new Date();
      const result = await this.prisma.idempotencyRecord.deleteMany({
        where: { expiresAt: { lte: now } },
      });
      const count = result.count;
      await this.runs.finish(
        runId,
        'succeeded',
        `purged ${count} expired idempotency record(s)`,
      );
      this.logger.log(`Purged ${count} expired idempotency record(s)`);
    } catch (error) {
      const message = describe(error);
      this.logger.error(`Idempotency purge failed: ${message}`);
      await this.runs
        .finish(runId, 'failed', IDEMPOTENCY_PURGE_UNEXPECTED_FAILURE_MESSAGE)
        .catch(() => this.logger.error('Could not record failed job run'));
    }
  }

  @Cron(CronExpression.EVERY_HOUR, { name: TOKENS_RETENTION_JOB })
  async purgeExpiredTokens(): Promise<void> {
    if (!this.config.schedulerEnabled) return;

    let runId: string;
    try {
      runId = await this.runs.start(TOKENS_RETENTION_JOB);
    } catch (error) {
      this.logger.error(
        `Could not record job run for ${TOKENS_RETENTION_JOB}: ${describe(error)}`,
      );
      return;
    }

    try {
      const now = new Date();
      const [tokenResult, invitationResult] = await this.prisma.$transaction([
        this.prisma.accountToken.deleteMany({
          where: { expiresAt: { lte: now } },
        }),
        this.prisma.invitation.deleteMany({
          where: { expiresAt: { lte: now } },
        }),
      ]);
      await this.runs.finish(
        runId,
        'succeeded',
        `purged ${tokenResult.count} token(s) and ${invitationResult.count} invitation(s)`,
      );
      this.logger.log(
        `Purged ${tokenResult.count} token(s) and ${invitationResult.count} invitation(s)`,
      );
    } catch (error) {
      const message = describe(error);
      this.logger.error(`Token purge failed: ${message}`);
      await this.runs
        .finish(runId, 'failed', TOKEN_PURGE_UNEXPECTED_FAILURE_MESSAGE)
        .catch(() => this.logger.error('Could not record failed job run'));
    }
  }

  @Cron(CronExpression.EVERY_HOUR, { name: EXPORTS_RETENTION_JOB })
  async purgeExpiredExports(): Promise<void> {
    if (!this.config.schedulerEnabled) return;

    let runId: string;
    try {
      runId = await this.runs.start(EXPORTS_RETENTION_JOB);
    } catch (error) {
      this.logger.error(
        `Could not record job run for ${EXPORTS_RETENTION_JOB}: ${describe(error)}`,
      );
      return;
    }

    try {
      const now = new Date();
      const count = await this.tenants.workerScoped(async (tx) => {
        // Oldest expiry first so a backlog drains in order, and only rows
        // that still hold an artifact: already-purged requests keep their
        // audit row forever and must fall out of every future scan.
        const expired = await tx.exportRequest.findMany({
          where: {
            status: 'succeeded',
            expiresAt: { lte: now },
            artifact: { isNot: null },
          },
          select: { id: true },
          orderBy: { expiresAt: 'asc' },
          take: EXPORTS_PURGE_BATCH_LIMIT,
        });
        if (expired.length === 0) return 0;
        const requestIds = expired.map((request) => request.id);
        const artifacts = await tx.exportArtifact.findMany({
          where: { exportRequestId: { in: requestIds } },
          select: { exportRequestId: true, storedObjectId: true },
        });
        // Export objects are created fresh per render
        // (reports.service worker completion writes one StoredObject per
        // ExportArtifact with no dedup or refcount), so a shared
        // storedObjectId is unexpected. Fail closed for that ID — skip it
        // and warn — rather than orphan a live download. The within-batch
        // count below catches collisions inside this tick; the follow-up
        // lookup catches an object still referenced by any artifact row
        // outside this batch (e.g. a live future-expiry download), so the
        // "never orphans" guarantee does not depend on batch boundaries.
        const objectUseCount = new Map<string, number>();
        for (const artifact of artifacts) {
          objectUseCount.set(
            artifact.storedObjectId,
            (objectUseCount.get(artifact.storedObjectId) ?? 0) + 1,
          );
        }
        const sharedObjectIds = new Set(
          [...objectUseCount]
            .filter(([, uses]) => uses > 1)
            .map(([objectId]) => objectId),
        );
        if (sharedObjectIds.size > 0) {
          this.logger.warn(
            `Skipping ${sharedObjectIds.size} shared export object(s): unexpected shared storedObjectId`,
          );
        }
        const reclaimable = artifacts.filter(
          (artifact) => !sharedObjectIds.has(artifact.storedObjectId),
        );
        const candidateRequestIds = [
          ...new Set(reclaimable.map((artifact) => artifact.exportRequestId)),
        ];
        const candidateObjectIds = [
          ...new Set(reclaimable.map((artifact) => artifact.storedObjectId)),
        ];
        let liveObjectIds = new Set<string>();
        if (candidateObjectIds.length > 0) {
          const liveReferences = await tx.exportArtifact.findMany({
            where: {
              storedObjectId: { in: candidateObjectIds },
              exportRequestId: { notIn: candidateRequestIds },
            },
            select: { storedObjectId: true },
          });
          liveObjectIds = new Set(
            liveReferences.map((reference) => reference.storedObjectId),
          );
          if (liveObjectIds.size > 0) {
            this.logger.warn(
              `Skipping ${liveObjectIds.size} export object(s) still referenced outside this purge batch`,
            );
          }
        }
        const finalReclaimable = reclaimable.filter(
          (artifact) => !liveObjectIds.has(artifact.storedObjectId),
        );
        // exportRequestId is @unique on ExportArtifact, so reclaimed request
        // count and reclaimed artifact count are the same number.
        const reclaimableRequestIds = [
          ...new Set(
            finalReclaimable.map((artifact) => artifact.exportRequestId),
          ),
        ];
        const objectIds = [
          ...new Set(
            finalReclaimable.map((artifact) => artifact.storedObjectId),
          ),
        ];
        if (reclaimableRequestIds.length > 0) {
          await tx.exportArtifact.deleteMany({
            where: { exportRequestId: { in: reclaimableRequestIds } },
          });
        }
        if (objectIds.length > 0) {
          await tx.storedObject.updateMany({
            where: { id: { in: objectIds }, state: 'accepted' },
            data: { state: 'deleted', deletedAt: now },
          });
        }
        // The ExportRequest audit rows are deliberately retained; only the
        // derived download bytes expire. A purged download fails closed on
        // the existing read path (artifact null -> NOT_FOUND).
        return reclaimableRequestIds.length;
      });

      await this.runs.finish(
        runId,
        'succeeded',
        `purged ${count} expired export artifact(s)`,
      );
      this.logger.log(`Purged ${count} expired export artifact(s)`);
    } catch (error) {
      const message = describe(error);
      this.logger.error(`Export purge failed: ${message}`);
      await this.runs
        .finish(runId, 'failed', EXPORT_PURGE_UNEXPECTED_FAILURE_MESSAGE)
        .catch(() => this.logger.error('Could not record failed job run'));
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
