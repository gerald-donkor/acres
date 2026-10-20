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
are retained on success and failure. Builder cleanup uses
`deleteOrphanSnapshots: false`; the smoke VM, like every scan VM, uses `true`
(see Prompt 390 below). A cleanup failure cannot certify preparation.
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

Prompt 389 stage B–C lessons: on Hobby, neither `vercel usage` nor the MCP
`list_billing_charges` (`404 costs_not_found`) shows Sandbox allowance usage.
The owner reads it from the dashboard Usage page. The MCP snapshot listing
gives exact snapshot bytes to cross-check Snapshot Storage. `env pull` writes
`[SENSITIVE]` placeholders for sensitive variables; the producer needs only
`VERCEL_OIDC_TOKEN`. A `candidate_smoke_failed` receipt with both samples
`untested` and `cleanup: "passed"` means the smoke sandbox existed and the
failure came before any scan result. See [the record](../../../docs/operations.md#stage-c--the-single-confirmed-rebuild-2026-10-18).

Prompt 390 corrects the smoke stage. Through Prompt 389 it created its VM with
a top-level `snapshotId`, which SDK 3.8.0 does not accept as a create parameter
(the snapshot source is `source: { type: "snapshot", snapshotId }`). The
reading, not a hosted measurement, is that it booted the default image; no
receipt has ever passed smoke. The smoke now boots exactly as the app adapter
does: snapshot `source`, `persistent: false`, `deny-all`, 120 s session,
1 vCPU, 60 s create deadline. In order it requires `sourceSnapshotId` to equal
the candidate, then the adapter's signature check against the receipt's
`main_sha256`/`daily_sha256` and `--max-age-hours`, then the clean and EICAR
scans. It stops at the first failure. Cleanup is `delete({
deleteOrphanSnapshots: true })` (no `stop()`), then a read-only `Snapshot.get`
of the candidate that must report `created`.

`smoke_test` is now `signatures`, `clean_sample`, `eicar_sample` (each
`untested`, `passed` or `failed`) and `cleanup` (`not_requested`, `passed` or
`failed`). A `candidate_smoke_failed` receipt also carries `smoke_failure`:

- `step`: the first failing step, one of `smoke-create`, `smoke-source`,
  `smoke-signatures`, `smoke-write`, `smoke-scan-clean`, `smoke-scan-eicar`,
  `smoke-cleanup`, or `unknown`;
- `kind`: `provider_failed` (the SDK call threw), `result_failed` (it returned,
  but with the wrong exit code, output shape, boot source, signature result or
  post-delete status), or `unknown`;
- `provider_error`, `provider_status`, `provider_code`: as in `build_failure`,
  set only for `provider_failed`, otherwise `null`.

A cleanup failure after a passing primary reports `smoke-cleanup`. After a
primary failure it shows only as `cleanup: "failed"`, and `step` keeps the
primary step. Reading guide: `smoke-source` means the VM booted from the wrong
source; `result_failed` at `smoke-scan-*` means the candidate booted but
scanned wrongly. Two limits: `deleteOrphanSnapshots: true` deletes orphans
asynchronously (SDK `delete` docs), so the immediate `Snapshot.get` proves the
candidate exists right after delete, not that a later orphan sweep spared it.
That evidence remains the probe's `baseSnapshotSurvived` gate. And
`signatures: "passed"` uses the cadence `--max-age-hours` (default 48) as the
`daily.cvd` age bound, so it means "within the cadence window", nothing
stricter. These fields read the failure's shape. They never certify
cause, success or cleanup. Success, skip, simulation, build-failure and
export-failure receipts carry no `smoke_failure`. See [the record](../../../docs/operations.md#prompt-390--scanner-smoke-source-fix-2026-10-18).

### 5.2 Workflow and handoff

The daily 04:00 UTC schedule and default manual dispatch perform credential-free
simulation. Only manual `prepare_candidate: true` enables live preparation;
`force` alone does not. Credentials exist only on the live step, which requires
explicit opt-in, preview environment, configured region `iad1`, team
`team_zE3mp7nrEZ6a7cxRavwUMYC4` and project
`prj_q9ApajZWDgdYZetnm5s5oakEjrUD`. Target mismatches fail before SDK work.
Pinned actions, Node 24 and non-cancelling concurrency remain in place.

Each run creates a unique 0700 temporary directory and new 0600 outputs. The
summary helper (`scripts/vercel/summarize-scanner-candidate.js`, Prompt 403)
validates the original live-success receipt, reconstructs only allowlisted v1
fields, then validates that projection again before publishing a copyable JSON
block. It includes the exact preview target, normalized preparation timestamp,
previous/candidate IDs, hashes and all four passing smoke checks required by the
offline handoff CLI. Unknown fields never reach the summary. Explicit failure or
activation markers cannot be removed to turn a contradictory success into an
eligible receipt.

Simulation, skipped and failed preparation publish diagnostic fields only, with
an explicit no-handoff notice. A confirmed failed-candidate ID remains visible
for manual reconciliation. Missing evidence produces a fixed unavailable notice;
malformed, unsafe or ineligible success evidence and summary-write errors fail
visibly with fixed errors. Summary and cleanup both use `always()`, so runner
receipt/configuration cleanup still runs after a summary failure. Earlier failed
steps remain failures.

The JSON is reconstructed, unsigned consistency evidence. It does not attest to
provider state, CVD freshness, adoption or launch approval. The summary is durable
only within the workflow run's retention/access scope; restricted operator custody
is still required. The workflow does not create a handoff bundle, persist runtime
env configuration, update the configured current snapshot, upload an artifact,
automatically adopt/deploy, or retire snapshots. Hosted dispatch, secret setup and
scheduled live execution remain separate work; schedules still simulate.

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
than asserting a legacy target. A successful live receipt, all four passing
`smoke_test` statuses (`signatures`, `clean_sample`, `eicar_sample`, `cleanup`)
and the exact Acres preview target are required. Since Prompt 390, a receipt
without `signatures` is rejected; none had ever passed smoke.

For a successful trusted workflow run, recover the receipt before its retention
expires:

1. Review the workflow run's provenance, source commit and preparation outcome.
2. Create a new 0600 receipt file under an operator-selected 0700 restricted,
   durable directory outside the checkout. Copy only the JSON from the block
   labelled **Sanitized candidate receipt for offline handoff**, unchanged.
   Never copy diagnostic output or reinterpret a failed/simulated run as success.
3. Use that file as `--receipt` below, choosing a separate new private output
   directory. For a local preparation, keep using the original receipt file.

A passing handoff is not deployment authorization. The manifest hashes the bytes
of the supplied file: for workflow recovery, those are the copied sanitized
projection's bytes, not a digest of the original deleted runner receipt.

After preparation or recovery, create a fresh local bundle (no credentials or
SDK required):

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
The CI workflow retains only the sanitized summary and deletes temporary files;
it does not call this CLI or persist/adopt runtime configuration. To inspect the
summary helper locally without credentials, run
`node scripts/vercel/summarize-scanner-candidate.js --help` and
`node --test scripts/vercel/summarize-scanner-candidate.spec.js`. These tests
round-trip synthetic workflow evidence through handoff after runner cleanup;
they do not establish hosted workflow execution.

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
   **Procedure (Prompt 396)**, with `npm run vercel:scanner-retire`:
   - List each retained snapshot's dependents: the configuration history
     (which deployments were created while it was configured), the live
     deployments that still pin it, and the documented rollback.
   - Retire only snapshots whose dependents already fail closed (their
     signature window has closed) or that were never configured. A
     deployment pinned to a deleted snapshot still fails closed; its error
     code becomes `scanner_unavailable`.
   - Run once without `--confirm` (the plan), naming every retained snapshot
     with `--keep` and each target with `--retire`. Proceed only on
     `planned` with no refusals, no active sandboxes and an empty
     `unlisted_snapshots`. An unaccounted snapshot means the dependency
     list is incomplete; stop.
   - Read the dashboard Snapshot Storage figure, then run the same command
     once with `--confirm`. Never edit the lists between plan and confirm,
     and never retry a failed, unconfirmed or `deleted_after_error` delete
     (the SDK transport may already have retried it); remaining targets
     carry to a later run.
   - Read the figure again afterwards. Deletion cannot be undone; the only
     remedy for a later need is the normal rebuild → adopt → deploy path.

   Prompt 396 targets tier 1: the pre-391 baseline `snap_Feg5…` and the
   never-adopted candidates `snap_rz0cs…` and `snap_KtLd…`. Tier 2,
   `snap_CARv…` (its dependents can still scan) and `snap_ngIw…` (the
   rollback), waits until their signature windows close. The outcome is in
   [the record](../../../docs/vercel-deployment.md).

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

Prompt 391 (2026-10-18) is the first completed adoption of a rebuilt
candidate. The verified
procedure:

1. Check the signature window first; stop if too little remains for one
   build and two scans.
   - **Freshness gate (Prompt 394).** Before adopting, compare the new
     receipt's `daily_sha256` with the active configuration's, privately.
     If they are equal, the fetched `daily.cvd` is unchanged and adoption
     gives no window extension. Record the candidate as prepared and stop.
     A changed `main_sha256` is recorded but does not change the decision.
     The bound is at most fetch time + 48 h, because the receipt does not
     record the `daily.cvd` build time. Prompts 389 and 390, about 40 min
     apart, fetched the same file; Prompt 394, about 14 h after Prompt 390,
     fetched a different one. See
     [the record](../../../docs/operations.md#prompt-394--scanner-signature-refresh-2026-10-18).
2. Capture the previous `SCANNER_*` values and scopes privately; recompute
   the bundle digests; parse `runtime.env` as data, never `source` it.
3. Run one `probe-platform.js scanner` against the candidate as the seam
   check. A signature-age rejection means the window has closed.
4. `vercel env update <NAME> preview` with the value on stdin, for the three
   names only; re-pull into a fresh file and compare to the bundle.
5. Deploy from the clean working tree once `vercel deploy --dry` plus
   `npm run vercel:deploy-manifest` reports `deploy manifest ok` (Prompt
   392). Prompt 391 deployed from a `git archive` instead, because without
   `.vercelignore` the CLI uploaded gitignored files, `.env` included.
6. Prove one clean and one EICAR upload through the immutable deployment
   (`vercel curl --deployment`), correlate outbox, `DurableJob` and this
   deployment's logs, and check anonymous Blob reads and cross-organization
   reads fail.

   Validate the returned PUT contract against the installed Blob SDK before
   sending bytes. SDK 2.8.2 signs `https://vercel.com/api/blob/` with an exact
   `pathname` query; private GETs use the object's storage host. Preserve the
   signed PUT URL and returned headers, with no application cookies, CSRF,
   protection bypass or API token on that transport. Anonymous privacy checks
   use the unsigned object URL, never a signed capability. Correlate terminal
   jobs against the processor contract: clean scans record `succeeded`, while
   infected uploads record `failed` with `lastErrorCode: infected` and an
   `infected` dead-letter reason. That expected rejection does not require a
   retry. See [Prompt 406's partial acceptance record](../../../docs/operations.md#prompt-406--retained-preview-partial-acceptance-2026-10-20).

   For retained-artifact isolation, first require A to see the exact rows and
   validate their original object keys/job links. Under an independently proven
   B session, check own-org and forged-org HTTP denials. Run the same parameterized
   exact-ID SQL under transaction-local B context, without a B-organization WHERE
   filter or join that would itself remove A's rows; then recheck A visibility.
   Empty tables without an A positive control do not prove RLS isolation. See
   [Prompt 407](../../../docs/operations.md#prompt-407--retained-preview-isolation-accepted-adoption-stopped-2026-10-20).

Deployment metadata names the scanner variables but not their values;
identity remains an inference from write-before-create ordering, the
adapter's source and hash checks, and the snapshot's expiry moving at scan
time. See [the record](../../../docs/operations.md#prompt-391--scanner-preview-adoption-2026-10-18).

Durable adoption, verified deployment, retirement within a free-tier resource
budget and hosted scheduled-execution evidence remain unproved by local tests.
The production plan decision and eleven launch sign-offs remain open.
