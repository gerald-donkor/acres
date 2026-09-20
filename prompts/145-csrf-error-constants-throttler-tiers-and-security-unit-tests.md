# 145 — export canonical CSRF error constants, throttler tiers tuple, and add CsrfService and AcresThrottlerGuard unit tests

## Scope, and why it is next

The committed repository is on `main` at `227a1e8`
(`refactor(auth): export token purpose and add tests`, the prompt 144 implementation).
The worktree is clean (verified this session via `git status`, clean output).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), followed by dependency-safe external I/O adapter hardening,
canonical tuple exports, and isolated unit testing across scanner, queue, storage, mail,
AI, parser, upload, organization/audit, and accounts/auth subsystems (prompts 136–144).

Prompts 136 through 144 established consistent, robust architecture patterns across
subsystems:
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

In prompt 144, canonical `CSRF_HEADER_NAME` and `CsrfTokenReceipt` were added to
`packages/shared/src/auth.ts`. However, an inspection of the security enforcement
layer (`server/src/security/csrf.service.ts`, `server/src/security/rate-limit.guard.ts`,
`server/src/security/security.module.ts`, `server/src/security/strict-throttle.decorator.ts`)
reveals the following residual gaps:

1. In `packages/shared/src/auth.ts`, the CSRF failure error code (`'CSRF_INVALID'`) and
   error message (`'CSRF token missing or invalid.'`) are defined as raw string literals
   in `server/src/security/csrf.service.ts:44-46` and `78-83`, and duplicated across client
   helpers, end-to-end tests, and documentation. They belong as canonical exported
   constants and types (`CSRF_ERROR_CODE`, `CSRF_ERROR_MESSAGE`, `CsrfErrorCode`) in
   `@acres/shared/src/auth.ts`.
2. In `server/src/security/csrf.service.ts`, line 41 hardcodes `request.headers['x-csrf-token']`
   instead of consuming the canonical `CSRF_HEADER_NAME` constant exported by `@acres/shared`.
3. In `server/src/security/rate-limit.guard.ts`, `const STRICT_THROTTLER_NAME = 'strict'` is
   a private local string constant, while `server/src/security/security.module.ts` hardcodes
   the tier names `'default'` and `'strict'` in its asynchronous factory. A canonical runtime
   const tuple `THROTTLER_TIERS = ['default', 'strict'] as const`, derived type `ThrottlerTier`,
   and exported constants `DEFAULT_THROTTLER_NAME` and `STRICT_THROTTLER_NAME` belong in
   `server/src/security/rate-limit.guard.ts` to provide strong typing and eliminate string magic.
4. In `server/src/security/csrf.service.ts`, `CsrfService` manages double-submit CSRF cookie
   configuration, cookie security prefixing (`__Host-` on secure production cookies), session-identifier
   cookie binding, token generation, and wrapped Express protection middleware that intercepts `doubleCsrf`
   library rejections to output the standard `ApiError` envelope. `CsrfService` currently has NO
   isolated unit tests (`server/src/security/csrf.service.spec.ts` does not exist).
5. In `server/src/security/rate-limit.guard.ts`, `AcresThrottlerGuard` implements tier routing (bypassing
   the strict tier for non-annotated routes while preserving default rate limits, and enforcing strict
   throttling for routes annotated with `@StrictThrottle()`), as well as multi-transport context unwrapping
   (extracting Express `req` and `res` from standard HTTP contexts as well as GraphQL `AcresGraphqlContext`).
   `AcresThrottlerGuard` currently has NO isolated unit tests (`server/src/security/rate-limit.guard.spec.ts`
   does not exist).

This prompt resolves these gaps, exporting canonical CSRF error constants and throttler tier tuples,
decoupling services from raw string literals, and introducing comprehensive, isolated unit test suites
for `CsrfService` and `AcresThrottlerGuard`.

## Reference material read for it, by path

- `packages/shared/src/auth.ts`: authentication, account recovery, and CSRF token receipt types.
- `packages/shared/src/api.ts`: API error envelope definitions and `API_ERROR_CODES`.
- `packages/shared/src/index.ts`: shared package entry point.
- `server/src/security/csrf.service.ts`: `CsrfService` double-submit CSRF implementation and middleware.
- `server/src/security/rate-limit.guard.ts`: `AcresThrottlerGuard` throttler routing and context resolution.
- `server/src/security/strict-throttle.decorator.ts`: `@StrictThrottle()` decorator and `STRICT_THROTTLE_KEY`.
- `server/src/security/security.module.ts`: `SecurityModule` and `ThrottlerModule.forRootAsync` configuration.
- `server/src/config/acres-config.service.ts`: `AcresConfigService` configuration properties.
- `server/src/graphql/graphql.context.ts`: `AcresGraphqlContext` interface for GraphQL execution context.
- `docs/backend.md`: Section 4 ("Auth, sessions and hashing" — CSRF defense and rate limiting).
- `docs/security.md`: CSRF defense and rate-limiting threat boundaries.
- `docs/build-plan.md`: Phase 3 & 4.

## Changes to implement

1. `packages/shared/src/auth.ts`:
   - Export canonical CSRF error code and message:
     ```ts
     export const CSRF_ERROR_CODE = 'CSRF_INVALID' as const;
     export type CsrfErrorCode = typeof CSRF_ERROR_CODE;

     export const CSRF_ERROR_MESSAGE = 'CSRF token missing or invalid.' as const;
     export type CsrfErrorMessage = typeof CSRF_ERROR_MESSAGE;
     ```
2. `server/src/security/rate-limit.guard.ts`:
   - Export canonical throttler tier const tuple and named constants:
     ```ts
     export const THROTTLER_TIERS = ['default', 'strict'] as const;
     export type ThrottlerTier = (typeof THROTTLER_TIERS)[number];

     export const DEFAULT_THROTTLER_NAME: ThrottlerTier = 'default';
     export const STRICT_THROTTLER_NAME: ThrottlerTier = 'strict';
     ```
3. `server/src/security/csrf.service.ts`:
   - Import `CSRF_HEADER_NAME`, `CSRF_ERROR_CODE`, `CSRF_ERROR_MESSAGE` from `@acres/shared`.
   - In `doubleCsrf` config:
     ```ts
     getCsrfTokenFromRequest: (request: Request) =>
       request.headers[CSRF_HEADER_NAME],
     errorConfig: {
       statusCode: 403,
       message: CSRF_ERROR_MESSAGE,
       code: CSRF_ERROR_CODE,
     },
     ```
   - In `protection` middleware response:
     ```ts
     response.status(403).json({
       ok: false,
       error: {
         code: CSRF_ERROR_CODE,
         message: CSRF_ERROR_MESSAGE,
       },
     } satisfies ApiError);
     ```
4. `server/src/security/security.module.ts`:
   - Import `DEFAULT_THROTTLER_NAME` and `STRICT_THROTTLER_NAME` from `./rate-limit.guard`.
   - Use `DEFAULT_THROTTLER_NAME` and `STRICT_THROTTLER_NAME` in `ThrottlerModule.forRootAsync` options factory.
5. `server/src/security/csrf.service.spec.ts` (NEW):
   - Unit tests covering `CsrfService` construction and configuration:
     - Development environment (`isProduction: false`): cookie name has no `__Host-` prefix and `secure: false`.
     - Production environment (`isProduction: true`): cookie name is prefixed with `__Host-` and `secure: true`.
     - Secret provider: retrieves `config.sessionSecret`.
     - Session identifier provider: extracts cookie named `config.sessionCookieName` from `request.cookies`, returning empty string if missing.
     - Token extractor: reads header `x-csrf-token` (`CSRF_HEADER_NAME`).
   - Unit tests covering `issueToken`:
     - Calls underlying `utilities.generateCsrfToken` and returns minted token string.
   - Unit tests covering `protection` middleware:
     - Calls `next()` with no arguments when underlying double-csrf protection reports no error.
     - Intercepts `utilities.invalidCsrfTokenError` and responds with HTTP 403 status and JSON `ApiError` envelope containing `CSRF_ERROR_CODE` and `CSRF_ERROR_MESSAGE`.
     - Forwards non-CSRF unexpected errors directly to `next(error)` without masking or altering them.
6. `server/src/security/rate-limit.guard.spec.ts` (NEW):
   - Unit tests covering `handleRequest`:
     - When throttler is `strict` and route handler/class lack `@StrictThrottle()` metadata, returns `true` immediately without throttling.
     - When throttler is `strict` and route handler has `@StrictThrottle()` metadata, delegates to `super.handleRequest`.
     - When throttler is `strict` and controller class has `@StrictThrottle()` metadata, delegates to `super.handleRequest`.
     - When throttler is `default`, delegates to `super.handleRequest` regardless of `@StrictThrottle()` metadata.
   - Unit tests covering `getRequestResponse`:
     - When execution context is standard HTTP, returns `{ req, res }` from `super.getRequestResponse`.
     - When execution context is GraphQL (`context.getType() === 'graphql'`), returns `{ req, res }` extracted from `AcresGraphqlContext`.
7. `docs/backend.md`:
   - Document canonical `CSRF_ERROR_CODE`, `CSRF_ERROR_MESSAGE`, and `THROTTLER_TIERS` exports.
   - Document `CsrfService` and `AcresThrottlerGuard` unit test coverage in Section 4.

## Expected impact

- `packages/shared/src/auth.ts`: exports `CSRF_ERROR_CODE`, `CsrfErrorCode`, `CSRF_ERROR_MESSAGE`, and `CsrfErrorMessage`.
- `server/src/security/rate-limit.guard.ts`: exports `THROTTLER_TIERS`, `ThrottlerTier`, `DEFAULT_THROTTLER_NAME`, and `STRICT_THROTTLER_NAME`.
- `server/src/security/csrf.service.ts`: consumes canonical shared constants for headers, error codes, and messages.
- `server/src/security/security.module.ts`: uses canonical throttler tier constants.
- `server/src/security/csrf.service.spec.ts`: complete unit test suite for double-submit CSRF configuration, token issuance, and wrapped Express protection middleware.
- `server/src/security/rate-limit.guard.spec.ts`: complete unit test suite for tier routing, strict throttling metadata evaluation, and multi-transport context unwrapping.
- `docs/backend.md`: updated security documentation with test verification records.
- Zero breaking changes to public REST or GraphQL API contracts (`npm run contracts:check`).
- Zero database schema or migration changes.

## Non-goals

- Modifying CSRF cookie attributes, TTL, or secret generation.
- Modifying throttler limits, window duration, or storage adapter.
- Altering the `ApiError` envelope structure or exception filter behavior.

## Checks to run

```bash
npm run contracts:check
npm run build:shared
npm run test --workspace=@acres/server -- src/security/csrf.service.spec.ts
npm run test --workspace=@acres/server -- src/security/rate-limit.guard.spec.ts
npm run test:server
npm run typecheck
npm run lint
npm run build
```

## SKILLS USED

- `nestjs-best-practices`: Guard inheritance, reflector metadata lookup, execution context unwrapping, and modular provider configuration.
- `auth-implementation-patterns`: Double-submit CSRF cookie protection, `__Host-` cookie security, session binding, and rate-limiting defense in depth.
- `security-best-practices`: Prevention of cross-site request forgery, fail-closed CSRF validation, brute-force mitigation on credential endpoints, and GraphQL context security.
- `error-handling-patterns`: Precise error classification, preventing non-CSRF errors from being masked as CSRF failures, and structured `ApiError` response envelopes.
- `javascript-testing-patterns`: Isolated unit test suites using Jest, mocking Express request/response objects, reflector metadata spies, and superclass delegation.
- `requesting-code-review`: Structured code review with dedicated reviewer subagent.
- `receiving-code-review`: Technical evaluation of review findings.
- `caveman-commit`: Terse, conventional commit message on `main`.
