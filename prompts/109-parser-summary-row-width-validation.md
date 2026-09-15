# 109 — bound parser summary row-map widths

## Scope, and why it is next

The committed repository is on `main` at `c93115b`
(`docs(prompts): add message narrowing plans`). The latest implementation commit
is `e79d79b` (`fix(ingestion): reject non-finite scalars`, the prompt 108
implementation); the later `c93115b` commit only restores already-implemented
prompt artifacts and does not move the implementation frontier. The worktree is
clean. All 12 ordered phases in `docs/build-plan.md` are implemented and
committed through the Phase 12K exit gate, followed by dependency-safe residual
hardening through prompt 108.

There is no unbuilt ordered phase left. The next smallest unblocked residual is
inside Phase 7's existing bounded-parser and hostile-parser requirements:
`validateUntrustedSummary()` bounds `columnCount` and `columnKeys.length` to
`limits.maxColumns + 1`, but it does not bound the number of own enumerable
properties in either of the row-map containers it copies:

1. every object in `sampleRows`;
2. every `validationRows[].values` object.

A malformed or hostile child can therefore declare one column while returning a
sample or validation row with arbitrarily many scalar properties. Each key and
string value is individually length-bounded, and prompt 108 now rejects
non-finite numeric scalars, but neither control bounds the total width of a row
map. The parent copies every accepted property into the returned
`ParsedSourceSummary`; validation rows then remain eligible for downstream
mapping/normalization and staged-summary persistence. The child has its own heap
ceiling, but that does not make an unbounded parent-side success shape valid.

This prompt closes only that width gap. It reuses the already-established
`maxColumnsAllowed = limits.maxColumns + 1` value at both row-map sites. It does
not invent a new number, change configured limits, require exact equality with
`columnCount`, or introduce column-key membership semantics. The `+ 1` behavior
is preserved because it is already the parent validator's accepted ceiling for
declared columns and accommodates the existing one-over-limit/synthetic-column
summary shapes; changing that policy needs separate producer-level evidence.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 7's bounded CSV/XLSX/GeoJSON parsing outcome,
  excessive-column and hostile-parser tests, fail-safe behavior, documentation
  owner, and exact phase skill manifest.
- `docs/backend.md` — current Nest modular-monolith/server conventions and root
  build/test command ownership; no module, provider, route, or database surface
  changes in this prompt.
- `docs/ingestion.md` — parser limits (`PARSER_MAX_COLUMNS=200`), child-process
  isolation, untrusted IPC validation, deterministic safe-error behavior, and
  the owning implementation record.
- `docs/security.md` — TM-07 and the Phase 7A parser-boundary update. This work
  strengthens the existing child-to-parent IPC validation edge; it does not add
  or move a trust boundary or claim OS/container sandboxing.
- `server/src/ingestion/parsers/child-process-parser.executor.ts` —
  `ChildProcessParserExecutor.execute()`, the safe-failure mapping, and the
  complete `validateUntrustedSummary()` implementation. At `c93115b`,
  `maxColumnsAllowed` is established near lines 325–329; `columnCount` and
  `columnKeys` use it near lines 340–359; `sampleRows` are copied near lines
  361–389 with no entry-count check; and `validationRows[].values` are copied
  near lines 391–439 with no entry-count check. Re-read the file at execution
  time and resolve current line numbers rather than editing from this snapshot.
- `server/src/ingestion/parsers/child-process-parser.executor.spec.ts` — the
  fake child-process harness, `defaultLimits` (`maxColumns: 5`),
  `createValidSummary()`, executor safe-failure assertions, and the focused
  `validateUntrustedSummary` suite extended by prompts 107–108.
- `server/src/ingestion/parsers/parser.types.ts` — `ParsedSourceSummary` row-map
  shapes and `ParserLimits.maxColumns`; all interfaces remain unchanged.
- `server/src/ingestion/parsers/csv-source.parser.ts` — CSV header-derived
  `columnKeys`, validation rows, samples, and current `column_limit_exceeded`
  producer behavior.
- `server/src/ingestion/parsers/xlsx-source.parser.ts` — XLSX header-derived
  `columnKeys`, validation rows, samples, and current `column_limit_exceeded`
  producer behavior.
- `server/src/ingestion/parsers/geojson-source.parser.ts` — property-key union,
  synthetic `geometry_type` column, validation rows, and samples. This is why
  the prompt preserves the established parent-side `+ 1` ceiling rather than
  substituting `limits.maxColumns` from memory.
- `server/src/ingestion/parsers/parser-utils.ts` — scalar normalization and
  cell bounding; reference-only and unchanged.
- `server/src/ingestion/parsers/source-parsers.spec.ts` and
  `server/src/ingestion/parsers/compiled-child-process-parser.spec.ts` — valid
  in-process and compiled child/parent producer compatibility evidence.
- `prompts/107-parser-summary-metadata-fail-closed.md` — fail-closed container
  validation and boundary-test pattern.
- `prompts/108-parser-summary-finite-number-validation.md` — immediately prior
  scalar validation, atomic safe-failure behavior, and explicit preservation of
  all existing row/count bounds.

No visual reference is applicable. This is an internal server-only validation
change, so the design-system PDF, landing-page PNGs, and recorded chrome flows
provide no evidence and must not be opened or cited as if they did.

## Measurements and verified invariants

These are code-derived constraints at `c93115b`; re-verify them before editing:

1. `maxColumnsAllowed` is already calculated once as
   `limits.maxColumns + 1`. With the focused suite's `defaultLimits.maxColumns`
   of 5, exactly 6 properties are the accepted boundary and 7 exceed it.
2. `summary.columnCount` and `summary.columnKeys.length` already reject values
   above `maxColumnsAllowed`. Their current zero/minimum behavior, equality (or
   lack of equality), ordering, duplicate-key behavior, and key grammar remain
   unchanged.
3. `summary.sampleRows.length` is bounded by `limits.maxSampleRows`, but each
   row currently loops over all `Object.entries(row)` without checking the entry
   count.
4. `summary.validationRows.length` is bounded by `maxRowsAllowed`, but each
   `row.values` object currently loops over all `Object.entries(row.values)`
   without checking the entry count.
5. Required rule: obtain the entries once for each row map, reject the complete
   untrusted summary when the entry array length exceeds
   `maxColumnsAllowed`, then validate and copy those same entries through the
   existing key/scalar/finite-number/string-length rules.
6. Exactly `maxColumnsAllowed` entries remain valid and are preserved. Empty
   maps remain valid under this prompt because no minimum or declared-shape
   consistency rule exists today.
7. A row with fewer entries than the declared column list, extra keys not named
   in `columnKeys`, duplicate normalized header semantics, or a mismatch among
   `columnCount`, `columnKeys`, and row keys is deliberately not resolved here.
   Those are semantic-consistency questions, not required to close the
   unbounded-width gap.
8. Existing property rules remain byte-for-byte equivalent: keys may be at most
   `MAX_STRING_LENGTH` (200); values must be `null`, string, finite number, or
   boolean; strings may be at most `limits.maxCellChars`.
9. Existing outer bounds remain unchanged: sample count, validation-row count,
   row numbers, issues/details, metadata, `columnCount`, and `columnKeys` use
   their current checks.
10. When validation returns `null`, `execute()` maps the child success response
    to the existing fixed `parser_execution_failed` summary and performs the
    existing disconnect/kill/listener cleanup. No rejected key or value is
    returned or logged.
11. Current production parsers are expected to emit row maps no wider than
    their accepted declared-column ceiling. Focused producer and compiled-IPC
    tests must prove this premise. If a valid fixture contradicts it, stop rather
    than weakening the parent boundary or changing a parser opportunistically.

The required implementation shape is intentionally local. Use each entries
array for both the count and loop, following repository formatting:

```ts
const entries = Object.entries(row);
if (entries.length > maxColumnsAllowed) return null;
for (const [k, v] of entries) {
  // existing validation and copy, unchanged
}
```

Use a distinct clear local name for the validation-row entries if needed. Do
not call `Object.entries(...)` once for the count and again for iteration, and
do not introduce a shared validator abstraction for these two adjacent loops.

## Expected impact

- Routes changed: none.
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none.
- Database schema, Prisma models, migrations, RLS, queries, indexes, queues, and
  persisted-data formats changed: none.
- Valid CSV/XLSX/GeoJSON parser summaries: unchanged in values, order, and
  shape.
- Malformed/hostile child success summaries: any sample-row or validation-row
  values map wider than `limits.maxColumns + 1` rejects the complete summary and
  resolves through the existing deterministic safe parser failure.
- Logging/observability: unchanged; rejected row content is not logged or
  exposed.
- Threat model: no new boundary and no risk reclassification. The change adds a
  concrete enforcement detail under the existing TM-07 mitigation.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and every
   skill named in `## SKILLS USED`. Confirm `git status --short` before editing;
   preserve any unrelated user changes and stop if they overlap an approved
   path.
2. In
   `server/src/ingestion/parsers/child-process-parser.executor.spec.ts`, extend
   `describe('validateUntrustedSummary', ...)` before production code:
   - add a table-driven rejection matrix with one otherwise-valid summary whose
     `sampleRows[0]` has `defaultLimits.maxColumns + 2` own enumerable scalar
     properties and one whose `validationRows[0].values` has the same width;
   - keep `columnCount` and `columnKeys` within their current accepted bounds so
     the only failing condition is the row-map width;
   - assert `validateUntrustedSummary(...)` returns `null` for both sites;
   - generate neutral keys such as `column_0`, not product/customer data, and
     use short valid scalar values so no key/value limit confounds the test.
3. Add a positive boundary matrix in the same suite:
   - exercise exactly `defaultLimits.maxColumns + 1` entries in a sample row and
     exactly that many entries in a validation-row values map;
   - keep the complete summary otherwise valid and its declared columns within
     the same existing boundary;
   - assert validation succeeds and every key/value is preserved;
   - include no new assumption that all row keys must equal `columnKeys` unless
     the fixture naturally uses the same keys for clarity.
4. In the executor-level `ChildProcessParserExecutor` suite, add one fake-child
   case whose response id matches the generated request id and whose success
   summary is fully valid except for one row map containing
   `defaultLimits.maxColumns + 2` scalar entries:
   - assert the resolved value is the existing fixed
     `parser_execution_failed` summary with empty rows and metadata;
   - assert the oversized row's keys/values are absent from the serialized
     result;
   - assert the child is disconnected, killed, removed from active lifecycle
     handling, and has its listeners removed, following existing cleanup
     assertions;
   - do not add a new error code/message or expose the rejected payload.
5. Run the focused executor spec against the pre-change validator and confirm
   the two over-width unit cases and executor-path case fail for the expected
   reason while the exact-boundary cases pass. Do not commit a red test state.
6. In
   `server/src/ingestion/parsers/child-process-parser.executor.ts`, change only
   the two row-map loops inside `validateUntrustedSummary()`:
   - after validating that a sample row is a non-null, non-array object, obtain
     `Object.entries(row)`, reject when its length exceeds
     `maxColumnsAllowed`, and iterate that same entries array;
   - after validating that `validationRows[].values` is a non-null, non-array
     object, obtain `Object.entries(row.values)`, reject when its length exceeds
     `maxColumnsAllowed`, and iterate that same entries array;
   - leave every existing per-entry check and assignment unchanged.
7. Do not touch the `maxColumnsAllowed` formula, `columnCount`, `columnKeys`,
   sample/validation outer-array bounds, row-number validation, issue/detail or
   metadata validation, finite-number checks, response/request guards, safe
   literals, watchdog, fork options, or process cleanup.
8. Run focused regression tests for the executor and all three real parser
   producers, including compiled child/parent IPC. If any valid production
   parser summary exceeds the established row-map ceiling, stop and report the
   exact fixture and shape; do not raise the bound, truncate/drop properties, or
   rewrite the producer within this prompt.
9. Run `npm run contracts:check` and verify no generated REST/OpenAPI/GraphQL
   artifact changes. This internal validation rule must not alter a public
   contract snapshot.
10. Update `docs/ingestion.md` in the `Child-process parser isolation` /
    `Untrusted IPC Validation` paragraph. Record that every sample-row and
    validation-row values map is bounded to the already-established
    `limits.maxColumns + 1` ceiling and that an over-width map rejects the whole
    summary through the existing safe failure. State that exact-boundary and
    valid parser outputs remain unchanged and that no new configured limit was
    introduced.
11. Inspect the complete diff, run every check below, and quote real exit status
    plus meaningful test/build totals. Fix issues before review.
12. Run the mandatory two-stage review loop:
    - dispatch a read-only reviewer subagent with `requesting-code-review`, this
      prompt path, `BASE_SHA=c93115b`, the working-tree diff (or implementation
      `HEAD_SHA` if an intermediate commit is explicitly required), changed
      paths, constraints, and real check outputs;
    - process every finding with `receiving-code-review`: understand and verify
      it against source and requirements before changing code; fix blocking and
      important valid findings in order, test each fix, and give technical
      pushback where evidence disproves a suggestion;
    - request follow-up review if a valid fix materially changes architecture,
      a public contract, data flow, or the trust boundary.
13. Commit locally on `main` using `caveman-commit`. Stage only:
    - `prompts/109-parser-summary-row-width-validation.md`;
    - `server/src/ingestion/parsers/child-process-parser.executor.ts`;
    - `server/src/ingestion/parsers/child-process-parser.executor.spec.ts`;
    - `docs/ingestion.md`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend, or
      push. Use a terse Conventional Commit subject and include a short body
      explaining the security/resource-bound reason because it is not obvious
      from the subject alone.

## Non-goals

- No new numeric or byte-size limit and no change to
  `PARSER_MAX_COLUMNS=200`, its environment bounds, or any `ParserLimits` type.
- No exact-equality rule among `columnCount`, `columnKeys.length`, and row-map
  widths.
- No requirement that sample/validation keys be members of `columnKeys`; no
  missing-key, extra-key, ordering, duplicate-normalization, or empty-key
  policy.
- No truncation, dropping, coercion, or partial acceptance of an over-width
  row. The complete summary fails closed.
- No changes to `ParsedSourceSummary`, `ParserIssue`, or IPC request/response
  TypeScript interfaces.
- No changes to issue/detail or metadata entry ceilings, prompt 108 finite
  scalar rules, key/string/cell bounds, row/count integer rules, or safe
  failure literals.
- No changes to CSV, XLSX, GeoJSON, `parser-utils.ts`, or
  `parseSourceBuffer` producers unless a focused valid-fixture regression
  disproves the premise; in that case stop instead of expanding scope.
- No schema migration, SQL, Prisma repository, RLS, index, tenant, worker queue,
  storage, upload, route, API contract, client, design, accessibility, motion,
  or browser work.
- No OS/container parser sandboxing, seccomp, UID isolation, network namespace,
  parent-process heap limit, streaming IPC protocol, or aggregate serialized
  byte limit.
- No general validator refactor or unrelated cleanup.

## Reference deltas

No visual delta. The deliberate behavioral delta is limited to malformed child
success summaries: a sample or validation row wider than the existing declared
column ceiling now fails atomically. Valid summaries and public output remain
unchanged.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this internal server boundary.

## Checks to run, and the owning doc

```bash
# Focused parent-boundary and executor behavior
npm --workspace=@acres/server test -- child-process-parser.executor.spec.ts

# Real parser-producer and compiled IPC compatibility
npm --workspace=@acres/server test -- source-parsers.spec.ts
npm --workspace=@acres/server test -- compiled-child-process-parser.spec.ts

# Public contracts must remain unchanged
npm run contracts:check

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/109-parser-summary-row-width-validation.md \
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
  prompts/109-parser-summary-row-width-validation.md \
  server/src/ingestion/parsers/child-process-parser.executor.ts \
  server/src/ingestion/parsers/child-process-parser.executor.spec.ts \
  docs/ingestion.md
```

Quote the actual exit status and meaningful Jest/build totals. If a named spec
does not exist at execution time, locate the closest current equivalent with
`rg --files server/src/ingestion/parsers`, run it, and record that evidence
instead of claiming a nonexistent check. Browser E2E, real PostgreSQL, spatial
plan, and operations-drill suites are intentionally omitted because this scope
touches no browser journey, persistence/query behavior, or deployment surface.

`docs/ingestion.md` owns the implementation record. `docs/security.md` is
read-only verification for this task because TM-07 already states bounded
row/column parsing and untrusted IPC validation; update it only if execution
proves that statement materially stale, and stop before broadening scope.

## Rollback and stop conditions

Rollback is a source/test/doc revert; there is no migration or persisted-data
rollback. Stop before expanding scope if any of these occur:

- a valid committed CSV, XLSX, or GeoJSON fixture emits a sample or validation
  row wider than `limits.maxColumns + 1`;
- the existing `+ 1` ceiling is not actually shared by accepted declared-column
  shapes at execution time;
- a public contract snapshot changes;
- an exact-boundary valid summary changes shape, key order, or values;
- the fix requires a new limit, truncation policy, error code/message, schema,
  producer rewrite, or IPC protocol change;
- repository evidence shows over-width row maps are intentionally accepted by a
  documented consumer.

Report the contradictory evidence and prepare a separate prompt rather than
silently changing the premise.

## Completion criteria

- Every `sampleRows` record is rejected when its own enumerable entry count is
  greater than `limits.maxColumns + 1`.
- Every `validationRows[].values` record is rejected at the same ceiling.
- Exactly `limits.maxColumns + 1` entries remain accepted and preserved at both
  sites.
- Over-width rejection is atomic; no entries are truncated, dropped, coerced,
  returned, or logged.
- A fake-child executor test proves the existing fixed safe failure and cleanup
  behavior for an over-width row.
- Current CSV, XLSX, GeoJSON, and compiled child-process tests pass unchanged.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status checks
  pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all verified
  blocking/important findings are fixed and re-tested.
- `docs/ingestion.md` records the row-map width invariant.
- Only the four approved paths are committed locally to `main`; nothing is
  pushed.

## SKILLS USED

- `architecture-patterns` — preserve the existing parser port/child adapter and
  parent-supervisor boundary without introducing module coupling.
- `nestjs-best-practices` — keep validation in the existing Nest ingestion
  boundary and avoid unrelated provider/module changes.
- `postgres-best-practices` — verify that this residual requires no schema,
  migration, transaction, RLS, or persistence-contract change.
- `security-best-practices` — enforce an existing resource allowlist at the
  untrusted TypeScript IPC boundary without exposing rejected data; no Nest-
  specific reference file exists in the installed skill, so repository
  security docs and code are authoritative here.
- `security-threat-model` — verify the work strengthens documented TM-07 at the
  existing child-to-parent boundary and does not invent a new boundary, asset,
  or risk rating.
- `error-handling-patterns` — fail fast on malformed width and reuse the
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
