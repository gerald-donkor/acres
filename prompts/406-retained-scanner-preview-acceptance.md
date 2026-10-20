# Prompt 406 — retained scanner preview acceptance

## Scope and why this is next

Parent: Phase 12 / approved Prompt 370's managed Vercel migration. Complete one
bounded application acceptance continuation against the scanner candidate and
immutable preview already prepared by Prompt 405. Correct the private verifier's
signed-PUT assumption, account for the retained pending upload, and only after
successful application proof restore the candidate as the project preview
configuration. No new snapshot build, seam probe or deployment is authorized.

Planning baseline: clean `main` at
`527c98a0afb55f2063b40dfdc2d7014076091fd6`. Commits `9744d81` and `527c98a`
record the allowance gate and subsequent attempt/recovery. Actual code and the
committed operational record establish:

- Candidate `snap_8OP5G2tCUvxtRdoGFMCu5se58f3N` passed builder smoke and the
  independent seam probe; daily digest prefix `94fead17` differs from Prompt 395.
- Preview `dpl_AGwu9k8gbtQRegTodmHUAL7uxYs4`,
  <https://acres-pbbb1g728-dgsloxx417s-projects.vercel.app>, was Ready at
  `2026-10-20T06:41:37.507Z`, in `iad1`, built from committed source
  `9744d812e08de5313f1191e1fb609c513409d26a`.
- One account, one organization and one pending clean upload remain from that
  attempt. The verifier rejected its signed URL locally **before PUT**. No scan
  job or Blob object was created by that upload at last inspection.
- Project-level scanner settings were conditionally restored to Prompt 395's
  `snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf`. The immutable new deployment retains
  its candidate configuration; project settings do not rewrite that deployment.
- All four snapshots were retained and zero sandboxes remained. These are
  historical observations requiring fresh inspection, not current guarantees.

The earliest dependency-safe unfinished gate is application scan acceptance.
Repeating rebuild/deploy would spend resources without resolving the verifier
error. Hosted cadence is separately blocked on source publication/access;
snapshot retirement and all production exit gates remain separate.

## SKILLS USED

- `deployment-pipeline-design` — sequence retained-deployment proof before conditional project adoption.
- `secrets-management` — restricted custody, minimal credentials and stdin-only configuration values.
- `error-handling-patterns` — distinguish verifier defects, uncertain writes, terminal failures and incomplete evidence.
- `e2e-testing-patterns` — bounded clean/EICAR application journey and isolation assertions.
- `javascript-testing-patterns` — offline regression cases for the private verifier before network mutations.
- `security-best-practices` — preserve signed-URL scope, HTTPS, CSRF, quarantine and tenant isolation.
- `neon` — preserve existing provider/identity boundaries; no provisioning or tool setup.
- `neon-postgres` — narrow read-only correlation through the designated existing preview application role.
- `requesting-code-review` — independent read-only review of the final evidence and diff.
- `receiving-code-review` — verify reviewer findings against actual source and observations.
- `caveman-commit` — required local Conventional Commit on `main`.

These skill files were opened during prompt preparation; reload them at execution.
No dedicated Vercel skill is available. Verify CLI flags using installed help and
provider APIs using installed SDK types/source. Do not install or update skills,
dependencies or tools. This narrow operational continuation does not touch the
other Phase 12 surfaces (CI, telemetry, runtime code, threat model or UI), so their
implementation skills are not pulled into scope. If new live documentation is
needed, load the applicable web skill and consult official primary sources.

## References read and sources to recheck

- `AGENTS.md`: phase control, scope, prompt/review/commit/push contracts, §§5–9.
- `docs/build-plan.md`: Phase 12 and the latest 403–405 implementation records.
- `docs/project-status.md`: historical assessment and managed-target limitation.
- `docs/skills.md`: skill selection and installation boundaries.
- `docs/operations.md`: operations posture and both Prompt 405 records, especially
  the `06:31–06:45 UTC` continuation, failure boundary and conditional recovery.
- `docs/vercel-deployment.md`: fixed target, resume gates and retained deployment.
- `docs/operator-handoff.md`: restricted custody and production authority limits.
- `docs/system-architecture.md` §11.1 and `docs/security.md` §3: configuration,
  secrets and non-transitive trust boundaries.
- `docs/backend.md`: Prompt 370 migration preparation; managed records are owned
  by the deployment document, not an assumption about the reference profile.
- `docs/authenticated-app.md` §§1–3: session/CSRF and active-organization headers.
- `infra/vercel/runbooks/managed-operations.md` §5.5: activation, application proof,
  retained dependencies and signature-window limits.
- `prompts/405-scanner-refresh-three-and-preview-verification.md`: previous
  authority limits and consumed budgets, not standalone implementation proof.
- `server/src/storage/vercel-blob-storage.adapter.ts`: constrained private PUT
  and separate signed GET contracts.
- `server/src/uploads/uploads.service.ts`, `uploads.controller.ts`,
  `dto/initiate-upload.dto.ts`, `dto/complete-upload.dto.ts`: ledger and request
  semantics, stored expiry, byte/hash verification and completion dispatch.
- `server/src/scanner/vercel-sandbox-scanner.adapter.ts`: source/hash/age policy,
  deny-all non-persistent VM, fail-closed result and cleanup.
- `server/src/prisma/tenant-transaction.service.ts` and
  `server/prisma/schema.prisma`: transaction-local context and correlation models.
- `scripts/vercel/probe-platform.js`: private PUT protocol, anonymous-read checks
  and existing EICAR fixture. Do not execute its live probes in this prompt.
- `node_modules/@vercel/blob/package.json` and
  `node_modules/@vercel/blob/dist/chunk-XKVPKJPO.js`: installed SDK **2.8.2**,
  `defaultVercelBlobApiUrl`, `buildPresignedPutUrl`, `buildPresignedGetUrl` and
  `presignUrl`. PUT uses `https://vercel.com/api/blob/` with a pathname query;
  GET uses the object's storage URL. The former is not a private-storage host.
- `.node-version` and root `package.json`: Node **24.21.0** and existing checks.

At execution also inspect the designated prior private acceptance source and
artifacts, current auth/organization DTOs and actual correlation fields before
constructing requests/SQL. Open paths before citing them. This prompt adds no
Next/React API, so no framework implementation is authorized. No visual change,
comp crop, pixel measurement or breakpoint comparison is needed.

## Expected impact and permitted files

The existing immutable preview may acquire proven clean/rejected synthetic
uploads. On complete success, three project preview scanner values may point
back to its validated candidate for future deployments. Existing deployment
configuration and source remain immutable; no routing, public UI or API contract
changes. Project adoption alone is not a new release or a functional rollback.

Tracked changes: this prompt plus narrow records in `docs/operations.md`,
`docs/vercel-deployment.md` and `docs/build-plan.md`. Update the deployment resume
section to distinguish the current project configuration, retained deployment
configuration and next refresh bound. Correct only the relevant paragraph of
`infra/vercel/runbooks/managed-operations.md` §5.5 if the verified PUT/GET
distinction warrants durable procedural guidance. Preserve historical records
and whole-file formatting; do not rewrite old observations as current facts.

The corrected verifier, offline tests, request files and raw provider evidence
stay in new private custody outside the repository. A product/helper change
requiring tracked runtime code is a separate prompt, not an incidental fix here.

## Authority on approval and action budget

Only team `team_zE3mp7nrEZ6a7cxRavwUMYC4`, project
`prj_q9ApajZWDgdYZetnm5s5oakEjrUD`, environment `preview`, region `iad1`.
Free tiers only. Approval supplies a **new bounded acceptance continuation**;
it does not reset Prompt 405's consumed build/probe/deploy budgets.

Allowed:

1. Target-only reads of account/allowance, project configuration/scopes, the four
   known snapshots, retained deployment metadata and its relevant job logs.
   Private env pulls into new files only, including OIDC refresh if needed.
2. Read the designated Prompt 405 custody directory
   `~/.config/acres/vercel-preview/prompt405-20261020T063209Z/` and necessary
   Prompt 395 predecessor configuration evidence. Create one new
   `prompt406-<UTC stamp>/` beneath that approved parent: directory 0700, files
   0600, executable scripts 0700. Never overwrite prior evidence.
3. Reuse the existing account/organization A and its clean pending upload if the
   signed PUT remains usable. Otherwise allow **one replacement clean initiation**
   while retaining the old pending row. Allow **one EICAR initiation**. Thus at
   most two new upload rows and two PUT/complete submissions total; only one
   clean payload is submitted. Never try the old PUT and then replace on failure.
4. Reuse account A's private session or make one ordinary login with its retained
   credentials and refresh CSRF. At most **one new synthetic account B and one
   organization B**, solely for isolation; none if suitable B records already
   exist in the designated evidence. No A replacement or password reset/mail.
5. Read-only correlation of these exact accounts/organizations/upload IDs through
   designated `acres_app` preview credentials and tenant-local transactions.
6. Only after every acceptance gate passes, one guarded adoption of
   `SCANNER_SANDBOX_SNAPSHOT_ID`, `SCANNER_MAIN_SHA256`,
   `SCANNER_DAILY_SHA256`, preserving preview scopes, plus conditional recovery
   of the same records if that adoption is partial or cannot be verified.

Zero new builder/seam-probe invocations, deploys, manual job retries, Cron kicks,
snapshot/deployment/object/ledger deletions, aliases, production promotions,
migrations, account role/branch changes, credential rotation, mail, GitHub
dispatch/settings writes or pushes. Normal application-managed scanner VM
creation/cleanup is inherent in the two completions; record actual VM/job activity
and any automatic redelivery, rather than claiming two requests cap provider
internals. Do not modify retry policy or replay jobs to obtain success.

Stop dependent actions on paid capability, 402/429, quota pause, unverified current
allowance, unexplained concurrent state, unexpected target or uncertain resource
outcome. A tool-policy rejection is not permission to change transports and
repeat the same write; explain the actual rejection and present concrete prepared
owner-executable scripts when appropriate.

## Execution plan

### 1. Re-establish identity, custody and feasible window

Record UTC, branch/status, current full SHA and the retained deployment's exact
source SHA. Require `main`; explain intervening history. The approved uncommitted
prompt is intentional. Select existing Node 24.21.0 for direct and npm processes;
check existing CLI/SDK versions and help without installation or login changes.

Inspect only the designated artifacts to recover account A, organization A,
pending upload ID, exact bytes/hash, response/expiry, cookie jar and verifier.
Never print secrets, passwords, cookies, connection strings, signed URLs or raw
error bodies. If the identity or credentials cannot be recovered, stop acceptance
rather than minting a substitute account A.

Freshly verify fixed target, active free plan/no blocking state, current allowance
for two application scans and storage headroom, retained Ready deployment and
candidate, snapshot inventory and no unexplained active VMs. The earlier owner
crops and Hobby metadata are historical; assess their age and obtain current
target-bound evidence if they no longer support this attempt. Inventory byte
totals are not billing accounting. No creation call is a quota experiment.

Privately pull current preview values/scopes and require the explained Prompt
395 restored configuration, or a fully documented authorized successor. Verify
provider `vercel-sandbox`, max age `48`, and five scanner records' preview-only
scope without branch overrides. Parse env as data, never execute it. Recompute
Prompt 405 receipt/runtime digests against the handoff, verify exact candidate
and full hashes, all success/cleanup fields and target. Root `scanner.env` is
stale and cannot select either configuration.

Check actual time against the candidate's original fetch interval, not the
deployment's creation time. Original producer interval was
`2026-10-20T06:33:39.250Z–06:35:09.451Z`; inspect original evidence to narrow it.
Without a recorded CVD timestamp, the producer interval's end + 48 hours
(`2026-10-22T06:35:09.451Z`) is only an upper bound; actual expiry can be earlier.
Use a proven earlier fetch time if the original artifacts establish it. Reserve about two
hours before that bound for this continuation (a planning judgment). If already
outside that useful window, retain evidence and stop; no rebuild fallback or
age-policy relaxation is authorized. Application signature validation remains
the real freshness gate. The restored project's old historical bound remains
no later than about `2026-10-21T09:02Z` until success is established.

### 2. Correct and verify the private client before mutations

Copy the prior verifier into new custody and separate offline validation from
live execution so import/test cannot register, initiate or transmit anything.
Inspect all remaining request assertions, not only the failed hostname check.
Use installed SDK 2.8.2 source and the application's returned contract as truth.

For PUT, validate HTTPS, exact `vercel.com` origin with no userinfo/non-default
port/fragment, the SDK's `/api/blob/` path, one pathname equal to the returned
object key, expected method `PUT`, unexpired `expiresAt`, and returned headers.
Check locally accessible delegation/store/path constraints using the inspected
SDK shape; do not invent a signature-verification algorithm. Use the returned
URL intact, including all query encoding/signature parameters. Do not rewrite it
to the GET host, sign another URL, add a read-write token or change provider
constraints. A changed/unrecognized provider URL shape stops the run for review.

Transmit bytes with only the returned upload headers and required transport
headers. App cookies, CSRF, deployment protection bypass and Vercel API tokens
must never reach the Blob PUT. Use verified fetch semantics with redirect denial
and bounded deadlines; keep capabilities out of process arguments and logs.
Anonymous checks use the corresponding **unsigned object URL**, not the signed
PUT or a signed GET. Signed URLs themselves are bearer access, not anonymous
privacy evidence. Use actual SDK/protocol response fields, not guessed hostnames.

Run offline regression cases with synthetic capabilities, no live tokens or
network: valid API PUT passes unchanged; private GET host in a PUT contract,
HTTP, hostile/suffix-confusable host, userinfo, unexpected port/path, duplicate or
wrong pathname, expired/malformed expiry and non-PUT method fail before transport.
Mock transport to verify exact URL/body/headers, credential separation, redirects,
and single-send behavior. Also cover expired-pending selection, preventing both
old and replacement sends, and stopping on failure. These checks prevent a repeat
of the actual verifier defect; no new test framework or dependency is needed.
Run syntax checks, inspect the complete safe source, and retain real test output.

### 3. Complete one clean and one EICAR application journey

Use only the retained immutable URL through installed, verified
`vercel curl --deployment` syntax for app requests. Keep cookies/request bodies
in private files and preserve normal CSRF/session/organization selection.

1. Verify account/organization A and refresh CSRF after any login. Hard gate:
   `/app` is 200, contains `id="dashboard-title"` and no `role="alert"`.
2. Read the exact pending upload and correlate its current state, object absence,
   outbox/job absence and stored expiry. Determine the clean branch **before**
   PUT. Reuse only if still pending, provably unexpired with useful transfer time,
   exact original bytes available and no prior object/job. Otherwise retain it
   untouched and initiate one new uniquely keyed small clean CSV. Idempotency
   replay of the old initiation is not a URL-refresh endpoint. Never edit expiry
   or ledger state directly. Any unexplained prior completion stops the run.
3. Validate the selected response offline, PUT once, require successful storage
   response, complete once using verified byte count/SHA-256 and fresh distinct
   idempotency key, then poll until `accepted` with clean scan status.
4. Initiate and validate one small EICAR CSV using the existing probe fixture
   without logging its bytes. PUT and complete once; require terminal
   `rejected`/`infected`, download 404 and no published dataset version linked to
   that upload. Do not bind either upload to an ingestion or publish command.
5. Under the authorized application role, use parameterized, read-only
   transactions scoped to A to correlate exact uploads/stored objects, outbox
   dispatch and terminal durable jobs. Verify current role is non-superuser and
   NOBYPASSRLS. Do not enable worker context or use migrator/admin credentials.
   Schema and existing SQL determine the fields, not remembered column names.
6. Verify unsigned private-object reads are denied with the actual status
   (historical 403; accepted denial set 401/403/404). A missing/quarantined EICAR
   object does not independently prove private-store access controls: the clean
   retained object's anonymous denial must pass. Capture only safe status facts.
7. Reuse or create B within budget. Using B's own session, both upload IDs must
   return 404 under B's organization; also test the forged A organization header
   against the implemented guard contract (membership denial may differ from
   ordinary scoped 404). Require no upload data in either denial and record exact
   status/code. Transaction-local B reads must expose zero A rows.
8. Inspect only this deployment's relevant job logs and before/after snapshot/VM
   metadata. Require application cleanup consistent with the source contract and
   retained base snapshots. Correlate candidate binding from original verified
   writes-before-deployment, immutable source, adapter hash/source checks and
   scan-related metadata. If resolved env values are not attested by provider
   metadata, explicitly call the identity conclusion an inference.

Poll at no less than five-second intervals, up to ten minutes / 120 reads per
upload (judgment-based limits), with short per-request deadlines and progress
updates at least every 60 seconds. Ordinary waiting/polling is allowed; a terminal
failure, unexpected response, timeout or uncertain write stops new mutations.
Read-only correlation and cleanup inspection may continue. No repaired verifier
rerun, replacement after attempted PUT, second acceptance run or manual retry.
Maintain a phase journal so interruption cannot accidentally repeat mutations.

### 4. Adopt project values only on complete acceptance

If any preceding gate is failed/incomplete, leave project configuration as found
and record candidate/deployment and pending records honestly. No rollback deploy
is needed because this prompt deployed nothing.

On complete success recheck current time/window, original handoff/full hashes,
target and configuration/scopes immediately before mutation. Prepare guarded
adopt and conditional restore scripts **before** the first write. Adoption changes
only the three named preview scanner values via stdin, preserving scopes and
provider/max age. Require current values still equal the captured predecessor;
stop on concurrent divergence. One pass may skip already-equal values.

Pull into a new private file and verify all three candidate values, complete key
sets, scopes and unrelated record metadata. Explain volatile OIDC differences
and limits on plaintext comparison for redacted sensitive records. Partial or
unverifiable adoption triggers conditional restore of only this attempt's writes
when values still match this attempt/predecessor; never overwrite a concurrent
third value. Verify restoration with fresh pulls/scopes and report uncertainty.
No deploy follows adoption. It governs future previews, while application proof
belongs to the retained immutable deployment and its older source SHA.

## Verification, documentation, review and completion

After the attempt or verified prerequisite stop, run under Node 24.21.0 and quote
actual relevant output/exit status, sequentially:

```bash
node scripts/vercel/check-vercel-config.js
npm run vercel:probe-test
npm run lint
npm run typecheck
npm run build
npm run ops:scan-secrets
git diff --check
```

Also retain private verifier syntax/offline test output. Use installed Prettier
on this prompt and changed/new documentation passages; distinguish pre-existing
whole-file warnings. No aggregate ops check, online audit, full DB/browser suite
or launch drill is required for this operational record; do not claim them.

`docs/operations.md` records UTC/source identities, exact gates and action counts,
old-pending disposition, replacement selection, clean/EICAR outcome, isolation,
job correlation, VM cleanup, conditional adoption/recovery and private evidence
inventory. `docs/vercel-deployment.md` records the retained URL/source and current
project settings separately, with a truthful resume gate.
`docs/build-plan.md` adds a concise Phase 12 pointer without claiming exit.

A successful candidate does not gain 48 hours from acceptance, adoption or this
prompt. If original fetch evidence supports an updated bound, state no later than
original fetch time + 48 hours, possibly earlier absent CVD timestamp; never use
snapshot creation/deployment as a measured freshness timestamp. Set the next
manual refresh planning margin as a judgment. If blocked, retain the old bound
and name the next actual prerequisite. Hosted cadence, storage accounting,
retirement, production plan and eleven sign-offs remain open in all outcomes.

After self-verification dispatch the mandatory reviewer subagent with this
prompt, baseline/current SHAs, complete diff, sanitized verifier source and actual
safe evidence/check outputs. The reviewer is read-only, with no cloud actions or
private credential access. Ask about credential separation, mutation budgets,
expired-pending handling, immutable-deployment/project distinction, freshness
and false closure. Apply `receiving-code-review`, verify valid findings, fix
record/verifier issues without restarting live acceptance, and re-review
significant changes.

Commit only approved prompt/docs locally on `main` using `caveman-commit`; no
push. A blocked investigation may be committed as such and is not completed
application acceptance. Final response gives commit, honest acceptance/adoption
state, remaining gate and the verified retained URL. To inspect, read the new
operations passage and open the immutable preview; local tooling verification
uses `npm run vercel:probe-test`, without starting a server.

## Non-goals and rollback

No product/source/workflow/design change, dependency/tool update, rebuild,
seam probe, deployment, Cron/queue replay, snapshot retirement, mail/domain,
production activation, hosted cadence configuration, push or launch approval.
No deletion of the old pending row, synthetic identities, objects, retained
snapshots or deployment. EICAR quarantine handling and ephemeral VM cleanup by
the existing application are ordinary tested behavior. Configuration rollback
is limited to this prompt's conditional adoption as specified above;
documentation rollback is a local revert and never erases historical provider
operations.
