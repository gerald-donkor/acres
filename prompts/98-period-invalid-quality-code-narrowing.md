# 98 — narrow `parsePeriod()` quality code to the fixed `period_invalid` literal

## Scope, and why it is next

The committed repository is on `main` at `417a5bb`
(`refactor(ingestion): narrow region code union`, i.e. the prompt 97
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
the 5 fixed mapping-validation literals), and 97 (private
`IngestionProcessorService.validateMapping()` code narrowed to the 4 fixed
region-mapping literals, closing the durable `ValidationIssue.code` column —
every producer writing that column is now narrowed).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 8 (metrics and deterministic analytics
— the observation-quality issue `code` in `parsePeriod()`, continuing the
prompts 80–97 writer-narrowing lineage into the quality-`code` taxonomy that
prompts 86/88/93 each explicitly deferred as "separately scoped if ever"),
dependency-safe against prompts 68–97 (no schema, migration, contract, route,
permission, timeout/memory-bound, retention-window, or version-marker
change).

The gap is the last open-`string` `code` on a fully message-narrowed
single-literal producer. `parsePeriod()` (`server/src/analytics/
analytics-publication.service.ts`, function at lines 454–502 — re-verify
exact lines from the file) pushes exactly 1 code, `'period_invalid'` (line
496), paired 1:1 with its prompt-88 message `PERIOD_INVALID_MESSAGE` (line
497). But its return-element type (line 464, `readonly code: string`) still
declares open `string`, so any future push passing a formatted cell dump,
`String(raw)`, or `(error as Error).message` as the code would compile and
persist an unbounded code string into the durable `ObservationQuality.code`
column (`server/prisma/schema.prisma` `model ObservationQuality`, `code
String` at lines 809–824 — re-verify exact lines) via `parseObservation()`
(`:258–281`, `quality: [...period.quality, ...value.quality]` at `:279`)
through `publish()` (`:219–231`, `observationQuality.createMany` with `code:
quality.code` at `:226`) — read this session. That is the exact inversion
prompt 88 eliminated for the message on the same function; this prompt closes
it for the code at the type level with zero runtime behavior change. It is
deliberately the smallest of the three remaining quality-code steps:
`parsePeriod()` 1 literal here, `invalidValue()` 2 literals
(`value_missing` / `value_invalid` via `` `value_${state}` ``) separately
scoped next, and the `ParsedObservation` carrier-element `code` (line 35,
`readonly code: string`) separately scoped after both sub-producers narrow —
mirroring how prompts 86 + 88 preceded the prompt 93 message carrier.

Today `parsePeriod()` produces exactly this 1 code literal and no others
(verify by reading the function body lines 454–502 — the single quality push
at 492–500 is the only push; do not cite it from memory). The spec already
asserts this exact code literal twice: `code: 'period_invalid'` at
`analytics-publication.service.spec.ts:354–355` (the `marks rollover and
ambiguous periods invalid` case asserting both rows via
`observationQualityCreateMany.mock.calls.map(...)` — re-verify exact
surrounding lines from the file, and do not reword any asserted value). The
sibling quality-code assertions (`value_missing` at `:279`, `value_invalid`
at `:323`) drive the separately scoped `invalidValue()` surface and must stay
green untouched.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 8 definition (§9, metrics/analytics and its
  skill manifest) with §§16–22 confirming 12E–12K committed; §1 rule that
  open numeric limits need real input and must not be invented (why no new
  code value appears here — only narrowing to the existing produced set).
- `docs/analytics.md` — the mapping-contract paragraph (the prompt 86/88/93
  narrowing sentences: `invalidValue()` 3 message literals,
  `parsePeriod()` 1 message literal, `ParsedObservation` carrier 4 message
  literals) and the schema paragraph (`ObservationQuality` visible quality
  state); the owning record for the doc update. Resolve the exact paragraph
  lines from the file — do not cite line numbers from memory.
- `server/src/analytics/analytics-publication.service.ts` (728 lines; read
  12–39 for the `ParsedObservation` interface with open `code: string` at
  line 35 versus narrowed `message: ObservationQualityMessage` at line 36 —
  the carrier, untouched by this prompt; read 219–231 for the
  `observationQuality.createMany` durable write with `code: quality.code` at
  226; read 258–281 for `parseObservation()` and the
  `[...period.quality, ...value.quality]` spread at 279; read 454–502 for
  `parsePeriod()`, its open `code: string` at 464 versus the narrowed
  `message: PeriodInvalidMessage` at 465, and the single `code:
  'period_invalid'` push at 496; read 504–520 for the
  `PERIOD_INVALID_MESSAGE` const + `PeriodInvalidMessage` `typeof` union and
  the `ObservationQualityMessage` combining union placement to mirror; read
  563–614 for `parseValue()` / `invalidValue()` with the `` `value_${state}` ``
  template code — separately scoped, untouched) — the producer, the
  single-code matrix, and the open code carrier (narrowed by this prompt)
  versus the shared read-shape carrier (untouched).
- `server/prisma/schema.prisma` (`model ObservationQuality`, lines 809–824
  with `code String` at 815 and `message String` at 816) — the durable
  column, untouched (no migration).
- `server/src/analytics/analytics.service.ts` (read ~94–138 for
  `toObservation()` with the `qualities: Array<{ ... code: string, message:
  string }>` read shape) — the read carrier, deliberately untouched.
  Resolve exact line numbers from the file.
- `server/src/analytics/analytics-publication.service.spec.ts`
  (`period_invalid` code assertions at ~328–357 asserting both invalid-period
  rows; `value_missing` at ~274–283 and `value_invalid` at ~320–325 driving
  the separately scoped `invalidValue()` surface) — existing coverage that
  must stay green. Re-verify exact lines from the file.
- `prompts/88-period-invalid-quality-message-narrowing.md` (message-
  narrowing pattern on this exact function, constant-placement rule, and
  negative-probe procedure to mirror),
  `prompts/86-observation-quality-message-narrowing.md` (sibling
  sub-producer narrowing pattern for `invalidValue()`, 3 literals —
  separately scoped for codes),
  `prompts/93-parsed-observation-quality-message-narrowing.md` (carrier-
  narrowing pattern reusing the two sub-producer `typeof` unions with no new
  literal text — the code-carrier follow-up mirrors this after both
  sub-producer codes narrow),
  `prompts/94-remapping-compatibility-code-narrowing.md` (single-literal
  code-narrowing pattern — one const, one `typeof` member, return-element
  narrowing, `ParserIssue[]`-style assignability rule, and the "if any site
  needs a cast, stop" premise check).
- Verified closed this session, no change: `validateMapping()`
  (analytics-publication) message narrowed by prompt 89 (5 literals) and
  code narrowed by prompt 96 (5 literals);
  `malformedMetricMappingIssues()` message narrowed by prompt 90 (3
  literals) and code narrowed by prompt 95 (1 literal);
  `validateRemappingCompatibility()` message narrowed by prompt 92 (1
  literal) and code narrowed by prompt 94 (1 literal); private
  ingestion-processor `validateMapping()` message narrowed by prompt 91 (4
  literals) and code narrowed by prompt 97 (4 literals);
  `ParsedObservation` quality message carrier narrowed by prompt 93 (4
  literals); `invalidValue()` message narrowed by prompt 86 (3 literals);
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
| `parsePeriod()` code (1 push: unparsable-period branch) | any `string` compiles (the gap); runtime value is the single fixed literal `'period_invalid'` | only the single fixed literal compiles (`as const` constant, e.g. `PERIOD_INVALID_CODE = 'period_invalid'`, placed at module top beside `PERIOD_INVALID_MESSAGE` at ~504–507, with a `typeof` single-member union, e.g. `PeriodInvalidCode`, mirroring prompt 88's message placement) |
| `parsePeriod()` return-element `code` carrier (line 464) | open `code: string` next to narrowed `message: PeriodInvalidMessage` | narrowed to the 1-member code union (still assignable through the `parseObservation()` spread at 279 into `ParsedObservation['quality']` — whose `code: string` at line 35 stays open this prompt — and into `observationQuality.createMany` with `code: quality.code`) |
| shared `ParsedObservation['quality'][number]['code']` carrier (line 35) | `string` | unchanged — separately scoped follow-up after `invalidValue()` codes narrow; changing it here would force the `invalidValue()` template surface into this change |
| `invalidValue()` `` `value_${state}` `` codes (`value_missing` / `value_invalid`) | open template producing 2 runtime literals | unchanged — separately scoped follow-up mirroring prompt 86 |
| `ObservationQuality.code` column / `toObservation()` read shape | `String` / `string` | unchanged — durable column and read shape, no contract change |
| `period` `severity: 'error'` / `state: 'invalid'` / `details: { value }` | present per issue | unchanged — out of scope |
| spec assertions (`period_invalid` × 2; `value_missing`; `value_invalid`) | assert the exact code literals already | unchanged |
| `PERIOD_INVALID_MESSAGE` / message carrier | narrowed by prompt 88 | unchanged |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: pass a `string`-typed variable (e.g. a `String(raw)` value)
as a `parsePeriod()`-shaped quality code, confirm `tsc` rejects it, quote
the error, then revert the probe. The probe is not committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SDL shape,
  permission, purge behavior, mapping grammar (`parseAnalyticsMapping`
  untouched), period parsing (`parseDate` untouched), value parsing
  (`parseValue()` / `invalidValue()` untouched), aggregate math, lineage,
  quality-summary counting, or schedule change. Unparsable periods carry the
  same code string as today, now type-checked at the producing function.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify with
  `npm run contracts:check` (exists at root `package.json:23` and server
  `package.json:15`) and state that it passes unchanged
  (observation-quality codes are not a wire-contract literal; the read value
  stays a string).

## Implementation steps

1. `server/src/analytics/analytics-publication.service.ts`: extract the
   single period-invalid code literal into an `as const` constant (e.g.
   `PERIOD_INVALID_CODE = 'period_invalid'`, placed at module top beside
   `PERIOD_INVALID_MESSAGE` at ~504–507, mirroring the prompt 88
   single-literal placement) with a `typeof` single-member union type (e.g.
   `PeriodInvalidCode`), and narrow the `parsePeriod()` returned
   quality-element `code` (line 464) to it. The existing flow
   (`parseObservation()` spread at 279 into `observationQuality.createMany`
   with `code: quality.code` at 226) must compile unchanged with no casts,
   since the literal union is assignable to the still-open
   `ParsedObservation` carrier `code: string` and to the Prisma `String`
   column. If any site needs a cast — e.g. the push carries a code that is
   not exactly `'period_invalid'` — stop: the union is wrong and the premise
   of this prompt is broken. Leave the shared `ParsedObservation` carrier
   (`code: string` at line 35), the `toObservation()` read shape (`code:
   string`), `parseValue()` / `invalidValue()` and the `` `value_${state}` ``
   template (separately scoped follow-up mirroring prompt 86),
   `validateMapping()` / `malformedMetricMappingIssues()` /
   `validateRemappingCompatibility()` (prompts 89/90/92 own those producers;
   prompts 94/95/96 own their codes), the `createMany` shape, and the
   `severity` / `state` / `details` values untouched. If the narrow rewrite
   requires touching any of those, stop — the premise is broken.
2. Spec expectations: no changes expected (specs already assert the exact
   code literal `period_invalid` for both invalid-period rows, and the
   `value_missing` / `value_invalid` assertions drive the untouched
   `invalidValue()` surface). If any spec asserts a different code literal
   on this surface, keep the identical literal; only move to a const import
   if the implementation exports one. Do NOT add, remove, or reword any
   asserted value. If any spec reaches `parsePeriod()` with a raw code
   string (verified absent — specs drive publication with fixed cell values
   and assert codes — but re-verify), re-point it at the fixed literal
   rather than enshrining it; if re-pointing changes asserted behavior, stop
   and explain.
3. Run the temporary negative probe from the matrix above; quote the `tsc`
   rejection; revert the probe before staging.
4. Docs in the same change: `docs/analytics.md` — one clause beside the
   prompt 88 sentence recording that `parsePeriod()` accepts only the single
   fixed code `period_invalid` (compile-time guard; runtime value unchanged;
   unbounded code text never reaches `ObservationQuality.code` via this
   producer; `invalidValue()` codes and the `ParsedObservation` carrier code
   remain separately scoped follow-ups). No new semantics; say so in the
   summary.
5. Then the §2.1 two-stage review loop (`requesting-code-review` subagent
   with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
   verification) and the `caveman-commit` message.

## Non-goals

- No new code text, message, severity, `state`, or `details`.
- No shared `ParsedObservation['quality'][number]['code']` carrier narrowing
  (`code: string` at line 35 stays open; narrowing it now would force the
  `invalidValue()` template surface into this change — it is the follow-up
  after both sub-producer codes narrow, mirroring prompt 93).
- No `invalidValue()` / `parseValue()` change (the `value_missing` /
  `value_valid`… `value_invalid` 2-literal surface is the separately scoped
  next step mirroring prompt 86; verify it stays green).
- No `PeriodInvalidMessage` / message-carrier change (prompt 88 owns that
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
producing a `parsePeriod()` quality entry with an arbitrary code string no
longer compiles. No committed runtime path changes value, order, or shape.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State this
in the completion summary; do not run browser suites for this change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1 generation) —
  including the temporary negative probe rejection, quoted, then reverted.
- Targeted server suite: `analytics-publication.service.spec.ts` (all
  `period_invalid` / `value_missing` / `value_invalid` code assertions) plus
  `analytics.service.spec.ts`, `ingestion-processor.service.spec.ts`, and
  `mapping.spec.ts`, then the full `npm run test:server` — do not claim the
  full suite from a targeted run.
- `npm run contracts:check` (expected: passes unchanged; if it fails, stop —
  no contract artifact should move for this change).
- `git diff --check` and `git status --short` review; stage only approved
  files (note: `prompts/92-*.md` and `prompts/93-*.md` are untracked on disk
  and are NOT part of this change — stage only the prompt 98 file, the
  service file, the docs file, and any spec file the implementation
  legitimately touches).
- Then the §2.1 two-stage review loop (`requesting-code-review` subagent with
  BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
  verification) and the `caveman-commit` message.
- Record the result in `docs/analytics.md` in the same change.

## SKILLS USED

- `architecture-patterns` — const/union placement beside the module producer
  vs the shared `ParsedObservation` / read-shape carriers (no new module
  edges; mirrors prompts 88/93/94 layering).
- `nestjs-best-practices` — no provider, wiring, module, or service-shape
  change.
- `postgres-best-practices` — no migration, column, or RLS change (durable
  `ObservationQuality.code` column untouched; TypeScript producer narrows
  only).
- `sql-optimization-patterns` — no query or plan change (loaded per Phase 8
  manifest; no polling/cleanup query moves).
- `javascript-testing-patterns` — existing period/quality code assertions stay
  green in expectation; negative type-probe procedure.
- `error-handling-patterns` — fixed single-code period taxonomy preserved;
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
