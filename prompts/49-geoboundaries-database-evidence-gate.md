# 49 - Make geoBoundaries database evidence fail closed

## Scope and why this is next

The committed `main` tip is `e78b307` (`fix(db): mount PostgreSQL 18 root`).
All twelve target phases have committed foundations, so the next work is the
earliest unresolved exit evidence rather than a new feature surface.

Phase 7B (`9cd49a0`, implemented from
`prompts/47-geoboundaries-deep-hierarchy-governance.md`) added reviewed
ADM0-ADM5 hierarchy mechanics, but its required real-PostgreSQL proof did not
land. The repository currently has:

- mocked manifest/normalizer/import-adjacent coverage;
- a real PostGIS geometry spec under `server/src/` that turns every case into a
  successful no-op when PostgreSQL is unavailable;
- a spatial `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` harness that has not been
  run on the dependency-capable PostgreSQL 18/PostGIS 3.6 Compose path and does
  not yet cover the required `(parentId, level)` hierarchy read;
- a CI PostgreSQL service that starts empty, applies the complete migration
  chain, hardens roles, and runs server E2E, but does not run the geography plan
  gate or a real deep-provider import test.

Prompt 48 corrected the local and production-reference PostgreSQL 18 mount
target from `/var/lib/postgresql/data` to `/var/lib/postgresql`, removing the
container-layout blocker that immediately preceded this work. This prompt is
therefore Phase 7C: make controlled, synthetic geoBoundaries/PostGIS database
evidence explicit, fail-closed, repeatable, and CI-enforced. It does not import
live provider data or claim production/provider approval.

Prompt preparation observed on 2026-08-31 that this agent could not access
`/var/run/docker.sock` (`permission denied`) and `pg_isready -h localhost -p
5432` reported `no response`. Those are execution-environment facts, not proof
that the corrected Compose configuration fails. At execution, request narrowly
scoped Docker approval if needed; never report a skipped or unreachable
database as passing evidence.

## Reference material read while preparing this prompt

Re-read all of these before implementation:

- `AGENTS.md`, especially §§2, 2.1, 4-7, 8.2 Phase 7, 9, and 10.
- This approved prompt.
- `docs/build-plan.md` Phase 7 outcome, test matrix, exit gate, and sequence
  gates.
- `docs/ingestion.md`, especially the Phase 7B geoBoundaries boundary,
  PostGIS write/read boundary, verification state, and residual gaps.
- `docs/backend.md`, especially the geoBoundaries operator import,
  PostgreSQL roles/migrations, PostgreSQL 18 Compose data-directory contract,
  test scripts, and real-database verification records.
- `docs/system-architecture.md`, especially the current provider boundary and
  Phase 7 current/deferred state.
- `docs/security.md`, especially the provider acquisition/deep-hierarchy trust
  boundary, TM-07/TM-17 controls, and residual Phase 7 risks.
- `docs/operations.md` only for the corrected local/production PostgreSQL 18
  mount contract and CI/runtime evidence distinction.
- `docs/skills.md` for the locked skill paths and triggers.
- `docker-compose.yml`, `.github/workflows/ci.yml`, root `package.json`, and
  `server/package.json`.
- `scripts/db/bootstrap-roles.sh` and
  `scripts/db/harden-runtime-privileges.sh`.
- `server/prisma/schema.prisma` and the complete ordered directory list under
  `server/prisma/migrations/`; inspect migration SQL relevant to `Region`,
  `RegionSource`, `RegionCode`, `RegionAlias`, `RegionGeometry`, PostGIS,
  hierarchy indexes, and RLS rather than editing or regenerating it.
- `server/test/jest-e2e.json`, `server/test/setup-env.ts`,
  `server/test/helpers/real-db-test-app.ts`, and
  `server/test/database.e2e-spec.ts`.
- `server/src/geography/geoboundaries.types.ts`,
  `geoboundaries-manifest.ts`, `geoboundaries-normalizer.ts`,
  `geoboundaries-import.service.ts`, `postgis-region-geometry.repository.ts`,
  their current specs, and `server/src/geography/geography.module.ts`.
- `server/src/geography/postgis-geometry.integration.spec.ts`; this is the
  current silently-skipping database test that must not remain ambiguous.
- `server/src/geography/seed/geography-scale-seed.ts`, its types/spec, and
  `check-geography-plans.ts`.
- `server/src/analytics/seed/plan-evaluator.ts` for the existing shared plan
  parsing/evaluation contract. Do not duplicate it.

There is no visual surface, reference comp, breakpoint, browser, Next.js,
React, Tailwind, shadcn, or motion work in scope. No design measurement applies.

## SKILLS USED

- `architecture-patterns` - preserve the geography application service,
  PostGIS adapter, and test boundaries without moving domain behavior into the
  test harness or CLI.
- `nestjs-best-practices` - construct and close the Nest/Prisma real-database
  test boundary correctly and keep production module wiring unchanged.
- `postgres-best-practices` - verify clean migration application, role
  separation, transactional rollback, fixture cleanup, hierarchy indexes, and
  PostGIS integrity on PostgreSQL 18.
- `security-best-practices` - keep synthetic provider inputs, SQL execution,
  logs, errors, credentials, and cleanup secure by default; retain tagged or
  otherwise parameterized SQL boundaries.
- `security-threat-model` - reconcile the existing TM-07/TM-17 provider and
  deep-hierarchy controls with the new real-database evidence without claiming
  authority, legal approval, or production readiness.
- `error-handling-patterns` - make missing dependencies, import failures,
  cleanup failures, plan regressions, and transaction rollback produce precise
  nonzero failures instead of swallowed or falsely passing outcomes.
- `javascript-testing-patterns` - implement deterministic Jest integration
  fixtures with explicit setup, assertions, isolation, and cleanup.
- `e2e-testing-patterns` - keep the database evidence independent,
  fail-closed, behavior-based, and aligned with the existing server E2E gate.
- `sql-optimization-patterns` - extend and evaluate real
  `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` evidence for spatial and hierarchy
  access paths without forcing the planner or inventing production SLOs.
- `github-actions-templates` - add the geography database/plan evidence to the
  existing least-privilege, pinned-action CI job without adding deployment or
  secrets scope.
- `requesting-code-review` - dispatch the mandatory independent reviewer after
  all self-verification, with exact SHAs, database evidence, plans, and diff.
- `receiving-code-review` - verify every review finding against the real
  migration/test/plan behavior before changing the implementation.
- `caveman-commit` - generate the required concise Conventional Commit message.

`api-design-principles`, `openapi-spec-generation`, and `playwright` are not
triggered because no route, DTO, OpenAPI/GraphQL artifact, client flow, or
browser surface changes. `deployment-pipeline-design` is not triggered because
the existing CI verification job is extended without adding promotion,
deployment, rollback orchestration, or environments. `secrets-management` is
not triggered because no credential source or secret lifecycle changes; all
test credentials remain the existing local/CI-only values. No frontend skill
applies.

## Required implementation

### 1. Put real geography tests in one explicit fail-closed database suite

1. Add a server E2E spec under `server/test/` (use a precise name such as
   `geography-database.e2e-spec.ts`) so it is selected by the existing
   `server/test/jest-e2e.json` and therefore by `npm run test:server` in CI.
2. Use the existing `server/test/setup-env.ts` test database contract and the
   production `PrismaService`, `GeoBoundariesImportService`, and
   `PostgisRegionGeometryRepository` behavior. Do not introduce an in-memory
   database, mock Prisma transaction, mock PostGIS, or bypass the production
   repository just to obtain a green test.
3. Probe PostgreSQL/PostGIS during suite setup and throw one actionable,
   credential-redacted error when the migrated `acres_test` database is not
   reachable. The suite must not convert unavailable dependencies into passed
   test cases, warnings, empty callbacks, or fabricated skips.
4. Close every Nest application/Prisma client in `afterAll`/`finally`. Cleanup
   must target only fixtures created by this suite and must run even after a
   failed assertion. A cleanup failure must remain visible when it could leave
   integrity-significant fixtures behind; do not swallow it unconditionally.
5. Reconcile `server/src/geography/postgis-geometry.integration.spec.ts` so its
   current `conditionalIt` pattern can no longer make five database cases look
   passed with zero assertions. Prefer moving the real behavior into the
   explicit E2E suite and removing the ambiguous source-tree integration spec.
   If a small source-tree unit test remains, it must be honestly database-free
   and must not be named or documented as real integration evidence.
6. Preserve `npm run test --workspace=@acres/server` as the database-free unit
   suite. Real PostgreSQL evidence belongs to `npm run test:server`, whose
   existing `database.e2e-spec.ts` already fails closed when `acres_test` is
   unreachable.

### 2. Prove deep hierarchy publication through the production transaction

Use deterministic, synthetic normalized layers. Do not call geoBoundaries,
GitHub, `raw.githubusercontent.com`, or any public network service. Do not use a
real country assertion, political boundary, provider artifact, or product
metric as a fixture.

1. Construct at least one synthetic ADM0 -> ADM1 -> ADM2 -> ADM3 chain with:
   - exactly one ADM0 country root;
   - at least two ADM1 parents;
   - multiple ADM2 children assigned across those different ADM1 parents; and
   - at least one ADM3 child assigned to an ADM2 parent.
2. Give every layer explicit, internally consistent `shapeID`, `shapeGroup`,
   `shapeType`, manifest metadata, immediate-parent map, and small valid
   SRID-4326 polygon geometry. Mark deep layers as `explicit-parent-map`; never
   infer parentage in test helpers.
3. Import through `GeoBoundariesImportService.importLayers`, not by inserting
   the expected rows directly. Assert the returned source version/count and
   then query a bounded projection to prove:
   - one immutable `RegionSource` revision;
   - provider identity in `RegionCode.normalized` for every feature;
   - the exact multi-parent adjacency chain by resolved region IDs;
   - one alias and one valid geometry per imported feature; and
   - no raw geometry or unbounded provider metadata in test output/logging.
4. Re-import the identical layers/manifest identity. Assert `unchanged: true`
   only after proving source, region, code, alias, and geometry counts did not
   increase and parent relationships did not change.
5. Attempt a second source revision in which an existing child resolves to a
   different reviewed parent. Assert the stable hierarchy/conflict failure,
   unchanged original parentage, and zero committed rows for the rejected new
   source revision.
6. Attempt a new source revision with an invalid PostGIS geometry after earlier
   valid levels in the same import. Assert that the source, regions, codes,
   aliases, and geometries for that revision all roll back; no partial ADM0 or
   intermediate layer may remain visible.
7. Exercise arbitrary input ordering by shuffling the valid layer array before
   one import and asserting the same normalized hierarchy result. Do not depend
   on manifest/CLI argument order.
8. Use unique, deterministic fixture identity scoped to this suite. Before
   deletion, select fixtures by the exact provider/code-system/source-version
   and captured region IDs. Never truncate global geography in this spec and
   never delete provider data not created by the test.

### 3. Keep direct PostGIS behavior as real evidence

Retain real-database assertions, either in the same E2E file or a second
explicit `*.e2e-spec.ts`, for:

1. valid Polygon, Point, and MultiPolygon persistence with SRID 4326 and
   `isValid=true`;
2. topologically invalid self-intersecting Polygon rejection with no row
   mutation;
3. foreign region/source rejection mapped to the stable public domain error;
4. point-in-region semantics for interior, boundary edge, and exterior points;
5. cleanup scoped to the exact source/region IDs created by the test.

Do not weaken TypeScript prevalidation or PostGIS validation and do not expose
raw geometry in the repository read model merely to simplify assertions.

### 4. Extend the measured plan harness to hierarchy reads

1. Extend the existing geography scale seed and summary types so it creates a
   deterministic hierarchy distribution in addition to PostGIS geometries.
   The fixture must contain multiple parents and enough children/distraction
   rows for a `(parentId, level)` lookup to be selective and meaningfully
   planned. Keep all names visibly synthetic.
2. Keep the existing spatial point-intersection query and add one representative
   bounded hierarchy query shaped as production reads are expected to be:
   filter by an exact `parentId` and `level`, return only required safe columns,
   use deterministic ordering, and apply a finite limit.
3. Run `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` with parameters, parse it
   through the existing shared `plan-evaluator.ts`, and emit a bounded report
   for both query shapes. Do not log fixture geometry, credentials, or an
   unredacted connection string.
4. Assert `RegionGeometry_geometry_gist_idx` participation for the spatial
   lookup and `Region_parentId_level_idx` participation for the hierarchy
   lookup. Do not use `SET enable_seqscan = off`, planner hints, a production
   index change, or a weakened assertion to force a pass.
5. Preserve the existing local-regression timing limits as test guards, not
   customer SLOs. If the planner legitimately selects a sequential scan at the
   current fixture cardinality, measure and increase/selectively reshape only
   the synthetic fixture distribution until the query is representative; do
   not invent a threshold or add an index without evidence.
6. Ensure every seeded source, region, code/alias if used, and geometry is
   removed in `finally`. Cleanup must not delete pre-existing rows with a
   colliding human-readable name.
7. Extend unit coverage for seed summary/counts, hierarchy relationships,
   cleanup targeting, both plan result entries, index expectations, and
   credential redaction. Keep unit tests database-free.

### 5. Make the evidence a durable CI gate

1. In `.github/workflows/ci.yml`, keep all actions pinned to immutable
   40-character SHAs and keep top-level `permissions: contents: read`.
2. After database bootstrap, complete migration deploy to both databases, and
   runtime privilege hardening, run:
   - the full fail-closed `npm run test:server`; and
   - `npm run geography:plans` with the existing `acres_test` runtime URL.
3. Do not add repository secrets, service-account tokens, write permissions,
   deployment steps, network calls to provider APIs, or uploaded plan artifacts.
   The local CI-only passwords already checked into this workflow remain test
   fixtures; do not copy them into production examples or logs.
4. Keep the geography plan step separate and named so a plan/index regression
   is distinguishable from an E2E failure.
5. Do not add the optional live-provider smoke test to CI. Provider availability
   and mutable upstream behavior must not determine repository verification.

### 6. Produce local dependency-capable evidence safely

1. Resolve Docker access at execution time. If the agent still receives a
   socket permission error, request narrowly scoped approval for the exact
   Docker/Compose commands needed. Do not change socket permissions, groups,
   daemon configuration, or use `sudo` as a workaround.
2. Inspect `docker compose ps -a postgres`, the exact
   `acres-postgres-1` logs, and `docker volume inspect acres_acres_pgdata`
   before any state-changing command. Do not delete, reset, or recreate a
   populated or ambiguously owned volume in this prompt.
3. Start only the corrected local PostgreSQL service when safe and wait for
   health. Confirm the mount source/target through expanded Compose or
   container inspection and confirm `pg_isready` accepts connections.
4. Bootstrap the existing local roles idempotently, deploy the committed
   migration chain to `acres` and `acres_test`, and run the existing privilege
   hardening script. Never generate, edit, squash, or mark a migration applied.
5. Prove apply-from-zero without destroying either normal database: create one
   uniquely named temporary verification database owned by the existing
   migrator role, validate its exact `acres_p49_verify_` prefix and ownership,
   apply the committed migration chain, run migration status and bounded schema/
   PostGIS/index assertions, then drop only that exact temporary database in a
   guaranteed cleanup step. If safe creation/drop cannot be verified, report
   the block instead of using `db:reset`, `docker compose down -v`, broad
   `DROP DATABASE`, or volume deletion.
6. Run the full server E2E and geography plan gates against `acres_test` after
   migrations and hardening. Quote the real suite counts and both plan reports.
   A skipped test, missing index, sequential scan on a guarded table,
   unreachable dependency, or cleanup failure is not a pass.
7. Use environment variables for connection URLs/passwords and redact them in
   handoff output. Never enable shell tracing around credentials.

### 7. Reconcile canonical documentation

1. Update `docs/ingestion.md` with the real deep-hierarchy transaction,
   idempotency, conflict, rollback, PostGIS, and two-query plan evidence. Remove
   stale residual statements that deeper hierarchy governance or real
   dependency execution is wholly absent. Keep live provider publication,
   provider authority/legal review, source precedence/refresh, OS-level parser
   sandboxing, and real Garage/Valkey/ClamAV failure drills open.
2. Update `docs/backend.md` with the explicit database E2E ownership, removal of
   the silent source-tree integration skip, fresh temporary-database migration
   evidence, exact test/plan commands, and current PostgreSQL 18 Compose facts.
   Correct older environment-history prose only where it would otherwise claim
   Docker is still unavailable in the current repository state; preserve the
   dated historical context.
3. Update `docs/system-architecture.md` Phase 7 current-state section so named
   gbOpen hierarchy governance and controlled dependency-capable database proof
   are current. Keep production provider publication, refresh/precedence,
   external-dependency restart drills, and production operations deferred.
4. Update `docs/security.md` TM-07/TM-17 and residual Phase 7 evidence to record
   the fail-closed real-database coverage. Do not change risk severity merely
   because tests exist, and do not claim legal/political authority or upstream
   compromise mitigation.
5. Update `docs/build-plan.md` only enough to record the Phase 7C evidence unit
   if needed for current-state resolution. Do not declare all of Phase 7 or
   launch complete while live provider publication/operator decisions and
   dependency failure drills remain unresolved.
6. Update `docs/operations.md` only if CI or the local database verification
   command matrix would otherwise be inaccurate. Do not expand launch scope.

## Explicit non-goals

- No live geoBoundaries/GitHub request, provider artifact download, production
  geography import, committed geometry, or provider availability test.
- No new provider, source-precedence policy, refresh schedule, authoritative
  override, region retirement/reparenting policy, dispute policy, legal review,
  or claim of jurisdictional correctness.
- No schema/Prisma model/migration/index change unless measured evidence exposes
  a genuine defect and the user separately approves that scope. The expected
  indexes already exist.
- No PostgreSQL volume deletion/reset, `docker compose down -v`, broad database
  drop, production host, backup/restore drill, encryption/key-recovery drill,
  or PostgreSQL/PostGIS version change.
- No Garage, Valkey, ClamAV, queue restart, dead-letter, orphan reconciliation,
  upload, parser-sandbox, worker, or production failure-injection work. Those
  remain later dependency-capable units.
- No REST/GraphQL/DTO/OpenAPI route, public geography browser, mapping UI,
  authenticated client, analytics, dashboard, report, export, or AI change.
- No performance SLO, forced query plan, arbitrary index, or benchmark claim
  beyond the controlled local-regression evidence.

## Acceptance criteria

- Real geography/PostGIS tests run under the explicit server E2E database gate
  and fail when the migrated test database is unavailable; no database test can
  silently return and be reported as passed.
- A synthetic ADM0-ADM3 import proves multiple parents at one level, arbitrary
  input ordering, exact provider-code identity, complete geometry/alias writes,
  identical re-import idempotency, conflict-safe no-reparent behavior, and full
  rollback after a late invalid geometry.
- Direct PostGIS persistence, topological rejection, foreign-reference mapping,
  and interior/edge/exterior lookup semantics remain covered against real
  PostgreSQL/PostGIS.
- The geography plan report evaluates both spatial and `(parentId, level)`
  queries, confirms the expected GiST and composite hierarchy indexes without
  planner coercion, and removes all fixtures.
- CI starts from its empty PostgreSQL 18/PostGIS service, applies the complete
  migration chain, hardens roles, runs full server E2E, and runs the geography
  plan gate with pinned actions and read-only repository permissions.
- Local evidence includes a safely isolated apply-from-zero temporary database,
  the full server suite, and both plan results, or reports the exact external
  block without fabricating success or deleting normal data.
- Canonical documentation distinguishes controlled synthetic/database evidence
  from still-open live provider, legal/governance, external-dependency, and
  production launch work.

## Verification and handoff

Run focused tests first, then the complete repository gates. Use the verified
script/argument forms from the actual package manifests; do not guess new
commands before adding them.

Run and quote real output for at least:

```bash
docker compose config
docker compose ps -a postgres
docker compose logs --tail=120 postgres
pg_isready -h localhost -p 5432
npm run prisma:validate --workspace=@acres/server
npm run prisma:migrate:status --workspace=@acres/server
npm run test --workspace=@acres/server -- --runInBand
npm run test:server -- --runInBand
npm run geography:plans
npm run analytics:plans
npm run contracts:check
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --cached --check
git diff --cached --stat
```

For Prisma migration/status commands, set the exact migrator URL appropriate to
the command. For server tests and plan checks, set the existing `acres_test`
runtime URL. Quote redacted targets, not passwords. Also quote the isolated
temporary-database create, migration-apply/status/schema assertions, and exact
cleanup/drop result. `analytics:plans` is a regression check because the
geography seed/plan changes share `plan-evaluator.ts`; it does not expand this
prompt into Phase 8 work.

Inspect the complete diff and staged diff. Invoke `requesting-code-review` with
actual `BASE_SHA`/`HEAD_SHA`, this prompt, the prior prompt-47 evidence gap, the
prompt-48 PostgreSQL 18 correction, test placement/fail-closed behavior,
fixture cleanup rules, transaction/idempotency/conflict/rollback proof, both
query plans, CI step ordering, migration-from-zero evidence, and every check
result. Evaluate all findings through `receiving-code-review`; verify each
claim against code and real database behavior before fixing it. Request
follow-up review if feedback changes a production module boundary, transaction,
fixture cleanup, plan guard, CI gate, or migration procedure.

Stage only approved files and this prompt. Inspect the staged patch and commit
locally to `main` using a `caveman-commit` message. Do not push.
