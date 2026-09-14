# 100 — narrow `ParsedObservation` quality carrier code to the 3 fixed observation-quality literals

## Scope, and why it is next

The committed repository is on `main` at `1a13d65`
(`refactor(analytics): narrow invalid value code union`, i.e. the prompt 99
implementation). All 12 ordered phases in `docs/build-plan.md` are implemented
and committed through the Phase 12K exit gate (verification records §§16–22,
operator checklist in `docs/launch-checklist.md`), plus residual follow-ups 68
(saved-view `schemaVersion`), 69 (frozen dashboard-evidence `schemaVersion`), 70
(hourly `exports.purge-expired` reclamation), 71 (download-time expiry
enforcement), 72 (incompatible-metric-remap pre-publication validation), 73
(unexpected publication-failure message sanitization), 74 (`parser_exception`
fixed message), 75 (`worker_exception` fixed message), 76 (infected
`scanResult` bounded to `'infected'`), 77 (scheduled-job `JobRun.message` fixed
strings), 78 (`jobs.read` owner/admin gate on `GET /jobs/runs`), 79 (shared
`RETENTION_PURGE_BATCH_LIMIT = 500` across all five purges), 80
(`IngestionProcessorService.fail()` narrowed to the fixed publication
code/message union), 81 (inline `validation_failed` write narrowed to fixed
literals), 82 (`ExportFailure` narrowed to the fixed export failure union), 83
(`ScanResult.errorCode` narrowed to the fixed scan-error union plus `'infected'`
/ `'failed'` status fallbacks), 84 (`OutboxService` retry/dead-letter writes
narrowed to the fixed dispatch-exhausted union), 85 (`JobRunsService.finish()`
narrowed to the fixed job-run message union), 86 (`invalidValue()` message
narrowed to the 3 fixed observation-quality literals), 87
(`createSafeErrorSummary()` message narrowed to the 2 fixed parser-executor
literals), 88 (`parsePeriod()` message narrowed to the fixed `period_invalid`
literal), 89 (`validateMapping()` in `analytics-publication.service.ts` message
narrowed to the 5 fixed mapping-validation literals), 90
(`malformedMetricMappingIssues()` message narrowed to the 3 fixed
mapping-shape literals), 91 (private `IngestionProcessorService.validateMapping()`
message narrowed to the 4 fixed region-mapping literals), 92
(`validateRemappingCompatibility()` message narrowed to the single fixed
remapping literal), 93 (`ParsedObservation` quality carrier message narrowed to
the 4 fixed observation-quality literals), 94
(`validateRemappingCompatibility()` code narrowed to the single fixed
`metric_definition_incompatible` literal), 95
(`malformedMetricMappingIssues()` code narrowed to the single fixed
`metric_mapping_invalid` literal), 96 (`validateMapping()` code narrowed to the
5 fixed mapping-validation literals), 97 (private
`IngestionProcessorService.validateMapping()` code narrowed to the 4 fixed
region-mapping literals), 98 (`parsePeriod()` code narrowed to the single fixed
`period_invalid` literal), and 99 (`invalidValue()` code narrowed to the fixed
2-literal union `'value_missing' | 'value_invalid'`).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 8 (metrics and deterministic analytics — the
in-memory observation-quality carrier code in `AnalyticsPublicationService`,
completing the three-part quality-code closing lineage started by prompt 98 and
prompt 99, exactly mirroring prompt 93's message-carrier closing),
dependency-safe against prompts 68–99 (no schema, migration, contract, route,
permission, timeout/memory-bound, retention-window, or version-marker change).

The gap is the final open-`string` quality-code producer into a durable column
that still compiles with an arbitrary string.
`ParsedObservation['quality'][number]['code']` (`server/src/analytics/
analytics-publication.service.ts`, interface at lines 12–39 with `readonly
code: string` at line 35) is the in-memory carrier for the two already-narrowed
quality-code sub-producers:

| sub-producer | narrowed by | code literals today |
| --- | --- | --- |
| `parsePeriod()` (`PeriodInvalidCode`) | prompt 98 | `'period_invalid'` (`PERIOD_INVALID_CODE` at line 509) |
| `invalidValue()` (`InvalidValueCode`) | prompt 99 | `'value_missing'` / `'value_invalid'` (`VALUE_MISSING_CODE` / `VALUE_INVALID_CODE` at lines 519–520) |

`parseObservation()` (lines 258–281) combines them as `quality:
[...period.quality, ...value.quality]` at line 279, and `publish()` (lines
219–231) maps them verbatim via `observationQuality.createMany` (`code:
quality.code` at line 226) into the durable `ObservationQuality.code` column
(`server/prisma/schema.prisma` `model ObservationQuality`, `code String` at line
815). The carrier type is currently open — `readonly code: string` at line 35 —
so any future push passing an unvalidated code string, raw cell dump, or
exception text into the `ParsedObservation` quality array would compile and
persist unbounded text into a column that survives in PostgreSQL backups and
restore drills. That is the exact inversion prompt 93 eliminated for the quality
message at the combining carrier; this prompt closes it for the quality code at
the type level with zero runtime behavior change.

Today the carrier holds exactly these 3 code literals and no others (verify by
reading `parseObservation`, `parsePeriod`, `parseValue`, and `invalidValue`
bodies — do not cite them from memory):
1. `'period_invalid'` (from `parsePeriod()`)
2. `'value_missing'` (from `invalidValue()` blank check)
3. `'value_invalid'` (from `invalidValue()` unparsable number/boolean checks)

The publication spec asserts all 3 code literals: `code: 'value_missing'` at
`analytics-publication.service.spec.ts:279`, `code: 'value_invalid'` at line
323, and `code: 'period_invalid'` at lines 354–355.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 8 definition (§9, metrics/analytics and its skill
  manifest) with §§16–22 confirming 12E–12K committed; §1 rule that open
  numeric limits need real input and must not be invented (why no new code value
  appears here — only narrowing to the existing produced set).
- `docs/analytics.md` — the mapping-contract paragraph (lines 67–86:
  `invalidValue()` 3 message literals and 2 code literals, `parsePeriod()` 1
  message literal and 1 code literal, `ParsedObservation` carrier 4 message
  literals) and the schema paragraph (`ObservationQuality` durable quality state);
  the owning record for the doc update.
- `server/src/analytics/analytics-publication.service.ts` (747 lines; lines
  12–39 for `interface ParsedObservation` with open `code: string` at line 35
  versus narrowed `message: ObservationQualityMessage` at line 36; lines 219–231
  for `observationQuality.createMany` with `code: quality.code`; lines 258–281
  for `parseObservation()`; lines 454–502 for `parsePeriod()`; lines 504–530
  for `PERIOD_INVALID_*`, `INVALID_VALUE_*`, and `ObservationQualityMessage`;
  lines 602–632 for `invalidValue()`).
- `server/src/analytics/analytics-publication.service.spec.ts` (lines 260–365
  verifying quality assertions for `value_missing`, `value_invalid`, and
  `period_invalid`).
- `server/prisma/schema.prisma` (lines 809–825 for `model ObservationQuality`
  confirming `code String` at line 815 and `message String` at line 816).

## Measurements and verified invariants

- `ParsedObservation['quality'][number]['code']` carrier today: open `string`
  at `server/src/analytics/analytics-publication.service.ts:35`.
- Sub-producer code types:
  - `PeriodInvalidCode` (`typeof PERIOD_INVALID_CODE`, line 511): exactly 1
    literal (`'period_invalid'`).
  - `InvalidValueCode` (`typeof VALUE_MISSING_CODE | typeof VALUE_INVALID_CODE`,
    line 527): exactly 2 literals (`'value_missing' | 'value_invalid'`).
- The narrowed combining union:
  `type ObservationQualityCode = PeriodInvalidCode | InvalidValueCode;` (or
  union of the 3 consts), exactly 3 literals.
- Spread assignability: `parseObservation()` spreads `[...period.quality,
  ...value.quality]` at line 279. Since `period.quality` elements have `code:
  PeriodInvalidCode` and `value.quality` elements have `code: InvalidValueCode`,
  the concatenated array elements have `code: PeriodInvalidCode |
  InvalidValueCode`, which satisfies `ObservationQualityCode` without any type
  assertion (`as`) or casting.
- Persistence assignability: `publish()` maps `quality.code` at line 226 into
  `tx.observationQuality.createMany`. Since `ObservationQualityCode` is a union
  of string literals, it assigns cleanly to Prisma's `String` field without any
  cast.
- Quality summary invariant: `qualitySummary()` (lines 713–723) reads only
  `quality.severity` (`'info' | 'warning' | 'error'`); `code` is untouched by
  aggregation.
- Compile-time negative probe: assigning an invalid code literal (e.g.
  `'unknown_code'` or `'synthetic_flag'`) to `ParsedObservation['quality']`
  must fail `tsc` with `Type '"unknown_code"' is not assignable to type
  'ObservationQualityCode'`.
- Wire contract invariant: `docs/api/contracts.md` / `generate-contracts.ts`
  untouched — verify with `npm run contracts:check`. `ObservationQuality.code`
  is not an exported wire-contract enum; read models remain `string`.

## Expected impact

| file | today | after prompt 100 |
| --- | --- | --- |
| `server/src/analytics/analytics-publication.service.ts` line 35 | `readonly code: string;` in `ParsedObservation['quality'][number]` | `readonly code: ObservationQualityCode;` |
| `server/src/analytics/analytics-publication.service.ts` line ~530 | `type ObservationQualityMessage = PeriodInvalidMessage \| InvalidValueMessage;` | add `type ObservationQualityCode = PeriodInvalidCode \| InvalidValueCode;` directly beside it |
| `docs/analytics.md` | states `ParsedObservation` carrier code remains separately scoped | records that `ParsedObservation` quality carrier accepts only the 3 fixed codes (`period_invalid`, `value_missing`, `value_invalid`) as a compile-time guard; unbounded code text never reaches `ObservationQuality.code` via this carrier |

- Runtime behavior is 100% identical. Every produced code literal is unchanged.
- Zero Prisma schema migrations or PostgreSQL DDL changes.
- Zero client workspace changes.

## Implementation steps

1. `server/src/analytics/analytics-publication.service.ts`:
   - Introduce `type ObservationQualityCode = PeriodInvalidCode | InvalidValueCode;`
     at ~line 530, directly alongside `type ObservationQualityMessage = PeriodInvalidMessage | InvalidValueMessage;`.
   - Update `interface ParsedObservation` at line 35: replace `readonly code: string;`
     with `readonly code: ObservationQualityCode;`.
   - Verify that `parseObservation()` (line 279: `quality: [...period.quality, ...value.quality]`)
     and `publish()` (line 226: `code: quality.code`) compile cleanly without any type assertions or casts.
2. Negative probe verification:
   - Temporarily test pushing an invalid code literal into `ParsedObservation.quality`
     to verify `tsc` rejections. Revert the probe cleanly before proceeding.
3. Spec checks:
   - Run `npm --workspace=@acres/server test -- analytics-publication.service.spec.ts`.
   - Ensure all tests pass. If desired, add a compile-time/runtime type check confirming
     that `ParsedObservation['quality'][number]['code']` strictly accepts `ObservationQualityCode`.
4. Run full repository verification:
   - `npm run contracts:check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
5. Documentation update:
   - Update `docs/analytics.md` lines ~78–86: replace the clause noting that
     `ParsedObservation` carrier code remains separately scoped with a statement
     confirming that `ParsedObservation` quality carrier code is narrowed to the 3
     fixed quality codes (`period_invalid`, `value_missing`, `value_invalid`) as an
     `ObservationQualityCode` compile-time guard; runtime values unchanged and
     unbounded code text never reaches `ObservationQuality.code` via this carrier.
6. Two-stage code review:
   - Dispatch reviewer subagent via `requesting-code-review`.
   - Evaluate reviewer feedback via `receiving-code-review`.
7. Commit:
   - Commit locally to `main` using `caveman-commit`.

## Non-goals

- No new code literals or modification to existing literal strings.
- No changes to `ObservationQuality.severity`, `state`, `details`, or `message`.
- No database schema migrations or Prisma model alterations (`code String` remains).
- No changes to read APIs or client types.
- No changes to other producers (`ValidationIssue`, `JobRun`, `ExportFailure`, etc.).

## Checks to run, and the owning doc

```bash
# Spec check
npm --workspace=@acres/server test -- analytics-publication.service.spec.ts

# Wire contracts check
npm run contracts:check

# Lint check
npm run lint

# Typecheck
npm run typecheck

# Full production build
npm run build
```

Owning doc: `docs/analytics.md`.

## SKILLS USED

- `nestjs-best-practices`: NestJS service patterns, type design, dependency boundaries in `server/`.
- `postgres-best-practices`: data integrity and compile-time boundaries protecting PostgreSQL columns.
- `javascript-testing-patterns`: Jest spec execution and type safety verification in test fixtures.
- `error-handling-patterns`: defensive validation and bounded error code taxonomy.
- `requesting-code-review`: preparing and dispatching code review subagent (§2, §2.1).
- `receiving-code-review`: evaluating review feedback with technical rigor (§2, §2.1).
- `caveman-commit`: generating commit message for local commit to `main` (§3, §7).
