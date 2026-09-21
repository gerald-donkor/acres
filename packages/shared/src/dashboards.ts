export const METRIC_VALUE_KINDS = ['numeric', 'text', 'boolean'] as const;
export type MetricValueKind = (typeof METRIC_VALUE_KINDS)[number];

export const METRIC_AGGREGATION_TYPES = [
  'sum',
  'avg',
  'min',
  'max',
  'count',
  'latest',
] as const;
export type MetricAggregationType = (typeof METRIC_AGGREGATION_TYPES)[number];

export const DASHBOARD_PRESENTATION_CHARTS = ['bar', 'line', 'table'] as const;
export type DashboardPresentationChart =
  (typeof DASHBOARD_PRESENTATION_CHARTS)[number];

export const DASHBOARD_COMPARE_BY_OPTIONS = ['region', 'period'] as const;
export type DashboardCompareBy = (typeof DASHBOARD_COMPARE_BY_OPTIONS)[number];

export const DASHBOARD_VIEW_STATUSES = ['active', 'archived'] as const;
export type DashboardViewStatus = (typeof DASHBOARD_VIEW_STATUSES)[number];

export function isDashboardViewStatus(
  status: string,
): status is DashboardViewStatus {
  return (DASHBOARD_VIEW_STATUSES as readonly string[]).includes(status);
}

export const METRIC_DEFINITION_STATUSES = ['active', 'archived'] as const;
export type MetricDefinitionStatus =
  (typeof METRIC_DEFINITION_STATUSES)[number];

export type MetricValue = {
  type: MetricValueKind;
  value: string | null;
};

export type DashboardMetric = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  valueType: MetricValueKind;
  canonicalUnit: string;
  allowedAggregation: MetricAggregationType;
  calculationVersion: string;
  status: MetricDefinitionStatus;
  createdAt: string;
  updatedAt: string;
};

export type DashboardAggregate = {
  id: string;
  datasetVersionId: string;
  regionId: string;
  metric: DashboardMetric;
  aggregateType: MetricAggregationType;
  periodStart: string;
  periodEnd: string;
  value: MetricValue;
  unit: string;
  dimensionHash: string;
  observationCount: number;
  datasetVersionIds: string[];
  createdAt: string;
};

export type DashboardFilters = {
  metricId?: string;
  regionId?: string;
  datasetVersionId?: string;
  dimensionHash?: string;
  periodStart?: string;
  periodEnd?: string;
};

export type DashboardPresentation = {
  chart?: DashboardPresentationChart;
  compareBy?: DashboardCompareBy;
};

export type DashboardView = {
  id: string;
  name: string;
  description: string | null;
  filters: DashboardFilters;
  presentation: DashboardPresentation;
  /**
   * Stored shape version. 1 is the Phase 9 filters/presentation shape.
   * Server-stamped on write; callers never choose it.
   */
  schemaVersion: number;
  ownerAccountId: string;
  status: DashboardViewStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateDashboardViewInput = {
  name: string;
  description?: string;
  filters: DashboardFilters;
  presentation?: DashboardPresentation;
};

export type UpdateDashboardViewInput = Partial<CreateDashboardViewInput>;

export type DashboardSummary = {
  metrics: DashboardMetric[];
  aggregates: DashboardAggregate[];
  savedViews: DashboardView[];
};
