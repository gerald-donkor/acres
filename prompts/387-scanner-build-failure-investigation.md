# Prompt 387 — scanner build failure investigation

## Scope and why this is next

Parent: Phase 12 managed-target operations, continuing approved Prompt 370.
Preparation baseline: `ae13d37d5517cda434bed13e395e0c74a51b3702` on `main`.
The worktree was clean before this prompt was written. Commit `ae13d37`
records the blocked Prompt 386 attempt; `5247e37` implements the offline
configuration handoff. These commits and source, rather than prompt existence,
establish the starting state.

Prompt 386's one authorized rebuild returned `candidate_build_failed` after
the cadence wrapper observed candidate `snap_rz0cs8Nnw1RObI3ZDS5WRKDSUR2y`.
It produced no returned CVD hashes or cadence smoke/cleanup result, and stopped
before configuration adoption. Subsequent inspection found the snapshot
`created`; that does not make its failed receipt eligible for handoff.

The next dependency-safe unit is a bounded investigation of that failure and
local diagnostics that preserve a safe, actionable failed substep. Inspect
retained evidence and read-only provider metadata; reproduce plausible failure
paths with SDK doubles; improve builder-to-cadence failure reporting. Establish
what the historical evidence proves and what remains unknown. Do not consume
another live rebuild allowance to discover the error.

Approval authorizes the local source/tests/documentation changes below and
target-scoped read-only inspection of the existing failed attempt. It authorizes
no new sandbox, snapshot, live scan, configuration write, deployment, deletion,
paid feature, workflow dispatch or push. The investigation can finish with the
historical root cause unresolved if provider evidence cannot distinguish it;
the diagnostic improvement and its regressions must still be completed.

## Reference material read

- `AGENTS.md`: phase control, prompt contract, review/commit workflow and §§6–10.
- `docs/build-plan.md`: Phase 12, managed amendment, Prompts 384–386.
- `docs/project-status.md`, `docs/skills.md`.
- `docs/operations.md`: operating contract and Prompt 386 execution/check record.
- `docs/vercel-deployment.md`: managed scanner lifecycle, Prompt 385 handoff and
  Prompt 386 baseline/failure/provider inspection.
- `docs/system-architecture.md`: production-target amendment and module boundaries.
- `docs/security.md`: operator evidence, diagnostic privacy and TM-15 controls.
- `docs/launch-checklist.md`: scanner gates and distinction between local tests,
  hosted verification and launch approval.
- `docs/operator-handoff.md`: bounded evidence access and restricted custody.
- `infra/vercel/README.md` and
  `infra/vercel/runbooks/managed-operations.md` §5.
- `scripts/vercel/build-scanner-snapshot.js` and its `.spec.js`.
- `scripts/vercel/rebuild-scanner-cadence.js` and its `.spec.js`.
- `scripts/vercel/prepare-scanner-handoff.js`: failed-receipt rejection and
  allowlisted output reconstruction.
- `package.json`, `.node-version`.
- Installed `node_modules/@vercel/sandbox/package.json` (3.8.0),
  `dist/snapshot.d.ts`, `dist/snapshot.cjs`, `dist/sandbox.cjs`.

The installed SDK verifies that `snapshot()` stops its sandbox, `Snapshot.get`
returns an object whose `expiresAt` getter yields `Date | undefined`, and
`Sandbox.delete({ deleteOrphanSnapshots: false })` preserves snapshots. None of
these facts identifies the historical exception. Read the relevant installed
declarations/implementation again before using any provider API. No dedicated
Vercel operations skill is exposed in this session; installed SDK/CLI sources
must verify the exact operations. No Next.js API or application component is
being written, so no framework change is implied.

No visual surface changes or measurements are planned. Static comps, crop
measurements, motion recordings and breakpoint adjustments are inapplicable.

## SKILLS USED

- `deployment-pipeline-design` — preserve the candidate, cleanup, adoption and deployment gates while investigating the failed preparation stage.
- `error-handling-patterns` — explicit safe failure classification, primary-error preservation and independent cleanup outcomes.
- `secrets-management` — designated credential use, restricted evidence handling and zero raw provider-error disclosure.
- `security-best-practices` — apply the existing credential/logging boundary; no standalone Node CLI reference is installed, so verify scripting APIs locally.
- `architecture-patterns` — keep provider diagnostics inside standalone tooling and preserve application/runtime boundaries.
- `javascript-testing-patterns` — deterministic Node test doubles and adversarial regression coverage for failure propagation.
- `e2e-testing-patterns` — distinguish mocked CLI integration from hosted scanner/application acceptance; no new browser journey is in scope.
- `requesting-code-review` — dispatch the mandatory independent reviewer after self-verification.
- `receiving-code-review` — verify feedback against source and evidence before fixes.
- `caveman-commit` — write the required local Conventional Commit to main.

Preparation loaded the first seven skills. Execution must reload all applicable
skills, including the three implementation-completion skills. This focused unit
does not edit Nest modules, SQL, workflow YAML, telemetry, SAST, frontend or
browser automation; their broader Phase 12 skills do not expand this scope.
If external documentation becomes necessary, load the available Firecrawl
workflow and use official provider sources, rather than inventing a capability.

## 1. Re-establish evidence and access boundaries

1. Re-read this prompt and owning records; inspect branch, status, HEAD and
   relevant history. Preserve unrelated changes. Use `.node-version` Node
   24.21.0 and verify the runtime used directly and by npm subprocesses.
2. Inspect only the designated Prompt 386 run directory
   `~/.config/acres/vercel-preview/prompt386-20261017T180051Z` and the previously
   designated Vercel authentication mechanism. Do not enumerate unrelated home
   directories, accounts, credentials, environment records or evidence stores.
3. Identify the retained failure receipt without dumping directory contents or
   secret-bearing files to chat. Verify its bytes against the recorded SHA-256
   `1dd5a4bff056409185d6307c817fc7de8862e1c01f65bdf527a1e48283f25557`.
   Inspect only allowlisted attempt fields, timestamps and provider identities.
   Never overwrite the original receipt or reconstruct a success receipt.
4. Keep new raw inspection artifacts outside git, in a fresh restricted run
   directory with directory mode 0700 and file mode 0600. Use `/tmp` for local
   scratch when durable custody is unavailable; label it as scratch. Do not
   claim that local storage is an approved production evidence store.
5. Reuse the existing authorized identity without printing/copying its token.
   Read-only target: preview team `team_zE3mp7nrEZ6a7cxRavwUMYC4`, project
   `prj_q9ApajZWDgdYZetnm5s5oakEjrUD`, region `iad1`. Reject a mismatch.
   Do not retrieve any environment secret, including bulk `decrypt=true` reads.
6. Inspect existing failed candidate `snap_rz0cs8Nnw1RObI3ZDS5WRKDSUR2y`
   and baseline `snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA` by exact ID. Allowlist
   status, ID, region, creation/update/expiry and source-session reference.
   Only if supported by verified installed APIs, inspect metadata/events for
   that exact source session or attempt-bound sandbox. Never resume it, run
   commands in it or create a sandbox from the candidate. A narrowly filtered
   project inventory may establish whether that attempt's builder remains;
   do not list unrelated project resources or fetch customer files/logs.
7. Timestamp every observation and distinguish historical from current state.
   Expiration/deletion/404 now does not establish its state at the failed call.
   Missing logs, unavailable session history, access denial or ambiguous
   cleanup must remain explicit. If hosted access is unavailable, record the
   precise limitation and continue independent local implementation/tests.

## 2. Reconstruct the failure path without a live retry

Trace `buildSnapshot()` and the cadence wrapper in execution order. A confirmed
snapshot ID means the wrapper observed a resolved snapshot result; subsequent
builder deletion, metadata lookup/status checking and summary construction are
the immediate investigation targets. The receipt's null hashes do not prove
that signature acquisition failed, because hashes are assigned only after the
builder returns successfully. Similarly, an empty later inventory does not
retroactively certify the delete call.

Build a short evidence table: candidate failure path, relevant source branch,
available observation, whether reproduced locally, and historical conclusion
(proven / excluded by evidence / unresolved). Cover at least builder deletion
failure, metadata lookup rejection/timeout, non-created metadata and summary
serialization/getter failure. Add another path only when source/evidence
justifies it. Do not select a root cause from the outer stage code alone.

Use deterministic injected SDK failures to reproduce these branches. Do not
change success requirements, remove the `created` check, add blind retries,
treat 404 as cleanup success, relax signature checks or bypass the handoff
validator to make the candidate usable. A provider metadata schema discrepancy
may be fixed here only if independently verified against installed sources and
reproduced; unrelated lifecycle redesign requires a separate prompt.

## 3. Preserve safe builder diagnostics through cadence

Primary implementation paths:

- `scripts/vercel/build-scanner-snapshot.js`
- `scripts/vercel/rebuild-scanner-cadence.js`
- their existing `.spec.js` files

Keep this an additive failure-observability change. Use a small structured
builder failure/progress representation, projected through a single allowlist.
Do not parse error messages or copy arbitrary SDK objects into receipts.

1. Record a fixed failed step for provider operations and existing command
   steps. Explicitly distinguish builder creation, snapshot request, builder
   cleanup, snapshot metadata lookup, metadata status validation and summary
   construction. Preserve existing command-step identities where useful.
2. Add a nullable `build_failure` object to failed **build-stage** cadence
   receipts only. Its public contract is:
   - `step`: one of fixed source-owned step names, with `unknown` fallback;
   - `kind`: `command_failed`, `provider_failed`, `validation_failed` or
     `unknown`, assigned by the tool's own operation boundary;
   - `builder_cleanup`: `not_requested`, `passed`, `failed` or `unknown`;
   - `snapshot_confirmed`: a boolean consistent with a validated confirmed ID.
     Do not use provider-owned error text/class names as enum values. Do not
     include raw messages, stacks, `cause`, command stdout/stderr, URLs, paths,
     headers, credentials or response bodies. HTTP/error-code metadata is not
     needed for this unit. Define and test projection before adding fields.
3. Preserve `error: "candidate_build_failed"`, schema version 1, target binding,
   confirmed `new_snapshot_id`, nonzero failure exit and retained snapshots.
   Leave hashes/smoke unset if the normal builder result was not returned.
   Failure diagnostics certify neither CVD health nor preparation success.
4. Track cleanup separately from the primary failure: an installation/snapshot
   failure followed by delete failure must retain both the original failed
   step and `builder_cleanup: "failed"`. Successful builder work followed by
   delete failure remains a failed preparation. A stop attempt alone is not
   successful deletion. No result may turn failed/unknown cleanup into passed.
5. Wrap asynchronous SDK and output-reading failures at the operation where
   they occur so they do not silently fall into an unhelpful outer bucket.
   Unknown exceptions still receive fixed safe fields. Do not spread or JSON
   serialize an exception. Diagnostic projection itself must not mask the
   original failure or prevent attempted cleanup.
6. Keep success/skipped/simulation receipt shapes and handoff compatibility
   unchanged; do not add a failure-shaped field to successful receipts.
   `prepare-scanner-handoff.js` must continue to reject every failed receipt.
   No changes to handoff acceptance criteria are authorized.
7. The standalone builder's executable error handler currently prints
   `BuildError.detail`; truncation is not sanitization. Route its failure
   reporting through the same fixed projection so injected provider/command
   diagnostics cannot escape via the other CLI. Preserve useful fixed step
   messages and existing successful summary behavior. Do not broaden into its
   unrelated `--replace` or output-path contracts.
8. Keep deadlines, fixed target guards, package integrity pin, egress policy,
   CVD/signature/smoke validation, scrub order and
   `deleteOrphanSnapshots: false`. No automatic snapshot retirement, provider
   retries, persistent-builder fallback, resource increase or SDK upgrade.

## 4. Meaningful regression cases

Use existing `node:test` and SDK doubles; no dependency installation or network
is needed. Test behavior across the builder/cadence boundary, not just enum
helper output:

- Resolved snapshot followed by failed builder delete: failed receipt retains
  confirmed ID, reports cleanup failure, exports no configuration, does not
  proceed to cadence smoke, deletes no snapshot.
- Snapshot metadata lookup rejection/timeout after successful deletion: reports
  metadata step with cleanup passed, retained ID and failed preparation.
- Non-created or malformed metadata/throwing metadata getter: distinct safe
  validation/summary outcome without assuming provider eventual consistency.
- Failure before snapshot resolution: no fabricated confirmed ID; cleanup is
  attempted for an owned builder and its actual outcome is represented.
- Primary failure plus cleanup failure: both survive; neither masks the other.
- Create rejection: cleanup not requested and no unowned resource deletion.
- Command/output-reader failure and arbitrary SDK error: fixed classification,
  nonzero outcome, no raw values in JSON/stdout/stderr from either executable.
  Inject sentinel credentials, absolute private paths, URLs, multiline text and
  nested error content to prove the suppression boundary.
- Success still reaches separate cadence clean/EICAR smoke and normal handoff;
  skipped/simulation behavior stays credential-free and exports no configuration.
- Failed diagnostic receipt remains ineligible for offline handoff, even with
  a syntactically valid candidate ID and later `created` metadata.
- Existing exclusive output, existing-env preservation, target guards and
  no-snapshot-deletion regressions continue to pass.

Add cases to existing suites already covered by `vercel:probe-test`. A small
local shared diagnostic module is acceptable only if duplication otherwise
requires it; do not introduce a new service/controller, generic logging system
or separate live diagnostic CLI.

## 5. Verification, review and documentation

Run with Node 24.21.0, preserving actual outputs/exits. Run the production build
before sequential typecheck; concurrent generation has caused races before.

```bash
node --version
npm exec -- node --version
node --test scripts/vercel/build-scanner-snapshot.spec.js scripts/vercel/rebuild-scanner-cadence.spec.js scripts/vercel/prepare-scanner-handoff.spec.js
npm run vercel:probe-test
npm run vercel:scanner-rebuild -- --help
npm run vercel:scanner-rebuild -- --dry-run
npm run lint
npm run build
npm run typecheck
npm run ops:scan-secrets
npm run ops:check
git diff --check
```

Run installed Prettier checks on changed JS/spec files and this prompt; format
only owned changes. The existing documentation owners have historical Prettier
failures: check newly added fragments separately if whole-file formatting would
rewrite unrelated records. Record actual network/audit or sandbox failures;
an aggregate stopped early is not an aggregate pass. Use established permitted
execution modes when subprocess isolation prevents the real test from running.
Do not run a live scanner CLI in place of its tests/dry-run.

Update `docs/operations.md` with investigation method, safe observations,
evidence limitations, diagnostic contract and actual check output. Update
`docs/vercel-deployment.md`, `docs/build-plan.md` and the scanner section of
`docs/launch-checklist.md` with the precise result and next hosted gate. Update
`infra/vercel/runbooks/managed-operations.md` §5 to explain safe failure fields
and the continuing prohibition on adopting the old failed receipt. Update
`infra/vercel/README.md` only where its builder diagnostic description changes.
Keep historical records attributed to their original runs. No percentage or
launch-category approval is earned here.

Inspect the complete diff and dispatch an independent read-only reviewer using
`requesting-code-review`, with baseline/current SHAs, requirements, changed
files, real checks and sanitized evidence. Do not send private artifacts or
credentials to the reviewer. Evaluate feedback with `receiving-code-review`,
fix valid issues and reverify; re-review significant changes. Commit only this
approved prompt and its implementation/records locally to `main`, using
`caveman-commit`. No push.

## Impact, non-goals and exit

No application route, tenant behavior, UI, database/schema, provider adapter,
environment value or deployed runtime changes. Operator failure receipts gain
safe substep detail; standalone builder diagnostics stop printing raw output.
Existing successful receipt/handoff behavior remains compatible.

No new live build/scan or candidate salvage; no preview adoption/deployment,
production promotion, snapshot deletion, retirement/resource-budget controller,
workflow change, hosted schedule proof, plan upgrade, restore/load drill or
eleven-category sign-off. Do not rerun Prompt 386 automatically after finishing.

Exit: source-backed investigation conclusions (including explicit unknowns),
tested safe builder/cadence diagnostics, actual verification evidence,
independent review and local commit. State exact local inspection commands and
whether the original failure is proven or unresolved. The next hosted step
must be separately bounded around the evidence now available. Retained snapshot
metadata, test doubles and diagnostic fields do not prove application adoption,
scanner freshness, cleanup of the historical run or production readiness.
