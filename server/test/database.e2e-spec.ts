import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createRealDbTestApp, truncateAll } from './helpers/real-db-test-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { PrismaClient } from '../src/generated/prisma/client';

function redactedDatabaseTarget(): string {
  try {
    const parsed = new URL(process.env.DATABASE_URL ?? '');
    parsed.password = '***';
    return parsed.toString();
  } catch {
    return 'the configured acres_test target';
  }
}

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
    } catch {
      throw new Error(
        `acres_test database is not reachable at ${redactedDatabaseTarget()}. ` +
          'Run "npm run db:up" (or the native bootstrap in prompts/18-database-infrastructure.md) ' +
          'and apply migrations before running this suite.',
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

  async function issueInvitation(
    actor: Awaited<ReturnType<typeof signedInAgent>>,
    organizationId: string,
    email: string,
    role: 'admin' | 'analyst' | 'viewer',
    key: string,
  ): Promise<{ id: string; token: string }> {
    const response = await actor.agent
      .post(`/api/v1/organizations/${organizationId}/invitations`)
      .set('x-acres-organization-id', organizationId)
      .set('Idempotency-Key', key)
      .set('x-csrf-token', actor.token)
      .send({ email, role })
      .expect(201);
    return (response.body as { data: { id: string; token: string } }).data;
  }

  async function acceptInvitation(
    actor: Awaited<ReturnType<typeof signedInAgent>>,
    token: string,
    key: string,
  ): Promise<{ organizationId: string; membershipId: string }> {
    const response = await actor.agent
      .post('/api/v1/invitations/accept')
      .set('Idempotency-Key', key)
      .set('x-csrf-token', actor.token)
      .send({ token })
      .expect(200);
    return (
      response.body as {
        data: { organizationId: string; membershipId: string };
      }
    ).data;
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
      const first = await csrfAgent();
      const second = await csrfAgent();
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

  describe('idempotency — concurrent organization creation', () => {
    it('converges simultaneous same-key commands on one completed response', async () => {
      const email = 'idempotency-race@example.com';
      const { agent, token } = await signedInAgent(email);
      const idempotencyKey = 'real-concurrent-org-key-0001';
      const body = { name: 'Concurrent Organization' };

      const [first, second] = await Promise.all([
        agent
          .post('/api/v1/organizations')
          .set('Idempotency-Key', idempotencyKey)
          .set('x-csrf-token', token)
          .send(body),
        agent
          .post('/api/v1/organizations')
          .set('Idempotency-Key', idempotencyKey)
          .set('x-csrf-token', token)
          .send(body),
      ]);

      const firstBody = first.body as {
        ok: boolean;
        data: {
          id: string;
          name: string;
          createdAt: string;
          updatedAt: string;
          membership: { id: string; role: string };
        };
      };
      const secondBody = second.body as typeof firstBody;

      expect([first.status, second.status]).toEqual([201, 201]);
      expect(firstBody).toMatchObject({
        ok: true,
        data: {
          id: expect.any(String) as string,
          name: body.name,
          membership: { id: expect.any(String) as string, role: 'owner' },
        },
      });
      expect(secondBody).toMatchObject({ ok: true, data: firstBody.data });

      const account = await prisma.account.findUniqueOrThrow({
        where: { email },
      });
      const organizationId = firstBody.data.id;
      const evidence = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
            SELECT
              set_config('acres.account_id', ${account.id}, true),
              set_config('acres.organization_id', ${organizationId}, true),
              set_config('acres.invitation_token_hash', '', true)
          `;
        return {
          organizationCount: await tx.organization.count({
            where: { name: body.name },
          }),
          membershipCount: await tx.membership.count({
            where: { accountId: account.id, role: 'owner' },
          }),
          records: await tx.idempotencyRecord.findMany({
            where: {
              accountId: account.id,
              organizationId: null,
              operation: 'organizations.create',
              expiresAt: { gt: new Date() },
            },
          }),
        };
      });

      expect(evidence.organizationCount).toBe(1);
      expect(evidence.membershipCount).toBe(1);
      expect(evidence.records).toHaveLength(1);
      expect(evidence.records[0]).toMatchObject({
        state: 'succeeded',
        responseStatus: 201,
        responseBody: firstBody.data,
      });

      const replay = await agent
        .post('/api/v1/organizations')
        .set('Idempotency-Key', idempotencyKey)
        .set('x-csrf-token', token)
        .send({ name: body.name })
        .expect(201);
      expect(replay.body as typeof firstBody).toMatchObject({
        ok: true,
        data: firstBody.data,
      });

      const changed = await agent
        .post('/api/v1/organizations')
        .set('Idempotency-Key', idempotencyKey)
        .set('x-csrf-token', token)
        .send({ name: 'Changed Organization' })
        .expect(409);
      expect(changed.body).toMatchObject({
        ok: false,
        error: { code: 'IDEMPOTENCY_CONFLICT' },
      });

      const changedCount = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
            SELECT
              set_config('acres.account_id', ${account.id}, true),
              set_config('acres.organization_id', ${organizationId}, true),
              set_config('acres.invitation_token_hash', '', true)
          `;
        return tx.organization.count({
          where: { name: 'Changed Organization' },
        });
      });
      expect(changedCount).toBe(0);
    }, 15_000);
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

    it('proves the membership lifecycle through revocation and reinvitation', async () => {
      const owner = await signedInAgent('lifecycle-owner@example.com');
      const admin = await signedInAgent('lifecycle-admin@example.com');
      const viewer = await signedInAgent('lifecycle-viewer@example.com');
      const organization = await createOrganization(
        owner,
        'membership-lifecycle-create-0001',
        'Membership Lifecycle Org',
      );

      const adminInvite = await issueInvitation(
        owner,
        organization.id,
        'lifecycle-admin@example.com',
        'admin',
        'membership-lifecycle-invite-admin-0001',
      );
      const acceptedAdmin = await acceptInvitation(
        admin,
        adminInvite.token,
        'membership-lifecycle-accept-admin-0001',
      );

      await admin.agent
        .post(`/api/v1/organizations/${organization.id}/invitations`)
        .set('x-acres-organization-id', organization.id)
        .set('Idempotency-Key', 'membership-lifecycle-deny-admin-0001')
        .set('x-csrf-token', admin.token)
        .send({ email: 'denied-admin@example.com', role: 'admin' })
        .expect(403)
        .expect((response) => {
          expect(response.body).toMatchObject({
            ok: false,
            error: { code: 'FORBIDDEN' },
          });
        });
      await admin.agent
        .post(`/api/v1/organizations/${organization.id}/invitations`)
        .set('x-acres-organization-id', organization.id)
        .set('Idempotency-Key', 'membership-lifecycle-deny-owner-0001')
        .set('x-csrf-token', admin.token)
        .send({ email: 'denied-owner@example.com', role: 'owner' })
        .expect(400)
        .expect((response) => {
          expect(response.body).toMatchObject({
            ok: false,
            error: { code: 'VALIDATION_FAILED' },
          });
        });

      const viewerInvite = await issueInvitation(
        admin,
        organization.id,
        'lifecycle-viewer@example.com',
        'viewer',
        'membership-lifecycle-invite-viewer-0001',
      );
      const acceptedViewer = await acceptInvitation(
        viewer,
        viewerInvite.token,
        'membership-lifecycle-accept-viewer-0001',
      );

      await owner.agent
        .patch(
          `/api/v1/organizations/${organization.id}/members/${acceptedViewer.membershipId}`,
        )
        .set('x-acres-organization-id', organization.id)
        .set('x-csrf-token', owner.token)
        .send({ role: 'analyst' })
        .expect(200)
        .expect((response) => {
          expect(response.body).toMatchObject({
            ok: true,
            data: { id: acceptedViewer.membershipId, role: 'analyst' },
          });
        });
      await admin.agent
        .patch(
          `/api/v1/organizations/${organization.id}/members/${acceptedViewer.membershipId}`,
        )
        .set('x-acres-organization-id', organization.id)
        .set('x-csrf-token', admin.token)
        .send({ role: 'viewer' })
        .expect(200)
        .expect((response) => {
          expect(response.body).toMatchObject({
            ok: true,
            data: { id: acceptedViewer.membershipId, role: 'viewer' },
          });
        });

      await admin.agent
        .patch(
          `/api/v1/organizations/${organization.id}/members/${acceptedAdmin.membershipId}`,
        )
        .set('x-acres-organization-id', organization.id)
        .set('x-csrf-token', admin.token)
        .send({ role: 'viewer' })
        .expect(409)
        .expect((response) => {
          expect(response.body).toMatchObject({
            ok: false,
            error: { code: 'CONFLICT' },
          });
        });
      await owner.agent
        .patch(
          `/api/v1/organizations/${organization.id}/members/${organization.membership.id}`,
        )
        .set('x-acres-organization-id', organization.id)
        .set('x-csrf-token', owner.token)
        .send({ role: 'admin' })
        .expect(409)
        .expect((response) => {
          expect(response.body).toMatchObject({
            ok: false,
            error: { code: 'CONFLICT' },
          });
        });

      await admin.agent
        .delete(
          `/api/v1/organizations/${organization.id}/members/${acceptedViewer.membershipId}`,
        )
        .set('x-acres-organization-id', organization.id)
        .set('x-csrf-token', admin.token)
        .expect(200)
        .expect((response) => {
          expect(response.body).toMatchObject({
            ok: true,
            data: { revoked: true },
          });
        });

      await viewer.agent
        .get('/api/v1/auth/session')
        .expect(200)
        .expect((response) => {
          expect(response.body).toMatchObject({
            ok: true,
            data: { authenticated: true },
          });
        });
      await viewer.agent
        .get('/api/v1/organizations')
        .expect(200)
        .expect((response) => {
          expect(response.body).toMatchObject({ ok: true, data: [] });
        });
      await viewer.agent
        .get(`/api/v1/organizations/${organization.id}`)
        .set('x-acres-organization-id', organization.id)
        .expect(404)
        .expect((response) => {
          expect(response.body).toMatchObject({
            ok: false,
            error: { code: 'NOT_FOUND' },
          });
        });

      const revokedMembers = await owner.agent
        .get(`/api/v1/organizations/${organization.id}/members`)
        .set('x-acres-organization-id', organization.id)
        .expect(200);
      const revokedViewer = (
        revokedMembers.body as {
          data: Array<{ id: string; role: string; revokedAt: string | null }>;
        }
      ).data.find((member) => member.id === acceptedViewer.membershipId);
      expect(revokedViewer?.role).toBe('viewer');
      expect(typeof revokedViewer?.revokedAt).toBe('string');

      const reactivationInvite = await issueInvitation(
        owner,
        organization.id,
        'lifecycle-viewer@example.com',
        'analyst',
        'membership-lifecycle-reinvite-viewer-0001',
      );
      const reactivated = await acceptInvitation(
        viewer,
        reactivationInvite.token,
        'membership-lifecycle-reactivate-viewer-0001',
      );
      expect(reactivated).toEqual({
        organizationId: organization.id,
        membershipId: acceptedViewer.membershipId,
      });
      await viewer.agent
        .get(`/api/v1/organizations/${organization.id}`)
        .set('x-acres-organization-id', organization.id)
        .expect(200)
        .expect((response) => {
          expect(response.body).toMatchObject({
            ok: true,
            data: {
              id: organization.id,
              membership: {
                id: acceptedViewer.membershipId,
                role: 'analyst',
              },
            },
          });
        });

      const ownerAccount = await prisma.account.findUniqueOrThrow({
        where: { email: 'lifecycle-owner@example.com' },
      });
      const adminAccount = await prisma.account.findUniqueOrThrow({
        where: { email: 'lifecycle-admin@example.com' },
      });
      const viewerAccount = await prisma.account.findUniqueOrThrow({
        where: { email: 'lifecycle-viewer@example.com' },
      });
      const evidence = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT
            set_config('acres.account_id', ${ownerAccount.id}, true),
            set_config('acres.organization_id', ${organization.id}, true),
            set_config('acres.invitation_token_hash', '', true)
        `;
        return {
          viewerMemberships: await tx.membership.findMany({
            where: {
              organizationId: organization.id,
              account: { email: 'lifecycle-viewer@example.com' },
            },
          }),
          audits: await tx.auditEvent.findMany({
            where: { organizationId: organization.id },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          }),
          invitations: await tx.invitation.findMany({
            where: { organizationId: organization.id },
          }),
        };
      });
      const adminIdempotency = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT
            set_config('acres.account_id', ${adminAccount.id}, true),
            set_config('acres.organization_id', ${organization.id}, true),
            set_config('acres.invitation_token_hash', '', true)
        `;
        return tx.idempotencyRecord.findMany({
          where: {
            accountId: adminAccount.id,
            organizationId: organization.id,
            operation: 'organizations.invite',
          },
        });
      });

      expect(evidence.viewerMemberships).toHaveLength(1);
      expect(evidence.viewerMemberships[0]).toMatchObject({
        id: acceptedViewer.membershipId,
        role: 'analyst',
        revokedAt: null,
      });
      const auditsByAction = (action: string) =>
        evidence.audits.filter((audit) => audit.action === action);
      const auditEvidence = (action: string) =>
        auditsByAction(action).map((audit) => ({
          actorAccountId: audit.actorAccountId,
          targetType: audit.targetType,
          targetId: audit.targetId,
          details: audit.details,
        }));
      expect(auditEvidence('invitation_issued')).toEqual([
        {
          actorAccountId: ownerAccount.id,
          targetType: 'invitation',
          targetId: adminInvite.id,
          details: { role: 'admin' },
        },
        {
          actorAccountId: adminAccount.id,
          targetType: 'invitation',
          targetId: viewerInvite.id,
          details: { role: 'viewer' },
        },
        {
          actorAccountId: ownerAccount.id,
          targetType: 'invitation',
          targetId: reactivationInvite.id,
          details: { role: 'analyst' },
        },
      ]);
      expect(auditEvidence('invitation_accepted')).toEqual([
        {
          actorAccountId: adminAccount.id,
          targetType: 'invitation',
          targetId: adminInvite.id,
          details: { membershipId: acceptedAdmin.membershipId },
        },
        {
          actorAccountId: viewerAccount.id,
          targetType: 'invitation',
          targetId: viewerInvite.id,
          details: { membershipId: acceptedViewer.membershipId },
        },
        {
          actorAccountId: viewerAccount.id,
          targetType: 'invitation',
          targetId: reactivationInvite.id,
          details: { membershipId: acceptedViewer.membershipId },
        },
      ]);
      expect(auditEvidence('membership_role_changed')).toEqual([
        {
          actorAccountId: ownerAccount.id,
          targetType: 'membership',
          targetId: acceptedViewer.membershipId,
          details: { oldRole: 'viewer', newRole: 'analyst' },
        },
        {
          actorAccountId: adminAccount.id,
          targetType: 'membership',
          targetId: acceptedViewer.membershipId,
          details: { oldRole: 'analyst', newRole: 'viewer' },
        },
      ]);
      expect(auditEvidence('membership_revoked')).toEqual([
        {
          actorAccountId: adminAccount.id,
          targetType: 'membership',
          targetId: acceptedViewer.membershipId,
          details: null,
        },
      ]);
      expect(adminIdempotency).toHaveLength(1);
      expect(adminIdempotency[0]).toMatchObject({ state: 'succeeded' });
      const serializedAudit = JSON.stringify(evidence.audits);
      for (const secret of [
        adminInvite.token,
        viewerInvite.token,
        reactivationInvite.token,
        owner.token,
        admin.token,
        viewer.token,
      ]) {
        expect(serializedAudit).not.toContain(secret);
      }
      expect(JSON.stringify(evidence.invitations)).not.toContain(
        reactivationInvite.token,
      );
    }, 20_000);

    it('enforces the invitation lifecycle for duplicates and revocation', async () => {
      const owner = await signedInAgent('state-owner@example.com');
      const recipient = await signedInAgent('state-recipient@example.com');
      const organization = await createOrganization(
        owner,
        'invitation-lifecycle-create-0001',
        'Invitation Lifecycle Org',
      );
      const first = await issueInvitation(
        owner,
        organization.id,
        'state-recipient@example.com',
        'viewer',
        'invitation-lifecycle-issue-0001',
      );

      await owner.agent
        .post(`/api/v1/organizations/${organization.id}/invitations`)
        .set('x-acres-organization-id', organization.id)
        .set('Idempotency-Key', 'invitation-lifecycle-duplicate-0001')
        .set('x-csrf-token', owner.token)
        .send({ email: '  STATE-RECIPIENT@example.com ', role: 'viewer' })
        .expect(409)
        .expect((response) => {
          expect(response.body).toMatchObject({
            ok: false,
            error: { code: 'CONFLICT' },
          });
        });

      for (let attempt = 0; attempt < 2; attempt += 1) {
        await owner.agent
          .delete(
            `/api/v1/organizations/${organization.id}/invitations/${first.id}`,
          )
          .set('x-acres-organization-id', organization.id)
          .set('x-csrf-token', owner.token)
          .expect(200)
          .expect((response) => {
            expect(response.body).toMatchObject({
              ok: true,
              data: { revoked: true },
            });
          });
      }

      await recipient.agent
        .post('/api/v1/invitations/accept')
        .set('Idempotency-Key', 'invitation-lifecycle-revoked-accept-0001')
        .set('x-csrf-token', recipient.token)
        .send({ token: first.token })
        .expect(404)
        .expect((response) => {
          expect(response.body).toMatchObject({
            ok: false,
            error: { code: 'NOT_FOUND' },
          });
        });

      const replacement = await issueInvitation(
        owner,
        organization.id,
        'state-recipient@example.com',
        'analyst',
        'invitation-lifecycle-replacement-0001',
      );
      expect(replacement.id).not.toBe(first.id);
      expect(replacement.token).not.toBe(first.token);

      const ownerAccount = await prisma.account.findUniqueOrThrow({
        where: { email: 'state-owner@example.com' },
      });
      const recipientAccount = await prisma.account.findUniqueOrThrow({
        where: { email: 'state-recipient@example.com' },
      });
      const evidence = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT
            set_config('acres.account_id', ${ownerAccount.id}, true),
            set_config('acres.organization_id', ${organization.id}, true),
            set_config('acres.invitation_token_hash', '', true)
        `;
        return {
          invitations: await tx.invitation.findMany({
            where: { organizationId: organization.id },
            orderBy: { createdAt: 'asc' },
          }),
          audits: await tx.auditEvent.findMany({
            where: { organizationId: organization.id },
          }),
          idempotency: await tx.idempotencyRecord.findMany({
            where: {
              organizationId: organization.id,
              operation: 'organizations.invite',
            },
          }),
          recipientMemberships: await tx.membership.findMany({
            where: {
              organizationId: organization.id,
              accountId: recipientAccount.id,
            },
          }),
        };
      });
      const recipientIdempotency = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT
            set_config('acres.account_id', ${recipientAccount.id}, true),
            set_config('acres.organization_id', '', true),
            set_config('acres.invitation_token_hash', '', true)
        `;
        return tx.idempotencyRecord.findMany({
          where: {
            accountId: recipientAccount.id,
            operation: 'invitations.accept',
          },
        });
      });
      expect(evidence.invitations).toHaveLength(2);
      expect(evidence.invitations[0]).toMatchObject({
        id: first.id,
        acceptedAt: null,
      });
      expect(evidence.invitations[0]?.revokedAt).toBeInstanceOf(Date);
      expect(evidence.invitations[1]).toMatchObject({
        id: replacement.id,
        role: 'analyst',
        revokedAt: null,
        acceptedAt: null,
      });
      expect(
        evidence.audits.filter((audit) => audit.action === 'invitation_issued'),
      ).toHaveLength(2);
      expect(
        evidence.audits.filter(
          (audit) => audit.action === 'invitation_revoked',
        ),
      ).toHaveLength(1);
      expect(
        evidence.audits.filter(
          (audit) => audit.action === 'invitation_accepted',
        ),
      ).toHaveLength(0);
      expect(evidence.idempotency).toHaveLength(2);
      expect(evidence.recipientMemberships).toHaveLength(0);
      expect(recipientIdempotency).toHaveLength(0);
      expect(JSON.stringify(evidence.invitations)).not.toContain(first.token);
      expect(JSON.stringify(evidence.invitations)).not.toContain(
        replacement.token,
      );
    }, 15_000);

    it('binds the invitation lifecycle to recipient, expiry, and state', async () => {
      const owner = await signedInAgent('binding-owner@example.com');
      const recipient = await signedInAgent('binding-recipient@example.com');
      const wrongRecipient = await signedInAgent('binding-wrong@example.com');
      const expiredRecipient = await signedInAgent(
        'binding-expired@example.com',
      );
      const organization = await createOrganization(
        owner,
        'invitation-binding-create-0001',
        'Invitation Binding Org',
      );
      const live = await issueInvitation(
        owner,
        organization.id,
        'binding-recipient@example.com',
        'viewer',
        'invitation-binding-live-0001',
      );

      await wrongRecipient.agent
        .post('/api/v1/invitations/accept')
        .set('Idempotency-Key', 'invitation-binding-wrong-0001')
        .set('x-csrf-token', wrongRecipient.token)
        .send({ token: live.token })
        .expect(404)
        .expect((response) => {
          expect(response.body).toMatchObject({
            ok: false,
            error: { code: 'NOT_FOUND' },
          });
        });
      const accepted = await acceptInvitation(
        recipient,
        live.token,
        'invitation-binding-correct-0001',
      );
      const ownerAccount = await prisma.account.findUniqueOrThrow({
        where: { email: 'binding-owner@example.com' },
      });
      const acceptedBaseline = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT
            set_config('acres.account_id', ${ownerAccount.id}, true),
            set_config('acres.organization_id', ${organization.id}, true),
            set_config('acres.invitation_token_hash', '', true)
        `;
        return {
          invitation: await tx.invitation.findUniqueOrThrow({
            where: { id: live.id },
          }),
          membership: await tx.membership.findUniqueOrThrow({
            where: { id: accepted.membershipId },
          }),
          acceptedAuditCount: await tx.auditEvent.count({
            where: {
              organizationId: organization.id,
              action: 'invitation_accepted',
            },
          }),
        };
      });
      await owner.agent
        .delete(
          `/api/v1/organizations/${organization.id}/invitations/${live.id}`,
        )
        .set('x-acres-organization-id', organization.id)
        .set('x-csrf-token', owner.token)
        .expect(409)
        .expect((response) => {
          expect(response.body).toMatchObject({
            ok: false,
            error: { code: 'CONFLICT' },
          });
        });

      const expired = await issueInvitation(
        owner,
        organization.id,
        'binding-expired@example.com',
        'analyst',
        'invitation-binding-expired-issue-0001',
      );
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT
            set_config('acres.account_id', ${ownerAccount.id}, true),
            set_config('acres.organization_id', ${organization.id}, true),
            set_config('acres.invitation_token_hash', '', true)
        `;
        await tx.invitation.update({
          where: { id: expired.id },
          data: { expiresAt: new Date(Date.now() - 60_000) },
        });
      });
      for (const key of [
        'invitation-binding-expired-accept-0001',
        'invitation-binding-expired-accept-0002',
      ]) {
        await expiredRecipient.agent
          .post('/api/v1/invitations/accept')
          .set('Idempotency-Key', key)
          .set('x-csrf-token', expiredRecipient.token)
          .send({ token: expired.token })
          .expect(404)
          .expect((response) => {
            expect(response.body).toMatchObject({
              ok: false,
              error: { code: 'NOT_FOUND' },
            });
          });
      }

      const evidence = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT
            set_config('acres.account_id', ${ownerAccount.id}, true),
            set_config('acres.organization_id', ${organization.id}, true),
            set_config('acres.invitation_token_hash', '', true)
        `;
        return {
          invitations: await tx.invitation.findMany({
            where: { organizationId: organization.id },
          }),
          memberships: await tx.membership.findMany({
            where: { organizationId: organization.id },
          }),
          acceptedAudits: await tx.auditEvent.findMany({
            where: {
              organizationId: organization.id,
              action: 'invitation_accepted',
            },
          }),
        };
      });
      const acceptedRow = evidence.invitations.find(
        (invitation) => invitation.id === live.id,
      );
      expect(acceptedRow).toMatchObject({
        revokedAt: null,
      });
      expect(acceptedBaseline.invitation.acceptedAt).toBeInstanceOf(Date);
      expect(acceptedRow?.acceptedAt).toEqual(
        acceptedBaseline.invitation.acceptedAt,
      );
      expect(
        evidence.invitations.find((invitation) => invitation.id === expired.id),
      ).toMatchObject({ acceptedAt: null, revokedAt: null });
      expect(evidence.memberships).toHaveLength(2);
      const acceptedMembership = evidence.memberships.find(
        (membership) => membership.id === accepted.membershipId,
      );
      expect(acceptedBaseline.membership).toMatchObject({
        id: accepted.membershipId,
        role: 'viewer',
        revokedAt: null,
      });
      expect(acceptedMembership).toMatchObject({
        id: acceptedBaseline.membership.id,
        role: acceptedBaseline.membership.role,
        revokedAt: acceptedBaseline.membership.revokedAt,
      });
      expect(acceptedBaseline.acceptedAuditCount).toBe(1);
      expect(evidence.acceptedAudits).toHaveLength(
        acceptedBaseline.acceptedAuditCount,
      );
      expect(evidence.acceptedAudits[0]).toMatchObject({
        targetId: live.id,
        details: { membershipId: accepted.membershipId },
      });

      for (const email of [
        'binding-wrong@example.com',
        'binding-expired@example.com',
      ]) {
        const account = await prisma.account.findUniqueOrThrow({
          where: { email },
        });
        const idempotency = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            SELECT
              set_config('acres.account_id', ${account.id}, true),
              set_config('acres.organization_id', '', true),
              set_config('acres.invitation_token_hash', '', true)
          `;
          return tx.idempotencyRecord.findMany({
            where: {
              accountId: account.id,
              operation: 'invitations.accept',
            },
          });
        });
        expect(idempotency).toHaveLength(0);
      }
    }, 15_000);

    it('enforces single-use invitation acceptance under concurrency', async () => {
      const owner = await signedInAgent('single-use-owner@example.com');
      const recipient = await signedInAgent('single-use-recipient@example.com');
      const organization = await createOrganization(
        owner,
        'single-use-invitation-create-0001',
        'Single Use Invitation Org',
      );
      const invitation = await issueInvitation(
        owner,
        organization.id,
        'single-use-recipient@example.com',
        'viewer',
        'single-use-invitation-issue-0001',
      );

      const [first, second] = await Promise.all([
        recipient.agent
          .post('/api/v1/invitations/accept')
          .set('Idempotency-Key', 'single-use-invitation-accept-0001')
          .set('x-csrf-token', recipient.token)
          .send({ token: invitation.token }),
        recipient.agent
          .post('/api/v1/invitations/accept')
          .set('Idempotency-Key', 'single-use-invitation-accept-0002')
          .set('x-csrf-token', recipient.token)
          .send({ token: invitation.token }),
      ]);
      const responses = [first, second];
      expect(
        responses.filter((response) => response.status === 200),
      ).toHaveLength(1);
      expect(
        responses.filter((response) => response.status === 404),
      ).toHaveLength(1);
      expect(
        responses.find((response) => response.status === 200)?.body,
      ).toMatchObject({
        ok: true,
        data: {
          organizationId: organization.id,
          membershipId: expect.any(String) as string,
        },
      });
      expect(
        responses.find((response) => response.status === 404)?.body,
      ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

      await recipient.agent
        .post('/api/v1/invitations/accept')
        .set('Idempotency-Key', 'single-use-invitation-replay-0001')
        .set('x-csrf-token', recipient.token)
        .send({ token: invitation.token })
        .expect(404);

      const ownerAccount = await prisma.account.findUniqueOrThrow({
        where: { email: 'single-use-owner@example.com' },
      });
      const recipientAccount = await prisma.account.findUniqueOrThrow({
        where: { email: 'single-use-recipient@example.com' },
      });
      const organizationEvidence = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT
            set_config('acres.account_id', ${ownerAccount.id}, true),
            set_config('acres.organization_id', ${organization.id}, true),
            set_config('acres.invitation_token_hash', '', true)
        `;
        return {
          invitations: await tx.invitation.findMany({
            where: { organizationId: organization.id },
          }),
          memberships: await tx.membership.findMany({
            where: {
              organizationId: organization.id,
              accountId: recipientAccount.id,
            },
          }),
          acceptedAudits: await tx.auditEvent.findMany({
            where: {
              organizationId: organization.id,
              action: 'invitation_accepted',
            },
          }),
        };
      });
      const acceptanceRecords = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT
            set_config('acres.account_id', ${recipientAccount.id}, true),
            set_config('acres.organization_id', '', true),
            set_config('acres.invitation_token_hash', '', true)
        `;
        return tx.idempotencyRecord.findMany({
          where: {
            accountId: recipientAccount.id,
            operation: 'invitations.accept',
          },
        });
      });
      expect(organizationEvidence.invitations).toHaveLength(1);
      expect(organizationEvidence.invitations[0]).toMatchObject({
        id: invitation.id,
        acceptedByAccountId: recipientAccount.id,
        revokedAt: null,
      });
      expect(organizationEvidence.invitations[0]?.acceptedAt).toBeInstanceOf(
        Date,
      );
      expect(organizationEvidence.memberships).toHaveLength(1);
      expect(organizationEvidence.memberships[0]).toMatchObject({
        role: 'viewer',
        revokedAt: null,
      });
      expect(organizationEvidence.acceptedAudits).toHaveLength(1);
      expect(acceptanceRecords).toHaveLength(1);
      expect(acceptanceRecords[0]).toMatchObject({
        state: 'succeeded',
        responseStatus: 200,
      });
    }, 15_000);

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

    it('serializes competing ownership transfers to one active owner', async () => {
      const owner = await signedInAgent('transfer-owner@example.com');
      const firstTarget = await signedInAgent('transfer-first@example.com');
      const secondTarget = await signedInAgent('transfer-second@example.com');

      const created = await owner.agent
        .post('/api/v1/organizations')
        .set('Idempotency-Key', 'real-transfer-create-key-0001')
        .set('x-csrf-token', owner.token)
        .send({ name: 'Concurrent Transfer Org' })
        .expect(201);
      const organization = (
        created.body as {
          data: { id: string; membership: { id: string } };
        }
      ).data;

      async function inviteAndAccept(
        email: string,
        keySuffix: string,
        target: Awaited<ReturnType<typeof signedInAgent>>,
      ): Promise<string> {
        const invitation = await owner.agent
          .post(`/api/v1/organizations/${organization.id}/invitations`)
          .set('x-acres-organization-id', organization.id)
          .set('Idempotency-Key', `real-transfer-invite-key-${keySuffix}`)
          .set('x-csrf-token', owner.token)
          .send({ email, role: 'viewer' })
          .expect(201);
        const invitationToken = (invitation.body as { data: { token: string } })
          .data.token;

        const accepted = await target.agent
          .post('/api/v1/invitations/accept')
          .set('Idempotency-Key', `real-transfer-accept-key-${keySuffix}`)
          .set('x-csrf-token', target.token)
          .send({ token: invitationToken })
          .expect(200);
        return (accepted.body as { data: { membershipId: string } }).data
          .membershipId;
      }

      const firstMembershipId = await inviteAndAccept(
        'transfer-first@example.com',
        '0001',
        firstTarget,
      );
      const secondMembershipId = await inviteAndAccept(
        'transfer-second@example.com',
        '0002',
        secondTarget,
      );

      const [first, second] = await Promise.all([
        owner.agent
          .post(`/api/v1/organizations/${organization.id}/ownership-transfers`)
          .set('x-acres-organization-id', organization.id)
          .set('Idempotency-Key', 'real-transfer-race-key-0001')
          .set('x-csrf-token', owner.token)
          .send({ membershipId: firstMembershipId }),
        owner.agent
          .post(`/api/v1/organizations/${organization.id}/ownership-transfers`)
          .set('x-acres-organization-id', organization.id)
          .set('Idempotency-Key', 'real-transfer-race-key-0002')
          .set('x-csrf-token', owner.token)
          .send({ membershipId: secondMembershipId }),
      ]);

      const responses = [first, second];
      const success = responses.filter((response) => response.status === 200);
      const denied = responses.filter((response) => response.status === 403);
      expect(success).toHaveLength(1);
      expect(denied).toHaveLength(1);
      expect(success[0].body).toMatchObject({
        ok: true,
        data: { transferred: true },
      });
      expect(denied[0].body).toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN' },
      });

      const ownerAccount = await prisma.account.findUniqueOrThrow({
        where: { email: 'transfer-owner@example.com' },
      });
      const evidence = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
            SELECT
              set_config('acres.account_id', ${ownerAccount.id}, true),
              set_config('acres.organization_id', ${organization.id}, true),
              set_config('acres.invitation_token_hash', '', true)
          `;
        return {
          memberships: await tx.membership.findMany({
            where: { organizationId: organization.id },
            orderBy: { accountId: 'asc' },
          }),
          transfers: await tx.auditEvent.findMany({
            where: {
              organizationId: organization.id,
              action: 'ownership_transferred',
            },
          }),
          records: await tx.idempotencyRecord.findMany({
            where: {
              organizationId: organization.id,
              operation: 'organizations.transferOwnership',
            },
          }),
        };
      });

      const activeOwners = evidence.memberships.filter(
        (membership) =>
          membership.role === 'owner' && membership.revokedAt === null,
      );
      expect(activeOwners).toHaveLength(1);
      expect(activeOwners[0].id).toBe(
        first.status === 200 ? firstMembershipId : secondMembershipId,
      );
      const losingMembershipId =
        first.status === 200 ? secondMembershipId : firstMembershipId;
      expect(
        evidence.memberships.find(
          (membership) => membership.id === organization.membership.id,
        ),
      ).toMatchObject({ role: 'admin', revokedAt: null });
      expect(
        evidence.memberships.find(
          (membership) => membership.id === losingMembershipId,
        ),
      ).toMatchObject({ role: 'viewer', revokedAt: null });
      expect(evidence.transfers).toHaveLength(1);
      expect(evidence.transfers[0]).toMatchObject({
        actorAccountId: ownerAccount.id,
        targetId: activeOwners[0].id,
        details: { previousOwnerMembershipId: organization.membership.id },
      });
      expect(evidence.records).toHaveLength(1);
      expect(evidence.records[0]).toMatchObject({
        state: 'succeeded',
        responseStatus: 200,
      });

      const winnerKey =
        first.status === 200
          ? 'real-transfer-race-key-0001'
          : 'real-transfer-race-key-0002';
      const winnerMembershipId =
        first.status === 200 ? firstMembershipId : secondMembershipId;
      await owner.agent
        .post(`/api/v1/organizations/${organization.id}/ownership-transfers`)
        .set('x-acres-organization-id', organization.id)
        .set('Idempotency-Key', winnerKey)
        .set('x-csrf-token', owner.token)
        .send({ membershipId: winnerMembershipId })
        .expect(403)
        .expect((response) => {
          expect(response.body).toMatchObject({
            ok: false,
            error: { code: 'FORBIDDEN' },
          });
        });

      await owner.agent
        .post(`/api/v1/organizations/${organization.id}/ownership-transfers`)
        .set('x-acres-organization-id', organization.id)
        .set('Idempotency-Key', 'real-transfer-fresh-denied-0001')
        .set('x-csrf-token', owner.token)
        .send({ membershipId: winnerMembershipId })
        .expect(403);

      const postDenialEvidence = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
            SELECT
              set_config('acres.account_id', ${ownerAccount.id}, true),
              set_config('acres.organization_id', ${organization.id}, true),
              set_config('acres.invitation_token_hash', '', true)
          `;
        return {
          memberships: await tx.membership.findMany({
            where: { organizationId: organization.id },
            orderBy: { accountId: 'asc' },
          }),
          transfers: await tx.auditEvent.findMany({
            where: {
              organizationId: organization.id,
              action: 'ownership_transferred',
            },
          }),
          records: await tx.idempotencyRecord.findMany({
            where: {
              organizationId: organization.id,
              operation: 'organizations.transferOwnership',
            },
          }),
        };
      });
      expect(postDenialEvidence.memberships).toEqual(evidence.memberships);
      expect(postDenialEvidence.transfers).toEqual(evidence.transfers);
      expect(postDenialEvidence.records).toEqual(evidence.records);
    }, 15_000);

    it('actively rejects removal of the sole owner under forced RLS', async () => {
      const { agent, token } = await signedInAgent('last-owner@example.com');
      const created = await agent
        .post('/api/v1/organizations')
        .set('Idempotency-Key', 'real-last-owner-create-key-0001')
        .set('x-csrf-token', token)
        .send({ name: 'Last Owner Guard Org' })
        .expect(201);
      const organization = (
        created.body as {
          data: { id: string; membership: { id: string } };
        }
      ).data;
      const account = await prisma.account.findUniqueOrThrow({
        where: { email: 'last-owner@example.com' },
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            SELECT
              set_config('acres.account_id', ${account.id}, true),
              set_config('acres.organization_id', ${organization.id}, true),
              set_config('acres.invitation_token_hash', '', true)
          `;
          await tx.membership.update({
            where: { id: organization.membership.id },
            data: { role: 'admin' },
          });
        }),
      ).rejects.toThrow(/cannot remove last active owner/i);

      const evidence = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT
            set_config('acres.account_id', ${account.id}, true),
            set_config('acres.organization_id', ${organization.id}, true),
            set_config('acres.invitation_token_hash', '', true)
        `;
        return {
          membership: await tx.membership.findUniqueOrThrow({
            where: { id: organization.membership.id },
          }),
          audits: await tx.auditEvent.findMany({
            where: { organizationId: organization.id },
          }),
        };
      });
      expect(evidence.membership).toMatchObject({
        role: 'owner',
        revokedAt: null,
      });
      expect(evidence.audits).toHaveLength(1);
      expect(evidence.audits[0]).toMatchObject({
        action: 'organization_created',
        targetId: organization.id,
      });
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
