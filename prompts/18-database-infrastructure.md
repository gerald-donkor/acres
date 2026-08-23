# 18 — database infrastructure: Postgres/PostGIS, roles, and the first migration

## Scope, and why it is next

`docs/build-plan.md` phase 1 (architecture foundation) is committed
(`c87f403`, `f02735e`). Phase 2 — "infrastructure and first database
migration" — is the next dependency-safe unit: every later phase (3
organizations/RLS, 4 REST/GraphQL, …) depends on a real database existing.
This prompt implements phase 2's core outcome: a documented one-command local
Postgres/PostGIS boot, three separated credentials (migration/owner,
non-owner runtime, non-owner test), a real generated-and-reviewed Prisma 7
migration, a distinct liveness/readiness split, and real-database integration
tests replacing the double where `docs/build-plan.md` phase 2 requires it
("Database assertions may not use the Prisma test double").

**Deliberately not phase 2's full scope — see Non-goals.** Two phase-2 items
are cut to a follow-up prompt because they are independently gated and would
roughly double this prompt's surface for no dependency benefit: the
conditional Node 22 → 24 LTS move, and RLS/organizations (phase 3, unaffected
by this prompt). The production PostgreSQL volume-encryption/key-recovery
**contract** — phase 2's own wording — is written into `docs/backend.md` as a
target-state paragraph, since no production host exists to inspect (that
inspection is phase 12's).

## The environment constraint this prompt was written under, and how it was resolved

This sandbox has **no Docker** (`which docker` → nothing, confirmed again
this session, matching `docs/backend.md` §10.1's prior finding) and **no
passwordless sudo** (`sudo -n true` → "sudo: interactive authentication is
required"). Phase 2's core deliverable — a Prisma migration Prisma itself
generates against a real Postgres, never hand-written (`docs/backend.md` §8:
"hand-writing migration SQL would be fabricating a file Prisma is supposed to
derive") — cannot be produced without one. This was raised with the user
directly rather than silently worked around or deferred. **The user chose:
install PostgreSQL natively via `apt` in this sandbox**, with the user
running the one `sudo` command themselves (via `! <command>`, since this
session cannot supply a password), so the real migration is generated and the
real integration suite runs natively here. `docker-compose.yml` is still
written as the documented one-command path other hosts and CI-outside-this-
workflow use; **this sandbox does not use it** to generate the migration.

**Resolved this session, not recalled:**

- `apt-cache policy postgresql-18` → candidate `18.6-0ubuntu0.26.04.1`
  (fallback `18.3-1`), Ubuntu 26.04 LTS "Resolute Raccoon"
  (`/etc/os-release`).
- `apt-cache search postgis` → `postgresql-18-postgis-3` (candidate
  `3.6.2+dfsg-1`) is the matching PostGIS package for that server version.
- Docker Hub `postgis/postgis` tag `18-3.6` (and `18-3.6-alpine`) exists and
  pairs PostgreSQL 18 with PostGIS 3.6 — the closest published Compose image
  to the native version this sandbox installs, fetched live from
  `hub.docker.com/r/postgis/postgis/tags` this session.
- GitHub Actions' `services:` job block syntax (image/env/ports/options
  health-check keys, `localhost` as the runner-side host) fetched live from
  GitHub's own docs this session, not recalled.
- `@prisma/config`'s `Datasource` type (`node_modules/@prisma/config/dist/index.d.ts:26-29`)
  is `{ url?: string; shadowDatabaseUrl?: string }` — no separate
  per-migration URL field, confirming `prisma.config.ts`'s single
  `datasource.url` is what both `prisma migrate` and `prisma validate` use,
  independent of the running app's `PrismaService` (which builds its own
  adapter from `AcresConfigService.databaseUrl` — already true today, so
  splitting the CLI's URL from the app's is a net-new env var, not a
  refactor).
- `@types/pg`'s `PoolConfig`/`ClientConfig` (`node_modules/@types/pg/index.d.ts:18,31,49`)
  confirms `connectionString` and `connectionTimeoutMillis` are real
  `pg.Pool` constructor fields, and `PrismaPg`'s constructor
  (`node_modules/@prisma/adapter-pg/dist/index.d.ts:42`) accepts
  `pg.Pool | pg.PoolConfig | string` — so `PrismaService` can pass a bounded
  connection timeout without a new dependency.

## Roles and databases

Three roles, matching phase 2's "separate migration/owner, non-owner
runtime, and test roles" exactly:

| role | privilege | used by |
| --- | --- | --- |
| `acres_migrator` | `LOGIN`, `CREATEDB` (needed for `prisma migrate dev`'s shadow database), owns both databases below | `prisma migrate dev` / `deploy` / `status` only — never the running API |
| `acres_app` | `LOGIN` only; `CONNECT` on `acres`, `USAGE` on `public`, DML only (`SELECT`/`INSERT`/`UPDATE`/`DELETE`) via default privileges — no DDL | the running Nest API (`DATABASE_URL`) |
| `acres_test` | same shape as `acres_app`, scoped to a **separate** `acres_test` database | the new real-database integration suite |

Two databases — `acres` (dev) and `acres_test` (integration tests) — so a
test run can truncate freely without ever touching development data, and a
leaked test credential cannot reach `acres`. `acres_migrator` owns both, and
`ALTER DEFAULT PRIVILEGES FOR ROLE acres_migrator ...` grants DML on every
*future* table each role's owning migration creates, so a later migration
never needs a manual re-grant step.

All three passwords are fixed, clearly-disposable local-dev values —
`acres_migrator_dev_password` / `acres_app_dev_password` /
`acres_test_dev_password` — the same pattern `server/.env.example` already
uses for `SESSION_SECRET=change-me-32-bytes-minimum-in-real-environments`.
They are used identically in the native sandbox bootstrap, `docker-compose.yml`'s
default `.env`, and CI's inline env (CI's Postgres is as disposable as the
existing `docker` job's throwaway `SESSION_SECRET`). A real deployment
overrides all three — phase 12's concern, not this one's.

## Files to create

### 1. `scripts/db/bootstrap-roles.sh` (new, executable — `chmod +x` after writing)

One script, two callers: `docker-entrypoint-initdb.d` (Compose, first boot
only) and a direct native invocation in this sandbox. It is idempotent
(guards every `CREATE ROLE` on `pg_roles`, every `CREATE DATABASE` on
`pg_database` via `\gexec`) so re-running it is safe. Connects via psql's
standard `PG*` environment variables — no `--host` is hard-coded, so the
same script works over a Compose-internal Unix socket and over `localhost`
TCP in the native path.

**Do not use `psql -v name=value` substitution inside the `DO $$ ... $$`
block** — whether psql's colon-substitution reaches text inside a
dollar-quoted body was not verified this session, and getting it wrong would
silently ship broken SQL. Use plain **unquoted bash heredocs** instead, which
is the pattern the official `postgres` Docker image's own init-script
examples use: bash expands `$ACRES_MIGRATOR_PASSWORD` etc. before `psql` ever
sees the text. Because the heredoc is unquoted, bash's own `$$` (current PID)
must be escaped as `\$\$` everywhere the SQL needs a literal dollar-quote —
this is the one easy way to break this script silently, so read it back after
writing it and confirm every `$$` inside the `DO` block reads `\$\$`. Do not
indent heredoc bodies (avoids the `<<-` tab-only-stripping footgun); use
plain `<<EOSQL` / `<<'EOSQL'`, flush left.

```sh
#!/usr/bin/env bash
# Idempotent role/database bootstrap for local Postgres/PostGIS. Safe to
# re-run — every statement guards on existence first. See docs/backend.md.
#
# Required env: ACRES_MIGRATOR_PASSWORD, ACRES_APP_PASSWORD, ACRES_TEST_PASSWORD
# Connects as a superuser via psql's normal PG* variables (PGHOST, PGPORT,
# PGPASSWORD, ...) or, for docker-entrypoint-initdb.d, the local trust socket
# the postgres image already sets up. POSTGRES_USER/POSTGRES_DB name that
# superuser and its bootstrap database; both fall back to "postgres".
set -euo pipefail

: "${ACRES_MIGRATOR_PASSWORD:?ACRES_MIGRATOR_PASSWORD is required}"
: "${ACRES_APP_PASSWORD:?ACRES_APP_PASSWORD is required}"
: "${ACRES_TEST_PASSWORD:?ACRES_TEST_PASSWORD is required}"

PSQL_SUPERUSER="${POSTGRES_USER:-postgres}"
PSQL_MAINTENANCE_DB="${POSTGRES_DB:-postgres}"

psql -v ON_ERROR_STOP=1 --username "$PSQL_SUPERUSER" --dbname "$PSQL_MAINTENANCE_DB" <<EOSQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'acres_migrator') THEN
    CREATE ROLE acres_migrator LOGIN PASSWORD '$ACRES_MIGRATOR_PASSWORD' CREATEDB;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'acres_app') THEN
    CREATE ROLE acres_app LOGIN PASSWORD '$ACRES_APP_PASSWORD';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'acres_test') THEN
    CREATE ROLE acres_test LOGIN PASSWORD '$ACRES_TEST_PASSWORD';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE acres OWNER acres_migrator'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'acres')\gexec

SELECT 'CREATE DATABASE acres_test OWNER acres_migrator'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'acres_test')\gexec

GRANT CONNECT ON DATABASE acres TO acres_app;
GRANT CONNECT ON DATABASE acres_test TO acres_test;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$PSQL_SUPERUSER" --dbname acres <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS postgis;
GRANT USAGE ON SCHEMA public TO acres_app;
ALTER DEFAULT PRIVILEGES FOR ROLE acres_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO acres_app;
ALTER DEFAULT PRIVILEGES FOR ROLE acres_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO acres_app;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$PSQL_SUPERUSER" --dbname acres_test <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS postgis;
GRANT USAGE ON SCHEMA public TO acres_test;
ALTER DEFAULT PRIVILEGES FOR ROLE acres_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO acres_test;
ALTER DEFAULT PRIVILEGES FOR ROLE acres_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO acres_test;
EOSQL
```

### 2. `docker-compose.yml` (new, repo root)

Single service — phase 2's non-goals explicitly exclude Valkey and Garage,
and the outcome line says "activating no unused service". No `version:` key
(obsolete in the current Compose spec; a modern `docker compose` ignores or
warns on it).

```yaml
services:
  postgres:
    image: postgis/postgis:18-3.6
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_SUPERUSER_PASSWORD:?set POSTGRES_SUPERUSER_PASSWORD in .env}
      POSTGRES_DB: postgres
      ACRES_MIGRATOR_PASSWORD: ${ACRES_MIGRATOR_PASSWORD:?set ACRES_MIGRATOR_PASSWORD in .env}
      ACRES_APP_PASSWORD: ${ACRES_APP_PASSWORD:?set ACRES_APP_PASSWORD in .env}
      ACRES_TEST_PASSWORD: ${ACRES_TEST_PASSWORD:?set ACRES_TEST_PASSWORD in .env}
    ports:
      - '5432:5432'
    volumes:
      - acres_pgdata:/var/lib/postgresql/data
      - ./scripts/db/bootstrap-roles.sh:/docker-entrypoint-initdb.d/001-bootstrap-roles.sh:ro
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  # Disposable local-development volume, intentionally unencrypted at rest —
  # docs/backend.md records the target production encryption/key-recovery
  # contract this volume does not need to satisfy.
  acres_pgdata:
```

### 3. `.env.example` (new, repo root)

```dotenv
# Consumed by docker-compose.yml. Copy to .env; these are disposable local-dev
# values, matching server/.env.example's ACRES_APP_PASSWORD /
# ACRES_MIGRATOR_PASSWORD / ACRES_TEST_PASSWORD — keep them in sync with
# whatever server/.env actually uses, or the API cannot authenticate.

# Superuser bootstrap password for the local Postgres/PostGIS container.
POSTGRES_SUPERUSER_PASSWORD=acres_superuser_dev_password

# Passwords for the three roles scripts/db/bootstrap-roles.sh creates on the
# container's first boot. See docs/backend.md for what each role can do.
ACRES_MIGRATOR_PASSWORD=acres_migrator_dev_password
ACRES_APP_PASSWORD=acres_app_dev_password
ACRES_TEST_PASSWORD=acres_test_dev_password
```

Add to root `.gitignore`, immediately after the existing `!server/.env.example`
line, following that line's exact comment style: `!/.env.example` (anchored —
the existing two entries are path-anchored to their own directories, so this
one is anchored to the root to avoid unintentionally un-ignoring a nested
`.env.example` this repo does not have).

### 4. `server/test/helpers/real-db-test-app.ts` (new)

Builds a Nest testing module **without** overriding `PrismaService` (unlike
`test/helpers/test-app.ts`, which exists precisely to avoid a database — this
helper is the opposite: it requires one). Exports `createRealDbTestApp()`
returning `{ app, prisma }`, and `truncateAll(prisma)` running one
`TRUNCATE TABLE "Session","Account","RegionalMetric","InsightReport","Region","ContactSubmission","JobRun" RESTART IDENTITY CASCADE;`
for test isolation between cases. Follow `test-app.ts`'s existing
try/finally-on-partial-init shape.

### 5. `server/test/database.e2e-spec.ts` (new)

Real-database integration suite. `beforeAll` asserts `DATABASE_URL` (from
`test/setup-env.ts`) resolves before running anything, so a missing database
fails with one clear error instead of every test timing out individually.
`beforeEach`/`afterAll` call `truncateAll`. Covers exactly the phase-2 test
bullet's named cases, each traceable to a real code path already documented
in `docs/backend.md`:

- **CRUD** — create an `Account` via `AuthService`'s real registration path
  (`POST /auth/register` through supertest), confirm it is queryable directly
  via `prisma.account.findUnique`, confirm the stored `passwordHash` is a real
  bcrypt digest (`^\$2[aby]\$/`), never the plaintext password.
- **Unique** — register the same email twice; the second call must return the
  documented `INVALID_CREDENTIALS` envelope (`docs/backend.md` §4), proving
  `AccountsService.create`'s real `P2002` catch fires against a real
  constraint violation, not a mocked one.
- **FK + session-cascade** — register, capture the session, directly
  `prisma.account.delete()` the account, then assert
  `prisma.session.findMany({ where: { accountId } })` is empty — proving
  `Session.account`'s `onDelete: Cascade` at the database level.
- **Current route integration** — seed a `Region` + `RegionalMetric` via
  Prisma directly, then hit `GET /regions` and `GET /regions/:slug` through
  supertest and assert the real query shape (not the double's canned
  response); assert `GET /regions/:slug` still 404s for a slug that does not
  exist.
- **Runtime role cannot DDL** — using the app's own `PrismaService` (i.e. the
  `acres_app` connection), attempt
  `prisma.$executeRawUnsafe('DROP TABLE "Account"')` and assert it rejects
  with a Postgres permission-denied error. This is the one test that proves
  role separation is real, not just documented — phase 2's exit line names it
  explicitly ("runtime cannot use owner privileges").
- **Readiness** — `GET /health/ready` returns 200 `{ status: 'ok', database: 'ok' }`
  while the database is reachable (no negative case here: killing the
  database mid-suite is out of scope for this file; the code path is covered
  by the timeout added to `PrismaService`, and manually verified once during
  self-verification below).

### 6. Generated: `server/prisma/migrations/<timestamp>_init/migration.sql` and `server/prisma/migrations/migration_lock.toml`

**Not hand-written.** Produced by running `prisma migrate dev --name init`
against `acres_migrator@localhost:5432/acres` (exact command in Checks,
below) once the roles/databases exist. Read the generated SQL file in full
after it is produced and confirm it matches `server/prisma/schema.prisma`
exactly — seven `CREATE TABLE` statements, both enums, every documented index
from `docs/backend.md` §8 (`Session(accountId, expiresAt)`,
`RegionalMetric(regionId, key)`, `InsightReport(regionId, status)`,
`ContactSubmission.email`, `JobRun(jobName, status, startedAt)`, plus the
three `@unique` btrees) and both foreign keys with their documented
`onDelete` behavior — before committing it. This review is the "reviewed"
half of "first generated-and-reviewed Prisma 7 migration"; do not skip it.

No down-migration is authored. Prisma does not generate one, and for an
initial "create everything from empty" migration a hand-written down
migration would only ever mean "drop everything" — not a meaningful partial
rollback. Document this as the recorded policy for this migration
specifically; later migrations still follow `docs/build-plan.md`'s
forward-fix-preferred rule.

## Files to change

### `server/prisma.config.ts`

```ts
datasource: {
  url: process.env['DATABASE_MIGRATION_URL'] ?? process.env['DATABASE_URL'],
},
```

`DATABASE_MIGRATION_URL` is read directly via the file's existing
`import 'dotenv/config'` — same mechanism the file already uses for
`DATABASE_URL`, so this is one line changed, not a new loading path. It is
**not** added to `AcresEnv/validateEnv` — it is CLI-only, exactly like the
existing split between this file's env reads and `AcresConfigService`'s.

### `server/.env.example`

Replace the placeholder `DATABASE_URL` line and add the migration URL:

```dotenv
# Non-owner runtime credentials. The running API only ever needs CRUD, never
# DDL — see docs/backend.md for the acres_app role's exact privileges.
DATABASE_URL=postgresql://acres_app:acres_app_dev_password@localhost:5432/acres?schema=public

# Owner/migration credentials. Only `prisma migrate` / `prisma db push` /
# `prisma migrate status` read this — never the running API. Falls back to
# DATABASE_URL if unset.
DATABASE_MIGRATION_URL=postgresql://acres_migrator:acres_migrator_dev_password@localhost:5432/acres?schema=public
```

### `server/test/setup-env.ts`

Point `DATABASE_URL` at the dedicated test database/role, replacing the
current `acres:acres@localhost:5432/acres`:

```ts
process.env.DATABASE_URL =
  'postgresql://acres_test:acres_test_dev_password@localhost:5432/acres_test?schema=public';
```

This value is shared by both the existing double-based suite (which never
actually connects — `PrismaService` is overridden — so the string only needs
to be well-formed) and the new real-database suite (which does connect, and
for which this is load-bearing).

### `server/package.json`

Add two scripts beside the existing `prisma:migrate`:

```json
"prisma:migrate:deploy": "prisma migrate deploy",
"prisma:migrate:status": "prisma migrate status",
```

### root `package.json`

Add, matching phase 2's "deterministic start/stop/reset":

```json
"db:up": "docker compose up -d postgres",
"db:down": "docker compose down",
"db:reset": "docker compose down -v && docker compose up -d postgres",
```

`db:reset` destroys the named volume and recreates it, so
`docker-entrypoint-initdb.d` runs `bootstrap-roles.sh` again on next boot —
a genuinely deterministic reset, not a truncate.

### `packages/shared/src/api.ts`

Add one error code, alongside the existing eight:

```ts
export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'INVALID_CREDENTIALS',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CSRF_INVALID',
  'RATE_LIMITED',
  'NOT_READY',
  'INTERNAL_ERROR',
] as const;
```

### `server/src/common/api-exception.ts`

Add a static factory alongside `notFound`:

```ts
static notReady(): ApiException {
  return new ApiException(
    'NOT_READY',
    'The database is not reachable.',
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}
```

### `server/src/common/api-exception.filter.ts`

Add the 503 mapping to `STATUS_CODES`:

```ts
[HttpStatus.SERVICE_UNAVAILABLE]: 'NOT_READY',
```

### `server/src/prisma/prisma.service.ts`

Bound connection acquisition so a readiness check (or any query) fails fast
instead of hanging when the database is unreachable:

```ts
constructor(config: AcresConfigService) {
  super({
    adapter: new PrismaPg({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: 5000,
    }),
  });
}
```

### `server/src/health/health.service.ts`

Add a `readiness()` method beside the existing `check()`. Inject
`PrismaService` (it is `@Global()`, so no new module import is required,
only the constructor parameter):

```ts
async readiness(): Promise<{ status: 'ok'; database: 'ok' }> {
  await this.prisma.$queryRaw`SELECT 1`;
  return { status: 'ok', database: 'ok' };
}
```

Let the query's rejection propagate — the controller converts it (next).

### `server/src/health/health.controller.ts`

Add the readiness route under the existing `@SkipThrottle()` controller (a
readiness probe must not be rate-limited, same reasoning already documented
for `/health`):

```ts
@Get('ready')
async ready(): Promise<{ status: 'ok'; database: 'ok' }> {
  try {
    return await this.health.readiness();
  } catch {
    throw ApiException.notReady();
  }
}
```

Import `ApiException` from `../common/api-exception`.

### `.github/workflows/ci.yml`

Add a `postgres` service to the `checks` job (keys verified live against
GitHub's docs this session — see above), plus the bootstrap/migrate steps
before `test:server`, and `DATABASE_URL`/`DATABASE_MIGRATION_URL` for that
one step. The `docker` job is unchanged — its smoke test stays liveness-only,
matching `docs/backend.md` §3's documented reasoning for why `/health` takes
no database dependency; readiness-endpoint container verification is out of
scope for this prompt (see Non-goals).

```yaml
  checks:
    name: Lint, typecheck, build, test
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgis/postgis:18-3.6
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: acres_superuser_dev_password
          POSTGRES_DB: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
      - name: Bootstrap database roles
        env:
          PGHOST: localhost
          PGPORT: '5432'
          PGPASSWORD: acres_superuser_dev_password
          POSTGRES_USER: postgres
          POSTGRES_DB: postgres
          ACRES_MIGRATOR_PASSWORD: acres_migrator_dev_password
          ACRES_APP_PASSWORD: acres_app_dev_password
          ACRES_TEST_PASSWORD: acres_test_dev_password
        run: bash scripts/db/bootstrap-roles.sh
      - name: Apply migrations to the test database
        env:
          DATABASE_MIGRATION_URL: postgresql://acres_migrator:acres_migrator_dev_password@localhost:5432/acres_test?schema=public
        run: npm run prisma:migrate:deploy --workspace=@acres/server
      - name: Run server test suite
        env:
          DATABASE_URL: postgresql://acres_test:acres_test_dev_password@localhost:5432/acres_test?schema=public
        run: npm run test:server
```

Note `test:server`'s `DATABASE_URL` here is redundant with
`test/setup-env.ts`'s hard-coded value (both resolve to the same connection
string) — kept explicit in the workflow anyway so the CI step is
self-documenting without requiring a reader to open `setup-env.ts`.

## Non-goals

- **Node 22 → 24 LTS.** Phase 2 gates this on "after all packages and Prisma
  generation pass under it" — an independent, separately-verifiable task
  (Dockerfile base image, CI `setup-node` version, a local Node 24 run of the
  full check suite) that does not block the migration work here. Follow-up
  prompt, same phase.
- **Production PostgreSQL host, volume encryption implementation, or key-
  recovery tooling.** Phase 2 asks only for the *contract* to be defined,
  which `docs/backend.md` records as a target-state paragraph in this
  prompt's documentation update; phase 12 owns choosing a host and proving
  the encrypted-mount/recovery drill for real.
- **Organizations, memberships, RLS.** Phase 3, depends on this prompt but is
  not part of it.
- **Readiness-endpoint container smoke test in the CI `docker` job.** That
  job has no Postgres service attached; adding one meaningfully grows CI
  runtime for a check phase 2's exit line does not require (it requires the
  `checks` job's integration suite, not the Docker image specifically).
- **PostGIS geometry columns, `postgresqlExtensions` preview feature, or any
  `schema.prisma` change.** The extension is created by
  `bootstrap-roles.sh` so it exists when phase 7 needs it; no model uses it
  yet, so opting `schema.prisma` into managing it now would be speculative.
- **`server/prisma/schema.prisma` itself.** Unchanged — this is the schema's
  *first* migration, not a schema change.

## Expected impact

- `npm run test:server` **now requires a real, migrated `acres_test`
  database to be reachable** — a permanent shift from the prior "no database
  is provisioned" era `docs/backend.md` describes, and the intended one per
  phase 2's outcome. A developer who has not run `db:up` and migrated
  `acres_test` will see the new suite fail with a clear connection error, not
  a hang (bounded by `PrismaService`'s new `connectionTimeoutMillis`).
- No route changes except the new `GET /health/ready`. No response shape of
  any existing route changes.
- `client/` is untouched.

## Checks to run, and what each one actually proves against a phase-2 test bullet

Run in order; quote real output for each, per `AGENTS.md` §10 rule 3.

1. **Native provisioning (this sandbox only — the user runs the one `sudo`
   step via `! <command>`):**
   `sudo apt-get update && sudo apt-get install -y postgresql-18 postgresql-18-postgis-3`.
   Then verify `pg_hba.conf` permits password auth for new roles over
   `127.0.0.1`/`::1` (`sudo cat /etc/postgresql/18/main/pg_hba.conf` — Ubuntu's
   default already includes `host all all 127.0.0.1/32 scram-sha-256`; adjust
   and `sudo systemctl reload postgresql` only if it does not) before
   proceeding.
2. **Bootstrap roles natively:**
   `sudo -u postgres env ACRES_MIGRATOR_PASSWORD=acres_migrator_dev_password ACRES_APP_PASSWORD=acres_app_dev_password ACRES_TEST_PASSWORD=acres_test_dev_password POSTGRES_USER=postgres POSTGRES_DB=postgres bash scripts/db/bootstrap-roles.sh`.
   Re-running it must be a no-op (idempotency — proves the `pg_roles`/
   `pg_database` guards work).
3. **Generate the first migration** (proves "migration applies from zero"):
   `DATABASE_MIGRATION_URL="postgresql://acres_migrator:acres_migrator_dev_password@localhost:5432/acres?schema=public" npm run prisma:migrate --workspace=@acres/server -- --name init`.
   Read the generated SQL in full (see "Files to create" §6) before
   continuing.
4. **Deploy to the test database** (proves "rebuild empty DB from chain"):
   `DATABASE_MIGRATION_URL="postgresql://acres_migrator:acres_migrator_dev_password@localhost:5432/acres_test?schema=public" npm run prisma:migrate:deploy --workspace=@acres/server`.
5. **Status/drift** (the "fresh apply/status/drift" bullet):
   `DATABASE_MIGRATION_URL="postgresql://acres_migrator:acres_migrator_dev_password@localhost:5432/acres?schema=public" npm run prisma:migrate:status --workspace=@acres/server`
   and the same against `.../acres_test` — both must report no pending
   migrations and no drift.
6. **Reset-from-chain proof:** manually `DROP DATABASE acres_test;` /
   `CREATE DATABASE acres_test OWNER acres_migrator;` as `acres_migrator` (or
   `postgres`), then repeat step 4 and confirm it succeeds against a
   genuinely empty database — this is the manual equivalent of `db:reset` for
   the native path, since Compose is not what provisioned this sandbox's
   instance.
7. `npm run lint`, `npm run typecheck`, `npm run build` — unchanged
   expectations, quote real output.
8. `npm run test:server` — now includes `database.e2e-spec.ts`. Quote the
   real pass count for both suites; this is the "real Prisma CRUD/unique/FK/
   session-cascade/current route integration" bullet plus "runtime cannot use
   owner privileges."
9. **Manual readiness smoke:** `curl -isS http://localhost:3001/health/ready`
   with the database up (expect 200, `{"ok":true,"data":{"status":"ok","database":"ok"}}`),
   then again with the API's `acres_app` role temporarily revoked or the
   database stopped (expect 503, `NOT_READY`) — the one negative-path proof
   the automated suite does not cover, per "Files to create" §5.
10. `git diff --check` on every changed/new file.
11. YAML syntax check on the changed workflow:
    `python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ok')"`
    (`docs/backend.md` §10.1's already-verified pattern in this sandbox).
12. **CI parity is proved by the commit's own CI run on `main`**, exactly as
    `docs/backend.md` §10.1 states for the Dockerfile — this sandbox cannot
    run `docker/build-push-action`, so the `checks` job's service-container
    behavior is confirmed for real only once pushed.

## Where the result is recorded

`docs/backend.md`: a new dated section recording this prompt's roles/database
model, the exact migration filename, the readiness endpoint, the real-test
suite, the CI service-container wiring, the native-sandbox provisioning
record with real command output, and the production encryption/key-recovery
target-state contract paragraph. Update §6 (environment table — split
`DATABASE_URL`/`DATABASE_MIGRATION_URL`), §8 ("Migrations: deferred,
deliberately" → generated, with the real filename and role model), §9 (new
suite), and §12 (remove "the first Prisma migration" row; add "Node 24 LTS
build/CI image move" as newly deferred, with why).

`docs/system-architecture.md`: update the runtime/component table rows for
Prisma (`line 230`: "migrations are **target** phase 2" → landed, with the
migration path) and PostgreSQL + PostGIS (`line 231`: drop the bare
**target** tag — it is provisioned for local/CI now; production placement
remains phase 12's).

## SKILLS USED

- `postgres-best-practices` — loaded and read this session; informs the
  least-privilege role split (owner/runtime/test), default-privilege grants
  so future migrations do not need manual re-grants, and the
  idempotent-bootstrap pattern.
- `secrets-management` — loaded and read this session; informs keeping every
  credential here as an explicitly-labeled disposable dev value (never a real
  secret) and never printing one to a log, consistent with the existing
  `docker` job's throwaway `SESSION_SECRET`.
- `github-actions-templates` — loaded this session; the service-container
  block above still had its exact keys verified live against GitHub's own
  docs rather than trusted from the skill's generic examples, since the skill
  does not cover Postgres service containers specifically.
- `nestjs-best-practices` — read for module/provider conventions before
  touching `health/`, `prisma/` and `common/`; the readiness route follows
  the same controller/service split and global-filter error shape the
  existing `HealthController`/`ApiExceptionFilter` already establish.
- `javascript-testing-patterns` — for the new `database.e2e-spec.ts` and
  `real-db-test-app.ts` structure, kept consistent with the existing
  `test-app.ts`/`api.e2e-spec.ts` shape rather than introducing a new pattern.
- `security-best-practices` — for the runtime-role-cannot-DDL test and the
  double-submit/session boundaries already in place staying unchanged by this
  prompt.
- `requesting-code-review` / `receiving-code-review` — the two-stage review
  loop, required before this is recorded as done (`AGENTS.md` §2.1, §3).
- `caveman-commit` — the commit message, per the ALWAYS rule (`AGENTS.md` §3).
- Not used: any frontend/design/GSAP/Tailwind/shadcn skill — no `client/`
  file changes. `sql-optimization-patterns` — no query-plan work in this
  prompt (the schema/indexes are unchanged, just migrated for the first
  time). `architecture-patterns` — no module-boundary change, only a new
  route and a new test suite inside the existing module shape.
