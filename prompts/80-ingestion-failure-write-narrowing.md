# 80 — narrow `IngestionProcessorService.fail()` to the fixed publication failure union

## Scope, and why it is next

The committed repository is on `main` at `75e2299`
(`feat(jobs): bound retention purges per tick`). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus residual follow-ups 68 (saved-view
`schemaVersion`), 69 (frozen dashboard-evidence `schemaVersion`), 70 (hourly
`exports.purge-expired` reclamation), 71 (download-time expiry enforcement),
72 (incompatible-metric-remap pre-publication validation), 73 (unexpected
publication-failure message sanitization), 74 (`parser_exception` fixed
message), 75 (`worker_exception` fixed message), 76 (infected `scanResult`
bounded to `'infected'`), 77 (scheduled-job `JobRun.message` fixed strings),
78 (`jobs.read` owner/admin gate on `GET /jobs/runs`), and 79 (shared
`RETENTION_PURGE_BATCH_LIMIT = 500` across all five purges).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 7 (geography and ingestion), with a
Phase 12 operations record, dependency-safe against prompts 68–79 (no
schema, migration, contract, route, permission, or version-marker change).

The gap is the last free-text write into a tenant-visible failure column on
the ingestion surface. `fail()` in
`server/src/ingestion/ingestion-processor.service.ts` (lines 379–401):

```ts
private async fail(
  run: { id: string; actorAccountId: string; organizationId: string },
  code: string,
  message: string,
): Promise<void> {
```

writes both parameters straight into `IngestionRun.failureCode` /
`failureMessage` (lines 389–394), which `toRunSummary` serves verbatim on
`GET /api/v1/ingestion-runs/:runId`
(`server/src/ingestion/ingestion.service.ts`, lines 489–521). Today both
call sites pass fixed literals — line 229
`fail(reserved, 'analytics_publication_failed', raw)` where `raw` is exactly
`PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE`, and line 237
`fail(reserved, 'analytics_publication_failed',
PUBLICATION_UNEXPECTED_FAILURE_MESSAGE)` — but the signature permits any
future caller to persist raw exception text (constraint names, keys, paths,
file excerpts) into the same tenant-readable columns. That is the exact
inversion prompts 73–77 eliminated on the sibling publication/parser/worker/
scan/purge surfaces; this prompt closes it at the type level with zero
runtime behavior change.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 7 definition (§8, ingestion/publication
  surface) with its skill manifest; §§16–22 confirming 12E–12K committed;
  §1 rule that open numeric limits need real input and must not be invented
  (why no new code/message value appears here — only narrowing to existing
  ones).
- `docs/ingestion.md` — § Worker publication flow (lines ~206–252: the
  `validation_failed` vs `failed` / `analytics_publication_failed`
  outcomes, the race-guard message, the fixed
  `PUBLICATION_UNEXPECTED_FAILURE_MESSAGE`, server-log-only originals);
  the owning record for the one-clause doc update.
- `server/src/ingestion/ingestion-processor.service.ts` (402 lines, full
  file) — the gap: `fail()` signature at lines 379–383, the tenant write at
  lines 385–399, the two call sites at lines 226–243, the fixed constant at
  lines 19–25, and the inline (non-`fail`) `validation_failed` write at
  lines 179–190 that is deliberately out of scope (see Non-goals).
- `server/src/analytics/analytics-publication.service.ts` (lines 42–43) —
  `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` declaration; the other half
  of the message union.
- `server/src/ingestion/ingestion-processor.service.spec.ts` (lines
  ~300–377) — existing runtime coverage that must stay green unchanged:
  the race-guard passthrough case (line 313), the unexpected-error fixed
  message case (line 337), and the non-Error rejection case (line 363),
  each asserting the stored `failureCode`/`failureMessage` plus
  not-to-contain guards on key material.
- `server/src/ingestion/ingestion.service.ts` (lines 489–521,
  `toRunSummary`) — proves the served read shape is unchanged by this
  type-only change.
- `server/src/common/api-exception.filter.ts` (lines 22–56) and
  `server/src/graphql/graphql-error.filter.ts` (lines 26–35) — confirm
  unknown throws already map to fixed `INTERNAL_ERROR` on both transports,
  so no envelope/filter change is needed or authorized here.

## Measurements and procedures (no eyeballed numbers)

No comp measurement is involved (server-only, type-only change). The
normative matrix is derived from the existing code:

| caller of `fail()` | `code` today | `message` today | after |
| --- | --- | --- | --- |
| line 229 (race guard exact match) | `'analytics_publication_failed'` | `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` | identical, now type-checked |
| line 237 (unexpected publication error) | `'analytics_publication_failed'` | `PUBLICATION_UNEXPECTED_FAILURE_MESSAGE` | identical, now type-checked |
| any other `code`/`message` | compiles today (the gap) | compiles today (the gap) | rejected by `tsc` |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: pass a `string`-typed variable (e.g. `error.message`) as
either argument, confirm `tsc` rejects it, quote the error, then revert the
probe. The probe is not committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SSE
  shape, GraphQL type, permission, `JobRun` read model, or served
  `failureCode`/`failureMessage` value changes. `GET
  /ingestion-runs/:runId`, `GET /ingestion-runs/:runId/issues`, and the
  ingestion SSE stream behave byte-identically.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify
  with `npm run contracts:check` and state that it passes unchanged.

## Implementation steps

1. `server/src/analytics/analytics-publication.service.ts`: add `as const`
   to `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` (line 42–43) so its
   type is the literal, not `string`. Verify no consumer breaks (literal
   is assignable to `string`; the only uses are the `===` comparison in
   the processor and spec assertions).
2. `server/src/ingestion/ingestion-processor.service.ts`: add `as const`
   to `PUBLICATION_UNEXPECTED_FAILURE_MESSAGE` (lines 24–25) for the same
   reason, then declare a module-local union next to `fail()`:
   `type PublicationFailureCode = 'analytics_publication_failed';`
   `type PublicationFailureMessage = typeof
   PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE | typeof
   PUBLICATION_UNEXPECTED_FAILURE_MESSAGE;`
   Narrow `fail()` to `(run, code: PublicationFailureCode, message:
   PublicationFailureMessage)`. Body unchanged — the
   `logger.warn(\`Ingestion run ${run.id} failed: ${code}\`)` line already
   logs only the bounded code.
3. Call sites (lines 229, 237) must compile unchanged with no casts. If
   either needs a cast, stop — the union is wrong and the premise of this
   prompt is broken.
4. Run the temporary negative probe from the matrix above; quote the
   `tsc` rejection; revert the probe before staging.
5. Existing specs
   (`ingestion-processor.service.spec.ts` race-guard/unexpected/non-Error
   cases; `analytics-publication.service.spec.ts` race-guard case) must
   pass unchanged in expectation. No new runtime test is required — the
   runtime behavior is already pinned; the new property is the signature
   itself, verified by `typecheck` plus the probe.
6. Docs in the same change: `docs/ingestion.md` § Worker publication flow
   — one clause recording that `fail()` accepts only the fixed
   publication code/message union (compile-time guard; runtime values
   unchanged). `docs/backend.md` untouched (it names no `fail()`
   signature); say so in the summary.

## Non-goals

- No routing of the inline `validation_failed` write (lines 179–190)
  through `fail()`. That block runs inside the publication transaction
  while `fail()` opens its own `organizationScoped` transaction;
  unifying them would change transactional boundaries. Named here so a
  later prompt can scope it deliberately; not smuggled in.
- No new failure code, message, envelope, or `ApiException` factory.
- No predicate, cadence, guard, metric, queue, SSE, or single-instance
  (`SCHEDULER_ENABLED`) change.
- No schema or migration change: the `IngestionRun` columns are
  untouched; only the TypeScript parameter types narrow.
- No live Docker drills (restart/orphan/Garage/Valkey/ClamAV remain
  future operational work per prompts 72–79).

## Reference deltas

None visual (server-only). The one deliberate property delta, stated so
it is not mistaken for a regression: code that previously compiled when
passing an arbitrary string to `fail()` no longer compiles. No committed
runtime path changes value, order, or shape.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State
this in the completion summary; do not run browser suites for this
change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1
  generation) — including the temporary negative probe rejection,
  quoted, then reverted.
- Targeted server suites: `ingestion-processor.service.spec.ts` and
  `analytics-publication.service.spec.ts`, then the full `npm run
  test:server` — do not claim the full suite from a targeted run.
- `npm run contracts:check` (expected: passes unchanged; if it fails,
  stop — no contract artifact should move for this change).
- `git diff --check` and `git status --short` review; stage only
  approved files.
- Then the §2.1 two-stage review loop (`requesting-code-review` subagent
  with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
  verification) and the `caveman-commit` message.
- Record the result in `docs/ingestion.md` in the same change.

## SKILLS USED

- `nestjs-best-practices` — private-helper shape inside the existing
  injectable; no service wiring, module, or provider change.
- `error-handling-patterns` — fixed failure taxonomy preserved;
  compile-time guard so raw exception text can never reach the
  tenant-visible failure columns (fail-fast at the type level, originals
  stay server-log-only).
- `javascript-testing-patterns` — existing fixed-message specs stay
  green unchanged; negative type-probe procedure.
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
  surface).
