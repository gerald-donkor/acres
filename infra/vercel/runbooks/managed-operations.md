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

Because virus definition signatures update continuously, the ClamAV CVD snapshot must be rebuilt on an automated 48-hour cadence to prevent signature staleness (maximum allowable age is 168 hours).

### 5.1 Snapshot Build Command

```bash
npm run vercel:scanner-snapshot -- \
  --write-env ~/.config/acres/scanner.env
```

### 5.2 Post-Build Update Procedure

1. Read the newly generated `ACRES_SCANNER_SNAPSHOT_ID` from the output or `~/.config/acres/scanner.env`.
2. Update the Vercel production environment variable:
   ```bash
   npx vercel env add SCANNER_SANDBOX_SNAPSHOT_ID production
   ```
3. Trigger a deployment promotion or redeployment to activate the new snapshot.
4. Verify sandbox health with:
   ```bash
   npm run vercel:probe -- scanner-eicar
   ```
