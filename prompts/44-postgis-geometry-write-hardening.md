# 44 - Harden PostGIS geometry writes and spatial proof

## Scope and why this is next

`e049eaa` is the committed `main` tip. It completes the prior Phase 7A parser-isolation hardening. The next dependency-safe Phase 7A unit is the PostGIS geometry-write boundary identified as deferred in [`docs/ingestion.md`](../docs/ingestion.md), [`docs/security.md`](../docs/security.md), and [`docs/system-architecture.md`](../docs/system-architecture.md): `RegionGeometry` has an SQL-owned `geometry(Geometry, 4326)` column, SRID check, and GiST index, but no application helper writes geometry through PostGIS validity checks and no controlled real-database proof exercises that boundary or its intended index path.

This increment adds only an internal geography repository/port and deterministic test/plan harness. It makes the existing global table safe for a future licensed provider importer; it does not select, download, import, or expose provider data. That avoids inventing provenance, source terms, or user-facing GIS behaviour ahead of the required source/license decision.

## Reference material and source of truth

Before changing files, re-read:

- `AGENTS.md`, especially §§2, 2.1, 6–7, 8.2, and 10.
- This approved prompt.
- `docs/build-plan.md` §§1, 8, and 14.
- `docs/ingestion.md` (Schema and RLS; Residual gaps), `docs/backend.md` (§§8 and 15), `docs/system-architecture.md` (§§5, 7, 9, and 14), and `docs/security.md` (TM-07, TM-17, and Phase 7A).
- `server/prisma/schema.prisma`; both Phase 7 migrations; `server/src/prisma/tenant-transaction.service.ts`; `server/src/regions/regions.service.ts`; `server/src/ingestion/ingestion-processor.service.ts`; `server/test/database.e2e-spec.ts`; and `server/src/analytics/seed/check-analytics-plans.ts`.

There is no visual route, UI, motion, comp, or browser surface in this task. Do not imply one exists.

Before coding, verify the installed Prisma 7 and Node declarations for tagged raw-query APIs, transaction-client types, and safe value binding. Use only verified APIs. Verify local PostGIS version/functions from the controlled test database only when it is available; never invent an `EXPLAIN` result.

## SKILLS USED

- `architecture-patterns` — preserve a focused geography port/adapter boundary.
- `nestjs-best-practices` — constructor injection, module ownership, and test seams.
- `postgres-best-practices` — SQL-owned spatial type, constraints, migration discipline, indexes.
- `sql-optimization-patterns` — safe representative predicate and measured query-plan proof.
- `security-best-practices` — validate all geometry/metadata and prevent raw-SQL injection.
- `security-threat-model` — update TM-07/TM-17 evidence without overstating controls.
- `error-handling-patterns` — separate validation failures from operational database failures.
- `javascript-testing-patterns` — deterministic unit/repository/integration tests with cleanup.
- `requesting-code-review` — mandatory reviewer dispatch after self-verification.
- `receiving-code-review` — evidence-based treatment of reviewer findings.
- `caveman-commit` — required concise Conventional Commit message.

## Required implementation

### 1. Define a narrow, non-public geometry boundary

1. Add a framework-free input/output contract under `server/src/geography/` or the existing region-owned module after inspecting module ownership. It accepts only opaque already-authorized `regionId`/ `sourceId`, a finite GeoJSON **Geometry** value (not a Feature or FeatureCollection), and bounded optional source precision/metadata. It returns only stable metadata such as ID, geometry type, SRID, and database-derived validity—not raw GeoJSON/WKT, execution plan output, or database error text.
2. Do not add a controller, DTO, public shared contract, client code, upload-parser behavior, or provider-import command. This is an internal administrative/import seam.
3. Validate before SQL: reject nulls, arrays, Feature wrappers, unsupported types, malformed nesting, non-finite or out-of-range coordinates, empty coordinate containers, Z/M ordinates unless explicitly supported, excess coordinate count/depth, and excess JSON/metadata size. Use named bounded constants justified against current parser controls; do not claim product limits. Reuse an existing utility only if it exactly performs authoritative validation, with tests.
4. Global regions/geometry are not tenant data. Do not add RLS/organization scope just to follow ingestion conventions; require the referenced global region/source to exist and preserve its FK restrictions.

### 2. Implement a safe PostGIS repository

1. Add a focused `PostgisRegionGeometryRepository` (or equivalent) owned by the geography/regions module. It receives `PrismaService` or a verified transaction client by constructor/argument injection and must not instantiate Prisma, read environment, or access HTTP, storage, queues, parsers, or provider files.
2. Serialize the validated geometry once; bind it, IDs, metadata, and other values in a Prisma tagged SQL template. Construct the spatial value only with verified PostGIS functions, for example `ST_SetSRID(ST_GeomFromGeoJSON(CAST($json AS json)), 4326)`. Never concatenate values/identifiers, use dynamic SQL, or use `$executeRawUnsafe`/`$queryRawUnsafe` for runtime geometry work.
3. Require in one statement or tight transaction: SRID 4326, database-derived `ST_IsValid`, non-empty finite geometry, and agreement between computed and validated geometry type. Persist `isValid` from the database result, never caller input. Reject invalid/self-intersecting polygons instead of repairing, transforming, snapping, simplifying, or storing invalid rows.
4. Establish identity semantics from live constraints. If a source revision requires one active row per region/source, add the smallest forward-only migration with a real unique constraint and deterministic upsert. If provenance requires multiple rows, use explicit insert-only behavior and prevent retry duplicates. Do not mutate an applied migration, delete history, or use `ON CONFLICT` without a matching unique constraint.
5. Map expected validation/geometry-constraint rejection to one stable safe domain code. Let connection, permission, timeout, migration, and unrelated database errors follow existing operational paths. Do not log or return SQL, PostGIS notices, geometry, IDs, source URLs, or stacks.
6. Guarantee atomicity: rejected writes cannot leave a `RegionGeometry` row or alter Region, RegionSource, codes, aliases, datasets, observations, or aggregates.

### 3. Prove a bounded spatial read and its index path

1. Add one internal repository read only if needed to prove the existing GiST index: point-in-region or envelope-intersection lookup. Return the smallest safe metadata projection; do not expose a map/search API or geometry payload.
2. Validate finite longitude `[-180,180]`, latitude `[-90,90]`, and a small fixed server-side cap. Bind all values in tagged SQL and enforce SRID 4326. Use an index-friendly bounding-box prefilter (`&&`) plus exact `ST_Intersects`/ `ST_Covers`; select and document the edge-boundary semantics. Never interpolate a dynamic function, operator, ordering, or identifier.
3. Extend `server/src/analytics/seed/check-analytics-plans.ts` or add a comparable `server/src/geography/seed/` test-only harness. It must run only under `NODE_ENV=test` (or the established explicit seed escape hatch) against a URL targeting `acres_test`, create deterministic non-provider fixture region/source/geometry through the production repository, run `ANALYZE`, and use fixed-value `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`.
4. Parse plan JSON structurally and assert `RegionGeometry_geometry_gist_idx` participates, or document a measured planner limitation and stop rather than weakening assertions. Clean up only created fixtures in `finally`; output only bounded counts, node/index names, and timings—never coordinates, geometry, credentials, or SQL values.
5. Add a script only if the current root/workspace scripts lack a suitable opt-in command. It must be clearly test-database guarded and never run as a normal build, production command, or implicit CI step.

### 4. Tests, migration proof, and records

1. Add focused unit tests for accepted Point, LineString, Polygon, and MultiPolygon only where supported; reject wrappers, unsupported type, invalid structure, non-finite/out-of-range coordinates, wrong ordinate count, excess shape/metadata, empty geometry, and self-intersecting polygon. Assert that prevalidation rejection makes no DB call.
2. Add repository-seam tests proving tagged binding, no unsafe raw method, database-derived fields, safe error classification with no raw geometry/SQL/ID leak, and atomic failure behavior. Do not snapshot fixture geometry in SQL.
3. Add real-PostGIS integration coverage, explicitly skipped only if the guarded test DB is unavailable: valid 4326 geometry persists; bow-tie geometry writes no row; foreign references fail existing constraints; documented inside/edge/outside semantics hold. Reuse established real-db guards and cleanup. A missing service is not a pass.
4. After a real migration deployment, run the guarded plan harness. Record the actual command, PostgreSQL/PostGIS versions, fixture scale, relevant plan nodes, index, and timing in `docs/ingestion.md`. If unavailable, record the exact environmental block; a mock does not replace plan evidence.
5. If a migration is added, validate/diff/deploy it only through normal Prisma migration practice. Preserve the documented inability to prove clean apply-from-zero if the environment still cannot provide it.

### 5. Documentation

1. Update `docs/ingestion.md` with boundary location, accepted contract, validation/order of database operations, safe errors, identity semantics, global ownership, predicate boundary behavior, exact plan evidence or limitation, and remaining provider/sandbox constraints.
2. Update `docs/security.md` TM-07/TM-17 and acceptance evidence for prevalidation, parameterized raw SQL, PostGIS validity/SRID checks, and index-plan proof. Do not claim that this provides OS parser sandboxing or a provider trust decision.
3. Update `docs/backend.md` and `docs/system-architecture.md` only if their Phase 7/PostGIS statements would otherwise be stale. Do not alter topology, product scope, RLS strategy, provider decision, no-AI posture, or launch approval.

## Explicit non-goals

- No external source selection, provider import/download, license conclusion, importer CLI, or seeded real administrative boundary.
- No REST/GraphQL/client/browser/map/geocoding/polygon-editing/spatial-search UI or public geometry response.
- No change to tenant RLS, upload/parser behavior, storage, queue, ClamAV, analytics, reports, exports, or AI.
- No geometry repair/transformation, EWKT/WKB upload, arbitrary SQL/dynamic predicates, unsafe Prisma raw call, extension upgrade, or fabricated SLO.
- No destructive migration/history rewrite, table recreation, or provenance-unknown backfill.

## Acceptance criteria

- A focused internal adapter persists only prevalidated, database-valid SRID-4326 geometry with existing provenance references; invalid input has one safe stable failure and writes no row.
- Every runtime spatial query uses verified tagged binding and cannot be redirected by geometry, coordinates, IDs, operators, or metadata.
- The documented predicate has explicit boundary behavior and real test-database GiST-plan proof, or docs honestly give the exact reason that proof cannot run.
- Global geography remains separate from tenant ingestion, and no provider decision or public GIS capability is pulled forward.
- Tests demonstrate semantics, constraints, atomicity, cleanup, and guarded plan behavior without real provider data or production credentials.

## Required verification and handoff

Run focused geometry tests first. With a controlled PostGIS `acres_test` database, run integration, migration, and plan-harness proof. Then quote real output for:

```bash
npm run test --workspace=@acres/server -- --runInBand
npm run prisma:validate --workspace=@acres/server
npm run lint
npm run typecheck
npm run build
npm run test:server
npm run contracts:check
npm run ops:check
git diff --check
git status --short
git diff --cached --check
git diff --cached --stat
```

If database-backed commands cannot run, quote the command and dependency failure; keep related coverage explicitly guarded/skipped and run every deterministic test, format, type, build, contract, and operations check available.

Inspect the complete diff. Invoke `requesting-code-review` with actual `BASE_SHA`/`HEAD_SHA`, requirements, paths, migration state, plan evidence/limitation, and real checks. Evaluate feedback through `receiving-code-review` before changes; fix valid issues and retest. Re-review if a correction changes raw-SQL, migration/identity, spatial predicate, or safe-error behavior. Update owning docs, stage only approved files, inspect staged diff, and commit locally on `main` using `caveman-commit`. Do not push.

