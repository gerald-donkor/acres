# 93 — narrow `ParsedObservation` quality message to the 4 fixed observation-quality literals

## Scope, and why it is next

The committed repository is on `main` at `ff18e5e`
(`refactor(analytics): narrow remapping message`, i.e. the prompt 92
implementation). The prompt 92 file itself is present on disk as an untracked
`prompts/92-remapping-compatibility-message-narrowing.md`; per §10 rule 5 the
committed state is resolved from `git log`, not from prompt files. All 12
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
narrowed to the 4 fixed region-mapping literals), and 92
(`validateRemappingCompatibility()` narrowed to the single fixed remapping
literal).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 8 (metrics and deterministic analytics
— the in-memory observation-quality carrier in
`AnalyticsPublicationService`, continuing the prompts 80–92
writer-narrowing lineage), dependency-safe against prompts 68–92 (no schema,
migration, contract, route, permission, timeout/memory-bound,
retention-window, or version-marker change).

The gap is the last open-`string` quality-message producer into a durable
column that still compiles with an arbitrary string.
`ParsedObservation['quality'][number]['message']` (`server/src/analytics/
analytics-publication.service.ts`, interface at lines ~12–39 with
`readonly message: string` at ~line 36 — verify exact line numbers from the
file, do not cite them from memory) is the in-memory carrier for the two
already-narrowed quality producers:

| sub-producer | narrowed by | literals today |
| --- | --- | --- |
| `invalidValue()` (`InvalidValueMessage`) | prompt 86 | `'Metric value is blank.'`, `'Numeric metric value could not be parsed.'`, `'Boolean metric value could not be parsed.'` |
| `parsePeriod()` (`PeriodInvalidMessage`) | prompt 88 | `'Mapped period could not be parsed deterministically.'` |

`parseObservation()` (`~258–281` — verify exact lines from the file) builds
the carrier as `quality: [...period.quality, ...value.quality]`, and
`publish()` (`~219–231`) maps it verbatim via
`observationQuality.createMany` (`message: quality.message`) into the
durable `ObservationQuality.message` column (`server/prisma/schema.prisma`
`model ObservationQuality`, `message String` at ~809–816 — verify exact
lines from the file). The carrier type is open — `message: string` — so any
future push passing `String(raw)`, `(error as Error).message`, or a
formatted cell dump into the `ParsedObservation` quality array would compile
and persist raw source/exception text into a column that survives in
PostgreSQL backups and restore drills and is served to every future reader
via `toObservation()` (`analytics.service.ts:109–135`, read shape
`message: string`, untouched). That is the exact inversion prompts 86/88
eliminated for the two sub-producers at their own signatures; this prompt
closes it at the combining carrier with zero runtime behavior change.

Today the carrier holds exactly these 4 message literals and no others
(verify by reading `parseObservation`, `parsePeriod`, `parseValue`, and
`invalidValue` bodies — do not cite them from memory). No spec asserts a
quality message literal: the publication spec asserts `code` only via
`expect.objectContaining({ code: 'value_missing' })`,
`{ code: 'value_invalid' }`, and `{ code: 'period_invalid' }`
(`analytics-publication.service.spec.ts:274–355` — verify exact line numbers
from the file, do not cite them from memory, and do not reword any asserted
value). The analytics read spec asserts observation `message` values only on
the read path (`'Source row passed structural validation.'`,
`'Metric not found.'`, `'Aggregate not found.'` at
`analytics.service.spec.ts:74/241/302/560/589` — a separately scoped read
surface, untouched).

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 8 definition (§9, metrics/analytics and its
  skill manifest) with §§16–22 confirming 12E–12K committed; §1 rule that
  open numeric limits need real input and must not be invented (why no new
  message value appears here — only narrowing to the existing produced set).
- `docs/analytics.md` — the mapping-contract paragraph (the prompt
  86/88/89/90/92 narrowing sentences: `invalidValue()` 3 literals,
  `parsePeriod()` 1 literal, `validateMapping()` 5 literals,
  `malformedMetricMappingIssues()` 3 literals,
  `validateRemappingCompatibility()` 1 literal) and the schema paragraph
  (`ObservationQuality` visible quality state); the owning record for the
  doc update. Resolve the exact paragraph lines from the file — do not cite
  line numbers from memory.
- `server/src/analytics/analytics-publication.service.ts` (708 lines; read
  12–39 for the `ParsedObservation` interface and its open
  `message: string` quality carrier, 219–231 for the
  `observationQuality.createMany` durable write with
  `message: quality.message`, 237–281 for `parseObservations` /
  `parseObservation` and the `[...period.quality, ...value.quality]` spread,
  454–507 for `parsePeriod()` and the `PERIOD_INVALID_MESSAGE` const +
  `typeof` union to reuse, 509–518 for the three `INVALID_VALUE_*` consts +
  `InvalidValueMessage` union to reuse, 543–594 for `parseValue()` /
  `invalidValue()` narrowing to mirror) — the carrier, the durable write,
  and the two already-narrowed literal sets whose union is the new type.
- `server/prisma/schema.prisma` (`model ObservationQuality`,
  `message String` at ~809–816 — verify exact lines) — the durable column,
  untouched (no migration).
- `server/src/analytics/analytics.service.ts` (read ~94–138 for
  `toObservation()` with the `qualities: Array<{ ... message: string }>`
  read shape) — the read carrier, deliberately untouched.
- `server/src/analytics/analytics-publication.service.spec.ts`
  (`observationQualityCreateMany` code-only assertions at ~274–355 asserting
  `value_missing` / `value_invalid` / `period_invalid`) — existing coverage
  that must stay green.
- `server/src/analytics/analytics.service.spec.ts` (read-path `message`
  assertions at ~74/241/302/560/589) — separately scoped read surface,
  must stay green untouched.
- `prompts/86-observation-quality-message-narrowing.md` (sub-producer
  narrowing pattern for `invalidValue()`, 3 literals),
  `prompts/88-period-invalid-quality-message-narrowing.md` (single-literal
  narrowing pattern for `parsePeriod()`),
  `prompts/89-validate-mapping-message-narrowing.md` (producer-narrowing
  pattern, constant-placement rule, and negative-probe procedure to mirror),
  `prompts/92-remapping-compatibility-message-narrowing.md` (latest
  narrowing in the same file, union-placement rule to mirror),
  `prompts/72-incompatible-metric-remapping-validation.md` (remap-surface
  premise, kept separate from this quality-carrier change).
- Verified closed this session, no change: `invalidValue()` narrowed by
  prompt 86 (3 literals); `parsePeriod()` narrowed by prompt 88 (1
  literal); `validateMapping()` narrowed by prompt 89 (5 literals);
  `malformedMetricMappingIssues()` narrowed by prompt 90 (3 literals);
  private ingestion-processor `validateMapping()` narrowed by prompt 91 (4
  literals); `validateRemappingCompatibility()` narrowed by prompt 92 (1
  literal); `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` race-guard
  identity and `PUBLICATION_UNEXPECTED_FAILURE_MESSAGE` untouched;
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
| `ParsedObservation['quality'][number]['message']` carrier | any `string` compiles (the gap); runtime value is one of the 4 fixed literals | only the 4 fixed literals compile (`type ObservationQualityMessage = PeriodInvalidMessage \| InvalidValueMessage`, reusing the two existing `typeof` unions — no new const, no new literal text) |
| `parsePeriod()` / `invalidValue()` signatures | already narrowed (prompts 86/88) | unchanged — the union only names them |
| `observationQuality.createMany` write (`message: quality.message`) | compiles via open `string` | compiles unchanged with no casts, since the 4-member union is assignable to the Prisma `String` column |
| `toObservation()` read shape (`analytics.service.ts:109–114`, `message: string`) | `string` | unchanged — read shape, no contract change |
| shared `ParserIssue.message` / `ValidationIssue.message` column | `string` | unchanged — separate carrier, out of scope |
| quality `code` / `severity` / `state` | open `string` unions where they stand | unchanged — message-only narrowing, matching the 86–92 lineage |
| spec assertions (`value_missing` / `value_invalid` / `period_invalid` codes) | assert code only | unchanged |
| read-path messages (`'Source row passed structural validation.'`, `'Metric not found.'`, `'Aggregate not found.'`) | asserted on the read path | unchanged |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: pass a `string`-typed variable (e.g. a `String(raw)` value)
as a `ParsedObservation`-shaped quality message, confirm `tsc` rejects it,
quote the error, then revert the probe. The probe is not committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SDL shape,
  permission, purge behavior, mapping grammar (`parseAnalyticsMapping`
  untouched), aggregate math, lineage, quality-summary counting, or schedule
  change. Observation publication behaves byte-identically; blank/invalid
  values and unparsable periods carry the same strings as today, now
  type-checked at the combining carrier.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify with
  `npm run contracts:check` and state that it passes unchanged
  (observation-quality messages are not a wire-contract literal; the read
  value stays a string).

## Implementation steps

1. `server/src/analytics/analytics-publication.service.ts`: introduce a
   combining type (e.g. `ObservationQualityMessage = PeriodInvalidMessage |
   InvalidValueMessage`, placed beside the existing `PERIOD_INVALID_MESSAGE`
   / `INVALID_VALUE_*` consts and their `typeof` unions at ~504–518,
   mirroring the prompt 89/92 union-placement rule) reusing the two
   existing narrowed unions with no new literal text, and narrow the
   `ParsedObservation` quality-element `message` (at ~26–38) to it. The
   existing `parseObservation()` spread (`[...period.quality,
   ...value.quality]`) and the `publish()` path
   (`observationQuality.createMany` with `message: quality.message`) must
   compile unchanged with no casts, since each sub-producer already yields
   a member of the union. If any needs a cast — e.g. a quality push is not
   exactly one of the 4 literals — stop: the union is wrong and the premise
   of this prompt is broken. Leave the shared `ParserIssue` shape
   (`message: string`), the `ValidationIssue` write path, the
   `toObservation()` read shape (`message: string`), the quality `code` /
   `severity` / `state` values, `validateMapping()` /
   `malformedMetricMappingIssues()` / `validateRemappingCompatibility()`
   (prompts 89/90/92 own those producers), the ingestion-processor private
   `validateMapping()` region-column surface (prompt 91 owns), the
   `createMany` shape, and the aggregate/lineage math untouched. If the
   narrow rewrite requires touching any of those, stop — the premise is
   broken.
2. Spec expectations: no changes expected (publication specs assert `code`
   only, not message literals; read-spec messages are a separate surface).
   If any spec asserts a quality message literal, keep the identical
   literal; only move to a const import if the implementation exports one.
   Do NOT add, remove, or reword any asserted value. If any spec reaches
   the `ParsedObservation` quality array with a raw string (verified
   absent — specs drive publication with fixed cell values and assert
   codes — but re-verify), re-point it at the fixed literal rather than
   enshrining it; if re-pointing changes asserted behavior, stop and
   explain.
3. Run the temporary negative probe from the matrix above; quote the `tsc`
   rejection; revert the probe before staging.
4. Docs in the same change: `docs/analytics.md` — one clause beside the
   prompt 86/88 narrowing sentences recording that the `ParsedObservation`
   quality carrier accepts only the 4 fixed literals (the 3
   `invalidValue()` literals plus the `parsePeriod()` literal) as a
   compile-time guard; runtime values unchanged; raw cell/exception text
   never reaches `ObservationQuality.message` via this carrier. No new
   semantics; say so in the summary.
5. Then the §2.1 two-stage review loop (`requesting-code-review` subagent
   with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
   verification) and the `caveman-commit` message.

## Non-goals

- No new message text, code, severity, `state`, or `details`.
- No quality `code` / `severity` / `state` narrowing (message-only change,
  matching the 86–92 lineage; the code taxonomy is separately scoped if
  ever).
- No shared `ParserIssue.message` carrier narrowing (`message: string`
  stays the shared shape; changing it would force every parser, mapping,
  and remapping producer into one change).
- No `ValidationIssue.message` change (prompts 89–92 own those producers;
  verify they stay green).
- No `toObservation()` read-shape change (`qualities ... message: string`
  stays; the read value is not the producer gap).
- No `parsePeriod()` / `invalidValue()` / `parseValue()` behavior change
  (prompts 86/88 own those producers; verify they stay green).
- No `validateMapping()` / `malformedMetricMappingIssues()` /
  `validateRemappingCompatibility()` change (prompts 89/90/92 own those
  producers; verify they stay green).
- No ingestion-processor private `validateMapping()` region-column change
  (prompt 91 owns that surface; verify it stays green).
- No parser `ParserIssue` producer change (prompts 74/87 own those
  surfaces; the many-literal parser-issue taxonomy is a separately scoped
  change if ever; verify it stays green).
- No aggregate math, `qualitySummary()`, lineage, or
  `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` /
  `PUBLICATION_UNEXPECTED_FAILURE_MESSAGE` change (prompts 72/73 own those
  throws; the race-guard error-identity comparison stays).
- No schema or migration change: the `ObservationQuality` table is
  untouched; only the TypeScript carrier narrows.
- No permission change.
- No `JobRun` self-retention purge (prompts 79/84/85 name it: five ticks
  write ≥ five rows an hour with no reclamation, but the window is an
  explicit open operator decision per `docs/operations.md`
  `data_retention_policy`; build-plan §1 forbids inventing it).
- No live Docker drills (restart/orphan/Garage/Valkey/ClamAV remain future
  operational work per prompts 72–84).
- No ingestion `fail()` / `validation_failed` / export / scan / outbox /
  job-run / parser-executor failure-code change (prompts 73–88 own those
  surfaces; verify they stay green).

## Reference deltas

None visual (server-only). The one deliberate property delta, stated so it
is not mistaken for a regression: code that previously compiled when
pushing a `ParsedObservation` quality entry with an arbitrary string no
longer compiles. No committed runtime path changes value, order, or shape.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State this
in the completion summary; do not run browser suites for this change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1 generation) —
  including the temporary negative probe rejection, quoted, then reverted.
- Targeted server suite: `analytics-publication.service.spec.ts` (all
  observation-quality code assertions) plus `analytics.service.spec.ts`,
  `ingestion-processor.service.spec.ts`, and `mapping.spec.ts`, then the
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

- `architecture-patterns` — combining-carrier union placement beside the two
  narrowed sub-producer unions vs the shared `ParserIssue` / read-shape
  carriers (no new module edges; mirrors prompts 86/88/89/92 layering).
- `nestjs-best-practices` — no provider, wiring, module, or service-shape
  change.
- `security-best-practices` — durable-column sanitization; raw cell and
  exception text never reaches persisted observation-quality rows via this
  carrier.
- `error-handling-patterns` — fixed 4-literal quality taxonomy preserved;
  compile-time guard so verbatim text can never reach
  `ObservationQuality.message` (fail-fast at the type level).
- `javascript-testing-patterns` — existing quality code-only specs stay
  green in expectation; negative type-probe procedure.
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
