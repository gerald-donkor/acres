import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
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

export async function createTestApp(prisma: PrismaDouble): Promise<{
  app: INestApplication;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return { app };
}
