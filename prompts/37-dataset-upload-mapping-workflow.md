# 37 - dataset upload and mapping workflow

## Scope, and why it is next

The committed repository is on `main` at `f8b573a` (`feat(api): stream export
and ingestion progress via SSE`). `docs/operations.md` records Phase 12D as
implemented, and prompt 36 has closed the export/ingestion SSE residual gap.

The next ordered top-level target in `docs/build-plan.md` remains Phase 11,
optional local AI, but Phase 11 is explicitly blocked on a separate
user-approved model, license, quality threshold, and operating-profile decision.
Do not start Phase 11 and do not add AI packages, schemas, prompts, model
adapters, generation metadata, or AI UI.

The next dependency-safe product gap is the authenticated dataset upload,
mapping, and ingestion workflow. The backend already exposes uploads, datasets,
column mappings, ingestion runs, ingestion issues, dataset versions, and SSE
progress streams. The authenticated client has dashboards and reports, but the
app shell still marks "Data Sets" unavailable and `docs/ingestion.md` records
"No browser upload/mapping UI exists." Build that browser workflow now.

This is primarily a Phase 7 client activation slice over the already-built
Phase 6/7 backend. It must not change parser semantics, queue semantics, RLS,
analytics calculations, report/export behavior, launch-readiness status, or the
no-AI posture.

## Reference material read while preparing this prompt

Repository and workflow authority:

- `AGENTS.md` §§2, 2.1, phase-control commands, §§5-10: prompt-first workflow,
  phase resolution, skill loading, verification, review, documentation, commit
  rules, product constraints, and no-fabrication rules.
- `docs/build-plan.md` §§1, 7-14: phase execution rules, Phase 6 upload/job
  foundation, Phase 7 geography/ingestion target, Phase 10 reports state,
  Phase 11 AI gate, Phase 12 launch-hardening state, and sequence gates.
- `docs/ingestion.md`: implemented geography/ingestion schema, REST routes,
  parser behavior, worker publication flow, SSE endpoint, verification, and the
  residual browser upload/mapping UI gap.
- `docs/backend.md` §§2-3, 15, 15 Phase 7A: workspace scripts, API route map,
  upload foundation, ingestion foundation, SSE envelope bypass, storage/queue
  constraints, and contract generator behavior.
- `docs/authenticated-app.md`: same-origin Next API bridge, typed server/browser
  API clients, active organization preference, app-shell navigation, responsive
  constraints, and existing SSE fetch-stream helper.
- `docs/product.md` §§2-4, 6-7: fixed roles/permissions, upload/validate dataset
  journey, publish immutable dataset version journey, job progress expectations,
  V1 boundary, and open operator limits.
- `docs/system-architecture.md` §§3.4, 4, 6, 9, 12-13: upload/ingestion
  sequence, API/worker/runtime topology, REST/GraphQL/SSE matrix, upload and
  ingestion state machine, current implementation state, and remaining browser
  mapping UI gap.
- `docs/security.md` §§6-9: current SSE controls, tenant isolation threats,
  upload/parser/object/queue acceptance paths, no secret/client-bundle rules,
  and launch security acceptance suite.
- `docs/api/contracts.md`: current route matrix for uploads, datasets, mappings,
  ingestion runs, ingestion issues, and ingestion SSE.
- `docs/operations.md`: Phase 12D status, deterministic no-AI launch posture,
  CI/E2E verification expectations, and unchanged operator-owned gates.

Current implementation inspected:

- `client/components/acres/app/app-shell.tsx`: app shell navigation still marks
  "Data Sets" unavailable, and `activeSection` only supports workspace,
  dashboards, and reports.
- `client/lib/api/server.ts`: server API helpers include dashboards, reports,
  and exports but not datasets/uploads/ingestion issues/versions.
- `client/lib/api/browser.ts`: browser helpers include auth, orgs, dashboard
  views, reports, exports, `getIngestionRun`, and
  `streamIngestionRunProgress`; it lacks upload, dataset, mapping, run-create,
  issue-list, and version-list helpers.
- `client/lib/api/sse.ts`: fetch-based SSE helper preserves
  `x-acres-organization-id`; use it for ingestion progress rather than native
  `EventSource`.
- `server/src/uploads/uploads.controller.ts`: upload initiate/complete/get/
  cancel/download/events route shapes and permissions.
- `server/src/uploads/dto/*.ts`: accepted media types, byte limits, checksum
  validation, and completion payload shape.
- `server/src/ingestion/ingestion.controller.ts`: dataset, mapping,
  ingestion-run, issue, version, cancel, and SSE route shapes and permissions.
- `server/src/ingestion/dto/*.ts`: create dataset, update dataset, create
  mapping, and start ingestion DTO shapes.
- `packages/shared/src/ingestion.ts`: current shared ingestion run type only;
  dataset/upload/mapping/version/issue client types may need to be added.
- `client/components/ui/`: installed Base UI shadcn primitives include
  `Attachment`, `Alert`, `Badge`, `Button`, `Card`, `Empty`, `Field`,
  `Input`, `NativeSelect`, `Progress`, `Separator`, `Spinner`, `Table`,
  `Textarea`, and related controls.
- `client/e2e/product-journeys.spec.ts` and `client/e2e/helpers.ts`: existing
  E2E patterns for registering, creating an organization, route interception,
  mocked product data, and responsive assertions.
- `server/src/contracts/generate-contracts.ts`, `docs/api/contracts.md`, and
  `docs/api/openapi.json`: contracts already include the dataset/upload/
  ingestion route matrix; regenerate only if type/schema changes require it.

Skills loaded while preparing this prompt:

- `.agents/skills/frontend-design/SKILL.md`
- `.agents/skills/tailwind-design-system/SKILL.md`
- `.agents/skills/tailwind-4-docs/SKILL.md`
- `.agents/skills/tailwind-4-docs/references/gotchas.md`
- `.agents/skills/tailwind-4-docs/references/engineering-playbook.md`
- `.agents/skills/shadcn/SKILL.md`
- `.agents/skills/vercel-react-best-practices/SKILL.md`
- `.agents/skills/accessibility-compliance/SKILL.md`
- `.agents/skills/web-design-guidelines/SKILL.md`
- `.agents/skills/api-design-principles/SKILL.md`
- `.agents/skills/auth-implementation-patterns/SKILL.md`
- `.agents/skills/security-best-practices/SKILL.md`
- `.agents/skills/security-best-practices/references/javascript-typescript-nextjs-web-server-security.md`
- `.agents/skills/security-best-practices/references/javascript-typescript-react-web-frontend-security.md`
- `.agents/skills/error-handling-patterns/SKILL.md`
- `.agents/skills/javascript-testing-patterns/SKILL.md`
- `.agents/skills/e2e-testing-patterns/SKILL.md`
- `.agents/skills/playwright/SKILL.md`
- `.agents/skills/requesting-code-review/SKILL.md`
- `.agents/skills/receiving-code-review/SKILL.md`
- `.agents/skills/caveman-commit/SKILL.md`

Tailwind v4 official docs snapshot is still missing locally. Use only existing
Acres tokens/utilities and the limited Tailwind fallback references above. If
implementation needs a new Tailwind utility, variant, token, directive, or v4
API that is not already used in this repo, stop and get the official docs
snapshot initialized before proceeding.

## SKILLS USED

- `frontend-design` - design the dataset workflow as a quiet operational tool,
  not a marketing or decorative surface.
- `tailwind-design-system` and `tailwind-4-docs` - stay inside existing Acres
  tokens/classes and Tailwind v4 CSS-first constraints.
- `shadcn` - compose local Base UI shadcn primitives and read each component
  before importing it; do not assume Radix props.
- `vercel-react-best-practices` - keep server reads server-side, avoid client
  waterfalls, avoid broad client bundles, and clean up progress subscriptions.
- `accessibility-compliance` - make upload, mapping, validation issues, and live
  run progress keyboard/screen-reader accessible.
- `web-design-guidelines` - audit the finished UI for practical interface
  issues, responsive overflow, focus, and accessible names.
- `api-design-principles` - consume the existing resource-oriented REST surface
  without inventing alternate client-only semantics.
- `auth-implementation-patterns` - preserve session, selected-organization,
  role, CSRF, idempotency, and server-side permission boundaries.
- `security-best-practices` - keep files, checksums, object URLs, organization
  headers, and error details safe in browser/server code.
- `error-handling-patterns` - provide recoverable upload/scan/validation/stream
  states and clear fallback behavior.
- `javascript-testing-patterns` - add focused unit/integration tests for typed
  helpers, mapping payloads, and UI state transitions.
- `e2e-testing-patterns` and `playwright` - verify the browser dataset journey
  with stable role/label selectors and responsive assertions.
- `requesting-code-review` - dispatch the mandatory reviewer subagent after
  self-verification.
- `receiving-code-review` - verify reviewer feedback against codebase reality
  before applying changes.
- `caveman-commit` - write the final Conventional Commit message.

Conditional skills:

- `nestjs-best-practices` is required only if implementation changes
  `server/` beyond generated contracts or test fixtures.
- `postgres-best-practices` and `sql-optimization-patterns` are required only
  if implementation changes schema, migrations, RLS, persistence queries, or
  measured query plans. This prompt should not require a migration.
- `openapi-spec-generation` is required only if server decorators/contracts are
  changed or contract drift appears.
- `security-threat-model` is required only if a new trust boundary is created.
  A client UI over existing upload/object/ingestion boundaries should update
  current docs without changing the threat model boundary.
- `prometheus-configuration` is required only if metrics route groups, labels,
  alerts, or operational telemetry change. They should not change here.

## Required verification before implementation

Before writing code, re-read `AGENTS.md`, this prompt, every owning doc listed
above, and every skill named in `SKILLS USED`. Re-check the latest local files;
do not rely on the preparation notes if code has changed.

Verify framework and component APIs locally before coding:

- Next route, form, `headers()`, `cookies()`, Server Component, and Route
  Handler behavior from the relevant files under `node_modules/next/dist/docs/`.
  Do not use remembered Next APIs.
- Existing local shadcn components from `client/components/ui/` before importing
  them. This repo uses `base-nova` on `@base-ui/react`.
- Existing Acres tokens in `client/app/globals.css` and design-system records
  before any styling change.

Do not create or edit implementation files until this prompt is approved with
`y` / `Y`.

## Target implementation details

### 1. Activate the Data Sets app section

Update the authenticated app shell so "Data Sets" is an active navigation item:

- Add `activeSection: "datasets"` support to `AppShell`.
- Route "Data Sets" to `/app/datasets` for roles that can see it.
- Preserve role visibility from the product contract:
  - owners/admins/analysts can manage uploads, datasets, mappings, and runs;
  - viewers can read dataset and ingestion status only.
- Do not expose disabled creation controls to viewers as fake actions; use
  readable state instead.
- Keep the shell density and visual language aligned with dashboards/reports.

### 2. Add typed shared/client contracts for upload and ingestion workflow

Add or extend shared TypeScript types in `packages/shared/src/` where needed so
client and server helpers do not use ad hoc `unknown` or duplicated shapes.
Represent only the shapes already exposed by the existing API:

- `UploadStatus`, `InitiateUploadInput`, `InitiateUploadResult`,
  `CompleteUploadInput`, and `UploadDownload`.
- `DatasetSummary`, `DatasetVersionSummary`, `ColumnMappingSummary`,
  `ValidationIssueSummary`, `CreateDatasetInput`, `UpdateDatasetInput`,
  `CreateMappingInput`, and `StartIngestionRunInput`.
- Reuse/strengthen `IngestionRunSummary` and terminal state typing as needed.

Keep runtime validation in server DTOs. Shared package types are not security
boundaries.

### 3. Add server and browser API helpers

Extend `client/lib/api/server.ts` with authenticated server reads:

- `listDatasets(organizationId)`
- `getDataset(organizationId, datasetId)`
- `listDatasetVersions(organizationId, datasetId)`
- `listIngestionIssues(organizationId, runId)`

Extend `client/lib/api/browser.ts` with browser commands/reads:

- `initiateUpload(organizationId, input)`
- `completeUpload(organizationId, uploadId, input)`
- `getUpload(organizationId, uploadId)`
- `cancelUpload(organizationId, uploadId)`
- `getUploadDownload(organizationId, uploadId)`
- `createDataset(organizationId, input)`
- `updateDataset(organizationId, datasetId, input)`
- `createMapping(organizationId, datasetId, input)`
- `startIngestionRun(organizationId, datasetId, input)`
- `listIngestionIssues(organizationId, runId)`
- `listDatasetVersions(organizationId, datasetId)`

Requirements:

- Use same-origin `/api/v1` browser requests; do not expose `ACRES_API_ORIGIN`.
- Use CSRF and idempotency keys for all state-changing routes that currently
  require them.
- Preserve `x-acres-organization-id` for every scoped read, mutation, and SSE
  stream.
- Do not store upload bytes, checksums, object URLs, signed URLs, raw file
  contents, sessions, CSRF tokens, or organization secrets in localStorage or
  sessionStorage.
- Do not introduce a third-party upload library unless local code proves the
  native browser APIs are insufficient.

### 4. Implement `/app/datasets`

Create the authenticated dataset workspace:

- Server-load account, organizations, active organization, dataset list, and
  latest dataset/version state using the existing protected app shell pattern.
- Render a dataset list with latest version status, version number, publication
  timestamp, source summary hints, and dataset state.
- Render an empty state that directs owners/admins/analysts to create and upload
  a dataset. Viewers should see a read-only empty state.
- Provide a compact create-dataset form for owners/admins/analysts.
- Use existing app-shell cards/tables/alerts/badges/progress primitives; no
  nested cards, no marketing hero, no decorative backgrounds.
- Keep mobile at 375px usable without horizontal overflow and with 44px touch
  targets.

### 5. Add a dataset detail workflow

Add `/app/datasets/[datasetId]` for one dataset:

- Server-load dataset and versions.
- Show immutable published versions, source summary, checksum where available,
  and clear "no versions yet" state.
- For owners/admins/analysts, expose the ingestion workflow:
  1. choose a CSV, XLSX, GeoJSON, or JSON file;
  2. calculate SHA-256 in the browser with Web Crypto before initiate/complete;
  3. initiate upload with filename, media type, byte count, checksum;
  4. upload bytes to the returned signed URL using the returned method;
  5. complete upload with byte count and checksum;
  6. create a column mapping;
  7. start an ingestion run;
  8. stream progress with `streamIngestionRunProgress`;
  9. show validation issues and final version state.
- For viewers, show status and versions only.

The mapping UI must be practical but constrained:

- Accept a region column or region-code column.
- Accept one or more metric mappings with column, key, label, value type,
  unit/canonical unit where applicable, aggregation, optional period column, and
  optional dimension columns if the current backend accepts them.
- Read the actual `CreateMappingDto` and ingestion processor expectations before
  finalizing the payload shape. If the backend DTO type and documented metrics
  example disagree, reconcile with code and update docs accordingly.
- Do not infer columns by parsing uploaded source bytes in the browser unless a
  small safe preview already exists in API output. A manual mapping form is
  acceptable for this slice.

Progress and failure states:

- Show upload progress for the direct object upload when the browser can observe
  it. If native `fetch()` cannot expose granular upload progress in this app's
  browser targets, use a clear pending state rather than fake percentages.
- Stream ingestion progress using the existing fetch-based SSE helper, not
  native `EventSource`.
- Abort upload/stream work on unmount, route change, organization change, or
  explicit cancel.
- Provide retry guidance for recoverable client/API errors without hiding stable
  request IDs from API errors.
- Use `aria-live="polite"` for progress and terminal state announcements.
- Keep focus stable; move focus to the first actionable error summary after
  failed submit.

### 6. Keep backend changes narrow

Prefer client/shared changes only. Change `server/` only if implementation
finds a real blocker in the existing API surface, such as:

- missing or incorrect OpenAPI schemas for already-existing routes;
- DTO/shared type mismatch that prevents truthful client typing;
- missing envelope schema for fields already returned by services;
- a permission/CSRF/idempotency inconsistency exposed by tests.

Do not add a migration, new parser semantics, new storage adapter, new queue
behavior, or new analytics normalization. Do not invent a browser-only API shape
that bypasses the existing REST surface.

### 7. Contracts and docs

Regenerate contracts only if code changes affect generated artifacts:

- `docs/api/contracts.md`
- `docs/api/openapi.json`
- `docs/api/schema.graphql` only if GraphQL changes, which should not happen
  here.

Update owning docs:

- `docs/ingestion.md`: record the new browser dataset/upload/mapping workflow,
  role behavior, upload checksum flow, ingestion progress UI, validation issue
  display, tests, and remaining gaps.
- `docs/authenticated-app.md`: record `/app/datasets`, navigation activation,
  server/browser helper additions, and responsive/accessibility behavior.
- `docs/backend.md`: update shared/client route-helper or route-map notes only
  if the implementation changes those records.
- `docs/product.md`: update the implemented-state wording for the upload/
  validate/publish dataset journey if the doc currently describes it as target
  only.
- `docs/security.md`: update current evidence for browser upload/object/
  ingestion entry points if needed, without claiming launch readiness.
- `docs/operations.md`: do not change unless verification or runbook wording
  materially changes. Launch readiness remains fail-closed.

## Tests to add or update

Unit/client tests:

- Browser API helper tests for upload initiate/complete, dataset create/update,
  mapping create, ingestion run start, issue list, version list, CSRF reset on
  failures, idempotency headers, and organization header preservation.
- A focused Web Crypto checksum helper test using deterministic small bytes.
- UI/component tests if the existing client test harness supports them without
  expanding infrastructure; otherwise cover through Playwright.

Server tests:

- Add or update server e2e only if backend changes occur, or if the current API
  lacks coverage for a route now relied on by the browser workflow.
- Preserve cross-tenant negative behavior for upload/dataset/mapping/run/status
  reads and commands.

Playwright E2E:

- Owner/admin/analyst can navigate to Data Sets, create a dataset, select a
  small deterministic fixture file, initiate/upload/complete it through mocked
  or local route responses, create a mapping, start an ingestion run, observe
  progress to a terminal state, and see validation issues or published version
  state.
- Viewer can navigate to Data Sets and read datasets/versions but cannot see or
  activate create/upload/mapping/run controls.
- Organization switching does not leak prior-organization dataset state.
- 375/800/1280 viewport checks have no horizontal overflow; interactive
  controls retain at least 44px targets; keyboard tab order follows visual
  order; progress updates are announced.

If the current local Garage/Valkey/ClamAV dependencies cannot run deterministically
in the E2E environment, use targeted route interception for the browser journey
and keep real API coverage at the server test layer. Do not add arbitrary sleeps.

## Checks to run

Run the standard repository verification after implementation and fixes:

```bash
git diff --check
npm run lint
npm run typecheck
npm run build
npm run contracts:check
npm run test:server
npm run test:client:e2e
npm run ops:check
```

If database-backed tests fail because the local database is behind, use the
documented migrator deploy procedure from `docs/backend.md` and quote the real
output. Do not change migrations without re-running migration status and the
affected real-database tests.

For visual/browser verification, run the app through the existing Playwright
test server flow and capture responsive evidence if a UI regression is suspected.
Do not leave dev server sessions running when the implementation is complete.

## Review and commit

After self-verification:

1. Inspect the final diff and ensure no unrelated files were changed.
2. Use `requesting-code-review` with a reviewer subagent. Provide this prompt
   path, base/head SHAs, files changed, exact checks run, role/permission
   behavior, upload checksum flow, direct object upload behavior, and SSE
   progress behavior.
3. Use `receiving-code-review` to verify feedback before changing code. Fix
   valid issues and re-run affected checks.
4. Re-review if feedback causes architectural, API, security, backend, or
   substantial UI changes.
5. Use `caveman-commit` for the final local commit message and commit to
   `main`. Do not push.

## Non-goals

- No Phase 11 optional AI implementation, AI package, model, prompt,
  generation metadata, evaluation, or AI UI.
- No production deployment, host/provider selection, launch-readiness approval,
  or operator secret/evidence values.
- No parser semantic changes, browser-side source parsing, automatic fuzzy
  mapping, or unapproved data-provider connector.
- No schema migration unless a real blocker is discovered and justified.
- No analytics calculation changes, dashboard query changes, report/export
  behavior changes, public sharing, collaboration, billing, or member-admin UI.
- No native `EventSource` path that drops the active organization header.
- No fake upload/progress percentages, fake dataset values, or invented
  geography/metric observations.
