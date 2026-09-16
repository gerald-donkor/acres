# 120 — narrow `toDatasetSummary()` / `toVersionSummary()` / `toMappingSummary()` / `toRunSummary()` read enums to the closed Prisma unions

## Scope, and why it is next

The committed repository is on `main` at `b285027`
(`refactor(shared): narrow dashboard metric unions`, the prompt 119
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 119 — which closed the last open shared-contract carriers on the Phase
8/9 read path (`DashboardMetric.valueType` / `allowedAggregation` / `status`
and `DashboardAggregate.aggregateType` in `packages/shared/src/dashboards.ts`,
plus the nine stale `"mean"` / metric-`"published"` mock literals).

There is no unbuilt ordered phase left. The next smallest unblocked residual is
inside Phase 7's existing geography/ingestion requirements, on the read file
prompts 115–119 never touched and explicitly left open: the four private
read mappers in `server/src/ingestion/ingestion.service.ts` still type five
enum-backed fields as open `string`, while every authority the codebase already
states says they are closed:

- `DatasetState` — `draft | active | archived`:
  `server/prisma/schema.prisma:711–715`,
  `server/src/generated/prisma/enums.ts:128–134`,
  (`Dataset.state DatasetState :573`, DB-enforced);
- `DatasetPublicationStatus` — `published` (single member):
  `server/prisma/schema.prisma:717–719`,
  `server/src/generated/prisma/enums.ts:137–141`,
  (`DatasetVersion.publicationStatus DatasetPublicationStatus :595`, DB-enforced);
- `MappingValidationStatus` — `pending | valid | invalid`:
  `server/prisma/schema.prisma:721–725`,
  `server/src/generated/prisma/enums.ts:144–150`,
  (`ColumnMapping.validationStatus MappingValidationStatus :624`, DB-enforced);
- `IngestionRunState` — `queued | running | validation_failed | published | failed | cancelling | cancelled` (seven members):
  `server/prisma/schema.prisma:727–735`,
  `server/src/generated/prisma/enums.ts:153–163`,
  (`IngestionRun.state IngestionRunState :647`, DB-enforced);
- `IngestionRunStage` — `inspect | parse | map | validate | publish | complete` (six members):
  `server/prisma/schema.prisma:737–744`,
  `server/src/generated/prisma/enums.ts:166–175`
  (`IngestionRun.stage IngestionRunStage`, DB-enforced — re-verify the exact
  column line at execution).

The gap, at `b285027` (re-verify exact lines at execution):

```ts
// server/src/ingestion/ingestion.service.ts:424–439
private toDatasetSummary(dataset: {
  // ...
  state: string; // ← open (DatasetState)
  versions?: Array<{
    // ...
    publicationStatus: string; // ← open (DatasetPublicationStatus)
  }>;
}): DatasetSummary

// server/src/ingestion/ingestion.service.ts:453–460
private toVersionSummary(version: {
  // ...
  publicationStatus: string; // ← open (DatasetPublicationStatus)
}): DatasetVersionSummary

// server/src/ingestion/ingestion.service.ts:471–478
private toMappingSummary(mapping: {
  // ...
  validationStatus: string; // ← open (MappingValidationStatus)
}): MappingSummary

// server/src/ingestion/ingestion.service.ts:489–503
private toRunSummary(run: {
  // ...
  state: string; // ← open (IngestionRunState, seven members)
  stage: string; // ← open (IngestionRunStage, six members)
}): IngestionRunSummary
```

against the sibling carriers that already state the precise unions. The
repository layer (`tx.dataset.findMany` / `tx.datasetVersion` /
`tx.columnMapping` / `tx.ingestionRun` inside `IngestionService.listDatasets`
/ `getDataset` / `listMappings` / `listRuns` / `getRun` / `cancelRun`)
returns Prisma rows whose `state`, `publicationStatus`, `validationStatus`,
and `stage` already carry the generated enum types, so the open `string`
parameters discard precision the database guarantees and let any future
read-path construction with an invented dataset state, publication status,
validation status, run state, or stage string compile.

This is the direct Phase 7 analogue of prompts 115–117 (which narrowed
`toObservation()` severity/state, `toMetric()` / `toAggregate()` value-type /
aggregation / status, and `toView()` status with inline unions and no runtime
change). Shared `packages/shared/src/ingestion.ts` stays open `string` here
by explicit policy — the separate shared-contract decision owns it (the same
split prompts 115–117 kept before prompt 119 closed the dashboard shared
contract).

Inline unions over an imported Prisma enum or a shared alias is a judgement,
stated as one: prompts 115–116 mirrored the sibling carriers inline in the
service rather than importing the generated client, and the ingestion service
imports only `type { Prisma }` from the generated client today. Mirroring the
identical inline shapes is the smaller delta, matches the prompts 86–119
minimal-diff precedent, avoids coupling the service to the generated-enum
import graph, and keeps the mapper signatures self-describing. A
generated-enum import or a shared alias touching `ingestion.ts`,
`uploads.service.ts`, the processor spec mock, and all mappers is deferred as
wider than the gap.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 7 geography/ingestion outcome and exact phase
  skill manifest (§8); Phase 8/9 narrowing precedent (§§9–10); §§16–22
  confirming no unbuilt ordered phase.
- `docs/ingestion.md` — full file (507 lines): hierarchy/source/code/alias
  schema, dataset/version/mapping/run/issue staging, parser adapters, worker
  publication flow, REST routes, and the residual-gaps section this prompt
  narrows (not closes — provider/precedence/refresh policy stays future).
- `docs/analytics.md` — the prompt 115/116 read-side narrowing paragraphs
  this prompt mirrors for the ingestion read path; read-only context.
- `docs/dashboards.md` — the prompt 117 `toView()` status paragraph and the
  prompt 119 shared-narrowing paragraph; the inline-union precedent and the
  server-first / shared-second split this prompt follows.
- `docs/backend.md` — current Nest modular-monolith/server conventions and
  root build/test command ownership; no module, provider, route, or database
  surface changes in this prompt.
- `docs/security.md` — TM boundaries. This work tightens private read-mapper
  parameter contracts; it does not add or move a trust boundary, persist new
  data, or change an envelope.
- `server/prisma/schema.prisma` — `enum DatasetState` (`:711–715`), `enum
DatasetPublicationStatus` (`:717–719`), `enum MappingValidationStatus`
  (`:721–725`), `enum IngestionRunState` (`:727–735`), `enum
IngestionRunStage` (`:737–744`), `enum ValidationIssueSeverity`
  (`:746–750`), plus the column bindings (`Dataset.state :573`,
  `DatasetVersion.publicationStatus :595`, `ColumnMapping.validationStatus
:624`, `IngestionRun.state :647`, `IngestionRun.stage` — resolve the exact
  stage column line at execution). Read-only; no migration.
- `server/src/generated/prisma/enums.ts` — `DatasetState` (`:128–134`),
  `DatasetPublicationStatus` (`:137–141`), `MappingValidationStatus`
  (`:144–150`), `IngestionRunState` (`:153–163`), `IngestionRunStage`
  (`:166–175`), `ValidationIssueSeverity` (`:178–184`). Read-only;
  regenerated, never hand-edited.
- `server/src/ingestion/ingestion.service.ts` — `toDatasetSummary`
  (`:424–451`, two open fields), `toVersionSummary` (`:453–469`, one open
  field), `toMappingSummary` (`:471–487`, one open field), `toRunSummary`
  (`:489–521`, two open fields plus pass-through `failureCode` /
  `failureMessage`), `listIssues` (`:310–339`, inline Prisma-row map with no
  open param — read-only witness, unchanged). Re-read at execution and
  resolve current line numbers rather than editing from this snapshot.
- `server/src/ingestion/ingestion-processor.service.spec.ts` — `StoredRun`
  test-local mock (`:20–36`, `state: string :23`), run literals (`:57`
  `'queued'`, `:230–231` / `:269–270` / `:305–306` `'validation_failed'` /
  `'validate'`, `:327,351,373,385` `'failed'`), severity literals
  (`'error'` throughout). Re-read at execution; all literals are members of
  the seven-state / six-stage / three-severity vocabularies (witnesses, not
  edited — see §Non-goals).
- `server/src/ingestion/ingestion.controller.ts` — `validationStatus` /
  `state` / `stage` / `publicationStatus` / `severity` `stringSchema()`
  query-input validators (`:46,56–57,76,86,281`) plus `isIngestionTerminal`
  (`:310`). Read-only vocabulary witnesses; unchanged (see §Non-goals).
- `server/src/uploads/uploads.service.ts:345` (`state: string`) and
  `server/src/uploads/uploads.controller.ts:37,153` (`stringSchema()` +
  `terminal()`): upload-domain carriers, different domain from the ingestion
  read mappers; read-only, unchanged.
- `packages/shared/src/ingestion.ts` — `IngestionRunSummary.state :14`
  (`string`), `.stage :15` (`string`), `DatasetSummary.state :38`
  (`string`), `DatasetVersionSummary.publicationStatus :28` (`string`),
  `ColumnMappingSummary.validationStatus :49` (`string`),
  `ValidationIssueSummary.severity :57` (`string`), plus the five-member
  `IngestionRunState` (`:1–6`, `queued | running | published | failed |
cancelled` — deliberately two members short of Prisma's seven; see
  §Measurements item 5). Read-only; unchanged — the separate shared-contract
  prompt owns any change there.
- `prompts/115-observation-read-quality-severity-state-narrowing.md` —
  the severity/state precedent (inline-union judgement, `code` / `message`
  deliberately left open, no negative-type-test pattern).
- `prompts/116-metric-aggregate-read-enum-narrowing.md` — the closest
  lineage prompt (four-field read-mapper narrowing, `calculationVersion` /
  units / ids deliberately left open, contracts guard) this prompt mirrors
  for the ingestion service.
- `prompts/117-dashboard-view-status-narrowing.md` and
  `prompts/119-shared-dashboard-metric-aggregate-narrowing.md` — the
  server-first / shared-second split precedent this prompt follows.

No visual reference is applicable. This is an internal server read-mapper
parameter change, so the design-system PDF, landing-page PNGs, and recorded
chrome flows provide no evidence and must not be opened or cited as if they
did.

## Measurements and verified invariants

These are code-derived constraints at `b285027`; re-verify them before editing:

1. Exactly five open read-mapper fields across four helpers:
   `toDatasetSummary` `state: string` (`:428`) and nested
   `publicationStatus: string` (`:434`), `toVersionSummary`
   `publicationStatus: string` (`:456`), `toMappingSummary`
   `validationStatus: string` (`:476`), `toRunSummary` `state: string`
   (`:495`) and `stage: string` (`:496`). Re-run the grep over
   `server/src/ingestion/ingestion.service.ts` at execution
   (`state: string|publicationStatus: string|validationStatus: string|stage: string`)
   and confirm no sixth site appeared inside the four helpers.
   `progressPercent`, every `id`, every timestamp, `failureCode` /
   `failureMessage`, `sourceSummary`, `versionNumber`, `checksumHex`, and
   `rowNumber` / `columnKey` / `regionRef` are different carriers,
   explicitly out of scope.
2. The closed vocabularies are exactly three dataset states, one publication
   status, three validation statuses, seven run states, and six stages,
   byte-for-byte identical across `schema.prisma:711–744` and
   `enums.ts:128–175`. If the authorities disagree at execution, stop and
   report it rather than picking a winner silently.
3. The repository rows already carry the enum types: `tx.dataset`,
   `tx.datasetVersion`, `tx.columnMapping`, and `tx.ingestionRun` Prisma
   calls return `DatasetState` / `DatasetPublicationStatus` /
   `MappingValidationStatus` / `IngestionRunState` / `IngestionRunStage`
   values. Re-verify at execution that each `toX` call site passes a Prisma
   row field (not a hand-built string); if any call site constructs the
   value from query input or a literal, record it — the fix list must be
   extended by separate decision, not silently.
4. All committed ingestion fixtures use enum members. Re-grep `state:` /
   `stage:` / `validationStatus:` / `publicationStatus:` / `severity:`
   literals in `ingestion-processor.service.spec.ts` at execution
   (`'queued'`, `'validation_failed'`, `'validate'`, `'failed'`,
   `'invalid'`, `'error'`); if any value falls outside the 3 + 1 + 3 + 7 +
   6 + 3 literals, stop and report it rather than widening scope or
   rewriting test semantics. The processor-spec `StoredRun.state: string`
   test-local interface (`:23`) stays `string` — it mocks a stored run for
   the processor, not a `toX` mapper param, and narrowing it is a separate
   test-mock decision.
5. Shared `IngestionRunState` (`packages/shared/src/ingestion.ts:1–6`) is a
   five-member subset (`queued | running | published | failed | cancelled`)
   missing Prisma's `validation_failed` and `cancelling`. This mismatch is
   real and is explicitly out of scope: this server-side prompt does not
   touch the shared file, so no assignability conflict is introduced (the
   shared fields stay open `string` and already accept all seven). The
   separate shared-contract prompt owns reconciling the five-vs-seven
   difference; do not "fix" it here by widening, narrowing, or aliasing.
6. `listIssues` (`:310–339`) has no open param: `issue.severity` flows from
   the Prisma `ValidationIssueSeverity` enum row directly into the shared
   open `string` field. No edit there. `failureCode` / `failureMessage` in
   `toRunSummary` stay `string | null` pass-through (prompts 80–81 narrowed
   the failure _write_ unions; the read carrier stays open like analytics
   `code` / `message` per prompt 115). Controller `stringSchema()` query
   inputs stay open (runtime-validated input with issue diagnostics, not a
   response vocabulary — the same reason prompt 119 left
   `analytics.controller.ts` inputs open).
7. No runtime value moves: every mapper returns the identical object it
   returns today. A server test that changes outcome (not just compilation)
   after this edit disproves the premise — stop and report it.
8. There is no established negative-type-test pattern in this repository
   (verified through prompt 118: zero `ts-expect-error` / `expectTypeOf`
   uses in `server/src`, `client/`, `packages/shared/src`). Do not invent
   one; the gates are `npm run typecheck` (which must reject a future
   non-member construction at the mapper boundary) plus unchanged runtime
   suites.

The required shapes mirror the sibling carriers exactly:

```ts
// server/src/ingestion/ingestion.service.ts
private toDatasetSummary(dataset: {
  // ... unchanged fields
  state: 'draft' | 'active' | 'archived';
  versions?: Array<{
    // ... unchanged fields
    publicationStatus: 'published';
  }>;
}): DatasetSummary

private toVersionSummary(version: {
  // ... unchanged fields
  publicationStatus: 'published';
}): DatasetVersionSummary

private toMappingSummary(mapping: {
  // ... unchanged fields
  validationStatus: 'pending' | 'valid' | 'invalid';
}): MappingSummary

private toRunSummary(run: {
  // ... unchanged fields
  state:
    | 'queued'
    | 'running'
    | 'validation_failed'
    | 'published'
    | 'failed'
    | 'cancelling'
    | 'cancelled';
  stage: 'inspect' | 'parse' | 'map' | 'validate' | 'publish' | 'complete';
}): IngestionRunSummary
```

Do not introduce a shared alias, a Prisma-enum import, a validator, a
per-value branch, a coercion change, or a new literal.

## Expected impact

- Routes changed: none.
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none (response
  bodies already carry member literals; runtime server values are already
  members; type-only param narrowing cannot alter a snapshot).
- Database schema, Prisma models, migrations, RLS, queries, indexes,
  queues, and persisted-data formats changed: none.
- Runtime server behavior: unchanged — every dataset/version/mapping/run
  accepted today maps to the identical response object with identical key
  order.
- Compile-time contract: the four private mappers no longer admit an
  invented dataset state, publication status, validation status, run state,
  or stage string at any construction site. Any future read-path
  construction inventing a fourth dataset state (or an eighth run state)
  fails typecheck at the mapper boundary instead of compiling through.
- Logging/observability: unchanged; no ingestion state is logged beyond
  existing paths.
- Threat model: no new boundary and no risk reclassification. The change
  adds a concrete read-mapper type-contract detail under the existing Phase
  7 deterministic-ingestion behavior.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and
   every skill named in `## SKILLS USED`. Confirm `git status --short`
   before editing; preserve any unrelated user changes and stop if they
   overlap an approved path. Confirm `HEAD` is `b285027` (or record the
   actual SHA and adjust `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–5 at execution: re-run the mapper-open
   grep over `server/src/ingestion/ingestion.service.ts`, diff the five
   vocabulary authorities (schema enums vs generated enums), confirm each
   `toX` call site passes a Prisma row field, re-grep fixture literals in
   `ingestion-processor.service.spec.ts`, and confirm the shared
   five-vs-seven mismatch is still exactly as stated. If a vocabulary
   disagreement, a sixth open site, a non-Prisma call site, or a
   non-member fixture appears, stop and report it rather than silently
   widening scope.
3. In `server/src/ingestion/ingestion.service.ts`, change only the five
   parameter types to the inline unions in §Measurements. Leave every
   return statement, every `toISOString()` call, `progressPercent`,
   `failureCode` / `failureMessage` pass-through, `sourceSummary`,
   `versionNumber`, `checksumHex`, `rowNumber` / `columnKey` / `regionRef`,
   `listIssues`, and every public method signature byte-for-byte unchanged
   in behavior. Do not add an import, alias, cast, or validator.
4. Make no other production edit: no shared DTO, controller, DTO, resolver,
   GraphQL type, Prisma schema, migration, seed, spec, processor, parser,
   upload service, mapping validator, analytics input schema, or client
   change. If typecheck demands more than the five param annotations,
   restore and report rather than expanding scope.
5. Run the focused ingestion regression suite. If any valid dataset /
   version / mapping / run maps to a different response shape, value, or
   key order, stop and report the exact fixture: a type-only mapper change
   must not alter runtime output.
6. Run `npm run contracts:check` and verify no generated REST/OpenAPI/
   GraphQL artifact changes. This mapper narrowing must not alter a public
   contract snapshot.
7. Update `docs/ingestion.md` in the residual-gaps-adjacent read-model
   paragraph (or the schema section if that is where the mapper contract
   lives at execution). Record that `toDatasetSummary()` `state` /
   `toVersionSummary()` `publicationStatus` / `toMappingSummary()`
   `validationStatus` / `toRunSummary()` `state` / `stage` are typed as the
   closed Prisma-enum unions, matching schema enums and generated enums;
   that `failureCode` / `failureMessage`, `listIssues` `code` / `message`,
   controller query inputs, the processor-spec `StoredRun` mock, and all
   shared `ingestion.ts` carriers deliberately stay `string`; that the
   shared five-vs-seven `IngestionRunState` mismatch is recorded and owned
   by the separate shared-contract decision; and that no runtime mapping,
   rejection, or response shape changed.
8. Inspect the complete diff, run every check below, and quote real exit
   status plus meaningful test/build totals. Fix issues before review.
9. Run the mandatory two-stage review loop:
   - dispatch a read-only reviewer subagent with `requesting-code-review`,
     this prompt path, `BASE_SHA=b285027` (or the recorded actual HEAD),
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
    - `prompts/120-ingestion-read-enum-narrowing.md`;
    - `docs/ingestion.md`;
    - `server/src/ingestion/ingestion.service.ts`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend,
      or push. Use a terse Conventional Commit subject and include a short
      body explaining the read-mapper reason, because it is not obvious
      from the subject alone.

## Non-goals

- No change to `packages/shared/src/ingestion.ts` (`state`, `stage`,
  `publicationStatus`, `validationStatus`, `severity`, the five-member
  `IngestionRunState`, `MetricMappingInput.valueType` / `aggregation`):
  the separate shared-contract decision owns any change there (the same
  split prompts 115–117 kept before prompt 119).
- No change to `failureCode` / `failureMessage` pass-through or
  `ValidationIssueSummary.code` / `message`: read carriers stay open like
  analytics `code` / `message` per prompt 115; prompts 80–81 own the
  failure _write_ unions and are not revisited here.
- No change to `listIssues` inline map: no open param exists (Prisma enum
  row into shared `string`); not a mapper-narrowing site.
- No change to `server/src/ingestion/ingestion.controller.ts`
  `stringSchema()` query-input validators or `isIngestionTerminal()`:
  runtime-validated input with issue diagnostics, not a response
  vocabulary.
- No change to `server/src/uploads/uploads.service.ts:345`,
  `uploads.controller.ts:37,153`, or any upload-domain carrier: a
  different domain, not the ingestion read mappers.
- No change to `ingestion-processor.service.spec.ts` `StoredRun.state:
string` test-local mock or any spec literal: witnesses only; no test
  semantics change.
- No change to `ValidationIssueSeverity` shared/server read shape beyond
  what is stated: `listIssues` already flows the Prisma enum; a shared
  severity narrowing is owned by the same separate shared-contract prompt.
- No new import (including Prisma-enum imports), shared alias, validator,
  cast helper, per-value branch, coercion change, or literal addition.
- No schema migration, SQL, Prisma repository, RLS, index, tenant, worker
  queue, storage, upload, route, API contract, client component, design,
  accessibility, motion, or browser work.
- No new test cases and no invented negative-type-test pattern
  (`ts-expect-error` / `expectTypeOf` have zero uses in this repository);
  no general mapper refactor or unrelated cleanup.

## Reference deltas

No visual delta. The deliberate static delta is limited to five private
read-mapper parameter types: invented dataset-state / publication-status /
validation-status / run-state / stage strings no longer construct the four
summaries at compile time. Runtime acceptance, mapped output, key order,
enum-column contents, and every error path are observably identical before
and after.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this server read-mapper type change. No
responsive, touch-target, or reduced-motion surface moves.

## Checks to run, and the owning doc

```bash
# Focused ingestion regression (must pass; server runtime unchanged)
npm --workspace=@acres/server test -- ingestion-processor.service.spec.ts

# Public contracts must remain unchanged (type-only param narrowing)
npm run contracts:check

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/120-ingestion-read-enum-narrowing.md \
  docs/ingestion.md \
  server/src/ingestion/ingestion.service.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/120-ingestion-read-enum-narrowing.md \
  docs/ingestion.md \
  server/src/ingestion/ingestion.service.ts
```

Quote the actual exit status and meaningful Jest/build totals. If a named
spec does not exist at execution time, locate the closest current
equivalent with `rg --files server/src/ingestion`, run it, and record that
evidence instead of claiming a nonexistent check. Browser E2E, real
PostgreSQL, spatial plan, and operations-drill suites are intentionally
omitted because this scope adds no rejection path, changes no schema/query
behavior, and touches no browser journey or deployment surface.

`docs/ingestion.md` owns the implementation record. `docs/security.md`
and `docs/backend.md` are read-only verification for this task; update
either only if execution proves a statement materially stale, and stop
before broadening scope.

## Rollback and stop conditions

Rollback is a source/doc revert; there is no migration or
persisted-data rollback. Stop before expanding scope if any of these occur:

- the mapper-open grep shows other than the five `toX` sites at execution
  time;
- the vocabulary authorities disagree on the 3 + 1 + 3 + 7 + 6 literals,
  or a fixture contains a value outside them;
- any `toX` call site passes a non-Prisma-constructed string (query input
  or hand-built literal);
- the shared five-vs-seven `IngestionRunState` mismatch resolves itself
  (shared gains members) or widens — record it and prepare a separate
  shared-contract prompt rather than absorbing it here;
- an existing server test changes outcome (not just compilation) after
  the edit;
- a public contract snapshot changes;
- the fix requires a new literal, validator, cast, alias, import (any),
  error code/message, schema change, repository rewrite, GraphQL change,
  seed rewrite, spec rewrite, or client change.

Report the contradictory evidence and prepare a separate prompt rather
than silently changing the premise.

## Completion criteria

- `toDatasetSummary()` `state` accepts only `draft | active | archived`
  at compile time.
- Nested and standalone `publicationStatus` accept only `published` at
  compile time.
- `toMappingSummary()` `validationStatus` accepts only
  `pending | valid | invalid` at compile time.
- `toRunSummary()` `state` accepts only the seven `IngestionRunState`
  literals and `stage` accepts only the six `IngestionRunStage` literals
  at compile time.
- Every other mapper field, repository call, schema, seed, spec,
  controller input, shared DTO, and client surface is byte-for-byte
  equivalent in behavior.
- Current ingestion processor tests pass with identical server outcomes.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all
  verified blocking/important findings are fixed and re-tested.
- `docs/ingestion.md` records the mapper narrowing invariant, the
  deliberate shared/query-input/test-mock openness, the five-vs-seven
  mismatch ownership, and the no-runtime-change proof.
- Only the approved paths are committed locally to `main`; nothing is
  pushed.

## SKILLS USED

- `architecture-patterns` — preserve the existing service / repository
  boundaries and avoid introducing shared aliases or cross-module coupling.
- `nestjs-best-practices` — keep the change outside Nest provider/module
  wiring; mappers are private pure functions and are read-only except for
  param annotations.
- `postgres-best-practices` — verify against the `DatasetState` /
  `DatasetPublicationStatus` / `MappingValidationStatus` /
  `IngestionRunState` / `IngestionRunStage` enum-versus-`String` column
  contract; no schema, migration, transaction, RLS, or persistence change.
- `sql-optimization-patterns` — verify no query, index, or query-plan work
  is introduced by this in-memory type change.
- `security-best-practices` — guard duty only: no trust-boundary or
  persistence change; read-only verification against `docs/security.md`.
- `security-threat-model` — guard duty only: no boundary moves; verify no
  risk reclassification.
- `error-handling-patterns` — keep the deterministic mappers and existing
  not-found error paths; no new failure literal is introduced.
- `javascript-testing-patterns` — rely on the existing ingestion processor
  Jest suite as unchanged-outcome regression proof; no test semantics
  changed.
- `e2e-testing-patterns` — guard duty only: no cross-system journey
  changes; E2E intentionally omitted per §Checks.
- `requesting-code-review` — dispatch the mandatory structured read-only
  review with precise scope, SHAs, changed paths, and check evidence.
- `receiving-code-review` — verify reviewer claims against repository
  reality before fixes or technical pushback.
- `caveman-commit` — produce the required terse Conventional Commit
  message with a short read-mapper rationale body.

Not loaded, with reason: `api-design-principles` /
`openapi-spec-generation` (contracts:check guard duty only, no public
contract change); `playwright` (no mapping UI or browser journey);
frontend/Tailwind/shadcn/GSAP skills (no UI or motion).
