import { createHash } from 'node:crypto';
import type {
  AnalyticsMapping,
  MetricAggregationType,
  MetricMapping,
  MetricValueType,
} from './analytics.types';

const valueTypes = new Set<MetricValueType>(['numeric', 'text', 'boolean']);
const aggregations = new Set<MetricAggregationType>([
  'sum',
  'avg',
  'min',
  'max',
  'count',
  'latest',
]);

export function parseAnalyticsMapping(value: unknown): AnalyticsMapping {
  if (!value || typeof value !== 'object') return { metrics: [] };
  const raw = value as Record<string, unknown>;
  const metrics = Array.isArray(raw.metrics)
    ? raw.metrics.map(parseMetricMapping).filter((metric) => metric !== null)
    : [];
  return {
    regionColumn:
      typeof raw.regionColumn === 'string' ? raw.regionColumn : undefined,
    regionCodeColumn:
      typeof raw.regionCodeColumn === 'string'
        ? raw.regionCodeColumn
        : undefined,
    metrics,
  };
}

export function malformedMetricMappingIssues(value: unknown): Array<{
  readonly severity: 'error';
  readonly code: string;
  readonly message: string;
  readonly columnKey?: string;
  readonly details?: Record<string, unknown>;
}> {
  if (!value || typeof value !== 'object') return [];
  const raw = value as Record<string, unknown>;
  if (raw.metrics === undefined) return [];
  if (!Array.isArray(raw.metrics)) {
    return [
      {
        severity: 'error',
        code: 'metric_mapping_invalid',
        message: 'Metric mappings must be provided as an array.',
      },
    ];
  }
  return raw.metrics.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return [
        {
          severity: 'error' as const,
          code: 'metric_mapping_invalid',
          message: 'Metric mapping entries must be objects.',
          details: { index },
        },
      ];
    }
    const metric = entry as Record<string, unknown>;
    const issues: Array<{
      readonly severity: 'error';
      readonly code: string;
      readonly message: string;
      readonly columnKey?: string;
      readonly details?: Record<string, unknown>;
    }> = [];
    if (typeof metric.column !== 'string') {
      issues.push(invalidMetricIssue(index, 'column'));
    }
    if (typeof metric.key !== 'string') {
      issues.push(invalidMetricIssue(index, 'key'));
    }
    if (
      typeof metric.valueType !== 'string' ||
      !valueTypes.has(metric.valueType as MetricValueType)
    ) {
      issues.push(invalidMetricIssue(index, 'valueType'));
    }
    if (typeof metric.unit !== 'string') {
      issues.push(invalidMetricIssue(index, 'unit'));
    }
    if (
      typeof metric.aggregation !== 'string' ||
      !aggregations.has(metric.aggregation as MetricAggregationType)
    ) {
      issues.push(invalidMetricIssue(index, 'aggregation'));
    }
    for (const field of [
      'periodColumn',
      'periodStartColumn',
      'periodEndColumn',
      'staticPeriodStart',
      'staticPeriodEnd',
      'staticPeriodLabel',
    ]) {
      if (metric[field] !== undefined && typeof metric[field] !== 'string') {
        issues.push(invalidMetricIssue(index, field));
      }
    }
    if (
      metric.dimensionColumns !== undefined &&
      (!Array.isArray(metric.dimensionColumns) ||
        metric.dimensionColumns.some((column) => typeof column !== 'string'))
    ) {
      issues.push(invalidMetricIssue(index, 'dimensionColumns'));
    }
    return issues;
  });
}

export function dimensionHash(dimensions: Record<string, string>): string {
  return createHash('sha256')
    .update(JSON.stringify(sortObject(dimensions)))
    .digest('hex');
}

export function stableDimensions(
  row: Record<string, string | number | boolean | null>,
  columns: readonly string[] | undefined,
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const column of columns ?? []) {
    const value = row[column];
    output[column] =
      value === null || value === undefined ? '' : String(value).trim();
  }
  return sortObject(output);
}

function parseMetricMapping(value: unknown): MetricMapping | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.column !== 'string' ||
    typeof raw.key !== 'string' ||
    typeof raw.valueType !== 'string' ||
    !valueTypes.has(raw.valueType as MetricValueType) ||
    typeof raw.unit !== 'string' ||
    typeof raw.aggregation !== 'string' ||
    !aggregations.has(raw.aggregation as MetricAggregationType)
  ) {
    return null;
  }
  return {
    column: raw.column,
    key: raw.key,
    label: typeof raw.label === 'string' ? raw.label : undefined,
    description:
      typeof raw.description === 'string' ? raw.description : undefined,
    valueType: raw.valueType as MetricValueType,
    unit: raw.unit,
    aggregation: raw.aggregation as MetricAggregationType,
    periodColumn:
      typeof raw.periodColumn === 'string' ? raw.periodColumn : undefined,
    periodStartColumn:
      typeof raw.periodStartColumn === 'string'
        ? raw.periodStartColumn
        : undefined,
    periodEndColumn:
      typeof raw.periodEndColumn === 'string' ? raw.periodEndColumn : undefined,
    staticPeriodStart:
      typeof raw.staticPeriodStart === 'string'
        ? raw.staticPeriodStart
        : undefined,
    staticPeriodEnd:
      typeof raw.staticPeriodEnd === 'string' ? raw.staticPeriodEnd : undefined,
    staticPeriodLabel:
      typeof raw.staticPeriodLabel === 'string'
        ? raw.staticPeriodLabel
        : undefined,
    dimensionColumns: Array.isArray(raw.dimensionColumns)
      ? raw.dimensionColumns.filter(
          (column): column is string => typeof column === 'string',
        )
      : undefined,
  };
}

function invalidMetricIssue(index: number, field: string) {
  return {
    severity: 'error' as const,
    code: 'metric_mapping_invalid',
    message: 'Metric mapping entry is missing a required valid field.',
    details: { index, field },
  };
}

function sortObject(input: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).sort(([a], [b]) => a.localeCompare(b)),
  );
}
