# 128 — narrow audit-event read `action: string` to the closed `AuditAction` union

## Scope, and why it is next

The committed repository is on `main` at `0d74388`
(`refactor(mail): narrow invitation role union`, the prompt 127
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 127 — which closed the last open role carrier on the invitation-mail
path (one annotation plus one erased `import type`, unchanged body, no
runtime change).

There is no unbuilt ordered phase left. A repo-wide grep over `server/src`
this session proves exactly two open audit-action carriers remain and a
closed ten-member vocabulary is already stated by every adjacent authority:

```ts
// server/src/organizations/organizations.service.ts — OPEN (both inline returns)
async auditEvents(context: OrganizationContext): Promise<
  Array<{
    id: string;
    action: string; // ← open (AuditAction, see below)
    targetType: string;
    ...
```

```ts
async auditEventsPage(
  context: OrganizationContext,
  take: number,
  afterId?: string,
): Promise<
  Array<{
    id: string;
    action: string; // ← open (AuditAction, see below)
    targetType: string;
    ...
```

against the authorities that already state the closed vocabulary:

- `server/prisma/schema.prisma:251` — `AuditEvent.action AuditAction`
  (column is the enum, not `String`);
- `server/prisma/schema.prisma:296–307` — `enum AuditAction` (ten members:
  `organization_created`, `organization_updated`, `invitation_issued`,
  `invitation_revoked`, `invitation_accepted`, `membership_role_changed`,
  `membership_revoked`, `ownership_transferred`, `report_published`,
  `export_requested`);
- `server/src/generated/prisma/enums.ts` — the generated `AuditAction`
  mirror (imported as `import type` by `audit.service.ts:2`, so the import
  path is proven inside `server/`);
- `server/src/organizations/audit.service.ts:25` — `append` already admits
  only `action: AuditAction`, with `satisfies Record<AuditAction, string[]>`
  (`:16`) pinning the details allowlist to the same ten members;
- both read methods map Prisma `row.action` (already `AuditAction`-typed)
  into the open annotation — the widening is in the inline return type,
  not in the data.

No other `action: string` carrier exists for audit rows (the grep returns
only these two inline returns plus the unrelated `AuditAction`-free
`action` label keys elsewhere). Zero `*.spec.ts` files reference
`auditEvents` (verified this session), so no mock constructs an audit
action and no typed test can break compilation.

This is the direct continuation of prompts 120–127, which narrowed the
ingestion `toX()` mappers, the shared ingestion/dashboard contracts, the
reports `toX()` mappers, the upload read state, the SSE terminal
predicates, the metrics `sourceKind`, the GraphQL cursor kinds, and the
mail role — each with unchanged bodies and no runtime change. It closes the
last open `string` carrier on the Phase 3 audit-read path rather than
leaving a known remainder. It mirrors prompt 120 most closely
(Prisma-enum-typed row flowing into an open read carrier, erased
`import type` from the generated enums, no runtime change).

Extending the existing `import type { OrganizationRole }` braces in
`organizations.service.ts:6` rather than adding a second import line is a
judgement, stated as one: the module already holds the erased
generated-enums edge, so `AuditAction` joins it with zero new module edges
— strictly smaller than the one-new-import diffs of prompts 120–127. Per
`arch-avoid-circular-deps` the import stays `import type` (erased at
compile time): the annotation needs the union only.

Narrowing `auditEvents` (non-page) together with `auditEventsPage`, even
though only the page variant has a caller today (`acres.resolver.ts:191`;
the non-page variant has zero external callers, verified this session), is
a judgement, stated as one: the two methods declare the identical inline
row shape over the identical Prisma table, and narrowing one while leaving
the other open re-creates exactly the remainder this prompt exists to
close. No caller is added, removed, or edited — the uncalled method is
left in place (removing it is a separate YAGNI decision, explicitly
out of scope).

Leaving `targetType: string` open in both returns is a judgement, stated
as one: unlike `action`, the schema column is free-form `String`
(`schema.prisma:252`), no enum authority states the vocabulary, and the
production literals span two modules (`'organization'`, `'membership'`,
`'invitation'` in `organizations.service.ts`; `'ReportRevision'`,
`'ExportRequest'` in `reports.service.ts`). Narrowing it would invent a
contract — forbidden by §10. The same holds for `targetId`, every id, and
every timestamp. `AuditService.append`'s `targetType: string` input
(`audit.service.ts:26`) stays open for the same reason.

Leaving the GraphQL `OrganizationAuditEventGql.action` field as `@Field()
string` (`graphql.types.ts:184–185`) is a judgement, stated as one: the
ten members remain assignable to `string`, so the resolver compiles
unchanged, while the emitted SDL stays byte-identical. A GraphQL enum
would be a public-contract change — explicitly out of scope — and
`contracts:check` proves the snapshots do not move.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 3 organizations/permissions/RLS outcome and
  exact phase skill manifest (§4, incl. the prompt 55/56 verification
  updates); Phase 4 GraphQL read surface (§5); §§16–22 confirming no
  unbuilt ordered phase.
- `docs/backend.md` — organizations/audit sections (audit history,
  `AuditService.append`, audit read surface). The owning implementation
  record for this prompt (read carriers only).
- `docs/security.md` — audit-log asset and TM boundaries. This work
  tightens the audit-read contract under the existing Phase 3 governance
  boundary (the append-only history and its permission gate,
  `audit.read`, are untouched); it does not add or move a trust boundary,
  persist new data, or change an envelope. Read-only verification unless
  execution proves a statement materially stale.
- `server/src/organizations/organizations.service.ts` — `auditEvents`
  (`~:435–465`, open `action` at `~:437`) and `auditEventsPage`
  (`~:471–510`, open `action` at `~:475`); the existing erased import at
  `:6` (`import type { OrganizationRole } from
'../generated/prisma/enums'`). Re-read at execution and resolve current
  line numbers rather than editing from this snapshot.
- `server/src/organizations/audit.service.ts:1–30` — the closed write
  path (`import type { AuditAction }`, `action: AuditAction` input,
  `satisfies Record<AuditAction, string[]>`). Read-only witness;
  unchanged. Precedent that the generated-enums `import type` resolves in
  this directory.
- `server/prisma/schema.prisma:246–307` — `AuditEvent.action AuditAction`
  (`:251`), `targetType String` (`:252`, deliberately open), `enum
AuditAction` (`:296–307`, ten members). Read-only witness; unchanged (no
  migration).
- `server/src/graphql/acres.resolver.ts:180–204` — the sole
  `auditEventsPage` caller (`:191`) inside the `organizationAuditEvents`
  connection; kind literal already narrowed by prompt 126. Read-only
  witness; unchanged.
- `server/src/graphql/graphql.types.ts:179–204` —
  `OrganizationAuditEventGql.action` as `@Field() string` (`:184–185`).
  Read-only witness; unchanged (SDL must not move).
- `server/src/graphql/pagination.ts`, `cursor-codec.ts` — prompt 126
  output. Read-only witnesses that cursor kinds are already closed;
  unchanged.
- `prompts/120-ingestion-read-enum-narrowing.md` — the closest lineage
  prompt (Prisma-enum-typed row into an open read carrier, erased import
  from generated enums, unchanged bodies, contracts guard) this prompt
  mirrors for the two audit-action carriers.
- `prompts/127-mail-invitation-role-narrowing.md` — the import-judgement
  precedent (couple the consumer to the single vocabulary authority via an
  erased `import type`, zero duplicated literals) this prompt mirrors,
  with the alias joined into the existing braces (not a new import line)
  because the edge already exists in this module.

No visual reference is applicable. This is an internal audit-read type
change, so the design-system PDF, landing-page PNGs, and recorded chrome
flows provide no evidence and must not be opened or cited as if they did.

## Measurements and verified invariants

These are code-derived constraints at `0d74388`; re-verify them before editing:

1. Exactly two open audit-action carriers: the `action: string` grep over
   `server/src` (excluding specs and generated code) returns only the two
   inline returns in `organizations.service.ts`. Re-run at execution; if a
   third carrier appeared, stop and report it rather than silently
   widening scope.
2. The closed vocabulary is exactly ten action names, byte-for-byte the
   `enum AuditAction` members in `schema.prisma:296–307`, mirrored by the
   generated enums and already consumed as `AuditAction` by
   `audit.service.ts`. If the authorities disagree at execution, stop and
   report it rather than picking a winner silently.
3. Exactly one external caller of the two methods: `acres.resolver.ts:191`
   calls `auditEventsPage`; `auditEvents` (non-page) has zero external
   callers. Re-run the caller grep at execution; if a second caller
   appeared (especially one constructing a free-form action, or a REST
   controller exposing audit reads), record it — the target union must be
   re-derived, not silently assumed.
4. Both methods map Prisma `row.action` (typed `AuditAction` by the
   generated client) into the open annotation. The `row.action` expressions
   stay byte-for-byte unchanged: the narrowing is in the declared return
   type only, and the rows must remain assignable with no cast or guard.
   If typecheck rejects the unchanged mapping at execution, stop — the
   premise is disproved and the scope must be re-decided, not silently
   absorbed with a cast.
5. `targetType` stays open by design: the schema column is `String` with
   no enum, and production literals span two modules. `targetId`, ids, and
   timestamps stay open for the same reason (no closed authority).
   Narrowing any of them would invent a contract.
6. The GraphQL `action`/`targetType` fields stay `string` by design: SDL
   surface, not vocabulary carriers. `contracts:check` must report no
   artifact change. If a snapshot moves, stop — an audit-action narrowing
   with already-member runtime values must not alter a public contract
   snapshot.
7. No runtime value moves: every audit read returns the identical rows for
   every action (same Prisma query, same mapping, same cursor bytes). A
   server test that changes outcome (not just compilation) after this edit
   disproves the premise — stop and report it.
8. There is no established negative-type-test pattern in this repository
   (verified through prompt 127: zero `ts-expect-error` / `expectTypeOf`
   uses in `server/src`, `client/`, `packages/shared/src`). Do not invent
   one; the gates are `npm run typecheck` (which must reject a future
   invented-action return at these boundaries) plus the unchanged runtime
   suites.

The required shape:

```ts
// server/src/organizations/organizations.service.ts (extend the existing braces; no other import change)
import type { AuditAction, OrganizationRole } from "../generated/prisma/enums";
// auditEvents return: action: AuditAction (was string)
// auditEventsPage return: action: AuditAction (was string)
// row mappings, targetType, targetId, ids, timestamps stay byte-for-byte identical.
```

Do not introduce a new import line, a value import, an inline union, a
shared-contract alias, a cast, a validator, a per-value branch, a caller
edit, or a GQL type change. The resolver already passes member-typed rows
through.

## Expected impact

- Routes changed: none (`/graphql` path, verbs, guards, and query shapes
  are untouched; no REST audit route exists).
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none (action
  stays an opaque `String` field; emitted rows already carry member
  actions; type-only return narrowing cannot alter a snapshot).
- Database schema, Prisma models, migrations, RLS, queries, indexes,
  queues, and persisted-data formats changed: none (the `action` column
  and every repository row are identical; the Prisma query text is
  identical).
- Runtime server behavior: unchanged — every audit read returns the
  identical row sequence with identical cursor bytes, and the
  `audit.read` permission gate behaves identically.
- Compile-time contract: the two audit-read boundaries no longer admit an
  invented action name at any current or future call site. A future
  eleventh action fails typecheck until `AuditAction` is extended by
  separate decision (schema migration included), instead of compiling
  through `string`.
- Logging/observability: unchanged; no action value is logged beyond
  existing paths.
- Threat model: no new boundary and no risk reclassification. The change
  adds one concrete audit-action type-contract detail under the existing
  Phase 3 governance behavior. The append-only control keeps both layers:
  compile-time `AuditAction` admission at append plus the unchanged
  runtime details allowlist; read display was never an enforcement point
  and does not become one.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and
   every skill named in `## SKILLS USED`. Confirm `git status --short`
   before editing; preserve any unrelated user changes and stop if they
   overlap an approved path. Confirm `HEAD` is `0d74388` (or record the
   actual SHA and adjust `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–4 at execution: re-run the
   `action: string` grep over `server/src` (excluding specs and
   generated), re-run the `auditEvents[^P]|auditEventsPage` caller grep,
   confirm the schema/generated/audit-service vocabularies still agree on
   exactly ten members, and confirm both methods still map Prisma
   `row.action` unchanged. If a third carrier, a second caller, a
   disagreeing authority, or a reshaped mapping appears, stop and report
   it rather than silently widening scope.
3. In `server/src/organizations/organizations.service.ts`, make only three
   edits: extend the existing `import type` braces at `:6` with
   `AuditAction` (matching the repo's quote/style at execution), and
   change the two inline `action: string` return annotations (in
   `auditEvents` and `auditEventsPage`) to `action: AuditAction`. Leave
   the Prisma queries, the `row.action` mappings, `targetType`,
   `targetId`, ids, timestamps, the permission gates, and every other line
   byte-for-byte unchanged. Do not add any other export, import, cast, or
   validator.
4. Make no other production edit: no resolver change (it must compile
   unchanged — that is the downstream assignability proof), no GQL type
   change, no `AuditService`, DTO, guard, permission, Prisma schema,
   migration, seed, repository, worker, scanner, storage port, outbox
   payload, retention job, AI draft surface, metrics label, or client
   change. Do not remove the currently-uncalled `auditEvents` method. If
   typecheck demands more than the import-brace extension plus the two
   annotations, restore and report rather than expanding scope.
5. Run `npm run contracts:check` and verify no generated REST/OpenAPI/
   GraphQL artifact changes. This narrowing must not alter a public
   contract snapshot (action stays an SDL `String`).
6. Run the focused organizations unit scope and verify identical outcomes:
   `npm run test --workspace=@acres/server -- src/organizations`.
   All tests must pass with unchanged assertions.
7. Update `docs/backend.md` in the organizations/audit section (or the
   verification section if that is where the audit-read contract lives at
   execution). Record that both audit-read carriers admit only
   `AuditAction` (ten member names, Prisma-enum authority, joined into the
   existing erased import); that narrowing the uncalled `auditEvents`
   alongside `auditEventsPage` is deliberate consistency, not dead-code
   cleanup; that `targetType`/`targetId`/ids/timestamps deliberately stay
   open (free-form `String` column, cross-module literals, no enum
   authority); that the GQL `String` fields and SDL snapshots are
   untouched; and that no returned byte changed.
8. Inspect the complete diff, run every check below, and quote real exit
   status plus meaningful test/build totals. Fix issues before review.
9. Run the mandatory two-stage review loop:
   - dispatch a read-only reviewer subagent with `requesting-code-review`,
     this prompt path, `BASE_SHA=0d74388` (or the recorded actual HEAD),
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
    - `prompts/128-audit-read-action-narrowing.md`;
    - `docs/backend.md`;
    - `server/src/organizations/organizations.service.ts`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend,
      or push. Use a terse Conventional Commit subject and include a short
      body explaining the audit-action reason, because it is not obvious
      from the subject alone.

## Non-goals

- No change to `targetType: string` (schema `String`, no enum authority,
  cross-module literal set), `targetId`, ids, or timestamps: open carriers
  with no closed authority; narrowing them would invent a contract.
- No change to `AuditService.append` (already `AuditAction`), the details
  allowlist, `audit.service.ts` inputs, or any audit write/permission
  behavior.
- No change to `acres.resolver.ts` (sole caller is the assignability
  witness; it passes member-typed rows through unchanged),
  `graphql.types.ts` (`String` fields stay; SDL must not move),
  `pagination.ts`/`cursor-codec.ts`, or any GraphQL guard/limit/cost
  behavior.
- No removal of the currently-uncalled `auditEvents` method: a separate
  YAGNI decision, explicitly rejected from this scope.
- No change to metrics `jobName` / `queueName` / HTTP `method` /
  `rawPath` carriers (free-form names/paths with no closed authority, per
  prompt 125), `JobRun.jobName` (free-form `String` column), upload
  `progressStage` / `progress.stage` (free-form `String` column, per
  prompt 123), AI `provider` / `model` / `promptTemplateVersion` /
  `purpose` (explicitly deferred decisions owned elsewhere), controller
  response schemas (`stringSchema()` stays), dashboard-evidence
  `schemaVersion`, analytics `code` / `message` / `calculationVersion`
  (deliberately open per prompts 115/121), failure `code` / `message`
  carriers (write unions owned by prompts 80–85, read carriers
  deliberately open per prompts 121–123), or any id/timestamp: different
  domains or deliberately open carriers.
- No new import line beyond extending the existing type-only braces, and
  no value import, shared alias, Prisma value import, inline union, cast
  helper, validator, per-value branch, or mapping change.
- No schema migration, SQL, Prisma repository, RLS, index, tenant,
  worker queue, storage, upload flow, route, API contract, client
  component, design, accessibility, motion, or browser work.
- No new test cases and no invented negative-type-test pattern
  (`ts-expect-error` / `expectTypeOf` have zero uses in this repository);
  no general organizations refactor or unrelated cleanup.

## Reference deltas

No visual delta. The deliberate static delta is limited to two return-type
annotations plus one enum member joined into the existing type-only import
braces: invented audit actions no longer reach the audit-read boundary at
compile time. Returned rows, cursor bytes, permission paths, SDL, OpenAPI
snapshots, and every error path are observably identical before and after.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this server audit-read type change. No
responsive, touch-target, or reduced-motion surface moves.

## Checks to run, and the owning doc

```bash
# Public contracts must remain unchanged (action stays an SDL String)
npm run contracts:check

# Focused regression proof: unchanged organizations unit outcomes
npm run test --workspace=@acres/server -- src/organizations

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/128-audit-read-action-narrowing.md \
  docs/backend.md \
  server/src/organizations/organizations.service.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/128-audit-read-action-narrowing.md \
  docs/backend.md \
  server/src/organizations/organizations.service.ts
```

Quote the actual exit status and meaningful test/build totals. Browser E2E,
real PostgreSQL, spatial plan, and operations-drill suites are
intentionally omitted because this scope adds no rejection path, changes
no schema/query behavior, and touches no browser journey or deployment
surface. (Zero `*.spec.ts` files reference `auditEvents`, so no
audit-read unit target exists beyond the organizations scope above;
typecheck is the admission gate plus the unchanged runtime suites.)

`docs/backend.md` owns the implementation record. `docs/security.md` is
read-only verification for this task; update it only if execution proves a
statement materially stale, and stop before broadening scope.

## Rollback and stop conditions

Rollback is a source/doc revert; there is no migration or
persisted-data rollback. Stop before expanding scope if any of these occur:

- the `action: string` grep shows other than the two known carriers at
  execution time;
- the caller grep shows other than the one known external caller
  (`acres.resolver.ts:191`), especially a REST controller or a
  free-form-action constructor;
- schema, generated-enum, and audit-service action authorities disagree on
  membership;
- either method no longer maps Prisma `row.action`, or typecheck rejects
  the unchanged mapping or the unchanged resolver call (unions diverged)
  — restore and re-decide scope rather than adding a cast, guard, GQL
  enum, or resolver edit;
- `organizations.service.ts` no longer holds the single generated-enums
  `import type` line in its current form — reuse whatever erased edge
  exists and record the smaller diff rather than absorbing unrelated
  import churn;
- a value import (not `import type`) is required for the annotation to
  compile — restore and prepare a separate prompt, because a new runtime
  edge is a different architectural decision;
- an existing server test changes outcome (not just compilation) after
  the edit;
- a public contract snapshot changes;
- the fix requires an inline union, second alias, cast, validator,
  per-value branch, mapping change, error code/message, schema change,
  repository rewrite, GQL type change, seed rewrite, spec rewrite,
  method removal, or client change.

Report the contradictory evidence and prepare a separate prompt rather
than silently changing the premise.

## Completion criteria

- Both audit-read carriers accept only `AuditAction` (ten members) at
  compile time, with unchanged bodies.
- Exactly one enum member joined into the existing type-only import
  braces; no other import, alias, cast, or validator introduced, and no
  new runtime module edge created.
- The Prisma queries, `row.action` mappings, `targetType`, `targetId`,
  ids, timestamps, permission gates, resolver call, GQL types, and all
  other lines are byte-for-byte equivalent in behavior.
- Current server suites pass with identical audit rows and cursor bytes.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all
  verified blocking/important findings are fixed and re-tested.
- `docs/backend.md` records the `AuditAction` invariant, the
  narrow-both-methods judgement with its zero-caller proof, the
  brace-extension (not new-import) judgement with its no-runtime-edge
  proof, the deliberate `targetType`/GQL-`String` openness, the retained
  write-path layers, and the no-runtime-change proof.
- Only the approved paths are committed locally to `main`; nothing is
  pushed.

## SKILLS USED

- `architecture-patterns` — join `AuditAction` into the single existing
  erased vocabulary edge (`../generated/prisma/enums` `import type`) in
  the read module, mirroring the write module's coupling and avoiding
  duplicated literals and any new runtime cross-module edge.
- `nestjs-best-practices` — keep the change outside Nest provider/module
  wiring; `OrganizationsService` is an `@Injectable()` whose audit-read
  methods are pure query-and-map, and the edit is annotations plus the
  brace extension only — read-only except for those
  (`arch-avoid-circular-deps` governs the `import type` choice).
- `auth-implementation-patterns` — verify the audit-read vocabulary
  against the membership/governance model (`audit.read` permission gate,
  organization-scoped transaction, write path `AuditAction` admission
  stay untouched); no session, membership, or context change.
- `postgres-best-practices` — verify no schema, migration, transaction,
  RLS, or persistence change; the `action` enum column and every row are
  identical, and the Prisma query text is identical.
- `sql-optimization-patterns` — not loaded: no query, index, or
  query-plan work is introduced by this in-memory annotation change
  (guard duty covered by `postgres-best-practices` above).
- `api-design-principles` — guard duty only: no public route, cursor
  shape, or envelope change; action stays an SDL `String` and
  `contracts:check` proves the contract snapshots are unchanged.
- `openapi-spec-generation` — not loaded: no REST surface exists for
  audit reads (GraphQL-only) and no contract artifact may move (guard
  duty covered by `api-design-principles` above).
- `security-best-practices` — guard duty only: no trust-boundary or
  persistence change; read-only verification against `docs/security.md`
  (audit log as governance asset; append-only history untouched).
- `security-threat-model` — verify the audit control keeps both layers
  (compile-time `AuditAction` admission at append plus the unchanged
  runtime details allowlist and `audit.read` gate) and read display was
  never an enforcement point; no risk reclassification.
- `error-handling-patterns` — keep the deterministic not-found/forbidden
  paths (`requirePermission`, organization scoping) and existing audit
  error behavior; no new failure literal is introduced.
- `javascript-testing-patterns` — rely on the existing organizations unit
  scope as unchanged-outcome regression proof; no test semantics changed.
- `e2e-testing-patterns` — guard duty only: no cross-system journey
  changes; E2E intentionally omitted per §Checks.
- `secrets-management` — guard duty only: invite tokens, session material,
  and cursor MAC keys are untouched; no credential surface changes.
- `requesting-code-review` — dispatch the mandatory structured read-only
  review with precise scope, SHAs, changed paths, and check evidence.
- `receiving-code-review` — verify reviewer claims against repository
  reality before fixes or technical pushback.
- `caveman-commit` — produce the required terse Conventional Commit
  message with a short audit-action rationale body.

Not loaded, with reason: `playwright` (no audit UI or browser journey);
frontend/Tailwind/shadcn/GSAP skills (no UI or motion).
