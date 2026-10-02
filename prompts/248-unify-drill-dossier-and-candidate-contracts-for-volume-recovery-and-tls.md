# Phase 12K follow-up — unify drill dossier and candidate contracts for volume, recovery, and domain TLS

## Scope and why this is next

Complete the launch readiness evidence loop in `scripts/ops/check-launch-readiness.js` by unifying
candidate and drill dossier evaluation across the remaining three infrastructure and drill categories:
1. `volume_encryption` (Category 8)
2. `backup_and_disaster_recovery` (Category 6)
3. `production_domain_tls` (Category 1)

Following Prompts 235–247:
- Categories 2 (`smtp_delivery`), 3 (`secrets_management`), 4 (`secret_references`), 5 (`slo_and_alerting`),
  7 (`data_retention_policy`), 9 (`graphql_introspection`), 10 (`deployment_and_rollback`), and
  11 (`optional_ai_posture`) each enforce candidate exclusion, dossier validation, category-specific
  fail-closed blockers, and cleanly terminate evidence processing turns with `continue;`.
- However, in `checkEvidenceFileContents` in `scripts/ops/check-launch-readiness.js`:
  - `volume_encryption` (Category 8): When `isVolumeEncryptionCandidate` or `validVolumeDossier` matches,
    it does not `continue;`, and when neither matches it adds a blocker but still falls through to legacy
    checks (lines 2401–2740).
  - `backup_and_disaster_recovery` (Category 6): When `isRestoreCandidate`, `isReconciliationCandidate`,
    or `validRecoveryDossier` matches, it does not `continue;`, and when none match it adds a blocker but
    still falls through to legacy checks.
  - `production_domain_tls` (Category 1): When `validCaddyDossier` or `validCaddyStaticEvidence` matches,
    it does not `continue;`, falling through to legacy monolithic checks.
  - `validVolumeDossier(report)` throws a `TypeError` if `report` is null/undefined or non-object because
    it directly accesses `report.volumeEncryptionBaseline`. Additionally, it lacks a guard to prevent child-named
    files (e.g. `volume-encryption-evidence-*.json`) from impersonating a dossier.
  - `validRecoveryDossier(report, file)` lacks a guard preventing child-named files (e.g. `restore-drill-evidence-*.json`,
    `reconcile-report-*.json`) from impersonating a dossier.
  - `validVolumeDossier`, `validRecoveryDossier`, and `validCaddyDossier` are not exported in `module.exports`,
    unlike `validSecretDossier`, `validDeploymentDossier`, and `validCapacityDossier`.

This prompt closes these gaps by:
1. Hardening `validVolumeDossier`, `validRecoveryDossier`, and `validCaddyDossier` with null/type guards and child filename exclusion.
2. Unifying `checkEvidenceFileContents` for Categories 1, 6, and 8 to evaluate candidates and dossiers, record category blockers, and `continue;`.
3. Exporting `validVolumeDossier`, `validRecoveryDossier`, and `validCaddyDossier` in `module.exports`.
4. Adding comprehensive unit and regression tests in `scripts/ops/check-launch-readiness.spec.js`.

This is a repository-owned, dependency-safe hardening step within Phase 12K. Prompt 201 still governs real
production evidence collection and sign-off.

Planning baseline: clean worktree at commit `919200d5604f896691152ddfaf5e4f49b2071972`
(`fix(ops): enforce policy and posture candidates`).

## References read and execution prerequisites

Planning read:
- `AGENTS.md` phase-control, workflow, prompt, product, and standing rules
- `docs/build-plan.md` Phase 12 and Phase 12K (prompts 235–247)
- `docs/skills.md`
- `docs/system-architecture.md` §11–12
- `docs/security.md` TM-01, TM-04, TM-05, TM-15, and Phase 12K evidence integrity
- `docs/operations.md` Phase 12K and prompts 235–247
- `docs/launch-checklist.md` Sections 2–7 (Categories 1, 6, 8)
- `prompts/201-production-launch-evidence-and-signoff.md`

Code inspected:
- `scripts/ops/check-launch-readiness.js` (`validCaddyDossier`, `validVolumeDossier`, `validRecoveryDossier`, `checkEvidenceFileContents`, `module.exports`)
- `scripts/ops/check-launch-readiness.spec.js` (Category 1, 6, 8 tests)
- `infra/launch/readiness.example.json` and `infra/launch/readiness.schema.json`

At execution re-read the approved prompt, these references, and complete affected test files.

## Measurable requirements and implementation plan

### 1. Harden dossier helpers in `scripts/ops/check-launch-readiness.js`

1. **`validVolumeDossier(report, file)`**:
   - Guard against non-object / array:
     ```javascript
     if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
     ```
   - Disallow child filename impersonation:
     ```javascript
     const fileName = typeof file === 'string' ? path.basename(file) : '';
     if (fileName.startsWith('volume-encryption')) return false;
     ```
   - Keep existing baseline status, mount counts, key separation, and summary compliance checks.

2. **`validRecoveryDossier(report, file)`**:
   - Disallow child filename impersonation:
     ```javascript
     const fileName = typeof file === 'string' ? path.basename(file) : '';
     if (fileName.startsWith('restore-drill') || fileName.startsWith('reconcil')) return false;
     ```
   - Keep existing baseline status, RTO/parity/postgis/foreign-key flags, and restore/reconcile compliance checks.

3. **`validCaddyDossier(report, file)`**:
   - Verify non-object / array guard, `!fileName.startsWith('caddy-routing')`, `overall_status === 'PASSED'`,
     `deploymentBaseline.status === 'verified'`, and `ingressDeploymentCompliance === 'passed'`.

### 2. Unify evidence handling in `checkEvidenceFileContents`

In `checkEvidenceFileContents`:
1. **`volume_encryption`**:
   ```javascript
   if (category === 'volume_encryption') {
     if (isVolumeEncryptionCandidate({ file, parsed })) {
       // The approval call below validates children with its explicit evaluation clock and live requirement.
       continue;
     }
     if (!validVolumeDossier(parsed, file)) {
       addBlocker(category, 'A referenced volume encryption report is invalid or failed');
     }
     continue;
   }
   ```
2. **`backup_and_disaster_recovery`**:
   ```javascript
   if (category === 'backup_and_disaster_recovery') {
     if (isRestoreCandidate({ file, parsed }) || isReconciliationCandidate({ file, parsed })) {
       // The approval call below validates children with its explicit evaluation clock and live requirement.
       continue;
     }
     if (!validRecoveryDossier(parsed, file)) {
       addBlocker(
         category,
         typeof ref === 'string' && (ref.includes('reconcil') || ref.includes('storage'))
           ? 'A referenced storage reconciliation report is invalid or failed'
           : 'A referenced restore drill report is invalid or failed'
       );
     }
     continue;
   }
   ```
3. **`production_domain_tls`**:
   ```javascript
   if (category === 'production_domain_tls') {
     if (isCaddyRoutingCandidate({ file, parsed })) {
       // The approval call below validates children with its explicit evaluation clock and live requirement.
       continue;
     }
     if (!validCaddyDossier(parsed, file) && !validCaddyStaticEvidence(parsed, file)) {
       addBlocker(category, 'A referenced Caddy routing report is invalid or failed');
     }
     continue;
   }
   ```

### 3. Export dossier functions in `module.exports`

Export `validVolumeDossier`, `validRecoveryDossier`, and `validCaddyDossier` from `scripts/ops/check-launch-readiness.js`.

### 4. Comprehensive tests in `scripts/ops/check-launch-readiness.spec.js`

1. **`validVolumeDossier` contract and rejection scenarios**:
   - Null, primitive, array, wrong filename, `overall_status !== 'PASSED'`, breached stage, missing baseline,
     breached baseline, wrong mount count, violations detected, compliance !== 'passed'.
2. **`validRecoveryDossier` contract and rejection scenarios**:
   - Null, primitive, array, wrong filename, `overall_status !== 'PASSED'`, breached stage, missing baseline,
     breached baseline, RTO breach, parity/postgis/foreign-key unverified, compliance !== 'passed'.
3. **`validCaddyDossier` contract and rejection scenarios**:
   - Null, primitive, array, wrong filename, `overall_status !== 'PASSED'`, breached stage, missing baseline,
     breached baseline, routing unverified, compliance !== 'passed'.
4. **Integration with category approval**:
   - Category 1 accepts valid drill dossier alongside valid live Caddy receipt without spurious fall-through blockers.
   - Category 6 accepts valid drill dossier alongside valid live restore and reconciliation receipts without spurious fall-through blockers.
   - Category 8 accepts valid drill dossier alongside valid live volume receipt without spurious fall-through blockers.
   - Disguised or failing dossiers in Categories 1, 6, and 8 fail closed with the category-specific blocker.

### 5. Verification and documentation

Run the complete verification suite:
- `npm run ops:readiness-test` (all tests passing)
- `npm run ops:launch-drill-test` (all 68 tests passing)
- `npm run ops:readiness-schema-test` (all 8 tests passing)
- `npm run ops:templates` and `npm run ops:templates-test` (all 57 tests passing)
- All 21 ops test suites
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`
- Unresolved template check: `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` fails closed (0 approved, 11 blocked, 70 blockers).
- Update documentation:
  - `docs/build-plan.md` under Phase 12K (Prompt 248)
  - `docs/operations.md` under Phase 12K (Prompt 248)
  - `docs/launch-checklist.md` under Sections 3 and 7 (Categories 1, 6, 8)
  - `docs/security.md` Phase 12K evidence integrity

## Non-goals

- Authorizing production launch or altering operator sign-off requirements.
- Relabeling simulation preflight artifacts as live production receipts.
- Mutating live production state, volumes, Caddy configuration, or backup schedules.
