# 55 - Phase 3 ownership-transfer concurrency evidence

## Scope and why this is next

The committed `main` tip is `5859fc8` (`test(idempotency): prove concurrent replay and recovery`). The product foundations for phases 1–12 are committed. Prompts 50–54 closed focused evidence gaps for outbox recovery, governed reports, dashboard service behavior, analytics service behavior, and Phase 4 idempotency concurrency. The earliest remaining security acceptance gap that is both internal and dependency-safe is Phase 3's documented requirement for **concurrent ownership changes**.

Phase 3 already provides a layered last-owner defense:

- `OrganizationsService.transferOwnership()` locks the owning `Organization` row, promotes one target, demotes the actor, and appends an audit event in one organization-scoped transaction.
- `Membership_last_owner_guard` is a PostgreSQL `BEFORE UPDATE OR DELETE` trigger that locks the organization row and rejects removing the final active owner.
- The REST route additionally requires an active owner membership and a valid `Idempotency-Key`.

The real-database suite currently proves only that the trigger exists in PostgreSQL. It does not prove either that two competing ownership-transfer HTTP commands cannot leave zero or multiple live owners, or that the trigger actively rejects a direct final-owner removal under the real forced-RLS database role.

Implement one evidence-sized unit that extends `server/test/database.e2e-spec.ts` with isolated, deterministic real-PostgreSQL cases for those two invariants. Keep production behavior untouched unless this proof demonstrates a concrete transactional defect. Record only actually executed evidence in `docs/backend.md`, `docs/security.md`, and `docs/build-plan.md`.

This is deliberately narrower than broader membership lifecycle work: it closes the explicit Phase 3 concurrency item in the security acceptance suite without adding roles, membership workflows, routes, schemas, client UI, or operator policy.

## Required behavior and evidence matrix

### 1. Competing REST ownership transfers

Add one real HTTP/PostgreSQL case in the existing `Acres API — real database` suite. Reuse its application lifecycle, `signedInAgent()` helper, `beforeEach(truncateAll)`, and scoped inspection conventions. Do not create another database harness, do not stub `PrismaService`, and do not use a process-local lock or timing sleep to manufacture a winner.

Arrange one owner and two distinct active non-owner members in one organization through the public API:

1. Register/sign in the owner and both target accounts with separate `supertest` agents and CSRF tokens.
2. Have the owner create the organization with a unique valid idempotency key.
3. Issue a separate invitation to each target with separate valid invite keys; accept each invitation from the matching target agent with separate valid acceptance keys. Capture the two real membership IDs from the acceptance responses.
4. Start two `POST /api/v1/organizations/:organizationId/ownership-transfers` requests at the same time from the original owner session. Give each a distinct valid idempotency key and a different target membership ID. Both must carry the current owner CSRF token and the required organization header.

Assert behavior, not request ordering:

- Both requests settle within an explicit test timeout without an unhandled rejection, a PostgreSQL deadlock, or a hung transaction. `Promise.allSettled()` is appropriate; do not assert which promise settles first.
- Exactly one request returns the existing successful `200` envelope with `{ transferred: true }`.
- The losing request is rejected by the existing authorization/permission behavior after the winner demotes the original actor. Assert its stable envelope/code and status from the observed API contract rather than inventing a new public error. It must not report a successful transfer.
- Inspect the real database through a correctly scoped transaction. There is exactly one active membership with role `owner`; it belongs to exactly one of the two invited target accounts. The original actor is a live `admin`; the non-winning target remains its invited non-owner role. No membership is revoked by this race.
- Exactly one `ownership_transferred` audit record exists for the organization. Its actor and `details.previousOwnerMembershipId` identify the original owner membership; its target identifies the resulting owner membership. Do not log or assert opaque session/CSRF/invitation token values.
- The request that lost produces no success idempotency record. Account for the actual transaction rollback semantics: successful command state must be replayable only for the winning request; a failed callback must not leave a falsely succeeded record.
- A replay of the winning exact key/body from the now-demoted original-owner session is denied by the existing outer permission guard before it can reach idempotency. It must not create a second audit event or change the membership graph. This preserves current authorization-before-replay behavior rather than exposing a previously authorized command after demotion.
- A fresh ownership-transfer request by the demoted original owner is denied and makes no database change. This proves the winner's role change is observed by a later request, not merely in an in-memory response.

Use stable, distinct test emails and printable 16–128-character keys. Keep the test self-contained: never depend on another test's accounts, organization, or invitation rows.

### 2. Active enforcement of the last-owner database guard

Add a second real PostgreSQL test near the existing trigger catalog test. It must prove enforcement, not merely catalog presence.

1. Create an organization through the API and obtain the owner account and membership IDs.
2. Open a normal `PrismaService.$transaction`, set the same transaction-local account/organization/invitation settings that the suite uses for a tenant-scoped inspection, and attempt to demote or soft-revoke the sole active owner with Prisma.
3. Assert PostgreSQL rejects it with the trigger's constraint failure (`23514` / `cannot remove last active owner`) using a version-tolerant assertion that preserves the original database error rather than mapping it to an invented API response.
4. In a subsequent scoped transaction, prove the membership remains active with role `owner`, and prove no membership or audit mutation was committed by the rejected transaction.
5. Retain the existing catalog assertion that the named trigger exists. Do not use superuser SQL, a migration role, disabled RLS, trigger disablement, or unsafe raw SQL to bypass the runtime boundary.

The proof must operate under the real `acres_test` test role and migrated schema. If this test exposes a real RLS/context permission problem, diagnose it using the actual generated Prisma types, migration SQL, and database error before changing application or migration code.

### 3. Conditional production correction only when evidence fails

Do not refactor `OrganizationsService`, `TenantTransactionService`, the trigger function, RLS policies, or the schema merely for style. If either real race demonstrates an invariant violation, make the smallest correction that preserves all of the following:

- exactly one active owner per organization at every committed state;
- `Organization`-row serialization for ownership transfer, forced RLS, transaction-local tenant context, current fixed permission map, audit append behavior, idempotency scope/hashes/TTL/error codes, and public route contract;
- a failed mutation rolls back its idempotency reservation, audit row, and membership writes together;
- no raw tokens, session IDs, CSRF values, or invitation token hashes enter logs, errors, documentation, or persisted audit details;
- migrations are forward-only. Never edit the applied `20260824000000_organizations_rls` migration. Add a new migration only if a durable database correction is truly necessary, and explain the upgrade/rollback constraint in the owning docs.

Before changing SQL or Prisma transaction code, verify the exact Prisma 7.9.1 APIs/types from installed `node_modules` and follow the repository's tagged-template parameterization convention. Do not use `$queryRawUnsafe`, interpolated SQL strings, advisory locks, isolation weakening, new dependencies, retries with arbitrary sleeps, or process-local mutexes.

## Reference material read while preparing this prompt

Repository and implementation authorities:

- `AGENTS.md`, especially §§2–7, §8.2, §9.2, and §10: prompt-first phase control, server-first discipline, verification, review, and local-commit requirements.
- `docs/build-plan.md` §4: Phase 3's explicit last-owner/concurrent-transfer failure case, real-test requirement, required skills, and exit evidence.
- `docs/backend.md` §§8, 14, and 15: real PostgreSQL roles/RLS evidence, tenant transaction settings, organization REST surface, and idempotency transaction behavior.
- `docs/security.md` §§5, 8–9: TM-02 and the launch acceptance requirement for concurrent ownership changes.
- `docs/system-architecture.md` and `docs/product.md`: tenancy, fixed roles, permission semantics, and modular-monolith boundary.
- `docs/skills.md` §§2–4: locked skills, exact locations, phase manifests, and installation discipline.

Implementation and test evidence inspected:

- `server/src/organizations/organizations.service.ts`, especially `transferOwnership`, `requirePermission`, and active-membership lookup behavior.
- `server/src/organizations/organizations.controller.ts`, `organization-context.guard.ts`, `permission.guard.ts`, and `permissions.ts` for the existing route/guard contract.
- `server/src/organizations/audit.service.ts`, `server/src/prisma/tenant-transaction.service.ts`, and `server/src/idempotency/idempotency.service.ts` for transaction and rollback ownership.
- `server/prisma/schema.prisma` and `server/prisma/migrations/20260824000000_organizations_rls/migration.sql`, especially `acres_guard_last_owner` and `Membership_last_owner_guard`.
- `server/test/database.e2e-spec.ts`, `server/test/helpers/real-db-test-app.ts`, and `server/test/helpers/test-app.ts` for real-database lifecycle, role constraints, CSRF/session helpers, and scoped inspection patterns.
- `prompts/22-organizations-permissions-rls.md` and `prompts/54-idempotency-concurrency-evidence.md` for the approved original Phase 3 contract and current tested idempotency semantics.

No visual reference applies. This is a server/database evidence task: it changes no client route, component, CSS, token, asset, layout, typography, color, responsive behavior, or motion. The design-system PDF and landing comps are intentionally not opened.

## SKILLS USED

- `architecture-patterns` — preserve the organization service, transport guard, tenant-transaction, and PostgreSQL trigger boundaries while testing their composed invariant.
- `nestjs-best-practices` — retain feature-module, injected service, guard, transaction, and real Nest test-app conventions.
- `auth-implementation-patterns` — ensure the proof respects cookie sessions, CSRF, active membership, role policy, and server-side authorization.
- `postgres-best-practices` — validate the real PostgreSQL lock/trigger/RLS behavior and avoid unsafe or non-durable concurrency workarounds.
- `security-best-practices` — keep owner authority and opaque credential material fail-closed and non-disclosed while testing security-sensitive flows.
- `security-threat-model` — reconcile the repository-grounded TM-02 control/evidence claim without overstating what the tests prove.
- `error-handling-patterns` — preserve stable HTTP errors and retain actual database errors at the database-test boundary.
- `javascript-testing-patterns` — write independent Jest cases with explicit arrange/act/assert phases, fixtures, cleanup, and failure assertions.
- `e2e-testing-patterns` — use two focused, real-database HTTP/transaction scenarios rather than brittle implementation-level or timing-dependent tests.
- `requesting-code-review` — dispatch the mandatory reviewer after self-verification with the approved requirements, changed paths, checks, and `BASE_SHA`/`HEAD_SHA`.
- `receiving-code-review` — verify each reviewer claim against the phase contract and repository before changing code; re-review material transactional/security changes.
- `caveman-commit` — generate the required concise Conventional Commit message for the final local commit.

`api-design-principles` and `openapi-spec-generation` are not required: this prompt adds no route, DTO, response shape, REST/GraphQL contract, or generated artifact. `sql-optimization-patterns` is not required unless the failing real test requires a measured query/locking/index investigation. `playwright` is not required because this is not a browser UI acceptance task.

## Expected file impact

Required:

- Update `server/test/database.e2e-spec.ts` with the competing ownership-transfer race and active trigger-enforcement cases.
- Update `docs/backend.md` with the exact real-database commands, test counts, observed invariant evidence, and any verified limitation.
- Update `docs/security.md` TM-02 and the acceptance-suite evidence wording to distinguish this proof from still-deferred membership lifecycle features.
- Update `docs/build-plan.md` Phase 3's test/exit record with the exact suite names/counts actually observed.

Conditional only if a real invariant failure is demonstrated:

- Update the smallest necessary production file under `server/src/organizations/` or `server/src/prisma/`.
- Add a new forward-only Prisma migration under `server/prisma/migrations/` only when a persisted database correction is necessary; never alter an applied migration.

Do not update OpenAPI, GraphQL SDL, client code, generated Prisma artifacts, dependencies, or unrelated records unless a verification command demonstrates authorized drift. Stop for user direction if fixing a discovered failure would require a new public contract or a product-policy choice.

## Non-goals

- No new organization/member/invitation/ownership REST or GraphQL route, DTO, error code, permission, role, policy, or response envelope.
- No client authentication shell, dashboard, report, upload, ingestion, analytics, AI, worker, deployment, telemetry, or launch-readiness work.
- No organization sharing, collaboration, custom roles, SSO/SCIM, account recovery delivery, distributed rate limiting, or membership-history feature expansion.
- No broad trigger/transaction/idempotency refactor, no stronger isolation level by default, no advisory/distributed/process-local locking, and no retry loop that masks a lock bug.
- No claim that all TM-02, Phase 3, or launch lifecycle coverage is complete beyond the two exact real-database invariants proven here.

## Implementation sequence

1. Re-read this approved prompt, `AGENTS.md`, each owning documentation record, every named skill, and any routed skill reference necessary for the exact implementation surface before editing.
2. Re-check `git status --short`, branch, and `git log -1`; preserve unrelated user work and stop if this scope cannot be isolated.
3. Verify the installed Prisma 7.9.1 generated client/error/type surface and the existing real-db helper APIs before writing assertions or any conditional production correction. Confirm the migrated `acres_test` prerequisite using the documented database setup; an unavailable database is an actionable dependency failure, never a skipped pass.
4. Extend the real suite with the competing HTTP transfer case first. Run the focused test by name. Inspect the exact success and denial response envelopes before hard-coding the stable assertions.
5. Add the direct trigger-enforcement case using normal scoped runtime access. Run it independently and then together with the ownership tests.
6. If either test exposes a real production invariant defect, capture the exact failure, identify whether it belongs in service serialization, RLS/context setup, trigger semantics, or test setup, and make only the smallest verified correction. Rerun the focused cases after each correction.
7. Inspect all changed files, then run the full verification matrix below. Do not document results until they have run.
8. Update only the owning documentation with exact commands, date, suite/test counts, behavior proven, and residual limits.
9. Perform the mandatory two-stage review: use `requesting-code-review` to send a reviewer the requirements, changed files, decision not to refactor unless failure required it, checks, and exact `BASE_SHA`/`HEAD_SHA`; use `receiving-code-review` to verify every finding before acting. Re-review if code, schema, locking, RLS, or transaction behavior changed materially.
10. Stage only the approved files, review the staged diff and `git diff --check`, use `caveman-commit` to produce the commit message, commit locally on `main`, and do not push.

## Verification plan

Run from repository root. Quote actual output in the completion response and docs, including test suite/count totals:

1. Focused real PostgreSQL cases (use exact Jest test-name filters after naming them):

   ```bash
   npm run test:server -- --runInBand --testNamePattern='ownership|last-owner'
   ```

2. Full real database/server E2E suite:

   ```bash
   npm run test:server -- --runInBand
   ```

3. Full server unit/integration suite, ensuring no organization/idempotency regression:

   ```bash
   npm run test --workspace=@acres/server -- --runInBand
   ```

4. Contract drift, formatting, static checks, and build:

   ```bash
   npm run contracts:check
   npx prettier --check server/test/database.e2e-spec.ts docs/backend.md docs/security.md docs/build-plan.md
   npm run lint
   npm run typecheck
   npm run build
   ```

5. Operations regression gate, because these session/database invariants are launch-relevant:

   ```bash
   npm run ops:check
   ```

6. Final diff/state review:

   ```bash
   git diff --check
   git diff -- server/test/database.e2e-spec.ts docs/backend.md docs/security.md docs/build-plan.md server/src/organizations server/src/prisma server/prisma/migrations
   git status --short
   ```

The real database prerequisite is mandatory for steps 1–3. Follow `docs/backend.md` to run `npm run db:up`, deploy migrations with the correct role, and ensure the documented `acres_test` role is used. Do not replace a failing/missing real database boundary with a Prisma double, a mocked transaction, or a skipped test, and do not claim a concurrency proof passed without simultaneous requests exercising PostgreSQL.

## Completion and rollback evidence

The implementation is complete only when:

- two real simultaneous owner-initiated transfers have exactly one successful state transition and one durable active owner;
- the losing request cannot perform a second transfer, replay of the winning command cannot duplicate its audit/state change, and the demoted prior owner is denied on a fresh request;
- a real scoped PostgreSQL transaction actively rejects removal/demotion of the only owner and leaves committed membership/audit state intact;
- all focused, full server, contract, formatting, lint, typecheck, build, operations, and diff checks pass;
- the mandatory review loop has resolved all valid blocking/important findings;
- documentation contains only exact observed evidence and remaining TM-02 limitations; and
- the approved work is committed locally on `main` with no push.

Rollback is one revert of the resulting commit if it contains evidence and documentation only. If a verified production correction is necessary, the revert restores the previous behavior and removes its evidence/docs; a new migration, if genuinely required, is not rolled back by editing history—document a reviewed forward correction instead.
