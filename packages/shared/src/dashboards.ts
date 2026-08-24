export type MetricValueKind = 'numeric' | 'text' | 'boolean';

export type MetricValue = {
  type: MetricValueKind;
  value: string | null;
};

export type DashboardMetric = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  valueType: string;
  canonicalUnit: string;
  allowedAggregation: string;
  calculationVersion: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type DashboardAggregate = {
  id: string;
  datasetVersionId: string;
  regionId: string;
  metric: DashboardMetric;
  aggregateType: string;
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
  chart?: 'bar' | 'line' | 'table';
  compareBy?: 'region' | 'period';
};

export type DashboardView = {
  id: string;
  name: string;
  description: string | null;
  filters: DashboardFilters;
  presentation: DashboardPresentation;
  ownerAccountId: string;
  status: 'active' | 'archived';
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
