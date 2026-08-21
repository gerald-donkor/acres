import { Injectable } from '@nestjs/common';
import type { RegionSummary, RegionalMetric } from '@acres/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ApiException } from '../common/api-exception';

/**
 * Metrics are fetched with their region in one query. Reading regions and then
 * looping to fetch each one's metrics is the N+1 this `include` exists to
 * avoid.
 */
const WITH_METRICS = {
  metrics: { orderBy: { key: 'asc' } },
} as const;

@Injectable()
export class RegionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<RegionSummary[]> {
    const regions = await this.prisma.region.findMany({
      orderBy: { name: 'asc' },
      include: WITH_METRICS,
    });
    return regions.map((region) => toRegionSummary(region));
  }

  async findBySlug(slug: string): Promise<RegionSummary> {
    const region = await this.prisma.region.findUnique({
      where: { slug },
      include: WITH_METRICS,
    });

    if (region === null) {
      throw ApiException.notFound(`No region matches "${slug}".`);
    }

    return toRegionSummary(region);
  }
}

/**
 * Derived from the query's own `include`, so the row shape cannot drift away
 * from what Prisma actually returns.
 */
type RegionRow = Prisma.RegionGetPayload<{ include: typeof WITH_METRICS }>;
type MetricRow = RegionRow['metrics'][number];

function toRegionSummary(region: RegionRow): RegionSummary {
  return {
    id: region.id,
    slug: region.slug,
    name: region.name,
    countryCode: region.countryCode,
    summary: region.summary,
    metrics: region.metrics.map(toRegionalMetric),
  };
}

function toRegionalMetric(metric: MetricRow): RegionalMetric {
  return {
    id: metric.id,
    regionId: metric.regionId,
    key: metric.key,
    label: metric.label,
    value: metric.value,
    unit: metric.unit,
    periodStart: metric.periodStart?.toISOString() ?? null,
    periodEnd: metric.periodEnd?.toISOString() ?? null,
    source: metric.source,
  };
}
