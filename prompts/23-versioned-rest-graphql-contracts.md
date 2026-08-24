# 23 - versioned REST, GraphQL, and checked contracts

## Scope, and why it is next

The committed repository is on `main` at `aaf75fd`. Phase 3 is implemented and
recorded by that commit: organization membership, centralized permissions,
transaction-local tenant context, and forced PostgreSQL RLS now exist. Phase 4
in `docs/build-plan.md` is therefore the earliest unbuilt phase whose
dependencies are committed.

Implement Phase 4 as one transport-contract boundary:

- move every product REST route to `/api/v1` with an explicit, finite migration
  disposition for every old unversioned path;
- generate and commit a deterministic OpenAPI contract from the Nest code;
- add an authenticated, initially read-only `/graphql` endpoint whose
  resolvers call application/query services rather than REST controllers or
  Prisma directly;
- establish request and organization context before GraphQL data access;
- add request-scoped, tenant-safe DataLoaders, opaque stable cursors, bounded
  connections, and measured query-count assertions;
- reject GraphQL depth, alias, complexity, byte, result, and execution-time
  abuse with sanitized errors;
- add replay-safe idempotency for the selected organization commands where a
  retry can otherwise duplicate a durable effect;
- propagate a safe request ID through REST, GraphQL, logs, errors, and response
  headers;
- commit deterministic OpenAPI and GraphQL SDL artifacts and fail local/CI
  checks when either drifts;
- update the backend, architecture, security, and build-plan records from
  target state to the exact implemented state.

This remains one prompt because the cross-transport rules, error model,
organization context, request context, contract artifacts, and abuse controls
must agree. Landing only versioning, only GraphQL, or only contract generation
would leave an internally contradictory public surface.

## Reference material read while preparing this prompt

Repository authority:

- `AGENTS.md` §§2, 2.1, 4-8, and 10: phase control, prompt requirements,
  mandatory skills, checks, review/commit flow, implemented-state rules, and
  the prohibition on guessed APIs;
- `docs/build-plan.md` §§1, 4, 5, and 14: the committed Phase 3 dependency and
  complete Phase 4 outcome, exclusions, failure cases, tests, observability,
  rollback, skills, and exit evidence;
- `docs/backend.md` §§1-9, 11-14: pinned Nest/Express/Prisma stack, global app
  setup, current route and envelope contracts, sessions and CSRF, environment,
  test harnesses, deployment/CI, and implemented Phase 3 tenancy;
- `docs/system-architecture.md` §§2, 3.5, 5, 7, 8, and 11: modular-monolith
  dependency direction, principal-to-RLS flow, transport responsibility split,
  cross-transport rules, and observability/configuration boundaries;
- `docs/security.md` §§2-10: the current trust boundaries, TM-01, TM-03,
  TM-04, TM-10, TM-17, and TM-20, the GraphQL abuse path, acceptance suite,
  and critical review paths;
- `docs/product.md` §§2, 4, 6, and 7: fixed roles and permissions, V1 boundary,
  isolation success criterion, and still-open retention/SLO/scale decisions;
- `docs/skills.md` §§2-4: locked skill paths, hashes, triggers, and the Phase 4
  manifest;
- `server/package.json`, root `package.json`, and `package-lock.json`: the
  actual workspaces, scripts, Nest 11.2/Express 5/Prisma 7/Jest 30 baseline,
  and the fact that GraphQL/OpenAPI packages are not installed yet;
- `server/src/app.setup.ts`, `server/src/app.module.ts`, every current
  controller, `server/src/common/`, `server/src/sessions/`,
  `server/src/organizations/`, `server/src/prisma/`, and
  `packages/shared/src/`: the concrete middleware order, success/error
  envelopes, cookie session guard, organization policy/context, tenant
  transaction, and shared-contract conventions;
- `server/test/api.e2e-spec.ts`, `server/test/database.e2e-spec.ts`, and
  `server/test/helpers/`: the existing HTTP double and mandatory real-Postgres
  harnesses to extend;
- `.github/workflows/ci.yml`: Node 24, PostGIS service, migration/hardening
  sequence, server suite, and least-privilege `contents: read` job;
- local Nest 11.2 declarations under `node_modules/@nestjs/common` and
  `node_modules/@nestjs/core`: `enableVersioning`, `VersioningType.URI`, and
  `VERSION_NEUTRAL` exist in the installed version.

Loaded skill guidance and its routed references:

- architecture, Nest module/DI/guard/interceptor/versioning, REST/GraphQL,
  OpenAPI code-first tooling, opaque session/RBAC, Express secure defaults,
  Jest/E2E testing, typed errors, Postgres schema/index/query-plan work,
  GraphQL threat modeling, GitHub Actions, the review request template,
  review-feedback handling, and commit-message rules;
- specifically read the Nest rules for API versioning, DTO serialization,
  interceptors, guards, validation, transactions, and N+1 avoidance; the API
  skill's GraphQL schema guidance; the OpenAPI code-first/tooling reference;
  and the Express 5 security reference required by the security skill.

Live primary references checked on 2026-08-24 because the GraphQL packages are
not yet present locally:

- Nest versioning documentation: URI versions sit after a global prefix;
  unversioned controllers return 404 when no default version applies; and
  `VERSION_NEUTRAL` deliberately opts routes out;
- Nest OpenAPI documentation: `SwaggerModule.createDocument()` generates a
  serializable OpenAPI document and need not expose Swagger UI;
- Nest GraphQL quick start: the current Express/Apollo integration requires
  `@nestjs/graphql`, `@nestjs/apollo`, `@apollo/server`,
  `@as-integrations/express5`, and `graphql`; code-first supports a committed
  `autoSchemaFile` and deterministic `sortSchema`;
- Nest GraphQL complexity documentation: `graphql-query-complexity` integrates
  through an Apollo plugin and field/list costs must be explicit;
- the npm registry pages for the packages above were used only as a current
  version/license snapshot. Re-run registry verification immediately before
  installation; use mutually compatible stable releases, do not select a
  `next`/RC line, and record the installed versions and licenses in
  `docs/backend.md`.

No visual reference applies. This prompt changes no client component, asset,
layout, typography, color, motion, or rendered surface, so the design-system
board and landing PNGs are intentionally not opened.

## Binding architectural decisions

### Transport and dependency direction

Keep the existing modular monolith. The allowed flow is:

```text
REST controller ─┐
                 ├─> application/query service ─> scoped repository/service
GraphQL resolver ┘                              └─> TenantTransactionService
                                                       └─> Prisma/PostgreSQL + RLS
```

- A resolver must never call a REST controller or make an in-process HTTP
  request.
- Neither resolver nor controller may inject `PrismaService` or issue raw SQL.
- Shared application/query services own authorization-independent use-case
  orchestration; the transport adapter resolves principal, organization,
  permission, arguments, and response mapping.
- Existing command services may be refactored into narrower query/command
  providers where needed, but do not create a generic repository framework or
  duplicate the domain model for ceremony.
- REST keeps the existing `{ ok: true, data }` / `{ ok: false, error }`
  envelope. GraphQL follows GraphQL response semantics and must not be wrapped
  by `ResponseEnvelopeInterceptor`.
- Make `ResponseEnvelopeInterceptor` and `ApiExceptionFilter` explicitly
  HTTP-aware. GraphQL failures are mapped by one GraphQL formatter/plugin to
  stable, sanitized `extensions.code` and `extensions.requestId` values.

### Route versioning and old-route migration

Configure one global prefix, `api`, and Nest URI versioning with version `1` on
all product REST controllers. The canonical form is `/api/v1/<resource>`.
Do not accidentally produce `/v1/api` or `/api/api/v1`.

The migration is immediate and finite because repository inspection finds no
client caller or external consumer contract. The Phase 4 release itself is the
removal deadline for old product paths. Do not retain aliases that a later
phase would have to remember to remove.

| current route family | Phase 4 canonical route | old unversioned disposition |
| --- | --- | --- |
| `/auth/*` | `/api/v1/auth/*` | removed; integration test proves 404 |
| `/account` | `/api/v1/account` | removed; integration test proves 404 |
| `/regions`, `/regions/:slug` | `/api/v1/regions`, `/api/v1/regions/:slug` | removed; integration test proves 404 |
| `/forms/contact` | `/api/v1/forms/contact` | removed; integration test proves 404 |
| `/jobs/runs` | `/api/v1/jobs/runs` | removed; integration test proves 404 |
| `/organizations*`, `/invitations/accept` | same paths beneath `/api/v1` | removed; representative tests prove 404 |
| `/health`, `/health/ready` | unchanged | `VERSION_NEUTRAL`; operations probes must remain stable |
| `/graphql` | new and unversioned | GraphQL schema evolves additively; it is not a REST version alias |

Update all repository tests, documentation, Docker/CI health assumptions, and
manual commands consistently. Do not version `/health` or make it depend on
GraphQL. Do not serve a second `/api/v1/graphql` endpoint.

### Request context and stable errors

- Generate a cryptographically random UUID request ID at the server boundary
  for every HTTP request. Do not copy an untrusted arbitrary header into logs.
- Return it as `x-request-id`; expose that header through the existing exact
  CORS policy; make it available to HTTP filters/interceptors and GraphQL
  context/plugins without a global mutable variable.
- Use `AsyncLocalStorage` only if its lifecycle and test cleanup are explicit;
  otherwise attach a typed request context to the Express request and pass it
  into GraphQL context. Do not introduce request-scoped DI everywhere merely
  for correlation.
- Extend the shared REST error envelope with `requestId`. Keep existing error
  codes stable and add narrowly named codes only for version, cursor,
  idempotency, and query-limit failures that clients can act on.
- GraphQL errors expose no stack, SQL, Prisma, cookie, variables, foreign-ID
  existence, or internal exception message. Expected auth/permission/not-found/
  validation/limit failures receive stable codes; unexpected exceptions log
  server-side once and return `INTERNAL_ERROR` plus request ID.
- Log only bounded operation name, request ID, organization ID where already
  authorized, cost category, elapsed time, idempotency outcome, and denial
  category. Never log query variables, raw documents, cookies, CSRF tokens,
  idempotency keys, invitation tokens, emails, or response bodies.

## REST and OpenAPI contract

### Code-first documentation

- Add `@nestjs/swagger` at a stable version compatible with installed Nest 11.
- Decorate controllers/DTOs or add explicit schema factories until the
  generated document describes every canonical `/api/v1` operation, its
  request body/parameters, response envelope, error envelope, cookie session
  requirement, CSRF header on state-changing routes, idempotency header on
  eligible commands, status codes, tags, and operation IDs.
- Do not rely on reflected TypeScript interfaces: interfaces disappear at
  runtime. Use concrete documented DTO/output classes or explicit schemas and
  preserve `packages/shared` as the semantic contract owner.
- Health routes may appear as an operations tag but must remain unversioned.
- Do not publish Swagger UI in production. A local opt-in may expose read-only
  docs, but committed JSON is the review and CI contract.
- Generate canonical JSON with stable key ordering and no timestamps,
  environment-specific server URL, absolute local path, or nondeterministic
  examples. Commit it at `docs/api/openapi.json`.

### Generation and drift scripts

- Add a server script that creates a Nest app without listening, applies the
  same `configureApp()` setup, initializes it, generates OpenAPI, writes the
  deterministic artifact, and always closes the app/Prisma resources.
- Add a GraphQL SDL generation path from the initialized `GraphQLSchemaHost`.
  Prefer the code-first `autoSchemaFile` plus `sortSchema: true` only after its
  working-directory behavior is proven under root, workspace, test, and build
  commands; otherwise print the schema explicitly to a fixed repository path.
- Commit SDL at `docs/api/schema.graphql` and the human route/resolver matrix at
  `docs/api/contracts.md`.
- Add `contracts:generate` and a non-mutating `contracts:check`. The check must
  generate into a temporary directory or compare in memory, show a useful diff,
  and exit nonzero on drift; it must not rewrite tracked files in CI.
- Wire `contracts:check` into the existing `checks` CI job after build and
  before the server suite. Preserve Node 24, PostGIS, least-privilege workflow
  permissions, action pins, and the current Docker job.

## GraphQL v1 read surface

### Endpoint and environment posture

- Use Nest's Apollo driver on the existing Express 5 server. Verify exact peer
  compatibility from the registry immediately before install and capture the
  resulting lockfile. Do not use deprecated `apollo-server-express`, a
  prerelease Nest GraphQL major, subscriptions, federation, or a second server.
- `/graphql` is cookie-session authenticated. Preserve the existing global
  session-bound CSRF middleware for POST requests and prove the token flow in
  E2E tests; do not exempt GraphQL wholesale merely because this phase has no
  mutations.
- Production disables GraphiQL/playground, verbose debug errors, stack traces,
  schema polling, and introspection. Development/test introspection is allowed
  only through typed environment configuration and never by trusting a request
  header.
- Accept POST only for application GraphQL operations. Reject GET query
  execution so queries/variables do not enter URLs and intermediary logs.
- The schema contains `type Query` only. Contract tests must prove there is no
  mutation or subscription root.

### Principal and organization context

- Reuse opaque cookie sessions and the implemented membership/RLS policy. Do
  not introduce JWTs or GraphQL-specific role strings.
- Require a valid `x-organization-id` UUID on `/graphql`. Resolve the session,
  then current non-revoked membership, then build one immutable GraphQL request
  context before executing resolvers or loaders. Missing/foreign/revoked
  organization context fails without revealing whether the organization exists.
- The organization header must be included in exact CORS allowed headers.
- Request-scoped loaders are constructed only after that context exists. Each
  loader closes over the authorized organization context; its public key is a
  resource ID only, never `{ organizationIdFromClient, id }`.
- Every organization-owned load executes through `TenantTransactionService` so
  PostgreSQL receives transaction-local account/organization settings and
  forced RLS remains the second isolation layer.
- Global region queries remain globally scoped but are still authenticated on
  GraphQL. Their application service stays usable by public REST.

### Initial query contract

Expose only the reads needed to unblock the authenticated shell and to prove
transport complementarity:

- `viewer`: the authenticated account's safe profile plus its active
  organization membership/role; do not expose password/session/token fields;
- `organization`: the active organization summary selected by the header;
- `organizationMembers(first, after)`: permission `members.read`;
- `organizationInvitations(first, after)`: permission `invitations.read`, with
  metadata only and no raw/digest token;
- `organizationAuditEvents(first, after)`: permission `audit.read`, with a
  bounded public event shape and no secret payload;
- `regions(first, after)`: authenticated GraphQL view of the global list;
- `region(slug)`: one global region summary.

Use connection types with `edges { cursor node }` and `pageInfo` rather than
unbounded arrays. Start nullable only where absence is a real domain state; do
not make fields nullable merely to hide authorization errors. Every schema
field and argument needs a useful description.

Do not add organization/member/invitation mutations, auth mutations, uploads,
dashboards, saved views, reports, subscriptions, federation, SDK generation,
or speculative fields for later phases.

### Cursors, IDs, batching, and query plans

- Implement one versioned, base64url, authenticated opaque-value codec using
  Node crypto and the existing server secret with explicit domain separation;
  do not add home-grown encryption or expose raw JSON as the public cursor.
- A cursor payload binds schema version, connection/resource kind,
  organization scope where applicable, and the complete deterministic sort
  tuple. A cursor from another connection or organization, with invalid MAC,
  invalid encoding/version/shape, or a deleted anchor returns the same stable
  invalid-cursor error.
- Order every connection by a documented immutable tie-breaker. Prefer
  `(createdAt, id)` or the existing domain order plus `id`; never paginate by a
  non-unique column alone.
- GraphQL node IDs, where different backing types can share one `ID` space,
  carry type and tenant binding in the same authenticated codec. Foreign IDs
  resolve as not found, never forbidden-with-existence.
- Preserve input order and duplicates in every DataLoader result. Missing or
  RLS-filtered keys map to `null`/not-found without shifting results.
- Use one set-based query per batch, not `Promise.all` of point queries. Add or
  change indexes only when the exact cursor/loader query and `EXPLAIN` evidence
  justify it; put any schema change in one reviewed Prisma SQL migration.
- Real-Postgres tests must count queries for representative nested requests and
  prove count stays constant as fixture rows grow. Capture `EXPLAIN` for each
  new keyset query and record index/plan evidence in `docs/backend.md`; do not
  assert wall-clock timing in CI.

## GraphQL abuse controls

Install only the smallest verified dependencies needed. Nest documents
`graphql-query-complexity`; use it for cost analysis. Implement fragment-aware
depth and alias checks over the parsed document with GraphQL's supported AST
visitor API, or select a maintained compatible package after documenting why;
do not use a naive string/brace counter.

Controls must cover:

- HTTP body bytes before parsing;
- exactly one operation per request and a required operation name outside
  local development;
- fragment cycles, maximum selection depth, aliases, total field cost, list
  multipliers using requested `first`, and introspection posture;
- maximum `first`, default page size, total returned nodes, and execution time;
- sanitized rejection responses and bounded structured logging.

Numeric product scale and SLO decisions remain open in `docs/product.md`.
Therefore do not present recalled numbers as product truth. During
implementation:

1. add representative legitimate Phase 5 bootstrap and worst-allowed page
   queries as fixtures;
2. calculate their depth, alias count, field count, cost, result-node bound,
   serialized request bytes, and real-Postgres query count;
3. choose conservative provisional security ceilings above the legitimate
   fixtures, state the safety margin and denial behavior as an engineering
   judgment, and record them in `server/.env.example`, validation, tests,
   `docs/backend.md`, and `docs/security.md`;
4. require explicit production values for any retention or timeout whose safe
   value cannot be derived from the schema/test fixture. Development/test may
   have clearly labelled defaults;
5. never call these bounds performance SLOs or supported tenant scale.

Execution timeout must fail the client response and stop scheduling further
resolver work. Do not claim that `Promise.race` cancels an already-issued
PostgreSQL query; document that database statement cancellation/statement
timeout is required for hard query cancellation and set transaction-local
`statement_timeout` for GraphQL database work if verified through real PG tests.

## Idempotent organization commands

### Eligible operations

Require `Idempotency-Key` on these duplicate-producing commands:

- `POST /api/v1/organizations`;
- `POST /api/v1/organizations/:organizationId/invitations`;
- `POST /api/v1/organizations/:organizationId/ownership-transfers`;
- `POST /api/v1/invitations/accept`.

Do not apply generic idempotency to login, register, logout, CSRF issuance,
contact submission, GET, PATCH, or DELETE. Document the reason: auth cookie
rotation, anonymous contact semantics, and already-idempotent method/resource
semantics require different contracts. Do not add GraphQL mutations.

### Persistence and behavior

- Add a Prisma model and reviewed SQL migration for idempotency records. Store
  only a digest of the client key, principal account, nullable organization
  scope, stable operation identifier, canonical request-body hash, state,
  replayable success status/body, timestamps, and expiry.
- The uniqueness key must treat account-scoped null organization consistently;
  do not rely on ordinary PostgreSQL null equality accidentally allowing
  duplicates.
- Enable and force RLS. Account-scoped commands use transaction-local account
  context; organization commands also use organization context. Runtime/test
  roles remain non-owner/no-`BYPASSRLS` and receive only required grants.
- Never log/store the raw key. Validate a bounded printable header shape and
  hash with domain separation.
- Same key + same principal/scope/operation/body replays the original safe
  success status/body without repeating the effect. Same key with a different
  body returns a stable conflict. Another principal or organization cannot
  observe or collide with it.
- Concurrency must be database-serialized: two simultaneous identical requests
  create one durable effect and both receive the same outcome. A process-local
  map or check-then-insert race is forbidden.
- The idempotency reservation, business side effect, audit event, and stored
  replay outcome must share one database transaction. Refactor command services
  to accept/use the transaction boundary; a generic interceptor that commits
  separately is not sufficient.
- Store/replay only the application response, never `Set-Cookie`, CSRF tokens,
  request IDs, arbitrary headers, or unexpected 5xx details. A replay receives
  the current request ID.
- Expiry is an operator-selected retention decision. Add typed environment
  validation and require an explicit production value; label any dev/test
  default as provisional. Do not implement a cleanup scheduler in this phase;
  document the later operational cleanup owner.

## Expected files and change boundaries

Exact names may change when verified package APIs demand it, but keep changes
within these owners:

- root/server package scripts, `server/package.json`, and `package-lock.json`;
- `server/src/app.setup.ts`, a typed request-context module under
  `server/src/common/`, and transport-aware envelope/error handling;
- version annotations/configuration in existing controllers;
- a focused `server/src/graphql/` module containing configuration, context,
  guards/plugins, types/resolvers, opaque codec, pagination, and loaders;
- application/query-service and tenant-transaction refactors in the owning
  feature modules, not a GraphQL-to-Prisma shortcut;
- an idempotency module and one Prisma model/migration;
- shared error/contract types in `packages/shared/src/`;
- deterministic contract scripts/tests and `docs/api/openapi.json`,
  `docs/api/schema.graphql`, `docs/api/contracts.md`;
- server unit/E2E/real-Postgres tests and `.github/workflows/ci.yml`;
- `server/.env.example`, `docs/backend.md`, `docs/system-architecture.md`,
  `docs/security.md`, and the Phase 4 status line in `docs/build-plan.md`.

Do not touch `client/`, design assets, landing/chrome/motion docs, storage,
queues, uploads, ingestion, analytics, dashboards, reports, AI, deployment
topology, or unrelated dirty files.

## Tests and acceptance evidence

### Unit and contract tests

- request-ID generation/propagation and hostile header handling;
- REST-vs-GraphQL error mapping without stack/PII leakage;
- cursor/global-ID round trip, tamper, wrong type/version/connection/org,
  malformed encoding, deleted anchor, and stable error cases;
- DataLoader ordering, duplicate keys, missing keys, per-request cache, and no
  cross-request/org cache reuse;
- fragment-aware depth/alias/cost fixtures, list multipliers, operation-count,
  unnamed-operation, introspection, and byte-limit rejection;
- schema assertion for query-only roots and deterministic sorted SDL;
- OpenAPI assertion for every route, operation ID, request/response schema,
  cookie/CSRF/idempotency contract, and no old unversioned product path;
- contract generation twice from clean state produces byte-identical output;
  `contracts:check` passes clean and fails against a deliberate temp mismatch.

### HTTP/GraphQL E2E

- `/health` and `/health/ready` remain unversioned; canonical `/api/v1`
  auth/account/regions/forms/jobs/organization routes retain behavior;
- representative old unversioned product paths return 404 and no redirect;
- session cookie and CSRF token work on canonical REST and GraphQL POST;
- anonymous, expired/revoked session, missing/malformed/foreign/revoked org,
  stale membership, insufficient permission, guessed foreign ID, and sanitized
  unexpected-error cases;
- production-mode GraphiQL/introspection/debug are off; test-mode schema access
  is explicitly enabled through config;
- two organizations cannot cross-read organization, member, invitation, audit,
  cursor, global ID, or loader cache data;
- valid owner/admin/analyst/viewer reads match the centralized permission map;
- pagination has no duplicate/skip across tied sort values and rejects foreign
  or stale cursors consistently;
- depth, alias, complexity, body-byte, page/result, and execution-time limits
  reject before unbounded work and return request IDs;
- selected idempotent commands cover first success, exact replay, changed-body
  conflict, missing/invalid key, different principal/org, concurrent duplicate,
  expired record behavior, failed transaction retry, and no duplicate business
  row/audit event;
- login/register/logout/contact remain outside generic idempotency and retain
  their documented session/CSRF behavior.

### Real PostgreSQL evidence

- migration applies from zero and `prisma migrate status` is clean;
- idempotency table has expected unique semantics, `ENABLE/FORCE RLS`, grants,
  default deny, account/org isolation, and concurrency behavior under the real
  non-owner test role;
- pooled-connection reuse does not leak account/org/statement-timeout context;
- representative GraphQL connection and loader queries have recorded
  `EXPLAIN` output and constant query-count assertions as row counts grow;
- GraphQL database timeout uses a verified transaction-local PostgreSQL setting
  and clears at transaction end.

## Verification sequence

Run from the repository root and quote the real output in the implementation
handoff. Fix every failure before review:

```bash
npm run format --workspace=@acres/server
npm run lint
npm run typecheck
npm run contracts:generate
npm run contracts:check
npm run test --workspace=@acres/server
npm run test:server
npm run build
git diff --check
git status --short
git diff --stat
git diff -- docs/api/openapi.json docs/api/schema.graphql docs/api/contracts.md
git diff -- server/prisma/schema.prisma server/prisma/migrations server/src packages/shared/src
git diff -- .github/workflows/ci.yml package.json server/package.json package-lock.json
```

For real-Postgres tests, follow the existing documented sequence: start the
PostGIS service, bootstrap roles, apply migrations to app and test databases,
harden runtime privileges, run the full server suite with the non-owner test
URL, inspect migration status, and stop services without deleting unrelated
volumes. Quote the actual commands and outputs; do not claim RLS, concurrency,
query-plan, or timeout proof from mocks.

Also run a production-config smoke test against the built server proving:

- `/health` works;
- `/api/v1/auth/csrf` works;
- an old unversioned product route is absent;
- GraphiQL/introspection/debug are unavailable;
- a bounded authenticated GraphQL request succeeds with request ID;
- an over-limit request fails safely.

Do not add a browser/Playwright test: this phase changes no client UI and the
server HTTP/GraphQL journeys are covered more directly by Supertest and real
PostgreSQL. Phase 5 owns real-browser authentication.

## Mandatory review, documentation, and commit

After self-verification:

1. inspect every changed file and the complete diff;
2. invoke `requesting-code-review` and dispatch one read-only reviewer subagent
   with this prompt as requirements, a precise implementation summary, changed
   files, architectural/security decisions, checks and real outputs, and
   `BASE_SHA=aaf75fd` plus the implementation `HEAD_SHA`/working-tree diff;
3. invoke `receiving-code-review`, verify every finding against the repository,
   fix valid Critical/Important issues one at a time, and rerun proportional
   checks; ask the user if any feedback is materially ambiguous;
4. request follow-up review if fixes change a public contract, schema,
   transaction boundary, trust boundary, loader/context flow, or abuse control;
5. update `docs/backend.md` with exact installed versions/licenses, routes,
   OpenAPI/SDL generation, GraphQL schema/context/loaders/limits, idempotency
   transaction, migration, query-plan evidence, environment, tests, commands,
   and actual verification output;
6. update `docs/system-architecture.md` current/target state and cross-transport
   diagram/rules; update `docs/security.md` boundary, entry point, TM-01/TM-10/
   TM-20 controls and acceptance evidence; mark Phase 4 implemented in
   `docs/build-plan.md` only after all exit evidence exists;
7. stage only approved Phase 4 files, inspect the staged diff, invoke
   `caveman-commit`, and commit locally to `main` with a terse Conventional
   Commit message whose body records the security/contract migration reason;
8. do not push.

## Rollback and compatibility

- Runtime rollback reverts the Phase 4 commit as one unit: GraphQL module,
  versioning, contract artifacts, idempotency model/migration usage, and CI
  drift check. Database rollback is forward-fix after shared environments have
  applied the migration; do not drop idempotency history casually.
- Health probes remain compatible throughout.
- Product REST paths have an intentional immediate breaking change because no
  repository client consumes them. Record that fact and the evidence. If
  execution discovers a real consumer, stop and ask rather than silently keep
  or remove aliases.
- GraphQL launches additive/read-only. Future schema changes deprecate fields
  before removal; this prompt makes no promise of mutations/subscriptions.
- Existing auth/session/CSRF, organization permission, RLS, and marketing-client
  behavior must remain intact.

## Non-goals

- no authenticated client shell or Next.js API wiring;
- no GraphQL mutations, subscriptions, federation, persisted-query registry,
  generated SDK, public API consumer portal, or external consumers;
- no upload/storage/queue/worker expansion, geography ingestion, analytics,
  dashboards, reports, exports, billing, SSO/SCIM, or AI;
- no new product retention period, performance SLO, availability target, or
  supported tenant scale presented as settled fact;
- no Prometheus/Grafana deployment; structured bounded logs and test evidence
  are the observability scope here;
- no redesign or client file change.

## SKILLS USED

- `architecture-patterns` - preserve modular-monolith/application-service
  boundaries across REST, GraphQL, repositories, and infrastructure.
- `nestjs-best-practices` - verify Nest 11 modules, DI, guards, interceptors,
  filters, versioning, GraphQL integration, transactions, and tests.
- `api-design-principles` - define coherent versioned REST, complementary
  GraphQL, connection pagination, deprecation, and error contracts.
- `openapi-spec-generation` - generate, normalize, commit, and drift-check the
  OpenAPI contract.
- `auth-implementation-patterns` - preserve opaque cookie sessions,
  organization authorization, CSRF, and server-authoritative policy.
- `security-best-practices` - apply secure Express/TypeScript defaults to the
  new API boundary, inputs, errors, limits, cookies, CORS, and logs.
- `security-threat-model` - update the repository-grounded GraphQL trust
  boundary, abuse paths, controls, and acceptance evidence.
- `javascript-testing-patterns` - structure unit, integration, fixture,
  concurrency, and contract-drift tests in the existing Jest stack.
- `e2e-testing-patterns` - cover complete session/CSRF/REST/GraphQL behaviors at
  system boundaries without brittle implementation assertions.
- `error-handling-patterns` - keep REST and GraphQL failures typed, stable,
  contextual, sanitized, and correctly classified.
- `postgres-best-practices` - design the idempotency migration, RLS, unique/null
  semantics, transaction-local settings, and least-privilege grants.
- `sql-optimization-patterns` - verify keyset pagination and loader queries with
  indexes, `EXPLAIN`, and constant query-count evidence.
- `github-actions-templates` - add contract drift checking to the existing
  least-privilege Node 24/PostGIS CI job without broadening permissions.
- `requesting-code-review` - prepare and dispatch the mandatory structured,
  read-only reviewer subagent after self-verification.
- `receiving-code-review` - validate feedback technically before fixes and
  trigger follow-up review for significant contract/security changes.
- `caveman-commit` - write the required terse Conventional Commit message for
  the final local commit.
