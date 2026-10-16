# Prompt 377 — Shared managed API throttling

## Scope and why this is next

Planning baseline: `b3f145d` on `main`, 2026-10-16; working tree clean before
this prompt. Parent: Phase 12 managed-target amendment, approved Prompt 370,
ordered step 4. Prompts 374–376 implemented durable dispatch, reconciliation
and protected triggers locally. The first application preview still requires
shared throttling and Services routing. Implement shared throttling first so
routing cannot expose an API with per-instance abuse budgets.

`server/src/security/security.module.ts` currently returns named throttler
options without a storage provider. The installed Nest throttler therefore uses
process-local storage. `rate-limit.guard.ts` applies the default tier globally,
strict only through metadata, and adapts GraphQL request/response extraction.
Preserve these rules and configured limits. Use the existing PostgreSQL database
for the managed profile, without introducing Redis or another hosted provider.

This is local implementation and real local PostgreSQL acceptance only. Preparing
this file authorizes no implementation, staging, commit, migration or deployment.
Stop for phase-control approval before execution.

## References and verified interfaces

Read at execution:

- `AGENTS.md`, especially §§2, 2.1, 3, 5–10 and phase-control commands.
- `docs/build-plan.md` managed-target amendment and Prompts 374–376;
  `docs/vercel-deployment.md` Resume here and managed dispatch record;
  `docs/adr/0001-vercel-managed-production.md`.
- `docs/backend.md`, `docs/security.md`, `docs/system-architecture.md`,
  `docs/operations.md`, and `docs/skills.md`.
- `server/src/security/` guard, module, decorators and tests;
  config validation/getters; API bootstrap proxy configuration;
  auth/form controller throttle decorators; GraphQL guard integration.
- `server/src/prisma/prisma.service.ts`, Prisma module and schema;
  existing global infrastructure tables and migration/grant conventions;
  `scripts/db/{bootstrap-roles.sh,bootstrap-production-roles.sh,harden-runtime-privileges.sh}`;
  `scripts/vercel/{neon-bootstrap.sh,neon-verify.sh}`.
- Real DB test setup, helpers and current rate-limit HTTP acceptance tests.
- Installed `node_modules/@nestjs/throttler/dist/`:
  `throttler-storage.interface.d.ts`, `throttler-storage-record.interface.d.ts`,
  `throttler-module-options.interface.d.ts`, `throttler.service.js`,
  `throttler.guard.js`, storage provider and module sources.

Planning verified `increment(key, ttl, limit, blockDuration, throttlerName)`
returns `{ totalHits, timeToExpire, isBlocked, timeToBlockExpire }`;
TTL/block input uses milliseconds and response expiry uses seconds. Module
options support `{ storage, throttlers }`; retain exact installed DI contract.
Default implementation expires individual hits with timers and blocks after
`totalHits > limit`. Do not substitute a fixed window that doubles effective
burst allowance around a boundary. Verify reset/unblock behavior from source.
No external API or new package is needed; validate SQL against the local database
and framework APIs against installed packages rather than memory.

No visual changes, comp measurements, screenshots or Next API changes are in
scope, so design references and breakpoint targets are not applicable.

## SKILLS USED

- `architecture-patterns` — isolate the storage adapter from policy and API guards.
- `nestjs-best-practices` — provider selection, module wiring and guarded failures.
- `postgres-best-practices` — atomic counters, migrations and least privilege.
- `sql-optimization-patterns` — actual expiry selection EXPLAIN and its limits.
- `api-design-principles` — bounded protected sweep cleanup summary addition.
- `error-handling-patterns` — bounded database errors and fail-closed responses.
- `security-best-practices` — shared abuse budgets and sensitive tracker handling.
- `javascript-testing-patterns` — adapter and guard unit tests.
- `e2e-testing-patterns` — independent-instance real-database acceptance.
- `requesting-code-review` — independent review after self-verification.
- `receiving-code-review` — verify findings and re-test accepted fixes.
- `caveman-commit` — final local commit message.

Load each skill before execution. If implementation changes a trust boundary,
query-plan tuning, durable architecture decision or secret contract beyond this
scope, load its owning additional skill and document the necessary bounded
change; do not expand into ingress design or hosted provisioning.

## Implementation sequence

1. Re-establish current history and changes. Trace every throttled transport and
   current exclusions, tier limits, tracker/key generation and proxy behavior.
   Record the installed package version and precise rolling-hit/block semantics
   before implementing. Inspect the exception filter to preserve existing 429
   envelopes and add a sanitized storage-unavailable response if necessary.
2. Add `PostgresThrottlerStorage` in `server/src/security/`, implementing the
   installed interface. Select it automatically for `QUEUE_PROVIDER=vercel`,
   the existing managed-profile discriminator. Keep reference-profile storage
   behavior intact. Do not provide a managed memory fallback or a disabling
   configuration escape hatch. Wire through `ThrottlerModule.forRootAsync`
   using explicit imports/injection; avoid circular module dependencies.
3. Add an additive Prisma migration and model for global infrastructure throttle
   state. Use hashed route/tracker keys plus named tier as the unique identity;
   never store raw IP, URL query, email, cookies or bearer tokens. Use the
   guard's existing stable key derivation. Keep deployment IDs out of keys so
   cold starts and concurrent releases share budgets. Explain that digests are
   pseudonymous and not anonymization. No tenant context is available before
   authentication: follow the narrowly scoped global-infrastructure privilege
   convention, with no new access to tenant tables and no blanket grant/RLS bypass.
4. Serialize increments for a key in the database, including creation races,
   pruning expired hits, deciding allowance and setting/resetting a block.
   Use database time and parameterized SQL within one bounded transaction or
   atomic statement. Keep rolling hit state bounded by the configured allowance
   plus the triggering hit, since blocked requests need not append history.
   Enforce positive finite bounds, prevent numeric overflow, and preserve a
   deterministic result under concurrency. Return nonnegative expiry seconds
   rounded as the installed guard expects. Blocked requests must not extend a
   block indefinitely; the first request after block expiry follows verified
   reset semantics. Do not allocate a timeout per hit or create another pool.
5. Add bounded cleanup for expired key state, with an expiry index, capped batch
   size and lock-safe selection. Integrate one cleanup batch into the existing
   managed sweep without importing the whole API module. Cleanup failure must
   not prevent outbox reconciliation/dispatch; report sanitized bounded failure
   information. A cleanup/increment race must not delete a newly active bucket.
   Cleanup cannot be required for correct expiry; a future request must reset
   an expired row safely even if Cron has not run. Update sweep summary tests
   if the response contract gains cleanup counts. No perpetual timer.
6. Fail closed on acquisition/query failure with a stable sanitized 503, without
   credentials, SQL, key or tracker in responses/logs. Keep exhausted allowance
   as 429 with existing retry headers. Verify health exemptions continue to
   work with the database unavailable. Do not convert arbitrary guard failures
   to 503 or expose raw driver exceptions. Use bounded query/lock waits using
   repository conventions and transaction-local settings compatible with pooling.
7. Update schema grants/hardening and local acceptance setup as required. Apply
   only to the isolated local test DB; never run against hosted Neon or reset
   databases/volumes. Keep migration deployment an explicit operator step.

## Acceptance criteria

Tests must establish behavior, not mirror private helper implementation:

- Two separately instantiated storage adapters/connections sharing a key enforce
  one common budget; concurrent initial requests admit exactly the limit and
  block the next request without lost increments or unique-key races.
- A fresh adapter sees an existing block; different keys and named tiers remain
  independent. Guard tests preserve strict opt-in for auth/contact and ordinary
  reads, including GraphQL extraction and existing exclusions.
- Database-clock expiry and rolling-hit pruning preserve boundary behavior;
  explicit fixtures establish expiration without long sleeps. Block expiration,
  zero remaining time and repeated blocked calls behave correctly.
- Storage unavailable produces sanitized 503 and never permits the protected
  controller to execute. Known exhaustion produces 429 and correct headers.
- Real least-privilege `acres_app` can perform the narrow throttle operations
  without tenant context while tenant RLS tests remain passing.
- Cleanup is bounded, indexed and safe under concurrent increments; expired
  backlog drains over invocations; live buckets survive; cleanup failures leave
  dispatch working. Capture an actual representative `EXPLAIN` for expiry
  selection and describe fixture/statistics limits without inventing load proof.
- Managed module composition selects shared storage; reference composition retains
  its existing implementation; jobs/dispatch composition adds no API listener,
  scheduler or per-hit timer. Existing managed dispatch regressions pass.

Likely files: new storage/cleanup adapters and specs under `server/src/security/`,
`security.module.ts`, Prisma schema/new migration, relevant privilege scripts,
managed sweep/module and tests, and a new
`server/test/shared-throttling.e2e-spec.ts`. Inspect actual composition before
choosing any additional path. No client/shared public API change is expected.

## Verification

Use Node 24.21.0 for node and npm per the migration record. Format changed files
with the installed formatter; do not reformat historical documentation wholesale.
Run and quote actual output and exit status:

```bash
npm run build:server
npm run test --workspace=@acres/server -- --runInBand
npm run db:up
env -u DATABASE_URL npm run test:e2e --workspace=@acres/server -- --runInBand --testTimeout=30000
npm run contracts:check
npm run lint
npm run build
npm run typecheck
npm run vercel:probe-test
npm run ops:templates-test
npm run ops:scan-secrets
npm run ops:scan-secrets-test
git diff --check
```

Use the existing isolated-test guard/bootstrap before migrations. Run any
additional focused grant-script tests changed by this work. Do not claim a full
ops gate or hosted acceptance from these targeted checks. Investigate failures;
report environmental limits distinctly from successful checks. Inspect all new
files as well as tracked diffs before requesting review.

## Non-goals, impact and rollback

Existing REST and GraphQL routes share managed rate limits across API instances;
no route path, allowance configuration or product journey changes. Infrastructure
failure becomes an explicit service-unavailable response. Do not change ingress,
proxy trust, identity derivation, rate policy, authentication, worker budgets,
Services config, provider env, cloud resources or deploy the application.
Forwarded-header spoofing and deployed ingress IP identity remain explicit
first-preview acceptance gates; local tests do not prove Vercel edge behavior.

No paid usage, Resend setup, snapshot rebuild, production Cron proof, push or
promotion. Prompt 370, Phase 12 and eleven launch categories remain open.

Rollback: revert adapter/wiring and sweep cleanup code; retain the additive table
and valid temporary state until a separately reviewed cleanup/drop migration.
Do not drop data or revert to per-instance memory on an active managed deployment;
stop protected traffic or restore a prior known-safe deployment first. Describe
that availability/security trade-off explicitly in the owning record.

## Review and completion

Dispatch an independent read-only reviewer with baseline/HEAD identities, prompt,
all changes, migration/grants, SQL concurrency protocol, expiry and cleanup race
analysis, module selection, error contract and real verification logs. Evaluate
feedback with `receiving-code-review`, fix verified issues, re-run relevant gates,
and re-review concurrency, privilege or architecture changes.

Record implementation, actual outputs, limitations, reproduction and rollback in
`docs/vercel-deployment.md`; synchronize its Resume here and stale trigger bullets
from the committed 376 evidence. Add concise current-state entries to
`docs/backend.md`, `docs/security.md`, `docs/system-architecture.md` and
`docs/build-plan.md`. Do not overwrite historical evidence or increase completion.
Give exact local reproduction commands. Stage only approved changes, inspect the
staged diff, and commit locally to `main` using `caveman-commit`. Do not push.
