# 134 — narrow queue `jobName` carrier to the closed `QueueJobName` union

## Scope, and why it is next

The committed repository is on `main` at `7941615`
(`refactor(outbox): narrow event type union`, the prompt 133 implementation).
The worktree is clean (verified this session via `git status --short`, empty
output). All 12 ordered phases in `docs/build-plan.md` are implemented and
committed through the Phase 12K exit gate (verification records §§16–22,
operator checklist in `docs/launch-checklist.md`), plus dependency-safe residual
hardening through prompt 133 — which closed the outbox `ClaimedOutboxEvent.eventType`
carrier to the two-member union `OutboxEventType = 'upload.completed' | 'export.requested'`.

There is no unbuilt ordered phase left. A repo-wide inspection over internal
domain boundaries and asynchronous queue interfaces proves that exactly one
open `jobName` carrier remains in the Phase 6 work queue port and adapter layer,
while a closed three-member vocabulary is already defined by every enqueue call site
and consumed by the worker queue consumer:

```ts
// server/src/queue/work-queue.port.ts:8–17 — OPEN
export interface QueuePort {
  enqueue(input: {
    deterministicKey: string;
    jobName: string; // ← open ('upload.completed' | 'export.requested' | 'ingestion.run', see below)
    payload: QueueJobPayload;
    delayMs?: number;
  }): Promise<void>;
  readiness(): Promise<boolean>;
  close(): Promise<void>;
}
```

```ts
// server/src/queue/bullmq-queue.adapter.ts:14–24 — OPEN
  async enqueue(input: {
    deterministicKey: string;
    jobName: string; // ← open
    payload: QueueJobPayload;
    delayMs?: number;
  }): Promise<void> {
    await this.getQueue().add(input.jobName, input.payload, {
      jobId: input.deterministicKey,
      delay: input.delayMs ?? 0,
    });
  }
```

against the producer authority across the entire codebase:
- `server/src/worker/upload-worker.service.ts:127–137`:
  ```ts
  await this.queue.enqueue({
    deterministicKey,
    jobName: event.eventType, // event.eventType: OutboxEventType ('upload.completed' | 'export.requested')
    payload:
      event.eventType === 'export.requested'
        ? {
            exportRequestId: event.aggregateId,
            outboxEventId: event.id,
          }
        : { uploadId: event.aggregateId, outboxEventId: event.id },
  });
  ```
- `server/src/ingestion/ingestion.service.ts:281–285`:
  ```ts
  await this.queue.enqueue({
    deterministicKey: `ingestion.run:${run.id}`,
    jobName: 'ingestion.run',
    payload: { ingestionRunId: run.id },
  });
  ```
No other `queue.enqueue()` call sites exist in the entire codebase.

against the test specifications:
- `server/src/worker/upload-worker.service.spec.ts:211–218`:
  `jobName: 'upload.completed'`
- `server/src/worker/upload-worker.service.spec.ts:247–254`:
  `jobName: 'export.requested'`

against test helpers:
- `server/test/helpers/test-app.ts:681–686` and `server/test/helpers/real-db-test-app.ts:34–39`:
  override `WORK_QUEUE` with mock `enqueue: jest.fn().mockResolvedValue(undefined)` which satisfies the narrowed interface.

In `server/src/queue/work-queue.port.ts`, `QueuePort.enqueue`'s `jobName` parameter
is typed as open `string`, despite the fact that jobs dispatched to the Valkey/BullMQ
work queue are produced solely by `UploadWorkerService.dispatchOutboxOnce`
(`'upload.completed'` and `'export.requested'`) and `IngestionService.startRun`
(`'ingestion.run'`).

Narrowing `QueuePort.enqueue` and `BullmqQueueAdapter.enqueue` to accept the closed
union `QueueJobName = 'upload.completed' | 'export.requested' | 'ingestion.run'`
prevents arbitrary or untyped job names from being enqueued, guarantees compile-time
alignment between queue producers and worker processors, requires zero casts (`as QueueJobName`),
needs zero runtime conversions, and modifies no public REST or GraphQL API contracts.

## Reference material read for it, by path

- `server/src/queue/work-queue.port.ts`: `QueuePort` and `QueueJobPayload` definitions.
- `server/src/queue/bullmq-queue.adapter.ts`: `BullmqQueueAdapter.enqueue` implementation.
- `server/src/worker/upload-worker.service.ts`: outbox event queue dispatch loop.
- `server/src/worker/upload-worker.service.spec.ts`: worker queue dispatch unit tests.
- `server/src/ingestion/ingestion.service.ts`: ingestion run queue dispatch.
- `server/src/outbox/outbox.service.ts`: `OutboxEventType` definition.
- `docs/backend.md`: Phase 6 queue and worker architecture.
- `docs/build-plan.md`: Phase 6 outcomes and verification records §§16–22.

## Measurements and procedure

Verified by static typechecking and TypeScript AST inspection:
1. `server/src/queue/work-queue.port.ts`:
   - Define and export the closed literal union:
     ```ts
     export type QueueJobName =
       | 'upload.completed'
       | 'export.requested'
       | 'ingestion.run';
     ```
   - Update `QueuePort.enqueue`:
     ```ts
     export interface QueuePort {
       enqueue(input: {
         deterministicKey: string;
         jobName: QueueJobName;
         payload: QueueJobPayload;
         delayMs?: number;
       }): Promise<void>;
       readiness(): Promise<boolean>;
       close(): Promise<void>;
     }
     ```
2. `server/src/queue/bullmq-queue.adapter.ts`:
   - Import `QueueJobName` from `./work-queue.port`.
   - Update `enqueue`:
     ```ts
     async enqueue(input: {
       deterministicKey: string;
       jobName: QueueJobName;
       payload: QueueJobPayload;
       delayMs?: number;
     }): Promise<void> {
     ```
3. Verify that `upload-worker.service.ts` consumes `event.eventType` (of type
   `OutboxEventType`) without assertions or casts, as `OutboxEventType` is a strict
   subtype of `QueueJobName`.
4. Verify that `ingestion.service.ts` provides `'ingestion.run'` without assertions
   or casts.
5. Verify that `upload-worker.service.spec.ts`, `test-app.ts`, and `real-db-test-app.ts`
   typecheck and pass cleanly.

## Expected impact

- `server/src/queue/work-queue.port.ts`:
  - `QueueJobName` defined and exported.
  - `QueuePort.enqueue` `input.jobName` typed strictly as `QueueJobName`.
- `server/src/queue/bullmq-queue.adapter.ts`:
  - `BullmqQueueAdapter.enqueue` `input.jobName` typed strictly as `QueueJobName`.
- `docs/backend.md`:
  - Update Phase 6 queue documentation record with the prompt 134 narrowing.
- No other runtime files modified.
- No public REST or GraphQL API changes (OpenAPI contracts check passes cleanly).

## Non-goals

- No change to Valkey connection options, queue prefix, or BullMQ configuration.
- No change to retry attempts, backoff schedule, or job retention policies.
- No change to `QueueJobPayload` fields or payload validation.
- No change to worker processor methods (`processRun`, `processExport`, `process`).
- No database schema alteration or Prisma migration.
- No client-side component changes.

## Checks to run

```bash
# 1. Queue, worker, and outbox unit tests
npm run test --workspace=@acres/server -- src/worker src/outbox

# 2. Public API and contract parity check
npm run contracts:check

# 3. Workspace-wide lint, typecheck, and build
npm run lint
npm run typecheck
npm run build

# 4. Git whitespace and status review
git diff --check
git status --short
git diff --stat
```

`docs/backend.md` owns the documentation record. Quote real command outputs.

## Rollback and stop conditions

Rollback is a clean git revert of modified source and documentation files.
Stop and re-evaluate if any of the following occurs:
- Any worker, outbox, or ingestion unit test fails or changes behavior.
- Any caller attempts to enqueue an unmapped job name string.
- `npm run contracts:check` detects drift in OpenAPI or GraphQL contracts.
- A runtime error, cast, or type assertion is required to satisfy typechecking.

## Completion criteria

- `QueuePort.enqueue` admits strictly `QueueJobName`.
- `BullmqQueueAdapter.enqueue` admits strictly `QueueJobName`.
- Zero casts (`as QueueJobName`) introduced at call sites.
- All server test suites (`src/worker`, `src/outbox`) pass cleanly.
- Workspace-wide lint, typecheck, and build succeed with exit code 0.
- `docs/backend.md` updated with the prompt 134 record.
- Changes committed locally to `main` using `caveman-commit`.

## SKILLS USED

- `architecture-patterns` — preserve clean modular-monolith boundaries and port/adapter
  isolation between queue ports, BullMQ adapters, outbox, and worker consumers; ensure
  cross-boundary queue contracts are strictly typed and immutable.
- `nestjs-best-practices` — keep changes restricted to typed port and adapter interfaces
  without altering dependency injection, module boundaries, or provider tokens.
- `error-handling-patterns` — preserve existing queue retry, backoff, and dead-lettering
  invariants.
- `javascript-testing-patterns` — execute Jest test suites for worker and outbox modules
  to confirm type safety and behavioral parity.
- `requesting-code-review` — dispatch reviewer subagent with structured context and
  verify diff against requirements before commit.
- `receiving-code-review` — evaluate reviewer findings with technical rigor and verify
  code before acting.
- `caveman-commit` — format the final commit message following Conventional Commits
  guidelines.

Not loaded, with reason: `playwright` (no UI or browser flow touched); frontend/
Tailwind/shadcn/GSAP skills (pure server-side backend queue type narrowing).
