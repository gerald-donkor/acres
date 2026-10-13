# Prompt 361 — Real End-to-End Data Journey Acceptance on PostgreSQL/PostGIS

## Scope and why next

Baseline `0e1be08` on `main`. Prompts 358–360 implemented tenant audit history, audit failure acceptance, and closed the global maintenance telemetry boundary.
The next dependency-safe milestone identified in `docs/project-status.md` §2 is:
"Prove the real end-to-end data journey on the release candidate. Use a licensed, reviewed geography selection and representative accepted source files; run upload → actual scanner/storage/queue → mapping → immutable publication → analytics → saved view → report review/publish → CSV/PDF attachment download. Include a second tenant and analyst/viewer denials. Acceptance requires reproducible lineage and no partial publication. Existing client/e2e/product-journeys.spec.ts and client/e2e/multi-tenant-isolation.spec.ts include mocked summaries and intercepted product responses; their historical passes cannot prove this whole live pipeline. Repair defects found, rather than predeclaring it done."

This prompt establishes comprehensive, authoritative live-pipeline acceptance in `server/test/data-journey.e2e-spec.ts` executed against the real migrated `acres_test` PostgreSQL/PostGIS database under forced RLS.

The user explicitly instructed: "after you are done writing the prompt, just implement" followed by "continue", authorizing immediate execution after writing and re-reading this prompt without requesting interactive confirmation.

## Reference material

Read:
- `AGENTS.md`
- `docs/project-status.md` (remaining engineering & acceptance work §2)
- `docs/build-plan.md` (Phase 6, 7, 8, 9, 10, 12 and sequence gates)
- `docs/backend.md` (route inventory, envelopes, RLS, storage/queue/worker, and testing records)
- `docs/ingestion.md` (geography matching, parsing, and publication flow)
- `docs/analytics.md` (metrics, observations, aggregates, and lineage)
- `docs/dashboards.md` (saved dashboard views)
- `docs/reports.md` (governed report lifecycle, evidence freezing, and export rendering)
- `docs/security.md` (tenant boundaries and role capabilities)

Inspect:
- `server/test/helpers/real-db-test-app.ts` (test application initialization and table truncation)
- `server/test/database.e2e-spec.ts` (real-database test patterns, CSRF, and tenant agents)
- `server/test/geography-database.e2e-spec.ts` (geography setup and PostGIS verification)
- `server/src/ingestion/ingestion-processor.service.ts` (mapping validation and publication)
- `server/src/analytics/analytics.service.ts` (metrics, observations, aggregates, and lineage)
- `server/src/dashboards/dashboards.service.ts` (dashboard view persistence)
- `server/src/reports/reports.service.ts` (report authoring, review, publication, export processing)
- `server/src/uploads/uploads.service.ts` (upload initiation, checksum and byte count completion)

## Measurements and verification procedures

1. **Storage and test infrastructure harness**:
   - Provide an in-memory buffer storage double for `OBJECT_STORAGE` conforming to `ObjectStoragePort` (`presignPut`, `presignGet`, `putBuffer`, `getBuffer`, `stat`, `delete`, `readiness`).
   - Store real CSV bytes (`region,yield,year,crop\nUS-CA,145.2,2026,corn\n`) with deterministic SHA-256 and byte counts.
2. **Geography baseline setup**:
   - Seed a global `RegionSource`, `Region` (California, `US-CA`), and `RegionCode` (`ISO-3166-2`, `US-CA`, normalized `us-ca`) with PostGIS polygon geometry.
3. **Multi-tenant and multi-role setup**:
   - Organization A ("Agro Alpha") with Owner, Analyst, and Viewer accounts.
   - Organization B ("Beta Bio") with Owner account.
4. **End-to-end data pipeline execution**:
   - Step 1 (Upload): Org A Owner initiates upload via `POST /api/v1/uploads`, puts CSV buffer into storage, and completes upload via `POST /api/v1/uploads/:id/complete` verifying checksum and byte count.
   - Step 2 (Dataset & Mapping): Org A Owner creates dataset via `POST /api/v1/datasets`, configures mapping via `POST /api/v1/datasets/:id/mappings` mapping `region` to `RegionCode` and `yield` to numeric metric `crop_yield` (sum aggregation, year period).
   - Step 3 (Ingestion & Publication): Org A Owner queues ingestion run via `POST /api/v1/datasets/:id/ingestion-runs`. Execute `IngestionProcessorService.processRun(runId)` against real database. Verify run reaches `published` state, immutable `DatasetVersion` is published, `MetricDefinition` is created, normalized `MetricObservation` is inserted, deterministic `MetricAggregate` is computed, and `MetricAggregateLineage` connects aggregate to observation and dataset version.
   - Step 4 (Analytics Reads): Query `GET /api/v1/analytics/metrics`, `GET /api/v1/analytics/observations`, `GET /api/v1/analytics/aggregates`, and `GET /api/v1/analytics/aggregates/:id/evidence`. Verify accurate projection of values and lineage.
   - Step 5 (Saved Dashboard View): Org A Owner creates analytical view via `POST /api/v1/dashboard-views` and verifies listing via `GET /api/v1/dashboard-views`.
   - Step 6 (Governed Report Lifecycle): Org A Owner creates draft report via `POST /api/v1/reports`, freezes aggregate evidence via `POST /api/v1/reports/:id/revisions`, submits for review via `POST /api/v1/reports/:id/revisions/:revId/submit-review`, and publishes revision via `POST /api/v1/reports/:id/revisions/:revId/publish`.
   - Step 7 (Export & Download): Org A Owner requests CSV export via `POST /api/v1/exports`. Process export via `ReportsService.processExport(exportRequestId)`. Verify artifact buffer is generated and stored, and download URL is generated via `GET /api/v1/exports/:id/download`.
   - Step 8 (Cross-Tenant Isolation): Org B Owner attempts to access Org A's dataset, dataset versions, observations, aggregates, dashboard views, reports, and export downloads. Verify all return 404 NOT_FOUND or empty tenant-scoped lists under RLS.
   - Step 9 (Role-Based Access Control): Org A Viewer attempts write operations (`POST /api/v1/uploads`, `POST /api/v1/datasets`, `POST /api/v1/datasets/:id/mappings`, `POST /api/v1/datasets/:id/ingestion-runs`, `POST /api/v1/reports`, `POST /api/v1/exports`) and receives 403 FORBIDDEN. Org A Viewer successfully reads published analytics, dashboard views, and reports. Org A Analyst performs dataset, upload, and report operations but receives 403 FORBIDDEN when attempting organization administrative actions.
   - Step 10 (Partial Publication Defense): Provide invalid CSV with unmatched region reference. Run ingestion processor. Verify run ends in `validation_failed` with persisted validation issues, and zero partial `DatasetVersion`, observations, or aggregates are created.

## Expected impact and non-goals

- **Impact**:
  - Adds `server/test/data-journey.e2e-spec.ts`.
  - Proves the full end-to-end data journey across PostgreSQL/PostGIS, RLS, auth, ingestion, analytics, dashboards, reports, exports, multi-tenant isolation, and RBAC permissions.
  - Updates `docs/backend.md` and `docs/project-status.md` with verification results.
- **Non-goals**:
  - No database schema migrations or changes to existing production contracts.
  - No changes to client UI components or frontend routing.
  - No modification to production deployment configurations.

## Checks to run

- `npm run test:server -- server/test/data-journey.e2e-spec.ts`
- `npm run contracts:check`
- `npm run lint`
- `npm run typecheck`
- `npm run test:server`

Owning doc: `docs/backend.md` and `docs/project-status.md`.

## SKILLS USED

- e2e-testing-patterns — design deterministic real-database end-to-end journey tests.
- javascript-testing-patterns — Jest E2E structuring, Supertest assertions, and async lifecycle.
- nestjs-best-practices — Nest testing module providers, controllers, and dependency injection.
- architecture-patterns — verify cross-module cohesion and strict tenant boundaries.
- auth-implementation-patterns — session tokens, CSRF protection, and RBAC permission enforcement.
- postgres-best-practices — verify transactional integrity, RLS, and PostGIS geometry.
- requesting-code-review — dispatch reviewer subagent after self-verification.
- receiving-code-review — rigorously evaluate feedback and make technical fixes.
- caveman-commit — generate concise, conventional commit message.
