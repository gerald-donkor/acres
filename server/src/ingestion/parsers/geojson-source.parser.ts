import { Injectable } from '@nestjs/common';
import type {
  ParsedSourceSummary,
  ParserIssue,
  ParserLimits,
  SourceParser,
} from './parser.types';
import {
  PARSER_MAX_BUFFER_BYTES,
  normalizeKey,
  safeCell,
} from './parser-utils';

type GeoJsonFeature = {
  type: 'Feature';
  properties?: Record<string, unknown> | null;
  geometry?: { type?: string; coordinates?: unknown } | null;
};

@Injectable()
export class GeojsonSourceParser implements SourceParser {
  constructor(private readonly limits: ParserLimits) {}

  inspect(buffer: Buffer): ParsedSourceSummary {
    const issues: ParserIssue[] = [];
    if (buffer.length > PARSER_MAX_BUFFER_BYTES) {
      return this.emptySummary([
        {
          severity: 'error',
          code: 'file_size_limit_exceeded',
          message: 'GeoJSON size exceeds the temporary parser limit.',
        },
      ]);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(buffer.toString('utf8'));
    } catch {
      return this.emptySummary([
        {
          severity: 'error',
          code: 'invalid_json',
          message: 'GeoJSON could not be parsed as JSON.',
        },
      ]);
    }

    const allFeatures = this.features(parsed, issues);
    const truncated = allFeatures.length > this.limits.maxGeojsonFeatures;
    const features = allFeatures.slice(0, this.limits.maxGeojsonFeatures);
    if (truncated) {
      issues.push({
        severity: 'error',
        code: 'feature_limit_exceeded',
        message:
          'GeoJSON feature count exceeds the temporary development limit.',
      });
    }

    const propertyKeys = new Set<string>();
    let coordinateCount = 0;
    for (const feature of features) {
      Object.keys(feature.properties ?? {}).forEach((key) =>
        propertyKeys.add(normalizeKey(key)),
      );
      if (!feature.geometry || typeof feature.geometry.type !== 'string') {
        issues.push({
          severity: 'error',
          code: 'missing_geometry',
          message: 'GeoJSON feature is missing geometry.',
        });
      } else {
        coordinateCount += countCoordinates(feature.geometry.coordinates);
      }
    }
    if (coordinateCount > this.limits.maxGeojsonCoordinates) {
      issues.push({
        severity: 'error',
        code: 'coordinate_limit_exceeded',
        message:
          'GeoJSON coordinate count exceeds the temporary development limit.',
      });
    }

    const keys = [...propertyKeys].sort();
    const validationRows = features.map((feature, featureIndex) => {
      const sample: Record<string, string | number | boolean | null> = {};
      for (const [rawKey, value] of Object.entries(feature.properties ?? {})) {
        sample[normalizeKey(rawKey)] = safeCell(
          value,
          this.limits.maxCellChars,
        );
      }
      sample.geometry_type = feature.geometry?.type ?? null;
      return { rowNumber: featureIndex + 1, values: sample };
    });
    const sampleRows = validationRows
      .slice(0, this.limits.maxSampleRows)
      .map((row) => row.values);

    return {
      sourceKind: 'geojson',
      rowCount: truncated
        ? this.limits.maxGeojsonFeatures + 1
        : features.length,
      columnCount: keys.length + 1,
      columnKeys: [...keys, 'geometry_type'],
      sampleRows,
      validationRows,
      issues,
      metadata: {
        srid: 4326,
        crsRule: 'WGS84/SRID 4326 unless a contradictory CRS is present',
        coordinateCount,
      },
    };
  }

  private features(value: unknown, issues: ParserIssue[]): GeoJsonFeature[] {
    if (!value || typeof value !== 'object') {
      issues.push({
        severity: 'error',
        code: 'invalid_geojson',
        message: 'GeoJSON root must be an object.',
      });
      return [];
    }
    const root = value as { type?: unknown; features?: unknown };
    if (root.type === 'FeatureCollection' && Array.isArray(root.features)) {
      return root.features.filter(isFeature);
    }
    if (root.type === 'Feature' && isFeature(root)) return [root];
    issues.push({
      severity: 'error',
      code: 'unsupported_geojson',
      message: 'GeoJSON must be a Feature or FeatureCollection.',
    });
    return [];
  }

  private emptySummary(issues: ParserIssue[]): ParsedSourceSummary {
    return {
      sourceKind: 'geojson',
      rowCount: 0,
      columnCount: 0,
      columnKeys: [],
      sampleRows: [],
      validationRows: [],
      issues,
      metadata: { srid: 4326 },
    };
  }
}

function isFeature(value: unknown): value is GeoJsonFeature {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'Feature'
  );
}

function countCoordinates(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  if (
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  ) {
    return 1;
  }
  let total = 0;
  for (const inner of value) total += countCoordinates(inner);
  return total;
}
