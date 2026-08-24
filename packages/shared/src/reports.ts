export type ReportStatus = 'draft' | 'published' | 'archived';
export type ReportRevisionStatus =
  | 'draft'
  | 'in_review'
  | 'published'
  | 'superseded';
export type ReportEvidenceType = 'aggregate' | 'dashboard_view';
export type ExportFormat = 'csv' | 'pdf';
export type ExportStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type ReportInsightInput = {
  heading: string;
  body: string;
};

export type ReportEvidenceInput = {
  aggregateId?: string;
  dashboardViewId?: string;
};

export type CreateReportInput = {
  title: string;
  summary?: string;
  insights?: ReportInsightInput[];
  evidence?: ReportEvidenceInput[];
};

export type UpdateReportInput = {
  title?: string;
  summary?: string;
  expectedVersion: number;
};

export type UpdateRevisionInput = {
  title?: string;
  summary?: string;
  insights?: ReportInsightInput[];
  evidence?: ReportEvidenceInput[];
  expectedVersion: number;
};

export type CreateRevisionInput = UpdateRevisionInput;

export type ReportInsight = {
  id: string;
  position: number;
  heading: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type ReportEvidence = {
  id: string;
  evidenceType: ReportEvidenceType;
  aggregateId: string | null;
  dashboardViewId: string | null;
  metricDefinitionId: string | null;
  datasetVersionId: string | null;
  observationId: string | null;
  snapshot: Record<string, unknown>;
  position: number;
  createdAt: string;
};

export type ReportRevision = {
  id: string;
  reportId: string;
  revisionNumber: number;
  status: ReportRevisionStatus;
  title: string;
  summary: string | null;
  sections: unknown[];
  authorAccountId: string;
  reviewerAccountId: string | null;
  publisherAccountId: string | null;
  submittedForReviewAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  insights: ReportInsight[];
  evidence: ReportEvidence[];
};

export type Report = {
  id: string;
  title: string;
  summary: string | null;
  status: ReportStatus;
  version: number;
  ownerAccountId: string;
  createdByAccountId: string;
  createdAt: string;
  updatedAt: string;
  latestRevision: ReportRevision | null;
};

export type ExportRequest = {
  id: string;
  reportId: string | null;
  revisionId: string | null;
  format: ExportFormat;
  status: ExportStatus;
  renderingVersion: string;
  failure: { code: string; message: string | null } | null;
  artifact:
    | {
        id: string;
        filename: string;
        mediaType: string;
        byteCount: number;
        checksumHex: string;
        createdAt: string;
      }
    | null;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateExportInput = {
  reportId?: string;
  revisionId?: string;
  format: ExportFormat;
};

export type ExportDownload = {
  url: string;
  method: 'GET';
  headers: Record<string, string>;
  expiresAt: string;
};
