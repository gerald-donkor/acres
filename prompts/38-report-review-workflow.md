# 38 - report review workflow

## Scope, and why it is next

The committed repository is on `main` at `7457f3a` (`feat(client): implement
dataset upload and mapping workflow`). `docs/ingestion.md` records the browser
dataset upload and mapping workflow as implemented, closing the Phase 7 client
activation gap from prompt 37.

The next ordered top-level target in `docs/build-plan.md` remains Phase 11,
optional local AI, but Phase 11 is explicitly blocked on a separate
user-approved model, license, quality threshold, and operating-profile decision.
No such decision exists. Do not start Phase 11 and do not add AI packages,
schemas, prompts, model adapters, generation metadata, evaluation fixtures, or
AI UI.

The next dependency-safe product gap is the report review/submission workflow.
`docs/reports.md` records: "Report review/submission workflow is modeled in the
schema but not exposed as a separate UI state." The Prisma model and shared
types already include `ReportRevisionStatus.in_review`, `reviewerAccountId`,
and `submittedForReviewAt`, but the current UI only lets authors save drafts
and lets admins/owners publish directly from the editor. Build an explicit
review state that makes the handoff visible, records submission metadata, and
keeps publish authority on the existing server-side `reports.publish`
permission.

This is a Phase 10 governance hardening slice. It must not change report/export
artifact rendering, formula escaping, storage, queues, dashboard analytics,
dataset ingestion, launch-readiness status, public sharing, collaboration, AI,
or retention/deletion policy.

## Reference material read while preparing this prompt

Repository and workflow authority:

- `AGENTS.md` §§2, 2.1, phase-control commands, §§5-10: prompt-first workflow,
  phase resolution, skill loading, verification, review, documentation, commit
  rules, product constraints, and no-fabrication rules.
- `docs/build-plan.md` §§1, 11-14: phase execution rules, Phase 10 reports and
  exports target, Phase 11 optional-AI gate, Phase 12 launch-hardening state,
  and sequence gates.
- `docs/reports.md`: implemented report/export state, REST routes, immutable
  published revisions, current authenticated reports UI, export SSE status, and
  residual review/submission UI gap.
- `docs/authenticated-app.md`: same-origin Next API bridge, typed server/browser
  API clients, active organization preference, app shell design, report/dataset
  routes, SSE helper, tests, and no client secret boundary.
- `docs/product.md` §§2-4, 6-7: fixed roles/permissions, report drafting and
  publishing journey, governed export journey, V1 no-AI boundary, accessible
  client journeys, and open decisions that must not be agent-selected.
- `docs/system-architecture.md` §§3.3-3.4, 4, 9-13: same-origin routing,
  worker/storage topology, reports/exports state, optional AI absence, launch
  inputs, and deferred sharing/collaboration/provider choices.
- `docs/security.md` §§6-9, 17: tenant isolation, report/export abuse paths,
  CSRF/idempotency expectations, client-bundle secret rules, no raw content in
  operational logs, and no-AI launch posture.
- `docs/api/contracts.md` and `docs/api/openapi.json`: current report routes
  and generated contract artifacts.
- `docs/operations.md`: Phase 12D status, deterministic no-AI launch posture,
  CI/E2E verification expectations, and operator-owned gates.

Current implementation inspected:

- `packages/shared/src/reports.ts`: `ReportRevisionStatus` already includes
  `in_review`; `ReportRevision` already exposes `reviewerAccountId` and
  `submittedForReviewAt`; there is no submit-review input type yet.
- `server/prisma/schema.prisma`: `ReportRevision` has `status`,
  `reviewerAccountId`, `submittedForReviewAt`, `publisherAccountId`, and
  `publishedAt`; no migration should be needed unless current code proves a
  missing constraint.
- `server/src/reports/reports.controller.ts`: current REST routes include
  report list/create/get/update, revision create/update/publish, revision
  evidence, exports, download, and export SSE; no submit-for-review route
  exists.
- `server/src/reports/reports.service.ts`: `updateRevision()` allows draft and
  `in_review` mutation, blocks published/superseded mutation, `createRevision()`
  refuses a current draft or `in_review` revision, and `publishRevision()` can
  publish any non-published revision with at least one insight and one evidence
  link.
- `server/src/reports/dto/report.dto.ts`: current DTOs cover create/update
  report, create/update revision, and create export.
- `server/src/reports/reports.repository.ts`: report list/detail returns the
  latest revision and filters viewers to published reports only.
- `server/test/api.e2e-spec.ts` and `server/src/reports/reports.service.spec.ts`:
  existing report/export tests cover current report creation, publication,
  viewer filtering, and service mapping.
- `client/app/app/reports/[reportId]/page.tsx`: report detail loads session,
  organizations, active organization, report, and exports in Server Components.
- `client/components/acres/app/reports-workspace.tsx`: report list/detail UI
  shows status, revision editor, evidence table, and export status.
- `client/components/acres/app/report-actions.tsx`: client leaf handles create
  report, update revision, create revision, publish, export requests, and
  download; publish currently appears beside draft editing rather than a
  separate review state.
- `client/lib/api/browser.ts` and `client/lib/api/server.ts`: typed helpers
  already cover current reports and exports; browser mutations use CSRF and
  idempotency where required.
- `client/e2e/product-journeys.spec.ts`, `client/e2e/accessibility-responsive.spec.ts`,
  and `client/e2e/helpers.ts`: current E2E patterns for reports, exports,
  role/label selectors, fixture reports with `submittedForReviewAt`, and
  responsive accessibility coverage.
- `client/components/ui/`: installed Base UI shadcn primitives include
  `Alert`, `Badge`, `Button`, `Card`, `Empty`, `Field`, `Input`, `Progress`,
  `Separator`, `Table`, `Tabs`, `Textarea`, `Tooltip`, and related controls.

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
- `.agents/skills/data-storytelling/SKILL.md`
- `.agents/skills/javascript-testing-patterns/SKILL.md`
- `.agents/skills/e2e-testing-patterns/SKILL.md`
- `.agents/skills/playwright/SKILL.md`
- `.agents/skills/openapi-spec-generation/SKILL.md`
- `.agents/skills/requesting-code-review/SKILL.md`
- `.agents/skills/receiving-code-review/SKILL.md`
- `.agents/skills/caveman-commit/SKILL.md`

Tailwind v4 official docs snapshot is still missing locally. Use only existing
Acres tokens/utilities and the limited Tailwind fallback references above. If
implementation needs a new Tailwind utility, variant, token, directive, or v4
API that is not already used in this repo, stop and get the official docs
snapshot initialized before proceeding.

## SKILLS USED

- `frontend-design` - design the review workflow as a quiet governance surface
  with clear readiness, responsibility, and finality, not as decoration.
- `tailwind-design-system` and `tailwind-4-docs` - stay inside existing Acres
  tokens/classes and Tailwind v4 CSS-first constraints.
- `shadcn` - compose local Base UI shadcn primitives and read each component
  before importing it; do not assume Radix props.
- `vercel-react-best-practices` - keep report reads server-side, client leaves
  narrow, mutation state local, and avoid unnecessary serialized data.
- `accessibility-compliance` - make status changes, review readiness, form
  errors, disabled actions, and publish confirmation keyboard/screen-reader
  accessible.
- `web-design-guidelines` - audit the finished report UI for practical
  interface issues, responsive overflow, focus, target sizing, and accessible
  names.
- `api-design-principles` - add or consume a resource-oriented review-state
  command without inventing client-only status semantics.
- `auth-implementation-patterns` - preserve session, selected-organization,
  RBAC, CSRF, idempotency, and server-side permission boundaries.
- `security-best-practices` - keep report content escaped, secrets server-only,
  object URLs/downloads safe, and review/publish decisions enforced server-side.
- `error-handling-patterns` - provide recoverable conflict, validation, stale
  version, forbidden, and already-submitted/published states.
- `data-storytelling` - present claims, evidence, and publication finality in a
  way that helps reviewers evaluate the report rather than merely edit fields.
- `javascript-testing-patterns` - add focused server and client/helper coverage
  for review-state commands and UI state transitions.
- `e2e-testing-patterns` and `playwright` - verify the browser report journey
  with stable role/label selectors and responsive assertions.
- `openapi-spec-generation` - update/check generated REST contracts if a new
  submit-for-review route is added.
- `requesting-code-review` - dispatch the mandatory reviewer subagent after
  self-verification.
- `receiving-code-review` - verify reviewer feedback against codebase reality
  before applying changes.
- `caveman-commit` - write the final Conventional Commit message.

Conditional skills:

- `nestjs-best-practices` is required if implementation changes `server/`
  controllers, services, DTOs, modules, guards, or tests. A real submit-review
  route is likely, so load it during execution if that path is taken.
- `postgres-best-practices` and `sql-optimization-patterns` are required only
  if implementation changes schema, migrations, RLS, indexes, persistence
  queries, or measured query plans. This prompt should not require a migration.
- `security-threat-model` is required only if a new trust boundary is created.
  A review-status command over existing report authorization should update
  current docs without changing the threat model boundary.
- `prometheus-configuration` is required only if metrics route groups, labels,
  alerts, or operational telemetry change. They should not change here.
- `architecture-decision-records` is required only if implementation changes a
  durable architecture/product decision. It should not be needed for this
  governance UI/API slice.

## Required verification before implementation

Before writing code, re-read `AGENTS.md`, this prompt, every owning doc listed
above, and every skill named in `SKILLS USED`. Re-check the latest local files;
do not rely on the preparation notes if code has changed.

Verify framework and component APIs locally before coding:

- Next route, form, `headers()`, `cookies()`, Server Component, Route Handler,
  caching, and `params` behavior from relevant files under
  `node_modules/next/dist/docs/`. Do not use remembered Next APIs.
- Existing local shadcn components from `client/components/ui/` before
  importing them. This repo uses `base-nova` on `@base-ui/react`.
- Existing Acres tokens in `client/app/globals.css` and design-system records
  before any styling change.
- Nest controller/DTO/service patterns from existing reports, ingestion, and
  organization modules if server code changes.

Do not create or edit implementation files until this prompt is approved with
`y` / `Y`.

## Target implementation details

### 1. Add an explicit submit-for-review server command

If inspection confirms there is still no route for this state transition, add:

- `POST /api/v1/reports/:reportId/revisions/:revisionId/submit-review`

Use the same guards and organization context as existing report revision
commands:

- `SessionGuard`
- `OrganizationContextGuard`
- `PermissionGuard`
- `@RequiresOrganizationPermission('reports.update')`
- CSRF required
- `Idempotency-Key` required

Server behavior:

- Accept the selected organization context and require the revision to belong
  to that organization and report.
- Only a `draft` revision can be submitted. Re-submitting an already
  `in_review` revision should be idempotent when the idempotency record replays,
  but a fresh conflicting submit for an already non-draft revision should return
  a stable conflict.
- Reject `published` and `superseded` revisions.
- Require at least one insight and one evidence link before submission, using
  the same readiness rule publishing already enforces. Return a validation
  error with actionable copy if either is missing.
- Set `status = 'in_review'`, `reviewerAccountId = null`, and
  `submittedForReviewAt = now()`.
- Increment the parent report `version` and `updatedAt` so stale client writes
  are detected.
- Return the standard `Report` envelope shape.
- Do not add a separate reviewer assignment feature unless code already exposes
  membership lookup and a product rule for assignment. Recording submission time
  is enough for this slice.
- Do not add a migration unless live schema inspection proves the modeled fields
  are absent.

Consider whether `updateRevision()` should continue allowing `in_review`
mutation. The product intent of a review state is that submitted content is no
longer casually edited. Prefer one of these, in order:

1. Block content mutation while `status === 'in_review'`, requiring authors to
   create or return to a draft only if such a transition exists.
2. If blocking would strand the workflow because no return-to-draft command
   exists, keep mutation allowed but make the UI and docs explicit that edits
   keep the revision in review and update the review timestamp only through the
   submit command.

Do not invent a reject/return/reviewer-assignment flow in this prompt.

### 2. Make publishing review-aware without weakening authorization

Publishing must remain server-authorized by `reports.publish` and limited in
the UI to owners/admins.

Update `publishRevision()` semantics only if needed:

- Publishing a draft may be allowed only when the user has `reports.publish`,
  but the UI should guide admins/owners through the review panel rather than a
  casual editor button.
- Publishing an `in_review` revision should set `publisherAccountId` and
  `publishedAt` exactly as today and leave `submittedForReviewAt` intact.
- Do not let analysts publish through any client-only hidden control.
- Do not allow viewers to read draft or in-review reports; preserve existing
  server filtering.

If the server behavior remains unchanged, document that this prompt adds the
review submission command and UI state without changing publish authority.

### 3. Extend shared and browser contracts

Add only the typed shape required by the new command:

- `SubmitRevisionForReviewInput` if an expected version or notes field is truly
  needed. Prefer an empty body if the route only transitions state.
- `submitReportRevisionForReview(organizationId, reportId, revisionId)` in
  `client/lib/api/browser.ts`.

Requirements:

- Use same-origin `/api/v1` browser requests.
- Use CSRF and idempotency for the submit command.
- Preserve `x-acres-organization-id`.
- Do not store report body, evidence snapshots, signed URLs, sessions, CSRF
  tokens, idempotency keys, or organization secrets in localStorage or
  sessionStorage.
- Regenerate/check OpenAPI and `docs/api/contracts.md` if the route is added.

### 4. Split the report detail UI into edit and review states

Update the authenticated report detail UI so status is meaningful at a glance:

- Keep the current shell and route: `/app/reports/[reportId]`.
- Add a compact status/readiness panel for the latest revision:
  - revision number;
  - state: draft, in review, published, superseded;
  - insight count;
  - evidence count;
  - submitted date when present;
  - published date when present;
  - readiness blockers such as "Add at least one insight" or "Attach at least
    one evidence link."
- Keep editing controls available only for non-viewers and only when the chosen
  server semantics allow editing.
- Add a distinct "Submit for review" action for owners/admins/analysts when the
  revision is draft and readiness passes.
- Add a distinct review panel for `in_review` revisions. It should show claims
  and evidence read-only, make finality clear, and expose "Publish" only to
  owners/admins.
- If the current user is an analyst and the revision is in review, show a
  readable state rather than a disabled fake publish affordance.
- Keep export controls disabled/hidden until the revision is published, as
  today.
- Keep `New Draft Revision` available after publication for users with update
  permission.

Design constraints:

- Use existing Acres typography and tokens only.
- No cards inside cards. Use current app-shell patterns, hairline rules,
  compact panels, `Badge`, `Alert`, `Table`, `Separator`, and buttons.
- Buttons must have clear action names and lucide icons where existing code
  already uses lucide in app UI.
- Use `aria-live="polite"` for successful submit/publish state changes if the
  visible route refresh would otherwise be silent.
- Focus error summaries after failed actions, as existing report forms do.
- Preserve 44px touch targets and no horizontal overflow at 375/800/1280.

### 5. Improve evidence and claim review presentation

Make the review view useful enough for a reviewer to decide:

- Show each insight heading/body in source order.
- Show evidence rows with type, source ID, dataset/version reference, and a
  concise snapshot summary when available:
  - aggregate snapshots: metric label/key, value, unit, period, region,
    observation count, dataset version;
  - dashboard view snapshots: saved view name, filters, and presentation shape.
- Render all snapshot/user-originated content through normal React text
  interpolation. Do not use `dangerouslySetInnerHTML`.
- Do not invent metric values or example evidence. Empty evidence remains empty
  and blocks submission/publish.

### 6. Update tests

Server/API tests:

- Add coverage for successful draft-to-`in_review` submission.
- Verify submission records `submittedForReviewAt`, leaves reviewer null, and
  increments report version.
- Verify submission rejects missing insight/evidence.
- Verify submission rejects or conflicts for published/superseded revisions.
- Verify viewers cannot submit; analysts can submit; admins/owners can publish.
- Verify cross-tenant report/revision IDs are rejected by existing organization
  scoping.
- If contracts change, run `npm run contracts:generate` and commit the updated
  artifacts.

Client/unit tests:

- Add or update focused tests for report API helper route/header/idempotency
  behavior if local patterns exist for browser helpers.
- Add UI state tests only where the repo already has a lightweight unit pattern;
  otherwise cover behavior through Playwright.

E2E tests:

- Extend the report product journey so an authorized author creates/saves a
  draft, submits it for review, sees `in_review`, and an admin/owner publishes
  from the review panel.
- Verify an analyst sees submitted state without publish affordance.
- Verify viewers still do not see drafts or in-review reports.
- Include 375/800/1280 responsive checks through existing accessibility suite if
  the report detail surface is in that suite.

### 7. Documentation updates

Update only owning docs:

- `docs/reports.md`: record the new review/submission workflow, route, UI state,
  verification output, and remove or revise the residual gap.
- `docs/authenticated-app.md`: update route/API client behavior if the report
  detail/report helpers changed in a way future client work must know.
- `docs/api/contracts.md` and `docs/api/openapi.json`: regenerate if a new REST
  route is added.
- `docs/security.md`: update only if the review workflow materially changes an
  abuse path or control. Do not add a new threat boundary merely for an
  authenticated status command over existing reports.

Do not update `AGENTS.md` unless a new invariant or docs index row is truly
needed. This work belongs to the existing `docs/reports.md` row.

## Required verification after implementation

Run and quote real output for:

```bash
git diff --check
npm run lint
npm run typecheck
npm run build
npm run test:server
npm run test:client:e2e
npm run contracts:check
```

If a migration is added despite the expected no-migration path, also run and
quote:

```bash
npm run prisma:validate --workspace=@acres/server
DATABASE_URL='postgresql://acres_test:acres_test_dev_password@localhost:5432/acres_test?schema=public' DATABASE_MIGRATION_URL='postgresql://acres_migrator:acres_migrator_dev_password@localhost:5432/acres_test?schema=public' npm run prisma:migrate:deploy --workspace=@acres/server
```

If browser verification requires a live server, follow the existing
`test:client:e2e` web-server pattern rather than starting an unrelated server.
If a command fails because the local database, Docker, ports, or sandbox cannot
reach dependencies, rerun with the required approval path and record the
failure and successful rerun output.

Before review:

- Inspect the full diff manually.
- Confirm no secrets, object URLs, CSRF tokens, idempotency keys, report bodies
  in logs, or client-exposed `NEXT_PUBLIC_*` sensitive values were added.
- Confirm no AI package, model, prompt, generated insight, or AI UI was added.
- Confirm viewer filtering and server-side publish authorization are intact.

Then run the mandatory two-stage review loop:

1. Use `requesting-code-review` to dispatch a reviewer subagent with:
   - this prompt;
   - base/head SHAs;
   - files changed;
   - route and UI behavior added;
   - checks run and their real output;
   - explicit no-AI/no-sharing/no-retention/no-rendering-format constraints.
2. Use `receiving-code-review` to evaluate each finding against codebase reality.
3. Fix valid issues, re-run affected checks, and request follow-up review if
   changes affect API contracts, permissions, persistence, or complex UI state.

## Non-goals and hard stops

- No Phase 11 optional AI implementation, AI package, model, prompt,
  evaluation, or UI.
- No public sharing, collaboration, scheduled exports, reviewer assignment,
  reject/return workflow, retention/deletion policy, billing, or external
  viewers.
- No report PDF redesign or comp-designed presentation export.
- No migration unless existing modeled fields are actually absent.
- No bypass of CSRF, idempotency, selected-organization headers, RLS, or server
  permission checks.
- No native `EventSource` changes; export SSE already uses fetch-based streaming
  because organization headers are required.
- No `dangerouslySetInnerHTML` for insights, summaries, snapshot data, or
  report content.
- No Tailwind v4 API invention beyond existing repo usage without initializing
  the official docs snapshot.
- No changes to production launch-readiness blockers or operator-owned values.

