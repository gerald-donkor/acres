# Prompt 379 — Managed launch readiness and storage reconciliation

## Scope and why this is next

Planning baseline: `d4f8c50` on `main`, 2026-10-16; working tree clean before
this prompt. Parent: Phase 12 managed-target amendment, approved Prompt 370,
ordered step 5 and step 7 ("Managed operations and launch evidence").

Prompts 371–378 implemented and verified all runtime, storage, scanning, outbox,
throttling, and preview deployment capabilities on Vercel:
- Private Blob browser upload adapter and presigned protocol (Prompt 371)
- Sandbox scanner container evaluation and snapshot verification (Prompts 372–373)
- Invocation-safe transactional outbox (Prompt 374)
- Queue-retention job reconciliation (Prompt 375)
- Protected managed outbox dispatch runner, after-commit kicks, and Cron function entrypoint (Prompt 376)
- Shared managed API throttling and sweep cleanup via PostgreSQL (Prompt 377)
- Services routing and first preview deployment on Vercel (`dpl_Hr9VwjL5jrA5vmsZfx7Qvi2R966b`) with all five hosted gates A–E passing (Prompt 378)

With the live preview verified, the immediate unbuilt requirements recorded in
`docs/build-plan.md` (Step 5, lines 651–653) and Prompt 370 (Section 7) are:
1. **Managed storage reconciliation**: The existing `scripts/ops/reconcile-storage-objects.js`
   only supports S3/Garage via `@aws-sdk/client-s3`. In the Vercel-managed target,
   storage is Vercel Blob (`STORAGE_PROVIDER=vercel-blob`, `BLOB_STORE_ID=store_g2fmCH5CW7TJbkN3`).
   The operational requirement to reconcile database records (`StoredObject`, `Upload`,
   `ExportArtifact`) against actual object keys in storage has no implementation for Vercel Blob.
   Extend `reconcile-storage-objects.js` with first-class `@vercel/blob` listing and
   verification, detecting missing objects (data loss) and orphan objects (leaks) with safe
   paging and pagination cursor handling.
2. **Topology-discriminated launch readiness**: `infra/launch/readiness.schema.json` and
   `readiness.example.json` only define `single-host-compose-caddy` with expectations
   for 9 host mounts (`/var/lib/docker/volumes/...`), host volume encryption, and
   Garage/Valkey secrets. `scripts/ops/check-launch-readiness.js` only understands Compose.
   Create an explicit discriminated launch-record revision supporting `vercel-managed-production`
   topology alongside `single-host-compose-caddy`, without weakening Compose checks. Define
   managed equivalents for the eleven launch categories (AWS KMS encryption at rest in Neon,
   Vercel edge TLS, Resend mail reference, managed secrets inventory, Neon PITR/branching,
   immutable deployment rollback).
3. **Managed operations runbook and inventory**: Define `infra/vercel/runbooks/managed-operations.md`
   and secret inventory under `infra/vercel/`, specifying secret rotation lifetimes, out-of-band
   migration procedures, Blob reconciliation execution, and emergency rollback procedures.

This prompt builds the operations and launch readiness verification tooling for the
Vercel-managed target. It authorizes no production deployment or launch sign-off.
Stop for phase-control approval before execution.

## References and verified interfaces

Read at execution:

- `AGENTS.md`, especially §§2, 2.1, 3, 5–10 and phase-control commands.
- `docs/build-plan.md` managed-target amendment, Prompt 370 §7, and Prompt 378 exit.
- `docs/vercel-deployment.md` "Target and gates", "Resume here", and Gates A–E verified evidence.
- `docs/launch-checklist.md` "Selected managed profile — Prompt 370" and 11 launch categories.
- `docs/operations.md` and `docs/operator-handoff.md`.
- `scripts/ops/reconcile-storage-objects.js` and `scripts/ops/reconcile-storage-objects.spec.js`.
- `scripts/ops/check-launch-readiness.js` and `scripts/ops/check-launch-readiness.spec.js`.
- `scripts/ops/check-readiness-schema.spec.js`.
- `infra/launch/readiness.schema.json` and `infra/launch/readiness.example.json`.
- `@vercel/blob` SDK documentation: `list({ token, storeId, prefix, cursor, limit, mode })` for pagination.

## SKILLS USED

- `architecture-patterns` — clean discrimination between `single-host-compose-caddy` and `vercel-managed-production` operational profiles.
- `deployment-pipeline-design` — immutable release tracking, atomic rollback, and canary/preview promotion definitions.
- `secrets-management` — secret-store reference syntax, rotation lifecycles, and zero raw secrets in readiness records.
- `security-threat-model` — updating operational trust boundaries, evidence verification, and fail-closed readiness policies.
- `security-best-practices` — constant-time verification, sanitized reconciliation output, and strict input validation.
- `postgres-best-practices` — read-only reconciliation queries and tenant context preservation.
- `javascript-testing-patterns` — comprehensive test coverage using Node test runner (`node:test`, `node:assert/strict`).
- `requesting-code-review` — stage 1 independent reviewer dispatch.
- `receiving-code-review` — stage 2 technical review evaluation and verification.
- `caveman-commit` — conventional commit formatting without AI trailers.

## Implementation sequence

### 1. Extend storage reconciliation for Vercel Blob (`scripts/ops/reconcile-storage-objects.js`)

1. Support `--provider <provider>` CLI flag and `STORAGE_PROVIDER` environment variable:
   - Accept values: `s3` (or `garage`, the existing default) and `vercel-blob` (or `blob`).
   - In `vercel-blob` mode:
     * Resolve `BLOB_STORE_ID` and `BLOB_READ_WRITE_TOKEN` (or `VERCEL_OIDC_TOKEN`).
     * Use `@vercel/blob`'s `list()` API to page through all objects in the store.
     * Handle pagination using `hasMore` and `cursor`.
     * Extract object key (`pathname`), size (`size`), and uploaded timestamp (`uploadedAt`).
     * Support `--prefix` filtering.
2. Reconcile storage inventory against database inventory:
   - The core reconciliation logic (`reconcileInventories`, `validateInventory`, state transitions)
     is already storage-agnostic. Ensure it works identically for Vercel Blob:
     * Detect missing objects (record exists in database as `accepted` / `completed` / `quarantined`,
       but absent in Blob store).
     * Detect orphan objects (object exists in Blob store but not in database).
     * Detect size mismatches (database `byteSize` differs from Blob `size`).
3. Add receipt generation for managed reconciliation:
   - Generate structured audit receipt with sanitized metadata (`provider: "vercel-blob"`,
     `storeId`, object counts, missing count, orphan count, mismatch count, execution duration).
   - Ensure no secret tokens or pre-signed URLs are logged or stored in receipts.
4. Comprehensive test coverage (`scripts/ops/reconcile-storage-objects.spec.js`):
   - Add unit tests mocking `@vercel/blob` `list` with multi-page cursor pagination.
   - Assert missing object detection against mocked Prisma records.
   - Assert orphan object detection.
   - Assert size mismatch detection.
   - Assert graceful error handling on invalid/missing credentials or network failures.

### 2. Topology-discriminated launch readiness schema (`infra/launch/readiness.schema.json`)

1. Update `readiness.schema.json` to define a discriminated schema supporting two topologies:
   - `target_architecture`: enum `["single-host-compose-caddy", "vercel-managed-production"]`.
   - Use JSON Schema conditional logic (`allOf` with `if`/`then` or `oneOf` matching `properties.target_architecture.const`)
     so that:
     * If `target_architecture == "single-host-compose-caddy"`:
       Enforce existing `REQUIRED_SECTIONS`, `REQUIRED_SECRET_KEYS` (including `garage_*` and `valkey_*`),
       and existing `volume_encryption` structure (9 host mounts).
     * If `target_architecture == "vercel-managed-production"`:
       Enforce managed sections:
       - `production_domain_tls`: Vercel edge domain, TLS status, custom certificate policy.
       - `smtp_delivery`: Resend integration policy, verified sender domain, bounce handling.
       - `secrets_management`: Vercel environment variables + Neon role secrets, rotation cadence, masking.
       - `secret_references`: Managed secrets: `session_secret_source`, `csrf_secret_source`, `cron_secret_source`,
         `db_migrator_secret_source`, `db_app_secret_source`, `blob_store_id`, `scanner_snapshot_source`.
         (Explicitly omit `garage_*` and `valkey_*`).
       - `slo_and_alerting`: SLO targets, Vercel runtime alerts, Neon monitoring.
       - `backup_and_disaster_recovery`: Neon PITR / branching policy, Blob store durability.
       - `data_retention_policy`: Account, audit, upload quarantine, export, report, and telemetry retention policies.
       - `volume_encryption`: Managed storage encryption at rest (Neon AWS KMS AES-256) and ephemeral compute isolation.
       - `graphql_introspection`: Introspection disabled enforcement.
       - `deployment_and_rollback`: Vercel immutable deployment IDs, rollback procedure, migration compatibility.
       - `optional_ai_posture`: `AI_ENABLED=false` enforcement.
2. Add template file `infra/launch/readiness.vercel.example.json`:
   - Valid template conforming to `readiness.schema.json` under `vercel-managed-production`.
   - Deliberately unresolved (`status: "unresolved"`, placeholders like `__REQUIRED_MANAGED_*__`).

### 3. Update launch readiness validator (`scripts/ops/check-launch-readiness.js`)

1. Teach `check-launch-readiness.js` to inspect `record.target_architecture`:
   - If `single-host-compose-caddy`:
     Execute the full existing Compose checks (volume encryption on 9 mounts, Caddyfile, Compose images,
     Garage/Valkey secrets). Existing behavior and test expectations remain 100% intact.
   - If `vercel-managed-production`:
     * Validate all managed sections.
     * Enforce that no raw secrets exist (all secret fields must be URI references, e.g. `vercel:acres/prod#KEY` or `vault:...`).
     * Validate that `volume_encryption` specifies approved provider mechanism (e.g. `aws_kms_managed` for Neon).
     * Validate that `deployment_and_rollback` specifies immutable Vercel deployment references and forward-compatible migrations.
     * Validate that `optional_ai_posture` enforces `AI_ENABLED=false`.
     * Fail closed on unresolved placeholders.
   - If unknown/missing `target_architecture`:
     Reject with explicit error `Unknown target architecture: "<value>"`.
2. Update `scripts/ops/check-launch-readiness.spec.js` and `scripts/ops/check-readiness-schema.spec.js`:
   - Assert `readiness.vercel.example.json` passes schema validation.
   - Assert `check-launch-readiness.js` evaluates `readiness.vercel.example.json` and reports unresolved categories without throwing schema or runtime crashes.
   - Assert `check-launch-readiness.js` passes when all categories in a managed record are resolved and approved with valid evidence.
   - Assert `check-launch-readiness.js` rejects raw secrets in managed secret references.
   - Assert `check-launch-readiness.js` rejects unknown target architectures.
   - Assert existing Compose tests continue to pass 100%.

### 4. Managed operations runbook (`infra/vercel/runbooks/managed-operations.md`)

1. Document complete operational procedures for the managed profile:
   - **Secret inventory & rotation**: Table of all required secrets (`DATABASE_URL`, `SESSION_SECRET`,
     `CSRF_SECRET`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`, `SCANNER_SANDBOX_SNAPSHOT_ID`),
     rotation cadence, update command via `npx vercel env add`, and zero-downtime rotation.
   - **Out-of-band migration procedure**: Executing Prisma migrations against Neon direct migrator
     connection before deployment.
   - **Storage reconciliation**: Command to run `node scripts/ops/reconcile-storage-objects.js --provider vercel-blob`
     and triage missing or orphaned blobs.
   - **Disaster recovery & rollback**: Neon branch point-in-time recovery and Vercel instant deployment rollback.
   - **Scanner snapshot refresh**: Rebuilding ClamAV CVD snapshots every 48 hours via `build-scanner-snapshot.js`.

### 5. Review, documentation, and local commit

1. Self-verify all changes, run `npm run ops:templates-test`, and review git diff.
2. Dispatch independent read-only reviewer via `requesting-code-review` subagent.
3. Evaluate reviewer feedback with `receiving-code-review`.
4. Update `docs/vercel-deployment.md`, `docs/launch-checklist.md`, `docs/operations.md`,
   and `docs/build-plan.md`.
5. Commit locally to `main` using `caveman-commit`. Do not push.

## Acceptance criteria

- `scripts/ops/reconcile-storage-objects.js` supports `--provider vercel-blob`, pages via `@vercel/blob` `list()`,
  and detects missing/orphan objects with unit test evidence.
- `infra/launch/readiness.schema.json` cleanly discriminates `single-host-compose-caddy` and `vercel-managed-production`.
- `infra/launch/readiness.vercel.example.json` exists, is structurally valid against the schema, and models all 11 managed launch categories.
- `scripts/ops/check-launch-readiness.js` validates both `single-host-compose-caddy` and `vercel-managed-production` records fail-closed without weakening either profile.
- `infra/vercel/runbooks/managed-operations.md` documents secret inventory, migration, storage reconciliation, and DR procedures.
- All template, ops, lint, typecheck, and server test suites pass.

## Verification

Execute with Node 24:

```bash
npm run ops:templates-test
node scripts/ops/check-launch-readiness.js --record infra/launch/readiness.example.json
node scripts/ops/check-launch-readiness.js --record infra/launch/readiness.vercel.example.json
npm run lint
npm run typecheck
npm run test:server
git diff --check
```

## Non-goals, impact and rollback

- Non-goals: No production promotion; no paid tier upgrades; no custom domain assignment; no mock passes; no alteration of existing Compose+Caddy tests or fixtures.
- Impact: Extends operations and launch tooling to support the Vercel-managed target while preserving the existing Compose self-hosted profile.
- Rollback: Revert changes to `scripts/ops/` and `infra/launch/`.

## Review and completion

Dispatch an independent reviewer subagent with baseline/HEAD identities, prompt, all changes, schema, and verification evidence. Evaluate feedback with technical rigor using `receiving-code-review`. Record results in `docs/vercel-deployment.md`, update `docs/build-plan.md`, and commit to `main` using `caveman-commit`.
