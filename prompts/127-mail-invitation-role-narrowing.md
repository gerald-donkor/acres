# 127 — narrow `MailService.sendInvitationEmail` `role: string` to the closed `OrganizationRole` union

## Scope, and why it is next

The committed repository is on `main` at `a1dfb6d`
(`refactor(graphql): narrow cursor kind union`, the prompt 126
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 126 — which closed the Phase 4 GraphQL cursor path (new exported
`CursorKind` alias in `cursor-codec.ts`, one erased `import type` in
`pagination.ts`, unchanged bodies, no runtime change).

There is no unbuilt ordered phase left. A repo-wide grep over `server/src`
this session (`role: string`) proves exactly one open role carrier exists
and a closed four-member vocabulary is already stated by every adjacent
authority:

```ts
// server/src/mail/mail.service.ts:71–76 — OPEN (the only role: string in server/src)
async sendInvitationEmail(
  to: string,
  inviteUrl: string,
  organizationName: string,
  role: string, // ← open (owner | admin | analyst | viewer, see below)
): Promise<void> {
```

against the authorities that already state the closed vocabulary:

- `packages/shared/src/organizations.ts:1–8` — `ORGANIZATION_ROLES`
  (`owner`, `admin`, `analyst`, `viewer`) and `OrganizationRole`
  (`(typeof ORGANIZATION_ROLES)[number]`);
- `server/src/generated/prisma/enums.ts:30–37` — the Prisma
  `OrganizationRole` mirror (same four members);
- `server/prisma/schema.prisma:214` — `Invitation.role OrganizationRole`;
- `server/src/organizations/dto.ts:44–61` — `InviteMemberDto.role:
Exclude<OrganizationRole, 'owner'>` with `@IsIn(assignableRoles)`;
- `server/src/organizations/organizations.service.ts:512–517` —
  `invite(..., role: Exclude<OrganizationRole, 'owner'>, ...)`;
- the single production call site
  (`organizations.service.ts:593–598`) passes `row.role`, whose Prisma type
  is `OrganizationRole` (all four members);
- the single spec call site (`server/src/mail/mail.service.spec.ts:84–89`)
  passes the `'analyst'` literal, already a member.

No other `sendInvitationEmail` caller exists (the caller grep returns only
`organizations.service.ts:593` plus the spec at `mail.service.spec.ts:84`).
No other `role: string` carrier exists in `server/src` (the grep returns
only `mail.service.ts:75`).

This is the direct continuation of prompts 120–126, which narrowed the
ingestion `toX()` mappers, the shared ingestion/dashboard contracts, the
reports `toX()` mappers, the upload read state, the SSE terminal
predicates, the metrics `sourceKind`, and the GraphQL cursor kinds — each
with unchanged bodies and no runtime change. It closes the last open
`string` carrier on the Phase 3/5 invitation-mail path rather than leaving
a known remainder.

Narrowing to the full `OrganizationRole` (all four members) rather than
`Exclude<OrganizationRole, 'owner'>` is a judgement, stated as one: the
single production call site passes `row.role`, typed by Prisma as
`OrganizationRole` _including_ `'owner'`. Targeting `Exclude` would break
that call site's compilation and force a cast or a narrowing guard,
expanding scope beyond the one annotation plus one import this prompt
allows. Mail only capitalizes and interpolates the role for display
(`role.charAt(0).toUpperCase() + role.slice(1)`, `:77`, `:80`, `:101`) —
it never assigns, persists, or authorizes on it — so the full union is the
correct precision here, and the invite-time owner-exclusion stays enforced
where it belongs (`@IsIn(assignableRoles)`, `canAssignRole`, the
`Exclude` service signature), all untouched.

Importing the alias from `@acres/shared` via `import type` rather than
from the Prisma generated enums is a judgement, stated as one: unlike
prompts 120/122 there is no Prisma-enum-typed row flowing _into_ this
module to reuse — the parameter is a display input, and the cross-boundary
contract (`packages/shared/src/organizations.ts:1–8`, already imported by
`server/src/organizations/dto.ts:11–16`) is the vocabulary authority both
sides read. A Prisma generated-client import would pull persistence
wiring into the mail module for a pure annotation. Per
`arch-avoid-circular-deps` the import is `import type` (erased at compile
time): Prisma `OrganizationRole` and shared `OrganizationRole` are both
plain string unions of the identical four literals, so `row.role` remains
structurally assignable with no cast — verified at execution by
`npm run typecheck`, which must pass with the call site byte-for-byte
unchanged. If typecheck disagrees at execution, stop and report it rather
than adding a cast (see §Rollback).

Leaving the `formattedRole` capitalization body byte-for-byte unchanged is
a judgement, stated as one: after narrowing, an invented role fails
typecheck at the `sendInvitationEmail` boundary, but the formatting
expression is total over all four members (every member is a non-empty
lowercase literal), so no per-value branch, validator, or fallback is
introduced — the same unchanged-body policy prompts 120–126 applied to
mappers, guards, and predicates.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 3 organizations/permissions/RLS outcome and
  exact phase skill manifest (§4, incl. the prompt 55/56 verification
  updates); Phase 5C mail-delivery evidence (§6); §§16–22 confirming no
  unbuilt ordered phase.
- `docs/backend.md` — organizations/mail/invitation sections (invitation
  issuance, `sendInvitationEmail` dispatch, recovery). The owning
  implementation record for this prompt (mail surface only).
- `docs/security.md` — TM-02/TM-03 boundaries. This work tightens the
  invitation-role display contract under the existing Phase 3 membership
  boundary (role assignment stays enforced by `@IsIn`, `canAssignRole`,
  and the `Exclude` service signature); it does not add or move a trust
  boundary, persist new data, or change an envelope.
- `server/src/mail/mail.service.ts:71–76` — `sendInvitationEmail`
  signature (open `role` at `:75`), body (`:77–125`, `formattedRole` at
  `:77`, unchanged). Re-read at execution and resolve current line numbers
  rather than editing from this snapshot. Imports today: `Inject`,
  `Injectable`, `AcresConfigService`, `MAIL_TRANSPORT`/`MailMessage`/
  `MailTransport` (`:1–7`); no `OrganizationRole` import exists.
- `server/src/organizations/organizations.service.ts:512–517` — `invite`
  signature (`role: Exclude<OrganizationRole, 'owner'>`); `:593–598` —
  the single production call passing `row.role` (Prisma
  `OrganizationRole`). Read-only witnesses; unchanged.
- `server/src/organizations/dto.ts:11–19,44–61` — shared
  `ORGANIZATION_ROLES` import, `assignableRoles` guard, `InviteMemberDto`
  (`Exclude` + `@IsIn`). Read-only witnesses; unchanged. Precedent that
  `@acres/shared` resolves inside `server/`.
- `packages/shared/src/organizations.ts:1–8` — the vocabulary authority
  (`ORGANIZATION_ROLES`, `OrganizationRole`). Read-only witness;
  unchanged.
- `server/src/generated/prisma/enums.ts:30–37` — the Prisma
  `OrganizationRole` mirror (same four members). Read-only witness that
  `row.role` carries the full union; unchanged.
- `server/prisma/schema.prisma:210–225` — `Invitation.role
OrganizationRole` (`:214`). Read-only witness; unchanged (no migration).
- `server/src/mail/mail.service.spec.ts:82–89` — the spec call passing
  `'analyst'` with `Analyst`/`inviteUrl`/expiry assertions. Read-only
  witness; unchanged.
- `prompts/125-metrics-parser-source-kind-narrowing.md` — the named-alias
  judgement precedent (couple the consumer to the single vocabulary
  authority via an erased `import type`, zero duplicated literals) this
  prompt mirrors, with the alias imported (not defined) because the
  authority already states it.
- `prompts/126-graphql-cursor-kind-narrowing.md` — the closest lineage
  prompt (open `string` params narrowed to closed unions, one `import
type`, unchanged bodies, contracts guard) this prompt mirrors for the
  single mail-role carrier, with `OrganizationRole` instead of `Exclude`
  per the call-site type judgement above.

No visual reference is applicable. This is an internal mail-parameter type
change, so the design-system PDF, landing-page PNGs, and recorded chrome
flows provide no evidence and must not be opened or cited as if they did.

## Measurements and verified invariants

These are code-derived constraints at `a1dfb6d`; re-verify them before editing:

1. Exactly one open role carrier: the `role: string` grep over `server/src`
   returns only `mail.service.ts:75`. Re-run at execution; if a second
   `role: string` carrier appeared, stop and report it rather than
   silently widening scope.
2. The closed vocabulary is exactly four role names, byte-for-byte
   `owner | admin | analyst | viewer`, stated identically by shared
   `ORGANIZATION_ROLES` (`:1–6`), the Prisma `OrganizationRole` const
   (`enums.ts:30–35`), and the `Invitation.role` column
   (`schema.prisma:214`). If the authorities disagree at execution, stop
   and report it rather than picking a winner silently.
3. Exactly two `sendInvitationEmail` callers: the production call at
   `organizations.service.ts:593–598` passing `row.role` (Prisma
   `OrganizationRole`) and the spec call at
   `mail.service.spec.ts:84–89` passing `'analyst'`. Re-run the caller
   grep at execution; if a third caller appeared (especially one passing
   a free-form string), record it — the target union must be re-derived,
   not silently assumed.
4. The production call site stays byte-for-byte unchanged: `row.role` must
   remain assignable to the narrowed parameter with no cast, guard, or
   signature change at the call site. If typecheck rejects it at
   execution (e.g. Prisma and shared unions diverged), stop — the premise
   is disproved and the scope must be re-decided, not silently absorbed
   with a cast.
5. The `formattedRole` expression (`role.charAt(0).toUpperCase() +
role.slice(1)`, `:77`) is total over all four members and stays
   byte-for-byte identical. No per-value branch, validator, fallback, or
   sanitizer is introduced: every member formats today (`Owner`,
   `Admin`, `Analyst`, `Viewer`) and formats identically after.
6. `to`, `inviteUrl`, `organizationName` stay open by design: addresses,
   URLs, and display names have no closed authority. Narrowing any of
   them would invent a contract — forbidden by §10.
7. No runtime value moves: every invitation email renders the identical
   subject/text/html for every role (same capitalized word into the same
   templates). A mail test that changes outcome (not just compilation)
   after this edit disproves the premise — stop and report it.
8. No public REST, GraphQL, OpenAPI, or SDL artifact contains the mail
   `role` parameter (mail is an internal provider call, not a controller
   DTO); no contract snapshot can move. `InviteMemberDto`,
   `ChangeMemberRoleDto`, and every `@IsIn` guard stay untouched.
9. There is no established negative-type-test pattern in this repository
   (verified through prompt 126: zero `ts-expect-error` / `expectTypeOf`
   uses in `server/src`, `client/`, `packages/shared/src`). Do not invent
   one; the gates are `npm run typecheck` (which must reject a future
   invented-role argument at this boundary) plus the unchanged mail
   suite.

The required shape:

```ts
// server/src/mail/mail.service.ts (one new type-only import; no other import change)
import type { OrganizationRole } from "@acres/shared";
// sendInvitationEmail: role: OrganizationRole (was string)
// formattedRole, subject, text, html, and the send() call stay byte-for-byte identical.
```

Do not introduce a value import, an inline union, a Prisma generated-client
import, an `Exclude<...>` wrapper, a cast, a validator, a per-value branch,
or a call-site edit. The production caller and the spec already pass
members.

## Expected impact

- Routes changed: none (no controller, DTO, guard, or envelope touched).
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none (mail is
  an internal provider call; `InviteMemberDto`/`@IsIn` snapshots already
  carry the assignable-roles enum and are untouched).
- Database schema, Prisma models, migrations, RLS, queries, indexes,
  queues, and persisted-data formats changed: none (`Invitation.role`
  column and every repository row are identical).
- Runtime server behavior: unchanged — every invitation email renders the
  identical subject/text/html for every role, and the dispatch
  try/catch in `organizations.service.ts:592–603` behaves identically.
- Compile-time contract: the mail boundary no longer admits an invented
  role string at any call site. A future caller passing a fifth role
  fails typecheck until the vocabulary is extended by separate decision,
  instead of compiling through `string`.
- Logging/observability: unchanged; no role value is logged beyond
  existing paths (`Invitation issued` carries no role).
- Threat model: no new boundary and no risk reclassification. The change
  adds one concrete role type-contract detail under the existing Phase 3
  membership behavior. Role _assignment_ keeps both layers: compile-time
  `Exclude` admission at the invite boundary plus the unchanged runtime
  `@IsIn`/`canAssignRole` rejection; mail display was never an
  enforcement point and does not become one.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and
   every skill named in `## SKILLS USED`. Confirm `git status --short`
   before editing; preserve any unrelated user changes and stop if they
   overlap an approved path. Confirm `HEAD` is `a1dfb6d` (or record the
   actual SHA and adjust `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–4 at execution: re-run the
   `role: string` grep over `server/src`, re-run the
   `sendInvitationEmail` caller grep over `server/src` (plus spec),
   confirm the shared/Prisma/schema vocabularies still agree on exactly
   four members, and confirm the production call still passes `row.role`
   with its Prisma `OrganizationRole` type. If a second carrier, a third
   caller, a disagreeing authority, or a reshaped call site appears, stop
   and report it rather than silently widening scope.
3. In `server/src/mail/mail.service.ts`, make only two edits: add
   `import type { OrganizationRole } from '@acres/shared';` (matching the
   repo's quote style at execution; `dto.ts:11–16` is the precedent that
   the alias resolves in `server/`), and change the `sendInvitationEmail`
   `role: string` parameter to `role: OrganizationRole`. Leave
   `formattedRole`, subject/text/html templates, the `send()` call, and
   every other line byte-for-byte unchanged. Do not add any other export,
   import, cast, or validator.
4. Make no other production edit: no `organizations.service.ts` call-site
   change (it must compile unchanged — that is the assignability proof),
   no DTO, guard, permission, Prisma schema, migration, seed, repository,
   worker, scanner, storage port, outbox payload, retention job, AI draft
   surface, metrics label, or client change. If typecheck demands more
   than the one annotation plus the one import, restore and report rather
   than expanding scope.
5. Run the focused mail suite and verify identical outcomes:
   `npm run test --workspace=@acres/server -- src/mail/mail.service.spec.ts`.
   All tests must pass with unchanged assertions (the `Analyst` body
   assertion is the no-runtime-change proof for the narrowed member).
6. Update `docs/backend.md` in the organizations/mail invitation section
   (or the verification section if that is where the mail contract lives
   at execution). Record that the `sendInvitationEmail` `role` carrier
   admits only `OrganizationRole` (four member names, shared authority,
   one erased `import type`); that the full union — not `Exclude` — is
   deliberate because the sole production caller passes Prisma `row.role`
   and must compile unchanged; that `to`/`inviteUrl`/`organizationName`
   deliberately stay open; that assignment enforcement stays in
   `@IsIn`/`canAssignRole`/the `Exclude` service signature; and that no
   rendered byte changed.
7. Inspect the complete diff, run every check below, and quote real exit
   status plus meaningful test/build totals. Fix issues before review.
8. Run the mandatory two-stage review loop:
   - dispatch a read-only reviewer subagent with `requesting-code-review`,
     this prompt path, `BASE_SHA=a1dfb6d` (or the recorded actual HEAD),
     the working-tree diff (or implementation `HEAD_SHA` if an
     intermediate commit is explicitly required), changed paths,
     constraints, and real check outputs;
   - process every finding with `receiving-code-review`: understand and
     verify it against source and requirements before changing code; fix
     blocking and important valid findings in order, test each fix, and
     give technical pushback where evidence disproves a suggestion;
   - request follow-up review if a valid fix materially changes
     architecture, a public contract, data flow, or the trust boundary.
9. Commit locally on `main` using `caveman-commit`. Stage:
   - `prompts/127-mail-invitation-role-narrowing.md`;
   - `docs/backend.md`;
   - `server/src/mail/mail.service.ts`.
     Do not stage unrelated changes. Do not pull, merge, rebase, amend,
     or push. Use a terse Conventional Commit subject and include a short
     body explaining the mail-role reason, because it is not obvious
     from the subject alone.

## Non-goals

- No change to `organizations.service.ts` (call site is the
  assignability witness; `row.role` passes unchanged), `dto.ts`
  (`Exclude` + `@IsIn` stay as the assignment enforcement),
  `permissions.ts`/`canAssignRole`, shared `organizations.ts`, Prisma
  enums/schema, or any invitation lifecycle, expiry, replay, or audit
  behavior.
- No `Exclude<OrganizationRole, 'owner'>` on the mail parameter: it would
  break the Prisma-typed call site and force a cast — a different scope,
  explicitly rejected above.
- No change to `to: string`, `inviteUrl: string`, or
  `organizationName: string`: addresses, URLs, and display names with no
  closed authority; narrowing them would invent a contract.
- No change to mail transport, `MailMessage`, `MailTransport`, config
  (`invitationTtlHours`), templates, or copy: identical rendered bytes.
- No change to metrics `jobName` / `queueName` / HTTP `method` /
  `rawPath` carriers (free-form names/paths with no closed authority, per
  prompt 125), `JobRun.jobName` (free-form `String` column), upload
  `progressStage`, AI `provider` / `model` / `promptTemplateVersion`
  (explicitly deferred decisions owned elsewhere), controller response
  schemas (`stringSchema()` stays), dashboard-evidence `schemaVersion`,
  analytics `code` / `message` / `calculationVersion`, or any id/
  timestamp: different domains or deliberately open carriers.
- No new import beyond the one type-only `OrganizationRole` import, and
  no Prisma generated-client import, value import, inline union, alias,
  cast helper, validator, per-value branch, or template change.
- No schema migration, SQL, Prisma repository, RLS, index, tenant,
  worker queue, storage, upload flow, route, API contract, client
  component, design, accessibility, motion, or browser work.
- No new test cases and no invented negative-type-test pattern
  (`ts-expect-error` / `expectTypeOf` have zero uses in this repository);
  no general mail refactor or unrelated cleanup.

## Reference deltas

No visual delta. The deliberate static delta is limited to one parameter
annotation and one type-only import: invented roles no longer reach the
invitation-mail boundary at compile time. Rendered subjects, bodies,
dispatch behavior, OpenAPI snapshots, SDL, and every error path are
observably identical before and after.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this server mail-parameter type change. No
responsive, touch-target, or reduced-motion surface moves.

## Checks to run, and the owning doc

```bash
# Focused regression proof: identical mail outcomes for the narrowed member
npm run test --workspace=@acres/server -- src/mail/mail.service.spec.ts

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/127-mail-invitation-role-narrowing.md \
  docs/backend.md \
  server/src/mail/mail.service.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/127-mail-invitation-role-narrowing.md \
  docs/backend.md \
  server/src/mail/mail.service.ts
```

Quote the actual exit status and meaningful test/build totals. Public
contract checks (`contracts:check`) are intentionally omitted: mail is an
internal provider call with no controller DTO, OpenAPI, or SDL surface,
and every adjacent contract file is explicitly untouched. Browser E2E,
real PostgreSQL, spatial plan, and operations-drill suites are
intentionally omitted because this scope adds no rejection path, changes
no schema/query behavior, and touches no browser journey or deployment
surface.

`docs/backend.md` owns the implementation record. `docs/security.md` is
read-only verification for this task; update it only if execution proves a
statement materially stale, and stop before broadening scope.

## Rollback and stop conditions

Rollback is a source/doc revert; there is no migration or
persisted-data rollback. Stop before expanding scope if any of these occur:

- the `role: string` grep shows other than the single known carrier at
  execution time;
- the `sendInvitationEmail` caller grep shows other than the two known
  callers, especially a caller passing a free-form string;
- shared, Prisma, and schema role authorities disagree on membership;
- the production call site no longer passes Prisma `row.role`, or
  typecheck rejects the unchanged call site (shared/Prisma unions
  diverged) — restore and re-decide scope rather than adding a cast,
  guard, or `Exclude` wrapper;
- `mail.service.ts` already imports `OrganizationRole` in a way that
  changes the planned diff — reuse it and record the smaller diff rather
  than absorbing unrelated import churn;
- a value import (not `import type`) is required for the annotation to
  compile — restore and prepare a separate prompt, because a new runtime
  edge is a different architectural decision;
- the focused mail suite changes outcome (not just compilation) after
  the edit;
- the fix requires an `Exclude` wrapper, inline union, second alias,
  cast, validator, per-value branch, template change, error code/message,
  schema change, repository rewrite, DTO/guard change, seed rewrite,
  spec rewrite, or client change.

Report the contradictory evidence and prepare a separate prompt rather
than silently changing the premise.

## Completion criteria

- The single mail-role carrier accepts only `OrganizationRole`
  (`owner | admin | analyst | viewer`) at compile time, with an unchanged
  body.
- Exactly one type-only import added; no other import, alias, cast, or
  validator introduced, and no new runtime module edge created.
- The production call site, DTO guards, permission policy, templates,
  dispatch try/catch, and all other lines are byte-for-byte equivalent in
  behavior.
- The focused mail suite passes with identical rendered bytes.
- Format, lint, typecheck, build, whitespace, diff, and status checks
  pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all
  verified blocking/important findings are fixed and re-tested.
- `docs/backend.md` records the `OrganizationRole` invariant, the
  full-union (not `Exclude`) judgement with its call-site type proof, the
  shared-authority (not Prisma-import) judgement with its no-runtime-edge
  proof, the deliberate openness of the sibling string params, the
  untouched assignment enforcement, and the no-runtime-change proof.
- Only the approved paths are committed locally to `main`; nothing is
  pushed.

## SKILLS USED

- `architecture-patterns` — couple `mail.service.ts` to the single shared
  vocabulary authority (`@acres/shared` `OrganizationRole`) via an erased
  `import type`, avoiding duplicated literals and any new runtime
  cross-module edge (no Prisma generated-client import into mail).
- `nestjs-best-practices` — keep the change outside Nest provider/module
  wiring; `MailService` is an `@Injectable()` whose method bodies are
  pure composition, and the edit is annotations plus the alias import
  only — read-only except for those (`arch-avoid-circular-deps` governs
  the `import type` choice).
- `auth-implementation-patterns` — verify the invitation-role vocabulary
  against the membership model (`InviteMemberDto`, `invite` signature,
  `OrganizationPolicy.canAssignRole` ordering stay untouched); no
  session, membership, or context change.
- `postgres-best-practices` — verify no schema, migration, transaction,
  RLS, or persistence change; `Invitation.role` column and every row are
  identical.
- `sql-optimization-patterns` — not loaded: no query, index, or
  query-plan work is introduced by this in-memory annotation change
  (guard duty covered by `postgres-best-practices` above).
- `security-best-practices` — guard duty only: no trust-boundary or
  persistence change; read-only verification against `docs/security.md`
  (TM-02/TM-03); assignment enforcement stays in `@IsIn`/`canAssignRole`.
- `security-threat-model` — verify the role-assignment control keeps both
  layers (compile-time `Exclude` admission at invite plus unchanged
  runtime guards) and mail display was never an enforcement point; no
  risk reclassification.
- `error-handling-patterns` — keep the deterministic dispatch try/catch
  (`organizations.service.ts:592–603`, log-only failure) and existing
  mail error paths; no new failure literal is introduced.
- `javascript-testing-patterns` — rely on the existing focused mail suite
  (`mail.service.spec.ts`, incl. the `Analyst` rendering assertion) as
  unchanged-outcome regression proof; no test semantics changed.
- `e2e-testing-patterns` — guard duty only: no cross-system journey
  changes; E2E intentionally omitted per §Checks.
- `secrets-management` — guard duty only: invite tokens, reset URLs, and
  mail credentials are untouched; no credential surface changes.
- `requesting-code-review` — dispatch the mandatory structured read-only
  review with precise scope, SHAs, changed paths, and check evidence.
- `receiving-code-review` — verify reviewer claims against repository
  reality before fixes or technical pushback.
- `caveman-commit` — produce the required terse Conventional Commit
  message with a short mail-role rationale body.

Not loaded, with reason: `openapi-spec-generation` (no public contract
surface — mail is an internal provider call); `playwright` (no mail UI
or browser journey); `api-design-principles` (no route, cursor shape, or
envelope change); frontend/Tailwind/shadcn/GSAP skills (no UI or motion).
