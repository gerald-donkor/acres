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
candidate_dir=$(mktemp -d /tmp/acres-scanner-candidate.XXXXXXXX)
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

### 5.4 Manual activation, verification and retirement

1. Preserve the candidate ID and both SHA-256 hashes in the approved restricted
   configuration inventory. Map the exported `ACRES_SCANNER_*` variables to the
   runtime `SCANNER_SANDBOX_SNAPSHOT_ID`, `SCANNER_SANDBOX_MAIN_SHA256` and
   `SCANNER_SANDBOX_DAILY_SHA256` configuration using the existing target-bound
   operator procedure. The cadence tool does not perform this step.
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

Durable adoption, verified deployment, retirement within a free-tier resource
budget and hosted scheduled-execution evidence remain unproved by local tests.
The production plan decision and eleven launch sign-offs remain open.
