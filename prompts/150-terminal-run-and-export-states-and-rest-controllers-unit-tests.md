# 150 — export canonical terminal states for ingestion runs and exports, and add unit tests across remaining REST controllers (regions, metrics, dashboards, analytics, reports, ingestion)

## Scope, and why it is next

The committed repository is on `main` at `2b35ebb`
(`refactor(controllers): export tuples and add tests`, the prompt 149 implementation).
The worktree is clean (verified via `git status`, clean working tree).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), followed by external I/O adapter hardening, canonical
tuple exports, and isolated unit testing across scanner, queue, storage, mail, AI,
parser, upload, organization/audit, accounts/auth, security, tenancy guard, common
request/response, prisma/transactions, config, health, forms, job runs, and the initial
batch of core REST controllers (prompts 136–149).

Prompt 149 introduced canonical exports for `TERMINAL_UPLOAD_STATES` and comprehensive
unit test suites for `AuthController`, `AccountsController`, `OrganizationsController`,
`UploadsController`, and `AiDraftController`.

The remaining presentation tier contains six REST controllers that currently lack
isolated controller unit test suites, along with inline terminal state checks that
should be codified into canonical `@acres/shared` exports:

1. **`IngestionController` (`server/src/ingestion/ingestion.controller.ts`)**:
   - Manages dataset metadata, versioning, mapping creation, ingestion runs, validation issues,
     cancellation, and Server-Sent Events (`@Sse('ingestion-runs/:runId/events')`).
   - Line 311 uses an un-exported inline array `['published', 'failed', 'cancelled']` to determine
     terminal ingestion run states.
   - We must codify `INGESTION_RUN_STATES`, `TERMINAL_INGESTION_RUN_STATES`, and `isTerminalIngestionRunState`
     in `@acres/shared` and delegate `isIngestionTerminal` in `ingestion.controller.ts`.
   - Comprehensive unit test suite in `server/src/ingestion/ingestion.controller.spec.ts`.

2. **`ReportsController` (`server/src/reports/reports.controller.ts`)**:
   - Manages reports, draft revisions, review submission, publishing, evidence queries, export
     job creation, status lookup, signed attachment download URLs, and Server-Sent Events
     (`@Sse('exports/:exportId/events')`).
   - Line 392 uses an un-exported inline array `['succeeded', 'failed', 'cancelled']` to determine
     terminal export request states.
   - We must codify `EXPORT_STATUSES`, `TERMINAL_EXPORT_STATUSES`, and `isTerminalExportStatus` in
     `@acres/shared` and delegate `isExportTerminal` in `reports.controller.ts`.
   - Comprehensive unit test suite in `server/src/reports/reports.controller.spec.ts`.

3. **`DashboardsController` (`server/src/dashboards/dashboards.controller.ts`)**:
   - Presentation layer for saved dashboard views: listing, single fetch, creation, update, and
     soft-archiving.
   - Enforces UUID validation via `ParseUUIDPipe`, handles optional `Idempotency-Key` headers,
     and forwards organization context.
   - Comprehensive unit test suite in `server/src/dashboards/dashboards.controller.spec.ts`.

4. **`AnalyticsController` (`server/src/analytics/analytics.controller.ts`)**:
   - Presentation layer for metric definitions, observations, deterministic aggregate read models,
     and aggregate lineage evidence.
   - Forwards query parameters (`AnalyticsObservationQueryDto`, `AnalyticsAggregateQueryDto`),
     param DTOs, and organization context.
   - Comprehensive unit test suite in `server/src/analytics/analytics.controller.spec.ts`.

5. **`RegionsController` (`server/src/regions/regions.controller.ts`) & `MetricsController` (`server/src/metrics/metrics.controller.ts`)**:
   - `RegionsController`: public endpoints for listing region summaries and fetching one by slug.
   - `MetricsController`: version-neutral Prometheus metrics exposition endpoint `GET /metrics`,
     bypassing global JSON envelope, setting `Content-Type` from `MetricsService.contentType`, and streaming text.
   - Comprehensive unit test suites in `server/src/regions/regions.controller.spec.ts` and
     `server/src/metrics/metrics.controller.spec.ts`.

Completing these finishes isolated unit test coverage across 100% of all REST controllers in the
Acres NestJS presentation tier.

## Subsystems and changes

1. `packages/shared/src/ingestion.ts`:
   - Export canonical const tuples and predicates:
     ```typescript
     export const INGESTION_RUN_STATES = [
       'queued',
       'running',
       'validation_failed',
       'published',
       'failed',
       'cancelling',
       'cancelled',
     ] as const;

     export const TERMINAL_INGESTION_RUN_STATES = [
       'published',
       'failed',
       'cancelled',
     ] as const;

     export type TerminalIngestionRunState =
       (typeof TERMINAL_INGESTION_RUN_STATES)[number];

     export function isTerminalIngestionRunState(
       state: string,
     ): state is TerminalIngestionRunState {
       return (TERMINAL_INGESTION_RUN_STATES as readonly string[]).includes(state);
     }
     ```
2. `server/src/ingestion/ingestion.controller.ts`:
   - Import `isTerminalIngestionRunState` and `TERMINAL_INGESTION_RUN_STATES` from `@acres/shared`.
   - Update `isIngestionTerminal(state: IngestionRunSummary['state']): boolean` to delegate to
     `isTerminalIngestionRunState(state)`.
3. `packages/shared/src/reports.ts`:
   - Export canonical const tuples and predicates:
     ```typescript
     export const EXPORT_STATUSES = [
       'queued',
       'running',
       'succeeded',
       'failed',
       'cancelled',
     ] as const;

     export const TERMINAL_EXPORT_STATUSES = [
       'succeeded',
       'failed',
       'cancelled',
     ] as const;

     export type TerminalExportStatus =
       (typeof TERMINAL_EXPORT_STATUSES)[number];

     export function isTerminalExportStatus(
       status: string,
     ): status is TerminalExportStatus {
       return (TERMINAL_EXPORT_STATUSES as readonly string[]).includes(status);
     }
     ```
4. `server/src/reports/reports.controller.ts`:
   - Import `isTerminalExportStatus` and `TERMINAL_EXPORT_STATUSES` from `@acres/shared`.
   - Update `isExportTerminal(status: ExportRequest['status']): boolean` to delegate to
     `isTerminalExportStatus(status)`.
5. `server/src/regions/regions.controller.spec.ts` (NEW):
   - Isolated unit tests for `RegionsController`:
     - `list`: delegates to `regions.list()`, returning array of `RegionSummary`.
     - `findOne`: delegates to `regions.findBySlug(slug)`, returning `RegionSummary`.
     - exception handling: propagates errors from service correctly.
6. `server/src/metrics/metrics.controller.spec.ts` (NEW):
   - Isolated unit tests for `MetricsController`:
     - `getMetrics`: fetches metrics from `metrics.getMetrics()`, sets `Content-Type` header
       matching `metrics.contentType`, and calls `response.send(...)`.
7. `server/src/dashboards/dashboards.controller.spec.ts` (NEW):
   - Isolated unit tests for `DashboardsController`:
     - `list`: delegates to `dashboards.listViews(organization)`.
     - `get`: delegates to `dashboards.getView(organization, viewId)`.
     - `create`: delegates to `dashboards.createView(organization, body, idempotencyKey)`.
     - `update`: delegates to `dashboards.updateView(organization, viewId, body)`.
     - `archive`: delegates to `dashboards.archiveView(organization, viewId)`.
8. `server/src/analytics/analytics.controller.spec.ts` (NEW):
   - Isolated unit tests for `AnalyticsController`:
     - `listMetrics`: delegates to `analytics.listMetrics(organization)`.
     - `getMetric`: delegates to `analytics.getMetric(organization, params.metricId)`.
     - `listObservations`: delegates to `analytics.listObservations(organization, query)`.
     - `listAggregates`: delegates to `analytics.listAggregates(organization, query)`.
     - `getAggregateEvidence`: delegates to `analytics.getAggregateEvidence(organization, params.aggregateId)`.
9. `server/src/reports/reports.controller.spec.ts` (NEW):
   - Isolated unit tests for `ReportsController`:
     - `listReports`: delegates to `reports.listReports(organization)`.
     - `createReport`: delegates to `reports.createReport(organization, body, idempotencyKey)`.
     - `getReport`: delegates to `reports.getReport(organization, reportId)`.
     - `updateReport`: delegates to `reports.updateReport(organization, reportId, body)`.
     - `createRevision`: delegates to `reports.createRevision(organization, reportId, body, idempotencyKey)`.
     - `updateRevision`: delegates to `reports.updateRevision(organization, reportId, revisionId, body)`.
     - `submitRevisionForReview`: delegates to `reports.submitRevisionForReview(organization, reportId, revisionId, idempotencyKey)`.
     - `publishRevision`: delegates to `reports.publishRevision(organization, reportId, revisionId, idempotencyKey)`.
     - `revisionEvidence`: delegates to `reports.getRevisionEvidence(organization, reportId, revisionId)`.
     - `listExports`: delegates to `reports.listExports(organization)`.
     - `createExport`: delegates to `reports.createExport(organization, body, idempotencyKey)`.
     - `getExport`: delegates to `reports.getExport(organization, exportId)`.
     - `downloadExport`: delegates to `reports.downloadExport(organization, exportId)`.
     - `events`: tests SSE observable stream, initial progress event, polling interval, and termination on terminal export status.
10. `server/src/ingestion/ingestion.controller.spec.ts` (NEW):
    - Isolated unit tests for `IngestionController`:
      - `listDatasets`: delegates to `ingestion.listDatasets(organization)`.
      - `createDataset`: delegates to `ingestion.createDataset(organization, idempotencyKey, body)`.
      - `getDataset`: delegates to `ingestion.getDataset(organization, datasetId)`.
      - `updateDataset`: delegates to `ingestion.updateDataset(organization, datasetId, body)`.
      - `listVersions`: delegates to `ingestion.listVersions(organization, datasetId)`.
      - `createMapping`: delegates to `ingestion.createMapping(organization, datasetId, idempotencyKey, body)`.
      - `startRun`: delegates to `ingestion.startRun(organization, datasetId, idempotencyKey, body)`.
      - `getRun`: delegates to `ingestion.getRun(organization, runId)`.
      - `listIssues`: delegates to `ingestion.listIssues(organization, runId)`.
      - `cancelRun`: delegates to `ingestion.cancelRun(organization, runId)`.
      - `events`: tests SSE observable stream, initial progress event, polling interval, and termination on terminal ingestion state.
11. `docs/backend.md`:
    - Document canonical `TERMINAL_INGESTION_RUN_STATES` and `TERMINAL_EXPORT_STATUSES`.
    - Document unit test coverage across Regions, Metrics, Dashboards, Analytics, Reports, and Ingestion REST controllers.

## Expected impact

- `packages/shared/src/ingestion.ts`: exports `INGESTION_RUN_STATES`, `TERMINAL_INGESTION_RUN_STATES`, `TerminalIngestionRunState`, and `isTerminalIngestionRunState`.
- `server/src/ingestion/ingestion.controller.ts`: uses canonical `isTerminalIngestionRunState`.
- `packages/shared/src/reports.ts`: exports `EXPORT_STATUSES`, `TERMINAL_EXPORT_STATUSES`, `TerminalExportStatus`, and `isTerminalExportStatus`.
- `server/src/reports/reports.controller.ts`: uses canonical `isTerminalExportStatus`.
- 6 new controller unit test suites:
  - `server/src/regions/regions.controller.spec.ts`
  - `server/src/metrics/metrics.controller.spec.ts`
  - `server/src/dashboards/dashboards.controller.spec.ts`
  - `server/src/analytics/analytics.controller.spec.ts`
  - `server/src/reports/reports.controller.spec.ts`
  - `server/src/ingestion/ingestion.controller.spec.ts`
- `docs/backend.md`: updated with controller test suites and lifecycle state constants.
- Zero breaking contract changes (`npm run contracts:check`).

## Non-goals

- Altering route paths, HTTP verbs, or OpenAPI decorators.
- Modifying session authentication cookie flags or names.
- Changing SSE polling interval (1500ms) or streaming payload shape.

## Checks to run

```bash
npm run contracts:check
npm run build:shared
npm run test --workspace=@acres/server -- src/regions/regions.controller.spec.ts
npm run test --workspace=@acres/server -- src/metrics/metrics.controller.spec.ts
npm run test --workspace=@acres/server -- src/dashboards/dashboards.controller.spec.ts
npm run test --workspace=@acres/server -- src/analytics/analytics.controller.spec.ts
npm run test --workspace=@acres/server -- src/reports/reports.controller.spec.ts
npm run test --workspace=@acres/server -- src/ingestion/ingestion.controller.spec.ts
npm run test:server
npm run typecheck
npm run lint
npm run build
```

## SKILLS USED

- `api-design-principles`: REST controller contract conformity, status code semantics, and response envelopes.
- `architecture-patterns`: Clean separation between HTTP presentation layer and domain application services.
- `nestjs-best-practices`: Controller lifecycle, dependency injection mocking, and route decorator handling.
- `javascript-testing-patterns`: Isolated controller unit test suites with Jest mocks and RxJS observable testing.
- `requesting-code-review`: Structured peer review loop across newly implemented controller test suites.
- `receiving-code-review`: Technical evaluation of reviewer feedback.
- `caveman-commit`: Terse, conventional commit message on `main`.
