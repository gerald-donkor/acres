import type { Prisma } from '../generated/prisma/client';
import type { ParsedSourceSummary } from '../ingestion/parsers/parser.types';

export const ANALYTICS_CALCULATION_VERSION = 'analytics-v1';

export type MetricValueType = 'numeric' | 'text' | 'boolean';
export type MetricAggregationType =
  'sum' | 'avg' | 'min' | 'max' | 'count' | 'latest';

export interface MetricMapping {
  readonly column: string;
  readonly key: string;
  readonly label?: string;
  readonly description?: string;
  readonly valueType: MetricValueType;
  readonly unit: string;
  readonly aggregation: MetricAggregationType;
  readonly periodColumn?: string;
  readonly periodStartColumn?: string;
  readonly periodEndColumn?: string;
  readonly staticPeriodStart?: string;
  readonly staticPeriodEnd?: string;
  readonly staticPeriodLabel?: string;
  readonly dimensionColumns?: readonly string[];
}

export interface AnalyticsMapping {
  readonly regionColumn?: string;
  readonly regionCodeColumn?: string;
  readonly metrics: readonly MetricMapping[];
}

export interface AnalyticsPublicationInput {
  readonly organizationId: string;
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly summary: ParsedSourceSummary;
  readonly mapping: AnalyticsMapping;
}

export type AnalyticsTx = Prisma.TransactionClient;
