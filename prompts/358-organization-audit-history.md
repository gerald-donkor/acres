# Prompt 358 — Organization audit history

## Scope and why next

Implement the audit-history portion of product journey 3.9 as a dependency-safe
Phase 5 follow-up. Baseline `cbea86d` has committed Phases 3–10 and Phase 12
launch tooling, but `docs/project-status.md` identifies missing administrative
history access as the first V1 engineering gap. Actual code confirms the
permissioned `organizationAuditEvents` query, existing shared event DTO and
forced-RLS service; no audit route or client helper exists. The user requested
`i` followed by “implement plan when finished”, authorizing execution after
this prompt is written and re-read.

## References and API verification

Read AGENTS.md, docs/build-plan.md §§1,4–6,14, docs/project-status.md,
docs/product.md (especially 3.9 and roles), docs/skills.md,
docs/authenticated-app.md, docs/backend.md, docs/system-architecture.md,
docs/security.md, docs/design-system.md, docs/components.md, docs/polish.md and
docs/automation.md. Inspect the existing member route/state, AppShell,
organization switcher, API server client, envelope errors, audit resolver,
auditEventsPage service, GraphQL types/pagination and shared organizations DTO.

Static reference: client/public/assets/ui/ref/acres-design-system.pdf, button
region x=0,y=1700,w=1260,h=680 rendered at 72 dpi. This verifies the existing
pill treatment, not a history-page layout. There is no authenticated-history
comp. Use the established app shell and documented tokens; do not invent
measurements. Read local Next docs for page/searchParams, cookies, headers,
Link, redirect, loading and error conventions before coding. Local error
boundary types expose retry and reset; use retry for the new boundary.

Tailwind snapshot remains uninitialized and the prior documented sync did not
initialize it. Use the skill's limited gotchas/engineering-playbook fallback
and existing utilities; do not accept a third-party license or install new
packages. Read installed Base UI/shadcn wrappers before reuse. Fetch the fresh
web-interface guidelines for the final UI pass.

## Implementation

1. Add a client-local audit connection type/query definition in
   client/lib/api/audit-history.ts using OrganizationAuditEvent. Query only
   id, action, targetType, targetId, actorAccountId, createdAt and pageInfo.
   Add listOrganizationAuditEvents to client/lib/api/server.ts using the
   existing authenticated, CSRF-protected, no-store GraphQL POST. Use the
   server's default bounded page size (20 capped by GRAPHQL_MAX_FIRST).
   Preserve GraphQL codes/request IDs as ApiClientError in graphqlPost using
   the shared API-code guard in a separately testable graphql-response.ts parser; never display arbitrary upstream error messages
   on the audit page. Do not add browser-side audit fetching or test mocks.
2. Add client/lib/app/audit-state.ts: resolve real session and the existing
   active-org cookie selection, then owner/admin role before fetching audit
   rows. API remains the authority. Return explicit denied/unavailable/invalid
   page state for safe presentation; redirect expired sessions outside caught
   rendering paths. Backend FORBIDDEN after role change must show denial,
   NOT_FOUND must show unavailable organization, CURSOR_INVALID must offer
   restart; generic service errors offer retry without exposing internal text.
   No organization must retain AppShell's creation flow.
3. Add /app/audit Server Component page and a server-rendered audit workspace.
   Show heading “Audit history.”, newest-first events, human-readable action,
   UTC time using Intl, actor account identifier (or “Not recorded”), target
   type/id (or “Not recorded”), optionally a native details disclosure for full
   identifiers. Never request raw details JSON, emails, tokens or job failures.
   Use an ordered list of records with dl metadata so one semantic structure
   works on all widths. React escapes strings. Wrap long identifiers; no
   arbitrary HTML or links generated from event data. Keep unknown actions
   readable with a plain fallback, never throw on a new backend action.
4. URL pagination uses after and an organization-bound page parameter. Generate
   only local encoded hrefs. Apply after only when the page's organization
   matches the resolved active organization; switching organization must start
   at its first page, never replay a former organization's cursor. Give
   OrganizationSwitcher a narrowly typed optional /app/audit reset href, passed
   only for this section, so switching back also starts at the latest events. Reject
   duplicate/empty/overlong page values with an actionable invalid-page state.
   The server has a total GraphQL byte limit but no per-cursor maximum.
   Choose a defensive UI limit of 2048 characters (judgment, not a backend
   contract); generated cursors fit well below this limit. Provide “More events” when
   hasNextPage/endCursor permits and “Latest events” restart/refresh. Browser
   back/forward and refresh preserve the active page. Do not encode cursor
   history arrays or add offset pagination.
5. Add owner/admin Audit history navigation and activeSection to AppShell;
   avoid unrelated shell changes. Add a lightweight loading status using
   existing skeletons, and route error.tsx using the installed retry prop and
   shared RouteErrorBoundary. Extend the latter's activeSection union only as
   required; keep auth-specific navigation untouched.
6. Add focused pure helper tests and real-browser client/e2e/audit-history.spec.ts
   using existing Playwright infrastructure as explicitly required by this
   project prompt. Exercise real registration/org commands and actual GraphQL,
   no intercepted audit responses: owner sees actual organization/invitation
   events and safe metadata; create >20 events to prove pagination without
   duplicates, back/reload, first-page restart, and organization switch from a
   paginated URL. Join admin/analyst/viewer via real invitations: admin allowed,
   analyst/viewer direct route denied and nav hidden; unauthenticated redirect.
   Include malformed/foreign cursors, no-org state, keyboard-accessible
   pagination and 375/800/1280 overflow/44px control checks. Capture browser
   screenshots to output/playwright for visual inspection. Do not log tokens.
   Use existing server GraphQL isolation regression for server-side enforcement.

## Reference deltas and breakpoint behaviour

No authenticated audit comp exists, so record structure is a product design
judgment. Preserve canvas white, Crimson Text title, DM Sans explanation,
Roboto Mono identifiers/labels, brand eyebrow, rule borders and card-radius
and pill tokens. No new tokens, palette, motion or landing-page edits.
375: single-column records and wrapping controls within existing mobile shell.
800: persistent shell, metadata may use two columns without table overflow.
1280: existing page container/persistent shell and same bounded record list.
Use computed browser measurements to verify overflow and target size, not
invented comp comparisons. All record text must survive long IDs and 200% zoom.

## Non-goals

Job history is a separate journey 3.9 slice: jobs/runs currently returns global
scheduled runs, so do not expose it through this tenant audit interface or
invent its tenant semantics. No audit mutations/exports, search/filters,
retention policy, actor identity expansion, REST endpoint, schema/migration,
new dependency, infrastructure action, production drill or launch approval.
Ingestion/export progress exists and is not rebuilt.

## Verification and completion

Run targeted Prettier on changed files, git diff --check, npm run lint,
npm run typecheck, npm run build, npm run contracts:check, focused helper and
browser audit suite, and relevant existing server GraphQL tests. Inspect port
listeners before launching services; use isolated test ports and existing
local development database only. If sandbox prevents processes or localhost,
retry the exact necessary check with escalation and record actual outcomes.
Do not claim blocked checks passed. Inspect all changed files and final diff.
Then dispatch the mandatory read-only reviewer subagent with baseline/head,
this prompt, changed paths and checks; verify feedback and fix valid findings,
re-review significant changes. This is the sole delegated review seat.

After review, record implementation, commands/output, API/visual limits and
remaining job-history work in docs/authenticated-app.md; update
project-status.md's specific outstanding history item without changing the
completion estimate, and append bounded Phase 5 evidence to build-plan.md.
Run format/diff checks again. Stage only this prompt's files, review staged diff,
and commit to main with caveman-commit. No push. Give local run instructions:
npm run dev:server and npm run dev:client, sign in as owner/admin, select an
organization and open /app/audit.

## SKILLS USED

- frontend-design — plain copy and the established Acres visual direction.
- tailwind-design-system — reuse existing tokens without a second system.
- tailwind-4-docs — documented limited fallback for existing v4 utilities.
- shadcn — inspect and compose the installed base-nova primitives.
- vercel-react-best-practices — server-rendered bounded reads and leaf clients.
- web-design-guidelines — fresh UI review of the new page and controls.
- accessibility-compliance — semantics, keyboard, target size and responsive states.
- auth-implementation-patterns — session, role and selected-tenant enforcement.
- nestjs-best-practices — verified cursor codec prerequisite repair.
- error-handling-patterns — typed GraphQL failures and safe recovery states.
- openapi-spec-generation — confirm existing generated contracts stay unchanged.
- api-design-principles — preserve existing GraphQL pagination/error contracts.
- security-best-practices — secure-by-default audit metadata presentation.
- playwright — browser inspection and screenshots; project requires test files.
- e2e-testing-patterns — actual audit journeys against the existing API/database.
- javascript-testing-patterns — focused helper behavior regressions.
- requesting-code-review — mandatory independent read-only review.
- receiving-code-review — verify findings before changes.
- caveman-commit — required concise final local commit message.

## Execution finding — required cursor prerequisite

The first real browser pagination attempt failed with CURSOR_INVALID. Inspection
of server/src/graphql/cursor-codec.ts proves decode uses raw.indexOf('.') on
JSON + '.' + 32 binary SHA-256 MAC bytes. Real audit createdAt strings contain
fractional-second periods, and the binary MAC can also contain a period. Fix
only the delimiter selection: its position is raw.length - 33; verify the
separator at that position before authenticating the exact preceding bytes.
Preserve the wire format, key/domain separation, MAC verification and
kind/tenant checks. Add regression cases with fractional timestamps, periods
in string values and a real MAC containing a period, plus existing malformed
cursor/tenant/kind tests. This is necessary to execute this prompt's real
pagination requirement; it adds no API/schema. Record it in docs/backend.md.
Also include the explicit OrganizationAuditHistory operationName in the audit
POST: non-development API environments require it (graphql-limits.ts). Extend
graphqlPost with an optional operationName argument, leaving existing callers
compatible. Load nestjs-best-practices for this bounded backend fix.
