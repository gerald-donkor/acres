# 138 — export canonical storage presigned methods tuple, export adapter helpers, and add S3ObjectStorageAdapter unit tests

## Scope, and why it is next

The committed repository is on `main` at `85a8534`
(`refactor(queue): export job names and add tests`, the prompt 137 implementation).
The worktree is clean (verified this session via `git status --short`, empty output).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual type-narrowing and port/adapter
hardening through prompt 137.

There is no unbuilt ordered phase left in `docs/build-plan.md`. A comprehensive inspection
over internal storage and asynchronous infrastructure ports and adapters reveals that:

1. Prompts 136 and 137 hardened the first two external I/O ports and adapters of Phase 6:
   - In Prompt 136 (`9a0c46d`), the ClamAV scanner port was hardened with canonical const
     tuples (`SCAN_STATUSES`, `SCAN_ERROR_CODES`) and `ClamavScannerAdapter` received
     dedicated unit tests (`server/src/scanner/clamav-scanner.adapter.spec.ts`).
   - In Prompt 137 (`85a8534`), the BullMQ queue port was hardened with canonical const
     tuple (`QUEUE_JOB_NAMES`) and `BullmqQueueAdapter` received dedicated unit tests
     (`server/src/queue/bullmq-queue.adapter.spec.ts`).
2. `S3ObjectStorageAdapter` in `server/src/storage/s3-object-storage.adapter.ts` is the third
   and final external I/O adapter of Phase 6 (Storage + Queues + Secure Uploads).
   It interfaces with AWS S3 / Garage S3 via `@aws-sdk/client-s3` and
   `@aws-sdk/s3-request-presigner`. However, it currently lacks dedicated unit test coverage
   (`server/src/storage/s3-object-storage.adapter.spec.ts` does not exist). It is tested
   only transitively through integration drills or mocked out with a test double in
   `server/test/helpers/test-app.ts`.
3. In `server/src/storage/storage.port.ts`, `PresignedPut` and `PresignedGet` specify
   `readonly method: 'PUT'` and `readonly method: 'GET'`, but the port does not export a
   canonical runtime const tuple `STORAGE_PRESIGNED_METHODS`. This contrasts with established
   patterns across domain ports (`QUEUE_JOB_NAMES`, `SCHEDULED_JOB_NAMES`, `SCAN_STATUSES`,
   `SCAN_ERROR_CODES`, `JOB_RUN_STATUSES`, `AUDIT_ACTIONS`).
4. In `server/src/storage/s3-object-storage.adapter.ts`, critical security and protocol
   helpers (`safeFilename` preventing header injection/CRLF, `sha256HexToBase64` converting
   checksum formats, and `isNotFound` extracting HTTP 404 status from SDK errors) are module-private
   functions lacking exported visibility for targeted unit verification.

This prompt completes the Phase 6 external infrastructure port and adapter hardening trilogy
across Scanner (prompt 136), Queue (prompt 137), and Storage (prompt 138).

Exporting the canonical `STORAGE_PRESIGNED_METHODS` tuple, exporting the helper functions,
and adding a comprehensive unit test suite for `S3ObjectStorageAdapter`:

- Exposes a canonical runtime array `STORAGE_PRESIGNED_METHODS = ['PUT', 'GET'] as const`
  for reflection, runtime assertions, and observability.
- Exports `safeFilename`, `sha256HexToBase64`, and `isNotFound` so security-sensitive
  sanitization and error classification can be verified directly.
- Verifies `S3ObjectStorageAdapter` behavior in isolation with mock-based unit testing:
  - Constructor instantiation of `S3Client` with configured endpoint, region, forcePathStyle,
    and credentials.
  - `presignPut` generating signed PUT URLs with configured TTL, media type headers, and optional
    base64 SHA-256 checksum headers when provided.
  - `presignGet` generating signed GET URLs with configured TTL, sanitized attachment
    content-disposition, and response content-type.
  - `putBuffer` dispatching `PutObjectCommand` with bucket, key, buffer body, media type,
    and base64 SHA-256 checksum.
  - `stat` dispatching `HeadObjectCommand`, mapping content length, media type, and checksum,
    returning `null` on 404, and rethrowing unexpected errors.
  - `getBuffer` dispatching `GetObjectCommand`, reading byte streams, handling undefined body,
    returning `null` on 404, and rethrowing unexpected errors.
  - `delete` dispatching `DeleteObjectCommand` with bucket and key.
  - `readiness` probing `.acres-readiness` marker with `HeadObjectCommand`, returning `true`
    both on success and on 404 (proving reachable bucket/endpoint), and returning `false` on
    network or authorization failures.
  - Edge cases and security bounds: CRLF/quote sanitization and length truncation in `safeFilename`,
    valid hex-to-base64 conversion in `sha256HexToBase64`, and fail-safe object validation in `isNotFound`.
- Introduces zero breaking changes to public REST or GraphQL contracts (`npm run contracts:check`).

## Reference material read for it, by path

- `server/src/storage/storage.port.ts`: `PresignedPut`, `PresignedGet`, `StoredObjectStat`, and `ObjectStoragePort` definitions.
- `server/src/storage/s3-object-storage.adapter.ts`: S3 client commands, presigning, buffer I/O, readiness check, and helper functions.
- `server/src/config/acres-config.service.ts`: storage configuration settings (`storageEndpoint`, `storageRegion`, `storageForcePathStyle`, `storageAccessKeyId`, `storageSecretAccessKey`, `storageBucket`, `presignedUploadTtlSeconds`, `acceptedDownloadTtlSeconds`).
- `server/src/scanner/clamav-scanner.adapter.spec.ts`: architectural reference for isolated adapter testing with Jest mocks.
- `server/src/queue/bullmq-queue.adapter.spec.ts`: reference for mock-based external I/O adapter testing.
- `server/test/helpers/test-app.ts`: integration test double verifying expected `ObjectStoragePort` method signatures.
- `docs/backend.md`: Phase 6 storage, worker, and upload architecture records.
- `docs/build-plan.md`: Phase 6 outcomes and verification records §§16–22.

## Measurements and procedure

Verified by static typechecking, Jest execution, and AST inspection:

1. `server/src/storage/storage.port.ts`:
   - Define and export `STORAGE_PRESIGNED_METHODS`:
     ```ts
     export const STORAGE_PRESIGNED_METHODS = ['PUT', 'GET'] as const;

     export type StoragePresignedMethod =
       (typeof STORAGE_PRESIGNED_METHODS)[number];
     ```
2. `server/src/storage/s3-object-storage.adapter.ts`:
   - Export helper functions:
     ```ts
     export function isNotFound(error: unknown): boolean { ... }
     export function sha256HexToBase64(checksumHex: string): string { ... }
     export function safeFilename(filename: string): string { ... }
     ```
3. `server/src/storage/s3-object-storage.adapter.spec.ts`:
   - Create unit test suite mocking `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`:
     ```ts
     jest.mock('@aws-sdk/client-s3');
     jest.mock('@aws-sdk/s3-request-presigner');
     ```
   - Test cases:
     - `STORAGE_PRESIGNED_METHODS` contract:
       - asserts exact tuple `['PUT', 'GET']`.
     - `S3Client initialization`:
       - verifies `S3Client` constructor received endpoint, region, forcePathStyle, and credentials from config.
     - `presignPut`:
       - constructs `PutObjectCommand` with bucket, key, and content-type.
       - passes `ChecksumSHA256` and sets `x-amz-checksum-sha256` header when `checksumHex` is supplied.
       - omits checksum header and parameter when `checksumHex` is undefined.
       - calls `getSignedUrl` with presignedUploadTtlSeconds expiresIn option.
       - returns object with method `'PUT'`, headers, expiresAt Date, and resolved URL.
     - `presignGet`:
       - constructs `GetObjectCommand` with bucket, key, content-type, and sanitized content-disposition header.
       - calls `getSignedUrl` with acceptedDownloadTtlSeconds expiresIn option.
       - returns object with method `'GET'`, empty headers, expiresAt Date, and resolved URL.
     - `putBuffer`:
       - sends `PutObjectCommand` with bucket, key, buffer body, mediaType, and base64 checksum.
     - `stat`:
       - returns mapped stat (`byteCount`, `mediaType`, `checksumHex`) on successful `HeadObjectCommand`.
       - handles missing optional properties (`ContentLength`, `ContentType`, `ChecksumSHA256`) with fallback defaults (`0n`, `null`, `null`).
       - returns `null` when S3 throws 404 not found error.
       - rethrows unexpected errors (e.g. 500, network error).
     - `getBuffer`:
       - reads body stream via `transformToByteArray` and returns Buffer on successful `GetObjectCommand`.
       - returns empty Buffer when `response.Body` is undefined.
       - returns `null` when S3 throws 404 not found error.
       - rethrows unexpected errors.
     - `delete`:
       - sends `DeleteObjectCommand` with bucket and key.
     - `readiness`:
       - returns `true` when `HeadObjectCommand` on `.acres-readiness` resolves successfully.
       - returns `true` when `HeadObjectCommand` fails with 404 (verifying endpoint/bucket reachable).
       - returns `false` when `HeadObjectCommand` fails with non-404 error (e.g. connection refused, 403 forbidden).
     - `helper functions`:
       - `safeFilename`: replaces quotes (`"`), carriage returns (`\r`), newlines (`\n`), and backslashes (`\`) with underscores; truncates filenames exceeding 180 characters; preserves safe filenames.
       - `sha256HexToBase64`: correctly converts hex string to base64 encoding.
       - `isNotFound`: returns `true` for objects with `$metadata.httpStatusCode === 404`; returns `false` for other status codes, empty objects, null, undefined, and non-object values.

## Expected impact

- `server/src/storage/storage.port.ts`: `STORAGE_PRESIGNED_METHODS` and `StoragePresignedMethod` exported.
- `server/src/storage/s3-object-storage.adapter.ts`: `safeFilename`, `sha256HexToBase64`, and `isNotFound` exported.
- `server/src/storage/s3-object-storage.adapter.spec.ts`: new comprehensive unit test file with 100% branch and statement coverage on `S3ObjectStorageAdapter`.
- Zero runtime behavioral drift for existing callers in `uploads.service.ts`, `upload-worker.service.ts`, `ingestion-processor.service.ts`, `reports.service.ts`, or `health.service.ts`.
- Zero contract drift: `npm run contracts:check` continues to pass.

## Non-goals

- Altering the S3 storage client provider or switching storage SDKs.
- Modifying S3 bucket naming, access policies, or credentials structure.
- Modifying database schemas or GraphQL/REST public contracts.

## SKILLS USED

- `nestjs-best-practices`: verify provider design and dependency injection patterns.
- `javascript-testing-patterns`: construct isolated unit tests using Jest mocks for `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`, asserting arguments, edge cases, and error handling.
- `architecture-patterns`: adhere to Hexagonal Architecture port/adapter boundary principles.
- `error-handling-patterns`: verify exception handling, 404 discrimination, and graceful degradation in `stat()`, `getBuffer()`, and `readiness()`.
- `requesting-code-review`: dispatch reviewer subagent upon completing implementation and checks.
- `receiving-code-review`: evaluate code review feedback with technical rigor before final commit.
- `caveman-commit`: format commit message following Conventional Commits, imperative summary <= 50 characters, and no AI trailer.

## Verification plan

Run the checks and quote real output:

1. `npm run contracts:check` (verify zero public API or GraphQL drift)
2. `npm run build:shared` (build shared contracts)
3. `npm run typecheck` (typecheck shared, client, and server)
4. `npm run lint` (ESLint across workspaces)
5. `npm --workspace=@acres/server test -- server/src/storage/s3-object-storage.adapter.spec.ts` (verify new unit test suite passes)
6. `npm run test:server` (run full server test suite)
7. Inspect `git diff` to confirm zero unintended changes.
