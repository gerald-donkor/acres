# 149 — export canonical terminal upload states and add unit tests across core REST controllers (auth, accounts, organizations, uploads, ai-draft)

## Scope, and why it is next

The committed repository is on `main` at `5aaa74a`
(`refactor(server): export tuples and add tests`, the prompt 148 implementation).
The worktree is clean (verified via `git status`, clean working tree).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), followed by external I/O adapter hardening, canonical
tuple exports, and isolated unit testing across scanner, queue, storage, mail, AI,
parser, upload, organization/audit, accounts/auth, security, tenancy guard, common
request/response, prisma/transactions, config, health, forms, and job run foundation
subsystems (prompts 136–148).

Prompts 136 through 148 systematically eliminated raw string literals, extracted canonical
runtime const tuples into `@acres/shared` and subsystem modules, and introduced comprehensive
isolated unit test suites across each subsystem:
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
- Prompt 147 (`871f6b4`): Canonical request ID header (`REQUEST_ID_HEADER_NAME`), idempotency header
  (`IDEMPOTENCY_HEADER_NAME`), and unit tests (`server/src/common/api-exception.spec.ts`,
  `server/src/common/api-exception.filter.spec.ts`, `server/src/common/response-envelope.interceptor.spec.ts`,
  `server/src/common/request-context.spec.ts`, `server/src/common/ids.spec.ts`,
  `server/src/common/tokens.spec.ts`, `server/src/common/transform.spec.ts`).
- Prompt 148 (`5aaa74a`): Canonical Postgres tenant session configuration constants (`TENANT_SESSION_CONFIGS`,
  `STATEMENT_TIMEOUT_SETTING`), Node environment tuple (`NODE_ENVS`), health status constants
  (`HEALTH_STATUS_OK`, `HEALTH_SERVICE_NAME`), and unit tests (`server/src/prisma/prisma.service.spec.ts`,
  `server/src/prisma/tenant-transaction.service.spec.ts`, `server/src/config/env.validation.spec.ts`,
  `server/src/config/acres-config.service.spec.ts`, `server/src/health/health.service.spec.ts`,
  `server/src/health/health.controller.spec.ts`, `server/src/forms/forms.service.spec.ts`,
  `server/src/forms/forms.controller.spec.ts`, `server/src/jobs/job-runs.service.spec.ts`,
  `server/src/jobs/jobs.controller.spec.ts`).

While domain services, guards, interceptors, and foundation modules now have isolated unit test coverage,
an inspection of the presentation tier reveals that the five primary core domain REST controllers lack
isolated controller unit test suites:
1. **`AuthController` (`server/src/auth/auth.controller.ts`)**:
   - Manages authentication entry points: CSRF token issuance, account registration, credential login,
     password recovery request, password reset completion, session revocation (logout), and session inspection.
   - Contains critical session cookie lifecycle logic: calling `SessionsService.writeCookie` upon registration/login,
     `SessionsService.clearCookie` on logout, and defensive orphan cookie clearing in `session()` when `sessionContext` is undefined.
   - Currently has zero direct controller unit tests.

2. **`AccountsController` (`server/src/accounts/accounts.controller.ts`)**:
   - Presentation layer for the authenticated account profile endpoint `GET /v1/account`.
   - Returns the profile from `@CurrentAccount()` directly within the standard API response envelope.
   - Currently has zero direct controller unit tests.

3. **`OrganizationsController` (`server/src/organizations/organizations.controller.ts`)**:
   - Presentation layer for multi-tenant organization lifecycle: listing, creating, fetching, renaming,
     member listing, role modification, member revocation, ownership transfer, invitation listing,
     invitation dispatch, invitation revocation, and invitation acceptance.
   - Enforces parameter validation (`ParseUUIDPipe`), idempotency header extraction, and permission checks.
   - Currently has zero direct controller unit tests.

4. **`UploadsController` (`server/src/uploads/uploads.controller.ts`)**:
   - Presentation layer for secure file uploads: initiation, completion, status lookup, cancellation,
     signed download URL generation, and real-time Server-Sent Events (`@Sse(':uploadId/events')`) stream.
   - In `uploads.controller.ts`, line 158 contains an un-exported in-line array `['accepted', 'rejected', 'cancelled', 'expired']`
     for checking terminal upload states during SSE polling. This should be codified as a canonical export
     `TERMINAL_UPLOAD_STATES` and predicate `isTerminalUploadState` in `@acres/shared`.
   - Currently has zero direct controller unit tests.

5. **`AiDraftController` (`server/src/ai/ai-draft.controller.ts`)**:
   - Presentation layer for evidence-grounded AI report draft generation: `POST /v1/reports/:reportId/revisions/:revisionId/ai-drafts`.
   - Enforces UUID validation for report and revision IDs, extracts idempotency keys, and delegates to `AiService.generateDraftProposals`.
   - Currently has zero direct controller unit tests.

Addressing these 5 core REST controllers completes comprehensive unit test coverage across the core
domain presentation layer.

## Subsystems and changes

1. `packages/shared/src/uploads.ts`:
   - Export canonical const tuple:
     ```typescript
     export const TERMINAL_UPLOAD_STATES = [
       'accepted',
       'rejected',
       'cancelled',
       'expired',
     ] as const;

     export type TerminalUploadState = (typeof TERMINAL_UPLOAD_STATES)[number];

     export function isTerminalUploadState(
       state: string,
     ): state is TerminalUploadState {
       return (TERMINAL_UPLOAD_STATES as readonly string[]).includes(state);
     }
     ```
2. `server/src/uploads/uploads.controller.ts`:
   - Import `isTerminalUploadState` and `TERMINAL_UPLOAD_STATES` from `@acres/shared`.
   - Update `terminal(state: UploadState)` to delegate to `isTerminalUploadState(state)`.
3. `server/src/auth/auth.controller.spec.ts` (NEW):
   - Isolated unit tests for `AuthController`:
     - `csrfToken`: calls `csrf.issueToken(req, res)` and returns `{ csrfToken, headerName: CSRF_HEADER_NAME }`.
     - `register`: calls `auth.register(dto)`, writes cookie via `sessions.writeCookie(res, token, expiresAt)`, returns profile.
     - `login`: calls `auth.login(dto)`, writes cookie via `sessions.writeCookie(res, token, expiresAt)`, returns profile.
     - `forgotPassword`: calls `auth.forgotPassword(dto)`, returns `{ accepted: true }`.
     - `resetPassword`: calls `auth.resetPassword(dto)`, returns `{ reset: true }`.
     - `logout`: calls `auth.logout(sessionId)`, clears cookie via `sessions.clearCookie(res)`, returns `{ signedOut: true }`.
     - `session`:
       - when session context is present, returns `auth.describe(context)` without clearing cookie.
       - when session context is absent and request has session cookie, calls `sessions.clearCookie(res)` and returns anonymous profile.
       - when session context is absent and request lacks session cookie, returns anonymous profile without calling clearCookie.
4. `server/src/accounts/accounts.controller.spec.ts` (NEW):
   - Isolated unit tests for `AccountsController`:
     - `profile`: returns the account profile supplied by `@CurrentAccount()`.
5. `server/src/organizations/organizations.controller.spec.ts` (NEW):
   - Isolated unit tests for `OrganizationsController`:
     - `list`: calls `organizations.list(account.id)`.
     - `create`: calls `organizations.create(account.id, body.name, idempotencyKey)`.
     - `get`: calls `organizations.get(organization)`.
     - `update`: calls `organizations.update(organization, body.name)`.
     - `members`: calls `organizations.members(organization)`.
     - `changeMemberRole`: calls `organizations.changeMemberRole(organization, membershipId, body.role)`.
     - `revokeMember`: calls `organizations.revokeMember(organization, membershipId)`.
     - `transferOwnership`: calls `organizations.transferOwnership(organization, body.membershipId, idempotencyKey)`.
     - `invitations`: calls `organizations.invitations(organization)`.
     - `invite`: calls `organizations.invite(organization, body.email, body.role, idempotencyKey)`.
     - `revokeInvitation`: calls `organizations.revokeInvitation(organization, invitationId)`.
     - `acceptInvitation`: calls `organizations.accept(account.id, account.email, body.token, idempotencyKey)`.
6. `server/src/uploads/uploads.controller.spec.ts` (NEW):
   - Isolated unit tests for `UploadsController`:
     - `initiate`: calls `uploads.initiate(organization, idempotencyKey, body)`.
     - `complete`: calls `uploads.complete(organization, uploadId, idempotencyKey, body)`.
     - `get`: calls `uploads.get(organization, uploadId)`.
     - `cancel`: calls `uploads.cancel(organization, uploadId, idempotencyKey)`.
     - `download`: calls `uploads.download(organization, uploadId)`.
     - `events`: subscribes to SSE observable and verifies emissions and termination on terminal upload state.
7. `server/src/ai/ai-draft.controller.spec.ts` (NEW):
   - Isolated unit tests for `AiDraftController`:
     - `generateDrafts`: calls `aiService.generateDraftProposals(organization, reportId, revisionId, body, idempotencyKey)`.
8. `docs/backend.md`:
   - Document canonical `TERMINAL_UPLOAD_STATES` and `isTerminalUploadState`.
   - Document unit test coverage across Auth, Accounts, Organizations, Uploads, and AI Draft REST controllers.

## Expected impact

- `packages/shared/src/uploads.ts`: exports `TERMINAL_UPLOAD_STATES`, `TerminalUploadState`, and `isTerminalUploadState`.
- `server/src/uploads/uploads.controller.ts`: uses canonical `isTerminalUploadState`.
- 5 new controller unit test suites:
  - `server/src/auth/auth.controller.spec.ts`
  - `server/src/accounts/accounts.controller.spec.ts`
  - `server/src/organizations/organizations.controller.spec.ts`
  - `server/src/uploads/uploads.controller.spec.ts`
  - `server/src/ai/ai-draft.controller.spec.ts`
- `docs/backend.md`: updated with controller test suites and upload state constants.
- Zero breaking contract changes (`npm run contracts:check`).

## Non-goals

- Altering route paths, HTTP verbs, or OpenAPI decorators.
- Modifying session authentication cookie flags or names.
- Changing SSE polling interval or streaming payload shape.

## Checks to run

```bash
npm run contracts:check
npm run build:shared
npm run test --workspace=@acres/server -- src/auth/auth.controller.spec.ts
npm run test --workspace=@acres/server -- src/accounts/accounts.controller.spec.ts
npm run test --workspace=@acres/server -- src/organizations/organizations.controller.spec.ts
npm run test --workspace=@acres/server -- src/uploads/uploads.controller.spec.ts
npm run test --workspace=@acres/server -- src/ai/ai-draft.controller.spec.ts
npm run test:server
npm run typecheck
npm run lint
npm run build
```

## SKILLS USED

- `api-design-principles`: REST controller contract conformity, status code semantics, and response envelopes.
- `architecture-patterns`: Clean separation between HTTP presentation layer and domain application services.
- `nestjs-best-practices`: Controller lifecycle, dependency injection mocking, and route decorator handling.
- `auth-implementation-patterns`: Session cookie issuance, clearing, CSRF token delivery, and credential lifecycle verification.
- `javascript-testing-patterns`: Isolated controller unit test suites with Jest mocks and RxJS observable testing.
- `requesting-code-review`: Structured peer review loop across newly implemented controller test suites.
- `receiving-code-review`: Technical evaluation of reviewer feedback.
- `caveman-commit`: Terse, conventional commit message on `main`.
