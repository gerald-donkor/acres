# 142 — export canonical upload and stored object states tuples and add UploadsService unit tests

## Scope, and why it is next

The committed repository is on `main` at `4b3a35d`
(`refactor(parsers): export tuples and add tests`, the prompt 141 implementation).
The worktree is clean (verified this session via `git status --short`, empty output).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), followed by dependency-safe external I/O adapter hardening,
canonical tuple exports, and isolated unit testing across scanner, queue, storage, mail,
AI, and parser subsystems (prompts 136–141).

Prompts 136 through 141 established consistent, robust architecture patterns across
external I/O ports and adapters:
- Prompt 136 (`9a0c46d`): ClamAV scanner port canonical const tuples (`SCAN_STATUSES`,
  `SCAN_ERROR_CODES`) and unit tests (`server/src/scanner/clamav-scanner.adapter.spec.ts`).
- Prompt 137 (`85a8534`): BullMQ queue port canonical const tuple (`QUEUE_JOB_NAMES`) and
  unit tests (`server/src/queue/bullmq-queue.adapter.spec.ts`).
- Prompt 138 (`6e25880`): S3 object storage port canonical const tuple
  (`STORAGE_PRESIGNED_METHODS`), helper functions, and unit tests
  (`server/src/storage/s3-object-storage.adapter.spec.ts`).
- Prompt 139 (`6510abd`): Mail delivery port canonical const tuple (`MAIL_TRANSPORTS`),
  transporter injection via `SMTP_TRANSPORTER`, and unit tests
  (`server/src/mail/adapters/smtp-mail.adapter.spec.ts`, `server/src/mail/adapters/memory-mail.adapter.spec.ts`).
- Prompt 140 (`16049f5`): AI draft provider port canonical const tuple (`AI_DRAFT_PROVIDERS`),
  client injection via `GEMINI_CLIENT`, and unit tests
  (`server/src/ai/adapters/fake-draft.adapter.spec.ts`, `server/src/ai/adapters/gemini-draft.adapter.spec.ts`).
- Prompt 141 (`4b3a35d`): Ingestion parser subsystem canonical const tuples
  (`SOURCE_KINDS`, `PARSER_EXECUTION_STATUSES`), metrics status narrowing, and unit tests
  (`server/src/ingestion/parsers/in-process-parser.executor.spec.ts`, `server/src/ingestion/parsers/source-parser.service.spec.ts`).

An inspection of the upload subsystem (`packages/shared/src/uploads.ts` and
`server/src/uploads/`, Phase 6) reveals the following residual gaps in port boundaries and unit test coverage:

1. In `packages/shared/src/uploads.ts`, `UploadState` is defined as a bare type union:
   ```ts
   export type UploadState =
     | 'pending_upload'
     | 'completed'
     | 'scanning'
     | 'accepted'
     | 'rejected'
     | 'cancelled'
     | 'expired';
   ```
   without exporting a canonical runtime const tuple `UPLOAD_STATES = ['pending_upload', 'completed', 'scanning', 'accepted', 'rejected', 'cancelled', 'expired'] as const`.
   Furthermore, `StoredObjectState` from Prisma schema (`pending_upload`, `quarantined`, `accepted`, `rejected`, `deleted`) is defined ad-hoc across scripts without an exported canonical runtime const tuple `STORED_OBJECT_STATES` or shared type `StoredObjectState`.
2. In `server/src/uploads/uploads.service.ts`, `toStatus()` duplicates the seven-member union inline:
   ```ts
   state:
     | 'pending_upload'
     | 'completed'
     | 'scanning'
     | 'accepted'
     | 'rejected'
     | 'cancelled'
     | 'expired';
   ```
   instead of importing and using `UploadState`.
3. In `server/src/uploads/uploads.controller.ts`, `terminal()` references `state: UploadStatus['state']`
   instead of directly using `state: UploadState`.
4. In `server/src/uploads/uploads.service.ts`, `UploadsService` orchestrates the complete upload lifecycle:
   presigned upload URL generation, media-type and byte count validation, quarantine object key generation,
   upload completion verification (storage stat and buffer checksum validation), state progression,
   progress event creation, outbox event generation, cancellation transitions, and presigned download URL generation.
   Despite being a core domain service with intricate failure and security checks, `UploadsService`
   currently lacks dedicated unit test coverage (`server/src/uploads/uploads.service.spec.ts` does not exist).

This prompt resolves these gaps, completing the state tuple hardening and domain service unit
testing lineage for the upload subsystem.

Exporting `UPLOAD_STATES` and `STORED_OBJECT_STATES`, tightening `toStatus()` and `terminal()`,
and adding a dedicated unit test suite for `UploadsService`:

- Exposes canonical runtime arrays `UPLOAD_STATES = ['pending_upload', 'completed', 'scanning', 'accepted', 'rejected', 'cancelled', 'expired'] as const`
  and `STORED_OBJECT_STATES = ['pending_upload', 'quarantined', 'accepted', 'rejected', 'deleted'] as const`
  alongside derived types `UploadState` and `StoredObjectState` in `packages/shared/src/uploads.ts` (re-exported via `packages/shared/src/index.ts`).
- Imports `UploadState` into `server/src/uploads/uploads.service.ts`, re-exports it alongside `UploadStatus`,
  and replaces the inline state union in `toStatus()` with `UploadState`.
- Updates `terminal()` in `server/src/uploads/uploads.controller.ts` to type its argument as `UploadState`.
- Adopts `StoredObjectState` in `scripts/ops/reconcile-storage-objects.ts`.
- Adds `server/src/uploads/uploads.service.spec.ts` covering:
  - `initiate`:
    - Rejection with `ApiException.validationFailed(['mediaType is not accepted.'])` for unaccepted media types.
    - Rejection with `ApiException.validationFailed(['byteCount exceeds the temporary development limit.'])` for byte counts exceeding `uploadMaxBytes`.
    - Presigning PUT URL via `storage.presignPut` with quarantined object key format `organizations/${organizationId}/quarantine/${randomUUID()}`.
    - Tenant-scoped execution with idempotency operation `uploads.initiate`.
    - Correct database creation calls on `storedObject` and `upload` records.
    - Returning the full `InitiateUploadResult` payload with URLs, headers, and completion endpoint.
  - `complete`:
    - Rejection of byte count exceeding limits.
    - Rejection of missing or invalid idempotency key with `ApiException.idempotencyKeyRequired()`.
    - Throwing `ApiException.notFound('Upload not found.')` when upload is not found in tenant scope.
    - Throwing `ApiException.conflict('Uploaded object was not found.')` when `storage.stat` returns null.
    - Throwing `ApiException.validationFailed(['byteCount does not match object storage.'])` when `stat.byteCount` does not match `body.byteCount`.
    - Throwing `ApiException.validationFailed(['mediaType does not match object storage.'])` when `stat.mediaType` does not match declared media type.
    - Throwing `ApiException.conflict('Uploaded object was not found.')` when `storage.getBuffer` returns null.
    - Throwing `ApiException.validationFailed(['checksumHex does not match object storage.'])` when SHA-256 digest of storage buffer does not match `body.checksumHex`.
    - Throwing `ApiException.conflict('Upload is not awaiting completion.')` when upload state is not `'pending_upload'`.
    - Successful completion: updates upload (`state: 'completed'`, `scanStatus: 'pending'`, `progressStage: 'queued_scan'`, `progressPercent: 20`, increment version), updates storedObject (`state: 'quarantined'`), creates `jobProgressEvent`, appends outbox event via `outbox.appendUploadCompleted`, and returns `UploadStatus`.
  - `get`:
    - Throwing `ApiException.notFound('Upload not found.')` when upload is not found.
    - Returning formatted `UploadStatus` with progress, failure, and acceptedAt.
  - `cancel`:
    - Throwing `ApiException.notFound('Upload not found.')` when upload is not found.
    - Returning existing status idempotently when upload is already `'cancelled'`.
    - Throwing `ApiException.conflict('Upload can no longer be cancelled.')` when upload is `'accepted'` or `'rejected'`.
    - Successfully transitioning upload to `'cancelled'`, updating `progressStage: 'cancelled'` and `progressPercent: 100`, and returning `UploadStatus`.
  - `download`:
    - Throwing `ApiException.notFound('Accepted object not found.')` when upload is not found or its state is not `'accepted'`.
    - Calling `storage.presignGet` with stored object key, declared filename, and declared media type.
    - Returning presigned download descriptor.
- Introduces zero breaking changes to public REST or GraphQL contracts (`npm run contracts:check`).

## Reference material read for it, by path

- `packages/shared/src/uploads.ts`: `UploadState`, `UploadStatus`, `InitiateUploadInput`, `InitiateUploadResult`, `CompleteUploadInput`, `UploadDownload`.
- `packages/shared/src/index.ts`: root export barrel for `@acres/shared`.
- `server/src/uploads/uploads.service.ts`: `UploadsService` implementation, validation rules, idempotency wrapping, database queries, and `toStatus()` conversion.
- `server/src/uploads/uploads.controller.ts`: `UploadsController` routes, SSE streaming, and `terminal()` helper.
- `server/src/worker/upload-worker.service.spec.ts`: test pattern reference for mocking `TenantTransactionService`, `OutboxService`, and `ObjectStoragePort`.
- `scripts/ops/reconcile-storage-objects.ts`: storage reconciliation script consuming stored object state.
- `docs/backend.md`: server module map and upload architecture documentation.

## Measurements and procedure

1. `packages/shared/src/uploads.ts`:
   - Define and export `UPLOAD_STATES`:
     ```ts
     export const UPLOAD_STATES = [
       'pending_upload',
       'completed',
       'scanning',
       'accepted',
       'rejected',
       'cancelled',
       'expired',
     ] as const;

     export type UploadState = (typeof UPLOAD_STATES)[number];
     ```
   - Define and export `STORED_OBJECT_STATES`:
     ```ts
     export const STORED_OBJECT_STATES = [
       'pending_upload',
       'quarantined',
       'accepted',
       'rejected',
       'deleted',
     ] as const;

     export type StoredObjectState = (typeof STORED_OBJECT_STATES)[number];
     ```
2. `server/src/uploads/uploads.service.ts`:
   - Update import:
     ```ts
     import type { UploadState, UploadStatus } from '@acres/shared';
     ```
   - Re-export:
     ```ts
     export type { UploadState, UploadStatus };
     ```
   - Update `toStatus` parameter type to use `state: UploadState`.
3. `server/src/uploads/uploads.controller.ts`:
   - Update import from `./uploads.service` to include `type UploadState`.
   - Update `terminal(state: UploadState): boolean`.
4. `scripts/ops/reconcile-storage-objects.ts`:
   - Import `type { StoredObjectState } from '@acres/shared'`.
   - Use `state: StoredObjectState` in `StorageObjectRecord`.
5. `server/src/uploads/uploads.service.spec.ts`:
   - Create isolated unit test suite covering `initiate`, `complete`, `get`, `cancel`, and `download` methods with complete validation and error branch testing.
6. Documentation:
   - Record the changes and verification evidence in `docs/backend.md`.

## Expected impact

- `packages/shared/src/uploads.ts`: exports `UPLOAD_STATES` and `STORED_OBJECT_STATES` tuples alongside `UploadState` and `StoredObjectState`.
- `server/src/uploads/uploads.service.ts`: uses canonical `UploadState` in `toStatus` and re-exports it.
- `server/src/uploads/uploads.controller.ts`: types `terminal` parameter with `UploadState`.
- `scripts/ops/reconcile-storage-objects.ts`: uses shared `StoredObjectState`.
- `server/src/uploads/uploads.service.spec.ts`: provides isolated unit test coverage for `UploadsService`.
- `docs/backend.md`: documents upload state tuples and test coverage.

## Non-goals

- Modifying the underlying database schema or generating new Prisma migrations (enums already match in `schema.prisma`).
- Altering the REST endpoint contracts, response payload shapes, or status codes.
- Changing `UploadWorkerService` background worker processing logic.
- Adding client UI changes.

## Checks to run

```bash
npm run contracts:check
npm run build:shared
npm run test:server -- uploads.service.spec.ts
npm run test:server
npm run typecheck
npm run lint
npm run build
```

Documentation updates will be recorded in `docs/backend.md`.

## SKILLS USED

- `api-design-principles`: HTTP upload initiate, complete, and download endpoint semantics, idempotency, and REST conventions.
- `nestjs-best-practices`: NestJS service design, dependency injection tokens, exception handling with `ApiException`, and isolated unit testing with mocks.
- `error-handling-patterns`: fail-closed validation, checksum mismatch detection, conflict error categorization, and idempotent retry semantics.
- `javascript-testing-patterns`: isolated Jest unit testing, mocking `TenantTransactionService`, `IdempotencyService`, `OutboxService`, `AcresConfigService`, and `ObjectStoragePort`.
- `requesting-code-review`: preparing structured review context for reviewer subagent dispatch.
- `receiving-code-review`: rigorous evaluation of code review feedback.
- `caveman-commit`: conventional commit message formatting.
