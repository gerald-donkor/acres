import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { AcresConfigService } from '../src/config/acres-config.service';
import { IngestionService } from '../src/ingestion/ingestion.service';
import {
  AFTER_RESPONSE_SCHEDULER,
  type AfterResponseScheduler,
} from '../src/outbox/after-response.scheduler';
import { DispatchKickService } from '../src/outbox/dispatch-kick.service';
import { ManagedDispatchRunnerService } from '../src/outbox/managed-dispatch-runner.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantTransactionService } from '../src/prisma/tenant-transaction.service';
import { WORK_QUEUE, type QueuePort } from '../src/queue/work-queue.port';
import { ReportsService } from '../src/reports/reports.service';
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from '../src/storage/storage.port';
import { UploadsService } from '../src/uploads/uploads.service';
import { createDispatchHandler } from '../src/vercel/dispatch-handler';
import { createRealDbTestApp, truncateAll } from './helpers/real-db-test-app';

jest.setTimeout(30000);

describe('Managed Outbox Dispatch & Vercel Cron Runtime — Real PostgreSQL E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenants: TenantTransactionService;
  let config: AcresConfigService;
  let outbox: OutboxService;
  let runner: ManagedDispatchRunnerService;
  let kick: DispatchKickService;
  let uploadsService: UploadsService;
  let ingestionService: IngestionService;
  let reportsService: ReportsService;
  let mockQueue: jest.Mocked<QueuePort>;
  let mockStorage: jest.Mocked<ObjectStoragePort>;
  let scheduler: AfterResponseScheduler;

  let accountId: string;
  let organizationId: string;
  let secondOrgId: string;
  let kickPromises: Promise<unknown>[] = [];

  const storageMap = new Map<
    string,
    { body: Buffer; mediaType: string; checksumHex: string }
  >();

  beforeAll(async () => {
    ({ app, prisma } = await createRealDbTestApp());
    tenants = app.get(TenantTransactionService);
    config = app.get(AcresConfigService);
    outbox = app.get(OutboxService);
    runner = app.get(ManagedDispatchRunnerService);
    kick = app.get(DispatchKickService);
    uploadsService = app.get(UploadsService);
    ingestionService = app.get(IngestionService);
    reportsService = app.get(ReportsService);
    mockQueue = app.get(WORK_QUEUE);
    mockStorage = app.get(OBJECT_STORAGE);
    scheduler = app.get<AfterResponseScheduler>(AFTER_RESPONSE_SCHEDULER);
  });

  beforeEach(async () => {
    storageMap.clear();
    kickPromises = [];
    jest.restoreAllMocks();

    mockQueue.enqueue.mockReset().mockResolvedValue(undefined);
    mockQueue.readiness.mockResolvedValue(true);

    mockStorage.putBuffer.mockImplementation((input) => {
      storageMap.set(input.key, {
        body: input.body,
        mediaType: input.mediaType,
        checksumHex: input.checksumHex,
      });
      return Promise.resolve();
    });
    mockStorage.getBuffer.mockImplementation((key) => {
      return Promise.resolve(storageMap.get(key)?.body ?? null);
    });
    mockStorage.stat.mockImplementation((key) => {
      const item = storageMap.get(key);
      if (!item) return Promise.resolve(null);
      return Promise.resolve({
        byteCount: BigInt(item.body.length),
        mediaType: item.mediaType,
        checksumHex: item.checksumHex,
      });
    });
    mockStorage.readiness.mockResolvedValue(true);

    // Spy scheduler to capture waitUntil promises in test
    jest.spyOn(scheduler, 'waitUntil').mockImplementation((p) => {
      kickPromises.push(p);
    });

    // Default queue provider to vercel for managed dispatch tests
    jest.spyOn(config, 'queueProvider', 'get').mockReturnValue('vercel');

    await truncateAll(prisma);

    const account = await prisma.account.create({
      data: {
        email: `tester-${randomUUID()}@example.test`,
        passwordHash: 'dummy-hash-for-test',
      },
    });
    accountId = account.id;
    organizationId = randomUUID();
    secondOrgId = randomUUID();

    for (const orgId of [organizationId, secondOrgId]) {
      await tenants.organizationScoped(accountId, orgId, async (tx) => {
        await tx.organization.create({
          data: { id: orgId, name: `Org-${orgId}` },
        });
        await tx.membership.create({
          data: { organizationId: orgId, accountId, role: 'owner' },
        });
      });
    }
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  async function awaitKicks(): Promise<void> {
    while (kickPromises.length > 0) {
      const current = [...kickPromises];
      kickPromises = [];
      await Promise.all(current);
    }
  }

  const orgContext = (orgId = organizationId) => ({
    accountId,
    organizationId: orgId,
    membershipId: randomUUID(),
    role: 'owner' as const,
  });

  // ===========================================================================
  // 1. Upload complete -> Kick -> Dispatch flow (Prompt 376 item 7)
  // ===========================================================================
  it('1. kicks on uploadsService.complete and dispatches upload.completed to queue', async () => {
    const csvContent = Buffer.from('col1,col2\nval1,val2\n', 'utf-8');
    const checksumHex = createHash('sha256').update(csvContent).digest('hex');
    const objectKey = `uploads/${organizationId}/${randomUUID()}.csv`;

    await mockStorage.putBuffer({
      key: objectKey,
      body: csvContent,
      mediaType: 'text/csv',
      checksumHex,
    });

    const upload = await tenants.organizationScoped(
      accountId,
      organizationId,
      async (tx) => {
        const storedObject = await tx.storedObject.create({
          data: {
            organizationId,
            bucket: 'test-bucket',
            objectKey,
            originalFilename: 'data.csv',
            mediaType: 'text/csv',
            byteCount: BigInt(csvContent.length),
            checksumHex,
            checksumAlgorithm: 'sha256',
          },
        });
        return tx.upload.create({
          data: {
            organizationId,
            actorAccountId: accountId,
            storedObjectId: storedObject.id,
            state: 'pending_upload',
            declaredFilename: 'data.csv',
            declaredMediaType: 'text/csv',
            declaredByteCount: csvContent.length,
            checksumAlgorithm: 'sha256',
            presignedUploadExpiresAt: new Date(Date.now() + 3600_000),
            expiresAt: new Date(Date.now() + 86400_000),
          },
        });
      },
    );

    expect(mockQueue.enqueue.mock.calls).toHaveLength(0);

    await uploadsService.complete(
      orgContext(),
      upload.id,
      `idemp-upload-${randomUUID()}`,
      {
        byteCount: csvContent.length,
        checksumHex,
      },
    );

    await awaitKicks();

    expect(mockQueue.enqueue.mock.calls).toHaveLength(1);
    const enqueued = mockQueue.enqueue.mock.calls[0][0];
    expect(enqueued.jobName).toBe('upload.completed');
    expect(enqueued.deterministicKey).toBe(`upload.completed:${upload.id}`);

    const event = await tenants.workerScoped((tx) =>
      tx.outboxEvent.findFirstOrThrow({
        where: { aggregateId: upload.id, eventType: 'upload.completed' },
      }),
    );
    expect(event.state).toBe('dispatched');
    expect(event.dispatchedAt).not.toBeNull();
  });

  // ===========================================================================
  // 2. Ingestion startRun -> Kick -> Dispatch flow (Prompt 376 item 7)
  // ===========================================================================
  it('2. kicks on ingestionService.startRun and dispatches ingestion.run to queue', async () => {
    const { dataset, upload, mapping } = await tenants.organizationScoped(
      accountId,
      organizationId,
      async (tx) => {
        const storedObject = await tx.storedObject.create({
          data: {
            organizationId,
            bucket: 'test-bucket',
            objectKey: `ingestion/${randomUUID()}.csv`,
            originalFilename: 'ingest.csv',
            mediaType: 'text/csv',
            checksumAlgorithm: 'sha256',
          },
        });
        const upl = await tx.upload.create({
          data: {
            organizationId,
            actorAccountId: accountId,
            storedObjectId: storedObject.id,
            state: 'accepted',
            declaredFilename: 'ingest.csv',
            declaredMediaType: 'text/csv',
            declaredByteCount: 100,
            checksumAlgorithm: 'sha256',
            presignedUploadExpiresAt: new Date(),
            expiresAt: new Date(),
          },
        });
        const ds = await tx.dataset.create({
          data: {
            organizationId,
            ownerAccountId: accountId,
            name: 'Test Ingestion Dataset',
          },
        });
        const map = await tx.columnMapping.create({
          data: {
            organizationId,
            datasetId: ds.id,
            uploadId: upl.id,
            createdByAccountId: accountId,
            versionNumber: 1,
            mapping: { region: 'col1', value: 'col2' },
          },
        });
        return { dataset: ds, upload: upl, mapping: map };
      },
    );

    expect(mockQueue.enqueue.mock.calls).toHaveLength(0);

    const run = await ingestionService.startRun(
      orgContext(),
      dataset.id,
      `idemp-ingest-${randomUUID()}`,
      {
        uploadId: upload.id,
        mappingId: mapping.id,
      },
    );

    await awaitKicks();

    expect(mockQueue.enqueue.mock.calls).toHaveLength(1);
    const enqueued = mockQueue.enqueue.mock.calls[0][0];
    expect(enqueued.jobName).toBe('ingestion.run');
    expect(enqueued.deterministicKey).toBe(`ingestion.run:${run.id}`);

    const event = await tenants.workerScoped((tx) =>
      tx.outboxEvent.findFirstOrThrow({
        where: { aggregateId: run.id, eventType: 'ingestion.run' },
      }),
    );
    expect(event.state).toBe('dispatched');
    expect(event.dispatchedAt).not.toBeNull();
  });

  // ===========================================================================
  // 3. Reports createExport -> Kick -> Dispatch flow (Prompt 376 item 7)
  // ===========================================================================
  it('3. kicks on reportsService.createExport and dispatches export.requested to queue', async () => {
    const revision = await tenants.organizationScoped(
      accountId,
      organizationId,
      async (tx) => {
        const report = await tx.report.create({
          data: {
            organizationId,
            ownerAccountId: accountId,
            createdByAccountId: accountId,
            title: 'Export Test Report',
          },
        });
        return tx.reportRevision.create({
          data: {
            organizationId,
            reportId: report.id,
            revisionNumber: 1,
            status: 'published',
            publishedAt: new Date(),
            publisherAccountId: accountId,
            title: 'Export Test Revision',
            authorAccountId: accountId,
          },
        });
      },
    );

    expect(mockQueue.enqueue.mock.calls).toHaveLength(0);

    const exportReq = await reportsService.createExport(
      orgContext(),
      {
        revisionId: revision.id,
        format: 'csv',
      },
      `idemp-export-${randomUUID()}`,
    );

    await awaitKicks();

    expect(mockQueue.enqueue.mock.calls).toHaveLength(1);
    const enqueued = mockQueue.enqueue.mock.calls[0][0];
    expect(enqueued.jobName).toBe('export.requested');
    expect(enqueued.deterministicKey).toBe(`export.requested:${exportReq.id}`);

    const event = await tenants.workerScoped((tx) =>
      tx.outboxEvent.findFirstOrThrow({
        where: { aggregateId: exportReq.id, eventType: 'export.requested' },
      }),
    );
    expect(event.state).toBe('dispatched');
    expect(event.dispatchedAt).not.toBeNull();
  });

  // ===========================================================================
  // 4. Failed command does not kick or dispatch (Prompt 376 item 8)
  // ===========================================================================
  it('4. a failed command validation does not trigger kick or outbox dispatch', async () => {
    expect(() =>
      reportsService.createExport(
        orgContext(),
        {
          format: 'csv',
        },
        `idemp-fail-${randomUUID()}`,
      ),
    ).toThrow();

    await awaitKicks();

    expect(mockQueue.enqueue.mock.calls).toHaveLength(0);
    const eventCount = await tenants.workerScoped((tx) =>
      tx.outboxEvent.count({
        where: { organizationId },
      }),
    );
    expect(eventCount).toBe(0);
  });

  // ===========================================================================
  // 5. Inactive profile ('bullmq') does not kick (Prompt 376 item 9)
  // ===========================================================================
  it('5. does not kick when queueProvider is bullmq', async () => {
    jest.spyOn(config, 'queueProvider', 'get').mockReturnValue('bullmq');

    kick.afterCommit();
    await awaitKicks();

    expect(mockQueue.enqueue.mock.calls).toHaveLength(0);
  });

  // ===========================================================================
  // 6. Sweep rearms stale dispatched event and dispatches in same pass (Prompt 376 item 10)
  // ===========================================================================
  it('6. sweep() rearms stale dispatched event and dispatches in the same pass', async () => {
    const old = new Date('2020-01-01T00:00:00Z');

    const { event } = await tenants.workerScoped(async (tx) => {
      const storedObject = await tx.storedObject.create({
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
          storedObjectId: storedObject.id,
          state: 'completed',
          declaredFilename: 'data.csv',
          declaredMediaType: 'text/csv',
          declaredByteCount: 1,
          checksumAlgorithm: 'sha256',
          presignedUploadExpiresAt: old,
          expiresAt: old,
        },
      });
      const ev = await tx.outboxEvent.create({
        data: {
          organizationId,
          eventType: 'upload.completed',
          aggregateType: 'Upload',
          aggregateId: upload.id,
          aggregateVersion: 1,
          payload: { v: 1, jobName: 'upload.completed', id: upload.id },
          state: 'dispatched',
          attempts: 1,
          dispatchedAt: old,
          updatedAt: old,
        },
      });
      await tx.durableJob.create({
        data: {
          organizationId,
          jobType: 'upload.completed',
          deterministicKey: `upload.completed:${upload.id}`,
          uploadId: upload.id,
          state: 'queued',
          updatedAt: old,
        },
      });
      return { event: ev };
    });

    const result = await runner.sweep();

    expect(result.enabled).toBe(true);
    expect(result.reconciliation.rearmed).toBe(1);
    expect(result.dispatch.dispatched).toBe(1);
    expect(mockQueue.enqueue.mock.calls).toHaveLength(1);

    const updatedEvent = await tenants.workerScoped((tx) =>
      tx.outboxEvent.findUniqueOrThrow({
        where: { id: event.id },
      }),
    );
    expect(updatedEvent.state).toBe('dispatched');
    expect(updatedEvent.dispatchedAt!.getTime()).toBeGreaterThan(old.getTime());
  });

  // ===========================================================================
  // 7. Backlog drain: 60 events across 2 orgs in 3 passes (Prompt 376 item 11)
  // ===========================================================================
  it('7. drains a 60-event backlog across two organizations in 3 passes', async () => {
    await tenants.workerScoped(async (tx) => {
      for (let i = 0; i < 30; i++) {
        await outbox.appendUploadCompleted(tx, {
          organizationId,
          uploadId: randomUUID(),
          version: 1,
        });
      }
      for (let i = 0; i < 30; i++) {
        await outbox.appendUploadCompleted(tx, {
          organizationId: secondOrgId,
          uploadId: randomUUID(),
          version: 1,
        });
      }
    });

    const pendingCount = await tenants.workerScoped((tx) =>
      tx.outboxEvent.count({
        where: { state: 'pending' },
      }),
    );
    expect(pendingCount).toBe(60);

    const result = await runner.sweep();

    expect(result.enabled).toBe(true);
    // Batch size is 25: pass 1 = 25, pass 2 = 25, pass 3 = 10 -> total 3 passes
    expect(result.passes).toBe(3);
    expect(result.stoppedBy).toBe('drained');
    expect(result.dispatch.dispatched).toBe(60);
    expect(mockQueue.enqueue.mock.calls).toHaveLength(60);

    const remainingPending = await tenants.workerScoped((tx) =>
      tx.outboxEvent.count({
        where: { state: 'pending' },
      }),
    );
    expect(remainingPending).toBe(0);
  });

  // ===========================================================================
  // 8. Concurrency: 2 sweeps + 3 kicks over 60 events (Prompt 376 item 12)
  // ===========================================================================
  it('8. two sweeps and three kicks enqueue canonical keys exactly once', async () => {
    const uploadIds: string[] = [];
    await tenants.workerScoped(async (tx) => {
      for (let i = 0; i < 60; i++) {
        const id = randomUUID();
        uploadIds.push(id);
        await outbox.appendUploadCompleted(tx, {
          organizationId,
          uploadId: id,
          version: 1,
        });
      }
    });

    // Fire 2 sweeps and 3 kicks concurrently
    await Promise.all([
      runner.sweep(),
      runner.sweep(),
      Promise.resolve().then(() => {
        kick.afterCommit();
        kick.afterCommit();
        kick.afterCommit();
      }),
    ]);

    await awaitKicks();

    // Verify all 60 events are in dispatched state
    const dispatched = await tenants.workerScoped((tx) =>
      tx.outboxEvent.findMany({
        where: { organizationId, state: 'dispatched' },
      }),
    );
    expect(dispatched.length).toBe(60);

    const nonDispatched = await tenants.workerScoped((tx) =>
      tx.outboxEvent.count({
        where: { organizationId, state: { not: 'dispatched' } },
      }),
    );
    expect(nonDispatched).toBe(0);

    // Verify every uploadId was enqueued exactly once
    const enqueuedDeterministicKeys = mockQueue.enqueue.mock.calls.map(
      (call) => call[0].deterministicKey,
    );
    expect(enqueuedDeterministicKeys.length).toBe(60);
    expect(new Set(enqueuedDeterministicKeys).size).toBe(60);
  });

  // ===========================================================================
  // 9. Enqueue failure retries with backoff, advances nextAttemptAt (Prompt 376 item 13)
  // ===========================================================================
  it('9. retains event in pending state with backoff when enqueue fails', async () => {
    let failId: string;
    let succeedId: string;

    await tenants.workerScoped(async (tx) => {
      failId = randomUUID();
      succeedId = randomUUID();
      await outbox.appendUploadCompleted(tx, {
        organizationId,
        uploadId: failId,
        version: 1,
      });
      await outbox.appendUploadCompleted(tx, {
        organizationId,
        uploadId: succeedId,
        version: 1,
      });
    });

    mockQueue.enqueue.mockImplementation((input) => {
      if (input.deterministicKey === `upload.completed:${failId}`) {
        return Promise.reject(
          new Error('Simulated Vercel Queue publish failure'),
        );
      }
      return Promise.resolve();
    });

    const result = await runner.sweep();

    expect(result.dispatch.dispatched).toBe(1);
    expect(result.dispatch.retried).toBe(1);

    const failedEvent = await tenants.workerScoped((tx) =>
      tx.outboxEvent.findFirstOrThrow({
        where: { aggregateId: failId! },
      }),
    );
    expect(failedEvent.state).toBe('retrying');
    expect(failedEvent.attempts).toBe(1);
    expect(failedEvent.nextAttemptAt.getTime()).toBeGreaterThan(
      Date.now() - 1000,
    );

    const succeededEvent = await tenants.workerScoped((tx) =>
      tx.outboxEvent.findFirstOrThrow({
        where: { aggregateId: succeedId! },
      }),
    );
    expect(succeededEvent.state).toBe('dispatched');
    expect(succeededEvent.dispatchedAt).not.toBeNull();

    // Reset enqueue failure and advance nextAttemptAt to past
    mockQueue.enqueue.mockReset().mockResolvedValue(undefined);
    await tenants.workerScoped((tx) =>
      tx.outboxEvent.update({
        where: { id: failedEvent.id },
        data: { nextAttemptAt: new Date(Date.now() - 5000) },
      }),
    );

    const secondSweep = await runner.sweep();
    expect(secondSweep.dispatch.dispatched).toBe(1);

    const recoveredEvent = await tenants.workerScoped((tx) =>
      tx.outboxEvent.findUniqueOrThrow({
        where: { id: failedEvent.id },
      }),
    );
    expect(recoveredEvent.state).toBe('dispatched');
  });

  // ===========================================================================
  // 10. Vercel Cron HTTP handler authorization and status table
  // ===========================================================================
  describe('10. Vercel Cron HTTP handler', () => {
    const validSecret = 'valid-test-cron-secret-that-is-at-least-32-chars-long';
    let handler: (request: Request) => Promise<Response>;

    beforeEach(() => {
      jest.spyOn(config, 'cronSecret', 'get').mockReturnValue(validSecret);
      handler = createDispatchHandler({
        resolveRuntime: () => Promise.resolve(runner),
        readSecret: () => config.cronSecret,
      });
    });

    it('returns 200 with summary on valid Authorization: Bearer <secret>', async () => {
      const req = new Request('https://test.example/api/cron/dispatch', {
        method: 'GET',
        headers: {
          authorization: `Bearer ${validSecret}`,
        },
      });

      const res = await handler(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      const body = (await res.json()) as {
        ok: boolean;
        passes: number;
        dispatchedCount: number;
        stoppedBy: string;
      };
      expect(body.ok).toBe(true);
      expect(typeof body.passes).toBe('number');
      expect(typeof body.stoppedBy).toBe('string');
    });

    it('returns 401 on wrong secret', async () => {
      const req = new Request('https://test.example/api/cron/dispatch', {
        method: 'GET',
        headers: {
          authorization:
            'Bearer wrong-secret-of-length-that-is-at-least-32-characters',
        },
      });

      const res = await handler(req);
      expect(res.status).toBe(401);
      const body = (await res.json()) as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toBe('unauthorized');
    });

    it('returns 401 on missing Authorization header', async () => {
      const req = new Request('https://test.example/api/cron/dispatch', {
        method: 'GET',
      });

      const res = await handler(req);
      expect(res.status).toBe(401);
      const body = (await res.json()) as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toBe('unauthorized');
    });

    it('returns 503 when cronSecret is unset', async () => {
      jest.spyOn(config, 'cronSecret', 'get').mockReturnValue(undefined);

      const req = new Request('https://test.example/api/cron/dispatch', {
        method: 'GET',
        headers: {
          authorization: `Bearer ${validSecret}`,
        },
      });

      const res = await handler(req);
      expect(res.status).toBe(503);
      const body = (await res.json()) as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toBe('dispatch_unavailable');
    });

    it('returns 500 when sweep rejects', async () => {
      const failingRunner = {
        sweep: jest
          .fn()
          .mockRejectedValue(new Error('Sweep failed unexpectedly')),
      };
      const failingHandler = createDispatchHandler({
        resolveRuntime: () => Promise.resolve(failingRunner),
        readSecret: () => validSecret,
      });

      const req = new Request('https://test.example/api/cron/dispatch', {
        method: 'GET',
        headers: {
          authorization: `Bearer ${validSecret}`,
        },
      });

      const res = await failingHandler(req);
      expect(res.status).toBe(500);
      const body = (await res.json()) as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toBe('dispatch_failed');
    });
  });
});
