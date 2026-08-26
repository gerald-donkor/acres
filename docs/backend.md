# Backend — the NestJS server, the shared contracts, and the data layer

The build record for step 8 (`AGENTS.md` §8.2), implemented from
`prompts/10-nestjs-server.md`. It covers `server/`, `packages/shared/`, the
root workspace wiring, and what is deliberately not built yet. Later client
integration is recorded in [`authenticated-app.md`](authenticated-app.md);
historical notes in this file that say `client/` is unchanged describe the
original backend prompt, not the current repository after Phase 5 began.

---

## 1. Resolved versions

Every version below was read from the registry or from `node_modules/` in the
implementing session (2026-08-21), never recalled. Toolchain: **Node v26.7.0**,
**npm 12.0.2**.

| package                                                        | version                                   | why                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nestjs/common` · `@nestjs/core` · `@nestjs/platform-express` | `^11.2.1`                                 | the framework, on its **default Express platform** — the security guidance this step follows is the Express guidance, and swapping to Fastify would invalidate it                                                       |
| `@nestjs/config`                                               | `^4.0.4`                                  | environment loading, with a `validate` function that fails the boot                                                                                                                                                     |
| `@nestjs/schedule`                                             | `^6.1.3`                                  | in-process cron; see §7 for the constraint it carries                                                                                                                                                                   |
| `@prisma/client` · `prisma`                                    | `^7.9.1`                                  | the data layer                                                                                                                                                                                                          |
| `@prisma/adapter-pg`                                           | `^7.9.1`                                  | **required.** Prisma 7's `PrismaClientOptions` accepts either a driver adapter or an Accelerate URL; there is no plain connection-string form any more. Read from `internal/prismaNamespace.ts` in the generated client |
| `class-validator` `^0.15.1` · `class-transformer` `^0.5.1`     | request validation and DTO transformation |
| `helmet`                                                       | `^8.3.0`                                  | response security headers                                                                                                                                                                                               |
| `cookie-parser`                                                | `^1.4.7`                                  | the session and CSRF cookies are read by middleware, so they must be parsed first                                                                                                                                       |
| `csrf-csrf`                                                    | `^4.0.3`                                  | double-submit CSRF (§5)                                                                                                                                                                                                 |
| `@nestjs/throttler`                                            | `6.5.0`                                   | per-IP request throttling. The strict tier closes the login/contact availability gap named in §5 and formerly deferred in §12                                                                                           |
| `@nestjs/swagger`                                              | `11.4.7`                                  | code-first OpenAPI generation for the committed REST contract artifacts                                                                                                                                                 |
| `@nestjs/graphql`                                              | `13.4.5`                                  | code-first GraphQL integration and deterministic SDL generation                                                                                                                                                         |
| `@nestjs/apollo`                                               | `13.1.0`                                  | Nest Apollo driver pinned below latest because `13.4.5` pulls an Apollo 5 path that conflicts with the installed GraphQL Playground peer graph                                                                          |
| `@apollo/server`                                               | `4.13.0`                                  | Apollo Server runtime compatible with the selected Nest Apollo driver. Apollo Server 4 is EOL as of 2026-01-26; this is accepted only as the stable compatible peer set for this phase                                  |
| `@as-integrations/express5`                                    | `1.1.2`                                   | Apollo/Express 5 integration required by the selected Nest GraphQL stack                                                                                                                                                |
| `graphql`                                                      | `16.14.2`                                 | GraphQL execution and schema primitives                                                                                                                                                                                 |
| `graphql-query-complexity`                                     | `2.0.0`                                   | cost guard for GraphQL abuse controls                                                                                                                                                                                   |
| `dataloader`                                                   | `2.2.3`                                   | per-request GraphQL lookup caching                                                                                                                                                                                      |
| `bcryptjs`                                                     | `^3.0.3`                                  | password hashing. Pure JavaScript and **ships no install script**, which matters here: this machine's npm blocks unapproved install scripts, so a native hashing binding would not have built                           |
| `prom-client`                                                  | `^15.1.3`                                 | Prometheus application metrics exposition client (Apache-2.0, pure JS, Node 24 compatible)                                                                                                                               |
| `jest` `^30` · `ts-jest` `^29.4` · `supertest` `^7`            | from the verified Nest scaffold           |


### A skill was installed mid-step

`nestjs-best-practices` was **not** installed when `prompts/10-nestjs-server.md`
was written — the prompt says so, and required that the gap be stated rather
than worked around silently. It appeared during implementation and was loaded:
`.agents/skills/nestjs-best-practices/` with its `.claude/skills/` counterpart
and a `skills-lock.json` entry, sourced from **`Kadajett/agent-nestjs-skills`**
(github), matching how every other skill in this repository is vendored.

**Only its `SKILL.md` index was read**, not all 43 rule files. What it changed
here: `app.setup.ts`'s single configuration point, `enableShutdownHooks()`, and
the feature-module layout were already in place and consistent with it; nothing
was rewritten to satisfy it. The prompt's line saying no NestJS skill is
installed is stale, and `AGENTS.md` §4 now carries the skill's row.

The scaffold came from `npx @nestjs/cli@11.0.24 new … --skip-install
--skip-git --package-manager npm --language TS`, generated into the scratch
directory and copied in file by file — `nest-cli.json`, `.prettierrc`,
`eslint.config.mjs`, `tsconfig.build.json` and `test/jest-e2e.json` are the
scaffold's, edited where noted. `src/app.controller.ts`, `src/app.service.ts`
and their spec were deleted; the real modules replace them.

### The one accepted advisory

`npm audit` reports **3 high severity** findings, all one advisory:

```text
deepmerge-ts  <8.0.0
Severity: high
DeepmergeTS has stack exhaustion when merging recursive object graphs
  @prisma/config  >=6.13.0-dev.1
    prisma  6.13.0-dev.1 - 7.10.0-integration-fix-prisma-publish-token.1
```

It reaches the tree only through **`@prisma/config`, a dependency of the
`prisma` CLI**, which is a devDependency and never runs in a served request.
`npm audit fix --force` "fixes" it by installing `prisma@6.12.0` — a major
downgrade that would change the generated client. **Not applied.** Revisit when
`@prisma/config` ships a `deepmerge-ts@8` bump.

`npm install` also reports install scripts blocked by this machine's npm policy
(`unrs-resolver`, `prisma`, `@prisma/engines`). Nothing here needs them:
`prisma validate` and `prisma generate` both run, and Prisma 7's query
compiler is WASM.

The Phase 4 transport install raised `npm audit` to **7 findings** (4 moderate,
3 high) and added deprecation warnings for Apollo Server 4 packages. The latest
`@nestjs/apollo@13.4.5` graph was tested first and rejected because it resolves
through Apollo 5 while the bundled Playground path still expects Apollo 4-only
peers. The implemented graph pins `@nestjs/apollo@13.1.0` with
`@apollo/server@4.13.0`; this keeps Nest GraphQL stable for the read-only
Phase 4 endpoint but must be revisited before any broad production GraphQL
launch.

---

## 2. Workspace shape and scripts

Three npm workspaces, one lockfile, one `node_modules/` at the root. No
Turborepo — step 7 settled npm workspaces and this step does not revisit it.

```text
package.json          # coordinator; workspaces: client, server, packages/shared
client/               # @acres/client  — the Next.js app, unchanged
server/               # @acres/server  — the NestJS API
packages/shared/      # @acres/shared  — contracts both sides read
docs/backend.md       # this file
```

Root scripts, all run from the repository root:

| script                                           | what it does                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `dev`                                            | unchanged — the Next.js dev server                                                                                              |
| `dev:client` / `dev:server`                      | one workspace each; the API watches on 3001                                                                                     |
| `build`                                          | **shared → client → server.** Shared is first because the server imports its built output                                       |
| `build:shared` / `build:client` / `build:server` | one workspace each                                                                                                              |
| `contracts:generate`                             | builds the server and rewrites `docs/api/openapi.json`, `docs/api/schema.graphql` and `docs/api/contracts.md` deterministically |
| `contracts:check`                                | generates contracts to a temporary directory and fails on drift; CI runs this after build                                       |
| `start`                                          | unchanged — serves the built client                                                                                             |
| `start:server`                                   | `node dist/main` in `server/`                                                                                                   |
| `lint`                                           | client, then shared, then server                                                                                                |
| `typecheck`                                      | **new.** Builds `@acres/shared`, then `tsc --noEmit` in all three workspaces                                                    |
| `test:server`                                    | the API's e2e suite                                                                                                             |
| `test:client:e2e`                                | Playwright coverage for the authenticated client shell                                                                          |
| `ops:templates`                                  | validates the inert production Caddy/Compose/env/observability examples added in Phase 12A                                      |
| `ops:scan-secrets`                               | scans tracked files for known local passwords, `change-me` defaults, launch sentinels outside approved docs/examples, and secret-looking public env names |
| `ops:docker-runtime`                             | checks `server/Dockerfile` still uses Node 24, non-root runtime, a healthcheck, and direct Node startup                         |
| `ops:check`                                      | runs the deterministic Phase 12A operations gates; CI runs this after contract drift checks                                     |
| `ops:launch-readiness`                           | runs the same gates, prints remaining operator-owned blockers, and exits non-zero until launch values and drills are complete   |

`typecheck` did not exist before this step. `AGENTS.md` §8.1 previously said
`npx tsc --noEmit` "runs from the root and is forwarded to `@acres/client`";
that was false — with no root `tsconfig.json` and no file arguments, root `tsc`
prints its banner and exits 0, checking nothing. The line is corrected in the
same change that added the real script.

`client/package.json` gained `"typecheck": "tsc --noEmit"`. That is the **only**
change under `client/`.

A root `prepare` script builds `@acres/shared` after `npm install`, so a fresh
clone has `packages/shared/dist/` before anything imports it.

### How the server consumes `@acres/shared`

**Built output, not source.** `packages/shared` compiles to CommonJS with
declarations (`main: dist/index.js`, `types: dist/index.d.ts`, plus an
`exports` map), and npm links it into the root `node_modules/`. The server's
`tsconfig.json` is `module: nodenext`, which reads that `exports` map directly —
no `paths` alias, so the type the compiler checks and the file Node loads are
the same artefact. The cost is ordering: shared must be built before the server
type-checks, which is why every root chain builds it first.

`client/` now depends on `@acres/shared` for the typed authenticated API client
added in Phase 5. The detailed route/client boundary is owned by
[`authenticated-app.md`](authenticated-app.md).

No `zod`. The shared package has **zero runtime dependencies**; validation
bounds live in `packages/shared/src/validation.ts` as a plain `VALIDATION`
constant, and the server's `class-validator` decorators read those numbers.
Nest's `ValidationPipe` needs concrete classes, so the decorated DTOs stay in
`server/src/**/dto/` and `implements` the shared interface — a decorated
server DTO never reaches client-readable code.

### `.gitignore`

Four changes, all required for this step to commit correctly:

1. `!server/.env.example` — the global `.env*` rule would otherwise swallow it
   silently. Verified: `git check-ignore -q server/.env.example` exits **1**.
2. `client/node_modules/`, `server/node_modules/`, `packages/*/node_modules/` —
   the old rule was root-anchored `/node_modules` only.
3. `server/dist/`, `packages/shared/dist/`, `server/coverage/`.
4. `server/src/generated/` — Prisma 7 generates its client **into the project
   tree**, not into `node_modules/.prisma`.

---

## 3. Module and route map

```text
server/src/
  main.ts                  bootstrap only
  app.setup.ts             every global: helmet, CORS, cookies, CSRF, pipe,
                           interceptor, filter, shutdown hooks
  app.module.ts
  common/                  ApiException, the exception filter, the success
                           envelope interceptor, typed @Transform helpers
  config/                  env validation + a typed reader
  security/                CsrfService
  prisma/                  PrismaService (global)
  sessions/                SessionsService, SessionGuard, OptionalSessionGuard,
                           @CurrentAccount (global)
  health/  accounts/  auth/  regions/  forms/  jobs/
```

`app.setup.ts` exists so the tests exercise the same stack `main.ts` serves. A
validation or CSRF rule configured only in `main.ts` is a rule no test can see.

`SessionsModule` is `@Global` on purpose: `AccountsController` and
`JobsController` both need `SessionGuard`, and routing the guard through
`AuthModule` would make `AuthModule` and `AccountsModule` import each other.

| method | path             | auth             | notes                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/health`        | public           | status, service name, npm version, uptime. **Takes no database dependency** — a load balancer must not be told the service is down when it is the database that is unreachable                                                                                                                                                                                                                                            |
| `GET`  | `/health/ready`  | public           | database readiness for dependency-aware health checks                                                                                                                                                                                                                                                                                                                                                                     |
| `GET`  | `/metrics`       | private/ops      | Prometheus text exposition format (`text/plain; version=0.0.4`). Low-cardinality, strictly redacted route groups (`/api/v1/auth`, `/api/v1/organizations`, `/api/v1/reports`, `/graphql`, `/health`, `/metrics`, `other`), RED metrics, outbox lag, queue depth, job runs. Bypasses JSON response envelopes and rate limiting                                                                                     |
| `GET`  | `/auth/csrf`     | public           | **not in the original route table.** A double-submit defence is unusable without a way to read the token; returns `{ csrfToken, headerName: 'x-csrf-token' }` and sets the paired cookie. Uses the library's defaults: re-issuing re-validates any existing cookie against the **current** session identifier and mints a fresh token when that fails, which is what has to happen after login rotates the session cookie |

| `POST` | `/auth/register` | public + CSRF    | 201, sets the session cookie, returns `SessionProfile`                                                                                                                                                                                                                                                                                                                                                                    |
| `POST` | `/auth/login`    | public + CSRF    | 200, sets the session cookie, returns `SessionProfile`                                                                                                                                                                                                                                                                                                                                                                    |
| `POST` | `/auth/logout`   | session + CSRF   | revokes the session server-side, clears the cookie                                                                                                                                                                                                                                                                                                                                                                        |
| `GET`  | `/auth/session`  | optional session | `SessionProfile`, or the shared `ANONYMOUS_SESSION`                                                                                                                                                                                                                                                                                                                                                                       |
| `GET`  | `/account`       | session          | `AccountProfile`                                                                                                                                                                                                                                                                                                                                                                                                          |
| `GET`  | `/regions`       | public           | region summaries with their metrics, one query                                                                                                                                                                                                                                                                                                                                                                            |
| `GET`  | `/regions/:slug` | public           | one summary, or 404 `NOT_FOUND`                                                                                                                                                                                                                                                                                                                                                                                           |
| `POST` | `/forms/contact` | public + CSRF    | 201, stores the submission, returns `{ id, receivedAt }` only — echoing the message back would make the endpoint a reflector                                                                                                                                                                                                                                                                                              |
| `GET`  | `/jobs/runs`     | session          | the 50 most recent runs                                                                                                                                                                                                                                                                                                                                                                                                   |

### Envelopes

Every success is `{ ok: true, data }` (a global interceptor); every failure is
`{ ok: false, error: { code, message, details? } }` (a global filter). `code` is
one of the eight in `packages/shared/src/api.ts` and is stable; `message` is
human-readable and is not. Anything thrown that is not an `HttpException` is
logged in full and answered with a bare `INTERNAL_ERROR` — verified against a
live server with no database:

```text
GET /regions  →  {"ok":false,"error":{"code":"INTERNAL_ERROR","message":"Something went wrong."}}
```

`/jobs/runs` sits behind the session guard only. **Role-based authorization
does not exist**; "any signed-in account" is the floor, not the intended final
rule, and it is a later prompt.

---

## 4. Auth, sessions and hashing

- **Passwords**: `bcryptjs` at **cost 12**, the current OWASP-aligned bcrypt
  floor. Only the digest is stored.
- **Sessions are opaque and server-revocable**, not JWTs. 32 CSPRNG bytes,
  base64url-encoded. **Only the SHA-256 digest is stored**; the raw token
  exists in the `HttpOnly` cookie and in request handling, never at rest.
  Revocation writes `revokedAt` — the point of opaque tokens.
- **Cookie**: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when
  `NODE_ENV=production`, `expires` at the session's own expiry.
- **`SESSION_TTL_DAYS`** defaults to 30.

### Not revealing whether an account exists

Login with an unknown email, login with a wrong password, and **registration on
an already-registered email** all return the same shape:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Those credentials did not work."
  }
}
```

The prompt required this, and the trade-off is real and recorded: a legitimate
user who forgets they already registered gets an unhelpful error. The usual fix
is to answer 201 and send a "you already have an account" email — **email
delivery is a non-goal of this step**, so the generic failure stands until
there is a mailer.

Timing is levelled too: when no account matches, the password is still compared
against a bcrypt digest computed at module load, so the response time does not
leak whether the email is registered.

The existence pre-check in `AuthService.register` is only the fast path — two
concurrent registrations for the same email both pass it. `AccountsService.create`
catches Prisma's **`P2002`** unique-constraint violation and converts it to the
same `INVALID_CREDENTIALS` response, so the race cannot answer 500 and reveal by
its status code that the account is there.

---

## 5. CSRF — what protects what

The mutation routes authenticate with a cookie, and a browser attaches a cookie
to a cross-site form post by itself. Two things stand between that and a
successful forgery:

1. **`SameSite=Lax` on the session cookie**, which blocks the cross-site POST
   in every current browser. It is not sufficient on its own — it depends on
   the browser honouring it, and `Lax` does not cover every navigation shape.
2. **Double-submit CSRF via `csrf-csrf@4`**, which is the actual defence.
   `doubleCsrf({ getSecret, getSessionIdentifier, … })` was verified from
   `node_modules/csrf-csrf/dist/index.d.cts`, not from memory. The token is
   HMAC'd with `SESSION_SECRET` and bound to the session cookie's value, sent
   back in `x-csrf-token`, and checked against the `acres_csrf` cookie.

**Because the token is bound to the session cookie's value, a client must
re-read `GET /auth/csrf` after `POST /auth/login`** — the cookie it was bound to
has just changed. The e2e suite does exactly this before its logout test, so the
requirement is pinned by a test rather than only by this paragraph.

The CSRF cookie takes the **`__Host-` prefix when it is `Secure`** — i.e. in
production — which locks it to the exact origin so a sibling subdomain cannot
toss in a replacement. Browsers only accept the prefix on a secure cookie, so
local http development keeps the plain `CSRF_COOKIE_NAME`. The HMAC binding
already made cookie-tossing useless against an authenticated victim; this is the
defence that addresses the class rather than the instance.

The library rejects by calling `next(error)`, which lands in Express's default
handler and returns an **HTML** 403 — outside Nest's filter, and so outside the
envelope. `CsrfService.protection` wraps it so a rejection is — and compares against the
library's own `invalidCsrfTokenError` instance before doing so, so a future
upgrade that forwards some _other_ error cannot have it misreported as a CSRF
failure:

```text
POST /forms/contact (no token)  →  403
{"ok":false,"error":{"code":"CSRF_INVALID","message":"CSRF token missing or invalid."}}
```

**What is not covered:** `GET`, `HEAD` and `OPTIONS` are exempt, which is
correct only because no `GET` route mutates anything — a future one must not.
CORS is restricted to `CLIENT_ORIGIN` with credentials enabled, so a browser
will not hand a cross-origin script the response, but CORS is not a CSRF
defence and is not counted as one here.

**Rate limiting now bounds the availability risk.** Every route is behind the
`default` throttler: `RATE_LIMIT_DEFAULT_LIMIT` requests per
`RATE_LIMIT_TTL_MS`, per IP. `POST /auth/register`, `POST /auth/login` and
`POST /forms/contact` additionally opt into the `strict` throttler:
`RATE_LIMIT_STRICT_LIMIT` requests per the same window, per IP. That strict
tier matters most for `POST /auth/login`, because every unauthenticated attempt
runs a cost-12 bcrypt comparison _even when the account does not exist_ (the
timing defence in §4), and `bcryptjs` is pure JavaScript, so it competes with
the event loop. A client that exceeds a tier receives HTTP 429 in the normal
error envelope with `RATE_LIMITED`.

`GET /auth/csrf`, `POST /auth/logout` and `GET /auth/session` stay on the
default tier rather than the strict tier. CSRF issuance is a cheap read that the
double-submit flow needs before every mutation, logout already requires a
session, and session reads carry no bcrypt cost. `GET /health` is marked with
`@SkipThrottle()` so host liveness probes cannot be made to fail by the
limiter.

One `@nestjs/throttler` v6 API detail is local and deliberate: registering both
`default` and `strict` named throttlers makes both active on every route unless
metadata skips one. `StrictThrottle()` applies the public
`@Throttle({ strict: {} })` decorator plus Acres-owned metadata, and
`AcresThrottlerGuard` subclasses `ThrottlerGuard` so the `strict` named
throttler is opt-in. The ordinary `default` tier remains global.

The default tracker is Express's `req.ip`, and the effective storage key also
includes the controller, handler and throttler name. That makes the budget
per-route, per-IP, per-tier, not one shared API-wide bucket. Behind a reverse
proxy, a host must either configure the Express trust boundary before exposing
the API publicly or provide equivalent edge/shared throttling; otherwise
`req.ip` may be the proxy's address rather than the client's.

---

## 6. Environment

Every variable is validated **once, at boot**, by `validateEnv` in
`server/src/config/env.validation.ts`. A missing required variable stops the
process — a server that starts and then 500s on the first request is harder to
diagnose than one that never starts. **No configuration is read from
`process.env` outside `AcresConfigService`.** The one other reader is
`HealthService`, which reports `process.env.npm_package_version` — process
metadata, not configuration. npm only populates that when the process starts
through a package script, so a container whose entrypoint is
`node dist/main` directly will report `"version": null`.

| variable                   | required | default                      | notes                                                                                                                                                                                                          |
| -------------------------- | -------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | **yes**  | —                            | the running API's non-owner `acres_app` connection (§8.1); read by `AcresConfigService`/`PrismaService`                                                                                                        |
| `DATABASE_MIGRATION_URL`   | no       | falls back to `DATABASE_URL` | owner `acres_migrator` connection. CLI-only — read directly by `server/prisma.config.ts`, never by `AcresConfigService`, so `prisma migrate`/`validate`/`status` never share a connection with the running app |
| `CLIENT_ORIGIN`            | **yes**  | —                            | CORS origin, credentials enabled                                                                                                                                                                               |
| `SESSION_SECRET`           | **yes**  | —                            | CSRF HMAC secret. Boot **fails** in production if it is still the `change-me…` placeholder; warns below 32 characters                                                                                          |
| `PORT`                     | no       | `3001`                       | never 3000, so it cannot collide with the client                                                                                                                                                               |
| `SESSION_COOKIE_NAME`      | no       | `acres_session`              |                                                                                                                                                                                                                |
| `SESSION_TTL_DAYS`         | no       | `30`                         | positive integer                                                                                                                                                                                               |
| `CSRF_COOKIE_NAME`         | no       | `acres_csrf`                 |                                                                                                                                                                                                                |
| `SCHEDULER_ENABLED`        | no       | `true`                       | see §7                                                                                                                                                                                                         |
| `RATE_LIMIT_TTL_MS`        | no       | `60000`                      | throttling window in milliseconds                                                                                                                                                                              |
| `RATE_LIMIT_DEFAULT_LIMIT` | no       | `120`                        | requests per window per IP for ordinary routes                                                                                                                                                                 |
| `RATE_LIMIT_STRICT_LIMIT`  | no       | `10`                         | requests per window per IP for auth/contact mutations                                                                                                                                                          |
| `NODE_ENV`                 | no       | `development`                | `development` \| `test` \| `production`                                                                                                                                                                        |

`server/.env.example` documents all of them. Copy it to `server/.env`; that
file is gitignored. Root `.env.example` (gitignored the same way) documents the
three role passwords `docker-compose.yml` and `scripts/db/bootstrap-roles.sh`
consume — see §8.1.

`PrismaService`'s `PrismaPg` adapter now sets `connectionTimeoutMillis: 5000`,
so a query against an unreachable database fails within 5s instead of hanging
(`node_modules/@types/pg/index.d.ts:31` and
`node_modules/@prisma/adapter-pg/dist/index.d.ts:42` confirm both fields are
real, verified this session). `GET /health` still takes no database dependency
(§10); `GET /health/ready` (§8.1) does, on purpose, for orchestrators that need
to know the database is actually reachable.

---

## 7. Jobs, and the scheduler constraint

`@nestjs/schedule` is registered once via `ScheduleModule.forRoot()`. One job
ships: **`sessions.purge-expired`**, hourly, which deletes session rows that can
no longer authenticate anything — expired **or** revoked, so a revoked session
is not kept for the remainder of its 30-day TTL — and writes a `JobRun` row for
the attempt, the outcome and the count. It is real bookkeeping, and it proves the scheduler, the
`JobRun` table and the failure path are wired without inventing data.

**The operational constraint, unsolved and stated as such: `@nestjs/schedule`
runs in-process, so every replica runs every job.** Horizontally scaling the
API multiplies each cron. Until a distributed lock or a provider scheduler
replaces it, **exactly one instance may run with `SCHEDULER_ENABLED=true` in
production.**

**The ingestion boundary.** Regional-data import belongs in `jobs/` beside this
one and deliberately does not exist: no data provider has been chosen, and
stubbing one would put fake regional intelligence in the database. The comps'
figures are illustration (`AGENTS.md` §8); nothing here fabricates them.

---

## 8. Prisma

Seven models — `Account`, `Session`, `Region`, `RegionalMetric`,
`InsightReport`, `ContactSubmission`, `JobRun` — and two enums
(`InsightReportStatus`, `JobRunStatus`), whose values match the shared string
unions exactly. Indexes cover every lookup path the routes use. `Account.email`,
`Session.tokenHash` and `Region.slug` are `@unique`, and PostgreSQL builds a
btree to enforce each unique constraint — so those three need **no** separate
`@@index`, and declaring one would only add write amplification on the hottest
table. The explicit indexes are therefore `Session(accountId, expiresAt)`,
`RegionalMetric(regionId, key)`, `InsightReport(regionId, status)`,
`ContactSubmission.email` and `JobRun(jobName, status, startedAt)`.

Two of those are honest about serving something other than a current query, and
are recorded here so a later session does not "clean them up":

- **`Session(accountId, expiresAt)`** serves no route today. It indexes the FK
  behind `onDelete: Cascade`, which Postgres does not index automatically —
  without it, deleting an account sequentially scans `Session`.
- **`JobRun(jobName, status, startedAt)`** cannot serve `listRecent`, whose
  `orderBy: { startedAt: 'desc' }` is unfiltered and so cannot use an index
  led by `jobName`. It anticipates the per-job queries the next backend prompt
  adds. If `listRecent` stays unfiltered and the table grows, it wants its own
  `startedAt` index.

The hourly purge (§7) matches on `expiresAt < now` **OR** `revokedAt IS NOT
NULL`, and Postgres cannot use a single index across an `OR` — so that job is a
sequential scan of `Session` by design. At the scale this table reaches before
the next backend prompt that is cheaper than maintaining two partial indexes for
an hourly job; it is a recorded decision, not an oversight.

**IDs are `@default(uuid(7))`.** UUIDv7 is time-ordered, so inserts land at the
end of the B-tree instead of scattering across it the way UUIDv4 does — the
index locality of an autoincrement without exposing a countable sequence in
URLs and API responses.

**Prisma 7 specifics, all read from the tool rather than recalled:**

- the generator is `prisma-client` (not `prisma-client-js`) and emits
  **TypeScript into the project tree** — here `server/src/generated/prisma`,
  with `runtime = "nodejs"` and `moduleFormat = "cjs"`. It is gitignored and
  regenerated by `build`, `typecheck` and `test`.
- generated files import each other with `.js` specifiers, which `tsc` resolves
  but Jest does not. Both Jest configs carry
  `moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" }`.
- connection goes through **`@prisma/adapter-pg`**; Prisma 7 has no plain
  connection-string option.
- CLI configuration lives in `server/prisma.config.ts` (`dotenv/config` plus
  `defineConfig`), not in the schema's `datasource` block.

`prisma init` was **not** run in the repository — it writes a `.env`, a second
`.gitignore` and a set of skills directories. The schema and config are
hand-written to match what it generates.

### 8.1 Roles, databases, and the first migration

Landed by `prompts/18-database-infrastructure.md` (2026-08-23). Three
PostgreSQL roles, matching `docs/build-plan.md` phase 2's "separate
migration/owner, non-owner runtime, and test roles" exactly:

| role             | privilege                                                                                                                                                                                                                                                                       | used by                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `acres_migrator` | `LOGIN`, `CREATEDB` (for `prisma migrate dev`'s shadow database), owns both databases                                                                                                                                                                                           | `prisma migrate` / `validate` / `status` only — never the running API |
| `acres_app`      | `LOGIN` only; `CONNECT` on `acres`, DML (`SELECT`/`INSERT`/`UPDATE`/`DELETE`) via default privileges, **no DDL, no `TRUNCATE`, no `_prisma_migrations`, no `acres_test` or `postgres` connect**                                                                                 | the running Nest API (`DATABASE_URL`)                                 |
| `acres_test`     | same DML, **plus `TRUNCATE`** (the integration suite's `truncateAll` helper needs it — DML alone is not sufficient in PostgreSQL, discovered this session), scoped to the separate `acres_test` database, with **no `_prisma_migrations` and no `acres` or `postgres` connect** | the real-database integration suite                                   |

Two databases, `acres` and `acres_test`, both owned by `acres_migrator` with
PostGIS enabled. `bootstrap-roles.sh` revokes PostgreSQL's default
`CONNECT`/`TEMPORARY` database privileges from `PUBLIC` on `postgres`, `acres`
and `acres_test`, then grants each runtime role only its own application
database. `ALTER DEFAULT PRIVILEGES FOR ROLE acres_migrator ...` grants each
role's DML (and, for `acres_test`, `TRUNCATE`) on every _future_ table a
migration creates, so a later migration needs no manual table re-grant.

`scripts/db/bootstrap-roles.sh` (idempotent — every `CREATE ROLE`/`CREATE
DATABASE` guards on `pg_roles`/`pg_database`) is the one script both
`docker-entrypoint-initdb.d` (via `docker-compose.yml`) and a native host call
directly. `docker-compose.yml` runs a single `postgis/postgis:18-3.6` service
(no Valkey/Garage — phase 2 excludes both); `db:up` / `db:down` / `db:reset`
wrap it at the root. All three role passwords are fixed, disposable local-dev
values (`acres_migrator_dev_password` etc.), the same pattern
`server/.env.example`'s `SESSION_SECRET` placeholder already uses — a real
deployment overrides all three (phase 12).

`scripts/db/harden-runtime-privileges.sh` runs **after** migrations. Prisma
creates `_prisma_migrations` before applying the first migration, so the broad
future-table default privileges would otherwise let runtime roles mutate
migration bookkeeping. The hardening script reasserts the database-level
`PUBLIC`/cross-role revokes and revokes all privileges on
`public."_prisma_migrations"` from both runtime roles, idempotently, on both
databases. CI runs it immediately after `prisma migrate deploy`; locally run it
after every migration deploy/dev run.

**The first migration is generated, reviewed, and committed:**
`server/prisma/migrations/20260823204922_init/migration.sql`, produced by
`prisma migrate dev --name init` against `acres_migrator@localhost:5432/acres`
on a natively-installed PostgreSQL 18.6/PostGIS 3.6.2 (this sandbox has no
Docker; §8.2 records why and how). Read in full and confirmed against
`schema.prisma`: 7 `CREATE TABLE` statements, both enums, every documented
index (`Session(accountId, expiresAt)`, `RegionalMetric(regionId, key)`,
`InsightReport(regionId, status)`, `ContactSubmission.email`,
`JobRun(jobName, status, startedAt)`, plus the three `@unique` btrees), and
both foreign keys with their documented `onDelete` (`Session.account`
Cascade, `RegionalMetric.region` Cascade, `InsightReport.region` SetNull). No
down-migration is authored — Prisma does not generate one, and for an initial
"create everything from empty" migration a hand-written down migration would
only ever mean "drop everything," not a meaningful partial rollback; later
migrations still follow the forward-fix-preferred rule.

`prisma validate` and `prisma generate` still run with no server, as before;
`prisma migrate status` now also runs against both `acres` and `acres_test`
and reports no drift (§8.3, verification record).

**No seed data.** Fixtures that looked like regional intelligence would be read
as real.

**Production volume encryption and key recovery — a target-state contract,
not an implementation.** No production Postgres host exists to inspect (that
inspection is phase 12's), but the contract phase 2 asks for is: the
production data volume is encrypted at rest with provider- or
LUKS-equivalent-managed keys, key rotation does not require a database
outage, and a documented, periodically-drilled key-recovery procedure exists
before any production tenant data is written. `docker-compose.yml`'s
`acres_pgdata` volume is explicitly the opposite of this — disposable,
unencrypted, local-development-only — and is labelled as such in the file
itself.

### 8.2 The environment constraint this sandbox was built under

No Docker (`which docker` → nothing) and no passwordless `sudo`
(`sudo -n true` → "sudo: interactive authentication is required"), both
reconfirmed 2026-08-23, matching §10.1's and §11's prior findings. Since a
Prisma migration must be generated by Prisma against a real Postgres, never
hand-written, the user chose to install PostgreSQL 18 and
`postgresql-18-postgis-3` natively via `apt` in this sandbox, running every
`sudo` step themselves (this session cannot supply a password). `pg_hba.conf`
already shipped Ubuntu's default `host all all 127.0.0.1/32 scram-sha-256`
(and the `::1/128` equivalent), so no reload was needed.
`docker-compose.yml` is still the documented one-command path for every other
host and for CI; this sandbox is the one place that does not use it.

### 8.3 A Jest/Prisma 7 interaction found while writing the real-database suite

Prisma 7's generated client (`runtime: "nodejs"`) lazily loads its WASM query
compiler via `await import(...)`
(`server/src/generated/prisma/internal/class.ts`), on the _first real query_ —
not at import time, which is why the existing double-based suite (which never
issues a real query) never hit this. Jest's default `vm`-sandboxed test
environment rejects a dynamic `import()` with "A dynamic import callback was
invoked without `--experimental-vm-modules`" unless that flag is set.
`server/package.json`'s `test:e2e` script now sets
`NODE_OPTIONS=--experimental-vm-modules` for the `jest` invocation (after
`prisma generate`); the flag has no effect on the existing double-based suite,
confirmed by the full suite passing together (§11, Prompt 18 verification).

---

## 9. Tests

`server/test/api.e2e-spec.ts` and `server/test/env-validation.e2e-spec.ts`, run
with `npm run test:server`. **29 tests, all
passing.** They boot the real `AppModule` through `configureApp`, so they
exercise helmet, CORS, the cookie parser, CSRF, the validation pipe, both
envelopes and the session guard.

`PrismaService` is replaced with a recorded double, which is what keeps the
suite honest about its coverage: **the HTTP surface, not SQL.** No test asserts
anything about the database, because there is no database.

Covered: the health response and that it touches no database; CSRF rejection of
an untokened mutation; registration rejecting a short password and rejecting an
unknown property (`forbidNonWhitelisted`); login failing with
`INVALID_CREDENTIALS` and issuing no session; the session guard rejecting
`/account` and `/jobs/runs`; the anonymous `/auth/session` profile; contact
validation rejecting a short message; a valid submission storing a
lower-cased email with the default source and returning a receipt;
`/regions/:slug` answering 404.

Also covered, and this is the security-load-bearing half: registering issues a
session cookie that is `HttpOnly`, `SameSite=Lax`, `Path=/`, `Expires`-dated and
**not** `Secure` outside production; the value in that cookie is **not** what
reaches the database, and what is stored matches `/^[0-9a-f]{64}$/`; the session
then admits the agent to `/account` (with no `passwordHash` in the response) and
to `/jobs/runs`; logout writes `revokedAt` and clears the cookie; and
`/auth/session` clears a cookie that no longer resolves.

Environment for the suite is set in `test/setup-env.ts` via `setupFiles`, not in
a `beforeEach` — `ConfigModule.forRoot()` validates while `app.module.ts` is
being imported, which happens first.

The suite-wide throttling environment is deliberately loose:
`RATE_LIMIT_DEFAULT_LIMIT=1000` and `RATE_LIMIT_STRICT_LIMIT=1000`, so the
existing flow tests do not depend on incidental request counts. The
`describe('rate limiting', …)` block uses `createTestApp(prisma, envOverrides)`
to override `AcresConfigService` for one app at a time and lower only the tier
under test. It proves `POST /forms/contact` and `POST /auth/login` return
429/`RATE_LIMITED` after the strict budget, `POST /auth/register` does the
same while following the real post-registration CSRF refresh flow,
`GET /auth/csrf` stays off the strict tier but is still limited by the default
tier, and `GET /health` stays unthrottled even when the default limit is low.
`env-validation.e2e-spec.ts` proves the real `validateEnv` path defaults,
parses and rejects the three rate-limit variables.

`npm test --workspace=@acres/server` (unit, `rootDir: src`) runs with
`--passWithNoTests`: **there are no unit specs yet**, and the script says so
rather than appearing to pass a suite that does not exist.

### `server/test/database.e2e-spec.ts` — the real-database suite

Landed by `prompts/18-database-infrastructure.md` (2026-08-23). **8 tests, all
passing**, run against a real, migrated `acres_test` database through
`server/test/helpers/real-db-test-app.ts`'s `createRealDbTestApp()` — the
opposite of `test-app.ts`: `PrismaService` is **not** overridden. `beforeAll`
asserts `SELECT 1` resolves before running anything, so a missing database
fails once with a clear message instead of every test timing out separately;
`beforeEach` calls `truncateAll()` (one `TRUNCATE ... RESTART IDENTITY
CASCADE` as `acres_test`, which needs the `TRUNCATE` grant §8.1 records).

Covered, each against a real code path, not a double: **CRUD** —
`POST /auth/register` through supertest, then `prisma.account.findUnique`
confirms the row and that `passwordHash` matches `/^\$2[aby]\$/`, never the
plaintext password. **Unique** — two concurrent registrations of the same
email (`Promise.all`, matching the race `AccountsService.create`'s own doc
comment describes) resolve to exactly one `201` and one `401`
`INVALID_CREDENTIALS`, and exactly one `Account` row exists — proving the real
`P2002` catch, not the sequential existence-check path a single repeated call
would exercise instead. **FK + session-cascade** — deleting the account
directly via Prisma empties `Session` for that `accountId`, proving
`onDelete: Cascade` at the database level. **Current route integration** —
seeding a `Region` + `RegionalMetric` directly, then `GET /regions` and
`GET /regions/:slug` through supertest assert the real query shape, and
`GET /regions/nowhere` still 404s. **Test runtime role cannot DDL** — the
suite's app connection (`acres_test`) attempting
`CREATE TABLE "__acres_privilege_probe" (id text)`
rejects with a real Postgres schema-privilege error. The suite also proves
`"_prisma_migrations"` exists through the migrator but is unreadable to
`acres_test` and `acres_app`, and that neither runtime role can connect outside
its own database, including the maintenance `postgres` database.
**Readiness** — `GET /health/ready` returns 200
`{"status":"ok","database":"ok"}` while the database is reachable; the
negative path (503 `NOT_READY`) and the production runtime role's
`acres_app` DDL denial on `acres` are manual smoke tests, not part of this
suite (§11).

`npm run test:server` now runs 3 suites / 37 tests total (29 double-based +
8 real-database) and **requires a real, migrated `acres_test` database to be
reachable** — a permanent shift from the "no database is provisioned" era
this section used to describe. A developer who has not run `db:up` and
migrated `acres_test` sees the new suite fail with one clear connection
error, bounded by `PrismaService`'s `connectionTimeoutMillis` (§6), not a
hang.

---

## 10. Deployment: what a host must provide

**Decision: the API is a long-lived Node container service, not a Vercel
serverless function.** It holds server-side sessions and runs in-process
scheduled jobs; neither survives a function that is frozen between requests.

**A Dockerfile and a CI workflow exist as of `prompts/14-server-deployment-infra.md`**
(§10.1 below) — `AGENTS.md` §8.2 still defers host selection, Terraform and an
actual registry, but the "no provider manifest is created" line above is now
stale for two of its three items. The production start contract remains
host-portable independent of the container:

```bash
npm run build          # or: npm run build:shared && npm run build:server
npm run start:server   # node dist/main
```

Any host must provide:

- a **long-lived Node 24 LTS process**;
- **persistent outbound network access** to Postgres;
- **environment variable injection** for §6's variables;
- a **health-checkable HTTP port** — `GET /health`, which deliberately does not
  depend on the database. Start it through the package script if the reported
  `version` matters; a bare `node dist/main` entrypoint reports `null` (§6);
- **exactly one instance with `SCHEDULER_ENABLED=true`**, or a provider
  scheduler that replaces in-process cron (§7).

**One condition on all of that:** the in-memory throttler is per Node process.
This matches the current single-process scheduler constraint, but a scaled API
needs shared rate-limit storage or provider-level throttling before it can treat
the per-IP budgets as global across replicas.

There is one more trust-boundary condition: `@nestjs/throttler` reads Express
`req.ip`. If the API sits behind a reverse proxy or load balancer, production
must configure that proxy trust boundary explicitly or enforce equivalent
client-IP-aware rate limiting at the edge.

Next.js on Vercel is unchanged and unaffected.

### 10.1 The Dockerfile and CI workflow

Added by `prompts/14-server-deployment-infra.md` (2026-08-23):
`server/Dockerfile`, root `.dockerignore`, and `.github/workflows/ci.yml`.

**Four build stages**. The three explicit Node image stages now use
`node:24-alpine` (`deps`, `prod-deps`, and `runtime`); `build` inherits from
`deps`, so every Node-based server image stage runs on the Node 24 Alpine line.

1. **`deps`** — installs only `@acres/server` and `@acres/shared`'s
   dependencies via `npm ci --workspace=@acres/server --workspace=@acres/shared
--include-workspace-root --ignore-scripts`. `client/package.json` (but none
   of `client/`'s source) still has to be copied in, because `npm ci` validates
   every workspace declared in root `package.json`'s `"workspaces"` array
   against `package-lock.json` even when `--workspace` scopes what actually
   gets linked — verified this session in an isolated scratch directory.
   `--ignore-scripts` skips the root `prepare` hook (which builds
   `@acres/shared`) and any package postinstall; both run explicitly in stage 2.
2. **`build`** (`FROM deps`) — copies `packages/shared` and `server` source,
   then runs `npm run build --workspace=@acres/shared && npm run build
--workspace=@acres/server` (`prisma generate && nest build`). The generated
   Prisma client (`server/src/generated/prisma`, 15 `.ts` files, no non-`.ts`
   runtime asset) compiles into `server/dist/generated/prisma` along with
   everything else `tsc` touches — confirmed by inspecting the build output
   this session — so there is nothing `nest build` could silently fail to
   carry into `dist`.
3. **`prod-deps`** — a second, independent `npm ci --omit=dev` of the same two
   workspaces, so the runtime image's `node_modules` never carries a devDependency.
4. **`runtime`** — assembles the shipped image from `prod-deps`'s
   `node_modules` and `build`'s two `dist` outputs. Runs as `USER node`, not
   root.

**The `@acres/shared` symlink resolution rule**: `prod-deps`'s `npm ci` links
`@acres/shared` into `node_modules/@acres/shared` as a relative symlink to
`../../packages/shared` — verified with `readlink` against a real
npm-workspaces fixture during this prompt's code review (2026-08-23), not
recalled; the symlink itself sits one directory deeper than an unscoped
package's would, inside the `@acres/` directory npm creates for scoped names.
Copying `node_modules` alone would carry a symlink that resolves to nothing,
so the runtime stage also copies `@acres/shared`'s real `package.json` and
`dist` to `packages/shared/...` — the same relative position it occupies in
the source tree — which makes the copied symlink resolve correctly with no
`node_modules` rewriting.

**`CMD ["node", "server/dist/main.js"]`, not `npm run start:server`**: read in
full this session, the `nestjs-best-practices` skill's
`devops-graceful-shutdown` rule requires `SIGTERM` delivered straight to the
Node process so `app.setup.ts`'s `enableShutdownHooks()` can drain in-flight
requests before exit — running npm as PID 1 does not reliably forward the
signal. The already-documented consequence (§6) still applies: outside an
npm-run entrypoint, `process.env.npm_package_version` is unset, so `GET
/health` reports `"version": null` from this image. This is not a new
trade-off, just the one place it is now unavoidable.

**`HEALTHCHECK`** polls `GET /health` on `$PORT` every 30s (5s timeout, 10s
start period, 3 retries) via `wget`, alpine's built-in HTTP client.

**No registry push is configured.** The CI workflow's `docker` job builds the
image with `docker/build-push-action@v7` and `push: false`, `load: true` — it
proves the image builds and its container answers `/health`, and stops there.
Choosing a registry and a host is deferred (§12).

Phase 12A adds an inert production reference under `infra/` plus deterministic
operations checks. `infra/compose/docker-compose.production.example.yml` models
Caddy, Next, API, worker, Postgres/PostGIS, Valkey, Garage, ClamAV, and
optional Prometheus/Grafana with only Caddy publishing host ports. The example
keeps `SCHEDULER_ENABLED=false` on the API and `true` on the worker, declares
encrypted production mount placeholders for stateful services, and consumes
`infra/env/production.env.example` sentinels rather than real secrets. It uses
`scripts/db/bootstrap-production-roles.sh`, not the local bootstrap that creates
`acres_test`. The authoritative runbook and blocker list live in
[`operations.md`](operations.md).

**The CI workflow** (`.github/workflows/ci.yml`) runs two jobs on push/PR to
`main`: `checks` (uses `actions/setup-node@v7` with Node 24, then `npm ci`,
lint, typecheck, build, contract drift, the Phase 12A `ops:check`, bootstrap
roles, apply migrations to both `acres` and `acres_test`, harden runtime
privileges, `test:server`) and
`docker` (needs `checks`; builds the image, runs it with a throwaway
`SESSION_SECRET` and a `DATABASE_URL` nothing connects to — `GET /health` takes
no database dependency by design (§3), so the smoke test does not need a real
Postgres — waits up to 30s for `/health` to answer, then always prints
container logs and removes the container). Action versions were checked
against their live tag lists this session (2026-08-23), not recalled:
`actions/checkout@v7`, `actions/setup-node@v7`, `docker/setup-buildx-action@v4`,
`docker/build-push-action@v7`.

**Neither `docker build` nor the CI workflow's `docker` job has been executed
anywhere in this session.** Docker is not installed in this sandbox
(`which docker` → nothing); the only local verification was a manual trace of
every `COPY --from=<stage> <src> <dst>` against the real repository build
output, confirming every source path exists and no stage references a file no
earlier stage produced, plus a YAML syntax parse of the workflow. The first
real proof either works is the commit's own CI run on `main`.

---

## 11. Verification record

Every command below was run from the repository root on 2026-08-21, at
`HEAD = 5d9899a` plus this change. Output is quoted, not summarised.

```text
$ npm install

added 601 packages, and audited 1276 packages in 2m

319 packages are looking for funding
  run `npm fund` for details

3 high severity vulnerabilities
```

(the advisory is §1's, dev-only, not applied)

```text
$ npm run lint

npm notice run acres@0.1.0 lint
npm notice run npm run lint --workspace=@acres/client && npm run lint --workspace=@acres/shared && npm run lint --workspace=@acres/server
npm notice run @acres/client@0.1.0 lint
npm notice run eslint
npm notice run @acres/shared@0.1.0 lint
npm notice run eslint "src/**/*.ts"
npm notice run @acres/server@0.1.0 lint
npm notice run eslint "{src,test}/**/*.ts"
```

(no findings; eslint prints nothing when clean)

```text
$ npm run typecheck

npm notice run @acres/shared@0.1.0 build
npm notice run tsc -p tsconfig.json
npm notice run @acres/client@0.1.0 typecheck
npm notice run tsc --noEmit
npm notice run @acres/server@0.1.0 typecheck
npm notice run prisma generate && tsc -p tsconfig.json --noEmit
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 53ms
```

```text
$ npm run build

▲ Next.js 16.3.1 (Turbopack)
✓ Compiled successfully in 988ms
  Finished TypeScript in 4.0s ...
✓ Generating static pages using 7 workers (10/10) in 277ms

Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /apple-icon.png
├ ○ /icon.svg
├ ○ /opengraph-image.png
├ ○ /robots.txt
├ ○ /sitemap.xml
└ ○ /twitter-image.png

npm notice run @acres/server@0.1.0 build
npm notice run prisma generate && nest build
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 50ms
```

The client's route list is identical to the one `docs/polish.md` records — no
route was added, removed or de-optimised.

```text
$ npm run test:server

Test Suites: 1 passed, 1 total
Tests:       18 passed, 18 total
Snapshots:   0 total
Time:        3.242 s
```

### The smoke test

Port 3000 was occupied by a running `next-server`; **3001 was free** and used.
The server was started detached with the environment inline, polled, asserted
against, and stopped.

```text
$ curl -isS http://localhost:3001/health
HTTP/1.1 200 OK
Content-Security-Policy: default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests
Cross-Origin-Opener-Policy: same-origin
Referrer-Policy: no-referrer
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Credentials: true
Content-Type: application/json; charset=utf-8

{"ok":true,"data":{"status":"ok","service":"acres-api","version":"0.1.0","uptimeSeconds":11}}
```

Helmet's headers and the credentialed CORS policy are visible on the response,
which is the evidence that both are actually mounted.

```text
$ curl -isS http://localhost:3001/auth/csrf
HTTP/1.1 200 OK
Set-Cookie: acres_csrf=34a5b0dd…4066297; Path=/; HttpOnly; SameSite=Lax

# called twice on one cookie jar: the still-valid cookie is reused rather than
# re-minted, which is the documented default behaviour in §5
csrf #1:  {"ok":true,"data":{"csrfToken":"a1a23078…67b0a8c5.494a7ad3…4511de75", …}}
csrf #2:  {"ok":true,"data":{"csrfToken":"a1a23078…67b0a8c5.494a7ad3…4511de75", …}}

$ curl -isS -X POST http://localhost:3001/forms/contact \
    -H 'Content-Type: application/json' \
    -d '{"name":"A","email":"a@example.com","message":"a message long enough"}'
{"ok":false,"error":{"code":"CSRF_INVALID","message":"CSRF token missing or invalid."}}

$ curl -isS http://localhost:3001/account
{"ok":false,"error":{"code":"UNAUTHENTICATED","message":"Sign in to continue."}}

$ curl -sS http://localhost:3001/auth/session
{"ok":true,"data":{"authenticated":false,"account":null,"expiresAt":null}}

$ curl -isS http://localhost:3001/regions
{"ok":false,"error":{"code":"INTERNAL_ERROR","message":"Something went wrong."}}
```

That last one is the designed behaviour with **no database provisioned**: the
route fails, the envelope holds, and the real `PrismaClientKnownRequestError` is
logged server-side and never sent to the client.

`prisma validate` passes against the committed schema:

```text
$ npm run prisma:validate --workspace=@acres/server
The schema at prisma/schema.prisma is valid 🚀
```

### Prompt 13 rate-limit verification

Run on 2026-08-23 for `prompts/13-rate-limiting.md`.

```text
$ npm install @nestjs/throttler@^6.5.0 --workspace=@acres/server

added 1 package, and audited 1295 packages in 26s

319 packages are looking for funding
  run `npm fund` for details

3 high severity vulnerabilities
```

```text
$ npm ls @nestjs/throttler --workspace=@acres/server
acres@0.1.0 /home/dgk/Documents/next/acres
└─┬ @acres/server@0.1.0 -> ./server
  └── @nestjs/throttler@6.5.0
```

```text
$ npm run lint

> acres@0.1.0 lint
> npm run lint --workspace=@acres/client && npm run lint --workspace=@acres/shared && npm run lint --workspace=@acres/server

> @acres/client@0.1.0 lint
> eslint

> @acres/shared@0.1.0 lint
> eslint "src/**/*.ts"

> @acres/server@0.1.0 lint
> eslint "{src,test}/**/*.ts"
```

```text
$ npm run typecheck

> @acres/server@0.1.0 typecheck
> prisma generate && tsc -p tsconfig.json --noEmit

✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 197ms
```

```text
$ npm run build
FATAL: An unexpected Turbopack error occurred.
Failed to write app endpoint /page
Caused by:
- [project]/client/app/globals.css [app-client] (css)
- creating new process
- binding to a port
- Operation not permitted (os error 1)
```

The root build failed before the server workspace ran, in the unchanged Next.js
client build. Re-running with escalated command permissions produced the same
Turbopack port-binding panic, so this record treats it as an environment
limitation rather than a backend regression. The changed workspace build passes:

```text
$ npm run build:server

> @acres/server@0.1.0 build
> prisma generate && nest build

✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 213ms
```

```text
$ npm run test:server

Test Suites: 2 passed, 2 total
Tests:       29 passed, 29 total
Snapshots:   0 total
Time:        11.775 s
```

Manual smoke, with no database provisioned and `RATE_LIMIT_STRICT_LIMIT=2`,
used `/forms/contact` because the guard counts before the handler attempts the
database write:

```text
$ curl -fsS http://localhost:3001/health
{"ok":true,"data":{"status":"ok","service":"acres-api","version":"0.1.0","uptimeSeconds":2}}

$ for i in $(seq 1 4); do curl ... -X POST /forms/contact; done
500
500
429
429
```

```text
$ git diff --check
```

(no output)

### Prompt 14 deployment-infra verification

Run on 2026-08-23 for `prompts/14-server-deployment-infra.md`, on this
sandbox's toolchain (`node v24.19.0`, `npm 11.17.0` — both satisfy §10's
"Node 22+" baseline at the time; prompt 19 later moved the Dockerfile itself
to `node:24-alpine`).

```text
$ node -v && npm -v
v24.19.0
11.17.0
```

```text
$ python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ok')"
ok
```

```text
$ git diff --check -- server/Dockerfile .dockerignore .github/workflows/ci.yml
```

(no output)

```text
$ npm run lint
> acres@0.1.0 lint
> npm run lint --workspace=@acres/client && npm run lint --workspace=@acres/shared && npm run lint --workspace=@acres/server
```

(no errors)

```text
$ npm run typecheck
> @acres/server@0.1.0 typecheck
> prisma generate && tsc -p tsconfig.json --noEmit

✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 55ms
```

(no errors from any of the three workspaces)

```text
$ npm run build
...
✓ Compiled successfully in 1684ms
...
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 67ms
```

(all three workspaces built clean — the Turbopack port-binding panic recorded
under prompt 13's verification did not recur in this sandbox)

```text
$ npm run test:server
Test Suites: 2 passed, 2 total
Tests:       29 passed, 29 total
Snapshots:   0 total
Time:        4.659 s
```

**Manual Dockerfile trace** (Docker itself is not installed in this sandbox —
`which docker` returned nothing, so no `docker build` ran anywhere in this
session): every `COPY` source in `server/Dockerfile` was checked against the
real repository layout after the build above. `packages/shared/package.json`,
`packages/shared/dist` (populated, `outDir: "./dist"` in
`packages/shared/tsconfig.json`), `server/package.json`, `server/dist`
(populated, `nest-cli.json` uses the default `dist` output path), and
`server/dist/main.js` all exist exactly where the Dockerfile's `COPY
--from=<stage>` instructions expect them, including
`server/dist/generated/prisma` — proof that `nest build`'s `tsc` compiles the
generated Prisma client along with everything else, with no separate asset to
drop. **This is a manual trace, not an execution; the build has not been run.**

### Prompt 18 database-infrastructure verification

Run on 2026-08-23 for `prompts/18-database-infrastructure.md`, natively in
this sandbox (no Docker; PostgreSQL 18.6/PostGIS 3.6.2 installed via `apt`
with the user running every `sudo` step — §8.2).

```text
$ psql --version
psql (PostgreSQL) 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)

$ pg_lsclusters
Ver Cluster Port Status Owner    Data directory              Log file
18  main    5432 online postgres /var/lib/postgresql/18/main ...
```

```text
$ sudo -u postgres env ACRES_MIGRATOR_PASSWORD=... ACRES_APP_PASSWORD=... \
    ACRES_TEST_PASSWORD=... POSTGRES_USER=postgres POSTGRES_DB=postgres \
    bash scripts/db/bootstrap-roles.sh
DO
CREATE DATABASE
CREATE DATABASE
GRANT
GRANT
CREATE EXTENSION
GRANT
ALTER DEFAULT PRIVILEGES
ALTER DEFAULT PRIVILEGES
CREATE EXTENSION
GRANT
ALTER DEFAULT PRIVILEGES
ALTER DEFAULT PRIVILEGES
```

After post-review hardening, this agent still could not execute the native
`sudo -u postgres ... bootstrap-roles.sh` rerun non-interactively:

```text
$ sudo -n -u postgres env ... bash scripts/db/bootstrap-roles.sh
sudo: interactive authentication is required
```

Before the maintenance `postgres` database revoke was added to the script, the
guarded/idempotent path was rerun over TCP as `acres_migrator` after the
roles/databases already existed. That verified the revised psql password
quoting parsed and that the repeatable application-database grants/revokes
remained safe:

```text
$ PGHOST=localhost PGPORT=5432 PGPASSWORD=... POSTGRES_USER=acres_migrator \
    POSTGRES_DB=postgres ACRES_MIGRATOR_PASSWORD=... ACRES_APP_PASSWORD=... \
    ACRES_TEST_PASSWORD=... bash scripts/db/bootstrap-roles.sh
REVOKE
REVOKE
REVOKE
REVOKE
GRANT
GRANT
CREATE EXTENSION
NOTICE:  extension "postgis" already exists, skipping
GRANT
ALTER DEFAULT PRIVILEGES
ALTER DEFAULT PRIVILEGES
NOTICE:  extension "postgis" already exists, skipping
CREATE EXTENSION
GRANT
ALTER DEFAULT PRIVILEGES
ALTER DEFAULT PRIVILEGES
```

```text
$ DATABASE_MIGRATION_URL=postgresql://acres_migrator:...@localhost:5432/acres?schema=public \
    npm run prisma:migrate --workspace=@acres/server -- --name init

Applying migration `20260823204922_init`
The following migration(s) have been created and applied from new schema changes:
prisma/migrations/
  └─ 20260823204922_init/
    └─ migration.sql
Your database is now in sync with your schema.
```

Migration reviewed in full (§8.1) before being deployed to `acres_test` and
committed.

```text
$ npm run prisma:migrate:deploy --workspace=@acres/server   # against acres_test
All migrations have been successfully applied.

$ npm run prisma:migrate:status --workspace=@acres/server   # against acres and acres_test
Database schema is up to date!    # both, no drift
```

Post-review hardening was applied after migrations:

```text
$ PGHOST=localhost PGPORT=5432 PGPASSWORD=... POSTGRES_MIGRATOR_USER=acres_migrator \
    bash scripts/db/harden-runtime-privileges.sh
REVOKE
REVOKE
GRANT
DO
REVOKE
REVOKE
GRANT
DO
```

The maintenance `postgres` database also had its default runtime-role access
closed manually as the Postgres superuser:

```text
$ sudo -u postgres psql -d postgres -c "REVOKE CONNECT, TEMPORARY ON DATABASE postgres FROM PUBLIC; REVOKE CONNECT, TEMPORARY ON DATABASE postgres FROM acres_app; REVOKE CONNECT, TEMPORARY ON DATABASE postgres FROM acres_test;"
REVOKE
REVOKE
REVOKE

$ PGPASSWORD=... psql -h localhost -U acres_app -d postgres -c 'select 1'
FATAL:  permission denied for database "postgres"

$ PGPASSWORD=... psql -h localhost -U acres_test -d postgres -c 'select 1'
FATAL:  permission denied for database "postgres"
```

**Reset-from-chain proof**: `DROP DATABASE acres_test` / `CREATE DATABASE
acres_test OWNER acres_migrator` as `acres_migrator`, confirmed empty
(`prisma migrate status` reported the migration as unapplied), then
`prisma migrate deploy` succeeded against the genuinely empty database.

**Runtime-role DDL denial**: `acres_app` connecting to `acres` over TCP failed
to create a table, proving the production runtime role has no schema DDL
privilege:

```text
$ PGCONNECT_TIMEOUT=5 PGPASSWORD=... psql -h 127.0.0.1 -U acres_app -d acres \
    -v ON_ERROR_STOP=1 -c 'CREATE TABLE "__acres_privilege_probe" (id text);'
ERROR:  permission denied for schema public
LINE 1: CREATE TABLE "__acres_privilege_probe" (id text);
                     ^
```

```text
$ npm run lint      # clean, all three workspaces
$ npm run typecheck # clean, all three workspaces
$ npm run build     # clean, all three workspaces
```

```text
$ npm run test:server
Test Suites: 3 passed, 3 total
Tests:       37 passed, 37 total
Snapshots:   0 total
Time:        4.649 s
```

**Manual readiness smoke** — positive path, server started against
`acres_app`:

```text
$ curl -isS http://localhost:3001/health/ready
HTTP/1.1 200 OK
{"ok":true,"data":{"status":"ok","database":"ok"}}
```

Negative path: pointing `DATABASE_URL` at an unreachable port returned 503
promptly, bounded by `connectionTimeoutMillis`:

```text
$ curl -isS http://localhost:3001/health/ready
HTTP/1.1 503 Service Unavailable
{"ok":false,"error":{"code":"NOT_READY","message":"The database is not reachable."}}
```

```text
$ git diff --check && git diff --cached --check
$ python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ok')"
ok
```

**CI parity is proved by the commit's own CI run on `main`**, exactly as
§10.1 states for the Dockerfile — this sandbox cannot exercise the `checks`
job's Postgres service container locally.

---

### Prompt 19 Node 24 LTS verification

Run on 2026-08-23 for `prompts/19-node-24-lts.md`, under the local Node 24
runtime. Application behavior, schema, package versions, and the lockfile did
not change.

```text
$ node --version
v24.19.0

$ npm --version
11.17.0

$ git log -1 --oneline
4f34481 feat(db): add Postgres infrastructure
```

The package engine check was read from installed manifests after a clean
lockfile install:

```text
$ node -e "..."
next 16.3.1 engines={"node":">=20.9.0"}
@nestjs/core 11.2.1 engines={"node":">= 20"}
prisma 7.9.1 engines={"node":"^20.19 || ^22.12 || >=24.0"}
@prisma/client 7.9.1 engines={"node":"^20.19 || ^22.12 || >=24.0"}
```

`npm ci` first failed in the sandbox on a transient registry DNS lookup, then
the same command passed when rerun with network access:

```text
$ npm ci
npm error code EAI_AGAIN
npm error request to https://registry.npmjs.org/zod-validation-error/-/zod-validation-error-4.0.2.tgz failed, reason: getaddrinfo EAI_AGAIN registry.npmjs.org

$ npm ci
> acres@0.1.0 prepare
> npm run build --workspace=@acres/shared

> @acres/shared@0.1.0 build
> tsc -p tsconfig.json

added 1291 packages, and audited 1295 packages in 2m
3 high severity vulnerabilities
npm warn allow-scripts 3 packages have install scripts not yet covered by allowScripts:
npm warn allow-scripts   @prisma/engines@7.9.1 (postinstall: node scripts/postinstall.js)
npm warn allow-scripts   prisma@7.9.1 (preinstall: node scripts/preinstall-entry.js)
npm warn allow-scripts   unrs-resolver@1.12.2 (postinstall: node postinstall.js)
```

The advisory and blocked-install-script warning are the same accepted Prisma
CLI/dev-tooling findings recorded in §1. No package version or lockfile update
was made.

```text
$ npm run prisma:validate --workspace=@acres/server
The schema at prisma/schema.prisma is valid 🚀

$ npm run prisma:generate --workspace=@acres/server
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 57ms

$ npm run lint
> @acres/client@0.1.0 lint
> eslint
> @acres/shared@0.1.0 lint
> eslint "src/**/*.ts"
> @acres/server@0.1.0 lint
> eslint "{src,test}/**/*.ts"

$ npm run typecheck
> @acres/server@0.1.0 typecheck
> prisma generate && tsc -p tsconfig.json --noEmit
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 52ms

$ npm run build
▲ Next.js 16.3.1 (Turbopack)
✓ Compiled successfully in 1278ms
✓ Generating static pages using 7 workers (10/10) in 200ms
> @acres/server@0.1.0 build
> prisma generate && nest build
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 48ms
```

The Node runtime declarations were inspected directly:

```text
$ rg -n '^FROM node:|node-version:' server/Dockerfile .github/workflows/ci.yml
.github/workflows/ci.yml:34:          node-version: '24'
server/Dockerfile:4:FROM node:24-alpine AS deps
server/Dockerfile:27:FROM node:24-alpine AS prod-deps
server/Dockerfile:36:FROM node:24-alpine AS runtime

$ rg -n 'node:22|node-version: .22.' server/Dockerfile .github/workflows/ci.yml && exit 1 || true
```

No output.

The real server suite was run by the user in the same checkout after starting
the native PostgreSQL 18 cluster:

```text
$ sudo pg_ctlcluster 18 main start

$ npm run test:server
PASS  test/env-validation.e2e-spec.ts
PASS  test/database.e2e-spec.ts
PASS  test/api.e2e-spec.ts

Test Suites: 3 passed, 3 total
Tests:       37 passed, 37 total
Snapshots:   0 total
Time:        4.808 s, estimated 5 s
Ran all test suites.
```

The same shell then confirmed readiness and migration status for both
databases:

```text
$ pg_isready -h localhost -p 5432
localhost:5432 - accepting connections

$ DATABASE_MIGRATION_URL="$APP_MIGRATION_URL" \
    npm run prisma:migrate:status --workspace=@acres/server
Datasource "db": PostgreSQL database "acres", schema "public" at "localhost:5432"

1 migration found in prisma/migrations

Database schema is up to date!

$ DATABASE_MIGRATION_URL="$TEST_MIGRATION_URL" \
    npm run prisma:migrate:status --workspace=@acres/server
Datasource "db": PostgreSQL database "acres_test", schema "public" at "localhost:5432"

1 migration found in prisma/migrations

Database schema is up to date!
```

After that user-run database evidence, this agent's sandbox still reported the
native cluster as down:

```text
$ pg_lsclusters
Ver Cluster Port Status Owner  Data directory              Log file
18  main    5432 down   nobody /var/lib/postgresql/18/main /var/log/postgresql/postgresql-18-main.log

$ pg_isready -h localhost -p 5432
localhost:5432 - no response
```

That is recorded as an evidence boundary, not a replacement for the user-run
database transcript above.

Docker-compatible local tooling remains absent:

```text
$ for c in docker podman nerdctl; do command -v "$c" || echo "$c: not found"; done
docker: not found
podman: not found
nerdctl: not found
```

The local image build and container smoke still cannot run in this sandbox.
The first executable image proof is the committed workflow's `docker` job after
a separately authorized push.

```text
$ python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('ok')"
ok

$ git diff --check
```

No output.

---

## 12. Deferred, and why

| deferred                                                                             | why                                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| any seed data                                                                        | it would read as real regional intelligence                                                                                                                                |
| a regional-data ingestion provider                                                   | none chosen; §7                                                                                                                                                            |
| `@acres/shared` in `client/`                                                         | nothing consumes it yet                                                                                                                                                    |
| any landing-page form UI                                                             | the endpoint exists; the form is a later prompt                                                                                                                            |
| login / register screens                                                             | same                                                                                                                                                                       |
| product authorization beyond organizations                                           | `/jobs/runs` is still session-gated only; tenant routes use the organization policy in §14                                                                                 |
| email delivery                                                                       | which is why registration returns a generic failure; §4                                                                                                                    |
| Terraform / IaC, an actual registry + push, choosing a host to run the container     | §10.1 built the Dockerfile and CI; no hosting provider has been chosen                                                                                                     |
| OAuth / social login, analytics, billing, CMS, admin                                 | out of scope for step 8                                                                                                                                                    |
| production PostgreSQL host, volume encryption implementation, key-recovery tooling   | §8.1 records the target-state _contract_ only; no production host exists to inspect or drill against — phase 12                                                            |
| organization deletion, mail delivery, product data tenancy beyond the phase-3 tables | deletion/retention/SMTP/later tenant tables remain unapproved or later-phase work                                                                                          |
| readiness-endpoint container smoke test in the CI `docker` job                       | that job has no Postgres service attached; adding one grows CI runtime for a check phase 2 does not require there — the `checks` job's integration suite already covers it |

---

## 13. Current backend to target architecture bridge

Prompt 16 established the target product architecture after this build record
was written. This section is a bridge, not a claim that the target has shipped.
For decisions and sequencing, read `docs/system-architecture.md`,
`docs/security.md`, `docs/product.md`, and `docs/build-plan.md`.

| current implementation evidenced above                                                                                                                                        | approved target                                                                                                                                                                           | owning phase                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| NestJS 11.2/Express API with `/api/v1` product REST, version-neutral `/health`, request IDs and authenticated read-only `/graphql`                                            | Client integration, additional read models and future additive GraphQL expansion                                                                                                          | 5+                                   |
| `accounts`, `auth`, and `sessions`; opaque hashed database sessions and global CSRF. Identity now also owns account-token persistence with no public delivery route           | Recovery UI/mail delivery and client auth shell                                                                                                                                           | 5, mail in a later approved phase    |
| Prisma 7.9.1 schema with tenant tables, RLS, account tokens and `IdempotencyRecord`; real PostgreSQL 18/PostGIS 3.6, reviewed migrations, three-role separation landed (§8.1) | Same, in production: a provisioned host, and the volume-encryption/key-recovery contract §8.1 records implemented and drilled; Prisma 8 stays deferred until GA and a dedicated migration | 2–4, then 12 for the production host |
| Organizations, memberships, invitations and audit events are tenant-scoped with transaction-local context and forced RLS                                                      | Later tenant-owned datasets/dashboards/reports/exports inherit this boundary in their phases                                                                                              | 6-10                                 |
| Flat public `Region` records                                                                                                                                                  | Globally shared arbitrary-depth administrative hierarchy, stable external codes/aliases/provenance and reviewed PostGIS geometry SQL                                                      | 7                                    |
| DB-backed `JobRun` reads and one in-process hourly session purge                                                                                                              | PostgreSQL outbox/job authority, Valkey/BullMQ transport, separately runnable Nest worker, idempotent stages, retries/dead letters and audited schedules                                  | 6                                    |
| No object storage, upload, parser, or antivirus boundary                                                                                                                      | Garage quarantine/artifacts, short-lived presigned uploads, ClamAV scan-before-parse, bounded CSV/XLSX/GeoJSON stages and immutable dataset versions                                      | 6–7                                  |
| Typed metric definitions/observations/quality/aggregates, dashboard saved views, report revisions/evidence, export requests/artifacts and object-storage-backed artifacts     | Larger read models, export progress streaming, collaboration, sharing, scheduled exports and optional AI draft generation                                                                  | 8–11                                 |
| Next client has a same-origin `/api/v1` bridge, typed server/browser clients, login/register/logout, active organization preference and a first protected `/app` shell        | Production Caddy routing and later product dashboards/datasets/reports build on this shell                                                                                                | 5+                                   |
| Portable Node 24 API image and GitHub Actions build/smoke test; no full topology                                                                                              | Compose+Caddy single-host reference, private stateful services, OTel/Prometheus/optional Grafana, backups/restores and hardened promotion                                                 | 12                                   |
| No AI                                                                                                                                                                         | Optional disabled-by-default local llama.cpp/vLLM adapter receives minimal authorized evidence and proposes schema-validated drafts; deterministic product remains complete               | 11                                   |

The existing route, security, environment, test, and deployment descriptions in
§§2–11 remain the facts until their owning phase is implemented and committed.
When a phase lands, update the relevant section in place and retain only the
migration rationale that a future maintainer still needs.

---

## 14. Organizations, permissions and RLS

Implemented by `prompts/22-organizations-permissions-rls.md`.

### Route map

All routes keep the existing success/error envelopes. All mutations remain
under the global CSRF middleware and all routes require an authenticated
session.

| method   | path                                                       | behavior                                                                  |
| -------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| `GET`    | `/organizations`                                           | list active organizations for the account                                 |
| `POST`   | `/organizations`                                           | explicit bootstrap: create organization, owner membership and audit event |
| `GET`    | `/organizations/:organizationId`                           | read the selected organization and caller membership                      |
| `PATCH`  | `/organizations/:organizationId`                           | update organization name                                                  |
| `GET`    | `/organizations/:organizationId/members`                   | list active/revoked membership state                                      |
| `PATCH`  | `/organizations/:organizationId/members/:membershipId`     | change a non-owner target role                                            |
| `DELETE` | `/organizations/:organizationId/members/:membershipId`     | soft-revoke a non-owner membership                                        |
| `POST`   | `/organizations/:organizationId/ownership-transfers`       | promote a target member to owner and demote the actor to admin            |
| `GET`    | `/organizations/:organizationId/invitations`               | list invitations without token hashes                                     |
| `POST`   | `/organizations/:organizationId/invitations`               | issue one raw invitation token in the response only                       |
| `DELETE` | `/organizations/:organizationId/invitations/:invitationId` | revoke an unaccepted invitation                                           |
| `POST`   | `/invitations/accept`                                      | accept a live token for the signed-in account email                       |

`TENANCY_ENABLED=false` makes the new surface fail closed with `NOT_READY`.
Existing accounts are not backfilled into organizations.

### Permission contract

`server/src/organizations/permissions.ts` is the centralized policy. Owners
have every phase-3 permission. Admins can read/update organizations, read
members/invitations/audit, and manage non-owner members/invitations. Analysts
and viewers have organization read only. Generic role assignment cannot assign
`owner`; owner handoff goes through the transfer command.

### Persistence and RLS

The schema now has `Organization`, `Membership`, `Invitation`, `AccountToken`
and `AuditEvent`, plus `OrganizationRole`, `AccountTokenPurpose` and
`AuditAction`. Migrations:

- `20260824000000_organizations_rls`: tenant tables, indexes, last-owner
  trigger, RLS helpers/policies and runtime grants.
- `20260824103000_fix_organization_bootstrap_policy`: splits first-organization
  insert from scoped organization update after real RLS tests exposed the
  bootstrap `RETURNING` path.
- `20260824104000_relax_rls_setting_helpers`: keeps transaction settings
  null/empty-safe for text IDs instead of casting/regexing them.
- `20260824110000_harden_invitation_rls`: restores strict UUID-shaped context
  parsing and splits invitation organization access from token acceptance
  select access with expiry and invitee-email predicates.

`TenantTransactionService` sets `acres.account_id`,
`acres.organization_id` and `acres.invitation_token_hash` with tagged raw SQL
inside interactive transactions. `Organization`, `Membership`, `Invitation`
and `AuditEvent` have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL
SECURITY`. `AccountToken` is identity-scoped and has no organization RLS.

### Environment

New required server variables:

```text
TENANCY_ENABLED=false
INVITATION_TTL_HOURS=24
ACCOUNT_TOKEN_TTL_MINUTES=30
```

The TTL values in `.env.example` are local development examples, not launch
retention policy. Production must set them deliberately before enabling
tenancy.

### Verification evidence

Executed locally on 2026-08-24:

```text
npm run prisma:migrate:deploy --workspace=@acres/server
All migrations have been successfully applied.

npm run prisma:migrate:status --workspace=@acres/server
Database schema is up to date!

PGHOST=localhost PGPASSWORD=... scripts/db/harden-runtime-privileges.sh
REVOKE
REVOKE
GRANT
DO
REVOKE
REVOKE
GRANT
DO

npm run test --workspace=@acres/server -- --runInBand
Test Suites: 2 passed, 2 total
Tests: 5 passed, 5 total

npm run test:server
Test Suites: 3 passed, 3 total
Tests: 54 passed, 54 total
```

Catalog inspection on `acres_test` showed `acres_app`, `acres_migrator` and
`acres_test` are not superusers and do not bypass RLS; tenant tables are owned
by `acres_migrator`; `Organization`, `Membership`, `Invitation` and
`AuditEvent` have RLS enabled and forced; `Membership_last_owner_guard` exists;
the live invitation/account-token partial indexes exist; `acres_test` has
`INSERT`, `SELECT` and test-only `TRUNCATE` on `AuditEvent`, with no update or
delete privilege.

---

## 15. Versioned REST, GraphQL and checked contracts

Implemented by `prompts/23-versioned-rest-graphql-contracts.md`.

### REST versioning and request IDs

All product REST controllers now use Nest URI versioning under the global
`api` prefix, so the canonical route shape is `/api/v1/<resource>`.
`/health` and `/health/ready` are `VERSION_NEUTRAL`; `/graphql` is also
unversioned and is not served at `/api/v1/graphql`. Old unversioned product
paths are removed, not redirected, and E2E tests cover representative 404s.

`server/src/common/request-context.ts` assigns or sanitizes `x-request-id` for
every request, exposes it on the response and includes it in REST error
envelopes. The CORS allow/expose list includes request, organization and
idempotency headers.

### OpenAPI, SDL and CI drift guard

The committed generated artifacts are:

- `docs/api/openapi.json`
- `docs/api/schema.graphql`
- `docs/api/contracts.md`

`npm run contracts:generate` boots the compiled Nest app without listening,
extracts Swagger and `GraphQLSchemaHost`, then writes deterministic JSON/SDL
and the human route/resolver matrix. `npm run contracts:check` generates to a
temporary directory and fails if any artifact drifts. `.github/workflows/ci.yml`
runs the contract check after build and before database setup.

### GraphQL read surface

`/graphql` accepts POST only; `GET /graphql` returns a sanitized
`METHOD_NOT_ALLOWED` GraphQL error with `x-request-id`. GraphiQL and Playground
are disabled; introspection is disabled in production. The schema is read-only:
there is no mutation or subscription root in Phase 4.

GraphQL context resolves the session cookie and the selected
`x-organization-id`/`x-acres-organization-id` membership before service access.
Resolvers call the same application services and organization permission map as
REST; they do not call REST or Prisma directly. Connection resolvers validate
`first`/`after` before service calls and pass `take: first + 1` into the data
service, so GraphQL pagination caps database rows instead of slicing an
unbounded in-memory array. A request-scoped DataLoader batches `region(slug)`
through one set-based lookup per request batch and preserves per-key
missing-region errors. Current queries are listed in `docs/api/contracts.md`.

GraphQL abuse controls are split between the HTTP parser and
`server/src/graphql/graphql-limits.ts`: the configured byte limit is enforced
before GraphQL parsing/context work, production requires `operationName`, only
one operation is accepted, and aliases, depth, literal-or-variable `first`
nodes and list-aware field cost are counted through inline and named fragments.
`graphql-query-complexity` remains as a schema-aware cost backstop. Resolver
service calls are wrapped by the configured `GRAPHQL_TIMEOUT_MS` execution
timeout, and GraphQL database reads also set transaction-local PostgreSQL
`statement_timeout` so long-running session, membership, tenant and global region
queries are cancelled by the database. Errors are sanitized to
`extensions.code`/`extensions.requestId`; unexpected GraphQL exceptions are
logged server-side with bounded request metadata.

### Idempotency

`IdempotencyRecord` stores key digest, request hash, account, optional
organization, operation, state, recorded response body/status and expiry. The
SQL migration creates RLS policies and a null-safe unique key for
account/org/operation/key. The follow-up
`20260824121000_idempotency_expiry_cleanup` migration adds scoped delete access
for expired records so replay keys can be reused after their TTL. The following
duplicate-producing commands require `Idempotency-Key`:

- `POST /api/v1/organizations`
- `POST /api/v1/organizations/:organizationId/invitations`
- `POST /api/v1/organizations/:organizationId/ownership-transfers`
- `POST /api/v1/invitations/accept`

Same key/same body replays the stored success body while the record is live.
Same key/different body returns `IDEMPOTENCY_CONFLICT`. Expired records in the
same account/org/operation/key scope are deleted before reservation so the key
can be reused after `IDEMPOTENCY_TTL_HOURS`. Login, register, logout, CSRF,
contact and pure reads deliberately remain outside generic idempotency.

### Environment

New required variables:

```text
GRAPHQL_MAX_BYTES=12000
GRAPHQL_MAX_DEPTH=8
GRAPHQL_MAX_ALIASES=12
GRAPHQL_MAX_COST=250
GRAPHQL_MAX_FIRST=50
GRAPHQL_MAX_NODES=250
GRAPHQL_TIMEOUT_MS=5000
IDEMPOTENCY_TTL_HOURS=24
```

`GRAPHQL_TIMEOUT_MS` is enforced both at the resolver promise boundary and, for
GraphQL database reads, as a transaction-local PostgreSQL `statement_timeout`.
REST calls do not opt into that timeout unless they pass the same optional
transaction setting.

### Verification evidence

Executed locally on 2026-08-24:

```text
DATABASE_URL=... DATABASE_MIGRATION_URL=... npm run prisma:migrate:deploy --workspace=@acres/server
Applying migration `20260824120000_transport_contracts`
All migrations have been successfully applied.

npm run test:server
Test Suites: 3 passed, 3 total
Tests:       68 passed, 68 total

npm run lint
> @acres/server@0.1.0 lint
> eslint "{src,test}/**/*.ts"

npm run typecheck
> @acres/server@0.1.0 typecheck
> prisma generate && tsc -p tsconfig.json --noEmit

npm run contracts:check
> @acres/server@0.1.0 contracts:check
> prisma generate && nest build && node dist/contracts/generate-contracts.js --check

npm run build:server
> @acres/server@0.1.0 build
> prisma generate && nest build
```

The root `npm run build` still fails in the unchanged client workspace with the
previously recorded Next/Turbopack port-binding panic:

```text
Failed to write app endpoint /page
- [project]/client/app/globals.css [app-client] (css)
- creating new process
- binding to a port
- Operation not permitted (os error 1)
```

Re-running the root build as a standalone escalated command produced the same
client-only failure before the server workspace ran; `npm run build:server`
passes for the changed workspace.

---

## 15. Storage, queue, worker, and upload foundation

Implemented from `prompts/27-storage-queues-secure-uploads.md` on 2026-08-24.
This is the Phase 6 foundation only: it adds object metadata, upload commands,
an outbox, a queue adapter, a scanner adapter, and a separately runnable worker.
It does **not** parse CSV/XLSX/GeoJSON into product datasets.

New package versions were verified from npm metadata before install:

| package                         | version     | license    | role                              |
| ------------------------------- | ----------- | ---------- | --------------------------------- |
| `bullmq`                        | `^6.2.0`    | MIT        | queue transport over Redis/Valkey |
| `ioredis`                       | `^6.0.0`    | MIT        | BullMQ Redis client               |
| `@aws-sdk/client-s3`            | `^3.1116.0` | Apache-2.0 | S3-compatible Garage adapter      |
| `@aws-sdk/s3-request-presigner` | `^3.1116.0` | Apache-2.0 | signed PUT/GET URLs               |

`clamscan@2.4.0` was reviewed but not installed; the scanner adapter speaks the
documented ClamAV `clamd` TCP protocol directly, which avoids adding a
third-party wrapper for a small `PING`/`INSTREAM` surface.

Local Compose now includes `postgres`, `valkey`, `garage`, and `clamav`.
Valkey uses password auth, append-only persistence, and `noeviction`. Garage
uses disposable local volumes and `infra/garage/garage.toml`; production Garage
storage still inherits the encrypted-volume/key-separation contract from the
architecture docs. ClamAV exposes TCP 3310 for local development only.

New scripts:

```text
npm run deps:up
npm run garage:setup
npm run start:worker
npm run start:worker --workspace=@acres/server
npm run start:worker:dev --workspace=@acres/server
```

New validated environment groups cover Valkey/BullMQ, Garage/S3, ClamAV,
temporary upload limits, stale-upload cleanup, outbox claiming, retry limits,
and signed URL TTLs. Development defaults are intentionally temporary safety
limits, not product upload policy. Production rejects placeholder storage/queue
secrets.

New schema state:

- `StoredObject` stores organization-owned opaque object keys, bucket, media
  metadata, byte count, checksum, lifecycle state, and timestamps.
- `Upload` stores organization, actor, declared/completed metadata, scan state,
  progress, cancellation/expiry/acceptance timestamps, and version.
- `OutboxEvent` stores transactional upload-completed events with lease,
  attempt, retry, and idempotent aggregate identity fields.
- `DurableJob`, `JobProgressEvent`, and `JobDeadLetter` record worker-visible
  job state, stage progress, and exhausted/poison work.

The migration is additive, enables and forces RLS on all new tenant-owned
tables, uses transaction-local `acres.organization_id`, and grants only the
runtime/test privileges needed for the current API and worker. Existing
`JobRun` and `/api/v1/jobs/runs` behavior remain unchanged.

New REST routes:

| method   | path                                 | auth                                                  | notes                                                                                     |
| -------- | ------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `POST`   | `/api/v1/uploads`                    | session + org + `uploads.create` + CSRF + idempotency | creates `Upload`/`StoredObject` rows and returns a short-lived signed PUT URL             |
| `POST`   | `/api/v1/uploads/:uploadId/complete` | session + org + `uploads.create` + CSRF + idempotency | verifies object metadata, marks completion, records progress, and appends an outbox event |
| `GET`    | `/api/v1/uploads/:uploadId`          | session + org + `uploads.read`                        | returns durable state/progress/failure details                                            |
| `DELETE` | `/api/v1/uploads/:uploadId`          | session + org + `uploads.create` + CSRF + idempotency | records cancellation                                                                      |
| `GET`    | `/api/v1/uploads/:uploadId/events`   | session + org + `uploads.read`                        | SSE stream backed by durable PostgreSQL status                                            |
| `GET`    | `/api/v1/uploads/:uploadId/download` | session + org + `uploads.read`                        | returns a short-lived signed attachment URL for accepted uploads                          |

Permission policy: owners/admins/analysts can create and manage uploads;
viewers can read upload status/downloads but cannot create or cancel uploads.

Worker behavior: `server/src/worker.ts` starts a Nest application context,
claims ready outbox rows on startup and on a non-overlapping interval, enqueues
deterministic BullMQ jobs only after PostgreSQL has a `DurableJob` row, re-reads
authoritative DB state, records progress, reads quarantined object bytes through
the storage port, scans before acceptance, writes succeeded/failed durable job
state, writes dead-letter rows for failed scans or worker exceptions, marks
cancelled work as cancelled instead of failed, rejects scanner/object failures
fail-closed, observes cancellation before final state, and drains on
`SIGTERM`/`SIGINT`. Outbox dispatch attempts that exhaust their configured
maximum are marked `dead_lettered` with visible `JobDeadLetter` evidence instead
of remaining stuck in `retrying`. Worker/outbox reads use a transaction-local
`acres.worker_access` context reflected in the new RLS policies; ordinary tenant
transactions clear it. Parser budgets are left for the ingestion phase.

Upload completion verifies object byte count, stored object media type when the
backend reports one, and SHA-256 of the actual object bytes before it records
completion or appends the outbox event. It reads the object outside the tenant
database transaction, then re-checks pending state in the final transaction
before updating the upload and outbox. The client-supplied checksum is not
trusted by itself.

API readiness now checks PostgreSQL and object storage, because upload routes
need both. Queue and scanner readiness remain worker-process dependencies.

`scripts/garage/setup-local.sh` is the local Garage setup path. It creates the
bucket, creates a Garage key, grants read/write bucket access, and prints the
`STORAGE_ACCESS_KEY_ID` plus a reminder to copy the one-time secret into
`server/.env`. The committed `.env.example` keeps placeholder values rather
than pretending to contain usable Garage credentials.

Verification on 2026-08-24:

```text
npm audit --json
metadata: 7 vulnerabilities total, 4 moderate and 3 high
```

The audit findings are the pre-existing Apollo/uuid and Prisma CLI findings
documented above; the new BullMQ/ioredis/AWS packages did not change the count.

```text
npm run build:shared
> @acres/shared@0.1.0 build
> tsc -p tsconfig.json

npm run lint
> @acres/client@0.1.0 lint
> eslint
> @acres/shared@0.1.0 lint
> eslint "src/**/*.ts"
> @acres/server@0.1.0 lint
> eslint "{src,test}/**/*.ts"

npm run typecheck
> @acres/shared@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit
> @acres/client@0.1.0 typecheck
> tsc --noEmit
> @acres/server@0.1.0 typecheck
> prisma generate && tsc -p tsconfig.json --noEmit

npm run build
✓ Compiled successfully in 4.1s
✓ Generated Prisma Client (7.9.1)

npm run test:server
Test Suites: 3 passed, 3 total
Tests:       70 passed, 70 total

npm run contracts:check
> prisma generate && nest build && node dist/contracts/generate-contracts.js --check

npm run prisma:validate --workspace=@acres/server
The schema at prisma/schema.prisma is valid 🚀

git diff --check
<no output>
```

Docker/Compose verification could not run in this execution environment:

```text
docker compose ps
/bin/bash: line 1: docker: command not found
```

That means the real Garage/Valkey/ClamAV integration, real migration apply from
empty DB, migration status, drift rebuild, and production-profile volume
inspection still require a machine with Docker available.

## 15. Phase 7A geography and ingestion foundation

Implemented from `prompts/28-geography-ingestion-foundation.md`; the detailed
record lives in [`ingestion.md`](ingestion.md).

New package dependencies:

| package           | version   | why                                                                                                     |
| ----------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| `csv-parse`       | `^7.0.2`  | MIT CSV parser with synchronous inspection API used for bounded source summaries                        |
| `read-excel-file` | `^9.3.10` | MIT XLSX reader used for deterministic first-sheet inspection without evaluating formula-looking values |

GeoJSON validation is implemented locally and bounded. The older LGPL validator
package considered during implementation was not added.

New schema/migration state:

- `Region` now supports adjacency-list hierarchy with a cycle guard; global
  `RegionSource`, `RegionCode`, `RegionAlias`, and SQL-owned PostGIS
  `RegionGeometry.geometry` support source provenance and boundaries.
- Tenant-owned `Dataset`, `ColumnMapping`, `IngestionRun`, `ValidationIssue`,
  `StagedSourceSummary`, and `DatasetVersion` tables are additive and forced
  through RLS using the existing organization/worker context pattern.
- Composite tenant foreign keys on `(organizationId, id)` prevent cross-org
  dataset/upload/mapping/run/version references, including worker-scoped writes.
- `DatasetVersion` publication is immutable for a dataset/upload/mapping tuple;
  Phase 8 now owns observations, metric definitions, aggregates, and lineage.

New REST routes are generated in [`api/contracts.md`](api/contracts.md):
dataset create/list/read/update, version list, mapping create, ingestion run
start/status/issues/cancel. All are `/api/v1`, session scoped, selected-org
scoped, and use centralized `datasets.*` / `ingestion.*` permissions.

Worker update: the existing worker process now dispatches queue payloads with
`ingestionRunId` to `IngestionProcessorService`. The BullMQ adapter is lazy, so
API boot and contract generation no longer open a Valkey connection until
enqueue/readiness is called.

Verification in this session:

```text
npm run prisma:validate --workspace=@acres/server
The schema at prisma/schema.prisma is valid 🚀

npm run typecheck --workspace=@acres/server
✔ Generated Prisma Client (7.9.1)

npm run test --workspace=@acres/server
Test Suites: 3 passed, 3 total
Tests: 9 passed, 9 total

npm run test:e2e --workspace=@acres/server -- api.e2e-spec.ts env-validation.e2e-spec.ts
Test Suites: 2 passed, 2 total
Tests: 58 passed, 58 total

npm run test:server
Test Suites: 3 passed, 3 total
Tests: 74 passed, 74 total

npm run contracts:generate
✔ Generated Prisma Client (7.9.1)
```

Earlier sandboxed database commands failed before escalation:

```text
docker compose ps
/bin/bash: line 1: docker: command not found

pg_isready -h localhost -p 5432
localhost:5432 - no response

npm run prisma:migrate:deploy --workspace=@acres/server
P1001: Can't reach database server at `localhost:5432`
```

The escalated local `acres_test` migration deploy then applied pending
migrations. Post-review tenant-key hardening was recorded as
`20260824194500_ingestion_tenant_composite_keys`, applied through Prisma, and
`prisma migrate status` reported the database up to date. Full `test:server`
passed after that. Migration apply-from-zero outside this incrementally upgraded
local database, PostGIS geometry validity proof, and real Garage/Valkey/ClamAV
worker run remain required on a dependency-capable host.

---

## 19. Analytics foundation

Implemented by `prompts/29-metrics-deterministic-analytics.md`; full details
live in [`analytics.md`](analytics.md).

New schema/migration state:

- `MetricDefinition`, `MetricObservation`, `ObservationQuality`,
  `MetricAggregate`, and `MetricAggregateLineage` are organization-scoped,
  forced through RLS, and protected by composite tenant foreign keys.
- Observation and aggregate rows enforce exactly one typed numeric/text/boolean
  value in PostgreSQL.
- Aggregate snapshots are keyed by dataset version as well as metric, region,
  period, dimension hash, aggregate type, and calculation version; invalid
  observations remain visible but are excluded from aggregate math and lineage.
- Read-path indexes cover metric/region/period, dataset-version, dimension-hash,
  aggregate lookup, evidence reverse lookup, and tenant-negative paths.

Ingestion now accepts explicit mapped `metrics` in `ColumnMapping.mapping`.
Successful publication writes observations, visible quality rows, deterministic
aggregates, and lineage inside the same tenant-scoped publication transaction.
Retrying the same dataset/upload/mapping publication upserts by deterministic
keys instead of duplicating analytics rows.
Metric publication parses numeric strings directly into `Prisma.Decimal`,
rejects values outside the stored `numeric(26, 6)` shape, accepts only
deterministic year/date/UTC datetime periods, and reports malformed optional
period or dimension mapping fields as validation issues.
Analytics REST responses serialize numeric values as decimal strings so values
larger than JavaScript's safe integer range are not rounded on read.

New REST routes are generated in [`api/contracts.md`](api/contracts.md):
metric definition list/read, observation list, aggregate list, and aggregate
evidence. All are `/api/v1`, session scoped, selected-org scoped, and use the
centralized `analytics.read` permission.

Verification in this session:

```text
npm run prisma:validate --workspace=@acres/server
The schema at prisma/schema.prisma is valid 🚀

DATABASE_URL=postgresql://acres_test:...@localhost:5432/acres_test?schema=public \
DATABASE_MIGRATION_URL=postgresql://acres_migrator:...@localhost:5432/acres_test?schema=public \
npm run prisma:migrate:deploy --workspace=@acres/server
Applying migration `20260824205500_widen_analytics_numeric_values`
All migrations have been successfully applied.

npm run test --workspace=@acres/server
Test Suites: 5 passed, 5 total
Tests: 23 passed, 23 total

npm run test:e2e --workspace=@acres/server -- api.e2e-spec.ts database.e2e-spec.ts env-validation.e2e-spec.ts
Test Suites: 3 passed, 3 total
Tests: 77 passed, 77 total

npm run contracts:check
✔ Generated Prisma Client (7.9.1)

npm run lint
@acres/server@0.1.0 lint

npm run typecheck
✔ Generated Prisma Client (7.9.1)

npm run build
✔ Generated Prisma Client (7.9.1)

npm run test:server
Test Suites: 3 passed, 3 total
Tests: 77 passed, 77 total
```

## 20. Dashboards and optimized GraphQL

Implemented by `prompts/30-dashboards-optimized-graphql.md`; full details live
in [`dashboards.md`](dashboards.md).

New backend state:

- `DashboardView` stores organization-scoped saved filters and presentation
  intent, is forced through RLS, and uses composite tenant foreign keys to
  `Organization` and `Account`.
- `dashboards.manage` is centralized in the role permission map. Owners,
  admins, and analysts can manage saved dashboard views; viewers can read
  analytics and saved views but cannot write them.
- `/api/v1/dashboard-views` exposes list/read/create/update/soft-archive routes
  with selected-organization scoping. Creates require CSRF and an
  `Idempotency-Key`.
- GraphQL adds read-only `dashboardSummary`, returning active metric
  definitions, aggregate read models, and saved views through
  `DashboardsService`.
- The authenticated Next app reads dashboard summaries through server-side
  GraphQL and forwards the CSRF token/cookie pair required by the global POST
  defence.

Verification in this session:

```text
npm run lint
@acres/client@0.1.0 lint
@acres/shared@0.1.0 lint
@acres/server@0.1.0 lint

npm run typecheck
✔ Generated Prisma Client (7.9.1)

npm run build
├ ƒ /app/dashboards
├ ƒ /app/dashboards/[viewId]
✔ Generated Prisma Client (7.9.1)

npm run test:server
Test Suites: 3 passed, 3 total
Tests: 81 passed, 81 total

npm run test:client:e2e
12 passed (12.8s)

npm run contracts:check
✔ Generated Prisma Client (7.9.1)
```
