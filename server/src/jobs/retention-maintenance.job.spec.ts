import {
  RetentionMaintenanceJob,
  UPLOADS_RETENTION_JOB,
  IDEMPOTENCY_RETENTION_JOB,
  TOKENS_RETENTION_JOB,
} from './retention-maintenance.job';
import type { PrismaService } from '../prisma/prisma.service';
import type { JobRunsService } from './job-runs.service';
import type { AcresConfigService } from '../config/acres-config.service';

describe('RetentionMaintenanceJob', () => {
  let runs: {
    start: jest.Mock<Promise<string>, [string]>;
    finish: jest.Mock<
      Promise<void>,
      [string, 'succeeded' | 'failed', string | undefined]
    >;
  };
  let config: { schedulerEnabled: boolean };

  beforeEach(() => {
    config = { schedulerEnabled: true };
    runs = {
      start: jest.fn<Promise<string>, [string]>().mockResolvedValue('run-123'),
      finish: jest
        .fn<
          Promise<void>,
          [string, 'succeeded' | 'failed', string | undefined]
        >()
        .mockResolvedValue(undefined),
    };
  });

  it('skips execution when scheduler is disabled', async () => {
    config.schedulerEnabled = false;
    const prisma = {} as unknown as PrismaService;
    const job = new RetentionMaintenanceJob(
      prisma,
      runs as unknown as JobRunsService,
      config as unknown as AcresConfigService,
    );

    await job.purgeExpiredUploads();
    await job.purgeExpiredIdempotency();
    await job.purgeExpiredTokens();
    expect(runs.start).not.toHaveBeenCalled();
  });

  it('purges expired uploads and records successful job run', async () => {
    const tx = {
      upload: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'up-1', storedObjectId: 'obj-1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      storedObject: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (arg: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const job = new RetentionMaintenanceJob(
      prisma as unknown as PrismaService,
      runs as unknown as JobRunsService,
      config as unknown as AcresConfigService,
    );

    await job.purgeExpiredUploads();
    expect(runs.start).toHaveBeenCalledWith(UPLOADS_RETENTION_JOB);
    expect(runs.finish).toHaveBeenCalledWith(
      'run-123',
      'succeeded',
      expect.stringContaining('purged 1 expired upload(s)'),
    );
  });

  it('purges expired idempotency records', async () => {
    const prisma = {
      idempotencyRecord: {
        deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
      },
    };
    const job = new RetentionMaintenanceJob(
      prisma as unknown as PrismaService,
      runs as unknown as JobRunsService,
      config as unknown as AcresConfigService,
    );

    await job.purgeExpiredIdempotency();
    expect(runs.start).toHaveBeenCalledWith(IDEMPOTENCY_RETENTION_JOB);
    expect(runs.finish).toHaveBeenCalledWith(
      'run-123',
      'succeeded',
      expect.stringContaining('purged 5 expired idempotency record(s)'),
    );
  });

  it('purges expired tokens and invitations', async () => {
    const prisma = {
      accountToken: {
        deleteMany: jest.fn().mockReturnValue(Promise.resolve({ count: 2 })),
      },
      invitation: {
        deleteMany: jest.fn().mockReturnValue(Promise.resolve({ count: 3 })),
      },
      $transaction: jest
        .fn()
        .mockImplementation((promises: Promise<unknown>[]) =>
          Promise.all(promises),
        ),
    };
    const job = new RetentionMaintenanceJob(
      prisma as unknown as PrismaService,
      runs as unknown as JobRunsService,
      config as unknown as AcresConfigService,
    );

    await job.purgeExpiredTokens();
    expect(runs.start).toHaveBeenCalledWith(TOKENS_RETENTION_JOB);
    expect(runs.finish).toHaveBeenCalledWith(
      'run-123',
      'succeeded',
      expect.stringContaining('purged 2 token(s) and 3 invitation(s)'),
    );
  });
});
