import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import { Prisma } from '../generated/prisma/client';
import type { OrganizationContext } from '../organizations/organization-context';
import { AnalyticsRepository } from './analytics.repository';
import type { AnalyticsAggregateQueryDto } from './dto/analytics-aggregate-query.dto';
import type { AnalyticsObservationQueryDto } from './dto/analytics-observation-query.dto';

@Injectable()
export class AnalyticsService {
  constructor(private readonly analytics: AnalyticsRepository) {}

  listMetrics(organization: OrganizationContext) {
    return this.analytics.organizationScoped(organization, async (tx) => {
      const metrics = await this.analytics.findMetrics(
        tx,
        organization.organizationId,
      );
      return metrics.map(toMetric);
    });
  }

  getMetric(organization: OrganizationContext, metricId: string) {
    return this.analytics.organizationScoped(organization, async (tx) => {
      const metric = await this.analytics.findMetric(
        tx,
        organization.organizationId,
        metricId,
      );
      if (metric === null) throw ApiException.notFound('Metric not found.');
      return toMetric(metric);
    });
  }

  listObservations(
    organization: OrganizationContext,
    query: AnalyticsObservationQueryDto,
  ) {
    return this.analytics.organizationScoped(organization, async (tx) => {
      const observations = await this.analytics.findObservations(
        tx,
        organization.organizationId,
        query,
      );
      return observations.map(toObservation);
    });
  }

  listAggregates(
    organization: OrganizationContext,
    query: AnalyticsAggregateQueryDto,
  ) {
    return this.analytics.organizationScoped(organization, async (tx) => {
      const aggregates = await this.analytics.findAggregates(
        tx,
        organization.organizationId,
        query,
      );
      return aggregates.map(toAggregate);
    });
  }

  getAggregateEvidence(organization: OrganizationContext, aggregateId: string) {
    return this.analytics.organizationScoped(organization, async (tx) => {
      const aggregate = await this.analytics.findAggregate(
        tx,
        organization.organizationId,
        aggregateId,
      );
      if (aggregate === null)
        throw ApiException.notFound('Aggregate not found.');
      const lineage = await this.analytics.findAggregateEvidence(
        tx,
        organization.organizationId,
        aggregateId,
      );
      return {
        aggregate: toAggregate(aggregate),
        evidence: lineage.map((item) => ({
          observationId: item.observationId,
          datasetVersionId: item.datasetVersionId,
          datasetVersion: {
            id: item.datasetVersion.id,
            versionNumber: item.datasetVersion.versionNumber,
            publishedAt: item.datasetVersion.publishedAt.toISOString(),
          },
          observation: toObservation(item.observation),
        })),
      };
    });
  }
}

function toObservation(observation: {
  id: string;
  datasetVersionId: string;
  regionId: string;
  metricDefinition: Parameters<typeof toMetric>[0];
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string | null;
  numericValue: unknown;
  textValue: string | null;
  booleanValue: boolean | null;
  unit: string;
  dimensionHash: string;
  dimensions: unknown;
  sourceRowNumber: number | null;
  qualities: Array<{
    severity: string;
    state: string;
    code: string;
    message: string;
  }>;
  createdAt: Date;
}) {
  return {
    id: observation.id,
    datasetVersionId: observation.datasetVersionId,
    regionId: observation.regionId,
    metric: toMetric(observation.metricDefinition),
    periodStart: observation.periodStart.toISOString(),
    periodEnd: observation.periodEnd.toISOString(),
    periodLabel: observation.periodLabel,
    value: valueOf(observation),
    unit: observation.unit,
    dimensionHash: observation.dimensionHash,
    dimensions: observation.dimensions,
    sourceRowNumber: observation.sourceRowNumber,
    quality: observation.qualities.map((quality) => ({
      severity: quality.severity,
      state: quality.state,
      code: quality.code,
      message: quality.message,
    })),
    createdAt: observation.createdAt.toISOString(),
  };
}

function toAggregate(aggregate: {
  id: string;
  datasetVersionId: string;
  regionId: string;
  metricDefinition: Parameters<typeof toMetric>[0];
  aggregateType: string;
  periodStart: Date;
  periodEnd: Date;
  numericValue: unknown;
  textValue: string | null;
  booleanValue: boolean | null;
  unit: string;
  dimensionHash: string;
  dimensions: unknown;
  observationCount: number;
  qualitySummary: unknown;
  datasetVersionIds: unknown;
  createdAt: Date;
}) {
  return {
    id: aggregate.id,
    datasetVersionId: aggregate.datasetVersionId,
    regionId: aggregate.regionId,
    metric: toMetric(aggregate.metricDefinition),
    aggregateType: aggregate.aggregateType,
    periodStart: aggregate.periodStart.toISOString(),
    periodEnd: aggregate.periodEnd.toISOString(),
    value: valueOf(aggregate),
    unit: aggregate.unit,
    dimensionHash: aggregate.dimensionHash,
    dimensions: aggregate.dimensions,
    observationCount: aggregate.observationCount,
    qualitySummary: aggregate.qualitySummary,
    datasetVersionIds: aggregate.datasetVersionIds,
    createdAt: aggregate.createdAt.toISOString(),
  };
}

function toMetric(metric: {
  id: string;
  key: string;
  label: string;
  description: string | null;
  valueType: string;
  canonicalUnit: string;
  allowedAggregation: string;
  calculationVersion: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: metric.id,
    key: metric.key,
    label: metric.label,
    description: metric.description,
    valueType: metric.valueType,
    canonicalUnit: metric.canonicalUnit,
    allowedAggregation: metric.allowedAggregation,
    calculationVersion: metric.calculationVersion,
    status: metric.status,
    createdAt: metric.createdAt.toISOString(),
    updatedAt: metric.updatedAt.toISOString(),
  };
}

function valueOf(row: {
  numericValue: unknown;
  textValue: string | null;
  booleanValue: boolean | null;
}) {
  if (row.numericValue !== null && row.numericValue !== undefined) {
    return { type: 'numeric', value: decimalValueToString(row.numericValue) };
  }
  if (row.textValue !== null) return { type: 'text', value: row.textValue };
  return { type: 'boolean', value: row.booleanValue };
}

function decimalValueToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  if (value instanceof Prisma.Decimal) return value.toString();
  throw new Error('Unexpected numeric metric value shape.');
}
