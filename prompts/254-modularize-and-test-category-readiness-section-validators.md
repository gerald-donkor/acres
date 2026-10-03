# Phase 12K follow-up — modularize and test category readiness section validators

## Scope and why this is next

Modularize the ~770-line inline category-validation block inside `validateReadiness()` in `scripts/ops/check-launch-readiness.js` into 11 dedicated, exported category section validators and 4 discrete syntax/format helpers (`isValidFqdn`, `isValidTlsContactEmail`, `isValidReleaseCommitSha`, `isValidImageRegistryPath`). Establish comprehensive unit and contract test coverage in `scripts/ops/check-launch-readiness.spec.js` while maintaining 100% behavioral parity.

Following Prompts 246–253:
- Categories 1–11 now enforce unified candidate discrimination, dedicated dossier validators, hardened supply chain inspection, fail-closed category boundaries, deployment release provenance contracts, and exported file/timestamp/volume/reference primitives.
- In `scripts/ops/check-launch-readiness.js`, lines 2670–3334 contained monolithic inline validation for all 11 readiness categories:
  1. `production_domain_tls`
  2. `smtp_delivery`
  3. `secrets_management`
  4. `secret_references`
  5. `slo_and_alerting`
  6. `backup_and_disaster_recovery`
  7. `data_retention_policy`
  8. `volume_encryption`
  9. `graphql_introspection`
  10. `deployment_and_rollback`
  11. `optional_ai_posture`
- Anonymous inline regex/format validation logic was used for FQDN checks, TLS contact email checks, 40-character commit SHA checks, and image registry path probing.
- Extracting these into discrete, pure helper functions and modular category section validators allows:
  - Direct unit testing of category-level rules without constructing an entire 11-category launch document.
  - Verification of edge cases, fail-closed boundaries, and error messages for each category in isolation.
  - Clean delegation from `validateReadiness()` with exact behavioral and blocker message parity.

This is a repository-owned, dependency-safe hardening and refactoring step within Phase 12K. Prompt 201 still governs real production evidence collection and sign-off.

Planning baseline: clean worktree at commit `0f03899` (`fix(ops): export and test readiness helper contracts`).

## References read and execution prerequisites

Planning read:
- `AGENTS.md` phase-control, workflow, prompt, product, and standing rules
- `docs/build-plan.md` Phase 12 and Phase 12K (prompts 246–253)
- `docs/skills.md`
- `docs/system-architecture.md` §11–12
- `docs/security.md` TM-01, TM-04, TM-05, TM-15, and Phase 12K evidence integrity
- `docs/operations.md` Phase 12K and prompts 246–253
- `docs/launch-checklist.md` Categories 1–11
- `prompts/201-production-launch-evidence-and-signoff.md`

Code inspected:
- `scripts/ops/check-launch-readiness.js` (`validateReadiness` lines 2667–3340, `module.exports` lines 3430–3490)
- `scripts/ops/check-launch-readiness.spec.js`

## Non-goals

- Altering any error messages, validation rules, or fail-closed behavior of `validateReadiness`.
- Modifying runtime server, client, or worker business logic.
- Altering production Docker or Caddy configurations.
- Fabricating production drill evidence or signing off on launch readiness without operator execution.

## Measurable requirements and implementation plan

### 1. Extract format helpers in `scripts/ops/check-launch-readiness.js`

1. `isValidFqdn(rawDomain)`:
   - Validates that domain is a non-empty string matching standard FQDN pattern.
   - Rejects non-strings, empty/whitespace strings, `localhost`, `127.0.0.1`, IPv4, IPv6, protocol schemes (`https://`), and URI characters (`/`, `?`, `#`, spaces).
2. `isValidTlsContactEmail(rawEmail)`:
   - Validates that email is a non-empty string <= 254 chars with local part <= 64 chars matching email regex.
   - Rejects non-strings, consecutive dots (`..`), leading/trailing dots in local part, and placeholder strings (`__REQUIRED_`).
3. `isValidReleaseCommitSha(commitSha)`:
   - Validates that commit SHA is a string of exactly 40 ASCII hex characters.
   - Rejects non-strings, non-hex strings, and strings with length != 40.
4. `isValidImageRegistryPath(prefix)`:
   - Validates that prefix is a string without `@` or trailing `/`, and probe image reference passes `validateImageReference`.
   - Rejects non-strings, empty strings, digest characters, trailing slashes, or invalid registry prefixes.

### 2. Extract 11 category section validators in `scripts/ops/check-launch-readiness.js`

Each section validator accepts `(section, options = {})` and returns an array of recorded blocker message strings while also invoking `options.addBlocker(category, message)` if provided:

1. `validateProductionDomainTlsSection(domainSec, options = {})`:
   - Checks FQDN, TLS contact email, `hsts_approved`, `custom_certificates` boolean, and Caddy child report candidates.
2. `validateSmtpDeliverySection(smtpSec, options = {})`:
   - Checks provider, host, port, tls_mode, from_address, credentials_source_reference matching secret references, delivery_policy, bounce_abuse_handling, and SMTP delivery report candidates.
3. `validateSecretsManagementSection(secMgmt, options = {})`:
   - Checks injection_mechanism, masking_policy, rotation_cadence_days (0 < days <= 90), compromise_response_plan, and secret rotation report candidates.
4. `validateSecretReferencesSection(secRefs, options = {})`:
   - Detects Gemini/AI secret source contradiction in key names.
   - Validates all `REQUIRED_SECRET_KEYS` exist.
   - When approved, validates indirect secret-store references and secret-reference policy report candidates.
5. `validateSloAndAlertingSection(sloSec, options = {})`:
   - Checks availability_target_percent (99.9-100.0), max_p95_latency_ms (<= 500), capacity_target_rps (>= 100), max_database_acquisition_p95_latency_ms (<= 50), max_database_query_p95_latency_ms (<= 100), alert_recipients, alert_thresholds_defined, escalation_runbook_ref, and capacity drill report candidates.
6. `validateBackupAndDisasterRecoverySection(bdrSec, options = {})`:
   - Checks rpo_hours (<= 1), rto_hours (<= 4), backup_destination, backup_schedule_cron (hourly UTC cron), restore_drill_completed, restore_drill_date, restore drill report candidates, db_object_reconciliation_tested, and reconciliation report candidates.
7. `validateDataRetentionPolicySection(retSec, options = {})`:
   - Checks all `REQUIRED_RETENTION_KEYS`, upload_quarantine (7d), rejected_object (1d), export (30d), telemetry (15d), backup (30d), account, audit, report retention durations, and data retention policy report candidates.
8. `validateVolumeEncryptionSection(encSec, options = {})`:
   - Checks encryption_mechanism, validVolumePaths (>= 3 absolute paths), key_separation_confirmed, key_recovery_owner, and volume encryption report candidates.
9. `validateGraphqlIntrospectionSection(gqlSec, options = {})`:
   - Checks production_introspection_enabled boolean, justification if enabled, and GraphQL probe report candidates.
10. `validateDeploymentAndRollbackSection(depSec, options = {})`:
    - Checks target_host_profile, image_registry_path, deployment_approver, rollback_authority, image_provenance_policy, live_readiness_drill_completed.
    - Validates release record: reviewed_source_commit (40 hex), current/previous client and server images, distinct images, current != previous, registry prefix containment, provenance/drill evidence files, distinct evidence refs, and environment image matching.
    - Validates deployment drill report candidates.
11. `validateOptionalAiPostureSection(aiSec, options = {})`:
    - Fails closed on ai_enabled: true. Requires boolean false.
    - Rejects Gemini API key references.
    - When approved, verifies no_ai_path_verified, server_ai_draft_enabled_false, no_gemini_api_key_provisioned, unpaid_provider_excluded, phase11_status, and no-AI posture report candidates.

Refactor `validateReadiness()` to invoke these 11 modular functions.
Export all 15 functions in `module.exports`.

### 3. Unit and contract test suite in `scripts/ops/check-launch-readiness.spec.js`

Add comprehensive unit test suites covering:
1. `isValidFqdn`:
   - Valid domains accepted (`acres.example.com`, `example.org`, `sub.domain.co.uk`).
   - Rejections: IP addresses, localhost, 127.0.0.1, protocol schemes, spaces, slashes, non-strings, empty strings.
2. `isValidTlsContactEmail`:
   - Valid emails accepted (`ops@acres.example.com`, `admin+alerts@domain.org`).
   - Rejections: non-strings, empty, length > 254, local part > 64, missing `@`, consecutive dots (`..`), leading/trailing dots in local part, `__REQUIRED_` placeholder.
3. `isValidReleaseCommitSha`:
   - Valid 40-char hex string accepted (`a` * 40, mixed case hex).
   - Rejections: non-hex chars, length 39, length 41, non-strings.
4. `isValidImageRegistryPath`:
   - Valid registry paths accepted (`ghcr.io/org/repo`, `registry.example.com`).
   - Rejections: non-strings, empty strings, `@` digest chars, trailing `/`, invalid image reference syntax.
5. 11 Category Section Validators:
   - Test each section validator with valid approved payload ensuring zero blockers.
   - Test rejection paths for key validation rules in each category.
   - Verify callback invocation when `addBlocker` is supplied.

## Verification commands

```bash
npm run ops:readiness-test
npm run ops:launch-drill-test
npm run ops:templates
npm run ops:templates-test
npm run lint
npm run typecheck
npm run build
git diff --check
```
