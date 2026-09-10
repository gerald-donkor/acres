# 74 - parser-exception message sanitization

## Scope, and why it is next

The committed repository is on `main` at `c692b5d`
(`fix(ingestion): sanitize publication failure messages`). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus residual follow-ups 68 (saved-view
`schemaVersion`), 69 (frozen dashboard-evidence `schemaVersion`), 70 (hourly
`exports.purge-expired` reclamation), 71 (download-time expiry enforcement),
72 (incompatible-metric-remap pre-publication validation), and 73 (unexpected
publication-failure message sanitization).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 7, dependency-safe against prompts 68–73
(no schema, migration, contract, route, or version-marker change).

The gap is the catch-all in `parseSourceBuffer`
(`server/src/ingestion/parsers/parse-source-buffer.ts`, lines 53–73):

```ts
} catch (error) {
  return {
    ...
    issues: [
      {
        severity: 'error',
        code: 'parser_exception',
        message:
          error instanceof Error
            ? error.message.slice(0, 180)
            : 'Parser failed.',
      },
    ],
    ...
  };
}
```

Prompt 73 explicitly deferred this path ("`parseSourceBuffer`'s
`parser_exception` verbatim slice ... deliberately left for a separate prompt").
The raw parser error is persisted verbatim (truncated to 180 chars) into a
`ValidationIssue` row by `IngestionProcessorService.process` (lines 153–172 map
every `summary.issues` entry, including `parser_exception`, into
`validationIssue.createMany`), and it is tenant-visible through the existing
read model (`ingestion.service.ts:310–339`, `listIssues` returns `message`
verbatim, bounded to 100 rows; route `GET ingestion-runs/:runId/issues` in
`ingestion.controller.ts:273`). Thrown parser errors can carry file-content
excerpts (CSV/GeoJSON cell text that tripped a parser), embedded paths, or
library internals — the same inversion prompts 72/73 fixed: raw detail stored
where tenants read it, never logged where operators debug it.

The sibling paths are already fixed and are the pattern to mirror:
`validation_failed` uses the fixed `'Ingestion validation produced blocking
issues.'`; the unexpected-publication path uses the fixed `'Analytics
publication failed unexpectedly.'` with the original error in server logs only.
The child-process boundary (`parser-child.entry.ts:65–75`) already maps an
outer execution failure to the fixed `'Parser execution failed.'`, and
`SourceParserService` already maps oversize buffers to the fixed `'Source file
size exceeds the temporary parser limit.'` — so a fixed `parser_exception`
message is consistent with every neighboring message on this surface.

This prompt maps the `parser_exception` message to one fixed safe string,
preserves the `parser_exception` code (no new code), and logs the original
error server-side only. The `unsupported_media_type` fixed message, the
`validation_failed` path, the publication path, and every route/permission/
envelope stays unchanged.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 7 definition (§8) with its skill manifest;
  §§16–22 confirming 12E–12K committed; establishes no unbuilt ordered phase
  and that this is a Phase 7 residual.
- `docs/ingestion.md` (full file, 387 lines) — validation/mapping/publication
  flow and § Residual gaps (parser isolation, PostGIS writes, gbOpen boundary
  done; OS sandboxing, other providers, live drills are future operational work
  and are non-goals).
- `server/src/ingestion/parsers/parse-source-buffer.ts` (74 lines) — the gap:
  `parser_exception` catch at lines 53–73 with `error.message.slice(0, 180)`;
  fixed `unsupported_media_type` message at lines 44–51 (the pattern to mirror).
- `server/src/ingestion/ingestion-processor.service.ts` (lines 77–206) —
  `summary.issues` spread into the persisted set (lines 112–118) and written to
  `validationIssue.createMany` (lines 153–172); proves the parser message
  reaches a tenant-readable row unchanged.
- `server/src/ingestion/ingestion.service.ts` (lines 310–339) — `listIssues`
  read exposure: `message` returned verbatim; proves the stored message is
  tenant-visible and must stay fixed-safe.
- `server/src/ingestion/ingestion.controller.ts` (lines 273–277) — route
  `GET ingestion-runs/:runId/issues`, bounded validation-issue listing.
- `server/src/ingestion/parsers/parser-child.entry.ts` — child boundary: outer
  failure already fixed (`'Parser execution failed.'`, lines 65–75);
  `parseSourceBuffer` invoked at lines 52–56 inside the child.
- `server/src/ingestion/parsers/in-process-parser.executor.ts` — direct
  `parseSourceBuffer` passthrough (the non-child path the fix also covers).
- `server/src/ingestion/parsers/child-process-parser.executor.ts` (lines
  407–478) — IPC issue-shape validation passes `code`/`message` through after
  shape checks only; proves no downstream sanitization exists and the fix
  belongs at the `parseSourceBuffer` source.
- `server/src/ingestion/parsers/source-parser.service.ts` — fixed
  `'Source file size exceeds the temporary parser limit.'` (lines 54–62);
  confirms the fixed-message convention on this surface.
- `server/src/ingestion/parsers/source-parsers.spec.ts` — existing parser
  assertions (fixed-issue expectations at lines 110–151, malformed-OOXML
  container issue at 178–197); the file to extend.

No comp, crop, or board region applies: backend-only, no visual surface.

## Current-state facts the implementation must preserve

1. The `parser_exception` code is stable (emitted only from this catch; no spec
   asserts it today, but run-status/issues clients key on `code`). No new issue
   code is authorized. Only the `message` value changes (verbatim slice →
   fixed).
2. The `unsupported_media_type` fixed message (`'Media type is not accepted.'`)
   is untouched, as are all per-parser issues (`csv-source.parser.ts`,
   `xlsx-source.parser.ts`, `geojson-source.parser.ts` fixed/parameterized
   messages with row/column context — structured diagnostics, not raw error
   text).
3. `IngestionProcessorService` validation assembly, `validation_failed` fixed
   message, publication path (prompts 72/73), and the `failureCode` surface are
   untouched.
4. The stored `ValidationIssue.message` column already exists; this is a
   value-mapping change only — no migration, no new index.
5. `parseSourceBuffer` runs in two contexts: inside the forked parser child
   (`parser-child.entry.ts`) and in-process (`in-process-parser.executor.ts`).
   The fix must not depend on Nest DI (no `Logger` injection — the function is
   a free function with no class context). Server-side logging via
   `console.error` reaches stderr in-process; in the child it is discarded by
   the executor's ignored-stdio isolation (documented, not a leak: the stored
   message is fixed on both paths).

## Implementation steps

1. **Sanitize the catch** in `parseSourceBuffer` (lines 53–73):
   - Replace the verbatim slice with one fixed string, e.g.
     `'Parser failed unexpectedly.'` (wording may vary but must contain no
     interpolated identifiers, paths, cell content, or library internals).
   - Collapse the two current variants (verbatim slice for `Error`,
     `'Parser failed.'` for non-`Error`) into exactly one fixed message so
     there is a single observable value on this path.
   - Log the original error server-side only before returning, e.g.
     `console.error('parseSourceBuffer parser_exception:', error instanceof
     Error ? (error.stack ?? error.message) : String(error))` — message +
     stack, never persisted to any column, metric label, or returned payload.
     (`console.error` reaches server stderr on the in-process path. Inside the
     forked parser child it is discarded by design — the child executor spawns
     with `stdio: [..., 'ignore', ...]` for isolation
     (`child-process-parser.executor.ts:69`) — where the original input remains
     recoverable from the accepted upload bytes. Do not introduce Nest DI
     into this free function to obtain a logger.)
2. **No other production change**: no migration, no Prisma change, no
   shared-contract change, no OpenAPI/SDL change, no controller/route/
   permission/CSRF/idempotency change, no worker/outbox change, no
   `validateMapping`/`validateRemappingCompatibility`/`publish` change, no
   change to the IPC shape validation in `child-process-parser.executor.ts`,
   no change to `parser-child.entry.ts` outer fixed message.
3. **Unit tests** in a new `parse-source-buffer.spec.ts` (follow the existing
   `source-parsers.spec.ts` pattern for asserting fixed issue objects;
   `jest.mock('./csv-source.parser')` to force the throw):
   - Force a parser throw carrying sensitive-looking content (e.g. stub
     `inspect` to throw
     `new Error('unexpected token "crop_yield_secret" at cell B12')`) and call
     the `parseSourceBuffer` path → single issue with `severity: 'error'`,
     `code: 'parser_exception'`, exact fixed message, and the stored message
     contains neither the cell content nor any error fragment; assert the
     original error reached `console.error`.
   - Non-`Error` throw (e.g. throw `'boom'`) → same exact fixed message.
   - Forked-child path: drive a ragged CSV through the real
     `ChildProcessParserExecutor` against the compiled
     `dist/ingestion/parsers/parser-child.entry.js` (same entrypoint guard as
     `compiled-child-process-parser.spec.ts`) → returned summary carries
     `parser_exception` with the exact fixed message, proving the fixed issue
     crosses IPC unchanged.
   - Existing fixed-issue assertions in `source-parsers.spec.ts` (malformed
     container, entry cap, macro/encrypted rejection) stay green unchanged.
4. **Real-DB e2e** (extend the existing ingestion/database gate, do not invent
   a new harness): drive an ingestion run whose parse step throws a
   key-bearing error post-acceptance and assert the persisted `ValidationIssue`
   row carries `parser_exception` with the fixed message and no key material,
   retrievable through the bounded issues read under forced RLS. Database
   assertions must not use the Prisma test double.
5. **Docs**: in `docs/ingestion.md` validation section, record that
   `parser_exception` issues now carry a fixed safe message (original error in
   server logs/stderr only), cross-referencing the prompts 72/73 rule
   (diagnostics in `ValidationIssue` structured fields or server logs, never
   raw error text in free-text messages). One clause; same commit.

## Non-goals

- Upload-worker `finalizeException` verbatim slices
  (`upload-worker.service.ts:321–348`, `message.slice(0, 500)` into
  `durableJob.lastErrorMessage` / `jobDeadLetter.reasonMessage`): same theme,
  separate prompt with its own exposure analysis (durable-job/dead-letter
  read surfaces differ from the issues read); untouched here.
- Report/export failure messages: already fixed (`ExportFailure` fixed
  code/message in `reports.service.ts:700–717`); untouched.
- Any change to the parser limits, row/column/cell budgets, XLSX container
  inspection, child-process isolation bounds, or issue-shape validation:
  untouched.
- Cross-version aggregate rollups and richer quality heuristics
  (`docs/analytics.md` residual): untouched.
- Schema/migration, new indexes, new env vars, new routes, permission-map
  changes, envelope/error-code additions, OpenAPI/SDL regeneration: none. The
  only changed identifier is the stored `ValidationIssue.message` string value
  on the `parser_exception` path.
- Dashboard, report, export, upload, auth, or operations surfaces: untouched.
- Parser sandboxing, additional geography providers, live Garage/Valkey/ClamAV
  drills: future operational work, untouched.

## Expected impact — which routes change, and how

No route changes. No controller, permission, envelope, DTO, OpenAPI, or SDL
change:

- Ingestion issue reads (`GET ingestion-runs/:runId/issues` via `listIssues`):
  a `parser_exception` issue that today carries the first 180 chars of the raw
  parser error (or `'Parser failed.'` for non-`Error` throws) will carry the
  single fixed message. The `code` (`parser_exception`), `severity`
  (`error`), row/column/region fields, and the 100-row bound behave exactly as
  today.
- The run still ends `validation_failed` with the existing fixed run-level
  message whenever the parser issue is present (it is an `error` severity).
- All other issues (per-parser validation messages, mapping issues,
  remapping-compatibility issues) behave exactly as today.

## Measurements / reproduction procedure (backend-only; no visual surface)

There is no comp number to hit. Verify by procedure, before and after:

1. On the current tree, force a parser `inspect` to throw
   `new Error('unexpected token "crop_yield_secret" at cell B12')` through
   `parseSourceBuffer`. Observe today: the returned issue is
   `error` / `parser_exception` with `message` containing
   `crop_yield_secret`.
2. After the change: the same throw yields `error` / `parser_exception` with
   the exact fixed message containing no fragment of the thrown text, while
   the server stderr carries the original error on the in-process path
   (discarded by stdio isolation in the forked child; a dedicated
   child-entrypoint test asserts the fixed message crosses IPC).
3. Confirm the non-`Error` throw path yields the same fixed message (today it
   yields the distinct `'Parser failed.'` variant).

## Checks to run, and which docs file records the result

Run and quote real output (§10 rule 3); never claim a pass without running:

- `npm run lint`
- `npm run typecheck`
- `npm run contracts:check` (expect zero diff; issue messages are row values,
  not contract shapes — verify and commit none)
- Targeted: parser specs
  (`npx jest --config server/jest.config.js` or the workspace equivalent the
  repo uses — resolve from `server/package.json`, do not invent flags), then
  the full `npm run test:server` real-database suite.
- `npm run build`
- `git diff --check` and `git status --short` review of the staged set.

Record the result in `docs/ingestion.md` (parser-exception outcome) in the same
commit. `docs/backend.md` needs no change unless the implementation touches a
contract the backend doc enumerates; if it does, say so in the review request
rather than silently extending scope.

## Reference deltas

None — there is no visual surface and no comp applies. Issue-read API
responses keep the same shape; only the `message` string value on the
`parser_exception` path becomes fixed.

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
- Record the result in `docs/ingestion.md` per § Implementation step 5. One
  index-row-class edit at most elsewhere.
- Commit to `main` with `caveman-commit` (ALWAYS rule); do not push.

## SKILLS USED

- architecture-patterns — parser boundary vs validation persistence vs
  tenant-readable issue surface for the sanitization placement.
- nestjs-best-practices — DI-free fix inside a free function used from both
  child and in-process executors; no service wiring change.
- security-best-practices — tenant-visible `ValidationIssue.message`
  sanitization; original error confined to server stderr; no new
  unauthenticated surface.
- error-handling-patterns — stable `parser_exception` signal with fixed safe
  message; fail-closed generic for the unknown parser throw.
- javascript-testing-patterns — unit specs for verbatim/non-Error message
  mapping.
- e2e-testing-patterns — real-database regression proving no raw detail leaks
  into the persisted issue row or the bounded issues read.
- api-design-principles — guard duty only: proves no route, permission,
  envelope, or error-code change ships with this fix.
- postgres-best-practices — only if a DB assertion needs it; no migration or
  index change is authorized — state why it does not apply.
- sql-optimization-patterns — not loaded: single-row issue writes, no plan
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
