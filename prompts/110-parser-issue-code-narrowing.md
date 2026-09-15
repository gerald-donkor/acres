# 110 — narrow `ParserIssue.code` to the fixed producer literal union

## Scope, and why it is next

The committed repository is on `main` at `6a97ffa`
(`fix(ingestion): bound parser row widths`, the prompt 109 implementation).
The worktree is clean (verified this session via `git status --short`, empty
output). All 12 ordered phases in `docs/build-plan.md` are implemented and
committed through the Phase 12K exit gate (verification records §§16–22,
operator checklist in `docs/launch-checklist.md`), plus dependency-safe
residual hardening through prompt 109.

There is no unbuilt ordered phase left. The next smallest unblocked residual is
inside Phase 7's deterministic validation-error requirements, continuing the
prompts 80–109 writer-narrowing lineage to its last open writer into a durable
column.

The gap: `ParserIssue.code` (`server/src/ingestion/parsers/parser.types.ts`,
`readonly code: string`) is the only issue-code carrier in the ingestion path
that still accepts an arbitrary string at compile time, and it is the carrier
through which every already-narrowed code is widened back to open `string`
before persistence:

1. `IngestionProcessorService` (`server/src/ingestion/ingestion-processor.service.ts`,
   lines 127–157 — re-verify exact lines at execution) merges five sources into
   one `issues: ParserIssue[]` array: `summary.issues` (parser producers),
   `validationIssues` (region mapping, constructed with the narrowed
   `RegionMappingCode` from prompts 91/97), `malformedMetricIssues` (narrowed
   `MalformedMetricMappingCode` from prompts 90/95), `analyticsIssues`
   (narrowed `ValidateMappingCode` from prompts 89/96), and `remappingIssues`
   (narrowed `RemappingIncompatibleCode` from prompts 92/94).
2. The merge persists `code: issue.code` verbatim into the durable
   `validationIssue` rows (`:192–211`, `code: issue.code` at `:198`).
3. Any future edit pushing a formatted cell dump, `String(raw)`, or
   `(error as Error).message` as the `code` on any of the five tributaries
   would compile today and persist unbounded text into a column that survives
   in PostgreSQL backups and restore drills. That is the exact inversion
   prompts 86–100 eliminated upstream of this merge point.

A scope note in prompt 99 recorded the analytics-side producers as closing the
durable `ValidationIssue.code` column. Repository evidence corrects that note
per §10 rule 8: the ingestion merge site mixes parser-side codes that were
never part of that closure, so the column was never fully closed. This prompt
closes the remaining open writer. No line outside this prompt's scope is
changed to accommodate that correction.

This prompt narrows the `code` only. The `ParserIssue.message` carrier stays
open `string` and is separately scoped as prompt 111 if ever pursued —
mirroring how prompts 86–93 closed messages before prompts 94–100 closed
codes on the analytics side.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 7's bounded parsing outcome, hostile-parser
  tests, fail-safe behavior, documentation owner, and exact phase skill
  manifest.
- `docs/backend.md` — current Nest modular-monolith/server conventions and root
  build/test command ownership; no module, provider, route, or database surface
  changes in this prompt.
- `docs/ingestion.md` — parser limits, child-process isolation, untrusted IPC
  validation, deterministic safe-error behavior, and the owning implementation
  record (this prompt updates the same untrusted-IPC/narrowing paragraph that
  prompts 86–109 extended).
- `docs/security.md` — TM-07 and the Phase 7A parser-boundary update. This work
  constrains trusted construction at an existing edge; it does not add or move
  a trust boundary, change a risk rating, or claim OS/container sandboxing.
  Read-only for this task unless execution proves a statement materially stale.
- `server/src/ingestion/parsers/parser.types.ts` — `ParserIssue` (`code:
string` at line 5) and `ParsedSourceSummary`; the single interface change
  lives here.
- `server/src/ingestion/parsers/child-process-parser.executor.ts` —
  `createSafeErrorSummary()` (already narrowed `ParserExecutorFailureCode`,
  prompts 87/101), `validateUntrustedSummary()` issues branch (`:451–517`;
  regex gate at `:455`, push at `:509–516`), and the single cast site.
- Parser producers (trusted code literals; re-verify every literal by grep at
  execution — the file:line pointers below are at `6a97ffa`):
  - `server/src/ingestion/parsers/csv-source.parser.ts` — `:28`
    `file_size_limit_exceeded`, `:48` `row_limit_exceeded`, `:58`
    `column_limit_exceeded`, `:73` `cell_limit_exceeded`;
  - `server/src/ingestion/parsers/xlsx-source.parser.ts` — `:29`
    `file_size_limit_exceeded`, `:47` `invalid_xlsx_container`, `:57`
    `empty_workbook`, `:66` `row_limit_exceeded`, `:79`
    `column_limit_exceeded`, `:94` `cell_limit_exceeded`;
  - `server/src/ingestion/parsers/geojson-source.parser.ts` — `:30`
    `file_size_limit_exceeded`, `:42` `invalid_json`, `:54`
    `feature_limit_exceeded`, `:69` `missing_geometry`, `:79`
    `coordinate_limit_exceeded`, `:123` `invalid_geojson`, `:135`
    `unsupported_geojson`;
  - `server/src/ingestion/parsers/xlsx-container-inspector.ts` — `:73`
    `encrypted_workbook_unsupported`, `:111` `xlsx_entry_limit_exceeded`,
    `:123` `macro_enabled_workbook_unsupported`, `:134`/`:148`
    `invalid_xlsx_container`;
  - `server/src/ingestion/parsers/parse-source-buffer.ts` — `:55`
    `unsupported_media_type`, `:81` `parser_exception`;
  - `server/src/ingestion/parsers/source-parser.service.ts` — `:57`
    `file_size_limit_exceeded`;
  - `server/src/ingestion/parsers/parser-utils.ts` — `:37` `formula_as_data`.
- Merge-site types (already narrowed; compose by reference, do not
  re-declare their literals):
  - `RegionMappingCode` (4 literals) in
    `server/src/ingestion/ingestion-processor.service.ts`;
  - `MalformedMetricMappingCode` (1 literal) in
    `server/src/analytics/mapping.ts`;
  - `ValidateMappingCode` (5 literals) and `RemappingIncompatibleCode` (1
    literal) in `server/src/analytics/analytics-publication.service.ts`.
- Merge and persist sites: `ingestion-processor.service.ts` `:127–157`
  (five-tributary merge) and `:192–211` (verbatim `validationIssue`
  persistence); read-only consumers `ingestion.service.ts` `:327–336`
  (DB→DTO passthrough, stays `string` because the Prisma column is `String`)
  and `ingestion.controller.ts` `:281` (`stringSchema` wire format, unchanged).
- Specs: `child-process-parser.executor.spec.ts` (untrusted-input fixtures
  using non-union codes such as `unknown_code` / `valid_code`, and trusted
  assertions on union members), `source-parsers.spec.ts`,
  `compiled-child-process-parser.spec.ts`, `parse-source-buffer.spec.ts`,
  `xlsx-container-inspector.spec.ts`, `ingestion-processor.service.spec.ts`
  (merge-site construction).
- `prompts/93-parsed-observation-quality-message-narrowing.md` and
  `prompts/100-parsed-observation-quality-code-narrowing.md` — the carrier-
  narrowing pattern this prompt mirrors (compile-time guard, zero runtime
  change).
- `prompts/109-parser-summary-row-width-validation.md` — immediately prior
  prompt, boundary-test pattern, and the docs paragraph this prompt extends.

No visual reference is applicable. This is an internal server-only type change,
so the design-system PDF, landing-page PNGs, and recorded chrome flows
provide no evidence and must not be opened or cited as if they did.

## Measurements and verified invariants

These are code-derived constraints at `6a97ffa`; re-verify them before editing:

1. Trusted parser producers emit exactly 18 distinct code literals (enumerated
   above). Re-run `grep -rn "code:" server/src/ingestion/parsers --include="*.ts"`
   excluding `*.spec.ts` at execution and confirm no 19th producer literal
   exists. Spec-only codes (`unknown_code`, `valid_code`, `invalid_value`,
   `finite_number` in executor/parse specs) are untrusted-input or negative
   fixtures, not producer evidence.
2. `ParserExecutorFailureCode` (`parser_execution_failed` |
   `parser_execution_timed_out`) is already a 2-literal union and flows into
   `ParserIssue.code` via `createSafeErrorSummary()`; it must be a member of
   the new union or that existing call stops compiling.
3. The four merge-tributary types (`RegionMappingCode`,
   `MalformedMetricMappingCode`, `ValidateMappingCode`,
   `RemappingIncompatibleCode`) total 11 literals; they must be members of the
   new union or the merge-site annotations (`:127–150`) stop compiling. Total
   union size is therefore ~31 literals. Compose them with `import type`
   references to the existing types — do not copy their literals into
   `parser.types.ts`.
4. `parser.types.ts` is imported by upper layers
   (`ingestion-processor.service.ts`, `analytics-publication.service.ts`,
   executor, producers). Composing the union with `import type` creates only
   erased type-only edges: no runtime import cycle is introduced, and no
   runtime value may be imported into `parser.types.ts` from an upper layer.
   The architecture-patterns rule holds — the seam stays acyclic at runtime.
5. The validator's issues branch keeps its runtime behavior byte-for-byte
   identical: the `ISSUE_CODE_REGEX` gate (`:455`), the `MAX_STRING_LENGTH`
   message bound (`:458–463`), severity/rowNumber/columnKey/details checks,
   and the push shape (`:509–516`) are unchanged. The regex gate remains the
   runtime control for untrusted child codes, exactly as today.
6. The single unsound edge is explicit and documented, not hidden: after the
   regex gate, the validator holds a `string` that must enter the
   `ParserIssue[]` accumulator. A narrow assertion at that one push site
   records that the union constrains trusted construction while the regex
   gate constrains untrusted bytes. No new runtime allowlist, no rejection of
   novel regex-valid child codes, no forward-compat policy change. A runtime
   allowlist is separately scoped if ever and must not ride along here.
7. Producer call sites need no edits: every trusted producer pushes an object
   literal whose `code` is already a union member, so structural assignability
   holds unchanged. If any trusted site fails to compile against the union,
   that site names a 32nd literal — resolve it by evidence (extend the union
   only for a verified producer literal from a file already in scope, else
   stop per §Rollback).
8. Wire and persistence formats are unchanged: Prisma `ValidationIssue.code`
   stays `String`, the REST/OpenAPI `code` stays a string schema, GraphQL SDL
   is untouched. `npm run contracts:check` must report no diff.
9. `ParserIssue.message`, `columnKey`, `details`, `severity`, and `rowNumber`
   are untouched. `ParsedSourceSummary`, `ParserLimits`, `SourceKind`, IPC
   request/response types, watchdog, fork options, and process cleanup are
   untouched.

## Expected impact

- Routes changed: none.
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none.
- Database schema, Prisma models, migrations, RLS, queries, indexes, queues,
  and persisted-data formats changed: none.
- Valid CSV/XLSX/GeoJSON summaries, executor safe failures, region/mapping
  validation, and merged issue persistence: unchanged in values, order, and
  shape. Runtime behavior is 100% identical; every produced code literal is
  unchanged.
- Compile time: any future trusted edit passing a non-union `code` into a
  `ParserIssue` (including all five merge tributaries and the
  `validationIssue` persist path) fails to compile.
- Untrusted child path: unchanged. Regex-valid but non-union child codes still
  pass validation exactly as today; the assertion site documents this.
- Logging/observability: unchanged.
- Threat model: no new boundary and no risk reclassification. The change adds
  a concrete compile-time enforcement detail under the existing TM-07
  mitigation for trusted construction; the untrusted runtime gate is untouched.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and
   every skill named in `## SKILLS USED`. Confirm `git status --short` before
   editing; preserve any unrelated user changes and stop if they overlap an
   approved path. Confirm `HEAD` is `6a97ffa` (or record the actual SHA and
   adjust `BASE_SHA` in the review step accordingly).
2. Re-run the producer-code grep excluding specs and confirm the union
   membership list from §Measurements item 1. If a producer literal exists
   outside the listed files, stop and report it rather than silently widening
   scope.
3. In `server/src/ingestion/parsers/parser.types.ts`:
   - define and export `ParserProducerCode` as the union of the 18 verified
     parser-producer literals (one `typeof CONST` per literal is unnecessary
     here — producers use inline literals, so declare the union inline with a
     comment citing the producing file for each literal);
   - define and export `ParserIssueCode` as `ParserProducerCode |
ParserExecutorFailureCode | RegionMappingCode |
MalformedMetricMappingCode | ValidateMappingCode |
RemappingIncompatibleCode`, composed with `import type` only;
   - change `ParserIssue.code` from `string` to `ParserIssueCode`;
   - import `ParserExecutorFailureCode` with `import type` from
     `./child-process-parser.executor` (erased; no runtime cycle) and the four
     merge-tributary types with `import type` from their owning modules.
     If any of those types cannot be imported without a runtime cycle, stop
     and report the exact import chain rather than duplicating literals.
4. In `child-process-parser.executor.ts`, change only the issues-push site
   (`:509–516`): after the existing regex gate has accepted `issue.code`,
   assert it into the accumulator with a narrow, commented assertion (e.g.
   `code: issue.code as ParserIssueCode`) and a two-line comment stating that
   the regex gate remains the runtime control for untrusted bytes while the
   union constrains trusted construction. Do not touch the regex, any bound,
   any other field, or any other function.
5. Compile (`npm run typecheck` scoped mentally to the server workspace first
   via the root script) and fix only genuine scope violations: a trusted site
   failing against the union names either a missed producer literal (verify
   by grep, then extend `ParserProducerCode` with its file:line evidence) or
   an out-of-scope constructor (stop per §Rollback). Do not "fix" by widening
   the union to `string`, adding a catch-all member, or casting at any site
   other than the single validator push.
6. Update specs only where compilation or honesty requires:
   - untrusted-input fixtures carrying non-union codes (`unknown_code`,
     `valid_code`, and similar) keep their rejection assertions; where they
     are now typed as `ParserIssue`/`ParsedSourceSummary`, construct them as
     raw `unknown` payloads (the validator takes `unknown`) or with a minimal
     fixture-local cast — never by adding fixture codes to the union;
   - trusted-construction assertions on union members remain unchanged;
   - add one compile-time-anchored unit case per merge tributary type proving
     a representative literal of each of the six union arms is accepted into
     a `ParserIssue` (parser producer, executor failure, region mapping,
     malformed mapping, analytics mapping, remapping). Keep the cases
     table-driven and neutral (no product/customer data).
7. Run the focused suites below and confirm green with no snapshot or fixture
   behavior change: executor, all three real parser producers, container
   inspector, parse-source-buffer, compiled IPC, and the ingestion-processor
   merge-site suite.
8. Run `npm run contracts:check` and verify no generated REST/OpenAPI/GraphQL
   artifact changes. This compile-time narrowing must not alter a public
   contract snapshot.
9. Update `docs/ingestion.md` in the untrusted-IPC/narrowing paragraph that
   prompts 86–109 extended. Record that `ParserIssue.code` accepts only the
   fixed producer literal union (parser producers, executor failures, and the
   four already-narrowed mapping validators) as a compile-time guard; that
   the validator's runtime regex gate is unchanged and remains the control
   for untrusted child bytes (with the single documented assertion site);
   that runtime values, wire formats, and persisted shapes are unchanged; and
   that `ParserIssue.message` remains open and separately scoped.
10. Inspect the complete diff, run every check below, and quote real exit
    status plus meaningful test/build totals. Fix issues before review.
11. Run the mandatory two-stage review loop:
    - dispatch a read-only reviewer subagent with `requesting-code-review`,
      this prompt path, `BASE_SHA=6a97ffa` (or the recorded actual HEAD), the
      working-tree diff (or implementation `HEAD_SHA` if an intermediate
      commit is explicitly required), changed paths, constraints, and real
      check outputs;
    - process every finding with `receiving-code-review`: understand and
      verify it against source and requirements before changing code; fix
      blocking and important valid findings in order, test each fix, and give
      technical pushback where evidence disproves a suggestion;
    - request follow-up review if a valid fix materially changes
      architecture, a public contract, data flow, or the trust boundary.
12. Commit locally on `main` using `caveman-commit`. Stage only files actually
    touched from this list (do not stage untouched producers opportunistically):
    - `prompts/110-parser-issue-code-narrowing.md`;
    - `server/src/ingestion/parsers/parser.types.ts`;
    - `server/src/ingestion/parsers/child-process-parser.executor.ts`;
    - spec files from §Checks that required edits;
    - `docs/ingestion.md`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend, or
      push. Use a terse Conventional Commit subject and include a short body
      explaining the compile-time/persistence-bound reason because it is not
      obvious from the subject alone.

## Non-goals

- No narrowing of `ParserIssue.message` (separately scoped as prompt 111 if
  ever); no change to `columnKey`, `details`, `severity`, or `rowNumber`.
- No runtime allowlist of issue codes in the validator; no change to
  `ISSUE_CODE_REGEX`, `MAX_STRING_LENGTH`, `MAX_ISSUES_COUNT`, or any other
  validator bound from prompts 104–109.
- No change to producer message literals, parser bounds, `ParserLimits`,
  `ParsedSourceSummary`, IPC request/response shapes, watchdog, fork options,
  or process cleanup.
- No change to Prisma schema, `ValidationIssue` columns, RLS, queries,
  indexes, worker queues, storage, uploads, routes, API contracts, OpenAPI,
  SDL, GraphQL resolvers, client, design, accessibility, motion, or browser
  work. `ingestion.service.ts` DB→DTO passthrough and
  `ingestion.controller.ts` string schema stay exactly as they are.
- No OS/container parser sandboxing, seccomp, UID isolation, network
  namespace, parent-process heap limit, streaming IPC protocol, or aggregate
  serialized byte limit.
- No general parser refactor, literal-hoisting cleanup, or unrelated test
  changes. Producers whose literals already satisfy the union are not edited.

## Reference deltas

No visual delta. The deliberate static delta is limited to trusted
construction: non-union `code` values no longer compile into a `ParserIssue`
at any of the five merge tributaries. Runtime, wire, and persisted output
remain unchanged, including for untrusted child codes that pass the unchanged
regex gate.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this internal server type change.

## Checks to run, and the owning doc

```bash
# Focused parser narrowing and merge-site behavior
npm --workspace=@acres/server test -- child-process-parser.executor.spec.ts
npm --workspace=@acres/server test -- source-parsers.spec.ts
npm --workspace=@acres/server test -- compiled-child-process-parser.spec.ts
npm --workspace=@acres/server test -- parse-source-buffer.spec.ts
npm --workspace=@acres/server test -- xlsx-container-inspector.spec.ts
npm --workspace=@acres/server test -- ingestion-processor.service.spec.ts

# Public contracts must remain unchanged
npm run contracts:check

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/110-parser-issue-code-narrowing.md \
  docs/ingestion.md \
  server/src/ingestion/parsers/parser.types.ts \
  server/src/ingestion/parsers/child-process-parser.executor.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/110-parser-issue-code-narrowing.md \
  docs/ingestion.md \
  server/src/ingestion/parsers/parser.types.ts \
  server/src/ingestion/parsers/child-process-parser.executor.ts
```

Quote the actual exit status and meaningful Jest/build totals. If a named spec
does not exist at execution time, locate the closest current equivalent with
`rg --files server/src/ingestion`, run it, and record that evidence instead of
claiming a nonexistent check. Browser E2E, real PostgreSQL, spatial plan, and
operations-drill suites are intentionally omitted because this scope touches no
browser journey, persistence/query behavior, or deployment surface.

`docs/ingestion.md` owns the implementation record. `docs/security.md` is
read-only verification for this task because TM-07 already states bounded
parsing and untrusted IPC validation; update it only if execution proves that
statement materially stale, and stop before broadening scope.

## Rollback and stop conditions

Rollback is a source/test/doc revert; there is no migration or persisted-data
rollback. Stop before expanding scope if any of these occur:

- the producer-code grep surfaces a trusted literal outside the files listed
  in §Reference material;
- a trusted site fails against the union with a code that is not a verified
  producer literal from an in-scope file;
- the union cannot be composed with `import type` alone (i.e. a runtime
  import into `parser.types.ts` from an upper layer would be required);
- any valid committed CSV, XLSX, or GeoJSON fixture changes shape, or any
  focused suite changes behavior rather than just types;
- a public contract snapshot changes;
- the fix requires a runtime allowlist, a new error code/message, a schema
  change, a producer rewrite, or an IPC protocol change.

Report the contradictory evidence and prepare a separate prompt rather than
silently changing the premise.

## Completion criteria

- `ParserIssue.code` accepts only the fixed producer literal union
  (~31 members across the six arms) as a compile-time guard.
- Every trusted producer literal from the grep is a union member; no trusted
  producer file is edited for behavior.
- The validator's runtime gates are byte-for-byte identical; exactly one
  documented assertion bridges the regex gate to the accumulator.
- The five-tributary merge and the `validationIssue` persist path compile
  unchanged and behave identically.
- Untrusted-input fixtures keep arbitrary codes and their rejection
  assertions; one new acceptance case per union arm proves membership.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all verified
  blocking/important findings are fixed and re-tested.
- `docs/ingestion.md` records the `ParserIssue.code` invariant and the
  explicitly deferred `ParserIssue.message` follow-up.
- Only approved paths are committed locally to `main`; nothing is pushed.

## SKILLS USED

- `architecture-patterns` — preserve the parsers port/child-adapter and
  parent-supervisor boundary; keep the union composition acyclic at runtime
  via erased `import type` edges only.
- `nestjs-best-practices` — keep the change inside the existing Nest ingestion
  boundary and avoid unrelated provider/module changes.
- `postgres-best-practices` — verify that this residual requires no schema,
  migration, transaction, RLS, or persistence-contract change (Prisma column
  stays `String`).
- `security-best-practices` — constrain trusted construction at the existing
  IPC edge without exposing rejected data and without altering the runtime
  gate; no Nest-specific reference file exists in the installed skill, so
  repository security docs and code are authoritative here.
- `security-threat-model` — verify the work sits under documented TM-07 at the
  existing child-to-parent boundary and invents no new boundary, asset, or
  risk rating.
- `error-handling-patterns` — keep the deterministic safe result and cleanup
  path; no new failure literal is introduced.
- `javascript-testing-patterns` — add per-arm acceptance and negative-matrix
  Jest coverage without changing fixture behavior.
- `e2e-testing-patterns` — confirm the narrowing is correctly covered below
  the E2E layer and that no browser/cross-system suite is warranted.
- `sql-optimization-patterns` — verify no query, index, or query-plan work is
  introduced by this in-memory type change.
- `requesting-code-review` — dispatch the mandatory structured read-only review
  with precise scope, SHAs, changed paths, and check evidence.
- `receiving-code-review` — verify reviewer claims against repository reality
  before fixes or technical pushback.
- `caveman-commit` — produce the required terse Conventional Commit message
  with a short persistence-bound rationale body.
