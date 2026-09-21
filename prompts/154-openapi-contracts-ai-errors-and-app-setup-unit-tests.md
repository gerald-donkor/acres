# 154 — export canonical shared predicates, AI error codes, and add isolated unit tests across OpenAPI contracts, AI errors, parser utilities, and application setup

## Scope, and why it is next

The committed repository is on `main` at `6a3856f`
(`refactor(ingestion): export tuples and add tests`, the prompt 153 implementation).
The worktree is clean (verified via `git status`, clean working tree).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), followed by external I/O adapter hardening, canonical
tuple exports, and isolated unit testing across scanner, queue, storage, mail, AI,
parser, upload, organization/audit, accounts/auth, security, tenancy guard, common
request/response, prisma/transactions, config, health, forms, job runs, all REST
controllers, data-access repositories, regions public service, metrics middleware,
GraphQL presentation subsystem, and ingestion/geography domain services (prompts 136–153).

With domain services and ingestion subsystems fully verified in Prompt 153, the remaining
foundational runtime surfaces, contract definitions, error models, and shared contracts
lacking dedicated isolated unit tests and canonical tuple exports are:

1. **`packages/shared/src/api.ts`**:
   - Codify canonical type predicates:
     - `isApiErrorCode` over `API_ERROR_CODES`.
     - `isNodeEnv` over `NODE_ENVS`.
2. **`packages/shared/src/auth.ts`**:
   - Codify canonical type predicate:
     - `isAccountTokenPurpose` over `ACCOUNT_TOKEN_PURPOSES`.
3. **`packages/shared/src/jobs.ts`**:
   - Codify canonical type predicates:
     - `isJobRunStatus` over `JOB_RUN_STATUSES`.
     - `isScheduledJobName` over `SCHEDULED_JOB_NAMES`.
4. **`packages/shared/src/reports.ts`**:
   - Codify canonical type predicates:
     - `isReportEvidenceType` over `REPORT_EVIDENCE_TYPES`.
     - `isExportFormat` over `EXPORT_FORMATS`.
     - `isExportStatus` over `EXPORT_STATUSES`.
5. **`packages/shared/src/dashboards.ts`**:
   - Codify canonical type predicates:
     - `isMetricValueKind` over `METRIC_VALUE_KINDS`.
     - `isMetricAggregationType` over `METRIC_AGGREGATION_TYPES`.
     - `isDashboardPresentationChart` over `DASHBOARD_PRESENTATION_CHARTS`.
     - `isDashboardCompareBy` over `DASHBOARD_COMPARE_BY_OPTIONS`.
     - `isMetricDefinitionStatus` over `METRIC_DEFINITION_STATUSES`.
6. **`server/src/ai/ai.errors.ts`**:
   - Codify canonical const tuple `AI_ERROR_CODES`, derived union type `AiErrorCode`, and type predicate `isAiErrorCode`.
   - Ensure all 6 AI exception classes align with `AiErrorCode`.
7. **`server/src/ai/ai.errors.spec.ts`** (NEW):
   - Isolated unit tests for AI error classes:
     - `AiDisabledException`: status 403, code `AI_DISABLED`, default and custom messages.
     - `AiUnavailableException`: status 503, code `AI_UNAVAILABLE`, default and custom messages.
     - `AiTimeoutException`: status 504, code `AI_TIMEOUT`, default and custom messages.
     - `AiRateLimitedException`: status 429, code `AI_RATE_LIMITED`, default and custom messages.
     - `AiOutputInvalidException`: status 400, code `AI_OUTPUT_INVALID`, default/custom messages, details array preservation.
     - `AiGroundingRejectedException`: status 400, code `AI_GROUNDING_REJECTED`, default/custom messages, details array preservation.
     - `isAiErrorCode` type predicate verification across valid codes, case-sensitivity, invalid codes, non-string values.
8. **`server/src/ingestion/parsers/parser-utils.ts`**:
   - Export `FORMULA_AS_DATA_MESSAGE`, `FormulaAsDataMessage`, and export type predicate `isFormulaAsDataMessage`.
9. **`server/src/ingestion/parsers/parser.types.ts`**:
   - Export type predicate `isParserExecutionStatus` over `PARSER_EXECUTION_STATUSES`.
10. **`server/src/ingestion/parsers/parser-utils.spec.ts`** (NEW):
    - Isolated unit tests for parser utilities:
      - `normalizeKey()`: trims whitespace, lowercases, replaces non-alphanumeric chars with underscores, strips leading and trailing underscores.
      - `safeCell()`: handles null/undefined, numbers, booleans, string truncation to `maxChars`, dates, bigints, JSON-stringified objects.
      - `scalarText()`: strings, null/undefined, Dates (ISO), bigints, objects (JSON).
      - `formulaIssue()`: produces correct issue structure with severity warning, code formula_as_data, message, rowNumber, columnKey.
      - `isFormulaLike()`: detects strings starting with `=`, `+`, `-`, `@`, ignores leading whitespace, returns false for non-strings and benign strings.
      - `isFormulaAsDataMessage` and `isParserExecutionStatus` type predicates.
11. **`server/src/contracts/openapi.ts`**:
    - Align OpenAPI schemas with canonical shared const tuples:
      - `jobRunSchema` status enum -> `JOB_RUN_STATUSES` from `@acres/shared`.
      - `organizationSummarySchema`, `organizationMemberSchema`, `organizationInvitationSchema` roles -> `MEMBERSHIP_ROLES` and `INVITATION_ROLES` from `@acres/shared`.
12. **`server/src/contracts/openapi.spec.ts`** (NEW):
    - Isolated unit tests for OpenAPI contracts:
      - Schema builder helpers: `stringSchema`, `nullableStringSchema`, `booleanLiteralSchema`, `arraySchema`, `objectSchema`.
      - Envelope schemas: `successEnvelope` (ok true + data), `errorEnvelope` (ok false + API_ERROR_CODES enum, code, message, requestId, details).
      - Swagger decorator factories: `ApiEnvelope`, `ApiSessionAuth`, `ApiCsrfHeader`, `ApiIdempotencyHeader`, `ApiOrganizationHeader`.
      - Model schemas structure and enum constraints: `accountSchema`, `sessionProfileSchema`, `organizationSummarySchema`, `organizationMemberSchema`, `organizationInvitationSchema`, `issuedInvitationSchema`, `regionalMetricSchema`, `regionSummarySchema`, `contactReceiptSchema`, `jobRunSchema`.
13. **`server/src/app.setup.spec.ts`** (NEW):
    - Isolated unit tests verifying `configureApp`:
      - Global prefix `api` with excluded endpoints (`health`, `health/ready`, `metrics`, `graphql`).
      - URI versioning configuration.
      - Middleware registration: `requestContextMiddleware`, `helmet`, `cookieParser`, `express.json` with 10mb limit, `express.urlencoded` with 10mb limit, raw body parser for binary/parquet/arrow media types.
      - Global filter: `ApiExceptionFilter`.
      - Global interceptor: `ResponseEnvelopeInterceptor`.
      - Global pipe: `ValidationPipe` with `whitelist: true`, `transform: true`, `forbidNonWhitelisted: true`.
      - CORS configuration: origins matching `config.clientOrigin`, `credentials: true`, allowed methods, and allowed headers (`CSRF_HEADER_NAME`, `IDEMPOTENCY_HEADER_NAME`, `ORGANIZATION_HEADER_NAME`, `REQUEST_ID_HEADER_NAME`).
14. **`docs/backend.md`**:
    - Record the new canonical shared predicates, AI error codes and isolated tests, parser-utils isolated tests, OpenAPI contracts spec, and application setup spec under the build record.

## Subsystems and changes

1. `packages/shared/src/api.ts`:
   - Export type predicates `isApiErrorCode`, `isNodeEnv`.
2. `packages/shared/src/auth.ts`:
   - Export type predicate `isAccountTokenPurpose`.
3. `packages/shared/src/jobs.ts`:
   - Export type predicates `isJobRunStatus`, `isScheduledJobName`.
4. `packages/shared/src/reports.ts`:
   - Export type predicates `isReportEvidenceType`, `isExportFormat`, `isExportStatus`.
5. `packages/shared/src/dashboards.ts`:
   - Export type predicates `isMetricValueKind`, `isMetricAggregationType`, `isDashboardPresentationChart`, `isDashboardCompareBy`, `isMetricDefinitionStatus`.
6. `server/src/ai/ai.errors.ts`:
   - Export `AI_ERROR_CODES`, `AiErrorCode`, `isAiErrorCode`.
7. `server/src/ai/ai.errors.spec.ts` (NEW):
   - 10+ unit tests covering AI exception classes, HTTP status codes, default messages, custom messages, details arrays, and `isAiErrorCode` type predicate.
8. `server/src/ingestion/parsers/parser-utils.ts`:
   - Export `FORMULA_AS_DATA_MESSAGE`, `FormulaAsDataMessage`, `isFormulaAsDataMessage`.
9. `server/src/ingestion/parsers/parser.types.ts`:
   - Export `isParserExecutionStatus`.
10. `server/src/ingestion/parsers/parser-utils.spec.ts` (NEW):
    - 15+ unit tests covering `normalizeKey`, `safeCell`, `scalarText`, `formulaIssue`, `isFormulaLike`, `isFormulaAsDataMessage`, and `isParserExecutionStatus`.
11. `server/src/contracts/openapi.ts`:
    - Refactor enum references in `jobRunSchema`, `organizationSummarySchema`, `organizationMemberSchema`, `organizationInvitationSchema` to use `@acres/shared` constants.
12. `server/src/contracts/openapi.spec.ts` (NEW):
    - 20+ unit tests covering schema builders, response envelopes, decorator factories, and OpenAPI model schemas.
13. `server/src/app.setup.spec.ts` (NEW):
    - 10+ unit tests verifying `configureApp` global prefixes, versioning, middleware, filters, interceptors, pipes, and CORS.
14. `docs/backend.md`:
    - Record the verification details, new tests, and canonical contracts.

## Non-goals

- No Prisma schema alterations, migrations, or database DDL changes.
- No changes to REST routes or GraphQL schema.
- No modification of production business logic or runtime behavior.

## Security, tenancy, and failure cases

- Contract consistency: OpenAPI schema matches real API envelopes and error codes without drift.
- Middleware integrity: `configureApp` tests verify helmet, CORS headers, cookie parsing, CSRF headers, and body parser security limits.
- Type narrowing: All type predicates safely narrow string inputs without throwing on unexpected types.

## Reference material

- `AGENTS.md` (§1 Invariants, §2 Workflow, §5 Prompt files)
- `docs/backend.md` (§3.2 Canonical tuples, type predicates, and isolated unit tests)
- `packages/shared/src/` (canonical types and shared envelopes)
- `server/src/app.setup.ts`
- `server/src/contracts/openapi.ts`
- `server/src/ai/ai.errors.ts`
- `server/src/ingestion/parsers/parser-utils.ts`

## SKILLS USED

- `api-design-principles`: REST API error envelopes and OpenAPI 3.1 specification schema design
- `error-handling-patterns`: typed domain exceptions, status mapping, and type narrowing predicates
- `javascript-testing-patterns`: isolated Jest unit test suites with mocks and assertion fixtures
- `nestjs-best-practices`: NestJS application setup, middleware configuration, and global pipes/interceptors/filters
- `requesting-code-review`: dispatching code reviewer subagent with structured context
- `receiving-code-review`: evaluating feedback with technical rigor before completing
- `caveman-commit`: concise conventional commit message format

## Checks to run

```bash
npm run lint
npm run typecheck
npm run test --workspace=@acres/server -- src/ai/ai.errors.spec.ts
npm run test --workspace=@acres/server -- src/ingestion/parsers/parser-utils.spec.ts
npm run test --workspace=@acres/server -- src/contracts/openapi.spec.ts
npm run test --workspace=@acres/server -- src/app.setup.spec.ts
npm run test:server
npm run contracts:check
```
