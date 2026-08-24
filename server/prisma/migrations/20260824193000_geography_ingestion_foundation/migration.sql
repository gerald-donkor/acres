-- Phase 7A geography hierarchy, ingestion runs, and dataset versions.

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE "Region"
  ADD COLUMN "parentId" text,
  ADD COLUMN "level" text NOT NULL DEFAULT 'legacy',
  ADD COLUMN "regionType" text NOT NULL DEFAULT 'legacy',
  ADD COLUMN "retiredAt" timestamptz;

ALTER TABLE "Region"
  ADD CONSTRAINT "Region_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Region_parentId_level_idx" ON "Region"("parentId", "level");
CREATE INDEX "Region_countryCode_level_idx" ON "Region"("countryCode", "level");

CREATE OR REPLACE FUNCTION public.acres_guard_region_cycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  found_cycle boolean;
BEGIN
  IF NEW."parentId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."parentId" = NEW.id THEN
    RAISE EXCEPTION 'region cannot be its own parent'
      USING ERRCODE = '23514';
  END IF;

  WITH RECURSIVE ancestors(id) AS (
    SELECT NEW."parentId"
    UNION ALL
    SELECT r."parentId"
      FROM "Region" r
      JOIN ancestors a ON r.id = a.id
     WHERE r."parentId" IS NOT NULL
  )
  SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id)
    INTO found_cycle;

  IF found_cycle THEN
    RAISE EXCEPTION 'region hierarchy cycle detected'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Region_cycle_guard"
BEFORE INSERT OR UPDATE OF "parentId" ON "Region"
FOR EACH ROW EXECUTE FUNCTION public.acres_guard_region_cycle();

CREATE TYPE "DatasetState" AS ENUM ('draft', 'active', 'archived');
CREATE TYPE "DatasetPublicationStatus" AS ENUM ('published');
CREATE TYPE "MappingValidationStatus" AS ENUM ('pending', 'valid', 'invalid');
CREATE TYPE "IngestionRunState" AS ENUM (
  'queued',
  'running',
  'validation_failed',
  'published',
  'failed',
  'cancelling',
  'cancelled'
);
CREATE TYPE "IngestionRunStage" AS ENUM (
  'inspect',
  'parse',
  'map',
  'validate',
  'publish',
  'complete'
);
CREATE TYPE "ValidationIssueSeverity" AS ENUM ('info', 'warning', 'error');

CREATE TABLE "RegionSource" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "name" text NOT NULL,
  "provider" text NOT NULL,
  "codeSystem" text NOT NULL,
  "sourceVersion" text NOT NULL,
  "sourceDate" timestamptz,
  "license" text,
  "provenanceUrl" text,
  "redistributionNotes" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "RegionCode" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "regionId" text NOT NULL,
  "sourceId" text NOT NULL,
  "codeSystem" text NOT NULL,
  "code" text NOT NULL,
  "normalized" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "RegionCode_regionId_fkey"
    FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RegionCode_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "RegionSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "RegionAlias" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "regionId" text NOT NULL,
  "sourceId" text,
  "locale" text,
  "alias" text NOT NULL,
  "normalized" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "RegionAlias_regionId_fkey"
    FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RegionAlias_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "RegionSource"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "RegionGeometry" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "regionId" text NOT NULL,
  "sourceId" text NOT NULL,
  "srid" integer NOT NULL DEFAULT 4326,
  "geometryType" text NOT NULL,
  "geometry" geometry(Geometry, 4326) NOT NULL,
  "isValid" boolean NOT NULL DEFAULT false,
  "sourcePrecision" text,
  "metadata" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "RegionGeometry_regionId_fkey"
    FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RegionGeometry_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "RegionSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RegionGeometry_srid_check" CHECK ("srid" = 4326),
  CONSTRAINT "RegionGeometry_geometry_valid_check" CHECK (ST_SRID("geometry") = 4326)
);

CREATE TABLE "Dataset" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "ownerAccountId" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "sourceMetadata" jsonb,
  "state" "DatasetState" NOT NULL DEFAULT 'draft',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "Dataset_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Dataset_ownerAccountId_fkey"
    FOREIGN KEY ("ownerAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Dataset_name_check" CHECK (length(btrim("name")) > 0)
);

CREATE TABLE "ColumnMapping" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "datasetId" text NOT NULL,
  "uploadId" text NOT NULL,
  "createdByAccountId" text NOT NULL,
  "versionNumber" integer NOT NULL,
  "mapping" jsonb NOT NULL,
  "validationStatus" "MappingValidationStatus" NOT NULL DEFAULT 'pending',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ColumnMapping_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ColumnMapping_datasetId_fkey"
    FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ColumnMapping_uploadId_fkey"
    FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ColumnMapping_createdByAccountId_fkey"
    FOREIGN KEY ("createdByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ColumnMapping_versionNumber_check" CHECK ("versionNumber" > 0)
);

CREATE TABLE "DatasetVersion" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "datasetId" text NOT NULL,
  "versionNumber" integer NOT NULL,
  "sourceUploadId" text NOT NULL,
  "storedObjectId" text NOT NULL,
  "mappingId" text NOT NULL,
  "publicationStatus" "DatasetPublicationStatus" NOT NULL DEFAULT 'published',
  "checksumHex" text,
  "sourceSummary" jsonb NOT NULL,
  "publishedAt" timestamptz NOT NULL DEFAULT now(),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "DatasetVersion_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DatasetVersion_datasetId_fkey"
    FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DatasetVersion_sourceUploadId_fkey"
    FOREIGN KEY ("sourceUploadId") REFERENCES "Upload"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DatasetVersion_storedObjectId_fkey"
    FOREIGN KEY ("storedObjectId") REFERENCES "StoredObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DatasetVersion_mappingId_fkey"
    FOREIGN KEY ("mappingId") REFERENCES "ColumnMapping"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DatasetVersion_versionNumber_check" CHECK ("versionNumber" > 0)
);

CREATE TABLE "IngestionRun" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "datasetId" text NOT NULL,
  "uploadId" text NOT NULL,
  "mappingId" text NOT NULL,
  "datasetVersionId" text,
  "actorAccountId" text NOT NULL,
  "deterministicKey" text NOT NULL,
  "state" "IngestionRunState" NOT NULL DEFAULT 'queued',
  "stage" "IngestionRunStage" NOT NULL DEFAULT 'inspect',
  "progressPercent" integer NOT NULL DEFAULT 0,
  "attempts" integer NOT NULL DEFAULT 0,
  "failureCode" text,
  "failureMessage" text,
  "cancelledAt" timestamptz,
  "startedAt" timestamptz,
  "finishedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "IngestionRun_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IngestionRun_datasetId_fkey"
    FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IngestionRun_uploadId_fkey"
    FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IngestionRun_mappingId_fkey"
    FOREIGN KEY ("mappingId") REFERENCES "ColumnMapping"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IngestionRun_datasetVersionId_fkey"
    FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "IngestionRun_actorAccountId_fkey"
    FOREIGN KEY ("actorAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IngestionRun_progressPercent_check" CHECK ("progressPercent" >= 0 AND "progressPercent" <= 100),
  CONSTRAINT "IngestionRun_attempts_check" CHECK ("attempts" >= 0)
);

CREATE TABLE "ValidationIssue" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "ingestionRunId" text NOT NULL,
  "severity" "ValidationIssueSeverity" NOT NULL,
  "code" text NOT NULL,
  "message" text NOT NULL,
  "rowNumber" integer,
  "rowRange" text,
  "columnKey" text,
  "regionRef" text,
  "details" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ValidationIssue_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ValidationIssue_ingestionRunId_fkey"
    FOREIGN KEY ("ingestionRunId") REFERENCES "IngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ValidationIssue_rowNumber_check" CHECK ("rowNumber" IS NULL OR "rowNumber" > 0)
);

CREATE TABLE "StagedSourceSummary" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "ingestionRunId" text NOT NULL,
  "rowCount" integer NOT NULL,
  "columnCount" integer NOT NULL,
  "sampleRows" jsonb NOT NULL,
  "columnKeys" jsonb NOT NULL,
  "sourceKind" text NOT NULL,
  "checksumHex" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "StagedSourceSummary_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StagedSourceSummary_ingestionRunId_fkey"
    FOREIGN KEY ("ingestionRunId") REFERENCES "IngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StagedSourceSummary_counts_check" CHECK ("rowCount" >= 0 AND "columnCount" >= 0)
);

CREATE UNIQUE INDEX "RegionSource_provider_codeSystem_sourceVersion_key"
  ON "RegionSource"("provider", "codeSystem", "sourceVersion");
CREATE UNIQUE INDEX "RegionCode_sourceId_codeSystem_normalized_key"
  ON "RegionCode"("sourceId", "codeSystem", "normalized");
CREATE INDEX "RegionCode_regionId_sourceId_idx" ON "RegionCode"("regionId", "sourceId");
CREATE INDEX "RegionAlias_normalized_locale_idx" ON "RegionAlias"("normalized", "locale");
CREATE INDEX "RegionAlias_regionId_idx" ON "RegionAlias"("regionId");
CREATE INDEX "RegionGeometry_regionId_sourceId_idx" ON "RegionGeometry"("regionId", "sourceId");
CREATE INDEX "RegionGeometry_geometry_gist_idx" ON "RegionGeometry" USING GIST ("geometry");
CREATE INDEX "Dataset_organizationId_state_updatedAt_idx" ON "Dataset"("organizationId", "state", "updatedAt");
CREATE UNIQUE INDEX "ColumnMapping_datasetId_versionNumber_key" ON "ColumnMapping"("datasetId", "versionNumber");
CREATE INDEX "ColumnMapping_organizationId_datasetId_createdAt_idx" ON "ColumnMapping"("organizationId", "datasetId", "createdAt");
CREATE UNIQUE INDEX "DatasetVersion_datasetId_versionNumber_key" ON "DatasetVersion"("datasetId", "versionNumber");
CREATE UNIQUE INDEX "DatasetVersion_organizationId_datasetId_sourceUploadId_mappingId_key"
  ON "DatasetVersion"("organizationId", "datasetId", "sourceUploadId", "mappingId");
CREATE INDEX "DatasetVersion_organizationId_datasetId_publishedAt_idx"
  ON "DatasetVersion"("organizationId", "datasetId", "publishedAt");
CREATE UNIQUE INDEX "IngestionRun_organizationId_deterministicKey_key"
  ON "IngestionRun"("organizationId", "deterministicKey");
CREATE INDEX "IngestionRun_organizationId_datasetId_createdAt_idx"
  ON "IngestionRun"("organizationId", "datasetId", "createdAt");
CREATE INDEX "IngestionRun_organizationId_state_updatedAt_idx"
  ON "IngestionRun"("organizationId", "state", "updatedAt");
CREATE INDEX "ValidationIssue_organizationId_ingestionRunId_severity_createdAt_idx"
  ON "ValidationIssue"("organizationId", "ingestionRunId", "severity", "createdAt");
CREATE INDEX "ValidationIssue_organizationId_code_createdAt_idx"
  ON "ValidationIssue"("organizationId", "code", "createdAt");
CREATE UNIQUE INDEX "StagedSourceSummary_ingestionRunId_key"
  ON "StagedSourceSummary"("ingestionRunId");
CREATE INDEX "StagedSourceSummary_organizationId_createdAt_idx"
  ON "StagedSourceSummary"("organizationId", "createdAt");

ALTER TABLE "Dataset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DatasetVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ColumnMapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IngestionRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ValidationIssue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StagedSourceSummary" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "Dataset" FORCE ROW LEVEL SECURITY;
ALTER TABLE "DatasetVersion" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ColumnMapping" FORCE ROW LEVEL SECURITY;
ALTER TABLE "IngestionRun" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ValidationIssue" FORCE ROW LEVEL SECURITY;
ALTER TABLE "StagedSourceSummary" FORCE ROW LEVEL SECURITY;

CREATE POLICY dataset_tenant ON "Dataset"
  USING ("organizationId" = public.acres_current_organization_id() OR current_setting('acres.worker_access', true) = 'true')
  WITH CHECK ("organizationId" = public.acres_current_organization_id() OR current_setting('acres.worker_access', true) = 'true');
CREATE POLICY dataset_version_tenant ON "DatasetVersion"
  USING ("organizationId" = public.acres_current_organization_id() OR current_setting('acres.worker_access', true) = 'true')
  WITH CHECK ("organizationId" = public.acres_current_organization_id() OR current_setting('acres.worker_access', true) = 'true');
CREATE POLICY column_mapping_tenant ON "ColumnMapping"
  USING ("organizationId" = public.acres_current_organization_id() OR current_setting('acres.worker_access', true) = 'true')
  WITH CHECK ("organizationId" = public.acres_current_organization_id() OR current_setting('acres.worker_access', true) = 'true');
CREATE POLICY ingestion_run_tenant ON "IngestionRun"
  USING ("organizationId" = public.acres_current_organization_id() OR current_setting('acres.worker_access', true) = 'true')
  WITH CHECK ("organizationId" = public.acres_current_organization_id() OR current_setting('acres.worker_access', true) = 'true');
CREATE POLICY validation_issue_tenant ON "ValidationIssue"
  USING ("organizationId" = public.acres_current_organization_id() OR current_setting('acres.worker_access', true) = 'true')
  WITH CHECK ("organizationId" = public.acres_current_organization_id() OR current_setting('acres.worker_access', true) = 'true');
CREATE POLICY staged_source_summary_tenant ON "StagedSourceSummary"
  USING ("organizationId" = public.acres_current_organization_id() OR current_setting('acres.worker_access', true) = 'true')
  WITH CHECK ("organizationId" = public.acres_current_organization_id() OR current_setting('acres.worker_access', true) = 'true');

GRANT SELECT, INSERT, UPDATE ON
  "RegionSource", "RegionCode", "RegionAlias", "RegionGeometry",
  "Dataset", "DatasetVersion", "ColumnMapping", "IngestionRun",
  "ValidationIssue", "StagedSourceSummary"
  TO acres_app, acres_test;
