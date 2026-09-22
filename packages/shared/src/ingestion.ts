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

export function isIngestionRunState(
  state: string,
): state is IngestionRunState {
  return (INGESTION_RUN_STATES as readonly string[]).includes(state);
}

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

export const INGESTION_RUN_STAGES = [
  'inspect',
  'parse',
  'map',
  'validate',
  'publish',
  'complete',
] as const;

export type IngestionRunStage = (typeof INGESTION_RUN_STAGES)[number];

export function isIngestionRunStage(
  stage: string,
): stage is IngestionRunStage {
  return (INGESTION_RUN_STAGES as readonly string[]).includes(stage);
}

export interface IngestionRunSummary {
  readonly id: string;
  readonly datasetId: string;
  readonly uploadId: string;
  readonly mappingId: string;
  readonly datasetVersionId: string | null;
  readonly state: IngestionRunState;
  readonly stage: IngestionRunStage;
  readonly progressPercent: number;
  readonly failure: { code: string; message: string | null } | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

export const DATASET_STATES = ['draft', 'active', 'archived'] as const;

export type DatasetState = (typeof DATASET_STATES)[number];

export function isDatasetState(state: string): state is DatasetState {
  return (DATASET_STATES as readonly string[]).includes(state);
}

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

export const MAPPING_VALIDATION_STATUSES = [
  'pending',
  'valid',
  'invalid',
] as const;

export type MappingValidationStatus =
  (typeof MAPPING_VALIDATION_STATUSES)[number];

export function isMappingValidationStatus(
  status: string,
): status is MappingValidationStatus {
  return (MAPPING_VALIDATION_STATUSES as readonly string[]).includes(status);
}

export interface ColumnMappingSummary {
  readonly id: string;
  readonly datasetId: string;
  readonly uploadId: string;
  readonly versionNumber: number;
  readonly validationStatus: MappingValidationStatus;
  readonly createdAt: string;
}

export type MappingSummary = ColumnMappingSummary;

export const VALIDATION_ISSUE_SEVERITIES = [
  'info',
  'warning',
  'error',
] as const;

export type ValidationIssueSeverity =
  (typeof VALIDATION_ISSUE_SEVERITIES)[number];

export function isValidationIssueSeverity(
  severity: string,
): severity is ValidationIssueSeverity {
  return (VALIDATION_ISSUE_SEVERITIES as readonly string[]).includes(severity);
}

export interface ValidationIssueSummary {
  readonly id: string;
  readonly severity: ValidationIssueSeverity;
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
