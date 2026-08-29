import { CsvSourceParser } from './csv-source.parser';
import { GeojsonSourceParser } from './geojson-source.parser';
import type {
  ParsedSourceSummary,
  ParserLimits,
  SourceKind,
} from './parser.types';
import { XlsxSourceParser } from './xlsx-source.parser';

export async function parseSourceBuffer(
  buffer: Buffer,
  mediaType: string,
  limits: ParserLimits,
): Promise<ParsedSourceSummary> {
  const sourceKind: SourceKind = mediaType.includes('sheet')
    ? 'xlsx'
    : mediaType.includes('json')
      ? 'geojson'
      : 'csv';

  try {
    if (mediaType === 'text/csv') {
      return new CsvSourceParser(limits).inspect(buffer);
    }
    if (
      mediaType ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      return await new XlsxSourceParser(limits).inspect(buffer);
    }
    if (
      mediaType === 'application/geo+json' ||
      mediaType === 'application/json'
    ) {
      return new GeojsonSourceParser(limits).inspect(buffer);
    }
    return {
      sourceKind,
      rowCount: 0,
      columnCount: 0,
      columnKeys: [],
      sampleRows: [],
      validationRows: [],
      issues: [
        {
          severity: 'error',
          code: 'unsupported_media_type',
          message: 'Media type is not accepted.',
        },
      ],
      metadata: {},
    };
  } catch (error) {
    return {
      sourceKind,
      rowCount: 0,
      columnCount: 0,
      columnKeys: [],
      sampleRows: [],
      validationRows: [],
      issues: [
        {
          severity: 'error',
          code: 'parser_exception',
          message:
            error instanceof Error
              ? error.message.slice(0, 180)
              : 'Parser failed.',
        },
      ],
      metadata: {},
    };
  }
}
