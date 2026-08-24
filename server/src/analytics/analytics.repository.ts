import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { OrganizationContext } from '../organizations/organization-context';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';
import type { AnalyticsTx } from './analytics.types';
import type { AnalyticsAggregateQueryDto } from './dto/analytics-aggregate-query.dto';
import type { AnalyticsObservationQueryDto } from './dto/analytics-observation-query.dto';

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly tenants: TenantTransactionService) {}

  organizationScoped<T>(
    organization: OrganizationContext,
    callback: (tx: AnalyticsTx) => Promise<T>,
  ): Promise<T> {
    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      callback,
      { statementTimeoutMs: 5000 },
    );
  }

  findMetrics(tx: AnalyticsTx, organizationId: string) {
    return tx.metricDefinition.findMany({
      where: { organizationId, status: 'active' },
      orderBy: { key: 'asc' },
      take: 100,
    });
  }

  findMetric(tx: AnalyticsTx, organizationId: string, metricId: string) {
    return tx.metricDefinition.findFirst({
      where: { id: metricId, organizationId },
    });
  }

  findObservations(
    tx: AnalyticsTx,
    organizationId: string,
    query: AnalyticsObservationQueryDto,
  ) {
    return tx.metricObservation.findMany({
      where: this.filter(organizationId, query),
      orderBy: [{ periodStart: 'asc' }, { createdAt: 'asc' }],
      include: { metricDefinition: true, qualities: true },
      take: query.limit ?? 50,
    });
  }

  findAggregates(
    tx: AnalyticsTx,
    organizationId: string,
    query: AnalyticsAggregateQueryDto,
  ) {
    return tx.metricAggregate.findMany({
      where: this.filter(organizationId, query),
      orderBy: [{ periodStart: 'asc' }, { createdAt: 'asc' }],
      include: { metricDefinition: true },
      take: query.limit ?? 50,
    });
  }

  findAggregate(tx: AnalyticsTx, organizationId: string, aggregateId: string) {
    return tx.metricAggregate.findFirst({
      where: { id: aggregateId, organizationId },
      include: { metricDefinition: true },
    });
  }

  findAggregateEvidence(
    tx: AnalyticsTx,
    organizationId: string,
    aggregateId: string,
  ) {
    return tx.metricAggregateLineage.findMany({
      where: { organizationId, aggregateId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: {
        observation: { include: { metricDefinition: true, qualities: true } },
        datasetVersion: true,
      },
    });
  }

  private filter(
    organizationId: string,
    query: AnalyticsObservationQueryDto | AnalyticsAggregateQueryDto,
  ): Prisma.MetricObservationWhereInput & Prisma.MetricAggregateWhereInput {
    return {
      organizationId,
      metricDefinitionId: query.metricId,
      regionId: query.regionId,
      datasetVersionId: query.datasetVersionId,
      dimensionHash: query.dimensionHash,
      periodStart: query.periodStart
        ? { gte: new Date(query.periodStart) }
        : undefined,
      periodEnd: query.periodEnd
        ? { lte: new Date(query.periodEnd) }
        : undefined,
    };
  }
}
