# 104 — harden `isParserChildResponse` runtime guard and eliminate dead executor timeout comparison

## Scope, and why it is next

The committed repository is on `main` at `aa98cae`
(`refactor(ingestion): narrow child error code`, i.e. the prompt 103
implementation). All 12 ordered phases in `docs/build-plan.md` are implemented
and committed through the Phase 12K exit gate (verification records §§16–22,
operator checklist in `docs/launch-checklist.md`), plus residual follow-ups 68
(saved-view `schemaVersion`), 69 (frozen dashboard-evidence `schemaVersion`), 70
(hourly `exports.purge-expired` reclamation), 71 (download-time expiry
enforcement), 72 (incompatible-metric-remap pre-publication validation), 73
(unexpected publication-failure message sanitization), 74 (`parser_exception`
fixed message), 75 (`worker_exception` fixed message), 76 (infected
`scanResult` bounded to `'infected'`), 77 (scheduled-job `JobRun.message` fixed
strings), 78 (`jobs.read` owner/admin gate on `GET /jobs/runs`), 79 (shared
`RETENTION_PURGE_BATCH_LIMIT = 500` across all five purges), 80
(`IngestionProcessorService.fail()` narrowed to the fixed publication
code/message union), 81 (inline `validation_failed` write narrowed to fixed
literals), 82 (`ExportFailure` narrowed to the fixed export failure union), 83
(`ScanResult.errorCode` narrowed to the fixed scan-error union plus `'infected'`
/ `'failed'` status fallbacks), 84 (`OutboxService` retry/dead-letter writes
narrowed to the fixed dispatch-exhausted union), 85 (`JobRunsService.finish()`
narrowed to the fixed job-run message union), 86 (`invalidValue()` message
narrowed to the 3 fixed observation-quality literals), 87
(`createSafeErrorSummary()` message narrowed to the 2 fixed parser-executor
literals), 88 (`parsePeriod()` message narrowed to the fixed `period_invalid`
literal), 89 (`validateMapping()` in `analytics-publication.service.ts` message
narrowed to the 5 fixed mapping-validation literals), 90
(`malformedMetricMappingIssues()` message narrowed to the 3 fixed
mapping-shape literals), 91 (private `IngestionProcessorService.validateMapping()`
message narrowed to the 4 fixed region-mapping literals), 92
(`validateRemappingCompatibility()` message narrowed to the single fixed
remapping literal), 93 (`ParsedObservation` quality carrier message narrowed to
the 4 fixed observation-quality literals), 94
(`validateRemappingCompatibility()` code narrowed to the single fixed
`metric_definition_incompatible` literal), 95
(`malformedMetricMappingIssues()` code narrowed to the single fixed
`metric_mapping_invalid` literal), 96 (`validateMapping()` code narrowed to the
5 fixed mapping-validation literals), 97 (private
`IngestionProcessorService.validateMapping()` code narrowed to the 4 fixed
region-mapping literals), 98 (`parsePeriod()` code narrowed to the single fixed
`period_invalid` literal), 99 (`invalidValue()` code narrowed to the fixed
2-literal union `'value_missing' | 'value_invalid'`), 100
(`ParsedObservation` quality carrier code narrowed to the 3 fixed
observation-quality literals), 101 (`createSafeErrorSummary()` code narrowed
to the 2 fixed parser-executor literals), 102 (`ParserChildErrorResponse`
message narrowed to the 2 fixed child error message literals), and 103
(`ParserChildErrorResponse` code narrowed to the fixed parser-child error code
literal `'parser_execution_failed'`).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 7 (geography and ingestion — child-process
parser isolation IPC contract, directly concluding prompts 43, 74, 87, 101, 102,
and 103), dependency-safe against prompts 68–103 (no schema, migration,
contract, route, permission, timeout/memory-bound, retention-window, or
version-marker change).

The gap is two-fold in `server/src/ingestion/parsers/child-process-parser.executor.ts`:
1. Dead timeout check and type cast on child error messages (lines 170–183):
   In prompt 103, `ParserChildErrorResponse.code` was narrowed from `string` to
   `ParserChildErrorCode` (`'parser_execution_failed'`). In prompt 103, line 172:
   ```ts
   const failureCode: ParserExecutorFailureCode =
     (rawMessage.code as string) === PARSER_EXECUTION_TIMED_OUT_CODE
       ? PARSER_EXECUTION_TIMED_OUT_CODE
       : PARSER_EXECUTION_FAILED_CODE;
   ```
   was retained with an explicit `(rawMessage.code as string)` cast as a non-goal
   measure to keep the defensive comparison compiling. But child process error
   responses never represent timeouts (timeouts are enforced and synthesized
   exclusively by the parent process watchdog timer at line 127). Now that
   `ParserChildErrorResponse.code` is strictly `'parser_execution_failed'`, the
   comparison `(rawMessage.code as string) === PARSER_EXECUTION_TIMED_OUT_CODE` is
   dead code and requires an artificial cast. The error branch can settle
   directly with `PARSER_EXECUTION_FAILED_CODE`.
2. Shallow IPC response type guard (lines 293–300):
   `isParserChildResponse(value: unknown): value is ParserChildResponse` currently
   only checks:
   ```ts
   (res.type === 'success' || res.type === 'error') &&
   typeof res.id === 'string'
   ```
   It asserts `value is ParserChildResponse` without validating that error responses
   actually contain `code === PARSER_CHILD_EXECUTION_FAILED_CODE` or
   `message` in `ParserChildErrorMessage` (`PARSER_CHILD_MALFORMED_REQUEST_MESSAGE | PARSER_CHILD_EXECUTION_FAILED_MESSAGE`),
   or that success responses contain `summary` as an object. If an unvetted or
   corrupt error message arrives from the child over IPC (e.g. `{ type: 'error', id: '...' }`
   with missing or arbitrary code/message), `isParserChildResponse` falsely claims
   type conformance.

This prompt hardens `isParserChildResponse` to perform full runtime verification of
child responses against `ParserChildSuccessResponse` and `ParserChildErrorResponse`,
and removes the dead timeout comparison and cast in `child.on('message')`.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 7 definition (§8, ingestion/publication
  surface) with its skill manifest; §§16–22 confirming 12E–12K committed;
  §1 rule that open numeric limits need real input and must not be invented.
- `docs/ingestion.md` — § Child-process parser isolation (lines 185–219),
  recording child process IPC validation, lifecycle cleanup, and compile-time /
  runtime safety guards.
- `server/src/ingestion/parsers/child-process-parser.executor.ts` (lines 158–183
  for `child.on('message')`; lines 293–300 for `isParserChildResponse()`).
- `server/src/ingestion/parsers/parser-ipc.types.ts` (lines 11–36 for
  `ParserChildResponse`, `ParserChildSuccessResponse`, `ParserChildErrorResponse`,
  `ParserChildErrorCode`, `ParserChildErrorMessage`,
  `PARSER_CHILD_EXECUTION_FAILED_CODE`, `PARSER_CHILD_EXECUTION_FAILED_MESSAGE`,
  `PARSER_CHILD_MALFORMED_REQUEST_MESSAGE`).
- `server/src/ingestion/parsers/parser-child.entry.ts` (lines 10–26 for
  reference `isParserChildRequest` pattern).
- `server/src/ingestion/parsers/child-process-parser.executor.spec.ts` (lines
  200–257 for child error and malformed IPC response tests).

## Measurements and verified invariants

1. Call site simplification in `child-process-parser.executor.ts`:
   Lines 170–183 currently:
   ```ts
   if (rawMessage.type === 'error') {
     const failureCode: ParserExecutorFailureCode =
       (rawMessage.code as string) === PARSER_EXECUTION_TIMED_OUT_CODE
         ? PARSER_EXECUTION_TIMED_OUT_CODE
         : PARSER_EXECUTION_FAILED_CODE;
     settle(
       createSafeErrorSummary(
         sourceKind,
         failureCode,
         PARSER_EXECUTION_FAILED_MESSAGE,
       ),
     );
     return;
   }
   ```
   Replaced with:
   ```ts
   if (rawMessage.type === 'error') {
     settle(
       createSafeErrorSummary(
         sourceKind,
         PARSER_EXECUTION_FAILED_CODE,
         PARSER_EXECUTION_FAILED_MESSAGE,
       ),
     );
     return;
   }
   ```
   Eliminating the artificial `(rawMessage.code as string)` type cast and dead
   `PARSER_EXECUTION_TIMED_OUT_CODE` branch.
2. Runtime type guard hardening in `child-process-parser.executor.ts`:
   Import `PARSER_CHILD_EXECUTION_FAILED_CODE`, `PARSER_CHILD_EXECUTION_FAILED_MESSAGE`,
   and `PARSER_CHILD_MALFORMED_REQUEST_MESSAGE` from `./parser-ipc.types`.
   Update `isParserChildResponse`:
   ```ts
   function isParserChildResponse(value: unknown): value is ParserChildResponse {
     if (!value || typeof value !== 'object') return false;
     const res = value as Partial<ParserChildResponse>;
     if (typeof res.id !== 'string') return false;
     if (res.type === 'success') {
       return typeof res.summary === 'object' && res.summary !== null;
     }
     if (res.type === 'error') {
       return (
         res.code === PARSER_CHILD_EXECUTION_FAILED_CODE &&
         (res.message === PARSER_CHILD_EXECUTION_FAILED_MESSAGE ||
           res.message === PARSER_CHILD_MALFORMED_REQUEST_MESSAGE)
       );
     }
     return false;
   }
   ```
3. Negative and boundary test verification:
   In `child-process-parser.executor.spec.ts`:
   - Verify child error response with invalid `code` (e.g. `'unknown_code'`) is
     rejected by `isParserChildResponse` and triggers safe fallback summary.
   - Verify child error response with invalid `message` (e.g. `'arbitrary message'`)
     is rejected by `isParserChildResponse` and triggers safe fallback summary.
   - Verify child error response with missing `code` or `message` is rejected.
   - Verify child success response with missing `summary` is rejected.
   - Verify valid `PARSER_CHILD_MALFORMED_REQUEST_MESSAGE` and
     `PARSER_CHILD_EXECUTION_FAILED_MESSAGE` error responses are accepted and
     settle cleanly.
4. Wire contract invariant: `docs/api/contracts.md` / `generate-contracts.ts`
   untouched — verify with `npm run contracts:check`. Read models remain `string`.

## Expected impact

- Routes touched: None (internal child-process parser executor IPC boundary).
- APIs / schemas touched: None.
- Complete fail-closed runtime validation of child IPC responses entering the
  parent executor.
- Elimination of dead timeout branch and type cast in executor error handler.

## Implementation plan

1. `server/src/ingestion/parsers/child-process-parser.executor.ts`:
   - Update imports from `./parser-ipc.types` to include:
     `PARSER_CHILD_EXECUTION_FAILED_CODE`,
     `PARSER_CHILD_EXECUTION_FAILED_MESSAGE`,
     `PARSER_CHILD_MALFORMED_REQUEST_MESSAGE`.
   - In `child.on('message', ...)`:
     Replace lines 170–183 error branch with direct call passing
     `PARSER_EXECUTION_FAILED_CODE` and `PARSER_EXECUTION_FAILED_MESSAGE`.
   - In `isParserChildResponse()`:
     Validate `res.id`, discriminator `res.type`, `res.summary` for success,
     and `res.code === PARSER_CHILD_EXECUTION_FAILED_CODE` along with
     `res.message` in `ParserChildErrorMessage` for error.
2. `server/src/ingestion/parsers/child-process-parser.executor.spec.ts`:
   - Add unit tests verifying rejection of error responses with invalid code,
     invalid message, or missing fields.
   - Add unit test verifying rejection of success responses with null or non-object summary.
   - Ensure all existing parser executor tests pass.
3. Spec checks:
   - `npm --workspace=@acres/server test -- child-process-parser.executor.spec.ts`
   - `npm --workspace=@acres/server test -- compiled-child-process-parser.spec.ts`
4. Full repository verification:
   - `npm run contracts:check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
5. Documentation update:
   - Update `docs/ingestion.md` child-process parser isolation section to record
     that `isParserChildResponse()` enforces strict runtime discrimination of
     child IPC response payloads including `ParserChildErrorCode` and
     `ParserChildErrorMessage`.
6. Two-stage code review:
   - Dispatch reviewer subagent via `requesting-code-review`.
   - Evaluate reviewer feedback via `receiving-code-review`.
7. Commit:
   - Commit locally to `main` using `caveman-commit`.

## Non-goals

- No changes to `ParserChildResponse`, `ParserChildRequest`, or `parser-ipc.types.ts`.
- No changes to `parser-child.entry.ts`.
- No changes to `validateUntrustedSummary()` or `ISSUE_CODE_REGEX`.
- No changes to `ParserIssue` interface in `parser.types.ts`.
- No database schema migrations or Prisma model alterations.
- No changes to read APIs or client types.

## Checks to run, and the owning doc

```bash
# Spec checks
npm --workspace=@acres/server test -- child-process-parser.executor.spec.ts
npm --workspace=@acres/server test -- compiled-child-process-parser.spec.ts

# Wire contracts check
npm run contracts:check

# Lint check
npm run lint

# Typecheck
npm run typecheck

# Full production build
npm run build
```

Owning doc: `docs/ingestion.md`.

## SKILLS USED

- `nestjs-best-practices`: NestJS service patterns, type design, dependency boundaries in `server/`.
- `postgres-best-practices`: boundary hygiene protecting data flowing toward PostgreSQL tables.
- `javascript-testing-patterns`: Jest spec execution and negative testing in child process parser tests.
- `error-handling-patterns`: defensive IPC error response validation and fail-closed error handling.
- `requesting-code-review`: preparing and dispatching code review subagent (§2, §2.1).
- `receiving-code-review`: evaluating review feedback with technical rigor (§2, §2.1).
- `caveman-commit`: generating commit message for local commit to `main` (§3, §7).
