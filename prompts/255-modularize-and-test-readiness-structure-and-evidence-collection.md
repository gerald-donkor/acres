# Phase 12K follow-up — modularize and test readiness structure, placeholder scanning, and evidence collection

## Scope and why this is next

Modularize the remaining document-level validation, placeholder scanning, section structural checking, category evidence file routing, and per-category evidence evaluation in `scripts/ops/check-launch-readiness.js`:
1. Extract `validateEvidenceFileCategory(category, file, parsed, ref, addBlocker)` from `checkEvidenceFileContents`.
2. Extract `validateReadinessDocument(record, addBlocker)` for document root and `sections` shape verification.
3. Extract `scanDocumentPlaceholdersAndSecrets(record, addBlocker)` for document-wide placeholder and dev password detection with category routing.
4. Extract `validateSectionStructuralRequirements(sectionName, section, addBlocker)` for section object, approval status, and evidence array format validation.
5. Extract `collectApprovedCategoryEvidence(sections, filePath, addBlocker)` for resolving evidence files and populating the 11 categorized evidence buckets.
6. Refactor `validateReadiness()` and `checkEvidenceFileContents()` to cleanly delegate to these helpers while maintaining 100% behavioral parity and exact blocker messages.
7. Export all new helpers in `module.exports`.
8. Establish comprehensive unit and contract tests in `scripts/ops/check-launch-readiness.spec.js`.

Following Prompts 246–254:
- Categories 1–11 now enforce modular category section validators and discrete syntax/format helpers.
- In `scripts/ops/check-launch-readiness.js`, `checkEvidenceFileContents()` still contains an inline ~150-line category evaluation switch.
- In `validateReadiness()`, the top-level document checking, placeholder scanning, section status/evidence array checks, and evidence routing are still written as inline procedural loops.
- Extracting these into discrete, pure, testable helper functions completes the modularization of the readiness validator, enabling direct unit testing of each lifecycle phase without side effects.

This is a repository-owned, dependency-safe hardening and refactoring step within Phase 12K. Prompt 201 still governs real production evidence collection and sign-off.

Planning baseline: clean worktree at commit `7859ee7` (`fix(ops): modularize and test readiness section validators`).

## References read and execution prerequisites

Planning read:
- `AGENTS.md` phase-control, workflow, prompt, product, and standing rules
- `docs/build-plan.md` Phase 12 and Phase 12K (prompts 246–254)
- `docs/skills.md`
- `docs/system-architecture.md` §11–12
- `docs/security.md` TM-01, TM-04, TM-05, TM-15, and Phase 12K evidence integrity
- `docs/operations.md` Phase 12K and prompts 246–254
- `docs/launch-checklist.md` Categories 1–11
- `prompts/201-production-launch-evidence-and-signoff.md`

Code inspected:
- `scripts/ops/check-launch-readiness.js` (`checkEvidenceFileContents` lines 2395–2563, `validateReadiness` lines 3406–3584, `module.exports` lines 3659–3748)
- `scripts/ops/check-launch-readiness.spec.js`

## Non-goals

- Altering any error messages, validation rules, or fail-closed behavior of `validateReadiness` or `checkEvidenceFileContents`.
- Modifying runtime server, client, or worker business logic.
- Altering production Docker or Caddy configurations.
- Fabricating production drill evidence or signing off on launch readiness without operator execution.

## Measurable requirements and implementation plan

### 1. Extract `validateEvidenceFileCategory` in `scripts/ops/check-launch-readiness.js`

Function signature:
`validateEvidenceFileCategory(category, file, parsed, ref, addBlocker)`
- Handles category-specific candidate, dossier, and report validation for a single parsed evidence file:
  - `volume_encryption`: allows `isVolumeEncryptionCandidate`; otherwise requires `validVolumeDossier(parsed, file)`.
  - `backup_and_disaster_recovery`: allows `isRestoreCandidate` or `isReconciliationCandidate`; otherwise requires `validRecoveryDossier(parsed, file)`.
  - `production_domain_tls`: allows `isCaddyRoutingCandidate`; otherwise requires `validCaddyDossier(parsed, file)` or `validCaddyStaticEvidence(parsed, file)`.
  - `smtp_delivery`: allows `isSmtpDeliveryCandidate`; otherwise adds blocker `'A referenced SMTP delivery report is invalid or failed'`.
  - `slo_and_alerting`: allows `isCapacityAlertingCandidate`; otherwise requires `validCapacityDossier(parsed, file)`.
  - `secrets_management`: allows `isSecretRotationCandidate`, `isSastEvidence`/`isSbomEvidence`/`isContainerSecurityEvidence` (via `validateSupplyChainEvidence`), or `validSecretDossier(parsed, file)`.
  - `deployment_and_rollback`: allows `isDeploymentDrillCandidate`, validates dossiers with `validDeploymentDossier(parsed, file)`, and validates raw deployment receipts requiring status `success`, passed/success `overall_status`, `success !== false`, and zero errors.
  - `secret_references`: allows `isSecretReferencePolicyCandidate`; otherwise adds blocker `'A referenced secret-reference policy report is invalid or failed'`.
  - `data_retention_policy`: allows `isDataRetentionPolicyCandidate`; otherwise adds blocker `'A referenced data retention policy report is invalid or failed'`.
  - `graphql_introspection`: allows `isGraphqlIntrospectionCandidate`; otherwise adds blocker `'A referenced GraphQL introspection report is invalid or failed'`.
  - `optional_ai_posture`: allows `isNoAiPostureCandidate`; otherwise adds blocker `'A referenced no-AI production posture report is invalid or failed'`.
  - Unrecognized category: if not in `REQUIRED_SECTIONS`, adds blocker `Unrecognized launch checklist category '${category}'`.
- Refactor `checkEvidenceFileContents` to loop through matches and call `validateEvidenceFileCategory(category, file, parsed, ref, addBlocker)`.

### 2. Extract document structure and scanning helpers in `scripts/ops/check-launch-readiness.js`

1. `validateReadinessDocument(record, addBlocker)`:
   - Validates that `record` is a non-null, non-array object. If not, calls `addBlocker('root', 'Invalid readiness document: root must be an object')` and returns `false`.
   - Validates that `record.sections` exists and is a non-null, non-array object. If not, calls `addBlocker('root', "Missing required top-level 'sections' object")` and returns `false`.
   - Returns `true` when document structure is valid.

2. `scanDocumentPlaceholdersAndSecrets(record, addBlocker)`:
   - Invokes `checkPlaceholdersAndSecrets(record, '', rawScanBlockers)`.
   - Routes each blocker into the appropriate category based on `/Field 'sections\.([a-z_]+)/` matching, defaulting to `'general'`.
   - Returns the array of raw scan blockers.

3. `validateSectionStructuralRequirements(sectionName, sec, addBlocker)`:
   - Validates that `sec` exists and is a non-null object. If not, calls `addBlocker(sectionName, "Missing required section '${sectionName}'")` and returns `{ exists: false, isApproved: false }`.
   - Checks `sec.status === 'approved'`. If not, calls `addBlocker(sectionName, "Section status is '${sec.status || 'missing'}'; must be 'approved' with verified evidence for launch readiness")` and sets `isApproved = false`. Otherwise `isApproved = true`.
   - Checks `sec.evidence`: must be a non-empty array. If not, calls `addBlocker(sectionName, 'Evidence array is empty or missing; launch approval requires auditable evidence items')`.
   - Checks each item in `sec.evidence`: must be a non-empty string. If not, calls `addBlocker(sectionName, "Evidence item [${idx}] is empty or not a valid string")`.
   - Returns `{ exists: true, isApproved }`.

4. `collectApprovedCategoryEvidence(sections, filePath, addBlocker)`:
   - Initializes 11 category evidence arrays: `recoveryEvidence`, `volumeEvidence`, `secretEvidence`, `deploymentEvidence`, `capacityEvidence`, `caddyEvidence`, `smtpEvidence`, `secretReferenceEvidence`, `retentionEvidence`, `graphqlEvidence`, `noAiEvidence`.
   - Resolves `baseDirs` using `process.cwd()` and directory of `filePath`.
   - For each section in `REQUIRED_SECTIONS` where `sec?.status === 'approved'` and `Array.isArray(sec.evidence)`:
     - For each evidence item matching `isEvidenceFileReference`:
       - Invokes `checkEvidenceFile(ev.trim(), sectionName, addBlocker, baseDirs)`.
       - Appends parsed files to the corresponding category bucket.
   - Returns an object containing all 11 category evidence arrays.

### 3. Refactor `validateReadiness()`

Refactor `validateReadiness(record, _filePath, options = {})` to:
- Use `validateReadinessDocument(record, addBlocker)`. Early-return `{ categoryBlockers, totalApproved: 0, totalSections: REQUIRED_SECTIONS.length }` if invalid.
- Call `scanDocumentPlaceholdersAndSecrets(record, addBlocker)`.
- Iterate through `REQUIRED_SECTIONS`, calling `validateSectionStructuralRequirements(sectionName, sections[sectionName], addBlocker)` and incrementing `totalApproved` when approved.
- Call `collectApprovedCategoryEvidence(sections, _filePath, addBlocker)`.
- Pass collected evidence into the 11 category section validators.
- Return `{ categoryBlockers, totalApproved, totalSections: REQUIRED_SECTIONS.length }`.

### 4. Export all 5 helpers in `module.exports`

Export:
- `validateEvidenceFileCategory`
- `validateReadinessDocument`
- `scanDocumentPlaceholdersAndSecrets`
- `validateSectionStructuralRequirements`
- `collectApprovedCategoryEvidence`

### 5. Unit and contract test suite in `scripts/ops/check-launch-readiness.spec.js`

Add comprehensive unit test suites covering:
1. `validateEvidenceFileCategory`:
   - Valid candidate and dossier acceptance for each category (zero blockers).
   - Rejection of invalid/failing reports for each category with expected blocker message assertions.
   - Rejection of unrecognized categories.
2. `validateReadinessDocument`:
   - Valid root and sections object returns `true` (zero blockers).
   - Rejection of null, primitives, arrays, and missing `sections` with exact blocker messages.
3. `scanDocumentPlaceholdersAndSecrets`:
   - Valid document returns empty array (zero blockers).
   - Detects `__REQUIRED_*__` placeholders and routes to section category.
   - Detects dev passwords and routes to section category or `general`.
4. `validateSectionStructuralRequirements`:
   - Approved section with valid evidence strings returns `{ exists: true, isApproved: true }` (zero blockers).
   - Missing section returns `{ exists: false, isApproved: false }` with missing blocker.
   - Pending/unapproved status returns `{ exists: true, isApproved: false }` with status blocker.
   - Missing/empty evidence array or empty strings add exact blocker messages.
5. `collectApprovedCategoryEvidence`:
   - Resolves referenced files for approved sections into appropriate category buckets.
   - Ignores non-approved sections.
   - Handles missing files by recording appropriate blockers.

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
