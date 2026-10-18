# Vercel-Managed Production Operations Runbook

This runbook documents operational procedures for Acres running under the `vercel-managed-production` architecture (`target_architecture: "vercel-managed-production"`). In this topology, compute runs on Vercel Serverless Functions, object storage is backed by Vercel Blob (`STORAGE_PROVIDER=vercel-blob`, `BLOB_STORE_ID=store_g2fmCH5CW7TJbkN3`), relational data is hosted on Neon PostgreSQL with continuous WAL archiving / point-in-time recovery (PITR), transactional email is delivered via Resend, and ClamAV upload scanning runs within ephemeral microVMs using Vercel Sandbox snapshots.

---

## 1. Secret Inventory & Rotation

All production secrets are stored in Vercel Project Environment Variables and Neon role credentials. Literal secrets are strictly forbidden from git history, build artifacts, and launch readiness records (which record indirect references of the form `vercel:acres/prod#<KEY>` or `neon:roles#<ROLE>`).

### 1.1 Secret Inventory

| Secret Name | Storage Location | Rotation Cadence | Purpose & Scope |
| --- | --- | --- | --- |
| `DATABASE_URL` | Vercel Env (`production`) | 90 days | Neon pooled connection string used by the Next.js runtime (`acres_app` role with RLS). |
| `DIRECT_URL` | Operator / CI secret store | 90 days | Neon unpooled direct connection string used exclusively for out-of-band migrations (`acres_migrator` role). |
| `SESSION_SECRET` | Vercel Env (`production`) | 90 days | 32+ character random secret used for encrypted session cookies. |
| `CSRF_SECRET` | Vercel Env (`production`) | 90 days | 32+ character random secret for CSRF token signature generation and verification. |
| `CRON_SECRET` | Vercel Env (`production`) | 90 days | Shared secret header (`Authorization: Bearer <CRON_SECRET>`) for authenticating scheduled Vercel Cron invocations. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Env (`production`) | 90 days | Token for accessing private Vercel Blob store `store_g2fmCH5CW7TJbkN3`. |
| `BLOB_STORE_ID` | Vercel Env (`production`) | Static (Store ID) | Concrete store identifier (`store_g2fmCH5CW7TJbkN3`). |
| `SCANNER_SANDBOX_SNAPSHOT_ID` | Vercel Env (`production`) | 48 hours | Active ClamAV CVD microVM snapshot identifier (`snap_...`). |
| `RESEND_API_KEY` | Vercel Env (`production`) | 90 days | API key for transactional email delivery via Resend. |

### 1.2 Zero-Downtime Secret Rotation Procedure

1. **Database Role Password Rotation (Neon)**:
   - Create a secondary password or credential in the Neon console / API for the role.
   - Update Vercel environment variable with the new connection string:
     ```bash
     npx vercel env add DATABASE_URL production
     ```
   - Trigger a zero-downtime deployment promotion to pick up the updated environment variable across all serverless regions.
   - Verify application health via `/api/health`.
   - Revoke the old Neon password.

2. **Session and CSRF Secret Rotation**:
   - Generate high-entropy 32-byte hex tokens:
     ```bash
     node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'
     ```
   - Update `SESSION_SECRET` and `CSRF_SECRET` in Vercel production environment:
     ```bash
     npx vercel env add SESSION_SECRET production
     npx vercel env add CSRF_SECRET production
     ```
   - Redeploy or promote to roll out new encryption keys. Active sessions remain valid through key rollover grace or trigger re-authentication.

3. **Vercel Blob Token Rotation**:
   - Issue a new Read/Write token for `store_g2fmCH5CW7TJbkN3` in the Vercel dashboard.
   - Update `BLOB_READ_WRITE_TOKEN` via `npx vercel env add BLOB_READ_WRITE_TOKEN production`.
   - Redeploy and verify storage health with `reconcile-storage-objects.js`.
   - Revoke the superseded token.

---

## 2. Out-of-Band Migration Procedure

Serverless functions must **never** execute database schema migrations on cold start or request execution. All Prisma migrations must be executed out-of-band against the Neon direct connection before deploying application code.

### 2.1 Execution Steps

1. **Pre-Deployment Safety Checks**:
   - Verify that migration files in `server/prisma/migrations/` follow the expand-contract pattern and are backward-compatible with the currently running application release.
   - Confirm active Neon branch and ensure an automated PITR restore point exists.

2. **Run Migrations via Migrator Connection**:
   - Export the direct migrator connection URL (bypassing connection poolers / PgBouncer):
     ```bash
     export DATABASE_URL="$NEON_DIRECT_MIGRATOR_URL"
     ```
   - Apply migrations from the repository root:
     ```bash
     npm run prisma:migrate:deploy --workspace=server
     ```
   - Verify migration status:
     ```bash
     npx prisma migrate status --schema=server/prisma/schema.prisma
     ```

3. **Post-Migration Verification**:
   - Check that all tables, PostGIS extensions, and RLS policies are intact.
   - Proceed with Vercel deployment promotion.

---

## 3. Storage Inventory Reconciliation

To ensure consistency between PostgreSQL database records (`ObjectMetadata`) and objects stored in Vercel Blob (`store_g2fmCH5CW7TJbkN3`), operators execute the storage reconciliation script.

### 3.1 Execution Command

```bash
node scripts/ops/reconcile-storage-objects.js \
  --provider vercel-blob \
  --store-id store_g2fmCH5CW7TJbkN3 \
  --record \
  --output receipts/storage-reconciliation-$(date +%Y%m%d%H%M%S).json
```

Or using environment variables:
```bash
STORAGE_PROVIDER=vercel-blob \
BLOB_STORE_ID=store_g2fmCH5CW7TJbkN3 \
node scripts/ops/reconcile-storage-objects.js
```

### 3.2 Interpreting Reconciliation Results

- **Exit Code 0 (`status: "clean"`)**:
  - Perfect parity: all database records correspond to existing Blob objects with matching sizes, and no orphan objects exist.
- **Exit Code 0 (`status: "warning"`)**:
  - Parity holds for all database records, but orphan objects were detected in the store (unless `--fail-on-orphans` is specified).
- **Exit Code 1 (`status: "failed"` / exitCode 1)**:
  - Missing objects detected (database expects an object that does not exist in Blob store), or byte size mismatch between database and storage.

### 3.3 Triage Procedures

1. **Missing Objects**:
   - Check `report.missing` array for affected pathnames and database IDs.
   - Inspect database soft-deletion status (`deletedAt`) and upload completion state.
   - If missing objects were quarantined or rejected uploads, verify that tenant data was not impacted.
2. **Orphan Objects**:
   - Check `report.orphans` for untracked paths.
   - Temporary chunks or interrupted client uploads under `temp/` older than 7 days are subject to quarantine cleanup per data retention policy.

---

## 4. Disaster Recovery & Rollback

### 4.1 Neon Point-In-Time Recovery (PITR)

Neon maintains continuous write-ahead logs (WAL) allowing restore to any second within the retention window (minimum 7 days required for production readiness).

1. **Identify Recovery Target Timestamp**:
   - Determine timestamp `T` (in UTC ISO-8601 format) immediately preceding data corruption or incident.
2. **Create Branch at Point-In-Time**:
   - In the Neon console or CLI:
     ```bash
     neonctl branches create --name recovery-branch --from-branch main --timestamp "2026-10-16T12:00:00Z"
     ```
3. **Verify Restored Database Branch**:
   - Run verification queries against `recovery-branch` to verify record parity, PostGIS geometry, and foreign keys.
4. **Switch Vercel Connection Strings**:
   - Update `DATABASE_URL` and `DIRECT_URL` in Vercel production environment to target the recovery branch.
   - Redeploy or promote to switch traffic to the recovered database.

### 4.2 Instant Vercel Deployment Rollback

If an application defect or regression is introduced in a new deployment:

1. **Locate Target Deployment ID**:
   - Read the approved `release.previous.deployment_id` from `infra/launch/readiness.json` (e.g., `dpl_...`).
2. **Trigger Instant Rollback**:
   - Execute rollback via Vercel CLI:
     ```bash
     npx vercel rollback dpl_PREVIOUS_DEPLOYMENT_ID
     ```
   - Or select "Instant Rollback" from the Vercel project deployment dashboard.
3. **Verify Routing**:
   - Vercel's edge network instantly routes traffic to the previous immutable deployment artifact without triggering a new build.
   - Confirm healthy response via production domain probe.

---

## 5. ClamAV Scanner Sandbox Snapshot Rebuild

Prompt 384 supersedes the Prompt 383 zero-downtime/closed-blocker claims.
Preparation, activation, application verification and retirement are separate
operator stages. This tool never activates a candidate or deletes any snapshot.

### 5.1 Candidate preparation and snapshot age

`npm run vercel:scanner-rebuild` inspects snapshot creation/expiry metadata,
using a 48-hour default and 168-hour CLI maximum. These are compatibility bounds,
not an inspection of CVD build times or a hosted freshness SLA. The builder
retains its CVD validation; the application retains its own signature policy and
fails closed as `scanner_unavailable` when scanning cannot proceed.

Live preparation builds without `--replace`, smoke-tests clean/EICAR samples and
optionally creates a new candidate env file. All previous and candidate snapshots
are retained on success and failure. Builder/probe sandbox cleanup uses
`deleteOrphanSnapshots: false`; a cleanup failure cannot certify preparation.
`--skip-prune` is a deprecated no-op. The standalone builder's `--replace` API
still deletes snapshots and must not be used for this lifecycle.

A successful receipt means candidate preparation only, with
`activation_status: "not_performed"`. `prune_status` is `retained` or
`not_requested`. `snapshot_recent` replaces `signatures_fresh` in receipts;
snapshot age cannot certify CVD freshness. Missing, invalid or future metadata
requests a rebuild; age equal to the threshold requests a rebuild too.

On a build-stage failure, schema-v1 receipts retain
`error: "candidate_build_failed"` and add `build_failure` with fixed `step`,
`kind`, `builder_cleanup` and boolean `snapshot_confirmed`. Step names distinguish
`builder-create`, existing command steps, `snapshot-request`, `builder-delete`,
`snapshot-metadata`, `snapshot-status` and `summary` (with `unknown` fallback).
Kinds are `command_failed`, `provider_failed`, `validation_failed` or `unknown`;
cleanup is `not_requested`, `passed`, `failed` or `unknown`. A failed delete never
becomes passed because stop was attempted. Primary failure and cleanup outcomes
remain independent. The standalone builder emits the same safe fields; raw
command/provider errors are suppressed. These fields do not certify signatures,
preparation success, deployment or historical cleanup.

Prompt 387 verified Prompt 386's receipt and later snapshot metadata but could
not establish its historical exception; the exact source-session metadata now
returns 404. Keep that failed receipt ineligible even if the snapshot reports
`created`. Never rewrite it or bypass offline handoff. A new live rebuild needs
separate bounded authorization; no retry is implicit in investigation or failure
diagnostics. See [the investigation record](../../../docs/operations.md#prompt-387--scanner-build-failure-investigation-2026-10-17).

Prompt 388 lessons: check the `preview.env` OIDC `exp` claim locally before
any live call and re-pull it when expired (it lasts about 12 hours). Pass only
`VERCEL_OIDC_TOKEN` and the fixed target variables to the producer, not the
whole pulled file. If `npx vercel@latest` hangs resolving the package, run the
cached CLI under the npx cache directly; record its version (64.5.0 here) and
re-check its help before relying on flags. A `builder-create` /
`provider_failed` receipt means no builder handle existed: there is nothing to
clean up, but the cause (provider, transport or authorization) is not
recorded. `vercel usage` returned no billing data for this Hobby team on
2026-10-17, so check Sandbox allowance in the dashboard before authorizing
another rebuild. See [the record](../../../docs/operations.md#prompt-388--bounded-scanner-candidate-rebuild-2026-10-17).

Prompt 389 adds three fields to `build_failure`, after the four above:
`provider_error` (`api_error`, `stream_error`, `timeout`, `transport`, `other`),
`provider_status` (integer 100–599 for `api_error`, else `null`) and
`provider_code` (lower-snake `^[a-z][a-z0-9_]{0,59}$` from an API error body's
`error.code` or a stream error's `code`, else `null`). They are set only when
the classified step's kind is `provider_failed` and the raw SDK error reached
the classifier; errors raised directly by the tooling (validation, command,
`builder-delete`) carry all three as `null`. Only the error class, HTTP status
and that code are read — never message, stack, body text, cause or headers.
They are a reading of the error's shape, not a certified cause, and never
certify success, cleanup or signatures. Live producer and standalone builder
runs now refuse an OIDC token with under **75 minutes** left (probes keep 30);
dry-run needs no token. See [the record](../../../docs/operations.md#prompt-389--scanner-create-diagnostics-2026-10-18).

### 5.2 Workflow and handoff

The daily 04:00 UTC schedule and default manual dispatch perform credential-free
simulation. Only manual `prepare_candidate: true` enables live preparation;
`force` alone does not. Credentials exist only on the live step, which requires
explicit opt-in, preview environment, configured region `iad1`, team
`team_zE3mp7nrEZ6a7cxRavwUMYC4` and project
`prj_q9ApajZWDgdYZetnm5s5oakEjrUD`. Target mismatches fail before SDK work.
Pinned actions, Node 24 and non-cancelling concurrency remain in place.

Each run creates a unique 0700 temporary directory and new 0600 outputs. The
allowlisted summary preserves candidate ID/hashes, execution mode and status
before local files are deleted. It is handoff information, not a deployment
receipt or signed launch evidence. The workflow does not persist runtime env
configuration or update the configured current snapshot ID for the next run.

### 5.3 Local inspection and manual preparation

```bash
npm run vercel:scanner-rebuild -- --help
npm run vercel:scanner-rebuild -- --dry-run

# With existing approved preview credentials/opt-in in the environment:
# Use a fresh restricted directory and filenames for every live preparation.
# SCANNER_PREPARATION_PARENT: operator-selected existing durable directory
# outside the repository (restricted access); /tmp is for inspection only.
candidate_dir=$(mktemp -d "${SCANNER_PREPARATION_PARENT:?select durable preparation parent}/candidate.XXXXXXXX")
chmod 700 "$candidate_dir"
npm run vercel:scanner-rebuild -- \
  --current-snapshot-id snap_ACTIVEID \
  --write-env "$candidate_dir/candidate.env" \
  --output "$candidate_dir/receipt.json"
```

Dry runs never create/modify `--write-env`, even when it names an existing file;
an optional receipt is explicitly simulation and contains no fabricated ID or
hashes. Live output destinations must be new, their parent directories must
already exist, and env destinations must resolve outside the repository.
Existing files/symlinks, normalized aliases and env/receipt collisions are
rejected before cloud work. Exclusive creation prevents later overwrite races.
Use fresh per-run receipt paths. Failures expose fixed stage codes, never raw
provider diagnostics, secret values or private absolute paths. When a snapshot
ID was confirmed it remains in the failure receipt for restricted inspection;
ambiguous candidates must be reconciled manually, never automatically deleted.

### 5.4 Offline runtime configuration handoff

New preparation receipts include `schema_version: 1` and the actual preview
team/project/region. Simulation uses `target: null`. Legacy receipts without
version/target are rejected; prepare a new candidate with this producer rather
than asserting a legacy target. A successful live receipt, all three passing
smoke/cleanup statuses and the exact Acres preview target are required.

After preparation, create a fresh local bundle (no credentials or SDK required):

```bash
node scripts/vercel/prepare-scanner-handoff.js --help
# SCANNER_HANDOFF_DIR: a NEW directory under an existing writable, durable,
# restricted parent outside the repo. Select it separately for each handoff.
node scripts/vercel/prepare-scanner-handoff.js \
  --receipt "$candidate_dir/receipt.json" \
  --output-dir "${SCANNER_HANDOFF_DIR:?select new durable handoff directory}"
```

The CLI requires Linux with procfs to anchor output writes to the owned directory.
It exclusively creates a 0700 directory and 0600 `runtime.env`/`handoff.json`.
It reads at most 64 KiB of a regular JSON receipt, refuses symlink inputs,
existing destinations, repository aliases and overlapping paths. It never sources
an env file or uses current credentials to infer identity. Help is offline.

`runtime.env` contains exactly `SCANNER_SANDBOX_SNAPSHOT_ID`,
`SCANNER_MAIN_SHA256` and `SCANNER_DAILY_SHA256`. The cadence/builder exports
`ACRES_SCANNER_*` for probes; those are different from runtime variable names.
No provider selection, credentials or signature-age defaults are added.
Preserve the previous runtime configuration separately in the restricted rollback
inventory before any later adoption.

The versioned allowlisted manifest binds receipt bytes and generated env bytes
with SHA-256 and records preparation time, target and previous/candidate identity.
These hashes establish consistency, not authenticity, provider attestation,
signing or deployed identity. The receipt is untrusted operator input. Preparation
time is neither CVD freshness nor a safe activation deadline. Activation,
deployment verification and retirement remain explicitly `not_performed`.

On failure the CLI returns nonzero with a fixed diagnostic; it retains incomplete
owned output for inspection and never recursively deletes a caller path. A
pending manifest is closed before exclusive publication; output failures do not
certify success. If local filesystem interference makes cleanup inaccessible,
treat all retained output as incomplete regardless of filenames. Preserve
pre-existing data. Resolve the failure and choose a new directory for a retry.
Temporary `/tmp` bundles are test/inspection fixtures, not durable storage.
The CI workflow still only retains an allowlisted summary and deletes temporary
files; it does not call this CLI or persist/adopt runtime configuration.

Credential-free local fixture inspection (not durable operator evidence):

```bash
inspection_dir=$(mktemp -d /tmp/acres-scanner-inspection.XXXXXXXX)
node scripts/vercel/rebuild-scanner-cadence.js --dry-run \
  --output "$inspection_dir/simulation.json"
cat "$inspection_dir/simulation.json"
# Expected exit 1: handoff_receipt_invalid; no bundle directory is created.
node scripts/vercel/prepare-scanner-handoff.js \
  --receipt "$inspection_dir/simulation.json" \
  --output-dir "$inspection_dir/rejected-bundle"
```

A simulated receipt is never eligible for handoff or activation. To inspect a
successful path without hosted calls, run `node --test
scripts/vercel/prepare-scanner-handoff.spec.js
scripts/vercel/rebuild-scanner-cadence.spec.js`; these tests create and remove
isolated local fixtures, including the live-mode receipt produced by SDK doubles.
Those doubles do not establish a hosted candidate or activation authority.

### 5.5 Manual activation, verification and retirement

1. Preserve and review the §5.4 bundle in the approved restricted configuration
   inventory. Its runtime names are `SCANNER_SANDBOX_SNAPSHOT_ID`,
   `SCANNER_MAIN_SHA256` and `SCANNER_DAILY_SHA256`. Verify the selected preview
   target and preserve previous configuration separately. Local bundle preparation
   does not update any Vercel environment.
2. With separate target authorization, update configuration and redeploy the
   application using that exact candidate. Keep previous configuration for
   rollback. No production mutation is authorized by candidate preparation.
3. Verify the deployed application's upload → scan flow and runtime identity.
   `npm run vercel:probe -- scanner` is a synthetic seam check, not application
   acceptance or proof that deployments use the new configuration.
4. Retain old snapshots while old deployments, queued/in-flight invocations or
   rollback dependencies can use them. No fixed safe retirement interval has
   been established. Retirement requires account-bound inspection, dependency
   review and an explicit bounded cleanup/resource-budget plan outside this CLI.

Prompt 386's authorized preview attempt (2026-10-17) stopped before step 2:
the cadence producer returned `candidate_build_failed` after confirming a
candidate ID, but without verified hashes or smoke/cleanup results. Preserve
that failed receipt and candidate; do not fabricate a successful handoff or
retry a bounded live attempt automatically. A failed receipt is ineligible even
if its snapshot later reports `created`. No preview variables were changed and
no recovery write or new deployment was required. Project env values are not
proof of an existing immutable deployment's configuration; metadata listing
variable names establishes only presence. Investigate the retained provider
state before separately authorizing another candidate attempt. See
[the execution record](../../../docs/operations.md#prompt-386--scanner-preview-adoption-attempt-2026-10-17).

Durable adoption, verified deployment, retirement within a free-tier resource
budget and hosted scheduled-execution evidence remain unproved by local tests.
The production plan decision and eleven launch sign-offs remain open.
