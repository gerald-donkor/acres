# Ingestion — geography, parsers, runs, and dataset versions

Status: Phase 7A implemented from `prompts/28-geography-ingestion-foundation.md`.
This is the implemented-state record for `server/src/ingestion/`, the new
geography persistence additions, parser adapters, and dataset ingestion REST
routes. It does not claim Phase 8 observations, analytics, dashboards, exports,
or a browser mapping UI exist.

## geoBoundaries gbOpen baseline (Phase 7B)

Acres' first global administrative-boundary baseline is geoBoundaries `gbOpen`.
It is acquired only by an explicit operator command; no API, worker, scheduler,
or startup path fetches provider data. `npm run geography:provider:acquire --
--workdir /safe/operator-dir --select GHA/ADM0,GHA/ADM1` discovers selected
layers and writes only a reviewable manifest plus local artifacts. `npm run
geography:provider:import -- --workdir /safe/operator-dir --manifest
/safe/operator-dir/manifest.json [--dry-run]` validates checksums and imports a
single immutable source revision transactionally.

The manifest pins a commit-addressed raw GeoJSON URL, SHA-256, byte count,
boundary/build/source dates, original source/licence/detail/source, boundary ID,
attribution and modification statement. Its identity excludes acquisition time.
A new upstream build is a new `RegionSource.sourceVersion`; no automatic
`current` refresh, source replacement, or retirement occurs.

ADM0 roots and ADM1-to-ADM0 links are explicit within one manifest. ADM2–ADM5
are acquired but may only be published after `npm run geography:provider:review
-- --workdir ... --manifest ... --parent-map ... --output ...` validates a
schema-v1 operator review artifact. It binds complete immediate-parent
`shapeID` assignments to the base manifest identity and local artifact
checksums; the output manifest canonicalizes those assignments into its source
identity. Import resolves parents by `(country, ADM level, shapeID)`, publishes
every level in one transaction, and aborts rather than reparenting an existing
global region. Acres never derives a parent from names, centroids, containment,
or other spatial heuristics. Source precedence, refresh, jurisdictional
authority, and production publication remain operator decisions. The operator
template is [`server/src/geography/ATTRIBUTION.md`](../server/src/geography/ATTRIBUTION.md).

### Phase 7C database evidence

`server/test/geography-database.e2e-spec.ts` is an explicit fail-closed
PostgreSQL/PostGIS suite. It sends shuffled synthetic ADM0-ADM3 layers through
`GeoBoundariesImportService` and proves exact provider codes and adjacency,
complete aliases/geometries, identical-import idempotency, conflict-safe
no-reparent behavior, late-geometry transaction rollback, supported PostGIS
types, foreign-reference mapping, and interior/edge/exterior point semantics.
It captures exact source and region IDs for cleanup and does not select or
delete fixtures by a broad provider prefix.

`npm run geography:plans` now creates a run-scoped synthetic hierarchy and
grid, reports both the GiST spatial lookup and bounded `(parentId, level)`
lookup, and requires `RegionGeometry_geometry_gist_idx` and
`Region_parentId_level_idx` without planner coercion. The database-free suite
passed 26/26 suites and 157/157 tests; the real server E2E gate passed 4/4
suites and 107/107 tests; and the geography report passed both plans. Live
provider publication, legal review, precedence, refresh, parser OS isolation,
and Garage/Valkey/ClamAV drills remain open.

## Current boundary

Phase 7A adds the foundation required to publish an immutable dataset version
from an already accepted upload and mapping:

- global geography now supports parent/child hierarchy, source provenance,
  source codes, aliases, and a PostGIS-backed `RegionGeometry` table;
- organization-owned `Dataset`, `ColumnMapping`, `IngestionRun`,
  `ValidationIssue`, `StagedSourceSummary`, and `DatasetVersion` tables are
  tenant-scoped and forced through RLS;
- parser adapters inspect CSV, XLSX, and GeoJSON into bounded summaries and
  validation issues without writing database rows directly;
- the existing worker process now handles both upload scan jobs and ingestion
  run jobs;
- successful validation publishes one immutable `DatasetVersion` for a
  dataset/upload/mapping tuple; validation failure records durable issues and
  publishes nothing.

The implementation stores compact preview structure, validation metadata, and
publication metadata, not raw uploaded rows in PostgreSQL. Phase 8 still owns normalized
observations, metric definitions, aggregates, analytical reads, and quality
semantics.

## Schema and RLS

Migrations `20260824193000_geography_ingestion_foundation` and
`20260824194500_ingestion_tenant_composite_keys` are additive.

Global geography:

- `Region` gains `parentId`, `level`, `regionType`, and `retiredAt`.
- `Region_cycle_guard` rejects direct and recursive parent cycles.
- `RegionSource` records provider, code system, source version/date, license,
  provenance URL, and redistribution notes.
- `RegionCode` stores deterministic source/code-system lookups with a unique
  `(sourceId, codeSystem, normalized)` key.
- `RegionAlias` stores normalized aliases with optional source and locale.
- `RegionGeometry` stores a reviewed SQL `geometry(Geometry, 4326)` column, an
  SRID check, validity flag, metadata, and a GiST index. Prisma deliberately
  does not model the raw geometry column.

Tenant ingestion:

- `Dataset` owns organization dataset metadata and state.
- `ColumnMapping` stores versioned flexible JSON mapping payloads while keeping
  ownership, upload, dataset, creator, version, and validation status typed.
- `IngestionRun` records durable state, stage, progress, attempts, failure,
  cancellation, timestamps, deterministic identity, and optional published
  version link.
- `ValidationIssue` records bounded safe issue messages and row/column/region
  references.
- `StagedSourceSummary` stores sampled row/column structure for repeatability.
- `DatasetVersion` stores immutable publication metadata and has unique guards
  for version numbers and dataset/upload/mapping publication.

All tenant ingestion tables enable and force RLS. Policies match the existing
tenant pattern: rows are visible only when `acres.organization_id` matches, or
when the transaction-local worker context sets `acres.worker_access=true`.
Composite tenant foreign keys anchor dataset/upload/mapping/run/version
references on `(organizationId, id)`, so worker-scoped writes cannot create an
organization-A row that points at an organization-B dataset or upload.

## Parser behavior

Parser packages were selected from current npm metadata during implementation:

- `csv-parse` `7.0.2`, MIT, for CSV parsing;
- `read-excel-file` `9.3.10`, MIT, for XLSX sheet inspection;
- `fflate` `0.8.3`, MIT, for direct XLSX container inspection without payload decompression;
- GeoJSON validation is local and bounded; the older LGPL GeoJSON validator
  package was deliberately not added.

Temporary development safety limits are validated at boot:

```text
PARSER_MAX_ROWS=10000
PARSER_MAX_COLUMNS=200
PARSER_MAX_CELL_CHARS=2000
PARSER_MAX_SAMPLE_ROWS=5
PARSER_MAX_GEOJSON_FEATURES=2500
PARSER_MAX_GEOJSON_COORDINATES=100000
```

These are safety defaults, not customer product limits or launch SLOs.

CSV defaults to UTF-8, header rows, comma delimiter, skipped empty lines, and
formula-looking values treated as text. GeoJSON accepts `Feature` and
`FeatureCollection`, counts features/coordinates, records property columns plus
geometry type, and assumes SRID 4326 unless future logic detects a contradictory CRS.

XLSX implements pre-parse container classification before sheet parsing:

- detects the OLE Compound File signature (`D0 CF 11 E0 A1 B1 1A E1`) and rejects encrypted or password-protected workbooks (`encrypted_workbook_unsupported`);
- inspects ZIP archive entry metadata using `fflate` filtering without decompressing entry payloads, rejecting macro payloads (`xl/vbaProject.bin`, normalized and case-insensitive) with `macro_enabled_workbook_unsupported`;
- enforces `MAX_XLSX_ENTRIES = 1000` entry count cap against archive abuse (`xlsx_entry_limit_exceeded`);
- fails closed on corrupt ZIPs or `readSheet` errors with stable `invalid_xlsx_container` validation issues without leaking exception text or internals;
- reads the first sheet deterministically and treats formula-looking values as text.

The preview sent back in `sampleRows` is capped by `PARSER_MAX_SAMPLE_ROWS`.
Validation uses a separate bounded `validationRows` set up to the row/feature
limits, so a bad mapped region after the first preview rows still blocks
publication and records a durable issue. CSV uses the parser's line cap to
avoid materializing over-limit rows; XLSX and GeoJSON reject buffers above the
temporary parser byte ceiling before format parsing, then apply row, feature,
coordinate, column, and cell checks after decoding.

### Child-process parser isolation

To prevent parser engine bugs, memory leaks, or non-terminating CPU loops from
disturbing the long-lived worker (which manages database connections, outbox
dispatch, queues, and object storage), parser execution is isolated into dedicated
short-lived Node child processes:

- **Framework-free Port**: `ParserExecutorPort` accepts only `Buffer`, `mediaType`,
  and serializable `ParserLimits`, resolving a `ParsedSourceSummary`.
- **Pure Dispatch**: `parseSourceBuffer()` provides shared format inspection
  for CSV, XLSX, and GeoJSON without importing Nest, Prisma, or infrastructure.
- **Single-Use Child Process**: `ChildProcessParserExecutor` spawns one child per
  parse request via `child_process.fork()`, pointing to the emitted
  `parser-child.entry.js` in `dist/`.
- **Least-Privilege Child Environment**: The child receives only `{ NODE_ENV: config.nodeEnv }`.
  No database credentials (`DATABASE_URL`), session secrets, Valkey, Garage, ClamAV,
  SMTP, or Gemini keys are passed. Stdio is ignored (`['ignore', 'ignore', 'ignore', 'ipc']`)
  and advanced serialization handles buffer IPC transfer.
- **Resource Abuse Guards**:
  - `PARSER_CHILD_TIMEOUT_MS=15000` (bounds: 1,000–60,000 ms) parent watchdog timer.
  - `PARSER_CHILD_MAX_OLD_SPACE_MB=192` (bounds: 32–1,024 MB) enforced via
    `--max-old-space-size=192` child execution argument.
- **Local Benchmark Evidence** (measured under Node v26 / Node 24 runtime against max boundaries):
  - 10,000-row CSV (485 KB): ~58.6 ms, Heap ~13.7 MB, RSS ~90.7 MB
  - 2,500-feature GeoJSON (382 KB): ~12.0 ms, Heap ~21.2 MB, RSS ~96.9 MB
  - 10,000-row XLSX (181 KB): ~120.9 ms, Heap ~32.8 MB, RSS ~134.7 MB
- **Untrusted IPC Validation**: Every child IPC response is validated in the parent
  against expected `sourceKind`, integer row/column counts, string length limits
  (<= 200 chars), cell bounds, and issue code regex (`/^[a-z0-9_]{1,64}$/`). Malformed,
  mismatched, or unhandled failures return deterministic safe blocking issues
  (`parser_execution_failed` or `parser_execution_timed_out`) and never leak exception
  stacks, process IDs, or system paths to database tables or logs.
- **Lifecycle Cleanup**: In-flight child processes are tracked and killed (`SIGKILL`)
  on job completion, error, timeout, or Nest `onApplicationShutdown` worker shutdown.
- **Telemetry**: Low-cardinality parser execution metrics are recorded via
  `acres_parser_executions_total` and `acres_parser_execution_duration_seconds`
  with `source_kind` and `status` (`success`, `validation_issue`, `failed`, `timeout`) labels.
- **Security Boundary**: This isolation is fault containment, **not** an OS or container
  sandbox (the child runs under the same service account and container filesystem). Full OS
  sandboxing (seccomp, UID isolation, network namespaces) remains an infrastructure concern.

## Worker publication flow

`POST /api/v1/datasets/:datasetId/ingestion-runs` creates an `IngestionRun` and
enqueues `ingestion.run:<runId>` through the existing `WORK_QUEUE` port. The
BullMQ adapter is lazy: constructing the API or generating contracts no longer
opens a Valkey connection; enqueue/readiness create the client when needed.

`UploadWorkerService` dispatches `ingestionRunId` jobs to
`IngestionProcessorService`. The processor:

1. re-reads the run, upload, stored object, and mapping from PostgreSQL;
2. skips already published or cancelled runs;
3. marks the run running and stage `inspect`;
4. reads accepted object bytes through the storage port;
5. parses a bounded source summary and validates the mapping's region column
   against global `RegionCode`/`RegionAlias` matches;
6. replaces prior retry issues/summary for the run;
7. records blocking issues and marks `validation_failed`, or publishes one
   immutable `DatasetVersion`;
8. marks the mapping valid/invalid and links the published version to the run.

Publication is idempotent for the same organization/dataset/upload/mapping
tuple. Failed and cancelled runs do not expose a published version.

## REST routes

All routes are `/api/v1`, use the existing success/error envelopes, and require
the selected organization context.

| method   | path                                  | permission         | notes                                     |
| -------- | ------------------------------------- | ------------------ | ----------------------------------------- |
| `GET`    | `/datasets`                           | `datasets.read`    | list up to 50 organization datasets       |
| `POST`   | `/datasets`                           | `datasets.create`  | CSRF + `Idempotency-Key`; create metadata |
| `GET`    | `/datasets/:datasetId`                | `datasets.read`    | scoped dataset read                       |
| `PATCH`  | `/datasets/:datasetId`                | `datasets.update`  | update non-archived metadata              |
| `GET`    | `/datasets/:datasetId/versions`       | `datasets.read`    | list published versions                   |
| `POST`   | `/datasets/:datasetId/mappings`       | `ingestion.run`    | CSRF + idempotency; accepted upload only  |
| `POST`   | `/datasets/:datasetId/ingestion-runs` | `ingestion.run`    | CSRF + idempotency; queues worker run     |
| `GET`    | `/ingestion-runs/:runId`              | `ingestion.read`   | durable run status                        |
| `GET`    | `/ingestion-runs/:runId/events`       | `ingestion.read`   | SSE stream; 1500ms interval to completion |
| `GET`    | `/ingestion-runs/:runId/issues`       | `ingestion.read`   | up to 100 issues                          |
| `DELETE` | `/ingestion-runs/:runId`              | `ingestion.cancel` | cancel before publication                 |

Owners/admins have all dataset and ingestion permissions. Analysts can create,
update, run, cancel, and read. Viewers can read datasets and ingestion status
only.

### Ingestion progress streaming

`GET /api/v1/ingestion-runs/:runId/events` streams live ingestion progress via Server-Sent Events (SSE):

- Scoped by active organization context and requires `ingestion.read` permission.
- Pre-flight checks verify the run exists and belongs to the organization before starting the stream.
- Emits `ingestion.progress` events at 1500ms intervals until reaching a terminal state (`published`, `failed`, `cancelled`).
- Event IDs use low-risk composite identifiers (`${runId}:${state}:${stage}:${progressPercent}`).
- Client helper `streamIngestionRunProgress` connects via `fetch()` + `ReadableStream` and falls back to `getIngestionRun` polling if the stream fails to establish.

### Browser dataset upload, mapping, and ingestion workflow

Prompt 37 implemented the browser-facing dataset workspace:

- **Routes**: `/app/datasets` (list datasets, publication summaries, versions count), `/app/datasets/new` (dataset creation form), `/app/datasets/[datasetId]` (dataset detail, version history table, and interactive ingestion pipeline).
- **Direct storage upload**: Client inspects selected CSV/XLSX/GeoJSON files, computes the SHA-256 hex digest using Web Crypto `crypto.subtle.digest`, initiates upload via `POST /api/v1/uploads`, issues direct presigned `PUT` to object storage, and completes upload via `POST /api/v1/uploads/:id/complete` verifying checksum and byte counts.
- **Interactive mapping**: Step 2 lets authors configure `regionColumn` / `regionCodeColumn` and map source columns to typed metric keys, units, and aggregation functions via `POST /api/v1/datasets/:id/mappings`.
- **Live SSE progress**: Step 3 starts the ingestion run via `POST /api/v1/datasets/:id/ingestion-runs`, connects to `GET /api/v1/ingestion-runs/:id/events` using fetch-based SSE stream (`streamIngestionRunProgress`), renders live stage and percentage progress via Base UI `<Progress />`, provides run cancellation affordance, and announces completion via `aria-live="polite"`.
- **Validation issues reporting**: If the ingestion fails validation, `listIngestionIssues` fetches issues from `/api/v1/ingestion-runs/:id/issues` and renders an accessible table displaying issue severity, code, description, row number, and region reference.
- **RBAC enforcement**: Viewers see read-only dataset cards and versions without creation, upload, or run controls.

## PostGIS geometry write and spatial read boundary

Prompt 44 implemented the internal geography write repository, topological
validity enforcement, and spatial query plan proof:

- **Module & Boundary Location**: `server/src/geography/` owns `GeographyModule`,
  `PostgisRegionGeometryRepository`, `validateGeometryInput`, and domain error
  definitions. This is an internal administrative/importer seam without public
  REST controllers, GraphQL mutations, DTOs, or browser GIS endpoints.
- **Accepted Input Contract**: `WriteRegionGeometryInput` accepts opaque
  authorized `regionId` and `sourceId`, a finite `GeoJsonGeometry` value
  (`Point`, `MultiPoint`, `LineString`, `MultiLineString`, `Polygon`,
  `MultiPolygon`), optional `sourcePrecision` (string <= 100 characters without
  control characters), and optional `metadata` (plain JSON object <= 64 KB).
- **Rejected Inputs**: Feature and FeatureCollection wrappers, unsupported types
  (`GeometryCollection`), 3D/4D ordinates (Z/M coordinates), non-finite numbers
  (`NaN`, `Infinity`), out-of-range coordinates (longitude outside `[-180, 180]`,
  latitude outside `[-90, 90]`), unclosed polygon linear rings (first position !=
  last position), rings with < 4 positions, lines with < 2 positions, nesting
  depth > 6 (`GEOMETRY_MAX_DEPTH`), coordinate count > 100,000
  (`GEOMETRY_MAX_COORDINATES`), and serialized JSON > 10 MB
  (`GEOMETRY_MAX_JSON_BYTES`).
- **Order of Database Operations & Topological Validity**:
  1. Authoritative framework-free prevalidation in TypeScript before any SQL call.
  2. Construction of spatial geometry using verified PostGIS function
     `ST_SetSRID(ST_GeomFromGeoJSON(CAST($json AS json)), 4326)` in a single
     parameterized tagged SQL template (no `$queryRawUnsafe` or dynamic SQL).
  3. CTE evaluation of `ST_IsValid(geom)`, `ST_IsEmpty(geom)`,
     `ST_GeometryType(geom)`, and `ST_SRID(geom)`.
  4. Deterministic atomic upsert on `(regionId, sourceId)` unique key with
     `WHERE e.is_valid = true AND e.is_empty = false AND e.srid = 4326 AND UPPER(e.geom_type) = UPPER($expectedType)`.
  5. If PostGIS topological check fails (e.g. self-intersecting bow-tie polygon),
     0 rows are selected for insertion, returning an empty set. The repository
     detects this and throws `GeometryError.invalid` (`INVALID_GEOMETRY`) with zero
     database mutations and complete atomicity.
  6. Foreign key constraint violations (`23503` / `P2003`) map to
     `GeometryError.referenceNotFound` (`REFERENCE_NOT_FOUND`).
- **Safe Error Classification**: Expected validation and constraint failures map
  to stable domain codes without leaking raw SQL, coordinates, PostGIS notices,
  connection details, or exception stacks.
- **Identity & Migration**: Forward-only migration
  `20260829200000_region_geometry_unique_key` replaces the non-unique index with
  a unique index `RegionGeometry_regionId_sourceId_key` on `(regionId, sourceId)`.
- **Global Ownership**: Global geography is shared reference data and does not
  enable tenant RLS. Foreign keys ensure valid global `Region` and `RegionSource`
  provenance references.
- **Bounded Spatial Read & Edge Semantics**: `findRegionsContainingPoint({ longitude, latitude, limit })`
  validates coordinates, clamps limit (`1..50`), and queries using the bounding-box
  prefilter operator (`&&`) plus exact `ST_Intersects` (including points on boundary
  edges as well as interior points) returning only the smallest safe metadata
  projection (`id`, `regionId`, `sourceId`, `srid`, `geometryType`, `isValid`,
  `sourcePrecision`, `metadata`, `createdAt`, `updatedAt`—no raw geometry payloads).
- **Query Plan Evidence Harness**: `npm run geography:plans`
  (`server/src/geography/seed/check-geography-plans.ts`) runs under `NODE_ENV=test`
  against `acres_test`, creates run-scoped synthetic grid and hierarchy fixtures
  through the production repository, evaluates
  `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, and verifies both named spatial and
  hierarchy indexes, cleaning up only captured source and region IDs.

## Verification state

Passing in this implementation session:

```text
npm run prisma:validate --workspace=@acres/server
The schema at prisma/schema.prisma is valid 🚀

npm run typecheck
All packages typecheck cleanly

npm run lint
All packages lint cleanly with 0 errors and 0 warnings

npm run build
Next.js client and NestJS server build cleanly

npm run contracts:check
OpenAPI/GraphQL contracts match code

npm run ops:check
All operational preflights, templates, secret scans, and readiness tests pass cleanly

npm run test --workspace=@acres/server -- --runInBand
Test Suites: 26 passed, 26 total
Tests: 157 passed, 157 total

npm run test:server
Test Suites: 4 passed, 4 total
Tests: 107 passed, 107 total

npm run geography:plans
Overall result: ALL PLANS PASSED (2/2 passed)
```

## Residual gaps

- XLSX container inspection and child-process fault containment isolation are implemented (pre-parse OLE magic detection, case-insensitive VBA project rejection, 1000-entry cap, fail-closed container error classification, single-use child process execution with isolated environment and resource bounds). OS-level container sandboxing (seccomp, network namespaces) remains an infrastructure concern.
- Real PostGIS geometry write and validation repository (`PostgisRegionGeometryRepository`), unique identity constraint, and spatial index query path are implemented.
- The gbOpen operator import and reviewed ADM0-ADM5 hierarchy boundary are
  implemented. Other providers, source precedence, refresh/retirement/dispute
  policy, legal authority, live provider publication, and real
  Garage/Valkey/ClamAV failure drills remain future operational work.
