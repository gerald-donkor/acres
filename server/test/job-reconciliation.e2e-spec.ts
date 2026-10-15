import { OutboxService } from '../src/outbox/outbox.service';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AcresConfigService } from '../src/config/acres-config.service';
import { Prisma } from '../src/generated/prisma/client';
import {
  reconciliationCandidates,
  JobReconciliationService,
} from '../src/outbox/job-reconciliation.service';
import { OutboxDispatcherService } from '../src/outbox/outbox-dispatcher.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantTransactionService } from '../src/prisma/tenant-transaction.service';
import type { QueueJobName } from '../src/queue/work-queue.port';
import { WORK_QUEUE, type QueuePort } from '../src/queue/work-queue.port';
import { JobLeaseService } from '../src/worker/job-lease.service';
import { LeasedJobExecutorService } from '../src/worker/leased-job-executor.service';
import type { JobProcessorService } from '../src/worker/job-processor.service';
import { createRealDbTestApp, truncateAll } from './helpers/real-db-test-app';

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('Queue retention reconciliation — real PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenants: TenantTransactionService;
  let config: AcresConfigService;
  let recovery: JobReconciliationService;
  let queue: jest.Mocked<QueuePort>;
  let accountId: string;
  let organizationId: string;
  let otherOrg: string;
  const old = new Date('2020-01-01T00:00:00Z');
  beforeAll(async () => {
    ({ app, prisma } = await createRealDbTestApp());
    tenants = app.get(TenantTransactionService);
    config = app.get(AcresConfigService);
    queue = app.get(WORK_QUEUE);
    recovery = app.get(JobReconciliationService);
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.spyOn(config, 'queueProvider', 'get').mockReturnValue('vercel');
    queue.enqueue.mockReset().mockResolvedValue(undefined);
    await truncateAll(prisma);
    accountId = (
      await prisma.account.create({
        data: {
          email: `${randomUUID()}@example.test`,
          passwordHash: 'test-only',
        },
      })
    ).id;
    organizationId = randomUUID();
    otherOrg = randomUUID();
    for (const id of [organizationId, otherOrg])
      await tenants.organizationScoped(accountId, id, async (tx) => {
        await tx.organization.create({
          data: { id, name: 'Recovery fixture' },
        });
        await tx.membership.create({
          data: { organizationId: id, accountId, role: 'owner' },
        });
      });
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  async function fixture(kind: QueueJobName = 'upload.completed') {
    return tenants.workerScoped(async (tx) => {
      const object = await tx.storedObject.create({
        data: {
          organizationId,
          bucket: 'test',
          objectKey: randomUUID(),
          originalFilename: 'data.csv',
          mediaType: 'text/csv',
          checksumAlgorithm: 'sha256',
        },
      });
      const upload = await tx.upload.create({
        data: {
          organizationId,
          actorAccountId: accountId,
          storedObjectId: object.id,
          state: 'completed',
          declaredFilename: 'data.csv',
          declaredMediaType: 'text/csv',
          declaredByteCount: 1,
          checksumAlgorithm: 'sha256',
          presignedUploadExpiresAt: old,
          expiresAt: old,
        },
      });
      let aggregateId = upload.id;
      let aggregateType = 'Upload';
      if (kind === 'ingestion.run') {
        const dataset = await tx.dataset.create({
          data: {
            organizationId,
            ownerAccountId: accountId,
            name: 'Recovery data',
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
        const run = await tx.ingestionRun.create({
          data: {
            organizationId,
            datasetId: dataset.id,
            uploadId: upload.id,
            mappingId: mapping.id,
            actorAccountId: accountId,
            deterministicKey: randomUUID(),
          },
        });
        aggregateId = run.id;
        aggregateType = 'IngestionRun';
      }
      if (kind === 'export.requested') {
        const report = await tx.report.create({
          data: {
            organizationId,
            ownerAccountId: accountId,
            createdByAccountId: accountId,
            title: 'Recovery report',
          },
        });
        aggregateId = (
          await tx.exportRequest.create({
            data: {
              organizationId,
              requestedByAccountId: accountId,
              reportId: report.id,
              format: 'csv',
              deterministicKey: randomUUID(),
            },
          })
        ).id;
        aggregateType = 'ExportRequest';
      }
      const event = await tx.outboxEvent.create({
        data: {
          organizationId,
          eventType: kind,
          aggregateType,
          aggregateId,
          aggregateVersion: 1,
          payload: { original: 'preserved' },
          state: 'dispatched',
          attempts: 1,
          dispatchedAt: old,
          updatedAt: old,
        },
      });
      const job = await tx.durableJob.create({
        data: {
          organizationId,
          jobType: kind,
          deterministicKey: `${kind}:${aggregateId}`,
          uploadId: kind === 'export.requested' ? null : upload.id,
          updatedAt: old,
        },
      });
      return { event, job, upload };
    });
  }
  async function read(id: string) {
    return tenants.workerScoped((tx) =>
      tx.outboxEvent.findUniqueOrThrow({ where: { id } }),
    );
  }
  async function ledger(id: string) {
    return tenants.workerScoped((tx) =>
      tx.durableJob.findUniqueOrThrow({
        where: { id },
        include: { deadLetters: true },
      }),
    );
  }

  it.each(['upload.completed', 'ingestion.run', 'export.requested'] as const)(
    'rearms expired %s, dispatches and executes duplicates once',
    async (kind) => {
      const { event, job } = await fixture(kind);
      if (kind === 'ingestion.run')
        await tenants.workerScoped((tx) =>
          tx.durableJob.update({
            where: { id: job.id },
            data: {
              state: 'running',
              leaseOwner: 'lost',
              leaseUntil: old,
              startedAt: old,
              updatedAt: old,
              attempts: 1,
            },
          }),
        );
      const before = await ledger(job.id);
      expect(await recovery.reconcileOnce()).toMatchObject({
        examined: 1,
        rearmed: 1,
      });
      expect(await ledger(job.id)).toEqual(before);
      expect(await read(event.id)).toMatchObject({
        state: 'pending',
        attempts: event.attempts,
        dispatchedAt: old,
        payload: event.payload,
        createdAt: event.createdAt,
      });
      expect((await recovery.reconcileOnce()).rearmed).toBe(0);
      const process = jest.fn(async () => {
        await tenants.workerScoped(async (tx) => {
          if (kind === 'upload.completed')
            await tx.upload.update({
              where: { id: event.aggregateId },
              data: { state: 'accepted' },
            });
          if (kind === 'ingestion.run')
            await tx.ingestionRun.update({
              where: { id: event.aggregateId },
              data: { state: 'published' },
            });
          if (kind === 'export.requested')
            await tx.exportRequest.update({
              where: { id: event.aggregateId },
              data: { status: 'succeeded' },
            });
        });
      });
      const executor = new LeasedJobExecutorService(
        tenants,
        new JobLeaseService(tenants, config),
        { process } as unknown as JobProcessorService,
      );
      expect(
        (await app.get(OutboxDispatcherService).dispatchOnce()).dispatched,
      ).toBe(1);
      expect(queue.enqueue.mock.calls[0][0].deterministicKey).toBe(
        job.deterministicKey,
      );
      const message = { v: 1 as const, jobName: kind, id: event.aggregateId };
      await executor.execute(message);
      await executor.execute(message);
      expect(process).toHaveBeenCalledTimes(1);
      expect((await recovery.reconcileOnce()).examined).toBe(0);
    },
  );

  it.each(['succeeded', 'cancelled', 'dead_lettered'] as const)(
    'leaves terminal %s ledger unchanged',
    async (state) => {
      const { event, job } = await fixture();
      await tenants.workerScoped((tx) =>
        tx.durableJob.update({
          where: { id: job.id },
          data: { state, updatedAt: old },
        }),
      );
      const before = await ledger(job.id);
      expect((await recovery.reconcileOnce()).examined).toBe(0);
      expect(await ledger(job.id)).toEqual(before);
      expect(await read(event.id)).toEqual(event);
    },
  );

  it.each(['accepted', 'rejected', 'cancelled', 'expired'] as const)(
    'repairs terminal upload %s before budget exhaustion and preserves history',
    async (state) => {
      const { event, job, upload } = await fixture();
      await tenants.workerScoped(async (tx) => {
        await tx.upload.update({ where: { id: upload.id }, data: { state } });
        await tx.durableJob.update({
          where: { id: job.id },
          data: {
            state: 'running',
            attempts: 5,
            lastErrorCode: 'prior',
            lastErrorMessage: 'Prior failure.',
            finishedAt: old,
            updatedAt: old,
          },
        });
      });
      expect((await recovery.reconcileOnce()).repaired).toBe(1);
      const after = await ledger(job.id);
      expect(after).toMatchObject({
        state:
          state === 'accepted'
            ? 'succeeded'
            : state === 'rejected'
              ? 'failed'
              : 'cancelled',
        attempts: 5,
        finishedAt: old,
        lastErrorCode: 'prior',
        lastErrorMessage: 'Prior failure.',
        deadLetters: [],
      });
      expect((await read(event.id)).state).toBe('dispatched');
      expect((await recovery.reconcileOnce()).repaired).toBe(0);
      expect(await ledger(job.id)).toEqual(after);
    },
  );

  it.each([
    'active',
    'recentDispatch',
    'recentJob',
    'future',
    'pending',
    'retrying',
    'dead_lettered',
  ] as const)('defers %s activity without mutation', async (condition) => {
    const { event, job } = await fixture();
    await tenants.workerScoped(async (tx) => {
      if (condition === 'active')
        await tx.durableJob.update({
          where: { id: job.id },
          data: {
            leaseOwner: 'live',
            leaseUntil: new Date('2100-01-01'),
            updatedAt: old,
          },
        });
      if (condition === 'recentDispatch' || condition === 'future')
        await tx.outboxEvent.update({
          where: { id: event.id },
          data: {
            dispatchedAt:
              condition === 'future' ? new Date('2100-01-01') : new Date(),
            updatedAt: old,
          },
        });
      if (condition === 'recentJob')
        await tx.durableJob.update({
          where: { id: job.id },
          data: { lastErrorCode: 'recent' },
        });
      if (['pending', 'retrying', 'dead_lettered'].includes(condition))
        await tx.outboxEvent.update({
          where: { id: event.id },
          data: {
            state: condition as 'pending' | 'retrying' | 'dead_lettered',
            updatedAt: old,
          },
        });
    });
    const before = await ledger(job.id);
    const beforeEvent = await read(event.id);
    expect((await recovery.reconcileOnce()).examined).toBe(0);
    expect(await ledger(job.id)).toEqual(before);
    expect(await read(event.id)).toEqual(beforeEvent);
  });

  it.each(['execution', 'dispatch'] as const)(
    'settles %s exhaustion once without replacing previous failures',
    async (budget) => {
      const { event, job } = await fixture();
      await tenants.workerScoped(async (tx) => {
        await tx.durableJob.update({
          where: { id: job.id },
          data: {
            attempts: budget === 'execution' ? 5 : 1,
            lastErrorCode: 'prior',
            updatedAt: old,
          },
        });
        if (budget === 'dispatch')
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: { attempts: 5, updatedAt: old },
          });
        await tx.jobDeadLetter.create({
          data: {
            durableJobId: job.id,
            organizationId,
            reasonCode: 'prior',
            reasonMessage: 'Prior failure.',
          },
        });
      });
      const results = await Promise.all([
        recovery.reconcileOnce(),
        recovery.reconcileOnce(),
      ]);
      expect(results.reduce((n, r) => n + r.exhausted, 0)).toBe(1);
      expect(await ledger(job.id)).toMatchObject({
        state: 'dead_lettered',
        attempts: budget === 'execution' ? 5 : 1,
        lastErrorCode: 'prior',
        deadLetters: [
          { reasonCode: 'prior' },
          { reasonCode: 'queue_recovery_exhausted' },
        ],
      });
      expect((await read(event.id)).state).toBe('dead_lettered');
      expect((await recovery.reconcileOnce()).exhausted).toBe(0);
    },
  );

  it.each([
    'tenant',
    'upload',
    'type',
    'unknown',
    'missing',
    'malformed',
  ] as const)(
    'rejects %s identity without modifying the job',
    async (fault) => {
      const { event, job } = await fixture();
      await tenants.workerScoped(async (tx) => {
        if (fault === 'tenant')
          await tx.durableJob.update({
            where: { id: job.id },
            data: { organizationId: otherOrg, updatedAt: old },
          });
        if (fault === 'upload')
          await tx.durableJob.update({
            where: { id: job.id },
            data: { uploadId: randomUUID(), updatedAt: old },
          });
        if (fault === 'type')
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: { aggregateType: 'ExportRequest', updatedAt: old },
          });
        if (
          fault === 'unknown' ||
          fault === 'malformed' ||
          fault === 'missing'
        ) {
          const name = fault === 'unknown' ? 'unknown.event' : event.eventType;
          const id = fault === 'malformed' ? 'bad-id' : randomUUID();
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: { eventType: name, aggregateId: id, updatedAt: old },
          });
          await tx.durableJob.update({
            where: { id: job.id },
            data: { deterministicKey: `${name}:${id}`, updatedAt: old },
          });
        }
      });
      const before = await ledger(job.id);
      expect((await recovery.reconcileOnce()).rejected).toBe(1);
      expect(await ledger(job.id)).toEqual(before);
      expect((await read(event.id)).state).toBe('dead_lettered');
      expect((await recovery.reconcileOnce()).examined).toBe(0);
      expect(queue.enqueue.mock.calls).toHaveLength(0);
    },
  );

  it('bounds concurrent reconcilers and skips locks held by execution/cancellation', async () => {
    jest.spyOn(config, 'outboxClaimBatchSize', 'get').mockReturnValue(2);
    const fixtures = await Promise.all(
      Array.from({ length: 5 }, () => fixture()),
    );
    const locked = barrier();
    const release = barrier();
    const held = tenants.workerScoped(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Upload" WHERE "id" = ${fixtures[0].upload.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "DurableJob" WHERE "id" = ${fixtures[1].job.id} FOR UPDATE`;
      locked.release();
      await release.promise;
      await tx.upload.update({
        where: { id: fixtures[0].upload.id },
        data: { state: 'cancelled' },
      });
    });
    try {
      await locked.promise;
      const results = await Promise.all([
        recovery.reconcileOnce(),
        recovery.reconcileOnce(),
      ]);
      expect(results.every((r) => r.examined <= 2)).toBe(true);
      expect(results.reduce((n, r) => n + r.rearmed, 0)).toBeLessThanOrEqual(3);
    } finally {
      release.release();
      await held;
    }
    for (let i = 0; i < 4; i++) await recovery.reconcileOnce();
    expect((await ledger(fixtures[0].job.id)).state).toBe('cancelled');
    expect(
      await tenants.workerScoped((tx) =>
        tx.outboxEvent.count({ where: { state: 'pending' } }),
      ),
    ).toBe(4);
  });

  it.each([false, true])(
    'rolls back all recovery writes on persistence failure (exhaustion=%s)',
    async (exhaustion) => {
      const { event, job } = await fixture();
      if (exhaustion)
        await tenants.workerScoped((tx) =>
          tx.durableJob.update({
            where: { id: job.id },
            data: { attempts: 5, updatedAt: old },
          }),
        );
      const before = await ledger(job.id);
      const original = tenants.workerScoped.bind(tenants);
      jest.spyOn(tenants, 'workerScoped').mockImplementationOnce((callback) =>
        original(async (tx) => {
          if (!exhaustion) {
            await callback(tx);
            throw new Error('rearm commit fault');
          }
          return callback(
            new Proxy(tx, {
              get(target, key) {
                if (key === 'jobDeadLetter')
                  return {
                    create: () =>
                      Promise.reject(new Error('dead letter fault')),
                  };
                return Reflect.get(target, key) as unknown;
              },
            }),
          );
        }),
      );
      await expect(recovery.reconcileOnce()).rejects.toThrow(
        exhaustion ? 'dead letter fault' : 'rearm commit fault',
      );
      expect(await read(event.id)).toEqual(event);
      expect(await ledger(job.id)).toEqual(before);
    },
  );

  it('keeps two-organization RLS reads and writes isolated', async () => {
    const { event, job } = await fixture();
    await tenants.organizationScoped(accountId, otherOrg, async (tx) => {
      expect(await tx.outboxEvent.findMany()).toEqual([]);
      expect(await tx.durableJob.findMany()).toEqual([]);
      expect(
        await tx.outboxEvent.updateMany({
          where: { id: event.id },
          data: { state: 'pending' },
        }),
      ).toEqual({ count: 0 });
      expect(
        await tx.durableJob.updateMany({
          where: { id: job.id },
          data: { attempts: 0 },
        }),
      ).toEqual({ count: 0 });
    });
    expect((await recovery.reconcileOnce()).rearmed).toBe(1);
  });
  it('uses the exact database cutoff, ignores future activity and excludes settled failed aggregates', async () => {
    const { event, job, upload } = await fixture();
    const staleMs =
      config.vercelQueueRetentionSeconds * 1000 + config.jobLeaseMs + 60000;
    await tenants.workerScoped(async (tx) => {
      await tx.$executeRaw`UPDATE "OutboxEvent" SET "dispatchedAt" = now() - (${staleMs} * interval '1 millisecond'), "updatedAt" = '2020-01-01'::timestamp WHERE "id" = ${event.id}`;
      expect(
        await tx.$queryRaw<{ id: string }[]>(
          reconciliationCandidates(staleMs, 25),
        ),
      ).toHaveLength(1);
      await tx.$executeRaw`UPDATE "OutboxEvent" SET "dispatchedAt" = "dispatchedAt" + interval '1 millisecond' WHERE "id" = ${event.id}`;
      expect(await tx.$queryRaw(reconciliationCandidates(staleMs, 25))).toEqual(
        [],
      );
      await tx.$executeRaw`UPDATE "OutboxEvent" SET "dispatchedAt" = '2020-01-01'::timestamp WHERE "id" = ${event.id}`;
      await tx.$executeRaw`UPDATE "DurableJob" SET "finishedAt" = '2100-01-01'::timestamp WHERE "id" = ${job.id}`;
      expect(await tx.$queryRaw(reconciliationCandidates(staleMs, 25))).toEqual(
        [],
      );
      await tx.durableJob.update({
        where: { id: job.id },
        data: { state: 'failed', finishedAt: old, updatedAt: old },
      });
      expect(
        await tx.$queryRaw(reconciliationCandidates(staleMs, 25)),
      ).toHaveLength(1);
      await tx.upload.update({
        where: { id: upload.id },
        data: { state: 'rejected' },
      });
      expect(await tx.$queryRaw(reconciliationCandidates(staleMs, 25))).toEqual(
        [],
      );
    });
  });

  it('retries a failed nonterminal aggregate and imposes the entire cooldown after redispatch', async () => {
    const { event, job } = await fixture();
    await tenants.workerScoped((tx) =>
      tx.durableJob.update({
        where: { id: job.id },
        data: { state: 'failed', attempts: 1, updatedAt: old },
      }),
    );
    expect((await recovery.reconcileOnce()).rearmed).toBe(1);
    expect(
      (await app.get(OutboxDispatcherService).dispatchOnce()).dispatched,
    ).toBe(1);
    expect((await read(event.id)).attempts).toBe(2);
    expect((await recovery.reconcileOnce()).examined).toBe(0);
    const lease = await new JobLeaseService(tenants, config).acquire({
      deterministicKey: job.deterministicKey,
      organizationId,
      jobType: job.jobType,
      uploadId: job.uploadId,
    });
    expect(lease).not.toBeNull();
    expect((await recovery.reconcileOnce()).examined).toBe(0);
    if (lease) await new JobLeaseService(tenants, config).release(lease);
  });

  it('captures the actual bounded selection plan over 2000 dispatched fixtures', async () => {
    const rows = Array.from({ length: 2000 }, () => ({
      id: randomUUID(),
      aggregateId: randomUUID(),
    }));
    await tenants.workerScoped(async (tx) => {
      await tx.outboxEvent.createMany({
        data: rows.map(({ id, aggregateId }) => ({
          id,
          aggregateId,
          organizationId,
          eventType: 'upload.completed',
          aggregateType: 'Upload',
          aggregateVersion: 1,
          payload: {},
          state: 'dispatched' as const,
          dispatchedAt: old,
          updatedAt: old,
        })),
      });
      await tx.durableJob.createMany({
        data: rows.map(({ aggregateId }) => ({
          organizationId,
          uploadId: aggregateId,
          jobType: 'upload.completed',
          deterministicKey: `upload.completed:${aggregateId}`,
          updatedAt: old,
        })),
      });
      const query = reconciliationCandidates(
        config.vercelQueueRetentionSeconds * 1000 + config.jobLeaseMs + 60000,
        config.outboxClaimBatchSize,
      );
      const plan = await tx.$queryRaw(
        Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
      );
      process.stdout.write(`RECOVERY_QUERY_PLAN ${JSON.stringify(plan)}\n`);
      expect(await tx.$queryRaw(query)).toHaveLength(
        config.outboxClaimBatchSize,
      );
    });
  });
  it('rechecks a lease committed after candidate selection before mutation', async () => {
    const { event, job } = await fixture();
    const original = tenants.workerScoped.bind(tenants);
    jest.spyOn(tenants, 'workerScoped').mockImplementationOnce((callback) =>
      original((tx) =>
        callback(
          new Proxy(tx, {
            get(target, key) {
              if (key === '$queryRaw')
                return async (...args: Parameters<typeof tx.$queryRaw>) => {
                  const rows: unknown = await target.$queryRaw(...args);
                  if (args.length === 1 && 'sql' in (args[0] as object)) {
                    await original(
                      (other) =>
                        other.$executeRaw`UPDATE "DurableJob" SET "leaseOwner" = 'racing-executor', "leaseUntil" = now() + interval '1 hour', "updatedAt" = now() WHERE "id" = ${job.id}`,
                    );
                  }
                  return rows;
                };
              return Reflect.get(target, key) as unknown;
            },
          }),
        ),
      ),
    );
    expect(await recovery.reconcileOnce()).toMatchObject({
      examined: 1,
      rearmed: 0,
      exhausted: 0,
    });
    expect(await read(event.id)).toEqual(event);
    expect((await ledger(job.id)).leaseOwner).toBe('racing-executor');
  });

  it('keeps a rearmed publish duplicate-safe after successful execution and failed completion recording', async () => {
    const { event, job } = await fixture('ingestion.run');
    expect((await recovery.reconcileOnce()).rearmed).toBe(1);
    const process = jest.fn(async () => {
      await tenants.workerScoped((tx) =>
        tx.ingestionRun.update({
          where: { id: event.aggregateId },
          data: { state: 'published' },
        }),
      );
    });
    const executor = new LeasedJobExecutorService(
      tenants,
      new JobLeaseService(tenants, config),
      { process } as unknown as JobProcessorService,
    );
    queue.enqueue.mockImplementation(async () => {
      await executor.execute({
        v: 1,
        jobName: 'ingestion.run',
        id: event.aggregateId,
      });
    });
    const outbox = app.get(OutboxService);
    const record = jest
      .spyOn(outbox, 'markDispatched')
      .mockRejectedValueOnce(new Error('completion fault'));
    await expect(
      app.get(OutboxDispatcherService).dispatchOnce(),
    ).rejects.toThrow('completion fault');
    const before = await ledger(job.id);
    await tenants.workerScoped(
      (tx) =>
        tx.$executeRaw`UPDATE "OutboxEvent" SET "lockedUntil" = now() - interval '1 second', "nextAttemptAt" = now() - interval '1 second' WHERE "id" = ${event.id}`,
    );
    record.mockRestore();
    expect(
      (await app.get(OutboxDispatcherService).dispatchOnce()).dispatched,
    ).toBe(1);
    expect(process).toHaveBeenCalledTimes(1);
    expect(await ledger(job.id)).toMatchObject({
      state: before.state,
      attempts: before.attempts,
      finishedAt: before.finishedAt,
      deadLetters: before.deadLetters,
    });
  });
});
