# 83 — narrow `ScanResult.errorCode` to the fixed scan-error union

## Scope, and why it is next

The committed repository is on `main` at `857d55e`
(`refactor(reports): narrow export failure write`). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
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
literals), and 82 (`ExportFailure` narrowed to the fixed export failure
union).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 6 (storage, queues, worker, and secure
uploads), with a Phase 12 operations record, dependency-safe against prompts
68–82 (no schema, migration, contract, route, permission, or version-marker
change).

The gap is the last `string`-typed write into durable failure columns on the
upload scan surface. `ScanResult` in `server/src/scanner/scanner.port.ts`
(lines 1–5):

```ts
export interface ScanResult {
  readonly status: 'clean' | 'infected' | 'failed';
  readonly signature?: string;
  readonly errorCode?: string;
}
```

types `errorCode` as free-text `string`, and `UploadWorkerService.process` in
`server/src/worker/upload-worker.service.ts` persists `scan.errorCode ??
scan.status` verbatim into four durable columns on the rejected path:

- line 263–266 (`Upload.scanResult`, non-`infected` arm):
  `scan.status === 'infected' ? 'infected' : (scan.errorCode ?? scan.status)`;
- line 267 (`Upload.failureCode`): `scan.errorCode ?? scan.status`;
- lines 303–308 (`DurableJob.lastErrorCode`):
  `(scan.errorCode ?? scan.status)`;
- line 320 (`JobDeadLetter.reasonCode`): `scan.errorCode ?? scan.status`.

Today every producer passes bounded values — the adapter's
`'scanner_unavailable'` / `'scanner_timeout'` / `'scanner_error'`
(`clamav-scanner.adapter.ts`, lines 26, 30, 62), the worker-synthesized
`'object_missing'` (line 225), and the `'infected'` / `'failed'` status
fallbacks — and prompt 76 proved the neighbours are already fixed (the three
`'Upload did not pass malware scanning.'` messages, the `'clean'` /
`'infected'` `scanResult` arms, `scanStatus`). But the port signature permits
any future scanner implementation (or mock) to persist raw daemon text,
endpoint detail, or storage-key material into the same durable columns that
survive in PostgreSQL backups, restore drills, and reconciliation evidence.
That is the exact inversion prompts 80–82 eliminated on the ingestion/export
surfaces; this prompt closes it at the type level with zero runtime behavior
change.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 6 definition (§7, queue/worker/scan surface)
  with its skill manifest; §§16–22 confirming 12E–12K committed; §1 rule
  that open numeric limits need real input and must not be invented (why no
  new code/message value appears here — only narrowing to existing ones).
- `docs/backend.md` — worker behavior paragraph (lines 2117–2123: the
  `WORKER_EXCEPTION_MESSAGE` fixed-message clause and the infected-scan
  `scanResult` bounded-`'infected'` clause); the owning record for the
  one-clause doc update.
- `server/src/scanner/scanner.port.ts` (12 lines, full file) — the gap:
  `readonly errorCode?: string` at line 4; `status` already bounded.
- `server/src/scanner/clamav-scanner.adapter.ts` (63 lines, full file) —
  the three bounded producers at lines 26 (`scanner_unavailable`), 30
  (`scanner_timeout`), 62 (`scanner_error`); `parseScanResponse` keeps
  returning `signature` for the infected path (prompt-76 boundary stands —
  the adapter is untouched).
- `server/src/worker/upload-worker.service.ts` (380 lines, full file) —
  the four tenant/durable writes above (lines 225, 258–271, 292–325); the
  log-only line 256 (`scan.signature ?? scan.errorCode ?? scan.status`
  inside `logger.warn`, deliberately untouched — logs are the intended
  server-log-only home for raw daemon text); the `WORKER_EXCEPTION_MESSAGE`
  fixed path at lines 338–371 (prompt 75, untouched); the clean branch at
  lines 236–247 (untouched).
- `server/src/worker/upload-worker.service.spec.ts` (lines 420–530) —
  existing runtime coverage that must stay green unchanged: the clean case
  (line 426, `scanResult: 'clean'`), the infected case (lines 460–529,
  asserting `scanResult`/`failureCode`/`lastErrorCode`/`reasonCode`
  `'infected'` plus the fixed message and the logger-signature assertion),
  and the missing-object case (lines ~540–580, asserting bounded
  `'object_missing'`).
- `server/src/uploads/uploads.service.ts` (lines 343–374, `toStatus`) —
  proves the served tenant read shape (`failure: { code, message } | null`
  from `string | null` row fields) is unchanged by this write-side
  type-only change.
- `server/src/common/api-exception.filter.ts` and
  `server/src/graphql/graphql-error.filter.ts` — unknown throws already map
  to fixed `INTERNAL_ERROR` on both transports, so no envelope/filter
  change is needed or authorized here.

## Measurements and procedures (no eyeballed numbers)

No comp measurement is involved (server-only, type-only change). The
normative matrix is derived from the existing code:

| producer / writer | value today | after |
| --- | --- | --- |
| adapter line 26 | `'scanner_unavailable'` | identical, now type-checked |
| adapter line 30 | `'scanner_timeout'` | identical, now type-checked |
| adapter line 62 | `'scanner_error'` | identical, now type-checked |
| worker line 225 (null buffer) | `'object_missing'` | identical, now type-checked |
| infected fallback (`scan.status`) | `'infected'` | identical, now type-checked |
| failed fallback (`scan.status`, errorCode absent) | `'failed'` | identical, now type-checked |
| any other `errorCode` string | compiles today (the gap) | rejected by `tsc` |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: assign a `string`-typed variable (e.g. a raw daemon fragment
or `error.message`) to `errorCode` in a `ScanResult` literal, or pass it as
`scan.errorCode` into one of the four write positions, confirm `tsc`
rejects it, quote the error, then revert the probe. The probe is not
committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SSE
  shape, GraphQL type, permission, `StoredObject` write, progress-event
  write, or served `failure.code`/`failure.message` value changes. `GET
  /uploads/:uploadId`, `GET /uploads/:uploadId/events`,
  `GET /uploads/:uploadId/download`, and `GET /jobs/runs` behave
  byte-identically.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify
  with `npm run contracts:check` and state that it passes unchanged
  (`scanResult`/`scanStatus` are not part of `UploadStatus` or any DTO).

## Implementation steps

1. `server/src/scanner/scanner.port.ts`: next to `ScanResult`, add
   `export type ScanErrorCode = 'object_missing' | 'scanner_unavailable' |
   'scanner_timeout' | 'scanner_error';`
   and narrow the port to `readonly errorCode?: ScanErrorCode;`.
   The port module is the neutral home both the adapter and the worker
   already depend on (no new shared module for one union — cf. the
   prompt-79 layering note). `status` stays exactly as today.
2. `server/src/scanner/clamav-scanner.adapter.ts`: the three literals at
   lines 26, 30, 62 must compile unchanged with no casts. If any needs a
   cast, stop — the union is wrong and the premise of this prompt is
   broken. Do NOT touch `parseScanResponse`'s `signature` capture, socket
   handling, timeouts, or readiness.
3. `server/src/worker/upload-worker.service.ts`: type the four write
   positions through the narrowed union (e.g. a module-local
   `type RejectedScanCode = ScanErrorCode | 'infected' | 'failed';`
   annotating `scanResult` (non-clean arm), `failureCode`,
   `lastErrorCode`, and `reasonCode`, so a future `string` assignment
   fails compilation). Line 225's `as const` object must keep compiling
   with no cast. Values, fallbacks (`?? scan.status`), predicates,
   transaction boundaries (`organizationScoped` terminal-state unit plus
   `workerScoped` durable/dead-letter unit), state machine
   (`rejected` + `failed` durable + dead letter), and progress events stay
   exactly as today.
4. Do NOT touch the log-only line 256 (raw signature belongs in server
   logs — prompt-76 rule stands), the clean branch (lines 236–247),
   `scanStatus`, any of the three fixed `'Upload did not pass malware
   scanning.'` messages, `finalizeException` / `WORKER_EXCEPTION_MESSAGE`
   (prompt 75), outbox dispatch (`queue_unavailable`), `toStatus`, or the
   purge ticks (prompt 79). If the narrow rewrite requires touching any
   of those, stop — the premise is broken.
5. Run the temporary negative probe from the matrix above; quote the
   `tsc` rejection; revert the probe before staging.
6. Existing specs (clean / infected / missing-object worker cases; the
   scanner has no dedicated spec — check before creating one) must pass
   unchanged in expectation. No new runtime test is required — the runtime
   behavior is already pinned (prompt 76 tightened the infected
   assertions); the new property is the port/worker signature itself,
   verified by `typecheck` plus the probe.
7. Docs in the same change: `docs/backend.md` worker-behavior paragraph
   (lines 2117–2123) — one clause recording that `ScanResult.errorCode`
   accepts only the fixed `object_missing` / `scanner_unavailable` /
   `scanner_timeout` / `scanner_error` union and the four rejected-path
   writes accept only that union plus the `'infected'` / `'failed'`
   status fallbacks (compile-time guard; runtime values unchanged).
   `docs/operations.md` untouched (no purge/cadence change); say so in
   the summary.

## Non-goals

- No new error code, message, envelope, or `ApiException` factory.
- No scanner-port `status` change, no `signature` removal, no ClamAV
  adapter socket/timeout/parser change.
- No schema or migration change: the `Upload` / `DurableJob` /
  `JobDeadLetter` columns are untouched; only TypeScript types narrow.
- No `JobRun` self-retention purge (prompts 79/81/82 name it: five ticks
  write ≥ five rows an hour with no reclamation, but the window is an
  explicit open operator decision per `docs/operations.md`
  `data_retention_policy`; build-plan §1 forbids inventing it).
- No live Docker drills (restart/orphan/Garage/Valkey/ClamAV remain
  future operational work per prompts 72–82).
- No ingestion/export failure-code change (prompts 80–82 own those
  surfaces; verify they stay green).

## Reference deltas

None visual (server-only). The one deliberate property delta, stated so
it is not mistaken for a regression: code that previously compiled when
passing an arbitrary string as `ScanResult.errorCode` (or into the four
rejected-path code columns) no longer compiles. No committed runtime path
changes value, order, or shape.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State
this in the completion summary; do not run browser suites for this
change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1
  generation) — including the temporary negative probe rejection,
  quoted, then reverted.
- Targeted server suite: `upload-worker.service.spec.ts` (clean /
  infected / missing-object cases), then the full `npm run test:server` —
  do not claim the full suite from a targeted run.
- `npm run contracts:check` (expected: passes unchanged; if it fails,
  stop — no contract artifact should move for this change).
- `git diff --check` and `git status --short` review; stage only
  approved files.
- Then the §2.1 two-stage review loop (`requesting-code-review` subagent
  with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
  verification) and the `caveman-commit` message.
- Record the result in `docs/backend.md` in the same change.

## SKILLS USED

- `architecture-patterns` — sanitization placement at the persistence call
  site vs the scanner port contract (port narrows, adapter untouched).
- `nestjs-best-practices` — union/type placement in the existing port and
  injectable; no service wiring, module, or provider change.
- `security-best-practices` — durable-column sanitization; raw daemon text
  stays server-log-only, never in persisted columns awaiting a future
  reader.
- `error-handling-patterns` — fixed scan-failure taxonomy preserved;
  compile-time guard so raw text can never reach the four durable code
  columns (fail-fast at the type level, originals stay log-only).
- `javascript-testing-patterns` — existing clean/infected/missing-object
  worker specs stay green unchanged; negative type-probe procedure.
- `requesting-code-review` — Stage 1 reviewer subagent dispatch after
  self-verification (§2.1).
- `receiving-code-review` — Stage 2 technical evaluation of review
  feedback before any fix.
- `caveman-commit` — the commit message (ALWAYS rule, §3/§7).
- Loaded and deliberately not used: `postgres-best-practices` /
  `sql-optimization-patterns` (no migration, column, or query-plan
  change), `api-design-principles` / `openapi-spec-generation` (no
  contract change — verified by `contracts:check`),
  `e2e-testing-patterns` / `playwright` (server-only change, no browser
  surface), `security-threat-model` (no trust boundary change;
  sanitization lineage already proven in prompts 72–82).
