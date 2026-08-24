ALTER TABLE "MetricObservation"
  ALTER COLUMN "numericValue" TYPE numeric(26, 6);

ALTER TABLE "MetricAggregate"
  ALTER COLUMN "numericValue" TYPE numeric(26, 6);
