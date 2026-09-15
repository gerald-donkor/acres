# 113 — preserve `__proto__` keys as own properties in parser row and detail copies

## Scope, and why it is next

The committed repository is on `main` at `c702da8`
(`fix(ingestion): bound parser row numbers to row cap`, the prompt 112
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 112 — which closed the last unbounded-integer edge in
`validateUntrustedSummary()` and completed the prompts 104–112
validator-hardening lineage (104 response guard, 105 request guard, 106
non-empty ids, 107 metadata fail-closed, 108 finite scalars, 109 row-map
widths, 110–111 issue carrier narrowing, 112 row-number upper bound).

There is no unbuilt ordered phase left. The next smallest unblocked residual is
inside Phase 7's existing bounded-parser and hostile-parser requirements: the
three remaining direct-assignment copies in
`server/src/ingestion/parsers/child-process-parser.executor.ts`
`validateUntrustedSummary()` silently drop a `__proto__` key, while the fourth
copy site (metadata) already preserves it as an own property.

The gap, at `c702da8` (re-verify exact lines at execution):

1. sample-row copy (near `:373–397`): `sanitizedRow[k] = v` (`:394`);
2. validation-row values copy (near `:426–445`): `sanitizedValues[k] = v`
   (`:444`);
3. issue-details copy (near `:497–514`): `sanitizedDetails[dk] = dv` (`:513`).

The metadata copy (near `:540–561`) uses `Object.defineProperty(metadata, mk,
{ value: mv, enumerable: true, configurable: true, writable: true })` (`:555–
560`), and the focused spec asserts the precedent explicitly
(`child-process-parser.executor.spec.ts` near `:755–777`): a `__proto__`
metadata key is accepted and preserved with `Object.hasOwn(..., '__proto__')`
`true` and `toEqual` round-trip.

Direct assignment to `__proto__` on a plain `{}` with a primitive value is a
silent no-op — verified this session with `node -e`:

```text
const o = {}; o["__proto__"] = "x";
Object.hasOwn(o, "__proto__") === false, Object.keys(o) === []
```

while the untrusted input does carry the key:

```text
Object.entries(JSON.parse('{"__proto__":"x"}')) === [["__proto__","x"]]
Object.hasOwn(JSON.parse('{"__proto__":"x"}'), "__proto__") === true
```

and `Object.defineProperty` preserves it:

```text
Object.hasOwn(q, "__proto__") === true, q["__proto__"] === "x"
```

All three sites accept only primitive values (`string | number | boolean |
null` for rows, plus the same set for details), so there is no prototype
mutation today — the setter ignores primitives. The failure is silent data
loss plus inconsistency: a child sending `{"__proto__": "x"}` as a sample-row
key, a validation-row value key, or a detail key passes every length/type/
finiteness gate, then loses the key in the sanitized copy, while the identical
key in `metadata` survives. The sanitized summary no longer equals the
validated input, and the four copy sites disagree about what a valid key
means. If a value type ever widens to objects, the same three lines become a
real prototype-pollution shape; closing the inconsistency now keeps that class
dead.

This prompt extends the `Object.defineProperty` pattern to the three remaining
sites. It mirrors the metadata descriptor exactly (`enumerable: true,
configurable: true, writable: true`), which is identical to assignment for
every normal key and preserves `__proto__` (and only `__proto__` behaves
differently) as an own property. It introduces no new limit, no rejection, no
type change, no schema change, and no valid-behavior change for any key other
than `__proto__`.

Preserve-over-reject is a judgement, stated as one: the metadata precedent
preserves (spec `:755–777` asserts preservation, not rejection); JSON can
legitimately carry `__proto__` as a CSV header or detail key; and preservation
is the smaller delta — reject would invent a new key-blocklist policy that no
prompt scoped. `constructor` and `prototype` keys need no change: direct
assignment already creates safe own properties for them (they have no setter
on `Object.prototype`), so they are explicitly out of scope.

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
- `docs/ingestion.md` — parser limits, child-process isolation, untrusted IPC
  validation, deterministic safe-error behavior, the five-tributary merge, and
  the owning implementation record (this prompt extends the same
  `Untrusted IPC Validation` paragraph that prompts 104–112 extended).
- `docs/security.md` — TM-07 and the Phase 7A parser-boundary update. This work
  hardens the existing child-to-parent IPC copy edge; it does not add or move
  a trust boundary or claim OS/container sandboxing.
- `server/src/ingestion/parsers/child-process-parser.executor.ts` —
  `validateUntrustedSummary()` sample-row copy (`sanitizedRow[k] = v`, near
  `:394`), validation-row values copy (`sanitizedValues[k] = v`, near `:444`),
  issue-details copy (`sanitizedDetails[dk] = dv`, near `:513`), and the
  metadata `Object.defineProperty` precedent (near `:555–560`). Re-read the
  file at execution time and resolve current line numbers rather than editing
  from this snapshot.
- `server/src/ingestion/parsers/parser.types.ts` — `ParsedSourceSummary`
  row/detail/metadata shapes and the closed `ParserIssueCode` /
  `ParserIssueMessage` unions (prompts 110–111); all interfaces remain
  unchanged.
- Trusted row/detail producers (direct assignment, out of scope; re-verify by
  grep at execution — pointers at `c702da8`):
  - `server/src/ingestion/parsers/csv-source.parser.ts` — `sample[key] =
safeCell(...)` (`:82`); rows sliced to `limits.maxRows`, headers via
    `normalizeKey`;
  - `server/src/ingestion/parsers/xlsx-source.parser.ts` and
    `geojson-source.parser.ts` — same direct-assignment row construction;
  - `server/src/ingestion/parsers/parser-utils.ts` — `formulaIssue()` (`:32–
40`); pass-through, unchanged.
- Downstream consumers (read-only, unchanged): `Object.entries` /
  `Object.keys` reads of rows/values/details in
  `server/src/ingestion/ingestion-processor.service.ts` (merge persist) and
  `server/src/analytics/analytics-publication.service.ts` (`publish()`); an
  own-property `__proto__` flows through `Object.entries` exactly like any
  other key.
- `server/prisma/schema.prisma` — `ValidationIssue` / `MetricObservation`
  columns; schema, migrations, and RLS are untouched.
- `server/src/ingestion/parsers/child-process-parser.executor.spec.ts` — the
  fake child-process harness, `defaultLimits` (`maxRows: 10`, `maxColumns: 5`,
  `maxCellChars: 50`, `maxSampleRows: 3`, `maxGeojsonFeatures: 5`, `:49–56`),
  `createValidSummary()` (`:58–71`), `createNumberMetadata()` (`:73–79`), the
  metadata `__proto__` preservation test (`:755–777`), and the focused
  `validateUntrustedSummary` suite extended by prompts 107–112.
- `server/src/ingestion/parsers/source-parsers.spec.ts` and
  `server/src/ingestion/parsers/compiled-child-process-parser.spec.ts` — valid
  in-process and compiled child/parent producer compatibility evidence.
- `server/src/ingestion/ingestion-processor.service.spec.ts` — merge-site
  construction; valid small keys, unchanged.
- `prompts/107-parser-summary-metadata-fail-closed.md` — the
  `Object.defineProperty` precedent and fail-closed paragraph this prompt
  extends.
- `prompts/112-parser-summary-row-number-validation.md` — immediately prior
  prompt, red-then-green boundary-test pattern, and the docs paragraph this
  prompt extends.

No visual reference is applicable. This is an internal server-only copy-semantics
change, so the design-system PDF, landing-page PNGs, and recorded chrome flows
provide no evidence and must not be opened or cited as if they did.

## Measurements and verified invariants

These are code-derived constraints at `c702da8`; re-verify them before editing:

1. Exactly three copy sites use direct assignment from untrusted keys:
   `sanitizedRow[k] = v`, `sanitizedValues[k] = v`,
   `sanitizedDetails[dk] = dv`. Exactly one site (metadata) uses
   `Object.defineProperty` with `{ enumerable: true, configurable: true,
writable: true }`. Re-run the grep (`sanitizedRow\[|sanitizedValues\[
|sanitizedDetails\[|defineProperty`) at execution and confirm the 3:1
   split still holds.
2. All three assignment sites copy only primitive values after gates that
   reject objects, arrays, non-finite numbers, over-length strings, and
   over-length keys. The `__proto__` setter on a plain object ignores
   primitive assignments, so current behavior for a `__proto__` key is silent
   loss (no own property), never prototype mutation. The fix must not claim
   to close an actively exploitable RCE; it closes silent-loss inconsistency
   and the latent pollution shape.
3. `Object.defineProperty(target, key, { value, enumerable: true,
configurable: true, writable: true })` is observably identical to `target[key]
= value` for every key except `__proto__` (and exactly preserves
   `toEqual`/`Object.keys`/`Object.entries` semantics for normal keys). The
   metadata spec case (`:755–777`, 20 entries incl. boundary key/value plus
   `__proto__`) proves the descriptor choice round-trips.
4. `constructor` and `prototype` keys already produce safe own properties via
   direct assignment (no setter on `Object.prototype` intercepts them). They
   stay on the assignment path only insofar as the whole loop body moves to
   `defineProperty` — no separate handling, no blocklist, no per-key branch.
5. Key/length/count/finiteness gates at all three sites remain byte-for-byte
   equivalent: `MAX_STRING_LENGTH` (200) key and string-value bounds,
   `maxColumnsAllowed` width bounds, `MAX_ISSUES_COUNT`, details 10-entry cap,
   `limits.maxCellChars` cell bound. This prompt changes only the final store
   statement inside already-gated loops.
6. `__proto__` as a _value_ (not a key) is already length-gated like any
   string and needs no handling. `columnKeys` array elements need no handling
   (array indices, not object keys).
7. When validation returns `null`, `execute()` maps the child success response
   to the existing fixed `parser_execution_failed` summary with existing
   cleanup. This prompt adds no new rejection: every input accepted today is
   still accepted, with `__proto__`-keyed inputs now round-tripping instead
   of dropping.
8. Current production parsers never emit a `__proto__` column in committed
   fixtures (verify via focused producer and compiled-IPC suites). If a valid
   fixture contradicts the premise (e.g. an assertion expects the dropped
   key), stop rather than changing a producer or weakening the copy.
9. Wire and persistence formats are unchanged: Prisma columns stay `String` /
   `Int?`, REST/OpenAPI `message` stays a string schema, GraphQL SDL is
   untouched. `npm run contracts:check` must report no diff.

The required implementation shape is intentionally local, mirroring the
metadata site. At each of the three assignment sites, replace (following
repository formatting):

```ts
sanitizedRow[k] = v;
```

with:

```ts
Object.defineProperty(sanitizedRow, k, {
  value: v,
  enumerable: true,
  configurable: true,
  writable: true,
});
```

and the exact analogues for `sanitizedValues[k] = v` and
`sanitizedDetails[dk] = dv`. Do not introduce a helper, a key blocklist, a
`constructor`/`prototype` special case, or a `null`-prototype object.

## Expected impact

- Routes changed: none.
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none.
- Database schema, Prisma models, migrations, RLS, queries, indexes, queues,
  and persisted-data formats changed: none.
- Valid CSV/XLSX/GeoJSON parser summaries: unchanged in values, order, and
  shape — except that a `__proto__` key, where present, is now preserved as
  an own property instead of silently dropped (matching metadata behavior
  since prompt 107).
- Malformed/hostile child success summaries: no acceptance change; every
  gate behaves exactly as today.
- Downstream copies (`ValidationIssue` details, `MetricObservation` source
  values, region-mapping issues): `Object.entries`-visible `__proto__` keys
  now flow transitively where metadata keys already do; trusted small keys
  flow unchanged.
- Logging/observability: unchanged; no key material is logged.
- Threat model: no new boundary and no risk reclassification. The change adds
  a concrete copy-semantics enforcement detail under the existing TM-07
  mitigation.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and every
   skill named in `## SKILLS USED`. Confirm `git status --short` before editing;
   preserve any unrelated user changes and stop if they overlap an approved
   path. Confirm `HEAD` is `c702da8` (or record the actual SHA and adjust
   `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–2 at execution: re-run the assignment/
   `defineProperty` grep in `child-process-parser.executor.ts`, confirm the
   3:1 split, and confirm each of the three loops gates values to primitives
   before the store statement. If a loop stores objects/arrays, or a fourth
   direct-assignment copy exists, stop and report it rather than silently
   widening scope.
3. In
   `server/src/ingestion/parsers/child-process-parser.executor.spec.ts`, add
   three preservation cases before production code, mirroring the metadata
   test (`:755–777`):
   - sample-row `__proto__` key: build an otherwise-valid summary whose
     `sampleRows[0]` carries an own `__proto__` key (via
     `Object.defineProperty` on the raw input, exactly as the metadata test
     does) with a short string value; keep counts, columns, keys, values,
     and metadata within accepted bounds;
   - validation-row `__proto__` key: same, inside
     `validationRows[0].values` with a valid `rowNumber`;
   - issue-details `__proto__` key: same, inside `issues[0].details` on an
     otherwise-valid fixed-literal issue (use a union member code/message
     pair so the key is the only unusual condition);
   - assert for each: validation succeeds, `Object.hasOwn(result...,
'__proto__')` is `true`, the value round-trips, and `Object.keys`
     includes the key. Keep the cases table-driven where the existing style
     allows, neutral (no product/customer data).
4. Run the three new cases against the pre-change validator and confirm they
   fail for the expected reason (key absent, `hasOwn` false) while the
   metadata `__proto__` case passes. Do not commit a red test state.
5. In
   `server/src/ingestion/parsers/child-process-parser.executor.ts`, change only
   the three store statements inside `validateUntrustedSummary()`:
   - `sanitizedRow[k] = v` → `Object.defineProperty(sanitizedRow, k,
{ value: v, enumerable: true, configurable: true, writable: true })`;
   - `sanitizedValues[k] = v` → the same shape on `sanitizedValues`;
   - `sanitizedDetails[dk] = dv` → the same shape on `sanitizedDetails`;
   - leave every gate, bound, sanitization, error literal, and the metadata
     site byte-for-byte unchanged.
6. Do not touch the `maxRowsAllowed` / `maxColumnsAllowed` formulas, row-number
   bounds (prompt 112), row-width checks (prompt 109), finite-number checks
   (prompt 108), issue/detail or metadata validation, code/message gates,
   response/request guards, safe literals, watchdog, fork options, or process
   cleanup. Do not introduce a shared copy helper, a key blocklist, or a
   `null`-prototype accumulator.
7. Run focused regression tests for the executor and all three real parser
   producers, including compiled child/parent IPC and the ingestion-processor
   merge-site suite. If any valid production parser summary changes shape,
   key order, or values, stop and report the exact fixture and shape; do not
   rewrite a producer within this prompt.
8. Run `npm run contracts:check` and verify no generated REST/OpenAPI/GraphQL
   artifact changes. This internal copy-semantics rule must not alter a public
   contract snapshot.
9. Update `docs/ingestion.md` in the `Child-process parser isolation` /
   `Untrusted IPC Validation` paragraph that prompts 104–112 extended. Record
   that sample-row, validation-row-value, and issue-detail copies store via
   `Object.defineProperty` (same descriptor as metadata since prompt 107);
   that a `__proto__` key is preserved as an own enumerable property instead
   of silently dropped; that every other key is observably identical to
   before; that no new rejection, limit, or type was introduced; and that
   `constructor`/`prototype` needed no handling.
10. Inspect the complete diff, run every check below, and quote real exit status
    plus meaningful test/build totals. Fix issues before review.
11. Run the mandatory two-stage review loop:
    - dispatch a read-only reviewer subagent with `requesting-code-review`, this
      prompt path, `BASE_SHA=c702da8` (or the recorded actual HEAD), the
      working-tree diff (or implementation `HEAD_SHA` if an intermediate
      commit is explicitly required), changed paths, constraints, and real
      check outputs;
    - process every finding with `receiving-code-review`: understand and verify
      it against source and requirements before changing code; fix blocking and
      important valid findings in order, test each fix, and give technical
      pushback where evidence disproves a suggestion;
    - request follow-up review if a valid fix materially changes architecture,
      a public contract, data flow, or the trust boundary.
12. Commit locally on `main` using `caveman-commit`. Stage only:
    - `prompts/113-parser-summary-proto-key-preservation.md`;
    - `server/src/ingestion/parsers/child-process-parser.executor.ts`;
    - `server/src/ingestion/parsers/child-process-parser.executor.spec.ts`;
    - `docs/ingestion.md`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend, or
      push. Use a terse Conventional Commit subject and include a short body
      explaining the copy-semantics reason because it is not obvious from the
      subject alone.

## Non-goals

- No new numeric or byte-size limit and no change to `PARSER_MAX_ROWS`,
  `PARSER_MAX_GEOJSON_FEATURES`, `MAX_STRING_LENGTH`, `MAX_ISSUES_COUNT`,
  details/metadata entry caps, or any `ParserLimits` type.
- No rejection of `__proto__`, `constructor`, or `prototype` keys; no key
  blocklist or allowlist; no per-key branching.
- No `null`-prototype accumulators (`Object.create(null)`) and no shared copy
  helper; the three sites mirror the metadata statement inline.
- No changes to `ParsedSourceSummary`, `ParserIssue`, or IPC request/response
  TypeScript interfaces; no narrowing of `columnKey`, `details`, `severity`,
  `code`, `message`, or `rowNumber` (prompts 110–112 closed the carriers and
  the row-number bound).
- No changes to CSV, XLSX, GeoJSON, `parser-utils.ts`, or `parseSourceBuffer`
  producers (their direct assignments are out of scope); in case of a focused
  valid-fixture contradiction, stop instead of expanding scope.
- No schema migration, SQL, Prisma repository, RLS, index, tenant, worker
  queue, storage, upload, route, API contract, client, design, accessibility,
  motion, or browser work.
- No OS/container parser sandboxing, seccomp, UID isolation, network
  namespace, parent-process heap limit, streaming IPC protocol, or aggregate
  serialized byte limit.
- No general validator refactor or unrelated cleanup.

## Reference deltas

No visual delta. The deliberate behavioral delta is limited to untrusted
summaries carrying a `__proto__` object key in a sample row, a validation-row
`values` map, or an issue `details` map: the key is now preserved as an own
enumerable property (as metadata keys already are) instead of silently
dropped. All other inputs validate and copy exactly as before.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this internal server copy-semantics change.

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
  prompts/113-parser-summary-proto-key-preservation.md \
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
  prompts/113-parser-summary-proto-key-preservation.md \
  docs/ingestion.md \
  server/src/ingestion/parsers/child-process-parser.executor.ts \
  server/src/ingestion/parsers/child-process-parser.executor.spec.ts
```

Quote the actual exit status and meaningful Jest/build totals. If a named spec
does not exist at execution time, locate the closest current equivalent with
`rg --files server/src/ingestion`, run it, and record that evidence instead of
claiming a nonexistent check. Browser E2E, real PostgreSQL, spatial plan, and
operations-drill suites are intentionally omitted because this scope adds no
rejection path (fail-closed behavior unchanged), changes no schema/query
behavior, and touches no browser journey or deployment surface.

`docs/ingestion.md` owns the implementation record. `docs/security.md` is
read-only verification for this task because TM-07 already states bounded
parsing and untrusted IPC validation; update it only if execution proves that
statement materially stale, and stop before broadening scope.

## Rollback and stop conditions

Rollback is a source/test/doc revert; there is no migration or persisted-data
rollback. Stop before expanding scope if any of these occur:

- the assignment/`defineProperty` grep does not show the 3:1 split at
  execution time (a fourth direct copy exists or metadata no longer uses
  `defineProperty`);
- any of the three loops stores non-primitive values, changing the no-mutation
  premise;
- a valid committed CSV, XLSX, or GeoJSON fixture changes shape, key order,
  or values after the edit;
- an existing assertion expects the `__proto__` key to be dropped (the
  premise inverts — report it rather than deleting the assertion silently);
- a public contract snapshot changes;
- the fix requires a new limit, rejection, helper, blocklist, error
  code/message, schema change, producer rewrite, or IPC protocol change;
- repository evidence shows `__proto__` keys are intentionally dropped by a
  documented consumer.

Report the contradictory evidence and prepare a separate prompt rather than
silently changing the premise.

## Completion criteria

- Every `sampleRows` `__proto__` key is preserved as an own enumerable
  property with its value intact.
- Every `validationRows[].values` `__proto__` key is preserved as an own
  enumerable property with its value intact.
- Every `issues[].details` `__proto__` key is preserved as an own enumerable
  property with its value intact.
- Every normal key copies observably identically to before (`toEqual`,
  `Object.keys`, `Object.entries` unchanged).
- No new acceptance or rejection behavior: all inputs accepted today are
  still accepted; all rejected today are still rejected.
- Three new focused tests prove preservation (one per site) and fail
  pre-change for the expected reason.
- Current CSV, XLSX, GeoJSON, compiled child-process, and merge-site tests
  pass unchanged.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all verified
  blocking/important findings are fixed and re-tested.
- `docs/ingestion.md` records the `__proto__` copy invariant.
- Only the four approved paths are committed locally to `main`; nothing is
  pushed.

## SKILLS USED

- `architecture-patterns` — preserve the existing parser port/child adapter and
  parent-supervisor boundary without introducing module coupling or a shared
  copy helper.
- `nestjs-best-practices` — keep validation in the existing Nest ingestion
  boundary and avoid unrelated provider/module changes.
- `postgres-best-practices` — verify that this residual requires no schema,
  migration, transaction, RLS, or persistence-contract change.
- `security-best-practices` — close the silent-loss inconsistency at the
  untrusted TypeScript IPC copy edge without logging key material; no Nest-
  specific reference file exists in the installed skill, so repository
  security docs and code are authoritative here.
- `security-threat-model` — verify the work hardens documented TM-07 at the
  existing child-to-parent boundary and does not invent a new boundary, asset,
  or risk rating.
- `error-handling-patterns` — keep the deterministic safe result and cleanup
  path; no new failure literal is introduced.
- `javascript-testing-patterns` — add `__proto__` preservation and round-trip
  Jest coverage mirroring the metadata precedent.
- `e2e-testing-patterns` — confirm the internal validator is correctly covered
  below the E2E layer and that no browser/cross-system suite is warranted.
- `sql-optimization-patterns` — verify no query, index, or query-plan work is
  introduced by this in-memory copy change.
- `requesting-code-review` — dispatch the mandatory structured read-only review
  with precise scope, SHAs, changed paths, and check evidence.
- `receiving-code-review` — verify reviewer claims against repository reality
  before fixes or technical pushback.
- `caveman-commit` — produce the required terse Conventional Commit message
  with a short copy-semantics rationale body.
