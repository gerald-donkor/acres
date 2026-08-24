import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  ANALYTICS_CALCULATION_VERSION,
  type AnalyticsPublicationInput,
  type AnalyticsTx,
  type MetricAggregationType,
  type MetricMapping,
} from './analytics.types';
import { dimensionHash, stableDimensions } from './mapping';

interface ParsedObservation {
  readonly metric: MetricMapping;
  readonly rowNumber: number;
  readonly regionId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly periodLabel: string | null;
  readonly dimensions: Record<string, string>;
  readonly dimensionHash: string;
  readonly value: {
    readonly numericValue?: Prisma.Decimal | null;
    readonly textValue?: string | null;
    readonly booleanValue?: boolean | null;
  };
  readonly quality: Array<{
    readonly severity: 'info' | 'warning' | 'error';
    readonly state:
      | 'valid'
      | 'coerced'
      | 'missing'
      | 'invalid'
      | 'duplicate'
      | 'low_confidence';
    readonly code: string;
    readonly message: string;
    readonly details?: Prisma.InputJsonValue;
  }>;
}

@Injectable()
export class AnalyticsPublicationService {
  validateMapping(input: {
    readonly summaryColumns: readonly string[];
    readonly mapping: { readonly metrics: readonly MetricMapping[] };
  }): Array<{
    readonly severity: 'warning' | 'error';
    readonly code: string;
    readonly message: string;
    readonly columnKey?: string;
    readonly details?: Record<string, unknown>;
  }> {
    const issues: Array<{
      readonly severity: 'warning' | 'error';
      readonly code: string;
      readonly message: string;
      readonly columnKey?: string;
      readonly details?: Record<string, unknown>;
    }> = [];
    const columns = new Set(input.summaryColumns);
    const keys = new Set<string>();
    for (const metric of input.mapping.metrics) {
      if (keys.has(metric.key)) {
        issues.push({
          severity: 'error',
          code: 'metric_key_duplicate',
          message: 'Metric keys must be unique within one mapping.',
          columnKey: metric.column,
          details: { key: metric.key },
        });
      }
      keys.add(metric.key);
      for (const column of requiredColumns(metric)) {
        if (!columns.has(column)) {
          issues.push({
            severity: 'error',
            code: 'metric_column_missing',
            message: 'Mapped metric column is not present in the source.',
            columnKey: column,
            details: { key: metric.key },
          });
        }
      }
      if (!/^[a-z][a-z0-9_]{1,63}$/.test(metric.key)) {
        issues.push({
          severity: 'error',
          code: 'metric_key_invalid',
          message: 'Metric keys must be lower-case snake identifiers.',
          columnKey: metric.column,
          details: { key: metric.key },
        });
      }
      if (!metric.unit.trim()) {
        issues.push({
          severity: 'error',
          code: 'metric_unit_missing',
          message: 'Mapped metrics must define an explicit unit.',
          columnKey: metric.column,
        });
      }
      if (
        metric.valueType !== 'numeric' &&
        !['count', 'latest'].includes(metric.aggregation)
      ) {
        issues.push({
          severity: 'error',
          code: 'metric_aggregation_incompatible',
          message: 'Text and boolean metrics only support count or latest.',
          columnKey: metric.column,
          details: { key: metric.key, aggregation: metric.aggregation },
        });
      }
    }
    return issues;
  }

  async publish(
    tx: AnalyticsTx,
    input: AnalyticsPublicationInput,
  ): Promise<void> {
    if (input.mapping.metrics.length === 0) return;
    const parsed = await this.parseObservations(tx, input);
    const metricDefinitions = await this.upsertMetricDefinitions(tx, input);
    const observations = [];

    for (const observation of parsed) {
      const metricDefinitionId = metricDefinitions.get(observation.metric.key);
      if (metricDefinitionId === undefined) continue;
      const stored = await tx.metricObservation.upsert({
        where: {
          organizationId_datasetVersionId_metricDefinitionId_regionId_periodStart_periodEnd_dimensionHash_sourceRowNumber:
            {
              organizationId: input.organizationId,
              datasetVersionId: input.datasetVersionId,
              metricDefinitionId,
              regionId: observation.regionId,
              periodStart: observation.periodStart,
              periodEnd: observation.periodEnd,
              dimensionHash: observation.dimensionHash,
              sourceRowNumber: observation.rowNumber,
            },
        },
        update: {},
        create: {
          organizationId: input.organizationId,
          datasetVersionId: input.datasetVersionId,
          regionId: observation.regionId,
          metricDefinitionId,
          periodStart: observation.periodStart,
          periodEnd: observation.periodEnd,
          periodLabel: observation.periodLabel,
          ...observation.value,
          unit: observation.metric.unit.trim(),
          dimensionHash: observation.dimensionHash,
          dimensions: observation.dimensions,
          sourceRowNumber: observation.rowNumber,
          sourceReference: { sourceRowNumber: observation.rowNumber },
        },
      });
      observations.push({
        ...observation,
        id: stored.id,
        metricDefinitionId,
      });
      await tx.observationQuality.deleteMany({
        where: {
          organizationId: input.organizationId,
          observationId: stored.id,
        },
      });
      if (observation.quality.length > 0) {
        await tx.observationQuality.createMany({
          data: observation.quality.map((quality) => ({
            organizationId: input.organizationId,
            observationId: stored.id,
            severity: quality.severity,
            state: quality.state,
            code: quality.code,
            message: quality.message,
            details: quality.details,
          })),
        });
      }
    }

    await this.rebuildAggregates(tx, input, observations);
  }

  private async parseObservations(
    tx: AnalyticsTx,
    input: AnalyticsPublicationInput,
  ): Promise<ParsedObservation[]> {
    const regionColumn =
      input.mapping.regionCodeColumn ?? input.mapping.regionColumn ?? '';
    const output: ParsedObservation[] = [];
    for (const row of input.summary.validationRows) {
      const regionValue = row.values[regionColumn];
      const regionId =
        typeof regionValue === 'string'
          ? await this.resolveRegion(tx, regionValue)
          : null;
      if (regionId === null) continue;
      for (const metric of input.mapping.metrics) {
        output.push(this.parseObservation(row, regionId, metric));
      }
    }
    return output;
  }

  private parseObservation(
    row: {
      readonly rowNumber: number;
      readonly values: Record<string, string | number | boolean | null>;
    },
    regionId: string,
    metric: MetricMapping,
  ): ParsedObservation {
    const dimensions = stableDimensions(row.values, metric.dimensionColumns);
    const period = parsePeriod(row.values, metric);
    const value = parseValue(row.values[metric.column], metric);
    return {
      metric,
      rowNumber: row.rowNumber,
      regionId,
      periodStart: period.start,
      periodEnd: period.end,
      periodLabel: period.label,
      dimensions,
      dimensionHash: dimensionHash(dimensions),
      value: value.value,
      quality: [...period.quality, ...value.quality],
    };
  }

  private async upsertMetricDefinitions(
    tx: AnalyticsTx,
    input: AnalyticsPublicationInput,
  ): Promise<Map<string, string>> {
    const definitions = new Map<string, string>();
    for (const metric of input.mapping.metrics) {
      const existing = await tx.metricDefinition.findFirst({
        where: { organizationId: input.organizationId, key: metric.key },
      });
      if (
        existing !== null &&
        (existing.valueType !== metric.valueType ||
          existing.canonicalUnit !== metric.unit.trim() ||
          existing.allowedAggregation !== metric.aggregation)
      ) {
        throw new Error(`Metric mapping is incompatible with ${metric.key}.`);
      }
      const stored = await tx.metricDefinition.upsert({
        where: {
          organizationId_key: {
            organizationId: input.organizationId,
            key: metric.key,
          },
        },
        update: {
          label: metric.label?.trim() || metric.key,
          description: metric.description?.trim(),
          datasetId: input.datasetId,
          status: 'active',
        },
        create: {
          organizationId: input.organizationId,
          datasetId: input.datasetId,
          key: metric.key,
          label: metric.label?.trim() || metric.key,
          description: metric.description?.trim(),
          valueType: metric.valueType,
          canonicalUnit: metric.unit.trim(),
          allowedAggregation: metric.aggregation,
          calculationVersion: ANALYTICS_CALCULATION_VERSION,
          status: 'active',
        },
      });
      definitions.set(metric.key, stored.id);
    }
    return definitions;
  }

  private async rebuildAggregates(
    tx: AnalyticsTx,
    input: AnalyticsPublicationInput,
    observations: Array<
      ParsedObservation & { id: string; metricDefinitionId: string }
    >,
  ): Promise<void> {
    const groups = new Map<string, typeof observations>();
    for (const observation of observations) {
      const key = [
        observation.metricDefinitionId,
        observation.regionId,
        observation.periodStart.toISOString(),
        observation.periodEnd.toISOString(),
        observation.dimensionHash,
        observation.metric.aggregation,
      ].join('|');
      groups.set(key, [...(groups.get(key) ?? []), observation]);
    }

    for (const group of groups.values()) {
      const first = group[0];
      const validGroup = group.filter(
        (observation) =>
          !observation.quality.some((quality) => quality.severity === 'error'),
      );
      if (validGroup.length === 0) continue;
      const aggregate = calculateAggregate(
        first.metric.aggregation,
        validGroup,
      );
      const stored = await tx.metricAggregate.upsert({
        where: {
          organizationId_datasetVersionId_metricDefinitionId_regionId_periodStart_periodEnd_dimensionHash_aggregateType_calculationVersion:
            {
              organizationId: input.organizationId,
              datasetVersionId: input.datasetVersionId,
              metricDefinitionId: first.metricDefinitionId,
              regionId: first.regionId,
              periodStart: first.periodStart,
              periodEnd: first.periodEnd,
              dimensionHash: first.dimensionHash,
              aggregateType: first.metric.aggregation,
              calculationVersion: ANALYTICS_CALCULATION_VERSION,
            },
        },
        update: {
          datasetVersionId: input.datasetVersionId,
          ...aggregate.value,
          observationCount: validGroup.length,
          qualitySummary: qualitySummary(group),
          datasetVersionIds: [input.datasetVersionId],
        },
        create: {
          organizationId: input.organizationId,
          datasetVersionId: input.datasetVersionId,
          metricDefinitionId: first.metricDefinitionId,
          regionId: first.regionId,
          periodStart: first.periodStart,
          periodEnd: first.periodEnd,
          dimensionHash: first.dimensionHash,
          dimensions: first.dimensions,
          aggregateType: first.metric.aggregation,
          ...aggregate.value,
          unit: first.metric.unit.trim(),
          calculationVersion: ANALYTICS_CALCULATION_VERSION,
          observationCount: validGroup.length,
          qualitySummary: qualitySummary(group),
          datasetVersionIds: [input.datasetVersionId],
        },
      });
      await tx.metricAggregateLineage.deleteMany({
        where: { organizationId: input.organizationId, aggregateId: stored.id },
      });
      await tx.metricAggregateLineage.createMany({
        data: validGroup.map((observation) => ({
          organizationId: input.organizationId,
          aggregateId: stored.id,
          observationId: observation.id,
          datasetVersionId: input.datasetVersionId,
        })),
        skipDuplicates: true,
      });
    }
  }

  private async resolveRegion(
    tx: AnalyticsTx,
    value: string,
  ): Promise<string | null> {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    const [codes, aliases] = await Promise.all([
      tx.regionCode.findMany({
        where: { normalized },
        select: { regionId: true },
        distinct: ['regionId'],
        take: 2,
      }),
      tx.regionAlias.findMany({
        where: { normalized },
        select: { regionId: true },
        distinct: ['regionId'],
        take: 2,
      }),
    ]);
    const matches = [
      ...new Set([...codes, ...aliases].map((row) => row.regionId)),
    ];
    return matches.length === 1 ? matches[0] : null;
  }
}

function requiredColumns(metric: MetricMapping): string[] {
  return [
    metric.column,
    metric.periodColumn,
    metric.periodStartColumn,
    metric.periodEndColumn,
    ...(metric.dimensionColumns ?? []),
  ].filter((column): column is string => typeof column === 'string');
}

function parsePeriod(
  row: Record<string, string | number | boolean | null>,
  metric: MetricMapping,
) {
  const startRaw =
    metric.staticPeriodStart ??
    (metric.periodStartColumn ? row[metric.periodStartColumn] : undefined) ??
    (metric.periodColumn ? row[metric.periodColumn] : undefined);
  const endRaw =
    metric.staticPeriodEnd ??
    (metric.periodEndColumn ? row[metric.periodEndColumn] : undefined) ??
    startRaw;
  const start = parseDate(startRaw);
  const end = parseDate(endRaw);
  if (start !== null && end !== null && end >= start) {
    return {
      start,
      end,
      label: metric.staticPeriodLabel ?? String(startRaw),
      quality: [],
    };
  }
  const fallback = new Date('1970-01-01T00:00:00.000Z');
  return {
    start: fallback,
    end: fallback,
    label: 'invalid',
    quality: [
      {
        severity: 'error' as const,
        state: 'invalid' as const,
        code: 'period_invalid',
        message: 'Mapped period could not be parsed deterministically.',
        details: { value: String(startRaw ?? '') },
      },
    ],
  };
}

function parseValue(
  raw: string | number | boolean | null,
  metric: MetricMapping,
): Pick<ParsedObservation, 'value' | 'quality'> {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return invalidValue(metric, 'missing', 'Metric value is blank.');
  }
  if (metric.valueType === 'numeric') {
    const value = parseDecimal(raw);
    if (value === null) {
      return invalidValue(
        metric,
        'invalid',
        'Numeric metric value could not be parsed.',
      );
    }
    return {
      value: { numericValue: value },
      quality: [],
    };
  }
  if (metric.valueType === 'boolean') {
    const normalized = String(raw).trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return { value: { booleanValue: true }, quality: [] };
    }
    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return { value: { booleanValue: false }, quality: [] };
    }
    return invalidValue(
      metric,
      'invalid',
      'Boolean metric value could not be parsed.',
    );
  }
  return { value: { textValue: String(raw).trim() }, quality: [] };
}

function invalidValue(
  metric: MetricMapping,
  state: 'missing' | 'invalid',
  message: string,
): Pick<ParsedObservation, 'value' | 'quality'> {
  if (metric.valueType === 'numeric') {
    return {
      value: { numericValue: new Prisma.Decimal(0) },
      quality: [{ severity: 'error', state, code: `value_${state}`, message }],
    };
  }
  if (metric.valueType === 'boolean') {
    return {
      value: { booleanValue: false },
      quality: [{ severity: 'error', state, code: `value_${state}`, message }],
    };
  }
  return {
    value: { textValue: '' },
    quality: [{ severity: 'error', state, code: `value_${state}`, message }],
  };
}

function calculateAggregate(
  aggregation: MetricAggregationType,
  observations: Array<ParsedObservation & { id: string }>,
) {
  if (aggregation === 'latest') {
    const latest = observations[observations.length - 1];
    return {
      value: {
        textValue: latest.value.textValue,
        booleanValue: latest.value.booleanValue,
        numericValue: latest.value.numericValue,
      },
    };
  }
  const numericValues = observations
    .map((observation) => observation.value.numericValue)
    .filter(
      (value): value is Prisma.Decimal => value !== null && value !== undefined,
    );
  if (aggregation === 'count') {
    return { value: { numericValue: new Prisma.Decimal(observations.length) } };
  }
  if (numericValues.length > 0) {
    if (aggregation === 'avg') {
      const total = numericValues.reduce(
        (sum, value) => sum.add(value),
        new Prisma.Decimal(0),
      );
      return { value: { numericValue: total.div(numericValues.length) } };
    }
    if (aggregation === 'min') {
      return {
        value: {
          numericValue: numericValues.reduce((min, value) =>
            value.lessThan(min) ? value : min,
          ),
        },
      };
    }
    if (aggregation === 'max') {
      return {
        value: {
          numericValue: numericValues.reduce((max, value) =>
            value.greaterThan(max) ? value : max,
          ),
        },
      };
    }
    const total = numericValues.reduce(
      (sum, value) => sum.add(value),
      new Prisma.Decimal(0),
    );
    return { value: { numericValue: total } };
  }
  return { value: { numericValue: new Prisma.Decimal(observations.length) } };
}

function parseDecimal(value: string | number | boolean): Prisma.Decimal | null {
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) ||
      (Number.isInteger(value) && !Number.isSafeInteger(value)))
  ) {
    return null;
  }
  const text =
    typeof value === 'number' ? value.toString() : String(value).trim();
  if (!/^-?(?:\d+|\d*\.\d+)$/.test(text)) return null;
  const unsigned = text.startsWith('-') ? text.slice(1) : text;
  const [integerPart = '', fractionalPart = ''] = unsigned.split('.');
  const significantInteger = integerPart.replace(/^0+/, '');
  if (significantInteger.length > 20 || fractionalPart.length > 6) return null;
  try {
    return new Prisma.Decimal(text);
  } catch {
    return null;
  }
}

function qualitySummary(observations: readonly ParsedObservation[]) {
  return observations.reduce(
    (summary, observation) => {
      for (const quality of observation.quality) {
        summary[quality.severity] += 1;
      }
      return summary;
    },
    { info: 0, warning: 0, error: 0 },
  );
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (/^\d{4}$/.test(text)) return new Date(`${text}-01-01T00:00:00.000Z`);
  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/,
  );
  if (match === null) return null;
  const dateOnly = match[0].length === 10;
  const date = new Date(dateOnly ? `${text}T00:00:00.000Z` : text);
  if (!Number.isFinite(date.getTime())) return null;
  const [, year, month, day] = match;
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return date;
}
