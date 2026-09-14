# 99 — narrow `invalidValue()` value code to the fixed 2-literal union

## Scope, and why it is next

The committed repository is on `main` at `37ef206`
(`refactor(analytics): narrow period code literal`, i.e. the prompt 98
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
(`invalidValue()` message narrowed to the 3 fixed observation-quality
literals), 87 (`createSafeErrorSummary()` message narrowed to the 2 fixed
parser-executor literals), 88 (`parsePeriod()` message narrowed to the fixed
`period_invalid` literal), 89 (`validateMapping()` in
`analytics-publication.service.ts` message narrowed to the 5 fixed
mapping-validation literals), 90 (`malformedMetricMappingIssues()` message
narrowed to the 3 fixed mapping-shape literals), 91 (private
`IngestionProcessorService.validateMapping()` message narrowed to the 4 fixed
region-mapping literals), 92 (`validateRemappingCompatibility()` message
narrowed to the single fixed remapping literal), 93 (`ParsedObservation`
quality carrier message narrowed to the 4 fixed observation-quality literals),
94 (`validateRemappingCompatibility()` code narrowed to the single fixed
`metric_definition_incompatible` literal), 95
(`malformedMetricMappingIssues()` code narrowed to the single fixed
`metric_mapping_invalid` literal), 96 (`validateMapping()` code narrowed to
the 5 fixed mapping-validation literals), 97 (private
`IngestionProcessorService.validateMapping()` code narrowed to the 4 fixed
region-mapping literals, closing the durable `ValidationIssue.code` column —
every producer writing that column is now narrowed), and 98 (`parsePeriod()`
code narrowed to the single fixed `period_invalid` literal).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 8 (metrics and deterministic analytics
— the observation-quality issue `code` in `invalidValue()`, continuing the
prompts 80–98 writer-narrowing lineage into the quality-`code` taxonomy that
prompts 86/88/93 each explicitly deferred as "separately scoped if ever"),
dependency-safe against prompts 68–98 (no schema, migration, contract, route,
permission, timeout/memory-bound, retention-window, or version-marker
change).

The gap is the last open-`string` `code` on a fully message-narrowed
multi-branch producer, and the middle step of the three-part quality-code
close-out. `invalidValue()` (`server/src/analytics/
analytics-publication.service.ts`, function at lines 597–618 — re-verify
exact lines from the file) pushes its code via the template
`` `value_${state}` `` with `state: 'missing' | 'invalid'` at exactly 3
sites (numeric branch at ~605, boolean branch at ~611, text-fallback branch
at ~616 — re-verify exact lines), producing exactly 2 runtime literals,
`'value_missing'` and `'value_invalid'`, each paired with its prompt-86
message (`INVALID_VALUE_BLANK_MESSAGE`, `INVALID_VALUE_NUMERIC_MESSAGE`,
`INVALID_VALUE_BOOLEAN_MESSAGE` at ~513–517). But its return type is
`Pick<ParsedObservation, 'value' | 'quality'>`, so the quality-element
`code` is still the open `ParsedObservation['quality'][number]['code']:
string` (line 35), and any future edit passing a formatted cell dump,
`String(raw)`, or `(error as Error).message` as the code would compile and
persist an unbounded code string into the durable `ObservationQuality.code`
column (`server/prisma/schema.prisma` `model ObservationQuality`, `code
String` at 815 — re-verify exact lines) via `parseObservation()`
(`:258–281`, `quality: [...period.quality, ...value.quality]` at `:279`)
through `publish()` (`:219–231`, `observationQuality.createMany` with `code:
quality.code` at `:226`) — read this session. That is the exact inversion
prompt 86 eliminated for the message on the same function, and the exact
2-literal parallel of what prompt 98 closed for the single-literal
`parsePeriod()` code; this prompt closes it for the value code at the type
level with zero runtime behavior change. It is deliberately the middle of
the three remaining quality-code steps: `parsePeriod()` 1 literal closed by
prompt 98, `invalidValue()` 2 literals here, and the `ParsedObservation`
carrier-element `code` (line 35, `readonly code: string`) separately scoped
after — mirroring how prompts 86 + 88 preceded the prompt 93 message
carrier.

Today `invalidValue()` produces exactly these 2 code literals and no others
(verify by reading the function body lines 597–618 — the three
`` `value_${state}` `` pushes above are the only pushes, with `state`
constrained to `'missing' | 'invalid'` at line 599; do not cite them from
memory). The spec already asserts both literals: `code: 'value_missing'` at
`analytics-publication.service.spec.ts:274–283` (the blank-value case
asserting via `observationQualityCreateMany` with
`observationId: 'observation-2'` — re-verify exact surrounding lines from
the file, and do not reword any asserted value) and
`code: 'value_invalid'` at `:321–325` (the unsafe-raw-number case — same
re-verify rule). The sibling quality-code assertions (`period_invalid` × 2
at `:354–355`) drive the already-narrowed `parsePeriod()` surface and must
stay green untouched.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 8 definition (§9, metrics/analytics and its
  skill manifest) with §§16–22 confirming 12E–12K committed; §1 rule that
  open numeric limits need real input and must not be invented (why no new
  code value appears here — only narrowing to the existing produced set).
- `docs/analytics.md` — the mapping-contract paragraph (the prompt 86/88/93
  narrowing sentences: `invalidValue()` 3 message literals,
  `parsePeriod()` 1 message literal plus prompt 98's single-code sentence,
  `ParsedObservation` carrier 4 message literals) and the schema paragraph
  (`ObservationQuality` visible quality state); the owning record for the
  doc update. Resolve the exact paragraph lines from the file — do not cite
  line numbers from memory.
- `server/src/analytics/analytics-publication.service.ts` (732 lines; read
  12–39 for the `ParsedObservation` interface with open `code: string` at
  line 35 versus narrowed `message: ObservationQualityMessage` at line 36 —
  the carrier, untouched by this prompt; read 219–231 for the
  `observationQuality.createMany` durable write with `code: quality.code` at
  226; read 258–281 for `parseObservation()` and the
  `[...period.quality, ...value.quality]` spread at 279; read 454–511 for
  `parsePeriod()` with narrowed `code: PeriodInvalidCode` at 464 versus the
  open template surface below, and the `PERIOD_INVALID_CODE` const +
  `PeriodInvalidCode` `typeof` union at 509–511 to mirror; read 513–524 for
  the three `INVALID_VALUE_*_MESSAGE` consts + `InvalidValueMessage` union
  and the `ObservationQualityMessage` combining union at 524 to mirror; read
  567–595 for `parseValue()` with its 3 `invalidValue()` call sites
  (blank → `'missing'`, numeric-unparsable → `'invalid'`,
  boolean-unparsable → `'invalid'`); read 597–618 for `invalidValue()`
  with the `state: 'missing' | 'invalid'` param at 599 and the three
  `` `value_${state}` `` code pushes at ~605/611/616) — the producer, the
  two-code matrix, and the open code carrier (narrowed by this prompt at
  the function return, not at the shared interface) versus the shared
  read-shape carrier (untouched).
- `server/prisma/schema.prisma` (`model ObservationQuality`, lines 809–824
  with `code String` at 815 and `message String` at 816) — the durable
  column, untouched (no migration).
- `server/src/analytics/analytics.service.ts` (read 94–138 for
  `toObservation()` with the `qualities: Array<{ ... code: string, message:
  string }>` read shape at 109–114, mapped verbatim at 130–135) — the read
  carrier, deliberately untouched. Resolve exact line numbers from the
  file.
- `server/src/analytics/analytics-publication.service.spec.ts`
  (`value_missing` code assertion at ~274–283 with
  `observationId: 'observation-2'`; `value_invalid` at ~321–325;
  `period_invalid` × 2 at ~354–355 driving the untouched `parsePeriod()`
  surface) — existing coverage that must stay green. Re-verify exact lines
  from the file.
- `prompts/86-observation-quality-message-narrowing.md` (message-
  narrowing pattern on this exact function, call-site matrix, and
  negative-probe procedure to mirror),
  `prompts/98-period-invalid-quality-code-narrowing.md` (single-literal
  quality-code pattern on the sibling sub-producer — one const, one
  `typeof` member, return-element narrowing, `ParsedObservation`-carrier
  assignability rule, and the "if any site needs a cast, stop" premise
  check),
  `prompts/93-parsed-observation-quality-message-narrowing.md` (carrier-
  narrowing pattern reusing the two sub-producer `typeof` unions with no new
  literal text — the code-carrier follow-up mirrors this after both
  sub-producer codes narrow),
  `prompts/94-remapping-compatibility-code-narrowing.md` (single-literal
  code-narrowing pattern and the "if any site needs a cast, stop" premise
  check).
- Verified closed this session, no change: `parsePeriod()` message
  narrowed by prompt 88 (1 literal) and code narrowed by prompt 98 (1
  literal); `ParsedObservation` quality message carrier narrowed by prompt
  93 (4 literals); `validateMapping()` (analytics-publication) message
  narrowed by prompt 89 (5 literals) and code narrowed by prompt 96 (5
  literals); `malformedMetricMappingIssues()` message narrowed by prompt 90
  (3 literals) and code narrowed by prompt 95 (1 literal); private
  ingestion-processor `validateMapping()` message narrowed by prompt 91 (4
  literals) and code narrowed by prompt 97 (4 literals);
  `validateRemappingCompatibility()` message narrowed by prompt 92 (1
  literal) and code narrowed by prompt 94 (1 literal);
  `createSafeErrorSummary()` message narrowed by prompt 87 (2 literals);
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
| `invalidValue()` code (3 pushes via `` `value_${state}` ``: numeric-missing, numeric-invalid + boolean-invalid, text-fallback branches) | any `string` compiles (the gap); runtime values are exactly the 2 fixed literals `'value_missing'` / `'value_invalid'` (from `state: 'missing' \| 'invalid'`) | only the 2 fixed literals compile (2 `as const` constants, e.g. `VALUE_MISSING_CODE = 'value_missing'` / `VALUE_INVALID_CODE = 'value_invalid'`, or a keyed mapping off `state`, placed at module top beside the three `INVALID_VALUE_*_MESSAGE` consts at ~513–517, with a `typeof` 2-member union, e.g. `InvalidValueCode`, mirroring prompt 98's code placement at 509–511) |
| `invalidValue()` return quality-element `code` carrier | open `code: string` via `Pick<ParsedObservation, 'value' \| 'quality'>` next to narrowed `message: InvalidValueMessage` | narrowed to the 2-member code union (still assignable through the `parseObservation()` spread at 279 into `ParsedObservation['quality']` — whose `code: string` at line 35 stays open this prompt — and into `observationQuality.createMany` with `code: quality.code`) |
| shared `ParsedObservation['quality'][number]['code']` carrier (line 35) | `string` | unchanged — separately scoped follow-up after this narrow, mirroring prompt 93; changing it here would force the already-narrowed `parsePeriod()` code surface back into this change |
| `parsePeriod()` `period_invalid` code | narrowed by prompt 98 | unchanged — verify it stays green |
| `ObservationQuality.code` column / `toObservation()` read shape | `String` / `string` | unchanged — durable column and read shape, no contract change |
| `severity: 'error'` / `state` passthrough / `details` absent | present per issue | unchanged — out of scope |
| spec assertions (`value_missing`; `value_invalid`; `period_invalid` × 2) | assert the exact code literals already | unchanged |
| `INVALID_VALUE_*_MESSAGE` / message carrier | narrowed by prompt 86 | unchanged |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: pass a `string`-typed variable (e.g. a `String(raw)` value)
as an `invalidValue()`-shaped quality code, confirm `tsc` rejects it, quote
the error, then revert the probe. The probe is not committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SDL shape,
  permission, purge behavior, mapping grammar (`parseAnalyticsMapping`
  untouched), period parsing (`parseDate` untouched), value parsing branches
  (`parseValue()` call sites untouched — same `state` args, same messages),
  aggregate math, lineage, quality-summary counting, or schedule change.
  Blank/unparsable values carry the same code strings as today, now
  type-checked at the producing function.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify with
  `npm run contracts:check` (exists at root `package.json:23` and server
  `package.json:15`) and state that it passes unchanged
  (observation-quality codes are not a wire-contract literal; the read value
  stays a string).

## Implementation steps

1. `server/src/analytics/analytics-publication.service.ts`: extract the two
   value code literals into `as const` constants (e.g. `VALUE_MISSING_CODE
   = 'value_missing'` / `VALUE_INVALID_CODE = 'value_invalid'`, or a
   `state`-keyed const mapping, placed at module top beside the three
   `INVALID_VALUE_*_MESSAGE` consts at ~513–517, mirroring the prompt 86
   message placement and the prompt 98 single-literal code placement) with
   a `typeof` 2-member union type (e.g. `InvalidValueCode`), and narrow
   the `invalidValue()` returned quality-element `code` to it (the return
   is `Pick<ParsedObservation, 'value' | 'quality'>`, so introduce an
   explicit quality-element return narrowing — e.g. an `InvalidValueQuality`
   element type or an inline narrowed `quality` array — without widening
   the shared `ParsedObservation` interface). The three
   `` `value_${state}` `` pushes become the two constants (branch on
   `state`, or index the mapping by `state`). The existing flow
   (`parseObservation()` spread at 279 into `observationQuality.createMany`
   with `code: quality.code` at 226) must compile unchanged with no casts,
   since the literal union is assignable to the still-open
   `ParsedObservation` carrier `code: string` and to the Prisma `String`
   column. If any site needs a cast — e.g. a push carries a code that is
   not exactly `'value_missing'` / `'value_invalid'` — stop: the union is
   wrong and the premise of this prompt is broken. Leave the shared
   `ParsedObservation` carrier (`code: string` at line 35), the
   `toObservation()` read shape (`code: string`), `parsePeriod()` /
   `PERIOD_INVALID_CODE` (prompt 98 owns), `parseValue()` call-site `state`
   args and messages (prompt 86 owns), `validateMapping()` /
   `malformedMetricMappingIssues()` / `validateRemappingCompatibility()`
   (prompts 89/90/92 own those producers; prompts 94/95/96 own their
   codes), the private ingestion-processor `validateMapping()`
   region-column surface (prompts 91/97 own), the `createMany` shape, and
   the `severity` / `state` values untouched. If the narrow rewrite
   requires touching any of those, stop — the premise is broken.
2. Spec expectations: no changes expected (specs already assert the exact
   code literals `value_missing` and `value_invalid` for the two
   value surfaces, and `period_invalid` × 2 for the untouched period
   surface). If any spec asserts a different code literal on this surface,
   keep the identical literal; only move to a const import if the
   implementation exports one. Do NOT add, remove, or reword any asserted
   value. If any spec reaches `invalidValue()` with a raw code string
   (verified absent — specs drive publication with fixed cell values like
   `''` and `Number.MAX_SAFE_INTEGER + 2` and assert codes — but
   re-verify), re-point it at the fixed literal rather than enshrining it;
   if re-pointing changes asserted behavior, stop and explain.
3. Run the temporary negative probe from the matrix above; quote the `tsc`
   rejection; revert the probe before staging.
4. Docs in the same change: `docs/analytics.md` — one clause beside the
   prompt 86 sentence recording that `invalidValue()` accepts only the two
   fixed codes `value_missing` / `value_invalid` (compile-time guard;
   runtime values unchanged; unbounded code text never reaches
   `ObservationQuality.code` via this producer; the `ParsedObservation`
   carrier code remains the separately scoped follow-up). No new semantics;
   say so in the summary.
5. Then the §2.1 two-stage review loop (`requesting-code-review` subagent
   with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
   verification) and the `caveman-commit` message.

## Non-goals

- No new code text, message, severity, `state`, or `details`.
- No shared `ParsedObservation['quality'][number]['code']` carrier narrowing
  (`code: string` at line 35 stays open; narrowing it now would force the
  already-narrowed `parsePeriod()` code surface back into this change — it
  is the follow-up after this narrow, mirroring prompt 93).
- No `parsePeriod()` / `PERIOD_INVALID_CODE` change (prompt 98 owns that
  producer; verify it stays green).
- No `InvalidValueMessage` / message-carrier change (prompt 86 owns that
  producer; verify it stays green).
- No `ObservationQualityMessage` combining-union change (prompt 93 owns the
  message carrier; verify it stays green).
- No `toObservation()` read-shape change (`code: string` / `message: string`
  stay; the read value is not the producer gap).
- No `validateMapping()` / `malformedMetricMappingIssues()` /
  `validateRemappingCompatibility()` change (prompts 89/90/92 own those
  producers; prompts 94/95/96 own their codes; verify they stay green).
- No `ValidationIssue.code` change (prompts 94–97 closed that column; verify
  it stays green).
- No parser `ParserIssue` producer change (prompts 74/87 own those
  surfaces; the many-literal parser-issue taxonomy is a separately scoped
  change if ever; verify it stays green).
- No aggregate math, `qualitySummary()`, lineage, or
  `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` /
  `PUBLICATION_UNEXPECTED_FAILURE_MESSAGE` change (prompts 72/73 own those
  throws; the race-guard error-identity comparison stays).
- No schema or migration change: the `ObservationQuality` table is
  untouched; only the TypeScript producer narrows.
- No permission change.
- No `JobRun` self-retention purge (prompts 79/84/85 name it: five ticks
  write ≥ five rows an hour with no reclamation, but the window is an
  explicit open operator decision per `docs/operations.md`
  `data_retention_policy`; build-plan §1 forbids inventing it).
- No live Docker drills (restart/orphan/Garage/Valkey/ClamAV remain future
  operational work per prompts 72–84).
- No ingestion `fail()` / `validation_failed` / export / scan / outbox /
  job-run / parser-executor failure-code change (prompts 73–85 and 91/97 own
  those surfaces; verify they stay green).

## Reference deltas

None visual (server-only). The one deliberate property delta, stated so it
is not mistaken for a regression: code that previously compiled when
producing an `invalidValue()` quality entry with an arbitrary code string no
longer compiles. No committed runtime path changes value, order, or shape.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State this
in the completion summary; do not run browser suites for this change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1 generation) —
  including the temporary negative probe rejection, quoted, then reverted.
- Targeted server suite: `analytics-publication.service.spec.ts` (all
  `value_missing` / `value_invalid` / `period_invalid` code assertions) plus
  `analytics.service.spec.ts`, `ingestion-processor.service.spec.ts`, and
  `mapping.spec.ts`, then the full `npm run test:server` — do not claim the
  full suite from a targeted run.
- `npm run contracts:check` (expected: passes unchanged; if it fails, stop —
  no contract artifact should move for this change).
- `git diff --check` and `git status --short` review; stage only approved
  files (note: `prompts/92-*.md` and `prompts/93-*.md` are untracked on disk
  and are NOT part of this change — stage only the prompt 99 file, the
  service file, the docs file, and any spec file the implementation
  legitimately touches).
- Then the §2.1 two-stage review loop (`requesting-code-review` subagent with
  BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
  verification) and the `caveman-commit` message.
- Record the result in `docs/analytics.md` in the same change.

## SKILLS USED

- `architecture-patterns` — const/union placement beside the module producer
  vs the shared `ParsedObservation` / read-shape carriers (no new module
  edges; mirrors prompts 86/93/98 layering).
- `nestjs-best-practices` — no provider, wiring, module, or service-shape
  change.
- `postgres-best-practices` — no migration, column, or RLS change (durable
  `ObservationQuality.code` column untouched; TypeScript producer narrows
  only).
- `sql-optimization-patterns` — no query or plan change (loaded per Phase 8
  manifest; no polling/cleanup query moves).
- `javascript-testing-patterns` — existing value/period code assertions stay
  green in expectation; negative type-probe procedure.
- `error-handling-patterns` — fixed 2-code value taxonomy preserved;
  compile-time guard so unbounded text can never reach
  `ObservationQuality.code` via this producer (fail-fast at the type level).
- `kpi-dashboard-design` — no metric-semantics change (loaded per Phase 8
  manifest; governed metric definitions untouched).
- `data-storytelling` — no evidence-presentation change (loaded per Phase 8
  manifest; lineage and evidence links untouched).
- `security-best-practices` — durable-column taxonomy bounding; unbounded
  code text never reaches persisted observation-quality rows via this
  producer.
- `requesting-code-review` — Stage 1 reviewer subagent dispatch after
  self-verification (§2.1).
- `receiving-code-review` — Stage 2 technical evaluation of review feedback
  before any fix.
- `caveman-commit` — the commit message (ALWAYS rule, §3/§7).
- Loaded and deliberately not used: `api-design-principles` /
  `openapi-spec-generation` (no contract change — verified by
  `contracts:check`), `e2e-testing-patterns` / `playwright` (server-only
  change, no browser surface), `security-threat-model` (no trust boundary
  change — publication isolation is unchanged).
