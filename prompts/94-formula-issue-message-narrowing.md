# 94 — narrow `formulaIssue()` formula-as-data message to a fixed literal

## Scope, and why it is next

The committed repository is on `main` at `9df2c08`
(`refactor(analytics): narrow remap message union`, i.e. prompt 93). All 12
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
region-mapping literals), 92 (worker rejected-scan triple narrowed to
the single fixed `REJECTED_SCAN_MESSAGE` literal), and 93
(`validateRemappingCompatibility()` narrowed to the single fixed
remapping-compatibility literal).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 7 (geography and ingestion — the
formula-as-data producer surface in `formulaIssue()`, continuing the
prompts 80–93 writer-narrowing lineage), dependency-safe against prompts
68–93 (no schema, migration, contract, route, permission, timeout/memory-bound,
retention-window, or version-marker change).

The gap is the last single-literal shared helper in the durable
validation-issue flow that still compiles with an arbitrary string.
`formulaIssue()` (`server/src/ingestion/parsers/parser-utils.ts` lines 31–42)
returns exactly 1 inline literal under the single code `formula_as_data`:

| site | code | message today |
| --- | --- | --- |
| `parser-utils.ts:31–42` | `formula_as_data` | `'Formula-looking cell was treated as text.'` (`:38` carries the literal) |

Its output flows verbatim via both call sites — `csv-source.parser.ts:80`
(`issues.push(formulaIssue(rowIndex + 2, key))`) and
`xlsx-source.parser.ts:101` (`issues.push(formulaIssue(rowIndex + 2,
columnKey))`) — into the `ParserIssue[]` summary issues, spread into the
combined `issues` array (`ingestion-processor.service.ts:140–146`) through
`validationIssue.createMany` (`:182–200`, `message: issue.message` at `:188`)
into the durable `ValidationIssue.message` column. The carrier type is open —
`formulaIssue()` returns `ParserIssue` (`:31–34`), and the shared
`ParserIssue.message: string` (`parser.types.ts:6`) — so any future edit
passing `String(raw)`, `(error as Error).message`, or a formatted cell dump
as the message would persist raw source/exception text into a column that
survives in PostgreSQL backups and restore drills and is served to every
future reader. That is the exact inversion prompts 86/87/88 eliminated for
the three sibling helper producers (`invalidValue()`,
`createSafeErrorSummary()`, `parsePeriod()`); this prompt closes it for the
formula-as-data helper at the type level with zero runtime behavior change.

Today `formulaIssue()` produces exactly this 1 message literal and no others
(verify by reading lines 31–42 — do not cite them from memory). Specs assert
the code only for this surface: `source-parsers.spec.ts:29–33`
(`objectContaining({ code: 'formula_as_data' })` for CSV) and `:91–95`
(same for XLSX) — verify exact line numbers from the file, do not cite them
from memory. The `child-process-parser.executor.spec.ts:254–255`
code-plus-message assertion is a validator-passthrough case for an
untrusted child summary, not this producer — untouched. Do NOT add, remove,
or reword any asserted value.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 7 definition (§8, geography/ingestion and its
  skill manifest) with §§16–22 confirming 12E–12K committed; §1 rule that
  open numeric limits need real input and must not be invented (why no new
  message value appears here — only narrowing to the existing produced
  literal, and why parser row/column/cell/feature limits are untouched).
- `docs/ingestion.md` — the parser-behavior paragraphs (lines ~145–155: the
  formula-as-text rule and first-sheet determinism; line ~197: the prompt 87
  `createSafeErrorSummary()` 2-literal guard; lines ~243–252: the prompt 80
  `fail()` union, the prompt 81 `validation_failed` guard, and the prompt 91
  region-mapping 4-literal guard); the owning record for the doc update.
  Resolve the exact paragraph lines from the file — do not cite line numbers
  from memory.
- `server/src/ingestion/parsers/parser-utils.ts` (46 lines; read 31–42 for
  `formulaIssue()` and the single-literal matrix, 1 for the `ParserIssue`
  import, 3 for `PARSER_MAX_BUFFER_BYTES` untouched, 44–46 for
  `isFormulaLike()` untouched) — the producer, narrowed by this prompt.
- `server/src/ingestion/parsers/parser.types.ts` (lines 3–10, the shared
  `ParserIssue` shape with `message: string`) — the shared carrier, untouched.
- `server/src/ingestion/parsers/csv-source.parser.ts` (read ~63–84 for the
  `formulaIssue` call site at `:80` beside the cell-limit inline literal
  untouched, plus `safeCell`/`scalarText`/`normalizeKey` untouched) and
  `server/src/ingestion/parsers/xlsx-source.parser.ts` (read ~85–102 for the
  `formulaIssue` call site at `:101` beside the cell-limit inline literal
  untouched, plus `inspectXlsxContainer`/`readSheet` untouched) — the two
  call sites, compiling unchanged since the literal union is assignable to
  `ParserIssue.message: string`.
- `server/src/ingestion/ingestion-processor.service.ts` (read 140–146 for
  the combined `issues` spread including summary issues, 182–200 for the
  `validationIssue.createMany` durable write with `message: issue.message`
  at `:188`) — the verbatim flow proving the durable-column gap.
- `server/src/ingestion/parsers/source-parsers.spec.ts` (formula assertions
  at ~29–33 for CSV and ~91–95 for XLSX asserting `code` only) — existing
  coverage that must stay green.
- `server/src/ingestion/parsers/child-process-parser.executor.ts` (lines
  29–35, the prompt 87 `PARSER_EXECUTION_FAILED_MESSAGE` /
  `PARSER_EXECUTION_TIMED_OUT_MESSAGE` const + `typeof` union pattern to
  mirror placement) — the sibling-helper narrowing pattern in the same
  directory.
- `prompts/93-remapping-compatibility-message-narrowing.md`
  (producer-narrowing pattern, constant-placement rule, and negative-probe
  procedure to mirror), `prompts/86-*.md` / `prompts/88-*.md` (same-shape
  single/multi-literal helper lineage: `invalidValue()` / `parsePeriod()`),
  `prompts/87-*.md` (same-directory executor lineage premise).
- Verified closed this session, no change: `createSafeErrorSummary()`
  narrowed by prompt 87 (2 literals); `invalidValue()` narrowed by prompt 86
  (3 literals); `parsePeriod()` narrowed by prompt 88 (1 literal);
  `validateMapping()` narrowed by prompt 89 (5 literals);
  `malformedMetricMappingIssues()` narrowed by prompt 90 (3 literals);
  ingestion private `validateMapping()` narrowed by prompt 91 (4 literals);
  `validateRemappingCompatibility()` narrowed by prompt 93 (1 literal);
  `fail()` / `VALIDATION_FAILURE_*` narrowed by prompts 80/81;
  `PUBLICATION_UNEXPECTED_FAILURE_MESSAGE` untouched; `reports.service.ts`
  (`ExportFailure` narrowed by prompt 82), `upload-worker.service.ts` +
  `scanner.port.ts` (prompts 75/76/83/92), `outbox.service.ts` (prompt 84),
  `jobs/job-runs.service.ts` (prompt 85).

## Measurements and procedures (no eyeballed numbers)

No comp measurement is involved (server-only, type-only change). The
normative matrix is derived from the existing code:

| producer / value | value today | after |
| --- | --- | --- |
| 1 formula-as-data message | any `string` compiles (the gap); runtime value is the single fixed literal | only the single fixed literal compiles (`as const` constant with a `typeof` single-member type, mirroring prompt 87 placement in the same directory) |
| `formulaIssue()` return-element `message` carrier (`:31–34`) | `ParserIssue` with open `message: string` | narrowed return-element `message` to the single-member union (still assignable to `ParserIssue` at both call sites and through the spread/`createMany` path) |
| shared `ParserIssue.message` / `ValidationIssue.message` column / read shape | `string` | unchanged — shared shape, no contract change |
| `formula_as_data` code | the single fixed code inline | unchanged |
| spec assertions (code-only `objectContaining`) | assert code | unchanged |
| `rowNumber` / `columnKey` passthrough | present per issue | unchanged — governed evidence detail, out of scope |
| `isFormulaLike()` detection rule / `safeCell` / `scalarText` / `normalizeKey` | present | unchanged — parser logic, not the message-taxonomy gap |
| CSV/XLSX row/column/cell limit literals, GeoJSON literals, container-inspector literals | inline `message: string` producers | unchanged — each is a separately scoped future narrowing step, not this prompt |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: pass a `string`-typed variable (e.g. a `String(raw)` value)
as a `formulaIssue()`-shaped issue message, confirm `tsc` rejects it, quote
the error, then revert the probe. The probe is not committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SDL shape,
  permission, purge behavior, parser limit, sheet selection, delimiter/header,
  formula-detection, truncation, or schedule change. Formula-as-data
  validation behaves byte-identically; the same warning carries the same
  string as today, now type-checked at the single producer.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify with
  `npm run contracts:check` and state that it passes unchanged
  (validation-issue messages are not a wire-contract literal; the read value
  stays a string).

## Implementation steps

1. `server/src/ingestion/parsers/parser-utils.ts`: extract the single
   formula-as-data literal into an `as const` constant (e.g.
   `FORMULA_AS_DATA_MESSAGE`, placed at module top mirroring the prompt 87
   `PARSER_EXECUTION_*_MESSAGE` placement at lines 29–31 of
   `child-process-parser.executor.ts`) with a `typeof` single-member union
   type (e.g. `type FormulaAsDataMessage = typeof FORMULA_AS_DATA_MESSAGE`),
   and narrow `formulaIssue()`'s returned issue-element `message` to it.
   Both existing call sites (`csv-source.parser.ts:80`,
   `xlsx-source.parser.ts:101`) and the downstream spread into
   `validationIssue.createMany` with `message: issue.message` must compile
   unchanged with no casts, since the literal union is assignable to
   `ParserIssue.message: string`. If any needs a cast — e.g. the message is
   not exactly this literal — stop: the union is wrong and the premise of
   this prompt is broken. Leave the shared `ParserIssue` shape
   (`message: string`), the `formula_as_data` code, `isFormulaLike()`,
   `safeCell()`, `scalarText()`, `normalizeKey()`,
   `PARSER_MAX_BUFFER_BYTES`, all row/column/cell limit literals, the
   GeoJSON and container-inspector producers, `createSafeErrorSummary()`
   (prompt 87), `validateMapping()` / `malformedMetricMappingIssues()` /
   region-mapping / remapping producers (prompts 89/90/91/93), `fail()` /
   `VALIDATION_FAILURE_*` (prompts 80/81), and the `rowNumber` /
   `columnKey` values untouched. If the narrow rewrite requires touching
   any of those, stop — the premise is broken.
2. Spec expectations: no changes expected (specs assert `code`, not message
   literals). If any spec asserts a message literal, keep the identical
   literal; only move to a const import if the implementation exports one.
   Do NOT add, remove, or reword any asserted value. If any spec reaches
   `formulaIssue()` with a raw string (verified absent — specs feed CSV/XLSX
   fixtures and assert code — but re-verify), re-point it at the fixed
   literal rather than enshrining it; if re-pointing changes asserted
   behavior, stop and explain.
3. Run the temporary negative probe from the matrix above; quote the `tsc`
   rejection; revert the probe before staging.
4. Docs in the same change: `docs/ingestion.md` — one clause beside the
   prompt 86/87/88/89/90/91/93 narrowing sentences recording that
   `formulaIssue()` accepts only the single fixed literal (compile-time
   guard; runtime value unchanged; raw source/exception text never reaches
   `ValidationIssue.message` via this producer; `code` / `rowNumber` /
   `columnKey` unchanged). No new semantics; say so in the summary.
5. Then the §2.1 two-stage review loop (`requesting-code-review` subagent
   with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
   verification) and the `caveman-commit` message.

## Non-goals

- No new message text, code, severity, `rowNumber`, `columnKey`, or `details`.
- No shared `ParserIssue.message` carrier narrowing (`message: string` stays
  the shared shape; changing it would force every parser, mapping, remapping,
  and region-mapping producer into one change).
- No formula-detection change (`isFormulaLike()` regex, `safeCell()`,
  `scalarText()`, `normalizeKey()` are the parser logic, not the
  message-taxonomy gap).
- No CSV/XLSX row/column/cell limit-message change (4 CSV + 6 XLSX inline
  literals remain separately scoped future narrowing steps; verify they stay
  green).
- No GeoJSON or container-inspector change (7 GeoJSON + 4 container
  literals remain separately scoped future steps; verify they stay green).
- No limit/threshold change (row/column/cell/feature/coordinate/entry caps
  and `PARSER_MAX_BUFFER_BYTES` are operator/product numerics; build-plan §1
  forbids inventing them).
- No `createSafeErrorSummary()` change (prompt 87 owns that surface; verify
  it stays green).
- No `validateMapping()` / `malformedMetricMappingIssues()` /
  `validateRemappingCompatibility()` / region-mapping change (prompts
  89/90/91/93 own those producers; verify they stay green).
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
  job-run / observation-quality failure-code change (prompts 73–85 plus
  88/92 own those surfaces; verify they stay green).

## Reference deltas

None visual (server-only). The one deliberate property delta, stated so it
is not mistaken for a regression: code that previously compiled when
producing a formula-as-data issue with an arbitrary string no longer
compiles. No committed runtime path changes value, order, or shape.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State this
in the completion summary; do not run browser suites for this change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1 generation) —
  including the temporary negative probe rejection, quoted, then reverted.
- Targeted server suite: `source-parsers.spec.ts` (both formula cases: CSV
  and XLSX `formula_as_data` assertions) plus
  `ingestion-processor.service.spec.ts` and
  `child-process-parser.executor.spec.ts` (passthrough cases), then the full
  `npm run test:server` — do not claim the full suite from a targeted run.
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
  86/87/88 layering).
- `nestjs-best-practices` — no provider, wiring, module, or service-shape
  change.
- `security-best-practices` — durable-column sanitization; raw source and
  exception text never reaches persisted validation-issue rows via this
  producer.
- `error-handling-patterns` — fixed formula-as-data taxonomy preserved;
  compile-time guard so verbatim text can never reach
  `ValidationIssue.message` (fail-fast at the type level).
- `javascript-testing-patterns` — existing parser specs stay green in
  expectation (code assertions); negative type-probe procedure.
- `requesting-code-review` — Stage 1 reviewer subagent dispatch after
  self-verification (§2.1).
- `receiving-code-review` — Stage 2 technical evaluation of review feedback
  before any fix.
- `caveman-commit` — the commit message (ALWAYS rule, §3/§7).
- Loaded and deliberately not used: `postgres-best-practices` /
  `sql-optimization-patterns` (no migration, column, or query-plan change —
  `createMany` shape untouched), `api-design-principles` /
  `openapi-spec-generation` (no contract change — verified by
  `contracts:check`), `e2e-testing-patterns` / `playwright` (server-only
  change, no browser surface), `security-threat-model` (no trust boundary
  change — parser isolation is unchanged).
