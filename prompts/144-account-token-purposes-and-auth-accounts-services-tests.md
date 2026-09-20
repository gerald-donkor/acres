# 144 — export canonical account token purposes tuple, csrf receipt interface, and add AccountsService and AuthService unit tests

## Scope, and why it is next

The committed repository is on `main` at `47c1e4b`
(`refactor(organizations): export tuple and add tests`, the prompt 143 implementation).
The worktree is clean (verified this session via `git status --short`, empty output).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), followed by dependency-safe external I/O adapter hardening,
canonical tuple exports, and isolated unit testing across scanner, queue, storage, mail,
AI, parser, upload, and organization/audit subsystems (prompts 136–143).

Prompts 136 through 143 established consistent, robust architecture patterns across
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

An inspection of the authentication, accounts, and identity subsystems (`packages/shared/src/auth.ts`,
`packages/shared/src/accounts.ts`, `server/src/accounts/accounts.service.ts`,
`server/src/auth/auth.service.ts`, `server/src/identity/account-tokens.service.ts`, Phase 3 / Phase 5)
reveals the following residual gaps:

1. In `packages/shared/src/auth.ts`, `AccountTokenPurpose` is missing, even though the database schema
   defines `enum AccountTokenPurpose { password_recovery, email_verification }`. The server services
   (`server/src/auth/auth.service.ts` and `server/src/identity/account-tokens.service.ts`) directly import
   the Prisma-generated enum from `../generated/prisma/enums` rather than depending on a canonical shared
   contract. A canonical runtime const tuple `ACCOUNT_TOKEN_PURPOSES` and derived type `AccountTokenPurpose`
   should be exported from `@acres/shared`.
2. In `packages/shared/src/auth.ts`, the CSRF token receipt contract returned by `GET /api/v1/auth/csrf`
   (`{ csrfToken: string; headerName: 'x-csrf-token' }`) is defined as an inline anonymous literal in
   `server/src/auth/auth.controller.ts:69` and duplicated in client code (`client/lib/api/browser.ts:51`
   and `client/lib/api/server.ts:99`). A shared `CSRF_HEADER_NAME` constant and `CsrfTokenReceipt` interface
   belong in `@acres/shared`.
3. In `server/src/accounts/accounts.service.ts`, `AccountsService` handles password hashing with bcrypt
   (cost 12), email normalization, account creation with unique-constraint collision mapping (`P2002` to
   `ApiException.invalidCredentials`), timing-attack-resistant password verification using `DUMMY_HASH`,
   and password updating. However, `AccountsService` has no isolated unit tests
   (`server/src/accounts/accounts.service.spec.ts` does not exist).
4. In `server/src/auth/auth.service.ts`, `AuthService` orchestrates user registration, credential-based
   login, session creation/revocation, password reset token issuance and email dispatch with error resilience,
   and single-use token consumption with session invalidation (TM-03 defense). `AuthService` also lacks
   isolated unit tests (`server/src/auth/auth.service.spec.ts` does not exist).

This prompt resolves these gaps, establishing canonical contract types/tuples in `@acres/shared`,
decoupling services from direct Prisma enum imports, eliminating client-side duplicate types, and
introducing comprehensive unit test suites for `AccountsService` and `AuthService`.

## Reference material read for it, by path

- `packages/shared/src/auth.ts`: authentication and account recovery types.
- `packages/shared/src/accounts.ts`: account and session profile types.
- `packages/shared/src/index.ts`: shared package entry point.
- `server/prisma/schema.prisma`: `AccountTokenPurpose` enum definition.
- `server/src/accounts/accounts.service.ts`: `AccountsService` implementation and `BCRYPT_COST`.
- `server/src/accounts/account-profile.ts`: `toAccountProfile` and `normaliseEmail` helpers.
- `server/src/auth/auth.service.ts`: `AuthService` implementation and session lifecycle.
- `server/src/auth/auth.controller.ts`: `AuthController` CSRF and session endpoints.
- `server/src/identity/account-tokens.service.ts`: token issuance and consumption.
- `server/src/identity/account-tokens.service.spec.ts`: test patterns for account token service.
- `server/src/sessions/sessions.service.spec.ts`: test patterns for session service.
- `client/lib/api/browser.ts`: browser client CSRF token handling.
- `client/lib/api/server.ts`: server client CSRF token handling.
- `docs/backend.md`: Section 4 ("Auth, sessions and hashing").
- `docs/build-plan.md`: Phase 3 & 5.

## Changes to implement

1. `packages/shared/src/auth.ts`:
   - Export canonical runtime const tuple `ACCOUNT_TOKEN_PURPOSES`:
     ```ts
     export const ACCOUNT_TOKEN_PURPOSES = [
       'password_recovery',
       'email_verification',
     ] as const;

     export type AccountTokenPurpose = (typeof ACCOUNT_TOKEN_PURPOSES)[number];
     ```
   - Export `CSRF_HEADER_NAME` and `CsrfTokenReceipt`:
     ```ts
     export const CSRF_HEADER_NAME = 'x-csrf-token' as const;
     export type CsrfHeaderName = typeof CSRF_HEADER_NAME;

     export interface CsrfTokenReceipt {
       csrfToken: string;
       headerName: CsrfHeaderName;
     }
     ```
2. `server/src/auth/auth.service.ts`:
   - Import `AccountTokenPurpose` from `@acres/shared` instead of `../generated/prisma/enums`.
   - Update usages of `AccountTokenPurpose.password_recovery` to `'password_recovery'`.
3. `server/src/identity/account-tokens.service.ts`:
   - Import `AccountTokenPurpose` from `@acres/shared` instead of `../generated/prisma/enums`.
4. `server/src/auth/auth.controller.ts`:
   - Import `CsrfTokenReceipt` from `@acres/shared`.
   - Type return of `csrfToken()` as `CsrfTokenReceipt`.
5. `client/lib/api/browser.ts`:
   - Import `CsrfTokenReceipt` from `@acres/shared`.
   - Define `type CsrfToken = CsrfTokenReceipt;`.
6. `client/lib/api/server.ts`:
   - Import `CsrfTokenReceipt` from `@acres/shared`.
   - Define `type CsrfToken = CsrfTokenReceipt;`.
7. `server/src/accounts/accounts.service.spec.ts`:
   - Unit tests covering `findByEmail` (case-insensitivity, whitespace trimming, found, not found).
   - Unit tests covering `findById` (found, not found).
   - Unit tests covering `create` (bcrypt hashing with cost 12, email normalisation, displayName trimming/null, P2002 unique constraint translation to `ApiException.invalidCredentials`, general error rethrow).
   - Unit tests covering `verifyPassword` (valid password, wrong password, null account dummy comparison preventing timing attacks).
   - Unit tests covering `toProfile` (formatting and field mapping, date to ISO string).
   - Unit tests covering `updatePassword` (re-hashing with bcrypt cost 12, updating database).
8. `server/src/auth/auth.service.spec.ts`:
   - Unit tests covering `register` (existing account collision throwing `ApiException.invalidCredentials` without creating user, success creating user and starting session, handling P2002 error from concurrent insert).
   - Unit tests covering `login` (valid credentials, invalid password, nonexistent email throwing `ApiException.invalidCredentials`).
   - Unit tests covering `logout` (invoking session revocation).
   - Unit tests covering `forgotPassword` (existing email issuing token and sending email, mailer failure handling without leaking error to user, nonexistent email executing dummy timing-safe password check and returning success without issuing token or sending email).
   - Unit tests covering `resetPassword` (invalid/expired token throwing `ApiException.invalidOrExpiredToken`, valid token updating password, revoking all existing sessions for account, revoking remaining tokens, returning `{ reset: true }`).
   - Unit tests covering `describe` (handling undefined session vs. authenticated session).
9. `docs/backend.md`:
   - Document `ACCOUNT_TOKEN_PURPOSES` and `CsrfTokenReceipt` exports in `@acres/shared`.
   - Document `AccountsService` and `AuthService` unit test coverage in Section 4.

## Expected impact

- `packages/shared/src/auth.ts`: exports `ACCOUNT_TOKEN_PURPOSES`, `AccountTokenPurpose`, `CSRF_HEADER_NAME`, and `CsrfTokenReceipt`.
- `server/src/auth/auth.service.ts` & `server/src/identity/account-tokens.service.ts`: decouple from Prisma internal enum types.
- `server/src/auth/auth.controller.ts`, `client/lib/api/browser.ts`, `client/lib/api/server.ts`: share `CsrfTokenReceipt` contract type.
- `server/src/accounts/accounts.service.spec.ts`: comprehensive unit test suite for account operations and bcrypt security.
- `server/src/auth/auth.service.spec.ts`: comprehensive unit test suite for authentication, session management, and anti-enumeration defenses.
- `docs/backend.md`: updated documentation of auth and accounts layer.
- Zero breaking changes to public REST or GraphQL API contracts (`npm run contracts:check`).
- Zero database schema or migration changes.

## Non-goals

- Altering database schema or migrations.
- Modifying authentication route paths, status codes, or response envelopes.
- Modifying UI components or auth pages.

## Checks to run

```bash
npm run contracts:check
npm run build:shared
npm run test --workspace=@acres/server -- src/accounts/accounts.service.spec.ts
npm run test --workspace=@acres/server -- src/auth/auth.service.spec.ts
npm run test:server
npm run typecheck
npm run lint
npm run build
```

## SKILLS USED

- `nestjs-best-practices`: Service dependency injection, error handling with `ApiException`, and isolated unit testing.
- `auth-implementation-patterns`: Secure password hashing, timing-safe authentication, anti-enumeration protections, single-use token lifecycle, and session invalidation.
- `security-best-practices`: Protection against user enumeration, bcrypt cost enforcement, session fixation/theft prevention.
- `error-handling-patterns`: Consistent error codes, translation of persistence-layer errors (`P2002`) to domain exceptions.
- `javascript-testing-patterns`: Comprehensive unit test suites with mocks, spy assertions, and boundary conditions.
- `requesting-code-review`: Structured code review with dedicated reviewer subagent.
- `receiving-code-review`: Technical evaluation of review findings.
- `caveman-commit`: Terse, conventional commit message on `main`.
