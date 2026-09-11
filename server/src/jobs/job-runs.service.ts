import { Injectable, Optional } from '@nestjs/common';
import type { JobRunStatus, JobRunSummary } from '@acres/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';

const RECENT_RUN_LIMIT = 50;

/**
 * Each of the following constants is stored on the durable `JobRun.message`
 * row when a scheduled purge throws unexpectedly. The original error is
 * logged server-side only; durable message columns must never carry raw
 * exception text (database connection or transaction internals).
 */
export const SESSION_PURGE_UNEXPECTED_FAILURE_MESSAGE =
  'Session purge failed unexpectedly.' as const;
export const UPLOAD_PURGE_UNEXPECTED_FAILURE_MESSAGE =
  'Upload purge failed unexpectedly.' as const;
export const IDEMPOTENCY_PURGE_UNEXPECTED_FAILURE_MESSAGE =
  'Idempotency purge failed unexpectedly.' as const;
export const TOKEN_PURGE_UNEXPECTED_FAILURE_MESSAGE =
  'Token purge failed unexpectedly.' as const;
export const EXPORT_PURGE_UNEXPECTED_FAILURE_MESSAGE =
  'Export purge failed unexpectedly.' as const;

export type JobRunMessage =
  | `purged ${number} session(s)`
  | `purged ${number} expired upload(s)`
  | `purged ${number} expired idempotency record(s)`
  | `purged ${number} token(s) and ${number} invitation(s)`
  | `purged ${number} expired export artifact(s)`
  | typeof SESSION_PURGE_UNEXPECTED_FAILURE_MESSAGE
  | typeof UPLOAD_PURGE_UNEXPECTED_FAILURE_MESSAGE
  | typeof IDEMPOTENCY_PURGE_UNEXPECTED_FAILURE_MESSAGE
  | typeof TOKEN_PURGE_UNEXPECTED_FAILURE_MESSAGE
  | typeof EXPORT_PURGE_UNEXPECTED_FAILURE_MESSAGE;

@Injectable()
export class JobRunsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async start(jobName: string): Promise<string> {
    const run = await this.prisma.jobRun.create({
      data: { jobName, status: 'running' },
      select: { id: true },
    });
    this.metrics?.recordJobRun(jobName, 'running');
    return run.id;
  }

  async finish(
    id: string,
    status: Exclude<JobRunStatus, 'running'>,
    message?: JobRunMessage,
  ): Promise<void> {
    const updated = await this.prisma.jobRun.update({
      where: { id },
      data: { status, finishedAt: new Date(), message: message ?? null },
      select: { jobName: true },
    });
    if (updated?.jobName) {
      this.metrics?.recordJobRun(updated.jobName, status);
    }
  }

  async listRecent(limit = RECENT_RUN_LIMIT): Promise<JobRunSummary[]> {
    const runs = await this.prisma.jobRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    return runs.map((run) => ({
      id: run.id,
      jobName: run.jobName,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      message: run.message,
    }));
  }
}
