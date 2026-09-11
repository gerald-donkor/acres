# 76 - scan-result signature sanitization

## Scope, and why it is next

The committed repository is on `main` at `25ce3de`
(`fix(worker): use fixed worker_exception message`). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus residual follow-ups 68 (saved-view
`schemaVersion`), 69 (frozen dashboard-evidence `schemaVersion`), 70 (hourly
`exports.purge-expired` reclamation), 71 (download-time expiry enforcement),
72 (incompatible-metric-remap pre-publication validation), 73 (unexpected
publication-failure message sanitization), 74 (`parser_exception` fixed
message), and 75 (`worker_exception` fixed message).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 6, dependency-safe against prompts 68–75
(no schema, migration, contract, route, or version-marker change).

The gap is `Upload.scanResult` on the malware-rejected path
(`server/src/worker/upload-worker.service.ts`, line 258):

```ts
scanResult: scan.signature ?? scan.errorCode ?? scan.status,
```

On the `infected` path the scanner port returns
`{ status: 'infected', signature }` where `signature` is the verbatim capture
of the ClamAV daemon response regex `/: (.+) FOUND/` in
`server/src/scanner/clamav-scanner.adapter.ts` (lines 58–62). That unbounded
external-daemon text is persisted verbatim into the durable `Upload.scanResult`
column (spec today asserts `scanResult: 'Win.Test.EICAR_HDB-1'`). It is the same
inversion prompts 72–75 fixed on the ingestion/worker surfaces: raw external
detail stored where it persists, never confined to where operators debug it.

The sibling paths are already fixed and are the pattern to mirror: the same
rejected branch writes the fixed `'Upload did not pass malware scanning.'` to
`Upload.failureMessage`, `DurableJob.lastErrorMessage`, and
`JobDeadLetter.reasonMessage` (lines 260, 301–304, 313); the scan `clean`
branch writes the bounded `'clean'` (line 242); the failed-scan branch writes
only bounded `scan.errorCode ?? scan.status` codes
(`'object_missing'`, `'scanner_unavailable'`, `'scanner_timeout'`,
`'scanner_error'`). Only the infected `scanResult` value carries unbounded
daemon text.

This prompt maps the infected `scanResult` to the bounded `'infected'` status,
preserves every code and every fixed message, and moves the raw signature to
server logs only via the existing `Logger`. No other production behavior
changes.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 6 definition (§7) with its skill manifest;
  §§16–22 confirming 12E–12K committed; establishes no unbuilt ordered phase
  and that this is a Phase 6 residual.
- `docs/backend.md` — worker/outbox/storage sections (durable-job, dead-letter,
  scan lifecycle); the owning record for this change.
- `docs/ingestion.md` § Residual gaps (prompts 72–75 rule: diagnostics in
  structured fields or server logs, never raw external text in free-text
  columns) — the convention this prompt extends to the scan-result column.
- `server/src/worker/upload-worker.service.ts` (372 lines, full file) — the gap:
  `scanResult` verbatim signature at line 258; bounded neighbours at lines
  236–247 (`'clean'`), 259–260 (bounded `failureCode`, fixed `failureMessage`),
  295–304 (bounded `lastErrorCode`, fixed `lastErrorMessage`), 312–313
  (bounded `reasonCode`, fixed `reasonMessage`); `finalizeException` fixed
  path at lines 330–363 (prompt 75, untouched).
- `server/src/scanner/clamav-scanner.adapter.ts` (63 lines) — the source:
  `parseScanResponse` at lines 58–62, `/: (.+) FOUND/` capture into
  `signature` at line 61; bounded `scanner_unavailable` / `scanner_timeout` /
  `scanner_error` at lines 26, 30, 62.
- `server/src/scanner/scanner.port.ts` (12 lines) — the contract:
  `ScanResult` at lines 1–5 (`status: 'clean' | 'infected' | 'failed'`,
  optional `signature`, optional `errorCode`); confirms the fix belongs at the
  `upload-worker.service.ts` call site, not in the port or the adapter.
- `server/src/uploads/uploads.service.ts` (lines 343–374, `toStatus`) —
  tenant-visible `UploadStatus` serves `id`, `state`, `filename`, `mediaType`,
  `byteCount`, `checksumHex`, `progress`, `failure`, `acceptedAt` only;
  `scanStatus` / `scanResult` are never served (proves the exposure analysis
  below).
- `server/src/worker/upload-worker.service.spec.ts` (697 lines) — existing
  worker assertions; the infected-path test at lines 460–509 drives
  `scanBuffer` resolving `{ status: 'infected', signature:
  'Win.Test.EICAR_HDB-1' }` and asserts verbatim `scanResult:
  'Win.Test.EICAR_HDB-1'` at line 481 (the assertion to tighten); the
  missing-object test at lines 511–551 asserts bounded `scanResult:
  'object_missing'` at line 527 (must stay green unchanged); the exception
  test at lines 581–678 asserts the prompt-75 fixed `WORKER_EXCEPTION_MESSAGE`
  (untouched).
- `prompts/75-upload-worker-exception-sanitization.md` — sibling pattern
  (fixed message + server-log-only original, exposure analysis for
  operator-visible durable rows with no tenant read path, guard-duty skill
  list); this prompt mirrors its structure and non-goals.

No comp, crop, or board region applies: backend-only, no visual surface.

## Current-state facts the implementation must preserve

1. `scanStatus` values are bounded (`'clean' | 'infected' | 'failed'`) and
   untouched. The clean branch (`scanResult: 'clean'`, line 242) is untouched.
2. The failed-scan branch (`scan.errorCode ?? scan.status` into `scanResult`,
   `failureCode`, `lastErrorCode`, `reasonCode`; fixed message into the three
   message columns) is untouched — all of its values are already bounded or
   fixed (`'object_missing'`, `'scanner_unavailable'`, `'scanner_timeout'`,
   `'scanner_error'`, plus status).
3. `failureCode: scan.errorCode ?? scan.status` on the infected path is
   `'infected'` (no `errorCode` on infected results) and untouched; the three
   fixed `'Upload did not pass malware scanning.'` messages are untouched.
4. The rejected branch still runs inside one `organizationScoped` transaction
   writing exactly one `upload.update` + one `storedObject.update` + one
   `jobProgressEvent.create`, followed by one `workerScoped` transaction
   writing one `durableJob.update` + one conditional `jobDeadLetter.create`.
   No transaction, state-machine (`rejected` / `failed` + dead letter), or
   `progressStage`/`progressPercent` change.
5. `Upload.scanResult` / `scanStatus` columns already exist; this is a
   value-mapping change only — no migration, no new index, no payload-shape
   change (`payload: { uploadId }` untouched).

## Exposure analysis (why a bounded value when no tenant route reads scanResult)

- Today no tenant REST/SSE read serves `Upload.scanResult` or `scanStatus`
  (verified above: `toStatus` serves `UploadStatus` from the `Upload` row
  without either column; jobs reads serve `JobRunSummary`).
- The column is still durable, operator-visible persistence: it survives in
  PostgreSQL backups, restore drills, storage-reconciliation evidence, and any
  future operator/admin read or support workflow. The value is an unbounded
  capture (`(.+)`) of the raw ClamAV daemon socket response — external-daemon
  text that must not sit in a persisted column waiting for a future reader,
  even though today's daemon only emits signature names.
- The fix therefore stores the bounded `'infected'` status at the source and
  keeps the raw signature in server logs only (existing `Logger`), matching
  the prompts 72–75 rule. It does **not** add a new reader, admin route, or
  log pipeline.

## Implementation steps

1. **Sanitize the infected `scanResult`** (`upload-worker.service.ts`,
   lines 252–264):
   - Replace `scanResult: scan.signature ?? scan.errorCode ?? scan.status`
     with a bounded mapping: `'clean'` is unreachable here (clean branch
     above); on `scan.status === 'infected'` store `'infected'`; otherwise
     keep the existing `scan.errorCode ?? scan.status` (failed path,
     already bounded). The simplest faithful form is
     `scan.status === 'infected' ? 'infected' : (scan.errorCode ??
     scan.status)` — wording may vary but the stored value must contain no
     daemon-response text on any path.
   - `scanStatus`, `failureCode`, `reasonCode`, `lastErrorCode`, and all
     three fixed messages stay exactly as today.
   - Log the raw signature server-side only before persisting, via the
     existing class `Logger`, e.g.
     `this.logger.warn('Upload rejected by malware scan for upload <id> org
     <org>: <status>/<signature>')` — include durable identifiers only
     (`upload.id`, `upload.organizationId`, `durableJob.id`, bounded
     `scan.status`; the raw `signature` goes to the log line only, never to
     a persisted column, metric label, or returned payload). No new logger
     instance, no Nest DI change. Resolve the exact `logger.warn` form from
     the file's current usage (line 132 uses template-string warn); do not
     invent a signature.
2. **No other production change**: no migration, no Prisma change, no
   shared-contract change, no OpenAPI/SDL change, no controller/route/
   permission/CSRF/idempotency change, no scanner-port or adapter change
   (`parseScanResponse` keeps returning the signature — the boundary moves
   to the persistence call site per `scanner.port.ts`), no outbox-writer
   change, no `finalizeException` change, no queue/BullMQ option change, no
   SSE change.
3. **Unit tests** in `server/src/worker/upload-worker.service.spec.ts`
   (extend the infected-path test at lines 460–509, same mocks):
   - Drive `process({ uploadId: 'upload-1' })` with `scanBuffer` resolving
     `{ status: 'infected', signature:
     'Win.Test.EICAR_HDB-1 ... organizations/org-1/quarantine/secret' }`
     (adversary-shaped: signature carrying a storage-key-like fragment) →
     `upload.update` called with `state: 'rejected'`, `scanStatus:
     'infected'`, and `scanResult` exactly `'infected'` (assert the stored
     value contains neither the signature nor the key fragment);
     `failureCode` still `'infected'`, `failureMessage` still the fixed
     scan string; `durableJob.update` / `jobDeadLetter.create` unchanged
     (bounded code + fixed message); assert the raw signature reached the
     logger (spy on the service `Logger` per the file's existing mocking
     pattern — resolve from the spec's current setup, do not invent a
     harness).
   - Missing-object test (lines 511–551): `scanResult: 'object_missing'`
     stays green unchanged.
   - Clean test (line 426: `scanResult: 'clean'`) stays green unchanged.
   - Exception test (lines 581–678: `WORKER_EXCEPTION_MESSAGE`) stays green
     unchanged.
4. **Real-DB e2e** (extend the existing upload/worker gate if one covers the
   scan-reject path; otherwise assert at the unit level plus the full
   real-database suite below — do not invent a new harness): if a database
   gate drives the infected-scan path, assert the persisted `Upload.scanResult`
   row carries `'infected'` with no signature material under forced RLS.
   Database assertions must not use the Prisma test double.
5. **Docs**: in `docs/backend.md` worker/scan section, record that the
   infected `scanResult` now persists the bounded `'infected'` status with
   the raw ClamAV signature in server logs only, cross-referencing the
   prompts 72–75 rule. One clause; same commit.

## Non-goals

- Ingestion `ValidationIssue` / `parser_exception` / publication messages:
  already fixed (prompts 72–74); untouched.
- Worker `worker_exception` durable messages: already fixed (prompt 75);
  untouched.
- Report/export failure messages: already fixed (`ExportFailure` fixed
  code/message in `reports.service.ts`); untouched.
- Changing `scanStatus`, `failureCode`, `reasonCode`, `lastErrorCode`, or any
  fixed `failureMessage` / `reasonMessage` / `lastErrorMessage`: none — all
  already bounded or fixed.
- Changing the scanner port contract or the ClamAV adapter parser (removing
  `signature` from `ScanResult`, altering the `FOUND` regex, adding timeouts
  or socket handling): none. The adapter keeps returning the signature; only
  the persistence call site stops storing it.
- Adding an operator/admin read API over `Upload.scanResult`,
  `DurableJob`, or `JobDeadLetter`, or adding `scanResult` to `UploadStatus`:
  none. A future reader must inherit the already-bounded stored value, which
  is the point — but the reader itself is a separate prompt with its own
  permission/envelope analysis.
- Any change to parser limits, XLSX container inspection, child-process
  isolation bounds, quarantine lifecycle, outbox retry/dead-letter policy,
  retention/purge windows, or progress events: untouched.
- Cross-version aggregate rollups and richer quality heuristics
  (`docs/analytics.md` residual): untouched.
- Schema/migration, new indexes, new env vars, new routes, permission-map
  changes, envelope/error-code additions, OpenAPI/SDL regeneration: none. The
  only changed identifier is the stored `scanResult` string value on the
  infected path.
- Dashboard, report, export, auth, upload-initiate/complete, or operations
  drill surfaces: untouched.
- Parser sandboxing, additional geography providers, live Garage/Valkey/ClamAV
  drills: future operational work, untouched.

## Expected impact — which routes change, and how

No route changes. No controller, permission, envelope, DTO, OpenAPI, or SDL
change:

- Upload reads (`GET uploads/:uploadId`, SSE `uploads/:uploadId/events`):
  unchanged — they serve `UploadStatus` from the `Upload` row, which never
  included `scanResult`/`scanStatus` and still does not.
- Jobs reads (`GET jobs/runs`): unchanged — `JobRunSummary` only.
- Worker behavior: identical state machine (`rejected` + `failed` durable +
  dead letter); only the persisted `Upload.scanResult` value on the infected
  path becomes bounded. BullMQ failed-job observability and the existing
  `recordQueueJob(..., 'failed')` metric are unchanged (no daemon text in
  labels).

## Measurements / reproduction procedure (backend-only; no visual surface)

There is no comp number to hit. Verify by procedure, before and after:

1. On the current tree, drive `UploadWorkerService.process` with
   `storage.getBuffer` resolving bytes and `scanner.scanBuffer` resolving
   `{ status: 'infected', signature: 'Win.Test.EICAR_HDB-1
   organizations/org-1/quarantine/secret' }`. Observe today: the
   `upload.update` `scanResult` contains the signature and the key fragment.
2. After the change: the same scan yields `scanStatus: 'infected'`,
   `scanResult` exactly `'infected'` containing no fragment of the signature,
   while the server log carries the raw signature; `failureCode` still
   `'infected'` with the fixed message; durable + dead-letter rows unchanged.
3. Confirm the `null`-buffer path still yields `scanResult: 'object_missing'`
   and the clean path still yields `scanResult: 'clean'`.

## Checks to run, and which docs file records the result

Run and quote real output (§10 rule 3); never claim a pass without running:

- `npm run lint`
- `npm run typecheck`
- `npm run contracts:check` (expect zero diff; `scanResult` is not part of
  `UploadStatus` or any DTO — verify and commit none)
- Targeted: worker spec
  (`npx jest --config server/jest.config.js` or the workspace equivalent the
  repo uses — resolve from `server/package.json`, do not invent flags), then
  the full `npm run test:server` real-database suite.
- `npm run build`
- `git diff --check` and `git status --short` review of the staged set.

Record the result in `docs/backend.md` (scan-result outcome) in the same
commit. `docs/ingestion.md` needs no change (ingestion paths untouched); if the
implementation touches a contract the backend doc enumerates, say so in the
review request rather than silently extending scope.

## Reference deltas

None — there is no visual surface and no comp applies. The `Upload` row keeps
the same shape and codes; only the `scanResult` string value on the infected
path becomes bounded.

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
- security-best-practices — durable `Upload.scanResult` sanitization; raw
  ClamAV daemon text confined to server logs; no new unauthenticated surface.
- error-handling-patterns — stable `infected` signal with bounded stored
  value; fail-closed generic for the unknown daemon string.
- javascript-testing-patterns — unit specs for verbatim/adversary-shaped
  signature mapping and logger assertion.
- e2e-testing-patterns — real-database regression posture for the persisted
  scan row under forced RLS (or a stated reason the unit gate suffices).
- api-design-principles — guard duty only: proves no route, permission,
  envelope, or error-code change ships with this fix.
- postgres-best-practices — only if a DB assertion needs it; no migration or
  index change is authorized — state why it does not apply.
- sql-optimization-patterns — not loaded: single-row scan writes, no plan
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
