# 183 — disaster recovery baseline and slo threshold validation

## Scope and why this is next

The committed baseline is `580d62f` on `main`; the worktree is clean when this prompt was prepared. This is a bounded Phase 12 operational orchestrator, disaster recovery baseline, and launch readiness cross-validation step under `docs/build-plan.md` §13, §21, §22, `docs/launch-checklist.md` §3.5, §3.6, §4, §7, and `docs/operations.md`.

Prompts 174–182 established deep database connection pool and server telemetry, added 4 Prometheus alert rules (expanding the operational alert suite from 7 to 11 rules), implemented capacity baseline modeling with database latency SLO validation, added Panels 27 and 28 to the Grafana operational dashboard (achieving 100% visual panel coverage for all 11 alerts), reconciled all 11 incident runbooks in `docs/launch-checklist.md` §5 with exact scoped PromQL expressions and Grafana panel cross-references, and bubbled up database baseline telemetry from stage 6 into the Unified Launch Evidence Dossier.

However, several operational gaps remain in Category 5 & 6 threshold enforcement, stage 7 disaster recovery baseline aggregation, and child recovery evidence cross-validation:
1. In `scripts/ops/check-launch-readiness.js`, Category 5 (`slo_and_alerting`) only verifies `availability_target_percent >= 99.0`, `max_p95_latency_ms > 0`, and `capacity_target_rps > 0`. This contradicts `docs/launch-checklist.md` §3.5 and §7, which mandate `availability_target_percent >= 99.9` (error rate < 0.1%), `max_p95_latency_ms <= 500`, and `capacity_target_rps >= 100`. Currently, a readiness record specifying a degraded 99.0% availability, 5000ms latency, or 10 RPS throughput would pass approval without blocking.
2. In `scripts/ops/check-launch-readiness.js`, Category 6 (`backup_and_disaster_recovery`) only verifies `rpo_hours > 0` and `rto_hours > 0`. This contradicts `docs/launch-checklist.md` §3.6 and §7, which mandate `rpo_hours <= 1` and `rto_hours <= 4`. Currently, a readiness record specifying an unacceptable 24-hour RPO or 48-hour RTO would pass approval without blocking.
3. In `scripts/ops/run-launch-drills.sh`, stage 7 (`disaster_recovery`) executes `run-restore-drill.sh` and `reconcile-storage-objects.js`, generating child evidence `restore-drill-evidence-<timestamp>.json` and `reconcile-report-<timestamp>.json`. However, `run-launch-drills.sh` emits the Unified Launch Evidence Dossier (`dossier`) with a simple summary flag `recoveryCompliance: "restore_reconcile_verified" | "restore_reconcile_failed"`, completely omitting structured `disasterRecoveryBaseline` (telemetry covering RTO seconds, RTO target, RTO compliance, source/restored table count, source/restored migration count, PostGIS verification, foreign key verification, record parity, and storage reconciliation matched/missing/mismatched/orphan object counts).
4. In `scripts/ops/check-launch-readiness.js`, `checkEvidenceFile` does not cross-validate disaster recovery child evidence:
   - If an approved section references `restore-drill-evidence-*.json`, it does not check whether `rto_compliant` is true, whether `record_parity_verified`, `postgis_verified`, or `foreign_keys_verified` are true, or whether `tables_source === tables_restored` and `migrations_source === migrations_restored`. An evidence file reporting an RTO breach (`rto_compliant: false`) or table count discrepancy slips through without blocking.
   - If an approved section references `reconcile-report-*.json` or `reconciliation-report.json`, it does not check `parsed.summary?.status === 'error'`, `parsed.summary?.missingObjects > 0`, or `parsed.summary?.mismatchedObjects > 0`. An evidence file reporting data loss (missing objects) or corruption (checksum/size mismatches) slips through without blocking.
   - When evaluating a Unified Launch Evidence Dossier, `checkEvidenceFile` does not inspect `disasterRecoveryBaseline.status === 'breached'`, `summary.restoreCompliance === 'failed'`, or `summary.reconcileCompliance === 'failed'`.
5. In `scripts/ops/run-launch-drills.spec.js`, `assertDossierSchema(dossier)` does not validate `summary.restoreCompliance`, `summary.reconcileCompliance`, or `disasterRecoveryBaseline`.
6. In `scripts/ops/check-launch-readiness.spec.js`, there is no test coverage for Category 5 availability (< 99.9%), latency (> 500ms), capacity (< 100 RPS) ceilings, Category 6 RPO (> 1h) or RTO (> 4h) ceilings, restore drill RTO/parity/table/migration failure blocking, reconciliation missing/mismatched object blocking, or dossier disaster recovery breach blocking.
7. In `scripts/ops/check-production-templates.sh`, the validator does not assert that `readiness.example.json` sets `availability_target_percent === 99.9`, `max_p95_latency_ms === 500`, `capacity_target_rps === 100`, `rpo_hours === 1`, and `rto_hours === 4`, nor that `run-launch-drills.sh` emits `disasterRecoveryBaseline`, `restoreCompliance`, and `reconcileCompliance`.

Enforce Category 5 SLO floors/ceilings and Category 6 RPO/RTO ceilings in `scripts/ops/check-launch-readiness.js`. Cross-validate restore drill and storage reconciliation child evidence in `checkEvidenceFile`. Extract and bubble up `disasterRecoveryBaseline`, `summary.restoreCompliance`, and `summary.reconcileCompliance` from stage 7 child evidence into the Unified Launch Evidence Dossier in `scripts/ops/run-launch-drills.sh`. Expand unit test suites in `scripts/ops/run-launch-drills.spec.js` and `scripts/ops/check-launch-readiness.spec.js`. Assert template values and dossier recovery baseline emission in `scripts/ops/check-production-templates.sh`. Update `docs/operations.md`, `docs/launch-checklist.md`, and `docs/build-plan.md`. Operator launch sign-off remains open.

## References and verified baseline

- Re-read `AGENTS.md` §§2, 4–7, 10, `docs/build-plan.md` §§13, 21, 22, `docs/operations.md` (prompts 174–182 records, Phase 12K section), `docs/launch-checklist.md` §§3.5, 3.6, 4, 7, and `docs/skills.md`.
- Inspect `scripts/ops/run-launch-drills.sh`, `scripts/ops/run-launch-drills.spec.js`, `scripts/ops/check-launch-readiness.js`, `scripts/ops/check-launch-readiness.spec.js`, `scripts/ops/check-production-templates.sh`, `scripts/ops/run-restore-drill.sh`, and `scripts/ops/reconcile-storage-objects.js`.
- Category 5 and 6 requirements from `docs/launch-checklist.md` §§3.5, 3.6, 7:
  - Availability target: >= 99.9% (`availability_target_percent`)
  - HTTP p95 latency ceiling: <= 500ms (`max_p95_latency_ms`)
  - Capacity throughput target: >= 100 RPS (`capacity_target_rps`)
  - Database pool acquisition p95 latency ceiling: <= 50ms (`max_database_acquisition_p95_latency_ms`)
  - Database query execution p95 latency ceiling: <= 100ms (`max_database_query_p95_latency_ms`)
  - Recovery Point Objective (RPO): <= 1 hour (`rpo_hours`)
  - Recovery Time Objective (RTO): <= 4 hours (`rto_hours`)
- Child evidence structures emitted by stage 7 runners:
  - `restore-drill-evidence-<timestamp>.json`:
    - `rto_target_seconds`: number (e.g. 300)
    - `duration_seconds`: number
    - `duration_ms`: number
    - `rto_compliant`: boolean (true required)
    - `tables_source`: number
    - `tables_restored`: number (must equal `tables_source`)
    - `migrations_source`: number
    - `migrations_restored`: number (must equal `migrations_source`)
    - `postgis_verified`: boolean (true required)
    - `foreign_keys_verified`: boolean (true required)
    - `record_parity_verified`: boolean (true required)
    - `status`: `"success"`
  - `reconcile-report-<timestamp>.json` / `reconciliation-report.json`:
    - `summary.totalDatabaseObjects`: number
    - `summary.totalBucketObjects`: number
    - `summary.matchedObjects`: number
    - `summary.missingObjects`: number (0 required)
    - `summary.mismatchedObjects`: number (0 required)
    - `summary.orphanObjects`: number
    - `summary.status`: `"clean"` | `"warning"` | `"error"` (`"error"` prohibited)
    - `summary.exitCode`: number (0 required)

## Implementation contract

1. **Harden Category 5 SLO & Category 6 Disaster Recovery thresholds in `scripts/ops/check-launch-readiness.js`.**
   - In `validateReadiness()` under Category 3.5 `slo_and_alerting`:
     - Availability target percent:
       - Validate `typeof sloSec.availability_target_percent === 'number' && Number.isFinite(sloSec.availability_target_percent) && sloSec.availability_target_percent >= 99.9 && sloSec.availability_target_percent <= 100.0`.
       - If invalid or `< 99.9`, add blocker: `Availability target percent must be between 99.9 and 100.0 (received: ${sloSec.availability_target_percent})`.
     - Max HTTP p95 latency:
       - Validate `typeof sloSec.max_p95_latency_ms === 'number' && Number.isFinite(sloSec.max_p95_latency_ms) && sloSec.max_p95_latency_ms > 0 && sloSec.max_p95_latency_ms <= 500`.
       - If invalid or `> 500`, add blocker: `Max p95 latency ceiling must be a positive number <= 500ms (received: ${sloSec.max_p95_latency_ms})`.
     - Capacity target RPS:
       - Validate `typeof sloSec.capacity_target_rps === 'number' && Number.isFinite(sloSec.capacity_target_rps) && sloSec.capacity_target_rps >= 100`.
       - If invalid or `< 100`, add blocker: `Capacity target RPS must be a positive number >= 100 RPS (received: ${sloSec.capacity_target_rps})`.
   - In `validateReadiness()` under Category 3.6 `backup_and_disaster_recovery`:
     - RPO hours:
       - Validate `typeof bdrSec.rpo_hours === 'number' && Number.isFinite(bdrSec.rpo_hours) && bdrSec.rpo_hours > 0 && bdrSec.rpo_hours <= 1`.
       - If invalid or `> 1`, add blocker: `RPO hours must be a positive number <= 1 hour (received: ${bdrSec.rpo_hours})`.
     - RTO hours:
       - Validate `typeof bdrSec.rto_hours === 'number' && Number.isFinite(bdrSec.rto_hours) && bdrSec.rto_hours > 0 && bdrSec.rto_hours <= 4`.
       - If invalid or `> 4`, add blocker: `RTO hours must be a positive number <= 4 hours (received: ${bdrSec.rto_hours})`.

2. **Cross-validate disaster recovery and storage reconciliation child evidence in `checkEvidenceFile` (`scripts/ops/check-launch-readiness.js`).**
   - For restore drill evidence files (matching `restore-drill-evidence-` or containing `rto_target_seconds` / `rto_compliant`):
     - If `parsed.rto_compliant === false`, add blocker:
       `Approved evidence file '${ref}' reports RTO breach (rto_compliant: false)`.
     - If `parsed.record_parity_verified === false`, add blocker:
       `Approved evidence file '${ref}' reports record parity verification failure (record_parity_verified: false)`.
     - If `parsed.postgis_verified === false`, add blocker:
       `Approved evidence file '${ref}' reports PostGIS extension verification failure (postgis_verified: false)`.
     - If `parsed.foreign_keys_verified === false`, add blocker:
       `Approved evidence file '${ref}' reports foreign key constraint verification failure (foreign_keys_verified: false)`.
     - If `typeof parsed.tables_source === 'number' && typeof parsed.tables_restored === 'number' && parsed.tables_source !== parsed.tables_restored`:
       add blocker: `Approved evidence file '${ref}' reports table count discrepancy (source: ${parsed.tables_source}, restored: ${parsed.tables_restored})`.
     - If `typeof parsed.migrations_source === 'number' && typeof parsed.migrations_restored === 'number' && parsed.migrations_source !== parsed.migrations_restored`:
       add blocker: `Approved evidence file '${ref}' reports migration count discrepancy (source: ${parsed.migrations_source}, restored: ${parsed.migrations_restored})`.
   - For storage reconciliation report files (matching `reconcile-report-` or containing `summary.totalDatabaseObjects` / `summary.totalBucketObjects`):
     - If `parsed.summary && typeof parsed.summary === 'object'`:
       - If `parsed.summary.status === 'error' || parsed.summary.status === 'failed'`:
         add blocker: `Approved evidence file '${ref}' reports storage reconciliation failure (summary.status: "${parsed.summary.status}")`.
       - If `typeof parsed.summary.missingObjects === 'number' && parsed.summary.missingObjects > 0`:
         add blocker: `Approved evidence file '${ref}' reports missing storage object(s) (${parsed.summary.missingObjects} missing)`.
       - If `typeof parsed.summary.mismatchedObjects === 'number' && parsed.summary.mismatchedObjects > 0`:
         add blocker: `Approved evidence file '${ref}' reports storage object checksum or size mismatch(es) (${parsed.summary.mismatchedObjects} mismatched)`.
   - For Unified Launch Evidence Dossiers:
     - If `parsed.disasterRecoveryBaseline && typeof parsed.disasterRecoveryBaseline === 'object' && (parsed.disasterRecoveryBaseline.status === 'breached' || parsed.disasterRecoveryBaseline.status === 'failed')`:
       add blocker: `Approved evidence file '${ref}' reports disaster recovery baseline breach (disasterRecoveryBaseline.status: "${parsed.disasterRecoveryBaseline.status}")`.
     - If `parsed.summary?.restoreCompliance === 'failed'`:
       add blocker: `Approved evidence file '${ref}' reports restore drill compliance failure (summary.restoreCompliance: "failed")`.
     - If `parsed.summary?.reconcileCompliance === 'failed'`:
       add blocker: `Approved evidence file '${ref}' reports storage reconciliation compliance failure (summary.reconcileCompliance: "failed")`.

3. **Extract and bubble up child disaster recovery baseline into Unified Launch Evidence Dossier in `scripts/ops/run-launch-drills.sh`.**
   - In the Node dossier generator in `scripts/ops/run-launch-drills.sh`:
     - Identify `drStage` matching `stage_id === "disaster_recovery"`.
     - If `drStage && drStage.status === "PASSED"`:
       - Find `restoreFile` in `drStage.artifacts` matching `restore-drill-evidence-` and ending in `.json`.
       - Find `reconcileFile` in `drStage.artifacts` matching `reconcile-report-` (or `reconciliation-report`) and ending in `.json`.
       - Read and parse `restoreEvidence` and `reconcileEvidence` if present on disk.
       - Verify restore integrity:
         - `restorePassed = Boolean(restoreEvidence && restoreEvidence.rto_compliant === true && restoreEvidence.record_parity_verified === true && restoreEvidence.tables_source === restoreEvidence.tables_restored && restoreEvidence.migrations_source === restoreEvidence.migrations_restored && restoreEvidence.status === 'success')`.
       - Verify reconcile integrity:
         - `reconcilePassed = Boolean(reconcileEvidence && reconcileEvidence.summary && reconcileEvidence.summary.status !== 'error' && reconcileEvidence.summary.missingObjects === 0 && reconcileEvidence.summary.mismatchedObjects === 0 && reconcileEvidence.summary.exitCode === 0)`.
       - If `restorePassed && reconcilePassed`:
         - `disasterRecoveryBaseline = { status: "verified", restoreDrill: { rtoSeconds: restoreEvidence.duration_seconds, rtoTargetSeconds: restoreEvidence.rto_target_seconds, rtoCompliant: restoreEvidence.rto_compliant, tablesSource: restoreEvidence.tables_source, tablesRestored: restoreEvidence.tables_restored, migrationsSource: restoreEvidence.migrations_source, migrationsRestored: restoreEvidence.migrations_restored, postgisVerified: restoreEvidence.postgis_verified, foreignKeysVerified: restoreEvidence.foreign_keys_verified, recordParityVerified: restoreEvidence.record_parity_verified }, storageReconciliation: { totalDatabaseObjects: reconcileEvidence.summary.totalDatabaseObjects, totalBucketObjects: reconcileEvidence.summary.totalBucketObjects, matchedObjects: reconcileEvidence.summary.matchedObjects, missingObjects: reconcileEvidence.summary.missingObjects, orphanObjects: reconcileEvidence.summary.orphanObjects, mismatchedObjects: reconcileEvidence.summary.mismatchedObjects, status: reconcileEvidence.summary.status } }`.
         - `restoreCompliance = "passed"`.
         - `reconcileCompliance = "passed"`.
       - If either failed:
         - `disasterRecoveryBaseline = { status: "breached", error_message: "child restore or reconcile evidence failed integrity assertions" }`.
         - `restoreCompliance = restorePassed ? "passed" : "failed"`.
         - `reconcileCompliance = reconcilePassed ? "passed" : "failed"`.
     - If stage 7 did not pass:
       - `disasterRecoveryBaseline = { status: "breached", error_message: drStage?.error_message || "stage failed" }`.
       - `restoreCompliance = "failed"`.
       - `reconcileCompliance = "failed"`.
     - In `dossier`:
       - Add `disasterRecoveryBaseline` at the top level alongside `databaseTelemetryBaseline`.
       - In `dossier.summary`:
         - Add `restoreCompliance`.
         - Add `reconcileCompliance`.
         - Retain `recoveryCompliance: (restoreCompliance === "passed" && reconcileCompliance === "passed") ? "restore_reconcile_verified" : "restore_reconcile_failed"`.

4. **Expand unit test suite in `scripts/ops/run-launch-drills.spec.js`.**
   - In `assertDossierSchema(dossier)`:
     - Assert `typeof dossier.disasterRecoveryBaseline === 'object'`.
     - Assert `['verified', 'breached'].includes(dossier.disasterRecoveryBaseline.status)`.
     - Assert `typeof dossier.summary.restoreCompliance === 'string'`.
     - Assert `['passed', 'failed'].includes(dossier.summary.restoreCompliance)`.
     - Assert `typeof dossier.summary.reconcileCompliance === 'string'`.
     - Assert `['passed', 'failed'].includes(dossier.summary.reconcileCompliance)`.
   - In `--dry-run executes all 7 stages and emits a schema-compliant dossier`:
     - Assert `dossier.disasterRecoveryBaseline.status === 'breached'`.
     - Assert `dossier.summary.restoreCompliance === 'failed'`.
     - Assert `dossier.summary.reconcileCompliance === 'failed'`.
     - Assert `dossier.summary.recoveryCompliance === 'restore_reconcile_failed'`.

5. **Expand unit test suite in `scripts/ops/check-launch-readiness.spec.js`.**
   - Add test: `validateReadiness blocks approval when availability_target_percent < 99.9, max_p95_latency_ms > 500, or capacity_target_rps < 100`.
   - Add test: `validateReadiness blocks approval when rpo_hours > 1 or rto_hours > 4`.
   - Add test: `validateReadiness blocks approval when restore drill evidence reports RTO breach, parity failure, or table/migration count mismatch`.
   - Add test: `validateReadiness blocks approval when storage reconciliation evidence reports missing or mismatched objects`.
   - Add test: `validateReadiness blocks approval when evidence dossier reports disasterRecoveryBaseline breach or restore/reconcile compliance failure`.
   - Add test: `validateReadiness accepts valid passed disaster recovery evidence and compliant dossier`.

6. **Update production template verification in `scripts/ops/check-production-templates.sh`.**
   - In Node validation block:
     - Assert `readinessExample.sections.slo_and_alerting.availability_target_percent === 99.9`.
     - Assert `readinessExample.sections.slo_and_alerting.max_p95_latency_ms === 500`.
     - Assert `readinessExample.sections.slo_and_alerting.capacity_target_rps === 100`.
     - Assert `readinessExample.sections.backup_and_disaster_recovery.rpo_hours === 1`.
     - Assert `readinessExample.sections.backup_and_disaster_recovery.rto_hours === 4`.
     - Assert `run-launch-drills.sh` emits `disasterRecoveryBaseline`, `restoreCompliance`, and `reconcileCompliance`.

7. **Documentation updates.**
   - In `docs/operations.md`, add record for Prompt 183 detailing disaster recovery baseline emission, child evidence cross-validation, and Category 5 & 6 threshold validations.
   - In `docs/launch-checklist.md`, update Category 5 & 6 validator notes and disaster recovery baseline structure in §3.6 and §4.
   - In `docs/build-plan.md`, add Prompt 183 to §21/§22 verification records.
   - Explicitly note that operator launch sign-off remains open.

## Verification and execution sequence

1. Record `BASE_SHA`, `HEAD_SHA`, branch, and clean worktree status.
2. Edit `scripts/ops/check-launch-readiness.js`, `scripts/ops/run-launch-drills.sh`, `scripts/ops/check-production-templates.sh`, `scripts/ops/run-launch-drills.spec.js`, `scripts/ops/check-launch-readiness.spec.js`, `docs/operations.md`, `docs/launch-checklist.md`, and `docs/build-plan.md`.
3. Run `npm run ops:launch-drill-test`, `node --test scripts/ops/check-launch-readiness.spec.js`, `npm run ops:templates`, and `npm run ops:check`.
4. Run full repository verification: `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
5. Dispatch a Stage 1 reviewer subagent via `requesting-code-review`, evaluate findings with `receiving-code-review`, fix any verified issues, stage approved paths, and commit locally on `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `deployment-pipeline-design` — disaster recovery drill orchestration, exit gates, and evidence dossier aggregation.
- `javascript-testing-patterns` — node:test assertions, schema validation, and fail-closed validator testing.
- `postgres-best-practices` — database restore parity, migration integrity, and RTO validation.
- `requesting-code-review` — Stage 1 code review dispatch.
- `receiving-code-review` — Stage 2 review evaluation and verification.
- `caveman-commit` — conventional commit message authoring.
