import { Injectable, Optional } from '@nestjs/common';
import type { JobRunStatus, JobRunSummary } from '@acres/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';

const RECENT_RUN_LIMIT = 50;

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
    message?: string,
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
