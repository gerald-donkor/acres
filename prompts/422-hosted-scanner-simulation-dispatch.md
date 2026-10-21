# Prompt 422 — hosted scanner simulation dispatch

## Scope and why this is next

Parent: Phase 12 / Prompt 370, continuing Prompts 404 and 421. Execute the one
credential-free hosted simulation that Prompt 421 deferred, then record the
evidence. This is the only repository-executable item left in the managed
scanner track: Prompt 421's "Next" line names exactly this step, and its
blocker has cleared. Everything else that remains (production intake, DNS,
production secrets, live drills, the eleven sign-offs) is operator-owned and
cannot be executed from the repository.

Fresh planning evidence, 2026-10-21 ~22:45Z (all re-verified at execution):

- **Network:** `curl https://api.github.com/` returned HTTP 200 (Prompt 421
  saw `CONNECT tunnel failed, response 403`). `gh` is 2.102.0 (421 recorded
  2.46.0), authenticated as `gerald-donkor` through the keyring.
- **Repository:** `gerald-donkor/acres`, public, default branch `main`, not
  archived, token has admin/push. `git ls-remote origin refs/heads/main` =
  local HEAD = `52a9c9410f7044b741c1e032f872171d7367dbf4`.
- **Actions:** enabled, `allowed_actions: all`, `sha_pinning_required: false`.
  Workflow `ClamAV Scanner Snapshot Rebuild` is ID `387667199`, path
  `.github/workflows/scanner-snapshot-rebuild.yml`, state `active`.
- **Existing runs (4, all `schedule`):** `39112477943` failure on `2d5e449`
  (2026-10-18); `39232185663` success on `45a392a` (10-19); `39399532401` and
  `39575340917` success on `c802e90` (10-20, 10-21). **These ran older workflow
  revisions.** `git diff --stat c802e90 52a9c94 -- .github scripts/vercel` shows
  the workflow, `rebuild-scanner-cadence.spec.js` and the new
  `summarize-scanner-candidate.js` (+ spec) arrived after `c802e90`. So the
  *current* workflow, its mode selector, its `Generate sanitized candidate
  handoff summary` step and the receipt validator have **never run on GitHub**.
  The older successes prove scheduled hosted execution of a previous revision,
  not this one. **Prompt 421's "zero dispatches / no hosted acceptance" stands;
  its wording that nothing has run hosted at all is incomplete** — correct that
  in the evidence entry (§10 rule 8) without rewriting history.
- **Names only:** `gh api .../actions/secrets` and `.../actions/variables`
  returned no entries. Not distinguishable from "inaccessible" without the
  response status; re-check with status at execution. Live mode needs
  `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN` and the allowlisted
  variables; a credential-free simulation needs none.
- **Natural firing:** the schedule is `0 4 * * *` but runs have started
  08:42–09:43Z. The next scheduled run (~2026-10-22 04:00–10:00Z) will execute
  the current revision in simulation mode anyway. This dispatch only brings that
  proof forward, with explicit inputs and a deliberately inspected result. If a
  run for this workflow is already queued or in progress, dispatch nothing and
  inspect that run instead.
- **Unrelated clock:** the active preview scanner snapshot's signature window
  closes no later than `2026-10-22T06:35:09.451Z`
  (`docs/vercel-deployment.md`, Prompt 408). A refresh is a separate live,
  provider-mutating, owner-adopted operation needing its own prompt and
  approval. This prompt does not touch it; the final report must restate the
  deadline so it is not lost.

Highest existing prompt number before this file: 421. This turn prepares only
this uncommitted prompt. No dispatch, settings write or implementation is
authorized until the user approves execution.

## References read and execution reads

- `AGENTS.md`: phase control, prompt contract, §6 checks, §7 commits, §10.
- `prompts/421-hosted-scanner-simulation-after-source-publication.md`: the
  prerequisite matrix and procedure this prompt executes; its
  `docs/operations.md` entry (`#prompt-421--hosted-scanner-simulation-after-source-publication-2026-10-21`).
- `prompts/404-scanner-workflow-hosted-readiness-and-simulation.md`: original
  free-tier condition and acceptance contract.
- `.github/workflows/scanner-snapshot-rebuild.yml`, complete.
- `scripts/vercel/rebuild-scanner-cadence.js` (`--dry-run`, receipt schema),
  `scripts/vercel/summarize-scanner-candidate.js` and
  `scripts/vercel/prepare-scanner-handoff.js` plus their specs. Read the
  validator before interpreting any receipt claim.
- `docs/vercel-deployment.md` ("Resume here", Prompt 421 section),
  `docs/build-plan.md` (Phase 12 table, Prompt 421 passage near line 667 and
  the 421 section near line 4732), `docs/project-status.md`,
  `docs/operator-handoff.md` (evidence custody),
  `infra/vercel/runbooks/managed-operations.md` §5.2.
- Official GitHub docs, fetched this session, for: free standard-runner usage on
  public repositories, `workflow_dispatch` via `gh workflow run`, job summaries
  and what the REST API exposes of them. Do not assume a summary-download API.
- `gh workflow run --help`, `gh run list --help`, `gh run view --help`,
  `gh run watch --help` read before choosing flags.

No product route, visual surface, comp, CSS measurement or breakpoint is
involved. An Actions run page is operations evidence, not a design reference.

## SKILLS USED

- `deployment-pipeline-design` — source, execution and adoption gates.
- `github-actions-templates` — workflow identity, input modes, run evidence.
- `secrets-management` — inspect credential *names* and presence only.
- `requesting-code-review` — read-only reviewer after verification.
- `receiving-code-review` — evaluate findings against evidence.
- `caveman-commit` — commit message convention.

Listing is not loading: invoke each at its stage before acting. No skill owns
the custom receipt schema; the repository source does. UI, Nest, database and
telemetry skills are out of scope because those surfaces do not change.

## Expected impact and permitted changes

Deliverable: a UTC-dated, source-bound readiness matrix and the observed result
of **zero or one** hosted simulation dispatch. Tracked changes after approval are
this prompt and focused entries in `docs/operations.md`,
`docs/vercel-deployment.md` and `docs/build-plan.md` (one current-gate pointer
each; preserve Prompt 404/421 history). No workflow, script, test, dependency,
lockfile, schema, provider configuration, completion estimate or readiness
example changes. A source defect found is documented for a separate coding
prompt, not fixed here. Routes affected: none.

## Execution procedure

### 1. Context and source binding

1. Record UTC time, cwd, branch (`main`), HEAD, `git status --short`. Preserve
   unrelated work. Do not create a worktree.
2. Use Node **24.21.0**: put `~/.local/share/mise/installs/node/24.21.0/bin`
   first on `PATH` and confirm `node --version`. (The default is 26.12.0; a
   `/tmp/acres-node24` install is wiped between sessions.) Pin compliance may
   be claimed only for commands run under it.
3. `git ls-remote origin refs/heads/main` must equal HEAD. If it differs,
   inspect the delta for workflow/script changes and stop if their safety is
   unresolved. Record SHA-256 of the workflow and of the three scripts read at
   that commit (`git show <sha>:<path> | sha256sum`). No push is authorized.

### 2. Read-only prerequisite matrix

Classify each as verified / missing / inaccessible / inconsistent with a
timestamp and source. Never print tokens or environment dumps; no login, scope
change or CLI install.

- Network and auth: HTTP status of `api.github.com`; `gh api repos/gerald-donkor/acres`
  fields `private`, `visibility`, `archived`, `default_branch`, `permissions`.
- Actions policy: `.../actions/permissions` (enabled, allowed actions, SHA
  pinning). The workflow pins `actions/checkout` and `actions/setup-node` by full
  SHA, so either policy passes; record the policy.
- Workflow: `.../actions/workflows/387667199` state, path; confirm
  `workflow_dispatch` inputs `prepare_candidate` and `force` exist in the file at
  the dispatch ref.
- Concurrency: `gh run list --workflow scanner-snapshot-rebuild.yml --status queued`
  and `--status in_progress`. Anything present → dispatch nothing, never cancel.
- Free execution: the repository is public, and GitHub documents standard
  runners as free for public repositories. Fetch that page this session and
  cite it; visibility alone is not enough without the citation. If free
  eligibility cannot be established, dispatch nothing.
- Live readiness (separate, informational): names and HTTP status of
  `.../actions/secrets` and `.../actions/variables`; never values. Report empty
  or inaccessible honestly. Missing live credentials do not block a simulation.
  Make no Vercel request and no claim about the active snapshot.

### 3. At most one hosted simulation

Only if §1–§2 all pass, immediately re-confirm remote `main`, record the
pre-dispatch run inventory and UTC time, then dispatch once:

```bash
gh workflow run scanner-snapshot-rebuild.yml --ref main \
  -f prepare_candidate=false -f force=false
```

Verify against `gh workflow run --help` that `-f` sends these as the string
inputs the workflow's boolean contract accepts; if serialization is doubtful,
stop before dispatching. Never use `prepare_candidate=true`. Identify the new run
by `event=workflow_dispatch` and `createdAt` after the recorded time (do not
guess an ID); verify its `headSha` equals the checked remote `main`. Wait with a
single bounded `gh run watch <id> --exit-status` (the older runs took ~1 min);
do not poll in a tight loop. No second dispatch, no rerun, whatever the outcome.

### 4. Inspect the result

Via `gh api .../actions/runs/<id>` and `/jobs`, record conclusions per step.
Expected for a valid simulation: `Select execution mode` success; `Simulate
candidate preparation` success; **`Prepare retained preview candidate` skipped**
(the observable proof of `mode=simulation`); `Generate sanitized candidate
handoff summary` success; `Clean up temporary files` success. Also read the
job log for the simulate and summary steps; inspect it for secrets/paths before
quoting any line.

The summary helper's simulation output is
`### Scanner candidate — no handoff available` followed by the diagnostic line
and allowlisted `- key: \`value\`` entries (e.g. `execution_mode: \`simulation\``).
It must never contain a `Sanitized candidate receipt` block (that is only for a
non-simulation success). If a documented API exposes the rendered summary, check
that. If none does, record "summary rendering not independently verified" and
name the smallest outside action (the owner opens the run page and confirms the
text). Do not scrape the UI with browser automation.

A non-success result is evidence, not a retry: record step, log excerpt (after
inspection), and stop. If the failure suggests a source defect, document it for
a separate prompt.

### 5. Record

Write the operations entry (source SHAs/digests, UTC times, run ID/URL, exact
inputs, step outcomes, summary-rendering status, action inventory, local check
output). Include the corrected statement about the older scheduled runs. Add one
current-gate pointer each to `docs/vercel-deployment.md` and `docs/build-plan.md`.
State clearly that a passing simulation proves hosted execution of the
current revision only: no live rebuild, freshness, adoption, cadence-in-live-mode
or launch acceptance. Restate the 2026-10-22T06:35:09.451Z scanner bound and
that a refresh needs its own prompt. List the smallest specific outside action
for each remaining gate.

## Verification, review and commit

Under Node 24.21.0, run and quote real output for (generated-output commands
sequentially; default `umask 0077` fails four fixture assertions per suite, as
Prompt 421 recorded, so scope `umask 0027` to the test shell only):

```bash
node --test scripts/vercel/rebuild-scanner-cadence.spec.js scripts/vercel/summarize-scanner-candidate.spec.js scripts/vercel/prepare-scanner-handoff.spec.js
npm run vercel:probe-test
npm run ops:scan-secrets
git diff --check
```

Run `npx prettier --check` on the new prompt and on each changed doc only if
that file was prettier-clean before the edit (check first; never reformat
historical text). `npm run lint`, `npm run typecheck` and
`npm run build` per §6 if their prerequisites (Node pin, Prisma binaries, Google
Fonts) are available; report failures and unrun checks honestly. No behavior
changes, so no new tests.

Then dispatch a read-only reviewer subagent with `requesting-code-review`
(this prompt, source SHAs, diff, check logs, the dispatch/no-dispatch record).
Review source binding, dispatch bounds, receipt claims and evidence privacy.
Evaluate with `receiving-code-review`; fix valid issues and re-review any
significant change. Commit locally to `main` with `caveman-commit`; stage only
approved files; do not push (a standalone `P` is separate).

## Non-goals and rollback

No live rebuild, `prepare_candidate=true`, snapshot creation/deletion/adoption,
Vercel request, deployment, domain/DNS action, paid spend, GitHub settings,
secret or variable write, token creation, operator sign-off or external
message. No workflow edit, no cancel/rerun of any run, no push. The daily
schedule stays in simulation mode. No completion-percentage change.

Documentation rollback is an ordinary local revert. An executed workflow run
and its logs are not deleted or altered. No provider rollback is needed because
the run is credential-free and creates no provider resource.
