# Prompt 382 — Managed verifier unit tests and operations preflight suite

## Scope and why this is next

Planning baseline: `6cac2a2` on `main`, 2026-10-16; working tree clean before
this prompt. Parent: Phase 12 operations and launch hardening, approved Prompt 370,
ordered step 5 and step 7 ("Managed operations and launch evidence").

Prompts 370–381 established the Vercel-managed target runtime, storage, scanning,
outbox, throttling, preview deployment, managed readiness schema, validator, operator
handoff templates, branched launch drill runner, static integrity checks, and top-level
readiness preflight.

In Prompt 380, four dedicated offline verification tools were introduced to generate
standardized audit receipts for the `vercel-managed-production` drill pipeline:
1. `scripts/ops/verify-managed-ingress.js` (Stage 3: multi-service routing, security headers, rollback preflight)
2. `scripts/ops/verify-managed-volume-encryption.js` (Stage 4: Neon AWS KMS AES-256, Blob encryption, Firecracker isolation)
3. `scripts/ops/verify-managed-secret-rotation.js` (Stage 5: 90-day rotation cadence, indirect secret URIs, dev credential scan)
4. `scripts/ops/verify-managed-restore-drill.js` (Stage 7: Neon WAL streaming, 7-day PITR window, RTO/RPO targets, Blob durability)

However, an audit of test coverage across `scripts/ops/` reveals that while all 32
other scripts in `scripts/ops/` possess dedicated, comprehensive unit and contract test
specifications (`.spec.js`) integrated into `package.json` test scripts, these four
managed verifiers have:
- Zero dedicated test specifications (`verify-managed-ingress.spec.js`, `verify-managed-volume-encryption.spec.js`, `verify-managed-secret-rotation.spec.js`, and `verify-managed-restore-drill.spec.js` do not exist).
- Zero direct unit test execution (in `run-launch-drills.spec.js`, they are mocked via stubs, leaving their actual CLI argument parsing, configuration validation, environment scanning, receipt emission, and failure modes unverified).
- No npm script in `package.json` (e.g. `ops:managed-drills-test`).
- No integration into `npm run ops:check`, leaving a testing gap in pre-commit and CI verification gates.

This prompt implements dedicated, robust unit and contract test specifications for all
four managed verifiers, adds `ops:managed-drills-test` to `package.json`, integrates it
into `npm run ops:check`, and records the verified testing foundation in `docs/launch-checklist.md`,
`docs/operations.md`, `docs/vercel-deployment.md`, and `docs/build-plan.md`.

Stop for phase-control approval before execution.

## References and verified interfaces

Read at execution:

- `AGENTS.md`, especially §§2, 2.1, 3, 5–10 and phase-control commands.
- `docs/build-plan.md` Section 13 (Phase 12), production-target amendment, and Prompt 381 record.
- `docs/vercel-deployment.md` "Target and gates", "Resume here", and Prompts 380–381 records.
- `docs/launch-checklist.md` "Selected managed profile — Prompt 370", 11 launch categories, and pre-flight prerequisites.
- `docs/operations.md` root scripts, launch-readiness contracts, and template check standards.
- `package.json` scripts: `ops:check`, `ops:launch-drill-test`, `ops:static-integrity-test`.
- `scripts/ops/verify-managed-ingress.js`
- `scripts/ops/verify-managed-volume-encryption.js`
- `scripts/ops/verify-managed-secret-rotation.js`
- `scripts/ops/verify-managed-restore-drill.js`
- `scripts/ops/assemble-launch-dossier.js` (`RECEIPTS_MANAGED`, `TYPES_MANAGED`, `readReceipt`, `freshTimestamp`)
- Reference specs for testing patterns: `scripts/ops/verify-volume-encryption.spec.js`, `scripts/ops/run-static-integrity-checks.spec.js`, `scripts/ops/verify-caddy-routing.spec.js`.

## SKILLS USED

- `architecture-patterns` — ensure clean separation of concerns and contract validation between managed verifier tools and dossier aggregation.
- `deployment-pipeline-design` — integrate managed verification suites into the automated preflight pipeline (`ops:check`) and CI.
- `secrets-management` — verify secret masking, dev password scanning (`DEV_PASSWORDS`), and zero-secret receipt generation.
- `security-threat-model` — fail-closed preflights, evidence verification, and robust exception handling.
- `security-best-practices` — secure file operations (`node:fs`, temporary directory isolation, strict argument parsing).
- `javascript-testing-patterns` — Node.js native test runner (`node:test`, `node:assert/strict`) for unit, contract, and subprocess CLI tests.
- `requesting-code-review` — stage 1 code review subagent dispatch.
- `receiving-code-review` — stage 2 technical review evaluation and verification.
- `caveman-commit` — conventional commit formatting without AI trailers.

## Implementation sequence

### 1. Create `scripts/ops/verify-managed-ingress.spec.js`

Implement comprehensive unit and contract tests using `node:test` and `node:assert/strict`:
1. **CLI usage & flag parsing (`parseArgs` & subprocess)**:
   - `--help` and `-h` display usage and terminate with exit code 0.
   - Missing `--output` outputs error to stderr and terminates with exit code 1.
   - Accepts `--output <file>`, `--output=<file>`, `-o <file>`, `-o=<file>`.
   - Accepts custom `--vercel-config <file>` and `--vercel-config=<file>`.
   - Rejects unparseable/invalid config file paths gracefully with exit code 1.
2. **Configuration evaluation (`evaluateManagedIngress`)**:
   - Returns `{ valid: false, errors: ['Configuration file not found: ...'] }` when target config file does not exist.
   - Returns `{ valid: false, errors: ['Failed to parse configuration: ...'] }` when target config is invalid JSON.
   - Returns error when `services.client` or `services.api` is missing.
   - Returns error when rewrites lack `/cron/dispatch` or `/(.*)`.
   - Returns error when `/cron/dispatch` does not precede `/(.*)` in `rewrites`.
   - Returns valid result when evaluated against repository root `vercel.json`:
     `valid: true`, `errors: []`, `routesEvaluated: 12`, `routesPassed: 12`, `hasClient: true`, `hasApi: true`.
3. **Receipt generation & file emission**:
   - Executes CLI against temporary directory output; verifies file is written with mode 0600/0644.
   - Creates parent directories recursively if absent.
   - Validates generated JSON structure against `assemble-launch-dossier.js` expectations:
     `drill_type: 'managed_ingress_deployment_verification'`, `status: 'success'`, `valid: true`,
     `target_architecture: 'vercel-managed-production'`, `execution_mode: 'simulation'`,
     `routing_verified: true`, `services_verified: true`, `rollback_procedure_verified: true`,
     `preview_deployment_verified: true`, `routes_evaluated: 12`, `routes_passed: 12`, `errors: []`.

### 2. Create `scripts/ops/verify-managed-volume-encryption.spec.js`

Implement comprehensive unit and contract tests:
1. **CLI usage & flag parsing (`parseArgs` & subprocess)**:
   - `--help` and `-h` display usage and terminate with exit code 0.
   - Missing `--output` terminates with exit code 1.
   - Accepts `--output <file>`, `-o <file>`, etc.
2. **Encryption assertions (`evaluateManagedEncryption`)**:
   - Validates architectural guarantees for `vercel-managed-production`:
     Neon AWS KMS AES-256 envelope encryption at rest, Vercel Blob encryption at rest,
     ephemeral compute isolation in AWS microVMs (Firecracker), and key separation.
   - Returns `valid: true`, `errors: []`, `storageEncryptionVerified: true`, `neonKmsAes256: true`,
     `ephemeralComputeIsolated: true`, `keySeparationVerified: true`, `cloudStorageEncrypted: true`.
3. **Receipt generation & file emission**:
   - Generates receipt in temporary directory.
   - Validates receipt structure against `assemble-launch-dossier.js` (`TYPES_MANAGED.volume`):
     `drill_type: 'managed_volume_encryption_verification'`, `status: 'success'`, `valid: true`,
     `target_architecture: 'vercel-managed-production'`, `execution_mode: 'simulation'`,
     `storage_encryption_verified: true`, `neon_aws_kms_aes256: true`, `ephemeral_compute_isolated: true`,
     `key_separation_verified: true`, `cloud_storage_encrypted: true`, `errors: []`.

### 3. Create `scripts/ops/verify-managed-secret-rotation.spec.js`

Implement comprehensive unit and contract tests:
1. **CLI usage & flag parsing (`parseArgs` & subprocess)**:
   - `--help` and `-h` display usage and terminate with exit code 0.
   - Missing `--output` terminates with exit code 1.
   - Accepts `--dry-run` flag.
2. **Secret rotation and credential scan (`evaluateManagedSecretRotation`)**:
   - In a clean process environment, returns:
     `valid: true`, `errors: []`, `rotationCadenceDays: 90`, `cadenceCompliant: true`,
     `indirectReferencesVerified: true`, all 8 steps `passed`, and
     `redaction_audit.zero_dev_passwords_detected: true`.
   - When any dev password (`DEV_PASSWORDS`) is present in `process.env` (e.g. `TEST_VAR=acres_superuser_dev_password`),
     fails closed: returns `valid: false`, `errors` includes matching variable name,
     `redaction_audit.status: 'failed'`, and `redaction_audit.zero_dev_passwords_detected: false`.
   - Tests detection across all entries in `DEV_PASSWORDS`: `acres_superuser_dev_password`,
     `acres_migrator_dev_password`, `acres_app_dev_password`, `acres_test_dev_password`,
     `acres_valkey_dev_password`.
3. **Receipt generation & file emission**:
   - Generates receipt in temporary directory on clean execution.
   - Subprocess exits with code 1 and writes no success receipt when dev password is leaked in environment.
   - Validates receipt structure against `assemble-launch-dossier.js` (`TYPES_MANAGED.rotation`):
     `drill_type: 'managed_secret_rotation_verification'`, `status: 'success'`, `valid: true`,
     `target_architecture: 'vercel-managed-production'`, `rotation_cadence_days: 90`,
     `cadence_compliant: true`, `indirect_references_verified: true`, `steps`.

### 4. Create `scripts/ops/verify-managed-restore-drill.spec.js`

Implement comprehensive unit and contract tests:
1. **CLI usage & flag parsing (`parseArgs` & subprocess)**:
   - `--help` and `-h` display usage and terminate with exit code 0.
   - Missing `--output` terminates with exit code 1.
   - Accepts `--output <file>`, `-o <file>`, etc.
2. **Disaster recovery and PITR assertions (`evaluateManagedRestore`)**:
   - Validates architectural guarantees for `vercel-managed-production`:
     Neon continuous WAL archiving with 7-day PITR recovery window,
     RTO objective <= 4 hours, RPO objective <= 1 hour, Vercel Blob durability (11 9's).
   - Returns `valid: true`, `errors: []`, `pitrRecoveryWindowDays: 7`, `pitrPreflightVerified: true`,
     `rtoHours: 4`, `rtoCompliant: true`, `rpoHours: 1`, `rpoCompliant: true`,
     `blobDurabilityVerified: true`, `durationSeconds: 120`, `rtoTargetSeconds: 14400`.
3. **Receipt generation & file emission**:
   - Generates receipt in temporary directory.
   - Validates receipt structure against `assemble-launch-dossier.js` (`TYPES_MANAGED.restore`):
     `drill_type: 'managed_restore_drill_verification'`, `status: 'success'`, `valid: true`,
     `target_architecture: 'vercel-managed-production'`, `execution_mode: 'simulation'`,
     `pitr_recovery_window_days: 7`, `pitr_preflight_verified: true`, `rto_hours: 4`,
     `rto_compliant: true`, `rpo_hours: 1`, `rpo_compliant: true`, `blob_durability_verified: true`,
     `duration_seconds: 120`, `rto_target_seconds: 14400`, `errors: []`.

### 5. Package scripts and `ops:check` integration

1. In `package.json`:
   - Add script:
     `"ops:managed-drills-test": "node --test scripts/ops/verify-managed-ingress.spec.js scripts/ops/verify-managed-volume-encryption.spec.js scripts/ops/verify-managed-secret-rotation.spec.js scripts/ops/verify-managed-restore-drill.spec.js"`
   - Integrate `"npm run ops:managed-drills-test"` into `"ops:check"`.
2. Verify `npm run ops:managed-drills-test` and `npm run ops:check` pass cleanly.

### 6. Documentation updates

1. Update `docs/launch-checklist.md`: document unit test coverage and commands for managed drill verifiers.
2. Update `docs/operations.md`: document `ops:managed-drills-test` in the operations script index.
3. Update `docs/vercel-deployment.md`: record Prompt 382 verification evidence.
4. Update `docs/build-plan.md`: record Prompt 382 entry under Phase 12 managed target.

### 7. Code review and local commit

1. Self-verify all new tests pass with 0 errors.
2. Dispatch independent read-only reviewer via `requesting-code-review`.
3. Evaluate feedback with technical rigor using `receiving-code-review`.
4. Commit to `main` using `caveman-commit`.

## Acceptance criteria

- `scripts/ops/verify-managed-ingress.spec.js` passes with 100% assertions covering CLI arguments, configuration validation, precedence, error handling, and receipt structure.
- `scripts/ops/verify-managed-volume-encryption.spec.js` passes with 100% assertions covering CLI arguments, encryption assertions, and receipt structure.
- `scripts/ops/verify-managed-secret-rotation.spec.js` passes with 100% assertions covering CLI arguments, dev credential detection/fail-closed behavior, rotation cadence, and receipt structure.
- `scripts/ops/verify-managed-restore-drill.spec.js` passes with 100% assertions covering CLI arguments, PITR/RTO/RPO assertions, and receipt structure.
- `npm run ops:managed-drills-test` passes cleanly with 0 failures.
- `npm run ops:check` passes with `ops:managed-drills-test` integrated.
- Reference Compose checks retain 100% backward compatibility.

## Verification

Execute with Node 24:

```bash
node --test scripts/ops/verify-managed-ingress.spec.js
node --test scripts/ops/verify-managed-volume-encryption.spec.js
node --test scripts/ops/verify-managed-secret-rotation.spec.js
node --test scripts/ops/verify-managed-restore-drill.spec.js
npm run ops:managed-drills-test
npm run ops:launch-drill-test
npm run ops:check
npm run lint
npm run typecheck
git diff --check
```

## Non-goals, impact and rollback

- Non-goals: No production promotion; no cloud mutations; no paid tier upgrades; no alteration of reference Compose+Caddy drill mechanics.
- Impact: Closes the test coverage gap for the four managed drill verifier scripts introduced in Prompt 380, integrating their unit and contract specifications directly into `ops:check`.
- Rollback: Revert new test files and package.json additions.
