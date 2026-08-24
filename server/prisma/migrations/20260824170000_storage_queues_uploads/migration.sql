-- Phase 6 storage, queue, worker, and upload ledger.

CREATE TYPE "StoredObjectState" AS ENUM ('pending_upload', 'quarantined', 'accepted', 'rejected', 'deleted');
CREATE TYPE "UploadState" AS ENUM ('pending_upload', 'completed', 'scanning', 'accepted', 'rejected', 'cancelled', 'expired');
CREATE TYPE "ScanStatus" AS ENUM ('pending', 'clean', 'infected', 'failed');
CREATE TYPE "OutboxState" AS ENUM ('pending', 'dispatched', 'retrying', 'dead_lettered');
CREATE TYPE "DurableJobState" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'dead_lettered');

CREATE TABLE "StoredObject" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "bucket" text NOT NULL,
  "objectKey" text NOT NULL UNIQUE,
  "originalFilename" text NOT NULL,
  "mediaType" text NOT NULL,
  "detectedMediaType" text,
  "byteCount" bigint,
  "checksumAlgorithm" text NOT NULL,
  "checksumHex" text,
  "state" "StoredObjectState" NOT NULL DEFAULT 'pending_upload',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "deletedAt" timestamptz,
  CONSTRAINT "StoredObject_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StoredObject_checksumAlgorithm_check"
    CHECK ("checksumAlgorithm" = 'sha256'),
  CONSTRAINT "StoredObject_byteCount_check"
    CHECK ("byteCount" IS NULL OR "byteCount" >= 0),
  CONSTRAINT "StoredObject_objectKey_check"
    CHECK ("objectKey" !~ '(^/|\\.\\.|//)')
);

CREATE TABLE "Upload" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "actorAccountId" text NOT NULL,
  "storedObjectId" text NOT NULL,
  "state" "UploadState" NOT NULL DEFAULT 'pending_upload',
  "declaredFilename" text NOT NULL,
  "declaredMediaType" text NOT NULL,
  "declaredByteCount" bigint NOT NULL,
  "completedByteCount" bigint,
  "checksumAlgorithm" text NOT NULL,
  "checksumHex" text,
  "scanStatus" "ScanStatus",
  "scanResult" text,
  "failureCode" text,
  "failureMessage" text,
  "progressStage" text NOT NULL DEFAULT 'created',
  "progressPercent" integer NOT NULL DEFAULT 0,
  "version" integer NOT NULL DEFAULT 1,
  "presignedUploadExpiresAt" timestamptz NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "completedAt" timestamptz,
  "cancelledAt" timestamptz,
  "acceptedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "Upload_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Upload_actorAccountId_fkey"
    FOREIGN KEY ("actorAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Upload_storedObjectId_fkey"
    FOREIGN KEY ("storedObjectId") REFERENCES "StoredObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Upload_declaredByteCount_check"
    CHECK ("declaredByteCount" > 0),
  CONSTRAINT "Upload_completedByteCount_check"
    CHECK ("completedByteCount" IS NULL OR "completedByteCount" >= 0),
  CONSTRAINT "Upload_checksumAlgorithm_check"
    CHECK ("checksumAlgorithm" = 'sha256'),
  CONSTRAINT "Upload_progressPercent_check"
    CHECK ("progressPercent" >= 0 AND "progressPercent" <= 100),
  CONSTRAINT "Upload_version_check"
    CHECK ("version" > 0)
);

CREATE TABLE "OutboxEvent" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text,
  "eventType" text NOT NULL,
  "aggregateType" text NOT NULL,
  "aggregateId" text NOT NULL,
  "aggregateVersion" integer NOT NULL,
  "payload" jsonb NOT NULL,
  "state" "OutboxState" NOT NULL DEFAULT 'pending',
  "lockedBy" text,
  "lockedUntil" timestamptz,
  "attempts" integer NOT NULL DEFAULT 0,
  "maxAttempts" integer NOT NULL DEFAULT 5,
  "nextAttemptAt" timestamptz NOT NULL DEFAULT now(),
  "lastErrorCode" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "dispatchedAt" timestamptz,
  CONSTRAINT "OutboxEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OutboxEvent_attempts_check"
    CHECK ("attempts" >= 0 AND "maxAttempts" > 0 AND "aggregateVersion" > 0)
);

CREATE TABLE "DurableJob" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text,
  "uploadId" text,
  "jobType" text NOT NULL,
  "deterministicKey" text NOT NULL UNIQUE,
  "state" "DurableJobState" NOT NULL DEFAULT 'queued',
  "attempts" integer NOT NULL DEFAULT 0,
  "maxAttempts" integer NOT NULL DEFAULT 5,
  "lastErrorCode" text,
  "lastErrorMessage" text,
  "startedAt" timestamptz,
  "finishedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "DurableJob_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DurableJob_attempts_check"
    CHECK ("attempts" >= 0 AND "maxAttempts" > 0)
);

CREATE TABLE "JobProgressEvent" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text NOT NULL,
  "uploadId" text NOT NULL,
  "durableJobId" text,
  "stage" text NOT NULL,
  "percent" integer NOT NULL,
  "message" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "JobProgressEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "JobProgressEvent_uploadId_fkey"
    FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "JobProgressEvent_durableJobId_fkey"
    FOREIGN KEY ("durableJobId") REFERENCES "DurableJob"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "JobProgressEvent_percent_check"
    CHECK ("percent" >= 0 AND "percent" <= 100)
);

CREATE TABLE "JobDeadLetter" (
  "id" text PRIMARY KEY DEFAULT uuidv7(),
  "organizationId" text,
  "durableJobId" text,
  "outboxEventId" text,
  "reasonCode" text NOT NULL,
  "reasonMessage" text NOT NULL,
  "payload" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "JobDeadLetter_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "JobDeadLetter_durableJobId_fkey"
    FOREIGN KEY ("durableJobId") REFERENCES "DurableJob"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OutboxEvent_event_aggregate_version_key"
  ON "OutboxEvent"("eventType", "aggregateType", "aggregateId", "aggregateVersion");
CREATE INDEX "StoredObject_organizationId_state_createdAt_idx" ON "StoredObject"("organizationId", "state", "createdAt");
CREATE INDEX "StoredObject_organizationId_checksumHex_idx" ON "StoredObject"("organizationId", "checksumHex");
CREATE INDEX "Upload_organizationId_state_updatedAt_idx" ON "Upload"("organizationId", "state", "updatedAt");
CREATE INDEX "Upload_organizationId_actorAccountId_createdAt_idx" ON "Upload"("organizationId", "actorAccountId", "createdAt");
CREATE INDEX "Upload_expiresAt_state_idx" ON "Upload"("expiresAt", "state");
CREATE INDEX "OutboxEvent_state_nextAttemptAt_lockedUntil_idx" ON "OutboxEvent"("state", "nextAttemptAt", "lockedUntil");
CREATE INDEX "OutboxEvent_organizationId_state_createdAt_idx" ON "OutboxEvent"("organizationId", "state", "createdAt");
CREATE INDEX "DurableJob_organizationId_state_updatedAt_idx" ON "DurableJob"("organizationId", "state", "updatedAt");
CREATE INDEX "DurableJob_state_updatedAt_idx" ON "DurableJob"("state", "updatedAt");
CREATE INDEX "JobProgressEvent_organizationId_uploadId_createdAt_idx" ON "JobProgressEvent"("organizationId", "uploadId", "createdAt");
CREATE INDEX "JobDeadLetter_organizationId_createdAt_idx" ON "JobDeadLetter"("organizationId", "createdAt");

ALTER TABLE "StoredObject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoredObject" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Upload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Upload" FORCE ROW LEVEL SECURITY;
ALTER TABLE "OutboxEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboxEvent" FORCE ROW LEVEL SECURITY;
ALTER TABLE "DurableJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DurableJob" FORCE ROW LEVEL SECURITY;
ALTER TABLE "JobProgressEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JobProgressEvent" FORCE ROW LEVEL SECURITY;
ALTER TABLE "JobDeadLetter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JobDeadLetter" FORCE ROW LEVEL SECURITY;

CREATE POLICY stored_object_tenant ON "StoredObject"
  USING (
    "organizationId" = nullif(current_setting('acres.organization_id', true), '')
    OR current_setting('acres.worker_access', true) = 'true'
  )
  WITH CHECK (
    "organizationId" = nullif(current_setting('acres.organization_id', true), '')
    OR current_setting('acres.worker_access', true) = 'true'
  );
CREATE POLICY upload_tenant ON "Upload"
  USING (
    "organizationId" = nullif(current_setting('acres.organization_id', true), '')
    OR current_setting('acres.worker_access', true) = 'true'
  )
  WITH CHECK (
    "organizationId" = nullif(current_setting('acres.organization_id', true), '')
    OR current_setting('acres.worker_access', true) = 'true'
  );
CREATE POLICY outbox_tenant ON "OutboxEvent"
  USING (
    "organizationId" = nullif(current_setting('acres.organization_id', true), '')
    OR "organizationId" IS NULL
    OR current_setting('acres.worker_access', true) = 'true'
  )
  WITH CHECK (
    "organizationId" = nullif(current_setting('acres.organization_id', true), '')
    OR "organizationId" IS NULL
    OR current_setting('acres.worker_access', true) = 'true'
  );
CREATE POLICY durable_job_tenant ON "DurableJob"
  USING (
    "organizationId" = nullif(current_setting('acres.organization_id', true), '')
    OR "organizationId" IS NULL
    OR current_setting('acres.worker_access', true) = 'true'
  )
  WITH CHECK (
    "organizationId" = nullif(current_setting('acres.organization_id', true), '')
    OR "organizationId" IS NULL
    OR current_setting('acres.worker_access', true) = 'true'
  );
CREATE POLICY job_progress_tenant ON "JobProgressEvent"
  USING (
    "organizationId" = nullif(current_setting('acres.organization_id', true), '')
    OR current_setting('acres.worker_access', true) = 'true'
  )
  WITH CHECK (
    "organizationId" = nullif(current_setting('acres.organization_id', true), '')
    OR current_setting('acres.worker_access', true) = 'true'
  );
CREATE POLICY job_dead_letter_tenant ON "JobDeadLetter"
  USING (
    "organizationId" = nullif(current_setting('acres.organization_id', true), '')
    OR "organizationId" IS NULL
    OR current_setting('acres.worker_access', true) = 'true'
  )
  WITH CHECK (
    "organizationId" = nullif(current_setting('acres.organization_id', true), '')
    OR "organizationId" IS NULL
    OR current_setting('acres.worker_access', true) = 'true'
  );

GRANT SELECT, INSERT, UPDATE ON
  "StoredObject", "Upload", "OutboxEvent", "DurableJob", "JobProgressEvent", "JobDeadLetter"
  TO acres_app, acres_test;
GRANT DELETE ON "StoredObject", "OutboxEvent" TO acres_app, acres_test;
