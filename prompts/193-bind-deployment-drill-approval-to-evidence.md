# 193 — bind deployment drill approval to evidence

## Scope and why this is next

The committed baseline is `22ca2a7` on `main`, with a clean worktree at planning time. Phase 12's launch gate remains open pending operator evidence and approval. Prompts 188–190 hardened Category 6 (`backup_and_disaster_recovery`) by validating the scheduled backup cadence against the RPO and binding launch approval to concrete restore and reconciliation child reports. Prompt 191 hardened Category 8 (`volume_encryption`) by binding launch approval to concrete volume encryption child reports. Prompt 192 hardened Category 3 (`secrets_management`) by binding launch approval to concrete secret rotation child reports and enforcing the 90-day cadence ceiling.

The next dependency-safe launch readiness gap is Category 10 (`deployment_and_rollback`). An approved `deployment_and_rollback` record requires `target_host_profile`, `image_registry_path`, `deployment_approver`, `rollback_authority`, `image_provenance_policy`, `live_readiness_drill_completed: true`, and an immutable image release record (`release.reviewed_source_commit`, current/previous image digests, and provenance/drill evidence). However, `scripts/ops/check-launch-readiness.js` currently allows an approved `deployment_and_rollback` section to pass with narrative-only `evidence` (such as `"Staging deployment and rollback drill executed successfully"`) and an external URI in `release.live_drill_evidence` (such as `"artifact:live-drill-1"`) without referencing an actual child report. While `checkEvidenceFile` inspects deployment drill evidence if an operator happens to pass a JSON file, it does not require a report or verify the complete schema and invariants of the deployment drill report (such as timestamp validity, `caddy_routing_verified`, `caddy_routes_tested >= 12`, `security_headers_verified`, `s3_sigv4_host_preserved`, `migrations_verified`, `migration_count >= 0`, `operational_templates_verified`, `secrets_scan_verified`, `readiness_probes_verified`, `network_isolation_verified`, `rollback_procedure_verified`, and `graceful_drain_periods_verified`).

Bind Category 10 launch approval to a concrete, successful deployment drill child report emitted by `scripts/ops/run-deployment-drill.sh` (`deployment-drill-evidence-<timestamp>.json`), referenced either in `evidence` or `release.live_drill_evidence`. This continues the fail-closed tightening of Phase 12K's 11-category launch readiness matrix without modifying production services or replacing the operator's responsibility to manage target deployments, image registries, and live rollback procedures.

## References and verified baseline

- Re-read `AGENTS.md` §§2–7 and 10, `docs/build-plan.md` §§13, 19, 21, 22, `docs/operations.md` (Phase 12K, Prompts 184 and 192 records), `docs/launch-checklist.md` Category 10 (§3.10) and §4, `docs/security.md` TM-16, and `docs/skills.md` before execution.
- Inspect `scripts/ops/check-launch-readiness.js` evidence resolution and Category 10 validation; `scripts/ops/check-launch-readiness.spec.js` approved fixture; `scripts/ops/run-deployment-drill.sh` producer and its evidence output; `scripts/ops/run-launch-drills.sh` stage 3 and dossier derivation; `infra/launch/readiness.example.json`; `scripts/ops/check-production-templates.sh`; and root `package.json` before edits.
- The producer `run-deployment-drill.sh` emits a JSON payload with:
  - `drill_timestamp`: basic or ISO UTC timestamp string (e.g. `'20260925T192220Z'`)
  - `duration_ms`: finite non-negative number
  - `duration_seconds`: finite non-negative number
  - `caddyfile`: string path (e.g. `'infra/caddy/Caddyfile.example'`)
  - `compose_file`: string path (e.g. `'infra/compose/docker-compose.production.example.yml'`)
  - `dry_run`: boolean
  - `caddy_routing_verified`: boolean (`true` required)
  - `caddy_routes_tested`: integer (`caddy_routes_tested >= 12` required)
  - `security_headers_verified`: boolean (`true` required)
  - `s3_sigv4_host_preserved`: boolean (`true` required)
  - `migrations_verified`: boolean (`true` required)
  - `migration_count`: integer (`migration_count >= 0` required)
  - `schema_backward_compatible`: boolean (`true` required)
  - `operational_templates_verified`: boolean (`true` required)
  - `secrets_scan_verified`: boolean (`true` required)
  - `readiness_probes_verified`: boolean (`true` required)
  - `probe_live_tested`: boolean
  - `graceful_drain_periods_verified`: object with:
    - `caddy`: `'30s'`
    - `next`: `'30s'`
    - `api`: `'45s'`
    - `worker`: `'60s'`
  - `network_isolation_verified`: boolean (`true` required)
  - `rollback_procedure_verified`: boolean (`true` required)
  - `status`: `'success'` | `'failed'` (`'success'` required)
- Stage 3 of `run-launch-drills.sh` runs `run-deployment-drill.sh` and writes `deployment-drill-evidence-<timestamp>.json` into `$EVIDENCE_DIR`. The verified script also supports custom paths via `--evidence-file <file>`. The checked-in example `infra/launch/readiness.example.json` is unresolved and must remain so.
- No static design comp applies. The measurable contract is the producer's actual status, timestamp, route count, migration count, drain periods, and verification flags compared against validation time.

## Implementation contract

1. In `scripts/ops/check-launch-readiness.js`:
   - Define `DEPLOYMENT_DRAIN_PERIODS` constant:
     ```javascript
     const DEPLOYMENT_DRAIN_PERIODS = {
       caddy: '30s',
       next: '30s',
       api: '45s',
       worker: '60s',
     };
     ```
   - Add `isDeploymentDrillCandidate({ file, parsed })` helper recognizing candidates by filename pattern (`deployment-drill-evidence-` or `deployment-drill`) or structural markers (`typeof parsed.schema_backward_compatible === 'boolean' && typeof parsed.caddy_routing_verified === 'boolean' && typeof parsed.rollback_procedure_verified === 'boolean'`). Do not accept an arbitrary JSON object, unified dossier, or filename alone.
   - Add `parseDeploymentDrillTimestamp(value)` helper supporting basic (`YYYYMMDDTHHMMSSZ`) and ISO 8601 (`YYYY-MM-DDTHH:mm:ss(\.\d{3})?Z`) formats.
   - Add `validateDeploymentDrillReport(report, now)` helper:
     - Require a plain object (not null, not array).
     - Require `report.drill_timestamp` (or `report.timestamp`) to be a valid UTC timestamp that parses to a finite timestamp not in the future relative to `now`.
     - Require `report.status === 'success'`.
     - Require `report.schema_backward_compatible === true`.
     - Require `report.rollback_procedure_verified === true`.
     - Require `report.caddy_routing_verified === true`.
     - Require `typeof report.caddy_routes_tested === 'number' && Number.isInteger(report.caddy_routes_tested) && report.caddy_routes_tested >= 12`.
     - Require `report.security_headers_verified === true`.
     - Require `report.s3_sigv4_host_preserved === true`.
     - Require `report.migrations_verified === true`.
     - Require `typeof report.migration_count === 'number' && Number.isInteger(report.migration_count) && report.migration_count >= 0`.
     - Require `report.operational_templates_verified === true`.
     - Require `report.secrets_scan_verified === true`.
     - Require `report.readiness_probes_verified === true`.
     - Require `report.network_isolation_verified === true`.
     - Require `report.graceful_drain_periods_verified` to be an object matching all expected services in `DEPLOYMENT_DRAIN_PERIODS`.
     - Require `report.duration_ms` (if present) to be a finite non-negative number.
2. In `validateReadiness`:
   - Accumulate parsed evidence files from `sections.deployment_and_rollback` into a `deploymentEvidence` array:
     `if (sectionName === 'deployment_and_rollback') deploymentEvidence.push(...parsedFiles);`
   - In `depSec.release`, when `live_drill_evidence` is a local `.json` file, also accumulate parsed files into `deploymentEvidence`:
     `if (field === 'live_drill_evidence') deploymentEvidence.push(...parsedFiles);`
   - In Category 3.10 (`deployment_and_rollback`):
     - Filter `deploymentEvidence` with `isDeploymentDrillCandidate`.
     - If no candidate report exists, add blocker:
       `'A successful deployment drill child JSON report is required'`
     - Validate all candidate reports with `validateDeploymentDrillReport(parsed, now)`. If any candidate report fails or is malformed, add blocker:
       `'A referenced deployment drill report is invalid or failed'`
     - Ensure that every candidate in evidence is validated: a failed or malformed report blocks approval even beside a valid one or inside a wildcard match.
   - Export `isDeploymentDrillCandidate`, `validateDeploymentDrillReport`, and `DEPLOYMENT_DRAIN_PERIODS` in `module.exports`.
3. Use the validator's existing injected `options.now` for deterministic date testing and default to real current time for CLI use. Bound diagnostics to generic Category 10 messages: do not leak filesystem paths or internal infrastructure details in blocker strings.
4. In `scripts/ops/check-launch-readiness.spec.js`:
   - Create a temporary valid deployment drill fixture file (`deployment-drill-evidence-valid.json`) in the existing fixture directory with valid basic timestamp `'20260828T120000Z'`, `status: 'success'`, `caddy_routing_verified: true`, `caddy_routes_tested: 12`, `security_headers_verified: true`, `s3_sigv4_host_preserved: true`, `migrations_verified: true`, `migration_count: 5`, `schema_backward_compatible: true`, `operational_templates_verified: true`, `secrets_scan_verified: true`, `readiness_probes_verified: true`, `network_isolation_verified: true`, `rollback_procedure_verified: true`, and `graceful_drain_periods_verified: { caddy: '30s', next: '30s', api: '45s', worker: '60s' }`.
   - Update `buildValidApprovedRecord().sections.deployment_and_rollback.evidence` to reference `deploymentDrillFixturePath`.
   - Update `buildValidApprovedRecord().sections.deployment_and_rollback.release.live_drill_evidence` to reference `deploymentDrillFixturePath`.
   - Add test cases covering:
     - Prose-only or empty evidence without local drill report in approved `deployment_and_rollback` blocks approval.
     - Unified dossier alone or arbitrary JSON with a deployment-like filename blocks approval.
     - Child report with `status: 'failed'` blocks approval.
     - Child report with `schema_backward_compatible: false` blocks approval.
     - Child report with `rollback_procedure_verified: false` blocks approval.
     - Child report with `caddy_routing_verified: false` or `caddy_routes_tested < 12` blocks approval.
     - Child report with `network_isolation_verified: false` blocks approval.
     - Child report with `security_headers_verified: false` or `s3_sigv4_host_preserved: false` blocks approval.
     - Child report with `migrations_verified: false` or negative `migration_count` blocks approval.
     - Child report with `operational_templates_verified: false`, `secrets_scan_verified: false`, or `readiness_probes_verified: false` blocks approval.
     - Child report with invalid graceful drain periods blocks approval.
     - Child report with invalid or future timestamp blocks approval.
     - Wildcard or multiple evidence files containing a failed report alongside a valid one blocks approval.
     - Valid report at an arbitrary custom path passes.
     - Helper functions handle edge cases and missing parameters safely.
     - Unrelated approved categories remain unaffected.
5. Update `docs/operations.md`, `docs/launch-checklist.md` Category 10, and the Phase 12 verification record in `docs/build-plan.md` with the accepted deployment drill child-report contract, verification results, and operator responsibilities. Keep `infra/launch/readiness.example.json` unresolved with empty evidence. No new `AGENTS.md` index row is needed.

## Impact, non-goals, and rollback

- No application routes, database schemas, UI components, background workers, or production Compose configs change. Only launch readiness evidence validation, test fixtures, and operations documentation change.
- An approved readiness record that previously relied only on prose evidence or external URI will now fail closed until its actual successful child report is referenced.
- This prompt validates consistency of an operator-supplied JSON report; it does not replace the operator's duty to manage actual deployment targets, OCI container registries, or execute live zero-downtime rollbacks in production.
- Rollback: revert the Category 10 evidence validator in `scripts/ops/check-launch-readiness.js`, the test updates in `check-launch-readiness.spec.js`, and documentation changes.

## Verification and review

1. Re-read this approved prompt and load every named skill before code.
2. Run `npm run ops:readiness-test`, `npm run ops:templates`, and `npm run ops:check`; quote the real output.
3. Run `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` and confirm it fails closed as expected.
4. Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
5. Dispatch a reviewer subagent via `requesting-code-review` after self-verification. Evaluate feedback using `receiving-code-review`, verify claims, fix verified issues, and rerun affected checks.
6. Record implementation and results in owning documentation, and commit prompt-scoped files locally on `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `deployment-pipeline-design` — maintain strict separation between automated pipeline gates, child drill artifacts, and operator launch sign-off.
- `javascript-testing-patterns` — build deterministic file-based positive and negative tests with temporary fixtures.
- `requesting-code-review` — dispatch reviewer subagent with structured context before finalizing.
- `receiving-code-review` — evaluate reviewer findings with technical rigor and verify before implementing fixes.
- `caveman-commit` — format concise conventional commit message for local commit to main.
