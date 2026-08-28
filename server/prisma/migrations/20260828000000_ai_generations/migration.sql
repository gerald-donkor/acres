-- Phase 11A temporary Gemini Developer API draft preview auditable request bookkeeping.

CREATE TYPE "AiGenerationState" AS ENUM (
  'succeeded',
  'validation_rejected',
  'rate_limited',
  'timeout',
  'unavailable',
  'malformed_output',
  'grounding_rejected',
  'failed'
);

CREATE TABLE "AiGeneration" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "reportId" text NOT NULL,
  "revisionId" text NOT NULL,
  "accountId" text NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "promptTemplateVersion" text NOT NULL,
  "inputHash" text NOT NULL,
  "state" "AiGenerationState" NOT NULL,
  "errorCategory" text,
  "proposalCount" integer NOT NULL DEFAULT 0,
  "evidenceCount" integer NOT NULL DEFAULT 0,
  "durationMs" integer,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  CONSTRAINT "AiGeneration_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AiGeneration_org_report_fkey"
    FOREIGN KEY ("organizationId", "reportId") REFERENCES "Report"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiGeneration_org_revision_fkey"
    FOREIGN KEY ("organizationId", "revisionId") REFERENCES "ReportRevision"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiGeneration_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AiGeneration_inputHash_check" CHECK ("inputHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "AiGeneration_proposal_count_check" CHECK ("proposalCount" >= 0),
  CONSTRAINT "AiGeneration_evidence_count_check" CHECK ("evidenceCount" >= 0),
  CONSTRAINT "AiGeneration_organizationId_id_key" UNIQUE ("organizationId", "id")
);

CREATE INDEX "AiGeneration_organizationId_revisionId_createdAt_idx" ON "AiGeneration"("organizationId", "revisionId", "createdAt");
CREATE INDEX "AiGeneration_organizationId_accountId_createdAt_idx" ON "AiGeneration"("organizationId", "accountId", "createdAt");
CREATE INDEX "AiGeneration_organizationId_state_createdAt_idx" ON "AiGeneration"("organizationId", "state", "createdAt");

ALTER TABLE "AiGeneration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiGeneration" FORCE ROW LEVEL SECURITY;

CREATE POLICY ai_generation_tenant ON "AiGeneration"
  USING ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true')
  WITH CHECK ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true');

GRANT SELECT, INSERT, UPDATE, DELETE ON "AiGeneration" TO acres_app, acres_test;
GRANT TRUNCATE ON "AiGeneration" TO acres_test;
