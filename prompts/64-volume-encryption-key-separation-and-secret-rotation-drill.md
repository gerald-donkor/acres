# 64 - production volume encryption key separation and secret rotation drill

## Scope, and why it is next

The committed repository is on `main` at `1ef64bc` (`feat(ops): add caddy routing and deployment drill`).
Phases 1 through 10 are functionally complete, Phase 11A (Gemini free-tier draft preview)
is implemented as a disabled-by-default preview strictly excluded from production launch,
and Phase 12 operational foundations (12A templates/preflights, 12B telemetry/retention,
12C E2E journeys, 12D launch readiness decision record, 12E browser verification remediation,
12F disaster recovery restore drill and object reconciliation, and 12G Caddy same-origin ingress
and deployment drill) are committed.

However, two critical operational and security verification requirements remain open
across the build records and threat model:

1. **Volume Encryption & Key Separation Verification (TM-21)**:
   In `docs/build-plan.md` Lines 80–82, 329–330, and 569–571:
   > "Define the production PostgreSQL host/block-volume encryption and operator key-recovery contract;
   > a labelled disposable development volume may remain unencrypted."
   > "Production-profile inspection proves the database volume is encrypted and unlock material
   > is not stored with the volume; operator key recovery is exercised outside CI logs."
   > "production-profile inspection extends the encrypted-volume/key-separation proof to Garage."
   > "production PostgreSQL/Garage encrypted-mount inspection, unlock-material separation,
   > and the operator-only recovery/rotation procedure."
   And in `docs/security.md` (TM-21 offline disclosure of live database/object volumes, Lines 434–435):
   > "Docker/Compose production config, image builds, readiness through Caddy, rollback, backup restore,
   > DB/object reconciliation, and encrypted-mount/key recovery drills still require a Docker-capable
   > production-like host."
   And in `infra/launch/readiness.example.json` Category 8 (`volume_encryption`):
   > Requires host-level volume encryption mechanism (LUKS2/KMS), encrypted mount paths for all
   > stateful services (PostgreSQL, Valkey, Garage, ClamAV, Caddy, Prometheus, Grafana),
   > key separation confirmation (`key_separation_confirmed: true`), and designated key recovery owner.

2. **Secrets Management & Zero-Downtime Secret Rotation Drill (TM-15)**:
   In `docs/build-plan.md` Line 562:
   > "- **Outcome/behavior:** ... secret rotation, dependency/SAST/container scanning..."
   And in `docs/security.md` (TM-15 secrets management and rotation drill, Line 239):
   > "Secret manager/injection, scoped identities, deeper SAST/dependency/container scanning,
   > redaction, rotation drill; artifact/image/log inspection"
   And in `infra/launch/readiness.example.json` Category 3 (`secrets_management`):
   > Requires defined rotation cadence (days), compromise response runbook reference,
   > and verified procedures for rotating database passwords, Valkey tokens, session signing secrets,
   > CSRF secrets, and storage access keys without service outage.

This prompt implements **Phase 12H**:
1. **Production Volume Encryption & Key Separation Verification Suite (`scripts/ops/verify-volume-encryption.js` & `.spec.js`)**:
   - Inspects `infra/compose/docker-compose.production.example.yml` and `infra/env/production.env.example`
     to verify all stateful service volumes (PostgreSQL, Valkey, Garage meta/data, ClamAV, Caddy, Prometheus, Grafana)
     have explicit encrypted mount declarations.
   - Evaluates host-level volume encryption configurations against approved mechanisms (`LUKS2/dm-crypt`, `aws:kms`, `gcp:cmek`, `azure:keyvault`).
   - Enforces the strict **Key-Separation Invariant**: validates that keyfiles, passphrases, and key-derivation material
     are not located within stateful volume mounts, backup archives, or environment files.
   - Validates key recovery governance: designated recovery owner, dual-custody parameters, and emergency recovery runbook.
   - Comprehensive unit test suite (`scripts/ops/verify-volume-encryption.spec.js`) asserting clean configs, missing encrypted mount detection, key co-location detection, and invalid mechanism rejection.
2. **Automated Secret Rotation & Compromise Response Drill Runner (`scripts/ops/run-secret-rotation-drill.sh`)**:
   - Executes an automated drill verifying zero-downtime rotation procedures across all production secret classes:
     - PostgreSQL database passwords (`ACRES_APP_PASSWORD`, `ACRES_MIGRATOR_PASSWORD`);
     - Valkey authentication token (`VALKEY_PASSWORD`);
     - Session secret (`SESSION_SECRET`) via dual-secret rollover window;
     - CSRF secret (`CSRF_SECRET`);
     - Garage / S3 storage access keys (`STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`);
     - SMTP credentials (`SMTP_USERNAME`, `SMTP_PASSWORD`);
     - Grafana admin password (`GRAFANA_ADMIN_PASSWORD`).
   - Validates emergency compromise response: mass session revocation (`revokeAllForAccount`), token invalidation, and graceful service reload with zero credential leakage.
   - Emits structured JSON audit evidence to `backups/secret-rotation-evidence-<timestamp>.json`.
3. **Operations & CI Integration**:
   - Add root package scripts: `npm run ops:volume-test`, `npm run ops:volume-drill`, and `npm run ops:rotation-drill`.
   - Integrate `npm run ops:volume-test` into `npm run ops:check`.
   - Update `docs/operations.md`, `docs/security.md`, and `docs/build-plan.md` documenting Phase 12H completion and closing TM-15 / TM-21 operational drill requirements.

## Reference material read while preparing this prompt

Repository and workflow authority:
- `AGENTS.md` §§2, 2.1, phase-control commands, §§5–10: prompt-first workflow, phase resolution,
  skill loading, verification, review, documentation, commit rules, product constraints, and no-fabrication rules.
- `docs/build-plan.md` §§3, 7, 13: Phase 2 PostgreSQL encryption contract, Phase 6 Garage volume encryption,
  Phase 12 operations and launch hardening exit gates.
- `docs/security.md` §§8–10, 15, 17, 18: threat register, TM-15 secrets management and rotation drill,
  TM-21 volume encryption and key separation, residual risks.
- `docs/operations.md`: topology, telemetry, artifacts, and runbooks.
- `infra/compose/docker-compose.production.example.yml`: production Compose volume mounts and environment definitions.
- `infra/env/production.env.example` and `infra/env/garage.production.env.example`: production mount paths and secret sentinels.
- `infra/launch/readiness.example.json` and `scripts/ops/check-launch-readiness.js`: Category 3 (`secrets_management`),
  Category 4 (`secret_references`), and Category 8 (`volume_encryption`).

Skills consulted:
- `secrets-management`: `.agents/skills/secrets-management/SKILL.md` (rotation strategies, dual-secret rollover, least privilege).
- `security-best-practices`: `.agents/skills/security-best-practices/SKILL.md` (secrets isolation, redaction, defense in depth).
- `security-threat-model`: `.agents/skills/security-threat-model/SKILL.md` (TM-15 and TM-21 mitigations and verification).
- `deployment-pipeline-design`: `.agents/skills/deployment-pipeline-design/SKILL.md` (zero-downtime rotation workflows and gates).
- `architecture-patterns`: `.agents/skills/architecture-patterns/SKILL.md` (ports, adapters, and separation of concerns).
- `error-handling-patterns`: `.agents/skills/error-handling-patterns/SKILL.md` (fail-closed verification).
- `javascript-testing-patterns`: `.agents/skills/javascript-testing-patterns/SKILL.md` (node test runner patterns).
- `requesting-code-review`: `.agents/skills/requesting-code-review/SKILL.md`.
- `receiving-code-review`: `.agents/skills/receiving-code-review/SKILL.md`.
- `caveman-commit`: `.agents/skills/caveman-commit/SKILL.md`.

## Measurements and procedure

1. **Implement `scripts/ops/verify-volume-encryption.js`**:
   - Provide a pure Node.js verification and evaluation engine:
     - Inspects `infra/compose/docker-compose.production.example.yml` and `infra/env/production.env.example`.
     - Identifies all stateful service volumes requiring host volume encryption:
       - `postgres`: `/var/lib/postgresql` -> `${ACRES_POSTGRES_ENCRYPTED_MOUNT}`
       - `valkey`: `/data` -> `${ACRES_VALKEY_ENCRYPTED_MOUNT}`
       - `garage`: `/var/lib/garage/meta` -> `${ACRES_GARAGE_META_ENCRYPTED_MOUNT}`
       - `garage`: `/var/lib/garage/data` -> `${ACRES_GARAGE_DATA_ENCRYPTED_MOUNT}`
       - `clamav`: `/var/lib/clamav` -> `${ACRES_CLAMAV_ENCRYPTED_MOUNT}`
       - `caddy`: `/data` -> `${ACRES_CADDY_DATA_MOUNT}`
       - `caddy`: `/config` -> `${ACRES_CADDY_CONFIG_MOUNT}`
       - `prometheus`: `/prometheus` -> `${ACRES_PROMETHEUS_ENCRYPTED_MOUNT}`
       - `grafana`: `/var/lib/grafana` -> `${ACRES_GRAFANA_ENCRYPTED_MOUNT}`
     - Validates supported host volume encryption mechanisms:
       - `LUKS2` / `dm-crypt` (Linux host block-device encryption);
       - `aws:kms` (AWS EBS volume encryption with customer-managed KMS key);
       - `gcp:cmek` (Google Cloud persistent disk customer-managed encryption);
       - `azure:keyvault` (Azure disk encryption with Key Vault).
     - Validates the **Key-Separation Invariant**:
       - Asserts that keyfiles, passphrases, or cloud KMS credential files are not located in any stateful volume mount directory or subdirectories;
       - Asserts that keyfiles are not included in backup dump directories (`backups/`);
       - Asserts that keyfiles are not tracked by git;
       - Asserts that volume unlock material is managed out-of-band by host init or secret store.
     - Validates Key Recovery Governance:
       - Confirms designated key recovery owner (`PRODUCTION_KEY_RECOVERY_OWNER`);
       - Verifies key escrow / recovery documentation reference;
       - Enforces dual-custody or split-key recovery requirements for offline volume recovery.
     - Exposes CLI interface with exit code 0 on valid configuration and exit code 1 on failure.
     - Supports `--json` flag for machine-readable output.

2. **Implement `scripts/ops/verify-volume-encryption.spec.js`**:
   - Write unit tests using `node:test` and `node:assert/strict`:
     - Asserts clean evaluation on reference template configuration;
     - Fails closed when any stateful service lacks an encrypted mount variable;
     - Fails closed when unencrypted volume mounts are detected for stateful services;
     - Fails closed when key material is co-located within a volume mount path;
     - Fails closed when volume encryption mechanism is missing or unsupported;
     - Fails closed when key recovery owner is missing or empty;
     - Validates key separation rules across custom simulated configurations;
     - Asserts structured JSON output structure.

3. **Implement `scripts/ops/run-secret-rotation-drill.sh`**:
   - Write an automated secret rotation and compromise response drill runner:
     - **Pre-rotation validation**: checks active services and verifies credential baseline.
     - **Dual-secret session rollover drill**:
       - Simulates session secret rotation (`SESSION_SECRET`);
       - Generates session token signed with Primary Key A;
       - Simulates rotation where Key B becomes Primary and Key A is retained as Secondary;
       - Verifies that session signed with Key A is accepted during the rollover window;
       - Verifies that new sessions are signed with Key B;
       - Retires Key A and verifies that expired/retired keys are rejected.
     - **CSRF secret rotation drill**:
       - Simulates CSRF secret rollover with fresh token issuance and cookie synchronization.
     - **Database credential rotation drill**:
       - Tests password change sequence for `acres_app` and `acres_migrator`;
       - Validates zero-downtime credential update pattern (graceful pool drain / connection refresh);
       - Verifies that stale passwords are rejected immediately.
     - **Valkey credential rotation drill**:
       - Tests Valkey `requirepass` password update without dropping active queues.
     - **Storage access key rotation drill**:
       - Tests S3 access key pair rotation (`STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`);
       - Verifies presigned URL generation and SigV4 verification under rotated keys.
     - **Emergency compromise response drill**:
       - Simulates compromised credential scenario;
       - Triggers mass session revocation (`revokeAllForAccount`);
       - Triggers token purge;
       - Verifies complete invalidation across all active sessions;
       - Asserts zero secret logging in console output, environment dumps, or drill reports.
     - **Evidence emission**: writes structured JSON evidence report to `backups/secret-rotation-evidence-<timestamp>.json`.

4. **Update root `package.json`**:
   - Add `"ops:volume-test": "node --test scripts/ops/verify-volume-encryption.spec.js"`
   - Add `"ops:volume-drill": "node scripts/ops/verify-volume-encryption.js"`
   - Add `"ops:rotation-drill": "scripts/ops/run-secret-rotation-drill.sh"`
   - Update `"ops:check"` to include `npm run ops:volume-test`.

5. **Update documentation**:
   - `docs/operations.md`:
     - Add "Volume Encryption, Key Separation & Recovery Inspection Runbook";
     - Add "Secret Rotation & Emergency Compromise Response Runbook";
     - Document Phase 12H artifacts and verification results.
   - `docs/security.md`:
     - Update TM-15 (secrets management and rotation drill) with Phase 12H evidence;
     - Update TM-21 (volume encryption and key separation) with Phase 12H evidence;
     - Update §15 residual risks noting completion of volume encryption and secret rotation drills.
   - `docs/build-plan.md`:
     - Add Phase 12H verification record documenting volume encryption inspection, key separation verification, and secret rotation drill execution.

## Expected impact

- Files created:
  - `scripts/ops/verify-volume-encryption.js`
  - `scripts/ops/verify-volume-encryption.spec.js`
  - `scripts/ops/run-secret-rotation-drill.sh`
- Files modified:
  - `package.json`
  - `docs/operations.md`
  - `docs/security.md`
  - `docs/build-plan.md`

## Non-goals

- No database schema migrations or changes to existing PostgreSQL tables.
- No third-party proprietary cloud provider CLI requirements (AWS CLI, gcloud, az CLI); verification operates on configuration, contracts, and POSIX primitives.
- No committing actual private keys, LUKS passphrases, or plaintext production credentials to the repository.
- No background daemons or long-running processes outside existing Compose services.

## Verification and documentation plan

1. Execute unit test suites:
   - `npm run ops:volume-test` (must pass 100% of tests);
   - `npm run ops:volume-drill` (must exit 0 on reference template configuration);
   - `npm run ops:rotation-drill` (must exit 0 and emit structured audit evidence);
   - `npm run ops:check` (must pass templates, secret scan, docker runtime, dependency audit, readiness tests, storage reconciliation tests, Caddy routing tests, and volume encryption tests).
2. Repository verification checks:
   - `git diff --check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
3. Dispatch reviewer subagent via `requesting-code-review` and evaluate feedback via `receiving-code-review`.
4. Commit locally to `main` using `caveman-commit`.

## SKILLS USED

- `secrets-management`: secret rotation patterns, dual-key session rollover, and credential isolation.
- `security-best-practices`: secure-by-default volume encryption, key separation, and credential redaction.
- `security-threat-model`: TM-15 secrets management and TM-21 volume encryption verification.
- `deployment-pipeline-design`: zero-downtime rotation workflows and operational gates.
- `architecture-patterns`: modular separation between inspection engine, drill runner, and documentation.
- `error-handling-patterns`: fail-closed validation of security configurations.
- `javascript-testing-patterns`: Node.js test runner unit test design for volume encryption verification.
- `requesting-code-review`: preparing structured review context for code review subagent.
- `receiving-code-review`: evaluating reviewer feedback with technical rigor.
- `caveman-commit`: composing standard conventional commit message.
