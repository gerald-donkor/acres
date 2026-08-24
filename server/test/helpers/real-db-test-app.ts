import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { PrismaService } from '../../src/prisma/prisma.service';

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
    }).compile();

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
    'TRUNCATE TABLE "AuditEvent","Invitation","Membership","Organization","IdempotencyRecord","AccountToken","Session","Account","RegionalMetric","InsightReport","Region","ContactSubmission","JobRun" RESTART IDENTITY CASCADE;',
  );
}
