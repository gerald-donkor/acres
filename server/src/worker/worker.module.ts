import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { AcresWorkerConfigModule } from '../config/config.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { MetricsModule } from '../metrics/metrics.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { ScannerModule } from '../scanner/scanner.module';
import { StorageModule } from '../storage/storage.module';
import { ReportsModule } from '../reports/reports.module';
import { JobProcessorService } from './job-processor.service';
import { UploadWorkerService } from './upload-worker.service';

@Module({
  imports: [
    AcresWorkerConfigModule,
    PrismaModule,
    OutboxModule,
    QueueModule,
    ScannerModule,
    StorageModule,
    IngestionModule,
    ReportsModule,
    MetricsModule,
    // Feature modules declare controllers guarded by SessionGuard; Nest resolves
    // those enhancers even in an application context, so the (global) sessions
    // providers must be present. No route is ever served here.
    SessionsModule,
  ],
  providers: [JobProcessorService, UploadWorkerService],
})
export class WorkerModule {}
