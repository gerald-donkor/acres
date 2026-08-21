import { Controller, Get, UseGuards } from '@nestjs/common';
import type { JobRunSummary } from '@acres/shared';
import { SessionGuard } from '../sessions/session.guard';
import { JobRunsService } from './job-runs.service';

/**
 * Behind the session guard because job names and failure messages describe
 * internals. Role-based authorization is a later prompt; until it exists,
 * "any signed-in account" is the floor, not the intended final rule.
 */
@Controller('jobs')
@UseGuards(SessionGuard)
export class JobsController {
  constructor(private readonly runs: JobRunsService) {}

  @Get('runs')
  listRuns(): Promise<JobRunSummary[]> {
    return this.runs.listRecent();
  }
}
