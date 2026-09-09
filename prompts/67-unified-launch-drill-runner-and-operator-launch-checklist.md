# 67 - unified launch drill runner, operator launch checklist, and incident runbooks

## Scope, and why it is next

The committed repository is on `main` at `1314034` (`feat(ops): add capacity load and alert drill`).
All 12 application build phases specified in `docs/build-plan.md` are functionally complete:
Phases 1–10 (marketing client, NestJS server, Postgres/PostGIS infrastructure, organizations & RLS,
versioned REST & GraphQL, client/backend connection & authenticated shell, storage/queues/secure uploads,
geography & ingestion, metrics & deterministic analytics, reports & exports) are implemented and verified;
Phase 11A (Gemini free-tier draft preview) is implemented as a disabled-by-default preview strictly excluded
from the production launch profile; and Phase 12 operational capabilities (12A templates/preflights,
12B telemetry/retention, 12C E2E journeys, 12D launch readiness decision record, 12E browser verification
remediation, 12F disaster recovery restore drill and object reconciliation, 12G Caddy same-origin ingress
and deployment drill, 12H volume encryption key separation and secret rotation drill, 12I supply-chain security,
SAST scanning, and container build hardening, and 12J capacity load benchmark, DoS resilience drill, and
Prometheus alert simulation) are fully committed.

However, Phase 12 currently lacks the unifying exit gate mandated by `docs/build-plan.md` (Lines 589–605):
> "Documentation owner: operations/deployment/incident/backup/restore/rotation runbooks, launch checklist, architecture/security updates."
> "- **Exit:** operator-approved launch checklist; reproducible promotion and rollback; successful restore drill within selected objectives; actionable alerts/runbooks; no unresolved critical security/accessibility findings; all repository, integration, E2E, isolation, and failure tests passing."

Specifically:
1. **Scattered Operational Drills**:
   Currently, the repository has 8 distinct operational drill runners (`ops:restore-drill`,
   `ops:reconcile-storage`, `ops:caddy-drill`, `ops:deployment-drill`, `ops:volume-drill`,
   `ops:rotation-drill`, `ops:capacity-alerting-drill`, `ops:sast`). There is no unified, top-level
   drill orchestrator that executes the entire operational drill suite end-to-end, validates all drill
   exit codes, aggregates their individual JSON reports, and emits a single, machine-readable
   **Unified Launch Evidence Dossier** (`backups/launch-evidence-dossier-<timestamp>.json`).

2. **Absence of a Dedicated Operator Launch Checklist**:
   While `infra/launch/readiness.example.json` defines the 11 required categories of launch decisions,
   the repository lacks a structured, actionable **Operator Launch Checklist** document (`docs/launch-checklist.md`)
   that maps each category to its specific drill command, evidence artifact, validation criteria, and
   named role authorities (`deployment_approver`, `rollback_authority`, `key_recovery_owner`, on-call alert team).

3. **Actionable Incident Response Runbooks for All 7 Golden Signal Alerts**:
   While `infra/prometheus/alerts.yml` defines 7 alerts (`AcresApiDown`, `HighHttp5xxRate`,
   `P95LatencyThresholdExceeded`, `High429Rate`, `QueueDeadLettersDetected`, `OutboxDeliveryLag`,
   `DatabaseConnectionPoolSaturation`), the repository lacks dedicated, step-by-step incident response runbooks
   detailing initial triage queries, log inspection steps, containment actions, escalation criteria, and
   clearing conditions for each alert.

4. **Launch Readiness Validator Evidence Cross-Validation**:
   While `scripts/ops/check-launch-readiness.js` validates that approved sections contain non-empty evidence
   arrays, it does not verify that referenced evidence JSON reports on disk actually exist, match the expected
   schema, and corroborate the section's approval assertions.

This prompt implements **Phase 12K: Unified Launch Drill Runner, Operator Launch Checklist, and Incident Runbooks (The Phase 12 Exit Gate)**:
1. **Unified Launch Drill Orchestrator (`scripts/ops/run-launch-drills.sh`)**:
   - Master shell orchestrator executing the complete battery of operational drills:
     - Stage 1: Static template & container runtime integrity (`check-production-templates.sh`, `check-docker-runtime.sh`, `scan-secrets.sh`);
     - Stage 2: Supply-chain SBOM & SAST security scanning (`generate-sbom.js --verify-licenses`, `run-sast-scan.js`, `verify-container-security.js`);
     - Stage 3: Caddy same-origin ingress routing & deployment rollback preflight drill (`verify-caddy-routing.js`, `run-deployment-drill.sh --dry-run`);
     - Stage 4: Production volume encryption key separation drill (`verify-volume-encryption.js`);
     - Stage 5: Zero-downtime secret rotation & emergency compromise drill (`run-secret-rotation-drill.sh --dry-run`);
     - Stage 6: Capacity benchmarking, multi-layer DoS resilience & Prometheus alert simulation drill (`run-capacity-alerting-drill.sh`);
     - Stage 7: Disaster recovery restore drill & PostgreSQL/storage reconciliation (`run-restore-drill.sh --dry-run`, `reconcile-storage-objects.js --dry-run`);
   - Aggregates status, execution timing, and artifact references from all stages into a unified JSON dossier:
     `backups/launch-evidence-dossier-<timestamp>.json`.
   - Supports CLI flags: `--dry-run`, `--json`, `--output <path>`, `--verbose`, and `--help`.
   - Companion Node.js test suite (`scripts/ops/run-launch-drills.spec.js`) verifying argument parsing,
     stage execution flow, failure handling, and evidence dossier JSON generation.

2. **Dedicated Operator Launch Checklist & Sign-off Document (`docs/launch-checklist.md`)**:
   - Step-by-step launch checklist organized across all 11 categories of `infra/launch/readiness.example.json`:
     1. Production Domain & TLS Configuration;
     2. SMTP Delivery & Email Infrastructure;
     3. Secrets Management & Runtime Injection;
     4. Secret References Inventory;
     5. SLOs, Alerting & Capacity Verification;
     6. Disaster Recovery & Backup Integrity;
     7. Data Retention & Scheduled Cleanup;
     8. Volume Encryption & Key Separation;
     9. Production GraphQL Introspection Policy;
     10. Deployment Promotion & Rollback Governance;
     11. No-AI Production Posture Attestation.
   - Pre-launch sign-off matrix with designated roles, checklist verification commands, and approval signatures.
   - Index row added to `AGENTS.md` Project Notes table.

3. **Detailed Incident Response Runbooks for All 7 Prometheus Alert Rules**:
   - Embedded directly in `docs/launch-checklist.md` (and cross-referenced in `docs/operations.md`):
     - `AcresApiDown` (Critical — API process unreachable);
     - `HighHttp5xxRate` (Critical — Server error rate > 5%);
     - `P95LatencyThresholdExceeded` (Warning — API p95 latency > 500ms);
     - `High429Rate` (Warning — Rate limit spikes / credential stuffing > 10%);
     - `QueueDeadLettersDetected` (Warning — Worker queue dead letters detected);
     - `OutboxDeliveryLag` (Warning — Outbox events pending > 50 for > 10m);
     - `DatabaseConnectionPoolSaturation` (Warning — Active connections approaching DB pool limit).
   - Each runbook includes: Alert Summary, PromQL query, Severity, Notification Channel, Immediate Triage & Diagnostics, Mitigation / Containment, Escalation Path, and Resolution Verification.

4. **Launch Readiness Validator Cross-Evidence Verification (`scripts/ops/check-launch-readiness.js`)**:
   - Enhances `validateReadiness()`: when an approved section references a file path (e.g. `backups/launch-evidence-dossier-*.json`, `backups/restore-drill-evidence-*.json`), validates that the file exists on disk and parses as valid JSON with matching drill success fields.
   - Updates `scripts/ops/check-launch-readiness.spec.js` asserting evidence file existence and validation.

5. **Operations & CI Integration (`package.json`, `scripts/ops/launch-readiness.sh`)**:
   - Adds root package scripts:
     - `"ops:launch-drill": "bash scripts/ops/run-launch-drills.sh --dry-run"`
     - `"ops:launch-drill-test": "node --test scripts/ops/run-launch-drills.spec.js"`
   - Integrates `ops:launch-drill-test` into `npm run ops:check`.
   - Adds optional `--with-drills` flag to `scripts/ops/launch-readiness.sh`.
   - Updates `docs/operations.md`, `docs/security.md`, and `docs/build-plan.md`.

## Reference material read while preparing this prompt

| path | what it is |
| --- | --- |
| `docs/build-plan.md` | §13 Phase 12 specifications and Phase 12 exit gate requirements |
| `docs/operations.md` | Operational topology, Prometheus metrics catalog, runbooks, and Phase 12 verification records (12A–12J) |
| `docs/security.md` | TM-01 through TM-22 threat register and launch acceptance suite |
| `infra/launch/readiness.example.json` | 11-category launch readiness schema |
| `infra/prometheus/alerts.yml` | 7 golden signal and threat Prometheus alert rules |
| `scripts/ops/check-launch-readiness.js` & `.spec.js` | Fail-closed launch readiness validator |
| `scripts/ops/run-restore-drill.sh` | Automated disaster recovery restore drill runner |
| `scripts/ops/reconcile-storage-objects.js` | PostgreSQL and object storage reconciliation utility |
| `scripts/ops/verify-caddy-routing.js` | Caddy ingress routing verification engine |
| `scripts/ops/run-deployment-drill.sh` | Deployment promotion preflight and rollback drill runner |
| `scripts/ops/verify-volume-encryption.js` | Production volume encryption and key separation validator |
| `scripts/ops/run-secret-rotation-drill.sh` | Automated secret rotation and compromise response drill runner |
| `scripts/ops/generate-sbom.js` | CycloneDX SBOM generator and license compliance validator |
| `scripts/ops/run-sast-scan.js` | Static application security testing (SAST) engine |
| `scripts/ops/verify-container-security.js` | Container image and Compose hardening validator |
| `scripts/ops/verify-capacity-load.js` | Performance and capacity benchmark evaluation engine |
| `scripts/ops/run-dos-resilience-drill.sh` | Multi-layer DoS resilience drill runner |
| `scripts/ops/verify-alert-rules.js` | Prometheus alert rule validator and simulation engine |
| `scripts/ops/run-capacity-alerting-drill.sh` | Unified capacity and alerting drill runner |

## Measurements and invariant contracts

1. **Unified Launch Evidence Dossier Schema Contract**:
   The output JSON emitted by `scripts/ops/run-launch-drills.sh` to `backups/launch-evidence-dossier-<timestamp>.json` must satisfy:
   - `version`: string (e.g. `"1.0.0"`);
   - `timestamp`: ISO-8601 string;
   - `environment`: `"production"` or `"drill"`;
   - `overall_status`: `"PASSED"` or `"FAILED"`;
   - `total_stages`: integer (7);
   - `passed_stages`: integer;
   - `failed_stages`: integer;
   - `duration_seconds`: number;
   - `stages`: array of stage objects, each containing:
     - `stage_id`: string (`"static_templates"`, `"supply_chain_sast"`, `"ingress_deployment"`, `"volume_encryption"`, `"secret_rotation"`, `"capacity_alerting"`, `"disaster_recovery"`);
     - `description`: string;
     - `status`: `"PASSED"` or `"FAILED"`;
     - `duration_ms`: number;
     - `artifacts`: array of evidence file paths;
     - `error_message`: string or `null`;
   - `summary`: object summarizing verification claims across SLOs, security, recovery, and no-AI posture.

2. **Operator Launch Checklist Structure (11 Categories)**:
   `docs/launch-checklist.md` must provide explicit verification steps and acceptance criteria for:
   - Category 1: `production_domain_tls` — DNS A/AAAA records, Let's Encrypt / ZeroSSL TLS, Caddy reverse proxy, HSTS approval gate;
   - Category 2: `smtp_delivery` — SMTP host, STARTTLS/TLS port, DKIM/SPF/DMARC records, credentials secret reference, bounce handling;
   - Category 3: `secrets_management` — Secret store injection mechanism (Vault/AWS SM/Infisical), log redaction, 90-day rotation, compromise runbook;
   - Category 4: `secret_references` — 11 indirect store references (`session`, `csrf`, `db_migrator`, `db_app`, `valkey`, `garage_rpc`, `garage_admin`, `garage_metrics`, `garage_s3`, `smtp`, `grafana_admin`), zero plaintext credentials;
   - Category 5: `slo_and_alerting` — 99.9% availability SLO, 500ms p95 latency ceiling, 100 RPS capacity, 7 alert rules validated, on-call alert routing;
   - Category 6: `backup_and_disaster_recovery` — 1h RPO, 4h RTO, encrypted off-host backup destination, cron schedule, completed restore drill, storage reconciliation;
   - Category 7: `data_retention_policy` — Retention periods for accounts, audit events, upload quarantine (7d), rejected objects (1d), exports (30d), reports, telemetry (15d), backups (30d);
   - Category 8: `volume_encryption` — LUKS2/CMEK encrypted mounts for all 9 stateful services, Key Separation Invariant (zero keys in mounts/backups/git), designated recovery owner;
   - Category 9: `graphql_introspection` — Production introspection disabled (default), security justification if enabled;
   - Category 10: `deployment_and_rollback` — Pinned OCI registry, deployment approver, rollback authority, image provenance, additive migrations;
   - Category 11: `optional_ai_posture` — `ai_enabled: false`, `no_ai_path_verified: true`, `server_ai_draft_enabled_false: true`, `no_gemini_api_key_provisioned: true`, `unpaid_provider_excluded: true`.

3. **Incident Response Runbooks for 7 Prometheus Alerts**:
   Each alert runbook in `docs/launch-checklist.md` must document:
   - Rule Name and PromQL query;
   - Severity level (`critical` vs `warning`);
   - Paging / Notification channel (PagerDuty, Slack, Email);
   - Initial Triage & Diagnostic commands;
   - Immediate Mitigation & Containment actions;
   - Escalation trigger and contacts;
   - Resolution verification & post-incident review checklist.

4. **Fail-Closed Evidence Cross-Validation Invariant**:
   In `scripts/ops/check-launch-readiness.js`, when a section is marked `"approved"`:
   - All string items in `evidence` pointing to `.json` files in `backups/` must exist on disk;
   - Referenced JSON files must be valid JSON and contain evidence fields indicating success;
   - Any missing evidence file or failed drill status in evidence causes immediate validation failure.

## Implementation steps

1. **Implement Unified Launch Drill Orchestrator (`scripts/ops/run-launch-drills.sh`)**:
   - Bash script with POSIX compliance, strict error handling (`set -eu`), and options parsing (`--dry-run`, `--json`, `--output <path>`, `--verbose`, `--help`).
   - Executes 7 distinct operational drill stages:
     1. Stage 1: `check-production-templates.sh`, `check-docker-runtime.sh`, `scan-secrets.sh`;
     2. Stage 2: `generate-sbom.js --verify-licenses`, `run-sast-scan.js`, `verify-container-security.js`;
     3. Stage 3: `verify-caddy-routing.js`, `run-deployment-drill.sh --dry-run`;
     4. Stage 4: `verify-volume-encryption.js`;
     5. Stage 5: `run-secret-rotation-drill.sh --dry-run`;
     6. Stage 6: `run-capacity-alerting-drill.sh`;
     7. Stage 7: `run-restore-drill.sh --dry-run`, `reconcile-storage-objects.js --dry-run`;
   - Measures stage elapsed times and captures exit codes;
   - Collects all generated JSON evidence files into a unified dossier (`backups/launch-evidence-dossier-<timestamp>.json`);
   - Prints formatted tabular execution summary;
   - Exits 0 if all stages succeed, exits 1 if any stage fails.

2. **Implement Unit Test Suite for Launch Drill Runner (`scripts/ops/run-launch-drills.spec.js`)**:
   - Pure Node.js test suite using `node:test` and `node:assert`:
     - Asserts script existence and executable permissions;
     - Tests `--help` flag displaying usage and options;
     - Tests argument parsing (`--dry-run`, `--json`, `--output`);
     - Tests unified evidence dossier JSON structure and required fields;
     - Tests error handling and non-zero exit propagation when a stage fails;
     - Tests output dossier creation and schema compliance.

3. **Author Operator Launch Checklist & Incident Runbooks (`docs/launch-checklist.md`)**:
   - Detailed, comprehensive operator guide:
     - Section 1: Introduction & Launch Philosophy (Fail-closed posture, deterministic no-AI, FOSS stack);
     - Section 2: Launch Governance & Pre-Flight Prerequisites;
     - Section 3: 11-Category Launch Readiness Verification Checklist;
     - Section 4: Incident Response Runbooks for All 7 Prometheus Alert Rules;
     - Section 5: Unified Drill Execution & Evidence Dossier Generation;
     - Section 6: Emergency Rollback & Disaster Recovery Procedures;
     - Section 7: Formal Pre-Launch Sign-off Matrix.
   - Add index row to `AGENTS.md` Project Notes table.

4. **Enhance Launch Readiness Validator with Evidence Cross-Validation (`scripts/ops/check-launch-readiness.js` & `.spec.js`)**:
   - Update `validateReadiness()` in `check-launch-readiness.js`:
     - When a section has `status === 'approved'`, inspect `evidence` items;
     - If an evidence item is a relative file path ending in `.json`, verify file existence;
     - Parse JSON and assert that `status` or `overall_status` is not `"FAILED"`;
     - Report missing or failed evidence files as blockers.
   - Update `scripts/ops/check-launch-readiness.spec.js`:
     - Add unit tests verifying evidence file cross-validation pass and fail paths.

5. **Operations & CI Integration**:
   - Update `package.json`:
     - `"ops:launch-drill": "bash scripts/ops/run-launch-drills.sh --dry-run"`
     - `"ops:launch-drill-test": "node --test scripts/ops/run-launch-drills.spec.js"`
   - Update `scripts/ops/launch-readiness.sh`:
     - Support optional `--with-drills` flag that runs `scripts/ops/run-launch-drills.sh --dry-run` before checking readiness.
   - Integrate `npm run ops:launch-drill-test` into `npm run ops:check`.
   - Update `docs/operations.md`, `docs/security.md`, and `docs/build-plan.md` with Phase 12K records.

## Expected impact

- Files created:
  - `scripts/ops/run-launch-drills.sh`
  - `scripts/ops/run-launch-drills.spec.js`
  - `docs/launch-checklist.md`
- Files modified:
  - `scripts/ops/check-launch-readiness.js`
  - `scripts/ops/check-launch-readiness.spec.js`
  - `scripts/ops/launch-readiness.sh`
  - `package.json`
  - `AGENTS.md`
  - `docs/operations.md`
  - `docs/security.md`
  - `docs/build-plan.md`

## Non-goals

- No automatic deployment to live production infrastructure or third-party cloud accounts (orchestrator verifies and validates drills locally/in CI without committing live infrastructure).
- No hardcoded production credentials, production domain records, or private keys.
- No modifications to database schema, client UI, or server business logic.
- No alteration of the strict no-AI launch posture: Phase 11A Gemini preview remains disabled by default and excluded from launch.

## Verification and documentation plan

1. Execute operational test suites:
   - `npm run ops:launch-drill-test` (must pass 100% of unit tests);
   - `npm run ops:readiness-test` (must pass 100% of unit tests including evidence cross-validation);
   - `npm run ops:launch-drill` (must execute all 7 drill stages cleanly in dry-run mode and emit `backups/launch-evidence-dossier-<timestamp>.json`);
   - `npm run ops:check` (must pass all template, secret, runtime, dependency, readiness, storage reconciliation, Caddy, volume encryption, SBOM, SAST, container, capacity, alert, and launch-drill checks).
2. Repository verification checks:
   - `git diff --check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
3. Dispatch reviewer subagent via `requesting-code-review` and evaluate feedback via `receiving-code-review`.
4. Commit locally to `main` using `caveman-commit`.

## SKILLS USED

- `deployment-pipeline-design`: launch pipeline orchestration, deployment preflights, promotion/rollback gates, and disaster recovery validation.
- `github-actions-templates`: CI operations check integration and workflow consistency.
- `prometheus-configuration`: incident response runbooks for all 7 Prometheus alert rules, PromQL queries, and triage procedures.
- `grafana-dashboards`: operational metrics alignment with dashboard panels.
- `secrets-management`: secret references, rotation schedules, and key separation invariant.
- `sast-configuration`: supply-chain security, CycloneDX SBOM, and container build hardening.
- `security-threat-model`: verification against all 22 threats (TM-01 through TM-22).
- `security-best-practices`: secure by default scripting, fail-closed validation, and redaction.
- `architecture-patterns`: modular orchestrator design and unified evidence dossier aggregation.
- `javascript-testing-patterns`: Node.js test runner unit test design for orchestrator and readiness validator.
- `requesting-code-review`: preparing structured review context for reviewer subagent dispatch.
- `receiving-code-review`: evaluating reviewer feedback with technical rigor.
- `caveman-commit`: composing standard conventional commit message.
