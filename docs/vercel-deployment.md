# Vercel migration — Prompt 370

Status: implementation in progress; no hosted proof, preview or production
migration/deployment established. Starting source: `a1350d0` on `main`.
[ADR 0001](adr/0001-vercel-managed-production.md) records the accepted target.

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
No secret was decrypted or printed; no probe has run.

## Target and gates

Vercel Services is the candidate single-project arrangement, documented in Beta
with internal bindings and explicit public routing. Nest uses native Function
entrypoint detection. The account-specific arrangement and queue consumer layout
require a preview proof before active configuration is added.

| Gate              | Required evidence                                                                                                            | Current state                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Database          | Migrated isolated Neon/PostGIS; runtime cannot bypass forced RLS; pooled context reuse, concurrent transactions and rollback | Blocked: selected Marketplace resource/access absent                                   |
| Blob              | Private direct browser upload above function body limit; scoped token, authorized private read, checksum, cancel/delete      | Blocked: selected isolated store/access absent; server SDK probe alone is insufficient |
| Scanner           | Pinned Sandbox scanner/signatures; clean/EICAR, missing/stale signatures, timeout/memory/byte limits and cleanup             | Blocked: account/plan and pinned scanner source/signatures absent                      |
| Durable execution | Same-project producer/consumer, forged request denial, duplicate/retry/interruption and preview isolation                    | Blocked: selected project/layout and live access absent                                |
| Production        | Account-bound recovery, capacity, telemetry, security and eleven signed launch categories                                    | Open; no categories approved by local implementation                                   |

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
