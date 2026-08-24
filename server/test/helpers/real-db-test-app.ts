import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WORK_QUEUE } from '../../src/queue/work-queue.port';
import { OBJECT_STORAGE } from '../../src/storage/storage.port';

/**
 * The opposite of `test-app.ts`: that helper overrides `PrismaService` with a
 * recorded double precisely to avoid a database. This one requires a real,
 * reachable, migrated `acres_test` database (see `test/setup-env.ts`).
 */
export async function createRealDbTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  let app: INestApplication | undefined;
  let initialized = false;
  try {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OBJECT_STORAGE)
      .useValue({
        presignPut: jest.fn(),
        presignGet: jest.fn(),
        stat: jest.fn(),
        getBuffer: jest.fn(),
        delete: jest.fn(),
        readiness: jest.fn().mockResolvedValue(true),
      })
      .overrideProvider(WORK_QUEUE)
      .useValue({
        enqueue: jest.fn().mockResolvedValue(undefined),
        readiness: jest.fn().mockResolvedValue(true),
        close: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    initialized = true;
    const prisma = app.get(PrismaService);
    return { app, prisma };
  } finally {
    if (!initialized) {
      await app?.close();
    }
  }
}

export async function truncateAll(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "ValidationIssue","StagedSourceSummary","IngestionRun","DatasetVersion","ColumnMapping","Dataset","RegionGeometry","RegionAlias","RegionCode","RegionSource","AuditEvent","Invitation","Membership","Organization","IdempotencyRecord","AccountToken","Session","Account","RegionalMetric","InsightReport","Region","ContactSubmission","JobRun","StoredObject","Upload","OutboxEvent","DurableJob","JobProgressEvent","JobDeadLetter" RESTART IDENTITY CASCADE;',
  );
}
