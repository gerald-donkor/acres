# Prompt 408 — guarded scanner preview adoption and project configuration reconciliation

## Scope and why this is next

Parent: Phase 12 / approved Prompt 370's managed Vercel migration. Execute the
guarded adoption of the verified candidate scanner snapshot
`snap_8OP5G2tCUvxtRdoGFMCu5se58f3N` into Vercel project preview configuration
(`team_zE3mp7nrEZ6a7cxRavwUMYC4`, `prj_q9ApajZWDgdYZetnm5s5oakEjrUD`,
environment `preview`), reconciling project-level settings with the accepted
retained deployment.

Planning baseline: clean `main` at `b23bc46372d3b14ad8e752313f1a593191976130`.
Actual code, git history, and operational records establish the following:

- Prompt 407 completed retained application acceptance and tenant isolation
  proof against retained deployment `dpl_AGwu9k8gbtQRegTodmHUAL7uxYs4` (source
  `9744d812e08de5313f1191e1fb609c513409d26a`, `iad1`):
  - A positive controls verified three uploads/objects, two dispatched outbox
    events, two terminal jobs (clean `succeeded`, EICAR `failed` with
    `lastErrorCode: infected`), and an infected dead letter.
  - Exactly one synthetic B account/organization was created; independent
    session/CSRF and dashboard controls passed; six HTTP denials (own-org
    status, forged A-header status, own-org download for clean and EICAR)
    returned 404 / `NOT_FOUND` without data or capability leakage.
  - Parameterized exact-ID SQL under transaction-local B context returned zero
    across five RLS tables (`Upload`, `StoredObject`, `DatasetVersion`,
    `OutboxEvent`, `DurableJob`), followed by restored A transaction
    visibility.
  - Postflight inventory confirmed zero sandboxes and all four live snapshots
    retained.
- However, adoption stopped before any configuration write because the helper
  assumed CLI `env ls preview --json` records contained `id`. Record IDs are
  omitted from that CLI output, causing undefined matching and an incorrect
  timestamp comparison. Zero mutation intents, PATCH subprocesses, config
  writes, or recovery writes occurred.
- Read-only inspection verified unchanged project preview settings pointing to
  Prompt 395 predecessor `snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf`.
- A corrected offline v3 helper was authored and verified against 56 offline
  tests (`tests 56, pass 56, fail 0`), binding CLI records to verified raw
  provider API record IDs by full key/scope identity, enforcing single-send
  HTTPS mutation, and validating metadata before constructing PATCH requests.
- The build plan explicitly states the next gate: "separately bounded guarded
  adoption with fresh target, record-ID and useful-window checks. Do not repeat
  uploads or isolation proof."

This prompt executes that bounded adoption pass. No repeat upload, PUT,
completion, scan, isolation test, rebuild, probe, deployment, promotion, or
push is authorized.

## SKILLS USED

- `deployment-pipeline-design` — gate configuration mutation on validated acceptance, verify window limits, and prepare conditional rollback/recovery.
- `secrets-management` — restricted evidence custody, credential protection, and stdin-only environment variable mutation.
- `error-handling-patterns` — fail-fast preflight validation, single-send idempotency, and graceful handling of network or API errors.
- `javascript-testing-patterns` — offline regression testing of adoption and recovery helpers before any live API call.
- `security-best-practices` — secure transport configuration, credential handling, and preventing unintended leakage of environment secrets.
- `requesting-code-review` — dispatch independent reviewer subagent to evaluate implementation, diff, and verification evidence.
- `receiving-code-review` — evaluate reviewer feedback with technical rigor before making fixes or committing.
- `caveman-commit` — format the final commit message to Conventional Commits standards on `main`.

These skills were opened during planning; reload every listed skill at
execution. No dedicated Vercel skill is available. Verify existing
CLI/API/SDK calls from installed help, types, and source. No new provider
capability or API contract is designed here.

## References read and execution references

Read during preparation:

- `AGENTS.md`: phase control protocol, §§2–7 and §§8–10; preparation stops
  before execution.
- `docs/build-plan.md`: phase status, Phase 12 managed-target sequence, and
  Prompts 405–407 records.
- `docs/project-status.md`: historical completion assessment and managed-target
  limitations.
- `docs/skills.md`: locked skill inventory and trigger definitions.
- `docs/operations.md`: operations posture and complete Prompt 407 record,
  including RLS isolation evidence, adoption stop details, raw-ID binding
  reconciliation, and verification outputs.
- `docs/vercel-deployment.md`: resume gate, current project configuration
  versus retained immutable deployment state.
- `docs/operator-handoff.md`: custody and restricted evidence access boundaries.
- `docs/system-architecture.md` §§7, 11.1 and `docs/security.md` §3: trust
  boundaries, environment configuration, and tenant isolation.
- `docs/backend.md`: environment contract and secret management.
- `infra/vercel/runbooks/managed-operations.md` §5.5: scanner adoption procedure,
  hash verification, and signature-window limits.
- `prompts/407-retained-preview-isolation-and-scanner-adoption.md`: prior
  continuation and stop boundary.
- Root `package.json` and `.node-version`: existing commands and Node 24.21.0.

At execution, inspect designated private custody artifacts from Prompts 405,
406, and 407, the offline v3 adoption helper, raw provider project API records,
and CLI environment commands. No private credentials, custody artifacts, or
live provider state were modified during preparation. No visual or UI changes
are involved, so comp inspection and pixel measurement are not required.

## Expected impact and permitted files

Three Vercel project preview environment variables will adopt candidate values:

- `SCANNER_SANDBOX_SNAPSHOT_ID` -> `snap_8OP5G2tCUvxtRdoGFMCu5se58f3N`
- `SCANNER_MAIN_SHA256` -> candidate main digest
- `SCANNER_DAILY_SHA256` -> candidate daily digest

Project preview configuration will align with the validated candidate retained
by deployment `dpl_AGwu9k8gbtQRegTodmHUAL7uxYs4`. Existing database rows,
uploads, stored objects, jobs, and deployment immutability are untouched.
Adoption does not change the immutable deployment itself, trigger a rebuild,
or create a new signature freshness window.

Tracked repository files permitted to change:

- `prompts/408-guarded-scanner-preview-adoption.md` (this prompt)
- `docs/operations.md` (append Prompt 408 adoption record)
- `docs/vercel-deployment.md` (record adoption outcome and updated resume gate)
- `docs/build-plan.md` (append concise Phase 12 Prompt 408 summary)

No runtime application code, Next.js components, Nest backend services,
database migrations, or scripts are modified. Private helpers, journals, and
raw receipts remain in designated external custody.

## Approval authority and bounded actions

Target: team `team_zE3mp7nrEZ6a7cxRavwUMYC4`, project
`prj_q9ApajZWDgdYZetnm5s5oakEjrUD`, environment `preview`, region `iad1`.
Free tiers only. Approval authorizes this bounded adoption pass only.

Permitted actions:

1. Target-only read requests to verify account/project status, active Hobby
   plan, no payment blocks, current sandbox inventory, and snapshot metadata.
2. Read access to private custody under `~/.config/acres/vercel-preview/`:
   `prompt405-20261020T063209Z/`, `prompt406-20261020T070600Z/`, and
   `prompt407-20261020T080019Z/`. Create one `prompt408-<UTC stamp>/`
   directory with 0700 permissions and 0600 file permissions for receipts.
3. Offline regression testing of the adoption and conditional recovery
   helpers before live invocation.
4. Pre-write configuration pull via CLI (`vercel env ls preview --json`) and
   raw provider API (`GET /v9/projects/{id}/env`) into private custody.
5. Exactly one guarded adoption pass executing single-send HTTPS PATCH
   requests for the three approved keys, using verified raw record IDs,
   stdin-only values, no retries, and no redirects.
6. Post-write verification pulls via CLI and raw API to reconcile updated
   values, scopes, unmodified timestamps of unrelated variables, and complete
   key sets.
7. If adoption fails partially or verification detects an unexpected state,
   execute conditional restoration strictly for records modified by this
   attempt whose values still match this attempt.

Strictly prohibited actions:

- Zero uploads, PUTs, completions, or application scan triggers.
- Zero repeat tenant-isolation tests or synthetic account registrations.
- Zero scanner rebuilds, seam probes, deployments, or alias changes.
- Zero snapshot deletions or sandbox VM creation.
- Zero git push or remote branch modification.

## Step-by-step execution plan

### 1. Preflight validation and useful-window verification

- Inspect target environment and project metadata. Confirm active Hobby plan,
  zero account blocks, and expected project/team IDs.
- Verify candidate `snap_8OP5G2tCUvxtRdoGFMCu5se58f3N` presence in snapshot
  inventory. Confirm four live snapshots retained and zero sandbox VMs.
- Evaluate useful window:
  - Candidate producer interval: `2026-10-20T06:33:39.250Z–06:35:09.451Z`.
  - Latest possible expiry bound: `2026-10-22T06:35:09.451Z`.
  - Compare current execution timestamp against this bound. Require at least
    roughly 2 hours safety margin (judgment). If outside the useful window,
    halt immediately and record a prerequisite stop without writing.

### 2. Private custody initialization and offline helper verification

- Initialize `~/.config/acres/vercel-preview/prompt408-<UTC stamp>/`.
- Inspect the offline v3 adoption helper corrected in Prompt 407.
- Confirm it binds CLI preview records to raw provider API records by exact
  key and scope (`preview`), validating record IDs.
- Run the offline test suite against the helper, verifying that all 56 tests
  pass (`tests 56, pass 56, fail 0`).
- Ensure single-send HTTPS transport is configured: no internal retries, no
  redirect following, stdin-fed values, authenticated via existing CLI
  credentials.

### 3. Pre-write configuration pull and reconciliation

- Pull current preview environment configuration via CLI:
  `vercel env ls preview --json`.
- Fetch raw provider project environment records via API.
- Reconcile CLI records with raw API records:
  - Match each of `SCANNER_SANDBOX_SNAPSHOT_ID`, `SCANNER_MAIN_SHA256`, and
    `SCANNER_DAILY_SHA256` to its raw record ID.
  - Confirm current preview values match Prompt 395 predecessor
    `snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf` and associated hashes.
  - Confirm scope is strictly `["preview"]` with no branch override.
  - Reconcile total key count and verify no unexpected external mutations.
- If any concurrent modification, missing raw ID, or scope divergence is
  found, stop immediately without executing any mutation.

### 4. Guarded adoption execution

- Prepare the concrete adoption payload:
  - `SCANNER_SANDBOX_SNAPSHOT_ID`: `snap_8OP5G2tCUvxtRdoGFMCu5se58f3N`
  - `SCANNER_MAIN_SHA256`: candidate main digest from verified handoff
  - `SCANNER_DAILY_SHA256`: candidate daily digest from verified handoff
- Prepare conditional recovery script before executing any write.
- Execute guarded adoption using the single-send native HTTPS transport:
  - Send one PATCH request per variable to the explicit raw record endpoint.
  - Deliver sensitive/configuration value strictly via stdin.
  - Skip keys whose current value already matches candidate.
  - If any network error, 4xx, or 5xx occurs, do not retry. Stop and assess.

### 5. Post-adoption verification and audit

- Pull fresh preview environment configuration via CLI and raw API into new
  private files.
- Compare with captured pre-write state and candidate handoff bundle:
  - Verify that the three scanner variables match candidate values exactly.
  - Verify that preview scopes remain intact (`["preview"]`, no branch).
  - Verify that complete key set is unchanged.
  - Verify that modification timestamps of unrelated environment variables are
    unchanged (accounting for volatile OIDC tokens).
  - Note redacted sensitive values where plaintext comparison is not possible.
- If adoption is partial or verification fails, execute conditional recovery
  to restore only the modified variables to predecessor Prompt 395 values,
  verifying current values match this attempt before rolling back.

### 6. Cleanup and final verification

- Verify zero remaining sandboxes and unchanged snapshot inventory.
- Record all requests, response statuses, timestamps, and hash digests in
  the private custody journal.
- Ensure no private credentials or bearer tokens are written to repository
  files.

## Verification, documentation, review and completion

### 1. Repository checks

Run the required checks sequentially under Node 24.21.0:

- `node scripts/vercel/check-vercel-config.js`
- `npm run vercel:probe-test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run ops:scan-secrets`
- Prettier check on all modified documentation files
- `git diff --check`

Quote the real command outputs in the operations documentation.

### 2. Documentation updates

- Update `docs/operations.md`:
  - Record Prompt 408 adoption execution: timestamps, target IDs, candidate
    snapshot ID, verified SHA256 digests, adoption request/response statuses,
    post-write verification comparisons, useful-window calculations, and
    limitations.
  - Distinguish project preview configuration from immutable deployment
    configuration.
- Update `docs/vercel-deployment.md`:
  - Append Prompt 408 section recording guarded adoption outcome.
  - Update the current resume gate and signature upper bound.
- Update `docs/build-plan.md`:
  - Add concise Phase 12 entry for Prompt 408 summarizing adoption status.

### 3. Code review and commit

- Dispatch independent reviewer subagent using `requesting-code-review`
  providing complete structured context (prompt requirements, commit SHAs,
  operational records, verification outputs).
- Evaluate reviewer findings using `receiving-code-review` with technical
  rigor against codebase reality.
- Stage only approved documentation changes.
- Commit locally to `main` using `caveman-commit`. No push.

## Non-goals and rollback

- No application code, frontend components, or backend logic changes.
- No new uploads, PUTs, or application scan executions.
- No repeat synthetic account creation or RLS isolation queries.
- No deployment creation, promotion, or alias updates.
- No snapshot deletion or automated scheduled cadence activation.
- No git push (`P` protocol remains separate).
- Rollback: if adoption fails during live execution, conditional recovery
  restores project preview environment variables to Prompt 395 predecessor
  values (`snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf`). Documentation changes can be
  reverted via standard git commands locally; local git reverts do not undo
  remote provider configuration changes.
