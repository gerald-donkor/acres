# 22 - organizations, permissions, and PostgreSQL RLS

## Scope, and why it is next

The committed repository is on `main` at `fee7599`. Phase 1 is committed, and
phase 2 is committed through the real PostgreSQL/PostGIS migration harness and
the Node 24 LTS move. `docs/build-plan.md` phase 3 - organizations,
permissions, and row-level security - is therefore the earliest unbuilt phase
whose dependencies are satisfied.

Implement phase 3 as one security-coherent unit:

- organization, membership, invitation, account-token, and audit persistence;
- the fixed `owner` / `admin` / `analyst` / `viewer` role contract;
- centralized permission decisions and target-role rules;
- authenticated organization discovery and active-organization resolution;
- organization, membership, invitation, and ownership-transfer REST routes;
- transaction-local tenant/account context through the existing non-owner
  PostgreSQL roles;
- `ENABLE ROW LEVEL SECURITY` plus `FORCE ROW LEVEL SECURITY` on every new
  tenant table;
- last-owner, invitation single-use/expiry, membership revocation, and audit
  invariants;
- real two-organization negative tests at repository, SQL, and REST boundaries;
- the documentation and threat-register updates that turn phase 3 from target
  state into implemented state.

Do not split database policy from application policy. Landing either half
alone would create a misleading intermediate state: routes without RLS would
have only one isolation layer, while RLS without the transaction/context and
permission APIs would be unusable and difficult to verify. The feature is
still rollback-safe because all tenant routes are behind an explicit
`TENANCY_ENABLED` gate until operators have reviewed existing accounts and
enabled the new behavior.

## Reference material read

Repository authority read while preparing this prompt:

- `AGENTS.md` §§2, 2.1, 4-8, and 10 - phase control, prompt requirements,
  checks, mandatory review/commit flow, the phase index, and the rule against
  inventing framework APIs or implemented state;
- `docs/build-plan.md` §§1-4 - the phase 2 exit state and the complete phase 3
  outcome, exclusions, failure cases, tests, observability, rollback, skills,
  and exit evidence;
- `docs/product.md` §§2-7 - the four fixed roles, centralized permissions,
  last-owner rules, organization journeys, data classes, success criteria, and
  the still-open deletion/retention/SMTP decisions;
- `docs/system-architecture.md` §§3.5, 5-8, and 11 - the principal -> policy ->
  repository -> transaction-local RLS flow, modular boundaries, target tenant
  schema, database identities, and interface responsibility split;
- `docs/security.md` §§2-9 - the existing/target boundaries, attacker model,
  TM-01/TM-02/TM-03/TM-05/TM-16/TM-17, and the required two-organization,
  role, invitation, owner-concurrency, revocation, CSRF, and enumeration tests;
- `docs/backend.md` §§3-9 and §§11-13 - the live Nest module/route map,
  envelopes, opaque database sessions, global CSRF, environment validation,
  Prisma 7 generator/adapter behavior, separated database roles, first
  migration, real-database helper, and current-to-target bridge;
- `docs/skills.md` §§2-4 - locked skill locations, triggers, and the phase 3
  skill manifest;
- `server/prisma/schema.prisma`, the full initial migration,
  `server/prisma.config.ts`, `scripts/db/bootstrap-roles.sh`,
  `scripts/db/harden-runtime-privileges.sh`, and `docker-compose.yml` - the
  actual schema, migration owner, runtime/test grants, Postgres 18/PostGIS 3.6
  service, and post-migration hardening path;
- `server/src/app.module.ts`, `server/src/app.setup.ts`, `server/src/prisma/`,
  `server/src/sessions/`, `server/src/auth/`, `server/src/common/`, and
  `packages/shared/src/` - the established feature-module, session-guard,
  shared-contract, error-envelope, and Prisma wiring patterns;
- `server/test/api.e2e-spec.ts`, `server/test/database.e2e-spec.ts`,
  `server/test/helpers/test-app.ts`,
  `server/test/helpers/real-db-test-app.ts`, and
  `server/test/setup-env.ts` - the double-based HTTP suite and the mandatory
  real PostgreSQL suite this phase must extend rather than replace;
- PostgreSQL 18 row-security documentation,
  `https://www.postgresql.org/docs/18/ddl-rowsecurity.html`, checked while
  preparing this prompt: enabled tables with no matching policy default deny;
  owners normally bypass policies; `FORCE ROW LEVEL SECURITY` subjects the
  owner; `USING` and `WITH CHECK` govern visible and new row values; foreign
  key/unique checks bypass RLS and can become covert channels;
- PostgreSQL 18 configuration-function documentation,
  `https://www.postgresql.org/docs/18/functions-admin.html`, checked while
  preparing this prompt: `set_config(name, value, true)` is transaction-local,
  and `current_setting(name, true)` returns `NULL` for an absent setting;
- Prisma transaction and raw-query documentation,
  `https://www.prisma.io/docs/orm/prisma-client/queries/transactions` and
  `https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries`,
  checked while preparing this prompt: interactive `$transaction` scopes every
  call made through its transaction client, and tagged `$executeRaw` /
  `$queryRaw` calls are supported inside it; unsafe raw methods carry injection
  risk and are not required for tenant context.

No visual reference applies. This phase changes no client file, rendered UI,
asset, layout, type, color, motion, or breakpoint behavior. Do not open or
modify the design comps during execution.

## Verified starting state

Re-check these facts during execution instead of copying them into the build
record as if they were new output:

- `main` and `origin/main` both point to `fee7599`; the worktree was clean when
  this prompt was prepared.
- `server/prisma/schema.prisma` has seven models and no organization,
  membership, invitation, recovery/account token, audit event, role enum, or
  RLS declaration.
- The existing migration is
  `server/prisma/migrations/20260823204922_init/migration.sql`.
- `acres_migrator` owns the schema; `acres_app` and `acres_test` are non-owner
  login roles without `BYPASSRLS`. The test role additionally has `TRUNCATE`
  only so test cleanup can reset tables; PostgreSQL documents that `TRUNCATE`
  is outside row-policy enforcement, so it must remain test-only.
- Prisma uses the `prisma-client` generator, emits into
  `server/src/generated/prisma`, and connects through `@prisma/adapter-pg`.
- Authentication is a database-backed opaque cookie session. `SessionGuard`
  attaches a current account; authorization and active organization context do
  not exist yet.
- Every state-changing route is already protected globally by the session-bound
  double-submit CSRF middleware. New mutation routes must remain inside that
  same global path.
- Shared API error codes already include `FORBIDDEN` but not `CONFLICT`.
- `api.e2e-spec.ts` uses a recorded Prisma double for HTTP behavior;
  `database.e2e-spec.ts` uses a real migrated `acres_test` database. RLS and
  constraint claims belong in the latter.
- No approved SMTP provider or mail adapter exists. Mailpit/SMTP is target
  architecture, not current implementation.
- Organization deletion semantics, invitation/recovery retention, production
  SMTP, and launch-scale limits remain open product decisions.

## Decisions fixed by this prompt

### 1. Tenant enablement and existing accounts

Add `TENANCY_ENABLED` as a required validated boolean with no implicit
production enablement. Use `false` in `server/.env.example`; use `true` only in
the test setup and explicit local verification environment. When false, every
new organization/invitation route returns the existing `NOT_READY` error shape
without touching tenant tables.

Do not backfill, seed, or infer organizations for existing accounts. An account
gets its first organization only through authenticated `POST /organizations`.
This is the explicit bootstrap action required by the build plan. Before a
production operator enables tenancy, `docs/backend.md` must require an account
inventory and an intentional bootstrap/migration decision. No migration creates
an organization from an email domain, display name, contact submission, region,
or comp copy.

### 2. Roles and permissions

Persist exactly the product roles as lowercase database enum values:

```text
owner | admin | analyst | viewer
```

Define permissions centrally in the organizations domain, not as controller
role comparisons:

```text
organization.read
organization.update
members.read
members.invite
members.change_role
members.revoke
ownership.transfer
invitations.read
invitations.revoke
audit.read
```

Use one exhaustive `Record<OrganizationRole, ReadonlySet<Permission>>` (or an
equally exhaustive typed representation) and one policy service. Controllers
declare permissions through metadata/decorators; a permission guard evaluates
the attached organization context. No controller, resolver, repository, or
future worker may branch directly on strings such as `role === 'admin'`.

The role policy is:

- `owner`: every permission above;
- `admin`: organization/member/invitation reads and organization update;
  invite, change, and revoke non-owner memberships; no ownership transfer;
- `analyst`: organization read only;
- `viewer`: organization read only.

Target-role rules are application invariants in the membership/invitation
service, separate from the general permission map:

- only the ownership-transfer command can assign `owner`;
- an owner may invite or assign `admin`, `analyst`, or `viewer`;
- an admin may invite or assign only `analyst` or `viewer`;
- no admin may change, revoke, or replace an owner;
- an account cannot use a generic role update to promote itself or bypass the
  explicit ownership-transfer audit event;
- a revoked membership grants no permissions on the next request even when its
  browser session remains valid.

### 3. Organization selection contract

Add a reusable organization context resolver that accepts the organization ID
from either:

- the route parameter `:organizationId` on phase 3 nested resources; or
- `x-acres-organization-id` for later product routes.

If both are present, they must match exactly. Validate the value as a UUID at
the HTTP boundary before any database call. Resolve a current active membership
for the session account and attach an immutable context containing
`organizationId`, `accountId`, `membershipId`, and `role` to the request.

An absent, malformed, foreign, or revoked membership must not reveal whether a
guessed organization exists. Return the established `NOT_FOUND` envelope for
those cases. Return `FORBIDDEN` only when the caller is a known active member
but lacks the declared permission.

`GET /organizations` and `POST /organizations` are the only phase 3 routes that
do not require a pre-existing active organization. They still require a valid
session and run through the account-scoped transaction helper described below.

### 4. Token delivery boundary

Invitation issuance generates 32 CSPRNG bytes, returns the raw base64url token
once in the successful response to the authorized issuer, and stores only its
SHA-256 hash. Never log, audit, persist, or place the raw token in a URL. The
accept route receives the token in a CSRF-protected JSON body. This is an
explicit interim out-of-band handoff until a separately approved `MailPort`
exists; document the limitation without adding Mailpit, nodemailer, SMTP
credentials, or a console logger.

Add hashed, single-use account-token persistence and an identity-owned service
for `password_recovery` and `email_verification` purposes, but do not expose an
unusable recovery-request route before a delivery adapter exists. Unit and
real-database tests must prove issue/consume/expiry/replay/revoke semantics
through the service. A later mail phase can expose the command without changing
the token model. Do not return recovery tokens from any public route.

Invitation and account-token lifetimes must come from validated positive
integer environment values, `INVITATION_TTL_HOURS` and
`ACCOUNT_TOKEN_TTL_MINUTES`. They have no hard-coded application fallback.
`server/.env.example` must label its local values as development examples, not
launch retention decisions; production must set them explicitly. Test values
are fixtures only. Do not claim those numbers settle the open retention policy.

## Data model and migration

### Prisma models and enums

Extend `server/prisma/schema.prisma` with these concepts, using existing UUIDv7
and `DateTime` conventions and explicit relation/index definitions:

- `OrganizationRole`: `owner`, `admin`, `analyst`, `viewer`.
- `AccountTokenPurpose`: `password_recovery`, `email_verification`.
- `AuditAction`: organization created/updated, invitation issued/revoked/
  accepted, membership role changed/revoked, and ownership transferred. Use
  stable enum values rather than free-form action text.
- `Organization`: UUIDv7 `id`, `name`, `createdAt`, `updatedAt`, and relations
  to memberships, invitations, and audit events. Do not add deletion fields or
  a globally unique slug; neither contract is approved.
- `Membership`: UUIDv7 `id`, `organizationId`, `accountId`, role, `createdAt`,
  `updatedAt`, nullable `revokedAt`; unique `(organizationId, accountId)` and
  indexes for account organization discovery and active role/member paths.
  Revocation updates the existing record; do not cascade-delete authored
  identity history.
- `Invitation`: UUIDv7 `id`, `organizationId`, normalized `email`, role,
  unique `tokenHash`, `invitedByAccountId`, `expiresAt`, `createdAt`, nullable
  `acceptedAt`, nullable `acceptedByAccountId`, nullable `revokedAt`; indexes
  for organization lifecycle reads, expiry cleanup, and token lookup.
- `AccountToken`: UUIDv7 `id`, `accountId`, purpose, unique `tokenHash`,
  `expiresAt`, `createdAt`, nullable `consumedAt`, nullable `revokedAt`; indexes
  for account/purpose active-token and expiry paths.
- `AuditEvent`: UUIDv7 `id`, `organizationId`, nullable `actorAccountId`, action,
  `targetType`, nullable `targetId`, optional JSON `details`, and `createdAt`;
  indexes for organization/action/time and actor/time. Details may contain only
  bounded identifiers and old/new role values, never email addresses, raw
  tokens, password material, session IDs, cookies, or request bodies.

Add the reverse relations to `Account`. Choose explicit `onDelete` behavior
that preserves audit and membership provenance: no implicit organization
deletion path, no account cascade that erases tenant history, and no nullable
column unless the documented lifecycle actually permits it. If Prisma cannot
express a required relation without inventing account-deletion semantics, use
`Restrict` and record that account anonymization/deletion remains open.

### Generated plus reviewed SQL

Do not hand-create a migration directory. During execution:

1. Read `npx prisma migrate dev --help` from the installed Prisma 7.9.1 CLI and
   verify the exact create-only flag before using it.
2. Generate the next migration from the Prisma schema against the real
   `acres` database as `organizations_rls` without applying it yet.
3. Read the generated SQL in full.
4. Append the PostgreSQL-only policy, trigger, partial-index, grant/revoke, and
   helper-function SQL Prisma cannot model.
5. Read the final migration in full and compare it to the schema and this
   prompt before applying it to either database.

The custom SQL must:

- create null-safe helper functions for the transaction-local UUID settings;
  absent, empty, or malformed `acres.account_id` /
  `acres.organization_id` values return `NULL`, never a cast exception and
  never a default organization;
- keep helper functions schema-qualified, set a safe `search_path`, and avoid
  `SECURITY DEFINER` unless execution proves it is necessary and the security
  implications are documented and reviewed;
- create the partial indexes needed to prevent more than one unconsumed,
  unrevoked invitation for the same normalized email/organization and more
  than one live account token for the same account/purpose where the lifecycle
  contract requires it;
- implement last-owner protection with a database trigger that serializes on
  the organization row before an active owner is demoted, revoked, or deleted,
  and rejects the change when no other active owner remains. It must remain
  correct under two concurrent transactions; do not rely on a service-side
  count alone;
- enable and force RLS on `Organization`, `Membership`, `Invitation`, and
  `AuditEvent`;
- use explicit `USING` and `WITH CHECK` clauses scoped to the transaction-local
  organization ID for ordinary tenant operations;
- allow organization discovery only for the transaction-local account's own
  active memberships. If an organization policy consults `Membership`, keep
  the membership policy independent of `Organization` to avoid recursive RLS;
- allow invitation acceptance only when the transaction-local token hash
  matches, the invitation is live, and the authenticated account's normalized
  email matches. The application must still re-check expiry/consumption inside
  the write transaction because policy visibility is not the lifecycle
  command;
- leave `AccountToken` identity-scoped rather than tenant-scoped; it is not an
  organization-owned row and must not gain an organization policy;
- give `AuditEvent` only `SELECT` and `INSERT` policy paths for the runtime
  roles. Updates/deletes must fail for `acres_app` and `acres_test`; the
  migration owner retains governed migration capability;
- target the existing non-owner runtime/test roles explicitly where helpful,
  while preserving phase 2's role separation and hardening script;
- avoid RLS subqueries whose changing reference rows introduce the race class
  PostgreSQL documents. If a cross-table policy is unavoidable for account
  organization discovery, keep it read-only, cover it with concurrency tests,
  and document the residual reasoning.

After applying the migration, rerun
`scripts/db/harden-runtime-privileges.sh`. Inspect `pg_class.relrowsecurity`,
`pg_class.relforcerowsecurity`, `pg_policy`, `pg_roles`, table ownership, and
grants. Tests must prove both runtime roles are non-owner, non-superuser, and
without `BYPASSRLS`.

## Server architecture and target paths

Follow the repository's feature-module structure. Exact filenames may be
adjusted only to match an existing local naming convention discovered during
execution; do not collapse the boundaries below into one service.

### `server/src/organizations/`

Create one feature module containing:

- DTOs for create/update organization, invite member, accept invitation,
  change member role, and transfer ownership. Use `class-validator` allowlists,
  normalized email transforms, UUID validation, length bounds consistent with
  the existing DTO style, and `forbidNonWhitelisted` through the existing
  global pipe;
- shared role/permission constants and a focused policy service;
- organization/membership/invitation/audit repositories. Tenant repositories
  accept the interactive transaction client supplied by the tenant transaction
  service; they must not open their own Prisma transaction or accept a caller-
  supplied `where` object;
- focused services for organizations, memberships/ownership, invitations, and
  audit event creation;
- the organization context resolver/guard, permission metadata decorator,
  permission guard, current-organization decorator, and request-context types;
- `OrganizationsController` and `InvitationsController` with thin transport
  methods only;
- `OrganizationsModule` exporting only the organization context and policy
  surface later modules will need.

### `server/src/prisma/`

Add a focused tenant transaction service rather than turning
`PrismaService` into a policy service. It must:

- start an interactive Prisma transaction;
- set `acres.account_id`, `acres.organization_id`, and only for invitation
  acceptance `acres.invitation_token_hash` through parameterized tagged raw
  SQL and `set_config(..., true)`;
- invoke the callback only with the transaction client;
- keep all membership resolution and tenant queries inside that same callback;
- never return the transaction client, never perform network work inside the
  transaction, and keep the default timeout unless a measured failure proves a
  change is needed;
- provide an account-scoped mode for organization discovery, an organization-
  scoped mode for ordinary commands, and an invitation-acceptance mode. Each
  mode sets unused settings to an empty value locally so pooled connections
  cannot retain a prior request's scope;
- expose no system/cross-tenant bypass. The worker/system path is not required
  until a real privileged job exists.

Use generated Prisma transaction types verified from
`server/src/generated/prisma` after generation. Do not guess an import from
training data and do not use `$executeRawUnsafe` for context.

### `server/src/identity/` or the established auth/account boundary

Place account-token issue/consume/revoke logic with identity, not organizations.
Reuse the session token's CSPRNG/hash discipline through a small shared token
utility only if it removes real duplication without coupling account tokens to
cookie behavior. Consuming a password-recovery token must be atomic, single-use,
and revoke existing sessions as part of the same application command once the
password-changing route is eventually exposed. In this phase, test the token
record lifecycle without adding the public route or a fake delivery mechanism.

### Existing shared/common files

- Add `packages/shared/src/organizations.ts` for public role, organization,
  membership, invitation, and route input/output types. Export it from the
  shared index. Keep database-only audit details and policy internals server-
  owned.
- Add `CONFLICT` to the stable API error codes and add focused
  `ApiException.forbidden()` / `ApiException.conflict()` constructors. Use
  conflict for last-owner, duplicate-live-invitation, and lifecycle races;
  preserve generic internal errors for unexpected failures.
- Extend environment validation/config getters for the feature flag and token
  lifetime values. Update every config double and test setup in the same
  change so tests exercise real validation.
- Import `OrganizationsModule` into `AppModule` once. Do not make it global.

## REST contract

Preserve the existing global `{ ok: true, data }` and
`{ ok: false, error }` envelopes. Versioning remains phase 4, so these routes
use the current unversioned convention:

| method | path | auth/context | permission and behavior |
| --- | --- | --- | --- |
| `GET` | `/organizations` | session, account-scoped | list only active memberships for the current account, with organization and role |
| `POST` | `/organizations` | session, account-scoped | atomically create organization + owner membership + audit event; 201 |
| `GET` | `/organizations/:organizationId` | session + active org | `organization.read`; return organization and caller membership |
| `PATCH` | `/organizations/:organizationId` | session + active org | `organization.update`; name only; audited |
| `GET` | `/organizations/:organizationId/members` | session + active org | `members.read`; active and revoked state represented without exposing credential fields |
| `PATCH` | `/organizations/:organizationId/members/:membershipId` | session + active org | `members.change_role`; non-owner target-role rules; audited |
| `DELETE` | `/organizations/:organizationId/members/:membershipId` | session + active org | `members.revoke`; soft revoke, idempotent only when the same final state is already visible; audited once |
| `POST` | `/organizations/:organizationId/ownership-transfers` | session + active org | `ownership.transfer`; promote active target to owner and demote caller to admin in one serialized transaction; audited; 200 |
| `GET` | `/organizations/:organizationId/invitations` | session + active org | `invitations.read`; never return token hashes or raw past tokens |
| `POST` | `/organizations/:organizationId/invitations` | session + active org | `members.invite`; issue one raw token in this response only; 201; audited without token/email details |
| `DELETE` | `/organizations/:organizationId/invitations/:invitationId` | session + active org | `invitations.revoke`; cannot revoke accepted invitation; audited once |
| `POST` | `/invitations/accept` | session + token-scoped transaction | token in JSON body; email must match session account; create/reactivate membership atomically; consume once; 200 |

Do not add organization deletion, account deletion, public invitation lookup,
admin impersonation, session role claims, custom roles, bulk membership APIs,
pagination conventions that belong to phase 4, GraphQL, or client calls.

For list routes, use deterministic ordering and a conservative bounded result
chosen from an existing repository convention only if one exists. If no
business limit is approved, do not invent silent truncation: return the phase 3
administration set and record pagination as a phase 4 contract requirement.

## Invariants and failure behavior

Implementation and tests must cover all of these explicitly:

- organization creation is all-or-nothing; no organization without its owner
  membership and creation audit event;
- no automatic organization exists for old or newly registered accounts;
- no request proceeds when `TENANCY_ENABLED=false`;
- missing/invalid organization context defaults to no tenant rows;
- a guessed foreign UUID returns the same not-found shape as an absent UUID;
- every permission decision uses the current database membership, not session
  claims, so revocation is effective on the next request;
- direct Prisma calls outside the tenant transaction service are prohibited in
  new organization application services;
- invitation tokens are random, hashed at rest, expiring, single-use, matched
  to normalized account email, and revoked/accepted atomically;
- accepting an invitation cannot silently change an existing active
  membership's role. Return conflict and require an authorized role-change
  command;
- a revoked membership may be reactivated only by a valid new invitation and
  receives that invitation's allowed non-owner role;
- owner assignment occurs only through transfer; generic role/invite DTOs
  reject `owner` before service execution;
- demoting/revoking/deleting the last active owner fails at both service and
  database layers, including concurrent attempts;
- ownership transfer locks/serializes the organization, promotes the target
  before demoting the actor, and leaves at least one active owner at every
  committed state;
- account-token raw values never persist or log; expired/consumed/revoked
  tokens fail identically and replay cannot mutate state;
- audit writes are append-oriented and contain no token, email, password,
  session, cookie, or raw request payload;
- all mutations remain CSRF-protected and throttling behavior on existing auth
  routes does not regress;
- RLS context is transaction-local and cleared by commit/rollback; a reused
  pool connection without new context sees no prior organization's rows;
- the migration owner remains separate from both served/test runtime roles;
  neither runtime role owns tenant tables, is superuser, or has `BYPASSRLS`;
- foreign-key or unique errors do not reveal whether a foreign tenant object
  exists. Catch expected Prisma/Postgres races and map them to stable conflict
  or not-found responses without returning constraint names.

## Testing plan

### Unit and double-based HTTP tests

Add focused Jest tests using the existing Nest testing/module conventions:

- an exhaustive role-permission matrix with every role x permission pair;
- target-role rule tests for owner/admin/analyst/viewer;
- organization context parsing: param, header, matching both, mismatch,
  malformed UUID, absent context, revoked membership, and foreign membership;
- DTO allowlisting and owner-role rejection on invite/generic role update;
- feature-disabled behavior before repository calls;
- envelope/status behavior for every new route;
- CSRF rejection for every new mutation route or a table-driven assertion that
  enumerates the mutation inventory;
- audit sanitizer behavior and proof token/email fields are not accepted;
- account-token hash/expiry/replay/revoke behavior at the service boundary.

Extend the Prisma double only for transport/service tests that genuinely do not
claim SQL behavior. Prefer repository ports/mocks for new organization unit
tests rather than exposing every generated Prisma delegate on one ever-growing
double.

### Real PostgreSQL integration and isolation tests

Extend `server/test/database.e2e-spec.ts` or add a clearly named adjacent real-
database suite using `createRealDbTestApp`. Update `truncateAll` with the new
tables in dependency-safe order. The suite must use two accounts and two
organizations and prove:

1. migration/schema: every new table, FK, unique/partial index, trigger,
   policy, `ENABLE`, and `FORCE` state exists;
2. role identity: queries run as `acres_test`, not the owner; role is neither
   superuser nor `BYPASSRLS`; tenant tables are owned by `acres_migrator`;
3. default deny: missing, empty, and malformed context returns zero rows or a
   controlled denial, never another tenant;
4. positive CRUD: each organization can create/read/update its own tenant rows
   through the scoped repository transaction;
5. negative CRUD: direct read, insert, update, delete, and relation traversal
   against the other organization returns nothing or is denied;
6. organization discovery: account A sees only its active organizations and
   account B's organization name is not inferable;
7. REST isolation: guessed foreign organization/membership/invitation UUIDs
   produce the same not-found envelope as nonexistent UUIDs;
8. pool reuse: after an organization A transaction commits and the pool is
   reused, an unscoped query and an organization B transaction cannot observe
   A rows;
9. invitation lifecycle: valid accept, wrong email, expired token, revoked
   token, replay, duplicate-live invitation race, and existing-active-member
   conflict;
10. revocation: membership access disappears on the next request while the
    same account session remains authenticated;
11. ownership: last-owner demotion/revoke/delete rejection at raw SQL and REST,
    successful transfer, and two concurrent transfer/revocation attempts with
    an invariant-preserving final state;
12. audit: expected events are appended, cross-tenant reads fail, and runtime
    update/delete attempts fail;
13. account token: hash-only persistence, expiry, single consume, replay,
    revocation, and no organization context dependency;
14. regressions: registration/login/session/logout/CSRF and current public
    region routes retain their existing behavior.

Do not assert a query is indexed merely because an index exists. Capture
`EXPLAIN (COSTS, VERBOSE)` for account-membership discovery, active member
lookup, invitation token lookup, and organization audit ordering; record the
chosen indexes and plan shape honestly. Tiny test data may legitimately choose
a sequential scan, so do not fabricate performance evidence or disable planner
choices to force a desired label.

## Observability

Use the existing Nest logger and bounded, category-only messages:

- permission denial category and permission name;
- invitation issued/accepted/revoked outcome without email or token;
- membership role/revocation and ownership-transfer outcome with opaque IDs;
- tenant context validation failure category;
- account-token issued/consumed/rejected outcome without account email/token.

The database `AuditEvent` is product/security history, not a substitute for
operational logs. Do not add Prometheus, OpenTelemetry, request IDs, Grafana, or
an audit-retention scheduler in this phase.

## Documentation updates

Update implemented state only after code and verification pass:

- `docs/backend.md`: add the organization module/route map, environment
  contract, Prisma migration/RLS/trigger/grant details, transaction helper,
  role/permission behavior, test evidence, enablement/runbook steps, interim
  invitation token delivery limitation, and account-token service boundary;
- `docs/product.md`: replace the statement that role names are not yet an
  implementation with the exact centralized permission/target-role contract,
  while leaving deletion, retention, SMTP, entitlement, and other open
  decisions open;
- `docs/system-architecture.md`: change organizations, permissions, transaction
  context, and RLS from target to current where actually implemented; retain
  worker/system bypass, mail delivery, GraphQL, and later tenant tables as
  target/deferred;
- `docs/security.md`: update current controls and TM-01/TM-02/TM-03/TM-16/
  TM-17 evidence with repository paths/tests; preserve residual risks and do
  not mark future GraphQL/worker/export isolation complete;
- `docs/build-plan.md`: mark phase 3 implemented only after every exit gate in
  this prompt passes. Do not mark phase 4 or later implemented;
- `server/.env.example`: document `TENANCY_ENABLED`,
  `INVITATION_TTL_HOURS`, and `ACCOUNT_TOKEN_TTL_MINUTES` without secrets and
  without claiming local fixture values are production policy.

No new canonical docs file is required; the indexed files above already own
this area. Do not grow `AGENTS.md` with build details or edit client docs.

## Non-goals

- No organization or account deletion; semantics are still an open product
  decision.
- No automatic/backfilled organizations, email-domain tenancy, or seed data.
- No custom roles, billing/entitlements, SSO/SAML, SCIM, MFA, impersonation, or
  externally managed identity.
- No Mailpit, SMTP provider, nodemailer dependency, notification queue, or
  public password-recovery endpoint before a delivery port is approved.
- No API version prefix, OpenAPI generation, GraphQL, idempotency records,
  cursor contract, request IDs, or transport-wide stable error redesign; those
  belong to phase 4.
- No client/authenticated shell/UI work; that depends on phases 3 and 4 and is
  phase 5.
- No worker role/system bypass, Valkey, BullMQ, Garage, uploads, or outbox.
- No RLS retrofit on global `Region` / `RegionalMetric`, public contact data,
  legacy placeholder `InsightReport`, `JobRun`, `Account`, `Session`, or
  `AccountToken`. This phase applies RLS to new organization-owned tables only.
- No production host, volume encryption implementation, backups, deployment,
  telemetry stack, SAST, or secrets-manager changes.
- No invented retention periods, supported-tenant scale, latency target, or
  query SLO.

## Expected impact

- Existing public/auth/account/region/form/job routes retain their paths and
  envelopes.
- With tenancy disabled, the new surface fails closed and existing behavior is
  unchanged.
- With tenancy enabled, authenticated accounts can explicitly create/list
  organizations, manage permitted memberships/invitations, accept an invitation,
  and transfer ownership under centralized policy.
- Tenant repositories require transaction-local context and PostgreSQL
  independently filters/checks rows through forced RLS.
- Revocation is effective without revoking the underlying account session.
- No client begins calling the API, no organization is invented for an account,
  and nothing is pushed.

## Execution sequence

1. Re-read `AGENTS.md`, this approved prompt, every referenced repository doc,
   and every skill in `## SKILLS USED` before editing.
2. Inspect the worktree, current commit, live package versions, Prisma generated
   types, local database readiness, migration status, and installed Prisma CLI
   help. Preserve unrelated user changes.
3. Add shared contracts and unit-testable role/permission policy first.
4. Extend environment validation/config/test doubles and keep the feature
   disabled by default.
5. Extend the Prisma schema; generate a create-only migration with the verified
   Prisma 7 CLI; append and review required PostgreSQL SQL.
6. Apply the migration to `acres` and `acres_test`, rerun runtime privilege
   hardening, inspect roles/policies/ownership, and regenerate Prisma Client.
7. Implement tenant transaction/context, repositories, services, guards,
   decorators, DTOs, controllers, and module wiring in dependency order.
8. Implement identity account-token persistence/service without a public mail-
   dependent route.
9. Add unit/double tests, then the real two-organization SQL/repository/REST and
   concurrency matrix.
10. Run focused tests after each layer, then all self-verification commands.
11. Review every changed file and the complete unstaged diff. Fix known issues
    before requesting review.
12. Use `requesting-code-review` to dispatch a read-only reviewer subagent with
    this prompt as requirements, exact `BASE_SHA`/`HEAD_SHA`, files changed,
    security decisions, migration details, and real check output.
13. Use `receiving-code-review` to verify every finding against the code and
    requirements. Fix valid findings one at a time and rerun affected tests.
    Because this phase changes architecture, public APIs, data flow, and
    security boundaries, dispatch a follow-up review after any significant fix.
14. Update canonical docs with actual implementation and command output.
15. Re-run final checks, stage only prompt-approved paths, inspect
    `git diff --cached`, use `caveman-commit` to produce the message, and commit
    locally to `main`. Do not push.

## Verification commands and evidence

Run commands from the repository root unless noted. Quote real output in the
completion and `docs/backend.md`; never copy preparation-time observations.

### Preflight and database

```bash
git status --short --branch
git log -1 --oneline
node --version
npm --version
pg_isready -h localhost -p 5432
npm run prisma:validate --workspace=@acres/server
npm run prisma:migrate:status --workspace=@acres/server
```

If PostgreSQL is unavailable, use the already-documented `npm run db:up` path
where Docker exists or report the existing native-cluster prerequisite. Do not
replace real database tests with a double. Migration commands must use the
separate migrator URL; served/test commands use their existing non-owner URLs.

After migration generation/review:

```bash
npm run prisma:migrate:deploy --workspace=@acres/server
npm run prisma:generate --workspace=@acres/server
npm run prisma:validate --workspace=@acres/server
npm run prisma:migrate:status --workspace=@acres/server
```

Run the same deploy/status path against `acres_test`, then execute the existing
hardening script exactly as documented. Do not print connection passwords in
logs, docs, or the final response.

### Focused tests

```bash
npm run test --workspace=@acres/server -- --runInBand
npm run test:server
```

If the account-token and permission unit tests live under the server package's
unit-test pattern, the first command must name and pass them. The second command
must run both the existing double-based and real-database e2e suites with the
new isolation matrix.

Use parameterized, read-only SQL inspection (through a checked script or test)
to report:

- current role, `rolsuper`, `rolbypassrls`, and table owner;
- `relrowsecurity` / `relforcerowsecurity` for each tenant table;
- policy names, commands, roles, `USING`, and `WITH CHECK` expressions;
- trigger and partial-index definitions;
- audit table privileges;
- representative `EXPLAIN (COSTS, VERBOSE)` output.

### Repository gates

```bash
npm run format --workspace=@acres/server
npm run lint
npm run typecheck
npm run build
npm run test:server
git diff --check
git status --short
git diff --stat
git diff --name-only
git diff
```

The formatter may touch only approved server TypeScript/test files. Inspect its
diff immediately and revert no user work. `npm run build` must still generate
Prisma Client and complete shared, Next 16.3 client, and Nest server builds.

### Exit gate

The phase is complete only when all of these are true:

- migration deploy/status passes for both real databases and the migration is
  fully reviewed;
- runtime/test identities are non-owner and cannot bypass RLS;
- every tenant table has both enabled and forced row security;
- missing context and two-organization negative CRUD/relation/REST/pool tests
  pass;
- the exhaustive permission, invitation, account-token, revocation, last-owner,
  ownership-concurrency, audit, session, and CSRF matrices pass;
- no controller-local role string or unscoped new tenant Prisma query remains;
- all format/lint/typecheck/build/server tests and diff checks pass;
- the mandatory initial and follow-up review loops have no unresolved critical
  or important findings;
- owning docs accurately separate current behavior from deferred mail,
  worker/system, GraphQL, and later tenant tables;
- only approved files are staged, the staged diff is inspected, one local
  Conventional Commit exists on `main`, and no push occurred.

## Rollback and compatibility

- The migration is additive. Existing account/session/public route data is not
  rewritten and no organization is auto-created.
- Before enablement, rollback is `TENANCY_ENABLED=false`; do not drop tables or
  policies merely to disable the feature.
- After tenant data exists, schema rollback is forward-fix only unless a later
  reviewed migration proves data-preserving reversibility. Never use
  `migrate reset` or hand-drop tenant tables in a production-like database.
- Invitation raw-token response is explicitly interim and can later be replaced
  by a mail delivery port without changing the stored hash/lifecycle contract.
- API versioning in phase 4 must classify these unversioned routes and provide
  the finite compatibility path; this phase does not pre-empt that decision.

## SKILLS USED

- `architecture-patterns` - preserve modular boundaries, application policy,
  repository ports, and tenant transaction adapters.
- `nestjs-best-practices` - implement feature modules, DI, guards, DTOs,
  transactions, migrations, error handling, and Nest test structure.
- `postgres-best-practices` - design UUID/timestamp schema, constraints,
  indexes, migrations, and PostgreSQL tenant data rules.
- `auth-implementation-patterns` - implement fixed roles, permission mapping,
  membership revocation, invitations, and single-use account tokens.
- `security-best-practices` - keep the TypeScript/Express surface secure by
  default, validate all input, preserve cookie/CSRF protections, and avoid
  token/error/log leakage.
- `security-threat-model` - reconcile the new tenancy trust boundary and abuse
  paths with the existing repository-grounded threat model.
- `javascript-testing-patterns` - structure Jest unit/integration coverage,
  factories, concurrency cases, and real-database behavior tests.
- `error-handling-patterns` - map expected lifecycle/authorization races to
  stable safe errors and preserve context for unexpected failures.
- `sql-optimization-patterns` - choose and inspect membership, invitation, and
  audit indexes/plans without inventing performance claims.
- `api-design-principles` - keep organization/member/invitation endpoints
  resource-oriented with correct HTTP methods, statuses, and bounded contracts.
- `requesting-code-review` - prepare and dispatch the mandatory read-only
  reviewer with requirements, SHAs, migration details, and verification output.
- `receiving-code-review` - verify reviewer findings against this codebase,
  implement valid fixes deliberately, and trigger follow-up review when needed.
- `caveman-commit` - produce the required terse Conventional Commit message,
  including a body because this is a security-sensitive data migration.
