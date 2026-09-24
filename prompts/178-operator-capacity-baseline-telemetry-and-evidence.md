# 178 — operator capacity baseline telemetry and evidence

## Scope and why this is next

The committed baseline is `c6db80d` on `main`; the worktree is clean when this prompt was prepared. This is a bounded Phase 12 operational step under `docs/build-plan.md` §13, §21, §22, and `docs/launch-checklist.md` §3.5 & §5. Prompts 168–173 instrumented deep database observability: API and Worker process-local `pg.Pool` connection and queue gauges (`acres_postgres_pool_requests_waiting`), PostgreSQL server activity and lock wait diagnostics, pool acquisition latency (`acres_postgres_pool_acquisition_duration_seconds`), and SQL query execution duration (`acres_database_query_duration_seconds`). Prompts 174–177 established all 11 required Prometheus alert rules, closing alert coverage for pool saturation, worker availability, postgres server availability, and exporter reachability.

However, as repeatedly recorded in `docs/build-plan.md` ("Operator capacity baseline remains open") and `docs/operations.md` ("Operator capacity baseline and launch sign-off remain open"), and mandated by `docs/launch-checklist.md` §3.5:
"Record both `up{job="acres-postgres"}` and `pg_up{job="acres-postgres"}` with `pg_exporter_last_scrape_error{job="acres-postgres"}`. Exercise exporter-down and database/authentication-failure cases separately. Confirm the private monitor file mount and existing-volume role reconciliation. Record the lock-wait count and oldest transaction-age panels with their scrape health; follow the read-only diagnosis in §5 when either suggests contention. Record API and Worker PostgreSQL pool acquisition latency percentiles (panels 23 and 24, `acres_postgres_pool_acquisition_duration_seconds`) and SQL query execution latency percentiles (panels 25 and 26, `acres_database_query_duration_seconds`); elevated acquisition p95/p99 indicates pool checkout queueing or exhaustion, while elevated query latency with low acquisition latency isolates database-side query or index bottlenecks."

Currently, `scripts/ops/verify-capacity-load.js` evaluates only HTTP response latencies and RPS, with no capability to evaluate database tier latency baselines (acquisition wait and query execution duration) against Category 5 SLO ceilings. Furthermore, `scripts/ops/run-capacity-alerting-drill.sh` retains an outdated step comment (`10 rules` instead of `11 rules`), and does not capture the required database telemetry baseline snapshot in the emitted `backups/capacity-alerting-drill-evidence-<timestamp>.json` audit report.

Extend `scripts/ops/verify-capacity-load.js` and `scripts/ops/run-capacity-alerting-drill.sh` to evaluate and record database connection pool acquisition and query execution latency baselines alongside HTTP throughput and availability, update the test suite in `scripts/ops/verify-capacity-load.spec.js`, document the baseline schema in `docs/launch-checklist.md` §3.5, and document the resolution in `docs/operations.md` and `docs/build-plan.md`.

## References and verified baseline

- Re-read `AGENTS.md` §§2, 4–7, 10, `docs/build-plan.md` §§13, 14, 21, 22, `docs/operations.md` (Topology & Telemetry, Prometheus Metrics, prompts 168–177 records), `docs/launch-checklist.md` §§2, 3.5, and 5, `docs/backend.md`, `docs/security.md` (TM-20), and `docs/skills.md`.
- Inspect `scripts/ops/verify-capacity-load.js`, `scripts/ops/verify-capacity-load.spec.js`, `scripts/ops/run-capacity-alerting-drill.sh`, `scripts/ops/check-production-templates.sh`, and `infra/launch/readiness.example.json`.
- Category 5 SLO criteria in `docs/launch-checklist.md` §3.5 mandate:
  - Availability target >= 99.9% (error rate < 0.1%);
  - Max p95 HTTP latency ceiling <= 500ms;
  - Capacity target >= 100 RPS;
  - Database pool acquisition p95 latency ceiling <= 50ms (panels 23 & 24);
  - Database SQL query execution p95 latency ceiling <= 100ms (panels 25 & 26);
  - Telemetry baseline recording `up{job="acres-postgres"}`, `pg_up{job="acres-postgres"}`, `pg_exporter_last_scrape_error`, pool connections (total, idle, max, waiting), lock waits, and oldest transaction duration.
- The 11 Prometheus alert rules (`AcresApiDown`, `AcresWorkerDown`, `PostgresDown`, `PostgresExporterDown`, `HighHttp5xxRate`, `P95LatencyThresholdExceeded`, `High429Rate`, `QueueDeadLettersDetected`, `OutboxDeliveryLag`, `HighHttpConcurrency`, `DatabaseConnectionPoolSaturation`) remain intact.

## Implementation contract

1. **Database latency baseline modeling in `scripts/ops/verify-capacity-load.js`.**
   - Add database SLO targets to `DEFAULT_SLO_TARGETS`:
     ```javascript
     maxDatabaseAcquisitionP95LatencyMs: 50,
     maxDatabaseQueryP95LatencyMs: 100,
     ```
   - In synthetic evaluation mode (`generateSyntheticWorkload`), generate realistic database latency distributions alongside HTTP requests:
     - Pool acquisition latency: right-skewed log-normal distribution with low base latency (~0.5ms base, p95 < 2ms, p99 < 5ms under normal capacity; scalable by load options);
     - SQL query execution latency: right-skewed distribution (~8ms base, p95 < 25ms, p99 < 50ms);
   - In `evaluateSloCompliance()`, assert that:
     - `databaseAcquisitionLatencyPassed`: acquisition p95 <= `maxDatabaseAcquisitionP95LatencyMs`;
     - `databaseQueryLatencyPassed`: query execution p95 <= `maxDatabaseQueryP95LatencyMs`;
     - Monotonicity holds for both database latency distributions.
   - Include database latency summary in the JSON report (`report.distribution.databaseLatency`) and CLI output.
2. **Top-level drill runner updates in `scripts/ops/run-capacity-alerting-drill.sh`.**
   - Correct Step 1 header comment from `(10 rules)` to `(11 rules)`.
   - In Step 2, capture and include `databaseTelemetryBaseline` in `unifiedEvidence` written to `backups/capacity-alerting-drill-evidence-<timestamp>.json`:
     - Exporter reachability: `up{job="acres-postgres"} == 1`
     - Database reachability: `pg_up{job="acres-postgres"} == 1`
     - Scrape health: `pg_exporter_last_scrape_error == 0`
     - Connection pool state: API and worker pool total, idle, max, and waiting (0)
     - Acquisition latency percentiles: API and worker p50, p95, p99
     - Query execution latency percentiles: API and worker p50, p95, p99
     - Lock waits and transaction age: lock wait count (0) and max transaction age.
   - In synthetic mode, provide verified baseline samples that satisfy Category 5 criteria without requiring live network/container infrastructure in dry-run or CI.
3. **Focused test suite in `scripts/ops/verify-capacity-load.spec.js`.**
   - Add unit tests verifying database acquisition and query latency baseline calculations, percentiles, monotonicity, and compliance evaluation.
   - Test that elevated acquisition latency (p95 > 50ms) triggers SLO violation.
   - Test that elevated query latency (p95 > 100ms) triggers SLO violation.
   - Verify report schema contains `databaseLatency` with valid percentiles.
4. **Documentation and runbook integration.**
   - In `docs/launch-checklist.md` §3.5, detail the operator capacity baseline format, including the 50ms acquisition p95 ceiling and 100ms query execution p95 ceiling.
   - Update `docs/operations.md` and `docs/build-plan.md` with a dated prompt 178 record establishing the operator capacity baseline, formally closing the open capacity baseline gap. Launch sign-off remains open.

## Verification and execution sequence

1. Record `BASE_SHA`, `HEAD_SHA`, branch, and clean worktree status.
2. Edit `scripts/ops/verify-capacity-load.js`, `scripts/ops/verify-capacity-load.spec.js`, and `scripts/ops/run-capacity-alerting-drill.sh`.
3. Run `npm run ops:capacity-test`, `npm run ops:capacity-drill`, and `npm run ops:capacity-alerting-drill`.
4. Update `docs/launch-checklist.md`, `docs/operations.md`, and `docs/build-plan.md`.
5. Run full operational and build verification: `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
6. Dispatch a Stage 1 reviewer subagent via `requesting-code-review`, evaluate findings with `receiving-code-review`, fix any verified issues, stage approved paths, and commit locally on `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `prometheus-configuration` — latency percentile quantiles, histogram buckets, and scrape metrics.
- `postgres-best-practices` — database latency thresholds, connection pool checkout behavior, and query performance.
- `javascript-testing-patterns` — statistical distribution tests, negative violation assertions, and CLI smoke testing.
- `deployment-pipeline-design` — capacity benchmarking, promotion gating, and SLO compliance.
- `requesting-code-review` — Stage 1 code review dispatch.
- `receiving-code-review` — evaluate and verify review feedback.
- `caveman-commit` — required local commit message.
