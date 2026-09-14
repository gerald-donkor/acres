# 94 — narrow `validateRemappingCompatibility()` remapping code to the fixed literal

## Scope, and why it is next

The committed repository is on `main` at `2a3e26b`
(`refactor(analytics): narrow quality carrier message`, i.e. the prompt 93
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
remapping literal), and 93 (`ParsedObservation` quality carrier narrowed to
the 4 fixed observation-quality literals).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 8 (metrics and deterministic analytics
— the remapping-compatibility issue `code` in
`AnalyticsPublicationService.validateRemappingCompatibility()`, continuing
the prompts 80–93 writer-narrowing lineage into the `code` taxonomy that
prompts 86–93 each explicitly deferred as "separately scoped if ever"),
dependency-safe against prompts 68–93 (no schema, migration, contract,
route, permission, timeout/memory-bound, retention-window, or version-marker
change).

The gap is the last open-`string` `code` on a fully message-narrowed
single-literal producer. `validateRemappingCompatibility()`
(`server/src/analytics/analytics-publication.service.ts`, lines 120–163 —
read this session) pushes exactly 1 code, `metric_definition_incompatible`
(line 154), with exactly 1 message, `REMAPPING_INCOMPATIBLE_MESSAGE` (line
156, narrowed by prompt 92). But its return-element type (line 127) and its
local `issues` array element type (line 135) both still declare
`readonly code: string`, so any future push passing a formatted key dump,
`String(raw)`, or `(error as Error).message` as the code would compile and
persist an unbounded code string into the durable `ValidationIssue.code`
column via `ingestion-processor.service.ts:129–139`
(`remappingIssues: ParserIssue[]`) spread into the combined `issues` array
(`:140–146`) through `validationIssue.createMany` (`:182–199`,
`code: issue.code`) — read this session. That is the exact inversion prompt
92 eliminated for the message on the same method; this prompt closes it for
the code at the type level with zero runtime behavior change. It also closes
the method completely: after this change both `code` and `message` on this
producer are fixed literals, while the shared `ParserIssue.code: string`
carrier (`parser.types.ts:6`) stays open.

Today `validateRemappingCompatibility()` produces exactly this 1 code literal
and no others (verify by reading the method body lines 120–163 — the single
`issues.push` at 153–159 is the only push; do not cite it from memory). The
spec already asserts this exact code literal: `code:
'metric_definition_incompatible'` at
`analytics-publication.service.spec.ts:99` with `columnKey: 'population'`
(`:100`), plus code-array assertions at `:118` and `:152` (grep-verified
this session; re-verify exact surrounding lines from the file, and do not
reword any asserted value). The ingestion-processor spec mocks
`validateRemappingCompatibility` (`jest.fn().mockResolvedValue([])`) and
asserts produced codes only where it drives the surface — re-verify from the
file.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 8 definition (§9, metrics/analytics and its
  skill manifest) with §§16–22 confirming 12E–12K committed; §1 rule that
  open numeric limits need real input and must not be invented (why no new
  code value appears here — only narrowing to the existing produced set).
- `docs/analytics.md` — the mapping-contract paragraph, lines 87–92 (the
  prompt 92 sentence: `validateRemappingCompatibility()` accepts only the
  single fixed literal as a compile-time guard; the mid-transaction
  `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` race guard is unchanged);
  the owning record for the doc update. Resolve the exact paragraph lines
  from the file — do not cite line numbers from memory.
- `server/src/analytics/analytics-publication.service.ts` (710 lines; read
  120–163 for `validateRemappingCompatibility`, its open `code: string` at
  127/135 versus the narrowed `message: RemappingIncompatibleMessage` at
  128/136, and the single `code: 'metric_definition_incompatible'` push at
  154; read 533–536 for the `REMAPPING_INCOMPATIBLE_MESSAGE` const +
  `typeof` union placement to mirror; read 298 for the
  `upsertMetricDefinitions` race-guard throw, untouched) — the producer,
  the single-code matrix, and the open code carrier (narrowed by this
  prompt) versus the shared `ParserIssue.code: string` carrier (untouched).
- `server/src/ingestion/ingestion-processor.service.ts` (read 129–146 for
  the `remappingIssues: ParserIssue[]` call and combined `issues` spread,
  182–199 for the `validationIssue.createMany` durable write with `code:
  issue.code`) — the verbatim flow proving the durable-column gap.
  Resolve exact line numbers from the file.
- `server/src/ingestion/parsers/parser.types.ts` (the shared `ParserIssue`
  shape with `code: string` / `message: string`) — the shared carrier,
  untouched. Resolve exact line numbers from the file.
- `server/src/analytics/analytics-publication.service.spec.ts`
  (remapping-compatibility code assertions at ~98–100 asserting `severity`
  / `code: 'metric_definition_incompatible'` / `columnKey: 'population'`,
  plus `:118` and `:152` — grep-verified this session; re-verify exact
  lines from the file) — existing coverage that must stay green.
- `server/src/ingestion/ingestion-processor.service.spec.ts`
  (`validateRemappingCompatibility` mocked; code-only assertions for this
  surface) — existing coverage that must stay green. Resolve exact lines
  from the file.
- `prompts/92-remapping-compatibility-message-narrowing.md` (message-
  narrowing pattern on this exact method, constant-placement rule, and
  negative-probe procedure to mirror),
  `prompts/88-period-invalid-quality-message-narrowing.md` (single-literal
  narrowing pattern to mirror — one const, one `typeof` member),
  `prompts/89-validate-mapping-message-narrowing.md` (producer-narrowing
  pattern and negative-probe procedure),
  `prompts/72-incompatible-metric-remapping-validation.md` (remap-surface
  premise: pre-publication issue vs mid-transaction race guard).
- Verified closed this session, no change: `validateMapping()` message
  narrowed by prompt 89 (5 literals); `malformedMetricMappingIssues()`
  message narrowed by prompt 90 (3 literals); private ingestion-processor
  `validateMapping()` message narrowed by prompt 91 (4 literals);
  `validateRemappingCompatibility()` message narrowed by prompt 92 (1
  literal); `ParsedObservation` quality carrier narrowed by prompt 93 (4
  literals); `invalidValue()` narrowed by prompt 86 (3 literals);
  `parsePeriod()` narrowed by prompt 88 (1 literal);
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
normative matrix is derived from the existing code read this session:

| producer / value | value today | after |
| --- | --- | --- |
| 1 `validateRemappingCompatibility()` code | any `string` compiles (the gap); runtime value is the single fixed literal `'metric_definition_incompatible'` | only the single fixed literal compiles (`as const` constant, e.g. `REMAPPING_INCOMPATIBLE_CODE`, with a `typeof` single-member union, mirroring prompt 92's message pattern) |
| `validateRemappingCompatibility()` return + `issues`-array `code` carrier (lines 127/135) | open `code: string` next to narrowed `message: RemappingIncompatibleMessage` | narrowed to the 1-member code union (still assignable to `ParserIssue[]` at the call/spread/`createMany` sites) |
| shared `ParserIssue.code` / `ValidationIssue.code` column / read shape | `string` | unchanged — shared shape, no contract change |
| `REMAPPING_INCOMPATIBLE_MESSAGE` / `message` carrier | narrowed by prompt 92 | unchanged |
| `columnKey` (`metric.column`) / `details: { key: metric.key }` | present per issue | unchanged — governed evidence detail, out of scope |
| spec assertions (severity / code / columnKey) | assert the exact code literal already | unchanged |
| `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` race-guard throw | fixed sanitized message, no key material | unchanged |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: pass a `string`-typed variable (e.g. a `String(raw)` value)
as a `validateRemappingCompatibility()`-shaped issue code, confirm `tsc`
rejects it, quote the error, then revert the probe. The probe is not
committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SDL shape,
  permission, purge behavior, compatibility rule (valueType/canonicalUnit/
  allowedAggregation triple untouched), mapping grammar
  (`parseAnalyticsMapping` untouched), aggregate math, lineage, or schedule
  change. Remapping validation behaves byte-identically; incompatible remaps
  carry the same code string as today, now type-checked.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify with
  `npm run contracts:check` (exists at root `package.json:23` and server
  `package.json:15`, verified this session) and state that it passes
  unchanged (validation-issue codes are not a wire-contract literal; the
  read value stays a string).

## Implementation steps

1. `server/src/analytics/analytics-publication.service.ts`: extract the
   single remapping code literal into an `as const` constant (e.g.
   `REMAPPING_INCOMPATIBLE_CODE = 'metric_definition_incompatible'`,
   placed at module top beside `REMAPPING_INCOMPATIBLE_MESSAGE` at
   ~533–536, mirroring the prompt 92 single-literal placement) with a
   `typeof` single-member union type, and narrow both the
   `validateRemappingCompatibility()` returned issue-element `code` (line
   127) and the local `issues`-array element `code` (line 135) to it. The
   existing ingestion-processor call path (`remappingIssues: ParserIssue[]`
   spread into `validationIssue.createMany` with `code: issue.code`) must
   compile unchanged with no casts, since the literal union is assignable
   to `ParserIssue.code: string`. If any site needs a cast — e.g. the code
   is not exactly the single literal — stop: the union is wrong and the
   premise of this prompt is broken. Leave the shared `ParserIssue` shape
   (`code: string`), `REMAPPING_INCOMPATIBLE_MESSAGE` and the narrowed
   `message` carrier (prompt 92 owns), the `upsertMetricDefinitions`
   race-guard throw, `validateMapping()` /
   `malformedMetricMappingIssues()` / `invalidValue()` / `parsePeriod()` /
   `createSafeErrorSummary()` / `ParsedObservation` carrier (prompts 86–91
   and 93 own those producers), the ingestion-processor private
   `validateMapping()` region-column surface (prompt 91 owns), the
   `createMany` shape, and the `columnKey` / `details` values untouched. If
   the narrow rewrite requires touching any of those, stop — the premise is
   broken.
2. Spec expectations: no changes expected (specs already assert the exact
   code literal `metric_definition_incompatible`, not an open string). If
   any spec asserts a different code literal on this surface, keep the
   identical literal; only move to a const import if the implementation
   exports one. Do NOT add, remove, or reword any asserted value. If any
   spec reaches `validateRemappingCompatibility()` with a raw code string
   (verified absent — specs call it with fixed metrics and assert
   severity/code/columnKey — but re-verify), re-point it at the fixed
   literal rather than enshrining it; if re-pointing changes asserted
   behavior, stop and explain.
3. Run the temporary negative probe from the matrix above; quote the `tsc`
   rejection; revert the probe before staging.
4. Docs in the same change: `docs/analytics.md` — one clause beside the
   prompt 92 sentence recording that `validateRemappingCompatibility()`
   accepts only the single fixed code `metric_definition_incompatible`
   (compile-time guard; runtime value unchanged; unbounded code text never
   reaches `ValidationIssue.code` via this producer; the mid-transaction
   `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` race guard is unchanged).
   No new semantics; say so in the summary.
5. Then the §2.1 two-stage review loop (`requesting-code-review` subagent
   with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
   verification) and the `caveman-commit` message.

## Non-goals

- No new code text, message, severity, `columnKey`, or `details`.
- No shared `ParserIssue.code` carrier narrowing (`code: string` stays the
  shared shape; changing it would force every parser, mapping, and
  remapping producer into one change).
- No compatibility-rule change (the valueType/canonicalUnit/
  allowedAggregation triple is byte-for-byte unchanged).
- No `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` / `upsertMetricDefinitions`
  race-guard change (prompt 72 owns that throw; its error-identity comparison
  stays).
- No `REMAPPING_INCOMPATIBLE_MESSAGE` / message-carrier change (prompt 92
  owns that producer; verify it stays green).
- No `validateMapping()` / `malformedMetricMappingIssues()` /
  `invalidValue()` / `parsePeriod()` / `createSafeErrorSummary()` /
  `ParsedObservation`-carrier code change (prompts 86–91 and 93 own those
  producers/messages; their 5/3/4/1/3-literal code taxonomies are separately
  scoped follow-ups if ever; verify they stay green).
- No ingestion-processor private `validateMapping()` region-column change
  (prompt 91 owns that surface; verify it stays green).
- No parser `ParserIssue` producer change (prompts 74/87 own those
  surfaces; the many-literal parser-issue taxonomy is a separately scoped
  change if ever; verify it stays green).
- No `ParsedObservation.quality` / `ObservationQuality.code` carrier change
  (the `value_missing` / `value_invalid` / `period_invalid` quality-code
  taxonomy is a separately scoped follow-up if ever).
- No `details: { key: metric.key }` change (existing governed evidence
  detail carrying the key, not the code-taxonomy gap).
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
producing a remapping-compatibility issue with an arbitrary code string no
longer compiles. No committed runtime path changes value, order, or shape.

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
  files (note: `prompts/92-*.md` and `prompts/93-*.md` are untracked on disk
  and are NOT part of this change — stage only the prompt 94 file, the
  service file, the docs file, and any spec file the implementation
  legitimately touches).
- Then the §2.1 two-stage review loop (`requesting-code-review` subagent with
  BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
  verification) and the `caveman-commit` message.
- Record the result in `docs/analytics.md` in the same change.

## SKILLS USED

- `architecture-patterns` — const/union placement beside the module producer
  vs the shared `ParserIssue` carrier (no new module edges; mirrors prompts
  92/93 layering).
- `nestjs-best-practices` — no provider, wiring, module, or service-shape
  change.
- `postgres-best-practices` — no migration, column, or RLS change (durable
  `ValidationIssue.code` column untouched; TypeScript producer narrows only).
- `sql-optimization-patterns` — no query or plan change (loaded per Phase 8
  manifest; no polling/cleanup query moves).
- `javascript-testing-patterns` — existing remapping code assertions stay
  green in expectation; negative type-probe procedure.
- `error-handling-patterns` — fixed single-code remapping taxonomy
  preserved; compile-time guard so unbounded text can never reach
  `ValidationIssue.code` via this producer (fail-fast at the type level).
- `kpi-dashboard-design` — no metric-semantics change (loaded per Phase 8
  manifest; governed metric definitions untouched).
- `data-storytelling` — no evidence-presentation change (loaded per Phase 8
  manifest; lineage and evidence links untouched).
- `security-best-practices` — durable-column taxonomy bounding; unbounded
  code text never reaches persisted validation-issue rows via this
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
