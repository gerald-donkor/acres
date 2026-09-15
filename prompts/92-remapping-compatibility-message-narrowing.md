# 92 — narrow `validateRemappingCompatibility()` remapping message to a fixed literal

## Scope, and why it is next

The committed repository is on `main` at `b9a9a9c`
(`docs(prompts): add missing 89-91 narrowing prompts`, restoring the prompt
files whose implementations landed in `694f156` / `12845fe` / `38d4b4c`).
The last implementation commit is `38d4b4c`
(`refactor(ingestion): narrow region-mapping messages`, i.e. prompt 91). All
12 ordered phases in `docs/build-plan.md` are implemented and committed
through the Phase 12K exit gate (verification records §§16–22, operator
checklist in `docs/launch-checklist.md`), plus residual follow-ups 68
(saved-view `schemaVersion`), 69 (frozen dashboard-evidence `schemaVersion`),
70 (hourly `exports.purge-expired` reclamation), 71 (download-time expiry
enforcement), 72 (incompatible-metric-remap pre-publication validation), 73
(unexpected publication-failure message sanitization), 74
(`parser_exception` fixed message), 75 (`worker_exception` fixed message), 76
(infected `scanResult` bounded to `'infected'`), 77 (scheduled-job
`JobRun.message` fixed strings), 78 (`jobs.read` owner/admin gate on
`GET /jobs/runs`), 79 (shared `RETENTION_PURGE_BATCH_LIMIT = 500` across all
five purges), 80 (`IngestionProcessorService.fail()` narrowed to the fixed
publication code/message union), 81 (inline `validation_failed` write
narrowed to fixed literals), 82 (`ExportFailure` narrowed to the fixed export
failure union), 83 (`ScanResult.errorCode` narrowed to the fixed scan-error
union plus `'infected'` / `'failed'` status fallbacks), 84 (`OutboxService`
retry/dead-letter writes narrowed to the fixed dispatch-exhausted union), 85
(`JobRunsService.finish()` narrowed to the fixed job-run message union), 86
(`invalidValue()` narrowed to the 3 fixed observation-quality literals), 87
(`createSafeErrorSummary()` message narrowed to the 2 fixed parser-executor
literals), 88 (`parsePeriod()` narrowed to the fixed `period_invalid`
literal), 89 (`validateMapping()` in `analytics-publication.service.ts`
narrowed to the 5 fixed mapping-validation literals), 90
(`malformedMetricMappingIssues()` narrowed to the 3 fixed mapping-shape
literals), and 91 (private `IngestionProcessorService.validateMapping()`
narrowed to the 4 fixed region-mapping literals).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 8 (metrics and deterministic analytics
— the remapping-compatibility producer surface in
`AnalyticsPublicationService.validateRemappingCompatibility()`, continuing
the prompts 80–91 writer-narrowing lineage), dependency-safe against prompts
68–91 (no schema, migration, contract, route, permission,
timeout/memory-bound, retention-window, or version-marker change).

The gap is the last open-`string` `ValidationIssue` producer in the durable
flow that still compiles with an arbitrary string.
`validateRemappingCompatibility()` (`server/src/analytics/
analytics-publication.service.ts`, lines ~121–151 — verify exact line
numbers from the file, do not cite them from memory) pushes exactly 1 inline
literal under the single code `metric_definition_incompatible`:

| code | message today |
| --- | --- |
| `metric_definition_incompatible` | `'Metric key is already defined with a different type, unit, or aggregation.'` |

Its output flows verbatim via `ingestion-processor.service.ts:129–139`
(`remappingIssues: ParserIssue[]` from the organization-scoped
`validateRemappingCompatibility` call) spread into the combined `issues`
array (`:140–146`) through `validationIssue.createMany` (`:182–199`,
`message: issue.message`) into the durable `ValidationIssue.message` column.
The carrier type is open — the method returns `Promise<ParserIssue[]>`, and
the shared `ParserIssue.message: string` (`parser.types.ts:6`) — so any
future push passing `String(raw)`, `(error as Error).message`, or a
formatted definition dump would persist raw source/exception text into a
column that survives in PostgreSQL backups and restore drills and is served
to every future reader. That is the exact inversion prompts 89/90/91
eliminated for the sibling producers in the same `createMany` write; this
prompt closes it for the remapping producer at the type level with zero
runtime behavior change.

Today `validateRemappingCompatibility()` produces exactly this 1 message
literal and no others (verify by reading the method body — do not cite it
from memory). No spec asserts a message literal: the remapping-compatibility
spec asserts `severity` / `code` / `columnKey` only, via
`expect(issues[0]).toMatchObject({ severity: 'error', code:
'metric_definition_incompatible', columnKey: 'population' })` and
`expect(...map((issue) => issue.code)).toEqual([
'metric_definition_incompatible' ])`
(`analytics-publication.service.spec.ts:81–200` — verify exact line numbers
from the file, do not cite them from memory, and do not reword any asserted
value). The ingestion-processor spec mocks
`validateRemappingCompatibility` (`jest.fn().mockResolvedValue([])` at
~182) and asserts produced codes only where it drives the surface — verify
from the file.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 8 definition (§9, metrics/analytics and its
  skill manifest) with §§16–22 confirming 12E–12K committed; §1 rule that
  open numeric limits need real input and must not be invented (why no new
  message value appears here — only narrowing to the existing produced set).
- `docs/analytics.md` — the mapping-contract paragraph (the incompatible-
  remapping sentences: pre-publication blocking
  `metric_definition_incompatible` issue naming the mapped source column with
  the key in issue details, plus the mid-transaction
  `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` race guard) and the prompt
  86/88/89/90 narrowing sentences; the owning record for the doc update.
  Resolve the exact paragraph lines from the file — do not cite line numbers
  from memory.
- `server/src/analytics/analytics-publication.service.ts` (691 lines; read
  42–43 for the `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` const, 47–119
  for the prompt 89 `ValidateMappingMessage` union pattern to mirror, 121–
  151 for `validateRemappingCompatibility` and its single literal, 271–287
  for `upsertMetricDefinitions` and the race-guard throw (untouched),
  508–524 for the `MAPPING_*_MESSAGE` const + `typeof` union placement to
  mirror) — the producer, the single-literal matrix, and the open
  `Promise<ParserIssue[]>` return (narrowed by this prompt) versus the shared
  `ParserIssue.message: string` carrier (untouched).
- `server/src/ingestion/ingestion-processor.service.ts` (read ~116–146 for
  the `remappingIssues: ParserIssue[]` call and combined `issues` spread,
  ~182–199 for the `validationIssue.createMany` durable write with `message:
  issue.message`) — the verbatim flow proving the durable-column gap.
  Resolve exact line numbers from the file.
- `server/src/ingestion/parsers/parser.types.ts` (lines 3–10, the shared
  `ParserIssue` shape with `message: string`) — the shared carrier, untouched.
- `server/src/analytics/analytics-publication.service.spec.ts`
  (remapping-compatibility assertions at ~81–200 asserting `severity` /
  `code` / `columnKey` only) — existing coverage that must stay green.
- `server/src/ingestion/ingestion-processor.service.spec.ts`
  (`validateRemappingCompatibility` mocked at ~182; code-only assertions for
  this surface) — existing coverage that must stay green.
- `prompts/89-validate-mapping-message-narrowing.md` (producer-narrowing
  pattern, constant-placement rule, and negative-probe procedure to mirror),
  `prompts/90-malformed-mapping-message-narrowing.md` (same),
  `prompts/91-region-mapping-message-narrowing.md` (same),
  `prompts/88-period-invalid-quality-message-narrowing.md` (single-literal
  narrowing pattern to mirror — one const, one `typeof` member),
  `prompts/72-incompatible-metric-remapping-validation.md` (remap-surface
  premise: pre-publication issue vs mid-transaction race guard).
- Verified closed this session, no change: `validateMapping()` narrowed by
  prompt 89 (5 literals); `malformedMetricMappingIssues()` narrowed by prompt
  90 (3 literals); private ingestion-processor `validateMapping()` narrowed
  by prompt 91 (4 literals); `invalidValue()` narrowed by prompt 86 (3
  literals); `parsePeriod()` narrowed by prompt 88 (1 literal);
  `createSafeErrorSummary()` narrowed by prompt 87 (2 literals);
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
normative matrix is derived from the existing code:

| producer / value | value today | after |
| --- | --- | --- |
| 1 `validateRemappingCompatibility()` message | any `string` compiles (the gap); runtime value is the single fixed literal | only the single fixed literal compiles (`as const` constant with a `typeof` single-member union, mirroring prompt 88) |
| `validateRemappingCompatibility()` return `message` carrier | `Promise<ParserIssue[]>` with open `message: string` | narrowed return-element `message` to the 1-member union (still assignable to `ParserIssue[]` at the call/spread/`createMany` sites) |
| shared `ParserIssue.message` / `ValidationIssue.message` column / read shape | `string` | unchanged — shared shape, no contract change |
| `metric_definition_incompatible` code | the single fixed code inline | unchanged |
| `columnKey` (`metric.column`) / `details: { key: metric.key }` | present per issue | unchanged — governed evidence detail, out of scope |
| spec assertions (severity / code / columnKey) | assert severity / code / columnKey | unchanged |
| `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` race-guard throw | fixed sanitized message, no key material | unchanged |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: pass a `string`-typed variable (e.g. a `String(raw)` value)
as a `validateRemappingCompatibility()`-shaped issue message, confirm `tsc`
rejects it, quote the error, then revert the probe. The probe is not
committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SDL shape,
  permission, purge behavior, compatibility rule (valueType/canonicalUnit/
  allowedAggregation triple untouched), mapping grammar
  (`parseAnalyticsMapping` untouched), aggregate math, lineage, or schedule
  change. Remapping validation behaves byte-identically; incompatible remaps
  carry the same string as today, now type-checked.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify with
  `npm run contracts:check` and state that it passes unchanged
  (validation-issue messages are not a wire-contract literal; the read value
  stays a string).

## Implementation steps

1. `server/src/analytics/analytics-publication.service.ts`: extract the
   single remapping literal into an `as const` constant (e.g.
   `REMAPPING_INCOMPATIBLE_MESSAGE`, placed at module top beside the
   `MAPPING_*_MESSAGE` consts at ~508–518, mirroring the prompt 88
   single-literal placement) with a `typeof` single-member union type, and
   narrow `validateRemappingCompatibility()`'s returned issue-element
   `message` to it. The existing ingestion-processor call path
   (`remappingIssues: ParserIssue[]` spread into `validationIssue.createMany`
   with `message: issue.message`) must compile unchanged with no casts, since
   the literal union is assignable to `ParserIssue.message: string`. If any
   needs a cast — e.g. the message is not exactly the single literal — stop:
   the union is wrong and the premise of this prompt is broken. Leave the
   shared `ParserIssue` shape (`message: string`),
   `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` and the
   `upsertMetricDefinitions` race-guard throw, `validateMapping()` /
   `malformedMetricMappingIssues()` / `invalidValue()` / `parsePeriod()` /
   `createSafeErrorSummary()` (prompts 86–90 own those producers), the
   ingestion-processor private `validateMapping()` region-column surface
   (prompt 91 owns), the `createMany` shape, and the `code` / `columnKey` /
   `details` values untouched. If the narrow rewrite requires touching any of
   those, stop — the premise is broken.
2. Spec expectations: no changes expected (specs assert `severity` / `code` /
   `columnKey`, not message literals). If any spec asserts a message literal,
   keep the identical literal; only move to a const import if the
   implementation exports one. Do NOT add, remove, or reword any asserted
   value. If any spec reaches `validateRemappingCompatibility()` with a raw
   string (verified absent — specs call it with fixed metrics and assert
   severity/code/columnKey — but re-verify), re-point it at the fixed literal
   rather than enshrining it; if re-pointing changes asserted behavior, stop
   and explain.
3. Run the temporary negative probe from the matrix above; quote the `tsc`
   rejection; revert the probe before staging.
4. Docs in the same change: `docs/analytics.md` — one clause beside the
   prompt 86/88/89/90 narrowing sentences recording that
   `validateRemappingCompatibility()` accepts only the single fixed literal
   (compile-time guard; runtime value unchanged; raw source/exception text
   never reaches `ValidationIssue.message` via this producer; the
   mid-transaction `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` race guard
   is unchanged). No new semantics; say so in the summary.
5. Then the §2.1 two-stage review loop (`requesting-code-review` subagent
   with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
   verification) and the `caveman-commit` message.

## Non-goals

- No new message text, code, severity, `columnKey`, or `details`.
- No shared `ParserIssue.message` carrier narrowing (`message: string` stays
  the shared shape; changing it would force every parser, mapping, and
  remapping producer into one change).
- No compatibility-rule change (the valueType/canonicalUnit/
  allowedAggregation triple is byte-for-byte unchanged).
- No `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` / `upsertMetricDefinitions`
  race-guard change (prompt 72 owns that throw; its error-identity comparison
  stays).
- No `validateMapping()` / `malformedMetricMappingIssues()` /
  `invalidValue()` / `parsePeriod()` / `createSafeErrorSummary()` change
  (prompts 86–90 own those producers; verify they stay green).
- No ingestion-processor private `validateMapping()` region-column change
  (prompt 91 owns that surface; verify it stays green).
- No parser `ParserIssue` producer change (prompts 74/87 own those surfaces;
  the many-literal parser-issue taxonomy is a separately scoped change if
  ever; verify it stays green).
- No `ParsedObservation.quality` / `ObservationQuality.message` carrier
  change (the 4-literal observation-quality surface is separately scoped if
  ever).
- No `details: { key: metric.key }` change (existing governed evidence
  detail carrying the key, not the message-taxonomy gap).
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
  (prompts 73–88 own those surfaces; verify they stay green).

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
  remapping-compatibility assertions) plus `ingestion-processor.service.spec.ts`,
  `mapping.spec.ts`, and `analytics.service.spec.ts`, then the full
  `npm run test:server` — do not claim the full suite from a targeted run.
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
  88/89/90/91 layering).
- `nestjs-best-practices` — no provider, wiring, module, or service-shape
  change.
- `security-best-practices` — durable-column sanitization; raw source and
  exception text never reaches persisted validation-issue rows via this
  producer.
- `error-handling-patterns` — fixed remapping-compatibility taxonomy
  preserved; compile-time guard so verbatim text can never reach
  `ValidationIssue.message` (fail-fast at the type level).
- `javascript-testing-patterns` — existing remapping specs stay green in
  expectation; negative type-probe procedure.
- `requesting-code-review` — Stage 1 reviewer subagent dispatch after
  self-verification (§2.1).
- `receiving-code-review` — Stage 2 technical evaluation of review feedback
  before any fix.
- `caveman-commit` — the commit message (ALWAYS rule, §3/§7).
- Loaded and deliberately not used: `postgres-best-practices` /
  `sql-optimization-patterns` (no migration, column, or query-plan change),
  `api-design-principles` / `openapi-spec-generation` (no contract change —
  verified by `contracts:check`), `e2e-testing-patterns` / `playwright`
  (server-only change, no browser surface), `security-threat-model` (no trust
  boundary change — publication isolation is unchanged).
