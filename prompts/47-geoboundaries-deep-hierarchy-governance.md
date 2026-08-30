# 47 - Govern geoBoundaries ADM2-ADM5 hierarchy maps

## Scope and why this is next

`1fbfc54` is the committed `main` tip. It implements the Phase 7B
geoBoundaries `gbOpen` acquisition/manifest/import boundary, but deliberately
publishes only ADM0 and ADM1. The earliest remaining dependency-safe Phase 7
unit is deeper-hierarchy governance: geoBoundaries exposes ADM2-ADM5 artifacts
without an immediate-parent field, while Acres' V1 contract requires a global,
arbitrary-depth administrative hierarchy and forbids silently guessing parentage.

Activate the existing but dormant `explicitParentMap` seam through a separate,
operator-controlled hierarchy-review step. The step must bind every child
`shapeID` to exactly one `shapeID` in the immediately preceding ADM layer,
validate the complete relationship against the checksummed artifacts, and emit
a new immutable publish manifest. Import must consume only that reviewed
manifest and resolve parents by provider feature identity.

This is a bounded **Phase 7B hierarchy-governance increment**. It does not
choose source precedence, authorize automatic refresh, declare disputed
boundaries authoritative, or perform a production provider publication.

## Reference material read while preparing this prompt

Re-read before implementation:

- `AGENTS.md`, especially §§2, 2.1, 4-8, and 10.
- This approved prompt.
- `docs/build-plan.md` §§1, 8, and 14.
- `docs/product.md`, especially the accepted geography-provider decision,
  journeys 3.2-3.5, V1 boundary, public-reference-geography classification,
  success criteria, and open decisions.
- `docs/ingestion.md`, especially the geoBoundaries baseline, schema/RLS,
  PostGIS boundary, verification state, and residual gaps.
- `docs/system-architecture.md` §§3-5, 7, 9, 12, and 14; `docs/security.md`
  TM-07, TM-17, and the Phase 7/provider updates; `docs/backend.md` geography
  and Phase 7 records.
- `prompts/46-geoboundaries-provider-import.md` and commit `1fbfc54`, which own
  the provider choice, licence boundary, and current importer contract.
- `server/prisma/schema.prisma`; committed geography migrations;
  `server/src/geography/`; `server/src/prisma/`; root/server package scripts;
  and existing unit/database/E2E test conventions.
- Official geoBoundaries API and feature-schema evidence already recorded by
  prompt 46, including `wmgeolab/geoBoundaries#4202`: provider features do not
  carry the immediate parent needed for ADM2-ADM5. Re-verify live provider
  behavior only if approved network access is available; do not replace the
  recorded limitation with an assumption.
- The loaded project skills listed below and any routed references they require
  for the exact Nest, TypeScript, PostgreSQL, security, and test surfaces used.

There is no visual route, comp, client, breakpoint, browser, or motion surface
in this increment. No design measurement applies.

## Expected impact

- Extend the internal geoBoundaries operator CLI with an explicit hierarchy
  review command and corresponding root/server script.
- Permit bounded acquisition and manifest representation of ADM0-ADM5 while
  leaving ADM2-ADM5 unresolved until reviewed mappings are supplied.
- Validate a versioned hierarchy-review artifact against the base manifest and
  local checksummed GeoJSON artifacts, then atomically write a distinct publish
  manifest whose identity covers the exact parent assignments.
- Update `GeoBoundariesImportService` so all levels resolve parent IDs by
  `(countryCode, level, shapeID)`, not by a single mutable region-per-level
  slot, and publish all reviewed levels in one transaction.
- Add deterministic unit/CLI tests and guarded real-PostGIS proof without
  calling public provider services in automated tests.
- Add no REST route, GraphQL field, shared browser contract, controller,
  scheduler, worker network call, or authenticated UI.
- Prefer no Prisma schema migration: the existing adjacency-list `Region`,
  source/code identity, and geometry models can represent the result. If code
  inspection disproves that, stop and obtain approval rather than inventing a
  migration inside this prompt.

## SKILLS USED

- `architecture-patterns` — keep hierarchy review/validation framework-free
  and keep provider, CLI, and persistence adapters behind narrow boundaries.
- `architecture-decision-records` — record why reviewed immediate-parent maps
  are accepted and spatial/name inference remains rejected.
- `nestjs-best-practices` — preserve GeographyModule ownership, constructor
  injection, focused services, transaction boundaries, and isolated tests.
- `postgres-best-practices` — preserve hierarchy integrity and source/code
  uniqueness with the existing schema and transactional writes.
- `sql-optimization-patterns` — batch provider-code lookups, avoid per-parent
  queries, and inspect representative hierarchy access plans when PostgreSQL is
  available.
- `security-best-practices` — treat mapping files, manifests, artifacts, paths,
  feature identities, and database errors as untrusted and bounded.
- `security-threat-model` — reconcile TM-07/TM-17 and the operator-review trust
  boundary without overstating legal, operational, or sandbox assurance.
- `error-handling-patterns` — fail closed with stable hierarchy, integrity,
  conflict, filesystem, and database failure categories.
- `javascript-testing-patterns` — cover canonical identity, mapping validation,
  persistence behavior, rollback, and regressions with deterministic fixtures.
- `e2e-testing-patterns` — exercise the operator CLI and guarded real-database
  path at the system boundary without live public-network dependencies.
- `requesting-code-review` — dispatch the mandatory reviewer after complete
  self-verification with precise SHAs, requirements, and evidence.
- `receiving-code-review` — verify reviewer findings against the code, schema,
  provider limitation, and prompt before applying them.
- `caveman-commit` — write the required concise Conventional Commit message.

`api-design-principles` and `openapi-spec-generation` are not triggered because
no transport contract changes. `playwright` and all frontend/design skills are
out of scope because no browser surface changes.

## Required implementation

### 1. Define a bounded hierarchy-review artifact

1. Add a versioned, framework-free hierarchy-review type and validator next to
   the existing geoBoundaries manifest types. Prefer a JSON shape equivalent to:

   ```json
   {
     "schemaVersion": 1,
     "baseManifestIdentitySha256": "<64 lowercase hex>",
     "layers": [
       {
         "countryCode": "GHA",
         "level": "ADM2",
         "parentLevel": "ADM1",
         "assignments": [
           { "childShapeId": "<provider id>", "parentShapeId": "<provider id>" }
         ]
       }
     ]
   }
   ```

   Arrays are preferred over attacker-controlled object keys. If the existing
   `explicitParentMap` record remains the canonical manifest representation,
   construct it without prototype-bearing mutation and serialize it
   deterministically.
2. Require exactly the immediately preceding level (`ADM2 -> ADM1`, through
   `ADM5 -> ADM4`). Reject ADM0 assignments, skipped levels, duplicate layer
   reviews, duplicate child IDs, empty IDs, control characters, unknown keys,
   non-integer schema versions, and unsafe/unbounded structures.
3. Bound review layers by `GEOBOUNDARIES_MAX_LAYERS`, assignments by the child
   artifact's declared feature count and `GEOBOUNDARIES_MAX_FEATURES`, and each
   identifier by the existing provider-identity maximum. Enforce a documented
   total assignment ceiling before allocating large maps.
4. Bind the review artifact to the exact base manifest identity. Parent-map
   assignments are identity-bearing publication input; acquisition timestamps
   remain audit-only and excluded from source identity as already documented.
5. Do not add a reviewer name, legal approval, authoritative-source claim, or
   external URL unless repository evidence establishes a required contract.
   The operator-reviewed file and resulting immutable manifest are integrity
   evidence, not a claim of political or legal authority.

### 2. Add an explicit operator review command

1. Extend the existing CLI with a command such as:

   ```text
   npm run geography:provider:review -- \
     --workdir /safe/operator-dir \
     --manifest /safe/operator-dir/manifest.json \
     --parent-map /safe/operator-dir/parent-map.json \
     --output /safe/operator-dir/publish-manifest.json
   ```

   Add the corresponding root and server scripts. Update `--help` with all
   three operator phases: acquire, review hierarchy, import.
2. Apply the existing dedicated-workdir and containment rules to every input
   and output. Require regular files inside the resolved work directory; reject
   path escape, repository/root workdirs, symlink escapes where the current
   filesystem APIs can verify them, input/output aliasing, and an output path
   that would overwrite the acquired base manifest or parent-map evidence.
3. Load and validate the base manifest, then re-read every referenced local
   artifact. Verify byte length and SHA-256 before JSON parsing and
   normalization. Do not trust manifest feature counts or mapping IDs without
   checking the actual normalized artifact.
4. Validate each reviewed child layer against the exact parent layer in the
   same base manifest. Require complete coverage: every child feature appears
   exactly once, every assigned parent exists in the immediately preceding
   layer, and no unknown child or parent appears. Reject partial maps rather
   than publishing a partially linked country.
5. A manifest containing ADM2-ADM5 layers not covered by the review artifact
   remains `unresolved` and unpublishable. Do not silently drop such layers.
   ADM0 and the existing one-country-root ADM1 relationship remain supported,
   but validate that each country has exactly one ADM0 feature before treating
   that root relationship as explicit.
6. Produce a distinct manifest with reviewed deeper layers changed to
   `explicit-parent-map`, the exact canonical assignments embedded, and
   `identitySha256` recomputed from canonical layer content. Validate the result
   through the production manifest validator before writing it atomically with
   restrictive permissions.
7. Support `--dry-run` without writing files or creating a Nest application
   context. Print bounded JSON containing outcome, base/publish identity prefix,
   reviewed layer counts, and assignment counts only—never geometry, full map
   content, filesystem internals on failure, or unbounded provider metadata.

### 3. Extend acquisition and manifest validation to ADM5 safely

1. Replace the accidental ADM0/ADM1-only allowlists in provider selection and
   manifest validation with the already declared `ADM0`-`ADM5` type boundary.
   Keep uppercase ISO3 and exact `ADM[0-5]` validation.
2. Acquired ADM0 uses `country-root`; ADM1 uses the existing root-parent rule;
   acquired ADM2-ADM5 use `unresolved`. Acquisition must never synthesize an
   `explicitParentMap` or infer parentage.
3. Preserve backward compatibility for valid prompt-46 ADM0/ADM1 schema-v1
   manifests. Reject an empty `explicitParentMap`, a map on an incompatible
   mode/level, entries beyond feature bounds, or deep reviewed layers whose
   immediate parent layer is absent from the same manifest.
4. Canonicalize parent-map keys deterministically so equivalent reviewed input
   yields the same manifest/source identity regardless of JSON property or
   assignment order. Add golden tests for this invariant.

### 4. Resolve and persist hierarchy by provider identity

1. Validate all hierarchy relationships before the first database write. Sort
   layers deterministically by country and numeric ADM level; never depend on
   CLI argument order or raw manifest order.
2. Replace the current `Map<country/level, regionId>` behavior with a mapping
   keyed by country, level, and provider `shapeID`. The existing implementation
   stores only the last ADM1 region for a level and is not a valid basis for
   ADM2 parent resolution.
3. Resolve ADM0 with no parent, ADM1 to the country's single reviewed ADM0
   root, and ADM2-ADM5 through the complete explicit map into the immediately
   preceding layer's resolved region ID. Missing or ambiguous parents must
   raise a stable `hierarchy` error before publication.
4. Batch existing `RegionCode` reads for the source revision and select only
   fields required for identity/parent verification. Avoid one lookup query per
   feature. Preserve parameterized Prisma/tagged SQL boundaries and do not add
   `$queryRawUnsafe` or dynamic SQL.
5. Keep source creation, region/code/alias/geometry writes, and every level in
   one transaction. Any invalid geometry, foreign key, duplicate code,
   conflicting hierarchy, or database failure rolls back the complete source
   revision.
6. Do not silently reparent a pre-existing global `Region` when its current
   parent conflicts with the reviewed map. Source precedence and automatic
   replacement remain open product decisions; classify the conflict and abort.
   Likewise, do not retire or destructively replace older sources/regions.
7. Preserve prompt 46's source-version idempotency. Re-importing the identical
   publish manifest must not add duplicate codes, aliases, regions, or
   geometries and must report `unchanged: true` only after verifying the full
   expected source revision, not merely matching a row count.
8. Keep geometry writes through `PostgisRegionGeometryRepository`; do not put
   raw geometry into Prisma models, logs, result payloads, or review output.

### 5. Stable failures and observability

1. Keep internal failure categories at least as precise as `manifest`,
   `integrity`, `hierarchy`, `conflict`, `filesystem`, and `database`, while
   preserving existing acquisition/checksum behavior. CLI output must be
   actionable for an operator but must not echo mapping contents, geometry,
   SQL, credentials, response bodies, stack traces, or arbitrary exception
   messages.
2. Exit nonzero on malformed review files, base-identity mismatch, checksum
   drift, incomplete coverage, unknown IDs, missing immediate-parent layer,
   conflicting existing parentage, unsafe paths, or transactional failure.
3. Emit bounded success counts by country/level and assignment total. Do not
   add high-cardinality Prometheus labels or log individual shape IDs.
4. Preserve explicit distinction between controlled fixture evidence, guarded
   real-database evidence, and any optional live-provider smoke evidence.

### 6. Deterministic tests and real-database proof

1. Expand manifest/provider tests for ADM2-ADM5 acquisition modes, backward
   compatibility, map/mode compatibility, canonical map ordering, unknown
   fields, duplicate selections, bounds, and identity changes when one parent
   assignment changes.
2. Add hierarchy-review tests using small synthetic ADM0/ADM1/ADM2 and at least
   one ADM3 chain. Cover complete success plus missing/extra/duplicate child,
   unknown parent, wrong parent level/country, absent parent layer, stale base
   identity, checksum drift, unsafe path, output alias, and dry-run/no-write.
3. Add import-service tests proving multiple parents at one level resolve
   correctly, arbitrary input order is normalized, duplicate import is truly
   unchanged, and hierarchy/geometry/database failure rolls back every level.
4. Test conflict behavior for an existing region whose parent differs. Prove
   that no reparent, retirement, partial source, code, alias, or geometry write
   survives.
5. Automated tests must use deterministic local HTTP/filesystem fixtures and
   must never call geoBoundaries, GitHub, or another public service.
6. If the controlled test database is available, run a guarded integration
   proof that imports a synthetic three-level country, verifies the adjacency
   chain and provider-code identity with ordinary bounded queries, exercises a
   representative `(parentId, level)` hierarchy plan, re-imports idempotently,
   and cleans up only its own fixtures in `finally`. A missing database is an
   explicit block/skip, never a fabricated pass.
7. No browser E2E or screenshot is required because no public UI exists.

### 7. Documentation and current-state reconciliation

1. Update `docs/ingestion.md` with the review artifact/command, canonical map
   identity, complete-coverage rule, hierarchy resolution, conflict behavior,
   transaction/idempotency semantics, safe failures, exact verification
   evidence, and remaining source-precedence/refresh/authority decisions.
2. Reconcile stale lines in `docs/ingestion.md` that still say Phase 8 metric
   tables do not exist; link to `docs/analytics.md` instead of rewriting its
   implementation record.
3. Update `docs/system-architecture.md` so the operator-only gbOpen adapter and
   implemented hierarchy depth are current. Remove the stale statement that a
   named provider import is still deferred. Keep automatic refresh, source
   precedence, authoritative overrides, OS-level parser sandboxing, production
   dependency proof, and unresolved operator decisions deferred.
4. Update `docs/security.md` TM-07/TM-17 and Phase 7 residuals for untrusted
   parent-map input, complete coverage, manifest/checksum binding, no inference,
   conflict-safe atomic import, and remaining provider/legal/operational risk.
5. Reconcile `docs/product.md`'s open-decision wording: provider selection is
   no longer open, while refresh cadence, redistribution review, source
   precedence, jurisdictional authority, and overrides remain open.
6. Update `docs/backend.md` and `docs/build-plan.md` only where their current
   Phase 7/provider/hierarchy statements would otherwise be false. Do not
   declare Phase 7 or launch complete while real provider publication,
   dependency-capable evidence, and operator-owned decisions remain unresolved.

## Explicit non-goals

- No parent inference from names, aliases, centroids, bounding boxes,
  `ST_Contains`, `ST_Intersects`, area overlap, or fuzzy matching.
- No claim that a reviewed map is legally or politically authoritative; no
  handling policy for disputed territories invented by implementation.
- No automatic refresh, schedule, webhook, worker job, source precedence,
  authoritative override, region retirement, destructive replacement, or
  reconciliation cadence.
- No new provider, release type, arbitrary URL/plugin, shapefile, TopoJSON,
  GeoPackage, public connector, or committed provider geometry.
- No customer-facing map, geography browser, attribution UI, REST/GraphQL
  endpoint, client contract, authenticated workflow, or design work.
- No tenant dataset, observation, analytics, dashboard, report, export, AI,
  upload, queue, parser sandbox, production infrastructure, or launch-readiness
  expansion.
- No production data import. Deterministic fixtures and an optional minimal
  operator-authorized smoke check are evidence; they are not production rollout.

## Acceptance criteria

- ADM0-ADM5 can be acquired, but ADM2-ADM5 remain unpublishable until a
  separate review artifact completely maps each child to one existing immediate
  parent from the same checksummed manifest.
- Review is path-safe, bounded, deterministic, base-identity-bound, artifact-
  checksum-bound, dry-runnable, and emits a distinct canonical publish manifest.
- Equivalent assignments produce the same identity regardless of ordering;
  changed parentage changes identity.
- Import resolves multiple regions per level by provider shape identity,
  validates before writing, publishes every level atomically, and never infers,
  silently reparents, partially publishes, or leaks geometry/map contents.
- Identical re-import is demonstrably idempotent; hierarchy conflicts and all
  expected invalid paths fail closed with stable safe errors.
- Automated tests make no public network calls. Real PostgreSQL evidence is
  quoted when available, and an unavailable dependency is reported accurately.
- Canonical documentation distinguishes implemented hierarchy mechanics from
  still-open governance, provider authority, production publication, and launch
  decisions.

## Verification and handoff

Before coding, re-read every named skill and the relevant local Nest/Prisma/Jest
declarations used. Run focused validator, CLI, import-service, and integration
tests first. Use a temporary directory outside the repository for CLI fixtures;
remove only fixtures created by the test.

Run and quote real output for:

```bash
npm run geography:provider:acquire -- --help
npm run geography:provider:review -- --help
npm run geography:provider:review -- --workdir <temp-dir> --manifest <temp-dir>/manifest.json --parent-map <temp-dir>/parent-map.json --output <temp-dir>/publish-manifest.json --dry-run
npm run geography:provider:import -- --help
npm run prisma:validate --workspace=@acres/server
npm run test --workspace=@acres/server -- --runInBand
npm run test:server
npm run lint
npm run typecheck
npm run build
npm run contracts:check
npm run ops:check
git diff --check
git status --short
git diff --cached --check
git diff --cached --stat
```

Substitute only real temporary paths in the CLI commands and quote bounded
output. If the repository's root-script argument forwarding requires a verified
syntax adjustment, use the verified form and record it rather than guessing.
Never count a skipped database, unavailable dependency, or blocked network as a
pass.

Inspect the complete diff and staged diff. Invoke `requesting-code-review` with
actual `BASE_SHA`/`HEAD_SHA`, this prompt, the no-inference requirement,
manifest/review schemas, changed paths, transaction/idempotency behavior,
database/network evidence, and full check output. Evaluate all findings through
`receiving-code-review`; fix only verified issues and retest. Because this
changes geography integrity and an external-data trust boundary, request a
follow-up review after any significant schema, identity, hierarchy,
transaction, path-security, or persistence change.

Stage only approved files, inspect the staged patch, and commit locally to
`main` using a `caveman-commit` message with a body explaining the explicit,
non-inferred hierarchy boundary. Do not push.
