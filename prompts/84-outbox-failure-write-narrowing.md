# 84 — narrow `OutboxService` retry/dead-letter writes to the fixed dispatch-exhausted union

## Scope, and why it is next

The committed repository is on `main` at `4c1b291`
(`refactor(worker): narrow scan error code union`). All 12 ordered phases in
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
literals), 82 (`ExportFailure` narrowed to the fixed export failure union),
and 83 (`ScanResult.errorCode` narrowed to the fixed scan-error union plus
`'infected'` / `'failed'` status fallbacks).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 6 (storage, queues, worker, and secure
uploads), with a Phase 12 operations record, dependency-safe against prompts
68–83 (no schema, migration, contract, route, permission, or version-marker
change).

The gap is the last `string`-typed write pair into durable outbox failure
columns. `OutboxService` in `server/src/outbox/outbox.service.ts`:

- line 103 (`markRetry`): `async markRetry(id: string, code: string)` persists
  `code` verbatim into `OutboxEvent.lastErrorCode` (line 109);
- lines 118–125 (`markDeadLetter` input): `reasonCode: string; reasonMessage:
  string` are persisted verbatim into `OutboxEvent.lastErrorCode` (line 132)
  and `JobDeadLetter.reasonCode` / `reasonMessage` (lines 141–142).

Today the sole production caller passes one bounded pair — the dispatch
exhaustion path in `server/src/worker/upload-worker.service.ts`, lines
134–145:

```ts
await this.outbox.markDeadLetter(event.id, {
  organizationId: event.organizationId,
  reasonCode: 'queue_unavailable',
  reasonMessage: 'Outbox dispatch attempts exhausted.',
  payload: event.payload,
});
// else branch:
await this.outbox.markRetry(event.id, 'queue_unavailable');
```

The port signatures permit any future caller (or mock) to persist raw queue
endpoint detail, payload excerpts, or storage-key material into the same
durable columns that survive in PostgreSQL backups, restore drills, and
reconciliation evidence. That is the exact inversion prompts 80–83
eliminated on the ingestion/export/scan surfaces; this prompt closes it at
the type level with zero runtime behavior change.

The existing spec exercises a second pair — `'payload_malformed'` /
`'Event payload was corrupted.'` in `server/src/outbox/outbox.service.spec.ts`,
lines 231–247 (nullable-organization dead-letter case). `git log -S
"payload_malformed"` proves it has no production producer: it was introduced
in `4dd9060` as a test-only fixture to prove nullable-org handling, not a
second runtime path. This prompt does NOT enshrine those spec-only literals
(build-plan §1 forbids inventing values). The nullable-org case is re-pointed
at the single fixed pair, which still proves nullable handling.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 6 definition (§7, outbox/queue/worker surface)
  with its skill manifest; §§16–22 confirming 12E–12K committed; §1 rule
  that open numeric limits need real input and must not be invented (why no
  new code/message value appears here — only narrowing to the existing
  produced pair).
- `docs/backend.md` — storage/queue/worker record (§15, lines 2037–2120),
  specifically the worker-behavior paragraph (lines 2109–2133: the
  `WORKER_EXCEPTION_MESSAGE` fixed-message clause, the infected-scan bounded
  clause, the `ScanErrorCode` compile-time-guard clause from prompt 83, and
  the outbox `dead_lettered` sentence `Outbox dispatch attempts that exhaust
  their configured maximum are marked 'dead_lettered' ... instead of
  remaining stuck in 'retrying'`); the owning record for the one-clause doc
  update.
- `server/src/outbox/outbox.service.ts` (148 lines, full file) — the gap:
  `code: string` at line 103; `reasonCode: string; reasonMessage: string` at
  lines 122–123; the three durable writes at lines 109, 132, 141–142.
- `server/src/worker/upload-worker.service.ts` (lines 100–151, dispatch
  section) — the sole production caller at lines 137–145 with the fixed
  `'queue_unavailable'` / `'Outbox dispatch attempts exhausted.'` pair; the
  `queue_unavailable` retry at line 144. The scan `process()` path (lines
  153+), `WORKER_EXCEPTION_MESSAGE` path (prompt 75), and purge ticks
  (prompt 79) are untouched.
- `server/src/outbox/outbox.service.spec.ts` (249 lines, full file) — existing
  coverage that must stay green in expectation: `markRetry` (lines 174–198,
  asserting `lastErrorCode: 'queue_unavailable'` plus backoff timing),
  `markDeadLetter` fixed-pair case (lines 200–229), and the nullable-org case
  (lines 231–247, currently using the spec-only `payload_malformed` pair —
  the one spec edit this prompt authorizes, re-pointing it at the fixed
  pair).
- `server/src/worker/upload-worker.service.spec.ts` (lines 270–310) —
  dispatch-exhaustion assertions (`markRetry` called with
  `'queue_unavailable'`; `markDeadLetter` called with the fixed pair) that
  must stay green unchanged.
- `server/src/common/api-exception.filter.ts` and
  `server/src/graphql/graphql-error.filter.ts` — unknown throws already map
  to fixed `INTERNAL_ERROR` on both transports, so no envelope/filter
  change is needed or authorized here.

## Measurements and procedures (no eyeballed numbers)

No comp measurement is involved (server-only, type-only change). The
normative matrix is derived from the existing code:

| producer / writer | value today | after |
| --- | --- | --- |
| worker line 139–140 (dead letter) | `'queue_unavailable'` / `'Outbox dispatch attempts exhausted.'` | identical, now type-checked |
| worker line 144 (retry) | `'queue_unavailable'` | identical, now type-checked |
| `OutboxEvent.lastErrorCode` via `markRetry` | any `string` compiles (the gap) | only the fixed code compiles |
| `OutboxEvent.lastErrorCode` / `JobDeadLetter.reasonCode`+`reasonMessage` via `markDeadLetter` | any `string` compiles (the gap) | only the fixed pair compiles |
| spec-only `'payload_malformed'` / `'Event payload was corrupted.'` | compiles today (no producer) | rejected by `tsc`; spec re-pointed at fixed pair, not enshrined |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: assign a `string`-typed variable (e.g. a raw queue error
fragment or `error.message`) to `markRetry`'s `code` or to
`markDeadLetter`'s `reasonCode`/`reasonMessage`, confirm `tsc` rejects it,
quote the error, then revert the probe. The probe is not committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SSE
  shape, GraphQL type, permission, `StoredObject` write, progress-event
  write, or served status value changes. `POST /api/v1/uploads`,
  `GET /uploads/:uploadId`, `GET /uploads/:uploadId/events`,
  `GET /exports/:exportId/events`, and `GET /jobs/runs` behave
  byte-identically.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify
  with `npm run contracts:check` and state that it passes unchanged
  (outbox codes are not part of any DTO).

## Implementation steps

1. `server/src/outbox/outbox.service.ts`: next to `ClaimedOutboxEvent`, add
   `export const OUTBOX_DISPATCH_EXHAUSTED_CODE = 'queue_unavailable' as
   const;` and `export const OUTBOX_DISPATCH_EXHAUSTED_MESSAGE = 'Outbox
   dispatch attempts exhausted.' as const;`, plus `export type
   OutboxFailureCode = typeof OUTBOX_DISPATCH_EXHAUSTED_CODE;` and
   `export type OutboxFailureMessage = typeof
   OUTBOX_DISPATCH_EXHAUSTED_MESSAGE;`. Narrow `markRetry` to
   `async markRetry(id: string, code: OutboxFailureCode)` and
   `markDeadLetter` input to `{ organizationId: string | null;
   reasonCode: OutboxFailureCode; reasonMessage: OutboxFailureMessage;
   payload?: unknown; }`. Keep the constants in the outbox module both the
   worker and the specs already depend on (no new shared module for one
   pair — cf. the prompt-79/83 layering note). Values, fallbacks,
   transaction boundaries (`workerScoped` dispatch/dead-letter unit),
   `nextAttemptAt` backoff, lease clearing, and payload pass-through stay
   exactly as today.
2. `server/src/worker/upload-worker.service.ts`: the two call sites at lines
   137–145 must compile unchanged with no casts. If either needs a cast,
   stop — the union is wrong and the premise of this prompt is broken. Do
   NOT touch the log-only line 135 (`Outbox dispatch failed: ...` inside
   `logger.warn`, deliberately untouched — logs are the intended
   server-log-only home for raw queue text), the `markDispatched` path,
   the scan `process()` branches, `finalizeException` /
   `WORKER_EXCEPTION_MESSAGE` (prompt 75), `toStatus`, or the purge ticks
   (prompt 79). If the narrow rewrite requires touching any of those,
   stop — the premise is broken.
3. `server/src/outbox/outbox.service.spec.ts`: re-point ONLY the
   nullable-org case (lines 231–247) at the fixed pair
   (`reasonCode: 'queue_unavailable'`, `reasonMessage: 'Outbox dispatch
   attempts exhausted.'`), keeping the `organizationId: null` and
   `payload: undefined` assertions that prove nullable handling. All other
   expectations (retry backoff timing, dead-letter fixed-pair case,
   `workerScoped` call assertions) stay unchanged. Do NOT enshrine
   `payload_malformed` anywhere in production code.
4. `server/src/worker/upload-worker.service.spec.ts`: must stay green
   unchanged in expectation (dispatch-exhaustion assertions already pin
   the fixed pair). No edit expected; if one is required, stop and explain.
5. Run the temporary negative probe from the matrix above; quote the
   `tsc` rejection; revert the probe before staging.
6. Docs in the same change: `docs/backend.md` worker-behavior paragraph
   (lines 2109–2133) — one clause recording that `markRetry` accepts only
   the fixed `queue_unavailable` code and `markDeadLetter` accepts only
   the fixed `queue_unavailable` / `'Outbox dispatch attempts exhausted.'`
   pair (compile-time guard; runtime values unchanged; raw queue text
   stays server-log-only). `docs/operations.md` untouched (no
   purge/cadence change); say so in the summary.

## Non-goals

- No new error code, message, envelope, or `ApiException` factory.
- No `payload_malformed` production path: the spec-only literals are
  removed from the asserted surface, not promoted.
- No schema or migration change: the `OutboxEvent` / `JobDeadLetter`
  columns are untouched; only TypeScript types narrow.
- No `JobRun` self-retention purge (prompts 79/81/82 name it: five ticks
  write ≥ five rows an hour with no reclamation, but the window is an
  explicit open operator decision per `docs/operations.md`
  `data_retention_policy`; build-plan §1 forbids inventing it).
- No live Docker drills (restart/orphan/Garage/Valkey/ClamAV remain
  future operational work per prompts 72–83).
- No ingestion/export/scan failure-code change (prompts 80–83 own those
  surfaces; verify they stay green).

## Reference deltas

None visual (server-only). The one deliberate property delta, stated so
it is not mistaken for a regression: code that previously compiled when
passing an arbitrary string as the outbox retry code or dead-letter
reason pair no longer compiles. No committed runtime path changes value,
order, or shape.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State
this in the completion summary; do not run browser suites for this
change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1
  generation) — including the temporary negative probe rejection,
  quoted, then reverted.
- Targeted server suite: `outbox.service.spec.ts` plus
  `upload-worker.service.spec.ts` (dispatch-exhaustion cases), then the
  full `npm run test:server` — do not claim the full suite from a
  targeted run.
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
  site vs the outbox service contract (service narrows, worker caller
  untouched).
- `nestjs-best-practices` — const/type placement in the existing
  injectable; no service wiring, module, or provider change.
- `security-best-practices` — durable-column sanitization; raw queue text
  stays server-log-only, never in persisted columns awaiting a future
  reader.
- `error-handling-patterns` — fixed dispatch-exhaustion taxonomy
  preserved; compile-time guard so raw text can never reach the three
  durable outbox/dead-letter columns (fail-fast at the type level,
  originals stay log-only).
- `javascript-testing-patterns` — existing retry/dead-letter specs stay
  green in expectation; nullable-org case re-pointed at the fixed pair;
  negative type-probe procedure.
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
  sanitization lineage already proven in prompts 72–83).
