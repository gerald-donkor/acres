# Vercel migration — Prompt 370

Status: implementation in progress. Preview Blob (server SDK and browser
presigned upload) and Neon database/RLS seams are proven. Only synthetic probe
deployments exist; the Acres application has not been deployed.
Starting source: `a1350d0` on `main`.
[ADR 0001](adr/0001-vercel-managed-production.md) records the accepted target.

## Resume here (new session)

Prompt 370 is approved and still executing. Remaining checklist items may be
split into numbered sub-prompts (Prompt 371 = Blob browser upload); each
inherits 370's approval limits. A new session resumes from this section and
`git log`.

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
```

**Remaining work, in order** (each ends verified, reviewed, recorded here and
committed per AGENTS.md §2):

- [x] **Queues consumer** — platform seams proven on previews and the
      consumer/adapter/lease implemented locally (see "Queues — 2026-10-15"
      below). Still open, owned by later items: a Vercel outbox dispatcher
      (after-commit kick plus Cron reconciliation sweeper) that also carries
      `ingestion.run`, wiring `server/src/vercel/jobs.function.ts` into the
      real Services config with no `maxDeliveries` and pinned regions, and an
      application-level hosted job proof on the first preview deployment.
- [ ] **Blob browser upload** — local implementation done (Prompt 371); the
      presigned protocol is proven from a real browser on the preview store
      (see "Blob browser upload — 2026-10-15" below). The hosted application
      proof waits for the first preview deployment.
- [ ] **Scanner image** — build and push a pinned VCR ClamAV image with
      checksum-bound `main.cvd`/`daily.cvd`, then run the scanner probe with
      `VERCEL_TOKEN`, `ACRES_VERCEL_PROBE_REGION=iad1`,
      `ACRES_SCANNER_IMAGE` (digest-pinned), `ACRES_SCANNER_MAIN_SHA256`,
      `ACRES_SCANNER_DAILY_SHA256` and `ACRES_SCANNER_MAX_SIGNATURE_AGE_HOURS`
      (see [the probe guide](../infra/vercel/README.md)) plus the live failure
      cases (`vercel:vercel-sandbox`). Hobby: 45-minute sessions, 5
      CPU-hours/month.
- [ ] **First preview deployment** — Services/route config, only the
      `acres_app` pooled URL as a **sensitive** `DATABASE_URL`, remove or mark
      sensitive the `NEON_OWNER_*` variables, migrations as a guarded
      non-runtime step, distributed throttling, protected endpoints
      (`vercel:vercel-services`, `vercel:deployments-cicd`, `vercel:env-vars`).
      Add `BLOB_STORE_ID` (`store_g2fmCH5CW7TJbkN3` for preview; absent from
      project env today) and `STORAGE_PROVIDER=vercel-blob`, and unset every
      S3 `STORAGE_*` variable. **Remove `BLOB_READ_WRITE_TOKEN` from preview
      env first**: a configured token always takes precedence over OIDC in the
      SDK, so OIDC cannot be proven while it is set. Then prove app upload →
      complete → scan through the deployed preview with
      `STORAGE_PROVIDER=vercel-blob`, `BLOB_STORE_ID` set, OIDC.
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
month, pausing (not billing) past quota; Queues (Beta) is available on all
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

## Target and gates

Vercel Services is the candidate single-project arrangement, documented in Beta
with internal bindings and explicit public routing. Nest uses native Function
entrypoint detection. The account-specific arrangement and queue consumer layout
require a preview proof before active configuration is added.

| Gate              | Required evidence                                                                                                            | Current state                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Database          | Migrated isolated Neon/PostGIS; runtime cannot bypass forced RLS; pooled context reuse, concurrent transactions and rollback | Proven for preview at the database seam (2026-10-15); application-level pooled Prisma acceptance open |
| Blob              | Private direct browser upload above function body limit; scoped token, authorized private read, checksum, cancel/delete      | Seam proven: server SDK and browser presigned protocol (2026-10-15); deployed-app upload open         |
| Scanner           | Pinned Sandbox scanner/signatures; clean/EICAR, missing/stale signatures, timeout/memory/byte limits and cleanup             | Blocked: account/plan and pinned scanner source/signatures absent                                     |
| Durable execution | Same-project producer/consumer, forged request denial, duplicate/retry/interruption and preview isolation                    | Platform seams proven with a synthetic probe (2026-10-15); application job on a hosted preview open   |
| Production        | Account-bound recovery, capacity, telemetry, security and eleven signed launch categories                                    | Open; no categories approved by local implementation                                                  |

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
