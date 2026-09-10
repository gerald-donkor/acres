# 73 - ingestion unexpected-failure sanitization

## Scope, and why it is next

The committed repository is on `main` at `f1ab549`
(`fix(ingestion): flag incompatible remaps in validation`). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus residual follow-ups 68 (saved-view
`schemaVersion`), 69 (frozen dashboard-evidence `schemaVersion`), 70 (hourly
`exports.purge-expired` reclamation), 71 (download-time expiry enforcement),
and 72 (incompatible-metric-remap pre-publication validation).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phases 7/8, dependency-safe against prompts
68–72 (no schema, migration, contract, route, or version-marker change).

The gap is the catch-all in `IngestionProcessorService.process`
(`server/src/ingestion/ingestion-processor.service.ts`, lines 215–223):

```ts
} catch (error) {
  await this.fail(
    reserved,
    'analytics_publication_failed',
    error instanceof Error
      ? error.message
      : 'Analytics publication failed.',
  );
}
```

Prompt 72 sanitized the one known throw on this path (the remapping race guard
in `analytics-publication.service.ts:283-285` now throws the fixed string
`'Metric mapping is incompatible with an existing metric definition.'` with no
key interpolation, proven by the spec at
`ingestion-processor.service.spec.ts:313-335`). But the catch still persists
`error.message` verbatim into `IngestionRun.failureMessage` for every other
unexpected error: Prisma constraint/SQL fragments, storage object keys and
paths, region/metric identifiers, or file-content excerpts bubbled up from
`publish()`. That column is tenant-visible through the existing read model
(`ingestion.service.ts:498-521`, `failure: { code, message }`), while `fail()`
(lines 359–381) logs only the code (`logger.warn` with `code`), so the raw
detail is stored where tenants read it and never logged where operators debug
it — the exact inversion of prompt 72's rule (diagnostics in `ValidationIssue`
rows or server logs, never in free-text `failureMessage`).

This prompt maps the unexpected path to a fixed safe message, preserves the
already-sanitized race-guard message verbatim, and logs the original error
server-side only. The compatibility triple, the `validation_failed` path, the
`failureCode`, and every route/permission/envelope stays unchanged.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 7 definition (§8) and Phase 8 definition (§9)
  with their skill manifests; §§16–22 confirming 12E–12K committed;
  establishes no unbuilt ordered phase and that this is a Phase 7/8 residual.
- `docs/analytics.md` (full file, 209 lines) — § Mapping Contract (the
  incompatibility sentence; `metric_definition_incompatible` reporting path
  added by prompt 72), § Publication (same-transaction `publish()`), § Residual
  Gaps (cross-version rollups and richer quality heuristics are explicitly
  future work and are non-goals here).
- `docs/ingestion.md` — validation/mapping/publication flow and § Residual
  gaps (parser isolation, PostGIS writes, gbOpen boundary done; OS sandboxing,
  other providers, live drills are future operational work and are non-goals).
- `server/src/ingestion/ingestion-processor.service.ts` (382 lines) —
  validation assembly (lines 77–107, including `validateRemappingCompatibility`
  at 90–100), `validation_failed` write (lines 163–181, fixed message
  `'Ingestion validation produced blocking issues.'`), `publishVersion` then
  `analytics.publish` (lines 183–194), catch-all (lines 215–223, the gap),
  `fail()` (lines 359–381: `logger.warn` with code only, then run update with
  code + message).
- `server/src/analytics/analytics-publication.service.ts` —
  `validateRemappingCompatibility` (lines 118–148, fixed
  `metric_definition_incompatible` issue), `upsertMetricDefinitions` race guard
  (lines 268–286, fixed throw at 283–285 with no key interpolation).
- `server/src/ingestion/ingestion-processor.service.spec.ts` — harness
  (lines 52–190: `fakeTx`, `fakeTenants`, `fakeAnalytics` with
  `validateMapping`/`validateRemappingCompatibility`/`publish` stubs,
  `runUpdated` capture), race-guard test (lines 313–335: asserts
  `state: 'failed'` / `failureCode: 'analytics_publication_failed'` /
  exact fixed `failureMessage` with no `crop_yield`), storage-failure test
  (lines 337–350, the `failed`/`object_missing` pattern to mirror).
- `server/src/ingestion/ingestion.service.ts` (lines 490–521) — read exposure:
  `failure: { code, message }` surfaced from stored `failureCode` /
  `failureMessage`; proves the stored message is tenant-visible and must stay
  fixed-safe.

No comp, crop, or board region applies: backend-only, no visual surface.

## Current-state facts the implementation must preserve

1. The `validation_failed` path (lines 163–181) is untouched: fixed code
   `'validation_failed'` + fixed message
   `'Ingestion validation produced blocking issues.'` with persisted
   `ValidationIssue` rows. This prompt only changes the `catch` at 215–223.
2. The race-guard throw message
   `'Metric mapping is incompatible with an existing metric definition.'` is
   already sanitized (no key) and asserted exact by the spec at lines 326–334.
   It must keep mapping to `failed` / `'analytics_publication_failed'` with
   that exact message — never collapsed into the generic message.
3. `failureCode: 'analytics_publication_failed'` is stable and asserted; no new
   failure code is authorized. Only the `failureMessage` value for *unknown*
   errors changes (verbatim → fixed).
4. `fail()` logs the code only today. The original error must become
   operator-visible in server logs (warn with run id + code + original error),
   never in the stored row. No PII/token logging beyond what the error already
   carries: log the `Error` object (message + stack) server-side only, per the
   existing `logger.warn` pattern — do not add it to any persisted column,
   metric label, or returned payload.
5. `object_missing`, storage, parser-timeout/failed, and remapping-validation
   paths are untouched. `rebuildAggregates` grouping, lineage,
   `ANALYTICS_CALCULATION_VERSION`, and the compatibility triple are untouched.
6. No migration, no new index: the stored columns already exist; this is a
   value-mapping change only.

## Implementation steps

1. **Export the race-guard message once** (avoid a second literal that can
   drift): in `server/src/analytics/analytics-publication.service.ts`, export
   a named constant, e.g.
   `PUBLICATION_INCOMPATIBLE_REMAPPING_MESSAGE =
   'Metric mapping is incompatible with an existing metric definition.'`,
   and use it at the throw site (lines 283–285). Keep the comparison logic
   byte-for-byte identical.
2. **Sanitize the catch** in `IngestionProcessorService.process` (lines
   215–223):
   - Compute `raw = error instanceof Error ? error.message : null`.
   - If `raw` equals the imported race-guard constant, call
     `fail(reserved, 'analytics_publication_failed', raw)` (preserves prompt
     72's asserted behavior exactly).
   - Otherwise, log server-side only, e.g.
     `this.logger.warn('Ingestion run ${reserved.id} publication failed unexpectedly: ' + (error instanceof Error ? error.stack ?? error.message : String(error)))`
     (message + stack, run id for correlation; never persisted), then call
     `fail(reserved, 'analytics_publication_failed',
     'Analytics publication failed unexpectedly.')`.
   - The fixed generic wording may vary but must contain no interpolated
     identifiers, paths, SQL, or key material. Keep the non-`Error` fallback
     on the same fixed string (drop the old
     `'Analytics publication failed.'` variant so there is exactly one generic
     message).
3. **No other production change**: no migration, no Prisma change, no
   shared-contract change, no OpenAPI/SDL change, no controller/route/
   permission/CSRF/idempotency change, no worker/outbox change, no
   `validateMapping`/`validateRemappingCompatibility`/`parseSourceBuffer`
   change. `parseSourceBuffer`'s `parser_exception` verbatim slice is
   deliberately left for a separate prompt.
4. **Unit tests** in `ingestion-processor.service.spec.ts` (follow the file's
   `fakeAnalytics`/`runUpdated` pattern; seed `validSummary()` and
   `validateRemappingCompatibility → []` like the race-guard test):
   - unexpected rejection (`new Error('duplicate key value violates constraint
     "MetricObservation_organizationId_key" for key crop_yield')`) → run ends
     `state: 'failed'`, `failureCode: 'analytics_publication_failed'`,
     `failureMessage: 'Analytics publication failed unexpectedly.'` (assert
     exact string), and the stored message contains neither `crop_yield` nor
     `duplicate key`;
   - non-`Error` rejection (e.g. `mockRejectedValue('boom')`) → same fixed
     generic message;
   - race-guard rejection (existing test at 313–335) stays green unchanged
     (exact sanitized message preserved, still no key).
5. **Real-DB e2e** (extend the existing ingestion/database gate, do not invent
   a new harness): force an unexpected publication failure (e.g. stub or
   conflicting state that throws a key-bearing error post-validation) and
   assert the run row ends `failed` / `'analytics_publication_failed'` with
   the fixed message and no key material, under forced RLS. Database
   assertions must not use the Prisma test double.
6. **Docs**: in `docs/ingestion.md` validation/publication section, record
   that unexpected publication errors now end `failed` /
   `analytics_publication_failed` with a fixed safe message (original error in
   server logs only), while the remapping race guard keeps its specific
   sanitized message. In `docs/analytics.md` § Mapping Contract, append one
   clause cross-referencing the same rule. Both files in the same commit.

## Non-goals

- Cross-version aggregate rollups and richer quality heuristics
  (`docs/analytics.md` residual): `rebuildAggregates` grouping untouched.
- `parseSourceBuffer` `parser_exception` verbatim slice, upload-worker
  `finalizeException` message slices, report/export failure messages:
  same theme, separate prompts with their own exposure analysis; untouched
  here.
- Any change to the compatibility rule itself (unit aliases, aggregation
  widening, key renames): the triple comparison is preserved.
- Schema/migration, new indexes, new env vars, new routes, permission-map
  changes, envelope/error-code additions, OpenAPI/SDL regeneration: none. The
  only changed identifier is the stored `failureMessage` string value on the
  unexpected path plus one exported message constant.
- Dashboard, report, export, upload, auth, or operations surfaces: untouched.
- Parser sandboxing, additional geography providers, live Garage/Valkey/ClamAV
  drills: future operational work, untouched.

## Expected impact — which routes change, and how

No route changes. No controller, permission, envelope, DTO, OpenAPI, or SDL
change:

- Ingestion run processing (worker-internal `IngestionProcessorService.
  process`, surfaced through the existing run-status reads): an unexpected
  publication error that today ends `state: 'failed'` with
  `failureCode: 'analytics_publication_failed'` and the raw `error.message`
  in `failureMessage` will end with the same state and code but the fixed
  message `'Analytics publication failed unexpectedly.'`. The original error
  moves to server logs only.
- The remapping race (`Metric mapping is incompatible with an existing metric
  definition.`) behaves exactly as today — same code, same exact message.
- All other runs (validation failures, `object_missing`, compatible
  publications) behave exactly as today.

## Measurements / reproduction procedure (backend-only; no visual surface)

There is no comp number to hit. Verify by procedure, before and after:

1. On the current tree, run ingestion with `validateRemappingCompatibility`
   stubbed to `[]` and `publish` rejecting with
   `new Error('duplicate key "crop_yield" ...')`. Observe today: run ends
   `failed` / `analytics_publication_failed` with `failureMessage` containing
   `crop_yield`.
2. After the change: the same run ends `failed` /
   `analytics_publication_failed` with the exact fixed generic message,
   containing no key/SQL/path material, while the server log carries the
   original error with the run id.
3. Confirm the race guard: with `publish` rejecting with the exported
   race-guard constant, the stored message is asserted exact and unchanged
   from prompt 72.

## Checks to run, and which docs file records the result

Run and quote real output (§10 rule 3); never claim a pass without running:

- `npm run lint`
- `npm run typecheck`
- `npm run contracts:check` (expect zero diff; failure-message strings are
  row values, not contract shapes — verify and commit none)
- Targeted: ingestion processor spec
  (`npx jest --config server/jest.config.js` or the workspace equivalent the
  repo uses — resolve from `server/package.json`, do not invent flags), then
  the full `npm run test:server` real-database suite.
- `npm run build`
- `git diff --check` and `git status --short` review of the staged set.

Record the result in `docs/ingestion.md` (unexpected-publication outcome) and
`docs/analytics.md` (§ Mapping Contract clause) in the same commit.
`docs/backend.md` needs no change unless the implementation touches a contract
the backend doc enumerates; if it does, say so in the review request rather
than silently extending scope.

## Reference deltas

None — there is no visual surface and no comp applies. Run-status API
responses keep the same shape; only the `failure.message` string value on the
unexpected-publication path becomes fixed.

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
- Record the result in `docs/ingestion.md` and `docs/analytics.md` per
  § Implementation step 6. One index-row-class edit at most elsewhere.
- Commit to `main` with `caveman-commit` (ALWAYS rule); do not push.

## SKILLS USED

- architecture-patterns — pre-publication validation vs mid-transaction guard
  vs unexpected-failure boundary for the publication workflow.
- nestjs-best-practices — service/provider change inside `server/` (exported
  message constant, processor catch wiring, DI-safe test stubs).
- security-best-practices — tenant-visible `failureMessage` sanitization;
  original error confined to server logs; no new unauthenticated surface.
- error-handling-patterns — stable `failed` outcome with fixed safe message;
  preserved specific race-guard signal; fail-closed generic for the unknown.
- javascript-testing-patterns — unit specs for generic/non-Error/race-guard
  message mapping.
- e2e-testing-patterns — real-database publication-failure regression proving
  no raw detail leaks into the stored row.
- api-design-principles — guard duty only: proves no route, permission,
  envelope, or error-code change ships with this fix.
- postgres-best-practices — only if a DB assertion needs it; no migration or
  index change is authorized — state why it does not apply.
- sql-optimization-patterns — not loaded: single-row run update, no plan
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
