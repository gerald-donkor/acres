# 48 - Correct PostgreSQL 18 Compose volume layout

## Scope and why this is next

`9cd49a0` is the committed `main` tip. The user then ran the documented local
database bootstrap on Omarchy with Docker 29.7.2 / Compose 5.5.0. Docker pulled
`postgis/postgis:18-3.6`, created the local `acres_acres_pgdata` volume, and
started `acres-postgres-1`, but the container entered a restart loop before
initializing PostgreSQL. Its repeated startup error states that PostgreSQL 18+
uses major-version-specific data directories and requires the persistent mount
at `/var/lib/postgresql`, while Acres mounts the volume at the obsolete
`/var/lib/postgresql/data` path.

The same incompatible target exists in the production Compose reference. This
is a repository configuration defect: migration and real-database E2E failures
are downstream `P1001` connection failures, not application or Prisma defects.

This prompt is a bounded PostgreSQL 18 container-layout correction. It does not
change the database schema, migrations, roles, credentials, application code,
production encryption decision, or PostgreSQL major version.

## Reference material read while preparing this prompt

Re-read before implementation:

- `AGENTS.md`, especially §§2, 2.1, 4-7, and 10.
- This approved prompt.
- `docs/backend.md` §8.1 and its Docker/runtime evidence records.
- `docs/operations.md`, especially production templates, preflight, deploy,
  backup/restore, and volume-encryption boundaries.
- `docs/system-architecture.md` database and volume contracts.
- `docker-compose.yml`,
  `infra/compose/docker-compose.production.example.yml`,
  `scripts/db/bootstrap-roles.sh`,
  `scripts/db/bootstrap-production-roles.sh`, and
  `scripts/ops/check-production-templates.sh`.
- The user's 2026-08-30 runtime evidence: `acres-postgres-1` repeatedly exits
  with PostgreSQL 18's explicit unused `/var/lib/postgresql/data` mount error;
  `pg_isready -h localhost -p 5432` reports no response.
- The loaded `postgres-best-practices`, `requesting-code-review`,
  `receiving-code-review`, and `caveman-commit` skills.

No Next.js, client, visual, browser, API, Prisma-model, or migration surface is
in scope. No design measurement applies.

## Skills used

- `postgres-best-practices` — preserve PostgreSQL data-directory and migration
  integrity while correcting the container mount boundary.
- `requesting-code-review` — dispatch the mandatory independent review after
  self-verification with the exact runtime evidence and diff.
- `receiving-code-review` — verify reviewer findings against Compose expansion,
  PostgreSQL 18 behavior, and the repository's disposable/production volume
  contracts before changing anything further.
- `caveman-commit` — create the required concise Conventional Commit message.

`deployment-pipeline-design` is not triggered: no CI/CD stage, promotion,
rollout, or deployment orchestration changes. `secrets-management` is not
triggered because existing environment variables and credentials remain
unchanged. No frontend, NestJS, API, or browser skill applies.

## Required implementation

### 1. Correct both PostgreSQL 18 volume targets

1. In root `docker-compose.yml`, change only the PostgreSQL named-volume target
   from `/var/lib/postgresql/data` to `/var/lib/postgresql`.
2. In `infra/compose/docker-compose.production.example.yml`, change only the
   encrypted PostgreSQL host-mount target from `/var/lib/postgresql/data` to
   `/var/lib/postgresql`.
3. Keep `postgis/postgis:18-3.6`, the named/host volume sources, bootstrap
   script mounts, ports/expose, health checks, roles, credentials, restart
   policy, and all non-PostgreSQL services unchanged.
4. Do not set a custom `PGDATA` merely to preserve the obsolete path. Follow
   the image's PostgreSQL 18 version-aware layout so later major-version upgrade
   tooling can operate within one mount boundary.

### 2. Add deterministic regression coverage

1. Extend the existing operations template check so it parses both the root
   local Compose file and the production Compose reference and fails unless a
   `postgis/postgis:18-*` service mounts persistent storage at exactly
   `/var/lib/postgresql`.
2. Fail if either PostgreSQL service retains `/var/lib/postgresql/data` as a
   volume target. Keep the check structural (parsed YAML), independent of a
   running Docker daemon, and compatible with named volumes and interpolated
   host paths.
3. Preserve the existing production encrypted-mount assertion and all other
   operations checks.

### 3. Reconcile documentation

1. Update `docs/backend.md` with the corrected PostgreSQL 18 Compose mount
   contract and the user-observed restart-loop evidence that exposed the stale
   path. State clearly that the newly created failed-initialization local volume
   contained no usable Acres database; do not generalize that conclusion to an
   existing populated volume.
2. Update `docs/operations.md` so the production PostgreSQL encrypted mount is
   documented at `/var/lib/postgresql`, with PostgreSQL managing its
   major-version-specific subdirectory beneath it.
3. Update `docs/system-architecture.md` only if its volume wording would
   otherwise imply the obsolete target. Do not expand product or deployment
   scope.

### 4. Recover the exact failed local runtime safely

1. Before removing anything, verify the target is exactly the newly created
   Compose container `acres-postgres-1` and named volume
   `acres_acres_pgdata`, and confirm the logs contain PostgreSQL 18's unused
   `/var/lib/postgresql/data` mount error. Never use a broad volume prune.
2. Stop the exact Compose PostgreSQL service. Remove only
   `acres_acres_pgdata`, which this session created during the failed first
   initialization and which never reached readiness. If inspection shows a
   different, older, populated, or ambiguously owned volume, stop and ask the
   user instead of deleting it.
3. Start PostgreSQL with the corrected configuration and wait for service
   health/readiness. Use Compose's verified wait behavior where available and
   confirm `pg_isready -h localhost -p 5432` reports accepting connections.
4. Deploy the committed migration chain to both `acres` and `acres_test` using
   the existing migrator URLs, then run the existing privilege-hardening script
   according to `docs/backend.md`. Do not generate or edit a migration.
5. Run the complete server E2E suite and record real pass/fail output. If this
   agent's process still lacks the user's newly activated `docker` group,
   request the narrowly scoped Docker approval or provide the exact commands
   for the user-run evidence; do not fabricate runtime success.

## Explicit non-goals

- No PostgreSQL downgrade, image replacement, PostGIS change, custom `PGDATA`,
  schema migration, Prisma change, seed-data change, or role redesign.
- No deletion of an existing populated database volume and no `docker volume
  prune`, broad Compose teardown, or unrelated container/image cleanup.
- No production deployment, encrypted-volume provisioning, backup migration,
  `pg_upgrade`, restore drill, or claim that production storage is ready.
- No Valkey, Garage, ClamAV, API, worker, client, contract, or UI changes.

## Acceptance criteria

- Both PostgreSQL 18 Compose definitions mount persistent storage at
  `/var/lib/postgresql`, not `/var/lib/postgresql/data`.
- A daemon-free deterministic check prevents either file from regressing to
  the obsolete target while preserving the production encrypted-mount check.
- The exact failed first-boot local volume is recreated only after identity and
  failure-state verification; no unrelated or potentially populated volume is
  removed.
- PostgreSQL becomes healthy, both databases receive the committed migration
  chain, runtime privileges are rehardened, and `npm run test:server` passes, or
  any external/runtime block is reported precisely.
- Documentation distinguishes the local disposable-volume recovery from
  production upgrade, encryption, backup, and restore responsibilities.

## Verification and handoff

Run and quote real output for:

```bash
docker compose config
docker compose -f infra/compose/docker-compose.production.example.yml config
npm run ops:templates
npm run ops:check
docker compose ps -a postgres
docker compose logs --tail=120 postgres
pg_isready -h localhost -p 5432
DATABASE_MIGRATION_URL="postgresql://acres_migrator:acres_migrator_dev_password@localhost:5432/acres?schema=public" npm run prisma:migrate:deploy --workspace=@acres/server
DATABASE_MIGRATION_URL="postgresql://acres_migrator:acres_migrator_dev_password@localhost:5432/acres_test?schema=public" npm run prisma:migrate:deploy --workspace=@acres/server
npm run test:server
npm run lint
npm run typecheck
npm run build
npm run contracts:check
git diff --check
git status --short
git diff --cached --check
git diff --cached --stat
```

For the production Compose `config` command, provide only safe placeholder
environment values required for interpolation and never expose real secrets.
Treat the pre-fix restart-loop transcript as failure evidence, not a pass.

Inspect the complete diff and staged diff. Invoke `requesting-code-review` with
actual `BASE_SHA`/`HEAD_SHA`, this prompt, the PostgreSQL 18 runtime error, both
Compose paths, regression-check logic, exact volume-recovery evidence, and all
verification results. Evaluate every finding through `receiving-code-review`;
fix only verified issues and rerun affected checks. Request follow-up review if
feedback materially changes storage layout, recovery safety, production
templates, or validation behavior.

Stage only approved files and this prompt, inspect the staged patch, and commit
locally to `main` using a `caveman-commit` message with a body explaining the
PostgreSQL 18 versioned data-directory requirement. Do not push.
