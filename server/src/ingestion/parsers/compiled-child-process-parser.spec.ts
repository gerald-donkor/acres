import * as fs from 'node:fs';
import * as path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { ChildProcessParserExecutor } from './child-process-parser.executor';
import type { ParserLimits } from './parser.types';

const limits: ParserLimits = {
  maxRows: 100,
  maxColumns: 20,
  maxCellChars: 200,
  maxSampleRows: 5,
  maxGeojsonFeatures: 50,
  maxGeojsonCoordinates: 500,
};

function minimalXlsx(): Buffer {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Region</t></is></c><c r="B1" t="inlineStr"><is><t>Value</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>US-CA</t></is></c><c r="B2" t="inlineStr"><is><t>42</t></is></c></row></sheetData></worksheet>`,
    ),
  };
  return Buffer.from(zipSync(files));
}

function minimalGeoJson(): Buffer {
  return Buffer.from(
    JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Region One', code: 'R1' },
          geometry: { type: 'Point', coordinates: [-122.4, 37.7] },
        },
        {
          type: 'Feature',
          properties: { name: 'Region Two', code: 'R2' },
          geometry: { type: 'Point', coordinates: [-118.2, 34.0] },
        },
      ],
    }),
  );
}

describe('Compiled Child Process Parser Boundary', () => {
  const entrypointPath = path.resolve(
    __dirname,
    '../../../dist/ingestion/parsers/parser-child.entry.js',
  );

  let executor: ChildProcessParserExecutor;

  beforeAll(() => {
    // Verify the compiled artifact exists before running tests
    if (!fs.existsSync(entrypointPath)) {
      throw new Error(
        `Compiled artifact not found at ${entrypointPath}. Run "npm run build" first.`,
      );
    }
    // Set a sentinel credential in parent environment
    process.env.SENTINEL_PARENT_CREDENTIAL = 'super-secret-parent-token-12345';
  });

  afterAll(() => {
    delete process.env.SENTINEL_PARENT_CREDENTIAL;
    executor?.onApplicationShutdown();
  });

  beforeEach(() => {
    executor = new ChildProcessParserExecutor({
      timeoutMs: 10000,
      maxOldSpaceMb: 192,
      nodeEnv: 'test',
      entrypointPath,
    });
  });

  it('executes benign CSV through the compiled child entrypoint', async () => {
    const csvBuffer = Buffer.from('Region,Value\nUS-CA,100\nUS-NY,200\n');
    const summary = await executor.execute(csvBuffer, 'text/csv', limits);

    expect(summary.sourceKind).toBe('csv');
    expect(summary.rowCount).toBe(2);
    expect(summary.columnCount).toBe(2);
    expect(summary.columnKeys).toEqual(['region', 'value']);
    expect(summary.sampleRows).toEqual([
      { region: 'US-CA', value: '100' },
      { region: 'US-NY', value: '200' },
    ]);
    expect(summary.issues).toEqual([]);
  });

  it('executes benign XLSX through the compiled child entrypoint', async () => {
    const xlsxBuffer = minimalXlsx();
    const summary = await executor.execute(
      xlsxBuffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      limits,
    );

    expect(summary.sourceKind).toBe('xlsx');
    expect(summary.rowCount).toBe(1);
    expect(summary.columnKeys).toEqual(['region', 'value']);
    expect(summary.sampleRows).toEqual([{ region: 'US-CA', value: '42' }]);
    expect(summary.issues).toEqual([]);
  });

  it('executes benign GeoJSON through the compiled child entrypoint', async () => {
    const geojsonBuffer = minimalGeoJson();
    const summary = await executor.execute(
      geojsonBuffer,
      'application/geo+json',
      limits,
    );

    expect(summary.sourceKind).toBe('geojson');
    expect(summary.rowCount).toBe(2);
    expect(summary.columnKeys).toContain('code');
    expect(summary.columnKeys).toContain('name');
    expect(summary.columnKeys).toContain('geometry_type');
    expect(summary.issues).toEqual([]);
  });

  it('handles child timeout deterministically with watchdog', async () => {
    const fastTimeoutExecutor = new ChildProcessParserExecutor({
      timeoutMs: 1, // Will trigger timeout before execution
      maxOldSpaceMb: 192,
      nodeEnv: 'test',
      entrypointPath,
    });

    const csvBuffer = Buffer.from('Region,Value\nUS-CA,100\n');
    const summary = await fastTimeoutExecutor.execute(
      csvBuffer,
      'text/csv',
      limits,
    );

    expect(summary.issues).toEqual([
      expect.objectContaining({
        code: 'parser_execution_timed_out',
        severity: 'error',
      }),
    ]);
  });
});
