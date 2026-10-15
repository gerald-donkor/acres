# Prompt 375 — Queue-retention job reconciliation

## Scope and why this is next

Planning baseline: `f1d9f6c` on `main`, 2026-10-15; clean working tree before
this prompt. Parent: Phase 12 managed-target amendment, ordered steps 3–5,
and approved Prompt 370. Resolve implementation from code/history again when
executing. Prompt 374 committed the invocation-safe dispatcher, transactional
ingestion intent and terminal/exhausted execution preflight. The managed
composition still has no automatic dispatcher, reconciliation or application
deployment.

Build one bounded, awaited reconciliation operation for previously dispatched
upload, ingestion and export jobs stranded beyond queue retention. Preserve
the existing outbox/job identities, attempt budgets, tenant ownership and
immutable publication. Make the operation resolvable in `VercelJobsModule`
without starting a listener, scheduler, timer or job processor. This is the
next local recovery prerequisite for the protected dispatch/Cron milestone;
it does not reorder or waive the first-preview gates.

Preparing this file authorizes no implementation, staging, commit or deployment.
Execute only after the approval required by the phase-control protocol.

## References read during planning

Re-read relevant sections and implementation at execution:

- `AGENTS.md`: workflow, phase-control commands, prompt/skill/check contracts.
- `docs/skills.md`, `docs/project-status.md` (historical assessment only).
- `docs/build-plan.md`: Phase 12 managed amendment and Prompt 374 record.
- `docs/vercel-deployment.md`: Resume here, remaining work, Queues retry rules,
  retention gap and Prompt 374 implementation/review evidence.
- `docs/adr/0001-vercel-managed-production.md`.
- `docs/backend.md`: shared dispatcher and leased-executor preflight.
- `docs/ingestion.md`: transactional ingestion intent and terminal publication.
- `docs/system-architecture.md`: current dispatch boundary and provider amendment.
- `docs/security.md`: worker/RLS boundary and Prompt 374 fencing/replay controls.
- `server/src/outbox/outbox.service.ts`,
  `server/src/outbox/outbox-dispatcher.service.ts`,
  `server/src/outbox/outbox.module.ts`, and their existing unit tests.
- `server/src/worker/job-lease.service.ts`,
  `server/src/worker/leased-job-executor.service.ts`,
  `server/src/worker/worker.module.ts`.
- `server/src/vercel/vercel-jobs.module.ts`,
  `server/src/vercel/jobs-runtime.ts`.
- `server/src/queue/work-queue.port.ts`,
  `server/src/queue/vercel-queue.adapter.ts`.
- `server/prisma/schema.prisma`, root `package.json`, and the existing
  outbox/data-journey/infrastructure real-database tests listed in Prompt 374.
- Installed `node_modules/@vercel/queue/README.md` parameter constraints and
  `dist/index.d.ts` `SendOptions`: documented deduplication window is
  `min(retention, 24h)`, maximum key length 256 characters. This is inspected
  installed-package guidance, not a new hosted recovery proof.

No UI, CSS, Next.js API or visual reference changes. Static comp measurements,
screenshots and breakpoint changes are inapplicable. No new provider SDK API
is required. Verify any additional API against installed source or current
official documentation before using it; record any unverified platform behavior.
No dedicated Vercel deployment skill is available in this session; the existing
deployment skill and inspected queue port cover this local-only unit.

## SKILLS USED

- `architecture-patterns` — keep reconciliation independent of transport and processing.
- `architecture-decision-records` — respect ADR 0001 and document the bounded recovery policy.
- `nestjs-best-practices` — explicit provider/module composition without boot side effects.
- `postgres-best-practices` — short transactions, forced RLS and conditional state changes.
- `sql-optimization-patterns` — bounded contention-safe queries and measured index choices.
- `deployment-pipeline-design` — interruption, rollback and preview acceptance boundaries.
- `secrets-management` — isolated test identity and no hosted credential exposure.
- `error-handling-patterns` — recoverable persistence faults and safe exhaustion records.
- `javascript-testing-patterns` — typed outcome-oriented unit and fault tests.
- `e2e-testing-patterns` — real PostgreSQL concurrency and recovery journeys.
- `security-best-practices` — scoped secure recovery implementation and tenant isolation.
- `security-threat-model` — scoped update to the existing worker replay/availability threat record.
- `requesting-code-review` — independent review after self-verification.
- `receiving-code-review` — verify findings and re-review significant corrections.
- `caveman-commit` — mandatory local commit after approved execution.

Reload every listed skill when executing. Security work is limited to the
existing internal worker boundary; environment/ownership assumptions are already
established by the referenced records. Introduce no operator endpoint or new
authentication mechanism. Use Prisma 7/adapter-pg and existing transaction
services, not TypeORM examples from generic skills.

## Implementation plan

### 1. Establish the exact recovery contract

Inspect status/history, `.node-version`, configuration validation, transaction
helpers, state enums, original outbox producers, execution lease migration,
queue adapters and existing test fixture isolation. Use Node 24.21.0 for both
node and npm as documented in the migration record. Preserve unrelated work.

Add `server/src/outbox/job-reconciliation.service.ts` with injectable
`JobReconciliationService` and `reconcileOnce()`. Export through `OutboxModule`
and resolve through its existing import in `VercelJobsModule`. Add a dedicated
unit suite and `server/test/job-reconciliation.e2e-spec.ts`. Prefer no schema
change: current outbox state, dispatch timestamp, attempts and job lease columns
can represent conservative recovery. Add an index only if real query plans
demonstrate its necessity; any migration must be additive and preserve grants/RLS.

Return typed internal counts for examined candidates, rearmed intent, terminal
repairs, exhausted recovery and rejected identities. Define precisely whether
counts describe selected or durably committed rows. Database failure rejects;
never return success after a rolled-back recovery. Do not expose global counts
through a tenant API or log raw payloads/provider errors.

### 2. Select a bounded stale set using database time

Scope this operation to `QUEUE_PROVIDER=vercel`; other providers return an
explicit no-work outcome. The reference worker keeps its current lifecycle and
does not call this operation. This avoids treating retained BullMQ jobs as
expired Vercel messages.

Use the existing `OUTBOX_CLAIM_BATCH_SIZE` bound. Define conservative stale
eligibility as no activity newer than:

`VERCEL_QUEUE_RETENTION_SECONDS * 1000 + JOB_LEASE_MS + 60000` milliseconds.

The extra minute is a conservative engineering choice, not a measured provider
guarantee. Read the real config property/environment names before implementing.
Use the maximum of last successful dispatch and relevant durable-job activity;
require an expired or absent execution lease independently. Recent failures or
lease activity postpone recovery. Compute eligibility with PostgreSQL time,
never the application clock. Validate safe arithmetic against existing config
bounds, including maximum retention. Test exact cutoff and future timestamps.

Only original recognized events in `dispatched` state with non-null
`dispatchedAt` and matching existing jobs are candidates. Pending/retrying or
dead-lettered intent belongs to the existing dispatcher/recovery, not this
operation. No fabricated intent for missing legacy jobs or aggregates. Ignore
terminal jobs (`succeeded`, `cancelled`, `dead_lettered`); `failed` requires
aggregate inspection because it can represent a retryable failed attempt.

Use a materialized, ordered, bounded locked candidate set and `SKIP LOCKED`,
as Prompt 374's real contention regression requires. Lock/re-read the related
job before mutation, use consistent lock ordering, and recheck eligibility and
identity after locks are acquired. A live execution lease or concurrent state
change must win. No unbounded preload, full-table application scan or SQL
transaction across object/scanner/parser/provider operations.

### 3. Reconcile authoritative state without running work

Validate the existing exhaustive event/aggregate mapping, canonical
`jobType:id` key, organization and upload linkage against database ownership.
Ingestion's upload comes from its run; exports have null upload linkage.
Unknown names or mismatched ownership must fail closed with fixed diagnostics;
do not rewrite ownership, follow a payload-supplied tenant or repeatedly select
an invalid row forever. Record invalid selected intent durably using a narrow
safe classification and bounded processing. Never change a mismatched tenant's
job to manufacture a matching identity.

Re-use or extract small internal aggregate-state helpers where needed, avoiding
an OutboxModule → feature-module → OutboxModule cycle. The existing executor's
state mapping remains authoritative: accepted upload/published run/succeeded
export maps to success; rejected or failed terminal aggregates map to failure;
cancelled/expired map to cancellation as appropriate. Repair a stale job's
terminal ledger without processing, incrementing attempts, replacing existing
failure history or repeatedly changing `finishedAt`. Keep terminal aggregate
state ahead of spent-budget classification. Do not restart cancelled ingestion
or regenerate immutable exports, versions or evidence.

For a genuinely nonterminal aggregate below execution budget, atomically
transition its stale dispatched intent back to eligible `pending` (or the
existing equivalent) and set `nextAttemptAt` with database time. Preserve
original event id, aggregate version, payload, creation time, successful
dispatch history and attempts/maxAttempts. Do not append a new aggregate version,
new ledger or fresh budget. Existing dispatcher claims consume the next
dispatch attempt and refresh `dispatchedAt` only after successful publication.
The same canonical transport idempotency key remains sufficient under the
conservative retention cutoff described above; verify it through adapter tests.

If either execution or dispatch budget is already spent, do not rearm. Under
the same locked transaction, visibly settle nonterminal recovery with a fixed
safe exhaustion reason and associated dead letter, preserving both budgets and
prior history. Distinguish recovery/delivery exhaustion from scanner rejection
or an actual new execution failure. Define the resulting job/event states in
the record and tests. Preserve existing dead letters; repeated/concurrent calls
must not append duplicate exhaustion records for the same transition. A failed
dead-letter insert rolls back the transition. Reconciliation must not revive
dead-lettered jobs or grant automatic manual-retry authority.

This deliberately shares the original finite dispatch budget across initial
delivery and recovery. An outage can end in visible recovery exhaustion even
with execution budget left. Document that trade-off; do not silently reset
attempts or create unlimited new outbox generations to avoid it.

### 4. Keep selection, dispatch and execution separate

`reconcileOnce()` performs database reconciliation only. It never enqueues,
calls the processor, scans files or dispatches recursively. A future protected
runner will await reconciliation and dispatch as separate bounded operations.
Prove rearmed intent reaches `OutboxDispatcherService.dispatchOnce()`, which
publishes outside SQL using existing fencing and ledger preservation.

No boot hook, detached promise, queue-consumer side effect, timer, HTTP endpoint,
Cron schedule or active Services configuration is added. Update module/boot
tests to prove the provider resolves without creating a BullMQ worker, metrics
listener, scanner VM or transport connection. Do not modify the queue message
schema, delivery acknowledgement policy, region or retention configuration.

## Verification and exit criteria

Write outcome tests first where practical. Use controlled fixture timestamps
and held transactions/barriers instead of sleeps for lease/retention races.

1. All three job kinds recover from a simulated message expiry, pass through
   the real dispatcher and leased executor, and produce one authoritative
   business result. Cover an expired `running` lease and a never-started job.
2. Existing terminal ledgers, active leases, recent dispatch/activity, future
   timestamps, pending/retrying/dead-lettered intent and non-Vercel profiles
   are unchanged. Include retryable failed ledger versus terminal aggregate.
3. Terminal aggregate with stale running ledger is repaired without invoking
   processing, even at execution-budget exhaustion. Failure history survives.
4. Concurrent reconcilers and reconcilers racing dispatch/execution/cancellation
   obey batch bounds and ownership. Repeated calls before dispatch rearm once;
   a new successful dispatch imposes the full cooldown before another recovery.
5. Execution/dispatch budget exhaustion produces one safe durable outcome;
   failed dead-letter insertion rolls everything back. Neither budget resets.
6. Rearm transaction rollback leaves the old dispatched event intact. Crash
   after rearm but before dispatch leaves normal pending intent recoverable.
   Accepted publish plus failed completion recording remains duplicate-safe.
7. Malformed identity, wrong tenant/job/upload linkage and missing aggregate
   never publish or modify another tenant's job. Two-org user-scoped RLS
   negative reads/writes remain enforced; internal recovery uses worker context
   and least-privilege runtime identity, never owner/bypass credentials.
8. Capture real bounded-query plans against representative local fixture volume;
   justify any added index with evidence. No arbitrary latency claims.

Use only isolated local `acres_test`, respecting `server/test/setup-env.ts` and
existing helper guards. Never point cleanup/tests at Neon preview. Inspect the
actual test helpers before importing or changing them. Mocked transport faults
and local PostgreSQL tests do not prove hosted Vercel recovery.

Run focused new suites first, then these existing commands sequentially under
verified Node 24, saving and quoting real output and exit codes:

```bash
npm run build:server
npm run test --workspace=@acres/server -- --runInBand
npm run test:e2e --workspace=@acres/server -- --runInBand --testTimeout=30000
npm run contracts:check
npm run lint
npm run build
npm run typecheck
npm run vercel:probe-test
npm run ops:check
git diff --check
```

Format only changed source/prompt files and new documentation blocks using
installed Prettier; avoid historical whole-file churn. Build and typecheck
sequentially to avoid generated-client/Next type races. Inspect the full diff.
Resolve permitted local prerequisites and report actual restrictions/failures;
do not weaken assertions or relabel skipped checks as passing. No browser
suite is needed unless an actual change or failure makes it relevant.

## Impact, non-goals and rollback

Routes, shared DTOs, UI, provider selection/defaults and reference-worker
behavior stay unchanged. The new internal callable operation has no automatic
caller in this unit. It enables a future protected runner; no hosted job is
recovered until the managed wiring and acceptance are implemented.

No deployments, hosted resources/environment changes, credentials, paid usage,
SDK/dependency upgrades, scanner rebuilds, emails, external messages or push.
No public/manual retry command, terminal reset, unlimited recovery, legacy
backfill, provider fallback or operator launch approval. No new general-purpose
scheduler/observability platform. Scanner freshness and production-only Cron
proof remain explicit separate gates.

Ordinary code revert disables the callable service. Already rearmed intent
remains valid for Prompt 374's dispatcher; do not delete pending intent or undo
terminal/exhaustion records to make rollback look clean. If an additive index
is required, leave it in place on code rollback. Record how to stop future
callers before reverting once the operation is eventually wired.

## Review, documentation and completion

After self-verification dispatch a read-only reviewer subagent with this
prompt, baseline/current SHAs, full working diff including new files, state
table, cutoff/budget decisions, query plans and actual check output. Review
must trace stale selection → locked ownership → terminal repair/rearm/exhaustion
→ existing dispatch → leased duplicate execution. Evaluate feedback using
`receiving-code-review`; fix verified issues, re-test, and re-review significant
concurrency/architecture corrections before recording completion.

Record implementation, exact cutoff, total budgets, state transitions, failed
attempts, tests/plans, review and local reproduction in
`docs/vercel-deployment.md` and `docs/backend.md`. Update current recovery
boundary in `docs/system-architecture.md`, scoped abuse/mitigation notes in
`docs/security.md`, and add a concise Phase 12 entry to `docs/build-plan.md`.
Update `docs/ingestion.md` only for changed recovery behavior. Preserve historical
evidence, identifying superseded remaining-work bullets explicitly. Do not
mark Prompt 370, first preview, any launch category or Phase 12 complete.

Give exact local inspection commands (`npm run db:up`, isolated test setup and
the verified focused suite invocation). State that protected after-commit
invocation/Cron, Services routing, distributed throttling and deployed preview
acceptance remain open. Stage only approved files, inspect the staged diff,
and commit locally to `main` using `caveman-commit`. Do not push.
