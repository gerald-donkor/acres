# 230 — secret rotation drill hardening and automated test suite

## Scope and why this is next

Phase 12K is the earliest unfinished phase. At `cf0b906e3db1d0cc85af83c137a04409485ea030` on `main`, Prompt 229 hardened the deployment promotion and rollback drill runner (`scripts/ops/run-deployment-drill.sh`), enforced container dependency health checks and shutdown lifecycle invariants, and introduced `scripts/ops/run-deployment-drill.spec.js`.

However, the dedicated zero-downtime secret rotation and compromise response drill runner `scripts/ops/run-secret-rotation-drill.sh` (which executes Stage 5 of the Unified Launch Drill orchestrator `scripts/ops/run-launch-drills.sh`, produces Category 3 evidence for `scripts/ops/check-launch-readiness.js`, and verifies TM-15 zero-downtime rollover across all 7 secret classes) and its operational test coverage exhibit several gaps:

1. In `scripts/ops/run-secret-rotation-drill.sh`, CLI options with parameters (`--evidence-dir`, `--evidence-file`, `--api-url`, `--pghost`, `--pgport`, `--valkey-host`, `--valkey-port`) use naive `shift 2` without checking whether the option value is missing, empty, or another option flag (e.g. `--evidence-dir --dry-run` or `--evidence-file` at the end of argv). If an operator passes a flag without an argument or provides an empty value, the script fails unpredictably or misinterprets subsequent flags. The script must validate non-empty values fail-closed:
   `if [ $# -lt 2 ] || [ -z "$2" ] || [[ "$2" == --* ]]; then printf 'Error: %s requires a non-empty value\n' "$1" >&2; exit 1; fi`
   and reject unknown options with a clear error message and usage summary to stderr, exiting 1.
2. In `scripts/ops/run-secret-rotation-drill.sh`, step 1 ("Pre-rotation Validation & Operational Baseline Check") executes `scripts/ops/scan-secrets.sh` and `node scripts/ops/verify-volume-encryption.js >/dev/null`, but omits `scripts/ops/check-production-templates.sh`. Static templates must be validated fail-closed prior to secret rotation drills to ensure that environment templates and Compose definitions contain no drifted or unredacted secrets.
3. `scripts/ops/run-secret-rotation-drill.sh` currently lacks an automated regression unit test suite (`scripts/ops/run-secret-rotation-drill.spec.js`). Unlike sibling drill runners (`run-launch-drills.spec.js`, `verify-caddy-routing.spec.js`, `verify-volume-encryption.spec.js`, `verify-container-security.spec.js`, `run-deployment-drill.spec.js`), `run-secret-rotation-drill.sh` has no dedicated test harness validating:
   - CLI flags: `--help` and `-h` display usage and exit 0.
   - Unknown options exit 1 with an informative error message.
   - Missing or flag-like argument values for `--evidence-dir`, `--evidence-file`, `--api-url`, `--pghost`, `--pgport`, `--valkey-host`, `--valkey-port` exit 1 with a descriptive error.
   - Clean execution with `--dry-run` against production configurations emits valid Category 3 JSON evidence complying with `validateSecretRotationReport` in `scripts/ops/check-launch-readiness.js`:
     - `drill_type: "zero_downtime_secret_rotation_and_compromise_response"`
     - valid nonfuture ISO UTC timestamp
     - `status: "success"`
     - empty `errors` array
     - `tested_secret_classes` contains all 7 required classes (`session_secret`, `csrf_secret`, `postgres_passwords`, `valkey_password`, `storage_s3_keys`, `smtp_credentials`, `grafana_admin_password`)
     - `steps` contains all 7 verified steps (`session_rollover`, `csrf_rollover`, `database_rotation`, `valkey_rotation`, `storage_rotation`, `compromise_response`, `redaction_audit`) reporting `status: "passed"`
     - `steps.redaction_audit.raw_secrets_masked === true` and `steps.redaction_audit.zero_dev_passwords_detected === true`
   - Custom `--evidence-file` parameter routes output to the requested file path.
   - Custom `--evidence-dir` parameter routes output into the specified directory.
   - Fail-closed behavior:
     - When secret simulation or rollover fails, the script records `status: "failed"` in evidence, writes the failure evidence JSON, outputs the error to stderr, and exits 1.
     - When forbidden secret patterns (such as dev password sentinel strings or API keys) leak into evidence, the redaction audit throws an error and exits 1.
4. In `package.json`, `"ops:rotation-test"` is not defined and is not included in `npm run ops:check`.
5. In `scripts/ops/check-production-templates.sh`, `require_file scripts/ops/run-secret-rotation-drill.spec.js` must be declared and the script must statically assert that `run-secret-rotation-drill.sh` validates CLI options with non-empty checks.

This prompt hardens `scripts/ops/run-secret-rotation-drill.sh`, creates `scripts/ops/run-secret-rotation-drill.spec.js`, registers `ops:rotation-test` in `package.json` and `npm run ops:check`, updates template preflights, and records the verification in `docs/operations.md` and `docs/launch-checklist.md`.

## Authorities and verified references

- Re-read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §§18 and 22; `docs/operations.md` Phase 12K and secret rotation hardening; `docs/launch-checklist.md` Category 3 (`secrets_management`) and §5 Incident Response Runbooks; `docs/security.md` credential boundaries; and `docs/skills.md`.
- Inspect `scripts/ops/run-secret-rotation-drill.sh`, `scripts/ops/check-launch-readiness.js`, `scripts/ops/run-launch-drills.sh`, and `scripts/ops/check-production-templates.sh`.
- The operational contract for zero-downtime secret rotation and compromise response:
  - 7 tested secret classes: `session_secret`, `csrf_secret`, `postgres_passwords`, `valkey_password`, `storage_s3_keys`, `smtp_credentials`, `grafana_admin_password`.
  - 7 verified steps: `session_rollover`, `csrf_rollover`, `database_rotation`, `valkey_rotation`, `storage_rotation`, `compromise_response`, `redaction_audit`.
  - Fail-closed validation: invalid flags or missing values exit 1; forbidden secret leaks trigger redaction audit failure.
  - Category 3 compliance: generated evidence satisfies `validateSecretRotationReport` in `check-launch-readiness.js` and Stage 5 requirements in `run-launch-drills.sh`.

## Implementation plan

1. In `scripts/ops/run-secret-rotation-drill.sh`:
   - Harden CLI option parsing to validate non-empty values for `--evidence-dir`, `--evidence-file`, `--api-url`, `--pghost`, `--pgport`, `--valkey-host`, and `--valkey-port`.
   - In Step 1, add `scripts/ops/check-production-templates.sh` to pre-rotation validation alongside `scripts/ops/scan-secrets.sh` and `verify-volume-encryption.js`.
2. In `scripts/ops/run-secret-rotation-drill.spec.js`:
   - Implement comprehensive Node test suite (`node:test`, `node:assert`, `node:child_process`):
     - Test `--help` and `-h` flags display usage and exit 0.
     - Test unknown options exit 1 with clear error messages.
     - Test missing argument values exit 1 for `--evidence-dir`, `--evidence-file`, `--api-url`, `--pghost`, `--pgport`, `--valkey-host`, `--valkey-port`.
     - Test `--dry-run` executes cleanly and emits valid Category 3 JSON evidence.
     - Test `--evidence-file <path>` writes evidence directly to the target path.
     - Test `--evidence-dir <dir>` places evidence into the target directory.
     - Test fail-closed execution and redaction audit enforcement.
3. In `package.json`:
   - Add script `"ops:rotation-test": "node --test scripts/ops/run-secret-rotation-drill.spec.js"`.
   - Add `npm run ops:rotation-test` into `"ops:check"`.
4. In `scripts/ops/check-production-templates.sh`:
   - Add `require_file scripts/ops/run-secret-rotation-drill.spec.js`.
   - Add static assertion that `scripts/ops/run-secret-rotation-drill.sh` validates non-empty CLI options.
5. In `docs/operations.md` and `docs/launch-checklist.md`:
   - Document Prompt 230 hardening of secret rotation drill validation, pre-rotation template checks, and the automated regression test suite.

## Verification and acceptance

1. Run `npm run ops:rotation-test`.
2. Run `npm run ops:rotation-drill -- --dry-run`.
3. Run `npm run ops:templates`, `npm run ops:deployment-test`, `npm run ops:launch-drill-test`, and `npm run ops:check`.
4. Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
5. Dispatch an independent code review via `requesting-code-review`, evaluate findings with `receiving-code-review`, update documentation, and commit with `caveman-commit`.

## Expected impact, limits and rollback

- Expected behavior: `scripts/ops/run-secret-rotation-drill.sh` enforces fail-closed validation of CLI options, verifies operational templates prior to execution, and provides complete automated regression coverage in CI for Category 3 secret rotation and compromise response.
- Limits: The drill exercises verified protocol simulations and state machine rollovers in `--dry-run` mode without mutating live production credentials.
- Rollback: Revert this commit to restore previous secret rotation drill runner.

## SKILLS USED

- `deployment-pipeline-design` — specify promotion preflights, credential rotation procedures, and CI gate integration.
- `secrets-management` — verify zero-downtime secret rollover across all 7 production secret classes and enforce redaction audit invariants.
- `javascript-testing-patterns` — create robust regression test suite covering CLI options, argument parsing, evidence schema validity, and fail-closed branches.
- `requesting-code-review` — dispatch independent code review subagent.
- `receiving-code-review` — evaluate review feedback with technical rigor.
- `caveman-commit` — craft concise conventional commit message.
