# 155 — export shared predicates, AI generation states, and add isolated unit tests across GraphQL limits, decorators, and shared contracts

## Scope, and why it is next

The committed repository is on `main` at `d7e097d`
(`refactor(contracts): export predicates and add tests`, the prompt 154 implementation).
The worktree is clean (verified via `git status`, clean working tree).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), followed by external I/O adapter hardening, canonical
tuple exports, and isolated unit testing across scanner, queue, storage, mail, AI,
parser, upload, organization/audit, accounts/auth, security, tenancy guard, common
request/response, prisma/transactions, config, health, forms, job runs, all REST
controllers, data-access repositories, regions public service, metrics middleware,
GraphQL presentation subsystem, ingestion/geography domain services, and OpenAPI
contracts/app setup (prompts 136–154).

With OpenAPI contracts and app setup verified in Prompt 154, the remaining
foundational runtime surfaces, query security enforcement, decorators, and shared
contracts lacking dedicated isolated unit tests and canonical tuple exports are:

1. **`packages/shared/src/reports.ts`**:
   - Codify canonical const tuple `AI_GENERATION_STATES`:
     `['succeeded', 'validation_rejected', 'rate_limited', 'timeout', 'unavailable', 'malformed_output', 'grounding_rejected', 'failed'] as const`.
   - Derive `AiGenerationState = (typeof AI_GENERATION_STATES)[number]`.
   - Export type predicate `isAiGenerationState(state: unknown): state is AiGenerationState`.
2. **`packages/shared/src/uploads.ts`**:
   - Export type predicate `isStoredObjectState(state: unknown): state is StoredObjectState`.
   - Export type predicate `isUploadState(state: unknown): state is UploadState`.
   - Update `isTerminalUploadState(state: unknown): state is TerminalUploadState`.
3. **`packages/shared/src/ingestion.ts`**:
   - Export type predicate `isIngestionRunState(state: unknown): state is IngestionRunState`.
   - Update `isTerminalIngestionRunState`, `isIngestionRunStage`, `isDatasetState`, `isMappingValidationStatus`, and `isValidationIssueSeverity` to accept `unknown`.
4. **`packages/shared/src/organizations.ts`**:
   - Export type predicate `isOrganizationPermission(permission: unknown): permission is OrganizationPermission`.
   - Export type predicate `isAuditAction(action: unknown): action is AuditAction`.
   - Update `isOrganizationRole` and `isInvitationRole` to accept `unknown`.
5. **`server/src/graphql/graphql-limits.ts`**:
   - Export `countOperation`, `CONNECTION_FIELDS`, and `isConnectionField` to allow direct isolated testing of AST traversal and query budgeting calculations.
6. **`server/src/graphql/graphql-limits.spec.ts`** (NEW):
   - Comprehensive unit test suite for GraphQL query security limits and complexity budgeting:
     - `createGraphqlLimitPlugin`:
       - Requires `operationName` in non-development environments (`NODE_ENV=test` or `production`), throwing `GraphQLError` with code `QUERY_LIMIT_EXCEEDED` and message `GraphQL operationName is required.`.
       - Allows omitted `operationName` in `development` environment when a single operation definition exists.
       - Enforces exactly one GraphQL operation definition per document (rejects 0 or >1 operations with `Exactly one GraphQL operation is allowed.`).
       - Enforces `graphqlMaxAliases` (rejects queries exceeding max alias count).
       - Enforces `graphqlMaxDepth` (rejects queries exceeding max selection depth).
       - Enforces `graphqlMaxNodes` (rejects queries whose requested `first` totals exceed limit).
       - Enforces `graphqlMaxCost` (rejects queries exceeding complexity score).
       - Passes valid queries within all limits with requestId in error extensions if rejected.
     - `countOperation`:
       - Computes depth, aliases, firstTotal, and fieldCost across fields, arguments (literal and variable `first`), fragment spreads, inline fragments, and connection field defaults.
7. **`server/src/contracts/shared-predicates.spec.ts`** (NEW):
   - Exhaustive isolated unit tests for all type predicates and constant arrays exported by `@acres/shared`:
     - `isApiErrorCode`, `isNodeEnv`, `isApiError`
     - `isAccountTokenPurpose`
     - `isJobRunStatus`, `isScheduledJobName`
     - `isOrganizationRole`, `isInvitationRole`, `isOrganizationPermission`, `isAuditAction`
     - `isStoredObjectState`, `isUploadState`, `isTerminalUploadState`
     - `isIngestionRunState`, `isTerminalIngestionRunState`, `isIngestionRunStage`, `isDatasetState`, `isMappingValidationStatus`, `isValidationIssueSeverity`
     - `isReportStatus`, `isReportRevisionStatus`, `isReportEvidenceType`, `isExportFormat`, `isExportStatus`, `isTerminalExportStatus`, `isAiGenerationState`
     - `isMetricValueKind`, `isMetricAggregationType`, `isDashboardPresentationChart`, `isDashboardCompareBy`, `isDashboardViewStatus`, `isMetricDefinitionStatus`
     - `isInsightReportStatus`
     - Verifies acceptance of every valid item, case-sensitivity rejection, invalid strings, non-string primitives, null, and undefined.
8. **`server/src/organizations/current-organization.decorator.spec.ts`** (NEW):
   - Isolated unit tests for `getOrganizationFromContext` and `CurrentOrganization`:
     - Returns `request.organizationContext` when resolved.
     - Throws Error('Organization context was not resolved') when `request.organizationContext` is undefined.
9. **`server/src/sessions/current-account.decorator.spec.ts`** (NEW):
   - Isolated unit tests for `getAccountFromContext` and `CurrentAccount`:
     - Returns `request.sessionContext.account` when resolved.
     - Throws `ApiException.unauthenticated()` when `request.sessionContext` is undefined.
10. **`server/src/security/strict-throttle.decorator.spec.ts`** (NEW):
    - Isolated unit tests for `StrictThrottle` decorator and `STRICT_THROTTLE_KEY` symbol:
      - Applies metadata to classes and methods.
      - Verifies `Reflect.getMetadata(STRICT_THROTTLE_KEY, ...)` evaluates to `true`.

## Reference material read for it, by path

- `packages/shared/src/reports.ts`: current `AiGenerationState` union definition and export formats/statuses.
- `packages/shared/src/uploads.ts`: current `STORED_OBJECT_STATES`, `UPLOAD_STATES`, `TERMINAL_UPLOAD_STATES`.
- `packages/shared/src/ingestion.ts`: current `INGESTION_RUN_STATES`, `INGESTION_RUN_STAGES`, `DATASET_STATES`, `MAPPING_VALIDATION_STATUSES`, `VALIDATION_ISSUE_SEVERITIES`.
- `packages/shared/src/organizations.ts`: current `ORGANIZATION_ROLES`, `INVITATION_ROLES`, `ORGANIZATION_PERMISSIONS`, `AUDIT_ACTIONS`.
- `server/src/graphql/graphql-limits.ts`: Apollo Server plugin implementation and AST inspection helpers.
- `server/src/organizations/current-organization.decorator.ts`: param decorator and `getOrganizationFromContext` resolver.
- `server/src/sessions/current-account.decorator.ts`: param decorator and `getAccountFromContext` resolver.
- `server/src/security/strict-throttle.decorator.ts`: `StrictThrottle` composite decorator and metadata symbol.
- `docs/backend.md`: architecture record for GraphQL limits, security decorators, and contract matrices.

## Measurements the implementation must hit

- 100% test coverage on `server/src/graphql/graphql-limits.spec.ts` covering error rejection paths, limits, and AST counters.
- 100% test coverage on `server/src/contracts/shared-predicates.spec.ts` covering all shared predicates.
- 100% test coverage on `current-organization.decorator.spec.ts`, `current-account.decorator.spec.ts`, and `strict-throttle.decorator.spec.ts`.
- All checks pass cleanly: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run contracts:check`, `npm run test:server`.

## Expected impact

- `packages/shared`: exports new type predicates (`isAiGenerationState`, `isStoredObjectState`, `isUploadState`, `isIngestionRunState`, `isOrganizationPermission`, `isAuditAction`) and canonical `AI_GENERATION_STATES` tuple.
- `server/src/graphql`: exports `countOperation`, `CONNECTION_FIELDS`, and `isConnectionField` from `graphql-limits.ts`.
- `server/src/graphql/graphql-limits.spec.ts`: added test suite.
- `server/src/contracts/shared-predicates.spec.ts`: added test suite.
- `server/src/organizations/current-organization.decorator.spec.ts`: added test suite.
- `server/src/sessions/current-account.decorator.spec.ts`: added test suite.
- `server/src/security/strict-throttle.decorator.spec.ts`: added test suite.
- `docs/backend.md`: updated with prompt 155 record.

## Non-goals

- No modifications to database schemas, Prisma models, or migrations.
- No changes to public HTTP route paths or wire response contracts.
- No modifications to frontend UI components or client state.

## Checks to run

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run contracts:check`
- `npm run test --workspace=@acres/server -- src/graphql/graphql-limits.spec.ts`
- `npm run test --workspace=@acres/server -- src/contracts/shared-predicates.spec.ts`
- `npm run test --workspace=@acres/server -- src/organizations/current-organization.decorator.spec.ts`
- `npm run test --workspace=@acres/server -- src/sessions/current-account.decorator.spec.ts`
- `npm run test --workspace=@acres/server -- src/security/strict-throttle.decorator.spec.ts`
- `npm run test:server`
- Result recorded in `docs/backend.md`.

## SKILLS USED

- `nestjs-best-practices`: NestJS decorators, execution context handling, and Apollo Server plugin architecture.
- `api-design-principles`: contract types, immutable predicates, and GraphQL query budgeting standards.
- `javascript-testing-patterns`: isolated unit testing with Jest, AST mock fixtures, and error assertion.
- `error-handling-patterns`: GraphQLError extension structure and validation error semantics.
- `requesting-code-review`: preparing structured review context for reviewer subagent dispatch.
- `receiving-code-review`: evaluating and verifying reviewer feedback before commit.
- `caveman-commit`: concise conventional commit message authoring.
