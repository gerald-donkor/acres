# 36 - authenticated job progress SSE streaming

## Scope, and why it is next

The committed repository is on `main` at `fad115e` (`feat(ops): add launch
readiness decision gate`). `docs/operations.md` records Phase 12D as implemented.
The next ordered top-level target in `docs/build-plan.md` remains Phase 11,
optional local AI, but Phase 11 is explicitly blocked on separate user-approved
model, license, quality threshold, and operating-profile decisions. Do not start
Phase 11 and do not add AI packages, schemas, prompts, model adapters, or UI.

The next dependency-safe approved gap is the missing authenticated job-progress
stream for product work already implemented without AI or operator-owned launch
values. `docs/build-plan.md` Phase 6 names progress SSE as a target. Current code
has durable polling endpoints for ingestion runs and report exports, and
`docs/reports.md` records the residual gap: "Export progress is read by
polling/refreshing status; SSE progress remains a later enhancement." Uploads
already expose an upload-specific Nest `@Sse(':uploadId/events')` endpoint, so
this prompt extends the established pattern to ingestion runs and export
requests and wires the reports UI to consume export progress without removing
polling fallback.

This is an additive transport and UI-state hardening slice. It must not change
tenant authorization semantics, report/export persistence semantics, queue
processing, storage, or the production launch readiness gate.

## Reference material read while preparing this prompt

Repository and workflow authority:

- `AGENTS.md` §§2, 2.1, phase-control commands, §§5-10: prompt-first workflow,
  phase resolution, skill loading, verification, review, documentation, commit
  rules, product constraints, and no-fabrication rules.
- `docs/build-plan.md` §§1, 7, 11-14: phase execution rules, Phase 6 SSE target,
  Phase 10 reports/exports, Phase 11 AI gate, Phase 12 launch-hardening state,
  and sequence gates.
- `docs/reports.md`: implemented report/export state, REST routes, worker
  artifact flow, current client UI, verification, and residual SSE gap.
- `docs/ingestion.md`: implemented ingestion run status shape and residual
  browser/worker gaps.
- `docs/authenticated-app.md`: same-origin Next API bridge, typed browser/server
  API clients, active organization header, shell design, tests, and open Phase 5
  work that names export progress streaming.
- `docs/api/contracts.md`: current REST matrix with polling endpoints only:
  `GET /api/v1/ingestion-runs/:runId` and `GET /api/v1/exports/:exportId`.
- `docs/security.md` §§6-9, 17: SSE target boundary, tenant isolation threats,
  upload/worker/export acceptance paths, low-cardinality telemetry constraints,
  and launch readiness posture.
- `docs/system-architecture.md` §§3.3-3.4, 4, 10: same-origin routing, upload
  and ingestion sequence, API/worker/runtime topology, and private dependency
  boundaries.
- `docs/operations.md`: Phase 12D state, no-AI posture, `/metrics` route group
  expectations, E2E launch verification, and runbook limits.

Current implementation inspected:

- `server/src/uploads/uploads.controller.ts`: existing `@Sse(':uploadId/events')`
  implementation using RxJS polling, `MessageEvent`, `interval`, `switchMap`,
  and `takeWhile`.
- `node_modules/@nestjs/common/decorators/http/sse.decorator.d.ts` and
  `sse-signal.decorator.d.ts`: verified local Nest exports for `@Sse` and
  `@SseSignal`; `@SseSignal()` can observe client disconnects and should be used
  if setup creates resources that need cancellation.
- `node_modules/@nestjs/core/router/sse-stream.*`: verified Nest emits
  `text/event-stream` for `MessageEvent` Observables.
- `server/src/reports/reports.controller.ts` and
  `server/src/reports/reports.service.ts`: current export read/create/download
  routes and `ReportsService.getExport()`.
- `server/src/ingestion/ingestion.controller.ts` and
  `server/src/ingestion/ingestion.service.ts`: current ingestion run read,
  issues, cancel, and `IngestionService.getRun()`.
- `server/prisma/schema.prisma`: `Upload`, `IngestionRun`, and `ExportRequest`
  already carry durable progress/status fields; `JobProgressEvent` is currently
  upload-only and should not be generalized unless strictly required.
- `client/app/api/v1/[...path]/route.ts`: same-origin bridge streams upstream
  bodies and currently forwards `content-type`, `x-request-id`, and `set-cookie`
  with `cache-control: no-store`.
- `client/lib/api/browser.ts`: browser mutations use same-origin `/api/v1`,
  credentials, CSRF for mutations, and `x-acres-organization-id` for scoped
  reads/mutations.
- `client/components/acres/app/report-actions.tsx` and
  `client/components/acres/app/reports-workspace.tsx`: export creation,
  download actions, and current export status list.
- `client/app/app/reports/*.tsx`: server-side report/export loading through the
  authenticated app shell.
- `server/src/contracts/generate-contracts.ts`: contract matrix is hand-written
  by the generator and must be updated if new REST endpoints are added.
- `server/test/api.e2e-spec.ts`: current report/export and ingestion status
  tests use Supertest and mocked Prisma/service ports.

Skills loaded while preparing this prompt:

- `.agents/skills/nestjs-best-practices/SKILL.md`
- `.agents/skills/api-design-principles/SKILL.md`
- `.agents/skills/auth-implementation-patterns/SKILL.md`
- `.agents/skills/security-best-practices/SKILL.md`
- `.agents/skills/security-best-practices/references/javascript-typescript-nextjs-web-server-security.md`
- `.agents/skills/security-best-practices/references/javascript-typescript-react-web-frontend-security.md`
- `.agents/skills/error-handling-patterns/SKILL.md`
- `.agents/skills/javascript-testing-patterns/SKILL.md`
- `.agents/skills/e2e-testing-patterns/SKILL.md`
- `.agents/skills/playwright/SKILL.md`
- `.agents/skills/vercel-react-best-practices/SKILL.md`
- `.agents/skills/accessibility-compliance/SKILL.md`
- `.agents/skills/frontend-design/SKILL.md`
- `.agents/skills/tailwind-design-system/SKILL.md`
- `.agents/skills/tailwind-4-docs/SKILL.md`
- `.agents/skills/tailwind-4-docs/references/gotchas.md`
- `.agents/skills/tailwind-4-docs/references/engineering-playbook.md`
- `.agents/skills/shadcn/SKILL.md`
- `.agents/skills/requesting-code-review/SKILL.md`
- `.agents/skills/receiving-code-review/SKILL.md`
- `.agents/skills/caveman-commit/SKILL.md`

Tailwind v4 official docs snapshot is still missing locally. For this prompt,
use only existing Acres tokens/utilities and the limited Tailwind fallback
references above. If implementation needs a new Tailwind utility, variant, or
token, stop and get the official docs snapshot initialized before proceeding.

## SKILLS USED

- `nestjs-best-practices` - keep SSE routes inside feature modules, reuse guards
  and services, and avoid controller-owned persistence logic.
- `api-design-principles` - add readable REST status-stream resources without
  changing command semantics or envelopes for normal JSON routes.
- `auth-implementation-patterns` - ensure streaming reads are session- and
  organization-scoped, server-authorized, and not client-only affordances.
- `security-best-practices` - preserve server-only secrets, header forwarding,
  no raw IDs in metrics labels, and no secret-bearing stream payloads.
- `error-handling-patterns` - make stream setup failures and stream termination
  predictable, with polling fallback on the client.
- `javascript-testing-patterns` - add focused unit/integration tests for stream
  formatting, terminal completion, and client fallback parsing.
- `e2e-testing-patterns` and `playwright` - verify the browser reports journey
  updates queued/running/succeeded export status without refresh.
- `vercel-react-best-practices` - avoid client data waterfalls and clean up
  streaming subscriptions on unmount or organization/report changes.
- `accessibility-compliance` - announce dynamic progress through a live region
  without stealing focus.
- `frontend-design`, `tailwind-design-system`, `tailwind-4-docs`, and `shadcn`
  - use existing restrained app-shell patterns, Base UI shadcn primitives, and
  Acres tokens only.
- `requesting-code-review` - dispatch mandatory reviewer subagent after
  self-verification.
- `receiving-code-review` - verify reviewer feedback against codebase reality
  before applying changes.
- `caveman-commit` - write the final Conventional Commit message.

Conditional skills:

- `postgres-best-practices` and `sql-optimization-patterns` are required only if
  implementation adds a migration, new indexes, generalized progress-event
  tables, or query-plan work. A polling-backed SSE stream over existing durable
  rows should not need them.
- `openapi-spec-generation` is required only if the contract generator or
  OpenAPI decorators need non-standard streaming schema work beyond adding the
  routes to the existing generated contract matrix.
- `prometheus-configuration` is required only if metrics labels or route groups
  change. If the existing route normalizer already maps these under
  `/api/v1/exports` and `/api/v1/ingestion-runs`, do not load it.

## Required verification before implementation

Before writing code, re-read `AGENTS.md`, this prompt, every owning doc listed
above, and every skill named in `SKILLS USED`. Re-check the latest local files;
do not rely on the preparation notes if code has changed.

Verify framework APIs locally before coding:

- Next route handler behavior and streaming from
  `node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md` and
  the route-handler docs found under `node_modules/next/dist/docs/01-app/03-api-reference/`.
- Nest SSE support from the local `@nestjs/common` and `@nestjs/core` files
  named above. Prefer the existing `UploadsController.events()` implementation
  where it is sufficient.
- shadcn component APIs by reading any component imported from
  `client/components/ui/` before use. Do not assume Radix props; this repo is
  Base UI style.

Important browser constraint: native `EventSource` cannot send the
`x-acres-organization-id` header required by this app's selected-organization
guard. The browser implementation must therefore consume the SSE response with
`fetch()` and a streaming parser so it can include:

- `credentials: "include"`;
- `cache: "no-store"`;
- `accept: "text/event-stream"`;
- `x-acres-organization-id: <active organization id>`.

Do not move the organization identifier into a public query string just to make
native `EventSource` convenient.

## Target implementation details

### 1. Add export and ingestion SSE routes

Extend the existing feature controllers with additive read-only SSE endpoints:

- `GET /api/v1/exports/:exportId/events`
- `GET /api/v1/ingestion-runs/:runId/events`

Use `@Sse()` so Nest emits standard SSE frames. Keep the same guards and
permissions as the polling reads:

- exports: `SessionGuard`, `OrganizationContextGuard`, `PermissionGuard`,
  `@RequiresOrganizationPermission('exports.read')`;
- ingestion runs: `SessionGuard`, `OrganizationContextGuard`, `PermissionGuard`,
  `@RequiresOrganizationPermission('ingestion.read')`.

Each endpoint should:

- immediately emit the current durable status once, then emit updates on a
  bounded interval close to the existing upload SSE cadence (`1500ms` is
  acceptable unless code reveals a stronger local constant);
- complete after emitting a terminal state:
  - export terminal states: `succeeded`, `failed`, `cancelled`;
  - ingestion terminal states: `published`, `failed`, `cancelled`;
- use stable event names such as `export.progress` and `ingestion.progress`;
- set event ids from low-risk state fields, for example
  `<id>:<status>:<updatedAt-or-finishedAt>` for exports and
  `<id>:<state>:<stage>:<progressPercent>` for ingestion;
- return only the same typed status data the polling endpoint already returns;
- avoid raw error stack traces, credentials, object keys, or storage signed URLs
  in stream payloads;
- handle not-found and forbidden setup failures before the stream starts through
  the existing exception/envelope path.

Do not add a database migration unless strictly necessary. The durable
`ExportRequest` and `IngestionRun` rows already contain enough state for this
slice. Do not generalize the upload-only `JobProgressEvent` table unless
implementation proves polling durable rows is inadequate.

### 2. Keep the same-origin bridge stream-safe

Review `client/app/api/v1/[...path]/route.ts` and make only narrowly required
changes. It already forwards upstream bodies as streams. Ensure SSE responses
retain:

- `content-type: text/event-stream`;
- `cache-control: no-store`;
- `x-request-id` where upstream provides it.

Do not buffer the upstream stream to parse envelopes. Do not add CSRF to GET
streams. Do not expose `ACRES_API_ORIGIN` or any secret to client code.

### 3. Add typed browser streaming helpers

In `client/lib/api/browser.ts` or a small adjacent browser-only helper, add a
typed fetch-stream consumer for the new SSE endpoints. Requirements:

- use `fetch('/api/v1/.../events')`, not native `EventSource`, because the
  active organization header is required;
- send `accept: text/event-stream`, credentials, no-store cache, and
  `x-acres-organization-id`;
- parse standard SSE `event:`, `id:`, and multiline `data:` frames safely from
  `ReadableStream<Uint8Array>`;
- call a supplied callback with typed `ExportRequest` or `IngestionRunSummary`
  data;
- stop on terminal events or when an `AbortSignal` aborts;
- fall back to one final polling read if streaming setup fails or the response
  is not `ok`;
- never store sensitive payloads in localStorage/sessionStorage.

If a generic helper is introduced, keep it small and tested. Avoid adding a
third-party SSE parser dependency unless local code proves it is necessary.

### 4. Wire report export status to live updates

Update the authenticated reports UI so queued/running export cards update
without a full page refresh:

- make only the smallest necessary client component change, likely around
  `ExportStatus` in `client/components/acres/app/reports-workspace.tsx`;
- seed local state from the server-provided `exports` prop;
- subscribe only for non-terminal exports visible in the current list;
- abort streams on unmount, route changes, organization changes, or when an
  export becomes terminal;
- keep download behavior unchanged and still require a completed export before
  requesting the short-lived download URL;
- expose a concise `aria-live="polite"` status announcement for progress changes
  and failures;
- use existing shadcn primitives (`Badge`, `Alert`, `Progress` if needed) and
  Acres tokens/classes. Do not introduce a new visual language, card nesting, or
  marketing-style copy.

Keep polling/refresh fallback available. A failed stream should not strand the
user or turn a successful export into a visible error unless the final polling
read also fails.

### 5. Optional ingestion client helper, no upload/mapping UI expansion

Add the typed ingestion stream helper and server route in this prompt, but do
not build a new upload/mapping UI. There is no existing browser surface for
ingestion progress, and creating one would expand beyond this slice. Tests
should prove the API stream works and the helper can parse it.

### 6. Contracts and docs

Regenerate and update:

- `docs/api/contracts.md`
- `docs/api/openapi.json` if Swagger includes the new routes

The contract matrix must include:

- `GET /api/v1/exports/:exportId/events | session + exports.read | export status SSE stream`
- `GET /api/v1/ingestion-runs/:runId/events | session + ingestion.read | ingestion status SSE stream`

Update owning docs:

- `docs/reports.md`: record export SSE behavior, client live status, fallback,
  tests, and remove or revise the residual SSE gap.
- `docs/ingestion.md`: record ingestion run SSE endpoint and the fact that no
  browser upload/mapping UI was added in this slice.
- `docs/authenticated-app.md`: record the browser fetch-stream approach and why
  native `EventSource` is not used with the active-organization header.
- `docs/backend.md`: update the API route map/contract section for streaming
  reads if that section currently lists report/export or ingestion routes.
- `docs/security.md`: update the SSE entry-point/current-evidence row so it no
  longer says SSE is absent; note that streams reuse session, organization, and
  permission guards and do not carry secrets.

Update `docs/operations.md` only if metrics route grouping, runbooks, or launch
verification wording changes. Do not change launch readiness status.

## Tests to add or update

Server tests:

- Add Supertest coverage for `GET /api/v1/exports/:exportId/events`:
  - authenticated authorized member receives `text/event-stream`;
  - first frame contains the current export status;
  - stream completes after `succeeded`, `failed`, or `cancelled`;
  - viewer with `exports.read` can stream visible completed/published export
    metadata but cannot stream foreign organization exports;
  - missing/foreign export returns the existing not-found/forbidden behavior
    before a stream starts.
- Add Supertest coverage for `GET /api/v1/ingestion-runs/:runId/events` with
  the same authorization and terminal-completion expectations.
- Add focused unit coverage for any SSE parser/formatter helper if one is
  extracted.

Client tests:

- Add unit coverage for the fetch-stream parser:
  - parses single and multiline `data:` frames;
  - ignores comments/heartbeat frames;
  - aborts cleanly;
  - performs one final polling fallback when stream setup fails.
- Extend Playwright E2E only where deterministic with the current test harness:
  - after requesting an export from a published report, the export status list
    updates without manually refreshing the page;
  - a completed export still exposes the existing download action;
  - no horizontal overflow at 375/800/1280 is introduced.

If the current E2E harness cannot deterministically hold an export in `queued`
or `running`, do not fake timing with arbitrary sleeps. Add lower-level tests
for the stream and document the E2E limitation in the verification record.

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

## Review and commit

After self-verification:

1. Inspect the final diff and ensure no unrelated files were changed.
2. Use `requesting-code-review` with a reviewer subagent. Provide the approved
   prompt path, base/head SHAs, files changed, exact checks run, and the SSE
   header/fetch-stream design constraint.
3. Use `receiving-code-review` to verify feedback before changing code. Fix
   valid issues and re-run affected checks.
4. Re-review if feedback causes architectural, API, security, or substantial UI
   changes.
5. Use `caveman-commit` for the final local commit message and commit to
   `main`. Do not push.

## Non-goals

- No Phase 11 optional AI implementation, AI package, model, prompt, evaluation,
  or AI UI.
- No production deployment, host/provider selection, launch-readiness approval,
  or operator secret/evidence values.
- No new upload/mapping browser UI.
- No report review/submission workflow UI.
- No generalized job-event schema migration unless durable polling rows prove
  insufficient.
- No public sharing, collaboration, scheduled exports, or retention/deletion
  policy decisions.
- No native `EventSource` path that drops the active organization header.
