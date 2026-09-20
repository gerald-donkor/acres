# 146 — export canonical organization header constant and permissions tuple, and add SessionGuard, OrganizationContextGuard, and PermissionGuard unit tests

## Scope, and why it is next

The committed repository is on `main` at `0b9f920`
(`refactor(security): export tuples and add tests`, the prompt 145 implementation).
The worktree is clean (verified this session via `git status`, clean output).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), followed by dependency-safe external I/O adapter hardening,
canonical tuple exports, and isolated unit testing across scanner, queue, storage, mail,
AI, parser, upload, organization/audit, accounts/auth, and security subsystems (prompts 136–145).

Prompts 136 through 145 systematically eliminated raw string literals, extracted canonical
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

While prompt 145 established isolated testing and canonical typing for `CsrfService` and
`AcresThrottlerGuard`, an inspection of the remaining authentication, session, and tenancy
guard enforcement layer reveals the following residual gaps:

1. In `packages/shared/src/organizations.ts`, the canonical HTTP header name used to convey
   active organization context across the monorepo (`'x-acres-organization-id'`) is NOT
   exported as a canonical constant. Instead, it is hardcoded as raw string literals across
   client API clients (`client/lib/api/browser.ts:66`, `client/lib/api/server.ts:39`,
   `client/lib/api/sse.ts:102`), client proxy handlers (`client/app/api/v1/[...path]/route.ts:9`),
   and the server's tenant guard (`server/src/organizations/organization-context.guard.ts:64`).
   A canonical constant and derived type (`ORGANIZATION_HEADER_NAME = 'x-acres-organization-id' as const`,
   `OrganizationHeaderName = typeof ORGANIZATION_HEADER_NAME`) belong in `packages/shared/src/organizations.ts`
   and re-exported via `packages/shared/src/index.ts`.
2. In `server/src/organizations/permissions.ts`, the canonical list of organization permissions
   (`ORGANIZATION_PERMISSIONS = ['organization.read', ...] as const`) and type
   `OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number]` are declared locally in
   the server package rather than in `@acres/shared/src/organizations.ts`. Because permissions
   represent core domain and tenancy contracts that govern client navigation visibility and API
   capabilities, they belong canonically in `@acres/shared`, with `server/src/organizations/permissions.ts`
   re-exporting them for seamless backwards compatibility.
3. In `server/src/sessions/session.guard.ts`, `SessionGuard` and `OptionalSessionGuard` enforce
   session cookie inspection, session token resolution against `SessionsService`, request context
   attachment (`request.sessionContext`), and authentication rejection (`ApiException.unauthenticated()`).
   Furthermore, `server/src/sessions/current-account.decorator.ts` extracts the authenticated account
   profile or fails unauthenticated. Currently, NO isolated unit tests exist for `SessionGuard`,
   `OptionalSessionGuard`, or `@CurrentAccount()` (`server/src/sessions/session.guard.spec.ts` does
   not exist).
4. In `server/src/organizations/organization-context.guard.ts`, `OrganizationContextGuard` enforces
   tenancy readiness (`config.tenancyEnabled`), extracts and validates organization IDs from route
   parameters or HTTP headers (`x-acres-organization-id`), verifies UUID formatting, resolves active
   membership through `TenantTransactionService.accountScoped` (`tx.membership.findFirst({ where: { organizationId, accountId, revokedAt: null } })`),
   and populates `request.organizationContext` (rejecting with `ApiException.notFound('Organization not found.')`
   on invalid UUID, conflict, or non-member requests). Furthermore, `server/src/organizations/current-organization.decorator.ts`
   extracts `request.organizationContext`. Currently, NO isolated unit tests exist for
   `OrganizationContextGuard` or `@CurrentOrganization()` (`server/src/organizations/organization-context.guard.spec.ts`
   does not exist).
5. In `server/src/organizations/permission.guard.ts`, `PermissionGuard` inspects metadata via
   `Reflector` (`ORGANIZATION_PERMISSION_KEY`), validates that `request.organizationContext` is
   present on the incoming request, and enforces RBAC authorization via `OrganizationPolicy.has(role, permission)`,
   throwing `ApiException.forbidden()` when the caller's role lacks the required permission. Currently,
   NO isolated unit tests exist for `PermissionGuard` (`server/src/organizations/permission.guard.spec.ts`
   does not exist).

This prompt resolves these gaps: exporting canonical `ORGANIZATION_HEADER_NAME` and
`ORGANIZATION_PERMISSIONS` from `@acres/shared`, wiring services and client adapters to consume them,
and introducing comprehensive isolated unit test suites for `SessionGuard`, `OptionalSessionGuard`,
`OrganizationContextGuard`, and `PermissionGuard`.

## Reference material read for it, by path

- `packages/shared/src/organizations.ts`: shared organization roles, audit actions, and contract types.
- `packages/shared/src/index.ts`: shared package exports.
- `server/src/sessions/session.guard.ts`: `SessionGuard`, `OptionalSessionGuard`, and `attachSession` helper.
- `server/src/sessions/authenticated-request.ts`: `SessionContext`, `RequestWithSession`, and `AuthenticatedRequest`.
- `server/src/sessions/current-account.decorator.ts`: `@CurrentAccount()` param decorator.
- `server/src/organizations/organization-context.guard.ts`: `OrganizationContextGuard` and UUID validation.
- `server/src/organizations/organization-context.ts`: `OrganizationContext` and `RequestWithOrganization`.
- `server/src/organizations/current-organization.decorator.ts`: `@CurrentOrganization()` param decorator.
- `server/src/organizations/permissions.ts`: `ORGANIZATION_PERMISSIONS`, `RequiresOrganizationPermission`, and `OrganizationPolicy`.
- `server/src/organizations/permission.guard.ts`: `PermissionGuard` RBAC evaluation.
- `client/lib/api/browser.ts`: browser client API request initialization.
- `client/lib/api/server.ts`: server-side Next client API request initialization.
- `client/lib/api/sse.ts`: browser SSE connection options.
- `client/app/api/v1/[...path]/route.ts`: Next same-origin reverse proxy header forwarding.
- `docs/backend.md`: Section 3 ("Module and route map") and Section 4 ("Auth, sessions and hashing").
- `docs/security.md`: Authentication, tenancy isolation, and RBAC threat boundaries.
- `docs/build-plan.md`: Phase 3 ("Organizations, permissions, and RLS") and Phase 4 ("Versioned REST and GraphQL contracts").

## Changes to implement

1. `packages/shared/src/organizations.ts`:
   - Export canonical organization header name constant and type:
     ```ts
     export const ORGANIZATION_HEADER_NAME = 'x-acres-organization-id' as const;
     export type OrganizationHeaderName = typeof ORGANIZATION_HEADER_NAME;
     ```
   - Export canonical organization permissions tuple and type:
     ```ts
     export const ORGANIZATION_PERMISSIONS = [
       'organization.read',
       'organization.update',
       'members.read',
       'members.invite',
       'members.change_role',
       'members.revoke',
       'ownership.transfer',
       'invitations.read',
       'invitations.revoke',
       'audit.read',
       'uploads.read',
       'uploads.create',
       'datasets.read',
       'datasets.create',
       'datasets.update',
       'ingestion.read',
       'ingestion.run',
       'ingestion.cancel',
       'analytics.read',
       'dashboards.manage',
       'reports.read',
       'reports.create',
       'reports.update',
       'reports.publish',
       'exports.create',
       'exports.read',
       'jobs.read',
     ] as const;

     export type OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number];
     ```
2. `server/src/organizations/permissions.ts`:
   - Re-export `ORGANIZATION_PERMISSIONS` and `OrganizationPermission` from `@acres/shared` for seamless backwards compatibility:
     ```ts
     export {
       ORGANIZATION_PERMISSIONS,
       type OrganizationPermission,
     } from '@acres/shared';
     ```
3. `server/src/organizations/organization-context.guard.ts`:
   - Import `ORGANIZATION_HEADER_NAME` from `@acres/shared`.
   - Update `organizationIdFrom`:
     ```ts
     const header = request.header(ORGANIZATION_HEADER_NAME);
     ```
4. Client integration for canonical header name:
   - In `client/lib/api/browser.ts`: import `ORGANIZATION_HEADER_NAME` from `@acres/shared` and use in `headers.set(ORGANIZATION_HEADER_NAME, init.organizationId)`.
   - In `client/lib/api/server.ts`: import `ORGANIZATION_HEADER_NAME` from `@acres/shared` and use in `headers.set(ORGANIZATION_HEADER_NAME, organizationId)`.
   - In `client/lib/api/sse.ts`: import `ORGANIZATION_HEADER_NAME` from `@acres/shared` and use in `headers.set(ORGANIZATION_HEADER_NAME, options.organizationId)`.
   - In `client/app/api/v1/[...path]/route.ts`: import `ORGANIZATION_HEADER_NAME` from `@acres/shared` and include in forwardable headers list.
5. `server/src/sessions/session.guard.spec.ts` (NEW):
   - Unit tests covering `SessionGuard`:
     - Missing cookie: request has no cookies property or no cookie named `config.sessionCookieName` -> throws `ApiException.unauthenticated()`.
     - Empty cookie: cookie string is empty (`''`) -> throws `ApiException.unauthenticated()`.
     - Non-string cookie: cookie value is non-string -> throws `ApiException.unauthenticated()`.
     - Unresolved token: `sessions.resolve(token)` returns `null` -> throws `ApiException.unauthenticated()`.
     - Successful authentication: `sessions.resolve(token)` returns valid `SessionContext` -> attaches `request.sessionContext = session` and returns `true`.
     - Configuration adherence: honors custom `config.sessionCookieName` (e.g. `'custom_session'`).
   - Unit tests covering `OptionalSessionGuard`:
     - Missing cookie -> allows request, returns `true`, and leaves `request.sessionContext` undefined.
     - Unresolved/invalid token -> allows request, returns `true`, and leaves `request.sessionContext` undefined.
     - Valid session token -> attaches `request.sessionContext = session` and returns `true`.
   - Unit tests covering `@CurrentAccount()` decorator:
     - Extracts `account` from `request.sessionContext`.
     - Throws `ApiException.unauthenticated()` when `request.sessionContext` is undefined.
6. `server/src/organizations/organization-context.guard.spec.ts` (NEW):
   - Unit tests covering `OrganizationContextGuard`:
     - Tenancy disabled (`config.tenancyEnabled = false`): throws `ApiException.notReady()` immediately without accessing request parameters or database.
     - Organization ID resolution:
       - Missing from both route param (`request.params.organizationId`) and header (`ORGANIZATION_HEADER_NAME`): logs warning and throws `ApiException.notFound('Organization not found.')`.
       - Present only in `request.params.organizationId` (valid UUID): resolves successfully.
       - Present only in `request.header(ORGANIZATION_HEADER_NAME)` (valid UUID): resolves successfully, trimming surrounding whitespace.
       - Present in both `params` and `header` with matching UUID: resolves successfully.
       - Present in both `params` and `header` with conflicting UUIDs: logs warning and throws `ApiException.notFound('Organization not found.')`.
       - Array param value (`request.params.organizationId` is string array): ignores array param and falls back to header if available.
       - Malformed UUID (e.g. non-hex, invalid length, arbitrary string): logs warning and throws `ApiException.notFound('Organization not found.')`.
     - Tenant membership resolution:
       - Extracts `accountId` from `request.sessionContext.account.id`.
       - Executes `tenants.accountScoped(accountId, callback)` and passes scoped transaction finder querying `{ where: { organizationId, accountId, revokedAt: null } }`.
       - When membership query returns `null` (not a member or membership revoked): logs warning and throws `ApiException.notFound('Organization not found.')`.
       - When active membership is found: attaches `request.organizationContext = { organizationId, accountId, membershipId: membership.id, role: membership.role }` and returns `true`.
   - Unit tests covering `@CurrentOrganization()` decorator:
     - Returns `request.organizationContext` when defined.
     - Throws `Error('Organization context was not resolved')` when undefined.
7. `server/src/organizations/permission.guard.spec.ts` (NEW):
   - Unit tests covering `PermissionGuard`:
     - When no permission metadata is present on handler or controller class: returns `true` immediately.
     - When handler has permission metadata (`ORGANIZATION_PERMISSION_KEY`):
       - If `request.organizationContext` is undefined: throws `ApiException.notFound('Organization not found.')`.
       - If role possesses permission according to `OrganizationPolicy.has(role, permission)`: returns `true`.
       - If role lacks permission: logs warning and throws `ApiException.forbidden()`.
     - When class has permission metadata: evaluates class metadata when handler metadata is undefined.
     - When handler has permission metadata that overrides class metadata: applies handler metadata override (`reflector.getAllAndOverride`).
     - Role permission boundaries:
       - `owner` possesses all permissions.
       - `admin` possesses administrative, member, and report permissions, but lacks `ownership.transfer`.
       - `analyst` possesses dataset and report creation/update permissions, but lacks member administration.
       - `viewer` possesses read permissions (`reports.read`, `analytics.read`, `datasets.read`), but lacks mutation permissions (`reports.publish`, `uploads.create`).
8. `docs/backend.md`:
   - Document canonical `ORGANIZATION_HEADER_NAME` and `ORGANIZATION_PERMISSIONS` in Section 3 and Section 4.
   - Document unit test coverage for `SessionGuard`, `OptionalSessionGuard`, `CurrentAccount`, `OrganizationContextGuard`, `CurrentOrganization`, and `PermissionGuard`.

## Expected impact

- `packages/shared/src/organizations.ts`: exports canonical `ORGANIZATION_HEADER_NAME`, `OrganizationHeaderName`, `ORGANIZATION_PERMISSIONS`, and `OrganizationPermission`.
- `server/src/organizations/permissions.ts`: re-exports permissions from `@acres/shared`.
- `server/src/organizations/organization-context.guard.ts`: consumes canonical `ORGANIZATION_HEADER_NAME`.
- `client/lib/api/browser.ts`, `client/lib/api/server.ts`, `client/lib/api/sse.ts`, `client/app/api/v1/[...path]/route.ts`: consume canonical `ORGANIZATION_HEADER_NAME`.
- `server/src/sessions/session.guard.spec.ts`: complete unit test suite for `SessionGuard`, `OptionalSessionGuard`, and `@CurrentAccount()`.
- `server/src/organizations/organization-context.guard.spec.ts`: complete unit test suite for `OrganizationContextGuard` and `@CurrentOrganization()`.
- `server/src/organizations/permission.guard.spec.ts`: complete unit test suite for `PermissionGuard` and RBAC matrix enforcement.
- `docs/backend.md`: updated documentation reflecting canonical exports and guard test coverage.
- Zero breaking changes to public REST or GraphQL API contracts (`npm run contracts:check`).
- Zero database schema or migration changes.

## Non-goals

- Modifying session hashing algorithms, token generation, or cookie security flags.
- Altering the role-to-permission mapping defined in `OrganizationPolicy`.
- Changing database RLS policies or transaction isolation levels.

## Checks to run

```bash
npm run contracts:check
npm run build:shared
npm run test --workspace=@acres/server -- src/sessions/session.guard.spec.ts
npm run test --workspace=@acres/server -- src/organizations/organization-context.guard.spec.ts
npm run test --workspace=@acres/server -- src/organizations/permission.guard.spec.ts
npm run test:server
npm run typecheck
npm run lint
npm run build
```

## SKILLS USED

- `nestjs-best-practices`: NestJS guard lifecycle, `CanActivate`, `ExecutionContext`, `Reflector` metadata extraction, parameter decorators, and modular provider configuration.
- `auth-implementation-patterns`: Session authentication, cookie handling, organization multi-tenancy, and RBAC permission evaluation.
- `security-best-practices`: Fail-closed security boundaries, organization tenant isolation, UUID format validation, and least privilege access control.
- `error-handling-patterns`: Consistent `ApiException` error responses (unauthenticated, notFound, forbidden, notReady).
- `javascript-testing-patterns`: Isolated unit test suites using Jest, mocking NestJS `ExecutionContext`, `Reflector`, Express `Request`, and `TenantTransactionService`.
- `requesting-code-review`: Structured code review with dedicated reviewer subagent.
- `receiving-code-review`: Technical evaluation of review findings.
- `caveman-commit`: Terse, conventional commit message on `main`.
