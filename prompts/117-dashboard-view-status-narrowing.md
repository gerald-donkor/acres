# 117 — narrow `toView()` status to the closed `DashboardViewStatus` union

## Scope, and why it is next

The committed repository is on `main` at `a56ab4e`
(`refactor(analytics): narrow metric/aggregate enums`, the prompt 116
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 116 — which closed the last open enum carriers in the Phase 8
analytics read mappers (`toObservation()` severity/state in prompt 115,
`toMetric()` value-type/aggregation/status and `toAggregate()`
aggregate-type in prompt 116).

There is no unbuilt ordered phase left. The next smallest unblocked residual is
inside Phase 9's existing saved-view requirements, on the dashboard read path
the prompts 68 and 115–116 lineage left open: `toView()` in
`server/src/dashboards/dashboards.service.ts` still types `status` as open
`string` and recovers precision with an `as` cast, while every authority the
codebase already states says it is closed:

- `DashboardViewStatus` — `active | archived`:
  `server/prisma/schema.prisma:888` (`DashboardView.status
  DashboardViewStatus @default(active)`, DB-enforced) and `:900–903`
  (`enum DashboardViewStatus { active archived }`);
- `server/src/generated/prisma/enums.ts:187–192` (generated
  `DashboardViewStatus` const + union);
- `packages/shared/src/dashboards.ts:64` (`DashboardView.status:
  'active' | 'archived'` — the public response contract is already closed);
- `docs/dashboards.md` §Schema and permissions (views carry
  "`active`/`archived` status").

The gap, at `a56ab4e` (re-verify exact lines at execution):

```ts
function toView(row: {
  // ...
  status: string; // dashboards.service.ts:202
  // ...
}) {
  return {
    // ...
    status: row.status as 'active' | 'archived', // dashboards.service.ts:214
    // ...
  };
}
```

against the sibling carriers that already state the precise union. The
repository layer (`DashboardsRepository.listViews` / `findView`,
`dashboards.repository.ts:30–44`) returns Prisma rows whose `status` already
carries the generated enum type, so the open `string` parameter discards
precision the database guarantees, and the `as` cast re-asserts without
compiler proof: any future read-path construction with an invented status
string compiles at the parameter and is only laundered at the cast.

The `archiveView` write (`data: { status: 'archived' }`, `:142`) is already a
member literal and is not touched. `createView`/`updateView` never write
`status` (Prisma default `active` applies); no write path changes.

Inline union over a Prisma-enum import or a shared indexed access is a
judgement, stated as one: prompts 115–116 mirrored the sibling carriers inline
in `analytics.service.ts` rather than importing the generated client, and the
file under edit imports only `HttpStatus`, shared dashboard types,
`ApiException`, `IdempotencyService`, the organization context,
`AnalyticsService`, and the repository. Mirroring the inline shape is the
smaller delta, matches the prompts 86–116 minimal-diff precedent, and avoids
coupling the saved-view mapper to the generated client import graph.
`DashboardView['status']` indexed access would also be exact, but it couples
the server mapper's parameter to the shared response DTO rather than to the
database authority the parameter actually receives; the inline two-member
literal names the Prisma vocabulary directly, exactly as 115/116 did. A shared
status alias touching the mapper, the shared DTO, and the spec is deferred as
wider than the gap.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 9's saved-view/dashboard outcome, behavior,
  documentation owner, and exact phase skill manifest (§10); §§16–22
  confirming no unbuilt ordered phase.
- `docs/dashboards.md` — saved-view schema/permissions (`active`/`archived`
  status), the prompt 68 `schemaVersion` paragraph (this prompt extends the
  adjacent `toView` record, not the versioning semantics), REST commands,
  the `dashboards.service.spec.ts` unit evidence, and the owning
  implementation record.
- `docs/analytics.md` — the prompt 115/116 read-side enum-narrowing paragraphs
  this prompt mirrors for the dashboard mapper; read-only context.
- `docs/backend.md` — current Nest modular-monolith/server conventions and root
  build/test command ownership; no module, provider, route, or database surface
  changes in this prompt.
- `docs/security.md` — TM boundaries. This work tightens a read-mapper
  TypeScript contract; it does not add or move a trust boundary, persist new
  data, or change an envelope.
- `server/src/dashboards/dashboards.service.ts` — `toView()` row parameter
  (`:194–205`, open `status :202`), the `as` cast (`:214`),
  `resolveSchemaVersion` (`:228–243`, read-only context),
  `archiveView` write literal (`:140–143`, read-only witness),
  `normalizeCreate` / `optionalText` (read-only context), `summary()`
  composition casts (`:162–174`, read-only, out of scope). Re-read at
  execution and resolve current line numbers rather than editing from this
  snapshot.
- `server/src/dashboards/dashboards.repository.ts` — `listViews`
  (`:30–37`, `where: { organizationId, status: 'active' }`),
  `findView` (`:39–44`, same filter) returning Prisma rows with enum-typed
  `status` into `toView`. Read-only; unchanged.
- `server/src/generated/prisma/enums.ts` — `DashboardViewStatus`
  (`:187–192`) generated const + union. Read-only; regenerated, never
  hand-edited.
- `server/prisma/schema.prisma` — `model DashboardView` (`:877–898`):
  enum `status` (`:888`) versus open `name`/`description`/`filters`/
  `presentation`; `enum DashboardViewStatus` (`:900–903`). Read-only; no
  migration.
- `packages/shared/src/dashboards.ts` — `DashboardView.status`
  (`:64`, already `'active' | 'archived'`); `DashboardMetric`
  (`:8–20`, open `valueType`/`allowedAggregation`/`status`) and
  `DashboardAggregate` (`:22–36`, open `aggregateType`) deliberately out of
  scope (separate shared-contract decision, see §Non-goals). Read-only;
  unchanged.
- `server/src/dashboards/dashboards.service.spec.ts` — view-row fixture
  (`:50–67`, `status: 'active'`), creation mocks (`:108–129`,
  `status: 'active'`), further `'active'` fixtures (`:195`, `:246`),
  status assertion (`:317`), archival write witness (`:607–610`,
  `data: { status: 'archived' }`, proving both members are committed
  vocabulary). Re-read at execution; if any fixture uses a status outside
  the two literals, stop per §Rollback.
- `prompts/116-metric-aggregate-read-enum-narrowing.md` — the closing lineage
  prompt (read-mapper enum narrowing, non-goals scoping, checks shape) this
  prompt mirrors for the dashboard mapper.
- `prompts/115-observation-read-quality-severity-state-narrowing.md` — the
  `as`-free inline-union precedent and the "no negative-type-test pattern"
  gate reused here.

No visual reference is applicable. This is an internal server-only type
contract change, so the design-system PDF, landing-page PNGs, and recorded
chrome flows provide no evidence and must not be opened or cited as if they
did.

## Measurements and verified invariants

These are code-derived constraints at `a56ab4e`; re-verify them before editing:

1. Exactly one open status site plus one status cast on this read path:
   `status: string` (`:202`) and `row.status as 'active' | 'archived'`
   (`:214`) in `server/src/dashboards/dashboards.service.ts`. Re-run the
   grep (`status: string|as 'active'`) over the file at execution and confirm
   no second site appeared. `filters`/`presentation` `as` casts (`:211–212`),
   `schemaVersion` resolver (`:213,228–243`), and `summary()` casts
   (`:164–165,168`) are different carriers, explicitly out of scope.
2. The closed vocabulary is exactly two statuses, byte-for-byte identical
   across `schema.prisma:900–903`, `enums.ts:187–192`, and
   `dashboards.ts:64`. If the three authorities disagree at execution, stop
   and report it rather than picking a winner silently.
3. Prisma is the caller: `listViews` (`:32–40`) and `getView` (`:42–56`) map
   repository rows (enum-typed `status`) through `toView`; `createView`
   (`:87`) and `updateView` (`:124`) map freshly written rows the same way.
   Narrowing the parameter from `string` to the two-member union admits every
   value Prisma can produce; no cast, validator, or repository change is
   needed. If typecheck disagrees at execution, restore and report rather
   than adding a cast helper.
4. All committed `toView()` fixtures use status members. Re-grep `status:`
   literals in `dashboards.service.spec.ts` at execution; if any value falls
   outside `'active' | 'archived'`, stop and report it rather than widening
   scope or rewriting test semantics. The `'archived'` witness
   (`:607–610`, the archival write assertion) is a member and must keep
   compiling.
5. No runtime value moves: `status` flows through unchanged (`status:
   row.status` stays byte-for-byte except types). A test that changes outcome
   (not just compilation) after this edit disproves the premise — stop and
   report it.
6. `schemaVersion`, `filters`, `presentation`, `name`, `description`,
   `ownerAccountId`, every `id`, every timestamp, `resolveSchemaVersion`,
   `normalizeCreate`, `optionalText`, `summary()`, and every Prisma model,
   migration, RLS policy, index, and query stay untouched.
7. `archiveView`'s `data: { status: 'archived' }` write literal stays as is;
   it is already a member, and this prompt does not restate it.
8. There is no established negative-type-test pattern in this repository
   (verified through prompt 116: zero `ts-expect-error` / `expectTypeOf`
   uses in `server/src`, `client/`, `packages/shared/src`). Do not invent
   one; the gate is `npm run typecheck` plus unchanged runtime suites.

The required type shape mirrors the sibling carriers exactly:

```ts
function toView(row: {
  // ...
  status: 'active' | 'archived';
  // ...
}) {
  return {
    // ...
    status: row.status,
    // ...
  };
}
```

Do not introduce a shared alias, a Prisma-enum import, a shared indexed
access, a validator, a per-value branch, or a new literal.

## Expected impact

- Routes changed: none.
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none (runtime
  values identical; view status strings already constrained by the DB enum
  and already closed in the shared `DashboardView` DTO).
- Database schema, Prisma models, migrations, RLS, queries, indexes, queues,
  and persisted-data formats changed: none.
- Runtime mapper behavior: unchanged — every saved view accepted today maps
  to the identical response object; every error path (`Dashboard view not
  found.`, `INTERNAL_ERROR` on unsupported schema versions) behaves exactly
  as today.
- Compile-time contract: `toView()` no longer admits an invented status
  string at construction, and no longer launders one through `as`. Prisma
  rows, spec fixtures, and the archival write witness (all members) compile
  unchanged.
- Logging/observability: unchanged; no view metadata is logged.
- Threat model: no new boundary and no risk reclassification. The change adds
  a concrete read-mapper type-contract detail under the existing Phase 9
  saved-view behavior.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and every
   skill named in `## SKILLS USED`. Confirm `git status --short` before editing;
   preserve any unrelated user changes and stop if they overlap an approved
   path. Confirm `HEAD` is `a56ab4e` (or record the actual SHA and adjust
   `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–4 at execution: re-run the
   `status: string|as 'active'` grep over
   `server/src/dashboards/dashboards.service.ts`, diff the three vocabulary
   authorities (schema enum, generated enums, shared DTO), confirm Prisma is
   the only caller with enum-typed rows, and re-grep fixture literals across
   `dashboards.service.spec.ts`. If a non-member status, a vocabulary
   disagreement, or a second open site appears, stop and report it rather
   than silently widening scope.
3. In `server/src/dashboards/dashboards.service.ts`, change only the status
   carrier:
   - `toView()`: `status: string` → `status: 'active' | 'archived'`;
   - `toView()`: `status: row.status as 'active' | 'archived'` →
     `status: row.status`;
   - leave `filters`, `presentation`, `schemaVersion`, `name`,
     `description`, `ownerAccountId`, every `id`, every timestamp,
     `resolveSchemaVersion`, `normalizeCreate`, `optionalText`, `summary()`,
     and all service methods byte-for-byte unchanged. Do not add an import,
     alias, cast, or validator.
4. Make no other production edit: no repository, DTO, controller, resolver,
   Prisma schema, migration, seed, spec, shared-contract, or client change.
   If typecheck demands more than this two-line edit, restore and report
   rather than expanding scope.
5. Run the focused saved-view regression suite. If any valid view maps to a
   different response shape, value, or key order, stop and report the exact
   fixture — a type-only change must not alter runtime output.
6. Run `npm run contracts:check` and verify no generated REST/OpenAPI/GraphQL
   artifact changes. This internal read-mapper contract change must not alter
   a public contract snapshot.
7. Update `docs/dashboards.md` in the Schema and permissions paragraph that
   states views carry "`active`/`archived` status". Record that `toView()`
   `status` is typed as the closed `DashboardViewStatus` union, matching the
   schema enum, generated enums, and shared `DashboardView`; that the `as`
   cast is removed because Prisma rows already carry the enum; that
   `filters`/`presentation`/`schemaVersion` carriers are unchanged (prompt 68
   owns versioning); and that no runtime mapping, rejection, or response
   shape changed.
8. Inspect the complete diff, run every check below, and quote real exit status
   plus meaningful test/build totals. Fix issues before review.
9. Run the mandatory two-stage review loop:
   - dispatch a read-only reviewer subagent with `requesting-code-review`, this
     prompt path, `BASE_SHA=a56ab4e` (or the recorded actual HEAD), the
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
    - `prompts/117-dashboard-view-status-narrowing.md`;
    - `docs/dashboards.md`;
    - `server/src/dashboards/dashboards.service.ts`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend, or
      push. Use a terse Conventional Commit subject and include a short body
      explaining the read-mapper type-contract reason because it is not obvious
      from the subject alone.

## Non-goals

- No narrowing of shared `DashboardMetric` (`valueType` /
  `allowedAggregation` / `status`, `dashboards.ts:13–17`) or
  `DashboardAggregate` (`aggregateType`, `:27`): open shared-contract text
  with client/GraphQL consumers; a separate shared-contract prompt owns any
  change there.
- No changes to `toView()` `filters` / `presentation` casts or
  `resolveSchemaVersion`: JSON/shape carriers owned by prompt 68 versioning
  policy; not revisited here.
- No changes to `summary()` casts (`MetricValueKind`, `string[]`): aggregate
  evidence carriers, separate prompts.
- No change to the `archiveView` write literal, `createView`/`updateView`
  writes, `DashboardsRepository`, DTOs, controllers, resolvers, seeds, or
  specs; in case of a focused valid-fixture contradiction, stop instead of
  expanding scope.
- No shared alias, Prisma-enum import, shared indexed access, key
  blocklist/allowlist, per-value branching, validator, cast helper, or
  literal addition.
- No schema migration, SQL, Prisma repository, RLS, index, tenant, worker
  queue, storage, upload, route, API contract, client, design, accessibility,
  motion, or browser work.
- No new test cases and no invented negative-type-test pattern
  (`ts-expect-error` / `expectTypeOf` have zero uses in this repository); no
  general mapper refactor or unrelated cleanup.

## Reference deltas

No visual delta. The deliberate static delta is limited to the read-mapper
TypeScript contract: an invented view `status` string no longer constructs
`toView()` at compile time, and the `as 'active' | 'archived'` laundering
cast is removed. Runtime acceptance, mapped output, key order, enum-column
contents, and every error path are observably identical before and after.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this internal server type-contract change.

## Checks to run, and the owning doc

```bash
# Focused saved-view regression (must pass unchanged)
npm --workspace=@acres/server test -- dashboards.service.spec.ts

# Public contracts must remain unchanged
npm run contracts:check

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/117-dashboard-view-status-narrowing.md \
  docs/dashboards.md \
  server/src/dashboards/dashboards.service.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/117-dashboard-view-status-narrowing.md \
  docs/dashboards.md \
  server/src/dashboards/dashboards.service.ts
```

Quote the actual exit status and meaningful Jest/build totals. If a named spec
does not exist at execution time, locate the closest current equivalent with
`rg --files server/src/dashboards`, run it, and record that evidence instead of
claiming a nonexistent check. Browser E2E, real PostgreSQL, spatial plan, and
operations-drill suites are intentionally omitted because this scope adds no
rejection path, changes no schema/query behavior, and touches no browser
journey or deployment surface.

`docs/dashboards.md` owns the implementation record. `docs/security.md` and
`docs/backend.md` are read-only verification for this task; update either only
if execution proves a statement materially stale, and stop before broadening
scope.

## Rollback and stop conditions

Rollback is a source/test/doc revert; there is no migration or persisted-data
rollback. Stop before expanding scope if any of these occur:

- the `status: string|as 'active'` grep shows other than the single `toView()`
  parameter plus its cast at execution time;
- the three vocabulary authorities disagree on the two literals, or a fixture
  contains a status outside them;
- an existing test changes outcome (not just compilation) after the edit;
- a public contract snapshot changes;
- the fix requires a new literal, validator, cast, alias, import, error
  code/message, schema change, repository rewrite, shared-contract edit, or
  spec/seed rewrite.

Report the contradictory evidence and prepare a separate prompt rather than
silently changing the premise.

## Completion criteria

- `toView()` `status` accepts only the two `DashboardViewStatus` literals at
  compile time.
- The `as 'active' | 'archived'` cast is gone; `status` flows through as
  `row.status`.
- `filters`, `presentation`, `schemaVersion`, and every other `toView` field,
  repository, schema, shared DTO, seed, and spec is byte-for-byte equivalent
  in behavior.
- Current saved-view tests pass with identical outcomes.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all verified
  blocking/important findings are fixed and re-tested.
- `docs/dashboards.md` records the `toView()` status invariant and the removed
  cast.
- Only the approved paths are committed locally to `main`; nothing is pushed.

## SKILLS USED

- `architecture-patterns` — preserve the existing dashboard service/repository
  boundary and avoid introducing shared aliases or cross-module coupling.
- `nestjs-best-practices` — keep the change inside the existing Nest dashboard
  service mapper without provider/module wiring changes.
- `postgres-best-practices` — verify against the `DashboardView` enum-versus-
  open-text column contract; no schema, migration, transaction, RLS, or
  persistence change.
- `sql-optimization-patterns` — verify no query, index, or query-plan work is
  introduced by this in-memory type change.
- `javascript-testing-patterns` — rely on the existing saved-view Jest suite
  as unchanged-outcome regression proof; no test semantics changed.
- `error-handling-patterns` — keep the deterministic mapper and existing
  not-found/schema-version error paths; no new failure literal is introduced.
- `kpi-dashboard-design` — guard duty only: saved-view status semantics and
  display vocabulary unchanged, so no dashboard-semantics change ships here.
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
change); `e2e-testing-patterns` / `playwright` (internal mapper correctly
covered below the browser layer); frontend/Tailwind/shadcn/GSAP skills (no UI
or motion).
