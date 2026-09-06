# 56 - Phase 3 membership and invitation lifecycle evidence

## Scope and why this is next

The committed `main` tip is `991d8d8` (`fix(auth): serialize ownership transfers`). The product foundations for phases 1–12 are committed. Prompts 50–55 closed focused evidence gaps for outbox recovery, governed reports, dashboard and analytics service behavior, idempotency concurrency, and ownership-transfer concurrency. The earliest remaining build-plan gap is still Phase 3: `docs/build-plan.md` explicitly leaves the broader membership lifecycle matrix, invitation delivery/recovery, and operator policy separately scoped after Prompt 55.

Two parts of that remainder require decisions this repository does not contain. A production SMTP provider and abuse/complaint process are open product/launch decisions, and invitation/session/token retention values require operator approval. Do not invent either. The earliest dependency-safe unit is the already implemented organization membership and invitation lifecycle itself:

- fixed role-to-permission and assignable-role policy;
- non-owner role changes and audit evidence;
- soft membership revocation taking effect on the next product request without destroying the account session;
- reinvitation reactivating the existing revoked membership under the newly invited role;
- invitation uniqueness, recipient binding, expiry, revocation, acceptance, and single-use behavior;
- forced-RLS/default-deny behavior and durable audit/idempotency state across those transitions.

Implement one evidence-sized unit that expands the isolated policy suite and the real PostgreSQL HTTP suite. Keep production behavior untouched unless the new proof demonstrates a concrete defect. Record only evidence actually executed in `docs/backend.md`, `docs/security.md`, and `docs/build-plan.md`. Do not call Phase 3 complete: mail delivery, public account recovery, retention policy, and operator-owned launch values remain separate work.

## Required behavior and evidence matrix

### 1. Exhaustive fixed-role policy unit matrix

Expand `server/src/organizations/permissions.spec.ts` so it proves the organization-administration contract directly instead of covering only report/export permissions.

Use table-driven Jest cases over the four fixed roles and the existing exported policy API. Assert at minimum:

- `owner` has `organization.update`, `members.read`, `members.invite`, `members.change_role`, `members.revoke`, `ownership.transfer`, `invitations.read`, `invitations.revoke`, and `audit.read`;
- `admin` has all of those organization-administration permissions except `ownership.transfer`;
- `analyst` and `viewer` retain `organization.read` but have none of the membership, invitation, ownership-transfer, or audit administration permissions;
- generic assignment can never assign `owner`;
- an owner may assign `admin`, `analyst`, or `viewer`;
- an admin may assign `analyst` or `viewer`, but not `admin` or `owner`;
- analysts and viewers may assign no role.

Preserve the existing report/export assertions. Test `OrganizationPolicy.has()` and `OrganizationPolicy.canAssignRole()` as the public policy boundary; do not duplicate the permission sets in production or export internal maps solely for testing.

### 2. Real PostgreSQL membership evolution and audit trail

Add an isolated real HTTP/PostgreSQL case under the existing `Acres API — real database` organization/RLS area. Reuse `signedInAgent()`, the existing application lifecycle, `beforeEach(truncateAll)`, real CSRF/session cookies, valid 16–128-character idempotency keys, and the suite's transaction-local inspection convention. Do not stub Prisma or call service methods directly.

Arrange an owner, an admin, and a viewer in one organization through public commands:

1. The owner creates the organization.
2. The owner issues and each target accepts a distinct invitation.
3. Invitations use normalized matching emails and non-owner roles only.

Exercise and prove the policy and state transitions through REST:

- The admin can invite or manage an allowed lower role, but cannot issue an `admin` or `owner` invitation. Assert the observed stable status/error code and ensure no invitation/audit/idempotency success state is committed for the denial.
- The owner changes the viewer to `analyst`; a permitted admin then changes that non-owner membership to `viewer`. Use the existing route and assert returned membership identity/role rather than only the status.
- A member cannot change their own role through the generic role route, and an owner cannot be changed through it. Both must retain the existing conflict/validation behavior and make no membership or audit mutation.
- The permitted actor soft-revokes the viewer. The owner member listing retains the row with the same membership ID and a non-null `revokedAt`; no physical delete occurs.
- The revoked account's already-issued cookie remains a valid account session through `GET /api/v1/auth/session`, but its subsequent organization list omits the organization and a direct organization-scoped request returns the existing indistinguishable `404 NOT_FOUND`. This proves revocation is evaluated on later product requests instead of being cached in the session.
- The owner issues a new invitation for the revoked account with an allowed, deliberately different role. Acceptance reactivates the same `(organizationId, accountId)` membership identity, clears `revokedAt`, applies the new invited role, and restores organization access on the next request.

Inspect durable state in a correctly scoped real transaction and assert logically exact audit evidence:

- the expected `invitation_issued`, `invitation_accepted`, `membership_role_changed`, and `membership_revoked` actions exist for the correct organization, actors, target types, and target IDs;
- role-change detail allowlists preserve only `oldRole` and `newRole`, and invitation acceptance detail preserves only `membershipId`;
- reactivation does not create a second membership row for the same account/organization;
- no raw invitation token, token hash, session token, CSRF token, cookie value, or credential appears in audit details or test output.

Do not assert incidental timestamps, UUID ordering, or JSON serialization beyond the documented contract. Use counts only where this scenario creates a known exact number of the relevant action.

### 3. Real invitation state-machine and single-use matrix

Add independent real-database cases for invitation failure states. Keep each case self-contained with unique emails and keys; never rely on another test's data or ordering.

#### Active uniqueness and revocation

- A second live invitation for the same normalized email and organization returns the existing `409 CONFLICT` and does not create a second live row or second successful issue audit.
- Revoking an unaccepted invitation returns `{ revoked: true }`, records exactly one `invitation_revoked` audit event, and is idempotent at the state level if the same route is called again: no second audit event and no token resurrection.
- The revoked raw token returns the existing indistinguishable `404 NOT_FOUND` when the matching signed-in account attempts acceptance. It creates no membership and no `invitation_accepted` audit event.
- After revocation, a replacement invitation for the same email is allowed. Preserve the prior revoked row as history and create one new live invitation; do not reuse or expose a prior token hash.

#### Recipient, expiry, and accepted-state binding

- A valid live token presented by a different signed-in email returns `404 NOT_FOUND`, leaves the invitation live, and creates no membership or acceptance audit for the wrong account. The correct recipient can still accept it afterward.
- An expired token returns `404 NOT_FOUND`, creates no membership or acceptance audit, and remains unavailable even if retried. Use a scoped real transaction to move only that fixture's `expiresAt` into the past; do not alter `INVITATION_TTL_HOURS`, use fake global time, or sleep.
- An accepted invitation cannot be revoked and returns the existing `409 CONFLICT`. Its membership and accepted timestamp remain unchanged.
- Retain the existing sequential replay and expired-replacement tests; consolidate helpers only when that reduces duplication without obscuring the public request flow.

#### Concurrent single-use acceptance

Prove single use under concurrency rather than only sequential replay:

1. Create one live invitation for a signed-in matching account.
2. Start two `POST /api/v1/invitations/accept` requests concurrently from that account with the same raw token and distinct valid idempotency keys.
3. Await both without timing sleeps or assertions about which request wins.
4. Exactly one response is the existing `200` success and exactly one is the existing `404 NOT_FOUND` denial.
5. Exactly one active membership, one accepted invitation state, and one `invitation_accepted` audit row commit.
6. Exactly one successful acceptance idempotency record commits. The losing transaction must not leave a falsely succeeded or in-progress record.
7. A later fresh-key replay of the raw token remains `404 NOT_FOUND` and cannot change any of those counts.

If simultaneous requests expose a database serialization, unique-constraint, or mapped-error defect, preserve the public not-found behavior for unavailable tokens and correct only the smallest transactional boundary necessary. Do not weaken recipient/expiry/RLS predicates or reveal whether a guessed token exists.

### 4. Conditional production correction only when evidence fails

Do not refactor `OrganizationsService`, guards, DTOs, audit allowlists, `TenantTransactionService`, idempotency, RLS policies, or migrations for style. If a required case fails because production behavior violates the documented contract, make the smallest correction that preserves all of these invariants:

- sessions authenticate accounts, while active organization membership is re-read for organization authorization;
- generic assignment never creates an owner and the owner route is never a generic role-change shortcut;
- revocation is soft, immediately effective for subsequent organization requests, and reversible only through a new valid invitation under current policy;
- invitation tokens are CSPRNG values returned once, stored only as hashes, bound to normalized recipient email, expiring, revocable, and single-use;
- unavailable, foreign-recipient, expired, revoked, accepted, and guessed tokens remain indistinguishable through the existing safe error contract;
- membership/invitation mutations, audit events, and idempotency state commit or roll back atomically inside the existing scoped transaction;
- forced RLS and transaction-local account/organization/invitation context remain authoritative;
- no raw credentials or tokens enter logs, errors, persisted audit details, documentation, or snapshots;
- applied migrations are immutable. Add a forward-only migration only if a durable database correction is necessary, and document its compatibility/rollback constraint.

Before changing Prisma transaction or raw-query behavior, verify the exact Prisma 7.9.1 generated types and installed declarations. Use tagged parameterized SQL only. Do not use `$queryRawUnsafe`, interpolated SQL strings, process-local locks, arbitrary sleeps, weakened isolation, broad retries, new dependencies, or test-only production branches.

If fixing a failure requires a new route, delivery provider, public recovery flow, retention value, role, permission, response code, or client change, stop and request user direction because that exceeds this prompt.

## Reference material read while preparing this prompt

Repository and product authorities:

- `AGENTS.md`, especially §§2–7, §8.2, §9.2, and §10: prompt-first phase control, server-first discipline, skill loading, verification, review, and local commit requirements.
- `docs/build-plan.md` §§1, 4, and 14: Phase 3 dependencies, fixed policy, invitation expiry/replay, revoked/stale membership, audit and RLS expectations, and the residual lifecycle matrix after Prompt 55.
- `docs/product.md` §§2–7: the four fixed roles, explicit ownership transfer, immediate membership revocation, invitation journey, data classification, success criteria, and operator-owned open decisions.
- `docs/backend.md` §§12–15: the implemented organization route map, session/CSRF/idempotency behavior, transaction-local RLS settings, invitation hardening migrations, and ownership-transfer evidence.
- `docs/security.md` §§5–9 and §§15–17: attacker capabilities, role/context escalation abuse path, TM-02/TM-03/TM-04/TM-05, current controls, and operator-owned production gaps.
- `docs/system-architecture.md` §§7–8: tenant identities, forced RLS, permission policy, REST command ownership, safe errors, and idempotency rules.
- `docs/skills.md` §§2–4: locked skill locations, triggers, and Phase 3 manifest.

Implementation and test evidence inspected:

- `server/src/organizations/organizations.controller.ts`, `organizations.service.ts`, `permissions.ts`, `permissions.spec.ts`, `dto.ts`, `organization-context.guard.ts`, `permission.guard.ts`, and `audit.service.ts`.
- `server/src/prisma/tenant-transaction.service.ts`, `server/src/idempotency/idempotency.service.ts`, `server/src/auth/auth.controller.ts`, and `server/src/sessions/sessions.service.ts`.
- `server/prisma/schema.prisma` and organization/RLS migrations beginning at `20260824000000_organizations_rls`, including invitation acceptance policy hardening.
- `server/test/database.e2e-spec.ts`, `server/test/api.e2e-spec.ts`, `server/test/helpers/real-db-test-app.ts`, and `server/test/helpers/test-app.ts` for current real/mocked coverage and shared lifecycle helpers.
- `prompts/22-organizations-permissions-rls.md`, `prompts/54-idempotency-concurrency-evidence.md`, and `prompts/55-ownership-transfer-concurrency-evidence.md` for the approved original contract and immediately preceding evidence boundaries.

No visual reference applies. This is a server/database policy and evidence task. It changes no client route, React component, CSS, Tailwind token, shadcn primitive, asset, typography, color, layout, breakpoint behavior, accessibility surface, or motion. The design-system PDF and landing PNG/WebM references are intentionally not opened.

## SKILLS USED

- `architecture-patterns` — preserve the organization application-service, transport guard, tenant-transaction, persistence, and audit boundaries while testing their composed lifecycle.
- `nestjs-best-practices` — retain feature-module dependency injection, declarative guards, DTO validation, transactions, and the existing real Nest/Supertest harness.
- `postgres-best-practices` — validate forced RLS, partial uniqueness, soft-revocation history, transaction atomicity, and single-use invitation behavior in real PostgreSQL.
- `auth-implementation-patterns` — verify the distinction between account session authentication and current organization authorization, plus centralized permission-based role assignment.
- `security-best-practices` — keep cookie-authenticated mutations CSRF-protected, input validated, unavailable tokens non-enumerable, and credentials absent from errors/logs/audit.
- `security-threat-model` — update TM-02 evidence narrowly and distinguish implemented lifecycle controls from unresolved mail/recovery/operator boundaries.
- `error-handling-patterns` — preserve stable safe REST failures, avoid swallowing concurrent/database errors, and retain root-cause context inside the test boundary.
- `javascript-testing-patterns` — add table-driven Jest policy tests and independent Arrange/Act/Assert real-integration fixtures with exact failure assertions and cleanup.
- `e2e-testing-patterns` — exercise complete session/CSRF/guard/DTO/service/RLS/audit flows through real HTTP without brittle timing or implementation-only assertions.
- `requesting-code-review` — dispatch the mandatory reviewer after self-verification with requirements, changed paths, checks, and exact `BASE_SHA`/`HEAD_SHA`.
- `receiving-code-review` — verify every finding against repository behavior and this prompt before changes; re-review material auth, transaction, schema, or RLS corrections.
- `caveman-commit` — generate the required terse Conventional Commit message for the final local commit.

`api-design-principles` and `openapi-spec-generation` are not required because this prompt adds no public route, DTO, response, version, GraphQL, or OpenAPI contract. `sql-optimization-patterns` is conditional only if a failing concurrency case requires measured lock/index/query-plan analysis. `playwright` is not required because no browser UI changes or browser acceptance surface are in scope.

## Expected file impact

Required:

- Update `server/src/organizations/permissions.spec.ts` with the exhaustive organization-administration permission and assignment matrix.
- Update `server/test/database.e2e-spec.ts` with real membership evolution/revocation/reactivation and invitation lifecycle/concurrency evidence.
- Update `docs/backend.md` with the exact commands, suite/test counts, durable state observed, and residual Phase 3 limitations.
- Update `docs/security.md` TM-02 and acceptance evidence so it states exactly which role/invitation/revocation paths are now proven and which delivery/recovery/operator controls remain open.
- Update `docs/build-plan.md` Phase 3's status/test record with the exact evidence and remaining dependency-gated work.

Conditional only if a test proves a production defect:

- Update the smallest necessary file under `server/src/organizations/`, `server/src/prisma/`, `server/src/idempotency/`, or their focused unit tests.
- Add a new forward-only migration under `server/prisma/migrations/` only if a persisted database invariant requires correction; never edit an applied migration.
- Update `docs/product.md` or `docs/system-architecture.md` only if a verified implementation correction changes their current-state wording without changing the approved product policy.

Do not update generated OpenAPI/GraphQL artifacts, shared contracts, client code, dependencies, production environment examples, launch-readiness records, or unrelated docs unless an authorized production correction creates genuine drift. A needed public/product/operator decision stops this prompt.

## Expected route impact

No route or response contract should change. The evidence exercises existing endpoints only:

- `GET /api/v1/auth/session`;
- `GET /api/v1/organizations`;
- `GET /api/v1/organizations/:organizationId`;
- `GET /api/v1/organizations/:organizationId/members`;
- `PATCH /api/v1/organizations/:organizationId/members/:membershipId`;
- `DELETE /api/v1/organizations/:organizationId/members/:membershipId`;
- `GET /api/v1/organizations/:organizationId/invitations`;
- `POST /api/v1/organizations/:organizationId/invitations`;
- `DELETE /api/v1/organizations/:organizationId/invitations/:invitationId`;
- `POST /api/v1/invitations/accept`.

Successful envelopes, validation/forbidden/conflict/not-found codes, organization header behavior, CSRF, and idempotency remain as currently generated and documented.

## Non-goals

- No SMTP provider, email sender, invitation email template, notification queue, domain/DNS choice, bounce/complaint procedure, or delivery claim.
- No public password recovery, verification, revoke-all-sessions, invitation resend, account deletion, organization deletion, leave-organization, or invitation administration UI.
- No invented invitation/session/token/audit retention period, cron threshold, SLO, capacity value, or production environment setting.
- No new role, custom role, entitlement, permission, self-service ownership shortcut, SSO/SAML, SCIM, billing, or external identity provider.
- No new REST/GraphQL route, DTO, response field, error code, idempotency semantics, client surface, or generated contract.
- No broad service/guard/transaction/RLS/idempotency refactor, trigger replacement, advisory lock, process-local mutex, timing sleep, or retry loop that masks a race.
- No claim that every Phase 3, TM-02, TM-03, TM-04, TM-05, or launch-readiness requirement is complete beyond the exact evidence added here.

## Implementation sequence

1. Re-read this approved prompt, `AGENTS.md`, every owning documentation file, every named skill, and each routed skill reference required for the exact implementation surface before editing.
2. Re-check `git status --short`, current branch, and `git log -1`; preserve unrelated user work and stop if the approved paths cannot be isolated.
3. Verify installed Nest/Jest/Supertest and Prisma 7.9.1 APIs from local package source/types before introducing any API usage not already present in the repository. Confirm the real `acres_test` database role and migrations using `docs/backend.md`; an unavailable database is a failed prerequisite, never a skipped pass.
4. Expand `permissions.spec.ts` first and run that focused suite. Use table cases that make the complete role/assignment contract readable from the failure output.
5. Add small local test helpers in `database.e2e-spec.ts` only when they encode repeated public fixture setup (create organization, issue/accept invitation, scoped evidence read). Keep assertions in their owning test and prevent helpers from hiding the route, actor, headers, or expected role.
6. Add and run the membership evolution/revocation/reactivation case. Verify the session-vs-membership distinction through HTTP and the durable membership/audit graph through a scoped real transaction.
7. Add invitation state-machine cases one group at a time and run each focused test. Add concurrent acceptance last; use concurrent requests and behavior-based winner/loser assertions with no sleeps.
8. If any case exposes a production defect, capture the exact response/database state, locate the failure in policy, guard, service transaction, RLS, uniqueness, audit, or idempotency behavior, and make only the smallest verified correction allowed above. Rerun the failing focused case after each correction.
9. Inspect every changed file and run the complete verification matrix. Do not record test totals or claim evidence before the commands finish.
10. Update only the owning docs with the date, exact commands and totals, behavior proven, conditional correction rationale if any, and remaining mail/recovery/retention/operator limitations.
11. Perform the mandatory two-stage review: use `requesting-code-review` to dispatch a reviewer subagent with the approved requirements, changed paths, production-code-conditional rule, verification output, and exact `BASE_SHA`/`HEAD_SHA`; use `receiving-code-review` to verify every finding against code and policy before acting. Re-review if auth/authorization, transaction, schema, RLS, idempotency, or public behavior changes materially.
12. Stage only approved files, inspect the staged diff and `git diff --check`, use `caveman-commit` to produce the message, commit locally on `main`, and do not push.

## Verification plan

Run from the repository root and quote real output in the completion response and owning docs where appropriate.

1. Focused policy unit suite:

   ```bash
   npm run test --workspace=@acres/server -- src/organizations/permissions.spec.ts --runInBand
   ```

2. Focused real PostgreSQL lifecycle cases using the final exact Jest names:

   ```bash
   npm run test:e2e --workspace=@acres/server -- --runInBand --testNamePattern='membership lifecycle|invitation lifecycle|single-use invitation'
   ```

   If the final descriptive names differ, adjust only the filter text so every new real-database case runs and report the exact command used.

3. Full server unit/integration suite:

   ```bash
   npm run test --workspace=@acres/server -- --runInBand
   ```

4. Full real server E2E suite:

   ```bash
   npm run test:server -- --runInBand
   ```

5. Contract drift and formatting:

   ```bash
   npm run contracts:check
   npx prettier --check server/src/organizations/permissions.spec.ts server/test/database.e2e-spec.ts docs/backend.md docs/security.md docs/build-plan.md
   ```

   Add a conditionally changed production/doc path to the Prettier command rather than formatting unrelated files.

6. Repository static and production checks:

   ```bash
   npm run lint
   npm run typecheck
   npm run build
   npm run ops:check
   ```

7. Final diff and state review:

   ```bash
   git diff --check
   git diff -- server/src/organizations/permissions.spec.ts server/test/database.e2e-spec.ts docs/backend.md docs/security.md docs/build-plan.md server/src/organizations server/src/prisma server/src/idempotency server/prisma/migrations docs/product.md docs/system-architecture.md
   git status --short
   ```

The real PostgreSQL prerequisite is mandatory for steps 2 and 4. Follow `docs/backend.md` to start the database, deploy migrations with the correct role, harden test/runtime privileges, and confirm the destructive suite targets only the documented `acres_test` role/database. Do not replace the real boundary with a Prisma double, skip, fake timer, or mocked transaction. Do not claim concurrent single-use evidence without two actual HTTP requests exercising PostgreSQL.

## Completion and rollback evidence

The implementation is complete only when:

- the fixed role and assignable-role policy matrix passes for all four roles;
- real HTTP/PostgreSQL evidence proves permitted role changes, forbidden/self/owner paths, soft revocation, subsequent-request denial, session survival, and invitation-mediated reactivation of the same membership identity;
- live duplicate, wrong-recipient, expired, revoked, accepted, replacement, sequential replay, and concurrent single-use invitation states produce the existing safe contracts and exact durable state;
- audit details contain only allowlisted metadata and no raw invitation/session/CSRF/credential material;
- failed mutations leave no false success idempotency record, acceptance audit, membership, or partial invitation transition;
- all focused, full server, contract, formatting, lint, typecheck, build, operations, and diff checks pass;
- mandatory review is complete and all valid blocking/important findings are resolved;
- docs state the exact evidence without claiming mail delivery, account recovery, retention/operator policy, or full launch readiness; and
- approved files are committed locally on `main` without a push.

Rollback is one revert of the resulting commit. For a tests/docs-only result, that removes only the new evidence. If runtime code changes, the revert restores the prior behavior and removes its evidence together. If a new forward-only migration is required, document why reverse migration is unsafe and provide a reviewed forward-correction path; never edit, delete, or rewrite an applied migration.
