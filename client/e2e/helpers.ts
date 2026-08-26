import { expect, type Locator, type Page } from "@playwright/test";
import type {
  DashboardAggregate,
  DashboardMetric,
  DashboardSummary,
  DashboardView,
  ExportRequest,
  Report,
} from "@acres/shared";

export function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export async function expectNoHorizontalScroll(page: Page) {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasOverflow).toBe(false);
}

export async function expectMinTouchTarget(
  locator: Locator,
  label: string,
) {
  const box = await locator.boundingBox();
  expect(box, `${label} should be visible`).not.toBeNull();
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44);
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(44);
}

export function appAlert(page: Page) {
  return page.locator('[data-slot="alert"]');
}

export async function registerAccount(
  page: Page,
  options: { name?: string; email?: string; password?: string } = {},
) {
  const email = options.email ?? `${unique("user")}@example.com`;
  const name = options.name ?? "Test Engineer";
  const password = options.password ?? "secure-password-123";

  await page.goto("/register?returnTo=/app");
  await page.getByLabel("Display Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/app$/);
  return { email, name, password };
}

export async function createFirstOrganization(
  page: Page,
  name = unique("Acme Regional"),
) {
  await expect(
    page.getByRole("heading", { name: "Create Organization" }),
  ).toBeVisible();
  await page.getByLabel("Organization Name").fill(name);
  await page.getByRole("button", { name: "Create Organization" }).click();
  await expect(page.getByLabel("Current organization")).toHaveText(name);
  return name;
}

export function createMockMetric(
  overrides: Partial<DashboardMetric> = {},
): DashboardMetric {
  const id = overrides.id ?? unique("metric");
  return {
    id,
    key: "canopy_cover_pct",
    label: "Canopy Cover Percentage",
    description: "Regional forest canopy density ratio",
    valueType: "numeric",
    canonicalUnit: "pct",
    allowedAggregation: "mean",
    calculationVersion: "calc-v1.0",
    status: "published",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

export function createMockAggregate(
  metric: DashboardMetric,
  overrides: Partial<DashboardAggregate> = {},
): DashboardAggregate {
  const id = overrides.id ?? unique("agg");
  return {
    id,
    datasetVersionId: "ds-v1-2026",
    regionId: "reg-north-01",
    metric,
    aggregateType: "mean",
    periodStart: "2026-01-01T00:00:00.000Z",
    periodEnd: "2026-06-30T23:59:59.000Z",
    value: { type: "numeric", value: "78.4" },
    unit: "%",
    dimensionHash: "dim_hash_north_q1q2",
    observationCount: 1420,
    datasetVersionIds: ["ds-v1-2026"],
    createdAt: "2026-07-01T12:00:00.000Z",
    ...overrides,
  };
}

export function createMockDashboardSummary(
  overrides: Partial<DashboardSummary> = {},
): DashboardSummary {
  const metric1 = createMockMetric({
    id: "metric-canopy-1",
    key: "canopy_cover",
    label: "Canopy Cover",
  });
  const metric2 = createMockMetric({
    id: "metric-water-2",
    key: "water_index",
    label: "Surface Water Index",
    canonicalUnit: "ndwi",
  });

  const agg1 = createMockAggregate(metric1, {
    id: "agg-canopy-01",
    value: { type: "numeric", value: "64.2" },
    unit: "%",
    periodStart: "2026-01-01T00:00:00.000Z",
  });
  const agg2 = createMockAggregate(metric2, {
    id: "agg-water-02",
    value: { type: "numeric", value: "0.45" },
    unit: "ndwi",
    periodStart: "2026-02-01T00:00:00.000Z",
  });

  const savedView: DashboardView = {
    id: "view-north-baseline",
    name: "Northern Baseline",
    description: "Standard Q1-Q2 northern regional coverage",
    filters: { metricId: metric1.id },
    presentation: { chart: "bar", compareBy: "period" },
    ownerAccountId: "acc-test-owner",
    status: "active",
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedAt: "2026-08-10T10:00:00.000Z",
  };

  return {
    metrics: [metric1, metric2],
    aggregates: [agg1, agg2],
    savedViews: [savedView],
    ...overrides,
  };
}

export function createMockReport(
  overrides: Partial<Report> = {},
): Report {
  const id = overrides.id ?? unique("rep");
  return {
    id,
    title: "Regional Forest Quality Assessment",
    summary: "Evidence-backed baseline for canopy cover and watershed health.",
    status: "published",
    version: 1,
    ownerAccountId: "acc-test-owner",
    createdByAccountId: "acc-test-owner",
    createdAt: "2026-08-15T09:00:00.000Z",
    updatedAt: "2026-08-15T09:30:00.000Z",
    latestRevision: {
      id: `rev-${id}-1`,
      reportId: id,
      revisionNumber: 1,
      status: "published",
      title: "Regional Forest Quality Assessment",
      summary: "Evidence-backed baseline for canopy cover and watershed health.",
      sections: [],
      authorAccountId: "acc-test-owner",
      reviewerAccountId: "acc-test-owner",
      publisherAccountId: "acc-test-owner",
      submittedForReviewAt: "2026-08-15T09:15:00.000Z",
      publishedAt: "2026-08-15T09:30:00.000Z",
      createdAt: "2026-08-15T09:00:00.000Z",
      updatedAt: "2026-08-15T09:30:00.000Z",
      insights: [
        {
          id: `ins-${id}-1`,
          position: 0,
          heading: "Canopy Density",
          body: "Canopy coverage remained above 60% across all surveyed sectors.",
          createdAt: "2026-08-15T09:00:00.000Z",
          updatedAt: "2026-08-15T09:00:00.000Z",
        },
      ],
      evidence: [
        {
          id: `evi-${id}-1`,
          evidenceType: "aggregate",
          aggregateId: "agg-canopy-01",
          dashboardViewId: null,
          metricDefinitionId: "metric-canopy-1",
          datasetVersionId: "ds-v1-2026",
          observationId: null,
          snapshot: { value: 64.2, unit: "%" },
          position: 0,
          createdAt: "2026-08-15T09:00:00.000Z",
        },
      ],
    },
    ...overrides,
  };
}

export function createMockExport(
  reportId: string,
  format: "csv" | "pdf" = "csv",
  overrides: Partial<ExportRequest> = {},
): ExportRequest {
  const id = overrides.id ?? unique("exp");
  return {
    id,
    reportId,
    revisionId: `rev-${reportId}-1`,
    format,
    status: "succeeded",
    renderingVersion: "render-v1.0",
    failure: null,
    artifact: {
      id: `art-${id}`,
      filename: `report-${reportId}.${format}`,
      mediaType: format === "csv" ? "text/csv" : "application/pdf",
      byteCount: format === "csv" ? 4096 : 48120,
      checksumHex: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      createdAt: "2026-08-15T10:00:00.000Z",
    },
    startedAt: "2026-08-15T09:59:50.000Z",
    finishedAt: "2026-08-15T10:00:00.000Z",
    expiresAt: "2026-08-22T10:00:00.000Z",
    createdAt: "2026-08-15T09:59:45.000Z",
    updatedAt: "2026-08-15T10:00:00.000Z",
    ...overrides,
  };
}
