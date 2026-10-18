# Prompt 390 — scanner smoke-source fix, smoke diagnostics, and one confirmed rebuild

## Scope and why this is next

Parent: Phase 12 managed-target operations, continuing approved Prompt 370.
Inspected baseline: `c8e80cf` on `main` (`docs(ops): record scanner rebuild
389`), worktree clean when this prompt was prepared. This prompt file alone
proves nothing; resolve state from the repository and `git log`.

`docs/vercel-deployment.md` ("Scanner rebuild — Prompt 389 stages B–C") names
the next gate: "classify smoke-stage provider errors the way Prompt 389
classifies build errors. Then either one `probe-platform.js scanner` run
against the new candidate, or one more rebuild." Prompt 389 stage C built
`snap_KtLdaJeG4SaLAwi4mI8G8XzURZat` and then failed `candidate_smoke_failed`
with both samples `untested` and `cleanup: "passed"`.

**Preparing this prompt found the probable cause in source, before any new
cloud call.** `smokeTestSnapshot` in
`scripts/vercel/rebuild-scanner-cadence.js:183-247` creates its sandbox with
a **top-level** `snapshotId`:

```js
sandbox = await sdk.Sandbox.create({
  ...credentialsFor(config),
  snapshotId,                 // ← not a create parameter in SDK 3.8.0
  region: config.region,
  timeout: 120_000,
  networkPolicy: "deny-all",
});
```

`node_modules/@vercel/sandbox/dist/sandbox.d.ts:202-209` (SDK **3.8.0**)
defines the snapshot variant of `CreateSandboxParams` as
`Omit<BaseCreateSandboxParams, "source"> & { source: { type: "snapshot";
snapshotId: string }; runtime?: never; image?: never }`. There is no top-level
`snapshotId`. Every working caller uses `source`:
`scripts/vercel/probe-platform.js:810-822` (the hosted-proven probe) and
`server/src/scanner/vercel-sandbox-scanner.adapter.ts:107-114` (the
hosted-proven app adapter), both also with `persistent: false`,
`resources: { vcpus: 1 }`, and a `sourceSnapshotId` check after create.

Reading (a judgement from the source, not a hosted measurement): the SDK
ignored the unknown key. The smoke VM booted the default image, which has no
ClamAV and no `/var/lib/clamav`, and an exception was then thrown from
`writeFiles`, the first `runCommand("clamscan")` or its stdout read. That
fits `untested` + `cleanup: "passed"` exactly. The smoke stage has never
passed live: `git log -L` shows `smokeTestSnapshot` unchanged since
`2d5e449`/`2faafcb`, and no recorded receipt has a passing smoke. The spec's
fake SDK hides the defect: `rebuild-scanner-cadence.spec.js:45` decides
"builder vs probe" by `!options.snapshotId`, which encodes the wrong shape.

It also means the smoke VM was **persistent by default** (memory/record:
`Sandbox.create` is persistent unless `persistent: false`). Prompt 389's post-run
listing showed no extra snapshot, so no residue resulted, but the omission is
a defect.

So this prompt has two stages:

- **A — local fix and diagnostics (no cloud calls).** Correct the smoke
  create shape to match the proven probe/adapter. Add the source check and the
  signature-hash check the probe and adapter already run. Classify smoke-stage
  failures with Prompt 389's safe provider shape. Make the fake SDK model the
  real parameter contract. Tests, review, commit.
- **B — at most one live rebuild**, only after A is committed and the user
  answers yes to the exact §B question in the same session. Success →
  offline handoff bundle only (no adoption). Failure → record the new
  `smoke_failure` and stop.

**Why rebuild rather than probe the existing candidate.** A
`probe-platform.js scanner` run against `snap_KtLd…` would prove the
candidate scans, but it emits no cadence receipt. `prepare-scanner-handoff.js`
accepts only a successful cadence receipt, and the 389 receipt is permanently
`failed`. Adoption therefore needs a successful receipt, which only a rebuild
produces. Per Prompt 389 stage B, one rebuild costs about two sandbox
creations and under a minute of active CPU, far inside Hobby. Snapshot Storage goes from about 1.38 GB to about
1.84 GB of 15 GB.

**Time pressure (does not relax any gate).** Baseline
`snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA` expires `2026-10-24T14:29:39.778Z` and
its signatures are already past the 48 h policy. The Prompt 389 candidate's
signatures pass the policy no later than about `2026-10-20T01:00Z`. The
`preview.env` OIDC token pulled in Prompt 389 expires `2026-10-18T13:01:05Z`.

**Approval of this prompt authorizes:** stage A's local code/test/doc change
and its commit. It also authorizes read-only provider inspection (exact
snapshot IDs by `Snapshot.get` or the Vercel MCP snapshot listing, project
sandbox listing, `whoami`, `project inspect`) before and after stage B, plus
at most one `vercel env pull --environment=preview --yes` refresh into the
existing 0700 secrets directory. Only after the stage B confirmation, it
authorizes exactly one live cadence-producer invocation (its builder sandbox
and its smoke sandbox) on the fixed free-tier preview target, and offline
handoff validation of that receipt. It does **not** authorize env-variable
writes, deployment, adoption, browser/application acceptance, snapshot
deletion or retirement (including `snap_rz0cs…` and `snap_KtLd…`), a second
rebuild, a `probe-platform.js` live run, workflow dispatch, production, paid
usage, plan changes, credential rotation, Chrome automation, or a push.

## Reference material read

- `AGENTS.md` §§2, 3, 5–7, 10; memory `vercel-migration-resume`.
- `docs/vercel-deployment.md`: "Resume here" (fixed target, access, Node 24
  launcher, scanner proof commands), "Scanner create diagnostics — Prompt
  389", "Scanner rebuild — Prompt 389 stages B–C".
- `docs/operations.md` "Prompt 389 — scanner create diagnostics" through
  "Stage B–C checks and review" (custody `prompt389-20261018T010113Z`, receipt
  SHA-256 `1fd4d2df…e766e36`, interpretation).
- `prompts/389-scanner-create-cause-and-gated-rebuild.md` §§A, C and
  `prompts/388-bounded-scanner-candidate-rebuild.md` §§1–4b (the live
  procedure stage B reuses).
- `infra/vercel/runbooks/managed-operations.md` §5.1–5.4 (candidate
  preparation, `build_failure` fields, handoff).
- Source read for this prompt:
  - `scripts/vercel/rebuild-scanner-cadence.js:1-31` (imports, `SCAN_DIR`,
    `CONTROL_TIMEOUT_MS`), `:183-247` `smokeTestSnapshot`, `:249-355`
    `rebuildCadence` (`stage`, the catch at `:327-336`, `smoke_test`
    projection at `:335`).
  - `scripts/vercel/build-scanner-snapshot.js:76-111` (`FAILURE_STEPS`, already
    containing builder-internal `smoke-*` steps, which are a different stage),
    `:113` `providerClasses` (`AsyncLocalStorage`), `:144-187`
    `instanceOf`/`classifyProviderError`, `:189-205` `projectBuildFailure`,
    `:426` `buildSnapshot` opening the class scope, `:687` export of
    `classifyProviderError`.
  - `scripts/vercel/probe-platform.js:752-753` (`SANDBOX_TIMEOUT_MS` 120 000,
    `CLEANUP_TIMEOUT_MS` 30 000), `:759-773` `ADAPTER_SCAN_FLAGS`/`scanShape`,
    `:775-798` `cleanupSandbox`, `:800-833` `sandboxRunner` (the proven create
    shape and source check), `:836-861` `runChecked`/`signatureCheck`/
    `signaturesOk`, `:913-958` `probeScanner`, `:1304-1325` exports.
  - `scripts/vercel/prepare-scanner-handoff.js:110-135` (`smoke_test` keys
    must all be `"passed"`; failed receipts rejected).
  - `scripts/vercel/rebuild-scanner-cadence.spec.js:28-150` (the fake SDK),
    `:395-500` (smoke success/failure tests), `:796`, `:1065`, `:1380`
    (other fakes keyed on `params.snapshotId`).
  - `server/src/scanner/vercel-sandbox-scanner.adapter.ts:100-150, :217`
    (proven create shape, source check, `deleteOrphanSnapshots: true`).
  - `node_modules/@vercel/sandbox` 3.8.0 `dist/sandbox.d.ts:21-135, 202-209`.

## SKILLS USED

- `vercel:vercel-sandbox` — confirm `Sandbox.create` snapshot-source params,
  `persistent`, `sourceSnapshotId` and `delete` options against the installed
  SDK 3.8.0 and current docs before editing.
- `error-handling-patterns` — first-failing-step attribution, keeping the
  primary outcome and cleanup independent, diagnostics never changing status.
- `secrets-management` — OIDC custody (0700/0600), names-only listing, no
  token, message, body or stdout ever crossing the receipt/CLI boundary.
- `javascript-testing-patterns` — make the `node:test` fake enforce the real
  create contract; table-driven smoke failure cases; leak canary.
- `vercel:vercel-cli` — read-only `whoami`/`project inspect` and the one
  `env pull` refresh, verified from the installed CLI's `--help`.
- `deployment-pipeline-design` — the A → B gate, stop on failure, no retry.
- `requesting-code-review` — independent review of stage A's diff and of the
  stage B record.
- `receiving-code-review` — verify findings against source before acting.
- `caveman-commit` — the stage A commit and the stage B record commit.

## A. Local fix and diagnostics (no cloud calls)

### A.1 Correct the smoke create shape — `rebuild-scanner-cadence.js`

Replace the `Sandbox.create` call in `smokeTestSnapshot` with the shape the
probe and adapter prove hosted:

```js
sandbox = await sdk.Sandbox.create({
  ...credentialsFor(config),
  source: { type: "snapshot", snapshotId },
  region: config.region,
  persistent: false,
  networkPolicy: "deny-all",
  timeout: 120_000,
  resources: { vcpus: 1 },
  signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
});
if (sandbox.sourceSnapshotId !== snapshotId) → fail at step "smoke-source"
```

- Verify `signal` is in `BaseCreateSandboxParams` (it is, at `sandbox.d.ts`
  around `:126`) before using it. `CONTROL_TIMEOUT_MS` (30 s) matches the
  adapter's create deadline class; if the execution session finds the adapter's
  `CREATE_TIMEOUT_MS` differs, use the adapter's value and say so.
- **Cleanup:** keep `delete()` only (no `stop()`), but set
  `deleteOrphanSnapshots: true`, matching the recorded rule that scan VMs use
  `true` and only the builder uses `false`. Probe gate `baseSnapshotSurvived`
  and the adapter prove that `true` never deletes the source snapshot. With
  `persistent: false` no orphan should exist, so `true` is
  defence in depth. Then add one read-only `sdk.Snapshot.get` of the candidate
  after delete. If its status is not `"created"`, the smoke fails at
  `smoke-cleanup` with `cleanup: "failed"`. Do **not** add the probe's 30 s
  pause: the builder confirmed the snapshot before smoke, so a later loss is
  the signal this check exists for. A judgement, recorded as one.

### A.2 Signature-hash check inside the smoke

After the source check, before `writeFiles`, run the same signature check the
probe and adapter run, so a passing receipt certifies that the exported
`main_sha256`/`daily_sha256` match the snapshot's contents:

- Extend `signatureCheck(config, overrides)` in `probe-platform.js` with an
  optional `overrides.dailySha256` (today only `mainSha256`, `maxAgeHours` and
  `dir` are overridable). This must not change existing call sites; cover it
  in `probe-platform.spec.js`.
- In `smokeTestSnapshot(config, sdk, snapshotId, { mainSha256, dailySha256,
  maxAgeHours })` run `runChecked(sandbox, signatureCheck(config, { mainSha256,
  dailySha256, maxAgeHours }))` and require `signaturesOk`. `rebuildCadence`
  passes `summary.main.sha256`, `summary.daily.sha256` and `opts.maxAgeHours`.
  Import `signatureCheck`, `signaturesOk` and `runChecked` (export
  `runChecked` if it is not exported; check `:1304-1325`).
- Add `signatures: "untested" | "passed" | "failed"` to `smoke_test`, placed
  first. In `prepare-scanner-handoff.js` require it to be `"passed"` alongside
  the existing three keys. This is a strengthening: an older success receipt
  without the key is rejected. No such receipt exists (none has ever passed
  smoke), and this must be stated in the record.

### A.3 Smoke-stage failure classification

Add a receipt field `smoke_failure`, present **only** on receipts whose
`error` is `candidate_smoke_failed`:

| field             | values                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `step`            | first failing step: `smoke-create`, `smoke-source`, `smoke-signatures`, `smoke-write`, `smoke-scan-clean`, `smoke-scan-eicar`, `smoke-cleanup`; else `unknown` |
| `kind`            | `provider_failed` (an exception at that step), `result_failed` (the call returned but the result was wrong: exit code, shape, source mismatch, signature check, post-delete status) |
| `provider_error`  | as Prompt 389, only when `kind` is `provider_failed`, else `null`                                                                                       |
| `provider_status` | as Prompt 389, else `null`                                                                                                                              |
| `provider_code`   | as Prompt 389, else `null`                                                                                                                              |

- Reuse `classifyProviderError` from `build-scanner-snapshot.js` (already
  exported). Pass `{ APIError: sdk.APIError, StreamError: sdk.StreamError }`
  explicitly; the smoke runs outside `buildSnapshot`'s `AsyncLocalStorage`
  scope, so do not read `providerClasses`. Never read `message`, `stack`,
  `text`, `cause`, stdout bodies or headers.
- Track the current step in a local variable updated before each call. Wrap
  only the provider calls; result checks set `kind: "result_failed"` without
  throwing raw data.
- **Precedence:** the first failure wins. A cleanup failure after a passing
  primary sets `step: "smoke-cleanup"`. A cleanup failure after a primary
  failure leaves `step` on the primary and is visible only in
  `smoke_test.cleanup: "failed"`.
- `rebuildCadence`'s catch (`:335`) copies `error.smokeFailure ?? { step:
  "unknown", kind: "unknown", provider_error: null, provider_status: null,
  provider_code: null }` into `receipt.smoke_failure` when `stage === "smoke"`.
  Success, skip, simulation, build-failure and configuration-export-failure
  receipts carry no `smoke_failure`. Schema stays `schema_version: 1`: the
  field is additive and lives only on failed receipts, which handoff already
  rejects.

### A.4 Fake SDK enforces the real create contract

In `rebuild-scanner-cadence.spec.js` (and the other fakes at `:796`, `:1065`,
`:1380`):

1. Classify a create as a smoke/probe VM by
   `options.source?.type === "snapshot"`, never by `options.snapshotId`.
2. Make every fake `Sandbox.create` **throw** `TypeError("unknown create
   parameter: snapshotId")` when a top-level `snapshotId` key is present, so
   the old shape can never pass again.
3. Return `sourceSnapshotId` equal to `options.source.snapshotId` (with an
   option to return a different id for the mismatch case), and respond to the
   signature-check `node` command with `signatures-ok`, or not, under an option.
4. Assert the smoke create's parameters exactly (`deepEqual` minus
   credentials and `signal`): `source`, `region`, `persistent: false`,
   `networkPolicy: "deny-all"`, `timeout: 120000`, `resources: { vcpus: 1 }`;
   and that delete received `deleteOrphanSnapshots: true`.

### A.5 Tests

1. Success: `smoke_test` is `{ signatures, clean_sample, eicar_sample,
   cleanup }` all `"passed"`, no `smoke_failure`, and handoff accepts the
   receipt (existing handoff success path updated for `signatures`).
2. Regression: reverting the create to a top-level `snapshotId` makes the
   success test fail (verify by temporarily reverting locally once; do not
   commit the revert; record that it was done).
3. Table of smoke failures, each asserting the exact `smoke_failure` and
   `smoke_test`, a `candidate_smoke_failed` error, the candidate retained, the
   previous snapshot not deleted, and handoff rejecting the receipt:
   - create throws a real SDK `APIError` 429 `rate_limited` → `smoke-create`
     / `provider_failed` / `api_error` / 429 / `rate_limited`, and
     `cleanup: "not_requested"`;
   - source mismatch → `smoke-source` / `result_failed`, cleanup `passed`;
   - signature check missing `signatures-ok` → `smoke-signatures` /
     `result_failed`, `signatures: "failed"`;
   - `writeFiles` throws a `StreamError` `sandbox_stopped` → `smoke-write` /
     `stream_error` / `sandbox_stopped`;
   - clean `runCommand` throws `TypeError("fetch failed")` →
     `smoke-scan-clean` / `transport`;
   - clean scan exit 2 → `smoke-scan-clean` / `result_failed`,
     `clean_sample: "failed"`;
   - EICAR scan returns OK → `smoke-scan-eicar` / `result_failed`;
   - all pass, delete throws → `smoke-cleanup` / `provider_failed`,
     `cleanup: "failed"`;
   - all pass, post-delete `Snapshot.get` returns `deleted` →
     `smoke-cleanup` / `result_failed`, `cleanup: "failed"`;
   - EICAR scan fails **and** delete throws → step stays `smoke-scan-eicar`,
     `cleanup: "failed"`.
4. Leak canary: a `credential-canary` string in the `APIError` status text,
   message, body text and body message, and in a scan's stdout, appears nowhere
   in the receipt, stdout, stderr or `error.stack` (mirror the Prompt 389
   canary test).
5. Non-smoke receipts (success, skip, simulation, build failure, export
   failure) have no `smoke_failure`.
6. `signatureCheck` with `dailySha256` override; existing callers unchanged.

### A.6 Docs for stage A

- `infra/vercel/runbooks/managed-operations.md` §5.1/§5.2: the corrected
  smoke (snapshot source, non-persistent, source and signature checks,
  post-delete confirmation), the `smoke_failure` fields and values, the new
  `signatures` key, and that the fields never certify cause, success or
  cleanup.
- `docs/vercel-deployment.md`: a "Scanner smoke source fix — Prompt 390"
  section. Update the Resume-here scanner bullet (the list header naming the
  sub-prompts may gain "…, Prompt 390 = smoke source fix" only if the header
  is already being touched; do not rewrite it).
- `docs/operations.md`: a Prompt 390 record with the real check output.

### A.7 Checks, review, commit

Use the Node 24.21.0 launcher from "Resume here" (`npm exec -- node
--version` must print `v24.21.0`). Run and quote:

```bash
node --test scripts/vercel/build-scanner-snapshot.spec.js \
  scripts/vercel/rebuild-scanner-cadence.spec.js \
  scripts/vercel/prepare-scanner-handoff.spec.js \
  scripts/vercel/probe-platform.spec.js
npm run vercel:probe-test
npm run lint
npm run typecheck
node scripts/vercel/rebuild-scanner-cadence.js --help
node scripts/vercel/rebuild-scanner-cadence.js --dry-run   # simulation, no smoke_failure
git diff --check
```

`npm run build` is not required (no workspace source changes); state that it
was skipped and why. Then `requesting-code-review` (BASE `c8e80cf`, HEAD the
stage A candidate) with this prompt's §A as the requirement. Evaluate with
`receiving-code-review`, fix, re-run the checks, and commit with
`caveman-commit` (e.g. `fix(ops): boot scanner smoke from snapshot`). Stage A
is complete and committed before stage B is asked.

## B. At most one live rebuild

Preconditions, all read-only:

1. Worktree clean, `main`, `HEAD` = the stage A commit (or its record commit).
2. Read-only MCP or SDK snapshot listing: baseline, `snap_rz0cs…` and
   `snap_KtLd…` present and `created`; no named sandboxes. Sandbox usage is
   not re-requested from the owner. Prompt 389 stage B reported 28/5,000
   creations and 7 m/5 h CPU, and the one 389 run added two creations and
   under a minute. If any pause or limit signal appears anywhere (a create
   `api_error` 402/429 in the receipt is one), stop.
3. Check the `preview.env` OIDC `exp` locally (print only the `exp` timestamp
   and the owner/project claim match booleans). If under 75 min remain, run
   the one authorized `env pull` and check again.

Then ask exactly:

`Smoke fix is committed. Run the single scanner candidate rebuild now?`

On yes, follow `prompts/388-bounded-scanner-candidate-rebuild.md` §§1–4b
verbatim, with Prompt 389 §C's differences, and these:

- custody directory `~/.config/acres/vercel-preview/prompt390-<UTC stamp>/`
  (0700, files 0600); never touch `prompt386-*`, `prompt388-*`, `prompt389-*`;
- `env -i` with only the OIDC token and the fixed target variables, and a
  2,100 s outer deadline, as in 389;
- `--current-snapshot-id` stays the baseline `snap_Feg5…` (the receipt's
  `previous_snapshot_id`), as in 388/389;
- on **success**: `prepare-scanner-handoff.js` offline bundle only (388
  §4a). Record `new_snapshot_id`, both hashes, `smoke_test`, expiry, and the
  receipt and bundle SHA-256. No adoption, env write or deployment;
- on **failure**: record the allowlisted receipt fields including
  `build_failure` or `smoke_failure` and their plain reading (Prompt 389's
  reading guide; `result_failed` at `smoke-scan-*` = the candidate booted but
  scanned wrongly; at `smoke-source` = wrong boot source), stated as a
  reading of the classification, not a certified cause. Post-run read-only
  inspection; stop. No retry.

Post-run in both cases: read-only snapshot listing (expect one more
`created` snapshot in `iad1`, no named sandboxes), and confirm the three earlier
snapshots are still `created`.

Record stage B in `docs/operations.md` and `docs/vercel-deployment.md`
(including the Resume-here scanner bullet's next gate), update the memory
file's scanner status line, review the record diff
(`requesting-code-review` / `receiving-code-review`), and commit with
`caveman-commit` (e.g. `docs(ops): record scanner rebuild 390`).

## Impact, non-goals and remaining gates

- Routes: none. No application, client, server or `vercel.json` change. Only
  `scripts/vercel/rebuild-scanner-cadence.js`, `probe-platform.js`
  (`signatureCheck` override, a possible `runChecked` export),
  `prepare-scanner-handoff.js` (the `signatures` key), their specs, the
  runbook and the two records.
- Non-goals: adoption into project env vars, deployment, application
  upload → scan proof, snapshot retirement or storage cleanup (all four
  snapshots are retained; retirement is dependency-aware and separately
  approved), cadence workflow dispatch, production/Cron, plan upgrade,
  Resend, and any change to the builder-internal `smoke-*` steps in
  `build-scanner-snapshot.js` (those passed live in 389).
- Still open after this prompt even on success: preview adoption of the new
  candidate and the deployed application proof (a later prompt, which must
  happen before the candidate's 48 h signature window closes), retirement of
  superseded snapshots, hosted cadence, the production plan decision and all
  eleven launch sign-offs.
- Rollback: stage A is one revertable commit. `smoke_failure` is additive and
  only on failed receipts. The `signatures` handoff requirement can be
  reverted with it. Stage B creates at most one retained snapshot, which
  expires on its own after 8 days.
