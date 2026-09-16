# 124 — narrow the two remaining SSE terminal predicates to the closed shared DTO unions

## Scope, and why it is next

The committed repository is on `main` at `7ace455`
(`refactor(uploads): narrow read state unions`, the prompt 123
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 123 — which closed the upload-read path (`UploadState` reconciled to
the seven Prisma literals; shared `UploadStatus.state`, server `toStatus()`
`state`, and controller `terminal()` typed closed, with `progressStage` /
`failure` / response schemas deliberately left open and no runtime change).

There is no unbuilt ordered phase left. A repo-wide grep over
`server/src` this session (`function (is\w*Terminal|terminal)\(`) proves
exactly three SSE terminal predicates exist and exactly two remain open:

```ts
// server/src/uploads/uploads.controller.ts:153 — CLOSED by prompt 123
function terminal(state: UploadStatus['state']): boolean {
  return ['accepted', 'rejected', 'cancelled', 'expired'].includes(state);
}

// server/src/ingestion/ingestion.controller.ts:310–312 — OPEN
function isIngestionTerminal(state: string): boolean { // ← open (IngestionRunState, seven members)
  return ['published', 'failed', 'cancelled'].includes(state);
}

// server/src/reports/reports.controller.ts:391–393 — OPEN
function isExportTerminal(status: string): boolean { // ← open (ExportStatus, five members)
  return ['succeeded', 'failed', 'cancelled'].includes(status);
}
```

Both predicates observe already-closed shared DTO fields through SSE
`takeWhile` pipelines that cannot construct a value:

- `ingestion.controller.ts:247–260` — `initial.state` / `status.state`
  come from `this.ingestion.getRun(...)`, typed
  `Promise<IngestionRunSummary>` (`ingestion.service.ts:292–296`), whose
  `state` is the closed in-file `IngestionRunState` (seven members since
  prompt 121);
- `reports.controller.ts:364–377` — `initial.status` / `status.status`
  come from `this.reports.getExport(...)`, typed
  `Promise<ExportRequest>` (`reports.service.ts:517–521`), whose `status`
  is the closed `ExportStatus` (five members, shared `reports.ts:9–14`
  untouched since before prompt 122).

against the single authorities the codebase already states for each:

- `IngestionRunState` — `queued | running | validation_failed | published |
  failed | cancelling | cancelled` (seven members):
  `server/prisma/schema.prisma:727–735`,
  `server/src/generated/prisma/enums.ts:153–163`,
  `packages/shared/src/ingestion.ts:1–8` (widened to seven by prompt 121);
- `ExportStatus` — `queued | running | succeeded | failed | cancelled`
  (five members): `server/prisma/schema.prisma:1118–1124`,
  `server/src/generated/prisma/enums.ts:244–252`,
  `packages/shared/src/reports.ts:9–14` (already closed; prompt 122 needed
  no shared change).

This is the direct continuation of prompt 123, which narrowed uploads
`terminal()` to `UploadStatus['state']` with an unchanged predicate body
and no runtime change. Covering both remaining predicates in one prompt is
a judgement, stated as one: they are the identical one-line pattern (open
`string` param, member-literal `includes`, unchanged body) with the
identical indexed-access fix, and splitting them would double the
review/commit overhead for the same judgement. Precedent supports the
width: prompts 120 and 122 each narrowed five fields across three to four
helpers in one prompt. No third predicate exists (the grep lists all
three), so this prompt closes the predicate family rather than leaving a
known remainder.

Typing each predicate via indexed access (`IngestionRunSummary['state']`,
`ExportRequest['status']`) rather than a duplicated inline union is a
judgement, stated as one: it keeps each SSE completion predicate coupled
only to the DTO its own `events()` handler already observes, with zero
duplicated literals — the same judgement prompt 123 made for
`UploadStatus['state']`. Unlike prompt 123, neither controller imports its
DTO type today (both import only DTOs, services, guards, and decorators),
so one `import type` line per controller is required; a Prisma-enum import
or a copy-pasted literal union is deferred as wider than the gap, per the
prompts 115–123 minimal-diff precedent.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 6 storage/queues/worker outcome and exact phase
  skill manifest (§7); Phase 7/10 narrowing precedent (§§8, 11); §§16–22
  confirming no unbuilt ordered phase.
- `docs/backend.md` — §SSE endpoints (`:248–252`, envelope bypass,
  `timer(0, 1500)`, terminal-state completion) and the prompt 123 upload
  read-path paragraph (`:2241–2246`, `terminal()` indexed-access precedent).
  Read-only except as noted in §Implementation plan step 9.
- `docs/security.md` — TM boundaries. This work tightens two module-local
  SSE predicates; it does not add or move a trust boundary, persist new
  data, or change an envelope.
- `docs/ingestion.md` — SSE run-events section (`:377–391`, 1500ms
  interval, terminal `published | failed | cancelled`) and the prompt
  120/121 narrowing paragraphs in §Residual gaps. One of the two owning
  implementation records for this prompt.
- `docs/reports.md` — Export progress streaming section (`:136–147`,
  1500ms interval, terminal `succeeded | failed | cancelled`) and the
  prompt 122 mapper-narrowing paragraph. The other owning implementation
  record for this prompt.
- `docs/authenticated-app.md` — §3.1 SSE client (fetch-based streams,
  terminal predicates, `aria-live` announcements, `fallbackPoll`).
  Read-only vocabulary witness that the client already treats these
  terminal sets as closed; unchanged.
- `server/prisma/schema.prisma` — `enum IngestionRunState` (`:727–735`,
  seven members), `enum ExportStatus` (`:1118–1124`, five members).
  Read-only; no migration.
- `server/src/generated/prisma/enums.ts` — `IngestionRunState`
  (`:153–163`), `ExportStatus` (`:244–252`). Read-only; regenerated,
  never hand-edited.
- `packages/shared/src/ingestion.ts` — `IngestionRunState` (`:1–8`,
  seven members), `IngestionRunSummary.state` (`:16`, closed).
  Read-only witness; unchanged.
- `packages/shared/src/reports.ts` — `ExportStatus` (`:9–14`),
  `ExportRequest.status` (`:146`, closed). Read-only witness; unchanged.
- `server/src/ingestion/ingestion.controller.ts` — `events()` SSE handler
  (`:241–271`, `getRun` result, `takeWhile((status) =>
  !isIngestionTerminal(status.state))` `:260`), `isIngestionTerminal`
  (`:310–312`, open). Re-read at execution and resolve current line
  numbers rather than editing from this snapshot. No shared-type import
  today (`:1–39`).
- `server/src/reports/reports.controller.ts` — `events()` SSE handler
  (`:358–388`, `getExport` result, `takeWhile((status) =>
  !isExportTerminal(status.status))` `:377`), `isExportTerminal`
  (`:391–393`, open). Re-read at execution. No shared-type import today
  (`:1–43`).
- `server/src/ingestion/ingestion.service.ts` — `getRun`
  (`:292–296`, `Promise<IngestionRunSummary>`). Read-only witness that
  call sites pass DTO-typed fields; unchanged.
- `server/src/reports/reports.service.ts` — `getExport`
  (`:517–521`, `Promise<ExportRequest>`). Read-only witness; unchanged.
- `server/src/uploads/uploads.controller.ts` — `terminal(state:
  UploadStatus['state'])` (`:153–155`, prompt 123 precedent: indexed
  access, unchanged body, no new import because the type was already
  imported). Read-only precedent; unchanged.
- `prompts/121-shared-ingestion-contract-narrowing.md` — the shared-side
  lineage (seven-state closure, in-file alias reuse judgement,
  mock-literal proof) this prompt consumes for the ingestion predicate.
- `prompts/122-reports-read-enum-narrowing.md` — the reports server-side
  lineage (five-field mapper narrowing, shared-already-closed split,
  response-schema-stays-`string` precedent) this prompt consumes for the
  export predicate.
- `prompts/123-upload-read-state-narrowing.md` — the closest lineage prompt
  (shared alias fix plus `toStatus` / `terminal()` narrowing, indexed-access
  judgement, stage/failure/schema openness policy, contracts guard) this
  prompt mirrors for the two remaining predicates, minus the shared half
  (both shared DTOs are already closed).

No visual reference is applicable. This is an internal server predicate
parameter change, so the design-system PDF, landing-page PNGs, and recorded
chrome flows provide no evidence and must not be opened or cited as if they
did.

## Measurements and verified invariants

These are code-derived constraints at `7ace455`; re-verify them before editing:

1. Exactly two open SSE terminal predicates plus one closed: the
   `function (is\w*Terminal|terminal)\(` grep over `server/src` returns
   exactly `isIngestionTerminal(state: string)`,
   `isExportTerminal(status: string)`, and the closed uploads
   `terminal(state: UploadStatus['state'])`. Re-run the grep at execution;
   if a fourth predicate appeared or uploads `terminal()` reopened, stop
   and report it rather than silently widening scope.
2. The closed vocabularies are exactly seven run states and five export
   statuses, byte-for-byte identical across `schema.prisma:727–735` /
   `:1118–1124`, `enums.ts:153–163` / `:244–252`, and
   `packages/shared/src/ingestion.ts:1–8` /
   `packages/shared/src/reports.ts:9–14`. If the authorities disagree at
   execution, stop and report it rather than picking a winner silently.
3. Every predicate call site passes a DTO-typed field. At execution,
   re-verify that ingestion `events()` passes `initial.state` /
   `status.state` from `getRun` (`Promise<IngestionRunSummary>`) and
   reports `events()` passes `initial.status` / `status.status` from
   `getExport` (`Promise<ExportRequest>`); if any call site constructs the
   value from query input or a hand-built literal, record it — the fix list
   must be extended by separate decision, not silently.
4. Neither controller imports its DTO type today (verified this session:
   zero `IngestionRunSummary` hits in `ingestion.controller.ts`, zero
   `ExportRequest` hits in `reports.controller.ts`). Re-grep at execution;
   the plan adds exactly one `import type` line per file. If either file
   already imports the type at execution, reuse it and record the smaller
   diff rather than adding a duplicate.
5. Controller OpenAPI response schemas (`runSchema` `state` /
   `stage: stringSchema()`, `exportSchema` `status` /
   `format: stringSchema()`, issue `severity: stringSchema()`) stay
   `{ type: 'string' }` in the snapshot by design, per the prompts
   116/120/122 precedent (response-shape documentation, not a response
   vocabulary; a GraphQL/OpenAPI enum migration is a separate
   public-contract decision with snapshot consequences).
   `contracts:check` must still report no artifact change; if a snapshot
   moves, stop — a predicate narrowing with already-member runtime values
   must not alter a public contract snapshot.
6. No runtime value moves: both predicates return the identical boolean for
   every input (same member lists, same `includes`, same key order in the
   emitted SSE frames). A server test that changes outcome (not just
   compilation) after this edit disproves the premise — stop and report it.
7. There is no established negative-type-test pattern in this repository
   (verified through prompt 123: zero `ts-expect-error` / `expectTypeOf`
   uses in `server/src`, `client/`, `packages/shared/src`). Do not invent
   one; the gates are `npm run typecheck` (which must reject a future
   non-member argument at the predicate boundary) plus unchanged runtime
   suites.

The required shapes:

```ts
// server/src/ingestion/ingestion.controller.ts (one new type-only import; no other import change)
import type { IngestionRunSummary } from '@acres/shared';
// ...
function isIngestionTerminal(state: IngestionRunSummary['state']): boolean {
  return ['published', 'failed', 'cancelled'].includes(state);
}
```

```ts
// server/src/reports/reports.controller.ts (one new type-only import; no other import change)
import type { ExportRequest } from '@acres/shared';
// ...
function isExportTerminal(status: ExportRequest['status']): boolean {
  return ['succeeded', 'failed', 'cancelled'].includes(status);
}
```

Do not introduce a Prisma-enum import, a new exported alias, a validator, a
per-value branch, a coercion change, or a new literal. Predicate bodies stay
byte-for-byte identical.

## Expected impact

- Routes changed: none (`GET .../events` paths, verbs, guards, and SSE
  framing are untouched).
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none (emitted
  bodies already carry member literals; runtime values are already members;
  OpenAPI `runSchema` / `exportSchema` stay `{ type: 'string' }`; type-only
  param narrowing cannot alter a snapshot).
- Database schema, Prisma models, migrations, RLS, queries, indexes,
  queues, and persisted-data formats changed: none.
- Runtime server behavior: unchanged — every in-flight run/export maps to
  the identical SSE frame sequence with identical terminal booleans and
  identical event ids.
- Compile-time contract: the two SSE predicates no longer admit an invented
  run state or export status string at any call site. Any future
  construction inventing an eighth run state (or a sixth export status)
  fails typecheck at the predicate boundary instead of compiling through
  `string`.
- Logging/observability: unchanged; no run/export state is logged beyond
  existing paths.
- Threat model: no new boundary and no risk reclassification. The change
  adds two concrete predicate type-contract details under the existing
  Phase 7 deterministic-ingestion and Phase 10 governed-export behavior.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and
   every skill named in `## SKILLS USED`. Confirm `git status --short`
   before editing; preserve any unrelated user changes and stop if they
   overlap an approved path. Confirm `HEAD` is `7ace455` (or record the
   actual SHA and adjust `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–4 at execution: re-run the terminal
   predicate grep over `server/src`, diff the two vocabulary authorities
   (schema enums vs generated enums vs shared DTOs), confirm each
   `events()` call site passes a `getRun` / `getExport` DTO field, and
   re-grep both controllers for existing DTO-type imports. If a vocabulary
   disagreement, a fourth predicate, a non-DTO call site, or a pre-existing
   import appears, stop and report it rather than silently widening scope.
3. In `server/src/ingestion/ingestion.controller.ts`, make only two edits:
   add `import type { IngestionRunSummary } from '@acres/shared';` in the
   existing type-import group (or reuse the import if one appeared), and
   change the `isIngestionTerminal` parameter to
   `IngestionRunSummary['state']`. Leave the predicate body, the SSE
   pipeline, `runSchema` (`stringSchema()` stays), and every route handler
   byte-for-byte unchanged. Do not add any other import, alias, cast, or
   validator.
4. In `server/src/reports/reports.controller.ts`, make only two edits: add
   `import type { ExportRequest } from '@acres/shared';` in the existing
   import group (or reuse the import if one appeared), and change the
   `isExportTerminal` parameter to `ExportRequest['status']`. Leave the
   predicate body, the SSE pipeline, `exportSchema` (`stringSchema()`
   stays), and every route handler byte-for-byte unchanged. Do not add any
   other import, alias, cast, or validator.
5. Make no other production edit: no shared DTO, service mapper, DTO,
   resolver, GraphQL type, Prisma schema, migration, seed, spec,
   repository, worker, scanner, storage port, outbox payload, retention job,
   AI draft surface, or client change. If typecheck demands more than the
   two imports plus the two annotations, restore and report rather than
   expanding scope.
6. Run the focused DTO-producer regression suites (server runtime
   unchanged; predicates observe their outputs). If any valid run/export
   maps to a different response shape, value, or terminal boolean, stop and
   report the exact fixture: a type-only narrowing must not alter runtime
   output.
7. Run `npm run contracts:check` and verify no generated REST/OpenAPI/
   GraphQL artifact changes. This narrowing must not alter a public
   contract snapshot (OpenAPI stays `{ type: 'string' }`).
8. Update `docs/ingestion.md` in the SSE run-events section (or the
   verification section if that is where the predicate contract lives at
   execution). Record that `isIngestionTerminal()` admits only
   `IngestionRunSummary['state']` (seven Prisma literals, new type-only
   import, unchanged body); that `runSchema` response shapes deliberately
   stay open; and that no terminal boolean, event id, or frame sequence
   changed.
9. Update `docs/reports.md` in the Export progress streaming section (or
   the verification section if that is where the predicate contract lives
   at execution). Record that `isExportTerminal()` admits only
   `ExportRequest['status']` (five Prisma literals, new type-only import,
   unchanged body); that `exportSchema` response shapes deliberately stay
   open; and that no terminal boolean, event id, or frame sequence changed.
10. Inspect the complete diff, run every check below, and quote real exit
    status plus meaningful test/build totals. Fix issues before review.
11. Run the mandatory two-stage review loop:
    - dispatch a read-only reviewer subagent with `requesting-code-review`,
      this prompt path, `BASE_SHA=7ace455` (or the recorded actual HEAD),
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
    - `prompts/124-sse-terminal-predicate-narrowing.md`;
    - `docs/ingestion.md`;
    - `docs/reports.md`;
    - `server/src/ingestion/ingestion.controller.ts`;
    - `server/src/reports/reports.controller.ts`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend,
      or push. Use a terse Conventional Commit subject and include a short
      body explaining the SSE predicate reason, because it is not obvious
      from the subject alone.

## Non-goals

- No change to `packages/shared/src/ingestion.ts` or
  `packages/shared/src/reports.ts`: both DTOs are already closed (prompts
  121/122); this prompt only makes the two server consumers admit exactly
  what the shared contracts already require.
- No change to either predicate body, member list, SSE interval (1500ms),
  event type (`ingestion.progress` / `export.progress`), event id shape, or
  `takeWhile` inclusive flag: witnesses only; no streaming semantics change.
- No change to controller OpenAPI response schemas (`stringSchema()`
  stays `{ type: 'string' }` in the snapshot): response-shape
  documentation, not a response vocabulary; a GraphQL/OpenAPI enum migration
  is a separate public-contract decision with snapshot consequences.
- No change to `failure.code` / `failure.message`, `progressStage` /
  `progressPercent`, `stage`, ids, timestamps, or checksums: different
  carriers, explicitly out of scope (prompts 80–82 own the failure _write_
  unions; prompt 123 owns the upload stage/failure openness decision).
- No change to uploads `terminal()` (`UploadStatus['state']`, prompt 123):
  already closed; the grep witness must keep compiling untouched.
- No change to any Prisma schema, migration, seed, repository query, RLS,
  index, worker transition, scanner verdict, storage port, outbox payload,
  retention purge, download expiry, dashboard-evidence `schemaVersion`, or
  AI draft surface: separate decisions owned elsewhere.
- No change to any spec/e2e literal or client SSE consumer (`streamSse`,
  `ExportStatus`, progress components): witnesses only; no test or UI
  semantics change.
- No new import beyond the two type-only DTO imports, and no shared alias,
  Prisma-enum import, validator, cast helper, per-value branch, coercion
  change, or literal addition.
- No schema migration, SQL, Prisma repository, RLS, index, tenant, worker
  queue, storage, upload flow, route, API contract, client component,
  design, accessibility, motion, or browser work.
- No new test cases and no invented negative-type-test pattern
  (`ts-expect-error` / `expectTypeOf` have zero uses in this repository);
  no general controller refactor or unrelated cleanup.

## Reference deltas

No visual delta. The deliberate static delta is limited to two type-only
imports plus two parameter annotations: invented run-state / export-status
strings no longer reach the SSE completion predicates at compile time.
Runtime acceptance, emitted frames, event ids, terminal booleans, OpenAPI
snapshots, and every error path are observably identical before and after.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this server predicate type change. No
responsive, touch-target, or reduced-motion surface moves.

## Checks to run, and the owning doc

```bash
# Focused DTO-producer regression (must pass; server runtime unchanged)
npm --workspace=@acres/server test -- reports.service.spec.ts ingestion-processor.service.spec.ts

# Public contracts must remain unchanged (OpenAPI stays string)
npm run contracts:check

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/124-sse-terminal-predicate-narrowing.md \
  docs/ingestion.md \
  docs/reports.md \
  server/src/ingestion/ingestion.controller.ts \
  server/src/reports/reports.controller.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/124-sse-terminal-predicate-narrowing.md \
  docs/ingestion.md \
  docs/reports.md \
  server/src/ingestion/ingestion.controller.ts \
  server/src/reports/reports.controller.ts
```

Quote the actual exit status and meaningful Jest/build totals. If a named
spec does not exist at execution time, locate the closest current
equivalent with `rg --files server/src/ingestion server/src/reports`, run
it, and record that evidence instead of claiming a nonexistent check.
Browser E2E, real PostgreSQL, spatial plan, and operations-drill suites are
intentionally omitted because this scope adds no rejection path, changes no
schema/query behavior, and touches no browser journey or deployment surface.

`docs/ingestion.md` and `docs/reports.md` co-own the implementation record.
`docs/backend.md` (SSE section) and `docs/security.md` are read-only
verification for this task; update either only if execution proves a
statement materially stale, and stop before broadening scope.

## Rollback and stop conditions

Rollback is a source/doc revert; there is no migration or
persisted-data rollback. Stop before expanding scope if any of these occur:

- the predicate grep shows other than the two open predicates plus the
  closed uploads `terminal()` at execution time;
- the vocabulary authorities disagree on the seven run states or five
  export statuses (schema vs generated enums vs shared DTOs);
- any `events()` call site passes a non-DTO-constructed string (query input
  or hand-built literal);
- either controller already imports its DTO type in a way that changes the
  planned diff — reuse it and record the smaller diff rather than absorbing
  unrelated import churn;
- an existing server test changes outcome (not just compilation) after
  the edit;
- a public contract snapshot changes;
- the fix requires a new literal, validator, cast, alias, import beyond the
  two type-only DTO imports, error code/message, schema change, repository
  rewrite, GraphQL change, seed rewrite, spec rewrite, or client change.

Report the contradictory evidence and prepare a separate prompt rather
than silently changing the premise.

## Completion criteria

- `isIngestionTerminal()` accepts only `IngestionRunSummary['state']`
  (seven literals) at compile time, with an unchanged predicate body.
- `isExportTerminal()` accepts only `ExportRequest['status']` (five
  literals) at compile time, with an unchanged predicate body.
- Exactly two type-only imports added (one per controller); no other
  import, alias, cast, or validator introduced.
- Controller response schemas and all other carriers are byte-for-byte
  equivalent in behavior.
- Current ingestion/report service tests pass with identical server outcomes
  and terminal booleans.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all
  verified blocking/important findings are fixed and re-tested.
- `docs/ingestion.md` and `docs/reports.md` record the predicate narrowing
  invariant, the indexed-access judgement with its new imports, the
  deliberate response-schema openness, and the no-runtime-change proof.
- Only the approved paths are committed locally to `main`; nothing is
  pushed.

## SKILLS USED

- `architecture-patterns` — preserve the existing controller / service /
  shared-DTO boundaries; couple each predicate only to the DTO its handler
  already observes, avoiding new cross-module coupling.
- `nestjs-best-practices` — keep the change outside Nest provider/module
  wiring; both predicates are module-local pure functions, read-only except
  for param annotations plus type-only imports.
- `postgres-best-practices` — verify against the `IngestionRunState` and
  `ExportStatus` enum-versus-column contracts; no schema, migration,
  transaction, RLS, or persistence change.
- `sql-optimization-patterns` — verify no query, index, or query-plan work
  is introduced by this in-memory type change.
- `api-design-principles` — guard duty only: no public route or envelope
  change; `contracts:check` proves the OpenAPI snapshot is unchanged.
- `security-best-practices` — guard duty only: no trust-boundary or
  persistence change; read-only verification against `docs/security.md`.
- `security-threat-model` — guard duty only: no boundary moves; verify no
  risk reclassification.
- `error-handling-patterns` — keep the deterministic SSE pipelines and
  existing not-found paths; no new failure literal is introduced.
- `javascript-testing-patterns` — rely on the existing ingestion/report
  Jest suites as unchanged-outcome regression proof; no test semantics
  changed.
- `e2e-testing-patterns` — guard duty only: no cross-system journey
  changes; E2E intentionally omitted per §Checks.
- `secrets-management` — guard duty only: no credential or signed-URL
  surface is touched by this predicate change.
- `requesting-code-review` — dispatch the mandatory structured read-only
  review with precise scope, SHAs, changed paths, and check evidence.
- `receiving-code-review` — verify reviewer claims against repository
  reality before fixes or technical pushback.
- `caveman-commit` — produce the required terse Conventional Commit
  message with a short SSE predicate rationale body.

Not loaded, with reason: `openapi-spec-generation` (contracts:check guard
duty only, no public contract change); `playwright` (no SSE UI or browser
journey); frontend/Tailwind/shadcn/GSAP skills (no UI or motion).
