# 156 — export upload media types and assignable roles, wire canonical DTO validation schemas, and add unit tests across all DTOs, contract generation, and analytics plan checks

## Scope, and why it is next

The committed repository is on `main` at `3142a00`
(`test(contracts): test shared predicates and limits`, the prompt 155 implementation).
The worktree is clean (verified via `git status`, clean working tree).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate, followed by isolated unit testing across external I/O adapters,
domain repositories, REST controllers, GraphQL query budgeting, decorators, and shared contracts
(prompts 136–155).

Following Prompt 155's predicate coverage, the remaining gaps in isolated unit tests,
canonical tuple definitions, and DTO validation enforcement are:

1. **`packages/shared/src/uploads.ts`**:
   - Codify canonical const tuple `UPLOAD_MEDIA_TYPES`:
     `['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/geo+json', 'application/json'] as const`.
   - Export type `UploadMediaType = (typeof UPLOAD_MEDIA_TYPES)[number]`.
   - Export type predicate `isUploadMediaType(type: unknown): type is UploadMediaType`.
2. **`packages/shared/src/organizations.ts`**:
   - Codify canonical const tuple `ASSIGNABLE_ROLES`:
     `['admin', 'analyst', 'viewer'] as const`.
   - Export type `AssignableRole = (typeof ASSIGNABLE_ROLES)[number]`.
   - Export type predicate `isAssignableRole(role: unknown): role is AssignableRole`.
3. **`server/src/uploads/dto/initiate-upload.dto.ts`**:
   - Replace private `MEDIA_TYPES` with `UPLOAD_MEDIA_TYPES` from `@acres/shared`.
4. **`server/src/organizations/dto.ts`**:
   - Replace local `assignableRoles = ORGANIZATION_ROLES.filter(...)` with `ASSIGNABLE_ROLES` from `@acres/shared`.
5. **`server/src/dashboards/dto/dashboard-view.dto.ts`**:
   - Replace hardcoded `['bar', 'line', 'table']` and `['region', 'period']` with canonical `DASHBOARD_PRESENTATION_CHARTS` and `DASHBOARD_COMPARE_BY_OPTIONS` from `@acres/shared`.
6. **`server/src/reports/dto/report.dto.ts`**:
   - Replace hardcoded `['csv', 'pdf']` with canonical `EXPORT_FORMATS` from `@acres/shared`.
7. **`server/src/analytics/seed/check-analytics-plans.ts`**:
   - Export `buildAnalyticsPlanQueries` and `redactUrl` to match the testable contract established in `check-geography-plans.ts`.
8. **`server/src/contracts/generate-contracts.ts`**:
   - Export `stableStringify`, `sortValue`, and `ensureContractEnv`.
9. **`server/src/contracts/generate-contracts.spec.ts`** (NEW):
   - Isolated unit tests for `stableStringify`, `sortValue` (deep sorting, undefined omission, array order preservation), and `ensureContractEnv`.
10. **`server/src/analytics/seed/check-analytics-plans.spec.ts`** (NEW):
    - Isolated unit tests for `buildAnalyticsPlanQueries` (SQL syntax, parameter bindings, LIMIT clauses, index alignment) and `redactUrl`.
11. **Comprehensive DTO validation test suites**:
    - `server/src/auth/dto/auth-dto.spec.ts` (NEW):
      - Validate `LoginDto`, `RegisterAccountDto`, `ForgotPasswordDto`, `ResetPasswordDto` with transforms, email lowercasing/trimming, length checks, and error constraints.
    - `server/src/organizations/dto/organizations-dto.spec.ts` (NEW):
      - Validate `CreateOrganizationDto`, `UpdateOrganizationDto`, `InviteMemberDto`, `ChangeMemberRoleDto`, `TransferOwnershipDto`, `AcceptInvitationDto` with role validation and trim transforms.
    - `server/src/uploads/dto/uploads-dto.spec.ts` (NEW):
      - Validate `InitiateUploadDto`, `CompleteUploadDto` with media type whitelist, byte limits (1..52,428,800), and checksumHex hex pattern.
    - `server/src/forms/dto/forms-dto.spec.ts` (NEW):
      - Validate `ContactSubmissionDto` with email normalization, name/message bounds, and optional organization/source.
    - `server/src/ingestion/dto/ingestion-dto.spec.ts` (NEW):
      - Validate `CreateDatasetDto`, `UpdateDatasetDto`, `CreateMappingDto`, `StartIngestionRunDto` with length bounds and UUID constraints.
    - `server/src/analytics/dto/analytics-dto.spec.ts` (NEW):
      - Validate `MetricParamDto`, `AggregateParamDto`, `AnalyticsObservationQueryDto`, `AnalyticsAggregateQueryDto` with UUIDs, ISO8601 dates, hash regex, and limit bounds.
    - `server/src/dashboards/dto/dashboards-dto.spec.ts` (NEW):
      - Validate `DashboardFiltersDto`, `DashboardPresentationDto`, `CreateDashboardViewDto`, `UpdateDashboardViewDto` with nested validation and presentation enums.
    - `server/src/reports/dto/reports-dto.spec.ts` (NEW):
      - Validate `ReportInsightDto`, `ReportEvidenceDto`, `CreateReportDto`, `UpdateReportDto`, `UpdateRevisionDto`, `CreateRevisionDto`, `CreateExportDto` with nested arrays and export formats.
    - `server/src/ai/dto/ai-draft-dto.spec.ts` (NEW):
      - Validate `CreateAiDraftDto` with evidenceIds array bounds, purpose trim, proposalCount range, and acknowledgement.
12. **`server/src/contracts/shared-predicates.spec.ts`**:
    - Update to test newly exported `isUploadMediaType` and `isAssignableRole`.

## Reference material read for it, by path

- `packages/shared/src/uploads.ts`: current upload contracts and media type usage.
- `packages/shared/src/organizations.ts`: current organization roles and permissions.
- `packages/shared/src/dashboards.ts`: `DASHBOARD_PRESENTATION_CHARTS` and `DASHBOARD_COMPARE_BY_OPTIONS`.
- `packages/shared/src/reports.ts`: `EXPORT_FORMATS`.
- `server/src/app.setup.ts`: global `ValidationPipe` configuration.
- `server/src/contracts/generate-contracts.ts`: contract generation and stringification logic.
- `server/src/analytics/seed/check-analytics-plans.ts`: analytics scale seed and plan benchmark queries.
- `server/src/geography/seed/check-geography-plans.spec.ts`: seed query plan test pattern reference.
- `docs/backend.md`: architecture record and test execution metrics.

## Measurements the implementation must hit

- 100% test coverage across all new DTO spec suites (`auth-dto.spec.ts`, `organizations-dto.spec.ts`, `uploads-dto.spec.ts`, `forms-dto.spec.ts`, `ingestion-dto.spec.ts`, `analytics-dto.spec.ts`, `dashboards-dto.spec.ts`, `reports-dto.spec.ts`, `ai-draft-dto.spec.ts`).
- 100% test coverage on `server/src/contracts/generate-contracts.spec.ts` and `server/src/analytics/seed/check-analytics-plans.spec.ts`.
- `server/src/contracts/shared-predicates.spec.ts` updated to include `isUploadMediaType` and `isAssignableRole`.
- All verification commands pass cleanly:
  - `npm run contracts:check`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npm run test --workspace=@acres/server`
  - `npm run test:server`

## Expected impact

- `packages/shared`: exports `UPLOAD_MEDIA_TYPES`, `UploadMediaType`, `isUploadMediaType`, `ASSIGNABLE_ROLES`, `AssignableRole`, `isAssignableRole`.
- `server/src`: DTOs consume canonical shared constants instead of local duplicate literals.
- `server/src/contracts`: `generate-contracts.ts` exports helper functions, and `generate-contracts.spec.ts` is added.
- `server/src/analytics/seed`: `check-analytics-plans.ts` exports query builder and redaction, and `check-analytics-plans.spec.ts` is added.
- `server/src/**/dto`: comprehensive unit tests added across all 9 DTO domains.
- `docs/backend.md`: documented prompt 156 additions and metrics.

## Non-goals

- No modifications to database schemas, Prisma models, or migrations.
- No changes to public HTTP route paths or wire response contracts.
- No modifications to frontend UI components or client state.

## Checks to run

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run contracts:check`
- `npm run test --workspace=@acres/server -- src/contracts/generate-contracts.spec.ts`
- `npm run test --workspace=@acres/server -- src/analytics/seed/check-analytics-plans.spec.ts`
- `npm run test --workspace=@acres/server -- src/auth/dto/auth-dto.spec.ts`
- `npm run test --workspace=@acres/server -- src/organizations/dto/organizations-dto.spec.ts`
- `npm run test --workspace=@acres/server -- src/uploads/dto/uploads-dto.spec.ts`
- `npm run test --workspace=@acres/server -- src/forms/dto/forms-dto.spec.ts`
- `npm run test --workspace=@acres/server -- src/ingestion/dto/ingestion-dto.spec.ts`
- `npm run test --workspace=@acres/server -- src/analytics/dto/analytics-dto.spec.ts`
- `npm run test --workspace=@acres/server -- src/dashboards/dto/dashboards-dto.spec.ts`
- `npm run test --workspace=@acres/server -- src/reports/dto/reports-dto.spec.ts`
- `npm run test --workspace=@acres/server -- src/ai/dto/ai-draft-dto.spec.ts`
- `npm run test --workspace=@acres/server -- src/contracts/shared-predicates.spec.ts`
- `npm run test --workspace=@acres/server`
- `npm run test:server`
- Result recorded in `docs/backend.md`.

## SKILLS USED

- `nestjs-best-practices`: NestJS DTO validation, class-validator, class-transformer, and modular architecture.
- `api-design-principles`: HTTP input validation, canonical contract constants, and query parameter constraints.
- `javascript-testing-patterns`: isolated unit testing with Jest, validation pipe testing, and AST assertion.
- `error-handling-patterns`: validation error reporting and redaction security.
- `requesting-code-review`: preparing structured review context for reviewer subagent dispatch.
- `receiving-code-review`: evaluating and verifying reviewer feedback before commit.
- `caveman-commit`: concise conventional commit message authoring.
