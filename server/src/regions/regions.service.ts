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

  async listPage(
    take: number,
    afterId?: string,
    statementTimeoutMs?: number,
  ): Promise<RegionSummary[]> {
    const regions = await this.withOptionalStatementTimeout(
      statementTimeoutMs,
      (client) =>
        client.region
          .findMany({
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            include: WITH_METRICS,
            ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
            take,
          })
          .catch((error: unknown) => {
            if (isMissingCursor(error)) throw ApiException.cursorInvalid();
            throw error;
          }),
    );
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

  async findBySlugs(
    slugs: readonly string[],
    statementTimeoutMs?: number,
  ): Promise<Map<string, RegionSummary>> {
    const regions = await this.withOptionalStatementTimeout(
      statementTimeoutMs,
      (client) =>
        client.region.findMany({
          where: { slug: { in: [...new Set(slugs)] } },
          include: WITH_METRICS,
        }),
    );
    return new Map(
      regions.map((region) => [region.slug, toRegionSummary(region)]),
    );
  }

  private withOptionalStatementTimeout<T>(
    statementTimeoutMs: number | undefined,
    callback: (client: Prisma.TransactionClient | PrismaService) => Promise<T>,
  ): Promise<T> {
    if (statementTimeoutMs === undefined) return callback(this.prisma);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'statement_timeout',
          ${String(statementTimeoutMs)},
          true
        )
      `;
      return callback(tx);
    });
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

function isMissingCursor(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2025'
  );
}
