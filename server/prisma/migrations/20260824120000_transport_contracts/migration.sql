CREATE TYPE "IdempotencyState" AS ENUM ('in_progress', 'succeeded');

CREATE TABLE "IdempotencyRecord" (
  "id" text NOT NULL,
  "keyDigest" text NOT NULL,
  "accountId" text NOT NULL,
  "organizationId" text,
  "operation" text NOT NULL,
  "requestHash" text NOT NULL,
  "state" "IdempotencyState" NOT NULL,
  "responseStatus" integer,
  "responseBody" jsonb,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  "expiresAt" timestamp(3) NOT NULL,

  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdempotencyRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IdempotencyRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "IdempotencyRecord_accountId_organizationId_operation_expiresAt_idx"
  ON "IdempotencyRecord"("accountId", "organizationId", "operation", "expiresAt");

CREATE INDEX "IdempotencyRecord_expiresAt_idx"
  ON "IdempotencyRecord"("expiresAt");

CREATE UNIQUE INDEX "IdempotencyRecord_unique_scope"
  ON "IdempotencyRecord"(
    "accountId",
    COALESCE("organizationId", '00000000-0000-0000-0000-000000000000'),
    "operation",
    "keyDigest"
  );

ALTER TABLE "IdempotencyRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdempotencyRecord" FORCE ROW LEVEL SECURITY;

CREATE POLICY idempotency_account_or_org_select ON "IdempotencyRecord"
  FOR SELECT
  USING (
    "accountId" = current_setting('acres.account_id', true)
    AND (
      "organizationId" IS NULL
      OR "organizationId" = current_setting('acres.organization_id', true)
    )
  );

CREATE POLICY idempotency_account_or_org_insert ON "IdempotencyRecord"
  FOR INSERT
  WITH CHECK (
    "accountId" = current_setting('acres.account_id', true)
    AND (
      "organizationId" IS NULL
      OR "organizationId" = current_setting('acres.organization_id', true)
    )
  );

CREATE POLICY idempotency_account_or_org_update ON "IdempotencyRecord"
  FOR UPDATE
  USING (
    "accountId" = current_setting('acres.account_id', true)
    AND (
      "organizationId" IS NULL
      OR "organizationId" = current_setting('acres.organization_id', true)
    )
  )
  WITH CHECK (
    "accountId" = current_setting('acres.account_id', true)
    AND (
      "organizationId" IS NULL
      OR "organizationId" = current_setting('acres.organization_id', true)
    )
  );

GRANT SELECT, INSERT, UPDATE ON "IdempotencyRecord" TO acres_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "IdempotencyRecord" TO acres_test;
