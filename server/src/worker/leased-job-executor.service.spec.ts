import type { TenantTransactionService } from '../prisma/tenant-transaction.service';
import type { JobLeaseService } from './job-lease.service';
import type { JobProcessorService } from './job-processor.service';
import {
  AggregateNotVisibleError,
  JOB_EXCEPTION_MESSAGE,
  JobAttemptsExhaustedError,
  JobLeaseBusyError,
  LeasedJobExecutorService,
} from './leased-job-executor.service';

const ID = '01920000-0000-7000-8000-000000000001';
const ORG = '01920000-0000-7000-8000-0000000000aa';
const UPLOAD = '01920000-0000-7000-8000-0000000000bb';
const LEASE = { durableJobId: 'dj-1', owner: 'lease-1' };

function setup() {
  const tx = {
    upload: { findUnique: jest.fn() },
    ingestionRun: { findUnique: jest.fn() },
    exportRequest: { findUnique: jest.fn() },
    durableJob: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ attempts: 1, maxAttempts: 3 }),
    },
    jobDeadLetter: {
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const tenants = {
    workerScoped: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  } as unknown as TenantTransactionService;
  const leases = {
    acquire: jest.fn().mockResolvedValue(LEASE),
    release: jest.fn().mockResolvedValue(undefined),
    remainingMs: jest.fn().mockResolvedValue(12_000),
  };
  const processor = { process: jest.fn().mockResolvedValue(undefined) };
  const executor = new LeasedJobExecutorService(
    tenants,
    leases as unknown as JobLeaseService,
    processor as unknown as JobProcessorService,
  );
  return { tx, leases, processor, executor };
}

describe('LeasedJobExecutorService', () => {
  it('leases the upload under its database owner and resumes interrupted scans', async () => {
    const { tx, leases, processor, executor } = setup();
    tx.upload.findUnique.mockResolvedValue({ organizationId: ORG });
    await expect(
      executor.execute({ v: 1, jobName: 'upload.completed', id: ID }),
    ).resolves.toBe('processed');
    expect(leases.acquire).toHaveBeenCalledWith({
      deterministicKey: `upload.completed:${ID}`,
      jobType: 'upload.completed',
      organizationId: ORG,
      uploadId: ID,
    });
    expect(processor.process).toHaveBeenCalledWith(
      { uploadId: ID },
      { resumeInterrupted: true },
    );
    // The upload processor owns its own DurableJob transitions.
    expect(tx.durableJob.update).not.toHaveBeenCalled();
    expect(leases.release).toHaveBeenCalledWith(LEASE);
  });

  it('reports a missing or ownerless aggregate as retryable, without leasing', async () => {
    const { tx, leases, processor, executor } = setup();
    tx.upload.findUnique.mockResolvedValue({ organizationId: null });
    await expect(
      executor.execute({ v: 1, jobName: 'upload.completed', id: ID }),
    ).rejects.toBeInstanceOf(AggregateNotVisibleError);
    tx.exportRequest.findUnique.mockResolvedValue(null);
    await expect(
      executor.execute({ v: 1, jobName: 'export.requested', id: ID }),
    ).rejects.toBeInstanceOf(AggregateNotVisibleError);
    expect(leases.acquire).not.toHaveBeenCalled();
    expect(processor.process).not.toHaveBeenCalled();
  });

  it('throws a busy error with the remaining lease when another executor is live', async () => {
    const { tx, leases, processor, executor } = setup();
    tx.upload.findUnique.mockResolvedValue({ organizationId: ORG });
    leases.acquire.mockResolvedValue(null);
    const error = await executor
      .execute({ v: 1, jobName: 'upload.completed', id: ID })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(JobLeaseBusyError);
    expect((error as JobLeaseBusyError).retryAfterMs).toBe(12_000);
    expect(processor.process).not.toHaveBeenCalled();
    expect(leases.release).not.toHaveBeenCalled();
  });

  it.each([
    ['published', 'succeeded'],
    ['validation_failed', 'failed'],
    ['cancelled', 'cancelled'],
  ])(
    'mirrors an ingestion run ending %s as %s',
    async (runState, ledgerState) => {
      const { tx, executor } = setup();
      tx.ingestionRun.findUnique
        .mockResolvedValueOnce({ organizationId: ORG, uploadId: UPLOAD })
        .mockResolvedValueOnce({ state: 'queued' })
        .mockResolvedValueOnce({ state: runState });
      await expect(
        executor.execute({ v: 1, jobName: 'ingestion.run', id: ID }),
      ).resolves.toBe('processed');
      expect(tx.durableJob.update).toHaveBeenCalledWith({
        where: { id: 'dj-1' },
        data: expect.objectContaining({
          state: 'running',
          attempts: { increment: 1 },
        }) as object,
      });
      expect(tx.durableJob.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'dj-1',
          state: { notIn: [ledgerState, 'dead_lettered'] },
        },
        data: { state: ledgerState, finishedAt: expect.any(Date) as Date },
      });
    },
  );

  it.each([
    ['ingestion.run', { state: 'failed' }, 'failed'],
    ['ingestion.run', { state: 'published' }, 'succeeded'],
    ['export.requested', { status: 'failed' }, 'failed'],
    ['export.requested', { status: 'succeeded' }, 'succeeded'],
  ] as const)(
    'never re-runs or reopens a finished %s (%o)',
    async (jobName, aggregate, ledgerState) => {
      const { tx, processor, executor } = setup();
      const model =
        jobName === 'ingestion.run' ? tx.ingestionRun : tx.exportRequest;
      model.findUnique
        .mockResolvedValueOnce({ organizationId: ORG, uploadId: UPLOAD })
        .mockResolvedValueOnce(aggregate);
      await expect(executor.execute({ v: 1, jobName, id: ID })).resolves.toBe(
        'already_terminal',
      );
      expect(processor.process).not.toHaveBeenCalled();
      expect(tx.durableJob.update).not.toHaveBeenCalled();
      expect(tx.durableJob.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'dj-1',
          state: { notIn: [ledgerState, 'dead_lettered'] },
        },
        data: { state: ledgerState, finishedAt: expect.any(Date) as Date },
      });
    },
  );

  it('leaves a non-terminal export running for the next delivery', async () => {
    const { tx, executor } = setup();
    tx.exportRequest.findUnique
      .mockResolvedValueOnce({ organizationId: ORG })
      .mockResolvedValueOnce({ status: 'queued' })
      .mockResolvedValueOnce({ status: 'running' });
    await executor.execute({ v: 1, jobName: 'export.requested', id: ID });
    expect(tx.durableJob.updateMany).not.toHaveBeenCalled();
  });

  it('records a safe retryable failure and releases on an unexpected exception', async () => {
    const { tx, leases, processor, executor } = setup();
    tx.exportRequest.findUnique
      .mockResolvedValueOnce({ organizationId: ORG })
      .mockResolvedValueOnce({ status: 'queued' });
    processor.process.mockRejectedValue(new Error('s3://secret-bucket/key'));
    await expect(
      executor.execute({ v: 1, jobName: 'export.requested', id: ID }),
    ).rejects.toThrow('s3://secret-bucket/key');
    expect(tx.durableJob.update).toHaveBeenLastCalledWith({
      where: { id: 'dj-1' },
      data: expect.objectContaining({
        state: 'failed',
        lastErrorCode: 'worker_exception',
        lastErrorMessage: JOB_EXCEPTION_MESSAGE,
      }) as object,
    });
    expect(tx.jobDeadLetter.create).not.toHaveBeenCalled();
    expect(leases.release).toHaveBeenCalledWith(LEASE);
  });

  it('dead-letters once the ledger attempt budget is spent, then reports exhaustion', async () => {
    const { tx, processor, executor } = setup();
    tx.ingestionRun.findUnique
      .mockResolvedValueOnce({ organizationId: ORG, uploadId: UPLOAD })
      .mockResolvedValueOnce({ state: 'running' });
    tx.durableJob.findUniqueOrThrow.mockResolvedValue({
      attempts: 3,
      maxAttempts: 3,
    });
    processor.process.mockRejectedValue(new Error('boom'));
    await expect(
      executor.execute({ v: 1, jobName: 'ingestion.run', id: ID }),
    ).rejects.toBeInstanceOf(JobAttemptsExhaustedError);
    expect(tx.durableJob.update).toHaveBeenLastCalledWith({
      where: { id: 'dj-1' },
      data: expect.objectContaining({ state: 'dead_lettered' }) as object,
    });
    expect(tx.jobDeadLetter.create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG,
        durableJobId: 'dj-1',
        reasonCode: 'worker_exception',
        reasonMessage: JOB_EXCEPTION_MESSAGE,
        payload: { jobName: 'ingestion.run', id: ID },
      },
    });
  });

  it('does not duplicate the upload processor dead letter on exhaustion', async () => {
    const { tx, processor, executor } = setup();
    tx.upload.findUnique.mockResolvedValue({ organizationId: ORG });
    tx.durableJob.findUniqueOrThrow.mockResolvedValue({
      attempts: 3,
      maxAttempts: 3,
    });
    tx.jobDeadLetter.count.mockResolvedValue(1);
    processor.process.mockRejectedValue(new Error('boom'));
    await expect(
      executor.execute({ v: 1, jobName: 'upload.completed', id: ID }),
    ).rejects.toBeInstanceOf(JobAttemptsExhaustedError);
    expect(tx.jobDeadLetter.create).not.toHaveBeenCalled();
  });

  it('keeps an unrecorded failure retryable when the ledger write itself fails', async () => {
    const { tx, processor, executor } = setup();
    tx.upload.findUnique.mockResolvedValue({ organizationId: ORG });
    tx.durableJob.findUniqueOrThrow.mockRejectedValue(new Error('db down'));
    processor.process.mockRejectedValue(new Error('boom'));
    const error = await executor
      .execute({ v: 1, jobName: 'upload.completed', id: ID })
      .catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(JobAttemptsExhaustedError);
    expect((error as Error).message).toBe('boom');
  });

  it('never masks the job outcome when lease release fails', async () => {
    const { tx, leases, executor } = setup();
    tx.upload.findUnique.mockResolvedValue({ organizationId: ORG });
    leases.release.mockRejectedValue(new Error('pool closed'));
    await expect(
      executor.execute({ v: 1, jobName: 'upload.completed', id: ID }),
    ).resolves.toBe('processed');
  });
});
