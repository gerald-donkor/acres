# Analytics — metrics, observations, aggregates, and evidence

Status: Phase 8 implemented from `prompts/29-metrics-deterministic-analytics.md`.
This is the implemented-state record for `server/src/analytics/`, the Phase 8
Prisma migration, ingestion publication normalization, and `/api/v1/analytics`
read routes. It does not claim dashboard UI, saved views, reports, exports, or
AI exist.

## Schema

Migration `20260824203000_analytics_foundation` adds five tenant-owned tables:

- `MetricDefinition`: organization-scoped metric key, label, optional
  description, value type, canonical unit, allowed aggregation, calculation
  version, status, and optional source dataset link.
- `MetricObservation`: immutable normalized source-row value for one dataset
  version, region, metric, period, unit, dimensions, source row, and value
  representation. The database enforces exactly one numeric/text/boolean value.
- `ObservationQuality`: visible quality state for an observation, including
  missing, invalid, coerced, duplicate, and low-confidence states.
- `MetricAggregate`: deterministic read model keyed by organization, dataset
  version, metric, region, period, dimension hash, aggregate type, and
  calculation version. The follow-up migration
  `20260824204500_version_analytics_aggregates` makes dataset version part of
  the aggregate uniqueness key so two published versions cannot overwrite one
  another's snapshots.
- `MetricAggregateLineage`: aggregate-to-observation and dataset-version
  evidence links.

All five tables use text UUIDv7-style public IDs, timestamptz lifecycle fields,
organization-scoped composite keys, and forced RLS. Runtime and test roles get
DML only; `acres_test` also gets `TRUNCATE` for the integration helper.

## Mapping Contract

Existing `regionColumn` and `regionCodeColumn` mappings still work. Phase 8 adds
an optional `metrics` array on `ColumnMapping.mapping`:

```json
{
  "regionCodeColumn": "geoid",
  "metrics": [
    {
      "column": "population",
      "key": "population",
      "label": "Population",
      "valueType": "numeric",
      "unit": "people",
      "aggregation": "sum",
      "periodColumn": "year",
      "dimensionColumns": ["segment"]
    }
  ]
}
```

Metric keys must be lower-case snake identifiers. Metric columns, period
columns, and dimension columns must exist in the parsed bounded source summary.
Malformed metric entries, including malformed optional period and dimension
fields, produce blocking validation issues instead of being silently dropped.
Numeric strings are parsed directly into `Prisma.Decimal` and bounded to the
stored `numeric(26, 6)` shape, allowing up to 20 integer digits plus six
fractional digits, so large values do not pass through JavaScript number
precision. Periods accept only `YYYY`, `YYYY-MM-DD`, or UTC `...Z`
datetimes with exact date round-tripping. Blank or unparsable values produce
quality rows and remain visible as observations, but they are excluded from
aggregate math and lineage. Incompatible remapping of an existing metric key to
another value type, unit, or aggregation fails publication.
Numeric values are returned from the REST API as decimal strings rather than
JSON numbers for the same reason.

## Publication

`IngestionProcessorService` parses the existing bounded `validationRows`,
validates region and metric mappings, publishes the `DatasetVersion`, then calls
`AnalyticsPublicationService.publish()` inside the same organization-scoped
transaction. Publication is idempotent for the dataset/upload/mapping tuple:
dataset-version publication keeps its existing uniqueness guard, observations
upsert by source-row/metric/region/period/dimension identity, aggregates upsert
by dataset-version-aware deterministic read-model key, and lineage is rebuilt
for the aggregate from valid observations only.

Failed validation or cancellation before publication leaves no analytics rows
visible for that run. Worker queue payloads remain identifier-only.

## REST Routes

All routes are `/api/v1`, session-authenticated, require selected organization
context, use existing success/error envelopes, and require `analytics.read`.
Owners, admins, analysts, and viewers have that permission.

| method | path                                          | notes                                                                                 |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET`  | `/analytics/metrics`                          | active metric definitions, bounded to 100                                             |
| `GET`  | `/analytics/metrics/:metricId`                | scoped metric definition or not found                                                 |
| `GET`  | `/analytics/observations`                     | bounded filters by metric, region, dataset version, dimension hash, and period window |
| `GET`  | `/analytics/aggregates`                       | deterministic aggregate read model with the same bounded filters                      |
| `GET`  | `/analytics/aggregates/:aggregateId/evidence` | aggregate lineage back to observations and dataset versions                           |

Dashboard-oriented GraphQL read models are implemented in Phase 9; see
[`dashboards.md`](dashboards.md). The analytics REST routes remain the source
for direct metric, observation, aggregate, and evidence reads.

## Query Plan Evidence

Representative indexes are present for:

- `(organizationId, metricDefinitionId, regionId, periodStart, periodEnd)` on
  observations and aggregates;
- `(organizationId, datasetVersionId)` on observations, aggregates, and lineage;
- `(organizationId, dimensionHash)` on observations and aggregates;
- `(organizationId, aggregateId, observationId)` for lineage uniqueness.

The local sandbox cannot reach PostgreSQL, but the explicit local test-database
migration check reached `acres_test` through `acres_migrator` and reported no
pending migrations after the corrective aggregate-key migration. The real
database e2e suite passed. No meaningful `EXPLAIN (ANALYZE, BUFFERS)` timing
was recorded in this pass; the tables are empty outside synthetic test rows, so
timings would not represent a product load.

## Verification

Passing during this implementation:

```text
npm run prisma:validate --workspace=@acres/server
The schema at prisma/schema.prisma is valid 🚀

DATABASE_URL=postgresql://acres_test:...@localhost:5432/acres_test?schema=public \
DATABASE_MIGRATION_URL=postgresql://acres_migrator:...@localhost:5432/acres_test?schema=public \
npm run prisma:migrate:deploy --workspace=@acres/server
Applying migration `20260824205500_widen_analytics_numeric_values`
All migrations have been successfully applied.

npm run test --workspace=@acres/server
Test Suites: 5 passed, 5 total
Tests: 23 passed, 23 total

npm run test:e2e --workspace=@acres/server -- api.e2e-spec.ts database.e2e-spec.ts env-validation.e2e-spec.ts
Test Suites: 3 passed, 3 total
Tests: 77 passed, 77 total

npm run contracts:generate
✔ Generated Prisma Client (7.9.1)

npm run contracts:check
✔ Generated Prisma Client (7.9.1)

npm run lint
@acres/client@0.1.0 lint
@acres/shared@0.1.0 lint
@acres/server@0.1.0 lint

npm run typecheck
✔ Generated Prisma Client (7.9.1)

npm run build
✔ Generated Prisma Client (7.9.1)

npm run test:server
Test Suites: 3 passed, 3 total
Tests: 77 passed, 77 total
```

The first sandboxed migration/e2e attempts failed because the sandbox could not
reach local PostgreSQL or bind Supertest's ephemeral listener. Escalated local
runs succeeded. A local migration attempt with the runtime `acres_test` role
also failed on `_prisma_migrations` permissions, as expected; the documented
`acres_migrator` connection succeeded. The first local migration attempt also
exposed a SQL ordering bug: composite tenant FKs referenced unique indexes that
PostgreSQL did not accept as table constraints at dependency-creation time. The
migration was fixed to create composite unique constraints inline, the failed
local migration record was marked rolled back, and the corrected migration
applied cleanly.

## Residual Gaps

- Reports, exports, dashboard sharing, collaboration, and AI remain future work;
  the saved-view dashboard surface is now recorded in
  [`dashboards.md`](dashboards.md).
- Aggregation currently rebuilds per-dataset-version aggregates only for rows
  emitted by the just-published version; cross-version rollups are future work.
- Quality semantics are intentionally small: missing and invalid values are
  visible; richer low-confidence or duplicate heuristics remain future work.
- Query-plan timings need a seeded dataset large enough to make plans meaningful.
