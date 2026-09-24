# 185 — volume encryption baseline and evidence validation

## Scope and why this is next

The committed baseline is `91ff1e4` on `main`; the worktree is clean when this prompt was prepared. This is a bounded Phase 12 operational orchestrator, volume encryption baseline, key separation invariant, and launch readiness cross-validation step under `docs/build-plan.md` §13, §19, §21, §22, `docs/launch-checklist.md` §3.8, §4, §7, and `docs/operations.md`.

Prompts 174–184 established database pool & server telemetry, added 4 Prometheus alert rules (expanding the operational alert suite to 11 rules), added visual panels in Grafana (100% alert coverage), reconciled all 11 incident runbooks in `docs/launch-checklist.md` §5, enforced Category 5 & 6 SLO floors/ceilings, bubbled up database baseline telemetry (from stage 6), disaster recovery baseline telemetry (from stage 7), deployment baseline telemetry (from stage 3), and secret rotation baseline telemetry (from stage 5) into the Unified Launch Evidence Dossier, and hardened `checkEvidenceFile` to cross-validate capacity, database, restore, storage reconciliation, deployment, and secret rotation child evidence.

However, several operational gaps remain in stage 4 (`volume_encryption`) baseline aggregation and child evidence cross-validation:
1. In `scripts/ops/verify-volume-encryption.js`, the script outputs console text or prints JSON to stdout with `--json`, but lacks an `--output <file>` option to write structured JSON drill evidence directly to disk.
2. In `scripts/ops/run-launch-drills.sh`, stage 4 (`volume_encryption`) executes `node scripts/ops/verify-volume-encryption.js` without `--output`, omitting child evidence `volume-encryption-evidence-<timestamp>.json` from `$EVIDENCE_DIR`.
3. In `scripts/ops/run-launch-drills.sh`, the orchestrator emits the Unified Launch Evidence Dossier (`dossier`) with a simple summary flag `volumeEncryption: "passed" | "failed"`, completely omitting a structured top-level `volumeEncryptionBaseline` (covering `totalRequiredMounts`, `validMountsCount`, `keySeparationVerified`, `violationsDetected`, and `scannedPathsCount`) and omitting `summary.volumeEncryptionCompliance`.
4. In `scripts/ops/check-launch-readiness.js`, `checkEvidenceFile` does not cross-validate volume encryption child evidence:
   - If an approved Category 8 section references `volume-encryption-evidence-*.json`, `checkEvidenceFile` does not check whether `parsed.status === 'success'`, whether `parsed.valid === true`, whether `parsed.errors` is empty, whether `parsed.keySeparation.verified === true`, whether `parsed.keySeparation.detectedViolations` is empty, or whether all required stateful mounts passed (`parsed.evaluatedMounts.every(m => m.passed === true)`). An evidence file reporting an unencrypted direct mount or a detected keyfile in persistent storage slips through without blocking launch approval.
5. In `scripts/ops/check-launch-readiness.js`, `checkEvidenceFile` does not inspect Unified Launch Evidence Dossiers for volume encryption baseline breaches or compliance failure (`parsed.volumeEncryptionBaseline?.status === 'breached'` or `parsed.summary?.volumeEncryptionCompliance === 'failed'`).
6. In `scripts/ops/check-production-templates.sh`, the validator does not assert that `run-launch-drills.sh` emits `volumeEncryptionBaseline` and `volumeEncryptionCompliance`.
7. In `scripts/ops/run-launch-drills.spec.js`, `assertDossierSchema(dossier)` does not validate `volumeEncryptionBaseline` or `summary.volumeEncryptionCompliance`.
8. In `scripts/ops/check-launch-readiness.spec.js`, there is no test coverage for volume encryption drill evidence failure blocking (status, validity, errors, key separation violation, detected keyfile, mount failure) or dossier volume encryption baseline breach blocking.
9. In `scripts/ops/verify-volume-encryption.spec.js`, there is no test coverage for the `--output <file>` option.

Add `--output <file>` option to `scripts/ops/verify-volume-encryption.js`. Emit child evidence `volume-encryption-evidence-${STAMP}.json` in Stage 4 of `scripts/ops/run-launch-drills.sh`. Bubble up `volumeEncryptionBaseline` and `summary.volumeEncryptionCompliance` into the Unified Launch Evidence Dossier. Cross-validate volume encryption child evidence and dossier volume encryption baseline in `checkEvidenceFile` (`scripts/ops/check-launch-readiness.js`). Expand unit test suites in `scripts/ops/verify-volume-encryption.spec.js`, `scripts/ops/run-launch-drills.spec.js`, and `scripts/ops/check-launch-readiness.spec.js`. Assert dossier baseline emission in `scripts/ops/check-production-templates.sh`. Update `docs/operations.md`, `docs/launch-checklist.md`, and `docs/build-plan.md`. Operator launch sign-off remains open.

## References and verified baseline

- Re-read `AGENTS.md` §§2, 4–7, 10, `docs/build-plan.md` §§13, 19, 21, 22, `docs/operations.md` (prompts 174–184 records, Phase 12K section), `docs/launch-checklist.md` §§3.8, 4, 7, and `docs/skills.md`.
- Inspect `scripts/ops/verify-volume-encryption.js`, `scripts/ops/verify-volume-encryption.spec.js`, `scripts/ops/run-launch-drills.sh`, `scripts/ops/run-launch-drills.spec.js`, `scripts/ops/check-launch-readiness.js`, `scripts/ops/check-launch-readiness.spec.js`, and `scripts/ops/check-production-templates.sh`.
- Child evidence structure emitted by stage 4 runner:
  - `volume-encryption-evidence-<timestamp>.json`:
    - `drill_type`: `"production_volume_encryption_and_key_separation"`
    - `timestamp`: string
    - `status`: `"success"` | `"failed"` (`"success"` required)
    - `valid`: boolean (true required)
    - `errors`: array (must be empty)
    - `warnings`: array
    - `totalRequiredMounts`: number (9 required)
    - `validMountsCount`: number (9 required)
    - `evaluatedMounts`: array of 9 stateful mount objects with `passed: true`
    - `keySeparation`:
      - `verified`: boolean (true required)
      - `scannedPaths`: array of strings
      - `detectedViolations`: array (must be empty)
    - `readinessEvaluated`: object or null

## Implementation contract

1. **Add `--output <file>` support to `scripts/ops/verify-volume-encryption.js`.**
   - In `runCli()`:
     - Parse `--output <file>` / `-o <file>` from CLI arguments:
       ```javascript
       let outputPath = null;
       // ...
       } else if ((arg === '--output' || arg === '-o') && args[i + 1]) {
         outputPath = path.resolve(process.cwd(), args[++i]);
       }
       ```
     - Document `--output <file>` in `--help`.
     - When `outputPath` is provided:
       - Construct payload:
         ```javascript
         const payload = {
           drill_type: 'production_volume_encryption_and_key_separation',
           timestamp: new Date().toISOString(),
           status: result.valid ? 'success' : 'failed',
           valid: result.valid,
           errors: result.errors,
           warnings: result.warnings,
           totalRequiredMounts: result.totalRequiredMounts,
           validMountsCount: result.validMountsCount,
           evaluatedMounts: result.evaluatedMounts,
           keySeparation: result.keySeparation,
           readinessEvaluated: result.readinessEvaluated,
         };
         ```
       - Ensure target directory exists (`fs.mkdirSync(path.dirname(outputPath), { recursive: true })`).
       - Write JSON formatted with 2-space indentation to `outputPath`.
     - If `asJson` is true: output JSON payload to stdout and exit `result.valid ? 0 : 1`.
     - Otherwise, print human-readable summary to stdout and exit `result.valid ? 0 : 1`.

2. **Emit child evidence and bubble up `volumeEncryptionBaseline` in `scripts/ops/run-launch-drills.sh`.**
   - In Stage 4 execution:
     Update:
     ```bash
     # Stage 4: production volume encryption key separation
     run_stage "volume_encryption" "Volume encryption + key separation" \
       "node scripts/ops/verify-volume-encryption.js --output \"${EVIDENCE_DIR}/volume-encryption-evidence-${STAMP}.json\""
     ```
   - In the Node.js dossier aggregation script inside `run-launch-drills.sh`:
     - Discover stage 4 child evidence:
       - Find artifact in `stages.find(s => s.stage_id === "volume_encryption")` matching `volume-encryption-evidence-*.json`.
       - If file exists and parses as JSON, inspect its contents.
       - Validate `volPassed`:
         `volStage?.status === "PASSED" && volEvidence && volEvidence.status === "success" && volEvidence.valid === true && Array.isArray(volEvidence.errors) && volEvidence.errors.length === 0 && Array.isArray(volEvidence.evaluatedMounts) && volEvidence.evaluatedMounts.length >= 9 && volEvidence.evaluatedMounts.every((m) => m.passed === true) && volEvidence.keySeparation?.verified === true && Array.isArray(volEvidence.keySeparation?.detectedViolations) && volEvidence.keySeparation.detectedViolations.length === 0`.
       - If `volPassed` is true, populate:
         ```javascript
         volumeEncryptionBaseline = {
           status: "verified",
           totalRequiredMounts: volEvidence.totalRequiredMounts,
           validMountsCount: volEvidence.validMountsCount,
           keySeparationVerified: volEvidence.keySeparation.verified,
           violationsDetected: volEvidence.keySeparation.detectedViolations.length,
           scannedPathsCount: volEvidence.keySeparation.scannedPaths?.length || 0,
         };
         ```
         and `summary.volumeEncryptionCompliance = "passed"`.
       - Otherwise, populate:
         ```javascript
         volumeEncryptionBaseline = {
           status: "breached",
           error_message: volStage?.error_message || "stage 4 failed or child volume encryption evidence failed verification",
         };
         ```
         and `summary.volumeEncryptionCompliance = "failed"`.
     - In `dossier` object:
       Add top-level field:
       `volumeEncryptionBaseline,`
       And in `dossier.summary`:
       `volumeEncryptionCompliance,`
       preserving `volumeEncryption: statuses[3] === "PASSED" ? "passed" : "failed"` for backward compatibility.

3. **Cross-validate volume encryption child evidence in `checkEvidenceFile` (`scripts/ops/check-launch-readiness.js`).**
   - For volume encryption drill evidence files (matching `volume-encryption-evidence-` or containing `drill_type === 'production_volume_encryption_and_key_separation'` or having `keySeparation` and `evaluatedMounts`):
     - If `typeof parsed.status === 'string' && parsed.status.toLowerCase() !== 'success'`:
       add blocker: `Approved evidence file '${ref}' reports volume encryption verification failure (status: "${parsed.status}")`.
     - If `parsed.valid === false`:
       add blocker: `Approved evidence file '${ref}' reports invalid volume encryption configuration (valid: false)`.
     - If `Array.isArray(parsed.errors) && parsed.errors.length > 0`:
       add blocker: `Approved evidence file '${ref}' reports volume encryption error(s): ${parsed.errors.join('; ')}`.
     - If `parsed.keySeparation && typeof parsed.keySeparation === 'object'`:
       - If `parsed.keySeparation.verified === false`:
         add blocker: `Approved evidence file '${ref}' reports Key Separation Invariant violation (keySeparation.verified: false)`.
       - If `Array.isArray(parsed.keySeparation.detectedViolations) && parsed.keySeparation.detectedViolations.length > 0`:
         add blocker: `Approved evidence file '${ref}' reports ${parsed.keySeparation.detectedViolations.length} detected keyfile violation(s) in volume mounts or repository`.
     - If `Array.isArray(parsed.evaluatedMounts)`:
       - Find any mounts where `m && m.passed === false`:
       - If any found, add blocker: `Approved evidence file '${ref}' reports ${failedMounts.length} failed stateful storage mount(s): ${failedMounts.map((m) => m.service + ':' + m.containerPath).join(', ')}`.
   - For Unified Launch Evidence Dossier files:
     - Volume encryption baseline & compliance checks:
       - If `parsed.volumeEncryptionBaseline?.status === 'breached' || parsed.volumeEncryptionBaseline?.status === 'failed'`:
         add blocker: `Approved evidence file '${ref}' reports volume encryption baseline breach (volumeEncryptionBaseline.status: "${parsed.volumeEncryptionBaseline.status}")`.
       - If `parsed.summary?.volumeEncryptionCompliance === 'failed' || parsed.summary?.volumeEncryptionCompliance === 'failure'`:
         add blocker: `Approved evidence file '${ref}' reports volume encryption compliance failure (summary.volumeEncryptionCompliance: "${parsed.summary.volumeEncryptionCompliance}")`.

4. **Update `scripts/ops/check-production-templates.sh`.**
   - Add assertions verifying that `scripts/ops/run-launch-drills.sh` includes `volumeEncryptionBaseline` and `volumeEncryptionCompliance`.

5. **Expand unit tests in `scripts/ops/verify-volume-encryption.spec.js`.**
   - Add test verifying that CLI invocation with `--output <path>` creates a structured JSON evidence file matching expected schema (`drill_type`, `status: "success"`, `valid: true`, 9 evaluated mounts with `passed: true`, `keySeparation.verified: true`, empty errors and detectedViolations).

6. **Expand unit tests in `scripts/ops/run-launch-drills.spec.js`.**
   - In `assertDossierSchema(dossier)`:
     - Assert `typeof dossier.volumeEncryptionBaseline === 'object'` and `['verified', 'breached'].includes(dossier.volumeEncryptionBaseline.status)`.
     - Assert `typeof dossier.summary.volumeEncryptionCompliance === 'string'` and `['passed', 'failed'].includes(dossier.summary.volumeEncryptionCompliance)`.

7. **Expand unit tests in `scripts/ops/check-launch-readiness.spec.js`.**
   - Add unit test: `validateReadiness blocks approval when volume encryption evidence reports failure, invalid config, errors, key separation violation, detected keyfile, or mount failure`.
   - Add unit test: `validateReadiness blocks approval when evidence dossier reports volume encryption baseline breach or compliance failure`.
   - Add unit test: `validateReadiness accepts valid passed volume encryption evidence and compliant dossier`.

8. **Documentation updates.**
   - Update `docs/launch-checklist.md` §3.8, §4.
   - Update `docs/operations.md` recording Prompt 185.
   - Update `docs/build-plan.md` recording Prompt 185.
   - Operator launch sign-off remains open.

## Verification commands and pass criteria

1. Run template checks:
   `bash scripts/ops/check-production-templates.sh` -> exit 0.
2. Run unit tests for volume encryption:
   `node --test scripts/ops/verify-volume-encryption.spec.js` -> exit 0, all tests pass.
3. Run unit tests for launch drills:
   `node --test scripts/ops/run-launch-drills.spec.js` -> exit 0, all tests pass.
4. Run unit tests for launch readiness:
   `node --test scripts/ops/check-launch-readiness.spec.js` -> exit 0, all tests pass.
5. Run full operational check suite:
   `npm run ops:check` -> exit 0.
6. Dry-run launch readiness:
   `bash scripts/ops/launch-readiness.sh infra/launch/readiness.example.json` -> fails closed on unresolved template placeholders (exit 1).

## What not to do

- Do NOT weaken any fail-closed launch readiness gates.
- Do NOT alter live volume encryption configurations or mutate production environments during dry-run.
- Do NOT ignore detected keyfile violations or allow direct unencrypted mounts.
- Do NOT sign off on operator launch categories (operator launch sign-off remains open).

## Open questions / decisions made

- `volumeEncryptionBaseline` follows the identical pattern established by `databaseTelemetryBaseline`, `disasterRecoveryBaseline`, `deploymentBaseline`, and `secretRotationBaseline`, completing machine-readable baseline coverage across all stateful and operational drill stages.
- Child evidence cross-validation in `checkEvidenceFile` operates cwd-first and relative to the readiness document directory, preserving existing resolution mechanics.

## SKILLS USED

- `secrets-management`: Review volume encryption key separation and unlock material non-co-location invariants
- `security-best-practices`: Fail-closed gate enforcement and host storage security verification
- `deployment-pipeline-design`: Review Compose volume mount and orchestration declarations
- `javascript-testing-patterns`: Node.js test runner structure, assertion design, and edge case coverage
- `requesting-code-review`: Review dispatch workflow and code reviewer subagent context preparation
- `receiving-code-review`: Technical rigor and validation when evaluating review feedback
- `caveman-commit`: Structured conventional commit generation upon completion
