# Prompt 378 — Services routing and first preview deployment

## Scope and why this is next

Planning baseline: `872e911` on `main`, 2026-10-16; working tree clean before
this prompt. Parent: Phase 12 managed-target amendment, approved Prompt 370,
ordered steps 4–6. Prompts 371–377 implemented and verified all local runtime
prerequisites:
- Private Blob browser upload adapter and presigned protocol (Prompt 371)
- Sandbox scanner container evaluation and snapshot verification (Prompts 372–373)
- Invocation-safe transactional outbox (Prompt 374)
- Queue-retention job reconciliation (Prompt 375)
- Protected managed outbox dispatch runner, after-commit kicks, and Cron function entrypoint (Prompt 376)
- Shared managed API throttling and sweep cleanup via PostgreSQL (Prompt 377)

Up to this point, only synthetic probe deployments (`probes/queues`, `probe-platform.js`)
have run on Vercel. The actual Acres application (Next.js frontend + NestJS API
backend) has never been deployed, and no repository-level Vercel configuration
exists. The immediate next requirement recorded in `docs/vercel-deployment.md`
and `docs/build-plan.md` is the **first application preview deployment**.

Implement the unified Vercel Services and routing configuration in `vercel.json`,
wire internal service bindings (`ACRES_API_ORIGIN`) and background execution
entrypoints (`jobs.function.ts`, `dispatch.function.ts`), apply the pending
shared-throttling migration out-of-band to the preview Neon database, configure
the preview project environment with least-privilege credentials, deploy the
first preview deployment, and verify end-to-end hosted ingress, authentication,
direct Blob upload, Sandbox scanning, and Queues dispatch.

This is deployment of an isolated preview only; it authorizes no production
promotion, paid plan upgrades, or public release. Stop for phase-control
approval before execution.

## References and verified interfaces

Read at execution:

- `AGENTS.md`, especially §§2, 2.1, 3, 5–10 and phase-control commands.
- `docs/build-plan.md` managed-target amendment and Prompts 370–377;
  `docs/vercel-deployment.md` "Resume here", "Queues — 2026-10-15",
  "Target and gates", and checklist; `docs/adr/0001-vercel-managed-production.md`.
- `docs/backend.md`, `docs/security.md`, `docs/system-architecture.md`,
  `docs/operations.md`, and `docs/skills.md`.
- Official Vercel documentation verified live:
  * `https://vercel.com/docs/services`
  * `https://vercel.com/docs/services/routing`
  * `https://vercel.com/docs/services/bindings`
  * `https://vercel.com/docs/services/config-reference`
  * `https://vercel.com/docs/frameworks/backend/nestjs`
  * `https://vercel.com/docs/queues`
- `infra/vercel/probes/queues/vercel.json` (the verified prototype for service triggers and rewrites).
- `client/app/api/v1/[...path]/route.ts` and `client/lib/api/server.ts` (API proxy and SSR fetch using `process.env.ACRES_API_ORIGIN`).
- `server/src/vercel/jobs.function.ts` (Queues consumer entrypoint with `experimentalTriggers`).
- `server/src/vercel/dispatch.function.ts` (Cron dispatch entrypoint).
- `scripts/vercel/{neon-bootstrap.sh,neon-verify.sh,probe-platform.js,build-scanner-snapshot.js}`.
- Restricted secrets at `~/.config/acres/vercel-preview/` (`preview.env`, `neon-urls.env`, `scanner.env`).

Design references and breakpoint targets:
The existing application UI and responsive breakpoints (375 px, 800 px, 1280 px)
must remain unchanged. No visual changes, token alterations, or comp redesigns
are in scope.

## SKILLS USED

- `architecture-patterns` — clean isolation between `client` (Next.js) and `api` (NestJS) services over caller-declared bindings.
- `nestjs-best-practices` — function entrypoint detection, execution lifetimes, and error boundaries.
- `deployment-pipeline-design` — preview deployment orchestration, decoupled migration execution, and immutable releases.
- `api-design-principles` — strict top-level URL rewrite table, internal service isolation, and same-origin API proxying.
- `postgres-best-practices` — pool connection limits for runtime vs direct migrator connection, transaction-local tenant context.
- `secrets-management` — OIDC token precedence, sensitive environment variable classification, zero secrets in logs.
- `security-best-practices` — private service access without public route leakage, constant-time bearer secret check on cron, fail-closed behavior.
- `playwright` — real browser verification of the live deployed preview UI and presigned direct upload flow.
- `javascript-testing-patterns` — static configuration validation and unit tests for deployment artifacts.
- `e2e-testing-patterns` — live hosted verification of end-to-end user journeys (upload -> scan -> queue -> leased processing).
- `requesting-code-review` — stage 1 independent reviewer dispatch.
- `receiving-code-review` — stage 2 technical review evaluation and verification.
- `caveman-commit` — conventional commit formatting without AI trailers.

## Implementation sequence

1. **Vercel Services configuration (`vercel.json`).**
   Add root `vercel.json` configuring the two application services:
   - `client`:
     * `root: "client"`
     * `framework: "nextjs"`
     * `bindings`: declare service binding to `api`, exposing generated private URL as `ACRES_API_ORIGIN`.
   - `api`:
     * `root: "server"`
     * `functions`:
       - `src/main.ts`: Nest API function, explicit region `iad1`, `maxDuration: 30`.
       - `src/vercel/jobs.function.ts`: Queues consumer, explicit region `iad1`, `maxDuration: 60`, `experimentalTriggers: [{ type: "queue/v2beta", topic: "acres-jobs", retryAfterSeconds: 5 }]`. Explicitly omit `maxDeliveries` so retries remain governed by Acres' durable database ledger and lease timeouts, not premature platform termination.
       - `src/vercel/dispatch.function.ts`: protected Cron sweep function, explicit region `iad1`, `maxDuration: 60`.
   - `rewrites`:
     * `{ "source": "/cron/dispatch", "destination": { "service": "api", "path": "/src/vercel/dispatch.function.ts" } }`
     * `{ "source": "/(.*)", "destination": { "service": "client" } }`
     Top-level routing ensures all public traffic enters Next.js, which proxies `/api/v1/*` to `ACRES_API_ORIGIN` and handles Server Component data fetching over the private binding. The `api` service is unreachable directly from the public internet except via the protected `/cron/dispatch` route.
   - `crons`:
     * Declare `[{ "path": "/cron/dispatch", "schedule": "0 0 * * *" }]`. Note that on Vercel Hobby, Cron jobs run on production deployments only; preview testing exercises the endpoint via authenticated HTTP requests.

2. **Automated configuration validation.**
   Add a unit test (`scripts/ops/check-vercel-config.spec.js` or `scripts/vercel/check-vercel-config.spec.js`) that validates `vercel.json`:
   - Enforces valid JSON schema structure.
   - Verifies service roots (`client`, `server`), entrypoints, and bindings.
   - Asserts all function configurations pin region `iad1`.
   - Asserts `jobs.function.ts` has `queue/v2beta` trigger on `acres-jobs` and rejects any configuration declaring `maxDeliveries`.
   - Asserts top-level rewrites route `/(.*)` to `client` and `/cron/dispatch` to `api`.
   - Integrates the test into `npm run ops:templates-test` or `npm run vercel:probe-test`.

3. **Guarded out-of-band database migration.**
   - Before deploying runtime code, deploy the pending database migrations (including `20261016000000_shared_throttling`) to the preview Neon database using the direct migrator connection:
     ```bash
     (set -a; . ~/.config/acres/vercel-preview/neon-urls.env; set +a; \
       cd server && DATABASE_MIGRATION_URL="$DATABASE_MIGRATION_URL" npx prisma migrate deploy)
     ```
   - Run `scripts/vercel/neon-verify.sh` to confirm least-privilege runtime privileges, extension availability (PostGIS), and forced RLS integrity.

4. **Project environment reconciliation.**
   Reconcile preview environment variables on the `acres` project (`prj_q9ApajZWDgdYZetnm5s5oakEjrUD`):
   - Database: Set `DATABASE_URL` to the pooled `acres_app` connection URL. Ensure it is marked **sensitive**. Strip or mark sensitive any `NEON_OWNER_*` variables.
   - Storage: Set `STORAGE_PROVIDER=vercel-blob` and `BLOB_STORE_ID=store_g2fmCH5CW7TJbkN3`. Unset all S3 `STORAGE_*` variables. Remove `BLOB_READ_WRITE_TOKEN` so server SDK and client uploads use OIDC authentication directly.
   - Scanner: Check snapshot freshness from `~/.config/acres/vercel-preview/scanner.env`. If daily signatures are older than 48 hours or snapshot is nearing expiry, rebuild fresh snapshot with `scripts/vercel/build-scanner-snapshot.js --replace <old_snap_id>`. Set `SCANNER_PROVIDER=vercel-sandbox`, `SCANNER_SANDBOX_SNAPSHOT_ID`, `SCANNER_MAIN_SHA256`, `SCANNER_DAILY_SHA256`, and `SCANNER_MAX_SIGNATURE_AGE_HOURS=48`. Unset all `CLAMAV_*` variables.
   - Queues & Execution: Set `QUEUE_PROVIDER=vercel`, `CRON_SECRET` (≥32 random hex characters, matching local secret in `~/.config/acres/vercel-preview/cron.env`), and `NODE_ENV=production`.
   - Invariant: Confirm `AI_ENABLED=false` and no Gemini API keys exist.

5. **Deploy preview deployment.**
   Deploy from workspace root using Vercel CLI with Node 24:
   ```bash
   PATH=/tmp/acres-node24/node_modules/node-linux-x64/bin:$PATH npx vercel@latest deploy --yes
   ```
   Record the resulting immutable preview deployment URL and deployment ID (`dpl_...`).

6. **Hosted acceptance gates.**
   Execute structured verification against the deployed preview URL:
   - **Gate A: Ingress and public routing.**
     * `GET /` returns 200 OK with landing page HTML, valid metadata, and assets loaded.
     * `GET /login` and `/register` return 200 OK with interactive forms.
     * Direct request to internal function paths (e.g. `POST /api/jobs`, `POST /jobs.mjs`) returns 404 Not Found.
   - **Gate B: Protected Cron dispatch.**
     * `GET /cron/dispatch` without `Authorization` header returns 401 Unauthorized.
     * `GET /cron/dispatch` with `Authorization: Bearer <wrong>` returns 401 Unauthorized.
     * `GET /cron/dispatch` with `Authorization: Bearer <CRON_SECRET>` returns 200 OK with JSON `{ ok: true, sweep: { ... } }`.
   - **Gate C: Authenticated session and SSR.**
     * Register or log in with test operator credentials.
     * Navigate to `/app` dashboard; confirm SSR resolves `/app` shell and Server Components fetch from `api` via `ACRES_API_ORIGIN` binding.
   - **Gate D: Direct Blob upload and Sandbox scan.**
     * Initiate dataset upload in browser; verify `POST /api/v1/uploads` returns direct Blob presigned authorization.
     * Browser PUTs file directly to Vercel Blob store.
     * Complete upload triggers outbox event `upload.completed` via after-commit kick.
     * Verify outbox dispatches to Vercel Queues topic `acres-jobs`.
     * `jobs.function.ts` consumes message, boots Sandbox scanner VM with CVD signatures, executes ClamAV, updates database ledger, and verifies clean scan result.
   - **Gate E: Shared throttling across preview instances.**
     * Issue burst requests to `/api/v1/auth/csrf` and verify rate limit headers decrement and return 429 when exhausted.
     * Verify `ThrottleBucket` rows in Neon database reflect the shared counts.

7. **Review, documentation, and local commit.**
   - Self-verify all changes, run full local checks, and review git diff.
   - Dispatch an independent read-only reviewer via `requesting-code-review` subagent.
   - Evaluate reviewer feedback with `receiving-code-review`.
   - Document the preview deployment URL, deployment ID, verified gates, logs, and evidence in `docs/vercel-deployment.md`.
   - Synchronize `docs/build-plan.md` and `docs/backend.md`.
   - Commit locally to `main` using `caveman-commit`. Do not push.

## Acceptance criteria

- `vercel.json` exists at repository root, is valid, configures `client` and `api` services with the specified bindings and function settings, and passes the automated validation test.
- Migrations are applied to the preview Neon database out-of-band without runtime DDL privileges.
- The Acres application is successfully deployed to a Vercel preview deployment.
- Public traffic routes cleanly through Next.js; private service bindings allow Next.js SSR to reach NestJS without public internet exposure.
- Protected cron endpoint strictly enforces bearer authentication.
- End-to-end dataset upload, Blob direct upload, Sandbox malware scanning, and Queues job execution complete successfully on hosted infrastructure.
- All repository build, typecheck, lint, and test suites pass.

## Verification

Execute with Node 24.21.0:

```bash
npm run ops:templates-test
npm run vercel:probe-test
npm run lint
npm run build
npm run typecheck
npm run test:server
git diff --check
```

Record deployment commands, output excerpts, and hosted test results verbatim in `docs/vercel-deployment.md`.

## Non-goals, impact and rollback

- Non-goals: No production promotion; no paid tier upgrades; no custom domain assignment; no Resend domain purchase or unsolicited email; no changes to Compose/Caddy reference profile; no weakening of security boundaries or scanner bypass.
- Impact: Adds the root deployment specification for Vercel. Existing local development commands (`npm run dev`, `npm run dev:server`, `npm run dev:client`) and Docker Compose environments remain 100% operational and unchanged.
- Rollback: Reverting `vercel.json` and associated validation scripts cleanly removes Vercel deployment configuration. Hosted preview deployments can be deleted or left to expire without affecting database state. Database migrations are additive and forward-compatible.

## Review and completion

Dispatch an independent reviewer subagent with baseline/HEAD identities, prompt, all changes, `vercel.json`, and verification evidence. Evaluate feedback with technical rigor using `receiving-code-review`. Record results in `docs/vercel-deployment.md`, update `docs/build-plan.md`, and commit to `main` using `caveman-commit`.
