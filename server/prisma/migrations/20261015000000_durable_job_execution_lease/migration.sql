-- Migration: 20261015000000_durable_job_execution_lease
-- Additive execution lease on DurableJob (prompt 370, Vercel Queues consumer).
--
-- Vercel Queues delivers at least once and may re-invoke a crashed consumer,
-- so provider deduplication alone cannot guarantee one live executor per job.
-- `leaseOwner`/`leaseUntil` are claimed with one conditional UPDATE/INSERT
-- outside any long transaction; an expired lease identifies a lost executor
-- whose work may be resumed. Both columns are nullable, existing rows need no
-- backfill, and the existing durable_job_tenant RLS policy covers them.
-- ALTER TABLE preserves table-level grants; the GRANT below restates them
-- following the 20260909000000_dashboard_view_schema_version convention,
-- without widening the original 20260824170000 grant (no DELETE).

ALTER TABLE "DurableJob" ADD COLUMN "leaseOwner" TEXT;
ALTER TABLE "DurableJob" ADD COLUMN "leaseUntil" TIMESTAMP(3);

ALTER TABLE "DurableJob" ADD CONSTRAINT "DurableJob_lease_pair_check"
  CHECK (("leaseOwner" IS NULL) = ("leaseUntil" IS NULL));

GRANT SELECT, INSERT, UPDATE ON "DurableJob" TO acres_app, acres_test;
