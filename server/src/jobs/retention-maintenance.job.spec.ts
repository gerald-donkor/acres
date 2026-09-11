import { Logger } from '@nestjs/common';
import {
  RetentionMaintenanceJob,
  UPLOADS_RETENTION_JOB,
  IDEMPOTENCY_RETENTION_JOB,
  TOKENS_RETENTION_JOB,
  EXPORTS_RETENTION_JOB,
  RETENTION_PURGE_BATCH_LIMIT,
  UPLOAD_PURGE_UNEXPECTED_FAILURE_MESSAGE,
  IDEMPOTENCY_PURGE_UNEXPECTED_FAILURE_MESSAGE,
  TOKEN_PURGE_UNEXPECTED_FAILURE_MESSAGE,
  EXPORT_PURGE_UNEXPECTED_FAILURE_MESSAGE,
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
      expect(tx.upload.findMany).toHaveBeenCalledTimes(1);
      const findCalls = tx.upload.findMany.mock.calls as unknown as [
        [{ orderBy: { expiresAt: string }; take: number }],
      ];
      expect(findCalls[0][0].orderBy).toEqual({ expiresAt: 'asc' });
      expect(findCalls[0][0].take).toBe(RETENTION_PURGE_BATCH_LIMIT);
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

    it('records a fixed message when the database transaction throws', async () => {
      (fakeTenants.workerScoped as jest.Mock).mockRejectedValueOnce(
        new Error(
          'DB deadlock on connection postgres://acres:secret@db:5432/acres for key uploads/upload-1',
        ),
      );
      const prisma = {} as unknown as PrismaService;
      const job = new RetentionMaintenanceJob(
        prisma,
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );
      const loggerError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      try {
        await job.purgeExpiredUploads();
        expect(runs.finish).toHaveBeenCalledWith(
          'run-123',
          'failed',
          UPLOAD_PURGE_UNEXPECTED_FAILURE_MESSAGE,
        );
        const stored = runs.finish.mock.calls[0][2] as string;
        expect(stored).not.toContain('postgres://');
        expect(stored).not.toContain('uploads/upload-1');
        expect(loggerError).toHaveBeenCalled();
        expect(String(loggerError.mock.calls[0][0])).toContain('DB deadlock');
      } finally {
        loggerError.mockRestore();
      }
    });

    it('records the same fixed message for a non-Error upload throw', async () => {
      (fakeTenants.workerScoped as jest.Mock).mockRejectedValueOnce('boom');
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
        UPLOAD_PURGE_UNEXPECTED_FAILURE_MESSAGE,
      );
    });

    it('bounds each upload tick to the documented batch limit', async () => {
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

      const findCalls = tx.upload.findMany.mock.calls as unknown as [
        [{ take: number; orderBy: { expiresAt: string } }],
      ];
      expect(findCalls[0][0].take).toBe(500);
      expect(findCalls[0][0].orderBy).toEqual({ expiresAt: 'asc' });
      expect(RETENTION_PURGE_BATCH_LIMIT).toBe(500);
    });

    it('reports purged 500 when a 600-row upload backlog drains across ticks', async () => {
      const backlog = Array.from({ length: 500 }, (_, i) => ({
        id: `up-${i}`,
        storedObjectId: `obj-${i}`,
      }));
      const tx = {
        upload: {
          findMany: jest.fn().mockResolvedValue(backlog),
          updateMany: jest.fn().mockResolvedValue({ count: 500 }),
        },
        storedObject: {
          updateMany: jest.fn().mockResolvedValue({ count: 500 }),
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

      // 600 expired rows exist but the tick selects 500 oldest-first; the
      // remaining 100 drain on the next tick.
      expect(tx.upload.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { expiresAt: 'asc' },
          take: 500,
        }),
      );
      expect(tx.upload.updateMany).toHaveBeenCalledWith({
        where: { id: { in: backlog.map((row) => row.id) } },
        data: { state: 'expired' },
      });
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'succeeded',
        expect.stringContaining('purged 500 expired upload(s)'),
      );
    });
  });

  describe('purgeExpiredIdempotency', () => {
    it('purges expired idempotency records', async () => {
      const prisma = {
        idempotencyRecord: {
          findMany: jest
            .fn()
            .mockResolvedValue(
              Array.from({ length: 5 }, (_, i) => ({ id: `idem-${i}` })),
            ),
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
      expect(prisma.idempotencyRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { expiresAt: 'asc' },
          take: RETENTION_PURGE_BATCH_LIMIT,
        }),
      );
      const findCalls = prisma.idempotencyRecord.findMany.mock
        .calls as unknown as [[{ where: { expiresAt: { lte: Date } } }]];
      expect(findCalls[0][0].where.expiresAt.lte).toBeInstanceOf(Date);
      expect(prisma.idempotencyRecord.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['idem-0', 'idem-1', 'idem-2', 'idem-3', 'idem-4'] },
        },
      });
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'succeeded',
        expect.stringContaining('purged 5 expired idempotency record(s)'),
      );
    });

    it('handles zero expired idempotency records without calling deleteMany', async () => {
      const prisma = {
        idempotencyRecord: {
          findMany: jest.fn().mockResolvedValue([]),
          deleteMany: jest.fn(),
        },
      };
      const job = new RetentionMaintenanceJob(
        prisma as unknown as PrismaService,
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );

      await job.purgeExpiredIdempotency();

      expect(prisma.idempotencyRecord.deleteMany).not.toHaveBeenCalled();
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'succeeded',
        expect.stringContaining('purged 0 expired idempotency record(s)'),
      );
    });

    it('bounds each idempotency tick to the documented batch limit', async () => {
      const prisma = {
        idempotencyRecord: {
          findMany: jest.fn().mockResolvedValue([{ id: 'idem-1' }]),
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const job = new RetentionMaintenanceJob(
        prisma as unknown as PrismaService,
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );

      await job.purgeExpiredIdempotency();

      const findCalls = prisma.idempotencyRecord.findMany.mock
        .calls as unknown as [
        [{ take: number; orderBy: { expiresAt: string } }],
      ];
      expect(findCalls[0][0].take).toBe(500);
      expect(findCalls[0][0].orderBy).toEqual({ expiresAt: 'asc' });
      expect(RETENTION_PURGE_BATCH_LIMIT).toBe(500);
    });

    it('reports purged 500 when a 600-row idempotency backlog drains across ticks', async () => {
      const backlog = Array.from({ length: 500 }, (_, i) => ({
        id: `idem-${i}`,
      }));
      const prisma = {
        idempotencyRecord: {
          findMany: jest.fn().mockResolvedValue(backlog),
          deleteMany: jest.fn().mockResolvedValue({ count: 500 }),
        },
      };
      const job = new RetentionMaintenanceJob(
        prisma as unknown as PrismaService,
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );

      await job.purgeExpiredIdempotency();

      expect(prisma.idempotencyRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { expiresAt: 'asc' },
          take: 500,
        }),
      );
      expect(prisma.idempotencyRecord.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: backlog.map((row) => row.id) } },
      });
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'succeeded',
        expect.stringContaining('purged 500 expired idempotency record(s)'),
      );
    });

    it('records a fixed message when idempotency delete throws', async () => {
      const prisma = {
        idempotencyRecord: {
          findMany: jest.fn().mockResolvedValue([{ id: 'req-1' }]),
          deleteMany: jest
            .fn()
            .mockRejectedValueOnce(
              new Error(
                'Connection lost to postgres://acres:secret@db:5432/acres for key idempotency/req-1',
              ),
            ),
        },
      };
      const job = new RetentionMaintenanceJob(
        prisma as unknown as PrismaService,
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );
      const loggerError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      try {
        await job.purgeExpiredIdempotency();
        expect(runs.finish).toHaveBeenCalledWith(
          'run-123',
          'failed',
          IDEMPOTENCY_PURGE_UNEXPECTED_FAILURE_MESSAGE,
        );
        const stored = runs.finish.mock.calls[0][2] as string;
        expect(stored).not.toContain('postgres://');
        expect(stored).not.toContain('idempotency/req-1');
        expect(loggerError).toHaveBeenCalled();
        expect(String(loggerError.mock.calls[0][0])).toContain(
          'Connection lost',
        );
      } finally {
        loggerError.mockRestore();
      }
    });

    it('records the same fixed message for a non-Error idempotency throw', async () => {
      const prisma = {
        idempotencyRecord: {
          findMany: jest.fn().mockResolvedValue([{ id: 'req-1' }]),
          deleteMany: jest.fn().mockRejectedValueOnce('boom'),
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
        IDEMPOTENCY_PURGE_UNEXPECTED_FAILURE_MESSAGE,
      );
    });
  });

  describe('purgeExpiredTokens', () => {
    it('purges expired tokens and invitations', async () => {
      const prisma = {
        accountToken: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'tok-1' }, { id: 'tok-2' }]),
          deleteMany: jest.fn().mockReturnValue(Promise.resolve({ count: 2 })),
        },
        invitation: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: 'inv-1' },
              { id: 'inv-2' },
              { id: 'inv-3' },
            ]),
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
      expect(prisma.accountToken.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { expiresAt: 'asc' },
          take: RETENTION_PURGE_BATCH_LIMIT,
        }),
      );
      expect(prisma.invitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { expiresAt: 'asc' },
          take: RETENTION_PURGE_BATCH_LIMIT,
        }),
      );
      expect(prisma.accountToken.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['tok-1', 'tok-2'] } },
      });
      expect(prisma.invitation.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['inv-1', 'inv-2', 'inv-3'] } },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'succeeded',
        expect.stringContaining('purged 2 token(s) and 3 invitation(s)'),
      );
    });

    it('handles zero expired tokens without calling deletes or transaction', async () => {
      const prisma = {
        accountToken: {
          findMany: jest.fn().mockResolvedValue([]),
          deleteMany: jest.fn(),
        },
        invitation: {
          findMany: jest.fn().mockResolvedValue([]),
          deleteMany: jest.fn(),
        },
        $transaction: jest.fn(),
      };
      const job = new RetentionMaintenanceJob(
        prisma as unknown as PrismaService,
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );

      await job.purgeExpiredTokens();

      expect(prisma.accountToken.deleteMany).not.toHaveBeenCalled();
      expect(prisma.invitation.deleteMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'succeeded',
        expect.stringContaining('purged 0 token(s) and 0 invitation(s)'),
      );
    });

    it('skips the empty arm but still purges the other table', async () => {
      const prisma = {
        accountToken: {
          findMany: jest.fn().mockResolvedValue([]),
          deleteMany: jest.fn(),
        },
        invitation: {
          findMany: jest.fn().mockResolvedValue([{ id: 'inv-1' }]),
          deleteMany: jest.fn().mockReturnValue(Promise.resolve({ count: 1 })),
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

      expect(prisma.accountToken.deleteMany).not.toHaveBeenCalled();
      expect(prisma.invitation.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['inv-1'] } },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'succeeded',
        expect.stringContaining('purged 0 token(s) and 1 invitation(s)'),
      );
    });

    it('bounds each token tick to the documented batch limit', async () => {
      const prisma = {
        accountToken: {
          findMany: jest.fn().mockResolvedValue([{ id: 'tok-1' }]),
          deleteMany: jest.fn().mockReturnValue(Promise.resolve({ count: 1 })),
        },
        invitation: {
          findMany: jest.fn().mockResolvedValue([]),
          deleteMany: jest.fn(),
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

      const tokenFindCalls = prisma.accountToken.findMany.mock
        .calls as unknown as [
        [{ take: number; orderBy: { expiresAt: string } }],
      ];
      const invitationFindCalls = prisma.invitation.findMany.mock
        .calls as unknown as [
        [{ take: number; orderBy: { expiresAt: string } }],
      ];
      expect(tokenFindCalls[0][0].take).toBe(500);
      expect(tokenFindCalls[0][0].orderBy).toEqual({ expiresAt: 'asc' });
      expect(invitationFindCalls[0][0].take).toBe(500);
      expect(invitationFindCalls[0][0].orderBy).toEqual({ expiresAt: 'asc' });
      expect(RETENTION_PURGE_BATCH_LIMIT).toBe(500);
    });

    it('reports purged 500 when a 600-row token backlog drains across ticks', async () => {
      const tokenBacklog = Array.from({ length: 500 }, (_, i) => ({
        id: `tok-${i}`,
      }));
      const prisma = {
        accountToken: {
          findMany: jest.fn().mockResolvedValue(tokenBacklog),
          deleteMany: jest
            .fn()
            .mockReturnValue(Promise.resolve({ count: 500 })),
        },
        invitation: {
          findMany: jest.fn().mockResolvedValue([]),
          deleteMany: jest.fn(),
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

      expect(prisma.accountToken.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { expiresAt: 'asc' },
          take: 500,
        }),
      );
      expect(prisma.accountToken.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: tokenBacklog.map((row) => row.id) } },
      });
      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'succeeded',
        expect.stringContaining('purged 500 token(s) and 0 invitation(s)'),
      );
    });

    it('records a fixed message when the token delete transaction throws', async () => {
      const prisma = {
        accountToken: {
          findMany: jest.fn().mockResolvedValue([{ id: 'tok-1' }]),
          deleteMany: jest.fn().mockReturnValue(Promise.resolve({ count: 1 })),
        },
        invitation: {
          findMany: jest.fn().mockResolvedValue([{ id: 'inv-1' }]),
          deleteMany: jest.fn().mockReturnValue(Promise.resolve({ count: 1 })),
        },
        $transaction: jest
          .fn()
          .mockRejectedValueOnce(
            new Error(
              'Tx rollback on postgres://acres:secret@db:5432/acres for key tokens/tok-1',
            ),
          ),
      };
      const job = new RetentionMaintenanceJob(
        prisma as unknown as PrismaService,
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );
      const loggerError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      try {
        await job.purgeExpiredTokens();
        expect(runs.finish).toHaveBeenCalledWith(
          'run-123',
          'failed',
          TOKEN_PURGE_UNEXPECTED_FAILURE_MESSAGE,
        );
        const stored = runs.finish.mock.calls[0][2] as string;
        expect(stored).not.toContain('postgres://');
        expect(stored).not.toContain('tokens/tok-1');
        expect(loggerError).toHaveBeenCalled();
        expect(String(loggerError.mock.calls[0][0])).toContain('Tx rollback');
      } finally {
        loggerError.mockRestore();
      }
    });

    it('records the same fixed message for a non-Error token throw', async () => {
      const prisma = {
        accountToken: {
          findMany: jest.fn().mockResolvedValue([{ id: 'tok-1' }]),
          deleteMany: jest.fn().mockReturnValue(Promise.resolve({ count: 1 })),
        },
        invitation: {
          findMany: jest.fn().mockResolvedValue([{ id: 'inv-1' }]),
          deleteMany: jest.fn().mockReturnValue(Promise.resolve({ count: 1 })),
        },
        $transaction: jest.fn().mockRejectedValueOnce('boom'),
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
        TOKEN_PURGE_UNEXPECTED_FAILURE_MESSAGE,
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
      expect(findCalls[0][0].take).toBe(RETENTION_PURGE_BATCH_LIMIT);
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
      expect(RETENTION_PURGE_BATCH_LIMIT).toBe(500);
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

    it('records a fixed message when the export transaction throws', async () => {
      (fakeTenants.workerScoped as jest.Mock).mockRejectedValueOnce(
        new Error(
          'DB deadlock on connection postgres://acres:secret@db:5432/acres for key exports/exp-1',
        ),
      );
      const prisma = {} as unknown as PrismaService;
      const job = new RetentionMaintenanceJob(
        prisma,
        fakeTenants as TenantTransactionService,
        runs as unknown as JobRunsService,
        config as unknown as AcresConfigService,
      );
      const loggerError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      try {
        await job.purgeExpiredExports();

        expect(runs.finish).toHaveBeenCalledWith(
          'run-123',
          'failed',
          EXPORT_PURGE_UNEXPECTED_FAILURE_MESSAGE,
        );
        const stored = runs.finish.mock.calls[0][2] as string;
        expect(stored).not.toContain('postgres://');
        expect(stored).not.toContain('exports/exp-1');
        expect(loggerError).toHaveBeenCalled();
        expect(String(loggerError.mock.calls[0][0])).toContain('DB deadlock');
      } finally {
        loggerError.mockRestore();
      }
    });

    it('records the same fixed message for a non-Error export throw', async () => {
      (fakeTenants.workerScoped as jest.Mock).mockRejectedValueOnce('boom');
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
        EXPORT_PURGE_UNEXPECTED_FAILURE_MESSAGE,
      );
    });
  });
});
