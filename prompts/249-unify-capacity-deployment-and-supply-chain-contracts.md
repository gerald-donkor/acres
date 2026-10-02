# Phase 12K follow-up — unify capacity, deployment, and supply chain dossier and candidate contracts

## Scope and why this is next

Complete the readiness evidence unification loop across all 11 launch checklist categories in
`scripts/ops/check-launch-readiness.js` by addressing the remaining dossier validation, candidate
exclusion, and evidence handling gaps in:
1. `slo_and_alerting` (Category 5)
2. `deployment_and_rollback` (Category 10)
3. `secrets_management` (Category 3 - supply chain child evidence)

Following Prompts 235–248:
- Categories 1 (`production_domain_tls`), 2 (`smtp_delivery`), 4 (`secret_references`),
  6 (`backup_and_disaster_recovery`), 7 (`data_retention_policy`), 8 (`volume_encryption`),
  9 (`graphql_introspection`), and 11 (`optional_ai_posture`) each enforce candidate exclusion,
  hardened dossier validation, category-specific fail-closed blockers, and clean termination with `continue;`.
- However:
  1. `validCapacityDossier(report)` in `scripts/ops/check-launch-readiness.js`:
     - Does not accept a `file` parameter, failing to guard against child-named files (e.g.
       `capacity-alerting-drill-evidence-*.json`) impersonating a dossier.
     - Strictly requires `report.capacityAlertingBaseline`, but dossiers published by
       `scripts/ops/assemble-launch-dossier.js` produce `databaseTelemetryBaseline` with `status: 'verified'`
       and comprehensive summary fields (`capacityAlerting: 'passed'`, `sloCompliance: 'capacity_alerts_verified'`,
       `alertVerification: 'passed'`, `dosResilience: 'passed'`, `databaseBaselineCompliance: 'passed'`),
       meaning real launch dossiers fail `validCapacityDossier`.
     - In `checkEvidenceFileContents`, `validCapacityDossier(parsed)` is called without passing `file`.
     - In `scripts/ops/check-launch-readiness.spec.js`, `validCapacityDossier` is not tested for contract and
       rejection scenarios, and Category 5 is not tested for accepting a valid drill dossier beside live capacity receipts.
  2. `deployment_and_rollback` (Category 10) in `checkEvidenceFileContents`:
     - Contains an ad-hoc fallback `if (!(parsed && typeof parsed.status === 'string' && parsed.status.toLowerCase() === 'success'))`,
       allowing non-candidate non-dossier files with generic `status: 'success'` to bypass validation unless
       it is a candidate or recognized dossier. This should fail closed consistently with other categories.
  3. `secrets_management` (Category 3) in `checkEvidenceFileContents`:
     - When `isSastEvidence(parsed, file) || isSbomEvidence(parsed, file) || isContainerSecurityEvidence(parsed, file)`
       matches, it does not cleanly terminate, instead falling through hundreds of lines of unreachable/dead
       drill checks. Encapsulating supply chain child evidence validation and cleanly terminating with `continue;`
       ensures structural consistency across all categories.

This is a repository-owned, dependency-safe hardening step within Phase 12K. Prompt 201 still governs real
production evidence collection and sign-off.

Planning baseline: clean worktree at commit `5d6c113ae7baea47b1029b02bdc9d6de70024aa3`
(`fix(ops): unify drill dossier and candidate contracts`).

## References read and execution prerequisites

Planning read:
- `AGENTS.md` phase-control, workflow, prompt, product, and standing rules
- `docs/build-plan.md` Phase 12 and Phase 12K (prompts 235–248)
- `docs/skills.md`
- `docs/system-architecture.md` §11–12
- `docs/security.md` TM-01, TM-04, TM-05, TM-15, and Phase 12K evidence integrity
- `docs/operations.md` Phase 12K and prompts 235–248
- `docs/launch-checklist.md` Sections 2–7 (Categories 3, 5, 10)
- `prompts/201-production-launch-evidence-and-signoff.md`

Code inspected:
- `scripts/ops/check-launch-readiness.js` (`validCapacityDossier`, `isCapacityAlertingCandidate`, `checkEvidenceFileContents`, `module.exports`)
- `scripts/ops/assemble-launch-dossier.js` (`databaseTelemetryBaseline`, `capacityAlerting`, summary fields)
- `scripts/ops/check-launch-readiness.spec.js` (Category 3, 5, 10 tests)
- `infra/launch/readiness.example.json` and `infra/launch/readiness.schema.json`

## Measurable requirements and implementation plan

### 1. Harden `validCapacityDossier(report, file)` in `scripts/ops/check-launch-readiness.js`

1. Update signature to accept `(report, file)`:
   - Reject non-object / array / null:
     ```javascript
     if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
     ```
   - Guard against child filename impersonation:
     ```javascript
     const fileName = typeof file === 'string' ? path.basename(file) : '';
     if (fileName.startsWith('capacity-alerting')) return false;
     ```
2. Validate overall status and stages:
   - Require `report.overall_status === 'PASSED'`.
   - Require at least one structural dossier indicator (`Array.isArray(report.stages)`, `report.dossier_version !== undefined`,
     `report.databaseTelemetryBaseline !== undefined`, or `report.capacityAlertingBaseline !== undefined`).
   - If `report.stages` is an array:
     - No stage may have `status === 'FAILED'`.
     - The `capacity_alerting` stage (if present) must have `status === 'PASSED'`.
3. Validate baseline:
   - Check `databaseTelemetryBaseline`: if present, it must be an object with `status === 'verified'` and not breached.
   - If `report.capacityAlertingBaseline` is present, it must also be an object with `status === 'verified'`.
   - At least one baseline (`databaseTelemetryBaseline` or `capacityAlertingBaseline`) or passing stages must be present.
4. Validate summary:
   - Require unbreached summary flags:
     - `summary.capacityAlerting !== 'failed'`
     - `summary.capacityPreflight !== 'failed'`
     - `summary.sloCompliance !== 'failed' && summary.sloCompliance !== 'capacity_alerts_failed'`
     - `summary.capacitySloCompliance !== 'failed'`
     - `summary.databaseBaselineCompliance !== 'failed'`
     - `summary.alertVerification !== 'failed'`
     - `summary.dosResilience !== 'failed'`
5. In `checkEvidenceFileContents`:
   - Pass `(parsed, file)`:
     ```javascript
     if (category === 'slo_and_alerting') {
       if (isCapacityAlertingCandidate({ file, parsed })) {
         // The approval call below validates children with its explicit evaluation clock and live requirement.
         continue;
       }
       if (!validCapacityDossier(parsed, file)) {
         addBlocker(category, 'A referenced capacity and alerting report is invalid or failed');
       }
       continue;
     }
     ```

### 2. Unify `deployment_and_rollback` in `checkEvidenceFileContents`

Ensure non-candidate non-dossier evidence fails closed cleanly:
- Evaluate `isDeploymentDrillCandidate`: if candidate, continue to approval-time validation.
- If it has dossier markers (`dossier_version`, `stages`, `deploymentBaseline`), evaluate `validDeploymentDossier(parsed, file)`.
- If non-dossier non-candidate, only allow passing release provenance receipts (`parsed.status.toLowerCase() === 'success'`), otherwise add blocker `'A referenced deployment drill report is invalid or failed'` and `continue;`.

### 3. Encapsulate supply chain evidence in `secrets_management`

In `checkEvidenceFileContents`:
- For `category === 'secrets_management'`:
  - If `isSecretRotationCandidate({ file, parsed })`, `continue;`.
  - If `isSastEvidence(parsed, file) || isSbomEvidence(parsed, file) || isContainerSecurityEvidence(parsed, file)`:
    - Validate supply chain child evidence (SAST status/findings/suppressions, SBOM license compliance/violations, container security checks/errors).
    - If any check fails, call `addBlocker(category, ...)` (which triggers fail-closed masking via `fail()`).
    - Terminate with `continue;`, eliminating fall-through to dead code.
  - If not candidate and not supply chain:
    - Evaluate `validSecretDossier(parsed, file)`.
    - If invalid, add blocker `'A referenced secret rotation report is invalid or failed'`.
    - Terminate with `continue;`.

### 4. Tests in `scripts/ops/check-launch-readiness.spec.js`

1. Import `validCapacityDossier` from `scripts/ops/check-launch-readiness.js`.
2. Add `test('validCapacityDossier contract and rejection scenarios', () => { ... })`:
   - Valid dossier returns `true`.
   - Null, primitive, array returns `false`.
   - Child filename (`capacity-alerting-evidence.json`) returns `false`.
   - Overall status `'FAILED'`, failed stages, breached `databaseTelemetryBaseline`, breached summary fields return `false`.
3. Add Category 5 integration test:
   - Category 5 accepts valid drill dossier alongside live capacity operator receipt without spurious blockers.
   - Category 5 rejects failing or disguised dossiers with `'A referenced capacity and alerting report is invalid or failed'`.

### 5. Verification and documentation

- Run `npm run ops:readiness-test` (all tests passing)
- Run `npm run ops:launch-drill-test` (all tests passing)
- Run `npm run ops:readiness-schema-test`
- Run `npm run ops:templates` and `npm run ops:templates-test`
- Run all 21 ops test sub-suites
- Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`
- Verify fail-closed behavior of unresolved template: `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` (0 approved, 11 blocked, 70 blockers).
- Update documentation:
  - `docs/build-plan.md` under Phase 12K (Prompt 249)
  - `docs/operations.md` under Phase 12K (Prompt 249)
  - `docs/launch-checklist.md` under Sections 3 and 7 (Category 5)
  - `docs/security.md` Phase 12K evidence integrity

## Non-goals

- Authorizing production launch or altering operator sign-off requirements.
- Relabeling simulation preflight artifacts as live production receipts.

## SKILLS USED

- `javascript-testing-patterns`: Design and structure Node.js test runner suites with assertions and temporary fixtures.
- `security-best-practices`: Secure fail-closed evidence validation and safe diagnostic boundary enforcement.
- `deployment-pipeline-design`: Release and deployment drill contract verification.
- `prometheus-configuration`: Capacity and alerting SLO telemetry verification contracts.
- `requesting-code-review`: Dispatch reviewer subagent with structured context for independent evaluation.
- `receiving-code-review`: Evaluate reviewer feedback with technical rigor before taking action.
- `caveman-commit`: Conventional commit message formatting for final commit to main.
