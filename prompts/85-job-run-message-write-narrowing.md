# 85 — narrow `JobRunsService.finish()` message to the fixed job-run message union

## Scope, and why it is next

The committed repository is on `main` at `3627199`
(`refactor(outbox): narrow failure write union`). All 12 ordered phases in
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
83 (`ScanResult.errorCode` narrowed to the fixed scan-error union plus
`'infected'` / `'failed'` status fallbacks), and 84 (`OutboxService`
retry/dead-letter writes narrowed to the fixed dispatch-exhausted union).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 6 (storage, queues, worker, and secure
uploads — the scheduled-job durability surface, continuing the prompt 77/79
lineage), with a Phase 12 operations record, dependency-safe against prompts
68–84 (no schema, migration, contract, route, permission, or version-marker
change).

The gap is the last `string`-typed write into a durable failure/message
column. Prompt 77 sanitized every scheduled-job caller to fixed strings but
deliberately left the writer open — its own record states "the fix belongs at
the job call sites, not in this writer" (`prompts/77`, reference section).
Prompts 80–84 then established the second half of that pattern: narrow the
writer/port signature itself so a future caller cannot reintroduce verbatim
persistence. `JobRunsService.finish()` in
`server/src/jobs/job-runs.service.ts`, lines 24–28, still declares:

```ts
async finish(
  id: string,
  status: Exclude<JobRunStatus, 'running'>,
  message?: string,
): Promise<void> {
```

Any future caller (or mock) can pass `describe(error)` — raw Prisma,
connection, or transaction internals — into the durable `JobRun.message`
column, which survives in PostgreSQL backups, restore drills, and is served
verbatim through `listRecent` (`job-runs.service.ts:39–53`) and
`GET /api/v1/jobs/runs` (owner/admin-gated since prompt 78, but still a
durable row awaiting every future reader). That is the exact inversion
prompts 80–84 eliminated on the ingestion/export/scan/outbox surfaces; this
prompt closes it at the type level with zero runtime behavior change.

Today's 10 `finish()` call sites (the complete set — a repo-wide search for
`\.finish\(` returns only these) produce exactly 10 values:

Succeeded (count templates, all interpolations are `number` — verified below):

| call site | value today |
| --- | --- |
| `session-maintenance.job.ts:59` | `` `purged ${purged} session(s)` `` (`purged: number` from `SessionsService.purgeExpired(): Promise<number>`, `sessions.service.ts:96`) |
| `retention-maintenance.job.ts:95` | `` `purged ${count} expired upload(s)` `` (`count = expired.length: number`) |
| `retention-maintenance.job.ts:139` | `` `purged ${count} expired idempotency record(s)` `` (`count: number` from `deleteMany().count`) |
| `retention-maintenance.job.ts:216` | `` `purged ${tokenResult.count} token(s) and ${invitationResult.count} invitation(s)` `` (both `count: number`) |
| `retention-maintenance.job.ts:354` | `` `purged ${count} expired export artifact(s)` `` (`count: number`) |

Failed (5 fixed constants, values unchanged since prompt 77):

| constant | value |
| --- | --- |
| `SESSION_PURGE_UNEXPECTED_FAILURE_MESSAGE` (`session-maintenance.job.ts:15–16`) | `'Session purge failed unexpectedly.'` |
| `UPLOAD_PURGE_UNEXPECTED_FAILURE_MESSAGE` (`retention-maintenance.job.ts:19–20`) | `'Upload purge failed unexpectedly.'` |
| `IDEMPOTENCY_PURGE_UNEXPECTED_FAILURE_MESSAGE` (`retention-maintenance.job.ts:21–22`) | `'Idempotency purge failed unexpectedly.'` |
| `TOKEN_PURGE_UNEXPECTED_FAILURE_MESSAGE` (`retention-maintenance.job.ts:23–24`) | `'Token purge failed unexpectedly.'` |
| `EXPORT_PURGE_UNEXPECTED_FAILURE_MESSAGE` (`retention-maintenance.job.ts:25–26`) | `'Export purge failed unexpectedly.'` |

No spec calls `finish()` directly with raw strings: both job specs mock
`JobRunsService` (`import type`) and assert the constants above
(`session-maintenance.job.spec.ts:96,117`;
`retention-maintenance.job.spec.ts:186,212,450,482,734,769,971,998`). There
is no `job-runs.service.spec.ts`. The `describe()` helpers in both job
modules stay log-only and are untouched.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 6 definition (§7, durable job/persistence
  surface) with its skill manifest; §§16–22 confirming 12E–12K committed; §1
  rule that open numeric limits need real input and must not be invented
  (why no new message value appears here — only narrowing to the existing
  produced set).
- `docs/backend.md` — jobs/`JobRun` record (the `GET /jobs/runs` route row,
  the sessions-purge paragraph, the retention paragraph recording the five
  fixed failure constants from prompt 77 and the 500-row bound from prompt
  79); the owning record for the doc update. Resolve the exact paragraph
  lines from the file — do not cite line numbers from memory.
- `docs/operations.md` — retention-jobs section (five hourly purges,
  `RETENTION_PURGE_BATCH_LIMIT`, `JobRun` audit table); confirms retention
  semantics, unchanged here; one clause records the compile-time guard.
- `server/src/jobs/job-runs.service.ts` (54 lines, full file) — the gap:
  `message?: string` at line 27, persisted verbatim at line 31, served
  verbatim by `listRecent` at lines 39–53.
- `server/src/jobs/session-maintenance.job.ts` (73 lines, full file) — the 2
  call sites (lines 59, 65), the constant (lines 15–16), the log-only
  `describe` (lines 71–73, untouched).
- `server/src/jobs/retention-maintenance.job.ts` (369 lines; succeeded writes
  at lines 92–96, 136–140, 213–217, 351–355; failure writes at lines
  101–103, 145–147, 224–226, 360–362; constants at lines 19–26; log-only
  `describe` at lines 367–369, untouched).
- `server/src/jobs/session-maintenance.job.spec.ts` (constant import at
  lines 7–9, assertions at 96/117) and
  `server/src/jobs/retention-maintenance.job.spec.ts` (constant imports at
  lines 9–13, assertions at 186/212/450/482/734/769/971/998) — existing
  coverage that must stay green; only import paths move (see step 2).
- `server/src/jobs/jobs.controller.ts` — `GET /api/v1/jobs/runs` owner/admin
  gate from prompt 78 (proves the read exposure is gated but the row is
  durable; no permission change ships here).
- `packages/shared/src/jobs.ts` — `JobRunSummary.message: string | null`
  (line 19; proves no contract-shape change — the read value stays a
  nullable string).
- `server/src/sessions/sessions.service.ts:96`
  (`purgeExpired(before?: Date): Promise<number>` — proves the session
  template arg is `number`).
- `prompts/77-job-run-failure-message-sanitization.md` (caller-side fix,
  "writer left open" premise), `prompts/79-retention-purge-batch-bounds.md`
  (shared-bound layering), `prompts/84-outbox-failure-write-narrowing.md`
  (writer-narrowing pattern and constant-placement rule to mirror).

## Measurements and procedures (no eyeballed numbers)

No comp measurement is involved (server-only, type-only change). The
normative matrix is derived from the existing code:

| writer / value | value today | after |
| --- | --- | --- |
| 5 succeeded templates | any `string` compiles (the gap) | only the 5 `` `purged ${number} …` `` template literals compile |
| 5 failure constants | fixed values, but any `string` compiles (the gap) | only the 5 fixed literals compile (`typeof` constants) |
| `JobRun.message` column / `JobRunSummary.message` | `string \| null` | unchanged — read shape, no contract change |
| spec-only raw strings (e.g. `'DB deadlock'`) | gone since prompt 77; specs assert constants | unchanged; only constant import paths move |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: pass a `string`-typed variable (e.g. `describe(error)`
output) as `finish()`'s `message`, confirm `tsc` rejects it, quote the
error, then revert the probe. The probe is not committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SSE
  shape, GraphQL type, permission, purge behavior, batch bound, schedule, or
  served status value changes. `GET /api/v1/jobs/runs` behaves
  byte-identically; all 10 success/failure messages are the same strings as
  today, now type-checked.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify
  with `npm run contracts:check` and state that it passes unchanged
  (`JobRunSummary.message` stays `string | null`).

## Implementation steps

1. `server/src/jobs/job-runs.service.ts`: move the 5 failure-message
   constants into this module (the writer module both job files already
   import — same layering rule as prompt 84's outbox placement, and it
   avoids a jobs→service→jobs import cycle that `typeof` imports would
   create). Export each constant with its existing identifier and value
   verbatim, plus `export type JobRunMessage =` the union of the 5
   `` `purged ${number} …` `` template literals (exact prefixes from the
   matrix above) and the 5 `typeof` constant types. Narrow `finish` to
   `message?: JobRunMessage`. `start`, `listRecent`, status values,
   `finishedAt`, metrics calls, and the `?? null` handling stay exactly as
   today.
2. `server/src/jobs/session-maintenance.job.ts` and
   `server/src/jobs/retention-maintenance.job.ts`: import the 5 constants
   from `./job-runs.service` alongside the existing `JobRunsService`
   import (same statement, zero new module edges) instead of defining them
   locally. All 10 call sites must compile unchanged with no casts. If any
   needs a cast — e.g. a count arg is not `number` — stop: the union is
   wrong and the premise of this prompt is broken. Do NOT touch the
   log-only `describe()` helpers, the `logger.error`/`logger.warn` lines
   (raw text stays server-log-only by design), the `start()`-throw early
   returns (never persist, no `runId` exists), purge queries, batch takes,
   or the controller. If the narrow rewrite requires touching any of
   those, stop — the premise is broken.
3. Spec import-path updates ONLY: `session-maintenance.job.spec.ts`
   (lines 7–9) and `retention-maintenance.job.spec.ts` (lines 9–13) import
   the constants from `./job-runs.service` instead of the job modules.
   All expectations (failure constants, `purged N …` success strings,
   backoff/timing, `workerScoped` assertions) stay unchanged. Do NOT add,
   remove, or reword any asserted value. If any spec calls `finish()`
   directly with a raw string (the pre-prompt-84-style case — verified
   absent, but re-verify), re-point it at the fixed set rather than
   enshrining it; if re-pointing changes asserted behavior, stop and
   explain.
4. Run the temporary negative probe from the matrix above; quote the
   `tsc` rejection; revert the probe before staging.
5. Docs in the same change: `docs/backend.md` jobs/`JobRun` paragraph —
   one clause recording that `finish()` accepts only the 5 count templates
   plus the 5 fixed failure literals (compile-time guard; runtime values
   unchanged; raw error text stays server-log-only). `docs/operations.md`
   retention section — one clause to the same effect. Neither file gains
   new semantics, schedules, or bounds; say so in the summary.
6. Then the §2.1 two-stage review loop (`requesting-code-review` subagent
   with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
   verification) and the `caveman-commit` message.

## Non-goals

- No new message text, status, job name, or `ApiException` factory.
- No `JobRun` self-retention purge (prompts 79/84 name it: five ticks write
  ≥ five rows an hour with no reclamation, but the window is an explicit
  open operator decision per `docs/operations.md` `data_retention_policy`;
  build-plan §1 forbids inventing it).
- No schema or migration change: the `JobRun` table is untouched; only the
  TypeScript parameter narrows.
- No permission change (prompt 78 owns the `jobs.read` owner/admin gate;
  verify it stays green, do not touch it).
- No purge-behavior, batch-bound (prompt 79), or schedule change.
- No live Docker drills (restart/orphan/Garage/Valkey/ClamAV remain future
  operational work per prompts 72–84).
- No ingestion/export/scan/outbox failure-code change (prompts 80–84 own
  those surfaces; verify they stay green).

## Reference deltas

None visual (server-only). The one deliberate property delta, stated so
it is not mistaken for a regression: code that previously compiled when
passing an arbitrary string as the job-run message no longer compiles. No
committed runtime path changes value, order, or shape.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State
this in the completion summary; do not run browser suites for this
change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1
  generation) — including the temporary negative probe rejection,
  quoted, then reverted.
- Targeted server suite: both job spec files (all `finish` assertions),
  then the full `npm run test:server` — do not claim the full suite from
  a targeted run.
- `npm run contracts:check` (expected: passes unchanged; if it fails,
  stop — no contract artifact should move for this change).
- `git diff --check` and `git status --short` review; stage only
  approved files.
- Then the §2.1 two-stage review loop (`requesting-code-review` subagent
  with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
  verification) and the `caveman-commit` message.
- Record the result in `docs/backend.md` (and the one clause in
  `docs/operations.md`) in the same change.

## SKILLS USED

- `architecture-patterns` — constant placement in the writer module vs the
  job call-site modules (cycle avoidance; mirrors prompt 84's outbox
  layering).
- `nestjs-best-practices` — const/type placement in the existing
  injectable; no service wiring, module, or provider change.
- `security-best-practices` — durable-column sanitization; raw
  Prisma/connection/transaction text stays server-log-only, never in
  persisted rows awaiting a future reader.
- `error-handling-patterns` — fixed purge-failure taxonomy preserved;
  compile-time guard so raw text can never reach `JobRun.message`
  (fail-fast at the type level, originals stay log-only).
- `javascript-testing-patterns` — existing job specs stay green in
  expectation; constant import paths move; negative type-probe procedure.
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
  surface), `security-threat-model` (no trust boundary change; the
  prompt-78 read gate is unchanged).
