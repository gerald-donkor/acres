import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiServiceUnavailableResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiSessionAuth, errorEnvelope } from '../contracts/openapi';
import { SessionGuard } from '../sessions/session.guard';
import { OrganizationContextGuard } from '../organizations/organization-context.guard';
import { PermissionGuard } from '../organizations/permission.guard';
import { RequiresOrganizationPermission } from '../organizations/permissions';

/** Global maintenance telemetry is not authorized by any tenant role. */
@Controller({ path: 'jobs', version: '1' })
@UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
@RequiresOrganizationPermission('jobs.read')
@ApiTags('jobs')
@ApiSessionAuth()
export class JobsController {
  @Get('runs')
  @ApiOperation({
    summary: 'Disabled global maintenance history',
    description:
      'Global scheduled maintenance runs are not available to organization members. No tenant role grants operator access.',
    deprecated: true,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid authenticated session.',
    schema: errorEnvelope(),
  })
  @ApiForbiddenResponse({
    description:
      'Global maintenance history is unavailable to every tenant role.',
    schema: errorEnvelope(),
  })
  @ApiNotFoundResponse({
    description: 'Missing or inaccessible active organization.',
    schema: errorEnvelope(),
  })
  @ApiTooManyRequestsResponse({
    description: 'Request rate limit exceeded.',
    schema: errorEnvelope(),
  })
  @ApiServiceUnavailableResponse({
    description: 'Organization tenancy is not enabled.',
    schema: errorEnvelope(),
  })
  listRuns(): never {
    throw new ForbiddenException(
      'Global maintenance history is not available.',
    );
  }
}
