import { IngestionProcessorService } from '../src/ingestion/ingestion-processor.service';
import { ReportsService } from '../src/reports/reports.service';
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from '../src/storage/storage.port';
import type { MalwareScannerPort } from '../src/scanner/scanner.port';
import { JobAttemptsExhaustedError } from '../src/worker/leased-job-executor.service';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AcresConfigService } from '../src/config/acres-config.service';
import { IngestionService } from '../src/ingestion/ingestion.service';
import { OutboxDispatcherService } from '../src/outbox/outbox-dispatcher.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantTransactionService } from '../src/prisma/tenant-transaction.service';
import { WORK_QUEUE, type QueuePort } from '../src/queue/work-queue.port';
import { JobLeaseService } from '../src/worker/job-lease.service';
import { LeasedJobExecutorService } from '../src/worker/leased-job-executor.service';
import { JobProcessorService } from '../src/worker/job-processor.service';
import { createRealDbTestApp, truncateAll } from './helpers/real-db-test-app';

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('Invocation-safe outbox — real PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenants: TenantTransactionService;
  let config: AcresConfigService;
  let outbox: OutboxService;
  let dispatcher: OutboxDispatcherService;
  let queue: jest.Mocked<QueuePort>;
  let organizationId: string;
  let otherOrg: string;
  let accountId: string;
  let membershipId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createRealDbTestApp());
    tenants = app.get(TenantTransactionService);
    config = app.get(AcresConfigService);
    outbox = app.get(OutboxService);
    dispatcher = app.get(OutboxDispatcherService);
    queue = app.get(WORK_QUEUE);
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    queue.enqueue.mockReset().mockResolvedValue(undefined);
    await truncateAll(prisma);
    const account = await prisma.account.create({
      data: {
        email: `${randomUUID()}@example.test`,
        passwordHash: 'test-only',
      },
    });
    accountId = account.id;
    organizationId = randomUUID();
    otherOrg = randomUUID();
    for (const id of [organizationId, otherOrg]) {
      await tenants.organizationScoped(accountId, id, async (tx) => {
        await tx.organization.create({
          data: { id, name: 'Dispatch fixture' },
        });
        const membership = await tx.membership.create({
          data: { organizationId: id, accountId, role: 'owner' },
        });
        if (id === organizationId) membershipId = membership.id;
      });
    }
  });
  afterAll(async () => {
    await app?.close();
  });

  function append() {
    return tenants.workerScoped((tx) =>
      outbox.appendUploadCompleted(tx, {
        organizationId,
        uploadId: randomUUID(),
        version: 1,
      }),
    );
  }
  function read(id: string) {
    return tenants.workerScoped((tx) =>
      tx.outboxEvent.findUniqueOrThrow({ where: { id } }),
    );
  }
  async function expire(id: string) {
    await tenants.workerScoped(
      (tx) => tx.$executeRaw`
      UPDATE "OutboxEvent" SET "lockedUntil" = clock_timestamp() - interval '1 second',
      "nextAttemptAt" = clock_timestamp() - interval '1 second' WHERE "id" = ${id}
    `,
    );
  }
  async function ingestionFixture() {
    return tenants.workerScoped(async (tx) => {
      const object = await tx.storedObject.create({
        data: {
          organizationId,
          bucket: 'test',
          objectKey: randomUUID(),
          originalFilename: 'data.csv',
          mediaType: 'text/csv',
          checksumAlgorithm: 'sha256',
          state: 'accepted',
        },
      });
      const upload = await tx.upload.create({
        data: {
          organizationId,
          actorAccountId: accountId,
          storedObjectId: object.id,
          state: 'accepted',
          declaredFilename: 'data.csv',
          declaredMediaType: 'text/csv',
          declaredByteCount: 1,
          checksumAlgorithm: 'sha256',
          presignedUploadExpiresAt: new Date(),
          expiresAt: new Date(),
        },
      });
      const dataset = await tx.dataset.create({
        data: {
          organizationId,
          ownerAccountId: accountId,
          name: 'Dispatch dataset',
        },
      });
      const mapping = await tx.columnMapping.create({
        data: {
          organizationId,
          datasetId: dataset.id,
          uploadId: upload.id,
          createdByAccountId: accountId,
          versionNumber: 1,
          mapping: {},
        },
      });
      return { upload, dataset, mapping };
    });
  }

  it('concurrent invocations publish each claimed row once with bounded distinct batches', async () => {
    const count = config.outboxClaimBatchSize + 3;
    for (let i = 0; i < count; i++) await append();
    const other = new OutboxDispatcherService(
      config,
      tenants,
      new OutboxService(tenants, config),
      queue,
    );
    const results = await Promise.all([
      dispatcher.dispatchOnce(),
      other.dispatchOnce(),
    ]);
    expect(results.reduce((sum, r) => sum + r.dispatched, 0)).toBe(count);
    expect(results.every((r) => r.claimed <= config.outboxClaimBatchSize)).toBe(
      true,
    );
    const keys = queue.enqueue.mock.calls.map(
      ([input]) => input.deterministicKey,
    );
    expect(new Set(keys).size).toBe(count);
  });

  it('fences stale success, retry and dead letter before and after lease replacement', async () => {
    const event = await append();
    const [old] = await outbox.claimReady();
    await expire(event.id);
    expect(await outbox.ownsClaim(old)).toBe(false);
    expect(await outbox.markDispatched(old)).toBe(false);
    expect(await outbox.markRetry(old)).toBe(false);
    expect(await outbox.markDeadLetter(old)).toBe(false);
    const [replacement] = await new OutboxService(tenants, config).claimReady();
    expect(replacement.lockedBy).not.toBe(old.lockedBy);
    const before = await read(event.id);
    expect(await outbox.markDispatched(old)).toBe(false);
    expect(await outbox.markRetry(old)).toBe(false);
    expect(await outbox.markDeadLetter(old)).toBe(false);
    expect(await read(event.id)).toEqual(before);
    expect(await tenants.workerScoped((tx) => tx.jobDeadLetter.count())).toBe(
      0,
    );
    expect(await outbox.markDispatched(replacement)).toBe(true);
    expect(await outbox.markDeadLetter(replacement)).toBe(false);
  });

  it('recovers a final-claim crash exactly once without touching active or terminal rows', async () => {
    const expired = await append();
    const active = await append();
    const terminal = await append();
    await tenants.workerScoped((tx) =>
      tx.outboxEvent.updateMany({
        data: { attempts: config.outboxMaxAttempts, state: 'retrying' },
      }),
    );
    await tenants.workerScoped(
      (tx) => tx.$executeRaw`
      UPDATE "OutboxEvent" SET "lockedBy" = 'live', "lockedUntil" = clock_timestamp() + interval '1 hour' WHERE "id" = ${active.id}
    `,
    );
    await tenants.workerScoped((tx) =>
      tx.outboxEvent.update({
        where: { id: terminal.id },
        data: { state: 'dispatched' },
      }),
    );
    const beforeActive = await read(active.id);
    const beforeTerminal = await read(terminal.id);
    const results = await Promise.all([
      dispatcher.dispatchOnce(),
      dispatcher.dispatchOnce(),
    ]);
    expect(results.reduce((sum, r) => sum + r.exhausted, 0)).toBe(1);
    expect((await read(expired.id)).state).toBe('dead_lettered');
    expect(await read(active.id)).toEqual(beforeActive);
    expect(await read(terminal.id)).toEqual(beforeTerminal);
    expect(
      await tenants.workerScoped((tx) =>
        tx.jobDeadLetter.count({ where: { outboxEventId: expired.id } }),
      ),
    ).toBe(1);
    expect(queue.enqueue.mock.calls).toHaveLength(0);
  });

  it('bounds exhausted recovery separately so pending work still dispatches', async () => {
    for (let i = 0; i < config.outboxClaimBatchSize + 3; i++) await append();
    await tenants.workerScoped((tx) =>
      tx.outboxEvent.updateMany({
        data: { attempts: config.outboxMaxAttempts },
      }),
    );
    const pending = await append();
    const first = await dispatcher.dispatchOnce();
    expect(first).toMatchObject({
      exhausted: config.outboxClaimBatchSize,
      claimed: 1,
      dispatched: 1,
    });
    expect((await read(pending.id)).state).toBe('dispatched');
    expect((await dispatcher.dispatchOnce()).exhausted).toBe(3);
    expect(await tenants.workerScoped((tx) => tx.jobDeadLetter.count())).toBe(
      config.outboxClaimBatchSize + 3,
    );
  });

  it.each([
    'succeeded',
    'failed',
    'cancelled',
    'dead_lettered',
    'running',
    'queued',
  ] as const)(
    'dispatch preserves every persisted %s execution field',
    async (state) => {
      const event = await append();
      const job = await tenants.workerScoped((tx) =>
        tx.durableJob.create({
          data: {
            deterministicKey: `${event.eventType}:${event.aggregateId}`,
            organizationId,
            uploadId: event.aggregateId,
            jobType: event.eventType,
            state,
            attempts: 5,
            maxAttempts: 5,
            startedAt: new Date(),
            finishedAt: new Date(),
            lastErrorCode: 'prior_failure',
            lastErrorMessage: 'Prior failure.',
            leaseOwner: 'active-executor',
            leaseUntil: new Date(Date.now() + 60000),
          },
        }),
      );
      expect((await dispatcher.dispatchOnce()).dispatched).toBe(1);
      expect(
        await tenants.workerScoped((tx) =>
          tx.durableJob.findUniqueOrThrow({ where: { id: job.id } }),
        ),
      ).toEqual(job);
    },
  );

  it('rolls back exhausted recovery if durable dead-letter recording fails', async () => {
    const event = await append();
    await tenants.workerScoped((tx) =>
      tx.outboxEvent.update({
        where: { id: event.id },
        data: { attempts: config.outboxMaxAttempts },
      }),
    );
    const original = tenants.workerScoped.bind(tenants);
    jest.spyOn(tenants, 'workerScoped').mockImplementationOnce((callback) =>
      original((tx) =>
        callback(
          new Proxy(tx, {
            get(target, key) {
              if (key === 'jobDeadLetter')
                return {
                  ...target.jobDeadLetter,
                  create: () =>
                    Promise.reject(new Error('dead-letter write unavailable')),
                };
              return Reflect.get(target, key) as unknown;
            },
          }),
        ),
      ),
    );
    await expect(dispatcher.dispatchOnce()).rejects.toThrow(
      'dead-letter write unavailable',
    );
    expect((await read(event.id)).state).toBe('pending');
    expect(await tenants.workerScoped((tx) => tx.jobDeadLetter.count())).toBe(
      0,
    );
    expect((await dispatcher.dispatchOnce()).exhausted).toBe(1);
  });

  it.each([true, false])(
    'publishes ingestion intent only after commit (commit=%s)',
    async (commit) => {
      const { upload, dataset, mapping } = await ingestionFixture();
      const written = barrier();
      const finish = barrier();
      const runId = randomUUID();
      const transaction = tenants.workerScoped(async (tx) => {
        await tx.ingestionRun.create({
          data: {
            id: runId,
            organizationId,
            datasetId: dataset.id,
            uploadId: upload.id,
            mappingId: mapping.id,
            actorAccountId: accountId,
            deterministicKey: randomUUID(),
          },
        });
        await outbox.appendIngestionRun(tx, {
          organizationId,
          ingestionRunId: runId,
        });
        written.release();
        await finish.promise;
        if (!commit) throw new Error('intentional rollback');
      });
      // Attach the rejection handler before yielding, including if an assertion fails.
      const outcome = transaction.then(
        () => 'committed',
        () => 'rolled back',
      );
      try {
        await written.promise;
        expect((await dispatcher.dispatchOnce()).claimed).toBe(0);
        expect(queue.enqueue.mock.calls).toHaveLength(0);
      } finally {
        finish.release();
      }
      expect(await outcome).toBe(commit ? 'committed' : 'rolled back');
      queue.enqueue.mockImplementation(async (input) => {
        expect(input).toMatchObject({
          jobName: 'ingestion.run',
          payload: { ingestionRunId: runId },
        });
        expect(
          await tenants.workerScoped((tx) =>
            tx.ingestionRun.count({ where: { id: runId } }),
          ),
        ).toBe(1);
      });
      expect((await dispatcher.dispatchOnce()).dispatched).toBe(commit ? 1 : 0);
      expect(
        await tenants.workerScoped((tx) =>
          tx.ingestionRun.count({ where: { id: runId } }),
        ),
      ).toBe(commit ? 1 : 0);
    },
  );

  it('startRun commits one run and intent across command replay, different keys, and queue outage', async () => {
    const { upload, dataset, mapping } = await ingestionFixture();
    const service = app.get(IngestionService);
    const org = {
      organizationId,
      accountId,
      membershipId,
      role: 'owner' as const,
    };
    const body = { uploadId: upload.id, mappingId: mapping.id };
    queue.enqueue.mockRejectedValue(new Error('queue offline'));
    const first = await service.startRun(
      org,
      dataset.id,
      'outbox-command-key-1',
      body,
    );
    const replay = await service.startRun(
      org,
      dataset.id,
      'outbox-command-key-1',
      body,
    );
    const other = await service.startRun(
      org,
      dataset.id,
      'outbox-command-key-2',
      body,
    );
    expect([replay.id, other.id]).toEqual([first.id, first.id]);
    expect(queue.enqueue.mock.calls).toHaveLength(0);
    expect(await tenants.workerScoped((tx) => tx.ingestionRun.count())).toBe(1);
    expect(await tenants.workerScoped((tx) => tx.outboxEvent.count())).toBe(1);
    expect((await dispatcher.dispatchOnce()).retried).toBe(1);
    expect((await service.getRun(org, first.id)).state).toBe('queued');
    await expire(
      (await tenants.workerScoped((tx) => tx.outboxEvent.findFirstOrThrow()))
        .id,
    );
    queue.enqueue.mockResolvedValue(undefined);
    expect((await dispatcher.dispatchOnce()).dispatched).toBe(1);
    const intent = await tenants.workerScoped((tx) =>
      tx.outboxEvent.findFirstOrThrow(),
    );
    await service.startRun(org, dataset.id, 'outbox-command-key-3', body);
    expect(await read(intent.id)).toEqual(intent);
  });

  it('rolls back run, intent and command reservation when intent append fails', async () => {
    const { upload, dataset, mapping } = await ingestionFixture();
    const appendSpy = jest.spyOn(outbox, 'appendIngestionRun');
    const original = outbox.appendIngestionRun.bind(outbox);
    appendSpy.mockImplementationOnce(async (tx, input) => {
      await original(tx, input);
      throw new Error('fault after append');
    });
    await expect(
      app
        .get(IngestionService)
        .startRun(
          { organizationId, accountId, membershipId, role: 'owner' },
          dataset.id,
          'outbox-rollback-key-1',
          { uploadId: upload.id, mappingId: mapping.id },
        ),
    ).rejects.toThrow('fault after append');
    expect(await tenants.workerScoped((tx) => tx.ingestionRun.count())).toBe(0);
    expect(await tenants.workerScoped((tx) => tx.outboxEvent.count())).toBe(0);
    expect(
      await tenants.workerScoped((tx) => tx.idempotencyRecord.count()),
    ).toBe(0);
    expect(queue.enqueue.mock.calls).toHaveLength(0);
  });

  it('redelivers after publish/recording failure without reopening completed execution', async () => {
    const { upload, dataset, mapping } = await ingestionFixture();
    const run = await app
      .get(IngestionService)
      .startRun(
        { organizationId, accountId, membershipId, role: 'owner' },
        dataset.id,
        'outbox-redelivery-key',
        { uploadId: upload.id, mappingId: mapping.id },
      );
    const process = jest.fn(async () => {
      await tenants.workerScoped((tx) =>
        tx.ingestionRun.update({
          where: { id: run.id },
          data: { state: 'cancelled', cancelledAt: new Date() },
        }),
      );
    });
    const executor = new LeasedJobExecutorService(
      tenants,
      new JobLeaseService(tenants, config),
      { process } as unknown as JobProcessorService,
    );
    queue.enqueue.mockImplementation(async () => {
      await executor.execute({ v: 1, jobName: 'ingestion.run', id: run.id });
    });
    const record = jest
      .spyOn(outbox, 'markDispatched')
      .mockRejectedValueOnce(new Error('recording unavailable'));
    await expect(dispatcher.dispatchOnce()).rejects.toThrow(
      'recording unavailable',
    );
    expect(process).toHaveBeenCalledTimes(1);
    const job = await tenants.workerScoped((tx) =>
      tx.durableJob.findFirstOrThrow(),
    );
    const intent = await tenants.workerScoped((tx) =>
      tx.outboxEvent.findFirstOrThrow(),
    );
    expect(intent.state).toBe('retrying');
    await expire(intent.id);
    record.mockRestore();
    expect((await dispatcher.dispatchOnce()).dispatched).toBe(1);
    expect(queue.enqueue.mock.calls).toHaveLength(2);
    expect(process).toHaveBeenCalledTimes(1);
    const after = await tenants.workerScoped((tx) =>
      tx.durableJob.findFirstOrThrow(),
    );
    expect(after).toMatchObject({
      state: job.state,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      finishedAt: job.finishedAt,
    });
  });

  it('cannot reopen an exhausted scanning upload when interrupted outbox publication redelivers', async () => {
    const { upload } = await ingestionFixture();
    await tenants.workerScoped((tx) =>
      tx.upload.update({
        where: { id: upload.id },
        data: { state: 'completed' },
      }),
    );
    const event = await tenants.workerScoped((tx) =>
      outbox.appendUploadCompleted(tx, {
        organizationId,
        uploadId: upload.id,
        version: 1,
      }),
    );
    const storage = app.get<jest.Mocked<ObjectStoragePort>>(OBJECT_STORAGE);
    storage.getBuffer
      .mockReset()
      .mockRejectedValue(new Error('storage remains offline'));
    const processor = new JobProcessorService(
      config,
      tenants,
      {
        scanBuffer: jest.fn().mockResolvedValue({ status: 'clean' }),
        readiness: jest.fn().mockResolvedValue(true),
      } satisfies MalwareScannerPort,
      storage,
      app.get(IngestionProcessorService),
      app.get(ReportsService),
    );
    const executor = new LeasedJobExecutorService(
      tenants,
      new JobLeaseService(tenants, config),
      processor,
    );
    const message = {
      v: 1 as const,
      jobName: 'upload.completed' as const,
      id: upload.id,
      outboxEventId: event.id,
    };
    queue.enqueue
      .mockImplementationOnce(async () => {
        // The provider accepted the message; consumer exhaustion races the
        // publisher's failed completion write, without changing transport success.
        for (let i = 1; i < config.queueDefaultAttempts; i++)
          await expect(executor.execute(message)).rejects.toThrow(
            'storage remains offline',
          );
        await expect(executor.execute(message)).rejects.toBeInstanceOf(
          JobAttemptsExhaustedError,
        );
      })
      .mockImplementation(async () => {
        expect(await executor.execute(message)).toBe('already_terminal');
      });
    const record = jest
      .spyOn(outbox, 'markDispatched')
      .mockRejectedValueOnce(new Error('publisher recording interrupted'));
    await expect(dispatcher.dispatchOnce()).rejects.toThrow(
      'publisher recording interrupted',
    );
    const before = await tenants.workerScoped((tx) =>
      tx.durableJob.findUniqueOrThrow({
        where: { deterministicKey: `upload.completed:${upload.id}` },
        include: { deadLetters: true },
      }),
    );
    expect(before).toMatchObject({
      state: 'dead_lettered',
      attempts: config.queueDefaultAttempts,
    });
    await expire(event.id);
    record.mockRestore();
    expect((await dispatcher.dispatchOnce()).dispatched).toBe(1);
    expect(queue.enqueue.mock.calls).toHaveLength(2);
    expect(storage.getBuffer.mock.calls).toHaveLength(
      config.queueDefaultAttempts,
    );
    const after = await tenants.workerScoped((tx) =>
      tx.durableJob.findUniqueOrThrow({
        where: { id: before.id },
        include: { deadLetters: true },
      }),
    );
    expect(after).toMatchObject({
      state: before.state,
      attempts: before.attempts,
      maxAttempts: before.maxAttempts,
      finishedAt: before.finishedAt,
      lastErrorCode: before.lastErrorCode,
      lastErrorMessage: before.lastErrorMessage,
      deadLetters: before.deadLetters,
    });
    expect(
      (
        await tenants.workerScoped((tx) =>
          tx.upload.findUniqueOrThrow({ where: { id: upload.id } }),
        )
      ).state,
    ).toBe('scanning');
  });

  it('forces two-organization RLS and refuses mismatched worker ledger identity', async () => {
    const event = await append();
    expect(
      await tenants.organizationScoped(accountId, otherOrg, (tx) =>
        tx.outboxEvent.findMany(),
      ),
    ).toEqual([]);
    expect(
      await tenants.organizationScoped(accountId, otherOrg, (tx) =>
        tx.outboxEvent.updateMany({
          where: { id: event.id },
          data: { state: 'dispatched' },
        }),
      ),
    ).toEqual({ count: 0 });
    await expect(
      tenants.organizationScoped(accountId, otherOrg, (tx) =>
        tx.outboxEvent.create({
          data: {
            organizationId,
            eventType: 'upload.completed',
            aggregateType: 'Upload',
            aggregateId: randomUUID(),
            aggregateVersion: 1,
            payload: {},
          },
        }),
      ),
    ).rejects.toThrow();
    await tenants.workerScoped((tx) =>
      tx.durableJob.create({
        data: {
          organizationId: otherOrg,
          uploadId: event.aggregateId,
          jobType: event.eventType,
          deterministicKey: `${event.eventType}:${event.aggregateId}`,
        },
      }),
    );
    const before = await tenants.workerScoped((tx) =>
      tx.durableJob.findFirstOrThrow(),
    );
    expect((await dispatcher.dispatchOnce()).rejected).toBe(1);
    expect(queue.enqueue.mock.calls).toHaveLength(0);
    expect(
      await tenants.workerScoped((tx) => tx.durableJob.findFirstOrThrow()),
    ).toEqual(before);
    expect(
      await tenants.organizationScoped(accountId, otherOrg, (tx) =>
        tx.jobDeadLetter.count(),
      ),
    ).toBe(0);
  });
});
