# Prompt 403 — recoverable scanner workflow handoff

## Scope and why this is next

Parent: Phase 12, the approved Prompt 370 Vercel migration. Prepare the
smallest local prerequisite for the still-open hosted scanner lifecycle:
make a successful manually dispatched candidate workflow leave a validated,
copyable receipt that the existing offline handoff CLI accepts.

Baseline inspected while preparing: clean `main`, HEAD `c802e90`.
Committed history establishes the landing refinements through Prompt 402 and
the scanner lifecycle through Prompts 384–396. The application foundations
are committed; Phase 12 production activation and eleven sign-offs remain open.
Recheck HEAD and unrelated worktree changes at execution time.

The concrete gap is in `.github/workflows/scanner-snapshot-rebuild.yml`:
its final summary retains ID/hashes and a few statuses, then cleanup deletes
`receipt.json` and `candidate.env`. The summary omits schema, target, timestamp,
previous snapshot and smoke results required by
`scripts/vercel/prepare-scanner-handoff.js`. A workflow success therefore does
not leave an input that this existing handoff interface can consume directly.
Local preparation does preserve a full receipt; retain that behavior.

Implement a safe receipt projection into the existing GitHub step summary.
This is a recoverability improvement, not activation of a hosted cadence.
Scheduled runs remain simulations, and manual live runs remain opt-in.

## SKILLS USED

- `deployment-pipeline-design` — preserve preparation/adoption/verification gates.
- `github-actions-templates` — workflow conditions, permissions and cleanup.
- `secrets-management` — allowlisted publication and live-step-only credentials.
- `javascript-testing-patterns` — deterministic Node unit and process tests.
- `error-handling-patterns` — fixed errors, invalid input and failure handling.
- `architecture-patterns` — keep summary projection offline and outside runtime boot.
- `e2e-testing-patterns` — verify the producer-to-handoff tooling journey locally.
- `requesting-code-review` — independent review after self-verification.
- `receiving-code-review` — verify findings before making corrections.
- `caveman-commit` — required local commit message.

The first seven skills and the review/commit instructions were read while
preparing this prompt; load all listed skills again during approved execution.
This bounded operations-tooling step does not touch the Nest runtime, telemetry,
SAST implementation or browser UI. Their broader Phase 12 skills become required
when those surfaces are actually changed. No dedicated skill owns this repository's
receipt schema: the opened producer and consumer are the verified contract.

## Reference material read

- `AGENTS.md`: phase-control protocol, prompt contract, verification, review,
  documentation and local commit requirements.
- `docs/build-plan.md`: Phase 12, production-target amendment, sequence gates,
  scanner lifecycle records and Prompts 397–398.
- `docs/project-status.md`: historical V1 assessment and managed-target caveat.
- `docs/skills.md`: locked skill triggers and phase manifests.
- `docs/vercel-deployment.md`: resume instructions, remaining-work ordering,
  preview target, free-tier constraint and scanner retirement/refresh records.
- `docs/operations.md`: operations introduction and relevant scanner workflow,
  handoff, rebuild, retirement and preview execution records.
- `docs/operator-handoff.md`: managed target and production authority limits.
- `docs/system-architecture.md`: deployment profiles and configuration/secrets.
- `docs/security.md`: CI contribution/artifact trust and secret-disclosure risks.
- `infra/vercel/runbooks/managed-operations.md`: scanner lifecycle §5,
  workflow mode §5.2 and receipt-to-runtime handoff §5.4.
- `infra/vercel/README.md`: candidate cadence safety and offline runtime handoff.
- `.github/workflows/scanner-snapshot-rebuild.yml`: complete workflow.
- `scripts/vercel/rebuild-scanner-cadence.js`: complete receipt construction,
  mode selection, failure handling and entrypoint.
- `scripts/vercel/rebuild-scanner-cadence.spec.js`: cadence boundaries,
  workflow shell execution, secret canaries and mode tests.
- `scripts/vercel/prepare-scanner-handoff.js`: bounded receipt read,
  `validateReceipt`, output projection and CLI exports.
- `package.json`: existing verification commands.

At execution read `scripts/vercel/prepare-scanner-handoff.spec.js` in full for
its fixture and output-integrity conventions before extending the tooling tests.
No visual reference or measurement is needed: no rendered surface changes.
No Next, React, Tailwind or provider API is introduced by this scope.

## Expected impact and permitted files

No HTTP route or runtime environment changes. A successful live workflow leaves
a JSON block an operator can copy unchanged into a private receipt file, then
pass to the existing handoff CLI after reviewing the workflow's provenance.
Failure and simulation summaries never offer an eligible handoff receipt.

Expected changes:

1. New `scripts/vercel/summarize-scanner-candidate.js`.
2. New `scripts/vercel/summarize-scanner-candidate.spec.js`.
3. `.github/workflows/scanner-snapshot-rebuild.yml`: replace inline summary code
   with the helper; keep the step name stable for existing executable tests.
4. `scripts/vercel/rebuild-scanner-cadence.spec.js`: adapt/extend workflow tests.
5. `package.json`: include the new spec in existing `vercel:probe-test`.
6. `infra/vercel/runbooks/managed-operations.md` and `infra/vercel/README.md`:
   explain summary recovery, publication scope, and independent adoption gates.
7. `docs/operations.md`, `docs/vercel-deployment.md`, `docs/build-plan.md`:
   truthful local implementation record and outstanding hosted gates.

Only change `prepare-scanner-handoff.js` if a genuinely necessary small shared
validation extraction is established; it already exports `readReceipt`,
`validateReceipt`, `TARGET` and `MAX_RECEIPT_BYTES`. Prefer using those exports
without altering the consumer contract. No new dependency or lockfile change.

## Implementation plan

### 1. Offline summary helper

Implement a CommonJS Node CLI and exported pure projection/rendering helpers.
Use the repository's established argument-validation and fixed-error style.
Provide `--help`, `--receipt <file>`, `--summary <file>`; reject unknown,
duplicate, missing and empty arguments. Help must need no env, SDK or network.
Append a fully constructed Markdown string to the runner-owned summary file;
never use shell evaluation or execute receipt values.

Read input through the existing bounded `readReceipt` implementation: regular
file, no symlinks, maximum 64 KiB. No env-file reads, SDK import or cloud call.
The helper must not write candidate/runtime configuration or create a handoff
bundle. Treat receipt content as untrusted even when produced by this workflow.

For an eligible live success, call the existing `validateReceipt` on the
original parsed object before reconstructing an allowlisted receipt. Preserve
its refusal of explicit failure/activation markers; never sanitize a contradictory
success into an eligible one. Unknown unrelated properties may be dropped, but
none may be spread or serialized into Markdown.

The reconstructed schema-v1 JSON contains only these established fields:

- `schema_version`, `tool`, `target`, `timestamp`;
- `execution_mode`, `status`, `rebuild_needed`;
- `previous_snapshot_id`, `new_snapshot_id`, `main_sha256`, `daily_sha256`;
- `smoke_test` with exactly `signatures`, `clean_sample`, `eicar_sample`, `cleanup`;
- `activation_status`, `configuration_export`, `prune_status`;
- `deployment_verification` and `retirement_status`, both `not_performed`.

Use the validated projection returned by `validateReceipt` for target, normalized
timestamp, IDs and hashes; preserve only validated enum values for configuration
export/prune status. Every smoke value must have been verified as `passed`.
Do not invent a previous ID, timestamp or executed action. Revalidate the final
projection with `validateReceipt` before presenting it as copyable.

Label the JSON block explicitly as a sanitized candidate receipt for offline
handoff. Explain that it is reconstructed, unsigned consistency evidence and
does not attest to provider state, CVD freshness, adoption or launch approval.
If the handoff manifest later hashes this file, that hash binds the copied
projection's bytes; do not call it a digest of the original runner receipt.

For non-success outcomes retain a small diagnostic summary using the current
workflow's anchored allowlists for mode, status, snapshot ID, hashes and fixed
error enum. Do not publish target/timestamp/smoke as a partial success receipt.
Keep a confirmed candidate ID visible for manual reconciliation after failure.
Do not publish provider errors, arbitrary strings, stacks, tokens, URLs,
environment values, absolute paths or unknown nested keys.

Simulation, skipped and failed outcomes must clearly say no handoff is available.
Malformed/ineligible claimed live success must emit no copyable receipt and
exit nonzero with a fixed message. A missing receipt after an earlier failing
step is an expected unavailable-evidence case: emit a fixed notice without
exposing its path. A read failure other than absence, invalid JSON, unsafe input
or summary write failure must fail visibly with sanitized output. Never replace
an earlier workflow failure with success, and never expose raw exceptions.

### 2. Workflow wiring

Keep `Generate sanitized candidate handoff summary` under `if: always()`.
Call the helper with quoted paths under `SCANNER_TASK_DIR` and
`GITHUB_STEP_SUMMARY`. Handle an absent task directory without expanding a path
at the filesystem root. Keep cleanup under `if: always()` after summarization,
so failure to summarize still cleans runner configuration files.

Preserve these existing invariants exactly:

- schedule/default manual execution is simulation;
- only manual `prepare_candidate: true` permits live preparation;
- `force` alone cannot enable live mode;
- fixed Acres preview team/project/iad1 guard and live-step-only credentials;
- pinned actions, Node 24, `contents: read`, non-cancelling concurrency;
- no upload-artifact action, credentials publication, environment write,
  provider dispatch, automatic adoption, deploy, retirement or pruning.

The summary is durable only within the workflow run's retention/access scope;
it is not a replacement for operator-selected restricted custody. Scheduled live
execution, repository secret configuration and a hosted workflow dispatch remain
separate work. Do not add a schedule-enabled switch in this prompt.

### 3. Meaningful regression coverage

Use `node:test`, deterministic timestamps and synthetic canaries. Test the actual
workflow shell step where appropriate, following the existing tests.

Required cases:

1. Valid live success → extract JSON from rendered summary → existing
   `prepareHandoff` → expected three runtime variables and all action statuses
   still `not_performed`. Verify file/directory permissions using existing tests.
2. Null or valid prior snapshot; exported/not-performed configuration;
   retained/not-requested prune status, accepted only per consumer contract.
3. Missing/wrong target, schema, mode, future timestamp, incomplete smoke,
   invalid hashes/IDs and explicit failure/activation contradictions produce no
   eligible block. Assert no successful bundle can be produced from them.
4. Simulation/skipped/failed outcomes show no handoff; confirmed failure ID is
   retained only through the narrow diagnostic allowlist.
5. Canary credentials, Markdown fences, newline injection, URLs, paths and
   arbitrary provider messages in unknown/invalid fields never reach summary,
   stdout or stderr. Exercise nested unknown keys as well as top-level keys.
6. Oversized/malformed/non-regular/symlink receipt, missing receipt,
   argument errors, summary-write failure and missing task directory.
7. Actual summary shell step followed by cleanup: copyable success evidence
   survives in summary while runner `candidate.env` and receipt are removed.
8. Existing mode-selection, target guards, receipt handoff, builder and retirement
   tests continue to pass. No network or provider credentials in any test.

Do not create a new test framework or mirror the helper's field construction
as the only expected result; the existing handoff consumer is the integration
oracle. No browser, real database or live Sandbox test is needed for this scope.

## Verification and recording

Use Node 24.21.0 per `.node-version`; verify the actual executable and npm child
runtime. Do not install/update dependencies as an incidental action. Use the
installed formatter and quote the actual commands/results. Before describing
formatting as successful, run its check against every changed supported file.

Run sequentially where generated output is shared:

```bash
node --check scripts/vercel/summarize-scanner-candidate.js
node --test scripts/vercel/summarize-scanner-candidate.spec.js
npm run vercel:probe-test
node scripts/vercel/summarize-scanner-candidate.js --help
npm run lint
npm run typecheck
npm run build
git diff --check
```

Add the new spec to `vercel:probe-test` before running that existing command.
Inspect the complete diff for credentials, broadened workflow authority and
unrelated changes. Record exact failures and environmental limits; do not claim
an aggregate operations preflight, online audit or hosted proof that was not run.

After self-verification use `requesting-code-review` to dispatch an independent
reviewer with the approved prompt, baseline/current SHAs, complete unstaged diff
and check outputs. Apply `receiving-code-review` to verify each finding. Fix valid
issues, rerun affected checks and seek follow-up review if changes are significant.

Record results in the owning operations and migration docs, with a concise
build-plan entry. Explain the now-recoverable summary, its unsigned status and
the remaining manual custody/adoption stages. Do not mark hosted cadence,
signature freshness, storage accounting, production or any sign-off complete.

Commit only approved work locally to `main` using `caveman-commit`. Do not push.
Return the commit and exact local help/test commands plus the documented recovery
steps: review trusted workflow run/source, copy only the eligible JSON block to
a new 0600 file under a 0700 restricted directory outside the checkout, then run
`prepare-scanner-handoff.js --receipt <file> --output-dir <new private directory>`.
Keep the existing warning that a passing handoff is not deployment authorization.

## Non-goals and rollback

No hosted workflow dispatch or GitHub configuration, Vercel API call, credential
inspection, live rebuild, snapshot deletion, refresh, environment adoption,
deploy/promotion, DNS/domain change, plan/spend change or operator messaging.
No changes to snapshot-age/CVD policy, builder/source verification, existing
receipt validation acceptance, runtime adapters, application UI or landing page.
The next scanner refresh timing and storage-accounting experiment remain governed
by their existing records and require their own bounded execution.

Rollback is an ordinary local revert of this implementation commit; no cloud
state was changed. Reverting restores the old summary limitation. There is no
migration or external rollback action.

## Acceptance

A valid workflow success yields a sanitized receipt that demonstrably round-trips
through the existing offline handoff CLI after runner cleanup. Invalid or
non-success input cannot masquerade as that success, and injected private content
does not reach the summary. All current workflow authority boundaries remain
intact. Checks, independent review, documentation and the required local commit
are complete. Hosted cadence and Phase 12 launch remain explicitly open.
