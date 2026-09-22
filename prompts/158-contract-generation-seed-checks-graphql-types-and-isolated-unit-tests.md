# 158 — export and test contract generation, geography and analytics seed plan checks, GraphQL types, scale seed cleanup, and isolated helper unit tests

## Scope, and why it is next

The committed repository is on `main` at `97bcbbd`
(`test(backend): harden CLI and predicates`, the prompt 157 implementation).
The worktree is clean (verified via `git status`, clean working tree).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate, followed by isolated unit testing across external I/O adapters,
domain repositories, REST controllers, CLI entrypoints, GraphQL limits, decorators, and shared contracts
(prompts 136–157).

Following Prompt 157's geoBoundaries CLI and shared predicate hardening, the remaining gaps in
isolated unit tests, CLI entrypoint guards, and complete statement/function coverage are:

1. **`server/src/contracts/generate-contracts.ts`**:
   - Export `CONTRACT_DIR`, `writeContracts`, and `main` so contract generation, drift detection, and CLI entrypoint behavior can be verified in isolated unit tests.
2. **`server/src/contracts/generate-contracts.spec.ts`**:
   - Add unit tests for `assertNoDrift`:
     - Resolves cleanly when temp directory matches target contracts.
     - Throws `Contract drift detected: ...` naming drifted or missing files.
   - Add unit tests for `writeContracts`:
     - Invokes NestFactory, SwaggerModule, GraphQLSchemaHost, and writes `openapi.json`, `schema.graphql`, and `contracts.md`.
   - Add unit tests for `main`:
     - Handles `--check` mode creating a temporary directory with `mkdtemp`, asserting drift, and cleaning up with `rm` in a `finally` block.
     - Handles standard generation mode writing to `CONTRACT_DIR`.
3. **`server/src/geography/seed/check-geography-plans.ts`**:
   - Export `main` to allow isolated unit testing.
4. **`server/src/geography/seed/check-geography-plans.spec.ts`**:
   - Add unit tests for `runGeographyPlanChecks`:
     - Rejection when database is unreachable with descriptive error and redacted connection URL.
     - Rejection when `RegionGeometry` table is missing/unmigrated.
     - Success path: seeds scale data, runs `ANALYZE`, queries `EXPLAIN` plans, evaluates indices, formats report, and returns outcome.
   - Add unit tests for `main`:
     - Normal execution reporting query plan report.
     - Failed checks setting `process.exitCode = 1`.
     - Caught exceptions logging error and setting `process.exitCode = 1`.
5. **`server/src/analytics/seed/check-analytics-plans.ts`**:
   - Export `main` to allow isolated unit testing.
6. **`server/src/analytics/seed/check-analytics-plans.spec.ts`**:
   - Add unit tests for `runAnalyticsPlanChecks`:
     - Rejection when database is unreachable with descriptive error and redacted connection URL.
     - Rejection when `MetricAggregate` table is missing/unmigrated.
     - Success path: seeds scale data, runs `ANALYZE`, sets tenant context `acres.organization_id`, queries `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, evaluates plans, formats report, and returns outcome.
   - Add unit tests for `main`:
     - Environment guard: rejects execution if `NODE_ENV !== 'test'` and database URL does not match `acres_test` and `ACRES_ALLOW_TEST_SEED !== '1'`.
     - Normal execution logging plan report.
     - Failed checks setting `process.exitCode = 1`.
     - Caught exceptions logging error and setting `process.exitCode = 1`.
7. **`server/src/analytics/seed/analytics-scale-seed.ts` & `analytics-scale-seed.spec.ts`**:
   - Add unit tests for `cleanScaleSeed`:
     - Sets session configs (`acres.account_id`, `acres.worker_access`, `acres.organization_id`).
     - Executes cascading deletions across all 15 tenant and analytics models in correct dependency order.
   - Add unit tests for `seedAnalyticsScale`:
     - Cleans existing scale data and seeds organizations, regions, accounts, memberships, objects, uploads, datasets, mappings, versions, definitions, observations, aggregates, lineages, and dashboard views.
8. **`server/src/graphql/graphql.types.spec.ts` (NEW)**:
   - Comprehensive unit test suite covering every ObjectType, Connection, and Edge actually exported by `graphql.types.ts`, including viewer, organization, invitation, audit, region, and dashboard models. The file does not export report, export, AI draft, or generic analytics connection types; those names in the initial inventory were incorrect.
   - Explicitly invoke all `@Field(() => ...)` type resolvers and pin the full field type, array, and nullability map as a reviewed snapshot, with representative direct assertions for `ID`, `Int`, `Boolean`, model classes, and arrays. Achieve 100% function and statement coverage across `graphql.types.ts`.
9. **`server/src/identity/account-tokens.service.ts` & `account-tokens.service.spec.ts`**:
   - Unit test `revoke(accountId, purpose)` with updateMany count handling.
   - Unit test `consume` when row is null after count claim.
10. **`server/src/ai/validation/draft-output.validator.spec.ts`**:
    - Add test coverage for missing branches: empty string / non-string, code fence with ` ``` `, top-level array, non-object proposals, heading/body length limits, duplicate proposal deduplication, and empty proposal array.
11. **`server/src/ingestion/parsers/parse-source-buffer.spec.ts`**:
    - Add test for `inspectSourceBuffer` with XLSX mediaType.

## Reference material read for it, by path

- `server/src/contracts/generate-contracts.ts`: OpenAPI, GraphQL schema, and contracts markdown generator.
- `server/src/contracts/generate-contracts.spec.ts`: current contract generator tests.
- `server/src/geography/seed/check-geography-plans.ts`: geography query plan checker and CLI entrypoint.
- `server/src/geography/seed/check-geography-plans.spec.ts`: current geography plan checker tests.
- `server/src/analytics/seed/check-analytics-plans.ts`: analytics query plan checker and CLI entrypoint.
- `server/src/analytics/seed/check-analytics-plans.spec.ts`: current analytics plan checker tests.
- `server/src/analytics/seed/analytics-scale-seed.ts`: deterministic scale seed generator and cleanup.
- `server/src/analytics/seed/analytics-scale-seed.spec.ts`: deterministic seed plan tests.
- `server/src/graphql/graphql.types.ts`: GraphQL object types and edge/connection definitions.
- `server/src/identity/account-tokens.service.ts`: account token lifecycle service.
- `server/src/identity/account-tokens.service.spec.ts`: account token unit tests.
- `server/src/ai/validation/draft-output.validator.ts`: AI draft proposal validation and grounding.
- `server/src/ai/validation/draft-output.validator.spec.ts`: AI draft validation tests.
- `server/src/ingestion/parsers/parse-source-buffer.ts`: source buffer parser and inspector.
- `server/src/ingestion/parsers/parse-source-buffer.spec.ts`: source buffer parser tests.
- `docs/backend.md`: backend architecture and verification records.

## Measurements the implementation must hit

- 100% or near-100% test coverage on `generate-contracts.ts`, `check-geography-plans.ts`, `check-analytics-plans.ts`, `analytics-scale-seed.ts`, `graphql.types.ts`, `account-tokens.service.ts`, and `draft-output.validator.ts`.
- Overall server test suite pass with zero regressions:
  - `npm run contracts:check`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npm run test --workspace=@acres/server`
  - `npm run test:server`

## Expected impact

- `server/src/contracts/generate-contracts.ts` exports `CONTRACT_DIR`, `writeContracts`, `main`.
- `server/src/contracts/generate-contracts.spec.ts` adds tests for `assertNoDrift`, `writeContracts`, and `main`.
- `server/src/geography/seed/check-geography-plans.ts` exports `main`.
- `server/src/geography/seed/check-geography-plans.spec.ts` adds tests for `runGeographyPlanChecks` error/success paths and `main`.
- `server/src/analytics/seed/check-analytics-plans.ts` exports `main`.
- `server/src/analytics/seed/check-analytics-plans.spec.ts` adds tests for `runAnalyticsPlanChecks` error/success paths and `main`.
- `server/src/analytics/seed/analytics-scale-seed.spec.ts` adds tests for `cleanScaleSeed` and `seedAnalyticsScale`.
- `server/src/graphql/graphql.types.spec.ts` created with exhaustive coverage of GraphQL types and field resolvers.
- `server/src/identity/account-tokens.service.spec.ts` covers `revoke` and null-row edge cases.
- `server/src/ai/validation/draft-output.validator.spec.ts` covers fence formatting, array inputs, duplicate deduplication, and bounds.
- `server/src/ingestion/parsers/parse-source-buffer.spec.ts` covers XLSX buffer inspection.
- `docs/backend.md` updated with prompt 158 documentation.

## Non-goals

- No changes to Prisma schema or database migrations.
- No changes to wire contracts or public API route paths.
- No changes to client UI or state management.

## Checks to run

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run contracts:check`
- `npm run test --workspace=@acres/server -- src/contracts/generate-contracts.spec.ts`
- `npm run test --workspace=@acres/server -- src/geography/seed/check-geography-plans.spec.ts`
- `npm run test --workspace=@acres/server -- src/analytics/seed/check-analytics-plans.spec.ts`
- `npm run test --workspace=@acres/server -- src/analytics/seed/analytics-scale-seed.spec.ts`
- `npm run test --workspace=@acres/server -- src/graphql/graphql.types.spec.ts`
- `npm run test --workspace=@acres/server -- src/identity/account-tokens.service.spec.ts`
- `npm run test --workspace=@acres/server -- src/ai/validation/draft-output.validator.spec.ts`
- `npm run test --workspace=@acres/server -- src/ingestion/parsers/parse-source-buffer.spec.ts`
- `npm run test --workspace=@acres/server`
- `npm run test:server`
- Result recorded in `docs/backend.md`.

## SKILLS USED

- `nestjs-best-practices`: Nest application context, dependency injection, and GraphQL schema patterns.
- `api-design-principles`: GraphQL and REST contract schema consistency and field typing.
- `javascript-testing-patterns`: Jest unit testing with module mocking, process spy, and mock database clients.
- `postgres-best-practices`: transaction isolation, configuration parameters, and cascading cleanup.
- `error-handling-patterns`: graceful error reporting, exit code assertions, and input sanitization.
- `requesting-code-review`: preparing structured review context for reviewer subagent dispatch.
- `receiving-code-review`: evaluating and verifying reviewer feedback before commit.
- `caveman-commit`: concise conventional commit message authoring.
