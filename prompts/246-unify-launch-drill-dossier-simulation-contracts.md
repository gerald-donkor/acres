# Phase 12K follow-up — unify launch drill dossier simulation contracts

## Scope and why this is next

Following Prompts 235–245, each of the 11 launch readiness categories in `scripts/ops/check-launch-readiness.js`
separates simulation preflight/rehearsal from independently verified live operator receipts. However, the
orchestrator-level Unified Launch Evidence Dossier assembler (`scripts/ops/assemble-launch-dossier.js`) and
the readiness checker's dossier recognizers still have residual gaps:

1. In `scripts/ops/assemble-launch-dossier.js`:
   - Stage 3 (`ingress_deployment`): `caddyEvidence.execution_mode === "simulation"` is verified, but
     `depEvidence.execution_mode === "simulation"` is not verified.
   - Stage 5 (`secret_rotation`): `secEvidence.execution_mode === "simulation"` is not verified (despite
     `run-secret-rotation-drill.sh` emitting `execution_mode: 'simulation'`).
   - Stage 6 (`capacity_alerting`): `capEvidence.execution_mode` is not validated (it only tests `mode === "synthetic"`
     or `mode === "live"`, despite `run-capacity-alerting-drill.sh` emitting `execution_mode`).
   - The emitted Unified Launch Evidence Dossier object declares `environment: "drill"` but lacks top-level
     `execution_mode: "simulation"`.
   - Stage baselines in the dossier: `deploymentBaseline` records `caddyRoutingPreflight: "simulation"`, but
     should also record `deploymentPreflight: "simulation"`. `secretRotationBaseline` should record
     `rotationPreflight: "simulation"`. `databaseTelemetryBaseline` should record `capacityPreflight: "simulation"`
     (or `"live"` when target-bound).
2. In `scripts/ops/run-launch-drills.spec.js`:
   - The capacity mock fixture lacks `execution_mode: "simulation"`.
   - Lacks rejection tests for `deployment:legacy-mode`, `deployment:live-mode`, `rotation:legacy-mode`,
     `rotation:live-mode`, `capacity:legacy-mode`, and `capacity:live-mode` (in dry-run).
3. In `scripts/ops/check-launch-readiness.js`:
   - Add `validDeploymentDossier(report)` and `validSecretDossier(report)` helpers so that Category 10
     (`deployment_and_rollback`) and Category 3 (`secrets_management`) safely accept a passing unified dossier
     when accompanying live child receipts, while rejecting disguised or failing dossiers.

This is a dependency-safe hardening step within Phase 12K, completing the simulation preflight contract across
the unified orchestrator and its evidence consumers.

Planning baseline: clean worktree at commit `00cb1551547c2a28ba22c840b3f22b1f40ed1454`
(`fix(ops): separate capacity alerting preflight from live evidence`).

## References read and execution prerequisites

Planning read:
- `AGENTS.md` phase-control, workflow, prompt, product, and standing rules
- `docs/build-plan.md` Phase 12 and Phase 12K
- `docs/skills.md`
- `docs/system-architecture.md` §11–12
- `docs/security.md` Phase 12K evidence integrity
- `docs/operations.md` Phase 12K and prompts 233–245
- `docs/launch-checklist.md` Section 4 Unified Drill Execution & Evidence Dossier

Code inspected:
- `scripts/ops/assemble-launch-dossier.js`
- `scripts/ops/assemble-launch-dossier.spec.js`
- `scripts/ops/run-launch-drills.sh`
- `scripts/ops/run-launch-drills.spec.js`
- `scripts/ops/check-launch-readiness.js`
- `scripts/ops/check-launch-readiness.spec.js`
- `scripts/ops/check-production-templates.sh`

## Implementation plan

### 1. Enforce simulation mode on all child receipts in assemble-launch-dossier.js

In `scripts/ops/assemble-launch-dossier.js`:
- In Stage 3 (`ingress_deployment`):
  Verify `depEvidence.execution_mode === "simulation"`.
  In `deploymentBaseline`: add `deploymentPreflight: "simulation"`.
  In `summary`: add `deploymentPreflight: "simulation"`.
- In Stage 5 (`secret_rotation`):
  Verify `secEvidence.execution_mode === "simulation"`.
  In `secretRotationBaseline`: add `rotationPreflight: "simulation"`.
  In `summary`: add `rotationPreflight: "simulation"`.
- In Stage 6 (`capacity_alerting`):
  When `dryRun === "1"`: require `capEvidence.execution_mode === "simulation"` (or `mode === "synthetic"` for backward compatibility).
  When `explicitLiveTargets`: require `capEvidence.execution_mode === "live"` and `capEvidence.mode === "live"`.
  In `databaseTelemetryBaseline`: add `capacityPreflight: dryRun === "1" ? "simulation" : "live"`.
- In the published `dossier` object:
  Add `execution_mode: "simulation"`.

### 2. Update run-launch-drills.spec.js with execution_mode rejection coverage

In `scripts/ops/run-launch-drills.spec.js`:
- Update `capacity` fixture to include `execution_mode: "simulation"`.
- Add test scenarios in `makeCorruptEvidence`:
  - `deployment:legacy-mode` (delete `execution_mode`)
  - `deployment:live-mode` (`execution_mode = "live"`)
  - `rotation:legacy-mode` (delete `execution_mode`)
  - `rotation:live-mode` (`execution_mode = "live"`)
  - `capacity:legacy-exec-mode` (delete `execution_mode`)
  - `capacity:live-exec-mode` (`execution_mode = "live"` in dry-run)
- Add assertions that `r.dossier.execution_mode === "simulation"`,
  `r.dossier.deploymentBaseline.deploymentPreflight === "simulation"`, and
  `r.dossier.secretRotationBaseline.rotationPreflight === "simulation"`.

### 3. Add validDeploymentDossier and validSecretDossier to check-launch-readiness.js

In `scripts/ops/check-launch-readiness.js`:
- Add `validDeploymentDossier(report)` helper checking `overall_status === 'PASSED'` and valid deployment baseline/stages.
- Add `validSecretDossier(report)` helper checking `overall_status === 'PASSED'` and valid secret rotation baseline/stages.
- In `checkEvidenceFileContents`:
  - For `deployment_and_rollback`: if candidate, defer to approval; if not candidate and not valid deployment dossier, add blocker.
  - For `secrets_management`: if candidate, defer to approval; if not candidate and not valid secret dossier, add blocker.
- In `scripts/ops/check-launch-readiness.spec.js`:
  - Test valid deployment dossier and valid secret rotation dossier accompanying live receipts.
  - Test rejection of disguised or failed dossiers in Category 10 and Category 3.

### 4. Verification and documentation

- Run tests:
  - `npm run ops:launch-drill-test`
  - `npm run ops:readiness-test`
  - `npm run ops:readiness-schema-test`
  - `npm run ops:templates`
  - `npm run ops:templates-test`
  - Full 21 ops test suites
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `git diff --check`
- Update documentation:
  - `docs/build-plan.md` under Phase 12K (Prompt 246)
  - `docs/operations.md` under Phase 12K (Prompt 246)
  - `docs/launch-checklist.md` Section 4
  - `docs/security.md`
- Dispatch code review subagent, evaluate feedback with technical rigor, apply any needed fixes.
- Commit to `main` using `caveman-commit`.

## Verification plan

- `npm run ops:launch-drill-test`
- `npm run ops:readiness-test`
- `npm run ops:readiness-schema-test`
- `npm run ops:templates`
- `npm run ops:templates-test`
- All 21 ops test sub-suites
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `git diff --check`
- Validation of fail-closed behavior on `infra/launch/readiness.example.json`

## SKILLS USED

- `deployment-pipeline-design` — enforce consistent simulation/rehearsal preflight classification across drill stages and the launch dossier.
- `error-handling-patterns` — fail-closed validation of execution mode on child receipts and safe suppression of diagnostics.
- `javascript-testing-patterns` — isolated process testing and corrupt receipt scenario coverage.
- `security-best-practices` — secure defaults, unalterable simulation receipts, and immutable dossier fields.
- `security-threat-model` — preserve launch evidence integrity and prevent simulation preflight masquerading as production sign-off.
- `requesting-code-review` — dispatch independent reviewer subagent.
- `receiving-code-review` — evaluate feedback with technical rigor against codebase reality.
- `caveman-commit` — format conventional commit message.
