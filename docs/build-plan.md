# Acres implementation build plan

Status: ordered target implementation plan approved 2026-08-23. Phase 1 is
implemented by the commit that first adds this document; git history remains
the proof. Phase 2 is implemented through `prompts/18-database-infrastructure.md`
and `prompts/19-node-24-lts.md`. Phases 3–12 are not implemented merely
because they appear here.

## 1. How every phase runs

Each phase is a separately numbered, approved prompt and commit. Before code:

1. Re-read `AGENTS.md`, the approved phase prompt, and owning `docs/` files.
2. Inspect the live available-skill catalog. Load every required skill below;
   load each conditional skill when its trigger exists, or state why it does
   not. Read each complete `SKILL.md` and routed required references.
3. Verify installed Next 16.3 APIs in `node_modules/next/dist/docs/`, local
   shadcn component APIs in `client/components/ui/`, and official versioned
   stack docs wherever a skill does not settle an API.
4. Reconcile guidance with actual code, pinned dependencies, and Acres docs.
5. Self-verify, then always use `requesting-code-review` with a reviewer
   subagent, `receiving-code-review` to verify feedback, and `caveman-commit` to
   write the final commit message. Their omission from a future prompt is a
   prompt defect.

Every phase below includes: dependency, outcome and behavior, subsystems and
configuration/migrations, exclusions, security/failure cases, tests,
observability, rollback/compatibility, documentation owner, skills, and exit
evidence. Numeric limits and SLOs marked open need real measured or business
input; implementation must not invent them.

## 2. Phase 1 — architecture foundation

- **Depends on:** completed marketing client and small Nest backend at the
  repository state preceding prompt 16.
- **Outcome/behavior:** establish one current/target/deferred product,
  architecture, security, skills, and implementation record. Every selected
  component has a responsibility, license inventory, replacement seam, and
  implementation owner.
- **Subsystems and changes:** add `product.md`, `system-architecture.md`,
  `security.md`, `build-plan.md`, and `skills.md`; update `backend.md` and
  `AGENTS.md`; install the locked project skills. No runtime package, schema,
  route, service, or UI change.
- **Security/failure cases:** distinguish existing controls from target controls;
  reject unverified licensing/version claims and unrelated installer metadata.
- **Tests/observability:** repository lint, typecheck, build, server suite, link
  and Mermaid inspection, diff/status review. Runtime telemetry is a non-goal.
- **Rollback/compatibility:** docs and skills can be reverted as one commit; no
  public/runtime contract changes.
- **Documentation owner:** all five new canonical docs plus `AGENTS.md` index
  and `docs/backend.md` bridge.
- **Skills:** required — `skill-installer`, `architecture-patterns`,
  `api-design-principles`, `openapi-spec-generation`,
  `architecture-decision-records`, `postgres-best-practices`,
  `nestjs-best-practices`, `security-best-practices`, `security-threat-model`,
  `playwright`, `auth-implementation-patterns`, `javascript-testing-patterns`,
  `e2e-testing-patterns`, `error-handling-patterns`,
  `sql-optimization-patterns`, `kpi-dashboard-design`, `data-storytelling`,
  `prompt-engineering-patterns`, `llm-evaluation`,
  `deployment-pipeline-design`, `github-actions-templates`,
  `prometheus-configuration`, `grafana-dashboards`, `secrets-management`,
  `sast-configuration`, `accessibility-compliance`, `requesting-code-review`,
  `receiving-code-review`, `caveman-commit`. Conditional — existing frontend,
  Tailwind, shadcn, React, GSAP, and view-transition skills only if their
  established client convention is changed; no runtime UI is written here.
- **Exit:** complete local links, clean exact skill lock/layout, all repository
  checks passing, reviewed diff, and one commit.

## 3. Phase 2 — infrastructure and first database migration

- **Depends on:** phase 1 decisions.
- **Outcome/behavior:** one-command documented local PostgreSQL/PostGIS boot;
  real Prisma 7 migrations and integration database; distinct liveness/readiness;
  deterministic start/stop/reset; current API behavior against real Postgres.
- **Subsystems/config/migrations:** Compose PostgreSQL/PostGIS first, activating
  no unused service; `.env.example`; recorded extension versions; separate
  migration/owner, non-owner runtime, and test roles; explicit deploy migration;
  first generated-and-reviewed SQL migration. Move build/CI images to Node 24
  LTS only after all packages and Prisma generation pass under it; remain on
  Prisma 7.9.1, not Prisma 8 RC. Define the production PostgreSQL host/block-
  volume encryption and operator key-recovery contract; a labelled disposable
  development volume may remain unencrypted.
- **Non-goals:** organizations/RLS policies, Valkey, Garage, upload processing,
  product routes.
- **Security/failure cases:** least-privilege credentials; missing extension,
  wrong role, unavailable DB, pending/drifted migration, invalid env, runtime
  DDL/owner denial, and graceful shutdown.
- **Tests:** fresh apply/status/drift; forward corrective rollback plan; rebuild
  empty DB from chain; real Prisma CRUD/unique/FK/session-cascade/current route
  integration; container health and CI parity. Database assertions may not use
  the Prisma test double. Production-profile inspection proves the database
  volume is encrypted and unlock material is not stored with the volume;
  operator key recovery is exercised outside CI logs.
- **Observability:** startup/readiness reason, migration status, DB connection
  failure and pool saturation signals without credentials.
- **Rollback/compatibility:** current routes/schema preserved; schema rollback is
  a reviewed down migration only when truly reversible, otherwise forward fix;
  Node 24 is current after prompt 19 verification; runtime rollback reverts the
  Dockerfile base declarations and CI setup-node version together.
- **Documentation owner:** `backend.md`, `system-architecture.md`, local/deploy
  runbook section, schema/migration README.
- **Skills:** required — `architecture-patterns`, `postgres-best-practices`,
  `nestjs-best-practices`, `security-best-practices`,
  `github-actions-templates`, `secrets-management`,
  `javascript-testing-patterns`, `requesting-code-review`,
  `receiving-code-review`, `caveman-commit`. Conditional —
  `deployment-pipeline-design` if promotion/deployment is added;
  `sast-configuration` if scanners start; `prometheus-configuration` if
  telemetry starts.
- **Exit:** migration applies from zero, real integration suite passes,
  current e2e passes, runtime cannot use owner privileges, and recovery/reset
  procedure is executable.

## 4. Phase 3 — organizations, permissions, and RLS

Status: implemented by `prompts/22-organizations-permissions-rls.md`; Prompt
55 adds real PostgreSQL ownership-transfer concurrency and active last-owner
trigger evidence; Prompt 56 adds the complete membership-administration matrix
and real PostgreSQL membership/invitation lifecycle evidence.

- **Depends on:** phase 2 real database, roles, and migration harness.
- **Outcome/behavior:** organizations, memberships, invitations, recovery
  tokens, fixed role-to-permission policy, active organization context,
  tenant-scoped repositories, database RLS, and audited privileged jobs.
- **Subsystems/config/migrations:** tenancy/identity schema; permission service;
  organization/member/invite APIs; transaction-local `SET LOCAL` through
  non-owner API role; constrained worker/system path; `ENABLE` + `FORCE RLS`;
  indexes and constraints for membership, owner, token, and tenant queries.
- **Non-goals:** billing, SSO/SAML, SCIM, custom roles, GraphQL, uploads, UI.
- **Security/failure cases:** at least one owner; last-owner and concurrent
  transfer protection; invitation expiry/replay; revoked/stale membership;
  absent context default-deny; guessed foreign UUID; pool-context leakage;
  accidental owner runtime role. Existing unknown real accounts are not given
  invented organizations: use an explicit dev bootstrap and production gate.
- **Tests:** full permission matrix; two-org repository/REST/relation/update/
  delete/audit/privileged-job negative matrix; pool reuse; FORCE RLS inspection;
  invitation/recovery/session/CSRF regressions and concurrency tests.
- **Observability:** permission-denial categories, invite lifecycle, privileged
  system-job and membership/ownership audit events; no PII/token logs.
- **Rollback/compatibility:** introduce tenancy behind explicit bootstrap and
  migration gate; preserve account-scoped sessions; forward-fix RLS/schema;
  old routes do not bypass the new scope.
- **Documentation owner:** `product.md` permission contract, `security.md`,
  `backend.md`, schema/RLS runbook.
- **Skills:** required — `architecture-patterns`, `nestjs-best-practices`,
  `postgres-best-practices`, `auth-implementation-patterns`,
  `security-best-practices`, `security-threat-model`,
  `javascript-testing-patterns`, `error-handling-patterns`,
  `requesting-code-review`, `receiving-code-review`, `caveman-commit`.
  Conditional — `sql-optimization-patterns` for RLS/index plans;
  `api-design-principles` if public membership routes change.
- **Exit:** automated negative isolation proof, reviewed SQL policies, no
  controller-local role strings, and documented permission semantics.

**Verification updates — 2026-09-05 through 2026-09-06:**
`server/test/database.e2e-spec.ts`
proves two simultaneous ownership-transfer commands serialize to one active
owner/one audit row/one succeeded idempotency record, while the waiter is
denied after the winning transition. It also proves the forced-RLS runtime role
cannot demote the sole owner: PostgreSQL raises the last-owner trigger error and
rolls the transaction back. Prompt 56 adds owner/admin/analyst/viewer policy
matrix coverage plus four real-database gates for role evolution, soft
revocation with session survival and later tenant denial, same-membership
reactivation, duplicate/revoked/replacement invitations, recipient/expiry/state
binding, and concurrent single-use acceptance. The focused lifecycle command
passed 4 tests / 114 total, and the full real-database suite passed 4 suites /
114 tests. The final unit suite passed 31 suites / 315 tests after the required
compiled parser artifact was built. Invitation delivery/recovery and
distributed operator policy remain separately scoped.

## 5. Phase 4 — versioned REST and complementary GraphQL

Status: implemented by `prompts/23-versioned-rest-graphql-contracts.md`;
Prompt 54 adds the isolated idempotency matrix and a pending real-PostgreSQL
simultaneous-request gate.

- **Depends on:** phase 3 organization context and policy.
- **Outcome/behavior:** `/api/v1`, finite old-route migration, generated
  OpenAPI, authenticated initially read-only `/graphql`, deterministic SDL,
  request IDs, stable errors, cursors, idempotency, DataLoaders, and contract CI.
- **Subsystems/config/migrations:** Nest URI versioning; Swagger generation;
  GraphQL code-first adapter; request-scoped loaders; idempotency records with
  principal/org/operation/body hash/outcome/expiry; request/complexity limits.
- **Non-goals:** GraphQL mutations/subscriptions, generated SDK, uploads,
  dashboards, external API consumers.
- **Security/failure cases:** organization context before resolver work;
  malformed/foreign cursor; cross-tenant global ID; aliases/depth/complexity/
  bytes/result/time abuse; loader scope leakage; duplicate key with different
  body; production GraphiQL/verbose error/introspection misconfiguration.
- **Tests:** route version/deprecation deadline, errors/envelopes, session/CSRF
  parity, GraphQL auth/isolation, cursor stability, N+1 query counts, complexity
  rejection, idempotent replay/conflict/concurrency, OpenAPI/SDL snapshots and
  breaking-change classification. Prompt 54's isolated suite passes 23/23 and
  the full server unit suite passes 305/305. Its two-request PostgreSQL race
  gate passed against the migrated `acres_test` database in
  `database.e2e-spec.ts` on 2026-09-05 (17/17 tests passing, full server E2E
  suite 4/4 suites and 108/108 tests passing), proving that concurrent commands
  produce one durable effect and identical successful responses under forced
  RLS.
- **Observability:** request/trace ID across both transports; operation name and
  bounded cost/latency metrics without query variables; idempotency outcomes.
- **Rollback/compatibility:** explicitly label each old route alias, redirect,
  deprecation header, or removal date; GraphQL begins additive/read-only;
  contracts guard drift.
- **Documentation owner:** `backend.md`, API route/resolver matrix, committed
  OpenAPI and SDL, `security.md` if the boundary changes.
- **Skills:** required — `architecture-patterns`, `nestjs-best-practices`,
  `api-design-principles`, `openapi-spec-generation`,
  `auth-implementation-patterns`, `security-best-practices`,
  `javascript-testing-patterns`, `e2e-testing-patterns`,
  `error-handling-patterns`, `requesting-code-review`,
  `receiving-code-review`, `caveman-commit`. Conditional —
  `postgres-best-practices` and `sql-optimization-patterns` for cursor/loader
  queries; `security-threat-model` when the GraphQL threat boundary changes.
- **Exit:** committed checked contracts, published matrix, negative auth/cost
  tests, and no resolver/controller Prisma or cross-transport calls.

## 6. Phase 5 — client/backend connection and authenticated shell

- **Depends on:** phases 3–4 real identity/organization/contracts.
- **Outcome/behavior:** same-origin routing, server-safe query client, browser
  mutation/CSRF client, register/login/logout/session, organization selection,
  protected application layout, role-aware navigation, empty/error/loading/
  offline/session-expired states, and real-browser fixtures.
- **Subsystems/config/migrations:** verified Next 16.3 proxy/server-fetch/cache/
  cookie/header/form conventions from local docs; no DB/secrets in Next;
  centralized API clients; server components for initial reads and client leaves
  for browser interaction. No schema migration unless approved separately.
- **Non-goals:** upload UI, charts, reports, billing, unjustified motion.
- **Security/failure cases:** no client-only auth; safe return paths; stale CSRF,
  revoked session/membership, cross-origin error, prior-org cache leakage,
  duplicate submit, hydration mismatch, API slow/down.
- **Tests:** login/register/logout/non-enumerating errors; CSRF rotation;
  anonymous redirect/deep link/back-forward/refresh; organization switch;
  hidden and server-forbidden actions; 375/800/1280 Playwright; keyboard,
  screen-reader semantics, focus restoration, live errors, password managers,
  touch targets, contrast, and reduced motion.
- **Observability:** safe web-vital/request correlation, auth/session failure
  categories, client error boundary signals; no client secrets or raw PII.
- **Rollback/compatibility:** marketing `/` remains intact; authenticated app is
  additive and feature-gated until the complete journey passes; cache keys are
  user/org-safe or reads remain uncached.
- **Documentation owner:** new authenticated UI build record plus updates to
  `product.md`, `backend.md`, design/accessibility docs.
- **Skills:** required — `frontend-design`, `tailwind-design-system`,
  `tailwind-4-docs`, `shadcn`, `vercel-react-best-practices`,
  `web-design-guidelines`, `accessibility-compliance`,
  `auth-implementation-patterns`, `api-design-principles`,
  `security-best-practices`, `playwright`, `e2e-testing-patterns`,
  `javascript-testing-patterns`, `requesting-code-review`,
  `receiving-code-review`, `caveman-commit`. Conditional —
  `vercel-react-view-transitions` for route/state transitions; `gsap-core`,
  `gsap-react`, `gsap-performance` only for approved GSAP motion, and
  `gsap-timeline`, `gsap-plugins`, `gsap-utils`, `gsap-scrolltrigger` only when
  that exact API is used.
- **Exit:** accessible authenticated journey against real API/DB at all three
  viewports, with server-side enforcement and no cross-org cache residue.

**Phase 5B evidence — 2026-09-06:** Prompt 57 adds the server-session-protected
`/accept-invitation` paste flow over the existing CSRF/idempotent REST command.
The focused helper (`1/1`), complete helper file (`8/8`), real-browser
invitation suite (`6/6`), and server lifecycle regression (`3/3`) pass; browser
coverage proves the real inviter/invitee journey, generic unavailable state,
CSRF refresh, focus/pending behavior, token non-persistence, and 375/800/1280
layout. Contracts, formatting, lint, typecheck, build, and operations checks
pass. This is not the Phase 5 exit: email delivery, recovery, richer route
boundaries, production same-origin evidence, and 10 pre-existing failures in
the 50-case full client suite remain open.

**Phase 5C evidence — 2026-09-06:** Prompt 58 adds provider-neutral mail delivery
and account recovery. `MailModule` provides Nodemailer SMTP transport for Mailpit
in dev (`axllent/mailpit:v1.23` in `docker-compose.yml`) and `MemoryMailAdapter`
for deterministic test execution. Public endpoints `POST /api/v1/auth/forgot-password`
and `POST /api/v1/auth/reset-password` implement strict throttling, CSRF
protection, idempotency, anti-enumeration constant-time dummy verification,
atomic single-use SHA-256 token consumption, cost-12 bcrypt password updates,
and session revocation across all active sessions (`revokeAllForAccount`) per
TM-03. Client routes `/forgot-password` and `/reset-password` enforce 44px touch
targets, zero horizontal scroll at 375/800/1280px, and mount-time URL token
hygiene (`replaceState`) to eliminate bearer token leakage. Backend recovery
tests (`9/9`), client helper tests (`9/9`), and browser recovery tests (`7/7`)
pass. Open Phase 5 work: invitation issuance/admin UI with email delivery,
richer loading/error boundaries, and production Caddy same-origin routing.

**Phase 5D evidence — 2026-09-06:** Prompt 59 adds member administration and
invitation issuance UI with email delivery. `MailService.sendInvitationEmail`
delivers branded invitation emails with 24-hour expiration details and direct
acceptance links (`/accept-invitation?token=...`). `OrganizationsService.invite`
asynchronously dispatches the invitation email on issuance. Client API helpers
(`listMembers`, `changeMemberRole`, `revokeMember`, `listInvitations`, `inviteMember`,
`revokeInvitation`) in `server.ts` and `browser.ts` wire CSRF headers, idempotency
keys, and organization scoping. The app shell activates the "Members" navigation
item (`status: "Active"`, `href: "/app/members"`, visible to `owner` and `admin`).
The `/app/members` route provides `MembersWorkspace`, featuring active member
listing, role management, member revocation, invitation issuance with role assignment,
and invitation revocation. Viewers and analysts navigating directly to `/app/members`
receive a polite permission boundary with return-to-workspace navigation. Controls
enforce minimum 44px touch targets and zero horizontal scroll at 375/800/1280px
viewports. Backend organizations e2e tests (`7/7`), client API helper tests (`10/10`),
and browser member administration tests (`4/4`) pass.

**Phase 5E evidence — 2026-09-08:** Prompt 60 implements Phase 5E: accessible route error
boundaries, streaming loading skeletons, and localized error recovery. Reusable
`RouteErrorBoundary` (`client/components/acres/app/route-error-boundary.tsx`) provides
standardized error recovery with `role="alert"`, `aria-live="assertive"`, `data-slot="error-boundary"`,
Crimson Text headings, DM Sans body copy, Roboto Mono digests, a 48px primary retry pill
(`reset()`), and >=44px secondary links ("Return to Workspace", "Sign Out"). Route boundaries
installed at `/app/error.tsx`, `/app/members/error.tsx`, `/app/dashboards/error.tsx`,
`/app/datasets/error.tsx`, `/app/reports/error.tsx`, and `/(auth)/error.tsx`. Shared
skeleton primitives in `workspace-skeleton.tsx` (`WorkspaceHeaderSkeleton`, responsive
`TableSkeleton`, `CardGridSkeleton`, and `WorkspaceShellSkeleton`) deliver accessible
loading states (`role="status"`, `aria-busy="true"`) with zero horizontal overflow down to
375px and full `prefers-reduced-motion: reduce` compliance across `/app/loading.tsx`,
`/app/members/loading.tsx`, `/app/dashboards/loading.tsx`, `/app/datasets/loading.tsx`,
and `/app/reports/loading.tsx`. Unit tests (`4/4`) and browser Playwright tests (`6/6`)
pass. Phase 5 production Caddy same-origin routing is verified in Phase 12G.

## 7. Phase 6 — storage, queues, worker, and secure uploads

- **Depends on:** phase 4 commands/contracts and phase 3 tenant policy. Phase 5
  remains earlier in the ordered sequence but is not a backend storage/worker
  prerequisite.
- **Outcome/behavior:** Garage, Valkey/BullMQ, separate worker, PG outbox,
  ClamAV, upload initiate/complete/status/cancel, quarantine lifecycle, progress
  SSE, retries/dead letters, cleanup, and durable restart behavior.
- **Subsystems/config/migrations:** bucket/prefix policy; opaque object metadata;
  worker entry/image; private authenticated Valkey `noeviction`; outbox/upload/
  stored-object/job schema; scanner and S3 ports; secrets and service health;
  production Garage volume encryption using the phase-2 key ownership boundary.
- **Non-goals:** parsing accepted data into analytics, public connectors,
  multi-region/customer buckets.
- **Security/failure cases:** signature/key/checksum/type/size tampering; foreign
  status/object; malware and scan timeout fail closed; expansion/nesting and
  parser budgets; duplicate completion/outbox; crash after commit; poison job;
  cancellation; object/row orphan; clock skew; Garage/Valkey/ClamAV independent
  outage. Raw filenames never become keys and payloads contain identifiers only.
- **Tests:** real signed upload and attachment download, hostile fixtures,
  retry/dead-letter/replay, API/worker restart and graceful drain, outbox
  reconciliation, SSE disconnect/reconnect, cleanup and cross-tenant negatives;
  production-profile inspection extends the encrypted-volume/key-separation
  proof to Garage.
- **Observability:** queue age/depth/retry/dead letters, outbox lag, stage
  duration/failure, scanner/storage readiness, orphan counts, worker drain.
- **Rollback/compatibility:** feature remains off until all dependencies ready;
  durable PG state permits queue rebuild; migrations are additive; reconcile
  before object deletion.
- **Documentation owner:** storage/queue/worker runbook, `backend.md`,
  `system-architecture.md`, `security.md`.
- **Skills:** required — `architecture-patterns`, `nestjs-best-practices`,
  `api-design-principles`, `security-best-practices`,
  `security-threat-model`, `error-handling-patterns`,
  `javascript-testing-patterns`, `e2e-testing-patterns`, `secrets-management`,
  `requesting-code-review`, `receiving-code-review`, `caveman-commit`.
  Conditional — `postgres-best-practices` for outbox/job migrations;
  `sql-optimization-patterns` for polling/cleanup; `prometheus-configuration`
  when queue metrics land.
- **Exit:** durable restart and duplicate-delivery proof, secure quarantine
  threat tests, visible dead letters, and outbox/object reconciliation (verified
  by `outbox.service.spec.ts`, `upload-worker.service.spec.ts`, and
  `retention-maintenance.job.spec.ts`).

## 8. Phase 7 — geography and ingestion

- **Depends on:** phase 6 accepted-object pipeline and worker; phase 3 RLS.
- **Outcome/behavior:** global arbitrary-depth geography, licensed provenance,
  PostGIS boundaries, mapping, bounded CSV/XLSX/GeoJSON parsing, validation,
  normalization, immutable publication, and resolvable issues.
- **Subsystems/config/migrations:** region hierarchy/code/alias/source and
  geometry SQL; dataset/version/mapping/run/issue staging; parser adapters;
  reviewed spatial indexes and raw parameterized PostGIS queries; provider data
  only after source/license approval.
- **Non-goals:** unnamed connectors, full GIS editing, fuzzy auto-accept without
  review, dashboards or AI.
- **Security/failure cases:** geometry bombs/invalid CRS, spreadsheet/archive
  limits, formula content, ambiguous/unmatched regions, duplicate rows, partial
  publish, cancellation before/after publication, version retry, raw SQL
  injection, foreign dataset, removed source, mapping changes during a run, and
  partial worker/database failure. Parsers make encoding, delimiter, header,
  XLSX sheet selection, date/number/unit/locale, null and formula-as-data rules
  explicit; ambiguity is surfaced rather than guessed.
- **Tests:** curated valid/malformed fixtures; deterministic mapping/version;
  deep hierarchy/cycle rejection; stable alias/code resolution; valid/invalid/
  mixed geometry and CRS; encoding/delimiter/header/XLSX variants; excessive
  row/column/feature/geometry bounds; hierarchy/spatial query plans; mid-stage
  restart and repeat-import idempotency; transaction rollback/no partial
  visibility; two-org and hostile parser matrix.
- **Observability:** per-stage duration/count/quality severity, unmatched rates,
  parser resource ceiling, publication and cleanup outcomes; bounded labels.
- **Rollback/compatibility:** stage then atomically publish; immutable versions;
  failing a new version leaves prior published version readable; spatial
  migration has explicit forward correction.
- **Documentation owner:** ingestion/geography build record, schema/data-source
  provenance, `security.md` boundary update.
- **Skills:** required — `architecture-patterns`, `nestjs-best-practices`,
  `postgres-best-practices`, `security-best-practices`,
  `security-threat-model`, `error-handling-patterns`,
  `javascript-testing-patterns`, `e2e-testing-patterns`,
  `sql-optimization-patterns`, `requesting-code-review`,
  `receiving-code-review`, `caveman-commit`. Conditional —
  `api-design-principles` and `openapi-spec-generation` for upload/mapping
  contracts; `playwright` if the mapping UI is included.
- **Exit:** real files publish repeatable immutable versions, invalid files fail
  safely with useful issues, region queries are correct/measured, no tenant or
  partial-data leak.

### Phase 7C evidence record

Prompt 49 adds the Phase 7 database evidence unit: fail-closed PostgreSQL/PostGIS
E2E coverage and separate synthetic spatial/hierarchy plan gates in CI. It is
not a declaration that provider governance, live publication, or all Phase 7
operations work is complete.

## 9. Phase 8 — metrics and deterministic analytics

- **Depends on:** phase 7 published normalized versions.
- **Outcome/behavior:** governed metric definitions, typed observations,
  quality flags, units/periods/dimensions, deterministic aggregations, evidence
  lineage, and decision-useful read models.
- **Subsystems/config/migrations:** analytics schema/checks; calculation ports;
  aggregate/materialization policy based on measured queries; explicit unit,
  missing-value, revision, and quality semantics.
- **Non-goals:** AI interpretation, decorative dashboard UI, unsupported
  forecasts, invented KPI targets.
- **Security/failure cases:** ambiguous value types, unit mismatch, double
  counting, invalid aggregation, stale aggregate, dimension explosion, foreign
  version/metric, sensitive small-group disclosure where applicable.
- **Tests:** unit test suite (`analytics.service.spec.ts`, 19 tests) verifying
  metric definitions, observations, aggregates, evidence lineage, value normalization,
  and tenant-isolated error handling; golden calculations, property/invariant tests, lineage from result
  to observation/version, compatible/incompatible units and dimensions,
  time-grain/time-zone/leap-boundary behavior, null versus zero, duplicates,
  precision and threshold edges, aggregate invalidation/rebuild, late data and
  version replacement, two-org queries, representative SQL plans and N+1/
  query-count limits.
- **Observability:** calculation version, source/version counts, aggregate lag,
  quality distribution, slow-query/plan signals without product values in
  metrics.
- **Rollback/compatibility:** calculations are versioned; rebuild aggregates
  from authoritative observations; old report evidence retains old version.
- **Documentation owner:** analytics semantics/catalog, `product.md` glossary,
  `system-architecture.md` schema/query updates.
- **Skills:** required — `architecture-patterns`, `nestjs-best-practices`,
  `postgres-best-practices`, `sql-optimization-patterns`,
  `javascript-testing-patterns`, `error-handling-patterns`,
  `kpi-dashboard-design`, `data-storytelling`, `requesting-code-review`,
  `receiving-code-review`, `caveman-commit`. Conditional —
  `security-best-practices` for exports/sensitive aggregation;
  `api-design-principles` for new public query contracts.
- **Exit:** every output has defined semantics and reproducible evidence,
  representative queries meet measured plans, and no-AI analytics are complete.

## 10. Phase 9 — dashboards and optimized GraphQL

Status: implemented by `prompts/30-dashboards-optimized-graphql.md`.

- **Depends on:** phase 8 analytics and phase 5 authenticated shell.
- **Outcome/behavior:** accessible regional browse/compare dashboards, saved
  views, tenant-safe GraphQL read models, filters and states that explain
  metrics/units/quality/evidence rather than imply unsupported claims.
- **Subsystems/config/migrations:** dashboard/saved-view schema; query/view
  application services; GraphQL types/loaders/cursors; chart/table components;
  responsive product design at 375/800/1280.
- **Non-goals:** report publishing, AI, public sharing, real-time collaborative
  editing, animation without interaction evidence.
- **Security/failure cases:** foreign saved view/global ID, cached prior-org
  response, oversized filters/query, hidden low-quality/missing data, unsafe
  labels/URLs, inaccessible chart-only meaning.
- **Tests:** unit test suite (`dashboards.service.spec.ts`, 18 tests) verifying
  saved-view CRUD, tenant isolation, normalization, idempotency integration, and
  decimal string scalar serialization; query-count/plan and complexity tests;
  cross-org nodes/views; keyboard/screen-reader table alternative; filters/deep link/back-forward;
  loading/empty/error/partial-quality; visual/responsive/browser coverage.
- **Observability:** operation/query latency, loader hit/query count, slow
  filters, render/client errors, saved-view failures; no high-cardinality values.
- **Rollback/compatibility:** saved view schema/version is explicit; additive
  GraphQL change; feature-gate new dashboard while previous read path remains.
- **Documentation owner:** dashboard UI build record, GraphQL matrix, metric
  display/data-storytelling conventions.
- **Skills:** required — `frontend-design`, `tailwind-design-system`,
  `tailwind-4-docs`, `shadcn`, `vercel-react-best-practices`,
  `web-design-guidelines`, `accessibility-compliance`,
  `api-design-principles`, `kpi-dashboard-design`, `data-storytelling`,
  `postgres-best-practices`, `sql-optimization-patterns`,
  `security-best-practices`, `playwright`, `e2e-testing-patterns`,
  `javascript-testing-patterns`, `requesting-code-review`,
  `receiving-code-review`, `caveman-commit`. Conditional —
  `vercel-react-view-transitions` for transitions; exact GSAP skills only for
  approved GSAP interactions; `openapi-spec-generation` if REST changes.
- **Exit:** accessible, responsive real-data dashboard with traceable evidence,
  bounded/measured queries, and negative tenant/cache tests.

## 11. Phase 10 — reports and exports

- **Depends on:** phases 8–9 evidence and presentation, phase 6 jobs/storage.
- **Outcome/behavior:** report drafts, immutable revisions, evidence-bound
  insights, review/publish permissions, asynchronous CSV and PDF exports (with
  XLSX only if explicitly approved), safe attachment download, and
  reproducibility.
- **Subsystems/config/migrations:** report/revision/insight/evidence/export
  schema; rendering/export adapters; object lifecycle; ETag/version conflict;
  formula-escaping policy.
- **Non-goals:** autonomous publication, public links, unsupported narrative,
  paid document services.
- **Security/failure cases:** foreign report/evidence/export, stale write,
  evidence deletion, formula injection, HTML/SVG active content, oversized
  export, duplicate request, expired download, worker failure.
- **Tests:** draft/revision/publish permission matrix; immutable published
  revision; source-to-export lineage; formula fixtures; content disposition;
  Unicode/RTL/long text and page/row limits; tampered/expired links; renderer or
  storage failure; retry/idempotency/cancel/cleanup race; two-org and accessible
  authoring/browser journeys.
- **Observability:** export queue/duration/size/failure, publication/audit events,
  evidence-resolution failures; no report body in operational logs.
- **Rollback/compatibility:** published revisions immutable; renderers versioned;
  regenerate artifacts from evidence; feature gate format adapters.
- **Documentation owner:** report/export contract and UI build record,
  `product.md`, API matrix, `security.md`.
- **Skills:** required — `frontend-design`, `tailwind-design-system`,
  `tailwind-4-docs`, `shadcn`, `vercel-react-best-practices`,
  `web-design-guidelines`, `accessibility-compliance`,
  `api-design-principles`, `data-storytelling`, `security-best-practices`,
  `error-handling-patterns`, `playwright`, `e2e-testing-patterns`,
  `javascript-testing-patterns`, `requesting-code-review`,
  `receiving-code-review`, `caveman-commit`. Conditional —
  `postgres-best-practices`/`sql-optimization-patterns` for report/export
  queries; `openapi-spec-generation` for REST download/export contracts;
  `kpi-dashboard-design` for metric summaries.
- **Exit:** a permitted user publishes a reproducible revision and receives a
  secure, formula-safe export; unauthorized/stale/duplicate paths fail safely.

## 12. Phase 11 — optional AI draft preview (Phase 11A Gemini Free-Tier Preview)

- **Depends on:** phase 10 report/evidence workflow and explicit operator acknowledgment
  of unpaid Gemini Developer API terms. (Note: Phase 11A is implemented as an optional,
  disabled-by-default preview, but the unpaid Gemini Developer API tier is strictly excluded
  from the production launch profile, which enforces deterministic no-AI operation).
- **Outcome/behavior:** disabled-by-default assistive draft proposal generation
  via Port/Adapter (`AiDraftProvider`, `GeminiDraftAdapter`, `FakeDraftAdapter`);
  strict evidence grounding verification; versioned prompt builder (`v1`);
  mandatory user disclosure and unchecked acknowledgment checkbox on client;
  human-in-the-loop review before draft saving; full no-AI fallback.
- **Subsystems/config/migrations:** `AiGeneration` metadata model with RLS & SHA-256
  canonical input hash regex constraint; `AI_DRAFT_PROVIDER` port token;
  `server/src/ai/` module; synthetic categorical evaluation suite (`ai-evaluation-fixtures.ts`,
  `ai-evaluation.spec.ts`). No arbitrary tools, database mutation, or outbound fetch beyond Gemini.
- **Non-goals:** authoritative metrics, autonomous saving/publishing, vector DB / RAG.
- **Security/failure cases:** prompt injection in user purpose/snapshots (contained by structured XML delimiters),
  cross-tenant leakage (enforced by RLS & tenant isolation), unsupported claims / foreign citations (rejected by server grounding validator with `AI_GROUNDING_REJECTED`),
  rate limits (`AI_RATE_LIMITED`), timeouts (`AI_TIMEOUT`), sensitive prompt/output logging (zero raw text persisted).
- **Tests:** unit tests, synthetic evaluation suite (`ai-evaluation.spec.ts`), E2E tests (`api.e2e-spec.ts`, `product-journeys.spec.ts`).
- **Observability:** model, runtime, prompt version (`v1`), duration, token counts, completion state;
  raw sensitive prompt/output excluded from audit logs and database.
- **Rollback/compatibility:** `AI_DRAFT_ENABLED=false` cleanly disables the endpoint; core report authoring remains 100% deterministic without AI.
- **Documentation owner:** `docs/ai.md`, `docs/security.md`, `docs/system-architecture.md`, `docs/product.md`.
- **Exit:** all synthetic evaluation tests pass, injection/leakage tests pass, human author remains authoritative,
  no-AI fallback fully functional.

## 13. Phase 12 — operations and launch hardening

- **Depends on:** all product phases intended for launch and real operator-owned
  SLO/RPO/RTO/retention/capacity values.
- **Outcome/behavior:** hardened Compose+Caddy production, controlled CI/CD
  promotion/rollback, secret rotation, dependency/SAST/container scanning,
  OTel/Prometheus/optional Grafana, alerts, backups/restores, capacity/load,
  accessibility and end-to-end launch evidence.
- **Subsystems/config/migrations:** TLS/proxy headers/limits/timeouts; image and
  action pinning; artifact provenance; protected environments; runtime secret
  injection; collector/scrape/alert/dashboard provisioning; backup schedules;
  restore environment; retention jobs; deployment/migration gates; production
  PostgreSQL/Garage encrypted-mount inspection, unlock-material separation, and
  the operator-only recovery/rotation procedure.
- **Non-goals:** Kubernetes, Terraform, cloud selection, multi-region, service
  mesh, unmeasured microservice extraction.
- **Security/failure cases:** compromised dependency/action/image, secret in
  git/log/artifact, failed rotation, pending/destructive migration, partial
  deploy, backup theft/corruption, telemetry outage, disk/queue saturation,
  dependency loss, rollback after schema change, inaccessible launch UI.
- **Tests:** scanners with triage policy; runtime security headers/TLS; non-root
  images/SBOM or equivalent inventory; deploy/rollback and migration ordering;
  full backup restore + DB/object reconcile; failure injection and graceful
  drain; rate/size/load; live-volume encryption/key-separation and recovery
  checks; complete Playwright/a11y and cross-tenant regression.
- **Observability:** service-level golden signals; DB/query/pool/locks; outbox
  and queue age/dead letter; object/disk/scanner; auth abuse; backup/restore;
  telemetry-self-health. Alerts have owners and runbooks, not invented noise.
- **Rollback/compatibility:** immutable versioned images; backward-compatible
  expand/contract migrations; predeploy compatibility check; Caddy/app rollback;
  forward fix when schema cannot safely go backward.
- **Documentation owner:** operations/deployment/incident/backup/restore/
  rotation runbooks, launch checklist, architecture/security updates.
- **Skills:** required — `architecture-patterns`, `nestjs-best-practices`,
  `security-best-practices`, `security-threat-model`,
  `deployment-pipeline-design`, `github-actions-templates`,
  `prometheus-configuration`, `grafana-dashboards`, `secrets-management`,
  `sast-configuration`, `e2e-testing-patterns`, `playwright`,
  `requesting-code-review`, `receiving-code-review`, `caveman-commit`.
  Conditional — `postgres-best-practices`/`sql-optimization-patterns` for
  backup/restore/retention/load findings; `accessibility-compliance` and
  `web-design-guidelines` for final UI audit; provider/orchestrator skills only
  after that decision.
- **Exit:** operator-approved launch checklist; reproducible promotion and
  rollback; successful restore drill within selected objectives; actionable
  alerts/runbooks; no unresolved critical security/accessibility findings; all
  repository, integration, E2E, isolation, and failure tests passing.

## 14. Sequence gates

Phases do not overlap merely for speed. A later phase may be split into smaller
prompts, but cannot bypass its dependency or exit evidence. If production need
changes the order, update this plan with the migration/risk argument before
implementation. Every phase updates its owning docs in the same commit, so the
next session derives current state from code, git history, and canonical docs.

## 15. Phase 1 verification record — 2026-08-23

This records only commands run for the architecture-foundation implementation:

- structural script: `skills=45`, `files=8`, `structural checks: ok`; every
  lock entry resolved to a real `.agents/skills/` directory and the expected
  `.claude/skills/` symlink, referenced local Markdown files existed, and code
  fences were balanced. The post-review recheck additionally found 6 Mermaid
  diagrams, 21 threat IDs, and every upstream `skillPath` row;
- `git diff --check`: exit 0, no output;
- `npm run lint`: exit 0 across client, shared, and server;
- `npm run typecheck`: exit 0 across all workspaces; Prisma Client 7.9.1
  generated in 49 ms;
- `npm run build`: exit 0; Next.js 16.3.1 compiled successfully in 131 ms and
  generated 10/10 static pages; shared and Nest server builds completed, with
  Prisma Client 7.9.1 generated in 50 ms;
- `npm run test:server`: exit 0; 2/2 suites and 29/29 tests passed, 0 snapshots,
  in 4.278 s.

These checks validate the unchanged runtime and the repository structure. They
do not prove any target architecture component has been implemented.

## 16. Phase 12E verification record — 2026-09-09

Records the complete Phase 12 launch and regression verification suite:

- `npm run test:client:e2e`: exit 0; all 74 tests across 11 files passed in 52.8s;
  - `multi-tenant-isolation.spec.ts`: 3/3 passed (cross-tenant isolation of saved views, reports, and tenant header tampering 404 rejection);
  - `product-journeys.spec.ts`: 8/8 passed (unseeded empty state, populated dashboard, report draft authoring, review submission/publishing, export artifact queuing/download, dataset lifecycle with SSE stream ingestion, and Gemini preview disclosure/proposal workflows);
  - `loading-error-boundaries.spec.ts`: 7/7 passed (error boundaries, retry reset, touch targets, reduced motion);
  - All 8 other client suites passed cleanly.
- `npm run test:server`: exit 0; 6/6 suites and 131/131 tests passed in 41.0s;
- `npm run ops:check`: exit 0; 12/12 readiness tests passed, zero critical dependencies, template checks passed, secret scan passed;
- `git diff --check`: exit 0, no trailing whitespace;
- `npm run lint`: exit 0; 0 errors, 0 warnings across `@acres/shared`, `@acres/client`, `@acres/server`;
- `npm run typecheck`: exit 0 across all workspaces; Prisma Client 7.9.1 generated in 627 ms;
- `npm run build`: exit 0; Next.js 16.3.4 compiled cleanly in 13.1s with all dynamic and static routes optimized; server and shared builds completed cleanly.

## 17. Phase 12F verification record — 2026-09-09

Records the complete Phase 12 disaster recovery restore drill and object storage reconciliation suite:

- **Automated Disaster Recovery Restore Drill**:
  - `scripts/ops/run-restore-drill.sh`: exit 0;
  - Created timestamped backup archive of `acres` (485,487 bytes);
  - Verified archive integrity with `pg_restore --list`;
  - Created isolated drill database `acres_restore_drill`;
  - Restored backup archive into drill database with `restore-postgres.sh`;
  - Verified table count parity: 46/46 tables in `public` schema;
  - Verified applied migrations: 17/17 Prisma migrations matching;
  - Verified PostGIS spatial extension presence;
  - Verified 0 unvalidated foreign key constraints;
  - Verified record invariants across `Account` (452), `Organization` (401), and `Dataset` (5);
  - Measured Recovery Time Objective (RTO): elapsed 2098 ms (< 300s threshold; `rto_compliant: true`);
  - Ephemeral drill database and backup archive cleaned up automatically;
  - Structured evidence emitted to `backups/restore-drill-evidence-<timestamp>.json`.
- **PostgreSQL & Object Storage Reconciliation**:
  - `scripts/ops/reconcile-storage-objects.js`: pure deterministic reconciliation engine with CLI and module interfaces;
  - `scripts/ops/reconcile-storage-objects.spec.js`: 9/9 unit tests passed in 76ms;
  - Verifies clean matches, orphan object detection (storage leaks), missing object detection (data loss), size/checksum mismatches, upload state exclusions, quarantine retention windows, tenant/prefix filtering, and operational marker exclusions.
- **Operations & CI Integration**:
  - `npm run ops:restore-drill` and `npm run ops:reconcile-storage` added to root `package.json`;
  - `npm run ops:check`: exit 0; runs templates, secret scan, docker runtime, production dependency audit, readiness validator tests, and storage reconciliation unit tests;
  - `npm run lint`: exit 0 across all workspaces;
  - `npm run typecheck`: exit 0 across all workspaces;
  - `npm run build`: exit 0 across all workspaces;
  - `git diff --check`: exit 0, zero whitespace errors.

## 18. Phase 12G verification record — 2026-09-09

Records the complete Phase 12 Caddy same-origin ingress routing verification and deployment promotion/rollback drill:

- **Caddy Ingress Routing & Security Header Verification**:
  - `scripts/ops/verify-caddy-routing.js`: pure Node.js route evaluation engine;
  - `scripts/ops/verify-caddy-routing.spec.js`: exit 0; all 10 unit tests passed in 70ms;
  - Verified routing for `@api path /api/* /graphql /health /health/ready` to `api:3001` with `header_up X-Forwarded-Host {host}` and `header_up X-Forwarded-Proto {scheme}`;
  - Verified routing for `@objects path /acres-quarantine/*` to `garage:3900` with `header_up Host {host}` preserving S3 SigV4 signature integrity;
  - Verified fallback routing for all application and static assets (`/`, `/login`, `/register`, `/app/*`, `/_next/*`) to `next:3000`;
  - Verified edge security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and `-Server` banner stripping;
  - Verified transport timeouts across all backends (`read_timeout`, `write_timeout`, `dial_timeout`) and request body limits (`{$ACRES_MAX_REQUEST_BODY}`);
  - Verified HSTS gate invariant (Strict-Transport-Security remains commented out pending operator approval).
- **Automated Deployment Promotion & Rollback Drill**:
  - `scripts/ops/run-deployment-drill.sh`: exit 0;
  - Verified zero destructive DDL statements across 17 Prisma migration directories (additive-only schema changes ensuring backward compatibility on rollback);
  - Verified production Compose template `stop_grace_period` (Caddy: 30s, Next: 30s, API: 45s, Worker: 60s) and network isolation;
  - Verified liveness and deep readiness probe contracts against NestJS OpenAPI annotations;
  - Verified rollback command sequence (`docker compose -f <compose> up -d --no-deps --build=never <service>`);
  - Emitted structured JSON evidence reports to `backups/deployment-drill-evidence-<timestamp>.json`.
- **Operations & CI Integration**:
  - Root package scripts: `npm run ops:caddy-drill`, `npm run ops:deployment-drill`, `npm run ops:caddy-test`;
  - Integrated `ops:caddy-test` into `npm run ops:check`;
  - Formally resolves and closes the open Phase 5 Caddy ingress routing item.

## 19. Phase 12H verification record — 2026-09-09

**Current rotation qualification (prompt 235, 2026-09-30):** The dated rotation
results below are simulation rehearsal, not proof of production credential
rotation or zero downtime. TM-15 production acceptance remains operator-owned.

**Current volume qualification (prompt 237):** Historical volume results below
are declaration/local-scan preflight, not TM-21 production acceptance.

Records the complete Phase 12 production volume encryption key separation verification and zero-downtime secret rotation drill:

- **Volume Encryption & Key Separation Engine**:
  - `scripts/ops/verify-volume-encryption.js`: pure Node.js validator and evaluation engine;
  - `scripts/ops/verify-volume-encryption.spec.js`: exit 0; all 12 unit tests passed in 90ms;
  - Evaluated and verified all 9 stateful container volume mounts in `infra/compose/docker-compose.production.example.yml` and `infra/env/production.env.example`:
    - `postgres`: `/var/lib/postgresql` -> `${ACRES_POSTGRES_ENCRYPTED_MOUNT}`
    - `valkey`: `/data` -> `${ACRES_VALKEY_ENCRYPTED_MOUNT}`
    - `garage`: `/var/lib/garage/meta` -> `${ACRES_GARAGE_META_ENCRYPTED_MOUNT}`
    - `garage`: `/var/lib/garage/data` -> `${ACRES_GARAGE_DATA_ENCRYPTED_MOUNT}`
    - `clamav`: `/var/lib/clamav` -> `${ACRES_CLAMAV_ENCRYPTED_MOUNT}`
    - `caddy`: `/data` -> `${ACRES_CADDY_DATA_MOUNT}`
    - `caddy`: `/config` -> `${ACRES_CADDY_CONFIG_MOUNT}`
    - `prometheus`: `/prometheus` -> `${ACRES_PROMETHEUS_ENCRYPTED_MOUNT}`
    - `grafana`: `/var/lib/grafana` -> `${ACRES_GRAFANA_ENCRYPTED_MOUNT}`
  - Verified approved host encryption mechanisms (`LUKS2/dm-crypt`, `aws:kms`, `gcp:cmek`, `azure:keyvault`);
  - Verified Key Separation Invariant: prohibits unlock keys, passphrases, or credentials inside volume mounts, backup directories (`backups/`), or Git tracking;
  - Verified recovery governance: requires designated owner (`PRODUCTION_KEY_RECOVERY_OWNER`), split-key / dual-custody verification, and runbook reference.
- **Automated Secret Rotation & Compromise Response Drill**:
  - `scripts/ops/run-secret-rotation-drill.sh`: exit 0;
  - Verified dual-secret session rollover (`SESSION_SECRET`) with zero dropped active sessions during the rollover window, and immediate rejection of expired/retired keys;
  - Verified CSRF secret rollover with fail-closed rejection of stale tokens (`CSRF_INVALID`);
  - Verified PostgreSQL database role password rotation (`ACRES_APP_PASSWORD`, `ACRES_MIGRATOR_PASSWORD`) with connection pool drain verification and in-flight query preservation;
  - Verified Valkey runtime credential update (`CONFIG SET requirepass`) with zero dropped queue messages;
  - Verified S3 / Garage access key pair rotation with dual-key overlap window and SigV4 signature derivation;
  - Verified emergency compromise response: targeted mass revocation (`revokeAllForAccount`) and dead row purge (`purgeExpired`);
  - Audited secret redaction: verified zero raw secret strings or dev passwords in console logs, environment dumps, or drill reports;
  - Emitted structured JSON audit evidence reports to `backups/secret-rotation-evidence-<timestamp>.json`.
- **Operations & CI Integration**:
  - Root package scripts: `npm run ops:volume-test`, `npm run ops:volume-drill`, `npm run ops:rotation-drill`;
  - Integrated `npm run ops:volume-test` and template verification into `npm run ops:check` and `scripts/ops/check-production-templates.sh`;
  - Closes TM-15 and TM-21 operational verification requirements.

## 20. Phase 12I verification record — 2026-09-09

Records the complete Phase 12 supply-chain security, SAST scanning, and container hardening suite:

- **Software Bill of Materials (SBOM) & License Compliance (TM-18)**:
  - `scripts/ops/generate-sbom.js`: deterministic CycloneDX v1.5 JSON generator and license validator;
  - `scripts/ops/generate-sbom.spec.js`: exit 0; all 7 unit tests passed in 100ms;
  - Produces complete inventory of 730 production dependencies across root, server, client, and shared workspaces;
  - Formats package URLs (`purl`), version strings, and SHA-512 cryptographic hashes;
  - Enforces 100% license compliance against permissive allowlist (`MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `0BSD`, `CC0-1.0`, `Unlicense`, `BlueOak-1.0.0`, `Python-2.0`, `CC-BY-4.0`, project-approved GSAP, and dynamically linked Sharp LGPL binary);
  - Rejects unapproved copyleft licenses (`AGPL-1.0`, `AGPL-3.0`, `GPL-1.0`, `GPL-2.0`, `GPL-3.0`, `SSPL`, `CommonsClause`);
  - Strictly excludes 834 build/dev dependencies (`@types/*`, `typescript`, `playwright`, `jest`, `eslint`).
- **Static Application Security Testing (SAST) & Triage Engine (TM-15, TM-18)**:
  - `scripts/ops/run-sast-scan.js`: pure Node.js static analysis engine;
  - `scripts/ops/run-sast-scan.spec.js`: exit 0; all 12 unit tests passed in 130ms;
  - Scanned 358 source files across `client/`, `server/`, `packages/shared/`, and `scripts/` against 8 core rules (`SAST-01` through `SAST-08`);
  - Zero unreviewed active blockers in production codebase;
  - Triage Policy Registry (`infra/security/sast-triage.json` & `.schema.json`): 10 approved, non-expired suppressions with recorded business rationale, security owner, line-level scoping, and expiration date;
  - Enforces fail-closed expiration gating.
- **Container Image & Compose Hardening Verification (TM-18)**:
  - `scripts/ops/verify-container-security.js`: static multi-stage build and Compose configuration evaluator;
  - `scripts/ops/verify-container-security.spec.js`: exit 0; all 10 unit tests passed in 80ms;
  - Validated 17/17 security checks across `server/Dockerfile`, `infra/docker/client.Dockerfile.example`, and `infra/compose/docker-compose.production.example.yml`:
    - Node 24 Alpine pinned base images across all build and runtime stages;
    - Multi-stage build isolation (4 stages: `deps`, `build`, `prod-deps`, `runtime`);
    - Non-root execution (`USER node`) in runtime stages;
    - Bounded healthchecks (`--interval=30s --timeout=5s --retries=3`);
    - Direct exec JSON array `CMD` for POSIX signal propagation (`SIGTERM`);
    - Layer hygiene: zero inclusion of `.env`, `*.pem`, `*.key`, or credentials;
    - Compose network isolation (`networks.private.internal: true`) and datastore isolation;
    - Mandatory `${VAR:?msg}` credential injection syntax.
- **Operations & CI Integration**:
  - Root package scripts: `npm run ops:sbom`, `npm run ops:sbom-test`, `npm run ops:sast`, `npm run ops:sast-test`, `npm run ops:container-test`, `npm run ops:container-security`;
  - Integrated into `npm run ops:check`.

## 21. Phase 12J verification record — 2026-09-09

Records the complete Phase 12 capacity, load resilience, DoS mitigation, and Prometheus alert simulation drill:

- **Performance, Capacity, and Latency Evaluation Engine (TM-20, Category 5 SLOs)**:
  - `scripts/ops/verify-capacity-load.js`: pure Node.js statistical benchmarking engine calculating min, p50, p90, p95, p99, max, mean, stddev, throughput (RPS), and availability percentage;
  - `scripts/ops/verify-capacity-load.spec.js`: exit 0; all 15 unit tests passed in 90ms;
  - Validates Category 5 SLO requirements: availability >= 99.9%, p95 latency <= 500ms, throughput >= 100 RPS, database pool acquisition p95 <= 50ms, database query execution p95 <= 100ms;
  - Enforces mathematical monotonicity: `min <= p50 <= p90 <= p95 <= p99 <= max`;
  - Supports deterministic synthetic workload simulation for CI and live HTTP benchmarking mode;
  - Emits structured JSON audit reports (`backups/capacity-load-report-<timestamp>.json`).
- **Prometheus Alert Rule Expansion & Synthetic Simulation Engine (TM-16, TM-20)**:
  - `scripts/ops/verify-alert-rules.js`: static parser, PromQL validator, and time-series simulation engine;
  - `scripts/ops/verify-alert-rules.spec.js`: exit 0; all 9 unit tests passed in 100ms;
  - Expands `infra/prometheus/alerts.yml` to 7 operational golden signals and security threat alerts (`AcresApiDown`, `HighHttp5xxRate`, `P95LatencyThresholdExceeded`, `High429Rate`, `QueueDeadLettersDetected`, `OutboxDeliveryLag`, `DatabaseConnectionPoolSaturation`);
  - Simulates time-series metric data verifying each alert fires on threshold breach and clears on normal traffic.
- **2026-09-23 correction:** Prompt 66 originally named the seventh rule
  `DatabaseConnectionPoolSaturation`, but its expression measured in-flight HTTP
  requests. Prompt 167 renamed the current rule `HighHttpConcurrency`; direct
  database pool saturation telemetry remains unimplemented and does not satisfy
  Phase 12's DB/query/pool observability target.
- **2026-09-23 follow-up:** Prompt 168 adds API-process `pg.Pool` total, idle,
  waiting, and maximum gauges. Prompt 169 adds separate worker-process gauges
  through a private scrape. PostgreSQL-wide visibility, wait duration, and
  evidence-based saturation alerting remain open.
- **2026-09-24 follow-up:** Prompts 170–173 added PostgreSQL server connection/activity
  visibility, lock-wait diagnostics, pool acquisition latency, and query execution latency.
  Prompt 174 added the eighth required Prometheus alert rule `DatabaseConnectionPoolSaturation`
  (`acres_postgres_pool_requests_waiting{job="acres-api"} > 0` for 1m), formally closing the
  evidence-based pool saturation alerting requirement.
  Prompt 175 adds the ninth required Prometheus alert rule `AcresWorkerDown`
  (`up{job="acres-worker"} == 0` for 1m, critical), closing the worker process availability
  alerting gap.
  Prompt 176 adds the tenth required Prometheus alert rule `PostgresDown`
  (`pg_up{job="acres-postgres"} == 0` for 1m, critical), closing the PostgreSQL server availability
  alerting gap.
  Prompt 177 adds the eleventh required Prometheus alert rule `PostgresExporterDown`
  (`up{job="acres-postgres"} == 0` for 1m, warning), closing the exporter availability and telemetry-self-health
  alerting gap.
  Prompt 178 adds database connection pool acquisition latency (p95 ≤ 50ms) and SQL query
  execution latency (p95 ≤ 100ms) evaluations to `scripts/ops/verify-capacity-load.js`, updates
  `scripts/ops/run-capacity-alerting-drill.sh` to capture structured `databaseTelemetryBaseline`
  in drill evidence, and expands unit tests (15/15 passed), formally closing the operator
  capacity baseline requirement. Operator launch sign-off remains open.
  Prompt 179 adds fail-closed database latency SLO validation (`max_database_acquisition_p95_latency_ms <= 50`,
  `max_database_query_p95_latency_ms <= 100`) and database baseline compliance/breach cross-validation
  to `scripts/ops/check-launch-readiness.js`, updates `infra/launch/readiness.example.json` and
  `scripts/ops/check-production-templates.sh`, and expands unit tests (27/27 passed). Operator launch sign-off remains open.
  Prompt 180 adds Panel 27 ("API In-Flight Active HTTP Requests", `acres_http_active_requests{job="acres-api"}`)
  and Panel 28 ("API HTTP 429 Rate Percentage", `acres_http_429_responses_total{job="acres-api"}`)
  to `infra/grafana/dashboards/acres-operations.json`, achieving 100% visual coverage of all 11 Prometheus alert
  rules in the Grafana operational dashboard. Extends `scripts/ops/check-production-templates.sh` and expands
  diagnostics unit tests (7/7 passed). Operator launch sign-off remains open.
  Prompt 181 reconciles all 11 incident response runbooks in `docs/launch-checklist.md` §5 with exact scoped PromQL
  expressions matching `infra/prometheus/alerts.yml` and adds explicit Grafana dashboard panel references across all
  runbooks. Adds `acres_postgres_pool_acquisition_duration_seconds` to `KNOWN_METRIC_IDENTIFIERS` in `scripts/ops/verify-alert-rules.js`
  (23/23 tests passed). Extends `scripts/ops/check-production-templates.sh` to enforce runbook PromQL and panel integrity.
  Operator launch sign-off remains open.
  Prompt 182 bubbles up `databaseTelemetryBaseline` and `summary.databaseBaselineCompliance` (alongside `alertVerification`
  and `dosResilience`) from stage 6 child capacity evidence into the Unified Launch Evidence Dossier in
  `scripts/ops/run-launch-drills.sh`. Hardens `checkEvidenceFile` in `scripts/ops/check-launch-readiness.js` to fail closed
  on dossier failed stages, stage failures, SLO/recovery compliance failures, and summary stage failures. Adds template integrity
  assertions in `scripts/ops/check-production-templates.sh` and expands test suites (`run-launch-drills.spec.js` 9/9 passed,
  `check-launch-readiness.spec.js` 30/30 passed). Operator launch sign-off remains open.
  Prompt 183 bubbles up `disasterRecoveryBaseline`, `summary.restoreCompliance`, and `summary.reconcileCompliance`
  from stage 7 child recovery evidence into the Unified Launch Evidence Dossier in `scripts/ops/run-launch-drills.sh`.
  Hardens `check-launch-readiness.js` to fail closed on Category 5 SLO floors/ceilings (availability >= 99.9%, max p95 <= 500ms,
  capacity >= 100 RPS) and Category 6 ceilings (RPO <= 1h, RTO <= 4h). Hardens `checkEvidenceFile` against restore drill
  RTO breaches/discrepancies, storage reconciliation error/missing/mismatched objects, and recovery baseline breaches.
  Adds template assertions in `scripts/ops/check-production-templates.sh` and expands test suites (`run-launch-drills.spec.js` 9/9 passed,
  `check-launch-readiness.spec.js` 36/36 passed). Operator launch sign-off remains open.
  Prompt 184 bubbles up `deploymentBaseline`, `secretRotationBaseline`, `summary.deploymentCompliance`,
  `summary.rollbackCompliance`, and `summary.secretRotationCompliance` from stage 3 and stage 5 child evidence into
  the Unified Launch Evidence Dossier in `scripts/ops/run-launch-drills.sh`. Hardens `checkEvidenceFile` in
  `scripts/ops/check-launch-readiness.js` against deployment drill failures, non-backward-compatible schema changes,
  rollback procedure failures, Caddy routing failures, network isolation failures, secret rotation failures, step errors,
  and secret leaks, as well as dossier deployment and secret rotation baseline breaches. Adds template assertions in
  `scripts/ops/check-production-templates.sh` and expands test suites (`run-launch-drills.spec.js` 9/9 passed,
  `check-launch-readiness.spec.js` 40/40 passed). Operator launch sign-off remains open.
  Prompt 185 adds `--output <file>` option to `scripts/ops/verify-volume-encryption.js`, updates
  stage 4 of `scripts/ops/run-launch-drills.sh` to emit child evidence (`volume-encryption-evidence-<timestamp>.json`),
  and bubbles up `volumeEncryptionBaseline` and `summary.volumeEncryptionCompliance` into the Unified Launch
  Evidence Dossier. Hardens `checkEvidenceFile` in `scripts/ops/check-launch-readiness.js` against volume encryption
  verification failures, invalid configurations, errors, Key Separation Invariant violations, detected keyfiles in mounts
  or Git tracking, and stateful storage mount failures, as well as dossier volume encryption baseline breaches and
  compliance failures. Adds template assertions in `scripts/ops/check-production-templates.sh` and expands test suites
  (`verify-volume-encryption.spec.js` 16/16 passed, `run-launch-drills.spec.js` 9/9 passed,
  `check-launch-readiness.spec.js` 43/43 passed). Operator launch sign-off remains open.
  Prompt 186 attaches `licenseCompliance` to `bom` in `scripts/ops/generate-sbom.js` when `--verify-licenses`
  and `--output` are combined, adds `--output <file>` option to `scripts/ops/run-sast-scan.js` and
  `scripts/ops/verify-container-security.js`, updates stage 2 of `scripts/ops/run-launch-drills.sh` to emit child
  evidence (`sbom-inventory-<timestamp>.json`, `sast-scan-evidence-<timestamp>.json`, and
  `container-security-evidence-<timestamp>.json`), and bubbles up `supplyChainBaseline` and compliance summaries
  (`summary.supplyChainCompliance`, `summary.sastCompliance`, `summary.containerSecurityCompliance`) into the Unified
  Launch Evidence Dossier. Hardens `checkEvidenceFile` in `scripts/ops/check-launch-readiness.js` against SAST, SBOM,
  and container security verification failures, active unreviewed blockers, expired suppressions, license violations,
  and failed checks, as well as dossier supply chain baseline breaches and compliance failures. Adds template assertions
  in `scripts/ops/check-production-templates.sh` and expands test suites (`generate-sbom.spec.js` 8/8 passed,
  `run-sast-scan.spec.js` 14/14 passed, `verify-container-security.spec.js` 11/11 passed, `run-launch-drills.spec.js` 9/9 passed,
  `check-launch-readiness.spec.js` 49/49 passed). Operator launch sign-off remains open.
- **Multi-Layer DoS & Rate Limiting Resilience Drill (TM-05, TM-20)**:
  - `scripts/ops/run-dos-resilience-drill.sh`: automated drill asserting 5 defense-in-depth protection layers (Caddy body size ceiling and timeouts, NestJS `@StrictThrottle` 10 req/min fail-closed HTTP 429 with probe `@SkipThrottle` starvation defense, GraphQL 12KB/depth/alias/cost bounds, storage 50MB/quarantine limits, and constant-time bcrypt verification);
  - Emits structured JSON audit evidence reports (`backups/dos-resilience-evidence-<timestamp>.json`).
- **Top-Level Capacity & Alerting Drill Runner**:
  - `scripts/ops/run-capacity-alerting-drill.sh`: executes alert simulation, capacity evaluation, and DoS drill, emitting unified JSON evidence (`backups/capacity-alerting-drill-evidence-<timestamp>.json`).
- **Operations & CI Integration**:
  - Root package scripts: `npm run ops:capacity-test`, `npm run ops:capacity-drill`, `npm run ops:alert-test`, `npm run ops:alert-drill`, `npm run ops:dos-drill`, `npm run ops:capacity-alerting-drill`;
  - Integrated `npm run ops:capacity-test` and `npm run ops:alert-test` into `npm run ops:check`;
  - Updated `scripts/ops/check-production-templates.sh` requiring all 11 alerts and alert/capacity checks;
  - Closes TM-05, TM-16, TM-20, and Category 5 launch readiness requirements.

## 22. Phase 12K verification record — 2026-09-09

**Prompt 236 deployment evidence separation (2026-09-30):** Category 10 requires
strictly validated live production operator evidence with eight independent
observation pointers and source/current/previous image identity bound to the
approved release. The existing producer always emits simulation; Stage 3 and
dossier baselines remain configuration preflight/rehearsal even when targeted
health probes pass. Malformed/failed children or unrelated live receipts block
beside matching evidence. Fixed Category 10 file diagnostics suppress private
paths/errors and nested formatting exceptions. Legacy reports need regeneration
or separate inspected live receipts; no automatic relabeling. Parent schema,
assembler and live-ingress target binding are unchanged. Contract/check results
are in `docs/operations.md` prompt 236. No promotion, rollback, drain or launch
approval ran; prompt 201 and Phase 12 remain open.

**Prompt 235 rotation evidence separation (2026-09-30):** Category 3 now requires
an explicit live operator child receipt with production/authorization/operator
references, seven credential-class confirmations and seven step source pointers.
Every referenced child must pass strict structural validation. The existing
runner always emits simulation; Stage 5 remains rehearsal and the parent schema
and assembler baseline are unchanged. Legacy unclassified reports need
regeneration or separate inspected live evidence, never automatic relabeling.
Private Category 3 file diagnostics are suppressed, including malformed nested
values that throw during formatting. Full contract and check results are in
`docs/operations.md` prompt 235. No production rotation or launch approval ran;
prompt 201 and Phase 12 remain open.

**Prompt 234 producer-aligned readiness (2026-09-30):** Category 5 now validates
actual alert identities/counts/evaluations and measured capacity distributions,
recomputes SLOs against child and approved policy, requires bound live database
and full DoS evidence for production, and keeps synthetic structural rehearsal
separate. Private child diagnostics are excluded from Category 5 blockers. Review
found the prompt's incorrect assumption that API `href` and `origin` hashes were
equal; the user approved the parent origin-hash correction, with its dependent
capacity-specific dossier comparison and regressions. Old live hash receipts and
fictional/success-only reports require regeneration. Readiness passed 161/161,
capacity-parent 16/16, launch-drill 57/57 and the final targeted live regression
1/1. Root lint/typecheck/build, local gates, format and diff checks passed;
`ops:check` passed after the user authorized the disclosed registry audit retry
(0 critical, 21 reported moderate/high vulnerabilities). The example remains
0 approved, 11 blocked, 70 blockers. No live operation or production approval
occurred; prompt 201 and Phase 12 remain open. Full evidence is recorded in
`docs/operations.md` prompt 234 and Category 5 in `docs/launch-checklist.md`.

**Prompt 204 structural record schema (2026-09-26):** The readiness example's
local `$schema` now resolves to a Draft 7 schema covering all eleven launch
categories, twelve secret references, eight retention policies, and the
release object. A focused Ajv check runs in `ops:check`. It validates record
shape only; the existing readiness validator and operator sign-off remain the
Phase 12 exit gate. Review found and corrected fractional numeric fields that
the executable validator permits. Focused schema check, 103/103 readiness
tests, `ops:templates`, `ops:check`, lint, typecheck, build, and diff whitespace
check passed. The example still has 0/11 approved categories and 70 blockers.
Prompt 201 remains open.

**Prompt 203 preflight (2026-09-26):** At 2026-09-26T19:39:25Z UTC, against
source commit `3da8949`, the checked-in readiness example failed closed as
intended: 0/11 categories approved, 11 unresolved, 70 validator blockers
(exit 1). `docs/launch-checklist.md` §6A records each missing operator value,
child artifact, live source, owner and safe next action, plus the shared target,
evidence-store and authorization prerequisites. This was a repository-only
assessment; no production source or approval was inspected. Prompt 201 and the
Phase 12 launch sign-off remain open.

**Prompt 202 verification (2026-09-26):** The unified drill now forwards
materialized Caddy/Compose paths and live benchmark/API targets as argument
vectors, labels every dossier as a drill, and binds Stage 3/6 verdicts to
validated child reports. Stage 6 no longer fabricates passing live PostgreSQL
telemetry; a fresh, target-bound operator evidence file is required. The
offline synthetic path remains deterministic for CI. The operator invocation,
evidence schema, and remaining human gates are recorded in
`docs/launch-checklist.md` §4 and `docs/operations.md` Phase 12K. Prompt 201
continues to govern separate production sign-off.
Verification: `ops:check` passed with 12/12 launch tests; the final focused
launch suite passed 13/13 after adding the default-drill regression; helper tests
passed 5/5; lint, typecheck, build, Bash syntax, and `git diff --check` passed.
The deliberately missing-telemetry loopback run failed closed. Live operator
targets and all eleven category approvals remain unverified.

Records the Phase 12 exit gate: unified launch drill runner, operator launch
checklist with incident runbooks, and readiness evidence cross-validation.

- **Unified Launch Drill Orchestrator**:
  - `scripts/ops/run-launch-drills.sh` (bash): 7 stages (static templates, supply-chain
    SAST, ingress/deployment, volume encryption, secret rotation pinned
    `--dry-run`, capacity alerting, disaster recovery) with
    `--dry-run/--json/--output/--evidence-dir/--verbose/--help`, per-stage logs
    plus discovered child evidence in dossier `artifacts`, Unified Launch
    Evidence Dossier (`backups/launch-evidence-dossier-<timestamp>.json`),
    exit 0 only on 7/7 pass;
  - `scripts/ops/run-launch-drills.spec.js`: exit 0; all 9 unit tests passed.
- **Operator Launch Checklist & Runbooks (`docs/launch-checklist.md`)**:
  - 11-category verification matrix, 11 Prometheus alert runbooks, rollback/DR
    procedures, formal sign-off matrix; indexed in `AGENTS.md`.
- **Readiness Evidence Cross-Validation**:
  - `scripts/ops/check-launch-readiness.js`: approved sections referencing
    `backups/*.json` evidence must resolve to files that exist, parse, and do
    not report failure (cwd-first, then readiness-file-dir resolution);
  - `scripts/ops/check-launch-readiness.spec.js`: exit 0; all 19 unit tests passed.
- **Operations & CI Integration**:
  - Root package scripts: `npm run ops:launch-drill`, `npm run ops:launch-drill-test`;
  - Integrated `npm run ops:launch-drill-test` into `npm run ops:check`;
  - `scripts/ops/launch-readiness.sh` supports `--with-drills` and `--help`.
- **Exit**: operator-approved launch checklist; reproducible promotion and
  rollback drill; restore drill within objectives (stage 7 fails closed without
  PGPASSWORD + reachable Postgres/Garage); actionable alerts/runbooks; no
  unresolved critical security/accessibility findings; all repository,
  integration, E2E, isolation, and failure tests passing.

**Prompt 187 verification (2026-09-25):** Stage 1 now produces atomic,
structured evidence for all three fixed static checks, including individual
exit codes and a generic spawn-failure marker. The dossier derives
`staticIntegrityBaseline` and `summary.staticIntegrityCompliance` from that
child artifact, while preserving `summary.staticIntegrity`. Readiness
validation rejects malformed static child evidence and breached dossier
fields. Runner tests passed 8/8, launch drill tests 9/9, and readiness tests
51/51; `ops:templates`, `ops:scan-secrets`, `ops:docker-runtime`, `ops:check`,
lint, typecheck, build, and diff checks passed. Operator launch approval and
the stage 7 live infrastructure drill remain outstanding.

**Prompt 188 verification (2026-09-25):** Category 6 now parses a narrow UTC
every-hour cron subset and rejects unsupported syntax or a maximum scheduled
start gap greater than the declared RPO. The example and approved fixture use
`0 * * * *` for a one-hour RPO, and template validation applies the same parser.
The readiness suite passed 53/53 tests; `ops:templates`, `ops:check`, lint,
typecheck, build, and `git diff --check` passed. The checked-in unresolved
example still failed closed (0 approved categories, 11 blocked, 70 blockers).
This static check does not prove backup completion, encrypted off-host transfer,
PostgreSQL and Garage coverage, freshness, or a restore under load. Operator
launch approval and the live infrastructure drill remain outstanding.

**Prompt 189 verification (2026-09-25):** Approved Category 6 records now
require a referenced restore child JSON report with a strict, nonfuture basic
UTC `drill_timestamp`, exact successful status and RTO/parity/PostGIS/foreign-key
flags, equal nonnegative integer source/restored table and migration counts,
positive integer archive bytes, and finite nonnegative duration. The declared
`restore_drill_date` must be a real, nonfuture UTC date (`YYYY-MM-DD` or
`YYYY-MM-DDTHH:mm:ssZ`) matching the latest valid referenced report. Every
referenced restore report is checked, including custom paths and wildcard
matches; a malformed or failed report blocks even beside a valid one. The
readiness suite passed 57/57, `ops:templates`, `ops:check`, lint, typecheck,
build, and `git diff --check` passed. The unresolved example still failed
closed (0 approved categories, 11 blocked, 70 blockers). This checks report
consistency with the operator record, not archive provenance, off-host
transfer, Garage coverage, achieved RPO, or a restore under production load.

**Prompt 190 verification (2026-09-25):** Approved Category 6 records now
require a concrete reconciliation child JSON report in `evidence` alongside
the restore child report and the `db_object_reconciliation_tested: true`
declaration. Content at a custom path qualifies; a filename, prose, or unified
dossier alone does not. Every referenced candidate, including wildcard matches,
must have a real nonfuture ISO UTC timestamp, all eight producer summary counts
as nonnegative safe integers, four arrays with matching counts, zero missing
and mismatched objects, exit code 0, and a status consistent with the orphan
count (`clean` or `warning`). A malformed or failed child blocks approval even
beside a valid one; a warning with orphans remains operator visible. The
readiness suite passed 61/61 and reconciliation producer suite passed 10/10;
`ops:templates` reported `ops template check passed`, `ops:check` exited 0,
lint, typecheck, build, and `git diff --check` passed. The unresolved example
still failed closed (0 approved categories, 11 blocked, 70 blockers). Report
consistency does not prove provenance or production scope: the operator still
must verify the target PostgreSQL/Garage instances, tenant/bucket/prefix scope,
backup transfer and freshness, zero-object results, warning orphans, and
representative restore load before approving launch.

**Prompt 191 verification (2026-09-25):** Approved Category 8 records now
require a concrete volume encryption child JSON report in `evidence` alongside
the `key_separation_confirmed: true` declaration and encrypted mount paths.
Content at a custom path qualifies by report structure and content; a declaration,
prose, filename alone, or the unified dossier does not. The validator requires
a real, nonfuture ISO UTC `timestamp`, `status: "success"`, `valid: true`, empty
`errors` array, `keySeparation.verified: true`, empty `keySeparation.detectedViolations`
array, and an `evaluatedMounts` array containing all items with `passed: true`
covering at least 3 stateful mounts (PostgreSQL, Valkey, Garage). If total/valid
mount counts are declared, they must be equal positive integers. Every referenced
child report, including wildcard matches, must pass; a malformed or failed report
blocks even beside a valid one. The readiness suite passed 64/64 and volume drill
suite passed 17/17; `ops:templates` reported `ops template check passed`, `ops:check`
exited 0, lint, typecheck, build, and `git diff --check` passed cleanly. The
unresolved example still failed closed (0 approved categories, 11 blocked, 70 blockers).
Report consistency does not replace operator verification: the operator must still
inspect detached LUKS2 keyfiles or cloud KMS keys, confirm dual-custody parameters,
and physically audit production volume mounts before approving launch.

**Prompt 192 verification (2026-09-25):** Approved Category 3 records now
require a concrete secret rotation child JSON report in `evidence` alongside
the runtime injection mechanism, masking policy, compromise runbook reference,
and a rotation cadence not exceeding 90 days. Content at a custom path qualifies
by report structure and content; a declaration, prose, filename alone, or the
unified dossier does not. The validator requires a real, nonfuture UTC
`timestamp` (basic `YYYYMMDDTHHMMSSZ` or ISO 8601), `status: "success"`, empty
`errors` array, all 7 tested secret classes (`session_secret`, `csrf_secret`,
`postgres_passwords`, `valkey_password`, `storage_s3_keys`, `smtp_credentials`,
`grafana_admin_password`), and all 7 verified steps (`session_rollover`,
`csrf_rollover`, `database_rotation`, `valkey_rotation`, `storage_rotation`,
`compromise_response`, `redaction_audit`) reporting `status: "passed"` with
secret redaction audit confirmation (`raw_secrets_masked: true`,
`zero_dev_passwords_detected: true`). In addition, `rotation_cadence_days` is
validated as a positive number ≤ 90 days. Every referenced child report,
including wildcard matches, must pass; a malformed or failed report blocks even
beside a valid one. The readiness suite passed 70/70; `ops:templates` reported
`ops template check passed`, `ops:check` exited 0, lint, typecheck, build, and
`git diff --check` passed cleanly. The unresolved example still failed closed (0 approved categories, 11 blocked,
70 blockers). Report consistency does not replace operator verification: the
operator must still manage production secret stores (Vault/AWS SM/Infisical),
execute live zero-downtime rotations, and audit credentials out of band before
approving launch.

**Prompt 193 verification (2026-09-25):** Approved Category 10 records now
require a concrete deployment drill child JSON report in `evidence` or
`release.live_drill_evidence` alongside target host profile, image registry
path, deployment approver, rollback authority, image provenance policy, live drill
completion declaration, and an immutable release record. Content at a custom path
qualifies by report structure and content; a declaration, prose, filename alone,
or the unified dossier does not. The validator requires a real, nonfuture UTC
`timestamp` (basic `YYYYMMDDTHHMMSSZ` or ISO 8601), `status: "success"`,
`schema_backward_compatible: true`, `rollback_procedure_verified: true`,
`caddy_routing_verified: true`, integer `caddy_routes_tested >= 12`,
`security_headers_verified: true`, `s3_sigv4_host_preserved: true`,
`migrations_verified: true`, integer `migration_count >= 0`,
`operational_templates_verified: true`, `secrets_scan_verified: true`,
`readiness_probes_verified: true`, `network_isolation_verified: true`, and
matching `graceful_drain_periods_verified` (`caddy: '30s'`, `next: '30s'`,
`api: '45s'`, `worker: '60s'`). Every referenced child report, including wildcard
matches, must pass; a malformed or failed report blocks even beside a valid one.
The readiness suite passed 74/74; `ops:templates` reported `ops template check passed`,
`ops:check` exited 0, lint, typecheck, build, and `git diff --check` passed cleanly.
The unresolved example still failed closed (0 approved categories, 11 blocked,
70 blockers). Report consistency does not replace operator verification: the
operator must still manage production deployment targets, OCI registry credentials,
and execute live zero-downtime rollbacks before approving launch.

**Prompt 194 verification (2026-09-25):** Approved Category 5 records now
require a concrete capacity and alerting drill child JSON report in `evidence`
alongside declared SLO targets, alert recipients, defined thresholds, and escalation
runbook reference. Content at a custom path qualifies by report structure and content;
a declaration, prose, filename alone, or the unified dossier does not. The validator
requires a real, nonfuture UTC `timestamp` (basic `YYYYMMDDTHHMMSSZ` or ISO 8601),
`status: "success"`, empty `failures` array, all 4 summary compliance flags
(`alertVerification`, `capacitySloCompliance`, `dosResilience`, `databaseBaselineCompliance`)
reporting `"passed"`, `alerts.valid: true`, integer `ruleCount >= 11`, all simulations
reporting `passed: true`, empty `alerts.errors` array, `capacity.compliance.overallPassed: true`
with all individual compliance flags (`availabilityPassed`, `latencyPassed`, `throughputPassed`,
`databaseAcquisitionLatencyPassed`, `databaseQueryLatencyPassed`, `monotonicDbAcquisition`,
`monotonicDbQuery`) reporting `true`, `databaseTelemetryBaseline.status: "verified"` with
exporter/server reporting up, zero connection pool waiting requests, acquisition p95 ≤ 50ms,
query execution p95 ≤ 100ms, zero lock waits, and `dosResilience.status: "success"`.
Every referenced child report, including wildcard matches, must pass; a malformed or failed
report blocks even beside a valid one. The readiness suite passed 78/78; `ops:templates`
reported `ops template check passed`, `ops:check` exited 0, lint, typecheck, build, and
`git diff --check` passed cleanly. The unresolved example still failed closed (0 approved
categories, 11 blocked, 70 blockers). Report consistency does not replace operator verification:
the operator must still manage live Prometheus/Alertmanager endpoints, PagerDuty/on-call routing,
and active incident runbooks before approving launch.

**Prompt 195 verification (2026-09-25):** Approved Category 1 records now
require a concrete Caddy routing child JSON report in `evidence` alongside a
valid production FQDN, TLS contact email, explicit HSTS approval, and boolean
custom-certificate setting. The verifier emits `--output`/`--json` evidence,
and Stage 3 of the unified drill captures it. The validator checks a real,
nonfuture UTC timestamp, successful report type and status, empty errors,
active HSTS with a concrete positive `max-age` explicitly allowed by the
operator through `--allow-hsts`,
security/proxy/SigV4 headers, at least 12 fully passing routes with consistent
counts, and a domain matching the approved record. A report for
`Caddyfile.example` cannot authorize a production domain; failed or malformed
children block approval even beside a valid report. The targeted suites passed 112/112;
`ops:check` exited 0, lint, typecheck, build, and `git diff --check`
passed. The unresolved example still failed closed (0 approved categories,
11 blocked, 70 blockers). DNS records, live certificate issuance and TLS,
HSTS approval, and certificate recovery remain operator verification steps.

**Prompt 196 verification (2026-09-25):** Approved Category 2 now requires a
referenced SMTP delivery child JSON report with a real nonfuture UTC timestamp,
matching provider/host/port/TLS mode/sender, a delivered receipt identifier,
passing SPF/DKIM/DMARC printout references, and no errors. The approved SMTP
credential reference must equal the indirect secret reference. Every referenced
child must pass; a malformed or failed child blocks even beside a valid one.
The readiness suite passed 89/89; `ops:templates`, `ops:check`, lint, typecheck,
build, and `git diff --check` passed. The unresolved example remained blocked
(0 approved categories, 11 blocked, 70 blockers). Operator-owned live provider
and DNS proof remains required before launch sign-off.

**Prompt 197 verification (2026-09-25):** Approved Category 4 requires a
redacted secret-reference policy child JSON report with all twelve approved
indirect source references, `access_verified: true`, and
`plaintext_exposed: false`. Malformed, failed, mismatched, or unrelated JSON
evidence blocks approval even beside a valid child. The readiness suite passed
92/92; `ops:templates`, `ops:check`, lint, typecheck, build, and
`git diff --check` passed. The unresolved example remained blocked (0 approved
categories, 11 blocked, 70 blockers). Actual secret-store policy provenance
and least-privilege access remain operator-owned launch work.

**Prompt 198 verification (2026-09-25):** Approved Category 7 requires standard
retention window validation (quarantine 7d, rejected objects 1d, exports 30d,
telemetry 15d, backups 30d, positive day windows for accounts and audit logs,
and indefinite-or-positive-day duration for reports) and a concrete retention
policy review child JSON report with `drill_type: "data_retention_policy_verification"`,
nonfuture UTC timestamp, `status: "success"`, empty errors,
`scheduled_cleanup_verified: true`, and all eight matching policy windows with
`policy_verified: true`. Malformed, failed, mismatched, or unrelated JSON
evidence blocks approval even beside a valid child. The readiness suite passed
96/96; `ops:templates`, `ops:check`, lint, typecheck, build, and
`git diff --check` passed. The unresolved example remained blocked (0 approved
categories, 11 blocked, 70 blockers). Actual legal/operational retention sign-off
and automated purge verification remain operator-owned launch work.

**Prompt 199 verification (2026-09-26):** Approved Category 9 requires an
internally consistent GraphQL introspection route probe child JSON report with
`drill_type: "graphql_introspection_probe"`, nonfuture ISO UTC timestamp,
`status: "success"`, empty errors, valid GraphQL endpoint (`/graphql`),
`production_introspection_enabled` strictly matching the approved record, and a
`probe_result` object containing positive integer `status_code` (e.g. 400 when
disabled, 200 when enabled), matching `introspection_permitted`, `schema_exposed`
(`false` when disabled, `true` when enabled), and non-empty `response_summary`.
If `production_introspection_enabled: true`, non-empty `justification` without
placeholders is strictly enforced. Malformed, failed, mismatched, or unrelated
JSON evidence blocks approval even beside a valid child or in wildcard expansion.
The readiness suite passed 100/100; `ops:templates`, `ops:check`, lint,
typecheck, build, and `git diff --check` passed cleanly. The unresolved example
remained blocked (0 approved categories, 11 blocked, 70 blockers). Actual
production ingress probe execution and security audit remain operator-owned
launch work.

**Prompt 200 verification (2026-09-26):** Approved Category 11 now requires a
concrete `no_ai_production_posture_verification` child JSON report referenced in
`evidence`. It must describe the production environment, have a real nonfuture
UTC timestamp and successful status with no errors, and contain separate API and
worker runtime assertions (`ai_draft_enabled: false`,
`gemini_api_key_present: false`) with redacted inventory references. The
analytics/dashboard, governed-report, and export-download journeys must each
pass with a test-run reference, and unpaid-provider exclusion requires a policy
reference. The validator rejects missing, extra, malformed, failed, or
contradictory fields, prose/dossier-only evidence, and failed reports mixed
into wildcard matches. The readiness suite passed 103/103; `ops:templates`,
`ops:check`, lint, typecheck, build, and `git diff --check` passed. The
checked-in example still failed closed (0 approved categories, 11 blocked,
70 blockers). This child report records operator assertions and pointers;
production runtime inventory inspection, actual journey execution, policy
review, and launch sign-off remain operator-owned.

**Prompt 237 Phase 12K volume evidence separation (2026-09-30):** The existing
volume CLI now classifies every emitted receipt as simulation declaration/local
filename-scan preflight. Category 8 requires a separate live operator inspection
child bound to its approved mechanism, recovery owner and unordered concrete
root inventory. Both modes require exactly nine known service/container
identities, true assertions, consistent safe counts and canonical nonfuture UTC
dates. Live additionally requires production/operator/authorization references,
per-mount host paths/source pointers and exact host-encryption, key-separation,
dual-custody and tested-recovery observations. Every root covers a mount and
every mount lies within an approved root on directory boundaries; shared roots
remain permitted. Every live child must bind; malformed/failed children and
malformed/failed dossiers block even beside good evidence or in a glob.

The narrow Category 8 evidence boundary suppresses private paths/errors/scan
results/formatting exceptions. Stage 4 and existing dossier baseline/compliance
fields remain preflight; legacy modes need regeneration or independently
inspected live evidence, never relabeling. Scanner traversal/limitations and
unauthenticated provenance are documented in the current volume runbook and
Category 8 contract. Hermetic producer tests isolate the script's default roots,
scrub inherited environment and stub Git. No production mount, key retrieval,
recovery exercise or approval occurred; prompt 201 and Phase 12 remain open.

Verification output: `ops:volume-test` reported `tests 18`, `pass 18`, `fail 0`;
`ops:readiness-test` reported `tests 593`, `pass 593`, `fail 0`;
`ops:launch-drill-test` reported `tests 59`, `pass 59`, `fail 0`.
`ops:readiness-schema-test` in the full operations suite reported `tests 8`,
`pass 8`, `fail 0`; `ops:templates` printed `ops template check passed`.
`ops:check`, lint, typecheck and build exited 0. The existing dependency audit
printed `21 vulnerabilities (10 moderate, 11 high)` and `Production dependency
security audit passed (0 critical vulnerabilities)` under its current threshold;
no dependency changes were made. Initial sandbox child-process checks failed
with `EPERM`; permitted normal-execution reruns passed. Scoped Prettier checks
printed `Scoped Prettier checks passed (4 changed blocks and launch fixture)`;
changed JavaScript syntax, Bash syntax and `git diff --check` exited 0.
The unresolved example exited 1 and printed `Approved Categories: 0`,
`Unresolved / Blocked: 11`, `Total Blockers Detected: 70` and
`Result: FAIL-CLOSED`. The later narrow malformed-dossier check was covered by
an additional passing readiness rerun. These are repository/test results, not
production evidence or human sign-off.

Independent read-only review of the working-tree implementation and final
records against the approved prompt returned `No critical, important or minor
findings` and `Ready to commit: Yes`. Feedback was evaluated against the code,
contract and recorded checks; no fixes or follow-up review were required.

**Prompt 238 Phase 12K disaster recovery evidence separation (2026-10-01):** The existing
PostgreSQL restore drill runner (`run-restore-drill.sh`) and storage reconciliation utility
(`reconcile-storage-objects.js`) now classify every emitted receipt as rehearsal simulation
(`execution_mode: "simulation"`). Category 6 (`backup_and_disaster_recovery`) requires separately
inspected live operator child receipts (`execution_mode: "live"`) for both PostgreSQL restore
and storage reconciliation when approved. Live restore receipts must be bound to production
environment, operator reference, authorization reference, maintenance window reference, matching
drill date, and measured duration within declared RTO bounds. Live reconciliation receipts must
be bound to production environment, operator reference, authorization reference, and storage target
reference matching `expectedSection.backup_destination`.

Every referenced child report must pass strict structural validation; legacy unclassified receipts
fail closed. Category 6 enforces a safe diagnostic boundary suppressing private filesystem paths,
stack traces, and child error diagnostics, mapping failures to fixed blocker messages. Stage 7
in launch drills and dossier assembly summarizes drill rehearsal, not production sign-off.
Unresolved example readiness template failed closed with 0 approved categories, 11 blocked,
and 70 blockers. Verification output: `ops:restore-drill-test` (28/28), `ops:reconcile-test` (10/10),
`ops:launch-drill-test` (59/59), `ops:readiness-test` (596/596), `ops:readiness-schema-test` (8/8),
`ops:templates`, all 21 ops test suites, lint, typecheck, build, and `git diff --check` passed cleanly;
dependency audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j).
Independent read-only review feedback was addressed: restored ISO UTC timestamp support in
`validateRestoreReport`, enforced strict ISO UTC timestamps in `validateReconciliationReport`, aligned
required reference fields with the documentation, and verified date tracking across historical evidence.
No production restore or bucket modification was performed; operator sign-off remains open.

**Prompt 239 Phase 12K domain TLS evidence separation (2026-10-01):** The Caddy routing verifier
(`scripts/ops/verify-caddy-routing.js`) now classifies all emitted receipts as configuration simulation
preflight (`execution_mode: "simulation"`). Category 1 (`production_domain_tls`) in
`scripts/ops/check-launch-readiness.js` requires a separately inspected live operator child receipt
(`execution_mode: "live"`) when approved. Live receipts require `environment: "production"`, trimmed
non-empty opaque references (`operator_reference`, `authorization_reference`, `domain_reference`), structured
live observation objects (`dns_verification`, `tls_handshake_verification`, `https_headers_verification`),
matching domain, and verified HSTS state when HSTS approval is declared.

Unified dossiers are excluded from candidate evaluation (`isCaddyRoutingCandidate`), and disguised dossiers
fail validation. Every referenced child report must pass strict structural validation; valid simulations may
accompany live evidence, but any invalid or malformed child blocks approval even beside a valid one. Category 1
enforces a safe diagnostic boundary suppressing private filesystem paths, stack traces, and child error diagnostics,
mapping failures to `'A referenced Caddy routing report is invalid or failed'`. Stage 3 in dossier assembly
enforces `execution_mode === "simulation"`. Unresolved example readiness template failed closed with 0 approved
categories, 11 blocked, and 70 blockers. Verification output: `ops:caddy-test` (18/18), `ops:launch-drill-test`
(59/59), `ops:readiness-test` (598/598), `ops:readiness-schema-test` (8/8), `ops:templates`, all 21 ops test
suites, lint, typecheck, build, and `git diff --check` passed cleanly; dependency audit reports the existing
upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j). No production DNS or TLS modifications were performed;
operator sign-off remains open.

**Prompt 240 Phase 12K SMTP delivery evidence separation (2026-10-01):** Category 2
(`smtp_delivery`) in `scripts/ops/check-launch-readiness.js` now classifies configuration
and template verifications as simulation preflight (`execution_mode: "simulation"`) and
requires a separately inspected live operator child receipt (`execution_mode: "live"`)
when approved. Live receipts require `environment: "production"`, trimmed non-empty opaque
references (`operator_reference`, `authorization_reference`, `provider_reference`), structured
delivery verification object (`status: "delivered"`, opaque `receipt_id`, nonfuture ISO UTC
timestamp), and structured DNS authentication verification object (`checked_at`, passing `spf`,
`dkim`, and `dmarc` with record evidence references) matching the approved provider, host, port,
TLS mode, and from_address.

Unified dossiers are excluded from candidate evaluation (`isSmtpDeliveryCandidate`), and disguised
dossiers fail validation. Every referenced child report must pass strict structural validation;
valid simulations may accompany live evidence, but any invalid or malformed child blocks approval
even beside a valid one. Category 2 enforces a safe diagnostic boundary suppressing private
filesystem paths, stack traces, and child error diagnostics, mapping failures to
`'A referenced SMTP delivery report is invalid or failed'`. Unresolved example readiness template
failed closed with 0 approved categories, 11 blocked, and 70 blockers. Independent code review
feedback was addressed: guarded `validateSmtpDeliveryReport` against non-finite Date instances and
added explicit test coverage. Verification output: `ops:readiness-test` (599/599),
`ops:readiness-schema-test` (8/8), `ops:templates`, `ops:templates-test` (57/57), all 21 ops test
suites, lint, typecheck, build, and `git diff --check` passed cleanly; dependency audit reports
the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j). No live emails were transmitted
or DNS records modified; operator sign-off remains open.

**Prompt 241 Phase 12K secret-reference evidence separation (2026-10-01):** Category 4
(`secret_references`) in `scripts/ops/check-launch-readiness.js` now classifies configuration
and policy verifications as simulation preflight (`execution_mode: "simulation"`) and
requires a separately inspected live operator child receipt (`execution_mode: "live"`)
when approved. Live receipts require `environment: "production"`, trimmed non-empty opaque
references (`operator_reference`, `authorization_reference`, `policy_reference`), and
all twelve verified indirect secret references matching approved sources (`access_verified: true`,
`plaintext_exposed: false`).

Unified dossiers are excluded from candidate evaluation (`isSecretReferencePolicyCandidate`), and disguised
dossiers fail validation. Every referenced child report must pass strict structural validation;
valid simulations may accompany live evidence, but any invalid or malformed child blocks approval
even beside a valid one. Category 4 enforces a safe diagnostic boundary suppressing private
filesystem paths, stack traces, and child error diagnostics, mapping failures to
`'A referenced secret-reference policy report is invalid or failed'`. Unresolved example readiness template
failed closed with 0 approved categories, 11 blocked, and 70 blockers. Verification output:
`ops:readiness-test` (599/599), `ops:readiness-schema-test` (8/8), `ops:templates`, `ops:templates-test`
(57/57), all 21 ops test suites, lint, typecheck, build, and `git diff --check` passed cleanly; dependency audit
reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j). No secret store access was performed
or credentials modified; operator sign-off remains open.

**Prompt 242 Phase 12K data-retention evidence separation (2026-10-01):** Category 7
(`data_retention_policy`) in `scripts/ops/check-launch-readiness.js` now classifies configuration
and policy verifications as simulation preflight (`execution_mode: "simulation"`) and
requires a separately inspected live operator child receipt (`execution_mode: "live"`)
when approved. Live receipts require `environment: "production"`, trimmed non-empty opaque
references (`operator_reference`, `authorization_reference`, `policy_reference`), and
all eight verified retention windows matching approved values (`policy_verified: true`,
`scheduled_cleanup_verified: true`).

Unified dossiers are excluded from candidate evaluation (`isDataRetentionPolicyCandidate`), and disguised
dossiers fail validation. Every referenced child report must pass strict structural validation;
valid simulations may accompany live evidence, but any invalid or malformed child blocks approval
even beside a valid one. Category 7 enforces a safe diagnostic boundary suppressing private
filesystem paths, stack traces, and child error diagnostics, mapping failures to
`'A referenced data retention policy report is invalid or failed'`. Unresolved example readiness template
failed closed with 0 approved categories, 11 blocked, and 70 blockers. Independent code review
reported no findings and confirmed readiness to commit. Verification output:
`ops:readiness-test` (599/599), `ops:readiness-schema-test` (8/8), `ops:templates`, `ops:templates-test`
(57/57), all 21 ops test suites, lint, typecheck, build, and `git diff --check` passed cleanly; dependency audit
reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j). No production purge routines
were executed or database tables modified; operator sign-off remains open.

**Prompt 243 Phase 12K GraphQL introspection evidence separation (2026-10-01):** Category 9
(`graphql_introspection`) in `scripts/ops/check-launch-readiness.js` now classifies probe
and schema inspection verifications as simulation preflight (`execution_mode: "simulation"`) and
requires a separately inspected live operator child receipt (`execution_mode: "live"`)
when approved. Live receipts require `environment: "production"`, trimmed non-empty opaque
references (`operator_reference`, `authorization_reference`, `probe_reference`), and
confirmed probe results matching `production_introspection_enabled: false` (or explicitly approved posture),
`introspection_permitted: false`, `schema_exposed: false`, positive integer HTTP `status_code`,
and non-empty trimmed `response_summary` with zero placeholders or exposed secrets.

Unified dossiers are excluded from candidate evaluation (`isGraphqlIntrospectionCandidate`), and disguised
dossiers fail validation. Every referenced child report must pass strict structural validation;
valid simulations may accompany live evidence, but any invalid or malformed child blocks approval
even beside a valid one. Category 9 enforces a safe diagnostic boundary suppressing private
filesystem paths, stack traces, canary tokens, and child error diagnostics, mapping failures to
`'A referenced GraphQL introspection report is invalid or failed'`. Unresolved example readiness template
failed closed with 0 approved categories, 11 blocked, and 70 blockers. Independent code review
reported no findings and confirmed readiness to commit. Verification output:
`ops:readiness-test` (599/599), `ops:readiness-schema-test` (8/8), `ops:templates`, `ops:templates-test`
(57/57), all 21 ops test suites, lint, typecheck, build, and `git diff --check` passed cleanly; dependency audit
reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j). No live network probe was executed
or endpoint configuration modified; operator sign-off remains open.

**Prompt 244 Phase 12K optional AI posture evidence separation (2026-10-01):** Category 11
(`optional_ai_posture`) in `scripts/ops/check-launch-readiness.js` now classifies no-AI
posture verifications as simulation preflight (`execution_mode: "simulation"`) and
requires a separately inspected live operator child receipt (`execution_mode: "live"`)
when approved. Live receipts require `environment: "production"`, trimmed non-empty opaque
references (`operator_reference`, `authorization_reference`, `provider_policy_reference`),
and confirmed runtime inventory (`api` and `worker` with `ai_draft_enabled: false`,
`gemini_api_key_present: false`, non-empty trimmed `inventory_reference`) and deterministic
journey passes (`analytics_dashboard`, `governed_report`, `export_download` with `passed: true`,
non-empty trimmed `test_reference`).

Unified dossiers are excluded from candidate evaluation (`isNoAiPostureCandidate`), and disguised
dossiers fail validation. Every referenced child report must pass strict structural validation;
valid simulations may accompany live evidence, but any invalid or malformed child blocks approval
even beside a valid one. Category 11 enforces a safe diagnostic boundary in `checkEvidenceFile`
suppressing private filesystem paths, stack traces, and child error diagnostics, mapping failures to
`'A referenced no-AI production posture report is invalid or failed'`. Unresolved example readiness template
failed closed with 0 approved categories, 11 blocked, and 70 blockers. Independent code review
reported no findings and confirmed readiness to commit. Verification output:
`ops:readiness-test` (599/599), `ops:readiness-schema-test` (8/8), `ops:templates`, `ops:templates-test`
(57/57), all 21 ops test suites, lint, typecheck, build, and `git diff --check` passed cleanly; dependency audit
reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j). No production inventory or
keys were inspected live; operator sign-off remains open.

**Prompt 245 Phase 12K capacity and alerting evidence separation (2026-10-01):** Category 5
(`slo_and_alerting`) in `scripts/ops/check-launch-readiness.js` now classifies synthetic
and simulated capacity drill runs as simulation preflight (`execution_mode: "simulation"`,
`mode: "synthetic"`) and requires a separately inspected live operator child receipt
(`execution_mode: "live"`) when approved. Live receipts require `environment: "production"`,
trimmed non-empty opaque references (`operator_reference`, `authorization_reference`, and
`benchmark_reference` or `monitoring_reference` / `telemetry_reference`), and valid live
capacity distribution, alert rule evaluation, DoS resilience, and database telemetry baselines.

Unified dossiers are excluded from candidate evaluation (`isCapacityAlertingCandidate`), disguised
dossiers fail validation, and valid dossiers (`validCapacityDossier`) are safely recognized beside
child reports. Every referenced child report must pass strict structural validation; valid
simulations may accompany live evidence, but any invalid or malformed child blocks approval even
beside a valid one. Category 5 enforces a safe diagnostic boundary in `checkEvidenceFile`
suppressing private filesystem paths, stack traces, and child error diagnostics, mapping failures to
`'A referenced capacity and alerting report is invalid or failed'`. `scripts/ops/run-capacity-alerting-drill.sh`
now supports `--operator-reference`, `--authorization-reference`, and `--benchmark-reference` CLI
flags and env vars, emitting live receipts when bound to target URLs. Unresolved example readiness
template failed closed with 0 approved categories, 11 blocked, and 70 blockers. Verification output:
`ops:readiness-test` (603/603), `ops:capacity-alerting-test` (17/17), `ops:readiness-schema-test` (8/8),
`ops:templates`, `ops:templates-test` (57/57), all 21 ops test suites, lint, typecheck, build, and
`git diff --check` passed cleanly; dependency audit reports the existing upstream advisory on Next 16.3.4
(GHSA-vcvr-r3jv-pc5j). No production traffic was generated or telemetry scraped; operator sign-off remains open.

**Prompt 246 Phase 12K unify launch drill dossier simulation contracts (2026-10-01):**
Orchestrator-level simulation contracts and readiness recognition are now unified
across all drill stages and the published dossier. `scripts/ops/assemble-launch-dossier.js`
now validates `execution_mode: "simulation"` on Stage 3 (`ingress_deployment`), Stage 5
(`secret_rotation`), and Stage 6 (`capacity_alerting` during dry-run / synthetic preflight,
requiring `"live"` on target-bound runs). Emitted dossiers now declare root
`execution_mode: "simulation"` alongside `environment: "drill"`, and record explicit
`deploymentPreflight: "simulation"` and `rotationPreflight: "simulation"` in baseline
and summary blocks.

In `scripts/ops/check-launch-readiness.js`:
- Added `validSecretDossier(report, file)` helper checking `overall_status === 'PASSED'`,
  verified `secretRotationBaseline`, verified `supplyChainBaseline` (if present), and
  unbreached summary flags.
- Added `validDeploymentDossier(report, file)` helper checking `overall_status === 'PASSED'`,
  verified `deploymentBaseline`, and unbreached summary flags.
- `checkEvidenceFileContents` for `deployment_and_rollback` and `secrets_management`
  safely recognizes valid drill dossiers accompanying live operator receipts without
  generating false-positive blockers, while strictly failing closed on invalid or breached
  dossiers.
- Child candidates are excluded from dossier recognition; a dossier alone never satisfies
  launch readiness for Category 3 or Category 10 without live operator receipts.

Verification output: `ops:launch-drill-test` (68/68), `ops:readiness-test` (607/607),
`ops:readiness-schema-test` (8/8), `ops:templates` and `ops:templates-test` (57/57),
all 21 ops test suites, lint, typecheck, build, and `git diff --check` passed cleanly;
dependency audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j).
Unresolved example readiness template failed closed (0 approved categories, 11 blocked, 70 blockers).
Drill rehearsal remains simulation preflight; operator sign-off remains open.

**Prompt 247 Phase 12K enforce policy and posture evidence candidate contracts (2026-10-02):**
Closed the evidence candidate evaluation gap across the four non-drill policy and posture categories
in `scripts/ops/check-launch-readiness.js`:
- `secret_references` (`isSecretReferencePolicyCandidate`)
- `data_retention_policy` (`isDataRetentionPolicyCandidate`)
- `graphql_introspection` (`isGraphqlIntrospectionCandidate`)
- `optional_ai_posture` (`isNoAiPostureCandidate`)

In `checkEvidenceFileContents` (`scripts/ops/check-launch-readiness.js`), each of these four categories
now explicitly evaluates candidate eligibility, matching the pattern established for `smtp_delivery`:
- If an evidence file is not a candidate (e.g. non-object, array, disguised dossier with `stages` or
  `dossier_version`), `checkEvidenceFileContents` immediately fails closed with the category-specific
  invalid/failed blocker (`'A referenced secret-reference policy report is invalid or failed'`,
  `'A referenced data retention policy report is invalid or failed'`,
  `'A referenced GraphQL introspection report is invalid or failed'`, or
  `'A referenced no-AI production posture report is invalid or failed'`).
- Referencing a disguised dossier or non-candidate JSON report beside a valid live receipt
  (`[good, disguisedDossier]`) now strictly fails closed instead of bypassing candidate exclusion.
- Referencing only a disguised dossier produces both the required child report blocker and the
  invalid/failed report blocker.

Verification output: `ops:readiness-test` (607/607), `ops:launch-drill-test` (68/68),
`ops:readiness-schema-test` (8/8), `ops:templates` and `ops:templates-test` (57/57),
all 21 ops test suites, lint, typecheck, build, and `git diff --check` passed cleanly;
dependency audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j).
Unresolved example readiness template failed closed (0 approved categories, 11 blocked, 70 blockers).
Operator sign-off remains open.

**Prompt 248 Phase 12K unify drill dossier and candidate contracts for volume, recovery, and TLS (2026-10-02):**
Unified dossier recognition, candidate filtering, and safe fall-through semantics in `scripts/ops/check-launch-readiness.js`
across Category 8 (`volume_encryption`), Category 6 (`backup_and_disaster_recovery`), and Category 1 (`production_domain_tls`):
- Hardened `validVolumeDossier(report, file)` to reject child report files (`volume-encryption*`), non-object/array reports,
  and unverified baseline contracts.
- Hardened `validRecoveryDossier(report, file)` to reject child report files (`restore-drill*`, `reconcil*`), non-object/array
  reports, and unverified baseline contracts.
- Hardened `validCaddyDossier(report, file)` to reject dossiers reporting `staticIntegrity: 'failed'` or
  `staticIntegrityCompliance: 'failed'`.
- In `checkEvidenceFileContents`:
  - Categories 1, 6, and 8 now evaluate candidate child contracts first; candidates defer full evaluation to approval time.
  - Non-candidates are evaluated against hardened dossier contracts (`validVolumeDossier`, `validRecoveryDossier`, `validCaddyDossier`).
  - When non-candidate evaluation fails, category-specific invalid/failed blockers are immediately emitted.
  - Explicit `continue;` statements prevent unintended fall-through to generic parser logic across all three categories.
- Exported `validVolumeDossier`, `validRecoveryDossier`, and `validCaddyDossier` in `module.exports`.
- Added contract tests in `scripts/ops/check-launch-readiness.spec.js` covering valid dossier acceptance beside live receipts,
  rejection of failing/disguised dossiers, and child filename rejection.

Verification output: `ops:readiness-test` (611/611), `ops:launch-drill-test` (68/68), `ops:readiness-schema-test` (8/8),
`ops:templates` and `ops:templates-test` (57/57), lint, typecheck, build, and `git diff --check` passed cleanly; dependency
audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j). Unresolved example readiness template failed
closed (0 approved categories, 11 blocked, 70 blockers). Operator sign-off remains open.

**Prompt 249 Phase 12K unify capacity, deployment, and supply chain dossier and candidate contracts (2026-10-02):**
Unified dossier recognition, candidate filtering, and supply chain evidence handling in `scripts/ops/check-launch-readiness.js`
across Category 5 (`slo_and_alerting`), Category 10 (`deployment_and_rollback`), and Category 3 (`secrets_management`):
- Hardened `validCapacityDossier(report, file)` to accept `file`, reject child report files (`capacity-alerting*`),
  non-object/array reports, evaluate `databaseTelemetryBaseline` with `status: "verified"` (aligning with
  `scripts/ops/assemble-launch-dossier.js`), and check unbreached summary fields (`capacityAlerting`, `capacityPreflight`,
  `sloCompliance`, `alertVerification`, `dosResilience`, `databaseBaselineCompliance`).
- In `isCapacityAlertingCandidate`, excluded dossiers with `databaseTelemetryBaseline` and summary flags from child candidacy.
- In `checkEvidenceFileContents`:
  - Category 5 (`slo_and_alerting`) now passes `(parsed, file)` to `validCapacityDossier`.
  - Category 3 (`secrets_management`) encapsulates supply chain child evidence verification (`validateSupplyChainEvidence`)
    covering SAST, SBOM, and container security, and cleanly terminates with `continue;`, eliminating fall-through to
    unrelated drill checks.
  - All eleven categories in `checkEvidenceFileContents` now cleanly terminate with `continue;`.
- Extended `scripts/ops/check-launch-readiness.spec.js` with comprehensive contract tests for `validCapacityDossier`
  and Category 5 integration tests validating dossier acceptance alongside live receipts and rejection of failing/disguised
  dossiers.

Verification output: `ops:readiness-test` (613/613), `ops:launch-drill-test` (68/68), `ops:readiness-schema-test` (8/8),
`ops:templates` and `ops:templates-test` (57/57), lint, typecheck, build, and `git diff --check` passed cleanly; dependency
audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j). Unresolved example readiness template failed
closed (0 approved categories, 11 blocked, 70 blockers). Operator sign-off remains open.

**Prompt 250 Phase 12K consolidate readiness evidence boundaries and eliminate legacy dead code (2026-10-02):**
Consolidated evidence validation boundary contracts and eliminated over 520 lines of legacy unreachable dead code in `scripts/ops/check-launch-readiness.js`:
- In `checkEvidenceFile`, replaced duplicate hardcoded array literal with canonical `REQUIRED_SECTIONS.includes(category)`.
- In `checkEvidenceFileContents`, verified that all 11 checklist categories (`volume_encryption`, `backup_and_disaster_recovery`, `production_domain_tls`, `smtp_delivery`, `slo_and_alerting`, `secrets_management`, `deployment_and_rollback`, `secret_references`, `data_retention_policy`, `graphql_introspection`, and `optional_ai_posture`) cleanly terminate with `continue;`.
- Removed lines 2543–3067 of dead code (shadowed generic status/overall_status checks, failed_stages, stages iteration, and old drill/dossier check fragments superseded by Prompts 235–249).
- Added explicit fail-closed rejection for unrecognized checklist categories in `checkEvidenceFileContents`.
- Exported `checkEvidenceFile` and `checkEvidenceFileContents` in `module.exports`.
- Extended `scripts/ops/check-launch-readiness.spec.js` with unit tests for canonical `REQUIRED_SECTIONS` coverage and fail-closed rejection of unrecognized categories.

Verification output: `ops:readiness-test` (614/614), `ops:launch-drill-test` (68/68), `ops:readiness-schema-test` (8/8),
`ops:templates` and `ops:templates-test` (57/57), lint, typecheck, build, and `git diff --check` passed cleanly; dependency
audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j). Unresolved example readiness template failed
closed (0 approved categories, 11 blocked, 70 blockers). Operator sign-off remains open.

**Prompt 251 Phase 12K export and test supply chain and static evidence contracts (2026-10-02):**
Relocated misplaced Caddy routing helpers, exported internal evidence validation helpers, and added dedicated contract tests in `scripts/ops/check-launch-readiness.js`:
- Relocated `validCaddyDossier` and `validCaddyStaticEvidence` from the disaster recovery section down to the Caddy routing section (directly preceding `isSmtpDeliveryCandidate`), consolidating Caddy helpers together and restoring disaster recovery helper contiguity.
- Exported `validCaddyStaticEvidence`, `isSastEvidence`, `isSbomEvidence`, `isContainerSecurityEvidence`, and `validateSupplyChainEvidence` in `module.exports`.
- Extended `scripts/ops/check-launch-readiness.spec.js` with comprehensive contract and unit test suites:
  - `validCaddyStaticEvidence`: validates passing static integrity reports, and rejects missing/null reports, non-objects, non-array stages, failed status, and failed stages.
  - Supply chain candidate discrimination helpers (`isSastEvidence`, `isSbomEvidence`, `isContainerSecurityEvidence`): verifies positive identification of drill types and tool/scan indicators, and negative discrimination against unrelated payloads or missing fields.
  - `validateSupplyChainEvidence`: tests rejection of non-object/array reports, status/overall_status failures, non-zero exit codes, missing scan components, failed/unhealthy SAST scans, non-compliant SBOM dependencies, and non-compliant container security findings, alongside complete passing supply chain reports.

Verification output: `ops:readiness-test` (617/617), `ops:launch-drill-test` (68/68), `ops:readiness-schema-test` (8/8),
`ops:templates` and `ops:templates-test` (57/57), lint, typecheck, build, and `git diff --check` passed cleanly; dependency
audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j). Unresolved example readiness template failed
closed (0 approved categories, 11 blocked, 70 blockers). Operator sign-off remains open.

**Prompt 252 Phase 12K unify deployment evidence contracts and export validation helpers (2026-10-02):**
Unified deployment release provenance evidence evaluation, defaulted base directory resolution, exported validation helpers, and added dedicated contract tests in `scripts/ops/check-launch-readiness.js`:
- In `expandEvidenceGlob` and `checkEvidenceFileContents`, defaulted `baseDirs` to `[process.cwd()]`, ensuring robust standalone execution and testability without requiring explicit directory context.
- Hardened Category 10 (`deployment_and_rollback`) evidence evaluation in `checkEvidenceFileContents`: candidate child drills defer to approval validation, recognized launch dossiers are validated via `validDeploymentDossier`, and local JSON release provenance receipts are strictly validated (requiring string `status === 'success'`, non-failing `overall_status`, `success !== false`, and zero errors across array and singular error fields), failing closed with `'A referenced deployment drill report is invalid or failed'` if any failure condition is present.
- Exported core validation helpers in `module.exports`: `validDeploymentRelease`, `parseDeploymentDrillTimestamp`, `validRecoveryReference`, `validVolumeReference`, and `validDomainTlsReference`.
- Extended `scripts/ops/check-launch-readiness.spec.js` with comprehensive contract and unit test suites:
  - `validDeploymentRelease`: validates passing releases with 40-char hex commit SHA and distinct pinned digests, and tests rejection of malformed commits, missing/malformed current/previous objects, identical current/previous releases, identical client/server roles, unpinned images, and extra keys when `exact: true`.
  - `parseDeploymentDrillTimestamp`: tests parsing of basic compact UTC timestamps and ISO 8601 UTC timestamps (with and without millis), and rejection of invalid formats, non-strings, and non-UTC dates.
  - Reference helpers (`validRecoveryReference`, `validVolumeReference`, `validDomainTlsReference`): tests acceptance of clean opaque string references, and rejection of empty/whitespace strings, newlines, control characters, and placeholders (`change-me`, `__REQUIRED_*__`, `<REQUIRED_*>`).
  - Category 10 evidence discrimination: tests rejection of non-candidates with failed status, truthy errors, or singular error fields, and verifies fail-closed rejection when a failing non-candidate accompanies a live child receipt.

Verification output: `ops:readiness-test` (621/621), `ops:launch-drill-test` (68/68), `ops:readiness-schema-test` (8/8),
`ops:templates` and `ops:templates-test` (57/57), lint, typecheck, build, and `git diff --check` passed cleanly; dependency
audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j). Unresolved example readiness template failed
closed (0 approved categories, 11 blocked, 70 blockers). Operator sign-off remains open.

**Prompt 253 Phase 12K export and test evidence glob, timestamp, and reference validation helpers (2026-10-02):**
Exported all remaining internal evidence helpers and constants, added defensive parameter guards, and established comprehensive unit and contract test coverage in `scripts/ops/check-launch-readiness.js`:
- In `expandEvidenceGlob`, added defensive check `if (typeof ref !== 'string' || ref.length === 0) return [];` preventing `TypeError` on non-string inputs.
- In `parseUtcDate`, added defensive check `if (typeof value !== 'string') return null;` ensuring type safety for non-string values.
- Exported all internal helper functions and constants in `module.exports`: `isEvidenceFileReference`, `expandEvidenceGlob`, `parseUtcDate`, `parseRestoreTimestamp`, `parseSecretRotationTimestamp`, `parseSmtpTimestamp`, `validVolumePath`, `validVolumePaths`, `validVolumeSection`, `isRotationReference`, `validSmtpText`, `validSmtpEmail`, `validSmtpSecretReference`, `isValidGraphqlEndpoint`, `hasExactKeys`, `DEPLOYMENT_OBSERVATIONS`, and `NO_AI_JOURNEYS`.
- Extended `scripts/ops/check-launch-readiness.spec.js` with comprehensive unit test suites:
  - `isEvidenceFileReference`: tests acceptance of `.json` and wildcard `*...json` references, and rejection of non-strings, whitespace, and non-JSON extensions.
  - `expandEvidenceGlob`: tests exact matches, single-`*` expansions, non-existent directories, non-string/empty inputs, and rejection of multiple-`*` wildcards.
  - Timestamp parsers (`parseUtcDate`, `parseRestoreTimestamp`, `parseSecretRotationTimestamp`, `parseSmtpTimestamp`): tests compact basic UTC and ISO 8601 UTC (with and without millis), invalid dates, non-UTC offsets, and strict ISO requirement on SMTP timestamps.
  - Volume validation helpers (`validVolumePath`, `validVolumePaths`, `validVolumeSection`): tests path format, path traversal/relative segments, whitespace padding, duplicate paths, minimum 3 paths requirement, approved encryption mechanisms, and recovery owner validation.
  - Reference and transport helpers (`isRotationReference`, `validSmtpText`, `validSmtpEmail`, `validSmtpSecretReference`): tests trimmed string formatting, control character rejection, email syntax and domain dots, and indirect secret reference formats (`env:`, `vault:`, `aws-sm:`, `file:`).
  - Endpoint, schema shape, and constants: tests `/graphql` path and URL validation, exact key checking, and canonical contents of `DEPLOYMENT_OBSERVATIONS` and `NO_AI_JOURNEYS`.

Verification output: `ops:readiness-test` (627/627), `ops:launch-drill-test` (68/68), `ops:readiness-schema-test` (8/8),
`ops:templates` and `ops:templates-test` (57/57), lint, typecheck, build, and `git diff --check` passed cleanly; dependency
audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j). Unresolved example readiness template failed
closed (0 approved categories, 11 blocked, 70 blockers). Operator sign-off remains open.

**Prompt 254 Phase 12K modularize and test category readiness section validators (2026-10-03):**
Decomposed the ~770-line inline category-validation block inside `validateReadiness()` into 4 discrete format helpers and 11 dedicated, exported category section validators with 100% behavioral parity:
- Extracted format helpers in `scripts/ops/check-launch-readiness.js`: `isValidFqdn`, `isValidTlsContactEmail`, `isValidReleaseCommitSha`, and `isValidImageRegistryPath`.
- Extracted 11 category section validators: `validateProductionDomainTlsSection`, `validateSmtpDeliverySection`, `validateSecretsManagementSection`, `validateSecretReferencesSection`, `validateSloAndAlertingSection`, `validateBackupAndDisasterRecoverySection`, `validateDataRetentionPolicySection`, `validateVolumeEncryptionSection`, `validateGraphqlIntrospectionSection`, `validateDeploymentAndRollbackSection`, and `validateOptionalAiPostureSection`.
- Refactored `validateReadiness()` to cleanly delegate to these 11 modular section validators, preserving exact blocker messages, error arrays, and fail-closed evaluation behavior.
- Exported all 15 functions in `module.exports`.
- Extended `scripts/ops/check-launch-readiness.spec.js` with comprehensive unit and contract test suites:
  - `isValidFqdn`: tests acceptance of valid FQDNs and rejection of localhost, 127.0.0.1, IPv4/IPv6, protocol schemes, URI paths/queries, and malformed inputs.
  - `isValidTlsContactEmail`: tests valid emails and rejection of length > 254, local part > 64, missing/multiple `@`, consecutive dots, leading/trailing dots in local part, and `__REQUIRED_` placeholders.
  - `isValidReleaseCommitSha`: tests valid 40-character ASCII hex commit SHAs and rejection of non-hex characters, invalid lengths, and whitespace.
  - `isValidImageRegistryPath`: tests valid registry repository prefixes and rejection of empty strings, `@` digest characters, trailing slashes, and invalid prefixes.
  - Non-approved and null safety: tests that null and pending payloads return empty blocker arrays without throwing or invoking callbacks.
  - All 11 category section validators: tests positive approval paths with matching live evidence reports (0 blockers) and negative rejection paths verifying specific blocker message assertions.

Verification output: `ops:readiness-test` (640/640), `ops:launch-drill-test` (68/68), `ops:readiness-schema-test` (8/8),
`ops:templates` and `ops:templates-test` (57/57), lint, typecheck, build, and `git diff --check` passed cleanly; dependency
audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j). Unresolved example readiness template failed
closed (0 approved categories, 11 blocked, 70 blockers). Operator sign-off remains open.

**Prompt 255 Phase 12K modularize and test readiness structure, placeholder scanning, and evidence collection (2026-10-03):**
Decomposed the remaining document-level validation, placeholder scanning, section structural checking, category evidence file routing, and per-category evidence evaluation in `scripts/ops/check-launch-readiness.js`:
- Extracted `validateEvidenceFileCategory(category, file, parsed, ref, addBlocker)` from `checkEvidenceFileContents`, delegating category-specific candidate, dossier, supply-chain, and report rules while preserving exact blocker messages and fail-closed category boundaries.
- Extracted `validateReadinessDocument(record, addBlocker)` verifying document root object and top-level `sections` object with array-rejection guards.
- Extracted `scanDocumentPlaceholdersAndSecrets(record, addBlocker)` encapsulating document-wide placeholder and dev password detection with category-specific blocker routing.
- Extracted `validateSectionStructuralRequirements(sectionName, sec, addBlocker)` verifying section existence, approval status, and evidence string array contracts.
- Extracted `collectApprovedCategoryEvidence(sections, filePath, addBlocker)` collecting and routing resolved evidence file objects into the 11 categorized buckets with defensive callback normalization.
- Refactored `validateReadiness()` and `checkEvidenceFileContents()` into clear, high-level orchestrators delegating cleanly to these modular functions.
- Exported all 5 functions in `module.exports`.
- Extended `scripts/ops/check-launch-readiness.spec.js` with comprehensive unit and contract test suites:
  - `validateEvidenceFileCategory`: tests candidate acceptance and dossier handling across all 11 categories (including supply-chain SAST evidence in `secrets_management`), and verifies fail-closed blocker generation on invalid/failing payloads and unrecognized categories.
  - `validateReadinessDocument`: tests root and sections object validation, rejecting null, primitives, arrays, and missing sections.
  - `scanDocumentPlaceholdersAndSecrets`: tests clean document execution, category routing for section placeholders, and general routing for root/unmapped dev passwords.
  - `validateSectionStructuralRequirements`: tests section existence, pending vs approved statuses, empty evidence arrays, and invalid/empty evidence strings.
  - `collectApprovedCategoryEvidence`: tests evidence aggregation for approved categories, pending section exclusion, defensive execution without callbacks, and missing file blocker recording wrapped in try/finally fixture cleanup.

Verification output: `ops:readiness-test` (645/645), `ops:launch-drill-test` (68/68), `ops:readiness-schema-test` (8/8),
`ops:templates` and `ops:templates-test` (57/57), lint, typecheck, build, and `git diff --check` passed cleanly; dependency
audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j). Unresolved example readiness template failed
closed (0 approved categories, 11 blocked, 70 blockers). Operator sign-off remains open.

**Prompt 256 Phase 12K modularize and test readiness CLI argument parsing, summary formatting, and execution runner (2026-10-03):**
Decomposed the remaining command-line interface, human-readable summary formatting, end-to-end execution runner, and main entrypoint in `scripts/ops/check-launch-readiness.js`:
- Extracted `parseCliArguments(args, cwd)`: parses command-line arguments, rejects invalid flags (e.g. `--help`, `--dry-run`), rejects excessive positional arguments, and resolves target readiness file relative to `cwd` (defaulting to `infra/launch/readiness.example.json`).
- Extracted `formatReadinessSummary({ categoryBlockers, totalApproved, totalSections, targetPath, cwd })`: encapsulates rendering the human-readable report banner, per-category blocker listings, statistics summary table (total required, approved, unresolved, total blockers), and fail-closed vs. passing result notice.
- Extracted `runReadinessCheck(targetPath, options, io)`: orchestrates defensive target path resolution and string validation, asserts file existence, parses JSON contents, delegates to `validateReadiness()`, renders the summary via `formatReadinessSummary()`, dispatches lines to configurable `io` logging/error callbacks, and returns a structured result object `{ success, exitCode, targetPath, relativePath, totalApproved, totalSections, totalBlockersCount, categoryBlockers, summary, error }`.
- Refactored `main(argv, io, options)`: delegates cleanly to `parseCliArguments()` and `runReadinessCheck()`, calling `process.exit(result.exitCode)` when executed directly as the script entrypoint (`require.main === module`), and returning `result.exitCode` when invoked programmatically.
- Exported all 4 functions (`parseCliArguments`, `formatReadinessSummary`, `runReadinessCheck`, and `main`) in `module.exports`.
- Extended `scripts/ops/check-launch-readiness.spec.js` with comprehensive unit and contract test suites:
  - `parseCliArguments`: tests default target path resolution (`infra/launch/readiness.example.json`), explicit custom paths, custom cwd resolution, flag rejection (`--help`, `--with-drills`, `--dry-run`), multiple argument rejection, and non-array/non-string input guards.
  - `formatReadinessSummary`: tests passing summary rendering (banner, counts, result notice), blocked/failing summary rendering with uppercase category headers and itemized blockers, and accurate calculation of blockers and unapproved counts.
  - `runReadinessCheck`: tests defensive non-string/empty target path rejection, file-not-found error handling, malformed JSON parse error handling, fail-closed evaluation of `infra/launch/readiness.example.json` (70 blockers, 0 approved, exitCode 1), passing evaluation of approved record fixtures (0 blockers, 11 approved, exitCode 0), and clean output capture without console pollution.
  - `main`: tests programmatic CLI entrypoint execution, usage errors on invalid arguments, fail-closed exit code on example records, and passing exit code on approved records.

Verification output: `ops:readiness-test` (649/649), `ops:launch-drill-test` (68/68), `ops:templates` and `ops:templates-test` (57/57),
lint, typecheck, build, and `git diff --check` passed cleanly; dependency audit reports the existing upstream advisory on
Next 16.3.4 (GHSA-vcvr-r3jv-pc5j). Unresolved example readiness template failed closed (0 approved categories, 11 blocked, 70 blockers).
Operator sign-off remains open.

**Prompt 257 Phase 12K harden and test launch readiness shell orchestrator (2026-10-03):**
Hardened command-line interface and argument parsing in `scripts/ops/launch-readiness.sh`, established comprehensive unit and contract test coverage in `scripts/ops/launch-readiness.spec.js`, added template requirements in `scripts/ops/check-production-templates.sh`, and wired root scripts:
- In `scripts/ops/launch-readiness.sh`:
  - Added single positional argument validation via `CUSTOM_FILE_SPECIFIED`, rejecting multiple positional arguments with exit code 1 and error message `Error: Too many arguments; expected single readiness JSON path` followed by usage instructions.
  - Retained `--help` / `-h` handling (exit 0) and fail-closed rejection of unknown options (e.g. `--dry-run`, exit 1).
  - Maintained sequential fail-closed preflight checks: `check-production-templates.sh`, `scan-secrets.sh`, `check-docker-runtime.sh`, and `node --test scripts/ops/check-launch-readiness.spec.js`.
  - Maintained optional drill execution under `--with-drills` with fail-closed dossier hint emission on failure.
  - Propagated execution exit code from `check-launch-readiness.js`.
- Created `scripts/ops/launch-readiness.spec.js`:
  - CLI usage & flags (6 tests): tests `--help`, `-h`, unknown flag rejection, unknown `--dry-run` rejection, single-dash unknown flag rejection, and excessive positional argument rejection.
  - Fail-closed preflight pipeline (4 tests): verifies immediate execution halt when any preflight script fails (`check-production-templates.sh`, `scan-secrets.sh`, `check-docker-runtime.sh`, or `check-launch-readiness.spec.js`).
  - Drill flag flow (3 tests): tests omitting vs including `--with-drills`, drill failure handling and dossier stderr hint, and ordering of drill execution prior to readiness check.
  - Target forwarding & exit code propagation (4 tests): tests default and custom readiness file path forwarding, argument order invariance (`--with-drills` before or after target path), and exit code propagation.
  - Real repository execution (1 test): verifies fail-closed execution against `infra/launch/readiness.example.json` returning exit code 1 with 70 unresolved blockers detected.
- In `scripts/ops/check-production-templates.sh`: added `require_file scripts/ops/check-launch-readiness.spec.js` and `require_file scripts/ops/launch-readiness.spec.js`.
- In `package.json`: added `"ops:launch-readiness-test": "node --test scripts/ops/launch-readiness.spec.js"` and integrated into `"ops:check"`.

Verification output: `ops:launch-readiness-test` (23/23), `ops:readiness-test` (649/649), `ops:launch-drill-test` (68/68), `ops:templates` and `ops:templates-test` (57/57),
lint, typecheck, build, and `git diff --check` passed cleanly; dependency audit reports the existing upstream advisory on
Next 16.3.4 (GHSA-vcvr-r3jv-pc5j). Unresolved example readiness template failed closed (0 approved categories, 11 blocked, 70 blockers).
Operator sign-off remains open.

**Prompt 258 Phase 12K modularize and test production template checks (2026-10-03):**
Modularized the 580-line inline Node.js verification script currently embedded in `scripts/ops/check-production-templates.sh` into a standalone, exported module `scripts/ops/check-production-templates.js`, established comprehensive unit and contract test coverage in `scripts/ops/check-production-templates.spec.js`, wired the test into `npm run ops:templates-test`, and updated template checks and documentation:
- Created `scripts/ops/check-production-templates.js`:
  - Extracted and exported discrete template verification functions: `mountDetails`, `assertPostgres18Mount`, `validateRequiredServices`, `validateComposeSecurityAndTopology`, `validateComposeEnvironmentInterpolation`, `validateWorkerAndExporterScrape`, `validateServiceHealthAndSupervision`, `validatePrometheusAlertsAndDashboard`, `validateReadinessTargets`, and `validateDrillScriptIntegrations`.
  - Implemented high-level `checkProductionTemplates(options, io)` orchestrator resolving repository files relative to `options.cwd`, and CLI entrypoint `main(argv, io)`.
- Created `scripts/ops/check-production-templates.spec.js`:
  - Established 37 comprehensive unit and contract tests using Node.js test runner (`node:test`): mount parsing, postgis 18 mount constraints, required services enforcement, security & topology, env interpolation, worker & exporter scrape, health & supervision, Prometheus alerts & dashboard, readiness targets, drill script integration, repository integration, and main CLI entrypoint.
- Refactored `scripts/ops/check-production-templates.sh`:
  - Replaced inline heredoc with `node scripts/ops/check-production-templates.js || fail 'production template validation failed'`.
  - Added `require_file scripts/ops/check-production-templates.js` and `require_file scripts/ops/check-production-templates.spec.js`.
- Updated `package.json`:
  - Expanded `"ops:templates-test"` to include `scripts/ops/check-production-templates.spec.js`.

Verification output: `ops:templates-test` (94/94), `ops:templates` (passed), `ops:launch-readiness-test` (23/23), `ops:readiness-test` (649/649),
`ops:launch-drill-test` (68/68), lint, typecheck, build, and `git diff --check` passed cleanly; dependency audit reports the existing upstream advisory on
Next 16.3.4 (GHSA-vcvr-r3jv-pc5j). Unresolved example readiness template failed closed (0 approved categories, 11 blocked, 70 blockers).
Operator sign-off remains open.

**Prompt 259 Phase 12K harden production template input validation (2026-10-03):**
The Node template checker now rejects unsupported/malformed CLI input before
file reads and validates consumed document/collection shapes before policy
traversal. Expected read/parse/shape failures return controlled errors with
relative field locations and suppressed parser/argument content. Regression
fixtures contain only public inputs; every unmodified fixture first passes.
Independent review found and verified dashboard layout numeric coercion and
cyclic YAML alias exceptions; finite-number and iterative reference guards fix
both while preserving acyclic aliases. Follow-up review completed before commit.

Actual verification: template suite `tests 233`, `pass 233`, `fail 0`;
`ops:templates-test` `tests 290`, `pass 290`, `fail 0`;
`ops:templates` `ops template check passed`; launch-readiness/readiness/launch-drill
suites passed 23/649/68 tests. Node syntax checks, scoped Prettier, root lint,
typecheck, build and `git diff --check` exited 0. `ops:check` exited 1 at the
existing dependency audit: `28 vulnerabilities (10 moderate, 17 high, 1 critical)`
and `audit error: critical vulnerabilities detected in production dependencies`
(Next 16.3.4, `GHSA-vcvr-r3jv-pc5j`); subsequent aggregate stages did not run.
The unchanged readiness example exited 1 with 0 approved, 11 blocked and
70 blockers. Full contracts, command results and verification limitations are
recorded in `docs/operations.md` prompt 259. No production action, dependency
upgrade or push occurred; prompt 201 and Phase 12 operator sign-off remain open.

**Prompt 260 Phase 12K harden and test production template shell runner (2026-10-04):**
The shell runner `scripts/ops/check-production-templates.sh` now enforces strict POSIX
CLI argument validation (`--help`, `-h`, `--cwd <path>`, `--cwd=<path>`), rejects unknown options,
unexpected arguments, repeated/missing/empty directory paths, and non-existent directories,
and executes all prerequisite checks, security greps, and downstream verifiers relative to
the canonicalized target directory. Dedicated unit and contract test suite
`scripts/ops/check-production-templates-shell.spec.js` covers argument parsing, fail-closed
ordering, and end-to-end repository execution.

Actual verification: shell spec suite `tests 34`, `pass 34`, `fail 0`;
`ops:templates-test` `tests 324`, `pass 324`, `fail 0`;
`ops:templates` `ops template check passed`; launch-readiness/readiness/launch-drill
suites passed 23/649/68 tests. Subdirectory invocation `(cd server && ../scripts/ops/check-production-templates.sh --cwd ..)`
passed cleanly. Node syntax checks, scoped Prettier, root lint, typecheck, build, and
`git diff --check` exited 0. Full contracts, command results, and verification limitations are
recorded in `docs/operations.md` prompt 260. No production action, dependency upgrade, or push
occurred; prompt 201 and Phase 12 operator sign-off remain open.

**Prompt 261 Phase 12K harden and test docker runtime check (2026-10-04):**
The shell runner `scripts/ops/check-docker-runtime.sh` now enforces strict POSIX
CLI argument validation (`--help`, `-h`, `--cwd <path>`, `--cwd=<path>`, `--dockerfile <path>`, `--dockerfile=<path>`),
rejects unknown options, unexpected arguments, repeated/missing/empty directory and Dockerfile paths,
and non-existent directories/files, while preserving the four static server Dockerfile assertions
(Node 24 Alpine stage, USER node, HEALTHCHECK, direct Node startup CMD). Dedicated unit and contract test
suite `scripts/ops/check-docker-runtime.spec.js` covers argument parsing, fail-closed assertions,
directory targeting, and end-to-end repository execution.

Actual verification: docker runtime spec suite `tests 45`, `pass 45`, `fail 0`;
`npm run ops:docker-runtime-test` and `npm run ops:docker-runtime` passed cleanly;
`ops:templates-shell-test` passed 34/34 tests; `ops:templates-test` passed 324/324 tests;
`ops:templates` `ops template check passed`; launch-readiness/static-integrity/deployment suites
passed 45 tests. Subdirectory invocation `(cd server && ../scripts/ops/check-docker-runtime.sh --cwd ..)`
passed cleanly. Node syntax checks, Prettier, root lint, typecheck, build, and `git diff --check`
exited 0. Full contracts, command results, and verification limitations are recorded in
`docs/operations.md` prompt 261. No production action, dependency upgrade, or push occurred;
prompt 201 and Phase 12 operator sign-off remain open.

**Prompt 262 Phase 12K harden and test scan secrets (2026-10-04):**
The shell runner `scripts/ops/scan-secrets.sh` now enforces strict POSIX
CLI argument validation (`--help`, `-h`, `--cwd <path>`, `--cwd=<path>`),
rejects unknown options, unexpected arguments, repeated/missing/empty directory paths,
and non-existent directories, and verifies that the target directory is a git repository
before scanning. It creates temporary match files safely via `mktemp` with clean signal
traps, while preserving all four static secret detection patterns (development passwords,
change-me placeholders, launch sentinels, and client-exposed secrets) and allowed path
exemptions. Dedicated unit and contract test suite `scripts/ops/scan-secrets.spec.js`
covers argument parsing, git validation, pattern detection in isolated fixtures,
allowed path exemptions, exclusions, directory targeting, and end-to-end repository execution.

Actual verification: scan secrets spec suite `tests 42`, `pass 42`, `fail 0`;
`npm run ops:scan-secrets-test` and `npm run ops:scan-secrets` passed cleanly;
`ops:templates-shell-test` passed 34/34 tests; `ops:templates-test` passed 324/324 tests;
`ops:templates` `ops template check passed`; `ops:docker-runtime-test` passed 45/45 tests;
launch-readiness/static-integrity/deployment suites passed 45 tests. Subdirectory invocation
`(cd server && ../scripts/ops/scan-secrets.sh --cwd ..)` passed cleanly.
Node syntax checks, Prettier, root lint, typecheck, build, and `git diff --check` exited 0.
Full contracts, command results, and verification limitations are recorded in
`docs/operations.md` prompt 262. No production action, dependency upgrade, or push occurred;
prompt 201 and Phase 12 operator sign-off remain open.

**Prompt 263 Phase 12K harden and test audit dependencies (2026-10-04):**
The operational shell script `scripts/ops/audit-dependencies.sh` now enforces strict POSIX
CLI argument validation (`--help`, `-h`, `--cwd <path>`, `--cwd=<path>`, `--audit-level <level>`,
`--audit-level=<level>`, `--omit <type>`, `--omit=<type>`), rejects unknown options, unexpected
arguments, repeated/missing/empty/whitespace option arguments, and non-existent directories, and
verifies that the target directory contains `package.json` and `package-lock.json` before executing
`npm audit`. It defaults to `--audit-level=critical` and `--omit=dev` while supporting configurable
level inspection and target directories. Dedicated unit and contract test suite
`scripts/ops/audit-dependencies.spec.js` covers argument parsing, directory targeting, prerequisite
validation, clean fixture execution, mock npm failure handling, and argument propagation.

Actual verification: audit dependencies spec suite `tests 51`, `pass 51`, `fail 0`;
`npm run ops:audit-test` passed cleanly; `ops:templates-shell-test` passed 34/34 tests;
`ops:templates-test` passed 324/324 tests; `ops:templates` `ops template check passed`;
`ops:scan-secrets-test` passed 42/42 tests; `ops:docker-runtime-test` passed 45/45 tests;
`ops:launch-readiness-test` passed 23/23 tests; `ops:launch-drill-test` passed 68/68 tests.
Node syntax checks, Prettier, root lint, typecheck, build, and `git diff --check` exited 0.
Full contracts, command results, and verification limitations are recorded in
`docs/operations.md` prompt 263. No production action, dependency upgrade, or push occurred;
prompt 201 and Phase 12 operator sign-off remain open.

**Prompt 264 Phase 12K harden and test postgres backup (2026-10-04):**
The operational shell script `scripts/ops/backup-postgres.sh` now enforces strict POSIX
CLI argument validation (`--help`, `-h`, `--cwd <path>`, `--cwd=<path>`, `--backup-dir <dir>`,
`--backup-dir=<dir>`, `--host <host>`, `--host=<host>`, `--port <port>`, `--port=<port>`,
`--user <user>`, `--user=<user>`, `--dbname <db>`, `--dbname=<db>`, `--output-file <file>`,
`--output-file=<file>`, `--dry-run`), rejects unknown options, unexpected arguments,
repeated/missing/empty/whitespace option arguments, invalid port numbers (1-65535), and non-existent
directories. It verifies that `pg_dump` exists in `$PATH`, resolves database credentials across
four fallback environment variables without echoing secrets, creates archive directories with 0700
permissions, sets 0600 permissions on backup files, validates non-empty archive generation, and supports
`--dry-run` inspection. Dedicated unit and contract test suite `scripts/ops/backup-postgres.spec.js` covers
argument parsing, tool prerequisites, credential fallbacks, directory creation and permissions, mock
`pg_dump` execution, empty file failure cleanup, error code propagation, and directory targeting.

Actual verification: backup postgres spec suite `tests 53`, `pass 53`, `fail 0`;
`npm run ops:backup-test` passed cleanly; `ops:templates-shell-test` passed 34/34 tests;
`ops:templates-test` passed 324/324 tests; `ops:templates` `ops template check passed`;
`ops:audit-test` passed 51/51 tests; `ops:scan-secrets-test` passed 42/42 tests;
`ops:docker-runtime-test` passed 45/45 tests; `ops:launch-readiness-test` passed 23/23 tests;
`ops:launch-drill-test` passed 68/68 tests. Node syntax checks, Prettier, root lint, typecheck, build,
and `git diff --check` exited 0. Full contracts, command results, and verification limitations are
recorded in `docs/operations.md` prompt 264. No production action, live dump, or push occurred;
prompt 201 and Phase 12 operator sign-off remain open.

**Prompt 265 Phase 12K harden and test postgres restore (2026-10-04):**
The operational shell script `scripts/ops/restore-postgres.sh` now enforces strict POSIX
CLI argument validation (`--help`, `-h`, `--cwd <path>`, `--cwd=<path>`, `--host <host>`,
`--host=<host>`, `--port <port>`, `--port=<port>`, `--user <user>`, `--user=<user>`,
`--dbname <db>`, `--dbname=<db>`, `--file <file>`, `--file=<file>`, `--input-file <file>`,
`--input-file=<file>`, positional `<backup-file>`, `--clean`, `--no-clean`, `--dry-run`), rejects
unknown options, unexpected arguments, repeated/missing/empty/whitespace option arguments,
conflicting `--clean` and `--no-clean` flags, clashing `--file` with positional backup arguments,
invalid port numbers (1-65535), and non-existent directories. It verifies that `pg_restore`, `psql`,
and `pg_isready` exist in `$PATH`, resolves database credentials across four fallback environment
variables without echoing secrets, fixes credential propagation to subshell commands, validates
that backup files exist, are regular, readable, and non-empty, checks server connection via `pg_isready`,
executes `pg_restore` (with or without `--clean --if-exists`), verifies restored public schema table
counts with `psql`, and supports `--dry-run` inspection. Dedicated unit and contract test suite
`scripts/ops/restore-postgres.spec.js` covers argument parsing, backup file validation, tool prerequisites,
credential fallbacks, dry-run mode, mock `pg_restore` execution, `--no-clean` and `--clean` flags,
`pg_isready` and `psql` failure propagation, table count validation, and directory targeting.

Actual verification: restore postgres spec suite `tests 80`, `pass 80`, `fail 0`;
`npm run ops:restore-test` passed cleanly; `npm run ops:restore-drill-test` passed 28/28 tests;
`ops:backup-test` passed 53/53 tests; `ops:templates-shell-test` passed 34/34 tests;
`ops:templates-test` passed 324/324 tests; `ops:templates` `ops template check passed`;
`ops:audit-test` passed 51/51 tests; `ops:scan-secrets-test` passed 42/42 tests;
`ops:docker-runtime-test` passed 45/45 tests; `ops:launch-readiness-test` passed 23/23 tests;
`ops:launch-drill-test` passed 68/68 tests. Node syntax checks, Prettier, root lint, typecheck, build,
and `git diff --check` exited 0. Full contracts, command results, and verification limitations are
recorded in `docs/operations.md` prompt 265. No production action, live restore, or push occurred;
prompt 201 and Phase 12 operator sign-off remain open.

**Prompt 266 Phase 12K harden and test restore drill (2026-10-04):**
The runner now accepts attached/separate options, target-directory and connection
options, rejects duplicate/missing/empty/whitespace value arguments, validates
bounded decimal ports, checks client/Node/date/mktemp prerequisites, validates
credential fallback, and anchors the restore helper independently of caller cwd.
Relative archives and evidence resolve against the target directory. The helper
receives attached options; owned-resource cleanup, atomic evidence and simulation
classification remain intact. Production template checks require the runner.

Actual verification: restore drill `tests 41`, `pass 41`, `fail 0`; restore 80/80,
backup 53/53, template shell 34/34, templates 324/324, scan 42/42, Docker 45/45,
audit contracts 51/51, readiness 649/649, launch readiness 23/23 and launch drill
68/68 passed. Root lint, typecheck and normal-process production build exited 0.
Shell/Node syntax, changed JavaScript/prompt Prettier and diff checks passed.
Existing whole-document Markdown formatting warnings and absent shell formatter
support are recorded in `docs/operations.md`; new sections were formatted
separately. Independent review and verified fixes passed follow-up review.

Full `ops:check` exited 1 at production dependency audit:
`28 vulnerabilities (10 moderate, 17 high, 1 critical)`;
`audit error: critical vulnerabilities detected in production dependencies`.
No dependencies changed and no aggregate gate pass is claimed. Full command
results and execution limits are recorded in `docs/operations.md` prompt 266.
No live restore, production action or push occurred; prompt 201 and Phase 12
operator sign-off remain open.

**Prompt 267 Phase 12K harden and test deployment drill (2026-10-07):**
The simulation runner accepts attached/separate value options and target cwd,
rejects ambiguous/unsafe inputs before execution, validates optional database
credentials/decimal ports and aborts on SQL failures or malformed counts.
Unavailable servers fall back truthfully to offline inspection. Canonical-origin
probes preserve the dossier's `href` hash identity. Receipts use private,
collision-resistant destinations and atomic exclusive publication; retained
files/directories/symlinks and concurrent insertions are preserved. Catchable
interruption/error cleanup removes only owned temp evidence. Destructive-DDL
failures and successful optional probes remain simulation-only.

Actual checks: deployment 104/104; strengthened bounded-probe assertion 1/1;
Caddy 18/18; templates 324/324; readiness 649/649; launch readiness 23/23;
launch drill 68/68. Operational templates, root lint/typecheck/build, Bash/Node
syntax, changed JavaScript/prompt formatting and diff checks passed. New record
sections are formatted separately from existing whole-document warnings.
Full `ops:check` exited 1 at dependency audit:
`37 vulnerabilities (9 moderate, 26 high, 2 critical)`;
`audit error: critical vulnerabilities detected in production dependencies`.
Later aggregate stages were not run; affected suites ran independently.
Independent requesting/receiving review found no critical, important or minor
issues and confirmed catchable-interruption temp cleanup.
Full command results and limitations are recorded in `docs/operations.md` prompt 267. No dependency change, live exercise, production action or push occurred;
Phase 12 and prompt 201 operator sign-off remain open.

**Prompt 268 Phase 12K harden and test secret-rotation drill (2026-10-07):**
The simulation runner now validates attached/separate options, target cwd,
origins, connection fields, decimal ports, prerequisites and absent output
paths before rehearsal. Baseline children are anchored; optional observations
are bounded and truthful. Receipt publication uses private temporary files
and atomic exclusive links, preserving retained and concurrent destinations.
Algorithm failure messages are fixed and I/O failures stay distinct. Early
process exits cannot publish empty receipts. All seven existing mock exercises
and consumer contracts remain simulation-only; no live rotation is proved.

Actual checks: rotation `tests 99`, `pass 99`, `fail 0`; focused review regression
1/1; templates 324/324; scan contracts 42/42; volume 18/18; readiness 649/649;
launch readiness 23/23; launch drill 68/68. Operational templates, root
lint/typecheck/build, Bash/Node syntax, changed JavaScript/prompt formatting and
diff checks passed. New documentation content is formatted separately from
existing whole-document warnings. Independent review's trailing-slash path
finding was verified/fixed and passed follow-up review; no unresolved findings.

Full `ops:check` exited 1 at dependency audit:
`37 vulnerabilities (9 moderate, 26 high, 2 critical)`;
`audit error: critical vulnerabilities detected in production dependencies`.
Later aggregate stages did not run; affected suites ran independently. Full
command evidence and execution limits are recorded in `docs/operations.md`
prompt 268. No dependency change, live exercise, production action or push
occurred; Phase 12 and prompt 201 operator sign-off remain open.

**Prompt 269 Phase 12K DoS resilience runner hardening (2026-10-07):**
`scripts/ops/run-dos-resilience-drill.sh` now validates attached/separate options,
duplicates, cwd, API origin, prerequisites and effective absent output before
work. Static reads use canonical target cwd; helpers stay installation-anchored.
Offline mode remains fully traffic-free; the live path retains its existing
bounded CSRF-paired invalid-login/liveness contract. Private temporary receipts
are independently checked against invocation target/burst/time values and
published exclusively with `ln -T`, preserving prior and concurrent evidence.
Owned response/staging cleanup covers normal failure and catchable interruption.

Actual-process fixtures allowlist environments/tools and stub curl. Final
`ops:dos-test` output was `tests 91`, `pass 91`, `fail 0`; capacity consumer
coverage was `tests 18`, `pass 18`, `fail 0`, including the real offline child and
its static-failure rejection. Templates, template tests (324), readiness (649),
launch readiness (23), launch/dossier (68), lint, typecheck, production build,
syntax, changed-JS/prompt formatting and diff checks passed. The aggregate
`ops:check` stopped at the critical production audit: `37 vulnerabilities
(9 moderate, 26 high, 2 critical)`; downstream aggregate stages were not reached.
Sandbox process tests initially reported `spawnSync bash EPERM`; isolated stubs
passed under normal subprocess permissions. No live requests were authorized or
performed. Independent review's incomplete-receipt finding was fixed, re-tested
and approved on follow-up. Full behavior/check evidence is in `docs/operations.md`
Prompt 269. Phase 12 and Category 5 operator sign-off remain unresolved.

**Prompt 270 Phase 12K capacity and alerting runner hardening (2026-10-07):**
The parent validates attached/separate options, canonical target cwd, safe
origins/endpoints, live references, telemetry pairing/freshness, helper exports
and effective absent output before work. Children remain installation-anchored
and use target sources. Capacity uses `--no-save`; private bounded child data
and actual exits must satisfy complete consumer contracts before passing.
Explicit checked-field projection suppresses private/unknown child content.
UUID defaults and independently checked private receipts publish exclusively
with `ln -T`, preserving retained and concurrent destinations. Catchable cleanup
owns active groups and waits for termination with `wait -f`, including stopped
children. Default mixed execution remains failed evidence; synthetic receipts
cannot approve Category 5.

Actual checks: capacity parent `tests 143`, `pass 143`, `fail 0`; capacity 15/15;
alerts 23/23; DoS 91/91; templates 324/324; readiness 649/649 plus final producer
fixture 1/1; launch readiness 23/23; launch/dossier 68/68. Operational templates,
root lint/typecheck/build, Bash/Node syntax, new-JS/prompt formatting and diff
checks passed. Existing readiness whole-file formatting warnings reproduce on
the committed baseline; its edited section and new documentation were formatted
separately. The readiness producer fixture needed the validator dependency
closure and preserved module exports; no validator or child was weakened.
Independent review's stopped-job wait finding was verified/fixed; focused
fixes passed 10/10 and follow-up review has no unresolved findings.

Full `ops:check` exited 1 at the existing production dependency audit:
`37 vulnerabilities (9 moderate, 26 high, 2 critical)`;
`audit error: critical vulnerabilities detected in production dependencies`.
Later aggregate stages did not run; affected suites ran independently. Sandbox
nested process tests reported `spawnSync bash EPERM`; stub/offline tests passed
under normal permissions. The sandboxed build's TypeScript `--showConfig`
parse failure was followed by a successful normal-permission build. Full
behavior/check evidence is in `docs/operations.md` Prompt 270. No dependency
change, live traffic, deployment, launch approval or push occurred. Phase 12,
prompt 201 and Category 5 operator sign-off remain open.

**Prompt 271 Phase 12K unified launch-drill runner hardening (2026-10-07):**
The seven-stage parent validates strict attached/separate values, installed
helpers/utilities, canonical target/telemetry pairing and both output/evidence
paths before work. Existing dossiers and competing destinations are preserved;
UUID defaults require an absent destination. Owned private staging is serialized,
read back and invocation-checked before exclusive hard-link publication. Counts
and JSON use an independently verified private snapshot. No receipt validator,
child algorithm, schema or target-hash convention changed. Stage ownership
persists through stopped jobs and leader-first exits until active same-group
descendants terminate; unverified termination stops and retains the reservation.
Partial-close/unlink cleanup preserves retryable ownership. Logs/receipts/run
trees remain. Dry mode remains service-dependent; no real unified run occurred.

Actual checks: launch/dossier `tests 162`, `pass 162`, `fail 0`; final helper
31/31; combined related runner and readiness regressions 1059/1059;
templates 324/324. Template check, root
lint/typecheck/build, Bash/Node syntax, changed-spec/prompt/region formatting
and diff checks passed. Whole-helper formatting warnings reproduce on baseline;
edited/new regions were formatted separately. Independent review's three
Important findings were fixed and approved on follow-up (14/14 focused tests,
no remaining findings). Full details are in `docs/operations.md` Prompt 271 and
current operator instructions in `docs/launch-checklist.md` §4.

`ops:check` exited 1 at the unchanged production audit: `37 vulnerabilities
(9 moderate, 26 high, 2 critical)`; `audit error: critical vulnerabilities
detected in production dependencies`. Later aggregate stages did not run;
affected isolated suites ran independently. Sandbox subprocess denial and
Next's TypeScript `--showConfig` parse failure were followed by successful
normal-permission tests/build. No dependency upgrade, live drill, deployment,
production approval or push occurred. Phase 12, prompt 201 and operator sign-offs
remain open.

**Prompt 272 Phase 12K static-integrity producer hardening (2026-10-07):**
Strict CLI/output/ancestor/child/Bash validation precedes all checks/allocation.
The three fixed ordered checks produce consistent success or evaluated failure
receipts with bounded integer statuses and generic spawn failures. Publication
projects only fixed fields, validates serialization and closed-staging readback,
creates private resources and links exclusively; retained/racing destinations,
foreign staging and published receipts survive. Cleanup/output failures cannot
imply success. Synchronous child supervision limits remain; the unified caller
and production consumers are unchanged. A dedicated isolated root suite runs
before the existing audit. No unstubbed producer or live drill was run.

Actual final isolated checks: static `tests 71`, `pass 71`, `fail 0`;
launch/dossier 164/164 plus final producer integration 2/2; readiness 649/649;
launch readiness 23/23; templates 324/324; Docker runtime 45/45; secret scan
42/42. Template check, root lint/typecheck/build, Node syntax, changed-file/new
region formatting and diff checks passed. Independent review's dead-reader FIFO
release finding was verified and fixed with a supervised bounded writer;
the new regression completed in 1039 ms. Follow-up review found no remaining Critical, Important or Minor findings.
Full behavior, real output and limits are in `docs/operations.md` Prompt 272;
current operator inspection/regeneration rules are in checklist §4.

Final `ops:check` exited 1 at the unchanged audit: `37 vulnerabilities
(9 moderate, 26 high, 2 critical)`; `audit error: critical vulnerabilities
detected in production dependencies`. It exercised the 70-case static suite
before the final test-only review fix; the final dedicated suite passed 71/71.
Later aggregate stages did not run. Sandbox subprocess denial and Next's
TypeScript `--showConfig` parse failure were followed by successful
normal-permission tests/build. No dependency change, production action or push
occurred. Phase 12, prompt 201 and operator launch sign-offs remain unresolved.

**Prompt 273 Phase 12K standalone capacity evaluator hardening (2026-10-07):**
Strict CLI/direct-call validation precedes evaluation, transport and save
allocation; duration 1–300 seconds and concurrency 1–100 are engineering limits,
not measured capacity. Standalone help/import and no-save have no destination
work. Canonical safe `href` hashing and unchanged worker/statistics/SLO contracts
remain. New exact `--output` destinations and UUID defaults preflight absent
paths/ancestors; 0700 new directories and 0600 owned verified staging publish
with exclusive hard links. Retained/racing destinations and foreign staging are
preserved. Cleanup/output failure retains published evidence and exits nonzero;
`--allow-failure` overrides only evaluated SLO failure. CLI diagnostics exclude
raw errors/URLs/paths and natural stdout draining preserves truthful status.

Actual checks: final capacity `tests 54`, `pass 54`, `fail 0`; parent 143/143 plus
final actual-child integration 1/1; alerts 23/23; DoS 91/91; launch/dossier
164/164; readiness 649/649; launch readiness 23/23; templates 324/324. Templates,
lint, sequential typecheck/build, selected Prettier and diff check exited 0.
`ops:check` exited 1 at the unchanged audit: `37 vulnerabilities (9 moderate,
26 high, 2 critical)` and `audit error: critical vulnerabilities detected in
production dependencies`; later aggregate stages were unreached. Approved
normal subprocess access passed hermetic fixtures after sandbox `spawnSync`
`EPERM`. Independent review found no Critical, Important or Minor findings.
Full contracts/check output and limits are in `docs/operations.md` Prompt 273.
No real benchmark, unstubbed parent/unified drill, deployment, production
evidence inspection/approval, credential mutation, dependency change or push
occurred. Phase 12, prompt 201, dependency findings and operator sign-offs remain
open; synthetic parent acceptance stays structural and cannot approve Category 5.

**Prompt 274 Phase 12K standalone alert verifier hardening (2026-10-07):**
Strict CLI/direct-option validation precedes source work; standalone help/import
perform no evaluation or saving. Installation defaults and literal caller-relative
source paths remain. Regular-source checks, nonblocking descriptor verification,
1 MiB growth-aware reads, owned closure, explicit YAML nesting/merge limits and
10,000-entry traversal limits are engineering bounds. Invalid shapes/required
fields/duplicate required identities fail safely; missing API scrape now fails
both its check and the overall report. Invalid fields and private source/parser
diagnostics are not reflected. Eleven ordered fixed predicates, public exports
and exactly 25 successful check identities retain parent compatibility. Natural
output draining and stream handlers preserve complete JSON/nonzero failure.
Review-driven bounded selector scanning preserves legacy selector/job policy.

Actual checks: final alerts `tests 112`, `pass 112`, `fail 0`; parent 144/144
plus final actual-child integration 1/1; capacity 54/54; DoS 91/91; launch/dossier
164/164; readiness 649/649; launch readiness 23/23; templates 324/324 and
`ops template check passed`. Lint, sequential typecheck/build, Node syntax,
changed-file/new-region Prettier and diff check passed. `ops:check` exited 1 at
unchanged audit: `37 vulnerabilities (9 moderate, 26 high, 2 critical)` and
`audit error: critical vulnerabilities detected in production dependencies`;
later aggregate stages were unreached. Sandbox subprocess `EPERM`/Next
`--showConfig` parsing failures were followed by successful normal-permission
hermetic checks/build. Final review found no remaining findings; the final
112-case alert suite and actual-parent integration verify review fixes.
Full behavior, outputs and limits are in `docs/operations.md` Prompt 274.
No live monitoring/load/DoS/unified drill, production evidence inspection,
deployment, credential/dependency change or push occurred. Fixed synthetic
predicates and static heuristics cannot approve Category 5; Phase 12, prompt 201,
dependency findings and operator decisions remain unresolved.

**Prompt 275 Phase 12K SBOM invocation/publication hardening (2026-10-08):**
Strict CLI/direct options precede generation/allocation; help/import and no-save
allocate no output. Caller-relative literal output requires absent destinations
and stable directory ancestors. Bounded serialized bytes, private staging, closed
byte-comparison/compliance verification and exclusive hard links preserve retained
and racing evidence; cleanup/output failures stay nonzero. Inventory/policy parity:
708 components/hashes, 834 excluded, unchanged license counts. Failed-license JSON
fully drains, saves the evaluated failure and fails unchanged consumers.

Actual final SBOM `tests 90`, `pass 90`, `fail 0`; launch/dossier 166/166 and final
actual-child integration 2/2; readiness 649/649; launch readiness 23/23; SAST 14/14;
container 22/22; templates 324/324 and `ops template check passed`. Node syntax,
selected formatting, diff check and root lint/typecheck/build passed. Normal
subprocess access passed after sandbox opaque test failures and Next `--showConfig`
parsing failure. Aggregate `ops:check` exited 1 at unchanged audit:
`37 vulnerabilities (9 moderate, 26 high, 2 critical)` and
`audit error: critical vulnerabilities detected in production dependencies`; later
aggregate stages were unreached. Independent review's recorded-parent recreation
finding was verified/fixed; final review found no remaining implementation defects.
Conservative staging-orphan limits are documented in `docs/operations.md` Prompt 275.
No live unified drill, production inspection/approval, deployment, credential or
dependency change, or push occurred. Phase 12, prompt 201 and operator sign-offs
remain unresolved.

**Prompt 276 Phase 12K SAST invocation/publication hardening (2026-10-08):**
Strict CLI/direct options precede scanning/allocation; standalone help/import and
no-save allocate no output. CLI evidence redacts all detected SAST-04 snippets and
matching suppression snippets without mutating direct results. Fresh destinations,
stable directory ancestors, private staging, a 1 MiB save ceiling, closed byte and
report consistency verification, and exclusive hard links preserve retained/racing
evidence. Cleanup/output faults stay nonzero; completed failed reports fully drain
and remain failed through unchanged stage/dossier/readiness consumers.

Exact baseline parity at all four thresholds: 371 files, 12 findings, 9 triaged,
0 expired, 3 active, 0 default blockers; eight rules and exports unchanged.
Actual SAST `tests 136`, `pass 136`, `fail 0`; launch/dossier 169/169; readiness
649/649; launch readiness 23/23; SBOM 90/90; container 22/22; templates 324/324
and `ops template check passed`. Syntax, selected formatting, diff check and root
lint/typecheck/build passed. Sandbox opaque SAST child failures and Next
`--showConfig` failure resolved with normal subprocess access. Aggregate
`ops:check` exited 1 at unchanged audit: `37 vulnerabilities (9 moderate, 26 high,
2 critical)` and `audit error: critical vulnerabilities detected in production
dependencies`; later aggregate stages were unreached. Affected suites ran
independently. Read-only review found no Critical, Important or Minor issues.

`docs/operations.md` Prompt 276 records targeted-redaction, regex/policy coverage,
unsupported hard-link, orphan-staging and same-UID limits. Rollback is a reviewed
normal revert preserving receipts. Phase 12, prompt 201, dependency advisories and
operator sign-offs remain open. No unstubbed launch drill, production action,
dependency/credential change or push occurred.

**Prompt 277 Phase 12K container-verifier invocation/publication hardening (2026-10-08):**
Strict CLI/direct options precede work; help/import and no-save allocate no output.
Regular-source reads are bounded at 1 MiB, YAML at depth 100/10,000 merge keys,
and expanded traversal at 10,000 entries. Malformed structures fail safely;
ordinary aliases/source symlinks and scalar security predicates remain. Fixed
CLI projection excludes raw source/private values while preserving identities,
counts and verdicts. Private verified staging and exclusive hard links preserve
retained/racing/foreign evidence; cleanup/output faults stay nonzero. Baseline
22 checks and 18 well-formed cases match; variable optional check counts and
four exports remain. No security predicate, template or consumer was changed.

Actual final container `tests 136`, `pass 136`, `fail 0`; launch/dossier 173/173;
final actual-child integration 4/4; readiness 649/649; launch readiness 23/23;
SBOM 90/90; SAST 136/136; templates 324/324 and `ops template check passed`.
Container/SAST inspection, root lint/typecheck/build, final syntax/selected
formatting and diff checks passed. Full `ops:check` stopped at unchanged audit:
`37 vulnerabilities (9 moderate, 26 high, 2 critical)` and `audit error: critical
vulnerabilities detected in production dependencies`; later aggregate stages
were unreached. Sandbox subprocess/Next `--showConfig` failures resolved with
normal subprocess access. The unreadable-source integration fixture was corrected
to a child-only Dockerfile fault after parent preflight correctly rejected its
Compose directory; full rerun passed. Independent review's lifecycle-coercion
finding was reproduced/fixed, with complete failed receipt/scalar regressions;
follow-up review found no remaining issues. Full results and conservative
filesystem/static-analysis limits are in `docs/operations.md` Prompt 277.
No unstubbed unified drill, Docker execution, production action, dependency or
credential change, or push occurred. Phase 12, prompt 201, advisories and operator
sign-offs remain open; rollback is a reviewed normal revert preserving receipts.

**Prompt 278 Phase 12K volume-verifier invocation/publication hardening (2026-10-08):**
The Stage 4 volume child now rejects invalid/ambiguous invocation before work;
reads Compose, env and readiness through bounded regular-file descriptors; and
rejects malformed readiness/Compose structures with verified YAML and traversal
limits. It preserves nine exact mount identities, mechanism/filename predicates,
well-formed verdict/count parity and eight exports. A new fixed CLI projection
keeps actual scan and violation counts while excluding private source, owner,
mount, filename and parser metadata; direct helper results remain private.
Fresh destinations, stable ancestor identities, private verified staging, the
1 MiB saved-byte ceiling and exclusive hard links preserve retained/racing
evidence. Publication, cleanup and output failures stay nonzero; completed
failed policies can save truthful failed receipts. No Stage 4, dossier or
readiness consumer changed.

Final volume **151/151**, launch/dossier **178/178**, actual-volume focused
**5/5**, readiness **649/649**, launch readiness **23/23**, container **136/136**,
rotation **99/99**, templates **324/324** and template preflight passed. Lint,
typecheck, build, syntax, formatting and diff checks passed. Aggregate
`ops:check` stopped at the unchanged audit: `37 vulnerabilities (9 moderate,
26 high, 2 critical)` and `audit error: critical vulnerabilities detected in
production dependencies`; later aggregate stages were unreached. Independent
review found no blocking issue; a Minor early-work test-hook gap was fixed and
its focused **29/29** regressions passed. `docs/operations.md` Prompt 278 owns
the full contracts, tests and residual limits. No live unified drill, host
inspection, production action, dependency/credential change or push occurred.
TM-21, Category 8 live sign-off, prompt 201 and Phase 12 remain open; rollback
is a reviewed normal revert preserving retained receipts.

**Prompt 279 Phase 12K Caddy-verifier invocation/publication hardening (2026-10-08):**
The Stage 3 Caddy simulation child now validates invocation before work,
reads regular sources within a 1 MiB bound, rejects incomplete supported
blocks, and publishes only an allowlisted, independently validated receipt to
a fresh destination through private staging and an exclusive hard link.
Actual route verdicts, twelve-case order, HSTS and security predicates, source
identity and four exports remain compatible; private source values are withheld
from CLI evidence. A failed source saves a complete failed simulation report.
The unchanged dossier/readiness contracts and focused real-child Stage 3
scenarios passed. The full checks, review and conservative limits are recorded
in `docs/operations.md` Prompt 279. Prompt 201, Category 1 live sign-off,
Phase 12 exit and dependency advisories remain open; rollback preserves
retained receipts.

**Prompt 280 Phase 12K SMTP template-key validation hardening (2026-10-08):**
The Stage 1 pure validator now rejects ambiguous watched-key declarations
(leading whitespace, `export`, delimiter spacing and malformed separators),
continues to require one canonical `SMTP_USER` and `SMTP_PASS`, forbids both
legacy names, and returns fixed value-free errors for nonstring input. The
integrated template gate rejects fixture ambiguity and accepts comments or
unrelated values naming legacy keys. The production example is unchanged.
Helper tests, templates **346/346**, template preflight, launch/dossier
**182/182**, lint, typecheck, build, syntax, formatting and diff checks passed.
Aggregate `ops:check` stopped at the existing critical dependency audit
(37 vulnerabilities); subsequent aggregate stages were unreached. Review and
the exact parsing contract are in `docs/operations.md` Prompt 280. Prompt 201,
Category 2 live SMTP sign-off and Phase 12 exit remain open.

**Prompt 281 Phase 12K Next.js security patch (2026-10-08):**
The client and root lockfile pin `next` and `eslint-config-next` to 16.3.8.
Clean install, lint, typecheck and the permitted production build passed;
the focused client API-helper suite passed 10/10. A fresh production audit
fell from 37 findings with 2 critical to 36 with 1 critical; `next` cleared,
but `proxy-addr` 2.0.7 through Express remains critical and `ops:check` still
fails closed. Browser auth/recovery checks lacked the Nest API fixture and are
not sign-off evidence. The audit paths, review and validation limits are in
`docs/operations.md` Prompt 281. A separately scoped server dependency repair,
prompt 201, live operator sign-offs and the Phase 12 exit remain open.

**Prompt 282 Phase 12K proxy address security patch (2026-10-08):**
The root lockfile resolves `proxy-addr` 2.0.8 for both Express 4.22.2 and
5.2.1; only that package's registry metadata changed. Clean install, complete
dependency-tree inspection, lint, typecheck, production build and diff checks
passed. The full server suite passed **143/143**, including real test database
suites, and the focused HTTP/bootstrap/auth/CSRF/health/throttling suites
passed **102/102**. The fresh production audit fell from 36 findings with
1 critical to 35 with **0 critical** (26 high, 9 moderate); `proxy-addr`
cleared and the unchanged critical audit gate passed. Independent review found
no issues. `docs/operations.md` Prompt 282 records integrity, advisory, audit
inventory and fixture limits. Residual high advisories, production proxy trust
and shared throttling evidence, prompt 201, live sign-offs and Phase 12 exit
remain open. Rollback is a reviewed normal revert with affected-version
exposure reassessed before deployment.

The complete `ops:check` exited **0** through the final launch/dossier
**182/182** suite. These repository checks and isolated fixtures supply no live
operator launch approval. New documentation sections, the lockfile and prompt
passed selected formatting checks; existing whole-document formatting findings
were preserved.

**Prompt 283 Phase 12K Multer security patch (2026-10-09):**
The root manifest scopes a Multer **2.4.0** override to the unchanged Nest
Express adapter **11.2.1**, which declares exactly 2.2.0. The lockfile changes
only Multer and its necessary closure; remove the exception when a supported
adapter resolves a safe release. Clean install and adapter-relative resolution
verified a single overridden 2.4.0 node. Upload units passed **52/52**, server
e2e **143/143**, audit-wrapper tests **51/51**, and full `ops:check` through
its final **182/182** suite. Lint, typecheck, production build, selected
formatting and diff checks passed. Fresh complete production audit comparison
fell from 35 to **33** findings (**24 high, 9 moderate, 0 critical**); only
Multer and its propagated adapter finding cleared, with every retained finding
unchanged. Independent review found no issues. `docs/operations.md` Prompt 283
records all five advisories, integrity, lock regeneration, source exposure,
fixture limits and override removal condition. No Acres multipart route is
implemented or added; signed PUT uploads remain unchanged. Residual advisories,
prompt 201, live operator sign-offs and Phase 12 exit remain open. Rollback is
a reviewed normal revert of manifest and lockfile together with exposure
reassessed before deployment; no push or launch action is included.

**Prompt 284 Phase 12K Nodemailer security patch (2026-10-09):**
The server manifest pins Nodemailer **10.0.13**, with only its package node
and workspace reference changed in the root lockfile. Clean installation
preserves the lock; CommonJS loading and bundled declaration resolution work
with unchanged `@types/nodemailer`. Mail/auth/organization units passed
**84/84**, full server e2e **143/143**, audit-wrapper tests **51/51**, and the
full operations aggregate through its final **182/182** suite. Four offline
JSON/MIME compositions and a compiled-adapter dispatch passed. Lint, typecheck,
production build, selected formatting and diff checks passed. Independent
review found no issues. Fresh production audit removes only Nodemailer,
falling from 33 to **32** findings (23 high, nine moderate, **zero critical**);
one unrelated GraphQL remedy recommendation changed upstream. The critical
gate remains unchanged. `docs/operations.md` Prompt 284 records the nine
relevant maintainer advisories, integrity, fixture limits and rollback.
No live SMTP/TLS deliverability or launch acceptance follows from offline
composition. Residual dependency repairs, prompt 201, operator sign-offs and
Phase 12 exit remain open.

**Prompt 285 Phase 12K js-yaml security repair (2026-10-09):**
The root lockfile patches all three existing js-yaml branches to **3.15.2**,
**4.3.2**, and **5.4.3**, retaining every parent version. A version-scoped
Swagger 11.4.7 override repairs its exact 5.3.0 dependency; remove the exception
when a supported Swagger release resolves a safe version itself. Operations
callers still resolve v4. Clean install preserved the lock hash; bounded parser,
actual Swagger YAML-handler and Istanbul YAML-config/instrumentation smoke
checks passed. Contract units **73/73**, drift check, full server e2e **143/143**,
lint, typecheck, permitted production build, selected formatting and diff checks
passed. Full `ops:check` exited **0** through final launch/dossier **182/182**.
Complete fresh production audit removes js-yaml/Swagger only, falling from
32 to **30** findings (**22 high, eight moderate, zero critical**); one unrelated
GraphQL fix recommendation changed upstream. The critical gate is unchanged.
Independent review found no issues. `docs/operations.md` Prompt 285 records
integrity, compatibility, actual outputs and sandbox/fixture limits;
`docs/backend.md` records the scoped exception. Residual findings, prompt 201,
operator sign-offs and Phase 12 exit remain open. Rollback is a reviewed normal
revert of manifest and lockfile together with exposure reassessed before
deployment; no live action or push is included.

**Prompt 286 Phase 12K source-map-js security patch (2026-10-09):**
The root lockfile updates source-map-js from 1.2.1 to **1.2.2** across its single
node, satisfying all three parents (root PostCSS 8.5.26, Next nested PostCSS
8.5.23, and `@tailwindcss/node` 4.3.3) under `^1.2.1`. No root manifest edit,
new override, or direct dependency was added. Clean install preserved the lock
hash; offline smoke checks verified basic mapping/content lookup, indexed-map
conversion, SourceNode round-trip, malformed/over-limit/nested offset rejection,
both PostCSS transform/composition branches, and Tailwind Node `toSourceMap`.
Audit-wrapper tests **51/51**, full operations aggregate `ops:check` exited **0**
through launch/dossier **182/182**, lint, typecheck, production build (22/22
pages), and diff checks passed. Fresh production audit removes source-map-js only,
falling from 30 to **29** findings (**21 high, eight moderate, zero critical**).
The critical audit gate remains unchanged. Independent review found no issues.
`docs/operations.md` Prompt 286 records integrity, compatibility, actual outputs,
and fixture/sandbox limits. Residual dependency findings, prompt 201, operator
sign-offs and Phase 12 exit remain open. Rollback is a reviewed normal revert of
the lockfile with exposure reassessed before deployment; no live action or push
is included.

**Prompt 287 Phase 12K fast-uri security patch (2026-10-09):**
The root lockfile updates only fast-uri 3.1.5 to **3.1.8**, satisfying all ten
unchanged AJV v8 parents under `^3.0.1`. No manifest or override changed. Registry
integrity matched, clean installation preserved the lock hash, and bounded
semantic fixtures passed ordinary URI handling, encoded host/IDN behavior,
nested percent escapes, malformed scheme/IPv6 and port rejection, plus external,
local and escaped schema references on all ten actual AJV branches. The full
operations aggregate passed **2857 tests** across 26 invocations, ending with
launch/dossier **182/182**; lint, typecheck, production build (22/22 pages),
format and diff checks passed. The first sandbox build hit the known TypeScript
subprocess-output failure; the unchanged permitted rerun passed. Fresh complete
production audit removes fast-uri only, reducing 29 to **28 findings** (**20
high, eight moderate, zero critical**); only an unrelated GraphQL fix recommendation
changed in retained finding metadata. Critical-only policy remains unchanged.
Independent implementation review found no issues. `docs/operations.md` Prompt
287 records integrity, actual checks, remaining inventory, sandbox/fixture limits
and normal-revert rollback. Prompt 201, operator sign-offs, residual findings and
Phase 12 exit stay open; no push, deployment or live approval occurred.

**Prompt 288 — ip-address security release (2026-10-09):** npm-generated
lock-only repair **10.5.0 → 10.7.3**, within unchanged express-rate-limit and
socks parent ranges; every other node and manifest is unchanged. Registry
integrity, both caller resolutions and bounded offline classifier/subnet/
diagnostic/rate-limit/SOCKS compatibility checks passed. Complete production
audit removes ip-address only (28 → 27, high20 unchanged, moderate8 → 7,
critical0); all retained finding objects match. User explicitly authorized npm
audit metadata disclosure after automatic approval review initially rejected
it. Clean install, audit-wrapper tests (51/51), critical audit gates, complete
operations aggregate (26 suites, 2857 tests, zero failures), lint, typecheck,
build, formatting and diff checks passed. Independent implementation review
found no findings. `docs/operations.md` Prompt 288 records exact outputs,
sandbox/temporary-fixture corrections, residual inventory and rollback.
No real DB/browser/production acceptance, launch approval or push. Phase 12,
prompt 201 and operator sign-offs remain open.

**Prompt 289 — brace-expansion security releases (2026-10-09):** targeted
npm-generated lock repair updates seven nodes to **1.1.21**, **2.1.7**, and
**5.0.12** within unchanged parent ranges. Only versions, URLs and integrity
changed; all other nodes/manifests/overrides remain unchanged. Registry integrity,
clean-install lock hash, all seven actual minimatch callers, bounded recursion/
append/rewrite fixtures and v5 ESM passed. Lint, typecheck, permitted build
(**22/22** pages), audit-wrapper tests (**51/51**), formatting and diff checks
passed. Independent review found no findings. Independent offline operations
stages passed **26 suites / 2857 tests**, ending **182/182**; online audit was
explicitly omitted. Auto-review rejected npm audit disclosure of dependency
metadata to registry.npmjs.org; user authorization remains pending. No fresh
before/after audit reduction, online audit gate or complete `ops:check` pass is
claimed. `docs/operations.md` Prompt 289 records restrictions, provenance,
actual results and normal-revert rollback. Other advisories, prompt 201,
operator sign-offs and Phase 12 exit remain open; no push or live acceptance.

**Prompt 290 — patch undici security release (2026-10-09):** targeted
lock repair updates single node to **7.29.1** within unchanged `shadcn`
(`^7.27.2`) and `@dotenvx/dotenvx` (`^7.11.0`) parent ranges. Only version,
tarball URL and integrity changed; no workspace manifest, override, or
parent was altered. Registry integrity verified, clean install preserved lock
consistency, and both parent callers resolve deduped 7.29.1. Offline semantic
compatibility fixtures verified caller-relative resolution, CJS/ESM entrypoints,
Client/Pool/Agent/Dispatcher lifecycle, RetryHandler options, header parsing,
error hierarchies and BalancedPool. Lint, typecheck, production build
(**22/22** pages), audit-wrapper tests (**51/51**), formatting and diff checks
passed. Independent read-only review found zero findings. All 32 independent
offline operations stages passed (**26 suites / 2857 tests**, ending **182/182**);
online audit gate omitted pending explicit disclosure authorization.
`docs/operations.md` Prompt 290 records restrictions, provenance, actual
results and normal-revert rollback. Other advisories, prompt 201, operator
sign-offs and Phase 12 exit remain open; no push or live acceptance.

**Prompt 291 — Prisma mysql2 dependency repair (2026-10-09):** scoped root
`prisma@7.9.1` override repairs its exact mysql2 3.15.3 pin to stable **3.24.5**.
Only four lock nodes change: mysql2, new sql-escaper 1.5.2, removed seq-queue
and sqlstring; all other resolutions stay unchanged and satisfy updated ranges.
Remove the exception when supported Prisma supplies a safe mysql2 itself.
Registry integrity, clean-install lock hash, real-library SQL/hostile-object/
IPv6/lazy-pool and sync/async bounded-inflate fixtures passed. Prisma
version/generate/validate, contracts, lint, typecheck, permitted build (**22/22**
pages), selected formatting and diff checks passed. Independent review found
no findings. All **32 independent offline operations stages** passed (**26 suite
invocations / 2857 tests**, final **182/182**); online npm audit remains omitted
pending explicit dependency-metadata disclosure authorization. No fresh audit
reduction or complete `ops:check` pass is claimed. `docs/operations.md` Prompt
291 records exact outputs, closure, sandbox/fixture limits and rollback;
`docs/backend.md` records the exception. The user's immediate-execution instruction
is reflected in the `AGENTS.md` approval exception. PostgreSQL and routes remain
unchanged. Phase 12, prompt 201, other advisories and operator sign-offs stay
open; no push, deployment or live acceptance occurred.
