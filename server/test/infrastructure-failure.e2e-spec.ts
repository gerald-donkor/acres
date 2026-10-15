import { JobProcessorService } from '../src/worker/job-processor.service';
import { JobLeaseService } from '../src/worker/job-lease.service';
import {
  AggregateNotVisibleError,
  JobAttemptsExhaustedError,
  JobLeaseBusyError,
  LeasedJobExecutorService,
} from '../src/worker/leased-job-executor.service';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from '../src/worker/worker.module';
import { VercelJobsModule } from '../src/vercel/vercel-jobs.module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantTransactionService } from '../src/prisma/tenant-transaction.service';
import { AcresConfigService } from '../src/config/acres-config.service';
import {
  UploadWorkerService,
  WORKER_EXCEPTION_MESSAGE,
  REJECTED_SCAN_MESSAGE,
} from '../src/worker/upload-worker.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { IngestionProcessorService } from '../src/ingestion/ingestion-processor.service';
import { ReportsService } from '../src/reports/reports.service';
import { ClamavScannerAdapter } from '../src/scanner/clamav-scanner.adapter';
import { S3ObjectStorageAdapter } from '../src/storage/s3-object-storage.adapter';
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from '../src/storage/storage.port';
import type { MalwareScannerPort } from '../src/scanner/scanner.port';
import type { QueuePort } from '../src/queue/work-queue.port';
import { createRealDbTestApp, truncateAll } from './helpers/real-db-test-app';

import { reconcileObjects } from '../../scripts/ops/reconcile-storage-objects.js';

describe('Acres Infrastructure Failure and Outage Acceptance — Real Database E2E', () => {
  let app: INestApplication;
  let server: App;
  let prisma: PrismaService;
  let tenants: TenantTransactionService;
  let config: AcresConfigService;
  let outbox: OutboxService;
  let processor: IngestionProcessorService;
  let reportsService: ReportsService;

  let mockScanner: jest.Mocked<MalwareScannerPort>;
  let mockStorage: jest.Mocked<ObjectStoragePort>;
  let mockQueue: jest.Mocked<QueuePort>;
  let worker: UploadWorkerService;

  const storageMap = new Map<
    string,
    { body: Buffer; mediaType: string; checksumHex: string }
  >();

  beforeAll(async () => {
    ({ app, prisma } = await createRealDbTestApp());
    server = app.getHttpServer() as App;
    tenants = app.get(TenantTransactionService);
    config = app.get(AcresConfigService);
    outbox = app.get(OutboxService);
    processor = app.get(IngestionProcessorService);
    reportsService = app.get(ReportsService);

    // Verify PostGIS and DB connectivity
    try {
      await prisma.$queryRaw`SELECT PostGIS_Version()`;
    } catch {
      throw new Error(
        'acres_test PostgreSQL/PostGIS is unreachable or unmigrated; please ensure PostgreSQL is running.',
      );
    }

    // Configure the Nest application's OBJECT_STORAGE double for REST controllers
    const appStorage = app.get<jest.Mocked<ObjectStoragePort>>(OBJECT_STORAGE);
    appStorage.presignPut.mockImplementation((input) =>
      Promise.resolve({
        url: `http://localhost:3900/test/${input.key}`,
        method: 'PUT' as const,
        headers: {},
        expiresAt: new Date(Date.now() + 3600_000),
      }),
    );
    appStorage.presignGet.mockImplementation((input) =>
      Promise.resolve({
        url: `http://localhost:3900/test/${input.key}?download=${encodeURIComponent(input.filename)}`,
        method: 'GET' as const,
        headers: {},
        expiresAt: new Date(Date.now() + 3600_000),
      }),
    );
    appStorage.putBuffer.mockImplementation((input) => {
      storageMap.set(input.key, {
        body: input.body,
        mediaType: input.mediaType,
        checksumHex: input.checksumHex,
      });
      return Promise.resolve();
    });
    appStorage.getBuffer.mockImplementation((key) => {
      return Promise.resolve(storageMap.get(key)?.body ?? null);
    });
    appStorage.stat.mockImplementation((key) => {
      const item = storageMap.get(key);
      if (!item) return Promise.resolve(null);
      return Promise.resolve({
        byteCount: BigInt(item.body.length),
        mediaType: item.mediaType,
        checksumHex: item.checksumHex,
      });
    });
    appStorage.readiness.mockResolvedValue(true);

    mockScanner = {
      scanBuffer: jest.fn(),
      readiness: jest.fn().mockResolvedValue(true),
    };

    mockStorage = {
      presignPut: jest.fn(),
      presignGet: jest.fn(),
      putBuffer: jest.fn(),
      getBuffer: jest.fn(),
      stat: jest.fn(),
      delete: jest.fn(),
      readiness: jest.fn().mockResolvedValue(true),
    };

    mockQueue = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      readiness: jest.fn().mockResolvedValue(true),
      close: jest.fn().mockResolvedValue(undefined),
    };

    // Instantiate worker with the real PostgreSQL tenant transaction service and outbox
    worker = new UploadWorkerService(
      config,
      tenants,
      outbox,
      mockQueue,
      new JobProcessorService(
        config,
        tenants,
        mockScanner,
        mockStorage,
        processor,
        reportsService,
      ),
    );
  });

  beforeEach(async () => {
    storageMap.clear();
    jest.clearAllMocks();
    await truncateAll(prisma);

    mockScanner.scanBuffer.mockResolvedValue({ status: 'clean' });
    mockScanner.readiness.mockResolvedValue(true);

    mockStorage.getBuffer.mockImplementation((key: string) => {
      const found = storageMap.get(key);
      return Promise.resolve(found ? found.body : null);
    });
    mockStorage.readiness.mockResolvedValue(true);
    mockQueue.enqueue.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app?.close();
  });

  async function csrfAgent() {
    const agent = request.agent(server);
    const response = await agent.get('/api/v1/auth/csrf').expect(200);
    const body = response.body as {
      data: { csrfToken: string; headerName: string };
    };
    return { agent, token: body.data.csrfToken };
  }

  async function signedInAgent(email: string, displayName = 'Test User') {
    const { agent, token } = await csrfAgent();
    await agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', token)
      .send({
        email,
        password: 'a-long-and-secure-password-123',
        displayName,
      })
      .expect(201);
    const csrf = await agent.get('/api/v1/auth/csrf').expect(200);
    return {
      agent,
      token: (csrf.body as { data: { csrfToken: string } }).data.csrfToken,
      email,
    };
  }

  async function createOrganization(
    actor: Awaited<ReturnType<typeof signedInAgent>>,
    key: string,
    name: string,
  ): Promise<{ id: string }> {
    const response = await actor.agent
      .post('/api/v1/organizations')
      .set('Idempotency-Key', `${key}-idempotency-key`)
      .set('x-csrf-token', actor.token)
      .send({ name })
      .expect(201);
    return (response.body as { data: { id: string } }).data;
  }

  async function createCompletedUpload(
    owner: Awaited<ReturnType<typeof signedInAgent>>,
    orgId: string,
    keyPrefix: string,
    content: string,
  ) {
    const bytes = Buffer.from(content, 'utf-8');
    const checksum = createHash('sha256').update(bytes).digest('hex');

    const initRes = await owner.agent
      .post('/api/v1/uploads')
      .set('x-acres-organization-id', orgId)
      .set('Idempotency-Key', `${keyPrefix}-init-idempotency-key`)
      .set('x-csrf-token', owner.token)
      .send({
        filename: `${keyPrefix}.csv`,
        mediaType: 'text/csv',
        byteCount: bytes.length,
        checksumHex: checksum,
      })
      .expect(201);

    const uploadData = (
      initRes.body as { data: { uploadId: string; object: { key: string } } }
    ).data;
    const uploadId = uploadData.uploadId;
    const objectKey = uploadData.object.key;

    storageMap.set(objectKey, {
      body: bytes,
      mediaType: 'text/csv',
      checksumHex: checksum,
    });

    await owner.agent
      .post(`/api/v1/uploads/${uploadId}/complete`)
      .set('x-acres-organization-id', orgId)
      .set('Idempotency-Key', `${keyPrefix}-comp-idempotency-key`)
      .set('x-csrf-token', owner.token)
      .send({
        byteCount: bytes.length,
        checksumHex: checksum,
      })
      .expect(200);

    return { uploadId, objectKey, bytes, checksum };
  }

  // ===========================================================================
  // 1. ClamAV Antivirus Outages, Timeouts, and Infected Detection
  // ===========================================================================
  describe('1. ClamAV Antivirus Failure Modes (Fail-Closed Posture)', () => {
    it('1A: handles scanner unavailable / socket error: rejects upload and dead-letters job', async () => {
      const owner = await signedInAgent('owner-clamav-1@example.com');
      const org = await createOrganization(
        owner,
        'org-clamav-1',
        'Org ClamAV 1',
      );
      const { uploadId } = await createCompletedUpload(
        owner,
        org.id,
        'scan-unavailable',
        'col1,col2\nval1,val2\n',
      );

      // Simulate ClamAV daemon offline/unreachable
      mockScanner.scanBuffer.mockResolvedValueOnce({
        status: 'failed',
        errorCode: 'scanner_unavailable',
      });

      await worker.process({ uploadId });

      // Verify real database state in PostgreSQL
      const upload = await tenants.workerScoped((tx) =>
        tx.upload.findUniqueOrThrow({
          where: { id: uploadId },
          include: { storedObject: true },
        }),
      );
      expect(upload.state).toBe('rejected');
      expect(upload.scanStatus).toBe('failed');
      expect(upload.scanResult).toBe('scanner_unavailable');
      expect(upload.failureCode).toBe('scanner_unavailable');
      expect(upload.failureMessage).toBe(REJECTED_SCAN_MESSAGE);
      expect(upload.storedObject.state).toBe('rejected');

      const durableJob = await tenants.workerScoped((tx) =>
        tx.durableJob.findUniqueOrThrow({
          where: { deterministicKey: `upload.completed:${uploadId}` },
        }),
      );
      expect(durableJob.state).toBe('failed');
      expect(durableJob.lastErrorCode).toBe('scanner_unavailable');
      expect(durableJob.lastErrorMessage).toBe(REJECTED_SCAN_MESSAGE);

      const deadLetter = await tenants.workerScoped((tx) =>
        tx.jobDeadLetter.findFirstOrThrow({
          where: { durableJobId: durableJob.id },
        }),
      );
      expect(deadLetter.reasonCode).toBe('scanner_unavailable');
      expect(deadLetter.reasonMessage).toBe(REJECTED_SCAN_MESSAGE);
      expect(deadLetter.organizationId).toBe(org.id);
    });

    it('1B: handles scanner timeout: fail-closed rejection without publishing uninspected data', async () => {
      const owner = await signedInAgent('owner-clamav-2@example.com');
      const org = await createOrganization(
        owner,
        'org-clamav-2',
        'Org ClamAV 2',
      );
      const { uploadId } = await createCompletedUpload(
        owner,
        org.id,
        'scan-timeout',
        'col1,col2\nval1,val2\n',
      );

      // Simulate ClamAV socket timeout
      mockScanner.scanBuffer.mockResolvedValueOnce({
        status: 'failed',
        errorCode: 'scanner_timeout',
      });

      await worker.process({ uploadId });

      const upload = await tenants.workerScoped((tx) =>
        tx.upload.findUniqueOrThrow({
          where: { id: uploadId },
        }),
      );
      expect(upload.state).toBe('rejected');
      expect(upload.scanStatus).toBe('failed');
      expect(upload.failureCode).toBe('scanner_timeout');

      const deadLetter = await tenants.workerScoped((tx) =>
        tx.jobDeadLetter.findFirstOrThrow({
          where: { payload: { path: ['uploadId'], equals: uploadId } },
        }),
      );
      expect(deadLetter.reasonCode).toBe('scanner_timeout');
    });

    it('1C: rejects infected file without persisting raw malware signature to database', async () => {
      const owner = await signedInAgent('owner-clamav-3@example.com');
      const org = await createOrganization(
        owner,
        'org-clamav-3',
        'Org ClamAV 3',
      );
      const { uploadId } = await createCompletedUpload(
        owner,
        org.id,
        'scan-infected',
        'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
      );

      // Simulate malware signature detection
      const rawSignature = 'Win.Test.EICAR_HDB-1';
      mockScanner.scanBuffer.mockResolvedValueOnce({
        status: 'infected',
        signature: rawSignature,
      });

      await worker.process({ uploadId });

      const upload = await tenants.workerScoped((tx) =>
        tx.upload.findUniqueOrThrow({
          where: { id: uploadId },
        }),
      );
      expect(upload.state).toBe('rejected');
      expect(upload.scanStatus).toBe('infected');
      expect(upload.scanResult).toBe('infected');
      expect(upload.failureCode).toBe('infected');
      expect(upload.failureMessage).toBe(REJECTED_SCAN_MESSAGE);
      // Raw signature must never leak to durable columns
      expect(upload.failureMessage).not.toContain(rawSignature);

      const deadLetter = await tenants.workerScoped((tx) =>
        tx.jobDeadLetter.findFirstOrThrow({
          where: { payload: { path: ['uploadId'], equals: uploadId } },
        }),
      );
      expect(deadLetter.reasonCode).toBe('infected');
      expect(deadLetter.reasonMessage).toBe(REJECTED_SCAN_MESSAGE);
      expect(deadLetter.reasonMessage).not.toContain(rawSignature);
    });

    it('1D: ClamavScannerAdapter socket error & timeout probe resolves failed and not-ready', async () => {
      const deadConfig = {
        clamavHost: '127.0.0.1',
        clamavPort: 65530, // Unused port where daemon is absent
        clamavScanTimeoutMs: 100,
      } as AcresConfigService;

      const adapter = new ClamavScannerAdapter(deadConfig);
      const scan = await adapter.scanBuffer(Buffer.from('test buffer'));
      expect(scan.status).toBe('failed');
      expect(scan.errorCode).toBe('scanner_unavailable');

      const ready = await adapter.readiness();
      expect(ready).toBe(false);
    });
  });

  // ===========================================================================
  // 2. Object Storage / Garage Outages, Missing Keys, and Sanitized Logging
  // ===========================================================================
  describe('2. Object Storage Failure Modes and Sanitized Logging', () => {
    it('2A: handles missing storage buffer: marks upload rejected and dead-letters object_missing', async () => {
      const owner = await signedInAgent('owner-storage-1@example.com');
      const org = await createOrganization(
        owner,
        'org-storage-1',
        'Org Storage 1',
      );
      const { uploadId } = await createCompletedUpload(
        owner,
        org.id,
        'missing-buf',
        'data1,data2\n',
      );

      // Force storage getBuffer to return null (buffer disappeared from storage)
      mockStorage.getBuffer.mockResolvedValueOnce(null);

      await worker.process({ uploadId });

      const upload = await tenants.workerScoped((tx) =>
        tx.upload.findUniqueOrThrow({
          where: { id: uploadId },
        }),
      );
      expect(upload.state).toBe('rejected');
      expect(upload.scanStatus).toBe('failed');
      expect(upload.failureCode).toBe('object_missing');

      const deadLetter = await tenants.workerScoped((tx) =>
        tx.jobDeadLetter.findFirstOrThrow({
          where: { payload: { path: ['uploadId'], equals: uploadId } },
        }),
      );
      expect(deadLetter.reasonCode).toBe('object_missing');
    });

    it('2B: handles storage network exception: captures worker_exception with sanitized message', async () => {
      const owner = await signedInAgent('owner-storage-2@example.com');
      const org = await createOrganization(
        owner,
        'org-storage-2',
        'Org Storage 2',
      );
      const { uploadId } = await createCompletedUpload(
        owner,
        org.id,
        'storage-err',
        'data1,data2\n',
      );

      const secretUrl =
        'http://internal-garage-s3.local:3900/secret-bucket/key';
      mockStorage.getBuffer.mockRejectedValueOnce(
        new Error(`Connection refused to S3 endpoint: ${secretUrl}`),
      );

      // Worker finalizeException handles it and re-throws
      await expect(worker.process({ uploadId })).rejects.toThrow(
        /Connection refused to S3 endpoint/,
      );

      const durableJob = await tenants.workerScoped((tx) =>
        tx.durableJob.findUniqueOrThrow({
          where: { deterministicKey: `upload.completed:${uploadId}` },
        }),
      );
      expect(durableJob.state).toBe('failed');
      expect(durableJob.lastErrorCode).toBe('worker_exception');
      expect(durableJob.lastErrorMessage).toBe(WORKER_EXCEPTION_MESSAGE);
      expect(durableJob.lastErrorMessage).not.toContain(secretUrl);

      const deadLetter = await tenants.workerScoped((tx) =>
        tx.jobDeadLetter.findFirstOrThrow({
          where: { durableJobId: durableJob.id },
        }),
      );
      expect(deadLetter.reasonCode).toBe('worker_exception');
      expect(deadLetter.reasonMessage).toBe(WORKER_EXCEPTION_MESSAGE);
      expect(deadLetter.reasonMessage).not.toContain(secretUrl);
    });

    it('2C: S3ObjectStorageAdapter readiness probe returns false during endpoint outage', async () => {
      const deadConfig = {
        storageEndpoint: 'http://127.0.0.1:65531',
        storageRegion: 'garage',
        storageForcePathStyle: true,
        storageAccessKeyId: 'test-key',
        storageSecretAccessKey: 'test-secret',
        storageBucket: 'acres-quarantine',
        presignedUploadTtlSeconds: 900,
        acceptedDownloadTtlSeconds: 900,
      } as AcresConfigService;

      const adapter = new S3ObjectStorageAdapter(deadConfig);
      const ready = await adapter.readiness();
      expect(ready).toBe(false);
    });
  });

  // ===========================================================================
  // 3. Work Queue / Valkey Outages, Retries, and Dead-Letter Progression
  // ===========================================================================
  describe('3. Work Queue Failure Modes, Retries, and Dead-Letter Progression', () => {
    it('3A: queue enqueue failure triggers retry backoff when attempts < maxAttempts', async () => {
      const owner = await signedInAgent('owner-queue-1@example.com');
      const org = await createOrganization(owner, 'org-queue-1', 'Org Queue 1');

      // Append upload.completed event to transactional outbox
      const event = await tenants.workerScoped((tx) =>
        outbox.appendUploadCompleted(tx, {
          organizationId: org.id,
          uploadId: 'upload-queue-test-1',
          version: 1,
        }),
      );

      // Simulate Valkey queue connection error
      mockQueue.enqueue.mockRejectedValueOnce(
        new Error('Valkey connection ECONNREFUSED 127.0.0.1:6379'),
      );

      await worker.dispatchOutboxOnce();

      const updated = await tenants.workerScoped((tx) =>
        tx.outboxEvent.findUniqueOrThrow({
          where: { id: event.id },
        }),
      );
      expect(updated.state).toBe('retrying');
      expect(updated.lastErrorCode).toBe('queue_unavailable');
      expect(updated.attempts).toBe(1);
      expect(updated.nextAttemptAt.getTime()).toBeGreaterThan(
        Date.now() - 1000,
      );

      // No dead letter created while attempts < maxAttempts
      const deadLetter = await tenants.workerScoped((tx) =>
        tx.jobDeadLetter.findFirst({
          where: { outboxEventId: event.id },
        }),
      );
      expect(deadLetter).toBeNull();
    });

    it('3B: outbox dispatch exhaustion transitions event to dead_lettered with durable record', async () => {
      const owner = await signedInAgent('owner-queue-2@example.com');
      const org = await createOrganization(owner, 'org-queue-2', 'Org Queue 2');

      const event = await tenants.workerScoped((tx) =>
        outbox.appendUploadCompleted(tx, {
          organizationId: org.id,
          uploadId: 'upload-queue-exhaust-1',
          version: 1,
        }),
      );

      // Fast-forward attempts to maximum threshold
      await tenants.workerScoped((tx) =>
        tx.outboxEvent.update({
          where: { id: event.id },
          data: {
            attempts: event.maxAttempts - 1,
            nextAttemptAt: new Date(Date.now() - 5000),
          },
        }),
      );

      // Queue continues to throw
      mockQueue.enqueue.mockRejectedValueOnce(
        new Error('Valkey connection ECONNREFUSED 127.0.0.1:6379'),
      );

      await worker.dispatchOutboxOnce();

      const updated = await tenants.workerScoped((tx) =>
        tx.outboxEvent.findUniqueOrThrow({
          where: { id: event.id },
        }),
      );
      expect(updated.state).toBe('dead_lettered');
      expect(updated.lastErrorCode).toBe('queue_unavailable');
      expect(updated.attempts).toBe(event.maxAttempts);

      const deadLetter = await tenants.workerScoped((tx) =>
        tx.jobDeadLetter.findFirstOrThrow({
          where: { outboxEventId: event.id },
        }),
      );
      expect(deadLetter.reasonCode).toBe('queue_unavailable');
      expect(deadLetter.reasonMessage).toBe(
        'Outbox dispatch attempts exhausted.',
      );
      expect(deadLetter.organizationId).toBe(org.id);
    });
  });

  // ===========================================================================
  // 4. Worker Crash & Lease Expiration Recovery (At-Least-Once Delivery)
  // ===========================================================================
  describe('4. Worker Crash & Lease Expiration Recovery', () => {
    it('4A: expired worker lock is safely reclaimed by restarting worker via SKIP LOCKED', async () => {
      const owner = await signedInAgent('owner-crash-1@example.com');
      const org = await createOrganization(owner, 'org-crash-1', 'Org Crash 1');

      // Create an outbox event held by a crashed worker whose lease expired in the past
      const crashedEvent = await tenants.workerScoped((tx) =>
        tx.outboxEvent.create({
          data: {
            organizationId: org.id,
            eventType: 'upload.completed',
            aggregateType: 'Upload',
            aggregateId: 'upload-crash-recovery-1',
            aggregateVersion: 1,
            payload: { uploadId: 'upload-crash-recovery-1' },
            state: 'retrying',
            lockedBy: 'crashed-worker-pid-9999',
            lockedUntil: new Date(Date.now() - 30_000), // lease expired 30s ago
            nextAttemptAt: new Date(Date.now() - 30_000),
            attempts: 1,
            maxAttempts: 5,
          },
        }),
      );

      // Restarting worker claims ready events
      const claimed = await outbox.claimReady();
      const match = claimed.find((e) => e.id === crashedEvent.id);
      expect(match).toBeDefined();
      expect(match?.attempts).toBe(2);

      const reLeased = await tenants.workerScoped((tx) =>
        tx.outboxEvent.findUniqueOrThrow({
          where: { id: crashedEvent.id },
        }),
      );
      expect(reLeased.lockedBy).not.toBe('crashed-worker-pid-9999');
      expect(reLeased.lockedBy).toBeTruthy();
      expect(reLeased.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
      expect(reLeased.attempts).toBe(2);

      // Worker dispatches claimed event cleanly
      await outbox.markDispatched(crashedEvent.id);
      const dispatched = await tenants.workerScoped((tx) =>
        tx.outboxEvent.findUniqueOrThrow({
          where: { id: crashedEvent.id },
        }),
      );
      expect(dispatched.state).toBe('dispatched');
      expect(dispatched.lockedBy).toBeNull();
      expect(dispatched.lockedUntil).toBeNull();
    });
  });

  // ===========================================================================
  // 5. Ingestion Parser Containment and Rollback
  // ===========================================================================
  // Note: real-db-test-app configures InProcessParserExecutor to test database
  // transactional rollback and schema cleanliness on parsing failure. Process-level
  // isolation and timeout containment are tested in child-process-parser.executor.spec.ts.
  describe('5. Ingestion Parser Containment & Transactional Rollback', () => {
    it('5A: malformed data parsing fails safely with zero partial publication or state corruption', async () => {
      const owner = await signedInAgent('owner-parser-1@example.com');
      const org = await createOrganization(
        owner,
        'org-parser-1',
        'Org Parser 1',
      );

      // Seed valid region source & region
      const source = await prisma.regionSource.create({
        data: {
          name: 'gbOpen Parser Source',
          provider: 'geoBoundaries',
          codeSystem: 'ISO-3166-2',
          sourceVersion: '1.0',
          sourceDate: new Date('2026-01-01'),
          license: 'CC-BY-4.0',
          provenanceUrl: 'https://example.com',
        },
      });
      const region = await prisma.region.create({
        data: {
          slug: 'california-parser',
          name: 'California',
          countryCode: 'USA',
          level: 'ADM1',
          regionType: 'State',
        },
      });
      await prisma.regionCode.create({
        data: {
          regionId: region.id,
          sourceId: source.id,
          codeSystem: 'ISO-3166-2',
          code: 'US-CA',
          normalized: 'us-ca',
        },
      });

      // Create upload with corrupt content
      const corruptContent =
        'region,metric_val,year\nUNMATCHED-REGION-CODE-9999,not-a-number,invalid-year\n';
      const { uploadId } = await createCompletedUpload(
        owner,
        org.id,
        'parser-corrupt',
        corruptContent,
      );

      // Accept upload in worker scope
      await tenants.workerScoped((tx) =>
        tx.upload.update({
          where: { id: uploadId },
          data: {
            state: 'accepted',
            scanStatus: 'clean',
            scanResult: 'clean',
          },
        }),
      );

      // Create dataset
      const datasetRes = await owner.agent
        .post('/api/v1/datasets')
        .set('x-acres-organization-id', org.id)
        .set('Idempotency-Key', 'parser-fail-dataset-idemp')
        .set('x-csrf-token', owner.token)
        .send({
          name: 'Corrupt Dataset',
          description: 'Testing parser failure containment',
        })
        .expect(201);
      const datasetId = (datasetRes.body as { data: { id: string } }).data.id;

      // Configure mapping
      const mappingRes = await owner.agent
        .post(`/api/v1/datasets/${datasetId}/mappings`)
        .set('x-acres-organization-id', org.id)
        .set('Idempotency-Key', 'parser-fail-mapping-idemp')
        .set('x-csrf-token', owner.token)
        .send({
          uploadId,
          mapping: {
            regionColumn: 'region',
            metrics: [
              {
                column: 'metric_val',
                key: 'parser_test_metric',
                label: 'Parser Test Metric',
                valueType: 'numeric',
                unit: 'units',
                aggregation: 'sum',
                periodColumn: 'year',
              },
            ],
          },
        })
        .expect(201);
      const mappingId = (mappingRes.body as { data: { id: string } }).data.id;

      // Queue ingestion run
      const runRes = await owner.agent
        .post(`/api/v1/datasets/${datasetId}/ingestion-runs`)
        .set('x-acres-organization-id', org.id)
        .set('Idempotency-Key', 'parser-fail-run-idemp')
        .set('x-csrf-token', owner.token)
        .send({ uploadId, mappingId })
        .expect(201);
      const runId = (runRes.body as { data: { id: string } }).data.id;

      // Execute processor
      await processor.processRun(runId);

      const run = await tenants.workerScoped((tx) =>
        tx.ingestionRun.findUniqueOrThrow({
          where: { id: runId },
        }),
      );
      // Ingestion must terminate in validation_failed or failed
      expect(['validation_failed', 'failed']).toContain(run.state);

      // Verify zero partial versions or observations were committed to database
      const versionCount = await tenants.workerScoped((tx) =>
        tx.datasetVersion.count({
          where: { datasetId, organizationId: org.id },
        }),
      );
      expect(versionCount).toBe(0);

      const obsCount = await tenants.workerScoped((tx) =>
        tx.metricObservation.count({
          where: { organizationId: org.id },
        }),
      );
      expect(obsCount).toBe(0);

      const aggCount = await tenants.workerScoped((tx) =>
        tx.metricAggregate.count({
          where: { organizationId: org.id },
        }),
      );
      expect(aggCount).toBe(0);
    });
  });

  // ===========================================================================
  // 6. Database Restore Drill & Storage Reconciliation Parity
  // ===========================================================================
  // Note: 6A tests deterministic reconciliation parity logic and 6B validates
  // restore script CLI contracts, complementing operator-owned live disaster recovery drills.
  describe('6. Database Restore Drill & Storage Reconciliation Parity', () => {
    it('6A: storage reconciliation identifies orphans and checksum mismatches deterministically', () => {
      const dbObjects = [
        {
          id: 'obj-matched',
          organizationId: 'org-1',
          bucket: 'acres-quarantine',
          objectKey: 'tenant/clean.csv',
          state: 'accepted' as const,
          byteCount: 120,
          checksumHex: 'a'.repeat(64),
          createdAt: new Date(),
        },
        {
          id: 'obj-mismatched',
          organizationId: 'org-1',
          bucket: 'acres-quarantine',
          objectKey: 'tenant/tampered.csv',
          state: 'accepted' as const,
          byteCount: 200,
          checksumHex: 'b'.repeat(64),
          createdAt: new Date(),
        },
      ];

      const storageObjects = [
        {
          key: 'tenant/clean.csv',
          size: 120,
          checksumHex: 'a'.repeat(64), // matches
        },
        {
          key: 'tenant/tampered.csv',
          size: 200,
          checksumHex: 'c'.repeat(64), // checksum mismatch ('c' vs 'b')
        },
        {
          key: 'tenant/untracked-orphan.csv',
          size: 80,
          checksumHex: 'd'.repeat(64), // orphan (not in DB)
        },
      ];

      const report = reconcileObjects({
        dbObjects,
        storageObjects,
        options: {
          bucket: 'acres-quarantine',
          excludeQuarantined: false,
          failOnOrphans: false,
        },
      });

      expect(report.summary.matchedObjects).toBe(1);
      expect(report.summary.mismatchedObjects).toBe(1);
      expect(report.summary.orphanObjects).toBe(1);
      expect(report.summary.missingObjects).toBe(0);
      expect(report.orphans[0].key).toBe('tenant/untracked-orphan.csv');
      expect(report.mismatches[0].objectKey).toBe('tenant/tampered.csv');
    });

    it('6B: restore drill script provides verified CLI contracts and options', () => {
      const scriptPath = resolve(
        __dirname,
        '../../scripts/ops/run-restore-drill.sh',
      );
      const helpOutput = execFileSync('bash', [scriptPath, '--help'], {
        encoding: 'utf-8',
      });

      expect(helpOutput).toContain('--source-db <name>');
      expect(helpOutput).toContain('--drill-db <name>');
      expect(helpOutput).toContain('--backup-dir <dir>');
      expect(helpOutput).toContain('--rto-target-seconds <sec>');
      expect(helpOutput).toContain('--dry-run');
    });
  });

  // ===========================================================================
  // 7. Vercel Queues at-least-once delivery: database execution lease
  // ===========================================================================
  describe('7. Execution Lease for At-Least-Once Queue Delivery', () => {
    function services() {
      const leases = new JobLeaseService(tenants, config);
      const executor = new LeasedJobExecutorService(
        tenants,
        leases,
        new JobProcessorService(
          config,
          tenants,
          mockScanner,
          mockStorage,
          processor,
          reportsService,
        ),
      );
      return { leases, executor };
    }

    it('7A: concurrent claims on one job grant exactly one live lease', async () => {
      const owner = await signedInAgent('owner-lease-1@example.com');
      const org = await createOrganization(owner, 'org-lease-1', 'Org Lease 1');
      const { leases } = services();
      const target = {
        deterministicKey: 'export.requested:lease-concurrency-1',
        jobType: 'export.requested',
        organizationId: org.id,
        uploadId: null,
      };

      const claims = await Promise.all(
        Array.from({ length: 6 }, () => leases.acquire(target)),
      );
      const granted = claims.filter((claim) => claim !== null);
      expect(granted).toHaveLength(1);
      expect(await leases.remainingMs(target.deterministicKey)).toBeGreaterThan(
        config.jobLeaseMs - 10_000,
      );

      const row = await tenants.workerScoped((tx) =>
        tx.durableJob.findUniqueOrThrow({
          where: { deterministicKey: target.deterministicKey },
        }),
      );
      // Tenant linkage comes from the resolved owner, never a null-org row.
      expect(row.organizationId).toBe(org.id);
      expect(row.leaseOwner).toBe(granted[0].owner);

      await leases.release(granted[0]);
      const reclaimed = await leases.acquire(target);
      expect(reclaimed).not.toBeNull();
      expect(reclaimed!.durableJobId).toBe(granted[0].durableJobId);
    });

    it('7B: an expired lease is reclaimable and a stale owner cannot release the new one', async () => {
      const owner = await signedInAgent('owner-lease-2@example.com');
      const org = await createOrganization(owner, 'org-lease-2', 'Org Lease 2');
      const { leases } = services();
      const target = {
        deterministicKey: 'export.requested:lease-expiry-1',
        jobType: 'export.requested',
        organizationId: org.id,
        uploadId: null,
      };
      const lost = await leases.acquire(target);
      expect(lost).not.toBeNull();
      expect(await leases.acquire(target)).toBeNull();

      await tenants.workerScoped((tx) =>
        tx.durableJob.update({
          where: { id: lost!.durableJobId },
          data: { leaseUntil: new Date(Date.now() - 1_000) },
        }),
      );
      const successor = await leases.acquire(target);
      expect(successor).not.toBeNull();
      expect(successor!.owner).not.toBe(lost!.owner);

      await leases.release(lost!);
      const row = await tenants.workerScoped((tx) =>
        tx.durableJob.findUniqueOrThrow({
          where: { id: lost!.durableJobId },
        }),
      );
      expect(row.leaseOwner).toBe(successor!.owner);
    });

    it('7C: rejects a half-written lease at the database', async () => {
      const owner = await signedInAgent('owner-lease-3@example.com');
      const org = await createOrganization(owner, 'org-lease-3', 'Org Lease 3');
      await expect(
        tenants.workerScoped((tx) =>
          tx.durableJob.create({
            data: {
              deterministicKey: 'export.requested:lease-pair-1',
              organizationId: org.id,
              jobType: 'export.requested',
              leaseOwner: 'lease-orphan',
            },
          }),
        ),
      ).rejects.toThrow(/DurableJob_lease_pair_check/);
    });

    it('7D: a scan interrupted by a lost executor is resumed once, and a live duplicate waits', async () => {
      const owner = await signedInAgent('owner-lease-4@example.com');
      const org = await createOrganization(owner, 'org-lease-4', 'Org Lease 4');
      const { uploadId } = await createCompletedUpload(
        owner,
        org.id,
        'lease-resume',
        'col1,col2\nval1,val2\n',
      );
      const { leases, executor } = services();
      const scans = () => mockScanner.scanBuffer.mock.calls.length;
      const message = {
        v: 1 as const,
        jobName: 'upload.completed' as const,
        id: uploadId,
      };

      // The first executor reached `scanning`, then its instance was lost.
      const lost = await leases.acquire({
        deterministicKey: `upload.completed:${uploadId}`,
        jobType: 'upload.completed',
        organizationId: org.id,
        uploadId,
      });
      await tenants.workerScoped((tx) =>
        tx.upload.update({
          where: { id: uploadId },
          data: { state: 'scanning', progressStage: 'scanning' },
        }),
      );

      // Redelivery while the lease is still live must not run a second scan.
      await expect(executor.execute(message)).rejects.toBeInstanceOf(
        JobLeaseBusyError,
      );
      expect(scans()).toBe(0);

      await tenants.workerScoped((tx) =>
        tx.durableJob.update({
          where: { id: lost!.durableJobId },
          data: { leaseUntil: new Date(Date.now() - 1_000) },
        }),
      );
      await expect(executor.execute(message)).resolves.toBe('processed');

      const upload = await tenants.workerScoped((tx) =>
        tx.upload.findUniqueOrThrow({
          where: { id: uploadId },
          include: { storedObject: true },
        }),
      );
      expect(upload.state).toBe('accepted');
      expect(upload.storedObject.state).toBe('accepted');
      expect(scans()).toBe(1);

      // A late duplicate after completion is a no-op and leaves no lease behind.
      await expect(executor.execute(message)).resolves.toBe('processed');
      expect(scans()).toBe(1);
      const job = await tenants.workerScoped((tx) =>
        tx.durableJob.findUniqueOrThrow({
          where: { deterministicKey: `upload.completed:${uploadId}` },
        }),
      );
      expect(job.state).toBe('succeeded');
      expect(job.leaseOwner).toBeNull();
      expect(job.leaseUntil).toBeNull();
    });

    it('7E: a message naming another aggregate type never borrows its tenant', async () => {
      const owner = await signedInAgent('owner-lease-5@example.com');
      const org = await createOrganization(owner, 'org-lease-5', 'Org Lease 5');
      const { uploadId } = await createCompletedUpload(
        owner,
        org.id,
        'lease-cross-type',
        'col1,col2\nval1,val2\n',
      );
      const { executor } = services();
      // An upload ID presented as an export resolves no export aggregate.
      await expect(
        executor.execute({ v: 1, jobName: 'export.requested', id: uploadId }),
      ).rejects.toBeInstanceOf(AggregateNotVisibleError);
      const rows = await tenants.workerScoped((tx) =>
        tx.durableJob.count({
          where: { deterministicKey: `export.requested:${uploadId}` },
        }),
      );
      expect(rows).toBe(0);
    });

    it('7F: an infrastructure error on the final attempt is dead-lettered before it may be acknowledged', async () => {
      const owner = await signedInAgent('owner-lease-6@example.com');
      const org = await createOrganization(owner, 'org-lease-6', 'Org Lease 6');
      const { uploadId } = await createCompletedUpload(
        owner,
        org.id,
        'lease-exhausted',
        'col1,col2\nval1,val2\n',
      );
      const { executor } = services();
      const message = {
        v: 1 as const,
        jobName: 'upload.completed' as const,
        id: uploadId,
      };
      mockStorage.getBuffer.mockRejectedValue(new Error('s3 outage detail'));

      // Earlier attempts fail but stay retryable (not acknowledged); each
      // leaves the upload `scanning`, which the next leased delivery resumes.
      for (let attempt = 1; attempt < config.queueDefaultAttempts; attempt++) {
        await expect(executor.execute(message)).rejects.toThrow(
          's3 outage detail',
        );
      }
      const stuck = await tenants.workerScoped((tx) =>
        tx.upload.findUniqueOrThrow({ where: { id: uploadId } }),
      );
      expect(stuck.state).toBe('scanning');
      await expect(executor.execute(message)).rejects.toBeInstanceOf(
        JobAttemptsExhaustedError,
      );

      const job = await tenants.workerScoped((tx) =>
        tx.durableJob.findUniqueOrThrow({
          where: { deterministicKey: `upload.completed:${uploadId}` },
          include: { deadLetters: true },
        }),
      );
      expect(job.attempts).toBe(config.queueDefaultAttempts);
      expect(job.state).toBe('dead_lettered');
      expect(job.leaseOwner).toBeNull();
      // Pre-existing processor behaviour: one dead letter per failed attempt;
      // the executor adds none when one already exists.
      expect(job.deadLetters).toHaveLength(config.queueDefaultAttempts);
      for (const letter of job.deadLetters) {
        expect(letter.reasonMessage).not.toContain('s3 outage detail');
      }
    });

    it.each([
      ['self-hosted worker', WorkerModule],
      ['Vercel jobs', VercelJobsModule],
    ])(
      '7G: the %s composition boots as an application context',
      async (_name, rootModule) => {
        // Regression: guarded feature controllers once made the worker
        // composition fail dependency resolution at boot.
        const context = await NestFactory.createApplicationContext(rootModule, {
          abortOnError: false,
          logger: false,
        });
        await context.close();
      },
    );
  });

  // ===========================================================================
  // 8. Cancel deletes never-quarantined bytes (Prompt 371)
  // ===========================================================================
  describe('8. Cancel deletes bytes that never reached quarantine', () => {
    async function initiate(
      owner: Awaited<ReturnType<typeof signedInAgent>>,
      orgId: string,
      keyPrefix: string,
    ) {
      const bytes = Buffer.from('a,b\n1,2\n', 'utf-8');
      const checksum = createHash('sha256').update(bytes).digest('hex');
      const res = await owner.agent
        .post('/api/v1/uploads')
        .set('x-acres-organization-id', orgId)
        .set('Idempotency-Key', `${keyPrefix}-init-idempotency-key`)
        .set('x-csrf-token', owner.token)
        .send({
          filename: `${keyPrefix}.csv`,
          mediaType: 'text/csv',
          byteCount: bytes.length,
          checksumHex: checksum,
        })
        .expect(201);
      const data = (
        res.body as { data: { uploadId: string; object: { key: string } } }
      ).data;
      return { uploadId: data.uploadId, objectKey: data.object.key };
    }

    function cancel(
      owner: Awaited<ReturnType<typeof signedInAgent>>,
      orgId: string,
      uploadId: string,
      key: string,
    ) {
      return owner.agent
        .delete(`/api/v1/uploads/${uploadId}`)
        .set('x-acres-organization-id', orgId)
        .set('Idempotency-Key', `${key}-cancel-idempotency-key`)
        .set('x-csrf-token', owner.token);
    }

    const storedObjectOf = (uploadId: string) =>
      tenants.workerScoped(async (tx) => {
        const upload = await tx.upload.findUniqueOrThrow({
          where: { id: uploadId },
          include: { storedObject: true },
        });
        return { upload, object: upload.storedObject };
      });

    it('8A: deletes the object after commit and marks the StoredObject deleted under RLS', async () => {
      const storage = app.get<jest.Mocked<ObjectStoragePort>>(OBJECT_STORAGE);
      storage.delete.mockResolvedValue(undefined);
      const owner = await signedInAgent('owner-cancel-1@example.com');
      const org = await createOrganization(owner, 'org-cancel-1', 'Org C1');
      const { uploadId, objectKey } = await initiate(owner, org.id, 'c1');

      const res = await cancel(owner, org.id, uploadId, 'c1').expect(200);
      expect((res.body as { data: { state: string } }).data.state).toBe(
        'cancelled',
      );
      expect(storage.delete.mock.calls).toEqual([[objectKey]]);
      const { upload, object } = await storedObjectOf(uploadId);
      expect(upload.state).toBe('cancelled');
      expect(object.state).toBe('deleted');
      expect(object.deletedAt).toBeInstanceOf(Date);

      // An idempotent replay returns the cached response and deletes nothing.
      await cancel(owner, org.id, uploadId, 'c1').expect(200);
      expect(storage.delete.mock.calls).toHaveLength(1);
    });

    it('8B: a failed delete still cancels and leaves the object pending for the sweeper', async () => {
      const storage = app.get<jest.Mocked<ObjectStoragePort>>(OBJECT_STORAGE);
      storage.delete.mockRejectedValueOnce(new Error('provider outage'));
      const owner = await signedInAgent('owner-cancel-2@example.com');
      const org = await createOrganization(owner, 'org-cancel-2', 'Org C2');
      const { uploadId } = await initiate(owner, org.id, 'c2');

      await cancel(owner, org.id, uploadId, 'c2').expect(200);
      const { upload, object } = await storedObjectOf(uploadId);
      expect(upload.state).toBe('cancelled');
      expect(object.state).toBe('pending_upload');
      expect(object.deletedAt).toBeNull();
    });

    it('8C: complete after cancel conflicts; cancel after complete deletes nothing', async () => {
      const storage = app.get<jest.Mocked<ObjectStoragePort>>(OBJECT_STORAGE);
      storage.delete.mockResolvedValue(undefined);
      const owner = await signedInAgent('owner-cancel-3@example.com');
      const org = await createOrganization(owner, 'org-cancel-3', 'Org C3');

      const first = await initiate(owner, org.id, 'c3a');
      const bytes = Buffer.from('a,b\n1,2\n', 'utf-8');
      const checksum = createHash('sha256').update(bytes).digest('hex');
      storageMap.set(first.objectKey, {
        body: bytes,
        mediaType: 'text/csv',
        checksumHex: checksum,
      });
      await cancel(owner, org.id, first.uploadId, 'c3a').expect(200);
      await owner.agent
        .post(`/api/v1/uploads/${first.uploadId}/complete`)
        .set('x-acres-organization-id', org.id)
        .set('Idempotency-Key', 'c3a-comp-idempotency-key')
        .set('x-csrf-token', owner.token)
        .send({ byteCount: bytes.length, checksumHex: checksum })
        .expect(409);

      storage.delete.mockClear();
      const { uploadId } = await createCompletedUpload(
        owner,
        org.id,
        'c3b',
        'a,b\n1,2\n',
      );
      await cancel(owner, org.id, uploadId, 'c3b').expect(200);
      expect(storage.delete.mock.calls).toHaveLength(0);
      const { object } = await storedObjectOf(uploadId);
      expect(object.state).toBe('quarantined');
    });
  });
});
