# 172 — expose PostgreSQL pool acquisition wait duration

## Scope and why this is next

The committed baseline is `f3f2798` on `main`; the worktree was clean when this prompt was prepared. This is a bounded Phase 12 observability step under `docs/build-plan.md` §13. Prompts 168 and 169 added instantaneous API and worker `pg.Pool` connection counts and acquisition wait queues (`acres_postgres_pool_requests_waiting`), while prompts 170 and 171 added PostgreSQL server connections, activity, lock-wait counts, and transaction age diagnostics. However, `docs/operations.md` explicitly documents that instantaneous waiting request counts are point-in-time 30-second samples that can miss transient acquisition spikes, and notes that "acquisition wait duration" remains an open telemetry gap.

Instrument the connection pool acquisition wait duration for both API and Worker processes, recording a Prometheus histogram of the time (in seconds) spent checking out a connection from `pg.Pool` across both callback and promise-based acquisitions. Expose API and Worker pool acquisition latency percentiles (p50, p95, p99) in Grafana panels 23 and 24. Do not claim this signal measures SQL execution time, lock wait duration, network roundtrip, or server-wide saturation.

## References and verified baseline

- Re-read `AGENTS.md` §§2, 4–7, 10, `docs/build-plan.md` §§13–14, `docs/operations.md` (Topology & Telemetry and prompt 168–171 records), `docs/launch-checklist.md` §§3.5 and 5, `docs/backend.md`, `docs/security.md` (TM-20), `docs/system-architecture.md` (private observability), and `docs/skills.md`.
- Inspect `server/src/prisma/prisma.service.ts`, `server/src/metrics/metrics.service.ts`, `server/src/worker.ts`, `infra/grafana/dashboards/acres-operations.json`, `scripts/ops/check-production-templates.sh`, and their focused unit and template tests.
- Installed `pg` and `pg-pool` (`node_modules/pg-pool/index.js`) implement `connect(cb?)` returning either a callback or Promise. Individual queries via `pool.query()` internally call `this.connect()`, and transactions via `PrismaPgAdapter.startTransaction()` call `this.client.connect()`.
- The operator Grafana JSON is not a product comp. Keep existing panels 1–22 intact; place new panels 23 and 24 at row `y: 60`.
- Existing seven alert rules, receiver identities, scrape intervals (30s), exporter configs, and monitor roles remain unchanged.

## Implementation contract

1. **Pool acquisition duration instrumentation in `PrismaService`.**
   In `server/src/prisma/prisma.service.ts`, wrap `this.pool.connect` so that both callback and Promise invocations measure elapsed wall-clock time from invocation to completion (client checkout or error/timeout) using `process.hrtime.bigint()`. Provide an `onAcquisition(listener: (durationSeconds: number) => void)` registration method (or multiple listeners) that safely notifies subscribers without throwing or interfering with connection checkout. Ensure zero circular dependency between `PrismaService` and `MetricsService`. If no listener is registered, elapsed time calculation and notification is skipped or a no-op.
2. **Prometheus histogram in `MetricsService`.**
   In `server/src/metrics/metrics.service.ts`, add:
   `readonly postgresPoolAcquisitionDurationSeconds: Histogram<string>;`
   named `'acres_postgres_pool_acquisition_duration_seconds'` with help text `'Duration of PostgreSQL connection pool acquisition in seconds'` and bounded duration buckets:
   `[0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]`.
   When `this.prisma` is present, subscribe to `this.prisma.onAcquisition` to record each duration. Because both API and Worker processes instantiate `MetricsService` and `PrismaService`, API scrapes (`job="acres-api"`) and Worker scrapes (`job="acres-worker"`) both expose this histogram with their respective job labels.
3. **Operator Grafana panels.**
   Add panels 23 and 24 to `infra/grafana/dashboards/acres-operations.json`:
   - Panel 23: "API PostgreSQL Pool Acquisition Latency" at `gridPos: { x: 0, y: 60, w: 12, h: 8 }`, type `timeseries`, unit `s`, `noValue: "No data"`, with p50 (`0.50`), p95 (`0.95`), and p99 (`0.99`) `histogram_quantile` targets scoped to `job="acres-api"`.
   - Panel 24: "Worker PostgreSQL Pool Acquisition Latency" at `gridPos: { x: 12, y: 60, w: 12, h: 8 }`, type `timeseries`, unit `s`, `noValue: "No data"`, with p50 (`0.50`), p95 (`0.95`), and p99 (`0.99`) `histogram_quantile` targets scoped to `job="acres-worker"`.
4. **Template invariants and focused testing.**
   Update `scripts/ops/check-production-templates.sh` to include panel 24 in the worker-scoped panel list (`[4, 8, 11, 12, 13, 24]`) while panel 23 defaults to `acres-api`. Add focused unit tests in `server/src/prisma/prisma.service.spec.ts` and `server/src/metrics/metrics.service.spec.ts` verifying listener registration, callback and promise timing observation, and error/timeout recording. Add dashboard validation for panels 23 and 24.
5. **Documentation and runbook integration.**
   Update `docs/operations.md` with a dated prompt 172 record detailing the histogram metric, buckets, panel queries, and observed behavior. Update `docs/launch-checklist.md` §5 and incident triage runbooks to instruct operators to correlate pool acquisition latency with HTTP latency and active requests: elevated acquisition latency indicates connection pool saturation or checkout contention, distinguishing pool starvation from slow database query execution.

## Behavior, failure cases, and limits

- Connection acquisition duration measures the time spent acquiring a client from `pg.Pool`, including waiting in the pending queue when all connections are checked out. It does not measure the time taken to execute SQL queries on the acquired connection.
- If a connection attempt times out or fails (e.g. database unreachable), the elapsed duration up to failure is still observed before propagating the error.
- Zero customer routes, Next/Nest business routes, database migrations, package dependencies, or alert rule additions are included. Launch sign-off remains open.

## Verification and execution sequence

1. On approval, record `BASE_SHA`, `HEAD_SHA`, branch, and clean worktree status.
2. Implement pool wrapping in `PrismaService`, histogram in `MetricsService`, panels in `acres-operations.json`, and template validation in `check-production-templates.sh`.
3. Add focused unit tests in `prisma.service.spec.ts` and `metrics.service.spec.ts`. Run `npm test --workspace=@acres/server -- src/prisma/prisma.service.spec.ts src/metrics/metrics.service.spec.ts`.
4. Run `npm run ops:templates`, `npm run ops:alert-test`, `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
5. Dispatch a Stage 1 reviewer subagent via `requesting-code-review`, evaluate findings with `receiving-code-review`, fix any verified issues, update docs, stage approved paths, and commit locally on `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `prometheus-configuration` — histogram metric semantics, bucket sizing, and scrape exposition.
- `grafana-dashboards` — operator panel layout, percentile quantiles, and units.
- `postgres-best-practices` — connection pool acquisition semantics and driver behavior.
- `javascript-testing-patterns` — focused unit tests for async callback and promise wrapping.
- `requesting-code-review` — Stage 1 code review dispatch.
- `receiving-code-review` — evaluate and verify review feedback.
- `caveman-commit` — required local commit message.
