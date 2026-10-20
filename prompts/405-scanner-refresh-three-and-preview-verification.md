# Prompt 405 — scanner signature refresh 3 and preview verification

## Scope and why this is next

Parent: Phase 12, approved Prompt 370's managed Vercel migration. Prepare one
fresh scanner candidate, adopt it on the existing isolated preview target, and
verify the deployed application's upload → scan path. This is an operational
refresh using existing code; no application, workflow or dependency change.

Planning baseline: clean `main` at
`a405817a22d6fac0d98fe54893235a5f0aa7a394`. Git history confirms Prompt 403's
receipt recovery implementation (`b9f3821`) and Prompt 404's investigation
(`a405817`). Prompt 404 did **not** run a hosted simulation: publication and
execution access remain prerequisites. This prompt neither repeats that
investigation nor authorizes its missing push. Source publication still requires
a separate standalone uppercase `P`.

The committed migration record explicitly orders the next manual refresh before
the active signatures' historical upper bound, **about 2026-10-21T09:02Z**,
possibly earlier because the CVD build timestamp was not recorded. It recommends
starting adoption by about **2026-10-21T06:00Z** to reserve deployment/acceptance
time. Those times are planning judgments and an upper bound, not a current
measurement of signature freshness. On the planning date, 2026-10-20, manual
refresh is the next time-sensitive dependency-safe step while hosted cadence is
unproven. The useful-start margin in Prompt 395 has already elapsed; do not add
an arbitrary wait. Recheck actual UTC time and provider state at execution.

Historical active snapshot:
`snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf`, adopted in Prompt 395. Its daily digest
starts `7cb49401`; compare full values privately, never this prefix. The custody
root's old `scanner.env` is stale and must **not** select the active snapshot.
Read the verified Prompt 395 artifacts and fresh preview configuration instead.
Prompt 396 retired tier 1, leaving the historical retained set:

- `snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf` — active at the last inspected adoption.
- `snap_ngIwnQplocPoUR0A6cewfCGrFAbX` — previous rollback identity.
- `snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN` — older retained candidate/deployment source.

These are historical facts, not a fresh inventory. A mismatch requires explaining
the intervening authorized history before mutation. Tier 2 retirement remains a
later bounded step; this prompt never deletes a retained snapshot.

## SKILLS USED

- `deployment-pipeline-design` — order preparation, freshness, adoption, deployment and acceptance gates.
- `secrets-management` — private credentials, stdin configuration writes, restricted evidence custody.
- `error-handling-patterns` — distinguish failure, timeout, cleanup uncertainty and partial adoption.
- `e2e-testing-patterns` — isolated synthetic application acceptance with bounded polling.
- `security-best-practices` — preserve session/CSRF, private objects, quarantine and tenant isolation during acceptance.
- `neon` — reuse the selected database/provider boundary; no new provisioning.
- `neon-postgres` — narrowly scoped, read-only correlation through the existing preview application role.
- `requesting-code-review` — independent read-only review of the evidence and final diff.
- `receiving-code-review` — verify findings against actual code and inspected provider facts.
- `caveman-commit` — required local Conventional Commit on `main`.

These skill instructions were opened during preparation; reload them at
execution. No dedicated Vercel skill is available in the supplied skill catalog.
Do not copy unavailable `vercel:*` skill claims from old prompts. Verify SDK APIs
against installed `@vercel/sandbox` **3.8.0** types/source and CLI flags against
working installed help. If live provider documentation is needed, load the
applicable web skill and use official primary sources. Do not install skills or
dependencies incidentally. The existing producer/consumer code owns the custom
receipt schema; generic skill examples do not override it.

## References and verification sources

Preparation inspected these relevant sources:

- `AGENTS.md`: phase control, prompt contract, review, local commit and push boundaries.
- `docs/build-plan.md`: Phase 12, production-target amendment, sequence gates and latest scanner records.
- `docs/project-status.md`: historical assessment and managed-target limitation.
- `docs/skills.md`: selection and installation conventions.
- `docs/vercel-deployment.md`: resume checklist, fixed target, Prompts 395–396 and 403–404.
- `docs/operations.md`: operations posture, Prompt 395's custody/check record and Prompt 404's blockers.
- `docs/operator-handoff.md`: evidence custody and production authority boundaries.
- `docs/system-architecture.md`: configuration/secrets boundary.
- `docs/security.md`: assets and CI/operator threat assumptions.
- `docs/backend.md`: managed migration preparation record.
- `infra/vercel/runbooks/managed-operations.md`: scanner lifecycle, handoff and manual activation procedure, §§5.1–5.5.
- `prompts/395-scanner-refresh-two-rebuild-and-preview-adoption.md`: prior successful bounded procedure, not proof of implementation by itself.
- `scripts/vercel/rebuild-scanner-cadence.js`, `scripts/vercel/probe-platform.js`, `scripts/vercel/prepare-scanner-handoff.js`, `scripts/vercel/check-deploy-manifest.js`.
- `server/src/scanner/vercel-sandbox-scanner.adapter.ts` and `server/src/scanner/sandbox-signature-check.ts`.
- `server/src/uploads/uploads.controller.ts`, `server/src/uploads/dto/initiate-upload.dto.ts`, `server/src/uploads/dto/complete-upload.dto.ts`.
- `node_modules/@vercel/sandbox/package.json`, `node_modules/@vercel/sandbox/dist/snapshot.d.ts`, `.node-version`, `package.json`.

At execution re-read the relevant owning passages, complete producer/probe and
handoff paths, focused specs, scanner adapter, upload service/contracts, current
auth/organization request contracts and existing acceptance artifacts before
constructing requests. Open actual paths before citing them. No Next/React API or
component change is authorized; should one be needed, stop for a later prompt
and verify local framework docs then.

No visual surface changes, comp crops, CSS measurements or screenshot comparisons
are planned. No design-reference deviation or breakpoint change is requested.

## Expected impact and permitted tracked changes

One new immutable preview may use the new scanner configuration. Public routes,
API behavior, UI, production routing and the existing deployment URLs stay under
their current contracts. A new preview includes the committed current landing
implementation as ordinary deployment content, without authorizing design edits.

Tracked changes are this prompt and narrowly scoped records in:

1. `docs/operations.md`: UTC sequence, gates, exact outputs, evidence inventory and review.
2. `docs/vercel-deployment.md`: new refresh record and current resume scanner status/bound.
3. `docs/build-plan.md`: concise Phase 12 evidence pointer, leaving exit open.

Correct `infra/vercel/runbooks/managed-operations.md` §5 only if this run verifies
a concrete procedural gap. Do not rewrite historical evidence, format entire
documents, alter example approvals or update completion percentages. No new
memory file or external message is needed.

## Authority and resource budget on approval

Only team `team_zE3mp7nrEZ6a7cxRavwUMYC4`, project
`prj_q9ApajZWDgdYZetnm5s5oakEjrUD`, environment `preview`, region `iad1`.
Free tiers only; no plan/spending changes. Approval authorizes:

- Target-bound reads of account/project, preview configuration, exact snapshots,
  relevant deployment metadata/logs and current allowance; no unrelated projects.
- One OIDC refresh pull if needed, plus the private before/after/rollback
  verification pulls required to preserve and compare configuration. Always pull
  into a new file; an existing file can retain stale lines.
- **One** live cadence-producer invocation: one builder and one smoke sandbox.
- Offline receipt/handoff validation and **one** candidate `scanner` seam probe.
- Preview-only updates of exactly `SCANNER_SANDBOX_SNAPSHOT_ID`,
  `SCANNER_MAIN_SHA256`, `SCANNER_DAILY_SHA256`, and conditional restoration of
  those same records on failure. Preserve existing scopes and all other keys.
- **One** preview deployment and synthetic acceptance: at most two accounts,
  two organizations and two uploads (one clean CSV, one EICAR fixture).
- Read-only, tenant-scoped correlation of those created records and relevant
  worker logs. Retain the synthetic records and objects; do not add cleanup
  deletions or replay failed jobs.
- Ordinary automatic cleanup of this attempt's temporary VMs by the existing
  tools, while retaining their base/candidate snapshots.

No second rebuild/probe/deploy, retry loop, GitHub dispatch/configuration write,
snapshot/deployment deletion, production promotion, alias/domain change, migration,
credential rotation, mail or push. SDK-internal behavior is not authorization for
an additional top-level attempt. Stop on paid capability, quota pause, 402/429,
unresolved accounting/allowance or an uncertain resource outcome.

## Execution plan

### 1. Establish source, access, custody and current state

1. Record branch, full source SHA, status and UTC time. Require `main` and no
   unrelated changes; the approved prompt is the intentional uncommitted file.
   Explain intervening commits from history; do not substitute remote main or
   require a push to execute the existing local manual tools.
2. Select the already installed Node **24.21.0** and verify both direct and npm
   child process versions. Do not run checks on the default Node 26. No package
   update or installation is authorized; report missing runtime/tool access.
3. Use a working existing CLI/connector. Read version/help before flags; do not
   install a CLI, log in, search general credential stores or alter tool config.
   Missing access is a blocker. Public IDs are safe to record; never print env
   values, tokens, connection strings, cookies, presigned URLs or raw error bodies.
4. Use the existing approved custody parent
   `~/.config/acres/vercel-preview/`, with a **new** `prompt405-<UTC stamp>/`
   directory, mode 0700, files 0600, executable scripts 0700. Reuse no output
   filename from an earlier attempt. Respect filesystem access review for paths
   outside the workspace; `/tmp` alone is not durable operator custody.
5. Read only designated prior artifacts under
   `prompt395-20261019T085943Z/`: candidate, handoff and adoption evidence.
   Capture current preview scopes/values privately. Verify active ID and both
   full hashes against that record; reject stale root `scanner.env` as authority.
   Stop on an unexplained concurrent/configuration change.
6. Confirm fixed project/team/region, current free plan/allowance, no active
   sandboxes and the retained snapshot inventory. Prompt 396's unchanged storage
   dashboard remains unresolved; stored-byte listing is not billing allowance.
   Obtain current allowance evidence through an existing available surface or
   report that gate blocked before creating anything. No assumptions from old
   quota checks, public repository visibility or provider retry success.
7. Decode the designated OIDC token locally only for owner/project matches and
   expiry. This is a precheck, not JWT verification. The live producer requires
   at least **75 minutes** remaining. Refresh into a new private file if needed;
   never pass the entire preview env to the producer. Confirm five scanner keys
   retain their preview-only scope, provider `vercel-sandbox` and max age **48**.
8. Record actual execution time. Before the historical bound reserve about
   three hours for adoption/deploy/acceptance (a judgment). If that margin is
   unavailable while the active signatures still work, prepare only. If the
   bound has passed or current scanning demonstrably fails for stale signatures,
   the same single-attempt budget may restore preview scanning after the new
   candidate independently passes; an expired old window is not a reason to
   weaken freshness. Explain which case applies.

### 2. Local preflight, then one candidate rebuild

Before live work, under verified Node 24:

```bash
npm run vercel:scanner-rebuild -- --help
npm run vercel:scanner-rebuild -- --dry-run
node --test scripts/vercel/build-scanner-snapshot.spec.js scripts/vercel/rebuild-scanner-cadence.spec.js scripts/vercel/prepare-scanner-handoff.spec.js
```

Require successful preflight and `execution_mode: "simulation"` for the dry run.
Capture real outputs; no expected test count is asserted.

Invoke once, with minimal environment: the verified Node PATH, normal HOME,
`ACRES_VERCEL_PROBE=isolated-synthetic-preview`, `VERCEL_ENV=preview`, fixed
`VERCEL_TEAM_ID`/`VERCEL_PROJECT_ID`, `ACRES_VERCEL_PROBE_REGION=iad1`, and
the checked OIDC token. No inherited token fallback or other preview secrets.
Use a 2,100-second outer deadline (existing operation budget, not a measured
runtime); yield tool execution and report progress at intervals under 60 seconds.
Write stdout/stderr privately and preserve start/end UTC and exit status.

```text
node scripts/vercel/rebuild-scanner-cadence.js --force \
  --current-snapshot-id snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf \
  --output <new-run-directory>/receipt.json \
  --write-env <new-run-directory>/candidate.env
```

No `--replace`, delete, live workflow or second invocation. On failure retain the
receipt as failed, project only the existing allowlisted failure fields, inspect
any confirmed snapshot ID and VM cleanup read-only, and stop live progression.
Metadata `created` cannot repair a failed receipt. Uncertain cleanup is failure.

On success run the offline handoff consumer against the original receipt and a
new output directory. Require target match, all smoke/cleanup checks passed,
retained previous snapshot, and `activation_status: "not_performed"`. Recompute
receipt/runtime digests against `handoff.json`. Parse `runtime.env` as data,
never execute/source it: exactly the three runtime keys, valid snapshot pattern
and 64-character lowercase SHA-256 hashes, equal to the validated receipt.
Confirm candidate `created` in the selected region and no remaining active VMs.

### 3. Freshness and candidate seam gates

Compare the new full daily digest privately against both the captured active
configuration and Prompt 395's full digest. Equal means **same signatures, no
extension**: retain prepared candidate, record the outcome and stop adoption.
A changed main digest alone is insufficient. A different daily digest is a
necessary comparator, not proof that the CVD is newer or unexpired.

Run `scripts/vercel/probe-platform.js scanner` **once** using the validated new
candidate and explicit target/OIDC credentials, with
`ACRES_SCANNER_MAX_SIGNATURE_AGE_HOURS=48`. Verify the existing probe's signature
timestamp/hash check, clean acceptance, EICAR rejection, cleanup and
`baseSnapshotSurvived`. A stale/future signature, failed verdict or cleanup
failure stops adoption. Do not run the larger `scanner-failures` live suite.

### 4. Adopt exactly three preview values and deploy once

Before any write, capture previous values and scopes to new private files and
prepare both adoption and conditional restore scripts. Follow the existing
Prompt 395 stdin-write procedure, verify installed CLI help, and preserve
provider/max age and all unrelated keys. Scripts parse validated data, never
shell-evaluate env files; print only variable names and exit codes.

Prior executions required the owner to run the prepared adoption script after
automatic review refused agent-side writes. This is a historical tool boundary,
not a new product approval requirement. Use the already-authorized direct path
only if allowed by current tool policy. If automatic review rejects a write,
stop retries and explain its action/reason, then present the concrete prepared
script and restore path for owner execution. Never bypass the rejection through
another transport. Continue independent checks while waiting; silence is not
approval or successful execution.

Privately re-pull into a **new** file. Require exact match of all three candidate
values and unchanged scopes. Compare complete key sets and common values;
separately explain refreshed volatile OIDC metadata. Any unexplained non-scanner
change or partial write blocks deployment and enters recovery.

Deploy only the recorded committed source on `main`, with clean deployment scope
and only the approved prompt/documentation outside that scope. Before deploying,
verify the upload allowlist through the existing manifest tool:

```text
vercel deploy --dry --target=preview < /dev/null > <private-run-directory>/dry.json
npm run vercel:deploy-manifest -- --manifest <private-run-directory>/dry.json
```

Require `deploy manifest ok`; explain changed file inventory from committed
history. Historical 656-file counts are not present acceptance thresholds.
Never upload custody artifacts, env files or uncommitted runtime changes.
Then perform **one** preview deployment using verified CLI flags. Record full
source SHA, immutable deployment ID/URL, created/Ready times, region and
client/API/jobs build entrypoints. No `--prod`, alias, promote or redeploy retry.

### 5. Prove application upload → scan and isolation

Use the immutable new deployment through the existing authenticated
`vercel curl --deployment` path, with private cookie jar and request/response
files. Verify CLI syntax and request DTOs/service contracts first. Do not disable
deployment protection, session/CSRF checks, TLS or tenant scoping.

1. Obtain CSRF, register one unique `example.test` account, create a synthetic
   organization and select it using `acres_active_organization` as implemented.
2. Hard gate: `/app` returns 200, includes `id="dashboard-title"`, and has no
   `role="alert"`. Stop on an application error before producing uploads.
3. Clean small CSV: initiate with real byte count/hash and unique idempotency
   key; PUT privately, complete, and poll to `accepted`.
4. One EICAR CSV using the existing probe fixture without printing bytes:
   terminal `rejected`/`infected`, download 404, no published dataset version.
5. Correlate these exact upload IDs with outbox and durable-job terminal states
   using existing preview `acres_app` credentials and transaction-local tenant
   scope in a read-only transaction. Read only needed fields for these records;
   no migrator/admin identity, role/branch/extension/schema change or general
   database inventory. Validate actual schema before reusing old SQL. If access
   is missing, mark this proof incomplete rather than substituting privileged
   reads or an unrelated project.
6. Inspect only this deployment's relevant job logs. Verify anonymous reads of
   the two Blob objects fail (historical expected 403), and a second synthetic
   organization sees 404 for both upload IDs using its own and a forged tenant
   header. Confirm scoped reads expose only their owning organization's rows.
7. Correlate configuration-write-before-deployment ordering, adapter snapshot
   source/hash checks and before/after snapshot metadata. State identity as an
   inference where the provider does not attest exact runtime env values.
8. Bound terminal polling to ten minutes per upload (a judgment). A timeout is
   inconclusive; no replay, extra upload, manual job-state repair or second
   deployment. Finish with read-only VM/snapshot inventory and report cleanup.

### 6. Recovery and evidence boundaries

Before adoption there is no configuration to restore; retain candidate/receipt
and old snapshots. After partial adoption, failed deploy or failed acceptance,
stop further synthetic work and compare current values against this attempt's
writes before conditional restoration. Never overwrite a concurrent change.
Restore only the three captured scanner values and verify with a fresh private
pull; report partial/failed recovery accurately. No extra deployment is
authorized to roll out restored variables: a config restore alone does not alter
the already-created immutable deployment.

Restoring the previous snapshot restores identity only. Past its actual signature
window it still fails closed. Do not call stale restoration a functional rollback.
Retain all snapshots/deployments and evidence; retirement requires a later prompt.
No deletion is a recovery step here.

Compute a new **upper bound** from the candidate's recorded fetch/build interval
plus 48 hours only if a fresh candidate was adopted and application checks passed.
The CVD build timestamp, if not actually inspected, remains unknown; do not claim
48 hours from deployment, a changed digest or snapshot creation. Record the
refresh planning margin explicitly as a judgment. If the attempt fails, the old
historical bound does not move. Hosted cadence and launch approval remain open.

## Checks, documentation, review and local commit

After the bounded hosted attempt, or its verified prerequisite stop, run checks
under Node 24.21.0 sequentially and quote actual relevant output/exit status:

```bash
node scripts/vercel/check-vercel-config.js
npm run vercel:probe-test
npm run lint
npm run typecheck
npm run build
npm run ops:scan-secrets
git diff --check
```

Use installed Prettier on this prompt and new/changed documentation passages.
Preserve pre-existing whole-file formatting warnings; distinguish them from
introduced warnings. No aggregate `ops:check`, online dependency audit, full DB
suite or browser suite is required for a documentation-only operational record;
do not claim one ran. If a check exposes a code defect, record it and stop for a
separate implementation scope rather than silently repairing runtime code.

Record every action count, passed/blocked/failed gate, UTC interval, source,
candidate/retained IDs, receipt/bundle digests, truncated signature hashes,
deployment link, acceptance disposition and conditional recovery. Private logs,
identities, cookies, connection strings and env values remain in custody.
Restricted local custody is not a signed production evidence store. No eleven
category sign-off or project-completion increase is supplied by this run.

After self-verification dispatch the mandatory independent reviewer subagent with
this prompt, baseline/current SHAs, complete diff and sanitized actual evidence.
Ask specifically about bounded action counts, freshness claims, source binding,
scope preservation, recovery and false closure. Evaluate findings using
`receiving-code-review`, fix valid record issues, recheck and re-review significant
changes. The reviewer may inspect only; no cloud actions or credentials.

Commit only the approved prompt/documentation locally to `main`, with
`caveman-commit`; do not push. A prerequisite-blocked investigation is recordable
but is not completed refresh/adoption acceptance. Final response gives commit,
honest result and next prerequisite, plus the immutable preview URL if verified.
To inspect the result, open that URL and the new operations passage; the focused
preflight command above reproduces local tooling checks without a server start.

## Non-goals and rollback

No source/workflow/contract/UX redesign, dependency update, scheduled-live mode,
GitHub publication, stored token setup, snapshot/deployment retirement, storage
accounting closure, production plan decision, promotion, domain, email or launch
approval. Restore the recorded previous scanner values only under the recovery
conditions above. Documentation rollback is an ordinary local revert; historical
provider operations remain historical and are never erased or relabeled.
