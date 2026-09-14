# 102 — narrow `ParserChildErrorResponse` message to the fixed parser-child error message union

## Scope, and why it is next

The committed repository is on `main` at `e1fb239`
(`refactor(ingestion): narrow executor failure code`, i.e. the prompt 101
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
observation-quality literals), and 101 (`createSafeErrorSummary()` code narrowed
to the 2 fixed parser-executor literals).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 7 (geography and ingestion — child-process
parser isolation IPC contract, directly continuing prompts 43, 74, 87, and 101),
dependency-safe against prompts 68–101 (no schema, migration, contract, route,
permission, timeout/memory-bound, retention-window, or version-marker change).

The gap is the open `string` typing of `message` in `ParserChildErrorResponse`
across the child-process IPC boundary. In
`server/src/ingestion/parsers/parser-ipc.types.ts` (lines 17–22):

```ts
export interface ParserChildErrorResponse {
  readonly type: 'error';
  readonly id: string;
  readonly code: string;
  readonly message: string;
}
```

In the child entrypoint (`server/src/ingestion/parsers/parser-child.entry.ts`),
exactly two error responses are constructed and sent to the parent process:

1. Request validation failure (lines 33–45):
```ts
const response: ParserChildResponse = {
  type: 'error',
  id:
    typeof (rawMessage as { id?: unknown })?.id === 'string'
      ? (rawMessage as { id: string }).id
      : '',
  code: 'parser_execution_failed',
  message: 'Malformed parser child request.',
};
```

2. Outer exception catch-all (lines 65–75):
```ts
} catch {
  const response: ParserChildResponse = {
    type: 'error',
    id: rawMessage.id,
    code: 'parser_execution_failed',
    message: 'Parser execution failed.',
  };
  process.send!(response, () => {
    process.exit(1);
  });
}
```

Both sites emit fixed, constant string literals. However, because `ParserChildErrorResponse.message`
is typed as open `string`, any future change or refactor inside `parser-child.entry.ts`
could inadvertently pass `error.message` or arbitrary exception text over IPC.
While `child-process-parser.executor.ts` defends in depth by discarding `rawMessage.message`
and substituting `PARSER_EXECUTION_FAILED_MESSAGE` (prompts 87 and 101), narrowing
the child error response interface guarantees at compile time that the child process
itself can never construct an error response carrying an unvetted message string.

This prompt defines `ParserChildErrorMessage` as the fixed 2-literal union
`'Malformed parser child request.' | 'Parser execution failed.'` with exported
constants in `parser-ipc.types.ts`, narrows `ParserChildErrorResponse.message` to
that type, and references the exported constants in `parser-child.entry.ts`,
with zero runtime behavior change.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 7 definition (§8, geography/ingestion and its skill
  manifest) with §§16–22 confirming 12E–12K committed; §1 rule that open numeric
  limits need real input and must not be invented (why no new message values appear
  here — only narrowing to the existing produced literals).
- `docs/ingestion.md` — Child-process parser isolation section (lines 180–210:
  untrusted IPC validation and safe error handling); the owning record for the
  doc update.
- `server/src/ingestion/parsers/parser-ipc.types.ts` (lines 17–22 for
  `ParserChildErrorResponse`).
- `server/src/ingestion/parsers/parser-child.entry.ts` (lines 33–45 and 65–75 for
  the 2 error response creation sites).
- `server/src/ingestion/parsers/child-process-parser.executor.ts` (lines 158–181 for
  parent child message handling; lines 293–300 for `isParserChildResponse`).
- `server/src/ingestion/parsers/child-process-parser.executor.spec.ts` (lines
  150–223 for parent error handling specs).
- `server/src/ingestion/parsers/compiled-child-process-parser.spec.ts` (lines
  1–160 verifying compiled child entrypoint execution).

## Measurements and verified invariants

- `ParserChildErrorResponse.message` today: open `string` at
  `server/src/ingestion/parsers/parser-ipc.types.ts:21`.
- Call site inventory (all error response creation sites in `parser-child.entry.ts`):
  1. line 40: `'Malformed parser child request.'`
  2. line 70: `'Parser execution failed.'`
- The narrowed message constants and union in `parser-ipc.types.ts`:
  ```ts
  export const PARSER_CHILD_MALFORMED_REQUEST_MESSAGE =
    'Malformed parser child request.' as const;
  export const PARSER_CHILD_EXECUTION_FAILED_MESSAGE =
    'Parser execution failed.' as const;

  export type ParserChildErrorMessage =
    | typeof PARSER_CHILD_MALFORMED_REQUEST_MESSAGE
    | typeof PARSER_CHILD_EXECUTION_FAILED_MESSAGE;
  ```
- `ParserChildErrorResponse` updated definition:
  ```ts
  export interface ParserChildErrorResponse {
    readonly type: 'error';
    readonly id: string;
    readonly code: string;
    readonly message: ParserChildErrorMessage;
  }
  ```
- Compile-time negative probe: assigning an arbitrary string (e.g. `'Unknown error'`
  or `error.message`) to `message` on a `ParserChildErrorResponse` must fail `tsc`
  with `Type '"Unknown error"' is not assignable to type 'ParserChildErrorMessage'`.
- Wire contract invariant: `docs/api/contracts.md` / `generate-contracts.ts`
  untouched — verify with `npm run contracts:check`. Parser IPC types are internal
  to the server process isolation boundary; not part of any external wire contract.

## Expected impact

| file | today | after prompt 102 |
| --- | --- | --- |
| `server/src/ingestion/parsers/parser-ipc.types.ts` lines 17–22 | `message: string` on `ParserChildErrorResponse` | export `PARSER_CHILD_MALFORMED_REQUEST_MESSAGE`, `PARSER_CHILD_EXECUTION_FAILED_MESSAGE`, `ParserChildErrorMessage`; narrow `message: ParserChildErrorMessage` |
| `server/src/ingestion/parsers/parser-child.entry.ts` lines 33–45, 65–75 | raw string literals `'Malformed parser child request.'` and `'Parser execution failed.'` | import and use constants `PARSER_CHILD_MALFORMED_REQUEST_MESSAGE` and `PARSER_CHILD_EXECUTION_FAILED_MESSAGE` |
| `docs/ingestion.md` lines 197–202 | records `createSafeErrorSummary()` fixed message and code literals | also records that `ParserChildErrorResponse.message` is compile-time guarded to the 2 fixed child error message literals |

- Runtime behavior is 100% identical. Every produced message literal is unchanged.
- Zero Prisma schema migrations or PostgreSQL DDL changes.
- Zero client workspace changes.

## Implementation steps

1. `server/src/ingestion/parsers/parser-ipc.types.ts`:
   - Introduce message constants and type union:
     ```ts
     export const PARSER_CHILD_MALFORMED_REQUEST_MESSAGE =
       'Malformed parser child request.' as const;
     export const PARSER_CHILD_EXECUTION_FAILED_MESSAGE =
       'Parser execution failed.' as const;

     export type ParserChildErrorMessage =
       | typeof PARSER_CHILD_MALFORMED_REQUEST_MESSAGE
       | typeof PARSER_CHILD_EXECUTION_FAILED_MESSAGE;
     ```
   - Narrow `message` property on `ParserChildErrorResponse`:
     ```ts
     export interface ParserChildErrorResponse {
       readonly type: 'error';
       readonly id: string;
       readonly code: string;
       readonly message: ParserChildErrorMessage;
     }
     ```
2. `server/src/ingestion/parsers/parser-child.entry.ts`:
   - Import `PARSER_CHILD_EXECUTION_FAILED_MESSAGE` and `PARSER_CHILD_MALFORMED_REQUEST_MESSAGE`
     from `./parser-ipc.types`.
   - Replace literal strings at line 40 and line 70 with the respective constants.
3. Negative probe verification:
   - Temporarily assign an invalid message literal (e.g. `'Unexpected child error'`)
     to `message` on a `ParserChildErrorResponse` to verify `tsc` rejection.
     Revert the probe cleanly before proceeding.
4. Spec checks:
   - Run `npm --workspace=@acres/server test -- child-process-parser.executor.spec.ts`.
   - Run `npm --workspace=@acres/server test -- compiled-child-process-parser.spec.ts`.
   - Ensure all tests pass.
5. Run full repository verification:
   - `npm run contracts:check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
6. Documentation update:
   - Update `docs/ingestion.md` child-process parser isolation section to record
     that `ParserChildErrorResponse.message` is compile-time guarded to the 2 fixed
     child error message literals (`'Malformed parser child request.'`,
     `'Parser execution failed.'`).
7. Two-stage code review:
   - Dispatch reviewer subagent via `requesting-code-review`.
   - Evaluate reviewer feedback via `receiving-code-review`.
8. Commit:
   - Commit locally to `main` using `caveman-commit`.

## Non-goals

- No new message literals or changes to existing literal strings.
- No code narrowing in this prompt (`code` narrowing on `ParserChildErrorResponse` follows in prompt 103).
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
