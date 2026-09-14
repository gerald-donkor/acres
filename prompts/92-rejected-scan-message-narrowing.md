# 92 — narrow rejected-scan durable messages to a single fixed literal

## Scope, and why it is next

The committed repository is on `main` at `b9a9a9c`
(`docs(prompts): add missing 89-91 narrowing prompts`). All 12 ordered phases
in `docs/build-plan.md` are implemented and committed through the Phase 12K
exit gate (verification records §§16–22, operator checklist in
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
narrowed to the 3 fixed mapping-shape literals), and 91 (private
`IngestionProcessorService.validateMapping()` narrowed to the 4 fixed
region-mapping literals).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 6 (storage, queues, worker, and secure
uploads — the rejected-scan durable-message surface in
`server/src/worker/upload-worker.service.ts`, continuing the prompts 75/76/83
worker-narrowing lineage), dependency-safe against prompts 68–91 (no schema,
migration, contract, route, permission, timeout/memory-bound, retention-window,
or version-marker change).

The gap is the last unguarded literal family in the worker rejection flow.
The rejected-scan path writes the identical inline literal
`'Upload did not pass malware scanning.'` into three durable columns at three
sites in one file:

| site | column | location |
| --- | --- | --- |
| `tx.upload.update` | `Upload.failureMessage` | `upload-worker.service.ts:274` |
| `tx.durableJob.update` | `DurableJob.lastErrorMessage` | `upload-worker.service.ts:316–319` (`:319` carries the literal) |
| `tx.jobDeadLetter.create` | `JobDeadLetter.reasonMessage` | `upload-worker.service.ts:330` |

The rejection codes at the same three sites are already narrowed to
`RejectedScanCode` (`upload-worker.service.ts:37`,
`type RejectedScanCode = ScanErrorCode | 'infected' | 'failed'`, prompt 83
lineage; `ScanErrorCode` is the fixed 4-member union in
`server/src/scanner/scanner.port.ts:1–5`). The messages are not: all three
are bare inline string literals in `data` objects whose Prisma input types
accept any `string`, and there is no module-top const or `typeof` union for
this literal the way `WORKER_EXCEPTION_MESSAGE` (`:34–35`, prompt 75) guards
the sibling exception path (`:367` / `:375`, untouched). A repository-wide
search this session for the literal finds exactly the three implementation
sites plus six spec assertion sites — no other producer writes this value.
Any future edit passing `String(raw)`, `(error as Error).message`,
`scan.signature`, or a formatted scanner dump at any of the three sites
would compile today and persist raw scanner signature/exception text into
columns that survive in PostgreSQL backups and restore drills and are served
to every future reader through `UploadStatus.failure`, `DurableJob` reads,
and dead-letter evidence. That is the exact inversion prompts 75/76/83
eliminated for the sibling code/signature surfaces in the same three writes;
this prompt closes it for the message surface at the type level with zero
runtime behavior change.

Today the three sites produce exactly this one literal and no other
rejection message (verify by reading `:255–334` — do not cite it from
memory). Specs assert the identical literal at six sites
(`upload-worker.service.spec.ts:487`, `:513`, `:521`, `:555`, `:565`,
`:573` — verify exact line numbers from the file, do not cite them from
memory). Do NOT add, remove, or reword any asserted value.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 6 definition (§7, storage/queues/worker and
  its skill manifest) with §§16–22 confirming 12E–12K committed; §1 rule
  that open numeric limits need real input and must not be invented (why no
  new message value appears here — only narrowing to the existing produced
  literal).
- `docs/backend.md` — the worker-behavior paragraph (lines ~2111–2139: the
  `WORKER_EXCEPTION_MESSAGE` fixed-literal sentences, the infected-scan
  `'infected'` bound, the `ScanResult.errorCode` fixed union, and the four
  rejected-path code writes narrowed to `RejectedScanCode`); the owning
  record for the doc update. Resolve the exact paragraph lines from the
  file — do not cite line numbers from memory.
- `server/src/worker/upload-worker.service.ts` (389 lines; read 28–37 for
  the `WORKER_EXCEPTION_MESSAGE` const + `RejectedScanCode` placement to
  mirror, 255–283 for the rejected-scan `tx.upload.update` write with
  `failureMessage` at `:274`, 298–334 for the `tx.durableJob.update`
  `lastErrorMessage` at `:316–319` and the `tx.jobDeadLetter.create`
  `reasonMessage` at `:330`, 336–380 for `finalizeException()` with
  `WORKER_EXCEPTION_MESSAGE` at `:367` / `:375` untouched, 108–120 for the
  `lastErrorMessage: null` queued writes untouched) — the producer, the
  single-file matrix, and the open three-site carrier (narrowed by this
  prompt).
- `server/src/scanner/scanner.port.ts` (lines 1–11, the fixed
  `ScanErrorCode` 4-member union and the `ScanResult` shape with
  `signature` / `errorCode`) — the already-narrowed code surface, untouched.
- `server/src/worker/upload-worker.service.spec.ts` (rejected-scan
  assertions at ~480–576: infected-path `failureMessage` / `lastErrorMessage`
  / `reasonMessage` plus `not.toContain` signature-leak guards, and the
  `object_missing`-path triple; `WORKER_EXCEPTION_MESSAGE` assertions at
  ~630–696 untouched) — existing coverage that must stay green.
- `prompts/91-region-mapping-message-narrowing.md` (producer-narrowing
  pattern, constant-placement rule, and negative-probe procedure to mirror),
  `prompts/83-*.md` (same-file `RejectedScanCode` lineage),
  `prompts/76-*.md` / `prompts/75-*.md` (same-file signature/message
  lineage premise).
- Verified closed this session, no change: `WORKER_EXCEPTION_MESSAGE`
  narrowed by prompt 75 (exception path); `scanResult` bounded by prompt 76
  (`'infected'` status); `RejectedScanCode` narrowed by prompt 83 (all three
  rejected-path codes); `OutboxService` retry/dead-letter narrowed by prompt
  84; `JobRunsService.finish()` narrowed by prompt 85; ingestion
  `fail()` / `validation_failed` narrowed by prompts 80/81; analytics
  `invalidValue()` / `parsePeriod()` / `validateMapping()` /
  `malformedMetricMappingIssues()` narrowed by prompts 86/88/89/90;
  ingestion private `validateMapping()` narrowed by prompt 91.

## Measurements and procedures (no eyeballed numbers)

No comp measurement is involved (server-only, type-only change). The
normative matrix is derived from the existing code:

| producer / value | value today | after |
| --- | --- | --- |
| 3 rejected-scan messages (`Upload.failureMessage`, `DurableJob.lastErrorMessage`, `JobDeadLetter.reasonMessage`) | any `string` compiles (the gap); runtime values are the single fixed literal | only the single fixed literal compiles (`as const` constant with a `typeof` single-member type, mirroring the `WORKER_EXCEPTION_MESSAGE` placement at `:34–35`) |
| `RejectedScanCode` codes at the same 3 sites | already narrowed (`ScanErrorCode \| 'infected' \| 'failed'`) | unchanged |
| `WORKER_EXCEPTION_MESSAGE` exception path (`:367` / `:375`) | fixed const | unchanged |
| `scanResult` / `scanStatus` / `failureCode` / `lastErrorCode` / `reasonCode` | already narrowed | unchanged |
| `lastErrorMessage: null` queued writes (`:110`, `:180`) and cancelled-path nulls (`:300–318`) | null | unchanged |
| read shapes (`uploads.service.ts` `toStatus`, `ingestion.service.ts` `toRunSummary`, `reports.service.ts` `toExport`) | `string \| null` | unchanged — wire/read shapes, no contract change |
| server log line (`:258–260`, carries `scan.status/signature/errorCode`) | log-only, deliberately raw for operators | unchanged — logs are not durable columns |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: assign a `string`-typed variable (e.g. a `String(raw)` value)
to the new narrowed message location, confirm `tsc` rejects it, quote the
error, then revert the probe. The probe is not committed. State the guard
honestly: the three Prisma `data` inputs still type as `string`, so the
narrowed intermediate is what rejects the arbitrary string — a future edit
that bypasses the intermediate and inlines `String(raw)` directly into the
Prisma `data` object would still compile, and review must keep all three
sites routed through the const. Do not claim a Prisma-level rejection the
generated client does not provide.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SDL shape,
  permission, purge behavior, scan math (`scanBuffer` untouched), queue
  behavior, outbox behavior, or schedule change. Rejected scans behave
  byte-identically; the three durable messages carry the same string as
  today, now routed through one const-typed location.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify with
  `npm run contracts:check` and state that it passes unchanged
  (rejection messages are not a wire-contract literal; the read values stay
  strings).

## Implementation steps

1. `server/src/worker/upload-worker.service.ts`: extract the rejected-scan
   literal into an `as const` constant (e.g. `REJECTED_SCAN_MESSAGE`, placed
   at module top beside `WORKER_EXCEPTION_MESSAGE` at lines 34–35,
   mirroring that placement) with a `typeof` single-member type (e.g.
   `type RejectedScanMessage = typeof REJECTED_SCAN_MESSAGE`), and route
   all three writes (`:274`, `:316–319`, `:330`) through it via a narrowed
   intermediate so the negative probe rejects an arbitrary `string`. If any
   site needs a cast — e.g. a message is not exactly this literal — stop:
   the single-member premise is wrong and the premise of this prompt is
   broken. Leave `WORKER_EXCEPTION_MESSAGE`, `RejectedScanCode`,
   `ScanErrorCode`, `scanResult` / `scanStatus` / `failureCode` /
   `lastErrorCode` / `reasonCode`, the null writes, the server log line, and
   the `finalizeException()` path untouched. If the narrow rewrite requires
   touching any of those, stop — the premise is broken.
2. Spec expectations: no changes expected (specs assert the identical
   literal; only move to a const import if the implementation exports one).
   If any spec asserts a message literal, keep the identical literal; do NOT
   add, remove, or reword any asserted value. If any spec reaches the
   rejected path with a raw string (verified absent — specs assert the fixed
   literal and `not.toContain` raw signature/path guards — but re-verify),
   re-point it at the fixed const rather than enshrining it; if re-pointing
   changes asserted behavior, stop and explain.
3. Run the temporary negative probe from the matrix above; quote the `tsc`
   rejection; revert the probe before staging.
4. Docs in the same change: `docs/backend.md` — one clause beside the
   prompt 75/76/83 narrowing sentences recording that the three
   rejected-scan message writes accept only the single fixed literal
   (compile-time guard via the narrowed intermediate; runtime values
   unchanged; raw scanner signature/exception text never reaches the durable
   message columns via this producer; server-log line unchanged). No new
   semantics; say so in the summary.
5. Then the §2.1 two-stage review loop (`requesting-code-review` subagent
   with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
   verification) and the `caveman-commit` message.

## Non-goals

- No new message text, code, severity, or payload shape.
- No `WORKER_EXCEPTION_MESSAGE` change (prompt 75 owns the exception
  surface; verify it stays green).
- No `scanResult` / `ScanErrorCode` / `RejectedScanCode` change (prompts
  76/83 own those surfaces; verify they stay green).
- No server-log change (`:258–260` stays the operator-diagnostic path that
  deliberately carries signature/error detail; logs are not durable
  columns).
- No `finalizeException()` change (exception `DurableJob` + dead-letter
  writes stay on `WORKER_EXCEPTION_MESSAGE`).
- No schema or migration change: the `Upload`, `DurableJob`, and
  `JobDeadLetter` tables are untouched; only the TypeScript producer
  narrows.
- No permission change.
- No `JobRun` self-retention purge (prompts 79/84/85 name it: five ticks
  write ≥ five rows an hour with no reclamation, but the window is an
  explicit open operator decision per `docs/operations.md`
  `data_retention_policy`; build-plan §1 forbids inventing it).
- No live Docker drills (restart/orphan/Garage/Valkey/ClamAV remain future
  operational work per prompts 72–84).
- No ingestion `fail()` / `validation_failed` / export / outbox / job-run /
  parser-executor / observation-quality / mapping-shape / region-mapping
  failure-code change (prompts 73/74/80–91 own those surfaces; verify they
  stay green).

## Reference deltas

None visual (server-only). The one deliberate property delta, stated so it
is not mistaken for a regression: code that previously compiled when
producing a rejected-scan durable message through the narrowed intermediate
with an arbitrary string no longer compiles. No committed runtime path
changes value, order, or shape. The Prisma `data` inputs themselves still
type as `string` — the guard lives at the narrowed intermediate, not in the
generated client, and review keeps all three sites routed through it.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State this
in the completion summary; do not run browser suites for this change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1 generation) —
  including the temporary negative probe rejection, quoted, then reverted.
- Targeted server suite: `upload-worker.service.spec.ts` (all rejected-scan
  assertions: infected triple, `object_missing` triple, signature-leak
  `not.toContain` guards, `WORKER_EXCEPTION_MESSAGE` cases) plus
  `outbox.service.spec.ts` and `job-runs.service.spec.ts`, then the full
  `npm run test:server` — do not claim the full suite from a targeted run.
- `npm run contracts:check` (expected: passes unchanged; if it fails, stop —
  no contract artifact should move for this change).
- `git diff --check` and `git status --short` review; stage only approved
  files.
- Then the §2.1 two-stage review loop (`requesting-code-review` subagent with
  BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
  verification) and the `caveman-commit` message.
- Record the result in `docs/backend.md` in the same change.

## SKILLS USED

- `architecture-patterns` — const/type placement beside the module producer
  vs the Prisma `string` inputs (no new module edges; mirrors the
  `WORKER_EXCEPTION_MESSAGE` layering).
- `nestjs-best-practices` — no provider, wiring, module, or service-shape
  change.
- `security-best-practices` — durable-column sanitization; raw scanner
  signature and exception text never reach persisted rejection messages via
  this producer.
- `error-handling-patterns` — fixed rejected-scan taxonomy preserved;
  compile-time guard so verbatim scanner text can never reach the three
  durable message columns through the narrowed intermediate (fail-fast at
  the type level).
- `javascript-testing-patterns` — existing worker specs stay green in
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
  boundary change — worker isolation is unchanged).
