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

## Query Plan Evidence and Seed Harness

Representative composite indexes are present and verified for high-volume analytics read paths:

- `(organizationId, metricDefinitionId, regionId, periodStart, periodEnd)` on
  `MetricObservation` (`MetricObservation_main_read_idx`) and `MetricAggregate` (`MetricAggregate_main_read_idx`);
- `(organizationId, datasetVersionId)` on `MetricObservation`, `MetricAggregate`, and `MetricAggregateLineage`;
- `(organizationId, dimensionHash)` on `MetricObservation` and `MetricAggregate`;
- `(organizationId, aggregateId, observationId)` for `MetricAggregateLineage` unique lookup;
- `(organizationId, status, key)` on `MetricDefinition` (`MetricDefinition_organizationId_status_key_idx`).

### Deterministic Scale Seed Harness

To make `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` plans measurable without populating production or polluting ordinary unit tests, a dedicated scale seed harness lives in `server/src/analytics/seed/`:

- **Harness modules**:
  - `analytics-scale-seed.types.ts`: typed entity definitions, configuration shapes, and summary types.
  - `analytics-scale-seed.ts`: deterministic entity generator (`buildDeterministicSeedPlan`) and database populator (`seedAnalyticsScale`, `cleanScaleSeed`).
  - `plan-evaluator.ts`: PostgreSQL JSON plan analyzer (`extractPlanNodes`, `evaluateQueryPlan`, `formatPlanReport`) with local regression guards.
  - `check-analytics-plans.ts`: database-backed executable runner.
- **Seeded volume**:
  - Multi-tenant setup across 2 organizations with isolated accounts, memberships, datasets, uploads, and mappings.
  - Primary organization: 6 regions, 4 metric definitions (`synthetic_metric_01` sum, `synthetic_metric_02` avg, `synthetic_metric_03` count, `synthetic_metric_04` max), 2 dataset versions, 12 monthly periods, 3 dimension segments (`urban`, `suburban`, `rural`), generating **1,728 observations**, **1,728 aggregates**, **1,728 lineage evidence links**, and ~86 quality flags.
  - Secondary organization: 2 regions, 1 dataset version, 3 periods, 1 dimension, generating 6 observations, 6 aggregates, and 6 lineages to verify tenant isolation under RLS.
  - Neutral synthetic naming conventions (`Synthetic Scale Region 001`, `synthetic_metric_01`); no real regional intelligence is invented.

### Measured Read Shapes and Local Regression Guards

`npm run analytics:plans` runs `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` against `acres_test` for 6 key query paths:

1. `findMetrics`: `SELECT ... FROM "MetricDefinition" WHERE "organizationId" = $1 AND "status" = 'active' ORDER BY "key" ASC LIMIT 100`
2. `findAggregates (filtered)`: `SELECT ... FROM "MetricAggregate" WHERE "organizationId" = $1 AND "metricDefinitionId" = $2 AND "regionId" = $3 AND "datasetVersionId" = $4 AND "dimensionHash" = $5 AND "periodStart" >= $6 AND "periodEnd" <= $7 ORDER BY "periodStart" ASC, "createdAt" ASC LIMIT 50`
3. `findObservations (filtered)`: `SELECT ... FROM "MetricObservation" WHERE "organizationId" = $1 AND "metricDefinitionId" = $2 AND "regionId" = $3 AND "datasetVersionId" = $4 AND "dimensionHash" = $5 AND "periodStart" >= $6 AND "periodEnd" <= $7 ORDER BY "periodStart" ASC, "createdAt" ASC LIMIT 50`
4. `findAggregateEvidence (lineage)`: `SELECT ... FROM "MetricAggregateLineage" WHERE "organizationId" = $1 AND "aggregateId" = $2 ORDER BY "createdAt" ASC LIMIT 200`
5. `listDashboardViews`: `SELECT ... FROM "DashboardView" WHERE "organizationId" = $1 AND "status" = 'active' ORDER BY "updatedAt" DESC LIMIT 50`
6. `dashboardSummary (aggregates)`: `SELECT ... FROM "MetricAggregate" WHERE "organizationId" = $1 ORDER BY "periodStart" ASC, "createdAt" ASC LIMIT 24`

**Local regression thresholds** (not customer SLOs):
- `maxExecutionTimeMs`: 150 ms
- `maxPlanningTimeMs`: 50 ms
- `disallowSeqScanOnTables`: `['MetricAggregate', 'MetricObservation', 'MetricAggregateLineage']` on filtered query shapes.

### Re-running Query Plan Checks

```bash
npm run analytics:plans
```

The script verifies that `NODE_ENV=test` and `DATABASE_URL` targets `acres_test`, enforces RLS transaction context (`acres.organization_id`), executes `seedAnalyticsScale`, benchmarks each query path, evaluates node types and timing guards, redacts credentials and sensitive parameters, and prints a structured summary table.

## Verification

Passing during this implementation:

```text
npm run prisma:validate --workspace=@acres/server
The schema at prisma/schema.prisma is valid 🚀

npm run test --workspace=@acres/server
Test Suites: 11 passed, 11 total
Tests: 53 passed, 53 total

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
```

## Residual Gaps

- Reports, exports, dashboard sharing, collaboration, and AI remain future work;
  the saved-view dashboard surface is recorded in [`dashboards.md`](dashboards.md).
- Aggregation currently rebuilds per-dataset-version aggregates only for rows
  emitted by the just-published version; cross-version rollups are future work.
- Quality semantics are intentionally small: missing and invalid values are
  visible; richer low-confidence or duplicate heuristics remain future work.
- In sandbox environments where local PostgreSQL or Docker is not running, `npm run analytics:plans` reports an actionable dependency failure pointing to `npm run db:up` and migration deployment.
