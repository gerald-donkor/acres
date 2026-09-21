export const REPORT_STATUSES = ['draft', 'published', 'archived'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export function isReportStatus(status: string): status is ReportStatus {
  return (REPORT_STATUSES as readonly string[]).includes(status);
}

export const REPORT_REVISION_STATUSES = [
  'draft',
  'in_review',
  'published',
  'superseded',
] as const;
export type ReportRevisionStatus = (typeof REPORT_REVISION_STATUSES)[number];

export function isReportRevisionStatus(
  status: string,
): status is ReportRevisionStatus {
  return (REPORT_REVISION_STATUSES as readonly string[]).includes(status);
}

export const REPORT_EVIDENCE_TYPES = ['aggregate', 'dashboard_view'] as const;
export type ReportEvidenceType = (typeof REPORT_EVIDENCE_TYPES)[number];

export const EXPORT_FORMATS = ['csv', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;

export type ExportStatus = (typeof EXPORT_STATUSES)[number];

export const TERMINAL_EXPORT_STATUSES = [
  'succeeded',
  'failed',
  'cancelled',
] as const;

export type TerminalExportStatus =
  (typeof TERMINAL_EXPORT_STATUSES)[number];

export function isTerminalExportStatus(
  status: string,
): status is TerminalExportStatus {
  return (TERMINAL_EXPORT_STATUSES as readonly string[]).includes(status);
}

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
  aiDraftEnabled?: boolean;
};

export type AiGenerationState =
  | 'succeeded'
  | 'validation_rejected'
  | 'rate_limited'
  | 'timeout'
  | 'unavailable'
  | 'malformed_output'
  | 'grounding_rejected'
  | 'failed';

export type AiDraftProposal = {
  heading: string;
  body: string;
  citedEvidenceIds: string[];
};

export type AiDraftGenerationMetadata = {
  generationId: string;
  provider: string;
  model: string;
  promptTemplateVersion: string;
  proposalCount: number;
  createdAt: string;
};

export type AiDraftProposalsResult = {
  proposals: AiDraftProposal[];
  metadata: AiDraftGenerationMetadata;
};

export type CreateAiDraftInput = {
  purpose: string;
  evidenceIds: string[];
  proposalCount?: number;
  acknowledgement: boolean | string;
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
