# Prompt 359 — Audit history failure acceptance

## Scope and why next

Prepare a bounded Phase 5 acceptance follow-up to committed `6a63377`.
Audit history exists; this is not a second implementation of that surface.
The owning record explicitly identifies missing direct post-context session,
permission, organization-disappearance, query-outage and boundary-retry tests.
Close that verification gap before moving to later release acceptance.
Scheduled job history needs a separate tenant-scope decision and stays outside
this prompt. Preparing or committing this prompt does not authorize execution.

## References inspected and execution prerequisites

Planning inspected AGENTS.md §§2,5–7, docs/build-plan.md Phase 5 and Prompt 358,
docs/project-status.md, docs/skills.md, docs/authenticated-app.md Prompt 358,
docs/security.md, docs/automation.md, prompts/358-organization-audit-history.md,
client/lib/app/audit-state.ts, client/lib/api/server.ts,
client/app/app/audit/{page,error}.tsx, client/tests/audit-history.spec.ts,
client/e2e/audit-history.spec.ts, client/playwright.config.ts and both package
manifests. Re-read these at execution; inspect the workspace, boundary,
envelope, test harness store and harness route before changing them.

Read docs/backend.md and docs/system-architecture.md before any server/API
change. Verify Next redirects, cookies, async page props and the installed
error-boundary retry API from node_modules/next/dist/docs/ and installed types.
Verify Playwright fixtures, webServer and request APIs from installed sources.
No new dependency or framework API may be guessed.

This is behavioral acceptance, with no new visual design or comp measurements.
If a discovered defect requires component/styling changes, first read
docs/design-system.md, docs/components.md and docs/polish.md, open the applicable
§0 reference, and load all Phase 5 UI skills before making that bounded fix.
No static reference depicts an authenticated audit page; say so explicitly.

## Implementation plan

1. Inspect existing test infrastructure and establish a deterministic way to
   control the SSR upstream calls. Browser page.route cannot intercept the
   Next server's outgoing API requests. Prefer a test-owned local HTTP proxy
   pointed at the existing API origin, with isolated client/proxy ports and
   per-test fault rules. Keep it in test infrastructure; do not add public
   failure endpoints, global production flags or audit mock branches to the
   deployed application. Verify existing harness behavior before considering
   reuse; it currently has no audit-specific override.
   client/playwright.config.ts is an allowed bounded wiring change: distinguish
   the real upstream API origin from the SSR proxy origin, preserve API health
   checks against the real API, start the proxy before Next, and point Next's
   ACRES_API_ORIGIN at that proxy only for this isolated test run. Preserve the
   ordinary test configuration when this fault suite is not selected.
2. Use actual local API/database registration, organizations and audit rows for
   successful setup and recovery. Select faults by operation/path and test
   identity, with explicit barriers/counters establishing that session and
   organization context succeeded before the audit query fails. Avoid time
   sleeps or racing background membership changes. Serialize fault tests if
   required and reset rules in finally/fixture teardown. Stop only processes
   owned by this test run; never interrupt shared services.
3. Add focused cases in client/e2e/audit-history-failures.spec.ts (new), with
   test-owned support under client/e2e/ as needed. Extend existing helper tests
   only for new independent behavioral coverage. Cover this matrix:

   | Trigger                                                         | Required visible outcome                                                                 |
   | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
   | Audit query returns UNAUTHENTICATED after valid context         | Login redirect with local /app/audit return path; no audit rows or private upstream text |
   | Audit query returns FORBIDDEN after owner/admin context         | Access restricted, zero event rows, safe recovery navigation                             |
   | Audit query returns NOT_FOUND after context                     | Organization unavailable presentation, zero event rows                                   |
   | Audit query returns CURSOR_INVALID                              | Page unavailable and working Latest events restart                                       |
   | Query transport 503, malformed response or unexpected rejection | Safe inline failure state, no partial rows or raw upstream diagnostic                    |
   | Initial session/organization lookup fails unexpectedly          | Existing route boundary and functional retry after upstream restoration                  |

   Include a unique private sentinel in upstream error payloads and assert it
   never appears in rendered content. Start from visible real events where
   practical, then trigger a fresh navigation/reload so stale rows cannot hide
   failures. Verify successful retry/restart fetches real current-tenant rows.
   Distinguish simulated upstream outcomes from real revocation or live outages
   in test names and evidence. No simulated test proves production recovery.

4. Check the actual notice copy and control names in audit-workspace.tsx and
   route-error-boundary.tsx; assert existing behavior rather than inventing
   replacement labels. Verify keyboard activation/focus and accessible status
   or alert semantics on the relevant recovery controls. Retain existing
   no-organization, real role enforcement and tenant-switch tests unchanged.
5. If tests expose a defect, make the smallest justified correction in
   client/lib/app/audit-state.ts or the existing boundary/workspace. Preserve
   redirects outside catch blocks, server-side permissions, no-store reads,
   active-organization scoping, metadata-only queries and cursor binding.
   Do not export mutable test state into production modules or relax guards.

## Expected impact and non-goals

The /app/audit route gains direct regression evidence for failure/recovery;
successful runtime behavior should remain unchanged unless a test proves a bug.
No schema, migrations, API contract, job console, audit mutation, data retention,
actor expansion, dependency installation, production fault injection, deploy,
push, launch approval or whole-project completion recalculation.

## Verification and completion

Use the verified root scripts and client test runner:

```bash
npm run lint
npm run typecheck
npm run build
npm run contracts:check
npm run test:e2e --workspace=@acres/client -- tests/audit-history.spec.ts e2e/audit-history.spec.ts e2e/audit-history-failures.spec.ts --workers=1
git diff --check
```

Set isolated PLAYWRIGHT_CLIENT_PORT / PLAYWRIGHT_API_PORT and any test-owned
proxy port after checking listeners. Verify the runner actually routes SSR
through the proxy; do not count an unused fault rule as exercised. Keep faults
local and use only the existing designated development/test database. Build
before the production-server browser run; run typecheck sequentially after
build if generated Next types require it. Run targeted installed Prettier on
all changed files. Run relevant server tests only if a server fix is necessary.
Quote actual outputs, failures, skips and sandbox limitations. Inspect final
diff and prove test-process teardown and test-order independence.

Dispatch the mandatory read-only reviewer subagent with baseline/head, this
prompt, changed paths and actual checks. Evaluate findings with
receiving-code-review, fix valid issues and re-review significant changes.
Record evidence, synthetic-versus-live boundaries and residual work in
docs/authenticated-app.md; append bounded Phase 5 evidence to docs/build-plan.md
and update only the specific coverage gap in docs/project-status.md. Preserve
the dated completion estimate and all operator approval boundaries.

Review staged diff and whitespace, then commit only approved-task changes to
main with caveman-commit. Do not push. Ordinary revert rolls back this test
infrastructure and any bounded defect repair; no database rollback is needed.
To inspect manually, run npm run dev:server and npm run dev:client with the
existing local environment, sign in as owner/admin and open /app/audit.

## SKILLS USED

- e2e-testing-patterns — deterministic fault fixtures and real recovery journeys.
- javascript-testing-patterns — behavioral assertions and isolated fixtures.
- playwright — browser inspection; this prompt explicitly requests test files.
- auth-implementation-patterns — expiry and post-context authorization cases.
- error-handling-patterns — safe notices, transport failures and retry behavior.
- vercel-react-best-practices — preserve SSR boundaries and request-safe state.
- security-best-practices — preserve guards and keep fault injection test-owned.
- requesting-code-review — independent read-only implementation review.
- receiving-code-review — verify findings before applying corrections.
- caveman-commit — concise Conventional Commit for approved execution.
- frontend-design — conditional if a defect requires changing visible UI.
- tailwind-design-system — conditional for token/component repairs.
- tailwind-4-docs — conditional for verified styling repairs.
- shadcn — conditional when changing or composing installed primitives.
- web-design-guidelines — conditional UI compliance review after a visual fix.
- accessibility-compliance — conditional for component/interaction repairs.
- api-design-principles — conditional if an API defect requires repair.
- nestjs-best-practices — conditional for any server repair.
