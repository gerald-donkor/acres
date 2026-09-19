# 137 — export canonical queue job names tuple and add BullmqQueueAdapter unit tests

## Scope, and why it is next

The committed repository is on `main` at `9a0c46d`
(`refactor(scanner): narrow status and error unions`, the prompt 136 implementation).
The worktree is clean (verified this session via `git status --short`, empty output).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual type-narrowing and port
hardening through prompt 136.

There is no unbuilt ordered phase left in `docs/build-plan.md`. A comprehensive inspection
over internal asynchronous infrastructure, ports, and adapters reveals that:

1. In `server/src/queue/work-queue.port.ts`, `QueueJobName` is defined as a bare type
   union:
   ```ts
   export type QueueJobName =
     "upload.completed" | "export.requested" | "ingestion.run";
   ```
   without exporting a canonical runtime const tuple `QUEUE_JOB_NAMES`. This contrasts with
   the established patterns across domain ports and services in the codebase
   (`SCHEDULED_JOB_NAMES`, `JOB_RUN_STATUSES`, `SCAN_STATUSES`, `SCAN_ERROR_CODES`,
   `AUDIT_ACTIONS`, `REPORT_STATUSES`), and was specifically referenced in prompt 136 as an
   architectural expectation.
2. In `server/src/queue/bullmq-queue.adapter.ts`, `BullmqQueueAdapter` serves as the
   foundational adapter implementing `QueuePort` for asynchronous job distribution via
   BullMQ and Valkey/Redis. However, it currently lacks dedicated unit test coverage
   (`server/src/queue/bullmq-queue.adapter.spec.ts` does not exist). It is tested only
   transitively through integration drills or mocked out in service-level tests, mirroring
   the exact testing gap that existed for `ClamavScannerAdapter` prior to prompt 136.

This prompt completes the asynchronous infrastructure port and adapter hardening lineage
established across prompts 133 (`OutboxEventType` narrowing), 134 (`QueueJobName` narrowing),
135 (`ScheduledJobName` narrowing), and 136 (`ScanStatus`/`ScanErrorCode` narrowing and
`ClamavScannerAdapter` unit test coverage).

Exporting the canonical `QUEUE_JOB_NAMES` tuple, deriving `QueueJobName` from it, and adding
a dedicated unit test suite for `BullmqQueueAdapter`:

- Exposes a canonical runtime array for queue job names for reflection, runtime assertion, and observability.
- Verifies `BullmqQueueAdapter` behavior in isolation with mock-based unit testing:
  - Lazy initialization of `IORedis` and `Queue` on first `enqueue()` or `readiness()` invocation.
  - Proper Valkey/Redis configuration options (`maxRetriesPerRequest: null`, `enableReadyCheck: true`).
  - Proper BullMQ `Queue` options (queue name, connection, prefix, defaultJobOptions with attempts, exponential backoff, retention ages).
  - Instance caching ensuring a single `Queue` and `IORedis` instance per adapter across multiple operations.
  - `enqueue()` behavior forwarding job name, payload, `jobId: deterministicKey`, and `delay: delayMs ?? 0`.
  - `readiness()` resolving `true` on successful job count inquiry, and gracefully catching and returning `false` on failure.
  - `close()` and `onModuleDestroy()` clean shutdown lifecycle, safely handling uninitialized state.
- Introduces zero breaking changes to public REST or GraphQL contracts (`npm run contracts:check`).

## Reference material read for it, by path

- `server/src/queue/work-queue.port.ts`: `QueueJobName`, `QueueJobPayload`, and `QueuePort` definitions.
- `server/src/queue/bullmq-queue.adapter.ts`: BullMQ and IORedis queue adapter implementation.
- `server/src/config/acres-config.service.ts`: queue configuration settings (`valkeyUrl`, `queueName`, `queuePrefix`, `queueDefaultAttempts`, `queueBackoffMs`).
- `server/src/scanner/clamav-scanner.adapter.spec.ts`: architectural reference for isolated adapter testing with Jest mocks.
- `docs/backend.md`: Phase 6 worker, scanner, outbox, and queue architecture records.
- `docs/build-plan.md`: Phase 6 outcomes and verification records §§16–22.

## Measurements and procedure

Verified by static typechecking, Jest execution, and AST inspection:

1. `server/src/queue/work-queue.port.ts`:
   - Define and export `QUEUE_JOB_NAMES`:
     ```ts
     export const QUEUE_JOB_NAMES = [
       "upload.completed",
       "export.requested",
       "ingestion.run",
     ] as const;

     export type QueueJobName = (typeof QUEUE_JOB_NAMES)[number];
     ```
2. `server/src/queue/bullmq-queue.adapter.spec.ts`:
   - Create unit test suite mocking `bullmq` and `ioredis`:
     ```ts
     jest.mock("bullmq");
     jest.mock("ioredis");
     ```
   - Test cases:
     - `enqueue`:
       - initializes `IORedis` with `valkeyUrl` and `{ maxRetriesPerRequest: null, enableReadyCheck: true }`.
       - initializes BullMQ `Queue` with configured name, connection, prefix, and defaultJobOptions (`attempts`, exponential backoff with `queueBackoffMs`, `removeOnComplete: { age: 86400 }`, `removeOnFail: { age: 604800 }`).
       - adds job to queue with `jobName`, `payload`, and `{ jobId: deterministicKey, delay: 0 }` when `delayMs` is omitted.
       - passes specified `delayMs` when provided.
       - reuses existing `Queue` and `IORedis` instances on repeated calls without re-instantiating.
     - `readiness`:
       - returns `true` when `queue.getJobCounts('waiting')` resolves.
       - returns `false` when `queue.getJobCounts('waiting')` throws/rejects.
     - `close`:
       - safely no-ops without error when queue/connection were never initialized.
       - awaits `queue.close()` and calls `connection.disconnect()` when initialized.
     - `onModuleDestroy`:
       - delegates to `close()`.

## Expected impact

- `server/src/queue/work-queue.port.ts`: `QUEUE_JOB_NAMES` exported runtime const tuple.
- `server/src/queue/bullmq-queue.adapter.spec.ts`: new unit test file with 100% method coverage on `BullmqQueueAdapter`.
- Zero runtime behavioral drift for existing callers in `upload-worker.service.ts` or `ingestion.service.ts`.
- Zero contract drift: `npm run contracts:check` continues to pass.

## Non-goals

- Modifying the underlying queue engine or swapping BullMQ / Valkey for another transport.
- Altering the retry policy, backoff, or job payload structures.
- Modifying database schemas or GraphQL/REST endpoints.

## SKILLS USED

- `nestjs-best-practices`: verify provider lifecycle hooks (`OnModuleDestroy`) and dependency injection patterns.
- `javascript-testing-patterns`: construct isolated unit tests using Jest mocks for external I/O packages (`bullmq`, `ioredis`), asserting call arguments, edge cases, and graceful degradation.
- `architecture-patterns`: adhere to Hexagonal Architecture port/adapter boundary principles.
- `error-handling-patterns`: verify exception containment and fallback handling in `readiness()` and shutdown cleanup in `close()`.
- `requesting-code-review`: dispatch reviewer subagent upon completing implementation and checks.
- `receiving-code-review`: evaluate code review feedback with technical rigor before final commit.
- `caveman-commit`: format commit message following Conventional Commits, imperative summary <= 50 characters, and no AI trailer.

## Verification plan

Run the checks and quote real output:

1. `npm run contracts:check` (verify zero public API or GraphQL drift)
2. `npm run build:shared` (build shared contracts)
3. `npm run typecheck` (typecheck shared, client, and server)
4. `npm run lint` (ESLint across workspaces)
5. `npm --workspace=@acres/server test -- server/src/queue/bullmq-queue.adapter.spec.ts` (verify new unit test suite passes)
6. `npm run test:server` (run full server test suite)
7. Inspect `git diff` to confirm zero unintended changes.
