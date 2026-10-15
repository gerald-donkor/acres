# Prompt 376 — Protected managed outbox dispatch

## Scope and why this is next

Planning baseline: `dd7a960` on `main`, 2026-10-15; clean working tree.
Parent: Phase 12 managed-target amendment, approved Prompt 370 ordered step 5
("replace outbox timers … with protected Cron handlers and database
coordination"). This sub-prompt inherits Prompt 370's approval limits: free
tiers only, no paid usage, no push, no production promotion.

Resolved from code and history, not from prompt files:

- Prompt 374 (`f1d9f6c`) built the bounded, fenced
  `OutboxDispatcherService.dispatchOnce()` and transactional ingestion intent.
- Prompt 375 (`dd7a960`) built `JobReconciliationService.reconcileOnce()`.
  Its record (`docs/vercel-deployment.md`, "Queue-retention job
  reconciliation") states it has **no caller** and that "a future protected
  runner must separately await reconciliation and `dispatchOnce()`".
- Under `QUEUE_PROVIDER=vercel` nothing calls `dispatchOnce()` at all: the only
  caller is the self-hosted BullMQ worker's `setInterval`
  (`server/src/worker/upload-worker.service.ts`), which refuses to start under
  the Vercel profile. Committed intent for `upload.completed`,
  `ingestion.run` and `export.requested` is therefore never published on the
  managed profile.

Both remaining "still open" items that precede the first application preview
depend on this unit: the deployed preview cannot run a single upload/scan,
ingestion or export until something dispatches. Distributed throttling and the
Services/route configuration are independent and stay later sub-prompts.

This unit builds, locally and verified against real PostgreSQL:

1. **`ManagedDispatchRunnerService`** — one bounded, awaited sweep:
   reconciliation then dispatch, in passes, under a pass cap and time budget.
2. **A protected Cron function entry** — `server/src/vercel/dispatch.function.ts`
   exporting `GET`, authenticated by Vercel's documented
   `Authorization: Bearer ${CRON_SECRET}` header, failing closed before any
   Nest boot or database work.
3. **An after-commit dispatch kick** — after the three API commands that append
   outbox intent commit successfully, the managed profile extends the request
   with `waitUntil()` and runs one coalesced `dispatchOnce()` in-process. The
   self-hosted profile is a no-op (its worker timer still owns dispatch).

It does **not** wire the function into any deployment config, add a `crons`
entry, deploy, or change any hosted resource. Those belong to the first preview
deployment sub-prompt, because `jobs.function.ts` is likewise not yet in a
deployment config and Cron executes only on production deployments.

Preparing this file authorizes no implementation, dependency installation,
staging, commit or deployment. Execute only after phase-control approval.

## References read during planning

Re-read at execution; resolve current state from code and `git log`:

- `AGENTS.md` §§2, 2.1, 5, 6, 7, phase-control commands, §3 ledger.
- `docs/vercel-deployment.md`: "Resume here", "Queues — 2026-10-15" (retry
  table, open items, the forged-POST 404 finding, the production-alias
  incident), Prompt 374 and Prompt 375 records.
- `docs/adr/0001-vercel-managed-production.md`.
- `docs/backend.md` (dispatcher, leased executor, scheduler single-instance
  constraint), `docs/security.md` (worker/RLS boundary, Prompt 374/375
  fencing/replay notes), `docs/system-architecture.md` (dispatch boundary),
  `docs/build-plan.md` Phase 12 managed amendment and the 374/375 entries,
  `docs/ingestion.md` (transactional ingestion intent).
- Code:
  - `server/src/outbox/{outbox.module.ts,outbox.service.ts,outbox-dispatcher.service.ts,job-reconciliation.service.ts}` and specs.
  - `server/src/vercel/{jobs.function.ts,jobs-runtime.ts,queue-consumer.ts,vercel-jobs.module.ts}` and specs.
  - `server/src/worker/upload-worker.service.ts` (the self-hosted timer — unchanged).
  - `server/src/uploads/uploads.service.ts` (`complete`, `appendUploadCompleted` at ~L247),
    `server/src/reports/reports.service.ts` (`createExport`, `appendExportRequested` at ~L582),
    `server/src/ingestion/ingestion.service.ts` (run start, `appendIngestionRun` at ~L285),
    and their `*.service.spec.ts` suites.
  - `server/src/config/{env.validation.ts,env.validation.spec.ts,acres-config.service.ts,config.module.ts}`,
    `server/.env.example`.
  - `server/test/{job-reconciliation.e2e-spec.ts,data-journey.e2e-spec.ts,helpers/real-db-test-app.ts,setup-env.ts}`.
- Installed Next guide `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`
  (read to confirm `after()` is a Next request API and therefore **not**
  usable inside the Nest server; the server needs `@vercel/functions`).

Official documentation fetched during planning (2026-10-15, `.md` endpoints);
refresh during execution:

- `https://vercel.com/docs/cron-jobs/manage-cron-jobs.md` — `CRON_SECRET` is
  sent as `Authorization: Bearer <value>`; recommended ≥16 random characters;
  delivery is **best effort**, may be **missed** or **duplicated**; a cron run
  can overlap the next; cron does **not follow redirects** (3xx is final);
  `x-vercel-cron-schedule` names the triggering expression; a new deployment
  does not interrupt a running cron invocation.
- `https://vercel.com/docs/cron-jobs/usage-and-pricing.md` — Hobby: 100 jobs
  per project, **minimum interval once per day**, precision ±59 min; more
  frequent expressions fail deployment. Pro: per-minute.
- `https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package.md`
  — `waitUntil(promise)` extends the request lifetime; promises share the
  function's timeout and are cancelled when it times out.
- npm metadata: `@vercel/functions@3.10.1` (latest), Apache-2.0, engines
  `node >= 20`, depends on `@vercel/oidc@4.0.1`; peers `ws` and
  `@aws-sdk/credential-provider-web-identity` are **optional**. The repository
  currently resolves `@vercel/oidc@3.8.10` (via blob/queue/sandbox), so a
  second nested `@vercel/oidc` copy is expected.

Design consequence of the Hobby limit: Cron alone gives at most one sweep per
day on the fixed free-tier target. The after-commit kick is therefore the
**primary** dispatch trigger; Cron is the reconciliation/retry backstop. A
transport failure during a kick leaves intent `pending`/retrying until the next
kick on that deployment or the daily sweep. This latency is a recorded Hobby
limitation, not a defect to hide (see "Production decision" in the migration
record).

## SKILLS USED

- `architecture-patterns` — keep trigger (Cron/kick) separate from the transport-agnostic dispatcher and reconciler.
- `architecture-decision-records` — conform to ADR 0001; record the trigger topology, no new ADR unless the decision changes.
- `nestjs-best-practices` — provider/token composition in `OutboxModule`, constructor injection, no boot side effects, avoiding module cycles.
- `api-design-principles` — the internal Cron endpoint's method, status codes and minimal response contract.
- `auth-implementation-patterns` — bearer shared-secret verification, constant-time comparison, fail-closed configuration.
- `secrets-management` — `CRON_SECRET` scope (sensitive, production + preview), validation, rotation and no logging.
- `security-best-practices` — scoped secure implementation of the new internal ingress.
- `security-threat-model` — add the Cron endpoint and kick to the existing boundary/abuse register from actual code.
- `postgres-best-practices` — rely on and prove existing `SKIP LOCKED` claim fencing under concurrent triggers; no SQL across transport calls.
- `error-handling-patterns` — sanitized failures, swallowed-but-recorded kick errors, rejection on sweep failure.
- `deployment-pipeline-design` — keep deployment wiring, Cron schedule and rollback boundaries for the next sub-prompt.
- `javascript-testing-patterns` — typed unit tests with injected clock/scheduler, no sleeps.
- `e2e-testing-patterns` — real PostgreSQL concurrency and command → kick → dispatch journeys.
- `requesting-code-review` — independent read-only review after self-verification.
- `receiving-code-review` — verify findings technically before fixing; re-review significant changes.
- `caveman-commit` — mandatory local commit message on `main`.

Reload every listed skill before writing code. No Vercel deployment skill is
installed; the official docs above own the Cron and `waitUntil` contracts.
Use Prisma 7/`adapter-pg` and the existing `TenantTransactionService`, not
generic ORM examples. No UI, styling, shadcn, motion or client skill applies:
no client file changes.

## Implementation plan

### 0. Preflight

1. Re-read this prompt, `AGENTS.md`, the records above. Confirm `git status`
   is clean apart from this prompt and record `BASE_SHA`.
2. Use Node **24.21.0** for both `node` and `npm` exactly as the migration
   record's "Resume here" step 3 describes; verify `node --version` inside
   `npm run`. System Node 26 runs are not counted.
3. Install the dependency in the server workspace only, exact pin:
   `npm install --workspace=@acres/server --save-exact @vercel/functions@3.10.1`
   (if a newer patch is latest at execution, re-check its dependencies/peers and
   record the chosen version). Confirm `ws` and the AWS peer were **not**
   added, record the nested `@vercel/oidc` resolution from `npm ls @vercel/oidc`,
   and commit the lockfile change. Do not upgrade `@vercel/blob`,
   `@vercel/queue` or `@vercel/sandbox`.
4. Read the installed `@vercel/functions` source for `waitUntil` and record, in
   the migration record, exactly what it does when no Vercel request context
   exists (expected: forwards to the context's `waitUntil` if present,
   otherwise no lifetime extension; it must not throw for a valid promise).
   If it throws or behaves differently, adapt the scheduler adapter in step 3
   and record the observed behavior instead of the expectation.

### 1. `CRON_SECRET` validation (shared pure rule)

In `server/src/config/env.validation.ts`:

- Export a pure function `isUsableCronSecret(value: string | undefined): value is string`
  returning true only when the trimmed value equals the raw value, has
  length **≥ 32**, and does not start with `change-me` or `__REQUIRED_`
  (the existing placeholder prefixes). 32 is the repository's existing secret
  floor for `CSRF_SECRET`, stricter than Vercel's 16-character recommendation.
- Parse optional `CRON_SECRET` into `cronSecret?: string` on the validated
  config. Unset is allowed in every profile (self-hosted never needs it; a
  managed deployment without it simply cannot be swept — the handler fails
  closed). When **set**, it must satisfy `isUsableCronSecret`, and must differ
  from `SESSION_SECRET` and `CSRF_SECRET` when those are present in the parsed
  environment; otherwise throw with messages that **never include the value**:
  `CRON_SECRET must be at least 32 characters and not a placeholder.` /
  `CRON_SECRET must differ from SESSION_SECRET and CSRF_SECRET.`
- Expose `cronSecret` via `AcresConfigService` only if a consumer needs it;
  the handler reads `process.env.CRON_SECRET` itself (step 4) so that a
  rejected request never boots Nest. Do not add a getter nobody uses.
- Add `# CRON_SECRET=` (empty, commented, with a one-line note: "managed
  profile only; Vercel sends it as Authorization: Bearer; ≥32 random chars")
  to `server/.env.example`.
- Tests in `env.validation.spec.ts`: unset accepted; 31 chars rejected; 32
  accepted; leading/trailing whitespace rejected; both placeholder prefixes
  rejected; equal-to-session and equal-to-CSRF rejected; error messages do not
  contain the supplied value; `isUsableCronSecret` truth table including
  `undefined` and `''`.

### 2. `ManagedDispatchRunnerService` — one bounded sweep

New `server/src/outbox/managed-dispatch-runner.service.ts`, provided and
exported by `OutboxModule`.

```ts
export interface ManagedSweepResult {
  enabled: boolean;
  passes: number;
  stoppedBy: 'drained' | 'pass_cap' | 'budget' | 'disabled';
  reconciliation: Omit<JobReconciliationResult, 'enabled'>; // summed
  dispatch: OutboxDispatchResult;                             // summed
}
export const SWEEP_MAX_PASSES = 8;
export const SWEEP_BUDGET_MS = 120_000;
```

Constants, not new environment variables (YAGNI; no operator has asked to tune
them). Rationale to record: 8 passes × `OUTBOX_CLAIM_BATCH_SIZE` 25 = up to 200
events per sweep; 120 s leaves headroom under the 300 s Hobby function maximum
the lease configuration already assumes (`JOB_LEASE_MS` comment).

`sweep()` algorithm (inject a `now: () => number` clock via an optional
provider token `SWEEP_CLOCK` defaulting to `Date.now`, for deterministic tests):

1. If `config.queueProvider !== 'vercel'` return `enabled: false`,
   `stoppedBy: 'disabled'`, zero counts. Never call reconcile/dispatch.
2. `deadline = now() + SWEEP_BUDGET_MS`.
3. Loop while `passes < SWEEP_MAX_PASSES`:
   - If `passes > 0 && now() >= deadline` → `stoppedBy: 'budget'`, stop.
     (The check happens **between** passes; an in-flight awaited pass is
     never abandoned or raced.)
   - `r = await reconciler.reconcileOnce()` — only on the first pass, or when
     the previous pass's `r.examined === config.outboxClaimBatchSize`
     (a full reconciliation batch suggests more stale rows).
   - `d = await dispatcher.dispatchOnce()`.
   - Sum counts; `passes++`.
   - If `d.claimed < batchSize` and the last reconciliation (if run this pass)
     was not full → `stoppedBy: 'drained'`, stop.
4. Exiting by the loop bound → `stoppedBy: 'pass_cap'`.
5. Any rejection from reconcile/dispatch **propagates** (do not convert to a
   partial success; earlier committed transitions remain durable and valid).

Read the exact config property name for the batch size from
`AcresConfigService` before writing. Order matters and must be tested:
reconciliation rearms stale intent to `pending` with database-time
`nextAttemptAt`, so the dispatch in the same pass publishes it.

**Coordination.** Add no new lock. Concurrent sweeps, kicks and the reference
worker are already safe: claims use `FOR UPDATE … SKIP LOCKED` with claim
leases, `ownsClaim` fences publication, reconciliation locks with `SKIP LOCKED`,
and the transport uses the canonical `eventType:aggregateId` idempotency key.
Vercel's documented overlap/duplicate Cron delivery is covered by these
properties; prove it in step 6 rather than adding an advisory lock that would
need its own failure semantics.

### 3. After-commit dispatch kick

New files in `server/src/outbox/`:

- `after-response.scheduler.ts`:
  ```ts
  export const AFTER_RESPONSE_SCHEDULER = Symbol('AFTER_RESPONSE_SCHEDULER');
  export interface AfterResponseScheduler { waitUntil(promise: Promise<unknown>): void; }
  ```
  Provided in `OutboxModule` as
  `{ provide: AFTER_RESPONSE_SCHEDULER, useValue: { waitUntil: (p) => { waitUntil(p); } } }`
  importing `waitUntil` from `@vercel/functions`. An object (not a bare
  function) so e2e tests can `jest.spyOn(app.get(AFTER_RESPONSE_SCHEDULER), 'waitUntil')`.
- `dispatch-kick.service.ts` — `DispatchKickService` (provided/exported by
  `OutboxModule`):
  - `afterCommit(): void` — synchronous, never throws, never awaited by callers.
  - Reads `config.queueProvider` **at call time** (consistent with
    `reconcileOnce()`, and required for the existing e2e spy pattern). If not
    `'vercel'`: return immediately — the self-hosted API must not construct or
    touch a BullMQ connection, and the worker timer already dispatches.
  - Single-flight coalescing per instance: if no run is in flight, start
    `chain = run()`; if one is in flight, set `rerunRequested = true`. In both
    cases pass the **current chain promise** to `scheduler.waitUntil(chain)`,
    so every kicking request extends its own lifetime until the coalesced work
    finishes. `run()` = `await dispatcher.dispatchOnce()`, then if
    `rerunRequested` was set during it, clear it and `await dispatchOnce()`
    exactly once more; then clear the in-flight marker in `finally`. The chain
    is therefore finite (≤ 2 batches per in-flight run) and bounded by
    `OUTBOX_CLAIM_BATCH_SIZE`.
  - Errors from `dispatchOnce()` are caught inside the chain and logged once
    at `error` level with the fixed message
    `Outbox dispatch kick failed; durable intent remains recoverable.` — no
    exception message, payload, IDs or provider detail (consistent with the
    sanitization prompts 73–99). The chain promise itself always resolves.
  - No reconciliation in the kick (keeps request-path work to one bounded
    dispatch; reconciliation is Cron's job). No timer, no detached promise
    outside `waitUntil`, no `setImmediate`.
- Call sites — change each of the three commands from
  `return this.tenants.organizationScoped(…)` (or the equivalent wrapper) to:
  ```ts
  const result = await this.tenants.organizationScoped(…);
  this.dispatchKick.afterCommit();
  return result;
  ```
  - `UploadsService` completion (the method containing `appendUploadCompleted`).
  - `ReportsService` export creation (`appendExportRequested`).
  - `IngestionService` run start (`appendIngestionRun`).
  Inject `DispatchKickService` via constructor. The kick fires only after the
  transaction promise resolves (commit succeeded); a thrown command (conflict,
  not found, validation, rollback) never kicks. An idempotent replay that
  returns the stored response also kicks — harmless (it only sweeps due
  intent) and helps drain backlog; state this in the record. Verify these
  services' modules already import `OutboxModule`; do not create a cycle.
  Update each service's existing unit spec's provider list and add: kick
  called once after success; not called when the transaction rejects.

### 4. Protected Cron function entry

Framework-free core `server/src/vercel/dispatch-handler.ts`:

```ts
export interface DispatchRuntime { sweep(): Promise<ManagedSweepResult>; }
export function createDispatchHandler(deps: {
  resolveRuntime: () => Promise<DispatchRuntime>;
  readSecret: () => string | undefined;          // () => process.env.CRON_SECRET
  logger?: Pick<Logger, 'log' | 'error' | 'warn'>;
}): (request: Request) => Promise<Response>;
```

Behavior, in this exact order (each step returns before the next does any work):

| condition | status | body (`application/json`) | boots Nest? |
| --- | --- | --- | --- |
| `readSecret()` fails `isUsableCronSecret` | 503 | `{"ok":false,"error":"dispatch_unavailable"}` | no |
| `Authorization` header absent, not exactly `Bearer <secret>` | 401 | `{"ok":false,"error":"unauthorized"}` | no |
| runtime resolution rejects (boot failure or non-Vercel provider) | 503 | `{"ok":false,"error":"dispatch_unavailable"}` | attempted |
| `sweep()` rejects | 500 | `{"ok":false,"error":"dispatch_failed"}` | yes |
| `sweep()` resolves | 200 | `{"ok":true,"passes":n,"stoppedBy":…,"reconciliation":{…},"dispatch":{…}}` | yes |

- Every response sets `Cache-Control: no-store`. Never return 3xx (Cron treats
  redirects as final).
- Comparison: compute SHA-256 of the received header value and of
  `` `Bearer ${secret}` `` and compare with `crypto.timingSafeEqual` (equal
  length digests, no length leak, no early exit). Exact scheme case
  (`Bearer`), single space, no trimming — matches Vercel's documented check.
- The response contains global counts only: no IDs, tenants, keys, payloads
  or error text. Log one `log`-level line with the same counts on success; on
  401 log nothing (avoid log-flooding by unauthenticated callers); on 500/503
  log a fixed message without exception detail.
- `x-vercel-cron-schedule` is read only for the success log line (bounded to
  64 chars); it confers no authority.
- Do not inspect or require any other header (user agent, IP) for authority.

Runtime resolution `server/src/vercel/dispatch-runtime.ts`: mirror
`createRuntimeResolver` in `jobs-runtime.ts` — cache the context promise per
instance, reset it on boot failure so the next invocation retries, assert
`config.queueProvider === 'vercel'` (throw otherwise) and return
`{ sweep: () => app.get(ManagedDispatchRunnerService).sweep() }`. Extract a
shared generic cached-context helper only if it removes real duplication
without changing `jobs-runtime.ts` behavior or tests.

Composition `server/src/vercel/vercel-dispatch.module.ts`: a lean
`VercelDispatchModule` importing only what `OutboxModule` needs
(`AcresWorkerConfigModule`, `PrismaModule`, `QueueModule`, `OutboxModule`).
Verify by boot test that no feature controllers (and therefore no
`SessionGuard`/`SessionsModule` requirement) are pulled in; if DI requires
more, add the minimum and record why. No `MetricsModule`, no
`ScheduleModule`, no `listen()`.

Entry `server/src/vercel/dispatch.function.ts`:

```ts
import 'reflect-metadata';
// NestFactory.createApplicationContext(VercelDispatchModule, { abortOnError: false })
export const GET = createDispatchHandler({ resolveRuntime, readSecret: () => process.env.CRON_SECRET });
```

Export **only** `GET` (Vercel Cron issues GET). Add a doc comment stating:
not yet referenced by any deployment config; the next sub-prompt adds it to
the Services/functions config with explicit region `iad1`, a `maxDuration`
≥ `SWEEP_BUDGET_MS` + boot headroom, and a `crons` entry (daily on Hobby);
no public rewrite other than the Cron path. Confirm the server build emits it
next to `jobs.function.js` (inspect `nest-cli.json`/`tsconfig.build.json`
output; do not change build config unless the file is not emitted).

### 5. What stays unchanged

- Self-hosted worker timer, BullMQ adapter, `worker.ts`, `@nestjs/schedule`
  session/retention jobs and `SCHEDULER_ENABLED` semantics.
- `dispatchOnce()`, `reconcileOnce()`, outbox/job state machines, budgets,
  queue message schema, consumer retry table, region/retention config.
- Shared DTOs, OpenAPI/GraphQL contracts, client code, routes served by the
  Nest HTTP app (the Cron entry is a separate function, not a Nest route).

## Verification and exit criteria

Write outcome tests first where practical; use injected clocks/schedulers and
barriers, never sleeps.

**Unit (`npm run test --workspace=@acres/server`)**

1. `managed-dispatch-runner.service.spec.ts`: disabled outside Vercel (no
   calls); reconcile→dispatch order within a pass; drains after a short batch;
   continues while batches are full; reconciliation rerun only after a full
   reconciliation batch; stops at `SWEEP_MAX_PASSES`; stops by budget using
   the injected clock, checked only between passes; counts summed exactly;
   rejection propagates.
2. `dispatch-kick.service.spec.ts`: no-op and no scheduler call outside
   Vercel; one `dispatchOnce` per isolated kick; N concurrent kicks during an
   in-flight run → exactly one extra run; each kick passes a promise to
   `waitUntil`; dispatcher rejection → chain resolves, fixed error message
   logged once, no detail; marker cleared so the next kick starts a new run.
3. `dispatch-handler.spec.ts`: every row of the status table; unset, short and
   placeholder secrets → 503 without calling `resolveRuntime`; missing header,
   wrong secret, `bearer` lowercase, extra whitespace, `Bearer` with empty
   token, secret-prefix and secret-suffix variants → 401 without calling
   `resolveRuntime`; boot failure → 503 and the next call re-resolves; sweep
   rejection → 500 with no error text in body or log; `Cache-Control: no-store`
   on all; success body has no IDs.
4. `dispatch-runtime.spec.ts`: cached once; reset on rejection; throws for a
   non-Vercel provider.
5. Env validation cases from step 1; the three service specs from step 3.
6. Boot test (extend the existing composition boot test that resolves
   `VercelJobsModule`/`WorkerModule`): `VercelDispatchModule` boots as an
   application context under a Vercel-profile environment, resolves
   `ManagedDispatchRunnerService`, creates no BullMQ worker, timer, metrics
   listener or transport connection; `AppModule` resolves
   `DispatchKickService`.

**Real PostgreSQL (`server/test/managed-dispatch.e2e-spec.ts`)** — follow the
`job-reconciliation.e2e-spec.ts` harness (`createRealDbTestApp`, mocked
`WORK_QUEUE`, `queueProvider` getter spied to `'vercel'`); reuse its fixture
style for organizations/uploads/runs/exports. Inspect the helper before use;
add an override hook to it only if required, without weakening its
`acres_test` guards.

7. Command → kick → dispatch: for each of upload completion, ingestion run
   start and export request, invoke the **real service command**, capture the
   promise passed to the spied scheduler, await it, and assert the event is
   `dispatched` and `enqueue` was called once with `<eventType>:<aggregateId>`
   — without any manual `dispatchOnce()`.
8. A command that throws (e.g., completing an upload not awaiting completion)
   leaves no new event and never calls the scheduler.
9. Under `'bullmq'` the scheduler is never called and new intent stays
   `pending`.
10. One `sweep()` both rearms a stale dispatched event (fixture timestamps
    beyond the Prompt 375 cutoff) and publishes it in the same call.
11. Backlog: 60 pending events across two organizations with batch size 25 →
    one sweep dispatches all 60 in 3 passes, `stoppedBy: 'drained'`.
12. Concurrency: two `sweep()` calls plus three `afterCommit()` kicks started
    together over 60 pending events → every canonical key enqueued exactly
    once, all 60 `dispatched`, no event in another state.
13. Enqueue failure for one event → `retried` counted, event retrying with
    future `nextAttemptAt`, others dispatched; a later sweep after the fixture
    advances `nextAttemptAt` publishes it.
14. Existing two-org RLS negatives still pass; the runner uses worker context
    and the least-privilege runtime role only.

Use only the isolated local `acres_test` database per `server/test/setup-env.ts`;
never point tests at Neon. Mocked transport and local PostgreSQL do not prove
hosted Cron, `waitUntil` lifetime extension or queue delivery — record that.

**Gates** — run sequentially under verified Node 24, quoting real output and
exit codes:

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

Run the focused new suites first while iterating
(`… test:e2e … -- --runInBand --testTimeout=30000 managed-dispatch`).
Prettier-check only changed files. `contracts:check` must report no drift (no
contract changed). Report the `ops:check` dependency-audit counts honestly and
note the new package. No browser suite: no client change.

## Impact, non-goals and rollback

**Impact.** Managed-profile API commands begin publishing their own intent
after commit; a new internal function entry exists but is not deployed or
routed. Self-hosted behavior, every public route, DTO, contract and UI is
unchanged.

**Non-goals** (each is a later sub-prompt or an explicit gate):

- Deployment config (`vercel.json`/Services), the `crons` entry and schedule,
  `maxDuration`, region pinning, setting `CRON_SECRET` in the Vercel project,
  any deployment or hosted proof — first preview deployment sub-prompt.
- Moving session/retention maintenance (`@nestjs/schedule`) to Cron — a
  separate sub-prompt; they keep `SCHEDULER_ENABLED` semantics here.
- Distributed throttling, Resend, progress-stream reconnection, scanner
  rebuild cadence, launch evidence.
- Any advisory/distributed lock, new env tuning knobs, manual retry API,
  budget reset, or change to dispatch/reconciliation semantics.
- Paid plan usage, Pro-only per-minute Cron, push, production promotion.

**Rollback.** Ordinary revert removes the kick, runner and entry. All intent
they touched stays in valid ledger states (`pending`, `retrying`,
`dispatched`, `dead_lettered`) usable by any later trigger or the self-hosted
worker; do not delete or reset rows. Once the entry is deployed in a later
sub-prompt, remove its `crons` entry and redeploy before reverting code.
Rotating `CRON_SECRET` (when it exists) invalidates the endpoint immediately.

## Review, documentation and completion

After self-verification dispatch a read-only reviewer subagent with this
prompt, `BASE_SHA`/`HEAD_SHA`, the full diff including new files and the
lockfile, the status table, sweep algorithm/constants rationale, coalescing
design and quoted gate output. The review must trace: Cron request → secret
check → cached boot → reconcile → dispatch → fenced claims; and API command →
commit → kick → `waitUntil` → coalesced `dispatchOnce`. Evaluate findings with
`receiving-code-review`; fix verified issues, re-test, and re-review any
concurrency, auth or architecture correction.

Record, preserving historical text and marking superseded "open" bullets:

- `docs/vercel-deployment.md`: new section "Protected managed dispatch —
  Prompt 376" (design, constants, status table, observed `waitUntil` behavior
  without context, dependency/oidc resolution, tests, review, reproduction,
  rollback); update "Resume here" (sub-prompt list gains 376; the Queues item's
  "Vercel outbox dispatcher" note becomes implemented-locally; the first
  preview item gains: add `dispatch.function.ts` with region/`maxDuration`, a
  daily `crons` entry, a sensitive ≥32-char `CRON_SECRET`, and prove kick and
  manual protected sweep on the preview plus Cron on production only).
- `docs/backend.md`: dispatch triggers per profile.
- `docs/security.md`: Cron endpoint trust boundary (shared bearer secret,
  fail-closed order, no boot before auth, counts-only response, abuse paths:
  brute force/flooding, replay of a captured header, duplicate/overlapping
  Cron, secret leakage → rotation) and the kick's request-path work bound.
- `docs/system-architecture.md`: current dispatch boundary for both profiles.
- `docs/build-plan.md`: concise "Phase 12 managed-target prerequisite —
  Prompt 376" entry.

Do not mark Prompt 370, the first preview, any launch category or Phase 12
complete. Give exact local reproduction commands (`npm run db:up`, the focused
e2e invocation with `env -u DATABASE_URL`, and the unit suites). Stage only
this prompt's files, inspect the staged diff, and commit locally to `main`
using `caveman-commit`. Do not push.
