# 194 — bind capacity alerting approval to evidence

## Scope and why this is next

The committed baseline is `b0d3cc8` on `main`, with a clean worktree at planning time. Phase 12's launch gate remains open pending operator evidence and approval. Prompts 188–190 hardened Category 6 (`backup_and_disaster_recovery`) by validating the scheduled backup cadence against the RPO and binding launch approval to concrete restore and reconciliation child reports. Prompt 191 hardened Category 8 (`volume_encryption`) by binding launch approval to concrete volume encryption child reports. Prompt 192 hardened Category 3 (`secrets_management`) by binding launch approval to concrete secret rotation child reports and enforcing the 90-day cadence ceiling. Prompt 193 hardened Category 10 (`deployment_and_rollback`) by binding launch approval to concrete deployment drill child reports.

The next dependency-safe launch readiness gap is Category 5 (`slo_and_alerting`). An approved `slo_and_alerting` record requires `availability_target_percent`, `max_p95_latency_ms`, `capacity_target_rps`, `max_database_acquisition_p95_latency_ms`, `max_database_query_p95_latency_ms`, `alert_recipients`, `alert_thresholds_defined: true`, and an `escalation_runbook_ref`. However, `scripts/ops/check-launch-readiness.js` currently allows an approved `slo_and_alerting` section to pass with narrative-only `evidence` (such as `"Prometheus alerts tested with alertmanager route"`) without referencing an actual child report. In fact, `validateReadiness` does not accumulate or check `capacityEvidence` from `evidence`, and `checkEvidenceFile` lacks comprehensive structural validation for the capacity and alerting drill child report emitted by `scripts/ops/run-capacity-alerting-drill.sh` (`capacity-alerting-drill-evidence-<timestamp>.json`).

Bind Category 5 launch approval to a concrete, successful capacity and alerting drill child report emitted by `scripts/ops/run-capacity-alerting-drill.sh` (`capacity-alerting-drill-evidence-<timestamp>.json`), referenced in `evidence`. Validate report status, timestamp, summary compliance (alert verification, capacity SLO compliance, DoS resilience, database baseline compliance), alerts verification (at least 11 rules, all simulations passed, zero errors), capacity compliance (availability, latency, throughput, acquisition latency, query latency, monotonic bounds, overall passed), database telemetry baseline (verified status, exporter/server up, zero pool waiting requests, acquisition and query latency bounds, zero lock waits), DoS resilience status, and zero failures. This continues the fail-closed tightening of Phase 12K's 11-category launch readiness matrix without modifying production services or replacing the operator's responsibility to configure live monitoring, runbooks, and alerting infrastructure.

## References and verified baseline

- Re-read `AGENTS.md` §§2–7 and 10, `docs/build-plan.md` §§13, 21, 22, `docs/operations.md` (Phase 12K, Prompts 183 and 193 records), `docs/launch-checklist.md` Category 5 (§3.5) and §4, `docs/security.md` TM-05, TM-16, TM-20, and `docs/skills.md` before execution.
- Inspect `scripts/ops/check-launch-readiness.js` evidence resolution and Category 5 validation; `scripts/ops/check-launch-readiness.spec.js` approved fixture; `scripts/ops/run-capacity-alerting-drill.sh` producer and its evidence output; `scripts/ops/run-launch-drills.sh` stage 5 and dossier derivation; `infra/launch/readiness.example.json`; `scripts/ops/check-production-templates.sh`; and root `package.json` before edits.
- The producer `run-capacity-alerting-drill.sh` emits a JSON payload with:
  - `timestamp`: basic or ISO UTC timestamp string (e.g. `'20260925T192220Z'` or `'2026-09-25T19:22:20.000Z'`)
  - `durationMs`: finite non-negative number
  - `status`: `'success'` | `'failed'` (`'success'` required)
  - `summary`: object with:
    - `alertVerification`: `'passed'` | `'failed'` (`'passed'` required)
    - `capacitySloCompliance`: `'passed'` | `'failed'` (`'passed'` required)
    - `dosResilience`: `'passed'` | `'failed'` (`'passed'` required)
    - `databaseBaselineCompliance`: `'passed'` | `'failed'` (`'passed'` required)
  - `alerts`: object from `verify-alert-rules.js` with:
    - `valid`: `true`
    - `ruleCount`: integer `>= 11`
    - `errors`: empty array (`[]`)
    - `rules`: array of at least 11 rules
    - `simulations`: array of at least 11 simulation objects, all reporting `passed === true`
  - `capacity`: object from `verify-capacity-load.js` with:
    - `status`: `'passed'`
    - `compliance`: object with:
      - `availabilityPassed`: `true`
      - `latencyPassed`: `true`
      - `throughputPassed`: `true`
      - `databaseAcquisitionLatencyPassed`: `true`
      - `databaseQueryLatencyPassed`: `true`
      - `monotonicDbAcquisition`: `true`
      - `monotonicDbQuery`: `true`
      - `overallPassed`: `true`
    - `sloTargets`: (optional/declared) object with:
      - `availabilityTargetPercent`: number `>= 99.9`
      - `maxP95LatencyMs`: number `<= 500`
      - `capacityTargetRps`: number `>= 100`
      - `maxDatabaseAcquisitionP95LatencyMs`: number `<= 50`
      - `maxDatabaseQueryP95LatencyMs`: number `<= 100`
  - `databaseTelemetryBaseline`: object with:
    - `status`: `'verified'`
    - `postgresExporter`: `up === 1`, `lastScrapeError === 0`
    - `postgresServer`: `pgUp === 1`
    - `connectionPool`: `api.requestsWaiting === 0`, `worker.requestsWaiting === 0`
    - `poolAcquisitionLatency`: `api.p95Ms <= 50`, `worker.p95Ms <= 50`
    - `queryExecutionDuration`: `api.p95Ms <= 100`, `worker.p95Ms <= 100`
    - `serverActivity`: `lockWaits === 0`
  - `dosResilience`: object with `status: 'success'`
  - `failures`: array (`failures.length === 0` required)
- Stage 5 of `run-launch-drills.sh` runs `run-capacity-alerting-drill.sh` and writes `capacity-alerting-drill-evidence-<timestamp>.json` into `$EVIDENCE_DIR`. The verified script also supports custom paths via `--evidence-file <file>`. The checked-in example `infra/launch/readiness.example.json` is unresolved and must remain so.
- No static design comp applies. The measurable contract is the producer's actual status, timestamp, alert rules, simulation results, capacity SLO compliance, database telemetry baseline, DoS resilience, and failure count compared against validation time.

## Implementation contract

1. In `scripts/ops/check-launch-readiness.js`:
   - Add `isCapacityAlertingCandidate({ file, parsed } = {})` helper recognizing candidates by filename pattern (`capacity-alerting-drill-evidence-` or `capacity-alerting`) or structural markers (`typeof parsed.alerts === 'object' && typeof parsed.capacity === 'object' && typeof parsed.dosResilience === 'object' && typeof parsed.databaseTelemetryBaseline === 'object'`). Reject non-objects, arrays, null, or unified dossiers (where `Array.isArray(parsed.stages)` or `parsed.dossier_version !== undefined`). Do not accept an arbitrary JSON object, unified dossier, or filename alone.
   - Add `parseCapacityAlertingTimestamp(value)` helper supporting basic (`YYYYMMDDTHHMMSSZ`) and ISO 8601 (`YYYY-MM-DDTHH:mm:ss(\.\d{3})?Z`) formats.
   - Add `validateCapacityAlertingReport(report, now)` helper:
     - Require a plain object (not null, not array).
     - Require `report.timestamp` (or `report.drill_timestamp`) to be a valid UTC timestamp that parses to a finite timestamp not in the future relative to `now`.
     - Require `report.status === 'success'`.
     - Require `Array.isArray(report.failures) && report.failures.length === 0`.
     - Require `report.summary` object with `alertVerification === 'passed'`, `capacitySloCompliance === 'passed'`, `dosResilience === 'passed'`, and `databaseBaselineCompliance === 'passed'`.
     - Require `report.alerts` object with `valid === true`, integer `ruleCount >= 11`, empty `errors` array, array `rules` with length `>= 11`, and array `simulations` with length `>= 11` where every simulation item has `passed === true`.
     - Require `report.capacity` object with `status === 'passed'` and `compliance` object asserting `availabilityPassed === true`, `latencyPassed === true`, `throughputPassed === true`, `databaseAcquisitionLatencyPassed === true`, `databaseQueryLatencyPassed === true`, `monotonicDbAcquisition === true`, `monotonicDbQuery === true`, and `overallPassed === true`.
     - If `report.capacity.sloTargets` is provided, require `availabilityTargetPercent >= 99.9`, `maxP95LatencyMs <= 500`, `capacityTargetRps >= 100`, `maxDatabaseAcquisitionP95LatencyMs <= 50`, and `maxDatabaseQueryP95LatencyMs <= 100`.
     - Require `report.databaseTelemetryBaseline` object with `status === 'verified'`, `postgresExporter.up === 1`, `postgresExporter.lastScrapeError === 0`, `postgresServer.pgUp === 1`, `connectionPool.api.requestsWaiting === 0`, `connectionPool.worker.requestsWaiting === 0`, `poolAcquisitionLatency.api.p95Ms <= 50`, `poolAcquisitionLatency.worker.p95Ms <= 50`, `queryExecutionDuration.api.p95Ms <= 100`, `queryExecutionDuration.worker.p95Ms <= 100`, and `serverActivity.lockWaits === 0`.
     - Require `report.dosResilience` object with `status === 'success'`.
     - Require `report.durationMs` (if present) to be a finite non-negative number.
2. In `checkEvidenceFile`:
   - Add dedicated checks for capacity alerting drill child evidence when `file.includes('capacity-alerting-drill-evidence-')` or candidate markers match:
     - Check `status !== 'success'` -> addBlocker
     - Check `summary.alertVerification !== 'passed'` -> addBlocker
     - Check `summary.capacitySloCompliance !== 'passed'` -> addBlocker
     - Check `summary.dosResilience !== 'passed'` -> addBlocker
     - Check `summary.databaseBaselineCompliance !== 'passed'` -> addBlocker
     - Check `alerts.valid === false` -> addBlocker
     - Check `capacity.compliance.overallPassed === false` -> addBlocker
     - Check `databaseTelemetryBaseline.status !== 'verified'` -> addBlocker
     - Check `dosResilience.status !== 'success'` -> addBlocker
     - Check `Array.isArray(failures) && failures.length > 0` -> addBlocker
3. In `validateReadiness`:
   - Accumulate parsed evidence files from `sections.slo_and_alerting` into a `capacityEvidence` array:
     `if (sectionName === 'slo_and_alerting') capacityEvidence.push(...parsedFiles);`
   - In Category 3.5 (`slo_and_alerting`):
     - Filter `capacityEvidence` with `isCapacityAlertingCandidate`.
     - If no candidate report exists, add blocker:
       `'A successful capacity and alerting drill child JSON report is required'`
     - Validate all candidate reports with `validateCapacityAlertingReport(parsed, now)`. If any candidate report fails or is malformed, add blocker:
       `'A referenced capacity and alerting report is invalid or failed'`
     - Ensure that every candidate in evidence is validated: a failed or malformed report blocks approval even beside a valid one or inside a wildcard match.
   - Export `isCapacityAlertingCandidate`, `validateCapacityAlertingReport`, and `parseCapacityAlertingTimestamp` in `module.exports`.
4. Use the validator's existing injected `options.now` for deterministic date testing and default to real current time for CLI use. Bound diagnostics to generic Category 5 messages: do not leak filesystem paths or internal infrastructure details in blocker strings.
5. In `scripts/ops/check-launch-readiness.spec.js`:
   - Create a temporary valid capacity alerting drill fixture file (`capacity-alerting-drill-evidence-valid.json`) in the existing fixture directory with valid basic timestamp `'20260828T120000Z'`, `status: 'success'`, `summary: { alertVerification: 'passed', capacitySloCompliance: 'passed', dosResilience: 'passed', databaseBaselineCompliance: 'passed' }`, complete `alerts` with 11 passed rules/simulations, complete `capacity` with passed compliance and SLO targets, verified `databaseTelemetryBaseline`, successful `dosResilience`, and empty `failures`.
   - Update `buildValidApprovedRecord().sections.slo_and_alerting.evidence` to reference `capacityAlertingFixturePath`.
   - Add test cases covering:
     - Prose-only or empty evidence without local drill report in approved `slo_and_alerting` blocks approval.
     - Unified dossier alone or arbitrary JSON with a capacity-like filename blocks approval.
     - Child report with `status: 'failed'` blocks approval.
     - Child report with `summary.alertVerification: 'failed'` blocks approval.
     - Child report with `summary.capacitySloCompliance: 'failed'` blocks approval.
     - Child report with `summary.dosResilience: 'failed'` blocks approval.
     - Child report with `summary.databaseBaselineCompliance: 'failed'` blocks approval.
     - Child report with `alerts.valid: false`, `ruleCount < 11`, or failed simulation blocks approval.
     - Child report with `capacity.compliance.overallPassed: false` (or any individual compliance flag false) blocks approval.
     - Child report with breached `databaseTelemetryBaseline` (unverified status, down exporter/server, waiting connections, or lock waits > 0) blocks approval.
     - Child report with `dosResilience.status: 'failed'` blocks approval.
     - Child report with `failures` non-empty blocks approval.
     - Child report with invalid or future timestamp blocks approval.
     - Wildcard or multiple evidence files containing a failed report alongside a valid one blocks approval.
     - Valid report at an arbitrary custom path passes.
     - Helper functions handle edge cases and missing parameters safely.
     - Unrelated approved categories remain unaffected.
6. Update `docs/operations.md`, `docs/launch-checklist.md` Category 5, and the Phase 12 verification record in `docs/build-plan.md` with the accepted capacity alerting drill child-report contract, verification results, and operator responsibilities. Keep `infra/launch/readiness.example.json` unresolved with empty evidence. No new `AGENTS.md` index row is needed.

## Impact, non-goals, and rollback

- No application routes, database schemas, UI components, background workers, or production Compose configs change. Only launch readiness evidence validation, test fixtures, and operations documentation change.
- An approved readiness record that previously relied only on prose evidence will now fail closed until its actual successful child report is referenced.
- This prompt validates consistency of an operator-supplied JSON report; it does not replace the operator's duty to configure live monitoring, alert channels, and escalation runbooks in production.
- Rollback: revert the Category 5 evidence validator in `scripts/ops/check-launch-readiness.js`, the test updates in `check-launch-readiness.spec.js`, and documentation changes.

## Verification and review

1. Re-read this approved prompt and load every named skill before code.
2. Run `npm run ops:readiness-test`, `npm run ops:templates`, and `npm run ops:check`; quote the real output.
3. Run `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` and confirm it fails closed as expected.
4. Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
5. Dispatch a reviewer subagent via `requesting-code-review` after self-verification. Evaluate feedback using `receiving-code-review`, verify claims, fix verified issues, and rerun affected checks.
6. Record implementation and results in owning documentation, and commit prompt-scoped files locally on `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `deployment-pipeline-design` — maintain strict separation between automated pipeline gates, child drill artifacts, and operator launch sign-off.
- `javascript-testing-patterns` — build deterministic file-based positive and negative tests with temporary fixtures.
- `prometheus-configuration` — align alert verification criteria with all 11 Prometheus rules and simulations.
- `kpi-dashboard-design` — validate capacity SLO targets, latency percentiles, throughput, and pool acquisition timings.
- `requesting-code-review` — dispatch reviewer subagent with structured context before finalizing.
- `receiving-code-review` — evaluate reviewer findings with technical rigor and verify before implementing fixes.
- `caveman-commit` — format concise conventional commit message for local commit to main.
