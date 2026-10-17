# Prompt 388 — bounded scanner candidate rebuild

## Scope and why this is next

Parent: Phase 12 managed-target operations, continuing approved Prompt 370.
Inspected baseline: `34667e73c7de828e5b547b9d433f0145a4247d38` on `main`,
worktree clean when this prompt was prepared. That commit implements Prompt
387's safe build-failure diagnostics; this prompt file alone proves nothing.

`docs/vercel-deployment.md` and `docs/build-plan.md` (Prompt 387 sections) name
the next hosted gate exactly: "a separately authorized, bounded candidate
rebuild using these diagnostics, followed only on success by separately scoped
preview adoption/deployed application proof." Prompt 386's only live rebuild
failed (`candidate_build_failed`, retained candidate
`snap_rz0cs8Nnw1RObI3ZDS5WRKDSUR2y`, failing substep unknown) and that receipt
can never be salvaged.

Time pressure is real but does not relax any gate: the active preview baseline
`snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA` expires `2026-10-24T14:29:39.778Z` (last
observed 2026-10-17), and its CVD signatures are already older than the
application's 48-hour policy, so the deployed scanner is expected to fail closed
as `scanner_unavailable` until a fresh candidate is adopted.

This prompt is **one live candidate preparation plus offline handoff only**:

- success → a validated, retained, restricted handoff bundle ready for a later,
  separately prompted adoption/deployment;
- failure → a schema-v1 receipt with the new safe `build_failure`
  `step`/`kind`/`builder_cleanup`/`snapshot_confirmed` fields, recorded honestly,
  and a stop.

Approval authorizes exactly one live cadence-producer invocation (its builder
sandbox plus its existing clean/EICAR smoke sandbox) on the fixed free-tier
preview target, read-only provider inspection before and after, and local
offline handoff validation. It does **not** authorize env writes, deployment,
browser/application acceptance, snapshot deletion or retirement, a second
rebuild, workflow dispatch, production, paid usage, credential rotation or a
push.

## Reference material read

- `AGENTS.md` §§2, 5–7, 10; memory `vercel-migration-resume`.
- `docs/vercel-deployment.md`: "Resume here", fixed target, access procedure,
  scanner snapshot/lifecycle sections, Prompts 386–387.
- `docs/operations.md`: Prompt 386 attempt record (receipt digest, custody
  directory `prompt386-20261017T180051Z`, restricted-network failures,
  approval-review rejection of broad `decrypt=true` reads) and Prompt 387
  investigation (safe diagnostic contract, failure-path table, check outputs).
- `docs/build-plan.md` Prompts 386–387 sections.
- `infra/vercel/runbooks/managed-operations.md` §5.1–5.4 (preparation,
  `build_failure` fields, local manual preparation recipe, offline handoff).
- `prompts/386-scanner-preview-adoption-and-application-proof.md` (the
  preparation stage reused here; its adoption stages are out of scope),
  `prompts/387-scanner-build-failure-investigation.md`.
- `scripts/vercel/rebuild-scanner-cadence.js` `--help` (read this session):
  `--dry-run`, `--output`, `--write-env`, `--current-snapshot-id`,
  `--max-age-hours` (default 48, max 168), `--force`, deprecated `--skip-prune`.
- `scripts/vercel/prepare-scanner-handoff.js` `--help`: `--receipt <file>
--output-dir <new directory outside repo>`; Linux procfs required.
- Env names referenced by the scripts (names only, read by grep):
  `ACRES_VERCEL_PROBE`, `ACRES_VERCEL_PROBE_REGION`, `VERCEL_ENV`,
  `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, `VERCEL_OIDC_TOKEN`, `VERCEL_TOKEN`,
  `ACRES_SCANNER_SNAPSHOT_ID`, `ACRES_SCANNER_MAIN_SHA256`,
  `ACRES_SCANNER_DAILY_SHA256`, `ACRES_SCANNER_MAX_SIGNATURE_AGE_HOURS`.
- Restricted directory listing of `~/.config/acres/vercel-preview/` (names and
  modes only): 0700 parent, 0600 `preview.env`, `scanner.env` and others, plus
  the 0700 `prompt386-20261017T180051Z` run directory.

No visual surface, comp, token, breakpoint or motion is touched; §0 references
are not applicable. No measurement is required.

## SKILLS USED

- `deployment-pipeline-design` — staged preparation → validation → (later,
  separate) adoption; explicit gates and stop-on-failure with no retry loop.
- `secrets-management` — OIDC/credential handling, restricted 0700/0600 custody,
  names-only listing, no secret values in logs, repo or reviewer context.
- `error-handling-patterns` — interpret the fixed `build_failure` taxonomy,
  keep primary and cleanup outcomes independent, never treat timeout as success.
- `vercel:vercel-sandbox` — confirm current Sandbox/snapshot semantics
  (persistence, `deleteOrphanSnapshots`, session limits) against the installed
  SDK before the live call.
- `vercel:vercel-cli` — authenticated read-only project/target inspection and
  `vercel env pull` refresh of the preview OIDC token, verified from installed
  CLI help.
- `javascript-testing-patterns` — run and interpret the existing Node test
  suites; add a regression only if execution exposes a local tooling defect.
- `requesting-code-review` — independent read-only review of the record and
  any diff after self-verification.
- `receiving-code-review` — verify findings against source and restricted
  evidence before acting.
- `caveman-commit` — the required local commit to `main`.

Preparation loaded `deployment-pipeline-design`, `secrets-management` and
`error-handling-patterns`. Execution must load every skill above again.
`security-threat-model`, `playwright`, `e2e-testing-patterns` and
`architecture-patterns` are deliberately excluded: no trust boundary,
browser journey or module boundary changes here (they return in the adoption
prompt). Firecrawl is available only if an official provider page must be
read; installed SDK/CLI sources take precedence.

## 1. Re-establish the target (read-only)

1. Re-read this prompt, `AGENTS.md` and the owning records. Confirm branch
   `main`, clean worktree apart from this prompt, and record `HEAD`.
2. Use Node 24.21.0 (`.node-version`) via the documented
   `/tmp/acres-node24` launcher if no version manager provides it. Verify both
   `node --version` and `npm exec -- node --version` print `v24.21.0`.
3. Confirm Vercel CLI authentication (`npx vercel@latest whoami`). If signed
   out, stop and ask the user to run `! npx vercel@latest login`.
4. Refresh preview OIDC into the restricted directory only if the existing
   `preview.env` token is expired or within its last hour (check the JWT `exp`
   claim locally without printing the token):
   `npx vercel@latest env pull <restricted>/preview.env --environment=preview --yes`
   with the linked `acres` project. List variable **names** only afterwards.
   Never decrypt or read unrelated variables; Prompt 386's broad
   `decrypt=true` inventory was rejected and stays rejected.
5. Read-only provider checks, recorded with UTC timestamps:
   - team `team_zE3mp7nrEZ6a7cxRavwUMYC4`, project
     `prj_q9ApajZWDgdYZetnm5s5oakEjrUD` (`acres`), Hobby plan, default region
     `iad1`;
   - exact-ID `Snapshot.get` for baseline `snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA`
     and Prompt 386 candidate `snap_rz0cs8Nnw1RObI3ZDS5WRKDSUR2y`: status,
     region, created/expires;
   - project-scoped sandbox listing limited to running/recent entries, to
     establish a pre-run residue baseline.
     Stop dependent work on target mismatch, unavailable access, a provider
     statement that the free Sandbox allowance is exhausted, or any required paid
     capability. Quota that is not visible is recorded as not visible, not as
     available.
6. Create a new run directory
   `~/.config/acres/vercel-preview/prompt388-<UTC yyyymmddThhmmssZ>/` (0700).
   All outputs below are new 0600 files inside it. `/tmp` is inspection
   scratch only, never custody. Do not modify `prompt386-*` contents.

## 2. Pre-flight the local tooling (no cloud calls)

```bash
npm run vercel:scanner-rebuild -- --help
npm run vercel:scanner-rebuild -- --dry-run
node --test scripts/vercel/build-scanner-snapshot.spec.js \
  scripts/vercel/rebuild-scanner-cadence.spec.js \
  scripts/vercel/prepare-scanner-handoff.spec.js
```

Require exit 0, `"execution_mode":"simulation"` and no `build_failure` in the
dry run, and a passing focused suite. These tests spawn CLI subprocesses;
Prompts 386–387 saw file-level failures under a restricted sandbox. Rerun with
subprocess/network permission rather than recording a restricted failure as a
code defect; quote both outcomes if both occur.

If the installed `@vercel/sandbox` version differs from 3.8.0 or its builder
semantics differ from `docs/vercel-deployment.md` (persistent default,
`deleteOrphanSnapshots`), stop and report before the live run.

## 3. The single live preparation

Export only validated values as data — never `source` a receipt or a generated
env file, and never interpolate JSON into shell source. Load `preview.env` with
`set -a; . file; set +a` only because it is the CLI-pulled file already used by
the documented recipe. Required environment for the one invocation:

```text
ACRES_VERCEL_PROBE=isolated-synthetic-preview
VERCEL_ENV=preview
VERCEL_TEAM_ID=team_zE3mp7nrEZ6a7cxRavwUMYC4
VERCEL_PROJECT_ID=prj_q9ApajZWDgdYZetnm5s5oakEjrUD
ACRES_VERCEL_PROBE_REGION=iad1
VERCEL_OIDC_TOKEN=<from preview.env; never printed>
```

Do not pass `scanner.env`'s `ACRES_SCANNER_SNAPSHOT_ID`; supply the baseline
explicitly instead. Invocation (placeholders are not literal shell):

```text
node scripts/vercel/rebuild-scanner-cadence.js --force \
  --current-snapshot-id snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA \
  --output   <run dir>/receipt.json \
  --write-env <run dir>/candidate.env
```

- Exactly one invocation. No `--replace`, no standalone builder, no workflow
  dispatch, no automatic or manual retry on failure in this prompt.
- Capture stdout/stderr to 0600 files in the run directory; the CLIs already
  suppress raw provider/command errors. Report only the allowlisted JSON fields.
- Record the wall-clock start/end UTC. Honour the tool's own deadlines; if the
  process is still running past its documented deadline plus five minutes,
  stop it, and treat the result as failed/inconclusive.
- Run with network and subprocess permission granted for this one command; a
  restricted-network refusal before any provider call is re-run once with
  permission and both outcomes are recorded (that is not a second rebuild,
  since no candidate was requested).

## 4a. On success — offline handoff only

Require: exit 0, schema v1, target bound to the fixed team/project/region,
`execution_mode` live, candidate ID and both hashes present, clean/EICAR smoke
passed, cleanup passed, `activation_status: "not_performed"`,
`configuration_export` as produced, no `build_failure`.

```text
node scripts/vercel/prepare-scanner-handoff.js \
  --receipt <run dir>/receipt.json --output-dir <run dir>/handoff
```

Then, locally and without printing secrets:

1. Recompute SHA-256 of `receipt.json` and of each bundle file; compare to
   `handoff.json`'s recorded digests.
2. Compare the bundle's three runtime assignments
   (`SCANNER_SANDBOX_SNAPSHOT_ID`, `SCANNER_MAIN_SHA256`,
   `SCANNER_DAILY_SHA256`) with the receipt and with `candidate.env`
   (`ACRES_SCANNER_*`).
3. Exact-ID `Snapshot.get` for the new candidate: `created`, `iad1`, record
   expiry (expected ≈ 8 days).
4. Post-run sandbox listing: no new running sandbox owned by this run.
5. Optionally run `node scripts/vercel/probe-platform.js scanner` once against
   the candidate with `ACRES_SCANNER_MAX_SIGNATURE_AGE_HOURS=48` **only if**
   the producer receipt lacks a smoke result; the producer's own smoke is
   otherwise sufficient and no extra quota is spent.

Do not update `scanner.env`, project env vars or any deployment. Record that
the candidate is **prepared, not adopted**, and that its signatures age from
the build time — adoption should follow within ~48 hours or the candidate
needs replacing.

## 4b. On failure — record and stop

Record from the receipt only: `error`, `build_failure.step`, `.kind`,
`.builder_cleanup`, `.snapshot_confirmed`, the confirmed candidate ID if any,
exit code, and timestamps. Then read-only: exact-ID `Snapshot.get` of any
confirmed ID, post-run sandbox listing. Run the handoff validator once to
confirm rejection (`handoff_receipt_invalid`, exit 1) and record it.

- Do not delete the candidate or any snapshot; do not rewrite the receipt.
- If `builder_cleanup` is `failed`/`unknown` or a running sandbox owned by this
  run remains, report its ID and state; do not stop/delete it without asking
  the user (sandbox sessions end at their own timeout).
- Map the failing `step`/`kind` to the Prompt 387 failure-path table and state
  what it now resolves and what remains unknown. Propose (not execute) the
  next bounded scope in the record.
- Hosted failure is not a local-check failure; do not change source to make it
  look successful. If the failure exposes a genuine tooling defect, record it
  and leave the fix for a separate prompt unless it is a one-line diagnostic
  error in the Prompt 387 projection itself, which then needs its own test.

## Verification, records and completion

Local checks, Node 24.21.0, build before typecheck:

```bash
node scripts/vercel/check-vercel-config.js
npm run vercel:probe-test
npm run ops:check
npm run lint
npm run build
npm run typecheck
npm run ops:scan-secrets
git diff --check
```

Run installed Prettier on the prompt and new documentation fragments only
(historical owners fail Prettier at baseline; do not reformat them). Quote real
outputs and exits; an `ops:audit` network failure is recorded as such, never as
an aggregate pass.

Update, each with a "Prompt 388" section:

- `docs/vercel-deployment.md` — outcome, candidate identity/hashes and expiry
  (success) or safe failure fields (failure); update the scanner line under
  "Resume here" only to name the current next gate.
- `docs/operations.md` — UTC window, sanitized outputs, receipt/bundle
  digests, custody path, residue checks, check outputs, review.
- `infra/vercel/runbooks/managed-operations.md` §5 — only procedure lessons
  actually learned (e.g. permission needs, OIDC refresh); no restated record.
- `docs/build-plan.md` — concise outcome and remaining gates.
- `docs/launch-checklist.md` — one cross-reference line; no category approval.
- Memory `vercel-migration-resume` — update the next step (adoption of the
  named candidate, or the next failure scope).

Tracked records may contain the public target IDs, snapshot IDs, hashes,
timestamps, digests and fixed status fields. Never commit tokens, env file
contents, raw provider responses, stdout/stderr captures or private file
contents beyond the run directory's path.

After self-verification, dispatch an independent read-only reviewer
(`requesting-code-review`) with baseline/HEAD SHAs, the diff, this prompt and
sanitized evidence — no credentials or restricted files. Evaluate with
`receiving-code-review`; re-review significant changes. Commit this prompt and
the records locally to `main` with `caveman-commit`; do not push.

## Impact, non-goals and remaining gates

No route, API, schema, UI, token, dependency, workflow or application-source
change is expected. Hosted effect: at most one new retained Sandbox snapshot
and two short-lived owned sandboxes, within the Hobby Sandbox allowance.

Non-goals: env adoption, preview deployment, browser/application clean/EICAR
proof, queue correlation (the next prompt, only after success); snapshot
retirement or deletion of `snap_rz0c…`/`snap_Feg5…`; a second rebuild;
scheduled/hosted cadence enablement; production plan or promotion; Resend;
the eleven launch sign-offs; completion-percentage changes.

Reverting the documentation commit does not undo hosted state; all snapshots
remain retained pending a separately authorized retirement plan.
