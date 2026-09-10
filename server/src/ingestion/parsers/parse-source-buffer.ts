import { CsvSourceParser } from './csv-source.parser';
import { GeojsonSourceParser } from './geojson-source.parser';
import type {
  ParsedSourceSummary,
  ParserLimits,
  SourceKind,
} from './parser.types';
import { XlsxSourceParser } from './xlsx-source.parser';

/**
 * Stored on the tenant-visible `parser_exception` validation issue when a
 * source parser throws unexpectedly. The original error is logged server-side
 * only; tenant-readable issue rows must never carry raw exception text (cell
 * content, paths, or library internals).
 */
export const PARSER_EXCEPTION_MESSAGE = 'Parser failed unexpectedly.';

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
    // Operator diagnostics only. In-process execution writes this to the
    // server stderr. Inside the forked parser child it is discarded by design
    // (the child executor spawns with stdio ignored for isolation); on that
    // path the original input remains recoverable from the accepted upload
    // bytes. Never persisted to any column, metric label, or returned payload.
    console.error(
      'parseSourceBuffer parser_exception:',
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
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
          message: PARSER_EXCEPTION_MESSAGE,
        },
      ],
      metadata: {},
    };
  }
}
