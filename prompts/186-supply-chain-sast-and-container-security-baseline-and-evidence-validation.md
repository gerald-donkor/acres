# 186 — supply chain, SAST, and container security baseline and evidence validation

## Scope and why this is next

The committed baseline is `8072a88` on `main`; the worktree is clean when this prompt was prepared. This is a bounded Phase 12 operational orchestrator, supply chain security, SAST scanning, container security baseline, and launch readiness cross-validation step under `docs/build-plan.md` §13, §20, §22, `docs/launch-checklist.md` §2, §4, §7, and `docs/operations.md`.

Prompts 174–185 established database pool & server telemetry, added 4 Prometheus alert rules (expanding the operational alert suite to 11 rules), added visual panels in Grafana (100% alert coverage), reconciled all 11 incident runbooks in `docs/launch-checklist.md` §5, enforced Category 5 & 6 SLO floors/ceilings, bubbled up database baseline telemetry (from stage 6), disaster recovery baseline telemetry (from stage 7), deployment baseline telemetry (from stage 3), secret rotation baseline telemetry (from stage 5), and volume encryption baseline telemetry (from stage 4) into the Unified Launch Evidence Dossier, and hardened `checkEvidenceFile` to cross-validate capacity, database, restore, storage reconciliation, deployment, secret rotation, and volume encryption child evidence.

However, operational gaps remain in stage 2 (`supply_chain_sast`) baseline aggregation and child evidence cross-validation:
1. In `scripts/ops/generate-sbom.js`, when `--output <file>` is combined with `--verify-licenses`, the license compliance verification result (`licenseCompliance: { compliant, violations, totalComponents }`) is not persisted in the written artifact or attached to `bom`, making it impossible for automated consumers of the SBOM file to confirm license compliance without re-evaluating components.
2. In `scripts/ops/run-sast-scan.js`, the script outputs console text or prints JSON to stdout with `--json`, but lacks an `--output <file>` / `-o <file>` option to write structured JSON drill evidence directly to disk (`sast-scan-evidence-<timestamp>.json`).
3. In `scripts/ops/verify-container-security.js`, the script outputs console text or prints JSON to stdout with `--json`, but lacks an `--output <file>` / `-o <file>` option to write structured JSON drill evidence directly to disk (`container-security-evidence-<timestamp>.json`).
4. In `scripts/ops/run-launch-drills.sh`, stage 2 (`supply_chain_sast`) executes `node scripts/ops/generate-sbom.js --verify-licenses`, `node scripts/ops/run-sast-scan.js`, and `node scripts/ops/verify-container-security.js` without `--output`, omitting child evidence files (`sbom-inventory-<timestamp>.json`, `sast-scan-evidence-<timestamp>.json`, `container-security-evidence-<timestamp>.json`) from `$EVIDENCE_DIR`.
5. In `scripts/ops/run-launch-drills.sh`, the orchestrator emits the Unified Launch Evidence Dossier (`dossier`) with a simple summary flag `supplyChainSecurity: "passed" | "failed"`, completely omitting a structured top-level `supplyChainBaseline` (covering `sbom.packagesCount`, `sbom.licenseComplianceVerified`, `sbom.violationsCount`, `sast.filesScanned`, `sast.totalRuleMatches`, `sast.triagedFindingsCount`, `sast.expiredFindingsCount`, `sast.blockingActiveFindingsCount`, `sast.passed`, `containerSecurity.valid`, `containerSecurity.totalChecks`, `containerSecurity.passedChecks`, `containerSecurity.errorsCount`) and omitting `summary.supplyChainCompliance`, `summary.sastCompliance`, and `summary.containerSecurityCompliance`.
6. In `scripts/ops/check-launch-readiness.js`, `checkEvidenceFile` does not cross-validate supply chain / SAST / container security child evidence:
   - If an approved section references `sast-scan-evidence-*.json`, `checkEvidenceFile` does not check whether `parsed.status === 'success'`, whether `parsed.passed === true`, whether `parsed.blockingActiveFindings` is empty, or whether `parsed.expiredFindings` is empty. An evidence file reporting active unreviewed vulnerabilities or expired suppressions slips through without blocking launch approval.
   - If an approved section references `sbom-inventory-*.json`, `checkEvidenceFile` does not check whether `parsed.licenseCompliance?.compliant === true`, whether `parsed.licenseViolations` is empty, or whether `parsed.licenseCompliance?.violations` is empty.
   - If an approved section references `container-security-evidence-*.json`, `checkEvidenceFile` does not check whether `parsed.status === 'success'`, whether `parsed.valid === true`, whether `parsed.errors` is empty, or whether all container security checks passed (`parsed.checks.every(c => c.passed === true)`).
7. In `scripts/ops/check-launch-readiness.js`, `checkEvidenceFile` does not inspect Unified Launch Evidence Dossiers for supply chain baseline breaches or compliance failure (`parsed.supplyChainBaseline?.status === 'breached'`, `parsed.summary?.supplyChainCompliance === 'failed'`, `parsed.summary?.sastCompliance === 'failed'`, or `parsed.summary?.containerSecurityCompliance === 'failed'`).
8. In `scripts/ops/check-production-templates.sh`, the validator does not assert that `run-launch-drills.sh` emits `supplyChainBaseline`, `supplyChainCompliance`, `sastCompliance`, and `containerSecurityCompliance`.
9. In `scripts/ops/run-launch-drills.spec.js`, `assertDossierSchema(dossier)` does not validate `supplyChainBaseline`, `summary.supplyChainCompliance`, `summary.sastCompliance`, or `summary.containerSecurityCompliance`.
10. In `scripts/ops/check-launch-readiness.spec.js`, there is no test coverage for SAST, SBOM, or container security child evidence failure blocking (unreviewed blockers, expired suppressions, license violations, failed container checks) or dossier supply chain baseline breach blocking.
11. In `scripts/ops/generate-sbom.spec.js`, `scripts/ops/run-sast-scan.spec.js`, and `scripts/ops/verify-container-security.spec.js`, there is no test coverage for the `--output <file>` option.

Add `--output <file>` support to `scripts/ops/run-sast-scan.js` and `scripts/ops/verify-container-security.js`. Attach `licenseCompliance` to `bom` in `scripts/ops/generate-sbom.js` when `--verify-licenses` and `--output` are used. Emit child evidence `sbom-inventory-${STAMP}.json`, `sast-scan-evidence-${STAMP}.json`, and `container-security-evidence-${STAMP}.json` in Stage 2 of `scripts/ops/run-launch-drills.sh`. Bubble up `supplyChainBaseline`, `summary.supplyChainCompliance`, `summary.sastCompliance`, and `summary.containerSecurityCompliance` into the Unified Launch Evidence Dossier. Cross-validate SAST, SBOM, container security child evidence, and dossier supply chain baseline in `checkEvidenceFile` (`scripts/ops/check-launch-readiness.js`). Expand unit test suites across all five specs (`generate-sbom.spec.js`, `run-sast-scan.spec.js`, `verify-container-security.spec.js`, `run-launch-drills.spec.js`, and `check-launch-readiness.spec.js`). Assert dossier baseline emission in `scripts/ops/check-production-templates.sh`. Update `docs/operations.md`, `docs/launch-checklist.md`, and `docs/build-plan.md`. Operator launch sign-off remains open.

## References and verified baseline

- Re-read `AGENTS.md` §§2, 4–7, 10, `docs/build-plan.md` §§13, 20, 22, `docs/operations.md` (prompts 174–185 records, Phase 12K section), `docs/launch-checklist.md` §§2, 4, 7, and `docs/skills.md`.
- Inspect `scripts/ops/generate-sbom.js`, `scripts/ops/generate-sbom.spec.js`, `scripts/ops/run-sast-scan.js`, `scripts/ops/run-sast-scan.spec.js`, `scripts/ops/verify-container-security.js`, `scripts/ops/verify-container-security.spec.js`, `scripts/ops/run-launch-drills.sh`, `scripts/ops/run-launch-drills.spec.js`, `scripts/ops/check-launch-readiness.js`, `scripts/ops/check-launch-readiness.spec.js`, and `scripts/ops/check-production-templates.sh`.
- Child evidence structures emitted by stage 2 runners:
  - `sbom-inventory-<timestamp>.json`:
    - `bomFormat`: `"CycloneDX"`
    - `specVersion`: `"1.5"`
    - `components`: array of production package components
    - `licenseCompliance`:
      - `compliant`: boolean (`true` required)
      - `violations`: array (must be empty)
      - `totalComponents`: number
  - `sast-scan-evidence-<timestamp>.json`:
    - `drill_type`: `"sast_security_scan"`
    - `timestamp`: string
    - `status`: `"success"` | `"failed"` (`"success"` required)
    - `passed`: boolean (`true` required)
    - `scannedFilesCount`: number (> 0)
    - `totalFindingsCount`: number
    - `triagedFindings`: array
    - `expiredFindings`: array (must be empty)
    - `activeFindings`: array
    - `blockingActiveFindings`: array (must be empty)
    - `failOnSeverity`: `"BLOCKER"`
  - `container-security-evidence-<timestamp>.json`:
    - `drill_type`: `"container_security_verification"`
    - `timestamp`: string
    - `status`: `"success"` | `"failed"` (`"success"` required)
    - `valid`: boolean (`true` required)
    - `errors`: array (must be empty)
    - `checks`: array of check objects with `passed: true`
    - `totalChecks`: number
    - `passedChecks`: number
    - `failedChecks`: number (0 required)

## Implementation contract

1. **Enhance `scripts/ops/generate-sbom.js` to persist license compliance on output artifact.**
   - In `CLI runner`:
     ```javascript
     const { bom, components, devExcludedCount, licenseCounts } = generateSbom();
     let compliance = null;
     if (verifyLicenses) {
       compliance = validateLicenseCompliance(components);
       bom.licenseCompliance = compliance;
     }
     if (outputPath) {
       fs.mkdirSync(path.dirname(path.resolve(process.cwd(), outputPath)), { recursive: true });
       fs.writeFileSync(outputPath, JSON.stringify(bom, null, 2) + '\n', 'utf8');
     }
     if (verifyLicenses && !compliance.compliant) {
       console.error('SBOM License Compliance Check FAILED:');
       // ...
       process.exit(1);
     }
     ```
   - Preserves all existing stdout formatting and CycloneDX specification metadata while providing structured compliance auditability when `--verify-licenses` and `--output` are used together.

2. **Add `--output <file>` / `-o <file>` support to `scripts/ops/run-sast-scan.js`.**
   - In CLI runner:
     - Parse `--output <file>` and `-o <file>` from `args`:
       ```javascript
       const outIdx = args.indexOf('--output') !== -1 ? args.indexOf('--output') : args.indexOf('-o');
       const outputPath = outIdx !== -1 && args[outIdx + 1] ? path.resolve(process.cwd(), args[outIdx + 1]) : null;
       ```
     - Construct structured payload:
       ```javascript
       const payload = {
         drill_type: 'sast_security_scan',
         timestamp: new Date().toISOString(),
         status: result.passed ? 'success' : 'failed',
         passed: result.passed,
         scannedFilesCount: result.scannedFilesCount,
         totalFindingsCount: result.totalFindingsCount,
         triagedFindings: result.triagedFindings,
         expiredFindings: result.expiredFindings,
         activeFindings: result.activeFindings,
         blockingActiveFindings: result.blockingActiveFindings,
         failOnSeverity: result.failOnSeverity,
       };
       ```
     - When `outputPath` is provided, ensure target directory exists (`fs.mkdirSync(path.dirname(outputPath), { recursive: true })`) and write JSON formatted with 2-space indentation.
     - If `--json` / `--format json` is set, print JSON to stdout and exit `result.passed ? 0 : 1`.
     - Otherwise print human-readable summary and exit `result.passed ? 0 : 1`.

3. **Add `--output <file>` / `-o <file>` support to `scripts/ops/verify-container-security.js`.**
   - In CLI runner:
     - Parse `--output <file>` and `-o <file>` from `args`:
       ```javascript
       const outIdx = args.indexOf('--output') !== -1 ? args.indexOf('--output') : args.indexOf('-o');
       const outputPath = outIdx !== -1 && args[outIdx + 1] ? path.resolve(process.cwd(), args[outIdx + 1]) : null;
       ```
     - Construct structured payload:
       ```javascript
       const payload = {
         drill_type: 'container_security_verification',
         timestamp: new Date().toISOString(),
         status: result.valid ? 'success' : 'failed',
         valid: result.valid,
         errors: result.errors,
         checks: result.checks,
         totalChecks: result.checks.length,
         passedChecks: result.checks.filter((c) => c.passed).length,
         failedChecks: result.checks.filter((c) => !c.passed).length,
       };
       ```
     - When `outputPath` is provided, ensure target directory exists (`fs.mkdirSync(path.dirname(outputPath), { recursive: true })`) and write JSON formatted with 2-space indentation.
     - If `--json` is set, print JSON to stdout and exit `result.valid ? 0 : 1`.
     - Otherwise print human-readable summary and exit `result.valid ? 0 : 1`.

4. **Emit child evidence and bubble up `supplyChainBaseline` in `scripts/ops/run-launch-drills.sh`.**
   - In Stage 2 execution:
     Update:
     ```bash
     # Stage 2: supply-chain SBOM & SAST security scanning
     run_stage "supply_chain_sast" "SBOM, SAST, container security" \
       "node scripts/ops/generate-sbom.js --verify-licenses --output \"${EVIDENCE_DIR}/sbom-inventory-${STAMP}.json\" && node scripts/ops/run-sast-scan.js --output \"${EVIDENCE_DIR}/sast-scan-evidence-${STAMP}.json\" && node scripts/ops/verify-container-security.js --output \"${EVIDENCE_DIR}/container-security-evidence-${STAMP}.json\""
     ```
   - In the Node.js dossier aggregation script inside `run-launch-drills.sh`:
     - Discover stage 2 child evidence files:
       - Find artifact in `stages.find(s => s.stage_id === "supply_chain_sast")` matching `sbom-inventory-*.json`.
       - Find artifact in `stages.find(s => s.stage_id === "supply_chain_sast")` matching `sast-scan-evidence-*.json`.
       - Find artifact in `stages.find(s => s.stage_id === "supply_chain_sast")` matching `container-security-evidence-*.json`.
     - Parse evidence files if they exist.
     - Validate `scPassed`:
       `scStage?.status === "PASSED" &&
        sbomEvidence && Array.isArray(sbomEvidence.components) && sbomEvidence.components.length > 0 &&
        (!sbomEvidence.licenseCompliance || (sbomEvidence.licenseCompliance.compliant === true && Array.isArray(sbomEvidence.licenseCompliance.violations) && sbomEvidence.licenseCompliance.violations.length === 0)) &&
        sastEvidence && (sastEvidence.status === "success" || sastEvidence.passed === true) && sastEvidence.passed === true &&
        Array.isArray(sastEvidence.blockingActiveFindings) && sastEvidence.blockingActiveFindings.length === 0 &&
        Array.isArray(sastEvidence.expiredFindings) && sastEvidence.expiredFindings.length === 0 &&
        containerEvidence && (containerEvidence.status === "success" || containerEvidence.valid === true) && containerEvidence.valid === true &&
        Array.isArray(containerEvidence.errors) && containerEvidence.errors.length === 0 &&
        Array.isArray(containerEvidence.checks) && containerEvidence.checks.length > 0 &&
        containerEvidence.checks.every((c) => c.passed === true)`
     - If `scPassed` is true, populate:
       ```javascript
       supplyChainBaseline = {
         status: "verified",
         sbom: {
           packagesCount: sbomEvidence.components.length,
           licenseComplianceVerified: sbomEvidence.licenseCompliance ? sbomEvidence.licenseCompliance.compliant : true,
           violationsCount: sbomEvidence.licenseCompliance?.violations?.length || 0,
         },
         sast: {
           filesScanned: sastEvidence.scannedFilesCount,
           totalFindingsCount: sastEvidence.totalFindingsCount,
           triagedFindingsCount: Array.isArray(sastEvidence.triagedFindings) ? sastEvidence.triagedFindings.length : 0,
           expiredFindingsCount: Array.isArray(sastEvidence.expiredFindings) ? sastEvidence.expiredFindings.length : 0,
           blockingActiveFindingsCount: Array.isArray(sastEvidence.blockingActiveFindings) ? sastEvidence.blockingActiveFindings.length : 0,
           passed: sastEvidence.passed,
         },
         containerSecurity: {
           valid: containerEvidence.valid,
           totalChecks: Array.isArray(containerEvidence.checks) ? containerEvidence.checks.length : 0,
           passedChecks: Array.isArray(containerEvidence.checks) ? containerEvidence.checks.filter((c) => c.passed).length : 0,
           errorsCount: Array.isArray(containerEvidence.errors) ? containerEvidence.errors.length : 0,
         },
       };
       ```
       and `summary.supplyChainCompliance = "passed"`, `summary.sastCompliance = "passed"`, `summary.containerSecurityCompliance = "passed"`.
     - Otherwise, populate:
       ```javascript
       supplyChainBaseline = {
         status: "breached",
         error_message: scStage?.error_message || "stage 2 failed or child supply chain / SAST / container evidence failed verification",
       };
       ```
       and `summary.supplyChainCompliance = "failed"`, `summary.sastCompliance = "failed"`, `summary.containerSecurityCompliance = "failed"`.
   - In `dossier` object:
     Add top-level field:
     `supplyChainBaseline,`
     And in `dossier.summary`:
     `supplyChainCompliance,`
     `sastCompliance,`
     `containerSecurityCompliance,`
     preserving `supplyChainSecurity: statuses[1] === "PASSED" ? "passed" : "failed"` for backward compatibility.

5. **Cross-validate supply chain, SAST, and container security child evidence in `checkEvidenceFile` (`scripts/ops/check-launch-readiness.js`).**
   - For SAST drill child evidence files (matching `sast-scan-evidence-` or `sast-evidence-` or containing `drill_type === 'sast_security_scan'` or having `blockingActiveFindings`):
     - If `typeof parsed.status === 'string' && parsed.status.toLowerCase() !== 'success'`:
       add blocker: `Approved evidence file '${ref}' reports SAST scan verification failure (status: "${parsed.status}")`.
     - If `parsed.passed === false`:
       add blocker: `Approved evidence file '${ref}' reports SAST scan failure (passed: false)`.
     - If `Array.isArray(parsed.blockingActiveFindings) && parsed.blockingActiveFindings.length > 0`:
       add blocker: `Approved evidence file '${ref}' reports ${parsed.blockingActiveFindings.length} active unreviewed SAST blocker finding(s)`.
     - If `Array.isArray(parsed.expiredFindings) && parsed.expiredFindings.length > 0`:
       add blocker: `Approved evidence file '${ref}' reports ${parsed.expiredFindings.length} expired SAST suppression(s) (fail-closed)`.
   - For SBOM drill child evidence files (matching `sbom-inventory-` or `sbom-evidence-` or containing `bomFormat === 'CycloneDX'` or having `licenseCompliance`):
     - If `parsed.licenseCompliance && typeof parsed.licenseCompliance === 'object'`:
       - If `parsed.licenseCompliance.compliant === false`:
         add blocker: `Approved evidence file '${ref}' reports SBOM license compliance failure (licenseCompliance.compliant: false)`.
       - If `Array.isArray(parsed.licenseCompliance.violations) && parsed.licenseCompliance.violations.length > 0`:
         add blocker: `Approved evidence file '${ref}' reports ${parsed.licenseCompliance.violations.length} SBOM license compliance violation(s): ${parsed.licenseCompliance.violations.map((v) => v.component + ' (' + v.license + ')').join(', ')}`.
     - If `Array.isArray(parsed.licenseViolations) && parsed.licenseViolations.length > 0`:
       add blocker: `Approved evidence file '${ref}' reports ${parsed.licenseViolations.length} SBOM license violation(s)`.
   - For Container Security drill child evidence files (matching `container-security-evidence-` or containing `drill_type === 'container_security_verification'` or having `checks` and `valid`):
     - If `typeof parsed.status === 'string' && parsed.status.toLowerCase() !== 'success'`:
       add blocker: `Approved evidence file '${ref}' reports container security verification failure (status: "${parsed.status}")`.
     - If `parsed.valid === false`:
       add blocker: `Approved evidence file '${ref}' reports invalid container security configuration (valid: false)`.
     - If `Array.isArray(parsed.errors) && parsed.errors.length > 0`:
       add blocker: `Approved evidence file '${ref}' reports container security error(s): ${parsed.errors.join('; ')}`.
     - If `Array.isArray(parsed.checks)`:
       const failedChecks = parsed.checks.filter((c) => c && c.passed === false);
       if (failedChecks.length > 0) {
         add blocker: `Approved evidence file '${ref}' reports ${failedChecks.length} failed container security check(s): ${failedChecks.map((c) => '[' + c.target + '] ' + c.check).join(', ')}`.
       }
   - For Unified Launch Evidence Dossier files:
     - Supply chain baseline & compliance checks:
       - If `parsed.supplyChainBaseline?.status === 'breached' || parsed.supplyChainBaseline?.status === 'failed'`:
         add blocker: `Approved evidence file '${ref}' reports supply chain security baseline breach (supplyChainBaseline.status: "${parsed.supplyChainBaseline.status}")`.
       - If `parsed.summary?.supplyChainCompliance === 'failed' || parsed.summary?.supplyChainCompliance === 'failure'`:
         add blocker: `Approved evidence file '${ref}' reports supply chain security compliance failure (summary.supplyChainCompliance: "${parsed.summary.supplyChainCompliance}")`.
       - If `parsed.summary?.sastCompliance === 'failed' || parsed.summary?.sastCompliance === 'failure'`:
         add blocker: `Approved evidence file '${ref}' reports SAST scan compliance failure (summary.sastCompliance: "${parsed.summary.sastCompliance}")`.
       - If `parsed.summary?.containerSecurityCompliance === 'failed' || parsed.summary?.containerSecurityCompliance === 'failure'`:
         add blocker: `Approved evidence file '${ref}' reports container security compliance failure (summary.containerSecurityCompliance: "${parsed.summary.containerSecurityCompliance}")`.

6. **Update `scripts/ops/check-production-templates.sh`.**
   - Add assertions verifying that `scripts/ops/run-launch-drills.sh` includes `supplyChainBaseline`, `supplyChainCompliance`, `sastCompliance`, and `containerSecurityCompliance`.

7. **Expand unit tests in `scripts/ops/generate-sbom.spec.js`.**
   - Add test verifying that CLI invocation with `--verify-licenses` and `--output <path>` writes `licenseCompliance: { compliant: true, violations: [] }` into the generated SBOM file.

8. **Expand unit tests in `scripts/ops/run-sast-scan.spec.js`.**
   - Add test verifying that CLI invocation with `--output <path>` and `-o <path>` creates a structured JSON evidence file matching expected schema (`drill_type: 'sast_security_scan'`, `status: "success"`, `passed: true`, `blockingActiveFindings: []`, `expiredFindings: []`).

9. **Expand unit tests in `scripts/ops/verify-container-security.spec.js`.**
   - Add test verifying that CLI invocation with `--output <path>` and `-o <path>` creates a structured JSON evidence file matching expected schema (`drill_type: 'container_security_verification'`, `status: "success"`, `valid: true`, `errors: []`, `checks` array with all `passed: true`).

10. **Expand unit tests in `scripts/ops/run-launch-drills.spec.js`.**
    - In `assertDossierSchema(dossier)`:
      - Validate `typeof dossier.supplyChainBaseline === 'object'`.
      - Validate `['verified', 'breached'].includes(dossier.supplyChainBaseline.status)`.
      - Validate `typeof dossier.summary.supplyChainCompliance === 'string'`.
      - Validate `['passed', 'failed'].includes(dossier.summary.supplyChainCompliance)`.
      - Validate `typeof dossier.summary.sastCompliance === 'string'`.
      - Validate `['passed', 'failed'].includes(dossier.summary.sastCompliance)`.
      - Validate `typeof dossier.summary.containerSecurityCompliance === 'string'`.
      - Validate `['passed', 'failed'].includes(dossier.summary.containerSecurityCompliance)`.

11. **Expand unit tests in `scripts/ops/check-launch-readiness.spec.js`.**
    - Add test verifying `validateReadiness` blocks approval when SAST drill evidence reports failure, unreviewed blockers, or expired suppressions.
    - Add test verifying `validateReadiness` blocks approval when SBOM drill evidence reports license compliance failure or unapproved copyleft licenses.
    - Add test verifying `validateReadiness` blocks approval when container security drill evidence reports failure, errors, or failed security checks.
    - Add test verifying `validateReadiness` blocks approval when evidence dossier reports `supplyChainBaseline` breach or compliance failures (`summary.supplyChainCompliance`, `summary.sastCompliance`, `summary.containerSecurityCompliance`).
    - Add test verifying `validateReadiness` accepts valid passed SAST, SBOM, container security child evidence, and compliant dossier.

12. **Update documentation.**
    - In `docs/operations.md`: record Prompt 186 changes under Artifacts (child evidence emission for Stage 2, `supplyChainBaseline`, `supplyChainCompliance`, `sastCompliance`, `containerSecurityCompliance`, cross-validation rules, test counts).
    - In `docs/launch-checklist.md`: update Stage 2 / §4 and §2 verification descriptions.
    - In `docs/build-plan.md`: record Prompt 186 execution in §21/§22 verification notes.

## Non-goals

- Modifying existing SAST security rules or triage policies in `infra/security/sast-triage.json`.
- Modifying Dockerfile or Compose configurations.
- Granting launch sign-off; operator sign-off remains open.

## Checks to run

```bash
node --test scripts/ops/generate-sbom.spec.js
node --test scripts/ops/run-sast-scan.spec.js
node --test scripts/ops/verify-container-security.spec.js
node --test scripts/ops/run-launch-drills.spec.js
node --test scripts/ops/check-launch-readiness.spec.js
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Results are recorded in `docs/operations.md` and `docs/build-plan.md`.

## SKILLS USED

- `sast-configuration`: SAST scanning, rule validation, triage policy evaluation, and fail-closed security gating
- `security-best-practices`: secure container patterns, layer hygiene, license compliance, and non-root execution verification
- `security-threat-model`: fail-closed threat boundary defenses for supply chain and static code analysis
- `deployment-pipeline-design`: launch drill orchestrator stage integration and evidence dossier schema design
- `javascript-testing-patterns`: Node test runner assertions, mock temporary directories, and subprocess execution
- `requesting-code-review`: dispatching reviewer subagent with structured context and diff analysis (§2, §2.1)
- `receiving-code-review`: evaluating feedback with technical rigor before making changes (§2, §2.1)
- `caveman-commit`: writing conventional commit message for local commit to main (§3, §7)
