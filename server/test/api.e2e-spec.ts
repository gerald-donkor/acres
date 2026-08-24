import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createHash } from 'node:crypto';
import { Prisma } from '../src/generated/prisma/client';
import {
  createPrismaDouble,
  createTestApp,
  type PrismaDouble,
} from './helpers/test-app';

describe('Acres API', () => {
  let app: INestApplication;
  let server: App;
  let prisma: PrismaDouble;

  beforeEach(async () => {
    prisma = createPrismaDouble();
    ({ app } = await createTestApp(prisma));
    server = app.getHttpServer() as App;
  });

  afterEach(async () => {
    await app?.close();
  });

  /** Fetches a CSRF token on an agent that keeps the paired cookie. */
  async function csrfAgent() {
    const agent = request.agent(server);
    const response = await agent.get('/api/v1/auth/csrf').expect(200);
    const body = response.body as {
      data: { csrfToken: string; headerName: string };
    };
    return { agent, token: body.data.csrfToken };
  }

  type Agent = ReturnType<typeof request.agent>;

  /**
   * Re-reads the CSRF token on an agent. Necessary after login: the token is
   * bound to the session cookie's value, which login has just changed.
   */
  async function csrfTokenFor(agent: Agent): Promise<string> {
    const response = await agent.get('/api/v1/auth/csrf').expect(200);
    return (response.body as { data: { csrfToken: string } }).data.csrfToken;
  }

  async function recreateApp(
    envOverrides: Partial<Record<string, string>>,
  ): Promise<void> {
    await app.close();
    prisma = createPrismaDouble();
    ({ app } = await createTestApp(prisma, envOverrides));
    server = app.getHttpServer() as App;
  }

  function rawSqlCalls(): string {
    return prisma.$executeRaw.mock.calls
      .map(([strings]) =>
        Array.isArray(strings) ? (strings as string[]).join('?') : '',
      )
      .join('\n');
  }

  function sessionCookieValue(response: request.Response): string {
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return /acres_session=([^;]+)/.exec(cookies.join(';'))?.[1] ?? '';
  }

  const ACCOUNT_ROW = {
    id: 'account-1',
    email: 'ada@example.com',
    passwordHash: '',
    displayName: 'Ada Lovelace',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const ORG_CONTEXT = {
    id: '018f7611-89ab-7abc-9234-111111111111',
    accountId: ACCOUNT_ROW.id,
    organizationId: '018f7611-89ab-7abc-9234-111111111111',
    role: 'analyst',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    revokedAt: null,
  };

  /**
   * Registers, then hands back an agent carrying the real session cookie the
   * server issued. The session lookup is answered from the same row, so the
   * guard runs its actual code path rather than being stubbed out.
   */
  async function signedInAgent() {
    const { agent, token } = await csrfAgent();
    prisma.account.findUnique.mockResolvedValue(null);
    prisma.account.create.mockResolvedValue(ACCOUNT_ROW);
    prisma.session.create.mockResolvedValue({ id: 'session-1' });

    const response = await agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', token)
      .send({
        email: 'ada@example.com',
        password: 'a-long-enough-password',
        displayName: 'Ada Lovelace',
      })
      .expect(201);

    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      accountId: ACCOUNT_ROW.id,
      tokenHash: 'unused-the-guard-looks-up-by-hash',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      revokedAt: null,
      account: ACCOUNT_ROW,
    });

    return { agent, response };
  }

  describe('GET /health', () => {
    it('reports ok in the success envelope', async () => {
      const response = await request(server).get('/health').expect(200);

      expect(response.body).toMatchObject({
        ok: true,
        data: { status: 'ok', service: 'acres-api' },
      });
    });

    it('does not touch the database', async () => {
      await request(server).get('/health').expect(200);

      expect(prisma.account.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('request IDs and route migration', () => {
    it('returns a safe request id and ignores hostile values', async () => {
      const response = await request(server)
        .get('/health')
        .set('x-request-id', 'not-a-safe-id')
        .expect(200);

      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
      expect((response.body as { data?: unknown }).data).toBeDefined();
    });

    it('removes old unversioned product routes without redirecting', async () => {
      await request(server).get('/auth/session').expect(404);
      await request(server).get('/account').expect(404);
      await request(server).get('/regions').expect(404);
      const { agent, token } = await csrfAgent();
      await agent.post('/forms/contact').set('x-csrf-token', token).expect(404);
    });
  });

  describe('CSRF', () => {
    it('rejects a mutation with no token', async () => {
      const response = await request(server)
        .post('/api/v1/forms/contact')
        .send({ name: 'A', email: 'a@example.com', message: 'x'.repeat(20) })
        .expect(403);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'CSRF_INVALID' },
      });
    });
  });

  describe('POST /auth/register', () => {
    it('rejects a short password with VALIDATION_FAILED', async () => {
      const { agent, token } = await csrfAgent();

      const response = await agent
        .post('/api/v1/auth/register')
        .set('x-csrf-token', token)
        .send({ email: 'someone@example.com', password: 'short' })
        .expect(400);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_FAILED' },
      });
      expect(prisma.account.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown property', async () => {
      const { agent, token } = await csrfAgent();

      const response = await agent
        .post('/api/v1/auth/register')
        .set('x-csrf-token', token)
        .send({
          email: 'someone@example.com',
          password: 'a-long-enough-password',
          isAdmin: true,
        })
        .expect(400);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_FAILED' },
      });
    });
  });

  describe('POST /auth/login', () => {
    it('fails with INVALID_CREDENTIALS for an unknown account', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      const { agent, token } = await csrfAgent();

      const response = await agent
        .post('/api/v1/auth/login')
        .set('x-csrf-token', token)
        .send({ email: 'nobody@example.com', password: 'wrong-password-here' })
        .expect(401);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'INVALID_CREDENTIALS' },
      });
      expect(prisma.session.create).not.toHaveBeenCalled();
    });
  });

  describe('the session guard', () => {
    it('rejects GET /account without a session', async () => {
      const response = await request(server).get('/api/v1/account').expect(401);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('rejects GET /jobs/runs without a session', async () => {
      const response = await request(server)
        .get('/api/v1/jobs/runs')
        .expect(401);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(prisma.jobRun.findMany).not.toHaveBeenCalled();
    });
  });

  describe('uploads', () => {
    const uploadRow = {
      id: '018f7611-89ab-7abc-9234-222222222222',
      organizationId: ORG_CONTEXT.organizationId,
      actorAccountId: ACCOUNT_ROW.id,
      storedObjectId: '018f7611-89ab-7abc-9234-333333333333',
      state: 'pending_upload',
      declaredFilename: 'regions.csv',
      declaredMediaType: 'text/csv',
      declaredByteCount: BigInt(12),
      completedByteCount: null,
      checksumAlgorithm: 'sha256',
      checksumHex: null,
      scanStatus: null,
      scanResult: null,
      failureCode: null,
      failureMessage: null,
      progressStage: 'created',
      progressPercent: 0,
      version: 1,
      presignedUploadExpiresAt: new Date('2026-01-01T00:15:00.000Z'),
      expiresAt: new Date('2026-01-01T01:00:00.000Z'),
      completedAt: null,
      cancelledAt: null,
      acceptedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    beforeEach(() => {
      prisma.membership.findFirst.mockResolvedValue(ORG_CONTEXT);
      prisma.storedObject.create.mockResolvedValue({
        id: uploadRow.storedObjectId,
      });
      prisma.upload.create.mockResolvedValue(uploadRow);
      prisma.upload.findFirst.mockResolvedValue({
        ...uploadRow,
        storedObject: {
          id: uploadRow.storedObjectId,
          objectKey: 'organizations/org/quarantine/object',
        },
      });
      prisma.upload.update.mockResolvedValue({
        ...uploadRow,
        state: 'completed',
        completedByteCount: BigInt(12),
        checksumHex:
          '0a3666a0710c08aa6d0de92ce72beeb5b93124cce1bf3701c9d6cdeb543cb73e',
        progressStage: 'queued_scan',
        progressPercent: 20,
        completedAt: new Date('2026-01-01T00:01:00.000Z'),
        version: 2,
      });
      prisma.storedObject.update.mockResolvedValue({});
      prisma.outboxEvent.create.mockResolvedValue({ id: 'outbox-1' });
      prisma.jobProgressEvent.create.mockResolvedValue({ id: 'progress-1' });
    });

    it('requires an idempotency key to initiate an upload', async () => {
      const { agent } = await signedInAgent();
      const token = await csrfTokenFor(agent);

      const response = await agent
        .post('/api/v1/uploads')
        .set('x-csrf-token', token)
        .set('x-acres-organization-id', ORG_CONTEXT.organizationId)
        .send({ filename: 'regions.csv', mediaType: 'text/csv', byteCount: 12 })
        .expect(400);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'IDEMPOTENCY_KEY_REQUIRED' },
      });
    });

    it('initiates and completes a tenant-scoped upload', async () => {
      const { agent } = await signedInAgent();
      const token = await csrfTokenFor(agent);

      const initiated = await agent
        .post('/api/v1/uploads')
        .set('x-csrf-token', token)
        .set('x-acres-organization-id', ORG_CONTEXT.organizationId)
        .set('idempotency-key', 'upload-initiate-key')
        .send({ filename: 'regions.csv', mediaType: 'text/csv', byteCount: 12 })
        .expect(201);

      expect(initiated.body).toMatchObject({
        ok: true,
        data: { uploadId: uploadRow.id, upload: { method: 'PUT' } },
      });

      const completed = await agent
        .post(`/api/v1/uploads/${uploadRow.id}/complete`)
        .set('x-csrf-token', token)
        .set('x-acres-organization-id', ORG_CONTEXT.organizationId)
        .set('idempotency-key', 'upload-complete-key')
        .send({
          byteCount: 12,
          checksumHex:
            '0a3666a0710c08aa6d0de92ce72beeb5b93124cce1bf3701c9d6cdeb543cb73e',
        })
        .expect(200);

      expect(completed.body).toMatchObject({
        ok: true,
        data: {
          id: uploadRow.id,
          state: 'completed',
          progress: { stage: 'queued_scan', percent: 20 },
        },
      });
      expect(prisma.outboxEvent.create).toHaveBeenCalled();
    });
  });

  describe('ingestion', () => {
    const datasetRow = {
      id: '018f7611-89ab-7abc-9234-444444444444',
      organizationId: ORG_CONTEXT.organizationId,
      ownerAccountId: ACCOUNT_ROW.id,
      name: 'Regional source',
      description: null,
      sourceMetadata: {},
      state: 'draft',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      versions: [],
    };
    const acceptedUpload = {
      id: '018f7611-89ab-7abc-9234-222222222222',
      organizationId: ORG_CONTEXT.organizationId,
      state: 'accepted',
    };
    const mappingRow = {
      id: '018f7611-89ab-7abc-9234-555555555555',
      organizationId: ORG_CONTEXT.organizationId,
      datasetId: datasetRow.id,
      uploadId: acceptedUpload.id,
      createdByAccountId: ACCOUNT_ROW.id,
      versionNumber: 1,
      mapping: { regionColumn: 'region' },
      validationStatus: 'pending',
      createdAt: new Date('2026-01-01T00:01:00.000Z'),
    };
    const runRow = {
      id: '018f7611-89ab-7abc-9234-666666666666',
      organizationId: ORG_CONTEXT.organizationId,
      datasetId: datasetRow.id,
      uploadId: acceptedUpload.id,
      mappingId: mappingRow.id,
      datasetVersionId: null,
      actorAccountId: ACCOUNT_ROW.id,
      deterministicKey: `${datasetRow.id}:${acceptedUpload.id}:${mappingRow.id}`,
      state: 'queued',
      stage: 'inspect',
      progressPercent: 0,
      attempts: 0,
      failureCode: null,
      failureMessage: null,
      cancelledAt: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date('2026-01-01T00:02:00.000Z'),
      updatedAt: new Date('2026-01-01T00:02:00.000Z'),
    };

    beforeEach(() => {
      prisma.membership.findFirst.mockResolvedValue(ORG_CONTEXT);
      prisma.dataset.create.mockResolvedValue(datasetRow);
      prisma.dataset.findFirst.mockResolvedValue(datasetRow);
      prisma.dataset.findMany.mockResolvedValue([datasetRow]);
      prisma.upload.findFirst.mockResolvedValue(acceptedUpload);
      prisma.columnMapping.aggregate.mockResolvedValue({
        _max: { versionNumber: null },
      });
      prisma.columnMapping.create.mockResolvedValue(mappingRow);
      prisma.columnMapping.findFirst.mockResolvedValue(mappingRow);
      prisma.ingestionRun.upsert.mockResolvedValue(runRow);
      prisma.ingestionRun.findFirst.mockResolvedValue(runRow);
      prisma.validationIssue.findMany.mockResolvedValue([]);
    });

    it('creates a dataset, mapping, and queued ingestion run', async () => {
      const { agent } = await signedInAgent();
      const token = await csrfTokenFor(agent);

      const created = await agent
        .post('/api/v1/datasets')
        .set('x-csrf-token', token)
        .set('x-acres-organization-id', ORG_CONTEXT.organizationId)
        .set('idempotency-key', 'dataset-create-key-0001')
        .send({ name: ' Regional source ' })
        .expect(201);

      expect(created.body).toMatchObject({
        ok: true,
        data: { id: datasetRow.id, name: 'Regional source' },
      });

      const mapping = await agent
        .post(`/api/v1/datasets/${datasetRow.id}/mappings`)
        .set('x-csrf-token', token)
        .set('x-acres-organization-id', ORG_CONTEXT.organizationId)
        .set('idempotency-key', 'mapping-create-key-0001')
        .send({
          uploadId: acceptedUpload.id,
          mapping: { regionColumn: 'region' },
        })
        .expect(201);

      expect(mapping.body).toMatchObject({
        ok: true,
        data: { id: mappingRow.id, validationStatus: 'pending' },
      });

      const run = await agent
        .post(`/api/v1/datasets/${datasetRow.id}/ingestion-runs`)
        .set('x-csrf-token', token)
        .set('x-acres-organization-id', ORG_CONTEXT.organizationId)
        .set('idempotency-key', 'ingestion-run-key-0001')
        .send({ uploadId: acceptedUpload.id, mappingId: mappingRow.id })
        .expect(201);

      expect(run.body).toMatchObject({
        ok: true,
        data: { id: runRow.id, state: 'queued', stage: 'inspect' },
      });
    });

    it('lists run status and bounded issues', async () => {
      const { agent } = await signedInAgent();

      const run = await agent
        .get(`/api/v1/ingestion-runs/${runRow.id}`)
        .set('x-acres-organization-id', ORG_CONTEXT.organizationId)
        .expect(200);

      expect(run.body).toMatchObject({
        ok: true,
        data: { id: runRow.id, state: 'queued' },
      });

      const issues = await agent
        .get(`/api/v1/ingestion-runs/${runRow.id}/issues`)
        .set('x-acres-organization-id', ORG_CONTEXT.organizationId)
        .expect(200);

      expect(issues.body).toMatchObject({ ok: true, data: [] });
    });

    it('does not create a mapping for a foreign or missing upload', async () => {
      prisma.upload.findFirst.mockResolvedValue(null);
      const { agent } = await signedInAgent();
      const token = await csrfTokenFor(agent);

      const response = await agent
        .post(`/api/v1/datasets/${datasetRow.id}/mappings`)
        .set('x-csrf-token', token)
        .set('x-acres-organization-id', ORG_CONTEXT.organizationId)
        .set('idempotency-key', 'mapping-create-key-0002')
        .send({
          uploadId: acceptedUpload.id,
          mapping: { regionColumn: 'region' },
        })
        .expect(404);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
      expect(prisma.columnMapping.create).not.toHaveBeenCalled();
    });
  });

  describe('analytics', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const metricRow = {
      id: '018f7611-89ab-7abc-9234-777777777777',
      organizationId: ORG_CONTEXT.organizationId,
      datasetId: null,
      key: 'population',
      label: 'Population',
      description: null,
      valueType: 'numeric',
      canonicalUnit: 'people',
      allowedAggregation: 'sum',
      calculationVersion: 'analytics-v1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    const observationRow = {
      id: '018f7611-89ab-7abc-9234-888888888888',
      organizationId: ORG_CONTEXT.organizationId,
      datasetVersionId: '018f7611-89ab-7abc-9234-999999999999',
      regionId: '018f7611-89ab-7abc-9234-aaaaaaaaaaaa',
      metricDefinitionId: metricRow.id,
      periodStart: now,
      periodEnd: now,
      periodLabel: '2026',
      numericValue: new Prisma.Decimal('9007199254740993'),
      textValue: null,
      booleanValue: null,
      unit: 'people',
      dimensionHash:
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      dimensions: {},
      sourceRowNumber: 1,
      sourceReference: {},
      createdAt: now,
      metricDefinition: metricRow,
      qualities: [],
    };
    const aggregateRow = {
      ...observationRow,
      id: '018f7611-89ab-7abc-9234-bbbbbbbbbbbb',
      aggregateType: 'sum',
      observationCount: 1,
      qualitySummary: { error: 0, warning: 0, info: 0 },
      datasetVersionIds: [observationRow.datasetVersionId],
      metricDefinition: metricRow,
    };

    beforeEach(() => {
      prisma.membership.findFirst.mockResolvedValue(ORG_CONTEXT);
      prisma.metricDefinition.findMany.mockResolvedValue([metricRow]);
      prisma.metricDefinition.findFirst.mockResolvedValue(metricRow);
      prisma.metricObservation.findMany.mockResolvedValue([observationRow]);
      prisma.metricAggregate.findMany.mockResolvedValue([aggregateRow]);
      prisma.metricAggregate.findFirst.mockResolvedValue(aggregateRow);
      prisma.metricAggregateLineage.findMany.mockResolvedValue([
        {
          id: '018f7611-89ab-7abc-9234-cccccccccccc',
          organizationId: ORG_CONTEXT.organizationId,
          aggregateId: aggregateRow.id,
          observationId: observationRow.id,
          datasetVersionId: observationRow.datasetVersionId,
          createdAt: now,
          observation: observationRow,
          datasetVersion: {
            id: observationRow.datasetVersionId,
            organizationId: ORG_CONTEXT.organizationId,
            datasetId: '018f7611-89ab-7abc-9234-dddddddddddd',
            versionNumber: 1,
            sourceUploadId: '018f7611-89ab-7abc-9234-eeeeeeeeeeee',
            storedObjectId: '018f7611-89ab-7abc-9234-ffffffffffff',
            mappingId: '018f7611-89ab-7abc-9234-111111111112',
            publicationStatus: 'published',
            checksumHex: null,
            sourceSummary: {},
            publishedAt: now,
            createdAt: now,
          },
        },
      ]);
    });

    it('lists metric definitions and observations in the selected organization', async () => {
      const { agent } = await signedInAgent();

      const metrics = await agent
        .get('/api/v1/analytics/metrics')
        .set('x-acres-organization-id', ORG_CONTEXT.organizationId)
        .expect(200);
      expect(metrics.body).toMatchObject({
        ok: true,
        data: [{ id: metricRow.id, key: 'population' }],
      });

      const observations = await agent
        .get(
          `/api/v1/analytics/observations?metricId=${metricRow.id}&periodStart=2026-01-01T00:00:00.000Z&periodEnd=2026-12-31T00:00:00.000Z`,
        )
        .set('x-acres-organization-id', ORG_CONTEXT.organizationId)
        .expect(200);
      expect(observations.body).toMatchObject({
        ok: true,
        data: [
          {
            id: observationRow.id,
            value: { type: 'numeric', value: '9007199254740993' },
          },
        ],
      });
      const observationFindMany = prisma.metricObservation
        .findMany as jest.Mock<
        unknown,
        [
          {
            where: {
              metricDefinitionId?: string;
              periodStart?: { gte: Date };
              periodEnd?: { lte: Date };
            };
          },
        ]
      >;
      expect(observationFindMany.mock.calls.at(-1)?.[0]).toMatchObject({
        where: {
          metricDefinitionId: metricRow.id,
          periodStart: { gte: new Date('2026-01-01T00:00:00.000Z') },
          periodEnd: { lte: new Date('2026-12-31T00:00:00.000Z') },
        },
      });
    });

    it('returns not-found for a missing scoped metric', async () => {
      prisma.metricDefinition.findFirst.mockResolvedValue(null);
      const { agent } = await signedInAgent();

      const response = await agent
        .get(`/api/v1/analytics/metrics/${metricRow.id}`)
        .set('x-acres-organization-id', ORG_CONTEXT.organizationId)
        .expect(404);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
    });

    it('returns aggregate evidence using the documented response shape', async () => {
      const { agent } = await signedInAgent();

      const response = await agent
        .get(`/api/v1/analytics/aggregates/${aggregateRow.id}/evidence`)
        .set('x-acres-organization-id', ORG_CONTEXT.organizationId)
        .expect(200);

      expect(response.body).toMatchObject({
        ok: true,
        data: {
          aggregate: {
            id: aggregateRow.id,
            datasetVersionId: observationRow.datasetVersionId,
            observationCount: 1,
            qualitySummary: { error: 0, warning: 0, info: 0 },
          },
          evidence: [
            {
              observationId: observationRow.id,
              observation: {
                id: observationRow.id,
                datasetVersionId: observationRow.datasetVersionId,
                dimensionHash: observationRow.dimensionHash,
                createdAt: now.toISOString(),
              },
            },
          ],
        },
      });
    });
  });

  describe('dashboard views', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const viewRow = {
      id: '018f7611-89ab-7abc-9234-121212121212',
      organizationId: ORG_CONTEXT.organizationId,
      ownerAccountId: ACCOUNT_ROW.id,
      name: 'Population comparison',
      description: null,
      filters: {
        metricId: '018f7611-89ab-7abc-9234-777777777777',
      },
      presentation: { chart: 'bar', compareBy: 'period' },
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    beforeEach(() => {
      prisma.membership.findFirst.mockResolvedValue(ORG_CONTEXT);
      prisma.dashboardView.findMany.mockResolvedValue([viewRow]);
      prisma.dashboardView.findFirst.mockResolvedValue(viewRow);
      prisma.dashboardView.create.mockResolvedValue(viewRow);
      prisma.dashboardView.update.mockResolvedValue({
        ...viewRow,
        status: 'archived',
      });
    });

    it('saves and reopens a dashboard view in the selected organization', async () => {
      const { agent } = await signedInAgent();
      const token = await csrfTokenFor(agent);

      const created = await agent
        .post('/api/v1/dashboard-views')
        .set('x-csrf-token', token)
        .set('x-acres-organization-id', ORG_CONTEXT.organizationId)
        .set('idempotency-key', 'dashboard-view-key-0001')
        .send({
          name: ' Population comparison ',
          filters: viewRow.filters,
          presentation: viewRow.presentation,
        })
        .expect(201);

      expect(created.body).toMatchObject({
        ok: true,
        data: { id: viewRow.id, name: 'Population comparison' },
      });
      expect(prisma.dashboardView.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_CONTEXT.organizationId,
            ownerAccountId: ACCOUNT_ROW.id,
          }) as unknown,
        }),
      );

      const reopened = await agent
        .get(`/api/v1/dashboard-views/${viewRow.id}`)
        .set('x-acres-organization-id', ORG_CONTEXT.organizationId)
        .expect(200);

      expect(reopened.body).toMatchObject({
        ok: true,
        data: { id: viewRow.id, filters: viewRow.filters },
      });
    });

    it('lets viewers read but not save dashboard views', async () => {
      prisma.membership.findFirst.mockResolvedValue({
        ...ORG_CONTEXT,
        role: 'viewer',
      });
      const { agent } = await signedInAgent();
      const token = await csrfTokenFor(agent);

      await agent
        .get('/api/v1/dashboard-views')
        .set('x-acres-organization-id', ORG_CONTEXT.organizationId)
        .expect(200);

      const forbidden = await agent
        .post('/api/v1/dashboard-views')
        .set('x-csrf-token', token)
        .set('x-acres-organization-id', ORG_CONTEXT.organizationId)
        .set('idempotency-key', 'dashboard-view-key-0002')
        .send({ name: 'Viewer view', filters: {} })
        .expect(403);

      expect(forbidden.body).toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN' },
      });
      expect(prisma.dashboardView.create).not.toHaveBeenCalled();
    });

    it('rejects blank dashboard view names after trimming', async () => {
      const { agent } = await signedInAgent();
      const token = await csrfTokenFor(agent);

      const response = await agent
        .post('/api/v1/dashboard-views')
        .set('x-csrf-token', token)
        .set('x-acres-organization-id', ORG_CONTEXT.organizationId)
        .set('idempotency-key', 'dashboard-view-key-0003')
        .send({ name: '   ', filters: {} })
        .expect(400);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_FAILED' },
      });
      expect(prisma.dashboardView.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /auth/session', () => {
    it('answers with the anonymous profile when no cookie is sent', async () => {
      const response = await request(server)
        .get('/api/v1/auth/session')
        .expect(200);

      expect(response.body).toMatchObject({
        ok: true,
        data: { authenticated: false, account: null, expiresAt: null },
      });
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('clears a cookie that no longer resolves to a session', async () => {
      const { agent } = await signedInAgent();
      prisma.session.findUnique.mockResolvedValue(null);

      const response = await agent.get('/api/v1/auth/session').expect(200);

      expect(response.body).toMatchObject({
        ok: true,
        data: { authenticated: false },
      });
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies.join(';')).toContain('acres_session=;');
    });
  });

  describe('POST /forms/contact', () => {
    it('rejects a message under the minimum length', async () => {
      const { agent, token } = await csrfAgent();

      const response = await agent
        .post('/api/v1/forms/contact')
        .set('x-csrf-token', token)
        .send({ name: 'Ada', email: 'ada@example.com', message: 'too short' })
        .expect(400);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_FAILED' },
      });
      expect(prisma.contactSubmission.create).not.toHaveBeenCalled();
    });

    it('stores a valid submission and returns a receipt', async () => {
      const receivedAt = new Date('2026-08-21T10:00:00.000Z');
      prisma.contactSubmission.create.mockResolvedValue({
        id: 'submission-1',
        createdAt: receivedAt,
      });
      const { agent, token } = await csrfAgent();

      const response = await agent
        .post('/api/v1/forms/contact')
        .set('x-csrf-token', token)
        .send({
          name: 'Ada Lovelace',
          email: 'Ada@Example.com ',
          message: 'We would like a walkthrough of the regional dataset.',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        ok: true,
        data: { id: 'submission-1', receivedAt: receivedAt.toISOString() },
      });
      const expectedData: unknown = expect.objectContaining({
        email: 'ada@example.com',
        source: 'landing',
      });
      expect(prisma.contactSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expectedData }),
      );
    });
  });

  describe('an authenticated session', () => {
    it('sets an HttpOnly, SameSite=Lax, path-scoped session cookie', async () => {
      const { response } = await signedInAgent();

      const cookies = response.headers['set-cookie'] as unknown as string[];
      const session = cookies.find((cookie) =>
        cookie.startsWith('acres_session='),
      );

      expect(session).toBeDefined();
      expect(session).toContain('HttpOnly');
      expect(session).toContain('SameSite=Lax');
      expect(session).toContain('Path=/');
      // Not Secure outside production, or the cookie would never be sent
      // over plain http in local development.
      expect(session).not.toContain('Secure');
      expect(session).toContain('Expires=');
    });

    it('stores only a hash of the session token, never the token', async () => {
      const { response } = await signedInAgent();

      const raw = sessionCookieValue(response);
      const [firstCall] = prisma.session.create.mock.calls as unknown as [
        [{ data: { tokenHash: string } }],
      ];
      const stored = firstCall[0];

      expect(raw).toBeTruthy();
      expect(stored.data.tokenHash).not.toBe(raw);
      expect(stored.data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('admits the session to GET /account', async () => {
      const { agent, response: registration } = await signedInAgent();

      const response = await agent.get('/api/v1/account').expect(200);

      expect(response.body).toMatchObject({
        ok: true,
        data: { id: 'account-1', email: 'ada@example.com' },
      });
      expect(response.body).not.toHaveProperty('data.passwordHash');

      // The double ignores `where`, so without this the test would still pass
      // if `resolve` hashed the token differently from `issue` — the one
      // regression that would break every real login.
      const raw = sessionCookieValue(registration);
      expect(prisma.session.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: createHash('sha256').update(raw).digest('hex') },
        }),
      );
    });

    it('admits the session to GET /jobs/runs', async () => {
      prisma.jobRun.findMany.mockResolvedValue([]);
      const { agent } = await signedInAgent();

      const response = await agent.get('/api/v1/jobs/runs').expect(200);

      expect(response.body).toMatchObject({ ok: true, data: [] });
      expect(prisma.jobRun.findMany).toHaveBeenCalled();
    });

    it('revokes the session and clears the cookie on logout', async () => {
      prisma.session.updateMany.mockResolvedValue({ count: 1 });
      const { agent } = await signedInAgent();
      const token = await csrfTokenFor(agent);

      const response = await agent
        .post('/api/v1/auth/logout')
        .set('x-csrf-token', token)
        .expect(200);

      const expectedRevocation: unknown = expect.objectContaining({
        revokedAt: expect.any(Date) as unknown,
      });
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'session-1' }) as unknown,
          data: expectedRevocation,
        }),
      );
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies.join(';')).toContain('acres_session=;');
    });
  });

  describe('organizations', () => {
    it('fails closed when tenancy is disabled', async () => {
      await recreateApp({ TENANCY_ENABLED: 'false' });
      const { agent } = await signedInAgent();

      const response = await agent.get('/api/v1/organizations').expect(503);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'NOT_READY' },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('fails closed on organization-scoped routes before tenant lookup', async () => {
      await recreateApp({ TENANCY_ENABLED: 'false' });
      const { agent } = await signedInAgent();

      const response = await agent
        .get('/api/v1/organizations/018f0000-0000-7000-8000-000000000001')
        .expect(503);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'NOT_READY' },
      });
      expect(prisma.membership.findFirst).not.toHaveBeenCalled();
    });

    it('creates an explicit first organization for the signed-in account', async () => {
      const { agent } = await signedInAgent();
      const csrf = await csrfTokenFor(agent);
      const createdAt = new Date('2026-08-24T10:00:00.000Z');
      const updatedAt = new Date('2026-08-24T10:01:00.000Z');
      prisma.organization.create.mockResolvedValue({
        id: '018f0000-0000-7000-8000-000000000001',
        name: 'Acme Analytics',
        createdAt,
        updatedAt,
      });
      prisma.membership.create.mockResolvedValue({
        id: '018f0000-0000-7000-8000-000000000002',
        organizationId: '018f0000-0000-7000-8000-000000000001',
        accountId: 'account-1',
        role: 'owner',
        createdAt,
        updatedAt,
        revokedAt: null,
      });
      prisma.auditEvent.create.mockResolvedValue({ id: 'audit-1' });

      const response = await agent
        .post('/api/v1/organizations')
        .set('x-csrf-token', csrf)
        .set('Idempotency-Key', 'create-org-key-0001')
        .send({ name: ' Acme Analytics ' })
        .expect(201);

      expect(response.body).toMatchObject({
        ok: true,
        data: {
          name: 'Acme Analytics',
          membership: { role: 'owner' },
        },
      });
      const expectedMembershipData: unknown = expect.objectContaining({
        accountId: 'account-1',
        role: 'owner',
      });
      expect(prisma.membership.create).toHaveBeenCalledWith({
        data: expectedMembershipData,
      });
    });

    it('replays a matching organization create idempotency key', async () => {
      const { agent } = await signedInAgent();
      const csrf = await csrfTokenFor(agent);
      const responseBody = {
        id: '018f0000-0000-7000-8000-000000000001',
        name: 'Acme Analytics',
        createdAt: '2026-08-24T10:00:00.000Z',
        updatedAt: '2026-08-24T10:01:00.000Z',
        membership: {
          id: '018f0000-0000-7000-8000-000000000002',
          role: 'owner',
        },
      };
      prisma.idempotencyRecord.findFirst.mockResolvedValue({
        id: 'idempotency-1',
        keyDigest: 'digest',
        accountId: 'account-1',
        organizationId: null,
        operation: 'organizations.create',
        requestHash:
          '66615894ccf7a1e708653aa9463b17e38f583d544add5707ad7f884b743afcea',
        state: 'succeeded',
        responseStatus: 201,
        responseBody,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      const response = await agent
        .post('/api/v1/organizations')
        .set('x-csrf-token', csrf)
        .set('Idempotency-Key', 'create-org-key-0001')
        .send({ name: ' Acme Analytics ' })
        .expect(201);

      expect(response.body).toMatchObject({ ok: true, data: responseBody });
      expect(prisma.organization.create).not.toHaveBeenCalled();
    });

    it('rejects a changed body for a reused idempotency key', async () => {
      const { agent } = await signedInAgent();
      const csrf = await csrfTokenFor(agent);
      prisma.idempotencyRecord.findFirst.mockResolvedValue({
        id: 'idempotency-1',
        keyDigest: 'digest',
        accountId: 'account-1',
        organizationId: null,
        operation: 'organizations.create',
        requestHash: 'different-body',
        state: 'succeeded',
        responseStatus: 201,
        responseBody: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      const response = await agent
        .post('/api/v1/organizations')
        .set('x-csrf-token', csrf)
        .set('Idempotency-Key', 'create-org-key-0001')
        .send({ name: 'Different' })
        .expect(409);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'IDEMPOTENCY_CONFLICT' },
      });
    });

    it('cleans an expired idempotency key before reserving a new request', async () => {
      const { agent } = await signedInAgent();
      const csrf = await csrfTokenFor(agent);
      const createdAt = new Date('2026-08-24T10:00:00.000Z');
      const updatedAt = new Date('2026-08-24T10:01:00.000Z');
      prisma.organization.create.mockResolvedValue({
        id: '018f0000-0000-7000-8000-000000000001',
        name: 'Acme Analytics',
        createdAt,
        updatedAt,
      });
      prisma.membership.create.mockResolvedValue({
        id: '018f0000-0000-7000-8000-000000000002',
        organizationId: '018f0000-0000-7000-8000-000000000001',
        accountId: 'account-1',
        role: 'owner',
        createdAt,
        updatedAt,
        revokedAt: null,
      });
      prisma.auditEvent.create.mockResolvedValue({ id: 'audit-1' });

      await agent
        .post('/api/v1/organizations')
        .set('x-csrf-token', csrf)
        .set('Idempotency-Key', 'expired-org-key-0001')
        .send({ name: ' Acme Analytics ' })
        .expect(201);

      expect(prisma.idempotencyRecord.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          expiresAt: { lte: expect.any(Date) as Date },
        }) as unknown,
      });
      expect(prisma.organization.create).toHaveBeenCalledTimes(1);
    });

    it('returns NOT_FOUND for malformed organization context before querying', async () => {
      const { agent } = await signedInAgent();

      const response = await agent
        .get('/api/v1/organizations/not-a-uuid')
        .expect(404);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
      expect(prisma.membership.findFirst).not.toHaveBeenCalled();
    });

    it('validates ownership-transfer membership ids from the body', async () => {
      const { agent } = await signedInAgent();
      const csrf = await csrfTokenFor(agent);
      prisma.membership.findFirst.mockResolvedValue({
        id: '018f0000-0000-7000-8000-000000000002',
        organizationId: '018f0000-0000-7000-8000-000000000001',
        accountId: 'account-1',
        role: 'owner',
        revokedAt: null,
      });

      const response = await agent
        .post(
          '/api/v1/organizations/018f0000-0000-7000-8000-000000000001/ownership-transfers',
        )
        .set('x-csrf-token', csrf)
        .set('Idempotency-Key', 'transfer-org-key-1')
        .send({ membershipId: 'not-a-uuid' })
        .expect(400);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_FAILED' },
      });
      expect(prisma.membership.update).not.toHaveBeenCalled();
    });
  });

  describe('GET /regions/:slug', () => {
    it('answers 404 NOT_FOUND for an unknown slug', async () => {
      prisma.region.findUnique.mockResolvedValue(null);

      const response = await request(server)
        .get('/api/v1/regions/nowhere')
        .expect(404);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
    });
  });

  describe('GraphQL', () => {
    const organizationId = '018f0000-0000-7000-8000-000000000001';

    it('rejects GET requests', async () => {
      const response = await request(server).get('/graphql').expect(405);

      const body = response.body as {
        errors: { extensions: Record<string, unknown> }[];
      };
      expect(body.errors[0].extensions).toMatchObject({
        code: 'METHOD_NOT_ALLOWED',
      });
      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('requires a session before resolver work', async () => {
      const { agent, token } = await csrfAgent();
      const response = await agent
        .post('/graphql')
        .set('x-csrf-token', token)
        .set('x-organization-id', organizationId)
        .send({
          operationName: 'Viewer',
          query: 'query Viewer { viewer { account { id } } }',
        })
        .expect(200);

      const body = response.body as {
        errors: { extensions: Record<string, unknown> }[];
      };
      expect(body.errors[0].extensions).toMatchObject({
        code: 'UNAUTHENTICATED',
        requestId: expect.any(String) as string,
      });
    });

    it('answers viewer for an authenticated organization member', async () => {
      const { agent } = await signedInAgent();
      const csrf = await csrfTokenFor(agent);
      prisma.membership.findFirst.mockResolvedValue({
        id: '018f0000-0000-7000-8000-000000000002',
        organizationId,
        accountId: 'account-1',
        role: 'owner',
        revokedAt: null,
      });

      const response = await agent
        .post('/graphql')
        .set('x-csrf-token', csrf)
        .set('x-organization-id', organizationId)
        .send({
          operationName: 'Viewer',
          query:
            'query Viewer { viewer { account { id email } membership { id role } } }',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        data: {
          viewer: {
            account: { id: 'account-1', email: 'ada@example.com' },
            membership: { role: 'owner' },
          },
        },
      });
    });

    it('answers a dashboard summary for an authenticated analytics reader', async () => {
      const { agent } = await signedInAgent();
      const csrf = await csrfTokenFor(agent);
      prisma.membership.findFirst.mockResolvedValue({
        id: '018f0000-0000-7000-8000-000000000002',
        organizationId,
        accountId: 'account-1',
        role: 'viewer',
        revokedAt: null,
      });
      prisma.metricDefinition.findMany.mockResolvedValue([]);
      prisma.metricAggregate.findMany.mockResolvedValue([]);
      prisma.dashboardView.findMany.mockResolvedValue([]);

      const response = await agent
        .post('/graphql')
        .set('x-csrf-token', csrf)
        .set('x-organization-id', organizationId)
        .send({
          operationName: 'DashboardSummary',
          query:
            'query DashboardSummary { dashboardSummary { metrics { id } aggregates { id } savedViews { id } } }',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        data: {
          dashboardSummary: {
            metrics: [],
            aggregates: [],
            savedViews: [],
          },
        },
      });
    });

    it('shares duplicate region lookups through a request loader', async () => {
      const { agent } = await signedInAgent();
      const csrf = await csrfTokenFor(agent);
      prisma.membership.findFirst.mockResolvedValue({
        id: '018f0000-0000-7000-8000-000000000002',
        organizationId,
        accountId: 'account-1',
        role: 'owner',
        revokedAt: null,
      });
      prisma.region.findMany.mockResolvedValue([
        {
          id: 'region-1',
          slug: 'acadia',
          name: 'Acadia',
          countryCode: 'US',
          summary: 'A coastal region.',
          metrics: [],
        },
      ]);

      const response = await agent
        .post('/graphql')
        .set('x-csrf-token', csrf)
        .set('x-organization-id', organizationId)
        .send({
          operationName: 'RegionAliases',
          query:
            'query RegionAliases { a: region(slug: "acadia") { slug } b: region(slug: "acadia") { name } }',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        data: {
          a: { slug: 'acadia' },
          b: { name: 'Acadia' },
        },
      });
      expect(prisma.region.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.region.findMany).toHaveBeenCalledWith({
        where: { slug: { in: ['acadia'] } },
        include: { metrics: { orderBy: { key: 'asc' } } },
      });
    });

    it('bounds GraphQL region connection database reads', async () => {
      const { agent } = await signedInAgent();
      const csrf = await csrfTokenFor(agent);
      prisma.membership.findFirst.mockResolvedValue({
        id: '018f0000-0000-7000-8000-000000000002',
        organizationId,
        accountId: 'account-1',
        role: 'owner',
        revokedAt: null,
      });
      prisma.region.findMany.mockResolvedValue([
        {
          id: 'region-1',
          slug: 'acadia',
          name: 'Acadia',
          countryCode: 'US',
          summary: null,
          metrics: [],
        },
        {
          id: 'region-2',
          slug: 'boston',
          name: 'Boston',
          countryCode: 'US',
          summary: null,
          metrics: [],
        },
        {
          id: 'region-3',
          slug: 'chicago',
          name: 'Chicago',
          countryCode: 'US',
          summary: null,
          metrics: [],
        },
      ]);

      const response = await agent
        .post('/graphql')
        .set('x-csrf-token', csrf)
        .set('x-organization-id', organizationId)
        .send({
          operationName: 'Regions',
          query:
            'query Regions { regions(first: 2) { edges { node { slug } } pageInfo { hasNextPage } } }',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        data: {
          regions: {
            edges: [{ node: { slug: 'acadia' } }, { node: { slug: 'boston' } }],
            pageInfo: { hasNextPage: true },
          },
        },
      });
      expect(prisma.region.findMany).toHaveBeenCalledWith({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        include: { metrics: { orderBy: { key: 'asc' } } },
        take: 3,
      });
      expect(rawSqlCalls()).toContain('statement_timeout');
    });

    it('counts variable-based first values in aggregate node limits', async () => {
      await recreateApp({ GRAPHQL_MAX_NODES: '3' });
      const { agent } = await signedInAgent();
      const csrf = await csrfTokenFor(agent);
      prisma.membership.findFirst.mockResolvedValue({
        id: '018f0000-0000-7000-8000-000000000002',
        organizationId,
        accountId: 'account-1',
        role: 'owner',
        revokedAt: null,
      });

      const response = await agent
        .post('/graphql')
        .set('x-csrf-token', csrf)
        .set('x-organization-id', organizationId)
        .send({
          operationName: 'TooManyNodes',
          query:
            'query TooManyNodes($n: Int!) { a: regions(first: $n) { edges { node { id } } } b: regions(first: $n) { edges { node { id } } } }',
          variables: { n: 2 },
        })
        .expect(200);

      expect(response.body).toMatchObject({
        errors: [
          {
            extensions: {
              code: 'QUERY_LIMIT_EXCEEDED',
              requestId: expect.any(String) as string,
            },
          },
        ],
      });
      expect(prisma.region.findMany).not.toHaveBeenCalled();
    });

    it('rejects oversized GraphQL bodies before parsing', async () => {
      await recreateApp({ GRAPHQL_MAX_BYTES: '80' });
      const { agent, token } = await csrfAgent();

      const response = await agent
        .post('/graphql')
        .set('x-csrf-token', token)
        .set('x-organization-id', organizationId)
        .send({
          operationName: 'Oversized',
          query:
            'query Oversized { viewer { account { id email displayName } membership { id role } } }',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        errors: [
          {
            extensions: {
              code: 'QUERY_LIMIT_EXCEEDED',
              requestId: expect.any(String) as string,
            },
          },
        ],
      });
      expect(prisma.membership.findFirst).not.toHaveBeenCalled();
    });

    it('counts aliases inside fragments before resolver work', async () => {
      await recreateApp({ GRAPHQL_MAX_ALIASES: '1' });
      const { agent } = await signedInAgent();
      const csrf = await csrfTokenFor(agent);
      prisma.membership.findFirst.mockResolvedValue({
        id: '018f0000-0000-7000-8000-000000000002',
        organizationId,
        accountId: 'account-1',
        role: 'owner',
        revokedAt: null,
      });

      const response = await agent
        .post('/graphql')
        .set('x-csrf-token', csrf)
        .set('x-organization-id', organizationId)
        .send({
          operationName: 'FragmentAliases',
          query:
            'query FragmentAliases { ...RegionFields } fragment RegionFields on Query { a: region(slug: "acadia") { id } b: region(slug: "boston") { id } }',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        errors: [
          {
            extensions: {
              code: 'QUERY_LIMIT_EXCEEDED',
              requestId: expect.any(String) as string,
            },
          },
        ],
      });
      expect(prisma.region.findMany).not.toHaveBeenCalled();
    });

    it('applies list-aware GraphQL cost to connection children', async () => {
      await recreateApp({ GRAPHQL_MAX_COST: '30' });
      const { agent } = await signedInAgent();
      const csrf = await csrfTokenFor(agent);
      prisma.membership.findFirst.mockResolvedValue({
        id: '018f0000-0000-7000-8000-000000000002',
        organizationId,
        accountId: 'account-1',
        role: 'owner',
        revokedAt: null,
      });

      const response = await agent
        .post('/graphql')
        .set('x-csrf-token', csrf)
        .set('x-organization-id', organizationId)
        .send({
          operationName: 'CostlyConnection',
          query:
            'query CostlyConnection { regions(first: 10) { edges { node { id slug name countryCode summary metrics { id key label value unit } } } pageInfo { hasNextPage endCursor } } }',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        errors: [
          {
            extensions: {
              code: 'QUERY_LIMIT_EXCEEDED',
              requestId: expect.any(String) as string,
            },
          },
        ],
      });
      expect(prisma.region.findMany).not.toHaveBeenCalled();
    });
  });

  describe('rate limiting', () => {
    it('limits POST /forms/contact with the strict tier', async () => {
      await recreateApp({
        RATE_LIMIT_TTL_MS: '60000',
        RATE_LIMIT_STRICT_LIMIT: '2',
      });
      prisma.contactSubmission.create.mockResolvedValue({
        id: 'submission-1',
        createdAt: new Date('2026-08-23T10:00:00.000Z'),
      });
      const { agent, token } = await csrfAgent();
      const body = {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        message: 'We would like a walkthrough of the regional dataset.',
      };

      await agent
        .post('/api/v1/forms/contact')
        .set('x-csrf-token', token)
        .send(body)
        .expect(201);
      await agent
        .post('/api/v1/forms/contact')
        .set('x-csrf-token', token)
        .send(body)
        .expect(201);
      const response = await agent
        .post('/api/v1/forms/contact')
        .set('x-csrf-token', token)
        .send(body)
        .expect(429);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED', message: expect.any(String) as string },
      });
    });

    it('limits POST /auth/login with the strict tier', async () => {
      await recreateApp({
        RATE_LIMIT_TTL_MS: '60000',
        RATE_LIMIT_STRICT_LIMIT: '2',
      });
      prisma.account.findUnique.mockResolvedValue(null);
      const { agent, token } = await csrfAgent();
      const body = {
        email: 'nobody@example.com',
        password: 'wrong-password-here',
      };

      await agent
        .post('/api/v1/auth/login')
        .set('x-csrf-token', token)
        .send(body)
        .expect(401);
      await agent
        .post('/api/v1/auth/login')
        .set('x-csrf-token', token)
        .send(body)
        .expect(401);
      const response = await agent
        .post('/api/v1/auth/login')
        .set('x-csrf-token', token)
        .send(body)
        .expect(429);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED', message: expect.any(String) as string },
      });
    });

    it('limits POST /auth/register with the strict tier', async () => {
      await recreateApp({
        RATE_LIMIT_TTL_MS: '60000',
        RATE_LIMIT_STRICT_LIMIT: '2',
      });
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(ACCOUNT_ROW);
      prisma.session.create.mockResolvedValue({ id: 'session-1' });
      const { agent, token } = await csrfAgent();
      const body = {
        email: 'new-account@example.com',
        password: 'a-long-enough-password',
        displayName: 'Ada Lovelace',
      };

      await agent
        .post('/api/v1/auth/register')
        .set('x-csrf-token', token)
        .send(body)
        .expect(201);
      const secondToken = await csrfTokenFor(agent);
      await agent
        .post('/api/v1/auth/register')
        .set('x-csrf-token', secondToken)
        .send(body)
        .expect(201);
      const blockedToken = await csrfTokenFor(agent);
      const response = await agent
        .post('/api/v1/auth/register')
        .set('x-csrf-token', blockedToken)
        .send(body)
        .expect(429);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED', message: expect.any(String) as string },
      });
    });

    it('keeps GET /auth/csrf on the default tier', async () => {
      await recreateApp({
        RATE_LIMIT_TTL_MS: '60000',
        RATE_LIMIT_STRICT_LIMIT: '2',
      });
      const agent = request.agent(server);

      for (let attempt = 0; attempt < 7; attempt += 1) {
        await agent.get('/api/v1/auth/csrf').expect(200);
      }
    });

    it('limits GET /auth/csrf with the default tier', async () => {
      await recreateApp({
        RATE_LIMIT_TTL_MS: '60000',
        RATE_LIMIT_DEFAULT_LIMIT: '2',
      });
      const agent = request.agent(server);

      await agent.get('/api/v1/auth/csrf').expect(200);
      await agent.get('/api/v1/auth/csrf').expect(200);
      const response = await agent.get('/api/v1/auth/csrf').expect(429);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED', message: expect.any(String) as string },
      });
    });

    it('skips throttling for GET /health', async () => {
      await recreateApp({
        RATE_LIMIT_TTL_MS: '60000',
        RATE_LIMIT_DEFAULT_LIMIT: '2',
      });

      for (let attempt = 0; attempt < 7; attempt += 1) {
        await request(server).get('/health').expect(200);
      }
    });
  });
});
