# 119 — narrow shared `DashboardMetric` / `DashboardAggregate` to the closed Prisma vocabularies

## Scope, and why it is next

The committed repository is on `main` at `8552b37`
(`refactor(analytics): annotate valueOf kind union`, the prompt 118
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 118 — which closed the last open carrier on the Phase 8/9 read path
(`valueOf()` kind annotation in prompt 118, following the read-mapper enum
narrowing in prompts 115–117).

There is no unbuilt ordered phase left. The next smallest unblocked residual is
the shared-contract decision prompts 117 and 118 both explicitly deferred:

- prompt 117 §Non-goals: "No narrowing of shared `DashboardMetric`
  (`valueType` / `allowedAggregation` / `status`, `dashboards.ts:13–17`) or
  `DashboardAggregate` (`aggregateType`, `:27`) … a separate shared-contract
  prompt owns any change there."
- prompt 118 §Non-goals: same four fields deferred again as "open
  shared-contract text with client/GraphQL consumers; the separate
  shared-contract decision prompt 117 deferred still owns any change there."

The gap, at `8552b37` (re-verify exact lines at execution):

```ts
// packages/shared/src/dashboards.ts:8–20
export type DashboardMetric = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  valueType: string;            // ← open
  canonicalUnit: string;        // stays open — see §Non-goals
  allowedAggregation: string;   // ← open
  calculationVersion: string;   // stays open — see §Non-goals
  status: string;               // ← open
  createdAt: string;
  updatedAt: string;
};

// packages/shared/src/dashboards.ts:22–36
export type DashboardAggregate = {
  // ...
  metric: DashboardMetric;
  aggregateType: string;        // ← open
  // ...
};
```

while every authority the codebase already states says the four fields are
closed:

- `MetricValueType` — `numeric | text | boolean`:
  `server/prisma/schema.prisma:1126–1130`,
  `server/src/generated/prisma/enums.ts:255–261`,
  `server/src/analytics/analytics.types.ts:6`,
  `server/src/analytics/analytics.service.ts:189` (prompt 116 narrowed
  `toMetric()` parameter, read-only witness);
- `MetricAggregationType` — `sum | avg | min | max | count | latest`:
  `server/prisma/schema.prisma:1132–1139`,
  `server/src/generated/prisma/enums.ts:264–273`,
  `server/src/analytics/analytics.types.ts:7–8`,
  `server/src/analytics/analytics.service.ts:151,191` (prompt 116 narrowed
  `toAggregate()` / `toMetric()` parameters, read-only witnesses);
- `MetricDefinitionStatus` — `active | archived`:
  `server/prisma/schema.prisma:1141–1144`,
  `server/src/generated/prisma/enums.ts:276–281`,
  `server/src/analytics/analytics.service.ts:193` (prompt 116, read-only
  witness);
- producer UI constrains to the same sets:
  `client/components/acres/app/dataset-actions.tsx:628–632`
  (`numeric | text | boolean` options),
  `:645–652` (`sum | avg | min | max | count | latest` options);
- server mapping validation enforces the same sets at runtime with issue
  diagnostics (`server/src/analytics/mapping.ts:98,107,160,163`, `Set.has`
  guards behind `as MetricValueType` / `as MetricAggregationType` casts —
  read-only witnesses, not revisited here);
- every committed server fixture uses only member literals
  (`dashboards.service.spec.ts:64,74,76,78,88,111,195,246,609`,
  `analytics.service.spec.ts` value-type/aggregation/status members,
  `analytics-publication.service.spec.ts` members, `mapping.spec.ts`
  members).

The only producers outside the closed vocabulary are two client test-mock
files, which the open `string` currently admits silently:

```ts
// client/e2e/helpers.ts:78–82 (createMockMetric)
valueType: "numeric",          // member — unchanged
allowedAggregation: "mean",    // ← non-member
status: "published",           // ← non-member (dashboard metric domain)

// client/e2e/helpers.ts:99 (createMockAggregate)
aggregateType: "mean",         // ← non-member

// client/lib/api/test-harness-store.ts:60–64,74–78 (metric1/metric2)
allowedAggregation: "mean",    // ← non-member ×2
status: "published",           // ← non-member ×2

// client/lib/api/test-harness-store.ts:88,104 (agg1/agg2)
aggregateType: "mean",         // ← non-member ×2
```

`"mean"` is statistically synonymous with `"avg"` but is not in the Prisma
`MetricAggregationType` enum, the mapping validator sets, or the dataset-action
select options. `"published"` is a `Report` / ingestion-run vocabulary word
(`report-actions.tsx`, `reports-workspace.tsx`, ingestion SSE `published`
state) — it is not a `MetricDefinitionStatus` member. The dashboard client
never branches on these values: the only render is
`dashboard-workspace.tsx:159` (`<Badge>{aggregate.aggregateType}</Badge>`,
display text only), and no E2E or unit spec asserts on the `"mean"` /
`"published"` strings (verified this session: zero hits for `aggregateType` /
`allowedAggregation` / `valueType` in `client/e2e/*.spec.ts` and
`client/tests/*.spec.ts`; the `published` hits there are report/ingestion
vocabulary). Fixing the nine mock sites to `"avg"` / `"active"` is therefore
behavior-preserving for tests and is the fail-closed proof the narrowing
exists to provide: after this prompt, a mock inventing a tenth non-member
fails `npm run typecheck` instead of compiling.

Inline unions over imported Prisma enums or a shared alias is a judgement,
stated as one: prompts 115–116 mirrored the sibling carriers inline in
`analytics.service.ts` rather than importing the generated client, and the
shared DTO file imports nothing today. Mirroring the identical inline shapes
is the smaller delta, matches the prompts 86–118 minimal-diff precedent,
avoids coupling the shared contract to the generated-client import graph, and
keeps the shared file dependency-free. A generated-enum import or a shared
alias touching `analytics.types.ts`, seed types, and both mappers is deferred
as wider than the gap.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 8 governed metric semantics and exact phase
  skill manifest (§9); Phase 9 saved-view/dashboard outcome (§10); §§16–22
  confirming no unbuilt ordered phase.
- `docs/dashboards.md` — saved-view schema/permissions, the prompt 68
  `schemaVersion` paragraph, the prompt 117 `toView()` status paragraph, the
  `dashboards.service.spec.ts` unit evidence; the owning implementation
  record for this shared-contract narrowing.
- `docs/analytics.md` — the prompt 115/116/118 read-side narrowing paragraphs
  this prompt mirrors for the shared DTO; `toMetric()` / `toAggregate()` /
  `valueOf()` closed-union evidence; read-only context.
- `docs/backend.md` — current Nest modular-monolith/server conventions and
  root build/test command ownership; no module, provider, route, or database
  surface changes in this prompt.
- `docs/security.md` — TM boundaries. This work tightens a shared response
  DTO contract and stale test mocks; it does not add or move a trust
  boundary, persist new data, or change an envelope.
- `packages/shared/src/dashboards.ts` — `DashboardMetric` (`:8–20`, four open
  fields), `DashboardAggregate` (`:22–36`, one open field), already-closed
  `MetricValueKind` (`:1`), `MetricValue` (`:3–6`), `DashboardView.status`
  (`:64`, already `'active' | 'archived'`). Re-read at execution and resolve
  current line numbers rather than editing from this snapshot.
- `server/src/analytics/analytics.service.ts` — `toMetric()` (`:184–210`,
  prompt 116 closed), `toAggregate()` (`:146–182`, prompt 116 closed),
  `valueOf()` (`:212–225`, prompt 118 closed). Read-only witnesses that the
  server producer already emits members; unchanged.
- `server/src/analytics/analytics.types.ts` — `MetricValueType` (`:6`),
  `MetricAggregationType` (`:7–8`). Read-only; unchanged.
- `server/src/generated/prisma/enums.ts` — `MetricValueType` (`:255–261`),
  `MetricAggregationType` (`:264–273`), `MetricDefinitionStatus`
  (`:276–281`). Read-only; regenerated, never hand-edited.
- `server/prisma/schema.prisma` — `enum MetricValueType` (`:1126–1130`),
  `enum MetricAggregationType` (`:1132–1139`), `enum MetricDefinitionStatus`
  (`:1141–1144`), `enum DashboardViewStatus` (`:900–903`). Read-only; no
  migration.
- `server/src/dashboards/dashboards.service.ts` — `summary()` (`:147–176`,
  returns `Promise<DashboardSummary>`, already emits narrowed server unions
  into the shared DTO), `toView()` (`:193–217`, prompt 117 closed, read-only
  context). Read-only; unchanged — assignability of the narrowed server
  returns into the narrowed shared DTO is proven by `npm run typecheck`.
- `server/src/dashboards/dashboards.service.spec.ts` — metric/aggregate
  fixtures (`:64,74,76,78,88,111,195,246`, all members) and the archival
  `'archived'` witness (`:607–610`). Re-read at execution; if any fixture
  uses a value outside the eleven literals (3 + 6 + 2), stop per §Rollback.
- `server/src/graphql/graphql.types.ts` — `DashboardMetricGql` (`:300–333`,
  `valueType` `:314`, `allowedAggregation` `:320`, `status` `:326`, all
  `string`) and `DashboardAggregateGql.aggregateType` (`:362`, `string`).
  Read-only witnesses that GraphQL accepts the narrowed output structurally;
  unchanged (see §Non-goals).
- `client/components/acres/app/dataset-actions.tsx` — value-type select
  (`:628–632`), aggregation select (`:645–652`), unvalidated
  `String(form.get(...))` reads (`:340,342`). Read-only vocabulary
  witnesses; unchanged.
- `client/components/acres/app/dashboard-workspace.tsx:159` — the sole
  `aggregateType` render (`<Badge>`, display only). Read-only; unchanged.
- `client/lib/api/server.ts:180–240` — `dashboardSummary` GraphQL selection
  set (passthrough, no construction or validation). Read-only; unchanged.
- `client/e2e/helpers.ts` — `createMockMetric` (`:69–87`, one
  `allowedAggregation` + one `status` fix), `createMockAggregate` (`:89–110`,
  one `aggregateType` fix), `createMockReport` (`:161–217`, `status:
  "published"` is report vocabulary — read-only, must not be touched),
  `createMockDatasetVersion` / `createMockDataset` (unrelated). Re-read at
  execution.
- `client/lib/api/test-harness-store.ts` — `metric1` (`:55–67`), `metric2`
  (`:69–81`), `agg1` (`:83–97`), `agg2` (`:99–113`): six fix sites total.
  Re-read at execution.
- `packages/shared/src/ingestion.ts:83` (`valueType?: string` mapping-input
  DTO), `server/src/analytics/analytics.controller.ts:32,34,70`
  (`stringSchema()` query-input validators), `server/src/outbox/outbox.service.ts:42,59`
  (`aggregateType: 'Upload' | 'ExportRequest'`, different domain),
  `server/src/analytics/seed/analytics-scale-seed.types.ts:117,119,167`
  (narrow seed subsets). Read-only; unchanged (see §Non-goals).
- `prompts/117-dashboard-view-status-narrowing.md` — the deferred
  shared-contract non-goals scoping this prompt closes, plus checks shape.
- `prompts/118-valueof-value-kind-narrowing.md` — the closing lineage prompt
  (inline-union precedent, "no negative-type-test pattern" gate, contracts
  guard) this prompt mirrors for the shared DTO.

No visual reference is applicable. This is an internal shared-type plus
test-mock literal change, so the design-system PDF, landing-page PNGs, and
recorded chrome flows provide no evidence and must not be opened or cited as
if they did.

## Measurements and verified invariants

These are code-derived constraints at `8552b37`; re-verify them before editing:

1. Exactly four open shared fields plus one open aggregate field:
   `valueType: string` (`dashboards.ts:13`),
   `allowedAggregation: string` (`:15`), `status: string` (`:17`),
   `aggregateType: string` (`:27`). Re-run the grep
   (`valueType: string|allowedAggregation: string|status: string|aggregateType: string`)
   over `packages/shared/src/dashboards.ts` at execution and confirm no
   fifth site appeared. `canonicalUnit`, `calculationVersion`, `key`,
   `label`, `unit`, `dimensionHash`, every `id`, and every timestamp are
   different carriers, explicitly out of scope.
2. The closed vocabulary is exactly three value types, six aggregation
   types, and two statuses, byte-for-byte identical across
   `schema.prisma:1126–1144`, `enums.ts:255–281`, `analytics.types.ts:6–8`,
   `analytics.service.ts:151,189,191,193`, and the dataset-action select
   options. If the authorities disagree at execution, stop and report it
   rather than picking a winner silently.
3. The only non-member producers are the nine mock sites: `helpers.ts`
   (`allowedAggregation: "mean"`, `aggregateType: "mean"`,
   metric `status: "published"`) and `test-harness-store.ts`
   (2× `allowedAggregation: "mean"`, 2× `aggregateType: "mean"`, 2× metric
   `status: "published"`). Re-grep `"mean"` / `status: "published"` over
   both files at execution plus a repo-wide
   `allowedAggregation:|aggregateType:` grep excluding outbox/spec domains;
   if a tenth non-member producer appears, record it — the fix list below
   must be extended by separate decision, not silently.
4. The `"published"` strings at `helpers.ts:169,179` (`createMockReport`,
   `latestRevision.status`) and every `report-actions.tsx` /
   `reports-workspace.tsx` / ingestion-SSE `published` are report/ingestion
   vocabularies, not `DashboardMetric.status`. Re-verify at execution that
   the only `status: "published"` sites being edited are the metric mocks
   (`helpers.ts:82`, `test-harness-store.ts:64,78`); touching a report or
   ingestion status is a scope violation.
5. All committed server fixtures use enum members. Re-grep `valueType:` /
   `allowedAggregation:` / `status:` / `aggregateType:` literals in
   `dashboards.service.spec.ts`, `analytics.service.spec.ts`,
   `analytics-publication.service.spec.ts`, and `mapping.spec.ts` at
   execution; if any value falls outside the eleven literals (3 + 6 + 2),
   stop and report it rather than widening scope or rewriting test
   semantics. The `'archived'` witness (`dashboards.service.spec.ts:609`)
   is a member and must keep compiling.
6. GraphQL accepts the narrowed output structurally:
   `DashboardMetricGql.valueType / allowedAggregation / status` and
   `DashboardAggregateGql.aggregateType` are `string` and the resolvers
   return the summary object without a Gql-annotated coupling.
   `contracts:check` must still report no artifact change; if a snapshot
   moves, stop — a shared-type narrowing plus mock-literal fix must not
   alter a public contract snapshot (GraphQL stays `string` by design).
7. No runtime value moves except the nine mock literals: every server
   branch returns the identical object it returns today, and the client
   mock factories return identical shapes with `"mean"` → `"avg"` and
   metric `"published"` → `"active"` as the only value changes. A server
   test that changes outcome (not just compilation) after this edit
   disproves the premise — stop and report it.
8. There is no established negative-type-test pattern in this repository
   (verified through prompt 118: zero `ts-expect-error` / `expectTypeOf`
   uses in `server/src`, `client/`, `packages/shared/src`). Do not invent
   one; the gates are `npm run typecheck` (which must reject a future
   non-member mock) plus unchanged runtime suites.

The required shapes mirror the sibling carriers exactly:

```ts
// packages/shared/src/dashboards.ts
export type DashboardMetric = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  valueType: 'numeric' | 'text' | 'boolean';
  canonicalUnit: string;
  allowedAggregation: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'latest';
  calculationVersion: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
};

export type DashboardAggregate = {
  // ... unchanged fields
  aggregateType: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'latest';
  // ... unchanged fields
};
```

Mock fixes (only values, no shape changes):

```ts
// client/e2e/helpers.ts — createMockMetric
allowedAggregation: "avg",   // was "mean"
status: "active",            // was "published" (metric domain only)
// client/e2e/helpers.ts — createMockAggregate
aggregateType: "avg",        // was "mean"

// client/lib/api/test-harness-store.ts — metric1/metric2
allowedAggregation: "mean" → "avg"   (×2)
status: "published" → "active"       (×2, metric domain only)
// client/lib/api/test-harness-store.ts — agg1/agg2
aggregateType: "mean" → "avg"        (×2)
```

Do not introduce a shared alias, a Prisma-enum import, a validator, a
per-value branch, a coercion change, or a new literal.

## Expected impact

- Routes changed: none.
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none (GraphQL
  `type`/`valueType`/`allowedAggregation`/`status`/`aggregateType` fields
  stay `string` and already accept the eleven literals; runtime server
  values are already members; mock literals move from non-members to
  members, which no snapshot records).
- Database schema, Prisma models, migrations, RLS, queries, indexes,
  queues, and persisted-data formats changed: none.
- Runtime server behavior: unchanged — every metric/aggregate accepted
  today maps to the identical response object.
- Runtime mock behavior: display-identical except Badge/text literals
  `"mean"` → `"avg"` and metric `"published"` → `"active"` in test-only
  factories; no spec asserts on the old strings, and the dashboard Badge
  renders whatever string it receives.
- Compile-time contract: `DashboardMetric` / `DashboardAggregate` no longer
  admit an invented value-type, aggregation, or metric-status string at any
  construction site (server mappers, seeds, specs, client mocks). Any future
  mock or producer inventing `"mean"` / `"published"` (or a fourth value
  type) fails typecheck at construction instead of compiling through the
  shared DTO.
- Logging/observability: unchanged; no metric metadata is logged.
- Threat model: no new boundary and no risk reclassification. The change
  adds a concrete shared-DTO type-contract detail under the existing Phase
  8/9 deterministic-analytics behavior.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and
   every skill named in `## SKILLS USED`. Confirm `git status --short`
   before editing; preserve any unrelated user changes and stop if they
   overlap an approved path. Confirm `HEAD` is `8552b37` (or record the
   actual SHA and adjust `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–5 at execution: re-run the shared-open
   grep over `packages/shared/src/dashboards.ts`, diff the vocabulary
   authorities (schema enums, generated enums, domain types, narrowed
   server mappers, dataset-action selects), re-grep `"mean"` /
   metric-domain `"published"` across both mock files plus the repo-wide
   `allowedAggregation:|aggregateType:` construction grep, confirm the
   report/ingestion `"published"` sites are excluded, and re-grep server
   fixture literals. If a vocabulary disagreement, a tenth non-member
   producer, or a non-member server fixture appears, stop and report it
   rather than silently widening scope.
3. In `packages/shared/src/dashboards.ts`, change only the four field
   types to the inline unions in §Measurements. Leave `canonicalUnit`,
   `calculationVersion`, `key`, `label`, `description`, `unit`,
   `dimensionHash`, every `id`, every timestamp, `MetricValue`,
   `MetricValueKind`, `DashboardFilters`, `DashboardPresentation`,
   `DashboardView`, inputs, and `DashboardSummary` byte-for-byte unchanged.
   Do not add an import, alias, cast, or validator.
4. In `client/e2e/helpers.ts`, change only the three dashboard-mock
   literals: `createMockMetric.allowedAggregation` `"mean"` → `"avg"`,
   `createMockMetric.status` `"published"` → `"active"`,
   `createMockAggregate.aggregateType` `"mean"` → `"avg"`. Leave
   `createMockReport` / `latestRevision.status: "published"`, dataset
   mocks, and every factory shape byte-for-byte unchanged.
5. In `client/lib/api/test-harness-store.ts`, change only the six
   dashboard-mock literals: `metric1`/`metric2.allowedAggregation`
   `"mean"` → `"avg"` (×2), `metric1`/`metric2.status` `"published"` →
   `"active"` (×2), `agg1`/`agg2.aggregateType` `"mean"` → `"avg"` (×2).
   Leave every factory shape and every other mock byte-for-byte unchanged.
6. Make no other production edit: no server service, repository, DTO,
   controller, resolver, GraphQL type, Prisma schema, migration, seed,
   spec, mapping validator, analytics controller input schema, or client
   component change. If typecheck demands more than the shared annotation
   plus the nine mock literals, restore and report rather than expanding
   scope.
7. Run the focused read-mapper and summary regression suites. If any valid
   server metric/aggregate maps to a different response shape, value, or
   key order, stop and report the exact fixture: a type-only server change
   must not alter runtime output (mock-literal moves are the only intended
   value changes, confined to test factories).
8. Run `npm run contracts:check` and verify no generated REST/OpenAPI/
   GraphQL artifact changes. This shared-DTO narrowing plus mock-literal
   fix must not alter a public contract snapshot (GraphQL stays `string`
   by design).
9. Update `docs/dashboards.md` in the paragraph that prompts 68 and 117
   extended. Record that shared `DashboardMetric.valueType` /
   `allowedAggregation` / `status` and `DashboardAggregate.aggregateType`
   are typed as the closed Prisma-enum unions, matching schema enums,
   generated enums, narrowed server mappers, mapping-validator sets, and
   dataset-action selects; that `canonicalUnit` / `calculationVersion`
   deliberately stay `string`; that the nine stale `"mean"` /
   metric-`"published"` mock literals were corrected to `"avg"` /
   `"active"` (report/ingestion `"published"` untouched as a different
   domain); that GraphQL stays `string` structurally; and that no runtime
   server mapping, rejection, or response shape changed.
10. Inspect the complete diff, run every check below, and quote real exit
    status plus meaningful test/build totals. Fix issues before review.
11. Run the mandatory two-stage review loop:
    - dispatch a read-only reviewer subagent with `requesting-code-review`,
      this prompt path, `BASE_SHA=8552b37` (or the recorded actual HEAD),
      the working-tree diff (or implementation `HEAD_SHA` if an
      intermediate commit is explicitly required), changed paths,
      constraints, and real check outputs;
    - process every finding with `receiving-code-review`: understand and
      verify it against source and requirements before changing code; fix
      blocking and important valid findings in order, test each fix, and
      give technical pushback where evidence disproves a suggestion;
    - request follow-up review if a valid fix materially changes
      architecture, a public contract, data flow, or the trust boundary.
12. Commit locally on `main` using `caveman-commit`. Stage:
    - `prompts/119-shared-dashboard-metric-aggregate-narrowing.md`;
    - `docs/dashboards.md`;
    - `packages/shared/src/dashboards.ts`;
    - `client/e2e/helpers.ts`;
    - `client/lib/api/test-harness-store.ts`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend,
      or push. Use a terse Conventional Commit subject and include a short
      body explaining the shared-contract reason, because it is not obvious
      from the subject alone.

## Non-goals

- No change to `canonicalUnit`, `calculationVersion`, `key`, `label`,
  `unit`, `dimensionHash`, or any `id`: free-form text with no closed
  authority; a separate taxonomy prompt owns any unit/version-key policy
  change.
- No change to `MetricValue` (`value: string | null`): the summary
  coercion contract owned by prompt 118; not revisited here.
- No change to `DashboardView.status`, `DashboardFilters`,
  `DashboardPresentation`, `schemaVersion`, inputs, or `DashboardSummary`
  shape: prompt 68/117 versioning policy; not revisited here.
- No change to `packages/shared/src/ingestion.ts:83` (`valueType?: string`
  mapping-input DTO): runtime-validated input with issue diagnostics, not
  a response vocabulary; narrowing it would move rejection from issues to
  typecheck and is a separate input-policy decision.
- No change to `server/src/analytics/analytics.controller.ts`
  `stringSchema()` query-input validators, `server/src/analytics/mapping.ts`
  `as MetricValueType` / `as MetricAggregationType` `Set.has` guards,
  `server/src/dashboards/dashboards.service.ts` `datasetVersionIds` /
  `filters` / `presentation` casts, seeds, specs, repositories, or Prisma
  schema: separate validation decisions owned elsewhere.
- No change to `server/src/graphql/graphql.types.ts` string fields or any
  SDL/OpenAPI snapshot: GraphQL stays structurally `string` by design;
  a GraphQL-enum migration is a separate public-contract decision with
  snapshot consequences.
- No change to `server/src/outbox/*` `aggregateType: 'Upload' |
  'ExportRequest'`: a different (outbox) domain, not the dashboard
  aggregate vocabulary.
- No change to any `Report` / `latestRevision` / ingestion-run
  `"published"` literal: report/ingestion vocabularies, not
  `DashboardMetric.status`.
- No new import (including Prisma-enum imports), shared alias, validator,
  cast helper, per-value branch, coercion change, or literal addition.
- No schema migration, SQL, Prisma repository, RLS, index, tenant, worker
  queue, storage, upload, route, API contract, client component, design,
  accessibility, motion, or browser work beyond the nine mock literals.
- No new test cases and no invented negative-type-test pattern
  (`ts-expect-error` / `expectTypeOf` have zero uses in this repository);
  no general mapper refactor or unrelated cleanup.

## Reference deltas

No visual delta. The deliberate static delta is limited to the shared
TypeScript contract plus test-only mock literals: invented `valueType` /
`allowedAggregation` / `aggregateType` / metric-`status` strings no longer
construct `DashboardMetric` / `DashboardAggregate` at compile time, and the
nine stale `"mean"` / metric-`"published"` mock literals become `"avg"` /
`"active"`. Runtime server acceptance, mapped output, key order,
enum-column contents, GraphQL SDL, and every error path are observably
identical before and after; the dashboard Badge renders the corrected mock
strings in test harnesses only.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this shared type-contract plus test-mock
literal change. The dashboard Badge text in mocked harnesses changes from
`"mean"` to `"avg"`, which no spec asserts on and which matches the
production vocabulary the Badge already renders.

## Checks to run, and the owning doc

```bash
# Focused read-mapper + summary regression (must pass; server runtime unchanged)
npm --workspace=@acres/server test -- analytics.service.spec.ts
npm --workspace=@acres/server test -- dashboards.service.spec.ts

# Public contracts must remain unchanged (GraphQL stays string by design)
npm run contracts:check

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/119-shared-dashboard-metric-aggregate-narrowing.md \
  docs/dashboards.md \
  packages/shared/src/dashboards.ts \
  client/e2e/helpers.ts \
  client/lib/api/test-harness-store.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/119-shared-dashboard-metric-aggregate-narrowing.md \
  docs/dashboards.md \
  packages/shared/src/dashboards.ts \
  client/e2e/helpers.ts \
  client/lib/api/test-harness-store.ts
```

Quote the actual exit status and meaningful Jest/build totals. If a named
spec does not exist at execution time, locate the closest current
equivalent with `rg --files server/src/analytics server/src/dashboards`,
run it, and record that evidence instead of claiming a nonexistent check.
Browser E2E, real PostgreSQL, spatial plan, and operations-drill suites
are intentionally omitted because this scope adds no rejection path,
changes no schema/query behavior, and touches no browser journey or
deployment surface beyond test-mock literals.

`docs/dashboards.md` owns the implementation record. `docs/security.md`
and `docs/backend.md` are read-only verification for this task; update
either only if execution proves a statement materially stale, and stop
before broadening scope.

## Rollback and stop conditions

Rollback is a source/test/doc revert; there is no migration or
persisted-data rollback. Stop before expanding scope if any of these occur:

- the shared-open grep shows other than the four `DashboardMetric` /
  `DashboardAggregate` sites at execution time;
- the vocabulary authorities disagree on the eleven literals (3 + 6 + 2),
  or a server fixture contains a value outside them;
- a tenth non-member mock producer appears beyond the nine listed sites;
- the `status: "published"` sites to edit are not exactly the metric mocks
  (report/ingestion `"published"` must stay);
- an existing server test changes outcome (not just compilation) after
  the edit;
- a public contract snapshot changes;
- the fix requires a new literal, validator, cast, alias, import (any),
  error code/message, schema change, repository rewrite, GraphQL-enum
  migration, seed rewrite, or client-component change.

Report the contradictory evidence and prepare a separate prompt rather
than silently changing the premise.

## Completion criteria

- Shared `DashboardMetric.valueType` accepts only the three
  `MetricValueType` literals at compile time.
- Shared `DashboardMetric.allowedAggregation` and
  `DashboardAggregate.aggregateType` accept only the six
  `MetricAggregationType` literals at compile time.
- Shared `DashboardMetric.status` accepts only the two
  `MetricDefinitionStatus` literals at compile time.
- The nine stale mock literals are corrected (`"mean"` → `"avg"` ×5
  counting both files' aggregation sites as 1+1+2+... precisely: 1 in
  helpers metric + 1 in helpers aggregate + 2 in harness metrics + 2 in
  harness aggregates; `"published"` → `"active"` ×3: 1 in helpers metric
  + 2 in harness metrics) with no factory shape change and no
  report/ingestion `"published"` touched.
- Every other shared field, server mapper, repository, schema, seed, spec,
  GraphQL type, mapping validator, controller input, and client component
  is byte-for-byte equivalent in behavior.
- Current analytics read-mapper and dashboard summary tests pass with
  identical server outcomes.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all
  verified blocking/important findings are fixed and re-tested.
- `docs/dashboards.md` records the shared narrowing invariant, the mock
  correction, and the deliberate GraphQL-`string` / input-`string`
  openness.
- Only the approved paths are committed locally to `main`; nothing is
  pushed.

## SKILLS USED

- `architecture-patterns` — preserve the existing shared-DTO /
  service / repository boundaries and avoid introducing shared aliases
  or cross-module coupling.
- `nestjs-best-practices` — keep the change outside Nest provider/module
  wiring; server producers already emit members and are read-only here.
- `postgres-best-practices` — verify against the `MetricDefinition` /
  `MetricAggregate` enum-versus-`String` column contract; no schema,
  migration, transaction, RLS, or persistence change.
- `sql-optimization-patterns` — verify no query, index, or query-plan work
  is introduced by this in-memory type change.
- `javascript-testing-patterns` — rely on the existing read-mapper and
  summary Jest suites as unchanged-outcome regression proof; mock-literal
  moves confined to test factories, no test semantics changed.
- `error-handling-patterns` — keep the deterministic mappers and existing
  not-found error paths; no new failure literal is introduced.
- `kpi-dashboard-design` — guard duty only: metric/aggregation/status
  semantics and display vocabulary unchanged (mock literals aligned to
  the governed vocabulary), so no dashboard-semantics change ships here.
- `data-storytelling` — guard duty only: evidence/lineage presentation
  unchanged, so no report-narrative change ships here.
- `requesting-code-review` — dispatch the mandatory structured read-only
  review with precise scope, SHAs, changed paths, and check evidence.
- `receiving-code-review` — verify reviewer claims against repository
  reality before fixes or technical pushback.
- `caveman-commit` — produce the required terse Conventional Commit
  message with a short shared-contract rationale body.

Not loaded, with reason: `security-best-practices` / `security-threat-model`
(no trust-boundary or persistence change — read-only verification against
`docs/security.md` suffices); `api-design-principles` /
`openapi-spec-generation` (contracts:check guard duty only, no public
contract change); `e2e-testing-patterns` / `playwright` (mock literals
correctly covered below the browser layer); frontend/Tailwind/shadcn/GSAP
skills (no UI or motion).
