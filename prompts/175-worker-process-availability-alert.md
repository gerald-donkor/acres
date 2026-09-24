# 175 — worker process availability alert

## Scope and why this is next

The committed baseline is `b92a97c` on `main`; the worktree is clean when this prompt was prepared. This is a bounded Phase 12 operational alerting step under `docs/build-plan.md` §13 and §21. Prompts 168 and 169 exposed and scraped process-local `pg.Pool` connection and queue gauges across API (`acres-api`) and Worker (`acres-worker`) processes, and prompt 174 added the eighth required alert `DatabaseConnectionPoolSaturation` for API connection checkout starvation.

However, while `AcresApiDown` has monitored API HTTP process reachability (`up{job="acres-api"} == 0` for 1m, critical) since prompt 66, the background worker process at `worker:3002` currently has NO availability alert rule. `acres-worker` executes all asynchronous background operations — outbox event publishing, dataset ingestion and file parsing, quarantined upload retention purging, and report export rendering. Prompt 169 explicitly established that a failed pool collector makes `up{job="acres-worker"}` zero, and a crashed or stalled worker container leaves all background queues frozen without paging on-call engineers.

With the private `worker:3002/metrics` HTTP scrape verified across Prometheus and Grafana dashboards, implement the critical `AcresWorkerDown` alert rule in `infra/prometheus/alerts.yml`, expand alert rule verification and simulation suites from 8 to 9 rules, add the incident response runbook in `docs/launch-checklist.md` §5, and document the resolution in `docs/operations.md` and `docs/build-plan.md`.

## References and verified baseline

- Re-read `AGENTS.md` §§2, 4–7, 10, `docs/build-plan.md` §§13, 14, 21, `docs/operations.md` (Topology & Telemetry, Prometheus Metrics, prompt 169 and 174 records), `docs/launch-checklist.md` §§2, 3.5, and 5, `docs/backend.md`, `docs/security.md` (TM-16, TM-20), and `docs/skills.md`.
- Inspect `infra/prometheus/alerts.yml`, `infra/prometheus/prometheus.yml`, `scripts/ops/verify-alert-rules.js`, `scripts/ops/verify-alert-rules.spec.js`, `scripts/ops/check-production-templates.sh`, and `scripts/ops/run-capacity-alerting-drill.sh`.
- Prometheus scrapes `acres-worker` every 30 seconds at `worker:3002/metrics`. When the worker process is running and its collector succeeds, `up{job="acres-worker"} == 1`. When unreachable or failing, `up{job="acres-worker"} == 0`.
- The eight existing rules (`AcresApiDown`, `HighHttp5xxRate`, `P95LatencyThresholdExceeded`, `High429Rate`, `QueueDeadLettersDetected`, `OutboxDeliveryLag`, `HighHttpConcurrency`, `DatabaseConnectionPoolSaturation`) remain intact; `AcresWorkerDown` becomes the ninth required alert.

## Implementation contract

1. **Prometheus alert rule in `infra/prometheus/alerts.yml`.**
   Add the ninth alert rule to `acres_service_alerts` alongside `AcresApiDown`:
   ```yaml
         - alert: AcresWorkerDown
           expr: up{job="acres-worker"} == 0
           for: 1m
           labels:
             severity: critical
           annotations:
             summary: Acres worker instance is down
             description: The Acres background worker process at worker:3002 has been unreachable for more than 1 minute.
   ```
2. **Alert rule validator & simulation in `scripts/ops/verify-alert-rules.js`.**
   - Add `'AcresWorkerDown'` to `REQUIRED_ALERTS` (expanding from 8 to 9 rules).
   - Add simulation definition for `AcresWorkerDown`:
     ```javascript
     AcresWorkerDown: {
       evaluate: (data) => (data.workerUp === 0),
       firingSample: { workerUp: 0 },
       clearedSample: { workerUp: 1 },
       thresholdDescription: 'up{job="acres-worker"} == 0',
     },
     ```
   - Update job scoping logic so that both `'QueueDeadLettersDetected'` and `'AcresWorkerDown'` expect `job="acres-worker"`, while API rules expect `job="acres-api"`:
     ```javascript
     const expectedJob = (requiredAlert === 'QueueDeadLettersDetected' || requiredAlert === 'AcresWorkerDown') ? 'acres-worker' : 'acres-api';
     ```
   - In rule verification loop, assert that `AcresWorkerDown` specifies exact expression `up{job="acres-worker"} == 0`, `for: 1m`, and `severity: critical`.
3. **Template check & drill runner updates.**
   - In `scripts/ops/check-production-templates.sh`, add `'AcresWorkerDown'` to `requiredAlerts` array (9 rules).
   - In `scripts/ops/run-capacity-alerting-drill.sh`, update rule count comment and stdout message from `8 rules` / `8/8 rules` to `9 rules` / `9/9 rules`.
4. **Focused test suite in `scripts/ops/verify-alert-rules.spec.js`.**
   - Update tests verifying all 9 required alert rules are present.
   - Add focused test asserting that `AcresWorkerDown` rejects changed signal, duration, or severity.
   - Add focused test asserting that `AcresWorkerDown` fires when `workerUp === 0` and clears at `1`.
5. **Incident response runbook & documentation.**
   - In `docs/launch-checklist.md`, update §2 on-call team table and §3.5 category 5 to reference 9 Prometheus alerts. Add full §5 runbook for `AcresWorkerDown (critical)` with PromQL, triage steps (`docker compose ps worker`, logs, `worker:3002/health`, queue backlog), containment actions (container restart, rollback on bad image), escalation after 10m, and clearing condition (`up{job="acres-worker"} == 1` for 5m and `/health` 200).
   - Update `docs/operations.md` and `docs/build-plan.md` with a dated prompt 175 record detailing the alert rule, PromQL expression, threshold rationale, and closure of the worker process availability alerting gap. Operator capacity baseline and launch sign-off remain open.

## Verification and execution sequence

1. Record `BASE_SHA`, `HEAD_SHA`, branch, and clean worktree status.
2. Edit `infra/prometheus/alerts.yml`, `scripts/ops/verify-alert-rules.js`, `scripts/ops/verify-alert-rules.spec.js`, `scripts/ops/check-production-templates.sh`, and `scripts/ops/run-capacity-alerting-drill.sh`.
3. Run `npm run ops:alert-test`, `npm run ops:alert-drill`, and `npm run ops:templates`.
4. Update `docs/launch-checklist.md`, `docs/operations.md`, and `docs/build-plan.md`.
5. Run full operational and build verification: `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
6. Dispatch a Stage 1 reviewer subagent via `requesting-code-review`, evaluate findings with `receiving-code-review`, fix any verified issues, stage approved paths, and commit locally on `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `prometheus-configuration` — alert rule semantics, PromQL syntax, duration, and threshold rationale.
- `javascript-testing-patterns` — alert validator unit tests, negative mutation assertions, and simulation tests.
- `deployment-pipeline-design` — production worker service lifecycle, probe semantics, and promotion gating.
- `requesting-code-review` — Stage 1 code review dispatch.
- `receiving-code-review` — evaluate and verify review feedback.
- `caveman-commit` — required local commit message.
