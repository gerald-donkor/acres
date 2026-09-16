# 125 — narrow `MetricsService.recordParserExecution()` `sourceKind` to the closed `SourceKind` union

## Scope, and why it is next

The committed repository is on `main` at `a985284`
(`refactor(sse): narrow terminal predicate types`, the prompt 124
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 124 — which closed the SSE terminal-predicate family
(`isIngestionTerminal()` admits `IngestionRunSummary['state']`,
`isExportTerminal()` admits `ExportRequest['status']`, unchanged bodies, no
runtime change).

There is no unbuilt ordered phase left. A repo-wide grep over `server/src`
this session (`recordParserExecution`) proves exactly four call sites exist
and exactly one open parameter remains on the metrics write path:

```ts
// server/src/metrics/metrics.service.ts:187–190 — OPEN param, CLOSED sibling
recordParserExecution(
  sourceKind: string, // ← open (SourceKind, three members)
  status: 'success' | 'validation_issue' | 'failed' | 'timeout', // ← already closed
  durationSeconds: number,
): void {
```

against the single authority the codebase already states for `sourceKind`:

- `SourceKind` — `csv | xlsx | geojson` (three members):
  `server/src/ingestion/parsers/parser.types.ts:20`
  (`ParsedSourceSummary.sourceKind: SourceKind` at `:121` consumes the same
  alias).

Every production call site already passes a `SourceKind`-typed value, and
every spec call site already passes a member literal:

- `server/src/ingestion/parsers/source-parser.service.ts:40–44` —
  `const sourceKind: SourceKind = isXlsx ? 'xlsx' : isGeoJson ? 'geojson' :
'csv'`, passed at `:63`
  (`this.metrics?.recordParserExecution(sourceKind, 'validation_issue', 0)`);
- `source-parser.service.ts:96–100` — `summary.sourceKind`
  (`ParsedSourceSummary.sourceKind: SourceKind`, `parser.types.ts:121`),
  passed with the already-closed `status` local (`:88–94`,
  `'timeout' | 'failed' | 'validation_issue' | 'success'`);
- `server/src/metrics/metrics.service.spec.ts:51–52` — `'csv'` / `'xlsx'`
  member literals (witnesses, not edited).

This is the direct continuation of prompts 115–124, which narrowed
`toObservation()` severity/state, `toMetric()` / `toAggregate()` value-type /
aggregation / status, `toView()` status, `valueOf()` value kind, the four
ingestion `toX()` mappers, the three reports `toX()` mappers, the upload
`toStatus()` / `terminal()` carriers, the shared ingestion/dashboard/upload
contracts, and the two SSE terminal predicates — each with unchanged bodies
and no runtime change. The metrics `status` parameter is already the closed
four-member union, so this prompt narrows only the one remaining open
parameter in the same method. No fifth `recordParserExecution` call site
exists (the grep lists all four), so this prompt closes the metrics
source-kind parameter rather than leaving a known remainder.

Typing the parameter as the imported `SourceKind` alias rather than a
duplicated inline `'csv' | 'xlsx' | 'geojson'` union is a judgement, stated
as one: it keeps the metrics label-mapping coupled to the single parser
vocabulary authority with zero duplicated literals — the same judgement
prompts 123/124 made with indexed access (`UploadStatus['state']`,
`IngestionRunSummary['state']`). Unlike those DTO-indexed cases there is no
DTO field to index here; the named `SourceKind` alias in `parser.types.ts`
is the authority, and a type-only `import type` is erased at compile time,
so it introduces no runtime module coupling between the metrics singleton
and the ingestion parser tree (per `arch-avoid-circular-deps`, value
imports would be a cycle risk; `import type` is not). A duplicated inline
union is deferred as wider than the gap in the opposite direction: it would
drift the day a fourth source kind appears, while the alias cannot.

Leaving the runtime `safeKind` guard
(`sourceKind === 'csv' || ... ? sourceKind : 'unknown'`,
`metrics.service.ts:192–195`) byte-for-byte unchanged is a judgement,
stated as one: after narrowing, the `'unknown'` branch is unreachable from
typed callers but remains defense-in-depth for untyped/foreign callers at
the metrics edge (Prometheus label values must stay bounded even if a
future caller bypasses the type). The same unchanged-body policy prompts
120–124 applied to mapper returns and predicate bodies applies here.

## Reference material read for it, by path

- `AGENTS.md` — §2 implementation workflow, the `i` phase-control protocol,
  §2.1 mandatory two-stage review, §3 ALWAYS ledger, §4 skill map, §5 prompt
  contract, §6 checks, and §10 evidence rules.
- `docs/build-plan.md` — Phase 7 parser/metrics outcome and exact phase
  skill manifest (§8); Phase 12 observability outcome and exact skill
  manifest (§13); §§16–22 confirming no unbuilt ordered phase.
- `docs/operations.md` — Prometheus Metrics (`/metrics`) section (`:41–60`,
  `acres_parser_executions_total` counter and
  `acres_parser_execution_duration_seconds` histogram by `source_kind` /
  `status`; cardinality/redaction invariant `:56–60`). The owning
  implementation record for this prompt.
- `docs/backend.md` — `/metrics` private/ops route row (`:220`, text
  exposition, envelope/rate-limit bypass). Read-only witness; unchanged.
- `docs/security.md` — TM boundaries. This work tightens one metrics-method
  parameter contract; it does not add or move a trust boundary, persist new
  data, or change an envelope.
- `docs/ingestion.md` — parser-adapter sections and the prompts 120/121
  narrowing paragraphs (inline-union precedent, `SourceKind` vocabulary
  context). Read-only context.
- `docs/analytics.md` — prompts 115/116 read-side narrowing paragraphs
  (no negative-type-test pattern). Read-only context.
- `server/src/metrics/metrics.service.ts` — `recordParserExecution`
  (`:187–201`, open `sourceKind`, closed `status`, unchanged `safeKind`
  guard, `source_kind` label emission). Re-read at execution and resolve
  current line numbers rather than editing from this snapshot. No
  `SourceKind` import today (`:1–15`: nest/common, prom-client,
  PrismaService, route-normalizer only).
- `server/src/ingestion/parsers/parser.types.ts` — `SourceKind` (`:20`,
  three members), `ParsedSourceSummary.sourceKind` (`:121`, closed
  consumer). Read-only authority; unchanged.
- `server/src/ingestion/parsers/source-parser.service.ts` — closed
  `sourceKind` construction (`:40–44`), `recordParserExecution(sourceKind,
...)` call (`:63`), `recordParserExecution(summary.sourceKind, status,
...)` call (`:96–100`) with the closed `status` local (`:88–94`).
  Read-only witnesses; unchanged.
- `server/src/ingestion/parsers/parse-source-buffer.ts` — `const
sourceKind: SourceKind` (`:23`). Read-only witness that the parser tree
  constructs only members; unchanged.
- `server/src/ingestion/parsers/child-process-parser.executor.ts` —
  `getExpectedSourceKind(mediaType): SourceKind` (`:255`),
  `createSafeErrorSummary(sourceKind: SourceKind, ...)` (`:271–274`).
  Read-only witnesses; unchanged.
- `server/src/metrics/metrics.service.spec.ts` — `'csv'` / `'xlsx'`
  literals (`:51–52`), `source_kind="csv"` / `"xlsx"` exposition assertions
  (`:55–60`). Re-read at execution; member literals (witnesses, not
  edited — see §Non-goals).
- `prompts/123-upload-read-state-narrowing.md` — the indexed-access
  judgement precedent (couple the consumer to the authority it already
  observes, zero duplicated literals) this prompt mirrors with a named
  alias instead of an indexed access.
- `prompts/124-sse-terminal-predicate-narrowing.md` — the closest lineage
  prompt (two open SSE predicates narrowed to closed DTO unions, one
  `import type` per file, unchanged bodies, contracts guard) this prompt
  mirrors for the one remaining open metrics parameter, minus the second
  file (the `status` sibling is already closed).

No visual reference is applicable. This is an internal server metrics-method
parameter change, so the design-system PDF, landing-page PNGs, and recorded
chrome flows provide no evidence and must not be opened or cited as if they
did.

## Measurements and verified invariants

These are code-derived constraints at `a985284`; re-verify them before editing:

1. Exactly one open metrics parameter plus one closed sibling: the
   `recordParserExecution` grep over `server/src` returns exactly the
   definition (`metrics.service.ts:187`) plus four call sites
   (`source-parser.service.ts:63,96`, `metrics.service.spec.ts:51,52`).
   Re-run the grep at execution; if a fifth call site appeared or `status`
   reopened, stop and report it rather than silently widening scope.
2. The closed vocabulary is exactly three source kinds, byte-for-byte
   `csv | xlsx | geojson` in `parser.types.ts:20`, consumed as
   `ParsedSourceSummary.sourceKind` (`:121`) and constructed as
   `SourceKind` in `source-parser.service.ts:40–44` and
   `parse-source-buffer.ts:23`. If the authorities disagree at execution,
   stop and report it rather than picking a winner silently.
3. Every call site passes a `SourceKind`-typed value or a member literal.
   At execution, re-verify that `:63` passes the `:40` `SourceKind` local,
   `:96` passes `summary.sourceKind` (`ParsedSourceSummary`), and the spec
   passes `'csv'` / `'xlsx'`; if any call site constructs the value from
   unvalidated input (media-type string, query input, hand-built literal
   outside the three members), record it — the fix list must be extended by
   separate decision, not silently.
4. `metrics.service.ts` imports no `SourceKind` today (verified this
   session: zero hits in the file). Re-grep at execution; the plan adds
   exactly one `import type` line. If the file already imports the type at
   execution, reuse it and record the smaller diff rather than adding a
   duplicate.
5. The `import type` must be type-only (`import type { SourceKind } from
'../ingestion/parsers/parser.types'`), never a value import: the metrics
   singleton must not gain a runtime edge to the ingestion parser tree.
   `parser.types.ts` itself imports only types from
   `child-process-parser.executor`, so the erased edge cannot become a
   runtime cycle; re-verify both files still import type-only at execution.
6. No runtime value moves: `recordParserExecution` emits the identical
   `source_kind` label for every input (same guard, same `'unknown'`
   fallback, same counter/histogram calls). A server test that changes
   outcome (not just compilation) after this edit disproves the premise —
   stop and report it.
7. The `/metrics` exposition is unchanged (label names `source_kind` /
   `status`, values `csv` / `xlsx` / `geojson` / `unknown`). No
   Prometheus, Grafana, or alert artifact changes; `contracts:check` must
   still report no REST/OpenAPI/GraphQL artifact change.
8. There is no established negative-type-test pattern in this repository
   (verified through prompt 124: zero `ts-expect-error` / `expectTypeOf`
   uses in `server/src`, `client/`, `packages/shared/src`). Do not invent
   one; the gates are `npm run typecheck` (which must reject a future
   non-member argument at the metrics boundary) plus unchanged runtime
   suites.

The required shape:

```ts
// server/src/metrics/metrics.service.ts (one new type-only import; no other import change)
import type { SourceKind } from '../ingestion/parsers/parser.types';
// ...
recordParserExecution(
  sourceKind: SourceKind, // ← narrowed (was string)
  status: 'success' | 'validation_issue' | 'failed' | 'timeout', // ← unchanged
  durationSeconds: number,
): void {
  const safeKind =
    sourceKind === 'csv' || sourceKind === 'xlsx' || sourceKind === 'geojson'
      ? sourceKind
      : 'unknown'; // ← unchanged guard (defense-in-depth, now unreachable from typed callers)
  // ... unchanged counter/histogram calls
}
```

Do not introduce a value import, a new exported alias, a validator, a
per-value branch, a coercion change, or a new literal. The guard body stays
byte-for-byte identical.

## Expected impact

- Routes changed: none (`GET /metrics` path, format, guards, and label
  names are untouched).
- Public REST, GraphQL, OpenAPI, and SDL contracts changed: none (no
  REST/GraphQL surface reads this parameter; `/metrics` text exposition
  keeps identical label names and values).
- Prometheus/Grafana/alert artifacts changed: none (same `source_kind`
  values reach the same counters/histograms).
- Database schema, Prisma models, migrations, RLS, queries, indexes,
  queues, and persisted-data formats changed: none.
- Runtime server behavior: unchanged — every parser execution maps to the
  identical counter increment and histogram observation with the identical
  `source_kind` label.
- Compile-time contract: `recordParserExecution` no longer admits an
  invented source-kind string at any call site. Any future construction
  inventing a fourth source kind fails typecheck at the metrics boundary
  instead of compiling through `string` (and would surface at the
  `safeKind` guard as `'unknown'` only if forced through untyped code).
- Logging/observability: unchanged; no source-kind value is logged beyond
  existing label emission.
- Threat model: no new boundary and no risk reclassification. The change
  adds one concrete metrics-method type-contract detail under the existing
  Phase 7 parser and Phase 12 observability behavior. The cardinality
  invariant (bounded `source_kind` label set) is preserved: the guard still
  collapses any foreign string to `'unknown'`.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, the owning docs and source files, and
   every skill named in `## SKILLS USED`. Confirm `git status --short`
   before editing; preserve any unrelated user changes and stop if they
   overlap an approved path. Confirm `HEAD` is `a985284` (or record the
   actual SHA and adjust `BASE_SHA` in the review step accordingly).
2. Re-verify §Measurements items 1–5 at execution: re-run the
   `recordParserExecution` grep over `server/src` / `client` /
   `packages/shared`, diff the `SourceKind` authority
   (`parser.types.ts:20`) against its consumers (`:121`,
   `source-parser.service.ts:40–44`, `parse-source-buffer.ts:23`),
   confirm each call site passes a `SourceKind`-typed value or member
   literal, and re-grep `metrics.service.ts` for existing `SourceKind`
   imports plus type-only import discipline in both files. If a fifth call
   site, a vocabulary disagreement, a non-member call site, a pre-existing
   import, or a value-import requirement appears, stop and report it rather
   than silently widening scope.
3. In `server/src/metrics/metrics.service.ts`, make only two edits: add
   `import type { SourceKind } from
'../ingestion/parsers/parser.types';` in the existing type-import group
   (or reuse the import if one appeared), and change the
   `recordParserExecution` first parameter to `SourceKind`. Leave the
   `safeKind` guard, the counter/histogram calls, the `status` union, and
   every other method byte-for-byte unchanged. Do not add any other
   import, alias, cast, or validator.
4. Make no other production edit: no parser type, service mapper, DTO,
   resolver, GraphQL type, Prisma schema, migration, seed, spec,
   repository, worker, scanner, storage port, outbox payload, retention
   job, AI draft surface, or client change. If typecheck demands more than
   the one import plus the one annotation, restore and report rather than
   expanding scope.
5. Run the focused metrics regression suite (server runtime unchanged;
   the method only maps labels). If any valid parser execution maps to a
   different label value or exposition line, stop and report the exact
   fixture: a type-only narrowing must not alter runtime output.
6. Run `npm run contracts:check` and verify no generated REST/OpenAPI/
   GraphQL artifact changes. This narrowing must not alter a public
   contract snapshot.
7. Update `docs/operations.md` in the Prometheus Metrics (`/metrics`)
   section (or the verification section if that is where the metrics
   contract lives at execution). Record that `recordParserExecution()`
   admits only `SourceKind` (`csv | xlsx | geojson`, new type-only import
   from `parser.types.ts`, erased at compile with no runtime module edge);
   that the `safeKind` → `'unknown'` guard deliberately stays as
   defense-in-depth for untyped callers and preserves the bounded-label
   cardinality invariant; and that no label value, exposition line, or
   counter/histogram behavior changed.
8. Inspect the complete diff, run every check below, and quote real exit
   status plus meaningful test/build totals. Fix issues before review.
9. Run the mandatory two-stage review loop:
   - dispatch a read-only reviewer subagent with `requesting-code-review`,
     this prompt path, `BASE_SHA=a985284` (or the recorded actual HEAD),
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
    - `prompts/125-metrics-parser-source-kind-narrowing.md`;
    - `docs/operations.md`;
    - `server/src/metrics/metrics.service.ts`.
      Do not stage unrelated changes. Do not pull, merge, rebase, amend,
      or push. Use a terse Conventional Commit subject and include a short
      body explaining the metrics source-kind reason, because it is not
      obvious from the subject alone.

## Non-goals

- No change to the `status` parameter (`'success' | 'validation_issue' |
'failed' | 'timeout'`): already closed; the grep witness must keep
  compiling untouched.
- No change to the `safeKind` guard body or the `'unknown'` fallback:
  defense-in-depth for untyped callers and the bounded-cardinality
  invariant; removing it would widen the label set risk, not narrow it.
- No change to `recordHttpRequest(method, rawPath, ...)`:
  free-form HTTP method/path carriers normalized by `normalizeRouteGroup`
  / `statusClass`; there is no closed vocabulary authority to mirror.
- No change to `recordJobRun(jobName, ...)` or
  `recordQueueJob(queueName, ...)` `jobName` / `queueName` carriers:
  free-form cron/queue names with no closed authority; only their
  `status` unions are closed (already closed, witnesses only).
- No change to `packages/shared`, any DTO, service mapper, controller
  response schema, DTO, resolver, GraphQL type, Prisma schema, migration,
  seed, spec, repository, worker transition, scanner verdict, storage
  port, outbox payload, retention purge, download expiry, SSE predicate,
  dashboard-evidence `schemaVersion`, or AI draft surface: separate
  decisions owned elsewhere.
- No change to `source-parser.service.ts`, `parse-source-buffer.ts`,
  `parser.types.ts`, `child-process-parser.executor.ts`, or
  `metrics.service.spec.ts` literals: witnesses only; the `'csv'` /
  `'xlsx'` / `'geojson'` values are already members. No test semantics
  change.
- No value import of `parser.types.ts` (type-only import only), no shared
  alias, no Prisma-enum import, no validator, no cast helper, no
  per-value branch, no coercion change, no literal addition.
- No schema migration, SQL, Prisma repository, RLS, index, tenant, worker
  queue, storage, upload flow, route, API contract, client component,
  design, accessibility, motion, or browser work.
- No new test cases and no invented negative-type-test pattern
  (`ts-expect-error` / `expectTypeOf` have zero uses in this repository);
  no general metrics refactor or unrelated cleanup.

## Reference deltas

No visual delta. The deliberate static delta is limited to one type-only
import plus one parameter annotation: invented source-kind strings no
longer reach the parser-execution metrics boundary at compile time.
Runtime label values, exposition lines, counter/histogram behavior,
OpenAPI snapshots, and every error path are observably identical before
and after.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser
verification is required for this server metrics type change. No
responsive, touch-target, or reduced-motion surface moves.

## Checks to run, and the owning doc

```bash
# Focused metrics regression (must pass; server runtime unchanged)
npm --workspace=@acres/server test -- metrics.service.spec.ts

# Public contracts must remain unchanged (no REST/OpenAPI/GraphQL surface reads this param)
npm run contracts:check

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/125-metrics-parser-source-kind-narrowing.md \
  docs/operations.md \
  server/src/metrics/metrics.service.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/125-metrics-parser-source-kind-narrowing.md \
  docs/operations.md \
  server/src/metrics/metrics.service.ts
```

Quote the actual exit status and meaningful Jest/build totals. If a named
spec does not exist at execution time, locate the closest current
equivalent with `rg --files server/src/metrics`, run it, and record that
evidence instead of claiming a nonexistent check. Browser E2E, real
PostgreSQL, spatial plan, and operations-drill suites are intentionally
omitted because this scope adds no rejection path, changes no schema/query
behavior, and touches no browser journey or deployment surface.

`docs/operations.md` owns the implementation record. `docs/backend.md`
(`/metrics` row) and `docs/security.md` are read-only verification for
this task; update either only if execution proves a statement materially
stale, and stop before broadening scope.

## Rollback and stop conditions

Rollback is a source/doc revert; there is no migration or
persisted-data rollback. Stop before expanding scope if any of these occur:

- the `recordParserExecution` grep shows other than the definition plus
  the four known call sites at execution time;
- the vocabulary authorities disagree on the three source kinds
  (`parser.types.ts:20` vs `ParsedSourceSummary.sourceKind` vs the two
  `SourceKind`-annotated constructions);
- any call site passes a non-member-constructed string (unvalidated
  media-type string, query input, or hand-built literal outside the three
  members);
- `metrics.service.ts` already imports `SourceKind` in a way that changes
  the planned diff — reuse it and record the smaller diff rather than
  absorbing unrelated import churn;
- a value import (not `import type`) is required for the annotation to
  compile — restore and prepare a separate prompt, because a runtime edge
  from metrics to the parser tree is a different architectural decision;
- an existing server test changes outcome (not just compilation) after
  the edit;
- a public contract snapshot changes;
- the fix requires a new literal, validator, cast, alias, import beyond
  the one type-only import, error code/message, schema change, repository
  rewrite, GraphQL change, seed rewrite, spec rewrite, or client change.

Report the contradictory evidence and prepare a separate prompt rather
than silently changing the premise.

## Completion criteria

- `recordParserExecution()` `sourceKind` accepts only `SourceKind`
  (`csv | xlsx | geojson`) at compile time, with an unchanged guard body.
- Exactly one type-only import added; no other import, alias, cast, or
  validator introduced, and no runtime module edge created.
- The `status` union, `safeKind` guard, counter/histogram calls, and all
  other methods are byte-for-byte equivalent in behavior.
- Current metrics service tests pass with identical label values and
  exposition lines.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status
  checks pass with real output recorded.
- The requesting/receiving two-stage review loop is complete and all
  verified blocking/important findings are fixed and re-tested.
- `docs/operations.md` records the source-kind narrowing invariant, the
  type-only-import judgement with its no-runtime-edge proof, the
  deliberate guard retention with the cardinality rationale, and the
  no-runtime-change proof.
- Only the approved paths are committed locally to `main`; nothing is
  pushed.

## SKILLS USED

- `architecture-patterns` — preserve the metrics-singleton / parser-tree
  boundary; couple the parameter only to the `SourceKind` authority via an
  erased `import type`, avoiding a runtime cross-module edge or duplicated
  literals.
- `nestjs-best-practices` — keep the change outside Nest provider/module
  wiring; `recordParserExecution` is a plain method on an `@Injectable()`
  singleton, read-only except for the param annotation plus type-only
  import.
- `postgres-best-practices` — verify `SourceKind` is a parser-tree union
  with no DB-enum counterpart; no schema, migration, transaction, RLS, or
  persistence change.
- `sql-optimization-patterns` — verify no query, index, or query-plan work
  is introduced by this in-memory type change.
- `api-design-principles` — guard duty only: no public route or envelope
  change; `contracts:check` proves the contract snapshots are unchanged.
- `security-best-practices` — guard duty only: no trust-boundary or
  persistence change; read-only verification against `docs/security.md`.
- `security-threat-model` — guard duty only: no boundary moves; verify no
  risk reclassification (bounded `source_kind` cardinality preserved).
- `error-handling-patterns` — keep the deterministic `safeKind` fallback
  and existing metric paths; no new failure literal is introduced.
- `javascript-testing-patterns` — rely on the existing metrics Jest suite
  as unchanged-outcome regression proof; no test semantics changed.
- `e2e-testing-patterns` — guard duty only: no cross-system journey
  changes; E2E intentionally omitted per §Checks.
- `secrets-management` — guard duty only: no credential or signed-URL
  surface is touched by this type change.
- `requesting-code-review` — dispatch the mandatory structured read-only
  review with precise scope, SHAs, changed paths, and check evidence.
- `receiving-code-review` — verify reviewer claims against repository
  reality before fixes or technical pushback.
- `caveman-commit` — produce the required terse Conventional Commit
  message with a short metrics source-kind rationale body.

Not loaded, with reason: `openapi-spec-generation` (contracts:check guard
duty only, no public contract change); `playwright` (no metrics UI or
browser journey); frontend/Tailwind/shadcn/GSAP skills (no UI or motion).
