# Prompt 397 — deploy the committed application to Vercel preview

## Scope and why this is next

The owner selected a fresh **preview** deployment on 2026-10-19 after
discussing preview versus production. Parent: Phase 12 managed-target work
under Prompt 370. This prompt prepares that deployment; execution follows
AGENTS.md §2 approval. It does not change application behavior.

Inspected baseline: `4aa24ca` on `main`. That commit adds the reviewed
snapshot-retirement tooling. The application was last proven on Prompt
395's `dpl_AtJLkmoy3gWJVDSzkAUk5t8ujYPJ`. Resolve current state again at
execution; these statements are observations, not future preflight results.

The working tree currently contains Prompt 396 and its four documentation
drafts. Record those already-authorized results accurately before deploying
from a clean `main`. The incomplete storage-accounting experiment must remain
explicitly open; it is not a prerequisite for this preview build.

## Reference material read

- `AGENTS.md`: workflow, clean-main deployment convention, prompt, review,
  commit and no-fabrication requirements.
- `docs/skills.md`: deployment, secrets, review and commit skill routing.
- `docs/vercel-deployment.md`: fixed target, manifest gate, preview proof
  history, scanner bounds and the drafted Prompt 396 record.
- `docs/operations.md`: Prompt 396 tooling checks and live sequence.
- `docs/build-plan.md` and `docs/launch-checklist.md`: latest preview
  records; production categories remain open.
- `prompts/396-scanner-snapshot-dependency-aware-retirement.md`: exact
  retirement authorization, one-confirm limit and storage-reading criteria.
- `prompts/395-scanner-refresh-two-rebuild-and-preview-adoption.md`:
  preview deployment procedure and authenticated acceptance precedent.
- `infra/vercel/README.md`, `vercel.json`, `.vercelignore`, `package.json`,
  `.vercel/project.json`, `scripts/vercel/check-deploy-manifest.js` and
  `server/src/health/health.controller.ts`.
- Installed Vercel CLI **64.5.0**, verified using `deploy --help` and
  `curl --help` from
  `/home/dgk/.npm/_npx/67eb4586ca667318/node_modules/vercel/dist/vc.js`.
- Owner screenshots: `screenshot-2026-10-19_11-28-49.png` shows the three
  expected Created and three expected Deleted snapshots;
  `screenshot-2026-10-19_11-32-27.png` shows Storage **2.39 GB / 15 GB**,
  unchanged from the supplied before-reading at 11:01:56. Times are from
  filenames in Africa/Accra (UTC), not timestamps printed by the dashboard.
  The second image says Updated just now, but its reporting-period selector
  is not visible. Do not invent the period or classify lifetime accounting
  from this screenshot alone.

No visual change or comp measurement is proposed.

## SKILLS USED

- `deployment-pipeline-design` — checks, preview release gates and failure
  handling; loaded during preparation, reload on execution.
- `secrets-management` — credential custody, restricted evidence and upload
  exclusions; loaded during preparation, reload on execution.
- `requesting-code-review` — independent review before record commits and
  deployment; loaded during preparation, reload on execution.
- `receiving-code-review` — verify feedback before changes; loaded during
  preparation, reload on execution.
- `caveman-commit` — local Conventional Commit messages; loaded during
  preparation, reload on execution.

The prior transcript names `vercel:vercel-cli`, `vercel:env-vars` and
`vercel:vercel-sandbox`; they are not in this session's available skill
catalog or the inspected local project skill trees. Do not claim to have
loaded them. Use installed CLI help and SDK source for any exact provider
API needed. No new skill installation is authorized or needed.

## Authorization and non-goals

On approval, deploy once to existing team `team_zE3mp7nrEZ6a7cxRavwUMYC4`
(`dgsloxx417s-projects`), project `prj_q9ApajZWDgdYZetnm5s5oakEjrUD`
(`acres`), preserving existing `iad1` service settings and free-tier limits.
Read-only inspection, local verification, documentation and local commits
are included. A fresh preview env pull is permitted only if needed to
verify existing configuration, into a new restricted outside-repo file.

No production target, promotion, alias/domain change, paid plan or machine,
environment-variable write, migration, scanner rebuild, snapshot deletion,
deployment deletion, push, synthetic account creation or upload test is
included. Do not source the stale root `scanner.env`, which names a deleted
snapshot. No application/configuration edits are planned; if deployment
reveals a code change is necessary, report the concrete failure and scope
the fix separately.

## Execution

### 1. Reconcile the existing retirement record

Re-read Prompt 396, inspect its existing `plan.json` and `retire.json` in
`~/.config/acres/vercel-preview/prompt396-20261019T104349Z/` without exposing
credentials, and review the four documentation diffs. Never rerun confirm.

Replace `<<STORAGE>>`, `<<READINGS>>` and `<<LAUNCH>>` with verified facts:
three targets retired, three keeps unchanged in the receipt; before and
11:32:27 after-reading both 2.39 GB / 15 GB; accounting **unresolved**.
Correct the operations sequence's claim that the after-reading completed
the experiment. The required later reading, no earlier than 12:03 UTC,
remains outstanding unless the owner has supplied it by execution time.
An unchanged early reading does not prove cumulative accounting. Do not
call Prompt 396's entire acceptance complete while that reading is absent.

Review these record changes independently using the review skills and the
repository's read-only reviewer template. Supply baseline SHA, the exact
working-tree diff, receipts/screenshot facts and pending acceptance boundary.
Evaluate feedback, fix valid issues, format changed sections without broad
unrelated reformatting, run secret scanning and `git diff --check`.
Commit only the approved Prompt 396 file and its four owning docs using
`caveman-commit`. Leave unrelated work untouched. This is a record commit,
not a declaration that accounting has been resolved.

### 2. Verify the preview candidate

Use Node **24.21.0** from the mise installation; confirm `node --version`
and that npm resolves that Node. Recheck branch, full status, source SHA,
the `.vercel` project/team binding and cached CLI version. Verify account
access with `whoami` and project inspection, using CLI help for exact flags.
Never print auth stores, env values, cookie jars or authorization headers.

Run and capture actual results:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run vercel:probe-test`
- `npm run ops:scan-secrets`
- formatting checks for newly changed documentation and this prompt
- `git diff --check` and a manual diff review

Investigate failed checks; do not deploy known failing code. If an existing
format issue is unrelated, demonstrate it at baseline and report it without
silently rewriting unrelated text. Do not claim old checks were rerun.
Review and commit this approved prompt before the live release, so the
entire working tree is clean on `main`. If new unrelated changes appear,
stop before deployment; do not stash/discard/stage them.

Create a fresh outside-repo evidence directory under `/tmp` with mode 0700
and files 0600, recording its path. Verify the current preview scanner
configuration still names a retained created snapshot; if credentials must
be pulled, use a new file and never expose its contents. Prompt 395 records
`snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf`, with a signature upper bound of about
2026-10-21T09:02Z; this bound is historical evidence, not a new freshness
proof. Stop and report if it is stale, missing or unexpectedly changed.
Storage billing semantics may remain unresolved; an actual quota refusal
must stop the deployment, with no paid workaround.

### 3. Inspect upload inputs and deploy once

From repository root on clean `main`, use the verified CLI path (abbreviated
below as `<vc.js>`) with Node 24:

```bash
node <vc.js> deploy --dry --target=preview < /dev/null > <run>/dry.json
npm run vercel:deploy-manifest -- --manifest <run>/dry.json
```

Proceed only on `deploy manifest ok`. Explain file-count differences from
the last recorded 656 using the tracked allowlist and git history; never
bypass the checker or weaken `.vercelignore`. Confirm the source SHA and
clean status again immediately before deploying.

```bash
node <vc.js> deploy --target=preview --scope dgsloxx417s-projects
```

Capture the deployment ID, URL, source SHA, build result and Ready time.
Inspect metadata/build logs to verify the preview target (API metadata may
represent preview as `target: null`), project, normal build machine and
client/API/jobs services. Do not use `--prod`, `--force`, `--turbo`, promote
or alias commands. If a deployment fails, inspect that deployment's logs
and report it; do not create repeated releases to hide a failure.

### 4. Verify the hosted preview

Use `vercel curl --deployment <new-id>` as verified by local CLI help to
access the protected preview through its normal authenticated mechanism.
Do not relax deployment protection or expose a bypass credential.

Check `/`, `/login`, `/register`, and anonymous `/app`. Expect successful
public pages and the repository-defined unauthenticated login redirect for
`/app`, not an application 500. Derive the exact health/readiness URL from
the existing Next bridge and API routing before calling it; the controller
alone does not establish the public URL. Check liveness and readiness if
reachable through the existing route, inspecting the response envelope and
database/storage result. If unreachable by design, record that limitation
instead of inventing a route or changing routing.

No registration, upload, scanner or queue proof is rerun in this prompt.
Clearly distinguish these smoke checks from Prompt 395's authenticated
application proof. Read build/runtime errors scoped to the new deployment
if any check fails. A Ready build alone is not a passing hosted smoke test.

### 5. Record and commit

Append Prompt 397 records to `docs/vercel-deployment.md` and
`docs/operations.md`, with actual commands/check output, source SHA,
manifest count, target, deployment URL/ID, smoke results and limitations.
Add brief linked entries in `docs/build-plan.md` and
`docs/launch-checklist.md`; no launch category is approved by this preview.

Run formatting/secret/diff checks on the final record. Dispatch the required
read-only reviewer with exact diff, SHAs, requirements and observed results;
evaluate feedback using `receiving-code-review`, fix and recheck. Commit
approved files locally on `main` using `caveman-commit`, with no push.
Return the preview link, verification outcome, login-access instructions
and any remaining issues. If credentials or quota block execution, report
the actual error and completed work, without claiming a deployment exists.

## Expected impact and recovery

One new immutable preview deployment using the existing application and
configuration. No production traffic, schema, UI or API behavior changes.
Keep the previous preview URL available. If the new preview fails, direct
the owner to the previous known preview and record the failure; no
production rollback or snapshot/environment mutation is needed.
