import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createRealDbTestApp, truncateAll } from './helpers/real-db-test-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Real-database integration suite. Unlike `api.e2e-spec.ts` (which overrides
 * `PrismaService` with a recorded double), every test here runs against a
 * real, migrated `acres_test` database — see `test/setup-env.ts` for the
 * connection string and `scripts/db/bootstrap-roles.sh` for the role it
 * connects as (`acres_test`, CRUD + TRUNCATE only, no DDL).
 */
describe('Acres API — real database', () => {
  let app: INestApplication;
  let server: App;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createRealDbTestApp());
    server = app.getHttpServer() as App;

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      throw new Error(
        `acres_test database is not reachable at ${process.env.DATABASE_URL}. ` +
          'Run "npm run db:up" (or the native bootstrap in prompts/18-database-infrastructure.md) ' +
          `and apply migrations before running this suite. Underlying error: ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
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

  async function signedInAgent(email = 'tenant@example.com') {
    const { agent, token } = await csrfAgent();
    await agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', token)
      .send({
        email,
        password: 'a-long-enough-password',
        displayName: 'Tenant User',
      })
      .expect(201);
    const csrf = await agent.get('/api/v1/auth/csrf').expect(200);
    return {
      agent,
      token: (csrf.body as { data: { csrfToken: string } }).data.csrfToken,
    };
  }

  async function expectConnectionDenied(connectionString: string) {
    const probe = new PrismaClient({
      adapter: new PrismaPg({
        connectionString,
        connectionTimeoutMillis: 1000,
      }),
    });

    try {
      await expect(probe.$queryRaw`SELECT 1`).rejects.toThrow(
        /permission denied|access denied|not allowed/i,
      );
    } finally {
      await probe.$disconnect();
    }
  }

  async function expectMigrationBookkeepingExists(connectionString: string) {
    const probe = new PrismaClient({
      adapter: new PrismaPg({
        connectionString,
        connectionTimeoutMillis: 1000,
      }),
    });

    try {
      await expect(
        probe.$queryRawUnsafe('SELECT COUNT(*) FROM "_prisma_migrations"'),
      ).resolves.toBeDefined();
    } finally {
      await probe.$disconnect();
    }
  }

  async function expectMigrationBookkeepingDenied(connectionString: string) {
    const probe = new PrismaClient({
      adapter: new PrismaPg({
        connectionString,
        connectionTimeoutMillis: 1000,
      }),
    });

    try {
      await expect(
        probe.$queryRawUnsafe('SELECT * FROM "_prisma_migrations" LIMIT 1'),
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await probe.$disconnect();
    }
  }

  describe('CRUD — POST /auth/register', () => {
    it('creates a real account with a bcrypt password hash', async () => {
      const { agent, token } = await csrfAgent();

      const response = await agent
        .post('/api/v1/auth/register')
        .set('x-csrf-token', token)
        .send({
          email: 'ada@example.com',
          password: 'a-long-enough-password',
          displayName: 'Ada Lovelace',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        ok: true,
        data: { authenticated: true, account: { email: 'ada@example.com' } },
      });

      const stored = await prisma.account.findUnique({
        where: { email: 'ada@example.com' },
      });
      expect(stored).not.toBeNull();
      expect(stored?.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(stored?.passwordHash).not.toBe('a-long-enough-password');
    });
  });

  describe('unique — concurrent registration of the same email', () => {
    it('the loser gets INVALID_CREDENTIALS from a real P2002, not a mock', async () => {
      const [first, second] = await Promise.all([csrfAgent(), csrfAgent()]);
      const body = {
        email: 'race@example.com',
        password: 'a-long-enough-password',
        displayName: 'Race Condition',
      };

      const [firstResponse, secondResponse] = await Promise.all([
        first.agent
          .post('/api/v1/auth/register')
          .set('x-csrf-token', first.token)
          .send(body),
        second.agent
          .post('/api/v1/auth/register')
          .set('x-csrf-token', second.token)
          .send(body),
      ]);

      const statuses = [firstResponse.status, secondResponse.status].sort();
      expect(statuses).toEqual([201, 401]);

      const loser =
        firstResponse.status === 401 ? firstResponse : secondResponse;
      expect(loser.body).toMatchObject({
        ok: false,
        error: { code: 'INVALID_CREDENTIALS' },
      });

      const accounts = await prisma.account.findMany({
        where: { email: 'race@example.com' },
      });
      expect(accounts).toHaveLength(1);
    });
  });

  describe('FK + session-cascade', () => {
    it('deleting an account cascades to its sessions', async () => {
      const { agent, token } = await csrfAgent();
      await agent
        .post('/api/v1/auth/register')
        .set('x-csrf-token', token)
        .send({
          email: 'cascade@example.com',
          password: 'a-long-enough-password',
        })
        .expect(201);

      const account = await prisma.account.findUnique({
        where: { email: 'cascade@example.com' },
      });
      expect(account).not.toBeNull();
      const accountId = account!.id;

      const sessionsBefore = await prisma.session.findMany({
        where: { accountId },
      });
      expect(sessionsBefore.length).toBeGreaterThan(0);

      await prisma.account.delete({ where: { id: accountId } });

      const sessionsAfter = await prisma.session.findMany({
        where: { accountId },
      });
      expect(sessionsAfter).toHaveLength(0);
    });
  });

  describe('current route integration — GET /regions', () => {
    it('reads a seeded region and its metrics through the real query', async () => {
      const region = await prisma.region.create({
        data: {
          slug: 'acadia',
          name: 'Acadia',
          countryCode: 'US',
          summary: 'A coastal region.',
          metrics: {
            create: [{ key: 'population', label: 'Population', value: 12345 }],
          },
        },
      });

      const listResponse = await request(server)
        .get('/api/v1/regions')
        .expect(200);
      expect(listResponse.body).toMatchObject({
        ok: true,
        data: [
          expect.objectContaining({
            slug: 'acadia',
            metrics: [expect.objectContaining({ key: 'population' })],
          }) as unknown,
        ],
      });

      const oneResponse = await request(server)
        .get(`/api/v1/regions/${region.slug}`)
        .expect(200);
      expect(oneResponse.body).toMatchObject({
        ok: true,
        data: { slug: 'acadia', name: 'Acadia' },
      });

      const missingResponse = await request(server)
        .get('/api/v1/regions/nowhere')
        .expect(404);
      expect(missingResponse.body).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
    });
  });

  describe('role isolation', () => {
    it('rejects schema DDL through the app connection (acres_test)', async () => {
      let createError: unknown;
      try {
        await prisma.$executeRawUnsafe(
          'CREATE TABLE "__acres_privilege_probe" (id text);',
        );
        await prisma.$executeRawUnsafe('DROP TABLE "__acres_privilege_probe";');
      } catch (error) {
        createError = error;
      }

      expect(createError).toBeDefined();
      expect(
        createError instanceof Error
          ? createError.message
          : String(createError),
      ).toMatch(/permission denied|must be owner/i);

      const stillThere = await prisma.account.findMany();
      expect(stillThere).toEqual([]);
    });

    it('cannot read Prisma migration bookkeeping through the app connection', async () => {
      await expectMigrationBookkeepingExists(
        'postgresql://acres_migrator:acres_migrator_dev_password@localhost:5432/acres?schema=public',
      );
      await expectMigrationBookkeepingExists(
        'postgresql://acres_migrator:acres_migrator_dev_password@localhost:5432/acres_test?schema=public',
      );
      await expect(
        prisma.$queryRawUnsafe('SELECT * FROM "_prisma_migrations" LIMIT 1'),
      ).rejects.toThrow(/permission denied/i);
      await expectMigrationBookkeepingDenied(
        'postgresql://acres_app:acres_app_dev_password@localhost:5432/acres?schema=public',
      );
    });

    it('denies cross-database connections for runtime roles', async () => {
      await expectConnectionDenied(
        'postgresql://acres_test:acres_test_dev_password@localhost:5432/acres?schema=public',
      );
      await expectConnectionDenied(
        'postgresql://acres_app:acres_app_dev_password@localhost:5432/acres_test?schema=public',
      );
      await expectConnectionDenied(
        'postgresql://acres_test:acres_test_dev_password@localhost:5432/postgres?schema=public',
      );
      await expectConnectionDenied(
        'postgresql://acres_app:acres_app_dev_password@localhost:5432/postgres?schema=public',
      );
    });
  });

  describe('organization RLS', () => {
    it('enables and forces RLS on every tenant table', async () => {
      const rows = await prisma.$queryRaw<
        {
          relname: string;
          relrowsecurity: boolean;
          relforcerowsecurity: boolean;
        }[]
      >`
        SELECT relname, relrowsecurity, relforcerowsecurity
        FROM pg_class
        WHERE relname IN (
          'Organization',
          'Membership',
          'Invitation',
          'AuditEvent',
          'IdempotencyRecord',
          'StoredObject',
          'Upload',
          'Dataset',
          'DatasetVersion',
          'ColumnMapping',
          'IngestionRun',
          'ValidationIssue',
          'StagedSourceSummary',
          'MetricDefinition',
          'MetricObservation',
          'ObservationQuality',
          'MetricAggregate',
          'MetricAggregateLineage',
          'OutboxEvent',
          'DurableJob',
          'JobProgressEvent',
          'JobDeadLetter'
        )
        ORDER BY relname
      `;

      const baseRows = [
        {
          relname: 'AuditEvent',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'IdempotencyRecord',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'Invitation',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'Membership',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'Organization',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
      ];
      const storageRows = [
        {
          relname: 'DurableJob',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'JobDeadLetter',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'JobProgressEvent',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'OutboxEvent',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'StoredObject',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'Upload',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
      ];
      const ingestionRows = [
        {
          relname: 'ColumnMapping',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'Dataset',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'DatasetVersion',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'IngestionRun',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'StagedSourceSummary',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'ValidationIssue',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'MetricAggregate',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'MetricAggregateLineage',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'MetricDefinition',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'MetricObservation',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
        {
          relname: 'ObservationQuality',
          relrowsecurity: true,
          relforcerowsecurity: true,
        },
      ];
      const hasStorageMigration = rows.some((row) => row.relname === 'Upload');
      const hasIngestionMigration = rows.some(
        (row) => row.relname === 'Dataset',
      );
      const expected = hasStorageMigration
        ? [
            ...baseRows,
            ...storageRows,
            ...(hasIngestionMigration ? ingestionRows : []),
          ].sort((a, b) => a.relname.localeCompare(b.relname))
        : baseRows;
      expect(rows).toEqual(expected);
    });

    it('rejects cross-tenant ingestion foreign keys even for worker-scoped writes', async () => {
      const ownerA = await signedInAgent('ingestion-owner-a@example.com');
      const orgAResponse = await ownerA.agent
        .post('/api/v1/organizations')
        .set('Idempotency-Key', 'cross-tenant-ingestion-org-a')
        .set('x-csrf-token', ownerA.token)
        .send({ name: 'Ingestion Org A' })
        .expect(201);
      const ownerB = await signedInAgent('ingestion-owner-b@example.com');
      const orgBResponse = await ownerB.agent
        .post('/api/v1/organizations')
        .set('Idempotency-Key', 'cross-tenant-ingestion-org-b')
        .set('x-csrf-token', ownerB.token)
        .send({ name: 'Ingestion Org B' })
        .expect(201);
      const orgAId = (orgAResponse.body as { data: { id: string } }).data.id;
      const orgBId = (orgBResponse.body as { data: { id: string } }).data.id;
      const accountA = await prisma.account.findUniqueOrThrow({
        where: { email: 'ingestion-owner-a@example.com' },
        select: { id: true },
      });
      const accountB = await prisma.account.findUniqueOrThrow({
        where: { email: 'ingestion-owner-b@example.com' },
        select: { id: true },
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('acres.worker_access', 'true', true)`;
          await tx.$executeRaw`
            INSERT INTO "StoredObject" (
              "id",
              "organizationId",
              "bucket",
              "objectKey",
              "originalFilename",
              "mediaType",
              "checksumAlgorithm",
              "createdAt",
              "updatedAt"
            )
            VALUES (
              'stored_ingestion_a',
              ${orgAId},
              'test',
              'ingestion-a.csv',
              'ingestion-a.csv',
              'text/csv',
              'sha256',
              now(),
              now()
            )
          `;
          await tx.$executeRaw`
            INSERT INTO "Upload" (
              "id",
              "organizationId",
              "actorAccountId",
              "storedObjectId",
              "state",
              "declaredFilename",
              "declaredMediaType",
              "declaredByteCount",
              "checksumAlgorithm",
              "presignedUploadExpiresAt",
              "expiresAt",
              "createdAt",
              "updatedAt"
            )
            VALUES (
              'upload_ingestion_a',
              ${orgAId},
              ${accountA.id},
              'stored_ingestion_a',
              'accepted',
              'ingestion-a.csv',
              'text/csv',
              12,
              'sha256',
              now() + interval '1 hour',
              now() + interval '1 day',
              now(),
              now()
            )
          `;
          await tx.$executeRaw`
            INSERT INTO "Dataset" (
              "id",
              "organizationId",
              "ownerAccountId",
              "name",
              "createdAt",
              "updatedAt"
            )
            VALUES
              ('dataset_ingestion_a', ${orgAId}, ${accountA.id}, 'Dataset A', now(), now()),
              ('dataset_ingestion_b', ${orgBId}, ${accountB.id}, 'Dataset B', now(), now())
          `;
          await tx.$executeRaw`
            INSERT INTO "ColumnMapping" (
              "id",
              "organizationId",
              "datasetId",
              "uploadId",
              "createdByAccountId",
              "versionNumber",
              "mapping"
            )
            VALUES (
              'mapping_cross_tenant',
              ${orgAId},
              'dataset_ingestion_b',
              'upload_ingestion_a',
              ${accountA.id},
              1,
              '{"regionColumn":"region"}'::jsonb
            )
          `;
        }),
      ).rejects.toThrow(/ColumnMapping_org_dataset_fkey/);
    });

    it('creates an organization through scoped REST and default-denies unscoped reads', async () => {
      const { agent, token } = await signedInAgent('owner@example.com');

      const response = await agent
        .post('/api/v1/organizations')
        .set('Idempotency-Key', 'real-create-org-key-0001')
        .set('x-csrf-token', token)
        .send({ name: 'Owner Org' })
        .expect(201);

      const organizationId = (response.body as { data: { id: string } }).data
        .id;
      expect(organizationId).toBeTruthy();

      await expect(prisma.organization.findMany()).resolves.toEqual([]);
      await expect(prisma.membership.findMany()).resolves.toEqual([]);
      await expect(prisma.auditEvent.findMany()).resolves.toEqual([]);
    });

    it('returns the same not-found envelope for foreign and absent organization ids', async () => {
      const owner = await signedInAgent('owner@example.com');
      const other = await signedInAgent('other@example.com');

      const created = await owner.agent
        .post('/api/v1/organizations')
        .set('Idempotency-Key', 'real-create-org-key-0002')
        .set('x-csrf-token', owner.token)
        .send({ name: 'Owner Org' })
        .expect(201);
      const foreignId = (created.body as { data: { id: string } }).data.id;
      const absentId = '018f0000-0000-7000-8000-000000000099';

      const foreign = await other.agent
        .get(`/api/v1/organizations/${foreignId}`)
        .expect(404);
      const absent = await other.agent
        .get(`/api/v1/organizations/${absentId}`)
        .expect(404);

      expect(foreign.body).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
      expect(absent.body).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
    });

    it('accepts a valid invitation under RLS and rejects replay', async () => {
      const owner = await signedInAgent('owner@example.com');
      const invited = await signedInAgent('invited@example.com');

      const created = await owner.agent
        .post('/api/v1/organizations')
        .set('Idempotency-Key', 'real-create-org-key-0003')
        .set('x-csrf-token', owner.token)
        .send({ name: 'Owner Org' })
        .expect(201);
      const organizationId = (created.body as { data: { id: string } }).data.id;

      const issued = await owner.agent
        .post(`/api/v1/organizations/${organizationId}/invitations`)
        .set('Idempotency-Key', 'real-invite-key-0001')
        .set('x-csrf-token', owner.token)
        .send({ email: 'invited@example.com', role: 'viewer' })
        .expect(201);
      const token = (issued.body as { data: { token: string } }).data.token;

      const accepted = await invited.agent
        .post('/api/v1/invitations/accept')
        .set('Idempotency-Key', 'real-accept-key-0001')
        .set('x-csrf-token', invited.token)
        .send({ token })
        .expect(200);

      expect(accepted.body).toMatchObject({
        ok: true,
        data: { organizationId, membershipId: expect.any(String) as string },
      });

      const replay = await invited.agent
        .post('/api/v1/invitations/accept')
        .set('Idempotency-Key', 'real-accept-key-0002')
        .set('x-csrf-token', invited.token)
        .send({ token })
        .expect(404);

      expect(replay.body).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
      await expect(prisma.membership.findMany()).resolves.toEqual([]);
      await expect(prisma.invitation.findMany()).resolves.toEqual([]);
    });

    it('allows a replacement invitation after the previous one expires', async () => {
      const owner = await signedInAgent('owner@example.com');

      const created = await owner.agent
        .post('/api/v1/organizations')
        .set('Idempotency-Key', 'real-create-org-key-0004')
        .set('x-csrf-token', owner.token)
        .send({ name: 'Owner Org' })
        .expect(201);
      const organizationId = (created.body as { data: { id: string } }).data.id;

      const first = await owner.agent
        .post(`/api/v1/organizations/${organizationId}/invitations`)
        .set('Idempotency-Key', 'real-invite-key-0002')
        .set('x-csrf-token', owner.token)
        .send({ email: 'expired@example.com', role: 'viewer' })
        .expect(201);
      const invitationId = (first.body as { data: { id: string } }).data.id;

      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT
            set_config('acres.account_id', '', true),
            set_config('acres.organization_id', ${organizationId}, true),
            set_config('acres.invitation_token_hash', '', true)
        `;
        await tx.invitation.update({
          where: { id: invitationId },
          data: { expiresAt: new Date(Date.now() - 60_000) },
        });
      });

      const replacement = await owner.agent
        .post(`/api/v1/organizations/${organizationId}/invitations`)
        .set('Idempotency-Key', 'real-invite-key-0003')
        .set('x-csrf-token', owner.token)
        .send({ email: 'expired@example.com', role: 'viewer' })
        .expect(201);

      expect(replacement.body).toMatchObject({
        ok: true,
        data: {
          email: 'expired@example.com',
          token: expect.any(String) as string,
        },
      });
    });

    it('default-denies tenant reads when context settings are malformed', async () => {
      const { agent, token } = await signedInAgent('owner@example.com');

      await agent
        .post('/api/v1/organizations')
        .set('Idempotency-Key', 'real-create-org-key-0005')
        .set('x-csrf-token', token)
        .send({ name: 'Owner Org' })
        .expect(201);

      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT
            set_config('acres.account_id', 'not-a-uuid', true),
            set_config('acres.organization_id', 'not-a-uuid', true),
            set_config('acres.invitation_token_hash', '', true)
        `;
        await expect(tx.organization.findMany()).resolves.toEqual([]);
        await expect(tx.membership.findMany()).resolves.toEqual([]);
        await expect(tx.auditEvent.findMany()).resolves.toEqual([]);
      });
    });

    it('keeps the last-owner trigger in place', async () => {
      const triggers = await prisma.$queryRaw<{ tgname: string }[]>`
        SELECT tgname
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'Membership' AND NOT t.tgisinternal
      `;

      expect(triggers.map((row) => row.tgname)).toContain(
        'Membership_last_owner_guard',
      );
    });
  });

  describe('GET /health/ready', () => {
    it('reports ok while the database is reachable', async () => {
      const response = await request(server).get('/health/ready').expect(200);

      expect(response.body).toMatchObject({
        ok: true,
        data: { status: 'ok', database: 'ok', storage: 'ok' },
      });
    });
  });
});
