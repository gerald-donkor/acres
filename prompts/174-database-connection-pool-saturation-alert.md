# 174 — evidence-based database connection pool saturation alert

## Scope and why this is next

The committed baseline is `1082f1c` on `main`; the worktree is clean when this prompt was prepared. This is a bounded Phase 12 operational alerting step under `docs/build-plan.md` §13 and §21. Prompts 168 and 169 instrumented API and Worker `pg.Pool` connection and wait-queue gauges (`acres_postgres_pool_requests_waiting`), prompt 170 and 171 instrumented PostgreSQL server connections and lock-wait diagnostics, and prompt 172 and 173 instrumented pool acquisition latency and query execution duration.

However, `docs/build-plan.md` explicitly records that "evidence-based saturation alerting remain open" and `docs/operations.md` records that "No pool saturation alert or threshold is configured; production capacity evidence is still needed before setting one." In prompt 167, the former `DatabaseConnectionPoolSaturation` alert (which had incorrectly measured in-flight HTTP requests `acres_http_active_requests > 40`) was renamed to `HighHttpConcurrency`, noting that true database pool saturation was unmeasured and would be restored with an evidence-based rule once verified pool signals existed.

With `acres_postgres_pool_requests_waiting` now exposed across Prometheus scrapes and verified in operational dashboards, implement the evidence-based `DatabaseConnectionPoolSaturation` alert rule in `infra/prometheus/alerts.yml`, expand alert rule verification and simulation suites from 7 to 8 rules, add the incident response runbook in `docs/launch-checklist.md` §5, and document the resolution in `docs/operations.md` and `docs/build-plan.md`.

## References and verified baseline

- Re-read `AGENTS.md` §§2, 4–7, 10, `docs/build-plan.md` §§13, 14, 21, `docs/operations.md` (Topology & Telemetry, Prometheus Metrics, and prompts 167–173 records), `docs/launch-checklist.md` §§3.5 and 5, `docs/backend.md`, `docs/security.md` (TM-20), and `docs/skills.md`.
- Inspect `infra/prometheus/alerts.yml`, `scripts/ops/verify-alert-rules.js`, `scripts/ops/verify-alert-rules.spec.js`, `scripts/ops/check-production-templates.sh`, and `scripts/ops/run-capacity-alerting-drill.sh`.
- `acres_postgres_pool_requests_waiting` gauge is registered in `server/src/metrics/metrics.service.ts` and sampled from `PrismaService.getPoolSnapshot().waiting`. When requests are queued waiting to acquire a connection from `pg.Pool`, `waiting > 0`.
- Connection timeout in `PrismaService` is 5000 ms. A sustained condition of `acres_postgres_pool_requests_waiting{job="acres-api"} > 0` for `1m` represents severe connection starvation and pool exhaustion where multiple client queries have been queued or timed out.
- The seven existing rules (`AcresApiDown`, `HighHttp5xxRate`, `P95LatencyThresholdExceeded`, `High429Rate`, `QueueDeadLettersDetected`, `OutboxDeliveryLag`, `HighHttpConcurrency`) remain intact; `DatabaseConnectionPoolSaturation` becomes the eighth required alert.

## Implementation contract

1. **Prometheus alert rule in `infra/prometheus/alerts.yml`.**
   Add the eighth alert rule to `acres_service_alerts`:
   ```yaml
         - alert: DatabaseConnectionPoolSaturation
           expr: acres_postgres_pool_requests_waiting{job="acres-api"} > 0
           for: 1m
           labels:
             severity: warning
           annotations:
             summary: API PostgreSQL connection pool saturation
             description: Requests have been waiting to acquire a connection from the API PostgreSQL pool for more than 1 minute, indicating connection starvation.
   ```
2. **Alert rule validator & simulation in `scripts/ops/verify-alert-rules.js`.**
   - Add `'acres_postgres_pool_requests_waiting'` to `KNOWN_METRIC_IDENTIFIERS`.
   - Add `'DatabaseConnectionPoolSaturation'` to `REQUIRED_ALERTS` (expanding from 7 to 8 rules).
   - Add simulation definition for `DatabaseConnectionPoolSaturation`:
     ```javascript
     DatabaseConnectionPoolSaturation: {
       evaluate: (data) => (data.postgresPoolRequestsWaiting || 0) > 0,
       firingSample: { postgresPoolRequestsWaiting: 3 },
       clearedSample: { postgresPoolRequestsWaiting: 0 },
       thresholdDescription: 'acres_postgres_pool_requests_waiting{job="acres-api"} > 0',
     },
     ```
   - In rule verification loop, assert that `DatabaseConnectionPoolSaturation` specifies exact expression `acres_postgres_pool_requests_waiting{job="acres-api"} > 0`, `for: 1m`, and `severity: warning`.
3. **Template check & drill runner updates.**
   - In `scripts/ops/check-production-templates.sh`, add `'DatabaseConnectionPoolSaturation'` to `requiredAlerts` array (8 rules).
   - In `scripts/ops/run-capacity-alerting-drill.sh`, update rule count comment and stdout message from `7 rules` / `7/7 rules` to `8 rules` / `8/8 rules`.
4. **Focused test suite in `scripts/ops/verify-alert-rules.spec.js`.**
   - Update tests verifying all 8 required alert rules are present.
   - Add focused test asserting that `DatabaseConnectionPoolSaturation` rejects changed signal, duration, or severity.
   - Add focused test asserting that `DatabaseConnectionPoolSaturation` fires when `postgresPoolRequestsWaiting > 0` and clears at `0`.
5. **Incident response runbook & documentation.**
   - In `docs/launch-checklist.md`, update §2 on-call team table and §3.5 category 5 to reference 8 Prometheus alerts. Add full §5 runbook for `DatabaseConnectionPoolSaturation (warning)` with PromQL, triage steps (correlating Panels 11, 23, 25, 19–22, and read-only contention queries), containment actions, and clearing condition (`acres_postgres_pool_requests_waiting{job="acres-api"} == 0` for 5m).
   - Update `docs/operations.md` and `docs/build-plan.md` with a dated prompt 174 record detailing the alert rule, PromQL expression, threshold rationale, and closure of the open saturation alerting item. Operator capacity baseline and launch sign-off remain open.

## Verification and execution sequence

1. Record `BASE_SHA`, `HEAD_SHA`, branch, and clean worktree status.
2. Edit `infra/prometheus/alerts.yml`, `scripts/ops/verify-alert-rules.js`, `scripts/ops/verify-alert-rules.spec.js`, `scripts/ops/check-production-templates.sh`, and `scripts/ops/run-capacity-alerting-drill.sh`.
3. Run `npm run ops:alert-test`, `npm run ops:alert-drill`, and `npm run ops:templates`.
4. Update `docs/launch-checklist.md`, `docs/operations.md`, and `docs/build-plan.md`.
5. Run full operational and build verification: `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
6. Dispatch a Stage 1 reviewer subagent via `requesting-code-review`, evaluate findings with `receiving-code-review`, fix any verified issues, stage approved paths, and commit locally on `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `prometheus-configuration` — alert rule semantics, PromQL syntax, duration, and threshold rationale.
- `postgres-best-practices` — connection pool starvation, wait queue dynamics, and triage runbooks.
- `javascript-testing-patterns` — alert validator unit tests, negative mutation assertions, and simulation tests.
- `requesting-code-review` — Stage 1 code review dispatch.
- `receiving-code-review` — evaluate and verify review feedback.
- `caveman-commit` — required local commit message.
