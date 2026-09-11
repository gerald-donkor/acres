# 77 - scheduled-job failure message sanitization

## Scope, and why it is next

The committed repository is on `main` at `6568585`
(`fix(worker): store bounded infected scan result`). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus residual follow-ups 68 (saved-view
`schemaVersion`), 69 (frozen dashboard-evidence `schemaVersion`), 70 (hourly
`exports.purge-expired` reclamation), 71 (download-time expiry enforcement),
72 (incompatible-metric-remap pre-publication validation), 73 (unexpected
publication-failure message sanitization), 74 (`parser_exception` fixed
message), 75 (`worker_exception` fixed message), and 76 (infected `scanResult`
bounded to `'infected'`).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 6, dependency-safe against prompts 68–76
(no schema, migration, contract, route, or version-marker change).

The gap is `JobRun.message` on the scheduled-maintenance failure paths.
Five purge paths persist the raw error verbatim into the durable `JobRun` row
via `JobRunsService.finish(runId, 'failed', message)` where
`message = describe(error)` (`error instanceof Error ? error.message :
String(error)`):

- `server/src/jobs/session-maintenance.job.ts`, lines 52–56
  (`sessions.purge-expired` catch → `finish(runId, 'failed', message)`);
- `server/src/jobs/retention-maintenance.job.ts`, lines 79–84
  (`uploads.purge-expired`), 114–119 (`idempotency.purge-expired`), 155–160
  (`tokens.purge-expired`), 291–296 (`exports.purge-expired`).

Those errors are database/transaction failures (today's specs drive
`'DB deadlock'`, `'Connection lost'`, `'Tx rollback'`), carrying Prisma,
connection, and transaction internals. The row is readable by any signed-in
account through the existing read model (`job-runs.service.ts:39–53`,
`listRecent` returns `message` verbatim, bounded to 50 rows; route
`GET /api/v1/jobs/runs` in `jobs.controller.ts:25–33`, session guard only —
the controller comment at lines 13–17 states role-based authorization is later
work). It is the same inversion prompts 72–76 fixed on the ingestion/worker
surfaces: raw detail stored where it persists and is served, never confined to
where operators debug it.

The sibling paths are already fixed and are the pattern to mirror: ingestion
`validation_failed` / unexpected-publication / `parser_exception` use fixed
safe strings with the original error in server logs only (prompts 72–74);
worker `worker_exception` and infected `scanResult` do the same (prompts
75–76). The `succeeded` job messages (`'purged N expired upload(s)'`,
`'purged N expired idempotency record(s)'`,
`'purged N token(s) and M invitation(s)'`,
`'purged N expired export artifact(s)'`, `'purged N session(s)'`) carry only
counts and are untouched.

This prompt maps every scheduled-maintenance `finish(..., 'failed', ...)` to a
fixed safe string, preserves all job names and status values, and logs the
original error server-side only via the existing `Logger`. No other production
behavior changes.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 6 definition (§7) with its skill manifest;
  §§16–22 confirming 12E–12K committed; establishes no unbuilt ordered phase
  and that this is a Phase 6 residual (durable job/persistence surface).
- `docs/backend.md` — jobs/run sections (the `GET /jobs/runs` route row,
  session-guard-only note, `sessions.purge-expired` / `JobRun` paragraphs);
  the owning record for this change.
- `docs/operations.md` — retention-jobs section (`sessions.purge-expired`,
  `uploads/idempotency/tokens/exports.purge-expired`, `JobRun` audit table);
  confirms retention semantics, unchanged here.
- `docs/ingestion.md` § Residual gaps (prompts 72–75 rule: diagnostics in
  structured fields or server logs, never raw error text in free-text
  columns) — the convention this prompt extends to the scheduled-job surface.
- `server/src/jobs/session-maintenance.job.ts` (64 lines, full file) — the gap:
  `describe` at lines 62–64; failure persist at lines 52–56
  (`finish(runId, 'failed', message)`); start-throw log-only early return at
  lines 40–46 (untouched — never persists, no `runId` exists); succeeded
  message at line 50 (counts only, untouched).
- `server/src/jobs/retention-maintenance.job.ts` (303 lines, full file) — the
  gap: `describe` at lines 301–303; four failure persists at lines 79–84,
  114–119, 155–160, 291–296; four start-throw log-only early returns at lines
  40–46, 93–100, 127–135, 168–176 (untouched — never persist); four succeeded
  count messages at lines 73–77, 108–112, 147–151, 285–289 (untouched).
- `server/src/jobs/job-runs.service.ts` (54 lines) — `finish` persists
  `message` verbatim at line 31; `listRecent` serves it verbatim at lines
  39–53 (proves the read exposure; the fix belongs at the job call sites, not
  in this writer — same placement rule as prompts 74–76).
- `server/src/jobs/jobs.controller.ts` (34 lines) — route
  `GET /api/v1/jobs/runs` at lines 25–33, session guard only with the
  role-authorization-deferred comment at lines 13–17 (proves any signed-in
  account reads the sanitized column today; no permission change ships here).
- `packages/shared/src/jobs.ts` — `JobRunSummary.message: string | null`
  (proves no contract-shape change: the value stays a nullable string).
- `server/src/jobs/retention-maintenance.job.spec.ts` (478 lines) — existing
  failure assertions driving verbatim persistence: lines 153–171
  (`'DB deadlock'`), 201–222 (`'Connection lost'`), 257–279 (`'Tx rollback'`),
  and the export-transaction failure test at ~lines 457–478 (resolve the exact
  expected verbatim string from the file; the assertions to tighten).
- `prompts/75-upload-worker-exception-sanitization.md` and
  `prompts/76-scan-result-signature-sanitization.md` — sibling pattern (fixed
  message + server-log-only original, exposure analysis for durable rows with
  a live read path, guard-duty skill list); this prompt mirrors their
  structure and non-goals.

No comp, crop, or board region applies: backend-only, no visual surface.

## Current-state facts the implementation must preserve

1. Job names are stable (`sessions.purge-expired`, `uploads.purge-expired`,
   `idempotency.purge-expired`, `tokens.purge-expired`,
   `exports.purge-expired`; constants `SESSION_MAINTENANCE_JOB`,
   `UPLOADS_RETENTION_JOB`, `IDEMPOTENCY_RETENTION_JOB`,
   `TOKENS_RETENTION_JOB`, `EXPORTS_RETENTION_JOB`). No new job name is
   authorized.
2. Statuses are stable (`running` → `succeeded` / `failed`). No new status.
3. The `succeeded` messages stay exactly as today (count-only strings).
4. The `runs.start` throw paths stay exactly as today: log-only
   `logger.error` + early return, never persisting (no `runId` exists on that
   path). They already confine the raw error to server logs.
5. `JobRun` columns already exist; this is a value-mapping change only — no
   migration, no new index, no payload-shape change.
6. No scheduler-distribution change: `@nestjs/schedule` in-process cron with
   the single `SCHEDULER_ENABLED=true` instance constraint stays as today.

## Exposure analysis (why a fixed message when the reader is session-gated)

- Today any signed-in account reads `JobRun.message` verbatim through
  `GET /api/v1/jobs/runs` (verified above: `listRecent` maps the row without
  filtering; the controller applies the session guard only and explicitly
  defers role-based authorization).
- The rows are also durable, operator-visible persistence: they survive in
  PostgreSQL backups, restore drills, and any future operator/admin workflow.
  Raw purge errors carry database/transaction internals (deadlock, connection,
  rollback fragments) — exactly the content that must not sit in a persisted
  message column waiting for a future reader.
- The fix therefore sanitizes the stored value at the source and keeps the
  original error in server logs only (existing `Logger`), matching the
  prompts 72–76 rule. It does **not** add a reader, change the session-guard
  floor, or add a log pipeline. Tightening `GET /jobs/runs` authorization is
  separate work with its own permission analysis (backend.md already marks it
  as such).

## Implementation steps

1. **Sanitize the five failure persists** (four in
   `retention-maintenance.job.ts` at lines 79–84, 114–119, 155–160, 291–296;
   one in `session-maintenance.job.ts` at lines 52–56):
   - Replace the persisted `describe(error)` / `message` value with a fixed
     safe string per purge path, e.g. `'Session purge failed
     unexpectedly.'`, `'Upload purge failed unexpectedly.'`,
     `'Idempotency purge failed unexpectedly.'`, `'Token purge failed
     unexpectedly.'`, `'Export purge failed unexpectedly.'` (wording may vary
     but each must be a fixed literal containing no interpolated error text,
     identifiers, keys, paths, storage internals, or library fragments; the
     job name is already stored in the `JobRun.jobName` column, so it must
     not be re-interpolated from the error).
   - Keep the `status: 'failed'` argument and the `runId` argument exactly as
     today.
   - Log the original error server-side only before persisting, via the
     existing class `Logger`, keeping the current
     `this.logger.error('<Job> purge failed: ${message}')` shape with the
     `describe(error)` detail in the log line only (never in a persisted
     column, metric label, or returned payload). No new logger instance, no
     Nest DI change. The four start-throw log-only branches stay exactly as
     today.
2. **No other production change**: no migration, no Prisma change, no
   shared-contract change (`JobRunSummary.message` stays `string | null`), no
   OpenAPI/SDL change, no controller/route/permission change (`GET
   /jobs/runs` stays session-gated), no `JobRunsService.start/finish/listRecent`
   change, no retention-window/policy/batch-limit change
   (`EXPORTS_PURGE_BATCH_LIMIT`, cron expressions, TTLs untouched), no purge
   query change, no scheduler-distribution change.
3. **Unit tests** in `server/src/jobs/retention-maintenance.job.spec.ts`
   (extend the four existing failure tests, same mocks) plus new
   `server/src/jobs/session-maintenance.job.spec.ts` if none exists (follow
   the retention spec's fake `runs`/`config`/`tenants` mocking pattern —
   resolve from the spec's current setup, do not invent a harness):
   - Drive each purge with a rejecting store throwing an adversary-shaped
     error (e.g. `new Error('DB deadlock on connection
     postgres://acres:secret@db:5432/acres for key uploads/upload-1')`) →
     `runs.finish` called with `('run-123', 'failed', <exact fixed message>)`;
     assert the stored value contains neither the connection fragment nor the
     key fragment; assert the original error reached the logger (spy on the
     job `Logger` per the file's existing mocking pattern).
   - Non-`Error` throw (e.g. `mockRejectedValueOnce('boom')`) → same exact
     fixed message for that path.
   - Existing succeeded-message assertions (`purged N ...` count strings)
     stay green unchanged.
   - Session job: drive `purgeExpired` rejection with a key-bearing error →
     same fixed-message + logger assertions; scheduler-disabled skip and
     `runs.start`-throw early-return behavior stay green unchanged.
4. **Real-DB e2e** (extend the existing jobs/database gate if one covers a
   purge-failure path; otherwise assert at the unit level plus the full
   real-database suite below — do not invent a new harness): if a database
   gate drives a purge failure, assert the persisted `JobRun.message` row
   carries the fixed message with no connection/key material. Database
   assertions must not use the Prisma test double.
5. **Docs**: in `docs/backend.md` jobs section, record that all five
   scheduled-maintenance failure paths now persist a fixed safe message in
   `JobRun.message` with the original error in server logs only,
   cross-referencing the prompts 72–76 rule. One clause; same commit.
   `docs/operations.md` needs no change (retention windows, batch limits, and
   schedules untouched); `docs/ingestion.md` needs no change.

## Non-goals

- Ingestion `ValidationIssue` / `parser_exception` / publication messages:
  already fixed (prompts 72–74); untouched.
- Worker `worker_exception` / infected `scanResult` durable values: already
  fixed (prompts 75–76); untouched.
- Report/export `failureMessage` values: already fixed (`ExportFailure` fixed
  code/message in `reports.service.ts`); untouched.
- Tightening `GET /api/v1/jobs/runs` authorization beyond the session guard:
  none. The controller comment defers role-based authorization to its own
  prompt with a permission/envelope analysis; this prompt only bounds the
  stored value the current reader serves.
- Changing `JobRunsService` writer semantics, `listRecent` limit/ordering, or
  the `JobRunSummary` contract: none.
- Any change to retention windows, TTLs, batch limits, purge queries,
  cron schedules, scheduler distribution, or outbox retry/dead-letter policy:
  untouched.
- Cross-version aggregate rollups and richer quality heuristics
  (`docs/analytics.md` residual): untouched.
- Schema/migration, new indexes, new env vars, new routes, permission-map
  changes, envelope/error-code additions, OpenAPI/SDL regeneration: none. The
  only changed identifiers are the five stored `JobRun.message` string values
  on the scheduled-maintenance failure paths.
- Dashboard, report, export, auth, upload-initiate/complete, parser, geography,
  or operations drill surfaces: untouched.
- Parser sandboxing, additional geography providers, live Garage/Valkey/ClamAV
  drills: future operational work, untouched.

## Expected impact — which routes change, and how

No route changes. No controller, permission, envelope, DTO, OpenAPI, or SDL
change:

- Jobs reads (`GET /api/v1/jobs/runs`): unchanged shape (`JobRunSummary`
  with nullable `message`); a failed purge that today serves the first-N chars
  of the raw database error will serve the fixed per-job message instead. The
  `jobName`, `status`, timestamps, 50-row bound, and session-guard floor
  behave exactly as today.
- Scheduler behavior: identical job names, hourly cadence, success counting,
  and early-return paths; only the persisted `message` string value on the
  five failure paths becomes fixed.

## Measurements / reproduction procedure (backend-only; no visual surface)

There is no comp number to hit. Verify by procedure, before and after:

1. On the current tree, drive `RetentionMaintenanceJob.purgeExpiredUploads`
   with the worker-scoped transaction rejecting
   `new Error('DB deadlock on connection postgres://acres:secret@db:5432/acres
   for key uploads/upload-1')`. Observe today: `runs.finish` receives
   `('run-123', 'failed', 'DB deadlock on connection ...')` containing the
   connection and key fragments.
2. After the change: the same rejection yields `('run-123', 'failed', <exact
   fixed message>)` containing no fragment of the thrown text, while the
   server log carries the original error; repeat for the idempotency, token,
   export, and session purge paths (including a non-`Error` throw yielding the
   same fixed message per path).
3. Confirm the five succeeded paths still yield their exact count messages.

## Checks to run, and which docs file records the result

Run and quote real output (§10 rule 3); never claim a pass without running:

- `npm run lint`
- `npm run typecheck`
- `npm run contracts:check` (expect zero diff; `JobRun.message` values are row
  values, not contract shapes — verify and commit none)
- Targeted: jobs specs
  (`npx jest --config server/jest.config.js` or the workspace equivalent the
  repo uses — resolve from `server/package.json`, do not invent flags), then
  the full `npm run test:server` real-database suite.
- `npm run build`
- `git diff --check` and `git status --short` review of the staged set.

Record the result in `docs/backend.md` (scheduled-job failure outcome) in the
same commit. `docs/operations.md` and `docs/ingestion.md` need no change
(retention semantics and ingestion paths untouched); if the implementation
touches a contract the backend doc enumerates, say so in the review request
rather than silently extending scope.

## Reference deltas

None — there is no visual surface and no comp applies. `JobRun` rows keep the
same shape, job names, and statuses; only the `message` string value on the
five scheduled-maintenance failure paths becomes fixed.

## Breakpoint behaviour

No UI change ships, so there is nothing to verify at 375/800/1280 beyond the
existing suites staying green (no new browser coverage is required; if the
implementation touches client code, which it must not, the existing
375/800/1280 zero-horizontal-scroll and 44px touch-target assertions must
still pass — state that).

## Review, record, commit

- Two-stage review loop is mandatory: `requesting-code-review` with structured
  context (requirements, what changed, files, SHAs, checks run), then evaluate
  with `receiving-code-review` against codebase reality; re-review if the
  feedback drives architectural change.
- Record the result in `docs/backend.md` per Implementation step 5. One
  index-row-class edit at most elsewhere.
- Commit to `main` with `caveman-commit` (ALWAYS rule); do not push.

## SKILLS USED

- architecture-patterns — scheduled-job boundary vs durable `JobRun`
  persistence vs session-gated read surface for the sanitization placement.
- nestjs-best-practices — fix inside the existing injectables using their
  established `Logger`; no service wiring or module change.
- security-best-practices — durable `JobRun.message` sanitization; database
  connection/transaction internals confined to server logs; no new
  unauthenticated surface.
- error-handling-patterns — stable per-job failure signal with fixed safe
  message; fail-closed generic for the unknown purge throw.
- javascript-testing-patterns — unit specs for verbatim/non-Error message
  mapping and logger assertion across all five purge paths.
- e2e-testing-patterns — real-database regression posture for the persisted
  job row (or a stated reason the unit gate suffices).
- api-design-principles — guard duty only: proves no route, permission,
  envelope, or error-code change ships with this fix.
- postgres-best-practices — only if a DB assertion needs it; no migration or
  index change is authorized — state why it does not apply.
- sql-optimization-patterns — not loaded: single-row job writes, no plan
  change to measure.
- openapi-spec-generation — verifying committed OpenAPI/SDL show no drift for
  the value-only change.
- requesting-code-review — dispatch a reviewer subagent with the requirements,
  diff SHAs, and checks run before committing.
- receiving-code-review — evaluate reviewer feedback against the code with
  technical rigor before fixing or pushing back.
- caveman-commit — write the commit message (ALWAYS rule, no AI trailer).

Not loaded, with reason: `kpi-dashboard-design` / `data-storytelling`
(metric semantics and display unchanged), frontend/shadcn/Tailwind/GSAP/
playwright skills (no UI, no motion, no browser flow).
