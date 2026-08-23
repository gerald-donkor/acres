import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { AcresConfigService } from '../../src/config/acres-config.service';
import { PrismaService } from '../../src/prisma/prisma.service';

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
  $disconnect: jest.Mock;
}

export function createPrismaDouble(): PrismaDouble {
  return {
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
    $disconnect: jest.fn().mockResolvedValue(undefined),
  };
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
      .useValue(prisma);

    if (Object.keys(envOverrides).length > 0) {
      builder
        .overrideProvider(AcresConfigService)
        .useValue(configDouble(envOverrides));
    }

    const moduleRef = await builder.compile();

    app = moduleRef.createNestApplication();
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
