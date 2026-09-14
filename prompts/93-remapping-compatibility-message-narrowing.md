# 93 — narrow `validateRemappingCompatibility()` remapping-compatibility messages to a fixed literal union

## Scope, and why it is next

The committed repository is on `main` at `1eddafc`
(`refactor(worker): narrow rejected-scan messages`, i.e. prompt 92). All 12
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
mapping-validation literals), 90 (`malformedMetricMappingIssues()`
narrowed to the 3 fixed mapping-shape literals), 91 (private
`IngestionProcessorService.validateMapping()` narrowed to the 4 fixed
region-mapping literals), and 92 (worker rejected-scan triple narrowed to
the single fixed `REJECTED_SCAN_MESSAGE` literal).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 8 (metrics and deterministic analytics —
the remapping-compatibility producer surface in
`AnalyticsPublicationService.validateRemappingCompatibility()`, continuing
the prompts 80–92 writer-narrowing lineage), dependency-safe against prompts
68–92 (no schema, migration, contract, route, permission, timeout/memory-bound,
retention-window, or version-marker change).

The gap is the last open-`string` producer in the durable validation-issue flow
that still compiles with an arbitrary string. `validateRemappingCompatibility()`
(`server/src/analytics/analytics-publication.service.ts` lines 121–151) pushes
exactly 1 inline literal under the single code `metric_definition_incompatible`:

| site | code | message today |
| --- | --- | --- |
| `analytics-publication.service.ts:140–147` | `metric_definition_incompatible` | `'Metric key is already defined with a different type, unit, or aggregation.'` (`:143–144` carry the literal) |

Its output flows verbatim via `ingestion-processor.service.ts:129–139`
(`remappingIssues: ParserIssue[]` from `validateRemappingCompatibility`)
spread into the combined `issues` array (`:140–146`) through
`validationIssue.createMany` (`:182–200`, `message: issue.message` at `:188`)
into the durable `ValidationIssue.message` column. The carrier type is open —
`validateRemappingCompatibility()` returns `Promise<ParserIssue[]>` (`:125`),
and the shared `ParserIssue.message: string` (`parser.types.ts:6`) — so any
future push passing `String(raw)`, `(error as Error).message`, or a formatted
mapping/definition dump would persist raw source/exception text into a column
that survives in PostgreSQL backups and restore drills and is served to every
future reader. That is the exact inversion prompts 89/90/91 eliminated for the
three sibling producers in the same `createMany` write; this prompt closes it
for the remapping-compatibility producer at the type level with zero runtime
behavior change.

Today `validateRemappingCompatibility()` produces exactly this 1 message literal
and no others (verify by reading lines 121–151 — do not cite them from
memory). No spec asserts a message literal for this surface: the six
`validateRemappingCompatibility` specs assert `severity` / `code` /
`columnKey` only —
`analytics-publication.service.spec.ts:96–101` (`toMatchObject({ severity:
'error', code: 'metric_definition_incompatible', columnKey: 'population' })`),
`:117–119` (codes array), `:151–153` (codes array), plus length/empty scoping
cases at `:128–133`, `:165–172`, `:174–187`, `:189–198` — verify exact line
numbers from the file, do not cite them from memory. Do NOT add, remove, or
reword any asserted value.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 8 definition (§9, metrics/analytics and its
  skill manifest) with §§16–22 confirming 12E–12K committed; §1 rule that
  open numeric limits need real input and must not be invented (why no new
  message value appears here — only narrowing to the existing produced
  literal).
- `docs/analytics.md` — the mapping-contract paragraph (lines 57–96) with the
  prompt 86/88/89/90 narrowing sentences (the `invalidValue()` 3-literal
  guard, the `parsePeriod()` fixed-literal guard, the `validateMapping()`
  5-literal guard, the `malformedMetricMappingIssues()` 3-literal guard) and
  the prompt 72 remapping paragraph (blocking
  `metric_definition_incompatible` issue, at-most-one per key, race-guard
  throw); the owning record for the doc update. Resolve the exact paragraph
  lines from the file — do not cite line numbers from memory.
- `server/src/analytics/analytics-publication.service.ts` (691 lines; read
  42–43 for the exported `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` const
  untouched, 47–119 for the prompt 89 `validateMapping()` narrowed return
  untouched, 121–151 for `validateRemappingCompatibility()` and the
  single-literal matrix, 280–290 for the `upsertMetricDefinitions`
  mid-transaction race-guard throw untouched, 492–524 for the prompt 86/88/89
  `PERIOD_INVALID_MESSAGE` / `INVALID_VALUE_*` / `MAPPING_*_MESSAGE`
  const + `typeof` union pattern to mirror placement) — the producer, the
  single-literal matrix, and the open `Promise<ParserIssue[]>` return
  (`:125`, narrowed by this prompt) versus the shared
  `ParserIssue.message: string` carrier (untouched).
- `server/src/ingestion/ingestion-processor.service.ts` (read 116–146 for the
  `malformedMetricIssues` / `validateMapping` / `analyticsIssues` /
  `remappingIssues` calls and the combined `issues` spread, 182–200 for the
  `validationIssue.createMany` durable write with `message: issue.message`
  at `:188`) — the verbatim flow proving the durable-column gap.
- `server/src/ingestion/parsers/parser.types.ts` (lines 3–10, the shared
  `ParserIssue` shape with `message: string`) — the shared carrier, untouched.
- `server/src/analytics/analytics-publication.service.spec.ts`
  (`validateRemappingCompatibility` assertions at ~81–198 asserting
  `severity` / `code` / `columnKey` only) — existing coverage that must stay
  green.
- `prompts/91-region-mapping-message-narrowing.md` (producer-narrowing
  pattern, constant-placement rule, and negative-probe procedure to mirror),
  `prompts/89-*.md` / `prompts/90-*.md` (same), `prompts/72-*.md` (remap
  surface lineage premise: pre-publication issue plus race-guard throw).
- Verified closed this session, no change: `validateMapping()` narrowed by
  prompt 89 (5 literals); `malformedMetricMappingIssues()` narrowed by prompt
  90 (3 literals); ingestion private `validateMapping()` narrowed by prompt
  91 (4 literals); `invalidValue()` narrowed by prompt 86 (3 literals);
  `parsePeriod()` narrowed by prompt 88 (1 literal);
  `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` race-guard identity
  (`:42–43` const plus `:286` throw plus ingestion-processor `:263–264`
  error-identity comparison) untouched; `fail()` narrowed by prompt 80;
  `VALIDATION_FAILURE_*` narrowed by prompt 81;
  `PUBLICATION_UNEXPECTED_FAILURE_MESSAGE` untouched; parser `ParserIssue`
  producers (prompts 74/87 own those surfaces), `reports.service.ts`
  (`ExportFailure` narrowed by prompt 82), `upload-worker.service.ts` +
  `scanner.port.ts` (prompts 75/76/83/92), `outbox.service.ts` (prompt 84),
  `jobs/job-runs.service.ts` (prompt 85).

## Measurements and procedures (no eyeballed numbers)

No comp measurement is involved (server-only, type-only change). The
normative matrix is derived from the existing code:

| producer / value | value today | after |
| --- | --- | --- |
| 1 remapping-compatibility message | any `string` compiles (the gap); runtime value is the single fixed literal | only the single fixed literal compiles (`as const` constant with a `typeof` single-member type, mirroring prompts 86/88/89) |
| `validateRemappingCompatibility()` return-element `message` carrier (`:125–126`) | `ParserIssue[]` with open `message: string` | narrowed return-element `message` to the single-member union (still assignable to `ParserIssue[]` at the call/spread/`createMany` sites) |
| shared `ParserIssue.message` / `ValidationIssue.message` column / read shape | `string` | unchanged — shared shape, no contract change |
| `metric_definition_incompatible` code | the single fixed code inline | unchanged |
| spec assertions (severity + code + columnKey) | assert severity/code/columnKey | unchanged |
| `columnKey` (`metric.column`) / `details: { key: metric.key }` | present per issue | unchanged — governed evidence detail, out of scope |
| at-most-one-issue-per-key (`checked` set) / org-scoped `findFirst` | present | unchanged — validation logic, not the message-taxonomy gap |
| `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` race guard (`:42–43`, `:286`, ingestion-processor `:263–264`) | fixed const + identity comparison | unchanged |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: pass a `string`-typed variable (e.g. a `String(raw)` value)
as a `validateRemappingCompatibility()`-shaped issue message, confirm `tsc`
rejects it, quote the error, then revert the probe. The probe is not
committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SDL shape,
  permission, purge behavior, aggregate math, lineage, mapping grammar
  (`parseAnalyticsMapping` untouched), remap rule (valueType/canonicalUnit/
  allowedAggregation triple untouched), at-most-once-per-key logic, or
  schedule change. Remapping-compatibility validation behaves byte-identically;
  incompatible remaps carry the same string as today, now type-checked.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify with
  `npm run contracts:check` and state that it passes unchanged
  (validation-issue messages are not a wire-contract literal; the read value
  stays a string).

## Implementation steps

1. `server/src/analytics/analytics-publication.service.ts`: extract the single
   remapping-compatibility literal into an `as const` constant (e.g.
   `REMAPPING_INCOMPATIBLE_MESSAGE`, placed at module top beside the
   `MAPPING_*_MESSAGE` constants at lines 508–517, mirroring the prompt 89
   placement) with a `typeof` single-member union type (e.g. `type
   RemappingIncompatibleMessage = typeof REMAPPING_INCOMPATIBLE_MESSAGE`),
   and narrow `validateRemappingCompatibility()`'s returned issue-element
   `message` to it. The existing ingestion-processor call path
   (`remappingIssues: ParserIssue[]` spread into `validationIssue.createMany`
   with `message: issue.message`) must compile unchanged with no casts, since
   the literal union is assignable to `ParserIssue.message: string`. If any
   needs a cast — e.g. the message is not exactly this literal — stop: the
   union is wrong and the premise of this prompt is broken. Leave the shared
   `ParserIssue` shape (`message: string`), `validateMapping()` (prompt 89),
   `malformedMetricMappingIssues` (prompt 90), `validateRemappingCompatibility`
   logic (at-most-once `checked` set, org-scoped `findFirst`, triple rule),
   `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` const + race-guard throw +
   ingestion-processor error-identity comparison, `parsePeriod()` /
   `parseValue()` / `invalidValue()` (prompts 86/88 own), the `createMany`
   shape, and the `code` / `columnKey` / `details` values untouched. If the
   narrow rewrite requires touching any of those, stop — the premise is
   broken.
2. Spec expectations: no changes expected (specs assert `severity` / `code` /
   `columnKey`, not message literals). If any spec asserts a message literal,
   keep the identical literal; only move to a const import if the
   implementation exports one. Do NOT add, remove, or reword any asserted
   value. If any spec reaches `validateRemappingCompatibility()` with a raw
   string (verified absent — specs call it with fixed metrics and assert
   code/columnKey — but re-verify), re-point it at the fixed literal rather
   than enshrining it; if re-pointing changes asserted behavior, stop and
   explain.
3. Run the temporary negative probe from the matrix above; quote the `tsc`
   rejection; revert the probe before staging.
4. Docs in the same change: `docs/analytics.md` — one clause beside the
   prompt 86/88/89/90 narrowing sentences recording that
   `validateRemappingCompatibility()` accepts only the single fixed literal
   (compile-time guard; runtime value unchanged; raw source/exception text
   never reaches `ValidationIssue.message` via this producer; `columnKey` /
   `details.key` JSON remains unchanged governed behavior). No new semantics;
   say so in the summary.
5. Then the §2.1 two-stage review loop (`requesting-code-review` subagent
   with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
   verification) and the `caveman-commit` message.

## Non-goals

- No new message text, code, severity, `columnKey`, or `details`.
- No shared `ParserIssue.message` carrier narrowing (`message: string` stays
  the shared shape; changing it would force every parser, mapping, remapping,
  and region-mapping producer into one change).
- No `validateMapping()` / `malformedMetricMappingIssues()` change (prompts
  89/90 own those producers; verify they stay green).
- No `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` / race-guard throw change
  (prompt 72 owns that surface; the mid-transaction throw stays the race
  guard, including its error-identity comparison at
  ingestion-processor `:263–264`).
- No remap-rule change (valueType/canonicalUnit/allowedAggregation triple,
  whitespace-trimmed unit equality, at-most-one-per-key `checked` set, and
  org-scoped lookup are the validation logic, not the message-taxonomy gap).
- No `details: { key: metric.key }` / `columnKey` change (existing governed
  evidence detail, not the message-taxonomy gap).
- No `invalidValue()` / `parsePeriod()` change (prompts 86/88 own those
  producers; verify they stay green).
- No ingestion private `validateMapping()` region-column change (prompt 91
  owns that surface; verify it stays green).
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
  (prompts 73–88 plus 92 own those surfaces; verify they stay green).

## Reference deltas

None visual (server-only). The one deliberate property delta, stated so it
is not mistaken for a regression: code that previously compiled when
producing a remapping-compatibility issue with an arbitrary string no longer
compiles. No committed runtime path changes value, order, or shape.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State this
in the completion summary; do not run browser suites for this change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1 generation) —
  including the temporary negative probe rejection, quoted, then reverted.
- Targeted server suite: `analytics-publication.service.spec.ts` (all
  remapping-compatibility assertions: incompatible valueType/unit/aggregation,
  whitespace-trimmed equality, compatible relabel, org scoping, unknown key)
  plus `mapping.spec.ts` and `ingestion-processor.service.spec.ts`, then the
  full `npm run test:server` — do not claim the full suite from a targeted
  run.
- `npm run contracts:check` (expected: passes unchanged; if it fails, stop —
  no contract artifact should move for this change).
- `git diff --check` and `git status --short` review; stage only approved
  files.
- Then the §2.1 two-stage review loop (`requesting-code-review` subagent with
  BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
  verification) and the `caveman-commit` message.
- Record the result in `docs/analytics.md` in the same change.

## SKILLS USED

- `architecture-patterns` — const/union placement beside the module producer
  vs the shared `ParserIssue` carrier (no new module edges; mirrors prompts
  86/88/89/90 layering).
- `nestjs-best-practices` — no provider, wiring, module, or service-shape
  change.
- `security-best-practices` — durable-column sanitization; raw source and
  exception text never reaches persisted validation-issue rows via this
  producer.
- `error-handling-patterns` — fixed remapping-compatibility taxonomy
  preserved; compile-time guard so verbatim text can never reach
  `ValidationIssue.message` (fail-fast at the type level).
- `javascript-testing-patterns` — existing remapping specs stay green in
  expectation (code/columnKey assertions); negative type-probe procedure.
- `requesting-code-review` — Stage 1 reviewer subagent dispatch after
  self-verification (§2.1).
- `receiving-code-review` — Stage 2 technical evaluation of review feedback
  before any fix.
- `caveman-commit` — the commit message (ALWAYS rule, §3/§7).
- Loaded and deliberately not used: `postgres-best-practices` /
  `sql-optimization-patterns` (no migration, column, or query-plan change —
  `findFirst` lookup untouched), `api-design-principles` /
  `openapi-spec-generation` (no contract change — verified by
  `contracts:check`), `e2e-testing-patterns` / `playwright` (server-only
  change, no browser surface), `security-threat-model` (no trust boundary
  change — publication isolation is unchanged).
