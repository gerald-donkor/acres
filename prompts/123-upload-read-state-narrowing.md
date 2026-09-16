# 123 — narrow upload read `state` to the closed Prisma `UploadState` and reconcile the shared `pending` vs `pending_upload` mismatch

## Scope, and why it is next

The committed repository is on `main` at `7a7adf9`
(`refactor(reports): narrow read enum unions`, the prompt 122
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 122 — which closed the last open server-side carriers on the Phase 10
read path (`toReport()` `status`, `toRevision()` `status` / `evidenceType`,
`toExport()` `format` / `status` in `server/src/reports/reports.service.ts`,
with the five `as` casts removed and no runtime change).

There is no unbuilt ordered phase left. The next smallest unblocked residual is
the upload-read decision prompt 122 explicitly deferred in §Non-goals:

> No change to any upload-domain carrier (`uploads.service.ts:345`,
> `uploads.controller.ts:37,153`, shared `uploads.ts`): a different domain
> with its own pending-vs-pending_upload alias mismatch and free-form
> `progressStage` column; a separate upload-read decision owns any change
> there.

The gap, at `7a7adf9` (re-verify exact lines at execution):

```ts
// packages/shared/src/uploads.ts:1–7
export type UploadState =
  | 'pending' // ← mismatch: Prisma has 'pending_upload', not 'pending'
  | 'scanning'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'expired';
// ← missing 'completed'; six members vs Prisma's seven.
// Consumed nowhere outside this file (verified this session) — dead alias.

// packages/shared/src/uploads.ts:9–19
export interface UploadStatus {
  readonly state: string; // ← open (UploadState, seven members)
  readonly progress: { stage: string; percent: number }; // ← stage open (free-form, stays open)
}

// server/src/uploads/uploads.service.ts:343–356
private toStatus(upload: {
  id: string;
  state: string; // ← open (UploadState)
  declaredFilename: string;
  declaredMediaType: string;
  declaredByteCount: bigint;
  completedByteCount: bigint | null;
  checksumHex: string | null;
  progressStage: string; // ← open (free-form String column, stays open)
  progressPercent: number;
  failureCode: string | null;
  failureMessage: string | null;
  acceptedAt: Date | null;
}): UploadStatus {
  return {
    id: upload.id,
    state: upload.state, // ← wide-to-wide today; becomes narrow-to-narrow after
    progress: { stage: upload.progressStage, percent: upload.progressPercent },
  };
}

// server/src/uploads/uploads.controller.ts:153–155
function terminal(state: string): boolean { // ← open
  return ['accepted', 'rejected', 'cancelled', 'expired'].includes(state);
}
```

against the single authority the codebase already states for `state`:

- `UploadState` — `pending_upload | completed | scanning | accepted |
  rejected | cancelled | expired` (seven members):
  `server/prisma/schema.prisma:467–475`,
  `server/src/generated/prisma/enums.ts:83–93`,
  (`Upload.state UploadState`, DB-enforced via `Upload.state
  :345`).

This is the direct Phase 6 analogue of prompts 115–117, 120, and 122 (which
narrowed `toObservation()` severity/state, `toMetric()` / `toAggregate()`
value-type / aggregation / status, `toView()` status, the four ingestion
`toX()` mappers, and the three reports `toX()` mappers with inline unions and
no runtime change). Unlike prompts 120/121, there is no server-first /
shared-second split here: the shared `UploadState` alias is consumed nowhere
(zero hits outside `packages/shared/src/uploads.ts`, verified this session),
so fixing the alias and typing both `UploadStatus.state` and the `toStatus`
parameter in one prompt introduces no assignability conflict and is the
smaller delta. A generated-enum import into the dependency-free shared
contract or into the service (which imports only `type { UploadStatus }`
from `@acres/shared` plus `Prisma` types indirectly) is deferred as wider
than the gap, per the prompts 115–122 minimal-diff precedent.

Typing `terminal()` as `UploadStatus['state']` rather than a duplicated
inline union is a judgement, stated as one: the controller already imports
`type { UploadStatus }` (`uploads.controller.ts:33`), so the indexed access
keeps the SSE completion predicate coupled only to the shared DTO it already
observes, with zero new imports and zero duplicated literals. A Prisma-enum
import or a copy-pasted seven-member union in the controller is deferred as
wider than the gap.

Leaving `progressStage` / `progress.stage` as open `string` is a judgement,
stated as one: the column is a free-form `String` (`schema.prisma:356`,
`@default("created")`, migration default `'created'`), not an enum — there is
no closed vocabulary authority to mirror. Six stage literals are observed in
writes (`created` default, `queued_scan` in `uploads.service.ts:201`,
`cancelled` in `:288`, `scanning` / `accepted` / `rejected` in
`upload-worker.service.ts:212,251,281`), but no schema, generated-enum, or
shared carrier states them as closed, and narrowing to the six observed
strings would invent a vocabulary §10 forbids. The same openness policy
prompts 115–122 applied to `code` / `message`, `calculationVersion`, units,
ids, `renderingVersion`, and `failure` carriers applies here.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 6 storage/queues/worker outcome and exact phase
  skill manifest (§7); Phase 7/8/9/10 narrowing precedent (§§8–11); §§16–22
  confirming no unbuilt ordered phase.
- `docs/backend.md` — current Nest modular-monolith/server conventions,
  storage/queue/worker runbook ownership, and root build/test command
  ownership; the owning implementation record for this prompt (no module,
  provider, route, or database surface changes).
- `docs/security.md` — TM boundaries. This work tightens private read-mapper
  and shared DTO parameter contracts; it does not add or move a trust
  boundary, persist new data, or change an envelope.
- `docs/ingestion.md` — the prompt 120 mapper-narrowing and prompt 121
  shared-narrowing paragraphs; the inline-union precedent and the
  server/shared split this prompt deliberately does not repeat (dead alias,
  single-prompt fix).
- `docs/analytics.md` — the prompt 115/116 read-side narrowing paragraphs
  (inline-union judgement, `code` / `message` deliberately left open, no
  negative-type-test pattern). Read-only context.
- `docs/dashboards.md` — the prompt 117 `toView()` status paragraph
  (cast-removal precedent) and the prompt 119 shared-narrowing paragraph.
  Read-only context.
- `docs/reports.md` — the prompt 122 §Non-goals paragraph deferring exactly
  this upload-read decision, plus the cast-removal and response-schema
  paragraphs this prompt mirrors. Read-only context.
- `server/prisma/schema.prisma` — `Upload.state UploadState :345`,
  `progressStage String @default("created") :356`, `enum UploadState`
  (`:467–475`, seven members in order `pending_upload, completed, scanning,
  accepted, rejected, cancelled, expired`). Read-only; no migration.
- `server/prisma/migrations/20260824170000_storage_queues_uploads/migration.sql`
  — `CREATE TYPE "UploadState" … (:4)`, `"progressStage" text NOT NULL
  DEFAULT 'created' (:50)`. Read-only witness that `state` is DB-enforced
  enum while `progressStage` is free-form text.
- `server/src/generated/prisma/enums.ts` — `UploadState` const + type
  (`:83–93`, seven members byte-identical to the schema enum). Read-only;
  regenerated, never hand-edited.
- `packages/shared/src/uploads.ts` — `UploadState` (`:1–7`, six-member,
  `pending` mismatch, missing `completed`), `UploadStatus.state` (`:11`,
  open), `progress.stage` (`:16`, open), `failure` (`:17`, open).
  Re-read at execution and resolve current line numbers rather than editing
  from this snapshot.
- `server/src/uploads/uploads.service.ts` — `toStatus` (`:343–374`, one open
  `state` plus one open `progressStage`), `complete()` guard
  (`upload.state !== 'pending_upload' :191`, write `state: 'completed'`
  `:197`, `progressStage: 'queued_scan'` `:201`), `cancel()` writes
  (`state: 'cancelled'` `:286`, `progressStage: 'cancelled'` `:288`),
  `download()` guard (`upload.state !== 'accepted'` `:307`), `get()` /
  `complete()` / `cancel()` call sites passing Prisma rows into `toStatus`.
  Re-read at execution; resolve current line numbers.
- `server/src/uploads/uploads.controller.ts` — `uploadStatusSchema`
  `state: stringSchema()` (`:37`), SSE `takeWhile((status) =>
  !terminal(status.state))` (`:139`), `terminal(state: string)` (`:153–155`).
  Re-read at execution. `UploadStatus` type already imported (`:33`).
- `server/src/worker/upload-worker.service.ts` — `state: 'scanning'` /
  `progressStage: 'scanning'` (`:211–212`), `state: 'accepted'` /
  `progressStage: 'accepted'` (`:248,251`), `state: 'rejected'` /
  `progressStage: 'rejected'` (`:276,281`). Read-only witnesses that runtime
  writes are members of the seven-state vocabulary and the six observed
  stages; unchanged.
- `server/src/worker/upload-worker.service.spec.ts` — `state: 'completed'`
  (`:330`), `state: 'pending_upload'` (`:377`), `state: 'scanning'` /
  `progressStage: 'scanning'` (`:390,405–407`), `state: 'accepted'` /
  `progressStage: 'accepted'` (`:424–428`), `state: 'rejected'` /
  `progressStage: 'rejected'` (`:483–489,551–557`), `state: 'cancelled'`
  (`:583,599`). Re-read at execution; all state literals are members of the
  seven-state vocabulary (witnesses, not edited — see §Non-goals).
- `server/test/api.e2e-spec.ts` — uploads describe (`:275ff`), `state:
  'pending_upload'` (`:281`). Re-read at execution; member literal
  (witness, not edited).
- `client/components/acres/app/dataset-actions.tsx` — `uploadStatus.state`
  rendered in a `Badge` (`:570`, display only, no construction or branch on
  upload state). Read-only vocabulary witness; unchanged. The `run.state`
  branches (`:400–407,720–790`) are ingestion-domain `IngestionRunState`
  members, a different domain — read-only, must not be touched.
- `prompts/115-observation-read-quality-severity-state-narrowing.md` —
  the severity/state precedent (inline-union judgement, `code` / `message`
  deliberately left open, no negative-type-test pattern).
- `prompts/120-ingestion-read-enum-narrowing.md` — the closest lineage prompt
  (multi-field read-mapper narrowing, `failureCode` / `message` openness
  policy, contracts guard) this prompt mirrors for the upload service.
- `prompts/121-shared-ingestion-contract-narrowing.md` — the shared-contract
  prompt (alias widening, in-file alias reuse judgement, mock-literal proof)
  this prompt mirrors for the upload shared contract, minus the split.
- `prompts/122-reports-read-enum-narrowing.md` — the deferring prompt (upload
  carriers named as a separate decision, response-schema-stays-`string`
  precedent, GraphQL-absence witness pattern).

No visual reference is applicable. This is an internal server read-mapper
plus shared-DTO parameter change, so the design-system PDF, landing-page
PNGs, and recorded chrome flows provide no evidence and must not be opened
or cited as if they did.

## Measurements and verified invariants

These are code-derived constraints at `7a7adf9`; re-verify them before editing:

1. Exactly one open shared alias plus two open shared fields: `UploadState`
   (`uploads.ts:1–7`, six members with `pending`), `UploadStatus.state:
   string` (`:11`), `progress.stage: string` (`:16`). Re-run the grep over
   `packages/shared/src/uploads.ts` at execution (`UploadState|state:
   string|stage: string`) and confirm no additional site appeared.
   `UploadState` is consumed nowhere outside its defining file (verified
   this session via repo-wide `rg -n "UploadState"` excluding `generated/`
   — single hit at the definition). Re-grep at execution; if a consumer
   appeared that constructs a non-member through the alias, record it — the
   fix list must be extended by separate decision, not silently.
2. Exactly two open server mapper fields plus one open controller param:
   `toStatus` `state: string` (`uploads.service.ts:345`),
   `progressStage: string` (`:351`), `terminal(state: string)`
   (`uploads.controller.ts:153`). Re-run the grep over both files at
   execution and confirm no third site appeared inside `toStatus` or the
   controller. `declaredFilename`, `declaredMediaType`, ids, timestamps,
   `failureCode` / `failureMessage`, `byteCount`, and `progressPercent` are
   different carriers, explicitly out of scope.
3. The closed `state` vocabulary is exactly seven literals, byte-for-byte
   identical across `schema.prisma:467–475` and `enums.ts:83–93`, in Prisma
   order: `pending_upload, completed, scanning, accepted, rejected,
   cancelled, expired`. If the authorities disagree at execution, stop and
   report it rather than picking a winner silently.
4. The shared alias mismatch is exactly as stated: shared has `pending`
   where Prisma has `pending_upload`, and shared lacks `completed`. No other
   member differs. If the alias already gained `completed`, already renamed
   `pending`, or widened further at execution, record it and re-scope rather
   than absorbing it silently.
5. All committed fixtures use `state` members. Re-grep `state: '` literals
   in `upload-worker.service.spec.ts` and `server/test/api.e2e-spec.ts` at
   execution (`pending_upload`, `completed`, `scanning`, `accepted`,
   `rejected`, `cancelled`); if any upload `state` value falls outside the
   seven literals, stop and report it rather than widening scope or
   rewriting test semantics. `progressStage` literals (`created`,
   `queued_scan`, `scanning`, `accepted`, `rejected`, `cancelled`) are
   witnesses only — the stage carrier stays open by design (item 7).
6. Every `toStatus` call site passes a Prisma row field. At execution,
   re-verify that `complete()` (`:228`), `get()` (`:246`), and `cancel()`
   (`:279,292`) pass `updated` / `upload` rows from `tx.upload` (Prisma
   `UploadState`-typed `state`); if any call site constructs the value from
   query input or a hand-built literal, record it — the fix list must be
   extended by separate decision, not silently.
7. `progressStage` has no closed authority: the column is `String`
   (`schema.prisma:356`, migration default `'created'`), there is no
   `ProgressStage` enum in `schema.prisma` or `enums.ts` (verify zero hits
   at execution), and the shared `progress.stage` is open `string` with no
   alias. The six observed literals are runtime writes, not a vocabulary.
   Narrowing stage to those six strings would invent a contract — forbidden.
   Both stage carriers stay `string` by decision, recorded in the docs edit.
8. Controller OpenAPI response schema (`uploads.controller.ts:35–40`,
   `state: stringSchema()`) stays `{ type: 'string' }` in the snapshot by
   design, per the prompts 116/120/122 precedent (response-shape
   documentation, not a response vocabulary; a GraphQL/OpenAPI enum
   migration is a separate public-contract decision with snapshot
   consequences). `contracts:check` must still report no artifact change; if
   a snapshot moves, stop — a read-state narrowing with already-member
   runtime values must not alter a public contract snapshot.
9. No runtime value moves: every mapper returns the identical object it
   returns today (same values, same key order), and `terminal()` returns the
   identical boolean for every input. A server test that changes outcome
   (not just compilation) after this edit disproves the premise — stop and
   report it.
10. There is no established negative-type-test pattern in this repository
    (verified through prompt 122: zero `ts-expect-error` / `expectTypeOf`
    uses in `server/src`, `client/`, `packages/shared/src`). Do not invent
    one; the gates are `npm run typecheck` (which must reject a future
    non-member construction at the mapper/DTO boundary) plus unchanged
    runtime suites.

The required shapes:

```ts
// packages/shared/src/uploads.ts
export type UploadState =
  | 'pending_upload' // ← renamed (was 'pending')
  | 'completed' // ← added (was missing)
  | 'scanning'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'expired';
// order matches the Prisma enum: pending_upload, completed, scanning,
// accepted, rejected, cancelled, expired.

export interface UploadStatus {
  readonly id: string;
  readonly state: UploadState; // ← narrowed (was string)
  readonly filename: string;
  readonly mediaType: string;
  readonly byteCount: number;
  readonly checksumHex: string | null;
  readonly progress: { stage: string; percent: number }; // ← stage stays string by decision
  readonly failure: { code: string; message: string | null } | null; // ← stays open
  readonly acceptedAt: string | null;
}
```

```ts
// server/src/uploads/uploads.service.ts
private toStatus(upload: {
  id: string;
  state:
    | 'pending_upload'
    | 'completed'
    | 'scanning'
    | 'accepted'
    | 'rejected'
    | 'cancelled'
    | 'expired';
  declaredFilename: string;
  declaredMediaType: string;
  declaredByteCount: bigint;
  completedByteCount: bigint | null;
  checksumHex: string | null;
  progressStage: string; // ← stays open by decision (free-form column)
  progressPercent: number;
  failureCode: string | null;
  failureMessage: string | null;
  acceptedAt: Date | null;
}): UploadStatus {
  return {
    id: upload.id,
    state: upload.state, // ← direct (narrow-to-narrow; no cast exists or added)
    // ... unchanged
    progress: { stage: upload.progressStage, percent: upload.progressPercent },
  };
}
```

```ts
// server/src/uploads/uploads.controller.ts (no new import; UploadStatus type already imported :33)
function terminal(state: UploadStatus['state']): boolean {
  return ['accepted', 'rejected', 'cancelled', 'expired'].includes(state);
}
```

Do not introduce a Prisma-enum import, a new exported alias, a validator, a
per-value branch, a coercion change, or a new literal.

## Expected impact

- Routes changed: none.
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none (response
  bodies already carry member literals; runtime server values are already
  members; OpenAPI `uploadStatusSchema` stays `{ type: 'string' }` for
  `state`; type-only param/DTO narrowing plus the `terminal` param
  annotation cannot alter a snapshot).
- Database schema, Prisma models, migrations, RLS, queries, indexes,
  queues, and persisted-data formats changed: none.
- Runtime server behavior: unchanged — every upload accepted today maps to
  the identical `UploadStatus` object with identical key order, and the SSE
  `terminal()` predicate returns the identical boolean for every state.
- Runtime mock/spec behavior: unchanged — worker specs and e2e already emit
  members.
- Compile-time contract: `toStatus`, `UploadStatus.state`, and `terminal()`
  no longer admit an invented upload state string at any construction site.
  Any future read-path construction inventing an eighth upload state fails
  typecheck at the mapper/DTO boundary instead of compiling through `string`.
  The shared `pending` vs `pending_upload` hole is closed: the alias admits
  exactly the seven Prisma literals the server already persists.
- Logging/observability: unchanged; no upload state is logged beyond
  existing paths.
- Threat model: no new boundary and no risk reclassification. The change
  adds a concrete read-mapper/shared-DTO type-contract detail under the
  existing Phase 6 secure-upload behavior.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and
   every skill named in `## SKILLS USED`. Confirm `git status --short`
   before editing; preserve any unrelated user changes and stop if they
   overlap an approved path. Confirm `HEAD` is `7a7adf9` (or record the
   actual SHA and adjust `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–6 at execution: re-run the shared-open
   grep over `packages/shared/src/uploads.ts`, the server-open grep over
   `uploads.service.ts` / `uploads.controller.ts`, the repo-wide
   `UploadState` consumer grep (excluding `generated/`), the
   `ProgressStage`-enum absence grep, the fixture-literal greps in
   `upload-worker.service.spec.ts` and `server/test/api.e2e-spec.ts`, and
   the `toStatus` call-site check (`complete` / `get` / `cancel` pass Prisma
   rows). Diff the two `state` vocabulary authorities (schema enum vs
   generated enum). If a vocabulary disagreement, a new open site, a new
   alias consumer, a `ProgressStage` enum appearance, a non-Prisma call
   site, or a non-member upload fixture appears, stop and report it rather
   than silently widening scope.
3. In `packages/shared/src/uploads.ts`, change only the alias plus the one
   field type: rename `pending` to `pending_upload`, add `completed` in
   Prisma order, and type `UploadStatus.state` as `UploadState`. Leave
   `progress.stage`, `failure.code` / `failure.message`, every input DTO,
   every `id`, every timestamp, `byteCount`, `checksumHex`, and
   `progress.percent` byte-for-byte unchanged. Do not add an import, a new
   exported alias, a cast, or a validator.
4. In `server/src/uploads/uploads.service.ts`, change only the `toStatus`
   `state` parameter type to the seven-member inline union in §Measurements
   (Prisma order). Leave `progressStage: string`, every return-statement
   value, every `toISOString()` call, `failureCode` / `failureMessage`
   pass-through, `progressPercent`, and every public method signature
   byte-for-byte unchanged in behavior. Do not add an import, alias, cast,
   or validator.
5. In `server/src/uploads/uploads.controller.ts`, change only the `terminal`
   parameter type to `UploadStatus['state']`. Leave the predicate body, the
   SSE pipeline, `uploadStatusSchema` (`stringSchema()` stays), and every
   route handler byte-for-byte unchanged. Do not add an import (the
   `UploadStatus` type import at `:33` already covers the indexed access).
6. Make no other production edit: no DTO, resolver, GraphQL type, Prisma
   schema, migration, seed, spec, repository, worker, scanner, storage port,
   outbox payload, retention job, report/analytics/ingestion surface, or
   client change. If typecheck demands more than the alias fix plus the
   three annotations, restore and report rather than expanding scope.
7. Run the focused upload/worker regression suite. If any valid upload maps
   to a different response shape, value, key order, or terminal boolean,
   stop and report the exact fixture: a type-only narrowing must not alter
   runtime output.
8. Run `npm run contracts:check` and verify no generated REST/OpenAPI/
   GraphQL artifact changes. This narrowing must not alter a public
   contract snapshot (OpenAPI `state` stays `{ type: 'string' }`).
9. Update `docs/backend.md` in the storage/upload section (or the
   verification section if that is where the upload contract lives at
   execution). Record that shared `UploadState` is reconciled to the seven
   Prisma literals (`pending` renamed to `pending_upload`, `completed`
   added, Prisma order), that shared `UploadStatus.state`, server
   `toStatus()` `state`, and controller `terminal()` (`UploadStatus['state']`)
   are typed as the closed `UploadState`; that `progressStage` /
   `progress.stage`, `failure.code` / `message`, and controller response
   schemas deliberately stay open (`progressStage` is a free-form `String`
   column with default `created`, not an enum); and that no runtime mapping,
   rejection, terminal boolean, or response shape changed.
10. Inspect the complete diff, run every check below, and quote real exit
    status plus meaningful test/build totals. Fix issues before review.
11. Run the mandatory two-stage review loop:
    - dispatch a read-only reviewer subagent with `requesting-code-review`,
      this prompt path, `BASE_SHA=7a7adf9` (or the recorded actual HEAD),
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
    - `prompts/123-upload-read-state-narrowing.md`;
    - `docs/backend.md`;
    - `packages/shared/src/uploads.ts`;
    - `server/src/uploads/uploads.service.ts`;
    - `server/src/uploads/uploads.controller.ts`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend,
      or push. Use a terse Conventional Commit subject and include a short
      body explaining the upload read-state reason, because it is not obvious
      from the subject alone.

## Non-goals

- No change to `progressStage` / `progress.stage` carriers: free-form
  `String` column (`schema.prisma:356`, default `created`), not an enum;
  stays `string` like analytics `code` / `message` per prompt 115. A stage
  vocabulary would invent a contract and is a separate product decision.
- No change to `failure.code` / `failure.message` carriers: read carriers
  stay open like analytics `code` / `message` per prompt 115; prompts 80–82
  own the failure _write_ unions and are not revisited here.
- No change to `server/src/uploads/uploads.controller.ts`
  `uploadStatusSchema` (`stringSchema()` stays `{ type: 'string' }` in the
  snapshot): response-shape documentation, not a response vocabulary; a
  GraphQL/OpenAPI enum migration is a separate public-contract decision with
  snapshot consequences.
- No change to any Prisma schema, migration, seed, repository query, RLS,
  index, worker transition, scanner verdict, storage port, outbox payload,
  retention purge, SSE timing, `terminal()` predicate body, or route guard:
  witnesses only; no behavioral semantics change.
- No change to `upload-worker.service.spec.ts`, `server/test/api.e2e-spec.ts`,
  or any spec/e2e literal: witnesses only; the `pending_upload` /
  `completed` / `scanning` / `accepted` / `rejected` / `cancelled` values are
  already members. No test semantics change.
- No change to ingestion `run.state` / `run.stage` display branches in
  `dataset-actions.tsx` (`:400–407,720–790`) or `datasets-workspace.tsx`
  (`:110–111,159,260–262`): different domain (`IngestionRunState` /
  `DatasetState`), not upload vocabulary. The `uploadStatus.state` badge
  (`:570`) is display-only and stays compiling untouched.
- No change to any analytics, dashboard, ingestion, report, export, job,
  outbox, scan, or AI draft carrier: different domains owned elsewhere.
- No new import (including Prisma-enum imports), shared alias, validator,
  cast helper, per-value branch, coercion change, or literal addition.
- No schema migration, SQL, Prisma repository, RLS, index, tenant, worker
  queue, storage, upload flow, route, API contract, client component,
  design, accessibility, motion, or browser work.
- No new test cases and no invented negative-type-test pattern
  (`ts-expect-error` / `expectTypeOf` have zero uses in this repository);
  no general mapper refactor or unrelated cleanup.

## Reference deltas

No visual delta. The deliberate static delta is limited to the shared alias
fix plus three type annotations: `pending` becomes `pending_upload`,
`completed` is added, and invented upload-state strings no longer construct
`UploadStatus.state`, the `toStatus` parameter, or the `terminal()` predicate
at compile time. Runtime acceptance, mapped output, key order, enum-column
contents, SSE terminal booleans, OpenAPI snapshots, and every error path are
observably identical before and after.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this server/shared type change. No responsive,
touch-target, or reduced-motion surface moves.

## Checks to run, and the owning doc

```bash
# Focused upload/worker regression (must pass; server runtime unchanged)
npm --workspace=@acres/server test -- upload-worker.service.spec.ts

# Public contracts must remain unchanged (OpenAPI state stays string)
npm run contracts:check

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/123-upload-read-state-narrowing.md \
  docs/backend.md \
  packages/shared/src/uploads.ts \
  server/src/uploads/uploads.service.ts \
  server/src/uploads/uploads.controller.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/123-upload-read-state-narrowing.md \
  docs/backend.md \
  packages/shared/src/uploads.ts \
  server/src/uploads/uploads.service.ts \
  server/src/uploads/uploads.controller.ts
```

Quote the actual exit status and meaningful Jest/build totals. If a named
spec does not exist at execution time, locate the closest current
equivalent with `rg --files server/src/uploads server/src/worker`, run it,
and record that evidence instead of claiming a nonexistent check. Browser
E2E, real PostgreSQL, spatial plan, and operations-drill suites are
intentionally omitted because this scope adds no rejection path, changes no
schema/query behavior, and touches no browser journey or deployment surface.

`docs/backend.md` owns the implementation record. `docs/security.md` is
read-only verification for this task; update it only if execution proves a
statement materially stale, and stop before broadening scope.

## Rollback and stop conditions

Rollback is a source/doc revert; there is no migration or
persisted-data rollback. Stop before expanding scope if any of these occur:

- the shared-open grep shows other than the alias plus the two shared
  fields at execution time, or the server-open grep shows other than the
  two `toStatus` fields plus `terminal()`;
- the vocabulary authorities disagree on the seven literals (schema vs
  generated enums), or an upload fixture contains a `state` value outside
  them;
- the shared alias mismatch already resolved itself (alias already has
  seven members with `pending_upload`/`completed`) or widened — record it
  and re-scope rather than absorbing it silently;
- a `ProgressStage` enum appeared in the schema or generated client —
  record it and prepare a separate stage-vocabulary prompt rather than
  absorbing it here;
- any `toStatus` call site passes a non-Prisma-constructed string (query
  input or hand-built literal);
- an `UploadState` consumer appeared that constructs a non-member through
  the alias;
- an existing server test changes outcome (not just compilation) after
  the edit;
- a public contract snapshot changes;
- the fix requires a new literal, validator, cast, alias, import (any),
  error code/message, schema change, repository rewrite, GraphQL change,
  seed rewrite, spec rewrite, or client change.

Report the contradictory evidence and prepare a separate prompt rather
than silently changing the premise.

## Completion criteria

- Shared `UploadState` admits exactly the seven Prisma literals at compile
  time (`pending` gone, `pending_upload` and `completed` present, Prisma
  order).
- Shared `UploadStatus.state` accepts only the seven literals at compile
  time.
- Server `toStatus()` `state` accepts only the seven literals at compile
  time, with direct narrow-to-narrow assignment.
- Controller `terminal()` accepts only `UploadStatus['state']` at compile
  time, with an unchanged predicate body.
- `progressStage` / `progress.stage`, `failure.code` / `message`,
  controller response schemas, and all other carriers are byte-for-byte
  equivalent in behavior.
- Current upload/worker service tests pass with identical server outcomes
  and terminal booleans.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all
  verified blocking/important findings are fixed and re-tested.
- `docs/backend.md` records the alias reconciliation, the three narrowed
  carriers, the deliberate stage/failure/schema openness, and the
  no-runtime-change proof.
- Only the approved paths are committed locally to `main`; nothing is
  pushed.

## SKILLS USED

- `architecture-patterns` — preserve the existing service / shared-DTO
  boundaries and avoid introducing cross-module coupling or new aliases.
- `nestjs-best-practices` — keep the change outside Nest provider/module
  wiring; `toStatus` is a private pure function and `terminal()` is a
  module-local predicate, read-only except for param annotations.
- `postgres-best-practices` — verify against the `UploadState`
  enum-versus-column contract and the free-form `progressStage String`
  column; no schema, migration, transaction, RLS, or persistence change.
- `sql-optimization-patterns` — verify no query, index, or query-plan work
  is introduced by this in-memory type change.
- `api-design-principles` — guard duty only: no public route or envelope
  change; `contracts:check` proves the OpenAPI snapshot is unchanged.
- `security-best-practices` — guard duty only: no trust-boundary or
  persistence change; read-only verification against `docs/security.md`.
- `security-threat-model` — guard duty only: no boundary moves; verify no
  risk reclassification.
- `error-handling-patterns` — keep the deterministic mappers and existing
  not-found/conflict paths; no new failure literal is introduced.
- `javascript-testing-patterns` — rely on the existing upload/worker Jest
  suite as unchanged-outcome regression proof; no test semantics changed.
- `e2e-testing-patterns` — guard duty only: no cross-system journey
  changes; E2E intentionally omitted per §Checks.
- `secrets-management` — guard duty only: no credential or signed-URL
  surface is touched by this type change.
- `requesting-code-review` — dispatch the mandatory structured read-only
  review with precise scope, SHAs, changed paths, and check evidence.
- `receiving-code-review` — verify reviewer claims against repository
  reality before fixes or technical pushback.
- `caveman-commit` — produce the required terse Conventional Commit
  message with a short upload read-state rationale body.

Not loaded, with reason: `openapi-spec-generation` (contracts:check guard
duty only, no public contract change); `playwright` (no upload UI or
browser journey); frontend/Tailwind/shadcn/GSAP skills (no UI or motion).
