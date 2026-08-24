import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiCsrfHeader,
  ApiEnvelope,
  ApiIdempotencyHeader,
  ApiOrganizationHeader,
  ApiSessionAuth,
  arraySchema,
  objectSchema,
  stringSchema,
  nullableStringSchema,
} from '../contracts/openapi';
import { CurrentOrganization } from '../organizations/current-organization.decorator';
import { OrganizationContextGuard } from '../organizations/organization-context.guard';
import type { OrganizationContext } from '../organizations/organization-context';
import { PermissionGuard } from '../organizations/permission.guard';
import { RequiresOrganizationPermission } from '../organizations/permissions';
import { SessionGuard } from '../sessions/session.guard';
import {
  CreateDashboardViewDto,
  UpdateDashboardViewDto,
} from './dto/dashboard-view.dto';
import { DashboardsService } from './dashboards.service';

const jsonObjectSchema = { type: 'object', additionalProperties: true };
const dashboardViewSchema = objectSchema({
  id: stringSchema('uuid'),
  name: stringSchema(),
  description: nullableStringSchema(),
  filters: jsonObjectSchema,
  presentation: jsonObjectSchema,
  ownerAccountId: stringSchema('uuid'),
  status: stringSchema(),
  createdAt: stringSchema('date-time'),
  updatedAt: stringSchema('date-time'),
});

@Controller({ version: '1', path: 'dashboard-views' })
@UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
@ApiTags('dashboard-views')
@ApiSessionAuth()
@ApiOrganizationHeader()
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get()
  @RequiresOrganizationPermission('analytics.read')
  @ApiEnvelope({
    summary: 'List dashboard views',
    description:
      'Lists active saved analytical views for the selected organization.',
    data: arraySchema(dashboardViewSchema),
  })
  list(@CurrentOrganization() organization: OrganizationContext) {
    return this.dashboards.listViews(organization);
  }

  @Get(':viewId')
  @RequiresOrganizationPermission('analytics.read')
  @ApiEnvelope({
    summary: 'Get dashboard view',
    description: 'Reads one active saved analytical view.',
    data: dashboardViewSchema,
  })
  get(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('viewId', ParseUUIDPipe) viewId: string,
  ) {
    return this.dashboards.getView(organization, viewId);
  }

  @Post()
  @RequiresOrganizationPermission('dashboards.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiCsrfHeader()
  @ApiIdempotencyHeader()
  @ApiEnvelope({
    summary: 'Create dashboard view',
    status: HttpStatus.CREATED,
    description:
      'Saves dashboard filters and presentation state, not metric values.',
    data: dashboardViewSchema,
  })
  create(
    @CurrentOrganization() organization: OrganizationContext,
    @Body() body: CreateDashboardViewDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    return this.dashboards.createView(organization, body, idempotencyKey);
  }

  @Patch(':viewId')
  @RequiresOrganizationPermission('dashboards.manage')
  @ApiCsrfHeader()
  @ApiEnvelope({
    summary: 'Update dashboard view',
    description:
      'Updates saved dashboard intent for the selected organization.',
    data: dashboardViewSchema,
  })
  update(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('viewId', ParseUUIDPipe) viewId: string,
    @Body() body: UpdateDashboardViewDto,
  ) {
    return this.dashboards.updateView(organization, viewId, body);
  }

  @Delete(':viewId')
  @RequiresOrganizationPermission('dashboards.manage')
  @ApiCsrfHeader()
  @ApiEnvelope({
    summary: 'Archive dashboard view',
    description: 'Soft-archives a saved dashboard view.',
    data: objectSchema({ archived: { type: 'boolean', enum: [true] } }),
  })
  archive(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('viewId', ParseUUIDPipe) viewId: string,
  ) {
    return this.dashboards.archiveView(organization, viewId);
  }
}
