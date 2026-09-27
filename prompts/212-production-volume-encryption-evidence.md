# 212 — production volume encryption evidence

## Scope and why this is next

The committed baseline is `5e176e4` on `main`. Phase 12K remains open under
`docs/build-plan.md` §13/§22 and the umbrella launch sign-off in prompt 201.
Prompts 205–211 assessed checklist Categories 1–7 (`production_domain_tls`,
`smtp_delivery`, `secrets_management`, `secret_references`, `slo_and_alerting`,
`backup_and_disaster_recovery`, and `data_retention_policy`) and recorded
unresolved operator evidence without approving them. The earliest remaining
independent checklist unit is Category 8, `volume_encryption`.

This prompt assesses the declared host-level volume encryption mechanism
(`encryption_mechanism`: LUKS2/dm-crypt, aws:kms, gcp:cmek, azure:keyvault),
encrypted mount paths covering all stateful storage mounts (at least PostgreSQL,
Valkey, and Garage, across all 9 production mounts), the Key Separation
Invariant confirmation (`key_separation_confirmed: true`), designated
`key_recovery_owner`, structured child volume encryption evidence
(`volume-encryption-evidence-<timestamp>.json`), and the designated
infrastructure / security lead's decision. It records an exact unresolved
blocker if operator material is unavailable. Category 8 is approved only after
independent live-source inspection, verified machine-readable child artifacts,
and dated human sign-off. This does not approve other categories or complete
Phase 12.

## References and verified contract

- Re-read `AGENTS.md` §§2–7 and 10, `docs/build-plan.md` §§13, 19, 21, 22,
  `docs/launch-checklist.md` §§2–5, Category 8 (§3.8), and §7,
  `docs/operations.md` Phase 12H/K and Prompt 191, `docs/security.md` TM-21 and
  Phase 12H, `docs/system-architecture.md` (persistence and volume encryption
  architecture), `docs/skills.md`, and prompts 191, 201–204, and 205–211.
  Reconcile prose with current code and Git history before executing.
- Inspect `infra/launch/readiness.example.json`,
  `infra/launch/readiness.schema.json`,
  `scripts/ops/check-launch-readiness.js` and its test suite
  (`scripts/ops/check-launch-readiness.spec.js`),
  `scripts/ops/verify-volume-encryption.js` and its test suite
  (`scripts/ops/verify-volume-encryption.spec.js`),
  `infra/compose/docker-compose.production.example.yml`,
  `infra/env/production.env.example`,
  `scripts/ops/run-launch-drills.sh` (stage 4), and
  `scripts/ops/check-production-templates.sh`. Inspect operator-provided volume
  encryption configurations, host LUKS2/CMEK key separation policies, and child
  volume encryption reports separately.
- No visual route, design comp, crop, pixel measurement, or breakpoint applies.
  The measured contract is:
  - `encryption_mechanism`: non-empty string specifying an approved mechanism
    (`luks2`, `dm-crypt`, `aws:kms`, `gcp:cmek`, `azure:keyvault`);
  - `encrypted_mount_paths`: array of non-empty strings with length >= 3
    covering at least PostgreSQL, Valkey, and Garage;
  - `key_separation_confirmed`: boolean (`true` required);
  - `key_recovery_owner`: non-empty string designating recovery owner without
    placeholders;
  - `approver`: valid approver object or name without placeholders;
  - `evidence`: non-empty array referencing valid child JSON reports.
- Machine-readable child evidence artifact (`validateVolumeEncryptionReport`):
  - Recognized by filename or structural markers (`isVolumeEncryptionCandidate`);
  - `drill_type: "production_volume_encryption_and_key_separation"`;
  - strict nonfuture ISO UTC `timestamp` (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/`);
  - `status: "success"`;
  - `valid: true`;
  - `errors: []`;
  - `keySeparation`: object with `verified: true` and `detectedViolations: []`;
  - `evaluatedMounts`: array with length >= 3, all items having `passed: true`
    covering at least the 3 required stateful mounts (PostgreSQL, Valkey, Garage);
  - If `totalRequiredMounts` and `validMountsCount` are present: equal positive
    safe integers >= 3 (standard Compose evaluation defines 9 stateful mounts);
  - Exactly zero placeholders (`__REQUIRED_`) and zero client secrets;
  - Every referenced JSON child report, including wildcard matches, must pass.
    Prose alone, declarations alone, or a unified dossier alone cannot qualify.
- Four verified facts and architecture constraints the operator and leads must resolve:
  1. **All 9 stateful container mounts require encrypted host storage bindings.**
     `infra/compose/docker-compose.production.example.yml` and
     `scripts/ops/verify-volume-encryption.js:43-98` specify 9 distinct stateful
     storage paths: PostgreSQL (`/var/lib/postgresql` -> `${ACRES_POSTGRES_ENCRYPTED_MOUNT}`),
     Valkey (`/data` -> `${ACRES_VALKEY_ENCRYPTED_MOUNT}`), Garage metadata
     (`/var/lib/garage/meta` -> `${ACRES_GARAGE_META_ENCRYPTED_MOUNT}`), Garage data
     (`/var/lib/garage/data` -> `${ACRES_GARAGE_DATA_ENCRYPTED_MOUNT}`), ClamAV
     (`/var/lib/clamav` -> `${ACRES_CLAMAV_ENCRYPTED_MOUNT}`), Caddy data
     (`/data` -> `${ACRES_CADDY_DATA_MOUNT}`), Caddy config
     (`/config` -> `${ACRES_CADDY_CONFIG_MOUNT}`), Prometheus
     (`/prometheus` -> `${ACRES_PROMETHEUS_ENCRYPTED_MOUNT}`), and Grafana
     (`/var/lib/grafana` -> `${ACRES_GRAFANA_ENCRYPTED_MOUNT}`). While Category 8
     minimum validator requirement enforces at least 3 mounts (PostgreSQL, Valkey,
     Garage), full production security compliance evaluates all 9 mounts.
  2. **The Key Separation Invariant (TM-21) strictly forbids key material in mount paths, backup archives, or Git.**
     Volume unlock passphrases, detached LUKS2 keyfiles, and KMS credentials must
     NEVER be stored within the persistent storage volumes they unlock, in backup
     archives (`backups/`), or tracked in Git. The engine strictly scans for
     forbidden keyfile extensions (`*.key`, `*.keyfile`, `*.passphrase`, `id_rsa`,
     `*luks*key*`, `*kms*creds*`) across mount paths and fails closed upon detection.
  3. **Key recovery governance requires designated dual-custody parameters and recovery runbook references.**
     Host encryption must establish split knowledge / dual control for recovery key
     material (`PRODUCTION_KEY_RECOVERY_OWNER`, emergency escrow), avoiding single-person
     dependency or automated plaintext escrow on the target host.
  4. **Synthetic and template checks verify Compose syntax and key separation on local disk, not physical disk encryption in production.**
     `scripts/ops/verify-volume-encryption.js` inspects Docker Compose volume
     configurations, environment templates, and local repository paths; it cannot
     verify that the production host hardware/hypervisor block devices actually have
     active LUKS2 dm-crypt dm-table mappings or hardware-level encryption active
     without operator audit.

## Preconditions and operator handoff

1. Verify branch, HEAD, and clean worktree; preserve unrelated changes. Confirm
   the checked-in readiness example is unresolved. Search approved repository
   paths for a materialized production readiness record or redacted Category 8
   evidence reference. Absence from Git does not prove absence from the
   operator's restricted store.
2. Obtain through the approved operator channel:
   - The production host volume encryption mechanism and implementation details
     (LUKS2/dm-crypt, AWS KMS, GCP CMEK, or Azure Key Vault);
   - List of mounted encrypted host block devices and mount paths for all 9 stateful
     services;
   - Key separation confirmation: evidence that detached keyfiles/KMS credentials
     reside in an external KMS / HSM / vault and are not present on volume filesystems
     or backup archives;
   - Designated key recovery owner and dual-custody parameters;
   - Restricted evidence-store location containing the child volume encryption report
     (`volume-encryption-evidence-<timestamp>.json`);
   - Designated infrastructure / security lead approver identity and dated approval
     decision.
3. Use opaque identifiers and redacted extracts only. Never request, read, or
   place raw encryption passphrases, detached LUKS2 keyfiles, cloud KMS private
   credentials, or host root keys into Git, logs, or chat.
4. Distinguish test fixtures and template checks from production block device
   encryption. Synthetic runs in `scripts/ops/verify-volume-encryption.js` check
   compose volume syntax and key separation on local disk; they do not prove that
   the production host hypervisor or OS has active LUKS2 dm-crypt mappings or
   hardware encryption on the mounted block devices.
5. Production volume re-encryption, disk formatting, or key rotation requires
   separate operator authorization. A generic approval of this prompt authorizes
   only read-only repository checks and intake assessment. If authority or live
   evidence is missing, record the exact Category 8 blocker and owner; do not
   fabricate evidence or mark the example approved.

## Evidence and decision procedure

1. Review operator-provided volume encryption declaration and compare values to
   readiness fields:
   - Verify `encryption_mechanism` is an approved standard (`luks2`, `dm-crypt`,
     `aws:kms`, `gcp:cmek`, `azure:keyvault`);
   - Verify `encrypted_mount_paths` includes at least PostgreSQL, Valkey, and
     Garage mounts, covering all stateful volumes;
   - Verify `key_separation_confirmed === true`;
   - Verify `key_recovery_owner` designates an active operational role or lead;
2. Inspect child volume encryption report structure and consistency:
   - Validate against `validateVolumeEncryptionReport`: drill type
     `production_volume_encryption_and_key_separation`, nonfuture ISO UTC timestamp,
     status `success`, valid `true`, empty `errors`, `keySeparation.verified: true`,
     empty `keySeparation.detectedViolations`, and `evaluatedMounts` array containing
     at least 3 mounts with all items having `passed: true`;
   - Verify equal positive safe integers for `totalRequiredMounts` and
     `validMountsCount` if declared;
3. Inspect Unified Launch Evidence Dossier if available:
   - Verify `volumeEncryptionBaseline.status !== "breached"` and
     `summary.volumeEncryptionCompliance !== "failed"`;
4. Check readiness validator:
   - Run `npm run ops:readiness-schema-test` and
     `node scripts/ops/check-launch-readiness.js <operator-readiness.json>`;
5. Document the dated intake findings, reviewed commit baseline, verified
   evidence references, missing facts, and responsible owners in
   `docs/launch-checklist.md` §3.8. Prompt 201 continues to govern final
   eleven-category sign-off.

## Scope boundaries, failure handling, and rollback

- No product code, database schema, migration, API endpoint, client UI,
  container mount config, or production configuration is changed.
- If volume encryption child report, infrastructure/security lead approval, or key
  separation evidence is missing, Category 8 remains `unresolved`. Document the
  exact blockers, required inputs, and owning lead.
- Revert any erroneous documentation edit with git; do not weaken validator or
  schema contracts.

## Verification, review, and completion

1. Execute and quote real command output and exit codes for:
   - `npm run ops:readiness-schema-test`
   - `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`
     (expected fail-closed with 70 blockers, including Category 8 blockers reported)
   - `npm run ops:volume-test`
   - `npm run ops:templates`
   - `npm run ops:check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
   - `git diff --check`
2. Dispatch a read-only reviewer subagent via `requesting-code-review` providing
   requirements, base/head SHAs, modified documentation paths, check results,
   and the distinction between template validation and production volume encryption.
3. Evaluate review feedback via `receiving-code-review`, verify claims against
   codebase reality, fix valid issues, and re-test.
4. Stage only prompt-scoped documentation updates and any approved redacted
   readiness records.
5. Commit locally to `main` using `caveman-commit`. Do not push.
6. Present the exact state of Category 8, remaining Phase 12K gates, and
   instructions for verifying readiness.

## SKILLS USED

- `secrets-management` — verify volume encryption key separation, detached keyfiles, and KMS access controls without exposing sensitive key material.
- `security-best-practices` — enforce host-level volume encryption standards (LUKS2/dm-crypt, CMEK) and the Key Separation Invariant (TM-21).
- `deployment-pipeline-design` — enforce release gates separating static template validation from live production infrastructure verification.
- `javascript-testing-patterns` — verify deterministic operational test suites and readiness verification scripts.
- `requesting-code-review` — dispatch independent reviewer subagent for evidence and documentation review.
- `receiving-code-review` — evaluate reviewer findings with technical rigor before making adjustments.
- `caveman-commit` — write the final local commit message on completion.
