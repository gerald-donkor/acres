# 70 - export artifact retention purge

## Scope, and why it is next

The committed repository is on `main` at `cc49667`
(`feat(reports): version dashboard evidence snapshots`). All 12 ordered phases
in `docs/build-plan.md` are implemented and committed through the Phase 12K
exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus residual follow-ups 68 (saved-view
`schemaVersion`) and 69 (frozen dashboard-evidence `schemaVersion`).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phases 10 + 12, dependency-safe against prompts
68–69 (no schema, contract, or version-marker change).

The gap: expired export downloads accumulate bytes forever. `ExportRequest`
carries `expiresAt` (`server/prisma/schema.prisma:1021`, set on success in
`server/src/reports/reports.service.ts:683-692` from
`acceptedDownloadTtlSeconds`, default 300s), and the download path enforces it
(`reports.service.ts:610`, `signed.expiresAt`), but nothing ever reclaims the
`ExportArtifact` row or its `StoredObject` bytes. `RetentionMaintenanceJob`
(`server/src/jobs/retention-maintenance.job.ts`) purges sessions
(`session-maintenance.job.ts`), pending uploads, idempotency records, and
account/invitation tokens — export artifacts are the missing sibling.
`docs/launch-checklist.md` §3.7 (`data_retention_policy`) already expects an
explicit exports window, and `docs/reports.md` § Residual gaps still lists
"retention/deletion policy" as future. Published revisions are immutable and
are never touched by this change; only the derived download bytes expire.

This prompt adds an `exports.purge-expired` scheduled job that deletes expired
`ExportArtifact` rows and marks their `StoredObject` rows deleted, keeps the
`ExportRequest` audit row, and leaves download semantics fail-closed. No
migration, no new env, no route/permission change.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 10 definition (§11), Phase 12 definition (§13),
  §§16–22 confirming 12E–12K committed; establishes no unbuilt ordered phase.
- `docs/reports.md` (full file, 177 lines) — § Schema and permissions
  (immutable revisions, `reports.*`/`exports.*` map), § Worker and artifacts
  (formula-safe CSV, deterministic PDF, `renderingVersion: "reports-v1"`),
  § Export progress streaming, § Residual gaps ("retention/deletion policy
  still future").
- `docs/launch-checklist.md` §3.7 — `data_retention_policy` expects explicit
  windows including exports (30d); this prompt implements the code side
  (reclaim expired bytes) without inventing operator policy dates.
- `docs/operations.md` § Data Retention & Cleanup — existing four purge jobs
  (`sessions`, `uploads`, `idempotency`, `tokens`); this prompt adds the fifth.
- `server/prisma/schema.prisma` — `model ExportRequest` (~1007–1035:
  `status ExportStatus @default(queued)`, `expiresAt DateTime?`,
  `@@index([organizationId, status, updatedAt])`); `model ExportArtifact`
  (~1037–1054: `exportRequestId @unique`, `storedObjectId`,
  `onDelete: Cascade` to request, `Restrict` to object); `model StoredObject`
  (~315–338: `state StoredObjectState @default(pending_upload)`,
  `deletedAt DateTime?`); `enum ExportStatus` (~1118–1124: `queued, running,
  succeeded, failed, cancelled` — no `expired` value, none added).
- `server/src/reports/reports.service.ts` — worker completion (lines ~660–692:
  `storedObject` create `state: 'accepted'`, `exportArtifact` create,
  `exportRequest` update `status: 'succeeded', finishedAt, expiresAt: now +
  acceptedDownloadTtlSeconds`); download signing (line ~610:
  `expiresAt: signed.expiresAt.toISOString()`); failure path (~694–711: sets
  `failed`, never sets `expiresAt`).
- `server/src/jobs/retention-maintenance.job.ts` (160 lines) — the pattern to
  copy: `SCHEDULER_ENABLED` gate, `JobRunsService.start/finish` audit, sibling
  constants `UPLOADS_RETENTION_JOB` / `IDEMPOTENCY_RETENTION_JOB` /
  `TOKENS_RETENTION_JOB`, `workerScoped` vs direct Prisma choice per job.
- `server/src/jobs/retention-maintenance.job.spec.ts` — existing unit
  expectations the change must keep green.
- `server/src/jobs/session-maintenance.job.ts`, `server/src/jobs/jobs.module.ts`
  — scheduler registration pattern and the fourth-job wiring precedent.
- `server/src/config/env.validation.ts` + `acres-config.service.ts` —
  `ACCEPTED_DOWNLOAD_TTL_SECONDS` default `300`; no new env var is authorized.

No comp, crop, or board region applies: backend-only, no visual surface.

## Current-state facts the implementation must preserve

1. `ExportRequest.expiresAt` is nullable and set only on `succeeded`
   completion; `failed`/`cancelled`/`queued`/`running` rows have `NULL` and
   must never be purged by this job.
2. Download enforces expiry before any bytes are served; after this job runs,
   download of a purged request must still fail closed with the existing
   expired path (no new envelope, no new code on the read path if the current
   `expiresAt` check already covers missing-artifact rows — verify, do not
   assume).
3. `ExportArtifact.exportRequestId` is `@unique` and `onDelete: Cascade` from
   the request; `storedObjectId` is `Restrict`. The job must delete the
   artifact row explicitly and mark the object deleted — never delete the
   `ExportRequest` audit row and never hard-delete the `StoredObject` row
   (sibling upload purge sets `state: 'deleted', deletedAt: now`; match it).
4. Published `Report`/`ReportRevision`/`ReportEvidence` rows are immutable and
   out of scope; regenerating a download after purge is a new `POST /exports`
   (existing idempotent `deterministicKey` semantics unchanged).
5. Scheduler discipline: exactly one instance runs with
   `SCHEDULER_ENABLED=true` (`docs/backend.md` §7, `docs/operations.md`); the
   job must no-op when the flag is false, like all siblings.
6. No DDL is needed and none is authorized: `expiresAt`, artifact/object FKs,
   and `deletedAt` all exist. If a query plan needs an index, the existing
   `ExportRequest(organizationId, status, updatedAt)` plus a bounded
   `expiresAt <= now` scan of terminal rows is acceptable at this volume —
   prove it with `EXPLAIN`, do not add a migration in this prompt.

## Implementation

1. **New scheduled job** in `server/src/jobs/retention-maintenance.job.ts`
   (same file, same class — do not create a second scheduler):
   - Export `EXPORTS_RETENTION_JOB = 'exports.purge-expired'` alongside the
     three existing constants.
   - `@Cron(CronExpression.EVERY_HOUR, { name: EXPORTS_RETENTION_JOB })`
     `purgeExpiredExports()`: `if (!this.config.schedulerEnabled) return;`
     then the `runs.start / finish('succeeded' | 'failed')` pattern verbatim.
   - Inside, `now = new Date()`; find terminally expired requests:
     `status: 'succeeded', expiresAt: { lte: now }`, selecting
     `{ id, organizationId }` only, bounded (e.g. `take: 500` per tick with
     repeat-on-next-tick; document the bound — never an unbounded
     `findMany` without `take`).
   - For each batch, in one `workerScoped` (preferred — artifact/object rows
     are tenant-scoped; match the upload-purge precedent) or direct transaction:
     collect artifact rows for those request IDs (`exportArtifact.findMany`
     `where: { exportRequestId: { in } }`, select
     `{ exportRequestId, storedObjectId }`); `deleteMany` artifacts by request
     IDs; `updateMany` the collected `storedObject` IDs
     `where: { id: { in }, state: 'accepted' }`
     `data: { state: 'deleted', deletedAt: now }`. Never touch the
     `ExportRequest` rows themselves.
   - Guard the shared-object edge explicitly: export objects are created
     fresh per render (`reports.service.ts:660-671`, one object per artifact),
     so no dedup/refcount exists today — state that in a code comment and
     assert it in one test (two purged exports never share a `storedObjectId`).
     If the assertion ever fails, purge must fail closed for the shared ID
     (skip + warn) rather than orphan a live download; implement the skip.
   - Log and finish with `purged N expired export artifact(s)`; on error,
     `finish(runId, 'failed', message)` like siblings.
2. **Wiring**: no new module needed if `RetentionMaintenanceJob` is already
   provided by `jobs.module.ts` (verify) — the `@Cron` decorator is the
   registration. If the module lists job names anywhere (metrics labels,
   health, docs table), add the fifth name there too; otherwise state why no
   wiring change was needed.
3. **Read-path verification** (no change expected, proof required): with an
   artifact purged but the request row intact, `GET /exports/:exportId` still
   returns metadata and `GET /exports/:exportId/download` still fails closed
   with the existing expired/not-found stable code (quote which one in the
   prompt-closing summary). If the current handler throws a different code for
   missing-artifact vs expired, document the mapping — do not invent a new
   error code.
4. **Tests**:
   - Unit (`retention-maintenance.job.spec.ts` +): scheduler-disabled no-op;
     only `succeeded + expiresAt <= now` purged (`failed`, `cancelled`,
     `queued`, `running`, `succeeded` with `NULL`/future `expiresAt`
     untouched); artifact row deleted, object marked `deleted` with
     `deletedAt`, request row preserved; shared-object-ID skip path (synthetic
     collision); batch bound respected; `JobRun` success/failure rows written.
     Follow the existing spec's mock style (Prisma double); no real DB needed
     for these.
   - Real-DB e2e (extend the existing reports/database gate, do not invent a
     new harness): seed two orgs, complete one export per org with expired
     `expiresAt`, run the job method directly, assert org-A purge deletes only
     org-A artifact/object under forced RLS and org-B rows survive; assert the
     download endpoint fails closed post-purge. Database assertions must not
     use the Prisma test double.
   - Regression: full `retention-maintenance.job.spec.ts`,
     `reports.service.spec.ts`, `npm run test:server`.
5. **Docs**: in `docs/operations.md` § Data Retention & Cleanup, add the fifth
   bullet (`exports.purge-expired`: reclaims `ExportArtifact` + marks
   `StoredObject` deleted for `succeeded` requests past `expiresAt`; request
   audit rows retained; published revisions untouched). In `docs/reports.md`
   § Residual gaps, narrow the retention bullet to what remains (scheduled
   sharing/links/policy windows are operator decisions per
   `docs/launch-checklist.md` §3.7). One index-row-class edit at most
   elsewhere.

## Expected impact — which routes change, and how

- Code + tests + two docs bullets only. No migration, no Prisma change, no
  shared-contract change, no OpenAPI/SDL change (verify with
  `contracts:check`, expect zero diff).
- REST paths unchanged (`GET /exports`, `GET /exports/:exportId`,
  `GET /exports/:exportId/download`); after purge, metadata reads still
  succeed and download fails closed with the pre-existing expired code.
  Same permission map (`exports.read`), same envelopes, same
  CSRF/`Idempotency-Key` behavior.
- Worker/outbox payloads unchanged; the new cron runs only where
  `SCHEDULER_ENABLED=true` (worker), never on the API deployment.
- Client UI: no change required. `/app/reports` needs no new fetch or copy;
  an expired download already has its error state.

## Non-goals — deliberately out of scope, and why

- New retention windows, env vars, or policy dates (30d exports, 7d
  quarantine, 1d rejected): operator decisions owned by
  `docs/launch-checklist.md` §3.7, not implementable here. This prompt reuses
  the existing per-request `expiresAt` (download TTL); it does not invent a
  second 30-day clock.
- Quarantine/rejected-object reclamation, telemetry metrics retention,
  backup retention, account/audit retention: separate jobs with their own
  state machines and safety cases; each gets its own prompt if chosen.
- Hard-deleting `ExportRequest` audit rows or published revisions:
  explicitly forbidden — auditability and reproducibility win over disk.
- Object-storage (Garage/S3) byte deletion: the DB row is marked `deleted`
  (reconciliation-excluded like siblings); physical bucket GC stays with the
  existing storage lifecycle, verified via `ops:reconcile-storage`.
- Any RLS, permission-map, throttle, GraphQL, outbox, export-renderer, or
  introspection change.

## Reference deltas

None — no visual surface, no comp applies. Export API responses gain no
field; post-purge downloads return the pre-existing expired failure.

## Breakpoint behaviour

No UI change ships; nothing to verify at 375/800/1280 beyond the existing
reports responsive suites staying green (they run as part of the checks only
if the implementation touches client code, which it must not — state that).

## Checks to run (§6), with real output quoted

From the repository root, in dependency order:

```bash
npm run lint
npm run typecheck
npm run build
npm run contracts:check
npm run test --workspace=@acres/server -- src/jobs/retention-maintenance.job.spec.ts
npm run test --workspace=@acres/server -- src/reports/reports.service.spec.ts
npm run test:server
git diff --check
git status --short
```

Fix every failure before review. Never claim a check passed without running
it. `npm run analytics:plans` is unaffected (no analytics/dashboard query
touched) — state that rather than running it silently; run it only if the
implementation touches an analytics/dashboard plan.

## Review, record, commit

- Two-stage review loop is mandatory: `requesting-code-review` with structured
  context (requirements, what changed, files, SHAs, checks run), then evaluate
  with `receiving-code-review` against codebase reality; re-review if feedback
  drives architectural change.
- Record the result in `docs/operations.md` + `docs/reports.md` per
  § Implementation step 5. One index-row-class edit at most elsewhere.
- Commit to `main` with `caveman-commit` (ALWAYS rule); do not push.

## SKILLS USED

- `architecture-patterns`: fifth cron inside the existing maintenance class,
  bounded-batch purge, audit-row preservation, shared-object fail-closed skip.
- `nestjs-best-practices`: `@Cron` registration, `SCHEDULER_ENABLED` gate,
  `workerScoped` tenant transaction, `JobRunsService` audit, testing-module
  unit tests.
- `postgres-best-practices`: `expiresAt <= now` terminal-row selection,
  explicit artifact delete + object soft-delete, FK-restriction respect, no
  DDL.
- `api-design-principles`: no route/permission/envelope change, pre-existing
  expired-download failure preserved.
- `openapi-spec-generation`: verifying committed OpenAPI/SDL show no drift.
- `security-best-practices`: confirm no trust-boundary change (tenant scope
  intact, no new unauthenticated surface, no raw bytes in logs).
- `error-handling-patterns`: fail-closed shared-object skip, `failed` JobRun
  path, download still expired-closed post-purge.
- `javascript-testing-patterns`: unit coverage for gate/filter/preserve/skip/
  bound/audit cases.
- `e2e-testing-patterns`: real-PostgreSQL two-org RLS purge isolation and
  post-purge download fail-closed proof (no Prisma test double for DB
  assertions).
- `sql-optimization-patterns`: only if the purge selection changes a plan;
  otherwise state why it does not apply (bounded indexed scan, no new index).
- `requesting-code-review`: structured reviewer-subagent dispatch after
  self-verification.
- `receiving-code-review`: technical evaluation of review feedback before
  fixing.
- `caveman-commit`: conventional commit message for the final local commit.
