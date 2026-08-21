import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AcresConfigService } from '../config/acres-config.service';
import { SessionsService } from '../sessions/sessions.service';
import { JobRunsService } from './job-runs.service';

export const SESSION_MAINTENANCE_JOB = 'sessions.purge-expired';

/**
 * The one scheduled job this step ships. It does real bookkeeping — expired
 * session rows can never authenticate anything again — and it proves the
 * scheduler, the `JobRun` table and the failure path are wired.
 *
 * Regional-data ingestion belongs here too, and deliberately does not exist
 * yet: no data provider has been chosen, and inventing one would put fake
 * regional intelligence in the database.
 *
 * `@nestjs/schedule` runs in-process, so every replica runs every job. Exactly
 * one instance may have `SCHEDULER_ENABLED=true` in production until a
 * distributed lock or a provider scheduler replaces it (docs/backend.md).
 */
@Injectable()
export class SessionMaintenanceJob {
  private readonly logger = new Logger(SessionMaintenanceJob.name);

  constructor(
    private readonly sessions: SessionsService,
    private readonly runs: JobRunsService,
    private readonly config: AcresConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: SESSION_MAINTENANCE_JOB })
  async purgeExpiredSessions(): Promise<void> {
    if (!this.config.schedulerEnabled) {
      return;
    }

    let runId: string;
    try {
      runId = await this.runs.start(SESSION_MAINTENANCE_JOB);
    } catch (error) {
      this.logger.error(
        `Could not record a job run; skipping this tick: ${describe(error)}`,
      );
      return;
    }

    try {
      const purged = await this.sessions.purgeExpired();
      await this.runs.finish(runId, 'succeeded', `purged ${purged} session(s)`);
      this.logger.log(`Purged ${purged} expired session(s)`);
    } catch (error) {
      const message = describe(error);
      this.logger.error(`Session purge failed: ${message}`);
      await this.runs
        .finish(runId, 'failed', message)
        .catch(() => this.logger.error('Could not record the failed job run'));
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
