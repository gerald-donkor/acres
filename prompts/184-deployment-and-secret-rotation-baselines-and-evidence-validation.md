# 184 — deployment and secret rotation baselines and evidence validation

## Scope and why this is next

The committed baseline is `45f09b2` on `main`; the worktree is clean when this prompt was prepared. This is a bounded Phase 12 operational orchestrator, deployment rollback baseline, secret rotation baseline, and launch readiness cross-validation step under `docs/build-plan.md` §13, §21, §22, `docs/launch-checklist.md` §3.3, §3.10, §4, §7, and `docs/operations.md`.

Prompts 174–183 established deep database connection pool and server telemetry, added 4 Prometheus alert rules (expanding the operational alert suite to 11 rules), added visual panels in Grafana (100% alert coverage), reconciled all 11 incident runbooks in `docs/launch-checklist.md` §5, enforced Category 5 & 6 SLO floors/ceilings, bubbled up database baseline telemetry (from stage 6) and disaster recovery baseline telemetry (from stage 7) into the Unified Launch Evidence Dossier, and hardened `checkEvidenceFile` to cross-validate capacity, database, restore, and storage reconciliation child evidence.

However, several operational gaps remain in stage 3 (deployment and rollback) and stage 5 (secret rotation) baseline aggregation and child evidence cross-validation:
1. In `scripts/ops/run-launch-drills.sh`, stage 3 (`ingress_deployment`) executes `verify-caddy-routing.js` and `run-deployment-drill.sh`, generating child evidence `deployment-drill-evidence-<timestamp>.json`. However, `run-launch-drills.sh` emits the Unified Launch Evidence Dossier (`dossier`) with a simple summary flag `ingressDeployment: "passed" | "failed"`, completely omitting structured `deploymentBaseline` (telemetry and assertions covering `schemaBackwardCompatible`, `caddyRoutingVerified`, `rollbackProcedureVerified`, `networkIsolationVerified`, `migrationCount`, and `routesTested`) and omitting `summary.deploymentCompliance` and `summary.rollbackCompliance`.
2. In `scripts/ops/run-launch-drills.sh`, stage 5 (`secret_rotation`) executes `run-secret-rotation-drill.sh`, generating child evidence `secret-rotation-evidence-<timestamp>.json`. However, `run-launch-drills.sh` emits the dossier with a simple summary flag `secretRotation: "passed" | "failed"`, completely omitting structured `secretRotationBaseline` (verifications across `sessionRollover`, `csrfRollover`, `databaseRotation`, `valkeyRotation`, `storageRotation`, `compromiseResponse`, and `redactionAudit` with `rawSecretsMasked` and `zeroDevPasswordsDetected`) and omitting `summary.secretRotationCompliance`.
3. In `scripts/ops/check-launch-readiness.js`, `checkEvidenceFile` does not cross-validate deployment and rollback child evidence:
   - If an approved section or release record references `deployment-drill-evidence-*.json`, `checkEvidenceFile` does not check whether `parsed.status === 'success'`, whether `parsed.schema_backward_compatible === true`, whether `parsed.rollback_procedure_verified === true`, whether `parsed.caddy_routing_verified === true`, or whether `parsed.network_isolation_verified === true`. An evidence file reporting an unverified rollback procedure or a destructive non-backward-compatible migration slips through without blocking launch approval.
4. In `scripts/ops/check-launch-readiness.js`, `checkEvidenceFile` does not cross-validate secret rotation child evidence:
   - If an approved section references `secret-rotation-evidence-*.json`, `checkEvidenceFile` does not check whether `parsed.status === 'success'`, whether `parsed.errors` is empty, whether each rotation step (`session_rollover`, `csrf_rollover`, `database_rotation`, `valkey_rotation`, `storage_rotation`, `compromise_response`, `redaction_audit`) passed, or whether `raw_secrets_masked` and `zero_dev_passwords_detected` are true. An evidence file reporting credential rotation failure or secret leakage slips through without blocking launch approval.
5. In `scripts/ops/check-launch-readiness.js`, `checkEvidenceFile` does not inspect Unified Launch Evidence Dossiers for deployment baseline breaches, rollback compliance failure, or secret rotation baseline breaches (`parsed.deploymentBaseline?.status === 'breached'`, `parsed.secretRotationBaseline?.status === 'breached'`, `summary.deploymentCompliance === 'failed'`, `summary.rollbackCompliance === 'failed'`, or `summary.secretRotationCompliance === 'failed'`).
6. In `scripts/ops/run-launch-drills.spec.js`, `assertDossierSchema(dossier)` does not validate `deploymentBaseline`, `secretRotationBaseline`, `summary.deploymentCompliance`, `summary.rollbackCompliance`, or `summary.secretRotationCompliance`.
7. In `scripts/ops/check-launch-readiness.spec.js`, there is no test coverage for deployment drill evidence failure blocking (status, schema compatibility, rollback procedure, caddy routing, network isolation), secret rotation drill evidence failure blocking (status, errors, step failure, redaction audit failure), or dossier deployment/secret-rotation baseline breach blocking.
8. In `scripts/ops/check-production-templates.sh`, the validator does not assert that `run-launch-drills.sh` emits `deploymentBaseline`, `secretRotationBaseline`, `deploymentCompliance`, `rollbackCompliance`, and `secretRotationCompliance`.

Bubble up `deploymentBaseline`, `secretRotationBaseline`, `summary.deploymentCompliance`, `summary.rollbackCompliance`, and `summary.secretRotationCompliance` into the Unified Launch Evidence Dossier in `scripts/ops/run-launch-drills.sh`. Cross-validate deployment promotion/rollback and secret rotation child evidence in `checkEvidenceFile` (`scripts/ops/check-launch-readiness.js`). Expand unit test suites in `scripts/ops/run-launch-drills.spec.js` and `scripts/ops/check-launch-readiness.spec.js`. Assert dossier baseline emission in `scripts/ops/check-production-templates.sh`. Update `docs/operations.md`, `docs/launch-checklist.md`, and `docs/build-plan.md`. Operator launch sign-off remains open.

## References and verified baseline

- Re-read `AGENTS.md` §§2, 4–7, 10, `docs/build-plan.md` §§13, 21, 22, `docs/operations.md` (prompts 174–183 records, Phase 12K section), `docs/launch-checklist.md` §§3.3, 3.10, 4, 7, and `docs/skills.md`.
- Inspect `scripts/ops/run-launch-drills.sh`, `scripts/ops/run-launch-drills.spec.js`, `scripts/ops/check-launch-readiness.js`, `scripts/ops/check-launch-readiness.spec.js`, `scripts/ops/check-production-templates.sh`, `scripts/ops/run-deployment-drill.sh`, and `scripts/ops/run-secret-rotation-drill.sh`.
- Child evidence structures emitted by stage 3 and stage 5 runners:
  - `deployment-drill-evidence-<timestamp>.json`:
    - `caddy_routing_verified`: boolean (true required)
    - `caddy_routes_tested`: number
    - `security_headers_verified`: boolean
    - `s3_sigv4_host_preserved`: boolean
    - `migrations_verified`: boolean
    - `migration_count`: number
    - `schema_backward_compatible`: boolean (true required)
    - `operational_templates_verified`: boolean
    - `secrets_scan_verified`: boolean
    - `readiness_probes_verified`: boolean
    - `probe_live_tested`: boolean
    - `network_isolation_verified`: boolean (true required)
    - `rollback_procedure_verified`: boolean (true required)
    - `status`: `"success"` | `"failed"` (`"success"` required)
  - `secret-rotation-evidence-<timestamp>.json`:
    - `drill_type`: `"zero_downtime_secret_rotation_and_compromise_response"`
    - `timestamp`: string
    - `dry_run`: boolean
    - `status`: `"success"` | `"failed"` (`"success"` required)
    - `errors`: array (must be empty)
    - `steps`:
      - `session_rollover.status`: `"passed"`
      - `csrf_rollover.status`: `"passed"`
      - `database_rotation.status`: `"passed"`
      - `valkey_rotation.status`: `"passed"`
      - `storage_rotation.status`: `"passed"`
      - `compromise_response.status`: `"passed"`
      - `redaction_audit.status`: `"passed"`
      - `redaction_audit.raw_secrets_masked`: boolean (true required)
      - `redaction_audit.zero_dev_passwords_detected`: boolean (true required)

## Implementation contract

1. **Extract and bubble up deployment and secret rotation baselines in `scripts/ops/run-launch-drills.sh`.**
   - In the Node.js dossier aggregation script inside `run-launch-drills.sh`:
     - Discover stage 3 child evidence:
       - Find artifact in `stages.find(s => s.stage_id === "ingress_deployment")` matching `deployment-drill-evidence-*.json`.
       - If file exists and parses as JSON, inspect its contents.
       - Validate `depPassed`:
         `depStage?.status === "PASSED" && depEvidence && depEvidence.status === "success" && depEvidence.schema_backward_compatible === true && depEvidence.caddy_routing_verified === true && depEvidence.rollback_procedure_verified === true && depEvidence.network_isolation_verified === true`.
       - If `depPassed` is true, populate:
         ```javascript
         deploymentBaseline = {
           status: "verified",
           schemaBackwardCompatible: depEvidence.schema_backward_compatible,
           caddyRoutingVerified: depEvidence.caddy_routing_verified,
           rollbackProcedureVerified: depEvidence.rollback_procedure_verified,
           networkIsolationVerified: depEvidence.network_isolation_verified,
           migrationCount: depEvidence.migration_count,
           routesTested: depEvidence.caddy_routes_tested,
         };
         ```
         and `summary.deploymentCompliance = "passed"`, `summary.rollbackCompliance = "passed"`.
       - Otherwise, populate:
         ```javascript
         deploymentBaseline = {
           status: "breached",
           error_message: depStage?.error_message || "stage 3 failed or child deployment evidence failed verification",
         };
         ```
         and `summary.deploymentCompliance = "failed"`, `summary.rollbackCompliance = "failed"`.
     - Discover stage 5 child evidence:
       - Find artifact in `stages.find(s => s.stage_id === "secret_rotation")` matching `secret-rotation-evidence-*.json`.
       - If file exists and parses as JSON, inspect its contents.
       - Validate `secPassed`:
         `secStage?.status === "PASSED" && secEvidence && secEvidence.status === "success" && Array.isArray(secEvidence.errors) && secEvidence.errors.length === 0 && secEvidence.steps?.session_rollover?.status === "passed" && secEvidence.steps?.csrf_rollover?.status === "passed" && secEvidence.steps?.database_rotation?.status === "passed" && secEvidence.steps?.valkey_rotation?.status === "passed" && secEvidence.steps?.storage_rotation?.status === "passed" && secEvidence.steps?.compromise_response?.status === "passed" && secEvidence.steps?.redaction_audit?.status === "passed" && secEvidence.steps?.redaction_audit?.raw_secrets_masked === true && secEvidence.steps?.redaction_audit?.zero_dev_passwords_detected === true`.
       - If `secPassed` is true, populate:
         ```javascript
         secretRotationBaseline = {
           status: "verified",
           steps: {
             sessionRollover: secEvidence.steps.session_rollover.status,
             csrfRollover: secEvidence.steps.csrf_rollover.status,
             databaseRotation: secEvidence.steps.database_rotation.status,
             valkeyRotation: secEvidence.steps.valkey_rotation.status,
             storageRotation: secEvidence.steps.storage_rotation.status,
             compromiseResponse: secEvidence.steps.compromise_response.status,
             redactionAudit: secEvidence.steps.redaction_audit.status,
           },
           redactionAudit: {
             rawSecretsMasked: secEvidence.steps.redaction_audit.raw_secrets_masked,
             zeroDevPasswordsDetected: secEvidence.steps.redaction_audit.zero_dev_passwords_detected,
           },
         };
         ```
         and `summary.secretRotationCompliance = "passed"`.
       - Otherwise, populate:
         ```javascript
         secretRotationBaseline = {
           status: "breached",
           error_message: secStage?.error_message || "stage 5 failed or child secret rotation evidence failed verification",
         };
         ```
         and `summary.secretRotationCompliance = "failed"`.
     - In `dossier` object:
       Add top-level fields:
       `deploymentBaseline,`
       `secretRotationBaseline,`
       And in `dossier.summary`:
       `deploymentCompliance,`
       `rollbackCompliance,`
       `secretRotationCompliance,`

2. **Cross-validate deployment and secret rotation child evidence in `checkEvidenceFile` (`scripts/ops/check-launch-readiness.js`).**
   - For deployment drill evidence files (matching `deployment-drill-evidence-` or containing `caddy_routing_verified` / `schema_backward_compatible`):
     - If `parsed.status && parsed.status !== 'success'`:
       add blocker: `Approved evidence file '${ref}' reports deployment drill failure (status: "${parsed.status}")`.
     - If `parsed.schema_backward_compatible === false`:
       add blocker: `Approved evidence file '${ref}' reports schema backward compatibility failure (schema_backward_compatible: false)`.
     - If `parsed.rollback_procedure_verified === false`:
       add blocker: `Approved evidence file '${ref}' reports rollback procedure verification failure (rollback_procedure_verified: false)`.
     - If `parsed.caddy_routing_verified === false`:
       add blocker: `Approved evidence file '${ref}' reports Caddy routing verification failure (caddy_routing_verified: false)`.
     - If `parsed.network_isolation_verified === false`:
       add blocker: `Approved evidence file '${ref}' reports network isolation verification failure (network_isolation_verified: false)`.
   - For secret rotation drill evidence files (matching `secret-rotation-evidence-` or containing `drill_type === 'zero_downtime_secret_rotation_and_compromise_response'`):
     - If `parsed.status && parsed.status !== 'success'`:
       add blocker: `Approved evidence file '${ref}' reports secret rotation drill failure (status: "${parsed.status}")`.
     - If `Array.isArray(parsed.errors) && parsed.errors.length > 0`:
       add blocker: `Approved evidence file '${ref}' reports secret rotation drill error(s): ${parsed.errors.join('; ')}`.
     - If `parsed.steps && typeof parsed.steps === 'object'`:
       - For each required step `['session_rollover', 'csrf_rollover', 'database_rotation', 'valkey_rotation', 'storage_rotation', 'compromise_response', 'redaction_audit']`:
         - If `parsed.steps[step]?.status && parsed.steps[step].status !== 'passed'`:
           add blocker: `Approved evidence file '${ref}' reports secret rotation step '${step}' failure (status: "${parsed.steps[step].status}")`.
       - If `parsed.steps.redaction_audit && (parsed.steps.redaction_audit.raw_secrets_masked === false || parsed.steps.redaction_audit.zero_dev_passwords_detected === false)`:
         add blocker: `Approved evidence file '${ref}' reports secret redaction or leak audit failure`.
   - For Unified Launch Evidence Dossier files:
     - Deployment baseline & compliance checks:
       - If `parsed.deploymentBaseline?.status === 'breached' || parsed.deploymentBaseline?.status === 'failed'`:
         add blocker: `Approved evidence file '${ref}' reports deployment baseline breach (deploymentBaseline.status: "${parsed.deploymentBaseline.status}")`.
       - If `parsed.summary?.deploymentCompliance === 'failed' || parsed.summary?.deploymentCompliance === 'failure'`:
         add blocker: `Approved evidence file '${ref}' reports deployment compliance failure (summary.deploymentCompliance: "${parsed.summary.deploymentCompliance}")`.
       - If `parsed.summary?.rollbackCompliance === 'failed' || parsed.summary?.rollbackCompliance === 'failure'`:
         add blocker: `Approved evidence file '${ref}' reports rollback compliance failure (summary.rollbackCompliance: "${parsed.summary.rollbackCompliance}")`.
     - Secret rotation baseline & compliance checks:
       - If `parsed.secretRotationBaseline?.status === 'breached' || parsed.secretRotationBaseline?.status === 'failed'`:
         add blocker: `Approved evidence file '${ref}' reports secret rotation baseline breach (secretRotationBaseline.status: "${parsed.secretRotationBaseline.status}")`.
       - If `parsed.summary?.secretRotationCompliance === 'failed' || parsed.summary?.secretRotationCompliance === 'failure'`:
         add blocker: `Approved evidence file '${ref}' reports secret rotation compliance failure (summary.secretRotationCompliance: "${parsed.summary.secretRotationCompliance}")`.

3. **Update `scripts/ops/check-production-templates.sh`.**
   - Add assertion verifying that `scripts/ops/run-launch-drills.sh` includes `deploymentBaseline`, `secretRotationBaseline`, `deploymentCompliance`, `rollbackCompliance`, and `secretRotationCompliance`.

4. **Expand unit tests in `scripts/ops/run-launch-drills.spec.js`.**
   - In `assertDossierSchema(dossier)`:
     - Assert `typeof dossier.deploymentBaseline === 'object'` and `['verified', 'breached'].includes(dossier.deploymentBaseline.status)`.
     - Assert `typeof dossier.secretRotationBaseline === 'object'` and `['verified', 'breached'].includes(dossier.secretRotationBaseline.status)`.
     - Assert `typeof dossier.summary.deploymentCompliance === 'string'` and `['passed', 'failed'].includes(dossier.summary.deploymentCompliance)`.
     - Assert `typeof dossier.summary.rollbackCompliance === 'string'` and `['passed', 'failed'].includes(dossier.summary.rollbackCompliance)`.
     - Assert `typeof dossier.summary.secretRotationCompliance === 'string'` and `['passed', 'failed'].includes(dossier.summary.secretRotationCompliance)`.

5. **Expand unit tests in `scripts/ops/check-launch-readiness.spec.js`.**
   - Add unit test: `validateReadiness blocks approval when deployment drill evidence reports failure, non-backward-compatible schema, or rollback verification failure`.
   - Add unit test: `validateReadiness blocks approval when secret rotation evidence reports failure, errors, step failure, or secret leakage`.
   - Add unit test: `validateReadiness blocks approval when evidence dossier reports deployment or secret rotation baseline breach or compliance failure`.
   - Add unit test: `validateReadiness accepts valid passed deployment & secret rotation evidence and compliant dossier`.

6. **Documentation updates.**
   - Update `docs/launch-checklist.md` §3.3, §3.10, §4.
   - Update `docs/operations.md` recording Prompt 184.
   - Update `docs/build-plan.md` recording Prompt 184.
   - Operator launch sign-off remains open.

## Verification commands and pass criteria

1. Run template checks:
   `bash scripts/ops/check-production-templates.sh` -> exit 0.
2. Run unit tests for launch drills:
   `node --test scripts/ops/run-launch-drills.spec.js` -> exit 0, all tests pass.
3. Run unit tests for launch readiness:
   `node --test scripts/ops/check-launch-readiness.spec.js` -> exit 0, all tests pass.
4. Run full operational check suite:
   `npm run ops:check` -> exit 0.
5. Dry-run launch readiness:
   `bash scripts/ops/launch-readiness.sh infra/launch/readiness.example.json` -> fails closed on unresolved template placeholders (exit 1).

## What not to do

- Do NOT weaken any fail-closed launch readiness gates.
- Do NOT alter live database credentials or mutate production environments during dry-run.
- Do NOT log or leak secret values in error messages or blockers.
- Do NOT sign off on operator launch categories (operator launch sign-off remains open).

## Open questions / decisions made

- `deploymentBaseline` and `secretRotationBaseline` follow the identical pattern established by `databaseTelemetryBaseline` and `disasterRecoveryBaseline`, completing machine-readable baseline coverage across all stateful and operational drill stages.
- Child evidence cross-validation in `checkEvidenceFile` operates cwd-first and relative to the readiness document directory, preserving existing resolution mechanics.

## SKILLS USED

- `deployment-pipeline-design`: Review deployment promotion, Caddy routing, and rollback verification contracts
- `secrets-management`: Review zero-downtime secret rotation, rollover, and redaction invariants
- `security-best-practices`: Fail-closed gate enforcement and prevention of credential leakage
- `javascript-testing-patterns`: Node.js test runner structure, assertion design, and edge case coverage
- `requesting-code-review`: Review dispatch workflow and code reviewer subagent context preparation
- `receiving-code-review`: Technical rigor and validation when evaluating review feedback
- `caveman-commit`: Structured conventional commit generation upon completion

