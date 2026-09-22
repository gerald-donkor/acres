# 157 — export geoboundaries CLI helpers with entrypoint guard, canonical validation bounds, account profile mapping, and isolated unit tests across CLI, account profile, and shared predicates

## Scope, and why it is next

The committed repository is on `main` at `281c45b`
(`test(dto): validate dtos and plan checks`, the prompt 156 implementation).
The worktree is clean (verified via `git status`, clean working tree).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate, followed by external I/O adapter hardening, canonical
tuple exports, DTO validation schemes, and isolated unit testing across all services,
repositories, controllers, GraphQL limits, and seed plan checks (prompts 136–156).

Following Prompt 156's comprehensive DTO validation and plan check test suites,
the remaining gaps in CLI entrypoint testability, canonical validation bounds,
pure helper test suites, and strict shared predicate typing are:

1. **`server/src/geography/geoboundaries-cli.ts`**:
   - Currently executes `void main().catch(...)` at module load time unconditionally without an entrypoint guard. Guard entrypoint with `if (process.argv[1] && process.argv[1].includes('geoboundaries-cli'))` matching the pattern established in `generate-contracts.ts` and `check-geography-plans.ts`.
   - Export helper functions: `fail`, `arg`, `selections`, `workDirectory`, `atomicJson`, `regularInside`, `normalizedManifest`, `acquire`, `importManifest`, `reviewHierarchy`, `main`.
   - Fix error message in `main` from `'command must be acquire or import.'` to `'command must be acquire, review, or import.'`.
2. **`server/src/geography/geoboundaries-cli.spec.ts`** (NEW):
   - Exhaustive isolated unit tests for CLI utilities:
     - `fail`: prints to `console.error`, sets `process.exitCode = 2`, and throws Error.
     - `arg`: parses `--flag value`, throws when flag is absent or followed by nothing.
     - `selections`: parses ISO3/ADM level comma-separated strings (`GHA/ADM0,GHA/ADM1`), enforces ISO3 regex `^[A-Z]{3}$` and level regex `^ADM[0-5]$`, rejects invalid formats, empty list, and duplicate selections.
     - `workDirectory`: resolves path, rejects working directory matching `process.cwd()` or `/`.
     - `atomicJson`: creates parent directory with 0o700 mode, writes temporary file with 0o600 mode, renames atomically, and cleans up temporary file on failure.
     - `regularInside`: verifies file path is inside workdir, rejects relative path traversal (`..`), ensures file exists, is a regular file, and is not a symlink or directory.
     - `normalizedManifest`: verifies `--manifest` regular file, checks layer `byteLength` and SHA-256 checksums against geojson files on disk, rejects checksum mismatches, and calls `normalizeGeoBoundariesLayer`.
     - `acquire`: verifies `--dry-run` output formatting; mocks `GeoBoundariesProvider.acquire` and verifies atomic manifest writing in live mode.
     - `reviewHierarchy`: verifies `--dry-run` output; validates hierarchy review input, checks feature IDs, produces published manifest, and writes to `--output`.
     - `importManifest`: verifies `--dry-run` and live mode invoking `GeoBoundariesImportService.importLayers` within Nest context.
     - `main`: displays usage for `--help` or empty command; dispatches `acquire`, `review`, and `import`; reports errors and sets exit code 1.
3. **`server/src/accounts/account-profile.ts` & `server/src/accounts/account-profile.spec.ts`** (NEW):
   - Create isolated unit test suite for pure helper functions in `account-profile.ts`:
     - `normaliseEmail`: trims leading/trailing whitespace, converts mixed-case to lowercase, and handles edge cases.
     - `toAccountProfile`: maps full Prisma `Account` model to public `AccountProfile`, converts `createdAt` Date to ISO 8601 string, and handles null `displayName`.
4. **`packages/shared/src/validation.ts`**:
   - Add canonical validation limits for `dataset` and `aiDraft`:
     - `dataset: { name: { maxLength: 160 }, description: { maxLength: 1000 } }`
     - `aiDraft: { purpose: { minLength: 1, maxLength: 500 }, evidenceIds: { minSize: 1, maxSize: 10 }, proposalCount: { min: 1, max: 5 } }`
   - Wire canonical `VALIDATION` bounds into `server/src/ingestion/dto/create-dataset.dto.ts`, `server/src/ingestion/dto/update-dataset.dto.ts`, and `server/src/ai/dto/ai-draft.dto.ts`.
5. **`packages/shared`**:
   - Refine `isApiErrorCode`, `isNodeEnv`, `isAccountTokenPurpose`, `isJobRunStatus`, and `isScheduledJobName` parameter types from `string` to `unknown`, with safe `typeof value === 'string'` checks, aligning with the strict type predicate pattern across all other shared predicates.
   - Update `server/src/contracts/shared-predicates.spec.ts` to assert non-string values (`null`, `undefined`, numbers, booleans, objects) directly without casting.

## Reference material read for it, by path

- `server/src/geography/geoboundaries-cli.ts`: geoBoundaries CLI commands and file handling.
- `server/src/geography/seed/check-geography-plans.ts`: CLI entrypoint guard pattern reference.
- `server/src/contracts/generate-contracts.ts`: CLI entrypoint guard and error handling pattern.
- `server/src/accounts/account-profile.ts`: pure account profile mapping and email normalization.
- `packages/shared/src/validation.ts`: shared validation constants.
- `packages/shared/src/api.ts`: API error codes, node envs, and predicates.
- `packages/shared/src/auth.ts`: account token purposes and predicates.
- `packages/shared/src/jobs.ts`: job run statuses, scheduled job names, and predicates.
- `server/src/contracts/shared-predicates.spec.ts`: shared contract and predicate test suite.
- `docs/backend.md`: backend architecture and testing records.

## Measurements the implementation must hit

- 100% test coverage on `server/src/geography/geoboundaries-cli.spec.ts` and `server/src/accounts/account-profile.spec.ts`.
- All shared predicates updated to accept `unknown` type arguments and validated in `server/src/contracts/shared-predicates.spec.ts`.
- All verification commands pass cleanly:
  - `npm run contracts:check`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npm run test --workspace=@acres/server`
  - `npm run test:server`

## Expected impact

- `server/src/geography/geoboundaries-cli.ts` exports testable functions with entrypoint guard.
- `server/src/geography/geoboundaries-cli.spec.ts` added with full CLI test coverage.
- `server/src/accounts/account-profile.spec.ts` added with unit test coverage.
- `packages/shared/src/validation.ts` exports `dataset` and `aiDraft` bounds consumed by server DTOs.
- `packages/shared/src/{api,auth,jobs}.ts` accept `unknown` in predicate functions.
- `server/src/contracts/shared-predicates.spec.ts` updated with comprehensive type-guard assertions.
- `docs/backend.md` updated with prompt 157 documentation.

## Non-goals

- No changes to Prisma schema or database migrations.
- No changes to public HTTP route paths or wire response contracts.
- No changes to frontend UI or client state.

## Checks to run

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run contracts:check`
- `npm run test --workspace=@acres/server -- src/geography/geoboundaries-cli.spec.ts`
- `npm run test --workspace=@acres/server -- src/accounts/account-profile.spec.ts`
- `npm run test --workspace=@acres/server -- src/contracts/shared-predicates.spec.ts`
- `npm run test --workspace=@acres/server`
- `npm run test:server`
- Result recorded in `docs/backend.md`.

## SKILLS USED

- `nestjs-best-practices`: NestJS dependency injection, application context management, and CLI architecture.
- `api-design-principles`: contract validation bounds and type predicates.
- `javascript-testing-patterns`: Jest unit testing with filesystem mocking, process spy, and mock application contexts.
- `postgres-best-practices`: PostGIS geography layer normalization and manifest validation standards.
- `error-handling-patterns`: CLI exit code handling and atomic filesystem operation cleanup.
- `requesting-code-review`: preparing structured review context for reviewer subagent dispatch.
- `receiving-code-review`: evaluating and verifying reviewer feedback before commit.
- `caveman-commit`: concise conventional commit message authoring.
