# 78 — `GET /jobs/runs` role authorization (`jobs.read`, owner/admin)

## Scope, and why it is next

The committed repository is on `main` at `6762ebe`
(`fix(jobs): sanitize purge failure messages`). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus residual follow-ups 68 (saved-view
`schemaVersion`), 69 (frozen dashboard-evidence `schemaVersion`), 70 (hourly
`exports.purge-expired` reclamation), 71 (download-time expiry enforcement),
72 (incompatible-metric-remap pre-publication validation), 73 (unexpected
publication-failure message sanitization), 74 (`parser_exception` fixed
message), 75 (`worker_exception` fixed message), 76 (infected `scanResult`
bounded to `'infected'`), and 77 (scheduled-job `JobRun.message` fixed
strings).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 3 (organizations, permissions, and RLS),
dependency-safe against prompts 68–77 (no schema, migration, contract-shape,
route-path, or version-marker change).

The gap is the one the codebase names itself. `server/src/jobs/jobs.controller.ts`
lines 13–17:

> Behind the session guard because job names and failure messages describe
> internals. Role-based authorization is a later prompt; until it exists,
> "any signed-in account" is the floor, not the intended final rule.

`GET /api/v1/jobs/runs` (`JobRunsService.listRecent`, bounded to 50 rows) is
guarded by `SessionGuard` only. Any signed-in account — including `analyst`
and `viewer` members whose own product surfaces are deliberately read-scoped —
can list global scheduled-maintenance runs: job names, statuses, timestamps,
and (post-77, fixed-string but still internal) failure messages. Prompt 77
sanitized *what* is stored; this prompt finishes the job by restricting *who*
can read it. `docs/backend.md` line 256 states the same deferral in prose
("/jobs/runs sits behind the session guard only … it is a later prompt"), and
the §14 residual table (line 1560) records "`/jobs/runs` is still
session-gated only" as known product-authorization debt.

The design decision, made here so implementation does not improvise it: add a
new `jobs.read` organization permission held by `owner` and `admin` only, and
gate the route with the standard three-guard chain. A new permission is chosen
over reusing `audit.read` (same holder set today) because the holder sets can
diverge later and audit semantics ("who did what to membership") must not
silently expand to cover operational job telemetry. `JobRun` rows stay global
(no `organization_id`, no RLS change): they describe system-wide scheduled
maintenance, not tenant data, so the read is gated at the controller by the
caller's *active-organization role*, exactly as the surgery is scoped.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 3 definition (§4) with its skill manifest;
  §§16–22 confirming 12E–12K committed; establishes no unbuilt ordered phase
  and that this is a Phase 3 residual (permission-policy surface).
- `docs/product.md` § permission contract (lines ~50–65) — the implemented
  permission list and the owner/admin/analyst/viewer prose; the owning
  product record for the new `jobs.read` entry.
- `docs/backend.md` — jobs route row (line 233), the session-guard-only
  paragraph (lines 255–258, to be rewritten), the §14 residual table row
  (line 1560, to be closed), and the permission-policy section (§14,
  `OrganizationPolicy` description).
- `docs/security.md` — trust-boundary/threat-register rows covering
  organization policy and the `/jobs/runs` read model; update only if a row
  names the session-only rule.
- `docs/system-architecture.md` line 320 (Audit/admin row) — touch only if
  it names the jobs read path.
- `server/src/jobs/jobs.controller.ts` (34 lines, full file) — the gap and
  the exact comment to replace.
- `server/src/jobs/jobs.module.ts` (13 lines, full file) — currently no
  imports; the wiring point.
- `server/src/jobs/job-runs.service.ts` (54 lines, full file) —
  `listRecent` is unchanged; no service edit is expected.
- `server/src/organizations/permissions.ts` (full file) —
  `ORGANIZATION_PERMISSIONS` tuple (lines 6–33), owner set (line 38, all),
  admin set (lines 39–65), analyst set (66–83, must NOT gain `jobs.read`),
  viewer set (84–92, must NOT gain it), `RequiresOrganizationPermission` and
  `OrganizationPolicy.has`.
- `server/src/organizations/permission.guard.ts` (full file) — missing
  context → `NOT_FOUND` ("Organization not found."), denied role →
  `FORBIDDEN`; no guard edit is expected.
- `server/src/organizations/organization-context.guard.ts` (full file) —
  missing/invalid org id or no active membership → `NOT_FOUND`
  ("Organization not found."); anti-enumeration shape preserved; no guard
  edit is expected.
- `server/src/organizations/organizations.module.ts` (lines 1–23) —
  exports `OrganizationContextGuard` and `PermissionGuard`; the verified
  reason `JobsModule` can import `OrganizationsModule` to resolve both
  guards (Prisma/Config modules are `@Global`, Reflector comes from
  `@nestjs/core`; mirror-import is the safe wiring even though
  `UploadsModule` resolves the same guard classes without it — do not
  copy the uploads wiring unexplained, verify with typecheck + e2e).
- `server/src/organizations/permissions.spec.ts` (85 lines, full file) —
  `administrationPermissions` array (lines 4–14) asserts owner-has-all,
  admin-has-all-but-`ownership.transfer`, analyst/viewer-have-none.
- `server/test/api.e2e-spec.ts` — `ORG_CONTEXT` (role `'analyst'`, lines
  78–87), `signedInAgent` helper (line 93), the 401 test (lines 262–272,
  unchanged), the admit test (lines ~1664–1671, MUST be reworked: it uses
  the analyst context with no org header and currently expects 200), and
  the viewer-403 envelope pattern (lines ~862–874:
  `{ ok: false, error: { code: 'FORBIDDEN' } }`).
- `server/src/contracts/generate-contracts.ts` line 167 and
  `docs/api/contracts.md` line 24 — the route-matrix auth column
  (`session` → new value); `docs/api/openapi.json` only if it is a
  generated artifact that records guard/auth metadata (check before
  touching; the `@ApiEnvelope`/`jobRunSchema` response shape is unchanged).

## Measurements and procedures (no eyeballed numbers)

No comp measurement is involved (server-only change). The normative matrix
is derived, not invented, from the three verified sources above:

| caller | expected result | reason |
| --- | --- | --- |
| no session | `401 UNAUTHENTICATED`, `prisma.jobRun.findMany` not called | existing test, unchanged (`SessionGuard` first in the chain) |
| session + missing/invalid org header, or no active membership | `404 NOT_FOUND` "Organization not found." | `OrganizationContextGuard` before any role check; preserves the anti-enumeration shape every other tenant route uses |
| session + active org + `owner` or `admin` role | `200`, existing envelope, `findMany` called | new `jobs.read` in both sets |
| session + active org + `analyst` or `viewer` role | `403 FORBIDDEN`, `findMany` not called | neither set gains the permission |

Guard order on the handler MUST be
`SessionGuard, OrganizationContextGuard, PermissionGuard` (decorator order =
execution order), matching `uploads.controller.ts:43` and
`organizations.controller.ts:93`.

## Expected impact — which routes change, and how

- `GET /api/v1/jobs/runs` only. Response shape, status codes for existing
  callers-with-privilege, SSE stream shapes, and all other routes unchanged.
- New callers without an active-organization header (including any operator
  script that polls this endpoint session-only) MUST send
  `x-acres-organization-id` for an org where the account is owner/admin;
  record this in `docs/backend.md` as a deliberate contract note, not a
  regression.
- The client never calls this endpoint (verified: no `jobs/runs`,
  `listRuns`, or `job-runs` reference under `client/`) — no client change,
  no client regression run required beyond the standard checks.
- `docs/api/contracts.md` + `generate-contracts.ts` auth column updated;
  regenerate via `npm run contracts:generate` and include the diff only if
  the generator produces one (if `--check` passes unchanged, say so and
  touch nothing).

## Implementation steps

1. `server/src/organizations/permissions.ts`: append `'jobs.read'` to
   `ORGANIZATION_PERMISSIONS`; add it to the `admin` set only (owner
   inherits all; analyst/viewer sets untouched).
2. `server/src/organizations/permissions.spec.ts`: append `'jobs.read'` to
   `administrationPermissions` (this extends the existing owner/admin/
   analyst/viewer assertions with zero new test logic; if that array's
   semantics do not fit — e.g. it is described as strictly administrative
   membership operations — add a dedicated `jobs.read` describe block
   instead and say why).
3. `server/src/jobs/jobs.controller.ts`: add
   `@UseGuards(SessionGuard, OrganizationContextGuard, PermissionGuard)` and
   `@RequiresOrganizationPermission('jobs.read')` (class level, mirroring
   `uploads.controller.ts:43–44`); replace the lines 13–17 comment with the
   final rule ("owner/admin of the active organization; analysts, viewers,
   and headerless callers are denied/404 per the guard chain").
4. `server/src/jobs/jobs.module.ts`: add `OrganizationsModule` to
   `imports` (verified exporter of both guards; no cycle — organizations
   does not import jobs).
5. `server/test/api.e2e-spec.ts`: rework the jobs cases to the §-above
   matrix — keep the 401 test byte-identical in expectation; convert the
   admit test to an owner (or admin) context WITH the org header expecting
   200; add analyst → 403, viewer → 403 (model on the dashboard-views
   viewer-403 pattern, asserting `findMany` not called), and missing-header
   → 404. Reuse `ORG_CONTEXT` overrides via `prisma.membership.findFirst`
   mock role swaps as existing suites do.
6. Docs in the same change: `docs/product.md` permission list + role prose
   (`jobs.read`: owner/admin; analysts/viewers excluded); `docs/backend.md`
   route row, the lines 255–258 paragraph (final rule + header requirement),
   and the line-1560 residual row (mark closed by this prompt);
   `docs/security.md` only where it names the session-only rule.
7. Run `npm run contracts:check`; if it fails, run
   `npm run contracts:generate` and inspect the diff (expected: auth column
   only).

## Non-goals

- No schema or migration change: `JobRun` stays global without
  `organization_id`; no RLS policy is added for it. Gating is at the
  controller via the caller's active-organization role, and the docs state
  this explicitly.
- No `JobRunsService` logic change (no filtering by org — there is nothing
  tenant-scoped to filter by).
- No new roles, no change to `ownership.transfer` semantics, no other
  route's guards touched.
- No client UI, no SSE change, no GraphQL change, no metrics/label change.
- No live Docker drills (restart/orphan/Garage/Valkey/ClamAV remain future
  operational work per prompts 72–77).

## Reference deltas

None visual (server-only). The one deliberate behavior delta: analysts,
viewers, and headerless session callers who could read `GET /jobs/runs`
today are denied (403) or not-found (404) after this change. This is the
point of the prompt, recorded in `docs/backend.md`, not a regression.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State this
in the completion summary; do not run browser suites for this change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1 generation).
- Targeted server suites: the permissions spec and the api e2e spec
  (or the full `npm run test:server` if the targeted run passes fast
  enough to leave no doubt — do not claim the full suite from a targeted
  run).
- `npm run contracts:check` (and `contracts:generate` diff inspection if
  needed).
- `git diff --check` and `git status --short` review; stage only approved
  files.
- Then the §2.1 two-stage review loop (`requesting-code-review` subagent
  with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
  verification) and the `caveman-commit` message.
- Record the result in `docs/backend.md` (+ `docs/product.md`,
  `docs/security.md` only as touched) in the same change.

## SKILLS USED

- `nestjs-best-practices` — guard composition/order, module imports/exports
  for `OrganizationsModule` → `JobsModule`, `security-use-guards` rule.
- `auth-implementation-patterns` — server-side RBAC enforcement (never
  client-only), least-privilege role scoping for the new `jobs.read`.
- `security-best-practices` — authorization-before-data access on an
  internals-describing read model; anti-enumeration 404 preservation.
- `api-design-principles` — stable error envelopes (401/403/404 shapes
  unchanged), versioned-route auth metadata in the contracts matrix.
- `openapi-spec-generation` — only if `contracts:generate` produces a diff
  (auth-column metadata); otherwise state it was checked and untouched.
- `javascript-testing-patterns` — permission-matrix unit extension and
  mocked-Prisma e2e guard-matrix cases.
- `error-handling-patterns` — guard-chain failure taxonomy (401 vs 404 vs
  403) and `findMany`-not-called negative assertions.
- `requesting-code-review` — Stage 1 reviewer subagent dispatch after
  self-verification (§2.1).
- `receiving-code-review` — Stage 2 technical evaluation of review feedback
  before any fix.
- `caveman-commit` — the commit message (ALWAYS rule, §3/§7).
