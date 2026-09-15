import type {
  MalformedMetricMappingCode,
  MalformedMetricMappingMessage,
} from '../../analytics/mapping';
import type {
  RemappingIncompatibleCode,
  RemappingIncompatibleMessage,
  ValidateMappingCode,
  ValidateMappingMessage,
} from '../../analytics/analytics-publication.service';
import type {
  RegionMappingCode,
  RegionMappingMessage,
} from '../ingestion-processor.service';
import type {
  ParserExecutorFailureCode,
  ParserExecutorFailureMessage,
} from './child-process-parser.executor';

export type SourceKind = 'csv' | 'xlsx' | 'geojson';

/**
 * Fixed parser-producer issue codes (18 distinct literals verified by grep
 * excluding `*.spec.ts` at implementation time). Each literal cites one
 * producing file; several literals are produced by multiple files.
 */
export type ParserProducerCode =
  | 'file_size_limit_exceeded' // csv/xlsx/geojson-source.parser.ts, source-parser.service.ts
  | 'row_limit_exceeded' // csv/xlsx-source.parser.ts
  | 'column_limit_exceeded' // csv/xlsx-source.parser.ts
  | 'cell_limit_exceeded' // csv/xlsx-source.parser.ts
  | 'invalid_xlsx_container' // xlsx-source.parser.ts, xlsx-container-inspector.ts
  | 'empty_workbook' // xlsx-source.parser.ts
  | 'invalid_json' // geojson-source.parser.ts
  | 'feature_limit_exceeded' // geojson-source.parser.ts
  | 'missing_geometry' // geojson-source.parser.ts
  | 'coordinate_limit_exceeded' // geojson-source.parser.ts
  | 'invalid_geojson' // geojson-source.parser.ts
  | 'unsupported_geojson' // geojson-source.parser.ts
  | 'encrypted_workbook_unsupported' // xlsx-container-inspector.ts
  | 'xlsx_entry_limit_exceeded' // xlsx-container-inspector.ts
  | 'macro_enabled_workbook_unsupported' // xlsx-container-inspector.ts
  | 'unsupported_media_type' // parse-source-buffer.ts
  | 'parser_exception' // parse-source-buffer.ts
  | 'formula_as_data'; // parser-utils.ts

/**
 * Compile-time guard for every trusted `ParserIssue.code` producer: parser
 * producers, executor failures, and the four already-narrowed mapping
 * validators merged in `IngestionProcessorService`. Composed by reference
 * with erased `import type` edges only; no runtime import cycle is
 * introduced. The validator's runtime regex gate remains the control for
 * untrusted child bytes.
 */
export type ParserIssueCode =
  | ParserProducerCode
  | ParserExecutorFailureCode
  | RegionMappingCode
  | MalformedMetricMappingCode
  | ValidateMappingCode
  | RemappingIncompatibleCode;

/**
 * Fixed parser-producer issue messages (24 distinct literals verified by grep
 * excluding `*.spec.ts` at implementation time). Each literal cites one
 * producing file; `Workbook container is invalid or unreadable.` is shared
 * between the xlsx parser and the container inspector.
 */
export type ParserProducerMessage =
  | 'CSV size exceeds the temporary parser limit.' // csv-source.parser.ts
  | 'CSV row count exceeds the temporary development limit.' // csv-source.parser.ts
  | 'CSV column count exceeds the temporary development limit.' // csv-source.parser.ts
  | 'CSV cell exceeds the temporary development limit.' // csv-source.parser.ts
  | 'Workbook size exceeds the temporary parser limit.' // xlsx-source.parser.ts
  | 'Workbook container is invalid or unreadable.' // xlsx-source.parser.ts, xlsx-container-inspector.ts
  | 'Workbook has no rows.' // xlsx-source.parser.ts
  | 'Workbook row count exceeds the temporary development limit.' // xlsx-source.parser.ts
  | 'Workbook column count exceeds the temporary development limit.' // xlsx-source.parser.ts
  | 'Workbook cell exceeds the temporary development limit.' // xlsx-source.parser.ts
  | 'GeoJSON size exceeds the temporary parser limit.' // geojson-source.parser.ts
  | 'GeoJSON could not be parsed as JSON.' // geojson-source.parser.ts
  | 'GeoJSON feature count exceeds the temporary development limit.' // geojson-source.parser.ts
  | 'GeoJSON feature is missing geometry.' // geojson-source.parser.ts
  | 'GeoJSON coordinate count exceeds the temporary development limit.' // geojson-source.parser.ts
  | 'GeoJSON root must be an object.' // geojson-source.parser.ts
  | 'GeoJSON must be a Feature or FeatureCollection.' // geojson-source.parser.ts
  | 'Encrypted or password-protected workbooks are not supported.' // xlsx-container-inspector.ts
  | 'Workbook archive entry count exceeds the parser safety limit.' // xlsx-container-inspector.ts
  | 'Macro-enabled workbooks are not supported.' // xlsx-container-inspector.ts
  | 'Media type is not accepted.' // parse-source-buffer.ts
  | 'Parser failed unexpectedly.' // parse-source-buffer.ts
  | 'Source file size exceeds the temporary parser limit.' // source-parser.service.ts
  | 'Formula-looking cell was treated as text.'; // parser-utils.ts

/**
 * Compile-time guard for every trusted `ParserIssue.message` producer: parser
 * producers, executor failures, and the four already-narrowed mapping
 * validators merged in `IngestionProcessorService`. Composed by reference
 * with erased `import type` edges only; no runtime import cycle is
 * introduced. The validator's runtime length gate remains the control for
 * untrusted child bytes.
 */
export type ParserIssueMessage =
  | ParserProducerMessage
  | ParserExecutorFailureMessage
  | RegionMappingMessage
  | MalformedMetricMappingMessage
  | ValidateMappingMessage
  | RemappingIncompatibleMessage;

export interface ParserIssue {
  readonly severity: 'warning' | 'error';
  readonly code: ParserIssueCode;
  readonly message: ParserIssueMessage;
  readonly rowNumber?: number;
  readonly columnKey?: string;
  readonly details?: Record<string, string | number | boolean | null>;
}

export interface ParsedSourceSummary {
  readonly sourceKind: SourceKind;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly columnKeys: string[];
  readonly sampleRows: Array<Record<string, string | number | boolean | null>>;
  readonly validationRows: Array<{
    readonly rowNumber: number;
    readonly values: Record<string, string | number | boolean | null>;
  }>;
  readonly issues: ParserIssue[];
  readonly metadata: Record<string, string | number | boolean | null>;
}

export interface SourceParser {
  inspect(
    buffer: Buffer,
    mediaType: string,
  ): ParsedSourceSummary | Promise<ParsedSourceSummary>;
}

export interface ParserLimits {
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly maxCellChars: number;
  readonly maxSampleRows: number;
  readonly maxGeojsonFeatures: number;
  readonly maxGeojsonCoordinates: number;
}
