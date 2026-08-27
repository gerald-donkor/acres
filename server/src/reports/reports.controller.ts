import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { concat, from, of, timer, type Observable } from 'rxjs';
import { map, switchMap, takeWhile } from 'rxjs/operators';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiCsrfHeader,
  ApiEnvelope,
  ApiIdempotencyHeader,
  ApiOrganizationHeader,
  ApiSessionAuth,
  arraySchema,
  nullableStringSchema,
  objectSchema,
  stringSchema,
} from '../contracts/openapi';
import { CurrentOrganization } from '../organizations/current-organization.decorator';
import { OrganizationContextGuard } from '../organizations/organization-context.guard';
import type { OrganizationContext } from '../organizations/organization-context';
import { PermissionGuard } from '../organizations/permission.guard';
import { RequiresOrganizationPermission } from '../organizations/permissions';
import { SessionGuard } from '../sessions/session.guard';
import {
  CreateExportDto,
  CreateRevisionDto,
  CreateReportDto,
  UpdateReportDto,
  UpdateRevisionDto,
} from './dto/report.dto';
import { ReportsService } from './reports.service';

const jsonObjectSchema = { type: 'object', additionalProperties: true };
const reportEvidenceSchema = objectSchema({
  id: stringSchema('uuid'),
  evidenceType: stringSchema(),
  aggregateId: nullableStringSchema('uuid'),
  dashboardViewId: nullableStringSchema('uuid'),
  metricDefinitionId: nullableStringSchema('uuid'),
  datasetVersionId: nullableStringSchema('uuid'),
  observationId: nullableStringSchema('uuid'),
  snapshot: jsonObjectSchema,
  position: { type: 'number' },
  createdAt: stringSchema('date-time'),
});
const reportInsightSchema = objectSchema({
  id: stringSchema('uuid'),
  position: { type: 'number' },
  heading: stringSchema(),
  body: stringSchema(),
  createdAt: stringSchema('date-time'),
  updatedAt: stringSchema('date-time'),
});
const reportRevisionSchema = objectSchema({
  id: stringSchema('uuid'),
  reportId: stringSchema('uuid'),
  revisionNumber: { type: 'number' },
  status: stringSchema(),
  title: stringSchema(),
  summary: nullableStringSchema(),
  sections: { type: 'array', items: jsonObjectSchema },
  authorAccountId: stringSchema('uuid'),
  reviewerAccountId: nullableStringSchema('uuid'),
  publisherAccountId: nullableStringSchema('uuid'),
  submittedForReviewAt: nullableStringSchema('date-time'),
  publishedAt: nullableStringSchema('date-time'),
  createdAt: stringSchema('date-time'),
  updatedAt: stringSchema('date-time'),
  insights: arraySchema(reportInsightSchema),
  evidence: arraySchema(reportEvidenceSchema),
});
const reportSchema = objectSchema({
  id: stringSchema('uuid'),
  title: stringSchema(),
  summary: nullableStringSchema(),
  status: stringSchema(),
  version: { type: 'number' },
  ownerAccountId: stringSchema('uuid'),
  createdByAccountId: stringSchema('uuid'),
  createdAt: stringSchema('date-time'),
  updatedAt: stringSchema('date-time'),
  latestRevision: { oneOf: [reportRevisionSchema, { type: 'null' }] },
});
const exportSchema = objectSchema({
  id: stringSchema('uuid'),
  reportId: nullableStringSchema('uuid'),
  revisionId: nullableStringSchema('uuid'),
  format: stringSchema(),
  status: stringSchema(),
  renderingVersion: stringSchema(),
  failure: { oneOf: [jsonObjectSchema, { type: 'null' }] },
  artifact: { oneOf: [jsonObjectSchema, { type: 'null' }] },
  startedAt: nullableStringSchema('date-time'),
  finishedAt: nullableStringSchema('date-time'),
  expiresAt: nullableStringSchema('date-time'),
  createdAt: stringSchema('date-time'),
  updatedAt: stringSchema('date-time'),
});

@Controller({ version: '1' })
@UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
@ApiTags('reports')
@ApiSessionAuth()
@ApiOrganizationHeader()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('reports')
  @RequiresOrganizationPermission('reports.read')
  @ApiEnvelope({
    summary: 'List reports',
    description: 'Lists active reports for the selected organization.',
    data: arraySchema(reportSchema),
  })
  listReports(@CurrentOrganization() organization: OrganizationContext) {
    return this.reports.listReports(organization);
  }

  @Post('reports')
  @RequiresOrganizationPermission('reports.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiCsrfHeader()
  @ApiIdempotencyHeader()
  @ApiEnvelope({
    summary: 'Create report',
    status: HttpStatus.CREATED,
    description:
      'Creates a draft report revision from structured insight and evidence references.',
    data: reportSchema,
  })
  createReport(
    @CurrentOrganization() organization: OrganizationContext,
    @Body() body: CreateReportDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.reports.createReport(organization, body, idempotencyKey);
  }

  @Get('reports/:reportId')
  @RequiresOrganizationPermission('reports.read')
  @ApiEnvelope({
    summary: 'Get report',
    description: 'Reads one report and its latest revision.',
    data: reportSchema,
  })
  getReport(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ) {
    return this.reports.getReport(organization, reportId);
  }

  @Patch('reports/:reportId')
  @RequiresOrganizationPermission('reports.update')
  @ApiCsrfHeader()
  @ApiEnvelope({
    summary: 'Update report',
    description:
      'Updates report metadata with expected-version conflict detection.',
    data: reportSchema,
  })
  updateReport(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() body: UpdateReportDto,
  ) {
    return this.reports.updateReport(organization, reportId, body);
  }

  @Post('reports/:reportId/revisions')
  @RequiresOrganizationPermission('reports.update')
  @HttpCode(HttpStatus.CREATED)
  @ApiCsrfHeader()
  @ApiIdempotencyHeader()
  @ApiEnvelope({
    summary: 'Create report revision',
    status: HttpStatus.CREATED,
    description:
      'Creates the next draft revision from the latest published revision or supplied content.',
    data: reportSchema,
  })
  createRevision(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() body: CreateRevisionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.reports.createRevision(
      organization,
      reportId,
      body,
      idempotencyKey,
    );
  }

  @Patch('reports/:reportId/revisions/:revisionId')
  @RequiresOrganizationPermission('reports.update')
  @ApiCsrfHeader()
  @ApiEnvelope({
    summary: 'Update draft report revision',
    description:
      'Updates draft revision content. Published revisions are immutable.',
    data: reportSchema,
  })
  updateRevision(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() body: UpdateRevisionDto,
  ) {
    return this.reports.updateRevision(
      organization,
      reportId,
      revisionId,
      body,
    );
  }

  @Post('reports/:reportId/revisions/:revisionId/publish')
  @RequiresOrganizationPermission('reports.publish')
  @HttpCode(HttpStatus.OK)
  @ApiCsrfHeader()
  @ApiIdempotencyHeader()
  @ApiEnvelope({
    summary: 'Publish report revision',
    description: 'Freezes a revision as immutable published evidence.',
    data: reportSchema,
  })
  publishRevision(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.reports.publishRevision(
      organization,
      reportId,
      revisionId,
      idempotencyKey,
    );
  }

  @Get('reports/:reportId/revisions/:revisionId/evidence')
  @RequiresOrganizationPermission('reports.read')
  @ApiEnvelope({
    summary: 'List report evidence',
    description: 'Reads frozen evidence links for a report revision.',
    data: arraySchema(reportEvidenceSchema),
  })
  revisionEvidence(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
  ) {
    return this.reports.getRevisionEvidence(organization, reportId, revisionId);
  }

  @Get('exports')
  @RequiresOrganizationPermission('exports.read')
  @ApiEnvelope({
    summary: 'List exports',
    description: 'Lists recent export requests for the selected organization.',
    data: arraySchema(exportSchema),
  })
  listExports(@CurrentOrganization() organization: OrganizationContext) {
    return this.reports.listExports(organization);
  }

  @Post('exports')
  @RequiresOrganizationPermission('exports.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiCsrfHeader()
  @ApiIdempotencyHeader()
  @ApiEnvelope({
    summary: 'Request export',
    status: HttpStatus.CREATED,
    description: 'Queues an asynchronous CSV or PDF report export.',
    data: exportSchema,
  })
  createExport(
    @CurrentOrganization() organization: OrganizationContext,
    @Body() body: CreateExportDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.reports.createExport(organization, body, idempotencyKey);
  }

  @Get('exports/:exportId')
  @RequiresOrganizationPermission('exports.read')
  @ApiEnvelope({
    summary: 'Get export',
    description: 'Reads export request state.',
    data: exportSchema,
  })
  getExport(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('exportId', ParseUUIDPipe) exportId: string,
  ) {
    return this.reports.getExport(organization, exportId);
  }

  @Get('exports/:exportId/download')
  @RequiresOrganizationPermission('exports.read')
  @ApiEnvelope({
    summary: 'Create export download URL',
    description: 'Returns a short-lived attachment URL for a completed export.',
    data: objectSchema({
      url: stringSchema(),
      method: stringSchema(),
      headers: jsonObjectSchema,
      expiresAt: stringSchema('date-time'),
    }),
  })
  downloadExport(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('exportId', ParseUUIDPipe) exportId: string,
  ) {
    return this.reports.downloadExport(organization, exportId);
  }

  @Sse('exports/:exportId/events')
  @RequiresOrganizationPermission('exports.read')
  async events(
    @CurrentOrganization() organization: OrganizationContext,
    @Param('exportId', ParseUUIDPipe) exportId: string,
  ): Promise<Observable<MessageEvent>> {
    const initial = await this.reports.getExport(organization, exportId);
    const initialEvent: MessageEvent = {
      type: 'export.progress',
      id: `${initial.id}:${initial.status}:${initial.finishedAt ?? initial.updatedAt}`,
      data: initial,
    };
    if (isExportTerminal(initial.status)) {
      return of(initialEvent);
    }
    return concat(
      of(initialEvent),
      timer(1500, 1500).pipe(
        switchMap(() => from(this.reports.getExport(organization, exportId))),
        takeWhile((status) => !isExportTerminal(status.status), true),
        map(
          (status) =>
            ({
              type: 'export.progress',
              id: `${status.id}:${status.status}:${status.finishedAt ?? status.updatedAt}`,
              data: status,
            }) satisfies MessageEvent,
        ),
      ),
    );
  }
}

function isExportTerminal(status: string): boolean {
  return ['succeeded', 'failed', 'cancelled'].includes(status);
}
