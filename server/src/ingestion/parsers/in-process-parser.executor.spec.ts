import { InProcessParserExecutor } from './in-process-parser.executor';
import type { ParserLimits } from './parser.types';

describe('InProcessParserExecutor', () => {
  let executor: InProcessParserExecutor;

  const defaultLimits: ParserLimits = {
    maxRows: 100,
    maxColumns: 20,
    maxCellChars: 1000,
    maxSampleRows: 10,
    maxGeojsonFeatures: 100,
    maxGeojsonCoordinates: 1000,
  };

  beforeEach(() => {
    executor = new InProcessParserExecutor();
  });

  it('should parse valid CSV buffer and return parsed source summary', async () => {
    const csvContent =
      'name,region,metric\nSectorA,Reg1,42.5\nSectorB,Reg2,88.1';
    const buffer = Buffer.from(csvContent, 'utf-8');

    const summary = await executor.execute(buffer, 'text/csv', defaultLimits);

    expect(summary.sourceKind).toBe('csv');
    expect(summary.rowCount).toBe(2);
    expect(summary.columnCount).toBe(3);
    expect(summary.columnKeys).toEqual(['name', 'region', 'metric']);
    expect(summary.sampleRows).toHaveLength(2);
    expect(summary.sampleRows[0]).toEqual({
      name: 'SectorA',
      region: 'Reg1',
      metric: '42.5',
    });
    expect(summary.validationRows[0]).toEqual({
      rowNumber: 2,
      values: { name: 'SectorA', region: 'Reg1', metric: '42.5' },
    });
    expect(summary.issues).toEqual([]);
  });

  it('should parse valid GeoJSON buffer and return parsed source summary', async () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [10, 20],
          },
          properties: {
            code: 'A1',
            label: 'Alpha Region',
          },
        },
      ],
    };
    const buffer = Buffer.from(JSON.stringify(geojson), 'utf-8');

    const summary = await executor.execute(
      buffer,
      'application/geo+json',
      defaultLimits,
    );

    expect(summary.sourceKind).toBe('geojson');
    expect(summary.rowCount).toBe(1);
    expect(summary.columnCount).toBe(3);
    expect(summary.columnKeys).toEqual(['code', 'label', 'geometry_type']);
    expect(summary.issues).toEqual([]);
  });

  it('should return unsupported media type error for unaccepted media types', async () => {
    const buffer = Buffer.from('unsupported content', 'utf-8');

    const summary = await executor.execute(
      buffer,
      'application/pdf',
      defaultLimits,
    );

    expect(summary.issues).toEqual([
      {
        severity: 'error',
        code: 'unsupported_media_type',
        message: 'Media type is not accepted.',
      },
    ]);
  });

  it('should forward and enforce limits on underlying parser', async () => {
    const csvContent = 'name,val\nA,1\nB,2\nC,3\nD,4\nE,5';
    const buffer = Buffer.from(csvContent, 'utf-8');

    const restrictedLimits: ParserLimits = {
      ...defaultLimits,
      maxRows: 2,
    };

    const summary = await executor.execute(
      buffer,
      'text/csv',
      restrictedLimits,
    );

    expect(summary.issues).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'row_limit_exceeded',
      }),
    );
  });
});
