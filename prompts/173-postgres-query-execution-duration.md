# 173 — expose PostgreSQL query execution duration

## Scope and why this is next

The committed baseline is `5eb440e` on `main`; the worktree was clean when this prompt was prepared. This is a bounded Phase 12 observability step under `docs/build-plan.md` §13. Prompts 168 and 169 added instantaneous API and worker `pg.Pool` connection counts and wait queues (`acres_postgres_pool_requests_waiting`), prompts 170 and 171 added PostgreSQL server connections, activity, lock-wait counts, and transaction age diagnostics, and prompt 172 instrumented connection pool acquisition wait duration (`acres_postgres_pool_acquisition_duration_seconds`). However, `docs/operations.md` explicitly records that "SQL query execution duration instrumentation, operator capacity baseline, and launch sign-off remain open."

While acquisition latency isolates `pg.Pool` checkout backlog and connection starvation, SQL query execution duration measures the elapsed execution time of queries on PostgreSQL itself. Instrument SQL query execution duration on `PrismaService`, observing the existing Prometheus histogram `acres_database_query_duration_seconds` across both API and Worker processes partitioned by low-cardinality operation labels (`select`, `insert`, `update`, `delete`, `begin`, `commit`, `rollback`, `set`, `other`). Expose API and Worker PostgreSQL query execution latency percentiles (p50, p95, p99) in Grafana panels 25 and 26 at row `y: 68`. Do not claim this signal measures application computation or external network roundtrip.

## References and verified baseline

- Re-read `AGENTS.md` §§2, 4–7, 10, `docs/build-plan.md` §§13–14, `docs/operations.md` (Topology & Telemetry and prompt 168–172 records), `docs/launch-checklist.md` §§3.5 and 5, `docs/backend.md`, `docs/security.md` (TM-20), `docs/system-architecture.md` (private observability), and `docs/skills.md`.
- Inspect `server/src/prisma/prisma.service.ts`, `server/src/metrics/metrics.service.ts`, `server/src/worker.ts`, `infra/grafana/dashboards/acres-operations.json`, `scripts/ops/check-production-templates.sh`, and their focused unit and template tests.
- Installed `pg` and `pg-pool` (`node_modules/pg-pool/index.js` and `node_modules/pg/lib/client.js`) implement `client.query(config, values, cb)`. In `@prisma/adapter-pg`, both standalone queries (`PrismaPgAdapter.performIO`) and transaction queries (`PgTransaction.performIO`) execute queries via `this.client.query()`.
- The operator Grafana JSON is not a product comp. Keep existing panels 1–24 intact; place new panels 25 and 26 at row `y: 68`.
- Existing seven alert rules, receiver identities, scrape intervals (30s), exporter configs, and monitor roles remain unchanged.

## Implementation contract

1. **Query execution duration instrumentation in `PrismaService`.**
   In `server/src/prisma/prisma.service.ts`, wrap `client.query` on every `PoolClient` checked out via `pool.connect` (using an idempotent guard `__acresQueryWrapped`) so that both callback and Promise invocations measure elapsed wall-clock time from invocation to completion (query result or error) using `process.hrtime.bigint()`. Provide an `extractQueryOperation(config: unknown): string` helper that extracts the command verb from string or `{ text: string }` query configs and normalizes it to a bounded, low-cardinality set: `'select'`, `'insert'`, `'update'`, `'delete'`, `'begin'`, `'commit'`, `'rollback'`, `'set'`, or `'other'`. Provide an `onQuery(listener: (operation: string, durationSeconds: number) => void): () => void` subscription method that safely notifies subscribers without throwing or interfering with query execution. Ensure zero circular dependency between `PrismaService` and `MetricsService`. If no listener is registered, notification is skipped.
2. **Prometheus histogram wiring in `MetricsService`.**
   In `server/src/metrics/metrics.service.ts`, use the already registered:
   `readonly databaseQueryDurationSeconds: Histogram<'operation'>;`
   named `'acres_database_query_duration_seconds'` with help text `'Duration of database operations in seconds'` and buckets `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5]`.
   When `this.prisma` is present and provides `onQuery`, subscribe via `this.prisma.onQuery((operation, durationSeconds) => { this.databaseQueryDurationSeconds.labels({ operation }).observe(durationSeconds); })`, and unsubscribe on `onModuleDestroy()`. Because both API and Worker processes instantiate `MetricsService` and `PrismaService`, API scrapes (`job="acres-api"`) and Worker scrapes (`job="acres-worker"`) both expose this histogram with their respective job labels.
3. **Operator Grafana panels.**
   Add panels 25 and 26 to `infra/grafana/dashboards/acres-operations.json`:
   - Panel 25: "API PostgreSQL Query Execution Latency" at `gridPos: { x: 0, y: 68, w: 12, h: 8 }`, type `timeseries`, unit `s`, `noValue: "No data"`, with p50 (`0.50`), p95 (`0.95`), and p99 (`0.99`) `histogram_quantile` targets scoped to `job="acres-api"` using `acres_database_query_duration_seconds_bucket`.
   - Panel 26: "Worker PostgreSQL Query Execution Latency" at `gridPos: { x: 12, y: 68, w: 12, h: 8 }`, type `timeseries`, unit `s`, `noValue: "No data"`, with p50 (`0.50`), p95 (`0.95`), and p99 (`0.99`) `histogram_quantile` targets scoped to `job="acres-worker"` using `acres_database_query_duration_seconds_bucket`.
4. **Template invariants and focused testing.**
   Update `scripts/ops/check-production-templates.sh` to include panel 26 in the worker-scoped panel list (`[4, 8, 11, 12, 13, 24, 26]`) while panel 25 defaults to `acres-api`. Assert that panels 25 and 26 preserve absent data (`noValue: "No data"`, no fallback `vector(0)`), use unit `s`, and reference `acres_database_query_duration_seconds_bucket`. Add focused unit tests in `server/src/prisma/prisma.service.spec.ts` and `server/src/metrics/metrics.service.spec.ts` verifying listener registration, callback and promise timing observation, operation extraction, and error handling.
5. **Documentation and runbook integration.**
   Update `docs/operations.md` with a dated prompt 173 record detailing the query execution duration histogram metric, operation label normalization, panel queries, and observed behavior. Update `docs/launch-checklist.md` §5 and incident triage runbooks to instruct operators to correlate query execution duration with pool acquisition latency and HTTP latency: high query duration with low acquisition latency isolates performance bottlenecks to SQL execution and database index/scan efficiency rather than pool checkout starvation.

## Behavior, failure cases, and limits

- Query execution duration measures the time taken by PostgreSQL to execute a SQL statement and return results over the connection. It does not measure connection acquisition wait time, Node.js HTTP serialization, or network transit to the end user.
- If a query fails or errors (e.g. constraint violation, syntax error, statement timeout), the elapsed duration up to the failure is still observed before propagating the error.
- Zero customer routes, Next/Nest business routes, database migrations, package dependencies, or alert rule additions are included. Launch sign-off remains open.

## Verification and execution sequence

1. On approval, record `BASE_SHA`, `HEAD_SHA`, branch, and clean worktree status.
2. Implement client query wrapping in `PrismaService`, query listener subscription in `MetricsService`, panels in `acres-operations.json`, and template validation in `check-production-templates.sh`.
3. Add focused unit tests in `prisma.service.spec.ts` and `metrics.service.spec.ts`. Run `npm test --workspace=@acres/server -- src/prisma/prisma.service.spec.ts src/metrics/metrics.service.spec.ts`.
4. Run `npm run ops:templates`, `npm run ops:alert-test`, `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
5. Dispatch a Stage 1 reviewer subagent via `requesting-code-review`, evaluate findings with `receiving-code-review`, fix any verified issues, update docs, stage approved paths, and commit locally on `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `prometheus-configuration` — histogram metric semantics, operation label cardinality, and scrape exposition.
- `grafana-dashboards` — operator panel layout, percentile quantiles, and units.
- `postgres-best-practices` — database query execution and driver wrapping semantics.
- `javascript-testing-patterns` — focused unit tests for async query execution and operation extraction.
- `requesting-code-review` — Stage 1 code review dispatch.
- `receiving-code-review` — evaluate and verify review feedback.
- `caveman-commit` — required local commit message.
