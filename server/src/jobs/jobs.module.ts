import { Module } from '@nestjs/common';
import { JobRunsService } from './job-runs.service';
import { JobsController } from './jobs.controller';
import { SessionMaintenanceJob } from './session-maintenance.job';

@Module({
  controllers: [JobsController],
  providers: [JobRunsService, SessionMaintenanceJob],
  exports: [JobRunsService],
})
export class JobsModule {}
