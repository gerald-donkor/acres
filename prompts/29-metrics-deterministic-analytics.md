# 29 - metrics and deterministic analytics

## Scope, and why it is next

The committed repository is on `main` at `f9746a0`
(`feat(ingestion): add dataset import base`). `docs/ingestion.md` records
Phase 7A as implemented and explicitly says it does not create observations,
metric definitions, aggregates, analytical reads, or quality semantics. The
earliest ordered target whose dependencies are now committed is therefore
Phase 8, "metrics and deterministic analytics."

Implement Phase 8 as the backend analytics foundation that turns published
dataset versions into governed, traceable observations and deterministic read
models:

- add a new analytics bounded context under `server/src/analytics/`;
- add Prisma models and reviewed SQL migrations for organization-scoped metric
  definitions, normalized observations, observation quality flags, aggregate
  snapshots, aggregate lineage/evidence, and any small support tables needed to
  keep value, unit, period, dimension, and version semantics typed;
- force RLS on every tenant-owned analytics table and add composite tenant
  foreign keys where an analytics row points at a dataset version, region,
  metric definition, observation, aggregate, or actor-owned entity;
- define deterministic metric semantics: metric key, display label, value type,
  unit, allowed aggregation, calculation/version metadata, source dataset
  version, region, period start/end, dimensions, and quality state;
- extend the ingestion publication path so a validated mapping can normalize
  source rows into observations for supported mapped measure columns before the
  dataset version becomes analytically visible;
- make publication idempotent for the same organization/dataset/upload/mapping
  tuple and prevent duplicate observations or aggregates on worker retry;
- add deterministic aggregate generation for representative region/metric/
  period/dimension queries, with lineage back to source observations and the
  dataset version;
- expose bounded `/api/v1` analytics read routes only where needed to inspect
  metric definitions, observations, aggregate summaries, and evidence lineage;
- update generated OpenAPI and contract docs if any REST route is added;
- record the implemented analytics state in a new `docs/analytics.md` file and
  add that file to the `AGENTS.md` docs index in the same implementation.

This is not a dashboard phase. The exit state is a tested, tenant-safe
analytics substrate that later GraphQL dashboards can query without inventing
metric meaning or bypassing evidence.

## Reference material read while preparing this prompt

Repository and workflow authority:

- `AGENTS.md` §§2, 2.1, phase-control commands, §§5-10: prompt-first
  execution, required skill loading, checks, review/commit flow, product
  sequence, standing server rules, and no-fabrication rules.
- `docs/build-plan.md` §§1, 9, and 14: Phase 8 dependency, behavior,
  subsystems, non-goals, security/failure cases, tests, observability,
  rollback, documentation owner, skill manifest, and sequence gates.
- `docs/skills.md`: exact local skill paths, hashes, triggers, and the Phase 8
  required and conditional skills.

Current implementation and product authority:

- `docs/ingestion.md`: Phase 7A implemented state, parser/publication flow,
  REST route matrix, verification record, and residual gaps.
- `docs/backend.md`: current Nest, Prisma, route, envelope, versioning,
  generated-contract, RLS, worker, storage, and package state.
- `docs/product.md` §§1-8: B2B regional analytics product job, role ladder,
  upload/map/publish/browse journeys, V1 boundary, data classification,
  behavioral success criteria, open decisions, and glossary.
- `docs/system-architecture.md` §§2-8, 9, 11-13: modular-monolith principles,
  upload/ingestion sequence, tenant/RLS flow, target Analytics module,
  analytics aggregate requirements, interface split, processing requirements,
  and current Phase 7 state.
- `docs/security.md` §§1-10: organization isolation, tenant business data,
  GraphQL/REST/parser/SQL abuse paths, TM-01, TM-07, TM-10, TM-17, TM-20, and
  the security acceptance suite.
- `docs/api/contracts.md`: current REST/GraphQL matrix; update only by running
  the contract generator after route changes.

Current implementation inspected:

- `server/prisma/schema.prisma`: current `DatasetVersion`, `ColumnMapping`,
  `IngestionRun`, `ValidationIssue`, `StagedSourceSummary`, region hierarchy,
  upload/storage/outbox/job models, and absence of Phase 8 analytics tables.
- `server/src/ingestion/ingestion-processor.service.ts`: current worker path
  publishes metadata-only `DatasetVersion` records and intentionally stops
  before observations.
- `server/src/ingestion/**`: parser adapters and source summary shape available
  for normalization.
- `server/src/organizations/permissions.ts`: current permission list; there is
  no analytics permission yet.
- `server/test/*.ts`: current real-database, API, and env e2e coverage entry
  points.

Skills loaded while preparing this prompt:

- `.agents/skills/architecture-patterns/SKILL.md`
- `.agents/skills/nestjs-best-practices/SKILL.md`
- `.agents/skills/postgres-best-practices/SKILL.md`
- `.agents/skills/postgres-best-practices/references/schema-design.md`
- `.agents/skills/sql-optimization-patterns/SKILL.md`
- `.agents/skills/javascript-testing-patterns/SKILL.md`
- `.agents/skills/error-handling-patterns/SKILL.md`
- `.agents/skills/kpi-dashboard-design/SKILL.md`
- `.agents/skills/data-storytelling/SKILL.md`
- `.agents/skills/security-best-practices/SKILL.md`
- `.agents/skills/security-best-practices/references/javascript-express-web-server-security.md`
- `.agents/skills/requesting-code-review/SKILL.md`
- `.agents/skills/receiving-code-review/SKILL.md`
- `.agents/skills/caveman-commit/SKILL.md`

## SKILLS USED

- `architecture-patterns` — keep analytics as its own bounded context with
  application services and repository boundaries; prevent controllers,
  resolvers, or the ingestion worker from owning metric rules directly.
- `nestjs-best-practices` — module/provider/controller structure, DI tokens,
  DTO validation, exception boundaries, and focused tests for new Nest code.
- `postgres-best-practices` — schema design, UUID public IDs, timestamptz
  lifecycle columns, typed fields instead of opaque JSON, and migration review.
- `sql-optimization-patterns` — indexes, representative read paths, query-count
  limits, and `EXPLAIN (ANALYZE, BUFFERS)` evidence for analytics queries.
- `javascript-testing-patterns` — Jest unit/integration tests, fixtures,
  idempotency checks, and deterministic calculation coverage.
- `error-handling-patterns` — typed validation/calculation failures, partial
  publication rollback, and useful non-leaky errors.
- `kpi-dashboard-design` — metric governance, consistent definitions, units,
  periods, context, and avoiding contradictory dashboard-ready semantics.
- `data-storytelling` — evidence lineage and "so what" conventions without
  inventing recommendations, claims, or unsupported targets.
- `security-best-practices` — secure-by-default TypeScript/Nest-on-Express
  implementation for tenant data, validated inputs, no secret/log leakage, and
  no unsafe public IDs or raw SQL.
- `api-design-principles` — use if analytics REST routes are added; keep route
  resources bounded, predictable, versioned, and aligned to existing envelopes.
- `openapi-spec-generation` — use if analytics REST routes are added; regenerate
  and check OpenAPI/contract artifacts rather than editing generated files.
- `requesting-code-review` — mandatory after self-verification and before
  finishing implementation.
- `receiving-code-review` — mandatory to evaluate reviewer feedback before
  applying any fix.
- `caveman-commit` — mandatory for the final local commit message.

## Target behavior

### Analytics domain

Add a new Analytics module with explicit ownership of metric definitions,
observations, quality flags, aggregates, aggregate lineage, and read models.
It should expose application-level services to ingestion and future dashboard
code; other modules must not query analytics tables directly.

At minimum, model these concepts with typed columns:

- `MetricDefinition`: organization, stable key, label, optional description,
  value type, canonical unit, allowed aggregation, calculation version,
  lifecycle/status, creation/update timestamps, and uniqueness scoped to
  organization and key.
- `Observation`: organization, dataset version, region, metric definition,
  period start/end or period label with explicit semantics, numeric/text/
  boolean value representation with a constraint allowing exactly one
  compatible value, unit, normalized dimension hash, dimensions JSONB for
  variable approved dimensions, source row or source reference metadata, and
  creation timestamp.
- `ObservationQuality`: observation, severity/state/code/message and optional
  machine-readable details for missing, incompatible, duplicate, coerced, or
  low-confidence values. Do not hide quality failures by silently dropping
  rows.
- `MetricAggregate`: organization, metric, region, period, dimension hash,
  aggregate type, value, unit, calculation version, observation count, quality
  summary, dataset-version set or latest-version marker, and creation timestamp.
- `AggregateLineage` or an equivalent join: aggregate to source observations
  and dataset versions so every result can resolve to evidence.

Names may differ if the existing codebase strongly prefers another naming
scheme, but the implementation must preserve the concepts and record the final
names in `docs/analytics.md`.

### Mapping and normalization

Extend the existing `ColumnMapping.mapping` contract without breaking current
Phase 7 mappings:

- continue to accept `regionColumn` or `regionCodeColumn`;
- add an explicit `metrics` or equivalent array describing mapped measure
  columns, metric key/label, value type, unit, aggregation type, optional period
  columns or static period metadata, and optional dimension columns;
- validate that referenced source columns exist in the parsed source summary;
- validate that numeric mappings parse deterministically, text/boolean mappings
  are explicit, units match the metric definition, and dimensions are bounded;
- treat blank/null/invalid values according to documented rules and emit
  quality issues rather than guessing;
- reject ambiguous duplicate metric keys or incompatible remapping within the
  same organization unless a documented versioning rule allows it.

If the current parser summary does not retain enough row data to safely produce
observations from an accepted file, implement the smallest necessary extension
to parser output and worker processing to preserve bounded validation rows for
publication. Do not store unbounded raw uploads in PostgreSQL and do not invent
analytics from preview-only samples.

### Publication and idempotency

Dataset version publication must be atomic from the reader's perspective:

- failed normalization or aggregate generation leaves the previous published
  version readable and creates no partially visible analytics rows;
- retrying the same ingestion run or the same dataset/upload/mapping tuple does
  not duplicate metric definitions, observations, aggregates, quality rows, or
  lineage;
- cancellation before publication prevents analytics visibility; cancellation
  after publication must not corrupt immutable evidence;
- all analytics writes use the selected organization context or explicit worker
  context plus tenant-scoped composite keys;
- worker payloads remain identifier-only and must not contain source data,
  signed URLs, raw rows, secrets, or derived analytics payloads.

### Read models and routes

Add REST routes only if they are needed to prove and exercise Phase 8 read
models before Phase 9 GraphQL dashboards. If added, keep them `/api/v1`, use
the existing success/error envelopes, require selected organization context,
and add centralized permissions rather than controller-local role checks.

Expected route shape if REST is added:

| method | path | permission | notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/analytics/metrics` | `analytics.read` | bounded metric definition list |
| `GET` | `/api/v1/analytics/metrics/:metricId` | `analytics.read` | one metric definition in the selected organization |
| `GET` | `/api/v1/analytics/observations` | `analytics.read` | bounded filters by metric, region, dataset version, period, and dimensions |
| `GET` | `/api/v1/analytics/aggregates` | `analytics.read` | deterministic aggregate read model with quality summary |
| `GET` | `/api/v1/analytics/aggregates/:aggregateId/evidence` | `analytics.read` | bounded lineage back to observations and dataset versions |

Owners, admins, analysts, and viewers should be able to read published
analytics unless `docs/product.md` is changed with an approved reason. Do not
add write routes for manual metric editing unless implementation proves they
are required for publication and the prompt is split or updated before coding.

GraphQL dashboard read models remain Phase 9. Do not broaden `/graphql` in this
prompt unless a minimal query is required to preserve an existing contract; if
that happens, document the reason and update SDL snapshots.

## Measurements and verification procedures

There are no visual measurements in this prompt. Use data and database
measurements instead:

- Use deterministic fixtures with at least two organizations, two dataset
  versions, multiple regions, multiple periods, multiple metric definitions,
  duplicate rows, null values, invalid numeric values, unit mismatch, and at
  least one dimension column.
- Add representative SQL plans for the principal read paths using
  `EXPLAIN (ANALYZE, BUFFERS)` against the real test database or a documented
  seeded local database. Record the commands, row counts, and plan summaries in
  `docs/analytics.md`.
- Principal read paths must include:
  `(organization_id, metric_id, region_id, period)`, dataset-version lookup,
  dimension-hash lookup, aggregate lookup, evidence reverse lookup, and
  cross-tenant negative lookup.
- If the local environment cannot produce meaningful query-plan timings, still
  verify index selection and buffer shape where possible, and record the limit
  honestly. Do not invent SLOs or latency thresholds.

## Expected files and implementation shape

Likely files to add or change:

- `server/prisma/schema.prisma`
- `server/prisma/migrations/<timestamp>_analytics_foundation/migration.sql`
- `server/src/analytics/analytics.module.ts`
- `server/src/analytics/analytics.service.ts`
- `server/src/analytics/analytics.repository.ts` or equivalent repository port
- `server/src/analytics/analytics.controller.ts` if REST reads are added
- `server/src/analytics/dto/*.ts`
- `server/src/analytics/*.spec.ts`
- `server/src/app.module.ts`
- `server/src/ingestion/ingestion-processor.service.ts`
- `server/src/ingestion/dto/create-mapping.dto.ts`
- `server/src/ingestion/parsers/*` if publication needs richer bounded row data
- `server/src/organizations/permissions.ts`
- `server/test/api.e2e-spec.ts`
- `server/test/database.e2e-spec.ts`
- `docs/api/openapi.json`, `docs/api/schema.graphql`, and
  `docs/api/contracts.md` if generated contracts change
- `docs/analytics.md`
- `docs/backend.md`
- `docs/product.md`
- `docs/system-architecture.md`
- `docs/security.md`
- `AGENTS.md` docs index row for `docs/analytics.md`

Adjust this list to the actual codebase after inspection, but keep the changes
inside the Phase 8 boundary.

## Non-goals

- No dashboard UI, saved views, chart components, browser analytics pages, or
  GraphQL dashboard optimization. Those are Phase 9.
- No reports, report revisions, exports, PDF/CSV generation, spreadsheet
  formula escaping, or artifact downloads. Those are Phase 10.
- No optional AI, prompts, model registry, RAG, or narrative generation. That is
  Phase 11 and requires a separate enablement decision.
- No provider geography imports or new public-data connector.
- No production SLOs, retention windows, launch alert thresholds, or capacity
  promises without real operator/business input.
- No billing, entitlements, custom roles, public sharing, or anonymous
  analytics.
- No decorative placeholder metrics or fabricated seed data from the marketing
  comps. Test fixtures must be clearly synthetic and isolated to tests.

## Security and failure cases

Cover these cases in code and tests:

- foreign organization metric, observation, aggregate, evidence, dataset
  version, region relation, and dimension filters return not-found/empty through
  repositories, REST, and RLS;
- missing tenant context defaults to deny;
- runtime and worker roles cannot bypass RLS or create cross-tenant analytics
  references;
- malformed filters, oversized pagination, unknown metric IDs, invalid cursors
  if any, unsupported aggregation types, incompatible units, invalid periods,
  dimension explosion, duplicate observations, null/blank ambiguity, invalid
  number parsing, precision edge cases, and mixed type values fail predictably;
- aggregate rebuild/retry is idempotent and does not expose partial rows;
- stale dataset versions do not overwrite immutable prior evidence;
- quality flags remain visible in read models and cannot be hidden by filtering
  defaults that imply cleaner data than exists;
- no query or log includes raw uploaded row payloads, secrets, session tokens,
  CSRF tokens, signed URLs, or high-cardinality sensitive values.

## Tests and checks

Before requesting review, run and quote real output for:

```bash
git diff --check
npm run prisma:validate --workspace=@acres/server
npm run typecheck --workspace=@acres/server
npm run test --workspace=@acres/server
npm run test:e2e --workspace=@acres/server -- api.e2e-spec.ts database.e2e-spec.ts env-validation.e2e-spec.ts
npm run contracts:generate
npm run contracts:check
npm run lint
npm run typecheck
npm run build
npm run test:server
```

If a command is blocked by the local sandbox or missing external dependency,
rerun with the required approval flow where appropriate. If it still cannot
run, record the exact error and the residual risk in `docs/analytics.md` and
the final response.

The test suite must include:

- golden calculation tests for supported aggregation types;
- property or invariant tests for unit compatibility, value representation,
  period bounds, dimension hash stability, and duplicate handling;
- ingestion publication tests proving observations, quality rows, aggregates,
  and lineage are written atomically for valid mapped files;
- validation failure tests proving no analytics rows are visible after a failed
  or cancelled run;
- retry/idempotency tests for repeated worker execution;
- two-organization negative tests across Prisma repositories, REST routes if
  added, and RLS catalog/pool reuse;
- query-count or plan tests for representative analytics reads and aggregate
  evidence reads;
- generated OpenAPI/contract drift checks if routes change.

## Documentation and review

Create `docs/analytics.md` as the implemented-state record for this phase. It
must state:

- exact schema and model names;
- metric-definition, observation, quality, aggregate, and evidence semantics;
- mapping payload shape and compatibility rules;
- tenant/RLS and worker publication guarantees;
- route matrix if REST reads are added;
- query-plan evidence or honest local limitations;
- commands run and exact pass/fail output;
- residual gaps left for dashboards, reports, exports, operations, and AI.

Update `docs/backend.md`, `docs/product.md`, `docs/system-architecture.md`, and
`docs/security.md` only for facts that changed. Add exactly one row for
`docs/analytics.md` to the `AGENTS.md` docs index.

After self-verification, run the mandatory two-stage review loop:

1. Use `requesting-code-review` to dispatch a reviewer subagent with the prompt,
   changed files, base/head SHAs, implementation summary, and exact checks run.
2. Use `receiving-code-review` to verify feedback against the codebase before
   changing anything. Fix valid critical/important issues and re-run affected
   checks.
3. Request re-review if fixes change schema, API contracts, RLS, publication
   flow, or analytics semantics materially.

End by committing all Phase 8 implementation and documentation changes on
`main` with a `caveman-commit` Conventional Commit message. Do not push.
