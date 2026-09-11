# 79 — bounded per-tick retention purges (`RETENTION_PURGE_BATCH_LIMIT`)

## Scope, and why it is next

The committed repository is on `main` at `7c4eccc`
(`feat(auth): restrict job runs to owner and admin`). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus residual follow-ups 68 (saved-view
`schemaVersion`), 69 (frozen dashboard-evidence `schemaVersion`), 70 (hourly
`exports.purge-expired` reclamation), 71 (download-time expiry enforcement),
72 (incompatible-metric-remap pre-publication validation), 73 (unexpected
publication-failure message sanitization), 74 (`parser_exception` fixed
message), 75 (`worker_exception` fixed message), 76 (infected `scanResult`
bounded to `'infected'`), 77 (scheduled-job `JobRun.message` fixed strings),
and 78 (`jobs.read` owner/admin gate on `GET /jobs/runs`).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 6 (scheduled retention maintenance) with
a Phase 12 operations record, dependency-safe against prompts 68–78 (no
schema, migration, contract, route, permission, or version-marker change).

The gap is that four of the five hourly purge paths issue **unbounded**
single-statement writes per tick, while the fifth is already bounded. Prompt
70 established both the failure mode and the fix pattern on
`exports.purge-expired`: `EXPORTS_PURGE_BATCH_LIMIT = 500`,
oldest-expiry-first `findMany` with `take`, select-then-write by id list, so
"a backlog drains without an unbounded query"
(`server/src/jobs/retention-maintenance.job.ts`, lines 28–32, 195–208). The
four unbounded siblings:

- `sessions.purge-expired` → `SessionsService.purgeExpired`
  (`server/src/sessions/sessions.service.ts`, lines 89–96): one unbounded
  `deleteMany` over `OR(expiresAt < now, revokedAt NOT NULL)`. The method's
  own comment (lines 79–88) already notes the predicate is a sequential
  scan; after any scheduler outage or bulk-revocation event a single tick
  attempts the whole backlog in one statement.
- `uploads.purge-expired` (`retention-maintenance.job.ts`, lines 63–86):
  unbounded `findMany` (no `take`, no `orderBy`) plus two unbounded
  `updateMany`.
- `idempotency.purge-expired` (lines 117–127): one unbounded `deleteMany`.
- `tokens.purge-expired` (lines 152–161): two unbounded `deleteMany` inside
  one `$transaction`.

This prompt generalizes the decided 500-row bound to all five purges,
mirroring the exports select-oldest-first-then-write-by-ids shape. No other
production behavior changes: same predicates, same hourly cadence, same
`JobRun` fixed messages (prompts 77–78), same succeeded-count messages, same
single-instance `SCHEDULER_ENABLED` gate.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 6 definition (§7, jobs/retention/outbox
  worker surface) with its skill manifest; §§16–22 confirming 12E–12K
  committed; §1 rule that open numeric limits need real input and must not
  be invented (why the bound value is reused, not chosen — see below).
- `docs/backend.md` — § jobs/retention rows (lines 438–456: the five purge
  jobs and their fixed messages), the session-purge predicate paragraph
  (line 487), the retention evidence block (lines 2182–2192).
- `docs/operations.md` — scheduler inventory row (line 73), the open
  `data_retention_policy` decision (line 181 — why `JobRun`/audit
  self-retention is a non-goal here), the purge-jobs list (lines 301–310,
  to be updated in the same change).
- `server/src/jobs/retention-maintenance.job.ts` (318 lines, full file) —
  the four unbounded paths above and the bounded exports path (lines
  179–313) that is the pattern to mirror.
- `server/src/sessions/sessions.service.ts` (lines 79–96) — the unbounded
  `deleteMany` and its sequential-scan comment.
- `server/src/jobs/session-maintenance.job.ts` (73 lines, full file) —
  unchanged caller; `purgeExpired()` signature stays `(before?: Date) =>
  Promise<number>`.
- `server/src/jobs/job-runs.service.ts` (54 lines, full file) — `start` /
  `finish` / `listRecent` unchanged; no service edit is expected.
- `server/src/jobs/retention-maintenance.job.spec.ts` — existing per-purge
  describes; the exports `'bounds each tick to the documented batch limit'`
  case (line 514) is the test pattern to mirror for the other four purges.
- `server/src/jobs/session-maintenance.job.spec.ts` — mocks
  `SessionsService` at the boundary (line 33); unchanged, must keep
  passing byte-identical in expectation.
- `server/test/database.e2e-spec.ts` (lines ~2571, ~2675) — real-PostgreSQL
  export-purge gates from prompt 70; the proving ground cited for why
  e2e additions stay minimal here (unit specs carry the bound; the full
  `test:server` suite regresses the rest).

## Measurements and procedures (no eyeballed numbers)

No comp measurement is involved (server-only change). The bound value is
**not** a new number: `EXPORTS_PURGE_BATCH_LIMIT = 500` is the decided
constant from prompt 70 for the same hourly tick, same drain-over-ticks
argument, and same single-statement hazard. Generalizing its scope (rename
to `RETENTION_PURGE_BATCH_LIMIT`, same value `500`, exports path switched
to the shared name with zero behavior change) is a judgement recorded
here, not a measurement. The normative per-tick matrix is derived from the
existing code and tests:

| expired backlog `N` for one purge | tick purges | order | writes issued | `JobRun` row |
| --- | --- | --- | --- | --- |
| `N = 0` | `0` | n/a | none (early return, preserving the existing "without calling updateMany" semantics) | `succeeded`, `purged 0 …` |
| `0 < N <= 500` | `N` | oldest `expiresAt` first | bounded id-scoped statements only | `succeeded`, `purged N …` |
| `N > 500` | `500` | oldest `expiresAt` first | bounded id-scoped statements only; remainder drains on later ticks | `succeeded`, `purged 500 …` |
| scheduler disabled | `0` | n/a | none | no run row (unchanged) |
| `runs.start` throws | `0` | n/a | none | none; log-only (unchanged) |
| purge write throws | `0` | n/a | the failed bounded attempt | `failed`, existing fixed message per purge (unchanged) |

Sessions ordering note, recorded so implementation does not improvise it:
the predicate stays `OR(expiresAt < before, revokedAt NOT NULL)` with
`orderBy: { expiresAt: 'asc' }`. Revoked-but-unexpired rows sort after
expired rows under that key — acceptable and documented in the method
comment: still bounded, still drains, same predicate, no row left behind
forever.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SSE
  shape, GraphQL type, permission, or `JobRun` read model changes.
- Tick-level behavior change only: each purge does bounded oldest-first
  work per tick and reports the per-tick count honestly (existing
  `purged N …` messages already report counts; backlogs now drain across
  ticks instead of in one statement).
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify
  with `npm run contracts:check` and state that it passes unchanged.

## Implementation steps

1. `server/src/jobs/retention-maintenance.job.ts`: rename
   `EXPORTS_PURGE_BATCH_LIMIT` to `RETENTION_PURGE_BATCH_LIMIT` (value
   stays `500`; keep the existing doc comment, widened to name all five
   purges). Update the exports path to the shared name — no other change
   there.
2. `purgeExpiredUploads`: add `orderBy: { expiresAt: 'asc' }, take:
   RETENTION_PURGE_BATCH_LIMIT` to the `findMany` (line 66). The existing
   `updateMany … where: { id: { in } }` statements are then bounded by
   construction; keep the `if (expired.length === 0) return 0` early
   return.
3. `purgeExpiredIdempotency`: replace the unbounded `deleteMany` with a
   bounded `findMany` (`where: { expiresAt: { lte: now } }`,
   `select: { id: true }`, `orderBy: { expiresAt: 'asc' }`,
   `take: RETENTION_PURGE_BATCH_LIMIT`) followed by
   `deleteMany({ where: { id: { in: ids } } })`, skipping the delete when
   the id list is empty. Succeeded message keeps reporting the purged
   count.
4. `purgeExpiredTokens`: same select-then-delete conversion per table
   (`accountToken`, `invitation`), each `orderBy: { expiresAt: 'asc' }`,
   `take: RETENTION_PURGE_BATCH_LIMIT`, inside the existing single
   `$transaction`; skip an arm whose id list is empty. Combined succeeded
   message unchanged in shape.
5. `server/src/sessions/sessions.service.ts` `purgeExpired`: keep the
   predicate and the `(before = new Date())` signature; select bounded
   ids (`orderBy: { expiresAt: 'asc' }`, `take` the shared limit —
   import it from the jobs module is a layering smell, so define the
   constant in a neutral home both files already depend on or duplicate
   the import path decision explicitly in the change; do NOT create a new
   shared module for one number — either import from
   `../jobs/retention-maintenance.job` if no cycle results, or move the
   constant to `../config/`-adjacent constants with both files importing
   it; verify with typecheck and state the choice), then
   `deleteMany({ where: { id: { in: ids } } })`, returning `0` without a
   write when empty. Extend the sequential-scan comment with the
   revoked-rows-sort-last sentence from the matrix above.
6. Tests (mocked-Prisma unit level, mirroring the existing exports
   bound case at spec line 514): backlog-drain cases for uploads,
   idempotency, tokens (extend `retention-maintenance.job.spec.ts`),
   asserting `take: 500` + oldest-first ordering reach the select, writes
   are id-scoped, empty backlogs issue no write, and a `500`-of-`600`
   backlog reports `purged 500 …` with the remainder left for the next
   tick. Sessions bound covered at the service level (mocked Prisma
   `findMany`/`deleteMany` assertions for take/order/id-scoping/empty —
   new `server/src/sessions/sessions.service.spec.ts` if no sessions spec
   exists; check before creating). Existing fixed-message failure cases
   and `session-maintenance.job.spec.ts` must pass unchanged.
7. Docs in the same change: `docs/backend.md` purge rows (bounded-tick
   rule + shared limit name); `docs/operations.md` purge-jobs list
   (lines 301–310, same rule). One row each, no new sections.

## Non-goals

- No `JobRun` self-retention purge. Five ticks write at least five rows
  an hour with no reclamation, but the retention window is an explicit
  open operator decision (`docs/operations.md` line 181
  `data_retention_policy`; build-plan §1 forbids inventing it). Named
  here so a later operator-approved prompt can scope it; not smuggled
  in as a constant.
- No audit-event or dead-letter retention (TM-16 later work; dead
  letters are audit trail).
- No predicate, cadence, message, guard, metric (`recordJobRun`
  untouched), or single-instance (`SCHEDULER_ENABLED`) change.
- No live Docker drills (restart/orphan/Garage/Valkey/ClamAV remain
  future operational work per prompts 72–78).

## Reference deltas

None visual (server-only). The one deliberate behavior delta: a tick with
more than 500 expired rows in any purge now reclaims the oldest 500 and
leaves the rest for later ticks, instead of attempting the whole backlog
in one statement. Per-tick `JobRun` succeeded counts during a drain read
`purged 500 …` until the backlog clears. This is the point of the prompt,
recorded in `docs/backend.md` and `docs/operations.md`, not a regression.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State
this in the completion summary; do not run browser suites for this
change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1
  generation).
- Targeted server suites: `retention-maintenance.job.spec.ts`,
  `session-maintenance.job.spec.ts`, and the sessions service spec
  (new or existing), then the full `npm run test:server` — do not claim
  the full suite from a targeted run.
- `npm run contracts:check` (expected: passes unchanged; if it fails,
  stop — no contract artifact should move for this change).
- `git diff --check` and `git status --short` review; stage only
  approved files.
- Then the §2.1 two-stage review loop (`requesting-code-review` subagent
  with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
  verification) and the `caveman-commit` message.
- Record the result in `docs/backend.md` + `docs/operations.md` in the
  same change.

## SKILLS USED

- `nestjs-best-practices` — scheduler/job pattern, Prisma access shape,
  module/constant placement without layering cycles.
- `postgres-best-practices` — bounded deletes, `expiresAt` ordering and
  index behavior for the cleanup selects.
- `sql-optimization-patterns` — cleanup-query plans (conditional per the
  Phase 6 manifest; the sessions OR-scan comment makes it applicable —
  load it).
- `javascript-testing-patterns` — mocked-Prisma backlog-drain unit cases
  mirroring the existing exports bound test.
- `error-handling-patterns` — failure taxonomy unchanged (fixed
  messages, log-only originals); tick-level partial-drain semantics.
- `requesting-code-review` — Stage 1 reviewer subagent dispatch after
  self-verification (§2.1).
- `receiving-code-review` — Stage 2 technical evaluation of review
  feedback before any fix.
- `caveman-commit` — the commit message (ALWAYS rule, §3/§7).
- Loaded and deliberately not used: `prometheus-configuration` (no
  metric/label change — `recordJobRun` untouched),
  `api-design-principles` / `openapi-spec-generation` (no contract
  change — verified by `contracts:check`),
  `e2e-testing-patterns` / `playwright` (server-only change, no browser
  surface).
