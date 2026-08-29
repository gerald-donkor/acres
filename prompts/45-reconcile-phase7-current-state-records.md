# 45 - Reconcile Phase 7 current-state records

## Scope and why it is next

`54915f1` is the committed `main` tip. It implemented the final currently
dependency-safe Phase 7A hardening increment: a private PostGIS geometry
repository, forward-only geometry identity constraint, and an opt-in guarded
GiST plan harness. The authoritative implementation record
[`docs/ingestion.md`](../docs/ingestion.md) and current code correctly describe
that state, but Phase 7A snapshots in `docs/system-architecture.md` and
`docs/security.md` still say parser resource controls, PostGIS insertion
helpers, invalid-geometry handling, and spatial plan proof are deferred.

This is the next bounded, dependency-safe unit because those stale statements
would make a later `i` resolution identify committed work as unbuilt. This
documentation-only correction records verified code and evidence already
committed. It must not select a geography provider, choose a licence, run an
import, or claim database evidence that was not actually produced.

Afterward, the remaining Phase 7 geography work is blocked on the open
product decision in `docs/product.md`: a named provider, approved licence and
redistribution rights, source precedence, and refresh cadence. That requires
user/business authority and is not an implementation-agent default.

## Reference material read while preparing this prompt

- `AGENTS.md` §§2, 2.1, phase-control commands, §§5–10: prompt-first workflow,
  next-unit selection, documentation ownership, verification, review, and
  local-commit requirements.
- `docs/build-plan.md` §§1, 8, 14: Phase 7 provider-approval gate and required
  parser/geometry boundaries.
- `docs/product.md` §§4, 5, 7: public reference-geography classification and
  the open provider, licence, precedence, and cadence decisions.
- `docs/ingestion.md`: “Parser behavior”, “Child-process parser isolation”,
  “PostGIS geometry write and spatial read boundary”, and “Residual gaps”;
  this is the implementation-state authority.
- `docs/security.md` §12 and TM-07/TM-17; `docs/system-architecture.md`
  §§13–14; and `docs/backend.md` §18: the stale summaries and existing
  environment-evidence wording to reconcile.
- Commit `54915f1`, `server/src/geography/`,
  `server/src/ingestion/parsers/`, `server/src/ingestion/ingestion.module.ts`,
  and `server/prisma/migrations/20260829200000_region_geometry_unique_key/`:
  repository proof of parser isolation, XLSX classification, geometry
  validation/repository, unique identity, tests, and plan harness.

No visual route, component, comp, breakpoint, or motion surface applies.

## SKILLS USED

- `architecture-patterns` — preserve the documented boundary between
  framework-free validation, the private geography adapter, and no public GIS
  transport.
- `security-threat-model` — reconcile TM-07/TM-17 evidence and residual-risk
  wording without inflating mitigations or changing threat-model scope.
- `requesting-code-review` — dispatch the mandatory reviewer after evidence
  and diff self-checks.
- `receiving-code-review` — evaluate reviewer claims against code, commits, and
  canonical records before accepting a documentation correction.
- `caveman-commit` — form the required concise Conventional Commit message.

## Required implementation

### 1. Reconcile the Phase 6/7 current-state narrative

1. Update only stale implementation-status text in
   `docs/system-architecture.md` §§13–14. Keep its current/target/deferred
   distinction and refer readers to `docs/ingestion.md` for detailed behavior.
2. Replace the claim that CSV/XLSX/GeoJSON parsing, parser resource budgets,
   and dataset publication are deferred. State that bounded parsing and durable
   immutable publication are current; XLSX encrypted/macro/container
   classification and child-process fault containment are current; OS/container
   sandboxing and real dependency restart/orphan/dead-letter proof remain
   deferred.
3. Replace the claim that real PostGIS insertion helpers and query plans are
   deferred. State precisely that the private global-geography
   `PostgisRegionGeometryRepository` validates bounded 2D GeoJSON, binds values
   in tagged Prisma SQL, validates SRID/type/non-empty/topological validity in
   PostGIS, owns `(regionId, sourceId)` identity, and has an opt-in test-DB
   GiST-plan harness. Do not call it public, tenant-scoped, provider-importing,
   or completed live-environment proof.
4. Remove dashboard/report analytics from that residual list because their
   canonical records (`docs/analytics.md`, `docs/dashboards.md`,
   `docs/reports.md`) are current. Do not expand their scope or alter residuals.
5. Preserve actual residuals: named licensed provider/importer and governance;
   browser mapping UI; OS-level parser sandboxing; migration apply-from-zero;
   real Garage/Valkey/ClamAV/restart/orphan/dead-letter/plan execution on a
   dependency-capable environment. A harness is not measured plan evidence
   until it has run.

### 2. Reconcile security evidence without changing posture

1. In `docs/security.md` §12, change the date only if needed to identify the
   Prompt 44 state accurately; do not revise unrelated phase records.
2. Retain parser and tenancy controls, then add concise factual evidence for
   child-process containment and the private geometry boundary. Clearly
   distinguish bounded containment from an OS sandbox, pre-SQL/PostGIS geometry
   safety from provider trust, and deterministic coverage from live database or
   plan proof when the command output is absent.
3. Remove the stale residual assertion that GeoJSON has no application PostGIS
   helper or invalid-geometry fixtures. Replace it with provider provenance and
   licence approval, OS/container sandboxing, migration-from-zero and real
   dependency proof, plus any existing environmental limitation.
4. Do not alter TM IDs, likelihood/impact scores, Phase 12 launch blockers,
   no-AI posture, or unrelated controls. If TM-07/TM-17 conflict with §12,
   make only the smallest exact alignment supported by code and ingestion docs.

### 3. Preserve evidence discipline and ownership

1. Treat `docs/ingestion.md` as the detailed Phase 7A authority; do not
   duplicate its long contract, rewrite command outputs, or fabricate live
   PostGIS `EXPLAIN` evidence.
2. Change `docs/backend.md` only if a search confirms a Prompt 44
   contradiction. If changed, distinguish the implemented repository/harness
   from outstanding dependency-capable execution proof.
3. Do not modify `AGENTS.md`, `docs/build-plan.md`, `docs/product.md`, source,
   schema/migrations, packages/lockfiles, API contracts, tests, workflow, or
   launch-readiness inputs. All touched records already have AGENTS index rows.

## Explicit non-goals

- No provider comparison/download, licence conclusion, source selection,
  importer CLI, seed data, refresh schedule, or source-precedence rule; these
  need the open `docs/product.md` decision.
- No runtime, schema, migration, raw SQL, PostGIS, parser, worker, queue,
  storage, API, client, browser, analytics, report, export, AI, CI, deployment,
  or launch-gate change.
- No unguarded migration, plan harness, real-service test, or production command
  merely to strengthen documentation. Evidence is recorded only when produced.

## Verification and handoff

First establish claims against code and the committed tip:

```bash
git status --short
git log -1 --oneline
git show --check --format=fuller 54915f1
rg -n "ChildProcessParserExecutor|xlsx-container-inspector|PostgisRegionGeometryRepository|findRegionsContainingPoint|RegionGeometry_regionId_sourceId_key" server/src
rg -n -C 2 "Still target/deferred|GeoJSON validity|PostGIS insertion|parser resource budgets|dashboard/report analytics" docs/system-architecture.md docs/security.md docs/backend.md
```

Then run the documentation-safe repository gates and inspect the full diff:

```bash
git diff --check
npm run lint
npm run typecheck
npm run build
npm run contracts:check
npm run ops:check
git diff --check
git status --short
git diff --cached --check
git diff --cached --stat
```

Quote real command output. If an environment/runtime failure blocks a gate,
quote it and complete every remaining documentation-safe check. Do not run DB
migrations or present a harness as live proof for this reconciliation.

Inspect every changed line for supported current-vs-target language. Invoke
`requesting-code-review` with actual `BASE_SHA`/`HEAD_SHA`, stale claims,
evidence, paths, and check output. Evaluate feedback through
`receiving-code-review`; correct only claims disproven by repository evidence,
retest, and re-review if security posture or architecture status changes.

Stage only approved documentation/prompt files, inspect the staged diff, and
commit locally to `main` with a `caveman-commit` Conventional Commit message.
Do not push.
