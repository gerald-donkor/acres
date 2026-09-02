# 50 - Phase 6 Outbox, Worker, and Storage Reconciliation Evidence

## Scope and why this is next

The committed `main` tip is `636be2a` (`test(geo): enforce database evidence`).
All twelve target phases have committed foundations in git. Following Phase 7C's
database evidence gate, the earliest unresolved exit gate and residual risk in the
target architecture is Phase 6: Storage, queues, worker, and secure uploads.

As documented in `docs/security.md` §11 and `docs/build-plan.md` §7:
- "Dead-letter and reconciliation tables exist, but exhaustive poison,
  crash-after-commit, stale-upload cleanup, and orphan-reconcile automation is
  not yet complete enough to count as launch evidence."
- Phase 6 Exit Gate: "durable restart and duplicate-delivery proof, secure
  quarantine threat tests, visible dead letters, and outbox/object
  reconciliation."

While `OutboxService`, `UploadWorkerService`, `RetentionMaintenanceJob`, and
`UploadsService` are implemented in production code, dedicated unit and integration
test suites covering the following fail-closed cases are required:

1. **Outbox Claim and Lease Concurrency**:
   - `claimReady()` correctly claims pending and retrying events ordered by `createdAt`
     up to `outboxClaimBatchSize`.
   - `lockedUntil` lease expiration allows subsequent worker passes to re-claim stalled
     events without deadlock.
   - `markRetry()` schedules `nextAttemptAt` and records error codes.
   - `markDeadLetter()` transitions events to `dead_lettered` and creates immutable
     `JobDeadLetter` audit records with `reasonCode`, `reasonMessage`, and payload.

2. **Upload Worker Execution and Idempotency**:
   - Deterministic job keys (`upload.completed:<uploadId>`, `export.requested:<exportId>`)
     prevent concurrent duplicate runs and guarantee idempotent job transitions.
   - Malware detection (`infected`) or storage read errors (`object_missing`) fail closed,
     transitioning `Upload` to `rejected` with appropriate `failureCode` and `StoredObject`
     state updates.
   - Clean scans transition `Upload` and `StoredObject` to `accepted` with 100% progress.
   - Cancelled uploads during processing terminate safely without partial acceptance.

3. **Retention and Storage Object Reconciliation**:
   - `RetentionMaintenanceJob` purges expired uploads (`pending_upload` past `expiresAt`)
     and marks corresponding `StoredObject` records as `deleted`.
   - Purges expired `IdempotencyRecord`, `AccountToken`, and `Invitation` rows.
   - All executions are logged to `JobRun` with duration and completion state.

4. **Documentation and Evidence Reconciliation**:
   - Update `docs/security.md`, `docs/backend.md`, and `docs/build-plan.md` to record the
     completed Phase 6 outbox/worker/reconciliation evidence and close the residual gap.

## Reference material read while preparing this prompt

- `AGENTS.md`, especially §§2, 2.1, 4–7, 8.2 Phase 6, 9, and 10.
- `docs/build-plan.md` §7 (Phase 6 outcome, test matrix, and exit gate).
- `docs/security.md` §11 (Storage and upload threat boundary, TM-06, TM-16, residual risks).
- `docs/backend.md` §3 (Outbox, uploads, worker, and maintenance job services).
- `server/src/outbox/outbox.service.ts` and `outbox.module.ts`.
- `server/src/worker/upload-worker.service.ts` and `worker.module.ts`.
- `server/src/uploads/uploads.service.ts` and `uploads.controller.ts`.
- `server/src/jobs/retention-maintenance.job.ts` and `job-runs.service.ts`.
- `server/src/scanner/scanner.port.ts` and `server/src/storage/storage.port.ts`.
- `server/src/queue/work-queue.port.ts`.

There is no visual surface, reference comp, breakpoint, browser, Next.js, React,
Tailwind, shadcn, or motion work in scope. No design measurement applies.

## SKILLS USED

- `architecture-patterns` - maintain strict boundaries between domain services, ports,
  worker services, and persistence layers.
- `nestjs-best-practices` - construct robust test modules with proper dependency
  injection and mock boundaries for ports (`OBJECT_STORAGE`, `MALWARE_SCANNER`, `WORK_QUEUE`).
- `postgres-best-practices` - verify transactional guarantees, RLS isolation, `FOR UPDATE SKIP LOCKED`
  mechanics, and audit trail generation.
- `security-best-practices` - verify fail-closed error handling, malware quarantine,
  poison-pill dead lettering, and secure data retention.
- `security-threat-model` - reconcile Phase 6 threat mitigation evidence against TM-06
  and TM-16 in `docs/security.md`.
- `error-handling-patterns` - ensure deterministic retry codes, structured error logs,
  and graceful task completion.
- `javascript-testing-patterns` - author clear, comprehensive unit and integration
  specifications with Jest.
- `e2e-testing-patterns` - verify end-to-end queue/outbox/worker workflows in test harness.
- `secrets-management` - ensure zero credentials or sensitive tokens in test fixtures.
- `requesting-code-review` - dispatch reviewer subagent with structured context and diff SHAs.
- `receiving-code-review` - evaluate review feedback with technical rigor.
- `caveman-commit` - format Conventional Commit message.

## Expected Impact

### Server Tests Added / Updated:
- `server/src/outbox/outbox.service.spec.ts` - unit test suite for outbox event creation,
  claiming, retry backoff, lease management, and dead lettering.
- `server/src/worker/upload-worker.service.spec.ts` - unit test suite for worker job
  dispatch, processing, scanning fail-closed handling, clean acceptance, and progress tracking.
- `server/src/jobs/retention-maintenance.job.spec.ts` - comprehensive test coverage for
  upload expiration, idempotency purge, token purge, and audit logging.

### Server Implementation Enhancements (if any needed):
- Refine error codes or lease recovery in `OutboxService` / `UploadWorkerService` if gaps
  are surfaced during testing.

### Documentation Updated:
- `docs/security.md` - reconcile Phase 6 residual risks and record evidence.
- `docs/backend.md` - record Phase 6 test coverage and verification state.
- `docs/build-plan.md` - record Phase 6 exit evidence.

## Non-goals

- Adding live cloud AWS S3 / external ClamAV daemon dependencies (testing remains against
  ports, in-memory adapters, and isolated test database).
- Modifying client UI or GraphQL schemas.
- Modifying Phase 7 geography or Phase 8 analytics contracts.
- Introducing new external packages.

## Verification and Checks to Run

1. `npm run lint` - lint client, shared, and server workspaces.
2. `npm run typecheck` - typecheck shared, client, and server workspaces.
3. `npm run build` - build shared, client, and server workspaces.
4. `npm run contracts:check` - verify contract stability.
5. `npm run ops:check` - verify operational templates and secret scans.
6. `npm run test --workspace=@acres/server -- --runInBand` - run all server unit & integration tests.
7. `npm run test:server -- --runInBand` - run server E2E test suite.
8. `npm run geography:plans` - verify spatial & hierarchy query plans.
9. `npm run analytics:plans` - verify analytics query plans.
10. `git diff --check` and `git status --short`.
