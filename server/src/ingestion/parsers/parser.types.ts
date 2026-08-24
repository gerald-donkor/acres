export type SourceKind = 'csv' | 'xlsx' | 'geojson';

export interface ParserIssue {
  readonly severity: 'warning' | 'error';
  readonly code: string;
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
