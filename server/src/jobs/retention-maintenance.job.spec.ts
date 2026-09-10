import {
  RetentionMaintenanceJob,
  UPLOADS_RETENTION_JOB,
  IDEMPOTENCY_RETENTION_JOB,
  TOKENS_RETENTION_JOB,
  EXPORTS_RETENTION_JOB,
  EXPORTS_PURGE_BATCH_LIMIT,
} from './retention-maintenance.job';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantTransactionService } from '../prisma/tenant-transaction.service';
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
  let fakeTenants: Partial<TenantTransactionService>;

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
    fakeTenants = {
      workerScoped: jest.fn(),
    };
  });

  describe('scheduler disabled', () => {
    it('skips execution when scheduler is disabled', async () => {
      config.schedulerEnabled = false;
      const prisma = {} as unknown as PrismaService;
      const job = new RetentionMaintenanceJob(
        prisma,
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );

      await job.purgeExpiredUploads();
      await job.purgeExpiredIdempotency();
      await job.purgeExpiredTokens();
      await job.purgeExpiredExports();
      expect(runs.start).not.toHaveBeenCalled();
    });
  });

  describe('job runs recording error', () => {
    it('aborts gracefully when runs.start throws', async () => {
      runs.start.mockRejectedValueOnce(new Error('Job run start failed'));
      const prisma = {} as unknown as PrismaService;
      const job = new RetentionMaintenanceJob(
        prisma,
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );

      await job.purgeExpiredUploads();
      expect(fakeTenants.workerScoped).not.toHaveBeenCalled();
      expect(runs.finish).not.toHaveBeenCalled();
    });
  });

  describe('purgeExpiredUploads', () => {
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
      (fakeTenants.workerScoped as jest.Mock).mockImplementation(
        (callback: (arg: typeof tx) => unknown) => callback(tx),
      );
      const prisma = {} as unknown as PrismaService;
      const job = new RetentionMaintenanceJob(
        prisma,
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );

      await job.purgeExpiredUploads();
      expect(runs.start).toHaveBeenCalledWith(UPLOADS_RETENTION_JOB);
      expect(tx.upload.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['up-1'] } },
        data: { state: 'expired' },
      });
      expect(tx.storedObject.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['obj-1'] }, state: 'pending_upload' },
        data: expect.objectContaining({ state: 'deleted' }) as unknown,
      });
      const updateCalls = tx.storedObject.updateMany.mock.calls as unknown as [
        [{ data: { deletedAt: Date } }],
      ];
      expect(updateCalls[0][0].data.deletedAt).toBeInstanceOf(Date);
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'succeeded',
        expect.stringContaining('purged 1 expired upload(s)'),
      );
    });

    it('handles zero expired uploads without calling updateMany', async () => {
      const tx = {
        upload: {
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn(),
        },
        storedObject: {
          updateMany: jest.fn(),
        },
      };
      (fakeTenants.workerScoped as jest.Mock).mockImplementation(
        (callback: (arg: typeof tx) => unknown) => callback(tx),
      );
      const prisma = {} as unknown as PrismaService;
      const job = new RetentionMaintenanceJob(
        prisma,
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );

      await job.purgeExpiredUploads();
      expect(tx.upload.updateMany).not.toHaveBeenCalled();
      expect(tx.storedObject.updateMany).not.toHaveBeenCalled();
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'succeeded',
        expect.stringContaining('purged 0 expired upload(s)'),
      );
    });

    it('records failed job run when database transaction throws', async () => {
      (fakeTenants.workerScoped as jest.Mock).mockRejectedValueOnce(
        new Error('DB deadlock'),
      );
      const prisma = {} as unknown as PrismaService;
      const job = new RetentionMaintenanceJob(
        prisma,
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );

      await job.purgeExpiredUploads();
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'failed',
        'DB deadlock',
      );
    });
  });

  describe('purgeExpiredIdempotency', () => {
    it('purges expired idempotency records', async () => {
      const prisma = {
        idempotencyRecord: {
          deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
        },
      };
      const job = new RetentionMaintenanceJob(
        prisma as unknown as PrismaService,
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );

      await job.purgeExpiredIdempotency();
      expect(runs.start).toHaveBeenCalledWith(IDEMPOTENCY_RETENTION_JOB);
      expect(prisma.idempotencyRecord.deleteMany).toHaveBeenCalled();
      const deleteCalls = prisma.idempotencyRecord.deleteMany.mock
        .calls as unknown as [[{ where: { expiresAt: { lte: Date } } }]];
      expect(deleteCalls[0][0].where.expiresAt.lte).toBeInstanceOf(Date);
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'succeeded',
        expect.stringContaining('purged 5 expired idempotency record(s)'),
      );
    });

    it('records failed job run when idempotency delete throws', async () => {
      const prisma = {
        idempotencyRecord: {
          deleteMany: jest
            .fn()
            .mockRejectedValueOnce(new Error('Connection lost')),
        },
      };
      const job = new RetentionMaintenanceJob(
        prisma as unknown as PrismaService,
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );

      await job.purgeExpiredIdempotency();
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'failed',
        'Connection lost',
      );
    });
  });

  describe('purgeExpiredTokens', () => {
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
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );

      await job.purgeExpiredTokens();
      expect(runs.start).toHaveBeenCalledWith(TOKENS_RETENTION_JOB);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'succeeded',
        expect.stringContaining('purged 2 token(s) and 3 invitation(s)'),
      );
    });

    it('records failed job run when token delete transaction throws', async () => {
      const prisma = {
        accountToken: {
          deleteMany: jest.fn().mockReturnValue(Promise.resolve({ count: 2 })),
        },
        invitation: {
          deleteMany: jest.fn().mockReturnValue(Promise.resolve({ count: 3 })),
        },
        $transaction: jest.fn().mockRejectedValueOnce(new Error('Tx rollback')),
      };
      const job = new RetentionMaintenanceJob(
        prisma as unknown as PrismaService,
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );

      await job.purgeExpiredTokens();
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'failed',
        'Tx rollback',
      );
    });
  });

  describe('purgeExpiredExports', () => {
    function buildExportTx(overrides?: {
      requests?: { id: string }[];
      artifacts?: { exportRequestId: string; storedObjectId: string }[];
      liveRefs?: { storedObjectId: string }[];
    }) {
      return {
        exportRequest: {
          findMany: jest.fn().mockResolvedValue(overrides?.requests ?? []),
          deleteMany: jest.fn(),
          updateMany: jest.fn(),
        },
        exportArtifact: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce(overrides?.artifacts ?? [])
            .mockResolvedValue(overrides?.liveRefs ?? []),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        storedObject: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
    }

    function buildExportJob(tx: ReturnType<typeof buildExportTx>) {
      (fakeTenants.workerScoped as jest.Mock).mockImplementation(
        (callback: (arg: typeof tx) => unknown) => callback(tx),
      );
      const prisma = {} as unknown as PrismaService;
      return new RetentionMaintenanceJob(
        prisma,
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );
    }

    it('purges expired succeeded exports and preserves the request audit row', async () => {
      const tx = buildExportTx({
        requests: [{ id: 'exp-1' }],
        artifacts: [{ exportRequestId: 'exp-1', storedObjectId: 'obj-1' }],
      });
      const job = buildExportJob(tx);

      await job.purgeExpiredExports();

      expect(runs.start).toHaveBeenCalledWith(EXPORTS_RETENTION_JOB);
      expect(tx.exportRequest.findMany).toHaveBeenCalledTimes(1);
      const findCalls = tx.exportRequest.findMany.mock.calls as unknown as [
        [
          {
            where: {
              status: string;
              expiresAt: { lte: Date };
              artifact: { isNot: null };
            };
            select: { id: boolean };
            orderBy: { expiresAt: string };
            take: number;
          },
        ],
      ];
      expect(findCalls[0][0].where.status).toBe('succeeded');
      expect(findCalls[0][0].where.expiresAt.lte).toBeInstanceOf(Date);
      expect(findCalls[0][0].where.artifact).toEqual({ isNot: null });
      expect(findCalls[0][0].select).toEqual({ id: true });
      expect(findCalls[0][0].orderBy).toEqual({ expiresAt: 'asc' });
      expect(findCalls[0][0].take).toBe(EXPORTS_PURGE_BATCH_LIMIT);
      expect(tx.exportArtifact.deleteMany).toHaveBeenCalledWith({
        where: { exportRequestId: { in: ['exp-1'] } },
      });
      expect(tx.storedObject.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['obj-1'] }, state: 'accepted' },
        data: expect.objectContaining({ state: 'deleted' }) as unknown,
      });
      const updateCalls = tx.storedObject.updateMany.mock.calls as unknown as [
        [{ data: { deletedAt: Date } }],
      ];
      expect(updateCalls[0][0].data.deletedAt).toBeInstanceOf(Date);
      expect(tx.exportRequest.deleteMany).not.toHaveBeenCalled();
      expect(tx.exportRequest.updateMany).not.toHaveBeenCalled();
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'succeeded',
        expect.stringContaining('purged 1 expired export artifact(s)'),
      );
    });

    it('selects only succeeded rows with a past expiry', async () => {
      const tx = buildExportTx();
      const job = buildExportJob(tx);

      await job.purgeExpiredExports();

      // failed/cancelled/queued/running rows carry NULL expiresAt and never
      // match `expiresAt: { lte: now }`; succeeded rows with NULL or future
      // expiry never match either. The status predicate is the guard.
      const findCalls = tx.exportRequest.findMany.mock.calls as unknown as [
        [{ where: { status: string; expiresAt: { lte: Date } } }],
      ];
      expect(findCalls[0][0].where.status).toBe('succeeded');
      expect(findCalls[0][0].where.expiresAt.lte).toBeInstanceOf(Date);
      expect(tx.exportArtifact.deleteMany).not.toHaveBeenCalled();
      expect(tx.storedObject.updateMany).not.toHaveBeenCalled();
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'succeeded',
        expect.stringContaining('purged 0 expired export artifact(s)'),
      );
    });

    it('bounds each tick to the documented batch limit', async () => {
      const tx = buildExportTx({ requests: [{ id: 'exp-1' }] });
      const job = buildExportJob(tx);

      await job.purgeExpiredExports();

      const findCalls = tx.exportRequest.findMany.mock.calls as unknown as [
        [{ take: number }],
      ];
      expect(findCalls[0][0].take).toBe(500);
      expect(EXPORTS_PURGE_BATCH_LIMIT).toBe(500);
    });

    it('skips shared stored objects fail-closed without orphaning downloads', async () => {
      const tx = buildExportTx({
        requests: [{ id: 'exp-a' }, { id: 'exp-b' }],
        artifacts: [
          { exportRequestId: 'exp-a', storedObjectId: 'obj-shared' },
          { exportRequestId: 'exp-b', storedObjectId: 'obj-shared' },
        ],
      });
      const job = buildExportJob(tx);

      await job.purgeExpiredExports();

      expect(tx.exportArtifact.deleteMany).not.toHaveBeenCalled();
      expect(tx.storedObject.updateMany).not.toHaveBeenCalled();
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'succeeded',
        expect.stringContaining('purged 0 expired export artifact(s)'),
      );
    });

    it('skips objects still referenced outside the batch without orphaning downloads', async () => {
      const tx = buildExportTx({
        requests: [{ id: 'exp-1' }, { id: 'exp-2' }],
        artifacts: [
          { exportRequestId: 'exp-1', storedObjectId: 'obj-live' },
          { exportRequestId: 'exp-2', storedObjectId: 'obj-free' },
        ],
        liveRefs: [{ storedObjectId: 'obj-live' }],
      });
      const job = buildExportJob(tx);

      await job.purgeExpiredExports();

      expect(tx.exportArtifact.deleteMany).toHaveBeenCalledTimes(1);
      expect(tx.exportArtifact.deleteMany).toHaveBeenCalledWith({
        where: { exportRequestId: { in: ['exp-2'] } },
      });
      expect(tx.storedObject.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['obj-free'] }, state: 'accepted' },
        data: expect.objectContaining({ state: 'deleted' }) as unknown,
      });
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'succeeded',
        expect.stringContaining('purged 1 expired export artifact(s)'),
      );
    });

    it('records failed job run when the export transaction throws', async () => {
      (fakeTenants.workerScoped as jest.Mock).mockRejectedValueOnce(
        new Error('DB deadlock'),
      );
      const prisma = {} as unknown as PrismaService;
      const job = new RetentionMaintenanceJob(
        prisma,
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );

      await job.purgeExpiredExports();

      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'failed',
        'DB deadlock',
      );
    });
  });
});
