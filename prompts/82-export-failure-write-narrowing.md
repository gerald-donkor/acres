# 82 — narrow `ExportFailure` to the fixed export failure union

## Scope, and why it is next

The committed repository is on `main` at `60c9223`
(`refactor(ingestion): narrow validation write`). All 12 ordered phases in
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
code/message union), and 81 (inline `validation_failed` write narrowed to
fixed literals).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 10 (reports and exports), with a Phase
12 operations record, dependency-safe against prompts 68–81 (no schema,
migration, contract, route, permission, or version-marker change).

The gap is the last free-text write into a tenant-visible failure column on
the export surface. `ExportFailure` in
`server/src/reports/reports.service.ts` (lines 882–889):

```ts
class ExportFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
```

writes both fields straight into `ExportRequest.failureCode` /
`failureMessage` (lines 706–716), which `toExport` serves verbatim on
`GET /api/v1/exports` and `GET /api/v1/exports/:exportId`
(`server/src/reports/reports.service.ts`, lines 1022–1055,
`failure: { code, message }`). Today both construction sites pass fixed
literals — lines 647–650
`new ExportFailure('missing_revision', 'Published revision not found.')`
and lines 701–704
`new ExportFailure('render_failed', 'Export rendering failed.')` — but the
signature permits any future caller to persist raw exception text
(constraint names, storage keys, paths, renderer internals) into the same
tenant-readable columns. That is the exact inversion prompts 80–81
eliminated on the ingestion surface; this prompt closes it at the type
level with zero runtime behavior change.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 10 definition (§11, report/export surface)
  with its skill manifest; §§16–22 confirming 12E–12K committed; §1 rule
  that open numeric limits need real input and must not be invented (why no
  new code/message value appears here — only narrowing to existing ones).
- `docs/reports.md` — § Worker and artifacts (fixed CSV formula-escaping
  and deterministic PDF rendering); § Residual gaps (prompt-70 purge and
  prompt-71 expiry clauses); the owning record for the one-clause doc
  update.
- `server/src/reports/reports.service.ts` (1187 lines, full file) — the
  gap: `ExportFailure` signature at lines 882–889; the tenant write at
  lines 706–716; the two construction sites at lines 647–650
  (`missing_revision`) and 701–704 (`render_failed` fallback for any
  non-`ExportFailure` throw); the served read shape at lines 1022–1055
  (`toExport`).
- `server/src/reports/reports.service.spec.ts` (lines 1884–1931) —
  existing runtime coverage that must stay green unchanged: the
  missing-revision case (lines 1884–1904, asserting
  `failureCode: 'missing_revision'` /
  `failureMessage: 'Published revision not found.'`) and the
  unexpected-crash case (lines 1906–1931, driving
  `putBuffer` rejection with `new Error('S3 upload timeout')` and
  asserting `failureCode: 'render_failed'` /
  `failureMessage: 'Export rendering failed.'`).
- `server/src/ingestion/ingestion-processor.service.ts` (lines 19–38) —
  the prompt-80/81 precedent: `as const` message constants plus
  `PublicationFailureCode` / `PublicationFailureMessage` and
  `VALIDATION_FAILURE_CODE` / `VALIDATION_FAILURE_MESSAGE` unions; the
  pattern to mirror here.
- `server/src/common/api-exception.filter.ts` and
  `server/src/graphql/graphql-error.filter.ts` — unknown throws already map
  to fixed `INTERNAL_ERROR` on both transports, so no envelope/filter
  change is needed or authorized here.

## Measurements and procedures (no eyeballed numbers)

No comp measurement is involved (server-only, type-only change). The
normative matrix is derived from the existing code:

| construction site | `code` today | `message` today | after |
| --- | --- | --- | --- |
| lines 647–650 (missing revision) | `'missing_revision'` | `'Published revision not found.'` | identical values, now `as const` literals with a `ExportFailureCode` / `ExportFailureMessage` type |
| lines 701–704 (unexpected catch) | `'render_failed'` | `'Export rendering failed.'` | identical values, now type-checked |
| any other `code`/`message` | compiles today (the gap) | compiles today (the gap) | rejected by `tsc` |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: pass a `string`-typed variable (e.g. `error.message`) as
either `ExportFailure` constructor argument, confirm `tsc` rejects it,
quote the error, then revert the probe. The probe is not committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SSE
  shape, GraphQL type, permission, `ExportArtifact`/`StoredObject` write,
  or served `failure.code`/`failure.message` value changes. `GET
  /exports`, `GET /exports/:exportId`, `GET /exports/:exportId/download`,
  and `GET /exports/:exportId/events` behave byte-identically.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify
  with `npm run contracts:check` and state that it passes unchanged.

## Implementation steps

1. `server/src/reports/reports.service.ts`: next to `RENDERING_VERSION`
   (line 29) or directly above `ExportFailure` (lines 882–889), add:
   `export const EXPORT_MISSING_REVISION_CODE = 'missing_revision' as const;`
   `export const EXPORT_MISSING_REVISION_MESSAGE = 'Published revision not found.' as const;`
   `export const EXPORT_RENDER_FAILED_CODE = 'render_failed' as const;`
   `export const EXPORT_RENDER_FAILED_MESSAGE = 'Export rendering failed.' as const;`
   plus `type ExportFailureCode = typeof EXPORT_MISSING_REVISION_CODE | typeof EXPORT_RENDER_FAILED_CODE;`
   and `type ExportFailureMessage = typeof EXPORT_MISSING_REVISION_MESSAGE | typeof EXPORT_RENDER_FAILED_MESSAGE;`.
   Keep the constants exported so specs and future callers bind to the same
   literals (mirrors the exported `PUBLICATION_UNEXPECTED_FAILURE_MESSAGE`
   precedent from prompt 80). Narrow `ExportFailure` to
   `(code: ExportFailureCode, message: ExportFailureMessage)`. Body
   unchanged — the `logger.warn(\`Export ${exportRequestId} failed: ${failure.code}\`)`
   line already logs only the bounded code.
2. Call sites (lines 647–650, 701–704) must compile unchanged with no
   casts. If either needs a cast, stop — the union is wrong and the premise
   of this prompt is broken.
3. Do NOT touch `renderCsv`, `renderPdf`, `escapeFormula`, the
   `succeeded`-path `StoredObject`/`ExportArtifact` writes (lines 664–698),
   `resolveEvidence`, `resolveExportTarget`, `toExport`, the purge tick
   (prompt 70), or the download expiry read (prompt 71). If the narrow
   rewrite requires touching any of those, stop — the premise is broken.
4. Run the temporary negative probe from the matrix above; quote the
   `tsc` rejection; revert the probe before staging.
5. Existing specs (the two `processExport` failure cases at spec lines
   1884–1931; the formula/PDF suites) must pass unchanged in expectation.
   No new runtime test is required — the runtime behavior is already
   pinned; the new property is the constructor signature itself, verified
   by `typecheck` plus the probe.
6. Docs in the same change: `docs/reports.md` § Worker and artifacts —
   one clause recording that `ExportFailure` accepts only the fixed
   `missing_revision` / `render_failed` code/message union
   (compile-time guard; runtime values unchanged). `docs/backend.md`
   untouched (it names no `ExportFailure` signature); say so in the
   summary.

## Non-goals

- No new failure code, message, envelope, or `ApiException` factory.
- No renderer, formula-escaping, checksum, object-key, TTL, purge-cadence,
  expiry-enforcement, SSE, or single-instance (`SCHEDULER_ENABLED`)
  change.
- No schema or migration change: the `ExportRequest` columns are
  untouched; only TypeScript constants/types narrow.
- No `JobRun` self-retention purge (prompt 79 names it: five ticks write
  ≥ five rows an hour with no reclamation, but the window is an explicit
  open operator decision per `docs/operations.md` `data_retention_policy`;
  build-plan §1 forbids inventing it).
- No live Docker drills (restart/orphan/Garage/Valkey/ClamAV remain
  future operational work per prompts 72–81).
- No upload-worker `scanResult`/`failureCode` change (prompt 76 owns that
  surface; verify it stays green).

## Reference deltas

None visual (server-only). The one deliberate property delta, stated so
it is not mistaken for a regression: code that previously compiled when
passing an arbitrary string to `new ExportFailure()` no longer compiles.
No committed runtime path changes value, order, or shape.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State
this in the completion summary; do not run browser suites for this
change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1
  generation) — including the temporary negative probe rejection,
  quoted, then reverted.
- Targeted server suites: `reports.service.spec.ts` (both
  `processExport` failure cases), then the full `npm run test:server` —
  do not claim the full suite from a targeted run.
- `npm run contracts:check` (expected: passes unchanged; if it fails,
  stop — no contract artifact should move for this change).
- `git diff --check` and `git status --short` review; stage only
  approved files.
- Then the §2.1 two-stage review loop (`requesting-code-review` subagent
  with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
  verification) and the `caveman-commit` message.
- Record the result in `docs/reports.md` in the same change.

## SKILLS USED

- `nestjs-best-practices` — constant/type placement next to the existing
  injectable; no service wiring, module, or provider change.
- `error-handling-patterns` — fixed failure taxonomy preserved;
  compile-time guard so raw exception text can never reach the
  tenant-visible failure columns (fail-fast at the type level, originals
  stay server-log-only).
- `javascript-testing-patterns` — existing `processExport` failure specs
  stay green unchanged; negative type-probe procedure.
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
  boundary change; sanitization lineage already proven in prompts 73–81).
