# Reports and governed exports

Status: Phase 10 implemented from `prompts/31-reports-exports.md`. This is the
implemented-state record for report drafts, immutable published revisions,
frozen evidence links, asynchronous CSV/PDF export requests, export artifacts,
and the authenticated reports UI.

## Schema and permissions

Migration `20260824223000_reports_exports` adds `Report`, `ReportRevision`,
`ReportInsight`, `ReportEvidence`, `ExportRequest`, and `ExportArtifact`.
Every tenant-owned row carries `organization_id`, has forced RLS, and uses the
existing transaction-local organization context. Worker policies are limited to
the export rows/artifacts it needs to process queued jobs.

Published report revisions are immutable. Publishing requires at least one
insight and at least one evidence link, records the publisher/timestamp,
supersedes earlier published revisions for the same report, and writes a
`report_published` audit event. Draft metadata and draft revision edits use
expected-version conflict detection on the report row.

Evidence currently supports two references:

- `aggregate`: stores metric, period, region, value, unit, calculation,
  definition version, observation count, dataset version, and dimension hash
  snapshot data.
- `dashboard_view`: stores the saved view name, filters, presentation, status,
  owner, and update timestamp.

The organization permission map now includes `reports.read`, `reports.create`,
`reports.update`, `reports.publish`, `exports.create`, and `exports.read`.
Owners inherit all permissions. Admins can publish. Analysts can draft, update,
read, and request exports but cannot publish. Viewers can read published report
state and export status/download metadata only; draft reports and draft
revisions are filtered out for viewer reads.

## REST API

All routes are `/api/v1`, session-authenticated, selected-organization scoped,
and return the standard envelope.

| method | path | permission | notes |
| --- | --- | --- | --- |
| `GET` | `/reports` | `reports.read` | active reports for the organization |
| `POST` | `/reports` | `reports.create` | CSRF and `Idempotency-Key`; creates report plus revision 1 |
| `GET` | `/reports/:reportId` | `reports.read` | latest revision and evidence |
| `PATCH` | `/reports/:reportId` | `reports.update` | metadata update with expected version |
| `POST` | `/reports/:reportId/revisions` | `reports.update` | creates the next draft revision from supplied content or the latest published revision |
| `PATCH` | `/reports/:reportId/revisions/:revisionId` | `reports.update` | draft content update with expected version; published/superseded revisions reject mutation |
| `POST` | `/reports/:reportId/revisions/:revisionId/submit-review` | `reports.update` | CSRF and `Idempotency-Key`; transitions draft revision to in_review status once insight/evidence requirements pass |
| `POST` | `/reports/:reportId/revisions/:revisionId/publish` | `reports.publish` | CSRF and `Idempotency-Key`; freezes the revision |
| `GET` | `/reports/:reportId/revisions/:revisionId/evidence` | `reports.read` | requested revision evidence, not only the latest revision |
| `GET` | `/exports` | `exports.read` | recent export requests |
| `POST` | `/exports` | `exports.create` | CSRF and `Idempotency-Key`; appends an `export.requested` outbox event |
| `GET` | `/exports/:exportId` | `exports.read` | export status and artifact metadata |
| `GET` | `/exports/:exportId/download` | `exports.read` | short-lived attachment URL for completed artifacts |

`docs/api/contracts.md` and `docs/api/openapi.json` were regenerated after the
routes landed.

## Worker and artifacts

The outbox payload for `export.requested` carries only the export request ID.
The worker re-reads PostgreSQL state under worker-scoped policies, renders the
requested published revision, writes bytes through the object-storage port, and
records checksum, media type, filename, byte count, and expiry metadata before
marking the request complete.

CSV output quotes every cell and escapes spreadsheet formula-leading values
(`=`, `+`, `-`, `@`, tab, carriage return) by prefixing a single quote. PDF
output is generated from deterministic text content with escaped PDF strings,
a minimal xref table, and `startxref`; no HTML, SVG, script, or
user-controlled object path is executed. Object storage upload checksums are
sent to S3-compatible storage as base64 SHA-256 while the Acres metadata rows
retain the hex digest used elsewhere in the product.

## Client UI

`/app/reports` is part of the authenticated app shell and appears in the main
navigation. It lists reports, shows export status, and links to
`/app/reports/new` for members who can create drafts. Report detail pages at
`/app/reports/[reportId]` expose a structured status and readiness panel,
readiness blockers, draft editing, explicit "Submit for review" action, a
dedicated review panel for `in_review` revisions with claims and structured
evidence snapshots, publish actions for admins/owners, clear awaiting-publication
status for analysts, CSV/PDF export requests on published revisions, new draft
revision creation from a published revision, and download actions for completed
artifacts.

The UI uses the existing same-origin API bridge, typed server/browser API
helpers (`submitReportRevisionForReview`), `Field`/`Alert`/`Table`/`Badge`/`Button`
primitives, visible pending and error states, `aria-live="polite"` status
announcements, and the active organization header already established in
Phase 5. It does not invent sample analytics; a real aggregate ID is required
to attach aggregate evidence.

## Export progress streaming

Export status progress is delivered via Server-Sent Events (SSE) at
`GET /api/v1/exports/:exportId/events`:
- Requires an authenticated session and `exports.read` permission within the active
  organization context.
- Not-found and forbidden checks occur during endpoint setup prior to opening the stream.
- The stream emits `export.progress` events at a 1500ms interval (`timer(0, 1500)`),
  terminating immediately once the export reaches a terminal status (`succeeded`,
  `failed`, or `cancelled`).
- Event IDs use low-risk composite identifiers (`${exportId}:${status}:${finishedAt ?? updatedAt}`).
- The client consumes the stream using `fetch()` and `ReadableStream` (preserving
  the `x-acres-organization-id` header), updating the `ExportStatus` component live,
  announcing terminal states via `aria-live="polite"`, and falling back to direct GET
  polling if stream connection fails.

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
├ ƒ /app/reports
├ ƒ /app/reports/[reportId]
├ ƒ /app/reports/new
✔ Generated Prisma Client (7.9.1)

npm run test:server
Test Suites: 1 passed, 1 total (api.e2e-spec.ts)
Tests: 66 passed, 66 total

npm run test:client:e2e
12 passed (tests/ unit suite)

npm run contracts:check
✔ Generated Prisma Client (7.9.1)
```

Local migration deploy was run against the `acres_test` database with the
migrator role after the new migration was added.

## Residual gaps

- Generated PDFs are intentionally simple deterministic documents, not
  comp-designed presentation exports.
- Sharing, collaboration, public links, scheduled exports, AI-assisted drafting,
  and retention/deletion policy are still future phases or open decisions.
