# 31 - reports and exports

## Scope, and why it is next

The committed repository is on `main` at `a3de483` (`feat: add dashboard
views`). `docs/dashboards.md` records Phase 9 as implemented and explicitly
says reports, exports, sharing, collaboration, and AI remain future work. The
earliest ordered target whose dependencies are now committed is therefore
Phase 10, "reports and exports."

Implement Phase 10 as the governed publication and artifact-generation layer
for Acres:

- add organization-scoped report, report revision, report insight, report
  evidence, and export request/artifact schema;
- create report drafts from existing dashboard/analytics evidence without
  copying opaque metric values away from their lineage;
- support immutable published revisions with explicit review/publish
  permissions and stale-write/version conflict handling;
- add asynchronous CSV and PDF exports tied to report revisions or selected
  evidence, with XLSX deliberately out of scope unless the user explicitly
  approves it before implementation;
- generate export artifacts through the existing worker/storage foundation,
  with safe attachment download and reproducibility from stored evidence;
- add accessible authenticated UI for report authoring, review, publishing,
  export request/status/download, and empty/error/loading states;
- preserve tenant isolation, selected-organization context, RLS, CSRF,
  idempotency, formula escaping, safe content disposition, and server-side
  permission checks;
- update generated contracts and the owning docs, including a new
  `docs/reports.md` build record and the `AGENTS.md` docs index.

This is a full Phase 10 prompt. It must not build optional AI, public links,
external sharing, collaboration, billing, unsupported narrative claims, or paid
document services.

## Reference material read while preparing this prompt

Repository and workflow authority:

- `AGENTS.md` §§2, 2.1, phase-control commands, §§5-10: prompt-first execution,
  skill loading, checks, review/commit flow, prompt numbering, design prompt
  requirements, and no-fabrication rules.
- `docs/build-plan.md` §§1, 11, and 14: Phase 10 dependency, behavior,
  subsystems, non-goals, security/failure cases, tests, observability,
  rollback, documentation owner, skill manifest, and sequence gates.
- `docs/skills.md`: exact local skill paths, hashes, triggers, and Phase 10
  required and conditional skills.

Current implementation and product authority:

- `docs/dashboards.md`: current Phase 9 saved-view schema, REST commands,
  `dashboardSummary` GraphQL read model, authenticated dashboard UI,
  verification, and residual report/export gaps.
- `docs/analytics.md`: metric definitions, observations, quality flags,
  aggregates, lineage, REST read routes, numeric serialization, and residual
  evidence/query-plan gaps.
- `docs/ingestion.md`: dataset/version/publication and parser semantics that
  feed report evidence.
- `docs/backend.md`: Nest/Prisma/package state, scripts, route envelopes,
  sessions, CSRF, generated contracts, worker/storage state, and environment
  contract.
- `docs/authenticated-app.md`: same-origin bridge, server/browser API clients,
  active organization preference, protected `/app` shell, form behavior, and
  client E2E conventions.
- `docs/product.md`: B2B regional analytics product job, roles/permissions,
  report/export journeys, V1 boundary, data classification, success criteria,
  and open retention/deletion decisions.
- `docs/system-architecture.md`: modular-monolith principles, evidence/report/
  export target model, API/worker/storage boundaries, tenant/RLS flow, and
  rollback/operations assumptions.
- `docs/security.md`: TM-01 cross-tenant access, TM-08 object access, TM-09
  formula injection/stored UI XSS, TM-11/TM-12 queue/outbox risks, TM-15
  secrets/logs, TM-20 availability, security acceptance suite, and Phase 6/7A
  boundary updates.
- `docs/design-system.md`, `docs/components.md`, `docs/polish.md`, and
  `docs/automation.md`: Acres visual tokens, component primitives, app-shell
  accessibility floor, and browser/measurement recipes.

Current implementation inspected:

- `server/prisma/schema.prisma`: current tenant-owned organization, upload,
  stored-object, outbox/job, dataset/version, analytics, lineage, and dashboard
  models; legacy `InsightReport` is not tenant-scoped and must not become the
  Phase 10 report model by accident.
- `server/src/app.module.ts`: current feature-module imports and existing
  `DashboardsModule`, `AnalyticsModule`, `IngestionModule`, `UploadsModule`,
  `StorageModule`, `OutboxModule`, and worker foundations.
- `server/src/organizations/permissions.ts`: centralized permission map, which
  currently has `analytics.read` and `dashboards.manage` but no report/export
  permissions.
- `server/src/dashboards/**`, `server/src/analytics/**`, and
  `server/src/uploads/**`: existing service/repository/controller patterns,
  organization-scoped transactions, idempotency usage, DTO style, and evidence
  read paths to compose from.
- `server/src/storage/**`, `server/src/outbox/**`, `server/src/queue/**`, and
  `server/src/worker/**`: storage/queue/worker ports and adapter seams for
  asynchronous export work.
- `client/app/app/**`, `client/components/acres/app/**`,
  `client/lib/api/server.ts`, and `client/lib/api/browser.ts`: current
  authenticated shell, dashboard workspace, server-side GraphQL helper,
  no-store reads, CSRF/idempotency mutation client, and shadcn component usage.
- `packages/shared/src/**`: current shared API, dashboard, organization, job,
  and validation contracts that must be extended rather than bypassed.
- `docs/api/openapi.json`, `docs/api/schema.graphql`, and
  `docs/api/contracts.md`: generated contract artifacts that must be updated
  only via the repository's contract generation command.

Skills loaded while preparing this prompt:

- `.agents/skills/frontend-design/SKILL.md`
- `.agents/skills/tailwind-design-system/SKILL.md`
- `.agents/skills/tailwind-4-docs/SKILL.md`
- `.agents/skills/tailwind-4-docs/references/engineering-playbook.md`
- `.agents/skills/tailwind-4-docs/references/gotchas.md`
- `.agents/skills/shadcn/SKILL.md`
- `.agents/skills/shadcn/rules/styling.md`
- `.agents/skills/shadcn/rules/forms.md`
- `.agents/skills/shadcn/rules/composition.md`
- `.agents/skills/vercel-react-best-practices/SKILL.md`
- `.agents/skills/web-design-guidelines/SKILL.md`
- `.agents/skills/accessibility-compliance/SKILL.md`
- `.agents/skills/api-design-principles/SKILL.md`
- `.agents/skills/data-storytelling/SKILL.md`
- `.agents/skills/security-best-practices/SKILL.md`
- `.agents/skills/security-best-practices/references/javascript-typescript-react-web-frontend-security.md`
- `.agents/skills/security-best-practices/references/javascript-typescript-nextjs-web-server-security.md`
- `.agents/skills/security-best-practices/references/javascript-express-web-server-security.md`
- `.agents/skills/security-best-practices/references/javascript-general-web-frontend-security.md`
- `.agents/skills/error-handling-patterns/SKILL.md`
- `.agents/skills/playwright/SKILL.md`
- `.agents/skills/e2e-testing-patterns/SKILL.md`
- `.agents/skills/javascript-testing-patterns/SKILL.md`
- `.agents/skills/nestjs-best-practices/SKILL.md`
- `.agents/skills/architecture-patterns/SKILL.md`
- `.agents/skills/postgres-best-practices/SKILL.md`
- `.agents/skills/postgres-best-practices/references/schema-design.md`
- `.agents/skills/sql-optimization-patterns/SKILL.md`
- `.agents/skills/openapi-spec-generation/SKILL.md`
- `.agents/skills/kpi-dashboard-design/SKILL.md`
- `.agents/skills/requesting-code-review/SKILL.md`
- `.agents/skills/receiving-code-review/SKILL.md`
- `.agents/skills/caveman-commit/SKILL.md`

## SKILLS USED

- `frontend-design` - design report authoring/export UI as a restrained
  authenticated product surface for repeated analytical work.
- `tailwind-design-system` - compose with existing Acres tokens and add tokens
  only for reusable report/export primitives.
- `tailwind-4-docs` - verify any Tailwind v4 API before use. The local official
  docs snapshot is currently uninitialized, so implementation must initialize
  it with user-approved network access or use only already-verified/local
  fallback guidance and avoid unverified v4 claims.
- `shadcn` - inspect local base-nova component APIs before using fields,
  tables, tabs, dialogs, sheets, empty states, alerts, skeletons, progress,
  badges, toasts, menus, or download controls.
- `vercel-react-best-practices` - keep Next Server Component reads parallel,
  no-store, user/org-safe, and minimize client serialization for report data.
- `web-design-guidelines` - audit final report/export UI for hierarchy,
  focus, states, responsive behavior, and interaction quality.
- `accessibility-compliance` - ensure accessible authoring forms, publish
  dialogs, status updates, export progress, tables, keyboard flow, touch
  targets, and screen-reader semantics.
- `api-design-principles` - design report/export REST resources and any GraphQL
  reads with stable envelopes, permissions, versioning, idempotency, and
  contract clarity.
- `data-storytelling` - keep report insight structure evidence-led and avoid
  invented causality, recommendations, or unsupported claims.
- `security-best-practices` - secure frontend/server code: no client secrets,
  no raw HTML sinks, safe downloads, formula escaping, no unsafe redirects,
  and no report body/evidence values in operational logs.
- `error-handling-patterns` - classify validation, stale write, permission,
  renderer, storage, queue, cancellation, duplicate, and retry failures.
- `playwright` - capture real-browser evidence for report authoring/export
  journeys at 375, 800, and 1280.
- `e2e-testing-patterns` - add focused browser journeys for draft, publish,
  export, status, download, forbidden, stale, empty, and responsive behavior.
- `javascript-testing-patterns` - add unit/integration tests for DTOs,
  serializers, formula escaping, evidence resolution, permissions, worker
  states, React helpers, and API clients.
- `nestjs-best-practices` - implement focused Nest modules, controllers,
  services, guards, DTOs, repositories, worker handlers, and tests through DI.
- `architecture-patterns` - keep reports/exports as bounded application
  services behind storage/queue/rendering ports; controllers/resolvers stay
  transport adapters.
- `postgres-best-practices` - design additive tenant-owned schema with UUID
  public IDs, `timestamptz`, meaningful constraints, indexes, and forced RLS.
- `sql-optimization-patterns` - verify report/evidence/export list and detail
  queries avoid N+1 behavior and have representative plans where data is large
  enough.
- `openapi-spec-generation` - regenerate and check REST contract artifacts for
  report/export commands and downloads.
- `kpi-dashboard-design` - use only when report summaries reuse dashboard
  metric summaries; do not invent KPI targets or business thresholds.
- `requesting-code-review` - dispatch the mandatory reviewer subagent after
  self-verification.
- `receiving-code-review` - verify and act on reviewer feedback with technical
  rigor before applying fixes.
- `caveman-commit` - write the final Conventional Commit message.

Conditional skills deliberately not used unless scope changes:

- `vercel-react-view-transitions` and GSAP skills are not required unless the
  implementation adds route/state transitions beyond existing shell behavior.
- `prometheus-configuration` is not required unless this prompt adds an actual
  Prometheus metrics endpoint or scrape config; durable export status and
  redacted logs are sufficient for this phase.
- `deployment-pipeline-design`, `github-actions-templates`,
  `sast-configuration`, and `secrets-management` are not required unless CI,
  deploy, scanners, or runtime secret delivery materially change.

## Required verification before implementation

Before writing code, re-read `AGENTS.md`, this prompt, the docs listed above,
and every skill named in `SKILLS USED`. If any skill references routed files
needed for a concrete implementation choice, read those files before making the
choice.

Then verify current APIs from primary/local sources:

- Read relevant Next 16.3 docs from `client/node_modules/next/dist/docs/`
  before adding or changing route handlers, Server Components, `headers()`,
  `cookies()`, cache behavior, redirects, or params.
- Inspect the local base-nova shadcn components under `client/components/ui/`
  before composing forms, dialogs, sheets, progress, tables, tabs, toasts, or
  download/status controls.
- Verify Tailwind v4 behavior from the local docs snapshot if initialized. If
  the snapshot remains missing, either obtain approval to initialize it or keep
  styling to already-established Acres tokens/utilities and record the
  limitation.
- Verify Prisma 7 generated-client and migration behavior from local
  `node_modules` before editing `schema.prisma`.
- Verify any PDF renderer, CSV serialization helper, content-disposition
  helper, or sanitization/escaping package from primary docs and package
  metadata before installing it. Prefer maintained packages with no install
  scripts; document audit/deprecation findings.
- Verify existing storage, queue, outbox, and worker APIs from the current code
  before adding export jobs. Do not bypass the storage/queue ports with a
  one-off implementation.

If any dependency or API cannot be verified from local files, loaded skills, or
live primary docs fetched in this session, stop and state the gap instead of
guessing.

## Target architecture and implementation details

### Schema and migration

Add an additive Prisma migration for Phase 10 report/export records. Use new
tenant-owned models rather than extending the legacy non-tenant
`InsightReport` table unless a careful migration plan supersedes it. The
expected model set is:

- `Report`: organization-owned report shell with public ID, title,
  description/summary where needed, owner/creator account, status
  (`draft`, `published`, `archived` or equivalent), current draft/published
  revision references if useful, timestamps, and a monotonically checked
  version for stale-write detection.
- `ReportRevision`: immutable revision body with revision number, status
  (`draft`, `in_review`, `published`, `superseded` or a smaller justified set),
  structured sections/insight order, author/reviewer/publisher account IDs
  where applicable, timestamps, and publication timestamp.
- `ReportInsight`: structured human-authored insight rows or structured JSON
  section entries. Keep content plain text/structured data; do not store or
  render arbitrary HTML/SVG.
- `ReportEvidence`: stable links from revisions/insights to metric aggregates,
  observations, dataset versions, metric definitions, saved dashboard views,
  or filter snapshots as appropriate. Evidence must resolve through existing
  organization-scoped analytics services.
- `ExportRequest` / `ExportArtifact` or equivalent: organization-owned async
  export state, requested format (`csv`, `pdf`), target report/revision or
  evidence selection, deterministic/idempotency identity, requesting account,
  status, failure code/message, storage object reference, byte count/checksum
  when available, expiry timestamp for downloads, and timestamps.

Requirements:

- every tenant-owned row has `organizationId`, composite tenant uniqueness where
  references cross tenant-owned tables, and forced RLS matching existing
  organization context conventions;
- runtime/test/migrator privileges match the existing least-privilege pattern;
- indexes support report list/detail, active status filters, revision lookup,
  evidence resolution, export status polling, worker claim/update, and cleanup;
- use UUID public IDs and `timestamptz` fields;
- migrations are additive and reviewed SQL is committed; no fabricated product
  data or destructive rewrite is allowed;
- publication immutability is enforced by database constraints, service logic,
  or both, with tests proving published revisions cannot be edited in place.

### Permissions and policy

Extend `server/src/organizations/permissions.ts` centrally. Suggested
permissions:

- `reports.read`
- `reports.create`
- `reports.update`
- `reports.publish`
- `exports.create`
- `exports.read`

Role baseline:

- owner/admin: all report/export permissions;
- analyst: create/update reports, request exports, read reports/exports, and
  publish only if the product decision recorded during implementation says
  analysts may publish;
- viewer: read published reports and read permitted exports only. Viewers must
  not create, edit, publish, or request exports unless the implementation
  records an explicit product decision changing that.

Do not scatter role strings through controllers, resolvers, workers, or UI.
The server remains authoritative; client navigation is only an affordance.

### REST and GraphQL surface

Prefer REST `/api/v1` commands for mutations because existing browser mutation
code already handles CSRF and idempotency there. Add routes shaped as resources,
for example:

- `GET /reports`
- `POST /reports`
- `GET /reports/:reportId`
- `PATCH /reports/:reportId`
- `POST /reports/:reportId/revisions`
- `PATCH /reports/:reportId/revisions/:revisionId`
- `POST /reports/:reportId/revisions/:revisionId/publish`
- `GET /reports/:reportId/revisions/:revisionId/evidence`
- `POST /exports`
- `GET /exports`
- `GET /exports/:exportId`
- `GET /exports/:exportId/download`
- `POST /exports/:exportId/cancel` if cancellation is implemented

Route details may differ, but they must remain resource-oriented, versioned,
session-authenticated, selected-organization scoped, envelope-compatible, and
contract-generated. State-changing routes require CSRF; duplicate-producing
routes require `Idempotency-Key`.

GraphQL may add read-only report/export fields only if it reduces client
waterfalls without duplicating mutation semantics. If added, reuse the existing
GraphQL context, permission checks, limits, sanitized errors, and resolver
service composition. Do not add GraphQL mutations in this phase unless REST is
shown to be materially worse for a specific command.

### Evidence and report semantics

Reports must remain evidence-bound:

- every report value or claim shown as evidence must resolve to a metric
  definition, unit, quality state, aggregate/observation identity, dataset
  version, calculation version, and source lineage where available;
- draft insight text may be human-authored, but the UI must not imply Acres has
  inferred unsupported causality or recommendations;
- evidence deletion or invisibility must produce a recoverable stale/missing
  evidence state rather than silently changing published meaning;
- publishing freezes the revision content and evidence references. Later data
  changes require a new revision.

Do not introduce optional AI metadata or prompt records in this phase.

### Export generation

Implement asynchronous CSV and PDF exports through the existing outbox/worker
and storage ports.

Requirements:

- export queue payloads contain identifiers only, not report body or raw
  evidence values;
- worker re-reads authoritative report/evidence state inside the selected
  organization context before rendering;
- duplicate export requests with the same idempotency key replay the same
  response or conflict according to existing idempotency semantics;
- exports record rendering version, input report/revision/evidence identity,
  format, checksum/byte count when available, status, failure category, and
  storage object reference;
- generated artifacts are stored as private objects and downloaded only through
  an authenticated, organization-scoped route or short-lived signed URL that is
  bound to the authorized object;
- download responses use safe `Content-Type`, `Content-Disposition:
  attachment`, filename sanitization, `nosniff`, and no inline active content;
- CSV escapes spreadsheet formulas for any cell beginning with `=`, `+`, `-`,
  `@`, tab, carriage return, or other dangerous leading characters selected by
  the implementation after verification;
- PDF rendering must not execute untrusted HTML/SVG/scripts. Prefer a renderer
  that builds from structured data, or sanitize/escape with a documented
  allowlist if HTML generation is unavoidable;
- renderer/storage/queue failures produce durable failed states with safe
  messages and no report body in logs.

XLSX remains out of scope. If the user approves XLSX later, it needs its own
formula and workbook tests.

### Client UI

Add a first report/export surface under the authenticated `/app` shell. A
reasonable route structure is:

- `/app/reports`
- `/app/reports/new`
- `/app/reports/[reportId]`
- `/app/reports/[reportId]/revisions/[revisionId]`
- `/app/exports` or report-local export status panels

Use the existing shell and Acres visual system:

- quiet, dense, work-focused layout;
- white canvas, hairline rules, DM Sans UI/body, Crimson Text only for small
  section/page headings, Roboto Mono for labels/data;
- no marketing hero, gradient, fake illustration, fake sample metrics, or
  card-within-card composition;
- shadcn `FieldGroup`/`Field` for forms, `Alert` for callouts, `Empty` for
  empty states, `Table` for evidence/export lists, `Dialog`/`AlertDialog` or
  `Sheet` where the workflow genuinely needs an overlay, and `Progress` or
  text status for async export state;
- field errors use `data-invalid` and `aria-invalid`; failed submits focus a
  useful summary and preserve request IDs;
- pending submit/export states lock duplicate actions and expose `aria-busy`;
- download controls are disabled or absent until an export is complete and
  authorized.

Required UX states:

- no reports yet;
- draft report with unsaved/validation errors;
- stale version conflict;
- missing or inaccessible evidence;
- published immutable revision;
- export queued/running/succeeded/failed/cancelled if cancellation exists;
- forbidden viewer/editor/publisher paths;
- API down/slow error state with retry affordance where appropriate.

Breakpoint behavior:

- `375px`: single-column authoring and evidence layout, controls at least 44px,
  tables inside labelled keyboard-focusable scroll regions, no horizontal page
  overflow, no text overlap.
- `800px`: persistent app navigation remains; report content and evidence/status
  panels can form a two-column stack when space allows.
- `1280px`: use the existing shell width; keep editor/evidence/export status in
  a stable grid suited to repeated work, not a decorative dashboard.

### Observability and logging

Add low-cardinality, redacted operational signals through existing logging/state
patterns:

- export requested/started/succeeded/failed/cancelled;
- render duration, artifact size bucket, storage failure category, queue/outbox
  failure category;
- report published/audit event;
- evidence-resolution failure category.

Do not log report bodies, raw exported rows, source values, session cookies,
CSRF tokens, idempotency keys, presigned URLs, or raw object credentials.

### Documentation

Create `docs/reports.md` and add it to the `AGENTS.md` docs index in the same
implementation. Record:

- implemented schema and permission contract;
- report/revision/evidence semantics;
- REST/GraphQL route matrix;
- export format behavior, formula escaping policy, download security, and
  renderer/version choices;
- worker/storage/outbox behavior and failure states;
- browser routes and responsive/accessibility evidence;
- verification output and residual gaps.

Update `docs/product.md`, `docs/backend.md`, `docs/system-architecture.md`,
`docs/security.md`, `docs/authenticated-app.md`, and `docs/api/*` where the
implemented state changes. Do not record implementation facts in `AGENTS.md`
except the new docs index row.

## Tests and verification

Add tests proportional to the new trust boundary and UI surface.

Server/unit/integration:

- permission matrix for report read/create/update/publish/export actions;
- create/update/list/detail report behavior;
- stale write/version conflict;
- immutable published revision;
- evidence resolution to aggregate/observation/dataset-version identities;
- missing/foreign evidence negative cases;
- idempotent create/export replay and conflict cases;
- formula escaping fixtures;
- CSV content type, attachment disposition, and filename sanitization;
- PDF renderer output/version/failure behavior with no active HTML/SVG script
  execution path;
- export queued/running/succeeded/failed/cancelled state transitions as
  implemented;
- worker retry/failure/storage failure and no report-body log assertions where
  practical;
- two-organization negative tests at repository, REST, export, and worker
  boundaries;
- RLS/default-deny catalog and real PostgreSQL tests for new tables.

Client/unit/E2E:

- API helper serialization and error copy for reports/exports;
- report list empty state;
- draft creation/editing validation;
- publish flow and immutable published view;
- export request/status/download flow;
- viewer forbidden create/publish/export paths;
- stale/missing evidence state;
- keyboard and screen-reader semantics for authoring forms, evidence tables,
  publish confirmation, and export status;
- 375/800/1280 responsive coverage with no horizontal page overflow and 44px
  core touch targets.

Required command checks before review:

```bash
git diff --check
npm run lint
npm run typecheck
npm run build
npm run test:server
npm run test:client:e2e
npm run contracts:check
```

If schema/contracts change, run the repository's migration and contract
generation workflow first. If Docker or local PostgreSQL is unavailable, run
all checks that can run, state the exact blocked command/output, and do not
claim the database/storage boundary is verified.

Before finishing implementation:

1. Inspect the full diff and changed docs for stale claims.
2. Run the mandatory Stage 1 review with `requesting-code-review`, giving the
   reviewer the prompt, BASE_SHA, HEAD_SHA, files changed, and real check
   output.
3. Use `receiving-code-review` to verify each finding against the codebase
   before applying fixes.
4. Re-run affected checks after fixes.
5. Request follow-up review if fixes materially change schema, public API,
   worker behavior, security boundaries, or complex UI behavior.
6. Commit locally to `main` with `caveman-commit`. Do not push.

## Exit evidence

The implementation is complete only when:

- a permitted user can create a report draft, bind it to existing analytics
  evidence, publish an immutable revision, request an async CSV/PDF export, and
  download the resulting artifact securely;
- unauthorized, stale, duplicate, foreign-tenant, missing-evidence, renderer,
  storage, and worker failure paths fail safely with tested states;
- published revisions remain reproducible from evidence identities;
- CSV formula escaping and attachment download behavior are tested;
- docs and generated contracts match the implemented routes/schema;
- mandated checks and review loop have run with real output;
- the local implementation commit exists on `main`, and no push has occurred.
