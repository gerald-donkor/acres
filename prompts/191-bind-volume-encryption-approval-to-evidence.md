# 191 — bind volume encryption approval to evidence

## Scope and why this is next

The committed baseline is `56dc15d` on `main`, with a clean worktree at planning time. Phase 12's launch gate remains open pending operator evidence and approval. Prompts 188–190 hardened Category 6 (`backup_and_disaster_recovery`) by validating the scheduled backup cadence against the RPO and binding launch approval to concrete, machine-readable restore and storage reconciliation child reports.

The next dependency-safe launch readiness gap is Category 8 (`volume_encryption`). An approved `volume_encryption` record requires `encryption_mechanism`, `encrypted_mount_paths` (at least 3 stateful mounts for PostgreSQL, Valkey, and Garage), `key_separation_confirmed: true`, and `key_recovery_owner`. However, `scripts/ops/check-launch-readiness.js` currently allows an approved `volume_encryption` section to pass with narrative-only `evidence` (such as `"LUKS2 volume headers verified with detached keys"`) without referencing an actual child report. While `checkEvidenceFile` validates volume encryption evidence if an operator happens to reference a JSON report, it does not require a report or ensure that `key_separation_confirmed: true` and mount encryption integrity are substantiated by verified child report data.

Bind Category 8 launch approval to a concrete, successful volume encryption child report emitted by `scripts/ops/verify-volume-encryption.js`. This continues the fail-closed tightening of Phase 12K's 11-category launch readiness matrix without modifying production services or replacing the operator's responsibility to verify physical host encryption and detached key custody.

## References and verified baseline

- Re-read `AGENTS.md` §§2–7 and 10, `docs/build-plan.md` §§13, 19, 21, 22, `docs/operations.md` (Phase 12K, Prompts 185 and 190 records), `docs/launch-checklist.md` Category 8 (§3.8) and §4, `docs/security.md` TM-21, and `docs/skills.md` before execution.
- Inspect `scripts/ops/check-launch-readiness.js` evidence resolution and Category 8 validation; `scripts/ops/check-launch-readiness.spec.js` approved fixture; `scripts/ops/verify-volume-encryption.js` report producer and its spec; `scripts/ops/run-launch-drills.sh` stage 4 and dossier derivation; `infra/launch/readiness.example.json`; `scripts/ops/check-production-templates.sh`; and root `package.json` before edits.
- The producer `verify-volume-encryption.js` emits a JSON payload with:
  - `drill_type`: `'production_volume_encryption_and_key_separation'`
  - `timestamp`: ISO UTC timestamp string (`new Date().toISOString()`)
  - `status`: `'success'` | `'failed'` (`'success'` required)
  - `valid`: boolean (`true` required)
  - `errors`: array of strings (`errors.length === 0` required)
  - `warnings`: array of strings
  - `totalRequiredMounts`: integer >= 3 (9 required in standard compose evaluation)
  - `validMountsCount`: integer >= 3 (`validMountsCount === totalRequiredMounts` required)
  - `evaluatedMounts`: array of stateful mount objects with `passed: true` covering at least PostgreSQL, Valkey, and Garage
  - `keySeparation`: object with `verified: true`, `scannedPaths` array, and `detectedViolations: []`
  - `readinessEvaluated`: object or null
- Stage 4 of `run-launch-drills.sh` writes `volume-encryption-evidence-<timestamp>.json` into `$EVIDENCE_DIR`. The verified volume encryption script also supports custom paths via `--output <file>`. The checked-in example `infra/launch/readiness.example.json` is unresolved and must remain so.
- No static design comp applies. The measurable contract is the producer's actual status, error, mount, and key separation structure compared against validation time.

## Implementation contract

1. Add a focused validator for the volume encryption child report in `scripts/ops/check-launch-readiness.js`:
   - Add `isVolumeEncryptionCandidate({ file, parsed })` helper recognizing candidates by filename pattern (`volume-encryption-evidence-` or `volume-encryption`) or structural markers (`drill_type === 'production_volume_encryption_and_key_separation'`, or both `keySeparation` and `evaluatedMounts` present as objects/arrays). Do not accept an arbitrary JSON object or filename alone.
   - Add `validateVolumeEncryptionReport(report, now)` helper:
     - Require a plain object with a valid ISO UTC `timestamp` that parses to a finite timestamp not in the future relative to `now`.
     - Require `report.status === 'success'` and `report.valid === true`.
     - Require `Array.isArray(report.errors)` and `report.errors.length === 0`.
     - Require `report.keySeparation` to be an object with `verified === true` and `Array.isArray(report.keySeparation.detectedViolations)` with `detectedViolations.length === 0`.
     - Require `Array.isArray(report.evaluatedMounts)` with `report.evaluatedMounts.length >= 3` and every mount item having `passed === true`.
     - If `report.totalRequiredMounts` and `report.validMountsCount` are present, require them to be positive safe integers with `report.validMountsCount === report.totalRequiredMounts`.
2. In `validateReadiness`:
   - Accumulate parsed evidence files from `sections.volume_encryption` into a `volumeEvidence` array:
     `if (sectionName === 'volume_encryption') volumeEvidence.push(...parsedFiles);`
   - In Category 3.8 (`volume_encryption`):
     - Filter `volumeEvidence` with `isVolumeEncryptionCandidate`.
     - If no candidate report exists, add blocker:
       `'A successful volume encryption child JSON report is required'`
     - Validate all candidate reports with `validateVolumeEncryptionReport(parsed, now)`. If any candidate report fails or is malformed, add blocker:
       `'A referenced volume encryption report is invalid or failed'`
     - Ensure that every candidate in evidence is validated: a failed or malformed report blocks approval even beside a valid one or inside a wildcard match.
     - Keep `key_separation_confirmed: true` as a required operator declaration, backed by the verified child report.
3. Use the validator's existing injected `options.now` for deterministic date testing and default to real current time for CLI use. Bound diagnostics to generic Category 8 messages: do not leak filesystem paths, mount passwords, or host configuration details in blocker strings.
4. In `scripts/ops/check-launch-readiness.spec.js`:
   - Create a temporary valid volume encryption fixture file (`volume-encryption-evidence-valid.json`) in the existing fixture directory with valid timestamp, `status: 'success'`, `valid: true`, empty `errors`, `totalRequiredMounts: 9`, `validMountsCount: 9`, all mounts `passed: true`, and `keySeparation: { verified: true, scannedPaths: ['/mnt/encrypted'], detectedViolations: [] }`.
   - Update `buildValidApprovedRecord().sections.volume_encryption.evidence` to reference `volumeEncryptionFixturePath`.
   - Add test cases covering:
     - Prose-only or empty evidence in approved `volume_encryption` blocks approval.
     - Unified dossier alone or arbitrary JSON with a volume-like filename blocks approval.
     - Child report with `status: 'failed'` or `valid: false` blocks approval.
     - Child report with non-empty `errors` blocks approval.
     - Child report with `keySeparation.verified: false` or detected violations blocks approval.
     - Child report with a failed mount or fewer than 3 mounts blocks approval.
     - Child report with invalid or future timestamp blocks approval.
     - Wildcard or multiple evidence files containing a failed report alongside a valid one blocks approval.
     - Valid report at an arbitrary custom path passes.
     - Unrelated approved categories remain unaffected.
5. Update `docs/operations.md`, `docs/launch-checklist.md` Category 8, and the Phase 12 verification record in `docs/build-plan.md` with the accepted volume encryption child-report contract, verification results, and operator responsibilities. Keep `infra/launch/readiness.example.json` unresolved with empty evidence. No new `AGENTS.md` index row is needed.

## Impact, non-goals, and rollback

- No application routes, database schemas, UI components, background workers, or production Compose configs change. Only launch readiness evidence validation, test fixtures, and operations documentation change.
- An approved readiness record that previously relied only on `key_separation_confirmed: true` with prose evidence will now fail closed until its actual successful child report is referenced.
- This prompt validates consistency of an operator-supplied JSON report; it does not replace the operator's duty to physically inspect detached LUKS2 headers or KMS keys, verify dual custody, or audit production volume mounts.
- Rollback: revert the Category 8 evidence validator in `scripts/ops/check-launch-readiness.js`, the test updates in `check-launch-readiness.spec.js`, and documentation changes.

## Verification and review

1. Re-read this approved prompt and load every named skill before code.
2. Run `npm run ops:readiness-test`, `npm run ops:volume-encryption-test`, `npm run ops:templates`, and `npm run ops:check`; quote the real output.
3. Run `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` and confirm it fails closed as expected.
4. Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
5. Dispatch a reviewer subagent via `requesting-code-review` after self-verification. Evaluate feedback using `receiving-code-review`, verify claims, fix verified issues, and rerun affected checks.
6. Record implementation and results in owning documentation, and commit prompt-scoped files locally on `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `deployment-pipeline-design` — maintain strict separation between automated pipeline gates, child drill artifacts, and operator launch sign-off.
- `secrets-management` — ensure volume encryption diagnostics and test fixtures do not expose host keyfiles, mount secrets, or credentials.
- `javascript-testing-patterns` — build deterministic file-based positive and negative tests with temporary fixtures.
- `requesting-code-review` — dispatch the required implementation review after self-verification.
- `receiving-code-review` — evaluate and verify review feedback with technical rigor.
- `caveman-commit` — write the required local commit message upon completion.
