import type { MalformedMetricMappingCode } from '../../analytics/mapping';
import type {
  RemappingIncompatibleCode,
  ValidateMappingCode,
} from '../../analytics/analytics-publication.service';
import type { RegionMappingCode } from '../ingestion-processor.service';
import type { ParserExecutorFailureCode } from './child-process-parser.executor';

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

export interface ParserIssue {
  readonly severity: 'warning' | 'error';
  readonly code: ParserIssueCode;
  readonly message: string;
  readonly rowNumber?: number;
  readonly columnKey?: string;
  readonly details?: Record<string, unknown>;
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
  readonly metadata: Record<string, unknown>;
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
