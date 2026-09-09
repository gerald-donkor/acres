# 62 - disaster recovery restore drill and storage object reconciliation

## Scope, and why it is next

The committed repository is on `main` at `942f0dd` (`test(e2e): remediate browser
verification suites`). Phases 1 through 10 are functionally complete in the
codebase, Phase 11A (Gemini free-tier draft preview) is implemented as a
disabled-by-default preview excluded from production, and Phase 12 foundations
(12A templates/preflights, 12B telemetry/retention, 12C E2E journeys, 12D launch
readiness decision record, and 12E browser verification remediation) are
committed.

Per `docs/build-plan.md` §13, the required operational test suite for Phase 12
mandates:
> "full backup restore + DB/object reconcile; ... live-volume encryption/key-separation
> and recovery checks; complete Playwright/a11y and cross-tenant regression."
And the exit gate requires:
> "successful restore drill within selected objectives; actionable alerts/runbooks"

Furthermore, `docs/operations.md` §Restore states:
> "Use `scripts/ops/restore-postgres.sh <backup-file.dump>` to restore to an
> isolated environment. Validate table counts, apply migration chain, then
> reconcile PostgreSQL object metadata against Garage objects and export
> artifacts."
And `docs/security.md` TM-19 explicitly enforces:
> "RPO/RTO targets, off-host backup destination, completed restore drill date,
> and PostgreSQL/Garage DB-object reconciliation verification."

Currently, `scripts/ops/backup-postgres.sh` and `scripts/ops/restore-postgres.sh`
exist as basic shell utilities, but there is no automated, verifiable disaster
recovery drill execution tool and no object-to-database metadata reconciliation
utility.

This prompt implements **Phase 12F**:
1. **Automated Disaster Recovery Restore Drill Runner (`scripts/ops/run-restore-drill.sh`)**:
   - Executes an automated end-to-end restore verification against an isolated
     target drill database (e.g. `acres_restore_drill`):
     - Takes a fresh timestamped PostgreSQL backup using `backup-postgres.sh`;
     - Verifies backup dump file integrity, non-zero byte size, and restrictive permissions (`chmod 600`);
     - Drops and recreates the target isolated drill database cleanly (`createdb` / `dropdb`);
     - Restores the backup archive into the isolated drill database using `restore-postgres.sh`;
     - Verifies schema and table counts match the source database exactly (including `_prisma_migrations`, tenant tables, and PostGIS spatial tables);
     - Verifies foreign key constraints and record count invariants;
     - Measures and outputs duration in milliseconds to evaluate RTO (Recovery Time Objective) compliance;
     - Cleans up ephemeral drill databases upon completion (with fail-safe traps on exit);
     - Emits structured JSON summary evidence consumable by audit logs and launch readiness records.
2. **PostgreSQL & Object Storage Reconciliation Utility (`scripts/ops/reconcile-storage-objects.ts`)**:
   - Compares PostgreSQL database metadata records (`StoredObject`, `Upload`, `ExportArtifact`) against the storage provider (Garage / S3 bucket or local mock storage port):
     - Detects "orphaned" storage objects: objects present in bucket storage but absent from database metadata (potential storage leaks);
     - Detects "missing" storage objects: active database rows pointing to storage keys that do not exist in the bucket (data loss);
     - Verifies SHA-256 checksums and byte size alignment between database records and storage payloads where recorded;
     - Supports `--dry-run` and structured JSON reporting (`reconciliation-report.json`);
     - Excludes quarantined/expired objects currently within retention windows;
     - Fails closed with non-zero exit code if missing objects or checksum mismatches are detected.
3. **Automated Test Coverage**:
   - Node.js test suite `scripts/ops/reconcile-storage-objects.spec.js` (or `.ts`) testing all reconciliation cases:
     - Clean match: database rows match storage objects perfectly;
     - Orphan detection: storage contains untracked keys;
     - Missing detection: database references missing storage keys;
     - Size/checksum mismatch detection;
     - Tenant and bucket prefix isolation;
   - Drill runner test/validation script verifying that `run-restore-drill.sh` executes cleanly with mock/test database connections.
4. **Operations & Package Integration**:
   - Add root package scripts:
     - `npm run ops:restore-drill`: executes the isolated restore drill;
     - `npm run ops:reconcile-storage`: executes the storage object reconciliation check;
   - Update `npm run ops:check` to include unit tests for the reconciliation logic;
   - Update `docs/operations.md`, `docs/backend.md`, `docs/security.md`, and `docs/build-plan.md` documenting Phase 12F implementation, drill procedure, and evidence logging.

## Reference material read while preparing this prompt

Repository and workflow authority:
- `AGENTS.md` §§2, 2.1, phase-control commands, §§5–10: prompt-first workflow,
  phase resolution, skill loading, verification, review, documentation, commit
  rules, product constraints, and no-fabrication rules.
- `docs/build-plan.md` §§1, 7, 12–14: Phase 6 storage/queue, Phase 12 launch
  hardening, restore drill exit requirements, and sequence gates.
- `docs/operations.md`: current production templates, backup/restore runbooks,
  launch readiness checklist, and fail-closed readiness validator.
- `docs/security.md` §§8–10: threat register, TM-19 backup/restore controls,
  quarantine lifecycle, and launch acceptance suite.
- `docs/system-architecture.md` §§3.4, 4, 10, 11: storage architecture, Garage S3
  presigned uploads, PostgreSQL RLS, backups, and operational runbooks.
- `docs/backend.md` §§2–3, 8: database roles, Prisma migrations, and script
  contracts.

Code references:
- `scripts/ops/backup-postgres.sh`: existing backup script using `pg_dump -Fc`.
- `scripts/ops/restore-postgres.sh`: existing restore script using `pg_restore`.
- `server/src/storage/storage.service.ts`: storage port and provider implementation for Garage / S3.
- `server/src/storage/storage.interface.ts`: storage interface definitions.
- `server/prisma/schema.prisma`: `StoredObject`, `Upload`, and `ExportArtifact` models.
- `scripts/ops/check-launch-readiness.js`: Category 6 (`backup_and_disaster_recovery`) requirements.

## Measurements and procedure

1. Inspect PostgreSQL roles and database permissions:
   - Ensure `acres_migrator` has necessary permissions to create/drop the test drill database `acres_restore_drill`.
2. Implement `scripts/ops/run-restore-drill.sh`:
   - Enforce parameterization: `DRILL_DB="${DRILL_DB:-acres_restore_drill}"`, `SOURCE_DB="${SOURCE_DB:-acres_test}"`.
   - Calculate elapsed time accurately (`date +%s%N` or POSIX `date +%s`).
   - Run verification queries checking table count, foreign keys, and migration chain parity.
3. Implement `scripts/ops/reconcile-storage-objects.ts`:
   - Use TypeScript/Node with database client to query active `StoredObject` and `ExportArtifact` records.
   - Scan storage bucket via `@aws-sdk/client-s3` (or storage port abstraction).
   - Compute matching, orphan, and missing sets.
4. Add unit test suite `scripts/ops/reconcile-storage-objects.spec.js` using Node.js built-in test runner (`node --test`).
5. Execute checks:
   - `node --test scripts/ops/reconcile-storage-objects.spec.js`
   - `npm run ops:check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
6. Record execution output in `docs/operations.md` and `docs/build-plan.md`.

## Expected impact

- `scripts/ops/run-restore-drill.sh`: new automated disaster recovery restore drill script.
- `scripts/ops/reconcile-storage-objects.ts`: new storage object metadata reconciliation script.
- `scripts/ops/reconcile-storage-objects.spec.js`: unit tests for reconciliation logic.
- `package.json`: new `ops:restore-drill` and `ops:reconcile-storage` scripts; updated `ops:check`.
- `docs/operations.md`: updated restore drill and storage reconciliation runbooks and evidence.
- `docs/build-plan.md`: Phase 12F execution and verification record.

## Non-goals

- Deploying to live public cloud infrastructure (AWS/GCP) or spending operator budget.
- Mutating database schema, Prisma migrations, or application routes.
- Altering client UI components, layouts, or stylesheets.
- Enabling AI features or modifying the fail-closed no-AI launch posture.

## Checks to run

```bash
node --test scripts/ops/reconcile-storage-objects.spec.js
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

## SKILLS USED

- `postgres-best-practices`: PostgreSQL backup archive format, restore options, table verification, and connection isolation.
- `deployment-pipeline-design`: Operational drill script design, fail-closed exit codes, and automated verification gates.
- `secrets-management`: Ensuring credentials and database URLs remain private and are not leaked to logs or command output.
- `security-best-practices`: File permissions (chmod 600/700 on dumps) and safe command argument execution.
- `javascript-testing-patterns`: Unit and integration testing of the storage reconciliation and drill verification logic.
- `requesting-code-review`: Dispatching reviewer subagent with structured context.
- `receiving-code-review`: Evaluating review feedback with technical rigor against codebase reality.
- `caveman-commit`: Authoring concise conventional commit message to main.
