# 68 - dashboard saved-view schema versioning

## Scope, and why it is next

The committed repository is on `main` at `ce7f634`
(`feat(ops): add unified launch drill and checklist`). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22 in `docs/build-plan.md`, operator checklist
in `docs/launch-checklist.md`). There is no unbuilt ordered phase left, so this
prompt scopes the smallest unblocked residual gap, parent Phase 9, chosen by the
user as the recommended path.

The gap is stated in `docs/dashboards.md` (§ Residual gaps):

> Saved views do not yet have versioned schema migration for future
> presentation shapes; the JSON shape is intentionally small and validated at
> the DTO layer.

Any future presentation change (a new chart kind, a new `compareBy` axis, new
filter keys) currently has no durable marker distinguishing old rows from new
rows, so a future reader cannot tell whether a stored `filters`/`presentation`
blob predates or postdates a shape change. This prompt adds an explicit,
additive saved-view schema version and fail-closed read semantics, without
changing any presentation shape today.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 9 definition (§10), Phase 9 status line
  ("implemented by `prompts/30-dashboards-optimized-graphql.md`"), and §§16–22
  confirming phases 12E–12K are committed; establishes there is no unbuilt
  ordered phase and this is a residual-gap follow-up, not a reorder.
- `docs/dashboards.md` (full file, 150 lines) — schema/permissions section
  (migration `20260824211500_dashboard_views`, JSON `filters`/`presentation`,
  `dashboards.manage` permission map), REST table, GraphQL `dashboardSummary`
  read model, client UI, and the residual-gaps section quoted above.
- `server/src/dashboards/dashboards.service.ts` (203 lines) — `listViews`,
  `getView`, `createView` (idempotent `dashboardViews.create`), `updateView`,
  `archiveView`, `summary`; `normalizeCreate` default presentation
  `{ chart: 'bar', compareBy: 'region' }`; `toView` mapping with
  `(row.filters ?? {})` / `(row.presentation ?? {})` fallbacks and no version
  handling.
- `server/src/dashboards/dashboards.repository.ts` (37 lines) — tenant-scoped
  `listViews` (active, `updatedAt` desc, `take: 50`) and `findView`; no
  version logic.
- `server/src/dashboards/dto/dashboard-view.dto.ts` — existing request/response
  DTO validation for the JSON shapes (read before changing; keeps the shape
  small).
- `packages/shared/src/dashboards.ts` (77 lines) — `DashboardFilters`,
  `DashboardPresentation` (`chart?: 'bar' | 'line' | 'table'`,
  `compareBy?: 'region' | 'period'`), `DashboardView` (no version field),
  create/update inputs.
- `server/prisma/schema.prisma` (`model DashboardView`, ~lines 877–900) —
  `id`, `organizationId`, `ownerAccountId`, `name`, `description?`, `filters`
  Json, `presentation` Json, `status`, timestamps; composite tenant FKs;
  `@@unique([organizationId, id])`; tenant indexes; **no version column**.
- `server/prisma/migrations/20260824211500_dashboard_views/migration.sql` —
  `DashboardViewStatus` enum, table DDL with name/description CHECKs, tenant
  indexes, `ENABLE` + `FORCE RLS` with the
  `app.current_organization_id` policy, grants
  (`SELECT, INSERT, UPDATE, DELETE` to `acres_app, acres_test`; `TRUNCATE` to
  `acres_test`).
- `server/src/dashboards/dashboards.service.spec.ts` (18 tests) — existing
  unit expectations the change must keep green (listing, ISO mapping,
  nullable fallbacks, 404s, idempotent creation, partial mutation, archival,
  `dashboardSummary` serialization).
- `server/src/graphql/graphql.types.ts` and
  `server/src/graphql/acres.resolver.ts` — `dashboardSummary` read model and
  saved-view GraphQL object type the additive field must flow through.

No comp, crop, or board region applies: this is a backend-only change with no
visual surface (see Reference deltas).

## Current-state facts the implementation must preserve

1. Stored `filters`/`presentation` are schemaless JSON with code-level
   fallbacks (`?? {}`) and DTO validation; there is no durable version marker.
2. `createView` runs inside `IdempotencyService.run` with
   `operation: 'dashboardViews.create'` and the normalized body as the replay
   key. Any new stored column must not change idempotent-replay semantics for
   identical bodies.
3. `updateView` does partial patching (`input.filters ?? undefined`,
   `input.presentation ?? undefined`) and trims text; it must not silently
   reinterpret an old stored shape as a new one.
4. RLS is `FORCE` with the transaction-local organization setting via
   `TenantTransactionService.organizationScoped`; the migration must not
   weaken the policy, and grants for both runtime roles must still hold after
   the DDL.
5. `dashboardSummary` composes analytics + saved views and serializes decimals
   as strings; the version field is metadata only and must not alter aggregate
   values, ordering, or the `take: 50` bound.

## Implementation

1. **Additive migration** (new directory, next timestamp after
   `20260829200000_region_geometry_unique_key`; never edit an applied
   migration):
   - `ALTER TABLE "DashboardView" ADD COLUMN "schemaVersion" integer NOT NULL DEFAULT 1;`
   - `CHECK ("schemaVersion" >= 1)` constraint.
   - Backfill is implicit via the column default: every existing row reads as
     version 1, which matches the only shape ever written.
   - Re-assert the existing grants on `"DashboardView"` for `acres_app` and
     `acres_test` (same grant set as the Phase 9 migration) and leave the RLS
     policy untouched. Verify with `\z "DashboardView"` / policy inspection
     against a migrated scratch database.
   - Follow the repo's migration convention: generate via Prisma, review the
     SQL by hand (additive-only — a `rg` scan of the new migration directory
     must show zero destructive DDL such as `DROP COLUMN`/`DROP TABLE`), and
     deploy forward with the migrator role against both `acres` and
     `acres_test`.
2. **Prisma schema**: add `schemaVersion Int @default(1)` to `model
   DashboardView` with a `///` comment stating version 1 is the Phase 9
   `filters`/`presentation` shape. Regenerate the client.
3. **Shared contract** (`packages/shared/src/dashboards.ts`): add
   `schemaVersion: number` to `DashboardView`. Do not add it to
   `CreateDashboardViewInput` — callers never choose the version; the server
   stamps it.
4. **Service read semantics** (`dashboards.service.ts`, `toView` + one named
   constant, e.g. `CURRENT_DASHBOARD_VIEW_SCHEMA_VERSION = 1`):
   - Missing/`null` stored value normalizes to `1` (pre-versioning rows).
   - Value `1` passes through unchanged.
   - Any value `> CURRENT` (or non-integer/`< 1`) fails closed: throw the
     existing stable `ApiException` error path used for malformed tenant data
     (no new envelope), never guess, coerce, or render the unknown shape.
     Both `getView` and `listViews` go through `toView`, so both are covered;
     `summary` inherits it via `listViews`.
   - `createView` stamps the current version on the row; the idempotency
     `requestBody` stays the caller-supplied normalized body (version is
     server-stamped metadata, not part of the replay key).
   - `updateView` preserves the row's existing version and validates incoming
     `filters`/`presentation` against the current-version DTO only; it must
     not bump or reset the version.
5. **DTO + GraphQL + OpenAPI/SDL**: expose `schemaVersion` on the dashboard-view
   response DTO and the GraphQL saved-view object type; regenerate committed
   OpenAPI and SDL via `npm run contracts:check` and commit any snapshot diff.
   No route path, permission, CSRF, idempotency-header, pagination, or
   complexity change. No GraphQL mutations (still read-only per Phase 4/9).
6. **Tests** (all against real PostgreSQL/PostGIS where tenant behavior is
   asserted; database assertions must not use the Prisma test double):
   - Unit (`dashboards.service.spec.ts` +): version stamped on create;
     missing version reads as 1; unknown future version fails closed on
     `getView` and is excluded-or-errors deterministically on `listViews`
     (pick one, document it, test it); update preserves version; idempotent
     replay of an identical create body returns the identical view including
     version.
   - Real-DB e2e: two-organization isolation still holds for versioned rows
     (foreign view → 404 under forced RLS); migration applies from the Phase
     9 baseline to the new migration on an empty database and existing rows
     backfill to 1.
   - Regression: full `dashboards.service.spec.ts`, `npm run test:server`,
     and the deterministic scale-seed guard `npm run analytics:plans`
     (saved views and `dashboardSummary` are benchmarked under it per
     `docs/dashboards.md`).

## Expected impact — which routes change, and how

- DDL + Prisma + shared type + service + DTO + GraphQL object type + snapshots.
- REST paths unchanged (`GET/POST /dashboard-views`, `GET/PATCH/DELETE
  /dashboard-views/:viewId`); responses gain additive `schemaVersion: 1`.
  Same permission map (`analytics.read` reads, `dashboards.manage` writes),
  same envelopes, same CSRF/`Idempotency-Key` behavior.
- `dashboardSummary` (REST-composed and GraphQL) carries the version on each
  saved view; aggregate payload unchanged.
- Client UI: no change required. `/app/dashboards` and
  `/app/dashboards/[viewId]` treat `schemaVersion` as opaque metadata; no new
  fetch, no new copy. If the client type for `DashboardView` is duplicated
  outside `packages/shared`, rebind it to the shared type rather than adding a
  parallel field.

## Non-goals — deliberately out of scope, and why

- New chart kinds, axes, filter keys, or any presentation redesign: this prompt
  versions the shape; it does not change it.
- Migration logic for hypothetical v2 shapes: no v2 exists; only the
  fail-closed unknown-version path is added.
- Dashboard sharing, publishing, collaboration, scheduled exports,
  retention/deletion policy: separate future phases/open decisions per the
  residual gaps in `docs/dashboards.md` and `docs/reports.md`.
- Analytics cross-version rollups (Phase 8 residual): separate semantics
  change with its own product decision.
- Operator-owned launch values (retention schedules, SLOs, key recovery):
  operator decisions, not implementable here.
- Any RLS, permission-map, throttle, GraphQL-complexity, or introspection
  change.

## Reference deltas

None — there is no visual surface and no comp applies. REST/GraphQL responses
gain one additive integer field; no existing field changes type or meaning.

## Breakpoint behaviour

No UI change ships, so there is nothing to verify at 375/800/1280 beyond the
existing dashboard responsive suites staying green (they run as part of the
checks below; no new browser coverage is required unless the implementation
touches client code, in which case the existing 375/800/1280 zero-horizontal-
scroll and 44px touch-target assertions must still pass).

## Checks to run (§6), with real output quoted

From the repository root, in dependency order:

```bash
npm run lint
npm run typecheck
npm run build
npm run contracts:check
npm run test --workspace=@acres/server -- src/dashboards/dashboards.service.spec.ts
npm run test:server
npm run analytics:plans
git diff --check
git status --short
```

Plus the migration-specific proofs: fresh-apply of the migration chain from
zero on a scratch database, forward deploy against `acres` and `acres_test`
with the migrator role, zero-destructive-DDL scan of the new migration
directory, and post-migration grant/RLS inspection. Fix every failure before
review. Never claim a check passed without running it.

## Review, record, commit

- Two-stage review loop is mandatory: `requesting-code-review` with structured
  context (requirements, what changed, files, SHAs, checks run), then evaluate
  with `receiving-code-review` against codebase reality; re-review if the
  feedback drives architectural change.
- Record the result in `docs/dashboards.md`: new migration name, column +
  constraint, read/write semantics, and strike or narrow the versioned-schema
  residual-gap bullet. One index-row-class edit at most elsewhere.
- Commit to `main` with `caveman-commit` (ALWAYS rule); do not push.

## SKILLS USED

- `architecture-patterns`: additive expand-only migration, fail-closed unknown-version handling, repository/service boundary (no resolver/controller Prisma).
- `postgres-best-practices`: additive column + CHECK constraint, default backfill, grant/RLS preservation, reviewed SQL migration.
- `nestjs-best-practices`: service/repository pattern, transaction-local tenant scope, centralized exception path, testing-module unit tests.
- `api-design-principles`: additive response field without route/permission change, stable error shape for unknown versions, idempotent-create semantics preserved.
- `openapi-spec-generation`: regenerating and committing OpenAPI/SDL snapshots for the additive field.
- `javascript-testing-patterns`: unit coverage for stamp/normalize/fail-closed/preserve/replay cases.
- `e2e-testing-patterns`: real-PostgreSQL two-org isolation and migration-apply proofs (no Prisma test double for DB assertions).
- `sql-optimization-patterns`: only if the migration or version predicate changes a query plan; otherwise state why it does not apply.
- `security-best-practices`: confirm no trust-boundary change (RLS/policy/grants intact, no new unauthenticated surface).
- `requesting-code-review`: structured reviewer-subagent dispatch after self-verification.
- `receiving-code-review`: technical evaluation of review feedback before fixing.
- `caveman-commit`: conventional commit message for the final local commit.
