# 159 — run the analytics query-plan gate in CI

## Scope and why this is next

The committed baseline is `3aa731e` on `main`; the worktree was clean before
this prompt was written. The highest existing prompt number was 158. All twelve
ordered phases in `docs/build-plan.md` have implementation records through
Phase 12K, so this is a dependency-safe Phase 8/12 verification follow-up.

The repository already has `npm run analytics:plans`, a deterministic two-tenant
seed, six `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` queries, and regression
guards. `.github/workflows/ci.yml` boots PostGIS, creates and migrates
`acres_test`, hardens runtime privileges, then runs server E2E and
`npm run geography:plans`. It never runs `npm run analytics:plans`. A change
to an analytics query, index, RLS policy, or scale seed can therefore pass the
current CI checks without running the existing analytics plan gate. Add that
gate to the existing `checks` job after the server E2E and geography plan
steps, using the same migrated `acres_test` database and non-owner test role.

Do not describe the older PostgreSQL `42501` failure in `docs/backend.md`
§18 as current: that paragraph records Prompt 49 history. Current
`seedAnalyticsScale()` sets transaction-local `acres.organization_id` for each
organization and `cleanScaleSeed()` sets the worker context. Verify the live
gate on the actual database before changing any seed or RLS code.

## Reference material read

- `AGENTS.md` §§2, 2.1, 4–10 and `docs/build-plan.md` Phase 8 (§9), Phase 12
  (§13), and sequence gates (§14).
- `.github/workflows/ci.yml`: the single `checks` job, pinned actions,
  PostGIS 18-3.6 service, role bootstrap, `acres_test` migrations, runtime
  privilege hardening, server E2E, and geography plan step.
- Root `package.json` (`analytics:plans` delegates to the server workspace)
  and `server/package.json` (`prisma generate && nest build && NODE_ENV=test
  node dist/analytics/seed/check-analytics-plans.js`).
- `server/src/analytics/seed/check-analytics-plans.ts`: test database guard,
  seed call, five `ANALYZE` calls, six query shapes, tenant transaction
  context, `passed` result and nonzero failure exit.
- `server/src/analytics/seed/analytics-scale-seed.ts`: deterministic seed,
  idempotent cleanup, tenant and worker context, both organizations.
- `docs/analytics.md` “Query Plan Evidence and Seed Harness” and
  `docs/operations.md` “CI State”; these own the analytics and CI record.
- `docs/security.md` CI/RLS boundaries; `docs/automation.md` for the
  documented environment and verification procedure.

## Measurements and acceptance evidence

- Reuse the existing six named query paths: `findMetrics`,
  `findAggregates (filtered)`, `findObservations (filtered)`,
  `findAggregateEvidence (lineage)`, `listDashboardViews`, and
  `dashboardSummary (aggregates)`.
- Reuse the existing *local regression* limits in `docs/analytics.md`:
  `maxExecutionTimeMs: 150`, `maxPlanningTimeMs: 50`, and the evaluator's
  filtered-query sequential-scan restrictions. These are existing test
  thresholds, not customer SLOs. Do not raise them or introduce a CI-only
  override without a measured failure and a separately reviewed explanation.
- The CI step must use `DATABASE_URL` pointing to the migrated
  `acres_test` database as `acres_test`, exactly as the geography step does.
  The server script sets `NODE_ENV=test` itself. Do not set
  `ACRES_ALLOW_TEST_SEED=1` or use the migrator/superuser for the plan run.
- Confirm the workflow parses as YAML and that the analytics step follows the
  migration, privilege-hardening, server E2E, and geography steps in the same
  job. Run the actual plan command against a migrated local `acres_test` if the
  dependency is available; quote the six results and exit status. A local
  success proves the command works locally, not that GitHub-hosted timing has
  passed. Record a hosted CI result only if observed; otherwise name it as
  pending.

## Expected impact and implementation

1. Add one named step, `Run analytics query-plan evidence`, to
   `.github/workflows/ci.yml` directly after `Run geography query-plan
   evidence` in the `checks` job. Give it the same
   `DATABASE_URL: postgresql://acres_test:acres_test_dev_password@localhost:5432/acres_test?schema=public`
   value and `run: npm run analytics:plans`. Preserve the existing `contents:
   read` permission, action SHA pins, PostGIS image, DB setup, and Docker job.
   The existing disposable CI password is already present in this workflow;
   introduce no new credential or repository secret.
2. If the real plan command fails, classify the actual cause before editing:
   unavailable database or migrations, seed/RLS defect, query-plan shape,
   timing threshold, or script failure. Fix only a proven defect within this
   gate's dependency path, with a focused test and owning documentation. Do
   not bypass a failure, change production RLS, or silently relax the plan
   evaluator. If the cause cannot be reproduced or safely resolved, report
   it and leave the gate uncommitted rather than presenting a green check.
3. Update `docs/analytics.md` to state that CI runs this six-query gate after
   migrations and to record the actual local and hosted evidence available.
   Update `docs/operations.md` “CI State” to include the new step and its
   failure behavior. Update `docs/backend.md` only if a real current defect
   makes its historical note materially misleading; retain Prompt 49 history.
4. Review the resulting diff and complete the §2.1 reviewer loop before
   committing. Use `caveman-commit` for the local `main` commit. Do not push.

## Failure, security, and compatibility cases

- The plan script must fail CI on missing/unmigrated `acres_test`, failed
  seed/RLS operations, evaluator failures, and rejected query plans. Preserve
  its database URL redaction and do not log credentials or seeded product data.
- The deterministic seed uses synthetic data in the disposable test database;
  no production database or operator dataset is involved. Both tenant contexts
  stay transaction-local. A prior server E2E or geography failure prevents
  the analytics step from running through GitHub Actions' normal step order.
- This is an additive CI gate. No route, schema, migration, API contract,
  query implementation, UI, or production deployment behavior should change.
  Rollback is removal of the one CI step and its documentation if the gate is
  proven unsuitable; do not mask a red gate with `continue-on-error`.

## Non-goals

- No new query shape, index, seed volume, threshold, metric semantic, or SLO.
- No separate database job, matrix, cache, action upgrade, or CI permission
  expansion.
- No change to production RLS or operator-owned launch decisions.
- No UI change. At 375, 800, and 1280 CSS pixels the product is unchanged;
  no visual comp measurement or browser screenshot is required.

## Verification and review

- Parse `.github/workflows/ci.yml` with the installed `js-yaml` and assert
  the `checks.steps` ordering and analytics step environment/command. Treat
  this as structural verification; do not add a test that only mirrors the
  two added YAML fields unless an existing CI workflow test already owns it.
- Run `npm run analytics:plans` with `DATABASE_URL` for migrated local
  `acres_test`; capture exact output and exit status. If PostgreSQL is
  unavailable, follow `docs/backend.md` / `docs/analytics.md` local setup,
  then retry. Do not use an external or production database. If local
  dependency access remains blocked, state precisely what could not be
  verified and preserve the fail-closed CI gate.
- Run `npm run lint`, `npm run typecheck`, `npm run build`,
  `npm run contracts:check`, and `npm run test:server`; quote real outputs.
  Run `npm run geography:plans` as a regression check against the same
  migrated test database when available. Use `git diff --check`, inspect the
  final diff and staged paths, and preserve unrelated work.
- Request review with `requesting-code-review` using the prompt, changed-file
  list, checks, `BASE_SHA=3aa731e`, and current `HEAD_SHA` plus the working
  diff; apply `receiving-code-review` to verify every finding. Re-review after
  any significant pipeline or seed change. Record the final evidence in
  `docs/analytics.md` and `docs/operations.md`, then commit locally.

## SKILLS USED

- `github-actions-templates` — CI workflow structure and least-privilege
  step placement.
- `deployment-pipeline-design` — fail-closed gate ordering within the
  existing checks job.
- `postgres-best-practices` — migrated test database, non-owner role, and
  transaction-local RLS seed context.
- `sql-optimization-patterns` — interpretation of the six `EXPLAIN` plans
  and existing index/scan regression guards.
- `javascript-testing-patterns` — targeted verification if the actual
  runner or seed requires a code fix.
- `nestjs-best-practices` — only if investigation requires changing the
  server's Nest-built plan runner; otherwise no Nest API is changed.
- `requesting-code-review` — Stage 1 review after self-verification.
- `receiving-code-review` — Stage 2 evaluation and fixes.
- `caveman-commit` — required local commit message.
