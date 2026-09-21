# 147 — export canonical request ID and idempotency header constants, and add server common foundation unit tests

## Scope, and why it is next

The committed repository is on `main` at `9702a36`
(`refactor(guards): export tuples and add tests`, the prompt 146 implementation).
The worktree is clean (verified this session via `git status`, clean output).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), followed by dependency-safe external I/O adapter hardening,
canonical tuple exports, and isolated unit testing across scanner, queue, storage, mail,
AI, parser, upload, organization/audit, accounts/auth, security, and tenancy guard subsystems
(prompts 136–146).

Prompts 136 through 146 systematically eliminated raw string literals, extracted canonical
runtime const tuples into `@acres/shared`, and introduced comprehensive isolated unit test
suites across each subsystem:
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
- Prompt 142 (`a12f3ca`): Upload subsystem canonical const tuples (`UPLOAD_STATES`,
  `STORED_OBJECT_STATES`) and unit tests (`server/src/uploads/uploads.service.spec.ts`).
- Prompt 143 (`47c1e4b`): Organization and audit subsystem canonical const tuple (`AUDIT_ACTIONS`),
  shared contract type (`OrganizationAuditEvent`), and unit tests
  (`server/src/organizations/audit.service.spec.ts`, `server/src/organizations/organizations.service.spec.ts`).
- Prompt 144 (`227a1e8`): Canonical account token purposes tuple (`ACCOUNT_TOKEN_PURPOSES`),
  CSRF receipt contract (`CSRF_HEADER_NAME`, `CsrfTokenReceipt`), and unit tests
  (`server/src/accounts/accounts.service.spec.ts`, `server/src/auth/auth.service.spec.ts`).
- Prompt 145 (`0b9f920`): Canonical CSRF error constants (`CSRF_ERROR_CODE`, `CSRF_ERROR_MESSAGE`),
  throttler tiers tuple (`THROTTLER_TIERS`), and unit tests (`server/src/security/csrf.service.spec.ts`,
  `server/src/security/rate-limit.guard.spec.ts`).
- Prompt 146 (`9702a36`): Canonical organization header (`ORGANIZATION_HEADER_NAME`),
  permissions tuple (`ORGANIZATION_PERMISSIONS`), and unit tests (`server/src/sessions/session.guard.spec.ts`,
  `server/src/organizations/organization-context.guard.spec.ts`, `server/src/organizations/permission.guard.spec.ts`).

While prompt 146 completed authentication and tenancy guard isolated unit test coverage,
an inspection of the core request/response pipeline and foundational utility layer in
`server/src/common/` and `@acres/shared/src/api.ts` reveals the following residual gaps:

1. In `packages/shared/src/api.ts`, while response envelopes (`ApiSuccess`, `ApiError`, `ApiResponse`)
   and `API_ERROR_CODES` are defined, the canonical HTTP header names for request tracking
   (`'x-request-id'`) and mutation idempotency (`'idempotency-key'`) are NOT exported as canonical
   constants. Instead, they are hardcoded as raw string literals across client request adapters
   (`client/lib/api/envelope.ts:42,54`, `client/lib/api/browser.ts:102`), proxy route handlers
   (`client/app/api/v1/[...path]/route.ts:16`), server setup (`server/src/app.setup.ts:54,56,68`),
   and request context middleware (`server/src/common/request-context.ts:20,24`).
   Canonical constants and derived types (`REQUEST_ID_HEADER_NAME = 'x-request-id' as const`,
   `RequestIdHeaderName = typeof REQUEST_ID_HEADER_NAME`, `IDEMPOTENCY_HEADER_NAME = 'idempotency-key' as const`,
   `IdempotencyHeaderName = typeof IDEMPOTENCY_HEADER_NAME`) belong in `packages/shared/src/api.ts`
   and re-exported via `packages/shared/src/index.ts`.
2. In `server/src/common/api-exception.ts`, `ApiException` extends NestJS `HttpException` and provides
   typed factory methods (`validationFailed`, `invalidCredentials`, `unauthenticated`, `forbidden`,
   `conflict`, `idempotencyKeyRequired`, `idempotencyConflict`, `cursorInvalid`, `queryLimitExceeded`,
   `notFound`, `notReady`, `invalidOrExpiredToken`) that guarantee consistent error codes and HTTP status codes
   across the API. Currently, NO isolated unit test suite exists for `ApiException` (`server/src/common/api-exception.spec.ts`
   does not exist).
3. In `server/src/common/api-exception.filter.ts`, `ApiExceptionFilter` catches all thrown exceptions across
   HTTP handlers, formats them into the canonical `ApiError` envelope, translates known HTTP statuses into
   standard API error codes, masks unhandled exceptions behind a safe `INTERNAL_ERROR` payload with logged stack trace,
   attaches `requestId` from request context, and passes through non-HTTP contexts. Currently, NO isolated unit test
   suite exists for `ApiExceptionFilter` (`server/src/common/api-exception.filter.spec.ts` does not exist).
4. In `server/src/common/response-envelope.interceptor.ts`, `ResponseEnvelopeInterceptor` wraps successful
   handler return values into the canonical `{ ok: true, data }` `ApiSuccess` envelope, while explicitly
   bypassing non-HTTP execution contexts, SSE handlers marked with `SSE_METADATA`, `/metrics` telemetry endpoints,
   and `/events` streaming routes. Currently, NO isolated unit test suite exists for `ResponseEnvelopeInterceptor`
   (`server/src/common/response-envelope.interceptor.spec.ts` does not exist).
5. In `server/src/common/request-context.ts`, `requestContextMiddleware` extracts or generates valid UUID request IDs,
   attaches them to `request.requestContext`, and sets the response header, while `requestIdFrom` safely extracts
   request IDs from optional request references. Currently, NO isolated unit test suite exists for
   `request-context.ts` (`server/src/common/request-context.spec.ts` does not exist).
6. In `server/src/common/ids.ts`, `uuidV7()` generates RFC 9562 UUIDv7 values using 48-bit millisecond timestamps
   and crypto random bytes. Currently, NO isolated unit test suite exists for `ids.ts` (`server/src/common/ids.spec.ts`
   does not exist).
7. In `server/src/common/tokens.ts`, `issueRawToken()` generates 32-byte base64url random tokens and `hashToken()`
   computes deterministic SHA-256 hex digests. Currently, NO isolated unit test suite exists for `tokens.ts`
   (`server/src/common/tokens.spec.ts` does not exist).
8. In `server/src/common/transform.ts`, `trimValue()` and `normaliseEmailValue()` provide type-safe sanitizers for
   class-transformer DTO decorators. Currently, NO isolated unit test suite exists for `transform.ts`
   (`server/src/common/transform.spec.ts` does not exist).

This prompt resolves these gaps: exporting canonical `REQUEST_ID_HEADER_NAME` and `IDEMPOTENCY_HEADER_NAME`
from `@acres/shared`, wiring consumers to import them, and introducing comprehensive isolated unit test
suites across `server/src/common/` (`api-exception.spec.ts`, `api-exception.filter.spec.ts`,
`response-envelope.interceptor.spec.ts`, `request-context.spec.ts`, `ids.spec.ts`, `tokens.spec.ts`,
and `transform.spec.ts`).

## Reference material read for it, by path

- `packages/shared/src/api.ts`: shared API envelopes (`ApiSuccess`, `ApiError`, `ApiResponse`) and `API_ERROR_CODES`.
- `packages/shared/src/index.ts`: shared package exports.
- `server/src/common/api-exception.ts`: `ApiException` class and static factory methods.
- `server/src/common/api-exception.filter.ts`: `ApiExceptionFilter` exception mapping and error masking.
- `server/src/common/response-envelope.interceptor.ts`: `ResponseEnvelopeInterceptor` success envelope wrapping and SSE/metrics bypass.
- `server/src/common/request-context.ts`: `requestContextMiddleware` and `requestIdFrom` helper.
- `server/src/common/ids.ts`: `uuidV7` generator.
- `server/src/common/tokens.ts`: `issueRawToken` and `hashToken` utilities.
- `server/src/common/transform.ts`: `trimValue` and `normaliseEmailValue` transformation functions.
- `server/src/app.setup.ts`: CORS headers configuration and Pino logging request ID extraction.
- `client/lib/api/envelope.ts`: client response envelope parser and request ID extraction.
- `client/lib/api/browser.ts`: client browser API request execution and idempotency header attachment.
- `docs/backend.md`: Section 3 ("Module and route map") and Section 4 ("Envelopes, errors and request context").
- `docs/security.md`: Error handling, exception masking, and request correlation boundaries.

## Changes to implement

1. `packages/shared/src/api.ts`:
   - Export canonical request ID and idempotency header name constants and derived types:
     ```ts
     export const REQUEST_ID_HEADER_NAME = 'x-request-id' as const;
     export type RequestIdHeaderName = typeof REQUEST_ID_HEADER_NAME;

     export const IDEMPOTENCY_HEADER_NAME = 'idempotency-key' as const;
     export type IdempotencyHeaderName = typeof IDEMPOTENCY_HEADER_NAME;
     ```
2. Client and server integration for canonical header names:
   - In `server/src/common/request-context.ts`: import `REQUEST_ID_HEADER_NAME` from `@acres/shared` and use it for header retrieval and header setting.
   - In `server/src/app.setup.ts`: import `REQUEST_ID_HEADER_NAME` from `@acres/shared` and use it in CORS `allowedHeaders` and `exposedHeaders`, and in `pinoHttp.customProps`.
   - In `client/lib/api/envelope.ts`: import `REQUEST_ID_HEADER_NAME` from `@acres/shared` and use it in `response.headers.get(REQUEST_ID_HEADER_NAME)`.
   - In `client/lib/api/browser.ts`: import `IDEMPOTENCY_HEADER_NAME` from `@acres/shared` and use it in `headers.set(IDEMPOTENCY_HEADER_NAME, init.idempotencyKey)`.
3. `server/src/common/api-exception.spec.ts` (NEW):
   - Unit tests covering `ApiException`:
     - Constructor: populates `code`, `message`, `status`, and `details`, and `getResponse()` matches `{ code, message, details }`.
     - Static factories:
       - `validationFailed(details)`: status 400 (`BAD_REQUEST`), code `'VALIDATION_FAILED'`, details preserved.
       - `invalidCredentials()`: status 401 (`UNAUTHORIZED`), code `'INVALID_CREDENTIALS'`, uniform generic message.
       - `unauthenticated()`: status 401 (`UNAUTHORIZED`), code `'UNAUTHENTICATED'`.
       - `forbidden(message?)`: status 403 (`FORBIDDEN`), code `'FORBIDDEN'`, default message or custom message.
       - `conflict(message)`: status 409 (`CONFLICT`), code `'CONFLICT'`, custom message.
       - `idempotencyKeyRequired()`: status 400 (`BAD_REQUEST`), code `'IDEMPOTENCY_KEY_REQUIRED'`.
       - `idempotencyConflict()`: status 409 (`CONFLICT`), code `'IDEMPOTENCY_CONFLICT'`.
       - `cursorInvalid()`: status 400 (`BAD_REQUEST`), code `'CURSOR_INVALID'`.
       - `queryLimitExceeded(message?)`: status 400 (`BAD_REQUEST`), code `'QUERY_LIMIT_EXCEEDED'`, default or custom message.
       - `notFound(message)`: status 404 (`NOT_FOUND`), code `'NOT_FOUND'`.
       - `notReady()`: status 503 (`SERVICE_UNAVAILABLE`), code `'NOT_READY'`.
       - `invalidOrExpiredToken()`: status 400 (`BAD_REQUEST`), code `'INVALID_TOKEN'`.
4. `server/src/common/api-exception.filter.spec.ts` (NEW):
   - Unit tests covering `ApiExceptionFilter`:
     - Non-HTTP contexts: when `host.getType() !== 'http'`, rethrows exception immediately.
     - `HttpException` with structured object payload:
       - Preserves status code from exception.
       - Maps `{ code, message, details }` into `ApiError` envelope.
       - Attaches `requestId` from `requestContext` when present.
       - Omits `requestId` when request context has no request ID.
     - `HttpException` with string payload:
       - Maps status code to fallback API error code (400 -> `VALIDATION_FAILED`, 401 -> `UNAUTHENTICATED`, 403 -> `FORBIDDEN`, 404 -> `NOT_FOUND`, 429 -> `RATE_LIMITED`, 503 -> `NOT_READY`, default -> `INTERNAL_ERROR`).
       - Formats payload string as error message.
     - Unhandled / non-HttpException (e.g. `new Error('DB failure')` or string error):
       - Logs stack trace via `Logger.error`.
       - Emits HTTP 500 (`INTERNAL_SERVER_ERROR`).
       - Masks raw error details behind `{ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.', requestId } }`.
5. `server/src/common/response-envelope.interceptor.spec.ts` (NEW):
   - Unit tests covering `ResponseEnvelopeInterceptor`:
     - Non-HTTP execution contexts: returns `next.handle()` directly without wrapping.
     - Handlers decorated with SSE metadata: returns `next.handle()` directly without wrapping.
     - Request to `/metrics`: returns `next.handle()` directly without wrapping.
     - Request to route ending with `/events`: returns `next.handle()` directly without wrapping.
     - Standard HTTP route: wraps returned data in `{ ok: true, data }`.
6. `server/src/common/request-context.spec.ts` (NEW):
   - Unit tests covering `requestContextMiddleware` and `requestIdFrom`:
     - Valid UUID `x-request-id` header: preserves trimmed UUID on `request.requestContext.requestId`, sets response header, calls `next()`.
     - Missing header: generates new random UUID, attaches to request and response, calls `next()`.
     - Malformed header (e.g. arbitrary non-UUID string, wrong format): ignores malformed header, generates valid random UUID, calls `next()`.
     - `requestIdFrom(request)`: extracts `requestId` from request context; returns `''` when request or requestContext is undefined.
7. `server/src/common/ids.spec.ts` (NEW):
   - Unit tests covering `uuidV7()`:
     - Returns valid 36-character hyphenated UUID matching RFC 9562 specification.
     - Version nibble at index 14 is `'7'`.
     - Variant nibble at index 19 is one of `'8'`, `'9'`, `'a'`, or `'b'`.
     - Generates ordered IDs where leading timestamp component is monotonically non-decreasing over time.
8. `server/src/common/tokens.spec.ts` (NEW):
   - Unit tests covering `issueRawToken()` and `hashToken()`:
     - `issueRawToken`: returns 43-character base64url string (32 bytes entropy), generates unique values across invocations.
     - `hashToken`: returns 64-character lowercase hexadecimal string, computes deterministic SHA-256 digest matching Node crypto.
9. `server/src/common/transform.spec.ts` (NEW):
   - Unit tests covering `trimValue()` and `normaliseEmailValue()`:
     - `trimValue`: trims leading and trailing whitespace from strings; returns non-string values unaltered.
     - `normaliseEmailValue`: trims whitespace and converts email to lowercase; returns non-string values unaltered.
10. `docs/backend.md`:
    - Document canonical `REQUEST_ID_HEADER_NAME` and `IDEMPOTENCY_HEADER_NAME` in Section 4 ("Envelopes, errors and request context").
    - Document unit test coverage across `server/src/common/`.

## Expected impact

- `packages/shared/src/api.ts`: exports canonical `REQUEST_ID_HEADER_NAME`, `RequestIdHeaderName`, `IDEMPOTENCY_HEADER_NAME`, and `IdempotencyHeaderName`.
- `server/src/common/request-context.ts`, `server/src/app.setup.ts`, `client/lib/api/envelope.ts`, `client/lib/api/browser.ts`: consume canonical header constants.
- `server/src/common/api-exception.spec.ts`: complete unit test suite for `ApiException`.
- `server/src/common/api-exception.filter.spec.ts`: complete unit test suite for `ApiExceptionFilter`.
- `server/src/common/response-envelope.interceptor.spec.ts`: complete unit test suite for `ResponseEnvelopeInterceptor`.
- `server/src/common/request-context.spec.ts`: complete unit test suite for `requestContextMiddleware` and `requestIdFrom`.
- `server/src/common/ids.spec.ts`: complete unit test suite for `uuidV7`.
- `server/src/common/tokens.spec.ts`: complete unit test suite for `issueRawToken` and `hashToken`.
- `server/src/common/transform.spec.ts`: complete unit test suite for `trimValue` and `normaliseEmailValue`.
- `docs/backend.md`: updated documentation reflecting canonical header exports and common unit test coverage.
- Zero breaking changes to public REST or GraphQL API contracts (`npm run contracts:check`).
- Zero database schema or migration changes.

## Non-goals

- Altering the HTTP status mapping or exception handling contract.
- Changing UUID generation algorithm away from UUIDv7.
- Modifying token generation entropy (32 bytes) or hashing algorithm (SHA-256).

## Checks to run

```bash
npm run contracts:check
npm run build:shared
npm run test --workspace=@acres/server -- src/common/api-exception.spec.ts
npm run test --workspace=@acres/server -- src/common/api-exception.filter.spec.ts
npm run test --workspace=@acres/server -- src/common/response-envelope.interceptor.spec.ts
npm run test --workspace=@acres/server -- src/common/request-context.spec.ts
npm run test --workspace=@acres/server -- src/common/ids.spec.ts
npm run test --workspace=@acres/server -- src/common/tokens.spec.ts
npm run test --workspace=@acres/server -- src/common/transform.spec.ts
npm run test:server
npm run typecheck
npm run lint
npm run build
```

## SKILLS USED

- `api-design-principles`: REST API response envelopes (`ApiSuccess`, `ApiError`), canonical HTTP headers (`x-request-id`, `idempotency-key`), and error code contracts.
- `error-handling-patterns`: Typed `ApiException` hierarchy, error propagation, exception filter translation, and internal error masking.
- `nestjs-best-practices`: NestJS exception filters (`@Catch()`), interceptors (`NestInterceptor`), middleware (`NestMiddleware`), execution context switching, and modular provider configuration.
- `auth-implementation-patterns`: Cryptographically secure token generation (32-byte base64url) and SHA-256 digest hashing.
- `security-best-practices`: Fail-closed exception filtering, internal implementation detail masking, and request correlation tracking.
- `javascript-testing-patterns`: Isolated unit test suites using Jest, mocking NestJS `ExecutionContext`, `ArgumentsHost`, `CallHandler`, Express `Request`, and `Response`.
- `requesting-code-review`: Structured code review with dedicated reviewer subagent.
- `receiving-code-review`: Technical evaluation of review findings.
- `caveman-commit`: Terse, conventional commit message on `main`.
