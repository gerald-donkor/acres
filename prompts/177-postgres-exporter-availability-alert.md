# 177 — postgres exporter availability alert

## Scope and why this is next

The committed baseline is `4e237c9` on `main`; the worktree is clean when this prompt was prepared. This is a bounded Phase 12 operational alerting step under `docs/build-plan.md` §13, §21, and `docs/launch-checklist.md` §3.5 & §5. Prompt 66 added the critical `AcresApiDown` alert (`up{job="acres-api"} == 0` for 1m), prompt 175 added the critical `AcresWorkerDown` alert (`up{job="acres-worker"} == 0` for 1m), and prompt 176 added the critical `PostgresDown` alert (`pg_up{job="acres-postgres"} == 0` for 1m).

However, while `PostgresDown` monitors database connection reachability via the exporter (`pg_up`), `pg_up` is only evaluated when `postgres-exporter` is running and answering HTTP scrapes. If `postgres-exporter` crashes, runs out of memory, halts, or encounters network isolation, Prometheus scrapes fail and set `up{job="acres-postgres"} == 0`. Because the exporter is down, no new `pg_up` metrics are emitted, so `PostgresDown` (`pg_up == 0`) does NOT fire.

As explicitly documented in `docs/launch-checklist.md` §3.5 ("Exercise exporter-down and database/authentication-failure cases separately") and `docs/operations.md` ("Add failure evidence for exporter down and DB scrape failure (`up` and exporter success metric have different meanings)"), an exporter failure causes a total telemetry outage across database connections, lock waits, transaction ages, and scrape errors without alerting operators, violating the `telemetry-self-health` requirement in `docs/build-plan.md` §13.

Implement the `PostgresExporterDown` alert rule in `infra/prometheus/alerts.yml` (`up{job="acres-postgres"} == 0` for 1m, warning), expand alert rule verification and simulation suites from 10 to 11 rules, add the incident response runbook in `docs/launch-checklist.md` §5, and document the resolution in `docs/operations.md` and `docs/build-plan.md`.

## References and verified baseline

- Re-read `AGENTS.md` §§2, 4–7, 10, `docs/build-plan.md` §§13, 14, 21, `docs/operations.md` (Topology & Telemetry, Prometheus Metrics, prompt 170 and 176 records), `docs/launch-checklist.md` §§2, 3.5, and 5, `docs/backend.md`, `docs/security.md` (TM-16, TM-20), and `docs/skills.md`.
- Inspect `infra/prometheus/alerts.yml`, `infra/prometheus/prometheus.yml`, `scripts/ops/verify-alert-rules.js`, `scripts/ops/verify-alert-rules.spec.js`, `scripts/ops/check-production-templates.sh`, and `scripts/ops/run-capacity-alerting-drill.sh`.
- Prometheus scrapes `postgres-exporter` every 30 seconds at `postgres-exporter:9187/metrics` under `job="acres-postgres"`. When the exporter process is reachable and answering HTTP scrapes, `up{job="acres-postgres"} == 1`. When the exporter container is stopped, crashed, or unreachable, `up{job="acres-postgres"} == 0`.
- The ten existing rules (`AcresApiDown`, `AcresWorkerDown`, `PostgresDown`, `HighHttp5xxRate`, `P95LatencyThresholdExceeded`, `High429Rate`, `QueueDeadLettersDetected`, `OutboxDeliveryLag`, `HighHttpConcurrency`, `DatabaseConnectionPoolSaturation`) remain intact; `PostgresExporterDown` becomes the eleventh required alert.

## Implementation contract

1. **Prometheus alert rule in `infra/prometheus/alerts.yml`.**
   Add the eleventh alert rule to `acres_service_alerts` alongside `PostgresDown`:
   ```yaml
         - alert: PostgresExporterDown
           expr: up{job="acres-postgres"} == 0
           for: 1m
           labels:
             severity: warning
           annotations:
             summary: PostgreSQL metrics exporter is down
             description: The postgres-exporter process at postgres-exporter:9187 has been unreachable for more than 1 minute, disabling PostgreSQL metrics collection.
   ```
2. **Alert rule validator & simulation in `scripts/ops/verify-alert-rules.js`.**
   - Add `'PostgresExporterDown'` to `REQUIRED_ALERTS` (expanding from 10 to 11 rules).
   - Add simulation definition for `PostgresExporterDown`:
     ```javascript
     PostgresExporterDown: {
       evaluate: (data) => data.exporterUp === 0,
       firingSample: { exporterUp: 0 },
       clearedSample: { exporterUp: 1 },
       thresholdDescription: 'up{job="acres-postgres"} == 0',
     },
     ```
   - Update job scoping logic so that both `'PostgresDown'` and `'PostgresExporterDown'` expect `job="acres-postgres"`, `'QueueDeadLettersDetected'` and `'AcresWorkerDown'` expect `job="acres-worker"`, and API rules expect `job="acres-api"`:
     ```javascript
     const expectedJob = (requiredAlert === 'PostgresDown' || requiredAlert === 'PostgresExporterDown')
       ? 'acres-postgres'
       : (requiredAlert === 'QueueDeadLettersDetected' || requiredAlert === 'AcresWorkerDown')
       ? 'acres-worker'
       : 'acres-api';
     ```
   - In rule verification loop, assert that `PostgresExporterDown` specifies exact expression `up{job="acres-postgres"} == 0`, `for: 1m`, and `severity: warning`.
3. **Template check & drill runner updates.**
   - In `scripts/ops/check-production-templates.sh`, add `'PostgresExporterDown'` to `requiredAlerts` array (11 rules).
   - In `scripts/ops/run-capacity-alerting-drill.sh`, update rule count comment and stdout message from `10 rules` / `10/10 rules` to `11 rules` / `11/11 rules`.
4. **Focused test suite in `scripts/ops/verify-alert-rules.spec.js`.**
   - Update tests verifying all 11 required alert rules are present.
   - Add focused test asserting that `PostgresExporterDown` rejects changed signal, duration, or severity.
   - Add focused test asserting that `PostgresExporterDown` fires when `exporterUp === 0` and clears at `1`.
5. **Incident response runbook & documentation.**
   - In `docs/launch-checklist.md`, update §2 on-call team table and §3.5 category 5 to reference 11 Prometheus alerts. Add full §5 runbook for `PostgresExporterDown (warning)` with PromQL, triage steps (`docker compose ps postgres-exporter`, logs, container resource limits, secret file mount `/run/secrets/acres_monitor_password`), containment actions (container restart; if recurring crash, check secret file permissions and network connectivity; note that production DB/API traffic continues serving; escalate to on-call SRE after 15m), and clearing condition (`up{job="acres-postgres"} == 1` for 5m).
   - Update `docs/operations.md` and `docs/build-plan.md` with a dated prompt 177 record detailing the alert rule, PromQL expression, threshold rationale, and closure of the exporter availability and telemetry-self-health alerting gap. Operator capacity baseline and launch sign-off remain open.

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
