# 54 - Phase 4 Idempotency Concurrency Evidence

## Scope and why this is next

The committed `main` tip is `13d4c84` (`test(analytics): add phase 8 service unit suite`). All twelve target phases have committed foundations. Prompts 50–53 closed focused service-evidence gaps in Phases 6, 10, 9, and 8, while Phase 7 already has parser, publication, geometry, provider, hierarchy, and real-PostGIS evidence. The next unresolved foundational service boundary is therefore Phase 4's replay-safe command idempotency contract.

`IdempotencyService` is shared by organization, upload, ingestion, dashboard, report, export, and optional AI commands. The HTTP E2E suite proves missing-key rejection, successful replay, changed-body conflict, and expired-key cleanup for representative organization requests. It does not directly exercise every branch in `server/src/idempotency/idempotency.service.ts`, and its mocked Prisma path cannot prove that two real PostgreSQL transactions racing on `IdempotencyRecord_unique_scope` converge safely.

Implement one evidence unit that:

1. Adds exhaustive isolated Jest coverage for key validation, scope construction, canonical request hashing, expiry, replay, conflict, reservation, completion, callback failure, and unique-conflict recovery.
2. Adds a real-PostgreSQL concurrency case to the existing database E2E suite. Two simultaneous commands with the same principal, organization scope, operation, idempotency key, and canonical request body must produce one durable side effect and the same successful response. A changed body under the same live key must continue to fail with `IDEMPOTENCY_CONFLICT`.
3. If the real race exposes a PostgreSQL transaction-abort problem after a Prisma `P2002`, replace only the reservation path with an atomic, parameterized PostgreSQL/Prisma 7 strategy that does not first poison the transaction and then attempt another query. Verify the exact Prisma API from the installed `node_modules` and follow existing tagged-template raw SQL conventions; do not guess an API or interpolate SQL strings.
4. Reconcile the Phase 4 verification record in `docs/backend.md`, `docs/security.md`, and `docs/build-plan.md` with the evidence actually produced.

This is the next prompt-sized unit because it closes a cross-cutting integrity boundary used by every later command surface without changing those surfaces or broadening product scope.

## Required behavior and test matrix

### 1. Isolated `IdempotencyService` suite

Create `server/src/idempotency/idempotency.service.spec.ts` using `@nestjs/testing`, `jest.useFakeTimers()`, a fixed system time, a minimal `AcresConfigService` test double, and a typed transaction-client double. Restore timers and mocks after each test so the suite cannot leak clock or call state.

Cover these behaviors:

- Reject an absent key and every nonconforming key with the existing `IDEMPOTENCY_KEY_REQUIRED` API exception before any transaction-client method or callback runs. Include keys below 16 characters, above 128 characters, whitespace/control characters, and non-ASCII characters.
- Accept the exact 16- and 128-character printable-ASCII boundaries. Do not weaken or broaden the existing key grammar.
- Freeze time and prove `expiresAt` is exactly `idempotencyTtlHours` after reservation time.
- Prove the lookup and cleanup scope contains the SHA-256 key digest, `accountId`, nullable `organizationId`, and `operation`, and that the raw idempotency key is never persisted.
- Prove expired records in the same exact scope are deleted before the live-record lookup; do not delete records outside the principal/organization/operation/key scope.
- Prove canonical JSON hashing is stable for recursively reordered object keys while preserving array order and value types. Assert the domain-separated `idempotency-key:` and `idempotency-body:` digest values rather than merely checking that some hash exists.
- For an existing live record with the same request hash and `state: 'succeeded'`, return its stored response without creating a record, invoking the callback, or updating a record.
- For an existing live record with a different request hash, throw the existing `IDEMPOTENCY_CONFLICT` error and perform no side effect.
- For a matching live `in_progress` record, throw the existing generic conflict representing an active request; do not replay a partial/null response.
- For a `succeeded` record whose response body is unexpectedly null, fail closed instead of invoking the callback a second time.
- On a new reservation, persist only digests and bounded scope metadata with `state: 'in_progress'`, invoke the callback exactly once, then update that same record to `state: 'succeeded'` with the configured response status and returned body.
- If the callback rejects, preserve the original error and do not issue a success update. Document that the enclosing tenant transaction supplies rollback of the reservation and command side effect.
- If reservation fails with a non-unique Prisma error, preserve and rethrow it.
- Exercise unique-conflict recovery for: matching completed response, matching in-progress request, changed body, and no visible live winner. The expected outcomes must remain deterministic and fail closed.

Prefer behavior assertions over snapshots and private-method access. Do not export hashing helpers solely for tests; observe inputs passed through the transaction port or compute the expected SHA-256 values independently in the spec.

### 2. Real PostgreSQL concurrency proof

Extend `server/test/database.e2e-spec.ts` within its existing real-database lifecycle and cleanup conventions. Do not create a separate database harness and do not use the Prisma test double for this case.

Use a real authenticated principal and the existing session/CSRF helpers. Launch two requests concurrently rather than sequentially. Both requests must use:

- the same account/session;
- the same exact valid `Idempotency-Key`;
- the same canonical command body;
- the same operation and account-level or organization-level scope.

Assert:

- both requests settle within the test timeout without an unhandled database error or a hung lock;
- both receive the same successful status and semantically identical response, including the same durable resource identifier;
- the callback's durable effect exists exactly once;
- exactly one live `IdempotencyRecord` exists for the scope and it is `succeeded` with the replayable response;
- a later same-key request with reordered object keys replays when the semantic JSON body is otherwise equal, where the chosen DTO permits such ordering;
- a later same-key request with a changed body returns `409` with `IDEMPOTENCY_CONFLICT` and creates no additional durable effect.

If the current implementation fails because a unique violation aborts the losing transaction before its catch-path lookup, fix the production reservation algorithm. The acceptable behavior is an atomic insert-or-observe sequence inside the existing tenant transaction. The implementation must:

- retain the current `IdempotencyService.run()` public contract and all current call sites;
- retain `IdempotencyRecord_unique_scope`, account/organization scoping, forced RLS, TTL behavior, key/body SHA-256 domain separation, stored response status/body, and stable API error codes;
- use parameter binding/tagged raw SQL or another installed-and-verified Prisma 7 mechanism;
- avoid unbounded polling, process-local locks, advisory locks without a documented necessity, new packages, and weakening transaction isolation or RLS;
- allow the losing request to observe the committed winner after PostgreSQL resolves the unique-key race;
- allow a contender to proceed if the competing transaction rolls back rather than commits;
- preserve rollback when the command callback fails;
- never log or persist the raw idempotency key or an unhashed request body.

If the current implementation passes the real race unchanged, do not refactor it merely for style. Record the evidence and keep production code untouched.

### 3. Existing Phase 4 evidence that must remain green

Do not duplicate the already-present GraphQL cases. Re-run them through the full server E2E suite, which already covers POST-only GraphQL, authentication, request-scoped loader batching, bounded reads, variable node totals, body bytes, fragment aliases, list-aware complexity, request IDs, and transaction-local statement timeout. Re-run `contracts:check` so no REST/OpenAPI/GraphQL artifact drift is introduced.

## Reference material read while preparing this prompt

Repository authority and implemented-state records:

- `AGENTS.md`, especially §§2, 2.1, 4–7, 8.2, 9, and 10.
- `docs/build-plan.md` §§5 and 14: Phase 4 behavior, failure matrix, tests, exit evidence, and sequence gates.
- `docs/backend.md` §§14–15: tenant transaction/RLS behavior, versioned transports, GraphQL controls, idempotency storage and route inventory, and the Phase 4 verification record.
- `docs/security.md` §§5–10: attacker capabilities, REST/GraphQL boundary controls, replay/duplicate-delivery abuse paths, TM-01/TM-10, the acceptance suite, and critical end-to-end review paths.
- `docs/system-architecture.md` §8: REST/GraphQL responsibility split and cross-transport rules.
- `docs/skills.md` §§2–4: locked skill locations, triggers, and update discipline.

Implementation and test evidence inspected:

- `server/src/idempotency/idempotency.service.ts` and `server/src/idempotency/idempotency.module.ts`.
- `server/src/prisma/tenant-transaction.service.ts`.
- `server/src/common/api-exception.ts`.
- `server/src/config/acres-config.service.ts`.
- `server/prisma/schema.prisma`.
- `server/prisma/migrations/20260824120000_transport_contracts/migration.sql`.
- `server/prisma/migrations/20260824121000_idempotency_expiry_cleanup/migration.sql`.
- `server/test/api.e2e-spec.ts`, including the representative idempotency and GraphQL sections.
- `server/test/database.e2e-spec.ts` and its existing real-PostgreSQL tenancy lifecycle.
- `server/test/helpers/test-app.ts`.
- `server/src/graphql/graphql-limits.ts`, `server/src/graphql/graphql.loaders.ts`, `server/src/graphql/cursor-codec.ts`, `server/src/graphql/pagination.ts`, and `server/src/graphql/graphql.context.ts`.
- Root `package.json` and `server/package.json` for the real script and Jest 30/Nest 11/Prisma 7 package surface.
- `prompts/23-versioned-rest-graphql-contracts.md` for the approved Phase 4 contract and its original evidence requirements.

No visual reference applies. This prompt changes no route rendering, client component, asset, layout, typography, color, motion, or breakpoint behavior, so the design-system PDF and 375/800/1280 landing comps are intentionally not opened.

## SKILLS USED

- `architecture-patterns` - preserve the transport/application/persistence boundary and test the service through its injected transaction port.
- `nestjs-best-practices` - build the isolated suite with Nest's testing module and deterministic dependency doubles.
- `api-design-principles` - preserve retry-safe HTTP command semantics and stable conflict responses.
- `auth-implementation-patterns` - keep idempotency scoped to the authenticated principal and selected organization without weakening session or CSRF enforcement.
- `postgres-best-practices` - verify the unique index, forced-RLS transaction scope, and real concurrent transaction behavior.
- `security-best-practices` - enforce fail-closed replay handling, input bounds, parameterized SQL, and non-disclosure of raw keys/request bodies.
- `error-handling-patterns` - preserve stable API exceptions and original callback/database failures at the correct layer.
- `javascript-testing-patterns` - add deterministic Jest unit coverage with explicit success, failure, boundary, and race cases.
- `e2e-testing-patterns` - add one independent real-database concurrency scenario at the HTTP boundary without duplicating unit assertions.
- `requesting-code-review` - dispatch the mandatory reviewer subagent after self-verification with the approved prompt, changed files, checks, and `BASE_SHA`/`HEAD_SHA`.
- `receiving-code-review` - verify every reviewer claim against the repository before applying fixes and request re-review if the transaction algorithm changes materially.
- `caveman-commit` - write the required concise Conventional Commit message for the final local commit.

`openapi-spec-generation` is not required because no route or schema change is planned; contract drift is checked. `sql-optimization-patterns` is not required because this is a correctness/concurrency proof, not a query-plan or index-design change. `security-threat-model` is not required because no new trust boundary is introduced; the existing threat record is reconciled only with new evidence.

## Expected file impact

Required:

- Add `server/src/idempotency/idempotency.service.spec.ts`.
- Update `server/test/database.e2e-spec.ts` with the real concurrent replay case.
- Update `docs/backend.md` with the isolated and real-database evidence and any verified production correction.
- Update `docs/security.md` to distinguish the newly proven idempotency race behavior from still-open distributed/operational risks.
- Update `docs/build-plan.md` Phase 4 test/exit record with exact suite names and counts actually observed.

Conditional only if the real test exposes a defect:

- Update `server/src/idempotency/idempotency.service.ts` with the smallest verified atomic reservation correction.
- Add a forward-only Prisma migration only if the existing unique index or database contract truly must change. Do not edit an applied migration. No migration is expected from the current evidence.

Do not update generated OpenAPI or SDL artifacts unless `contracts:check` proves genuine drift caused by an authorized contract change; such a contract change is outside this prompt and must stop for user direction.

## Non-goals

- No new REST routes, GraphQL fields, mutations, subscriptions, SDKs, or response-envelope changes.
- No client UI, Next.js, React, Tailwind, shadcn, accessibility, visual, breakpoint, or motion work.
- No organization, upload, ingestion, dashboard, report, export, or AI feature expansion.
- No replacement of PostgreSQL-backed idempotency with Valkey, process memory, a distributed lock service, or a new package.
- No change to TTL values, key length, public error codes, RLS policy, tenant identity model, or command permission matrix.
- No broad refactor of callers that already use `IdempotencyService.run()`.
- No claim that all Phase 4 or launch evidence is complete beyond the exact test boundary added here.

## Implementation sequence

1. Re-read this approved prompt, `AGENTS.md`, the owning documentation, all listed skills, and each relevant routed skill reference before editing.
2. Re-check `git status --short`, current branch, and `git log -1`; preserve unrelated work and stop if the approved scope cannot be isolated safely.
3. Verify the installed Prisma 7 transaction/raw-query declarations in `node_modules` before changing production code. Verify Jest/Nest testing APIs from installed packages or loaded skill guidance.
4. Write the isolated tests first and run only `idempotency.service.spec.ts`.
5. Add and run the real PostgreSQL concurrency test. Treat an unavailable database as an actionable environment dependency, not as a passing or skipped boundary.
6. If the race fails, identify the precise PostgreSQL/Prisma failure, make the smallest atomic reservation correction, then rerun the isolated test and real database case before any broader checks.
7. Inspect every changed file and run the complete verification matrix below.
8. Update only the owning documentation with exact observed commands, suite/test counts, and any remaining limitation. Never write a check result before running it.
9. Run `requesting-code-review` with a reviewer subagent using the approved requirements and git SHAs, then apply `receiving-code-review` rigor to every finding. Fix blocking/important valid findings one at a time and rerun affected checks. Request follow-up review if production transaction logic or schema changed.
10. Stage only approved files, inspect the staged diff, use `caveman-commit` to generate the message, and commit locally to `main`. Do not push.

## Verification plan

Run from the repository root and quote real output in the completion response and owning docs where appropriate:

1. Focused isolated suite:

   ```bash
   npm run test --workspace=@acres/server -- src/idempotency/idempotency.service.spec.ts --runInBand
   ```

2. Full server unit suite:

   ```bash
   npm run test --workspace=@acres/server -- --runInBand
   ```

3. Real server E2E suite, including the simultaneous PostgreSQL request:

   ```bash
   npm run test:server -- --runInBand
   ```

4. Contract drift:

   ```bash
   npm run contracts:check
   ```

5. Formatting, lint, types, and production build:

   ```bash
   npx prettier --check server/src/idempotency/idempotency.service.ts server/src/idempotency/idempotency.service.spec.ts server/test/database.e2e-spec.ts
   npm run lint
   npm run typecheck
   npm run build
   ```

   If `server/src/idempotency/idempotency.service.ts` remains unchanged, omit it from the Prettier path list rather than touching it.

6. Operational regression gate because idempotency cleanup participates in worker maintenance and launch checks:

   ```bash
   npm run ops:check
   ```

7. Diff and repository state:

   ```bash
   git diff --check
   git status --short
   git diff -- server/src/idempotency server/test/database.e2e-spec.ts docs/backend.md docs/security.md docs/build-plan.md
   ```

Database setup is an explicit prerequisite for step 3. If local PostgreSQL is unavailable, use the documented `npm run db:up`, migration deployment, and test-role environment procedure from `docs/backend.md`; do not silently replace the real boundary with mocks. Do not claim the concurrency gate passed unless two actual PostgreSQL transactions were exercised.

## Completion and rollback evidence

The implementation is complete only when:

- the isolated service matrix passes;
- the real concurrent same-key command produces one side effect and one completed record while both callers receive the same result;
- changed-body reuse still fails safely;
- existing GraphQL and transport E2E tests remain green;
- contracts, lint, typecheck, build, operations checks, and diff checks pass;
- mandatory review is complete and all valid blocking/important findings are resolved;
- the owning docs state exact evidence and residual limits; and
- the approved files are committed locally on `main` without a push.

Rollback is one revert of the resulting commit. If production logic changes, rollback restores the prior reservation implementation and removes only the new evidence/docs. If a new migration unexpectedly becomes necessary, document why it cannot be rolled back safely and provide a reviewed forward-correction plan; never edit or delete an already-applied migration.
