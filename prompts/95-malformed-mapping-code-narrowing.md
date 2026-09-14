# 95 — narrow `malformedMetricMappingIssues()` mapping-shape code to the fixed literal

## Scope, and why it is next

The committed repository is on `main` at `0db05ad`
(`refactor(analytics): narrow remapping code literal`, i.e. the prompt 94
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
the 4 fixed observation-quality literals), and 94
(`validateRemappingCompatibility()` code narrowed to the single fixed
`metric_definition_incompatible` literal).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 8 (metrics and deterministic analytics
— the mapping-shape issue `code` in
`server/src/analytics/mapping.ts:malformedMetricMappingIssues()`, continuing
the prompts 80–94 writer-narrowing lineage into the `code` taxonomy that
prompts 86–93 each explicitly deferred as "separately scoped if ever"),
dependency-safe against prompts 68–94 (no schema, migration, contract,
route, permission, timeout/memory-bound, retention-window, or version-marker
change).

The gap is the last open-`string` `code` on a fully message-narrowed
single-code producer. `malformedMetricMappingIssues()`
(`server/src/analytics/mapping.ts`, lines 48–128 — read this session)
pushes exactly 1 code, `metric_definition_incompatible`'s sibling
`metric_mapping_invalid`, at exactly 3 sites: line 62 (non-array `metrics`
branch), line 72 (non-object entry branch), and line 202 (the
`invalidMetricIssue()` helper for every missing/invalid field), with exactly
3 messages, the `MalformedMetricMappingMessage` union (lines 26–29,
narrowed by prompt 90). But its return-element type (line 50), its inner
`issues`-array element type (line 81), and the helper's inferred return
shape (lines 198–205) all still carry an open `code: string`, so any future
push passing a formatted mapping dump, `String(raw)`, or
`(error as Error).message` as the code would compile and persist an
unbounded code string into the durable `ValidationIssue.code` column via
`ingestion-processor.service.ts:116–118`
(`malformedMetricIssues: ParserIssue[]`) spread into the combined `issues`
array (`:140–146`) through `validationIssue.createMany` (`:182–199`,
`code: issue.code`) — read this session. That is the exact inversion prompt
90 eliminated for the message on the same function, and the exact parallel
of what prompt 94 closed for the code on the sibling remapping producer;
this prompt closes it for the mapping-shape code at the type level with
zero runtime behavior change. It also closes the function completely: after
this change both `code` and `message` on this producer are fixed literals,
while the shared `ParserIssue.code: string` carrier
(`parser.types.ts:5`) stays open.

Today `malformedMetricMappingIssues()` produces exactly this 1 code literal
and no others (verify by reading the function body lines 48–128 — the three
`code: 'metric_mapping_invalid'` pushes at 62/72/202 are the only pushes;
do not cite them from memory). The spec already asserts this exact code
literal four times: `code: 'metric_mapping_invalid'` at
`mapping.spec.ts:57/61/65/69` with `details: { index: 0, field:
'valueType' | 'unit' | 'periodColumn' | 'dimensionColumns' }` (`:58/62/66/70`)
inside `expect.objectContaining` (`:56/60/64/68`), driven by
`malformedMetricMappingIssues({ metrics: [...] })` at `:42–52` (read this
session; re-verify exact surrounding lines from the file, and do not
reword any asserted value).

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 8 definition (§9, metrics/analytics and its
  skill manifest) with §§16–22 confirming 12E–12K committed; §1 rule that
  open numeric limits need real input and must not be invented (why no new
  code value appears here — only narrowing to the existing produced set).
- `docs/analytics.md` — the mapping-contract paragraph, lines 83–86 (the
  prompt 90 sentence: `malformedMetricMappingIssues()` accepts only its
  three fixed literals as a compile-time guard; runtime values unchanged
  and raw source/exception text never reaches `ValidationIssue.message`
  via this producer); the owning record for the doc update. Resolve the
  exact paragraph lines from the file — do not cite line numbers from
  memory.
- `server/src/analytics/mapping.ts` (211 lines; read 19–29 for the three
  `MALFORMED_MAPPING_*_MESSAGE` consts + `MalformedMetricMappingMessage`
  union placement to mirror, 48–54 for the outer return with open
  `code: string` at line 50 versus the narrowed `message:
  MalformedMetricMappingMessage` at line 51, 58–66 for the non-array
  branch push at 62, 67–77 for the non-object entry push at 72, 79–85 for
  the inner `issues`-array open `code: string` at line 81, 86–126 for the
  field pushes via the helper, 198–205 for `invalidMetricIssue()` pushing
  at 202) — the producer, the single-code matrix, and the open code
  carriers (narrowed by this prompt) versus the shared
  `ParserIssue.code: string` carrier (untouched).
- `server/src/ingestion/ingestion-processor.service.ts` (read 116–118 for
  the `malformedMetricIssues: ParserIssue[]` call, 140–146 for the
  combined `issues` spread, 182–199 for the `validationIssue.createMany`
  durable write with `code: issue.code`) — the verbatim flow proving the
  durable-column gap. Resolve exact line numbers from the file.
- `server/src/ingestion/parsers/parser.types.ts` (lines 3–10, the shared
  `ParserIssue` shape with `code: string` / `message: string`) — the
  shared carrier, untouched.
- `server/src/analytics/mapping.spec.ts` (malformed-shape code assertions
  at 54–73 asserting `code: 'metric_mapping_invalid'` ×4 with field
  details `valueType` / `unit` / `periodColumn` / `dimensionColumns` —
  read this session; re-verify exact lines from the file) — existing
  coverage that must stay green.
- `server/src/ingestion/ingestion-processor.service.spec.ts`
  (`validateRemappingCompatibility` mocked; `validateMapping` mocked at
  ~181; code assertions for this surface are in `mapping.spec.ts`, not
  here) — existing coverage that must stay green. Resolve exact lines
  from the file.
- `prompts/90-malformed-mapping-message-narrowing.md` (message-
  narrowing pattern on this exact function, constant-placement rule, and
  negative-probe procedure to mirror),
  `prompts/94-remapping-compatibility-code-narrowing.md` (single-literal
  code-narrowing pattern to mirror — one const, one `typeof` member,
  return + local-array narrowing, `ParserIssue[]` assignability rule,
  and the "if any site needs a cast, stop" premise check),
  `prompts/88-period-invalid-quality-message-narrowing.md`
  (single-literal narrowing pattern),
  `prompts/89-validate-mapping-message-narrowing.md` (producer-narrowing
  pattern and negative-probe procedure).
- Verified closed this session, no change: `validateMapping()` message
  narrowed by prompt 89 (5 literals);
  `malformedMetricMappingIssues()` message narrowed by prompt 90 (3
  literals); private ingestion-processor `validateMapping()` message
  narrowed by prompt 91 (4 literals);
  `validateRemappingCompatibility()` message narrowed by prompt 92 (1
  literal) and code narrowed by prompt 94 (1 literal);
  `ParsedObservation` quality carrier narrowed by prompt 93 (4
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
| `malformedMetricMappingIssues()` code (3 pushes: non-array branch, non-object entry branch, `invalidMetricIssue()` helper) | any `string` compiles (the gap); runtime value is the single fixed literal `'metric_mapping_invalid'` at all 3 sites | only the single fixed literal compiles (`as const` constant, e.g. `MALFORMED_MAPPING_CODE`, with a `typeof` single-member union, mirroring prompt 94's code pattern and prompt 90's message placement at lines 19–29) |
| `malformedMetricMappingIssues()` return + inner `issues`-array + helper `code` carriers (lines 50/81/198–205) | open `code: string` next to narrowed `message: MalformedMetricMappingMessage` | narrowed to the 1-member code union (still assignable to `ParserIssue[]` at the call/spread/`createMany` sites) |
| shared `ParserIssue.code` / `ValidationIssue.code` column / read shape | `string` | unchanged — shared shape, no contract change |
| `MalformedMetricMappingMessage` / `message` carriers | narrowed by prompt 90 | unchanged |
| `details: { index }` / `{ index, field }` | present per issue | unchanged — governed evidence detail, out of scope |
| spec assertions (code ×4 with field details) | assert the exact code literal already | unchanged |
| `parseAnalyticsMapping()` filter behavior | drops malformed entries, returns `{ metrics }` | unchanged |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: pass a `string`-typed variable (e.g. a `String(raw)` value)
as a `malformedMetricMappingIssues()`-shaped issue code, confirm `tsc`
rejects it, quote the error, then revert the probe. The probe is not
committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SDL shape,
  permission, purge behavior, mapping grammar (`parseAnalyticsMapping`
  untouched), aggregate math, lineage, or schedule change. Malformed-mapping
  validation behaves byte-identically; malformed entries carry the same code
  string as today, now type-checked.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify with
  `npm run contracts:check` (exists at root `package.json:23` and server
  `package.json:15`, verified in prompt 94) and state that it passes
  unchanged (validation-issue codes are not a wire-contract literal; the
  read value stays a string).

## Implementation steps

1. `server/src/analytics/mapping.ts`: extract the single mapping-shape code
   literal into an `as const` constant (e.g. `MALFORMED_MAPPING_CODE =
   'metric_mapping_invalid'`, placed at module top beside the three
   `MALFORMED_MAPPING_*_MESSAGE` consts at lines 19–24, mirroring the
   prompt 90 message placement and the prompt 94 single-literal code
   placement) with a `typeof` single-member union type (e.g.
   `MalformedMetricMappingCode`), and narrow all three code carriers to
   it: the outer `malformedMetricMappingIssues()` returned issue-element
   `code` (line 50), the inner `issues`-array element `code` (line 81),
   and the `invalidMetricIssue()` helper return `code` (lines 198–205).
   The existing ingestion-processor call path (`malformedMetricIssues:
   ParserIssue[]` spread into `validationIssue.createMany` with `code:
   issue.code`) must compile unchanged with no casts, since the literal
   union is assignable to `ParserIssue.code: string`. If any site needs a
   cast — e.g. a push carries a code that is not exactly the single
   literal — stop: the union is wrong and the premise of this prompt is
   broken. Leave the shared `ParserIssue` shape (`code: string`),
   `MalformedMetricMappingMessage` and the narrowed `message` carriers
   (prompt 90 owns), `parseAnalyticsMapping()` filtering,
   `dimensionHash()` / `stableDimensions()`, `validateMapping()` /
   `validateRemappingCompatibility()` / `invalidValue()` / `parsePeriod()`
   / `createSafeErrorSummary()` / `ParsedObservation` carrier (prompts
   86–89 and 91–94 own those producers), the private ingestion-processor
   `validateMapping()` region-column surface (prompt 91 owns), the
   `createMany` shape, and the `details: { index }` / `{ index, field }`
   values untouched. If the narrow rewrite requires touching any of
   those, stop — the premise is broken.
2. Spec expectations: no changes expected (specs already assert the exact
   code literal `metric_mapping_invalid` ×4 with field details, not an
   open string). If any spec asserts a different code literal on this
   surface, keep the identical literal; only move to a const import if the
   implementation exports one. Do NOT add, remove, or reword any asserted
   value. If any spec reaches `malformedMetricMappingIssues()` with a raw
   code string (verified absent — specs call it with a fixed malformed
   mapping object and assert codes/details — but re-verify), re-point it
   at the fixed literal rather than enshrining it; if re-pointing changes
   asserted behavior, stop and explain.
3. Run the temporary negative probe from the matrix above; quote the `tsc`
   rejection; revert the probe before staging.
4. Docs in the same change: `docs/analytics.md` — one clause beside the
   prompt 90 sentence recording that `malformedMetricMappingIssues()`
   accepts only the single fixed code `metric_mapping_invalid`
   (compile-time guard; runtime value unchanged; unbounded code text never
   reaches `ValidationIssue.code` via this producer). No new semantics;
   say so in the summary.
5. Then the §2.1 two-stage review loop (`requesting-code-review` subagent
   with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
   verification) and the `caveman-commit` message.

## Non-goals

- No new code text, message, severity, `columnKey`, or `details`.
- No shared `ParserIssue.code` carrier narrowing (`code: string` stays the
  shared shape; changing it would force every parser, mapping, and
  remapping producer into one change).
- No mapping-grammar change (`parseAnalyticsMapping` filtering is
  byte-for-byte unchanged).
- No `MALFORMED_MAPPING_*_MESSAGE` / message-carrier change (prompt 90
  owns that producer; verify it stays green).
- No `validateMapping()` / `validateRemappingCompatibility()` /
  `invalidValue()` / `parsePeriod()` / `createSafeErrorSummary()` /
  `ParsedObservation`-carrier code change (prompts 86–89 and 91–94 own
  those producers/messages; their 5/1/3-literal code taxonomies are
  separately scoped follow-ups if ever; verify they stay green).
- No ingestion-processor private `validateMapping()` region-column change
  (prompt 91 owns that surface; verify it stays green).
- No parser `ParserIssue` producer change (prompts 74/87 own those
  surfaces; the many-literal parser-issue taxonomy is a separately scoped
  change if ever; verify it stays green).
- No `ParsedObservation.quality` / `ObservationQuality.code` carrier change
  (the `value_missing` / `value_invalid` / `period_invalid` quality-code
  taxonomy is a separately scoped follow-up if ever).
- No `details: { index }` / `{ index, field }` change (existing governed
  evidence detail, not the code-taxonomy gap).
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
producing a mapping-shape issue with an arbitrary code string no longer
compiles. No committed runtime path changes value, order, or shape.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State this
in the completion summary; do not run browser suites for this change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1 generation) —
  including the temporary negative probe rejection, quoted, then reverted.
- Targeted server suite: `mapping.spec.ts` (all malformed-shape code
  assertions) plus `analytics-publication.service.spec.ts`,
  `ingestion-processor.service.spec.ts`, and `analytics.service.spec.ts`,
  then the full `npm run test:server` — do not claim the full suite from a
  targeted run.
- `npm run contracts:check` (expected: passes unchanged; if it fails, stop —
  no contract artifact should move for this change).
- `git diff --check` and `git status --short` review; stage only approved
  files (note: `prompts/92-*.md` and `prompts/93-*.md` are untracked on disk
  and are NOT part of this change — stage only the prompt 95 file, the
  mapping file, the docs file, and any spec file the implementation
  legitimately touches).
- Then the §2.1 two-stage review loop (`requesting-code-review` subagent with
  BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
  verification) and the `caveman-commit` message.
- Record the result in `docs/analytics.md` in the same change.

## SKILLS USED

- `architecture-patterns` — const/union placement beside the module producer
  vs the shared `ParserIssue` carrier (no new module edges; mirrors prompts
  90/94 layering).
- `nestjs-best-practices` — no provider, wiring, module, or service-shape
  change.
- `postgres-best-practices` — no migration, column, or RLS change (durable
  `ValidationIssue.code` column untouched; TypeScript producer narrows only).
- `sql-optimization-patterns` — no query or plan change (loaded per Phase 8
  manifest; no polling/cleanup query moves).
- `javascript-testing-patterns` — existing malformed-shape code assertions
  stay green in expectation; negative type-probe procedure.
- `error-handling-patterns` — fixed single-code mapping-shape taxonomy
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
