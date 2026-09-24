# 181 — incident runbook and alert PromQL reconciliation

## Scope and why this is next

The committed baseline is `20c1538` on `main`; the worktree is clean when this prompt was prepared. This is a bounded Phase 12 operational runbook and template verification step under `docs/build-plan.md` §13, §21, §22, `docs/launch-checklist.md` §5, and `docs/operations.md`.

Prompts 168–180 established deep database connection pool and server telemetry, added 4 Prometheus alert rules (expanding the operational alert suite from 7 to 11 rules), implemented capacity baseline modeling with database latency SLO validation, and added Panels 27 and 28 to the Grafana operational dashboard (achieving 100% visual panel coverage for all 11 alerts).

However, several operational documentation and verification inconsistencies remain:
1. In `docs/launch-checklist.md` §5, four alert runbooks define unscoped PromQL expressions:
   - `HighHttp5xxRate` omits `{job="acres-api"}` from the rate expressions.
   - `High429Rate` omits `{job="acres-api"}` from the 429 and request rate expressions.
   - `QueueDeadLettersDetected` omits `{job="acres-worker"}` from the dead-letter count expression.
   - `OutboxDeliveryLag` omits `{job="acres-api"}` from `acres_outbox_pending_events`. This contradicts `infra/prometheus/alerts.yml` and directly violates the fail-closed assertion in `scripts/ops/verify-alert-rules.spec.js` (which specifically rejects `acres_outbox_pending_events > 50` as an unscoped selector).
2. Eight of the 11 alert runbooks in `docs/launch-checklist.md` §5 (`AcresApiDown`, `AcresWorkerDown`, `PostgresDown`, `PostgresExporterDown`, `HighHttp5xxRate`, `P95LatencyThresholdExceeded`, `QueueDeadLettersDetected`, `OutboxDeliveryLag`) lack explicit `Dashboard:` lines cross-referencing their corresponding Grafana panels (Panels 2, 11, 15, 14/16, 6, 7, 4, 3), whereas `HighHttpConcurrency` (Panel 27), `High429Rate` (Panel 28), and `DatabaseConnectionPoolSaturation` (Panels 9, 10, 23, 25) define them.
3. In `docs/operations.md` line 1145 and `docs/build-plan.md` line 856, historical summary text retains stale "7 Prometheus alert runbooks" wording from before Prompts 174–177 expanded the suite to 11.
4. In `scripts/ops/verify-alert-rules.js`, `KNOWN_METRIC_IDENTIFIERS` contains `acres_database_query_duration_seconds` but omits `acres_postgres_pool_acquisition_duration_seconds`, leaving the recognized metric catalog incomplete for database diagnostic histograms.
5. In `scripts/ops/check-production-templates.sh`, there is no validation verifying that `docs/launch-checklist.md` documents all 11 alert runbooks with exact scoped PromQL expressions matching `infra/prometheus/alerts.yml` and cross-references to their Grafana dashboard panels.

Reconcile all 11 incident response runbooks in `docs/launch-checklist.md` §5 with exact scoped PromQL expressions and Grafana panel cross-references. Add `acres_postgres_pool_acquisition_duration_seconds` to `KNOWN_METRIC_IDENTIFIERS` in `scripts/ops/verify-alert-rules.js` and expand its test suite. Enforce runbook PromQL and dashboard panel integrity in `scripts/ops/check-production-templates.sh`. Correct stale alert counts in `docs/operations.md` and `docs/build-plan.md`. Operator launch sign-off remains open.

## References and verified baseline

- Re-read `AGENTS.md` §§2, 4–7, 10, `docs/build-plan.md` §§13, 21, 22, `docs/operations.md` (prompts 174–180 records, Phase 12K section), `docs/launch-checklist.md` §5, and `docs/skills.md`.
- Inspect `infra/prometheus/alerts.yml`, `infra/grafana/dashboards/acres-operations.json`, `scripts/ops/verify-alert-rules.js`, `scripts/ops/verify-alert-rules.spec.js`, and `scripts/ops/check-production-templates.sh`.
- Exact 11 alerts and corresponding Grafana panels:
  1. `AcresApiDown` -> Panel 2 ("Acres API Status", `up{job="acres-api"}`)
  2. `AcresWorkerDown` -> Panel 11 ("Acres Worker Status", `up{job="acres-worker"}`)
  3. `PostgresDown` -> Panel 15 ("PostgreSQL Database Scrape", `pg_up{job="acres-postgres"}`)
  4. `PostgresExporterDown` -> Panel 14 ("PostgreSQL Exporter HTTP Scrape", `up{job="acres-postgres"}`) and Panel 16 ("PostgreSQL Collector Error", `pg_exporter_last_scrape_error{job="acres-postgres"}`)
  5. `HighHttp5xxRate` -> Panel 6 ("HTTP 5xx Error Rate", `acres_http_requests_total{job="acres-api",status_class="5xx"}`)
  6. `P95LatencyThresholdExceeded` -> Panel 7 ("HTTP Request Latency Percentiles", `acres_http_request_duration_seconds_bucket{job="acres-api"}`) alongside Panels 23/24 and 25/26
  7. `High429Rate` -> Panel 28 ("API HTTP 429 Rate Percentage", `acres_http_429_responses_total{job="acres-api"}`)
  8. `QueueDeadLettersDetected` -> Panel 4 ("Queue Dead Letters", `acres_queue_jobs_total{job="acres-worker",status="failed"}`)
  9. `OutboxDeliveryLag` -> Panel 3 ("Pending Outbox Events", `acres_outbox_pending_events{job="acres-api"}`)
  10. `HighHttpConcurrency` -> Panel 27 ("API In-Flight Active HTTP Requests", `acres_http_active_requests{job="acres-api"}`)
  11. `DatabaseConnectionPoolSaturation` -> Panels 9/10, Panel 23, and Panel 25

## Implementation contract

1. **Reconcile runbook PromQL and dashboard cross-references in `docs/launch-checklist.md` §5.**
   - For all 11 runbooks, ensure PromQL expressions exactly match `alerts.yml` including job scoping:
     - `HighHttp5xxRate`: `(sum(rate(acres_http_requests_total{job="acres-api",status_class="5xx"}[5m])) / clamp_min(sum(rate(acres_http_requests_total{job="acres-api"}[5m])), 0.001)) * 100 > 5` for 5m.
     - `High429Rate`: `(sum(rate(acres_http_429_responses_total{job="acres-api"}[5m])) / clamp_min(sum(rate(acres_http_requests_total{job="acres-api"}[5m])), 0.001)) * 100 > 10` for 5m.
     - `QueueDeadLettersDetected`: `sum(acres_queue_jobs_total{job="acres-worker",status="failed"}) > 0` for 1m.
     - `OutboxDeliveryLag`: `acres_outbox_pending_events{job="acres-api"} > 50` for 10m.
   - For all 11 runbooks, add an explicit `- Dashboard:` bullet specifying the panel ID and title in `infra/grafana/dashboards/acres-operations.json`.

2. **Metric catalog expansion in `scripts/ops/verify-alert-rules.js`.**
   - Add `'acres_postgres_pool_acquisition_duration_seconds'` to `KNOWN_METRIC_IDENTIFIERS`.
   - In `scripts/ops/verify-alert-rules.spec.js`, assert that `KNOWN_METRIC_IDENTIFIERS` contains both `acres_postgres_pool_acquisition_duration_seconds` and `acres_database_query_duration_seconds`.

3. **Template integrity check in `scripts/ops/check-production-templates.sh`.**
   - In the Node validation block:
     - Read `docs/launch-checklist.md`.
     - Read `infra/prometheus/alerts.yml`.
     - For each alert rule in `alerts.yml`:
       - Assert that `docs/launch-checklist.md` contains an `### <AlertName>` header.
       - Assert that `docs/launch-checklist.md` contains the exact `expr` from `alerts.yml`.
       - Assert that the section contains a `- Dashboard:` line referencing the associated Grafana panel.

4. **Documentation update.**
   - In `docs/operations.md`, update line 1145 to state 11 Prometheus alert runbooks, and add Prompt 181 record.
   - In `docs/build-plan.md`, update line 856 to state 11 Prometheus alert runbooks, and record Prompt 181 in §21/§22. Operator launch sign-off remains open.

## Verification and execution sequence

1. Record `BASE_SHA`, `HEAD_SHA`, branch, and clean worktree status.
2. Edit `docs/launch-checklist.md`, `scripts/ops/verify-alert-rules.js`, `scripts/ops/verify-alert-rules.spec.js`, `scripts/ops/check-production-templates.sh`, `docs/operations.md`, and `docs/build-plan.md`.
3. Run `npm run ops:alert-test`, `npm run ops:templates`, and `npm run ops:check`.
4. Run full repository verification: `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
5. Dispatch a Stage 1 reviewer subagent via `requesting-code-review`, evaluate findings with `receiving-code-review`, fix any verified issues, stage approved paths, and commit locally on `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `prometheus-configuration` — alert expressions, job scoping, PromQL syntax, and metric identification.
- `grafana-dashboards` — panel mapping, alert signal correlation, and dashboard panel cross-referencing.
- `javascript-testing-patterns` — node:test assertions, regex extraction, and schema verification.
- `deployment-pipeline-design` — template and runbook integrity checks in ops gates.
- `requesting-code-review` — Stage 1 code review dispatch.
- `receiving-code-review` — Stage 2 review evaluation and verification.
- `caveman-commit` — conventional commit message authoring.
