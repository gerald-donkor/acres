# 28 - geography and ingestion foundation

## Scope, and why it is next

The committed repository is on `main` at `6f85823` with Phase 6 storage,
queue, upload, and worker foundation committed as `ca3bf20`
(`feat(uploads): add storage worker base`). `docs/build-plan.md` records
Phase 7, "geography and ingestion", as the earliest ordered target whose
dependencies are now committed: Phase 6 accepted-object pipeline and worker,
plus Phase 3 RLS/tenant policy.

Implement Phase 7 as a prompt-sized foundation, not the whole future analytics
surface:

- extend global geography from the current flat `Region` records into an
  arbitrary-depth administrative hierarchy with source/provenance, stable
  source codes, aliases, and PostGIS boundary storage;
- add organization-scoped dataset, dataset-version, mapping, ingestion-run, and
  validation-issue persistence with RLS and explicit indexes;
- add parser ports/adapters for CSV, XLSX, and GeoJSON ingestion inspection,
  bounded parsing, validation issue capture, and deterministic staged row
  summaries;
- extend the existing upload worker so an accepted upload can move into an
  ingestion run through inspect, parse, map, validate, and immutable
  dataset-version publication metadata;
- add REST `/api/v1` dataset/ingestion routes for creating a dataset from an
  accepted upload, submitting a mapping, starting/cancelling a run, reading run
  status/issues, and listing published dataset versions;
- update the API contract artifacts and docs for the new geography/ingestion
  boundary.

This is Phase 7A. It must not build metric observations, aggregate analytics,
dashboards, reports, exports, optional AI, or a browser mapping UI. The exit
state for this prompt is repeatable immutable dataset-version publication of
validated source structure and mapping metadata, ready for Phase 8 metrics and
deterministic analytics.

If implementation proves that publishing a dataset version cannot be done
safely without metric/observation tables, stop and split the work explicitly:
complete the geography/schema/parser/run foundation, record the reason in
`docs/ingestion.md`, and leave a precise follow-up prompt scope. Do not invent
analytics tables merely to satisfy this prompt.

## Reference material read while preparing this prompt

Repository and workflow authority:

- `AGENTS.md` §§2, 2.1, 3, 4, 5, 6, phase-control commands, and §§8-10:
  prompt-first execution, required skill loading, mandatory review loop,
  prompt contract, checks, and no fabricated implementation claims.
- `docs/build-plan.md` §§1, 8, and 14: Phase 7 dependency, behavior,
  subsystems, exclusions, security/failure cases, tests, observability,
  rollback, documentation owner, skill manifest, and sequence gates.
- `docs/skills.md`: exact project skill catalog, paths, hashes, and triggers.

Current implementation and product authority:

- `docs/backend.md`: current Nest, Prisma, route, envelope, environment,
  roles/migration, tests, and Phase 6 storage/queue/worker state.
- `docs/product.md` §§1-8: regional analytics product job, fixed roles,
  upload/map/publish journeys, V1 boundary, data classes, success criteria,
  open decisions, and glossary.
- `docs/system-architecture.md` §§2, 5-9, 11-13: modular-monolith boundaries,
  target geography/ingestion data model, RLS identities, interface split,
  upload/ingestion state machine, and Phase 6 current-state update.
- `docs/security.md` §§1-11: current/target trust boundaries, TM-07 and TM-17
  parser/PostGIS risks, security acceptance suite, critical review paths, and
  residual Phase 6 parser-isolation risks.
- `docs/api/contracts.md`: current REST/GraphQL matrix to update only through
  generated contract artifacts after route changes.
- `prompts/27-storage-queues-secure-uploads.md`: accepted Phase 6 boundary and
  non-goals, especially that CSV/XLSX/GeoJSON parsing was deliberately left
  for Phase 7.

Current implementation inspected:

- `package.json` and `server/package.json`: scripts, current server
  dependencies, `start:worker`, contract generation, lint/typecheck/test
  commands, and absence of parser dependencies.
- `server/prisma/schema.prisma`: current `Region`, upload/storage/outbox/job
  models, enums, and the absence of dataset, version, mapping, issue, region
  source/code/alias, and geometry models.
- `server/prisma/migrations/*/migration.sql`: migration chain through
  `20260824170000_storage_queues_uploads`, including current RLS patterns.
- `server/src/uploads/*`, `server/src/worker/upload-worker.service.ts`,
  `server/src/outbox/outbox.service.ts`, `server/src/storage/*`,
  `server/src/scanner/*`, `server/src/queue/*`: accepted-object and worker
  foundation that ingestion must extend rather than duplicate.
- `server/src/organizations/permissions.ts`: current centralized permission
  map with `uploads.read` and `uploads.create`; ingestion permissions must be
  added there, not scattered through controllers.
- `server/src/graphql/*`, `server/src/contracts/*`, and
  `docs/api/contracts.md`: current generated contract flow and read-only
  GraphQL state. This prompt should not add GraphQL mutations.

Skills loaded while preparing this prompt:

- `architecture-patterns`: keep geography, ingestion, parsers, repositories,
  worker stages, and transports separated through module-owned services and
  ports.
- `nestjs-best-practices`: feature modules, DI tokens, controller guards,
  repository boundaries, validation, health, worker lifecycle, queues, and
  graceful shutdown.
- `postgres-best-practices` plus `references/schema-design.md`: use UUID
  public identifiers, `timestamptz`, meaningful constraints, and typed columns
  over JSONB except for variable metadata.
- `security-best-practices` plus
  `references/javascript-express-web-server-security.md`: validate all
  untrusted upload/parser/API input, preserve CSRF/authz, do not expose
  secrets, and avoid dangerous sinks.
- `security-threat-model`: ground new parser/PostGIS/trust-boundary claims in
  repository evidence and update the threat model for changed boundaries.
- `api-design-principles`: resource-oriented REST, idempotent commands,
  stable errors, versioning, pagination, and documented contract behavior.
- `openapi-spec-generation`: update generated OpenAPI and route matrix when
  REST routes are added.
- `error-handling-patterns`: classify retryable dependency failures,
  terminal validation/security errors, cancellation, dead-letter, and partial
  publication failures.
- `javascript-testing-patterns`: focused unit/integration tests for parsers,
  mapping, services, repositories, and state transitions.
- `e2e-testing-patterns`: critical cross-system tests against real API, real
  PostgreSQL, uploads, worker stages, cancellation, and two organizations.
- `sql-optimization-patterns`: design and inspect query paths for hierarchy,
  alias/code matching, issue lists, run status, and worker claims.
- `requesting-code-review`, `receiving-code-review`, and `caveman-commit`:
  mandatory review and final local commit workflow for execution.

## SKILLS USED

- `architecture-patterns` - design geography and ingestion as module-owned
  use cases behind ports/adapters rather than controller or Prisma sprawl.
- `nestjs-best-practices` - implement Nest modules, DI tokens, guards,
  validation, worker wiring, tests, and lifecycle behavior.
- `postgres-best-practices` - design schema, migrations, constraints, PostGIS
  tables, RLS, and indexes.
- `security-best-practices` - secure untrusted parser/API/file handling,
  logs, validation, authorization, and secrets.
- `security-threat-model` - update the repository-grounded threat model for
  parser, PostGIS, ingestion-run, and publication boundaries.
- `error-handling-patterns` - classify ingestion failures, retries,
  cancellation, dead-letter, and safe partial-failure behavior.
- `javascript-testing-patterns` - add unit and integration coverage for
  parsers, mapping, validation, and application services.
- `e2e-testing-patterns` - add cross-system API/worker/database tests for the
  critical ingestion journey.
- `sql-optimization-patterns` - verify hierarchy, alias/code lookup, issue
  listing, publication, and spatial query plans where raw SQL/indexes are
  introduced.
- `api-design-principles` - design the versioned REST resource model and
  stable error/idempotency behavior.
- `openapi-spec-generation` - regenerate and check OpenAPI/contracts for the
  new REST routes.
- `requesting-code-review` - dispatch the mandatory reviewer subagent after
  implementation self-verification.
- `receiving-code-review` - verify reviewer feedback before applying fixes.
- `caveman-commit` - write the final local Conventional Commit message.

Conditional skills deliberately not used unless implementation scope changes:

- `playwright`, `frontend-design`, `tailwind-design-system`, `tailwind-4-docs`,
  `shadcn`, `vercel-react-best-practices`, `web-design-guidelines`, and
  `accessibility-compliance` are not required because this prompt must not add
  a browser mapping UI.
- `kpi-dashboard-design` and `data-storytelling` are Phase 8-10 skills for
  metric semantics, dashboards, and reports; do not load them unless the
  implementation accidentally expands beyond this prompt and is stopped.
- `prometheus-configuration` is not required unless real metrics endpoints or
  Prometheus scrape config are added; logs/status rows are sufficient here.

## Required external/API verification before implementation

Before writing code, re-read `AGENTS.md`, this prompt, every owning doc named
above, and every skill named in `SKILLS USED`. Then verify current APIs from
primary/local sources:

- Prisma 7 schema/migration behavior, generated client behavior, and raw SQL
  rules from local `node_modules` before editing `schema.prisma`.
- PostgreSQL 18 and PostGIS geometry/geography functions, GiST/SP-GiST index
  choices, CRS/SRID validation, geometry validity functions, and hierarchy
  query strategies from PostgreSQL/PostGIS primary docs.
- NestJS 11 controller, SSE, lifecycle, queue/worker, validation, and OpenAPI
  decorator behavior from installed packages or official Nest docs.
- The current versions, maintenance state, licensing, ESM/CJS compatibility,
  memory/streaming behavior, and security advisories for any CSV, XLSX, and
  GeoJSON parser packages before installing them. Do not choose parser
  packages from memory.
- The current OpenAPI generation path in `server/src/contracts/*` and
  `@nestjs/swagger` behavior before changing route decorators.

If live primary docs or package metadata cannot be reached because network
access is blocked, use only already-installed local package docs and source. If
that is insufficient to verify a parser dependency, stop and report the gap
instead of guessing or hand-rolling a complex parser.

## Measurements and verification procedure

There are no visual comp measurements for this backend prompt. The measurable
targets are structural and behavioral:

- migrations apply from zero and preserve existing Phase 3-6 tests;
- every new tenant-owned table has `organizationId`, `ENABLE ROW LEVEL
  SECURITY`, `FORCE ROW LEVEL SECURITY`, default-deny without tenant context,
  and two-organization negative tests;
- every raw PostGIS SQL query is parameterized, reviewed in the migration or
  service test, and covered by representative `EXPLAIN` evidence where it is a
  principal query path;
- parser limits are explicit configuration values with temporary development
  defaults documented as safety limits, not customer product limits;
- CSV/XLSX/GeoJSON fixtures cover valid, malformed, oversized, and hostile
  examples without committing real customer data or invented market facts;
- successful ingestion publishes exactly one immutable dataset version for
  the same accepted upload/mapping/idempotency key and retrying the worker does
  not duplicate it;
- failed validation creates durable issues and no published version;
- cancellation before publication leaves no partially visible published
  version.

## Target data model and migration

Add a reviewed Prisma schema and SQL migration for the Phase 7A records. Use
names that match the product glossary unless the implementation finds an
existing better local convention.

Geography:

- extend `Region` or introduce related tables so regions support arbitrary
  depth: parent, level/type, retired/versioned state where needed, and stable
  display identity;
- add `RegionSource` for provider/source metadata, license/provenance URL,
  source version/date, and redistribution notes;
- add `RegionCode` scoped by source and code system, unique enough to resolve
  a code deterministically;
- add `RegionAlias` scoped by source/locale where appropriate with normalized
  text for matching;
- add `RegionGeometry` or equivalent with PostGIS geometry column added by
  reviewed SQL, SRID, geometry type, validity, simplification/source metadata,
  timestamps, and a GiST index;
- choose and document the hierarchy strategy: adjacency list plus recursive
  CTE is acceptable for Phase 7A unless real query plans require closure table
  or `ltree`. Do not add an extension that is not verified and documented.

Ingestion:

- `Dataset`: organization ID, name, description/source metadata, state, owner,
  created/updated timestamps, and indexes for organization lists;
- `DatasetVersion`: organization ID, dataset ID, monotonically increasing
  version number per dataset, source upload/object IDs, mapping version,
  publication status, checksum/source summary, immutable timestamps, and a
  uniqueness constraint preventing duplicate version numbers;
- `ColumnMapping`: organization ID, dataset ID, schema/mapping JSON for source
  columns to Acres concepts, version, created-by account, and validation status.
  Store variable mapping payload in JSONB only where the schema is deliberately
  flexible; keep ownership, state, and version typed;
- `IngestionRun`: organization ID, dataset ID, upload ID, mapping ID,
  optional dataset version ID, state, stage, progress, attempts, failure code,
  failure message, cancellation timestamp, started/finished timestamps, and
  deterministic key/idempotency identity;
- `ValidationIssue`: organization ID, ingestion run ID, severity, code, safe
  message, row number/range, column/key, region/mapping reference where known,
  bounded details JSON, and indexes for run issue lists;
- optional `StagedSourceRow`/`ParsedSourceSummary` only if needed to prove
  repeatable publication without Phase 8 observations. Bound size and avoid
  storing raw full uploaded data in PostgreSQL unless the design and limits are
  explicitly justified.

Migration rules:

- use UUIDv7 public IDs, `timestamptz`, typed lifecycle enums, meaningful
  `CHECK` constraints, and FK indexes;
- scope tenant uniqueness to `organization_id`; keep global region/source
  uniqueness explicitly global;
- author PostGIS columns, indexes, constraints, and RLS policies in reviewed
  SQL where Prisma cannot express them;
- grant runtime/test role privileges consistently with the existing migration
  hardening model;
- update `scripts/db/harden-runtime-privileges.sh` only if new migration
  behavior requires it.

## Application architecture

Add feature modules that follow the existing Nest style:

- `server/src/geography/`: geography repositories/services for hierarchy,
  source/code/alias lookup, geometry validation/import helpers, and spatial
  query helpers. Do not mix public marketing `regions` controller behavior with
  ingestion-only administration unless the boundary is explicit.
- `server/src/ingestion/`: dataset, mapping, ingestion run, validation issue,
  parser orchestration, publication, and controller services.
- `server/src/parsers/` or `server/src/ingestion/parsers/`: parser ports and
  adapters for CSV, XLSX, and GeoJSON. Parser code must return typed records,
  summaries, and issues; it must not write Prisma rows directly.
- Worker integration should extend `UploadWorkerService` or introduce a
  dedicated ingestion worker service behind the existing `WorkerModule`, with
  deterministic job IDs and PostgreSQL as the authoritative ledger.

Keep controllers thin. They should validate DTOs, require session and
organization permission, call application services, and return envelope-safe
DTOs. Repositories/services own Prisma access and transaction-local tenant or
worker context.

Add centralized permissions in `server/src/organizations/permissions.ts`, for
example:

- `datasets.read`
- `datasets.create`
- `datasets.update`
- `ingestion.read`
- `ingestion.run`
- `ingestion.cancel`

Owners and admins should have all of them. Analysts should be able to create
datasets, map, run, cancel their ingestion work, and read ingestion results.
Viewers should not create/run/cancel ingestion and should only read published
versions if this prompt exposes that read. Preserve the server as the
authority; UI hiding is irrelevant here.

## Parser and ingestion behavior

The ingestion pipeline starts from an accepted `Upload`. It must reject uploads
that are pending, scanning, rejected, cancelled, expired, foreign, or already
bound to a conflicting run.

CSV:

- support explicit UTF-8 by default; if encoding detection is added, document
  its limits and failure behavior;
- make delimiter, quote, header, empty row, null value, date/number/unit, and
  formula-as-data rules explicit;
- reject row/column/file sizes above configured safety limits;
- preserve row numbers for issue reporting.

XLSX:

- require explicit or deterministic sheet selection; ambiguity is an issue, not
  a guess;
- treat formulas as data for ingestion and never evaluate them;
- bound sheets, rows, columns, shared strings, cell text length, and workbook
  metadata;
- reject encrypted, macro-enabled, unsupported, or suspicious workbook features
  unless a verified parser reports them safely.

GeoJSON:

- validate `FeatureCollection`/`Feature` structure, properties, geometry type,
  coordinate nesting, ring closure, coordinate count, bbox/feature count, and
  CRS/SRID assumptions;
- default to WGS84/SRID 4326 only when the file has no contradictory CRS
  signal; unsupported CRS is a validation issue;
- run PostGIS validity checks before storing geometry and surface invalid
  geometries as issues;
- reject geometry bombs and excessive precision/size.

Mapping and validation:

- source columns can map to region identifiers, metric-like source fields, time
  period, unit, dimensions, and notes as future-compatible metadata;
- this prompt does not need to create Phase 8 `MetricDefinition` or
  `Observation` rows, but it must validate enough structure that Phase 8 can
  consume published dataset versions deterministically;
- region matching uses `RegionCode` and `RegionAlias` with deterministic
  precedence. Ambiguous and unmatched regions become validation issues;
- duplicate rows, missing required mapped columns, incompatible data types,
  malformed dates/numbers, invalid units, and invalid geometries become issues
  with bounded detail.

Publication:

- successful validation atomically creates or marks a `DatasetVersion`
  published and links it to the ingestion run;
- dataset versions are immutable after publication. Corrections create a later
  version or a new run, not mutation of a published version's source/mapping
  identity;
- failed or cancelled runs must not expose partially published state.

## REST API impact

Add versioned `/api/v1` routes only. Suggested resource shape, to adjust if the
implementation finds a cleaner local fit:

- `GET /api/v1/datasets` - list organization datasets and latest version
  summaries; session + `datasets.read`.
- `POST /api/v1/datasets` - create dataset metadata; session + CSRF +
  `datasets.create` + `Idempotency-Key`.
- `GET /api/v1/datasets/:datasetId` - read dataset metadata; session +
  `datasets.read`.
- `PATCH /api/v1/datasets/:datasetId` - update draft dataset metadata only;
  session + CSRF + `datasets.update`.
- `GET /api/v1/datasets/:datasetId/versions` - list immutable published
  versions; session + `datasets.read`.
- `POST /api/v1/datasets/:datasetId/mappings` - create mapping for an accepted
  upload/schema; session + CSRF + `ingestion.run` + `Idempotency-Key`.
- `POST /api/v1/datasets/:datasetId/ingestion-runs` - start ingestion from an
  accepted upload and mapping; session + CSRF + `ingestion.run` +
  `Idempotency-Key`.
- `GET /api/v1/ingestion-runs/:runId` - read durable run status; session +
  `ingestion.read`.
- `GET /api/v1/ingestion-runs/:runId/issues` - paginated/bounded issue list;
  session + `ingestion.read`.
- `DELETE /api/v1/ingestion-runs/:runId` - request cancellation before
  publication; session + CSRF + `ingestion.cancel`.

Routes must:

- use existing success/error envelopes;
- use the existing selected-organization context and permission guard;
- use stable error codes/messages without leaking foreign existence;
- use `Idempotency-Key` for duplicate-producing commands;
- paginate issue lists and dataset/version lists when unbounded;
- document all new DTOs with generated OpenAPI decorators;
- keep `/graphql` read-only unless the prompt is explicitly changed.

## Security and failure cases

Cover at least these cases in code and tests:

- foreign dataset, upload, mapping, run, issue, region alias/code reference, and
  dataset version IDs return not-found/forbidden consistently without leaking
  existence;
- missing selected organization, revoked membership, insufficient role, stale
  session, missing CSRF, missing/conflicting idempotency key, and duplicate
  submit;
- parser package throws, malformed CSV/XLSX/GeoJSON, unsupported XLSX feature,
  formula cell, row/column/feature/geometry limit exceeded, invalid CRS,
  invalid geometry, ambiguous region match, unmatched region, duplicate mapped
  row, and partial mapping;
- cancellation before parse, during validation, and after publication request;
- worker crash/retry after creating a run but before publication, after issues,
  and after publication attempt;
- object missing after upload accepted, object checksum mismatch if rechecked,
  scanner result absent, and stale upload state;
- raw SQL injection attempts through code/alias/search, GeoJSON properties,
  CRS, geometry, filters, cursors, and sort inputs;
- connection pool context leakage between organizations and worker access.

Do not log raw uploaded rows, full file contents, formulas, secrets, signed
URLs, cookies, CSRF tokens, storage credentials, or high-cardinality customer
values. Logs and errors may include opaque IDs, bounded issue counts, stage,
safe failure code, and request/job/run IDs.

## Tests and fixtures

Add fixtures under an explicit test fixture directory, for example
`server/test/fixtures/ingestion/`. They must be small, synthetic, and clearly
not real market data.

Required test layers:

- unit tests for parser adapters using valid and malformed CSV/XLSX/GeoJSON
  fixtures, limit enforcement, formula-as-data behavior, and issue creation;
- service tests for mapping validation, deterministic region code/alias
  matching, ambiguous/unmatched region issues, duplicate submit/idempotency,
  cancellation, and publication immutability;
- real PostgreSQL integration tests for migrations, RLS, two-organization
  negative access, hierarchy cycle rejection, geometry validity, region
  code/alias uniqueness, worker access context, and representative query plans;
- API e2e tests with authenticated org contexts for dataset create/list,
  mapping create, ingestion run start/status/issues/cancel, and cross-org
  negatives;
- worker tests for retry/idempotency and no duplicate dataset version on
  replay.

If Docker is still unavailable in this execution environment, keep using the
native PostgreSQL path already documented in `docs/backend.md` for database
proof. State any unrun Docker/Garage/Valkey/ClamAV checks honestly in the
verification record.

## Documentation updates

Create `docs/ingestion.md` as the implemented-state record for Phase 7A unless
implementation identifies an existing owner that clearly fits better. If this
new file is created, add one index row for it to `AGENTS.md` in the same
change.

Update:

- `docs/backend.md` for dependencies, scripts, env values, routes, schema,
  migrations, parser package choices, test state, and remaining gaps;
- `docs/system-architecture.md` current-state sections for geography,
  ingestion, worker, RLS, and data model changes;
- `docs/security.md` for parser/PostGIS/ingestion boundary changes and residual
  risks;
- `docs/product.md` only if implementation clarifies product semantics without
  inventing open launch decisions;
- `docs/api/contracts.md`, `docs/api/openapi.json`, and
  `docs/api/schema.graphql` only through `npm run contracts:generate`.

Record every temporary safety default as a development/test limit, not a
customer policy. Do not close open product decisions such as provider source,
  upload limits, retention, or SLOs without user input.

## Checks to run

Run the real checks and quote their relevant output in the final implementation
response:

```bash
npm run format --workspace=@acres/server
npm run lint
npm run typecheck
npm run contracts:generate
npm run contracts:check
npm run build
npm run test --workspace=@acres/server
npm run test:server
git diff --check
git status --short
```

Also run the database checks that are applicable in the environment:

```bash
npm run prisma:validate --workspace=@acres/server
npm run prisma:migrate:status --workspace=@acres/server
```

If a real migration apply/drift check can be run against a clean local or test
database, do it and record the command/output. If Docker or network-dependent
package verification is unavailable, say exactly which command could not run
and why.

Before finishing implementation:

1. inspect the final diff manually;
2. dispatch `requesting-code-review` with BASE_SHA/HEAD_SHA, this prompt, files
   changed, checks run, and known environment limitations;
3. evaluate feedback with `receiving-code-review`, fix valid issues, and
   re-run affected checks;
4. re-review if feedback causes architectural, public API, schema, RLS, or
   worker-flow changes;
5. stage only approved files, inspect the staged diff, and commit locally to
   `main` with `caveman-commit`.

## Non-goals

- No browser dataset upload or mapping UI.
- No dashboards, saved views, analytics observations, deterministic aggregates,
  reports, exports, or optional AI.
- No public data provider connector or bundled provider dataset without a named
  source, approved license, and user approval.
- No fuzzy auto-accept of ambiguous regions.
- No production Caddy, Prometheus, Grafana, SAST, backup, retention, SLO,
  RPO/RTO, or launch hardening work.
- No GraphQL mutations or subscriptions.
- No unsupported parser feature accepted silently.
