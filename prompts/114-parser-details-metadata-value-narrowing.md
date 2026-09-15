# 114 — narrow parser details/metadata values to the validated scalar record

## Scope, and why it is next

The committed repository is on `main` at `e9d4329`
(`fix(ingestion): preserve __proto__ parser keys`, the prompt 113
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 113 — which closed the last copy-semantics edge in
`validateUntrustedSummary()` and completed the prompts 104–113
validator-hardening lineage (104 response guard, 105 request guard, 106
non-empty ids, 107 metadata fail-closed, 108 finite scalars, 109 row-map
widths, 110–111 issue carrier narrowing, 112 row-number upper bound, 113
`__proto__` preservation).

There is no unbuilt ordered phase left. The next smallest unblocked residual is
inside Phase 7's existing bounded-parser requirements, in the same two
interfaces prompts 110–113 just closed: `ParserIssue.details` and
`ParsedSourceSummary.metadata` in
`server/src/ingestion/parsers/parser.types.ts` are still typed
`Record<string, unknown>`, while every value the validator accepts and every
value any trusted producer emits is a `string | number | boolean | null`
scalar. The sibling containers already state the precise type —
`sampleRows: Array<Record<string, string | number | boolean | null>>` (`:125`)
and validation-row `values: Record<string, string | number | boolean | null>`
(`:128`) — so details/metadata are the last two imprecise carriers in
`ParsedSourceSummary` / `ParserIssue`.

The gap, at `e9d4329` (re-verify exact lines at execution):

1. `ParserIssue.details?: Record<string, unknown>` (`parser.types.ts:117`)
   against the details validation loop in
   `child-process-parser.executor.ts` (`:498–529`), which rejects `null`
   containers, arrays, `> 10` entries, over-length keys, and every value that
   is not `null | string | number | boolean` (`:512–519`), plus non-finite
   numbers (`:520`) and over-length strings (`:521–522`).
2. `ParsedSourceSummary.metadata: Record<string, unknown>`
   (`parser.types.ts:131`) against the metadata validation loop (`:555–576`),
   which enforces the identical primitive-only gate (`:560–569`), the
   `20`-entry cap (`:557`), and the same finiteness/length rules.
3. The two validator locals mirror the imprecise type:
   `sanitizedDetails: Record<string, unknown> | undefined` (`:498`) and
   `metadata: Record<string, unknown>` (`:555`).

Every trusted details/metadata producer emits only scalars (verified this
session by reading each producer):

- `csv-source.parser.ts` metadata (`:98–103`, `:116–120`): strings and one
  boolean (`header: true`);
- `xlsx-source.parser.ts` metadata (`:118–121`, `:134`): strings only;
- `geojson-source.parser.ts` metadata (`:111–115`, `:150`): one number
  (`srid: 4326`), one number (`coordinateCount`), strings;
- `parse-source-buffer.ts` (`:59`, `:85`) and `source-parser.service.ts`
  (`:61`): `metadata: {}`;
- `ingestion-processor.service.ts` region-mapping details (`:354`,
  `:363`): `{ regionRef: string }` and `{ regionRef: string, matches: number }`;
- `parser-utils.ts` `formulaIssue()`: carries no `details`.

Hostile inputs are unaffected by construction: `validateUntrustedSummary()`
takes `raw: unknown`, so object/array/non-finite details/metadata values remain
expressible as untrusted bytes and keep rejecting through the unchanged runtime
gates. This prompt changes types only; no gate, bound, literal, or store
statement moves.

Alternatives considered and deferred (judgements, stated as such): the open
`severity/state/code/message` strings in `analytics.service.ts`
`toObservation()` sit on the GraphQL-adjacent read path with a larger blast
radius and belong to a Phase 8/9-scoped prompt, not this parser-boundary
lineage; `GeometryError`'s open `message: string` needs a sanitization-policy
decision in the prompts 73–77 lineage, not a type narrowing; the
`reject(code: string, message: string)` helper in `graphql-limits.ts` is a
Phase 4 domain. None blocks this prompt.

Inline-union over a shared alias is a judgement, stated as one: the file
already repeats `Record<string, string | number | boolean | null>` inline at
both row sites (`parser.types.ts:125`, `:128`; executor `:373`, `:377`,
`:431`). Mirroring that inline shape at the two remaining sites is the smaller
delta and matches the prompts 110–113 minimal-diff precedent; a new exported
alias would touch the already-precise row sites for consistency and widen the
diff for no behavioral gain.

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
  `Untrusted IPC Validation` paragraph that prompts 104–113 extended).
- `docs/security.md` — TM-07 and the Phase 7A parser-boundary update. This work
  tightens the existing child-to-parent IPC type contract; it does not add or
  move a trust boundary or claim OS/container sandboxing.
- `server/src/ingestion/parsers/parser.types.ts` — `ParserIssue.details`
  (`:117`), `ParsedSourceSummary.metadata` (`:131`), and the precise row-value
  precedent (`:125`, `:128`). Re-read at execution and resolve current line
  numbers rather than editing from this snapshot.
- `server/src/ingestion/parsers/child-process-parser.executor.ts` —
  `sanitizedDetails` local (`:498`), details gate (`:510–522`),
  `defineProperty` store (`:523–528`), metadata local (`:555`), metadata gate
  (`:556–569`), and the `execute()` safe-failure mapping. Re-read at execution.
- Trusted producers (read-only, unchanged; pointers at `e9d4329`):
  - `server/src/ingestion/parsers/csv-source.parser.ts` — metadata (`:98–
103`, `:116–120`);
  - `server/src/ingestion/parsers/xlsx-source.parser.ts` — metadata (`:118–
121`, `:134`);
  - `server/src/ingestion/parsers/geojson-source.parser.ts` — metadata
    (`:111–115`, `:150`);
  - `server/src/ingestion/parsers/parse-source-buffer.ts` (`:59`, `:85`) and
    `server/src/ingestion/parsers/source-parser.service.ts` (`:61`) —
    `metadata: {}`;
  - `server/src/ingestion/parsers/parser-utils.ts` — `formulaIssue()`
    (`:36–49`); no `details`, unchanged.
- Downstream consumers (narrowed to satisfy the five-tributary merge into ParserIssue):
  - `server/src/ingestion/ingestion-processor.service.ts` — merge persist
    (`sampleRows`, `:186`), `regionRef` narrowing (`:202–205`), the details
    `as Prisma.InputJsonValue` cast (`:206–209`, dropped as unnecessary once
    narrowed), region-mapping details producers (`:354`, `:363`), the
    `validateMapping` return type details (`:306`, `:315`), and the whole-object
    `as Prisma.InputJsonObject` cast on `sourceSummary` (`:430–436`, dropped as
    unnecessary once narrowed);
  - `server/src/analytics/mapping.ts` — `malformedMetricMappingIssues`
    (`:52–95`), narrowed to scalar record return type to satisfy `ParserIssue.details`
    in the five-tributary merge;
  - `server/src/analytics/analytics-publication.service.ts` — `validateMapping`
    (`:56–118`) and `validateRemappingCompatibility` (`:120–145`), narrowed to
    scalar record return types to satisfy `ParserIssue.details` in the five-tributary
    merge; reads `summary.validationRows` (`:246`); its quality `details`
    (`:230`) belongs to the separate `ParsedObservation` quality carrier,
    out of scope.
- `server/prisma/schema.prisma` — `ValidationIssue.details Json?` (`:684`);
  schema, migrations, and RLS are untouched (`Json` already stores scalars).
- `server/src/ingestion/parsers/child-process-parser.executor.spec.ts` — the
  fake child-process harness, `defaultLimits` (`:49–56`),
  `createValidSummary(metadata: Record<string, unknown> = {})` (`:58–71`),
  `createNumberMetadata(...): Record<string, unknown>` (`:73–79`), the
  `__proto__` preservation tests (`:755–871`, incl. the
  `as Record<string, unknown>` read cast at `:866`), the non-finite scalar
  matrix (`:873–914`, hostile values passed as untyped `raw` literals), and
  the finite-scalar preservation case typed as `ParsedSourceSummary`
  (`:916–937`, details/metadata values already scalar).
- `server/src/ingestion/parsers/source-parsers.spec.ts` and
  `server/src/ingestion/parsers/compiled-child-process-parser.spec.ts` — valid
  in-process and compiled child/parent producer compatibility evidence.
- `server/src/ingestion/ingestion-processor.service.spec.ts` — merge-site
  construction (`details: { key: 'crop_yield' }`, `:288`); scalar, unchanged.
- `server/eslint.config.mjs` — `typescript-eslint` flat config; the
  `@typescript-eslint/no-unnecessary-type-assertion` disables in the executor
  prove an unnecessary assertion is a lint failure in this codebase.
- `prompts/107-parser-summary-metadata-fail-closed.md` — the metadata
  fail-closed paragraph and `Record<string, unknown>` status quo this prompt
  finally retires.
- `prompts/108-parser-summary-finite-number-validation.md` — the finiteness
  gate this narrowing mirrors at the type level.
- `prompts/113-parser-summary-proto-key-preservation.md` — immediately prior
  prompt, red-then-green pattern, and the docs paragraph this prompt extends.

No visual reference is applicable. This is an internal server-only type
contract change, so the design-system PDF, landing-page PNGs, and recorded
chrome flows provide no evidence and must not be opened or cited as if they
did.

## Measurements and verified invariants

These are code-derived constraints at `e9d4329`; re-verify them before editing:

1. Exactly two interface sites use the imprecise value type:
   `ParserIssue.details?: Record<string, unknown>` and
   `ParsedSourceSummary.metadata: Record<string, unknown>`. Re-run the grep
   (`Record<string, unknown>`) over `server/src/ingestion/parsers/` at
   execution and confirm no third site appeared.
2. Exactly two validator locals mirror it: `sanitizedDetails` (`:498`) and
   `metadata` (`:555`). The row locals (`sanitizedRow` `:377`,
   `sanitizedValues` `:431`) already carry the precise record type and stay
   byte-for-byte unchanged.
3. Every trusted details/metadata producer emits only `string | number |
boolean | null` values (see producer list above). Re-grep `details:` and
   `metadata:` literals flowing into `ParsedSourceSummary` / `ParserIssue`
   at execution; if any producer emits an object, array, or `undefined`
   value into either map, stop and report it rather than widening scope.
4. Hostile shapes stay expressible: rejection tests pass untyped object
   literals as `raw: unknown` (spec `:888–913`, `:1086–1093`-area cases), so
   narrowing the _trusted_ interfaces cannot silence a hostile case. If any
   rejection test constructs its hostile input _through_ the narrowed
   `ParsedSourceSummary` type (rather than as `raw`), record it — the test
   would need a raw-literal rewrite, not a validator change.
5. The finite-scalar preservation case (`:916–937`) is already typed as
   `ParsedSourceSummary` with scalar details/metadata values; it must compile
   unchanged after narrowing and is the positive proof the new types admit
   every valid shape the suite exercises.
6. `ValidationIssue.details` is `Json?` and `sourceSummary` is written under a
   whole-object `as Prisma.InputJsonObject` cast (`:430–436`); no Prisma
   model, migration, or JSON-column type changes. Whether the narrower
   per-issue cast at `:206–209` survives is adjudicated by the toolchain (see
   step 5), never by guessing Prisma's `InputJsonValue` nullability from
   memory.
7. No runtime gate moves: entry caps (details 10, metadata 20), length bounds
   (`MAX_STRING_LENGTH`, `limits.maxCellChars`), finiteness checks, row
   bounds, code/message gates, guards, safe literals, watchdog, fork options,
   and process cleanup stay byte-for-byte equivalent.
8. `ParsedObservation` quality `details` (`analytics-publication.service.ts`)
   is a different interface on a different (Phase 8) carrier; it is explicitly
   out of scope even though the field name matches.
9. There is no established negative-type-test pattern in this repository
   (verified this session: zero `ts-expect-error` / `expectTypeOf` uses in
   `server/src`, `client/`, `packages/shared/src`). Do not invent one; the
   gate for this change is `npm run typecheck` plus unchanged runtime suites.

The required type shape mirrors the existing row precedent exactly:

```ts
readonly details?: Record<string, string | number | boolean | null>;
```

```ts
readonly metadata: Record<string, string | number | boolean | null>;
```

and the exact analogues for the two validator locals. Do not introduce a
shared scalar alias, a key blocklist, a `null`-prototype accumulator, a new
limit, or a per-key branch.

## Expected impact

- Routes changed: none.
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none.
- Database schema, Prisma models, migrations, RLS, queries, indexes, queues,
  and persisted-data formats changed: none.
- Runtime validator behavior: unchanged — every input accepted today is still
  accepted with identical sanitized output; every input rejected today is
  still rejected through the same gates. `Object.keys` / `Object.entries` /
  `toEqual` semantics are untouched (prompt 113's preservation holds for the
  narrowed value type, whose values are exactly the already-gated scalars).
- Compile-time contract: `ParserIssue.details` and
  `ParsedSourceSummary.metadata` no longer admit object, array, or `undefined`
  values at construction. Non-primitive untrusted bytes still arrive as
  `raw: unknown` and still fail closed at runtime.
- Downstream: `ingestion-processor.service.ts` `regionRef` narrowing
  (`:202–205`) keeps compiling (indexed access on the narrowed record yields
  `string | number | boolean | null`); the `:206–209` cast is adjudicated by
  lint/typecheck per step 5; the `:430–436` whole-object cast is untouched.
- Logging/observability: unchanged; no key or value material is logged.
- Threat model: no new boundary and no risk reclassification. The change adds
  a concrete type-contract enforcement detail under the existing TM-07
  mitigation.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and every
   skill named in `## SKILLS USED`. Confirm `git status --short` before editing;
   preserve any unrelated user changes and stop if they overlap an approved
   path. Confirm `HEAD` is `e9d4329` (or record the actual SHA and adjust
   `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–4 at execution: re-run the
   `Record<string, unknown>` grep over `server/src/ingestion/parsers/`,
   re-grep `details:` / `metadata:` literals flowing into `ParserIssue` /
   `ParsedSourceSummary` across `server/src`, confirm every value is a scalar
   literal or a scalar-typed variable (`regionRef: string`, `matches: number`,
   `srid: 4326`, `header: true`), and confirm every hostile spec case passes
   its payload as untyped `raw`. If a non-primitive trusted value or a
   type-funneled hostile case appears, stop and report it rather than silently
   widening scope.
3. In `server/src/ingestion/parsers/parser.types.ts`, change only the two
   value types:
   - `readonly details?: Record<string, unknown>` →
     `readonly details?: Record<string, string | number | boolean | null>`;
   - `readonly metadata: Record<string, unknown>` →
     `readonly metadata: Record<string, string | number | boolean | null>`;
   - leave `severity`, `code`, `message`, `rowNumber`, `columnKey`,
     `sampleRows`, `validationRows`, `columnKeys`, `SourceParser`, and
     `ParserLimits` byte-for-byte unchanged. Do not add an alias.
4. In `server/src/ingestion/parsers/child-process-parser.executor.ts`, change
   only the two locals inside `validateUntrustedSummary()`:
   - `let sanitizedDetails: Record<string, unknown> | undefined` → the
     narrowed record union;
   - `const metadata: Record<string, unknown>` → the narrowed record type;
   - leave every gate, bound, `defineProperty` store, error literal, and the
     `as ParserIssueCode` / `as ParserIssueMessage` assertions with their
     eslint-disable comments byte-for-byte unchanged.
5. In `server/src/ingestion/ingestion-processor.service.ts`, adjudicate the
   `:206–209` details cast and `:430–436` whole-object cast by toolchain:
   - first attempt the narrowed write without the assertion —
     `issue.details === undefined ? undefined : issue.details` — and run
     `npm run typecheck` plus the server ESLint pass;
   - with `details` narrowed to scalar records, dropping `as Prisma.InputJsonValue`
     compiles cleanly;
   - dropping `as Prisma.InputJsonObject` on `sourceSummary` (`:430–436`) is
     similarly adjudicated and required by ESLint (`no-unnecessary-type-assertion`)
     since narrowed `metadata` natively satisfies `Prisma.InputJsonObject`;
   - narrow the return type of `validateMapping` (`:306`, `:315`) as well as the
     tributaries in `server/src/analytics/mapping.ts` (`malformedMetricMappingIssues`,
     `:57`, `:88`) and `server/src/analytics/analytics-publication.service.ts`
     (`validateMapping` `:54`, `:61`, `validateRemappingCompatibility` `:131`, `:140`)
     so the five-tributary merge into `ParserIssue[]` preserves compile-time soundness.
6. In
   `server/src/ingestion/parsers/child-process-parser.executor.spec.ts`, retype
   only the helpers that must satisfy the narrowed interfaces:
   - `createValidSummary(metadata: Record<string, unknown> = {})` → narrowed
     record parameter (default `{}` still valid);
   - `createNumberMetadata(...): Record<string, unknown>` (both the return
     annotation at `:73` and the local at `:74`) → narrowed record type (body
     stores numbers only, unchanged);
   - the `:837` `details: Record<string, unknown>` local → narrowed record
     type (`defineProperty` construction unchanged);
   - the `:866` read cast
     `(validated?.issues[0]?.details as Record<string, unknown>)?.__proto__`:
     run ESLint; if `no-unnecessary-type-assertion` flags it, drop the cast
     to direct property access; if lint is silent, leave the line untouched.
   - add no new test cases: behavior is unchanged, hostile coverage already
     passes payloads as `raw`, and the finite-scalar case (`:916–937`)
     doubles as the positive compile proof. If any existing case fails to
     compile for a reason other than these three helpers plus the `:866`
     line, stop and report it rather than rewriting test semantics.
7. Run focused regression suites for the executor, all three real parser
   producers, compiled child/parent IPC, and the ingestion-processor
   merge-site suite. If any valid production parser summary changes shape,
   key order, or values, stop and report the exact fixture — a type-only
   change must not alter runtime output.
8. Run `npm run contracts:check` and verify no generated REST/OpenAPI/GraphQL
   artifact changes. This internal type-contract change must not alter a public
   contract snapshot.
9. Update `docs/ingestion.md` in the `Child-process parser isolation` /
   `Untrusted IPC Validation` paragraph that prompts 104–113 extended. Record
   that `ParserIssue.details` and `ParsedSourceSummary.metadata` are typed as
   scalar records (`string | number | boolean | null` values), matching the
   long-standing row-value types and the runtime gates; that untrusted
   non-scalar bytes still arrive as `unknown` and fail closed; that no new
   rejection, limit, or runtime behavior was introduced; and that
   `ParsedObservation` quality details remain a separate carrier.
10. Inspect the complete diff, run every check below, and quote real exit status
    plus meaningful test/build totals. Fix issues before review.
11. Run the mandatory two-stage review loop:
    - dispatch a read-only reviewer subagent with `requesting-code-review`, this
      prompt path, `BASE_SHA=e9d4329` (or the recorded actual HEAD), the
      working-tree diff (or implementation `HEAD_SHA` if an intermediate
      commit is explicitly required), changed paths, constraints, and real
      check outputs;
    - process every finding with `receiving-code-review`: understand and verify
      it against source and requirements before changing code; fix blocking and
      important valid findings in order, test each fix, and give technical
      pushback where evidence disproves a suggestion;
    - request follow-up review if a valid fix materially changes architecture,
      a public contract, data flow, or the trust boundary.
12. Commit locally on `main` using `caveman-commit`. Stage:
    - `prompts/114-parser-details-metadata-value-narrowing.md`;
    - `docs/ingestion.md`;
    - `server/src/ingestion/parsers/parser.types.ts`;
    - `server/src/ingestion/parsers/child-process-parser.executor.ts`;
    - `server/src/ingestion/parsers/child-process-parser.executor.spec.ts`;
    - `server/src/ingestion/ingestion-processor.service.ts`;
    - `server/src/analytics/mapping.ts`;
    - `server/src/analytics/analytics-publication.service.ts`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend, or
      push. Use a terse Conventional Commit subject and include a short body
      explaining the type-contract reason because it is not obvious from the
      subject alone.

## Non-goals

- No new numeric or byte-size limit and no change to `PARSER_MAX_ROWS`,
  `PARSER_MAX_GEOJSON_FEATURES`, `MAX_STRING_LENGTH`, `MAX_ISSUES_COUNT`,
  details/metadata entry caps, row-number bounds, or any `ParserLimits` type.
- No runtime gate change: no new rejection, no widened acceptance, no altered
  sanitized output for any input. A test that changes outcome (not just
  compilation) after this edit disproves the premise — stop and report it.
- No shared scalar alias, key blocklist/allowlist, per-key branching,
  `null`-prototype accumulator, or helper extraction.
- No changes to `ParserIssue.severity/code/message/rowNumber/columnKey`,
  `columnKeys`, `sampleRows`/`validationRows` shapes, `SourceParser`,
  `ParserLimits`, or IPC request/response types (prompts 110–113 closed the
  carriers, bounds, and copy semantics).
- No changes to CSV, XLSX, GeoJSON, `parser-utils.ts`, `parse-source-buffer`
  or `source-parser.service.ts` producers; in case of a focused valid-fixture
  contradiction, stop instead of expanding scope.
- No narrowing of `ParsedObservation` quality `details`, `SeedObservationQuality`
  code/message, `GeometryError` messages, `graphql-limits` reject parameters,
  or `toObservation()` read-path strings — each belongs to a different
  domain/lineage and a separate prompt.
- No schema migration, SQL, Prisma repository, RLS, index, tenant, worker
  queue, storage, upload, route, API contract, client, design, accessibility,
  motion, or browser work.
- No OS/container parser sandboxing, seccomp, UID isolation, network namespace,
  parent-process heap limit, streaming IPC protocol, or aggregate serialized
  byte limit.
- No new test cases and no invented negative-type-test pattern (`ts-expect-error`
  / `expectTypeOf` have zero uses in this repository); no general validator
  refactor or unrelated cleanup.

## Reference deltas

No visual delta. The deliberate static delta is limited to the trusted
TypeScript contract: non-scalar `details`/`metadata` values no longer
construct a `ParserIssue` / `ParsedSourceSummary` at compile time. Runtime
acceptance, sanitized output, key order, `__proto__` preservation, and every
rejection path are observably identical before and after.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this internal server type-contract change.

## Checks to run, and the owning doc

```bash
# Focused parent-boundary and executor behavior (must pass unchanged)
npm --workspace=@acres/server test -- child-process-parser.executor.spec.ts

# Real parser-producer, compiled IPC, and merge-site compatibility
npm --workspace=@acres/server test -- source-parsers.spec.ts
npm --workspace=@acres/server test -- compiled-child-process-parser.spec.ts
npm --workspace=@acres/server test -- ingestion-processor.service.spec.ts

# Public contracts must remain unchanged
npm run contracts:check

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/114-parser-details-metadata-value-narrowing.md \
  docs/ingestion.md \
  server/src/ingestion/parsers/parser.types.ts \
  server/src/ingestion/parsers/child-process-parser.executor.ts \
  server/src/ingestion/parsers/child-process-parser.executor.spec.ts \
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
  prompts/114-parser-details-metadata-value-narrowing.md \
  docs/ingestion.md \
  server/src/ingestion/parsers/parser.types.ts \
  server/src/ingestion/parsers/child-process-parser.executor.ts \
  server/src/ingestion/parsers/child-process-parser.executor.spec.ts \
  server/src/ingestion/ingestion-processor.service.ts \
  server/src/analytics/mapping.ts \
  server/src/analytics/analytics-publication.service.ts
```

Quote the actual exit status and meaningful Jest/build totals. If a named spec
does not exist at execution time, locate the closest current equivalent with
`rg --files server/src/ingestion`, run it, and record that evidence instead of
claiming a nonexistent check. Browser E2E, real PostgreSQL, spatial plan, and
operations-drill suites are intentionally omitted because this scope adds no
rejection path, changes no schema/query behavior, and touches no browser
journey or deployment surface.

`docs/ingestion.md` owns the implementation record. `docs/security.md` is
read-only verification for this task because TM-07 already states bounded
parsing and untrusted IPC validation; update it only if execution proves that
statement materially stale, and stop before broadening scope.

## Rollback and stop conditions

Rollback is a source/test/doc revert; there is no migration or persisted-data
rollback. Stop before expanding scope if any of these occur:

- the `Record<string, unknown>` grep shows other than the two interface sites
  plus the two validator locals and three spec helpers at execution time;
- any trusted producer emits an object, array, or `undefined` value into
  `details` or `metadata`;
- any hostile spec case constructs its payload through the narrowed
  `ParsedSourceSummary` type instead of as `raw: unknown`;
- an existing test changes outcome (not just compilation) after the edit;
- a valid committed CSV, XLSX, or GeoJSON fixture changes shape, key order,
  or values after the edit;
- a public contract snapshot changes;
- dropping the `:206–209` cast fails typecheck or lint in a way that requires
  touching more than restoring that single line;
- the fix requires a new limit, rejection, helper, alias, blocklist, error
  code/message, schema change, producer rewrite, or IPC protocol change.

Report the contradictory evidence and prepare a separate prompt rather than
silently changing the premise.

## Completion criteria

- `ParserIssue.details` accepts only scalar-record values at compile time.
- `ParsedSourceSummary.metadata` accepts only scalar-record values at compile
  time.
- Both validator locals carry the narrowed record types; every gate, bound,
  store statement, and safe literal is byte-for-byte equivalent.
- All trusted producers compile unchanged (proof every valid shape is scalar).
- All three spec helpers are retyped; the `:866` cast is dropped only if lint
  flags it; no test semantics changed.
- The `:206–209` cast is dropped only if typecheck and lint both pass without
  it; otherwise restored verbatim with recorded evidence.
- Current executor, CSV/XLSX/GeoJSON, compiled child-process, and merge-site
  tests pass with identical outcomes.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all verified
  blocking/important findings are fixed and re-tested.
- `docs/ingestion.md` records the scalar-record value invariant.
- Only the approved paths are committed locally to `main`; nothing is pushed.

## SKILLS USED

- `architecture-patterns` — preserve the existing parser port/child adapter and
  parent-supervisor boundary without introducing module coupling or a shared
  scalar alias.
- `nestjs-best-practices` — keep validation in the existing Nest ingestion
  boundary and avoid unrelated provider/module changes.
- `postgres-best-practices` — verify that this residual requires no schema,
  migration, transaction, RLS, or persistence-contract change (`Json?`
  already stores scalars).
- `security-best-practices` — tighten the untrusted TypeScript IPC type
  contract at the copy edge without logging key or value material; no Nest-
  specific reference file exists in the installed skill, so repository
  security docs and code are authoritative here.
- `security-threat-model` — verify the work hardens documented TM-07 at the
  existing child-to-parent boundary and does not invent a new boundary, asset,
  or risk rating.
- `error-handling-patterns` — keep the deterministic safe result and cleanup
  path; no new failure literal is introduced.
- `javascript-testing-patterns` — retype helpers without changing test
  semantics; rely on the existing red-then-green suites as unchanged-outcome
  regression proof.
- `e2e-testing-patterns` — confirm the internal validator is correctly covered
  below the E2E layer and that no browser/cross-system suite is warranted.
- `sql-optimization-patterns` — verify no query, index, or query-plan work is
  introduced by this in-memory type change.
- `requesting-code-review` — dispatch the mandatory structured read-only review
  with precise scope, SHAs, changed paths, and check evidence.
- `receiving-code-review` — verify reviewer claims against repository reality
  before fixes or technical pushback.
- `caveman-commit` — produce the required terse Conventional Commit message
  with a short type-contract rationale body.
