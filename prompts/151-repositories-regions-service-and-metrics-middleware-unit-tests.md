# 151 — export canonical dashboard and report tuples, and add isolated unit tests across repositories, regions service, and metrics middleware

## Scope, and why it is next

The committed repository is on `main` at `15f78f6`
(`refactor(controllers): export terminal states and add tests`, the prompt 150 implementation).
The worktree is clean (verified via `git status`, clean working tree).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), followed by external I/O adapter hardening, canonical
tuple exports, and isolated unit testing across scanner, queue, storage, mail, AI,
parser, upload, organization/audit, accounts/auth, security, tenancy guard, common
request/response, prisma/transactions, config, health, forms, job runs, and all
REST controllers (prompts 136–150).

With 100% of all REST controllers covered by isolated unit test suites in Prompt 150,
the immediate next architectural layer requiring canonical contract exports and
isolated unit test coverage is the data-access repository tier, the public regions service,
and the Prometheus metrics HTTP middleware:

1. **`packages/shared/src/dashboards.ts`**:
   - Codify canonical const tuples and predicates: `DASHBOARD_VIEW_STATUSES`, `DashboardViewStatus`,
     `isDashboardViewStatus`, `DASHBOARD_PRESENTATION_CHARTS`, `DashboardPresentationChart`,
     `DASHBOARD_COMPARE_BY_OPTIONS`, `DashboardCompareBy`, `METRIC_VALUE_KINDS`, `MetricValueKind`,
     `METRIC_AGGREGATION_TYPES`, and `MetricAggregationType`.
2. **`packages/shared/src/reports.ts`**:
   - Codify canonical const tuples and predicates: `REPORT_STATUSES`, `ReportStatus`,
     `isReportStatus`, `REPORT_REVISION_STATUSES`, `ReportRevisionStatus`,
     `isReportRevisionStatus`, `REPORT_EVIDENCE_TYPES`, `ReportEvidenceType`,
     `EXPORT_FORMATS`, and `ExportFormat`.
3. **`server/src/regions/regions.service.spec.ts`** (NEW):
   - Isolated unit tests for `RegionsService`:
     - `list()`: fetches regions with `WITH_METRICS` ordered by name asc, maps rows to `RegionSummary` and `RegionalMetric`, converts dates to ISO strings or null.
     - `listPage(take, afterId?, statementTimeoutMs?)`: cursor pagination with/without cursor, skips 1 when cursor present, executes statement timeout via transaction set_config when provided, handles Prisma `P2025` error by throwing `ApiException.cursorInvalid()`, rethrows unknown errors.
     - `findBySlug(slug)`: fetches unique region with `WITH_METRICS`, throws `ApiException.notFound` if null, returns mapped summary.
     - `findBySlugs(slugs, statementTimeoutMs?)`: deduplicates input slugs, fetches multiple regions, executes optional statement timeout, returns `Map<string, RegionSummary>`.
4. **`server/src/dashboards/dashboards.repository.spec.ts`** (NEW):
   - Isolated unit tests for `DashboardsRepository`:
     - `organizationScoped(organization, callback)`: forwards `accountId`, `organizationId`, callback, and `{ statementTimeoutMs: 5000 }` to `TenantTransactionService.organizationScoped`.
     - `listViews(tx, organizationId)`: queries `tx.dashboardView.findMany` with `where: { organizationId, status: 'active' }`, `orderBy: [{ updatedAt: 'desc' }]`, `take: 50`.
     - `findView(tx, organizationId, viewId)`: queries `tx.dashboardView.findFirst` with `where: { id: viewId, organizationId, status: 'active' }`.
5. **`server/src/analytics/analytics.repository.spec.ts`** (NEW):
   - Isolated unit tests for `AnalyticsRepository`:
     - `organizationScoped`: forwards to `tenants.organizationScoped` with 5000ms timeout.
     - `findMetrics`: queries `tx.metricDefinition.findMany` with `where: { organizationId, status: 'active' }`, `orderBy: { key: 'asc' }`, `take: 100`.
     - `findMetric`: queries `tx.metricDefinition.findFirst` with `where: { id, organizationId }`.
     - `findObservations`: applies filter, orderBy periodStart/createdAt, includes metricDefinition/qualities, limit defaulting to 50.
     - `findAggregates`: applies filter, orderBy periodStart/createdAt, includes metricDefinition, limit defaulting to 50.
     - `findAggregate`: queries `tx.metricAggregate.findFirst` with `where: { id, organizationId }`, includes metricDefinition.
     - `findAggregateEvidence`: queries `tx.metricAggregateLineage.findMany` with `where: { organizationId, aggregateId }`, `take: 200`, includes observation and datasetVersion.
     - `filter`: tests permutations of `metricId`, `regionId`, `datasetVersionId`, `dimensionHash`, `periodStart` (gte Date), `periodEnd` (lte Date).
6. **`server/src/reports/reports.repository.spec.ts`** (NEW):
   - Isolated unit tests for `ReportsRepository`:
     - `organizationScoped`: forwards to `tenants.organizationScoped` with 5000ms timeout.
     - `workerScoped`: forwards to `tenants.workerScoped` with 10000ms timeout.
     - `listReports`: with `visibility: 'all'` (`status: { not: 'archived' }`) and `visibility: 'published'` (`status: 'published'`), take 50, latest revision include.
     - `findReport`: with `visibility: 'all'` and `'published'`.
     - `findRevision`: queries `tx.reportRevision.findFirst` with `revisionInclude()`.
     - `listExports`: queries `tx.exportRequest.findMany` with `orderBy: [{ createdAt: 'desc' }]`, `take: 50`, `include: { artifact: true }`.
     - `findExport`: queries `tx.exportRequest.findFirst` with `include: { artifact: true }`.
     - `revisionInclude` and `latestRevisionInclude` helper functions.
7. **`server/src/metrics/metrics.middleware.spec.ts`** (NEW):
   - Isolated unit tests for `MetricsMiddleware`:
     - bypasses `/metrics` and `/metrics/subpath` immediately without incrementing active requests or registering finish listeners.
     - processes standard requests: calls `next()`, increments `metrics.httpActiveRequests.inc()`.
     - on `finish` event: calculates elapsed duration using `process.hrtime.bigint()`, decrements active requests, calls `metrics.recordHttpRequest(req.method, req.path, res.statusCode, durationSeconds)`.
     - on `close` event when `finish` not triggered: calculates duration, decrements active requests, calls `recordHttpRequest`.
     - guarantees idempotency: triggers only once even if both `finish` and `close` fire on the same response.
     - falls back to status code 499 if `res.statusCode` is 0 or undefined.

## Subsystems and changes

1. `packages/shared/src/dashboards.ts`:
   - Export `DASHBOARD_VIEW_STATUSES`, `DashboardViewStatus`, `isDashboardViewStatus`.
   - Export `DASHBOARD_PRESENTATION_CHARTS`, `DashboardPresentationChart`.
   - Export `DASHBOARD_COMPARE_BY_OPTIONS`, `DashboardCompareBy`.
   - Export `METRIC_VALUE_KINDS`, `MetricValueKind`.
   - Export `METRIC_AGGREGATION_TYPES`, `MetricAggregationType`.
2. `packages/shared/src/reports.ts`:
   - Export `REPORT_STATUSES`, `ReportStatus`, `isReportStatus`.
   - Export `REPORT_REVISION_STATUSES`, `ReportRevisionStatus`, `isReportRevisionStatus`.
   - Export `REPORT_EVIDENCE_TYPES`, `ReportEvidenceType`.
   - Export `EXPORT_FORMATS`, `ExportFormat`.
3. `server/src/regions/regions.service.spec.ts` (NEW):
   - 10+ unit tests covering all methods and branches of `RegionsService`.
4. `server/src/dashboards/dashboards.repository.spec.ts` (NEW):
   - 8+ unit tests covering all methods and branches of `DashboardsRepository`.
5. `server/src/analytics/analytics.repository.spec.ts` (NEW):
   - 12+ unit tests covering all queries, filters, date handling, and branches of `AnalyticsRepository`.
6. `server/src/reports/reports.repository.spec.ts` (NEW):
   - 12+ unit tests covering report listing, revision retrieval, export listing, and helper projections of `ReportsRepository`.
7. `server/src/metrics/metrics.middleware.spec.ts` (NEW):
   - 8+ unit tests covering bypass, active request counters, timing calculations, lifecycle event listeners, idempotency, and fallback status codes of `MetricsMiddleware`.
8. `docs/backend.md`:
   - Record the new canonical tuples, repository unit testing, regions service unit testing, and metrics middleware unit testing under the build record.

## Non-goals

- No Prisma schema alterations, migrations, or database DDL changes.
- No modifications to REST controller logic or GraphQL resolvers.
- No changes to frontend components or UI code.

## Security, tenancy, and failure cases

- Tenancy boundaries: `DashboardsRepository`, `AnalyticsRepository`, and `ReportsRepository` enforce tenant scoping via `TenantTransactionService.organizationScoped` with explicit 5000ms statement timeouts.
- Worker security: `ReportsRepository.workerScoped` enforces worker transaction wrapping with 10000ms statement timeout.
- Cursor invalidation: `RegionsService.listPage` intercepts Prisma error `P2025` and maps to standard `ApiException.cursorInvalid()`.
- HTTP metric security: `/metrics` endpoints are bypassed to prevent recursive Prometheus scrape self-measurement and metric explosion.

## Testing and verification plan

1. Run isolated unit test suites for the 5 targeted components:
   ```bash
   npm run test --workspace=@acres/server -- src/regions/regions.service.spec.ts
   npm run test --workspace=@acres/server -- src/dashboards/dashboards.repository.spec.ts
   npm run test --workspace=@acres/server -- src/analytics/analytics.repository.spec.ts
   npm run test --workspace=@acres/server -- src/reports/reports.repository.spec.ts
   npm run test --workspace=@acres/server -- src/metrics/metrics.middleware.spec.ts
   ```
2. Run full repository verification:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
   - `npm run test:server`
   - `npm run contracts:check`
3. Execute code review loop (`requesting-code-review`, `receiving-code-review`) with subagent.
4. Document changes in `docs/backend.md`.
5. Stage and inspect diff.
6. Commit using `caveman-commit`.

## Required skill manifest

- `requesting-code-review` (.agents/skills/requesting-code-review/SKILL.md)
- `receiving-code-review` (.agents/skills/receiving-code-review/SKILL.md)
- `caveman-commit` (.agents/skills/caveman-commit/SKILL.md)
- `nestjs-best-practices` (.agents/skills/nestjs-best-practices/SKILL.md)
- `javascript-testing-patterns` (.agents/skills/javascript-testing-patterns/SKILL.md)
