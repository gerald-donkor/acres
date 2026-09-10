# 71 - export download expiry enforcement

## Scope, and why it is next

The committed repository is on `main` at `b44842e`
(`feat(jobs): purge expired export artifacts`). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus residual follow-ups 68 (saved-view
`schemaVersion`), 69 (frozen dashboard-evidence `schemaVersion`), and 70
(hourly `exports.purge-expired` reclamation).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 10, dependency-safe against prompts
68–70 (no schema, contract, or version-marker change).

The gap is stated in `docs/reports.md` (§ Residual gaps, prompt-70 note):

> Note the enforcement boundary: the download read path serves while the
> artifact row exists and does not itself compare `expiresAt`, so an expired
> artifact remains downloadable until the next hourly tick purges it.

`downloadExport` in `server/src/reports/reports.service.ts` (lines 592–613)
rejects missing rows, non-`succeeded` status, and null artifacts with the
stable `ApiException.notFound('Completed export artifact not found.')`, but it
never compares `row.expiresAt` against the current time. Expiry is enforced
only by the hourly purge job deleting the `ExportArtifact` row. Between
`expiresAt` passing and the next tick (up to ~1 hour), an expired download
still mints a fresh presigned URL — the TTL the worker stamped at completion
(`reports.service.ts:683-692`, `acceptedDownloadTtlSeconds`, default 300s) is
advisory until the sweeper runs.

This prompt closes the read-path hole: enforce `expiresAt` at download time
with the pre-existing `NOT_FOUND` failure, keeping the purge job as reclamation
only. No migration, no new env, no route/permission/envelope change.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 10 definition (§11), Phase 12 definition (§13),
  §§16–22 confirming 12E–12K committed; establishes no unbuilt ordered phase.
- `docs/reports.md` (full file, 186 lines) — § Schema and permissions
  (immutable revisions, `reports.*`/`exports.*` map), § Worker and artifacts
  (formula-safe CSV, deterministic PDF, `renderingVersion: "reports-v1"`),
  § Export progress streaming, § Residual gaps with the enforcement-boundary
  note quoted above.
- `docs/operations.md` § Data Retention & Cleanup — the five purge jobs
  including `exports.purge-expired` (prompt 70: oldest-expiry-first, 500 per
  hourly tick, global worker bypass, request audit rows retained, purged
  download fails closed on `NOT_FOUND`).
- `server/src/reports/reports.service.ts` — `downloadExport` (lines 592–613:
  `findFirst` with `{ id, organizationId }` + artifact/storedObject include,
  `row === null || row.status !== 'succeeded' || row.artifact === null` →
  `notFound`, then `storage.presignGet` returning
  `{ url, method, headers, expiresAt: signed.expiresAt }`); worker completion
  (lines ~683–692: `status: 'succeeded', finishedAt, expiresAt: now +
  acceptedDownloadTtlSeconds`); `toExport` (line ~1063:
  `expiresAt: row.expiresAt?.toISOString() ?? null`).
- `server/src/reports/reports.service.spec.ts` — `sampleExportRow`
  (lines 213–243: `status: 'succeeded'`,
  `expiresAt: 2026-01-01T01:00:00.000Z`); `downloadExport` block
  (lines 1651–1706: presign-called success case plus three `notFound` cases
  for missing row / non-succeeded status / null artifact — no expiry case).
- `server/src/common/api-exception.ts` (lines 91–93) — the single stable
  `notFound(message)` path (`NOT_FOUND`, HTTP 404); no new error code exists
  and none is authorized.
- `server/src/reports/reports.controller.ts` (lines 107, 339–355) —
  `GET /exports/:exportId/download` returning the presigned payload;
  `expiresAt: nullableStringSchema('date-time')` on the metadata DTO.
- `server/src/jobs/retention-maintenance.job.ts` (lines 8–17, 184–290) —
  `EXPORTS_RETENTION_JOB = 'exports.purge-expired'`,
  `EXPORTS_PURGE_BATCH_LIMIT = 500`, hourly cron, scheduler gate,
  `succeeded + expiresAt <= now` selection, artifact delete + object
  soft-delete, request row preserved.

No comp, crop, or board region applies: backend-only, no visual surface.

## Current-state facts the implementation must preserve

1. `ExportRequest.expiresAt` is nullable and set only on `succeeded`
   completion; `failed`/`cancelled`/`queued`/`running` rows carry `NULL` and
   never reach the presign call because the status check rejects them first.
2. The tenant predicate `{ id, organizationId }` plus forced RLS stays exactly
   as-is; a foreign `exportId` must still fail closed with the same `NOT_FOUND`
   before any expiry logic runs.
3. The purge job is reclamation only and is untouched: same selection
   (`succeeded`, `expiresAt <= now`), same batch bound (500/tick), same
   artifact-delete + object-soft-delete, same request-row preservation.
4. `GET /exports` / `GET /exports/:exportId` metadata reads are unchanged; only
   the `download` sub-path gains the expiry check. Metadata may still report
   `expiresAt` for an expired request — that is existing behavior, not a leak.
5. No DDL exists or is authorized: `expiresAt`, artifact/object FKs, and
   `deletedAt` all exist. No new index is expected — the read is a
   single-row `findFirst` by primary key plus an in-memory date comparison.
6. The presigned URL's own `signed.expiresAt` (storage-signature TTL) is
   unrelated to the request-level `row.expiresAt` and is unchanged.

## Measurements the implementation must hit, or the procedure that will produce them

No comp number applies. The acceptance procedure is behavioral, not pixel:

- With `row.expiresAt` in the past and status `succeeded` with an artifact
  present, `downloadExport` throws the existing
  `ApiException.notFound('Completed export artifact not found.')` and never
  calls `storage.presignGet` (assert via mock).
- With `row.expiresAt` in the future, the call serves exactly as today
  (presign called once, same `{ url, method, headers, expiresAt }` shape).
- Boundary rule (judgement, documented in code + docs): `expiresAt <= now`
  fails closed — the same `<=` the purge job uses, so read and reclamation
  agree and there is no one-tick skew where the reader serves what the
  sweeper would delete.
- `NULL expiresAt` on a `succeeded` row preserves current behavior (serve),
  matching the purge job which also skips `NULL`. Succeeded rows always stamp
  `expiresAt` today, so `NULL` is anomalous-but-tolerated, not a second
  expiry clock. Document this; do not invent a fail-closed `NULL` rule here.
- Clock source is `new Date()` evaluated inside `downloadExport` at call
  time (not injected config, not a new env var). Tests control time by
  seeding row values relative to real now (past/future fixtures), never by
  mocking the system clock unless the existing spec style already does so.

## Implementation

1. **Enforce expiry on the read path**
   (`server/src/reports/reports.service.ts`, `downloadExport` only):
   - After the existing
     `row === null || row.status !== 'succeeded' || row.artifact === null`
     guard, add: if `row.expiresAt !== null && row.expiresAt <= now`
     (with `now = new Date()`), throw the identical
     `ApiException.notFound('Completed export artifact not found.')`.
     Same message string, same code (`NOT_FOUND`), same 404 — verify by
     reusing the literal, not by adding a helper that rewords it.
   - Place the check before the `storage.presignGet` call so no signed URL
     is minted for an expired request and no storage call is observable.
   - Add a short code comment stating: request-level TTL is enforced here;
     the hourly job only reclaims bytes; `<=` matches the purge selection;
     `NULL` serves (legacy-tolerant, purge-consistent).
2. **No other production change**: no migration, no Prisma change, no
   shared-contract change, no OpenAPI/SDL change (verify with
   `contracts:check`, expect zero diff), no controller/route/permission/
   CSRF/idempotency change, no worker/outbox change, no purge-job change,
   no client change.
3. **Tests**:
   - Unit (`server/src/reports/reports.service.spec.ts`, `downloadExport`
     block +): expired `succeeded` row (`expiresAt` in the past) throws the
     existing `notFound` and `presignGet` is not called; future `expiresAt`
     serves (presign called once); `NULL expiresAt` serves (documents the
     tolerance rule); boundary `expiresAt` at-or-just-before now fails
     closed; existing three `notFound` cases stay green unchanged.
     Follow the existing spec's mock style (Prisma double via `mockTx`,
     `fakeStorage`); no real DB needed for these.
   - Real-DB e2e (extend the existing reports/database gate from prompts
     69–70, do not invent a new harness): seed two orgs, complete one
     export per org with an already-past `expiresAt`, assert the download
     service/endpoint fails closed with `NOT_FOUND` for the expired row
     under forced RLS without waiting for the purge tick; assert an
     unexpired export in the other org still downloads; assert cross-org
     download of either still 404s. Database assertions must not use the
     Prisma test double.
   - Regression: full `reports.service.spec.ts`,
     `retention-maintenance.job.spec.ts` (purge untouched),
     `npm run test:server`.
4. **Docs**: in `docs/reports.md` § Residual gaps, replace the
   enforcement-boundary note with the closed statement: the download read
   path now enforces `expiresAt <= now` with the pre-existing `NOT_FOUND`
   failure before any presigned URL is minted (`NULL` serves,
   purge-consistent); the hourly job remains byte reclamation only. In
   `docs/operations.md` § Data Retention & Cleanup, append one clause to the
   `exports.purge-expired` bullet cross-referencing the read-path
   enforcement (no new bullet). One index-row-class edit at most elsewhere.

## Expected impact — which routes change, and how

- Code + tests + two docs clauses only. No migration, no Prisma change, no
  shared-contract change, no OpenAPI/SDL change.
- REST paths unchanged (`GET /exports`, `GET /exports/:exportId`,
  `GET /exports/:exportId/download`); only the download sub-path gains a
  fail-closed expiry rejection using the pre-existing `NOT_FOUND` envelope.
  Same permission map (`exports.read`), same envelopes, same
  CSRF/`Idempotency-Key` behavior (download is a read; no idempotency key).
- Worker/outbox payloads unchanged; purge cadence and batch bound unchanged.
- Client UI: no change required. `/app/reports` already renders the expired
  download error state; an expired-but-unpurged download now reaches that
  state immediately instead of after the next tick.

## Non-goals — deliberately out of scope, and why

- New retention windows, env vars, TTL values, or policy dates (30d exports,
  7d quarantine, 1d rejected): operator decisions owned by
  `docs/launch-checklist.md` §3.7, not implementable here. This prompt reuses
  the existing per-request `expiresAt`; it does not invent a second clock.
- Changing the 300s default TTL, the presigned-URL signature TTL, or the
  metadata `expiresAt` representation: separate product/operator decisions
  with their own download-UX consequences.
- Hard-deleting `ExportRequest` audit rows, touching published revisions, or
  changing purge selection/batching: explicitly out of scope — auditability
  wins, and prompt 70 owns the sweeper.
- Object-storage (Garage/S3) byte deletion, quarantine/rejected reclamation,
  telemetry/backup retention: separate jobs with their own state machines.
- New error codes, new envelopes, `410 Gone`, or `403`-vs-`404` redesign:
  the stable `NOT_FOUND` path is deliberate (no expiry oracle for
  cross-tenant probers); redesigning it is a separate API decision.
- Any RLS, permission-map, throttle, GraphQL, outbox, export-renderer, or
  introspection change.

## Reference deltas

None — no visual surface, no comp applies. Download API responses gain no
field; expired downloads return the pre-existing `NOT_FOUND` failure instead
of a presigned URL.

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
npm run test --workspace=@acres/server -- src/reports/reports.service.spec.ts
npm run test --workspace=@acres/server -- src/jobs/retention-maintenance.job.spec.ts
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
- Record the result in `docs/reports.md` + `docs/operations.md` per
  § Implementation step 4. One index-row-class edit at most elsewhere.
- Commit to `main` with `caveman-commit` (ALWAYS rule); do not push.

## SKILLS USED

- `architecture-patterns`: read-path fail-closed enforcement with reclamation kept in the background job, no new state machine.
- `nestjs-best-practices`: service-pattern guard change, transaction-local tenant scope preserved, centralized `ApiException` path, testing-module unit tests.
- `api-design-principles`: no route/permission/envelope change, pre-existing `NOT_FOUND` reused so expiry is not a cross-tenant oracle.
- `openapi-spec-generation`: verifying committed OpenAPI/SDL show no drift for the behavior-only change.
- `security-best-practices`: confirm no trust-boundary change (tenant predicate intact, no URL minted pre-check, no new unauthenticated surface).
- `error-handling-patterns`: expired-serves-until-tick hole closed at the read boundary; `NULL`-tolerant rule documented as judgement.
- `javascript-testing-patterns`: unit coverage for expired/future/null/boundary/no-presign cases.
- `e2e-testing-patterns`: real-PostgreSQL two-org RLS download fail-closed proof without waiting for the tick (no Prisma test double for DB assertions).
- `sql-optimization-patterns`: only if the read query plan changes; otherwise state why it does not apply (same single-row `findFirst`, in-memory date compare).
- `postgres-best-practices`: only if DDL appears; none is authorized — state why it does not apply.
- `requesting-code-review`: structured reviewer-subagent dispatch after self-verification.
- `receiving-code-review`: technical evaluation of review feedback before fixing.
- `caveman-commit`: conventional commit message for the final local commit.
