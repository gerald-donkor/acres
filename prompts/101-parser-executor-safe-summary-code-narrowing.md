# 101 — narrow `createSafeErrorSummary()` code to the fixed parser-executor code union

## Scope, and why it is next

The committed repository is on `main` at `e4b49c0`
(`refactor(analytics): narrow quality carrier code`, i.e. the prompt 100
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
2-literal union `'value_missing' | 'value_invalid'`), and 100
(`ParsedObservation` quality carrier code narrowed to the 3 fixed
observation-quality literals).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 7 (geography and ingestion — child-process
parser isolation in `ChildProcessParserExecutor`, completing the code counterpart
to prompt 87's message narrowing and aligning with the prompts 94–100 code
narrowing sequence), dependency-safe against prompts 68–100 (no schema,
migration, contract, route, permission, timeout/memory-bound, retention-window,
or version-marker change).

The gap is the remaining open-`string` code producer in the child-process parser
isolation boundary. In `server/src/ingestion/parsers/child-process-parser.executor.ts`,
`createSafeErrorSummary()` currently defines `code: string` (line 261):

```ts
function createSafeErrorSummary(
  sourceKind: SourceKind,
  code: string,
  message: ParserExecutorFailureMessage,
): ParsedSourceSummary {
  return {
    sourceKind,
    rowCount: 0,
    columnCount: 0,
    columnKeys: [],
    sampleRows: [],
    validationRows: [],
    issues: [
      {
        severity: 'error',
        code: ISSUE_CODE_REGEX.test(code) ? code : 'parser_execution_failed',
        message: message.slice(0, MAX_STRING_LENGTH),
      },
    ],
    metadata: {},
  };
}
```

While prompt 87 narrowed `message` to `ParserExecutorFailureMessage`
(`'Parser execution failed.' | 'Parser execution timed out.'`), `code` was left as
`string`, bounded only at runtime via `ISSUE_CODE_REGEX.test(code) ? code : 'parser_execution_failed'`.
Because `code` is typed as open `string`, any arbitrary identifier matching
`/^[a-z0-9_]{1,64}$/` could be passed from a caller into `createSafeErrorSummary()`
and flow via `summary.issues[].code` through `IngestionProcessorService`
`validationIssue.createMany` (`ingestion-processor.service.ts:193–211`, `code: issue.code`)
into the durable `ValidationIssue.code` database column (`server/prisma/schema.prisma:678`).

All 9 call sites of `createSafeErrorSummary()` inside `child-process-parser.executor.ts`
only intend to produce 2 fixed failure codes:
1. `'parser_execution_failed'` (fork error line 84, child error line 135, child early exit line 145, malformed/mismatched IPC line 156, untrusted child response error line 167, untrusted summary reject line 183, send callback error line 207, send throw line 217)
2. `'parser_execution_timed_out'` (watchdog timeout line 124)

At call site 6 (line 167), an untrusted child response with `type: 'error'` passes
`rawMessage.code || 'parser_execution_failed'`. The child entrypoint (`parser-child.entry.ts:39, 69`)
only ever emits `'parser_execution_failed'`. However, `rawMessage.code` is an untrusted
string over IPC; sanitizing it against the fixed 2-literal union guarantees that
only the 2 valid executor failure codes can ever be passed to `createSafeErrorSummary()`,
allowing `code` in `createSafeErrorSummary()` to be strictly typed as
`ParserExecutorFailureCode = 'parser_execution_failed' | 'parser_execution_timed_out'`.

This prompt closes the type-level gap with zero runtime behavior change.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 7 definition (§8, geography/ingestion and its skill
  manifest) with §§16–22 confirming 12E–12K committed; §1 rule that open numeric
  limits need real input and must not be invented (why no new code value appears
  here — only narrowing to the existing produced set).
- `docs/ingestion.md` — Child-process parser isolation section (lines 165–210,
  specifically lines 197–201 recording `createSafeErrorSummary()` fixed literals;
  lines 257–262 recording `ValidationIssue.code` closure); the owning record for
  the doc update.
- `server/src/ingestion/parsers/child-process-parser.executor.ts` (lines 20–36 for
  constants/types; lines 70–222 for the 9 `createSafeErrorSummary()` call sites;
  lines 259–280 for `createSafeErrorSummary()` implementation).
- `server/src/ingestion/parsers/parser-child.entry.ts` (lines 39, 69 verifying that
  the child worker only ever emits `code: 'parser_execution_failed'`).
- `server/src/ingestion/parsers/parser-ipc.types.ts` (lines 17–22 for
  `ParserChildErrorResponse`).
- `server/src/ingestion/parsers/child-process-parser.executor.spec.ts` (lines
  126–173, 191–197, 222 verifying existing coverage asserting `parser_execution_failed`
  and `parser_execution_timed_out`).
- `server/prisma/schema.prisma` (lines 673–691 for `model ValidationIssue`
  confirming `code String` at line 678 and `message String` at line 679).

## Measurements and verified invariants

- `createSafeErrorSummary()` parameter `code` today: open `string` at
  `server/src/ingestion/parsers/child-process-parser.executor.ts:261`.
- Call site inventory (all 9 sites inside `child-process-parser.executor.ts`):
  1. line 84: `'parser_execution_failed'`
  2. line 124: `'parser_execution_timed_out'`
  3. line 135: `'parser_execution_failed'`
  4. line 145: `'parser_execution_failed'`
  5. line 156: `'parser_execution_failed'`
  6. line 167: `rawMessage.code || 'parser_execution_failed'` (untrusted IPC)
  7. line 183: `'parser_execution_failed'`
  8. line 207: `'parser_execution_failed'`
  9. line 217: `'parser_execution_failed'`
- The narrowed code constants and union:
  ```ts
  export const PARSER_EXECUTION_FAILED_CODE = 'parser_execution_failed' as const;
  export const PARSER_EXECUTION_TIMED_OUT_CODE =
    'parser_execution_timed_out' as const;

  export type ParserExecutorFailureCode =
    | typeof PARSER_EXECUTION_FAILED_CODE
    | typeof PARSER_EXECUTION_TIMED_OUT_CODE;
  ```
- Call site 6 sanitization:
  In `child.on('message', ...)` when `rawMessage.type === 'error'`, map untrusted
  `rawMessage.code` to `ParserExecutorFailureCode`:
  `rawMessage.code === PARSER_EXECUTION_TIMED_OUT_CODE ? PARSER_EXECUTION_TIMED_OUT_CODE : PARSER_EXECUTION_FAILED_CODE`.
- Helper simplification:
  In `createSafeErrorSummary()`, since `code: ParserExecutorFailureCode` is strictly
  typed to the 2 known valid codes, `ISSUE_CODE_REGEX.test(code)` check in the helper
  is redundant for `code` and `code: code` is assigned directly.
- `ISSUE_CODE_REGEX` remains in `child-process-parser.executor.ts` (line 25) because
  it is actively used by `validateUntrustedSummary()` (line 425) to validate
  untrusted child issue codes.
- Compile-time negative probe: passing an invalid code literal (e.g.
  `'unsupported_error'` or `'unknown_code'`) to `createSafeErrorSummary()`
  must fail `tsc` with `Type '"unknown_code"' is not assignable to type 'ParserExecutorFailureCode'`.
- Wire contract invariant: `docs/api/contracts.md` / `generate-contracts.ts`
  untouched — verify with `npm run contracts:check`. `ValidationIssue.code`
  is not an exported wire-contract enum; read models remain `string`.

## Expected impact

| file | today | after prompt 101 |
| --- | --- | --- |
| `server/src/ingestion/parsers/child-process-parser.executor.ts` lines ~29–36 | only `PARSER_EXECUTION_*_MESSAGE` constants and `ParserExecutorFailureMessage` defined | add `PARSER_EXECUTION_FAILED_CODE`, `PARSER_EXECUTION_TIMED_OUT_CODE`, and `ParserExecutorFailureCode` |
| `server/src/ingestion/parsers/child-process-parser.executor.ts` lines 84, 124, 135, 145, 156, 167, 183, 207, 217 | literal strings `'parser_execution_failed'` / `'parser_execution_timed_out'` or `rawMessage.code \|\| ...` | use exported constants and sanitized `failureCode` at line 167 |
| `server/src/ingestion/parsers/child-process-parser.executor.ts` lines 259–280 | `code: string` with runtime `ISSUE_CODE_REGEX` check | `code: ParserExecutorFailureCode` with direct assignment |
| `docs/ingestion.md` lines 197–201 | records `createSafeErrorSummary()` accepting only 2 message literals with code regex fallback | records `createSafeErrorSummary()` accepting only 2 message literals and 2 code literals as compile-time guards |

- Runtime behavior is 100% identical. Every produced code literal is unchanged.
- Zero Prisma schema migrations or PostgreSQL DDL changes.
- Zero client workspace changes.

## Implementation steps

1. `server/src/ingestion/parsers/child-process-parser.executor.ts`:
   - Introduce constants and type:
     ```ts
     export const PARSER_EXECUTION_FAILED_CODE = 'parser_execution_failed' as const;
     export const PARSER_EXECUTION_TIMED_OUT_CODE =
       'parser_execution_timed_out' as const;

     export type ParserExecutorFailureCode =
       | typeof PARSER_EXECUTION_FAILED_CODE
       | typeof PARSER_EXECUTION_TIMED_OUT_CODE;
     ```
   - Update `createSafeErrorSummary()` signature:
     ```ts
     function createSafeErrorSummary(
       sourceKind: SourceKind,
       code: ParserExecutorFailureCode,
       message: ParserExecutorFailureMessage,
     ): ParsedSourceSummary
     ```
     and update the issue object creation to assign `code` directly.
   - Update all 9 call sites:
     - Replace `'parser_execution_failed'` with `PARSER_EXECUTION_FAILED_CODE`.
     - Replace `'parser_execution_timed_out'` with `PARSER_EXECUTION_TIMED_OUT_CODE`.
     - At call site 6 (line 167), sanitize `rawMessage.code`:
       ```ts
       const failureCode: ParserExecutorFailureCode =
         rawMessage.code === PARSER_EXECUTION_TIMED_OUT_CODE
           ? PARSER_EXECUTION_TIMED_OUT_CODE
           : PARSER_EXECUTION_FAILED_CODE;
       ```
       and pass `failureCode` to `createSafeErrorSummary()`.
2. Negative probe verification:
   - Temporarily pass an invalid code literal to `createSafeErrorSummary()`
     to verify `tsc` rejections. Revert the probe cleanly before proceeding.
3. Spec checks:
   - Run `npm --workspace=@acres/server test -- child-process-parser.executor.spec.ts`.
   - Ensure all tests pass.
4. Run full repository verification:
   - `npm run contracts:check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
5. Documentation update:
   - Update `docs/ingestion.md` lines 197–201: record that `createSafeErrorSummary()`
     accepts only the 2 fixed message literals (`'Parser execution failed.'`,
     `'Parser execution timed out.'`) and the 2 fixed code literals
     (`'parser_execution_failed'`, `'parser_execution_timed_out'`) as compile-time guards;
     runtime values unchanged and raw child/exception text never reaches
     `ValidationIssue.code` or `ValidationIssue.message` via this helper.
6. Two-stage code review:
   - Dispatch reviewer subagent via `requesting-code-review`.
   - Evaluate reviewer feedback via `receiving-code-review`.
7. Commit:
   - Commit locally to `main` using `caveman-commit`.

## Non-goals

- No new code literals or modification to existing literal strings.
- No changes to `validateUntrustedSummary()` or `ISSUE_CODE_REGEX` logic for child summary issues.
- No changes to `ParserIssue` interface in `parser.types.ts`.
- No database schema migrations or Prisma model alterations (`code String` remains).
- No changes to read APIs or client types.

## Checks to run, and the owning doc

```bash
# Spec check
npm --workspace=@acres/server test -- child-process-parser.executor.spec.ts

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
- `postgres-best-practices`: data integrity and compile-time boundaries protecting PostgreSQL columns.
- `javascript-testing-patterns`: Jest spec execution and type safety verification in test fixtures.
- `error-handling-patterns`: defensive validation and bounded error code taxonomy.
- `requesting-code-review`: preparing and dispatching code review subagent (§2, §2.1).
- `receiving-code-review`: evaluating review feedback with technical rigor (§2, §2.1).
- `caveman-commit`: generating commit message for local commit to `main` (§3, §7).
