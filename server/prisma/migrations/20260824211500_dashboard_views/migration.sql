-- Phase 9 saved analytical dashboard views.

CREATE TYPE "DashboardViewStatus" AS ENUM ('active', 'archived');

CREATE TABLE "DashboardView" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "ownerAccountId" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "filters" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "presentation" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" "DashboardViewStatus" NOT NULL DEFAULT 'active',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "DashboardView_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DashboardView_ownerAccountId_fkey"
    FOREIGN KEY ("ownerAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "DashboardView_name_check" CHECK (length(btrim("name")) > 0 AND length("name") <= 120),
  CONSTRAINT "DashboardView_description_check" CHECK ("description" IS NULL OR length("description") <= 500),
  CONSTRAINT "DashboardView_organizationId_id_key" UNIQUE ("organizationId", "id")
);

CREATE INDEX "DashboardView_organizationId_status_updatedAt_idx"
  ON "DashboardView"("organizationId", "status", "updatedAt");
CREATE INDEX "DashboardView_organizationId_ownerAccountId_updatedAt_idx"
  ON "DashboardView"("organizationId", "ownerAccountId", "updatedAt");

ALTER TABLE "DashboardView" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DashboardView" FORCE ROW LEVEL SECURITY;

CREATE POLICY dashboard_view_tenant ON "DashboardView"
  USING ("organizationId" = nullif(current_setting('acres.organization_id', true), ''))
  WITH CHECK ("organizationId" = nullif(current_setting('acres.organization_id', true), ''));

GRANT SELECT, INSERT, UPDATE, DELETE ON "DashboardView" TO acres_app, acres_test;
GRANT TRUNCATE ON "DashboardView" TO acres_test;
