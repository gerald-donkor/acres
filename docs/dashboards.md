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

npm run test:server
Test Suites: 3 passed, 3 total
Tests: 81 passed, 81 total

npm run test:client:e2e
12 passed (12.8s)

npm run contracts:check
✔ Generated Prisma Client (7.9.1)
```

The first client E2E run failed after organization creation with a generic
network alert. The cause was the new server-side GraphQL POST path missing the
global CSRF token/cookie pair. The helper now obtains and forwards the token
before posting to `/graphql`; the rerun passed all 12 browser tests at 375, 800,
and 1280 px.

Local migration deploy was run against both `acres_test` and the development
`acres` database with the migrator role. Earlier unelevated or runtime-role
attempts failed for the expected reasons: sandbox/database reachability and
missing `_prisma_migrations` privileges.

## Residual gaps

- Dashboard sharing, publishing, collaboration, and AI remain future phases.
- Saved views do not yet have versioned schema migration for future presentation
  shapes; the JSON shape is intentionally small and validated at the DTO layer.
- Query-plan timing still needs seeded analytics data large enough to make
  `EXPLAIN (ANALYZE, BUFFERS)` meaningful.
- The dashboard feature currently uses the existing authenticated app shell
  rather than a separate information architecture for a mature analytics suite.
