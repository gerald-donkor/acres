import { AcresConfigService } from '../src/config/acres-config.service';
import { JobReconciliationService } from '../src/outbox/job-reconciliation.service';
import { JobLeaseService } from '../src/worker/job-lease.service';
import { LeasedJobExecutorService } from '../src/worker/leased-job-executor.service';
import { JobProcessorService } from '../src/worker/job-processor.service';
import type { QueueJobName } from '../src/queue/work-queue.port';
import { OutboxDispatcherService } from '../src/outbox/outbox-dispatcher.service';
import { WORK_QUEUE, type QueuePort } from '../src/queue/work-queue.port';
import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantTransactionService } from '../src/prisma/tenant-transaction.service';
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from '../src/storage/storage.port';
import { IngestionProcessorService } from '../src/ingestion/ingestion-processor.service';
import { ReportsService } from '../src/reports/reports.service';
import { PostgisRegionGeometryRepository } from '../src/geography/postgis-region-geometry.repository';
import { createRealDbTestApp, truncateAll } from './helpers/real-db-test-app';

describe('Acres End-to-End Data Journey — Real Database Acceptance', () => {
  let app: INestApplication;
  let server: App;
  let prisma: PrismaService;
  let tenants: TenantTransactionService;
  let processor: IngestionProcessorService;
  let geometryRepo: PostgisRegionGeometryRepository;

  // In-memory backing store for the OBJECT_STORAGE port double
  const storageMap = new Map<
    string,
    { body: Buffer; mediaType: string; checksumHex: string }
  >();

  beforeAll(async () => {
    ({ app, prisma } = await createRealDbTestApp());
    server = app.getHttpServer() as App;
    tenants = app.get(TenantTransactionService);
    processor = app.get(IngestionProcessorService);
    geometryRepo = app.get(PostgisRegionGeometryRepository);

    // Verify PostGIS and connectivity
    try {
      await prisma.$queryRaw`SELECT PostGIS_Version()`;
    } catch {
      throw new Error(
        'acres_test PostgreSQL/PostGIS is unreachable or unmigrated; please ensure PostgreSQL is running and migrated.',
      );
    }

    // Configure the in-memory OBJECT_STORAGE double
    const storage = app.get<jest.Mocked<ObjectStoragePort>>(OBJECT_STORAGE);
    storage.presignPut.mockImplementation((input) =>
      Promise.resolve({
        url: `http://localhost:3900/test/${input.key}`,
        method: 'PUT' as const,
        headers: {},
        expiresAt: new Date(Date.now() + 3600_000),
      }),
    );
    storage.presignGet.mockImplementation((input) =>
      Promise.resolve({
        url: `http://localhost:3900/test/${input.key}?download=${encodeURIComponent(input.filename)}`,
        method: 'GET' as const,
        headers: {},
        expiresAt: new Date(Date.now() + 3600_000),
      }),
    );
    storage.putBuffer.mockImplementation((input) => {
      storageMap.set(input.key, {
        body: input.body,
        mediaType: input.mediaType,
        checksumHex: input.checksumHex,
      });
      return Promise.resolve();
    });
    storage.getBuffer.mockImplementation((key) => {
      return Promise.resolve(storageMap.get(key)?.body ?? null);
    });
    storage.stat.mockImplementation((key) => {
      const item = storageMap.get(key);
      if (!item) return Promise.resolve(null);
      return Promise.resolve({
        byteCount: BigInt(item.body.length),
        mediaType: item.mediaType,
        checksumHex: item.checksumHex,
      });
    });
    storage.readiness.mockResolvedValue(true);
  });

  beforeEach(async () => {
    storageMap.clear();
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Lose the initial delivery, age its persisted activity, then recover it. */
  async function recoverAndExecute(jobName: QueueJobName, id: string) {
    const config = app.get(AcresConfigService);
    const provider = jest
      .spyOn(config, 'queueProvider', 'get')
      .mockReturnValue('vercel');
    try {
      const dispatcher = app.get(OutboxDispatcherService);
      await dispatcher.dispatchOnce();
      await tenants.workerScoped(async (tx) => {
        await tx.$executeRaw`UPDATE "OutboxEvent" SET "dispatchedAt" = '2020-01-01'::timestamp, "updatedAt" = '2020-01-01'::timestamp WHERE "eventType" = ${jobName} AND "aggregateId" = ${id}`;
        await tx.$executeRaw`UPDATE "DurableJob" SET "updatedAt" = '2020-01-01'::timestamp WHERE "deterministicKey" = ${`${jobName}:${id}`}`;
      });
      expect(
        (await app.get(JobReconciliationService).reconcileOnce()).rearmed,
      ).toBeGreaterThanOrEqual(1);
      await dispatcher.dispatchOnce();
      const processor = new JobProcessorService(
        config,
        tenants,
        {
          scanBuffer: () => Promise.resolve({ status: 'clean' as const }),
          readiness: () => Promise.resolve(true),
        },
        app.get(OBJECT_STORAGE),
        app.get(IngestionProcessorService),
        app.get(ReportsService),
      );
      const executor = new LeasedJobExecutorService(
        tenants,
        new JobLeaseService(tenants, config),
        processor,
      );
      const message = { v: 1 as const, jobName, id };
      await executor.execute(message);
      expect(await executor.execute(message)).toBe('already_terminal');
    } finally {
      provider.mockRestore();
    }
  }

  /** Fetches a CSRF token on an agent that preserves cookies across calls. */
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
  ): Promise<{ id: string; membership: { id: string; role: string } }> {
    const response = await actor.agent
      .post('/api/v1/organizations')
      .set('Idempotency-Key', key)
      .set('x-csrf-token', actor.token)
      .send({ name })
      .expect(201);
    return (
      response.body as {
        data: { id: string; membership: { id: string; role: string } };
      }
    ).data;
  }

  async function addMember(
    owner: Awaited<ReturnType<typeof signedInAgent>>,
    newMember: Awaited<ReturnType<typeof signedInAgent>>,
    orgId: string,
    role: 'admin' | 'analyst' | 'viewer',
    key: string,
  ): Promise<{ membershipId: string }> {
    const inviteRes = await owner.agent
      .post(`/api/v1/organizations/${orgId}/invitations`)
      .set('x-acres-organization-id', orgId)
      .set('Idempotency-Key', `${key}-invite`)
      .set('x-csrf-token', owner.token)
      .send({ email: newMember.email, role })
      .expect(201);
    const inviteToken = (inviteRes.body as { data: { token: string } }).data
      .token;

    const acceptRes = await newMember.agent
      .post('/api/v1/invitations/accept')
      .set('Idempotency-Key', `${key}-accept`)
      .set('x-csrf-token', newMember.token)
      .send({ token: inviteToken })
      .expect(200);

    return (
      acceptRes.body as {
        data: { organizationId: string; membershipId: string };
      }
    ).data;
  }

  it('proves the complete data journey from upload to publication, analytics, dashboards, reports, and exports with isolation', async () => {
    // -------------------------------------------------------------------------
    // Phase 1: Seed reviewed global geography baseline with PostGIS geometry
    // -------------------------------------------------------------------------
    const regionSource = await prisma.regionSource.create({
      data: {
        name: 'geoBoundaries gbOpen US ADM1',
        provider: 'geoBoundaries',
        codeSystem: 'ISO-3166-2',
        sourceVersion: 'v1.0.0-reviewed',
        sourceDate: new Date('2026-01-01T00:00:00Z'),
        license: 'CC-BY-4.0',
        provenanceUrl: 'https://geoboundaries.org',
      },
    });

    const region = await prisma.region.create({
      data: {
        slug: 'california',
        name: 'California',
        countryCode: 'USA',
        level: 'ADM1',
        regionType: 'State',
      },
    });

    await prisma.regionCode.create({
      data: {
        regionId: region.id,
        sourceId: regionSource.id,
        codeSystem: 'ISO-3166-2',
        code: 'US-CA',
        normalized: 'us-ca',
      },
    });

    // Write topological PostGIS geometry for California bounding polygon
    await geometryRepo.writeGeometry({
      regionId: region.id,
      sourceId: regionSource.id,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-124.4, 32.5],
            [-114.1, 32.5],
            [-114.1, 42.0],
            [-124.4, 42.0],
            [-124.4, 32.5],
          ],
        ],
      },
      metadata: { stateFips: '06', postal: 'CA' },
    });

    // Spatial read proof: point inside California polygon is found
    const spatialMatches = await geometryRepo.findRegionsContainingPoint({
      longitude: -119.5,
      latitude: 36.8,
      limit: 10,
    });
    expect(spatialMatches.some((m) => m.regionId === region.id)).toBe(true);

    // -------------------------------------------------------------------------
    // Phase 2: Multi-tenant and RBAC identities setup
    // -------------------------------------------------------------------------
    const ownerA = await signedInAgent(
      'owner-alpha@example.com',
      'Alpha Owner',
    );
    const analystA = await signedInAgent(
      'analyst-alpha@example.com',
      'Alpha Analyst',
    );
    const viewerA = await signedInAgent(
      'viewer-alpha@example.com',
      'Alpha Viewer',
    );
    const ownerB = await signedInAgent('owner-beta@example.com', 'Beta Owner');

    const orgA = await createOrganization(
      ownerA,
      'org-alpha-create-key',
      'Alpha Ag',
    );
    const orgB = await createOrganization(
      ownerB,
      'org-beta-create-key',
      'Beta Bio',
    );

    const analystMembership = await addMember(
      ownerA,
      analystA,
      orgA.id,
      'analyst',
      'analyst-alpha-join',
    );
    await addMember(ownerA, viewerA, orgA.id, 'viewer', 'viewer-alpha-join');

    // -------------------------------------------------------------------------
    // Phase 3: Tenant A — Upload initiation, storage buffer, and completion
    // -------------------------------------------------------------------------
    const csvContent = 'region,yield,year,crop\nUS-CA,145.2,2026,corn\n';
    const csvBytes = Buffer.from(csvContent, 'utf-8');
    const csvChecksum = createHash('sha256').update(csvBytes).digest('hex');

    const uploadRes = await ownerA.agent
      .post('/api/v1/uploads')
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'alpha-upload-init-1')
      .set('x-csrf-token', ownerA.token)
      .send({
        filename: 'crop_yield_2026.csv',
        mediaType: 'text/csv',
        byteCount: csvBytes.length,
        checksumHex: csvChecksum,
      })
      .expect(201);

    const uploadData = (
      uploadRes.body as { data: { uploadId: string; object: { key: string } } }
    ).data;
    const uploadId = uploadData.uploadId;
    const objectKey = uploadData.object.key;

    // Simulate S3/Garage direct client PUT to storage
    storageMap.set(objectKey, {
      body: csvBytes,
      mediaType: 'text/csv',
      checksumHex: csvChecksum,
    });

    // Complete upload through REST verification
    const completeRes = await ownerA.agent
      .post(`/api/v1/uploads/${uploadId}/complete`)
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'alpha-upload-comp-1')
      .set('x-csrf-token', ownerA.token)
      .send({
        byteCount: csvBytes.length,
        checksumHex: csvChecksum,
      })
      .expect(200);

    expect((completeRes.body as { data: { state: string } }).data.state).toBe(
      'completed',
    );

    await recoverAndExecute('upload.completed', uploadId);

    // -------------------------------------------------------------------------
    // Phase 4: Tenant A — Dataset creation, column mapping, and ingestion run
    // -------------------------------------------------------------------------
    const datasetRes = await ownerA.agent
      .post('/api/v1/datasets')
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'alpha-dataset-create-1')
      .set('x-csrf-token', ownerA.token)
      .send({
        name: 'California Corn Yields 2026',
        description:
          'Verified regional harvest records from agricultural survey.',
      })
      .expect(201);

    const datasetId = (datasetRes.body as { data: { id: string } }).data.id;

    // Configure mapping for region and metric
    const mappingRes = await ownerA.agent
      .post(`/api/v1/datasets/${datasetId}/mappings`)
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'alpha-mapping-create-1')
      .set('x-csrf-token', ownerA.token)
      .send({
        uploadId,
        mapping: {
          regionColumn: 'region',
          metrics: [
            {
              column: 'yield',
              key: 'crop_yield',
              label: 'Crop Yield',
              valueType: 'numeric',
              unit: 'bushels',
              aggregation: 'sum',
              periodColumn: 'year',
            },
          ],
        },
      })
      .expect(201);

    const mappingId = (mappingRes.body as { data: { id: string } }).data.id;

    // Start ingestion run
    const runRes = await ownerA.agent
      .post(`/api/v1/datasets/${datasetId}/ingestion-runs`)
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'alpha-run-create-1')
      .set('x-csrf-token', ownerA.token)
      .send({
        uploadId,
        mappingId,
      })
      .expect(201);

    const runId = (runRes.body as { data: { id: string } }).data.id;

    // Dispatch committed ingestion intent before invoking the real processor.
    await app.get(OutboxDispatcherService).dispatchOnce();
    expect(
      app.get<jest.Mocked<QueuePort>>(WORK_QUEUE).enqueue.mock.calls,
    ).toContainEqual([
      {
        deterministicKey: `ingestion.run:${runId}`,
        jobName: 'ingestion.run',
        payload: {
          ingestionRunId: runId,
          outboxEventId: expect.any(String) as unknown,
        },
      },
    ]);
    await recoverAndExecute('ingestion.run', runId);

    // Verify run completed and published
    const runStatusRes = await ownerA.agent
      .get(`/api/v1/ingestion-runs/${runId}`)
      .set('x-acres-organization-id', orgA.id)
      .expect(200);

    const publishedRun = (
      runStatusRes.body as {
        data: { state: string; stage: string; datasetVersionId: string };
      }
    ).data;
    expect(publishedRun.state).toBe('published');
    expect(publishedRun.stage).toBe('complete');
    expect(publishedRun.datasetVersionId).toBeDefined();

    // Verify dataset versions list
    const versionsRes = await ownerA.agent
      .get(`/api/v1/datasets/${datasetId}/versions`)
      .set('x-acres-organization-id', orgA.id)
      .expect(200);

    const versions = (
      versionsRes.body as {
        data: Array<{
          id: string;
          versionNumber: number;
          publicationStatus: string;
        }>;
      }
    ).data;
    expect(versions).toHaveLength(1);
    expect(versions[0].versionNumber).toBe(1);
    expect(versions[0].publicationStatus).toBe('published');
    const datasetVersionId = versions[0].id;

    // -------------------------------------------------------------------------
    // Phase 5: Tenant A — Deterministic analytics, observations, and lineage
    // -------------------------------------------------------------------------
    const metricsRes = await ownerA.agent
      .get('/api/v1/analytics/metrics')
      .set('x-acres-organization-id', orgA.id)
      .expect(200);

    const metrics = (
      metricsRes.body as {
        data: Array<{ id: string; key: string; allowedAggregation: string }>;
      }
    ).data;
    const cropYieldMetric = metrics.find((m) => m.key === 'crop_yield');
    expect(cropYieldMetric).toBeDefined();
    expect(cropYieldMetric?.allowedAggregation).toBe('sum');
    const metricId = cropYieldMetric?.id;

    const obsRes = await ownerA.agent
      .get('/api/v1/analytics/observations')
      .set('x-acres-organization-id', orgA.id)
      .expect(200);

    const observations = (
      obsRes.body as {
        data: Array<{ id: string; regionId: string; value: { value: string } }>;
      }
    ).data;
    expect(observations).toHaveLength(1);
    expect(observations[0].regionId).toBe(region.id);
    expect(observations[0].value.value).toBe('145.2');
    const observationId = observations[0].id;

    const aggRes = await ownerA.agent
      .get('/api/v1/analytics/aggregates')
      .set('x-acres-organization-id', orgA.id)
      .expect(200);

    const aggregates = (
      aggRes.body as {
        data: Array<{ id: string; regionId: string; value: { value: string } }>;
      }
    ).data;
    expect(aggregates).toHaveLength(1);
    expect(aggregates[0].regionId).toBe(region.id);
    expect(aggregates[0].value.value).toBe('145.2');
    const aggregateId = aggregates[0].id;

    // Verify lineage back to observation and dataset version
    const evidenceRes = await ownerA.agent
      .get(`/api/v1/analytics/aggregates/${aggregateId}/evidence`)
      .set('x-acres-organization-id', orgA.id)
      .expect(200);

    const evidenceData = (
      evidenceRes.body as {
        data: {
          aggregate: { id: string };
          evidence: Array<{ observationId: string; datasetVersionId: string }>;
        };
      }
    ).data;
    expect(evidenceData.aggregate.id).toBe(aggregateId);
    expect(evidenceData.evidence).toHaveLength(1);
    expect(evidenceData.evidence[0].observationId).toBe(observationId);
    expect(evidenceData.evidence[0].datasetVersionId).toBe(datasetVersionId);

    // -------------------------------------------------------------------------
    // Phase 6: Tenant A — Saved dashboard view
    // -------------------------------------------------------------------------
    const viewRes = await ownerA.agent
      .post('/api/v1/dashboard-views')
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'alpha-dash-view-1')
      .set('x-csrf-token', ownerA.token)
      .send({
        name: 'California Crop Overview 2026',
        description: 'Harvest summary view',
        filters: {
          metricId,
          regionId: region.id,
          datasetVersionId,
        },
        presentation: {
          chart: 'bar',
        },
      })
      .expect(201);

    const dashboardViewId = (viewRes.body as { data: { id: string } }).data.id;

    const listViewsRes = await ownerA.agent
      .get('/api/v1/dashboard-views')
      .set('x-acres-organization-id', orgA.id)
      .expect(200);

    const views = (
      listViewsRes.body as { data: Array<{ id: string; name: string }> }
    ).data;
    expect(views.some((v) => v.id === dashboardViewId)).toBe(true);

    // -------------------------------------------------------------------------
    // Phase 7: Tenant A — Governed report lifecycle, review, and publication
    // -------------------------------------------------------------------------
    const createReportRes = await ownerA.agent
      .post('/api/v1/reports')
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'alpha-report-create-1')
      .set('x-csrf-token', ownerA.token)
      .send({
        title: 'California Agricultural Assessment',
        summary:
          'Official report on verified crop yields across monitored state regions.',
        insights: [
          {
            heading: 'Favorable Yield Trends',
            body: 'Harvest records show consistent production surpassing historical regional averages.',
          },
        ],
        evidence: [
          {
            aggregateId,
          },
          {
            dashboardViewId,
          },
        ],
      })
      .expect(201);

    const report = (
      createReportRes.body as {
        data: {
          id: string;
          latestRevision: { id: string; status: string };
        };
      }
    ).data;
    const reportId = report.id;
    const revisionId = report.latestRevision.id;
    expect(report.latestRevision.status).toBe('draft');

    // Submit revision for review
    const submitReviewRes = await ownerA.agent
      .post(`/api/v1/reports/${reportId}/revisions/${revisionId}/submit-review`)
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'alpha-report-submit-review-1')
      .set('x-csrf-token', ownerA.token)
      .expect(200);

    expect(
      (submitReviewRes.body as { data: { latestRevision: { status: string } } })
        .data.latestRevision.status,
    ).toBe('in_review');

    // Publish revision (freezes evidence immutably)
    const publishRes = await ownerA.agent
      .post(`/api/v1/reports/${reportId}/revisions/${revisionId}/publish`)
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'alpha-report-publish-1')
      .set('x-csrf-token', ownerA.token)
      .expect(200);

    expect(
      (publishRes.body as { data: { latestRevision: { status: string } } }).data
        .latestRevision.status,
    ).toBe('published');

    // -------------------------------------------------------------------------
    // Phase 8: Tenant A — Export generation, artifact storage, and download URL
    // -------------------------------------------------------------------------
    const exportReqRes = await ownerA.agent
      .post('/api/v1/exports')
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'alpha-export-request-1')
      .set('x-csrf-token', ownerA.token)
      .send({
        reportId,
        revisionId,
        format: 'csv',
      })
      .expect(201);

    const exportRequestId = (
      exportReqRes.body as { data: { id: string; status: string } }
    ).data.id;

    // Worker renders export and saves artifact buffer into object storage
    await recoverAndExecute('export.requested', exportRequestId);

    const exportStatusRes = await ownerA.agent
      .get(`/api/v1/exports/${exportRequestId}`)
      .set('x-acres-organization-id', orgA.id)
      .expect(200);

    const finishedExport = (
      exportStatusRes.body as {
        data: { status: string; artifact: { id: string; byteCount: number } };
      }
    ).data;
    expect(finishedExport.status).toBe('succeeded');
    expect(finishedExport.artifact).toBeDefined();

    // Verify rendered artifact content in storage double
    const artifactEntries = Array.from(storageMap.entries()).filter(([k]) =>
      k.startsWith(`organizations/${orgA.id}/exports/${exportRequestId}/`),
    );
    expect(artifactEntries).toHaveLength(1);
    expect(artifactEntries[0][1].body.toString('utf-8')).toContain(
      'California Agricultural Assessment',
    );

    // Verify download endpoint returns signed URL
    const downloadRes = await ownerA.agent
      .get(`/api/v1/exports/${exportRequestId}/download`)
      .set('x-acres-organization-id', orgA.id)
      .expect(200);

    const downloadData = (
      downloadRes.body as { data: { url: string; method: string } }
    ).data;
    expect(downloadData.method).toBe('GET');
    expect(downloadData.url).toContain('/test/');

    // -------------------------------------------------------------------------
    // Phase 9: Multi-tenant cross-organization isolation verification (Tenant B)
    // -------------------------------------------------------------------------
    // Org B owner cannot read Org A's upload
    await ownerB.agent
      .get(`/api/v1/uploads/${uploadId}`)
      .set('x-acres-organization-id', orgB.id)
      .expect(404);

    // Org B owner cannot read Org A's dataset
    await ownerB.agent
      .get(`/api/v1/datasets/${datasetId}`)
      .set('x-acres-organization-id', orgB.id)
      .expect(404);

    // Org B owner cannot read Org A's dataset versions
    await ownerB.agent
      .get(`/api/v1/datasets/${datasetId}/versions`)
      .set('x-acres-organization-id', orgB.id)
      .expect(404);

    // Org B owner sees empty metrics under RLS
    const orgBMetricsRes = await ownerB.agent
      .get('/api/v1/analytics/metrics')
      .set('x-acres-organization-id', orgB.id)
      .expect(200);
    expect((orgBMetricsRes.body as { data: unknown[] }).data).toHaveLength(0);

    // Org B owner sees empty observations under RLS
    const orgBObsRes = await ownerB.agent
      .get('/api/v1/analytics/observations')
      .set('x-acres-organization-id', orgB.id)
      .expect(200);
    expect((orgBObsRes.body as { data: unknown[] }).data).toHaveLength(0);

    // Org B owner sees empty aggregates under RLS
    const orgBAggRes = await ownerB.agent
      .get('/api/v1/analytics/aggregates')
      .set('x-acres-organization-id', orgB.id)
      .expect(200);
    expect((orgBAggRes.body as { data: unknown[] }).data).toHaveLength(0);

    // Org B owner cannot access Org A's aggregate evidence
    await ownerB.agent
      .get(`/api/v1/analytics/aggregates/${aggregateId}/evidence`)
      .set('x-acres-organization-id', orgB.id)
      .expect(404);

    // Org B owner sees empty dashboard views
    const orgBViewsRes = await ownerB.agent
      .get('/api/v1/dashboard-views')
      .set('x-acres-organization-id', orgB.id)
      .expect(200);
    expect((orgBViewsRes.body as { data: unknown[] }).data).toHaveLength(0);

    // Org B owner cannot read Org A's saved view
    await ownerB.agent
      .get(`/api/v1/dashboard-views/${dashboardViewId}`)
      .set('x-acres-organization-id', orgB.id)
      .expect(404);

    // Org B owner cannot read Org A's report
    await ownerB.agent
      .get(`/api/v1/reports/${reportId}`)
      .set('x-acres-organization-id', orgB.id)
      .expect(404);

    // Org B owner cannot read Org A's export
    await ownerB.agent
      .get(`/api/v1/exports/${exportRequestId}`)
      .set('x-acres-organization-id', orgB.id)
      .expect(404);

    // Org B owner cannot download Org A's export
    await ownerB.agent
      .get(`/api/v1/exports/${exportRequestId}/download`)
      .set('x-acres-organization-id', orgB.id)
      .expect(404);

    // -------------------------------------------------------------------------
    // Phase 10: Role-based access control (Viewer and Analyst in Org A)
    // -------------------------------------------------------------------------
    // Viewer is denied write actions
    await viewerA.agent
      .post('/api/v1/uploads')
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'viewer-upload-denied')
      .set('x-csrf-token', viewerA.token)
      .send({
        filename: 'denied.csv',
        mediaType: 'text/csv',
        byteCount: 10,
      })
      .expect(403)
      .expect((res) => {
        expect(res.body).toMatchObject({
          ok: false,
          error: { code: 'FORBIDDEN' },
        });
      });

    await viewerA.agent
      .post('/api/v1/datasets')
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'viewer-dataset-denied')
      .set('x-csrf-token', viewerA.token)
      .send({ name: 'Denied Dataset' })
      .expect(403)
      .expect((res) => {
        expect(res.body).toMatchObject({
          ok: false,
          error: { code: 'FORBIDDEN' },
        });
      });

    await viewerA.agent
      .post(`/api/v1/datasets/${datasetId}/mappings`)
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'viewer-mapping-denied')
      .set('x-csrf-token', viewerA.token)
      .send({
        uploadId,
        mapping: { regionColumn: 'region' },
      })
      .expect(403)
      .expect((res) => {
        expect(res.body).toMatchObject({
          ok: false,
          error: { code: 'FORBIDDEN' },
        });
      });

    await viewerA.agent
      .post(`/api/v1/datasets/${datasetId}/ingestion-runs`)
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'viewer-run-denied')
      .set('x-csrf-token', viewerA.token)
      .send({ uploadId, mappingId })
      .expect(403)
      .expect((res) => {
        expect(res.body).toMatchObject({
          ok: false,
          error: { code: 'FORBIDDEN' },
        });
      });

    await viewerA.agent
      .post('/api/v1/dashboard-views')
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'viewer-dashboard-denied')
      .set('x-csrf-token', viewerA.token)
      .send({
        name: 'Denied Dashboard',
        description: 'Denied for Viewer',
        config: {},
      })
      .expect(403)
      .expect((res) => {
        expect(res.body).toMatchObject({
          ok: false,
          error: { code: 'FORBIDDEN' },
        });
      });

    await viewerA.agent
      .post('/api/v1/reports')
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'viewer-report-denied')
      .set('x-csrf-token', viewerA.token)
      .send({ title: 'Denied Report' })
      .expect(403)
      .expect((res) => {
        expect(res.body).toMatchObject({
          ok: false,
          error: { code: 'FORBIDDEN' },
        });
      });

    await viewerA.agent
      .post('/api/v1/exports')
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'viewer-export-denied')
      .set('x-csrf-token', viewerA.token)
      .send({ reportId, revisionId, format: 'csv' })
      .expect(403)
      .expect((res) => {
        expect(res.body).toMatchObject({
          ok: false,
          error: { code: 'FORBIDDEN' },
        });
      });

    // Viewer is permitted to read analytics, reports, and dashboards
    await viewerA.agent
      .get('/api/v1/analytics/metrics')
      .set('x-acres-organization-id', orgA.id)
      .expect(200);

    await viewerA.agent
      .get(`/api/v1/reports/${reportId}`)
      .set('x-acres-organization-id', orgA.id)
      .expect(200);

    await viewerA.agent
      .get(`/api/v1/dashboard-views/${dashboardViewId}`)
      .set('x-acres-organization-id', orgA.id)
      .expect(200);

    // Analyst is denied member administration
    await analystA.agent
      .delete(
        `/api/v1/organizations/${orgA.id}/members/${analystMembership.membershipId}`,
      )
      .set('x-acres-organization-id', orgA.id)
      .set('x-csrf-token', analystA.token)
      .expect(403)
      .expect((res) => {
        expect(res.body).toMatchObject({
          ok: false,
          error: { code: 'FORBIDDEN' },
        });
      });

    // -------------------------------------------------------------------------
    // Phase 11: Partial publication defense on validation failure
    // -------------------------------------------------------------------------
    const badCsvContent = 'region,yield,year\nUNKNOWN-999,88.5,2026\n';
    const badCsvBytes = Buffer.from(badCsvContent, 'utf-8');
    const badCsvChecksum = createHash('sha256')
      .update(badCsvBytes)
      .digest('hex');

    const badUploadRes = await analystA.agent
      .post('/api/v1/uploads')
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'analyst-bad-upload-1')
      .set('x-csrf-token', analystA.token)
      .send({
        filename: 'bad_region.csv',
        mediaType: 'text/csv',
        byteCount: badCsvBytes.length,
        checksumHex: badCsvChecksum,
      })
      .expect(201);

    const badUploadId = (
      badUploadRes.body as {
        data: { uploadId: string; object: { key: string } };
      }
    ).data.uploadId;
    const badObjectKey = (
      badUploadRes.body as { data: { object: { key: string } } }
    ).data.object.key;

    storageMap.set(badObjectKey, {
      body: badCsvBytes,
      mediaType: 'text/csv',
      checksumHex: badCsvChecksum,
    });

    await analystA.agent
      .post(`/api/v1/uploads/${badUploadId}/complete`)
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'analyst-bad-comp-1')
      .set('x-csrf-token', analystA.token)
      .send({
        byteCount: badCsvBytes.length,
        checksumHex: badCsvChecksum,
      })
      .expect(200);

    await tenants.workerScoped(async (tx) => {
      const upload = await tx.upload.findUniqueOrThrow({
        where: { id: badUploadId },
      });
      await tx.upload.update({
        where: { id: badUploadId },
        data: {
          state: 'accepted',
          scanStatus: 'clean',
          scanResult: 'clean',
          progressStage: 'accepted',
          progressPercent: 100,
          acceptedAt: new Date(),
        },
      });
      await tx.storedObject.update({
        where: { id: upload.storedObjectId },
        data: { state: 'accepted' },
      });
    });

    const badDatasetRes = await analystA.agent
      .post('/api/v1/datasets')
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'analyst-bad-dataset-1')
      .set('x-csrf-token', analystA.token)
      .send({ name: 'Invalid Region Dataset' })
      .expect(201);

    const badDatasetId = (badDatasetRes.body as { data: { id: string } }).data
      .id;

    const badMappingRes = await analystA.agent
      .post(`/api/v1/datasets/${badDatasetId}/mappings`)
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'analyst-bad-map-1')
      .set('x-csrf-token', analystA.token)
      .send({
        uploadId: badUploadId,
        mapping: {
          regionColumn: 'region',
          metrics: [
            {
              column: 'yield',
              key: 'crop_yield',
              label: 'Crop Yield',
              valueType: 'numeric',
              unit: 'bushels',
              aggregation: 'sum',
              periodColumn: 'year',
            },
          ],
        },
      })
      .expect(201);

    const badMappingId = (badMappingRes.body as { data: { id: string } }).data
      .id;

    const badRunRes = await analystA.agent
      .post(`/api/v1/datasets/${badDatasetId}/ingestion-runs`)
      .set('x-acres-organization-id', orgA.id)
      .set('Idempotency-Key', 'analyst-bad-run-1')
      .set('x-csrf-token', analystA.token)
      .send({
        uploadId: badUploadId,
        mappingId: badMappingId,
      })
      .expect(201);

    const badRunId = (badRunRes.body as { data: { id: string } }).data.id;

    // Dispatch this intent through the same path before testing validation failure.
    await app.get(OutboxDispatcherService).dispatchOnce();
    expect(
      app.get<jest.Mocked<QueuePort>>(WORK_QUEUE).enqueue.mock.calls,
    ).toContainEqual([
      {
        deterministicKey: `ingestion.run:${badRunId}`,
        jobName: 'ingestion.run',
        payload: {
          ingestionRunId: badRunId,
          outboxEventId: expect.any(String) as unknown,
        },
      },
    ]);
    await processor.processRun(badRunId);

    // Verify run failed validation
    const badRunStatusRes = await analystA.agent
      .get(`/api/v1/ingestion-runs/${badRunId}`)
      .set('x-acres-organization-id', orgA.id)
      .expect(200);

    const failedRun = (
      badRunStatusRes.body as {
        data: {
          state: string;
          failure: { code: string; message: string } | null;
          datasetVersionId: string | null;
        };
      }
    ).data;
    expect(failedRun.state).toBe('validation_failed');
    expect(failedRun.failure?.code).toBe('validation_failed');
    expect(failedRun.datasetVersionId).toBeNull();

    // Verify issues are recorded
    const issuesRes = await analystA.agent
      .get(`/api/v1/ingestion-runs/${badRunId}/issues`)
      .set('x-acres-organization-id', orgA.id)
      .expect(200);

    const issues = (issuesRes.body as { data: Array<{ code: string }> }).data;
    expect(issues.some((i) => i.code === 'region_unmatched')).toBe(true);

    // Direct database proof: zero partial dataset versions and zero invalid observations exist
    const versionCount = await tenants.workerScoped((tx) =>
      tx.datasetVersion.count({
        where: { datasetId: badDatasetId, organizationId: orgA.id },
      }),
    );
    expect(versionCount).toBe(0);

    const obsCount = await tenants.workerScoped((tx) =>
      tx.metricObservation.count({
        where: {
          datasetVersion: { datasetId: badDatasetId },
          organizationId: orgA.id,
        },
      }),
    );
    expect(obsCount).toBe(0);

    const aggCount = await tenants.workerScoped((tx) =>
      tx.metricAggregate.count({
        where: {
          datasetVersion: { datasetId: badDatasetId },
          organizationId: orgA.id,
        },
      }),
    );
    expect(aggCount).toBe(0);
  });
});
