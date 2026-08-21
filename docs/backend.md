# Backend — the NestJS server, the shared contracts, and the data layer

The build record for step 8 (`AGENTS.md` §8.2), implemented from
`prompts/10-nestjs-server.md`. It covers `server/`, `packages/shared/`, the
root workspace wiring, and what is deliberately not built yet.

**Nothing visual changed.** `client/` was touched in exactly one place — a
`typecheck` script — and `client/app/`, `client/components/`, `client/lib/`
and `client/public/` are byte-identical to `5d9899a`.

---

## 1. Resolved versions

Every version below was read from the registry or from `node_modules/` in the
implementing session (2026-08-21), never recalled. Toolchain: **Node v26.7.0**,
**npm 12.0.2**.

| package | version | why |
| --- | --- | --- |
| `@nestjs/common` · `@nestjs/core` · `@nestjs/platform-express` | `^11.2.1` | the framework, on its **default Express platform** — the security guidance this step follows is the Express guidance, and swapping to Fastify would invalidate it |
| `@nestjs/config` | `^4.0.4` | environment loading, with a `validate` function that fails the boot |
| `@nestjs/schedule` | `^6.1.3` | in-process cron; see §7 for the constraint it carries |
| `@prisma/client` · `prisma` | `^7.9.1` | the data layer |
| `@prisma/adapter-pg` | `^7.9.1` | **required.** Prisma 7's `PrismaClientOptions` accepts either a driver adapter or an Accelerate URL; there is no plain connection-string form any more. Read from `internal/prismaNamespace.ts` in the generated client |
| `class-validator` `^0.15.1` · `class-transformer` `^0.5.1` | request validation and DTO transformation |
| `helmet` | `^8.3.0` | response security headers |
| `cookie-parser` | `^1.4.7` | the session and CSRF cookies are read by middleware, so they must be parsed first |
| `csrf-csrf` | `^4.0.3` | double-submit CSRF (§5) |
| `bcryptjs` | `^3.0.3` | password hashing. Pure JavaScript and **ships no install script**, which matters here: this machine's npm blocks unapproved install scripts, so a native hashing binding would not have built |
| `jest` `^30` · `ts-jest` `^29.4` · `supertest` `^7` | from the verified Nest scaffold |

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

| script | what it does |
| --- | --- |
| `dev` | unchanged — the Next.js dev server |
| `dev:client` / `dev:server` | one workspace each; the API watches on 3001 |
| `build` | **shared → client → server.** Shared is first because the server imports its built output |
| `build:shared` / `build:client` / `build:server` | one workspace each |
| `start` | unchanged — serves the built client |
| `start:server` | `node dist/main` in `server/` |
| `lint` | client, then shared, then server |
| `typecheck` | **new.** Builds `@acres/shared`, then `tsc --noEmit` in all three workspaces |
| `test:server` | the API's e2e suite |

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

`client/` does **not** depend on `@acres/shared` yet. Wiring the client to the
API is a later prompt, and an unused dependency in the client's tree buys
nothing today.

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

| method | path | auth | notes |
| --- | --- | --- | --- |
| `GET` | `/health` | public | status, service name, npm version, uptime. **Takes no database dependency** — a load balancer must not be told the service is down when it is the database that is unreachable |
| `GET` | `/auth/csrf` | public | **not in the original route table.** A double-submit defence is unusable without a way to read the token; returns `{ csrfToken, headerName: 'x-csrf-token' }` and sets the paired cookie. Uses the library's defaults: re-issuing re-validates any existing cookie against the **current** session identifier and mints a fresh token when that fails, which is what has to happen after login rotates the session cookie |
| `POST` | `/auth/register` | public + CSRF | 201, sets the session cookie, returns `SessionProfile` |
| `POST` | `/auth/login` | public + CSRF | 200, sets the session cookie, returns `SessionProfile` |
| `POST` | `/auth/logout` | session + CSRF | revokes the session server-side, clears the cookie |
| `GET` | `/auth/session` | optional session | `SessionProfile`, or the shared `ANONYMOUS_SESSION` |
| `GET` | `/account` | session | `AccountProfile` |
| `GET` | `/regions` | public | region summaries with their metrics, one query |
| `GET` | `/regions/:slug` | public | one summary, or 404 `NOT_FOUND` |
| `POST` | `/forms/contact` | public + CSRF | 201, stores the submission, returns `{ id, receivedAt }` only — echoing the message back would make the endpoint a reflector |
| `GET` | `/jobs/runs` | session | the 50 most recent runs |

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
{ "ok": false, "error": { "code": "INVALID_CREDENTIALS", "message": "Those credentials did not work." } }
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
upgrade that forwards some *other* error cannot have it misreported as a CSRF
failure:

```text
POST /forms/contact (no token)  →  403
{"ok":false,"error":{"code":"CSRF_INVALID","message":"CSRF token missing or invalid."}}
```

**What is not covered:** `GET`, `HEAD` and `OPTIONS` are exempt, which is
correct only because no `GET` route mutates anything — a future one must not.
CORS is restricted to `CLIENT_ORIGIN` with credentials enabled, so a browser
will not hand a cross-origin script the response, but CORS is not a CSRF
defence and is not counted as one here. **There is no rate limiting**, and the gap is an **availability** problem before
it is a brute-force one: every unauthenticated `POST /auth/login` runs a cost-12
bcrypt comparison *even when the account does not exist* (that is the timing
defence in §4), and `bcryptjs` is pure JavaScript, so it competes with the event
loop. Enough concurrent login attempts saturate the process and take `/health`
and every other route down with it. `RATE_LIMITED` exists in the error union for
when `@nestjs/throttler` lands on `/auth/*` and `/forms/contact`; nothing
enforces it today.

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

| variable | required | default | notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | **yes** | — | placeholder in `.env.example`; no database is provisioned |
| `CLIENT_ORIGIN` | **yes** | — | CORS origin, credentials enabled |
| `SESSION_SECRET` | **yes** | — | CSRF HMAC secret. Boot **fails** in production if it is still the `change-me…` placeholder; warns below 32 characters |
| `PORT` | no | `3001` | never 3000, so it cannot collide with the client |
| `SESSION_COOKIE_NAME` | no | `acres_session` | |
| `SESSION_TTL_DAYS` | no | `30` | positive integer |
| `CSRF_COOKIE_NAME` | no | `acres_csrf` | |
| `SCHEDULER_ENABLED` | no | `true` | see §7 |
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |

`server/.env.example` documents all of them. Copy it to `server/.env`; that
file is gitignored.

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

### Migrations: deferred, deliberately

**`schema.prisma` is committed and `prisma/migrations/` is not.** No database
was available to generate a first migration against, and hand-writing migration
SQL would be fabricating a file Prisma is supposed to derive. The first
migration is generated with `npm run prisma:migrate --workspace=@acres/server`
against a real Postgres, by whoever provisions one.

`prisma validate` and `prisma generate` both run today and both pass; neither
needs a server.

**No seed data.** Fixtures that looked like regional intelligence would be read
as real.

---

## 9. Tests

`server/test/api.e2e-spec.ts`, run with `npm run test:server`. **18 tests, all
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

`npm test --workspace=@acres/server` (unit, `rootDir: src`) runs with
`--passWithNoTests`: **there are no unit specs yet**, and the script says so
rather than appearing to pass a suite that does not exist.

---

## 10. Deployment: what a host must provide

**Decision: the API is a long-lived Node container service, not a Vercel
serverless function.** It holds server-side sessions and runs in-process
scheduled jobs; neither survives a function that is frozen between requests.

**No provider manifest is created in this step** — no Dockerfile, no CI
workflow, no Terraform. `AGENTS.md` §8.2 defers host selection, and the
production start contract is host-portable:

```bash
npm run build          # or: npm run build:shared && npm run build:server
npm run start:server   # node dist/main
```

Any host must provide:

- a **long-lived Node process** (Node 22+; developed on v26.7.0);
- **persistent outbound network access** to Postgres;
- **environment variable injection** for §6's variables;
- a **health-checkable HTTP port** — `GET /health`, which deliberately does not
  depend on the database. Start it through the package script if the reported
  `version` matters; a bare `node dist/main` entrypoint reports `null` (§6);
- **exactly one instance with `SCHEDULER_ENABLED=true`**, or a provider
  scheduler that replaces in-process cron (§7).

**One condition on all of that: `/auth/*` must not be exposed publicly in this
state.** There is no rate limiting, and §5 explains why that is an availability
risk and not only a brute-force one. Put the rate limiter in front of it —
`@nestjs/throttler` or the host's own — before the API takes public traffic.

Next.js on Vercel is unchanged and unaffected.

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

---

## 12. Deferred, and why

| deferred | why |
| --- | --- |
| the first Prisma migration | no database was available; §8 |
| any seed data | it would read as real regional intelligence |
| a regional-data ingestion provider | none chosen; §7 |
| `@acres/shared` in `client/` | nothing consumes it yet |
| any landing-page form UI | the endpoint exists; the form is a later prompt |
| login / register screens | same |
| rate limiting on `/auth/*` and `/forms/contact` | named as a real gap in §5 — **availability**, not only brute force. The next backend prompt should open with `@nestjs/throttler` |
| role-based authorization | `/jobs/runs` is session-gated only; §3 |
| email delivery | which is why registration returns a generic failure; §4 |
| Dockerfile, CI, Terraform, provider manifests | §10; `AGENTS.md` §8.2 defers them |
| OAuth / social login, analytics, billing, CMS, admin | out of scope for step 8 |
