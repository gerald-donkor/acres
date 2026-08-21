# Step 8 — Scaffold the NestJS server and shared contracts

## Scope and why this is next

This is build-sequence **step 8** from `AGENTS.md` §8.2: create the backend
after the committed client split. `git log` resolves the client split as
committed at `5d9899a build: split client workspace`, and the repository now has
an npm-workspace root with the complete Next.js app in `client/`. The next
unbuilt dependency is therefore the NestJS runtime: `server/`,
`packages/shared`, the data layer, auth/accounts, scheduled jobs, and forms.

This step establishes the backend boundary **without changing the landing page
surface**. The frontend stays the completed static marketing UI; client
data-fetching and form wiring wait until there is a reviewed API contract to
consume.

> Citation convention (`AGENTS.md` §8.2): `§N` is a section of `AGENTS.md`,
> "step N" is a row of the §8.2 build sequence, `prompts/NN-…` is a third
> sequence. This file is `prompts/10-…` and implements **step 8**.

## Repository state verified while writing this prompt

Every line below was read or run on 2026-08-21. The implementation must not
re-derive them from memory, but **must** re-verify anything it changes.

| fact | evidence |
| --- | --- |
| `npm` **12.0.2**, Node **v26.7.0** | `npm -v`, `node -v` |
| root `package.json` declares `"workspaces": ["client"]` and exactly four scripts — `dev`, `build`, `start`, `lint` — each `npm run <x> --workspace=@acres/client` | `cat package.json` |
| **there is no root `typecheck` script**, and no root `tsconfig.json` | `cat package.json`; `ls` |
| **`npx tsc --noEmit` from the root type-checks nothing.** With no root tsconfig and no file arguments it prints the compiler banner and exits `0` | run at the root: output was `Version 5.9.3` + usage, `exit=0` |
| `client/package.json` has `dev`/`build`/`start`/`lint`, and **no `typecheck`** | `cat client/package.json` |
| `client/tsconfig.json` is `noEmit: true`, `strict: true`, `incremental: true`, `paths: { "@/*": ["./*"] }` | `cat client/tsconfig.json` |
| `client/eslint.config.mjs` is a flat config resolved **relative to `client/`** — it is not a root config and does not lint `server/` | `cat client/eslint.config.mjs` |
| **`.gitignore` ignores `.env*` globally**, with a single opt-in `!client/.env.example` | `cat .gitignore` |
| `.gitignore` ignores **`/node_modules` only at the root** — no nested workspace `node_modules/` rule, and no `dist/` rule | `cat .gitignore` |
| `docs/` holds `automation.md`, `chrome.md`, `components.md`, `design-system.md`, `landing.md`, `motion.md`, `polish.md`. **There is no `backend.md`** | `ls docs/` |

### Two stale lines this prompt must fix (§10 rule 8)

1. **`AGENTS.md` §8.1 states that "`npm run lint`, `npx tsc --noEmit`, and
   `npm run build` run from the root and are forwarded to `@acres/client`."**
   The `npx tsc --noEmit` half is false, as the table above shows — it forwards
   nothing and checks nothing. Fix that sentence in the same change that adds a
   real root `typecheck` script.
2. **`AGENTS.md` §8.1 ends "There is still no backend of any kind."** That
   becomes false the moment this prompt lands. Rewrite it, do not delete the
   snapshot.

Both edits are to §8.1 only. **Do not tick anything in §8.2** — that file
records the plan, not the progress (§8.2).

## Reference material read

- `AGENTS.md` §§2, 5–10 — especially §8.2 step 8, §9.2 server-by-default, §6
  (never reference a script name before it exists), and §10's no-fabrication
  rules.
- `docs/automation.md` §4 (`## 4. Step 7 Workspace Split`), read in full. §4.1
  ends: "`packages/shared`, `server/`, deployment manifests, Docker files, CI
  files, and NestJS host selection were explicitly deferred to step 8." §4.2
  records the verified workspace script form; §4.4 is the step-7 verification
  record.
- `package.json`, `client/package.json`, `client/tsconfig.json`,
  `client/eslint.config.mjs`, `.gitignore`, `README.md`.
- NestJS documentation pages consulted while preparing this prompt —
  `first-steps`, `cli/overview`, `techniques/configuration`,
  `techniques/validation`, `recipes/prisma`, `techniques/task-scheduling`,
  `security/cors`, `security/helmet`, `security/csrf` on `docs.nestjs.com`.

**Version pinning is deliberately not attempted here.** No Nest, Prisma,
Helmet, cookie, hashing or validation version is stated in this prompt, because
none was installed at the time of writing and §10 rule 2 forbids writing an
unverified API. The implementation resolves every version and every API from
`node_modules/`, `--help` output, or docs fetched in that session, and records
the resolved versions in `docs/backend.md`.

## SKILLS USED

- `requesting-code-review` — dispatch the reviewer subagent after all backend
  checks pass, with this prompt, `BASE_SHA`, `HEAD_SHA`, and exact command
  output (§2 step 11, §2.1).
- `receiving-code-review` — verify every reviewer finding against the actual
  workspace and this prompt's non-goals before implementing any fix.
- `caveman-commit` — write the commit message (§3, §7). Mandatory, no
  exceptions.
- `vercel-react-best-practices` — load **only if** the implementation ends up
  touching anything under `client/` beyond `client/package.json` scripts. It
  should not, per Non-goals.

No UI, styling, Tailwind token, shadcn primitive, GSAP motion, accessibility
surface or route transition changes in this step, so `frontend-design`, the
Tailwind skills, `shadcn`, the GSAP skills, `web-design-guidelines` and
`vercel-react-view-transitions` own no surface here. **If implementation finds
itself touching one of those surfaces, stop, load the skill, and say why the
scope moved** (§2 step 2).

There is **no installed skill covering NestJS, Prisma, or session auth.** Say so
explicitly in the implementation reply rather than proceeding silently (§2
step 2); those surfaces are covered by live docs read in-session instead.

## Backend decisions for this step

### Runtime and package layout

- Add `server/` as a second npm workspace named `@acres/server`.
- Add `packages/shared/` as a third workspace named `@acres/shared`.
- The repository root stays the coordinator. Existing root `dev`, `lint`,
  `build`, `start` must keep working exactly as they do now.
- TypeScript throughout, `strict: true` in both new workspaces.
- Use Nest's **default Express platform**. Do not choose Fastify: the security,
  CSRF, cookie and Helmet guidance read for this prompt was the Express default,
  and swapping the platform invalidates it. Changing platform is a prompt
  amendment, not an implementation judgement call.

### Deployment host decision

Record in `docs/backend.md`: the backend is designed as a **long-lived Node
container service**, not a Vercel serverless function, because the confirmed
scope includes sessions and scheduled jobs. **Do not create a provider-specific
deployment manifest in this step** (§8.2 defers it). Instead ship a
host-portable production start contract —
`npm run start --workspace=@acres/server` — and document what any later host
must provide:

- a long-lived Node process;
- persistent outbound network access to the database;
- environment variable injection;
- a health-checkable HTTP port;
- **exactly one active scheduler instance in production**, or a documented
  provider primitive that replaces in-process scheduling.

That last one is the real constraint: `@nestjs/schedule` runs in-process, so
horizontally scaling the server multiplies every cron job. Record it as a
known operational constraint, not as solved.

### Database

- **Prisma + PostgreSQL** is the production data-layer target. Accounts,
  sessions, regions, metrics, reports, submissions and job runs are relational,
  and Prisma is the official Nest recipe read for this prompt.
- **Do not switch the provider to SQLite.** If no local Postgres is available,
  the implementation still gets full value from `prisma validate` and
  `prisma generate`, neither of which needs a running server. A provider swap
  would change the generated types and the migration history for the sake of a
  local convenience.
- **Do not connect to, migrate, or seed a remote database.** No credentials have
  been supplied. `DATABASE_URL` lives in `server/.env.example` as a documented
  placeholder only.
- Decide and record **one** of: commit a first migration generated against a
  local Postgres, or commit `schema.prisma` alone and defer migration
  generation. Do not fabricate a migration SQL file by hand.

### Auth and accounts

- First-party **email/password accounts with opaque, cookie-backed sessions**.
  Not JWT bearer auth — the product contract says "auth with sessions", and a
  browser session that can be revoked server-side is the point.
- Store **password hashes only**, never plaintext. Record the chosen hashing
  library and its parameters in `docs/backend.md`.
- Store **hashed session tokens only**. The raw token exists in the `HttpOnly`
  cookie and in request handling, never at rest.
- Cookies: `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` outside local
  development.
- **CSRF is a blocking gate.** Ship either a working CSRF defence for the
  cookie-authenticated mutation endpoints, or a written mitigation record in
  `docs/backend.md` naming exactly what protects those routes and what does not.
  If the middleware cannot be verified from current docs, **stop and report the
  gap** rather than routing around it (§10 rule 9).

### Forms and jobs

- Implement a minimal contact/lead submission API for the landing page's future
  form work. **Do not add a form to the landing page.**
- Implement scheduled-job infrastructure plus **one bookkeeping job** that
  writes a `JobRun` row, proving the scheduler is wired without inventing an
  external data provider.
- Record the ingestion boundary: regional-data import jobs are ready to call a
  provider adapter; **no provider is invented, named, or stubbed with fake
  regional intelligence** (§10 rule 9, §8 "its numbers are illustration").

## Expected workspace shape

```text
AGENTS.md
README.md
client/
docs/
  backend.md          # new
package.json
package-lock.json
packages/
  shared/
    package.json
    src/
    tsconfig.json
server/
  package.json
  prisma/
    schema.prisma
  src/
  test/               # only if the verified Nest scaffold generates it
  tsconfig.json
  tsconfig.build.json
  .env.example
```

The root `node_modules/` stays the only installed tree. **No workspace
`node_modules/` is committed** — and note that `.gitignore` currently only
ignores `/node_modules` at the root, so this needs the rule added below.

## `.gitignore` changes — required, and one of them is a silent trap

Verified against the current file. Without these, the step commits wrong.

1. **`server/.env.example` will be silently ignored.** `.gitignore` has a
   global `.env*` rule with exactly one opt-in, `!client/.env.example`. Add
   `!server/.env.example` alongside it, with a comment matching the existing
   one's style (it explains why the opt-in carries no secret). **Then confirm
   with `git check-ignore -v server/.env.example` that it is no longer
   ignored** — an ignored `.env.example` fails silently and the next session
   inherits an undocumented environment.
2. Nested workspace `node_modules/`: change the root-anchored `/node_modules`
   to also cover `server/node_modules/`, `packages/*/node_modules/` and
   `client/node_modules/`, or add explicit rules. npm hoists, but native
   dependencies do create nested trees.
3. Build output: `server/dist/` and `packages/shared/dist/` (name whatever the
   verified scaffold actually emits — read it, do not assume `dist`).
4. Prisma's generated client, **only if** it is generated inside the repo tree
   rather than into `node_modules/.prisma`. Check where it lands before adding
   a rule for a path that does not exist.

`*.tsbuildinfo` is already ignored globally; no new rule is needed for it.

## Root package scripts

Verify the `--workspace` syntax against npm 12.0.2 before editing
(`npm run --help`). Target shape:

```json
{
  "workspaces": ["client", "server", "packages/shared"],
  "scripts": {
    "dev": "npm run dev --workspace=@acres/client",
    "dev:client": "npm run dev --workspace=@acres/client",
    "dev:server": "npm run start:dev --workspace=@acres/server",
    "build": "npm run build --workspace=@acres/shared && npm run build --workspace=@acres/client && npm run build --workspace=@acres/server",
    "build:shared": "npm run build --workspace=@acres/shared",
    "build:client": "npm run build --workspace=@acres/client",
    "build:server": "npm run build --workspace=@acres/server",
    "start": "npm run start --workspace=@acres/client",
    "start:server": "npm run start --workspace=@acres/server",
    "lint": "npm run lint --workspace=@acres/client && npm run lint --workspace=@acres/shared && npm run lint --workspace=@acres/server",
    "typecheck": "npm run typecheck --workspace=@acres/shared && npm run typecheck --workspace=@acres/client && npm run typecheck --workspace=@acres/server"
  }
}
```

Notes that are not optional:

- **`build` builds `@acres/shared` first**, because `@acres/server` imports it.
  Client order is irrelevant today (it does not consume shared) but shared-first
  is the order that stays correct when it does.
- **`typecheck` is a new script name and does not exist today** (§6: never
  reference a script name before it exists — this prompt is where it is added).
  It requires **adding a `typecheck` script to `client/package.json`**
  (`tsc --noEmit`), which is the *only* permitted change under `client/` in this
  step. Do not use `npx tsc --noEmit -p client/tsconfig.json` from the root:
  `client/tsconfig.json` uses `paths` and the Next plugin, and running it from
  a different cwd is a needless second code path.
- `lint` requires a real `lint` script in **both** new workspaces.
  `client/eslint.config.mjs` is client-scoped and lints nothing outside
  `client/` — `server/` and `packages/shared/` each need their own flat config.
  The verified Nest scaffold generates one for `server/`; write a minimal one
  for `packages/shared/` rather than leaving a `lint` script that lints zero
  files while appearing to pass.
- **Do not add Turborepo or any other task runner.** Step 7 settled npm
  workspaces (§8.2).
- If `&&` composition is replaced by a more portable npm form, record the exact
  decision and the reason in `docs/backend.md`.

## Shared package contract

`packages/shared` is a buildable TypeScript package with **no React and no
browser-only dependency**. It holds the contracts both sides can read.

Resolve and record, from verified sources rather than memory:

- the `exports` / `main` / `types` field shape that lets both a Next 16 client
  (`moduleResolution: "bundler"`) and a Nest server (CommonJS or NodeNext —
  read what the scaffold emits) import it;
- whether the server consumes built output or source, and why.

Required exports:

- account/session: `RegisterAccountInput`, `LoginInput`, `AccountProfile`,
  `SessionProfile`
- regional data: `RegionSummary`, `RegionalMetric`, `InsightReportSummary`
- forms: `ContactSubmissionInput`, `ContactSubmissionReceipt`
- jobs: `JobRunSummary`, `JobRunStatus`
- API envelopes: a success envelope type, and an error envelope with stable
  `code` and `message` fields

Constraints:

- **`client/` does not depend on `@acres/shared` in this step.** The package is
  created and built, and the client is left alone; wiring the client to the API
  is a later prompt. Adding the dependency now would put an unused package in
  the client's tree for no verified benefit (§8.2 "do not overbuild").
- Add `zod` or another runtime-schema library **only** if it is verified in
  session and its need is recorded. If it is added, validation constants live in
  `packages/shared` and are not duplicated in `server/`.
- Nest's `ValidationPipe` needs **concrete DTO classes** — type-only imports are
  erased at runtime. Keep the decorated, server-only DTO classes in `server/`
  and let them satisfy the shared interfaces; **never import a decorated
  server DTO into client-readable code.**

## Server modules and routes

Follow the verified Nest CLI output for file conventions, with these explicit
domain modules:

```text
server/src/
  main.ts
  app.module.ts
  config/
  prisma/
  health/
  accounts/
  auth/
  regions/
  forms/
  jobs/
```

Required HTTP surface:

| method | path | auth | behaviour |
| --- | --- | --- | --- |
| `GET` | `/health` | public | service name, version if available, `"ok"` status |
| `POST` | `/auth/register` | public + CSRF | creates account, starts session, returns `SessionProfile` |
| `POST` | `/auth/login` | public + CSRF | verifies credentials, starts session, returns `SessionProfile` |
| `POST` | `/auth/logout` | session | revokes current session, clears cookie |
| `GET` | `/auth/session` | optional session | current profile, or an unauthenticated result |
| `GET` | `/account` | session | `AccountProfile` |
| `GET` | `/regions` | public | region summaries from the database |
| `GET` | `/regions/:slug` | public | one region summary, or 404 |
| `POST` | `/forms/contact` | public + CSRF | stores submission, returns receipt |
| `GET` | `/jobs/runs` | session | recent job runs |

- Login failure and registration on an existing email must **not** reveal
  whether an account exists — return the same generic failure shape.
- `/jobs/runs` stays behind the session guard. Role-based authorization is a
  future prompt; record that, and **do not expose job internals publicly**.
- Controllers stay thin; persistence and business logic live in services
  (`AGENTS.md` §9.2's server-first discipline applied to Nest).

## Prisma schema requirements

First-pass schema supporting the route surface, with no external-provider
assumptions:

- **`Account`** — id, email (unique), passwordHash, displayName?, createdAt,
  updatedAt
- **`Session`** — id, accountId, tokenHash (unique), expiresAt, createdAt,
  revokedAt?
- **`Region`** — id, slug (unique), name, countryCode?, summary?, createdAt,
  updatedAt
- **`RegionalMetric`** — id, regionId, key, label, value, unit?, periodStart?,
  periodEnd?, source?, createdAt
- **`InsightReport`** — id, regionId?, title, summary, status, createdAt,
  updatedAt
- **`ContactSubmission`** — id, name, email, organization?, message, source,
  createdAt
- **`JobRun`** — id, jobName, status, startedAt, finishedAt?, message?

Indexes on the lookup paths: `Account.email`, `Session.tokenHash`,
`Region.slug`, `RegionalMetric(regionId, key)`, `InsightReport(regionId,
status)`, `ContactSubmission.email`, `JobRun(jobName, status, startedAt)`.

Use ID generation suitable for PostgreSQL, and record which (`uuid`, `cuid`,
`autoincrement`) and why. **Add no seed data that could be mistaken for real
regional intelligence** (§8).

## Implementation sequence

1. `BASE_SHA=$(git rev-parse HEAD)`; `git status --short`. The tree should show
   only this prompt file. **Stop and ask if unrelated user changes appear.**
2. Verify Nest CLI commands and every dependency version from official docs,
   `npx @nestjs/cli --help`, `npm view`, or generated package metadata. Record
   the resolved versions in `docs/backend.md`.
3. Scaffold `server/` in strict TypeScript mode using the verified Nest CLI. If
   CLI flags cannot produce the workspace shape without unrelated churn,
   scaffold into the scratch directory, inspect it, then copy in only what is
   needed — non-destructively, never over an existing file unseen.
4. Create `packages/shared/` and wire all three workspaces into the root
   `workspaces` array.
5. Update the root scripts, and add `typecheck` to `client/package.json`.
   Confirm `npm run dev`, `npm run lint`, `npm run build` and `npm run start`
   still behave as they do today.
6. Apply the four `.gitignore` changes, then run
   `git check-ignore -v server/.env.example` and confirm it reports nothing.
7. Install from the repository root only. Expected dependency families —
   each one justified by name and version in `docs/backend.md`:
   Nest core/platform/config/schedule; Prisma CLI + client; the validation
   packages the Nest docs specify; Helmet, cookie and password-hashing
   packages; and whatever the verified scaffold requires for TypeScript, lint
   and tests.
8. Configure `server/src/main.ts`, in the order the security docs specify:
   Helmet before routes; CORS restricted to `CLIENT_ORIGIN` with credentials
   enabled for cookie auth; cookie/session middleware; the global
   `ValidationPipe` with `whitelist` and `transform`; listen on `PORT`,
   defaulting to **3001** so it never collides with the client's 3000.
9. Config loading and validation. `server/.env.example` must document:
   `PORT=3001`, `CLIENT_ORIGIN=http://localhost:3000`,
   `DATABASE_URL=postgresql://…` (placeholder),
   `SESSION_COOKIE_NAME=acres_session`, `SESSION_SECRET=change-me`,
   `SESSION_TTL_DAYS=30`, plus any CSRF or scheduler flag the implementation
   introduces. **Fail fast at boot on a missing required variable** rather than
   starting a server that 500s on first request.
10. Prisma module/service, `schema.prisma`, and the generate/migrate scripts.
    Run `prisma validate` and `prisma generate`; **run no migration against a
    remote database.**
11. Implement health, config, accounts, auth, regions, forms and jobs with
    typed DTO boundaries.
12. Tests, if the verified scaffold ships a runner. Minimum coverage: health
    response; registration validation rejection; login failure; session-guard
    rejection of an unauthenticated request; contact-submission validation;
    `/regions/:slug` 404. If the generated runner is missing or broken, record
    the gap in `docs/backend.md` and **do not claim tests passed** (§10 rule 3).
13. Update `README.md` with the new root commands and the two-server local
    workflow (client 3000, server 3001). Keep every existing client
    instruction.
14. Write `docs/backend.md`, add its row to the `AGENTS.md` project-notes index
    table, and **fix the two stale `AGENTS.md` §8.1 lines identified above** in
    this same change. `docs/backend.md` records: scaffold source and resolved
    versions; workspace scripts; module/route map; Prisma model summary;
    auth/session/cookie/CSRF decisions and the hashing parameters; the
    deployment host requirements and the single-scheduler constraint;
    environment variables; every check run with its exact output; deferred work
    and non-goals.
15. Sweep for stale statements. After this step, no file may claim the project
    has "no backend" except a historical `prompts/` file or an explicitly dated
    snapshot.

### Stop-and-ask gates

Do not route around any of these (§10 rule 9) — report and stop:

- the CSRF middleware cannot be verified from current docs;
- the Nest scaffold cannot produce a workspace-compatible layout without
  restructuring `client/` or the root;
- `@acres/shared` cannot be consumed by the server without changing
  `client/tsconfig.json`;
- any check in the list below fails for a reason this prompt does not cover.

## Reference deltas

No visual comp delta: nothing visual is implemented. The product/API deltas
against the references (§0) are:

- The comps specify no contact-form endpoint. This prompt builds the endpoint
  and **no** landing-page form UI.
- The comps specify no regional-data provider and no real metrics. This prompt
  builds the storage and API boundary and invents **no** provider data.
- The comps specify no auth UI. This prompt builds account/session APIs and
  **no** login or register screen.

## Breakpoint behaviour

No UI breakpoint behaviour changes. At 375, 800 and 1280 CSS px the landing page
is byte-identical output, because `client/app/` and `client/components/` are
untouched. The only permitted `client/` edit is the `typecheck` script in
`client/package.json`, which cannot affect rendering. If a visual check is
wanted, `docs/automation.md` §3 has the headless screenshot recipe — but the
diff review in the checks below is the actual evidence.

## Expected impact

- The root gains a real backend workspace and a shared contract package.
- `client/` stays buildable and visually unchanged.
- Root install / lint / typecheck / build cover all three workspaces, and
  `typecheck` becomes a real check for the first time.
- No Next.js route changes.
- A backend dev server runs separately at `http://localhost:3001` unless `PORT`
  is set.

## Non-goals

- No deployment to any provider.
- No Dockerfile, CI workflow, Kubernetes manifest, Terraform, or provider CLI
  setup.
- No client page, component, copy, visual, Tailwind, shadcn or GSAP change —
  the sole exception is the `typecheck` script in `client/package.json`.
- No `@acres/shared` dependency added to `client/`.
- No real regional-data ingestion provider, and no seeded fake regional data.
- No analytics, billing, CMS, email delivery, or admin dashboard.
- No OAuth or social login.
- No role/permission system beyond the minimum that keeps `/jobs/runs`
  non-public.
- No migration run against a real remote database.
- No Turborepo or alternative task runner.

## Checks to run

From the repository root. **Quote the real output** in `docs/backend.md` and in
the implementation reply (§6, §10 rule 3).

```bash
npm install
npm run lint
npm run typecheck
npm run build
```

Then the server smoke test. `npm run start:server` blocks, so it is **not** run
as a bare foreground command — start it detached, poll, assert, and stop it:

```bash
npm run start:server > /tmp/acres-server.log 2>&1 &
SERVER_PID=$!
# poll rather than sleeping blind
for i in $(seq 1 30); do curl -fsS http://localhost:3001/health && break; sleep 1; done
curl -isS http://localhost:3001/health
kill "$SERVER_PID"
```

Quote the `/health` status line and body. If port 3001 is occupied, set `PORT`
to a free one and say which (`docs/automation.md` records the port gotchas).
Also run the server workspace's test command **if one exists after
scaffolding**; if no test script exists, say so and claim nothing.

Then the diff review:

```bash
git diff --check
git status --short
git diff --stat
```

Confirm from `git status --short` that `server/.env.example` is **staged, not
ignored**, and that no `node_modules/`, `dist/` or `.env` file is tracked.

## Review and commit

Mandatory two-stage loop (§2 steps 11–14, §2.1, §3):

1. **`requesting-code-review`** — dispatch the reviewer subagent with:
   - what was built: "Scaffolded the Acres NestJS backend, `@acres/shared`
     contracts, the Prisma schema, and the auth/session/forms/jobs foundation,
     plus `docs/backend.md`";
   - requirements: this prompt file and `AGENTS.md` §8.2 step 8;
   - `BASE_SHA` from sequence step 1 and the current `HEAD_SHA`;
   - every check above with its exact output.
2. **`receiving-code-review`** — verify each finding against the codebase and
   against this prompt's Non-goals before changing anything. Push back with
   technical reasoning where a finding is wrong; never performative agreement.
   Fix blocking issues first, re-run the affected checks, and request a
   **re-review** if any fix touches the module structure, the route surface, the
   auth model, or the Prisma schema.

Then commit to `main` with a message written by **`caveman-commit`**. Do not
push.
