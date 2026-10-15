import { randomUUID } from 'node:crypto';
import type { AcresConfigService } from '../config/acres-config.service';
import type {
  TenantTransactionClient,
  TenantTransactionService,
} from '../prisma/tenant-transaction.service';
import type { QueuePort } from '../queue/work-queue.port';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OutboxService, type ClaimedOutboxEvent } from './outbox.service';

function event(
  eventType = 'upload.completed',
  aggregateType = 'Upload',
): ClaimedOutboxEvent {
  return {
    id: randomUUID(),
    organizationId: randomUUID(),
    aggregateId: randomUUID(),
    aggregateType,
    eventType,
    payload: {},
    attempts: 1,
    maxAttempts: 3,
    lockedBy: randomUUID(),
  };
}

function setup(events: ClaimedOutboxEvent[] = []) {
  const outbox = {
    recoverExhausted: jest.fn().mockResolvedValue(0),
    claimReady: jest.fn().mockResolvedValue(events),
    ownsClaim: jest.fn().mockResolvedValue(true),
    markDispatched: jest.fn().mockResolvedValue(true),
    markRetry: jest.fn().mockResolvedValue(true),
    markDeadLetter: jest.fn().mockResolvedValue(true),
  };
  const jobs = new Map<string, Record<string, unknown>>();
  const createMany = jest.fn(
    ({ data }: { data: Record<string, unknown>[] }) => {
      for (const row of data)
        if (!jobs.has(row.deterministicKey as string))
          jobs.set(row.deterministicKey as string, row);
      return Promise.resolve({ count: 1 });
    },
  );
  const tx = {
    durableJob: {
      createMany,
      findUniqueOrThrow: jest.fn(
        ({ where }: { where: { deterministicKey: string } }) =>
          Promise.resolve(jobs.get(where.deterministicKey)),
      ),
    },
    ingestionRun: {
      findUnique: jest.fn().mockResolvedValue({
        organizationId: events[0]?.organizationId,
        uploadId: 'source-upload',
      }),
    },
  };
  let transactionOpen = false;
  const tenants = {
    workerScoped: jest.fn(
      async (fn: (tx: TenantTransactionClient) => Promise<unknown>) => {
        transactionOpen = true;
        try {
          return await fn(tx as unknown as TenantTransactionClient);
        } finally {
          transactionOpen = false;
        }
      },
    ),
  };
  const queue = {
    enqueue: jest.fn(() => {
      expect(transactionOpen).toBe(false);
      return Promise.resolve();
    }),
  };
  const dispatcher = new OutboxDispatcherService(
    { queueDefaultAttempts: 5 } as AcresConfigService,
    tenants as unknown as TenantTransactionService,
    outbox as unknown as OutboxService,
    queue as unknown as QueuePort,
  );
  return { dispatcher, outbox, queue, tx, jobs };
}

describe('OutboxDispatcherService', () => {
  it.each([
    ['upload.completed', 'Upload', 'uploadId'],
    ['export.requested', 'ExportRequest', 'exportRequestId'],
    ['ingestion.run', 'IngestionRun', 'ingestionRunId'],
  ])('maps %s outside SQL transactions', async (name, aggregate, field) => {
    const e = event(name, aggregate);
    const { dispatcher, queue } = setup([e]);
    expect(await dispatcher.dispatchOnce()).toMatchObject({
      claimed: 1,
      dispatched: 1,
    });
    expect(queue.enqueue).toHaveBeenCalledWith({
      deterministicKey: `${name}:${e.aggregateId}`,
      jobName: name,
      payload: { [field]: e.aggregateId, outboxEventId: e.id },
    });
  });

  it('returns an empty batch with bounded recovery counted separately', async () => {
    const { dispatcher, outbox, queue } = setup();
    outbox.recoverExhausted.mockResolvedValue(2);
    expect(await dispatcher.dispatchOnce()).toEqual({
      claimed: 0,
      dispatched: 0,
      retried: 0,
      exhausted: 2,
      rejected: 0,
      lostClaims: 0,
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('retries events independently and durably exhausts the final provider failure', async () => {
    const a = event();
    const b = { ...event(), attempts: 3 };
    const { dispatcher, queue, outbox } = setup([a, b, event()]);
    queue.enqueue
      .mockRejectedValueOnce(new Error('provider secret'))
      .mockRejectedValueOnce(new Error('provider secret'));
    expect(await dispatcher.dispatchOnce()).toMatchObject({
      dispatched: 1,
      retried: 1,
      exhausted: 1,
    });
    expect(outbox.markRetry).toHaveBeenCalledWith(a);
    expect(outbox.markDeadLetter).toHaveBeenCalledWith(b);
  });

  it.each([
    'succeeded',
    'failed',
    'cancelled',
    'dead_lettered',
    'running',
    'queued',
  ])('preserves existing %s ledger byte for byte', async (state) => {
    const e = event();
    const { dispatcher, jobs } = setup([e]);
    const key = `${e.eventType}:${e.aggregateId}`;
    const job = {
      organizationId: e.organizationId,
      jobType: e.eventType,
      uploadId: e.aggregateId,
      state,
      attempts: 5,
      maxAttempts: 5,
      startedAt: new Date(),
      finishedAt: new Date(),
      lastErrorCode: 'old',
      lastErrorMessage: 'old',
      leaseOwner: 'live-owner',
      leaseUntil: new Date(Date.now() + 60000),
    };
    const before = { ...job };
    jobs.set(key, job);
    await dispatcher.dispatchOnce();
    expect(jobs.get(key)).toEqual(before);
    expect(jobs.get(key)).toBe(job);
  });

  it.each(['unknown', 'wrong aggregate'])(
    'fails closed for %s persisted event identity',
    async (kind) => {
      const e =
        kind === 'unknown'
          ? event('future.event')
          : event('upload.completed', 'Wrong');
      const { dispatcher, queue, outbox } = setup([e]);
      expect(await dispatcher.dispatchOnce()).toMatchObject({ rejected: 1 });
      expect(outbox.markDeadLetter).toHaveBeenCalledWith(
        e,
        'outbox_event_invalid',
      );
      expect(queue.enqueue).not.toHaveBeenCalled();
    },
  );

  it.each(['organizationId', 'uploadId', 'jobType'])(
    'rejects an existing job with mismatched %s',
    async (field) => {
      const e = event();
      const { dispatcher, jobs, queue, outbox } = setup([e]);
      jobs.set(`${e.eventType}:${e.aggregateId}`, {
        organizationId: e.organizationId,
        uploadId: e.aggregateId,
        jobType: e.eventType,
        [field]: 'other',
      });
      expect(await dispatcher.dispatchOnce()).toMatchObject({ rejected: 1 });
      expect(outbox.markDeadLetter).toHaveBeenCalledWith(
        e,
        'outbox_job_mismatch',
      );
      expect(queue.enqueue).not.toHaveBeenCalled();
    },
  );

  it('does not publish a batch item whose lease expired during earlier work', async () => {
    const { dispatcher, queue, outbox } = setup([event(), event()]);
    outbox.ownsClaim.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await dispatcher.dispatchOnce()).toMatchObject({
      dispatched: 1,
      lostClaims: 1,
    });
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('reports late successful publication as lost claim', async () => {
    const { dispatcher, outbox } = setup([event()]);
    outbox.markDispatched.mockResolvedValue(false);
    expect(await dispatcher.dispatchOnce()).toMatchObject({
      dispatched: 0,
      lostClaims: 1,
    });
  });

  it('rejects recording failure after successful publish without retry classification', async () => {
    const { dispatcher, queue, outbox } = setup([event()]);
    outbox.markDispatched.mockRejectedValueOnce(new Error('database down'));
    await expect(dispatcher.dispatchOnce()).rejects.toThrow('database down');
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(outbox.markRetry).not.toHaveBeenCalled();
    expect(outbox.markDeadLetter).not.toHaveBeenCalled();
  });

  it('rejects ledger and recovery failures without publishing', async () => {
    const { dispatcher, queue, tx, outbox } = setup([event()]);
    tx.durableJob.createMany.mockRejectedValueOnce(new Error('ledger down'));
    await expect(dispatcher.dispatchOnce()).rejects.toThrow('ledger down');
    outbox.recoverExhausted.mockRejectedValueOnce(new Error('recovery down'));
    await expect(dispatcher.dispatchOnce()).rejects.toThrow('recovery down');
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
