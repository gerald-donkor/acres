# 52 - Phase 9 Dashboards and Optimized GraphQL Service Evidence

## Scope and why this is next

The committed `main` tip is `f9dfac4` (`test(reports): add phase 10 governed export suite`).
Following the Phase 10 report and export lifecycle evidence suite, the earliest unverified service unit in the target architecture build plan is Phase 9: Dashboards and optimized GraphQL (`docs/build-plan.md` §10).

As stated in `docs/build-plan.md` §10:
- "Phase 9 — dashboards and optimized GraphQL: Outcome/behavior: accessible regional browse/compare dashboards, saved views, tenant-safe GraphQL read models, filters and states that explain metrics/units/quality/evidence rather than imply unsupported claims."
- "Tests: query-count/plan and complexity tests; cross-org nodes/views; keyboard/screen-reader table alternative; filters/deep link/back-forward; loading/empty/error/partial-quality; visual/responsive/browser coverage."
- "Exit: accessible, responsive real-data dashboard with traceable evidence, bounded/measured queries, and negative tenant/cache tests."

While `DashboardsService` (`server/src/dashboards/dashboards.service.ts`) implements saved-view CRUD, idempotency integration, and the aggregated `summary()` read model powering GraphQL's `dashboardSummary` query, it currently lacks a dedicated, fail-closed unit test suite (`server/src/dashboards/dashboards.service.spec.ts`).

Dedicated unit and service-level test coverage is required to verify:

1. **Saved View Listing & Retrieval**:
   - `listViews`: executes within organization transaction boundary, enforces tenant isolation, limits active views to 50 ordered by `updatedAt desc`, maps row fields, and returns typed ISO strings.
   - `getView`: verifies active view existence within the calling organization; throws `ApiException.notFound` (`404`) for non-existent, archived, or foreign-tenant views.

2. **Idempotent View Creation & Normalization**:
   - `createView`: normalizes string inputs (trims whitespace, converts empty descriptions to `null`), applies default presentation fallback (`{ chart: 'bar', compareBy: 'region' }`), sets `status: 'active'`, and coordinates with `IdempotencyService.run` using transaction clients and operation identifier `dashboardViews.create`.

3. **View Mutation & Soft Deletion (Archival)**:
   - `updateView`: verifies view existence before mutation, applies partial updates (name, description, filters, presentation), trims whitespace, and rejects modifications to archived views or foreign-tenant views.
   - `archiveView`: checks view existence within organization scope, performs soft-delete by setting `status: 'archived'`, and returns `{ archived: true }`.

4. **GraphQL `dashboardSummary` Aggregation & Decimal Serialization**:
   - `summary`: concurrently fetches metric definitions (`AnalyticsService.listMetrics`), bounded aggregates (`AnalyticsService.listAggregates`), and active saved views (`listViews`).
   - Propagates filter parameters (`metricId`, `regionId`, `datasetVersionId`, `dimensionHash`, `periodStart`, `periodEnd`) and bounds aggregate limit to 24.
   - Formats and serializes numeric decimal values (`aggregate.value.value`) into string scalars or `null` for strict GraphQL schema compliance.
   - Handles empty metrics, empty aggregates, or empty views without inventing synthetic sample data.

5. **Documentation and Evidence Reconciliation**:
   - Update `docs/dashboards.md`, `docs/backend.md`, and `docs/build-plan.md` to record the completed Phase 9 service unit verification.

## Reference material read while preparing this prompt

- `AGENTS.md`, especially §§2, 2.1, 4–7, 8.2 Phase 9, 9, and 10.
- `docs/build-plan.md` §10 (Phase 9 outcome, test matrix, and exit gate).
- `docs/dashboards.md` (Schema, permissions, REST routes, GraphQL read model, and residual gaps).
- `docs/analytics.md` (Analytics service contracts and mapping).
- `docs/backend.md` §3 (Dashboards and GraphQL service implementation).
- `server/src/dashboards/dashboards.service.ts` and `dashboards.repository.ts`.
- `server/src/dashboards/dashboards.controller.ts` and `dashboards.module.ts`.
- `server/src/graphql/acres.resolver.ts`.
- `server/src/idempotency/idempotency.service.ts`.
- `server/src/analytics/analytics.service.ts`.

There is no visual surface, reference comp, breakpoint, browser, Next.js, React, Tailwind, shadcn, or motion work in scope. No design measurement applies.

## SKILLS USED

- `architecture-patterns` - maintain strict boundaries between domain services, repositories, idempotency, and GraphQL resolvers.
- `nestjs-best-practices` - construct robust test modules with proper dependency injection and mock boundaries for `DashboardsRepository`, `AnalyticsService`, and `IdempotencyService`.
- `postgres-best-practices` - verify transactional boundary execution, tenant RLS isolation, and deterministic query scoping.
- `security-best-practices` - verify fail-closed error handling, cross-tenant rejection, and parameter sanitization.
- `security-threat-model` - reconcile Phase 9 threat mitigation evidence against saved-view isolation and GraphQL query boundaries in `docs/security.md`.
- `error-handling-patterns` - verify consistent `ApiException.notFound` / `ApiException.forbidden` error behavior.
- `javascript-testing-patterns` - author comprehensive, maintainable unit tests with Jest.
- `kpi-dashboard-design` - verify metric definition, aggregate serialization, and filter propagation for analytical dashboards.
- `data-storytelling` - verify deterministic aggregate serialization without loss of fidelity or invented data points.
- `requesting-code-review` - dispatch reviewer subagent with structured context and diff SHAs.
- `receiving-code-review` - evaluate review feedback with technical rigor.
- `caveman-commit` - format Conventional Commit message.

## Expected Impact

### Server Tests Added:
- `server/src/dashboards/dashboards.service.spec.ts` - comprehensive unit test suite covering `DashboardsService` methods (`listViews`, `getView`, `createView`, `updateView`, `archiveView`, and `summary`).

### Documentation Updates:
- `docs/dashboards.md` - record Phase 9 service unit and summary serialization evidence.
- `docs/build-plan.md` - record Phase 9 test evidence.
- `docs/backend.md` - record test coverage for dashboards module.

## Non-goals

- Modifying the client dashboard UI or Recharts visualization components.
- Adding database schema migrations or altering Prisma schema for saved views.
- Introducing dashboard public sharing or collaborative multi-user editing.
- Adding AI-assisted dashboard generation or automated insights.

## Checks to Run

1. `npm run typecheck` - build shared package and typecheck all three workspaces.
2. `npm run lint` - lint all three workspaces.
3. `npm run test --workspace=@acres/server` - execute all server Jest unit suites including the new `dashboards.service.spec.ts`.
4. `npm run test:server` - execute server e2e suite.
5. `npm run ops:check` - execute production template, secret, Docker runtime, dependency, and readiness checks.
6. `git diff --check` - verify no whitespace issues or unresolved merge artifacts.
