export type IngestionRunState =
  | 'queued'
  | 'running'
  | 'published'
  | 'failed'
  | 'cancelled';

export interface IngestionRunSummary {
  readonly id: string;
  readonly datasetId: string;
  readonly uploadId: string;
  readonly mappingId: string;
  readonly datasetVersionId: string | null;
  readonly state: string;
  readonly stage: string;
  readonly progressPercent: number;
  readonly failure: { code: string; message: string | null } | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}
