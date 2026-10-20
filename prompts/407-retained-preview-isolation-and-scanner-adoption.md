# Prompt 407 — retained preview isolation and scanner adoption

## Scope and why this is next

Parent: Phase 12 / approved Prompt 370's managed Vercel migration. Complete
the missing tenant-isolation gate against Prompt 405's retained immutable
preview and Prompt 406's existing scan artifacts. Only after complete retained
acceptance, conditionally adopt the validated candidate into project preview
settings. This is one new bounded continuation, not a replay of either failed
acceptance verifier. No new upload, PUT, completion, scan, rebuild, seam probe or
deployment is authorized.

Planning baseline: clean `main` at
`a39fd1bd3092228c9ac80bdf8e72e6a6dc72e408`. Actual code, the latest commit
and its operational record establish the following historical facts:

- Deployment `dpl_AGwu9k8gbtQRegTodmHUAL7uxYs4`,
  <https://acres-pbbb1g728-dgsloxx417s-projects.vercel.app>, was Ready in
  `iad1`, from source `9744d812e08de5313f1191e1fb609c513409d26a`.
- Its scanner candidate is `snap_8OP5G2tCUvxtRdoGFMCu5se58f3N`, by inference
  from verified writes before deployment, handoff/hash checks and subsequent
  use metadata. Provider metadata did not attest resolved scanner values.
- Prompt 406 reused A, retained the expired original pending upload untouched,
  and submitted exactly one replacement clean and one EICAR upload. Clean is
  `accepted` / `clean`, stored object `accepted`, durable job `succeeded`.
  EICAR is `rejected` / `infected`, object `rejected`, durable job correctly
  `failed` with `lastErrorCode: infected` and an `infected` dead letter. Both
  outbox events dispatched; both jobs had attempt 1.
- Unsigned object reads returned 403; EICAR application download returned
  404; exact-upload dataset versions were zero. No sandboxes remained and all
  four live snapshots were retained.
- A private verifier incorrectly expected EICAR's job to succeed and stopped
  before B registration or isolation. A corrected offline revision passed 26
  tests; the further reviewed `acres406-accept-reviewed-v2.cjs` removed
  vacuous B-organization predicates and required A positive controls. Neither
  corrected flow ran live.
- Project preview configuration remained Prompt 395's
  `snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf`; no adoption/restoration writes occurred.
  Project settings and immutable deployment settings are separate states.

The build plan explicitly names bounded isolation proof on these artifacts as
the next gate. Rebuilding or resubmitting would not resolve it. Hosted cadence
still requires separately published source/access and does not replace this
application gate. Production activation, retirement and Phase 12 exit remain
separate work.

## SKILLS USED

- `deployment-pipeline-design` — gate project adoption on complete retained acceptance and prepare conditional recovery.
- `secrets-management` — restricted evidence custody, separate credentials and stdin-only configuration values.
- `error-handling-patterns` — distinguish expected infected rejection, verifier errors, uncertain writes and incomplete proof.
- `e2e-testing-patterns` — authenticated A/B isolation with positive controls and retained-artifact correlation.
- `javascript-testing-patterns` — offline verifier regressions and mutation-budget tests before live execution.
- `auth-implementation-patterns` — preserve independent sessions, CSRF and organization-membership enforcement.
- `security-best-practices` — security-sensitive isolation proof without exposing bearer capabilities or weakening controls; read the Express reference for the Nest backend.
- `postgres-best-practices` — parameterized, exact-ID SQL and transaction-local tenant context without application-side filtering as a substitute for RLS.
- `neon` — retain existing database/provider identities; no provisioning, setup or skill updates.
- `neon-postgres` — use the designated existing preview application connection and preserve pooled transaction semantics.
- `requesting-code-review` — independent read-only review before recording and committing the final result.
- `receiving-code-review` — verify feedback against actual source and evidence before corrections.
- `caveman-commit` — write the mandatory local Conventional Commit on `main`.

These skills were opened during planning; reload every listed skill at execution.
No dedicated Vercel skill is available. Verify existing CLI/API/SDK calls from
installed help, types and source, rather than inventing flags. No new provider
capability or API contract is designed here. Other Phase 12 implementation
surfaces (CI, telemetry, runtime architecture, threat-model changes and UI)
are out of scope. If current external docs become necessary, load the relevant
web skill and use official primary sources. Project authority overrides generic
skill advice to install/update tools, create branches, truncate fixtures or send
feedback; none of those actions is part of this prompt.

## References read and execution references

Read during preparation:

- `AGENTS.md`: phase control, §§2–7 and §§8–10; preparation stops before execution.
- `docs/build-plan.md`: phase status, Phase 12 / managed-target sequence and the
  latest Prompts 403–406 records.
- `docs/project-status.md`: historical completion assessment and managed-target limitation.
- `docs/skills.md`: skill purposes and installation boundaries.
- `docs/operations.md`: operations posture and complete Prompt 406 record,
  including corrected offline verifier, RLS review finding, exact outcomes,
  cleanup, original freshness bounds and checks.
- `docs/vercel-deployment.md`: resume section, fixed target and Prompts 405–406
  records distinguishing current project from retained deployment state.
- `docs/operator-handoff.md`: custody and production authority boundaries.
- `docs/system-architecture.md` §§7, 11.1 and `docs/security.md` §3: independent
  membership/RLS boundaries, configuration and non-transitive trust.
- `docs/backend.md`: Prompt 370 preparation and ownership of managed evidence.
- `docs/authenticated-app.md` §§1–3: session/CSRF and organization header behavior.
- `infra/vercel/runbooks/managed-operations.md` §5.5: application proof, terminal
  job semantics, immutable deployment identity and signature-window limits.
- `prompts/406-retained-scanner-preview-acceptance.md`: prior budget and stop
  boundary; this file proves instructions, not their execution.
- `server/src/auth/auth.controller.ts`, `auth.service.ts`,
  `dto/register-account.dto.ts` and `server/src/accounts/accounts.service.ts`:
  existing registration/session semantics; registration does not send mail.
- `server/src/organizations/organizations.controller.ts` and
  `organization-context.guard.ts`: organization commands, list/get and membership
  denial. The inspected guard returns 404 / `NOT_FOUND` for a forged foreign
  organization, not an assumed 403.
- `server/src/uploads/uploads.controller.ts` and `uploads.service.ts`:
  scoped status and accepted-only download routes.
- `server/src/prisma/tenant-transaction.service.ts`,
  `server/prisma/schema.prisma` and
  `server/prisma/migrations/20260824170000_storage_queues_uploads/migration.sql`:
  models, transaction settings, forced RLS and tenant/global-row policy distinctions.
- `server/src/worker/job-processor.service.ts`: clean success versus infected
  rejection and dead-letter behavior; infected failure is an expected result.
- `server/src/scanner/vercel-sandbox-scanner.adapter.ts` and
  `sandbox-signature-check.ts`: source/hash checks and the CVD build-time age gate.
- Root `package.json` and `.node-version`: existing commands and Node 24.21.0.

At execution inspect the designated private Prompt 405/406 artifacts, exact
current registration/organization DTOs, relevant SQL policies and installed
provider methods before constructing requests. Open further files before citing
them. No private credentials, custody artifacts or live provider state were
read during preparation; their presence and current validity remain unverified.
No Next/React code or visual change is authorized, so no comp, pixel measurement
or breakpoint verification is needed.

## Expected impact and permitted files

The retained preview may gain one synthetic B account/organization and normal
session/idempotency/audit records. Existing uploads, objects, jobs and dataset
publication stay untouched by commands. On complete proof, three project preview
scanner values may adopt the retained candidate for future deployments. No route,
UI, schema, source or deployed release changes. Adoption does not update the
immutable preview, perform a rollback or create a new signature window.

Tracked changes are this prompt and narrow new records in `docs/operations.md`,
`docs/vercel-deployment.md` (including its current resume gate), and
`docs/build-plan.md`. Add at most a small §5.5 runbook clarification if needed
to preserve the positive-control/exact-ID RLS procedure. Preserve historical
observations and unrelated formatting. No runtime/helper/workflow changes.

New private verifier, offline tests, journals and raw evidence remain outside
the repository in approved custody. Any required product correction is a
separate prompt; document its blocker without fixing/deploying it incidentally.

## Approval authority and bounded actions

Only team `team_zE3mp7nrEZ6a7cxRavwUMYC4`, project
`prj_q9ApajZWDgdYZetnm5s5oakEjrUD`, environment `preview`, region `iad1`.
Free tiers only. Approval authorizes this new isolation continuation and its
conditional adoption; it resets none of Prompts 405/406's consumed budgets.

Allowed actions:

1. Target-only reads of plan/block state, project env/scopes, retained deployment,
   four known live snapshots, current VM inventory and narrowly relevant job logs.
   Fresh private preview env pulls/OIDC refresh into new files are allowed.
2. Read only designated custody under `~/.config/acres/vercel-preview/`:
   `prompt405-20261020T063209Z/`, `prompt406-20261020T070600Z/`, necessary
   Prompt 395 predecessor evidence and the established preview `acres_app`
   connection. Create one `prompt407-<UTC stamp>/` there with directory 0700,
   data files 0600 and executable verifier files 0700. Never overwrite predecessors.
3. Reuse A's retained account, organization and session. If expired, at most one
   ordinary A login. Reuse B only if the designated evidence proves a suitable
   independent synthetic account/organization and credentials; otherwise at most
   one B registration and one B organization creation. Reused B may have at most
   one ordinary login; newly registered B uses the registration session. Zero
   A replacements, invitations, membership/role edits, password resets or mail.
4. A/B application reads and fresh CSRF within one journaled continuation, capped
   at 48 app HTTP requests, including logins/registration/org creation and any
   authentication-detection request. This cap is a planning judgment, not a load
   threshold. Provider/config reads are recorded separately. No retry of a
   failed or uncertain mutation, including with the same idempotency key.
5. Read-only parameterized correlation of the exact retained synthetic IDs using
   designated preview `acres_app`, with explicit transaction-local A or B context.
6. Only after all gates pass, one guarded adoption pass over
   `SCANNER_SANDBOX_SNAPSHOT_ID`, `SCANNER_MAIN_SHA256`,
   `SCANNER_DAILY_SHA256`, preserving preview scopes. Conditional recovery may
   restore only records written by this pass, with concurrency guards.

Zero uploads/PUTs/completions, scanner VM creation, builder/probe execution,
job replay/retry, Cron kick, deploy, alias, deletion, migration, credential
rotation, provider-plan change, Neon provisioning/branch changes, GitHub
dispatch/settings write, push, production promotion or launch approval.
Retain the original pending upload, both terminal uploads, B, all snapshots and
the deployment. Existing provider/application bookkeeping is recorded honestly;
ordinary GETs are not claimed to have zero internal side effects.

Stop dependent mutations on wrong target, paid capability, 402/429, block/pause,
unexplained state/concurrency, missing custody, failed assertion, uncertain
request outcome or insufficient candidate window. No transport switch to evade
a tool-policy rejection. Report an actual rejection with its reason; finish
unaffected local records/checks and prepare concrete owner-run material if useful.

## Execution plan

### 1. Re-establish identities, custody and useful candidate window

Record UTC, branch/status and full local SHA. Require `main`; explain any
intervening commits without changing source selection. Only this approved
untracked prompt is expected. Use existing Node 24.21.0 and installed CLI/SDKs;
verify versions/help without installation or auth/config changes.

Recover A and the exact three upload IDs (original pending, replacement clean,
EICAR), object IDs, two outbox IDs, two job IDs and infected dead-letter ID from
the designated evidence. Recover identities and cookies privately; never print
emails, passwords, cookies, tokens, connection strings, signed URLs or raw
provider errors. Missing or ambiguous identity stops the continuation.

Freshly verify target ownership, active free plan/no block, Ready retained
deployment/source, expected snapshots and absence of unexplained active VMs.
This continuation creates no scanner compute: do not demand or claim a new
two-scan allowance, run quota experiments or treat inventory bytes as billing.
Confirm permitted free API/database operations; unresolved storage accounting
remains unresolved. Explain relevant historical usage evidence without calling
it current metering.

Pull preview values/scopes into fresh private files. Require the documented
Prompt 395 configuration, `SCANNER_PROVIDER=vercel-sandbox`, max age `48`, and
five preview-only scanner records without branch overrides. Any explained
authorized successor must be reconciled before action; do not overwrite it.
Recompute original candidate handoff/runtime digests, full hashes, target and
success/cleanup fields. Ignore stale root `scanner.env` for configuration choice.

Candidate producer interval is `2026-10-20T06:33:39.250Z–06:35:09.451Z`.
Without original CVD build time, `2026-10-22T06:35:09.451Z` is only a latest
possible expiry, not a guaranteed fresh-until time. Inspect existing evidence
for an earlier provable bound; no new VM may inspect it. Reserve roughly two
hours before the applicable bound for adoption (judgment). If outside that
useful window, record a prerequisite stop before creating B/adopting. Even
inside it, retained clean acceptance proves freshness at scan time only; no
fresh scan or present-time CVD attestation is claimed. Never extend age policy.

### 2. Prepare a continuation-only verifier and offline safeguards

Preserve the failed/corrected predecessors unchanged. Use the reviewed v2 source
as reference, but create a new verifier that has **no initiate/PUT/complete or
scan path**, and consumes retained IDs. Do not run the full predecessor flow.
Separate pure/offline modules from an explicit live entry point. Imports/tests
must not load real credentials or issue network calls.

Verify all remaining assertions before live use, including schema names,
expected job outcomes, session separation and denial envelopes. Keep app requests
on the exact immutable deployment using verified installed `vercel curl
--deployment` syntax and private request/cookie files. Disable redirects and
automatic mutation retry; set bounded per-request deadlines. Provider APIs,
app cookies/CSRF/protection bypass and unsigned Blob reads use separate
transports. Unsigned object reads contain no app or provider credentials.

Offline synthetic tests must prove:

- clean `succeeded` and infected `failed`/`infected` both satisfy their distinct
  expected contracts; wrong status/error/dead-letter combinations fail;
- A-positive checks fail for missing or wrong IDs before a B result is accepted;
- B query SQL/parameters select the same exact A IDs as the A queries, without
  an explicit B organization filter, join, or other predicate that makes the
  rows absent independently of RLS;
- a fake executor that returns A rows under B causes failure, while positive A
  visibility plus zero B rows passes; a test that merely checks a SQL string is
  not hosted RLS proof;
- separate A/B sessions and current CSRF, exact request allowlist, zero upload/
  PUT/complete calls, 48-request cap and single mutation dispatch;
- expected 404 / `NOT_FOUND` denies contain no `data` or signed capability;
  a login redirect, protection HTML, 401, 403 or arbitrary failure cannot pass
  as successful tenant isolation;
- an unknown outcome stops later writes; restart requires inspection and new
  authorization, not automatic replay; guarded adoption/restore never overwrites
  a third-party value or touches unrelated/scoped records.

Use installed tools only; run syntax and focused offline tests, inspect the
complete sanitized source, and preserve actual output before live mutation.
Maintain a phase/action journal with timestamps and before/after request counts.

### 3. Revalidate A and the retained evidence without resubmission

Reuse A's session or perform its one permitted login if needed; refresh CSRF
after session changes. Verify authenticated session identity and active A
membership. `/app` must return 200 with `id="dashboard-title"` and no
`role="alert"`. Read both terminal upload statuses with A's organization header.
Require the exact accepted/clean and rejected/infected states; no repolling
workflow or replacement is needed for existing terminal rows.

Open read-only transactions using the designated application role. Verify
`current_user=acres_app`, non-superuser, NOBYPASSRLS and no ownership of the
tested tables; inspect relevant ENABLE/FORCE RLS flags/policies. Set all four
contexts transaction-locally as in `TenantTransactionService`: A account/org,
empty invitation hash and empty worker access. Verify the effective settings
within that transaction. Preserve TLS verification, use parameterized IDs and
bounded query timeouts; close/rollback transactions and release connections.

Under A, require positive visibility of the exact three uploads/stored objects,
two outbox events and two durable jobs; correlate their foreign keys and A
organization rather than counts alone. Require original row still pending with
no job/outbox, terminal object/job states matching the historical record,
attempt 1 and dispatched events, and the exact infected dead letter. Check zero
`DatasetVersion` rows for all three exact `sourceUploadId` values. A missing or
changed row is an unexplained state and stops adoption, not a successful deny.
Inspect only necessary fields; exclude payloads, secrets and raw scan signatures.

Repeat unsigned **clean object's** privacy read, requiring 401/403/404 and no
object bytes; EICAR absence alone is insufficient store-privacy proof. Capture
safe status only, with no redirect following or bearer access. Recheck EICAR's
application download is 404 / `NOT_FOUND` with no data/capability. Use original
known object URL/path evidence, never a guessed storage host or signed URL.

### 4. Prove B membership, application isolation and independent RLS

Reuse B only if suitable existing designated records are proven. Otherwise
prepare private unique synthetic credentials, register B once through existing
`POST /api/v1/auth/register`, refresh CSRF, and create B's organization once
through `POST /api/v1/organizations` with a fresh idempotency key. Re-read DTOs
and response envelopes first. No verification/recovery email or direct SQL
identity insertion. Save each successful response before the next action.

Hard positive controls: B session identifies B, B account and organization differ
from A, B's own organization get/list succeeds, and B has no A membership. Verify
B's own organization/membership visibility in its scoped SQL transaction.
Do not accept an anonymous B or missing/invalid organization as isolation proof.

Using B's own cookie jar, for **each** replacement clean and EICAR upload:

1. `GET /api/v1/uploads/<A-upload-id>` with B's organization must return
   404 / `NOT_FOUND`, no upload data.
2. The same status read with forged A organization header must return
   404 / `NOT_FOUND` from the inspected membership guard, no upload data.
3. `GET /api/v1/uploads/<A-upload-id>/download` with B's organization must
   return 404 / `NOT_FOUND`, with no URL/capability. Clean denial is the
   substantive download isolation case; infected denial alone is insufficient.

For independent RLS proof use new read-only B transactions with B account/org,
empty invitation hash and worker access. Verify effective context. Run the
**same exact-ID select statements and A ID parameters** used successfully under
A for Upload, StoredObject, OutboxEvent and DurableJob. Each must return zero.
Also check the known infected dead-letter ID if included in A controls. No B
organization predicate, A/B membership join or impossible ID may manufacture
the empty result. Only the database context changes. Any foreign key/ID filter
must select the proven A rows under A, with the same parameters under B.
Global null-organization rows are not tested or claimed isolated by these checks.

Use the same checked-out pooled client for a final new A read transaction and
require its exact rows visible again with local A context, then close resources.
This checks scoped execution and restoration; do not claim the provider reused
one physical backend connection without evidence. Do not set role, disable RLS,
use owner/migrator credentials or set worker access true. RLS context testing
under an authorized application connection proves database org-scoping; the
HTTP forged-header test separately proves membership enforcement.

Any unexpected result ends this one continuation. Read-only inspection and
cleanup verification may continue, but no repaired live rerun, second B,
additional organization or later adoption follows a failed gate in this attempt.

### 5. Complete evidence and conditionally adopt project configuration

Reconcile all Prompt 406 scan/private-store/job evidence with these fresh A/B
reads, matching target, immutable deployment/source and exact artifact IDs.
Inspect narrowly deployment-bound logs if needed and compare before/after VM/
snapshot inventories. Require no unexplained scanner activity or residue.
These reads do not create a new VM lifecycle or re-attest scan freshness.
Keep candidate binding qualified as an inference unless genuinely new metadata
attests resolved values. Missing historical evidence cannot be replaced by
metadata presence, negative reads or offline tests.

If any gate is incomplete/failed, leave project settings as found. If complete,
immediately recheck time/window, target, original handoff/full hashes and fresh
project values/scopes. Prepare concrete guarded adoption and conditional restore
scripts **before** the first config write. Independently inspect their safe
source. Require predecessor values, record IDs and scopes still match capture;
stop on concurrent divergence. Change only the three approved values via stdin,
preserving preview-only scope, no branch override, provider and max-age records.
One pass may skip already-equal values; do not retry an uncertain write.

Pull into new private files and verify all candidate values, complete env key
set, record scopes and unrelated modification metadata. Explain volatile OIDC
and that redacted sensitive plaintext cannot be compared. On partial/unverifiable
adoption, conditionally restore only this attempt's written records after
confirming their current values/scopes still match this attempt; never overwrite
a concurrent third value. Inspect uncertain write state read-only before recovery.
Verify restoration with fresh values/scopes; report unresolved uncertainty.

No deployment follows. A successful outcome is **retained application acceptance
plus project preview candidate adoption**, with historical scan-time freshness
and no new present-time scan. It is not a newly deployed release, production
approval or 48-hour extension. Retain the old project's historical upper bound
if adoption does not complete; otherwise report the candidate's original bound,
possibly earlier absent CVD time, and next manual refresh margin as a judgment.

## Verification, documentation, review and completion

After execution or a verified prerequisite stop, run sequentially under Node
24.21.0 and quote real output/exit status:

```bash
node scripts/vercel/check-vercel-config.js
npm run vercel:probe-test
npm run lint
npm run typecheck
npm run build
npm run ops:scan-secrets
git diff --check
```

Retain private verifier syntax/offline results as well. Use installed Prettier
on this prompt and new/changed documentation passages, preserving unrelated
historical formatting and distinguishing whole-file pre-existing warnings.
No aggregate ops check, online audit, full database/browser suite, live probe
or launch drill is required or claimed. A sandbox failure is reported exactly;
an unchanged local-only check may request appropriate execution permission.

Before final recording/commit, dispatch the mandatory read-only reviewer subagent
using `requesting-code-review`: approved requirements, baseline/current SHAs,
full diff, sanitized verifier source and actual safe evidence/check outputs.
No cloud actions, credential reads or further delegation by the reviewer.
Specifically examine A positive controls, non-vacuous SQL, independent B session,
forged-header denial, zero new scans, budgets/uncertain writes, guarded recovery,
candidate binding and freshness claims. Apply `receiving-code-review`, verify
findings, correct valid local record/verifier issues without restarting live
acceptance, and re-review significant corrections.

Record the result in `docs/operations.md`: UTC/source identities, custody
inventory, before/after state, individual gates, exact artifact correlations,
B disposition, actual HTTP/action counts, SQL positive/negative controls,
cleanup and adoption/recovery status with limitations. Update
`docs/vercel-deployment.md` resume gate and append a current record, explicitly
separating project settings from the immutable deployment. Add a concise Phase
12 pointer in `docs/build-plan.md`. Review final records for false closure.

Hosted cadence, free-tier storage accounting, retirement, production-plan choice,
operator evidence and eleven sign-offs remain open in every outcome. Do not
revise whole-project completion percentages from this bounded proof.

Commit only approved prompt/docs locally on `main` with `caveman-commit`; no
push. A blocked continuation is committed truthfully as blocked, not accepted.
Final response gives commit, isolation/adoption result, remaining gate and
retained URL. To inspect, read the new operations passage and open the immutable
preview; local tooling verification is `npm run vercel:probe-test` without a
server. Do not print or link private capabilities to demonstrate results.

## Non-goals and rollback

No product/runtime/workflow/design change, tool/dependency update, new scan,
rebuild, probe, deployment, deletion, invitation/mail, role/branch change, Cron
or queue replay, scheduled-cadence activation, push or production action.
Synthetic B and prior artifacts are retained as evidence; no compensating
identity/data deletion is authorized. Conditional config restoration is limited
to this attempt's adoption and does not change deployed configuration.
Documentation can be reverted locally; a revert does not undo provider actions
or erase the historical operational record.
