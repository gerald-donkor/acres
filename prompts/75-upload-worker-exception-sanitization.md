# 75 - upload-worker exception message sanitization

## Scope, and why it is next

The committed repository is on `main` at `adb8e05`
(`fix(ingestion): use fixed parser_exception message`). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus residual follow-ups 68 (saved-view
`schemaVersion`), 69 (frozen dashboard-evidence `schemaVersion`), 70 (hourly
`exports.purge-expired` reclamation), 71 (download-time expiry enforcement),
72 (incompatible-metric-remap pre-publication validation), 73 (unexpected
publication-failure message sanitization), and 74 (`parser_exception` fixed
message).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 6, dependency-safe against prompts 68–74
(no schema, migration, contract, route, or version-marker change).

The gap is `UploadWorkerService.finalizeException`
(`server/src/worker/upload-worker.service.ts`, lines 321–348):

```ts
private async finalizeException(
  durableJobId: string,
  organizationId: string,
  uploadId: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await this.tenants.workerScoped(async (tx) => {
    await tx.durableJob.update({
      where: { id: durableJobId },
      data: {
        state: 'failed',
        finishedAt: new Date(),
        lastErrorCode: 'worker_exception',
        lastErrorMessage: message.slice(0, 500),
      },
    });
    await tx.jobDeadLetter.create({
      data: {
        organizationId,
        durableJobId,
        reasonCode: 'worker_exception',
        reasonMessage: message.slice(0, 500),
        payload: { uploadId },
      },
    });
  });
}
```

Prompt 74 explicitly deferred this path ("Upload-worker `finalizeException`
verbatim slices ... same theme, separate prompt with its own exposure analysis;
untouched here"). The raw worker error is persisted verbatim (truncated to 500
chars) into two durable rows (`DurableJob.lastErrorMessage`,
`JobDeadLetter.reasonMessage`), via the catch in `process` (lines 310–318),
which handles every unexpected throw from the scan/storage/transaction path
after the upload row has been read — including storage-adapter errors (S3
endpoint URLs, object keys, bucket names), scanner internals, and Prisma/transaction
fragments. It is the same inversion prompts 72/73/74 fixed on the ingestion
surface: raw detail stored where it persists, never confined to where operators
debug it.

The sibling paths are already fixed and are the pattern to mirror: the scan
`clean`/`rejected` branch writes the fixed `'Upload did not pass malware
scanning.'` to both `lastErrorMessage` and `reasonMessage` (lines 292–306);
the outbox-exhaustion path writes the fixed `'Outbox dispatch attempts
exhausted.'` (lines 124–130); the ingestion `validation_failed`,
unexpected-publication, and `parser_exception` paths all use fixed safe strings
with the original error in server logs only (prompts 72–74).

This prompt maps both `finalizeException` verbatim slices to one fixed safe
string, preserves the `worker_exception` codes (no new code), and logs the
original error server-side only via the existing `Logger`. No other production
behavior changes.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 6 definition (§7) with its skill manifest;
  §§16–22 confirming 12E–12K committed; establishes no unbuilt ordered phase
  and that this is a Phase 6 residual.
- `docs/backend.md` — worker/outbox/storage sections (durable-job, dead-letter,
  scan lifecycle); the owning record for this change.
- `docs/ingestion.md` § Residual gaps (prompts 72–74 rule: diagnostics in
  structured fields or server logs, never raw error text in free-text
  messages) — the convention this prompt extends to the worker surface.
- `server/src/worker/upload-worker.service.ts` (357 lines, full file) — the gap:
  `finalizeException` verbatim slices at lines 335/343; fixed neighbours at
  lines 124–130 (`'Outbox dispatch attempts exhausted.'`) and 292–306
  (`'Upload did not pass malware scanning.'`); catch-and-rethrow at lines
  310–318 (`throw error` after `finalizeException`, so BullMQ still observes
  the failure).
- `server/src/worker/upload-worker.service.spec.ts` (614 lines) — existing
  worker assertions; the exception-path test at lines 581–604 drives
  `getBuffer` rejection (`'S3 connection reset'`), asserts `state: 'failed'` /
  `lastErrorCode: 'worker_exception'` / `reasonCode: 'worker_exception'` but
  does not assert the message value (the assertion to tighten).
- `server/src/uploads/uploads.service.ts` (lines 343–374, `toStatus`) —
  tenant-visible `UploadStatus.failure` reads `Upload.failureCode` /
  `failureMessage`, which `finalizeException` does **not** write (it writes
  only `DurableJob` + `JobDeadLetter`); proves the exposure analysis below.
- `server/src/uploads/uploads.controller.ts` — `GET uploads/:uploadId`,
  `GET uploads/:uploadId/download`, `SSE uploads/:uploadId/events` all serve
  `UploadStatus` (no durable-job/dead-letter payload); proves no tenant REST/SSE
  read serves the two sanitized columns today.
- `server/src/jobs/jobs.controller.ts` + `job-runs.service` — `GET jobs/runs`
  serves scheduled `JobRunSummary` rows only, not `DurableJob`/`JobDeadLetter`;
  proves the sanitized columns have no tenant read path today (durable,
  operator-visible persistence — the reason to fix the stored value, not the
  reader).
- `server/src/outbox/outbox.service.ts` (lines 123–142) — dead-letter writer
  takes caller-supplied `reasonMessage`; confirms the fix belongs at the
  `finalizeException` call site, not in the outbox writer.
- `prompts/74-parser-exception-message-sanitization.md` — non-goals section
  naming this exact path as the deferred separate prompt.

No comp, crop, or board region applies: backend-only, no visual surface.

## Current-state facts the implementation must preserve

1. The `worker_exception` codes are stable (`lastErrorCode` and `reasonCode`;
   no spec asserts a message value today, but operator tooling keys on the
   code). No new error code is authorized. Only the two `message` values
   change (verbatim slice → fixed).
2. The fixed neighbours are untouched: `'Upload did not pass malware
   scanning.'`, `'Outbox dispatch attempts exhausted.'`, and the
   `dispatchOutboxOnce` catch (`logger.warn` + `markDeadLetter`/`markRetry`)
   stay exactly as today.
3. `finalizeException` still runs inside one `workerScoped` transaction writing
   exactly one `durableJob.update` + one `jobDeadLetter.create`; it still does
   **not** touch the `Upload` row (`failureCode`/`failureMessage`,
   `progressStage`, `scanStatus` untouched on this path).
4. `process` still rethrows after `finalizeException` (BullMQ `failed` metric
   and retry semantics unchanged).
5. `DurableJob.lastErrorMessage` / `JobDeadLetter.reasonMessage` columns already
   exist; this is a value-mapping change only — no migration, no new index, no
   payload-shape change (`payload: { uploadId }` untouched).

## Exposure analysis (why a fixed message when no tenant route reads these columns)

- Today no tenant REST/SSE read serves `DurableJob.lastErrorMessage` or
  `JobDeadLetter.reasonMessage` (verified above: uploads reads serve
  `UploadStatus` from the `Upload` row; jobs reads serve `JobRunSummary`).
- The rows are still durable, operator-visible persistence: they survive in
  PostgreSQL backups, restore drills, storage-reconciliation evidence, and any
  future operator/admin read or support workflow. Raw storage errors carry
  endpoint URLs, object keys, bucket/key layout (`organizations/<org>/
  quarantine/<uuid>`), and library/Prisma fragments — exactly the content that
  must not sit in a persisted message column waiting for a future reader.
- The fix therefore sanitizes the stored value at the source and keeps the
  original error in server logs only (existing `Logger`), matching the
  prompts 72/73/74 rule. It does **not** add a new reader, admin route, or
  log pipeline.

## Implementation steps

1. **Sanitize `finalizeException`** (`upload-worker.service.ts`, lines 321–348):
   - Replace both `message.slice(0, 500)` values (`lastErrorMessage`,
     `reasonMessage`) with one fixed string, e.g. `'Upload processing failed
     unexpectedly.'` (wording may vary but must contain no interpolated
     identifiers, keys, paths, storage internals, or library fragments).
   - Both columns carry the same fixed message; both codes stay
     `'worker_exception'`.
   - Log the original error server-side only before persisting, via the
     existing class `Logger`, e.g.
     `this.logger.error('Upload worker exception', error instanceof Error ?
     error.stack ?? error.message : String(error))` — or the two-argument
     `logger.error(message, stack/trace)` form the codebase uses elsewhere;
     resolve the exact overload from the NestJS `Logger` API in
     `node_modules` (do not invent a signature). Include durable identifiers
     only (`durableJobId`, `uploadId`, `organizationId` — never the raw error
     in a persisted column, metric label, or returned payload). No new logger
     instance, no Nest DI change.
2. **No other production change**: no migration, no Prisma change, no
   shared-contract change, no OpenAPI/SDL change, no controller/route/
   permission/CSRF/idempotency change, no outbox-writer change, no
   scan-branch change, no `Upload`-row write added, no rethrow removal, no
   queue/BullMQ option change, no SSE change.
3. **Unit tests** in `server/src/worker/upload-worker.service.spec.ts`
   (extend the existing exception-path test at lines 581–604, same mocks):
   - Drive `process({ uploadId: 'upload-1' })` with `getBuffer` rejecting
     `new Error('S3 connection reset for key organizations/org-1/quarantine/secret')`
     → still rejects with the original error (rethrow preserved);
     `durableJob.update` called with `state: 'failed'`,
     `lastErrorCode: 'worker_exception'`, and the **exact** fixed message
     (assert the stored value contains neither `S3 connection reset` nor the
     key fragment); `jobDeadLetter.create` called with
     `reasonCode: 'worker_exception'` and the same exact fixed message;
     assert the original error reached the logger (spy on the service
     `Logger` per the file's existing mocking pattern — resolve from the
     spec's current setup, do not invent a harness).
   - Non-`Error` throw (e.g. `mockRejectedValueOnce('boom')`) → same exact
     fixed message in both columns, still rethrows.
   - Existing fixed-message assertions (lines 442–543: `null` on success,
     `'Upload did not pass malware scanning.'` on infected,
     `'Outbox dispatch attempts exhausted.'` on exhaustion) stay green
     unchanged.
4. **Real-DB e2e** (extend the existing upload/worker gate if one covers the
   exception path; otherwise assert at the unit level plus the full
   real-database suite below — do not invent a new harness): if a database
   gate drives the worker exception path, assert the persisted
   `DurableJob.lastErrorMessage` / `JobDeadLetter.reasonMessage` rows carry
   the fixed message with no storage-key material under forced RLS. Database
   assertions must not use the Prisma test double.
5. **Docs**: in `docs/backend.md` worker section, record that
   `finalizeException` (`worker_exception`) now persists a fixed safe message
   in both durable columns with the original error in server logs only,
   cross-referencing the prompts 72/73/74 rule. One clause; same commit.

## Non-goals

- Ingestion `ValidationIssue` messages: already fixed (prompts 72–74);
  untouched.
- Report/export failure messages: already fixed (`ExportFailure` fixed
  code/message in `reports.service.ts`); untouched.
- Adding an operator/admin read API over `DurableJob`/`JobDeadLetter`, adding
  `Upload.failureMessage` writes on the worker-exception path, or changing
  `UploadStatus`/SSE shapes: none. A future reader must inherit the already-fixed
  stored value, which is the point — but the reader itself is a separate prompt
  with its own permission/envelope analysis.
- Any change to parser limits, XLSX container inspection, child-process
  isolation bounds, scan verdicts, quarantine lifecycle, outbox retry/dead-letter
  policy, retention/purge windows, or progress events: untouched.
- Cross-version aggregate rollups and richer quality heuristics
  (`docs/analytics.md` residual): untouched.
- Schema/migration, new indexes, new env vars, new routes, permission-map
  changes, envelope/error-code additions, OpenAPI/SDL regeneration: none. The
  only changed identifiers are the two stored message string values on the
  `worker_exception` path.
- Dashboard, report, export, auth, upload-initiate/complete, or operations
  drill surfaces: untouched.
- Parser sandboxing, additional geography providers, live Garage/Valkey/ClamAV
  drills: future operational work, untouched.

## Expected impact — which routes change, and how

No route changes. No controller, permission, envelope, DTO, OpenAPI, or SDL
change:

- Upload reads (`GET uploads/:uploadId`, SSE `uploads/:uploadId/events`):
  unchanged — they serve `UploadStatus` from the `Upload` row, which this path
  never wrote and still never writes.
- Jobs reads (`GET jobs/runs`): unchanged — `JobRunSummary` only.
- Worker behavior: identical state machine (`failed` + dead letter +
  rethrow); only the two persisted message string values become fixed.
  BullMQ failed-job observability and the existing `recordQueueJob(...,
  'failed')` metric are unchanged (no error text in labels).

## Measurements / reproduction procedure (backend-only; no visual surface)

There is no comp number to hit. Verify by procedure, before and after:

1. On the current tree, drive `UploadWorkerService.process` with `getBuffer`
   rejecting `new Error('S3 connection reset for key
   organizations/org-1/quarantine/secret')`. Observe today: the
   `durableJob.update` `lastErrorMessage` and `jobDeadLetter.create`
   `reasonMessage` contain `S3 connection reset` and the key fragment.
2. After the change: the same throw yields `worker_exception` in both code
   fields with the exact fixed message containing no fragment of the thrown
   text in either column, while the server log carries the original error;
   `process` still rejects with the original error.
3. Confirm the non-`Error` throw path yields the same fixed message in both
   columns.

## Checks to run, and which docs file records the result

Run and quote real output (§10 rule 3); never claim a pass without running:

- `npm run lint`
- `npm run typecheck`
- `npm run contracts:check` (expect zero diff; stored messages are row values,
  not contract shapes — verify and commit none)
- Targeted: worker spec
  (`npx jest --config server/jest.config.js` or the workspace equivalent the
  repo uses — resolve from `server/package.json`, do not invent flags), then
  the full `npm run test:server` real-database suite.
- `npm run build`
- `git diff --check` and `git status --short` review of the staged set.

Record the result in `docs/backend.md` (worker-exception outcome) in the same
commit. `docs/ingestion.md` needs no change (ingestion paths untouched); if the
implementation touches a contract the backend doc enumerates, say so in the
review request rather than silently extending scope.

## Reference deltas

None — there is no visual surface and no comp applies. Durable-job and
dead-letter rows keep the same shape and codes; only the two message string
values on the `worker_exception` path become fixed.

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

- architecture-patterns — worker boundary vs durable persistence vs
  (currently absent) tenant-readable surfaces for the sanitization placement.
- nestjs-best-practices — fix inside the existing injectable using its
  established `Logger`; no service wiring or module change.
- security-best-practices — durable `lastErrorMessage` / `reasonMessage`
  sanitization; storage keys, endpoint URLs, and library fragments confined
  to server logs; no new unauthenticated surface.
- error-handling-patterns — stable `worker_exception` signal with fixed safe
  message; fail-closed generic for the unknown worker throw; rethrow preserved.
- javascript-testing-patterns — unit specs for verbatim/non-Error message
  mapping and logger assertion.
- e2e-testing-patterns — real-database regression posture for the persisted
  durable rows under forced RLS (or a stated reason the unit gate suffices).
- api-design-principles — guard duty only: proves no route, permission,
  envelope, or error-code change ships with this fix.
- postgres-best-practices — only if a DB assertion needs it; no migration or
  index change is authorized — state why it does not apply.
- sql-optimization-patterns — not loaded: single-row durable writes, no plan
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
