# 112 — bound parser summary row numbers to the established row cap

## Scope, and why it is next

The committed repository is on `main` at `e8b48fe`
(`refactor(ingestion): narrow ParserIssue message`, the prompt 111
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 111 — which closed both `ParserIssue` string carriers and completed
the prompts 80–111 writer-narrowing lineage.

There is no unbuilt ordered phase left. The next smallest unblocked residual is
inside Phase 7's existing bounded-parser and hostile-parser requirements,
continuing the prompts 104–109 validator-hardening lineage (104 response
guard, 105 request guard, 106 non-empty ids, 107 metadata fail-closed, 108
finite scalars, 109 row-map widths) to its last unbounded integer edge.

The gap: `validateUntrustedSummary()` in
`server/src/ingestion/parsers/child-process-parser.executor.ts` bounds
`rowCount`, `columnCount`, `columnKeys.length`, sample-row widths,
validation-row widths, issue counts, string lengths, and scalar finiteness —
but it does **not** bound either `rowNumber` site above:

1. every `validationRows[].rowNumber` (checked near `:411–417` — re-verify
   exact lines at execution): `typeof` / integer / `>= 1` only, no upper
   bound;
2. every `issues[].rowNumber` (checked near `:470–477`): `typeof` / integer /
   `>= 1` only, no upper bound.

Both flow verbatim into PostgreSQL `Int` (32-bit) columns:

- `ValidationIssue.rowNumber` (`Int?`, `server/prisma/schema.prisma` near
  `:680`) via the five-tributary merge persist in
  `ingestion-processor.service.ts` (`rowNumber: issue.rowNumber` near
  `:200`), where region-mapping issues additionally copy
  `sample.rowNumber` from `validationRows` (`:352`, `:361`);
- `MetricObservation.sourceRowNumber` (`Int?`, `schema.prisma` near `:792`)
  via `AnalyticsPublicationService.publish()` (`sourceRowNumber:
observation.rowNumber`, `:188`, `:204–205`), where `observation.rowNumber`
  copies `row.rowNumber` from `validationRows` (`:271`).

A malformed or hostile child can therefore return one declared row while
stamping `rowNumber: 9007199254740991` (or any integer above `2147483647`) on
a validation row or an issue. It passes validation today, then fails at the
Prisma/PostgreSQL layer with an out-of-range integer — the wrong outcome
(`failed` / unexpected-publication instead of `validation_failed` / the
deterministic safe parser failure) and, on the persist path, a transaction
abort instead of a clean fail-closed rejection. The child has its own heap
ceiling, but that does not make an unbounded parent-side success shape valid.

This prompt closes only that upper-bound gap. It reuses the already-established
`maxRowsAllowed` value at both row-number sites — the exact variable prompts
107–109 already compute (`expectedKind === 'geojson' ?
limits.maxGeojsonFeatures + 1 : limits.maxRows + 1`). It does not invent a new
number, change configured limits, require exact equality with `rowCount`, or
restate the PostgreSQL `Int` maximum as the bound. The `+ 1` behavior is
preserved because it is already the parent validator's accepted ceiling for
declared rows (CSV/XLSX trusted producers legitimately emit `maxRows + 1`;
see §Measurements item 2); changing that policy needs separate producer-level
evidence.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 7's bounded CSV/XLSX/GeoJSON parsing outcome,
  excessive-row and hostile-parser tests, fail-safe behavior, documentation
  owner, and exact phase skill manifest.
- `docs/backend.md` — current Nest modular-monolith/server conventions and root
  build/test command ownership; no module, provider, route, or database surface
  changes in this prompt.
- `docs/ingestion.md` — parser limits (`PARSER_MAX_ROWS=10000`,
  `PARSER_MAX_GEOJSON_FEATURES=2500`), child-process isolation, untrusted IPC
  validation, deterministic safe-error behavior, the five-tributary merge with
  both `ParserIssue` carriers closed (prompts 110–111), and the owning
  implementation record (this prompt extends the same
  `Untrusted IPC Validation` paragraph that prompts 104–111 extended).
- `docs/security.md` — TM-07 and the Phase 7A parser-boundary update. This work
  strengthens the existing child-to-parent IPC validation edge; it does not add
  or move a trust boundary or claim OS/container sandboxing.
- `server/src/ingestion/parsers/child-process-parser.executor.ts` —
  `maxRowsAllowed` (near `:331–334` at `e8b48fe`), the
  `validationRows[].rowNumber` check (`:411–417`), the `issues[].rowNumber`
  check (`:470–477`), and the `execute()` safe-failure mapping. Re-read the
  file at execution time and resolve current line numbers rather than editing
  from this snapshot.
- `server/src/ingestion/parsers/parser.types.ts` — `ParserIssue.rowNumber?`
  (`:115`) and `ParsedSourceSummary` validation-row `rowNumber` (`:127`); both
  interfaces remain unchanged.
- Trusted row-number producers (small, bounded; re-verify every site by grep
  at execution — the file:line pointers below are at `e8b48fe`):
  - `server/src/ingestion/parsers/csv-source.parser.ts` — `:75`
    (`rowNumber: rowIndex + 2` on cell issues), `:80`
    (`formulaIssue(rowIndex + 2, key)`), `:84`
    (`{ rowNumber: rowIndex + 2, values: sample }`); records sliced to
    `limits.maxRows` (`:63–64`), parsed with `to_line: maxRows + 2` (`:40`);
  - `server/src/ingestion/parsers/xlsx-source.parser.ts` — `:96`, `:101`,
    `:104` (same `rowIndex + 2` shape); data rows sliced to
    `1 + limits.maxRows` (`:85–86`);
  - `server/src/ingestion/parsers/geojson-source.parser.ts` — `:95`
    (`{ rowNumber: featureIndex + 1, values: sample }`); features sliced to
    `limits.maxGeojsonFeatures` (`:50`);
  - `server/src/ingestion/parsers/parser-utils.ts` — `formulaIssue(rowNumber,
columnKey)` (`:32–40`); pass-through, unchanged.
- Downstream copies (bounded transitively once the validator is bounded; read-
  only, unchanged):
  - `server/src/ingestion/ingestion-processor.service.ts` — merge persist
    (`rowNumber: issue.rowNumber`, `:200`), `validateMapping()` row copies
    (`:352`, `:361` from `summary.validationRows`);
  - `server/src/analytics/analytics-publication.service.ts` — `publish()`
    `sourceRowNumber: observation.rowNumber` (`:188`, `:204–205`),
    `rowNumber: row.rowNumber` (`:271`); `validateMapping()` /
    `validateRemappingCompatibility()` never set `rowNumber`.
- `server/prisma/schema.prisma` — `ValidationIssue.rowNumber Int?` (`:680`),
  `MetricObservation.sourceRowNumber Int?` (`:792`); schema, migrations, and
  RLS are untouched.
- `server/src/ingestion/parsers/child-process-parser.executor.spec.ts` — the
  fake child-process harness, `defaultLimits` (`maxRows: 10`,
  `maxGeojsonFeatures: 5`, `:49–56`), `createValidSummary()` (`rowNumber: 2`,
  `:67`), and the focused `validateUntrustedSummary` suite extended by
  prompts 107–109.
- `server/src/ingestion/parsers/source-parsers.spec.ts` and
  `server/src/ingestion/parsers/compiled-child-process-parser.spec.ts` — valid
  in-process and compiled child/parent producer compatibility evidence.
- `server/src/ingestion/ingestion-processor.service.spec.ts` — merge-site
  construction (`rowNumber` fixtures, e.g. `:287`-area `columnKey: 'val'`
  cases); valid small row numbers, unchanged.
- `prompts/109-parser-summary-row-width-validation.md` — immediately prior
  prompt, two-site boundary-test pattern, and the docs paragraph this prompt
  extends.
- `prompts/110-parser-issue-code-narrowing.md` and
  `prompts/111-parser-issue-message-narrowing.md` — carrier-narrowing
  precedent; this prompt touches neither carrier.

No visual reference is applicable. This is an internal server-only validation
change, so the design-system PDF, landing-page PNGs, and recorded chrome flows
provide no evidence and must not be opened or cited as if they did.

## Measurements and verified invariants

These are code-derived constraints at `e8b48fe`; re-verify them before editing:

1. `maxRowsAllowed` is already calculated once as
   `expectedKind === 'geojson' ? limits.maxGeojsonFeatures + 1 :
limits.maxRows + 1`. With the focused suite's `defaultLimits` (`maxRows:
10`, `maxGeojsonFeatures: 5`), exactly `11` is the accepted CSV boundary
   (`12` exceeds it) and exactly `6` is the accepted GeoJSON boundary (`7`
   exceeds it).
2. Trusted producers never exceed `maxRowsAllowed`:
   - CSV: `rowIndex` in `[0, maxRows - 1]` (sliced `:63–64`), so `rowNumber =
rowIndex + 2` is in `[2, maxRows + 1]` — the boundary is hit exactly at
     full capacity;
   - XLSX: same `rowIndex + 2` shape over `rows.slice(1, 1 + maxRows)`, so
     `[2, maxRows + 1]` — boundary hit exactly;
   - GeoJSON: `featureIndex` in `[0, maxGeojsonFeatures - 1]` (sliced `:50`),
     so `rowNumber = featureIndex + 1` is in `[1, maxGeojsonFeatures]` — one
     under the boundary.
     Issue `rowNumber`s from cell/formula producers use the same expressions and
     share the same maxima. Limit-level issues (`row_limit_exceeded`,
     `feature_limit_exceeded`) carry no `rowNumber`.
3. Required rule: after the existing integer/`>= 1` checks pass at each of the
   two sites, reject the complete untrusted summary when the row number exceeds
   `maxRowsAllowed`. The lower bound (`>= 1`), integer check, and `typeof`
   check remain byte-for-byte equivalent — GeoJSON row 1 and CSV/XLSX row 2
   stay valid, and `0`, negatives, fractions, and non-numbers stay rejected.
4. Exactly `maxRowsAllowed` remains valid and is preserved (CSV/XLSX at full
   capacity depend on it). Empty validation-row arrays remain valid; no minimum
   row count and no `rowCount`-equality rule is introduced.
5. A row number below the cap that names a non-existent row (sparse, gapped, or
   duplicated numbering), or any mismatch among `rowCount`,
   `validationRows.length`, and row numbers, is deliberately not resolved here.
   Those are semantic-consistency questions, not required to close the
   unbounded-integer gap — the same scoping line prompt 109 drew for widths.
6. Existing outer bounds remain unchanged: `rowCount`, `columnCount`,
   `columnKeys`, sample/validation outer-array counts, issue counts/details,
   metadata, finite-number checks, key/string/cell bounds, and the
   `maxColumnsAllowed` row-width rule from prompt 109.
7. When validation returns `null`, `execute()` maps the child success response
   to the existing fixed `parser_execution_failed` summary and performs the
   existing disconnect/kill/listener cleanup. No rejected row number is
   returned or logged.
8. Current production parsers are expected to emit row numbers within the
   established cap at full capacity. Focused producer and compiled-IPC tests
   must prove this premise. If a valid fixture contradicts it, stop rather
   than weakening the parent boundary or changing a parser opportunistically.
9. The PostgreSQL `Int` range (`-2147483648..2147483647`) is context, not the
   bound: `maxRowsAllowed` (≈10001 / 2501 in production) sits orders of
   magnitude below it, so the tighter cap kills the overflow class entirely
   with no new number and no schema awareness in the validator.

The required implementation shape is intentionally local, mirroring prompt 109.
At each of the two row-number sites, extend the existing condition (following
repository formatting):

```ts
if (
  typeof row.rowNumber !== "number" ||
  !Number.isInteger(row.rowNumber) ||
  row.rowNumber < 1 ||
  row.rowNumber > maxRowsAllowed
) {
  return null;
}
```

Do not introduce a shared row-number helper for these two adjacent checks, and
do not restate the `Int` maximum anywhere in source or docs.

## Expected impact

- Routes changed: none.
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none.
- Database schema, Prisma models, migrations, RLS, queries, indexes, queues, and
  persisted-data formats changed: none.
- Valid CSV/XLSX/GeoJSON parser summaries: unchanged in values, order, and
  shape — including at-full-capacity summaries whose final row number equals
  `maxRowsAllowed`.
- Malformed/hostile child success summaries: any validation-row or issue row
  number above `limits.maxRows + 1` (or `limits.maxGeojsonFeatures + 1` for
  GeoJSON) rejects the complete summary and resolves through the existing
  deterministic safe parser failure.
- Downstream copies (`ValidationIssue.rowNumber`,
  `MetricObservation.sourceRowNumber`, region-mapping issues) can no longer
  receive an above-cap integer from the child path; trusted small numbers flow
  unchanged.
- Logging/observability: unchanged; rejected row numbers are not logged or
  exposed.
- Threat model: no new boundary and no risk reclassification. The change adds a
  concrete enforcement detail under the existing TM-07 mitigation.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and every
   skill named in `## SKILLS USED`. Confirm `git status --short` before editing;
   preserve any unrelated user changes and stop if they overlap an approved
   path. Confirm `HEAD` is `e8b48fe` (or record the actual SHA and adjust
   `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–2 at execution: re-run the producer
   `rowNumber` grep (`csv/xlsx/geojson-source.parser.ts`, `parser-utils.ts`)
   excluding specs, confirm the `[2, maxRows + 1]` / `[1, maxGeojsonFeatures]`
   maxima, and confirm `schema.prisma` still declares both durable columns as
   `Int?`. If a producer emits row numbers outside `maxRowsAllowed`, or a
   durable column is no longer `Int`, stop and report it rather than silently
   changing the bound.
3. In
   `server/src/ingestion/parsers/child-process-parser.executor.spec.ts`, extend
   `describe('validateUntrustedSummary', ...)` before production code:
   - add a table-driven rejection matrix with one otherwise-valid summary whose
     `validationRows[0].rowNumber` is `defaultLimits.maxRows + 2` (CSV kind)
     and one whose `issues[0]` carries `rowNumber: defaultLimits.maxRows + 2`
     on an otherwise-valid fixed-literal issue (use a union member, e.g. a
     `ParserProducerCode` / `ParserProducerMessage` pair, so the only failing
     condition is the row number);
   - add the GeoJSON-kind mirror: `validationRows[0].rowNumber` of
     `defaultLimits.maxGeojsonFeatures + 2` with `sourceKind: 'geojson'`;
   - keep counts, columns, keys, values, codes, messages, and metadata within
     their current accepted bounds so the row number is the only failing
     condition;
   - assert `validateUntrustedSummary(...)` returns `null` for all three.
4. Add a positive boundary matrix in the same suite:
   - exercise exactly `defaultLimits.maxRows + 1` as a CSV `validationRows[0]`
     row number and as an issue row number, and exactly
     `defaultLimits.maxGeojsonFeatures + 1` as a GeoJSON validation-row number;
   - keep the complete summaries otherwise valid;
   - assert validation succeeds and the boundary row numbers are preserved.
5. In the executor-level `ChildProcessParserExecutor` suite, add one fake-child
   case whose response id matches the generated request id and whose success
   summary is fully valid except for one validation-row `rowNumber` of
   `defaultLimits.maxRows + 2`:
   - assert the resolved value is the existing fixed
     `parser_execution_failed` summary with empty rows and metadata;
   - assert the oversized row number is absent from the serialized result;
   - assert the child is disconnected, killed, removed from active lifecycle
     handling, and has its listeners removed, following existing cleanup
     assertions;
   - do not add a new error code/message or expose the rejected payload.
6. Run the focused executor spec against the pre-change validator and confirm
   the three over-cap unit cases and executor-path case fail for the expected
   reason while the exact-boundary cases pass. Do not commit a red test state.
7. In
   `server/src/ingestion/parsers/child-process-parser.executor.ts`, change only
   the two row-number conditions inside `validateUntrustedSummary()`:
   - the `validationRows[].rowNumber` check: add
     `row.rowNumber > maxRowsAllowed` to the existing reject condition;
   - the `issues[].rowNumber` check: add
     `issue.rowNumber > maxRowsAllowed` to the existing reject condition;
   - leave every other check, bound, sanitization, and assignment unchanged.
8. Do not touch the `maxRowsAllowed` / `maxColumnsAllowed` formulas, `rowCount`,
   `columnCount`, `columnKeys`, sample/validation outer-array bounds, row-width
   checks, finite-number checks, issue/detail or metadata validation, code /
   message gates, response/request guards, safe literals, watchdog, fork
   options, or process cleanup.
9. Run focused regression tests for the executor and all three real parser
   producers, including compiled child/parent IPC and the ingestion-processor
   merge-site suite. If any valid production parser summary exceeds the
   established row-number ceiling, stop and report the exact fixture and shape;
   do not raise the bound, truncate/clamp row numbers, or rewrite the producer
   within this prompt.
10. Run `npm run contracts:check` and verify no generated REST/OpenAPI/GraphQL
    artifact changes. This internal validation rule must not alter a public
    contract snapshot.
11. Update `docs/ingestion.md` in the `Child-process parser isolation` /
    `Untrusted IPC Validation` paragraph that prompts 104–111 extended. Record
    that every validation-row and issue row number is bounded above to the
    already-established `maxRowsAllowed` ceiling (`maxRows + 1`, or
    `maxGeojsonFeatures + 1` for GeoJSON); that an over-cap row number rejects
    the whole summary through the existing safe failure; that exact-boundary
    and valid parser outputs remain unchanged; that the tighter cap sits far
    below the PostgreSQL `Int` range so no out-of-range integer can reach
    `ValidationIssue.rowNumber` or `MetricObservation.sourceRowNumber` from the
    child path; and that no new configured limit was introduced.
12. Inspect the complete diff, run every check below, and quote real exit status
    plus meaningful test/build totals. Fix issues before review.
13. Run the mandatory two-stage review loop:
    - dispatch a read-only reviewer subagent with `requesting-code-review`, this
      prompt path, `BASE_SHA=e8b48fe` (or the recorded actual HEAD), the
      working-tree diff (or implementation `HEAD_SHA` if an intermediate
      commit is explicitly required), changed paths, constraints, and real
      check outputs;
    - process every finding with `receiving-code-review`: understand and verify
      it against source and requirements before changing code; fix blocking and
      important valid findings in order, test each fix, and give technical
      pushback where evidence disproves a suggestion;
    - request follow-up review if a valid fix materially changes architecture,
      a public contract, data flow, or the trust boundary.
14. Commit locally on `main` using `caveman-commit`. Stage only:
    - `prompts/112-parser-summary-row-number-validation.md`;
    - `server/src/ingestion/parsers/child-process-parser.executor.ts`;
    - `server/src/ingestion/parsers/child-process-parser.executor.spec.ts`;
    - `docs/ingestion.md`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend, or
      push. Use a terse Conventional Commit subject and include a short body
      explaining the security/resource-bound reason because it is not obvious
      from the subject alone.

## Non-goals

- No new numeric or byte-size limit and no change to `PARSER_MAX_ROWS=10000`,
  `PARSER_MAX_GEOJSON_FEATURES=2500`, their environment bounds, or any
  `ParserLimits` type.
- No restatement of the PostgreSQL `Int` maximum as a validator bound and no
  schema migration (no `BigInt`, no check constraint); the tighter existing
  cap subsumes it.
- No exact-equality rule among `rowCount`, `validationRows.length`, and row
  numbers; no gap/duplicate/sparsity policy for row numbering.
- No lower-bound change: `>= 1` stays exactly as it is (GeoJSON row 1 and
  CSV/XLSX row 2 remain the minima).
- No truncation, clamping, remapping, or partial acceptance of an over-cap row
  number. The complete summary fails closed.
- No changes to `ParsedSourceSummary`, `ParserIssue`, or IPC request/response
  TypeScript interfaces; no narrowing of `columnKey`, `details`, `severity`,
  `code`, or `message` (prompts 110–111 closed the carriers).
- No changes to issue/detail or metadata entry ceilings, prompt 108 finite
  scalar rules, key/string/cell bounds, row/count integer rules, row-width
  rules, or safe failure literals.
- No changes to CSV, XLSX, GeoJSON, `parser-utils.ts`, or `parseSourceBuffer`
  producers unless a focused valid-fixture regression disproves the premise; in
  that case stop instead of expanding scope.
- No schema migration, SQL, Prisma repository, RLS, index, tenant, worker queue,
  storage, upload, route, API contract, client, design, accessibility, motion,
  or browser work.
- No OS/container parser sandboxing, seccomp, UID isolation, network namespace,
  parent-process heap limit, streaming IPC protocol, or aggregate serialized
  byte limit.
- No general validator refactor or unrelated cleanup.

## Reference deltas

No visual delta. The deliberate behavioral delta is limited to malformed child
success summaries: a validation-row or issue row number above the existing
declared row ceiling now fails atomically. Valid summaries and public output
remain unchanged.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this internal server boundary.

## Checks to run, and the owning doc

```bash
# Focused parent-boundary and executor behavior
npm --workspace=@acres/server test -- child-process-parser.executor.spec.ts

# Real parser-producer, compiled IPC, and merge-site compatibility
npm --workspace=@acres/server test -- source-parsers.spec.ts
npm --workspace=@acres/server test -- compiled-child-process-parser.spec.ts
npm --workspace=@acres/server test -- ingestion-processor.service.spec.ts

# Public contracts must remain unchanged
npm run contracts:check

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/112-parser-summary-row-number-validation.md \
  docs/ingestion.md \
  server/src/ingestion/parsers/child-process-parser.executor.ts \
  server/src/ingestion/parsers/child-process-parser.executor.spec.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/112-parser-summary-row-number-validation.md \
  docs/ingestion.md \
  server/src/ingestion/parsers/child-process-parser.executor.ts \
  server/src/ingestion/parsers/child-process-parser.executor.spec.ts
```

Quote the actual exit status and meaningful Jest/build totals. If a named spec
does not exist at execution time, locate the closest current equivalent with
`rg --files server/src/ingestion`, run it, and record that evidence instead of
claiming a nonexistent check. Browser E2E, real PostgreSQL, spatial plan, and
operations-drill suites are intentionally omitted because this scope never
reaches the database on the reject path (fail-closed before any write), changes
no schema/query behavior, and touches no browser journey or deployment surface.

`docs/ingestion.md` owns the implementation record. `docs/security.md` is
read-only verification for this task because TM-07 already states bounded
row/column parsing and untrusted IPC validation; update it only if execution
proves that statement materially stale, and stop before broadening scope.

## Rollback and stop conditions

Rollback is a source/test/doc revert; there is no migration or persisted-data
rollback. Stop before expanding scope if any of these occur:

- a valid committed CSV, XLSX, or GeoJSON fixture emits a validation-row or
  issue row number above `maxRowsAllowed`;
- the existing `+ 1` ceiling is not actually shared by accepted declared-row
  shapes at execution time (e.g. a producer legitimately emits `maxRows + 2`);
- a durable column is no longer `Int` at execution time, changing the overflow
  premise;
- a public contract snapshot changes;
- an exact-boundary valid summary changes shape, key order, or values;
- the fix requires a new limit, truncation/clamping policy, error code/message,
  schema change, producer rewrite, or IPC protocol change;
- repository evidence shows over-cap row numbers are intentionally accepted by
  a documented consumer.

Report the contradictory evidence and prepare a separate prompt rather than
silently changing the premise.

## Completion criteria

- Every `validationRows[].rowNumber` above `maxRowsAllowed` rejects the whole
  untrusted summary.
- Every `issues[].rowNumber` above `maxRowsAllowed` rejects the whole untrusted
  summary.
- Exactly `maxRowsAllowed` remains accepted and preserved at both sites, for
  both CSV and GeoJSON kinds.
- Over-cap rejection is atomic; no row numbers are truncated, clamped,
  remapped, returned, or logged.
- A fake-child executor test proves the existing fixed safe failure and cleanup
  behavior for an over-cap row number.
- Current CSV, XLSX, GeoJSON, compiled child-process, and merge-site tests pass
  unchanged.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status checks
  pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all verified
  blocking/important findings are fixed and re-tested.
- `docs/ingestion.md` records the row-number upper-bound invariant.
- Only the four approved paths are committed locally to `main`; nothing is
  pushed.

## SKILLS USED

- `architecture-patterns` — preserve the existing parser port/child adapter and
  parent-supervisor boundary without introducing module coupling.
- `nestjs-best-practices` — keep validation in the existing Nest ingestion
  boundary and avoid unrelated provider/module changes.
- `postgres-best-practices` — verify that this residual requires no schema,
  migration, transaction, RLS, or persistence-contract change, and that the
  tighter existing cap subsumes the `Int` range.
- `security-best-practices` — enforce an existing resource allowlist at the
  untrusted TypeScript IPC boundary without exposing rejected data; no Nest-
  specific reference file exists in the installed skill, so repository
  security docs and code are authoritative here.
- `security-threat-model` — verify the work strengthens documented TM-07 at the
  existing child-to-parent boundary and does not invent a new boundary, asset,
  or risk rating.
- `error-handling-patterns` — fail fast on malformed row numbers and reuse the
  deterministic safe result and cleanup path.
- `javascript-testing-patterns` — add boundary-value, negative-matrix,
  preservation, and executor-path Jest coverage.
- `e2e-testing-patterns` — confirm the internal validator is correctly covered
  below the E2E layer and that no browser/cross-system suite is warranted.
- `sql-optimization-patterns` — verify no query, index, or query-plan work is
  introduced by this in-memory validation change.
- `requesting-code-review` — dispatch the mandatory structured read-only review
  with precise scope, SHAs, changed paths, and check evidence.
- `receiving-code-review` — verify reviewer claims against repository reality
  before fixes or technical pushback.
- `caveman-commit` — produce the required terse Conventional Commit message
  with a short security rationale body.
