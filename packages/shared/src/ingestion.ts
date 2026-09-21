export const INGESTION_RUN_STATES = [
  'queued',
  'running',
  'validation_failed',
  'published',
  'failed',
  'cancelling',
  'cancelled',
] as const;

export type IngestionRunState = (typeof INGESTION_RUN_STATES)[number];

export const TERMINAL_INGESTION_RUN_STATES = [
  'published',
  'failed',
  'cancelled',
] as const;

export type TerminalIngestionRunState =
  (typeof TERMINAL_INGESTION_RUN_STATES)[number];

export function isTerminalIngestionRunState(
  state: string,
): state is TerminalIngestionRunState {
  return (TERMINAL_INGESTION_RUN_STATES as readonly string[]).includes(state);
}

export interface IngestionRunSummary {
  readonly id: string;
  readonly datasetId: string;
  readonly uploadId: string;
  readonly mappingId: string;
  readonly datasetVersionId: string | null;
  readonly state: IngestionRunState;
  readonly stage:
    'inspect' | 'parse' | 'map' | 'validate' | 'publish' | 'complete';
  readonly progressPercent: number;
  readonly failure: { code: string; message: string | null } | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

export type DatasetState = 'draft' | 'active' | 'archived';

export interface DatasetVersionSummary {
  readonly id: string;
  readonly versionNumber: number;
  readonly publicationStatus: 'published';
  readonly publishedAt: string;
  readonly checksumHex: string | null;
  readonly sourceSummary: unknown;
}

export interface DatasetSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly state: DatasetState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly latestVersion: DatasetVersionSummary | null;
}

export interface ColumnMappingSummary {
  readonly id: string;
  readonly datasetId: string;
  readonly uploadId: string;
  readonly versionNumber: number;
  readonly validationStatus: 'pending' | 'valid' | 'invalid';
  readonly createdAt: string;
}

export type MappingSummary = ColumnMappingSummary;

export interface ValidationIssueSummary {
  readonly id: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly rowNumber?: number | null;
  readonly columnKey?: string | null;
  readonly regionRef?: string | null;
  readonly createdAt: string;
}

export type CreateDatasetInput = {
  name: string;
  description?: string;
  sourceMetadata?: Record<string, unknown>;
};

export type UpdateDatasetInput = {
  name?: string;
  description?: string;
  sourceMetadata?: Record<string, unknown>;
};

export type MetricMappingInput = {
  column: string;
  key: string;
  label?: string;
  description?: string;
  valueType?: string;
  unit?: string;
  canonicalUnit?: string;
  aggregation?: string;
  periodColumn?: string;
  periodStartColumn?: string;
  periodEndColumn?: string;
  staticPeriodStart?: string;
  staticPeriodEnd?: string;
  staticPeriodLabel?: string;
  dimensionColumns?: string[];
};

export type MappingConfig = {
  regionColumn?: string;
  regionCodeColumn?: string;
  periodColumn?: string;
  valueColumns?: string[];
  dimensions?: string[];
  unitColumn?: string;
  notesColumn?: string;
  metrics?: MetricMappingInput[];
  [key: string]: unknown;
};

export type CreateMappingInput = {
  uploadId: string;
  mapping: MappingConfig;
};

export type StartIngestionRunInput = {
  uploadId: string;
  mappingId: string;
};
