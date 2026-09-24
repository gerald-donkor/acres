# 176 — postgres server availability alert

## Scope and why this is next

The committed baseline is `9483602` on `main`; the worktree is clean when this prompt was prepared. This is a bounded Phase 12 operational alerting step under `docs/build-plan.md` §13, §21, and `docs/launch-checklist.md` §3.5 & §5. Prompt 66 added the critical `AcresApiDown` alert (`up{job="acres-api"} == 0` for 1m), and prompt 175 added the critical `AcresWorkerDown` alert (`up{job="acres-worker"} == 0` for 1m).

However, while API and background worker process availability are monitored at critical severity, the core PostgreSQL database has NO server availability alert rule in `infra/prometheus/alerts.yml`. Prometheus scrapes `acres-postgres` at `postgres-exporter:9187/metrics`, which exposes `pg_up` ("Whether the last scrape of metrics from PostgreSQL was able and allowed to connect to the server (1 for success, 0 for failure)") and `pg_exporter_last_scrape_error`. When the PostgreSQL server crashes, stops, runs out of disk, or refuses connections, `pg_up{job="acres-postgres"} == 0`.

Currently, if PostgreSQL goes down, the entire application fails, but on-call engineers receive no database availability alert; only a generic 5xx error burst might trigger after 5 minutes, obscuring the infrastructure root cause.

With `pg_up` already scraped and retained in Prometheus and Grafana dashboards, implement the critical `PostgresDown` alert rule in `infra/prometheus/alerts.yml`, expand alert rule verification and simulation suites from 9 to 10 rules, add the incident response runbook in `docs/launch-checklist.md` §5, and document the resolution in `docs/operations.md` and `docs/build-plan.md`.

## References and verified baseline

- Re-read `AGENTS.md` §§2, 4–7, 10, `docs/build-plan.md` §§13, 14, 21, `docs/operations.md` (Topology & Telemetry, Prometheus Metrics, prompt 170 and 175 records), `docs/launch-checklist.md` §§2, 3.5, and 5, `docs/backend.md`, `docs/security.md` (TM-16, TM-20), and `docs/skills.md`.
- Inspect `infra/prometheus/alerts.yml`, `infra/prometheus/prometheus.yml`, `scripts/ops/verify-alert-rules.js`, `scripts/ops/verify-alert-rules.spec.js`, `scripts/ops/check-production-templates.sh`, and `scripts/ops/run-capacity-alerting-drill.sh`.
- Prometheus scrapes `postgres-exporter` every 30 seconds at `postgres-exporter:9187/metrics` under `job="acres-postgres"`. The metric relabel configuration retains `pg_up`. When the PostgreSQL database is reachable and accepting connections, `pg_up{job="acres-postgres"} == 1`. When unreachable, halted, or failing authentication, `pg_up{job="acres-postgres"} == 0`.
- The nine existing rules (`AcresApiDown`, `AcresWorkerDown`, `HighHttp5xxRate`, `P95LatencyThresholdExceeded`, `High429Rate`, `QueueDeadLettersDetected`, `OutboxDeliveryLag`, `HighHttpConcurrency`, `DatabaseConnectionPoolSaturation`) remain intact; `PostgresDown` becomes the tenth required alert.

## Implementation contract

1. **Prometheus alert rule in `infra/prometheus/alerts.yml`.**
   Add the tenth alert rule to `acres_service_alerts` alongside `AcresApiDown` and `AcresWorkerDown`:
   ```yaml
         - alert: PostgresDown
           expr: pg_up{job="acres-postgres"} == 0
           for: 1m
           labels:
             severity: critical
           annotations:
             summary: PostgreSQL database instance is down
             description: The PostgreSQL database is unreachable from postgres-exporter or failing connections for more than 1 minute.
   ```
2. **Alert rule validator & simulation in `scripts/ops/verify-alert-rules.js`.**
   - Add `'pg_up'` to `KNOWN_METRIC_IDENTIFIERS`.
   - Add `'PostgresDown'` to `REQUIRED_ALERTS` (expanding from 9 to 10 rules).
   - Add simulation definition for `PostgresDown`:
     ```javascript
     PostgresDown: {
       evaluate: (data) => data.pgUp === 0,
       firingSample: { pgUp: 0 },
       clearedSample: { pgUp: 1 },
       thresholdDescription: 'pg_up{job="acres-postgres"} == 0',
     },
     ```
   - Update job scoping logic so that `PostgresDown` expects `job="acres-postgres"`, `QueueDeadLettersDetected` and `AcresWorkerDown` expect `job="acres-worker"`, and API rules expect `job="acres-api"`:
     ```javascript
     const expectedJob = requiredAlert === 'PostgresDown'
       ? 'acres-postgres'
       : (requiredAlert === 'QueueDeadLettersDetected' || requiredAlert === 'AcresWorkerDown')
       ? 'acres-worker'
       : 'acres-api';
     ```
   - In rule verification loop, assert that `PostgresDown` specifies exact expression `pg_up{job="acres-postgres"} == 0`, `for: 1m`, and `severity: critical`.
3. **Template check & drill runner updates.**
   - In `scripts/ops/check-production-templates.sh`, add `'PostgresDown'` to `requiredAlerts` array (10 rules).
   - In `scripts/ops/run-capacity-alerting-drill.sh`, update rule count comment and stdout message from `9 rules` / `9/9 rules` to `10 rules` / `10/10 rules`.
4. **Focused test suite in `scripts/ops/verify-alert-rules.spec.js`.**
   - Update tests verifying all 10 required alert rules are present.
   - Add focused test asserting that `PostgresDown` rejects changed signal, duration, or severity.
   - Add focused test asserting that `PostgresDown` fires when `pgUp === 0` and clears at `1`.
5. **Incident response runbook & documentation.**
   - In `docs/launch-checklist.md`, update §2 on-call team table and §3.5 category 5 to reference 10 Prometheus alerts. Add full §5 runbook for `PostgresDown (critical)` with PromQL, triage steps (`docker compose ps postgres`, logs, socket check `pg_isready`, disk usage `df -h`, exporter logs), containment actions (container restart, check disk, verify volume integrity; if corrupted, engage disaster recovery restore drill per §6; escalate to database administrator / rollback authority after 5m), and clearing condition (`pg_up{job="acres-postgres"} == 1` for 5m).
   - Update `docs/operations.md` and `docs/build-plan.md` with a dated prompt 176 record detailing the alert rule, PromQL expression, threshold rationale, and closure of the PostgreSQL server availability alerting gap. Operator capacity baseline and launch sign-off remain open.

## Verification and execution sequence

1. Record `BASE_SHA`, `HEAD_SHA`, branch, and clean worktree status.
2. Edit `infra/prometheus/alerts.yml`, `scripts/ops/verify-alert-rules.js`, `scripts/ops/verify-alert-rules.spec.js`, `scripts/ops/check-production-templates.sh`, and `scripts/ops/run-capacity-alerting-drill.sh`.
3. Run `npm run ops:alert-test`, `npm run ops:alert-drill`, and `npm run ops:templates`.
4. Update `docs/launch-checklist.md`, `docs/operations.md`, and `docs/build-plan.md`.
5. Run full operational and build verification: `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
6. Dispatch a Stage 1 reviewer subagent via `requesting-code-review`, evaluate findings with `receiving-code-review`, fix any verified issues, stage approved paths, and commit locally on `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `prometheus-configuration` — alert rule semantics, PromQL syntax, duration, and threshold rationale.
- `postgres-best-practices` — database reachability signals and operational failure modes.
- `javascript-testing-patterns` — alert validator unit tests, negative mutation assertions, and simulation tests.
- `deployment-pipeline-design` — production service lifecycle, datastore probes, and promotion gating.
- `requesting-code-review` — Stage 1 code review dispatch.
- `receiving-code-review` — evaluate and verify review feedback.
- `caveman-commit` — required local commit message.
