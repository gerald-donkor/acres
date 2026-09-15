# 108 — reject non-finite parser summary numbers

## Scope, and why it is next

The committed repository is on `main` at `80619cc`
(`fix(ingestion): reject invalid parser metadata`, the prompt 107
implementation). All 12 ordered phases in `docs/build-plan.md` are implemented
and committed through the Phase 12K exit gate, followed by the dependency-safe
residual hardening prompts 68–107.

There is no unbuilt ordered phase left. The next smallest unblocked residual is
the Phase 7 child-process parser IPC validation gap that prompt 107 explicitly
left out: `validateUntrustedSummary()` accepts every JavaScript value whose
`typeof` is `"number"` in four untrusted scalar maps, including `NaN`,
`Infinity`, and `-Infinity`. The executor forks the parser child with
`serialization: "advanced"`, so the parent boundary must validate structured-
clone numeric values rather than relying on JSON serialization to coerce them.

The count-like numeric fields are not affected by this gap:
`rowCount`, `columnCount`, validation-row `rowNumber`, and optional issue
`rowNumber` already require `Number.isInteger(...)`, which rejects all three
non-finite values. The unchecked sites are exactly:

1. each scalar value in `sampleRows`;
2. each scalar value in `validationRows[].values`;
3. each scalar value in `issues[].details`;
4. each scalar value in `metadata`.

This prompt makes those four allowlists require finite numbers while preserving
all finite numeric values, including `-0`, fractional values, and the full
finite JavaScript number range. It introduces no numeric magnitude rule, no
new public contract, limit, message, code, route, database shape, or valid
parser behavior.

Prompt-file state is not implementation state. The untracked files
`prompts/92-remapping-compatibility-message-narrowing.md` and
`prompts/93-parsed-observation-quality-message-narrowing.md` are older prompt
artifacts whose implementations are already committed in `ff18e5e` and
`2a3e26b`. Leave both files untouched and untracked; do not stage them.

## Reference material read for it, by path

- `AGENTS.md` — §2 workflow and phase-control rules; §4 skill map; §5 prompt
  contract; §6 required checks; §10 evidence rules; and the ALWAYS review and
  commit ledger.
- `docs/build-plan.md` — Phase 7 bounded-parser outcome, hostile-parser tests,
  fail-safe behavior, required skill manifest, and the rule against inventing
  operational limits.
- `docs/ingestion.md` — `Child-process parser isolation`, especially the
  parent-side untrusted summary validation record; this is the owning
  implementation document.
- `docs/security.md` — TM-07 and the existing parser-isolation boundary. This
  work strengthens the already documented untrusted IPC validation and does
  not create or move a trust boundary.
- `server/src/ingestion/parsers/child-process-parser.executor.ts` — the fork
  options (`serialization: "advanced"`), message handler, safe failure mapping,
  and complete `validateUntrustedSummary()` implementation. Re-read the exact
  file at execution time rather than editing from this snapshot.
- `server/src/ingestion/parsers/child-process-parser.executor.spec.ts` — the
  fake child-process harness, executor safe-failure tests, `createValidSummary`
  helper, and current `validateUntrustedSummary` cases.
- `server/src/ingestion/parsers/parser.types.ts` — the scalar unions on sample
  and validation rows and the `Record<string, unknown>` issue-detail/metadata
  contracts; all types remain unchanged.
- `server/src/ingestion/parsers/parser-utils.ts` — `safeCell()` and
  `scalarText()`; reference-only unless a real parser regression disproves the
  premise. Do not broaden this prompt into producer normalization.
- `server/src/ingestion/parsers/csv-source.parser.ts` — CSV values remain text
  after parsing and metadata is fixed finite/scalar content.
- `server/src/ingestion/parsers/xlsx-source.parser.ts` — XLSX cell values flow
  through `safeCell()` and metadata is fixed scalar content; focused producer
  tests must verify compatibility.
- `server/src/ingestion/parsers/geojson-source.parser.ts` — JSON input cannot
  encode non-finite numbers, geometry validation is handled elsewhere, and
  numeric metadata is the bounded finite SRID/coordinate count.
- `server/src/ingestion/parsers/compiled-child-process-parser.spec.ts` — real
  compiled child/parent IPC coverage with advanced serialization; valid flows
  must stay green.
- `prompts/107-parser-summary-metadata-fail-closed.md` — the immediately
  preceding guard hardening, including the explicit finite-number non-goal that
  this prompt now resolves.

No visual reference is applicable. This is an internal server-only validation
change, so the design-system PDF, landing PNGs, and recorded chrome flows
provide no evidence and must not be opened or cited as if they did.

## Measurements and verified invariants

These are code-enforced conditions at `80619cc`; re-verify them in source before
editing:

1. `validateUntrustedSummary()` already bounds structural counts, array sizes,
   key lengths, and string lengths. This prompt does not change any of those
   bounds.
2. `rowCount` and `columnCount` require non-negative integers within existing
   parser-limit-derived maxima. Validation and issue row numbers require
   positive integers. `Number.isInteger(NaN)` and
   `Number.isInteger(±Infinity)` are false, so those branches need no change.
3. Four scalar-map branches currently use the same broad allowlist shape:
   `null`, string, number, or boolean. A `typeof value === "number"` check alone
   accepts `NaN`, `Infinity`, and `-Infinity`.
4. Required numeric rule: whenever one of those four map values is a number,
   `Number.isFinite(value)` must be true. Reject the complete untrusted summary
   on failure; do not drop, stringify, coerce, clamp, replace with `null`, or
   partially accept the surrounding object.
5. `Number.MAX_VALUE`, `Number.MIN_VALUE`, finite fractional values, zero, and
   negative zero remain valid. This task establishes finiteness only, not a
   business range, precision, safe-integer, sign, or unit constraint.
6. Strings retain their existing limits: sample/validation row strings use
   `limits.maxCellChars`; issue-detail and metadata strings use
   `MAX_STRING_LENGTH` (200). Booleans and `null` remain valid. Arrays, nested
   objects, `bigint`, symbols, functions, and other unsupported values remain
   rejected exactly as they are now.
7. Existing container and entry-count behavior remains unchanged: sample rows
   and validation values are bounded by their current surrounding limits;
   issue details allow at most 10 entries; metadata allows at most 20 entries.
8. The existing executor failure mapping remains unchanged. If
   `validateUntrustedSummary()` returns `null`, `execute()` resolves through
   `createSafeErrorSummary(expectedKind, "parser_execution_failed",
"Parser execution failed.")`; the rejected number is not returned or
   logged.
9. Every committed production parser is expected to emit finite values on valid
   fixtures. CSV values are strings, valid XLSX numeric cells are finite, and
   GeoJSON is JSON-decoded while its numeric metadata is derived from bounded
   counts. Focused tests are evidence for this premise; if they contradict it,
   stop rather than weakening the boundary or silently changing a producer.

Current scalar check pattern, shown only to locate the branches (re-read the
real file before editing):

```ts
if (
  value !== null &&
  typeof value !== "string" &&
  typeof value !== "number" &&
  typeof value !== "boolean"
) {
  return null;
}
```

Required additional condition at each of the four scalar-map sites:

```ts
if (typeof value === "number" && !Number.isFinite(value)) return null;
```

Use the repository's actual local variable names (`v`, `dv`, or `mv`) and
formatting. Place the finite check after the existing scalar-type allowlist and
before copying the value. Do not add it to integer fields where
`Number.isInteger()` already expresses the stricter invariant.

## Expected impact

- Routes changed: none.
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none.
- Database schema, Prisma models, migrations, RLS, queues, and stored data
  changed: none.
- Valid CSV/XLSX/GeoJSON parser summaries: unchanged in value, order, and shape.
- Malformed or hostile child success summaries: any non-finite numeric scalar
  in the four mapped containers rejects the entire summary and produces the
  existing deterministic safe parser failure.
- Logging and observability: unchanged; rejected payload values are not logged.

## Implementation plan

1. In
   `server/src/ingestion/parsers/child-process-parser.executor.spec.ts`, extend
   `describe("validateUntrustedSummary", ...)` before production code:
   - add a table-driven matrix covering each of `NaN`, `Infinity`, and
     `-Infinity` in each of the four locations: one `sampleRows` value, one
     `validationRows[].values` value, one `issues[].details` value, and one
     metadata value;
   - build every case from a complete otherwise-valid summary so the asserted
     rejection can only be attributed to the non-finite value;
   - assert `validateUntrustedSummary(...)` returns `null` for all 12
     location/value combinations;
   - keep the case labels explicit enough that a failing Jest row identifies
     both the container and numeric value;
   - avoid JSON cloning for fixtures because JSON would coerce non-finite
     numbers and invalidate the test premise.
2. Add a positive finite-number case in the same suite:
   - exercise finite numeric values in all four containers;
   - include at least `Number.MAX_VALUE`, `Number.MIN_VALUE`, a finite negative
     fraction, and `-0` across the fixture;
   - assert validation succeeds and the values are preserved; use
     `Object.is(..., -0)` or Jest's `toBe(-0)` for negative zero so coercion to
     positive zero cannot pass unnoticed;
   - do not assert a new magnitude or safe-integer limit.
3. In the executor-level `ChildProcessParserExecutor` suite, add one fake-child
   case whose success response has the generated request id and a fully valid
   summary except for one non-finite scalar (use `NaN` in a sample-row or
   metadata field):
   - assert the resolved value is the existing fixed
     `parser_execution_failed` summary with empty rows and metadata;
   - assert the child is disconnected/killed and removed through the current
     cleanup path;
   - do not add a new failure literal or expose the rejected value.
4. Run the focused executor spec and confirm the new negative matrix fails
   against the current broad `typeof number` behavior for the expected reason.
   Do not commit a red test state.
5. In
   `server/src/ingestion/parsers/child-process-parser.executor.ts`, add the
   `Number.isFinite(...)` rejection immediately before value assignment in
   exactly these four loops:
   - `summary.sampleRows` entry values;
   - `summary.validationRows[].values` entry values;
   - `issue.details` entry values;
   - `summary.metadata` entry values.
6. Keep the four existing type allowlists and string-length checks otherwise
   unchanged. Prefer four local one-line checks over introducing a shared
   validator abstraction in this narrow prompt. Do not change object-copy
   mechanics, including prompt 107's `Object.defineProperty(...)` metadata copy
   that preserves an own `__proto__` key safely.
7. Touch no other validator branch. In particular, do not change row/count
   integer rules, key grammar, empty-key behavior, entry limits,
   `ISSUE_CODE_REGEX`, `MAX_ISSUES_COUNT`, `MAX_STRING_LENGTH`, response-id
   validation, IPC request validation, failure literals, watchdog behavior, or
   process lifecycle.
8. Run focused regression tests for the executor and every real parser
   producer. If a production parser produces a non-finite numeric scalar for a
   valid fixture, stop and report the contradicted premise; do not normalize it,
   stringify it, or expand this prompt to producer semantics.
9. Update `docs/ingestion.md` in the `Child-process parser isolation` /
   untrusted IPC validation paragraph. Record that numeric scalar values in
   sample rows, validation rows, issue details, and metadata must be finite and
   that any violation rejects the entire summary through the existing safe
   failure. State that integer count/row fields already had stricter validation
   and that valid parser output remains unchanged.
10. Self-verify, inspect the complete diff, and run the two-stage review loop:
    - dispatch a read-only reviewer subagent using `requesting-code-review`
      with this prompt path, `BASE_SHA=80619cc`, `HEAD_SHA=80619cc` plus the
      working-tree diff, the changed paths, and real check outputs;
    - evaluate every finding through `receiving-code-review`; verify it against
      source and requirements before changing code;
    - fix blocking and important verified findings, re-run affected checks, and
      request follow-up review only if feedback causes significant architecture,
      public-contract, data-flow, or security-boundary changes.
11. Commit locally on `main` using `caveman-commit`. Stage only:
    - `prompts/108-parser-summary-finite-number-validation.md`;
    - `server/src/ingestion/parsers/child-process-parser.executor.ts`;
    - `server/src/ingestion/parsers/child-process-parser.executor.spec.ts`;
    - `docs/ingestion.md`.
      Leave the unrelated untracked prompt 92/93 files untouched and unstaged.
      Do not pull, merge, rebase, or push; the local branch's existing
      ahead/behind state is outside this prompt.

## Non-goals

- No changes to `ParsedSourceSummary`, `ParserIssue`, `ParserLimits`, or any IPC
  TypeScript interface.
- No new numeric magnitude, precision, safe-integer, sign, unit, decimal, or
  locale rule. Only JavaScript finiteness is added.
- No clamping, coercion, stringification, `null` substitution, or partial
  sanitization of a non-finite value.
- No producer changes in `parser-utils.ts`, CSV, XLSX, GeoJSON, or
  `parseSourceBuffer` unless a focused regression disproves the premise; in
  that case stop instead of widening scope.
- No changes to `isParserChildResponse()`, `isParserChildRequest()`,
  `isParserLimits()`, `parser-child.entry.ts`, fork serialization, parser
  process isolation, or child lifecycle.
- No new key grammar, empty-key rule, prototype-key rule, aggregate byte limit,
  recursive-value support, or shared scalar-validator refactor.
- No changes to current array, entry-count, key-length, string-length, row,
  column, issue, or parser resource bounds.
- No schema migration, repository, tenant/RLS, worker, queue, storage, route,
  API contract, client, design, accessibility, motion, or browser work.
- No general validator cleanup or unrelated formatting changes.
- No staging, editing, or deletion of the unrelated untracked prompt 92/93
  files.

## Reference deltas

No visual delta; this is server-only. The deliberate behavior delta is that a
child success summary containing `NaN`, `Infinity`, or `-Infinity` in any of the
four scalar maps is rejected atomically. Previously, the same payload passed
the `typeof number` allowlist. All finite numbers and valid summaries remain
unchanged.

## Breakpoint behaviour

Not applicable. No UI changes occur at 375, 800, or 1280 pixels, and no browser
suite is required for this internal server-only change.

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
  prompts/108-parser-summary-finite-number-validation.md \
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
  prompts/108-parser-summary-finite-number-validation.md \
  server/src/ingestion/parsers/child-process-parser.executor.ts \
  server/src/ingestion/parsers/child-process-parser.executor.spec.ts \
  docs/ingestion.md
```

Quote the real exit status and meaningful test/build totals in the completion
report. If a named parser spec does not exist, identify the actual repository
test file with `rg --files server/src/ingestion/parsers`, run the closest
focused equivalent, and record that evidence instead of inventing a result.
Browser E2E, real PostgreSQL, and operations drills are deliberately omitted
because this scope touches none of those surfaces.

`docs/ingestion.md` owns the implementation record. Update no other canonical
doc unless implementation evidence proves a statement there has become stale.

## Rollback and stop conditions

Rollback is a source/test/doc revert; there is no migration or persisted-data
rollback. Stop before expanding scope if any of these occur:

- a committed production parser emits `NaN`, `Infinity`, or `-Infinity` for a
  valid supported input fixture;
- a public contract snapshot changes;
- a finite valid parser summary changes shape or value;
- the change requires a new numeric bound, error code/message, schema, parser
  output rewrite, or fork-serialization change;
- focused tests or canonical docs show that a non-finite scalar is intentional
  product data rather than malformed child output.

Report the evidence and prepare a separate prompt if the premise is false.

## Completion criteria

- Non-finite numeric scalars are rejected in sample rows, validation-row
  values, issue details, and metadata.
- The complete summary is rejected atomically; no offending entry is dropped,
  coerced, or returned.
- Finite numbers across the JavaScript finite range, including `-0`, remain
  accepted and preserved.
- Existing integer count and row-number validation remains unchanged.
- A fake-child executor test proves a non-finite value resolves to the existing
  fixed safe failure and cleans up the child.
- Current CSV, XLSX, GeoJSON, and compiled child-process parser tests pass.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status checks
  pass with real output recorded.
- The two-stage requesting/receiving review loop is complete and all verified
  blocking/important findings are fixed and re-tested.
- `docs/ingestion.md` records the finite-number invariant.
- Only the four approved paths are committed locally to `main`; the unrelated
  untracked prompt 92/93 files remain untouched; nothing is pushed.

## SKILLS USED

- `architecture-patterns` — preserve the existing parent-supervisor /
  child-parser adapter boundary without introducing domain or module coupling.
- `nestjs-best-practices` — keep untrusted IPC validation within the existing
  Nest ingestion service boundary and avoid unrelated provider/module changes.
- `error-handling-patterns` — fail fast at the untrusted boundary and reuse the
  deterministic safe error result without leaking malformed values.
- `security-best-practices` — apply an explicit finite-number allowlist to
  attacker-influenced cross-process data before it can flow onward.
- `javascript-testing-patterns` — add clear boundary-value, negative-matrix,
  preservation, and executor-path Jest coverage.
- `requesting-code-review` — dispatch the mandatory structured read-only review
  with precise requirements, changed paths, SHAs, and verification evidence.
- `receiving-code-review` — verify reviewer findings against the prompt and
  repository before applying fixes or reasoned pushback.
- `caveman-commit` — produce the required terse Conventional Commit message,
  including a short security rationale body because the reason is not obvious
  from the subject alone.

Deliberately excluded as inapplicable to this residual slice:
`postgres-best-practices` and `sql-optimization-patterns` (no schema/query
work), `security-threat-model` (the existing TM-07 boundary is strengthened but
not added or moved), `e2e-testing-patterns` and `playwright` (no cross-system or
browser journey), and `api-design-principles` / `openapi-spec-generation` (no
public contract change).
