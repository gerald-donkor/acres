# Prompt 394 — scanner signature refresh: one rebuild, preview adoption, upload → scan proof

## Scope and why this is next

Parent: Phase 12 managed-target operations, continuing approved Prompt 370.
Inspected baseline: `22c6300` on `main` (`docs(ops): record dashboard op name
fix 393`), worktree clean when this prompt was prepared (2026-10-18 ~15:30Z).
This file proves nothing on its own; resolve state from the repository and
`git log`.

`docs/vercel-deployment.md` "Resume here" → scanner bullet names two next
items: "a fresh rebuild/adoption before the signature window closes
(≈2026-10-20T01:00Z) or the dependency-aware retirement of superseded
snapshots". The first is time-bound and the second is not, so the rebuild
comes first. Prompt 391 adopted `snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN`
(`daily_sha256` `f9cb69a8…44a2a2d5`) on preview deployment
`dpl_2aajXYcFj2FDoGA9Gbbu5HqyFtBT`. After that bound, every preview scan
fails closed until a fresher candidate is adopted. The newest previews
(`dpl_1S2x…` from Prompt 393) carry the same scanner configuration.

This prompt repeats two hosted procedures that are already proven:

- **Stage 1:** one cadence rebuild, as in Prompt 390 stage B / Prompt 388
  §§1–4b. It produces a candidate and an offline handoff bundle.
- **Stage 2:** preview adoption and application acceptance, as in Prompt 391
  §§1–5. Two of its earlier deviations are now the method:
  - acceptance runs through `vercel curl --deployment` (not Playwright);
  - the deploy is a working-tree deploy gated by Prompt 392's manifest check
    (not `git archive`).

Prompt 393's `/app` fix is now in the source, so `/app` SSR becomes a hard
acceptance gate.

**Freshness gate (new; the reason this prompt exists).** Prompts 389 and 390
built about 40 minutes apart and got the same `daily.cvd`. A rebuild that
returns `daily_sha256 = f9cb69a8…44a2a2d5` again gives **no** window
extension. In that case the candidate is recorded as prepared and **not
adopted**, and stage 2 does not run. Whether ClamAV has published a newer
`daily.cvd` could not be checked while preparing this prompt: the local DNS
query for `current.cvd.clamav.net` timed out. The producer's receipt is the
evidence.

**Window arithmetic (a judgement, not a measurement).** No receipt records
the build time of the `daily.cvd` it fetched. A refreshed candidate's own
48 h bound is therefore unknown until its seam probe passes. The bound is at
most the fetch time + 48 h. Stage 2 begins only if at least **3 h** remain
before `2026-10-20T01:00Z`, the 391 bound. The 3 h covers one build, two
scans and polling margin. Stage 2 also requires the fresh candidate to pass
the seam probe at max age 48.

**Approval of this prompt authorizes, on the fixed free-tier preview target
only:**

- read-only provider inspection (`whoami`, `project inspect`,
  `Snapshot.get` by exact ID, `Snapshot.list`/`Sandbox.list`, deployment
  inspect, runtime logs);
- at most one `vercel env pull --environment=preview --yes` refresh into
  the existing 0700 directory;
- exactly **one** cadence-producer invocation (one builder sandbox, one
  smoke sandbox) and the offline handoff;
- exactly **one** `probe-platform.js scanner` seam run against the new
  candidate;
- writes to the three preview `SCANNER_*` records, run by the owner through a
  prepared script, since the auto-mode classifier refuses the agent's env
  writes (Prompt 391);
- exactly **one** preview deployment, with synthetic acceptance traffic;
- the documentation record and its local commit.

It does **not** authorize:

- a second rebuild or any retry;
- snapshot deletion or retirement (`snap_Feg5…`, `snap_rz0cs…`, `snap_KtLd…`,
  `snap_CARv…` all stay);
- deleting any deployment, including the nine leaky previews from Prompt 392;
- changes to `SCANNER_PROVIDER` or the max age;
- production, promotion, alias or domain changes;
- paid usage, plan changes, credential rotation, migrations, source or
  workflow changes;
- Chrome automation or a push.

## Reference material read

- `AGENTS.md` §§2, 3, 5–7, 10; memory `vercel-migration-resume` (Node 24
  launcher, cached CLI path `~/.npm/_npx/*/node_modules/vercel/dist/vc.js`,
  zsh word-splitting, OIDC/Sandbox gotchas, `vercel curl --deployment`,
  classifier refusals).
- `docs/vercel-deployment.md`: "Resume here" (fixed target, access steps 1–4
  including the Prompt 392 manifest gate, scanner proof commands), "Scanner
  preview adoption — Prompt 391", "Dashboard summary operation name — Prompt
  393", "Deploy upload allowlist — Prompt 392".
- `docs/operations.md` "Prompt 391 — scanner preview adoption" (sequence
  steps 1–6, `adopt.sh` handling, RLS-scoped read-only SQL method).
- `prompts/388-bounded-scanner-candidate-rebuild.md` §§1–4b (the live
  rebuild procedure; invocation shape, required env, success/failure
  handling).
- `prompts/390-scanner-smoke-source-fix-and-rebuild.md` §B (custody, `env -i`,
  2,100 s outer deadline, OIDC `exp` check).
- `prompts/391-scanner-candidate-preview-adoption.md` §§1–5 (window check,
  bundle validation, adoption, deploy, acceptance, recovery).
- Source checked while preparing:
  - `scripts/vercel/rebuild-scanner-cadence.js` flags: `--force`,
    `--current-snapshot-id`, `--output`, `--write-env`, `--max-age-hours`,
    `--dry-run`, `--help`. `--skip-prune` is a deprecated no-op, and
    `prune_status` is `retained` when a current ID is given (`:104`,
    `:393`, `:488`).
  - `scripts/vercel/prepare-scanner-handoff.js` flags: `--receipt`,
    `--output-dir`, `--help`.
- Custody listing (names and modes only):
  - `~/.config/acres/vercel-preview/` holds `preview.env`, `scanner.env`,
    `neon-urls.env` and the earlier `prompt3xx-*` run directories, all 0700
    or 0600;
  - `prompt391-20261018T133907Z/` holds `previous-scanner.env` and
    `accept/` with `state.json`/`timeline.jsonl`; these are the templates
    for this run.

No visual change, comp crop or measurement is involved.

## SKILLS USED

- `vercel:vercel-sandbox` — `Snapshot.get`/`list`, `Sandbox.list`, snapshot
  `source` boot and cleanup semantics against installed `@vercel/sandbox`
  3.8.0.
- `vercel:vercel-cli` — verify the `env pull`, `env update`, `deploy --dry`,
  `deploy`, `inspect` and `curl --deployment` flags against the installed
  CLI before use.
- `vercel:env-vars` — preview-scoped records, branch overrides, OIDC token
  expiry.
- `vercel:deployments-cicd` — immutable deployment identity, no promotion.
- `vercel:queues` — correlate both uploads with the new deployment's `jobs`
  consumer.
- `deployment-pipeline-design` — ordered gates (freshness → seam → adopt →
  deploy → accept) and rollback.
- `secrets-management` — restricted custody; names only, never values.
- `security-best-practices` — preserve preview isolation, quarantine and
  tenant authorization in the negative checks.
- `error-handling-patterns` — classify failures (build, smoke, stale
  signatures, partial env writes, inconclusive acceptance).
- `e2e-testing-patterns` — synthetic, isolated acceptance with bounded
  terminal-state polling.
- `requesting-code-review` — independent read-only review of the record
  diff.
- `receiving-code-review` — verify findings before acting.
- `caveman-commit` — the required local commit to `main`.

These are the skills execution needs. Preparing this prompt loaded none of
them. Execution invokes each one before the step it governs. `playwright` is
deliberately omitted, because acceptance uses `vercel curl` (Prompt 391's
recorded reason). No Nest, schema or UI change is in scope.

## 1. Re-establish the target and window (read-only)

1. Re-read this prompt, `AGENTS.md` and the owning records. Confirm `main`,
   clean worktree apart from this prompt, and record `HEAD`.
2. Run Node 24.21.0 via the `/tmp/acres-node24` launcher (reinstall per
   "Resume here" step 3 if `/tmp` was cleared). Both `node --version` and
   `npm exec -- node --version` must print `v24.21.0`.
3. Vercel CLI via the cached `vc.js`, then `whoami`. If signed out, stop and
   ask the owner to run `! npx vercel@latest login`.
4. Check `preview.env`'s OIDC `exp` locally. Print only `exp` and the
   owner/project match booleans. If under 75 min remain, do the one
   authorized `env pull` and list names only.
5. Provider reads, with UTC timestamps. Each must match:
   - team `team_zE3mp7nrEZ6a7cxRavwUMYC4`, project
     `prj_q9ApajZWDgdYZetnm5s5oakEjrUD`, Hobby, `iad1`;
   - `Snapshot.get` reports all four retained snapshots `created`: baseline
     `snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA`, `snap_rz0cs8Nnw1RObI3ZDS5WRKDSUR2y`,
     `snap_KtLdaJeG4SaLAwi4mI8G8XzURZat` and the active
     `snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN`;
   - `Sandbox.list` shows no running sandboxes;
   - the preview `SCANNER_*` records are present and preview-only, with no
     branch override. Stop on any mismatch, a pause/402/429 signal, or a
     required paid capability.
6. **Window go/no-go.** Record the current UTC time.
   - If fewer than 3 h remain before `2026-10-20T01:00Z`, run stage 1 only.
     Its candidate stays prepared but not adopted.
   - Separately, if `snap_CARv…` has already passed its signature window (it
     is past the bound), stage 2 is still allowed, because it is then the
     only way to restore a working preview scanner. Record which case
     applies.
7. Create `~/.config/acres/vercel-preview/prompt394-<UTC stamp>/` (0700;
   every file 0600). Never touch an earlier `prompt3xx-*` directory.

## 2. Stage 1 — one cadence rebuild

Pre-flight with no cloud calls. Require exit 0 for all three commands, and
`"execution_mode":"simulation"` from the dry run:

```bash
npm run vercel:scanner-rebuild -- --help
npm run vercel:scanner-rebuild -- --dry-run
node --test scripts/vercel/build-scanner-snapshot.spec.js \
  scripts/vercel/rebuild-scanner-cadence.spec.js \
  scripts/vercel/prepare-scanner-handoff.spec.js
```

If the installed `@vercel/sandbox` is not 3.8.0, stop and report.

The single live invocation follows Prompt 388 §3 and Prompt 390 §B:

- run it under `env -i`, passing only `PATH` (the Node 24 bin first),
  `HOME` and the variables below;
- apply a 2,100 s outer deadline;
- write stdout and stderr to 0600 files in the run directory;
- record the start and end UTC.

```text
ACRES_VERCEL_PROBE=isolated-synthetic-preview
VERCEL_ENV=preview
VERCEL_TEAM_ID=team_zE3mp7nrEZ6a7cxRavwUMYC4
VERCEL_PROJECT_ID=prj_q9ApajZWDgdYZetnm5s5oakEjrUD
ACRES_VERCEL_PROBE_REGION=iad1
VERCEL_OIDC_TOKEN=<from preview.env, never printed>

node scripts/vercel/rebuild-scanner-cadence.js --force \
  --current-snapshot-id snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN \
  --output <run dir>/receipt.json \
  --write-env <run dir>/candidate.env
```

`--current-snapshot-id` is now the **active** `snap_CARv…`. In earlier
prompts it was the baseline, because the baseline was active then. It is
only recorded as `previous_snapshot_id` with `prune_status: "retained"`, and
nothing is deleted. Do not run a retry or a second invocation.

**On failure:** follow Prompt 388 §4b plus Prompt 390's reading guide:

- record the allowlisted `build_failure`/`smoke_failure` fields;
- read-only `Snapshot.get` of any confirmed ID and `Sandbox.list`;
- run the handoff validator once to confirm rejection;
- record and stop. Stage 2 does not run, and `snap_CARv…` stays active.

**On success:** follow Prompt 388 §4a:

- `prepare-scanner-handoff.js --receipt <run>/receipt.json --output-dir
<run>/handoff`;
- recompute the receipt and bundle SHA-256 and compare them with
  `handoff.json`;
- parse `runtime.env` as data. It must hold exactly three lines:
  `SCANNER_SANDBOX_SNAPSHOT_ID`, `SCANNER_MAIN_SHA256` and
  `SCANNER_DAILY_SHA256`. The ID must match `^snap_[A-Za-z0-9]+$` and both
  hashes `^[0-9a-f]{64}$`. Never `source` it;
- `Snapshot.get` must show the new ID `created` in `iad1`. Record its
  expiry, about 8 days out;
- `Sandbox.list` must show nothing left running.

**Freshness gate.** Compare the receipt's `daily_sha256` with `f9cb69a8…`
(the full value from `prompt390-*/candidate.env`, compared privately).

- **Equal:** record "rebuilt, same signatures, no extension". The
  candidate is prepared and not adopted. Stop before stage 2.
- **Different:** continue. A different `main_sha256` is recorded but does
  not change the decision.

## 3. Stage 2 — seam probe, adoption, deployment

1. **Seam probe, exactly one run.** Run `probe-platform.js scanner` with
   `ACRES_SCANNER_MAX_SIGNATURE_AGE_HOURS=48`, using the "Resume here" env
   shape with `ACRES_SCANNER_*` loaded from the new `candidate.env` as
   validated data. It must report:
   - `gatePassed` and `signaturesVerified`;
   - clean accepted and EICAR rejected;
   - `baseSnapshotSurvived`, one creation, cleanup succeeded.
     A signature-age rejection means even the fresh `daily.cvd` is already
     more than 48 h old. Record that as a provider-cadence finding and stop
     before any env write.
2. **Capture the previous values.** Write `previous-scanner.env` and
   `previous-scanner-scopes.json` (the Prompt 391 shape) from a private
   pre-pull of preview into the run directory. List names only.
3. **Owner-run adoption.** Check `env update --help` on the cached CLI. Then
   write `<run>/adopt.sh` (0700), modelled on Prompt 391's script:
   - it reads the three values from `handoff/runtime.env` as data;
   - it pipes each value through stdin to `vc.js env update <NAME> preview
--yes --scope dgsloxx417s-projects` (flags as verified by `--help`);
   - it prints only names and exit codes, appending them to `writes.log`;
   - it exits nonzero on the first failure.

   Ask the owner to run `! bash <run>/adopt.sh`. Do not attempt the write
   as the agent. Then do a private re-pull into `preview-after.env` and
   compare. All three values must equal the bundle. Every other variable,
   `SCANNER_PROVIDER` and the max age `48` must be unchanged. A failed or
   partial write goes to §5.

4. **Deploy gate (Prompt 392).** From the repo root on a clean `main`, run
   `vc.js deploy --dry --target=preview < /dev/null > <run>/dry.json`, then
   `npm run vercel:deploy-manifest -- --manifest <run>/dry.json`. Proceed
   only on `deploy manifest ok` with 656 files (Prompt 393's count). Any
   other count needs an explanation from `git log` before you proceed.
5. **One preview deployment.** Verify the flags with `deploy --help`. Run
   `vc.js deploy --target=preview --scope dgsloxx417s-projects`. Do not use
   `--prod`, alias or promote. Record:
   - the deployment ID, URL, source SHA (HEAD), created and Ready times;
   - `target: null`, no aliases, `iad1`, the basic build machine;
   - the Services `client`, `api` and `jobs`.
     A failed build goes to §5.

## 4. Stage 2 — application acceptance (synthetic only)

Use `vercel curl --deployment <id>` against the immutable URL with a cookie
jar, following the Prompt 391 request sequence (custody
`<run>/accept/{NN.body,NN.req,state.json,timeline.jsonl}`). Re-read
`server/src/uploads/uploads.controller.ts`, its DTOs and the client upload
helper before building the requests. Run the steps in order:

1. `/api/v1/auth/csrf`, then register a unique synthetic account
   (`scanner-394-<stamp>@example.test`). Create an organization and select
   it.
2. **`/app` SSR must return 200 with `id="dashboard-title"` and no
   `AppError`.** This is a hard gate now that Prompt 393's fix is in the
   source.
3. **Clean CSV upload:**
   - initiate the upload;
   - do a direct private Blob PUT;
   - complete it with the real SHA-256, the byte count and a unique
     idempotency key;
   - poll the status with a 10 min bounded deadline (a judgement) until it
     reads `accepted`.
4. **EICAR CSV upload:** use the existing probe fixture with a real
   checksum.
   - Require `rejected`/`infected`, a 404 on download and no dataset
     version.
   - Never print the fixture bytes.
5. **Correlation:**
   - read-only RLS-scoped SQL (`acres_app` direct URL, `BEGIN READ ONLY`,
     transaction-local `acres.organization_id`) for upload `scanStatus`,
     the outbox row and the `DurableJob` terminal states;
   - runtime logs filtered by the new `deploymentId` for the EICAR rejection
     line.
     A timeout is inconclusive, not success.
6. **Negatives:**
   - an anonymous GET of both Blob objects must return 403;
   - a second synthetic organization must get 404 for both uploads, with
     its own header and with a forged one.
7. **Scanner identity.** This is an inference, worded as Prompt 391 words
   it. It rests on:
   - the adapter's `sourceSnapshotId` and hash checks before a clean
     verdict;
   - the env write finishing before the deployment was created;
   - the new candidate's expiry moving forward after the EICAR scan, read
     with `Snapshot.get` before and after.
     Finish with `Sandbox.list`, which must show no residue.

## 5. Failure handling and recovery

- **Before any mutation** (access, target, window, rebuild, freshness, seam
  probe): stop. There is nothing to restore. `snap_CARv…` stays active.
- **Partial env write:** prepare `restore.sh` from `previous-scanner.env`
  (same stdin/names-only shape) for the owner to run. Then verify privately.
- **Deploy failure:** keep every deployment and snapshot. Restore the three
  records through the owner script and record both outcomes.
- **Acceptance failure:** stop the synthetic work and keep the evidence.
  Restore the three records only if nobody else has changed them since. Do
  not create an extra deployment, weaken a gate or replay a job.
- **Restoring `snap_CARv…` restores identity only.** Past
  `2026-10-20T01:00Z` its signatures fail the 48 h policy. Say so in the
  record.

## 6. Checks, records, review, commit

Run the local checks on Node 24.21.0 one at a time, quoting the real output
and exit code of each:

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

Run the installed Prettier on this prompt and the new doc fragments only.
Local checks never substitute for hosted proof.

Records (documentation only):

- `docs/vercel-deployment.md`:
  - a new "Scanner signature refresh — Prompt 394" section covering the
    outcome of each gate, the candidate ID, truncated hashes, expiry, the
    receipt and bundle digests, the deployment ID/URL and the acceptance
    results;
  - the "Resume here" scanner bullet's "Next" line, naming the new bound
    or the stop reason;
  - Prompt 394 added to the sub-prompt list at the top of "Resume here".
- `docs/operations.md`: the execution record, covering the UTC window,
  custody path, sanitized outputs, any recovery and the review.
- `infra/vercel/runbooks/managed-operations.md` §5.5: add the freshness
  gate (compare `daily_sha256` before adopting) to the adoption procedure.
- `docs/build-plan.md` and `docs/launch-checklist.md`: one line each. No
  category approval.
- The memory file `vercel-migration-resume`: update the scanner status line.

Tracked records may carry the public IDs, truncated hashes, timestamps and
statuses. Cookies, credentials, test identities, presigned URLs, raw logs and
env values stay in custody.

Then:

- `requesting-code-review` (baseline `22c6300`, HEAD, sanitized evidence, no
  credentials);
- `receiving-code-review`;
- a re-review if the changes were significant;
- a local commit with `caveman-commit` (e.g. `docs(ops): record scanner
refresh 394`).

No push. Report the immutable preview URL, how to inspect it
(`vercel curl --deployment`) and the new signature bound.

## Impact, non-goals, remaining gates

**Changes:**

- one new retained snapshot (Snapshot Storage grows from about 1.84 GB to
  about 2.3 GB of 15 GB);
- about three Sandbox creations (two from the rebuild, one from the probe)
  plus two scans, far inside the Hobby limits recorded in Prompt 389/391;
- three preview variables;
- one preview deployment;
- synthetic data;
- documentation.

No source, route, schema, UI, token, dependency or workflow change.

**Non-goals:**

- snapshot retirement (now five retained, and `snap_Feg5…` expires
  `2026-10-24T14:29:39Z`). It is the next separate prompt and is
  dependency-aware, because older previews still name older snapshots;
- the owner's decision on the nine leaky previews;
- the hosted scheduled cadence. This prompt is a manual refresh, and the
  48 h policy means a manual refresh roughly every two days until that
  cadence exists, which the record must say;
- the production plan decision and the eleven sign-offs.

Reverting the documentation commit does not revert Vercel state. Hosted
recovery follows §5.
