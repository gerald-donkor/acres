# 116 — narrow `toMetric()` / `toAggregate()` read enums to the closed Prisma unions

## Scope, and why it is next

The committed repository is on `main` at `c608496`
(`refactor(analytics): narrow read severity/state`, the prompt 115
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 115 — which closed the last open severity/state carriers in
`toObservation()` and left `code` / `message` open by explicit policy.

There is no unbuilt ordered phase left. The next smallest unblocked residual is
inside Phase 8's existing deterministic-analytics requirements, on the same read
file prompt 115 just touched and explicitly deferred: `toMetric()` and
`toAggregate()` in `server/src/analytics/analytics.service.ts` still type four
enum-backed fields as open `string`, while every authority the codebase already
states says they are closed:

- `MetricValueType` — `numeric | text | boolean`:
  `server/src/analytics/analytics.types.ts:6`,
  `server/src/generated/prisma/enums.ts:255–261`,
  `server/prisma/schema.prisma:1126–1130`
  (`MetricDefinition.valueType MetricValueType :759`, DB-enforced);
- `MetricAggregationType` — `sum | avg | min | max | count | latest`:
  `server/src/analytics/analytics.types.ts:7–8`,
  `server/src/generated/prisma/enums.ts:264–273`,
  `server/prisma/schema.prisma:1132–1139`
  (`MetricDefinition.allowedAggregation MetricAggregationType :761`,
  `MetricAggregate.aggregateType MetricAggregationType :836`, DB-enforced);
- `MetricDefinitionStatus` — `active | archived`:
  `server/src/generated/prisma/enums.ts:276–281`,
  `server/prisma/schema.prisma:1141–1144`
  (`MetricDefinition.status MetricDefinitionStatus :763`, DB-enforced).

The gap, at `c608496` (re-verify exact lines at execution):

```ts
function toAggregate(aggregate: {
  // ...
  aggregateType: string; // analytics.service.ts:151
  // ...
});

function toMetric(metric: {
  // ...
  valueType: string; // analytics.service.ts:189
  canonicalUnit: string; // stays open — unit vocabulary, see §Non-goals
  allowedAggregation: string; // analytics.service.ts:191
  calculationVersion: string; // stays open — see §Non-goals
  status: string; // analytics.service.ts:193
  // ...
});
```

against the sibling carriers that already state the precise unions. The
repository layer (`AnalyticsRepository.findMetrics` / `findMetric` /
`findObservations` / `findAggregates` / `findAggregate` /
`findAggregateEvidence`, `analytics.repository.ts:25–86`) returns Prisma rows
whose `valueType`, `allowedAggregation`/`aggregateType`, and `status` already
carry the generated enum types, so the open `string` parameters discard
precision the database guarantees and let any future read-path construction
with an invented value-type, aggregation, or status string compile.

`calculationVersion` is explicitly out of scope and stays `string`. The schema
leaves it open (`MetricDefinition.calculationVersion String :762`,
`MetricAggregate.calculationVersion String :841`), there is no enum for it, and
the only committed literal is the `ANALYTICS_CALCULATION_VERSION =
'analytics-v1'` constant (`analytics.types.ts:4`) plus spec fixtures reusing
that literal — narrowing it would invent a taxonomy, not mirror one. Likewise
`canonicalUnit`, `key`, `label`, `unit`, `dimensionHash`, and every `id` stay
`string`: free-form product text with no closed authority. `toObservation()`
quality `code` / `message` stay open per prompt 115 (schema `String`, synthetic
fixtures outside the production unions).

Inline unions over an imported Prisma type or a shared alias is a judgement,
stated as one: prompt 115 mirrored the sibling carriers inline in
`toObservation()` (`severity: 'info' | 'warning' | 'error'`, six-state union)
rather than importing the generated client, and the seed types repeat the same
literals inline (`analytics-scale-seed.types.ts:117,119,167`). The file under
edit imports only `Prisma` as a type plus `ApiException`, the repository, and
DTO types. Mirroring the inline shape is the smaller delta, matches the prompts
86–115 minimal-diff precedent, and avoids coupling the read DTO mapper to the
generated client import graph. A shared value-type/aggregation/status alias
touching `analytics.types.ts`, the seed types, and both mappers is deferred as
wider than the gap.

Seed narrowness is a subset, not a disagreement (judgement, stated as one):
`SeedMetricDefinition.allowedAggregation` (`:119`) and
`SeedMetricAggregate.aggregateType` (`:167`) list five members (missing
`latest`), and `SeedMetricDefinition.status` (`:121`) lists only `'active'`.
Every seed literal is a member of the six-/two-member Prisma unions, so the
seed compiles unchanged under the Prisma-wide parameter. Do not "fix" the seed
to add `latest` / `archived`; the seed's restricted range is committed fixture
policy, not a vocabulary authority.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 8's governed metric/observation/quality outcome,
  deterministic-aggregation behavior, documentation owner, and exact phase skill
  manifest (§9); §§16–22 confirming no unbuilt ordered phase.
- `docs/analytics.md` — governed metric/observation/aggregate semantics,
  `MetricDefinition` / `MetricAggregate` persistence, the quality-carrier
  paragraph prompts 86–100 extended, the prompt 115 read-side severity/state
  paragraph (this prompt extends the same section for the metric/aggregate
  mappers), the `analytics.service.spec.ts` (19 tests) unit evidence, and the
  owning implementation record.
- `docs/backend.md` — current Nest modular-monolith/server conventions and root
  build/test command ownership; no module, provider, route, or database surface
  changes in this prompt.
- `docs/security.md` — TM boundaries. This work tightens a read-mapper
  TypeScript contract; it does not add or move a trust boundary, persist new
  data, or change an envelope.
- `server/src/analytics/analytics.service.ts` — `toAggregate()` aggregate
  parameter (`:146–164`, open `aggregateType :151`), `toMetric()` metric
  parameter (`:184–196`, open `valueType :189`, `allowedAggregation :191`,
  `status :193`), `toObservation()` (`:94–144`, prompt 115 closed, read-only
  context), `valueOf` / `decimalValueToString` (read-only context). Re-read at
  execution and resolve current line numbers rather than editing from this
  snapshot.
- `server/src/analytics/analytics.repository.ts` — `findMetrics` (`:25–31`),
  `findMetric` (`:33–37`), `findObservations` (`:39–50`),
  `findAggregates` (`:52–63`), `findAggregate` (`:65–70`),
  `findAggregateEvidence` (`:72–86`) returning Prisma rows with enum-typed
  metric/aggregate fields into `toMetric` / `toAggregate`. Read-only;
  unchanged.
- `server/src/analytics/analytics.types.ts` — `ANALYTICS_CALCULATION_VERSION`
  (`:4`, the reason `calculationVersion` stays open), `MetricValueType`
  (`:6`), `MetricAggregationType` (`:7–8`) as the domain closed-union
  precedent. Read-only; unchanged.
- `server/src/generated/prisma/enums.ts` — `MetricValueType` (`:255–261`),
  `MetricAggregationType` (`:264–273`), `MetricDefinitionStatus`
  (`:276–281`) generated unions. Read-only; regenerated, never hand-edited.
- `server/prisma/schema.prisma` — `model MetricDefinition` (`:752–775`):
  enum `valueType` / `allowedAggregation` / `status` (`:759,761,763`) versus
  open `calculationVersion String` (`:762`); `model MetricAggregate`
  (`:826–858`): enum `aggregateType` (`:836`) versus open
  `calculationVersion String` (`:841`); `enum MetricValueType`
  (`:1126–1130`), `enum MetricAggregationType` (`:1132–1139`),
  `enum MetricDefinitionStatus` (`:1141–1144`). Read-only; no migration.
- `server/src/analytics/seed/analytics-scale-seed.types.ts` —
  `SeedMetricDefinition` (`:110–122`: `valueType :117`, `allowedAggregation
  :119` five-member, `calculationVersion :120` open, `status :121`
  single-member), `SeedMetricAggregate` (`:157–174`: `aggregateType :167`
  five-member). Read-only; unchanged; subset witnesses per §Scope.
- `server/src/analytics/analytics.service.spec.ts` — metric/aggregate fixtures
  (`:35–49`, `:80–99`, plus `:164–168`, `:218–222`, `:281–285`,
  `:408–416`, `:500–508`, `:539–543`): `valueType: 'numeric'`,
  `allowedAggregation: 'avg'`, `status: 'active'`, `aggregateType: 'avg'`
  (all members), `calculationVersion: 'analytics-v1'` (open, out of scope).
  Re-read at execution; if any fixture uses a value outside the
  three-plus-six-plus-two literals, stop per §Rollback.
- `server/src/analytics/seed/analytics-scale-seed.ts` — synthetic pushes
  (`:225,267,269,271,345,381,394,462,497,499,501,542,569`): `valueType:
  'numeric'`, `allowedAggregation` from `spec.aggregation` or `'sum'`,
  `status: 'active'`, `aggregateType` from `spec.aggregation` or `'sum'`
  (all members). Read-only; unchanged.
- `server/src/dashboards/dashboards.service.spec.ts` — downstream metric
  fixtures (`:64,74,76,78,88`, plus `:111,195,246`, archival `:609`):
  `status: 'active'` / `'archived'`, `valueType: 'numeric'`,
  `allowedAggregation: 'avg'`, `aggregateType: 'avg'` (all members, proving
  the Prisma-wide choice admits the only committed `'archived'` witness).
  Read-only; unchanged.
- `prompts/115-observation-read-quality-severity-state-narrowing.md` — the
  closing lineage prompt (read-side enum narrowing, `code`/`message` and
  `toMetric`/`toAggregate` non-goals scoping, checks shape) this prompt
  mirrors for the metric/aggregate mappers.
- `prompts/114-parser-details-metadata-value-narrowing.md` — the scalar-record
  precedent for mirroring an existing precise inline shape instead of adding
  an alias.

No visual reference is applicable. This is an internal server-only type
contract change, so the design-system PDF, landing-page PNGs, and recorded
chrome flows provide no evidence and must not be opened or cited as if they
did.

## Measurements and verified invariants

These are code-derived constraints at `c608496`; re-verify them before editing:

1. Exactly four open enum sites on this read path: `toAggregate()`
   `aggregateType: string` and `toMetric()` `valueType: string`,
   `allowedAggregation: string`, `status: string`. Re-run the grep
   (`aggregateType: string|valueType: string|allowedAggregation: string|status: string`)
   over `server/src/analytics/analytics.service.ts` at execution and confirm
   no fifth site appeared. `calculationVersion: string` (×2),
   `canonicalUnit`, `key`, `label`, `unit`, `dimensionHash`, and every `id`
   are different carriers, explicitly out of scope.
2. The closed vocabulary is exactly three value types, six aggregation types,
   and two statuses, byte-for-byte identical across
   `analytics.types.ts:6–8`, `enums.ts:255–281`, and
   `schema.prisma:1126–1144`. The seed's five-member aggregation and
   single-member status are strict subsets (every seed literal is a member),
   not disagreements. If the three authorities disagree at execution, stop
   and report it rather than picking a winner silently.
3. `calculationVersion: string` stays open in both mappers. Re-grep the
   constant (`ANALYTICS_CALCULATION_VERSION`) and the `'analytics-v1'`
   fixture literals at execution; if an enum for calculation versions
   appeared in schema or generated enums, record it — the out-of-scope
   justification must be re-checked, not assumed.
4. All committed `toMetric()` / `toAggregate()` fixtures use enum members.
   Re-grep `valueType:` / `allowedAggregation:` / `status:` /
   `aggregateType:` literals in `analytics.service.spec.ts`,
   `analytics-scale-seed.ts`, and `dashboards.service.spec.ts` at execution;
   if any value falls outside the eleven literals (3 + 6 + 2), stop and
   report it rather than widening scope or rewriting test semantics. The
   single `'archived'` witness (`dashboards.service.spec.ts:609`) is a
   member and must keep compiling.
5. Prisma is the caller: `listMetrics` (`:13–21`), `getMetric` (`:23–32`),
   `listObservations` (`:35–47`), `listAggregates` (`:49–61`), and
   `getAggregateEvidence` (`:63–91`) map repository rows (enum-typed metric /
   aggregate fields) through `toMetric` / `toAggregate`. Narrowing the
   parameters from `string` to the enum unions admits every value Prisma can
   produce; no cast, validator, or repository change is needed. If typecheck
   disagrees at execution, restore and report rather than adding a cast
   helper.
6. No runtime value moves: metric/aggregate fields flow through unchanged
   (`valueType: metric.valueType` `:202`, `allowedAggregation:
   metric.allowedAggregation` `:204`, `status: metric.status` `:206`,
   `aggregateType: aggregate.aggregateType` `:170` stay byte-for-byte except
   types). A test that changes outcome (not just compilation) after this
   edit disproves the premise — stop and report it.
7. `ObservationQuality.details` (`Json?`), `dimensions`, `qualitySummary`,
   `datasetVersionIds`, `valueOf`, `decimalValueToString`, and every Prisma
   model, migration, RLS policy, index, and query stay untouched.
8. There is no established negative-type-test pattern in this repository
   (verified through prompt 115: zero `ts-expect-error` / `expectTypeOf`
   uses in `server/src`, `client/`, `packages/shared/src`). Do not invent
   one; the gate is `npm run typecheck` plus unchanged runtime suites.

The required type shapes mirror the sibling carriers exactly:

```ts
function toAggregate(aggregate: {
  // ...
  aggregateType: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'latest';
  // ...
});
```

```ts
function toMetric(metric: {
  // ...
  valueType: 'numeric' | 'text' | 'boolean';
  canonicalUnit: string;
  allowedAggregation: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'latest';
  calculationVersion: string;
  status: 'active' | 'archived';
  // ...
});
```

Do not introduce a shared alias, a Prisma-enum import, a
`calculationVersion` / `canonicalUnit` union, a new literal, a validator, or
a per-value branch.

## Expected impact

- Routes changed: none.
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none (runtime
  values identical; value-type/aggregation/status strings already
  constrained by DB enums).
- Database schema, Prisma models, migrations, RLS, queries, indexes, queues,
  and persisted-data formats changed: none.
- Runtime mapper behavior: unchanged — every metric/aggregate accepted today
  maps to the identical response object; every error path (`Metric not
  found.`, `Aggregate not found.`) behaves exactly as today.
- Compile-time contract: `toMetric()` / `toAggregate()` no longer admit an
  invented value-type, aggregation, or status string at construction. Prisma
  rows, spec fixtures, seed rows, and downstream dashboard fixtures (all
  members) compile unchanged.
- Logging/observability: unchanged; no metric metadata is logged.
- Threat model: no new boundary and no risk reclassification. The change adds
  a concrete read-mapper type-contract detail under the existing Phase 8
  deterministic-analytics behavior.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and every
   skill named in `## SKILLS USED`. Confirm `git status --short` before editing;
   preserve any unrelated user changes and stop if they overlap an approved
   path. Confirm `HEAD` is `c608496` (or record the actual SHA and adjust
   `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–4 at execution: re-run the four-field open
   grep over `server/src/analytics/analytics.service.ts`, diff the three
   vocabulary authorities (domain types, generated enums, schema enums) plus
   the seed subset check, re-grep the `calculationVersion` open witnesses,
   and re-grep fixture literals across `analytics.service.spec.ts`,
   `analytics-scale-seed.ts`, and `dashboards.service.spec.ts`. If a
   non-member value, a vocabulary disagreement, or a new calculation-version
   enum appears, stop and report it rather than silently widening scope.
3. In `server/src/analytics/analytics.service.ts`, change only the four field
   types:
   - `toAggregate()`: `aggregateType: string` →
     `aggregateType: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'latest'`;
   - `toMetric()`: `valueType: string` →
     `valueType: 'numeric' | 'text' | 'boolean'`;
   - `toMetric()`: `allowedAggregation: string` →
     `allowedAggregation: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'latest'`;
   - `toMetric()`: `status: string` →
     `status: 'active' | 'archived'`;
   - leave `calculationVersion: string` (×2), `canonicalUnit`, `key`,
     `label`, `description`, `unit`, `dimensionHash`, every `id`, every other
     `toAggregate` / `toMetric` / `toObservation` field, `valueOf`,
     `decimalValueToString`, and all service methods byte-for-byte unchanged.
     Do not add an import, alias, cast, or validator.
4. Make no other production edit: no repository, DTO, controller, resolver,
   Prisma schema, migration, seed, spec, or client change. If typecheck
   demands more than this four-field edit, restore and report rather than
   expanding scope.
5. Run focused regression suites for the read mappers and the closest
   write-side enum producer. If any valid metric/aggregate maps to a
   different response shape, value, or key order, stop and report the exact
   fixture — a type-only change must not alter runtime output.
6. Run `npm run contracts:check` and verify no generated REST/OpenAPI/GraphQL
   artifact changes. This internal read-mapper contract change must not alter
   a public contract snapshot.
7. Update `docs/analytics.md` in the quality-carrier paragraph that prompts
   86–100 and 115 extended. Record that `toMetric()` value-type/aggregation/
   status and `toAggregate()` aggregate-type are typed as the closed
   Prisma-enum unions, matching `MetricValueType` /
   `MetricAggregationType` / `MetricDefinitionStatus` in domain types,
   generated enums, and schema enums; that `calculationVersion` (and units,
   keys, labels, ids) deliberately stay `string` because the schema leaves
   them open and only a version constant exists; that the seed's narrower
   five-member/one-member ranges are admitted subsets; and that no runtime
   mapping, rejection, or response shape changed.
8. Inspect the complete diff, run every check below, and quote real exit status
   plus meaningful test/build totals. Fix issues before review.
9. Run the mandatory two-stage review loop:
   - dispatch a read-only reviewer subagent with `requesting-code-review`, this
     prompt path, `BASE_SHA=c608496` (or the recorded actual HEAD), the
     working-tree diff (or implementation `HEAD_SHA` if an intermediate
     commit is explicitly required), changed paths, constraints, and real
     check outputs;
   - process every finding with `receiving-code-review`: understand and verify
     it against source and requirements before changing code; fix blocking and
     important valid findings in order, test each fix, and give technical
     pushback where evidence disproves a suggestion;
   - request follow-up review if a valid fix materially changes architecture,
     a public contract, data flow, or the trust boundary.
10. Commit locally on `main` using `caveman-commit`. Stage:
    - `prompts/116-metric-aggregate-read-enum-narrowing.md`;
    - `docs/analytics.md`;
    - `server/src/analytics/analytics.service.ts`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend, or
      push. Use a terse Conventional Commit subject and include a short body
      explaining the read-mapper type-contract reason because it is not obvious
      from the subject alone.

## Non-goals

- No narrowing of `calculationVersion`, `canonicalUnit`, `key`, `label`,
  `unit`, `dimensionHash`, or any `id`: free-form text with no closed
  authority; a separate taxonomy prompt owns any unit/version-key policy
  change.
- No narrowing of `toObservation()` quality `code` / `message`: prompt 115
  closed severity/state and left code/message open by schema-plus-fixture
  policy; not revisited here.
- No shared value-type/aggregation/status alias, Prisma-enum import, key
  blocklist/allowlist, per-value branching, validator, cast helper, or
  literal addition (including adding `latest` / `archived` to seed types).
- No changes to `ParsedObservation`, `SeedObservationQuality`,
  `SeedMetricDefinition`, `SeedMetricAggregate`, generated Prisma enums,
  `AnalyticsRepository`, DTOs, controllers, resolvers, seeds, or specs; in
  case of a focused valid-fixture contradiction, stop instead of expanding
  scope.
- No schema migration, SQL, Prisma repository, RLS, index, tenant, worker
  queue, storage, upload, route, API contract, client, design, accessibility,
  motion, or browser work.
- No new test cases and no invented negative-type-test pattern
  (`ts-expect-error` / `expectTypeOf` have zero uses in this repository); no
  general mapper refactor or unrelated cleanup.

## Reference deltas

No visual delta. The deliberate static delta is limited to the read-mapper
TypeScript contract: invented `valueType` / `allowedAggregation` /
`aggregateType` / `status` strings no longer construct `toMetric()` /
`toAggregate()` at compile time. Runtime acceptance, mapped output, key
order, enum-column contents, and every error path are observably identical
before and after.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this internal server type-contract change.

## Checks to run, and the owning doc

```bash
# Focused read-mapper regression (must pass unchanged)
npm --workspace=@acres/server test -- analytics.service.spec.ts

# Closest write-side enum compatibility (closest current equivalent if renamed)
npm --workspace=@acres/server test -- analytics-publication.service.spec.ts

# Public contracts must remain unchanged
npm run contracts:check

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/116-metric-aggregate-read-enum-narrowing.md \
  docs/analytics.md \
  server/src/analytics/analytics.service.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/116-metric-aggregate-read-enum-narrowing.md \
  docs/analytics.md \
  server/src/analytics/analytics.service.ts
```

Quote the actual exit status and meaningful Jest/build totals. If a named spec
does not exist at execution time, locate the closest current equivalent with
`rg --files server/src/analytics`, run it, and record that evidence instead of
claiming a nonexistent check. Browser E2E, real PostgreSQL, spatial plan, and
operations-drill suites are intentionally omitted because this scope adds no
rejection path, changes no schema/query behavior, and touches no browser
journey or deployment surface.

`docs/analytics.md` owns the implementation record. `docs/security.md` and
`docs/backend.md` are read-only verification for this task; update either only
if execution proves a statement materially stale, and stop before broadening
scope.

## Rollback and stop conditions

Rollback is a source/test/doc revert; there is no migration or persisted-data
rollback. Stop before expanding scope if any of these occur:

- the four-field open grep shows other than the single `toAggregate()` plus
  triple `toMetric()` sites at execution time;
- the three vocabulary authorities disagree on the eleven literals, or the
  seed contains a literal outside them;
- any committed spec, seed, or downstream dashboard fixture uses a
  value-type/aggregation/status outside the eleven literals;
- a calculation-version enum appeared (the out-of-scope justification must be
  re-proved);
- an existing test changes outcome (not just compilation) after the edit;
- a public contract snapshot changes;
- the fix requires a new literal, validator, cast, alias, import, error
  code/message, schema change, repository rewrite, or spec/seed rewrite.

Report the contradictory evidence and prepare a separate prompt rather than
silently changing the premise.

## Completion criteria

- `toMetric()` `valueType` accepts only the three Prisma-enum literals at
  compile time.
- `toMetric()` `allowedAggregation` accepts only the six Prisma-enum literals
  at compile time.
- `toMetric()` `status` accepts only the two Prisma-enum literals at compile
  time.
- `toAggregate()` `aggregateType` accepts only the six Prisma-enum literals
  at compile time.
- `calculationVersion` (×2), units, keys, labels, ids, and quality
  `code`/`message` remain open `string`, with constant/seed witnesses
  recorded.
- Every other mapper field, repository, schema, seed, and spec is
  byte-for-byte equivalent in behavior.
- Current analytics read-mapper and write-carrier tests pass with identical
  outcomes.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all verified
  blocking/important findings are fixed and re-tested.
- `docs/analytics.md` records the metric/aggregate read-side invariant and
  the deliberate `calculationVersion` openness.
- Only the approved paths are committed locally to `main`; nothing is pushed.

## SKILLS USED

- `architecture-patterns` — preserve the existing analytics service/repository
  boundary and avoid introducing shared aliases or cross-module coupling.
- `nestjs-best-practices` — keep the change inside the existing Nest analytics
  service mappers without provider/module wiring changes.
- `postgres-best-practices` — verify against the `MetricDefinition` /
  `MetricAggregate` enum-versus-`String` column contract; no schema, migration,
  transaction, RLS, or persistence change.
- `sql-optimization-patterns` — verify no query, index, or query-plan work is
  introduced by this in-memory type change.
- `javascript-testing-patterns` — rely on the existing read-mapper and
  write-carrier Jest suites as unchanged-outcome regression proof; no test
  semantics changed.
- `error-handling-patterns` — keep the deterministic mappers and existing
  not-found error paths; no new failure literal is introduced.
- `kpi-dashboard-design` — guard duty only: metric/aggregation/status semantics
  and display vocabulary unchanged, so no dashboard-semantics change ships here.
- `data-storytelling` — guard duty only: evidence/lineage presentation
  unchanged, so no report-narrative change ships here.
- `requesting-code-review` — dispatch the mandatory structured read-only review
  with precise scope, SHAs, changed paths, and check evidence.
- `receiving-code-review` — verify reviewer claims against repository reality
  before fixes or technical pushback.
- `caveman-commit` — produce the required terse Conventional Commit message
  with a short read-mapper rationale body.

Not loaded, with reason: `security-best-practices` / `security-threat-model`
(no trust-boundary or persistence change — read-only verification against
`docs/security.md` suffices); `api-design-principles` /
`openapi-spec-generation` (contracts:check guard duty only, no public contract
change); `e2e-testing-patterns` / `playwright` (internal mappers correctly
covered below the browser layer); frontend/Tailwind/shadcn/GSAP skills (no UI
or motion).
