# 16 — Acres product and system architecture blueprint

## Scope, and why it is next

The repository has a completed marketing client and a real but intentionally
small NestJS backend. The current state is established by the repository and
git history, not by the existence of prior prompt files:

- `client/` is the production Next.js 16.3 / React 19.2 landing application.
- `server/` is a NestJS 11.2 API on Express with health, account/session auth,
  CSRF, per-IP throttling, public regions, contact submissions, job-run reads,
  and an in-process session-maintenance schedule.
- `packages/shared/` exposes the framework-neutral contracts already shared by
  server-side code.
- `server/prisma/schema.prisma` models accounts, sessions, regions, metrics,
  reports, contact submissions, and job runs, but no real database or first
  migration exists.
- `server/Dockerfile` and `.github/workflows/ci.yml` build and smoke-test a
  portable API image, but no complete local or production service topology is
  defined.
- No client code calls the API, and no authenticated application UI exists.

The next safe step is therefore not another isolated endpoint. Acres needs a
single product definition and target architecture before organization tenancy,
ingestion, geospatial data, GraphQL, workers, object storage, and authenticated
UI work can be divided into implementation prompts without inventing a new
system in every session.

This prompt produces that canonical blueprint. It also installs the small set
of Agent Skills needed to implement and review the chosen architecture. It
does **not** add runtime dependencies, change routes, create database
migrations, provision services, or connect the client to the API. Those are
separate, ordered prompts defined by the resulting build plan.

## User decisions — locked for this blueprint

These decisions were made directly with the user on 2026-08-23 and are not
implementation-agent preferences:

1. Acres targets a **B2B regional-data analytics SaaS**.
2. “100% FREE” means the core software stack is **free/open source and
   self-hostable**. It does not claim that hardware, domains, networks, backups,
   SMTP delivery, or operator time cost nothing.
3. Detailed architecture belongs in `docs/`; `AGENTS.md` remains the concise
   governing index and invariants file.
4. The first ingestion surface is **organization uploads**: CSV, XLSX, and
   GeoJSON. Public-data API connectors use a later adapter boundary and are not
   built without a named provider and an approved data license.
5. Geography is a **global arbitrary-depth administrative hierarchy**, not a
   Ghana-only or sales-territory-only model.
6. Deterministic analytics are core. Generative AI is optional, locally
   deployable, provider-neutral, non-authoritative, and must never be required
   to browse or report on data.
7. The runtime baseline is PostgreSQL/PostGIS + Valkey/BullMQ + Garage object
   storage.
8. Organization isolation is enforced in application repositories **and** by
   PostgreSQL row-level security.
9. Acres exposes both versioned REST and GraphQL, but they are complementary:
   REST owns auth, files, commands, exports, webhooks, and job control; GraphQL
   owns read-heavy dashboard/report queries. This is not duplicate CRUD.

Any future prompt that changes one of these choices must identify the decision,
explain the migration and trade-off, receive user approval, and update the
owning architecture decision record.

## Reference material read for this prompt

### Repository sources

Read these in full or inspect the named implementation surface before writing:

- `AGENTS.md`, especially §§1.8, 2, 4–10.
- `docs/backend.md` — current server contracts, security controls, Prisma 7
  behavior, deployment constraints, tests, and explicitly deferred work.
- `docs/landing.md` — the marketing product promise and the boundary between
  real product requirements and illustrative device numbers.
- `README.md`, the four workspace `package.json` files, `package-lock.json`,
  and `skills-lock.json`.
- `server/prisma/schema.prisma`, `server/src/app.module.ts`,
  `server/src/app.setup.ts`, and the existing feature-module entry points.
- `packages/shared/src/` and `server/test/`.
- The current `.agents/skills/` and `.claude/skills/` trees.
- `git log --oneline` and `git status --short`.

The static design comps are not architecture references and no visual UI is
built in this prompt. Do not crop or measure them.

### Live official sources verified while preparing this prompt

Use these as the initial source set, reopen any page whose API or license is
copied into a final document, and record its access date:

- Node release status: <https://nodejs.org/en/about/previous-releases>
  (`v24` is LTS; `v26` is Current on 2026-08-23).
- NestJS package status: <https://www.npmjs.com/package/@nestjs/core>
  (`11.2.1` is latest; Nest 12 is alpha on 2026-08-23).
- Nest versioning: <https://docs.nestjs.com/techniques/versioning>.
- Nest OpenAPI: <https://docs.nestjs.com/openapi/introduction>.
- Nest GraphQL/TypeScript: <https://docs.nestjs.com/graphql/quick-start>.
- Nest SSE: <https://docs.nestjs.com/techniques/server-sent-events>.
- Nest queues: <https://docs.nestjs.com/techniques/queues>.
- Prisma package status: <https://www.npmjs.com/package/prisma>
  (`7.9.1` is GA/latest; `8.0.0-rc.*` is `next` on 2026-08-23).
- Prisma 8 status: <https://www.prisma.io/docs/orm/v8>.
- PostgreSQL row security:
  <https://www.postgresql.org/docs/current/ddl-rowsecurity.html>.
- PostGIS spatial model:
  <https://postgis.net/docs/using_postgis_dbmanagement.html>.
- Valkey introduction and license:
  <https://valkey.io/topics/introduction/>.
- BullMQ repository/Valkey support:
  <https://github.com/taskforcesh/bullmq>.
- Garage repository/license:
  <https://github.com/deuxfleurs-org/garage>.
- MinIO current license: <https://docs.min.io/license/>.
- OpenTelemetry JavaScript status:
  <https://opentelemetry.io/docs/languages/js/>.
- Prometheus overview:
  <https://prometheus.io/docs/introduction/overview/>.
- Caddy automatic HTTPS: <https://caddyserver.com/docs/automatic-https>.

Only primary or official project sources support version, compatibility,
security, and licensing claims. Community posts may identify a question but
must not settle one. A license matrix is engineering inventory, not legal
advice, and the document must say so.

## SKILLS USED

Load these existing skills before modifying files:

- `skill-installer` — follow the supported installation mechanism and do not
  hand-copy partial skill folders.
- `nestjs-best-practices` — keep the target module boundaries and Nest runtime
  design production-safe.
- `requesting-code-review` — construct and dispatch the mandatory reviewer
  request after self-verification.
- `receiving-code-review` — verify reviewer claims before changing the plan or
  documentation.
- `caveman-commit` — generate the final commit message.

Install and then load these project skills before authoring the document each
one governs:

- `architecture-patterns` — modular-monolith boundaries, ports/adapters, and
  dependency direction.
- `api-design-principles` — REST/GraphQL responsibility split and durable API
  conventions.
- `openapi-spec-generation` — OpenAPI ownership and verification rules.
- `architecture-decision-records` — durable architectural decisions and their
  replacement process.
- `postgres-best-practices` — PostgreSQL schema, indexes, constraints,
  migrations, RLS, and query-performance rules.
- `security-best-practices` — secure-by-default TypeScript web architecture.
- `security-threat-model` — repository-grounded assets, boundaries, abuse
  paths, priorities, and mitigations.
- `playwright` — define the real-browser acceptance-test layer used in later
  client/backend integration phases.
- `auth-implementation-patterns` — session, invitation, RBAC, account-recovery,
  and authorization boundary design.
- `javascript-testing-patterns` — Jest/Testing Library unit and integration
  test structure for the TypeScript workspaces.
- `e2e-testing-patterns` — browser/API journey coverage, fixture isolation, and
  flake-resistant end-to-end suites.
- `error-handling-patterns` — stable transport errors, partial ingestion
  failures, retry classification, and graceful degradation.
- `sql-optimization-patterns` — query plans, measured indexing, aggregation,
  and N+1/performance verification.
- `kpi-dashboard-design` — metric definition consistency, hierarchy, and
  decision-useful dashboard composition.
- `data-storytelling` — evidence-backed report and insight presentation without
  turning analytics into unsupported marketing claims.
- `prompt-engineering-patterns` — versioned, evidence-constrained AI prompts
  with structured outputs.
- `llm-evaluation` — repeatable groundedness, safety, quality, and no-AI
  regression evaluation.
- `deployment-pipeline-design` — promotion gates, rollback boundaries, and
  production deployment workflow.
- `github-actions-templates` — repository-native CI implementation and
  hardening.
- `prometheus-configuration` — application/infrastructure metric collection
  and alert-rule design.
- `grafana-dashboards` — operational dashboards, not Acres customer analytics
  UI.
- `secrets-management` — runtime/CI secret injection, least privilege,
  rotation, and incident response.
- `sast-configuration` — static security analysis in CI with actionable,
  reviewable findings.
- `accessibility-compliance` — authenticated application WCAG 2.2 semantics,
  keyboard, screen-reader, contrast, and error-feedback behavior.

Do not install generic Node backend, generic microservice, cloud-deployment,
Prisma 8 RC, or provider-specific database skills. They either overlap the
selected skills, conflict with the provider-neutral/FOSS decision, or encode a
runtime the repository does not use.

## Skill installation procedure

Use the repository-local `npx skills` workflow already represented by
`skills-lock.json`, not a global-only installation. Run from the repository
root:

```bash
npx skills add openai/skills \
  --skill security-best-practices security-threat-model playwright \
  --agent '*' -y

npx skills add neondatabase/postgres-skills \
  --skill postgres-best-practices \
  --agent '*' -y

npx skills add wshobson/agents \
  --skill architecture-patterns api-design-principles \
  openapi-spec-generation architecture-decision-records \
  auth-implementation-patterns javascript-testing-patterns \
  e2e-testing-patterns error-handling-patterns \
  sql-optimization-patterns kpi-dashboard-design data-storytelling \
  prompt-engineering-patterns llm-evaluation \
  deployment-pipeline-design github-actions-templates \
  prometheus-configuration grafana-dashboards secrets-management \
  sast-configuration accessibility-compliance \
  --agent '*' --full-depth -y
```

Before accepting the result:

1. Confirm every requested name is present as a real directory under
   `.agents/skills/`.
2. Confirm `.claude/skills/` exposes the same skill through a valid relative
   symlink, matching the repository's current convention.
3. Confirm `skills-lock.json` records the exact source, skill path, and hash.
4. Read every installed `SKILL.md` completely. Follow only the supporting
   references each skill routes this task to.
5. Check `git diff -- skills-lock.json` and the skill directories; reject
   unrelated skills or repository metadata.
6. If a named skill no longer exists or has materially different triggering
   instructions, stop and report the upstream change instead of silently
   substituting another skill.

### Skills deliberately not installed

Record these exclusions in `docs/skills.md` so a later session does not repeat
the same search and add them without an architecture decision:

- `postgresql-table-design` duplicates the broader selected
  `postgres-best-practices` coverage.
- `nodejs-backend-patterns` targets raw Express/Fastify services and overlaps
  the Nest-specific skill and verified Nest docs.
- `microservices-patterns` conflicts with the modular-monolith-first decision;
  it becomes relevant only after an approved service extraction.
- `data-quality-frameworks` assumes Great Expectations/dbt-style infrastructure
  that is not in this TypeScript/PostgreSQL build. Acres still implements data
  contracts and quality checks natively.
- `rag-implementation` is not justified by the optional AI design. Acres passes
  already-authorized evidence to generation; it does not add a vector database
  or general document retrieval without a measured need.
- Kubernetes, Terraform, multi-cloud, service-mesh, and provider deploy skills
  are deferred because the reference deployment is Docker Compose + Caddy and
  no provider has been selected.
- Prisma 8/claimable hosted-Postgres skills are excluded while Prisma 8 is an RC
  and self-hosted PostgreSQL is the selected system of record.

## Whole-build skill invocation contract

The implementation plan is not reproducible if it merely lists skills once in
this architecture prompt. `docs/build-plan.md` must carry the following rules,
and every future numbered implementation prompt must copy the applicable phase
row into its own `## SKILLS USED` section.

### Mechanical rules for every future phase

1. Re-read `AGENTS.md`, the approved phase prompt, and the owning `docs/` files.
2. Inspect the current available-skills listing; do not assume this prompt's
   2026-08-23 catalog is unchanged.
3. Load every **required** skill in the phase row before writing code.
4. Load a **conditional** skill as soon as its trigger becomes true. A future
   prompt must either list it as used or state why that surface is absent.
5. Read the relevant local Next documentation before any Next 16.3 code, local
   shadcn component source before shadcn changes, and official stack docs when
   no skill owns an API.
6. Before completion, always load `requesting-code-review`, dispatch the review,
   load `receiving-code-review` for the findings, and load `caveman-commit` for
   the final commit. These three are mandatory even if omitted accidentally
   from a future prompt; omission is a prompt defect to fix before execution.
7. Do not invoke a skill by name without loading its complete `SKILL.md` and
   routed required references during that execution turn.
8. Do not treat a skill as repository truth. Reconcile it with actual code,
   pinned versions, local framework docs, and the owning Acres documentation.

### Phase-by-phase required skill manifest

| phase | required before implementation | conditional triggers |
| --- | --- | --- |
| 1. Architecture foundation | `skill-installer`, `architecture-patterns`, `api-design-principles`, `openapi-spec-generation`, `architecture-decision-records`, `postgres-best-practices`, `nestjs-best-practices`, `security-best-practices`, `security-threat-model`, `playwright`, `auth-implementation-patterns`, `javascript-testing-patterns`, `e2e-testing-patterns`, `error-handling-patterns`, `sql-optimization-patterns`, `kpi-dashboard-design`, `data-storytelling`, `prompt-engineering-patterns`, `llm-evaluation`, `deployment-pipeline-design`, `github-actions-templates`, `prometheus-configuration`, `grafana-dashboards`, `secrets-management`, `sast-configuration`, `accessibility-compliance`, `requesting-code-review`, `receiving-code-review`, `caveman-commit` | Existing frontend, Tailwind, shadcn, React, motion, and view-transition skills are loaded only when the architecture document specifies those already-established client conventions; no runtime code is written in this phase |
| 2. Infrastructure + first migration | `architecture-patterns`, `postgres-best-practices`, `nestjs-best-practices`, `security-best-practices`, `github-actions-templates`, `secrets-management`, `javascript-testing-patterns`, `requesting-code-review`, `receiving-code-review`, `caveman-commit` | `deployment-pipeline-design` only if the phase adds promotion/deployment rather than build-only CI; `sast-configuration` if scanners are introduced; `prometheus-configuration` if telemetry starts here |
| 3. Organizations + RLS | `architecture-patterns`, `nestjs-best-practices`, `postgres-best-practices`, `auth-implementation-patterns`, `security-best-practices`, `security-threat-model`, `javascript-testing-patterns`, `error-handling-patterns`, `requesting-code-review`, `receiving-code-review`, `caveman-commit` | `sql-optimization-patterns` when reviewing RLS/index query plans; `api-design-principles` if public membership routes change in the same prompt |
| 4. REST + GraphQL platform | `architecture-patterns`, `nestjs-best-practices`, `api-design-principles`, `openapi-spec-generation`, `auth-implementation-patterns`, `security-best-practices`, `javascript-testing-patterns`, `e2e-testing-patterns`, `error-handling-patterns`, `requesting-code-review`, `receiving-code-review`, `caveman-commit` | `postgres-best-practices` and `sql-optimization-patterns` for cursor/DataLoader query paths; `security-threat-model` when the GraphQL boundary changes the threat model |
| 5. Client/backend connection | `frontend-design`, `tailwind-design-system`, `tailwind-4-docs`, `shadcn`, `vercel-react-best-practices`, `web-design-guidelines`, `accessibility-compliance`, `auth-implementation-patterns`, `api-design-principles`, `security-best-practices`, `playwright`, `e2e-testing-patterns`, `javascript-testing-patterns`, `requesting-code-review`, `receiving-code-review`, `caveman-commit` | `vercel-react-view-transitions` for route/state transitions; `gsap-core`, `gsap-react`, and `gsap-performance` only if GSAP motion is approved; `gsap-timeline`, `gsap-plugins`, `gsap-utils`, or `gsap-scrolltrigger` only when that exact API is used |
| 6. Storage + queues + secure uploads | `architecture-patterns`, `nestjs-best-practices`, `api-design-principles`, `security-best-practices`, `security-threat-model`, `error-handling-patterns`, `javascript-testing-patterns`, `e2e-testing-patterns`, `secrets-management`, `requesting-code-review`, `receiving-code-review`, `caveman-commit` | `postgres-best-practices` for outbox/job metadata migrations; `sql-optimization-patterns` for polling/cleanup queries; `prometheus-configuration` if queue metrics land in this phase |
| 7. Geography + ingestion | `architecture-patterns`, `nestjs-best-practices`, `postgres-best-practices`, `security-best-practices`, `security-threat-model`, `error-handling-patterns`, `javascript-testing-patterns`, `e2e-testing-patterns`, `sql-optimization-patterns`, `requesting-code-review`, `receiving-code-review`, `caveman-commit` | `api-design-principles` and `openapi-spec-generation` for upload/mapping routes; `playwright` if the mapping UI is included rather than split into its own prompt |
| 8. Metrics + deterministic analytics | `architecture-patterns`, `nestjs-best-practices`, `postgres-best-practices`, `sql-optimization-patterns`, `javascript-testing-patterns`, `error-handling-patterns`, `kpi-dashboard-design`, `data-storytelling`, `requesting-code-review`, `receiving-code-review`, `caveman-commit` | `security-best-practices` for export or sensitive aggregation paths; `api-design-principles` when new public query contracts ship |
| 9. Dashboards + optimized GraphQL | `frontend-design`, `tailwind-design-system`, `tailwind-4-docs`, `shadcn`, `vercel-react-best-practices`, `web-design-guidelines`, `accessibility-compliance`, `api-design-principles`, `kpi-dashboard-design`, `data-storytelling`, `postgres-best-practices`, `sql-optimization-patterns`, `security-best-practices`, `playwright`, `e2e-testing-patterns`, `javascript-testing-patterns`, `requesting-code-review`, `receiving-code-review`, `caveman-commit` | `vercel-react-view-transitions` for state/route transitions; the relevant GSAP skills only for approved GSAP interactions; `openapi-spec-generation` only if REST changes too |
| 10. Reports + exports | `frontend-design`, `tailwind-design-system`, `tailwind-4-docs`, `shadcn`, `vercel-react-best-practices`, `web-design-guidelines`, `accessibility-compliance`, `api-design-principles`, `data-storytelling`, `security-best-practices`, `error-handling-patterns`, `playwright`, `e2e-testing-patterns`, `javascript-testing-patterns`, `requesting-code-review`, `receiving-code-review`, `caveman-commit` | `postgres-best-practices`/`sql-optimization-patterns` for report and export queries; `openapi-spec-generation` for download/export REST contracts; `kpi-dashboard-design` for report metric summaries |
| 11. Optional local AI | `architecture-patterns`, `nestjs-best-practices`, `security-best-practices`, `security-threat-model`, `prompt-engineering-patterns`, `llm-evaluation`, `data-storytelling`, `error-handling-patterns`, `javascript-testing-patterns`, `e2e-testing-patterns`, `secrets-management`, `requesting-code-review`, `receiving-code-review`, `caveman-commit` | `api-design-principles`/`openapi-spec-generation` if an AI command/status route is added; `postgres-best-practices` for generation/evidence schema; do **not** load `rag-implementation` unless a separately approved retrieval architecture is added |
| 12. Operations + launch hardening | `architecture-patterns`, `nestjs-best-practices`, `security-best-practices`, `security-threat-model`, `deployment-pipeline-design`, `github-actions-templates`, `prometheus-configuration`, `grafana-dashboards`, `secrets-management`, `sast-configuration`, `e2e-testing-patterns`, `playwright`, `requesting-code-review`, `receiving-code-review`, `caveman-commit` | `postgres-best-practices`/`sql-optimization-patterns` for backup, restore, retention, and load findings; `accessibility-compliance` and `web-design-guidelines` for final UI audit; cloud/Kubernetes skills only after a provider/orchestrator decision |

The prompt for each phase must repeat exact skill names rather than saying
“use the skills from phase N.” This preserves the repository's `/clear` and
resume workflow.

## Files to add or update

### 1. `docs/product.md` — add

Create the canonical product definition. It must distinguish facts already
supported by the marketing client from target product decisions made in this
prompt.

Include:

- Acres' job: turn unreadable regional data into evidence a team can browse,
  compare, explain, and act on.
- Primary personas:
  - organization owner — tenant lifecycle and ultimate access control;
  - administrator — members, datasets, configuration, and governance;
  - analyst — import, validate, model, explore, and author reports;
  - viewer — browse approved dashboards/reports and export where permitted.
- The fixed role ladder: `owner`, `admin`, `analyst`, `viewer`. State that
  permissions, not string comparisons scattered through controllers, are the
  authorization contract.
- Core journeys: create/join an organization; upload and validate a dataset;
  map fields and regions; publish an immutable dataset version; browse regional
  metrics; save a view/dashboard; draft and publish a report; export evidence;
  inspect job and audit history.
- V1 capabilities and explicit non-goals: no paid billing provider, marketplace,
  customer-defined plugin execution, public-data connector without an approved
  provider, native mobile app, or autonomous AI action.
- Data-classification categories: public reference geography, organization
  business data, account/contact PII, credentials/secrets, audit/security data,
  and optional AI prompts/outputs.
- Product success criteria expressed behaviorally, not invented market numbers:
  tenant isolation; repeatable imports; traceable metrics; reproducible reports;
  usable no-AI path; accessible client journeys; observable and recoverable
  operations.
- Glossary: organization, member, region, dataset, dataset version, mapping,
  observation, metric definition, dashboard, report, insight, evidence,
  ingestion run, export, and audit event.

Do not invent billing plans, retention periods, user counts, performance SLOs,
or compliance certifications. Mark them as decisions that need real business or
operational input.

### 2. `docs/system-architecture.md` — add

This is the canonical target-state system design. Start with a conspicuous
legend that labels **current**, **target**, and **deferred** capabilities.

#### Architecture principles

Record these as binding target rules:

- Modular monolith first; extract a service only after measured scaling,
  isolation, or deployment needs justify it.
- One repository and shared domain/application code, with separately runnable
  API and worker processes.
- Feature modules own their data and application services; another module may
  call their public interface but may not query their tables directly.
- Controllers and resolvers are transport adapters. They do not contain domain
  rules or Prisma queries.
- Application services depend on ports; Prisma, object storage, queue, mail,
  telemetry, and AI implementations are adapters.
- PostgreSQL is authoritative. Valkey is queue/cache infrastructure, never the
  sole record of product state.
- Every tenant-owned row is scoped to an organization and tested for negative
  cross-tenant access.
- Uploaded source files and generated artifacts live in object storage;
  PostgreSQL stores their metadata, lifecycle, checksum, and ownership.
- Deterministic analytics work without AI. AI outputs are drafts backed by
  explicit evidence.

#### Required diagrams

Use Mermaid diagrams whose node names match the text:

1. System context: browser, operators, optional SMTP/data/AI boundaries.
2. Runtime containers: Caddy, Next client, Nest API, Nest worker,
   PostgreSQL/PostGIS, Valkey, Garage, ClamAV, mail, telemetry, optional AI.
3. Same-origin HTTP routing: `/` to Next, `/api/*` and `/graphql` to Nest,
   upload/download presigned paths to Garage as an explicit trusted boundary.
4. Upload/ingestion sequence: initiate, upload to quarantine, complete, outbox,
   scan, inspect, parse, map, validate, normalize, aggregate, publish.
5. Tenant/RLS request flow from authenticated session through organization
   context and transaction-local database context.
6. Deployment profiles: local development, single-host self-hosted production,
   and the deferred scale-out shape.

#### Runtime components and FOSS matrix

Document component responsibility, failure effect, persistence, exposure,
backup need, scaling unit, selected license, and replacement seam for:

- Node 24 LTS as the target production runtime. The existing Node 22 image is
  current state and moves only in a later infrastructure prompt.
- Next.js/React client.
- NestJS 11/Express API and separate Nest worker entry point.
- Prisma 7.9.1. Prisma 8 remains deferred until GA and a dedicated migration
  prompt; do not architect against its RC contract.
- PostgreSQL with PostGIS.
- Valkey with BullMQ, private networking, authentication, persistence, and
  `noeviction`.
- Garage as the S3-compatible self-hosted reference.
- ClamAV for untrusted-file scanning.
- Caddy for reverse proxy and automated TLS.
- OpenTelemetry, Prometheus, and an optional Grafana operations profile.
- Mailpit in development and a provider-neutral SMTP interface in production.
- Optional `llama.cpp` CPU/local and vLLM GPU profiles behind one AI port.

Explicitly reject MinIO as the reference: its current default license permits
unpaid non-production internal evaluation, not the chosen FOSS production use.
Do not claim the matrix is legal advice.

#### Nest module map

Specify target modules and their ownership:

- identity/sessions;
- organizations/memberships/invitations/permissions;
- geography;
- datasets/dataset versions/uploads/ingestion;
- metric definitions/observations/aggregates/data quality;
- dashboards/saved views;
- reports/revisions/insights/evidence;
- exports/artifacts;
- jobs/outbox/schedules;
- notifications;
- audit/admin;
- optional AI generation/evaluation;
- health/config/security/telemetry infrastructure.

Define allowed dependency direction and identify how the current `accounts`,
`auth`, `sessions`, `regions`, `forms`, and `jobs` modules migrate without
pretending that migration has happened.

#### Target data model

Describe aggregate ownership, required constraints, deletion behavior, and
principal query/index paths. The blueprint must include at least:

- identity: `Account`, `Session`, email-verification and password-reset token
  records;
- tenancy: `Organization`, `Membership`, `Invitation`, optional entitlement
  boundary without a billing provider;
- geography: globally shared hierarchical `Region`, stable external codes,
  aliases, and PostGIS geometry separated where Prisma requires unsupported
  spatial columns/raw SQL;
- ingestion: `Dataset`, immutable `DatasetVersion`, `StoredObject`, `Upload`,
  `ColumnMapping`, `IngestionRun`, `ValidationIssue`;
- analytics: `MetricDefinition`, `Observation`, quality flags, time periods,
  units, and dimensions;
- presentation: `Dashboard`, `SavedView`, `Report`, `ReportRevision`, `Insight`,
  and evidence links to immutable source/version/observation identities;
- operations: `Export`, `JobRun`, `OutboxEvent`, `Notification`, `AuditEvent`,
  and optional `AiGeneration`.

State the type rules: UUIDv7 for opaque public identifiers; `timestamptz` for
events; `double precision` for ordinary measured values; `numeric` only where
exact decimal semantics are required; checks preventing ambiguous observation
value types; foreign-key indexes; uniqueness scoped to organization; JSONB
only for genuinely variable dimensions/metadata, never as a substitute for
known relational fields.

#### Tenant isolation and database roles

Specify:

- organization-scoped repository interfaces as the first line of defense;
- `organization_id` on every tenant-owned root and child where direct policy
  evaluation/query paths require it;
- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`;
- request-scoped tenant context applied with `SET LOCAL` inside a database
  transaction through a non-owner API role;
- a separately constrained worker role and an explicit, audited system-job path;
- migration/owner credentials unavailable to API and worker containers;
- default-deny behavior when tenant context is absent;
- integration tests that attempt reads, writes, updates, relation traversal,
  GraphQL node access, exports, and background jobs across two organizations.

Do not state that Prisma natively models or creates the PostGIS/RLS SQL. Record
the reviewed SQL-migration and integration-test boundary.

#### REST, GraphQL, events, and client boundary

Pin these interfaces:

- `/health` stays unversioned for infrastructure.
- REST is URI-versioned under `/api/v1`.
- REST owns auth/session/CSRF, organizations and members, upload initiation and
  completion, ingestion commands, job control, exports/downloads, webhooks, and
  administrative mutations.
- `/graphql` is an authenticated, initially read-only surface for regions,
  datasets, metrics, dashboards, reports, and evidence.
- REST and GraphQL call the same authorization policies and application
  services; GraphQL resolvers do not call REST and do not query Prisma directly.
- GraphQL uses cursor pagination, request/tenant context, DataLoader batching,
  input/query-size, depth, complexity, timeout, and result-size limits.
- GraphiQL and verbose errors are development-only. Introspection policy must
  be an explicit deployment decision, not mistaken for an authorization control.
- SSE is the initial ingestion/export progress transport. GraphQL subscriptions
  are deferred until a real consumer requires them.
- OpenAPI is generated and committed/checked for REST. GraphQL SDL is generated
  deterministically and checked for breaking drift.
- Commands that can be retried accept an idempotency key. Mutable collaborative
  resources use an explicit version/ETag strategy. Cursor formats are opaque.
- REST failures preserve stable error codes and request IDs; GraphQL errors use
  sanitized messages and `extensions.code`/request ID.
- Production is same-origin behind Caddy. The later client prompt must verify
  Next 16.3 proxy, cookie, caching, and server-fetch APIs from `node_modules`
  before implementation.

Include a route/resolver capability matrix, but do not invent every field of
future wire DTOs. Each implementation phase owns its exact DTO/schema review.

#### Upload, queue, and ingestion state machine

Specify:

- short-lived presigned upload into an organization-scoped quarantine prefix;
- object keys based on organization/upload IDs, never raw filenames;
- declared/detected media type, extension allowlist, byte and row/column limits,
  checksum, archive expansion, parser time/memory, nesting, and geometry checks;
- scan-before-parse with fail-closed timeout behavior;
- staged jobs: inspect → scan → parse → map → validate → normalize → persist →
  aggregate → publish;
- immutable versions, idempotent/restartable stages, retry taxonomy, dead-letter
  handling, cancellation, progress, retention, and orphan cleanup;
- transactional outbox between PostgreSQL state changes and queue publication;
- formula escaping in spreadsheet exports and untrusted-text rendering rules;
- job payloads containing identifiers rather than entire datasets or secrets;
- queue authorization and private-network requirements.

#### Optional AI boundary

Specify that AI is disabled by default and cannot authorize, mutate source data,
publish reports, or execute arbitrary tools. The deterministic service selects
minimal authorized evidence; the AI adapter receives that evidence plus a
versioned prompt and returns schema-validated draft output. Persist model,
model-license record, runtime, prompt version, dataset/report version, evidence
IDs, timestamps, output, evaluation status, and human publication decision.

Require tenant-bound context, prompt-injection tests, unsupported-claim checks,
timeouts, concurrency limits, circuit breaking, output size limits, observability
without raw sensitive prompts by default, and a complete no-AI fallback.

#### Operations

Define local and production topology, configuration/secrets ownership,
readiness/liveness semantics, graceful shutdown, backups and restore testing,
RPO/RTO as user-owned values to be selected before launch, audit retention,
dependency/container scanning, structured logs, metrics/traces, alert classes,
and capacity signals that justify scaling or partitioning.

Docker Compose + Caddy is the reference single-host production deployment.
Kubernetes, Terraform, cloud providers, managed services, and multi-region
deployment remain deferred until an operator/provider decision exists.

### 3. `docs/security.md` — add

Use the installed `security-threat-model` skill and its required output
contract, adapting the filename to this repository-owned path. Scope current
code separately from target architecture. Include:

- assets and data classes;
- actors and realistic attacker capabilities/non-capabilities;
- every runtime and CI trust boundary;
- entry points: REST, GraphQL, SSE, cookies/CSRF, uploads, parsers, presigned
  storage, queue payloads, workers, SMTP, AI, logs, metrics, CI, and migrations;
- prioritized abuse paths with likelihood, impact, affected assets, existing
  controls, target mitigations, validation method, and owning build phase;
- explicit high-priority coverage for cross-tenant reads/writes, role escalation,
  session/CSRF compromise, malicious uploads, decompression/parser exhaustion,
  spreadsheet formula injection, SSRF, object-key manipulation, GraphQL query
  abuse, queue poisoning/replay, AI prompt injection/data leakage, secret
  exposure, audit tampering, and targeted availability attacks;
- security acceptance tests and open assumptions.

Do not claim a penetration test, certification, regulatory compliance, or a
control that exists only in the target design.

### 4. `docs/build-plan.md` — add

Translate the architecture into ordered, separately reviewable implementation
phases. Each phase must list dependency, objective, target behavior, main
subsystems, migrations/config changes, non-goals, security cases, tests,
observability, rollback/compatibility boundary, documentation owner, and exit
criteria.

Use the following phase contracts. The resulting document must include the
skill row from the whole-build manifest beside every phase rather than relying
on readers to cross-reference it.

#### Phase 1 — architecture foundation (this prompt)

- **Produces:** the five new canonical documents, the implemented-to-target
  bridge in `docs/backend.md`, the concise `AGENTS.md` index/invariants update,
  the full skill installation, and architecture/security review findings.
- **Proves:** every architecture claim is current, target, or deferred; every
  selected dependency has a verified role/license; every later phase has an
  owner, dependency, acceptance boundary, and skill manifest.
- **Does not build:** runtime components, schema migrations, APIs, UI, or local
  infrastructure.
- **Exit evidence:** complete local links, clean skill lock, passing repository
  checks, reviewed docs, and one commit.

#### Phase 2 — infrastructure and first database migration

- **Produces:** a developer Compose topology for PostgreSQL/PostGIS first, then
  service profiles required by later phases without activating unused services;
  `.env.example` contracts; health/readiness distinction; deterministic service
  start/stop/reset instructions; an integration-test database harness; and the
  first Prisma 7 migration generated against a real database.
- **Runtime decision:** update target build/CI containers to Node 24 LTS only
  after verifying every package and Prisma generator under that runtime. Do not
  upgrade to Prisma 8 RC.
- **Database baseline:** enable only the PostgreSQL extensions already approved
  by the architecture; record extension versions; create a non-owner runtime
  role, migration role, and test role; make migration application explicit in
  deploy rather than server boot.
- **Migration discipline:** generate, inspect, and commit SQL; test fresh apply,
  rollback strategy (forward corrective migration unless an exact reversible
  down path exists), drift/status, and restoring an empty database from the
  migration chain.
- **Tests:** real Prisma integration CRUD for every current model, unique/FK
  constraints, session cascade, current route reads/writes against Postgres,
  container health, graceful shutdown, and CI parity.
- **Failure cases:** missing extension, wrong credentials, pending migration,
  unavailable database, invalid env, and non-owner permission denial.
- **Non-goals:** organizations/RLS policies, Valkey, Garage, upload processing,
  and new product routes.
- **Exit evidence:** one-command documented local boot; first migration applies
  from zero; integration suite uses no Prisma double for database assertions;
  current e2e suite still passes; recovery/reset procedure is explicit.

#### Phase 3 — organizations, permissions, and RLS

- **Produces:** `Organization`, `Membership`, invitation and recovery-token
  migrations; the fixed `owner/admin/analyst/viewer` permission map; active
  organization request context; tenant-scoped repository ports; RLS policy SQL;
  audited privileged-worker/system access; and organization/member APIs needed
  by the later client.
- **Ownership invariants:** at least one owner; only authorized roles can invite,
  change roles, revoke memberships, or transfer ownership; the last owner cannot
  be removed; a membership has one organization-local role; sessions remain
  account-scoped while every product request resolves an allowed organization.
- **RLS mechanics:** API and worker connections use non-owner roles; tenant
  context is transaction-local; absent context is default-deny; pool reuse
  cannot leak prior context; migrations verify `FORCE ROW LEVEL SECURITY`.
- **Compatibility:** migrate existing accounts without inventing organizations
  for unknown real users. Define an explicit bootstrap/development flow and a
  production migration gate before any live-data migration.
- **Tests:** two-organization matrix across direct repositories, REST, relation
  traversal, transaction reuse, updates/deletes, audit rows, and privileged jobs;
  full role-permission table; invitation expiry/replay; last-owner invariant;
  session/CSRF regression.
- **Failure cases:** no selected organization, stale membership, revoked invite,
  concurrent owner changes, missing RLS context, database owner accidentally
  used by runtime, and cross-tenant guessed UUID.
- **Non-goals:** billing, SSO/SAML, custom roles, SCIM, GraphQL, uploads, and UI.
- **Exit evidence:** automated negative isolation proof, reviewed SQL policies,
  permission documentation, and no controller-level hand-written role strings.

#### Phase 4 — versioned REST and complementary GraphQL platform

- **Produces:** `/api/v1`, temporary migration handling for existing routes,
  generated OpenAPI, generated deterministic GraphQL SDL, authenticated
  read-only GraphQL, request/correlation IDs, standard errors, cursor utilities,
  idempotency storage/behavior, DataLoader infrastructure, and contract checks.
- **REST rules:** auth/files/commands remain REST; health stays unversioned;
  state-changing retryable commands define idempotency scope, request hash,
  replay response, conflict behavior, expiry ownership, and concurrency tests.
- **GraphQL rules:** only approved queries; no duplicate mutation surface;
  organization context before resolver work; loaders scoped per request;
  cursor pagination; depth/complexity/query-size/result-size/time limits;
  development-only GraphiQL and sanitized production errors.
- **Compatibility:** because no client currently consumes the API, migration can
  be finite. Document which old paths redirect, alias, return deprecation
  headers, or are removed, and test that deadline mechanically.
- **Contracts:** detect unintended OpenAPI and SDL drift in CI; define breaking
  versus non-breaking changes; shared interfaces must not import Nest/Apollo
  decorators into `packages/shared`.
- **Tests:** version routing, envelopes/errors, GraphQL authorization, aliases,
  cursor stability, DataLoader batching/N+1 query count, complexity rejection,
  idempotent replay/conflict, CSRF/session parity, and schema snapshots.
- **Failure cases:** malformed/foreign cursor, duplicate idempotency key with a
  different body, cross-tenant global ID, oversized query, resolver timeout,
  introspection/GraphiQL production configuration, and internal error leakage.
- **Non-goals:** GraphQL mutations/subscriptions, generated client SDK, uploads,
  dashboards, and external API consumers.
- **Exit evidence:** published route/query matrix, committed contracts, negative
  auth/complexity tests, and no resolver/controller bypass of application ports.

#### Phase 5 — client/backend connection and authenticated shell

- **Prerequisite reads:** relevant Next 16.3 docs under `node_modules/next/dist/docs/`
  for proxies/rewrites, server fetching, caching, cookies, headers, forms, and
  route conventions; local `client/components/ui/` APIs; all owning design docs.
- **Produces:** same-origin development/production routing; server-safe API
  client and browser mutation client; CSRF acquisition/refresh; register/login/
  logout/session flows; organization selection; protected application layout;
  role-aware navigation; dashboard empty state; error/loading/offline/session-
  expired states; and Playwright fixtures/journeys.
- **Boundary rules:** never expose secrets or database access to Next; no ad-hoc
  fetch calls scattered through components; Server Components own initial reads;
  client leaves own browser-only mutation/interactivity; cache authenticated
  organization data only with a verified per-user/per-org strategy.
- **Design process:** no product-app comp currently exists. Use the established
  Acres tokens/primitives and `frontend-design` to create a deliberate extension,
  record it as new product UI rather than comp fidelity, and document responsive
  behavior at 375/800/1280.
- **Accessibility:** skip/focus order, semantic headings/landmarks, labelled
  fields, password-manager compatibility, live error/status feedback, touch
  targets, reduced motion, focus restoration, and keyboard organization switcher.
- **Tests:** anonymous redirect/return path, register/login/logout, bad
  credentials without enumeration, CSRF rotation, expired/revoked session,
  organization switching, role-hidden and server-forbidden actions, back/forward,
  refresh/deep-link, and 375/800/1280 browser coverage.
- **Failure cases:** API unavailable, slow request, duplicate submit, stale CSRF,
  removed membership, cross-origin misconfiguration, hydration mismatch, and
  cached data from the prior organization.
- **Non-goals:** dataset upload UI, real charts, reports, billing, and motion not
  justified by the new interaction specification.
- **Exit evidence:** authenticated journey works against the real API/database;
  no client-side auth-only security; accessibility and browser review complete.

#### Phase 6 — object storage, queues, worker, and secure uploads

- **Produces:** Garage adapter/buckets, Valkey/BullMQ configuration, separate
  worker entry point/image/process, transactional outbox dispatcher, ClamAV
  adapter, upload initiation/completion/status/cancel APIs, presigned URL flow,
  quarantine/accepted/rejected lifecycle, progress SSE, retry/dead-letter and
  cleanup schedules, and operational metrics.
- **Storage invariants:** opaque organization/upload-based keys; bucket/prefix
  policy; checksum and byte count; short signature expiry; content disposition
  on download; no raw filename as a path; lifecycle and deletion are auditable.
- **Queue invariants:** identifier-only payloads; idempotent processors; bounded
  concurrency; retryable versus terminal error taxonomy; deterministic job IDs;
  no eviction; private/authenticated Valkey; outbox publication observability;
  graceful worker drain and stalled-job recovery.
- **Security stages:** allowlisted formats, declared/detected type comparison,
  byte limits before/during upload, scan before parse, fail-closed scan timeout,
  archive expansion/nesting limits, parser CPU/memory/time budget, quarantine
  isolation, and rejected-object retention/deletion policy left configurable.
- **Tests:** valid/invalid signature, key tampering, cross-tenant upload status,
  checksum mismatch, oversized stream, malware fixture, scan timeout, duplicate
  completion, duplicate outbox delivery, API crash after commit, worker restart,
  retry/dead letter, cancellation, SSE disconnect, and orphan cleanup.
- **Failure cases:** Garage/Valkey/ClamAV unavailable independently, partial
  upload, expired URL, object exists without DB row, DB row exists without
  object, poison job, lost SSE client, and clock skew.
- **Non-goals:** parsing/importing the accepted file into analytics tables,
  public connectors, multi-region storage, and customer-controlled buckets.
- **Exit evidence:** durable restart tests, outbox reconciliation proof, threat
  model updated, and no unscanned object reaches the ingestion parser boundary.

#### Phase 7 — geography and upload-first ingestion

- **Produces:** global arbitrary-depth region hierarchy and PostGIS geometry;
  dataset/version/mapping/ingestion/validation schema; CSV, XLSX, and GeoJSON
  adapters; inspect/map/validate/normalize/persist/publish workers; preview and
  mapping APIs; data lineage; quality issue reports; and an analyst mapping UI
  only if separately specified within the phase prompt.
- **Geography rules:** canonical codes/source/version, parent-cycle prevention,
  valid SRID, geometry validation/repair policy, spatial index, global versus
  tenant-owned metadata separation, aliases, and deterministic region matching
  with unresolved/ambiguous matches surfaced to the analyst.
- **Version rules:** source object immutable; mapping and schema versioned;
  draft validation can be rerun; publish is atomic; published observations point
  to one immutable dataset version; replacement creates a new version rather
  than editing history.
- **Parser rules:** explicit encoding/delimiter/header handling, formula cells
  treated as data not execution, XLSX sheet choice, streaming/chunking, GeoJSON
  feature/property bounds, null/type/date/number/unit normalization, locale
  ambiguity surfaced rather than guessed.
- **Tests:** deep hierarchy and cycle rejection, valid/invalid/mixed geometry,
  ambiguous region names, duplicate rows, encoding/delimiter variants, huge row,
  excessive columns/features, XLSX formulas, malformed archives, restart midway,
  publish transaction rollback, repeat import idempotency, and two-tenant access.
- **Failure cases:** no header, schema drift, source removed, unsupported CRS,
  invalid polygon, partial worker batch, database timeout, mapping changed during
  run, and user cancels before/after publish boundary.
- **Non-goals:** external API connectors, probabilistic entity matching without
  review, raster GIS, a data lake, or invented seed datasets.
- **Exit evidence:** a synthetic clearly labelled fixture imports end-to-end;
  lineage reproduces every published value; failed imports publish no partial
  version; query plans cover spatial and version access paths.

#### Phase 8 — metrics, observations, quality, and deterministic analytics

- **Produces:** metric-definition and observation schema, period/unit/dimension
  rules, quality flags and thresholds, aggregate/read-model jobs, deterministic
  comparisons/trends/anomalies, provenance endpoints/queries, and documented
  calculation definitions.
- **Semantic rules:** one canonical metric identity per organization/domain;
  compatible units before comparison; explicit time grain/time zone; no silent
  aggregation across incompatible dimensions; null/missing is distinct from
  zero; calculation/version changes do not rewrite historical meaning.
- **Storage rules:** relational columns for known access paths; bounded JSONB
  dimensions; exactly one supported observation value form; unique natural
  ingestion key; append/replace behavior explicit; indexes justified by real
  queries; partitioning only after measured evidence.
- **Analytics rules:** formulas are versioned pure functions; inputs and output
  provenance recorded; thresholds configurable and auditable; deterministic
  output stable across retries; no AI language in this phase.
- **Tests:** units, period boundaries, leap years/time zones, null/zero, duplicate
  observations, incompatible dimensions, precision, threshold edges, aggregate
  invalidation/rebuild, source-version replacement, two-tenant isolation, and
  query-plan budgets on representative synthetic volumes.
- **Failure cases:** late data, correction, partial aggregate refresh, stale
  materialized view, removed metric definition, unknown unit, and dimension
  explosion.
- **Non-goals:** predictive ML, generative summaries, customer billing KPIs
  unless present in uploaded data, or denormalization without measurement.
- **Exit evidence:** calculation catalog and golden fixtures; same inputs produce
  same outputs; provenance reaches immutable source rows; performance evidence
  accompanies every non-obvious index/read model.

#### Phase 9 — dashboards, saved views, and optimized GraphQL reads

- **Produces:** dashboard/saved-view models, filter/query grammar, GraphQL region/
  metric/dashboard projections, batching/caching strategy, chart/table/map UI,
  accessible empty/loading/error states, share-within-organization permissions,
  and end-to-end exploration journeys.
- **Information design:** every chart names metric, unit, period, geography,
  source/version, and quality state; default visual form matches the data; table
  alternative/download exists where required; colors never carry meaning alone.
- **GraphQL performance:** request-scoped DataLoaders, bounded filters and date
  ranges, cursor pagination, cost weights for spatial/aggregate fields, query
  count and latency instrumentation, no cross-request tenant cache keys.
- **State rules:** saved filters are versioned/validated against current metric
  definitions; deleted/inaccessible dependencies degrade explicitly; URL state
  is shareable only within authorization boundaries; organization switch clears
  all client/query state.
- **Tests:** keyboard/screen-reader chart exploration, table equivalence,
  responsive 375/800/1280 layouts, no-data/partial-quality, complex query reject,
  N+1 count, cache isolation, saved-view migration, deep link, export handoff,
  and cross-tenant global IDs.
- **Failure cases:** slow aggregate, stale definition, removed region, too many
  series, invalid filter, large geometry, expired session during interaction,
  and browser back/forward state.
- **Non-goals:** public dashboard sharing, real-time streaming analytics,
  collaborative editing, or AI-generated narration.
- **Exit evidence:** representative dashboards remain decision-readable and
  accessible; GraphQL query budgets are measured; no data leaks through cache,
  error, autocomplete, or count fields.

#### Phase 10 — reports, evidence, exports, and governed collaboration

- **Produces:** report/revision/section/evidence schema, draft/review/publish
  lifecycle, explicit permissions, comments only if confirmed in the phase
  prompt, background CSV/PDF export, signed downloads, artifact expiry, and
  report/export audit history.
- **Reproducibility:** a published report pins dataset versions, calculations,
  saved-view/filter state, author/reviewer, timestamps, and evidence identities;
  later data changes create a new revision rather than altering the published
  artifact.
- **Export security:** server-side authorization at request and download,
  unguessable keys, short-lived signatures, filename/content-disposition safety,
  spreadsheet formula escaping, resource/page/row limits, watermark/classification
  policy only if product-approved, and artifact cleanup.
- **Narrative rules:** claims link to evidence; quality/missing data is visible;
  `data-storytelling` improves clarity but may not fabricate causal claims.
- **Tests:** draft/publish permissions, concurrent revision conflict, evidence
  removed/inaccessible, export retry/idempotency, formula injection, Unicode/
  RTL/long text, large report limits, expired/tampered link, cross-tenant object,
  worker restart, and published-version immutability.
- **Failure cases:** renderer crash, storage unavailable, partial export, source
  version archived, reviewer membership revoked, and cleanup racing download.
- **Non-goals:** public anonymous links, e-signatures, regulatory records status,
  office-suite editing parity, and AI authoring.
- **Exit evidence:** published report is reproducible from pinned evidence;
  export is byte-traceable/audited; expired/revoked access fails at storage and
  application layers.

#### Phase 11 — optional local AI insights

- **Produces:** disabled-by-default AI port/adapters, CPU/local `llama.cpp` and
  GPU `vLLM` deployment profiles only after version/model-license verification,
  allowlisted model registry, versioned prompt templates, schema-validated draft
  generation, evidence/grounding records, evaluation corpus, human review/
  publish controls, telemetry, and complete no-AI behavior.
- **Data boundary:** deterministic application services select already-authorized
  minimal evidence; tenant context accompanies every job; external model calls
  are not silently enabled; raw prompts/tenant data are not logged by default.
- **Authority boundary:** AI cannot execute tools, query arbitrary database
  records, modify observations, authorize users, publish reports, or create
  unsupported evidence. Output is always a draft until an authorized human act.
- **Prompt/output rules:** explicit task, evidence delimiters, untrusted-content
  treatment, structured schema, length limits, refusal/insufficient-evidence
  state, citations to internal evidence IDs, model/prompt/runtime versions.
- **Evaluation:** groundedness, citation validity, unsupported claims, prompt
  injection, cross-tenant leakage, sensitive-data handling, consistency,
  latency/resource bounds, human rating, model-upgrade regression, and no-AI
  product regression.
- **Failure cases:** model disabled/unavailable/timeout/OOM, malformed output,
  poisoned evidence text, context truncation, stale dataset version, job retry,
  model/license change, and reviewer rejects output.
- **Non-goals:** general chatbot, web browsing, autonomous agents, vector store/
  RAG, model training, paid API dependency, or AI-required core functionality.
- **Exit evidence:** red-team/evaluation thresholds approved in the phase prompt;
  every statement maps to allowed evidence or is rejected; disabling AI leaves
  all deterministic journeys passing.

#### Phase 12 — observability, recovery, delivery, and launch hardening

- **Produces:** OpenTelemetry server/worker instrumentation, Prometheus scrape/
  alerts, Grafana operational dashboards, structured/redacted logs, trace/request/
  job correlation, CI SAST/dependency/container checks, promotion pipeline,
  Caddy/Compose production runbook, backups, automated restore verification,
  secret rotation, retention jobs, load/soak tests, incident and rollback
  runbooks, and refreshed security/accessibility reviews.
- **Signals:** HTTP/GraphQL latency/error/volume; database pool/query/migration;
  RLS denial anomalies; queue depth/age/failure/retry/stall; ingestion throughput/
  quality; object/scan failures; SSE connections; export/AI resource use; backup
  age/restore result; business metrics only where definitions are approved.
- **Alerts:** actionable symptom, owner, threshold/rationale, dashboard/runbook,
  severity, and silence/escalation path. Do not invent numeric SLO thresholds;
  gather baselines and obtain user/operator approval.
- **Recovery:** encrypted backups, off-host copy, restore into an isolated
  environment, migration compatibility, object/database consistency, Valkey
  queue recovery/reconciliation, documented RPO/RTO decisions, and periodic
  proof—not a backup-success log alone.
- **Delivery:** immutable images, pinned/reviewed actions, least-privilege CI,
  no production secrets in CI logs/images, migration gate before rollout,
  health/readiness check, graceful rollback/forward-fix decision, and audit of
  who promoted what.
- **Tests:** sustained representative workloads, tenant fairness, expensive
  GraphQL, concurrent imports/exports, worker loss, database/storage/Valkey
  interruption, restore drill, secret rotation, log redaction, alert firing,
  accessibility regression, and full critical Playwright journeys.
- **Non-goals:** Kubernetes/multi-region/active-active until measured demand and
  an approved operator/provider architecture exist.
- **Exit evidence:** approved operational checklist, measured capacity envelope,
  successful restore drill, threat-model mitigations closed or accepted by the
  user, no critical accessibility/security finding, and rollback/runbooks
  exercised rather than merely written.

Name the next prompt after this one as phase 2; do not create it in this change.
No dates or fabricated effort estimates.

### 5. `docs/skills.md` — add

Fulfil the existing promised-but-missing index row. Record:

- all project skill names, upstream source, exact skill path, current hash from
  `skills-lock.json`, purpose, and loading trigger;
- the installation commands used in this prompt;
- `.agents/skills/` as the real project copy and `.claude/skills/` as matching
  symlinks under the current repository convention;
- update/review procedure and the rule that a skill update is a code-reviewable
  dependency change;
- why every newly installed skill was selected and which build phases require
  it;
- why cloud deploy, microservice, generic Node, duplicate database, and Prisma 8
  RC skills were excluded.

Do not manually duplicate the complete contents of each skill.

### 6. `docs/backend.md` — update

Preserve the current build record. Add a compact target-architecture bridge that
links to `docs/product.md`, `docs/system-architecture.md`, `docs/security.md`,
and `docs/build-plan.md`, and clearly states which current constraints are
superseded only after future phases land:

- unversioned application routes;
- single-account/no-organization authorization;
- in-process scheduler and one-enabled-replica constraint;
- lack of a database/migration;
- no PostGIS, queue, object store, worker, GraphQL, OpenAPI, or client API usage;
- Node 22 container baseline.

Do not rewrite historical verification output or describe target components as
installed.

### 7. `AGENTS.md` — update

Keep the selected cap/progressive-disclosure rule. Make only concise governing
changes:

- add index rows for the new product, architecture, security, build-plan, and
  completed skills documents;
- add the new skills to §4 with exact trigger scopes;
- correct §6's stale statement that there is no `typecheck` or test script;
  current root scripts are `lint`, `typecheck`, `build`, and `test:server`;
- extend §8.2 after existing step 8 with the target phases from
  `docs/build-plan.md`, while keeping the detailed work in that document;
- add concise product/backend invariants: B2B organizations, global region
  hierarchy, upload-first ingestion, app + RLS tenant isolation, REST/GraphQL
  complementarity, deterministic core/optional AI, modular monolith, and FOSS
  meaning;
- identify `docs/system-architecture.md` as the target-state authority and
  `docs/backend.md` as the implemented-state record;
- keep the rule that repository and git history, not prompt existence, decide
  what is actually built.

Do not paste the complete architecture or roadmap into `AGENTS.md`.

## Compatibility, migration, and non-goals

- No public API or GraphQL interface changes in this prompt.
- No Prisma schema or migration changes.
- No new npm runtime/development dependencies beyond project Agent Skills.
- No Docker Compose, Caddyfile, worker entry point, object-store bucket, queue,
  ClamAV, telemetry collector, SMTP service, or AI runtime is created.
- No authenticated UI, dashboard, form, or design token changes.
- No fabricated regional data, seeds, billing plans, compliance status, SLOs,
  retention durations, or performance targets.
- No cloud provider, registry, DNS provider, mail provider, external data source,
  AI model, or production hardware is silently chosen.
- Existing backend history and tests remain truthful.

## Verification

After all documentation and skill changes:

1. Inspect `git status --short` and every changed path.
2. Confirm all Markdown local links and indexed files exist.
3. Search planned-component language and ensure every not-yet-built capability
   is labelled target/deferred rather than current.
4. Verify `.agents/skills/`, `.claude/skills/`, and `skills-lock.json` against
   the requested source/name set.
5. Run `git diff --check`.
6. Run and quote real output from:

   ```bash
   npm run lint
   npm run typecheck
   npm run build
   npm run test:server
   ```

7. Review `git diff --stat`, `git diff -- AGENTS.md`, every new document, and
   the skill lock/directory diff. Do not claim a check passed without its real
   exit status/output.
8. Use `requesting-code-review` to dispatch a reviewer subagent with the user
   decisions, this prompt, `BASE_SHA`, `HEAD_SHA`/working-tree scope, files
   changed, skills installed, sources checked, and verification output.
9. Load `receiving-code-review`, verify every finding against the repository and
   sources, fix valid issues, and rerun affected checks. Request follow-up review
   for any material architecture, public-interface, security, or data-model
   change.
10. Update the documentation verification record with facts from this run only.
11. Load `caveman-commit`, stage only this prompt's files, and commit to `main`.
    Do not push.

## Acceptance criteria

The change is complete only when:

- product intent, actors, journeys, scope, and glossary are explicit;
- current versus target versus deferred state cannot be confused;
- runtime boundaries, data ownership, tenant isolation, REST/GraphQL split,
  ingestion pipeline, AI boundary, deployment, and failure behavior are
  decision-complete;
- the FOSS stack and its license caveats are sourced and MinIO is not presented
  as the production reference;
- the security model covers every external and internal entry point;
- the build plan leaves later implementers no architectural choices while still
  reserving exact phase-local DTOs and measured performance tuning for their
  owning prompts;
- all new Agent Skills are reproducibly installed, indexed, and loadable;
- `AGENTS.md` remains concise and points to the canonical detailed documents;
- repository checks pass or any environment blocker is quoted exactly;
- the mandatory two-stage code-review loop is complete; and
- the work is committed on `main` with a `caveman-commit` message.
