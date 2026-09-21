# 148 — export canonical Postgres tenant session configuration constants and Node environment tuple, and add server foundation unit tests

## Scope, and why it is next

The committed repository is on `main` at `871f6b4`
(`refactor(common): export headers and add tests`, the prompt 147 implementation).
The worktree is clean (verified this session via `git status`, clean output).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), followed by external I/O adapter hardening, canonical
tuple exports, and isolated unit testing across scanner, queue, storage, mail, AI,
parser, upload, organization/audit, accounts/auth, security, tenancy guard, and common
request/response foundation subsystems (prompts 136–147).

Prompts 136 through 147 systematically eliminated raw string literals, extracted canonical
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

While prompt 147 completed core request/response pipeline and utility testing, an inspection of
the remaining foundational modules across the server repository reveals five distinct subsystem
gaps that lack canonical runtime exports and isolated unit test coverage:

1. **Prisma & Tenant Transaction Subsystem (`server/src/prisma/`)**:
   - `server/src/prisma/tenant-transaction.service.ts` configures PostgreSQL Row Level Security (RLS)
     session variables (`acres.account_id`, `acres.organization_id`, `acres.invitation_token_hash`,
     `acres.worker_access`) and statement timeouts (`statement_timeout`) using raw string literals.
     Canonical constants (`TENANT_SESSION_CONFIGS`, `STATEMENT_TIMEOUT_SETTING`) should be formally
     exported and type-derived.
   - No isolated unit tests exist for `tenant-transaction.service.ts` or `prisma.service.ts`
     (`server/src/prisma/tenant-transaction.service.spec.ts` and `server/src/prisma/prisma.service.spec.ts` do not exist).
2. **Config & Environment Subsystem (`server/src/config/`)**:
   - In `packages/shared/src/api.ts` and `server/src/config/env.validation.ts`, the standard Node environment
     names (`'development'`, `'test'`, `'production'`) are repeatedly defined as string union literals rather
     than a canonical shared tuple (`NODE_ENVS`).
   - No isolated unit tests exist for `env.validation.ts` or `acres-config.service.ts`
     (`server/src/config/env.validation.spec.ts` and `server/src/config/acres-config.service.spec.ts` do not exist).
3. **Health & Liveness Subsystem (`server/src/health/`)**:
   - In `server/src/health/health.service.ts`, canonical health constants (`HEALTH_STATUS_OK = 'ok'`,
     `HEALTH_SERVICE_NAME = 'acres-api'`) should be exported and type-checked.
   - No isolated unit tests exist for `health.service.ts` or `health.controller.ts`
     (`server/src/health/health.service.spec.ts` and `server/src/health/health.controller.spec.ts` do not exist).
4. **Forms Subsystem (`server/src/forms/`)**:
   - `server/src/forms/forms.service.ts` persists contact submissions and issues receipts.
   - No isolated unit tests exist for `forms.service.ts` or `forms.controller.ts`
     (`server/src/forms/forms.service.spec.ts` and `server/src/forms/forms.controller.spec.ts` do not exist).
5. **Scheduled Jobs Subsystem (`server/src/jobs/`)**:
   - `server/src/jobs/job-runs.service.ts` and `jobs.controller.ts` track scheduled maintenance job runs
     and emit metrics.
   - While retention-maintenance and session-maintenance jobs have unit tests, `job-runs.service.ts`
     and `jobs.controller.ts` have no isolated unit test suite (`server/src/jobs/job-runs.service.spec.ts`
     and `server/src/jobs/jobs.controller.spec.ts` do not exist).

This prompt resolves these gaps: exporting canonical `NODE_ENVS` from `@acres/shared`, canonical
tenant session configuration constants from `tenant-transaction.service.ts`, canonical health constants
from `health.service.ts`, and introducing comprehensive isolated unit test suites across all five
subsystems.

## Reference material read for it, by path

- `packages/shared/src/api.ts`: shared API contracts and envelopes.
- `packages/shared/src/index.ts`: shared package entrypoint exports.
- `server/src/prisma/prisma.service.ts`: Prisma PostgreSQL driver adapter client and lifecycle hooks.
- `server/src/prisma/tenant-transaction.service.ts`: RLS transaction boundary and session config execution.
- `server/src/config/env.validation.ts`: boot-time environment schema, parser, and validator.
- `server/src/config/acres-config.service.ts`: typed config wrapper providing getter accessors.
- `server/src/health/health.service.ts`: liveness and dependency readiness service.
- `server/src/health/health.controller.ts`: liveness and readiness HTTP route handlers.
- `server/src/forms/forms.service.ts`: contact submission recorder.
- `server/src/forms/forms.controller.ts`: public `/forms/contact` HTTP handler.
- `server/src/jobs/job-runs.service.ts`: scheduled job run bookkeeping and metric dispatcher.
- `server/src/jobs/jobs.controller.ts`: protected `/jobs/runs` HTTP route handler.
- `docs/backend.md`: Section 4 ("Envelopes, errors and request context"), Section 8 ("PostgreSQL and PostGIS").
- `docs/security.md`: Tenant isolation boundary, RLS session configuration, and error masking.

## Changes to implement

1. `packages/shared/src/api.ts`:
   - Export canonical `NODE_ENVS` tuple and derived type:
     ```ts
     export const NODE_ENVS = ['development', 'test', 'production'] as const;
     export type NodeEnv = (typeof NODE_ENVS)[number];
     ```
2. `server/src/prisma/tenant-transaction.service.ts`:
   - Export canonical `TENANT_SESSION_CONFIGS` and `STATEMENT_TIMEOUT_SETTING`:
     ```ts
     export const TENANT_SESSION_CONFIGS = [
       'acres.account_id',
       'acres.organization_id',
       'acres.invitation_token_hash',
       'acres.worker_access',
     ] as const;
     export type TenantSessionConfig = (typeof TENANT_SESSION_CONFIGS)[number];

     export const STATEMENT_TIMEOUT_SETTING = 'statement_timeout' as const;
     export type StatementTimeoutSetting = typeof STATEMENT_TIMEOUT_SETTING;
     ```
3. `server/src/health/health.service.ts`:
   - Export canonical `HEALTH_STATUS_OK` and `HEALTH_SERVICE_NAME`:
     ```ts
     export const HEALTH_STATUS_OK = 'ok' as const;
     export type HealthStatusOk = typeof HEALTH_STATUS_OK;

     export const HEALTH_SERVICE_NAME = 'acres-api' as const;
     export type HealthServiceName = typeof HEALTH_SERVICE_NAME;
     ```
4. `server/src/config/env.validation.ts`:
   - Import `NODE_ENVS` and `NodeEnv` from `@acres/shared` and use in `AcresEnv['nodeEnv']` and validation logic.
5. `server/src/prisma/prisma.service.spec.ts` (NEW):
   - Unit tests covering `PrismaService`:
     - Constructor properly instantiates adapter with `databaseUrl`.
     - `onModuleDestroy()` and `onApplicationShutdown()` trigger `$disconnect()`.
     - Error handling during `$disconnect()` catches and logs warning via logger without throwing.
6. `server/src/prisma/tenant-transaction.service.spec.ts` (NEW):
   - Unit tests covering `TenantTransactionService`:
     - `accountScoped`: invokes `$transaction`, executes `set_config` with accountId and empty org/invitation/worker_access, returns callback result.
     - `organizationScoped`: invokes `$transaction`, sets accountId and organizationId, returns callback result.
     - `invitationScoped`: invokes `$transaction`, sets accountId and invitationTokenHash, returns callback result.
     - `workerScoped`: sets worker_access to `'true'`, returns callback result.
     - Statement timeout: when `statementTimeoutMs` option is passed, executes `statement_timeout` config.
     - Error propagation: callback rejections propagate out and abort transaction.
7. `server/src/config/env.validation.spec.ts` (NEW):
   - Unit tests covering `validateEnv`:
     - Throws when required env variables are missing (`DATABASE_URL`, `CLIENT_ORIGIN`, `SESSION_SECRET`).
     - Parses valid minimum environment with all expected defaults.
     - Validates `NODE_ENV`: accepts valid values, throws on invalid values.
     - Enforces production session secret minimum length (32 chars) when `NODE_ENV === 'production'`.
     - Validates integer parsers: positive integers pass, non-integers and non-positive numbers throw.
     - Validates boolean parsers: `'true'` and `'false'` map to booleans, others throw.
     - Validates CSV parsers: splits and trims strings into array, empty string throws.
     - Validates AI draft constraints: when enabled, requires API key or unpaid tier acknowledgement.
8. `server/src/config/acres-config.service.spec.ts` (NEW):
   - Unit tests covering `AcresConfigService`:
     - Verifies getters delegate to `ConfigService.get(key, { infer: true })` for all config properties.
9. `server/src/health/health.service.spec.ts` (NEW) and `health.controller.spec.ts` (NEW):
   - Unit tests covering `HealthService` and `HealthController`:
     - `HealthService.check()`: returns `{ status: 'ok', service: 'acres-api', version, uptimeSeconds }`.
     - `HealthService.readiness()`: calls `$queryRaw` and `storage.readiness()`. Returns status ok when both succeed. Throws when storage is not ready or query fails.
     - `HealthController.check()`: calls service and returns liveness payload.
     - `HealthController.ready()`: calls service, returns readiness payload or catches error and throws `ApiException.notReady()`.
10. `server/src/forms/forms.service.spec.ts` (NEW) and `forms.controller.spec.ts` (NEW):
    - Unit tests covering `FormsService` and `FormsController`:
      - `FormsService.recordContact`: calls `prisma.contactSubmission.create` with mapped fields and default contact source fallback; returns receipt `{ id, receivedAt }`.
      - `FormsController.contact`: invokes service with DTO and returns receipt.
11. `server/src/jobs/job-runs.service.spec.ts` (NEW) and `jobs.controller.spec.ts` (NEW):
    - Unit tests covering `JobRunsService` and `JobsController`:
      - `JobRunsService.start`: creates running job run record and calls `metrics.recordJobRun` (when present); returns run id.
      - `JobRunsService.finish`: updates job run with status, finish time, and message; records metric.
      - `JobRunsService.listRecent`: fetches recent runs with default or custom limit; maps dates to ISO format.
      - `JobsController.listRuns`: calls service and returns summaries.
12. `docs/backend.md`:
    - Document canonical constants (`NODE_ENVS`, `TENANT_SESSION_CONFIGS`, `STATEMENT_TIMEOUT_SETTING`, `HEALTH_STATUS_OK`, `HEALTH_SERVICE_NAME`).
    - Document isolated unit test coverage across Prisma, Config, Health, Forms, and Job Runs subsystems.

## Expected impact

- `packages/shared/src/api.ts`: exports canonical `NODE_ENVS` and `NodeEnv`.
- `server/src/prisma/tenant-transaction.service.ts`: exports canonical `TENANT_SESSION_CONFIGS` and `STATEMENT_TIMEOUT_SETTING`.
- `server/src/health/health.service.ts`: exports canonical `HEALTH_STATUS_OK` and `HEALTH_SERVICE_NAME`.
- `server/src/config/env.validation.ts`: consumes canonical `NODE_ENVS`.
- 10 new unit test suites:
  - `server/src/prisma/prisma.service.spec.ts`
  - `server/src/prisma/tenant-transaction.service.spec.ts`
  - `server/src/config/env.validation.spec.ts`
  - `server/src/config/acres-config.service.spec.ts`
  - `server/src/health/health.service.spec.ts`
  - `server/src/health/health.controller.spec.ts`
  - `server/src/forms/forms.service.spec.ts`
  - `server/src/forms/forms.controller.spec.ts`
  - `server/src/jobs/job-runs.service.spec.ts`
  - `server/src/jobs/jobs.controller.spec.ts`
- `docs/backend.md`: documentation updated for newly covered subsystems.
- Zero breaking changes to API contracts or database schema (`npm run contracts:check`).

## Non-goals

- Altering RLS policy logic or PostgreSQL session parameter keys.
- Changing environment variable names or default values.
- Modifying public health endpoint schema or status contracts.

## Checks to run

```bash
npm run contracts:check
npm run build:shared
npm run test --workspace=@acres/server -- src/prisma/prisma.service.spec.ts
npm run test --workspace=@acres/server -- src/prisma/tenant-transaction.service.spec.ts
npm run test --workspace=@acres/server -- src/config/env.validation.spec.ts
npm run test --workspace=@acres/server -- src/config/acres-config.service.spec.ts
npm run test --workspace=@acres/server -- src/health/health.service.spec.ts
npm run test --workspace=@acres/server -- src/health/health.controller.spec.ts
npm run test --workspace=@acres/server -- src/forms/forms.service.spec.ts
npm run test --workspace=@acres/server -- src/forms/forms.controller.spec.ts
npm run test --workspace=@acres/server -- src/jobs/job-runs.service.spec.ts
npm run test --workspace=@acres/server -- src/jobs/jobs.controller.spec.ts
npm run test:server
npm run typecheck
npm run lint
npm run build
```

## SKILLS USED

- `api-design-principles`: Health check contracts, environment contracts, and receipt schemas.
- `architecture-patterns`: Separation of concerns between configuration, persistence, domain services, and HTTP presentation layers.
- `nestjs-best-practices`: NestJS lifecycle hooks (`OnModuleDestroy`, `OnApplicationShutdown`), controller decorators, guard composition, and dependency injection tokens.
- `postgres-best-practices`: PostgreSQL session settings (`set_config`), statement timeouts, and transactional isolation boundaries.
- `security-best-practices`: RLS session context hygiene, unhandled exception masking, and credential validation in configuration.
- `javascript-testing-patterns`: Isolated Jest unit test suites with mock providers, execution context mocking, and error simulation.
- `requesting-code-review`: Structured peer review loop across newly implemented test suites.
- `receiving-code-review`: Technical verification of reviewer feedback.
- `caveman-commit`: Terse, conventional commit message on `main`.
