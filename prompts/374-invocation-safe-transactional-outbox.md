# Prompt 374 — Invocation-safe transactional outbox

## Scope and why this is next

Planning baseline: `f283cd1` on `main`, 2026-10-15; working tree clean before
this prompt. Parent: Phase 12's managed-target amendment and approved Prompt 370. Prompts 371–373 have committed Blob browser and Sandbox scanner work;
the scanner snapshot has hosted seam evidence. The Acres application itself
has not been deployed. Resolve implementation from code and history again at
execution time; the opening status paragraphs of older records are historical.

The next milestone is the first application preview. Its earliest bounded
runtime prerequisite is a shared dispatcher that can run once without starting
the BullMQ worker. Today `UploadWorkerService.dispatchOutboxOnce()` owns the
only dispatcher, and `IngestionService.startRun()` calls the remote queue inside
its tenant SQL transaction. The migration record explicitly leaves both open.

Implement a transport-independent, bounded outbox dispatch service; move
`ingestion.run` onto the transactional outbox; make dispatch claims safe across
concurrent invocations, interrupted publishers and late completion. Wire the
service into both worker compositions without starting it at boot in the
Vercel context. This prompt prepares the callable dispatch foundation. A later
prompt adds protected after-commit invocation/Cron, queue-retention
reconciliation and deployment routing using this foundation.

This prompt requires approval under the `i` protocol. Preparing it changes no
implementation and does not deploy, stage or commit anything.

## References and verified starting behavior

Read during planning; re-read the relevant portions before implementation:

- `AGENTS.md` §§2–10 and `docs/skills.md`.
- `docs/build-plan.md` Phase 12 managed-target amendment and ordered steps 3–4.
- `docs/vercel-deployment.md`: Resume here, Queues, Scanner snapshot, target gates.
- `docs/adr/0001-vercel-managed-production.md`.
- `docs/backend.md`: Phase 6 outbox/worker, worker composition and Prompt 370.
- `docs/ingestion.md`: schema/RLS, publication idempotency and start-run routes.
- `docs/system-architecture.md`: modular boundaries and upload/job flow.
- `docs/security.md`: acceptance suite, critical review paths and worker boundary.
- `docs/project-status.md`: historical reference-profile assessment only.
- `server/src/outbox/{outbox.service.ts,outbox.module.ts,outbox.service.spec.ts}`.
- `server/src/worker/{upload-worker.service.ts,worker.module.ts,job-processor.service.ts,job-lease.service.ts,leased-job-executor.service.ts}`.
- `server/src/ingestion/{ingestion.service.ts,ingestion.module.ts}`.
- `server/src/vercel/{vercel-jobs.module.ts,jobs-runtime.ts,jobs.function.ts}`.
- `server/src/queue/{work-queue.port.ts,queue-message.ts,vercel-queue.adapter.ts,queue.module.ts}`.
- `server/prisma/schema.prisma`, existing outbox/RLS and execution-lease migrations.
- `server/test/{data-journey.e2e-spec.ts,infrastructure-failure.e2e-spec.ts}` and
  `server/test/helpers/real-db-test-app.ts`; root/server package manifests.

Observed starting contracts:

- `OutboxEvent.eventType` is a persisted string. Its application type currently
  includes only `upload.completed` and `export.requested`; the queue supports
  all three jobs including `ingestion.run`.
- Outbox identity is unique on event type, aggregate type/id and version.
- Claim SQL uses `FOR UPDATE SKIP LOCKED`; the service instance owns a static
  worker id, expiry uses the app clock, and finalization currently updates by
  id alone. These assumptions cannot coordinate concurrent Fluid invocations.
- Claims exclude rows at `maxAttempts`. A crash after the final claim can
  strand a row without a dead letter.
- Dispatch unconditionally resets an existing `DurableJob` to `queued` before
  publishing. That can reopen terminal work or erase execution state.
- Vercel consumers already use database execution leases and database-resolved
  tenant ownership. Keep this authority and its existing retry semantics.

No UI or Next.js API changes: static comps, pixel measurements, breakpoint
changes and browser screenshots are inapplicable. No new provider SDK API is
needed; retain the installed queue port. If implementation needs a new platform
API, verify current official documentation before using it and record the source.

## SKILLS USED

- `architecture-patterns` — isolate dispatch from transport and feature modules.
- `architecture-decision-records` — respect ADR 0001; distinguish implementation detail from a new decision.
- `nestjs-best-practices` — provider ownership, explicit imports, boot and cleanup.
- `postgres-best-practices` — transactional append, forced RLS and conditional writes.
- `sql-optimization-patterns` — bounded claim/recovery SQL and existing indexes.
- `deployment-pipeline-design` — invocation interruption and staged preview prerequisites.
- `secrets-management` — local test identities; no credential output or hosted environment mutation.
- `error-handling-patterns` — dispatch failures, retry budgets and durable safe outcomes.
- `javascript-testing-patterns` — focused typed unit tests and fault injection.
- `e2e-testing-patterns` — real PostgreSQL concurrency and data-journey acceptance.
- `requesting-code-review` — independent reviewer with requirements, baseline and actual checks.
- `receiving-code-review` — verify feedback, fix valid issues and re-review significant changes.
- `caveman-commit` — required local commit to main after approved execution.

Load every listed skill at execution, even if loaded during planning. Read the
Nest module-sharing, circular-dependency, transaction and provider-scope rules.
Use Prisma 7 adapter-pg and existing transaction services, not a skill's TypeORM
example. No dedicated Vercel deployment skill is available in this session;
this unit deliberately introduces no platform entrypoint or deployment config.
Load additional owning skills only if an unavoidable change crosses their
surface; explain and constrain any expansion before implementing it.

## Implementation plan

### 1. Establish the baseline and dispatch interface

Re-read this prompt and inspect git status. Preserve unrelated changes. Confirm
Node 24.21.0 from `.node-version` resolves for both node and npm; use the
temporary launcher procedure already documented rather than altering global
tooling. Inventory current dispatcher callers and constructor mocks first.

Add `server/src/outbox/outbox-dispatcher.service.ts` and its focused spec.
Expose one awaited `dispatchOnce()` operation with a typed bounded result:
counts for claimed, dispatched, retried, exhausted and lost claims, as needed
to describe real outcomes. Reuse existing validated claim batch/lease/retry
configuration; quote the resolved defaults in the record. Do not add a second
in-process daemon, startup hook, listener, scheduler or repeating timer.

Provide/export this service from `OutboxModule`, importing `QueueModule`
explicitly. It may depend on config, tenant transaction service, outbox service
and the queue port; it must not import ingestion/report/worker modules. Avoid
duplicate providers and `forwardRef` cycles. The dispatcher never scans files,
parses datasets or renders reports.

### 2. Fence dispatch ownership and recover exhausted claims

Keep short worker-scoped SQL transactions and parameterized queries. Generate
a fresh unguessable claim token per claim operation; return it with each
claimed event. Use the database clock for expiry and eligibility. Condition
all dispatch/retry/dead-letter finalization on matching ownership and expected
nonterminal state, with expiry behavior explicit. A stale invocation must not
clear a newer lock, change attempts, or append its dead letter. Report a lost
claim as such instead of pretending that dispatch was recorded.

Re-check ownership immediately before publishing. If sequential batch work
outlives a claim, leave it recoverable rather than publishing as its owner.
A publish can still race lease expiry or process termination; document the
remaining at-least-once window and rely on the execution ledger for duplicates.
Never describe fencing as exactly-once transport.

Each call must also settle a bounded set of expired/unlocked nonterminal rows
whose dispatch attempt budget is spent. Atomically transition each to
`dead_lettered` and append one safe `JobDeadLetter` under the same ownership
decision. This closes final-claim crashes. Concurrent recovery must create no
duplicate dead letters and must not touch active leases or dispatched rows.
Use separate bounded recovery if necessary so exhausted rows cannot starve
eligible dispatch. Database failure must reject the operation; no successful
summary when durable recording failed.

Prefer the existing lock columns and unique identity. Add an additive migration
only if a proven constraint/index requirement cannot be expressed safely with
the existing schema. Inspect existing grants/RLS and real plans before adding
indexes. Do not change tenant policies or use an owner/bypass role at runtime.

### 3. Preserve execution state and payload identity

Use an exhaustive job mapping:

| Outbox event       | Queue name/key                  | Payload identity                   |
| ------------------ | ------------------------------- | ---------------------------------- |
| `upload.completed` | `upload.completed:<upload id>`  | `uploadId`, `outboxEventId`        |
| `export.requested` | `export.requested:<request id>` | `exportRequestId`, `outboxEventId` |
| `ingestion.run`    | `ingestion.run:<run id>`        | `ingestionRunId`, `outboxEventId`  |

Keep the queue's versioned message format, region, retention, topic isolation
and provider authentication unchanged. Unknown persisted event types must
fail closed with a safe durable classification, never fall through to upload.
Use existing closed error literals where correct; add narrowly scoped fixed
literals if required rather than persisting raw provider exceptions/payloads.

Create a missing `DurableJob` before publish, with the existing deterministic
key, tenant and job identity. Existing rows must retain attempts, timestamps,
failure history, terminal state and active execution lease. Never reset a
dead-lettered row or grant a fresh execution budget through automatic dispatch.
Reject inconsistent tenant/job identity instead of rewriting it. A duplicate
may be re-published safely; existing execution/aggregate terminal checks remain
authority. Distinguish dispatch attempts from execution attempts in code/tests.

Publish outside every SQL transaction. Mark dispatched only after enqueue
resolves. On provider rejection use the existing bounded retry/backoff policy
and durable exhaustion record. On publish success followed by recording failure,
leave the event recoverable and allow duplicate delivery. Do not turn a ledger
write failure into an acknowledgement or silently consume the last attempt.

### 4. Append ingestion intent atomically

Extend `OutboxService` with `appendIngestionRun` (or an equally explicit name),
using aggregate type `IngestionRun`, aggregate id = run id and version 1.
Use the existing unique identity to make appending an existing run idempotent
without resetting dispatched/dead-lettered state.

Inside `IngestionService.startRun()` append intent in the exact transaction
that creates/resolves the run and records command idempotency. Remove direct
queue publication from that transaction. Import `OutboxModule` explicitly in
`IngestionModule`; remove unused queue injection/import only after checking all
other methods. Preserve request validation, RBAC, CSRF, status 201, response
shape, deterministic run identity and cancellation/publication semantics.
Queue outage after commit must leave a queued run and pending intent that can
recover later. Rollback must leave neither a new run nor its outbox event.

### 5. Reuse it in both compositions

Keep `UploadWorkerService.dispatchOutboxOnce()` as the compatible awaited
wrapper; delegate to the dispatcher. Retain worker timer, stopping/draining,
BullMQ connection and metrics lifecycle. Local serialization may prevent
overlap in that wrapper, but database fencing must work across instances.

Import `OutboxModule` in `VercelJobsModule` so a caller can resolve the same
dispatcher without `UploadWorkerService`, BullMQ sockets or perpetual loops.
Add a boot/resolve test for both compositions. Do not invoke dispatch from the
queue consumer, a constructor, module-init hook or unawaited promise.

## Verification and acceptance

Use tests that exercise outcomes, not only SQL text or mock call shape:

1. Unit: all three event mappings, empty/bounded batch, independent per-event
   retry, safe unknown type, provider rejection and recording failure.
2. Unit: missing ledger creation and preservation of every existing terminal
   state, attempt budget and live execution lease; identity mismatch denied.
3. Real PostgreSQL: concurrent dispatchers claim distinct rows; force claim
   expiry with controlled DB fixtures and prove late dispatched/retry/dead-letter
   operations cannot modify a replacement claim. Avoid timing sleeps.
4. Real PostgreSQL: final-claim crash recovery produces one durable dead letter
   under concurrent recovery; active and terminal rows remain untouched.
5. Real PostgreSQL: hold a transaction with ingestion intent uncommitted and
   dispatch from another connection; no publish. Commit then dispatch; publish
   sees the committed run. Rollback publishes nothing. Repeated commands and
   different idempotency keys for the same tuple create one run/intent.
6. Real PostgreSQL: simulate accepted publish followed by finalization failure,
   recover and redeliver; execution/immutable publication remains idempotent.
   Use the existing leased executor where appropriate.
7. Two-org forced-RLS negative reads/writes and mismatched identity checks;
   preserve user-scoped denial while dispatch uses only workerScoped context.
8. Update existing ingestion, worker and infrastructure fixtures for the new
   dependency. The data-journey suite must dispatch the persisted ingestion
   event and assert queue identity before invoking its processor; it must not
   bypass the new behavior merely to preserve an old passing count.

Extend the existing real-database suite or add
`server/test/outbox-dispatch.e2e-spec.ts` using its isolated test database and
captured fixture identities. Never run test cleanup against Neon preview or
customer data. Mock transport faults are not hosted Queues acceptance.

Run sequentially under verified Node 24; save and quote actual summaries:

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

Run focused changed suites first for failure triage. Use installed Prettier on
only changed source/prompt files and new documentation blocks; avoid whole-file
historical formatting churn. Build/typecheck sequentially to avoid generated
Next types races. Inspect the entire final diff and all callers. Record missing
services/sandbox restrictions accurately and resolve authorized local setup;
never report skipped DB evidence as a pass or weaken assertions to get green.
No full browser run is required for this backend-only change unless a failure
or necessary scope expansion gives a concrete reason.

## Non-goals, compatibility and rollback

No new HTTP endpoint, Cron schedule, after-commit kick, Services config,
production/preview deployment, provider resource, environment mutation, SDK
upgrade, secret rotation, scanner rebuild or email. No paid usage or Git push.
No queue-retention reconciliation for already-dispatched stale jobs in this
unit; keep that next runtime gate explicit. No automatic manual-retry policy,
terminal-job reset, role/product/UI changes or launch approval.

Routes retain their wire contracts. Ingestion becomes durably asynchronous
through the same worker outbox timer used for uploads/exports. State that queue
failure no longer aborts ingestion creation once database intent commits.
Old dispatch code does not understand ingestion events: local rollback must
pause/drain dispatch and account for pending `ingestion.run` intent before
reverting the code. Never let an older dispatcher treat it as upload work.
If a migration proves necessary, document a forward-compatible rollback and
leave additive columns/indexes intact rather than deleting live intent rows.

## Documentation, review and completion

After self-verification dispatch a read-only reviewer subagent per
`requesting-code-review`. Supply baseline SHA, current HEAD plus full working
diff/new files, this prompt, files changed, identity/state-transition decisions,
real check output and limitations. Review must trace transaction commit → claim
→ ledger → publish → finalization, lease theft, exhaustion and terminal replay.
Evaluate feedback with `receiving-code-review`; fix valid findings and re-test.
Re-review significant concurrency or architecture changes before completion.

Record actual implementation, verification, review, limitations and reproduction
in `docs/vercel-deployment.md`, `docs/backend.md` and `docs/ingestion.md`.
Update the current-state job/boundary notes in `docs/system-architecture.md`
and `docs/security.md` only where behavior changed. Add a concise Phase 12
build-plan entry. Correct the migration record's stale scanner opening status
using committed evidence while preserving historical attempts and findings.
Do not mark the first preview, parent Prompt 370, production readiness or any
launch category complete. No AGENTS.md expansion or scorecard increase.

Give exact local inspection/run steps using existing `npm run db:up`, required
test environment and the verified focused test command; explain the separate
transport needed for a full reference worker run. State clearly that Vercel has
no automatic dispatch trigger yet and name protected invocation/Cron plus
retention reconciliation as follow-on work.

Stage only this approved unit, inspect staged diff and commit locally to `main`
using `caveman-commit`. Preserve unrelated work. Do not push.
