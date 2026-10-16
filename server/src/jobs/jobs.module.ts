import { Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { OutboxModule } from '../outbox/outbox.module';
import { QueueModule } from '../queue/queue.module';
import { ReportsModule } from '../reports/reports.module';
import { ScannerModule } from '../scanner/scanner.module';
import { StorageModule } from '../storage/storage.module';
import { JobLeaseService } from '../worker/job-lease.service';
import { JobProcessorService } from '../worker/job-processor.service';
import { LeasedJobExecutorService } from '../worker/leased-job-executor.service';
import { JobRunsService } from './job-runs.service';
import { JobsController } from './jobs.controller';
import { RetentionMaintenanceJob } from './retention-maintenance.job';
import { SessionMaintenanceJob } from './session-maintenance.job';

@Module({
  imports: [
    OrganizationsModule,
    ScannerModule,
    QueueModule,
    StorageModule,
    OutboxModule,
    IngestionModule,
    ReportsModule,
  ],
  controllers: [JobsController],
  providers: [
    JobRunsService,
    SessionMaintenanceJob,
    RetentionMaintenanceJob,
    JobProcessorService,
    JobLeaseService,
    LeasedJobExecutorService,
  ],
  exports: [JobRunsService, LeasedJobExecutorService],
})
export class JobsModule {}
