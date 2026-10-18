# Prompt 391 — adopt prepared scanner candidate on preview and prove upload → scan

## Scope and why this is next

Parent: Phase 12 managed-target operations, continuing approved Prompt 370.
Inspected baseline: `73c7047` on `main`, worktree clean. The code and
`git log` establish that Prompt 390's smoke-source fix (`bc3afe0`) and its
stage B record (`73c7047`) are committed. Its prompt file alone is not
implementation evidence.

`docs/vercel-deployment.md` ("Scanner smoke source fix — Prompt 390", stage B)
names the next gate: preview adoption of the **already prepared** candidate
`snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN` and the deployed upload → scan proof,
inside its signature window. Prompt 386 attempted this scope but stopped at
its own rebuild step. This prompt does **not** rebuild: the eligible receipt and
handoff bundle already exist. It consumes them, adopts three preview variables,
creates one preview deployment and proves clean and EICAR uploads through the
real application.

**Time constraint.** The candidate's `daily_sha256` (`f9cb69a8…44a2a2d5`)
equals Prompt 389's candidate, so both builds fetched the same `daily.cvd`.
The recorded reading is that the 48 h policy closes **no later than about
`2026-10-20T01:02Z`**; the true limit is the `daily.cvd` build time + 48 h,
which no receipt records, so it may be earlier. The adapter's own age check is
authoritative. Execution must begin with the window check in §1.7.

Approval authorizes only the preview actions below on the fixed free-tier
target. It does not authorize production, paid usage, a new snapshot build,
snapshot retirement, credential rotation, migrations or a push.

## Reference material read

- `AGENTS.md`: phase control, §2 workflow, §5 prompt contract, §§6–10.
- `docs/vercel-deployment.md`: "Resume here", fixed target, hosted gates A–E
  (Prompt 378 acceptance method), Prompts 385–390 records.
- `infra/vercel/runbooks/managed-operations.md` §5.4 (offline handoff) and §5.5
  (manual activation, verification and retirement).
- `prompts/386-scanner-preview-adoption-and-application-proof.md`: the prior
  adoption plan; its §§3–5 adoption, acceptance and recovery steps are reused
  here verbatim in intent, minus its rebuild step.
- Restricted custody listing (names and modes only, no contents read):
  `~/.config/acres/vercel-preview/prompt390-20261018T014336Z/` (0700) holding
  `receipt.json`, `candidate.env`, `handoff-stdout.json` and
  `handoff/{handoff.json,runtime.env}` (all 0600).
- Memory note `vercel-migration-resume`: Node 24 launcher, cached Vercel CLI
  path (`npx vercel@latest` can hang), zsh word-splitting, OIDC/Sandbox
  gotchas, protected previews via `vercel curl`.

Execution must additionally re-read, before use: `docs/operations.md` Prompt
386/390 records, `docs/security.md` upload/quarantine boundary,
`docs/authenticated-app.md` (session/CSRF bridge, uploads workspace),
`server/src/scanner/vercel-sandbox-scanner.adapter.ts`,
`server/src/uploads/uploads.controller.ts` and its DTOs,
`server/src/vercel/queue-consumer.middleware.ts`, root `vercel.json`,
`scripts/vercel/prepare-scanner-handoff.js` and `probe-platform.js`.

No visual change, comp crop or measurement is involved. Browser use proves
application behavior only.

## SKILLS USED

- `deployment-pipeline-design` — ordered config adoption, preview deploy, acceptance and rollback.
- `secrets-management` — restricted custody of previous config, bundle and session evidence; never print values.
- `vercel:vercel-cli` — verify `env update/add` stdin contract and `deploy` preview flags against the installed CLI before use.
- `vercel:env-vars` — preview-scoped variable precedence and branch overrides.
- `vercel:deployments-cicd` — immutable deployment inspection and identity binding.
- `vercel:vercel-sandbox` — Sandbox/Snapshot read-only inspection (`Snapshot.get`, `Sandbox.list`) and cleanup expectations.
- `vercel:queues` — correlating the new deployment's consumer with deliveries.
- `security-best-practices` — preserve preview isolation, tenant authorization and quarantine.
- `error-handling-patterns` — classify partial writes, build failures, scanner unavailability and inconclusive proof.
- `e2e-testing-patterns` — synthetic, isolated acceptance with durable terminal-state checks.
- `playwright` — real-browser login, workspace and direct-upload journey.
- `requesting-code-review` — independent read-only review of the records and diff.
- `receiving-code-review` — verify findings before acting.
- `caveman-commit` — the required local commit to `main`.

Preparation loaded none beyond reading their listings; execution must invoke
each before the step it governs. No Nest source, schema, workflow or UI change
is in scope, so `nestjs-best-practices`, `postgres-best-practices` and design
skills are deliberately not listed.

## 1. Re-establish target, toolchain and the window

1. Re-read this prompt and the owning records. `git status`, branch, HEAD;
   record the source SHA used for the deployment upload.
2. Node 24.21.0 per `.node-version` (launcher from the memory note); verify
   `node --version` both directly and inside `npm run`.
3. Vercel access: MCP if connected, else the cached CLI
   (`~/.npm/_npx/*/node_modules/vercel/dist/vc.js`). If signed out, report the
   exact `! …login` action and wait. Never print tokens.
4. Confirm by provider read: team `team_zE3mp7nrEZ6a7cxRavwUMYC4`, project
   `prj_q9ApajZWDgdYZetnm5s5oakEjrUD` (`acres`), Hobby, `iad1`, Node 24.x,
   private Blob `store_g2fmCH5CW7TJbkN3`, preview `DATABASE_URL` sensitive.
   Mismatch or a required paid capability stops all mutation.
5. Inspect the current **preview** scanner records — `SCANNER_PROVIDER`,
   `SCANNER_SANDBOX_SNAPSHOT_ID`, `SCANNER_MAIN_SHA256`, `SCANNER_DAILY_SHA256`,
   `SCANNER_MAX_SIGNATURE_AGE_HOURS` — with scope and any git-branch override.
   Prompt 386 saw `snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA`; treat that as a clue.
   Identify the latest Ready preview (`dpl_Hr9VwjL5…` last recorded).
6. Capture the previous values/scopes (including absence) into a new run
   directory `~/.config/acres/vercel-preview/prompt391-<UTC stamp>/` (0700,
   files 0600) as `previous-scanner.env` plus a names/scope JSON. Never print
   values; list names only.
7. **Window check (go/no-go).** Record current UTC. Proceed only if at least
   **3 hours** remain before `2026-10-20T01:00Z` (a judgement: adoption, one
   build and two scans with polling margin). Otherwise stop before mutation
   and report that a fresh candidate is needed (a separate prompt).

## 2. Validate the prepared bundle (offline, then one read-only provider check)

1. Recompute SHA-256 of `receipt.json` and `handoff/runtime.env`; compare to
   `handoff.json`'s recorded digests and to the record (`617255e0…2b7e9ff084`,
   `632f4634…92a4ad1e`). Parse `runtime.env` as data (exactly three
   `NAME=value` lines with the three runtime names; snapshot id matches
   `^snap_[A-Za-z0-9]+$`, hashes `^[0-9a-f]{64}$`). Never `source` it.
2. Confirm the receipt is live, target-bound, `candidate_ready` (the success
   status the producer writes; read the exact string from the script), with
   all four `smoke_test` statuses `passed`. Re-running the handoff CLI is not
   needed and would require a new output directory; do not overwrite.
3. Provider read: `Snapshot.get(snap_CARv…)` reports `created`, `iad1`,
   expiry `2026-10-26T01:44:56Z`. No create or delete call.
4. **Pre-adoption seam check, exactly one run:** `probe-platform.js scanner`
   against the candidate with `ACRES_SCANNER_MAX_SIGNATURE_AGE_HOURS=48`, using
   the env shape in "Resume here" but loading `ACRES_SCANNER_*` from the
   bundle's `candidate.env` as validated data. It must pass. A signature-age
   rejection means the window has already closed: stop before any env write
   and record it. This probe is a synthetic seam check, never application
   acceptance (runbook §5.5 step 3).

## 3. Adopt and deploy

1. Verify the installed CLI's env write syntax (`env update --help` /
   `env add --help`) and use stdin for values. Write only:
   `SCANNER_SANDBOX_SNAPSHOT_ID`, `SCANNER_MAIN_SHA256`,
   `SCANNER_DAILY_SHA256`, preview scope, preserving any branch scoping
   observed in §1.5. Leave `SCANNER_PROVIDER`, max-age (48) and every other
   variable untouched. After each write, read back privately and compare to
   the bundle value; record which writes succeeded. A failed write stops and
   triggers §5 before any deploy.
2. Verify `deploy --help`, then create **one** preview deployment from the
   clean HEAD with explicit `--scope`/project link, no `--prod`, no `promote`,
   no alias or domain change, default build machine. Record deployment ID,
   URL, source SHA, build completion time and that `api`, `jobs` and the
   client Services are present in `iad1`.
3. Bind identity: inspect the new deployment's resolved env for the API and
   `jobs` services (names plus private value comparison against the bundle).
   A project-level write or a Ready build alone is not proof.

## 4. Prove the deployed application (synthetic data only)

Reuse Prompt 378's gate C/D method where still valid. Read the relevant
route/DTO/bridge code before each request.

1. Browser (Playwright CLI) on the **immutable** deployment URL with Vercel
   Authentication intact (use the documented protected-preview access path;
   do not disable protection). Register a uniquely named synthetic account
   (e.g. `scanner-391-<stamp>@example.test`) through the normal flow, sign in,
   establish CSRF, select its organization; confirm `/app` SSR renders.
2. **Clean upload:** small synthetic CSV via the app's protocol — initiate,
   direct private Blob PUT, complete with real SHA-256 and byte count, unique
   idempotency key. Poll status with a bounded deadline (10 minutes, a
   judgement covering the ~5 min platform lease) to `accepted` / `clean`.
3. **EICAR upload:** a supported CSV-typed upload carrying the EICAR test
   string from the existing probe fixture, matching metadata/checksum, so the
   rejection comes from scanning. Require `rejected`/infected, no accepted
   download, no ingestion. Never print the signature or fixture bytes.
4. Correlate both uploads with their outbox rows, `DurableJob` terminal
   states and the **new deployment's** `jobs` consumer via runtime logs
   (`deploymentId`). Latest-alias traffic is not assumed. No manual job
   execution or ledger edits. Timeout = inconclusive, not success.
5. Scanner identity: the adapter checks `sourceSnapshotId` and both hashes
   before a clean verdict; combined with §3.3's resolved env, that infers the
   candidate was used. State this as an inference and its limits; bind real
   Sandbox source metadata too if `Sandbox.list` exposes it for the window.
6. Negatives through the application, not elevated SQL: anonymous fetch of
   both quarantined Blob objects fails; a second synthetic org cannot read
   either upload record.
7. Record owned artifacts (account, org, two uploads, Blob pathnames), and
   confirm no Sandbox residue from these scans. No bulk cleanup, no snapshot
   deletion.

Read-only DB inspection may supplement, using the preview `acres_app` URL from
`neon-urls.env` with transaction-local organization context; never print other
organizations' rows.

## 5. Failure handling and recovery

- Before mutation (access, target, window, bundle, seam probe): stop; nothing
  to restore.
- Partial env write: restore only the touched records from
  `previous-scanner.env` with the captured scope; verify privately. Delete a
  record only if this run created it.
- Deploy failure: keep the old deployment and all snapshots; restore the three
  preview records; record both outcomes. Restoring project vars does not
  change immutable deployments.
- Acceptance failure: stop synthetic work, keep both deployments and evidence,
  restore the three records if unchanged by others. No extra deployment, no
  weakening of max age or hashes, no job replay.
- The baseline snapshot's signatures are long past 48 h, so restoration
  preserves identity, not a working scanner. Say so.

## 6. Verification, records, review, commit

Local checks on Node 24.21.0, sequential, quoting real output and exit codes:

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

Format changed docs with the installed Prettier. Local checks never stand in
for hosted proof; a blocked hosted gate stays blocked in the record.

Records (documentation only unless a real defect is found, which gets its own
prompt):

- `docs/vercel-deployment.md`: new "Scanner preview adoption — Prompt 391"
  section; update the "Resume here" scanner bullet and the memory-facing
  "Next" line with the outcome.
- `docs/operations.md`: UTC window, inputs, digests, sanitized outputs,
  custody path, recovery actions, review.
- `infra/vercel/runbooks/managed-operations.md` §5.5: the verified adoption
  procedure and caveats; retirement stays separate.
- `docs/build-plan.md`, `docs/launch-checklist.md`: one concise line each; no
  category approval.

Tracked records may carry public target IDs, snapshot ID, hashes (truncated as
elsewhere), deployment ID/URL, timestamps and statuses. Cookies, credentials,
test identities, presigned URLs, raw logs and env values stay in the run
directory.

Then `requesting-code-review` (baseline `73c7047`, HEAD, sanitized evidence,
no credentials), `receiving-code-review`, re-review if significant, and a
local commit to `main` via `caveman-commit`. No push. Report the immutable
preview URL and how to inspect it (`vercel curl` / protected access).

## Impact, non-goals, remaining gates

Changes: three preview project variables, one new preview deployment,
synthetic test data, documentation. No source, route, schema, UI, token,
dependency or workflow change.

Non-goals: rebuilding a candidate (window lost → separate prompt), production
deployment/promotion, plan decision, Resend/domain, snapshot retirement of
`snap_KtLd…`, `snap_rz0cs…` or baseline `snap_Feg5…` (expires
`2026-10-24T14:29:39Z`), hosted scheduled cadence, retirement controller,
eleven launch sign-offs. Successful adoption proves one bounded preview
operation only; dependency-aware retirement, hosted cadence, the free-tier
lifecycle budget and the production decision remain open.

Reverting the documentation commit does not revert Vercel state; hosted
recovery follows §5 and the captured baseline.
