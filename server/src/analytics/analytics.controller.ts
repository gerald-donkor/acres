import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelope,
  ApiSessionAuth,
  arraySchema,
  nullableStringSchema,
  objectSchema,
  stringSchema,
} from '../contracts/openapi';
import { CurrentOrganization } from '../organizations/current-organization.decorator';
import type { OrganizationContext } from '../organizations/organization-context';
import { OrganizationContextGuard } from '../organizations/organization-context.guard';
import { PermissionGuard } from '../organizations/permission.guard';
import { RequiresOrganizationPermission } from '../organizations/permissions';
import { SessionGuard } from '../sessions/session.guard';
import { AnalyticsService } from './analytics.service';
import { AnalyticsAggregateQueryDto } from './dto/analytics-aggregate-query.dto';
import { AnalyticsObservationQueryDto } from './dto/analytics-observation-query.dto';
import { AggregateParamDto, MetricParamDto } from './dto/analytics-param.dto';

const valueSchema = objectSchema({
  type: stringSchema(),
  value: {},
});

const metricSchema = objectSchema({
  id: stringSchema('uuid'),
  key: stringSchema(),
  label: stringSchema(),
  description: nullableStringSchema(),
  valueType: stringSchema(),
  canonicalUnit: stringSchema(),
  allowedAggregation: stringSchema(),
  calculationVersion: stringSchema(),
  status: stringSchema(),
  createdAt: stringSchema('date-time'),
  updatedAt: stringSchema('date-time'),
});

const observationSchema = objectSchema({
  id: stringSchema('uuid'),
  datasetVersionId: stringSchema('uuid'),
  regionId: stringSchema('uuid'),
  metric: metricSchema,
  periodStart: stringSchema('date-time'),
  periodEnd: stringSchema('date-time'),
  periodLabel: nullableStringSchema(),
  value: valueSchema,
  unit: stringSchema(),
  dimensionHash: stringSchema(),
  dimensions: { type: 'object', additionalProperties: true },
  sourceRowNumber: { oneOf: [{ type: 'number' }, { type: 'null' }] },
  quality: arraySchema(
    objectSchema({
      severity: stringSchema(),
      state: stringSchema(),
      code: stringSchema(),
      message: stringSchema(),
    }),
  ),
  createdAt: stringSchema('date-time'),
});

const aggregateSchema = objectSchema({
  id: stringSchema('uuid'),
  datasetVersionId: stringSchema('uuid'),
  regionId: stringSchema('uuid'),
  metric: metricSchema,
  aggregateType: stringSchema(),
  periodStart: stringSchema('date-time'),
  periodEnd: stringSchema('date-time'),
  value: valueSchema,
  unit: stringSchema(),
  dimensionHash: stringSchema(),
  dimensions: { type: 'object', additionalProperties: true },
  observationCount: { type: 'number' },
  qualitySummary: { type: 'object', additionalProperties: true },
  datasetVersionIds: { type: 'array', items: stringSchema('uuid') },
  createdAt: stringSchema('date-time'),
});

@Controller({ version: '1', path: 'analytics' })
@UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)
@ApiTags('analytics')
@ApiSessionAuth()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('metrics')
  @RequiresOrganizationPermission('analytics.read')
  @ApiEnvelope({
    summary: 'List metric definitions',
    description: 'Lists active organization metric definitions.',
    data: arraySchema(metricSchema),
  })
  listMetrics(@CurrentOrganization() organization: OrganizationContext) {
    return this.analytics.listMetrics(organization);
  }

  @Get('metrics/:metricId')
  @RequiresOrganizationPermission('analytics.read')
  @ApiEnvelope({
    summary: 'Get metric definition',
    description: 'Reads one organization metric definition.',
    data: metricSchema,
  })
  getMetric(
    @CurrentOrganization() organization: OrganizationContext,
    @Param() params: MetricParamDto,
  ) {
    return this.analytics.getMetric(organization, params.metricId);
  }

  @Get('observations')
  @RequiresOrganizationPermission('analytics.read')
  @ApiEnvelope({
    summary: 'List metric observations',
    description: 'Lists bounded organization metric observations.',
    data: arraySchema(observationSchema),
  })
  listObservations(
    @CurrentOrganization() organization: OrganizationContext,
    @Query() query: AnalyticsObservationQueryDto,
  ) {
    return this.analytics.listObservations(organization, query);
  }

  @Get('aggregates')
  @RequiresOrganizationPermission('analytics.read')
  @ApiEnvelope({
    summary: 'List metric aggregates',
    description: 'Lists deterministic aggregate read models.',
    data: arraySchema(aggregateSchema),
  })
  listAggregates(
    @CurrentOrganization() organization: OrganizationContext,
    @Query() query: AnalyticsAggregateQueryDto,
  ) {
    return this.analytics.listAggregates(organization, query);
  }

  @Get('aggregates/:aggregateId/evidence')
  @RequiresOrganizationPermission('analytics.read')
  @ApiEnvelope({
    summary: 'Get aggregate evidence',
    description: 'Reads aggregate lineage back to observations and versions.',
    data: objectSchema({
      aggregate: aggregateSchema,
      evidence: arraySchema(
        objectSchema({
          observationId: stringSchema('uuid'),
          datasetVersionId: stringSchema('uuid'),
          datasetVersion: objectSchema({
            id: stringSchema('uuid'),
            versionNumber: { type: 'number' },
            publishedAt: stringSchema('date-time'),
          }),
          observation: observationSchema,
        }),
      ),
    }),
  })
  getAggregateEvidence(
    @CurrentOrganization() organization: OrganizationContext,
    @Param() params: AggregateParamDto,
  ) {
    return this.analytics.getAggregateEvidence(
      organization,
      params.aggregateId,
    );
  }
}
