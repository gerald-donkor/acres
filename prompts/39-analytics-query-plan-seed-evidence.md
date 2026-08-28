# 39 - analytics query-plan seed evidence

## Scope, and why it is next

The committed repository is on `main` at `d4d5cf5` (`feat(reports): implement
report review workflow`). `docs/reports.md` records the report review handoff
as implemented, including `POST /api/v1/reports/:reportId/revisions/:revisionId/submit-review`
and the authenticated UI state.

The next ordered top-level target in `docs/build-plan.md` remains Phase 11,
optional local AI, but Phase 11 is explicitly blocked on a separate
user-approved model, license, quality threshold, and operating-profile decision.
No such decision exists. Do not start Phase 11 and do not add AI packages,
schemas, prompts, model adapters, generation metadata, evaluation fixtures, or
AI UI.

The next dependency-safe product gap is analytics and dashboard query-plan
evidence under a deterministic seeded load. `docs/analytics.md` and
`docs/dashboards.md` both record that representative indexes exist, but
meaningful `EXPLAIN (ANALYZE, BUFFERS)` timings were not captured because the
tables had no product-shaped volume. Build a deterministic, non-production seed
and plan-check harness that can populate the `acres_test` database with enough
analytics rows to make the existing Phase 8/9 read paths measurable, capture
bounded JSON query plans, and fail clearly if a critical read path regresses to
an unacceptable scan or timeout.

This is a Phase 8/9 hardening slice. It must not change analytics semantics,
dashboard UX, report/export behavior, ingestion parser rules, launch-readiness
status, public sharing, collaboration, AI posture, retention policy, or
operator-owned SLO/capacity values. Any threshold used here is a local regression
guard for this harness, not a customer SLO.

## Reference material read while preparing this prompt

Repository and workflow authority:

- `AGENTS.md` §§2, 2.1, phase-control commands, §§5-10: prompt-first workflow,
  phase resolution, skill loading, verification, review, documentation, commit
  rules, product constraints, and no-fabrication rules.
- `docs/build-plan.md` §§1, 9-14: phase execution rules, Phase 8 analytics
  target, Phase 9 dashboards target, Phase 10 reports state, Phase 11 optional
  AI gate, Phase 12 launch-hardening state, and sequence gates.
- `docs/analytics.md`: implemented metric/observation/aggregate/evidence
  schema, mapping semantics, publication idempotency, current REST read routes,
  representative indexes, verification state, and the residual query-plan
  timing gap.
- `docs/dashboards.md`: implemented `dashboardSummary` GraphQL read model,
  saved views, dashboard UI state, query-count/plan expectations, and the
  residual seeded-plan timing gap.
- `docs/backend.md` §§8.1-8.3: real PostgreSQL/PostGIS test environment, role
  model, migration status, runtime privilege hardening, no-seed-data product
  constraint, and Prisma 7/Jest dynamic-import behavior.
- `docs/security.md` §§6-7, 11-12, 15: tenant isolation, analytics/report
  evidence boundaries, residual Phase 6/7 dependency-host gaps, metric label
  redaction rules, and no-AI launch posture.
- `docs/system-architecture.md` §§3-4, 6, 9, 12-13: analytics read model,
  GraphQL/dashboard topology, current/target boundaries, optional AI absence,
  and deployment/operator gates.
- `docs/api/contracts.md`: current analytics REST routes and dashboard GraphQL
  contract surface. This prompt should not require contract changes unless the
  implementation alters public API decorators or schemas.
- `docs/operations.md`: Phase 12D status, telemetry route constraints,
  deterministic no-AI posture, CI/E2E checks, and launch-readiness distinction.

Current implementation inspected:

- `server/src/analytics/analytics.repository.ts`: analytics reads run inside
  `TenantTransactionService.organizationScoped(..., { statementTimeoutMs:
  5000 })`; metrics are ordered by key; observations and aggregates are filtered
  by organization, metric, region, dataset version, dimension hash, and period
  bounds, include metric metadata, and are bounded by `take`.
- `server/src/dashboards/dashboards.service.ts`: `dashboardSummary` composes
  `AnalyticsService.listMetrics`, `AnalyticsService.listAggregates(... limit:
  24)`, and saved views; it should benefit from the same aggregate query plan
  evidence.
- `server/src/dashboards/dashboards.repository.ts`: saved-view reads are scoped
  by organization and use the current `(organizationId, status, updatedAt)` and
  `(organizationId, ownerAccountId, updatedAt)` indexes.
- `server/prisma/schema.prisma`: `MetricDefinition`,
  `MetricObservation`, `ObservationQuality`, `MetricAggregate`, and
  `MetricAggregateLineage` carry the documented composite tenant keys and
  indexes; `MetricAggregate` uniqueness includes `datasetVersionId`.
- `server/test/database.e2e-spec.ts`: real-database tests already use
  `createRealDbTestApp()`, `truncateAll()`, CSRF/auth helpers, and the
  `acres_test` runtime role. The suite is the right place for a small smoke
  assertion, but not for repeatedly inserting a large performance seed on every
  ordinary e2e run.
- `server/test/helpers/real-db-test-app.ts`: `truncateAll()` already covers the
  analytics, dashboard, ingestion, report, upload, and tenant tables.
- `server/test/setup-env.ts`: real DB tests target
  `postgresql://acres_test:acres_test_dev_password@localhost:5432/acres_test`.
- `server/package.json` and root `package.json`: server scripts include
  Prisma, contracts, build, lint, unit, and e2e commands; no dedicated analytics
  plan-check script exists yet.
- `scripts/db/*` and `scripts/ops/*`: existing scripts are plain shell or Node
  scripts with fail-closed checks and explicit operator/development boundaries.

Skills loaded while preparing this prompt:

- `.agents/skills/postgres-best-practices/SKILL.md`
- `.agents/skills/sql-optimization-patterns/SKILL.md`
- `.agents/skills/nestjs-best-practices/SKILL.md`
- `.agents/skills/javascript-testing-patterns/SKILL.md`
- `.agents/skills/error-handling-patterns/SKILL.md`
- `.agents/skills/kpi-dashboard-design/SKILL.md`
- `.agents/skills/data-storytelling/SKILL.md`
- `.agents/skills/requesting-code-review/SKILL.md`
- `.agents/skills/receiving-code-review/SKILL.md`
- `.agents/skills/caveman-commit/SKILL.md`

## SKILLS USED

- `postgres-best-practices` - seed product-shaped relational data without
  weakening RLS, ownership, migrations, or runtime-role constraints.
- `sql-optimization-patterns` - capture and evaluate `EXPLAIN (ANALYZE,
  BUFFERS, FORMAT JSON)` plans for the actual analytics/dashboard read paths.
- `nestjs-best-practices` - preserve repository/service boundaries and avoid
  controller or resolver shortcuts if any backend helper changes are needed.
- `javascript-testing-patterns` - add deterministic tests and scripts that are
  stable in CI-like environments and do not make the normal suite slow.
- `error-handling-patterns` - fail clearly on unreachable database, missing
  migrations, missing indexes, bad seed shape, query timeout, or plan regression.
- `kpi-dashboard-design` and `data-storytelling` - keep the seed
  product-shaped enough to exercise regional comparisons, period filters,
  dimensions, quality summaries, and evidence lineage without inventing real
  business claims.
- `requesting-code-review` - dispatch the mandatory reviewer subagent after
  self-verification.
- `receiving-code-review` - verify reviewer feedback against codebase reality
  before applying changes.
- `caveman-commit` - write the final Conventional Commit message.

Conditional skills:

- `api-design-principles` and `openapi-spec-generation` are required only if
  implementation changes public REST/GraphQL contracts. This prompt should not.
- `security-best-practices` and `security-threat-model` are required only if the
  implementation changes tenant/trust boundaries, exposes new user-facing
  data, or alters auth/permission behavior. A local test seed and plan harness
  should not change those boundaries.
- `prometheus-configuration` is required only if metrics labels, route groups,
  alerts, or Prometheus/Grafana artifacts change. They should not change here.
- Frontend, Tailwind, shadcn, accessibility, and Playwright skills are not
  required unless the implementation unexpectedly touches client UI or browser
  journeys. It should not.

## Required verification before implementation

Before writing code, re-read `AGENTS.md`, this prompt, every owning doc listed
above, and every skill named in `SKILLS USED`. Re-check the latest local files;
do not rely on the preparation notes if code has changed.

Verify relevant local APIs before coding:

- Prisma 7 generated client, raw SQL, transaction, and adapter behavior from
  local generated code and existing server tests. Do not hand-write migrations
  or assume Prisma APIs from memory.
- NestJS module/provider/test patterns from the existing analytics,
  dashboards, Prisma, and real database test helpers.
- PostgreSQL plan output using `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` on
  the local `acres_test` database after migrations are current.

Do not create or edit implementation files until this prompt is approved with
`y` / `Y`.

## Target implementation details

### 1. Add a deterministic analytics scale seed

Create a development/test-only seed harness that populates the real
`acres_test` database with synthetic but product-shaped analytics data.

Requirements:

- Keep the seed out of normal production startup and out of normal customer
  data flows. Do not add product-looking default seed data to the app.
- Use deterministic IDs, labels, periods, dimension hashes, and numeric values
  so repeated runs are stable and idempotent after cleanup.
- Seed at least two organizations so RLS and tenant filters remain exercised.
- For the primary measured organization, create enough rows to make plans
  meaningful without making local runs excessive:
  - multiple regions;
  - multiple metric definitions;
  - multiple dataset versions;
  - multiple periods;
  - at least one non-empty dimension hash path;
  - enough observations, aggregates, and lineage rows to avoid trivial empty or
    single-page plans.
- Use neutral synthetic names such as `Load Test Region 001` and
  `synthetic_metric_01`; do not invent real regional intelligence.
- Prefer batched `createMany` / raw parameterized inserts where appropriate,
  but stay inside the existing test role permissions and RLS/tenant setup.
- Avoid `TRUNCATE` outside the test database helper context. The harness may
  delete its own deterministic seed rows by organization ID/name prefix.
- Print a concise summary of row counts and selected IDs needed by the plan
  checks.

### 2. Add a plan-check script for real query paths

Add a script under an appropriate existing location, likely `scripts/` or
`server/test/`, plus npm scripts that make it explicit this is a database-backed
check.

The script must:

- Refuse to run unless `NODE_ENV=test` or an explicit `ACRES_ALLOW_TEST_SEED=1`
  style flag is present, and the database name or connection string clearly
  targets `acres_test`.
- Verify the migration chain is applied before seeding/checking. If
  `_prisma_migrations` cannot be read by the runtime role, use the existing
  migrator-status script path or provide a clear instruction rather than
  granting broader runtime privileges.
- Seed or refresh the deterministic dataset.
- Run the actual high-value analytics/dashboard read shapes:
  - active metric list by organization/status/key;
  - aggregate list filtered by metric, region, dataset version, dimension hash,
    and period window;
  - observation list with the same filter shape;
  - aggregate evidence/lineage lookup by aggregate ID;
  - saved dashboard view listing if seeded saved views are added;
  - optionally the GraphQL `dashboardSummary` service path if it can be
    measured without duplicating controller-level e2e setup.
- Capture `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for each SQL shape. When
  Prisma-generated SQL cannot be captured cleanly, write equivalent
  parameterized SQL that matches the repository filters and ordering exactly,
  and state the limitation in docs.
- Fail on query errors, statement timeout, missing seed rows, or clearly
  unacceptable plans. At minimum, reject unbounded full table scans on the large
  analytics tables for the filtered read paths when the filter includes
  `organizationId` plus the selective dimensions the current repository uses.
- Keep thresholds conservative and local. Example thresholds may include max
  elapsed milliseconds and max rows removed/scanned, but they must be labelled
  as regression guards, not product SLOs.
- Redact raw connection strings, passwords, session values, organization IDs
  where practical, and all row-level business values from output.
- Emit a small machine-readable artifact, for example JSON under an ignored or
  explicitly committed evidence path, only if the docs justify where it belongs.
  Do not commit volatile local timings unless they are intentionally summarized
  in docs.

### 3. Add focused automated coverage

Add tests that prove the harness and query assumptions are not dead code.

Required coverage:

- Unit-test deterministic seed-shape builders if they are pure helpers.
- Add a small real-database e2e smoke test or script test that verifies:
  - the seed creates expected counts;
  - a second tenant cannot read the primary tenant's analytics rows under
    ordinary organization context;
  - the plan checker reports success against the seeded database.
- Keep ordinary `npm run test:server` tolerable. If the scale seed would make
  every server e2e run slow, put it behind a separate script such as
  `npm run analytics:plans --workspace=@acres/server` and call it explicitly in
  verification rather than inside the default suite.

### 4. Only add indexes or query changes if evidence requires them

Start by measuring the current schema and query shapes. Do not add speculative
indexes.

If the plan evidence proves an existing critical path misses an index or reads
too much data:

- Add the smallest compatible Prisma schema/index change or reviewed SQL
  migration needed to support the measured query.
- Generate the migration through Prisma against a real database; do not
  hand-write Prisma-managed DDL as a shortcut.
- Re-run migration deploy from zero where the local environment permits, or
  record the exact environment blocker if it does not.
- Re-run the plan checker and preserve before/after summarized evidence in
  `docs/analytics.md` and, if dashboard query paths changed, `docs/dashboards.md`.

If the existing indexes are sufficient, do not change the schema. Record the
measured evidence and keep the new harness as a regression tool.

### 5. Update documentation

Update the owning docs in the same implementation commit:

- `docs/analytics.md`: describe the seed shape, measured query paths, local
  regression thresholds, representative plan outcomes, command to re-run, and
  any residual caveats.
- `docs/dashboards.md`: update the residual query-plan gap if dashboard summary
  and saved-view paths now have plan evidence.
- `docs/backend.md`: add any new npm script and database-test harness notes
  where the existing real-DB section records Prisma/Postgres caveats.
- `docs/security.md`: update only if the implementation changes residual
  analytics/security risk language. Do not claim Docker/Garage/Valkey/ClamAV
  dependency-host proof from this work.

Do not update `docs/operations.md` launch readiness as complete. This harness
does not resolve operator-owned SLO, capacity, RPO/RTO, encryption, or live host
drills.

## Acceptance criteria

- A deterministic analytics scale seed can be created/refreshed in
  `acres_test` without production startup behavior or real-looking product
  claims.
- A dedicated plan-check command runs against the seeded real database and
  captures/evaluates JSON plans for analytics aggregate, observation, metric,
  evidence, and dashboard-relevant read shapes.
- The checker fails clearly for unreachable DB, unapplied migrations, missing
  seed, query timeout, or unbounded full scans on the seeded filtered analytics
  read paths.
- Tenant isolation remains enforced in the seeded data and test coverage.
- No public REST/GraphQL contract changes are made unless strictly required and
  regenerated.
- No AI, sharing, collaboration, production readiness, or operator-owned
  decision is introduced.
- Owning docs record the command, evidence, thresholds, and residual limits.
- The final diff is self-reviewed, reviewer-reviewed, and locally committed to
  `main`.

## Required checks

Run and quote real output for:

```bash
npm run prisma:validate --workspace=@acres/server
npm run lint
npm run typecheck
npm run build
npm run test:server
npm run contracts:check
```

Run the new analytics plan-check command and quote its row-count and plan
summary output.

If a migration is added, also run and quote:

```bash
npm run prisma:migrate:deploy --workspace=@acres/server
```

against the local `acres_test` database with the documented migrator role, then
run the runtime-role privilege checks already present in the real database
suite.

If local PostgreSQL is unreachable because of sandbox restrictions, rerun the
database-backed command with the required escalation rather than skipping it. If
the host genuinely lacks the dependency, record the exact command failure and
the dependency needed, but do not claim the plan evidence gap is closed.

Before final completion, run:

```bash
git diff --check
git diff --stat
git status --short
```

Then perform the mandatory two-stage review loop with `requesting-code-review`
and `receiving-code-review`, fix valid findings, re-run affected checks, update
docs if fixes change behavior, and commit locally using `caveman-commit`.
