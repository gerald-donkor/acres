-- Keep aggregate snapshots immutable per dataset version.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MetricAggregate_lookup_key'
  ) THEN
    ALTER TABLE "MetricAggregate" DROP CONSTRAINT "MetricAggregate_lookup_key";
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MetricAggregate_versioned_lookup_key'
  ) THEN
    ALTER TABLE "MetricAggregate"
      ADD CONSTRAINT "MetricAggregate_versioned_lookup_key"
      UNIQUE (
        "organizationId",
        "datasetVersionId",
        "metricDefinitionId",
        "regionId",
        "periodStart",
        "periodEnd",
        "dimensionHash",
        "aggregateType",
        "calculationVersion"
      );
  END IF;
END $$;
