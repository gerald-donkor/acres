-- Prisma SQL generated with:
-- npx prisma migrate diff --from-schema /tmp/acres-schema-before-22.prisma --to-schema prisma/schema.prisma --script
-- The local container had no PostgreSQL service, so this migration must be
-- applied and status-checked by `prisma migrate deploy` before enabling tenancy.

-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('owner', 'admin', 'analyst', 'viewer');

-- CreateEnum
CREATE TYPE "AccountTokenPurpose" AS ENUM ('password_recovery', 'email_verification');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('organization_created', 'organization_updated', 'invitation_issued', 'invitation_revoked', 'invitation_accepted', 'membership_role_changed', 'membership_revoked', 'ownership_transferred');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedByAccountId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByAccountId" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountToken" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "purpose" "AccountTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AccountToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorAccountId" TEXT,
    "action" "AuditAction" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Membership_accountId_revokedAt_organizationId_idx" ON "Membership"("accountId", "revokedAt", "organizationId");

-- CreateIndex
CREATE INDEX "Membership_organizationId_revokedAt_role_idx" ON "Membership"("organizationId", "revokedAt", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_accountId_key" ON "Membership"("organizationId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_revokedAt_acceptedAt_createdAt_idx" ON "Invitation"("organizationId", "revokedAt", "acceptedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountToken_tokenHash_key" ON "AccountToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountToken_accountId_purpose_revokedAt_consumedAt_expires_idx" ON "AccountToken"("accountId", "purpose", "revokedAt", "consumedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "AccountToken_expiresAt_idx" ON "AccountToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_action_createdAt_idx" ON "AuditEvent"("organizationId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorAccountId_createdAt_idx" ON "AuditEvent"("actorAccountId", "createdAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedByAccountId_fkey" FOREIGN KEY ("invitedByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptedByAccountId_fkey" FOREIGN KEY ("acceptedByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorAccountId_fkey" FOREIGN KEY ("actorAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Invitation_one_live_email_per_org_idx"
  ON "Invitation"("organizationId", "email")
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

CREATE UNIQUE INDEX "AccountToken_one_live_purpose_per_account_idx"
  ON "AccountToken"("accountId", "purpose")
  WHERE "consumedAt" IS NULL AND "revokedAt" IS NULL;

CREATE OR REPLACE FUNCTION public.acres_current_uuid(setting_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  setting_value text;
BEGIN
  setting_value := current_setting(setting_name, true);
  IF setting_value IS NULL OR setting_value = '' THEN
    RETURN NULL;
  END IF;

  IF setting_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;

  RETURN setting_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.acres_current_account_id()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT public.acres_current_uuid('acres.account_id');
$$;

CREATE OR REPLACE FUNCTION public.acres_current_organization_id()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT public.acres_current_uuid('acres.organization_id');
$$;

CREATE OR REPLACE FUNCTION public.acres_current_invitation_token_hash()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(current_setting('acres.invitation_token_hash', true), '');
$$;

CREATE OR REPLACE FUNCTION public.acres_guard_last_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  org_id text;
  live_owner_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  org_id := OLD."organizationId";

  IF OLD.role <> 'owner'::"OrganizationRole" OR OLD."revokedAt" IS NOT NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.role = 'owner'::"OrganizationRole" AND NEW."revokedAt" IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM "Organization" WHERE id = org_id FOR UPDATE;

  SELECT count(*)
    INTO live_owner_count
    FROM "Membership"
   WHERE "organizationId" = org_id
     AND role = 'owner'::"OrganizationRole"
     AND "revokedAt" IS NULL
     AND id <> OLD.id;

  IF live_owner_count < 1 THEN
    RAISE EXCEPTION 'cannot remove last active owner'
      USING ERRCODE = '23514';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER "Membership_last_owner_guard"
BEFORE UPDATE OR DELETE ON "Membership"
FOR EACH ROW EXECUTE FUNCTION public.acres_guard_last_owner();

ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "Organization" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;

CREATE POLICY "organization_member_read"
  ON "Organization"
  FOR SELECT
  USING (
    id = public.acres_current_organization_id()
    OR EXISTS (
      SELECT 1 FROM "Membership" m
      WHERE m."organizationId" = "Organization".id
        AND m."accountId" = public.acres_current_account_id()
        AND m."revokedAt" IS NULL
    )
  );

CREATE POLICY "organization_context_insert_update"
  ON "Organization"
  FOR ALL
  USING (id = public.acres_current_organization_id())
  WITH CHECK (
    id = public.acres_current_organization_id()
    OR public.acres_current_account_id() IS NOT NULL
  );

CREATE POLICY "membership_context_access"
  ON "Membership"
  FOR ALL
  USING (
    "organizationId" = public.acres_current_organization_id()
    OR "accountId" = public.acres_current_account_id()
  )
  WITH CHECK ("organizationId" = public.acres_current_organization_id());

CREATE POLICY "invitation_context_access"
  ON "Invitation"
  FOR ALL
  USING (
    "organizationId" = public.acres_current_organization_id()
    OR (
      "tokenHash" = public.acres_current_invitation_token_hash()
      AND "acceptedAt" IS NULL
      AND "revokedAt" IS NULL
    )
  )
  WITH CHECK ("organizationId" = public.acres_current_organization_id());

CREATE POLICY "audit_context_select"
  ON "AuditEvent"
  FOR SELECT
  USING ("organizationId" = public.acres_current_organization_id());

CREATE POLICY "audit_context_insert"
  ON "AuditEvent"
  FOR INSERT
  WITH CHECK ("organizationId" = public.acres_current_organization_id());

REVOKE UPDATE, DELETE ON "AuditEvent" FROM acres_app, acres_test;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Organization", "Membership", "Invitation" TO acres_app, acres_test;
GRANT SELECT, INSERT ON "AuditEvent" TO acres_app, acres_test;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AccountToken" TO acres_app, acres_test;
