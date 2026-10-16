import { createHash } from 'node:crypto';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AcresConfigModule } from '../src/config/config.module';
import { AcresConfigService } from '../src/config/acres-config.service';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  PostgresThrottlerStorage,
  expiredThrottleBuckets,
  THROTTLE_CLEANUP_BATCH,
} from '../src/security/postgres-throttler.storage';
import { SecurityModule } from '../src/security/security.module';

@Controller('protected')
class ProtectedController {
  static executions = 0;
  @Get()
  read() {
    ProtectedController.executions++;
    return { ok: true };
  }
}

const key = (name: string) => createHash('sha256').update(name).digest('hex');

describe('Shared managed throttling — real PostgreSQL', () => {
  let first: PrismaService;
  let second: PrismaService;
  let a: PostgresThrottlerStorage;
  let b: PostgresThrottlerStorage;
  let app: INestApplication;

  async function httpApp(
    provider: string,
    databaseUrl = process.env.DATABASE_URL,
  ) {
    const module = await Test.createTestingModule({
      imports: [AcresConfigModule, SecurityModule],
      controllers: [ProtectedController, HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: { check: () => ({ status: 'ok' }) },
        },
      ],
    })
      .overrideProvider(AcresConfigService)
      .useValue({
        databaseUrl,
        queueProvider: provider,
        rateLimitTtlMs: 60000,
        rateLimitDefaultLimit: 2,
        rateLimitStrictLimit: 1,
        csrfSecret: 'test-independent-csrf-key-at-least-32',
        sessionSecret: 'test-session-key-at-least-32-characters',
        csrfCookieName: 'acres_csrf',
        sessionCookieName: 'acres_session',
        isProduction: false,
      })
      .compile();
    const instance = module.createNestApplication();
    instance.useGlobalFilters(new ApiExceptionFilter());
    await instance.init();
    return instance;
  }

  beforeAll(() => {
    const config = {
      databaseUrl: process.env.DATABASE_URL,
    } as AcresConfigService;
    first = new PrismaService(config);
    second = new PrismaService(config);
    a = new PostgresThrottlerStorage(first);
    b = new PostgresThrottlerStorage(second);
  });
  beforeEach(async () => {
    await first.throttleBucket.deleteMany();
    ProtectedController.executions = 0;
  });
  afterEach(async () => {
    await app?.close();
  });
  afterAll(async () => {
    await first.throttleBucket.deleteMany();
    await Promise.all([first.onModuleDestroy(), second.onModuleDestroy()]);
  });

  it('serializes initial races across connections, preserves blocks across adapters and separates keys/tiers', async () => {
    const shared = key('shared');
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? a : b).increment(shared, 60000, 5, 60000, 'default'),
      ),
    );
    expect(results.filter((r) => !r.isBlocked)).toHaveLength(5);
    expect(
      (await b.increment(shared, 60000, 5, 60000, 'default')).isBlocked,
    ).toBe(true);
    expect(
      (await b.increment(shared, 60000, 5, 60000, 'strict')).totalHits,
    ).toBe(1);
    expect(
      (await b.increment(key('other'), 60000, 5, 60000, 'default')).isBlocked,
    ).toBe(false);
    const row = await first.throttleBucket.findUniqueOrThrow({
      where: { key_tier: { key: shared, tier: 'default' } },
    });
    expect(row.hits).toHaveLength(6);
  });

  it('prunes rolling hits without resetting live hits at the header-window boundary', async () => {
    const shared = key('rolling');
    await a.increment(shared, 60000, 2, 60000, 'default');
    await first.$executeRaw`
      UPDATE "ThrottleBucket" SET "hits" = ARRAY[clock_timestamp() - interval '1 second', clock_timestamp() + interval '59 seconds'],
        "windowExpiresAt" = clock_timestamp() - interval '1 second'
      WHERE "key" = ${shared}
    `;
    const boundary = await b.increment(shared, 60000, 2, 60000, 'default');
    expect(boundary).toMatchObject({
      totalHits: 2,
      isBlocked: false,
      timeToExpire: 60,
    });
    expect(
      (await a.increment(shared, 60000, 2, 60000, 'default')).isBlocked,
    ).toBe(true);
  });

  it('does not extend a block and resets the bucket when the database-clock block expires', async () => {
    const shared = key('block');
    await a.increment(shared, 60000, 1, 60000, 'default');
    await a.increment(shared, 60000, 1, 60000, 'default');
    const before = await first.throttleBucket.findFirstOrThrow();
    await b.increment(shared, 60000, 1, 60000, 'default');
    expect(
      (await first.throttleBucket.findFirstOrThrow()).blockedUntil,
    ).toEqual(before.blockedUntil);
    await first.$executeRaw`UPDATE "ThrottleBucket" SET "blockedUntil" = clock_timestamp() - interval '1 millisecond'`;
    expect(await b.increment(shared, 60000, 1, 60000, 'default')).toMatchObject(
      { totalHits: 1, isBlocked: false, timeToBlockExpire: 0 },
    );
  });

  it('drains expired backlog in bounded batches and skips locked/live rows', async () => {
    await first.$executeRaw`
      INSERT INTO "ThrottleBucket" ("key", "tier", "hits", "windowExpiresAt", "expiresAt")
      SELECT md5(i::text) || md5(i::text), 'default', ARRAY[]::timestamptz[],
        now() - interval '1 day', now() - interval '1 day'
      FROM generate_series(1, 501) i
    `;
    await a.increment(key('live'), 60000, 2, 60000, 'default');
    expect(await a.cleanupOnce()).toBe(THROTTLE_CLEANUP_BATCH);
    expect(await b.cleanupOnce()).toBe(THROTTLE_CLEANUP_BATCH);
    expect(await a.cleanupOnce()).toBe(1);
    expect(await first.throttleBucket.count()).toBe(1);
    await first.$executeRaw`UPDATE "ThrottleBucket" SET "expiresAt" = now() - interval '1 second'`;
    await first.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "key" FROM "ThrottleBucket" FOR UPDATE`;
      expect(await b.cleanupOnce()).toBe(0);
    });
    // Concurrent increment/cleanup cannot delete newly active state.
    await Promise.all([
      a.increment(key('live'), 60000, 2, 60000, 'default'),
      b.cleanupOnce(),
    ]);
    expect(await first.throttleBucket.count()).toBe(1);
  });

  it('bounds lock waits and fails closed instead of bypassing a contended bucket', async () => {
    const shared = key('locked');
    await a.increment(shared, 60000, 2, 60000, 'default');
    await first.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "key" FROM "ThrottleBucket" WHERE "key" = ${shared} FOR UPDATE`;
        await expect(
          b.increment(shared, 60000, 2, 60000, 'default'),
        ).rejects.toMatchObject({ status: 503 });
      },
      { timeout: 10000 },
    );
    expect(
      (await b.increment(shared, 60000, 2, 60000, 'default')).totalHits,
    ).toBe(2);
  });

  it('captures the actual expiry selection plan on a representative expired/live fixture', async () => {
    await first.$executeRaw`
      INSERT INTO "ThrottleBucket" ("key", "tier", "hits", "windowExpiresAt", "expiresAt")
      SELECT md5(i::text) || md5(i::text), 'default', ARRAY[]::timestamptz[], now(),
        CASE WHEN i <= 300 THEN now() - interval '1 day' ELSE now() + interval '1 day' END
      FROM generate_series(1, 10000) i
    `;
    const plan = await first.$queryRaw(PrismaExplain());
    console.log('Throttle expiry EXPLAIN:', JSON.stringify(plan));
    expect(JSON.stringify(plan)).toContain('ThrottleBucket_expiresAt_idx');
  });

  it('runs exact adapter operations as non-owner acres_app without tenant context', async () => {
    // The isolated test database normally denies app connections. Inside one
    // rollback-only local bootstrap transaction, grant ONLY this infrastructure table
    // and SET LOCAL ROLE to verify actual runtime-role SQL without changing
    // database ACLs, passwords, tenant policies or persistent grants.
    const bootstrap = new PrismaService({
      databaseUrl:
        'postgresql://postgres:acres_superuser_dev_password@localhost:5432/acres_test',
    } as AcresConfigService);
    const rollback = new Error('rollback privilege fixture');
    try {
      await expect(
        bootstrap.$transaction(
          async (tx) => {
            await tx.$executeRaw`GRANT SELECT, INSERT, UPDATE, DELETE ON "ThrottleBucket" TO acres_app`;
            await tx.$executeRaw`SET LOCAL ROLE acres_app`;
            const [role] = await tx.$queryRaw<
              { name: string; bypass: boolean; owner: boolean }[]
            >`
          SELECT current_user AS name, rolbypassrls AS bypass, rolsuper AS owner
          FROM pg_roles WHERE rolname = current_user
        `;
            expect(role).toEqual({
              name: 'acres_app',
              bypass: false,
              owner: false,
            });
            const runtime = new PostgresThrottlerStorage({
              $transaction: (
                callback: (
                  client: Prisma.TransactionClient,
                ) => Promise<unknown>,
              ) => callback(tx),
            } as unknown as PrismaService);
            expect(
              (
                await runtime.increment(
                  key('runtime-role'),
                  1000,
                  1,
                  1000,
                  'default',
                )
              ).isBlocked,
            ).toBe(false);
            expect(
              (
                await runtime.increment(
                  key('runtime-role'),
                  1000,
                  1,
                  1000,
                  'default',
                )
              ).isBlocked,
            ).toBe(true);
            await runtime.cleanupOnce();
            throw rollback;
          },
          { timeout: 10000 },
        ),
      ).rejects.toBe(rollback);
    } finally {
      await bootstrap.onModuleDestroy();
    }
  });

  it('selects managed shared storage and gives 429/retry headers before controller execution', async () => {
    app = await httpApp('vercel');
    expect(app.get(ThrottlerStorage)).toBeInstanceOf(PostgresThrottlerStorage);
    const server = app.getHttpServer() as App;
    await request(server).get('/protected').expect(200);
    await request(server).get('/protected').expect(200);
    const denied = await request(server).get('/protected').expect(429);
    expect(denied.headers['retry-after']).toBe('60');
    expect(denied.body).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    expect(ProtectedController.executions).toBe(2);
  });

  it('fails closed on unreachable storage while real health exemption remains available', async () => {
    app = await httpApp(
      'vercel',
      'postgresql://acres_test:synthetic@127.0.0.1:1/acres_test?connect_timeout=1',
    );
    const server = app.getHttpServer() as App;
    const denied = await request(server).get('/protected').expect(503);
    expect(denied.body).toMatchObject({
      error: {
        code: 'NOT_READY',
        message: 'Request protection is temporarily unavailable.',
      },
    });
    expect(ProtectedController.executions).toBe(0);
    await request(server).get('/health').expect(200);
  });

  it('retains the installed memory storage for the reference composition', async () => {
    app = await httpApp('bullmq');
    expect(app.get(ThrottlerStorage)).toBeInstanceOf(ThrottlerStorageService);
  });
});

function PrismaExplain() {
  return Prisma.sql`EXPLAIN (FORMAT JSON) ${expiredThrottleBuckets()}`;
}
