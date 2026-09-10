import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CreateDashboardViewInput,
  DashboardFilters,
  DashboardPresentation,
  DashboardSummary,
  DashboardView,
  MetricValueKind,
  UpdateDashboardViewInput,
} from '@acres/shared';
import { ApiException } from '../common/api-exception';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { OrganizationContext } from '../organizations/organization-context';
import { AnalyticsService } from '../analytics/analytics.service';
import { DashboardsRepository } from './dashboards.repository';

/**
 * The only saved-view shape this build reads and writes: the Phase 9
 * filters/presentation shape. Rows written before versioning carry no
 * marker and read as 1. Any other stored value fails closed in `toView`.
 */
export const CURRENT_DASHBOARD_VIEW_SCHEMA_VERSION = 1;

@Injectable()
export class DashboardsService {
  constructor(
    private readonly dashboards: DashboardsRepository,
    private readonly analytics: AnalyticsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  listViews(organization: OrganizationContext): Promise<DashboardView[]> {
    return this.dashboards.organizationScoped(organization, async (tx) => {
      const rows = await this.dashboards.listViews(
        tx,
        organization.organizationId,
      );
      return rows.map(toView);
    });
  }

  getView(
    organization: OrganizationContext,
    viewId: string,
  ): Promise<DashboardView> {
    return this.dashboards.organizationScoped(organization, async (tx) => {
      const row = await this.dashboards.findView(
        tx,
        organization.organizationId,
        viewId,
      );
      if (row === null)
        throw ApiException.notFound('Dashboard view not found.');
      return toView(row);
    });
  }

  createView(
    organization: OrganizationContext,
    input: CreateDashboardViewInput,
    idempotencyKey?: string,
  ): Promise<DashboardView> {
    const body = normalizeCreate(input);
    return this.dashboards.organizationScoped(organization, async (tx) =>
      this.idempotency.run(
        tx,
        {
          key: idempotencyKey,
          accountId: organization.accountId,
          organizationId: organization.organizationId,
          operation: 'dashboardViews.create',
          requestBody: body,
          responseStatus: 201,
        },
        async () => {
          const row = await tx.dashboardView.create({
            data: {
              organizationId: organization.organizationId,
              ownerAccountId: organization.accountId,
              name: body.name,
              description: body.description,
              filters: body.filters,
              presentation: body.presentation,
              schemaVersion: CURRENT_DASHBOARD_VIEW_SCHEMA_VERSION,
            },
          });
          return toView(row);
        },
      ),
    );
  }

  updateView(
    organization: OrganizationContext,
    viewId: string,
    input: UpdateDashboardViewInput,
  ): Promise<DashboardView> {
    return this.dashboards.organizationScoped(organization, async (tx) => {
      const existing = await this.dashboards.findView(
        tx,
        organization.organizationId,
        viewId,
      );
      if (existing === null)
        throw ApiException.notFound('Dashboard view not found.');

      // Version-gate before writing: a row this build cannot interpret must
      // not be overwritten under current-shape assumptions. The read-back
      // below stays as defense in depth.
      resolveSchemaVersion(existing.schemaVersion);

      const row = await tx.dashboardView.update({
        where: { id: existing.id },
        data: {
          name: input.name?.trim(),
          description:
            input.description === undefined
              ? undefined
              : optionalText(input.description),
          filters: input.filters ?? undefined,
          presentation: input.presentation ?? undefined,
        },
      });
      return toView(row);
    });
  }

  archiveView(
    organization: OrganizationContext,
    viewId: string,
  ): Promise<{ archived: true }> {
    return this.dashboards.organizationScoped(organization, async (tx) => {
      const existing = await this.dashboards.findView(
        tx,
        organization.organizationId,
        viewId,
      );
      if (existing === null)
        throw ApiException.notFound('Dashboard view not found.');
      await tx.dashboardView.update({
        where: { id: existing.id },
        data: { status: 'archived' },
      });
      return { archived: true as const };
    });
  }

  async summary(
    organization: OrganizationContext,
    filters: DashboardFilters,
  ): Promise<DashboardSummary> {
    const [metrics, aggregates, savedViews] = await Promise.all([
      this.analytics.listMetrics(organization),
      this.analytics.listAggregates(organization, {
        ...filters,
        limit: 24,
      }),
      this.listViews(organization),
    ]);
    return {
      metrics,
      aggregates: aggregates.map((aggregate) => ({
        ...aggregate,
        datasetVersionIds: Array.isArray(aggregate.datasetVersionIds)
          ? (aggregate.datasetVersionIds as string[])
          : [],
        value: {
          type: aggregate.value.type as MetricValueKind,
          value:
            aggregate.value.value === null
              ? null
              : String(aggregate.value.value),
        },
      })),
      savedViews,
    };
  }
}

function normalizeCreate(input: CreateDashboardViewInput) {
  return {
    name: input.name.trim(),
    description: optionalText(input.description),
    filters: input.filters,
    presentation: input.presentation ?? { chart: 'bar', compareBy: 'region' },
  };
}

function optionalText(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
}

function toView(row: {
  id: string;
  ownerAccountId: string;
  name: string;
  description: string | null;
  filters: unknown;
  presentation: unknown;
  schemaVersion: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    ownerAccountId: row.ownerAccountId,
    name: row.name,
    description: row.description,
    filters: (row.filters ?? {}) as DashboardFilters,
    presentation: (row.presentation ?? {}) as DashboardPresentation,
    schemaVersion: resolveSchemaVersion(row.schemaVersion),
    status: row.status as 'active' | 'archived',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Missing markers (rows written before versioning) read as the current
 * version. A newer, non-integer, or below-range marker means this build
 * cannot interpret the stored shape, so reads fail closed with the stable
 * `INTERNAL_ERROR` envelope rather than guessing. `listViews` propagates
 * the same throw instead of silently dropping rows, keeping list and read
 * behavior consistent.
 */
function resolveSchemaVersion(value: unknown): number {
  if (value === null || value === undefined)
    return CURRENT_DASHBOARD_VIEW_SCHEMA_VERSION;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > CURRENT_DASHBOARD_VIEW_SCHEMA_VERSION
  )
    throw new ApiException(
      'INTERNAL_ERROR',
      'Saved dashboard view uses an unsupported schema version.',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  return value;
}
