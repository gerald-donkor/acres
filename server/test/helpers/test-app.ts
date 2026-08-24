import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { AcresConfigService } from '../../src/config/acres-config.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OBJECT_STORAGE } from '../../src/storage/storage.port';

/**
 * No database is provisioned for this repository, so the tests replace
 * `PrismaService` with a recorded double. That keeps them honest about what
 * they cover: the HTTP surface, validation, the envelopes, CSRF and the
 * session guard — not SQL.
 */
export interface PrismaDouble {
  account: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  session: {
    create: jest.Mock;
    findUnique: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  region: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
  contactSubmission: {
    create: jest.Mock;
  };
  jobRun: {
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
  };
  organization: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  membership: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  invitation: {
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  auditEvent: {
    create: jest.Mock;
    findMany: jest.Mock;
  };
  idempotencyRecord: {
    create: jest.Mock;
    deleteMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  storedObject: {
    create: jest.Mock;
    update: jest.Mock;
  };
  upload: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  outboxEvent: {
    create: jest.Mock;
    update: jest.Mock;
  };
  jobProgressEvent: {
    create: jest.Mock;
  };
  accountToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  $executeRaw: jest.Mock;
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
  $disconnect: jest.Mock;
}

export function createPrismaDouble(): PrismaDouble {
  const prisma = {
    account: { findUnique: jest.fn(), create: jest.fn() },
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    region: { findMany: jest.fn(), findUnique: jest.fn() },
    contactSubmission: { create: jest.fn() },
    jobRun: { create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    organization: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    membership: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    invitation: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    auditEvent: { create: jest.fn(), findMany: jest.fn() },
    idempotencyRecord: {
      create: jest.fn((input: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'idempotency-1',
          ...input.data,
        }),
      ),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn((input: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'idempotency-1',
          ...input.data,
        }),
      ),
    },
    storedObject: {
      create: jest.fn(),
      update: jest.fn(),
    },
    upload: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
      update: jest.fn(),
    },
    jobProgressEvent: {
      create: jest.fn(),
    },
    accountToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  };
  prisma.$transaction.mockImplementation(
    (callback: (tx: PrismaDouble) => unknown) =>
      Promise.resolve(callback(prisma)),
  );
  return prisma;
}

function envValue(
  envOverrides: Partial<Record<string, string>>,
  key: string,
): string {
  return envOverrides[key] ?? process.env[key] ?? '';
}

function positiveInt(
  envOverrides: Partial<Record<string, string>>,
  key: string,
): number {
  return Number(envValue(envOverrides, key));
}

function configDouble(
  envOverrides: Partial<Record<string, string>>,
): AcresConfigService {
  return {
    get nodeEnv() {
      return envValue(envOverrides, 'NODE_ENV') as
        'development' | 'test' | 'production';
    },
    get isProduction() {
      return envValue(envOverrides, 'NODE_ENV') === 'production';
    },
    get port() {
      return positiveInt(envOverrides, 'PORT');
    },
    get clientOrigin() {
      return envValue(envOverrides, 'CLIENT_ORIGIN');
    },
    get databaseUrl() {
      return envValue(envOverrides, 'DATABASE_URL');
    },
    get sessionCookieName() {
      return envValue(envOverrides, 'SESSION_COOKIE_NAME');
    },
    get sessionTtlDays() {
      return positiveInt(envOverrides, 'SESSION_TTL_DAYS');
    },
    get sessionSecret() {
      return envValue(envOverrides, 'SESSION_SECRET');
    },
    get csrfCookieName() {
      return envValue(envOverrides, 'CSRF_COOKIE_NAME');
    },
    get schedulerEnabled() {
      return envValue(envOverrides, 'SCHEDULER_ENABLED') === 'true';
    },
    get rateLimitTtlMs() {
      return positiveInt(envOverrides, 'RATE_LIMIT_TTL_MS');
    },
    get rateLimitDefaultLimit() {
      return positiveInt(envOverrides, 'RATE_LIMIT_DEFAULT_LIMIT');
    },
    get rateLimitStrictLimit() {
      return positiveInt(envOverrides, 'RATE_LIMIT_STRICT_LIMIT');
    },
    get tenancyEnabled() {
      return envValue(envOverrides, 'TENANCY_ENABLED') === 'true';
    },
    get invitationTtlHours() {
      return positiveInt(envOverrides, 'INVITATION_TTL_HOURS');
    },
    get accountTokenTtlMinutes() {
      return positiveInt(envOverrides, 'ACCOUNT_TOKEN_TTL_MINUTES');
    },
    get graphqlMaxBytes() {
      return positiveInt(envOverrides, 'GRAPHQL_MAX_BYTES');
    },
    get graphqlMaxDepth() {
      return positiveInt(envOverrides, 'GRAPHQL_MAX_DEPTH');
    },
    get graphqlMaxAliases() {
      return positiveInt(envOverrides, 'GRAPHQL_MAX_ALIASES');
    },
    get graphqlMaxCost() {
      return positiveInt(envOverrides, 'GRAPHQL_MAX_COST');
    },
    get graphqlMaxFirst() {
      return positiveInt(envOverrides, 'GRAPHQL_MAX_FIRST');
    },
    get graphqlMaxNodes() {
      return positiveInt(envOverrides, 'GRAPHQL_MAX_NODES');
    },
    get graphqlTimeoutMs() {
      return positiveInt(envOverrides, 'GRAPHQL_TIMEOUT_MS');
    },
    get idempotencyTtlHours() {
      return positiveInt(envOverrides, 'IDEMPOTENCY_TTL_HOURS');
    },
    get valkeyUrl() {
      return envValue(envOverrides, 'VALKEY_URL');
    },
    get queueName() {
      return envValue(envOverrides, 'QUEUE_NAME');
    },
    get queuePrefix() {
      return envValue(envOverrides, 'QUEUE_PREFIX');
    },
    get queueDefaultAttempts() {
      return positiveInt(envOverrides, 'QUEUE_DEFAULT_ATTEMPTS');
    },
    get queueBackoffMs() {
      return positiveInt(envOverrides, 'QUEUE_BACKOFF_MS');
    },
    get queueShutdownMs() {
      return positiveInt(envOverrides, 'QUEUE_SHUTDOWN_MS');
    },
    get storageEndpoint() {
      return envValue(envOverrides, 'STORAGE_ENDPOINT');
    },
    get storageRegion() {
      return envValue(envOverrides, 'STORAGE_REGION');
    },
    get storageBucket() {
      return envValue(envOverrides, 'STORAGE_BUCKET');
    },
    get storageAccessKeyId() {
      return envValue(envOverrides, 'STORAGE_ACCESS_KEY_ID');
    },
    get storageSecretAccessKey() {
      return envValue(envOverrides, 'STORAGE_SECRET_ACCESS_KEY');
    },
    get storageForcePathStyle() {
      return envValue(envOverrides, 'STORAGE_FORCE_PATH_STYLE') === 'true';
    },
    get presignedUploadTtlSeconds() {
      return positiveInt(envOverrides, 'PRESIGNED_UPLOAD_TTL_SECONDS');
    },
    get acceptedDownloadTtlSeconds() {
      return positiveInt(envOverrides, 'ACCEPTED_DOWNLOAD_TTL_SECONDS');
    },
    get clamavHost() {
      return envValue(envOverrides, 'CLAMAV_HOST');
    },
    get clamavPort() {
      return positiveInt(envOverrides, 'CLAMAV_PORT');
    },
    get clamavScanTimeoutMs() {
      return positiveInt(envOverrides, 'CLAMAV_SCAN_TIMEOUT_MS');
    },
    get uploadMaxBytes() {
      return positiveInt(envOverrides, 'UPLOAD_MAX_BYTES');
    },
    get uploadAcceptedMediaTypes() {
      return envValue(envOverrides, 'UPLOAD_ACCEPTED_MEDIA_TYPES').split(',');
    },
    get uploadStaleMinutes() {
      return positiveInt(envOverrides, 'UPLOAD_STALE_MINUTES');
    },
    get uploadCleanupIntervalMs() {
      return positiveInt(envOverrides, 'UPLOAD_CLEANUP_INTERVAL_MS');
    },
    get outboxClaimBatchSize() {
      return positiveInt(envOverrides, 'OUTBOX_CLAIM_BATCH_SIZE');
    },
    get outboxClaimLeaseMs() {
      return positiveInt(envOverrides, 'OUTBOX_CLAIM_LEASE_MS');
    },
    get outboxMaxAttempts() {
      return positiveInt(envOverrides, 'OUTBOX_MAX_ATTEMPTS');
    },
  } as AcresConfigService;
}

export async function createTestApp(
  prisma: PrismaDouble,
  envOverrides: Partial<Record<string, string>> = {},
): Promise<{
  app: INestApplication;
}> {
  let app: INestApplication | undefined;
  let initialized = false;
  try {
    const builder = Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(OBJECT_STORAGE)
      .useValue({
        presignPut: jest.fn().mockResolvedValue({
          url: 'http://storage.local/upload',
          method: 'PUT',
          headers: { 'content-type': 'text/csv' },
          expiresAt: new Date('2026-01-01T00:15:00.000Z'),
        }),
        presignGet: jest.fn().mockResolvedValue({
          url: 'http://storage.local/download',
          method: 'GET',
          headers: {},
          expiresAt: new Date('2026-01-01T00:05:00.000Z'),
        }),
        stat: jest.fn().mockResolvedValue({
          byteCount: BigInt(12),
          mediaType: 'text/csv',
          checksumHex: null,
        }),
        getBuffer: jest.fn().mockResolvedValue(Buffer.from('test-content')),
        delete: jest.fn().mockResolvedValue(undefined),
        readiness: jest.fn().mockResolvedValue(true),
      });

    if (Object.keys(envOverrides).length > 0) {
      builder
        .overrideProvider(AcresConfigService)
        .useValue(configDouble(envOverrides));
    }

    const moduleRef = await builder.compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    initialized = true;
    return { app };
  } finally {
    if (!initialized) {
      await app?.close();
    }
  }
}
