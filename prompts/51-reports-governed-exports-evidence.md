# 51 - Phase 10 Reports, Governed Exports, and Review Workflow Evidence

## Scope and why this is next

The committed `main` tip is `4dd9060` (`test(server): add phase 6 outbox and worker unit suites`).
Following the Phase 6 outbox and worker reconciliation evidence gate, the earliest unresolved exit gate in the target architecture build plan is Phase 10: Reports and exports (`docs/build-plan.md` §11).

As stated in `docs/build-plan.md` §11:
- "Phase 10 — reports and exports: Outcome/behavior: report drafts, immutable revisions, evidence-bound insights, review/publish permissions, asynchronous CSV and PDF exports, safe attachment download, and reproducibility."
- "Tests: draft/revision/publish permission matrix; immutable published revision; source-to-export lineage; formula fixtures; content disposition; Unicode/RTL/long text and page/row limits; tampered/expired links; renderer or storage failure; retry/idempotency/cancel/cleanup race; two-org and accessible authoring/browser journeys."
- "Exit: a permitted user publishes a reproducible revision and receives a secure, formula-safe export; unauthorized/stale/duplicate paths fail safely."

While `ReportsService` (1,148 lines in `server/src/reports/reports.service.ts`) implements the full domain and worker lifecycle, its unit test suite (`server/src/reports/reports.service.spec.ts`) only covers basic formula cell prefixing and bare PDF header string presence (41 lines). Dedicated, fail-closed unit and service-level test coverage is required to verify:

1. **Report & Revision Lifecycle State Machine**:
   - `createReport`: initializes report entity, creates initial draft revision (revision 1), links author, and enforces expected version.
   - `updateReport`: validates optimistic concurrency (`expectedVersion`), rejects stale updates with conflict exceptions, and updates report metadata.
   - `createRevision`: forks a new draft revision from the latest published revision or input, increments revision number, and resets reviewer/publisher timestamps.
   - `updateRevision`: updates draft title, summary, sections, insights, and evidence; enforces `expectedVersion` concurrency; strictly rejects mutation on `in_review`, `published`, or `superseded` revisions.

2. **Governed Review and Publishing Gate**:
   - `submitForReview`: enforces pre-conditions (revision must be `draft`, must contain at least 1 insight and at least 1 evidence item), transitions revision to `in_review`, and records `submittedForReviewAt`. Rejects submission when evidence or insight counts are zero.
   - `requestRevisionChanges`: allows reviewers/admins to transition `in_review` revisions back to `draft` with reviewer notes.
   - `publishRevision`: strictly freezes the revision state, sets `status: 'published'`, records publisher account ID and `publishedAt`, supersedes any previous published revisions for the report, and logs an immutable audit event (`report_published`).

3. **Evidence Lineage and Snapshot Immutability**:
   - Freezes aggregate evidence snapshots (`metricId`, `periodId`, `regionId`, `value`, `unit`, `observationCount`, `datasetVersion`, `dimensionHash`).
   - Freezes saved dashboard view snapshots (`viewName`, `filters`, `presentation`).
   - Verifies that subsequent changes to live datasets, aggregates, or dashboard views do not alter frozen revision evidence.

4. **Asynchronous Export Generation and Safe Download**:
   - `requestExport`: creates `ExportRequest`, validates format (`csv` or `pdf`), ensures revision is `published`, and appends an `export.requested` outbox event within the transaction. Rejects export requests for unpublished drafts.
   - `processExportJob`: renders deterministic CSV with formula escaping or valid structured PDF, uploads artifact via `ObjectStoragePort` (`OBJECT_STORAGE`), records byte size and SHA-256 checksum in `ExportArtifact`, and marks `ExportRequest` as `completed`.
   - `createDownloadUrl`: generates signed, short-lived download URLs for completed export artifacts; verifies organization ownership and returns `404` / `403` for non-existent, expired, or cross-tenant artifact requests.

5. **Documentation and Evidence Reconciliation**:
   - Update `docs/reports.md`, `docs/backend.md`, and `docs/build-plan.md` to record the completed Phase 10 verification and close the residual gap.

## Reference material read while preparing this prompt

- `AGENTS.md`, especially §§2, 2.1, 4–7, 8.2 Phase 10, 9, and 10.
- `docs/build-plan.md` §11 (Phase 10 outcome, test matrix, and exit gate).
- `docs/reports.md` (Schema, permissions, REST routes, worker, and residual gaps).
- `docs/backend.md` §3 (Reports and exports service implementation).
- `docs/security.md` §11 (Reports and exports threat boundary, TM-11, formula injection).
- `server/src/reports/reports.service.ts` and `server/src/reports/reports.repository.ts`.
- `server/src/reports/reports.controller.ts` and `server/src/reports/reports.module.ts`.
- `server/src/storage/storage.port.ts` and `server/src/outbox/outbox.service.ts`.
- `server/src/idempotency/idempotency.service.ts`.

There is no visual surface, reference comp, breakpoint, browser, Next.js, React,
Tailwind, shadcn, or motion work in scope. No design measurement applies.

## SKILLS USED

- `architecture-patterns` - maintain strict boundaries between domain services, repositories, ports, and worker execution.
- `nestjs-best-practices` - construct robust test modules with proper dependency injection and mock boundaries for ports (`OBJECT_STORAGE`, `OutboxService`, `IdempotencyService`, `ReportsRepository`).
- `postgres-best-practices` - verify transactional guarantees, RLS isolation, optimistic concurrency locking (`expectedVersion`), and immutable audit trail generation.
- `security-best-practices` - verify fail-closed error handling, CSV formula sanitization (`escapeFormula`), secure presigned download URLs, and tenant isolation.
- `security-threat-model` - reconcile Phase 10 threat mitigation evidence against TM-11 and formula injection in `docs/security.md`.
- `error-handling-patterns` - ensure deterministic error codes (`REPORT_NOT_FOUND`, `REVISION_NOT_FOUND`, `REVISION_CONFLICT`, `EXPORT_NOT_FOUND`), structured error logs, and graceful task completion.
- `javascript-testing-patterns` - author comprehensive, well-structured unit and integration specifications with Jest.
- `data-storytelling` - verify that report summaries, insights, and evidence lineage adhere to deterministic, evidence-bound representations.
- `requesting-code-review` - dispatch reviewer subagent with structured context and diff SHAs.
- `receiving-code-review` - evaluate review feedback with technical rigor.
- `caveman-commit` - format Conventional Commit message.

## Expected Impact

### Server Tests Added / Updated:
- `server/src/reports/reports.service.spec.ts` - comprehensive unit test suite covering the entire `ReportsService` method surface (lifecycle, reviews, publishing, evidence snapshots, export requests, worker rendering, and download authorization).

### Server Implementation Enhancements (if any needed):
- Refine error codes or state transitions in `ReportsService` if edge cases are surfaced during testing.

### Documentation Updates:
- `docs/reports.md` - record Phase 10 service unit and lifecycle evidence.
- `docs/build-plan.md` - record Phase 10 test evidence.
- `docs/backend.md` - record test coverage for reports module.

## Non-goals

- Modifying the client reports UI or Next.js components.
- Introducing AI draft generation (Phase 11A is already scoped and tested separately).
- Adding multi-tenant database migrations or modifying existing Prisma schema.
- Adding XLSX export format without explicit product approval.

## Checks to Run

1. `npm run typecheck` - build shared package and typecheck all three workspaces.
2. `npm run lint` - lint all three workspaces.
3. `npm run test --workspace=@acres/server` - execute all server Jest unit suites including the expanded `reports.service.spec.ts`.
4. `npm run test:server` - execute server e2e suite.
5. `npm run ops:check` - execute production template, secret, Docker runtime, dependency, and readiness checks.
6. `git diff --check` - verify no whitespace issues or unresolved merge artifacts.
