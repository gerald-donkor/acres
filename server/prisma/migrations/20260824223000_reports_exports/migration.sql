-- Phase 10 governed reports, immutable revisions, evidence, and exports.

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'report_published';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'export_requested';

CREATE TYPE "ReportStatus" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "ReportRevisionStatus" AS ENUM ('draft', 'in_review', 'published', 'superseded');
CREATE TYPE "ReportEvidenceType" AS ENUM ('aggregate', 'dashboard_view');
CREATE TYPE "ExportFormat" AS ENUM ('csv', 'pdf');
CREATE TYPE "ExportStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');

CREATE TABLE "Report" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "ownerAccountId" text NOT NULL,
  "createdByAccountId" text NOT NULL,
  "title" text NOT NULL,
  "summary" text,
  "status" "ReportStatus" NOT NULL DEFAULT 'draft',
  "version" integer NOT NULL DEFAULT 1,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "archivedAt" timestamptz,
  CONSTRAINT "Report_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Report_ownerAccountId_fkey"
    FOREIGN KEY ("ownerAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Report_createdByAccountId_fkey"
    FOREIGN KEY ("createdByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Report_title_check" CHECK (length(btrim("title")) > 0 AND length("title") <= 160),
  CONSTRAINT "Report_summary_check" CHECK ("summary" IS NULL OR length("summary") <= 1000),
  CONSTRAINT "Report_version_check" CHECK ("version" > 0),
  CONSTRAINT "Report_organizationId_id_key" UNIQUE ("organizationId", "id")
);

CREATE TABLE "ReportRevision" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "reportId" text NOT NULL,
  "revisionNumber" integer NOT NULL,
  "status" "ReportRevisionStatus" NOT NULL DEFAULT 'draft',
  "title" text NOT NULL,
  "summary" text,
  "sections" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "authorAccountId" text NOT NULL,
  "reviewerAccountId" text,
  "publisherAccountId" text,
  "submittedForReviewAt" timestamptz,
  "publishedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ReportRevision_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReportRevision_org_report_fkey"
    FOREIGN KEY ("organizationId", "reportId") REFERENCES "Report"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReportRevision_authorAccountId_fkey"
    FOREIGN KEY ("authorAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReportRevision_reviewerAccountId_fkey"
    FOREIGN KEY ("reviewerAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReportRevision_publisherAccountId_fkey"
    FOREIGN KEY ("publisherAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReportRevision_revision_number_check" CHECK ("revisionNumber" > 0),
  CONSTRAINT "ReportRevision_title_check" CHECK (length(btrim("title")) > 0 AND length("title") <= 160),
  CONSTRAINT "ReportRevision_summary_check" CHECK ("summary" IS NULL OR length("summary") <= 1000),
  CONSTRAINT "ReportRevision_published_check" CHECK (("status" <> 'published') OR ("publishedAt" IS NOT NULL AND "publisherAccountId" IS NOT NULL)),
  CONSTRAINT "ReportRevision_organizationId_id_key" UNIQUE ("organizationId", "id"),
  CONSTRAINT "ReportRevision_organizationId_reportId_revisionNumber_key" UNIQUE ("organizationId", "reportId", "revisionNumber")
);

CREATE TABLE "ReportInsight" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "revisionId" text NOT NULL,
  "authorAccountId" text NOT NULL,
  "position" integer NOT NULL,
  "heading" text NOT NULL,
  "body" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ReportInsight_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReportInsight_org_revision_fkey"
    FOREIGN KEY ("organizationId", "revisionId") REFERENCES "ReportRevision"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportInsight_authorAccountId_fkey"
    FOREIGN KEY ("authorAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReportInsight_position_check" CHECK ("position" >= 0),
  CONSTRAINT "ReportInsight_heading_check" CHECK (length(btrim("heading")) > 0 AND length("heading") <= 160),
  CONSTRAINT "ReportInsight_body_check" CHECK (length(btrim("body")) > 0 AND length("body") <= 4000),
  CONSTRAINT "ReportInsight_organizationId_id_key" UNIQUE ("organizationId", "id"),
  CONSTRAINT "ReportInsight_organizationId_revisionId_position_key" UNIQUE ("organizationId", "revisionId", "position")
);

CREATE TABLE "ReportEvidence" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "revisionId" text NOT NULL,
  "insightId" text,
  "evidenceType" "ReportEvidenceType" NOT NULL,
  "aggregateId" text,
  "dashboardViewId" text,
  "metricDefinitionId" text,
  "datasetVersionId" text,
  "observationId" text,
  "snapshot" jsonb NOT NULL,
  "position" integer NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ReportEvidence_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReportEvidence_org_revision_fkey"
    FOREIGN KEY ("organizationId", "revisionId") REFERENCES "ReportRevision"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportEvidence_org_insight_fkey"
    FOREIGN KEY ("organizationId", "insightId") REFERENCES "ReportInsight"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReportEvidence_org_aggregate_fkey"
    FOREIGN KEY ("organizationId", "aggregateId") REFERENCES "MetricAggregate"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReportEvidence_org_dashboardView_fkey"
    FOREIGN KEY ("organizationId", "dashboardViewId") REFERENCES "DashboardView"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReportEvidence_position_check" CHECK ("position" >= 0),
  CONSTRAINT "ReportEvidence_target_check" CHECK (
    ("evidenceType" = 'aggregate' AND "aggregateId" IS NOT NULL AND "dashboardViewId" IS NULL)
    OR ("evidenceType" = 'dashboard_view' AND "dashboardViewId" IS NOT NULL AND "aggregateId" IS NULL)
  ),
  CONSTRAINT "ReportEvidence_organizationId_id_key" UNIQUE ("organizationId", "id"),
  CONSTRAINT "ReportEvidence_organizationId_revisionId_position_key" UNIQUE ("organizationId", "revisionId", "position")
);

CREATE TABLE "ExportRequest" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "requestedByAccountId" text NOT NULL,
  "reportId" text,
  "revisionId" text,
  "format" "ExportFormat" NOT NULL,
  "status" "ExportStatus" NOT NULL DEFAULT 'queued',
  "deterministicKey" text NOT NULL,
  "renderingVersion" text NOT NULL DEFAULT 'reports-v1',
  "failureCode" text,
  "failureMessage" text,
  "startedAt" timestamptz,
  "finishedAt" timestamptz,
  "expiresAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ExportRequest_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExportRequest_requestedByAccountId_fkey"
    FOREIGN KEY ("requestedByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExportRequest_org_report_fkey"
    FOREIGN KEY ("organizationId", "reportId") REFERENCES "Report"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExportRequest_org_revision_fkey"
    FOREIGN KEY ("organizationId", "revisionId") REFERENCES "ReportRevision"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExportRequest_target_check" CHECK ("reportId" IS NOT NULL OR "revisionId" IS NOT NULL),
  CONSTRAINT "ExportRequest_organizationId_id_key" UNIQUE ("organizationId", "id"),
  CONSTRAINT "ExportRequest_organizationId_deterministicKey_key" UNIQUE ("organizationId", "deterministicKey")
);

CREATE TABLE "ExportArtifact" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "exportRequestId" text NOT NULL,
  "storedObjectId" text NOT NULL,
  "filename" text NOT NULL,
  "mediaType" text NOT NULL,
  "byteCount" bigint NOT NULL,
  "checksumHex" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ExportArtifact_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExportArtifact_org_exportRequest_fkey"
    FOREIGN KEY ("organizationId", "exportRequestId") REFERENCES "ExportRequest"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExportArtifact_org_storedObject_fkey"
    FOREIGN KEY ("organizationId", "storedObjectId") REFERENCES "StoredObject"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExportArtifact_filename_check" CHECK (length(btrim("filename")) > 0 AND length("filename") <= 180),
  CONSTRAINT "ExportArtifact_mediaType_check" CHECK ("mediaType" IN ('text/csv', 'application/pdf')),
  CONSTRAINT "ExportArtifact_checksum_check" CHECK ("checksumHex" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ExportArtifact_byte_count_check" CHECK ("byteCount" >= 0),
  CONSTRAINT "ExportArtifact_exportRequestId_key" UNIQUE ("exportRequestId"),
  CONSTRAINT "ExportArtifact_organizationId_id_key" UNIQUE ("organizationId", "id"),
  CONSTRAINT "ExportArtifact_organizationId_exportRequestId_key" UNIQUE ("organizationId", "exportRequestId")
);

CREATE INDEX "Report_organizationId_status_updatedAt_idx" ON "Report"("organizationId", "status", "updatedAt");
CREATE INDEX "Report_organizationId_ownerAccountId_updatedAt_idx" ON "Report"("organizationId", "ownerAccountId", "updatedAt");
CREATE INDEX "ReportRevision_organizationId_reportId_status_revisionNumber_idx" ON "ReportRevision"("organizationId", "reportId", "status", "revisionNumber");
CREATE INDEX "ReportInsight_organizationId_revisionId_createdAt_idx" ON "ReportInsight"("organizationId", "revisionId", "createdAt");
CREATE INDEX "ReportEvidence_organizationId_revisionId_evidenceType_idx" ON "ReportEvidence"("organizationId", "revisionId", "evidenceType");
CREATE INDEX "ReportEvidence_organizationId_aggregateId_idx" ON "ReportEvidence"("organizationId", "aggregateId");
CREATE INDEX "ReportEvidence_organizationId_dashboardViewId_idx" ON "ReportEvidence"("organizationId", "dashboardViewId");
CREATE INDEX "ExportRequest_organizationId_requestedByAccountId_createdAt_idx" ON "ExportRequest"("organizationId", "requestedByAccountId", "createdAt");
CREATE INDEX "ExportRequest_organizationId_status_updatedAt_idx" ON "ExportRequest"("organizationId", "status", "updatedAt");
CREATE INDEX "ExportRequest_organizationId_revisionId_createdAt_idx" ON "ExportRequest"("organizationId", "revisionId", "createdAt");
CREATE INDEX "ExportArtifact_organizationId_storedObjectId_idx" ON "ExportArtifact"("organizationId", "storedObjectId");

ALTER TABLE "Report" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Report" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ReportRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReportRevision" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ReportInsight" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReportInsight" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ReportEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReportEvidence" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ExportRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExportRequest" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ExportArtifact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExportArtifact" FORCE ROW LEVEL SECURITY;

CREATE POLICY report_tenant ON "Report"
  USING ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true')
  WITH CHECK ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true');
CREATE POLICY report_revision_tenant ON "ReportRevision"
  USING ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true')
  WITH CHECK ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true');
CREATE POLICY report_insight_tenant ON "ReportInsight"
  USING ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true')
  WITH CHECK ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true');
CREATE POLICY report_evidence_tenant ON "ReportEvidence"
  USING ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true')
  WITH CHECK ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true');
CREATE POLICY export_request_tenant ON "ExportRequest"
  USING ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true')
  WITH CHECK ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true');
CREATE POLICY export_artifact_tenant ON "ExportArtifact"
  USING ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true')
  WITH CHECK ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true');

GRANT SELECT, INSERT, UPDATE, DELETE ON "Report", "ReportRevision", "ReportInsight", "ReportEvidence", "ExportRequest", "ExportArtifact" TO acres_app, acres_test;
GRANT TRUNCATE ON "Report", "ReportRevision", "ReportInsight", "ReportEvidence", "ExportRequest", "ExportArtifact" TO acres_test;
