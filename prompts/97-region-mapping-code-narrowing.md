# 97 — narrow `IngestionProcessorService.validateMapping()` region-mapping code to the fixed 4-literal union

## Scope, and why it is next

The committed repository is on `main` at `0d228f9`
(`refactor(analytics): narrow mapping code union`, i.e. the prompt 96
implementation). The prompt 92 and 93 files themselves are present on disk as
untracked `prompts/92-remapping-compatibility-message-narrowing.md` and
`prompts/93-parsed-observation-quality-message-narrowing.md`; per §10 rule 5
the committed state is resolved from `git log`, not from prompt files. All 12
ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus residual follow-ups 68 (saved-view
`schemaVersion`), 69 (frozen dashboard-evidence `schemaVersion`), 70 (hourly
`exports.purge-expired` reclamation), 71 (download-time expiry enforcement),
72 (incompatible-metric-remap pre-publication validation), 73 (unexpected
publication-failure message sanitization), 74 (`parser_exception` fixed
message), 75 (`worker_exception` fixed message), 76 (infected `scanResult`
bounded to `'infected'`), 77 (scheduled-job `JobRun.message` fixed strings),
78 (`jobs.read` owner/admin gate on `GET /jobs/runs`), 79 (shared
`RETENTION_PURGE_BATCH_LIMIT = 500` across all five purges), 80
(`IngestionProcessorService.fail()` narrowed to the fixed publication
code/message union), 81 (inline `validation_failed` write narrowed to fixed
literals), 82 (`ExportFailure` narrowed to the fixed export failure union),
83 (`ScanResult.errorCode` narrowed to the fixed scan-error union plus
`'infected'` / `'failed'` status fallbacks), 84 (`OutboxService`
retry/dead-letter writes narrowed to the fixed dispatch-exhausted union), 85
(`JobRunsService.finish()` narrowed to the fixed job-run message union), 86
(`invalidValue()` narrowed to the 3 fixed observation-quality literals), 87
(`createSafeErrorSummary()` message narrowed to the 2 fixed parser-executor
literals), 88 (`parsePeriod()` narrowed to the fixed `period_invalid`
literal), 89 (`validateMapping()` in `analytics-publication.service.ts`
narrowed to the 5 fixed mapping-validation literals), 90
(`malformedMetricMappingIssues()` narrowed to the 3 fixed mapping-shape
literals), 91 (private `IngestionProcessorService.validateMapping()`
narrowed to the 4 fixed region-mapping literals), 92
(`validateRemappingCompatibility()` message narrowed to the single fixed
remapping literal), 93 (`ParsedObservation` quality carrier narrowed to
the 4 fixed observation-quality literals), 94
(`validateRemappingCompatibility()` code narrowed to the single fixed
`metric_definition_incompatible` literal), 95
(`malformedMetricMappingIssues()` code narrowed to the single fixed
`metric_mapping_invalid` literal), and 96 (`validateMapping()` code
narrowed to the 5 fixed mapping-validation literals).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 7 (geography and ingestion — the
region-mapping issue `code` in the private
`IngestionProcessorService.validateMapping()`, continuing the prompts 80–96
writer-narrowing lineage into the `code` taxonomy that prompts 89–93 each
explicitly deferred as "separately scoped if ever"), dependency-safe against
prompts 68–96 (no schema, migration, contract, route, permission,
timeout/memory-bound, retention-window, or version-marker change).

The gap is the last open-`string` `code` on a fully message-narrowed
multi-literal producer, and the last open `code` carrier on the entire
durable `ValidationIssue.code` column. The private `validateMapping()`
(`server/src/ingestion/ingestion-processor.service.ts`, method at lines
281–357 — re-verify exact lines from the file) pushes exactly 4 codes, each
paired 1:1 with its prompt-91 message literal:

| push (verify lines from file) | code today | message (narrowed by prompt 91) |
| --- | --- | --- |
| region-column absent branch (~308–313) | `'mapping_region_missing'` | `REGION_MAPPING_REGION_MISSING_MESSAGE` |
| region-column not in source branch (~316–322) | `'mapping_column_missing'` | `REGION_MAPPING_COLUMN_MISSING_MESSAGE` |
| unmatched sample branch (~337–344) | `'region_unmatched'` | `REGION_MAPPING_UNMATCHED_MESSAGE` |
| ambiguous sample branch (~346–353) | `'region_ambiguous'` | `REGION_MAPPING_AMBIGUOUS_MESSAGE` |

But its return-element type (line 291, `readonly code: string`) and its local
`issues`-array element type (line 300, `readonly code: string`) both still
declare open `string`, so any future push passing a formatted mapping dump,
`String(raw)`, or `(error as Error).message` as the code would compile and
persist an unbounded code string into the durable `ValidationIssue.code`
column via `ingestion-processor.service.ts:120–124`
(`validationIssues` from the private call) spread into the combined `issues`
array (`:140–146`) through `validationIssue.createMany` (`:182–200`,
`code: issue.code` at `:187`) — read this session. That is the exact
inversion prompt 91 eliminated for the message on the same method, and the
exact multi-literal parallel of what prompts 94/95/96 closed for the codes
on the sibling producers; this prompt closes it for the region-mapping code
at the type level with zero runtime behavior change. It also closes the
method completely — after this change both `code` and `message` on this
producer are fixed literals — and it closes the `ValidationIssue.code`
column completely: every producer writing that column (`validateMapping()`
in `analytics-publication.service.ts`, `malformedMetricMappingIssues()`,
`validateRemappingCompatibility()`, and this private `validateMapping()`)
is then narrowed, while the shared `ParserIssue.code: string` carrier
(`parser.types.ts:5`) stays open.

Today the private `validateMapping()` produces exactly these 4 code literals
and no others (verify by reading the method body lines 281–357 — the four
`issues.push` calls above are the only pushes; do not cite them from
memory). No spec asserts a region-mapping code literal: the
ingestion-processor spec mocks the sibling `validateMapping`
(`jest.fn().mockReturnValue([])` at line 181) and drives other surfaces —
re-verify from the file, and do not reword any asserted value. The private
method itself is not directly unit-tested; its coverage is the
`validation_failed` / `validationIssue` integration path, which must stay
green.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 7 definition (§8, geography/ingestion and its
  skill manifest) with §§16–22 confirming 12E–12K committed; §1 rule that
  open numeric limits need real input and must not be invented (why no new
  code value appears here — only narrowing to the existing produced set).
- `docs/ingestion.md` — the region-mapping paragraph (the prompt 91
  sentence: the private `validateMapping()` accepts only its four fixed
  literals as a compile-time guard; runtime values unchanged and raw
  source/exception text never reaches `ValidationIssue.message` via this
  producer) plus the prompt 80/81 narrowing sentences; the owning record for
  the doc update. Resolve the exact paragraph lines from the file — do not
  cite line numbers from memory.
- `server/src/ingestion/ingestion-processor.service.ts` (453 lines; read
  40–53 for the four `REGION_MAPPING_*_MESSAGE` consts + `RegionMappingMessage`
  union placement to mirror, 120–124 for the `validationIssues` call,
  140–146 for the combined `issues` spread, 182–200 for the
  `validationIssue.createMany` durable write with `code: issue.code` at 187,
  281–297 for the private `validateMapping` signature with open
  `code: string` at line 291 versus the narrowed
  `message: RegionMappingMessage` at line 292, 298–305 for the local
  `issues`-array open `code: string` at line 300, 306–356 for the four
  pushes) — the producer, the four-code matrix, and the open code carriers
  (narrowed by this prompt) versus the shared `ParserIssue.code: string`
  carrier (untouched).
- `server/src/ingestion/parsers/parser.types.ts` (lines 3–10, the shared
  `ParserIssue` shape with `code: string` at line 5 / `message: string` at
  line 6) — the shared carrier, untouched.
- `server/src/ingestion/ingestion-processor.service.spec.ts`
  (`validateMapping` mocked at line 181 with `mockReturnValue([])`; region
  code assertions verified absent this session — re-verify exact lines from
  the file) — existing coverage that must stay green.
- `prompts/91-region-mapping-message-narrowing.md` (message-narrowing
  pattern on this exact method, constant-placement rule, and
  negative-probe procedure to mirror),
  `prompts/94-remapping-compatibility-code-narrowing.md` (single-literal
  code-narrowing pattern — one const, one `typeof` member, return +
  local-array narrowing, `ParserIssue[]` assignability rule, and the "if
  any site needs a cast, stop" premise check),
  `prompts/96-validate-mapping-code-narrowing.md` (multi-literal code
  pattern on two carriers to mirror — `typeof` N-member union beside the
  message consts),
  `prompts/89-validate-mapping-message-narrowing.md` (producer-narrowing
  pattern and negative-probe procedure).
- Verified closed this session, no change: `validateMapping()`
  (analytics-publication) message narrowed by prompt 89 (5 literals) and
  code narrowed by prompt 96 (5 literals);
  `malformedMetricMappingIssues()` message narrowed by prompt 90 (3
  literals) and code narrowed by prompt 95 (1 literal);
  `validateRemappingCompatibility()` message narrowed by prompt 92 (1
  literal) and code narrowed by prompt 94 (1 literal);
  `ParsedObservation` quality carrier narrowed by prompt 93 (4 literals);
  `invalidValue()` narrowed by prompt 86 (3 literals); `parsePeriod()`
  narrowed by prompt 88 (1 literal); `createSafeErrorSummary()` narrowed
  by prompt 87 (2 literals);
  `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` race-guard identity and
  `PUBLICATION_UNEXPECTED_FAILURE_MESSAGE` untouched;
  `ingestion-processor.service.ts` (`fail()` narrowed by prompt 80;
  `VALIDATION_FAILURE_*` narrowed by prompt 81), parser `ParserIssue`
  producers (prompts 74/87 own those surfaces), `reports.service.ts`
  (`ExportFailure` narrowed by prompt 82), `upload-worker.service.ts` +
  `scanner.port.ts` (prompts 75/76/83), `outbox.service.ts` (prompt 84),
  `jobs/job-runs.service.ts` (prompt 85).

## Measurements and procedures (no eyeballed numbers)

No comp measurement is involved (server-only, type-only change). The
normative matrix is derived from the existing code read this session:

| producer / value | value today | after |
| --- | --- | --- |
| private `validateMapping()` code (4 pushes: region-missing, column-missing, unmatched, ambiguous branches) | any `string` compiles (the gap); runtime values are exactly the 4 fixed literals | only the 4 fixed literals compile (4 `as const` constants, e.g. `REGION_MAPPING_REGION_MISSING_CODE = 'mapping_region_missing'`, or a single `typeof` 4-member union — mirror prompt 91's message placement at lines 40–53 and prompt 96's code placement; no new literal text) |
| private `validateMapping()` return + local `issues`-array `code` carriers (lines 291/300) | open `code: string` next to narrowed `message: RegionMappingMessage` | narrowed to the 4-member code union (still assignable to `ParserIssue[]` at the spread/`createMany` sites) |
| shared `ParserIssue.code` / `ValidationIssue.code` column / read shape | `string` | unchanged — shared shape, no contract change |
| `RegionMappingMessage` / `message` carriers | narrowed by prompt 91 | unchanged |
| `rowNumber` / `columnKey` / `details: { regionRef }` / `details: { regionRef, matches }` | present per issue | unchanged — governed evidence detail, out of scope |
| spec assertions | no region-code literal asserted; sibling `validateMapping` mocked | unchanged |
| `matchRegion()` DB-backed matching (`take: 2` ambiguity bound) | region-match math | unchanged |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: pass a `string`-typed variable (e.g. a `String(raw)` value)
as a private-`validateMapping()`-shaped issue code, confirm `tsc`
rejects it, quote the error, then revert the probe. The probe is not
committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SDL shape,
  permission, purge behavior, mapping grammar (`parseAnalyticsMapping`
  untouched), region-match math (`matchRegion()` untouched), aggregate math,
  lineage, or schedule change. Region-mapping validation behaves
  byte-identically; invalid region mappings carry the same code strings as
  today, now type-checked.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify with
  `npm run contracts:check` (exists at root `package.json:23` and server
  `package.json:15`, verified in prompt 94) and state that it passes
  unchanged (validation-issue codes are not a wire-contract literal; the
  read value stays a string).

## Implementation steps

1. `server/src/ingestion/ingestion-processor.service.ts`: extract the four
   region-mapping code literals into `as const` constants (e.g.
   `REGION_MAPPING_REGION_MISSING_CODE = 'mapping_region_missing'`, placed
   at module top beside the four `REGION_MAPPING_*_MESSAGE` consts at lines
   40–47, mirroring the prompt 91 message placement and the prompt 96
   multi-literal code placement) with a `typeof` 4-member union type (e.g.
   `RegionMappingCode`), and narrow both the private `validateMapping()`
   returned issue-element `code` (line 291) and the local `issues`-array
   element `code` (line 300) to it. The existing flow
   (`validationIssues` spread into `validationIssue.createMany` with
   `code: issue.code`) must compile unchanged with no casts, since the
   literal union is assignable to `ParserIssue.code: string`. If any site
   needs a cast — e.g. a push carries a code that is not exactly one of
   the four literals — stop: the union is wrong and the premise of this
   prompt is broken. Leave the shared `ParserIssue` shape
   (`code: string`), `RegionMappingMessage` and the narrowed `message`
   carriers (prompt 91 owns), `matchRegion()`, `fail()` /
   `VALIDATION_FAILURE_*` (prompts 80/81 own), `malformedMetricIssues` /
   `analyticsIssues` / `remappingIssues` producers (prompts 89/90/92 and
   94–96 own), the `createMany` shape, and the `rowNumber` / `columnKey` /
   `details` values untouched. If the narrow rewrite requires touching any
   of those, stop — the premise is broken.
2. Spec expectations: no changes expected (no spec asserts a region-mapping
   code literal; the sibling `validateMapping` is mocked with
   `mockReturnValue([])`). If any spec asserts a region code literal, keep
   the identical literal; only move to a const import if the
   implementation exports one. Do NOT add, remove, or reword any asserted
   value. If any spec reaches the private `validateMapping()` with a raw
   code string (verified absent — but re-verify), re-point it at the fixed
   literal rather than enshrining it; if re-pointing changes asserted
   behavior, stop and explain.
3. Run the temporary negative probe from the matrix above; quote the `tsc`
   rejection; revert the probe before staging.
4. Docs in the same change: `docs/ingestion.md` — one clause beside the
   prompt 91 sentence recording that the private `validateMapping()`
   accepts only the four fixed codes (`mapping_region_missing`,
   `mapping_column_missing`, `region_unmatched`, `region_ambiguous`) as a
   compile-time guard (runtime values unchanged; unbounded code text never
   reaches `ValidationIssue.code` via this producer; this closes the
   `ValidationIssue.code` column — all four producers narrowed). No new
   semantics; say so in the summary.
5. Then the §2.1 two-stage review loop (`requesting-code-review` subagent
   with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
   verification) and the `caveman-commit` message.

## Non-goals

- No new code text, message, severity, `rowNumber`, `columnKey`, or
  `details`.
- No shared `ParserIssue.code` carrier narrowing (`code: string` stays the
  shared shape; changing it would force every parser, mapping, and
  remapping producer into one change).
- No `RegionMappingMessage` / message-carrier change (prompt 91 owns that
  producer; verify it stays green).
- No `matchRegion()` change (DB-backed `RegionCode`/`RegionAlias` matching
  with `take: 2` ambiguity bound is the region-match math, not the
  code-taxonomy gap).
- No `details: { regionRef }` / `{ regionRef, matches }` change (existing
  governed JSON evidence detail, not the code-taxonomy gap).
- No `validateMapping()` (analytics-publication) /
  `malformedMetricMappingIssues()` / `validateRemappingCompatibility()` /
  `invalidValue()` / `parsePeriod()` / `createSafeErrorSummary()` /
  `ParsedObservation`-carrier code change (prompts 86–90 and 92–96 own
  those producers/messages; the quality-code taxonomy
  (`value_missing` / `value_invalid` / `period_invalid`) is a separately
  scoped follow-up if ever; verify they stay green).
- No parser `ParserIssue` producer change (prompts 74/87 own those
  surfaces; the many-literal parser-issue taxonomy is a separately scoped
  change if ever; verify it stays green).
- No `ParsedObservation.quality` / `ObservationQuality.code` carrier change
  (the quality-code taxonomy is a separately scoped follow-up if ever).
- No schema or migration change: the `ValidationIssue` table is untouched;
  only the TypeScript producer narrows.
- No permission change.
- No `JobRun` self-retention purge (prompts 79/84/85 name it: five ticks
  write ≥ five rows an hour with no reclamation, but the window is an
  explicit open operator decision per `docs/operations.md`
  `data_retention_policy`; build-plan §1 forbids inventing it).
- No live Docker drills (restart/orphan/Garage/Valkey/ClamAV remain future
  operational work per prompts 72–84).
- No ingestion `fail()` / `validation_failed` / export / scan / outbox /
  job-run / parser-executor / observation-quality failure-code change
  (prompts 73–88 and 93 own those surfaces; verify they stay green).

## Reference deltas

None visual (server-only). The one deliberate property delta, stated so it
is not mistaken for a regression: code that previously compiled when
producing a region-mapping issue with an arbitrary code string no longer
compiles. No committed runtime path changes value, order, or shape.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State this
in the completion summary; do not run browser suites for this change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1 generation) —
  including the temporary negative probe rejection, quoted, then reverted.
- Targeted server suite: `ingestion-processor.service.spec.ts` (all
  region-mapping assertions) plus `mapping.spec.ts` and
  `analytics-publication.service.spec.ts`, then the full
  `npm run test:server` — do not claim the full suite from a targeted run.
- `npm run contracts:check` (expected: passes unchanged; if it fails, stop —
  no contract artifact should move for this change).
- `git diff --check` and `git status --short` review; stage only approved
  files (note: `prompts/92-*.md` and `prompts/93-*.md` are untracked on disk
  and are NOT part of this change — stage only the prompt 97 file, the
  ingestion-processor file, the docs file, and any spec file the
  implementation legitimately touches).
- Then the §2.1 two-stage review loop (`requesting-code-review` subagent with
  BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
  verification) and the `caveman-commit` message.
- Record the result in `docs/ingestion.md` in the same change.

## SKILLS USED

- `architecture-patterns` — const/union placement beside the module producer
  vs the shared `ParserIssue` carrier (no new module edges; mirrors prompts
  91/94/96 layering).
- `nestjs-best-practices` — no provider, wiring, module, or service-shape
  change.
- `security-best-practices` — durable-column taxonomy bounding; unbounded
  code text never reaches persisted validation-issue rows via this
  producer.
- `error-handling-patterns` — fixed 4-code region-mapping taxonomy
  preserved; compile-time guard so unbounded text can never reach
  `ValidationIssue.code` via this producer (fail-fast at the type level).
- `javascript-testing-patterns` — existing processor specs stay green in
  expectation (sibling `validateMapping` mocked); negative type-probe
  procedure.
- `requesting-code-review` — Stage 1 reviewer subagent dispatch after
  self-verification (§2.1).
- `receiving-code-review` — Stage 2 technical evaluation of review feedback
  before any fix.
- `caveman-commit` — the commit message (ALWAYS rule, §3/§7).
- Loaded and deliberately not used: `postgres-best-practices` /
  `sql-optimization-patterns` (no migration, column, or query-plan change —
  `matchRegion` queries untouched), `api-design-principles` /
  `openapi-spec-generation` (no contract change — verified by
  `contracts:check`), `e2e-testing-patterns` / `playwright` (server-only
  change, no browser surface), `security-threat-model` (no trust boundary
  change — ingestion isolation is unchanged).
