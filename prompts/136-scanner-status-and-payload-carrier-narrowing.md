# 136 — narrow malware scanner status and unify queue job payload carrier

## Scope, and why it is next

The committed repository is on `main` at `1e0d61b`
(`refactor(jobs): narrow scheduled job name union`, the prompt 135 implementation).
The worktree is clean (verified this session via `git status --short`, empty output).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual type-narrowing and port
hardening through prompt 135.

There is no unbuilt ordered phase left in `docs/build-plan.md`. A comprehensive
inspection over internal service boundaries, worker execution flows, and asynchronous
ports reveals that:
1. In `server/src/scanner/scanner.port.ts`, `ScanErrorCode` is defined as a bare type
   union without a canonical runtime tuple (`SCAN_ERROR_CODES`), and `ScanResult.status`
   is defined as an inline union `'clean' | 'infected' | 'failed'` without a named
   `ScanStatus` type or a canonical runtime tuple (`SCAN_STATUSES`). This contrasts with
   the established patterns across the codebase (`OUTBOX_EVENT_TYPES`, `QUEUE_JOB_NAMES`,
   `SCHEDULED_JOB_NAMES`, `JOB_RUN_STATUSES`, `AUDIT_ACTIONS`, `REPORT_STATUSES`).
2. In `server/src/worker/upload-worker.service.ts`:
   - `RejectedScanCode` is hardcoded as `ScanErrorCode | 'infected' | 'failed'`,
     disconnecting the rejected dead letter reason codes from the scanner port's domain
     status definitions.
   - `UploadJobData` is declared as a duplicate local interface identical to
     `QueueJobPayload` from `server/src/queue/work-queue.port.ts`. BullMQ enqueues
     `QueueJobPayload` via `BullmqQueueAdapter.enqueue`, but `UploadWorkerService` consumes
     it via the redundant local interface, breaking end-to-end interface symmetry
     between queue producer and worker consumer.
3. `server/src/scanner/clamav-scanner.adapter.ts` currently lacks dedicated unit test
   coverage (`server/src/scanner/clamav-scanner.adapter.spec.ts` does not exist),
   relying solely on mock assertions inside `upload-worker.service.spec.ts`.

This prompt completes the asynchronous infrastructure port and worker hardening lineage
established in prompts 83 (`ScanErrorCode` union), 84 (outbox failure narrowing),
92 (`RejectedScanMessage` narrowing), 133 (`OutboxEventType` narrowing),
134 (`QueueJobName` narrowing), and 135 (`ScheduledJobName` narrowing).

Establishing canonical `SCAN_STATUSES` and `SCAN_ERROR_CODES` tuples, narrowing
`ScanResult.status` to `ScanStatus`, deriving `RejectedScanCode` as
`ScanErrorCode | ScanFailureStatus`, unifying the worker job payload with `QueueJobPayload`,
and adding unit test coverage for `ClamavScannerAdapter`:
- Closes the scanner status and error vocabulary into canonical, reusable types.
- Ensures dead letter reason codes directly compose domain failure statuses without
  duplicating string literals.
- Unifies the queue port producer payload and worker processor payload under one canonical
  interface.
- Introduces zero casts (`as ScanStatus`, `as QueueJobPayload`) at call sites.
- Preserves 100% compatibility with public REST and GraphQL contracts (`npm run contracts:check`).

## Reference material read for it, by path

- `server/src/scanner/scanner.port.ts`: `ScanErrorCode`, `ScanResult`, and `MalwareScannerPort` definitions.
- `server/src/scanner/clamav-scanner.adapter.ts`: ClamAV network socket stream parser and ping readiness adapter.
- `server/src/queue/work-queue.port.ts`: `QueueJobPayload` interface and `QueuePort` definition.
- `server/src/queue/bullmq-queue.adapter.ts`: BullMQ queue adapter enqueuing `QueueJobPayload`.
- `server/src/worker/upload-worker.service.ts`: `UploadJobData`, `RejectedScanCode`, and `UploadWorkerService.process`.
- `server/src/worker/upload-worker.service.spec.ts`: upload worker unit tests with scanner mocks.
- `docs/backend.md`: Phase 6 worker, scanner, outbox, and queue architecture records.
- `docs/build-plan.md`: Phase 6 outcomes and verification records §§16–22.

## Measurements and procedure

Verified by static typechecking, Jest execution, and AST inspection:
1. `server/src/scanner/scanner.port.ts`:
   - Define and export `SCAN_STATUSES`:
     ```ts
     export const SCAN_STATUSES = ['clean', 'infected', 'failed'] as const;
     export type ScanStatus = (typeof SCAN_STATUSES)[number];
     ```
   - Define and export `SCAN_ERROR_CODES`:
     ```ts
     export const SCAN_ERROR_CODES = [
       'object_missing',
       'scanner_unavailable',
       'scanner_timeout',
       'scanner_error',
     ] as const;
     export type ScanErrorCode = (typeof SCAN_ERROR_CODES)[number];
     ```
   - Define and export `ScanFailureStatus`:
     ```ts
     export type ScanFailureStatus = Exclude<ScanStatus, 'clean'>;
     ```
   - Update `ScanResult`:
     ```ts
     export interface ScanResult {
       readonly status: ScanStatus;
       readonly signature?: string;
       readonly errorCode?: ScanErrorCode;
     }
     ```
2. `server/src/worker/upload-worker.service.ts`:
   - Import `type { QueueJobPayload }` from `../queue/work-queue.port`.
   - Import `type { ScanErrorCode, ScanFailureStatus, ScanResult, MalwareScannerPort }` from `../scanner/scanner.port`.
   - Replace redundant `interface UploadJobData` with `type UploadJobData = QueueJobPayload;` (or reference `QueueJobPayload` directly for `this.worker` and `process(data: QueueJobPayload)`).
   - Recompose `RejectedScanCode`:
     ```ts
     type RejectedScanCode = ScanErrorCode | ScanFailureStatus;
     ```
   - In `upload-worker.service.ts:305–310`, `scan.status !== 'clean'` cleanly narrows `scan.status` to `ScanFailureStatus`, allowing `scan.errorCode ?? scan.status` to evaluate to `RejectedScanCode` with zero casts.
3. `server/src/scanner/clamav-scanner.adapter.spec.ts`:
   - Add unit test suite covering `ClamavScannerAdapter`:
     - `scanBuffer`:
       - Emitting `'stream: OK\0'` resolves `{ status: 'clean' }`.
       - Emitting `'stream: Win.Test.EICAR_HDB-1 FOUND\0'` resolves `{ status: 'infected', signature: 'Win.Test.EICAR_HDB-1' }`.
       - Emitting unparseable response resolves `{ status: 'failed', errorCode: 'scanner_error' }`.
       - Socket `'error'` event resolves `{ status: 'failed', errorCode: 'scanner_unavailable' }`.
       - Socket timeout event triggers `socket.destroy()` and resolves `{ status: 'failed', errorCode: 'scanner_timeout' }`.
       - Protocol framing verification: checks `zINSTREAM\0`, big-endian chunk size, buffer payload, and terminating 4-byte zero length chunk.
     - `readiness`:
       - Emitting `'PONG'` resolves `true`.
       - Emitting non-PONG response resolves `false`.
       - Socket error or timeout resolves `false`.
4. Ensure zero casts (`as ScanStatus`, `as QueueJobPayload`) are introduced.

## Expected impact

- `server/src/scanner/scanner.port.ts`:
  - `SCAN_STATUSES`, `ScanStatus`, `SCAN_ERROR_CODES`, `ScanErrorCode`, and `ScanFailureStatus` defined and exported.
  - `ScanResult.status` typed strictly as `ScanStatus`.
- `server/src/worker/upload-worker.service.ts`:
  - Redundant `UploadJobData` eliminated in favor of canonical `QueueJobPayload`.
  - `RejectedScanCode` composed cleanly from `ScanErrorCode | ScanFailureStatus`.
- `server/src/scanner/clamav-scanner.adapter.spec.ts`:
  - New comprehensive unit test suite with 100% coverage on `ClamavScannerAdapter`.
- `docs/backend.md`:
  - Update Phase 6 worker and scanner documentation record with the prompt 136 narrowing and test suite.
- No public REST or GraphQL API changes (`npm run contracts:check` passes cleanly).

## Non-goals

- No change to ClamAV network wire protocol (`zINSTREAM\0`, `zPING\0`).
- No change to `REJECTED_SCAN_MESSAGE` or `WORKER_EXCEPTION_MESSAGE` literals (settled in prompts 92 and 72).
- No change to Prisma database schema or migrations.
- No change to public REST `/api/v1/uploads` contracts.
- No change to client-side components.

## Checks to run

```bash
# 1. Scanner and worker unit test suites
npm run test --workspace=@acres/server -- src/scanner src/worker

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
- Any unit test in `src/scanner` or `src/worker` fails.
- Any caller or mock violates `ScanStatus`, `ScanErrorCode`, or `QueueJobPayload`.
- `npm run contracts:check` detects contract drift.
- A runtime error, cast, or type assertion is required to satisfy typechecking.

## Completion criteria

- `SCAN_STATUSES`, `ScanStatus`, `SCAN_ERROR_CODES`, `ScanErrorCode`, and `ScanFailureStatus` exported from `scanner.port.ts`.
- `ScanResult.status` typed as `ScanStatus`.
- `RejectedScanCode` composed from `ScanErrorCode | ScanFailureStatus`.
- `QueueJobPayload` used directly in `UploadWorkerService`.
- `server/src/scanner/clamav-scanner.adapter.spec.ts` passes with full test coverage.
- All server test suites (`src/scanner`, `src/worker`) pass cleanly.
- Workspace-wide lint, typecheck, and build succeed with exit code 0.
- `docs/backend.md` updated with the prompt 136 record.
- Changes committed locally to `main` using `caveman-commit`.

## SKILLS USED

- `architecture-patterns` — enforce hexagonal architecture and port/adapter boundaries;
  ensure scanner domain statuses and queue payloads are governed by canonical port definitions
  and cleanly consumed across adapters and worker services.
- `nestjs-best-practices` — ensure dependency injection, provider tokens, and adapter lifecycle
  hooks follow established NestJS architecture patterns.
- `error-handling-patterns` — preserve fail-closed error classification and bounded reason
  codes across scanner error modes and dead-letter generation.
- `javascript-testing-patterns` — implement unit test suites using Jest with mocked network
  sockets and event emitters for `ClamavScannerAdapter`.
- `requesting-code-review` — dispatch reviewer subagent with structured context and verify
  diff against requirements before commit.
- `receiving-code-review` — evaluate reviewer findings with technical rigor and verify
  code before acting.
- `caveman-commit` — format the final commit message following Conventional Commits guidelines.

Not loaded, with reason: `playwright` (no UI or browser flow touched); frontend/
Tailwind/shadcn/GSAP skills (pure server-side and shared contract type narrowing).
