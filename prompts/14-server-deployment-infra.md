# 14 — server deployment infra: Dockerfile and CI

## Scope, and why it is next

The documented build sequence (`AGENTS.md` §8.2, steps 1–8) is complete and
committed. `docs/backend.md` §11's verification record is current as of
`prompts/13-rate-limiting.md` (2026-08-23): lint, typecheck, the root build,
and `npm run test:server` (29 tests) all pass, and a live smoke test of
`/health`, `/auth/csrf`, `/forms/contact` (CSRF-rejected), `/account`
(unauthenticated), `/auth/session` and `/regions` (envelope-correct
`INTERNAL_ERROR` with no database) all match the documented contract.

There is no step 9 defined anywhere in `AGENTS.md`. The obvious next
candidates for further work — a landing-page contact form, login/register
screens, a live regions view — all require a UI that no reference file
covers: `Desktop.png` / `Tablet.png` / `Mobile.png`'s "Connect with us"
section (`client/app/page.tsx:486-522`) is a heading, one paragraph and a
"Learn More" CTA to `#how-to`, with no form fields, and no comp anywhere in
`client/public/assets/ui/` shows a login or register screen. Building any of
those would mean inventing UI with nothing to measure against, which
`AGENTS.md` §10 rule 7 and rule 9 forbid outright. This was raised with the
user directly (not assumed), and the user chose the remaining candidate that
needs no new design: **deployment infrastructure for the API** —
`docs/backend.md` §10 states plainly "No provider manifest is created in this
step — no Dockerfile, no CI workflow, no Terraform" and §12 lists exactly
this as deferred. This prompt builds the first two of those three (a
Dockerfile for `server/`, and a GitHub Actions CI workflow) and leaves
Terraform / actual hosting / registry credentials deferred, because no
hosting provider has been chosen and choosing one is the user's call, not
this session's.

**This is infrastructure, not a design or product change.** No route, no
response shape, no client code, no `client/` file, and no Prisma model
changes. Nothing in `AGENTS.md` §0's reference material applies to this
prompt — the reference material here is `docs/backend.md` itself (read in
full this session) and the repository's actual `package.json` scripts,
verified live rather than recalled.

## What was verified this session, and how

Everything below was run or fetched in this session, not recalled from
`docs/backend.md`'s prior (2026-08-21 / 2026-08-23) records, because tool
versions and the sandbox's own capabilities can differ run to run:

- **Toolchain in this sandbox**: `node -v` → `v24.19.0`, `npm -v` →
  `11.17.0`. (`docs/backend.md` §1 recorded `v26.7.0` / `12.0.2` from a prior
  session — both satisfy `docs/backend.md` §10's "Node 22+", and the
  Dockerfile pins its own `node:22-alpine`, so neither figure is load-bearing
  here.)
- **Docker is not installed in this sandbox** (`which docker` → nothing). The
  Dockerfile below cannot be built or run locally as part of this prompt's
  self-verification. This is stated as a known gap, not glossed over
  (`AGENTS.md` §10 rule 3): the first real `docker build` of this file
  happens in CI, on the commit that lands it on `main`.
- **No `hadolint`, `actionlint`, `act`, or `gh` auth** are available in this
  sandbox either. The only available local check for the two new files is a
  YAML syntax parse of the workflow (`python3` + `pyyaml`, confirmed present)
  and a careful manual trace of every `COPY` source/destination in the
  Dockerfile against the real repository layout.
- **The workspace-scoped install command was tested for real**, isolated from
  the working tree: a scratch copy of `package.json`, `package-lock.json` and
  the three workspaces' `package.json` files (not their source) was built at
  `/tmp/claude-1000/.../scratchpad/docker-npm-ci-test/`, and
  `npm ci --workspace=@acres/server --workspace=@acres/shared --include-workspace-root --ignore-scripts`
  completed with exit 0 ("added 896 packages") **without** `client/`'s
  `node_modules` or any `next`/`react` package appearing anywhere in the
  resulting tree. `client/package.json` (but none of `client/`'s source) had
  to be present for the command to run at all — `npm ci` validates every
  workspace declared in root `package.json`'s `"workspaces"` array against
  `package-lock.json`, even when `--workspace` scopes which ones actually get
  linked into `node_modules`. The scratch directory was deleted after the
  test; nothing from it is committed.
- **`server/src/generated/prisma` was generated for real** this session
  (`npm run prisma:generate --workspace=@acres/server`, gitignored output) and
  inspected: **15 files, all `.ts`**, no `.wasm` or other non-TypeScript
  runtime asset alongside them. This closes the one real risk in a multi-stage
  Docker build here — that `tsc` (which `nest build` runs) only compiles
  `.ts` files and does not copy arbitrary non-TypeScript assets into `dist/`,
  which would have silently dropped a required runtime file. There is nothing
  to drop: the WASM query engine Prisma 7 ships lives inside the
  `@prisma/client` / `@prisma/adapter-pg` npm packages (installed into
  `node_modules`, not generated into `server/src/generated/`), and those
  packages are carried into the runtime image by the production `npm ci`
  below.
- **The four GitHub Actions used in the CI workflow were checked against
  their live tag lists** (`actions/checkout`, `actions/setup-node`,
  `docker/build-push-action`, `docker/setup-buildx-action` — fetched from
  `github.com/<org>/<repo>/tags` this session, 2026-08-23), not written from
  training-data memory, per `AGENTS.md` §10 rule 6:

  | action | current major tag |
  | --- | --- |
  | `actions/checkout` | `v7` |
  | `actions/setup-node` | `v7` |
  | `docker/setup-buildx-action` | `v4` |
  | `docker/build-push-action` | `v7` |

## Files to create

### 1. `server/Dockerfile` (new file)

```dockerfile
# syntax=docker/dockerfile:1

# ---- deps: install only what @acres/server and @acres/shared need to build ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY packages/shared/package.json packages/shared/package.json
# npm ci still validates every workspace declared in the root "workspaces"
# array against package-lock.json, so client/package.json must be present
# even though this image never builds or ships the client (verified this
# session; see prompts/14-server-deployment-infra.md). --ignore-scripts skips
# the root "prepare" hook (which would build @acres/shared here) and any
# package postinstall — both are run explicitly, in order, in the "build"
# stage below instead.
RUN npm ci --workspace=@acres/server --workspace=@acres/shared --include-workspace-root --ignore-scripts

# ---- build: compile @acres/shared, then @acres/server (which needs its dist) ----
FROM deps AS build
COPY packages/shared packages/shared
COPY server server
RUN npm run build --workspace=@acres/shared && \
    npm run build --workspace=@acres/server

# ---- prod-deps: a clean, production-only install of the same two workspaces ----
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev --workspace=@acres/server --workspace=@acres/shared --include-workspace-root --ignore-scripts

# ---- runtime: the shipped image ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/server/dist server/dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
# Direct node invocation, not "npm run start:server": app.setup.ts's
# enableShutdownHooks() (docs/backend.md §3) needs SIGTERM delivered straight
# to the node process to drain in-flight requests before exit, which running
# npm as PID 1 does not reliably do. The accepted cost, already recorded in
# docs/backend.md §6, is that process.env.npm_package_version is unset
# outside an npm-run entrypoint, so GET /health reports "version": null from
# this image — a known, already-documented trade-off, not a new one.
CMD ["node", "server/dist/main.js"]
```

**Why `@acres/shared`'s `dist` and `package.json` are copied to
`packages/shared/...` in the runtime stage, not merged into `node_modules`
directly:** `prod-deps`'s `npm ci` links `@acres/shared` into
`node_modules/@acres/shared` as a **relative symlink to `../packages/shared`**
(standard npm-workspaces behaviour). Copying `node_modules` alone would carry
a symlink that resolves to nothing. Placing the real package at
`/app/packages/shared` — the same relative position it occupies in the
source tree — makes the copied symlink resolve correctly with no
`node_modules` rewriting.

### 2. `.dockerignore` (new file, repository root)

```
# git and CI metadata
.git
.github

# dependency and build artefacts — reinstalled/rebuilt inside the image
node_modules
**/node_modules
server/dist
server/coverage
server/src/generated
packages/shared/dist
**/*.tsbuildinfo

# the client ships to Vercel, not this image (docs/backend.md §10); only its
# package.json is needed, to satisfy npm workspace resolution (see the
# Dockerfile's "deps" stage comment)
client
!client/package.json

# secrets — never baked into the image, injected at `docker run` / by the host
.env*
!client/.env.example
!server/.env.example

# misc
.DS_Store
*.log
```

### 3. `.github/workflows/ci.yml` (new file)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  checks:
    name: Lint, typecheck, build, test
    runs-on: ubuntu-latest
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
      - run: npm run test:server

  docker:
    name: Build and smoke-test the API image
    runs-on: ubuntu-latest
    needs: checks
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v4
      - uses: docker/build-push-action@v7
        with:
          context: .
          file: server/Dockerfile
          push: false
          load: true
          tags: acres-server:ci
      - name: Run the image
        run: |
          docker run -d --name acres-server-ci -p 3001:3001 \
            -e NODE_ENV=production \
            -e PORT=3001 \
            -e CLIENT_ORIGIN=http://localhost:3000 \
            -e DATABASE_URL="postgresql://acres:acres@localhost:5432/acres?schema=public" \
            -e SESSION_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd \
            -e SCHEDULER_ENABLED=false \
            acres-server:ci
      - name: Wait for /health
        run: |
          for i in $(seq 1 15); do
            if curl -fsS http://localhost:3001/health; then
              echo
              exit 0
            fi
            sleep 2
          done
          echo "the container never answered /health"
          exit 1
      - name: Container logs
        if: always()
        run: docker logs acres-server-ci
      - name: Stop container
        if: always()
        run: docker rm -f acres-server-ci
```

`DATABASE_URL` and `SESSION_SECRET` here are throwaway values scoped to this
one ephemeral container (no real Postgres runs in this job — `GET /health`
deliberately takes no database dependency, per `docs/backend.md` §3, so this
does not need one). `SESSION_SECRET` is a fixed 64-hex-character string,
**not** the `.env.example` placeholder — `docs/backend.md` §6 records that
boot fails in production if `SESSION_SECRET` is still the
`change-me…` placeholder, and this job runs with `NODE_ENV=production`.

## Non-goals

- **No registry push.** `build-push-action` runs with `push: false`; there is
  no configured registry, and choosing one (Docker Hub, GHCR, a cloud
  provider's registry) is a hosting decision for the user, not this prompt.
- **No Terraform, no Kubernetes manifests, no `docker-compose.yml` for local
  Postgres.** `docs/backend.md` §10 defers all of these explicitly; this
  prompt narrows that gap by exactly the two items the user chose
  (Dockerfile, CI), not the rest of it.
- **No change to `client/`.** The client still deploys to Vercel, unaffected,
  per `docs/backend.md` §10.
- **No `.env` values baked into the image.** `server/.env` is gitignored and
  is never in the Docker build context by construction (`.dockerignore`
  excludes `.env*` outright, and the Dockerfile's targeted `COPY`s never pull
  a whole directory that could contain one). Every required variable
  (`docs/backend.md` §6) is injected at `docker run` / by the orchestrator.
- **No first Prisma migration, no database provisioning.** Both stay deferred
  per `docs/backend.md` §8 and §12 — unrelated to this prompt, which only
  packages the already-built server for a host to run.
- **No change to any route, DTO, guard, or the rate-limit/CSRF/session logic**
  built in `prompts/10-nestjs-server.md` and `prompts/13-rate-limiting.md`.

## Expected impact

- Two new top-level files (`.dockerignore`, `.github/workflows/ci.yml`) and
  one new file under `server/` (`Dockerfile`). No existing file's behaviour
  changes.
- `git push` to `main` will, from this commit forward, trigger the `CI`
  workflow on GitHub — this is the **first** time any check on this
  repository runs anywhere other than a local shell. If the user is not
  already pushing this repository to a GitHub remote, the workflow file is
  inert (committed, but never triggered) until they do; that is expected and
  is not a defect to chase down in this prompt.
- No production traffic is affected — nothing here deploys the API anywhere
  it is reachable from the internet.

## Checks to run, and what each one actually proves

Run from the repository root, after both files exist, output quoted verbatim
per `AGENTS.md` §10 rule 3:

1. **`npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:server`**
   — re-run even though no application code changed, to confirm the two new
   files (and the `.dockerignore`/workflow additions) introduce no regression
   and that `docs/backend.md`'s existing verification record still holds on
   this machine's current toolchain (`node v24.19.0` / `npm 11.17.0`, both
   different from the `v26.7.0` / `12.0.2` recorded 2026-08-21).
2. **YAML syntax check of the workflow**, the only locally available
   correctness check for it:
   ```bash
   python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ok')"
   ```
3. **Manual trace of the Dockerfile**, since `docker build` cannot run in this
   sandbox: confirm every `COPY --from=<stage> <src> <dst>` source path exists
   in the stage it references, and that no stage references a file no earlier
   stage produced. State explicitly in the completion report that this is a
   manual trace, not an execution — do not claim the build "passes."
4. **`git diff --check`** for whitespace errors on the new files.
5. **State plainly, in the completion report and in `docs/backend.md`, that
   `docker build` and the CI workflow's `docker` job have not been executed
   anywhere in this session.** The first real proof either works is the
   commit's own CI run on `main`. If the user has `gh` authenticated or a
   remote to push to, offer to push and watch that run; do not claim success
   before it reports one.

## Where the result is recorded

**`docs/backend.md`**, which already owns "the deployment requirements" per
its own row in `AGENTS.md`'s index table:

- **§10** gains a new subsection under "Deployment: what a host must
  provide" — call it "§10.1 The Dockerfile and CI workflow" — recording: the
  four build stages and why each exists, the `@acres/shared` symlink
  resolution rule, the direct-`node`-vs-`npm run` CMD trade-off and the
  `version: null` consequence it already causes, the HEALTHCHECK, and that no
  registry push is configured. The line **"No provider manifest is created in
  this step — no Dockerfile, no CI workflow, no Terraform"** is now stale for
  two of its three items and must be corrected in the same change
  (`AGENTS.md` §10 rule 8), not left standing.
- **§11** gains this prompt's verification record — the four re-run commands'
  real output, the YAML check's output, and the explicit "not executed"
  statement for `docker build` per checks item 5 above.
- **§12**'s "Dockerfile, CI, Terraform, provider manifests" deferred row is
  split: Dockerfile and CI move out of the deferred table (they are now
  built); a narrower row — "Terraform / IaC, an actual registry + push,
  choosing a host to run the container" — replaces it, with the same "why":
  no hosting provider has been chosen.

## SKILLS USED

- `nestjs-best-practices` — already loaded this session; its
  `devops-graceful-shutdown` rule file was read in full and is the basis for
  the Dockerfile's direct-`node` `CMD` decision (documented above) rather than
  wrapping the entrypoint in `npm run`.
- `requesting-code-review` — dispatch a reviewer subagent after
  self-verification (§2.1 stage 1), before this prompt is recorded as done.
- `receiving-code-review` — evaluate that feedback with the same rigor as
  every other prompt (§2.1 stage 2).
- `caveman-commit` — the commit message for this change, per the ALWAYS rule
  reaffirmed 2026-08-20 (`AGENTS.md` §3).
- None of the design/frontend/GSAP/Tailwind/shadcn skills apply — this prompt
  touches no visual surface and no `client/` file.
