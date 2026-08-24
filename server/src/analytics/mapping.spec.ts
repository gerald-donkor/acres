import {
  dimensionHash,
  malformedMetricMappingIssues,
  parseAnalyticsMapping,
} from './mapping';

describe('analytics mapping helpers', () => {
  it('parses explicit metric mappings without accepting malformed entries', () => {
    const mapping = parseAnalyticsMapping({
      regionCodeColumn: 'geoid',
      metrics: [
        {
          column: 'population',
          key: 'population',
          label: 'Population',
          valueType: 'numeric',
          unit: 'people',
          aggregation: 'sum',
          periodColumn: 'year',
        },
        { column: 'bad', key: 'bad' },
      ],
    });

    expect(mapping.regionCodeColumn).toBe('geoid');
    expect(mapping.metrics).toHaveLength(1);
    expect(mapping.metrics[0]).toMatchObject({
      key: 'population',
      valueType: 'numeric',
      aggregation: 'sum',
    });
  });

  it('hashes dimensions deterministically regardless of key order', () => {
    expect(dimensionHash({ segment: 'all', cohort: '2026' })).toBe(
      dimensionHash({ cohort: '2026', segment: 'all' }),
    );
    expect(dimensionHash({ segment: 'all' })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports malformed metric entries before parsing filters them', () => {
    const issues = malformedMetricMappingIssues({
      metrics: [
        {
          column: 'value',
          key: 'metric',
          aggregation: 'sum',
          periodColumn: 2026,
          dimensionColumns: ['segment', false],
        },
      ],
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'metric_mapping_invalid',
          details: { index: 0, field: 'valueType' },
        }),
        expect.objectContaining({
          code: 'metric_mapping_invalid',
          details: { index: 0, field: 'unit' },
        }),
        expect.objectContaining({
          code: 'metric_mapping_invalid',
          details: { index: 0, field: 'periodColumn' },
        }),
        expect.objectContaining({
          code: 'metric_mapping_invalid',
          details: { index: 0, field: 'dimensionColumns' },
        }),
      ]),
    );
  });
});
