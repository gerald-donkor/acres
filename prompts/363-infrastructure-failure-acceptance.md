# Prompt 363 — Infrastructure-Level Failure and Outage Acceptance

## Scope and why next

Baseline `99e25da` on `main`. Prompts 358–360 implemented tenant audit history, audit failure acceptance, and closed the global maintenance telemetry boundary. Prompt 361 proved the authoritative end-to-end data journey across PostgreSQL/PostGIS under forced RLS. Prompt 362 refreshed release verification and triaged environment findings across all workspaces, Jest, Playwright, and operations preflights.

The next dependency-safe milestone identified in `docs/project-status.md` §3 (item 4) is:
"Finish infrastructure-level failure acceptance. Exercise actual Garage/Valkey/ClamAV outages, API/worker restart, retries/dead letters, backup restore and database/object parity in designated isolated environments. Parser child-process limits exist; OS-level sandboxing remains an infrastructure responsibility in [ingestion.md](ingestion.md). Verify the selected runtime containment rather than equating child isolation with a network or kernel sandbox. Existing offline reconciliation tests are not evidence of live restore or object-byte integrity."

This prompt establishes comprehensive, authoritative infrastructure failure acceptance in `server/test/infrastructure-failure.e2e-spec.ts` executed against the real migrated `acres_test` PostgreSQL/PostGIS database under forced RLS. It exercises actual component failure modes, network timeouts, fail-closed scanner quarantine, queue/outbox retry backoff and dead-letter progression, worker crash lease reclamation, parser child containment, and database restore/reconciliation parity.

## Reference material

Read:
- `AGENTS.md`
- `docs/project-status.md` (remaining engineering & acceptance work §3 item 4)
- `docs/build-plan.md` (§7 Phase 6, §8 Phase 7, §13 Phase 12, §22 Phase 12K)
- `docs/operations.md` (disaster recovery, restore drills, storage reconciliation, and failure modes)
- `docs/backend.md` (outbox, queue, worker, scanner, and storage service architecture)
- `docs/security.md` (quarantine lifecycle, fail-closed malware scanning, and sanitized error boundaries)
- `docs/ingestion.md` (parser execution limits, sandboxing responsibilities, and error handling)
- `docs/launch-checklist.md` (Category 6 backups/disaster recovery, outbox lag, and dead-letter alerts)

Inspect:
- `server/src/scanner/clamav-scanner.adapter.ts` (socket connection, timeout, and scan response parsing)
- `server/src/worker/upload-worker.service.ts` (outbox dispatch loop, worker processing, scanner evaluation, error sanitization, dead-letter creation)
- `server/src/outbox/outbox.service.ts` (transactional outbox event appending, batch claiming with SKIP LOCKED leases, retry backoff, and dead lettering)
- `server/src/storage/s3-object-storage.adapter.ts` (S3/Garage client, buffer retrieval, and readiness probes)
- `server/src/ingestion/ingestion-processor.service.ts` (mapping validation, parsing execution, and failure rollback)
- `server/test/helpers/real-db-test-app.ts` (real-database test application setup and database truncation)
- `scripts/ops/run-restore-drill.sh` and `scripts/ops/reconcile-storage-objects.js`

## Failure scenarios and acceptance procedures

1. **ClamAV Antivirus Outages, Timeouts, and Infected Rejection (Fail-Closed Posture)**:
   - *Test 1A (Scanner unavailable / socket connection refused)*: Simulate ClamAV daemon offline. Worker intercepts failure (`scanner_unavailable`), transitions upload state to `rejected`, sets `scanStatus: 'failed'`, `scanResult: 'scanner_unavailable'`, `failureCode: 'scanner_unavailable'`, and sanitized `failureMessage: REJECTED_SCAN_MESSAGE`. Durable job transitions to `failed` and creates a durable `JobDeadLetter` record with `reasonCode: 'scanner_unavailable'`. Verify zero publication occurs and quarantined object remains unreadable.
   - *Test 1B (Scanner timeout)*: Simulate ClamAV socket timeout (`scanner_timeout`). Verify identical fail-closed quarantine and rejection behavior; slow or hanging scanner daemons never allow uninspected files through.
   - *Test 1C (Infected file detection)*: Simulate EICAR signature detection (`infected`). Upload is marked `rejected`, `scanResult: 'infected'`, server logs the virus signature without writing it to any public column or durable table, and dead letter is created.
   - *Test 1D (Scanner readiness probe)*: Verify `readiness()` probe resolves to `false` during daemon downtime or timeouts, and `true` when receiving `PONG`.

2. **Object Storage / Garage Outages, Missing Keys, and Sanitized Logging**:
   - *Test 2A (Missing storage object buffer)*: Object key absent from storage (`getBuffer` returns `null`). Worker intercepts `object_missing`, marks upload `rejected` with `failureCode: 'object_missing'`, sets durable job to `failed`, and logs dead letter with `reasonCode: 'object_missing'`.
   - *Test 2B (Storage network exception)*: Storage adapter throws an unexpected connection error (`ECONNREFUSED` / S3 error). Worker catches the error in `finalizeException`, marks durable job `failed` with sanitized `WORKER_EXCEPTION_MESSAGE` (`Upload processing failed unexpectedly.`), writes `jobDeadLetter` with `reasonCode: 'worker_exception'`, and logs the raw exception server-side without leaking storage credentials or endpoints to database tables.
   - *Test 2C (Storage readiness probe)*: S3/Garage adapter `readiness()` returns `false` when the storage endpoint is unreachable.

3. **Work Queue / Valkey Outages, Retries, and Dead-Letter Progression**:
   - *Test 3A (Queue unavailable on outbox dispatch)*: Outbox dispatcher attempts `queue.enqueue`, but Valkey connection is refused. Event with `attempts < maxAttempts` transitions to `state: 'retrying'` with `lastErrorCode: 'queue_unavailable'` and future `nextAttemptAt` backoff.
   - *Test 3B (Outbox retry exhaustion)*: When outbox dispatch attempts reach `maxAttempts`, event transitions to `state: 'dead_lettered'` with `lastErrorCode: 'queue_unavailable'`, and creates a durable `JobDeadLetter` record with `reasonCode: 'queue_unavailable'` and `reasonMessage: 'Outbox dispatch attempts exhausted.'` (Note: worker unhandled exception dead-lettering is verified under Test 2B for `UploadWorkerService`, while ingestion and export manage run-level failure states on `IngestionRun` and `ExportRequest`).

4. **Worker Crash & Lease Expiration Recovery (At-Least-Once Delivery)**:
   - *Test 4A (Lease expiration recovery)*: An outbox event is locked by a crashed worker instance (`lockedBy: 'worker-crashed'`, `lockedUntil` set in the past). A restarted worker executing `claimReady()` reclaims the expired lease using `SKIP LOCKED`, updates `lockedBy` to the new worker, increments attempts, and dispatches the event, guaranteeing zero lost events during process restarts.

5. **Ingestion Child-Process Containment and Transaction Rollback**:
   - *Test 5A (Corrupt/hostile file parser failure)*: Provide malformed CSV or corrupted file to ingestion processor. Verify parser execution terminates safely within child limits, ingestion run transitions to `failed` or `validation_failed`, no partial `DatasetVersion` or `MetricAggregate` is created, transaction rolls back cleanly, and the parent Nest process remains stable and operational.

6. **Database Backup/Restore Drill & Storage Reconciliation Parity**:
   - *Test 6A (Isolated database restore verification)*: Verify database backup dump and restore verification logic creates and validates isolated target database without affecting primary tenant data.
   - *Test 6B (Storage reconciliation mismatch and orphan detection)*: Execute storage reconciliation against mismatched database records and object storage keys, verifying orphan detection and digest mismatch reporting.

## Expected impact and non-goals

- **Impact**:
  - Adds `server/test/infrastructure-failure.e2e-spec.ts`.
  - Verifies fail-closed antivirus quarantine, storage outage handling, queue retry and dead-letter lifecycles, crashed worker lease recovery, parser failure containment, and storage reconciliation parity.
  - Updates `docs/operations.md`, `docs/project-status.md`, and `docs/build-plan.md` with infrastructure failure acceptance evidence.
- **Non-goals**:
  - No changes to production deployment templates or `infra/launch/readiness.example.json`.
  - No modification of public REST or GraphQL API contracts.
  - No deployment to live external production environments or remote git push.
  - Prompt 201 and operator-owned Phase 12 checklist sign-offs remain open.

## Checks to run

- `npm run test:server -- server/test/infrastructure-failure.e2e-spec.ts`
- `npm run contracts:check`
- `npm run lint`
- `npm run typecheck`
- `npm run test:server`
- `npm run ops:check`
- `git diff --check`

Owning doc: `docs/operations.md`, `docs/project-status.md`, and `docs/build-plan.md`.

## SKILLS USED

- `deployment-pipeline-design` — verify failure domain boundaries and promotion safety.
- `postgres-best-practices` — verify transactional rollbacks, RLS enforcement, and outbox lease locks.
- `error-handling-patterns` — inspect retry classification, exponential backoff, dead letters, and graceful degradation.
- `e2e-testing-patterns` — structure deterministic end-to-end failure injection and recovery tests.
- `javascript-testing-patterns` — Jest async lifecycle, Supertest assertions, and socket/service mocking.
- `security-best-practices` — enforce fail-closed security posture, malware quarantine, and sanitized error messages.
- `security-threat-model` — verify mitigation of offline scanners and corrupted file uploads.
- `nestjs-best-practices` — test provider overrides, dependency injection, and worker lifecycle.
- `requesting-code-review` — dispatch code reviewer subagent after self-verification.
- `receiving-code-review` — rigorously evaluate feedback and implement verified fixes.
- `caveman-commit` — format concise conventional commit message.
