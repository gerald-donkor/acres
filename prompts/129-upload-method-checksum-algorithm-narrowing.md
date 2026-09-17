# 129 — narrow shared upload `method` / `checksumAlgorithm` carriers to their closed literals

## Scope, and why it is next

The committed repository is on `main` at `092c222`
(`refactor(organizations): narrow audit action union`, the prompt 128
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 128 — which closed the last open audit-action carrier on the Phase 3
audit-read path (two annotations joined into the existing erased
`import type`, unchanged bodies, no runtime change).

There is no unbuilt ordered phase left. A repo-wide grep over
`packages/shared/src`, `server/src`, and `client/` this session proves
exactly four open signed-transport carriers remain in the shared upload
contract, and a closed single-literal vocabulary for each one is already
stated by every adjacent producer authority:

```ts
// packages/shared/src/uploads.ts — OPEN (all four)
export type InitiateUploadResult = {
  uploadId: string;
  object: {
    key: string;
    bucket: string;
    checksumAlgorithm: string; // ← open ('sha256', see below)
  };
  upload: {
    url: string;
    method: string; // ← open ('PUT', see below)
    headers: Record<string, string>;
    expiresAt: string;
  };
  complete: {
    method: string; // ← open ('POST', see below)
    url: string;
    requiredHeaders: string[];
  };
};

export type UploadDownload = {
  url: string;
  method: string; // ← open ('GET', see below)
  headers: Record<string, string>;
  expiresAt: string;
};
```

against the authorities that already state the closed vocabularies:

- `server/src/uploads/uploads.service.ts:66,78,91` — all three
  `checksumAlgorithm` writes are the literal `'sha256'` (stored-object
  row, upload row, initiate result object);
- `server/src/uploads/uploads.service.ts:95` — initiate `upload.method`
  is `signed.method` where `signed` is a `PresignedPut`
  (`storage.port.ts:3`, `method: 'PUT'`), produced by
  `s3-object-storage.adapter.ts:58` (`method: 'PUT'`);
- `server/src/uploads/uploads.service.ts:100` — initiate
  `complete.method` is the literal `'POST'` (the same-process REST
  complete route, not a storage presign);
- `server/src/uploads/uploads.service.ts:317` — download `method` is
  `signed.method` where `signed` is a `PresignedGet`
  (`storage.port.ts:10`, `method: 'GET'`), produced by
  `s3-object-storage.adapter.ts:84` (`method: 'GET'`);
- `server/test/helpers/test-app.ts:661,667` — the fake storage port
  mirrors the same literals (`'PUT'` / `'GET'`);
- `packages/shared/src/reports.ts:174` — the export-download contract
  already closes its own `method` to `'GET'`, so this prompt makes the
  upload/download contracts consistent with the established precedent
  rather than inventing a new shape.

No other producer constructs any of these four fields (the grep returns
only the service sites above plus member-literal test fixtures:
`server/test/api.e2e-spec.ts:367` `{ method: 'PUT' }`,
`server/test/database.e2e-spec.ts:2525` `{ method: 'GET' }`,
`client/tests/api-helpers.spec.ts:232` `checksumAlgorithm: "sha256"`
with `"PUT"` / `"POST"` in the same mocked result, and
`client/e2e/product-journeys.spec.ts:539,720`
`checksumAlgorithm: "sha256"`). Every consumer passes the values
through unchanged:

- `client/lib/api/browser.ts:435–436,478–482` —
  `apiMutation<InitiateUploadResult>` / `apiFetch<UploadDownload>`
  generics, no method construction;
- `client/components/acres/app/dataset-actions.tsx:298` —
  `method: initiated.upload.method` flows into a `fetch` init
  (`method?: string`), so the narrowed `'PUT'` remains assignable with
  the call byte-for-byte unchanged — the downstream assignability proof.

This is the direct continuation of prompts 119–128, which narrowed the
shared dashboard/ingestion contracts, the reports `toX()` mappers, the
upload read state, the SSE terminal predicates, the metrics
`sourceKind`, the GraphQL cursor kinds, the mail role, and the audit
actions — each with unchanged bodies and no runtime change. It closes
the last open `string` carriers on the Phase 6 signed-upload/download
path rather than leaving a known remainder. It mirrors prompt 119 most
closely (shared-contract narrowing where literal-typed producers make
the union admission-free, consumers compile unchanged, no runtime
change).

Narrowing all four carriers in the one shared file in a single prompt,
even though `checksumAlgorithm` (storage integrity) and the three
`method` fields (HTTP verbs) are different domains, is a judgement,
stated as one: the four annotations are adjacent lines in one product
contract file (`uploads.ts:34,38,43,56`), each admits exactly one
literal already stated by its producer, and splitting them would
produce two prompts editing the same file with the same gates and the
same no-runtime-change proof. No producer, consumer, schema, or test
is added, removed, or edited — the contract file is the only
production edit.

Leaving `mediaType` open in `UploadStatus`, `InitiateUploadInput`, and
`StoredObjectStat.mediaType: string | null` is a judgement, stated as
one: accepted media types are a runtime operator allowlist
(`uploadAcceptedMediaTypes`, enforced by `validateMediaType`), not a
closed TypeScript vocabulary — no `PresignedPut`-style literal
authority states the set, and narrowing it would invent a contract —
forbidden by §10. The same holds for filenames, buckets, keys, URLs,
headers, checksums, ids, and timestamps.

Leaving `progress.stage: string` and the failure `code` / `message`
carriers open is a judgement, stated as one: prompt 123 deliberately
left them open (free-form `String` column for the stage; failure write
unions owned by prompts 80–85 with read carriers deliberately open per
prompts 121–123). This prompt does not relitigate that decision.

Leaving the controller response schemas as `stringSchema()`
(`uploads.controller.ts` download envelope; the initiate envelope
declares only `uploadId`) is a judgement, stated as one: the runtime
OpenAPI validation stays open while the TypeScript result contract
narrows, so the generated OpenAPI/SDL snapshots stay byte-identical —
the same static-type-only / wire-schema-untouched split prompt 128
used for the GraphQL `String` fields. `contracts:check` proves the
snapshots do not move.

Leaving the Prisma `String` columns open (`schema.prisma:324,350`,
`StoredObject` / `Upload` `checksumAlgorithm`) is a judgement, stated
as one: no migration is in scope, and the narrowing claims only that
the service's produced results carry these literals — not that the
column is an enum. All writers (service sites plus
`reports.service.ts:673` and the analytics scale seed, every one
`'sha256'`) already agree with the narrowed contract.

Leaving `analytics-scale-seed.types.ts:51,64`
(`readonly checksumAlgorithm: string`) open is a judgement, stated as
one: seed scaffolding is not the product contract, and every seed
writer already emits the member literal — narrowing the product
contract needs no seed edit, and seed-type hygiene is a separate
decision, explicitly out of scope.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 6 storage/queues/secure-uploads outcome and
  exact phase skill manifest (§7); §§16–22 confirming no unbuilt ordered
  phase.
- `docs/backend.md` — storage/uploads sections (presigned initiate/
  complete/download flow, `checksumAlgorithm: 'sha256'` writes, prompt 123
  upload-state narrowing). The owning implementation record for this
  prompt (contract carriers only).
- `docs/security.md` — storage/upload asset and TM boundaries. This work
  tightens the upload-result contract under the existing Phase 6
  boundary (presigned-URL issuance, checksum binding, and permission
  gates are untouched); it does not add or move a trust boundary,
  persist new data, or change an envelope. Read-only verification unless
  execution proves a statement materially stale.
- `packages/shared/src/uploads.ts` — the four open carriers (`:34`,
  `:38`, `:43`, `:56`). The only production file edited. Re-read at
  execution and resolve current line numbers rather than editing from
  this snapshot.
- `server/src/uploads/uploads.service.ts` — the producer authorities
  (`:66,78,91` sha256 writes; `:95` PUT passthrough; `:100` POST
  literal; `:317` GET passthrough). Read-only witnesses; unchanged.
- `server/src/storage/storage.port.ts:1–14` — `PresignedPut.method:
'PUT'` / `PresignedGet.method: 'GET'`. Read-only witness; unchanged.
  Precedent that the closed verb vocabulary lives at the port, not at
  the call site.
- `server/src/storage/s3-object-storage.adapter.ts:58,84` — the adapter
  producers. Read-only witnesses; unchanged.
- `server/src/uploads/uploads.controller.ts` — initiate envelope
  (declares only `uploadId`), download envelope
  (`method: stringSchema()`). Read-only witness; unchanged (OpenAPI
  must not move).
- `server/prisma/schema.prisma:324,350` — `checksumAlgorithm String`
  columns (deliberately open, no migration). Read-only witness;
  unchanged.
- `client/lib/api/browser.ts:435–436,478–482`,
  `client/components/acres/app/dataset-actions.tsx:288–310`,
  `client/tests/api-helpers.spec.ts:220–250` — the pass-through
  consumers and the member-literal mock. Read-only witnesses;
  unchanged (the mock already emits members; the fetch call compiles
  unchanged — that is the downstream assignability proof).
- `packages/shared/src/reports.ts:174` — the `method: 'GET'` precedent
  this prompt makes uploads consistent with. Read-only witness;
  unchanged.
- `prompts/119-shared-dashboard-metric-aggregate-narrowing.md` — the
  closest lineage prompt (shared-contract narrowing, literal-typed
  producers, unchanged consumers, contracts guard) this prompt mirrors
  for the four upload carriers.
- `prompts/128-audit-read-action-narrowing.md` — the wire-schema
  judgement precedent (narrow the TypeScript contract, keep the runtime
  response/GQL schema open, `contracts:check` proves no drift) this
  prompt mirrors for the controller `stringSchema()` envelopes.

No visual reference is applicable. This is an internal upload-contract
type change, so the design-system PDF, landing-page PNGs, and recorded
chrome flows provide no evidence and must not be opened or cited as if
they did.

## Measurements and verified invariants

These are code-derived constraints at `092c222`; re-verify them before editing:

1. Exactly four open signed-transport carriers: the grep over
   `packages/shared/src/uploads.ts` returns `checksumAlgorithm: string`
   (`:34`), `upload.method: string` (`:38`),
   `complete.method: string` (`:43`), and `UploadDownload.method:
string` (`:56`). Re-run at execution; if a fifth carrier appeared,
   stop and report it rather than silently widening scope.
2. Each closed vocabulary is exactly one literal, byte-for-byte the
   producer value: `'sha256'`, `'PUT'`, `'POST'`, `'GET'`. The PUT/GET
   literals must still match the port types (`storage.port.ts`) and the
   adapter producers at execution; the POST literal must still be the
   only `complete.method` producer; all three `checksumAlgorithm`
   writers must still emit `'sha256'`. If any authority disagrees at
   execution (a second algorithm, a second complete verb, a port-type
   change), stop and report it rather than picking a winner silently.
3. No consumer constructs these fields with a non-member value: the
   consumer grep must return only pass-through generics, the
   `dataset-actions.tsx:298` fetch passthrough, and member-literal
   fixtures/mocks. If a new constructor with a free-form verb or
   algorithm appeared (especially a second storage adapter or a client
   upload path), record it — the target unions must be re-derived, not
   silently assumed.
4. The producers stay byte-for-byte unchanged: `signed.method`
   passthroughs and the `'POST'` / `'sha256'` literals are already
   literal-typed, so the narrowed contract must admit them with no
   cast, guard, or producer edit. If typecheck rejects the unchanged
   producers at execution, stop — the premise is disproved and the
   scope must be re-decided, not silently absorbed with a cast.
5. `mediaType`, filenames, buckets, keys, URLs, headers, checksums,
   ids, and timestamps stay open by design: operator-allowlisted or
   free-form values with no closed TS authority. Narrowing any of them
   would invent a contract.
6. `progress.stage` and failure `code` / `message` stay open by design:
   owned by prompts 80–85 and 121–123. The controller `stringSchema()`
   envelopes and the Prisma `String` columns stay open by design: wire
   schema and persistence, not vocabulary carriers. `contracts:check`
   must report no artifact change. If a snapshot moves, stop — a
   contract narrowing with already-member runtime values must not
   alter a public contract snapshot.
7. No runtime value moves: every initiate/download result carries the
   identical method and algorithm as before (same presign calls, same
   literals). A server or client test that changes outcome (not just
   compilation) after this edit disproves the premise — stop and
   report it.
8. There is no established negative-type-test pattern in this repository
   (verified through prompt 128: zero `ts-expect-error` / `expectTypeOf`
   uses in `server/src`, `client/`, `packages/shared/src`). Do not invent
   one; the gates are `npm run typecheck` (which must reject a future
   invented verb/algorithm at these boundaries) plus the unchanged
   runtime suites.

The required shape:

```ts
// packages/shared/src/uploads.ts (annotations only; no other change)
object: {
  key: string;
  bucket: string;
  checksumAlgorithm: 'sha256'; // was string
};
upload: {
  url: string;
  method: 'PUT'; // was string
  headers: Record<string, string>;
  expiresAt: string;
};
complete: {
  method: 'POST'; // was string
  url: string;
  requiredHeaders: string[];
};
// UploadDownload
method: 'GET'; // was string
```

Do not introduce a shared alias, an inline union wider than the single
literal, a cast, a validator, a per-value branch, a producer edit, a
consumer edit, or a controller-schema change. The producers already
emit members and the consumers already pass them through.

## Expected impact

- Routes changed: none (paths, verbs, guards, and response shapes are
  untouched; the complete route stays POST by behavior, not just by
  type).
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none (the
  runtime `stringSchema()` envelopes are untouched; emitted results
  already carry member values; type-only contract narrowing cannot
  alter a snapshot).
- Database schema, Prisma models, migrations, RLS, queries, indexes,
  queues, presign calls, and persisted-data formats changed: none (the
  `String` columns and every write are identical; no query text moves).
- Runtime server and client behavior: unchanged — every initiate/
  download result carries the identical method and algorithm, the PUT
  still goes to the presigned URL, and the complete call still POSTs
  to the same-process route.
- Compile-time contract: the four signed-transport boundaries no longer
  admit an invented verb or algorithm at any current or future call
  site. A future second checksum algorithm fails typecheck until the
  contract is extended by separate decision (writers, port, and
  verification included), instead of compiling through `string`.
- Logging/observability: unchanged; no method or algorithm value is
  logged beyond existing paths.
- Threat model: no new boundary and no risk reclassification. The change
  adds one concrete signed-transport type-contract detail under the
  existing Phase 6 upload boundary. Checksum binding and presigned-URL
  scoping keep their runtime enforcement; display/transport typing was
  never an enforcement point and does not become one.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and
   every skill named in `## SKILLS USED`. Confirm `git status --short`
   before editing; preserve any unrelated user changes and stop if they
   overlap an approved path. Confirm `HEAD` is `092c222` (or record the
   actual SHA and adjust `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–4 at execution: re-run the carrier
   grep over `packages/shared/src/uploads.ts`, re-run the producer grep
   (`checksumAlgorithm:`, `method:`) over `server/src/uploads`,
   `server/src/storage`, and `server/test/helpers`, re-run the consumer
   grep (`InitiateUploadResult|UploadDownload`) over `server/src`,
   `client/`, and `packages/shared/src`, and confirm the port/adapter/
   service vocabularies still agree on exactly `'sha256'` / `'PUT'` /
   `'POST'` / `'GET'`. If a fifth carrier, a second producer value, or
   a constructing consumer appears, stop and report it rather than
   silently widening scope.
3. In `packages/shared/src/uploads.ts`, make only four edits: change
   `checksumAlgorithm: string` to `'sha256'`, `upload.method: string`
   to `'PUT'`, `complete.method: string` to `'POST'`, and
   `UploadDownload.method: string` to `'GET'` (matching the repo's
   quote/style at execution). Leave every other line byte-for-byte
   unchanged. Do not add any export, alias, cast, or validator.
4. Make no other production edit: no service change (producers must
   compile unchanged — that is the upstream admission proof), no
   storage port/adapter change, no controller-schema change, no client
   change (consumers must compile unchanged — that is the downstream
   assignability proof), no DTO, guard, permission, Prisma schema,
   migration, seed, repository, worker, scanner, outbox payload,
   retention job, AI draft surface, metrics label, or design change.
   If typecheck demands more than the four annotations, restore and
   report rather than expanding scope.
5. Run `npm run contracts:check` and verify no generated REST/OpenAPI/
   GraphQL artifact changes. This narrowing must not alter a public
   contract snapshot (runtime envelopes stay `stringSchema()`).
6. Run the focused regression scopes and verify identical outcomes:
   `npm run test --workspace=@acres/server -- src/uploads src/storage`
   and the client helper scope covering `client/tests/api-helpers.spec.ts`.
   All tests must pass with unchanged assertions (the mocks already
   emit member literals).
7. Update `docs/backend.md` in the storage/uploads section (where the
   prompt 123 upload-state narrowing lives at execution). Record that
   the four signed-transport carriers admit only their single literals
   (producer authorities: port types, adapter, the three service write
   sites, the POST complete literal); that narrowing all four in one
   shared file is deliberate adjacency, not domain merging; that
   `mediaType`/names/URLs/keys/headers/checksums/ids/timestamps stay
   open (allowlist/free-form, no closed authority); that
   `progress.stage`/failure carriers stay owned by prompts 80–85 and
   121–123; that controller `stringSchema()` envelopes, Prisma
   `String` columns, and seed types are untouched with the reason for
   each; and that no returned byte changed.
8. Inspect the complete diff, run every check below, and quote real exit
   status plus meaningful test/build totals. Fix issues before review.
9. Run the mandatory two-stage review loop:
   - dispatch a read-only reviewer subagent with `requesting-code-review`,
     this prompt path, `BASE_SHA=092c222` (or the recorded actual HEAD),
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
    - `prompts/129-upload-method-checksum-algorithm-narrowing.md`;
    - `docs/backend.md`;
    - `packages/shared/src/uploads.ts`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend,
      or push. Use a terse Conventional Commit subject and include a short
      body explaining the signed-transport reason, because it is not obvious
      from the subject alone.

## Non-goals

- No change to `mediaType` (operator allowlist, no closed TS authority),
  filenames, buckets, keys, URLs, headers, checksums, ids, or timestamps:
  free-form or allowlisted carriers with no closed authority; narrowing
  them would invent a contract.
- No change to `progress.stage` (free-form `String` column, per prompt 123) or failure `code` / `message` carriers (write unions owned by
  prompts 80–85, read carriers deliberately open per prompts 121–123).
- No change to `UploadState` (already closed by prompt 123),
  `InitiateUploadInput` / `CompleteUploadInput` (caller-supplied inputs,
  validated at runtime with issues — not read carriers), or any other
  shared contract (`reports.ts:174` is the untouched precedent, not a
  second edit).
- No change to `uploads.service.ts` (producers are the admission
  witnesses; they emit members unchanged), `storage.port.ts`,
  `s3-object-storage.adapter.ts`, `test-app.ts` fakes, or any
  presign/permission/checksum-verification behavior.
- No change to `uploads.controller.ts` (`stringSchema()` envelopes stay;
  OpenAPI must not move), `browser.ts` / `dataset-actions.tsx` (pass-
  through consumers are the assignability witnesses; they compile
  unchanged), or any fetch/presign call behavior.
- No change to Prisma `schema.prisma:324,350` (`String` columns stay; no
  migration), `analytics-scale-seed.types.ts:51,64` (seed scaffolding,
  not the product contract), or any seed writer (all already emit
  `'sha256'`).
- No change to metrics `jobName` / `queueName` / HTTP `method` /
  `rawPath` carriers (free-form names/paths with no closed authority,
  per prompt 125), `JobRun.jobName` (free-form `String` column), AI
  `provider` / `model` / `promptTemplateVersion` / `purpose`
  (explicitly deferred decisions owned elsewhere), dashboard-evidence
  `schemaVersion`, analytics `code` / `message` / `calculationVersion`
  (deliberately open per prompts 115/121), audit `targetType`
  (deliberately open per prompt 128), or any id/timestamp: different
  domains or deliberately open carriers.
- No new shared alias, second contract file, value import, inline
  union wider than the single literal, cast helper, validator,
  per-value branch, or mapping change.
- No schema migration, SQL, Prisma repository, RLS, index, tenant,
  worker queue, storage flow, route, API contract, client component,
  design, accessibility, motion, or browser work.
- No new test cases and no invented negative-type-test pattern
  (`ts-expect-error` / `expectTypeOf` have zero uses in this repository);
  no general uploads refactor or unrelated cleanup.

## Reference deltas

No visual delta. The deliberate static delta is limited to four
annotations in one shared contract file: invented verbs and algorithms
no longer reach the signed-transport boundaries at compile time.
Returned results, presigned URLs, HTTP calls, OpenAPI snapshots, and
every error path are observably identical before and after.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this shared upload-contract type change. No
responsive, touch-target, or reduced-motion surface moves.

## Checks to run, and the owning doc

```bash
# Public contracts must remain unchanged (runtime envelopes stay stringSchema)
npm run contracts:check

# Focused regression proof: unchanged uploads/storage unit outcomes
npm run test --workspace=@acres/server -- src/uploads src/storage

# Focused client proof: unchanged helper outcomes (mocks already emit members)
npm run test --workspace=@acres/client -- tests/api-helpers.spec.ts

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/129-upload-method-checksum-algorithm-narrowing.md \
  docs/backend.md \
  packages/shared/src/uploads.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/129-upload-method-checksum-algorithm-narrowing.md \
  docs/backend.md \
  packages/shared/src/uploads.ts
```

Quote the actual exit status and meaningful test/build totals. Real
PostgreSQL, spatial plan, and operations-drill suites are intentionally
omitted because this scope adds no rejection path, changes no
schema/query behavior, and touches no browser journey or deployment
surface. (Typecheck across all three workspaces is the admission gate
— server producers and client consumers must both compile unchanged —
plus the unchanged runtime suites.)

`docs/backend.md` owns the implementation record. `docs/security.md` is
read-only verification for this task; update it only if execution proves a
statement materially stale, and stop before broadening scope.

## Rollback and stop conditions

Rollback is a source/doc revert; there is no migration or
persisted-data rollback. Stop before expanding scope if any of these occur:

- the carrier grep shows other than the four known carriers at
  execution time;
- the producer grep shows a second algorithm, a second complete verb,
  or a port/adapter value disagreeing with `'sha256'` / `'PUT'` /
  `'POST'` / `'GET'`;
- the consumer grep shows a constructing consumer with a non-member
  value (especially a second storage adapter, a client upload path
  building its own method, or a REST controller exposing these
  results with literal construction);
- a producer no longer emits the member literal, or typecheck rejects
  an unchanged producer or an unchanged consumer (unions diverged) —
  restore and re-decide scope rather than adding a cast, guard,
  adapter edit, or consumer edit;
- an existing server or client test changes outcome (not just
  compilation) after the edit;
- a public contract snapshot changes;
- the fix requires a shared alias, a wider union, a cast, a validator,
  a per-value branch, a mapping change, an error code/message, a schema
  change, a repository rewrite, a controller-schema change, a seed
  rewrite, a spec rewrite, or a client change.

Report the contradictory evidence and prepare a separate prompt rather
than silently changing the premise.

## Completion criteria

- All four signed-transport carriers accept only their single literal
  at compile time, with unchanged producers and consumers.
- No alias, cast, validator, or runtime edge introduced, and no new
  module created.
- The presign calls, literals, permission gates, controller envelopes,
  client fetch calls, and all other lines are byte-for-byte equivalent
  in behavior.
- Current server and client suites pass with identical results and
  headers.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all
  verified blocking/important findings are fixed and re-tested.
- `docs/backend.md` records the single-literal invariant per carrier
  with its producer authority, the narrow-all-four adjacency judgement,
  the deliberate `mediaType`/stage/failure/envelope/column/seed
  openness with the reason for each, and the no-runtime-change proof.
- Only the approved paths are committed locally to `main`; nothing is
  pushed.

## SKILLS USED

- `architecture-patterns` — couple the shared contract to the single
  producer authorities (port literal types, adapter literals, service
  write sites) without duplicating literals into a new alias and
  without creating any new cross-module edge; single literals inline,
  mirroring the `reports.ts:174` precedent.
- `nestjs-best-practices` — keep the change outside Nest provider/module
  wiring; `UploadsService` presign producers and controller envelopes
  are read-only witnesses, and the edit is contract annotations only
  (`arch-avoid-circular-deps` needs no new import: literals, not types).
- `api-design-principles` — guard duty only: no public route, envelope,
  or verb change; runtime `stringSchema()` envelopes stay open and
  `contracts:check` proves the contract snapshots are unchanged.
- `openapi-spec-generation` — not loaded: no REST surface changes and no
  contract artifact may move (guard duty covered by
  `api-design-principles` above).
- `postgres-best-practices` — verify no schema, migration, transaction,
  RLS, or persistence change; the `String` columns and every write are
  identical.
- `sql-optimization-patterns` — not loaded: no query, index, or
  query-plan work is introduced by this annotation-only change (guard
  duty covered by `postgres-best-practices` above).
- `security-best-practices` — guard duty only: no trust-boundary or
  persistence change; presigned-URL scoping, checksum binding, and
  permission gates untouched; read-only verification against
  `docs/security.md`.
- `security-threat-model` — verify checksum binding and presigned-URL
  scoping keep their runtime enforcement and transport typing was never
  an enforcement point; no risk reclassification.
- `error-handling-patterns` — keep the deterministic
  not-found/forbidden/validation paths and existing upload error
  behavior; no new failure literal is introduced.
- `javascript-testing-patterns` — rely on the existing uploads/storage
  unit scopes plus the client helper scope as unchanged-outcome
  regression proof; no test semantics changed.
- `e2e-testing-patterns` — guard duty only: no cross-system journey
  changes; E2E intentionally omitted per §Checks (fixtures already emit
  members).
- `secrets-management` — guard duty only: presigned URLs, signatures,
  checksums, and idempotency keys are untouched; no credential surface
  changes.
- `requesting-code-review` — dispatch the mandatory structured read-only
  review with precise scope, SHAs, changed paths, and check evidence.
- `receiving-code-review` — verify reviewer claims against repository
  reality before fixes or technical pushback.
- `caveman-commit` — produce the required terse Conventional Commit
  message with a short signed-transport rationale body.

Not loaded, with reason: `playwright` (no upload UI or browser journey
change; consumers compile unchanged); frontend/Tailwind/shadcn/GSAP
skills (no UI or motion).
