# Phase 12K follow-up — enforce policy and posture evidence candidate contracts

## Scope and why this is next

Close the evidence candidate evaluation gap across the four non-drill policy and posture categories
in `scripts/ops/check-launch-readiness.js`:
1. `secret_references` (Category 4 in checklist / Category 3 sub-policy)
2. `data_retention_policy` (Category 7 in checklist)
3. `graphql_introspection` (Category 9 in checklist)
4. `optional_ai_posture` (Category 11 in checklist)

Following Prompts 235–246, each launch readiness category separates simulation preflight/rehearsal from
independently inspected live operator receipts, and the unified orchestrator enforces simulation contracts.
However, in `checkEvidenceFileContents` in `scripts/ops/check-launch-readiness.js`, seven categories
(`volume_encryption`, `backup_and_disaster_recovery`, `production_domain_tls`, `smtp_delivery`,
`slo_and_alerting`, `secrets_management`, `deployment_and_rollback`) enforce category-specific candidate
and dossier recognition guards, while the four non-drill policy and posture categories do not.

Specifically, in `scripts/ops/check-launch-readiness.js`:
- In `checkEvidenceFileContents`:
  If an evidence file is referenced in `secret_references`, `data_retention_policy`, `graphql_introspection`,
  or `optional_ai_posture`, it falls through category-specific checks without verifying candidate eligibility
  (`isSecretReferencePolicyCandidate`, `isDataRetentionPolicyCandidate`, `isGraphqlIntrospectionCandidate`,
  `isNoAiPostureCandidate`).
- If an operator references a non-candidate JSON report (e.g. a Unified Launch Evidence Dossier with `stages`
  or `dossier_version`, or an unrelated JSON structure that does not report explicit error status) alongside
  a valid live receipt in the category's `evidence` array, the non-candidate is excluded from `candidates`
  by `is*Candidate` in `checkLaunchReadiness`. The valid live receipt satisfies the approval checks, while
  the invalid or disguising report in `evidence` completely bypasses detection.
- This contradicts the fail-closed behavior of `smtp_delivery` (Category 2), which checks
  `if (isSmtpDeliveryCandidate({ file, parsed })) continue; addBlocker(category, 'A referenced SMTP delivery report is invalid or failed'); continue;`.

This prompt completes the contract by adding explicit candidate evaluation guards for the remaining four
categories in `checkEvidenceFileContents`, matching `smtp_delivery`'s pattern, and adding comprehensive
regression tests for non-candidate / disguised dossier rejection beside valid live receipts.

This is a repository-owned, dependency-safe hardening step within Phase 12K. Prompt 201 still governs real
production evidence collection and sign-off.

Planning baseline: clean worktree at commit `d6feec8bcf02a775f7c9db9c1eb288b117dc0838`
(`fix(ops): unify launch drill simulation contracts`).

## References read and execution prerequisites

Planning read:
- `AGENTS.md` phase-control, workflow, prompt, product, and standing rules
- `docs/build-plan.md` Phase 12 and Phase 12K (prompts 235–246)
- `docs/skills.md`
- `docs/system-architecture.md` §11–12
- `docs/security.md` TM-01, TM-04, TM-05, TM-15, and Phase 12K evidence integrity
- `docs/operations.md` Phase 12K and prompts 235–246
- `docs/launch-checklist.md` Sections 2–7 (Categories 3, 4, 7, 9, 11)
- `prompts/201-production-launch-evidence-and-signoff.md`

Code inspected:
- `scripts/ops/check-launch-readiness.js` (`checkEvidenceFileContents`, `checkEvidenceFile`, `checkLaunchReadiness`)
- `scripts/ops/check-launch-readiness.spec.js` (Category 4, 7, 9, 11 tests)
- `infra/launch/readiness.example.json` and `infra/launch/readiness.schema.json`

At execution re-read the approved prompt, these references, and complete affected test files.

## Measurable requirements and implementation plan

### 1. Enforce candidate guards in checkEvidenceFileContents (`scripts/ops/check-launch-readiness.js`)

In `checkEvidenceFileContents(ref, category, addBlocker, baseDirs)`:
Directly following the `category === 'deployment_and_rollback'` block (around line 2368):

1. **`secret_references`**:
   ```javascript
   if (category === 'secret_references') {
     if (isSecretReferencePolicyCandidate({ file, parsed })) {
       // The approval call below validates children with its explicit evaluation clock and live requirement.
       continue;
     }
     addBlocker(category, 'A referenced secret-reference policy report is invalid or failed');
     continue;
   }
   ```
2. **`data_retention_policy`**:
   ```javascript
   if (category === 'data_retention_policy') {
     if (isDataRetentionPolicyCandidate({ file, parsed })) {
       // The approval call below validates children with its explicit evaluation clock and live requirement.
       continue;
     }
     addBlocker(category, 'A referenced data retention policy report is invalid or failed');
     continue;
   }
   ```
3. **`graphql_introspection`**:
   ```javascript
   if (category === 'graphql_introspection') {
     if (isGraphqlIntrospectionCandidate({ file, parsed })) {
       // The approval call below validates children with its explicit evaluation clock and live requirement.
       continue;
     }
     addBlocker(category, 'A referenced GraphQL introspection report is invalid or failed');
     continue;
   }
   ```
4. **`optional_ai_posture`**:
   ```javascript
   if (category === 'optional_ai_posture') {
     if (isNoAiPostureCandidate({ file, parsed })) {
       // The approval call below validates children with its explicit evaluation clock and live requirement.
       continue;
     }
     addBlocker(category, 'A referenced no-AI production posture report is invalid or failed');
     continue;
   }
   ```

### 2. Comprehensive regression tests (`scripts/ops/check-launch-readiness.spec.js`)

Add tests for each of the four categories:
1. **`secret_references`**:
   - Test that referencing a disguised dossier or non-candidate JSON report beside a valid live report (`[good, disguisedDossier]`) fails closed with blocker `'A referenced secret-reference policy report is invalid or failed'`.
   - Test that referencing only the disguised dossier produces both `'A successful secret-reference policy child JSON report is required'` and `'A referenced secret-reference policy report is invalid or failed'`.
2. **`data_retention_policy`**:
   - Test that referencing a disguised dossier or non-candidate JSON report beside a valid live report (`[good, disguisedDossier]`) fails closed with blocker `'A referenced data retention policy report is invalid or failed'`.
   - Test that referencing only the disguised dossier produces both `'A successful data retention policy child JSON report is required'` and `'A referenced data retention policy report is invalid or failed'`.
3. **`graphql_introspection`**:
   - Test that referencing a disguised dossier or non-candidate JSON report beside a valid live report (`[good, disguisedDossier]`) fails closed with blocker `'A referenced GraphQL introspection report is invalid or failed'`.
   - Test that referencing only the disguised dossier produces both `'A successful GraphQL introspection probe child JSON report is required'` and `'A referenced GraphQL introspection report is invalid or failed'`.
4. **`optional_ai_posture`**:
   - Test that referencing a disguised dossier or non-candidate JSON report beside a valid live report (`[good, disguisedDossier]`) fails closed with blocker `'A referenced no-AI production posture report is invalid or failed'`.
   - Test that referencing only the disguised dossier produces both `'A successful no-AI production posture child JSON report is required'` and `'A referenced no-AI production posture report is invalid or failed'`.

### 3. Verification and documentation

Run the complete verification suite:
- `npm run ops:readiness-test` (all tests passing)
- `npm run ops:launch-drill-test` (all 68 tests passing)
- `npm run ops:readiness-schema-test` (all 8 tests passing)
- `npm run ops:templates` and `npm run ops:templates-test` (all 57 tests passing)
- All 21 ops test suites via `npm run ops:check`
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`
- Unresolved template check: `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` fails closed with 0 approved categories, 11 blocked, 70 blockers.
- Update documentation:
  - `docs/build-plan.md` under Phase 12K (Prompt 247)
  - `docs/operations.md` under Phase 12K (Prompt 247)
  - `docs/launch-checklist.md` under Sections 3 and 7 (Categories 3, 4, 7, 9, 11)
  - `docs/security.md` Phase 12K evidence integrity

## Non-goals

- Authorizing production launch or altering operator sign-off requirements.
- Relabeling simulation preflight artifacts as live production receipts.
- Adding non-existent drill runner stages to the Unified Launch Evidence Dossier for policy or posture categories.
- Mutating live production secrets, DNS records, retention jobs, or GraphQL configurations.
