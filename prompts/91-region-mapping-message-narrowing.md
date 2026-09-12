# 91 — narrow `IngestionProcessorService.validateMapping()` region-mapping messages to a fixed literal union

## Scope, and why it is next

The committed repository is on `main` at `12845fe`
(`refactor(analytics): narrow mapping-shape messages`, i.e. prompt 90). All 12
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
(`createSafeErrorSummary()` message narrowed to the 2 fixed
parser-executor literals), 88 (`parsePeriod()` narrowed to the fixed
`period_invalid` literal), 89 (`validateMapping()` in
`analytics-publication.service.ts` narrowed to the 5 fixed
mapping-validation literals), and 90 (`malformedMetricMappingIssues()`
narrowed to the 3 fixed mapping-shape literals).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 7 (geography and ingestion — the
region-mapping producer surface in the private
`IngestionProcessorService.validateMapping()`, continuing the prompts 80–90
writer-narrowing lineage), dependency-safe against prompts 68–90 (no schema,
migration, contract, route, permission, timeout/memory-bound, retention-window,
or version-marker change).

The gap is the last open-`string` producer in the durable validation-issue flow
that still compiles with an arbitrary string. The private `validateMapping()`
(`server/src/ingestion/ingestion-processor.service.ts` lines 266–326) pushes 4
inline literals:

| code | message today | site |
| --- | --- | --- |
| `mapping_region_missing` | `'Mapping must include a regionColumn or regionCodeColumn.'` | lines 277–282 |
| `mapping_column_missing` | `'Mapped region column is not present in the source.'` | lines 284–292 |
| `region_unmatched` | `'Mapped region value did not match a known region.'` | lines 306–313 |
| `region_ambiguous` | `'Mapped region value matches more than one known region.'` | lines 315–322 |

Its output flows verbatim via the `validationIssues` call
(`ingestion-processor.service.ts:105–109`) spread into the combined `issues`
array (`:125–131`) through `validationIssue.createMany` (`:167–185`,
`message: issue.message`) into the durable `ValidationIssue.message` column.
The carrier type is open — the private method returns `Promise<ParserIssue[]>`
(`:273`), and the shared `ParserIssue.message: string`
(`parser.types.ts:6`) — so any future push passing `String(raw)`,
`(error as Error).message`, or a formatted mapping dump would persist raw
source/exception text into a column that survives in PostgreSQL backups and
restore drills and is served to every future reader. That is the exact
inversion prompts 80/81/89/90 eliminated for the sibling producers in the same
`createMany` write; this prompt closes it for the region-mapping producer at
the type level with zero runtime behavior change.

Today the private `validateMapping()` produces exactly these 4 message literals
and no others (verify by reading lines 266–326 — do not cite them from
memory). No spec asserts a code or message literal for this surface: the only
spec reference is the `validateMapping: jest.fn().mockReturnValue([])` mock
(`ingestion-processor.service.spec.ts:181` — verify exact line number from the
file, do not cite it from memory), and a repository-wide search for the four
codes finds only the four producer sites. Do NOT add, remove, or reword any
asserted value.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 7 definition (§8, geography/ingestion and its
  skill manifest) with §§16–22 confirming 12E–12K committed; §1 rule that
  open numeric limits need real input and must not be invented (why no new
  message value appears here — only narrowing to the existing produced set).
- `docs/ingestion.md` — the worker-publication-flow paragraph and the prompt
  80/81 narrowing sentences (lines ~243–250: the `fail()` fixed code/message
  union guard and the inline `validation_failed` fixed-literal guard); the
  owning record for the doc update. Resolve the exact paragraph lines from
  the file — do not cite line numbers from memory.
- `server/src/ingestion/ingestion-processor.service.ts` (422 lines; read
  24–38 for the `PUBLICATION_UNEXPECTED_FAILURE_MESSAGE` /
  `VALIDATION_FAILURE_CODE` / `VALIDATION_FAILURE_MESSAGE` module-top const +
  `typeof` union pattern to mirror placement, 97–131 for the
  `validationIssues` call and combined `issues` spread, 166–186 for the
  `validationIssue.createMany` durable write with `message: issue.message`,
  266–326 for the private `validateMapping()` and the 4-literal matrix,
  328–349+ for `matchRegion()` (untouched)) — the producer, the single-file
  matrix, and the open `Promise<ParserIssue[]>` return (`:273`, narrowed by
  this prompt) versus the shared `ParserIssue.message: string` carrier
  (untouched).
- `server/src/ingestion/parsers/parser.types.ts` (lines 3–10, the shared
  `ParserIssue` shape with `message: string`) — the shared carrier, untouched.
- `server/src/ingestion/ingestion-processor.service.spec.ts`
  (`validateMapping` mocked at ~181; no code/message assertions for this
  surface) — existing coverage that must stay green.
- `prompts/90-malformed-mapping-message-narrowing.md` (producer-narrowing
  pattern, constant-placement rule, and negative-probe procedure to mirror),
  `prompts/89-*.md` (same), `prompts/80-*.md` / `prompts/81-*.md` (same-file
  lineage premise).
- Verified closed this session, no change: `fail()` narrowed by prompt 80
  (fixed publication code/message union);
  `VALIDATION_FAILURE_CODE` / `VALIDATION_FAILURE_MESSAGE` narrowed by prompt
  81; `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` race-guard identity
  (`:248`) and `PUBLICATION_UNEXPECTED_FAILURE_MESSAGE` untouched;
  `malformedMetricIssues` (prompt 90), `analyticsIssues` (prompt 89),
  `remappingIssues` / `validateRemappingCompatibility` (prompt 72 owns that
  surface), parser `ParserIssue` producers (prompts 74/87 own those
  surfaces), `reports.service.ts` (`ExportFailure` narrowed by prompt 82),
  `upload-worker.service.ts` + `scanner.port.ts` (prompts 75/76/83),
  `outbox.service.ts` (prompt 84), `jobs/job-runs.service.ts` (prompt 85),
  `invalidValue()` / `parsePeriod()` (prompts 86/88 own those producers).

## Measurements and procedures (no eyeballed numbers)

No comp measurement is involved (server-only, type-only change). The
normative matrix is derived from the existing code:

| producer / value | value today | after |
| --- | --- | --- |
| 4 region-mapping messages | any `string` compiles (the gap); runtime values are the 4 fixed literals | only the 4 fixed literals compile (`as const` constants with a `typeof` union of four, mirroring prompts 80/81/89/90) |
| private `validateMapping()` return `message` carrier | `ParserIssue[]` with open `message: string` | narrowed return-element `message` to the 4-member union (still assignable to `ParserIssue[]` at the call/spread/`createMany` sites) |
| shared `ParserIssue.message` / `ValidationIssue.message` column / read shape | `string` | unchanged — shared shape, no contract change |
| 4 `code` values | the 4 fixed codes inline | unchanged |
| `columnKey` (`mapping_column_missing`, `region_unmatched`, `region_ambiguous`) | present per issue | unchanged — governed evidence detail, out of scope |
| `details: { regionRef: sample.value }` (`region_unmatched`, `region_ambiguous`) | present | unchanged — raw source cell text in `details` JSON is existing governed behavior, out of scope (same treatment as prompt 88's `details: { value: String(...) }`) |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: pass a `string`-typed variable (e.g. a `String(raw)` value)
as a private-`validateMapping()` issue message, confirm `tsc` rejects it,
quote the error, then revert the probe. The probe is not committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SDL shape,
  permission, purge behavior, region-match math (`matchRegion` untouched),
  mapping grammar, or schedule change. Region-mapping validation behaves
  byte-identically; region issues carry the same strings as today, now
  type-checked.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify with
  `npm run contracts:check` and state that it passes unchanged
  (validation-issue messages are not a wire-contract literal; the read value
  stays a string).

## Implementation steps

1. `server/src/ingestion/ingestion-processor.service.ts`: extract the 4
   region-mapping literals into `as const` constants (e.g.
   `REGION_MAPPING_*_MESSAGE`, placed at module top beside
   `VALIDATION_FAILURE_CODE` / `VALIDATION_FAILURE_MESSAGE` at lines 24–38,
   mirroring the prompt 80/81 placement) with a `typeof` four-member union
   type, and narrow the private `validateMapping()`'s pushed issue-element
   `message` to it. The existing call path (`validationIssues:
   ParserIssue[]` spread into `validationIssue.createMany` with `message:
   issue.message`) must compile unchanged with no casts, since the literal
   union is assignable to `ParserIssue.message: string`. If any needs a cast
   — e.g. a message is not exactly one of the 4 literals — stop: the union
   is wrong and the premise of this prompt is broken. Leave the shared
   `ParserIssue` shape (`message: string`), `matchRegion()`, the
   `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` race-guard identity, `fail()`
   / `VALIDATION_FAILURE_*` / `PUBLICATION_UNEXPECTED_FAILURE_MESSAGE`,
   `malformedMetricIssues` / `analyticsIssues` / `remappingIssues`, the
   `createMany` shape, the 4 `code` values, and the `columnKey` / `details`
   values untouched. If the narrow rewrite requires touching any of those,
   stop — the premise is broken.
2. Spec expectations: no changes expected (no spec asserts a code or message
   literal for this surface; `validateMapping` is mocked). If any spec
   asserts a message literal, keep the identical literal; only move to a
   const import if the implementation exports one. Do NOT add, remove, or
   reword any asserted value. If any spec reaches the private
   `validateMapping()` with a raw string (verified absent — the method is
   private and mocked — but re-verify), re-point it at the fixed set rather
   than enshrining it; if re-pointing changes asserted behavior, stop and
   explain.
3. Run the temporary negative probe from the matrix above; quote the `tsc`
   rejection; revert the probe before staging.
4. Docs in the same change: `docs/ingestion.md` — one clause beside the
   prompt 80/81 narrowing sentences recording that the private
   `validateMapping()` accepts only the 4 fixed region-mapping literals
   (compile-time guard; runtime values unchanged; raw source/exception text
   never reaches `ValidationIssue.message` via this producer; raw region
   cell text in `details.regionRef` JSON is unchanged governed behavior). No
   new semantics; say so in the summary.
5. Then the §2.1 two-stage review loop (`requesting-code-review` subagent
   with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
   verification) and the `caveman-commit` message.

## Non-goals

- No new message text, code, severity, `columnKey`, or `details`.
- No shared `ParserIssue.message` carrier narrowing (`message: string` stays
  the shared shape; changing it would force every parser, mapping, and
  remapping producer into one change).
- No `matchRegion()` change (DB-backed `RegionCode`/`RegionAlias` matching
  with `take: 2` ambiguity bound is the region-match math, not the
  message-taxonomy gap).
- No `details: { regionRef: sample.value }` change (existing governed JSON
  evidence detail, not the message-taxonomy gap — same treatment as prompt
  88's period `details`).
- No `validateRemappingCompatibility` /
  `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` change (prompt 72 owns the
  remap surface; the mid-transaction throw stays the race guard, including
  its error-identity comparison).
- No `malformedMetricIssues` / `analyticsIssues` change (prompts 89/90 own
  those producers; verify they stay green).
- No `fail()` / `validation_failed` / `PUBLICATION_UNEXPECTED_FAILURE_MESSAGE`
  change (prompts 73/80/81 own those surfaces; verify they stay green).
- No schema or migration change: the `ValidationIssue` table is untouched;
  only the TypeScript producer narrows.
- No permission change.
- No `JobRun` self-retention purge (prompts 79/84/85 name it: five ticks
  write ≥ five rows an hour with no reclamation, but the window is an
  explicit open operator decision per `docs/operations.md`
  `data_retention_policy`; build-plan §1 forbids inventing it).
- No live Docker drills (restart/orphan/Garage/Valkey/ClamAV remain future
  operational work per prompts 72–84).
- No parser-executor / observation-quality / export / scan / outbox /
  job-run failure-code change (prompts 73–88 own those surfaces; verify they
  stay green).

## Reference deltas

None visual (server-only). The one deliberate property delta, stated so it
is not mistaken for a regression: code that previously compiled when
producing a region-mapping issue with an arbitrary string no longer
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
  `analytics-publication.service.spec.ts`, then the full `npm run test:server`
  — do not claim the full suite from a targeted run.
- `npm run contracts:check` (expected: passes unchanged; if it fails, stop —
  no contract artifact should move for this change).
- `git diff --check` and `git status --short` review; stage only approved
  files.
- Then the §2.1 two-stage review loop (`requesting-code-review` subagent with
  BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
  verification) and the `caveman-commit` message.
- Record the result in `docs/ingestion.md` in the same change.

## SKILLS USED

- `architecture-patterns` — const/union placement beside the module producer
  vs the shared `ParserIssue` carrier (no new module edges; mirrors prompts
  80/81/89/90 layering).
- `nestjs-best-practices` — no provider, wiring, module, or service-shape
  change.
- `security-best-practices` — durable-column sanitization; raw source and
  exception text never reaches persisted validation-issue rows via this
  producer.
- `error-handling-patterns` — fixed region-mapping taxonomy preserved;
  compile-time guard so verbatim text can never reach
  `ValidationIssue.message` (fail-fast at the type level).
- `javascript-testing-patterns` — existing processor specs stay green in
  expectation (mocked `validateMapping`); negative type-probe procedure.
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
