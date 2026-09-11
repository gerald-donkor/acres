# 81 — narrow the inline `validation_failed` write to a fixed literal union

## Scope, and why it is next

The committed repository is on `main` at `e7b7098`
(`refactor(ingestion): narrow fail() failure union`). All 12 ordered phases in
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
`RETENTION_PURGE_BATCH_LIMIT = 500` across all five purges), and 80
(`IngestionProcessorService.fail()` narrowed to the fixed publication
code/message union).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 7 (geography and ingestion), with a
Phase 12 operations record, dependency-safe against prompts 68–80 (no
schema, migration, contract, route, permission, or version-marker change).

The gap is the last unguarded tenant-visible failure write on the ingestion
surface. The inline blocking-validation write in
`server/src/ingestion/ingestion-processor.service.ts` (lines 180–197):

```ts
await tx.ingestionRun.update({
  where: { id: runId },
  data: {
    state: 'validation_failed',
    stage: 'validate',
    progressPercent: 100,
    failureCode: 'validation_failed',
    failureMessage:
      'Ingestion validation produced blocking issues.',
    finishedAt: new Date(),
  },
});
```

writes two string literals straight into `IngestionRun.failureCode` /
`failureMessage`, which `toRunSummary` serves verbatim on
`GET /api/v1/ingestion-runs/:runId`
(`server/src/ingestion/ingestion.service.ts`, lines 499–516). Prompt 80
deliberately left this block out of `fail()` because it runs **inside** the
publication transaction (delete-issues/replace-summary/publish-version
atomic unit, lines 127–231) while `fail()` opens its **own**
`organizationScoped` transaction (lines 385–407); routing it through
`fail()` would split the atomic unit and change transactional boundaries.
That constraint stands. This prompt closes the remaining hole the same way
prompt 80 closed `fail()`: narrow the literals to exported `as const`
constants with a literal type, in place, with zero runtime behavior change.
After this change every tenant-visible `IngestionRun` failure write
(`validation_failed` inline, plus the three `fail()` union members:
`analytics_publication_failed` × 2 messages, `object_missing` × 1 message)
is a compile-time fixed literal.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 7 definition (§8, ingestion/publication
  surface) with its skill manifest; §§16–22 confirming 12E–12K committed;
  §1 rule that open numeric limits need real input and must not be invented
  (why no new code/message value appears here — only narrowing to existing
  ones).
- `docs/ingestion.md` — § Worker publication flow (lines 206–253: the
  `validation_failed` vs `failed` / `analytics_publication_failed`
  outcomes, the race-guard message, the fixed
  `PUBLICATION_UNEXPECTED_FAILURE_MESSAGE`, the prompt-80 `fail()` union
  clause at lines 238–241); the owning record for the one-clause doc update.
- `server/src/ingestion/ingestion-processor.service.ts` (408 lines, full
  file) — the gap: the inline write at lines 185–196; the transaction
  boundary that forbids routing through `fail()` (inline block inside the
  lines 127–231 `organizationScoped` unit vs `fail()`'s own transaction at
  lines 391–406); the prompt-80 union at lines 27–31 and `fail()` at lines
  385–407.
- `server/src/ingestion/ingestion-processor.service.spec.ts` (lines
  219–311) — existing runtime coverage that must stay green unchanged: the
  parser-timeout blocking case (line 229), the parser-failure blocking case
  (line 268), and the incompatible-remap case (line 304), each asserting
  `state: 'validation_failed'` / `failureCode: 'validation_failed'` plus
  `publishedVersion` null and no `publish` call.
- `server/src/ingestion/ingestion.service.ts` (lines 499–516,
  `toRunSummary`) — proves the served read shape is unchanged by this
  type-only change.
- `server/src/common/api-exception.filter.ts` and
  `server/src/graphql/graphql-error.filter.ts` — unknown throws already map
  to fixed `INTERNAL_ERROR` on both transports, so no envelope/filter
  change is needed or authorized here.

## Measurements and procedures (no eyeballed numbers)

No comp measurement is involved (server-only, type-only change). The
normative matrix is derived from the existing code:

| writer | `failureCode` today | `failureMessage` today | after |
| --- | --- | --- | --- |
| inline block, line 191–193 | `'validation_failed'` | `'Ingestion validation produced blocking issues.'` | identical values, now `as const` literals with a `ValidationFailureCode` / `ValidationFailureMessage` type |
| `fail()` line 235 (race guard) | `'analytics_publication_failed'` | `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE` | unchanged (prompt 80) |
| `fail()` line 243–247 (unexpected) | `'analytics_publication_failed'` | `PUBLICATION_UNEXPECTED_FAILURE_MESSAGE` | unchanged (prompt 80) |
| `fail()` line 82–86 (object missing) | `'object_missing'` | `'Accepted upload object is missing.'` | unchanged (prompt 80) |
| any other inline code/message | compiles today (the gap) | compiles today (the gap) | rejected by `tsc` |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: assign a `string`-typed variable (e.g. `error.message`) to
the inline `failureCode`/`failureMessage` position, confirm `tsc` rejects
it, quote the error, then revert the probe. The probe is not committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SSE
  shape, GraphQL type, permission, `JobRun` read model, or served
  `failureCode`/`failureMessage` value changes. `GET
  /ingestion-runs/:runId`, `GET /ingestion-runs/:runId/issues`, and the
  ingestion SSE stream behave byte-identically.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify
  with `npm run contracts:check` and state that it passes unchanged.

## Implementation steps

1. `server/src/ingestion/ingestion-processor.service.ts`: next to the
   prompt-80 constants (lines 19–31), add:
   `export const VALIDATION_FAILURE_CODE = 'validation_failed' as const;`
   `export const VALIDATION_FAILURE_MESSAGE = 'Ingestion validation produced blocking issues.' as const;`
   plus `type ValidationFailureCode = typeof VALIDATION_FAILURE_CODE;`
   and `type ValidationFailureMessage = typeof VALIDATION_FAILURE_MESSAGE;`.
   Keep the names exported so specs and future callers bind to the same
   literals (mirrors the exported `PUBLICATION_UNEXPECTED_FAILURE_MESSAGE`
   precedent).
2. Rewrite the inline write (lines 185–196) to use the constants, typed
   through the narrowed aliases (e.g. annotate the `data` literal or the
   two fields with the new types so a future `string` assignment fails
   compilation). State remains `'validation_failed'`, stage `'validate'`,
   `progressPercent: 100`, `finishedAt: new Date()` — values unchanged.
3. Do NOT route the block through `fail()`. Do NOT move the write outside
   the lines 127–231 transaction. Do NOT touch `fail()`, its union, its
   three call sites, `validateMapping`, `matchRegion`, `publishVersion`,
   or the `running`-marking write (lines 63–74, whose `failureCode: null`
   reset stays as-is). If the narrow rewrite requires touching any of
   those, stop — the premise is broken.
4. Run the temporary negative probe from the matrix above; quote the
   `tsc` rejection; revert the probe before staging.
5. Existing specs (the three `validation_failed` cases at spec lines 229,
   268, 304; the race-guard/unexpected/non-Error `fail()` cases) must pass
   unchanged in expectation. No new runtime test is required — the runtime
   behavior is already pinned; the new property is the narrowed write
   itself, verified by `typecheck` plus the probe.
6. Docs in the same change: `docs/ingestion.md` § Worker publication flow
   — one clause recording that the inline `validation_failed` write
   accepts only the fixed code/message literals (compile-time guard;
   runtime values unchanged; deliberately not routed through `fail()` to
   preserve the publication-transaction boundary). `docs/backend.md`
   untouched (it names no inline-write signature); say so in the summary.

## Non-goals

- No `fail()` signature, union, call-site, or logging change (prompt 80
  owns that surface; verify it stays green).
- No new failure code, message, envelope, or `ApiException` factory.
- No predicate, cadence, guard, metric, queue, SSE, or single-instance
  (`SCHEDULER_ENABLED`) change.
- No schema or migration change: the `IngestionRun` columns are
  untouched; only TypeScript constants/types narrow.
- No `JobRun` self-retention purge (prompt 79 names it: five ticks write
  ≥ five rows an hour with no reclamation, but the window is an explicit
  open operator decision per `docs/operations.md` `data_retention_policy`;
  build-plan §1 forbids inventing it).
- No live Docker drills (restart/orphan/Garage/Valkey/ClamAV remain
  future operational work per prompts 72–80).

## Reference deltas

None visual (server-only). The one deliberate property delta, stated so
it is not mistaken for a regression: code that previously compiled when
writing an arbitrary string into the inline `validation_failed`
`failureCode`/`failureMessage` no longer compiles. No committed runtime
path changes value, order, or shape.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State
this in the completion summary; do not run browser suites for this
change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1
  generation) — including the temporary negative probe rejection,
  quoted, then reverted.
- Targeted server suites: `ingestion-processor.service.spec.ts` (all
  `validation_failed` + `fail()` cases), then the full `npm run
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

- `nestjs-best-practices` — constant/type placement inside the existing
  injectable; no service wiring, module, or provider change; transaction
  boundary (`db-use-transactions`) preserved by not routing through
  `fail()`.
- `error-handling-patterns` — fixed failure taxonomy preserved;
  compile-time guard so raw text can never reach the tenant-visible
  failure columns (fail-fast at the type level, originals stay
  server-log-only).
- `javascript-testing-patterns` — existing `validation_failed` specs stay
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
  surface), `security-best-practices` / `security-threat-model` (no trust
  boundary change; sanitization lineage already proven in prompts 73–80).
