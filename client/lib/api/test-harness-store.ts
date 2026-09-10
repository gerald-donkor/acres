import type {
  DashboardAggregate,
  DashboardMetric,
  DashboardSummary,
  DashboardView,
  DatasetSummary,
  DatasetVersionSummary,
  ExportRequest,
  Report,
} from "@acres/shared";

export type TestHarnessMocks = {
  dashboardSummary?: DashboardSummary;
  reports?: Report[];
  report?: Report;
  exports?: ExportRequest[];
  datasets?: DatasetSummary[];
  dataset?: DatasetSummary;
  versions?: DatasetVersionSummary[];
};

// Global in-memory mock store for test harness sessions
const mockStore = new Map<string, Partial<TestHarnessMocks>>();

export function isTestHarnessActive(): boolean {
  return process.env.ENABLE_TEST_HARNESS === "true";
}

export function setSessionMocks(
  sessionId: string,
  mocks: Partial<TestHarnessMocks>,
): void {
  if (!isTestHarnessActive()) return;
  const existing = mockStore.get(sessionId) ?? {};
  mockStore.set(sessionId, { ...existing, ...mocks });
}

export function getSessionMocks(
  sessionId: string,
): Partial<TestHarnessMocks> | undefined {
  if (!isTestHarnessActive()) return undefined;
  return mockStore.get(sessionId);
}

export function clearSessionMocks(sessionId?: string): void {
  if (!isTestHarnessActive()) return;
  if (sessionId) {
    mockStore.delete(sessionId);
  } else {
    mockStore.clear();
  }
}

export function getDefaultMockDashboardSummary(): DashboardSummary {
  const metric1: DashboardMetric = {
    id: "metric-canopy-1",
    key: "canopy_cover",
    label: "Canopy Cover",
    description: "Regional forest canopy density ratio",
    valueType: "numeric",
    canonicalUnit: "pct",
    allowedAggregation: "mean",
    calculationVersion: "calc-v1.0",
    status: "published",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };

  const metric2: DashboardMetric = {
    id: "metric-water-2",
    key: "water_index",
    label: "Surface Water Index",
    description: "Surface water index",
    valueType: "numeric",
    canonicalUnit: "ndwi",
    allowedAggregation: "mean",
    calculationVersion: "calc-v1.0",
    status: "published",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };

  const agg1: DashboardAggregate = {
    id: "agg-canopy-01",
    datasetVersionId: "ds-v1-2026",
    regionId: "reg-north-01",
    metric: metric1,
    aggregateType: "mean",
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-06-30T23:59:59.000Z",
    value: { type: "numeric", value: "64.2" },
    unit: "%",
    dimensionHash: "dim_hash_north_q1q2",
    observationCount: 1420,
    datasetVersionIds: ["ds-v1-2026"],
    createdAt: "2026-07-01T12:00:00.000Z",
  };

  const agg2: DashboardAggregate = {
    id: "agg-water-02",
    datasetVersionId: "ds-v1-2026",
    regionId: "reg-north-01",
    metric: metric2,
    aggregateType: "mean",
    periodStart: "2026-02-01T00:00:00.000Z",
    periodEnd: "2026-06-30T23:59:59.000Z",
    value: { type: "numeric", value: "0.45" },
    unit: "ndwi",
    dimensionHash: "dim_hash_north_q1q2",
    observationCount: 1420,
    datasetVersionIds: ["ds-v1-2026"],
    createdAt: "2026-07-01T12:00:00.000Z",
  };

  const savedView: DashboardView = {
    id: "view-north-baseline",
    name: "Northern Baseline",
    description: "Standard Q1-Q2 northern regional coverage",
    filters: { metricId: metric1.id },
    presentation: { chart: "bar", compareBy: "period" },
    schemaVersion: 1,
    ownerAccountId: "acc-test-owner",
    status: "active",
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedAt: "2026-08-10T10:00:00.000Z",
  };

  return {
    metrics: [metric1, metric2],
    aggregates: [agg1, agg2],
    savedViews: [savedView],
  };
}
