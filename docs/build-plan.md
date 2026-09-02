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

Status: implemented by `prompts/22-organizations-permissions-rls.md`.

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

## 5. Phase 4 — versioned REST and complementary GraphQL

Status: implemented by `prompts/23-versioned-rest-graphql-contracts.md`.

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
  breaking-change classification.
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
