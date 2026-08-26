import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AcresConfigService } from '../config/acres-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { JobRunsService } from './job-runs.service';

export const UPLOADS_RETENTION_JOB = 'uploads.purge-expired';
export const IDEMPOTENCY_RETENTION_JOB = 'idempotency.purge-expired';
export const TOKENS_RETENTION_JOB = 'tokens.purge-expired';

/**
 * Scheduled maintenance jobs for data retention and garbage collection.
 * Executes strictly on the single instance with SCHEDULER_ENABLED=true.
 */
@Injectable()
export class RetentionMaintenanceJob {
  private readonly logger = new Logger(RetentionMaintenanceJob.name);

  constructor(
    private readonly prisma: PrismaService,
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
      const count = await this.prisma.$transaction(async (tx) => {
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
        .finish(runId, 'failed', message)
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
        .finish(runId, 'failed', message)
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
        .finish(runId, 'failed', message)
        .catch(() => this.logger.error('Could not record failed job run'));
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
