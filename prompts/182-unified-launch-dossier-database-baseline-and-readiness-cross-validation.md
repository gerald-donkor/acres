# 182 — unified launch dossier database baseline and readiness cross validation

## Scope and why this is next

The committed baseline is `21a9ea1` on `main`; the worktree is clean when this prompt was prepared. This is a bounded Phase 12 operational orchestrator and launch readiness cross-validation step under `docs/build-plan.md` §13, §21, §22, `docs/launch-checklist.md` §4, §5, §7, and `docs/operations.md`.

Prompts 174–181 established deep database connection pool and server telemetry, added 4 Prometheus alert rules (expanding the operational alert suite from 7 to 11 rules), implemented capacity baseline modeling with database latency SLO validation, added Panels 27 and 28 to the Grafana operational dashboard (achieving 100% visual panel coverage for all 11 alerts), and reconciled all 11 incident runbooks in `docs/launch-checklist.md` §5 with exact scoped PromQL expressions and Grafana panel cross-references.

However, several operational gaps remain in the top-level launch drill orchestrator and evidence cross-validation pipeline:
1. In `scripts/ops/run-launch-drills.sh`, stage 6 (`capacity_alerting`) runs `run-capacity-alerting-drill.sh`, which generates child evidence `capacity-alerting-drill-evidence-<timestamp>.json` containing `summary.databaseBaselineCompliance` (`"passed"` or `"failed"`), `databaseTelemetryBaseline` (structured telemetry for exporter, server, connection pools, pool acquisition latency, query duration, and lock activity), `summary.alertVerification`, and `summary.dosResilience`. Currently, `run-launch-drills.sh` emits the Unified Launch Evidence Dossier (`dossier`) with a summary that records `sloCompliance: "capacity_alerts_verified"`, but completely omits `summary.databaseBaselineCompliance` and `databaseTelemetryBaseline`.
2. This creates an operational disconnect with `docs/launch-checklist.md` §4 and §7: §4 explicitly permits operators to reference the unified dossier directly from approved readiness sections in `evidence`, and §7 requires `verified database baseline telemetry evidence (summary.databaseBaselineCompliance: "passed")`. When an operator references the unified dossier in `sections.slo_and_alerting.evidence`, `summary.databaseBaselineCompliance` is missing, bypassing fail-closed baseline evaluation.
3. In `scripts/ops/check-launch-readiness.js`, `checkEvidenceFile` validates evidence files on disk. Currently, it evaluates `status === 'failed'`, `overall_status === 'failed'`, `success === false`, `summary.exitCode !== 0`, `summary.databaseBaselineCompliance === 'failed'`, and `databaseTelemetryBaseline.status === 'breached'`. However, when evaluating a Unified Launch Evidence Dossier, `checkEvidenceFile` does not fail closed if `failed_stages > 0`, if `summary.sloCompliance === 'capacity_alerts_failed'`, if `summary.recoveryCompliance === 'restore_reconcile_failed'`, if individual stages report `status: "FAILED"`, or if individual summary stage integrity flags report `"failed"`.
4. In `scripts/ops/run-launch-drills.spec.js`, `assertDossierSchema(dossier)` does not validate `summary.databaseBaselineCompliance` or `databaseTelemetryBaseline`, leaving orchestrator schema enforcement incomplete.
5. In `scripts/ops/check-launch-readiness.spec.js`, there is no test coverage asserting that `validateReadiness` fails closed when an evidence dossier reports `failed_stages > 0`, `summary.sloCompliance === 'capacity_alerts_failed'`, `summary.recoveryCompliance === 'restore_reconcile_failed'`, or individual stage failures, nor that it cleanly accepts a valid passed dossier containing `summary.databaseBaselineCompliance: "passed"` and `databaseTelemetryBaseline.status: "verified"`.
6. In `scripts/ops/check-production-templates.sh`, `require_file` omits `scripts/ops/run-launch-drills.sh`, `scripts/ops/run-launch-drills.spec.js`, and `scripts/ops/launch-readiness.sh`. Furthermore, the template validator does not check that `run-launch-drills.sh` emits `databaseBaselineCompliance` in `dossier.summary` and `databaseTelemetryBaseline` in `dossier`.

Extract and bubble up `summary.databaseBaselineCompliance`, `databaseTelemetryBaseline`, `summary.alertVerification`, and `summary.dosResilience` from stage 6 child evidence into the Unified Launch Evidence Dossier in `scripts/ops/run-launch-drills.sh`. Extend `checkEvidenceFile` in `scripts/ops/check-launch-readiness.js` to fail closed on dossier failed stages, stage-level failures, SLO compliance failures, recovery compliance failures, and summary category failures. Expand unit test suites in `scripts/ops/run-launch-drills.spec.js` and `scripts/ops/check-launch-readiness.spec.js`. Require drill scripts and assert dossier database baseline emission in `scripts/ops/check-production-templates.sh`. Update `docs/operations.md` and `docs/build-plan.md`. Operator launch sign-off remains open.

## References and verified baseline

- Re-read `AGENTS.md` §§2, 4–7, 10, `docs/build-plan.md` §§13, 21, 22, `docs/operations.md` (prompts 174–181 records, Phase 12K section), `docs/launch-checklist.md` §§4, 5, 7, and `docs/skills.md`.
- Inspect `scripts/ops/run-launch-drills.sh`, `scripts/ops/run-launch-drills.spec.js`, `scripts/ops/check-launch-readiness.js`, `scripts/ops/check-launch-readiness.spec.js`, and `scripts/ops/check-production-templates.sh`.
- Inspect child evidence structure emitted by `scripts/ops/run-capacity-alerting-drill.sh`:
  - `summary.databaseBaselineCompliance`: `"passed"` | `"failed"`
  - `databaseTelemetryBaseline`: `{ status: "verified" | "breached", postgresExporter: {...}, postgresServer: {...}, connectionPool: {...}, poolAcquisitionLatency: {...}, queryExecutionDuration: {...}, serverActivity: {...} }`
  - `summary.alertVerification`: `"passed"` | `"failed"`
  - `summary.capacitySloCompliance`: `"passed"` | `"failed"`
  - `summary.dosResilience`: `"passed"` | `"failed"`

## Implementation contract

1. **Extract and bubble up child database telemetry baseline into Unified Launch Evidence Dossier in `scripts/ops/run-launch-drills.sh`.**
   - After executing stage 6 (`capacity_alerting`), identify the newly emitted `capacity-alerting-drill-evidence-*.json` file from `$EVIDENCE_DIR`.
   - Pass this child capacity evidence path into the Node dossier generation script.
   - In the Node dossier generator:
     - Read and parse the child capacity evidence file if present.
     - Bubble up `databaseTelemetryBaseline` to `dossier.databaseTelemetryBaseline`. If absent or unparseable, default to `{ status: "breached" }`.
     - Include `databaseBaselineCompliance` in `dossier.summary`:
       - Set to `capacityEvidence?.summary?.databaseBaselineCompliance === 'passed' ? 'passed' : 'failed'` if stage 6 passed and evidence parsed; otherwise `'failed'`.
     - Include `alertVerification` in `dossier.summary`:
       - Set to `capacityEvidence?.summary?.alertVerification === 'passed' ? 'passed' : 'failed'`.
     - Include `dosResilience` in `dossier.summary`:
       - Set to `capacityEvidence?.summary?.dosResilience === 'passed' ? 'passed' : 'failed'`.

2. **Harden `checkEvidenceFile` in `scripts/ops/check-launch-readiness.js` for dossier verification.**
   - In `checkEvidenceFile(ref, category, addBlocker, baseDirs)`:
     - Dossier failed stages: if `typeof parsed.failed_stages === 'number' && parsed.failed_stages > 0`, add blocker:
       `Approved evidence file '${ref}' reports ${parsed.failed_stages} failed drill stage(s)`.
     - Dossier stage failure array: if `Array.isArray(parsed.stages)`:
       - For each stage where `stage.status === 'FAILED'`, add blocker:
         `Approved evidence file '${ref}' reports stage '${stage.stage_id}' failed: ${stage.error_message || 'unspecified error'}`.
     - Dossier summary compliance flags:
       - If `parsed.summary?.sloCompliance === 'capacity_alerts_failed'`, add blocker:
         `Approved evidence file '${ref}' reports SLO compliance failure (summary.sloCompliance: "capacity_alerts_failed")`.
       - If `parsed.summary?.recoveryCompliance === 'restore_reconcile_failed'`, add blocker:
         `Approved evidence file '${ref}' reports recovery compliance failure (summary.recoveryCompliance: "restore_reconcile_failed")`.
       - For each summary stage flag in `['staticIntegrity', 'supplyChainSecurity', 'ingressDeployment', 'volumeEncryption', 'secretRotation', 'capacityAlerting', 'disasterRecovery']`:
         - If `parsed.summary?.[flag] === 'failed'`, add blocker:
           `Approved evidence file '${ref}' reports stage summary failure (summary.${flag}: "failed")`.

3. **Expand unit test suite in `scripts/ops/run-launch-drills.spec.js`.**
   - In `assertDossierSchema(dossier)`:
     - Assert `typeof dossier.summary.databaseBaselineCompliance === 'string'`.
     - Assert `['passed', 'failed'].includes(dossier.summary.databaseBaselineCompliance)`.
     - Assert `typeof dossier.databaseTelemetryBaseline === 'object'`.
     - Assert `['verified', 'breached'].includes(dossier.databaseTelemetryBaseline.status)`.
     - Assert `typeof dossier.summary.alertVerification === 'string'`.
     - Assert `typeof dossier.summary.dosResilience === 'string'`.
   - In `--dry-run executes all 7 stages and emits a schema-compliant dossier`:
     - Assert `dossier.summary.databaseBaselineCompliance === 'passed'`.
     - Assert `dossier.databaseTelemetryBaseline.status === 'verified'`.
     - Assert `dossier.databaseTelemetryBaseline.postgresExporter.up === 1`.
     - Assert `dossier.databaseTelemetryBaseline.postgresServer.pgUp === 1`.

4. **Expand unit test suite in `scripts/ops/check-launch-readiness.spec.js`.**
   - Add test: `validateReadiness blocks approval when evidence dossier reports failed stages or stage-level failures`.
   - Add test: `validateReadiness blocks approval when evidence dossier reports sloCompliance or recoveryCompliance failure`.
   - Add test: `validateReadiness accepts valid passed evidence dossier with database baseline compliance`.

5. **Update production template verification in `scripts/ops/check-production-templates.sh`.**
   - Add `require_file scripts/ops/run-launch-drills.sh`.
   - Add `require_file scripts/ops/run-launch-drills.spec.js`.
   - Add `require_file scripts/ops/launch-readiness.sh`.
   - In Node validation block:
     - Read `scripts/ops/run-launch-drills.sh`.
     - Assert that it generates `databaseBaselineCompliance` in `dossier.summary`.
     - Assert that it generates `databaseTelemetryBaseline` in `dossier`.

6. **Documentation updates.**
   - In `docs/operations.md`, add record for Prompt 182 detailing the unified launch dossier database baseline and readiness cross-validation hardening.
   - In `docs/build-plan.md`, add Prompt 182 to §21/§22 verification records.
   - Explicitly note that operator launch sign-off remains open.

## Verification and execution sequence

1. Record `BASE_SHA`, `HEAD_SHA`, branch, and clean worktree status.
2. Edit `scripts/ops/run-launch-drills.sh`, `scripts/ops/check-launch-readiness.js`, `scripts/ops/run-launch-drills.spec.js`, `scripts/ops/check-launch-readiness.spec.js`, `scripts/ops/check-production-templates.sh`, `docs/operations.md`, and `docs/build-plan.md`.
3. Run `npm run ops:launch-drill-test`, `node --test scripts/ops/check-launch-readiness.spec.js`, `npm run ops:templates`, and `npm run ops:check`.
4. Run full repository verification: `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
5. Dispatch a Stage 1 reviewer subagent via `requesting-code-review`, evaluate findings with `receiving-code-review`, fix any verified issues, stage approved paths, and commit locally on `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `deployment-pipeline-design` — multi-stage drill orchestration, artifact tracking, exit gates, and evidence dossier aggregation.
- `javascript-testing-patterns` — node:test assertions, schema validation, and fail-closed validator testing.
- `requesting-code-review` — Stage 1 code review dispatch.
- `receiving-code-review` — Stage 2 review evaluation and verification.
- `caveman-commit` — conventional commit message authoring.
