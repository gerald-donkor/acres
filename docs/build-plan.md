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
  - `scripts/ops/verify-capacity-load.spec.js`: exit 0; all 9 unit tests passed in 90ms;
  - Validates Category 5 SLO requirements: availability >= 99.9%, p95 latency <= 500ms, throughput >= 100 RPS;
  - Enforces mathematical monotonicity: `min <= p50 <= p90 <= p95 <= p99 <= max`;
  - Supports deterministic synthetic workload simulation for CI and live HTTP benchmarking mode;
  - Emits structured JSON audit reports (`backups/capacity-load-report-<timestamp>.json`).
- **Prometheus Alert Rule Expansion & Synthetic Simulation Engine (TM-16, TM-20)**:
  - `scripts/ops/verify-alert-rules.js`: static parser, PromQL validator, and time-series simulation engine;
  - `scripts/ops/verify-alert-rules.spec.js`: exit 0; all 9 unit tests passed in 100ms;
  - Expands `infra/prometheus/alerts.yml` to 7 operational golden signals and security threat alerts (`AcresApiDown`, `HighHttp5xxRate`, `P95LatencyThresholdExceeded`, `High429Rate`, `QueueDeadLettersDetected`, `OutboxDeliveryLag`, `DatabaseConnectionPoolSaturation`);
  - Simulates time-series metric data verifying each alert fires on threshold breach and clears on normal traffic.
- **Multi-Layer DoS & Rate Limiting Resilience Drill (TM-05, TM-20)**:
  - `scripts/ops/run-dos-resilience-drill.sh`: automated drill asserting 5 defense-in-depth protection layers (Caddy body size ceiling and timeouts, NestJS `@StrictThrottle` 10 req/min fail-closed HTTP 429 with probe `@SkipThrottle` starvation defense, GraphQL 12KB/depth/alias/cost bounds, storage 50MB/quarantine limits, and constant-time bcrypt verification);
  - Emits structured JSON audit evidence reports (`backups/dos-resilience-evidence-<timestamp>.json`).
- **Top-Level Capacity & Alerting Drill Runner**:
  - `scripts/ops/run-capacity-alerting-drill.sh`: executes alert simulation, capacity evaluation, and DoS drill, emitting unified JSON evidence (`backups/capacity-alerting-drill-evidence-<timestamp>.json`).
- **Operations & CI Integration**:
  - Root package scripts: `npm run ops:capacity-test`, `npm run ops:capacity-drill`, `npm run ops:alert-test`, `npm run ops:alert-drill`, `npm run ops:dos-drill`, `npm run ops:capacity-alerting-drill`;
  - Integrated `npm run ops:capacity-test` and `npm run ops:alert-test` into `npm run ops:check`;
  - Updated `scripts/ops/check-production-templates.sh` requiring all 7 alerts and alert/capacity checks;
  - Closes TM-05, TM-16, TM-20, and Category 5 launch readiness requirements.

## 22. Phase 12K verification record — 2026-09-09

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
  - 11-category verification matrix, 7 Prometheus alert runbooks, rollback/DR
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
