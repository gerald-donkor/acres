# 90 — narrow `malformedMetricMappingIssues()` mapping-shape messages to a fixed literal union

## Scope, and why it is next

The committed repository is on `main` at `694f156`
(`refactor(analytics): narrow mapping message union`, i.e. prompt 89). All 12
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
`period_invalid` literal), and 89 (`validateMapping()` narrowed to the 5
fixed mapping-validation literals).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 8 (metrics and deterministic analytics —
the mapping-shape producer surface in
`server/src/analytics/mapping.ts:malformedMetricMappingIssues()`, continuing
the prompts 80–89 writer-narrowing lineage), dependency-safe against prompts
68–89 (no schema, migration, contract, route, permission, timeout/memory-bound,
retention-window, or version-marker change).

The gap is the adjacent open-`string` producer in the same durable flow prompt
89 just narrowed. `malformedMetricMappingIssues()` (mapping.ts lines 36–116)
produces exactly 3 inline literals, all under the single code
`metric_mapping_invalid`:

| site | message today |
| --- | --- |
| mapping.ts:51 (non-array `metrics`) | `'Metric mappings must be provided as an array.'` |
| mapping.ts:61 (non-object entry) | `'Metric mapping entries must be objects.'` |
| mapping.ts:190 (`invalidMetricIssue()` helper) | `'Metric mapping entry is missing a required valid field.'` |

Its output flows verbatim via `ingestion-processor.service.ts:101–103`
(`malformedMetricIssues: ParserIssue[]`) spread into the combined `issues`
array (`ingestion-processor.service.ts:125–131`) through
`validationIssue.createMany` (`ingestion-processor.service.ts:167–185`,
`message: issue.message`) into the durable `ValidationIssue.message` column.
The carrier types are open — both return positions declare `message: string`
(mapping.ts:39 outer return, mapping.ts:70 inner `issues` array), and the
shared `ParserIssue.message: string` (`parser.types.ts:6`) — so any future
producer passing `String(raw)`, `(error as Error).message`, or a formatted
mapping dump would persist raw source/exception text into a column that
survives in PostgreSQL backups and restore drills and is served to every
future reader. That is the exact inversion prompts 86/88/89 eliminated for
the sibling producers; this prompt closes it for the mapping-shape producer
at the type level with zero runtime behavior change.

Today `malformedMetricMappingIssues()` produces exactly these 3 message
literals and no others (verify by reading mapping.ts lines 46–115 — do not
cite them from memory). No spec asserts a message literal: `mapping.spec.ts`
asserts `code` (`metric_mapping_invalid`) and `details` (`{ index, field }`)
only, via `expect.objectContaining({ code: ..., details: ... })`
(`mapping.spec.ts:54–73` — verify exact line numbers from the file, do not
cite them from memory, and do not reword any asserted value).

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 8 definition (§9, metrics/analytics and its
  skill manifest) with §§16–22 confirming 12E–12K committed; §1 rule that
  open numeric limits need real input and must not be invented (why no new
  message value appears here — only narrowing to the existing produced set).
- `docs/analytics.md` — the mapping-contract paragraph (lines 57–60) and the
  prompt 86/88/89 narrowing sentences (lines 67–79: the `invalidValue()`
  3-literal guard, the `parsePeriod()` fixed-literal guard, the
  `validateMapping()` 5-literal guard); the owning record for the doc update.
  Resolve the exact paragraph lines from the file — do not cite line numbers
  from memory.
- `server/src/analytics/mapping.ts` (199 lines; read 9–17 for the
  `valueTypes`/`aggregations` module-top const pattern to mirror placement,
  36–42 for the outer return-type `message: string`, 46–53 for the non-array
  literal, 55–64 for the non-object literal, 67–73 for the inner array
  `message: string`, 186–193 for the `invalidMetricIssue()` helper and its
  literal) — the producer, the single-file matrix, and the two open
  return-position carriers (narrowed by this prompt) versus the shared
  `ParserIssue.message: string` carrier (untouched).
- `server/src/ingestion/ingestion-processor.service.ts` (read 97–103 for the
  `malformedMetricIssues: ParserIssue[]` call, 125–131 for the combined
  `issues` spread, 166–186 for the `validationIssue.createMany` durable write
  with `message: issue.message`) — the verbatim flow proving the
  durable-column gap.
- `server/src/ingestion/parsers/parser.types.ts` (lines 3–10, the shared
  `ParserIssue` shape with `message: string`) — the shared carrier, untouched.
- `server/src/analytics/mapping.spec.ts` (malformed-entries assertions at
  ~54–73 asserting `code` + `details` only) — existing coverage that must
  stay green.
- `server/src/analytics/analytics-publication.service.ts` (lines 497–524,
  the prompt 86/88/89 `INVALID_VALUE_*` / `MAPPING_*_MESSAGE` const + `typeof`
  union pattern to mirror) — the lineage pattern.
- `prompts/89-validate-mapping-message-narrowing.md` (producer-narrowing
  pattern, constant-placement rule, and negative-probe procedure to mirror),
  `prompts/86-*.md` / `prompts/88-*.md` (same), `prompts/80-*.md` through
  `prompts/85-*.md` plus `prompts/87-*.md` (lineage premise).
- Verified closed this session, no change: `validateMapping()` narrowed by
  prompt 89 (5 literals); `invalidValue()` narrowed by prompt 86 (3
  literals); `parsePeriod()` narrowed by prompt 88 (1 literal);
  `validateRemappingCompatibility` single literal and
  `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` untouched;
  `ingestion-processor.service.ts` (`fail()` narrowed by prompt 80;
  `VALIDATION_FAILURE_*` narrowed by prompt 81),
  `ingestion-processor.service.ts` private `validateMapping()`
  (`mapping_region_missing` / `mapping_column_missing` / `region_unmatched`
  region-column surface, separately scoped), parser `ParserIssue` producers
  (prompts 74/87 own those surfaces), `reports.service.ts` (`ExportFailure`
  narrowed by prompt 82), `upload-worker.service.ts` + `scanner.port.ts`
  (prompts 75/76/83), `outbox.service.ts` (prompt 84),
  `jobs/job-runs.service.ts` (prompt 85).

## Measurements and procedures (no eyeballed numbers)

No comp measurement is involved (server-only, type-only change). The
normative matrix is derived from the existing code:

| producer / value | value today | after |
| --- | --- | --- |
| 3 `malformedMetricMappingIssues()` messages | any `string` compiles (the gap); runtime values are the 3 fixed literals | only the 3 fixed literals compile (`as const` constants with a `typeof` union of three, mirroring prompts 86/88/89) |
| outer return-type `message` carrier (mapping.ts:39) and inner array `message` carrier (mapping.ts:70) | `string` | narrowed to the 3-member union |
| shared `ParserIssue.message` / `ValidationIssue.message` column / read shape | `string` | unchanged — shared shape, no contract change |
| `metric_mapping_invalid` code | the single fixed code inline (3 sites) | unchanged |
| spec assertions (code + details) | assert code + details | unchanged |
| `details` (`{ index }` / `{ index, field }`) | present per issue | unchanged — governed evidence detail, out of scope |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: pass a `string`-typed variable (e.g. a `String(raw)` value)
as a `malformedMetricMappingIssues()`-shaped issue message, confirm `tsc`
rejects it, quote the error, then revert the probe. The probe is not
committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SDL shape,
  permission, purge behavior, aggregate math, lineage, mapping grammar
  (`parseAnalyticsMapping` untouched), or schedule change. Malformed-mapping
  validation behaves byte-identically; malformed mappings carry the same
  strings as today, now type-checked.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify with
  `npm run contracts:check` and state that it passes unchanged
  (validation-issue messages are not a wire-contract literal; the read value
  stays a string).

## Implementation steps

1. `server/src/analytics/mapping.ts`: extract the 3 mapping-shape literals
   into `as const` constants (e.g. `MALFORMED_MAPPING_*_MESSAGE`, placed at
   module top beside the `valueTypes`/`aggregations` sets at lines 9–17,
   mirroring the `INVALID_VALUE_*` / `MAPPING_*_MESSAGE` placement in
   `analytics-publication.service.ts:497–524`) with a `typeof` three-member
   union type, and narrow both `message: string` return positions (outer at
   line 39, inner at line 70) to it; route the `invalidMetricIssue()`
   helper (lines 186–193) through the corresponding constant. The existing
   ingestion-processor call path (`malformedMetricIssues: ParserIssue[]`
   spread into `validationIssue.createMany` with `message: issue.message`)
   must compile unchanged with no casts, since the literal union is
   assignable to `ParserIssue.message: string`. If any needs a cast — e.g.
   a message is not exactly one of the 3 literals — stop: the union is
   wrong and the premise of this prompt is broken. Leave the shared
   `ParserIssue` shape (`message: string`), `parseAnalyticsMapping`,
   `dimensionHash`/`stableDimensions`, the `metric_mapping_invalid` code,
   the `details` (`{ index }` / `{ index, field }`) values, and the
   `createMany` shape untouched. If the narrow rewrite requires touching
   any of those, stop — the premise is broken.
2. Spec expectations: no changes expected (specs assert `code` + `details`,
   not message literals). If any spec asserts a message literal, keep the
   identical literal; only move to a const import if the implementation
   exports one. Do NOT add, remove, or reword any asserted value. If any
   spec reaches `malformedMetricMappingIssues()` with a raw string
   (verified absent — specs call it with fixed malformed mappings and assert
   code/details — but re-verify), re-point it at the fixed set rather than
   enshrining it; if re-pointing changes asserted behavior, stop and
   explain.
3. Run the temporary negative probe from the matrix above; quote the `tsc`
   rejection; revert the probe before staging.
4. Docs in the same change: `docs/analytics.md` — one clause beside the
   prompt 86/88/89 narrowing sentences recording that
   `malformedMetricMappingIssues()` accepts only the 3 fixed literals
   (compile-time guard; runtime values unchanged; raw source/exception text
   never reaches `ValidationIssue.message` via this producer). No new
   semantics; say so in the summary.
5. Then the §2.1 two-stage review loop (`requesting-code-review` subagent
   with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
   verification) and the `caveman-commit` message.

## Non-goals

- No new message text, code, severity, or `details`.
- No shared `ParserIssue.message` carrier narrowing (`message: string` stays
  the shared shape; changing it would force every parser, mapping, and
  remapping producer into one change).
- No `parseAnalyticsMapping` change (the mapping grammar silently drops
  malformed entries; the issue reporter is the only surface here).
- No `validateMapping()` / `validateRemappingCompatibility` /
  `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` change (prompts 72/89 own
  those surfaces; verify they stay green).
- No ingestion-processor private `validateMapping()` region-column change
  (`mapping_region_missing` / `mapping_column_missing` / `region_unmatched`
  — broader region-mapping surface with a DB-backed `matchRegion`, separately
  scoped if ever).
- No `details` change (existing governed evidence detail `{ index }` /
  `{ index, field }`, not the message-taxonomy gap).
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
producing a malformed-mapping issue with an arbitrary string no longer
compiles. No committed runtime path changes value, order, or shape.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State this
in the completion summary; do not run browser suites for this change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1 generation) —
  including the temporary negative probe rejection, quoted, then reverted.
- Targeted server suite: `mapping.spec.ts` (all malformed-entries
  assertions) plus `analytics-publication.service.spec.ts` and
  `analytics.service.spec.ts`, then the full `npm run test:server` — do not
  claim the full suite from a targeted run.
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
  86/88/89 layering).
- `nestjs-best-practices` — no provider, wiring, module, or service-shape
  change.
- `security-best-practices` — durable-column sanitization; raw source and
  exception text never reaches persisted validation-issue rows via this
  producer.
- `error-handling-patterns` — fixed malformed-mapping taxonomy preserved;
  compile-time guard so verbatim text can never reach
  `ValidationIssue.message` (fail-fast at the type level).
- `javascript-testing-patterns` — existing mapping specs stay green in
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
