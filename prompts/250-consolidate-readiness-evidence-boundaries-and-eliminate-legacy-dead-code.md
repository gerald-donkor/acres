# Phase 12K follow-up — consolidate readiness evidence boundaries and eliminate legacy dead code

## Scope and why this is next

Complete the launch readiness evidence architecture consolidation across all 11 launch checklist categories in `scripts/ops/check-launch-readiness.js` by eliminating unreachable legacy dead code and unifying evidence boundary contracts.

Following Prompts 235–249:
- Every single one of the 11 required checklist categories in `REQUIRED_SECTIONS`:
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
  now has dedicated candidate discrimination, category-specific dossier/evidence validation (`validVolumeDossier`, `validRecoveryDossier`, `validCaddyDossier`, `validCapacityDossier`, `validSecretDossier`, `validDeploymentDossier`), category-specific blocker messages, and clean control-flow termination via explicit `continue;` statements.
- However:
  1. In `checkEvidenceFile` (`scripts/ops/check-launch-readiness.js`), the category list checked against is a hardcoded array literal repeating all 11 category names rather than referencing canonical `REQUIRED_SECTIONS`, creating potential drift.
  2. In `checkEvidenceFileContents` (`scripts/ops/check-launch-readiness.js`), lines 2543–3067 contain over 520 lines of unreachable legacy code (generic status/overall_status checks, failed_stages, generic stages loops, legacy restore/reconciliation/caddy/deployment/volume/rotation/capacity/DoS/supply-chain blocks) that were superseded by the category-specific validators in Prompts 235–249. Because all 11 categories in `REQUIRED_SECTIONS` terminate with `continue;`, these lines can never execute.
  3. If an unrecognized category is ever evaluated, it currently falls through the dead legacy blocks without explicit category-level rejection. Replacing the dead code with an explicit fail-closed fallback guarantees safety.

This is a repository-owned, dependency-safe hardening and maintenance step within Phase 12K. Prompt 201 still governs real production evidence collection and sign-off.

Planning baseline: clean worktree at commit `f51751ef01a85618f816bab93cbe5b76e81c4c3f` (`fix(ops): unify capacity and supply chain contracts`).

## References read and execution prerequisites

Planning read:
- `AGENTS.md` phase-control, workflow, prompt, product, and standing rules
- `docs/build-plan.md` Phase 12 and Phase 12K (prompts 235–249)
- `docs/skills.md`
- `docs/system-architecture.md` §11–12
- `docs/security.md` TM-01, TM-04, TM-05, TM-15, and Phase 12K evidence integrity
- `docs/operations.md` Phase 12K and prompts 235–249
- `docs/launch-checklist.md` Sections 2–7
- `prompts/201-production-launch-evidence-and-signoff.md`

Code inspected:
- `scripts/ops/check-launch-readiness.js` (`REQUIRED_SECTIONS`, `checkEvidenceFile`, `checkEvidenceFileContents`, `validateReadiness`)
- `scripts/ops/check-launch-readiness.spec.js` (Category 1–11 tests, dossier contract tests)
- `infra/launch/readiness.example.json` and `infra/launch/readiness.schema.json`

## Measurable requirements and implementation plan

### 1. Unify `checkEvidenceFile` in `scripts/ops/check-launch-readiness.js`

In `checkEvidenceFile(ref, category, addBlocker, baseDirs)`:
- Replace the hardcoded array literal with canonical `REQUIRED_SECTIONS`:
  ```javascript
  function checkEvidenceFile(ref, category, addBlocker, baseDirs) {
    if (!REQUIRED_SECTIONS.includes(category)) {
      return checkEvidenceFileContents(ref, category, addBlocker, baseDirs);
    }
    // ... safe evidence failure boundary ...
  ```

### 2. Eliminate unreachable legacy dead code in `checkEvidenceFileContents`

In `checkEvidenceFileContents(ref, category, addBlocker, baseDirs)`:
- Verify that each of the 11 categories in `REQUIRED_SECTIONS` cleanly terminates with `continue;`.
- Remove lines 2543–3067 (the 525+ lines of dead, shadowed legacy checks including generic status checks, failed_stages, generic stage iteration, and old drill/dossier check fragments).
- Add an explicit fail-closed fallback for any unrecognized category:
  ```javascript
      if (!REQUIRED_SECTIONS.includes(category)) {
        addBlocker(category, `Unrecognized launch checklist category '${category}'`);
        continue;
      }
  ```
- Return `parsedFiles` directly after the loop.

### 3. Tests in `scripts/ops/check-launch-readiness.spec.js`

1. Add unit test asserting `REQUIRED_SECTIONS` canonical alignment with evidence boundary checks.
2. Add unit test verifying that unknown/unrecognized categories fail closed cleanly without crashing or escaping the error boundary.
3. Ensure all 613+ existing tests pass cleanly without regression.

### 4. Verification and documentation

- Run `npm run ops:readiness-test` (all tests passing)
- Run `npm run ops:launch-drill-test` (all tests passing)
- Run `npm run ops:readiness-schema-test`
- Run `npm run ops:templates` and `npm run ops:templates-test`
- Run all ops test sub-suites
- Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`
- Verify fail-closed behavior of unresolved template: `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` (0 approved, 11 blocked, 70 blockers).
- Update documentation:
  - `docs/build-plan.md` under Phase 12K (Prompt 250)
  - `docs/operations.md` under Phase 12K (Prompt 250)
  - `docs/security.md` Phase 12K evidence integrity

## Non-goals

- Authorizing production launch or altering operator sign-off requirements.
- Relabeling simulation preflight artifacts as live production receipts.
- Changing the schema or external API contract of `infra/launch/readiness.schema.json`.

## SKILLS USED

- `javascript-testing-patterns`: Design and structure Node.js test runner suites with assertions and temporary fixtures.
- `security-best-practices`: Secure fail-closed evidence validation and safe diagnostic boundary enforcement.
- `deployment-pipeline-design`: Release and deployment drill contract verification.
- `prometheus-configuration`: Capacity and alerting SLO telemetry verification contracts.
- `requesting-code-review`: Dispatch reviewer subagent with structured context for independent evaluation.
- `receiving-code-review`: Evaluate reviewer feedback with technical rigor before taking action.
- `caveman-commit`: Conventional commit message formatting for final commit to main.
