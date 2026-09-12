# 86 — narrow `invalidValue()` message to the fixed observation-quality message union

## Scope, and why it is next

The committed repository is on `main` at `f1b0e4a`
(`refactor(jobs): narrow job-run message union`, i.e. prompt 85). All 12
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
retry/dead-letter writes narrowed to the fixed dispatch-exhausted union), and
85 (`JobRunsService.finish()` narrowed to the fixed job-run message union).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 8 (metrics and deterministic analytics —
the observation-quality durability surface, continuing the prompts 73–85
sanitization/narrowing lineage), dependency-safe against prompts 68–85 (no
schema, migration, contract, route, permission, or version-marker change).

The gap is the last open-`string` producer into a durable message column.
`invalidValue()` in `server/src/analytics/analytics-publication.service.ts`,
lines 519–523, already narrows `state` but leaves `message` open:

```ts
function invalidValue(
  metric: MetricMapping,
  state: 'missing' | 'invalid',
  message: string,
): Pick<ParsedObservation, 'value' | 'quality'> {
```

Its output persists verbatim via `observationQuality.createMany`
(`analytics-publication.service.ts:207–218`, `message: quality.message`)
into the durable `ObservationQuality.message` column, and is served verbatim
by `toObservation` (`server/src/analytics/analytics.service.ts:130–135`).
Any future caller passing `String(raw)` or `describe(error)` would persist
raw file content or parser/exception internals into a column that survives in
PostgreSQL backups and restore drills and is served to every future reader.
That is the exact inversion prompts 80–85 eliminated on the
ingestion/export/scan/outbox/job-run surfaces; this prompt closes it at the
type level with zero runtime behavior change.

Today's 3 `invalidValue()` call sites (the complete set — the function is
module-private and a repo-wide search for `invalidValue` returns only its
definition plus these):

| call site | state | message today |
| --- | --- | --- |
| `parseValue` blank (`analytics-publication.service.ts:486`) | `'missing'` | `'Metric value is blank.'` |
| `parseValue` numeric unparsable (`analytics-publication.service.ts:491–494`) | `'invalid'` | `'Numeric metric value could not be parsed.'` |
| `parseValue` boolean unparsable (`analytics-publication.service.ts:510–513`) | `'invalid'` | `'Boolean metric value could not be parsed.'` |

No spec calls `invalidValue()` directly: specs publish through `service.publish()`
and assert quality *codes* (`value_missing` at
`analytics-publication.service.spec.ts:~279`, `value_invalid` at `~323`).
Message expectations, if any, assert the same fixed literals — verify, do not
reword.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 8 definition (§9, deterministic analytics and
  its skill manifest) with §§16–22 confirming 12E–12K committed; §1 rule that
  open numeric limits need real input and must not be invented (why no new
  message value appears here — only narrowing to the existing produced set).
- `docs/analytics.md` — Residual Gaps and the publication/quality record; the
  owning record for the doc update. Resolve the exact paragraph lines from the
  file — do not cite line numbers from memory.
- `server/src/analytics/analytics-publication.service.ts` (654 lines; read
  1–120, 190–269, 440–629) — the helper (lines 519–540), the 3 call sites
  (486, 491–494, 510–513), the durable write (207–218), `parsePeriod`
  (442–479, already a fixed literal — untouched), `validateMapping` (47–119,
  fixed literals — untouched), and the `ParsedObservation` quality element
  type (27–39).
- `server/src/analytics/analytics.service.ts` (`toObservation` 94–138;
  qualities mapped verbatim at 130–135 — proves no contract-shape change; the
  read value stays a string).
- `server/src/analytics/analytics-publication.service.spec.ts` (code
  assertions at ~279/~323) — existing coverage that must stay green.
- `prompts/85-job-run-message-write-narrowing.md` (writer-narrowing pattern,
  constant-placement rule, and negative-probe procedure to mirror),
  `prompts/80-*.md` through `prompts/84-*.md` plus `prompts/72-*.md` through
  `prompts/77-*.md` (lineage premise).
- Verified closed this session, no change: `ingestion-processor.service.ts`
  (`fail()` narrowed by prompt 80), `reports.service.ts` (`ExportFailure`
  narrowed by prompt 82), `upload-worker.service.ts` + `scanner.port.ts`
  (`RejectedScanCode`/`ScanErrorCode` narrowed by prompts 76/83),
  `outbox.service.ts` (`OutboxFailureMessage` narrowed by prompt 84),
  `jobs/job-runs.service.ts` (`JobRunMessage` narrowed by prompt 85),
  `postgis-region-geometry.repository.ts` `isForeignKeyError` (63–80,
  read-only classification of a caught error, fixed `GeometryError` thrown —
  nothing persisted), `geoboundaries-import.service.ts` /
  `geoboundaries-provider.ts` (thrown-only error subclasses, nothing
  persisted).

## Measurements and procedures (no eyeballed numbers)

No comp measurement is involved (server-only, type-only change). The
normative matrix is derived from the existing code:

| producer / value | value today | after |
| --- | --- | --- |
| 3 `invalidValue` messages | any `string` compiles (the gap) | only the 3 fixed literals compile (`typeof` constants or an inline literal union) |
| `state` param | `'missing' \| 'invalid'` | unchanged |
| `ObservationQuality.message` column / REST+GraphQL `quality.message` | `string` | unchanged — read shape, no contract change |
| spec code assertions (`value_missing`, `value_invalid`) | assert codes | unchanged |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: pass a `string`-typed variable (e.g. `String(raw)` output) as
`invalidValue()`'s `message`, confirm `tsc` rejects it, quote the error, then
revert the probe. The probe is not committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SDL shape,
  GraphQL type, permission, purge behavior, aggregate, `qualitySummary`, or
  schedule change. Ingestion publication behaves byte-identically; all 3
  quality messages are the same strings as today, now type-checked.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify with
  `npm run contracts:check` and state that it passes unchanged
  (`quality.message` stays a string on the wire).

## Implementation steps

1. `server/src/analytics/analytics-publication.service.ts`: narrow
   `invalidValue()`'s `message` parameter from `string` to the union of the 3
   fixed literals from the matrix above (exported `as const` constants with
   `typeof` union preferred, mirroring prompts 84/85; module-private unless a
   spec needs the import — the specs assert codes, so module-private is the
   expected outcome). All 3 call sites must compile unchanged with no casts.
   If any needs a cast — e.g. a message is not exactly one of the 3 literals
   — stop: the union is wrong and the premise of this prompt is broken. Leave
   the `ParsedObservation` quality element type (`message: string`, line 37)
   as is — a literal return value satisfies it, so no widening-scope change
   is needed. Do NOT touch `parsePeriod` quality, `validateMapping` issues,
   `details: { value: String(...) }` (curated evidence detail, by design),
   `textValue: String(raw).trim()` (the actual data value), states, codes,
   severities, the `createMany` shape, aggregates, or the controller. If the
   narrow rewrite requires touching any of those, stop — the premise is
   broken.
2. Spec expectations: no changes expected (codes only). If any spec asserts a
   message literal, keep the identical literal; only move to a const import
   if the implementation exports one. Do NOT add, remove, or reword any
   asserted value. If any spec reaches `invalidValue()` with a raw string
   (the pre-prompt-80-style case — verified absent since specs publish
   through `service.publish()`, but re-verify), re-point it at the fixed set
   rather than enshrining it; if re-pointing changes asserted behavior, stop
   and explain.
3. Run the temporary negative probe from the matrix above; quote the `tsc`
   rejection; revert the probe before staging.
4. Docs in the same change: `docs/analytics.md` — one clause recording that
   `invalidValue()` accepts only the 3 fixed literals (compile-time guard;
   runtime values unchanged; raw cell/exception text never reaches
   `ObservationQuality.message` via this helper). No new semantics; say so in
   the summary.
5. Then the §2.1 two-stage review loop (`requesting-code-review` subagent
   with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
   verification) and the `caveman-commit` message.

## Non-goals

- No new message text, state, code, or severity.
- No `validateMapping` / `ParserIssue` taxonomy change (broader producer
  surface, separately scoped if ever).
- No `details`, `textValue`, or `periodLabel` change (curated evidence and
  actual data values, by design).
- No `parsePeriod` change (already a fixed inline literal).
- No schema or migration change: the `ObservationQuality` table is untouched;
  only the TypeScript parameter narrows.
- No permission change.
- No aggregate, `qualitySummary`, or schedule change.
- No `JobRun` self-retention purge (prompts 79/84/85 name it: five ticks
  write ≥ five rows an hour with no reclamation, but the window is an
  explicit open operator decision per `docs/operations.md`
  `data_retention_policy`; build-plan §1 forbids inventing it).
- No live Docker drills (restart/orphan/Garage/Valkey/ClamAV remain future
  operational work per prompts 72–84).
- No ingestion/export/scan/outbox/job-run failure-code change (prompts 80–85
  own those surfaces; verify they stay green).

## Reference deltas

None visual (server-only). The one deliberate property delta, stated so it
is not mistaken for a regression: code that previously compiled when passing
an arbitrary string as the observation-quality message no longer compiles. No
committed runtime path changes value, order, or shape.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State this
in the completion summary; do not run browser suites for this change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1 generation) —
  including the temporary negative probe rejection, quoted, then reverted.
- Targeted server suite: `analytics-publication.service.spec.ts` (all quality
  assertions) plus `analytics.service.spec.ts`, then the full
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

- `architecture-patterns` — const/union placement beside the module-private
  helper vs the call sites (no new module edges; mirrors prompts 84/85
  layering).
- `nestjs-best-practices` — no provider, wiring, module, or service-shape
  change.
- `security-best-practices` — durable-column sanitization; raw cell and
  exception text never reaches persisted quality rows via this helper.
- `error-handling-patterns` — fixed quality-message taxonomy preserved;
  compile-time guard so verbatim text can never reach
  `ObservationQuality.message` (fail-fast at the type level).
- `javascript-testing-patterns` — existing publication specs stay green in
  expectation; negative type-probe procedure.
- `requesting-code-review` — Stage 1 reviewer subagent dispatch after
  self-verification (§2.1).
- `receiving-code-review` — Stage 2 technical evaluation of review feedback
  before any fix.
- `caveman-commit` — the commit message (ALWAYS rule, §3/§7).
- Loaded and deliberately not used: `postgres-best-practices` /
  `sql-optimization-patterns` (no migration, column, or query-plan change),
  `kpi-dashboard-design` / `data-storytelling` (no metric semantics or
  display change), `api-design-principles` / `openapi-spec-generation` (no
  contract change — verified by `contracts:check`), `e2e-testing-patterns` /
  `playwright` (server-only change, no browser surface),
  `security-threat-model` (no trust boundary change).
