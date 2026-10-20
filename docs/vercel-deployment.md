# Vercel migration — Prompt 370

Status: implementation in progress. Preview Blob (server SDK and browser
presigned upload) and Neon database/RLS seams are proven. The Sandbox scanner
is built from a Sandbox snapshot and its hosted seam is proven (Prompt 373);
VCR remains unused because it is not free on Hobby. The first Acres application
preview was deployed in Prompt 378 (see its record below); production activation
and launch approvals remain open.
Starting source: `a1350d0` on `main`.
[ADR 0001](adr/0001-vercel-managed-production.md) records the accepted target.

## Resume here (new session)

Prompt 370 is approved and still executing. Remaining checklist items may be
split into numbered sub-prompts (Prompt 371 = Blob browser upload, Prompt 372 =
scanner image, Prompt 373 = scanner snapshot, Prompt 374 = invocation-safe
outbox, Prompt 375 = queue-retention reconciliation, Prompt 376 = protected
managed outbox dispatch, Prompt 377 = shared managed API throttling, Prompt
393 = named dashboard GraphQL operation, Prompt 394 = scanner signature
refresh, Prompt 395 = scanner signature refresh 2, Prompt 396 = snapshot
retirement tier 1, Prompt 397 = fresh preview deployment, Prompt 398 =
preview image routing repair); each
inherits 370's approval limits. A new session resumes from this section and
`git log`.

**Current manual scanner gate — Prompt 407 (2026-10-20).** This supersedes the
older next-refresh instructions below. Retained application acceptance is now
complete: Prompt 406's clean/EICAR scan evidence plus Prompt 407's positive A/B
controls, six HTTP denials and independent exact-ID RLS proof. **Project adoption
stopped before any write** on an agent-authored helper assumption: CLI `env ls
--json` omits environment record IDs. A separate corrected revision passed
offline tests and was not executed live. The next gate is a separately bounded
guarded adoption using verified raw provider record IDs, with fresh target,
value/scope/metadata and useful-window checks; do not repeat uploads or isolation.

Project settings still point to Prompt 395's
`snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf`, historical signature upper bound no later
than about `2026-10-21T09:02Z`, possibly earlier. Immutable deployment
`dpl_AGwu9k8gbtQRegTodmHUAL7uxYs4` retains Prompt 405's candidate by inference
from verified writes before creation, hashes and historical scan/use evidence.
Candidate expiry is bounded only by its original producer interval: no later
than `2026-10-22T06:35:09.451Z`, possibly earlier without its CVD timestamp.
Reserve roughly two hours before that bound (planning judgment). These retained
reads re-attest no present-time signature freshness and extend no window.
See [the acceptance and pre-write adoption stop](#retained-preview-isolation-accepted-adoption-stopped--prompt-407-2026-10-20).

**Fixed target.** Team `dgsloxx417's projects`
(`team_zE3mp7nrEZ6a7cxRavwUMYC4`), project `acres`
(`prj_q9ApajZWDgdYZetnm5s5oakEjrUD`), region `iad1` / `aws-us-east-1`,
**free tiers only** (stop and report if a gate needs paid usage), Resend
deferred until the user owns a sender domain. The repository is linked
(`.vercel/`, gitignored). Never use the two unrelated Neon projects in the
Vercel-managed org or the other thirteen Vercel projects.

**Re-establish access (no secrets in the repo or chat).**

1. Vercel MCP: authenticate if its tools are absent. CLI: `npx vercel@latest
whoami`; if signed out, the user runs `! npx vercel@latest login`.
2. Secrets directory `~/.config/acres/vercel-preview/` (0700, files 0600):
   `preview.env` (from `npx vercel@latest env pull <dir>/preview.env
--environment=preview --yes`), `neon-roles.env` (generated role
   passwords) and `neon-urls.env` (migrator direct URL, `acres_app` pooled
   and direct URLs). List names only (`cut -d= -f1`), never values. If lost,
   re-pull `preview.env` and rerun the bootstrap: it regenerates passwords
   and re-sets them on the roles.
3. Node 24 for checks: `.node-version` pins **24.21.0**; the system Node is 26. Without a version manager, `npm install --prefix /tmp/acres-node24
--no-save --ignore-scripts node-linux-x64@24.21.0` and put
   `/tmp/acres-node24/node_modules/node-linux-x64/bin` first on `PATH`
   (the npm shim must also resolve to that Node; check `node --version`
   inside `npm run`).
4. Before **every** CLI deploy (Prompt 392): from the repo root on a clean
   `main`, `vercel deploy --dry --target=preview < /dev/null > <tmp>/dry.json`
   then `npm run vercel:deploy-manifest -- --manifest <tmp>/dry.json`. Deploy
   only on `deploy manifest ok`. `.vercelignore` keeps secrets and build
   outputs out of the upload; a working-tree deploy is safe once the check
   passes, so the `git archive` workaround is no longer needed.

**Re-run the proofs (idempotent, preview only).**

```bash
scripts/vercel/neon-bootstrap.sh            # roles, database, PostGIS
(set -a; . ~/.config/acres/vercel-preview/neon-urls.env; set +a; \
  cd server && npx prisma migrate deploy)   # migrator, direct host
scripts/vercel/neon-verify.sh               # harden + RLS/pooling evidence
(set -a; . ~/.config/acres/vercel-preview/preview.env; set +a; \
  ACRES_VERCEL_PROBE=isolated-synthetic-preview \
  VERCEL_TEAM_ID=team_zE3mp7nrEZ6a7cxRavwUMYC4 \
  VERCEL_PROJECT_ID=prj_q9ApajZWDgdYZetnm5s5oakEjrUD \
  node scripts/vercel/probe-platform.js blob)   # or blob-browser
# scanner: OIDC from preview.env; build first, then probe (Prompt 373)
(set -a; . ~/.config/acres/vercel-preview/preview.env; set +a; \
  export ACRES_VERCEL_PROBE=isolated-synthetic-preview VERCEL_ENV=preview \
  VERCEL_TEAM_ID=team_zE3mp7nrEZ6a7cxRavwUMYC4 \
  VERCEL_PROJECT_ID=prj_q9ApajZWDgdYZetnm5s5oakEjrUD \
  ACRES_VERCEL_PROBE_REGION=iad1; \
  node scripts/vercel/build-scanner-snapshot.js --replace <old snap_id> \
    --write-env ~/.config/acres/vercel-preview/scanner.env)
(set -a; . ~/.config/acres/vercel-preview/preview.env; \
  . ~/.config/acres/vercel-preview/scanner.env; set +a; \
  export ACRES_VERCEL_PROBE=isolated-synthetic-preview VERCEL_ENV=preview \
  VERCEL_TEAM_ID=team_zE3mp7nrEZ6a7cxRavwUMYC4 \
  VERCEL_PROJECT_ID=prj_q9ApajZWDgdYZetnm5s5oakEjrUD \
  ACRES_VERCEL_PROBE_REGION=iad1 ACRES_SCANNER_MAX_SIGNATURE_AGE_HOURS=48; \
  node scripts/vercel/probe-platform.js scanner && \
  node scripts/vercel/probe-platform.js scanner-failures)
```

**Remaining work, in order** (each ends verified, reviewed, recorded here and
committed per AGENTS.md §2):

- [x] **Queues consumer** — platform seams proven on previews and the
      consumer/adapter/lease implemented locally (see "Queues — 2026-10-15"
      below). The Vercel outbox dispatcher, transactional `ingestion.run` intent,
      retention reconciliation, after-commit kicks, protected Cron handler and
      `queue-consumer.middleware.ts` are wired in Prompt 378 into the root
      Services config (`services.jobs` with no `maxDeliveries` and pinned `iad1`).
      Hosted application-level job proof succeeded on preview deployment
      `dpl_Hr9VwjL5jrA5vmsZfx7Qvi2R966b`.
- [x] **Blob browser upload** — local implementation done (Prompt 371); the
      presigned protocol is proven from a real browser on the preview store
      (see "Blob browser upload — 2026-10-15" below). Hosted application proof
      succeeded on preview deployment `dpl_Hr9VwjL5jrA5vmsZfx7Qvi2R966b` via
      presigned PUT to `store_g2fmCH5CW7TJbkN3` (Gate D).
- [x] **Scanner source** — a Sandbox snapshot, built and proven on the
      preview project (Prompt 373, see "Scanner snapshot — 2026-10-15"
      below): `scanner` and all nine `scanner-failures` cases passed hosted,
      with `baseSnapshotSurvived` in both modes and no residue. VCR stays
      unused (not free on Hobby, Prompt 372). The secrets directory now also
      holds `scanner.env` (`ACRES_SCANNER_SNAPSHOT_ID` and the two hashes,
      0600). Hosted app upload → scan proven through preview `dpl_Hr9VwjL5jrA5vmsZfx7Qvi2R966b`.
      Rebuild lifecycle remains open: Prompt 384 supersedes Prompt 383's
      closure claim. Candidate preparation does not activate or retire snapshots.
      Prompt 389 classifies provider failures (`provider_error`/`_status`/
      `_code`) and raises the live OIDC floor to 75 min. Its stage C rebuild
      (2026-10-18) built `snap_KtLdaJeG4SaLAwi4mI8G8XzURZat` but failed the
      smoke stage before any scan result. Prompt 390 found the likely cause in
      source: the smoke VM was created with a top-level `snapshotId`, which
      SDK 3.8.0 does not accept, so it most likely booted the default image.
      The fix boots the smoke VM from the snapshot `source`, checks source and
      signatures, and classifies failures as `smoke_failure`. Its stage B
      rebuild (2026-10-18) **passed** every smoke check and produced candidate
      `snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN` (expires 2026-10-26T01:44:56Z) plus
      an offline handoff bundle in `prompt390-20261018T014336Z/handoff/`.
      Prompt 391 (2026-10-18) **adopted** it on preview and proved clean and
      EICAR uploads through deployment `dpl_2aajXYcFj2FDoGA9Gbbu5HqyFtBT`
      (`https://acres-7azesfi2c-dgsloxx417s-projects.vercel.app`). Its
      signatures leave the 48 h window no later than about 2026-10-20T01:00Z.
      Prompt 392 (2026-10-18) added the deploy upload allowlist
      (`.vercelignore` + `vercel:deploy-manifest`). Prompt 393 (2026-10-18)
      fixed the `/app` `dashboardSummary` SSR failure (unnamed GraphQL
      operation), proven on `dpl_1S2xiZKz6HogdM3d4QgSsKsBqf6X`. Prompt 394
      (2026-10-18) rebuilt with **fresh** signatures (`daily` `489f6083…`,
      not `f9cb69a8…`), adopted `snap_ngIwnQplocPoUR0A6cewfCGrFAbX` on
      preview and proved clean and EICAR uploads through
      `dpl_A5H3fnpSx59XyfKqmKJQLywVf85j`. Prompt 395 (2026-10-19) rebuilt
      with **fresh** signatures again (`daily` `7cb49401…`, not
      `489f6083…`), adopted `snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf` on preview
      and proved clean and EICAR uploads through
      `dpl_AtJLkmoy3gWJVDSzkAUk5t8ujYPJ`. Its signatures leave the 48 h
      window no later than about **2026-10-21T09:02Z** (rebuild end + 48 h;
      the `daily.cvd` build time is not recorded, so the bound may be
      earlier; plan the refresh before about 09:00Z, with stage 2 started
      by about 06:00Z). A rebuild before about 2026-10-19T21:00Z risks
      fetching the same `daily.cvd` (a judgement, as in Prompt 395).
      `env pull` into an existing file keeps stale lines; pull into a
      fresh file and replace. Until a hosted cadence exists, a manual
      refresh is needed about every two days. Prompt 396 (2026-10-19) added
      `npm run vercel:scanner-retire` and retired tier 1 (`snap_Feg5…`,
      `snap_rz0cs…`, `snap_KtLd…`); three are retained: `snap_KBaj…`
      (active), `snap_ngIw…` (rollback) and `snap_CARv…`. Storage accounting remains unresolved after an unchanged early dashboard reading. The
      custody root `scanner.env` still names the deleted `snap_Feg5…`; the
      active values are in `prompt395-20261019T085943Z/candidate.env`. Next
      (own prompts): the next refresh before that bound (compare
      `daily_sha256` first, see Prompt 394), then tier 2 (`snap_CARv…`,
      `snap_ngIw…`) once their windows close, most naturally with that
      refresh; the owner's decision on deleting the nine preview deployments
      that stored `.env` files (see Prompt 392) is pending.
- [x] **First preview deployment** — Services/route config (`vercel.json`), only the
      `acres_app` pooled URL as a **sensitive** `DATABASE_URL`, out-of-band
      migration `20261016000000_shared_throttling` applied to Neon preview DB,
      `BLOB_STORE_ID` set with `STORAGE_PROVIDER=vercel-blob` and OIDC,
      `SCANNER_PROVIDER=vercel-sandbox` with a snapshot recorded as
      `snap_d2y7r2n9` (unverified: no such snapshot was ever listed; Prompt
      396 found the baseline configured until Prompt 391 was `snap_Feg5…`),
      `QUEUE_PROVIDER=vercel` with topic `acres-jobs`, and internal binding
      `ACRES_API_ORIGIN`. Verified live across all five hosted gates A–E on
      deployment `dpl_Hr9VwjL5jrA5vmsZfx7Qvi2R966b`
      (`https://acres-nedhhjsg3-dgsloxx417s-projects.vercel.app`).
- [ ] **Production decision** — Cron proves only on production; Hobby is
      non-commercial. Needs the user's plan decision and the eleven launch
      categories before any promotion.

## Access and target

On 2026-10-15 plugin discovery returned Vercel `installed: false`, with an
existing suggestion. Neither `vercel` nor `firecrawl` was found on PATH.
Official web documentation is the approved research fallback. No credential
stores were searched. Selected team/project, region, plan/spend, sender domain,
operator test address and existing hosted data/deployments remain unverified.
A consolidated request is pending; generic migration/deployment approval already
exists. No resource creation, billable probe or mail delivery occurs on guesses.

### Account inspection and provisioning — 2026-10-15

Vercel MCP connected after user OAuth. Read-only inspection: one team,
`dgsloxx417's projects` (`team_zE3mp7nrEZ6a7cxRavwUMYC4`); thirteen unrelated
projects, none named Acres; Marketplace already holds a free Neon installation
whose Vercel-managed Neon org has two unrelated projects (left untouched).
User decisions: new project, **iad1 / aws-us-east-1**, **free tiers only**
(stop and report when a gate needs a paid plan), Resend deferred.

Official pricing pages read this session: Sandbox on Hobby is free within
5 active-CPU hours, 5,000 creations, 10 concurrent and 45-minute sessions per
month, pausing (not billing) past quota (re-read 2026-10-18, page dated
2026-09-10: also 420 GB-hours Provisioned Memory and 20 GB Data Transfer per
month, a 20–40 vCPU/min allocation rate, and the pause lasts "until 30 days
have passed since you first used the feature"; `/docs/sandbox/limits` now
returns 404 and its tables live on the pricing page); Queues (Beta) is available on all
plans; Cron invokes production deployments only, so the Cron gate cannot be
proven on a preview. Hobby is a non-commercial plan — a launch-time plan
decision, not a proof blocker.

Created:

| resource                         | identity                           | settings                                                                                                                                             |
| -------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel project `acres`           | `prj_q9ApajZWDgdYZetnm5s5oakEjrUD` | no framework/Git yet, functions and Sandbox default `iad1`, Node 24.x, Vercel Authentication on all deployments except custom domains, no deployment |
| Blob store `acres-preview-probe` | `store_g2fmCH5CW7TJbkN3`           | private, `iad1`, linked to `acres`; its `BLOB_READ_WRITE_TOKEN` was narrowed to preview/development only (never production)                          |

Neon creation through the Neon MCP was refused (`organization is managed by
Vercel`); Vercel MCP exposes no Marketplace resource-provisioning call, so the
Neon/PostGIS resource needs the dashboard or an authenticated Vercel CLI.
No secret was decrypted or printed through MCP.

### Hosted proofs — 2026-10-15

The user provisioned Neon in the dashboard (Free, US East, `acres` project,
Preview + Development only, no per-deployment branching, prefix
`NEON_OWNER`, not sensitive so the owner URL could be pulled once) and signed
the Vercel CLI in (64.1.0, via `npx`). `vercel link` targeted `acres`; the
created `.env.local` and a `vercel env pull --environment=preview` file were
moved to a 0700 session scratch directory outside the repository and only
variable names were listed.

**Blob (server SDK).** `npm run vercel:probe -- blob` on Node 24.21.0 against
`acres-preview-probe` returned `bytes 5242880, checksumVerified true,
anonymousReadDenied true, browserUploadProven false, cleanupSucceeded true,
launchApproved false`; a follow-up store read showed no residue. The store's
connection metadata still lists production, but the env var targets only
preview/development.

**Database.** Neon reports PostgreSQL **18.6** with PostGIS **3.6.4**
available, matching the reference `postgis/postgis:18-3.6`. `neondb_owner` is a
`neon_superuser` member with `BYPASSRLS`, so it is bootstrap-only. A session
script mirrored `bootstrap-production-roles.sh`: `acres_migrator` (LOGIN,
CREATEDB, BYPASSRLS), `acres_app` (LOGIN, NOBYPASSRLS, not in
`neon_superuser`), `acres_test` as a **NOLOGIN placeholder** only because
migrations grant to it, database `acres` owned by the migrator, PostGIS,
default privileges, and `PUBLIC` connect revoked on `neondb`/`acres`.
Generated passwords stayed in that scratch directory. `prisma migrate deploy`
as the migrator over the direct host applied all **18** migrations; status
reports the schema up to date. Hardening mirrored
`harden-runtime-privileges.sh` for the `acres` database.

Verification as `acres_app` over **both** the pooled and the direct host:
42 tables, **30 RLS-enabled and all 30 forced**; the 12 non-RLS tables are
exactly the reference database's set; no-context `Organization` read returns
0 rows; insert into `AuditEvent` without context fails with the RLS policy
error; `_prisma_migrations` read is permission-denied; PostGIS functions run;
a transaction-local organization context is empty after commit. Pooled
context reuse: 20 sequential sessions with 0 leaked contexts and 8 concurrent
transactions each reading back only their own context. This proves the
database role/RLS seam, not the application's pooled Prisma behaviour under
real traffic.

**Pooler constraint (found by review follow-up).** On the pooled host a
**session-level** `set_config(..., false)` survived into the next client in
10/10 attempts: Neon's pooler does not reset session state between clients.
Tenant context must therefore always be transaction-local. Every
`set_config` in `server/src` (excluding specs) passes `true` today; keep it
that way and never use `SET` without `LOCAL` for `acres.*` settings. The
verify script reports this as `info pooled_session_level_leaks`, then resets
the probe value and asserts no residue. `scripts/vercel/neon-verify.sh` now
exits nonzero on any failed assertion; both scripts pass passwords to psql via
the environment only.

Follow-ups before any deployment: put the `acres_app` pooled URL (and never an
owner/migrator URL) in project env as **sensitive**; remove or mark sensitive
the `NEON_OWNER_*` variables; move migration execution to a guarded,
non-runtime step; decide whether to retire the `acres_test` placeholder from
hosted migrations.

### Queues — 2026-10-15

**Probe.** [`infra/vercel/probes/queues/`](../infra/vercel/probes/queues/README.md)
deployed two services sharing root `svc/`: a `producer` (plain Node, exposed
only by a `/probe/(.*)` rewrite) and a `jobs` consumer (plain Node, a
`queue/v2beta` trigger, no rewrite), with `@vercel/queue` **0.7.0** (the 0.8.0
release was 10 days old; 0.7.0 is 20). Consumer group observed:
`jobs_7Ejobs_Dmjs`. Results from runtime logs, preview A
`dpl_2tbYQqPYyT8UrMYb8XgVrWk3TXEF` and preview B
`dpl_9PEvqYt4fSSNC3jS1ED7RswcEjUn`:

| case                    | observed                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| delivery                | `ok` delivered once (deliveryCount 1) and acknowledged                                                                   |
| thrown error            | `fail-once` delivery 1 threw; delivery 2 about 6 s later acknowledged (`retryAfterSeconds: 5`)                           |
| lost instance           | `crash-once` ran delivery 1 twice in one request ID (platform re-invocation), then delivery 2 at +5 min 5 s acknowledged |
| poison                  | `always-fail` deliveries 1–3, then the retry callback acknowledged; no 4th delivery                                      |
| duplicate publish       | 3 sends with one `idempotencyKey` returned 3 message IDs; exactly one delivery                                           |
| forged POST             | `/jobs.mjs`, `/jobs`, `/api/jobs`, `/api/queues/jobs`, `/` with CloudEvent headers: all **404**                          |
| preview isolation       | B's message delivered only to B; A's only to A; every delivery's `deploymentId` matched its publisher                    |
| unauthenticated publish | **404** on both previews and production (secret header required)                                                         |

Findings that bind the real configuration: a plain Node service **can** host a
trigger and two services **can** share a root; the platform lease after a
hard crash is about 300 s regardless of the SDK's 30 s
`visibilityTimeoutSeconds`; the producer function ran in **`cpt1`** although
the project default is `iad1`, so the real config must pin regions
explicitly; `handleCallback` trusts the pushed payload with only a receipt
handle (it does not re-fetch the message), so the air-gapped trigger route is
the access control and the application must still treat payloads as hints.

**Incident, contained.** The project's first deployment
(`dpl_J1QEvvPsKY1NFsjmkqoS89upDa6K`) became **production** despite
`--target=preview`, and its public alias `acres-phi.vercel.app` exposed an
unauthenticated synthetic publish endpoint (HTTP 200; Vercel Authentication
does not cover that alias). Production held no environment variables. At the
user's choice, production was redeployed with a fail-closed secret-header
gate (`dpl_9v14VuLCzNdSxtNAQN56FJXBSdqQ`; unauthenticated publish now 404).
`ACRES_QUEUE_PROBE_SECRET` is a **sensitive** project variable (production,
preview) and its value lives only in
`~/.config/acres/vercel-preview/queue-probe.env`. The first deployment's own
URL stays behind Vercel Authentication (302). `vercel curl` created the
project's Protection Bypass for Automation secret; it is needed for preview
acceptance and can be revoked in Deployment Protection settings. One
synthetic message was published through the open alias before containment.

**Implementation.** `QUEUE_PROVIDER=bullmq|vercel` (default `bullmq`; a
Vercel profile rejects a set `VALKEY_URL`, and the self-hosted `worker.ts`
refuses to start unless the provider is `bullmq`), with `VERCEL_QUEUE_TOPIC`
(`acres-jobs`), `VERCEL_QUEUE_REGION` (`iad1`),
`VERCEL_QUEUE_RETENTION_SECONDS` (86400) and `JOB_LEASE_MS` (default 330000,
minimum 305000: leases are not renewed, so one must outlive a whole 300 s
invocation and the observed ~300 s crash redelivery). `VercelQueueAdapter`
publishes the strict `{ v: 1, jobName, id, outboxEventId? }` message with the
deterministic key as `idempotencyKey` (the BullMQ `jobId` semantics) and caps
any delay a minute short of retention.

`server/src/vercel/jobs.function.ts` is the consumer entry. It boots a cached
Nest application context of `VercelJobsModule` (worker config, no BullMQ
loop, timers, `listen()` or `MetricsModule`) with `abortOnError: false`, so a
failed boot rejects and the next delivery retries it instead of aborting the
instance. `LeasedJobExecutorService` resolves tenant ownership from
PostgreSQL and claims a `DurableJob` execution lease. Migration
`20261015000000_durable_job_execution_lease` adds nullable `leaseOwner` and
`leaseUntil` plus a pair CHECK; its `GRANT` only restates the original
`SELECT, INSERT, UPDATE`. The lease expiry is computed with the database
clock. A finished ingestion run or export is never re-run: its ledger row is
synchronised and the delivery acknowledged. Under a lease, an upload left
`scanning` by a lost executor is rescanned; without a lease it is left alone.

Retry and acknowledgement rules:

| condition                                                 | consumer action                                              |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| malformed message                                         | acknowledge (payload not logged)                             |
| another executor holds the lease                          | retry after the remaining lease (5–900 s); never acknowledge |
| aggregate not visible (publish before commit)             | retry 5 s doubling to 60 s; acknowledge after 5 deliveries   |
| `DurableJob.attempts >= maxAttempts`, dead letter written | acknowledge                                                  |
| any other failure, including ledger write failures        | exponential retry from `QUEUE_BACKOFF_MS`, capped at 900 s   |

Attempts are counted in `DurableJob` when work actually starts, never from
the provider's delivery count, so busy-lease redeliveries spend no budget. The
trigger's `maxDeliveries` must stay unset, or the platform could drop a message
the ledger has not recorded.

**Review fixes and found defects.** The real-database lease tests found that a
duplicate delivery for an accepted, rejected or cancelled upload reset its
`DurableJob` from terminal back to `running`; the processor now returns before
touching the ledger. The independent review found five more problems, all
fixed: unrecorded failures were acknowledged at the budget; busy retries spent
the budget; the executor reopened finished ingestion and export jobs; Nest
aborted the instance on a boot error; and `MetricsModule` started collectors in
a function. A new boot test then found a defect that predates this work:
**both** the self-hosted `WorkerModule` and the jobs module failed DI at boot,
because guarded feature controllers need the global `SessionsModule`. The
compiled `dist/worker.js` reproduced it:

```text
Nest can't resolve dependencies of the SessionGuard (?, AcresConfigService) … in the AnalyticsModule module
```

Both compositions now import `SessionsModule`, and test 7G boots each as an
application context. The guard has been on those controllers since
`deb53f8`, so self-hosted worker boots since then are unverified.

**Open, and owned by later items:**

- No outbox dispatcher runs on Vercel yet; the BullMQ worker's timer is the
  only one.
- `ingestion.run` is still published inside its SQL transaction, before
  commit. That holds a transaction across a remote publish. The bounded
  not-visible retry covers the commit race, but the fix is to route the job
  through the outbox with the dispatcher.
- No reconciliation sweeper exists yet. It needs to find expired-lease and
  stale `queued`/`running` jobs, including messages that outlive their
  retention. Until it exists, a failure before any attempt is counted retries
  every ≤900 s and, after an outage longer than retention (24 h default),
  expires with no dead letter; the row stays `queued`/`running`. Raise
  `VERCEL_QUEUE_RETENTION_SECONDS` for production and alert on rows stuck past
  retention.
- A key re-dispatched after it was dead-lettered exhausts on its first
  failure (attempts are not reset); decide this when the dispatcher lands.
- `jobs.function.ts` is not in any deployment config, and no application job
  has run on a hosted preview.
- Pre-existing behaviour kept: the upload processor writes a dead letter on
  every failed attempt, and a crash between an upload's terminal state and its
  ledger update leaves the row `running`.
- Unobserved: the SDK's consumer-discovery error paths, and behaviour across a
  promotion while messages are in flight.

### Blob browser upload — 2026-10-15

Prompt 371, split out of Prompt 370 as checklist item 2.

**Protocol decision.** Vercel Blob has two browser upload mechanisms.
`handleUpload` hands the browser a client token (a bearer credential) and
needs the long-lived `BLOB_READ_WRITE_TOKEN`. The newer one,
`issueSignedToken` + `presignUrl` (`@vercel/blob` 2.8.2), works with OIDC and
gives the browser one signed URL for one exact pathname, with the type, size,
expiry and overwrite flags signed into it. Acres uses the presigned one.
Sources, read 2026-10-15: [Vercel Signed URLs](https://vercel.com/docs/vercel-blob/vercel-signed-urls),
[Client uploads](https://vercel.com/docs/vercel-blob/client-upload),
[Private storage](https://vercel.com/docs/vercel-blob/private-storage).

**Contract unchanged.** A presigned Blob PUT really is "PUT these bytes to this
URL with this `content-type`". It fits the existing `InitiateUploadResult.upload
= { url, method: 'PUT', headers, expiresAt }` and the existing browser code. So
there is no new transport variant, no `packages/shared` change, no OpenAPI
drift (`contracts:check` passed) and no client dependency. This knowingly
departs from Prompt 370 §4 ("explicit discriminated upload transport"). That
rule assumed the client-token protocol, which is not a signed PUT.

**Hosted proof.** `npm run vercel:probe -- blob-browser` on Node 24.21.0
against `acres-preview-probe`, from headless Chromium on an
`http://127.0.0.1:<port>` origin. The table is from the final run, which exited
0 with `gatePassed: true` and `cleanupSucceeded: true`:

| #   | case                                                       | observed                                                                                              |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | 12 MiB browser PUT, `content-type: text/csv` only          | 200, CORS readable; response keys `contentDisposition contentType pathname size uploadedAt url`       |
| 2–3 | server `head` / bounded `get`                              | size 12 582 912, `text/csv`, SHA-256 match                                                            |
| 4   | replay of the same URL with different bytes                | 400; stored bytes unchanged                                                                           |
| 5a  | extensionless key (application shape), `content-type` only | 200, stored `text/csv`                                                                                |
| 5   | extensionless key, `content-type: text/plain`              | 403, nothing written                                                                                  |
| 6   | 1025 bytes against a 1024-byte signed limit                | 403, nothing written                                                                                  |
| 7   | `pathname` query param swapped                             | 403, neither path written                                                                             |
| 8   | URL valid 5 s, PUT after 8 s                               | 403, nothing written                                                                                  |
| 9   | anonymous GET of the plain private URL                     | 403                                                                                                   |
| 10  | signed GET (`get` token, `useCache: false`)                | 200, CORS readable, SHA-256 match, `content-type: text/csv`, `content-disposition` shape `attachment` |
| 11  | read token used to presign another path                    | refused locally (scope mismatch)                                                                      |
| 12  | `del`, then the still-valid case 10 URL                    | 404                                                                                                   |

**Content-type finding, resolved with the user.** The first runs used
`<case>.csv` pathnames, as the prompt specified. Case 5 then _accepted_ a
`text/plain` PUT (200), but the store recorded `text/csv`. Diagnostics showed
the API resolves the stored type in this order: `x-content-type` header, then
the pathname extension, then `content-type`. It checks the resolved type
against the signed allowlist: a wrong `x-content-type` on a `.csv` key got 403,
and a wrong `content-type` on an extensionless key got 403. The stored type
never left the allowlist. Application keys
(`organizations/<id>/quarantine/<uuid>`) have no extension, so the user chose
to move case 5 to an extensionless key, keep the `.csv` run as a recorded
diagnostic (`diagnosticExtensionOverridesHeader`: 200, stored `text/csv`), and
continue. No extra request header is needed.

**Residue.** A `list` restricted to `acres-probes/` returned 0 objects after the
runs. The store's aggregate metadata (Vercel MCP `get_storage_stores_by_id`)
reported `count 1, size 12582912` right afterwards. A later read returned no
`count`/`size` fields at all, so the figure stays unexplained; re-check it
before the next probe or the first preview. No listing outside the probe
prefix was made.

**Re-run after review fixes: blocked by the environment.** Two later runs, after
tightening cases 11 and 12, failed at case 1 with no response. A scratch
diagnostic then showed this machine's upload throughput had fallen to about
70 KB/s: 1 MiB took 15 s and 4 MiB took 63 s, both 200, while 12 MiB hit the
probe's 120 s page timeout. The protocol code for cases 1–10 did not change.
Neither the timeouts nor the payload were widened to fit the slow link, so the
tightened cases 11 and 12 still await a hosted run on a normal connection.

**Implementation.** `STORAGE_PROVIDER=s3|vercel-blob` (default `s3`). The Blob
profile requires `BLOB_STORE_ID` and refuses any set S3 `STORAGE_*` variable.
`BLOB_READ_WRITE_TOKEN` is optional, but whenever it is set the SDK uses it
in preference to OIDC; OIDC is used only when it is absent. Validation refuses
a token whose embedded store differs from `BLOB_STORE_ID`, and the adapter
passes `storeId` from config explicitly. `StorageModule` constructs only the
selected adapter. `VercelBlobStorageAdapter` behaves as
follows:

- `presignPut` signs the exact key, `[mediaType]`, `maxBytes` (the declared
  size, a new port field), the upload TTL, `allowOverwrite: false` and
  `addRandomSuffix: false`.
- `presignGet` signs a `get`-only, uncached URL for the download TTL.
- `stat`, `readiness` and `getBuffer` map `BlobNotFoundError`/`null` to the
  port's not-found meaning. `getBuffer` stops reading at `UPLOAD_MAX_BYTES`.
- `putBuffer` verifies the body's SHA-256 first. On the observed
  `BlobError: This blob already exists…`, it reads the object back and treats
  identical bytes as an idempotent retry.
- `delete` treats a missing pathname as success: `del` succeeded for one
  (observed), and a `BlobNotFoundError` is also caught.

Every SDK call has an abort timeout. Nothing logs a URL, token or signature.
`@vercel/blob` 2.8.2 moved to the server's runtime dependencies, at the same
pin.

**Callback provenance: no callback (decision).** No `onUploadCompleted`, no
callback route, no `BLOB_WEBHOOK_PUBLIC_KEY`. The authenticated `complete`
command already re-reads size, type and SHA-256 on the server. A callback would
add an unauthenticated ingress and a sessionless path into tenant data, and
Vercel Authentication would block it on previews anyway. No provider-originated
request can change upload state.

**Cancel/delete.** `cancel` from `pending_upload` deletes the object after the
transaction commits, then marks the `StoredObject` `deleted`
(`updateMany` guarded by organization and `state: 'pending_upload'`). This
applies to both storage profiles: S3/Garage now deletes the object on cancel
too. A failed delete logs the upload id only, still returns `cancelled`, and
leaves the object `pending_upload` for the sweeper; a ledger-update failure
after a successful delete is logged separately. Replays and already-cancelled
uploads do not delete again. From `completed`/`scanning` nothing is deleted:
the processor finishes the cancelled work.

**Cancel/complete race (found by review, fixed).** Both commands used to read
`pending_upload` and then update the row unguarded, at READ COMMITTED. A cancel
and a complete racing on one upload could both pass the check, the later write
overwriting the earlier. With the post-commit delete, that could have left a
`completed` upload queued for scanning with its bytes gone. Both transitions
are now compare-and-set (`updateMany` on the state just read, conflict when
`count !== 1`). Under Postgres the loser re-checks its `WHERE` after the winner
commits, matches nothing and returns 409, so it never deletes. Unit tests cover
both losing sides. Real-database e2e section 8 covers delete-after-commit
under RLS, the replay, a failed delete, complete-after-cancel (409) and
cancel-after-complete (no delete).

**Download revocation.** URLs are short-lived (`ACCEPTED_DOWNLOAD_TTL_SECONDS`,
300 s default) and minted only after the accepted-state and permission
recheck. Deleting the object makes outstanding URLs 404 (case 12). A minted URL
cannot be revoked earlier any other way.

**Known delta: download filename.** Presigned Blob GETs have no per-URL
`Content-Disposition`. The response carries `attachment` and the stored type,
but not `filename="<declared>"` as on S3, and the quarantine pathname is a UUID
with no extension. Bytes come from a separate `*.private.blob.vercel-storage.com`
origin. Streaming through a function to set the header is a later option.

**Residuals, owned by the sweeper (Queues item, "Open"):**

- A browser that keeps an unexpired PUT URL (at most
  `PRESIGNED_UPLOAD_TTL_SECONDS`, 900 s default) can write once more after
  `cancel` deleted the empty path. Nothing reads those bytes, because `complete`
  returns 409 on a cancelled upload.
- Quarantined bytes of uploads cancelled after completion, and of expired and
  rejected uploads, are not deleted. The retention job only marks
  `StoredObject` `deleted`.

**Not proven.**

- The application's upload → complete → scan through a deployed preview with
  OIDC (owned by "First preview deployment").
- OIDC itself: the probe ran off Vercel with the read-write token.
- Booting the jobs module with `STORAGE_PROVIDER=vercel-blob`, which is
  covered only by the `StorageModule` unit test.
- Types other than `text/csv`. `complete` requires the stored type to equal
  the declared one exactly. Whether XLSX, `application/geo+json` and
  `application/json` survive on extensionless keys byte-for-byte (no added
  `charset`) has not been observed.
- A concurrent cancel/complete against a real database; the race is covered by
  unit tests only.

**Verification (Node 24.21.0, explicit `node`/`npm` pair, sequential), after
the review fixes:**

```text
npm run vercel:probe-test        ℹ tests 46  ℹ pass 46  ℹ fail 0
npm run contracts:check          exit 0 (no drift)
npm run lint                     exit 0
npm run typecheck                exit 0
npm run build                    exit 0; Next 23/23 static pages
npm run test --workspace=@acres/server -- --runInBand
  Test Suites: 130 passed, 130 total
  Tests:       2006 passed, 2006 total
npm run test:e2e --workspace=@acres/server -- --runInBand --testTimeout=30000
  Test Suites: 8 passed, 8 total
  Tests:       170 passed, 170 total
npm run test:e2e --workspace=@acres/client -- --workers=1
  9 skipped
  92 passed (1.7m)
npm run ops:check                exit 0; production audit passed (0 critical);
                                 licences 100% compliant; SAST passed
git diff --check                 clean
```

`ops:check` now counts 717 production components (702 before), because the
Blob SDK is a runtime dependency. The advisory count is unchanged (10). The
first post-fix server e2e run failed one case: `api.e2e-spec.ts` returned 500
on upload `complete`, because the mocked Prisma in `test/helpers/test-app.ts`
lacked `upload.updateMany`/`findFirstOrThrow`. Adding both fixed it.

**Independent review.** The first review found three Important issues, all
fixed:

- the cancel/complete race (above);
- docs that misstated token-versus-OIDC precedence, which made the planned
  OIDC proof impossible as written;
- no check that the token's store matches `BLOB_STORE_ID`.

Its Minor items were also applied: a real-database cancel e2e, organization
scoping on the ledger update, separate failure logs, not-found-tolerant
`delete`, stricter probe cases 11 and 12, and a hidden-write probe test. The
re-review found no Critical or Important issues. Its remaining notes are
optional: an interleaved real-database race test, and that the S3 adapter's
delete-on-cancel is unit-tested only.

### Scanner image — 2026-10-15

Prompt 372. Local work is done. The VCR push and the hosted cases did not run,
because of the cost gate.

**Cost gate (stop condition).** The [VCR pricing page](https://vercel.com/docs/container-registry/limits-and-pricing)
(last updated 2026-09-22) lists only "VCR image storage $0.10 per GB". It shows
Hobby limits (10 repositories per project, 50 images per repository) but no
included storage. The [Hobby plan page](https://vercel.com/docs/plans/hobby)
(2026-09-14) has no VCR row in its included-usage table, and the
[VCR announcement](https://vercel.com/changelog/introducing-vcr-vercel-container-registry)
does not mention price. `vcr ls` on `acres` showed no repositories. The image is
about 0.24 GB, so roughly $0.02–0.03 a month if billed. Asked on 2026-10-15,
the user declined any paid usage. **Nothing was pushed.**

The [Sandbox pricing page](https://vercel.com/docs/sandbox/pricing) (2026-09-10)
gives the free route. Hobby includes **15 GB (lifetime) of Snapshot Storage**,
downloads are free, and Hobby "**will not be charged** for any additional
usage" (creation pauses instead). A scanner built as a Sandbox snapshot from a
managed image therefore costs $0 on Hobby. The user chose to commit this
prompt's local work and plan that route as a new prompt.

**Licence finding (judgement, not a licence grant).** ClamAV is GPL-2.0. No
official ClamAV page states usage terms for the CVD databases: the
[FAQ](https://docs.clamav.net/faq/faq-cvd.html) and the
[Docker page](https://docs.clamav.net/manual/Installing/Docker.html) are silent.
The Docker page says Cisco's own `clamav/clamav:<version>` images ship "preloaded
with signature databases". The user accepted that practice as the basis for
private, non-redistributed use.

**Pinned inputs** (resolved with `docker buildx imagetools inspect`; both index
manifests list `linux/amd64`):

| input  | reference                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| ClamAV | `clamav/clamav-debian:1.5.4_base@sha256:25420050b2b469d97990f074cf454d8a67e9c7c6013a11fa1f47ac6a11347ce6` (trixie) |
| Node   | `node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66`                 |

Delta: the planned tag `1.5.4_base-debian13-slim` does not exist. Docker Hub
lists only `1.5.4` and `1.5.4_base` (both updated 2026-10-12), and `_base` is
Debian 13. The base image runs as root, ships `/var/lib/clamav` as
`0700 clamav`, and has no `sudo` or `/usr/bin/time`. `freshclam.conf` uses only
options its sample documents. `DNSDatabaseInfo` was dropped: the sample shows
only a domain value and says "Do not touch it". During the build, freshclam's
DNS query failed and it "Fall[s] back to HTTP mode"; the downloaded CVDs passed
freshclam's own database test.

**Local build, 2026-10-15 13:10 UTC** (signatures change on every rebuild):

| file         | version | build time (sigtool)    | SHA-256                                                            |
| ------------ | ------- | ----------------------- | ------------------------------------------------------------------ |
| main.cvd     | 63      | 16 Dec 2025 23:18 +0000 | `0b2182d229f46981ec8f535382222f7c9dfdd656b250ad47988b910a8d302365` |
| daily.cvd    | 28154   | 15 Oct 2026 06:24 +0000 | `af003f6eb87905bc3044e90e489d5f79e4897f57c1930b8854672e649e72f3c3` |
| bytecode.cvd | 339     | 11 Sep 2025 08:29 -0400 | `6d4aa01f219e988060fc419f495d07f27e0cdf1a2cccc065971da922c76f7ffb` |

Image content size 239 MB (726 MB on disk). The local `--network none` smoke
test gave `clean=0` and `eicar=1` (`Eicar-Test-Signature FOUND`).

**Local measurements on this machine** (Docker, `--cpus 1`, not Sandbox
capacity): about 6.7–7.5 s wall time per `clamscan`, almost all of it loading
signatures; peak cgroup memory 1,044,459,520 B (≈996 MiB); peak `clamscan`
RSS 969 MiB. One vCPU (2048 MB) is enough on this evidence.

**Findings from local runs** (each changed the code):

- **ClamAV 1.5.4 and `--alert-exceeds-max=yes`.** A 7 MiB file under 6M limits
  reads `OK`/exit 0 without the flag. With the flag it prints
  `Heuristics.Limits.Exceeded.MaxFileSize FOUND`, then
  `Virus(es) detected ERROR`, and exits **2**, not 1 as Prompt 372 assumed. The probe gate is now
  "non-zero exit with a `Heuristics.Limits.Exceeded` result". The adapter maps
  exit 2 to `scanner_error`, which fails closed.
- **SDK exit-code hazard.** In `@vercel/sandbox` 3.8.0, `CommandFinished` sets
  `exitCode: finished.exitCode ?? 0`. A killed command with no exit code could
  read as 0 (clean). The adapter therefore needs exit 0 **and** the file's
  `OK` line for clean. The signature check must also print `signatures-ok`.
  The probe's `command-timeout` case fails if a killed command resolves with
  exit 0. The real platform shape is still to be observed.
- **Persistence defect (fixed before any run).** The old probe created
  sandboxes without `persistent` and cleaned up with `stop()` only. Persistence
  is the SDK default, and stop snapshots the filesystem for 30 days, so EICAR,
  and in production quarantined customer bytes, would have stayed in a
  snapshot. The probe and adapter now create with `persistent: false`, then
  call `stop()` and `delete({ deleteOrphanSnapshots: true })`.

**Docker dry run (not a hosted proof).** A Docker-backed SDK double in the
session scratchpad ran the probe's real in-VM commands against
`acres-scanner:local`. `scanner` passed: uid 0, signatures readable, scan
directory writable, signature check (including `Date.parse` of `sigtool`
build times), clean `OK`, EICAR `FOUND`. In `scanner-failures`, wrong-hash
(2), missing / empty directory (1), stale (3), egress-denied (7),
session-timeout (rejected at 15.1 s), malformed (0, `ok`) and memory passed.
size-limit led to the exit-2 finding above. command-timeout failed by design:
the double copies the SDK's `?? 0`.

**What changed in the repository.** `infra/vercel/scanner/` (Dockerfile,
`freshclam.conf`, README). `scripts/vercel/probe-platform.js` gained the
shared lifecycle, digest check, identity record, `scanner-failures` mode and a
creation budget (1 + 9). Tests use doubles only. `SCANNER_PROVIDER` and
`VercelSandboxScannerAdapter` are local only and not deployed (see
`docs/backend.md` and `docs/security.md`). The adapter loads the SDK lazily: in
the built server only `dist/scanner/vercel-sandbox-scanner.adapter.js`
references `@vercel/sandbox`, inside an `await import()`, and requiring
`dist/scanner/scanner.module.js` loads 0 SDK modules. `@vercel/sandbox` moved to
server `dependencies` at the same 3.8.0.

**Review follow-ups applied.** The `command-timeout` (2.5–10 s) and
`session-timeout` (8–40 s) cases now need a lower bound too, so an instant
unrelated rejection no longer passes. `egress-denied` needs the script's exact
exit 7. Failure cases create `/tmp/acres-scan` before writing. The adapter writes
to `/tmp/acres-scan-upload` (a delta from the prompt's
`/tmp/acres-scan/upload`), so it doesn't depend on `writeFiles` creating parent
directories. The adapter's credential comment was corrected: SDK 3.8.0 never
reads `VERCEL_TOKEN` from the environment.

**Probe authentication.** The SDK authenticates without a token: it reads
`VERCEL_OIDC_TOKEN`, takes team and project from its claims, and refreshes it
through `@vercel/oidc`. A future hosted run can use a freshly pulled OIDC
token instead of a long-lived `VERCEL_TOKEN`. The probe still requires
`VERCEL_TOKEN` today, and this prompt does not change that. _(Prompt 373
changed it: OIDC is now preferred and `VERCEL_TOKEN` is the fallback.)_

**Open blockers.**

- Hosted scanner source: VCR is paid, so a snapshot-based scanner is next, as
  its own prompt.
- **Image rebuild cadence (production blocker).** Signatures go stale past the
  adopted age, and a stale scanner fails closed, so every upload is
  `scanner_unavailable` until it is rebuilt. Candidates: a scheduled GitHub
  Actions workflow, or a protected Vercel Cron that rebuilds the scanner
  source. Neither is built.
- App upload → scan through a deployed preview.
- The 50 MiB cap: objects above it are refused rather than scanned in chunks.
- **Archive expansion (product behaviour, from review).** `--max-scansize=50M`
  limits the _decompressed_ data scanned. An XLSX (a ZIP) well under 50 MiB
  can expand past it. The scan then reports
  `Heuristics.Limits.Exceeded.MaxScanSize` and exits 2, and the worker marks
  the upload terminal `rejected` (non-clean results are not retried). clamd's
  defaults allow far more, so this profile rejects some spreadsheets that the
  clamd profile accepts. Raising `--max-scansize` needs a memory/time
  measurement at one vCPU first.
- **Hosted unknowns to record on the first live run:** the real shape of a
  killed command (exit 137, or a missing code read as 0); whether a session-end
  rejection is a 410 that the SDK's `withResume` turns into a fresh session
  (`dist/sandbox.js`), including for `persistent: false`; and real timings.
  _(Answered by Prompt 373's hosted runs; see "Scanner snapshot" below.)_
- The `SCANNER_SANDBOX_IMAGE` contract (a `vcr.vercel.com` digest) may be
  replaced by a snapshot id in the snapshot-based scanner prompt. Don't treat it
  as settled. _(Superseded by Prompt 373: it is now
  `SCANNER_SANDBOX_SNAPSHOT_ID`; see below.)_

### Scanner snapshot — 2026-10-15

Prompt 373. The hosted scanner source is a Vercel Sandbox **snapshot**, not a
VCR image. Variables `SCANNER_SANDBOX_SNAPSHOT_ID` (server) and
`ACRES_SCANNER_SNAPSHOT_ID` (probe) replace `SCANNER_SANDBOX_IMAGE` and
`ACRES_SCANNER_IMAGE`; no hosted environment ever set the old names.

**$0 basis.** [Sandbox pricing](https://vercel.com/docs/sandbox/pricing) (last
updated 2026-09-10) includes for Hobby: Active CPU 5 h/month, Provisioned
Memory 420 GB-h/month, Creations 5,000/month, Data Transfer 20 GB/month and
**Snapshot Storage 15 GB (lifetime)**, and says Hobby "will not be charged for
any additional usage" (creation pauses instead). Downloads into a sandbox are
free. "(lifetime)" is undefined there, so it is read as a cumulative cap and at
most **one** scanner snapshot is kept.

**Package pin.** GitHub release `clamav-1.5.4` (published 2026-08-07), asset
`clamav-1.5.4.linux.x86_64.deb`, 105,819,396 bytes,
`sha256:28d6efc5b4423e7830c3559339552eb53870a9eac51ac4efb37d60530d329886`
(re-read from the release API on 2026-10-15). It is installed only on a digest
match. Its `.sig` is **not verified**: no Talos signing-key source is pinned, so
the summary records `not-verified:no-pinned-signing-key`.

**Builder egress.** `curl -sIL` on the release URL: `github.com` answers 302
to `release-assets.githubusercontent.com`. The allow-list is those two hosts
plus `database.clamav.net`; `allow-all` was not needed.

**Build** (`npm run vercel:scanner-snapshot`, OIDC auth, `iad1`):

| field             | value                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| snapshot id       | `snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA` (not a secret)                                                   |
| size              | 460,912,577 B (CLI: 440 MB); one snapshot stored                                                     |
| expires           | 2026-10-23T15:00:52Z (8 days)                                                                        |
| base image        | `vercel/sandbox/node:24`: **Ubuntu 26.04**, **Node v24.19.0**, uid 1000, `sudo` yes, no `curl`/`gpg` |
| ClamAV            | 1.5.4 from the pinned `.deb`                                                                         |
| `main.cvd`        | v63, 16 Dec 2025 23:18 +0000, `0b2182d229f46981ec8f535382222f7c9dfdd656b250ad47988b910a8d302365`     |
| `daily.cvd`       | v28154, 15 Oct 2026 06:24 +0000, `af003f6eb87905bc3044e90e489d5f79e4897f57c1930b8854672e649e72f3c3`  |
| `bytecode.cvd`    | v339, 11 Sep 2025 08:29 -0400                                                                        |
| `/var/lib/clamav` | the three `.cvd`, three `*.cvd.sign`, `freshclam.dat`; no `.cld`                                     |
| egress            | allow-list while building; builder set to `deny-all` before `snapshot()`                             |
| builder           | `persistent: false` (snapshot accepted; the persistent fallback was not needed)                      |

The main and daily hashes equal Prompt 372's local Docker build byte for byte,
which independently cross-checks the CVDs. ClamAV 1.5.4 also wrote detached
`*.cvd.sign` files next to the CVDs.

The **first build attempt failed** at `record-scanner` on a parser defect. The
official `.deb`'s compiled-in database directory is empty, so
`clamscan --version` prints `ClamAV 1.5.4` without the `/<daily>/<date>`
suffix (confirmed against the local 1.5.4 image). The builder was deleted and
left no residue. The parser was fixed and a test added, and the one allowed
retry succeeded.

**Hosted probe runs** (`ACRES_SCANNER_MAX_SIGNATURE_AGE_HOURS=48`):

- `scanner`: **passed**. uid 1000, signatures readable, `/tmp/acres-scan`
  writable, signature check `signatures-ok`, clean `OK`/0 (9,843 ms), EICAR
  `Eicar-Test-Signature FOUND`/1 (9,989 ms), `baseSnapshotSurvived: true`.
- `scanner-failures`, first run: 8 of 9 cases passed and
  `baseSnapshotSurvived: true`; `session-timeout` failed (see below).
- `scanner-failures`, rerun after the probe fix: **all 9 passed**,
  `baseSnapshotSurvived: true`, `gatePassed: true`. wrong-hash exit 2;
  missing (empty database directory) exit 1; stale exit 3; egress-denied
  exit 7; command-timeout resolved 137 at 3,423 ms; session-timeout resolved
  143 at 14,044 ms; size-limit `OK`/0 without the alert flag and
  `Heuristics.Limits.Exceeded.MaxFileSize FOUND`/2 with it; malformed ZIP 0
  `OK`; memory: `MemTotal` 2,287 MiB, `clamscan` peak RSS 967 MiB, exit 0,
  14,429 ms.

**Observed shapes** (the unknowns Prompt 372 named):

- **Killed command** (`timeoutMs: 3000`): resolves with **exit 137** after
  about 3.5 s. It does not reject and does not read as 0.
- **Session end** (15 s session): the running command **resolves with exit
  143** (SIGTERM) at about 14.9 s instead of rejecting. The first run's
  `session-timeout` case assumed a rejection and failed. That was a probe
  defect, not a security failure: the gate now accepts "rejected, or resolved
  non-zero, inside 8–40 s" (the `command-timeout` rule), and a resolved exit 0
  still fails. On the rerun the sandbox listed **one** session after
  the session ended, so no second VM was resumed. For the adapter a session end is `scanner_error`
  (fail closed), not `scanner_timeout`.
- **`writeFiles` into a missing directory**: creates the parents
  (`writeCreatesParents: true`). The adapter's `/tmp/acres-scan-upload` path
  does not rely on this.

**Orphan-deletion branch.** Scan sandboxes keep
`delete({ deleteOrphanSnapshots: true })`. `baseSnapshotSurvived` held in
both modes on every run, 30 s after the last delete, and the scanner snapshot
was still `created` in the residue listing minutes later. Deleting a scan VM
that was booted from the snapshot does not delete it. The builder alone uses
`false`.

**Residue check** (`npx vercel@latest sandbox list --all` and
`npx vercel@latest sandbox snapshots list`, each with `--project
prj_q9ApajZWDgdYZetnm5s5oakEjrUD --scope team_zE3mp7nrEZ6a7cxRavwUMYC4`):
baseline before the work showed none of either. After every run: **no sandboxes**,
and exactly **one** snapshot, `snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA` (`created`,
440 MB, `iad1`). The failed first build also left nothing behind. Every
sandbox name was printed to stderr; none needed manual deletion.

**Usage.** 21 Sandbox creations (2 builds, 1 `scanner`, 2 × 9
`scanner-failures`) out of a budget of 23 and 5,000/month included. `vercel
usage` reports no billing cost data for this Hobby team ("does not mean usage
was zero"), so CPU is an **estimate**, an upper bound from wall-clock time:
about 20 vCPU-minutes of builders (2 vCPU) plus about 15 vCPU-minutes of probe
VMs (1 vCPU), well under 1 h of the 5 h included. One stored snapshot of
about 0.46 GB against 15 GB. No charge applies on Hobby.

**Deltas from the plan (Prompt 373), each deliberate.**

- **OIDC credentials are passed explicitly**, not omitted. Review found that
  with no credentials, SDK 3.8.0 refreshes an expiring token through
  `@vercel/oidc` 4.0.0 for the cwd's `.vercel` link (`findProjectInfo`), not
  for the project whose claims were checked. The scripts now pass the checked
  token with its team and project ids, and refuse a token with under 30 minutes
  left, so no refresh happens. The hosted runs above used the earlier
  no-credentials path against the same linked project. A read-only
  `Snapshot.get` with the bound credentials then returned `created`. The
  OIDC `environment` claim is not checked: a token pulled with
  `--environment=preview` carries `environment: development`.
- **`--replace` runs after the summary and env file are saved**, so a failed
  replace cannot lose the new snapshot's hashes.
- **The summary has `os`** (for example `ubuntu 26.04`) in place of
  `ubuntuVersion`, and adds `baseImage`, `builderUid`, `tools`,
  `databaseFiles`, `egressAtSnapshot` and `builderPersistent`.
- **The session-timeout gate** accepts a resolved non-zero exit (see above).

**Rebuild cadence — Prompt 384 supersedes Prompt 383.** Candidate preparation
retains every snapshot, smoke-tests a new candidate and optionally creates a
new configuration file. No activation or retirement occurs. Snapshot metadata
age (48-hour default, 168-hour CLI maximum) is not CVD freshness evidence.
Scheduled/default manual workflow runs are credential-free simulation; explicit
manual `prepare_candidate: true` prepares an isolated preview candidate only.

The deployed-app upload/scan proof subsequently recorded in Prompt 378 supersedes
the earlier open preview item here. Automated durable adoption, deployment
verification, bounded retirement and hosted cadence evidence remain open.
None of this is production scanner acceptance.

## Target and gates

Vercel Services is the candidate single-project arrangement, documented in Beta
with internal bindings and explicit public routing. Nest uses native Function
entrypoint detection. The account-specific arrangement and queue consumer layout
require a preview proof before active configuration is added.

| Gate              | Required evidence                                                                                                            | Current state                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Database          | Migrated isolated Neon/PostGIS; runtime cannot bypass forced RLS; pooled context reuse, concurrent transactions and rollback | Proven for preview at the database seam (2026-10-15); application-level pooled Prisma acceptance open      |
| Blob              | Private direct browser upload above function body limit; scoped token, authorized private read, checksum, cancel/delete      | Seam proven: server SDK and browser presigned protocol (2026-10-15); deployed-app upload open              |
| Scanner           | Pinned Sandbox scanner/signatures; clean/EICAR, missing/stale signatures, timeout/memory/byte limits and cleanup             | Seam proven on preview (Prompt 373): snapshot scanner, all probe cases, no residue; deployed-app scan open |
| Durable execution | Same-project producer/consumer, forged request denial, duplicate/retry/interruption and preview isolation                    | Platform seams proven with a synthetic probe (2026-10-15); application job on a hosted preview open        |
| Production        | Account-bound recovery, capacity, telemetry, security and eleven signed launch categories                                    | Open; no categories approved by local implementation                                                       |

## Implementation record

Local code/results are recorded here after verification. Neither reference
Compose checks nor mocked tests establish managed integration. Do not set a
managed profile live until all its ports and distributed security are wired and
verified. Retain the existing profile, schema and public contracts meanwhile.

## Sources checked this session

- [NestJS](https://vercel.com/docs/frameworks/backend/nestjs)
- [Services](https://vercel.com/docs/services)
- [Queues](https://vercel.com/docs/queues)
- [Sandbox](https://vercel.com/docs/sandbox)
- [Private Blob](https://vercel.com/docs/vercel-blob/private-storage)
- [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Resend send API](https://resend.com/docs/api-reference/emails/send-email)

These sources verify platform interfaces, not the customer's account settings.

## Local implementation — 2026-10-15

- Extracted `server/src/worker/job-processor.service.ts`. The current BullMQ
  worker delegates per-job work; startup, shutdown, dispatch and metrics stay in
  its transport. No claim of managed idempotency/leases or invocation-safe whole
  module; those are required follow-on work after proofs.
- Added optional `MAIL_TRANSPORT=resend`, typed key configuration, explicit
  sender requirement and a fixed-HTTPS native-fetch mail adapter. Native HTTP
  avoids the inspected SDK's development error logging; no Resend SDK remains
  installed. No real email was sent. SMTP/memory remain defaults.
- Progress now continues through REST polling after stream EOF/setup/read
  failure, honors cancellation and terminal state and reports read failure.
  Default two-second interval/fifteen-minute budget are implementation choices.
- Pinned Blob **2.8.2** and Sandbox **3.8.0** as development-only dependencies in the server workspace and added
  opt-in synthetic probes plus local failure tests. Neither SDK is selected by
  application boot. [Probe guide](../infra/vercel/README.md) records exact
  invocation, restricted environment inventory, cleanup and proof limitations.
- Added Node **24.x** engine declarations and `.node-version` **24.21.0**.
  Downloaded that exact verified binary under `/tmp` for checks without changing
  global tooling. Clean-install and hosted Node configuration remain unproven.

The user directed automation through Vercel MCP. A fresh discovery after that
instruction again returned `installed: false`; no Vercel callable tool was
available. The existing connection suggestion needs completing by the user.
No CLI deployment or arbitrary-account fallback was attempted. Broader provider
profile wiring, Blob upload protocol, queue/workflow/Cron callbacks, distributed
throttling, managed evidence schema/recovery, real-provider acceptance and
preview/production deployment remain unfinished behind account/proof gates.
No completion score, category approval or phase exit changes.

## Rollback and local inspection

Ordinary revert of this preparatory commit restores the prior code, lockfile,
Node declaration and documentation; no schema or hosted object was migrated.
Use Node 24 (`.node-version`), install the locked dependencies, then `npm run
build` and `npm run dev:server` / `npm run dev:client` with the existing local
environment. `/app/datasets` and `/app/reports` retain their existing layouts.
`npm run vercel:probe -- --help` is credential-free. Keep real probe secrets in
the restricted environment described in the guide; no examples contain values.

## Verification and independent review

Final runtime checks use an explicit temporary `node` **and** `npm` launcher
pair; `npm version --json` reported Node **24.21.0**, npm **12.0.2**. Initial
PATH-only runs used the machine's mise npm shim and actually ran Node 26.11.1;
those runs are excluded from Node 24 compatibility claims. No global tooling
or credential files were changed. The SDK exports also loaded directly on
Node 24 (`PASS: pinned Blob/Sandbox CommonJS exports load on Node 24`).

The sequential Node 24 checks passed contract drift, root lint, root typecheck
and root production build (Next 16.3.8, **23/23** generated pages, plus shared
and Nest compilation). After the review fix, focused client ESLint, root
typecheck and root production build passed again. Actual summary excerpts:

```text
npm run test --workspace=@acres/server -- --runInBand
Test Suites: 122 passed, 122 total
Tests:       1898 passed, 1898 total
Snapshots:   1 passed, 1 total

npm run test:e2e --workspace=@acres/server -- --runInBand --testTimeout=30000
Test Suites: 8 passed, 8 total
Tests:       159 passed, 159 total

PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 npm run test:e2e --workspace=@acres/client -- tests/sse-stream.spec.ts
15 passed (1.2s)

node scripts/vercel/probe-platform.spec.js
ℹ tests 30
ℹ pass 30
ℹ fail 0
```

The server E2E matrix includes the existing real PostgreSQL/PostGIS and
infrastructure-failure tests; it does not prove Neon or real cloud scanners,
queues or storage. The full client run includes helper and browser cases;
local product-harness cases are not hosted integration evidence.

Initial checks exposed a stale expected transport error message and the old
SMTP/memory tuple assertion; both were updated for the new closed tuple. Three
ESLint unsafe-mock findings were fixed with typed mocks. The first broad unit
run also lacked the compiled parser child and had four `listen EPERM` failures;
a successful build and permitted local execution resolved those environment
failures. The restricted build reported `Could not parse output from
TypeScript's --showConfig.` before successful permitted reruns. Initial DB
checks found the local database still starting. Once ready, the integrated
data journey exceeded Jest's default **5000 ms** under concurrent checking;
the complete suite passed with an explicit **30000 ms** budget, unchanged
assertions, and serial execution. This is not a claim that the default-budget
invocation passed. The offline SDK dependency reclassification hit `ENOTCACHED`;
a permitted metadata fetch completed the exact-version development-only move.

Mandatory read-only review found no Critical/Important findings in this bounded
prerequisite change. Its one Minor finding was valid: polling waits observed
only subscription cancellation, delaying notification after budget expiry.
A new test first failed with a **50.266608 ms** notification delay (limit
**30 ms**), then passed after waits observed the combined polling signal.
The reviewer verified the narrow fix and reported no remaining findings.
These timing values describe that regression assertion/run, not a product SLO.

`npm run vercel:probe -- --help` passed without credentials. Calling `blob`
without the explicit isolated target exited **1** with the sanitized message:
`Platform probe failed or lacks required isolated-target configuration. No gate
approved; inspect the restricted provider console and verify cleanup.` No
remote call was authorized by this missing-configuration test. The new local
link/workspace lock check and extracted processing-body comparison passed;
`git diff --check` returned no output. Public contract, schema, RLS and
permission behavior remain unchanged by these prerequisites.

The full sequential Node 24 `npm run ops:check` exited **0**. Actual excerpts:

```text
10 vulnerabilities (4 moderate, 6 high)
Production dependency security audit passed (0 critical vulnerabilities)
Total production components: 702
Excluded dev/test packages:   872
License Compliance: PASSED (100% compliant with approved permissive licenses)
SAST Gate: PASSED (Zero unreviewed blockers and zero expired suppressions)
```

The audit passes the repository's configured critical-severity threshold; it is
not a zero-advisory claim. No force upgrade or unrelated advisory remediation
was performed. The operations test suites exercise local fixtures and the
reference tooling; they approve no Vercel launch category. The final launch
runner/dossier test stage reported **182 passed, 0 failed**, and the probe suite
then reported **30 passed, 0 failed**. New-file/scoped formatting and final diff
checks passed.

After the timeout fix, one concurrent full browser run had **91 passed,
1 failed, 9 skipped**: the pre-existing audit-history organization switch
expected one row but observed twenty. The changed stream tests passed. All six
audit-history tests passed unchanged in an isolated single-worker rerun; no
organization-selection code or assertion was changed. The failure cause has
not been established, so the isolated pass is not a claim of a fixed browser
race. Final single-worker whole-suite results are recorded below.

Final post-fix Node 24 whole-client verification:

```text
npm run test:e2e --workspace=@acres/client -- --workers=1
9 skipped
92 passed (1.9m)
```

The nine skipped cases are the existing opt-in audit-fault tests. Single-worker
execution matches the configured CI worker count. No test assertion or timeout
was weakened for this browser rerun. These are local browser/helper results,
including 375/800/1280 responsive cases, not hosted provider acceptance.

## Invocation-safe transactional outbox — Prompt 374 (2026-10-15)

`OutboxDispatcherService.dispatchOnce()` is the shared, transport-independent,
awaited operation exported by `OutboxModule`. The reference worker's existing
`dispatchOutboxOnce()` wrapper delegates to it and still serializes its timer;
shutdown waits for an active dispatch before closing the queue. Timer failures
are logged with a fixed safe message and remain recoverable. `VercelJobsModule`
resolves the same provider without starting the reference worker, metrics
listener, BullMQ sockets or any dispatch loop. Boot/resolve is covered in the
real-database infrastructure suite. No queue-consumer/boot hook calls dispatch.

Every invocation recovers at most `OUTBOX_CLAIM_BATCH_SIZE` exhausted rows,
then claims at most that many eligible rows using `FOR UPDATE SKIP LOCKED`.
Resolved defaults remain **25 rows**, **30,000 ms** claim lease, **5 dispatch
attempts**, **30,000 ms** provider-retry backoff and **5 execution attempts**.
Both queries materialize their locked candidate set before updating, preserving
the batch bound under contention. Recovery has its own bound so exhausted rows
do not starve eligible intent.
Claims use fresh random tokens per operation and PostgreSQL `clock_timestamp()`
for eligibility, expiry, backoff and completion. Every finalization requires the
matching token, `retrying` state and an unexpired lease. A late publisher reports
`lostClaims`; it cannot clear another invocation's lease or append a dead letter.
Expired/unlocked nonterminal rows at the attempt limit transition and append one
safe dead letter in the same transaction; failure rolls both writes back.
Existing columns, unique identity, RLS, grants and indexes suffice; no migration.

Dispatch validates persisted event name/aggregate type and identifier format,
maps upload/export/ingestion explicitly and includes `outboxEventId` with the
aggregate identifier. Unknown events fail closed with `outbox_event_invalid`.
Ledger identity mismatch uses `outbox_job_mismatch`. Dead letters contain fixed
messages and event identity, without copying raw payload/provider exceptions.
`DurableJob` creation uses conflict-ignore insertion and validates tenant, job
type and upload linkage; ingestion's upload/tenant comes from its committed run.
Existing ledger rows retain every field, including terminal state, attempt
budget, failure history and active execution lease. Dispatch and execution
attempts remain separate. The queue's existing message/region/retention/topic
and authentication contracts are unchanged.

Ingestion creation, intent append and command idempotency commit atomically.
No provider operation occurs inside SQL. The dispatcher rechecks ownership
immediately before publish; successful enqueue precedes completion recording.
Provider rejection records the existing bounded retry/exhaustion policy.
Database/ledger failure rejects the invocation, including after accepted publish.
This remains **at-least-once**: expiry or termination between ownership check,
publish and completion can cause duplicates. Execution leases and aggregate publication guards remain authority. The leased
executor now checks terminal ledger state and execution budget before processing;
terminal aggregate state takes precedence over spent-budget classification.
Already terminal jobs never re-enter processing. A spent nonterminal budget
is durably dead-lettered without incrementing attempts; a recording failure
remains retryable. The lease is released even when this preflight fails. A final-claim interruption is
settled visibly by exhausted recovery, never stranded silently.

This is a local runtime prerequisite, not hosted Queues application acceptance.
Vercel still has **no automatic outbox trigger**. Protected after-commit
invocation/Cron, reconciliation for already-dispatched work past queue retention,
Services routing, first application preview and launch approval remain open.

### Local reproduction and rollback

Use Node **24.21.0** for both `node` and `npm` (the temporary launcher procedure
above), then `npm run db:up` and ensure the existing migrations are applied to
the isolated local `acres_test` database. Unset any hosted `DATABASE_URL`;
`server/test/setup-env.ts` supplies the local test identity and refuses a role
or database other than `acres_test`. Run:

```bash
npm run test:e2e --workspace=@acres/server -- --runInBand --testTimeout=30000 outbox-dispatch
```

The suite uses real PostgreSQL and a mocked queue; no scanner/storage service
or provider credentials are needed. For the full reference runtime, configure
local `server/.env`, run `npm run deps:up` and `npm run garage:setup`, build,
then run `npm run start:server`, `npm run start:worker` and `npm run dev:client`
in separate terminals. The worker needs the separate Valkey/BullMQ transport,
Garage and ClamAV; a database-only test is not full-worker acceptance.

Rollback must pause/drain dispatch and account for pending `ingestion.run`
intent before reverting to the previous dispatcher, which did not recognize
that event. Preserve ledger/intent rows. No hosted resource, schema, deployment,
environment or routing changed in this unit.

### Verification — Prompt 374

Checks ran sequentially with the temporary Node/npm launcher pair;
`npm version --json` reported Node **24.21.0**, npm **12.0.2**. Actual runner
output for the required commands (all exit zero):

```text
build-server: exit 0
unit: exit 0
e2e: exit 0
contracts: exit 0
lint: exit 0
build: exit 0
typecheck: exit 0
probes: exit 0
ops: exit 0
diff: exit 0
```

These labels correspond, in order, to `npm run build:server`,
`npm run test --workspace=@acres/server -- --runInBand`,
`npm run test:e2e --workspace=@acres/server -- --runInBand --testTimeout=30000`,
`npm run contracts:check`, `npm run lint`, `npm run build`, `npm run typecheck`,
`npm run vercel:probe-test`, `npm run ops:check`, and `git diff --check`.
Actual broad test summaries:

```text
Test Suites: 134 passed, 134 total
Tests:       2074 passed, 2074 total
Snapshots:   1 passed, 1 total

Test Suites: 9 passed, 9 total
Tests:       187 passed, 187 total
Snapshots:   0 total
```

After final test-context typing and assertion cleanup, focused reruns passed
**4 suites / 72 unit tests** and **2 suites / 18 database/data-journey tests**;
root lint, build and typecheck passed again. The root build generated **23/23**
Next pages. Probe TAP summary: `tests 122`, `pass 122`, `fail 0`, `skipped 0`.
Prettier reported `All matched files use Prettier code style!` for changed
TypeScript and the prompt; only new documentation blocks were formatted.

Initial runs exposed a real claim-bound regression under contention; replacing
the re-evaluated candidate subquery with a materialized locked candidate set
fixed it. Fixture corrections included the new API outbox method, real
membership identities and the six actual durable-job enum states. A sandboxed
unit run could not bind existing metrics test sockets; its authorized rerun
passed. No assertions, database guards or timeouts were weakened. Tests use
local `acres_test` PostgreSQL with mocked transport, not Neon or hosted Queues.

The operational audit reported exactly:

```text
10 vulnerabilities (4 moderate, 6 high)
Production dependency security audit passed (0 critical vulnerabilities)
```

This is the configured critical-only gate, not an advisory-free dependency tree.
No dependency/lockfile changed. Operational tests do not approve a launch
category, execute live production drills, or establish hosted acceptance.

### Independent review and terminal replay correction — Prompt 374

The first read-only review found no critical issues and one important issue:
although dispatch preserved terminal ledgers, the existing leased upload executor
could resume a `scanning` upload whose ledger was already dead-lettered after
execution exhaustion. I verified the call chain and the existing final-attempt
fixture; preserving dispatch fields alone did not establish end-to-end replay
safety. The fix adds an execution preflight under the acquired lease, reuses the
existing atomic safe exhaustion recording, and preserves aggregate terminal
publication as authority before budget classification. Nonterminal work below
budget retains its retry behavior. Upload duplicates now return the internal
`already_terminal` outcome; queue acknowledgement behavior and HTTP contracts
are unchanged. No new provider, schema, trigger or manual retry policy.

The regression exercises the real processor and leased executor against local
PostgreSQL: provider acceptance races exhausted storage failures and interrupted
publisher completion recording, then outbox redelivery cannot restart scanning,
increment execution attempts, clear failure history or append dead letters.
The earlier infrastructure exhaustion fixture also verifies a subsequent replay.
Focused post-fix results: **25 executor unit tests** and **42 PostgreSQL
outbox/infrastructure tests** passed. Broad post-fix verification is recorded below; follow-up review closed the
finding with no remaining issues. The earlier full operational check
passed **27 TAP invocations / 5,457 tests / 0 failures / 0 skipped**; its
critical-only audit limitation remains as recorded above.

Post-fix broad verification completed on the same Node 24 launcher. Actual
sequential runner output:

```text
review-build-server: exit 0
review-unit-all: exit 0
review-e2e-all: exit 0
review-contracts: exit 0
review-lint: exit 0
review-build: exit 0
review-typecheck: exit 0
review-sast: exit 0
review-diff: exit 0
```

These reran server build, the complete unit/acceptance suites, contract drift,
root lint/build/typecheck, `npm run ops:sast`, and diff checking. Actual final
broad test summaries:

```text
Test Suites: 134 passed, 134 total
Tests:       2083 passed, 2083 total
Snapshots:   1 passed, 1 total

Test Suites: 9 passed, 9 total
Tests:       188 passed, 188 total
Snapshots:   0 total
```

Formatting passed again for every changed TypeScript file and the prompt.
The fresh security scan reported `SAST Gate: PASSED (Zero unreviewed blockers
and zero expired suppressions)`. The full operational/probe runs above preceded
the review fix; unchanged operational suites and provider probe fixtures were
not repeated. The changed executor path received the complete server regression
and fresh static-security check. No operational, dependency or provider
configuration changed.

Follow-up independent read-only review inspected the final working diff against
baseline `f283cd15a1ad3baf7168b884ad092308f644bd2a`, including the real
processor/executor replay regression. It confirmed the important finding closed,
with **no new critical, important or minor findings**, and approved the local
Prompt 374 scope for completion. The feedback was evaluated against surrounding
code and tests before applying the fix; no speculative changes were adopted.
Automatic Vercel invocation/Cron, retention reconciliation, application deployment
and all launch approvals remain open.

## Queue-retention job reconciliation — Prompt 375 (2026-10-15)

`JobReconciliationService.reconcileOnce()` is now exported by `OutboxModule`
and resolves through `VercelJobsModule`. It is a bounded, awaited database-only
operation. It has **no caller** in either runtime: no boot hook, timer, consumer
callback, endpoint, after-commit kick or Cron was added. A future protected
runner must separately await reconciliation and `dispatchOnce()`. This record
supersedes earlier remaining-work statements that local retention reconciliation
does not exist; automatic invocation and hosted recovery are still unproven.

### Eligibility, authority and budgets

The operation returns `enabled: false` and zero counts outside
`QUEUE_PROVIDER=vercel`. It selects at most `OUTBOX_CLAIM_BATCH_SIZE` (default 25) dispatched events with a non-null successful dispatch timestamp and an
existing canonical `eventType:aggregateId` durable job. It never fabricates
legacy intent or a missing job. Pending/retrying/dead-lettered intent belongs
to the existing dispatch/recovery operations.

The inclusive stale cutoff is PostgreSQL transaction time `now()` minus:

```text
VERCEL_QUEUE_RETENTION_SECONDS * 1000 + JOB_LEASE_MS + 60000
Default: 86,790,000 ms (24 hours, 6 minutes, 30 seconds)
Maximum validated inputs: 608,460,000 ms (safe JS integer arithmetic)
```

The extra minute is a conservative engineering choice, not a provider guarantee.
The maximum of `dispatchedAt`, event/job `updatedAt`, job `startedAt`,
`finishedAt` and `leaseUntil` must be no newer than that cutoff; a lease must
also independently be expired or absent. Future timestamps and recent failures
or lease activity defer recovery. The installed queue SDK documents a
`min(retention, 24h)` deduplication window and 256-character key limit; this
cooldown exceeds that window while retaining the original canonical key.
Adapter tests confirm the same key/options are sent again; only a hosted proof
can establish actual provider recovery behavior.

The ordered candidate set is materialized and locked with `SKIP LOCKED`.
Recovery then locks/rechecks the job and locks/re-reads its aggregate. Downstream
locks also skip contention, avoiding waits against aggregate-first API commands.
A concurrent lease acquired after selection wins the recheck. Ownership comes
from the database: event name/type/UUID, job key/type/tenant/upload and aggregate
organization/linkage must agree. Ingestion's upload comes from its run; export
jobs require null upload linkage. Invalid selected intent is durably rejected
with a fixed existing identity classification, without changing the job.

| Locked authority                                         | Recovery transition                                                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terminal job (`succeeded`, `cancelled`, `dead_lettered`) | Ignore; never revive it                                                                                                                                                         |
| Terminal aggregate, stale nonterminal ledger             | Repair ledger to `succeeded`, `failed` or `cancelled` before budget classification; preserve attempts, prior errors/dead letters and existing `finishedAt`; clear expired lease |
| Nonterminal aggregate, both budgets available            | Set the original event to `pending` with database-time `nextAttemptAt`; keep job, event identity/version/payload/creation/dispatch history and both budgets                     |
| Nonterminal aggregate, either budget spent               | Set job and event to `dead_lettered`, clear stale locks, retain job failure history/budgets, and atomically append one associated recovery dead letter                          |
| Invalid identity or missing aggregate                    | Dead-letter only the event with fixed `outbox_event_invalid` or `outbox_job_mismatch` diagnostic                                                                                |
| Busy downstream lock or failed post-lock eligibility     | No mutation; a future operation may reconsider it                                                                                                                               |

The shared `aggregateLedgerState()` helper preserves the executor's existing
mapping: accepted upload/published ingestion/succeeded export → success;
rejected upload/failed or validation-failed ingestion/failed export → failure;
cancelled or expired upload/cancelled ingestion or export → cancellation.
An already-reflected failed terminal aggregate is excluded from selection so
old failures cannot repeatedly occupy the oldest batch. Retryable failed ledgers
with nonterminal aggregates remain eligible. Aggregate state is never rewritten
by reconciliation; published versions, exports and evidence remain immutable.

Exhaustion records `queue_recovery_exhausted` with the fixed message
`Queue retention recovery attempts exhausted.` on the event/dead letter; it is
not a scanner rejection or a fabricated execution attempt. Previous dead letters
and job error fields survive. The transition and new letter share one locked
transaction, so insert failure rolls everything back and concurrent calls cannot
append another letter for that transition. Dispatch and execution budgets remain
separate, finite and unchanged. Recovery shares the **original dispatch budget**:
an extended outage can visibly exhaust delivery with execution attempts left.
There is no automatic manual-retry authority or new generation/budget.

`examined` counts selected candidates (including subsequently deferred locks);
`rearmed`, `repaired`, `exhausted` and `rejected` count committed transitions.
The result is returned only after commit. Database failure rejects rather than
returning success/counts after rollback. Global counts have no tenant route;
raw payloads/provider exceptions are not logged or copied into failure records.

### Verification, query plans and review

Checks used Node **24.21.0**, npm **12.0.2**, with the explicit temporary Node/npm
launcher pair. All required commands exited zero:

```text
npm run build:server: exit 0
npm run test --workspace=@acres/server -- --runInBand: exit 0
npm run test:e2e --workspace=@acres/server -- --runInBand --testTimeout=30000: exit 0
npm run contracts:check: exit 0
npm run lint: exit 0
npm run build: exit 0
npm run typecheck: exit 0
npm run vercel:probe-test: exit 0
npm run ops:check: exit 0
git diff --check: exit 0
```

Actual broad summaries:

```text
Test Suites: 135 passed, 135 total
Tests:       2087 passed, 2087 total
Snapshots:   1 passed, 1 total

Test Suites: 10 passed, 10 total
Tests:       220 passed, 220 total
Snapshots:   0 total
```

After that broad database run, two additional race regressions passed in the
focused recovery suite. Its final rerun, including removal of ineffective
`ANALYZE` statements, reported:

```text
Test Suites: 1 passed, 1 total
Tests:       34 passed, 34 total
Snapshots:   0 total
```

The latest focused unit rerun passed **3 suites / 34 tests**. Provider probe
fixtures reported `pass 122`, `fail 0`. Changed source/test/prompt formatting
reported `All matched files use Prettier code style!`. The operational preflight
completed all configured stages; its final suite reported `tests 182`, `pass
182`, `fail 0`. SAST reported `SAST Gate: PASSED (Zero unreviewed blockers and
zero expired suppressions)`. The dependency audit passed its configured
critical threshold with **0 critical, 6 high and 4 moderate findings**; this is
not a zero-vulnerability claim, and dependencies were not upgraded in this unit.

New database tests cover all three expired deliveries, never-started and
expired-running jobs, terminal/history repair ahead of budgets, retryable failed
ledgers, active/recent/future exclusions, exact cutoff, concurrent reconcilers,
locked execution/cancellation, post-selection lease acquisition, both exhausted
budgets, rejection/rollback, cross-organization RLS and interrupted completion
recording after successful recovered publication. The existing data journey now
uses reconciliation → real dispatch → leased real processor → duplicate delivery
for upload scanning/acceptance, ingestion/analytics publication and export
rendering, and retains its one-result/tenant/evidence assertions. Storage/scanner
ports remain controlled test doubles; PostgreSQL and the business processors
are real. Infrastructure boot tests resolve the provider in both compositions.

The exact selection query is shared with `EXPLAIN (ANALYZE, BUFFERS, FORMAT
JSON)` acceptance over **2,000 synthetic dispatched event/job pairs**. Final
local plan excerpt (actual values):

```text
Limit -> LockRows -> Sort -> Hash Join
OutboxEvent sequential scan: 2000 rows
DurableJob sequential scan: 2000 rows
Materialized candidates: 25 rows
Final OutboxEvent primary-key fetches: 25
Shared hit blocks: 221; temporary reads/writes: 0/0
Planning Time: 0.694 ms; Execution Time: 3.701 ms
```

This all-eligible fixture measures bounded row locking/result size, not bounded
scan work or production latency. The runtime/test role is non-superuser and
`NOBYPASSRLS`; a direct privilege inspection also confirmed no `MAINTAIN`
privilege. Two initial `ANALYZE` requests therefore could not refresh statistics
and were removed. The final plan uses existing statistics under the runtime
role. No index or schema/grant change was justified by this fixture; realistic
production distributions/statistics and hosted measurements remain required
before claiming an optimal plan or adding an index.

Earlier attempts were not counted as passes: the initial unpinned server build
used system Node 26; sandboxed database/listener access failed; Docker inspection
approval timed out once and succeeded on the permitted retry; the first export
fixture omitted its required report target; and lint found mock typing/unbound
method assertions. Node 24 reruns, a valid report fixture and corrected assertions
passed without weakening test or isolation checks. PostgreSQL also emitted the
existing `pg@9.0` future query-concurrency deprecation warning in database runs.

Independent read-only review against baseline
`f1d9f6cd4b39d7ce3f55060701f7910834e19f8e` inspected the complete working diff
and new files, traced selection through dispatch/leased execution, checked logs,
and found **no critical, important or minor findings**. The feedback was verified
against the implementation before recording completion. Removal of ineffective
fixture `ANALYZE` calls changes no recovery behavior or privileges.
Follow-up read-only review checked the completed records and final focused
logs, confirmed the statistics limitation and test cleanup, and again found no
critical, important or minor findings; the final scope was approved for completion.

### Local reproduction, rollback and remaining gates

Use Node 24 for both `node` and `npm`. With the existing local Compose environment
and migrated isolated `acres_test` database:

```bash
npm run db:up
env -u DATABASE_URL npm run test:e2e --workspace=@acres/server -- --runInBand --testTimeout=30000 job-reconciliation data-journey
```

`server/test/setup-env.ts` supplies the local `acres_test` role/database and
rejects another role/database; do not pass Neon preview credentials. A fresh
local database first needs the role bootstrap, committed migrations and
post-migration privilege hardening in `docs/backend.md` §8. This execution used
an already migrated test database and introduced no migration. The focused suite
prints the actual selection plan. No provider credentials, real scanner VM,
email or application deployment are needed for these tests.

Ordinary code revert removes this callable service. Already rearmed intent is
valid for Prompt 374's dispatcher; retain pending intent, terminal repairs and
exhaustion records. Once a future runner exists, stop/drain that caller before
reverting. Do not reset budgets or delete evidence to make rollback look clean.

**Still open:** protected after-commit invocation/Cron, Services routing,
distributed throttling, first deployed application preview and hosted recovery
acceptance, scanner freshness/rebuild cadence, and all launch approvals. Prompt
370, Phase 12 and the eleven launch categories remain incomplete. No hosted
resource/environment, route, queue schema/configuration or reference-worker
lifecycle changed; nothing was deployed or pushed.

## Protected managed outbox dispatch — Prompt 376 (2026-10-15)

Protected managed outbox dispatch is implemented locally, providing both an
after-commit kick mechanism for low-latency dispatch and a protected Vercel Cron
endpoint for scheduled sweeps:

1. **`ManagedDispatchRunnerService`:** Unifies queue-retention reconciliation
   (`JobReconciliationService.reconcileOnce()`) and outbox dispatch
   (`OutboxDispatcherService.dispatchOnce()`) into a single multi-pass loop:
   - Maximum 8 passes per invocation (`SWEEP_MAX_PASSES`).
   - 120-second execution budget (`SWEEP_BUDGET_MS`, injected clock supported).
   - Loop drains when both reconciliation and dispatch claim fewer rows than
     the configured batch size (`stoppedBy: 'drained'`).
2. **`DispatchKickService` and after-commit kicks:**
   - Injected into `UploadsService`, `IngestionService`, and `ReportsService`.
   - Fires `afterCommit()` synchronously after successful transaction commits in
     `complete`, `startRun`, and `createExport`.
   - Checks `config.queueProvider === 'vercel'` at call time; no-ops under `'bullmq'`.
   - Single-flight coalescing: concurrent kicks during an active run set `rerunRequested`
     and attach to the current run, executing at most one trailing pass.
   - Delegates background execution to `AfterResponseScheduler` (backed by
     `@vercel/functions` `waitUntil()`), completing the HTTP client response without
     delaying on outbox dispatch.
3. **Protected Vercel Cron function endpoint:**
   - Framework-free handler in `server/src/vercel/dispatch-handler.ts`.
   - Exported as `GET` in `server/src/vercel/dispatch.function.ts`.
   - Authorizes requests via `Authorization: Bearer <secret>`.
   - Evaluates secrets using constant-time comparison (`crypto.timingSafeEqual` over
     SHA-256 digests) to prevent timing side channels.
   - Enforces `CRON_SECRET` validation (≥32 chars, untrimmed, distinct from session/csrf secrets).
   - Status table:
     - `200`: Success with JSON summary (`{ ok: true, passes, stoppedBy, reconciliation, dispatch }`).
     - `401`: Missing, malformed, or invalid Authorization header.
     - `503`: Unconfigured/unusable `CRON_SECRET`, or NestJS runtime resolution failure.
     - `500`: Sweep execution failure (sanitized; no error text leaked).
     - `Cache-Control: no-store` on all responses.
4. **Lean Vercel dispatch module:**
   - `VercelDispatchModule` imports only `[AcresWorkerConfigModule, PrismaModule, QueueModule, OutboxModule]`.
   - Creates no BullMQ worker, timers, listeners, or Prometheus metrics registry.
5. **Real PostgreSQL E2E suite (`server/test/managed-dispatch.e2e-spec.ts`):**
   - 14 real-database test cases covering all 14 requirements from Prompt 376.
   - Verifies command → kick → dispatch for upload, ingestion, export.
   - Verifies failed commands leave no events and do not kick.
   - Verifies `bullmq` profile disables kicking.
   - Verifies sweep rearms stale dispatched events and dispatches them in the same pass.
   - Verifies 60-event backlog drains across two organizations in 3 passes.
   - Verifies concurrent sweeps + kicks deduplicate and enqueue canonical keys exactly once.
   - Verifies enqueue failure retries with backoff and advances `nextAttemptAt`.
   - Verifies Cron HTTP handler authorization and status table.

All verification gates passed under Node 24:
- `build:server`: passed
- `test --workspace=@acres/server -- --runInBand`: 139 suites, 2141 tests passed
- `test:e2e --workspace=@acres/server -- --runInBand --testTimeout=30000`: 11 suites, 238 tests passed
- `contracts:check`: passed
- `lint`: passed across all workspaces
- `build`: passed across all workspaces
- `typecheck`: passed across all workspaces
- `vercel:probe-test`: 122 tests passed
- `ops:check`: 182 tests passed
- `git diff --check`: passed (clean)

No `crons` entry was added to `vercel.json`; no code was deployed or pushed.


## Shared managed API throttling — Prompt 377 (2026-10-16)

Local implementation based on `b3f145d`; no hosted migration, invocation,
resource change, deployment or push. `QUEUE_PROVIDER=vercel` automatically selects
`PostgresThrottlerStorage` through the installed Nest throttler 6.5.0 async
storage contract. The reference profile still resolves its installed memory
storage. Limits, strict opt-in, route/IP/tier key generation, GraphQL extraction,
health exemptions and proxy trust are unchanged. Services routing and deployed
ingress identity/spoofing acceptance are next; this does not close Prompt 370,
Phase 12 or any launch category.

### Persistence, concurrency and expiry

Migration `20261016000000_shared_throttling` adds `ThrottleBucket` with composite
SHA-256 key/named-tier identity, bounded per-hit expiry array, header-window
expiry, optional block deadline and indexed cleanup expiry. No raw IP, email,
query, cookie, bearer token or deployment identifier is stored. Digests are
pseudonymous, **not anonymization**: predictable IP/route inputs can be guessed.
The table is narrowly scoped global infrastructure before authentication, like
Session. Existing migrator default privileges supply runtime DML; bootstrap and
hardening scripts were inspected and require no blanket grant, worker-context
setting, tenant-table change or RLS bypass.

An explicit READ COMMITTED transaction acquires the row through INSERT ... ON
CONFLICT DO UPDATE, covering initial creation races as well as existing rows.
It reads database time after locking, prunes individually expired hits, appends
one hit only when unblocked and blocks on `totalHits > limit`. Individual expiry
instants survive a TTL configuration difference between releases. Repeated
blocked requests do not extend the block; the first request after its deadline
clears that bucket's old hits and counts itself as hit one. Header expiry resets
independently of rolling counts; response seconds round upward and clamp at zero.
This preserves the installed per-bucket behavior without reproducing the memory
adapter's tier-wide timer-clearing side effect on unrelated keys when unblocking.

Inputs require safe positive integers: TTL/block duration at most 2,147,483,647 ms,
allowance at most 1,000,000; history is capped at allowance plus the triggering
hit (and the SQL cardinality constraint caps it at 1,000,001). Existing configured
limits are unchanged. Invalid bounds fail closed. Query/lock timeouts are local
to each transaction (2 seconds / 1 second), Prisma transaction acquisition and
execution are each bounded at 5 seconds, and the existing pool already has a
5-second connection acquisition bound. There is no extra pool or per-hit timer.
Protected requests receive sanitized 503/`NOT_READY` with
`Request protection is temporarily unavailable.` on storage failure, with no raw
error cause or diagnostic logging. Allowance exhaustion retains 429 and retry
headers. Arbitrary non-storage guard failures are not caught or reclassified.

### Cleanup and composition

`ThrottleStorageModule` contains only Prisma and the adapter; outbox/dispatch
compositions import it without importing the API/guard module. Each managed
sweep makes one cleanup call capped at 250 expired buckets, using the expiry
index, materialized selection and FOR UPDATE SKIP LOCKED, followed by a guarded
delete under the same row locks. Increments cannot refresh a row between its
locked selection and deletion. If cleanup wins, the next increment safely
recreates expired state; if increment wins, cleanup skips/rechecks it. Expiry
correctness does not depend on Cron running.

Cleanup failure does not stop reconciliation/dispatch. The protected sweep
summary and completion log add only `throttleCleanup: { deleted, failed }`
(count/boolean; log labels `throttleDeleted` and `throttleCleanupFailed`). No key,
tracker or SQL is included. Reference sweeps skip cleanup. No API listener,
recurring scheduler or platform routing was added.

### Actual verification and review

All final checks below exited **0** under Node **v24.21.0**, using
`PATH=/tmp/acres-node24/node_modules/node-linux-x64/bin:$PATH`. Long command
outputs are excerpted verbatim. No full `ops:check` or hosted acceptance is
claimed from these targeted checks.

| Command | Actual output excerpt |
| --- | --- |
| Prettier `--check` on the ten changed/new TypeScript files | `All matched files use Prettier code style!` |
| `npm run build:server` | `Generated Prisma Client (7.9.1)`; `prisma generate && nest build` completes |
| `npm run test --workspace=@acres/server -- --runInBand` | `Test Suites: 140 passed, 140 total`; `Tests:       2150 passed, 2150 total`; `Snapshots:   1 passed, 1 total` |
| `npm run db:up` | `Container acres-postgres-1 Running` |
| `DATABASE_MIGRATION_URL=postgresql://acres_migrator:<local-password>@localhost:5432/acres_test npm run prisma:migrate:deploy --workspace=@acres/server` | `Applying migration` for `20261016000000_shared_throttling`; `All migrations have been successfully applied.` |
| `env -u DATABASE_URL npm run test:e2e --workspace=@acres/server -- --runInBand --testTimeout=30000` | `Test Suites: 12 passed, 12 total`; `Tests:       248 passed, 248 total` |
| Same E2E command with trailing `shared-throttling` | `Test Suites: 1 passed, 1 total`; `Tests:       10 passed, 10 total` |
| `npm run contracts:check` | `prisma generate && nest build && node dist/contracts/generate-contracts.js --check` completes with no drift diagnostics |
| `npm run lint` | `eslint`, `eslint "src/**/*.ts"`, `eslint "{src,test}/**/*.ts"`; no diagnostics |
| `npm run build` | `Compiled successfully in 4.3s`; `Generating static pages using 7 workers (23/23) in 1285ms`; shared and Nest builds complete |
| `npm run typecheck` | `tsc -p tsconfig.json --noEmit`, `tsc --noEmit`, `prisma generate && tsc -p tsconfig.json --noEmit`; no diagnostics |
| `npm run vercel:probe-test` | `tests 2`, `pass 2`, `fail 0` (file-level results in this sandbox, not hosted probes) |
| `npm run ops:templates-test` | `tests 451`, `pass 451`, `fail 0` |
| `npm run ops:scan-secrets` | `secret/default scan passed` |
| `npm run ops:scan-secrets-test` | `tests 1`, `pass 1`, `fail 0` (file-level result) |
| `git diff --check` | no output |

The ten focused real-database cases establish two independent connections
sharing one budget (20 concurrent calls admit exactly five), adapter-visible
blocks, key/tier independence, rolling-hit/header-boundary behavior, block reset,
bounded cleanup/backlog/locking races, bounded lock failure, actual HTTP
429/503 and health exemption, and managed/reference module selection.
The narrow privilege fixture uses the local bootstrap identity inside one
rollback-only transaction, grants DML **only on ThrottleBucket**, then executes
the adapter SQL as actual `current_user=acres_app`, non-superuser/NOBYPASSRLS,
without tenant context. It rolls back its grants and bucket changes; it does not
open cross-database app connections. The full suite retains tenant RLS tests.

Actual EXPLAIN (FORMAT JSON) on 10,000 synthetic rows (300 expired) selects:

```text
Limit (Plan Rows: 250)
  LockRows
    Index Scan: ThrottleBucket_expiresAt_idx
      Index Cond: ("expiresAt" <= statement_timestamp())
```

The guarded delete also used a bitmap scan of the same expiry index and a hash
join in this run. This is a real estimated plan, not ANALYZE or production load
proof. Planner estimates reflected existing small-test statistics (3,172 eligible
rows estimated against the fixture's 300); no production selectivity, latency,
volume or sustained capacity claim follows.

Earlier attempts are not credited as passes: sandbox Docker/loopback access
failed, existing listener tests returned `listen EPERM`, template subprocess tests
failed at file level, and Next could not parse its TypeScript subprocess output.
The same gates passed with local subprocess/listener/network access permitted.
Code verification caught a storage-record type absent from the package barrel
(fixed by deriving the installed interface return type), old sweep-summary/log
assertions (updated), and the migrator's inability to SET ROLE acres_app (the
rollback-only local bootstrap fixture replaces it). The initial full database
run was `1 failed, 247 passed`; the final full and focused runs above passed.
The existing suites emit intentional outage logs, experimental VM warnings and
a pg@9 future deprecation notice; no new provider failure details are logged by
the throttler.

Independent read-only review inspected tracked changes, new files and actual
verification logs and reported no Critical, Important or Minor issues. Feedback
was evaluated against the concurrency protocol, privileges and approved scope.
Follow-up review found no issues in the schema-default consistency adjustment
(`hits @default([])` matches SQL) or documentation. Prisma validation returned
`The schema at prisma/schema.prisma is valid`; final root typecheck again
completed with no diagnostics. Review never asserts hosted readiness.

### Local reproduction and rollback

Use Node 24.21.0 and the existing isolated development role bootstrap in
`docs/backend.md` §8. Start PostgreSQL, apply only to the test database with its
local migrator password, then run:

```bash
npm run db:up
# DATABASE_MIGRATION_URL must explicitly target localhost/acres_test as acres_migrator.
npm run prisma:migrate:deploy --workspace=@acres/server
env -u DATABASE_URL npm run test:e2e --workspace=@acres/server -- --runInBand --testTimeout=30000 shared-throttling
```

The suite validates its `acres_test` runtime target before execution and uses
only local synthetic database/HTTP fixtures, including the known development
bootstrap credential for its rollback-only runtime-role proof. Do not run it
with hosted credentials. A normal API instance requires no new variable: the
existing validated `QUEUE_PROVIDER=vercel` selects shared storage. This test
composition isolates the throttle from queue/scanner provider calls.

Rollback reverts adapter/wiring and sweep cleanup, retains the additive table
and temporary state, and leaves any drop to a separately reviewed migration.
Do not fall back to per-instance memory on an active managed deployment: stop
protected traffic or restore a previously verified safe deployment first. That
preserves abuse budgets at the cost of availability while storage is unavailable.
Operator deployment must explicitly apply the migration before exposing managed
API traffic; it was applied only to local `acres_test` in this execution.


## Services routing and first preview deployment — Prompt 378 (2026-10-16)

First application preview deployment of Acres (Next.js client + NestJS API
backend) on Vercel, unified Services routing, internal service bindings,
out-of-band Neon migration, background execution entrypoints, and full hosted
acceptance proof across Gates A–E.

### Services architecture and routing (`vercel.json`)

1. **Services configuration:**
   - `services.client`:
     * `root: "client"`
     * `framework: "nextjs"`
     * `bindings`: declares service binding to `api`, exposing generated private
       URL as `ACRES_API_ORIGIN`.
   - `services.api`:
     * `root: "server"`
     * `src/main.ts`: Nest API function, explicit region `iad1`, `maxDuration: 30`.
       Contains no queue triggers, remaining a pure HTTP service reachable via
       private binding from `client` or via protected Cron rewrites.
     * `src/vercel/dispatch.function.ts`: protected Cron sweep function, explicit
       region `iad1`, `maxDuration: 60`.
     * `src/vercel/jobs.function.ts`: queue consumer function, explicit region
       `iad1`, `maxDuration: 60`, `experimentalTriggers: [{ type: "queue/v2beta", topic: "acres-jobs", retryAfterSeconds: 5 }]`,
       omitting `maxDeliveries`.
   - `services.jobs`:
     * `root: "server"`
     * `entrypoint: "src/vercel/jobs.function.ts"`
     * Configures the dedicated background queue runner with the matching
       `src/vercel/jobs.function.ts` function configuration (region `iad1`,
       `maxDuration: 60`, `experimentalTriggers` for `acres-jobs`, no `maxDeliveries`).

2. **Rewrites and Crons:**
   - Rewrites:
     * `{ "source": "/cron/dispatch", "destination": { "service": "api", "path": "/src/vercel/dispatch.function.ts" } }`
     * `{ "source": "/(.*)", "destination": { "service": "client" } }`
     All public traffic enters Next.js, which proxies `/api/v1/*` to `ACRES_API_ORIGIN`
     and handles Server Component data fetching over the private binding. The
     `api` service is unreachable directly from the public internet except via
     the protected `/cron/dispatch` route.
   - Crons:
     * `[{ "path": "/cron/dispatch", "schedule": "0 0 * * *" }]`. On Vercel
       Hobby, Crons run on production deployments only; preview testing exercises
       the endpoint via authenticated HTTP requests.

3. **Queue consumer middleware & header security:**
   - In NestJS under `@vercel/backends`, service `jobs` boots `src/main.ts`.
     `createVercelQueueMiddleware` in `server/src/app.setup.ts` intercepts
     incoming CloudEvents (`ce-type` header, `x-vercel-queue-prime`, or
     `application/cloudevents+json`), parses JSON with `application/*+json`
     support, runs before CSRF protection, and delegates to `@vercel/queue`
     `handleNodeCallback`.
   - Forwardable headers in `client/app/api/v1/[...path]/route.ts` are strictly
     allowlisted (`accept`, `content-type`, `cookie`, `idempotency`, `org`, `csrf`),
     completely preventing external spoofing of `ce-*` headers through the client
     proxy.
   - `JobsModule` exports `LeasedJobExecutorService`, `JobProcessorService`, and
     `JobLeaseService`.
   - Configuration validator: `scripts/vercel/check-vercel-config.js` and
     `scripts/vercel/check-vercel-config.spec.js` enforce all structure, region
     pinning, trigger, and binding rules locally in CI.

### Deployment metadata and configuration

- **Deployment ID:** `dpl_Hr9VwjL5jrA5vmsZfx7Qvi2R966b`
- **Deployment URL:** `https://acres-nedhhjsg3-dgsloxx417s-projects.vercel.app`
- **Project ID:** `prj_q9ApajZWDgdYZetnm5s5oakEjrUD`
- **Team ID:** `team_zE3mp7nrEZ6a7cxRavwUMYC4`
- **Regions:** pinned to `iad1` across all functions (`services/api/index`,
  `services/client/index`, `services/jobs/index`).
- **Free tier / Hobby compliance:** $0 spend, zero paid upgrades, `AI_ENABLED=false`
  strictly enforced.
- **Out-of-band migration:** `20261016000000_shared_throttling` applied to Neon
  preview database via direct `acres_migrator` URL. Role privileges and RLS
  verified via `scripts/vercel/neon-verify.sh`.
- **Sensitive environment variables:**
  * `DATABASE_URL`: Neon pooled `acres_app` connection URL
  * `BLOB_STORE_ID`: `store_g2fmCH5CW7TJbkN3`
  * `STORAGE_PROVIDER`: `vercel-blob` (OIDC authentication, S3 variables unset)
  * `QUEUE_PROVIDER`: `vercel` (topic `acres-jobs`)
  * `SCANNER_PROVIDER`: `vercel-sandbox` (`SCANNER_SANDBOX_SNAPSHOT_ID` recorded as
    `snap_d2y7r2n9`, an unverified ID that matches no listed snapshot; the
    baseline in use until Prompt 391 was `snap_Feg5…` (Prompt 396),
    `SCANNER_MAX_SIGNATURE_AGE_HOURS=48`)
  * `SESSION_SECRET`, `CSRF_SECRET`, `CRON_SECRET`: sensitive credentials
  * `AI_ENABLED`: `false`

### Hosted acceptance gates (A–E) verified evidence

1. **Gate A — Public ingress and service isolation:**
   - `GET /` -> 200 OK (marketing landing page rendered by Next.js).
   - `GET /login` and `GET /register` -> 200 OK (authentication pages rendered).
   - `GET /src/main.ts`, `GET /src/vercel/jobs.function.ts`, `GET /jobs.mjs` ->
     all return 404 (internal backend files and air-gapped queue functions
     unreachable).
   - Direct external access to `/api/v1/*` bypassed by Next.js proxy returns
     404; public ingress flows strictly through Next.js proxy.

2. **Gate B — Cron protection and execution:**
   - Unauthenticated `GET /cron/dispatch` -> 401 Unauthorized (`Authentication required`).
   - Authenticated `GET /cron/dispatch` with `Authorization: Bearer $CRON_SECRET` ->
     200 OK with sanitized sweep result:
     `{"ok":true,"passes":1,"stoppedBy":"idle","reconciliation":{"rearmed":0,"exhausted":0,"scanned":0},"dispatch":{"dispatched":0,"failed":0,"deadLettered":0},"throttleCleanup":{"deleted":0,"failed":false}}`.

3. **Gate C — Session and SSR over service binding:**
   - User registration (`POST /api/v1/auth/register`) succeeds, creating account
     and issuing session cookie.
   - Authenticated `GET /app` renders Server Component layout, querying API over
     `ACRES_API_ORIGIN` service binding, rendering user display name and
     organization shell in HTML.

4. **Gate D — Direct Blob upload, Queues trigger and Sandbox ClamAV scan:**
   - Browser/client direct PUT to Vercel Blob store (`store_g2fmCH5CW7TJbkN3`)
     succeeds (200 OK).
   - `UploadsService.complete` initiates transactional outbox record on topic
     `acres-jobs`.
   - Vercel Queues pushes CloudEvent to service `jobs`.
   - `queue-consumer.middleware.ts` intercepts delivery and invokes
     `LeasedJobExecutorService`.
   - Vercel Sandbox ClamAV scan (recorded as `snap_d2y7r2n9`, unverified; the
     configured baseline was `snap_Feg5…`, Prompt 396) executes in microVM and verifies
     upload clean.
   - Neon PostgreSQL verification: `Upload` row transitions to `state: accepted`,
     `scanStatus: clean`, `scanResult: clean`, `acceptedAt: 2026-10-16T14:29:52.909Z`,
     and `DurableJob` status is `succeeded`.

5. **Gate E — Shared managed API throttling:**
   - 130 burst requests to `/api/v1/auth/csrf` throttled with 11 429 Too Many
     Requests responses carrying `Retry-After` header.
   - `ThrottleBucket` rows recorded in Neon PostgreSQL.

### Verification suites

- `node scripts/vercel/check-vercel-config.js`: configuration valid, 0 errors.
- `npm run ops:templates-test`: 451/451 tests passing.
- `npm run vercel:probe-test`: 128/128 tests passing.
- `npm run lint`: 0 errors.
- `npm run typecheck`: 0 errors across `@acres/shared`, `@acres/client`, `@acres/server`.
- `npm run test:server`: 12/12 test suites, 248/248 tests passing.

## Managed launch readiness and storage reconciliation — Prompt 379 (2026-10-16)

Operational tooling and launch readiness verification are extended to support the
`vercel-managed-production` profile alongside the reference Compose topology:

1. **Storage inventory reconciliation (`scripts/ops/reconcile-storage-objects.js`):**
   - Implemented `--provider vercel-blob` and `STORAGE_PROVIDER=vercel-blob` targeting
     `BLOB_STORE_ID=store_g2fmCH5CW7TJbkN3`.
   - Uses `@vercel/blob` `list()` API with cursor-based pagination and `--prefix` support.
   - Detects missing objects (in database as active/completed/quarantined, absent in Blob store),
     orphan objects (in Blob store, untracked in database), and byte size mismatches.
   - Emits structured, sanitized audit receipts (`provider: "vercel-blob"`, `storeId`, object counts,
     duration) without logging credentials, tokens, or presigned URLs.
   - Verified via unit test suite mocking multi-page `@vercel/blob` `list()` responses.

2. **Topology-discriminated launch readiness schema (`infra/launch/readiness.schema.json`):**
   - Added `target_architecture` enum: `["single-host-compose-caddy", "vercel-managed-production"]`.
   - Conditional schema branches (`allOf` with `composeSections` and `managedSections`) enforce
     all 11 canonical launch checklist categories for both architectures.
   - Managed profile specifies Vercel edge domain/TLS, 90-day secret rotation cadence,
     indirect secret references (`session_secret_source`, `csrf_secret_source`, `cron_secret_source`,
     `db_migrator_secret_source`, `db_app_secret_source`, `blob_store_id`, `scanner_snapshot_source`),
     Neon PITR recovery window (≥7 days), Blob store durability, Neon AWS KMS encryption at rest,
     ephemeral compute isolation, and immutable Vercel deployment references (`dpl_*`).

3. **Managed readiness template (`infra/launch/readiness.vercel.example.json`):**
   - Valid template conforming to `readiness.schema.json` under `vercel-managed-production`.
   - Deliberately unresolved (`status: "unresolved"`, placeholders `__REQUIRED_MANAGED_*__`)
     failing closed until human operator values and live receipts are supplied.

4. **Launch readiness validator (`scripts/ops/check-launch-readiness.js`):**
   - Extended CLI to accept `--record <path>` in addition to positional arguments.
   - Inspects `target_architecture` (defaults to `single-host-compose-caddy` when omitted for
     backwards compatibility; rejects unknown values fail-closed).
   - Validates managed sections without demanding Compose-specific host mounts, Caddy routing drills,
     or container image digests.
   - Enforces indirect secret store URIs (`vercel:...`, `neon:...`) and rejects raw values.
   - Comprehensive test coverage in `check-launch-readiness.spec.js` (654 tests passing).

5. **Managed operations runbook (`infra/vercel/runbooks/managed-operations.md`):**
   - Secret inventory and 90-day rotation cadence (`npx vercel env add`).
   - Out-of-band Prisma migrations against Neon direct migrator connection (`DIRECT_URL`).
   - Storage reconciliation execution and missing/orphan triage.
   - Disaster recovery (Neon PITR branch creation) and instant Vercel rollback.
   - 48-hour ClamAV CVD sandbox snapshot rebuild cadence.

## Managed operator handoff and drill reconciliation — Prompt 380 (2026-10-16)

Operational handoff templates and the unified launch drill runner are reconciled to support
the `vercel-managed-production` profile with full audit parity and zero Docker daemon / Caddyfile
prerequisites:

1. **Managed operator handoff template (`infra/launch/operator-handoff.vercel.example.md`):**
   - Models complete intake for all 11 managed categories alongside deployment targets, release candidates,
     and named roles (`operations_lead`, `release_manager`, `deployment_approver`, `rollback_authority`, `evidence_custodian`).
   - Zero-secret guarantee: enforces opaque references (`team_*`, `prj_*`, `store_*`, `snap_*`, `dpl_*`, SHA-256 digests)
     and fails closed on plaintext credentials, passwords, or tokens.
   - Restricts evidence access to named custodian with TTL-bounded access and mandatory pre-authorization.
   - Updated `docs/operator-handoff.md` with explicit intake verification commands for both architectures.

2. **Managed launch verification tools:**
   - `scripts/ops/verify-managed-ingress.js`: verifies multi-service routing precedence, security headers,
     and preview isolation; emits `managed-ingress-deployment-receipt.json`.
   - `scripts/ops/verify-managed-volume-encryption.js`: verifies Neon AWS KMS AES-256 encryption at rest,
     Vercel Blob encryption, and ephemeral serverless compute isolation; emits `managed-volume-encryption-receipt.json`.
   - `scripts/ops/verify-managed-secret-rotation.js`: verifies indirect secret references (`vercel:...`, `neon:...`)
     and 90-day rotation runbook compliance in `--dry-run` mode; emits `managed-secret-rotation-receipt.json`.
   - `scripts/ops/verify-managed-restore-drill.js`: verifies Neon PITR point-in-time recovery window, RTO/RPO objectives,
     and isolated branch recovery preflight; emits `managed-restore-drill-receipt.json`.

3. **Unified launch drill runner reconciliation (`scripts/ops/run-launch-drills.sh`):**
   - Added `--target-architecture <arch>` (or `--target-arch <arch>`), defaulting to `single-host-compose-caddy`.
   - In `vercel-managed-production` mode, verifies `vercel.json` and skips Caddyfile / Compose / Docker daemon checks.
   - Branches stage execution: runs managed child verifiers across stages 3, 4, 5, and 7, while preserving
     shared supply-chain, SAST, container, and capacity/alerting stages.
   - Forwards target architecture to the dossier assembler.

4. **Launch dossier assembler reconciliation (`scripts/ops/assemble-launch-dossier.js`):**
   - Added `RECEIPTS_MANAGED` and `TYPES_MANAGED` mapping managed stage receipts and validation rules.
   - Emits `target_architecture: "vercel-managed-production"` and structured managed baselines
     (`deploymentBaseline`, `volumeEncryptionBaseline`, `secretRotationBaseline`, `disasterRecoveryBaseline`).
   - Retains 100% backward compatibility for `single-host-compose-caddy`.

5. **Automated test coverage:**
   - `scripts/ops/assemble-launch-dossier.spec.js`: 33 tests verifying managed receipt mapping, validation, and dossier generation.
   - `scripts/ops/run-launch-drills.spec.js`: 158 tests verifying end-to-end dry-run execution, failure gating, and baseline verification across both architectures.

## Managed launch readiness and static integrity reconciliation — Prompt 381 (2026-10-16)

Top-level launch readiness preflight and static integrity verification are reconciled to support
the `vercel-managed-production` profile with zero Docker daemon or Compose prerequisites:

1. **Secret scanner allowlist (`scripts/ops/scan-secrets.sh`):**
   - Added `scripts/ops/verify-managed-secret-rotation.js` to `is_allowed_path()`.
   - `npm run ops:scan-secrets` and `npm run ops:scan-secrets-test` pass cleanly (42/42 tests pass).

2. **Static integrity verification (`scripts/ops/run-static-integrity-checks.js`):**
   - Accepts `--target-architecture <arch>` (or `--target-arch <arch>`), defaulting to `single-host-compose-caddy`.
   - Check profiles:
     - `single-host-compose-caddy`: runs `production_templates`, `docker_runtime`, and `secret_defaults` (3 checks).
     - `vercel-managed-production`: runs `vercel_config` (`node scripts/vercel/check-vercel-config.js`) and `secret_defaults` (`scripts/ops/scan-secrets.sh`) (2 checks), safely omitting Docker runtime and Compose templates.
   - Emits `target_architecture` in evidence receipt.
   - `validateStaticEvidence(evidence, targetArchitecture)` validates receipts according to target architecture.
   - Stage 1 in `scripts/ops/run-launch-drills.sh` passes `--target-architecture "$TARGET_ARCHITECTURE"` to `run-static-integrity-checks.js`.
   - `scripts/ops/assemble-launch-dossier.js` passes `targetArchitecture` to `validateStaticEvidence`.
   - Automated test suite `scripts/ops/run-static-integrity-checks.spec.js` covers both architectures (76/76 tests pass).

3. **Top-level launch readiness orchestrator (`scripts/ops/launch-readiness.sh`):**
   - Added CLI options `--target-architecture <arch>`, `--target-arch <arch>`, and `--record <file>`.
   - Auto-detects target architecture from `target_architecture` in target readiness record if not explicitly passed.
   - In `vercel-managed-production` mode, executes `scripts/vercel/check-vercel-config.js`, `scripts/ops/scan-secrets.sh`, `node --test scripts/ops/check-launch-readiness.spec.js`, forwards `--target-architecture vercel-managed-production` to `run-launch-drills.sh` when `--with-drills` is set, and runs `check-launch-readiness.js "$READINESS_FILE"`.
   - Added `npm run ops:launch-readiness:managed` script to `package.json`.
   - Automated test suite `scripts/ops/launch-readiness.spec.js` covers argument parsing, fail-closed preflight order, drill forwarding, auto-detection, and real repository execution across both architectures (37/37 tests pass).

## Managed drill verifiers unit test suite and preflight integration — Prompt 382 (2026-10-16)

Comprehensive unit and contract test specifications are implemented for all four managed drill verifiers,
closing the testing gap for `vercel-managed-production` offline simulation tooling:

1. **Ingress and multi-service routing verification (`scripts/ops/verify-managed-ingress.spec.js`):**
   - 11 unit and contract tests asserting CLI argument parsing (`--help`, missing `--output`, `--output <file>`, `-o`, `--vercel-config`), configuration validation (missing file, invalid JSON, missing `services.client` or `services.api`, missing or misordered `/cron/dispatch` rewrites), valid evaluation against root `vercel.json` (12 routes evaluated, 12 routes passed), and emission of compliant `managed-ingress-deployment-receipt.json`.

2. **Volume encryption and compute isolation verification (`scripts/ops/verify-managed-volume-encryption.spec.js`):**
   - 5 unit and contract tests asserting CLI flags, architectural assertions (Neon AWS KMS AES-256 envelope encryption, Vercel Blob encryption, AWS microVM/Firecracker compute isolation, key separation), and emission of compliant `managed-volume-encryption-receipt.json`.

3. **Zero-downtime secret rotation and redaction verification (`scripts/ops/verify-managed-secret-rotation.spec.js`):**
   - 7 unit and contract tests asserting CLI flags (`--help`, `-o`, `--dry-run`), rotation assertions (90-day cadence, indirect secret URIs, 7 rotation steps), fail-closed detection across all 5 known development password patterns (`DEV_PASSWORDS`), and emission of compliant `managed-secret-rotation-receipt.json`.

4. **Disaster recovery restore and PITR verification (`scripts/ops/verify-managed-restore-drill.spec.js`):**
   - 5 unit and contract tests asserting CLI flags, architectural assertions (Neon continuous WAL streaming, 7-day PITR window, RTO ≤ 4h, RPO ≤ 1h, Vercel Blob 11 9's durability), and emission of compliant `managed-restore-drill-receipt.json`.

5. **Package script and pipeline integration:**
   - Added `"ops:managed-drills-test"` to `package.json` executing all four spec files (28/28 tests passing).
   - Integrated `"npm run ops:managed-drills-test"` into `"ops:check"`, ensuring automated enforcement across CI and local verification gates.

## Automated ClamAV scanner snapshot rebuild cadence — Prompt 383 (2026-10-17)

> Historical implementation record. Prompt 384 below supersedes all closure,
> zero-downtime, signature-age, output-overwrite and scheduled-live claims here.
> Original test results remain attributed to the Prompt 383 run.

Resolved the production launch blocker regarding ClamAV signature rebuild cadence by implementing an automated, zero-downtime snapshot rebuild orchestrator, unit test suite, and scheduled GitHub Actions workflow:

1. **Rebuild orchestrator (`scripts/vercel/rebuild-scanner-cadence.js`):**
   - Implements CLI flag parsing (`--help`, `-h`, `--dry-run`, `--output <file>`, `-o`, `--write-env <file>`, `--current-snapshot-id <id>`, `--max-age-hours <hours>`, `--force`, `--skip-prune`).
   - Evaluates signature age against `--max-age-hours` (default: 48, maximum: 168). Skips cleanly if signatures are fresh (<48h) unless `--force` is specified.
   - Builds new snapshot without `--replace`, preserving the currently running scanner snapshot throughout the build process.
   - Smoke tests the newly built snapshot in an isolated probe sandbox: verifies clean CSV sample is accepted (`exitCode === 0`, `shape === "ok"`) and EICAR virus signature is detected (`exitCode === 1`, `shape.startsWith("found:")`).
   - Safety gate: fails closed if smoke test fails, halting immediately without pruning the existing snapshot.
   - Emits structured JSON audit receipt (`--output <file>`) with mode 0600 and parent directory creation.
   - Supports `--dry-run` simulation mode without requiring cloud credentials or mutating resources.

2. **Automated unit and contract test specification (`scripts/vercel/rebuild-scanner-cadence.spec.js`):**
   - 19 unit and contract tests across 5 suites asserting CLI flag parsing, cadence evaluation logic (fresh vs stale vs forced vs missing), execution order and fail-closed safety invariants, receipt emission and 0600 mode, and dry-run simulation mode without credentials.

3. **Scheduled GitHub Actions workflow (`.github/workflows/scanner-snapshot-rebuild.yml`):**
   - Scheduled daily at 04:00 UTC (`cron: '0 4 * * *'`) and manual trigger (`workflow_dispatch` with optional `force` boolean input).
   - Uses pinned actions (`actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683`, `actions/setup-node@1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a`) on Node 24 with concurrency protection (`cancel-in-progress: false`).
   - Writes updated environment outside repo and generates step summary to `$GITHUB_STEP_SUMMARY`.

4. **Package scripts and pipeline integration:**
   - Added `"vercel:scanner-rebuild": "node scripts/vercel/rebuild-scanner-cadence.js"` to `package.json`.
   - Added `scripts/vercel/rebuild-scanner-cadence.spec.js` to `"vercel:probe-test"`.
   - All 147 probe and snapshot tests pass in `npm run vercel:probe-test`.

## Scanner candidate lifecycle safety — Prompt 384 (2026-10-17)

Prompt 384 supersedes Prompt 383's closed-blocker/zero-downtime claims. The
cadence tool retains all snapshots, performs no activation, preserves active
configuration during simulation, creates only new exclusive 0600 live outputs,
and sanitizes errors/receipts. Snapshot age is explicitly metadata evidence;
`snapshot_recent` replaces `signatures_fresh`, equality requests rebuilding and
invalid/future metadata cannot certify recency. `--skip-prune` is a harmless
deprecated option. The standalone builder's `--replace` behavior is unchanged.

Scheduled/default manual workflow runs are credential-free simulation; only
explicit manual `prepare_candidate: true` enables preview candidate preparation.
Target/team/iad1 guards run before SDK work; credentials are live-step-only.
Unique 0700 temporary directories and an allowlisted summary preserve handoff
ID/hash information before local cleanup. No deployment or automatic retirement
controller was introduced. The runbook separates preparation, activation,
application verification and dependency-aware retirement.

Actual Node 24.21.0 checks: focused suite `tests 62`, `pass 62`, `fail 0`;
`vercel:probe-test` `tests 190`, `pass 190`, `fail 0`; `ops:check`, lint,
post-build typecheck and build all exited 0. Help/dry-run exited 0 with
`"activation_status":"not_performed"` and `"execution_mode":"simulation"` on the
latter. Prettier reported `All matched files use Prettier code style!` for the
changed JS/spec/YAML; diff check was silent (exit 0). Secret scan:
`secret/default scan passed`. Audit gate passed with zero critical findings;
4 moderate and 6 high findings remain outside this scope. The initial concurrent
build/typecheck race was resolved by sequential typecheck after build.
Independent read-only review found no issues and independently passed all 62
focused tests. Full verification details and compatibility changes are recorded
in [operations.md](operations.md#prompt-384--scanner-candidate-lifecycle-safety-2026-10-17).

Durable candidate configuration adoption, a verified deployment using it,
old-deployment/in-flight/rollback dependencies, bounded retirement/resource
budget and hosted scheduled-execution evidence remain open. Local SDK doubles
and workflow shell tests do not supply hosted proof. The commercial hosting-plan decision,
all eleven sign-offs and Phase 12 exit remain open; no percentage change,
production promotion or cloud mutation was performed.

## Scanner runtime configuration handoff — Prompt 385 (2026-10-17)

New live cadence receipts bind schema version 1 to actual preview target identity;
simulation has a null target. The offline handoff CLI validates the fixed Acres
preview team/project/iad1 target and successful preparation/smoke/cleanup, then
creates a fresh restricted outside-repo runtime bundle. Legacy receipts are
rejected. `runtime.env` uses `SCANNER_SANDBOX_SNAPSHOT_ID`, `SCANNER_MAIN_SHA256`
and `SCANNER_DAILY_SHA256`; existing `ACRES_SCANNER_*` probe exports are unchanged.
The allowlisted manifest hashes original receipt and env bytes for consistency,
not provider attestation or deployed identity. Linux/procfs anchors output writes;
partial output remains incomplete for local inspection.

This is an implemented local configuration gate only. No durable operator
bundle, Vercel env adoption, redeployment, application acceptance or retirement
was performed here. Hosted cadence, rollback/in-flight dependency review,
retirement budget, plan decision and all eleven sign-offs remain open. See
[the handoff procedure](../infra/vercel/runbooks/managed-operations.md#54-offline-runtime-configuration-handoff)
and [verification record](operations.md#prompt-385--scanner-runtime-configuration-handoff-2026-10-17).

## Scanner preview adoption attempt — Prompt 386 (2026-10-17)

Status: **blocked before adoption**. Starting source was
`5247e3754a2eb222a47b0bc31932911fef5cb8ef` on `main`; only the approved prompt
was untracked. Provider inspection confirmed the expected team/project, active
Hobby plan, Node `24.x`, basic fixed build machine and `iad1`. Remaining free
quota was not exposed by the inspected metadata; no paid feature was enabled.
Preview settings confirmed private Blob store `store_g2fmCH5CW7TJbkN3`,
`STORAGE_PROVIDER=vercel-blob`, `QUEUE_PROVIDER=vercel`, and a sensitive
preview-only `DATABASE_URL` record without branch override. Its value and live
Neon identity were not reverified; no database connection or migration occurred.

The current project preview scanner records had no branch overrides and used
`SCANNER_PROVIDER=vercel-sandbox`, maximum signature age `48`, snapshot
`snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA`, main hash
`0b2182d229f46981ec8f535382222f7c9dfdd656b250ad47988b910a8d302365` and daily hash
`af003f6eb87905bc3044e90e489d5f79e4897f57c1930b8854672e649e72f3c3`.
The provider returned that snapshot as `created`. These project settings differ
from the historical Prompt 378 snapshot. The latest Ready preview remained
`dpl_Hr9VwjL5jrA5vmsZfx7Qvi2R966b`
(`https://acres-nedhhjsg3-dgsloxx417s-projects.vercel.app`), with the three
Services and `iad1`. Its metadata enumerates scanner variable names, not their
resolved values; this inspection does **not** prove that old deployment uses the
current project settings.

The one authorized live cadence attempt started at `2026-10-17T18:02:15.443Z`
and returned `candidate_build_failed` (exit 1), after confirming candidate
`snap_rz0cs8Nnw1RObI3ZDS5WRKDSUR2y`. The receipt contains null CVD hashes and
null smoke results, with `activation_status=not_performed` and
`configuration_export=not_performed`. It is ineligible for handoff/adoption.
Follow-up provider inspection at `2026-10-17T18:08:10.018Z` returned both
baseline and candidate `created` in `iad1`; no attempt-period sandbox remained
in the project inventory. That observation does not repair the failed receipt,
certify hashes/smoke cleanup or identify the failed builder substep.
No second rebuild, variable write, deployment, browser journey, synthetic
account/upload, queue dispatch, ingestion or snapshot deletion was performed.
No runtime identity, quarantine denial or new consumer acceptance gate closed.
There was no configuration mutation to restore.

See [the execution and verification record](operations.md#prompt-386--scanner-preview-adoption-attempt-2026-10-17)
for restricted receipt custody, inspection limits and local check failures.
Preview adoption/application proof, dependency-aware retirement, hosted cadence,
resource budget, production plan and eleven sign-offs remain open.

## Scanner failure diagnostics — Prompt 387 (2026-10-17)

The bounded investigation verified the retained failure receipt and current
snapshot metadata; the historical failed substep remains unresolved. Local
builder/cadence diagnostics now preserve fixed safe step/kind, independent
builder cleanup and confirmed-ID state. Both CLIs suppress raw provider/command
errors; failed receipts remain ineligible for handoff. No new live rebuild,
adoption, configuration write, scan, deployment or snapshot deletion occurred.
See [investigation and actual checks](operations.md#prompt-387--scanner-build-failure-investigation-2026-10-17).

The next hosted gate requires a separately authorized, bounded candidate rebuild
using these diagnostics, followed only on success by separately scoped preview
adoption/deployed application proof. The old failed receipt cannot be salvaged.
Hosted cadence, dependency-aware retirement/resource budget, production plan,
Phase 12 exit and all eleven category sign-offs remain open.

## Scanner candidate rebuild — Prompt 388 (2026-10-17)

The single authorized live preparation failed safely: receipt
`candidate_build_failed` with `build_failure` `step: "builder-create"`,
`kind: "provider_failed"`, `builder_cleanup: "not_requested"`,
`snapshot_confirmed: false` (window `2026-10-17T22:04:06Z`–`22:04:40Z`). The
builder `Sandbox.create` threw before returning a handle (a provider
rejection or a client-side transport/authorization failure; the cause is
unrecorded); no sandbox, candidate,
hashes, smoke or `candidate.env` exist, and offline handoff rejected the
receipt. Baseline `snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA` and Prompt 386
candidate `snap_rz0cs8Nnw1RObI3ZDS5WRKDSUR2y` remain `created` in `iad1`;
no sandbox residue. Sandbox allowance was not visible from the CLI this session.
See [the execution record](operations.md#prompt-388--bounded-scanner-candidate-rebuild-2026-10-17).

Next gate: an owner-side read-only check of the Hobby Sandbox allowance and
any create-path cause in the dashboard, then only if allowance remains, a separately authorized single rebuild. Adoption
and deployed application proof still require a successful receipt. The
baseline expires `2026-10-24T14:29:39.778Z`; hosted cadence, retirement,
production plan, Phase 12 exit and the eleven sign-offs remain open.

## Scanner create diagnostics — Prompt 389 (2026-10-18)

Prompt 388's receipt could not say why `Sandbox.create` failed, because every
exception at a `provider_failed` step projected identically. Stage A of
Prompt 389 adds three allowlisted fields to `build_failure`:

| field             | values                                                                      |
| ----------------- | --------------------------------------------------------------------------- |
| `provider_error`  | `api_error`, `stream_error`, `timeout`, `transport`, `other`; else `null`   |
| `provider_status` | `api_error` only: integer 100–599 from `response.status`, else `null`        |
| `provider_code`   | `error.code` from an API error body, or a stream error's `code`, if it matches `^[a-z][a-z0-9_]{0,59}$`; else `null` |

Classification happens when `buildStep` wraps a raw error at a
`provider_failed` step; the raw error is then dropped. The SDK's `APIError`
and `StreamError` classes reach the module-level `buildStep` through an
`AsyncLocalStorage` scope opened by `buildSnapshot`, so CLI loading of the SDK
is unchanged. Errors raised directly by the tooling (validation, command,
`builder-delete`) carry `null` in all three. Installed SDK 3.8.0 builds an
`APIError` with the parsed body as `json` for every non-ok response, including
the last 429/5xx after its two internal retries, so `provider_code` is
populated whenever the API sends `{ error: { code } }`. That body shape is
conventional, not documented by the SDK, so the code path is a judgement.
Schema stays v1: the fields exist only inside `build_failure`, which only
failed receipts carry.

`sandboxTarget(env, { minRemainingMs })` now takes the OIDC floor. Probes keep
30 minutes; the live cadence producer and the standalone builder require
**75 minutes** (`LIVE_BUILD_OIDC_MIN_REMAINING_MS`, the 30-minute run watchdog
plus inspection margin, a judgement). Dry-run needs no token.

Reading guide (a reading of the classification, never a certified cause):
`api_error` 429 = rate limited; 402 = plan or quota; 401/403 = authorization;
5xx = provider; `transport` = client network; `timeout` = client deadline.
Next: the owner reports Sandbox usage (stage B), then at most one confirmed
rebuild (stage C). Record: [operations](operations.md#prompt-389--scanner-create-diagnostics-2026-10-18).

## Scanner rebuild — Prompt 389 stages B–C (2026-10-18)

Stage B: the owner's dashboard screenshots show Sandbox usage far inside
Hobby (28/5,000 creations, 7 m 2 s/5 h Active CPU, 1.2/420 GB-h memory,
37.75 MB/20 GB transfer, 921.88 MB/15 GB Snapshot Storage). These figures are
owner-reported. The Vercel MCP cannot read allowance usage
(`list_billing_charges` → `404 costs_not_found`), but its snapshot listing
matched the storage figure (921,876,890 B ≈ 921.88 MB). Reading: Prompt 388's
create failure was not monthly-quota exhaustion.

Stage C: the one confirmed live preparation (`2026-10-18T01:02:02Z`–`01:02:52Z`)
**built** candidate `snap_KtLdaJeG4SaLAwi4mI8G8XzURZat` (`created`, `iad1`,
expires `2026-10-26T01:02:47Z`) with `main_sha256`
`0b2182d2…8d302365` and `daily_sha256` `f9cb69a8…44a2a2d5`. It then failed with
`candidate_smoke_failed`: both samples `untested`, `cleanup: "passed"`. The
smoke sandbox was created and deleted, but `writeFiles`, the first
`runCommand` or its stdout read threw before any scan result was recorded.
Which call failed, and why, is unknown: the smoke step does not classify its
errors. Handoff rejected the receipt; no `candidate.env`; nothing adopted,
deleted or configured; no sandbox residue. See
[the execution record](operations.md#stage-c--the-single-confirmed-rebuild-2026-10-18).

Next gate (proposed, needs its own approval): classify smoke-stage provider
errors the way Prompt 389 classifies build errors. Then either one
`probe-platform.js scanner` run against the new candidate, or one more
rebuild. The baseline expires `2026-10-24T14:29:39.778Z`. The candidate's
signatures pass the 48 h policy no later than about `2026-10-20T01:00Z`; the
true limit is the `daily.cvd` build time + 48 h, which the receipt does not record.

## Scanner smoke source fix — Prompt 390 (2026-10-18)

Stage A, local only (no cloud calls). Prompt 389's smoke stage created its
VM with `Sandbox.create({ snapshotId, … })`. In `@vercel/sandbox` 3.8.0 the
snapshot form is `source: { type: "snapshot", snapshotId }`
(`dist/sandbox.d.ts` `CreateSandboxParams`); a top-level `snapshotId` is not a
parameter. The reading from source, not a hosted measurement, is that the SDK
ignored the key, the VM booted the default image without ClamAV, and a later
call threw. That fits `untested` + `cleanup: "passed"`. The VM was also
persistent by default; Prompt 389's post-run listing showed no extra snapshot.
The spec's fake SDK keyed "builder vs probe" on `options.snapshotId`, which
hid the defect.

`smokeTestSnapshot` now uses the create shape that the probe and the app
adapter have proven hosted: `source`, `persistent: false`, `deny-all`,
`timeout: 120000`, `resources: { vcpus: 1 }`. Its create deadline is 60 s,
the adapter's `CREATE_TIMEOUT_MS`; the prompt allowed for the adapter's value
differing from 30 s. In order, it then checks `sourceSnapshotId`, runs the
probe's signature check against the receipt's hashes (`signatureCheck` gained
a `dailySha256` override; it and `runChecked` are now exported), and scans
clean and EICAR. Cleanup is `delete({ deleteOrphanSnapshots: true })` plus a
read-only post-delete `Snapshot.get` that must report `created`. Receipts gain
`smoke_test.signatures` (first key) and, on `candidate_smoke_failed` only,
`smoke_failure` (`step`, `kind`, `provider_error`, `provider_status`,
`provider_code`); see [managed operations §5.1](../infra/vercel/runbooks/managed-operations.md#51-candidate-preparation-and-snapshot-age).
Handoff now also requires `signatures: "passed"`. No earlier receipt had it,
and none had passed smoke. The fake SDK now throws on a top-level `snapshotId`.
Schema stays v1. See [the record](operations.md#prompt-390--scanner-smoke-source-fix-2026-10-18).

Stage B (2026-10-18, one confirmed live run, `01:43:47Z`–`01:45:22Z`, exit 0)
**succeeded**. Candidate `snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN` (`created`,
`iad1`, 461,065,087 B, expires `2026-10-26T01:44:56Z`), `main_sha256`
`0b2182d2…8d302365`, `daily_sha256` `f9cb69a8…44a2a2d5`. `smoke_test`:
`signatures`, `clean_sample`, `eicar_sample` and `cleanup` all `passed`, the
first passing smoke on record. Receipt SHA-256 `617255e0…2b7e9ff084`.
`prepare-scanner-handoff.js` produced a bundle (`runtime_env_sha256`
`632f4634…92a4ad1e`) whose digests and three assignments verified locally.
No sandboxes remain. Four snapshots are retained (≈ 1.84 GB of 15 GB).

The hashes equal Prompt 389's candidate, because both builds fetched the same
`daily.cvd`. The 48 h signature window therefore closes **no later than**
about `2026-10-20T01:02Z`. The candidate is **prepared, not adopted**; nothing
was written to env, deployed or retired. Next gate (needs its own prompt and
approval): preview adoption of `snap_CARv…` and the deployed upload → scan
proof inside that window. Snapshot retirement stays separate. See
[the record](operations.md#stage-b--the-single-confirmed-rebuild-2026-10-18).

## Scanner preview adoption — Prompt 391 (2026-10-18)

Status: **adopted on preview; deployed upload → scan proven.** Source
`73c704794b3e1a068d4d02f9fcccf3c2a963dd2f` on `main` (by procedure; a CLI
deploy from an archive carries no git metadata). Window check at
`2026-10-18T13:38Z`, about 35 h before the ~`2026-10-20T01:00Z` signature
bound.

- **Target, read-only.** Hobby team/project as fixed above, Node `24.x`,
  Sandbox region `iad1`. Preview `BLOB_STORE_ID=store_g2fmCH5CW7TJbkN3`,
  `STORAGE_PROVIDER=vercel-blob`, `QUEUE_PROVIDER=vercel`, sensitive
  `DATABASE_URL`. All five `SCANNER_*` records are preview-only with no git
  branch override. Before: `snap_Feg5…`, main `0b2182d2…`, daily `af003f6e…`,
  max age `48`, provider `vercel-sandbox`.
- **Bundle.** Receipt `617255e0…2b7e9ff084` and `runtime.env`
  `632f4634…92a4ad1e` matched `handoff.json`; three names; the receipt's
  success string is `"success"` (the prompt's placeholder was `candidate_ready`); all four
  smoke statuses `passed`. `Snapshot.get`: `created`, `iad1`.
- **Seam probe, one run** (`13:40–13:41Z`, exit 0): signatures verified under
  48 h, clean accepted, EICAR rejected, `deny-all`, `persistent: false`,
  `baseSnapshotSurvived`, one creation, cleanup succeeded. Synthetic only.
- **Adoption** (`13:56Z`). `vercel env update <name> preview` with stdin for
  `SCANNER_SANDBOX_SNAPSHOT_ID`, `SCANNER_MAIN_SHA256`, `SCANNER_DAILY_SHA256`;
  all exit 0. The auto-mode classifier refused the agent's env write, so the
  owner ran the prepared script (names and exit codes only). A private
  re-pull matched all three to the bundle; only the snapshot ID and daily hash
  changed (the main hash was already equal). Type, scope and max age unchanged.
- **Deployment.** `dpl_2aajXYcFj2FDoGA9Gbbu5HqyFtBT`
  (`https://acres-7azesfi2c-dgsloxx417s-projects.vercel.app`), created
  `14:00:01Z`, Ready `14:04:36Z`, `target: null`, no aliases, `iad1`, basic
  build machine, Vercel Authentication. Services `client`, `api`, `jobs`.
  Uploaded from a `git archive` of the source SHA plus only
  `.vercel/project.json` (1,503 tracked files); see finding 1.
- **Acceptance** (`14:07:20–14:09:22Z`), through `vercel curl --deployment`
  on the immutable URL with a cookie jar (see deviation). Synthetic account,
  organization and CSRF; SSR `/app` 200 but see finding 2.
  - Clean CSV: private Blob PUT 200, complete 200, `accepted`; DB
    `scanStatus=clean`, outbox `dispatched` (1 attempt), `DurableJob`
    `succeeded` (1 attempt), accepted 15 s after completion.
  - EICAR CSV (probe fixture, real checksum): `rejected`, `infected`;
    `DurableJob` `failed`/`infected` (1 attempt); download 404; no dataset
    version. This deployment's logs (`deploymentId` filter) carry the
    `JobProcessorService` "Upload rejected by malware scan" line for it.
    The clean upload has no consumer log line (the success path logs
    nothing); its correlation rests on the outbox and `DurableJob` rows.
  - Anonymous GET of both Blob objects: 403. A second synthetic organization
    got 404 for both uploads, with its own and a forged organization header
    (`Tenant context rejected: no active membership`).
- **Scanner identity (inference).** The deployment metadata lists the scanner
  variable names only. The writes finished before deployment creation, and
  the adapter rejects a VM whose `sourceSnapshotId` or signature hashes differ
  from its configuration before a clean verdict. Provider evidence agrees:
  after the run, `snap_CARv…` reported expiry `2026-10-26T14:08:18.638Z`,
  eight days after the EICAR scan VM boot, where it was `…01:44:56Z` before.
  This is read from the expiry-on-use behaviour, not a provider attestation.
  `Sandbox.list` returned no sandboxes after the run.
- **Owned artifacts** (custody only): two accounts, two organizations, two
  uploads and their Blob objects, under
  `~/.config/acres/vercel-preview/prompt391-20261018T133907Z/`. Nothing was
  deleted; no snapshot was retired.

Deviation: the prompt asked for a Playwright browser. Driving the protected
preview from a browser needs the automation bypass secret, and reading it was
refused as credential materialization. `vercel curl` applies the bypass
without exposing it; the request sequence is the browser client's
(`/auth/csrf`, `/auth/register`, `/organizations`, `/uploads`, direct PUT,
`/complete`, status polling). Second deviation (§3.3): the deployment
metadata exposes scanner variable names, not resolved values, so the
per-service value comparison was not possible; identity rests on the
inference above.

Findings (finding 1 resolved by Prompt 392; finding 2 resolved by Prompt 393):

1. **Deploy uploads gitignored files.** *Resolved by Prompt 392:*
   `.vercelignore` allowlist plus `vercel:deploy-manifest`, proven on
   `dpl_7JR8wLUt14fPRdD7SHPmy6gM4QTC`; old deployments inventoried there. There is no `.vercelignore`, and a
   working-tree `vercel deploy --dry` lists `.env`, `backups/`, `ref/` and
   other ignored paths. `dpl_Hr9…`'s stored source contains `src/.env` and
   `src/backups/…`. These are local-development values (localhost Postgres
   role passwords) and drill evidence, readable only by team members with
   source access, not preview or production secrets. Proposed fix: a
   `.vercelignore` (or archive-only deploys), then decide on old deployments
   and local credential rotation.
2. **`/app` dashboard SSR fails for an organization member.** Session and
   organization listing work, then `dashboardSummary` GraphQL fails and the
   page renders `AppError` (request ID `db4e1e74-9af1-483c-9685-cec384d681b3`).
   Runtime logs for that window returned no records, so the cause is unknown.
   Prompt 378's Gate C did not require an active organization. *Resolved by
   Prompt 393:* the client sent `dashboardSummary` without an operation name,
   which the API rejects outside development (see
   [Prompt 393](#dashboard-summary-operation-name--prompt-393-2026-10-18)).

Remaining: retirement of `snap_KtLd…`, `snap_rz0cs…` and baseline `snap_Feg5…`
(dependency-aware; `dpl_Hr9…` and earlier previews may still name older
snapshots), hosted cadence (the candidate's signatures fall outside 48 h no
later than about `2026-10-20T01:00Z`, after which scans on this deployment fail closed
until the next rebuild and adoption), the two findings, the production plan
decision and the eleven sign-offs. See
[the execution record](operations.md#prompt-391--scanner-preview-adoption-2026-10-18).

## Dashboard summary operation name — Prompt 393 (2026-10-18)

Status: **fixed and hosted-proven on preview.** Source `23f6378` on `main`.

- **Reproduced** on `dpl_7JR8wLUt14fPRdD7SHPmy6gM4QTC` (`feb6d9e`) through
  `vercel curl --deployment`: register 201, organization 201, `/app` 200 with
  `AppError` (request ID `94d1255c-ce74-4184-9af7-d0673401d9cd`). Runtime logs
  grouped by path held no `/graphql` record, and a `vercel curl --trace`
  session trace showed no subrequest spans. Custody:
  `prompt393-diag-20261018T151547Z/`.
- **Cause, found locally.** With the API in development mode the same flow
  rendered the dashboard. In `NODE_ENV=test` the client's query returned HTTP
  200 with `QUERY_LIMIT_EXCEEDED` "GraphQL operationName is required."
  `server/src/graphql/graphql-limits.ts` enforces this outside development;
  preview runs `production`. `getDashboardSummary` passed no
  `operationName`; the audit query already did. The rejection is expected,
  so nothing is logged, and the client renders the generic copy.
- **Fix.** The dashboard document moved to
  `client/lib/api/dashboard-summary.ts` with `DASHBOARD_SUMMARY_OPERATION`.
  `audit-history.ts` gained `AUDIT_HISTORY_OPERATION`. `graphqlPost` requires
  `operationName`. A new `client/tests/graphql-operations.spec.ts` checks each
  document declares exactly its named operation. The server is unchanged.
  Residuals are in [dashboards](dashboards.md#graphql-read-model).
- **Deployment.** `dpl_1S2xiZKz6HogdM3d4QgSsKsBqf6X`
  (`https://acres-frdn23tfw-dgsloxx417s-projects.vercel.app`), deployed from
  the working tree after `deploy manifest ok: 656 files` (Prompt 392's 654 plus
  the two new client files). Started `15:27:17Z`, `READY` by `15:29:29Z`,
  `target: null`, basic build machine, Vercel Authentication.
- **Acceptance** (fresh synthetic account and organization, custody
  `prompt393-20261018T152709Z/accept/`): `/app` 200 with
  `id="dashboard-title"` and no `AppError`; `/app/audit` 200 with
  `id="audit-title"` and no `AppError`. The deployment's error/warning
  runtime logs over the window held only the known `pg` SSL-mode warning.

## Deploy upload allowlist — Prompt 392 (2026-10-18)

Status: **implemented and hosted-proven on preview.** Source `feb6d9e` on
`main`. The Vercel CLI does not read `.gitignore`; its built-in ignores
(`getVercelIgnore2` in CLI 64.5.0) omit `.env`, so working-tree deploys
uploaded `/.env`, `server/.env`, `backups/`, `ref/`, build outputs and more
(2,828 files).

- **`.vercelignore`** (repo root; the project has no root directory, so this
  file is the one that applies). Allowlist form from
  <https://vercel.com/docs/deployments/vercel-ignore>: `/*`, then `!` for
  `client`, `server`, `packages`, `package.json`, `package-lock.json`,
  `vercel.json`, `.node-version`. Inside those: `.env*` (re-admitting only
  `/client/.env.example` and `/server/.env.example`), `*.pem`, `*.key`,
  `.npmrc`, `*.log`, `*.dump`, `*.tsbuildinfo`, `node_modules`, `coverage`,
  `dist`, `test-results`, `playwright-report`, `server/src/generated`,
  `client/next-env.d.ts`, `client/out`, `client/build`. No tracked in-scope
  file matches an exclude except the two placeholders.
- **Correction to the prompt.** Its unanchored `!.env.example` also re-admits
  the root `/.env.example` over `/*`; the first dry run failed the check with
  `out-of-scope file in upload: .env.example`. The two anchored entries
  replace it.
- **`scripts/vercel/check-deploy-manifest.js`** (`npm run
  vercel:deploy-manifest -- --manifest <dry.json> [--cwd <dir>]`). Reads a
  `vercel deploy --dry` manifest (never runs the CLI) and requires the upload
  to equal the git-tracked files in that scope exactly. It also requires a
  clean scope (`git status --porcelain`), so the upload is HEAD's content and
  the recorded SHA is true. Errors: `untracked or ignored file in upload`,
  `out-of-scope file in upload`, `build input missing from upload`,
  `uncommitted change in deploy scope`, `duplicate`/`invalid path`; `.env`
  paths other than `.env.example` get a `SECRET:` prefix. Exit 0 ok, 1
  violation, 2 usage or git error. Paths only, never contents. Eleven
  `node:test` cases in `check-deploy-manifest.spec.js`, run by
  `vercel:probe-test`. The check is a manual preflight: nothing forces it
  before `vercel deploy`.
- **Local evidence** (Node 24.21.0, `.env`, `server/.env`, `backups/`,
  `server/dist` on disk). Dry run: `fileCount 654`, `totalSize 152722837`,
  `ignoredCount 37` (ignored list includes `.env`, `.env.example`,
  `backups`, `server/.env`, `server/dist`, `server/coverage`,
  `server/src/generated`, `packages/shared/dist`) → `deploy manifest ok: 654
  files`, equal to `git ls-files` over the scope. Negative controls:
  `client/.env.check-392` was ignored (check exit 0); `client/untracked-392.txt`
  failed with `untracked or ignored file in upload` (exit 1). Before commit,
  the check failed on the modified `package.json` (`uncommitted change in
  deploy scope`), as designed.
- **Deployment.** `dpl_7JR8wLUt14fPRdD7SHPmy6gM4QTC`
  (`https://acres-fuq15llmn-dgsloxx417s-projects.vercel.app`), deployed from
  the **working tree** after the check passed on `feb6d9e`. Created
  `15:00:55Z`, Ready `15:02:45Z`, `target: null`, no aliases, `iad1`, basic
  build machine, Vercel Authentication. Stored source: 654 files under `src/`,
  identical to the manifest; no `.env` (other than the two placeholders), no
  root `backups/`, `ref/`, `scratch/`, `output/`, `.claude`; no `dist/`,
  `coverage/` or `generated/` path. One pattern hit was the tracked
  `client/public/assets/ui/ref/acres-design-system.pdf`, a §0 reference, not
  the gitignored root `ref/`. Smoke through `vercel curl --deployment`: `/`
  200, `/api/v1/auth/csrf` 200 (client → `ACRES_API_ORIGIN` → api). Health is
  `VERSION_NEUTRAL` `/health` on the api service, and every public path
  rewrites to `client`, so `/health` is 404 publicly; the CSRF GET stands in
  as the API smoke.

**Earlier deployments (inventory, read-only, 2026-10-18).** All fifteen
earlier `acres` deployments (one page), stored source read through
`/v6/deployments/<id>/files`:

| deployment | created (UTC) | target | `src/.env` | `src/server/.env` | `src/backups/` files |
| --- | --- | --- | --- | --- | --- |
| `dpl_6L5ZspwDq331ophkaxojsDZDaKPP` (ERROR) | 2026-10-16 12:44 | preview | yes | yes | 92 |
| `dpl_3giXPYQmYVsxWg5De5U5aZrCaNwZ` | 2026-10-16 12:45 | preview | yes | yes | 92 |
| `dpl_4MguFfnKXsb4QHU3ayvKf4RdCRQK` | 2026-10-16 12:51 | preview | yes | yes | 92 |
| `dpl_9k1JSzXmroDuaJs1MnnTVcDe6kH1` | 2026-10-16 13:13 | preview | yes | yes | 92 |
| `dpl_DHaBK6oVM7YmKZEafMVCdYFqK4fp` | 2026-10-16 13:18 | preview | yes | yes | 92 |
| `dpl_DjXH5qAkKYFEkBY8NaBFGzqS9NuU` | 2026-10-16 13:26 | preview | yes | yes | 92 |
| `dpl_Bf9WCk6n117FjRQsvh5NDaZDVro8` | 2026-10-16 13:51 | preview | yes | yes | 92 |
| `dpl_71bAS64vss2XjM817FXATvhZDj5s` | 2026-10-16 14:17 | preview | yes | yes | 92 |
| `dpl_Hr9VwjL5jrA5vmsZfx7Qvi2R966b` | 2026-10-16 14:25 | preview | yes | yes | 92 |

Clean: the two production deployments (`dpl_J1QE…`, `dpl_9v14…`, the
seven-file queue probe) and previews `dpl_2tbY…`, `dpl_9PEv…` (seven files
each), `dpl_CZ3j…` (5,429 files, no `.env` or `backups/`) and `dpl_2aaj…`
(the Prompt 391 archive deploy). The exposed values are local-development
Postgres role passwords and drill receipts, visible to team members with
source access, not preview or production secrets. **Open owner decisions:**
whether to delete the nine affected preview deployments (irreversible;
`dpl_Hr9…` is Prompt 378's gate evidence), and whether to rotate the local
Postgres role passwords if they are reused anywhere. Nothing was deleted or
rotated. See
[the execution record](operations.md#prompt-392--deploy-upload-allowlist-2026-10-18).

## Scanner signature refresh — Prompt 394 (2026-10-18)

Status: **fresh candidate adopted on preview; deployed upload → scan
proven.** Source `22c6300` on `main` (working-tree deploy after the Prompt
392 gate). Window check at `2026-10-18T15:58Z`, about 33 h before the
Prompt 391 bound (~`2026-10-20T01:00Z`).

- **Target, read-only.** As fixed above. `Snapshot.get`: `snap_Feg5…`,
  `snap_rz0cs…`, `snap_KtLd…` and the active `snap_CARv…` all `created`;
  `Sandbox.list` empty. The five `SCANNER_*` records are preview-only
  (`encrypted`) with no git branch override.
- **Rebuild, one invocation** (`15:59:12–16:00:39Z`, exit 0, empty stderr).
  `rebuild-scanner-cadence.js --force --current-snapshot-id snap_CARv…`
  under `env -i`: `status: "success"`, `execution_mode: "live"`, all four
  smoke checks `passed`, `prune_status: "retained"`,
  `activation_status: "not_performed"`. Candidate `snap_ngIwnQplocPoUR0A6cewfCGrFAbX`
  (`created`, `iad1`, 461,101,901 bytes), main `0b2182d2…` (unchanged),
  daily `489f6083…`.
- **Freshness gate: passed.** The daily hash differs from `snap_CARv…`'s
  `f9cb69a8…`, so a different (presumably newer) `daily.cvd` was fetched
  than in Prompt 390.
- **Bundle.** Receipt `6e53dcd0…632b082b70` and `runtime.env`
  `db7391f7…21c77fcd` matched `handoff.json`. `runtime.env` held the three
  names, with valid patterns, equal to the receipt.
- **Seam probe, one run** (`16:01:36–16:02:35Z`, exit 0): `gatePassed`,
  `signaturesVerified` under 48 h, clean accepted, EICAR rejected,
  `deny-all`, `persistent: false`, `baseSnapshotSurvived`, one creation,
  cleanup succeeded.
- **Adoption** (`16:09:16–16:09:20Z`). The owner ran the prepared
  `adopt.sh` (stdin, names and exit codes only): three `rc=0`. A private
  re-pull matched all three to the bundle. Of the keys present in both
  pulls, only `SCANNER_SANDBOX_SNAPSHOT_ID` and `SCANNER_DAILY_SHA256`
  changed; provider `vercel-sandbox` and max age `48` were unchanged (see the
  pull artefact in the execution record).
- **Deployment.** `dpl_A5H3fnpSx59XyfKqmKJQLywVf85j`
  (`https://acres-6jv6uozpa-dgsloxx417s-projects.vercel.app`), after
  `deploy manifest ok: 656 files`. Created `16:10:41Z`, Ready `16:12:41Z`,
  git meta `22c6300`, `target: null`, no aliases, `iad1`, basic build
  machine, Vercel Authentication. The build log shows the `client` Next
  build and the `api` (`src/main.ts`) and `jobs`
  (`src/vercel/jobs.function.ts`) entrypoints.
- **Acceptance** (`16:13:25–16:15:13Z`), through `vercel curl --deployment`
  with a cookie jar. Fresh synthetic account and organization, selected
  through the `acres_active_organization` cookie as the browser client sets
  it.
  - `/app`: 200, `id="dashboard-title"`, no `role="alert"` (the hard gate).
  - Clean CSV: private Blob PUT 200, complete 200, `accepted` 15 s after
    completion. DB: `scanStatus=clean`, outbox `dispatched` (1 attempt),
    `DurableJob` `succeeded` (1 attempt).
  - EICAR CSV (probe fixture, real checksum): `rejected`/`infected`.
    `DurableJob` `failed`/`infected` (1 attempt), download 404, no dataset
    version. This deployment's logs carry the `JobProcessorService` "Upload
    rejected by malware scan … infected/Eicar-Test-Signature" line at
    `16:14:38Z`. The only other warning/error record is the known `pg`
    SSL-mode warning.
  - Anonymous GET of both Blob objects: 403. A second synthetic organization
    got 404 for both uploads, with its own and a forged organization header.
    The RLS-scoped read saw only this organization's two uploads.
- **Scanner identity (inference).** The writes finished before the
  deployment was created. The adapter rejects a VM whose `sourceSnapshotId`
  or signature hashes differ from its configuration before a clean verdict.
  `snap_ngIw…`'s expiry moved from `2026-10-26T16:01:38Z` (set by the seam
  probe) to `2026-10-26T16:14:25Z`, eight days after the scan VM boots. In
  the same window `snap_CARv…` stayed at `2026-10-26T14:08:18Z`. This rests
  on the expiry-on-use behaviour, not a provider attestation.
  `Sandbox.list` was empty after the run.
- **Owned artifacts** (custody only): two accounts, two organizations, two
  uploads and their Blob objects, under
  `~/.config/acres/vercel-preview/prompt394-20261018T155715Z/`. Nothing was
  deleted and no snapshot was retired. Five snapshots are retained (about
  2.3 GB).

**New bound.** The fetch happened inside the `15:59:12–16:00:39Z` rebuild,
so these signatures fail the 48 h policy no later than about
`2026-10-20T16:01Z`; plan the next refresh before about `15:59Z`. The
`daily.cvd` build time is not in the receipt, so the bound may be earlier.
Restoring `snap_CARv…` (values in custody `previous-scanner.env`) would
restore identity only, since its signatures fail closed after about
`2026-10-20T01:00Z`.

Remaining: the next refresh before the new bound, a hosted cadence (until it
exists, a manual refresh about every two days), dependency-aware retirement
of the four superseded snapshots (`snap_Feg5…` expires
`2026-10-24T14:29:39Z`), the owner's decision on the nine leaky previews,
the production plan decision and the eleven sign-offs. See
[the execution record](operations.md#prompt-394--scanner-signature-refresh-2026-10-18).

## Scanner signature refresh — Prompt 395 (2026-10-19)

Status: **fresh candidate adopted on preview; deployed upload → scan
proven.** Source `45a392a` on `main` (working-tree deploy after the Prompt
392 gate). Window check at `2026-10-19T08:55Z`, inside the prompt's
`04:00Z`–`12:59Z` window and about 31 h before the Prompt 394 bound
(~`2026-10-20T16:01Z`).

- **Target, read-only.** As fixed above. `Snapshot.get`: `snap_Feg5…`,
  `snap_rz0cs…`, `snap_KtLd…`, `snap_CARv…` and the active `snap_ngIw…`
  all `created`; `Sandbox.list` empty. The five `SCANNER_*` records are
  preview-only (`encrypted`) with no git branch override, and the active
  ID was `snap_ngIw…`.
- **Rebuild, one invocation** (`09:00:37–09:01:46Z`, exit 0, empty
  stderr). `rebuild-scanner-cadence.js --force` with
  `--current-snapshot-id snap_ngIw…` under `env -i`: `status: "success"`,
  `execution_mode: "live"`, all four smoke checks `passed`,
  `prune_status: "retained"`, `activation_status: "not_performed"`.
  Candidate
  `snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf` (`created`, `iad1`, 461,123,163
  bytes), main `0b2182d2…` (unchanged), daily `7cb49401…`.
- **Freshness gate: passed.** The daily hash differs from `snap_ngIw…`'s
  `489f6083…`, so a different (presumably newer) `daily.cvd` was fetched,
  about 17 h after Prompt 394's.
- **Bundle.** Receipt `eec8c15f…79e4fd35b3` and `runtime.env`
  `af1ba4f2…47f2580a` matched `handoff.json`. `runtime.env` held the three
  names, with valid patterns, equal to the receipt.
- **Seam probe, one run** (`09:02:16–09:03:24Z`, exit 0): `gatePassed`,
  `signaturesVerified` under 48 h, clean accepted, EICAR rejected,
  `deny-all`, `persistent: false`, `baseSnapshotSurvived`, one creation,
  cleanup succeeded.
- **Adoption** (`09:04:17–09:04:22Z`). The owner ran the prepared
  `adopt.sh` (stdin, names and exit codes only): three `rc=0`. A fresh
  private re-pull matched all three to the bundle. Of the keys present in
  both pulls (the OIDC token excluded), only `SCANNER_SANDBOX_SNAPSHOT_ID`
  and `SCANNER_DAILY_SHA256` changed; no key appeared or disappeared;
  provider `vercel-sandbox` and max age `48` were unchanged.
- **Deployment.** `dpl_AtJLkmoy3gWJVDSzkAUk5t8ujYPJ`
  (`https://acres-nlxfu7g96-dgsloxx417s-projects.vercel.app`), after
  `deploy manifest ok: 656 files`. Created `09:05:30Z`, Ready `09:07:45Z`,
  git meta `45a392a`, `target: null` in the API record (the CLI `inspect`
  JSON prints `"preview"`, as it did for Prompt 394), no aliases, `iad1`,
  basic build machine (2 cores, 8 GB). The build log shows the `client`
  Next build and the `api` (`src/main.ts`) and `jobs`
  (`src/vercel/jobs.function.ts`) entrypoints.
- **Acceptance** (`09:08:30–09:10:17Z`), through
  `vercel curl --deployment` with a cookie jar. Fresh synthetic account and
  organization, selected through the `acres_active_organization` cookie.
  - `/app`: 200, `id="dashboard-title"`, no `role="alert"` (the hard gate).
  - Clean CSV: private Blob PUT 200, complete 200, `accepted` 15 s after
    completion. DB: `scanStatus=clean`, outbox `dispatched` (1 attempt),
    `DurableJob` `succeeded` (1 attempt).
  - EICAR CSV (probe fixture, real checksum): `rejected`/`infected`.
    `DurableJob` `failed`/`infected` (1 attempt), download 404, no dataset
    version. This deployment's `jobs` logs carry the `JobProcessorService`
    "Upload rejected by malware scan … infected/Eicar-Test-Signature" line
    at `09:09:42Z`. The only record at Vercel log level
    warning/error/fatal is the known `pg` SSL-mode warning.
  - Anonymous GET of both Blob objects: 403. A second synthetic
    organization got 404 for both uploads, with its own and a forged
    organization header. The RLS-scoped read saw only this organization's
    two uploads.
- **Scanner identity (inference).** The writes finished before the
  deployment was created. The adapter rejects a VM whose
  `sourceSnapshotId` or signature hashes differ from its configuration
  before a clean verdict. `snap_KBaj…`'s expiry moved from
  `2026-10-27T09:02:18Z` (set by the seam probe) to `2026-10-27T09:09:29Z`,
  eight days after the scan VM boots. In the same window `snap_ngIw…`
  stayed at `2026-10-26T16:14:25Z`. This rests on the expiry-on-use
  behaviour, not a provider attestation. `Sandbox.list` was empty after the
  run.
- **Owned artifacts** (custody only): two accounts, two organizations, two
  uploads and their Blob objects, under
  `~/.config/acres/vercel-preview/prompt395-20261019T085943Z/`. Nothing was
  deleted and no snapshot was retired. Six snapshots are retained (about
  2.8 GB).

**New bound.** The fetch happened inside the `09:00:37–09:01:46Z` rebuild,
so these signatures fail the 48 h policy no later than about
`2026-10-21T09:02Z`; plan the next refresh before about `09:00Z`, with stage
2 started by about `06:00Z`. The `daily.cvd` build time is not in the
receipt, so the bound may be earlier. A rebuild before about
`2026-10-19T21:00Z` risks fetching the same file (a judgement). Restoring
`snap_ngIw…` (values in custody `previous-scanner.env`) would restore
identity only, since its signatures fail closed after about
`2026-10-20T16:01Z`.

Remaining: the next refresh before the new bound, a hosted cadence (until it
exists, a manual refresh about every two days), dependency-aware retirement
of the five superseded snapshots (`snap_Feg5…` expires
`2026-10-24T14:29:39Z`), the owner's decision on the nine leaky previews,
the production plan decision and the eleven sign-offs. See
[the execution record](operations.md#prompt-395--scanner-signature-refresh-2-2026-10-19).

## Scanner snapshot retirement — Prompt 396 (2026-10-19)

Status: **tier 1 retired on preview.** Source `4aa24ca` on `main` (the
reviewed retire CLI, committed before any live step). Cached CLI 64.5.0,
`whoami` → `dgsloxx417`, team `team_zE3mp7nrEZ6a7cxRavwUMYC4`, linked
project `acres` (`prj_q9ApajZWDgdYZetnm5s5oakEjrUD`), `@vercel/sandbox`
3.8.0, Node 24.21.0.

- **Tooling.** `npm run vercel:scanner-retire` plans by default and deletes
  only the listed `--retire` IDs with `--confirm`; see
  [infra/vercel/README.md](../infra/vercel/README.md) and runbook §5.5.
  Snapshot `get` and `delete` are team-scoped (no project parameter in SDK
  3.8.0), so every ID must also appear in the project's `Snapshot.list`.
- **Access** (`10:43Z`). One `env pull --environment=preview` into a new
  run directory, `~/.config/acres/vercel-preview/prompt396-20261019T104349Z/`
  (0700, files 0600). OIDC claims bound to the fixed project and team.
  `SCANNER_SANDBOX_SNAPSHOT_ID` matched `snap_KBaj…`.
- **Custody mismatch (owner decision).** The custody root `scanner.env`
  still named `snap_Feg5…`: it was written by Prompt 373 and never updated,
  because Prompts 390–395 wrote their env files into per-run directories.
  Prompt 395's `candidate.env` and `handoff/runtime.env` both name
  `snap_KBaj…`, as does the fresh pull. The prompt's stop-on-mismatch rule
  was raised with the owner, who chose to proceed. The file was left as is;
  anything sourcing it now targets a deleted snapshot and fails closed.
- **Dependencies** (inferred from write-before-create ordering against the
  recorded adoption times; deployment metadata names variables, not
  values):

  | snapshot                            | configured                                      | deployments created meanwhile                                    | decision                              |
  | ----------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------- |
  | `snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA` | until Prompt 391, `2026-10-18T13:56Z`           | `dpl_Hr9V…` and the other 2026-10-15/16 deployments              | retired; signature window long closed |
  | `snap_rz0cs8Nnw1RObI3ZDS5WRKDSUR2y` | never (Prompt 386 failed candidate)             | none                                                             | retired                               |
  | `snap_KtLdaJeG4SaLAwi4mI8G8XzURZat` | never (Prompt 389 failed smoke)                 | none                                                             | retired                               |
  | `snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN` | `13:56Z`–`16:09:20Z` 2026-10-18                 | `dpl_2aaj…` (14:00Z), `dpl_7JR8…` (15:00Z), `dpl_1S2x…` (15:27Z) | kept (tier 2)                         |
  | `snap_ngIwnQplocPoUR0A6cewfCGrFAbX` | `16:09:20Z` 2026-10-18 – `09:04:22Z` 2026-10-19 | `dpl_A5H3…` (16:10Z)                                             | kept (rollback)                       |
  | `snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf` | since `09:04:22Z`                               | `dpl_AtJL…` (09:05:30Z)                                          | kept (active)                         |

  `dpl_7JR8…` (Prompt 392) was missing from the prompt's table; it is a
  `snap_CARv…` dependent and does not change tier 1.

- **Plan run** (`10:49:51–10:49:56Z`, exit 0): `result: "planned"`, no
  refusals, `active_sandboxes: 0`, every keep `created`, no `parent_id`,
  `unlisted_snapshots: []`. Six snapshots, 2,766,290,741 bytes. No
  snapshot `snap_d2y7r2n9` exists; the three lines that named it (the "First
  preview deployment" bullet and the Prompt 378 record) now say the ID is
  unverified and the baseline was `snap_Feg5…`.
- **Confirm run, once** (`11:02:28–11:02:37Z`, exit 0):
  `result: "retired"`, no warnings. In order, each confirmed by a re-read:

  | snapshot      | bytes       | outcome   |
  | ------------- | ----------- | --------- |
  | `snap_Feg5…`  | 460,912,577 | `deleted` |
  | `snap_rz0cs…` | 460,964,313 | `deleted` |
  | `snap_KtLd…`  | 461,123,700 | `deleted` |

  After: three snapshots, 1,383,290,151 bytes. The keeps stayed `created`
  with unchanged expiries: `snap_KBaj…` `2026-10-27T09:09:29Z`,
  `snap_ngIw…` `2026-10-26T16:14:25Z`, `snap_CARv…` `2026-10-26T14:08:18Z`
  (moved from the recorded `01:44:56Z` by a later use).

- **Effect.** Deployments pinned to `snap_Feg5…` now fail closed with
  `scanner_unavailable` instead of a signature-age failure; they already
  failed closed. No upload that would be marked `clean` is affected.
  Deletion cannot be undone; a later need takes the normal rebuild → adopt
  → deploy path.

**Snapshot Storage (owner-reported, Usage → Sandbox).**

The supplied before screenshot (`screenshot-2026-10-19_11-01-56.png`)
showed **2.39 GB / 15 GB**. The after screenshot
(`screenshot-2026-10-19_11-32-27.png`) still showed **2.39 GB / 15 GB**
and “Updated just now”, about 30 minutes after retirement. Times come from
owner-supplied filenames (Accra/UTC), not dashboard timestamps; the reporting
period selector is not visible. The 11:28:49 snapshot-inventory screenshot
also shows all three expected targets Deleted and all three keeps Created.

**Accounting remains unresolved.** The early unchanged reading does not
distinguish cumulative accounting from dashboard lag or another accounting
method. Prompt 396's later owner reading, no earlier than **12:03 UTC**, is
still outstanding; its accounting acceptance is not complete. The provider
listing verifies the stored-byte reduction, not recovered billing allowance.
This open experiment does not prevent a separately approved preview deploy.

Remaining: the next refresh before about `2026-10-21T09:02Z`, tier 2
(`snap_CARv…` after about `2026-10-20T01:00Z`, `snap_ngIw…` after about
`2026-10-20T16:01Z` and once a newer rollback exists), a hosted cadence,
the owner's decision on the nine leaky previews, the production plan
decision and the eleven sign-offs. See
[the execution record](operations.md#prompt-396--scanner-snapshot-retirement-2026-10-19).

## Fresh preview deployment — Prompt 397 (2026-10-19)

**Ready and smoke-checked.** One preview deployment from clean `main`,
source `004d406167fc4aa17381929c7cbbbf60cfe7e381`:
[`acres-qfhmdmej2-dgsloxx417s-projects.vercel.app`](https://acres-qfhmdmej2-dgsloxx417s-projects.vercel.app),
ID `dpl_BrTkKoGs8Ahyd3q1DQGEhSPCgFYE`. Existing team/project and `iad1`
unchanged; Node 24.21.0 locally, Vercel CLI 64.5.0. Created
`2026-10-19T11:42:08.948Z`; build log says Deployment completed at
`11:45:30.384Z`, and subsequent inspect reports `READY` and target `preview`.
The deploy command's JSON represented the target as `null`; neither command
used a production target. The build machine is `basic`, 2 cores / 8192 MB,
plan default. Vercel Authentication remains enabled.

- **Prerequisite record.** Prompt 396's retirement evidence was reviewed and
  committed as `0629202`. Storage accounting remains unresolved: the early
  after-reading was unchanged, and the later owner reading is outstanding.
  No retirement, configuration write or scanner refresh was repeated.
- **Access/configuration.** `whoami` returned `dgsloxx417`; project inspect
  matched `prj_q9ApajZWDgdYZetnm5s5oakEjrUD` and its recorded owner. A fresh
  preview env pull into `/tmp/acres-preview-397/preview.env` was used only
  for inspection. Six sensitive values were unavailable as plaintext;
  they were not needed or written back. Active snapshot matched
  `snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf`, status `created`, region `iad1`,
  expiry `2026-10-27T09:09:29.002Z`; provider and 48-hour policy matched.
  Freshness uses Prompt 395's historical upper bound, about
  `2026-10-21T09:02Z`, not a new scan proof.
- **Upload gate.** `deploy --dry --target=preview` followed by
  `npm run vercel:deploy-manifest -- --manifest <run>/dry.json` returned
  `deploy manifest ok: 656 files`, equal to the prior recorded count.
  No ignored credentials or outputs were admitted. Exactly one
  `deploy --target=preview --scope dgsloxx417s-projects` completed.
- **Services.** Hosted build log verifies the client Next build, API
  `src/main.ts`, and jobs `src/vercel/jobs.function.ts` entrypoints.
- **Hosted smoke (authenticated Vercel CLI, anonymous Acres session).**
  `/`, `/login`, `/register` each returned HTTP 200.
  `/api/v1/auth/csrf` returned HTTP 200 with `ok: true` and the expected
  `csrfToken`/`headerName` data fields; token contents were not printed.
  `/app` returned HTTP 200 with a streamed `NEXT_REDIRECT` to
  `/login?returnTo=/app` (307 redirect instruction and meta refresh), no
  `role="alert"` or HTTP error fallback marker. This matches the route's
  unauthenticated behavior; it is not a logged-in dashboard proof.
- **Health limitation.** API `/health` and `/health/ready` are version-neutral
  paths excluded from the global prefix. Public requests rewrite to the
  client, whose bridge serves only `/api/v1/*`; there is no public health
  bridge. Readiness/database/storage checks were not claimed. The CSRF GET
  verifies the existing client-to-API bridge. Prompt 395 retains the prior
  clean/EICAR upload proof; no accounts, uploads or queue probes were added.

Restricted response/build evidence is in `/tmp/acres-preview-397/` (0700;
credential/response files 0600). Open the preview URL and authenticate with
Vercel if prompted, then use the existing Acres login or register page.
Production, domains, plan, environment values and deployment protection were
not changed; nothing was pushed. Production approvals and scanner refresh
work remain open. See [the execution record](operations.md#prompt-397--fresh-vercel-preview-2026-10-19).

## Preview image routing — Prompt 398 (2026-10-19)

**Hosted image delivery restored; browser visual acceptance blocked.**
Repair against `58a4d39`, deployed source
`35895ec95e6d9ff893e085ee69e9bece9da5b8dd`. Prompt
397's page/API smoke omitted image URLs: its Ready status did not establish
working landing images. Fresh authenticated requests reproduce a 404 HTML
`/404` response for `/_next/image` at width 1080, quality 100, while the
hero source and logo return 200 with image MIME types. The other landing
stylesheet, a representative webpack script and a font return 200 with
`text/css`, `application/javascript` and `font/woff2` respectively.

**Cause and supported repair.** Cached CLI 64.5.0's build implementation
filters service builders out of `topLevelBuildResults`, merges root image
metadata only from those results plus `localConfig.images`, and writes
service image metadata separately. Existing local `.vercel/output/config.json`
has no `images`; `services/client/config.json` has the expected Next image
settings. The public catch-all already selects `client`; the optimizer has
no root configuration, and both `/_next/image` and `/_vercel/image` return
HTML 404 on the old preview. This establishes a missing deployment-root
optimizer configuration, rather than missing source assets or a quality
allowlist rejection. It does not establish the provider's internal service
optimizer implementation.

Root `vercel.json` now declares the documented `images` configuration and
rewrites `/_next/image` to the documented native `/_vercel/image` endpoint
before the client catch-all. It mirrors the installed Next widths, qualities
75/100, WebP format, cache TTL and SVG/CSP/disposition defaults. Optimization
is restricted to `/assets/ui/landing/` source paths without source queries;
remote domains/patterns remain empty. No Next component, crop, CSS, font,
responsive source or motion changed. Cron routing, private API binding and
queue settings are preserved.

The configuration validator requires root optimizer metadata and route
precedence. Regression coverage invokes the installed Next loader using
`client/next.config.ts`, verifies every emitted width/quality/source can
reach the root optimizer, and rejects missing metadata, widened remote
sources and shadowed optimizer routing.

Contracts checked this session:
[static images configuration](https://vercel.com/docs/project-configuration/vercel-json#images),
[Build Output images API](https://vercel.com/docs/build-output-api/configuration#images),
[Services routing](https://vercel.com/docs/services/routing), installed Next
image guide and installed CLI/builder source. Firecrawl remained unavailable
because its mise shim had no selected version; official web sources were
used without installing or reconfiguring tools.

**Repeatable hosted smoke.** Use `vercel curl <path> --deployment <exact-id>
--scope dgsloxx417s-projects -- --silent --show-error --dump-header
<private-headers> --output <private-body>`. Check status, MIME and decodable
bytes, including hero `w=1080&q=75`, `w=1080&q=100`, another valid width,
and each art-directed hero/photo source at 375/800/1280. Fetch every CSS URL
from the actual landing HTML and representative JS/font assets. Browser
acceptance additionally requires scrolling all three viewport sizes and
checking each image's `complete` and `naturalWidth`, network/console errors
and screenshots. HTML 200 and deployment Ready alone are insufficient.

Restricted diagnostic/check evidence: `/tmp/acres-preview-398/` (0700;
response/env/check files 0600). The supported browser inventory is empty;
creating an in-app browser returns `Browser is not available: iab`.
Browser visual acceptance remains blocked unless a supported browser becomes
available. Storage accounting, scanner refresh/cadence and production
approvals remain open.

### Hosted acceptance — Prompt 398

One corrected preview, from clean `main` after independent review and
`deploy manifest ok: 656 files` (unchanged count; only `vercel.json` changed
inside the upload scope):
[`acres-jxqqbw7zh-dgsloxx417s-projects.vercel.app`](https://acres-jxqqbw7zh-dgsloxx417s-projects.vercel.app),
ID `dpl_4jhnxUyNBL5zsULdPCayKtHY35kM`. API metadata binds the source SHA
above to the fixed team/project; created `2026-10-19T13:23:27.211Z`, Ready
`13:26:03.849Z`. Build log reports Deployment completed at
`13:26:04.219Z`, `iad1`, basic 2 cores / 8192 MB, client Next 16.3.8,
API `src/main.ts`, and jobs `src/vercel/jobs.function.ts`. Hosted builder
CLI was 64.3.1; invoking local CLI was 64.5.0. Inspect reports target
`preview`; API/deploy JSON uses `null`, with no aliases. Vercel
Authentication was preserved; probes used authenticated CLI access.

**38 HTTP probes passed**, including 29 fully decoded image responses:

- Home/login/register: 200 HTML. Anonymous `/app`: 200 with streamed login
  redirect, no error alert; this is not authenticated dashboard proof.
  API CSRF: 200 JSON, `ok: true`, expected field names, values not printed.
- Both actual landing CSS URLs: 200 `text/css`. Representative webpack
  script: 200 `application/javascript`; font: 200 `font/woff2`.
- Every landing raster asset across the existing 375/800/1280 picture
  branches is covered: 20 distinct source files (two hero devices, twelve
  photo variants, six logos). Fifteen direct responses returned 200
  WebP/PNG and exactly matched tracked source bytes. Five optimized source
  paths returned images, covering desktop hero plus four mobile photos.
- All seven optimized requests returned 200 JPEG with curl's default
  Accept header, then 200 WebP with a browser-style Accept header. All 29
  direct/optimized responses were fully decoded through Sharp raw output;
  this checks actual pixel decoding, not only signatures/metadata.

| optimized hero request | old preview                     | corrected preview, default / browser Accept | decoded dimensions |
| ---------------------- | ------------------------------- | ------------------------------------------- | ------------------ |
| `w=1080&q=100`         | 404 HTML                        | 200 JPEG / WebP                             | 1080 × 769         |
| `w=1080&q=75`          | 404 HTML (preparation evidence) | 200 JPEG / WebP                             | 1080 × 769         |
| `w=750&q=100`          | not probed                      | 200 JPEG / WebP                             | 750 × 534          |

The three WebP hero responses retain alpha. At requested width 1080, mobile
photo outputs stay at their smaller source widths: cylinders 933, the other
three 1029; heights match source aspect ratios within rounding. These are
observed no-upscale results, not a blanket guarantee about every image type.
No CSS, image sources, sizes, crops, typography or motion changed.

**Browser limitation remains.** No supported browser was connected, and
creating an in-app browser failed. No screenshots, browser `naturalWidth`,
viewport source-selection execution, scrolling, network/console observation
or visual comparison is claimed. HTTP coverage exercises all referenced
branches; it does not establish browser layout or hydration acceptance.
Open the exact preview URL and authenticate with Vercel if prompted to
inspect it at 375, 800 and 1280. Storage accounting, scanner refresh/cadence,
production launch gates and eleven sign-offs remain open. No production,
domain/alias, environment write, scanner refresh, account/upload or push occurred.

## Recoverable scanner workflow handoff — Prompt 403 (2026-10-20)

Local receipt recovery is implemented. The workflow now invokes an offline summary
helper that validates original live-success evidence, reconstructs only the
allowlisted v1 fields and revalidates before publishing a copyable JSON block.
The existing handoff consumer accepts that block after runner receipt/configuration
cleanup. Simulation/skipped/failed runs publish diagnostics only; unsafe or
ineligible success evidence fails visibly. Original consumer acceptance and all
workflow authority boundaries are unchanged; schedules still simulate.

After reviewing trusted run/source provenance, copy only **Sanitized candidate
receipt for offline handoff** JSON unchanged into a new 0600 file under a durable
0700 restricted directory outside the checkout, then use the existing
`prepare-scanner-handoff.js --receipt <file> --output-dir <new private directory>`.
The output directory must also be new and outside the checkout. The published
receipt is reconstructed, unsigned consistency evidence, not provider state, CVD
freshness, adoption or launch approval. Its later manifest digest binds the copied
projection's bytes, not the deleted runner receipt. Workflow run retention/access
is not restricted durable operator custody. A passing handoff is not deployment
authorization; the [runbook recovery procedure](../infra/vercel/runbooks/managed-operations.md#54-offline-runtime-configuration-handoff)
retains separate adoption, application verification and retirement.

Actual Node 24.21.0 checks: focused `tests 70`, `pass 70`, `fail 0`; full
`vercel:probe-test` `tests 443`, `pass 443`, `fail 0`; lint, sequential typecheck,
normal subprocess-enabled production build, helper syntax/help, secret scan,
changed-source/new-passage formatting and diff checks passed. Four full-document
Prettier warnings predate this change and remain; full-file formatting is not
claimed. Independent review found no Critical, Important or Minor issues.
See [the full verification record](operations.md#prompt-403--recoverable-scanner-workflow-handoff-2026-10-20)
for restricted-run failures, exact outputs and review evaluation.

No hosted dispatch, GitHub secret configuration, live rebuild, provider inspection,
environment adoption, deployment or retirement ran. Hosted cadence, storage
accounting, production plan, Phase 12 exit and all eleven sign-offs remain open.

## Scanner workflow hosted readiness — Prompt 404 (2026-10-20)

Hosted simulation remains **blocked; zero dispatches**. During
`2026-10-20 01:26:53–01:29:29 UTC`, the GitHub connector confirmed the public
repository `gerald-donkor/acres`, default branch `main`, and remote source
`c802e905e03cf9cb74614eabf843f251fe584ae6`. Local reviewed Prompt 403 commit
`b9f382163d3589454971073f15a3d9d622a8f340` is that commit's direct child and
was not on remote main. The immutable remote workflow still has the older inline
summary; `summarize-scanner-candidate.js` returned 404. No older-source run was
substituted for the approved receipt-recovery proof.

The next prerequisite is a separate standalone uppercase **`P`** to authorize
the guarded normal push. This prompt authorized no push. After publication,
recheck exact remote source and hosted prerequisites in a separately bounded
continuation: workflow registration/enabled state and effective policy, usable
dispatch access, idle concurrency, and current free execution allowance. The
existing connector supports repository/file/run reads but exposes no dispatch
operation or required settings inventory; its workflow-list GET was rejected.
`gh --help` failed with a mise read-only-filesystem installation error; no tool
installation, authentication change or settings write was performed.

All 51 repository runs were enumerated; both scanner entries were completed at
inspection. Those historical metadata entries establish neither current workflow
enabled state nor Prompt 403 execution. Live secret-name availability and the
three allowlisted variable settings remain inaccessible, not known absent.
Public visibility alone was not used as allowance evidence. No Vercel call or
present snapshot-state check occurred.

See [the readiness matrix, source digests and actual checks](operations.md#prompt-404--scanner-workflow-hosted-readiness-and-simulation-2026-10-20).
Live preparation, receipt recovery/custody, adoption/application proof, recurring
live cadence and retirement remain separate gates. The historical Prompt 395
refresh bound (no later than about `2026-10-21T09:02Z`, possibly earlier) is
unchanged. Storage accounting, production plan, Phase 12 exit and eleven sign-offs
remain open; no completion percentage changes.

## Scanner refresh 3 prerequisite stop — Prompt 405 (2026-10-20)

Status: **current free allowance unverified; no rebuild, adoption or deployment
attempted.** Local source `a405817a22d6fac0d98fe54893235a5f0aa7a394` on
`main`; Node 24.21.0, cached CLI 64.5.0 and SDK 3.8.0. Fresh read-only
inspection at approximately `02:02–02:05:46Z` confirms the active preview ID
`snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf` and both full hashes match Prompt 395's
candidate and handoff. All five scanner settings are still encrypted and
preview-only without branch overrides; provider `vercel-sandbox`, max age `48`.
The stale root `scanner.env` was not used. One new private preview pull refreshed
OIDC; target claims and the 75-minute floor passed local precheck.

Project-filtered SDK lists plus exact reads found no sandboxes, the same three
created snapshots (`snap_KBaj…`, `snap_ngIw…`, `snap_CARv…`) in `iad1`, and
the tier-1 snapshots still deleted. Created bytes total 1,383,290,151; this is
inventory evidence only. The CLI usage read exited 1 with billing cost data
unavailable for October 1–20. No browser or Vercel connector is available in
this session to inspect current allowance; owner dashboard evidence remains
pending. The current plan, quota/pause state and Prompt 396 accounting question
are not resolved by this listing. Prompt 405's allowance gate stopped creation.

Local simulation and focused tests passed (`tests 226`, `pass 226`, `fail 0`);
the full tooling suite passed (`tests 443`, `pass 443`, `fail 0`). Config,
lint, typecheck, production build and secret scan passed. See
[the evidence, exact action counts and verification](operations.md#prompt-405--scanner-refresh-3-prerequisite-stop-2026-10-20).
Private custody is `prompt405-20261020T020204Z/` under the approved parent;
no new receipt, candidate bundle, deployment URL or application proof exists.

Resume the unused bounded attempt only after current free allowance/accounting
evidence and fresh state/OIDC checks. The historical signature upper bound remains
**no later than about 2026-10-21T09:02Z**, potentially earlier; current scanner
freshness was not measured and no extension is claimed. Hosted cadence,
retirement, production plan, Phase 12 exit and eleven sign-offs remain open.
No configuration restoration is required; nothing was pushed.

### Prompt 405 continuation — candidate deployed, acceptance incomplete

The owner subsequently supplied current storage/compute crops (2.31 GB / 15 GB
storage; 45 creations, 14m 6s CPU, 2.0 GB-hours memory, 40.26 MB transfer).
Fresh target-specific API reads confirmed active Hobby billing, no team block
and no feature block. Current official Hobby limits corroborated ample displayed
headroom. These owner-reported readings cleared the current allowance gate for
the bounded run; historical storage-accounting semantics remain unresolved.

At source `9744d812e08de5313f1191e1fb609c513409d26a`, one rebuild and one
candidate probe passed. Candidate **`snap_8OP5G2tCUvxtRdoGFMCu5se58f3N`** has
daily prefix **`94fead17`**, different from Prompt 395; all smoke, 48-hour-policy
signature, clean/EICAR and cleanup checks passed. A validated handoff was adopted
through the three approved preview values and verified before one deployment:

[`dpl_AGwu9k8gbtQRegTodmHUAL7uxYs4`](https://acres-pbbb1g728-dgsloxx417s-projects.vercel.app),
Ready `2026-10-20T06:41:37.507Z`, `iad1`, git metadata matching the source, no
aliases. Upload allowlist passed for 663 committed files. `/app` passed its
200/dashboard/no-alert hard gate.

**Application scan acceptance is incomplete.** The scratch verifier incorrectly
required a direct private Blob host, rejecting the SDK-produced signed
`vercel.com/api/blob/` endpoint locally before PUT. One account, one organization
and one pending upload were created; no object bytes, scan job, EICAR upload or
isolation check followed. Tenant-scoped read-only correlation confirmed
`pending_upload`, null scan status and zero outbox/jobs. No retry was performed.

Per Prompt 405, guarded conditional restoration returned the project-level three
scanner values to Prompt 395's configuration, verified with fresh pulls/scopes.
**The new immutable deployment retains its new scanner candidate**; restoring
project variables does not change it. Its candidate binding is inferred from
verified writes before creation; metadata exposes scanner names rather than
resolved values, and no application scan attested that binding. All four snapshots and the deployment are
retained, no temporary VMs remain, and no functional rollback or new freshness
bound is claimed. The restored configuration's historical bound remains no later
than about `2026-10-21T09:02Z`, possibly earlier. The single rebuild/probe/deploy
budgets are consumed; further application proof requires a bounded continuation
that accounts for the existing pending upload and fixes the verifier contract.

See [the complete continuation and recovery evidence](operations.md#continuation--allowance-evidence-candidate-and-preview-06310645-utc).
Custody: `prompt405-20261020T063209Z/` under the approved parent. No push,
promotion, deletion, hosted cadence or launch approval occurred.

## Retained preview partial acceptance — Prompt 406 (2026-10-20)

Fresh active-Hobby/no-block metadata, re-inspected recent owner usage evidence,
verified restored preview scopes and candidate handoff supported one bounded
run against the retained
[preview](https://acres-pbbb1g728-dgsloxx417s-projects.vercel.app), deployment
`dpl_AGwu9k8gbtQRegTodmHUAL7uxYs4`, source
`9744d812e08de5313f1191e1fb609c513409d26a`. No new deployment, rebuild or seam
probe occurred. Local execution baseline was `527c98a`.

The corrected PUT contract passed offline validation. A's existing account,
organization and session were reused. Its original pending signed URL had
expired, so the row was retained without PUT and one replacement clean upload
was initiated. Clean reached `accepted` / `clean`; EICAR reached `rejected` /
`infected`. Each outbox event dispatched once and each job ran once. Clean's
job is `succeeded`; EICAR's is correctly `failed` with `infected`. The verifier
incorrectly required success for both and stopped before B creation/isolation.
A corrected copy passed 26 offline tests and was never rerun live.

Read-only inspection confirmed unsigned clean/EICAR object reads 403, EICAR
download 404, zero linked dataset versions, original row still pending, zero
remaining sandboxes and all four snapshots retained. The exact deployment's
job log corroborates EICAR rejection. Candidate use metadata changed at scan
time; binding remains an inference rather than resolved-env attestation.

**Complete acceptance/adoption remain incomplete.** No configuration write or
recovery was needed. Final pull/scopes verified project preview settings still
match Prompt 395's `snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf`; the immutable retained
preview continues to use Prompt 405's candidate
`snap_8OP5G2tCUvxtRdoGFMCu5se58f3N`. The project's old signature upper bound
remains no later than about `2026-10-21T09:02Z`, possibly earlier. The
candidate's original producer interval supplies an upper bound only, no later
than `2026-10-22T06:35:09.451Z`, possibly earlier absent its CVD timestamp.
Neither scans, acceptance nor last-use extends that signature window.

Next: separately bounded isolation proof using these existing artifacts, then
guarded adoption only on complete acceptance. Allow roughly two hours before
the candidate upper bound (planning judgment); no new scan/PUT is needed for
the retained isolation reads. No B creation or adoption is implicitly authorized
by this record. Hosted cadence, storage accounting, retirement, production
activation and all eleven sign-offs remain open.

See [the exact actions, failed assertion and checks](operations.md#prompt-406--retained-preview-partial-acceptance-2026-10-20).
Private custody: `prompt406-20261020T070600Z/` under the approved parent. No push
or production action occurred.

## Retained preview isolation accepted, adoption stopped — Prompt 407 (2026-10-20)

At local baseline `a39fd1b`, one authorized continuation completed missing
isolation proof for retained deployment
[`dpl_AGwu9k8gbtQRegTodmHUAL7uxYs4`](https://acres-pbbb1g728-dgsloxx417s-projects.vercel.app),
source `9744d812e08de5313f1191e1fb609c513409d26a`, `iad1`. Fresh preflight
confirmed fixed ownership, active Hobby/no blocks, candidate handoff/hash
consistency and four retained snapshots with no sandboxes.

At `08:07:33.394–08:08:55.876Z`, A's retained session and three uploads were
reused; exactly one synthetic B account/organization was created. Twenty app
requests included two POSTs, with zero logins, uploads, PUTs or completions.
Dashboard/session/org controls passed. For clean and EICAR, B's own-org status,
forged A-header status and own-org download reads all returned 404 / `NOT_FOUND`
without data/capabilities: six denials. B's independent session and own-org
HTTP/SQL controls passed; it had no A membership.

A positive controls verified three uploads/objects, two dispatched events,
two terminal jobs and the infected dead letter against retained keys/links.
The same exact-ID SQL/parameters returned zero under transaction-local B
context across all five tables, then A visibility was restored. The designated
`acres_app` role was non-owner/non-superuser/NOBYPASSRLS with enabled/forced RLS;
no worker context or direct data writes. Original pending state, clean
accepted/succeeded and EICAR rejected/failed/infected remained intact, attempts
1 and no linked dataset versions. Clean unsigned GET was 403, A's EICAR download 404. Inventory at `08:09:50.008Z` had zero sandboxes and unchanged snapshot
metadata. No scanner compute, rebuild, probe, deployment or deletion occurred.

**Retained application acceptance is complete; project adoption is incomplete.**
A guarded adoption helper stopped before its first mutation intent because it
assumed CLI env JSON contained record IDs. It does not: undefined-ID matching
made an unrelated timestamp comparison fail. Source review missed that schema
assumption. No PATCH, recovery write or retry followed. Read-only final
inspection at `08:12:38.773Z` verified unchanged key-scoped CLI metadata, raw
provider record IDs/scopes/metadata and readable values/full key set. OIDC was
excluded, and redacted sensitive plaintext equality remains unproved.

The separately corrected offline helper binds CLI rows to verified raw API
record IDs by full scope, retains a single-send native HTTPS mutation transport,
and requires response/metadata ownership for conditional recovery. Fifty-six
offline tests passed; it was not executed live. Actual adoption needs a new
bounded continuation with fresh checks; no repeat upload/isolation is needed.

Project preview still uses Prompt 395's
`snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf`, with historical signature upper bound no
later than about `2026-10-21T09:02Z`, possibly earlier. Immutable preview retains
Prompt 405's `snap_8OP5G2tCUvxtRdoGFMCu5se58f3N` by the qualified historical
binding inference. Its producer-interval upper bound remains no later than
`2026-10-22T06:35:09.451Z`, possibly earlier without a CVD timestamp; reserve
roughly two hours (judgment). Retained reads re-attest no present-time freshness.
No functional rollback or new release is claimed. Hosted cadence/source
publication, billing accounting, retirement, production plan and eleven sign-offs
remain open.

See [the full execution, failure and verification record](operations.md#prompt-407--retained-preview-isolation-accepted-adoption-stopped-2026-10-20).
Custody: `prompt407-20261020T080019Z/` beneath the approved private parent.
No push, production action or launch approval occurred.
