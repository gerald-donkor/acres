# Prompt 421 — hosted scanner simulation after source publication

## Scope and why this is next

Parent: Phase 12 / Prompt 370, continuing Prompt 404's hosted-readiness gate.
Inspect the published scanner workflow and, only after its execution prerequisites
are established, submit at most one credential-free hosted simulation. Record
whether the receipt-summary and cleanup steps execute correctly on GitHub.

Fresh planning evidence on 2026-10-21 changes the prerequisite that stopped
Prompt 404: `git ls-remote origin refs/heads/main` returned
`e3bbbacbf96241bdd3f4e07b6e6d66fd3a038995`, exactly matching local HEAD.
The reviewed Prompt 403 workflow and summary helper are present in this checkout.
Do not allocate another documentation task merely to advance source-baseline
references. The newly cleared publication prerequisite makes a bounded hosted
investigation useful; production intake and sign-offs remain operator-owned.

This observation proves Git ref availability, not GitHub API permission,
workflow registration, current allowance, hosted execution, active scanner state,
or launch readiness. Refresh the evidence at execution. Local branch is `work`
with no upstream; never repeat historical claims about unpublished local commits
without a new comparison. `gh --version` works here and reports 2.46.0; no API
authentication or dispatch capability has been tested during preparation.

Highest existing prompt number before this file: 420. This turn prepares only
this uncommitted prompt. No workflow dispatch, settings write or implementation
is authorized until the user approves execution.

## References read and execution reads

- `AGENTS.md`: phase control, prompt contract, commands, review and commit policy.
- `docs/build-plan.md`: Phase 12 current-state table, remaining hosted gate and
  the Prompt 403–420 records relevant to this continuation.
- `docs/project-status.md`: managed baseline and operator-owned launch work.
- `docs/vercel-deployment.md`: Prompt 404's actual source-publication stop and
  the current managed deployment records.
- `docs/operations.md`: recorded execution outcomes; find the complete Prompt
  404 passage at execution rather than substituting adjacent scanner records.
- `docs/operator-handoff.md`: evidence custody and separate production authority.
- `docs/skills.md`: local skill convention and scope selection.
- `prompts/404-scanner-workflow-hosted-readiness-and-simulation.md`: the original
  bounded investigation, free-tier condition and simulation acceptance contract.
- `infra/vercel/runbooks/managed-operations.md` §5.2: mode and receipt boundaries.
- `.github/workflows/scanner-snapshot-rebuild.yml`: complete workflow.
- `scripts/vercel/rebuild-scanner-cadence.js`,
  `scripts/vercel/summarize-scanner-candidate.js` and their focused specs.
- `.node-version` and root workspace scripts in `package.json`.

At execution, read the complete receipt validator in
`scripts/vercel/prepare-scanner-handoff.js` and its spec before interpreting
handoff eligibility. Read actual CLI help/tool schemas before selecting API
arguments. Use official GitHub documentation if a tool does not settle a needed
behavior; do not invent summary-download APIs or assume logs contain summaries.

No product routes, visual surfaces, comps, CSS measurements or breakpoint
changes are involved. An Actions run page is operations evidence, not a design
reference. Historical preview IDs and snapshots are not present-state evidence.

## SKILLS USED

- `deployment-pipeline-design` — source, execution and subsequent adoption gates.
- `github-actions-templates` — workflow identity, input modes and run evidence.
- `secrets-management` — inspect credential names/presence without values.
- `requesting-code-review` — independent review after execution verification.
- `receiving-code-review` — evaluate findings against actual evidence.
- `caveman-commit` — required local commit-message convention after execution.

The first three skills were loaded during preparation. Load the applicable
skills again when executing, including the review/commit skills at their stages.
The secrets skill's `references/github-secrets.md` is absent locally; do not
cite it. No skill supplies the custom receipt schema: existing source owns it.
Nest, UI, database, telemetry and security-scanner implementation skills are
outside this investigation because those surfaces do not change.

## Expected impact and permitted changes

The deliverable is a UTC-dated, source-bound hosted-readiness matrix and the
observed outcome of zero or one simulation dispatch. Expected tracked changes
after approval are this prompt and focused evidence entries in
`docs/operations.md`, `docs/vercel-deployment.md`, and `docs/build-plan.md`.
Correct the current source-publication blocker only where fresh evidence warrants
it; preserve historical observations. Do not propagate another rolling-baseline
reconciliation across otherwise unrelated documents.

No workflow, application code, test, dependency declaration, lockfile, database
schema, provider configuration, completion estimate or readiness example changes.
If a source defect is discovered, document it for a separate coding prompt.

## Execution procedure

### 1. Establish the current source and execution context

1. Record UTC time, working directory, branch, HEAD, status and upstream presence.
   Preserve the existing checkout, user changes, ignored configuration and cloud
   setup helpers. Each cloud task is isolated: do not create another worktree.
2. Re-read remote `main` through existing authenticated HTTPS Git access. Confirm
   the intended workflow and helper revisions are present, recording their SHA-256
   digests at the exact remote commit. Check their dependencies too; do not bind
   a run merely to the workflow file while ignoring changed helper code.
3. Prefer an available GitHub connector; otherwise use the installed `gh` after
   checking its help. Test narrowly scoped read-only access to this repository.
   Git read success and a present token variable do not prove Actions API access.
   Never print tokens, environment dumps or credential files, perform login,
   replace authentication, broaden scopes, or install a replacement CLI.
4. Establish whether the current network policy allows the required GitHub API
   and run-inspection surfaces. If access is denied, record the exact operation,
   hostname and error. Continue independent checks. Do not bypass network policy.
5. Compare remote source with the reviewed implementation. If material changes
   appeared, inspect them before any dispatch; stop if their safety is unresolved.
   Reconfirm the dispatch ref immediately before mutation. No push is authorized.

### 2. Inspect prerequisites without changing settings

Classify each observation as verified, missing, inaccessible or inconsistent,
with timestamp and source. Inspect only this repository and scanner workflow:

- Default branch, workflow ID/path, enabled state and `workflow_dispatch` inputs.
- Effective Actions restrictions relevant to the pinned checkout/setup-node
  actions, Ubuntu runner and read-only contents permission.
- Usable dispatch access and current queued/running instances for the workflow's
  non-cancelling concurrency group. Do not cancel another run.
- Current free execution eligibility/allowance. Public visibility alone is not
  sufficient evidence under Prompt 404's free-tier condition. If allowance or
  spending consequences cannot be established, dispatch nothing.

Keep future live readiness separate. Inspect only presence/access metadata for
`VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, and `VERCEL_TOKEN`, and only the allowlisted
non-secret settings `ACRES_VERCEL_PROBE`, `ACRES_VERCEL_PROBE_REGION`, and
`ACRES_SCANNER_SNAPSHOT_ID`. Do not retrieve secret values or unrelated variables.
Report inaccessible metadata without calling it absent. Missing live credentials
do not block a credential-free simulation. No secret/variable/policy changes are
part of this prompt. Make no Vercel requests or active-snapshot claims.

### 3. At most one hosted simulation

Only after source, access, enabled state, concurrency and free-execution gates
pass, dispatch the inspected workflow once on verified `main` with explicit
`prepare_candidate=false` and `force=false`. Verify boolean serialization using
the actual tool contract. Record the pre-dispatch run inventory and UTC time.

Approval of this prompt authorizes this one simulation dispatch, including the
workflow's existing runner-side `npm ci`. It authorizes no live candidate build,
recurring-live switch, rerun or retry. If dispatch returns an ambiguous response,
inspect run state read-only and do not send another dispatch.

Identify the exact resulting run and verify its event/ref/head SHA. A moving ref
or ambiguous run match prevents source-bound acceptance. Observe it using brief
read-only polls for at most 20 minutes, an operational observation budget rather
than a product SLA. Waits must permit progress updates at least every 60 seconds.
Record still-running results as pending; do not cancel or dispatch again.

Require actual evidence of all of the following:

1. Mode selection chose simulation.
2. Simulation succeeded; the retained-preview live preparation step was skipped.
3. The sanitized summary helper completed and cleanup completed.
4. The matching rendered summary reports simulation/no eligible handoff without
   a live candidate receipt. If rendered summary access is unavailable, state
   that gap separately from step/log execution evidence.
5. The run identity and source match the intended inspected implementation.

Use supported authenticated run-page/summary access when available. Do not infer
the rendered summary solely from a green job or fabricate a download endpoint.
No provider inventory is necessary because simulation creates no provider
resources. This proves neither scheduled-live cadence nor candidate adoption,
signature freshness, preview acceptance, retirement, storage accounting or launch.

### 4. Record evidence and hand back the precise next gate

Write a bounded operations entry containing actual source SHAs/digests, UTC
inspection times, prerequisites, run URL/ID if obtained, exact input mode, step
outcomes, rendered-summary evidence/access gaps, local check outputs and action
inventory. Keep private evidence out of git and chat. Do not designate a local
directory as an approved operator evidence store without authority.

Update the deployment/build-plan current next-gate pointer once. Do not rewrite
Prompt 404's historical stop or claim that publishing source completed its
hosted proof. A blocked investigation is recordable, but the blocked proof remains
open. List the smallest specific outside action needed for each remaining gate.

## Verification, review and commit

The pinned runtime is Node **24.21.0** in `.node-version`; the onboarding machine
currently has **24.19.0**. Do not claim pin compliance. The onboarding network also
blocked Prisma binaries and Google Fonts, leaving full builds, Prisma generation
and whole-server type/lint checks unresolved. This prompt does not authorize a
runtime install or dependency change; if the pin/network prerequisite remains
unresolved, report it and keep checks affected by it distinct from independent
evidence. Do not disable checksums/TLS or change tracked files to mask a blocker.

After inspecting the existing focused specs, run and quote actual results for:

```bash
node --test scripts/vercel/rebuild-scanner-cadence.spec.js scripts/vercel/summarize-scanner-candidate.spec.js scripts/vercel/prepare-scanner-handoff.spec.js
npm run vercel:probe-test
npm run ops:scan-secrets
git diff --check
```

Follow `AGENTS.md`'s required lint, typecheck and build checks when their runtime
prerequisites are available; record failures and unrun outcomes honestly. Run
generated-output commands sequentially. Check formatting of the new prompt and
changed passages without wholesale formatting of historical documentation. No
new tests are needed because no behavior changes.

After self-verification, dispatch a read-only reviewer subagent using
`requesting-code-review`, with this prompt, source SHAs, diff, check logs and the
exact external action inventory. Review source binding, dispatch bounds, receipt
claims and evidence privacy. Evaluate findings using `receiving-code-review`,
fix valid documentation issues and re-review significant changes.

Make the required local commit using `caveman-commit` and the applicable branch
policy, preserving unrelated work. The cloud checkout's `work` branch has no
upstream; do not reset branch history or assume it is unpublished `main`.
Reconcile `AGENTS.md`'s main-branch requirement safely before committing and
report any unresolved branch conflict. Never push as part of this task.

## Non-goals and rollback

No production promotion, live rebuild, snapshot creation/deletion, adoption,
deployment, domain/DNS action, paid spend, GitHub settings write, token creation,
operator sign-off or external message. No source push; standalone uppercase `P`
remains a separate guarded operation if a fresh comparison actually requires it.
Keep the daily schedule in simulation mode. No completion-percentage increase.

Documentation rollback is an ordinary local revert. Do not delete or alter an
executed workflow run, its logs, or somebody else's queued/running work. No
provider-resource rollback is required because provider mutations are excluded.
