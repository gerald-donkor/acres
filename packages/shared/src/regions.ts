/** Regional data — the product's subject matter. */

export interface RegionSummary {
  id: string;
  slug: string;
  name: string;
  /** ISO 3166-1 alpha-2, when the region maps to one country. */
  countryCode: string | null;
  summary: string | null;
  metrics: RegionalMetric[];
}

export interface RegionalMetric {
  id: string;
  regionId: string;
  /** Stable machine key, e.g. `efficiency-improvement`. */
  key: string;
  label: string;
  value: number;
  unit: string | null;
  /** ISO 8601, inclusive start of the measured period. */
  periodStart: string | null;
  /** ISO 8601, exclusive end of the measured period. */
  periodEnd: string | null;
  /** Attribution for the figure. Never invented. */
  source: string | null;
}

export const INSIGHT_REPORT_STATUSES = [
  'draft',
  'published',
  'archived',
] as const;

export type InsightReportStatus = (typeof INSIGHT_REPORT_STATUSES)[number];

export interface InsightReportSummary {
  id: string;
  regionId: string | null;
  title: string;
  summary: string;
  status: InsightReportStatus;
  /** ISO 8601. */
  updatedAt: string;
}
