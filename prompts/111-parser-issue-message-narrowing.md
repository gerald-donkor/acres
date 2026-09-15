# 111 — narrow `ParserIssue.message` to the fixed producer literal union

## Scope, and why it is next

The committed repository is on `main` at `3f1dac1`
(`refactor(ingestion): narrow ParserIssue.code union`, the prompt 110
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 110.

There is no unbuilt ordered phase left. The next smallest unblocked residual is
the exact follow-up prompt 110 scoped and deferred: `ParserIssue.message`
(`server/src/ingestion/parsers/parser.types.ts`, `readonly message: string`)
is now the only issue carrier in the ingestion path that still accepts an
arbitrary string at compile time, and it is the carrier through which every
already-narrowed message is widened back to open `string` before persistence:

1. `IngestionProcessorService` (`server/src/ingestion/ingestion-processor.service.ts`,
   five-tributary merge near `:127–157` — re-verify exact lines at execution)
   merges `summary.issues` (parser producers), `validationIssues` (region
   mapping, narrowed `RegionMappingMessage` from prompts 91/97),
   `malformedMetricIssues` (narrowed `MalformedMetricMappingMessage` from
   prompts 90/95), `analyticsIssues` (narrowed `ValidateMappingMessage` from
   prompts 89/96), and `remappingIssues` (narrowed
   `RemappingIncompatibleMessage` from prompts 92/94).
2. The merge persists `message: issue.message` verbatim into the durable
   `validationIssue` rows (near `:192–211`), which survive in PostgreSQL
   backups and restore drills and are tenant-visible through
   `GET /ingestion-runs/:runId/issues`.
3. Any future edit pushing a formatted cell dump, `String(raw)`, or
   `(error as Error).message` as the `message` on any of the five tributaries
   would compile today and persist unbounded text into a tenant-visible
   column. That is the exact inversion prompts 86–93 eliminated upstream of
   this merge point, and the exact inversion prompt 110 just eliminated for
   `code`.

This prompt narrows the `message` only, mirroring prompt 110's carrier-
narrowing pattern (compile-time guard, zero runtime change). After this prompt
both `ParserIssue` string carriers are closed and the prompts 80–111
writer-narrowing lineage is complete.

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
  record (this prompt rewrites the "`ParserIssue.message` remains open and
  separately scoped" sentence that prompts 86–110 left, in the same
  untrusted-IPC/narrowing paragraph).
- `docs/security.md` — TM-07 and the Phase 7A parser-boundary update. This work
  constrains trusted construction at an existing edge; it does not add or move
  a trust boundary, change a risk rating, or claim OS/container sandboxing.
  Read-only for this task unless execution proves a statement materially stale.
- `server/src/ingestion/parsers/parser.types.ts` — `ParserIssue` (`message:
string` at line 55) and the prompt-110 `ParserProducerCode` /
  `ParserIssueCode` precedent; the single interface change lives here.
- `server/src/ingestion/parsers/child-process-parser.executor.ts` —
  `ParserExecutorFailureMessage` (`:44`, currently non-exported),
  `createSafeErrorSummary()` (`:271–291`, `message.slice(0,
MAX_STRING_LENGTH)` at `:286`), the validator's message-length gate
  (`:459–464`), and the prompt-110 assertion site (`:509–522`, `code:
issue.code as ParserIssueCode` with its `eslint-disable-next-line`).
- Parser producers (trusted static literals; re-verify every literal by grep at
  execution — the file:line pointers below are at `3f1dac1`):
  - `server/src/ingestion/parsers/csv-source.parser.ts` — `:29` `CSV size…`,
    `:49` `CSV row count…`, `:59` `CSV column count…`, `:74` `CSV cell…`;
  - `server/src/ingestion/parsers/xlsx-source.parser.ts` — `:30` `Workbook
size…`, `:48` `Workbook container is invalid or unreadable.`, `:58`
    `Workbook has no rows.`, `:67` `Workbook row count…`, `:80` `Workbook
column count…`, `:95` `Workbook cell…`;
  - `server/src/ingestion/parsers/geojson-source.parser.ts` — `:31` `GeoJSON
size…`, `:43` `GeoJSON could not be parsed as JSON.`, `:55–56` `GeoJSON
feature count…`, `:70` `GeoJSON feature is missing geometry.`, `:80–81`
    `GeoJSON coordinate count…`, `:124` `GeoJSON root must be an object.`,
    `:136` `GeoJSON must be a Feature or FeatureCollection.`;
  - `server/src/ingestion/parsers/xlsx-container-inspector.ts` — `:74`
    `Encrypted or password-protected workbooks are not supported.`, `:112–113`
    `Workbook archive entry count exceeds the parser safety limit.`, `:124`
    `Macro-enabled workbooks are not supported.`, `:135`/`:149` `Workbook
container is invalid or unreadable.` (shared literal with xlsx parser);
  - `server/src/ingestion/parsers/parse-source-buffer.ts` — `:56` `Media type
is not accepted.`, `:82` `PARSER_EXCEPTION_MESSAGE` (`Parser failed
unexpectedly.`, defined `:16`);
  - `server/src/ingestion/parsers/source-parser.service.ts` — `:58` `Source
file size exceeds the temporary parser limit.`;
  - `server/src/ingestion/parsers/parser-utils.ts` — `:38`
    `Formula-looking cell was treated as text.` (via `formulaIssue()`).
- Merge-site types (already narrowed messages; compose by reference, do not
  re-declare their literals):
  - `RegionMappingMessage` (4 literals) in
    `server/src/ingestion/ingestion-processor.service.ts` (`:54–58`);
  - `MalformedMetricMappingMessage` (3 literals) in
    `server/src/analytics/mapping.ts` (`:30–33`);
  - `ValidateMappingMessage` (5 literals) and `RemappingIncompatibleMessage`
    (1 literal) in `server/src/analytics/analytics-publication.service.ts`
    (`:559–564`, `:555`).
- `ObservationQualityMessage` (`analytics-publication.service.ts` `:530`,
  prompts 93/100) does **not** flow into the `ParserIssue` merge — verified
  this session by grep showing no use outside its owning module except specs —
  so it is not a union arm. Re-verify at execution; if it does flow in, stop
  per §Rollback instead of silently adding a seventh arm.
- Merge and persist sites: `ingestion-processor.service.ts` five-tributary
  merge and verbatim `validationIssue` persistence (`message: issue.message`);
  read-only consumers `ingestion.service.ts` (DB→DTO passthrough, stays
  `string` because the Prisma column is `String`) and
  `ingestion.controller.ts` (`message: stringSchema()` wire format,
  unchanged).
- `parser-child.entry.ts` (`:76`, `:106`, `PARSER_CHILD_MALFORMED_REQUEST_MESSAGE`
  / `PARSER_CHILD_EXECUTION_FAILED_MESSAGE`) constructs `ParserChildResponse`
  error payloads (`ParserChildErrorMessage`), not `ParserIssue` — out of scope,
  do not touch.
- Specs: `child-process-parser.executor.spec.ts` (untrusted-input fixtures
  using non-union messages such as `arbitrary error message` `:359`,
  `Trusted test issue.` `:656`, `Invalid value.` `:723`, `Finite number.`
  `:743`, `msg` `:891/909`; trusted assertions on union members),
  `source-parsers.spec.ts`, `compiled-child-process-parser.spec.ts`,
  `parse-source-buffer.spec.ts`, `xlsx-container-inspector.spec.ts`,
  `ingestion-processor.service.spec.ts` (merge-site construction with union
  messages, e.g. remapping message near `:285–287`).
- `prompts/110-parser-issue-code-narrowing.md` — the carrier-narrowing pattern
  this prompt mirrors (compile-time guard, zero runtime change, per-arm
  acceptance cases).

No visual reference is applicable. This is an internal server-only type change,
so the design-system PDF, landing-page PNGs, and recorded chrome flows
provide no evidence and must not be opened or cited as if they did.

## Measurements and verified invariants

These are code-derived constraints at `3f1dac1`; re-verify them before editing:

1. Trusted parser producers emit exactly 24 distinct message literals
   (enumerated above; `Workbook container is invalid or unreadable.` is shared
   between the xlsx parser and the container inspector). Re-run
   `grep -rn "message:" server/src/ingestion/parsers --include="*.ts"`
   excluding `*.spec.ts` at execution and confirm no 25th producer literal
   exists. Confirmed this session: zero template-literal (`message: \``)
producers — every trusted message is a static literal. Spec-only messages
(`arbitrary error message`, `Trusted test issue.`, `Invalid value.`,
`Finite number.`, `msg`) are untrusted-input or negative fixtures, not
   producer evidence.
2. `ParserExecutorFailureMessage` (`Parser execution failed.` |
   `Parser execution timed out.`) is already a 2-literal union and flows into
   `ParserIssue.message` via `createSafeErrorSummary()`; it must be a member
   of the new union or that existing call stops compiling. Unlike its code
   counterpart, it is currently **non-exported** (`:44`) — exporting it is an
   in-scope, erased, zero-runtime edit (item 1 of §Implementation plan).
3. The four merge-tributary message types (`RegionMappingMessage`,
   `MalformedMetricMappingMessage`, `ValidateMappingMessage`,
   `RemappingIncompatibleMessage`) total 13 literals and are likewise all
   currently **non-exported**; each needs only the `export` keyword added
   (erased; no value, ordering, or runtime change). Total union size is
   therefore ~39 literals (24 + 2 + 13). Compose them with `import type`
   references to the existing types — do not copy their literals into
   `parser.types.ts`.
4. `parser.types.ts` is imported by upper layers. Composing the union with
   `import type` creates only erased type-only edges: no runtime import cycle
   is introduced, and no runtime value may be imported into `parser.types.ts`
   from an upper layer. The architecture-patterns rule holds — the seam stays
   acyclic at runtime. Adding `export` to a `type` declaration is erased and
   cannot create a runtime edge.
5. The validator's issues branch keeps its runtime behavior byte-for-byte
   identical: the `typeof`/`MAX_STRING_LENGTH` message gate (`:459–464`), the
   `ISSUE_CODE_REGEX` gate, severity/rowNumber/columnKey/details checks, and
   the push shape are unchanged. The length gate remains the runtime control
   for untrusted child messages, exactly as today.
6. Two narrow assertions bridge trusted types to untrusted/runtime-widened
   values, both explicit and documented, not hidden:
   - the validator push site: after the existing gates accept
     `issue.message`, assert it into the accumulator (mirroring the existing
     `code: issue.code as ParserIssueCode` line and its comment);
   - `createSafeErrorSummary()`: `message.slice(0, MAX_STRING_LENGTH)` widens
     to `string`. Both executor failure literals are far shorter than 200
     chars (`Parser execution failed.` is 25, `Parser execution timed out.`
     is 28 — re-verify lengths at execution), so the slice is a runtime
     identity; assert the sliced result (e.g. `message.slice(0,
MAX_STRING_LENGTH) as ParserIssueMessage`) with a comment recording the
     length proof. Do not remove the slice: this prompt is zero-runtime-change
     per the prompt-110 precedent.
     No new runtime allowlist, no rejection of novel length-valid child
     messages, no forward-compat policy change. A runtime allowlist is
     separately scoped if ever and must not ride along here.
7. Producer call sites need no edits: every trusted producer pushes an object
   literal whose `message` is already a union member, so structural
   assignability holds unchanged. If any trusted site fails to compile against
   the union, that site names a 40th literal — resolve it by evidence (extend
   the union only for a verified static producer literal from a file already
   in scope, else stop per §Rollback).
8. Wire and persistence formats are unchanged: Prisma `ValidationIssue.message`
   stays `String`, the REST/OpenAPI `message` stays a string schema, GraphQL
   SDL is untouched. `npm run contracts:check` must report no diff.
9. `ParserIssue.code` (prompt 110), `severity`, `columnKey`, `details`, and
   `rowNumber` are untouched. `ParsedSourceSummary`, `ParserLimits`,
   `SourceKind`, IPC request/response types, `ParserChildErrorMessage`,
   watchdog, fork options, and process cleanup are untouched.

## Expected impact

- Routes changed: none.
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none.
- Database schema, Prisma models, migrations, RLS, queries, indexes, queues,
  and persisted-data formats changed: none.
- Valid CSV/XLSX/GeoJSON summaries, executor safe failures, region/mapping
  validation, and merged issue persistence: unchanged in values, order, and
  shape. Runtime behavior is 100% identical; every produced message literal is
  unchanged.
- Compile time: any future trusted edit passing a non-union `message` into a
  `ParserIssue` (including all five merge tributaries and the
  `validationIssue` persist path) fails to compile.
- Untrusted child path: unchanged. Length-valid but non-union child messages
  still pass validation exactly as today; the assertion site documents this.
- Logging/observability: unchanged.
- Threat model: no new boundary and no risk reclassification. The change adds
  a concrete compile-time enforcement detail under the existing TM-07
  mitigation for trusted construction; the untrusted runtime gate is untouched.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and
   every skill named in `## SKILLS USED`. Confirm `git status --short` before
   editing; preserve any unrelated user changes and stop if they overlap an
   approved path. Confirm `HEAD` is `3f1dac1` (or record the actual SHA and
   adjust `BASE_SHA` in the review step accordingly).
2. Re-run the producer-message grep excluding specs and confirm the union
   membership list from §Measurements item 1. Confirm zero template-literal
   producers and confirm `ObservationQualityMessage` still does not flow into
   the `ParserIssue` merge. If a producer literal exists outside the listed
   files, or the quality message now flows into the merge, stop and report it
   rather than silently widening scope.
3. Add the `export` keyword (only) to the five already-narrowed message types:
   `ParserExecutorFailureMessage` in `child-process-parser.executor.ts`,
   `RegionMappingMessage` in `ingestion-processor.service.ts`,
   `MalformedMetricMappingMessage` in `mapping.ts`, `ValidateMappingMessage`
   and `RemappingIncompatibleMessage` in `analytics-publication.service.ts`.
   No literal, ordering, or runtime change in any of these files.
4. In `server/src/ingestion/parsers/parser.types.ts`:
   - define and export `ParserProducerMessage` as the union of the 24 verified
     parser-producer literals (declare the union inline with a comment citing
     the producing file for each literal, mirroring `ParserProducerCode`);
   - define and export `ParserIssueMessage` as `ParserProducerMessage |
ParserExecutorFailureMessage | RegionMappingMessage |
MalformedMetricMappingMessage | ValidateMappingMessage |
RemappingIncompatibleMessage`, composed with `import type` only
     (including the now-exported executor message type);
   - change `ParserIssue.message` from `string` to `ParserIssueMessage`.
     If any of those types cannot be imported without a runtime cycle, stop
     and report the exact import chain rather than duplicating literals.
5. In `child-process-parser.executor.ts`, change only two sites:
   - `createSafeErrorSummary()`: assert the sliced message (e.g.
     `message.slice(0, MAX_STRING_LENGTH) as ParserIssueMessage`) with a
     comment recording the length proof (both literals < 200 chars, slice is
     identity) and importing the type with `import type`. Do not remove the
     slice and do not touch the code, shape, or metadata.
   - the validator issues-push site: after the existing gates, assert
     `message: issue.message as ParserIssueMessage` alongside the existing
     code assertion, extending the existing trust-boundary comment to cover
     both carriers. Mirror the existing `eslint-disable-next-line
@typescript-eslint/no-unnecessary-type-assertion` pattern for the new
     line; `npm run lint` verifies the exact comment placement. Do not touch
     any gate, bound, other field, or other function.
6. Compile (via the root `typecheck` script) and fix only genuine scope
   violations: a trusted site failing against the union names either a missed
   producer literal (verify by grep, then extend `ParserProducerMessage` with
   its file:line evidence) or an out-of-scope constructor (stop per
   §Rollback). Do not "fix" by widening the union to `string`, adding a
   catch-all member, or casting at any site other than the two documented
   assertions.
7. Update specs only where compilation or honesty requires:
   - untrusted-input fixtures carrying non-union messages (`arbitrary error
message`, `Trusted test issue.`, `Invalid value.`, `Finite number.`,
     `msg`, and similar) keep their rejection assertions; where they are now
     typed as `ParserIssue`/`ParsedSourceSummary`, construct them as raw
     `unknown` payloads (the validator takes `unknown`) or with a minimal
     fixture-local cast — never by adding fixture messages to the union;
   - trusted-construction assertions on union members remain unchanged;
   - add one compile-time-anchored unit case per merge tributary type proving
     a representative literal of each of the six union arms is accepted into
     a `ParserIssue` (parser producer, executor failure, region mapping,
     malformed mapping, analytics mapping, remapping). Keep the cases
     table-driven and neutral (no product/customer data).
8. Run the focused suites below and confirm green with no snapshot or fixture
   behavior change: executor, all three real parser producers, container
   inspector, parse-source-buffer, compiled IPC, and the ingestion-processor
   merge-site suite.
9. Run `npm run contracts:check` and verify no generated REST/OpenAPI/GraphQL
   artifact changes. This compile-time narrowing must not alter a public
   contract snapshot.
10. Update `docs/ingestion.md` in the untrusted-IPC/narrowing paragraph that
    prompts 86–110 extended. Record that `ParserIssue.message` accepts only
    the fixed producer literal union (parser producers, executor failures,
    and the four already-narrowed mapping validators) as a compile-time guard;
    that the five message types are composed by erased `import type`
    reference after adding the `export` keyword only; that the validator's
    runtime length gate is unchanged and remains the control for untrusted
    child bytes (with the two documented assertion sites, including the
    slice-identity length proof); that runtime values, wire formats, and
    persisted shapes are unchanged; and that both `ParserIssue` string
    carriers are now closed, completing the prompts 80–111 lineage.
11. Inspect the complete diff, run every check below, and quote real exit
    status plus meaningful test/build totals. Fix issues before review.
12. Run the mandatory two-stage review loop:
    - dispatch a read-only reviewer subagent with `requesting-code-review`,
      this prompt path, `BASE_SHA=3f1dac1` (or the recorded actual HEAD), the
      working-tree diff (or implementation `HEAD_SHA` if an intermediate
      commit is explicitly required), changed paths, constraints, and real
      check outputs;
    - process every finding with `receiving-code-review`: understand and
      verify it against source and requirements before changing code; fix
      blocking and important valid findings in order, test each fix, and give
      technical pushback where evidence disproves a suggestion;
    - request follow-up review if a valid fix materially changes
      architecture, a public contract, data flow, or the trust boundary.
13. Commit locally on `main` using `caveman-commit`. Stage only files actually
    touched from this list (do not stage untouched producers opportunistically):
    - `prompts/111-parser-issue-message-narrowing.md`;
    - `server/src/ingestion/parsers/parser.types.ts`;
    - `server/src/ingestion/parsers/child-process-parser.executor.ts`;
    - `server/src/ingestion/ingestion-processor.service.ts` (export keyword
      only);
    - `server/src/analytics/mapping.ts` (export keyword only);
    - `server/src/analytics/analytics-publication.service.ts` (export keyword
      only);
    - spec files from §Checks that required edits;
    - `docs/ingestion.md`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend, or
      push. Use a terse Conventional Commit subject and include a short body
      explaining the compile-time/persistence-bound reason because it is not
      obvious from the subject alone.

## Non-goals

- No narrowing of any other carrier (`columnKey`, `details`, `severity`,
  `rowNumber`, `ParserIssue.code` — already closed by prompt 110).
- No change to `ObservationQualityMessage` or its producers/consumers; it does
  not flow into `ParserIssue` and stays exactly as it is.
- No runtime allowlist of issue messages in the validator; no change to
  `MAX_STRING_LENGTH`, `MAX_ISSUES_COUNT`, `ISSUE_CODE_REGEX`, or any other
  validator bound from prompts 104–110.
- No change to producer message literals, parser bounds, `ParserLimits`,
  `ParsedSourceSummary`, IPC request/response shapes, `ParserChildResponse`
  / `ParserChildErrorMessage`, watchdog, fork options, or process cleanup.
- No change to Prisma schema, `ValidationIssue` columns, RLS, queries,
  indexes, worker queues, storage, uploads, routes, API contracts, OpenAPI,
  SDL, GraphQL resolvers, client, design, accessibility, motion, or browser
  work. `ingestion.service.ts` DB→DTO passthrough and
  `ingestion.controller.ts` string schema stay exactly as they are.
- No OS/container parser sandboxing, seccomp, UID isolation, network
  namespace, parent-process heap limit, streaming IPC protocol, or aggregate
  serialized byte limit.
- No general parser refactor, literal-hoisting cleanup, constant consolidation
  (the shared `Workbook container is invalid or unreadable.` literal stays
  declared at both producers), or unrelated test changes. Producers whose
  literals already satisfy the union are not edited.

## Reference deltas

No visual delta. The deliberate static delta is limited to trusted
construction: non-union `message` values no longer compile into a
`ParserIssue` at any of the five merge tributaries, plus the `export` keyword
on five already-narrowed message type declarations (erased; no runtime
effect). Runtime, wire, and persisted output remain unchanged, including for
untrusted child messages that pass the unchanged length gate.

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
  prompts/111-parser-issue-message-narrowing.md \
  docs/ingestion.md \
  server/src/ingestion/parsers/parser.types.ts \
  server/src/ingestion/parsers/child-process-parser.executor.ts \
  server/src/ingestion/ingestion-processor.service.ts \
  server/src/analytics/mapping.ts \
  server/src/analytics/analytics-publication.service.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/111-parser-issue-message-narrowing.md \
  docs/ingestion.md \
  server/src/ingestion/parsers/parser.types.ts \
  server/src/ingestion/parsers/child-process-parser.executor.ts \
  server/src/ingestion/ingestion-processor.service.ts \
  server/src/analytics/mapping.ts \
  server/src/analytics/analytics-publication.service.ts
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

- the producer-message grep surfaces a trusted literal outside the files listed
  in §Reference material;
- a trusted template-literal (dynamic) message producer exists — the union
  premise fails and needs a separate prompt;
- `ObservationQualityMessage` flows into the `ParserIssue` merge at execution
  time;
- a trusted site fails against the union with a message that is not a verified
  static producer literal from an in-scope file;
- the union cannot be composed with `import type` plus the `export`-keyword
  additions alone (i.e. a runtime import into `parser.types.ts` from an upper
  layer would be required);
- either executor failure literal is not shorter than `MAX_STRING_LENGTH`,
  breaking the slice-identity proof;
- any valid committed CSV, XLSX, or GeoJSON fixture changes shape, or any
  focused suite changes behavior rather than just types;
- a public contract snapshot changes;
- the fix requires a runtime allowlist, a new error code/message, a schema
  change, a producer rewrite, or an IPC protocol change.

Report the contradictory evidence and prepare a separate prompt rather than
silently changing the premise.

## Completion criteria

- `ParserIssue.message` accepts only the fixed producer literal union
  (~39 members across the six arms) as a compile-time guard.
- Every trusted producer literal from the grep is a union member; no trusted
  producer file is edited for behavior (the five owning modules gain only the
  `export` keyword on already-narrowed message types).
- The validator's runtime gates are byte-for-byte identical; exactly two
  documented assertions bridge runtime-widened values to the accumulator
  (validator push site and the slice-identity site in
  `createSafeErrorSummary`).
- The five-tributary merge and the `validationIssue` persist path compile
  unchanged and behave identically.
- Untrusted-input fixtures keep arbitrary messages and their rejection
  assertions; one new acceptance case per union arm proves membership.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all verified
  blocking/important findings are fixed and re-tested.
- `docs/ingestion.md` records the `ParserIssue.message` invariant and the
  completion of the prompts 80–111 writer-narrowing lineage.
- Only approved paths are committed locally to `main`; nothing is pushed.

## SKILLS USED

- `architecture-patterns` — preserve the parsers port/child-adapter and
  parent-supervisor boundary; keep the union composition acyclic at runtime
  via erased `import type` edges plus erased `export`-keyword additions only.
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
