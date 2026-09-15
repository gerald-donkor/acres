# 105 — harden `isParserChildRequest` runtime guard and limits validation in parser child entrypoint

## Scope, and why it is next

The committed repository is on `main` at `6f7dc5b`
(`refactor(ingestion): harden child response guard`, i.e. the prompt 104
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
message narrowed to the 2 fixed child error message literals), 103
(`ParserChildErrorResponse` code narrowed to the fixed parser-child error code
literal `'parser_execution_failed'`), and 104 (`isParserChildResponse` runtime
guard hardened and dead executor timeout comparison eliminated).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 7 (geography and ingestion — child-process
parser isolation IPC contract, directly concluding the bidirectional IPC
hardening began in prompts 43, 74, 87, 101, 102, 103, and 104),
dependency-safe against prompts 68–104 (no schema, migration, contract,
route, permission, timeout/memory-bound, retention-window, or version-marker
change). In prompt 104, Non-goals explicitly recorded:
`- No changes to parser-child.entry.ts.`

Prompt 104 addressed the parent receiver side (`isParserChildResponse`). The
counterpart gap exists on the child receiver side in
`server/src/ingestion/parsers/parser-child.entry.ts`:
1. Shallow request type guard (lines 10–26):
   `isParserChildRequest(value: unknown): value is ParserChildRequest` currently
   only checks:
   ```ts
   req.type === 'parse' &&
   typeof req.id === 'string' &&
   isBuf &&
   typeof req.mediaType === 'string' &&
   typeof req.limits === 'object' &&
   req.limits !== null
   ```
   - It validates `typeof req.limits === 'object' && req.limits !== null`, which
     permits arrays, empty objects `{}`, non-numbers, negative limits, or
     floating-point values. When `parseSourceBuffer(buffer, rawMessage.mediaType, rawMessage.limits)`
     is subsequently called, the parser receives unvetted or undefined limits
     (`limits.maxRows`, `limits.maxColumns`, etc.), risking unhandled runtime
     exceptions or bypassed limits boundaries.
   - It validates `typeof req.id === 'string'` and `typeof req.mediaType === 'string'`
     without verifying that they are non-empty strings (`length > 0`).
2. Lack of direct unit test coverage:
   `isParserChildRequest` is an un-exported private function in
   `parser-child.entry.ts` and has zero direct unit tests asserting positive
   or negative boundary conditions.
3. Lack of child-process malformed request end-to-end test:
   `compiled-child-process-parser.spec.ts` tests benign CSV/XLSX/GeoJSON and
   parent timeout, but does not assert that sending a malformed request over
   IPC causes the child entrypoint to emit
   `PARSER_CHILD_MALFORMED_REQUEST_MESSAGE` and exit with code 1.

This prompt hardens `isParserChildRequest` with a dedicated `isParserLimits`
type guard validating all 6 `ParserLimits` fields as positive integers, asserts
non-empty strings for `id` and `mediaType`, exports both guards for direct
unit testing in `parser-child.entry.spec.ts`, and adds integration verification
in `compiled-child-process-parser.spec.ts`.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 7 definition (§8, ingestion/publication
  surface) with its skill manifest; §§16–22 confirming 12E–12K committed;
  §1 rule that open numeric limits need real input and must not be invented.
- `docs/ingestion.md` — § Child-process parser isolation (lines 185–223),
  recording child process IPC validation, lifecycle cleanup, and compile-time /
  runtime safety guards.
- `server/src/ingestion/parsers/parser-child.entry.ts` (lines 10–26 for
  `isParserChildRequest()`; lines 33–49 for malformed request handling).
- `server/src/ingestion/parsers/parser-ipc.types.ts` (lines 1–40 for
  `ParserChildRequest`, `ParserChildResponse`, `ParserChildErrorResponse`,
  `PARSER_CHILD_EXECUTION_FAILED_CODE`, `PARSER_CHILD_MALFORMED_REQUEST_MESSAGE`).
- `server/src/ingestion/parsers/parser.types.ts` (lines 33–40 for
  `ParserLimits` definition).
- `server/src/ingestion/parsers/child-process-parser.executor.ts` (lines 203–209
  for request dispatch; lines 292–313 for `isParserChildResponse()`).
- `server/src/ingestion/parsers/child-process-parser.executor.spec.ts` (lines
  547–658 for guard test pattern reference).
- `server/src/ingestion/parsers/compiled-child-process-parser.spec.ts` (lines
  90–158 for compiled child process integration test pattern).

## Measurements and verified invariants

1. `ParserLimits` specification from `parser.types.ts`:
   ```ts
   export interface ParserLimits {
     readonly maxRows: number;
     readonly maxColumns: number;
     readonly maxCellChars: number;
     readonly maxSampleRows: number;
     readonly maxGeojsonFeatures: number;
     readonly maxGeojsonCoordinates: number;
   }
   ```
   Invariant validation requirements in `isParserLimits(value: unknown): value is ParserLimits`:
   - `value` must be a non-null, non-array object (`typeof value === 'object' && value !== null && !Array.isArray(value)`).
   - `maxRows`: `typeof limits.maxRows === 'number' && Number.isInteger(limits.maxRows) && limits.maxRows > 0`
   - `maxColumns`: `typeof limits.maxColumns === 'number' && Number.isInteger(limits.maxColumns) && limits.maxColumns > 0`
   - `maxCellChars`: `typeof limits.maxCellChars === 'number' && Number.isInteger(limits.maxCellChars) && limits.maxCellChars > 0`
   - `maxSampleRows`: `typeof limits.maxSampleRows === 'number' && Number.isInteger(limits.maxSampleRows) && limits.maxSampleRows >= 0` (0 is permitted when no sample rows are requested)
   - `maxGeojsonFeatures`: `typeof limits.maxGeojsonFeatures === 'number' && Number.isInteger(limits.maxGeojsonFeatures) && limits.maxGeojsonFeatures > 0`
   - `maxGeojsonCoordinates`: `typeof limits.maxGeojsonCoordinates === 'number' && Number.isInteger(limits.maxGeojsonCoordinates) && limits.maxGeojsonCoordinates > 0`

2. `ParserChildRequest` specification from `parser-ipc.types.ts`:
   ```ts
   export interface ParserChildRequest {
     readonly type: 'parse';
     readonly id: string;
     readonly buffer: Buffer;
     readonly mediaType: string;
     readonly limits: ParserLimits;
   }
   ```
   Invariant validation requirements in `isParserChildRequest(value: unknown): value is ParserChildRequest`:
   - `value` must be a non-null, non-array object.
   - `req.type === 'parse'`
   - `typeof req.id === 'string' && req.id.trim().length > 0`
   - `Buffer.isBuffer(req.buffer) || (typeof req.buffer === 'object' && req.buffer !== null && req.buffer instanceof Uint8Array)`
   - `typeof req.mediaType === 'string' && req.mediaType.trim().length > 0`
   - `isParserLimits(req.limits)` returns true.

3. Fail-closed error response invariant on invalid request:
   If `!isParserChildRequest(rawMessage)`, `parser-child.entry.ts` constructs:
   ```ts
   const response: ParserChildResponse = {
     type: 'error',
     id:
       typeof (rawMessage as { id?: unknown })?.id === 'string'
         ? (rawMessage as { id: string }).id
         : '',
     code: PARSER_CHILD_EXECUTION_FAILED_CODE,
     message: PARSER_CHILD_MALFORMED_REQUEST_MESSAGE,
   };
   process.send!(response, () => {
     process.exit(1);
   });
   ```
   This error response matches `ParserChildErrorResponse` narrowed in prompt 102/103 and accepted by `isParserChildResponse` in prompt 104.

4. Wire contract invariant: `docs/api/contracts.md` / `generate-contracts.ts`
   untouched — verify with `npm run contracts:check`. Read models remain `string`.

## Expected impact

- Routes touched: None (internal child-process parser IPC boundary).
- APIs / schemas touched: None.
- Complete fail-closed runtime validation of child IPC requests entering the child process.
- Export of `isParserLimits` and `isParserChildRequest` enabling thorough unit testing.
- Integration test in `compiled-child-process-parser.spec.ts` asserting child rejection of malformed requests.

## Implementation plan

1. `server/src/ingestion/parsers/parser-child.entry.ts`:
   - Import `ParserLimits` from `./parser.types`.
   - Implement and export `isParserLimits(value: unknown): value is ParserLimits`.
   - Implement and export `isParserChildRequest(value: unknown): value is ParserChildRequest` utilizing `isParserLimits` and validating non-empty string fields (`id`, `mediaType`).
2. `server/src/ingestion/parsers/parser-child.entry.spec.ts`:
   - Create dedicated unit test suite testing `isParserLimits` and `isParserChildRequest` against all positive and negative boundary cases:
     - valid parse request with Buffer
     - valid parse request with Uint8Array
     - rejection of null, undefined, primitives, arrays
     - rejection of wrong type (e.g. 'execute', 'other')
     - rejection of non-string id, empty id, whitespace-only id
     - rejection of missing buffer or non-buffer object
     - rejection of non-string mediaType, empty mediaType, whitespace-only mediaType
     - rejection of missing or non-object limits
     - rejection of limits with non-integer, negative, zero, or missing properties (`maxRows`, `maxColumns`, `maxCellChars`, `maxSampleRows`, `maxGeojsonFeatures`, `maxGeojsonCoordinates`)
     - rejection of limits where `maxRows <= 0`, `maxColumns <= 0`, etc.
3. `server/src/ingestion/parsers/compiled-child-process-parser.spec.ts`:
   - Add integration test proving that sending a malformed request (e.g. missing limits or invalid buffer) to the compiled child process causes the child to send back `PARSER_CHILD_MALFORMED_REQUEST_MESSAGE` with `type: 'error'` and exit with code 1.
4. Spec checks:
   - `npm --workspace=@acres/server test -- parser-child.entry.spec.ts`
   - `npm --workspace=@acres/server test -- child-process-parser.executor.spec.ts`
   - `npm --workspace=@acres/server test -- compiled-child-process-parser.spec.ts`
5. Full repository verification:
   - `npm run contracts:check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
6. Documentation update:
   - Update `docs/ingestion.md` child-process parser isolation section to record that `isParserChildRequest()` and `isParserLimits()` enforce strict runtime validation of requests and resource limits entering the child process before parsing begins.
7. Two-stage code review:
   - Dispatch reviewer subagent via `requesting-code-review`.
   - Evaluate reviewer feedback via `receiving-code-review`.
8. Commit:
   - Commit locally to `main` using `caveman-commit`.

## Non-goals

- No changes to `ParserChildRequest`, `ParserChildResponse`, or `parser-ipc.types.ts`.
- No changes to `ParserLimits` or `parser.types.ts`.
- No changes to `child-process-parser.executor.ts` (already hardened in prompt 104).
- No changes to `parseSourceBuffer.ts` or parser engines.
- No database schema migrations or Prisma model alterations.
- No changes to read APIs or client types.

## Checks to run, and the owning doc

```bash
# Spec checks
npm --workspace=@acres/server test -- parser-child.entry.spec.ts
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

The owning documentation is `docs/ingestion.md`.

## SKILLS USED

- `nestjs-best-practices` — NestJS service and child process IPC architecture patterns.
- `architecture-patterns` — clean isolation and modular boundary between parent supervisor and child parser.
- `error-handling-patterns` — fail-closed validation, explicit error typing, and deterministic error propagation over IPC.
- `security-best-practices` — input validation and untrusted payload defense across process boundaries.
- `javascript-testing-patterns` — unit and integration testing of type guards, IPC boundaries, and child process exit behavior.
- `requesting-code-review` — structured dispatch of reviewer subagent with complete context and diff.
- `receiving-code-review` — technical evaluation and verification of reviewer feedback before committing.
- `caveman-commit` — conventional commit formatting with concise why-over-what rationale.
