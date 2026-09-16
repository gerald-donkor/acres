# 118 — annotate `valueOf()` with the closed metric-value union and drop the `summary()` kind cast

## Scope, and why it is next

The committed repository is on `main` at `0fc6460`
(`refactor(dashboards): narrow toView status union`, the prompt 117
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 117 — which closed the last open enum carrier in the Phase 9
saved-view read mapper (`toView()` status in prompt 117, following the
Phase 8 read-mapper enum narrowing in prompts 115–116).

There is no unbuilt ordered phase left. The next smallest unblocked residual is
on the same Phase 8/9 read path the 115–117 lineage owns, and prompt 117
explicitly deferred it: `summary()` in
`server/src/dashboards/dashboards.service.ts` still launders the aggregate
value kind through an `as` cast, while every authority the codebase already
states says the vocabulary is closed:

- `MetricValueType` — `numeric | text | boolean`:
  `server/src/analytics/analytics.types.ts:6` (the analytics domain
  authority; already imported by `mapping.ts` and the publication service);
- `MetricValueKind` — `numeric | text | boolean`:
  `packages/shared/src/dashboards.ts:1` (the shared dashboard contract;
  byte-for-byte the same three literals);
- every committed fixture uses only member literals
  (`analytics.service.spec.ts` `:292,338–346`, `dashboards.service.spec.ts`
  `:91–92,659–680`).

The gap, at `0fc6460` (re-verify exact lines at execution):

```ts
// server/src/analytics/analytics.service.ts:212–222
function valueOf(row: {
  numericValue: unknown;
  textValue: string | null;
  booleanValue: boolean | null;
}) {
  // ← no return annotation
  if (row.numericValue !== null && row.numericValue !== undefined) {
    return { type: "numeric", value: decimalValueToString(row.numericValue) };
  }
  if (row.textValue !== null) return { type: "text", value: row.textValue };
  return { type: "boolean", value: row.booleanValue };
}
```

```ts
// server/src/dashboards/dashboards.service.ts:162–174
aggregates: aggregates.map((aggregate) => ({
  ...aggregate,
  datasetVersionIds: Array.isArray(aggregate.datasetVersionIds)
    ? (aggregate.datasetVersionIds as string[])   // stays — see §Non-goals
    : [],
  value: {
    type: aggregate.value.type as MetricValueKind, // :168 — this prompt
    value:
      aggregate.value.value === null
        ? null
        : String(aggregate.value.value),
  },
})),
```

`valueOf()` has no return annotation, so TypeScript widens each returned
`type` literal to `string`. That widened `string` flows through
`toObservation()` (`:131`) and `toAggregate()` (`:173`) into
`AnalyticsService.listAggregates()`, and `summary()` recovers the precision
it already had with the `:168` cast. Proven this session, not assumed: a
scratch file mirroring `valueOf()`'s three branches fails `tsc --strict
--noEmit` with `error TS2322: Type 'string' is not assignable to type
'"boolean" | "numeric" | "text"'` when its `.type` is assigned to the
three-member union. The cast is load-bearing only because the annotation is
missing — the values themselves never leave the closed vocabulary.

Inline discriminated union over importing `MetricValueType` or
`MetricValue` is a judgement, stated as one: prompts 115–116 mirrored the
sibling carriers inline in `analytics.service.ts` rather than importing a
shared authority, and the file under edit imports only `Prisma` as a type
plus `ApiException`, the repository, and DTO types. The discriminated shape
below is additionally the most precise statement available — `boolean |
null` occurs only on the `boolean` variant, exactly matching the three
branches — while `{ type: MetricValueType; value: string | boolean | null }`
would flatten that away, and importing shared `MetricValue` would couple
the analytics mapper to the dashboard response DTO (`value: string | null`
does not even admit the boolean branch's payload). No new import, no new
literal, no runtime branch moves.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 8's governed metric/observation semantics and
  exact phase skill manifest (§9); Phase 9's dashboard outcome (§10); §§16–22
  confirming no unbuilt ordered phase.
- `docs/analytics.md` — the prompt 115/116 read-side narrowing paragraphs
  this prompt extends to the shared `valueOf()` helper; the
  `analytics.service.spec.ts` unit evidence; the owning implementation
  record for the `valueOf` annotation.
- `docs/dashboards.md` — the prompt 117 `toView()` status paragraph (this
  prompt touches the adjacent `summary()` mapper, not the saved-view
  record); the `dashboards.service.spec.ts` summary evidence; the owning
  implementation record for the cast removal.
- `docs/backend.md` — current Nest modular-monolith/server conventions and
  root build/test command ownership; no module, provider, route, or database
  surface changes in this prompt.
- `docs/security.md` — TM boundaries. This work tightens two read-mapper
  TypeScript contracts; it does not add or move a trust boundary, persist
  new data, or change an envelope.
- `server/src/analytics/analytics.service.ts` — `valueOf()` (`:212–222`,
  unannotated), `toObservation()` value (`:131`), `toAggregate()` value
  (`:173`), `toMetric()` (`:184–210`, prompts 115–116 closed, read-only
  context), `decimalValueToString` (read-only context). Re-read at
  execution and resolve current line numbers rather than editing from this
  snapshot.
- `server/src/analytics/analytics.types.ts` — `MetricValueType` (`:6`, the
  domain closed-union witness). Read-only; unchanged.
- `server/src/dashboards/dashboards.service.ts` — `summary()` (`:148–177`,
  the `:168` kind cast and the `:164–166` `datasetVersionIds` guard),
  `toView()` (`:194–218`, prompt 117 closed, read-only context). Re-read at
  execution.
- `packages/shared/src/dashboards.ts` — `MetricValueKind` (`:1`),
  `MetricValue` (`:3–6`, the identical-literal witness). Read-only;
  unchanged.
- `server/src/graphql/graphql.types.ts` — `DashboardValueGql` (`:335–345`,
  `type!: string`, `value!: string | null`). Read-only witness that the
  GraphQL layer accepts the narrowed output structurally; unchanged.
- `server/src/analytics/analytics.service.spec.ts` — value assertions
  (`:292,338–346,419,452–456`, all member literals). Re-read at execution;
  if any fixture uses a kind outside the three literals, stop per
  §Rollback.
- `server/src/dashboards/dashboards.service.spec.ts` — summary value
  assertions (`:91–92`, `:656–689`, all `type: 'numeric'`). Re-read at
  execution. Note `:665–689` deliberately feeds `value: 12.34` (a number)
  and `value: null` through untyped `jest.Mock` boundaries to prove the
  `String(...)` coercion — mocks bypass the service types, so the
  annotation must not alter that coercion or these expectations.
- `prompts/117-dashboard-view-status-narrowing.md` — the closing lineage
  prompt (read-mapper narrowing, non-goals scoping that deferred this
  cast, checks shape) this prompt mirrors.
- `prompts/116-metric-aggregate-read-enum-narrowing.md` — the inline-union
  precedent and the "no negative-type-test pattern" gate reused here.

No visual reference is applicable. This is an internal server-only type
contract change, so the design-system PDF, landing-page PNGs, and recorded
chrome flows provide no evidence and must not be opened or cited as if they
did.

## Measurements and verified invariants

These are code-derived constraints at `0fc6460`; re-verify them before editing:

1. Exactly one unannotated `valueOf` plus one kind cast on this read path:
   `function valueOf(row: {...}) {` (`analytics.service.ts:212`, no return
   type) and `type: aggregate.value.type as MetricValueKind`
   (`dashboards.service.ts:168`). Re-run the grep
   (`function valueOf|as MetricValueKind`) over both files at execution and
   confirm no second site appeared. The `:164–166` `datasetVersionIds`
   guard+cast, the `:211–212` `filters`/`presentation` casts, and every
   `toView`/`toMetric`/`toAggregate` field are different carriers,
   explicitly out of scope.
2. The closed vocabulary is exactly three kinds, byte-for-byte identical
   across `analytics.types.ts:6` (`MetricValueType`) and
   `dashboards.ts:1` (`MetricValueKind`). If the two authorities disagree at
   execution, stop and report it rather than picking a winner silently.
3. The widening is proven, not assumed: a scratch `valueOf` mirror fails
   `tsc --strict --noEmit` with `TS2322` (`string` not assignable to the
   three-member union) when `.type` is assigned to it. The annotation must
   therefore be the _cause_ of the cast removal — after annotating,
   `npm run typecheck` with the cast dropped is the proof.
4. All committed value fixtures use kind members. Re-grep `type: '`
   literals in both spec files at execution; if any value falls outside
   `'numeric' | 'text' | 'boolean'`, stop and report it rather than
   widening scope or rewriting test semantics. The `:665–689` number/null
   payloads exercise the `String(...)` coercion through untyped mocks and
   must keep passing unchanged.
5. `summary()`'s coercion stays total under the annotation:
   `aggregate.value.value === null ? null : String(aggregate.value.value)`
   admits `string | boolean | null` (the union of the three variants'
   payloads) without a signature change. If typecheck disagrees at
   execution, restore and report rather than adding a cast helper or
   touching the coercion.
6. GraphQL accepts the narrowed output structurally:
   `DashboardValueGql.type!: string` admits the three literals, and the
   resolver returns the summary object without a Gql-annotated coupling
   (inferred return). `contracts:check` must still report no artifact
   change; if a snapshot moves, stop — a type-only change must not alter a
   public contract.
7. No runtime value moves: every branch of `valueOf()` returns the
   identical object it returns today, and `summary()` maps every aggregate
   to the identical response object. A test that changes outcome (not just
   compilation) after this edit disproves the premise — stop and report it.
8. `datasetVersionIds` stays `unknown` through `toAggregate()` and keeps
   its `Array.isArray` guard plus `as string[]` in `summary()`. The column
   is `Json` (`schema.prisma:844`), genuinely unknown at the Prisma layer,
   so claiming `string[]` at the mapper would invent precision the
   database does not guarantee; element-wise validation is a separate
   rejection-policy decision, not this prompt.
9. There is no established negative-type-test pattern in this repository
   (verified through prompt 117: zero `ts-expect-error` / `expectTypeOf`
   uses in `server/src`, `client/`, `packages/shared/src`). Do not invent
   one; the gate is `npm run typecheck` plus unchanged runtime suites.

The required shapes mirror the branch structure exactly:

```ts
// analytics.service.ts
function valueOf(row: {
  numericValue: unknown;
  textValue: string | null;
  booleanValue: boolean | null;
}):
  | { type: "numeric"; value: string }
  | { type: "text"; value: string }
  | { type: "boolean"; value: boolean | null } {
  // ... branches byte-for-byte unchanged
}
```

```ts
// dashboards.service.ts — summary()
value: {
  type: aggregate.value.type,
  value:
    aggregate.value.value === null
      ? null
      : String(aggregate.value.value),
},
```

Do not introduce a shared alias, a new import, a validator, a per-value
branch, a coercion change, or a new literal.

## Expected impact

- Routes changed: none.
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none (runtime
  values identical; value kinds already constrained to the three literals
  by every producer, and the GraphQL `type` field already accepts them as
  `string`).
- Database schema, Prisma models, migrations, RLS, queries, indexes,
  queues, and persisted-data formats changed: none.
- Runtime mapper behavior: unchanged — every observation and aggregate
  accepted today maps to the identical response object, including the
  number/null `String(...)` coercion witnesses in the summary spec.
- Compile-time contract: `valueOf()` no longer widens `type` to `string`,
  so `summary()` no longer launders it through `as MetricValueKind`. Any
  future value producer inventing a fourth kind fails typecheck at
  `valueOf()` instead of compiling through the summary cast.
- `dashboards.service.ts` loses its only `MetricValueKind` usage, so the
  now-unused import (`:8`) is removed in the same edit. If the import is
  referenced anywhere else at execution time, stop and report rather than
  removing it.
- Logging/observability: unchanged; no metric values are logged.
- Threat model: no new boundary and no risk reclassification. The change
  adds a concrete read-mapper type-contract detail under the existing
  Phase 8 deterministic-analytics behavior.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and
   every skill named in `## SKILLS USED`. Confirm `git status --short`
   before editing; preserve any unrelated user changes and stop if they
   overlap an approved path. Confirm `HEAD` is `0fc6460` (or record the
   actual SHA and adjust `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–4 at execution: re-run the
   `function valueOf|as MetricValueKind` grep over both service files,
   diff the two kind authorities (`analytics.types.ts:6`,
   `dashboards.ts:1`), re-grep kind literals across both spec files, and
   re-confirm `MetricValueKind` has no other usage in
   `dashboards.service.ts`. If a fourth kind, a vocabulary disagreement,
   a second cast site, or another `MetricValueKind` usage appears, stop
   and report it rather than silently widening scope.
3. In `server/src/analytics/analytics.service.ts`, annotate only the
   `valueOf()` return type with the discriminated three-variant union in
   §Measurements. Leave every branch body, every parameter field,
   `toObservation()`, `toAggregate()`, `toMetric()`, `valueOf` callers,
   `decimalValueToString`, and all service methods byte-for-byte
   unchanged. Do not add an import, alias, cast, or validator.
4. In `server/src/dashboards/dashboards.service.ts`, change only the kind
   carrier inside `summary()`:
   - `type: aggregate.value.type as MetricValueKind` →
     `type: aggregate.value.type`;
   - remove the now-unused `MetricValueKind` from the `:2–10` shared
     type import (only if the item-2 grep proves it is the last usage).
     Leave the `datasetVersionIds` guard+cast, the coercion, `filters` /
     `presentation` casts, `toView()`, and all service methods byte-for-byte
     unchanged. If typecheck demands more than this, restore and report
     rather than expanding scope.
5. Make no other production edit: no repository, DTO, controller,
   resolver, GraphQL type, Prisma schema, migration, seed, spec,
   shared-contract, or client change. If typecheck demands more than the
   annotation plus the cast/import removal, restore and report rather
   than expanding scope.
6. Run the focused read-mapper and summary regression suites. If any valid
   observation, aggregate, or summary maps to a different response shape,
   value, or key order — including the number/null coercion witnesses —
   stop and report the exact fixture: a type-only change must not alter
   runtime output.
7. Run `npm run contracts:check` and verify no generated REST/OpenAPI/
   GraphQL artifact changes. This internal read-mapper contract change
   must not alter a public contract snapshot.
8. Update `docs/analytics.md` in the quality-carrier / read-mapper
   paragraph that prompts 86–100 and 115–116 extended. Record that
   `valueOf()` returns the closed discriminated union (per-variant
   payloads, `boolean | null` only on the boolean variant), matching
   `MetricValueType` and shared `MetricValueKind`; that the annotation
   was the missing cause of the widened `string`; and that no runtime
   mapping, rejection, or response shape changed.
9. Update `docs/dashboards.md` in the paragraph that prompt 117 extended
   for `toView()`. Record that `summary()`'s `as MetricValueKind` cast is
   removed because `AnalyticsService` now carries the kind with compiler
   proof; that the `datasetVersionIds` guard+cast and the
   `filters`/`presentation` casts are unchanged (Json-backed carriers
   owned by separate decisions); and that no runtime mapping, coercion,
   or response shape changed.
10. Inspect the complete diff, run every check below, and quote real exit
    status plus meaningful test/build totals. Fix issues before review.
11. Run the mandatory two-stage review loop:
    - dispatch a read-only reviewer subagent with `requesting-code-review`,
      this prompt path, `BASE_SHA=0fc6460` (or the recorded actual HEAD),
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
    - `prompts/118-valueof-value-kind-narrowing.md`;
    - `docs/analytics.md`;
    - `docs/dashboards.md`;
    - `server/src/analytics/analytics.service.ts`;
    - `server/src/dashboards/dashboards.service.ts`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend,
      or push. Use a terse Conventional Commit subject and include a short
      body explaining the `valueOf` widening cause, because it is not
      obvious from the subject alone.

## Non-goals

- No change to the `datasetVersionIds` guard+cast (`:164–166`): the
  column is `Json`, genuinely unknown at the Prisma layer; claiming
  `string[]` at the mapper or inventing element-wise rejection policy is
  a separate validation decision.
- No change to `toView()` `filters` / `presentation` casts or
  `resolveSchemaVersion`: Json/shape carriers owned by prompt 68
  versioning policy; not revisited here.
- No narrowing of shared `DashboardMetric` (`valueType` /
  `allowedAggregation` / `status`) or `DashboardAggregate`
  (`aggregateType`): open shared-contract text with client/GraphQL
  consumers; the separate shared-contract decision prompt 117 deferred
  still owns any change there.
- No narrowing of `toObservation()` quality `code` / `message`, of
  `calculationVersion`, `canonicalUnit`, keys, labels, units, dimension
  hashes, or ids: free-form text with no closed authority; prompts 115–116
  own that policy and it is not revisited here.
- No new import (including `MetricValueType` / `MetricValue` / Prisma-enum
  imports), shared alias, validator, cast helper, per-value branch,
  coercion change, or literal addition.
- No schema migration, SQL, Prisma repository, RLS, index, tenant, worker
  queue, storage, upload, route, API contract, resolver, GraphQL type,
  client, design, accessibility, motion, or browser work.
- No new test cases and no invented negative-type-test pattern
  (`ts-expect-error` / `expectTypeOf` have zero uses in this repository);
  no general mapper refactor or unrelated cleanup (including the
  `mapping.ts` `as MetricValueType` sites, which sit behind `Set.has`
  guards and are not revisited here).

## Reference deltas

No visual delta. The deliberate static delta is limited to the
read-mapper TypeScript contracts: a fourth value kind no longer flows
from `valueOf()` through `summary()` at compile time, and the
`as MetricValueKind` laundering cast (plus its now-unused import) is
removed. Runtime acceptance, mapped output, key order, the `String(...)`
coercion, enum-column contents, and every error path are observably
identical before and after.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this internal server type-contract change.

## Checks to run, and the owning doc

```bash
# Focused read-mapper + summary regression (must pass unchanged)
npm --workspace=@acres/server test -- analytics.service.spec.ts
npm --workspace=@acres/server test -- dashboards.service.spec.ts

# Public contracts must remain unchanged
npm run contracts:check

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/118-valueof-value-kind-narrowing.md \
  docs/analytics.md \
  docs/dashboards.md \
  server/src/analytics/analytics.service.ts \
  server/src/dashboards/dashboards.service.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/118-valueof-value-kind-narrowing.md \
  docs/analytics.md \
  docs/dashboards.md \
  server/src/analytics/analytics.service.ts \
  server/src/dashboards/dashboards.service.ts
```

Quote the actual exit status and meaningful Jest/build totals. If a named
spec does not exist at execution time, locate the closest current
equivalent with `rg --files server/src/analytics server/src/dashboards`,
run it, and record that evidence instead of claiming a nonexistent check.
Browser E2E, real PostgreSQL, spatial plan, and operations-drill suites
are intentionally omitted because this scope adds no rejection path,
changes no schema/query behavior, and touches no browser journey or
deployment surface.

`docs/analytics.md` owns the `valueOf()` annotation record and
`docs/dashboards.md` owns the cast-removal record. `docs/security.md` and
`docs/backend.md` are read-only verification for this task; update either
only if execution proves a statement materially stale, and stop before
broadening scope.

## Rollback and stop conditions

Rollback is a source/test/doc revert; there is no migration or
persisted-data rollback. Stop before expanding scope if any of these occur:

- the `function valueOf|as MetricValueKind` grep shows other than the
  single unannotated helper plus its single summary cast at execution
  time;
- the two kind authorities disagree on the three literals, or a fixture
  contains a kind outside them;
- `MetricValueKind` is used elsewhere in `dashboards.service.ts` at
  execution time (the import removal premise fails);
- an existing test changes outcome (not just compilation) after the edit,
  including the number/null coercion witnesses;
- a public contract snapshot changes;
- the fix requires a new literal, validator, cast, alias, import (beyond
  the import _removal_), error code/message, schema change, repository
  rewrite, shared-contract edit, coercion change, or spec/seed rewrite.

Report the contradictory evidence and prepare a separate prompt rather
than silently changing the premise.

## Completion criteria

- `valueOf()` carries the explicit discriminated three-variant return
  type, and every branch body is byte-for-byte unchanged.
- The `as MetricValueKind` cast is gone; `type` flows through as
  `aggregate.value.type`, and the now-unused import is removed.
- The `datasetVersionIds` guard+cast, the `String(...)` coercion,
  `filters`/`presentation` casts, and every other mapper field,
  repository, schema, shared DTO, GraphQL type, seed, and spec is
  byte-for-byte equivalent in behavior.
- Current analytics read-mapper and dashboard summary tests pass with
  identical outcomes.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all
  verified blocking/important findings are fixed and re-tested.
- `docs/analytics.md` records the `valueOf()` invariant and
  `docs/dashboards.md` records the removed summary cast.
- Only the approved paths are committed locally to `main`; nothing is
  pushed.

## SKILLS USED

- `architecture-patterns` — preserve the existing analytics/dashboard
  service boundary and avoid introducing shared aliases or cross-module
  coupling.
- `nestjs-best-practices` — keep the change inside the existing Nest
  service helpers without provider/module wiring changes.
- `postgres-best-practices` — verify against the Json-versus-enum column
  contract (`datasetVersionIds` Json stays unknown); no schema,
  migration, transaction, RLS, or persistence change.
- `sql-optimization-patterns` — verify no query, index, or query-plan work
  is introduced by this in-memory type change.
- `javascript-testing-patterns` — rely on the existing read-mapper and
  summary Jest suites (including the coercion witnesses) as
  unchanged-outcome regression proof; no test semantics changed.
- `error-handling-patterns` — keep the deterministic mappers and existing
  not-found error paths; no new failure literal is introduced.
- `kpi-dashboard-design` — guard duty only: value-kind semantics and
  display vocabulary unchanged, so no dashboard-semantics change ships
  here.
- `data-storytelling` — guard duty only: evidence/lineage presentation
  unchanged, so no report-narrative change ships here.
- `requesting-code-review` — dispatch the mandatory structured read-only
  review with precise scope, SHAs, changed paths, and check evidence.
- `receiving-code-review` — verify reviewer claims against repository
  reality before fixes or technical pushback.
- `caveman-commit` — produce the required terse Conventional Commit
  message with a short widening-cause rationale body.

Not loaded, with reason: `security-best-practices` / `security-threat-model`
(no trust-boundary or persistence change — read-only verification against
`docs/security.md` suffices); `api-design-principles` /
`openapi-spec-generation` (contracts:check guard duty only, no public
contract change); `e2e-testing-patterns` / `playwright` (internal mappers
correctly covered below the browser layer); frontend/Tailwind/shadcn/GSAP
skills (no UI or motion).
