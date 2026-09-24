# 179 — launch readiness database SLO validation

## Scope and why this is next

The committed baseline is `5b9c47d` on `main`; the worktree is clean when this prompt was prepared. This is a bounded Phase 12 operational step under `docs/build-plan.md` §13, §21, §22, `docs/launch-checklist.md` §3.5 & §7, and `docs/operations.md`. Prompts 168–173 established deep database observability (API and Worker `pg.Pool` connection and queue gauges, PostgreSQL server activity, lock waits, pool acquisition latency, and SQL query execution duration). Prompts 174–177 established all 11 required Prometheus alert rules. Prompt 178 implemented operator capacity baseline modeling in `scripts/ops/verify-capacity-load.js` and captured structured `databaseTelemetryBaseline` in `scripts/ops/run-capacity-alerting-drill.sh`.

However, the launch readiness gate validator (`scripts/ops/check-launch-readiness.js`) and template record (`infra/launch/readiness.example.json`) still do not enforce database latency SLO ceilings when evaluating readiness records for launch approval:
1. `infra/launch/readiness.example.json` omits `max_database_acquisition_p95_latency_ms` and `max_database_query_p95_latency_ms` from `sections.slo_and_alerting`.
2. `scripts/ops/check-production-templates.sh` does not verify that `readiness.example.json` defines these database SLO ceilings.
3. `scripts/ops/check-launch-readiness.js` validates HTTP availability (99.0–100%), HTTP p95 latency (> 0), and throughput RPS (> 0), but omits validation of `max_database_acquisition_p95_latency_ms` (must be positive number <= 50ms) and `max_database_query_p95_latency_ms` (must be positive number <= 100ms) when `slo_and_alerting` is approved.
4. `checkEvidenceFile` in `scripts/ops/check-launch-readiness.js` inspects `status`, `overall_status`, `success: false`, and `summary.exitCode`, but does not inspect `summary.databaseBaselineCompliance` or `databaseTelemetryBaseline.status`. An evidence report containing `databaseBaselineCompliance: "failed"` or `databaseTelemetryBaseline.status: "breached"` would slip through evidence cross-validation without blocking approval.

Extend `scripts/ops/check-launch-readiness.js` to fail-closed on missing or ceiling-breaching database latency SLO targets and on evidence reporting database baseline failures/breaches. Update `infra/launch/readiness.example.json`, add template verification to `scripts/ops/check-production-templates.sh`, expand unit tests in `scripts/ops/check-launch-readiness.spec.js`, document the validator contract in `docs/launch-checklist.md` §3.5, and document the resolution in `docs/operations.md` and `docs/build-plan.md`. Launch sign-off remains open.

## References and verified baseline

- Re-read `AGENTS.md` §§2, 4–7, 10, `docs/build-plan.md` §§13, 21, 22, `docs/operations.md` (prompts 168–178 records), `docs/launch-checklist.md` §§2, 3.5, 5, 7, `docs/security.md` (TM-20), and `docs/skills.md`.
- Inspect `scripts/ops/check-launch-readiness.js`, `scripts/ops/check-launch-readiness.spec.js`, `scripts/ops/check-production-templates.sh`, `infra/launch/readiness.example.json`, and `scripts/ops/run-capacity-alerting-drill.sh`.
- Category 5 SLO criteria in `docs/launch-checklist.md` §3.5 mandate:
  - Availability target >= 99.9% (error rate < 0.1%);
  - Max p95 HTTP latency ceiling <= 500ms;
  - Capacity target >= 100 RPS;
  - Database pool acquisition p95 latency ceiling <= 50ms (`max_database_acquisition_p95_latency_ms`);
  - Database SQL query execution p95 latency ceiling <= 100ms (`max_database_query_p95_latency_ms`);
  - `databaseTelemetryBaseline` verified in evidence (`summary.databaseBaselineCompliance: "passed"`, `databaseTelemetryBaseline.status: "verified"`).
- The 11 Prometheus alert rules and all existing Category 5 SLO validations remain intact.

## Implementation contract

1. **Template updates in `infra/launch/readiness.example.json`.**
   - Add database SLO ceiling fields to `sections.slo_and_alerting`:
     ```json
     "max_database_acquisition_p95_latency_ms": 50,
     "max_database_query_p95_latency_ms": 100,
     ```
   - Update `notes` in `slo_and_alerting` to explicitly mention the 50ms pool acquisition and 100ms query execution p95 latency ceilings.

2. **Template integrity verification in `scripts/ops/check-production-templates.sh`.**
   - In the Node validation block reading `infra/launch/readiness.example.json`, assert that `readinessExample.sections.slo_and_alerting.max_database_acquisition_p95_latency_ms === 50` and `readinessExample.sections.slo_and_alerting.max_database_query_p95_latency_ms === 100`.

3. **Fail-closed readiness validation in `scripts/ops/check-launch-readiness.js`.**
   - In `checkEvidenceFile`:
     - If `parsed.summary && typeof parsed.summary === 'object' && parsed.summary.databaseBaselineCompliance === 'failed'`, add a blocker:
       `Approved evidence file '${ref}' reports database baseline failure (summary.databaseBaselineCompliance: "failed")`.
     - If `parsed.databaseTelemetryBaseline && typeof parsed.databaseTelemetryBaseline === 'object' && parsed.databaseTelemetryBaseline.status === 'breached'`, add a blocker:
       `Approved evidence file '${ref}' reports database baseline breach (databaseTelemetryBaseline.status: "breached")`.
   - In `validateReadiness()` under Category 3.5 `slo_and_alerting`:
     - Assert `max_database_acquisition_p95_latency_ms`:
       ```javascript
       if (
         typeof sloSec.max_database_acquisition_p95_latency_ms !== 'number' ||
         sloSec.max_database_acquisition_p95_latency_ms <= 0 ||
         sloSec.max_database_acquisition_p95_latency_ms > 50
       ) {
         addBlocker(
           'slo_and_alerting',
           `Max database pool acquisition p95 latency ceiling must be a positive number <= 50ms (received: ${sloSec.max_database_acquisition_p95_latency_ms})`
         );
       }
       ```
     - Assert `max_database_query_p95_latency_ms`:
       ```javascript
       if (
         typeof sloSec.max_database_query_p95_latency_ms !== 'number' ||
         sloSec.max_database_query_p95_latency_ms <= 0 ||
         sloSec.max_database_query_p95_latency_ms > 100
       ) {
         addBlocker(
           'slo_and_alerting',
           `Max database query execution p95 latency ceiling must be a positive number <= 100ms (received: ${sloSec.max_database_query_p95_latency_ms})`
         );
       }
       ```

4. **Focused test suite expansion in `scripts/ops/check-launch-readiness.spec.js`.**
   - Update `buildValidApprovedRecord()` to include `max_database_acquisition_p95_latency_ms: 50` and `max_database_query_p95_latency_ms: 100` in `sections.slo_and_alerting`.
   - Add unit test: `validateReadiness fails closed when max_database_acquisition_p95_latency_ms is missing, non-number, or exceeds 50ms`.
   - Add unit test: `validateReadiness fails closed when max_database_query_p95_latency_ms is missing, non-number, or exceeds 100ms`.
   - Add unit test: `validateReadiness blocks approval when evidence reports database baseline failure or breach`.

5. **Documentation and runbook integration.**
   - In `docs/launch-checklist.md` §3.5 and §7, record that `check-launch-readiness.js` enforces the 50ms acquisition and 100ms query p95 latency ceilings and validates database baseline compliance in evidence artifacts.
   - Update `docs/operations.md` and `docs/build-plan.md` with a dated prompt 179 record establishing fail-closed database latency SLO validation in the launch readiness gate. Launch sign-off remains open.

## Verification and execution sequence

1. Record `BASE_SHA`, `HEAD_SHA`, branch, and clean worktree status.
2. Edit `infra/launch/readiness.example.json`, `scripts/ops/check-production-templates.sh`, `scripts/ops/check-launch-readiness.js`, and `scripts/ops/check-launch-readiness.spec.js`.
3. Run `npm run ops:templates`, `npm run ops:readiness-test`, and `npm run ops:capacity-test`.
4. Update `docs/launch-checklist.md`, `docs/operations.md`, and `docs/build-plan.md`.
5. Run full operational and build verification: `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
6. Dispatch a Stage 1 reviewer subagent via `requesting-code-review`, evaluate findings with `receiving-code-review`, fix any verified issues, stage approved paths, and commit locally on `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `prometheus-configuration` — latency percentile quantiles, histogram buckets, and alert thresholds.
- `postgres-best-practices` — database latency SLO thresholds, connection pool checkout latency, and query duration ceilings.
- `javascript-testing-patterns` — schema validation tests, negative boundary condition tests, and CLI test runner patterns.
- `deployment-pipeline-design` — launch readiness evaluation, fail-closed policy enforcement, and promotion gating.
- `requesting-code-review` — Stage 1 code review dispatch.
- `receiving-code-review` — evaluate and verify review feedback.
- `caveman-commit` — required local commit message.
