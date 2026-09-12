# 88 — narrow `parsePeriod()` period-invalid quality message to a fixed literal

## Scope, and why it is next

The committed repository is on `main` at `b845ed1`
(`refactor(ingestion): narrow executor message union`, i.e. prompt 87). All 12
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
(`invalidValue()` narrowed to the 3 fixed observation-quality literals), and
87 (`createSafeErrorSummary()` message narrowed to the 2 fixed
parser-executor literals).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 8 (metrics and deterministic analytics —
the observation-quality durable-write surface, continuing the prompt 86
sibling narrowing in the same file and the prompts 80–87 writer-narrowing
lineage), dependency-safe against prompts 68–87 (no schema, migration,
contract, route, permission, timeout/memory-bound, retention-window, or
version-marker change).

The gap is the last open-`string` producer into the durable
observation-quality path that still compiles with an arbitrary string.
`parsePeriod()` in `server/src/analytics/analytics-publication.service.ts`
(lines 465–478) pushes an inline literal into the quality array on
unparsable periods:

```ts
quality: [
  {
    severity: 'error' as const,
    state: 'invalid' as const,
    code: 'period_invalid',
    message: 'Mapped period could not be parsed deterministically.',
    details: { value: String(startRaw ?? '') },
  },
],
```

Its output flows verbatim via `parseObservation`
(`analytics-publication.service.ts:267`,
`quality: [...period.quality, ...value.quality]`) through `publish()`
`observationQuality.createMany` (`:208–218`, `message: quality.message`)
into the durable `ObservationQuality.message` column. The carrier type is
open — `ParsedObservation.quality[].message: string` (`:37`) — so any future
producer passing `String(raw)`, `(error as Error).message`, or a formatted
cell dump would persist raw source/exception text into a column that survives
in PostgreSQL backups and restore drills and is served to every future
reader. That is the exact inversion prompt 86 eliminated for the
`invalidValue()` sibling producer (3 fixed literals, same file, same
`createMany` write); this prompt closes it for the `parsePeriod()` producer
at the type level with zero runtime behavior change.

Today `parsePeriod()` produces exactly 1 message literal
(`'Mapped period could not be parsed deterministically.'`), alongside the
`period_invalid` code. No spec asserts the message literal: the
period-invalid spec asserts via
`expect.objectContaining({ code: 'period_invalid' })`
(`analytics-publication.service.spec.ts:349–356` — verify exact line numbers
from the file, do not cite them from memory, and do not reword any asserted
value).

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 8 definition (§9, metrics/analytics and its
  skill manifest) with §§16–22 confirming 12E–12K committed; §1 rule that
  open numeric limits need real input and must not be invented (why no new
  message value appears here — only narrowing to the existing produced set).
- `docs/analytics.md` — the observation-quality paragraph recording the
  prompt 86 `invalidValue()` narrowing (lines ~67–70: the three fixed
  literals, compile-time guard, raw text never reaches
  `ObservationQuality.message` via that helper); the owning record for the
  doc update. Resolve the exact paragraph lines from the file — do not cite
  line numbers from memory.
- `server/src/analytics/analytics-publication.service.ts` (657 lines;
  read 13–40 for the `ParsedObservation` carrier, 153–223 for `publish()` and
  the `createMany` durable write, 225–269 for `parseObservation` quality
  merge, 442–479 for `parsePeriod`, 481–543 for the prompt 86
  `INVALID_VALUE_*` const/union pattern to mirror) — the helper, the
  single-literal matrix, and the `ParsedObservation.quality[].message`
  (`string` — the shared quality shape, untouched).
- `server/src/analytics/analytics-publication.service.spec.ts`
  (period-invalid assertions at ~349–356 asserting `code` only) — existing
  coverage that must stay green.
- `prompts/86-observation-quality-message-narrowing.md` (writer-narrowing
  pattern, constant-placement rule, and negative-probe procedure to mirror),
  `prompts/80-*.md` through `prompts/85-*.md` plus `prompts/87-*.md`
  (lineage premise).
- Verified closed this session, no change: `invalidValue()` narrowed by
  prompt 86 (3 literals); `validateRemappingCompatibility` single literal
  (`Metric key is already defined with a different type, unit, or
  aggregation.`) and `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` untouched;
  `ingestion-processor.service.ts` (`fail()` narrowed by prompt 80;
  `VALIDATION_FAILURE_*` narrowed by prompt 81), `reports.service.ts`
  (`ExportFailure` narrowed by prompt 82), `upload-worker.service.ts` +
  `scanner.port.ts` (prompts 75/76/83), `outbox.service.ts` (prompt 84),
  `jobs/job-runs.service.ts` (prompt 85),
  `child-process-parser.executor.ts` (`createSafeErrorSummary()` narrowed by
  prompt 87).

## Measurements and procedures (no eyeballed numbers)

No comp measurement is involved (server-only, type-only change). The
normative matrix is derived from the existing code:

| producer / value | value today | after |
| --- | --- | --- |
| `parsePeriod()` period-invalid message | any `string` compiles (the gap); runtime value is the 1 fixed literal | only the fixed literal compiles (`as const` constant with `typeof` union of one, mirroring prompt 86) |
| `ParsedObservation.quality[].message` carrier / `ObservationQuality.message` column / read shape | `string` | unchanged — shared shape, no contract change |
| `period_invalid` code | `'period_invalid'` inline | unchanged |
| spec assertions (`code: 'period_invalid'`, aggregate exclusion) | assert code/behavior | unchanged |
| `details: { value: String(startRaw ?? '') }` | present | unchanged — raw cell text in `details` JSON is existing governed behavior, out of scope |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: pass a `string`-typed variable (e.g. a `String(raw)` value)
as the period-invalid quality message, confirm `tsc` rejects it, quote the
error, then revert the probe. The probe is not committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SDL shape,
  permission, purge behavior, aggregate math, lineage, period grammar, or
  schedule change. Period parsing behaves byte-identically; unparsable
  periods carry the same string as today, now type-checked.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify with
  `npm run contracts:check` and state that it passes unchanged
  (quality messages are not a wire-contract literal; the read value stays a
  string).

## Implementation steps

1. `server/src/analytics/analytics-publication.service.ts`: extract the
   period-invalid literal into an exported-or-module-private `as const`
   constant (e.g. `PERIOD_INVALID_MESSAGE`, mirroring the `INVALID_VALUE_*`
   placement at lines 481–490) with a `typeof` single-member union type, and
   narrow `parsePeriod()`'s produced quality message to it. The existing
   `parsePeriod()` call path must compile unchanged with no casts. If any
   needs a cast — e.g. a message is not exactly the 1 literal — stop: the
   union is wrong and the premise of this prompt is broken. Leave the
   `ParsedObservation` quality carrier (`string`), `validateMapping` (5
   literals, separately scoped validation taxonomy), 
   `validateRemappingCompatibility` (single literal, separately scoped),
   `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE`,
   `parseValue()`/`invalidValue()` (prompt 86 owns), the `createMany` shape,
   and the `details` value untouched. If the narrow rewrite requires
   touching any of those, stop — the premise is broken.
2. Spec expectations: no changes expected (specs assert `code`, not the
   message literal). If any spec asserts a message literal, keep the
   identical literal; only move to a const import if the implementation
   exports one. Do NOT add, remove, or reword any asserted value. If any
   spec reaches the period-invalid quality with a raw string (verified
   absent — specs assert through `publish()` with a mocked tx — but
   re-verify), re-point it at the fixed literal rather than enshrining it;
   if re-pointing changes asserted behavior, stop and explain.
3. Run the temporary negative probe from the matrix above; quote the `tsc`
   rejection; revert the probe before staging.
4. Docs in the same change: `docs/analytics.md` — one clause beside the
   prompt 86 `invalidValue()` sentence recording that `parsePeriod()`
   accepts only the fixed `period_invalid` literal (compile-time guard;
   runtime value unchanged; raw source/exception text never reaches
   `ObservationQuality.message` via this producer). No new semantics; say
   so in the summary.
5. Then the §2.1 two-stage review loop (`requesting-code-review` subagent
   with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
   verification) and the `caveman-commit` message.

## Non-goals

- No new message text, code, state, or severity.
- No `ParsedObservation` quality-carrier narrowing (`message: string` stays
  the shared shape; changing it would force the `invalidValue()`,
  `validateMapping`, and remapping producers into one change).
- No `validateMapping` 5-literal taxonomy change (broader mapping-validation
  surface, separately scoped if ever).
- No `validateRemappingCompatibility` / `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE`
  change (prompt 72 owns the remap surface; the mid-transaction throw stays
  the race guard).
- No `details: { value: String(...) }` change (existing governed JSON
  detail, not the message-taxonomy gap).
- No `invalidValue()` change (prompt 86 owns that producer; verify it stays
  green).
- No schema or migration change: the `ObservationQuality` table is
  untouched; only the TypeScript producer narrows.
- No permission change.
- No `JobRun` self-retention purge (prompts 79/84/85 name it: five ticks
  write ≥ five rows an hour with no reclamation, but the window is an
  explicit open operator decision per `docs/operations.md`
  `data_retention_policy`; build-plan §1 forbids inventing it).
- No live Docker drills (restart/orphan/Garage/Valkey/ClamAV remain future
  operational work per prompts 72–84).
- No ingestion/export/scan/outbox/job-run/parser-executor failure-code
  change (prompts 80–85 and 87 own those surfaces; verify they stay green).

## Reference deltas

None visual (server-only). The one deliberate property delta, stated so it
is not mistaken for a regression: code that previously compiled when
producing a period-invalid quality message with an arbitrary string no
longer compiles. No committed runtime path changes value, order, or shape.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State this
in the completion summary; do not run browser suites for this change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1 generation) —
  including the temporary negative probe rejection, quoted, then reverted.
- Targeted server suite: `analytics-publication.service.spec.ts` (all
  period-invalid/quality assertions) plus `analytics.service.spec.ts` and
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

- `architecture-patterns` — const/union placement beside the module-private
  producer vs the shared quality carrier (no new module edges; mirrors
  prompt 86 layering).
- `nestjs-best-practices` — no provider, wiring, module, or service-shape
  change.
- `security-best-practices` — durable-column sanitization; raw source and
  exception text never reaches persisted observation-quality rows via this
  producer.
- `error-handling-patterns` — fixed period-invalid taxonomy preserved;
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
  `api-design-principles` / `openapi-spec-generation` (no contract change —
  verified by `contracts:check`), `e2e-testing-patterns` / `playwright`
  (server-only change, no browser surface), `security-threat-model` (no trust
  boundary change — publication isolation is unchanged).
