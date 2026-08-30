# 46 - Add the geoBoundaries provider import boundary

## Scope and why this is next

`714af29` is the committed `main` tip. It reconciles the Phase 7A records after
the parser and PostGIS hardening increments. The earliest remaining
dependency-safe Phase 7 unit is the named geography-provider boundary:
`docs/product.md`, `docs/ingestion.md`, `docs/system-architecture.md`, and
`docs/security.md` still defer provider selection, licence governance, and an
external source importer.

The user approved **geoBoundaries `gbOpen`** as Acres' first global
administrative-boundary baseline on 2026-08-30 after reviewing its global
coverage, programmatic GeoJSON access, provenance metadata, and CC BY 4.0
distribution. Record that decision and implement a provider-specific,
version-pinned acquisition/import path behind the existing private geography
boundary.

This is **Phase 7B**, not a claim that every jurisdiction or ADM0-ADM5 parent
relationship is production-ready. geoBoundaries exposes ADM0-ADM5 layers, but
its GeoJSON feature schema does not currently identify each feature's immediate
parent at the preceding administrative level. The importer must surface that
gap rather than infer a hierarchy from names or unreviewed spatial heuristics.

## Reference material read while preparing this prompt

Re-read before implementation:

- `AGENTS.md`, especially §§2, 2.1, 5-7, 8.2, and 10.
- This approved prompt.
- `docs/build-plan.md` §§1, 8, and 14.
- `docs/product.md` §§4-7; `docs/ingestion.md`; `docs/system-architecture.md`
  §§3-5, 7, 9, 12, and 14; `docs/security.md` TM-07, TM-17, and §12;
  `docs/backend.md` §15.
- `server/prisma/schema.prisma`, the committed geography migrations,
  `server/src/geography/`, `server/src/ingestion/`, `server/src/prisma/`,
  `server/src/config/`, and the current package/root scripts.
- Official geoBoundaries API documentation:
  `https://www.geoboundaries.org/api.html`.
- Official geoBoundaries project/release record:
  `https://github.com/wmgeolab/geoBoundaries` and its `v6.0.0` release record.
- Official geoBoundaries product/licence explanation:
  `https://www.geoboundaries.org/` and
  `https://www.geoboundaries.org/countryDownloads.html`.
- CC BY 4.0 deed and linked legal code:
  `https://creativecommons.org/licenses/by/4.0/`.
- The live API response shapes inspected for `gbOpen/GHA/ADM0` and
  `gbOpen/GHA/ADM1`. These prove that layer metadata includes `boundaryID`,
  source/build dates, original source/licence fields, and commit-addressed
  GitHub download URLs. They also prove that per-layer underlying licence
  metadata can differ and must be retained even though geoBoundaries describes
  `gbOpen` as CC BY 4.0 compliant.
- geoBoundaries issue `wmgeolab/geoBoundaries#4202`, which documents the absent
  immediate-parent field. Treat that as a provider limitation, not authority to
  invent spatial parentage.

There is no visual route, comp, UI, breakpoint, browser, or motion surface in
this increment. No design measurement applies.

## Expected impact

- Add an internal geoBoundaries provider port/adapter, a deterministic manifest
  contract, and an operator-only CLI under `server/src/geography/`.
- Add a script that can acquire and import explicitly selected `gbOpen`
  country/ADM layers into the existing global `RegionSource`, `Region`,
  `RegionCode`, `RegionAlias`, and `RegionGeometry` models.
- Add no REST, GraphQL, shared browser contract, controller, authenticated UI,
  scheduled refresh, or implicit startup/worker network call.
- Prefer no schema migration. Add one only if live inspection proves the
  existing provenance model cannot represent a required immutable fact; never
  add speculative fields or mutate an applied migration.
- Update the product, ingestion, architecture, security, and backend records so
  the provider choice and exact implemented/deferred boundary are current.

## SKILLS USED

- `architecture-patterns` — keep provider acquisition, normalization, and
  persistence behind narrow ports in the modular monolith.
- `architecture-decision-records` — record the approved provider decision,
  trade-offs, replacement seam, and hierarchy limitation durably.
- `nestjs-best-practices` — preserve module ownership, dependency injection,
  focused services, and test seams.
- `postgres-best-practices` — use existing constraints and transactional
  persistence without damaging global reference integrity.
- `sql-optimization-patterns` — prevent per-feature query loops and verify
  bounded lookup/write shapes where real database evidence is available.
- `security-best-practices` — secure outbound acquisition, untrusted metadata,
  file-size limits, checksums, logging, and fail-closed validation.
- `security-threat-model` — update the new provider trust boundary and TM-07 /
  TM-17 evidence without overstating legal or runtime assurance.
- `error-handling-patterns` — classify manifest, acquisition, checksum,
  validation, licence, hierarchy, and database failures safely.
- `javascript-testing-patterns` — cover adapters, normalization, idempotency,
  transactions, and failure paths with deterministic fixtures.
- `e2e-testing-patterns` — exercise the operator CLI through a controlled local
  HTTP fixture and guarded real PostGIS integration.
- `requesting-code-review` — dispatch the mandatory reviewer after
  self-verification with exact SHAs and evidence.
- `receiving-code-review` — verify every reviewer claim against repository and
  provider reality before changing code.
- `caveman-commit` — write the required concise Conventional Commit message.

`api-design-principles` and `openapi-spec-generation` are deliberately not
triggered: this increment adds no public transport contract. `playwright` and
all frontend/design skills are out of scope because no browser surface changes.

## Required implementation

### 1. Record the provider decision and governance boundary

1. Update `docs/product.md` so the open geography-provider decision becomes:
   geoBoundaries `gbOpen` is the approved first baseline; CC BY 4.0 attribution
   is mandatory; every imported layer retains the upstream source, original
   licence string/detail/source URL, represented year, build date, boundary ID,
   and exact artifact identity. Do not present this engineering record as legal
   advice or as a warranty that every underlying source grants rights beyond
   the published `gbOpen` terms.
2. State the decision trade-offs: global standardized coverage and a simple
   attribution licence won over GADM's non-commercial restriction and OSM's
   broader ODbL database obligations. Preserve a provider-replacement seam for
   jurisdiction-specific authoritative sources later.
3. Define update governance: no scheduled or automatic `current` refresh.
   Acquisition produces a reviewable immutable manifest; publication requires
   an explicit operator command; a new upstream build becomes a new
   `RegionSource.sourceVersion`; prior source rows and evidence remain
   reproducible.
4. Store a repository attribution notice/template in the geography-owned area
   or documentation. It must credit geoBoundaries, link the source and CC BY
   4.0, and provide a place to indicate Acres modifications. Do not add a
   customer-facing attribution UI in this increment.

### 2. Define an immutable acquisition manifest

1. Add framework-free types and validation for a versioned manifest. Each
   selected layer must carry at least:
   - provider/release type fixed to `geoBoundaries` / `gbOpen`;
   - ISO-3166 alpha-3 country code and exact `ADM0`-`ADM5` level;
   - `boundaryID`, represented year, source update date, build date;
   - original boundary source, licence, licence detail, licence source, and
     source URL;
   - exact commit-addressed HTTPS GeoJSON artifact URL;
   - expected SHA-256 and byte length obtained during acquisition;
   - acquisition timestamp and manifest schema version;
   - explicit attribution/modification text;
   - hierarchy mode: only `country-root`, `explicit-parent-map`, or
     `unresolved`; never `inferred`.
2. Canonicalize ordering and serialization so an identical selected upstream
   snapshot produces byte-identical JSON and a stable manifest SHA-256. Dynamic
   acquisition time must not be included in the canonical content hash unless
   the contract explicitly separates identity from audit metadata.
3. Validate all metadata as untrusted input: exact enums, bounded strings and
   arrays, valid dates where required, finite integer counts, lowercase
   64-character SHA-256, HTTPS-only URLs, and no control characters. Reject
   unknown keys if the chosen local validation convention supports it.
4. Reject the mutable `/api/current/` URL as an import artifact. It may be used
   only by the acquisition command to discover metadata. The resulting manifest
   must contain the commit-addressed artifact URL returned by the provider and
   a checksum calculated from downloaded bytes.
5. Do not commit downloaded provider GeoJSON or generated database content.
   Commit only small reviewed manifest/fixture material if it is necessary and
   clearly licensed/attributed; otherwise tests use synthetic shapes and
   metadata.

### 3. Implement a secure geoBoundaries acquisition adapter

1. Define a provider port that accepts an explicit bounded selection of country
   codes and ADM levels. Do not accept arbitrary URLs. The geoBoundaries adapter
   constructs the documented API path from validated enums only.
2. Use the installed Node 24 `fetch` API only after verifying its declarations
   locally. Add no HTTP dependency unless the verified platform API cannot meet
   the contract.
3. Enforce HTTPS, a fixed allowlist for discovery and artifact hosts/paths,
   redirect validation on every hop, abort timeout, response/status/content-type
   checks, compressed and decoded byte ceilings, bounded concurrency, and a
   descriptive user agent. Never send application credentials, cookies, tenant
   data, or arbitrary headers.
4. Stream artifact bytes through SHA-256 and a hard byte cap. Do not buffer an
   unbounded global file. Use individual country/ADM GeoJSON artifacts; do not
   acquire the multi-gigabyte global composites in this increment.
5. Validate the provider JSON shape rather than trusting string fields. Reject
   missing or contradictory ISO/ADM/boundary IDs, mutable/non-commit artifact
   URLs, unsupported licences, HTML/error bodies, duplicate selections, and
   checksum/length drift.
6. Acquisition writes a manifest and artifacts only to an explicit operator
   work directory outside tracked source. Use recoverable atomic temp-file then
   rename semantics, restrictive permissions where supported, and cleanup on
   failure. Never use the repository root, `$HOME`, `~`, or a broad recursive
   target.
7. Logs contain country/ADM, boundary ID, bounded counts, build/version, bytes,
   checksum prefix, and outcome only. They must exclude full geometry,
   credentials, query strings, response bodies, and raw provider errors.

### 4. Normalize geoBoundaries features without guessing

1. Accept only a bounded GeoJSON `FeatureCollection` whose features have
   Polygon or MultiPolygon geometry. Reuse the existing geometry validator for
   each extracted geometry rather than creating a weaker validator.
2. Validate the documented provider properties (`shapeID`, `shapeName`,
   `shapeGroup`, `shapeType`, with `shapeISO` optional where the upstream layer
   omits it). Reject missing stable ID/name/group/type, duplicate `shapeID`,
   mismatched ISO/ADM, empty collection, unsupported geometry, excessive
   feature/coordinate/byte counts, and unknown property shapes that would alter
   identity semantics.
3. Normalize names and codes through existing conventions. Use provider
   `shapeID` as the source-specific stable code, not as an Acres primary key.
   Generate deterministic collision-resistant slugs scoped by provider country,
   level, and stable code; do not merge regions by name.
4. ADM0 may be the country root. ADM1 may attach to that explicit ADM0 for the
   same `shapeGroup` after both layers validate. ADM2-ADM5 must remain
   `unresolved` unless the manifest supplies an independently reviewed explicit
   parent map. Do not assign parents by name, centroid, random sample point,
   overlap, or containment in this increment.
5. An unresolved parent is a blocking validation result for publication of that
   deeper layer, not permission to flatten it or attach it to ADM0. The command
   may produce a bounded review report with stable child IDs and reasons.

### 5. Persist one source revision atomically and idempotently

1. Add a focused import application service using injected Prisma and
   `PostgisRegionGeometryRepository`. The CLI composes it; the service itself
   does not read process arguments, environment, files, or network.
2. Upsert `RegionSource` by the existing
   `(provider, codeSystem, sourceVersion)` identity. Define `sourceVersion` from
   the canonical manifest identity/build, not the mutable word `current`.
   Populate the existing provenance and redistribution fields with bounded,
   accurate metadata and an attribution/modification note.
3. Within a reviewed transaction boundary, create/update regions for the same
   source revision, source codes, aliases, explicit parent links, and geometry.
   Use batched lookups/writes rather than an unbounded query per feature. Pass
   every geometry through the production PostGIS repository and tagged SQL
   path. Do not use unsafe raw SQL.
4. A failed layer writes nothing visible for that source revision. A repeated
   import of identical manifest/artifacts is a no-op with identical stable
   identities. A changed checksum under the same manifest/source identity is a
   hard conflict. A newer build creates a distinct source revision and does not
   silently mutate old provenance.
5. Do not delete or retire regions absent from a new snapshot automatically.
   Produce a bounded reconciliation report and require a later explicit
   governance decision before retirement or source precedence changes.
6. Keep global reference geography outside organization RLS. Do not add tenant
   context, dataset publication, observations, or analytics writes to this
   importer.

### 6. Add an operator-only CLI

1. Add explicit workspace/root scripts for two phases, using names that match
   repository conventions:
   - acquire: validated selection -> immutable local manifest/artifacts;
   - import: verified manifest/artifacts -> database transaction.
2. Require explicit paths and selections; include `--dry-run` for validation,
   normalized counts, checksum verification, hierarchy resolution, and planned
   writes without mutation. Do not add an interactive prompt, daemon, cron,
   API endpoint, startup hook, or worker auto-refresh.
3. Fail closed outside the documented operator context. Database import must
   use the existing controlled global/system database path, verify required
   migrations/PostGIS, and never accept a production URL accidentally during
   automated tests.
4. Exit nonzero with stable safe categories for selection, discovery,
   acquisition, manifest, checksum, provider schema, licence, hierarchy,
   geometry, database, and partial-write failures. Preserve detailed causes for
   operators without printing sensitive/raw content.

### 7. Test the complete boundary

1. Unit-test manifest canonicalization/validation, URL allowlisting and redirect
   rejection, timeouts, byte caps, content types, checksum/length drift,
   duplicated layers/features, provider-schema drift, and safe error/log output.
2. Use a local controlled HTTP fixture for acquisition tests; ordinary tests
   must never contact geoBoundaries, GitHub, or the public internet. Prove no
   credentials/cookies are forwarded and redirects cannot escape the allowlist.
3. Test normalization with small synthetic ADM0/ADM1/ADM2 fixtures: valid
   country/ADM1 hierarchy, duplicate IDs, mismatched group/type, missing names,
   Polygon/MultiPolygon, hostile metadata, and unresolved ADM2. Assert no
   name-based or spatial parent inference occurs.
4. Test the application service for transaction rollback, unchanged retry,
   checksum conflict, distinct source revision, batched access, code/alias
   identity, geometry rejection, no automatic retirement, and bounded reports.
5. Add guarded real-PostGIS integration proving one synthetic ADM0+ADM1 import,
   source/code/alias/parent/geometry persistence, idempotent rerun, and total
   rollback on one invalid feature. Clean up only fixtures created by the test.
   A missing database is an explicit skip/block, not fabricated proof.
6. Test both CLI phases, dry-run, invalid arguments, unsafe paths, and nonzero
   exits. Do not perform a live provider request in CI.
7. During implementation, perform one manual discovery/acquisition smoke test
   only if network access is approved and available. Use a minimal explicitly
   selected country/ADM layer, retain no downloaded geometry in git, quote the
   real output, and document the exact upstream boundary/build/commit/checksum.
   If unavailable, state the block; deterministic local tests remain required.

### 8. Documentation and current-state reconciliation

1. Update `docs/ingestion.md` with the chosen provider, manifest schema,
   acquisition/import commands, source identity, provenance/attribution,
   transaction/idempotency rules, safe failures, live smoke evidence or exact
   block, and residual hierarchy/provider-governance limits.
2. Update `docs/system-architecture.md` so `DataProvider` becomes current only
   for the implemented operator-only `gbOpen` adapter. Keep automatic refresh,
   source precedence, deeper hierarchy resolution, and authoritative overrides
   explicitly deferred.
3. Update `docs/security.md` with the outbound provider trust boundary,
   allowlisted fetching, checksum/manifest integrity, untrusted metadata and
   geometry handling, licence evidence retention, rollback, and residual legal/
   provider-compromise risk. Preserve existing TM IDs/scores unless repository
   evidence requires the smallest justified change.
4. Update `docs/backend.md` only where its deferred provider/import statements
   become stale. Do not rewrite unrelated implementation history.
5. Update `docs/build-plan.md` Phase 7 status only if the committed result meets
   the phase wording accurately. Do not declare Phase 7 complete while
   ADM2-ADM5 parent resolution, real provider publication, or required live
   evidence remains unresolved.

## Explicit non-goals

- No customer-facing geography browser, map, attribution UI, REST/GraphQL
  provider endpoint, shared client contract, or browser workflow.
- No automatic refresh, scheduler, webhook, queue job, background downloader,
  or import during API/worker startup.
- No `gbHumanitarian`, `gbAuthoritative`, GADM, OSM direct import, CGAZ/global
  composite, shapefile, TopoJSON, GeoPackage, or arbitrary URL/provider plugin.
- No claim that geoBoundaries is legally or politically authoritative for every
  jurisdiction; no silent handling of disputed boundaries.
- No guessed ADM2-ADM5 hierarchy, fuzzy/name matching, centroid/containment
  parent assignment, source precedence, automatic retirement, or destructive
  replacement.
- No tenant dataset, metric, observation, dashboard, report, export, AI,
  storage, upload, parser-process, queue, or launch-readiness expansion.
- No downloaded provider geometry committed to git, embedded in images, or
  logged; no production data import merely to strengthen acceptance evidence.

## Acceptance criteria

- The approved `geoBoundaries` / `gbOpen` decision and its attribution,
  replacement, update, and legal-evidence boundaries are recorded.
- Acquisition can only discover validated `gbOpen` country/ADM selections and
  produces a deterministic manifest pointing to commit-addressed, checksummed
  GeoJSON artifacts.
- Import accepts only verified manifest/artifact pairs, preserves every required
  provenance/licence fact, uses the existing safe PostGIS write path, and is
  atomic and idempotent.
- ADM0/ADM1 explicit hierarchy works; deeper layers fail closed as unresolved
  without a reviewed parent map. No hierarchy is inferred from names or
  geometry.
- No public API/UI or implicit network activity is added. Tests make no public
  network calls and prove SSRF/redirect/size/schema/checksum/rollback controls.
- Documentation distinguishes implemented code, controlled test evidence, live
  provider smoke evidence, and remaining operational/product decisions.

## Verification and handoff

Before coding, re-read every named skill and inspect the installed Node, Nest,
Prisma, and Jest declarations used. Run focused unit and CLI tests first. If the
controlled test database is available, deploy migrations normally and run the
guarded integration suite. If an approved network is available, run only the
minimal smoke test described above.

Then run and quote real output for:

```bash
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

Run any new acquire/import commands in `--help` and `--dry-run` modes and quote
their bounded output. Never count a skipped database or blocked network as a
pass; quote the exact dependency failure and complete every deterministic gate.

Inspect the complete diff and staged diff. Invoke `requesting-code-review` with
actual `BASE_SHA`/`HEAD_SHA`, this prompt, the approved provider/licence
decision, provider limitation evidence, changed paths, schema/migration state,
network/database evidence, and check output. Evaluate all findings through
`receiving-code-review`; fix only verified issues and retest. Because this
changes an external trust boundary and data flow, request follow-up review after
any significant security, source-identity, transaction, or hierarchy change.

Stage only approved files, verify the staged patch, and commit locally to
`main` using a `caveman-commit` message with a body explaining the external data
and provenance boundary. Do not push.
