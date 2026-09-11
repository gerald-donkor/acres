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
import { OrganizationContextGuard } from '../organizations/organization-context.guard';
import { PermissionGuard } from '../organizations/permission.guard';
import { RequiresOrganizationPermission } from '../organizations/permissions';
import { JobRunsService } from './job-runs.service';

/**
 * Job names and failure messages describe internals, so listing recent runs
 * requires the `jobs.read` permission: owner or admin of the active
 * organization. Analysts and viewers are denied, and callers without an
 * active-organization header (or membership) receive the standard
 * organization-context 404 rather than the runs.
 */
@Controller({ path: 'jobs', version: '1' })
@UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
@RequiresOrganizationPermission('jobs.read')
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
