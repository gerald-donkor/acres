# 89 — narrow `validateMapping()` mapping-validation messages to a fixed literal union

## Scope, and why it is next

The committed repository is on `main` at `a4a2fa6`
(`refactor(analytics): narrow period message union`, i.e. prompt 88). All 12
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
parser-executor literals), and 88 (`parsePeriod()` narrowed to the fixed
`period_invalid` literal).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 8 (metrics and deterministic analytics —
the mapping-validation producer surface in
`AnalyticsPublicationService.validateMapping()`, continuing the prompts 80–88
writer-narrowing lineage), dependency-safe against prompts 68–88 (no schema,
migration, contract, route, permission, timeout/memory-bound, retention-window,
or version-marker change).

The gap is the last open-`string` producer in
`server/src/analytics/analytics-publication.service.ts` that still compiles
with an arbitrary string. `validateMapping()` (lines 47–119) pushes 5 inline
literals into its returned issues array:

| code | message today |
| --- | --- |
| `metric_key_duplicate` | `'Metric keys must be unique within one mapping.'` |
| `metric_column_missing` | `'Mapped metric column is not present in the source.'` |
| `metric_key_invalid` | `'Metric keys must be lower-case snake identifiers.'` |
| `metric_unit_missing` | `'Mapped metrics must define an explicit unit.'` |
| `metric_aggregation_incompatible` | `'Text and boolean metrics only support count or latest.'` |

Its output flows verbatim via `ingestion-processor.service.ts:110–131`
(`analyticsIssues` spread into the combined `issues` array) through
`validationIssue.createMany` (`ingestion-processor.service.ts:167–185`,
`message: issue.message`) into the durable `ValidationIssue.message` column.
The carrier type is open — `validateMapping()`'s return element declares
`message: string` (`analytics-publication.service.ts:60`), and the shared
`ParserIssue.message: string` (`parser.types.ts:6`) — so any future producer
passing `String(raw)`, `(error as Error).message`, or a formatted mapping dump
would persist raw source/exception text into a column that survives in
PostgreSQL backups and restore drills and is served to every future reader.
That is the exact inversion prompts 86/88 eliminated for the
`invalidValue()`/`parsePeriod()` sibling producers in the same file; this
prompt closes it for the `validateMapping()` producer at the type level with
zero runtime behavior change.

Today `validateMapping()` produces exactly these 5 message literals and no
others (verify by reading lines 66–117 — do not cite them from memory). No
spec asserts a message literal: the mapping-validation spec asserts codes
only, via `expect(issues.map((issue) => issue.code)).toEqual(
expect.arrayContaining([...]))`
(`analytics-publication.service.spec.ts:38–46` — verify exact line numbers
from the file, do not cite them from memory, and do not reword any asserted
value).

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 8 definition (§9, metrics/analytics and its
  skill manifest) with §§16–22 confirming 12E–12K committed; §1 rule that
  open numeric limits need real input and must not be invented (why no new
  message value appears here — only narrowing to the existing produced set).
- `docs/analytics.md` — the mapping-contract paragraph and the prompt 86/88
  narrowing sentences (the `invalidValue()` 3-literal guard and the
  `parsePeriod()` fixed-literal guard); the owning record for the doc update.
  Resolve the exact paragraph lines from the file — do not cite line numbers
  from memory.
- `server/src/analytics/analytics-publication.service.ts` (673 lines;
  read 42–56 for the `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` const
  pattern to mirror, 47–119 for `validateMapping` and the 5-literal matrix,
  121–151 for `validateRemappingCompatibility` (untouched), 442–506 for the
  prompt 87/88 `PERIOD_INVALID_MESSAGE` / `INVALID_VALUE_*` const/union
  pattern to mirror) — the producer, the single-file matrix, and the open
  return-element `message: string` (`:60`, narrowed by this prompt) versus the
  shared `ParserIssue.message: string` carrier (untouched).
- `server/src/ingestion/ingestion-processor.service.ts` (read 97–131 for the
  `analyticsIssues` spread, 166–186 for the `validationIssue.createMany`
  durable write with `message: issue.message`) — the verbatim flow proving
  the durable-column gap.
- `server/src/ingestion/parsers/parser.types.ts` (lines 3–10, the shared
  `ParserIssue` shape with `message: string`) — the shared carrier, untouched.
- `server/src/analytics/analytics-publication.service.spec.ts`
  (mapping-validation assertions at ~38–46 asserting `code` only) — existing
  coverage that must stay green.
- `prompts/88-period-invalid-quality-message-narrowing.md` (producer-narrowing
  pattern, constant-placement rule, and negative-probe procedure to mirror),
  `prompts/86-*.md` (same), `prompts/80-*.md` through `prompts/85-*.md` plus
  `prompts/87-*.md` (lineage premise).
- Verified closed this session, no change: `invalidValue()` narrowed by
  prompt 86 (3 literals); `parsePeriod()` narrowed by prompt 88 (1 literal);
  `validateRemappingCompatibility` single literal (`Metric key is already
  defined with a different type, unit, or aggregation.`) and
  `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` untouched;
  `ingestion-processor.service.ts` (`fail()` narrowed by prompt 80;
  `VALIDATION_FAILURE_*` narrowed by prompt 81),
  `ingestion-processor.service.ts` private `validateMapping()`
  (`mapping_region_missing` / `mapping_column_missing` region-column surface,
  separately scoped), `malformedMetricMappingIssues`, parser
  `ParserIssue` producers (prompts 74/87 own those surfaces),
  `reports.service.ts` (`ExportFailure` narrowed by prompt 82),
  `upload-worker.service.ts` + `scanner.port.ts` (prompts 75/76/83),
  `outbox.service.ts` (prompt 84), `jobs/job-runs.service.ts` (prompt 85).

## Measurements and procedures (no eyeballed numbers)

No comp measurement is involved (server-only, type-only change). The
normative matrix is derived from the existing code:

| producer / value | value today | after |
| --- | --- | --- |
| 5 `validateMapping()` messages | any `string` compiles (the gap); runtime values are the 5 fixed literals | only the 5 fixed literals compile (`as const` constants with a `typeof` union of five, mirroring prompts 86/88) |
| `validateMapping()` return-element `message` carrier | `string` | narrowed to the 5-member union |
| shared `ParserIssue.message` / `ValidationIssue.message` column / read shape | `string` | unchanged — shared shape, no contract change |
| 5 `code` values | the 5 fixed codes inline | unchanged |
| spec assertions (5 codes) | assert codes | unchanged |
| `details` / `columnKey` | present per issue | unchanged — governed evidence detail, out of scope |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: pass a `string`-typed variable (e.g. a `String(raw)` value)
as a `validateMapping()` issue message, confirm `tsc` rejects it, quote the
error, then revert the probe. The probe is not committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SDL shape,
  permission, purge behavior, aggregate math, lineage, mapping grammar, or
  schedule change. Mapping validation behaves byte-identically; invalid
  mappings carry the same strings as today, now type-checked.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify with
  `npm run contracts:check` and state that it passes unchanged
  (validation-issue messages are not a wire-contract literal; the read value
  stays a string).

## Implementation steps

1. `server/src/analytics/analytics-publication.service.ts`: extract the 5
   mapping-validation literals into `as const` constants (e.g.
   `MAPPING_*_MESSAGE`, mirroring the `INVALID_VALUE_*` placement at lines
   497–506) with a `typeof` five-member union type, and narrow
   `validateMapping()`'s returned issue-element `message` to it. The existing
   ingestion-processor call path (`analyticsIssues: ParserIssue[]` spread
   into `validationIssue.createMany` with `message: issue.message`) must
   compile unchanged with no casts, since the literal union is assignable to
   `ParserIssue.message: string`. If any needs a cast — e.g. a message is not
   exactly one of the 5 literals — stop: the union is wrong and the premise
   of this prompt is broken. Leave the shared `ParserIssue` shape
   (`message: string`), `validateRemappingCompatibility` (single literal,
   separately scoped), `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE`,
   `parsePeriod()`/`parseValue()`/`invalidValue()` (prompts 86/88 own),
   the ingestion-processor private `validateMapping()` region-column surface,
   `malformedMetricMappingIssues`, the `createMany` shape, and the
   `details`/`columnKey` values untouched. If the narrow rewrite requires
   touching any of those, stop — the premise is broken.
2. Spec expectations: no changes expected (specs assert `code`, not message
   literals). If any spec asserts a message literal, keep the identical
   literal; only move to a const import if the implementation exports one. Do
   NOT add, remove, or reword any asserted value. If any spec reaches
   `validateMapping()` with a raw string (verified absent — specs call
   `service.validateMapping()` with fixed mappings and assert codes — but
   re-verify), re-point it at the fixed set rather than enshrining it; if
   re-pointing changes asserted behavior, stop and explain.
3. Run the temporary negative probe from the matrix above; quote the `tsc`
   rejection; revert the probe before staging.
4. Docs in the same change: `docs/analytics.md` — one clause beside the
   prompt 86/88 narrowing sentences recording that `validateMapping()`
   accepts only the 5 fixed literals (compile-time guard; runtime values
   unchanged; raw source/exception text never reaches
   `ValidationIssue.message` via this producer). No new semantics; say so in
   the summary.
5. Then the §2.1 two-stage review loop (`requesting-code-review` subagent
   with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
   verification) and the `caveman-commit` message.

## Non-goals

- No new message text, code, severity, `columnKey`, or `details`.
- No shared `ParserIssue.message` carrier narrowing (`message: string` stays
  the shared shape; changing it would force every parser, mapping, and
  remapping producer into one change).
- No `validateRemappingCompatibility` / `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE`
  change (prompt 72 owns the remap surface; the mid-transaction throw stays
  the race guard).
- No ingestion-processor private `validateMapping()` region-column change
  (`mapping_region_missing` / `mapping_column_missing` — broader
  region-mapping surface, separately scoped if ever).
- No `malformedMetricMappingIssues` / parser `ParserIssue` producer change
  (prompts 74/87 own those surfaces; verify they stay green).
- No `details` / `columnKey` change (existing governed evidence detail, not
  the message-taxonomy gap).
- No `invalidValue()` / `parsePeriod()` change (prompts 86/88 own those
  producers; verify they stay green).
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
producing a mapping-validation issue with an arbitrary string no longer
compiles. No committed runtime path changes value, order, or shape.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State this
in the completion summary; do not run browser suites for this change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1 generation) —
  including the temporary negative probe rejection, quoted, then reverted.
- Targeted server suite: `analytics-publication.service.spec.ts` (all
  mapping-validation assertions) plus `analytics.service.spec.ts` and
  `mapping.spec.ts`, then the full `npm run test:server` — do not claim the
  full suite from a targeted run.
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
  86/88 layering).
- `nestjs-best-practices` — no provider, wiring, module, or service-shape
  change.
- `security-best-practices` — durable-column sanitization; raw source and
  exception text never reaches persisted validation-issue rows via this
  producer.
- `error-handling-patterns` — fixed mapping-validation taxonomy preserved;
  compile-time guard so verbatim text can never reach
  `ValidationIssue.message` (fail-fast at the type level).
- `javascript-testing-patterns` — existing validation specs stay green in
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
