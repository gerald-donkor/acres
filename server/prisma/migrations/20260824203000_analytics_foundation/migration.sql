-- Phase 8 metrics, observations, deterministic aggregates, and lineage.

CREATE TYPE "MetricValueType" AS ENUM ('numeric', 'text', 'boolean');
CREATE TYPE "MetricAggregationType" AS ENUM ('sum', 'avg', 'min', 'max', 'count', 'latest');
CREATE TYPE "MetricDefinitionStatus" AS ENUM ('active', 'archived');
CREATE TYPE "ObservationQualitySeverity" AS ENUM ('info', 'warning', 'error');
CREATE TYPE "ObservationQualityState" AS ENUM ('valid', 'coerced', 'missing', 'invalid', 'duplicate', 'low_confidence');

CREATE TABLE "MetricDefinition" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "datasetId" text,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "valueType" "MetricValueType" NOT NULL,
  "canonicalUnit" text NOT NULL,
  "allowedAggregation" "MetricAggregationType" NOT NULL,
  "calculationVersion" text NOT NULL,
  "status" "MetricDefinitionStatus" NOT NULL DEFAULT 'active',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "MetricDefinition_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MetricDefinition_org_dataset_fkey"
    FOREIGN KEY ("organizationId", "datasetId") REFERENCES "Dataset"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MetricDefinition_key_check" CHECK ("key" ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT "MetricDefinition_label_check" CHECK (length(btrim("label")) > 0),
  CONSTRAINT "MetricDefinition_unit_check" CHECK (length(btrim("canonicalUnit")) > 0),
  CONSTRAINT "MetricDefinition_calc_version_check" CHECK (length(btrim("calculationVersion")) > 0),
  CONSTRAINT "MetricDefinition_organizationId_id_key" UNIQUE ("organizationId", "id"),
  CONSTRAINT "MetricDefinition_organizationId_key_key" UNIQUE ("organizationId", "key")
);

CREATE TABLE "MetricObservation" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "datasetVersionId" text NOT NULL,
  "regionId" text NOT NULL,
  "metricDefinitionId" text NOT NULL,
  "periodStart" timestamptz NOT NULL,
  "periodEnd" timestamptz NOT NULL,
  "periodLabel" text,
  "numericValue" numeric(20, 6),
  "textValue" text,
  "booleanValue" boolean,
  "unit" text NOT NULL,
  "dimensionHash" text NOT NULL,
  "dimensions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "sourceRowNumber" integer,
  "sourceReference" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "MetricObservation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MetricObservation_org_datasetVersion_fkey"
    FOREIGN KEY ("organizationId", "datasetVersionId") REFERENCES "DatasetVersion"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MetricObservation_regionId_fkey"
    FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MetricObservation_org_metricDefinition_fkey"
    FOREIGN KEY ("organizationId", "metricDefinitionId") REFERENCES "MetricDefinition"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MetricObservation_period_check" CHECK ("periodEnd" >= "periodStart"),
  CONSTRAINT "MetricObservation_value_oneof_check" CHECK (
    (CASE WHEN "numericValue" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "textValue" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "booleanValue" IS NULL THEN 0 ELSE 1 END) = 1
  ),
  CONSTRAINT "MetricObservation_unit_check" CHECK (length(btrim("unit")) > 0),
  CONSTRAINT "MetricObservation_dimension_hash_check" CHECK ("dimensionHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "MetricObservation_source_row_check" CHECK ("sourceRowNumber" IS NULL OR "sourceRowNumber" > 0),
  CONSTRAINT "MetricObservation_organizationId_id_key" UNIQUE ("organizationId", "id"),
  CONSTRAINT "MetricObservation_dedupe_key" UNIQUE ("organizationId", "datasetVersionId", "metricDefinitionId", "regionId", "periodStart", "periodEnd", "dimensionHash", "sourceRowNumber")
);

CREATE TABLE "ObservationQuality" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "observationId" text NOT NULL,
  "severity" "ObservationQualitySeverity" NOT NULL,
  "state" "ObservationQualityState" NOT NULL,
  "code" text NOT NULL,
  "message" text NOT NULL,
  "details" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ObservationQuality_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ObservationQuality_org_observation_fkey"
    FOREIGN KEY ("organizationId", "observationId") REFERENCES "MetricObservation"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MetricAggregate" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "datasetVersionId" text NOT NULL,
  "metricDefinitionId" text NOT NULL,
  "regionId" text NOT NULL,
  "periodStart" timestamptz NOT NULL,
  "periodEnd" timestamptz NOT NULL,
  "dimensionHash" text NOT NULL,
  "dimensions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "aggregateType" "MetricAggregationType" NOT NULL,
  "numericValue" numeric(20, 6),
  "textValue" text,
  "booleanValue" boolean,
  "unit" text NOT NULL,
  "calculationVersion" text NOT NULL,
  "observationCount" integer NOT NULL,
  "qualitySummary" jsonb NOT NULL,
  "datasetVersionIds" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "MetricAggregate_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MetricAggregate_org_datasetVersion_fkey"
    FOREIGN KEY ("organizationId", "datasetVersionId") REFERENCES "DatasetVersion"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MetricAggregate_org_metricDefinition_fkey"
    FOREIGN KEY ("organizationId", "metricDefinitionId") REFERENCES "MetricDefinition"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MetricAggregate_regionId_fkey"
    FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MetricAggregate_period_check" CHECK ("periodEnd" >= "periodStart"),
  CONSTRAINT "MetricAggregate_value_oneof_check" CHECK (
    (CASE WHEN "numericValue" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "textValue" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "booleanValue" IS NULL THEN 0 ELSE 1 END) = 1
  ),
  CONSTRAINT "MetricAggregate_count_check" CHECK ("observationCount" > 0),
  CONSTRAINT "MetricAggregate_dimension_hash_check" CHECK ("dimensionHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "MetricAggregate_organizationId_id_key" UNIQUE ("organizationId", "id"),
  CONSTRAINT "MetricAggregate_lookup_key" UNIQUE ("organizationId", "metricDefinitionId", "regionId", "periodStart", "periodEnd", "dimensionHash", "aggregateType", "calculationVersion")
);

CREATE TABLE "MetricAggregateLineage" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "aggregateId" text NOT NULL,
  "observationId" text NOT NULL,
  "datasetVersionId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "MetricAggregateLineage_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MetricAggregateLineage_org_aggregate_fkey"
    FOREIGN KEY ("organizationId", "aggregateId") REFERENCES "MetricAggregate"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MetricAggregateLineage_org_observation_fkey"
    FOREIGN KEY ("organizationId", "observationId") REFERENCES "MetricObservation"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MetricAggregateLineage_org_datasetVersion_fkey"
    FOREIGN KEY ("organizationId", "datasetVersionId") REFERENCES "DatasetVersion"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MetricAggregateLineage_organizationId_aggregateId_observationId_key" UNIQUE ("organizationId", "aggregateId", "observationId")
);

CREATE INDEX "MetricDefinition_organizationId_status_key_idx" ON "MetricDefinition"("organizationId", "status", "key");
CREATE INDEX "MetricDefinition_organizationId_datasetId_idx" ON "MetricDefinition"("organizationId", "datasetId");

CREATE INDEX "MetricObservation_main_read_idx" ON "MetricObservation"("organizationId", "metricDefinitionId", "regionId", "periodStart", "periodEnd");
CREATE INDEX "MetricObservation_organizationId_datasetVersionId_idx" ON "MetricObservation"("organizationId", "datasetVersionId");
CREATE INDEX "MetricObservation_organizationId_dimensionHash_idx" ON "MetricObservation"("organizationId", "dimensionHash");

CREATE INDEX "ObservationQuality_organizationId_observationId_severity_createdAt_idx" ON "ObservationQuality"("organizationId", "observationId", "severity", "createdAt");
CREATE INDEX "ObservationQuality_organizationId_code_createdAt_idx" ON "ObservationQuality"("organizationId", "code", "createdAt");

CREATE INDEX "MetricAggregate_organizationId_datasetVersionId_idx" ON "MetricAggregate"("organizationId", "datasetVersionId");
CREATE INDEX "MetricAggregate_main_read_idx" ON "MetricAggregate"("organizationId", "metricDefinitionId", "regionId", "periodStart", "periodEnd");
CREATE INDEX "MetricAggregate_organizationId_dimensionHash_idx" ON "MetricAggregate"("organizationId", "dimensionHash");

CREATE INDEX "MetricAggregateLineage_organizationId_observationId_idx" ON "MetricAggregateLineage"("organizationId", "observationId");
CREATE INDEX "MetricAggregateLineage_organizationId_datasetVersionId_idx" ON "MetricAggregateLineage"("organizationId", "datasetVersionId");

ALTER TABLE "MetricDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MetricDefinition" FORCE ROW LEVEL SECURITY;
ALTER TABLE "MetricObservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MetricObservation" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ObservationQuality" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ObservationQuality" FORCE ROW LEVEL SECURITY;
ALTER TABLE "MetricAggregate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MetricAggregate" FORCE ROW LEVEL SECURITY;
ALTER TABLE "MetricAggregateLineage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MetricAggregateLineage" FORCE ROW LEVEL SECURITY;

CREATE POLICY metric_definition_tenant ON "MetricDefinition"
  USING ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true')
  WITH CHECK ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true');
CREATE POLICY metric_observation_tenant ON "MetricObservation"
  USING ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true')
  WITH CHECK ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true');
CREATE POLICY observation_quality_tenant ON "ObservationQuality"
  USING ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true')
  WITH CHECK ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true');
CREATE POLICY metric_aggregate_tenant ON "MetricAggregate"
  USING ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true')
  WITH CHECK ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true');
CREATE POLICY metric_aggregate_lineage_tenant ON "MetricAggregateLineage"
  USING ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true')
  WITH CHECK ("organizationId" = nullif(current_setting('acres.organization_id', true), '') OR current_setting('acres.worker_access', true) = 'true');

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "MetricDefinition",
  "MetricObservation",
  "ObservationQuality",
  "MetricAggregate",
  "MetricAggregateLineage"
  TO acres_app, acres_test;
GRANT TRUNCATE ON
  "MetricDefinition",
  "MetricObservation",
  "ObservationQuality",
  "MetricAggregate",
  "MetricAggregateLineage"
  TO acres_test;
