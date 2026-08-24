import { AnalyticsPublicationService } from './analytics-publication.service';
import type { AnalyticsTx } from './analytics.types';

describe('AnalyticsPublicationService', () => {
  const service = new AnalyticsPublicationService();

  it('validates mapped metric columns and stable metric keys', () => {
    const issues = service.validateMapping({
      summaryColumns: ['region', 'year', 'population'],
      mapping: {
        metrics: [
          {
            column: 'population',
            key: 'population',
            valueType: 'numeric',
            unit: 'people',
            aggregation: 'sum',
            periodColumn: 'year',
          },
          {
            column: 'missing',
            key: 'population',
            valueType: 'numeric',
            unit: '',
            aggregation: 'sum',
          },
          {
            column: 'population',
            key: 'Bad Key',
            valueType: 'text',
            unit: 'people',
            aggregation: 'sum',
          },
        ],
      },
    });

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'metric_key_duplicate',
        'metric_column_missing',
        'metric_unit_missing',
        'metric_key_invalid',
        'metric_aggregation_incompatible',
      ]),
    );
  });

  it('keys aggregate snapshots by dataset version', async () => {
    const { tx, metricAggregateUpsert } = createAnalyticsTx();

    await service.publish(tx, publicationInput('dataset-version-1', '10'));
    await service.publish(tx, publicationInput('dataset-version-2', '12'));

    expect(
      metricAggregateUpsert.mock.calls[0][0].where
        .organizationId_datasetVersionId_metricDefinitionId_regionId_periodStart_periodEnd_dimensionHash_aggregateType_calculationVersion
        .datasetVersionId,
    ).toBe('dataset-version-1');
    expect(
      metricAggregateUpsert.mock.calls[1][0].where
        .organizationId_datasetVersionId_metricDefinitionId_regionId_periodStart_periodEnd_dimensionHash_aggregateType_calculationVersion
        .datasetVersionId,
    ).toBe('dataset-version-2');
  });

  it('keeps invalid observations visible but excludes them from aggregates', async () => {
    const {
      tx,
      metricAggregateUpsert,
      metricAggregateLineageCreateMany,
      observationQualityCreateMany,
    } = createAnalyticsTx();

    await service.publish(tx, {
      ...publicationInput('dataset-version-1', '10'),
      summary: {
        ...publicationInput('dataset-version-1', '10').summary,
        validationRows: [
          {
            rowNumber: 1,
            values: { geoid: '001', year: '2026', population: '10' },
          },
          {
            rowNumber: 2,
            values: { geoid: '001', year: '2026', population: '' },
          },
        ],
      },
    });

    const aggregateCreate = metricAggregateUpsert.mock.calls[0][0].create;
    expect(Number(aggregateCreate.numericValue)).toBe(10);
    expect(aggregateCreate.observationCount).toBe(1);
    expect(aggregateCreate.qualitySummary).toMatchObject({ error: 1 });
    expect(metricAggregateLineageCreateMany.mock.calls[0][0].data).toHaveLength(
      1,
    );
    expect(observationQualityCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            observationId: 'observation-2',
            code: 'value_missing',
          }),
        ],
      }),
    );
  });

  it('preserves decimal strings without JavaScript number precision loss', async () => {
    const { tx, metricAggregateUpsert } = createAnalyticsTx();

    await service.publish(
      tx,
      publicationInput('dataset-version-1', '9007199254740993'),
    );

    expect(
      String(metricAggregateUpsert.mock.calls[0][0].create.numericValue),
    ).toBe('9007199254740993');
  });

  it('rejects unsafe raw number inputs before decimal storage', async () => {
    const { tx, observationQualityCreateMany, metricAggregateUpsert } =
      createAnalyticsTx();

    await service.publish(tx, {
      ...publicationInput('dataset-version-1', '10'),
      summary: {
        ...publicationInput('dataset-version-1', '10').summary,
        validationRows: [
          {
            rowNumber: 1,
            values: {
              geoid: '001',
              year: '2026',
              population: Number.MAX_SAFE_INTEGER + 2,
            },
          },
        ],
      },
    });

    expect(metricAggregateUpsert).not.toHaveBeenCalled();
    expect(observationQualityCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ code: 'value_invalid' })],
      }),
    );
  });

  it('marks rollover and ambiguous periods invalid', async () => {
    const { tx, observationQualityCreateMany, metricAggregateUpsert } =
      createAnalyticsTx();

    await service.publish(tx, {
      ...publicationInput('dataset-version-1', '10'),
      summary: {
        ...publicationInput('dataset-version-1', '10').summary,
        validationRows: [
          {
            rowNumber: 1,
            values: { geoid: '001', year: '2026-02-31', population: '10' },
          },
          {
            rowNumber: 2,
            values: { geoid: '001', year: '02/03/2026', population: '20' },
          },
        ],
      },
    });

    expect(metricAggregateUpsert).not.toHaveBeenCalled();
    expect(observationQualityCreateMany).toHaveBeenCalledTimes(2);
    expect(
      observationQualityCreateMany.mock.calls.map(([input]) => input.data),
    ).toEqual([
      [expect.objectContaining({ code: 'period_invalid' })],
      [expect.objectContaining({ code: 'period_invalid' })],
    ]);
  });

  it.each([
    ['avg', '15'],
    ['min', '10'],
    ['max', '20'],
    ['count', '2'],
    ['latest', '20'],
  ] as const)(
    'calculates %s aggregates deterministically',
    async (aggregation, expected) => {
      const { tx, metricAggregateUpsert } = createAnalyticsTx();

      await service.publish(
        tx,
        publicationInput('dataset-version-1', '10', {
          aggregation,
          rows: [
            { rowNumber: 1, population: '10' },
            { rowNumber: 2, population: '20' },
          ],
        }),
      );

      expect(
        String(metricAggregateUpsert.mock.calls[0][0].create.numericValue),
      ).toBe(expected);
    },
  );
});

function publicationInput(
  datasetVersionId: string,
  population: string,
  options: {
    readonly aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'latest';
    readonly rows?: Array<{
      readonly rowNumber: number;
      readonly population: string;
    }>;
  } = {},
) {
  return {
    organizationId: 'organization-1',
    datasetId: 'dataset-1',
    datasetVersionId,
    mapping: {
      regionCodeColumn: 'geoid',
      metrics: [
        {
          column: 'population',
          key: 'population',
          label: 'Population',
          valueType: 'numeric' as const,
          unit: 'people',
          aggregation: options.aggregation ?? ('sum' as const),
          periodColumn: 'year',
        },
      ],
    },
    summary: {
      sourceKind: 'csv' as const,
      rowCount: 1,
      columnCount: 3,
      columnKeys: ['geoid', 'year', 'population'],
      sampleRows: [],
      validationRows: (options.rows ?? [{ rowNumber: 1, population }]).map(
        (row) => ({
          rowNumber: row.rowNumber,
          values: { geoid: '001', year: '2026', population: row.population },
        }),
      ),
      issues: [],
      metadata: {},
    },
  };
}

function createAnalyticsTx() {
  const metricId = 'metric-1';
  const observationQualityCreateMany = jest
    .fn<Promise<{ count: number }>, [{ data: unknown[] }]>()
    .mockResolvedValue({ count: 1 });
  const metricAggregateUpsert = jest.fn<
    Promise<{ id: string }>,
    [
      {
        where: {
          organizationId_datasetVersionId_metricDefinitionId_regionId_periodStart_periodEnd_dimensionHash_aggregateType_calculationVersion: {
            datasetVersionId: string;
          };
        };
        create: {
          datasetVersionId: string;
          numericValue?: unknown;
          observationCount?: number;
          qualitySummary?: unknown;
        };
      },
    ]
  >((input) =>
    Promise.resolve({ id: `aggregate-${input.create.datasetVersionId}` }),
  );
  const metricAggregateLineageCreateMany = jest
    .fn<Promise<{ count: number }>, [{ data: unknown[] }]>()
    .mockResolvedValue({ count: 1 });
  const tx = {
    regionCode: {
      findMany: jest.fn().mockResolvedValue([{ regionId: 'region-1' }]),
    },
    regionAlias: { findMany: jest.fn().mockResolvedValue([]) },
    metricDefinition: {
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: metricId }),
    },
    metricObservation: {
      upsert: jest.fn((input: { create: { sourceRowNumber: number } }) =>
        Promise.resolve({ id: `observation-${input.create.sourceRowNumber}` }),
      ),
    },
    observationQuality: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: observationQualityCreateMany,
    },
    metricAggregate: {
      upsert: metricAggregateUpsert,
    },
    metricAggregateLineage: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: metricAggregateLineageCreateMany,
    },
  } as unknown as AnalyticsTx;
  return {
    tx,
    observationQualityCreateMany,
    metricAggregateUpsert,
    metricAggregateLineageCreateMany,
  };
}
