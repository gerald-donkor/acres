# Phase 12K follow-up — export and test supply chain and static evidence contracts in launch readiness

## Scope and why this is next

Complete the launch readiness evidence architecture consolidation across `scripts/ops/check-launch-readiness.js` by establishing modular exports and comprehensive unit test coverage for supply chain evidence validation and Caddy static evidence verification.

Following Prompts 235–250:
- Every one of the 11 required checklist categories in `REQUIRED_SECTIONS`:
  1. `volume_encryption`
  2. `backup_and_disaster_recovery`
  3. `production_domain_tls`
  4. `smtp_delivery`
  5. `slo_and_alerting`
  6. `secrets_management`
  7. `deployment_and_rollback`
  8. `secret_references`
  9. `data_retention_policy`
  10. `graphql_introspection`
  11. `optional_ai_posture`
  has dedicated candidate discrimination, category-specific dossier/evidence validation, and clean control-flow termination via explicit `continue;` statements.
- However:
  1. In `scripts/ops/check-launch-readiness.js`, `validCaddyStaticEvidence` is defined at line 403, misplaced between disaster recovery candidate checks (`isReconciliationCandidate`) and report validation (`validateReconciliationReport`). It should be relocated to the Caddy section adjacent to `validCaddyDossier` and `validateCaddyRoutingReport` to restore architectural locality.
  2. `validCaddyStaticEvidence`, `isSastEvidence`, `isSbomEvidence`, `isContainerSecurityEvidence`, and `validateSupplyChainEvidence` are internal helper functions that are not exported in `module.exports`. Exporting them makes the readiness validation contracts fully inspectable, modular, and directly testable.
  3. In `scripts/ops/check-launch-readiness.spec.js`, there is currently zero direct unit test coverage for `validCaddyStaticEvidence` and `validateSupplyChainEvidence` (including its sub-checks for SAST findings, expired suppressions, SBOM license compliance/violations, container security checks, and exitCode/status failures).

This is a repository-owned, dependency-safe hardening and maintenance step within Phase 12K. Prompt 201 still governs real production evidence collection and sign-off.

Planning baseline: clean worktree at commit `78e4a7a583b08556fc25394688920036c9792b2e` (`fix(ops): consolidate readiness evidence boundaries`).

## References read and execution prerequisites

Planning read:
- `AGENTS.md` phase-control, workflow, prompt, product, and standing rules
- `docs/build-plan.md` Phase 12 and Phase 12K (prompts 235–250)
- `docs/skills.md`
- `docs/system-architecture.md` §11–12
- `docs/security.md` TM-01, TM-04, TM-05, TM-15, and Phase 12K evidence integrity
- `docs/operations.md` Phase 12K and prompts 235–250
- `docs/launch-checklist.md` Sections 2–7 (Categories 1, 3, 10)
- `prompts/201-production-launch-evidence-and-signoff.md`

Code inspected:
- `scripts/ops/check-launch-readiness.js` (`validCaddyStaticEvidence`, `isSastEvidence`, `isSbomEvidence`, `isContainerSecurityEvidence`, `validateSupplyChainEvidence`, `checkEvidenceFileContents`, `module.exports`)
- `scripts/ops/check-launch-readiness.spec.js` (Category 1, 3, 10 tests, dossier contract tests)
- `infra/launch/readiness.example.json` and `infra/launch/readiness.schema.json`

## Measurable requirements and implementation plan

### 1. Relocate and export helpers in `scripts/ops/check-launch-readiness.js`

1. Relocate `validCaddyStaticEvidence` from lines 403–414 to the Caddy section (directly preceding `validCaddyDossier` around line 1660).
2. Export the following functions in `module.exports`:
   - `validCaddyStaticEvidence`
   - `isSastEvidence`
   - `isSbomEvidence`
   - `isContainerSecurityEvidence`
   - `validateSupplyChainEvidence`

### 2. Unit and contract test suite in `scripts/ops/check-launch-readiness.spec.js`

Add a dedicated test suite verifying:
1. `validCaddyStaticEvidence`:
   - Accepts valid static integrity verification report objects (`drill_type === 'static_integrity_verification'`) with `valid: true`.
   - Accepts static integrity reports with `static-integrity-evidence-` filename prefix.
   - Rejects static integrity reports when `validateStaticEvidence(report).valid !== true`.
   - Rejects filenames starting with `caddy-routing`.
   - Rejects non-objects, arrays, null, undefined.
2. `isSastEvidence`:
   - Identifies SAST scan evidence by filename (`sast-scan-evidence-`, `sast-evidence-`).
   - Identifies SAST scan evidence by `drill_type === 'sast_security_scan'`.
   - Identifies SAST scan evidence by `blockingActiveFindings` array and boolean `passed`.
   - Rejects non-SAST objects, empty objects, non-objects.
3. `isSbomEvidence`:
   - Identifies SBOM evidence by filename (`sbom-inventory-`, `sbom-evidence-`).
   - Identifies SBOM evidence by `bomFormat === 'CycloneDX'`.
   - Identifies SBOM evidence by presence of `licenseCompliance`.
   - Rejects non-SBOM objects, non-objects.
4. `isContainerSecurityEvidence`:
   - Identifies container security evidence by filename (`container-security-evidence-`).
   - Identifies container security evidence by `drill_type === 'container_security_verification'`.
   - Identifies container security evidence by `checks` array and boolean `valid`.
   - Rejects non-container objects, non-objects.
5. `validateSupplyChainEvidence`:
   - Returns `true` and adds no blockers for valid, compliant SAST, SBOM, and container reports.
   - Rejects reports with `status: 'failed'`, `status: 'failure'`, or `status: 'error'`.
   - Rejects reports with `overall_status: 'failed'`.
   - Rejects reports with `success: false`.
   - Rejects reports with non-zero `summary.exitCode`.
   - For SAST: rejects `status !== 'success'`, `passed === false`, active `blockingActiveFindings`, or `expiredFindings`.
   - For SBOM: rejects missing `licenseCompliance`, `licenseCompliance.compliant === false`, `licenseCompliance.violations`, or `licenseViolations`.
   - For Container Security: rejects `status !== 'success'`, `valid === false`, `errors`, or failed checks in `checks`.
   - Asserts that blocker messages emitted match exact category contracts.

### 3. Verification and documentation

- Run `npm run ops:readiness-test` (all tests passing)
- Run `npm run ops:launch-drill-test` (all tests passing)
- Run `npm run ops:readiness-schema-test`
- Run `npm run ops:templates` and `npm run ops:templates-test`
- Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`
- Verify fail-closed behavior of unresolved template: `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` (0 approved, 11 blocked, 70 blockers).
- Update documentation:
  - `docs/build-plan.md` under Phase 12K (Prompt 251)
  - `docs/operations.md` under Phase 12K (Prompt 251)
  - `docs/security.md` Phase 12K evidence integrity

## Non-goals

- Modifying the external behavior or blocker messages of `checkLaunchReadiness`.
- Authorizing production launch or altering operator sign-off requirements.
- Changing `infra/launch/readiness.schema.json`.

## SKILLS USED

- `javascript-testing-patterns`: Design and structure Node.js test runner suites with assertions and temporary fixtures.
- `security-best-practices`: Secure fail-closed evidence validation and safe diagnostic boundary enforcement.
- `deployment-pipeline-design`: Release and deployment drill contract verification.
- `prometheus-configuration`: Capacity and alerting SLO telemetry verification contracts.
- `requesting-code-review`: Dispatch reviewer subagent with structured context for independent evaluation.
- `receiving-code-review`: Evaluate reviewer feedback with technical rigor before taking action.
- `caveman-commit`: Conventional commit message formatting for final commit to main.
