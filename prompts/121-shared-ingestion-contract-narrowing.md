# 121 — narrow shared ingestion DTOs to the closed Prisma vocabularies and reconcile the five-vs-seven `IngestionRunState`

## Scope, and why it is next

The committed repository is on `main` at `5f24952`
(`refactor(ingestion): narrow read enum unions`, the prompt 120
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 120 — which closed the last open server-side carriers on the Phase 7
read path (`toDatasetSummary()` `state`, nested and standalone
`publicationStatus`, `toMappingSummary()` `validationStatus`,
`toRunSummary()` `state` / `stage` in
`server/src/ingestion/ingestion.service.ts`, with inline unions and no runtime
change).

There is no unbuilt ordered phase left. The next smallest unblocked residual is
the shared-contract decision prompts 119 and 120 both explicitly deferred:

- prompt 119 §Non-goals / prompt 120 §Non-goals: "No change to
  `packages/shared/src/ingestion.ts` … the separate shared-contract decision
  owns any change there (the same split prompts 115–117 kept before prompt
  119)."
- prompt 120 §Measurements item 5: shared `IngestionRunState`
  (`packages/shared/src/ingestion.ts:1–6`) is a five-member subset
  (`queued | running | published | failed | cancelled`) missing Prisma's
  `validation_failed` and `cancelling`. "This mismatch is real and is
  explicitly out of scope … The separate shared-contract prompt owns
  reconciling the five-vs-seven difference; do not 'fix' it here."
- prompt 120 §Non-goals: "No change to `ValidationIssueSeverity`
  shared/server read shape … a shared severity narrowing is owned by the same
  separate shared-contract prompt."
- `docs/ingestion.md` §Residual gaps (`:508–522`) records the prompt 120
  server narrowing and names the shared carriers plus the five-vs-seven
  mismatch as owned by "the separate shared-contract decision."

The gap, at `5f24952` (re-verify exact lines at execution):

```ts
// packages/shared/src/ingestion.ts:1–6
export type IngestionRunState =
  | 'queued'
  | 'running'
  | 'published'
  | 'failed'
  | 'cancelled';
// ← five members; Prisma has seven (missing 'validation_failed', 'cancelling')

// packages/shared/src/ingestion.ts:8–21
export interface IngestionRunSummary {
  // ...
  readonly state: string;   // ← open (IngestionRunState, seven members)
  readonly stage: string;   // ← open (IngestionRunStage, six members)
  // ...
}

// packages/shared/src/ingestion.ts:23 (already closed, currently unused)
export type DatasetState = 'draft' | 'active' | 'archived';

// packages/shared/src/ingestion.ts:25–33
export interface DatasetVersionSummary {
  // ...
  readonly publicationStatus: string;  // ← open (DatasetPublicationStatus)
  // ...
}

// packages/shared/src/ingestion.ts:35–44
export interface DatasetSummary {
  // ...
  readonly state: string;   // ← open (DatasetState — alias exists in-file)
  // ...
}

// packages/shared/src/ingestion.ts:46–53
export interface ColumnMappingSummary {
  // ...
  readonly validationStatus: string;  // ← open (MappingValidationStatus)
  // ...
}

// packages/shared/src/ingestion.ts:55–64
export interface ValidationIssueSummary {
  // ...
  readonly severity: string;  // ← open (ValidationIssueSeverity)
  // ...
}
```

while every authority the codebase already states says the six fields are
closed:

- `DatasetState` — `draft | active | archived`:
  `server/prisma/schema.prisma:711–715`,
  `server/src/generated/prisma/enums.ts:128–134`,
  (`Dataset.state DatasetState`, DB-enforced);
- `DatasetPublicationStatus` — `published` (single member):
  `server/prisma/schema.prisma:717–719`,
  `server/src/generated/prisma/enums.ts:137–141`,
  (`DatasetVersion.publicationStatus DatasetPublicationStatus`, DB-enforced);
- `MappingValidationStatus` — `pending | valid | invalid`:
  `server/prisma/schema.prisma:721–725`,
  `server/src/generated/prisma/enums.ts:144–150`,
  (`ColumnMapping.validationStatus MappingValidationStatus`, DB-enforced);
- `IngestionRunState` — seven members
  (`queued | running | validation_failed | published | failed | cancelling | cancelled`):
  `server/prisma/schema.prisma:727–735`,
  `server/src/generated/prisma/enums.ts:153–163`,
  (`IngestionRun.state IngestionRunState`, DB-enforced);
- `IngestionRunStage` — six members
  (`inspect | parse | map | validate | publish | complete`):
  `server/prisma/schema.prisma:737–744`,
  `server/src/generated/prisma/enums.ts:166–175`
  (DB-enforced — re-verify the exact column line at execution);
- `ValidationIssueSeverity` — `info | warning | error`:
  `server/prisma/schema.prisma:746–750`,
  `server/src/generated/prisma/enums.ts:178–184`;
- the narrowed server mappers already emit exactly these unions
  (`ingestion.service.ts:428,434,456,476,495–503`, prompt 120), and the
  repository rows already carry the generated enum types;
- `listIssues` (`ingestion.service.ts:310–339`) flows `issue.severity` from
  the Prisma `ValidationIssueSeverity` enum row directly into the shared open
  `string` field (prompt 120 §Measurements item 6, read-only witness);
- every committed client mock already uses member literals
  (`client/e2e/helpers.ts:257` `publicationStatus: "published"`, `:280`
  `state: "active"`), and the client components only compare against member
  literals (`datasets-workspace.tsx:110–111,159,260–262,330–335`,
  `dataset-actions.tsx:400–407,720–733,741,766–790,850–855` — display and
  branch witnesses, not construction sites).

Reusing the in-file aliases where they exist plus inline unions where they do
not is a judgement, stated as one: `DatasetState` and `IngestionRunState`
already live in the shared file with no import cost, so `DatasetSummary.state`
reuses `DatasetState` and `IngestionRunSummary.state` reuses the widened
`IngestionRunState`; `stage`, `publicationStatus`, `validationStatus`, and
`severity` have no alias in the file, so they mirror the sibling carriers
inline — the same smaller-delta precedent prompts 115–120 followed (no Prisma
generated-client import into the dependency-free shared contract, no new
exported alias surface). A generated-enum import or a new-alias family
touching the service, specs, and all consumers is deferred as wider than the
gap.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 7 geography/ingestion outcome and exact phase
  skill manifest (§8); Phase 8/9 narrowing precedent (§§9–10); §§16–22
  confirming no unbuilt ordered phase.
- `docs/ingestion.md` — full file: hierarchy/source/code/alias schema,
  dataset/version/mapping/run/issue staging, parser adapters, worker
  publication flow, REST routes, and §Residual gaps (`:500–522`) naming this
  shared-contract decision; the owning implementation record for this prompt.
- `docs/analytics.md` — the prompt 115/116 read-side narrowing paragraphs
  and the prompt 118 `valueOf()` paragraph; the inline-union precedent.
  Read-only context.
- `docs/dashboards.md` — the prompt 117 `toView()` status paragraph and the
  prompt 119 shared-narrowing paragraph; the server-first / shared-second
  split precedent this prompt closes for the ingestion domain.
- `docs/backend.md` — current Nest modular-monolith/server conventions and
  root build/test command ownership; no module, provider, route, or database
  surface changes in this prompt.
- `docs/security.md` — TM boundaries. This work tightens shared response DTO
  contracts; it does not add or move a trust boundary, persist new data, or
  change an envelope.
- `packages/shared/src/ingestion.ts` — `IngestionRunState` (`:1–6`,
  five-member), `IngestionRunSummary.state` / `.stage` (`:14–15`, open),
  `DatasetState` (`:23`, closed), `DatasetVersionSummary.publicationStatus`
  (`:28`, open), `DatasetSummary.state` (`:38`, open),
  `ColumnMappingSummary.validationStatus` (`:49`, open),
  `ValidationIssueSummary.severity` (`:57`, open),
  `MetricMappingInput.valueType` / `aggregation` (input DTO — read-only,
  unchanged, see §Non-goals). Re-read at execution and resolve current line
  numbers rather than editing from this snapshot.
- `server/prisma/schema.prisma` — `enum DatasetState` (`:711–715`), `enum
  DatasetPublicationStatus` (`:717–719`), `enum MappingValidationStatus`
  (`:721–725`), `enum IngestionRunState` (`:727–735`), `enum
  IngestionRunStage` (`:737–744`), `enum ValidationIssueSeverity`
  (`:746–750`), plus the column bindings (`Dataset.state`,
  `DatasetVersion.publicationStatus`, `ColumnMapping.validationStatus`,
  `IngestionRun.state`, `IngestionRun.stage` — resolve exact column lines at
  execution). Read-only; no migration.
- `server/src/generated/prisma/enums.ts` — `DatasetState` (`:128–134`),
  `DatasetPublicationStatus` (`:137–141`), `MappingValidationStatus`
  (`:144–150`), `IngestionRunState` (`:153–163`), `IngestionRunStage`
  (`:166–175`), `ValidationIssueSeverity` (`:178–184`). Read-only;
  regenerated, never hand-edited.
- `server/src/ingestion/ingestion.service.ts` — `toDatasetSummary`
  (`:424–451`, prompt 120 closed), `toVersionSummary` (`:453–469`, closed),
  `toMappingSummary` (`:471–487`, closed), `toRunSummary` (`:489–521`,
  closed, `failureCode` / `failureMessage` pass-through `:505–523`),
  `listIssues` (`:310–339`, Prisma-enum severity flow, no open param).
  Read-only witnesses that the server producer already emits members;
  unchanged — assignability of the narrowed server returns into the narrowed
  shared DTO is proven by `npm run typecheck`.
- `server/src/ingestion/ingestion.controller.ts` — `validationStatus` /
  `state` / `stage` / `publicationStatus` `stringSchema()` query-input
  validators (runtime-validated input witnesses). Read-only; unchanged (see
  §Non-goals).
- `server/src/ingestion/ingestion-processor.service.spec.ts` — `StoredRun`
  test-local mock (`state: string`), run literals (`'queued'`,
  `'validation_failed'`, `'failed'`), severity literals (`'error'`
  throughout). Re-read at execution; all literals are members of the
  seven-state / six-stage / three-severity vocabularies (witnesses, not
  edited — see §Non-goals).
- `server/src/graphql/graphql.types.ts` — no ingestion summary GraphQL
  types (verified this session: zero `DatasetSummary` / `IngestionRun` /
  `MappingSummary` / `ValidationIssue` hits). Read-only witness that no SDL
  surface observes the shared ingestion file; unchanged.
- `client/e2e/helpers.ts` — `createMockDatasetVersion` (`:250–270`,
  `publicationStatus: "published"` member), `createMockDataset` (`:272–286`,
  `state: "active"` member). Re-read at execution; both already members, so
  no mock-literal fix is expected (unlike prompt 119's nine stale mocks).
- `client/lib/api/test-harness-store.ts` — dataset/version summary
  passthrough (`:6–7,17–19`); no ingestion state/stage/severity construction
  (verified this session). Re-read at execution.
- `client/components/acres/app/datasets-workspace.tsx` (`:110–111,159,
  260–262,330–335`) and `dataset-actions.tsx` (`:400–407,570,720–733,741,
  766–790,850–855`) — member-literal comparisons and display renders only.
  Read-only vocabulary witnesses; unchanged.
- `prompts/119-shared-dashboard-metric-aggregate-narrowing.md` — the
  sibling shared-contract prompt (inline-union judgement, mock-literal proof,
  contracts guard) this prompt mirrors for the ingestion domain.
- `prompts/120-ingestion-read-enum-narrowing.md` — the closing server-side
  lineage prompt (five-field mapper narrowing, five-vs-seven deferral,
  `failureCode` / `message` openness policy) this prompt completes.

No visual reference is applicable. This is an internal shared-type change
with member-literal consumers already in place, so the design-system PDF,
landing-page PNGs, and recorded chrome flows provide no evidence and must not
be opened or cited as if they did.

## Measurements and verified invariants

These are code-derived constraints at `5f24952`; re-verify them before editing:

1. Exactly six open shared fields plus one five-member alias:
   `IngestionRunSummary.state: string` (`:14`),
   `IngestionRunSummary.stage: string` (`:15`),
   `DatasetVersionSummary.publicationStatus: string` (`:28`),
   `DatasetSummary.state: string` (`:38`),
   `ColumnMappingSummary.validationStatus: string` (`:49`),
   `ValidationIssueSummary.severity: string` (`:57`), and the five-member
   `IngestionRunState` (`:1–6`). Re-run the grep
   (`state: string|stage: string|publicationStatus: string|validationStatus: string|severity: string`)
   over `packages/shared/src/ingestion.ts` at execution and confirm no
   seventh site appeared. `DatasetState` (`:23`), every `id`, every
   timestamp, `failure.code` / `failure.message`, `sourceSummary`,
   `versionNumber`, `checksumHex`, `rowNumber` / `columnKey` / `regionRef`,
   and every input DTO are different carriers, explicitly out of scope.
2. The closed vocabularies are exactly three dataset states, one publication
   status, three validation statuses, seven run states, six stages, and
   three severities, byte-for-byte identical across `schema.prisma:711–750`,
   `enums.ts:128–184`, and the prompt 120 server mappers
   (`ingestion.service.ts:428,434,456,476,495–503`). If the authorities
   disagree at execution, stop and report it rather than picking a winner
   silently.
3. The shared aliases are currently consumed nowhere outside their defining
   file (verified this session: `DatasetState` / `IngestionRunState` hit
   only `packages/shared/src/ingestion.ts`). Re-grep at execution; if a
   consumer appeared that constructs a non-member through the alias, record
   it — the fix list must be extended by separate decision, not silently.
4. All committed client mocks already use members
   (`helpers.ts:257 "published"`, `:280 "active"`). Re-grep `state: "` /
   `stage: "` / `publicationStatus` / `validationStatus` / `severity: "`
   across `client/e2e/helpers.ts` and `client/lib/api/test-harness-store.ts`
   at execution; if a non-member mock producer appears (a `"mean"` /
   `"published"`-class stale literal as in prompt 119), record it and fix
   only that literal — do not reshape any factory.
5. All committed server fixtures use enum members (`'queued'`,
   `'validation_failed'`, `'validate'`, `'failed'`, `'invalid'`,
   `'error'`). Re-grep `state:` / `stage:` / `validationStatus:` /
   `publicationStatus:` / `severity:` literals in
   `ingestion-processor.service.spec.ts` at execution; if any value falls
   outside the 3 + 1 + 3 + 7 + 6 + 3 literals, stop and report it rather
   than widening scope or rewriting test semantics. The processor-spec
   `StoredRun.state: string` test-local interface stays `string` — it mocks
   a stored run for the processor, not a summary DTO, and narrowing it is a
   separate test-mock decision.
6. GraphQL does not observe the shared ingestion file: zero
   `DatasetSummary` / `IngestionRun` / `MappingSummary` / `ValidationIssue`
   hits in `server/src/graphql/graphql.types.ts` (verified this session).
   `contracts:check` must still report no artifact change; if a snapshot
   moves, stop — a shared-ingestion narrowing must not alter a public
   contract snapshot.
7. No runtime value moves: every server mapper returns the identical object
   it returns today, and every client mock factory returns the identical
   shape. A server or client test that changes outcome (not just
   compilation) after this edit disproves the premise — stop and report it.
8. There is no established negative-type-test pattern in this repository
   (verified through prompt 120: zero `ts-expect-error` / `expectTypeOf`
   uses in `server/src`, `client/`, `packages/shared/src`). Do not invent
   one; the gates are `npm run typecheck` (which must reject a future
   non-member construction at the DTO boundary) plus unchanged runtime
   suites.

The required shapes mirror the sibling carriers exactly:

```ts
// packages/shared/src/ingestion.ts
export type IngestionRunState =
  | 'queued'
  | 'running'
  | 'validation_failed'   // ← added (was missing)
  | 'published'
  | 'failed'
  | 'cancelling'          // ← added (was missing)
  | 'cancelled';

export interface IngestionRunSummary {
  // ... unchanged fields
  readonly state: IngestionRunState;
  readonly stage: 'inspect' | 'parse' | 'map' | 'validate' | 'publish' | 'complete';
  // ... unchanged fields
}

export interface DatasetVersionSummary {
  // ... unchanged fields
  readonly publicationStatus: 'published';
  // ... unchanged fields
}

export interface DatasetSummary {
  // ... unchanged fields
  readonly state: DatasetState;
  // ... unchanged fields
}

export interface ColumnMappingSummary {
  // ... unchanged fields
  readonly validationStatus: 'pending' | 'valid' | 'invalid';
  // ... unchanged fields
}

export interface ValidationIssueSummary {
  // ... unchanged fields
  readonly severity: 'info' | 'warning' | 'error';
  // ... unchanged fields
}
```

Do not introduce a Prisma-enum import, a new exported alias, a validator, a
per-value branch, a coercion change, or a new literal.

## Expected impact

- Routes changed: none.
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none (response
  bodies already carry member literals; runtime server values are already
  members; GraphQL exposes no ingestion summary type; type-only DTO
  narrowing cannot alter a snapshot).
- Database schema, Prisma models, migrations, RLS, queries, indexes,
  queues, and persisted-data formats changed: none.
- Runtime server behavior: unchanged — every dataset/version/mapping/run/
  issue accepted today maps to the identical response object with identical
  key order.
- Runtime mock behavior: unchanged — both client mock factories already emit
  members, so no mock-literal fix is expected (verify, do not assume).
- Compile-time contract: the six shared summary fields no longer admit an
  invented dataset state, publication status, validation status, run state,
  stage, or severity string at any construction site (server mappers,
  seeds, specs, client mocks). Any future construction inventing an eighth
  run state (or a fourth severity) fails typecheck at the DTO boundary
  instead of compiling through the shared contract. The five-vs-seven
  `IngestionRunState` hole is closed: the alias admits exactly the seven
  Prisma literals the server already emits.
- Logging/observability: unchanged; no ingestion state is logged beyond
  existing paths.
- Threat model: no new boundary and no risk reclassification. The change
  adds a concrete shared-DTO type-contract detail under the existing Phase
  7 deterministic-ingestion behavior.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and
   every skill named in `## SKILLS USED`. Confirm `git status --short`
   before editing; preserve any unrelated user changes and stop if they
   overlap an approved path. Confirm `HEAD` is `5f24952` (or record the
   actual SHA and adjust `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–5 at execution: re-run the shared-open
   grep over `packages/shared/src/ingestion.ts`, diff the six vocabulary
   authorities (schema enums vs generated enums vs prompt 120 server
   mappers), re-grep alias consumers repo-wide, re-grep mock literals in
   both client files, and re-grep server fixture literals in
   `ingestion-processor.service.spec.ts`. If a vocabulary disagreement, a
   seventh open site, a non-member mock producer, an alias consumer
   constructing a non-member, or a non-member server fixture appears, stop
   and report it rather than silently widening scope.
3. In `packages/shared/src/ingestion.ts`, change only the alias plus the six
   field types to the shapes in §Measurements: widen `IngestionRunState`
   with the two missing members (order matching the Prisma enum:
   `queued, running, validation_failed, published, failed, cancelling,
   cancelled`); type `IngestionRunSummary.state` as `IngestionRunState`;
   type `IngestionRunSummary.stage`, `DatasetVersionSummary.
   publicationStatus`, `ColumnMappingSummary.validationStatus`, and
   `ValidationIssueSummary.severity` as the inline unions;
   type `DatasetSummary.state` as `DatasetState`. Leave `DatasetState`
   itself, `MetricMappingInput`, `MappingConfig`, every input DTO, every
   `id`, every timestamp, `failure` carriers, `sourceSummary`,
   `versionNumber`, `checksumHex`, `rowNumber` / `columnKey` / `regionRef`,
   and every other interface byte-for-byte unchanged. Do not add an import,
   a new exported alias, a cast, or a validator.
4. Make no other production edit: no server service, repository, DTO,
   controller, resolver, GraphQL type, Prisma schema, migration, seed,
   spec, processor, parser, upload service, mapping validator, analytics
   input schema, or client component change. If typecheck demands more than
   the alias widening plus the six field annotations (plus at most
   stale-mock literal fixes proven by the item-4 grep), restore and report
   rather than expanding scope.
5. Run the focused ingestion regression suite. If any valid dataset /
   version / mapping / run / issue maps to a different response shape,
   value, or key order, stop and report the exact fixture: a type-only
   shared change must not alter runtime output.
6. Run `npm run contracts:check` and verify no generated REST/OpenAPI/
   GraphQL artifact changes. This shared-DTO narrowing must not alter a
   public contract snapshot (GraphQL exposes no ingestion summary type by
   design).
7. Update `docs/ingestion.md` in the §Residual gaps paragraph that prompt
   120 wrote (`:508–522`). Record that shared `IngestionRunSummary.state`
   / `.stage`, `DatasetVersionSummary.publicationStatus`,
   `DatasetSummary.state`, `ColumnMappingSummary.validationStatus`, and
   `ValidationIssueSummary.severity` are typed as the closed Prisma-enum
   unions (reusing in-file `IngestionRunState` / `DatasetState` where they
   exist, inline elsewhere); that `IngestionRunState` is widened from five
   to the seven Prisma members, closing the recorded five-vs-seven
   mismatch; that `failureCode` / `failureMessage`, `listIssues` `code` /
   `message`, controller query inputs, the processor-spec `StoredRun` mock,
   `MetricMappingInput` value/aggregation carriers, and all ids/timestamps
   deliberately stay `string`; and that no runtime mapping, rejection, or
   response shape changed.
8. Inspect the complete diff, run every check below, and quote real exit
   status plus meaningful test/build totals. Fix issues before review.
9. Run the mandatory two-stage review loop:
   - dispatch a read-only reviewer subagent with `requesting-code-review`,
     this prompt path, `BASE_SHA=5f24952` (or the recorded actual HEAD),
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
    - `prompts/121-shared-ingestion-contract-narrowing.md`;
    - `docs/ingestion.md`;
    - `packages/shared/src/ingestion.ts`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend,
      or push. Use a terse Conventional Commit subject and include a short
      body explaining the shared-contract reason, because it is not obvious
      from the subject alone.

## Non-goals

- No change to `failure.code` / `failure.message` pass-through or
  `ValidationIssueSummary.code` / `message`: read carriers stay open like
  analytics `code` / `message` per prompt 115; prompts 80–81 own the
  failure _write_ unions and are not revisited here.
- No change to `MetricMappingInput.valueType` / `aggregation` / `unit` /
  `canonicalUnit`: runtime-validated mapping-input DTO with issue
  diagnostics, not a response vocabulary; narrowing it would move rejection
  from issues to typecheck and is a separate input-policy decision (the
  same reason prompt 119 left it open).
- No change to `server/src/ingestion/ingestion.service.ts` mappers,
  `listIssues`, repositories, or Prisma schema: prompt 120 owns that side
  and it is already closed; this prompt only makes the shared consumer
  admit exactly what the server emits.
- No change to `server/src/ingestion/ingestion.controller.ts`
  `stringSchema()` query-input validators: runtime-validated input with
  issue diagnostics, not a response vocabulary.
- No change to `ingestion-processor.service.spec.ts` `StoredRun.state:
  string` test-local mock or any spec literal: witnesses only; no test
  semantics change.
- No change to `server/src/graphql/graphql.types.ts` or any SDL/OpenAPI
  snapshot: GraphQL exposes no ingestion summary type by design; a
  GraphQL-surface migration is a separate public-contract decision with
  snapshot consequences.
- No change to any upload-domain carrier (`uploads.service.ts`,
  `uploads.controller.ts`): a different domain, not the ingestion summary
  DTOs.
- No new import (including Prisma-enum imports), new exported alias,
  validator, cast helper, per-value branch, coercion change, or literal
  addition.
- No schema migration, SQL, Prisma repository, RLS, index, tenant, worker
  queue, storage, upload, route, API contract, client component, design,
  accessibility, motion, or browser work beyond at most stale-mock literal
  fixes proven by the §Measurements item-4 grep.
- No new test cases and no invented negative-type-test pattern
  (`ts-expect-error` / `expectTypeOf` have zero uses in this repository);
  no general DTO refactor or unrelated cleanup.

## Reference deltas

No visual delta. The deliberate static delta is limited to the shared
TypeScript contract: the `IngestionRunState` alias gains its two missing
members, and invented dataset-state / publication-status / validation-status
/ run-state / stage / severity strings no longer construct the six summary
DTO fields at compile time. Runtime acceptance, mapped output, key order,
enum-column contents, GraphQL SDL, and every error path are observably
identical before and after; the client mocks already emit members and are
expected to compile unchanged.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this shared type-contract change. No
responsive, touch-target, or reduced-motion surface moves.

## Checks to run, and the owning doc

```bash
# Focused ingestion regression (must pass; server runtime unchanged)
npm --workspace=@acres/server test -- ingestion-processor.service.spec.ts

# Public contracts must remain unchanged (GraphQL exposes no ingestion type)
npm run contracts:check

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/121-shared-ingestion-contract-narrowing.md \
  docs/ingestion.md \
  packages/shared/src/ingestion.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/121-shared-ingestion-contract-narrowing.md \
  docs/ingestion.md \
  packages/shared/src/ingestion.ts
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

- the shared-open grep shows other than the six summary fields plus the
  five-member alias at execution time;
- the vocabulary authorities disagree on the 3 + 1 + 3 + 7 + 6 + 3
  literals, or a server fixture contains a value outside them;
- a non-member mock producer appears beyond the member literals listed in
  §Measurements item 4;
- an alias consumer appeared that constructs a non-member through
  `DatasetState` / `IngestionRunState`;
- the shared five-vs-seven mismatch already resolved itself (alias already
  has seven members) or widened — record it and re-scope rather than
  absorbing it silently;
- an existing server or client test changes outcome (not just compilation)
  after the edit;
- a public contract snapshot changes;
- the fix requires a new literal, validator, cast, alias, import (any),
  error code/message, schema change, repository rewrite, GraphQL change,
  seed rewrite, spec rewrite, or client-component change.

Report the contradictory evidence and prepare a separate prompt rather
than silently changing the premise.

## Completion criteria

- Shared `IngestionRunState` admits exactly the seven Prisma literals at
  compile time.
- Shared `IngestionRunSummary.state` / `DatasetSummary.state` admit only
  their seven / three literals; `stage` admits only the six stage literals;
  `publicationStatus` admits only `published`; `validationStatus` admits
  only the three mapping literals; `severity` admits only the three
  severity literals — all at compile time.
- Every other shared field, server mapper, repository, schema, seed, spec,
  GraphQL type, mapping validator, controller input, and client component
  is byte-for-byte equivalent in behavior.
- Current ingestion processor tests pass with identical server outcomes.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all
  verified blocking/important findings are fixed and re-tested.
- `docs/ingestion.md` records the shared narrowing invariant, the
  five-vs-seven closure, the deliberate input/failure/mock openness, and
  the no-runtime-change proof.
- Only the approved paths are committed locally to `main`; nothing is
  pushed.

## SKILLS USED

- `architecture-patterns` — preserve the existing shared-DTO / service /
  repository boundaries; reuse in-file aliases and avoid new cross-module
  coupling.
- `nestjs-best-practices` — keep the change outside Nest provider/module
  wiring; server producers already emit members and are read-only here.
- `postgres-best-practices` — verify against the six enum-versus-column
  contracts; no schema, migration, transaction, RLS, or persistence change.
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
  message with a short shared-contract rationale body.

Not loaded, with reason: `api-design-principles` /
`openapi-spec-generation` (contracts:check guard duty only, no public
contract change); `playwright` (no mapping UI or browser journey);
frontend/Tailwind/shadcn/GSAP skills (no UI or motion).
