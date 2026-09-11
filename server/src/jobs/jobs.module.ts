import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { JobRunsService } from './job-runs.service';
import { JobsController } from './jobs.controller';
import { RetentionMaintenanceJob } from './retention-maintenance.job';
import { SessionMaintenanceJob } from './session-maintenance.job';

@Module({
  imports: [OrganizationsModule],
  controllers: [JobsController],
  providers: [JobRunsService, SessionMaintenanceJob, RetentionMaintenanceJob],
  exports: [JobRunsService],
})
export class JobsModule {}
