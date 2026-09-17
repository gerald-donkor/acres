# 130 — narrow seed `checksumAlgorithm` carriers to `'sha256'`

## Scope, and why it is next

The committed repository is on `main` at `aab2dd1`
(`refactor(uploads): narrow method checksum literals`, the prompt 129
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 129 — which closed the last open `string` carriers on the Phase 6
signed-upload/download product contract (four annotations in
`packages/shared/src/uploads.ts`, unchanged producers and consumers, no
runtime change).

There is no unbuilt ordered phase left. Prompt 129 explicitly deferred one
remainder in its own text: "Leaving `analytics-scale-seed.types.ts:51,64`
(`readonly checksumAlgorithm: string`) open is a judgement, stated as one:
seed scaffolding is not the product contract, and every seed writer already
emits the member literal — narrowing the product contract needs no seed
edit, and seed-type hygiene is a separate decision, explicitly out of
scope." A repo-wide grep over `server/src/analytics/seed/` this session
proves that deferred remainder is exactly two open carriers with a closed
single-literal vocabulary already stated by every writer:

```ts
// server/src/analytics/seed/analytics-scale-seed.types.ts — OPEN (both)
export interface SeedStoredObject {
  // ...
  readonly checksumAlgorithm: string; // ← open (:51; 'sha256', see below)
  // ...
}

export interface SeedUpload {
  // ...
  readonly checksumAlgorithm: string; // ← open (:64; 'sha256', see below)
  // ...
}
```

against the writers that already state the closed vocabulary — all four
`checksumAlgorithm` writes in the seed builder are the literal `'sha256'`:

- `server/src/analytics/seed/analytics-scale-seed.ts:183` — primary-loop
  `storedObjects.push` (`SeedStoredObject`);
- `server/src/analytics/seed/analytics-scale-seed.ts:198` — primary-loop
  `uploads.push` (`SeedUpload`);
- `server/src/analytics/seed/analytics-scale-seed.ts:420` — secondary
  `storedObjects.push` (`SeedStoredObject`);
- `server/src/analytics/seed/analytics-scale-seed.ts:435` — secondary
  `uploads.push` (`SeedUpload`).

No other code constructs these two interfaces (the grep returns only the
type declarations, the four writer sites above, the `DeterministicSeedPlan`
`storedObjects`/`uploads` array fields (`types.ts:201–202`), the builder's
typed accumulators (`analytics-scale-seed.ts:149–150`), and the
`check-analytics-plans.ts` type-only import). Every consumer passes the
values through unchanged into Prisma `String` columns:

- `analytics-scale-seed.ts:735` — `tx.storedObject.create({ data: obj })`;
- `analytics-scale-seed.ts:739` — `tx.upload.create({ data: up })`.

The narrowed `'sha256'` literal remains assignable to the Prisma `String`
fields with both call sites byte-for-byte unchanged — the downstream
assignability proof. The product contract narrowed by prompt 129
(`packages/shared/src/uploads.ts`) is a read-only witness here, already
closed and unchanged: this prompt makes the seed scaffolding consistent
with the established `'sha256'` precedent rather than inventing a new
shape.

This is the direct continuation of prompts 119–129, and it mirrors prompt
129 most closely (single-literal narrowing where literal-typed writers make
the union admission-free, consumers compile unchanged, no runtime change)
— applied to the two seed carriers prompt 129 deferred by name. It closes
the last known `'sha256'`-vocabulary remainder rather than leaving a
recorded deferral open. Parent phase: **Phase 8** (the deterministic scale
seed harness lives in `server/src/analytics/seed/` and was added as Phase 8
evidence; the `'sha256'` vocabulary itself is the Phase 6 upload-integrity
value narrowed on the product contract in prompt 129).

Narrowing both carriers in the one seed types file in a single prompt,
even though `SeedStoredObject` (stored-object row shape) and `SeedUpload`
(upload row shape) are different interfaces, is a judgement, stated as
one: the two annotations are adjacent shapes in one scaffolding file
(`analytics-scale-seed.types.ts:51,64`), each admits exactly the literal
already stated by its writers, and splitting them would produce two
prompts editing the same file with the same gates and the same
no-runtime-change proof. No builder, persistence, plan, evaluation,
contract, or test logic is added, removed, or edited — the types file is
the only production edit.

Leaving `mediaType` / `declaredMediaType` open in both interfaces is a
judgement, stated as one: accepted media types are a runtime operator
allowlist, not a closed TypeScript vocabulary — the writers happen to
emit `'text/csv'` today, but no port-type or service-literal authority
states the set the way the storage port states `'PUT'` / `'GET'`, and
narrowing it would invent a contract — forbidden by §10. The same holds
for filenames, buckets, keys, hex digests, ids, and timestamps.

Leaving `progressStage: string` (`types.ts:67`) open is a judgement,
stated as one: the writers emit `'complete'` today, but the stage is a
free-form progress carrier with no closed authority in the seed module,
and prompt 123 deliberately left the product `progress.stage` open on the
same reasoning. This prompt does not relitigate that decision.

Leaving `SeedObservationQuality.code` / `message` open is a judgement,
stated as one: quality carriers are deliberately open per prompts 86/100
(write unions) and 115 (read narrowing); seed scaffolding does not get a
tighter vocabulary than the product analytics contract it feeds.

Leaving the Prisma `String` columns open (`StoredObject` /
`Upload` `checksumAlgorithm`) is a judgement, stated as one: no migration
is in scope, and the narrowing claims only that the seed builder's
produced plans carry this literal — not that the column is an enum. The
persistence calls (`:735`, `:739`) pass the typed objects straight into
`create({ data })` and must compile unchanged.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 8 metrics/analytics outcome and exact phase
  skill manifest (§9); §§16–22 confirming no unbuilt ordered phase.
- `docs/analytics.md` — the deterministic scale seed harness section
  (prompt 39 `analytics:plans` evidence, residual-gaps sandbox note). The
  owning implementation record for this prompt (seed scaffolding only).
- `docs/backend.md` — prompt 129 record (the four product-contract
  narrowings and the explicit seed-type deferral this prompt closes).
  Read-only witness; unchanged.
- `server/src/analytics/seed/analytics-scale-seed.types.ts` — the two open
  carriers (`:51`, `:64`). The only production file edited. Re-read at
  execution and resolve current line numbers rather than editing from
  this snapshot.
- `server/src/analytics/seed/analytics-scale-seed.ts` — the writer
  authorities (`:183`, `:198`, `:420`, `:435` all `'sha256'`) and the
  persistence consumers (`:735`, `:739` Prisma `create` passthroughs).
  Read-only witnesses; unchanged.
- `server/src/analytics/seed/analytics-scale-seed.spec.ts` — the
  unchanged-outcome regression scope (determinism, multi-tenant
  structure, relational integrity). Read-only witness; unchanged.
- `server/src/analytics/seed/check-analytics-plans.ts` — type-only
  consumer of the seed types. Read-only witness; unchanged.
- `packages/shared/src/uploads.ts` — the prompt 129 `'sha256'` product
  precedent this prompt makes the seed consistent with. Read-only
  witness; unchanged.
- `prompts/129-upload-method-checksum-algorithm-narrowing.md` — the
  closest lineage prompt (single-literal narrowing, literal-typed
  producers, unchanged consumers, contracts guard) and the deferral
  statement this prompt discharges.

No visual reference is applicable. This is an internal seed-scaffolding
type change, so the design-system PDF, landing-page PNGs, and recorded
chrome flows provide no evidence and must not be opened or cited as if
they did.

## Measurements and verified invariants

These are code-derived constraints at `aab2dd1`; re-verify them before editing:

1. Exactly two open seed checksum carriers: the grep over
   `server/src/analytics/seed/analytics-scale-seed.types.ts` returns
   `readonly checksumAlgorithm: string` at `:51` (`SeedStoredObject`)
   and `:64` (`SeedUpload`). Re-run at execution; if a third carrier
   appeared, stop and report it rather than silently widening scope.
2. The closed vocabulary is exactly one literal, byte-for-byte the
   writer value: `'sha256'`. All four writer sites (`:183`, `:198`,
   `:420`, `:435`) must still emit `'sha256'` at execution. If any
   writer disagrees at execution (a second algorithm, a computed value),
   stop and report it rather than picking a winner silently.
3. No other code constructs these interfaces with a non-member value:
   the consumer grep must return only the typed accumulators (`:149–
   150`), the plan assembly (`:578–579`), the persistence passthroughs
   (`:735`, `:739`), and the type-only `check-analytics-plans.ts`
   import. If a new constructor with a free-form algorithm appeared,
   record it — the target union must be re-derived, not silently
   assumed.
4. The writers and persistence calls stay byte-for-byte unchanged: the
   `'sha256'` literals are already literal-typed pushes into
   `SeedStoredObject[]` / `SeedUpload[]`, so the narrowed interfaces
   must admit them with no cast, guard, or builder edit, and the Prisma
   `create({ data })` calls must accept the narrowed objects with no
   mapping edit. If typecheck rejects an unchanged writer or an
   unchanged persistence call at execution, stop — the premise is
   disproved and the scope must be re-decided, not silently absorbed
   with a cast.
5. `mediaType` / `declaredMediaType`, filenames, buckets, keys, hex
   digests, ids, and timestamps stay open by design: operator-allowlisted
   or free-form values with no closed TS authority. Narrowing any of
   them would invent a contract.
6. `progressStage` and quality `code` / `message` stay open by design:
   free-form carriers owned by prompts 86/100/115/123. The Prisma
   `String` columns stay open by design: persistence, not a vocabulary
   carrier. `contracts:check` must report no artifact change (seed types
   are not part of the generated REST/OpenAPI/GraphQL contracts). If a
   snapshot moves, stop — a seed-type narrowing must not alter a public
   contract snapshot.
7. No runtime value moves: every built seed plan carries the identical
   algorithm as before (same pushes, same literals, same persistence).
   A seed or analytics test that changes outcome (not just compilation)
   after this edit disproves the premise — stop and report it.
8. There is no established negative-type-test pattern in this repository
   (verified through prompt 129: zero `ts-expect-error` / `expectTypeOf`
   uses in `server/src`, `client/`, `packages/shared/src`). Do not invent
   one; the gates are `npm run typecheck` (which must reject a future
   invented algorithm at these boundaries) plus the unchanged runtime
   suites.

The required shape:

```ts
// server/src/analytics/seed/analytics-scale-seed.types.ts (annotations only)
export interface SeedStoredObject {
  // ...
  readonly checksumAlgorithm: 'sha256'; // was string
  // ...
}
export interface SeedUpload {
  // ...
  readonly checksumAlgorithm: 'sha256'; // was string
  // ...
}
```

Do not introduce a shared alias, an inline union wider than the single
literal, a cast, a validator, a per-value branch, a builder edit, a
persistence edit, or a product-contract change. The writers already emit
members and the persistence calls already pass them through.

## Expected impact

- Routes changed: none (no route, guard, or envelope is touched; the
  seed harness has no HTTP surface).
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none (seed
  types are scaffolding, not part of the generated contracts; emitted
  seed plans already carry the member value; type-only narrowing cannot
  alter a snapshot).
- Database schema, Prisma models, migrations, RLS, queries, indexes,
  queues, and persisted-data formats changed: none (the `String`
  columns and every write are identical; no query text moves).
- Runtime server behavior: unchanged — every built seed plan carries
  the identical algorithm, and persistence writes identical rows.
- Compile-time contract: the two seed boundaries no longer admit an
  invented algorithm at any current or future call site. A future second
  checksum algorithm fails typecheck until the seed contract is extended
  by separate decision (writers and verification included), instead of
  compiling through `string`.
- Logging/observability: unchanged; no algorithm value is logged beyond
  existing paths.
- Threat model: no new boundary and no risk reclassification. The change
  adds one concrete seed-type detail under the existing Phase 8
  analytics boundary. Checksum binding keeps its runtime enforcement in
  the upload path; seed scaffolding typing was never an enforcement
  point and does not become one.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and
   every skill named in `## SKILLS USED`. Confirm `git status --short`
   before editing; preserve any unrelated user changes and stop if they
   overlap an approved path. Confirm `HEAD` is `aab2dd1` (or record the
   actual SHA and adjust `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–4 at execution: re-run the carrier
   grep over `analytics-scale-seed.types.ts`, re-run the writer grep
   (`checksumAlgorithm:`) over `server/src/analytics/seed/`, re-run the
   consumer grep (`SeedStoredObject|SeedUpload`) over `server/src`, and
   confirm the four writers still agree on exactly `'sha256'` and the
   persistence calls are still direct `create({ data })` passthroughs. If
   a third carrier, a second algorithm, or a constructing consumer
   appears, stop and report it rather than silently widening scope.
3. In `server/src/analytics/seed/analytics-scale-seed.types.ts`, make
   only two edits: change `readonly checksumAlgorithm: string` to
   `'sha256'` in `SeedStoredObject` and in `SeedUpload` (matching the
   repo's quote/style at execution). Leave every other line byte-for-byte
   unchanged. Do not add any export, alias, cast, or validator.
4. Make no other production edit: no builder change (writers must compile
   unchanged — that is the upstream admission proof), no persistence
   change (`create` calls must compile unchanged — that is the downstream
   assignability proof), no plan-evaluator change, no DTO, guard,
   permission, Prisma schema, migration, product-contract (`uploads.ts`
   is the untouched precedent), worker, metrics-label, or design change.
   If typecheck demands more than the two annotations, restore and report
   rather than expanding scope.
5. Run `npm run contracts:check` and verify no generated REST/OpenAPI/
   GraphQL artifact changes. This narrowing must not alter a public
   contract snapshot (seed types are outside the contracts).
6. Run the focused regression scope and verify identical outcomes:
   `npm run test --workspace=@acres/server -- src/analytics/seed`.
   All tests must pass with unchanged assertions (the builder already
   emits member literals; determinism and integrity expectations are
   value-identical). Run `npm run analytics:plans` only if local
   PostgreSQL is reachable; if it reports the documented dependency
   failure (see `docs/analytics.md` residual gaps), record that outcome
   verbatim rather than treating it as a regression or working around
   it.
7. Update `docs/analytics.md` in the seed-harness section (where the
   prompt 39 `analytics:plans` evidence lives at execution). Record that
   the two seed checksum carriers admit only `'sha256'` (writer
   authorities: the four builder push sites); that narrowing both in one
   seed types file is deliberate adjacency, not interface merging; that
   this discharges the prompt 129 deferral; that `mediaType` /
   `declaredMediaType` / names / keys / digests / ids / timestamps stay
   open (allowlist/free-form, no closed authority); that `progressStage`
   and quality carriers stay owned by prompts 86/100/115/123; that Prisma
   `String` columns are untouched with the reason; and that no built plan
   byte changed.
8. Inspect the complete diff, run every check below, and quote real exit
   status plus meaningful test/build totals. Fix issues before review.
9. Run the mandatory two-stage review loop:
   - dispatch a read-only reviewer subagent with `requesting-code-review`,
     this prompt path, `BASE_SHA=aab2dd1` (or the recorded actual HEAD),
     the working-tree diff (or implementation `HEAD_SHA` if an
     intermediate commit is explicitly required), changed paths,
     constraints, and real check outputs;
   - process every finding with `receiving-code-review`: understand and
     verify it against source and requirements before changing code; fix
     blocking and important valid findings in order, test each fix, and
     give technical pushback where evidence disproves a suggestion;
   - request follow-up review if a valid fix materially changes
     architecture, a public contract, data flow, or the trust boundary.
10. Commit locally on `main` using `caveman-commit`. Stage:
    - `prompts/130-seed-checksum-algorithm-narrowing.md`;
    - `docs/analytics.md`;
    - `server/src/analytics/seed/analytics-scale-seed.types.ts`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend,
      or push. Use a terse Conventional Commit subject and include a short
      body explaining the seed-hygiene reason, because it is not obvious
      from the subject alone.

## Non-goals

- No change to `mediaType` / `declaredMediaType` (operator allowlist, no
  closed TS authority), filenames, buckets, keys, hex digests, ids, or
  timestamps: free-form or allowlisted carriers with no closed authority;
  narrowing them would invent a contract.
- No change to `progressStage` (free-form carrier, per the prompt 123
  reasoning) or quality `code` / `message` carriers (vocabulary owned by
  prompts 86/100/115; seed scaffolding does not get a tighter vocabulary
  than the product contract it feeds).
- No change to any other seed interface (`SeedRegion`, `SeedDataset`,
  `SeedMetricDefinition`, `SeedObservationQuality`,
  `SeedMetricAggregate`, and the rest): different domains, already
  literal-typed where closed (`state`, `status`, `valueType`,
  `aggregation`) or deliberately open where free-form.
- No change to `analytics-scale-seed.ts` (writers are the admission
  witnesses; they emit members unchanged), `check-analytics-plans.ts`
  (type-only consumer), or `plan-evaluator.ts` (separate evaluation
  concern, not a checksum carrier).
- No change to `packages/shared/src/uploads.ts` (the untouched prompt
  129 precedent, not a second edit), any server upload/report/analytics
  service, or any presign/checksum-verification behavior.
- No change to Prisma `schema.prisma` (`String` columns stay; no
  migration), the analytics scale seed writers' emitted values, or any
  seed plan bytes.
- No change to AI `provider` / `model` / `promptTemplateVersion` /
  `purpose` (explicitly deferred decisions owned elsewhere, per prompt
  129), metrics `jobName` / `queueName`, audit `targetType`, or any
  id/timestamp: different domains or deliberately open carriers.
- No new shared alias, second types file, value import, inline union
  wider than the single literal, cast helper, validator, per-value
  branch, or mapping change.
- No schema migration, SQL, Prisma repository, RLS, index, tenant,
  worker queue, route, API contract, client component, design,
  accessibility, motion, or browser work.
- No new test cases and no invented negative-type-test pattern
  (`ts-expect-error` / `expectTypeOf` have zero uses in this repository);
  no general seed refactor or unrelated cleanup.

## Reference deltas

No visual delta. The deliberate static delta is limited to two
annotations in one seed-scaffolding types file: an invented algorithm no
longer reaches the seed plan boundaries at compile time. Built plans,
persisted rows, contract snapshots, and every evaluation outcome are
observably identical before and after.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this seed-scaffolding type change. No
responsive, touch-target, or reduced-motion surface moves.

## Checks to run, and the owning doc

```bash
# Public contracts must remain unchanged (seed types are outside contracts)
npm run contracts:check

# Focused regression proof: unchanged seed unit outcomes
npm run test --workspace=@acres/server -- src/analytics/seed

# Deterministic plan gate when a local database is reachable; otherwise
# record the documented dependency failure verbatim (see docs/analytics.md)
npm run analytics:plans

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/130-seed-checksum-algorithm-narrowing.md \
  docs/analytics.md \
  server/src/analytics/seed/analytics-scale-seed.types.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/130-seed-checksum-algorithm-narrowing.md \
  docs/analytics.md \
  server/src/analytics/seed/analytics-scale-seed.types.ts
```

Quote the actual exit status and meaningful test/build totals. Real
PostgreSQL E2E, spatial plan, operations-drill, and browser suites are
intentionally omitted because this scope adds no rejection path, changes
no schema/query behavior, and touches no browser journey or deployment
surface. (Typecheck across all three workspaces is the admission gate —
seed writers and Prisma persistence must both compile unchanged — plus
the unchanged seed unit suite.)

`docs/analytics.md` owns the implementation record. `docs/security.md`
and `docs/backend.md` are read-only verification for this task; update
either only if execution proves a statement materially stale, and stop
before broadening scope.

## Rollback and stop conditions

Rollback is a source/doc revert; there is no migration or persisted-data
rollback. Stop before expanding scope if any of these occur:

- the carrier grep shows other than the two known carriers at execution
  time;
- the writer grep shows a second algorithm or a computed (non-literal)
  value at any of the four sites;
- the consumer grep shows a constructing consumer with a non-member
  value (especially a new seed path building its own algorithm, or a
  second persistence path mapping the field);
- a writer no longer emits the member literal, or typecheck rejects an
  unchanged writer or an unchanged persistence call (unions diverged) —
  restore and re-decide scope rather than adding a cast, guard, mapping
  edit, or persistence edit;
- an existing seed or analytics test changes outcome (not just
  compilation) after the edit;
- a public contract snapshot changes;
- the fix requires a shared alias, a wider union, a cast, a validator, a
  per-value branch, a mapping change, an error code/message, a schema
  change, a builder rewrite, a persistence rewrite, a spec rewrite, or a
  product-contract change.

Report the contradictory evidence and prepare a separate prompt rather
than silently changing the premise.

## Completion criteria

- Both seed checksum carriers accept only `'sha256'` at compile time,
  with unchanged writers and unchanged persistence calls.
- No alias, cast, validator, or runtime edge introduced, and no new
  module created.
- The builder pushes, plan bytes, persisted rows, and all other lines
  are byte-for-byte equivalent in behavior.
- Current seed and analytics suites pass with identical results.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all
  verified blocking/important findings are fixed and re-tested.
- `docs/analytics.md` records the single-literal invariant per carrier
  with its writer authority, the narrow-both adjacency judgement, the
  prompt 129 deferral discharge, the deliberate `mediaType` / stage /
  quality / column openness with the reason for each, and the
  no-runtime-change proof.
- Only the approved paths are committed locally to `main`; nothing is
  pushed.

## SKILLS USED

- `architecture-patterns` — couple the seed types to the single writer
  literal (four builder push sites) without duplicating the literal into
  a new alias and without creating any new cross-module edge; single
  literals inline, mirroring the prompt 129 precedent.
- `nestjs-best-practices` — keep the change outside Nest provider/module
  wiring; the seed builder pushes and Prisma `create` passthroughs are
  read-only witnesses, and the edit is type annotations only.
- `api-design-principles` — guard duty only: no public route, envelope,
  or verb change; seed types are outside the generated contracts and
  `contracts:check` proves the snapshots are unchanged.
- `openapi-spec-generation` — not loaded: no REST surface changes and no
  contract artifact may move (guard duty covered by
  `api-design-principles` above).
- `postgres-best-practices` — verify no schema, migration, transaction,
  RLS, or persistence change; the `String` columns and every write are
  identical, and the narrowed literal stays assignable to them.
- `sql-optimization-patterns` — not loaded: no query, index, or
  query-plan work is introduced by this annotation-only change (guard
  duty covered by `postgres-best-practices` above).
- `security-best-practices` — guard duty only: no trust-boundary or
  persistence change; checksum binding keeps its runtime enforcement in
  the upload path; read-only verification against `docs/security.md`.
- `security-threat-model` — verify checksum binding keeps its runtime
  enforcement and seed typing was never an enforcement point; no risk
  reclassification.
- `error-handling-patterns` — keep the deterministic seed/plan failure
  paths untouched; no new failure literal is introduced.
- `javascript-testing-patterns` — rely on the existing seed unit scope
  plus the deterministic plan gate as unchanged-outcome regression
  proof; no test semantics changed.
- `e2e-testing-patterns` — guard duty only: no cross-system journey
  changes; full E2E intentionally omitted per §Checks (builders already
  emit members).
- `secrets-management` — guard duty only: checksums, digests, and ids
  are untouched; no credential surface changes.
- `requesting-code-review` — dispatch the mandatory structured read-only
  review with precise scope, SHAs, changed paths, and check evidence.
- `receiving-code-review` — verify reviewer claims against repository
  reality before fixes or technical pushback.
- `caveman-commit` — produce the required terse Conventional Commit
  message with a short seed-hygiene rationale body.

Not loaded, with reason: `playwright` (no UI or browser journey change;
persistence compiles unchanged); frontend/Tailwind/shadcn/GSAP skills (no
UI or motion).
