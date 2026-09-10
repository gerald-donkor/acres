-- Migration: 20260909000000_dashboard_view_schema_version
-- Additive saved-view shape version marker (prompt 68, parent Phase 9).
--
-- The ADD COLUMN statement below is the exact DDL Prisma's diff engine
-- generates for `schemaVersion Int @default(1)` in schema.prisma (verified
-- via `prisma migrate diff` against a shadow replay of the chain); the CHECK
-- constraint follows the reviewed-CHECK precedent of
-- 20260828000000_ai_generations (`AiGeneration_inputHash_check`) because the
-- Prisma schema language cannot express CHECK constraints. The GRANT
-- re-assertion matches that migration's convention; ALTER TABLE preserves
-- table-level grants, so this is a belt-and-braces restatement, not a change.
-- Existing rows backfill to 1 via the column default: the only
-- filters/presentation shape ever written. No RLS policy change.
--
-- Generation note: `prisma migrate dev` cannot run in this environment (its
-- shadow database lacks the superuser-owned PostGIS extension the
-- geography migration requires), and the live dev database has out-of-band
-- DBA drift (renamed constraints, dropped defaults) that pollutes a live-DB
-- diff. The migration was therefore composed from Prisma's own generated
-- fragment plus the reviewed CHECK, and equivalence is proved by the
-- scratch-database fresh-apply check in docs/dashboards.md.

ALTER TABLE "DashboardView" ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "DashboardView" ADD CONSTRAINT "DashboardView_schemaVersion_check" CHECK ("schemaVersion" >= 1);

GRANT SELECT, INSERT, UPDATE, DELETE ON "DashboardView" TO acres_app, acres_test;
GRANT TRUNCATE ON "DashboardView" TO acres_test;
