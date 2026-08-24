import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { JobRunSummary } from '@acres/shared';
import {
  ApiEnvelope,
  ApiSessionAuth,
  arraySchema,
  jobRunSchema,
} from '../contracts/openapi';
import { SessionGuard } from '../sessions/session.guard';
import { JobRunsService } from './job-runs.service';

/**
 * Behind the session guard because job names and failure messages describe
 * internals. Role-based authorization is a later prompt; until it exists,
 * "any signed-in account" is the floor, not the intended final rule.
 */
@Controller({ path: 'jobs', version: '1' })
@UseGuards(SessionGuard)
@ApiTags('jobs')
@ApiSessionAuth()
export class JobsController {
  constructor(private readonly runs: JobRunsService) {}

  @Get('runs')
  @ApiEnvelope({
    summary: 'List recent job runs',
    description: 'Returns the most recent scheduled job runs.',
    data: arraySchema(jobRunSchema),
  })
  listRuns(): Promise<JobRunSummary[]> {
    return this.runs.listRecent();
  }
}
