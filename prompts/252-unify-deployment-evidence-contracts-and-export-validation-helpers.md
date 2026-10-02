# Phase 12K follow-up — unify deployment evidence contracts and export validation helpers

## Scope and why this is next

Complete the launch readiness evidence architecture consolidation across `scripts/ops/check-launch-readiness.js` by establishing modular exports for core deployment and reference validation helpers, hardening candidate discrimination and release provenance evidence validation for Category 10 (`deployment_and_rollback`), and providing comprehensive contract test coverage in `scripts/ops/check-launch-readiness.spec.js`.

Following Prompts 246–251:
- Categories 1 (`production_domain_tls`), 5 (`slo_and_alerting`), 6 (`backup_and_disaster_recovery`), 8 (`volume_encryption`), and 3 (`secrets_management`) each strictly evaluate candidate child contracts first (deferring full validation to approval time), evaluate dossiers against dedicated hardened validators (`validCaddyDossier`, `validCapacityDossier`, `validRecoveryDossier`, `validVolumeDossier`, `validSecretDossier`), and cleanly fail closed on any non-candidate, non-dossier evidence.
- Category 10 (`deployment_and_rollback`) in `checkEvidenceFileContents` permits local JSON paths for `client_provenance_evidence`, `server_provenance_evidence`, and `live_drill_evidence`. Unlike Categories 5 and 8, these provenance receipts are not deployment drill candidates and not unified launch dossiers. However, the validation check previously accepted any object with a generic `status: 'success'` without validating against contradictory fields such as `overall_status: 'failed'`, `success: false`, or present `errors`. Hardening this provenance evidence validation ensures that non-candidate non-dossier reports must be strictly passing, unbreached, and error-free, failing closed with `'A referenced deployment drill report is invalid or failed'` if any failure condition is present.
- Core validation helpers in `scripts/ops/check-launch-readiness.js`—including `validDeploymentRelease`, `parseDeploymentDrillTimestamp`, `validRecoveryReference`, `validVolumeReference`, and `validDomainTlsReference`—were internal functions not exported in `module.exports`, limiting direct unit testing and modular inspection.
- Calling `expandEvidenceGlob` or `checkEvidenceFileContents` standalone previously threw a `TypeError` if `baseDirs` was not explicitly supplied. Defaulting `baseDirs` to `[process.cwd()]` ensures resilient standalone execution and testing.

This is a repository-owned, dependency-safe hardening and maintenance step within Phase 12K. Prompt 201 still governs real production evidence collection and sign-off.

Planning baseline: clean worktree at commit `1146c0b` (`fix(ops): export and test supply chain contracts`).

## References read and execution prerequisites

Planning read:
- `AGENTS.md` phase-control, workflow, prompt, product, and standing rules
- `docs/build-plan.md` Phase 12 and Phase 12K (prompts 246–251)
- `docs/skills.md`
- `docs/system-architecture.md` §11–12
- `docs/security.md` TM-01, TM-04, TM-05, TM-15, and Phase 12K evidence integrity
- `docs/operations.md` Phase 12K and prompts 246–251
- `docs/launch-checklist.md` Category 10 (`deployment_and_rollback`)
- `prompts/201-production-launch-evidence-and-signoff.md`

Code inspected:
- `scripts/ops/check-launch-readiness.js` (`expandEvidenceGlob`, `checkEvidenceFileContents`, `validDeploymentDossier`, `isDeploymentDrillCandidate`, `validDeploymentRelease`, `parseDeploymentDrillTimestamp`, `validRecoveryReference`, `validVolumeReference`, `validDomainTlsReference`, `module.exports`)
- `scripts/ops/check-launch-readiness.spec.js` (Category 10 tests, reference tests, dossier contract tests)

## Non-goals

- Modifying runtime deployment or Docker compose configurations.
- Altering production container images or tags.
- Fabricating production deployment drill evidence or signing off on Category 10 without operator execution.

## Measurable requirements and implementation plan

### 1. Robust baseDirs handling and hardened deployment evidence in `scripts/ops/check-launch-readiness.js`

1. In `expandEvidenceGlob` and `checkEvidenceFileContents`, default `baseDirs` to `[process.cwd()]` if omitted or not a non-empty array:
   ```javascript
   const dirs = Array.isArray(baseDirs) && baseDirs.length > 0 ? baseDirs : [process.cwd()];
   ```
2. In `checkEvidenceFileContents` for `category === 'deployment_and_rollback'`:
   - If `isDeploymentDrillCandidate({ file, parsed })`, continue to approval-time validation.
   - If dossier indicators are present, evaluate `validDeploymentDossier(parsed, file)`.
   - For non-dossier non-candidate release provenance evidence, strictly validate:
     - `parsed` must be an object.
     - `parsed.status` must be a string equaling `'success'` (case-insensitive).
     - Any `overall_status` must equal `'passed'` or `'success'` (case-insensitive).
     - `parsed.success !== false`.
     - Zero errors (`parsed.error === undefined`, and `Array.isArray(parsed.errors) ? parsed.errors.length === 0 : !parsed.errors`).
     - Otherwise, fail closed and emit `'A referenced deployment drill report is invalid or failed'`.

### 2. Export validation helpers in `scripts/ops/check-launch-readiness.js`

Export the following helpers in `module.exports`:
- `validDeploymentRelease`
- `parseDeploymentDrillTimestamp`
- `validRecoveryReference`
- `validVolumeReference`
- `validDomainTlsReference`

### 3. Unit and contract test suite in `scripts/ops/check-launch-readiness.spec.js`

Add dedicated unit test suites covering:
1. `validDeploymentRelease`:
   - Accepts valid release object with valid 40-character hex commit SHA, valid current and previous image digests, and at least one differing image between current and previous.
   - Enforces `exact = true` key restrictions (`['reviewed_source_commit', 'current', 'previous']`).
   - Rejects null, non-objects, arrays.
   - Rejects malformed commit SHAs (non-string, length !== 40, non-hex).
   - Rejects missing or malformed `current` / `previous` objects.
   - Rejects invalid image references (e.g. unpinned, invalid syntax).
   - Rejects identical client and server images within the same pair.
   - Rejects identical current and previous image pairs (no change).
2. `parseDeploymentDrillTimestamp`:
   - Parses valid basic compact timestamp (`YYYYMMDDTHHMMSSZ`).
   - Parses valid ISO 8601 UTC timestamp (`YYYY-MM-DDTHH:mm:ssZ` and with `.sssZ`).
   - Rejects non-string values, malformed dates, and non-UTC dates.
3. Reference validation helpers (`validRecoveryReference`, `validVolumeReference`, `validDomainTlsReference`):
   - Accepts clean, non-empty, trimmed opaque string references.
   - Rejects leading/trailing whitespace, newlines (`\n`, `\r`), empty strings, `'change-me'`, `'__REQUIRED_*__'`, and `'<REQUIRED_*>'`.
4. Category 10 candidate and non-candidate discrimination:
   - Verifies that a non-candidate, non-dossier report with failed status fails closed and emits `'A referenced deployment drill report is invalid or failed'`.
   - Verifies that a non-candidate report with `errors` or singular `error` fails closed and emits `'A referenced deployment drill report is invalid or failed'`.
   - Verifies that referencing `[validLiveChild, failedNonCandidate]` fails closed.
   - Verifies that valid deployment dossiers alongside live receipts pass cleanly without blockers.

### 4. Verification and documentation

- Run `npm run ops:readiness-test` (all tests passing)
- Run `npm run ops:launch-drill-test` (all tests passing)
- Run `npm run ops:readiness-schema-test`
- Run `npm run ops:templates` and `npm run ops:templates-test`
- Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`
- Record prompt execution in `docs/build-plan.md` and `docs/launch-checklist.md`

## SKILLS USED

- `javascript-testing-patterns`: Design and structure Node.js test suites for unit and contract testing of deployment validators.
- `security-best-practices`: Ensure fail-closed evidence validation and prevent non-candidate bypasses.
- `requesting-code-review`: Prepare review context and dispatch code-reviewer subagent.
- `receiving-code-review`: Evaluate reviewer feedback technically before fixing or committing.
- `caveman-commit`: Author the concise commit message upon successful verification.
