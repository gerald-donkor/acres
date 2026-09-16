# 122 — narrow `toReport()` / `toRevision()` / `toExport()` read enums to the closed Prisma unions

## Scope, and why it is next

The committed repository is on `main` at `2beb834`
(`refactor(shared): narrow ingestion summary unions`, the prompt 121
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 121 — which closed the last open shared-contract carriers on the Phase
7 read path (`IngestionRunState` widened from five to seven members;
`IngestionRunSummary.state` / `.stage`, `DatasetVersionSummary.
publicationStatus`, `DatasetSummary.state`, `ColumnMappingSummary.
validationStatus`, `ValidationIssueSummary.severity` in
`packages/shared/src/ingestion.ts`, with no runtime change).

There is no unbuilt ordered phase left. The next smallest unblocked residual is
inside Phase 10's existing reports/exports requirements, on the read file
prompts 115–121 never touched and explicitly left open: the three private
read mappers in `server/src/reports/reports.service.ts` still type five
enum-backed fields as open `string` (with `as` casts at the return sites),
while every authority the codebase already states says they are closed:

- `ReportStatus` — `draft | published | archived`:
  `server/prisma/schema.prisma:1095–1099`,
  `server/src/generated/prisma/enums.ts:209–215`,
  `packages/shared/src/reports.ts:1`
  (`Report.status ReportStatus`, DB-enforced via `Report.status`);
- `ReportRevisionStatus` — `draft | in_review | published | superseded`:
  `server/prisma/schema.prisma:1101–1106`,
  `server/src/generated/prisma/enums.ts:218–225`,
  `packages/shared/src/reports.ts:2–6`
  (`ReportRevision.status ReportRevisionStatus`, DB-enforced via
  `ReportRevision.status`);
- `ReportEvidenceType` — `aggregate | dashboard_view`:
  `server/prisma/schema.prisma:1108–1111`,
  `server/src/generated/prisma/enums.ts:228–233`,
  `packages/shared/src/reports.ts:7`
  (`ReportEvidence.evidenceType ReportEvidenceType`, DB-enforced via
  `ReportEvidence.evidenceType`);
- `ExportFormat` — `csv | pdf`:
  `server/prisma/schema.prisma:1113–1116`,
  `server/src/generated/prisma/enums.ts:236–241`,
  `packages/shared/src/reports.ts:8`
  (`ExportRequest.format ExportFormat`, DB-enforced via
  `ExportRequest.format`);
- `ExportStatus` — `queued | running | succeeded | failed | cancelled`:
  `server/prisma/schema.prisma:1118–1124`,
  `server/src/generated/prisma/enums.ts:244–252`,
  `packages/shared/src/reports.ts:9–14`
  (`ExportRequest.status ExportStatus`, DB-enforced via
  `ExportRequest.status`).

The gap, at `2beb834` (re-verify exact lines at execution):

```ts
// server/src/reports/reports.service.ts:925–953
function toReport(row: {
  // ...
  status: string; // ← open (ReportStatus)
  revisions: Array<Parameters<typeof toRevision>[0]>;
}): Report {
  return {
    // ...
    status: row.status as Report['status'], // ← cast (direct assignment after)
  };
}

// server/src/reports/reports.service.ts:955–1031
function toRevision(row: {
  // ...
  status: string; // ← open (ReportRevisionStatus)
  evidence: Array<{
    // ...
    evidenceType: string; // ← open (ReportEvidenceType)
  }>;
}) {
  return {
    // ...
    status: row.status as Report['latestRevision'] extends infer R ? ... : never, // ← conditional cast
    evidence: row.evidence.map((evidence) => ({
      evidenceType: evidence.evidenceType as 'aggregate' | 'dashboard_view', // ← cast
    })),
  };
}

// server/src/reports/reports.service.ts:1033–1055
function toExport(row: {
  // ...
  format: string; // ← open (ExportFormat)
  status: string; // ← open (ExportStatus)
}): ExportRequest {
  return {
    // ...
    format: row.format as ExportRequest['format'], // ← cast
    status: row.status as ExportRequest['status'], // ← cast
  };
}
```

against the sibling carriers that already state the precise unions. The
repository layer (`ReportsRepository.listReports` / `findReport` /
`findRevision` / `listExports` / `findExport` via `Prisma.TransactionClient`,
plus direct `tx.reportRevision.findFirst` in `getRevisionEvidence`) returns
Prisma rows whose `status`, `format`, and `evidenceType` already carry the
generated enum types, so the open `string` parameters discard precision the
database guarantees and let any future read-path construction with an invented
report status, revision status, evidence type, export format, or export status
string compile (today only silenced by the five `as` casts at the return
sites).

This is the direct Phase 10 analogue of prompts 115–117 and 120 (which narrowed
`toObservation()` severity/state, `toMetric()` / `toAggregate()` value-type /
aggregation / status, `toView()` status, and the four ingestion `toX()`
mappers with inline unions and no runtime change). Shared
`packages/shared/src/reports.ts` is already closed (`:1–14`) and stays
untouched here — the server-first side only, the same split prompts 115–117
kept before prompt 119 and prompt 120 kept before prompt 121 (which then
needed no server change because prompt 120 had already closed the producer).

Inline unions over an imported Prisma enum or a shared alias is a judgement,
stated as one: prompts 115–116 and 120 mirrored the sibling carriers inline in
the service rather than importing the generated client, and the reports service
imports only shared DTO types plus `Prisma.TransactionClient` (via
`ReportsTx`) today. Mirroring the identical inline shapes is the smaller delta,
matches the prompts 86–121 minimal-diff precedent, avoids coupling the service
to the generated-enum import graph, and keeps the mapper signatures
self-describing. A generated-enum import or a shared-alias parameter touching
`reports.ts`, the repository, and all consumers is deferred as wider than the
gap. Removing the now-redundant `as` casts (direct assignment, since the
narrowed parameter is already assignable to the closed shared field) follows
the prompt 117 precedent, which removed the `as 'active' | 'archived'` cast
for exactly this reason.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 10 reports/exports outcome and exact phase
  skill manifest (§11); Phase 8/9 narrowing precedent (§§9–10); §§16–22
  confirming no unbuilt ordered phase.
- `docs/reports.md` — full file: report/revision/evidence/export schema,
  prompt 69 dashboard-evidence `schemaVersion` paragraph, REST routes, worker
  and artifacts, client UI, SSE progress, and the residual-gaps section this
  prompt narrows (not closes — simple PDF presentation, sharing/
  collaboration/public links/scheduled exports/retention windows stay future).
- `docs/analytics.md` — the prompt 115/116 read-side narrowing paragraphs
  this prompt mirrors for the reports read path; read-only context.
- `docs/dashboards.md` — the prompt 117 `toView()` status paragraph
  (cast-removal precedent) and the prompt 119 shared-narrowing paragraph;
  read-only context.
- `docs/ingestion.md` — the prompt 120 mapper-narrowing and prompt 121
  shared-narrowing paragraphs; the server-first / shared-already-closed split
  precedent this prompt follows (here the shared side needs no change at
  all).
- `docs/backend.md` — current Nest modular-monolith/server conventions and
  root build/test command ownership; no module, provider, route, or database
  surface changes in this prompt.
- `docs/security.md` — TM boundaries. This work tightens private read-mapper
  parameter contracts; it does not add or move a trust boundary, persist new
  data, or change an envelope.
- `server/prisma/schema.prisma` — `enum ReportStatus` (`:1095–1099`), `enum
ReportRevisionStatus` (`:1101–1106`), `enum ReportEvidenceType`
  (`:1108–1111`), `enum ExportFormat` (`:1113–1116`), `enum ExportStatus`
  (`:1118–1124`), plus the column bindings (`Report.status`,
  `ReportRevision.status`, `ReportEvidence.evidenceType`,
  `ExportRequest.format`, `ExportRequest.status` — resolve the exact column
  lines at execution). Read-only; no migration.
- `server/src/generated/prisma/enums.ts` — `ReportStatus` (`:209–215`),
  `ReportRevisionStatus` (`:218–225`), `ReportEvidenceType` (`:228–233`),
  `ExportFormat` (`:236–241`), `ExportStatus` (`:244–252`). Read-only;
  regenerated, never hand-edited.
- `packages/shared/src/reports.ts` — `ReportStatus` (`:1`),
  `ReportRevisionStatus` (`:2–6`), `ReportEvidenceType` (`:7`),
  `ExportFormat` (`:8`), `ExportStatus` (`:9–14`), `Report.status` (`:94`),
  `ReportRevision.status` (`:75`), `ReportEvidence.evidenceType` (`:60`),
  `ExportRequest.format` (`:145`), `ExportRequest.status` (`:146`).
  Read-only witnesses that the shared consumer is already closed; unchanged.
- `server/src/reports/reports.service.ts` — `toReport` (`:925–953`, one open
  field plus one `as` cast), `toRevision` (`:955–1031`, two open fields plus
  two casts including the conditional status cast), `toExport`
  (`:1033–1079`, two open fields plus two casts, `failureCode` /
  `failureMessage` pass-through, `renderingVersion` open). Re-read at
  execution and resolve current line numbers rather than editing from this
  snapshot.
- `server/src/reports/reports.repository.ts` — `ReportsTx =
Prisma.TransactionClient` (`:6`), `listReports` / `findReport` /
  `findRevision` / `listExports` / `findExport` (`:60–81`), `revisionInclude`
  (`:84–89`), `latestRevisionInclude` (`:91–103`, `status: 'published' as
const` query filter witness). Read-only; unchanged — proves call sites pass
  Prisma enum-typed rows.
- `server/src/reports/reports.service.spec.ts` — report/revision/export
  fixtures (`status: 'draft'` / `'published'` / `'in_review'` /
  `'superseded'` / `'queued'` / `'succeeded'`, `format: 'csv'`,
  `evidenceType: 'aggregate'` / `'dashboard_view'`). Re-read at execution;
  all literals are members of the 3 + 4 + 2 + 2 + 5 vocabularies (witnesses,
  not edited — see §Non-goals). The `status: 'active'` sites (`:210`,
  `:1302`) are `DashboardView` rows (`sampleDashboardViewRow`,
  `dashboardView.findFirst where status active`), a different domain —
  read-only, must not be touched.
- `server/src/reports/reports.controller.ts` — `reportEvidenceSchema`
  `evidenceType: stringSchema()` (`:48`), `reportRevisionSchema.status`
  (`:70`), `reportSchema.status` (`:88`), `exportSchema.format` / `.status`
  (`:100–101`): OpenAPI response `objectSchema` shapes. Read-only witnesses;
  unchanged (response snapshot stays `{ type: 'string' }` by design — see
  §Measurements item 6).
- `server/src/graphql/graphql.types.ts` — no report/export summary GraphQL
  types (verify at execution: zero `Report` / `ExportRequest` / `Revision` /
  `Evidence` hits expected; the file carries the dashboard read model only).
  Read-only witness; unchanged.
- `prompts/115-observation-read-quality-severity-state-narrowing.md` —
  the severity/state precedent (inline-union judgement, `code` / `message`
  deliberately left open, no negative-type-test pattern).
- `prompts/116-metric-aggregate-read-enum-narrowing.md` — the multi-field
  read-mapper precedent (`calculationVersion` / units / ids deliberately left
  open, contracts guard) this prompt mirrors for the reports service.
- `prompts/117-dashboard-view-status-narrowing.md` — the cast-removal
  precedent (`as 'active' | 'archived'` removed because Prisma rows already
  carry the enum type) this prompt follows for all five casts.
- `prompts/120-ingestion-read-enum-narrowing.md` — the closest lineage prompt
  (five-field read-mapper narrowing across four helpers, shared/query-input/
  test-mock openness policy, contracts guard) this prompt mirrors for the
  reports service.
- `prompts/121-shared-ingestion-contract-narrowing.md` — the shared-second
  half of the split; here there is no shared half because
  `packages/shared/src/reports.ts:1–14` is already closed.

No visual reference is applicable. This is an internal server read-mapper
parameter change, so the design-system PDF, landing-page PNGs, and recorded
chrome flows provide no evidence and must not be opened or cited as if they
did.

## Measurements and verified invariants

These are code-derived constraints at `2beb834`; re-verify them before editing:

1. Exactly five open read-mapper fields across three helpers:
   `toReport` `status: string` (`:930`) with `as Report['status']` (`:944`),
   `toRevision` `status: string` (`:959`) with the conditional `as` cast
   (`:995–999`) and nested `evidenceType: string` (`:980`) with
   `as 'aggregate' | 'dashboard_view'` (`:1020`), `toExport`
   `format: string` (`:1037`) with `as ExportRequest['format']` (`:1060`)
   and `status: string` (`:1038`) with `as ExportRequest['status']`
   (`:1061`). Re-run the grep over
   `server/src/reports/reports.service.ts` at execution
   (`status: string|format: string|evidenceType: string`) and confirm no
   sixth site appeared inside the three helpers (plus the `toReport`
   `revisions: Array<Parameters<typeof toRevision>[0]>` linkage, which
   tightens automatically with `toRevision`). `version`,
   `revisionNumber`, `renderingVersion`, every `id`, every timestamp,
   `failureCode` / `failureMessage`, `snapshot`, `sections`, `position`,
   and `byteCount` are different carriers, explicitly out of scope.
2. The closed vocabularies are exactly three report statuses, four revision
   statuses, two evidence types, two export formats, and five export
   statuses, byte-for-byte identical across `schema.prisma:1095–1124`,
   `enums.ts:209–252`, and `packages/shared/src/reports.ts:1–14`. If the
   authorities disagree at execution, stop and report it rather than picking
   a winner silently.
3. The repository rows already carry the enum types: `ReportsRepository`
   methods return `Prisma.TransactionClient` rows (`tx.report`,
   `tx.reportRevision`, `tx.exportRequest`), and `getRevisionEvidence` calls
   `tx.reportRevision.findFirst` directly. Re-verify at execution that each
   `toReport` / `toRevision` / `toExport` call site (`:77,93,116,167,203,
254,340,408,450,501,528,586` — resolve current lines, do not edit from
   this snapshot) passes a Prisma row field (not a hand-built string); if any
   call site constructs the value from query input or a literal, record it —
   the fix list must be extended by separate decision, not silently.
4. All committed reports fixtures use enum members. Re-grep `status: '` /
   `format: '` / `evidenceType: '` literals in
   `reports.service.spec.ts` at execution; if any report/revision/export
   value falls outside the 3 + 4 + 2 + 2 + 5 literals, stop and report it
   rather than widening scope or rewriting test semantics. The
   `status: 'active'` sites (`:210` `sampleDashboardViewRow`, `:1302`
   `dashboardView.findFirst where`) are `DashboardViewStatus` members in the
   dashboard domain and must keep compiling untouched; touching them is a
   scope violation.
5. Shared `packages/shared/src/reports.ts:1–14` is already closed and is
   consumed as the return types (`Report`, `ReportRevision` via
   `latestRevision`, `ExportRequest`). No shared edit is needed or permitted:
   narrowing the server parameters to the same unions makes the five `as`
   casts redundant (direct assignment compiles), which is the whole change.
   If typecheck demands a shared edit, restore and report rather than
   expanding scope.
6. Controller OpenAPI response schemas (`reports.controller.ts:48,70,88,
100–101`) stay `stringSchema()` (i.e. `{ type: 'string' }` in the
   snapshot) by design, and GraphQL exposes no report/export summary type
   (verify zero hits at execution). `contracts:check` must still report no
   artifact change; if a snapshot moves, stop — a server-mapper narrowing
   with already-member runtime values must not alter a public contract
   snapshot.
7. No runtime value moves: every mapper returns the identical object it
   returns today (same values, same key order). A server test that changes
   outcome (not just compilation) after this edit disproves the premise —
   stop and report it.
8. There is no established negative-type-test pattern in this repository
   (verified through prompt 121: zero `ts-expect-error` / `expectTypeOf`
   uses in `server/src`, `client/`, `packages/shared/src`). Do not invent
   one; the gates are `npm run typecheck` (which must reject a future
   non-member construction at the mapper boundary) plus unchanged runtime
   suites.

The required shapes mirror the sibling carriers exactly:

```ts
// server/src/reports/reports.service.ts
function toReport(row: {
  // ... unchanged fields
  status: "draft" | "published" | "archived";
  revisions: Array<Parameters<typeof toRevision>[0]>;
}): Report {
  return {
    // ...
    status: row.status, // ← direct (cast removed)
  };
}

function toRevision(row: {
  // ... unchanged fields
  status: "draft" | "in_review" | "published" | "superseded";
  evidence: Array<{
    // ... unchanged fields
    evidenceType: "aggregate" | "dashboard_view";
  }>;
}) {
  return {
    // ...
    status: row.status, // ← direct (conditional cast removed)
    evidence: row.evidence.map((evidence) => ({
      evidenceType: evidence.evidenceType, // ← direct (cast removed)
    })),
  };
}

function toExport(row: {
  // ... unchanged fields
  format: "csv" | "pdf";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
}): ExportRequest {
  return {
    // ...
    format: row.format, // ← direct (cast removed)
    status: row.status, // ← direct (cast removed)
  };
}
```

Do not introduce a shared alias, a Prisma-enum import, a validator, a
per-value branch, a coercion change, or a new literal.

## Expected impact

- Routes changed: none.
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none (response
  bodies already carry member literals; runtime server values are already
  members; OpenAPI response schemas stay `{ type: 'string' }`; GraphQL
  exposes no report/export summary type; type-only param narrowing plus
  cast removal cannot alter a snapshot).
- Database schema, Prisma models, migrations, RLS, queries, indexes,
  queues, and persisted-data formats changed: none.
- Runtime server behavior: unchanged — every report/revision/export accepted
  today maps to the identical response object with identical key order.
- Compile-time contract: the three private mappers no longer admit an
  invented report status, revision status, evidence type, export format, or
  export status string at any construction site. Any future read-path
  construction inventing a fourth report status (or a sixth export status)
  fails typecheck at the mapper boundary instead of compiling through a
  cast.
- Logging/observability: unchanged; no report/export state is logged beyond
  existing paths.
- Threat model: no new boundary and no risk reclassification. The change
  adds a concrete read-mapper type-contract detail under the existing Phase
  10 governed-reports behavior.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and
   every skill named in `## SKILLS USED`. Confirm `git status --short`
   before editing; preserve any unrelated user changes and stop if they
   overlap an approved path. Confirm `HEAD` is `2beb834` (or record the
   actual SHA and adjust `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–5 at execution: re-run the mapper-open
   grep over `server/src/reports/reports.service.ts`, diff the five
   vocabulary authorities (schema enums vs generated enums vs shared
   `reports.ts:1–14`), confirm each `toReport` / `toRevision` / `toExport`
   call site passes a Prisma row field, re-grep fixture literals in
   `reports.service.spec.ts` (confirming the `status: 'active'` sites are
   dashboard-domain only), and confirm the shared file is already closed. If
   a vocabulary disagreement, a sixth open site, a non-Prisma call site, or
   a non-member report/export fixture appears, stop and report it rather
   than silently widening scope.
3. In `server/src/reports/reports.service.ts`, change only the five
   parameter types to the inline unions in §Measurements and remove the five
   now-redundant `as` casts (one in `toReport`, two in `toRevision`
   including the conditional status cast, two in `toExport`) in favour of
   direct assignment. Leave every return-statement value, every
   `toISOString()` call, `version` / `revisionNumber` / `renderingVersion`,
   `failureCode` / `failureMessage` pass-through, `snapshot` / `sections` /
   `position` / `byteCount`, and every public method signature byte-for-byte
   unchanged in behavior. Do not add an import, alias, cast, or validator.
4. Make no other production edit: no shared DTO, controller response schema,
   DTO, resolver, GraphQL type, Prisma schema, migration, seed, spec,
   repository, worker, export renderer, AI draft surface, or client change.
   If typecheck demands more than the five param annotations plus the five
   cast removals, restore and report rather than expanding scope.
5. Run the focused reports regression suite. If any valid report / revision
   / export maps to a different response shape, value, or key order, stop
   and report the exact fixture: a type-only mapper change must not alter
   runtime output.
6. Run `npm run contracts:check` and verify no generated REST/OpenAPI/
   GraphQL artifact changes. This mapper narrowing must not alter a public
   contract snapshot (OpenAPI stays `{ type: 'string' }`; GraphQL exposes no
   report/export type by design).
7. Update `docs/reports.md` in the schema section (or the verification
   section if that is where the mapper contract lives at execution). Record
   that `toReport()` `status`, `toRevision()` `status` / `evidenceType`,
   and `toExport()` `format` / `status` are typed as the closed Prisma-enum
   unions (with the five `as` casts removed as redundant), matching schema
   enums, generated enums, and the already-closed shared `reports.ts`;
   that `renderingVersion`, `failureCode` / `failureMessage`,
   controller response schemas, and all shared carriers are deliberately
   unchanged; and that no runtime mapping, rejection, or response shape
   changed.
8. Inspect the complete diff, run every check below, and quote real exit
   status plus meaningful test/build totals. Fix issues before review.
9. Run the mandatory two-stage review loop:
   - dispatch a read-only reviewer subagent with `requesting-code-review`,
     this prompt path, `BASE_SHA=2beb834` (or the recorded actual HEAD),
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
    - `prompts/122-reports-read-enum-narrowing.md`;
    - `docs/reports.md`;
    - `server/src/reports/reports.service.ts`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend,
      or push. Use a terse Conventional Commit subject and include a short
      body explaining the read-mapper reason, because it is not obvious
      from the subject alone.

## Non-goals

- No change to `packages/shared/src/reports.ts` (`ReportStatus`,
  `ReportRevisionStatus`, `ReportEvidenceType`, `ExportFormat`,
  `ExportStatus`, `Report`, `ReportRevision`, `ExportRequest`): already
  closed; this prompt only makes the server producer admit exactly what the
  shared consumer already requires.
- No change to `renderingVersion` pass-through or `failure.code` /
  `failure.message` carriers: read carriers stay open like analytics `code`
  / `message` per prompt 115; prompts 80–82 own the failure _write_ unions
  and are not revisited here.
- No change to `server/src/reports/reports.controller.ts` OpenAPI response
  schemas (`stringSchema()` stays `{ type: 'string' }` in the snapshot):
  response-shape documentation, not a response vocabulary; a GraphQL/OpenAPI
  enum migration is a separate public-contract decision with snapshot
  consequences.
- No change to `server/src/reports/reports.repository.ts`,
  `revisionInclude`, `latestRevisionInclude`, or any Prisma query: witnesses
  only; no query semantics change.
- No change to `reports.service.spec.ts` fixtures or any spec literal:
  witnesses only; the dashboard-domain `status: 'active'` sites are not
  report/export vocabulary. No test semantics change.
- No change to `server/src/graphql/graphql.types.ts` or any SDL/OpenAPI
  snapshot: GraphQL exposes no report/export summary type by design.
- No change to the export worker renderer, CSV formula-escaping policy, PDF
  deterministic renderer, outbox payload, retention purge (prompts 70/79),
  download expiry enforcement (prompt 71), dashboard-evidence `schemaVersion`
  freeze (prompt 69), or AI draft surface (Phase 11A): separate decisions
  owned elsewhere.
- No change to any upload-domain carrier (`uploads.service.ts:345`,
  `uploads.controller.ts:37,153`, shared `uploads.ts`): a different domain
  with its own pending-vs-pending_upload alias mismatch and free-form
  `progressStage` column; a separate upload-read decision owns any change
  there.
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
read-mapper parameter types plus five cast removals: invented report-status
/ revision-status / evidence-type / export-format / export-status strings no
longer construct the three summaries at compile time. Runtime acceptance,
mapped output, key order, enum-column contents, OpenAPI snapshots, and every
error path are observably identical before and after.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this server read-mapper type change. No
responsive, touch-target, or reduced-motion surface moves.

## Checks to run, and the owning doc

```bash
# Focused reports regression (must pass; server runtime unchanged)
npm --workspace=@acres/server test -- reports.service.spec.ts

# Public contracts must remain unchanged (OpenAPI stays string; GraphQL exposes no report type)
npm run contracts:check

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/122-reports-read-enum-narrowing.md \
  docs/reports.md \
  server/src/reports/reports.service.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/122-reports-read-enum-narrowing.md \
  docs/reports.md \
  server/src/reports/reports.service.ts
```

Quote the actual exit status and meaningful Jest/build totals. If a named
spec does not exist at execution time, locate the closest current
equivalent with `rg --files server/src/reports`, run it, and record that
evidence instead of claiming a nonexistent check. Browser E2E, real
PostgreSQL, spatial plan, and operations-drill suites are intentionally
omitted because this scope adds no rejection path, changes no schema/query
behavior, and touches no browser journey or deployment surface.

`docs/reports.md` owns the implementation record. `docs/security.md`
and `docs/backend.md` are read-only verification for this task; update
either only if execution proves a statement materially stale, and stop
before broadening scope.

## Rollback and stop conditions

Rollback is a source/doc revert; there is no migration or
persisted-data rollback. Stop before expanding scope if any of these occur:

- the mapper-open grep shows other than the five `toReport` / `toRevision`
  / `toExport` sites at execution time;
- the vocabulary authorities disagree on the 3 + 4 + 2 + 2 + 5 literals
  (schema vs generated enums vs shared `reports.ts:1–14`), or a
  report/export fixture contains a value outside them;
- any `toReport` / `toRevision` / `toExport` call site passes a
  non-Prisma-constructed string (query input or hand-built literal);
- the shared `reports.ts:1–14` aliases are no longer closed at execution
  time — record it and prepare a separate shared-contract prompt rather
  than absorbing it here;
- the `status: 'active'` sites to exclude are not exactly the
  dashboard-domain mocks (`sampleDashboardViewRow`, `dashboardView.findFirst
where`) — if a report/export fixture uses `'active'`, stop: the premise
  is broken;
- an existing server test changes outcome (not just compilation) after
  the edit;
- a public contract snapshot changes;
- the fix requires a new literal, validator, cast, alias, import (any),
  error code/message, schema change, repository rewrite, GraphQL change,
  seed rewrite, spec rewrite, or client change.

Report the contradictory evidence and prepare a separate prompt rather
than silently changing the premise.

## Completion criteria

- `toReport()` `status` accepts only `draft | published | archived`
  at compile time, with the `as Report['status']` cast removed.
- `toRevision()` `status` accepts only
  `draft | in_review | published | superseded` at compile time, with the
  conditional `as` cast removed.
- `toRevision()` nested `evidenceType` accepts only
  `aggregate | dashboard_view` at compile time, with the `as` cast removed.
- `toExport()` `format` accepts only `csv | pdf` and `status` accepts only
  the five `ExportStatus` literals at compile time, with both `as` casts
  removed.
- Every other mapper field, repository call, schema, seed, spec,
  controller response schema, shared DTO, and client surface is byte-for-byte
  equivalent in behavior.
- Current reports service tests pass with identical server outcomes.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all
  verified blocking/important findings are fixed and re-tested.
- `docs/reports.md` records the mapper narrowing invariant, the cast
  removals, the deliberate response-schema/failure-carrier openness, and
  the no-runtime-change proof.
- Only the approved paths are committed locally to `main`; nothing is
  pushed.

## SKILLS USED

- `architecture-patterns` — preserve the existing service / repository
  boundaries and avoid introducing shared aliases or cross-module coupling.
- `nestjs-best-practices` — keep the change outside Nest provider/module
  wiring; mappers are private pure functions and are read-only except for
  param annotations and cast removals.
- `postgres-best-practices` — verify against the `ReportStatus` /
  `ReportRevisionStatus` / `ReportEvidenceType` / `ExportFormat` /
  `ExportStatus` enum-versus-column contracts; no schema, migration,
  transaction, RLS, or persistence change.
- `sql-optimization-patterns` — verify no query, index, or query-plan work
  is introduced by this in-memory type change.
- `security-best-practices` — guard duty only: no trust-boundary or
  persistence change; read-only verification against `docs/security.md`.
- `security-threat-model` — guard duty only: no boundary moves; verify no
  risk reclassification.
- `error-handling-patterns` — keep the deterministic mappers and existing
  not-found error paths; no new failure literal is introduced.
- `javascript-testing-patterns` — rely on the existing reports service Jest
  suite as unchanged-outcome regression proof; no test semantics changed.
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
contract change); `playwright` (no report UI or browser journey);
frontend/Tailwind/shadcn/GSAP skills (no UI or motion).
