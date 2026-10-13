# Prompt 360 — close the global maintenance history boundary

## Scope and why next

Baseline `ea97525` on `main`. Prompts 358–359 implemented organization audit
history and failure acceptance. The next dependency-safe prerequisite is the
known global scheduled-run disclosure called out by `docs/project-status.md`:
`GET /api/v1/jobs/runs` currently authorizes a tenant owner/admin but queries
unscoped `JobRun` telemetry. Its messages contain global purge counts. An
organization role cannot grant operator authority. Do not invent an operator
role, assign global runs to a tenant, or build a console on this response.

Make the existing route fail closed with HTTP 403 / `FORBIDDEN` after its
existing session, organization and permission guards. Missing session stays
401; missing/foreign/revoked organization stays 404; analyst/viewer stays 403.
Owners/admins now also receive a fixed denial, without reading any JobRun row.
This is an intentional security compatibility correction: scripts polling this
route must stop; no tenant-accessible replacement for global telemetry exists.
Internal scheduler start/finish/listRecent, persistence and metrics stay intact.
User explicitly requested implementation after preparing the prompt.

## Reference material

Read `AGENTS.md`, `docs/build-plan.md` Phase 4/5 and current evidence,
`docs/project-status.md`, `docs/product.md` journey 3.9,
`docs/backend.md` route/auth/jobs/contracts records, `docs/security.md`,
`docs/system-architecture.md` module/tenant boundaries, `docs/skills.md`.
Inspect `server/src/jobs/{jobs.controller,jobs.controller.spec,job-runs.service,
job-runs.service.spec,jobs.module}.ts`, `server/test/api.e2e-spec.ts`,
`server/src/common/api-exception.filter.ts`,
`server/src/contracts/{openapi,generate-contracts}.ts`, installed Nest/Swagger
decorator declarations and existing contract generation scripts.
No visual change or measurements; comps, Next APIs and browser QA are inapplicable.

## SKILLS USED

- architecture-patterns — separate operator telemetry from organization authority.
- nestjs-best-practices — route guards, exception handling and DI.
- api-design-principles — intentional compatibility correction and stable errors.
- openapi-spec-generation — document actual denial without a fictitious 200 response.
- auth-implementation-patterns — preserve session/organization/role guard order.
- error-handling-patterns — fixed denial through the existing envelope filter.
- javascript-testing-patterns — controller and scheduler regression tests.
- e2e-testing-patterns — Supertest HTTP guard/response acceptance.
- requesting-code-review — independent read-only reviewer after self-verification.
- receiving-code-review — verify and resolve valid review findings.
- caveman-commit — required local commit message.

## Implementation steps

1. Re-read this prompt and all named skills before changes. Preserve unrelated
   work. Do not change schemas, roles, permission inventories or tenancy topology.
2. Remove the controller's dependency on `JobRunsService`. Keep the existing
   route and ordered guards/`jobs.read` decorator. Handler returns `never` and
   throws `ForbiddenException` with fixed safe text. No DB query, service read,
   counts, identifiers, job names or exception text may be returned.
3. Replace the success-envelope decorator on this handler with explicit
   installed Swagger operation/auth/error response decorators using existing
   `errorEnvelope()`. Describe disabled global maintenance telemetry, mark the
   operation deprecated and document 401/403/404. No advertised 200 response.
   Update the generator-owned matrix notes and regenerate committed contracts
   using `npm run contracts:generate`. GraphQL SDL must remain unchanged.
4. Replace the controller's old successful-read test with denial/status/message
   assertions. Adapt HTTP owner/admin tests to seed nonempty sentinel global
   telemetry and prove 403, safe envelope, no data and no JobRun lookup. Test
   each role, anonymous, missing organization, and inaccessible/revoked context
   with the existing mock/app fixtures. Retain guard-specific outcomes and
   assert no telemetry read for all cases. Do not start real infrastructure for
   a denial path that does not access job persistence.
5. Verify scheduler unit regressions (`job-runs`, `session-maintenance`,
   `retention-maintenance`) to prove bookkeeping remains usable. Add focused
   OpenAPI assertions for deprecation, documented denials and absence of 200
   if the existing contract tests provide a suitable seam.
6. Self-verify: scoped Prettier check (server config for TS), focused jobs unit
   tests, API e2e suite or focused job/session/organization acceptance, generated
   contracts check, root lint, production build then root typecheck (avoid
   racing Next output), `git diff --check` and full changed-file diff review.
   Record actual commands, counts and any sandbox failures. Retry only an
   authorized low-risk check with escalation when required; never call a
   blocked check passed. No production, online audit, full release or launch
   acceptance claim.
7. Dispatch one read-only reviewer subagent with baseline SHA, working-tree
   diff, this prompt, implementation rationale and actual check results.
   Verify feedback with receiving-code-review; fix valid findings and repeat
   affected checks/review as necessary.
8. Update current backend route/auth guidance and append Prompt 360 evidence;
   document the corrected boundary in security and the build plan. Update
   project-status remaining-history wording: ingestion/export progress and
   audit meet journey 3.9; global maintenance console is operator-only and no
   tenant replacement is promised. Preserve dated estimates/historical evidence.
9. Format changed prose, inspect staged diff and commit only this task to
   `main` with caveman-commit. Include compatibility/security rationale in the
   body. No push.

## Expected impact and non-goals

Only the legacy `/api/v1/jobs/runs` success behavior changes to explicit denial.
No UI, client routes, ingestion/export progress, scheduler behavior, migration,
new operator authentication, unified job console, production operations or
launch approval. Tenant-scoped progress endpoints retain their existing policy.

## Rollback and exit

An ordinary revert restores the previous behavior but reopens global telemetry
disclosure; do not recommend rollback as an access workaround. Exit requires
all applicable checks, independent review, truthful docs/contracts and a local
commit. Inspect with `git show --stat HEAD`; run the API via
`npm run dev:server`, then an authenticated owner/admin request to
`/api/v1/jobs/runs` with the active organization header must return 403 without
global rows. No credentials are placed in documentation or command output.
