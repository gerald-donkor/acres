# Prompt 395 — scanner signature refresh 2: one rebuild, preview adoption, upload → scan proof

## Scope and why this is next

Parent: Phase 12 managed-target operations, continuing approved Prompt 370.
Inspected baseline: `45a392a` on `main` (`docs(ops): record scanner refresh
394`), worktree clean when this prompt was prepared (2026-10-18 ~16:30Z).
This file proves nothing on its own; resolve state from the repository and
`git log`.

`docs/vercel-deployment.md` "Resume here" → scanner bullet → "Next (own
prompts)" lists, in order:

1. the next refresh before the Prompt 394 bound (compare `daily_sha256`
   first);
2. the dependency-aware retirement of superseded snapshots;
3. the owner's decision on the nine leaky previews (not a prompt; owner
   only).

Item 1 is the only time-bound one. Prompt 394 adopted
`snap_ngIwnQplocPoUR0A6cewfCGrFAbX` (`daily_sha256` `489f6083…`, fetched
inside the `2026-10-18T15:59:12–16:00:39Z` rebuild) on preview deployment
`dpl_A5H3fnpSx59XyfKqmKJQLywVf85j`. Its signatures fail the 48 h policy no
later than about **`2026-10-20T16:01Z`** (possibly earlier; the `daily.cvd`
build time is not recorded). After that, every preview scan fails closed
until a fresher candidate is adopted. Retirement (item 2) is not urgent:
the oldest retained snapshot, `snap_Feg5…`, expires `2026-10-24T14:29:39Z`.

This prompt repeats Prompt 394 unchanged in method. Only the identities,
the bound, the baseline and the freshness comparator move. Prompt 394 is the
proven template; where a step below says "as Prompt 394 §N", re-read that
section at execution time and apply it with the deltas named here.

**Execution window (a judgement, not a measurement).**

- **Earliest useful start: `2026-10-19T04:00Z`.** Prompt 394's rebuild
  fetched a new `daily.cvd` at ~16:00Z on 2026-10-18. Prompts 389/390,
  ~40 min apart, fetched the same file. Running the single authorized
  rebuild too soon risks spending it on an identical `daily.cvd` and getting
  no extension. ClamAV's publishing cadence was not verified for this
  prompt, so the start time is a margin, not a rule. Execution before it is
  allowed if the owner explicitly asks; the freshness gate still governs.
- **Latest start for stage 2: `2026-10-20T12:59Z`** (3 h before the
  planning bound `15:59Z`: one deploy build, two scans, polling margin).
  After that, stage 1 still runs but the candidate stays prepared, not
  adopted, unless the active snapshot has already failed its window (§1
  step 6).

**Freshness gate.** A rebuild whose `daily_sha256` equals `489f6083…` (full
value compared privately from `prompt394-20261018T155715Z/candidate.env`)
gives **no** extension. Record "rebuilt, same signatures, no extension",
keep the candidate prepared and not adopted, and stop. A second rebuild needs
a new approval.

**Approval of this prompt authorizes, on the fixed free-tier preview target
only** (team `team_zE3mp7nrEZ6a7cxRavwUMYC4`, project
`prj_q9ApajZWDgdYZetnm5s5oakEjrUD`, `iad1`):

- read-only provider inspection (`whoami`, `project inspect`,
  `Snapshot.get` by exact ID, `Snapshot.list`/`Sandbox.list`, deployment
  inspect, runtime logs);
- at most one `vercel env pull --environment=preview --yes` refresh into
  the existing 0700 directory, plus the private pre/post pulls into the run
  directory that adoption needs;
- exactly **one** cadence-producer invocation (one builder sandbox, one
  smoke sandbox) and the offline handoff;
- exactly **one** `probe-platform.js scanner` seam run against the new
  candidate;
- writes to the three preview `SCANNER_*` records, run by the owner through
  a prepared `adopt.sh` (the auto-mode classifier refuses agent env writes,
  Prompt 391);
- exactly **one** preview deployment, with synthetic acceptance traffic;
- the documentation record, the memory update and the local commit.

It does **not** authorize:

- a second rebuild, a second probe or any retry;
- snapshot deletion or retirement: all five retained snapshots stay
  (`snap_Feg5…`, `snap_rz0cs…`, `snap_KtLd…`, `snap_CARv…`, `snap_ngIw…`);
- deleting any deployment, including the nine leaky previews (Prompt 392);
- changes to `SCANNER_PROVIDER`, the max age `48`, or any non-scanner
  variable;
- production, promotion, alias or domain changes;
- paid usage, plan changes, credential rotation, migrations, source or
  workflow changes (including enabling the GitHub Actions live cadence);
- Chrome automation or a push.

## Reference material read

- `AGENTS.md` §§2, 3, 5–7, 10; memory `vercel-migration-resume` (Node 24
  launcher, cached CLI path `~/.npm/_npx/*/node_modules/vercel/dist/vc.js`,
  zsh word-splitting, OIDC/Sandbox gotchas, `vercel curl --deployment`,
  classifier refusals, stale lines kept by `env pull` into an existing file,
  digit-tolerant env-key parsing).
- `docs/vercel-deployment.md`: "Resume here" (fixed target, access steps 1–4
  with the Prompt 392 manifest gate, scanner proof commands) and "Scanner
  signature refresh — Prompt 394" (every gate outcome and timing used as the
  baseline here).
- `docs/operations.md` "Prompt 394 — scanner signature refresh" (the
  execution record this run mirrors).
- `prompts/394-scanner-refresh-rebuild-and-preview-adoption.md` §§1–6 (the
  procedure; every step below inherits from it).
- `prompts/388-bounded-scanner-candidate-rebuild.md` §§3–4b and
  `prompts/390-scanner-smoke-source-fix-and-rebuild.md` §B (live rebuild
  shape, failure reading guide), via Prompt 394.
- `prompts/391-scanner-candidate-preview-adoption.md` §§3–5 (adoption,
  acceptance request sequence, recovery), via Prompt 394.
- `infra/vercel/runbooks/managed-operations.md` §5.5 (manual activation,
  verification and retirement; already carries Prompt 394's freshness gate).
- `.github/workflows/scanner-snapshot-rebuild.yml`: the scheduled run is
  simulation-only; live mode needs `workflow_dispatch` plus repository
  secrets. It is **not** the hosted cadence and is not touched here.
- Checked while preparing: installed `@vercel/sandbox` is **3.8.0**.
- Custody listing (names and modes only): `~/.config/acres/vercel-preview/`
  is 0700 and holds `prompt394-20261018T155715Z/` with `candidate.env`,
  `adopt.sh`, `restore.sh`, `previous-scanner.env`,
  `previous-scanner-scopes.json`, `handoff/`, `accept/`, `acceptance.json`
  and `dry.json`. These are the templates for this run; never modify them.
  Prompt 394's job-scoped acceptance script
  (`$CLAUDE_JOB_DIR/tmp/accept394.cjs`) may be gone; rebuild it from the
  Prompt 394 record and `accept/` request files if so.

No visual change, comp crop or measurement is involved.

## SKILLS USED

- `vercel:vercel-sandbox` — `Snapshot.get`/`list`, `Sandbox.list`, snapshot
  `source` boot and cleanup semantics against installed `@vercel/sandbox`
  3.8.0.
- `vercel:vercel-cli` — verify `env pull`, `env update`, `deploy --dry`,
  `deploy`, `inspect`, `logs` and `curl --deployment` flags against the
  cached CLI before each use.
- `vercel:env-vars` — preview-scoped records, branch overrides, OIDC token
  expiry, stale lines after `env pull`.
- `vercel:deployments-cicd` — immutable deployment identity, no promotion.
- `vercel:queues` — correlate both uploads with the new deployment's `jobs`
  consumer.
- `deployment-pipeline-design` — ordered gates (window → freshness → seam →
  adopt → deploy → accept) and rollback.
- `secrets-management` — restricted custody; names only, never values.
- `security-best-practices` — preview isolation, quarantine and tenant
  authorization in the negative checks.
- `error-handling-patterns` — classify failures (build, smoke, same
  signatures, stale signatures, partial env writes, inconclusive
  acceptance).
- `e2e-testing-patterns` — synthetic, isolated acceptance with bounded
  terminal-state polling.
- `requesting-code-review` — independent read-only review of the record
  diff.
- `receiving-code-review` — verify findings before acting.
- `caveman-commit` — the required local commit to `main`.

Preparing this prompt loaded none of them; execution invokes each before
the step it governs. `playwright` is deliberately omitted: acceptance uses
`vercel curl` (Prompt 391's recorded reason). No Nest, schema or UI change is
in scope.

## 1. Re-establish the target and window (read-only)

As Prompt 394 §1, with these values:

1. Re-read this prompt, `AGENTS.md`, Prompt 394 and the owning records.
   Confirm `main`, a clean worktree apart from this prompt, and record
   `HEAD` (expected `45a392a` or a descendant whose extra commits are
   docs-only; explain any other change from `git log` before continuing).
2. Node 24.21.0 via the `/tmp/acres-node24` launcher (reinstall per "Resume
   here" step 3 if `/tmp` was cleared). Both `node --version` and
   `npm exec -- node --version` print `v24.21.0`. Run multi-arg commands
   through `bash -c` (zsh does not word-split unquoted lists).
3. Cached `vc.js whoami`. If signed out, stop and ask the owner to run
   `! npx vercel@latest login`.
4. Read `preview.env`'s `VERCEL_OIDC_TOKEN` `exp` locally; print only `exp`
   and the owner/project match booleans. If under 75 min remain, do the one
   authorized `env pull` (into a fresh file, then replace, so stale lines do
   not survive) and list names only.
5. Provider reads, with UTC timestamps; each must match:
   - team, project, Hobby, `iad1` as above;
   - `Snapshot.get` reports all five retained snapshots `created`:
     `snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA` (baseline),
     `snap_rz0cs8Nnw1RObI3ZDS5WRKDSUR2y`,
     `snap_KtLdaJeG4SaLAwi4mI8G8XzURZat`,
     `snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN` and the active
     `snap_ngIwnQplocPoUR0A6cewfCGrFAbX`. Record each expiry;
   - `Sandbox.list` shows no running sandboxes;
   - the five preview `SCANNER_*` records are present, preview-only,
     `encrypted`, no git branch override; `SCANNER_SANDBOX_SNAPSHOT_ID`
     privately equals `snap_ngIw…`. Stop on any mismatch, a pause/402/429
     signal, or a required paid capability.
6. **Window go/no-go.** Record the current UTC time.
   - Before `2026-10-19T04:00Z` without an explicit owner request: stop
     and report the earliest start. Nothing has been spent.
   - After `2026-10-20T12:59Z`: stage 1 only; the candidate stays prepared,
     not adopted.
   - Exception: if `snap_ngIw…` has already passed its bound
     (`2026-10-20T16:01Z`), stage 2 is allowed whatever the time, because it
     is then the only way to restore a working preview scanner. Record which
     case applies.
7. Create `~/.config/acres/vercel-preview/prompt395-<UTC stamp>/` (0700;
   every file 0600, `adopt.sh`/`restore.sh` 0700). Never touch an earlier
   `prompt3xx-*` directory.

## 2. Stage 1 — one cadence rebuild

As Prompt 394 §2. Pre-flight with no cloud calls; all three exit 0 and the
dry run reports `"execution_mode":"simulation"`:

```bash
npm run vercel:scanner-rebuild -- --help
npm run vercel:scanner-rebuild -- --dry-run
node --test scripts/vercel/build-scanner-snapshot.spec.js \
  scripts/vercel/rebuild-scanner-cadence.spec.js \
  scripts/vercel/prepare-scanner-handoff.spec.js
```

Single live invocation under `env -i` (only `PATH` with the Node 24 bin
first, `HOME`, and the variables below), 2,100 s outer deadline, stdout and
stderr to 0600 files, start and end UTC recorded:

```text
ACRES_VERCEL_PROBE=isolated-synthetic-preview
VERCEL_ENV=preview
VERCEL_TEAM_ID=team_zE3mp7nrEZ6a7cxRavwUMYC4
VERCEL_PROJECT_ID=prj_q9ApajZWDgdYZetnm5s5oakEjrUD
ACRES_VERCEL_PROBE_REGION=iad1
VERCEL_OIDC_TOKEN=<from preview.env, never printed>

node scripts/vercel/rebuild-scanner-cadence.js --force \
  --current-snapshot-id snap_ngIwnQplocPoUR0A6cewfCGrFAbX \
  --output <run dir>/receipt.json \
  --write-env <run dir>/candidate.env
```

Delta from Prompt 394: `--current-snapshot-id` is now the active
`snap_ngIw…`. It is recorded as `previous_snapshot_id` with
`prune_status: "retained"`; nothing is deleted. No retry.

**On failure:** as Prompt 394 §2 "On failure" (allowlisted
`build_failure`/`smoke_failure` fields, read-only `Snapshot.get` of any
confirmed ID, `Sandbox.list`, handoff validator once to confirm rejection,
record and stop). `snap_ngIw…` stays active.

**On success:** as Prompt 394 §2 "On success":

- `prepare-scanner-handoff.js --receipt <run>/receipt.json --output-dir
<run>/handoff`;
- recompute receipt and bundle SHA-256 and compare with `handoff.json`;
- parse `runtime.env` as data: exactly `SCANNER_SANDBOX_SNAPSHOT_ID`
  (`^snap_[A-Za-z0-9]+$`), `SCANNER_MAIN_SHA256` and `SCANNER_DAILY_SHA256`
  (`^[0-9a-f]{64}$`; the key parser must allow digits). Never `source` it;
- `Snapshot.get`: new ID `created` in `iad1`; record its expiry (~8 days);
- `Sandbox.list`: nothing running.

**Freshness gate.** Compare the receipt's `daily_sha256` privately with the
full `SCANNER_DAILY_SHA256` in `prompt394-20261018T155715Z/candidate.env`
(`489f6083…`).

- **Equal:** record "rebuilt, same signatures, no extension"; candidate
  prepared, not adopted; stop before stage 2 and go to §6 (records only).
- **Different:** continue. A changed `main_sha256` is recorded but does not
  change the decision.

## 3. Stage 2 — seam probe, adoption, deployment

As Prompt 394 §3:

1. **Seam probe, exactly one run** (`probe-platform.js scanner`,
   `ACRES_SCANNER_MAX_SIGNATURE_AGE_HOURS=48`, "Resume here" env shape,
   `ACRES_SCANNER_*` from the new `candidate.env` as validated data). It
   must report `gatePassed`, `signaturesVerified`, clean accepted, EICAR
   rejected, `baseSnapshotSurvived`, one creation, cleanup succeeded. A
   signature-age rejection is a provider-cadence finding: record and stop
   before any env write.
2. **Capture previous values** from a private pre-pull into the run
   directory (fresh file): `previous-scanner.env` and
   `previous-scanner-scopes.json` (Prompt 394 shape). Names only in output.
3. **Owner-run adoption.** Check `vc.js env update --help`. Write
   `<run>/adopt.sh` (0700) from Prompt 394's script: reads the three values
   from `<run>/handoff/runtime.env` as data, pipes each through stdin to
   `vc.js env update <NAME> preview --yes --scope dgsloxx417s-projects`
   (flags as verified), prints names and exit codes only, appends to
   `writes.log`, exits nonzero on the first failure. Also write
   `<run>/restore.sh` from `previous-scanner.env` in the same shape, before
   asking. Ask the owner to run `! bash <run>/adopt.sh`; never attempt the
   write as the agent. Then a private fresh re-pull into
   `preview-after.env`: all three values equal the bundle; of keys present
   in both pulls, only `SCANNER_SANDBOX_SNAPSHOT_ID`,
   `SCANNER_DAILY_SHA256` and (if changed) `SCANNER_MAIN_SHA256` differ;
   `SCANNER_PROVIDER=vercel-sandbox` and max age `48` unchanged. A failed or
   partial write goes to §5.
4. **Deploy gate (Prompt 392).** Repo root, clean `main`:
   `vc.js deploy --dry --target=preview < /dev/null > <run>/dry.json`, then
   `npm run vercel:deploy-manifest -- --manifest <run>/dry.json`. Proceed
   only on `deploy manifest ok`. Prompt 394 saw **656 files** at `22c6300`;
   `45a392a` changed documentation only. Any different count is explained
   from `git log --stat 22c6300..HEAD` and the allowlist before proceeding.
5. **One preview deployment.** `vc.js deploy --help`, then
   `vc.js deploy --target=preview --scope dgsloxx417s-projects`. No
   `--prod`, alias or promote. Record deployment ID, URL, source SHA,
   created/Ready times, `target: null`, no aliases, `iad1`, basic build
   machine, and the `client`, `api` and `jobs` entrypoints in the build log.
   A failed build goes to §5.

## 4. Stage 2 — application acceptance (synthetic only)

As Prompt 394 §4, through `vc.js curl --deployment <id>` with a cookie
jar; custody `<run>/accept/{NN.body,NN.req,state.json,timeline.jsonl}`.
Re-read `server/src/uploads/uploads.controller.ts`, its DTOs and the client
upload helper first.

1. `/api/v1/auth/csrf`; register `scanner-395-<stamp>@example.test`; create
   an organization; select it through the `acres_active_organization`
   cookie.
2. **Hard gate:** `/app` returns 200 with `id="dashboard-title"` and no
   `role="alert"`.
3. **Clean CSV:** initiate, private Blob PUT, complete with real SHA-256,
   byte count and a unique idempotency key; poll status (10 min bounded
   deadline, a judgement) to `accepted`.
4. **EICAR CSV** (probe fixture, real checksum, bytes never printed):
   `rejected`/`infected`, download 404, no dataset version.
5. **Correlation:** read-only RLS-scoped SQL (`acres_app` direct URL,
   `BEGIN READ ONLY`, transaction-local `acres.organization_id`) for upload
   `scanStatus`, outbox row and `DurableJob` terminal states; runtime logs
   filtered by the new `deploymentId` for the `JobProcessorService`
   EICAR-rejection line. A timeout is inconclusive, not success.
6. **Negatives:** anonymous GET of both Blob objects → 403; a second
   synthetic organization → 404 for both uploads with its own and a forged
   organization header; the RLS-scoped read sees only the first
   organization's two uploads.
7. **Scanner identity (inference, worded as Prompt 394):** adapter
   `sourceSnapshotId`/hash checks before a clean verdict; env writes done
   before the deployment was created; the new candidate's expiry moves
   forward across the scans while `snap_ngIw…`'s does not (`Snapshot.get`
   before and after). Finish with `Sandbox.list` empty.

## 5. Failure handling and recovery

As Prompt 394 §5, with `snap_ngIw…` as the restore target:

- **Before any mutation** (access, target, window, rebuild, freshness, seam
  probe): stop; nothing to restore; `snap_ngIw…` stays active.
- **Partial env write:** owner runs the prepared `restore.sh`; verify by a
  private fresh pull.
- **Deploy failure:** keep every deployment and snapshot; owner restores
  the three records; record both outcomes.
- **Acceptance failure:** stop synthetic work, keep evidence; restore only
  if nobody else changed the records since. No extra deployment, weakened
  gate or job replay.
- **Restoring `snap_ngIw…` restores identity only.** Past about
  `2026-10-20T16:01Z` its signatures fail the 48 h policy; say so in the
  record.

## 6. Checks, records, review, commit

Local checks on Node 24.21.0, one at a time, quoting real output and exit
code:

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

Installed Prettier on this prompt and the new doc fragments only. Local
checks never substitute for hosted proof.

Records (documentation only):

- `docs/vercel-deployment.md`:
  - new section "Scanner signature refresh — Prompt 395 (<date>)" with each
    gate's outcome, candidate ID, truncated hashes, expiry, receipt and
    bundle digests, deployment ID/URL, acceptance results, owned artifacts
    and the new bound (or the stop reason);
  - "Resume here": add Prompt 395 to the sub-prompt list; update the
    scanner bullet's "Next" line with the new bound and the retained count
    (six on success);
- `docs/operations.md`: "Prompt 395 — scanner signature refresh 2" execution
  record (UTC window, custody path, sanitized outputs, any recovery, the
  review);
- `docs/build-plan.md` and `docs/launch-checklist.md`: one line each, no
  category approval;
- `infra/vercel/runbooks/managed-operations.md` §5.5: change only if this
  run found a procedure gap;
- memory `vercel-migration-resume`: update the scanner status line (new
  active ID, deployment, bound).

Tracked records may carry public IDs, truncated hashes, timestamps and
statuses. Cookies, credentials, test identities, presigned URLs, raw logs
and env values stay in custody.

Then `requesting-code-review` (baseline `45a392a`, HEAD, sanitized
evidence, no credentials) → `receiving-code-review` → re-review if
significant → local commit with `caveman-commit` (e.g. `docs(ops): record
scanner refresh 395`). No push. Report the immutable preview URL, how to
inspect it (`vercel curl --deployment`) and the new signature bound.

## Impact, non-goals, remaining gates

**Changes:** one new retained snapshot (Snapshot Storage ~2.3 GB → ~2.8 GB
of 15 GB); about three Sandbox creations plus two scans, far inside the
Hobby limits recorded in the Prompt 389/391 pricing reads; three preview
variables; one preview deployment; synthetic data; documentation. No
source, route, schema, UI, token, dependency or workflow change.

**Non-goals:**

- snapshot retirement — six retained after success; the next separate,
  dependency-aware prompt, since older previews still name older snapshots
  and `snap_Feg5…` expires `2026-10-24T14:29:39Z`;
- a hosted refresh cadence — the GitHub Actions workflow stays
  simulation-only, and live use needs owner-held repository secrets and a
  separate decision; until one exists, a manual refresh is needed about
  every two days, which the record must say;
- the owner's decision on the nine leaky previews;
- the production plan decision and the eleven sign-offs.

Reverting the documentation commit does not revert Vercel state. Hosted
recovery follows §5.
