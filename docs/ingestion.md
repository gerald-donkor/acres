# Ingestion — geography, parsers, runs, and dataset versions

Status: Phase 7A implemented from `prompts/28-geography-ingestion-foundation.md`.
This is the implemented-state record for `server/src/ingestion/`, the new
geography persistence additions, parser adapters, and dataset ingestion REST
routes. It does not claim Phase 8 observations, analytics, dashboards, exports,
or a browser mapping UI exist.

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
formula-looking values treated as text. XLSX reads the first sheet
deterministically and treats formula-looking values as text. GeoJSON accepts
`Feature` and `FeatureCollection`, counts features/coordinates, records
property columns plus geometry type, and assumes SRID 4326 unless future logic
detects a contradictory CRS.

The preview sent back in `sampleRows` is capped by `PARSER_MAX_SAMPLE_ROWS`.
Validation uses a separate bounded `validationRows` set up to the row/feature
limits, so a bad mapped region after the first preview rows still blocks
publication and records a durable issue. CSV uses the parser's line cap to
avoid materializing over-limit rows; XLSX and GeoJSON reject buffers above the
temporary parser byte ceiling before format parsing, then apply row, feature,
coordinate, column, and cell checks after decoding.

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
| `GET`    | `/ingestion-runs/:runId/issues`       | `ingestion.read`   | up to 100 issues                          |
| `DELETE` | `/ingestion-runs/:runId`              | `ingestion.cancel` | cancel before publication                 |

Owners/admins have all dataset and ingestion permissions. Analysts can create,
update, run, cancel, and read. Viewers can read datasets and ingestion status
only.

GraphQL remains read-only and unchanged.

## Verification state

Passing in this implementation session:

```text
npm run prisma:validate --workspace=@acres/server
The schema at prisma/schema.prisma is valid 🚀

npm run typecheck --workspace=@acres/server
✔ Generated Prisma Client (7.9.1)

npm run test --workspace=@acres/server
Test Suites: 3 passed, 3 total
Tests: 8 passed, 8 total

npm run test:e2e --workspace=@acres/server -- api.e2e-spec.ts env-validation.e2e-spec.ts
Test Suites: 2 passed, 2 total
Tests: 58 passed, 58 total

npm run contracts:generate
✔ Generated Prisma Client (7.9.1)
```

Blocked in this environment:

```text
npm run test:server
Test Suites: 3 passed, 3 total
Tests: 74 passed, 74 total
```

The first sandboxed migration attempt could not reach PostgreSQL, but the
escalated local run applied the pending migrations to `acres_test`. The
post-review tenant-key hardening was recorded as
`20260824194500_ingestion_tenant_composite_keys`, applied through Prisma, and
`prisma migrate status` reported the database up to date.

## Residual gaps

- No Phase 8 observation or metric tables are created.
- XLSX macro/encryption detection is limited to what `read-excel-file` exposes
  safely through parse failure. Unsupported suspicious features should be
  hardened before launch.
- GeoJSON geometry validity is counted and bounded in TypeScript; insertion
  helpers that write `RegionGeometry.geometry` through PostGIS validity checks
  are still future work.
- No browser upload/mapping UI exists.
- Real Garage/Valkey/ClamAV worker integration, migration apply from zero
  outside this incrementally upgraded local database, and PostGIS query plans
  still need a dependency-capable environment.
