# 53 - Phase 8 Analytics Service and Deterministic Read Models Evidence

## Scope and why this is next

The committed `main` tip is `c1b6724` (`test(dashboards): add phase 9 service unit suite`).
Following the Phase 6 outbox/worker evidence (prompt 50), Phase 10 reports and governed exports evidence (prompt 51), and Phase 9 dashboard service evidence (prompt 52), the foundational domain service unit in the target architecture build plan requiring dedicated verification is Phase 8: Metrics and deterministic analytics (`docs/build-plan.md` §9).

As stated in `docs/build-plan.md` §9:
- "Phase 8 — metrics and deterministic analytics: Outcome/behavior: governed metric definitions, typed observations, quality flags, units/periods/dimensions, deterministic aggregations, evidence lineage, and decision-useful read models."
- "Tests: golden calculations, property/invariant tests, lineage from result to observation/version, compatible/incompatible units and dimensions, time-grain/time-zone/leap-boundary behavior, null versus zero, duplicates, precision and threshold edges, aggregate invalidation/rebuild, late data and version replacement, two-org queries, representative SQL plans and N+1/query-count limits."
- "Exit: every output has defined semantics and reproducible evidence, representative queries meet measured plans, and no-AI analytics are complete."

While `AnalyticsPublicationService` (`server/src/analytics/analytics-publication.service.spec.ts`), `mapping.ts` (`server/src/analytics/mapping.spec.ts`), and the synthetic scale plan evaluators (`server/src/analytics/seed/`) have test coverage, `AnalyticsService` (`server/src/analytics/analytics.service.ts`) — which powers REST reads, decimal value serialization, quality flag mapping, and aggregate lineage evidence resolution — currently lacks a dedicated, fail-closed unit test suite (`server/src/analytics/analytics.service.spec.ts`).

Dedicated unit and service-level test coverage is required to verify:

1. **Metric Definition Listing & Lookup**:
   - `listMetrics`: executes within the organization transaction boundary, maps metric definitions via `toMetric`, formats ISO timestamps (`createdAt`, `updatedAt`), and validates `canonicalUnit`, `allowedAggregation`, `calculationVersion`, and `status`.
   - `getMetric`: retrieves a metric definition by ID scoped to the calling organization; strictly throws `ApiException.notFound('Metric not found.')` (`404`) for non-existent, unowned, or foreign-tenant metric IDs.

2. **Observation Listing & Typed Value Normalization**:
   - `listObservations`: propagates query filters (`datasetVersionId`, `metricId`, `regionId`, `dimensionHash`, `periodStart`, `periodEnd`, `limit`), normalizes observation values into typed discriminators (`{ type: 'numeric', value: string }`, `{ type: 'text', value: string }`, `{ type: 'boolean', value: boolean }`), maps embedded quality arrays (`severity`, `state`, `code`, `message`), and formats ISO timestamps.

3. **Aggregate Listing & Typed Value Representation**:
   - `listAggregates`: propagates query parameters to `findAggregates`, maps rows via `toAggregate`, normalizes typed aggregate values (numeric decimals, text, boolean), includes `observationCount`, `qualitySummary`, `datasetVersionIds` array, and dimension hashes.

4. **Aggregate Evidence Lineage Traversal**:
   - `getAggregateEvidence`: retrieves the base aggregate (throwing `ApiException.notFound('Aggregate not found.')` if null), queries `findAggregateEvidence` lineage records joining observations and dataset versions, and maps full traceable provenance (`observationId`, `datasetVersionId`, `datasetVersion` metadata with `publishedAt`, and child `observation` payload).

5. **Decimal Normalization and Value Helper Edge Cases**:
   - Verifies `valueOf` and `decimalValueToString` behavior across string decimals, JavaScript numbers, Prisma `Decimal` instances, boolean flags, null/undefined fields, and throws for invalid numeric representations.

6. **Documentation and Evidence Reconciliation**:
   - Update `docs/analytics.md`, `docs/backend.md`, and `docs/build-plan.md` to record the completed Phase 8 service unit verification and evidence.

## Reference material read while preparing this prompt

- `AGENTS.md`, especially §§2, 2.1, 4–7, 8.2 Phase 8, 9, and 10.
- `docs/build-plan.md` §9 (Phase 8 outcome, test matrix, and exit gate).
- `docs/analytics.md` (Analytics architecture, metric definitions, observations, quality, lineage, REST routes, and residual gaps).
- `docs/backend.md` §3 (Analytics service implementation and transaction scoping).
- `docs/security.md` §11 (Analytics threat boundary, tenant isolation, and lineage traceability).
- `server/src/analytics/analytics.service.ts` and `analytics.repository.ts`.
- `server/src/analytics/analytics.controller.ts` and `analytics.module.ts`.
- `server/src/analytics/dto/analytics-aggregate-query.dto.ts` and `dto/analytics-observation-query.dto.ts`.

There is no visual surface, reference comp, breakpoint, browser, Next.js, React, Tailwind, shadcn, or motion work in scope. No design measurement applies.

## SKILLS USED

- `architecture-patterns` - maintain strict boundaries between domain services, repositories, and read models.
- `nestjs-best-practices` - construct robust test modules with proper dependency injection and mock boundaries for `AnalyticsRepository`.
- `postgres-best-practices` - verify transactional boundary execution, tenant RLS scoping, and deterministic query scoping.
- `security-best-practices` - verify fail-closed error handling, cross-tenant rejection, and parameter sanitization.
- `security-threat-model` - reconcile Phase 8 threat mitigation evidence against observation and aggregate read boundaries in `docs/security.md`.
- `error-handling-patterns` - verify consistent `ApiException.notFound` error behavior and status codes.
- `javascript-testing-patterns` - author comprehensive, maintainable unit tests with Jest.
- `kpi-dashboard-design` - verify metric definition, aggregate serialization, and filter propagation for analytical dashboards.
- `data-storytelling` - verify deterministic aggregate serialization and evidence lineage tracing without loss of fidelity.
- `requesting-code-review` - dispatch reviewer subagent with structured context and diff SHAs.
- `receiving-code-review` - evaluate review feedback with technical rigor.
- `caveman-commit` - format Conventional Commit message.

## Expected Impact

### Server Tests Added:
- `server/src/analytics/analytics.service.spec.ts` - comprehensive unit test suite covering `AnalyticsService` methods (`listMetrics`, `getMetric`, `listObservations`, `listAggregates`, and `getAggregateEvidence`), value normalization, and error handling.

### Documentation Updates:
- `docs/analytics.md` - record Phase 8 service unit verification and test suite status.
- `docs/backend.md` - update Analytics module test evidence.
- `docs/build-plan.md` - record Phase 8 service unit verification.

## Non-goals

- No database schema migrations or changes to `prisma/schema.prisma`.
- No modifications to REST controllers, GraphQL resolvers, or shared packages.
- No AI or forecasting logic.
- No UI components or client-side changes.

## Verification Plan and Documentation Update

1. Run server unit tests: `npm run test --workspace=@acres/server`.
2. Run full server test suite: `npm run test:server`.
3. Verify typecheck and lint across all workspaces: `npm run typecheck && npm run lint`.
4. Update `docs/analytics.md`, `docs/backend.md`, and `docs/build-plan.md`.
5. Execute reviewer and receiving review steps, stage approved files, and commit with `caveman-commit`.
