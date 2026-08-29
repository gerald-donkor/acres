import { strToU8, zipSync } from 'fflate';
import { CsvSourceParser } from './csv-source.parser';
import { GeojsonSourceParser } from './geojson-source.parser';
import type { ParserLimits } from './parser.types';
import { XlsxSourceParser } from './xlsx-source.parser';

const limits: ParserLimits = {
  maxRows: 10,
  maxColumns: 5,
  maxCellChars: 40,
  maxSampleRows: 3,
  maxGeojsonFeatures: 3,
  maxGeojsonCoordinates: 20,
};

describe('source parsers', () => {
  it('summarizes CSV rows and treats formulas as data', () => {
    const parser = new CsvSourceParser(limits);
    const summary = parser.inspect(
      Buffer.from('Region,Value\nA1,12\nB2,"=SUM(1,2)"\n'),
    );

    expect(summary).toMatchObject({
      sourceKind: 'csv',
      rowCount: 2,
      columnCount: 2,
      columnKeys: ['region', 'value'],
    });
    expect(summary.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'formula_as_data' }),
      ]),
    );
  });

  it('keeps validation rows beyond preview samples', () => {
    const parser = new CsvSourceParser({
      ...limits,
      maxRows: 6,
      maxSampleRows: 2,
    });
    const summary = parser.inspect(
      Buffer.from('Region,Value\nA1,1\nA2,2\nA3,3\nA4,4\n'),
    );

    expect(summary.sampleRows).toHaveLength(2);
    expect(summary.validationRows).toHaveLength(4);
    expect(summary.validationRows[3]).toMatchObject({
      rowNumber: 5,
      values: { region: 'A4', value: '4' },
    });
  });

  it('bounds GeoJSON feature and coordinate counts', () => {
    const parser = new GeojsonSourceParser({
      ...limits,
      maxGeojsonFeatures: 1,
      maxGeojsonCoordinates: 0,
    });
    const summary = parser.inspect(
      Buffer.from(
        JSON.stringify({
          type: 'FeatureCollection',
          features: [point('Ada', [0, 0]), point('Grace', [1, 1])],
        }),
      ),
    );

    expect(summary.sourceKind).toBe('geojson');
    expect(summary.rowCount).toBe(2);
    expect(summary.validationRows).toHaveLength(1);
    expect(summary.columnKeys).toContain('name');
    expect(summary.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'feature_limit_exceeded',
        'coordinate_limit_exceeded',
      ]),
    );
  });

  it('summarizes the first XLSX sheet without evaluating formulas', async () => {
    const parser = new XlsxSourceParser(limits);
    const summary = await parser.inspect(minimalXlsx());

    expect(summary).toMatchObject({
      sourceKind: 'xlsx',
      rowCount: 1,
      columnKeys: ['region', 'value'],
      sampleRows: [{ region: 'A1', value: '=1+1' }],
    });
    expect(summary.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'formula_as_data' }),
      ]),
    );
  });

  it('rejects macro-enabled XLSX workbooks containing vbaProject.bin', async () => {
    const parser = new XlsxSourceParser(limits);
    const summary = await parser.inspect(macroXlsx());

    expect(summary).toMatchObject({
      sourceKind: 'xlsx',
      rowCount: 0,
      columnCount: 0,
      columnKeys: [],
      sampleRows: [],
      validationRows: [],
    });
    expect(summary.issues).toHaveLength(1);
    expect(summary.issues[0]).toEqual({
      severity: 'error',
      code: 'macro_enabled_workbook_unsupported',
      message: 'Macro-enabled workbooks are not supported.',
    });
  });

  it('rejects encrypted Office OLE compound files before workbook parsing', async () => {
    const parser = new XlsxSourceParser(limits);
    const summary = await parser.inspect(encryptedOleCompoundFile());

    expect(summary).toMatchObject({
      sourceKind: 'xlsx',
      rowCount: 0,
      columnCount: 0,
      columnKeys: [],
      sampleRows: [],
      validationRows: [],
    });
    expect(summary.issues).toHaveLength(1);
    expect(summary.issues[0]).toEqual({
      severity: 'error',
      code: 'encrypted_workbook_unsupported',
      message: 'Encrypted or password-protected workbooks are not supported.',
    });
  });

  it('rejects corrupt and non-ZIP bytes as invalid containers without throwing', async () => {
    const parser = new XlsxSourceParser(limits);
    const summary = await parser.inspect(Buffer.from('not a real zip archive'));

    expect(summary).toMatchObject({
      sourceKind: 'xlsx',
      rowCount: 0,
      columnCount: 0,
      columnKeys: [],
      sampleRows: [],
      validationRows: [],
    });
    expect(summary.issues).toHaveLength(1);
    expect(summary.issues[0]).toEqual({
      severity: 'error',
      code: 'invalid_xlsx_container',
      message: 'Workbook container is invalid or unreadable.',
    });
  });

  it('rejects archives exceeding the entry cap before extracting contents', async () => {
    const parser = new XlsxSourceParser(limits);
    const summary = await parser.inspect(manyEntriesZip(1005));

    expect(summary).toMatchObject({
      sourceKind: 'xlsx',
      rowCount: 0,
      columnCount: 0,
      columnKeys: [],
      sampleRows: [],
      validationRows: [],
    });
    expect(summary.issues).toHaveLength(1);
    expect(summary.issues[0]).toEqual({
      severity: 'error',
      code: 'xlsx_entry_limit_exceeded',
      message: 'Workbook archive entry count exceeds the parser safety limit.',
    });
  });

  it('catches readSheet failures on malformed OOXML as invalid container issues', async () => {
    const parser = new XlsxSourceParser(limits);
    // Valid ZIP with arbitrary files but missing required OOXML sheets
    const nonOoxmlZip = Buffer.from(
      zipSync({
        'dummy.txt': strToU8('not an excel workbook'),
      }),
    );
    const summary = await parser.inspect(nonOoxmlZip);

    expect(summary).toMatchObject({
      sourceKind: 'xlsx',
      rowCount: 0,
      columnCount: 0,
      columnKeys: [],
      sampleRows: [],
      validationRows: [],
    });
    expect(summary.issues).toHaveLength(1);
    expect(summary.issues[0]).toEqual({
      severity: 'error',
      code: 'invalid_xlsx_container',
      message: 'Workbook container is invalid or unreadable.',
    });
  });
});

function point(name: string, coordinates: [number, number]) {
  return {
    type: 'Feature',
    properties: { name },
    geometry: { type: 'Point', coordinates },
  };
}

function minimalXlsx(): Buffer {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': xml(`<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      </Types>`),
    '_rels/.rels': xml(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`),
    'xl/workbook.xml': xml(`<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`),
    'xl/_rels/workbook.xml.rels': xml(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
      </Relationships>`),
    'xl/worksheets/sheet1.xml': xml(`<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>
          <row r="1">
            <c r="A1" t="inlineStr"><is><t>Region</t></is></c>
            <c r="B1" t="inlineStr"><is><t>Value</t></is></c>
          </row>
          <row r="2">
            <c r="A2" t="inlineStr"><is><t>A1</t></is></c>
            <c r="B2" t="inlineStr"><is><t>=1+1</t></is></c>
          </row>
        </sheetData>
      </worksheet>`),
  };
  return Buffer.from(zipSync(files));
}

function xml(value: string): Uint8Array {
  return strToU8(value.replace(/\n\s+/g, ''));
}

function macroXlsx(): Buffer {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': xml(`<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      </Types>`),
    '_rels/.rels': xml(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`),
    'xl/workbook.xml': xml(`<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`),
    'xl/vbaProject.bin': strToU8('fake_vba_project_payload'),
  };
  return Buffer.from(zipSync(files));
}

function encryptedOleCompoundFile(): Buffer {
  return Buffer.from([
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00, 0x00, 0x00,
  ]);
}

function manyEntriesZip(count: number): Buffer {
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < count; i++) {
    files[`entry_${i}.txt`] = strToU8('x');
  }
  return Buffer.from(zipSync(files));
}
