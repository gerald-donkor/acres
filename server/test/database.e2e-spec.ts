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
    const response = await agent.get('/auth/csrf').expect(200);
    const body = response.body as {
      data: { csrfToken: string; headerName: string };
    };
    return { agent, token: body.data.csrfToken };
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
        .post('/auth/register')
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
          .post('/auth/register')
          .set('x-csrf-token', first.token)
          .send(body),
        second.agent
          .post('/auth/register')
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
        .post('/auth/register')
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

      const listResponse = await request(server).get('/regions').expect(200);
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
        .get(`/regions/${region.slug}`)
        .expect(200);
      expect(oneResponse.body).toMatchObject({
        ok: true,
        data: { slug: 'acadia', name: 'Acadia' },
      });

      const missingResponse = await request(server)
        .get('/regions/nowhere')
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

  describe('GET /health/ready', () => {
    it('reports ok while the database is reachable', async () => {
      const response = await request(server).get('/health/ready').expect(200);

      expect(response.body).toMatchObject({
        ok: true,
        data: { status: 'ok', database: 'ok' },
      });
    });
  });
});
