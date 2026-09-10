# 69 - report evidence dashboard schema version

## Scope, and why it is next

The committed repository is on `main` at `3912ed3`
(`feat(dashboards): version saved-view shapes`). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22 in `docs/build-plan.md`, operator checklist
in `docs/launch-checklist.md`), plus the prompt-68 residual follow-up that gave
saved views an explicit `schemaVersion` with fail-closed reads
(`docs/dashboards.md` § Saved-view schema versioning). There is no unbuilt
ordered phase left, so this prompt scopes the smallest unblocked residual gap,
parent Phase 10, dependency-safe against the prompt-68 marker.

The gap: frozen `dashboard_view` report evidence drops the durable version
marker prompt 68 just added. `resolveDashboardViewEvidence` in
`server/src/reports/reports.service.ts` (lines ~783–801) freezes
`{ dashboardViewId, name, filters, presentation }` but never stamps
`schemaVersion`, even though live `DashboardView` rows now carry
`schemaVersion = 1` (`server/src/dashboards/dashboards.service.ts:22,84`,
`toView` at lines 194–218, `resolveSchemaVersion` at lines 228–243). A
published report's frozen evidence therefore cannot tell whether its snapshot
predates or postdates a future presentation-shape change — the exact
indistinguishability prompt 68 closed for live views, reopened for frozen
evidence. Reproducibility (`docs/reports.md`: "a permitted user publishes a
reproducible revision") requires the frozen snapshot to carry the same marker
the live row carries.

This prompt stamps the normalized version into new `dashboard_view` evidence
snapshots and documents the read rule for pre-marker snapshots, without
rewriting history, changing any presentation shape, or adding a migration.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 10 definition (§11), Phase 9 status
  ("implemented by `prompts/30-dashboards-optimized-graphql.md`"), and §§16–22
  confirming phases 12E–12K are committed; establishes there is no unbuilt
  ordered phase and this is a residual-gap follow-up, not a reorder.
- `docs/dashboards.md` (full file, 205 lines) — § Saved-view schema versioning
  (prompt 68): migration `20260909000000_dashboard_view_schema_version`,
  `CURRENT_DASHBOARD_VIEW_SCHEMA_VERSION = 1`, missing→1 / `>CURRENT` fail-closed
  with `INTERNAL_ERROR`, `listViews` propagation, `updateView` version gate,
  `archiveView` version-agnostic, REST/GraphQL additive field.
- `docs/reports.md` (full file, 156 lines) — § Schema and permissions
  (immutable published revisions, `reports.*`/`exports.*` permission map), § REST
  API (evidence routes), § Worker and artifacts (formula-safe CSV, deterministic
  PDF, `renderingVersion: "reports-v1"` on `ExportRequest`), § Residual gaps
  (sharing/collaboration/public links/scheduled exports/retention still future).
- `server/prisma/schema.prisma` (`model ReportRevision` ~lines 929–958,
  `model ReportEvidence` ~lines 980–1005, `model ExportRequest` ~lines
  1007–1035 with existing `renderingVersion String @default("reports-v1")`,
  `model ExportArtifact` ~lines 1037–1054) — evidence `snapshot` is schemaless
  `Json`; no DDL is needed for this change and none is authorized.
- `server/src/reports/reports.service.ts` — `resolveDashboardViewEvidence`
  (lines 783–801: `findFirst({ where: { id, organizationId, status: 'active' } })`,
  snapshot `{ dashboardViewId, name, filters, presentation }`, no version);
  `resolveAggregateEvidence` (lines 756–781, already freezes
  `calculationVersion` — the precedent this prompt mirrors for views);
  `renderCsv` (lines 1042–1068: dashboard rows render via
  `metric.label ?? snapshot.name`, so an additive snapshot field cannot alter
  export bytes); `renderPdf` (lines 1096–1138: evidence-free text body).
- `server/src/reports/reports.service.spec.ts` — `sampleDashboardViewRow`
  (lines 203–210: no `schemaVersion` key) and the dashboard-evidence freeze test
  (lines 1291–1320: exact `snapshot` object without a version) that this prompt
  updates.
- `server/src/dashboards/dashboards.service.ts` — exported
  `CURRENT_DASHBOARD_VIEW_SCHEMA_VERSION = 1` (line 22), `toView`
  (lines 194–218), `resolveSchemaVersion` (lines 228–243: missing→current,
  `>CURRENT`/non-integer/`<1` fail-closed). Reports must reuse this constant,
  not restate it.
- `server/src/reports/dto/report.dto.ts` (line 40) and
  `server/src/reports/reports.controller.ts` (lines 50, 54:
  `snapshot: jsonObjectSchema`) — snapshot stays generic JSON; no DTO shape
  change beyond documenting the new key.

No comp, crop, or board region applies: this is a backend-only change with no
visual surface (see Reference deltas).

## Current-state facts the implementation must preserve

1. Evidence snapshots are schemaless `Json` frozen at creation; published
   revisions are immutable and supersede per report. Existing frozen rows are
   never rewritten — no backfill, no migration, no update path touches stored
   snapshots.
2. `resolveDashboardViewEvidence` runs inside the tenant-scoped report-creation
   transaction (`organizationId` + `status: 'active'` lookup); a foreign or
   archived view fails closed with the existing `NotFound` path before any
   snapshot is built.
3. Live-view reads already fail closed on unknown versions upstream in
   `toView`/`resolveSchemaVersion`. The evidence resolver therefore cannot
   observe a `>CURRENT` live row through the normal path; its own version check
   is defense-in-depth at the freeze boundary, using the same stable
   `ApiException` error path (no new envelope).
4. Aggregate evidence already freezes its own version marker
   (`metric.calculationVersion`, `calculationVersion` at snapshot root per
   `resolveAggregateEvidence`); dashboard evidence is the inconsistent sibling.
5. CSV/PDF export rendering reads `snapshot.name` / `snapshot.value` /
   `snapshot.datasetVersionId` only; an additive `schemaVersion` key must not
   alter export bytes, filenames, media types, checksums, or formula-escaping.
6. `ExportRequest.renderingVersion` (`"reports-v1"`) is the renderer marker and
   is unrelated; this prompt does not change it, the export worker, the outbox
   payload, or any route/permission/CSRF/idempotency behavior.

## Implementation

1. **Freeze the version on write** (`server/src/reports/reports.service.ts`,
   `resolveDashboardViewEvidence` only):
   - Import `CURRENT_DASHBOARD_VIEW_SCHEMA_VERSION` from
     `../dashboards/dashboards.service` (verified cycle-free: dashboards imports
     analytics/idempotency/repository only, never reports). Do not restate `1`
     as a literal and do not duplicate `resolveSchemaVersion`; if a tiny local
     normalizer is needed for the `unknown` Prisma value, delegate the
     comparison to the imported constant.
   - Normalize the live row's `schemaVersion`: missing/`null` → current (row
     written before prompt 68); value `1` → `1`; any value `> CURRENT` (or
     non-integer/`< 1`) fails closed with the existing stable `ApiException`
     path before the snapshot is built — never guess, coerce, or freeze the
     unknown shape. (Unreachable through `toView` today; kept as the freeze
     boundary so a future v2 writer cannot silently mint uninterpretable
     evidence.)
   - Stamp the normalized integer into the frozen snapshot as
     `snapshot.schemaVersion` alongside the existing
     `dashboardViewId/name/filters/presentation` keys. The Prisma
     `dashboardView.findFirst` call needs no `select` change unless the repo
     narrows columns; keep the tenant predicate
     `{ id, organizationId, status: 'active' }` exactly as-is.
2. **Read rule for pre-marker snapshots** (code + docs, no rewrite):
   - Existing frozen snapshots without `schemaVersion` remain byte-identical in
     storage (immutability). Wherever server or client code interprets a
     `dashboard_view` snapshot's shape, treat a missing marker as version 1 —
     the only shape ever frozen before this prompt. Document this in
     `docs/reports.md`; do not add a migration or a rewrite job.
   - Export rendering (`renderCsv`/`renderPdf`) needs no change beyond the
     guarantee: additive key, zero byte change for old and new snapshots.
     Prove it with a byte-equality test (old snapshot without the key renders
     identically before/after).
3. **Tests** (no Prisma test double for tenant-behavior assertions):
   - Unit (`server/src/reports/reports.service.spec.ts`):
     - new freeze stamps `schemaVersion: 1` (update the exact-snapshot test at
       lines 1305–1319 and `sampleDashboardViewRow` to carry the versioned row);
     - pre-versioning row (no `schemaVersion` key) and `null` both freeze as
       `1`;
     - future-version row (`schemaVersion: 2`) fails closed at freeze time via
       the stable error path and writes no `reportEvidence` row;
     - idempotent report creation still replays identically (version is
       frozen content, not part of any replay key change — there is none);
     - export byte-equality: `renderCsv` output for a dashboard-evidence
       revision is identical with and without the snapshot marker
       (formula-escaping untouched).
   - Real-DB e2e (extend the existing reports/database gate, do not invent a
     new harness): two-organization isolation still holds for version-stamped
     evidence (foreign view → `NotFound` under forced RLS, no snapshot
     written); create→read round trip returns the stamped snapshot.
   - Regression: full `reports.service.spec.ts`, `npm run test:server`, and
     `npm run contracts:check` (snapshot is generic JSON so no OpenAPI/SDL
     diff is expected — verify and commit none).
4. **Docs**: in `docs/reports.md`, add a short subsection under § Schema and
   permissions (or § REST API evidence paragraph) stating: new
   `dashboard_view` snapshots carry `schemaVersion` (1 = Phase 9
   filters/presentation shape, normalized from the live row, missing→1);
   pre-marker frozen snapshots stay unchanged and read as 1; unknown future
   markers fail closed at freeze time; export bytes unaffected. One
   index-row-class edit at most elsewhere.

## Expected impact — which routes change, and how

- Code + tests + `docs/reports.md` only. No migration, no Prisma schema change,
  no shared-contract change, no OpenAPI/SDL change (verify with
  `contracts:check`), no client change.
- REST paths unchanged (`POST /reports` evidence freeze,
  `GET /reports/:reportId/revisions/:revisionId/evidence` returns the stamped
  snapshot inside the existing generic-JSON `snapshot` object). Same permission
  map (`reports.*`), same envelopes, same CSRF/`Idempotency-Key` behavior.
- `GET /exports/:exportId/download` bytes unchanged; `ExportRequest`
  rendering version untouched.
- Client UI: no change required. `/app/reports` treats `snapshot.schemaVersion`
  as opaque metadata; no new fetch, no new copy.

## Non-goals — deliberately out of scope, and why

- New presentation shapes, axes, chart kinds, or filter keys: this prompt
  versions frozen evidence; it does not change any shape.
- Migration logic for a hypothetical v2 snapshot shape or a rewrite/backfill
  of old snapshots: no v2 exists and published evidence is immutable; only the
  stamp plus the missing→1 read rule ships.
- Dashboard sharing, publishing, collaboration, scheduled exports,
  retention/deletion policy: separate future phases/open decisions per the
  residual gaps in `docs/dashboards.md` and `docs/reports.md`.
- Analytics cross-version rollups and richer quality heuristics (Phase 8
  residuals): separate semantics changes with their own product decisions.
- Operator-owned launch values (retention windows, SLOs, TLS/SMTP provider,
  key recovery): operator decisions per `docs/launch-checklist.md`, not
  implementable here.
- Any RLS, permission-map, throttle, GraphQL-complexity, introspection,
  outbox/worker, or export-renderer change.

## Reference deltas

None — there is no visual surface and no comp applies. Evidence API responses
gain one additive integer key inside the existing generic-JSON `snapshot`
object for `dashboard_view` evidence; aggregate snapshots, export bytes, and
all other fields are unchanged.

## Breakpoint behaviour

No UI change ships, so there is nothing to verify at 375/800/1280 beyond the
existing reports responsive suites staying green (they run as part of the
checks below; no new browser coverage is required unless the implementation
touches client code, in which case the existing 375/800/1280 zero-horizontal-
scroll and 44px touch-target assertions must still pass).

## Checks to run (§6), with real output quoted

From the repository root, in dependency order:

```bash
npm run lint
npm run typecheck
npm run build
npm run contracts:check
npm run test --workspace=@acres/server -- src/reports/reports.service.spec.ts
npm run test:server
git diff --check
git status --short
```

Fix every failure before review. Never claim a check passed without running it.
`npm run analytics:plans` is not affected (evidence snapshots are not a
benchmarked query path) — state that rather than running it silently; run it
only if the implementation touches an analytics/dashboard query plan.

## Review, record, commit

- Two-stage review loop is mandatory: `requesting-code-review` with structured
  context (requirements, what changed, files, SHAs, checks run), then evaluate
  with `receiving-code-review` against codebase reality; re-review if the
  feedback drives architectural change.
- Record the result in `docs/reports.md` per § Implementation step 4. One
  index-row-class edit at most elsewhere.
- Commit to `main` with `caveman-commit` (ALWAYS rule); do not push.

## SKILLS USED

- `architecture-patterns`: frozen-evidence boundary, immutable-revision preservation, single version-constant source across service boundary.
- `nestjs-best-practices`: service-pattern freeze change, transaction-local tenant scope, centralized exception path, testing-module unit tests.
- `api-design-principles`: additive snapshot key without route/permission/envelope change, stable fail-closed error at the freeze boundary.
- `openapi-spec-generation`: verifying committed OpenAPI/SDL snapshots show no drift for the generic-JSON snapshot change.
- `security-best-practices`: confirm no trust-boundary change (tenant predicate intact, no new unauthenticated surface, no raw HTML/formula path touched).
- `error-handling-patterns`: fail-closed unknown-version handling at freeze time, missing→1 normalization documented as judgement.
- `javascript-testing-patterns`: unit coverage for stamp/normalize/fail-closed/export-byte-equality cases.
- `e2e-testing-patterns`: real-PostgreSQL two-org isolation and create/read round-trip proofs (no Prisma test double for DB assertions).
- `sql-optimization-patterns`: only if the resolver query plan changes; otherwise state why it does not apply (no DDL, no predicate change, JSON snapshot only).
- `postgres-best-practices`: only if DDL appears; none is authorized — state why it does not apply.
- `requesting-code-review`: structured reviewer-subagent dispatch after self-verification.
- `receiving-code-review`: technical evaluation of review feedback before fixing.
- `caveman-commit`: conventional commit message for the final local commit.
