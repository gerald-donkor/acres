# 103 — narrow `ParserChildErrorResponse` code to the fixed parser-child error code literal

## Scope, and why it is next

The committed repository is on `main` at `31c48ca`
(`refactor(ingestion): narrow child error message`, i.e. the prompt 102
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
to the 2 fixed parser-executor literals), and 102 (`ParserChildErrorResponse`
message narrowed to the 2 fixed child error message literals).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 7 (geography and ingestion — child-process
parser isolation IPC contract, directly continuing prompts 43, 74, 87, 101, and
102), dependency-safe against prompts 68–102 (no schema, migration, contract,
route, permission, timeout/memory-bound, retention-window, or version-marker
change). In prompt 102, Non-goals explicitly recorded:
`- No code narrowing in this prompt (code narrowing on ParserChildErrorResponse follows in prompt 103).`

The gap is the open `string` typing of `code` in `ParserChildErrorResponse`
across the child-process IPC boundary. In
`server/src/ingestion/parsers/parser-ipc.types.ts` (lines 26–31):

```ts
export interface ParserChildErrorResponse {
  readonly type: 'error';
  readonly id: string;
  readonly code: string;
  readonly message: ParserChildErrorMessage;
}
```

In the child entrypoint (`server/src/ingestion/parsers/parser-child.entry.ts`),
exactly two error responses are constructed and sent to the parent process:

1. Request validation failure (lines 35–45):
```ts
const response: ParserChildResponse = {
  type: 'error',
  id:
    typeof (rawMessage as { id?: unknown })?.id === 'string'
      ? (rawMessage as { id: string }).id
      : '',
  code: 'parser_execution_failed',
  message: PARSER_CHILD_MALFORMED_REQUEST_MESSAGE,
};
```

2. Outer exception catch-all (lines 68–77):
```ts
} catch {
  const response: ParserChildResponse = {
    type: 'error',
    id: rawMessage.id,
    code: 'parser_execution_failed',
    message: PARSER_CHILD_EXECUTION_FAILED_MESSAGE,
  };
  process.send!(response, () => {
    process.exit(1);
  });
}
```

Both error response sites emit the identical, fixed code literal `'parser_execution_failed'`.
However, because `ParserChildErrorResponse.code` is currently typed as open `string`,
any future modification in `parser-child.entry.ts` could emit an arbitrary unvetted
string across the process isolation boundary.

Furthermore, in `server/src/ingestion/parsers/child-process-parser.executor.ts` (lines 170–183):

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

Narrowing `ParserChildErrorResponse.code` to `ParserChildErrorCode = typeof PARSER_CHILD_EXECUTION_FAILED_CODE`
establishes compile-time closure over the child process IPC interface. In the executor,
`rawMessage.code` is compile-time bound to the child error code type, and casting
`(rawMessage.code as string) === PARSER_EXECUTION_TIMED_OUT_CODE` preserves the defensive
runtime sanitization against untrusted messages while preventing TS2367 comparison errors.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 7 definition (§8, geography/ingestion and its skill
  manifest) with §§16–22 confirming 12E–12K committed; §1 rule that open numeric
  limits need real input and must not be invented (why no new code value appears
  here — only narrowing to the existing produced set).
- `docs/ingestion.md` — Child-process parser isolation section (lines 191–216,
  specifically lines 197–207 recording `createSafeErrorSummary()` fixed code/message
  literals and `ParserChildErrorResponse.message` narrowing; lines 257–262 recording
  `ValidationIssue.code` closure); the owning record for the doc update.
- `prompts/102-parser-child-error-message-narrowing.md` — Preceding prompt establishing
  `ParserChildErrorMessage` and explicitly noting that `ParserChildErrorResponse.code`
  narrowing follows in prompt 103.
- `prompts/101-parser-executor-safe-summary-code-narrowing.md` — Step narrowing
  `createSafeErrorSummary()` code parameter to `ParserExecutorFailureCode`.
- `server/src/ingestion/parsers/parser-ipc.types.ts` (lines 14–35) — IPC types and response definitions.
- `server/src/ingestion/parsers/parser-child.entry.ts` (lines 35–45, 68–77) — Child process error response generation sites.
- `server/src/ingestion/parsers/child-process-parser.executor.ts` (lines 28–42, 170–183) — Parent process error response handling.

## Measurements the implementation must hit, or the procedure that will produce them

- Exact constant and type definitions in `server/src/ingestion/parsers/parser-ipc.types.ts`:
  ```ts
  export const PARSER_CHILD_EXECUTION_FAILED_CODE =
    'parser_execution_failed' as const;

  export type ParserChildErrorCode = typeof PARSER_CHILD_EXECUTION_FAILED_CODE;
  ```
- `ParserChildErrorResponse` updated definition:
  ```ts
  export interface ParserChildErrorResponse {
    readonly type: 'error';
    readonly id: string;
    readonly code: ParserChildErrorCode;
    readonly message: ParserChildErrorMessage;
  }
  ```
- `server/src/ingestion/parsers/parser-child.entry.ts`:
  Import `PARSER_CHILD_EXECUTION_FAILED_CODE` from `./parser-ipc.types`.
  Replace `'parser_execution_failed'` with `PARSER_CHILD_EXECUTION_FAILED_CODE` at
  lines 41 and 71.
- `server/src/ingestion/parsers/child-process-parser.executor.ts`:
  Ensure line 172 uses `(rawMessage.code as string) === PARSER_EXECUTION_TIMED_OUT_CODE`
  so that TypeScript compiles cleanly without TS2367 (non-overlapping comparison warning)
  while preserving defensive runtime sanitization.
- Compile-time negative probe: assigning an arbitrary string (e.g. `'unknown_code'`
  or `error.name`) to `code` on a `ParserChildErrorResponse` must fail `tsc`
  with `Type '"unknown_code"' is not assignable to type '"parser_execution_failed"'`.
- Wire contract invariant: `docs/api/contracts.md` / `generate-contracts.ts`
  untouched — verify with `npm run contracts:check`. Parser IPC types are internal
  to the server process isolation boundary; not part of any external wire contract.

## Expected impact

| file | today | after prompt 103 |
| --- | --- | --- |
| `server/src/ingestion/parsers/parser-ipc.types.ts` lines 26–31 | `code: string` on `ParserChildErrorResponse` | export `PARSER_CHILD_EXECUTION_FAILED_CODE`, `ParserChildErrorCode`; narrow `code: ParserChildErrorCode` |
| `server/src/ingestion/parsers/parser-child.entry.ts` lines 41, 71 | raw string literal `'parser_execution_failed'` | import and use constant `PARSER_CHILD_EXECUTION_FAILED_CODE` |
| `server/src/ingestion/parsers/child-process-parser.executor.ts` line 172 | `rawMessage.code === PARSER_EXECUTION_TIMED_OUT_CODE` | ensure `(rawMessage.code as string) === PARSER_EXECUTION_TIMED_OUT_CODE` for strict type safety |
| `docs/ingestion.md` lines 202–207 | records `ParserChildErrorResponse.message` compile-time narrowing | also records that `ParserChildErrorResponse.code` is compile-time guarded to the fixed child error code literal (`'parser_execution_failed'`) |

- Runtime behavior is 100% identical. Produced code and message literals are unchanged.
- Zero Prisma schema migrations or PostgreSQL DDL changes.
- Zero client workspace changes.

## Implementation steps

1. `server/src/ingestion/parsers/parser-ipc.types.ts`:
   - Introduce code constant and type alias:
     ```ts
     export const PARSER_CHILD_EXECUTION_FAILED_CODE =
       'parser_execution_failed' as const;

     export type ParserChildErrorCode = typeof PARSER_CHILD_EXECUTION_FAILED_CODE;
     ```
   - Narrow `code` property on `ParserChildErrorResponse`:
     ```ts
     export interface ParserChildErrorResponse {
       readonly type: 'error';
       readonly id: string;
       readonly code: ParserChildErrorCode;
       readonly message: ParserChildErrorMessage;
     }
     ```
2. `server/src/ingestion/parsers/parser-child.entry.ts`:
   - Import `PARSER_CHILD_EXECUTION_FAILED_CODE` from `./parser-ipc.types`.
   - Replace literal strings at line 41 and line 71 with `PARSER_CHILD_EXECUTION_FAILED_CODE`.
3. `server/src/ingestion/parsers/child-process-parser.executor.ts`:
   - Verify line 172 uses `(rawMessage.code as string) === PARSER_EXECUTION_TIMED_OUT_CODE`
     so that the defensive comparison compiles cleanly under strict typechecking.
4. Negative probe verification:
   - Temporarily assign an invalid code literal (e.g. `'unknown_code'`)
     to `code` on a `ParserChildErrorResponse` to verify `tsc` rejection.
     Revert the probe cleanly before proceeding.
5. Spec checks:
   - Run `npm --workspace=@acres/server test -- child-process-parser.executor.spec.ts`.
   - Run `npm --workspace=@acres/server test -- compiled-child-process-parser.spec.ts`.
   - Ensure all tests pass.
6. Run full repository verification:
   - `npm run contracts:check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
7. Documentation update:
   - Update `docs/ingestion.md` child-process parser isolation section to record
     that `ParserChildErrorResponse.code` is compile-time guarded to the fixed
     child error code literal (`'parser_execution_failed'`) via `ParserChildErrorCode`
     (`PARSER_CHILD_EXECUTION_FAILED_CODE`).
8. Two-stage code review:
   - Dispatch reviewer subagent via `requesting-code-review`.
   - Evaluate reviewer feedback via `receiving-code-review`.
9. Commit:
   - Commit locally to `main` using `caveman-commit`.

## Non-goals

- No new code literals or changes to existing literal strings.
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
- `javascript-testing-patterns`: Jest spec execution and type safety verification in child process parser tests.
- `error-handling-patterns`: defensive IPC error response typing and bounded error messaging.
- `requesting-code-review`: preparing and dispatching code review subagent (§2, §2.1).
- `receiving-code-review`: evaluating review feedback with technical rigor (§2, §2.1).
- `caveman-commit`: generating commit message for local commit to `main` (§3, §7).
