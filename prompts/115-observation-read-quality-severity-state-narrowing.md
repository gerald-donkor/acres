# 115 — narrow `toObservation()` quality severity/state to the closed Prisma-enum unions

## Scope, and why it is next

The committed repository is on `main` at `fcb31c3`
(`refactor(ingestion): narrow details and metadata`, the prompt 114
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 114 — which closed the last imprecise carriers in
`ParsedSourceSummary` / `ParserIssue` (`details` / `metadata` scalar records)
and completed the prompts 104–114 validator-hardening lineage.

There is no unbuilt ordered phase left. The next smallest unblocked residual is
inside Phase 8's existing deterministic-analytics requirements, on the read
path the prompts 86–100 write-side lineage deliberately left open: the
`toObservation()` quality parameter in
`server/src/analytics/analytics.service.ts` (`:109–114`) still types
`severity` and `state` as open `string`, while every authority the codebase
already states says they are closed:

- `ParsedObservation['quality'][number]` (`server/src/analytics/
analytics-publication.service.ts:26–38`) — `severity: 'info' | 'warning' |
'error'`, `state: 'valid' | 'coerced' | 'missing' | 'invalid' |
'duplicate' | 'low_confidence'` (narrowed by prompts 86–100);
- `SeedObservationQuality` (`server/src/analytics/seed/
analytics-scale-seed.types.ts:140–155`) — the identical two unions inline;
- Prisma ground truth (`server/src/generated/prisma/enums.ts:284–302`) —
  `ObservationQualitySeverity = info | warning | error`,
  `ObservationQualityState = valid | coerced | missing | invalid | duplicate |
low_confidence`;
- Prisma schema (`server/prisma/schema.prisma:813–814`) —
  `ObservationQuality.severity ObservationQualitySeverity`,
  `ObservationQuality.state ObservationQualityState` (enum columns, DB-enforced).

The gap, at `fcb31c3` (re-verify exact lines at execution):

```ts
qualities: Array<{
  severity: string; // analytics.service.ts:110
  state: string; // analytics.service.ts:111
  code: string; // stays open — see §Non-goals
  message: string; // stays open — see §Non-goals
}>;
```

against the two sibling carriers that already state the precise unions. The
repository layer (`AnalyticsRepository.findObservations` /
`findAggregateEvidence`, `analytics.repository.ts:39–90`) returns Prisma rows
whose `qualities` already carry the generated enum types, so the open `string`
parameter discards precision the database guarantees and lets any future
read-path construction with an invented severity/state string compile.

`code` and `message` are explicitly out of scope and stay `string`. The schema
leaves them open (`ObservationQuality.code String :815`,
`ObservationQuality.message String :816`), and committed fixtures prove they
are legitimately wider than the production write-side unions: the scale seed
writes `code: 'synthetic_quality_flag'` /
`message: 'Synthetic validation observation state note.'`
(`analytics-scale-seed.ts:322–330`), and `analytics.service.spec.ts` builds
qualities with `code: 'verified_source'` /
`message: 'Source row passed structural validation.'`
(`:71–74`, `:299–302`, `:557–560`). Narrowing either to
`ObservationQualityCode` / `ObservationQualityMessage` would break the seed and
the specs and is a separate policy decision, not this prompt. Severity/state
have no such counterexample: every committed fixture uses members (`'info'` /
`'valid'` in the spec, `'warning'` / `'valid'` in the seed).

Inline unions over an imported Prisma type or a shared alias is a judgement,
stated as one: both sibling carriers repeat the literals inline
(`analytics-publication.service.ts:27–34`, `analytics-scale-seed.types.ts:
144–151`), and the file under edit imports only `Prisma` as a type plus
`ApiException`, the repository, and DTO types. Mirroring the inline shape is
the smaller delta, matches the prompts 86–100 minimal-diff precedent, and
avoids coupling the read DTO mapper to the generated client import graph. A
shared severity/state alias touching all three carriers is deferred as wider
than the gap.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 8's governed metric/observation/quality outcome,
  deterministic-aggregation behavior, documentation owner, and exact phase skill
  manifest (§9); §§16–22 confirming no unbuilt ordered phase.
- `docs/analytics.md` — governed metric/observation/aggregate semantics,
  `ObservationQuality` persistence, quality-severity/state vocabulary, the
  `analytics.service.spec.ts` (19 tests) unit evidence, and the owning
  implementation record (this prompt extends the quality-carrier paragraph that
  prompts 86–100 extended).
- `docs/backend.md` — current Nest modular-monolith/server conventions and root
  build/test command ownership; no module, provider, route, or database surface
  changes in this prompt.
- `docs/security.md` — TM boundaries. This work tightens a read-mapper
  TypeScript contract; it does not add or move a trust boundary, persist new
  data, or change an envelope.
- `server/src/analytics/analytics.service.ts` — `toObservation()` quality
  parameter (`:109–114`), the only open severity/state site in this file;
  `toMetric` (`:178–190`), `toAggregate` (`:140–158`), and `valueOf` are
  read-only context. Re-read at execution and resolve current line numbers
  rather than editing from this snapshot.
- `server/src/analytics/analytics-publication.service.ts` — `ParsedObservation`
  quality carrier (`:26–38`) as the write-side closed-union precedent; `publish()`
  `observationQuality.createMany` mapping (`:219–231`) proving the durable
  column receives the same vocabulary. Read-only; unchanged.
- `server/src/analytics/seed/analytics-scale-seed.types.ts` —
  `SeedObservationQuality` (`:140–155`) as the second closed-union precedent.
  Read-only; unchanged.
- `server/src/generated/prisma/enums.ts` — `ObservationQualitySeverity`
  (`:284–290`) and `ObservationQualityState` (`:293–302`) generated unions.
  Read-only; regenerated, never hand-edited.
- `server/prisma/schema.prisma` — `model ObservationQuality` (`:809–817`):
  enum severity/state (`:813–814`) versus open `code`/`message` (`:815–816`).
  Read-only; no migration.
- `server/src/analytics/analytics.repository.ts` — `findObservations`
  (`:39–52`) and `findAggregateEvidence` (`:72–90`) returning Prisma rows with
  enum-typed qualities into `toObservation`. Read-only; unchanged.
- `server/src/analytics/analytics.service.spec.ts` — quality fixtures
  (`:71–74`, `:299–302`, `:557–560`): severity/state members plus synthetic
  code/message proving code/message must stay open. Re-read at execution; if any
  fixture uses a severity/state outside the six-plus-three literals, stop per
  §Rollback.
- `server/src/analytics/seed/analytics-scale-seed.ts` — synthetic quality push
  (`:321–330`): `severity: 'warning'`, `state: 'valid'` (members) with synthetic
  code/message (out of scope). Read-only; unchanged.
- `server/src/analytics/analytics-publication.service.spec.ts` (resolve exact
  name at execution) — write-side quality regression evidence; unchanged.
- `prompts/100-parsed-observation-quality-code-narrowing.md` — the closing
  lineage prompt (carrier-code narrowing, non-goals scoping, checks shape) this
  prompt mirrors for the read side.
- `prompts/114-parser-details-metadata-value-narrowing.md` — immediately prior
  prompt and the deferral note naming the `toObservation()` open strings as a
  Phase 8/9-scoped follow-up; this prompt takes only severity/state and leaves
  code/message open for the reasons above.

No visual reference is applicable. This is an internal server-only type
contract change, so the design-system PDF, landing-page PNGs, and recorded
chrome flows provide no evidence and must not be opened or cited as if they
did.

## Measurements and verified invariants

These are code-derived constraints at `fcb31c3`; re-verify them before editing:

1. Exactly one open severity/state site on this read path: `toObservation()`
   `qualities` (`severity: string`, `state: string`). Re-run the grep
   (`severity: string|state: string`) over `server/src/analytics/` at execution
   and confirm no second site appeared. `toMetric`/`toAggregate` open strings
   (`valueType`, `status`, `aggregateType`) are different carriers, explicitly
   out of scope.
2. The closed vocabulary is exactly three severities and six states, byte-for-
   byte identical across `analytics-publication.service.ts:27–34`,
   `analytics-scale-seed.types.ts:144–151`, `enums.ts:284–302`, and
   `schema.prisma:1146–1159`. If any of the four disagrees at execution, stop
   and report it rather than picking a winner silently.
3. `code: string` / `message: string` stay open in `toObservation()`. Re-grep
   the two synthetic witnesses at execution (seed `:322–330`, spec `:71–74`);
   if either is gone or now uses a production literal, record it — the
   out-of-scope justification must be re-checked, not assumed.
4. All committed `toObservation()` quality fixtures use severity/state members.
   Re-grep `severity:` / `state:` literals in `analytics.service.spec.ts` at
   execution; if any value falls outside the nine literals, stop and report it
   rather than widening scope or rewriting test semantics.
5. Prisma is the caller: `listObservations` (`:35–47`) and
   `getAggregateEvidence` (`:63–90`) map repository rows (enum-typed qualities)
   through `toObservation`. Narrowing the parameter from `string` to the enum
   union admits every value Prisma can produce; no cast, validator, or
   repository change is needed. If typecheck disagrees at execution, restore
   and report rather than adding a cast helper.
6. No runtime value moves: severity/state strings flow through unchanged
   (`quality: observation.qualities.map(...)` `:130–135` stays byte-for-byte
   except types). A test that changes outcome (not just compilation) after this
   edit disproves the premise — stop and report it.
7. `ObservationQuality.details` (`Json?`), `dimensions`, `qualitySummary`, and
   every Prisma model, migration, RLS policy, index, and query stay untouched.
8. There is no established negative-type-test pattern in this repository
   (verified through prompt 114: zero `ts-expect-error` / `expectTypeOf` uses
   in `server/src`, `client/`, `packages/shared/src`). Do not invent one; the
   gate is `npm run typecheck` plus unchanged runtime suites.

The required type shape mirrors the sibling carriers exactly:

```ts
qualities: Array<{
  severity: "info" | "warning" | "error";
  state:
    | "valid"
    | "coerced"
    | "missing"
    | "invalid"
    | "duplicate"
    | "low_confidence";
  code: string;
  message: string;
}>;
```

Do not introduce a shared alias, a Prisma-enum import, a code/message union, a
new literal, a validator, or a per-value branch.

## Expected impact

- Routes changed: none.
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none (runtime
  values identical; severity/state strings already constrained by DB enums).
- Database schema, Prisma models, migrations, RLS, queries, indexes, queues,
  and persisted-data formats changed: none.
- Runtime mapper behavior: unchanged — every observation accepted today maps to
  the identical response object; every error path (`Metric not found.`,
  `Aggregate not found.`) behaves exactly as today.
- Compile-time contract: `toObservation()` no longer admits an invented
  severity/state string at construction. Prisma rows, spec fixtures, and seed
  rows (all members) compile unchanged.
- Logging/observability: unchanged; no quality material is logged.
- Threat model: no new boundary and no risk reclassification. The change adds a
  concrete read-mapper type-contract detail under the existing Phase 8
  deterministic-analytics behavior.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and every
   skill named in `## SKILLS USED`. Confirm `git status --short` before editing;
   preserve any unrelated user changes and stop if they overlap an approved
   path. Confirm `HEAD` is `fcb31c3` (or record the actual SHA and adjust
   `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–4 at execution: re-run the
   `severity: string|state: string` grep over `server/src/analytics/`, diff the
   four vocabulary authorities (publication carrier, seed type, generated enums,
   schema enums), re-grep the synthetic code/message witnesses, and re-grep
   spec severity/state literals. If a non-member severity/state, a vocabulary
   disagreement, or a vanished synthetic witness appears, stop and report it
   rather than silently widening scope.
3. In `server/src/analytics/analytics.service.ts`, change only the two field
   types inside the `toObservation()` `qualities` parameter:
   - `severity: string` →
     `severity: 'info' | 'warning' | 'error'`;
   - `state: string` →
     `state: 'valid' | 'coerced' | 'missing' | 'invalid' | 'duplicate' |
'low_confidence'`;
   - leave `code: string`, `message: string`, every other `toObservation`
     field, `toAggregate`, `toMetric`, `valueOf`, `decimalValueToString`, and
     all service methods byte-for-byte unchanged. Do not add an import, alias,
     cast, or validator.
4. Make no other production edit: no repository, DTO, controller, resolver,
   Prisma schema, migration, seed, or client change. If typecheck demands more
   than this two-field edit, restore and report rather than expanding scope.
5. Run focused regression suites for the read mapper and the write-side carrier
   it mirrors. If any valid observation maps to a different response shape,
   value, or key order, stop and report the exact fixture — a type-only change
   must not alter runtime output.
6. Run `npm run contracts:check` and verify no generated REST/OpenAPI/GraphQL
   artifact changes. This internal read-mapper contract change must not alter a
   public contract snapshot.
7. Update `docs/analytics.md` in the quality-carrier paragraph that prompts
   86–100 extended. Record that `toObservation()` quality severity/state are
   typed as the closed Prisma-enum unions, matching `ParsedObservation`,
   `SeedObservationQuality`, and the `ObservationQuality` enum columns; that
   `code`/`message` deliberately stay `string` because the schema leaves them
   open and committed seed/spec fixtures carry synthetic values; and that no
   runtime mapping, rejection, or response shape changed.
8. Inspect the complete diff, run every check below, and quote real exit status
   plus meaningful test/build totals. Fix issues before review.
9. Run the mandatory two-stage review loop:
   - dispatch a read-only reviewer subagent with `requesting-code-review`, this
     prompt path, `BASE_SHA=fcb31c3` (or the recorded actual HEAD), the
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
    - `prompts/115-observation-read-quality-severity-state-narrowing.md`;
    - `docs/analytics.md`;
    - `server/src/analytics/analytics.service.ts`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend, or
      push. Use a terse Conventional Commit subject and include a short body
      explaining the read-mapper type-contract reason because it is not obvious
      from the subject alone.

## Non-goals

- No narrowing of `toObservation()` quality `code` / `message`: schema keeps
  them `String` and committed seed/spec fixtures carry synthetic values
  outside the production write-side unions. A separate policy prompt owns any
  code/message taxonomy change.
- No changes to `toMetric` (`valueType`, `status`, `calculationVersion`) or
  `toAggregate` (`aggregateType`) open strings — different carriers, separate
  prompts.
- No shared severity/state alias, Prisma-enum import, key blocklist/allowlist,
  per-value branching, validator, cast helper, or literal addition.
- No changes to `ParsedObservation`, `SeedObservationQuality`, generated
  Prisma enums, `AnalyticsRepository`, DTOs, controllers, resolvers, seeds, or
  specs; in case of a focused valid-fixture contradiction, stop instead of
  expanding scope.
- No schema migration, SQL, Prisma repository, RLS, index, tenant, worker
  queue, storage, upload, route, API contract, client, design, accessibility,
  motion, or browser work.
- No new test cases and no invented negative-type-test pattern
  (`ts-expect-error` / `expectTypeOf` have zero uses in this repository); no
  general mapper refactor or unrelated cleanup.

## Reference deltas

No visual delta. The deliberate static delta is limited to the read-mapper
TypeScript contract: invented `severity` / `state` strings no longer construct
the `toObservation()` quality parameter at compile time. Runtime acceptance,
mapped output, key order, enum-column contents, and every error path are
observably identical before and after.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this internal server type-contract change.

## Checks to run, and the owning doc

```bash
# Focused read-mapper and write-carrier regression (must pass unchanged)
npm --workspace=@acres/server test -- analytics.service.spec.ts

# Write-side carrier compatibility (closest current equivalent if renamed)
npm --workspace=@acres/server test -- analytics-publication.service.spec.ts

# Public contracts must remain unchanged
npm run contracts:check

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/115-observation-read-quality-severity-state-narrowing.md \
  docs/analytics.md \
  server/src/analytics/analytics.service.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/115-observation-read-quality-severity-state-narrowing.md \
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

- the `severity: string|state: string` grep shows other than the single
  `toObservation()` site at execution time;
- the four vocabulary authorities disagree on the nine literals;
- any committed spec or seed severity/state falls outside the nine literals;
- the synthetic code/message witnesses are gone or now use production
  literals (the out-of-scope justification must be re-proved);
- an existing test changes outcome (not just compilation) after the edit;
- a public contract snapshot changes;
- the fix requires a new literal, validator, cast, alias, import, error
  code/message, schema change, repository rewrite, or spec/seed rewrite.

Report the contradictory evidence and prepare a separate prompt rather than
silently changing the premise.

## Completion criteria

- `toObservation()` quality `severity` accepts only the three Prisma-enum
  literals at compile time.
- `toObservation()` quality `state` accepts only the six Prisma-enum literals
  at compile time.
- `code` / `message` remain open `string`, with seed/spec synthetic witnesses
  recorded.
- Every other `toObservation` field, `toAggregate`, `toMetric`, repository,
  schema, seed, and spec is byte-for-byte equivalent in behavior.
- Current analytics read-mapper and write-carrier tests pass with identical
  outcomes.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all verified
  blocking/important findings are fixed and re-tested.
- `docs/analytics.md` records the read-side severity/state invariant and the
  deliberate code/message openness.
- Only the approved paths are committed locally to `main`; nothing is pushed.

## SKILLS USED

- `architecture-patterns` — preserve the existing analytics service/repository
  boundary and avoid introducing shared aliases or cross-module coupling.
- `nestjs-best-practices` — keep the change inside the existing Nest analytics
  service mapper without provider/module wiring changes.
- `postgres-best-practices` — verify against the `ObservationQuality`
  enum-versus-`String` column contract; no schema, migration, transaction, RLS,
  or persistence change.
- `sql-optimization-patterns` — verify no query, index, or query-plan work is
  introduced by this in-memory type change.
- `javascript-testing-patterns` — rely on the existing read-mapper and
  write-carrier Jest suites as unchanged-outcome regression proof; no test
  semantics changed.
- `error-handling-patterns` — keep the deterministic mapper and existing
  not-found error paths; no new failure literal is introduced.
- `kpi-dashboard-design` — guard duty only: metric/quality semantics and display
  vocabulary unchanged, so no dashboard-semantics change ships here.
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
