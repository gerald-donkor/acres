# Prompt 383 — Automated ClamAV scanner snapshot rebuild cadence and preflight suite

## Scope and why this is next

Planning baseline: `9257025` on `main`, 2026-10-16; working tree clean before
this prompt. Parent: Phase 12 operations and launch hardening, approved Prompt 370,
ordered step 7 ("Managed operations and launch evidence").

Prompts 370–382 established the Vercel-managed target runtime, storage, scanning,
outbox, throttling, preview deployment, managed readiness schema, validator, operator
handoff templates, branched launch drill runner, static integrity checks, top-level
readiness preflight, and dedicated unit test suites for all managed drill verifiers.

In `docs/vercel-deployment.md` (§ "Scanner snapshot" and § "Remaining work"), a concrete
operational launch blocker was identified:
- **Image rebuild cadence (production blocker):** ClamAV virus definition signatures (`daily.cvd`)
  go stale past the adopted age (maximum 168 hours, production target cadence 48 hours). A stale
  scanner fails closed, marking incoming uploads `scanner_unavailable`.
- The existing manual build tool `scripts/vercel/build-scanner-snapshot.js` accepts `--replace <snap_id>`,
  which deletes the old snapshot during build. In production, this causes immediate downtime
  and `scanner_unavailable` rejections while the new snapshot is being created or redeployed.
- As documented in `docs/vercel-deployment.md` line 819:
  *"At least every SCANNER_MAX_SIGNATURE_AGE_HOURS / 2 hours: run `npm run vercel:scanner-snapshot -- --write-env …` without `--replace`, update `SCANNER_SANDBOX_SNAPSHOT_ID` and both hashes and redeploy, then delete the old snapshot by id. Deleting first (`--replace`) makes every scan fail closed with `scanner_unavailable` until the redeploy; `--replace` suits only targets no deployment uses... A protected Vercel Cron or a GitHub Actions job could run it... Not built here."*

This prompt resolves this production blocker by implementing:
1. `scripts/vercel/rebuild-scanner-cadence.js`: an automated, zero-downtime ClamAV scanner
   snapshot rebuild tool that checks signature age, builds a new snapshot without `--replace`,
   verifies the newly created snapshot via smoke tests (clean sample and EICAR detection),
   writes updated environment/hash configurations, and prunes the superseded snapshot only
   after the new snapshot is proven healthy.
2. `scripts/vercel/rebuild-scanner-cadence.spec.js`: a comprehensive unit and contract test
   specification covering CLI flag parsing, cadence evaluation, smoke verification, fail-closed
   safety, and pruning semantics.
3. `.github/workflows/scanner-snapshot-rebuild.yml`: a scheduled, production-ready GitHub
   Actions workflow running on an automated 24/48-hour cadence and manual `workflow_dispatch`.
4. Integration into package scripts (`npm run vercel:scanner-rebuild`, `npm run vercel:probe-test`)
   and documentation updates across `docs/vercel-deployment.md`, `docs/launch-checklist.md`,
   `docs/operations.md`, `docs/build-plan.md`, and `infra/vercel/runbooks/managed-operations.md`.

Stop for phase-control approval before execution.

## References and verified interfaces

Read at execution:

- `AGENTS.md`, especially §§2, 2.1, 3, 5–10 and phase-control commands.
- `docs/build-plan.md` Section 13 (Phase 12), production-target amendment, and Prompt 382 record.
- `docs/vercel-deployment.md` "Scanner snapshot", "Rebuild cadence", and Prompts 372–373, 382 records.
- `docs/launch-checklist.md` "Selected managed profile — Prompt 370", Category 8 and Category 11 runbooks.
- `docs/operations.md` root scripts, operations index, and runbook standards.
- `infra/vercel/runbooks/managed-operations.md` Section 5 ("ClamAV Scanner Sandbox Snapshot Rebuild").
- `scripts/vercel/build-scanner-snapshot.js` (`buildSnapshot`, `replaceSnapshot`, `assertOutsideRepo`, `writeScannerEnv`).
- `scripts/vercel/probe-platform.js` (`scanShape`, `signaturesOk`, `EICAR`, `sandboxTarget`, `credentialsFor`).
- `scripts/vercel/build-scanner-snapshot.spec.js` (test mocking patterns for Sandbox SDK).
- `package.json` scripts: `vercel:scanner-snapshot`, `vercel:probe-test`, `ops:check`.

## SKILLS USED

- `architecture-patterns` — clean decoupling between snapshot builder, smoke verifier, and cadence scheduler.
- `deployment-pipeline-design` — zero-downtime rotation lifecycle: build new → verify healthy → switch → prune old.
- `github-actions-templates` — production-ready scheduled workflow with pinned actions, minimal permissions, and masked secrets.
- `secrets-management` — prevent secret leakage in logs, environment dumps, receipts, and error messages.
- `security-threat-model` — fail-closed verification: never prune working previous snapshot if new snapshot smoke test fails.
- `security-best-practices` — secure argument parsing, safe file permissions (0600), path traversal defense.
- `javascript-testing-patterns` — Node.js native test runner (`node:test`, `node:assert/strict`) for unit and subprocess CLI testing.
- `requesting-code-review` — stage 1 code review subagent dispatch.
- `receiving-code-review` — stage 2 technical review evaluation and verification.
- `caveman-commit` — conventional commit formatting without AI trailers.

## Implementation sequence

### 1. Create `scripts/vercel/rebuild-scanner-cadence.js`

Implement the zero-downtime scanner snapshot rebuild orchestrator:
1. **CLI flag parsing (`parseArgs`)**:
   - `--help`, `-h`: display usage and exit 0.
   - `--dry-run`: simulate inspection, build, smoke test, and prune without cloud mutations or sandbox creation.
   - `--output <file>`, `-o <file>`: write structured JSON audit receipt.
   - `--write-env <file>`: write outside-repo environment file (`ACRES_SCANNER_SNAPSHOT_ID`, `ACRES_SCANNER_MAIN_SHA256`, `ACRES_SCANNER_DAILY_SHA256`) using `assertOutsideRepo` and `writeScannerEnv`.
   - `--current-snapshot-id <id>`: specify currently active snapshot ID to check age or supersede.
   - `--max-age-hours <hours>`: threshold age to trigger rebuild (default: 48, maximum: 168).
   - `--force`: bypass signature age evaluation and force fresh snapshot build.
   - `--skip-prune`: preserve previous snapshot without deleting it after new snapshot is verified.
2. **Cadence evaluation (`evaluateCadence`)**:
   - In dry-run mode, returns simulated healthy check result without network requests.
   - When `--current-snapshot-id` is provided and `--force` is false:
     - Inspects snapshot signatures / build timestamp.
     - If signature age is within `--max-age-hours`, determines rebuild is not needed:
       returns `{ rebuildNeeded: false, reason: 'signatures_fresh', ageHours: <hours> }`.
   - If signature age exceeds threshold, current snapshot is absent, or `--force` is set:
     - Returns `{ rebuildNeeded: true, reason: 'stale_or_forced', ageHours: <hours> }`.
3. **Execution lifecycle (`rebuildCadence`)**:
   - Step 1: Evaluate cadence. If not needed, emit skip receipt/log and return cleanly with exit code 0.
   - Step 2: Build new snapshot without `--replace`:
     Calls `buildSnapshot(config, sdk, { persistentBuilder: false })` to build a fresh snapshot with updated CVDs.
   - Step 3: Smoke test the newly built snapshot:
     Launches a probe sandbox from the newly created snapshot ID;
     Executes clean scan (`clamscan`) asserting exit code 0 and `OK`;
     Executes EICAR test asserting exit code 1 and `Eicar-Test-Signature FOUND`.
   - Step 4: Safety gate:
     If smoke test fails, marks rebuild failed, leaves previous snapshot untouched, and throws `BuildError('smoke-test-failed')` without deleting the old snapshot.
   - Step 5: Save environment / configuration:
     If `--write-env` was passed, writes updated environment variables to the destination file outside the repository.
   - Step 6: Prune previous snapshot:
     If `--current-snapshot-id` was provided and `--skip-prune` was not set:
     Calls `replaceSnapshot(config, sdk, options.currentSnapshotId, summary.snapshotId)` to delete the superseded snapshot and confirm its deletion.
4. **Structured receipt generation**:
   - Emits standardized audit receipt (`scanner-rebuild-receipt-<timestamp>.json`):
     `tool: 'rebuild-scanner-cadence'`, `status: 'success' | 'failed' | 'skipped'`,
     `rebuild_needed: boolean`, `previous_snapshot_id: string | null`,
     `new_snapshot_id: string | null`, `main_sha256: string | null`, `daily_sha256: string | null`,
     `smoke_test: { clean_sample: 'passed', eicar_sample: 'passed' }`,
     `prune_status: 'pruned' | 'skipped' | 'none'`, `execution_mode: 'simulation' | 'live'`.
5. **Fail-safe error sanitization**:
   - Prints sanitized errors without leaking credentials, tokens, or private directory paths.

### 2. Create `scripts/vercel/rebuild-scanner-cadence.spec.js`

Implement comprehensive unit and contract tests using `node:test` and `node:assert/strict`:
1. **CLI usage & flag parsing**:
   - `--help` and `-h` display usage and exit 0.
   - Invalid flags throw "Unknown argument." and exit 1.
   - `--max-age-hours` validates positive numeric input.
   - `--write-env` validates path is outside repository and rejects symlinks.
2. **Cadence evaluation logic**:
   - Fresh snapshot (<48h) skips build and returns `rebuildNeeded: false`.
   - Stale snapshot (>48h) flags `rebuildNeeded: true`.
   - `--force` forces `rebuildNeeded: true` even when current snapshot is fresh.
   - Missing current snapshot ID flags `rebuildNeeded: true`.
3. **Execution order & safety invariants**:
   - Asserts `buildSnapshot` is called without `--replace`.
   - Asserts smoke tests are executed against the newly created snapshot before any pruning.
   - If clean scan fails (exit != 0) or EICAR fails (exit != 1), execution halts immediately and `replaceSnapshot` is NOT called.
   - When smoke tests pass, `replaceSnapshot` is called with `(previousId, newId)`.
   - When `--skip-prune` is passed, `replaceSnapshot` is NOT called.
4. **Receipt emission**:
   - Validates generated JSON receipt structure and field types.
   - Verifies file mode (0600) and parent directory creation.
5. **Dry-run simulation mode**:
   - `--dry-run` executes full pipeline without cloud mutations, returning simulated success receipt.

### 3. Create `.github/workflows/scanner-snapshot-rebuild.yml`

Implement the scheduled automated rebuild workflow:
1. **Trigger configuration**:
   - Scheduled: `cron: '0 4 * * *'` (runs daily at 04:00 UTC).
   - Manual: `workflow_dispatch` with optional `force` boolean input.
2. **Job definition**:
   - `runs-on: ubuntu-latest`.
   - Concurrency group `scanner-snapshot-rebuild` with `cancel-in-progress: false` to prevent overlapping builds.
   - Pinned actions (`actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683`, `actions/setup-node@1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a`).
   - Node 24 runtime (`node-version: '24'`).
3. **Execution steps**:
   - Check out code, install dependencies (`npm ci`).
   - Set up isolated temporary environment directory outside repo (`/tmp/acres-scanner-rebuild/`).
   - Run `npm run vercel:scanner-rebuild -- --write-env /tmp/acres-scanner-rebuild/scanner.env --output /tmp/acres-scanner-rebuild/receipt.json`.
   - Output sanitized summary to `$GITHUB_STEP_SUMMARY`.
   - Fail closed if rebuild or smoke verification fails.

### 4. Package scripts and pipeline integration

1. In `package.json`:
   - Add `"vercel:scanner-rebuild": "node scripts/vercel/rebuild-scanner-cadence.js"`.
   - Add `scripts/vercel/rebuild-scanner-cadence.spec.js` to `"vercel:probe-test"`.
2. Verify `npm run vercel:probe-test` and `npm run ops:check` pass cleanly.

### 5. Documentation updates

1. Update `infra/vercel/runbooks/managed-operations.md`: update Section 5 with the automated rebuild runner and GitHub Actions cadence.
2. Update `docs/vercel-deployment.md`: record Prompt 383, closing the image rebuild cadence blocker with the safe two-phase rebuild tool.
3. Update `docs/launch-checklist.md`: document the automated ClamAV snapshot rebuild workflow and verification commands.
4. Update `docs/operations.md`: record `vercel:scanner-rebuild` in the script inventory.
5. Update `docs/build-plan.md`: record Prompt 383 under Phase 12 managed target.

### 6. Code review and local commit

1. Self-verify all new tests pass with 0 errors.
2. Dispatch independent read-only reviewer via `requesting-code-review`.
3. Evaluate feedback with technical rigor using `receiving-code-review`.
4. Commit to `main` using `caveman-commit`.

## Acceptance criteria

- `scripts/vercel/rebuild-scanner-cadence.js` implements the safe build-verify-switch-prune lifecycle.
- In dry-run mode, `--dry-run` executes cleanly without requiring cloud credentials or mutating resources.
- `scripts/vercel/rebuild-scanner-cadence.spec.js` passes with 100% assertions covering argument parsing, cadence evaluation, smoke verification, fail-closed safety, and receipt structure.
- `.github/workflows/scanner-snapshot-rebuild.yml` is valid YAML, uses pinned action versions, runs Node 24, and includes both `schedule` and `workflow_dispatch` triggers.
- Smoke test failure halts execution before deleting any previous snapshot, preventing `scanner_unavailable` downtime.
- `npm run vercel:probe-test` passes with the new spec included.
- `npm run ops:check` passes cleanly with zero regressions.

## Verification

Execute with Node 24:

```bash
node --test scripts/vercel/rebuild-scanner-cadence.spec.js
node scripts/vercel/rebuild-scanner-cadence.js --help
node scripts/vercel/rebuild-scanner-cadence.js --dry-run
npm run vercel:probe-test
npm run ops:check
npm run lint
npm run typecheck
git diff --check
```

## Non-goals, impact and rollback

- Non-goals: No manual production promotion; no paid tier upgrades; no changes to core scanning engine or self-hosted ClamAV daemon profile.
- Impact: Closes the concrete production blocker identified in `docs/vercel-deployment.md` by replacing unsafe manual `--replace` builds with an automated, zero-downtime, smoke-tested rebuild tool and scheduled CI workflow.
- Rollback: Revert new script, test file, workflow, and package.json additions.
