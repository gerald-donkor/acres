# Dashboards and optimized GraphQL

Status: Phase 9 implemented from
`prompts/30-dashboards-optimized-graphql.md`. This is the implemented-state
record for the saved dashboard-view schema, dashboard REST commands, GraphQL
dashboard read model, and authenticated dashboard UI. Governed reports and
exports now live in `docs/reports.md`; sharing, collaboration, AI, and
published dashboard governance remain future work.

## Schema and permissions

Migration `20260824211500_dashboard_views` adds `DashboardView`, owned by one
organization and one account, with:

- `name`, optional `description`, JSON `filters`, JSON `presentation`,
  `active`/`archived` status, and timestamps;
- composite tenant foreign keys to `Organization` and `Account`;
- forced RLS with the existing `app.current_organization_id` transaction-local
  setting;
- tenant indexes for status/name listing and owner filtering.

`filters` store the analytics selection: metric, region, dataset version,
dimension hash, and period window. `presentation` stores chart intent:
`chart` and `compareBy`. A saved view stores query and presentation state, not
copied metric values.

## Saved-view schema versioning (prompt 68)

Migration `20260909000000_dashboard_view_schema_version` adds an additive
`schemaVersion integer NOT NULL DEFAULT 1` column with
`CHECK ("schemaVersion" >= 1)`, restating the Phase 9 table grants and leaving
the RLS policy untouched. Version 1 is the Phase 9 `filters`/`presentation`
shape; existing rows backfill to 1 via the column default. The ADD COLUMN is
the exact DDL Prisma's diff engine generates for the schema change; the CHECK
follows the reviewed-CHECK precedent (Prisma cannot express CHECKs), matching
`AiGeneration_inputHash_check`.

Read/write semantics (`server/src/dashboards/dashboards.service.ts`,
`CURRENT_DASHBOARD_VIEW_SCHEMA_VERSION = 1`):

- Writes stamp the current version server-side. `createView` keeps the
  caller-supplied normalized body as the idempotency replay key; the version
  is metadata, not part of the key. `updateView` never restamps: it patches
  `filters`/`presentation` against the current-version DTO and preserves the
  stored version.
- Reads normalize missing markers to 1 (pre-versioning rows). A newer,
  non-integer, or below-range marker fails closed with the stable
  `INTERNAL_ERROR` envelope — never guessed or coerced. `listViews`
  propagates the throw (deterministic error, no silent row drops), so list,
  read, and `dashboardSummary` stay consistent. Rollout implication: one
  unexpected row aborts the whole list and `dashboardSummary` for the org, so
  any future v2 introduction must migrate all rows atomically (or ship the
  reader first) — there is no degraded-mode list.
- REST responses and `DashboardViewGql` carry additive `schemaVersion`
  (OpenAPI `integer`, `minimum: 1`; GraphQL `Int!`). No route, permission,
  CSRF, idempotency-header, pagination, or complexity change.
- `updateView` version-gates before writing: a row the build cannot interpret
  is rejected without executing the Prisma update. `archiveView` is
  deliberately version-agnostic — flipping `status` needs no shape
  interpretation.

Verification (2026-09-09): deployed forward as migrator to `acres` and
`acres_test` (18/18 migrations, `migrate status` clean both), hardening
re-run, grants confirmed (`acres_app` DML without `TRUNCATE`, `acres_test`
DML plus `TRUNCATE`), forced RLS intact, zero destructive DDL in the
migration. Fresh-apply proof on an isolated scratch database: 17-migration
baseline applied from zero, a pre-versioning view row inserted, then the new
migration applied — the row backfills to `schemaVersion = 1`. Unit suite
`dashboards.service.spec.ts` passes 29/29 (stamp, normalize, fail-closed,
preserve, replay-key cases); real-database suite proves CHECK rejection of
version 0, two-org 404 isolation of versioned rows, and the version-1
create/read/list round trip; `analytics:plans` passes 6/6 with unchanged
query plans. Generation note: `prisma migrate dev` cannot run in this
environment (its shadow database lacks the superuser-owned PostGIS extension
the geography migration requires) and the live dev database carries
out-of-band DBA drift, so the migration was composed from Prisma's own
generated fragment plus the reviewed CHECK, with equivalence proved by the
scratch-database checks above.

The permission map now includes `dashboards.manage`. Owners have it through the
owner wildcard; admins and analysts receive it explicitly; viewers retain
`analytics.read` but cannot create, update, or archive views.

## REST commands

All routes are `/api/v1`, session-authenticated, selected-organization scoped,
and use the existing success/error envelopes.

| method   | path                       | permission          | notes                                      |
| -------- | -------------------------- | ------------------- | ------------------------------------------ |
| `GET`    | `/dashboard-views`         | `analytics.read`    | active saved views for the selected org    |
| `GET`    | `/dashboard-views/:viewId` | `analytics.read`    | one active saved view or not found         |
| `POST`   | `/dashboard-views`         | `dashboards.manage` | CSRF and `Idempotency-Key` required        |
| `PATCH`  | `/dashboard-views/:viewId` | `dashboards.manage` | updates metadata, filters, or presentation |
| `DELETE` | `/dashboard-views/:viewId` | `dashboards.manage` | soft-archives; no hard delete route        |

Repository methods scope every lookup by `organizationId`. Tests cover
save/reopen and viewer read/forbidden-write behavior.

## GraphQL read model

`dashboardSummary` is a read-only GraphQL query. It requires the selected
organization context and `analytics.read`, then returns:

- active metric definitions, including status and timestamps;
- bounded aggregate rows with metric metadata and decimal values serialized as
  strings;
- active saved views for the same organization.

The query accepts the same optional filters as the analytics aggregate read
path: metric, region, dataset version, dimension hash, and period window.
Resolvers call `DashboardsService`, which composes the existing analytics and
saved-view services rather than reaching into Prisma directly.

The Next server API helper posts dashboard reads through `/graphql`. Because
GraphQL is POST-only and protected by the global CSRF middleware, the helper
fetches `/api/v1/auth/csrf`, forwards the issued CSRF cookie into the server-side
cookie header, and sends `x-csrf-token` with the GraphQL request. This path is
covered by the authenticated Playwright flow.

## Client UI

`/app` now renders the dashboard workspace when an active organization exists;
`/app/dashboards` reuses the same route, and `/app/dashboards/[viewId]` opens a
saved view by applying its stored filters before reading `dashboardSummary`.

The workspace keeps the existing authenticated shell and Acres tokens:

- summary stats expose metric, aggregate, saved-view, and latest-period counts;
- Recharts renders a bar chart inside the local shadcn chart wrapper;
- a table alternative presents the same aggregate values, periods, units,
  observations, and dataset-version evidence;
- the save form is a client leaf with visible field errors, pending state, CSRF
  mutation client use, idempotency, and `router.refresh()`;
- empty and error states use the existing `Alert` surface and do not invent
  sample analytics.

The chart is not the only meaning carrier: values and evidence remain available
in text/table form. The app shell marks Dashboards as the active section for the
workspace and exposes the current organization label for screen-reader and
Playwright assertions.

## Verification

Passing during this implementation:

```text
npm run lint
@acres/client@0.1.0 lint
@acres/shared@0.1.0 lint
@acres/server@0.1.0 lint

npm run typecheck
✔ Generated Prisma Client (7.9.1)

npm run build
Route (app)
├ ƒ /app
├ ƒ /app/dashboards
├ ƒ /app/dashboards/[viewId]
✔ Generated Prisma Client (7.9.1)

npm run test --workspace=@acres/server -- src/dashboards/dashboards.service.spec.ts
PASS src/dashboards/dashboards.service.spec.ts (18 passed, 18 total)
- saved view listing, mapped ISO strings, and fallback handling for nullable filters/presentation
- single view retrieval and fail-closed 404 for non-existent or foreign tenant views
- idempotent creation coordinating with IdempotencyService.run, input normalization, and default presentation fallback
- partial mutation verifying tenant scope and trimming whitespace
- soft-archival setting status to archived
- GraphQL dashboardSummary concurrent aggregation and decimal string scalar serialization

npm run test:server
Test Suites: 3 passed, 3 total
Tests: 81 passed, 81 total

npm run test:client:e2e
Playwright suites pass across product journeys, multi-tenant isolation, and WCAG accessibility

npm run contracts:check
✔ Generated Prisma Client (7.9.1)
```

The server-side GraphQL POST path sends the global CSRF token/cookie pair.
Phase 12C expands test coverage with dedicated E2E suites covering the full dashboard query
lifecycle, KPI summary stats, Recharts visualizations, comparison table alternatives,
saved view persistence, multi-tenant view isolation, and responsive layout fitting at
375, 800, and 1280 px.

Local migration deploy was run against both `acres_test` and the development
`acres` database with the migrator role. Earlier unelevated or runtime-role
attempts failed for the expected reasons: sandbox/database reachability and
missing `_prisma_migrations` privileges.

## Residual gaps

- Dashboard sharing, publishing, collaboration, and AI remain future phases.
- Saved views carry an explicit `schemaVersion` (prompt 68) with fail-closed
  reads, so future presentation shapes have a durable marker. Versioned
  *migration logic* for a hypothetical v2 shape does not exist yet — no v2
  exists — and the JSON shape stays intentionally small and DTO-validated.
- Saved dashboard views (`listViews`) and summary aggregate queries (`dashboardSummary`)
  are benchmarked and regression-guarded under the deterministic scale seed harness via
  `npm run analytics:plans` (see [`analytics.md`](analytics.md)).
- The dashboard feature currently uses the existing authenticated app shell
  rather than a separate information architecture for a mature analytics suite.
