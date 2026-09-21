import type { ScheduledJobName } from '@acres/shared';
import type { PrismaService } from '../prisma/prisma.service';
import type { MetricsService } from '../metrics/metrics.service';
import {
  JobRunsService,
  SESSION_PURGE_UNEXPECTED_FAILURE_MESSAGE,
} from './job-runs.service';

describe('JobRunsService', () => {
  let prisma: {
    jobRun: {
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let metrics: {
    recordJobRun: jest.Mock;
  };
  let service: JobRunsService;

  beforeEach(() => {
    prisma = {
      jobRun: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
    };
    metrics = {
      recordJobRun: jest.fn(),
    };
    service = new JobRunsService(
      prisma as unknown as PrismaService,
      metrics as unknown as MetricsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('start', () => {
    it('calls prisma.jobRun.create with jobName and status running, selects id, and records metric', async () => {
      const jobName: ScheduledJobName = 'sessions.purge-expired';
      prisma.jobRun.create.mockResolvedValue({ id: 'run-uuid-1' });

      const runId = await service.start(jobName);

      expect(prisma.jobRun.create).toHaveBeenCalledTimes(1);
      expect(prisma.jobRun.create).toHaveBeenCalledWith({
        data: { jobName, status: 'running' },
        select: { id: true },
      });
      expect(metrics.recordJobRun).toHaveBeenCalledTimes(1);
      expect(metrics.recordJobRun).toHaveBeenCalledWith(jobName, 'running');
      expect(runId).toBe('run-uuid-1');
    });

    it('works when metrics is omitted/undefined (optional dependency)', async () => {
      const serviceWithoutMetrics = new JobRunsService(
        prisma as unknown as PrismaService,
      );
      const jobName: ScheduledJobName = 'uploads.purge-expired';
      prisma.jobRun.create.mockResolvedValue({ id: 'run-uuid-2' });

      const runId = await serviceWithoutMetrics.start(jobName);

      expect(prisma.jobRun.create).toHaveBeenCalledWith({
        data: { jobName, status: 'running' },
        select: { id: true },
      });
      expect(metrics.recordJobRun).not.toHaveBeenCalled();
      expect(runId).toBe('run-uuid-2');
    });
  });

  describe('finish', () => {
    it('calls prisma.jobRun.update with id, status, finishedAt Date, and message', async () => {
      prisma.jobRun.update.mockResolvedValue({
        jobName: 'sessions.purge-expired',
      });

      await service.finish('run-uuid-1', 'succeeded', 'purged 4 session(s)');

      expect(prisma.jobRun.update).toHaveBeenCalledTimes(1);
      expect(prisma.jobRun.update).toHaveBeenCalledWith({
        where: { id: 'run-uuid-1' },
        data: {
          status: 'succeeded',
          finishedAt: expect.any(Date) as unknown,
          message: 'purged 4 session(s)',
        },
        select: { jobName: true },
      });
      expect(metrics.recordJobRun).toHaveBeenCalledTimes(1);
      expect(metrics.recordJobRun).toHaveBeenCalledWith(
        'sessions.purge-expired',
        'succeeded',
      );
    });

    it('sets message to null when message is not provided', async () => {
      prisma.jobRun.update.mockResolvedValue({
        jobName: 'idempotency.purge-expired',
      });

      await service.finish('run-uuid-1', 'succeeded');

      expect(prisma.jobRun.update).toHaveBeenCalledWith({
        where: { id: 'run-uuid-1' },
        data: {
          status: 'succeeded',
          finishedAt: expect.any(Date) as unknown,
          message: null,
        },
        select: { jobName: true },
      });
      expect(metrics.recordJobRun).toHaveBeenCalledWith(
        'idempotency.purge-expired',
        'succeeded',
      );
    });

    it('handles case when updated record has no jobName (does not call metrics)', async () => {
      prisma.jobRun.update.mockResolvedValue({ jobName: null });

      await service.finish(
        'run-uuid-1',
        'failed',
        SESSION_PURGE_UNEXPECTED_FAILURE_MESSAGE,
      );

      expect(prisma.jobRun.update).toHaveBeenCalledWith({
        where: { id: 'run-uuid-1' },
        data: {
          status: 'failed',
          finishedAt: expect.any(Date) as unknown,
          message: SESSION_PURGE_UNEXPECTED_FAILURE_MESSAGE,
        },
        select: { jobName: true },
      });
      expect(metrics.recordJobRun).not.toHaveBeenCalled();
    });

    it('handles case when updated record is null (does not call metrics)', async () => {
      prisma.jobRun.update.mockResolvedValue(null);

      await service.finish('run-uuid-1', 'failed');

      expect(metrics.recordJobRun).not.toHaveBeenCalled();
    });

    it('works when metrics is omitted/undefined (optional dependency)', async () => {
      const serviceWithoutMetrics = new JobRunsService(
        prisma as unknown as PrismaService,
      );
      prisma.jobRun.update.mockResolvedValue({
        jobName: 'tokens.purge-expired',
      });

      await expect(
        serviceWithoutMetrics.finish('run-uuid-1', 'succeeded'),
      ).resolves.toBeUndefined();

      expect(metrics.recordJobRun).not.toHaveBeenCalled();
    });
  });

  describe('listRecent', () => {
    it('calls prisma.jobRun.findMany with default take of 50 and ordered by startedAt desc', async () => {
      prisma.jobRun.findMany.mockResolvedValue([]);

      const result = await service.listRecent();

      expect(prisma.jobRun.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.jobRun.findMany).toHaveBeenCalledWith({
        orderBy: { startedAt: 'desc' },
        take: 50,
      });
      expect(result).toEqual([]);
    });

    it('respects custom limit argument when provided', async () => {
      prisma.jobRun.findMany.mockResolvedValue([]);

      await service.listRecent(15);

      expect(prisma.jobRun.findMany).toHaveBeenCalledWith({
        orderBy: { startedAt: 'desc' },
        take: 15,
      });
    });

    it('formats records into JobRunSummary[] with ISO strings for dates and null for unfinished runs', async () => {
      const startedAt1 = new Date('2026-09-20T10:00:00.000Z');
      const finishedAt1 = new Date('2026-09-20T10:02:30.000Z');
      const startedAt2 = new Date('2026-09-20T11:00:00.000Z');

      prisma.jobRun.findMany.mockResolvedValue([
        {
          id: 'run-1',
          jobName: 'sessions.purge-expired',
          status: 'succeeded',
          startedAt: startedAt1,
          finishedAt: finishedAt1,
          message: 'purged 10 session(s)',
        },
        {
          id: 'run-2',
          jobName: 'uploads.purge-expired',
          status: 'running',
          startedAt: startedAt2,
          finishedAt: null,
          message: null,
        },
      ]);

      const result = await service.listRecent();

      expect(result).toEqual([
        {
          id: 'run-1',
          jobName: 'sessions.purge-expired',
          status: 'succeeded',
          startedAt: '2026-09-20T10:00:00.000Z',
          finishedAt: '2026-09-20T10:02:30.000Z',
          message: 'purged 10 session(s)',
        },
        {
          id: 'run-2',
          jobName: 'uploads.purge-expired',
          status: 'running',
          startedAt: '2026-09-20T11:00:00.000Z',
          finishedAt: null,
          message: null,
        },
      ]);
    });
  });
});
