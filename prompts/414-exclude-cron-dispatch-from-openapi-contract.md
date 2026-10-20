# Prompt 414 — Exclude Cron Dispatch Controller from OpenAPI Contract

## Scope and why this is next

Parent: Phase 12 operations and launch hardening (`docs/build-plan.md` §13,
Prompt 413 build-plan current-state reconciliation). Planning baseline: `6df051e`
on `main` (`docs(ops): stop plan claiming migration unbuilt`, Prompt 413).
Re-verify HEAD and worktree cleanliness at execution time.

In `docs/build-plan.md` §13 (Prompt 413), the plan states:
> "The next `i` re-reads this corrected plan and either stops because only
> operator-owned launch work remains, or selects a newly discovered repository
> defect."

Investigation of the repository gates discovered a real pre-existing failure:
`npm run contracts:check` fails with:
```text
Error: Contract drift detected: openapi.json
```
Line 40 of `.github/workflows/ci.yml` runs `npm run contracts:check` on every CI
push and pull request. If the 12 local commits ahead of `origin/main` were published
to upstream with standalone uppercase `P`, CI would immediately fail on this gate.

Root cause:
In Prompt 378 (`d4f8c50`), `CronDispatchController` was created in
`server/src/outbox/cron-dispatch.controller.ts` to expose the protected `/cron/dispatch`
route for Vercel Cron. The controller is version-neutral and excluded from the `/api`
prefix in `server/src/app.setup.ts`. However, it was registered in `OutboxModule`
without `@ApiExcludeController()` from `@nestjs/swagger`. When
`server/src/contracts/generate-contracts.ts` executes `writeContracts()`, NestJS
Swagger automatically discovers `CronDispatchController` and injects an un-annotated,
untyped `/cron/dispatch` operation (`operationId: CronDispatchController_dispatch`,
tag `["CronDispatch"]`, empty response `""`) into the generated OpenAPI document.
Because `docs/api/openapi.json` was never regenerated with this internal endpoint,
`assertNoDrift()` detects contract drift and aborts with code 1.

Resolution:
`/cron/dispatch` is a private infrastructure webhook intended solely for Vercel Cron
invocations protected by constant-time `CRON_SECRET` bearer token verification. It is
not a public or tenant-facing REST API endpoint, carries no tenant session or CSRF
envelope, and does not belong in the versioned Acres REST API documentation
(`docs/api/openapi.json`). Decorate `CronDispatchController` with
`@ApiExcludeController()` from `@nestjs/swagger`, add regression test assertions in
`server/src/outbox/cron-dispatch.controller.spec.ts`, and confirm `npm run contracts:check`
exits 0 with zero drift.

## References and evidence boundary

Read before execution:

- `AGENTS.md` §2, §5, §6, §10.
- `server/src/outbox/cron-dispatch.controller.ts` (target controller to annotate).
- `server/src/outbox/cron-dispatch.controller.spec.ts` (target test suite for regression assertions).
- `server/src/contracts/generate-contracts.ts` (contract generation and drift assertion runner).
- `server/src/app.setup.ts` (prefix exclusions including `/cron/dispatch`).
- `docs/api/contracts.md` and `docs/api/openapi.json` (authoritative REST API contracts).
- `.github/workflows/ci.yml` (CI gate calling `npm run contracts:check`).
- `docs/backend.md` §OpenAPI, SDL and CI drift guard.

No visual comp, crop or breakpoint measurement applies (backend/contracts only).
No database schema, Prisma migration, or secret names change.

## Implementation plan

1. In `server/src/outbox/cron-dispatch.controller.ts`:
   - Import `ApiExcludeController` from `@nestjs/swagger`.
   - Decorate `CronDispatchController` with `@ApiExcludeController()`.
   - Preserve all existing imports, docstrings, decorators (`@SkipThrottle()`, `@Controller`),
     and handler implementation verbatim.
2. In `server/src/outbox/cron-dispatch.controller.spec.ts`:
   - Add a test verifying that `CronDispatchController` has the
     `'swagger/apiExcludeController'` metadata defined (`Reflect.getMetadata`).
   - Verify that all existing unit tests in the suite continue to pass.
3. Verify contract check:
   - Run `npm run contracts:check`.
   - Confirm it completes with exit code 0 and reports no contract drift.
   - Confirm `git status` shows zero modifications in `docs/api/`.
4. Verification and regression suite:
   - `npm run typecheck` across all workspaces.
   - `npm run lint` across all workspaces.
   - `npm run test --workspace=@acres/server` (all unit suites pass).
   - `node scripts/vercel/check-vercel-config.js` exits 0.
   - `git diff --check` exits 0.
5. Record results in:
   - `docs/backend.md` (OpenAPI and contract drift guard notes).
   - `docs/build-plan.md` (Phase 12 Prompt 414 record).
   - `docs/operations.md` (CI gate verification record).
6. Run two-stage code review (`requesting-code-review` / `receiving-code-review`).
7. Commit locally with `caveman-commit`. Do not push.

## Expected impact

- Files modified:
  - `server/src/outbox/cron-dispatch.controller.ts`
  - `server/src/outbox/cron-dispatch.controller.spec.ts`
  - `docs/backend.md`
  - `docs/build-plan.md`
  - `docs/operations.md`
- No routes change runtime behavior.
- `/cron/dispatch` runtime behavior, bearer authentication, and timing-safe secret
  comparison remain 100% unchanged.
- `docs/api/openapi.json`, `docs/api/schema.graphql`, and `docs/api/contracts.md` remain
  cleanly synchronized and unmodified.

## Non-goals

- Exposing `/cron/dispatch` in OpenAPI with custom schemas: it is an internal infrastructure
  cron webhook, not a tenant REST endpoint.
- Renaming or moving `/cron/dispatch`: `vercel.json` and `dispatch-handler.ts` depend on
  this exact routing path.
- Modifying `generate-contracts.ts` drift logic: the drift assertion correctly caught this
  missing annotation and must remain untouched.
- Any production deployment, secret provisioning, or git push: operator-owned actions.

## SKILLS USED

- `openapi-spec-generation` — verify OpenAPI 3.0/3.1 contract specification standards,
  Swagger reflection boundaries, and `@ApiExcludeController` semantics.
- `api-design-principles` — ensure clean separation between public tenant-facing REST
  surfaces and internal infrastructure sweep webhooks.
- `nestjs-best-practices` — adhere to NestJS controller metadata and decorator conventions.
- `requesting-code-review` — dispatch reviewer subagent before recording and committing.
- `receiving-code-review` — evaluate reviewer findings against codebase reality.
- `caveman-commit` — craft concise conventional commit message for the local commit.

## Acceptance

- `npm run contracts:check` exits 0 with zero drift detected.
- `server/src/outbox/cron-dispatch.controller.spec.ts` verifies `@ApiExcludeController()` metadata.
- All 142 server unit test suites pass (2165+ tests).
- Typecheck and lint pass with 0 errors across `@acres/shared`, `@acres/client`, and `@acres/server`.
- `git status` shows only the intended files modified.
- Local commit on `main` with no push.
