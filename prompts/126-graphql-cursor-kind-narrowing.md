# 126 — narrow GraphQL cursor `kind: string` to the closed four-member `CursorKind` union

## Scope, and why it is next

The committed repository is on `main` at `8e65979`
(`refactor(metrics): narrow parser source-kind type`, the prompt 125
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 125 — which closed the metrics write path (`recordParserExecution`
`sourceKind` admits only `SourceKind`, `import type`, unchanged `safeKind`
guard, no runtime change).

There is no unbuilt ordered phase left. A repo-wide grep over `server/src`
this session (`kind: string` plus `connectionWindow|connectionFromWindow|
codec\.(encode|decode)`) proves exactly four open cursor-kind carriers exist
and exactly one closed kind vocabulary is already stated by the call sites:

```ts
// server/src/graphql/cursor-codec.ts:6–11 — OPEN
interface CursorPayload {
  v: 1;
  kind: string; // ← open (four cursor kinds, see below)
  organizationId: string | null;
  sort: readonly [string, string];
}

// server/src/graphql/cursor-codec.ts:23–26 — OPEN
decode(
  cursor: string | null | undefined,
  expected: { kind: string; organizationId: string | null }, // ← open
): CursorPayload | null {

// server/src/graphql/pagination.ts:16–23 — OPEN
export function connectionWindow(options: {
  first: number | undefined;
  after: string | undefined;
  kind: string; // ← open
  organizationId: string | null;
  codec: CursorCodec;
  config: AcresConfigService;
}): ConnectionWindow {

// server/src/graphql/pagination.ts:49–54 — OPEN
return connectionFromWindow(rows, ...) // options.kind:
  kind: string; // ← open (:51)
```

against the eight call sites that already state the closed vocabulary — four
pairs of member literals, two per connection (one `connectionWindow`, one
`connectionFromWindow`), in `server/src/graphql/acres.resolver.ts`:

- `:97,111` — `kind: 'organizationMembers'`;
- `:141,155` — `kind: 'organizationInvitations'`;
- `:185,199` — `kind: 'organizationAuditEvents'`;
- `:227,241` — `kind: 'regions'`.

No fifth `kind` literal exists (the `kind:` grep over `server/src` and
`client` returns only these eight plus the four open declarations and the
unrelated `method`/`source_kind` label keys). No other
`connectionWindow` / `connectionFromWindow` / `codec.encode` / `codec.decode`
caller exists (the caller grep returns only `acres.resolver.ts` plus the
internal `pagination.ts` encode/decode calls at `:34` / `:58`). No dashboard,
report, or analytics resolver paginates through this helper. No spec file
constructs a cursor kind (there are zero `*.spec.ts` files under
`server/src/graphql/`, verified this session), so no typed negative test can
break compilation.

This is the direct continuation of prompts 120–125, which narrowed the
ingestion `toX()` mappers, the shared ingestion contract, the reports `toX()`
mappers, the upload read state, the SSE terminal predicates, and the metrics
`sourceKind` — each with unchanged bodies and no runtime change. It closes the
last open `string` carrier on the Phase 4 GraphQL cursor path rather than
leaving a known remainder.

Introducing one new exported alias (`CursorKind` in `cursor-codec.ts`,
imported as `import type` into `pagination.ts`) rather than an indexed access
or four duplicated inline unions is a judgement, stated as one: unlike prompts
123/124 there is no DTO field to index — no shared contract, Prisma enum, or
generated enum states these four kinds (they are GraphQL connection names,
not persisted values) — and a four-times-duplicated inline union drifts the
day a fifth connection appears, while the single alias cannot. The alias lives
in `cursor-codec.ts` because that module owns `CursorPayload`, the lowest-level
carrier the other three sites all observe; `pagination.ts` is the only file
that gains an import, and the resolver's eight literals are already members,
so the resolver is a witness and is not edited. Per `arch-avoid-circular-deps`
the import is `import type` (erased at compile time): `pagination.ts` already
holds a value import of `CursorCodec`, and the kind alias must not add a
second runtime edge for a pure annotation.

Leaving the `decode` kind-mismatch rejection
(`parsed.kind !== expected.kind`, `cursor-codec.ts:44`) byte-for-byte unchanged
is a judgement, stated as one: after narrowing, a cross-kind construction
fails typecheck at the `connectionWindow` / `connectionFromWindow` boundary,
but opaque cursors arriving over HTTP are untyped by construction
(`after?: string`, attacker-controlled base64url), so the runtime rejection of
a foreign or cross-kind cursor stays as defense-in-depth — the same
unchanged-body policy prompts 120–125 applied to guards and predicates.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 4 versioned-REST/GraphQL outcome and exact phase
  skill manifest (§5); §§16–22 confirming no unbuilt ordered phase.
- `docs/backend.md` — GraphQL read surface section (`:1845–1860`, connection
  resolvers validate `first`/`after`, `take: first + 1`, DataLoader batching)
  and the OpenAPI/SDL drift-guard section (`:1831–1843`). The owning
  implementation record for this prompt (read surface only).
- `docs/security.md` — TM boundaries. This work tightens the cursor-kind
  contract under the existing Phase 4 GraphQL boundary (cross-tenant cursor
  confusion is already rejected at runtime in `decode`); it does not add or
  move a trust boundary, persist new data, or change an envelope.
- `server/src/graphql/cursor-codec.ts` — `CursorPayload` (`:6–11`, open
  `kind`), `encode` (`:17–21`, observes `CursorPayload`), `decode` (`:23–55`,
  open `expected.kind`, unchanged kind/organization/sort rejection at
  `:42–50`). Re-read at execution and resolve current line numbers rather
  than editing from this snapshot.
- `server/src/graphql/pagination.ts` — `connectionWindow` (`:16–43`, open
  `kind`, internal `decode` call at `:34`), `connectionFromWindow` (`:45–72`,
  open `kind`, internal `encode` call at `:58`). Re-read at execution. Imports
  today: `ApiException`, `AcresConfigService`, `CursorCodec` value import
  (`:1–3`); no `CursorKind` import exists.
- `server/src/graphql/acres.resolver.ts` — the eight member literals
  (`:94–114`, `:138–158`, `:182–202`, `:224–244`, two per connection).
  Read-only witnesses; unchanged.
- `server/src/graphql/graphql.types.ts:337` — `@Field` description
  `'Value kind.'` for the metric value-kind domain (prompt 118). Different
  domain; read-only witness that the word "kind" here must not be touched.
- `server/src/graphql/graphql-limits.ts` — `Kind.OPERATION_DEFINITION` /
  `Kind.FIELD` etc. are the `graphql-js` AST `Kind` enum. Different domain;
  unchanged.
- `prompts/124-sse-terminal-predicate-narrowing.md` — the closest lineage
  prompt (open `string` params narrowed to closed unions, one `import type`
  per file, unchanged bodies, contracts guard) this prompt mirrors for the
  four cursor-kind carriers, with a new exported alias instead of indexed
  access because no DTO authority exists here.
- `prompts/125-metrics-parser-source-kind-narrowing.md` — the named-alias
  judgement precedent (couple the consumer to the single vocabulary authority
  via an erased `import type`, zero duplicated literals) this prompt mirrors,
  with the alias defined (not merely imported) because no authority states it
  yet.

No visual reference is applicable. This is an internal GraphQL cursor-parameter
type change, so the design-system PDF, landing-page PNGs, and recorded chrome
flows provide no evidence and must not be opened or cited as if they did.

## Measurements and verified invariants

These are code-derived constraints at `8e65979`; re-verify them before editing:

1. Exactly four open cursor-kind carriers plus eight member-literal call
   sites: the `kind: string` grep over `server/src` returns only
   `cursor-codec.ts:8`, `cursor-codec.ts:25`, `pagination.ts:19`,
   `pagination.ts:51`, and the `kind:` grep returns only the eight resolver
   literals above (plus unrelated `method`/`source_kind` label keys and the
   `graphql-js` AST `Kind` uses). Re-run both greps at execution; if a fifth
   carrier, a fifth literal, or a new `connectionWindow` caller appeared, stop
   and report it rather than silently widening scope.
2. The closed vocabulary is exactly four connection names, byte-for-byte
   `organizationMembers | organizationInvitations | organizationAuditEvents |
regions`, each appearing exactly twice (window + fromWindow) in
   `acres.resolver.ts`. If the pairs disagree at execution (e.g. a window
   passes one kind and its fromWindow another), stop and report it rather
   than picking a winner silently.
3. No other module constructs a cursor: the
   `connectionWindow|connectionFromWindow|codec\.(encode|decode)` grep returns
   only `acres.resolver.ts` and the two internal `pagination.ts` calls. If a
   dashboard, report, or analytics resolver started paginating through this
   helper at execution, record it — the alias membership must be re-derived,
   not silently assumed.
4. No spec constructs a cursor kind (zero `*.spec.ts` files under
   `server/src/graphql/`, verified this session). Re-verify at execution; if
   a spec appeared that passes a foreign kind to prove runtime rejection,
   stop — narrowing the param type would break its compilation and the scope
   must be re-decided, not silently absorbed.
5. The opaque cursor transport stays `string` by design: `after?: string`
   (four resolver signatures), `after: string | undefined`
   (`pagination.ts:18`), `decode(cursor: string | null | undefined, ...)`
   (`cursor-codec.ts:24`), `encode(...): string` (`:17`), and
   `endCursor: string | null` (`pagination.ts:7`) are untyped wire values,
   not vocabulary carriers. None is narrowed by this prompt.
6. `sort: readonly [string, string]` (`cursor-codec.ts:10`) and
   `organizationId: string | null` stay open by design: sort values are
   timestamps/ids/names with no closed authority, and organization ids are
   UUIDs. Narrowing either would invent a contract — forbidden by §10.
7. No runtime value moves: every connection maps to the identical cursor
   string for every row (same kind literal into the same JSON body, same HMAC,
   same base64url) and `decode` returns the identical boolean/payload for
   every input. A server test that changes outcome (not just compilation)
   after this edit disproves the premise — stop and report it.
8. The SDL/OpenAPI artifacts contain no cursor-kind enum (cursors are opaque
   `String` args/fields); `contracts:check` must still report no artifact
   change. If a snapshot moves, stop — a cursor-kind narrowing with
   already-member runtime values must not alter a public contract snapshot.
9. There is no established negative-type-test pattern in this repository
   (verified through prompt 125: zero `ts-expect-error` / `expectTypeOf`
   uses in `server/src`, `client/`, `packages/shared/src`). Do not invent
   one; the gates are `npm run typecheck` (which must reject a future
   fifth-kind argument at the four boundaries) plus unchanged runtime suites.

The required shape:

```ts
// server/src/graphql/cursor-codec.ts (one new exported alias; no other change)
export type CursorKind =
  | "organizationMembers"
  | "organizationInvitations"
  | "organizationAuditEvents"
  | "regions";

interface CursorPayload {
  v: 1;
  kind: CursorKind; // ← narrowed (was string)
  organizationId: string | null;
  sort: readonly [string, string]; // ← stays open by decision
}
// decode: expected: { kind: CursorKind; organizationId: string | null }
// decode body, kind-mismatch rejection, MAC, and encode stay byte-for-byte identical.
```

```ts
// server/src/graphql/pagination.ts (one new type-only import; no other import change)
import type { CursorKind } from "./cursor-codec";
// connectionWindow options: kind: CursorKind (was string)
// connectionFromWindow options: kind: CursorKind (was string)
// window/take/afterId logic, encode/decode calls, and sortValue stay byte-for-byte identical.
```

Do not introduce a value import, a shared-contract alias, a Prisma-enum
import, a validator, a per-value branch, a coercion change, or a new literal.
Resolver literals stay exactly as written (they are already members).

## Expected impact

- Routes changed: none (`/graphql` path, verbs, guards, and query shapes are
  untouched).
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none (cursors are
  opaque `String` args/fields; emitted cursor bytes already carry member
  kinds; type-only param narrowing cannot alter a snapshot).
- Database schema, Prisma models, migrations, RLS, queries, indexes, queues,
  and persisted-data formats changed: none (`take: first + 1` / `afterId`
  values are identical).
- Runtime server behavior: unchanged — every connection maps to the identical
  edge/pageInfo sequence with identical cursor strings, and `decode` accepts
  and rejects the identical cursor set (including foreign and cross-kind
  cursors, still rejected at runtime).
- Compile-time contract: the four cursor boundaries no longer admit an
  invented connection name at any call site. A future fifth connection
  passing a new kind fails typecheck until `CursorKind` is extended by
  separate decision, instead of compiling through `string`.
- Logging/observability: unchanged; no cursor kind is logged beyond existing
  paths.
- Threat model: no new boundary and no risk reclassification. The change adds
  one concrete cursor-kind type-contract detail under the existing Phase 4
  read-only GraphQL behavior. The cross-kind/cross-tenant cursor-confusion
  control keeps both layers: compile-time admission plus the unchanged runtime
  `decode` rejection for untyped wire input.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and
   every skill named in `## SKILLS USED`. Confirm `git status --short`
   before editing; preserve any unrelated user changes and stop if they
   overlap an approved path. Confirm `HEAD` is `8e65979` (or record the
   actual SHA and adjust `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–4 at execution: re-run the `kind: string`
   and `kind:` greps over `server/src` / `client`, re-run the
   `connectionWindow|connectionFromWindow|codec\.(encode|decode)` caller grep,
   confirm the four window/fromWindow literal pairs agree, and confirm zero
   `*.spec.ts` files under `server/src/graphql/` (or triage any new spec per
   item 4). If a fifth carrier, a fifth literal, a disagreeing pair, a new
   caller, or a kind-constructing spec appears, stop and report it rather
   than silently widening scope.
3. In `server/src/graphql/cursor-codec.ts`, make only two edits: add the
   exported `CursorKind` alias (four members, resolver order:
   `organizationMembers, organizationInvitations, organizationAuditEvents,
regions`), and change `CursorPayload.kind` plus the `decode` `expected.kind`
   to `CursorKind`. Leave `encode`, the `decode` body (including the
   kind-mismatch rejection), the MAC, `sort`, `organizationId`, and every
   other line byte-for-byte unchanged. Do not add any other export, import,
   cast, or validator.
4. In `server/src/graphql/pagination.ts`, make only three edits: add
   `import type { CursorKind } from './cursor-codec';` (or reuse the import
   if one appeared), and change both `kind: string` options fields to
   `kind: CursorKind`. Leave the window/take/afterId logic, the internal
   encode/decode calls, `sortValue`, and every other line byte-for-byte
   unchanged. Do not add any value import, alias, cast, or validator.
5. Make no other production edit: no resolver literal, DTO, GraphQL type,
   Prisma schema, migration, seed, spec, repository, worker, scanner, storage
   port, outbox payload, retention job, AI draft surface, metrics label, or
   client change. If typecheck demands more than the one alias plus the four
   annotations plus the one import, restore and report rather than expanding
   scope.
6. Run `npm run contracts:check` and verify no generated REST/OpenAPI/
   GraphQL artifact changes. This narrowing must not alter a public contract
   snapshot (cursors stay opaque `String`).
7. Update `docs/backend.md` in the GraphQL read surface section (`:1845–1860`,
   or the verification section if that is where the cursor contract lives at
   execution). Record that the four cursor-kind carriers (`CursorPayload.kind`,
   `decode` `expected.kind`, both pagination `kind` options) admit only
   `CursorKind` (four connection names, new exported alias in
   `cursor-codec.ts`, one erased `import type` in `pagination.ts`); that the
   opaque `after`/`endCursor` wire strings, `sort`, and `organizationId`
   deliberately stay open; that the `decode` kind-mismatch rejection stays as
   defense-in-depth for untyped wire input; and that no cursor byte, edge
   sequence, or contract artifact changed.
8. Inspect the complete diff, run every check below, and quote real exit
   status plus meaningful test/build totals. Fix issues before review.
9. Run the mandatory two-stage review loop:
   - dispatch a read-only reviewer subagent with `requesting-code-review`,
     this prompt path, `BASE_SHA=8e65979` (or the recorded actual HEAD),
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
    - `prompts/126-graphql-cursor-kind-narrowing.md`;
    - `docs/backend.md`;
    - `server/src/graphql/cursor-codec.ts`;
    - `server/src/graphql/pagination.ts`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend,
      or push. Use a terse Conventional Commit subject and include a short
      body explaining the cursor-kind reason, because it is not obvious
      from the subject alone.

## Non-goals

- No change to `acres.resolver.ts` literals: witnesses only; the eight kind
  values are already members. No resolver, guard, permission, timeout, or
  service-call change.
- No change to the opaque cursor wire strings (`after?: string`,
  `after: string | undefined`, `decode` `cursor` param, `encode` return,
  `endCursor: string | null`): untyped wire values, not vocabulary carriers;
  narrowing them would break attacker-controlled input handling.
- No change to `sort: readonly [string, string]` or `sortValue`: free-form
  timestamp/id/name values with no closed authority; stays open like
  analytics `code` / `message` per prompt 115.
- No change to `organizationId: string | null` in any cursor carrier: UUIDs,
  not a vocabulary.
- No change to `graphql.types.ts` value-kind field, `graphql-limits.ts`
  `graphql-js` AST `Kind` uses, metrics `jobName` / `queueName` / HTTP
  `method` / `rawPath` carriers (free-form names/paths with no closed
  authority, per prompt 125), `JobRun.jobName` (free-form `String` column),
  upload `progressStage`, any `failure.code` / `message`, controller response
  schemas (`stringSchema()` stays), dashboard-evidence `schemaVersion`, or AI
  `provider` / `model` / `promptTemplateVersion`: different domains or
  explicitly deferred decisions owned elsewhere.
- No new import beyond the one type-only `CursorKind` import, and no shared
  alias, Prisma-enum import, validator, cast helper, per-value branch,
  coercion change, or literal addition.
- No schema migration, SQL, Prisma repository, RLS, index, tenant, worker
  queue, storage, upload flow, route, API contract, client component,
  design, accessibility, motion, or browser work.
- No new test cases and no invented negative-type-test pattern
  (`ts-expect-error` / `expectTypeOf` have zero uses in this repository);
  no general GraphQL refactor or unrelated cleanup.

## Reference deltas

No visual delta. The deliberate static delta is limited to one new exported
alias, four parameter annotations, and one type-only import: invented cursor
kinds no longer reach the pagination/codec boundary at compile time. Runtime
cursor bytes, edge sequences, rejection paths, OpenAPI snapshots, SDL, and
every error path are observably identical before and after.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this server cursor type change. No responsive,
touch-target, or reduced-motion surface moves.

## Checks to run, and the owning doc

```bash
# Public contracts must remain unchanged (cursors stay opaque String)
npm run contracts:check

# No dedicated cursor spec exists (zero *.spec.ts under server/src/graphql/,
# verified this session); typecheck is the admission gate plus the unchanged
# runtime suites below. If a cursor-adjacent spec appeared at execution time,
# locate it with `rg --files server/src/graphql`, run it, and record that
# evidence instead of claiming a nonexistent check.

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/126-graphql-cursor-kind-narrowing.md \
  docs/backend.md \
  server/src/graphql/cursor-codec.ts \
  server/src/graphql/pagination.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/126-graphql-cursor-kind-narrowing.md \
  docs/backend.md \
  server/src/graphql/cursor-codec.ts \
  server/src/graphql/pagination.ts
```

Quote the actual exit status and meaningful build totals. Browser E2E, real
PostgreSQL, spatial plan, and operations-drill suites are intentionally
omitted because this scope adds no rejection path, changes no schema/query
behavior, and touches no browser journey or deployment surface.

`docs/backend.md` owns the implementation record. `docs/security.md` is
read-only verification for this task; update it only if execution proves a
statement materially stale, and stop before broadening scope.

## Rollback and stop conditions

Rollback is a source/doc revert; there is no migration or
persisted-data rollback. Stop before expanding scope if any of these occur:

- the `kind: string` grep shows other than the four known carriers at
  execution time, or the `kind:` grep shows other than the eight known
  member literals;
- a window/fromWindow pair disagrees on kind for the same connection;
- a new `connectionWindow` / `connectionFromWindow` / codec caller appeared
  (especially a dashboard, report, or analytics resolver);
- a spec appeared that constructs a cursor kind (typed negative test would
  break compilation — re-decide scope instead of absorbing it);
- `pagination.ts` already imports `CursorKind` in a way that changes the
  planned diff — reuse it and record the smaller diff rather than absorbing
  unrelated import churn;
- a value import (not `import type`) is required for the annotation to
  compile — restore and prepare a separate prompt, because a new runtime edge
  is a different architectural decision;
- an existing server test changes outcome (not just compilation) after
  the edit;
- a public contract snapshot changes;
- the fix requires a new literal, validator, cast, alias beyond `CursorKind`,
  import beyond the one type-only import, error code/message, schema change,
  repository rewrite, resolver change, seed rewrite, spec rewrite, or client
  change.

Report the contradictory evidence and prepare a separate prompt rather
than silently changing the premise.

## Completion criteria

- All four cursor-kind carriers accept only `CursorKind`
  (`organizationMembers | organizationInvitations | organizationAuditEvents |
regions`) at compile time, with unchanged bodies.
- Exactly one new exported alias plus one type-only import; no other import,
  alias, cast, or validator introduced, and no new runtime module edge
  created.
- The eight resolver literals, opaque wire strings, `sort`,
  `organizationId`, MAC, rejection paths, and all other lines are
  byte-for-byte equivalent in behavior.
- Current server suites pass with identical cursor bytes and edge sequences.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all
  verified blocking/important findings are fixed and re-tested.
- `docs/backend.md` records the `CursorKind` invariant, the define-in-codec
  judgement with its no-runtime-edge proof, the deliberate wire/sort/org
  openness, the retained `decode` rejection with its wire-input rationale,
  and the no-runtime-change proof.
- Only the approved paths are committed locally to `main`; nothing is
  pushed.

## SKILLS USED

- `architecture-patterns` — define the new `CursorKind` alias in the module
  that owns `CursorPayload` (`cursor-codec.ts`) and couple `pagination.ts`
  to it via an erased `import type`, avoiding duplicated literals and any
  new runtime cross-module edge.
- `nestjs-best-practices` — keep the change outside Nest provider/module
  wiring; the codec is an `@Injectable()` whose cursor methods are pure
  encode/decode, and the pagination helpers are free functions — read-only
  except for annotations plus the alias and type-only import.
- `api-design-principles` — guard duty only: no public route, cursor shape,
  or envelope change; opaque cursors stay `String` and `contracts:check`
  proves the contract snapshots are unchanged.
- `auth-implementation-patterns` — verify the cursor `organizationId`
  binding and the resolver organization-context-first ordering stay
  untouched; no session, membership, or context change.
- `postgres-best-practices` — verify no schema, migration, transaction, RLS,
  or persistence change; `take`/`afterId` values are identical.
- `sql-optimization-patterns` — verify no query, index, or query-plan work
  is introduced by this in-memory type change.
- `security-best-practices` — guard duty only: no trust-boundary or
  persistence change; read-only verification against `docs/security.md`.
- `security-threat-model` — verify the cursor-confusion control keeps both
  layers (compile-time admission plus unchanged runtime `decode` rejection
  for untyped wire input); no risk reclassification.
- `error-handling-patterns` — keep the deterministic `decode` rejection
  (`cursorInvalid`) and existing resolver not-found paths; no new failure
  literal is introduced.
- `javascript-testing-patterns` — rely on the existing server suites as
  unchanged-outcome regression proof; no test semantics changed.
- `e2e-testing-patterns` — guard duty only: no cross-system journey
  changes; E2E intentionally omitted per §Checks.
- `secrets-management` — guard duty only: the cursor HMAC key
  (`sessionSecret`) is untouched; no credential surface changes.
- `requesting-code-review` — dispatch the mandatory structured read-only
  review with precise scope, SHAs, changed paths, and check evidence.
- `receiving-code-review` — verify reviewer claims against repository
  reality before fixes or technical pushback.
- `caveman-commit` — produce the required terse Conventional Commit
  message with a short cursor-kind rationale body.

Not loaded, with reason: `openapi-spec-generation` (contracts:check guard
duty only, no public contract change); `playwright` (no cursor UI or browser
journey); frontend/Tailwind/shadcn/GSAP skills (no UI or motion).
