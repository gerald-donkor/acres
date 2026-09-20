# 143 — export canonical audit actions tuple and add AuditService and OrganizationsService unit tests

## Scope, and why it is next

The committed repository is on `main` at `a12f3ca`
(`refactor(uploads): export tuples and add tests`, the prompt 142 implementation).
The worktree is clean (verified this session via `git status --short`, empty output).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), followed by dependency-safe external I/O adapter hardening,
canonical tuple exports, and isolated unit testing across scanner, queue, storage, mail,
AI, parser, and upload subsystems (prompts 136–142).

Prompts 136 through 142 established consistent, robust architecture patterns across
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

An inspection of the organization and audit subsystems (`packages/shared/src/organizations.ts`,
`server/src/organizations/audit.service.ts`, and `server/src/organizations/organizations.service.ts`, Phase 3 / Phase 4)
reveals the following residual gaps:

1. In `packages/shared/src/organizations.ts`, `ORGANIZATION_ROLES` is exported as a canonical const tuple,
   but `AuditAction` is not represented in the shared package. The 10 canonical audit actions defined
   in PostgreSQL and Prisma schema (`server/prisma/schema.prisma:296-307`):
   `organization_created`, `organization_updated`, `invitation_issued`, `invitation_revoked`,
   `invitation_accepted`, `membership_role_changed`, `membership_revoked`, `ownership_transferred`,
   `report_published`, `export_requested`
   lack an exported canonical const tuple `AUDIT_ACTIONS` and derived type `AuditAction` in `@acres/shared`.
   Additionally, `OrganizationAuditEvent` is not explicitly exported for cross-package audit consumer contracts.
2. In `server/src/organizations/audit.service.ts` and `server/src/organizations/organizations.service.ts`,
   `AuditAction` is imported from generated Prisma client internal paths (`../generated/prisma/enums`)
   rather than the canonical `@acres/shared` contract.
3. In `server/src/organizations/audit.service.ts`, `AuditService` encapsulates critical security logic
   around audit event persistence and strict metadata detail sanitization (`allowedDetailsByAction` mapping,
   `Object.hasOwn` property verification, stripping unapproved keys to prevent metadata leaks). However,
   `AuditService` lacks dedicated, isolated unit testing (`server/src/organizations/audit.service.spec.ts` does not exist).
4. In `server/src/organizations/organizations.service.ts`, `OrganizationsService` orchestrates the entire
   organization lifecycle: organization creation and update, membership roles and revocation, invitation issuance
   with SHA-256 token hashing and 24h expiration, non-blocking email delivery, atomic single-use invitation acceptance,
   row-locked ownership transfer (`SELECT ... FOR UPDATE`), and RLS session parameter switching (`app.current_organization_id`).
   Despite being the core tenant isolation boundary, `OrganizationsService` lacks dedicated unit testing
   (`server/src/organizations/organizations.service.spec.ts` does not exist).

This prompt resolves these gaps, completing the canonical tuple exports, contract typing,
and isolated unit test coverage for the organizations and audit subsystems.

## Changes to implement

1. `packages/shared/src/organizations.ts`:
   - Export canonical runtime const tuple `AUDIT_ACTIONS`:
     ```ts
     export const AUDIT_ACTIONS = [
       "organization_created",
       "organization_updated",
       "invitation_issued",
       "invitation_revoked",
       "invitation_accepted",
       "membership_role_changed",
       "membership_revoked",
       "ownership_transferred",
       "report_published",
       "export_requested",
     ] as const;

     export type AuditAction = (typeof AUDIT_ACTIONS)[number];
     ```
   - Export `OrganizationAuditEvent` interface:
     ```ts
     export interface OrganizationAuditEvent {
       id: string;
       action: AuditAction;
       targetType: string;
       targetId: string | null;
       actorAccountId: string | null;
       createdAt: string;
     }
     ```
2. `server/src/organizations/audit.service.ts`:
   - Update imports to consume `AuditAction` from `@acres/shared`.
3. `server/src/organizations/organizations.service.ts`:
   - Update imports to consume `AuditAction` and `OrganizationRole` from `@acres/shared`.
4. `server/src/organizations/audit.service.spec.ts`:
   - Create comprehensive unit test suite covering:
     - Successful audit event creation with `tx.auditEvent.create`.
     - Exact details sanitization for all actions with allowed fields (`membership_role_changed`, `ownership_transferred`, `invitation_issued`, `invitation_accepted`, `report_published`, `export_requested`).
     - Handling of actions with no allowed details (returning `undefined` for details).
     - Filtering out forbidden or unexpected fields while preserving allowed fields.
     - Handling of `null` and `undefined` details inputs.
5. `server/src/organizations/organizations.service.spec.ts`:
   - Create comprehensive unit test suite covering:
     - `ensureEnabled`: Throws 503 `notReady` when tenancy is disabled.
     - `list`: Lists active organizations for account ordered by `createdAt: asc`.
     - `create`: Creates organization with owner membership, idempotency, and audit event.
     - `get`: Retrieves organization with active membership or throws 404.
     - `update`: Updates organization name, checks `organization.update` permission, and logs audit.
     - `listMembers`: Lists active members or throws 403/404.
     - `changeMemberRole`: Updates member role, enforces permission matrix (`canAssignRole`), prevents self-demotion from owner, and logs audit.
     - `revokeMembership`: Soft-deletes member (`revokedAt`), prevents owner self-revocation, and logs audit.
     - `invitations`: Lists organization invitations without leaking `tokenHash`.
     - `invite`: Hashes raw token with SHA-256, cleans up expired invitations, sets 24h expiration, sends invitation email, handles email failure non-blockingly, and prevents inviting owners or duplicate live invitations.
     - `revokeInvitation`: Revokes pending invitation, prevents revoking accepted invitations, and handles idempotency.
     - `accept`: Validates token hash via `invitationScoped`, executes atomic update to claim invitation, reactivates previous memberships or creates new membership, and prevents active member collisions.
     - `transferOwnership`: Enforces owner-only permission, locks organization row with `SELECT ... FOR UPDATE`, promotes target to owner, demotes actor to admin, prevents self-transfer, and logs audit.
6. `docs/backend.md`:
   - Document `AUDIT_ACTIONS` tuple export and `AuditService` / `OrganizationsService` unit test coverage in Section 14.

## Verification

- `npm run contracts:check`: verifies no OpenAPI or GraphQL drift.
- `npm run build:shared`: builds shared package with new exports.
- `npm run test --workspace=@acres/server -- src/organizations/audit.service.spec.ts`: passes all audit service unit tests.
- `npm run test --workspace=@acres/server -- src/organizations/organizations.service.spec.ts`: passes all organization service unit tests.
- `npm run test:server`: passes full server test suite without regression.
- `npm run typecheck`: passes typechecking across client, server, and shared workspaces.
- `npm run lint`: passes linting with zero warnings or errors.
- `npm run build`: builds client, server, and shared workspaces cleanly.

## Non-goals

- No changes to database migrations or Prisma schema (schema already has `AuditAction` enum with exact 10 values).
- No changes to public HTTP route paths or contracts.
- No modifications to client-side UI components.

## SKILLS USED

- `nestjs-best-practices`
- `javascript-testing-patterns`
- `error-handling-patterns`
- `auth-implementation-patterns`
- `requesting-code-review`
- `receiving-code-review`
- `caveman-commit`
