# 210 — production backup and disaster recovery evidence

## Scope and why this is next

The committed baseline is `a3c4d9b` on `main`. Phase 12K remains open under
`docs/build-plan.md` §13/§22 and the umbrella launch sign-off in prompt 201.
Prompts 205–209 assessed checklist Categories 1–5 (`production_domain_tls`,
`smtp_delivery`, `secrets_management`, `secret_references`, and
`slo_and_alerting`) and recorded unresolved operator evidence without
approving them. The earliest remaining independent checklist unit is
Category 6, `backup_and_disaster_recovery`.

This prompt assesses the declared Recovery Point Objective (RPO ≤ 1h), Recovery
Time Objective (RTO ≤ 4h), off-host encrypted backup destination, UTC every-hour
cron schedule (`0 * * * *`), completed PostgreSQL restore drill with matching UTC
date, PostgreSQL and Garage/S3 object storage reconciliation drill, and the
designated operations/database lead's decision. It records an exact unresolved
blocker if operator material is unavailable. Category 6 is approved only after
independent live-source inspection, verified machine-readable child artifacts,
and dated human sign-off. This does not approve other categories or complete
Phase 12.

## References and verified contract

- Re-read `AGENTS.md` §§2–7 and 10, `docs/build-plan.md` §§13–14 and 22,
  `docs/launch-checklist.md` §§2–5, 6A, and 7, `docs/operations.md` Phase 12F/K
  and Prompts 188–190, `docs/security.md` TM-19 and Phase 12F,
  `docs/system-architecture.md` backup/restore topology, `docs/skills.md`, and
  prompts 188–190, 201–203, and 205–209. Reconcile prose with current code and
  Git history before executing.
- Inspect `infra/launch/readiness.example.json`,
  `infra/launch/readiness.schema.json`,
  `scripts/ops/check-launch-readiness.js` and its test suite,
  `scripts/ops/run-restore-drill.sh`, `scripts/ops/restore-postgres.sh`,
  `scripts/ops/backup-postgres.sh`,
  `scripts/ops/reconcile-storage-objects.js` and its spec,
  `scripts/ops/run-launch-drills.sh` (stage 7), and
  `scripts/ops/check-production-templates.sh`. Inspect operator-provided backup
  configurations, cron schedules, restore drill logs, and reconciliation
  evidence separately.
- No visual route, design comp, crop, pixel measurement, or breakpoint applies.
  The measured contract is:
  - `rpo_hours`: positive finite number > 0 and ≤ 1.0 hour;
  - `rto_hours`: positive finite number > 0 and ≤ 4.0 hours (drill target default 300s);
  - `backup_destination`: required non-empty string specifying an off-host, encrypted destination;
  - `backup_schedule_cron`: valid UTC every-hour cron expression parsed by `parseBackupScheduleCron`, where the maximum start gap in minutes (`schedule.maxGapMinutes`) does not exceed `rpo_hours * 60` (e.g. `0 * * * *` for 1h RPO);
  - `restore_drill_completed`: boolean (`true` required);
  - `restore_drill_date`: valid, nonfuture UTC date (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ssZ`) strictly matching the latest referenced restore child report's UTC date;
  - `db_object_reconciliation_tested`: boolean (`true` required);
  - `approver`: valid approver object or name without placeholders;
  - `evidence`: non-empty array referencing valid child JSON reports.
- An approved Category 6 section requires dual machine-readable child evidence artifacts:
  1. A concrete, successful PostgreSQL restore drill child JSON report (`validateRestoreReport`):
     - Recognized by report structure (`drill_timestamp`, `status`, `source_db`, `drill_db`, `backup_file`, `backup_bytes`, `duration_ms`, `rto_compliant`, `record_parity_verified`, `postgis_verified`, `foreign_keys_verified`, `tables_source`, `tables_restored`, `migrations_source`, `migrations_restored`);
     - `drill_timestamp`: strict basic UTC `YYYYMMDDTHHMMSSZ` format, real and no later than validation time;
     - `status: "success"`;
     - `rto_compliant: true`;
     - `record_parity_verified: true`;
     - `postgis_verified: true`;
     - `foreign_keys_verified: true`;
     - Non-negative safe integers for `tables_source`, `tables_restored`, `migrations_source`, `migrations_restored`, with `tables_source === tables_restored` and `migrations_source === migrations_restored`;
     - Positive safe integer `backup_bytes > 0`;
     - Finite non-negative number `duration_ms >= 0`.
  2. A concrete, successful storage reconciliation child JSON report (`validateReconciliationReport`):
     - Recognized by filename or summary structure (`isReconciliationCandidate`);
     - `timestamp`: strict ISO UTC `YYYY-MM-DDTHH:mm:ss.sssZ` format, real and no later than validation time;
     - `summary`: object containing 8 non-negative safe integer counts (`totalDatabaseObjects`, `activeDatabaseObjects`, `pendingOrDeletedExcluded`, `totalBucketObjects`, `matchedObjects`, `missingObjects`, `orphanObjects`, `mismatchedObjects`);
     - Root collections `matched`, `missing`, `orphans`, and `mismatches` whose lengths strictly match the respective summary counts;
     - `summary.missingObjects === 0` (zero data loss);
     - `summary.mismatchedObjects === 0` (zero checksum or size mismatches);
     - `summary.exitCode === 0`;
     - `summary.status === "clean"` (when `orphanObjects === 0`) or `summary.status === "warning"` (when `orphanObjects > 0` with accurate orphan entries);
     - Status `error` or `failed` strictly blocks approval.
- Every referenced child report, including wildcard matches, must pass. A failed or malformed report blocks even alongside a valid one. The unified dossier alone, prose declarations, or filenames without verified child reports cannot support approval.
- Known architectural constraint (judgement, verified against code): both sub-drills in Stage 7 of the unified drill orchestrator (`scripts/ops/run-launch-drills.sh`) require live drill infrastructure even under `--dry-run` — `PGPASSWORD` plus reachable PostgreSQL (`pg_isready`) for the restore drill, plus authenticated PostgreSQL and reachable Garage/S3 for reconciliation. Without them, Stage 7 fails closed (`disaster_recovery` status `FAILED`).

## Preconditions and operator handoff

1. Verify branch, HEAD, and clean worktree; preserve unrelated changes. Confirm the checked-in readiness example is unresolved. Search approved repository paths for a materialized production readiness record or redacted Category 6 evidence reference. Absence from Git does not prove absence from the operator's restricted store.
2. Obtain through the approved operator channel:
   - The production backup destination and storage class (off-host, encrypted);
   - Encryption configuration and key management mechanism for backup archives;
   - The automated backup cron schedule and active cron runner verification;
   - Restricted evidence-store location containing raw backup archives, transfer logs, and drill execution reports;
   - Controlled read-only access to restore drill execution logs, target database metadata, and Garage/S3 bucket object listings;
   - The designated operations / database lead approver identity and dated approval decision.
3. Use opaque identifiers and redacted extracts only. Never request, read, or place credentials (`PGPASSWORD`, S3 secret keys), raw encryption passphrases, customer data, or internal storage host inventories into Git, logs, or chat.
4. Distinguish test/synthetic drill artifacts from production disaster recovery proof. Local dry-run executions against empty disposable databases do not prove off-host encrypted transfer, Garage backup coverage, backup freshness under production load, or actual RPO attainment.
5. Live restore drills require separate authorization specifying target database, isolated drill database, operator, maintenance window, abort criteria, and observer. A generic approval of this prompt authorizes only read-only repository checks and intake assessment. If authority or live evidence is missing, record the exact Category 6 blocker and owner; do not fabricate evidence or mark the example approved.

## Evidence and decision procedure

1. Review the operator's backup policy and compare values to readiness fields:
   - Verify `rpo_hours <= 1.0` and `rto_hours <= 4.0`;
   - Verify `backup_schedule_cron` is a valid every-hour UTC cron expression whose interval does not exceed `rpo_hours * 60` minutes;
   - Verify `backup_destination` points to an off-host, encrypted target distinct from the primary database and storage hosts.
2. Inspect the latest live PostgreSQL restore drill artifact and logs:
   - Verify `drill_timestamp` is real, nonfuture, and in UTC `YYYYMMDDTHHMMSSZ` format;
   - Verify `restore_drill_date` in the readiness record matches the UTC calendar date of this report;
   - Verify the restore was executed into an isolated drill database (e.g. `acres_restore_drill`), not against production;
   - Verify parity of public table counts (`tables_source === tables_restored`), Prisma migration counts (`migrations_source === migrations_restored`), PostGIS spatial extension verification, foreign key constraint validation, and non-empty backup size (`backup_bytes > 0`);
   - Verify measured elapsed duration is well within the RTO target (`rto_compliant: true`, `duration_ms < rto_target_seconds * 1000`).
3. Inspect the PostgreSQL and Garage/S3 object storage reconciliation artifact and logs:
   - Verify `timestamp` is real, nonfuture ISO UTC;
   - Verify reconciliation evaluated `StoredObject`, `Upload`, and `ExportArtifact` records against actual storage bucket keys;
   - Verify `missingObjects === 0` (no missing objects / data loss) and `mismatchedObjects === 0` (no corrupt or drifted objects);
   - Check `orphanObjects`: if zero, status must be `clean`; if positive, status must be `warning` with valid orphan keys accounted for; status must never be `error`;
   - Verify `exitCode === 0`.
4. Inspect the Unified Launch Evidence Dossier if available:
   - Verify `disasterRecoveryBaseline.status !== "breached"`;
   - Verify `summary.restoreCompliance === "passed"` and `summary.reconcileCompliance === "passed"`.
5. Prepare or inspect an operator-owned readiness record, keeping all other ten categories and release fields intact:
   - Set `backup_and_disaster_recovery.status` to `approved` only if all criteria above are verified and a dated operations lead signature is present;
   - Otherwise, retain `status: "unresolved"` and record the missing evidence items and blockers.
6. Run `npm run ops:readiness-schema-test` and `node scripts/ops/check-launch-readiness.js <operator-readiness.json>`. The whole-record validator will exit nonzero if other categories are unresolved; inspect Category 6 blockers in isolation. Keep raw evidence in the restricted store and commit only approved redacted references.
7. Document the dated intake findings, reviewed commit baseline, verified evidence references, missing facts, and responsible owners in `docs/launch-checklist.md` §3.6. Prompt 201 continues to govern the final eleven-category launch sign-off.

## Scope boundaries, failure handling, and rollback

- No product code, database schema, migration, API endpoint, client UI, backup script, cron schedule, or production configuration is changed.
- If off-host backup evidence, restore drill report, reconciliation report, or operations lead approval is missing, Category 6 remains `unresolved`. Document the exact blockers, required inputs, and owning lead.
- On any restore drill failure (RTO breach, table discrepancy, missing migration, PostGIS failure, unvalidated foreign keys) or reconciliation failure (missing objects, size/checksum mismatch), halt intake, flag the recovery risk, and notify the database and operations leads.
- Revert any erroneous documentation edit with git; do not weaken the validator or schema contracts.

## Verification, review, and completion

1. Execute and quote real command output and exit codes for:
   - `npm run ops:readiness-schema-test`
   - `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` (expected fail-closed with Category 6 blockers reported)
   - `npm run ops:templates`
   - `bash scripts/ops/run-restore-drill.sh --help`
   - `node scripts/ops/reconcile-storage-objects.js --help`
   - `npm run ops:check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
   - `git diff --check`
2. Dispatch a read-only reviewer subagent via `requesting-code-review` providing requirements, base/head SHAs, modified documentation paths, check results, and the distinction between local drill capabilities and production recovery proof.
3. Evaluate review feedback via `receiving-code-review`, verify claims against codebase reality, fix valid issues, and re-test.
4. Stage only prompt-scoped documentation updates and any approved redacted readiness records.
5. Commit locally to `main` using `caveman-commit`. Do not push.
6. Present the exact state of Category 6, remaining Phase 12K gates, and instructions for verifying readiness.

## SKILLS USED

- `deployment-pipeline-design` — enforce multi-stage gates separating local drill tooling from production disaster recovery verification.
- `postgres-best-practices` — verify database backup integrity, table/migration parity, PostGIS extension presence, and constraint validation.
- `secrets-management` — ensure database passwords, S3 keys, and encryption passphrases are never leaked in logs, evidence, or chat.
- `error-handling-patterns` — classify recovery errors, RTO breaches, and storage reconciliation mismatches.
- `requesting-code-review` — dispatch independent reviewer subagent for evidence and documentation review.
- `receiving-code-review` — evaluate reviewer findings with technical rigor before making adjustments.
- `caveman-commit` — write the final local commit message on completion.
