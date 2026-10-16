-- Global pre-auth infrastructure, like Session: no tenant context or RLS bypass.
-- Existing migrator default privileges grant runtime DML only.
CREATE TABLE "ThrottleBucket" (
  "key" TEXT NOT NULL CHECK ("key" ~ '^[0-9a-f]{64}$'),
  "tier" TEXT NOT NULL CHECK (length("tier") BETWEEN 1 AND 64),
  "hits" TIMESTAMPTZ(3)[] NOT NULL DEFAULT ARRAY[]::TIMESTAMPTZ(3)[],
  "windowExpiresAt" TIMESTAMPTZ(3) NOT NULL,
  "blockedUntil" TIMESTAMPTZ(3),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ThrottleBucket_pkey" PRIMARY KEY ("key", "tier"),
  CONSTRAINT "ThrottleBucket_hits_bound" CHECK (cardinality("hits") <= 1000001)
);
CREATE INDEX "ThrottleBucket_expiresAt_idx" ON "ThrottleBucket" ("expiresAt");
