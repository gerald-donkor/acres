import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { AcresWorkerConfigModule } from '../config/config.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxModule } from '../outbox/outbox.module';
import { QueueModule } from '../queue/queue.module';
import { ReportsModule } from '../reports/reports.module';
import { ScannerModule } from '../scanner/scanner.module';
import { StorageModule } from '../storage/storage.module';
import { JobLeaseService } from '../worker/job-lease.service';
import { JobProcessorService } from '../worker/job-processor.service';
import { LeasedJobExecutorService } from '../worker/leased-job-executor.service';

/**
 * Invocation-scoped job composition for the Vercel queue consumer: the same
 * request-independent processor as the self-hosted worker, without the BullMQ
 * loop, outbox timer, any `listen()`, or `MetricsModule` (whose default
 * collectors and query listener need a scraped long-lived process; every
 * consumer injects `MetricsService` optionally).
 */
@Module({
  imports: [
    AcresWorkerConfigModule,
    PrismaModule,
    QueueModule,
    OutboxModule,
    ScannerModule,
    StorageModule,
    IngestionModule,
    ReportsModule,
    // Feature modules declare controllers guarded by SessionGuard; Nest resolves
    // those enhancers even in an application context, so the (global) sessions
    // providers must be present. No route is ever served here.
    SessionsModule,
  ],
  providers: [JobProcessorService, JobLeaseService, LeasedJobExecutorService],
})
export class VercelJobsModule {}
