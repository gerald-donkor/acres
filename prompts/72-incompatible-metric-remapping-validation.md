# 72 - incompatible metric remapping validation

## Scope, and why it is next

The committed repository is on `main` at `e79a8d9`
(`fix(reports): reject expired export downloads`). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus residual follow-ups 68 (saved-view
`schemaVersion`), 69 (frozen dashboard-evidence `schemaVersion`), 70 (hourly
`exports.purge-expired` reclamation), and 71 (download-time expiry
enforcement).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phases 7/8, dependency-safe against prompts
68–71 (no schema, migration, contract, route, or version-marker change).

The gap is the incompatible-metric-remapping path in
`server/src/analytics/analytics-publication.service.ts`. `upsertMetricDefinitions`
(lines 235–281) enforces the documented compatibility rule — an existing metric
key remapped to another value type, unit, or aggregation fails publication
(`docs/analytics.md` § Mapping Contract: "Incompatible remapping of an existing
metric key to another value type, unit, or aggregation fails publication").
But it enforces it with a generic mid-transaction throw (line 250):

```ts
throw new Error(`Metric mapping is incompatible with ${metric.key}.`);
```

`IngestionProcessorService.process` assembles all pre-publication validation
issues at lines 77–95 (`summary.issues`, region `validateMapping`,
`malformedMetricMappingIssues`, and the pure/sync
`AnalyticsPublicationService.validateMapping` over `summaryColumns`), persists
them as `ValidationIssue` rows, and returns `validation_failed` when any
blocking error exists. The incompatibility check is not part of that assembly:
it fires only inside `this.analytics.publish(tx, …)` at line 176, after the
`DatasetVersion` row has been created by `publishVersion` (line 171) inside the
same tenant transaction. The catch at lines 203–211 then records:

- `state: 'failed'`, `failureCode: 'analytics_publication_failed'`,
- `failureMessage` interpolated from `error.message`, i.e. containing the
  user-supplied metric key,
- zero new `ValidationIssue` rows (the pre-publish issue set was already
  written and contained nothing about this failure).

So the one remapping error a user is most likely to hit on a second import
(reusing a key with a corrected unit, or switching `sum` to `avg`) fails with
the least useful signal in the system: a run-level `failed` with a free-text
message instead of a blocking validation issue naming the offending column/key
like every other malformed-metric case (`metric_key_duplicate`,
`metric_column_missing`, `metric_key_invalid`, `metric_unit_missing`,
`metric_aggregation_incompatible`). Phase 7's exit requires "invalid files fail
safely with useful issues". This path fails safely (the enclosing transaction
rolls back; no partial version/analytics rows become visible) but without
useful issues.

This prompt moves the compatibility check to pre-publication validation:
emit a blocking error issue before any `DatasetVersion` row is created, keep
the mid-transaction throw only as a race guard with a sanitized message, and
leave the compatibility rule itself (the valueType/canonicalUnit/
allowedAggregation triple) byte-for-byte unchanged. No migration, no new env,
no route/permission/envelope/OpenAPI/SDL change.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 7 definition (§8) and Phase 8 definition (§9)
  with their skill manifests; §§16–22 confirming 12E–12K committed;
  establishes no unbuilt ordered phase and that this is a Phase 7/8 residual.
- `docs/analytics.md` (full file, 201 lines) — § Mapping Contract (the
  incompatibility sentence quoted above; numeric `numeric(26, 6)` bounds;
  period rules), § Publication (idempotent upserts, same-transaction
  `publish()`, worker payloads identifier-only), § Residual Gaps
  (cross-version rollups and richer quality heuristics are explicitly future
  work and are non-goals here).
- `docs/ingestion.md` — validation/mapping/publication flow and § Residual
  gaps (parser isolation, PostGIS writes, gbOpen boundary done; OS sandboxing,
  other providers, live drills are future operational work and are non-goals).
- `server/src/analytics/analytics-publication.service.ts` — `validateMapping`
  (lines 43–115: pure/sync, `summaryColumns` + `mapping.metrics` only; existing
  codes listed above), `publish` (lines 117–187: parse → upsert definitions →
  upsert observations → `rebuildAggregates`), `upsertMetricDefinitions` (lines
  235–281, throw at line 250), `rebuildAggregates` (lines 283–367:
  per-`datasetVersionId` groups only — cross-version rollup absence is noted
  and deliberately untouched).
- `server/src/ingestion/ingestion-processor.service.ts` — validation assembly
  (lines 77–95), issue persistence + `validation_failed` return (lines
  98–169), `publishVersion` then `analytics.publish` (lines 171–182),
  publication catch → `fail('analytics_publication_failed', …)` (lines
  203–211), `fail()` (lines 347–369: `logger.warn` with code only, then run
  update with code + message).
- `server/src/analytics/analytics-publication.service.spec.ts` — existing
  `metric_aggregation_incompatible` case (line ~44) and the mocked-tx
  `publicationInput` helper (lines ~214–283); the pattern new cases follow.
- `server/src/ingestion/ingestion-processor.service.spec.ts` — `fakeAnalytics`
  stub (lines ~43, ~184) and the `validation_failed` vs operational-failed
  cases (lines ~197–268); the pattern the processor-level regression follows.
- `server/src/analytics/mapping.ts` — `malformedMetricMappingIssues` and the
  `metric_mapping_invalid` code (lines ~50–60, ~189); must not collide with the
  new code.

No comp, crop, or board region applies: backend-only, no visual surface.

## Current-state facts the implementation must preserve

1. The compatibility triple is exactly `(valueType, canonicalUnit.trim(),
   allowedAggregation)` compared against the stored `MetricDefinition` for the
   same `(organizationId, key)`. The rule does not change; only where it is
   reported changes.
2. `validateMapping` (the sync one over `summaryColumns`) stays sync and pure.
   The new check needs database reads (existing definitions for the org), so it
   must be a separate async method on `AnalyticsPublicationService` taking
   `(tx, organizationId, metrics)` — not a signature change to the existing
   method, which the processor calls without a transaction at line 86–89 and
   which unit tests call directly.
3. `MetricDefinition` lookup must be tenant-scoped (`organizationId` + `key`;
   the service already uses `organizationId_key` upsert and
   `findFirst({ organizationId, key })`). No cross-org read, no new index, no
   migration: the `organizationId_key` unique constraint already covers it.
4. The mid-transaction throw stays as a race guard (validation → publication
   is not atomic against a concurrent mapping change), but its message must
   not interpolate the user-supplied key. Use a fixed string such as
   `'Metric mapping is incompatible with an existing metric definition.'`
5. `fail()` logs the code only (`logger.warn` with `code`), never the message;
   that property must hold for the new path too. No PII/token logging: keys
   are user content, not secrets, but the run's `failureMessage` must not
   become the carrier for per-column diagnostics — those belong in
   `ValidationIssue` rows.
6. `rebuildAggregates` per-version grouping, `datasetVersionIds: [input.
   datasetVersionId]` lineage, `ANALYTICS_CALCULATION_VERSION =
   'analytics-v1'`, decimal/period parsing, and quality-severity filtering are
   all untouched.

## Implementation steps

1. **Add `validateRemappingCompatibility(tx, organizationId, metrics)`** (name
   may vary; keep it descriptive) to `AnalyticsPublicationService`:
   - Input: the transaction handle (`AnalyticsTx`), the organization id, and
     the parsed `MetricMapping[]` (same objects the processor passes to
     `publish`, i.e. post-`parseAnalyticsMapping`).
   - For each metric, `findFirst({ organizationId, key })`. If a definition
     exists and any of `valueType !== metric.valueType`,
     `canonicalUnit !== metric.unit.trim()`, or
     `allowedAggregation !== metric.aggregation`, push one blocking issue:
     `{ severity: 'error', code: 'metric_definition_incompatible', message:
     'Metric key is already defined with a different type, unit, or
     aggregation.', columnKey: metric.column, details: { key: metric.key } }`.
     - The code `metric_definition_incompatible` is new. Do NOT reuse
       `metric_aggregation_incompatible` (that code means "text/boolean with an
       unsupported aggregation kind" in the sync validator) or
       `metric_mapping_invalid` (the malformed-shape code in `mapping.ts`).
     - Message wording may vary but must name the triple (type/unit/
       aggregation) in plain language and must not echo the stored definition.
   - Return `ParserIssue[]`-shaped objects consistent with the other validators
     (`severity`/`code`/`message`/`columnKey?`/`details?`). Check the
     `ParserIssue` type in `server/src/ingestion/parsers/parser.types.ts`
     before writing; do not redeclare it.
2. **Call it in `IngestionProcessorService.process`** alongside the existing
   assembly (after line 89's `analyticsIssues`, inside an organization-scoped
   read — reuse the existing `this.tenants` read path or the transaction used
   for the fresh-run check; do not open an unscoped Prisma client). Spread the
   result into `issues` so a blocking incompatibility takes the existing
   `validation_failed` path with persisted `ValidationIssue` rows and never
   reaches `publishVersion`.
3. **Sanitize the race-guard throw** at `analytics-publication.service.ts:250`
   to the fixed message in fact 4. Keep the throw site and the comparison
   logic otherwise identical.
4. **Unit tests** in `analytics-publication.service.spec.ts` (follow the file's
   mocked-tx pattern):
   - incompatible `valueType` → one blocking `metric_definition_incompatible`
     issue carrying the metric's `column`;
   - incompatible `unit` (including whitespace-trimmed equality passing, e.g.
     stored `'people'` vs `' people '` passes);
   - incompatible `aggregation` → issue;
   - fully compatible remap (same triple, new label) → zero issues;
   - unknown key (no stored definition) → zero issues.
5. **Processor test** in `ingestion-processor.service.spec.ts` (follow the
   `fakeAnalytics` pattern: stub the new method alongside `validateMapping`
   and `publish`): when the compatibility check returns a blocking issue, the
   run ends `validation_failed` with the issue persisted and `publish` is never
   called. When it returns `[]`, behavior is unchanged.
6. **Race-guard test**: publication with a definition that changed between
   validation and `publish` still throws the fixed message (assert the exact
   string, and assert it contains no metric key), and the processor maps it to
   the existing `failed`/`analytics_publication_failed` path (no new
   failure code).
7. **Docs**: in `docs/analytics.md` § Mapping Contract, extend the
   incompatibility sentence to state the reporting path (blocking
   `metric_definition_incompatible` validation issue pre-publication; the
   mid-transaction throw remains as a non-enumerated race guard). In
   `docs/ingestion.md` validation/publication section, record that incompatible
   remaps now end `validation_failed` with persisted issues instead of
   `failed`/`analytics_publication_failed`. Both files in the same commit.

## Non-goals

- Cross-version aggregate rollups (`docs/analytics.md` residual): aggregates
  stay keyed per `datasetVersionId`; `rebuildAggregates` grouping is untouched.
- Richer quality heuristics (low-confidence/duplicate): quality states,
  severities, and `qualitySummary` math are untouched.
- Any change to the compatibility rule itself (e.g. allowing unit aliases,
  aggregation widening, key renames): the triple comparison is preserved.
- Schema/migration, new indexes, new env vars, new routes, permission-map
  changes, envelope/error-code additions, OpenAPI/SDL regeneration: none. The
  only new identifier is the `metric_definition_incompatible` issue code,
  which travels inside the existing `ValidationIssue` row shape and the
  existing `validation_failed` run outcome.
- Dashboard, report, export, upload, auth, or operations surfaces: untouched.
- Parser sandboxing, additional geography providers, live Garage/Valkey/ClamAV
  drills: future operational work, untouched.

## Expected impact — which routes change, and how

No route changes. No controller, permission, envelope, DTO, OpenAPI, or SDL
change:

- `POST` ingestion run processing (worker-internal `IngestionProcessorService.
  process`, surfaced through the existing run-status reads): an incompatible
  metric remap that today ends `state: 'failed'` with
  `failureCode: 'analytics_publication_failed'` and no new `ValidationIssue`
  rows will end `state: 'validation_failed'` with
  `failureCode: 'validation_failed'` and one blocking
  `metric_definition_incompatible` issue row per offending metric, naming its
  source column.
- All other runs (compatible remaps, fresh keys, non-metric mappings) behave
  exactly as today. The `failed`/`analytics_publication_failed` outcome
  remains reachable only via the genuine race or an unexpected publication
  error.

## Measurements / reproduction procedure (backend-only; no visual surface)

There is no comp number to hit. Verify by procedure, before and after:

1. On the current tree, seed one org with a published dataset whose mapping
   defines key `population` (`numeric`, unit `people`, aggregation `sum`).
2. Start a second run on a new upload reusing key `population` with unit
   `thousands` (or aggregation `avg`). Observe today: run ends `failed` /
   `analytics_publication_failed`, message contains the key, no
   `ValidationIssue` rows for the remap.
3. After the change: the same second run ends `validation_failed`, carries a
   blocking `metric_definition_incompatible` issue with
   `columnKey` = the mapped source column, and creates no `DatasetVersion`.
4. Confirm the race guard: with validation stubbed to `[]` and the definition
   changed before `publish`, the fixed throw message is asserted exact and
   contains no key material.

## Checks to run, and which docs file records the result

Run and quote real output (§10 rule 3); never claim a pass without running:

- `npm run lint`
- `npm run typecheck`
- Targeted: analytics publication + processor specs
  (`npx jest --config server/jest.config.js` or the workspace equivalent the
  repo uses — resolve from `server/package.json`, do not invent flags), then
  the full `npm run test:server` real-database suite.
- `npm run build`
- `git diff --check` and `git status --short` review of the staged set.

Record the result in `docs/analytics.md` (§ Mapping Contract reporting path)
and `docs/ingestion.md` (validation/publication outcome for incompatible
remaps) in the same commit. `docs/backend.md` needs no change unless the
implementation touches a contract the backend doc enumerates; if it does, say
so in the review request rather than silently extending scope.

## SKILLS USED

- architecture-patterns — pre-publication validation vs mid-transaction guard
  boundary for the publication workflow.
- nestjs-best-practices — service/provider change inside `server/` (new
  async validator method, processor wiring, DI-safe test stubs).
- postgres-best-practices — tenant-scoped `MetricDefinition` lookup on the
  existing `organizationId_key` unique without a new migration or index.
- security-best-practices — tenant isolation of the definition read;
  sanitized race-guard message; diagnostics in `ValidationIssue` rows rather
  than free-text `failureMessage`.
- error-handling-patterns — stable `validation_failed` outcome with persisted
  blocking issues; preserved fail-closed `failed` path for the genuine race.
- javascript-testing-patterns — unit/service specs for the new validator,
  the processor outcome, and the race-guard message.
- e2e-testing-patterns — real-database ingestion publication regression
  proving no partial version/analytics rows leak on the incompatible path.
- api-design-principles — guard duty only: proves no route, permission,
  envelope, or error-code change ships with this fix.
- requesting-code-review — dispatch a reviewer subagent with the requirements,
  diff SHAs, and checks run before committing.
- receiving-code-review — evaluate reviewer feedback against the code with
  technical rigor before fixing or pushing back.
- caveman-commit — write the commit message (ALWAYS rule, no AI trailer).

Not loaded, with reason: `sql-optimization-patterns` (single-key point lookup
on an existing unique; no plan change to measure), `openapi-spec-generation`
(no contract change by construction), `kpi-dashboard-design` /
`data-storytelling` (metric semantics and display conventions unchanged),
frontend/shadcn/Tailwind/GSAP/playwright skills (no UI, no motion, no browser
flow; Playwright coverage would be disproportionate for a worker-internal
outcome already covered by the service and E2E suites).
