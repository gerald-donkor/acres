# 19 — complete phase 2 by moving Acres to Node 24 LTS

## Scope, and why it is next

The committed repository state is `4f34481` (`feat(db): add Postgres
infrastructure`). That commit lands phase 2's PostgreSQL/PostGIS service,
separated database roles, first Prisma migration, readiness behavior, and
real-database suite. It does not complete all of phase 2: `docs/backend.md`
§12 explicitly leaves the Node 22 → 24 LTS move as a **same-phase follow-up**
covering the server image, GitHub Actions runtime, and a local Node 24 run of
the complete repository checks. This is therefore earlier than phase 3's
organizations/RLS work and is the earliest dependency-safe unbuilt unit in
`docs/build-plan.md`.

Complete that follow-up without changing application behavior:

- use Node 24 for every Node-based stage of `server/Dockerfile`;
- use Node 24 in the GitHub Actions `checks` job;
- prove dependency installation, Prisma generation, all three workspaces, and
  the real PostgreSQL server suite under the actual local Node 24 runtime;
- update the canonical build records so Node 24 is current, phase 2 is
  complete, and the Node upgrade is no longer listed as deferred;
- correct already-encountered stale implemented-state statements about the
  database in `AGENTS.md` and `docs/security.md` while those phase-2 records
  are being closed.

This is a runtime-baseline and verification change, not a dependency upgrade,
schema change, route change, UI change, or deployment-provider decision.

## Reference material read

Repository authority read while preparing this prompt:

- `AGENTS.md` §§2, 2.1, 4–8, and 10 — phase control, prompt contract,
  commands, commit/review workflow, build sequence, and non-fabrication rules;
- `docs/build-plan.md` §§1–4 — phase 2's Node 24 gate and phase 3 dependency;
- `docs/backend.md` §§8.1–8.3, 10.1, 11–13 — implemented database state,
  current Node 22 Docker/CI state, verification record, deferred Node move,
  and current-to-target bridge;
- `docs/system-architecture.md` §§3–4 — runtime topology and the
  `Node 22 current / Node 24 target` inventory row;
- `docs/security.md` §§2–6 — current/target boundaries, migration/runtime
  identity separation, CI, and the stale database-state row to correct;
- `docs/product.md` §§2–4 — product roles and journeys; read to confirm this
  runtime-only unit must not pull organization behavior forward;
- `docs/skills.md` §§2–4 — locked skill paths, triggers, and phase manifests;
- `prompts/18-database-infrastructure.md`, especially Scope, Non-goals,
  Expected impact, and Verification — the explicit same-phase deferral and
  the database prerequisites the server suite now needs;
- `package.json`, `package-lock.json`, `client/package.json`,
  `server/package.json`, `server/Dockerfile`, and
  `.github/workflows/ci.yml` — the live workspaces, scripts, package engine
  declarations, three Node 22 image stages, and Node 22 CI setup;
- installed package manifests in `node_modules/`: Next 16.3.1 declares Node
  `>=20.9.0`, NestJS core 11.2.1 declares `>=20`, and Prisma/Prisma Client
  7.9.1 declare `^20.19 || ^22.12 || >=24.0`;
- the official Node release page,
  `https://nodejs.org/en/about/previous-releases`, checked 2026-08-23: Node
  24 (`Krypton`) is an LTS line, while Node 26 is still Current. Acres follows
  its already-approved Node 24 target rather than jumping to Current;
- the official `nodejs/docker-node` repository README and `versions.json`,
  checked 2026-08-23: the supported `node:24` line includes Alpine variants,
  so the existing `node:<major>-alpine` image strategy has a verified Node 24
  equivalent.

No visual reference applies. This changes no UI, layout, motion, typography,
color, asset, breakpoint, or browser interaction. The four static design
references and the chrome-only recordings are intentionally not used.

## Verified starting state

These observations were made while preparing the prompt; re-run them during
execution and record the execution-time output rather than copying these
values blindly:

```text
$ node --version
v24.19.0

$ npm --version
11.17.0
```

- `server/Dockerfile` has exactly three explicit Node base-image declarations:
  `deps`, `prod-deps`, and `runtime`; all are currently `node:22-alpine`.
  `build` inherits from `deps` and must continue to do so.
- `.github/workflows/ci.yml` currently configures
  `actions/setup-node@v7` with `node-version: '22'` in the `checks` job. The
  Docker job gets its Node runtime only from `server/Dockerfile`.
- There is no `.nvmrc`, `.node-version`, Volta block, or root `engines` field.
  Phase 2 named the Dockerfile, CI runtime, and local Node 24 verification;
  this prompt does not invent a fourth version-management convention.
- No Docker-compatible CLI is installed in this sandbox (`docker`, `podman`,
  and `nerdctl` are absent). Do not claim a local image build or container
  smoke test.
- PostgreSQL 18's native `18/main` cluster exists but is currently down;
  `pg_isready -h localhost -p 5432` reports no response. The real-database
  test suite cannot pass until the user starts that already-provisioned
  cluster. Do not replace it with a test double or skip the suite.
- The worktree was clean when this prompt was prepared. Re-check before
  implementation and preserve any later unrelated user changes.

## Exact implementation

### 1. Re-establish the execution context

Before editing:

1. Re-read `AGENTS.md`, this approved prompt, and every repository document
   listed above.
2. Load every skill in `## SKILLS USED` again. Loading during prompt creation
   does not carry into execution.
3. Run and retain the actual output of:

   ```bash
   git status --short --branch
   git log -1 --oneline
   node --version
   npm --version
   command -v docker || true
   command -v podman || true
   command -v nerdctl || true
   pg_lsclusters || true
   pg_isready -h localhost -p 5432 || true
   ```

4. Stop if the Node major is not 24. Do not perform the upgrade under Node 22
   and describe it as Node 24 verification.
5. If unrelated changes exist, do not stage, rewrite, or discard them. Work
   around them; if an approved target file overlaps materially, stop and ask.

### 2. Change the server image runtime, and nothing else about the image

Edit `server/Dockerfile`:

- change `FROM node:22-alpine AS deps` to `FROM node:24-alpine AS deps`;
- change `FROM node:22-alpine AS prod-deps` to
  `FROM node:24-alpine AS prod-deps`;
- change `FROM node:22-alpine AS runtime` to
  `FROM node:24-alpine AS runtime`;
- leave `FROM deps AS build` intact so the build stage inherits the verified
  Node 24 dependency stage;
- preserve the multi-stage structure, scoped installs, `--ignore-scripts`,
  shared-workspace symlink repair, non-root `USER node`, healthcheck, direct
  Node `CMD`, comments, and all copy paths.

Use the approved major-line tag `node:24-alpine`, matching the repository's
existing update policy. Do not silently switch Linux distribution, add
`gcompat`, pin an unapproved digest, or change npm/package dependencies. If a
real build reveals an Alpine/musl incompatibility, treat it as evidence and
stop to revise the plan; do not improvise a base-image migration.

### 3. Change the CI Node runtime without broadening CI

Edit `.github/workflows/ci.yml`:

- preserve `actions/setup-node@v7`, npm caching, job permissions, event
  triggers, PostgreSQL/PostGIS service, database bootstrap/migration/hardening,
  all checks, job dependency, Docker build/smoke steps, and cleanup;
- change only the `checks` job's `node-version` from `'22'` to `'24'`.

The database passwords in this workflow are the existing disposable CI/local
fixtures documented by phase 2. Do not move them into production secrets,
print new secrets, add a deployment environment, add package publishing, or
introduce a matrix: this phase establishes Node 24 as the one baseline rather
than temporarily supporting two majors.

### 4. Prove install and package compatibility on Node 24

From the repository root under the execution-time Node 24 runtime:

1. Run `npm ci`. This must reconstruct the lockfile-defined install under Node
   24; an existing `node_modules` directory alone is not proof that install
   scripts and engine checks work on the new major.
2. Confirm the installed primary package versions and declared engine ranges
   from their manifests using a small read-only `node -e` command. Check Next,
   `@nestjs/core`, `prisma`, and `@prisma/client`. Do not edit package versions.
3. Run both Prisma-specific gates explicitly:

   ```bash
   npm run prisma:validate --workspace=@acres/server
   npm run prisma:generate --workspace=@acres/server
   ```

4. Inspect `git status --short` after install/generation. Generated or lockfile
   drift must be understood. Commit no accidental dependency update and do not
   normalize the lockfile merely because npm touched it.

If `npm ci` requires network access unavailable in the sandbox, request the
minimum necessary approval and rerun the same command. If a package fails on
Node 24, preserve the real output and stop: package upgrades are outside this
prompt and need a separately approved compatibility decision.

### 5. Restore the real database test prerequisite visibly

The real server suite is mandatory. First run
`pg_isready -h localhost -p 5432`.

- If the existing native PostgreSQL cluster is still stopped, ask the user to
  start that exact already-provisioned cluster with the privileged host command
  appropriate to this installation. This agent cannot supply the user's sudo
  password or access the system service bus from the sandbox.
- After it responds, run Prisma migration status against both `acres` and
  `acres_test` using the already-documented local migrator URLs, without
  printing credentials in prose or docs.
- If either database is behind, apply the committed migration chain with
  `prisma migrate deploy`, then rerun
  `scripts/db/harden-runtime-privileges.sh` as documented in
  `docs/backend.md` §8.1. Do not create a migration: this prompt has no schema
  change.
- Do not reset, drop, or recreate either database. A destructive reset is not
  authorized by this runtime upgrade.

### 6. Update implemented-state documentation

Update only facts affected by completing phase 2 or stale phase-2 statements
encountered during preparation:

- `docs/backend.md`
  - in §10.1, state that all explicit server image stages use
    `node:24-alpine` and that the CI checks job uses Node 24;
  - retain the four-stage behavior and the honest Docker-unavailable caveat;
    do not claim a local image build;
  - append a prompt 19 verification subsection in §11 quoting the actual Node,
    npm, install, Prisma, lint, typecheck, build, server-test, YAML, diff, and
    any available Docker evidence from this execution;
  - remove the Node 22 → 24 row from §12 Deferred after its gates pass;
  - change the §13 runtime bridge from Node 22 current / Node 24 target to Node
    24 current, while leaving phase 12's topology/operations work targeted.
- `docs/system-architecture.md`
  - change the component inventory from `Node 22 current; Node 24 target` to
    Node 24 LTS current;
  - retain the runtime replacement seam and avoid implying Node 26 Current is
    approved.
- `docs/build-plan.md`
  - update the status preamble to record phase 2 as implemented only after the
    code and verification gates in this prompt pass; do not mark phase 3 or any
    later phase implemented.
- `AGENTS.md`
  - correct the §8.1 snapshot statement that still says no database is
    provisioned or migration generated: record the current local/CI
    PostgreSQL/PostGIS setup, committed first migration, and real-database test
    requirement concisely;
  - do not turn the snapshot into a second backend build record.
- `docs/security.md`
  - correct the current `Migrations/database` state from "Prisma schema but no
    real DB or first migration" to the implemented local/CI database,
    separated roles, and committed first migration;
  - leave production hosting/encryption/backups, organizations, and RLS as
    target state.

Do not edit `docs/product.md`: no product scope, role, data meaning, or journey
changes. Do not add an ADR: this executes an already-approved architecture
target rather than choosing a new durable architecture.

## Expected impact

- Local application behavior and every HTTP route remain unchanged.
- CI installs, lints, typechecks, builds, generates Prisma, migrates/tests
  Postgres, and runs the existing server suite under Node 24.
- The shipped API image is built and runs on the official Node 24 Alpine line.
- The root/client/server/shared dependency graph and `package-lock.json`
  remain unchanged unless `npm ci` exposes real, explained lock drift; no such
  drift is expected.
- Phase 2 becomes complete after the local Node 24 gates pass and the reviewed
  implementation is committed. Phase 3 then becomes the next dependency-safe
  target, but is not started here.

## Failure, security, compatibility, and rollback

- An engine warning, native-module failure, Prisma generation failure, Next or
  Nest build failure, Jest failure, or real database failure is a blocking
  compatibility signal. Capture it; do not waive it or upgrade dependencies
  outside scope.
- Preserve `permissions: contents: read` in GitHub Actions and the server
  image's non-root runtime. Do not add secrets or broaden token permissions.
- The test suite continues to use the non-owner `acres_test` role. Do not use
  migrator/owner credentials as the API test connection to make tests pass.
- Node 22 remains a straightforward code rollback: revert the three Dockerfile
  base declarations and the CI `node-version` together. No data rollback or
  migration is involved.
- Do not claim CI or Docker success unless actually observed. With no Docker
  CLI in this sandbox and no push authorized by `Y`, the committed workflow is
  the later image-build proof when the user separately pushes with `P`. Record
  that residual verification boundary explicitly.

## Non-goals

- No Node 26 Current adoption.
- No dependency, npm, Prisma, Next, React, NestJS, TypeScript, action-version,
  Alpine-version, or lockfile upgrade.
- No `.nvmrc`, `.node-version`, Volta/mise configuration, or root `engines`
  field; phase 2 did not select a local version-manager convention.
- No application source, route, DTO, API envelope, auth/session, scheduler,
  readiness, schema, SQL migration, seed, role, RLS, or organization change.
- No Dockerfile restructuring, Debian migration, registry push, image signing,
  SBOM, SAST, deployment promotion, production host, secrets provider,
  observability, Caddy, Valkey, Garage, worker, or backup work. Those remain in
  their owning phases.
- No client UI, design-system, accessibility, motion, or browser work.
- No push. A later standalone uppercase `P` is the only authorization to push
  the local `main` commit and trigger remote CI.

## Verification and required evidence

Run from the repository root and quote the real output in
`docs/backend.md` §11 and the completion response. Do not replace a failed or
blocked command with a summary.

### Runtime and exact-diff checks

```bash
node --version
npm --version
rg -n '^FROM node:|node-version:' server/Dockerfile .github/workflows/ci.yml
rg -n 'node:22|node-version: .22.' server/Dockerfile .github/workflows/ci.yml && exit 1 || true
git diff --check
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('ok')"
```

The Node output must be major 24. The first `rg` must show three explicit
`node:24-alpine` stages plus CI Node 24; the second must find no stale Node 22
runtime declaration in those two files. Do not use repository-wide absence of
the words "Node 22" as a gate because historical prompt/build rationale may
legitimately mention it.

### Clean install and package gates

```bash
npm ci
npm run prisma:validate --workspace=@acres/server
npm run prisma:generate --workspace=@acres/server
npm run lint
npm run typecheck
npm run build
```

### Real database gate

After the existing database is reachable and migration status is current:

```bash
pg_isready -h localhost -p 5432
npm run test:server
```

The suite must use the documented `acres_test` runtime connection and must
retain the real database tests. Report Jest's actual suite/test counts.

### Docker/CI evidence boundary

If a Docker-compatible CLI is unexpectedly available at execution time, run
the existing image build and health smoke using the documented commands and
quote the result. Otherwise quote the absence of `docker`, `podman`, and
`nerdctl`, manually inspect that all three explicit stages moved together, and
state that remote CI after a separately authorized push is the first executable
image proof. Do not push as part of this prompt.

### Final review and commit gates

```bash
git status --short
git diff --stat
git diff -- server/Dockerfile .github/workflows/ci.yml AGENTS.md docs/backend.md docs/build-plan.md docs/security.md docs/system-architecture.md prompts/19-node-24-lts.md
git diff --check
```

Then:

1. Self-review every changed line against this prompt and verify that no
   dependency, application source, schema, secret, action version, or unrelated
   user file changed.
2. Use `requesting-code-review` to dispatch a read-only reviewer subagent with
   the full prompt requirements, changed-file list, actual commands/results,
   and exact `BASE_SHA`/`HEAD_SHA` or working-tree range.
3. Use `receiving-code-review` to verify each finding against the repository.
   Clarify unclear feedback before any fix; implement valid findings one at a
   time and rerun affected checks. Request follow-up review if feedback changes
   the runtime strategy, CI structure, security boundary, or documentation
   contract materially.
4. Stage only the approved paths. Inspect `git diff --cached --check` and the
   full staged diff.
5. Use `caveman-commit` for the final Conventional Commit message and commit
   locally to `main`. A suitable subject shape is
   `build(node): move to Node 24 LTS`; the skill owns the final wording.
6. Do not push.

## Documentation owner

`docs/backend.md` owns the detailed runtime, CI, verification, and deferred
state. `docs/system-architecture.md` owns the current runtime inventory.
`docs/build-plan.md` owns the phase-status preamble. `docs/security.md` owns
the database trust-boundary snapshot. `AGENTS.md` receives only the required
stale snapshot correction.

## Exit gate

This prompt is complete only when:

- every explicit server image stage and CI's Node setup use Node 24;
- a clean lockfile install, Prisma validate/generate, lint, typecheck, build,
  and the full real-database server suite pass under an actual Node 24 runtime;
- no dependency, lockfile, schema, application behavior, or CI permission
  changed unintentionally;
- documentation accurately distinguishes proven local Node 24 checks from the
  Docker/remote-CI evidence that cannot run in this sandbox before a later
  push;
- the two-stage review loop is complete, valid findings are resolved, and all
  affected checks are rerun;
- only approved files are committed locally to `main`, with no push.

## SKILLS USED

- `architecture-patterns` — preserve the modular-monolith/runtime boundary and
  avoid turning a runtime-major move into an architectural rewrite.
- `postgres-best-practices` — preserve real PostgreSQL migration/role evidence
  and the non-owner integration-test boundary while validating Node 24.
- `nestjs-best-practices` — verify the Nest build/runtime image remains
  production-safe, non-root, and graceful-shutdown compatible.
- `security-best-practices` — keep the JavaScript/TypeScript runtime move
  secure by default and prevent CI/image privilege regressions; this skill has
  no Nest-specific reference file, so apply its general guidance together with
  the Nest skill and repository security contract rather than inventing one.
- `github-actions-templates` — update the GitHub Actions Node runtime while
  preserving least permissions, caching, deterministic install, and job gates.
- `secrets-management` — preserve the existing disposable CI credential scope
  and prevent logs, permissions, or runtime changes from broadening secret
  exposure.
- `javascript-testing-patterns` — require clean-install, Prisma, workspace, and
  real-database regression evidence under Node 24.
- `requesting-code-review` — prepare and dispatch the mandatory read-only
  reviewer subagent after self-verification.
- `receiving-code-review` — verify reviewer claims technically before fixes and
  govern any re-review.
- `caveman-commit` — write the required terse Conventional Commit message for
  the local `main` commit.

Conditional phase-2 skills are intentionally absent:
`deployment-pipeline-design` does not trigger because no deployment/promotion
is added; `sast-configuration` does not trigger because no scanner is added;
`prometheus-configuration` does not trigger because no telemetry is added.
