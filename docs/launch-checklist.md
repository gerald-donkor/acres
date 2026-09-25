# Acres Operator Launch Checklist & Incident Runbooks

Status: Phase 12K implemented from `prompts/67-unified-launch-drill-runner-and-operator-launch-checklist.md`.
This is the Phase 12 exit-gate document mandated by `docs/build-plan.md`:
operator-approved launch checklist, reproducible promotion and rollback,
restore drill within objectives, actionable alerts/runbooks, and no unresolved
critical security/accessibility findings.

## 1. Introduction & Launch Philosophy

Acres launches fail-closed. `scripts/ops/check-launch-readiness.js` rejects the
checked-in `infra/launch/readiness.example.json` template until every one of the
11 categories below is operator-approved with auditable evidence. The stack is
FOSS and self-hostable (PostgreSQL/PostGIS, Valkey, Garage, Caddy, Prometheus,
Grafana); "free" refers to the software, not to infrastructure or operations.
Phase 11A (Gemini free-tier draft preview) is implemented but strictly excluded
from the production launch profile: `ai_enabled: false`,
`AI_DRAFT_ENABLED=false`, no `GEMINI_API_KEY` provisioned, unpaid provider
excluded. Deterministic no-AI journeys are the launch path.

## 2. Launch Governance & Pre-Flight Prerequisites

| role | responsibility |
| --- | --- |
| `deployment_approver` | approves promotion of a pinned, provenance-attested image |
| `rollback_authority` | owns the rollback decision and executes it |
| `key_recovery_owner` | holds volume-encryption recovery material under dual custody |
| on-call alert team | receives the 11 Prometheus alerts and works the runbooks in §5 |

Pre-flight (all must pass before the checklist below):

```bash
npm run ops:check
scripts/ops/launch-readiness.sh [--with-drills] [readiness.json]
bash scripts/ops/run-launch-drills.sh --dry-run
node scripts/ops/check-launch-readiness.js <operator-readiness.json>
```

Copy `infra/launch/readiness.example.json` to an operator-owned record, fill
every `__REQUIRED_*__` placeholder, and never commit literal secrets into it —
the validator fails closed on placeholders, client-exposed secret patterns,
key literals, dev passwords, and raw connection strings with credentials.

## 3. Eleven-Category Launch Readiness Checklist

Each row maps a readiness category to its drill command, evidence artifact,
and acceptance criteria. Mark approved only in the operator readiness record
(`status: "approved"` + non-empty `evidence`); the validator additionally
cross-checks that `.json` evidence paths under `backups/` exist on disk and
do not report failure.

### 1. Production Domain & TLS (`production_domain_tls`)

- Drill/verify: `node scripts/ops/verify-caddy-routing.js`, `scripts/ops/check-production-templates.sh`
- Evidence: Caddyfile HSTS approval, DNS A/AAAA record printout
- Accept: real (non-localhost) domain, valid TLS contact email, `hsts_approved: true`

### 2. SMTP Delivery (`smtp_delivery`)

- Drill/verify: test delivery via the configured provider, DKIM/SPF/DMARC DNS checks
- Evidence: delivery receipt, DNS record printout
- Accept: provider, host, valid port, `from_address`, credentials secret
  reference, delivery policy, bounce/abuse handling procedure

### 3. Secrets Management (`secrets_management`)

- Drill/verify: `scripts/ops/scan-secrets.sh`, `bash scripts/ops/run-secret-rotation-drill.sh --dry-run`
- Evidence: `backups/secret-rotation-evidence-<timestamp>.json`
- Accept: runtime injection mechanism (Vault/AWS SM/Infisical), log masking
  policy, 90-day rotation cadence (≤ 90 days), compromise response runbook reference
- An approved record must reference a concrete, successful secret rotation
  child JSON report in `evidence`. A custom path is accepted by report content,
  not name. Its UTC timestamp (basic `YYYYMMDDTHHMMSSZ` or ISO 8601) must be real
  and no later than validation time. Every referenced secret rotation report must
  pass: `status: "success"`, empty `errors` array, all 7 tested secret classes
  (`session_secret`, `csrf_secret`, `postgres_passwords`, `valkey_password`,
  `storage_s3_keys`, `smtp_credentials`, `grafana_admin_password`), all 7
  verified steps (`session_rollover`, `csrf_rollover`, `database_rotation`,
  `valkey_rotation`, `storage_rotation`, `compromise_response`, `redaction_audit`)
  with `status: "passed"`, and secret redaction audit confirmation
  (`raw_secrets_masked: true`, `zero_dev_passwords_detected: true`). A failed or
  malformed report blocks even alongside a valid one. The unified dossier alone,
  prose, and declarations without child evidence are insufficient.
- Fail-closed validator enforcement (`scripts/ops/check-launch-readiness.js`):
  - Requires at least one concrete, successful secret rotation child report in `evidence` for approved status;
  - Requires `rotation_cadence_days` to be a positive number ≤ 90 days;
  - Rejects secret rotation drill evidence reporting failure (`status !== 'success'`), any errors in `errors[]`, missing secret classes or steps, any failed rotation step among the 7 verified steps (`session_rollover`, `csrf_rollover`, `database_rotation`, `valkey_rotation`, `storage_rotation`, `compromise_response`, `redaction_audit`), or secret redaction / leak audit failure (`raw_secrets_masked: false`, `zero_dev_passwords_detected: false`);
  - Rejects Unified Launch Evidence Dossiers reporting `secretRotationBaseline.status: "breached"` or `summary.secretRotationCompliance: "failed"`.

### 4. Secret References (`secret_references`)

- Drill/verify: `scripts/ops/scan-secrets.sh`
- Evidence: Vault policy showing all 12 indirect references
- Accept: all of `session`, `csrf`, `db_migrator`, `db_app`, `valkey`,
  `garage_rpc`, `garage_admin`, `garage_metrics`, `garage_s3`, `smtp`,
  `grafana_admin`, `db_monitor` present as store references; zero plaintext credentials;
  no AI/Gemini secret source (contradicts the no-AI posture)

### 5. SLOs, Alerting & Capacity (`slo_and_alerting`)

- Drill/verify: `bash scripts/ops/run-capacity-alerting-drill.sh`,
  `node scripts/ops/verify-alert-rules.js`, `node scripts/ops/verify-capacity-load.js --synthetic`
- Evidence: `backups/capacity-alerting-drill-evidence-<timestamp>.json`
- Accept: availability target ≥ 99.9% (error rate < 0.1%), HTTP p95 latency ceiling ≤ 500ms,
  capacity target ≥ 100 RPS, database connection pool acquisition p95 latency ceiling ≤ 50ms,
  database query execution p95 latency ceiling ≤ 100ms, ≥ 1 alert recipient,
  `alert_thresholds_defined: true`, escalation runbook reference; all 11 alert rules validated.
  Record both `up{job="acres-postgres"}` and `pg_up{job="acres-postgres"}` with
  `pg_exporter_last_scrape_error{job="acres-postgres"}`. Exercise exporter-down
  and database/authentication-failure cases separately. Confirm the private
  monitor file mount and existing-volume role reconciliation. Record the
  lock-wait count and oldest transaction-age panels with their scrape health;
  follow the read-only diagnosis in §5 when either suggests contention.
  Record API and Worker PostgreSQL pool acquisition latency percentiles (panels
  23 and 24, `acres_postgres_pool_acquisition_duration_seconds`) and SQL query
  execution latency percentiles (panels 25 and 26, `acres_database_query_duration_seconds`);
  elevated acquisition p95/p99 indicates pool checkout queueing or exhaustion,
  while elevated query latency with low acquisition latency isolates database-side
  query or index bottlenecks.
- Capacity baseline telemetry structure in evidence (`databaseTelemetryBaseline`):
  - `postgresExporter`: `up == 1` (`up{job="acres-postgres"}`), `lastScrapeError == 0` (`pg_exporter_last_scrape_error{job="acres-postgres"}`)
  - `postgresServer`: `pgUp == 1` (`pg_up{job="acres-postgres"}`)
  - `connectionPool`: API and Worker `totalConnections`, `idleConnections`, `maxConnections`, `requestsWaiting` (0 required)
  - `poolAcquisitionLatency`: API and Worker p50, p95 (ceiling ≤ 50ms), p99 (`acres_postgres_pool_acquisition_duration_seconds`)
  - `queryExecutionDuration`: API and Worker p50, p95 (ceiling ≤ 100ms), p99 (`acres_database_query_duration_seconds`)
  - `serverActivity`: `lockWaits` (0 required) and `maxTransactionDurationSec`
- Fail-closed validator enforcement (`scripts/ops/check-launch-readiness.js`):
  - Requires `availability_target_percent` to be a number between 99.9 and 100.0%;
  - Requires `max_p95_latency_ms` to be a positive number ≤ 500ms;
  - Requires `capacity_target_rps` to be a positive number ≥ 100 RPS;
  - Requires `max_database_acquisition_p95_latency_ms` to be a positive number ≤ 50ms;
  - Requires `max_database_query_p95_latency_ms` to be a positive number ≤ 100ms;
  - Requires a referenced, valid, successful capacity alerting child JSON report in `evidence`;
  - Validates child report `status: "success"`, valid nonfuture UTC `timestamp`, empty `failures` array, all summary flags `passed`, `alerts.valid: true`, `ruleCount >= 11`, all simulations `passed`, `capacity.compliance.overallPassed: true` with all individual compliance flags `true`, `databaseTelemetryBaseline.status: "verified"` with exporter/server up, zero waiting connections, acquisition p95 ≤ 50ms, query execution p95 ≤ 100ms, zero lock waits, and `dosResilience.status: "success"`;
  - Fails closed if approved evidence reports `summary.databaseBaselineCompliance: "failed"` or `databaseTelemetryBaseline.status: "breached"`.

### 6. Disaster Recovery & Backups (`backup_and_disaster_recovery`)

- Drill/verify: `bash scripts/ops/run-restore-drill.sh --dry-run`,
  `node scripts/ops/reconcile-storage-objects.js --dry-run`
- Evidence: `backups/restore-drill-evidence-<timestamp>.json`, reconciliation report
- Accept: RPO ≤ 1h, RTO ≤ 4h (drill default 300s), encrypted off-host
  destination, cron schedule, `restore_drill_completed: true` with drill date,
  `db_object_reconciliation_tested: true`
- An approved record must reference a concrete, successful restore child JSON
  report in `evidence`. A custom path is accepted by report content, not name.
  Its basic UTC `drill_timestamp` (`YYYYMMDDTHHMMSSZ`) must be real and no later
  than validation time; `restore_drill_date` must be a real, nonfuture UTC
  `YYYY-MM-DD` date or `YYYY-MM-DDTHH:mm:ssZ` and match the latest valid
  referenced report's UTC date. Every referenced restore report must pass:
  `status: "success"`, true RTO/parity/PostGIS/foreign-key flags, equal
  nonnegative integer source/restored table and migration counts, positive
  integer `backup_bytes`, and finite nonnegative `duration_ms`. A failed or
  malformed report blocks even alongside a valid one. The dossier alone,
  prose, and `restore_drill_completed: true` are insufficient.
- It must also reference a concrete reconciliation child JSON report. A custom
  path is accepted by content; `db_object_reconciliation_tested: true`, prose,
  a plausible filename, and the unified dossier alone are insufficient. Each
  referenced report needs a real, nonfuture ISO UTC `timestamp`, the producer's
  eight finite nonnegative safe-integer summary counts, four result arrays with
  matching counts, zero missing/mismatched objects, and `exitCode: 0`. Status
  must be `clean` with no orphans or `warning` with an accurate orphan array.
  Every referenced report, including wildcard matches, must pass; the
  operator reviews warning orphans and verifies the live drill's scope.
- The schedule must run in UTC. Supported five-field cron syntax has `*` for
  hour, day of month, month, and day of week; the minute field is `*`, one
  minute `0..59`, `*/n` for `1..60`, or distinct comma-separated minutes.
  The longest interval between scheduled starts, including the hour boundary,
  must be no greater than `rpo_hours × 60` minutes. The example uses
  `0 * * * *` for a one-hour RPO.
- Start frequency alone does not establish the RPO. The operator must show
  successful backup completion, encrypted off-host transfer, PostgreSQL and
  Garage coverage, backup freshness, and a restore drill under actual load.
  Report/date consistency does not authenticate an archive or prove recovery.
- Fail-closed validator enforcement (`scripts/ops/check-launch-readiness.js`):
  - Requires `rpo_hours` to be a positive number ≤ 1 hour;
  - Rejects unsupported cron syntax and schedules whose maximum UTC start gap exceeds the declared RPO;
  - Requires `rto_hours` to be a positive number ≤ 4 hours;
  - Rejects restore drill evidence reporting `rto_compliant: false`, record parity failure, PostGIS/foreign key verification failure, or table/migration count discrepancies;
  - Rejects storage reconciliation reports reporting status `error`, missing objects, or checksum/size mismatches;
  - Rejects Unified Launch Evidence Dossiers reporting `disasterRecoveryBaseline.status: "breached"` or restore/reconcile compliance failures (`summary.restoreCompliance: "failed"`, `summary.reconcileCompliance: "failed"`).
- Known constraint (judgement, verified): both sub-drills require live drill
  infra even in `--dry-run` — PGPASSWORD plus reachable Postgres (`pg_isready`)
  for the restore drill, plus authenticated Postgres and reachable Garage/S3
  for reconciliation. Without them the unified orchestrator records stage 7
  `disaster_recovery` as FAILED (fail-closed); see §6.

### 7. Data Retention (`data_retention_policy`)

- Drill/verify: scheduled-cleanup review against the retention table
- Evidence: policy review sign-off
- Accept: explicit windows for accounts, audit events, upload quarantine (7d),
  rejected objects (1d), exports (30d), reports, telemetry (15d), backups (30d)

### 8. Volume Encryption (`volume_encryption`)

- Drill/verify: `node scripts/ops/verify-volume-encryption.js --output backups/volume-encryption-evidence-<timestamp>.json`
- Evidence: `backups/volume-encryption-evidence-<timestamp>.json`
- Accept: LUKS2/CMEK-class mechanism, ≥3 encrypted stateful mounts
  (PostgreSQL, Valkey, Garage), `key_separation_confirmed: true` (zero keys in
  mounts/backups/git), designated `key_recovery_owner`
- An approved record must reference a concrete, successful volume encryption
  child JSON report in `evidence`. A custom path is accepted by report content,
  not name. Its ISO UTC `timestamp` must be real and no later than validation
  time. Every referenced volume encryption report must pass: `status: "success"`,
  `valid: true`, empty `errors` array, `keySeparation.verified: true`, empty
  `keySeparation.detectedViolations` array, and `evaluatedMounts` array containing
  all items with `passed: true` covering at least the 3 required stateful mounts
  (PostgreSQL, Valkey, Garage). If total/valid mount counts are present, they
  must be equal positive integers. A failed or malformed report blocks even
  alongside a valid one. The unified dossier alone, prose, and
  `key_separation_confirmed: true` without child evidence are insufficient.
- Fail-closed validator enforcement (`scripts/ops/check-launch-readiness.js`):
  - Requires at least one concrete, successful volume encryption child report in `evidence` for approved status;
  - Rejects volume encryption evidence reporting failure (`status !== 'success'`), invalid configuration (`valid: false`), any errors in `errors[]`, key separation violation (`keySeparation.verified: false`), detected keyfile violations in volume mounts or Git tracking, or any failed stateful storage mounts;
  - Rejects Unified Launch Evidence Dossiers reporting `volumeEncryptionBaseline.status: "breached"` or `summary.volumeEncryptionCompliance: "failed"`.

### 9. GraphQL Introspection (`graphql_introspection`)

- Drill/verify: production route probe (introspection query must fail closed)
- Evidence: probe transcript
- Accept: `production_introspection_enabled` boolean; enabling it in
  production requires a written security justification

### 10. Deployment & Rollback (`deployment_and_rollback`)

- Drill/verify: `bash scripts/ops/run-deployment-drill.sh --dry-run`
- Evidence: `backups/deployment-drill-evidence-<timestamp>.json`
- Release evidence: reviewed source commit, client and server manifest digests,
  approved provenance verification for each, and both previous known-good
  digests. Include the release-image preflight and Compose `config --quiet`
  result; static checks alone do not establish live readiness.
- Record `release.reviewed_source_commit`, `release.current.client_image`,
  `release.current.server_image`, `release.previous.client_image`,
  `release.previous.server_image`, `release.client_provenance_evidence`,
  `release.server_provenance_evidence`, and `release.live_drill_evidence`.
  The approver inspects both external verification artifacts and the live drill
  evidence. In the release shell, export the exact current pair and run
  `npm run ops:launch-readiness -- <record>` (or
  `node scripts/ops/check-launch-readiness.js <record>`), followed by
  `node scripts/ops/check-release-images.js` and production Compose
  `config --quiet` in that same shell. Approved deployment checks require
  the exported pair. The checked-in unapproved template still fails with
  operator blockers when no pair is exported.
- Accept: target host profile, pinned OCI registry path, named
  `deployment_approver` and `rollback_authority`, image provenance policy
  (signed, additive migrations only), `live_readiness_drill_completed: true`
- An approved record must reference a concrete, successful deployment drill
  child JSON report in `evidence` or `release.live_drill_evidence`. A custom
  path is accepted by report content, not name. Its UTC timestamp (basic
  `YYYYMMDDTHHMMSSZ` or ISO 8601) must be real and no later than validation
  time. Every referenced deployment drill report must pass: `status: "success"`,
  `schema_backward_compatible: true`, `rollback_procedure_verified: true`,
  `caddy_routing_verified: true`, integer `caddy_routes_tested >= 12`,
  `security_headers_verified: true`, `s3_sigv4_host_preserved: true`,
  `migrations_verified: true`, integer `migration_count >= 0`,
  `operational_templates_verified: true`, `secrets_scan_verified: true`,
  `readiness_probes_verified: true`, `network_isolation_verified: true`,
  and matching `graceful_drain_periods_verified` (`caddy: '30s'`, `next: '30s'`,
  `api: '45s'`, `worker: '60s'`). A failed or malformed report blocks even
  alongside a valid one. The unified dossier alone, prose, and
  `live_readiness_drill_completed: true` without child evidence are insufficient.
- Fail-closed validator enforcement (`scripts/ops/check-launch-readiness.js`):
  - Requires at least one concrete, successful deployment drill child report in `evidence` or `release.live_drill_evidence` for approved status;
  - Rejects deployment drill evidence reporting failure (`status !== 'success'`), schema backward compatibility failure (`schema_backward_compatible: false`), rollback procedure verification failure, Caddy routing verification failure, network isolation verification failure, missing security headers or S3 sigv4 verification, untested routes (< 12), invalid migration counts, or invalid graceful drain periods;
  - Rejects Unified Launch Evidence Dossiers reporting `deploymentBaseline.status: "breached"`, `summary.deploymentCompliance: "failed"`, or `summary.rollbackCompliance: "failed"`.

### 11. No-AI Production Posture (`optional_ai_posture`)

- Drill/verify: `node scripts/ops/check-launch-readiness.js <record>` (fail-closed AI gates)
- Evidence: no-AI journey verification log, production env inventory showing no `GEMINI_API_KEY`
- Accept: `ai_enabled: false`, `no_ai_path_verified: true`,
  `server_ai_draft_enabled_false: true`, `no_gemini_api_key_provisioned: true`,
  `unpaid_provider_excluded: true`, non-empty `phase11_status`

## 4. Unified Drill Execution & Evidence Dossier

`scripts/ops/run-launch-drills.sh` runs all 7 stages and writes
`backups/launch-evidence-dossier-<timestamp>.json`:

| # | `stage_id` | covers |
| --- | --- | --- |
| 1 | `static_templates` | production templates, docker runtime, secret scan; `static-integrity-evidence-<timestamp>.json` |
| 2 | `supply_chain_sast` | SBOM + licenses, SAST scan, container security |
| 3 | `ingress_deployment` | Caddy routing verify, deployment drill |
| 4 | `volume_encryption` | volume encryption + key separation |
| 5 | `secret_rotation` | secret rotation drill |
| 6 | `capacity_alerting` | capacity benchmark, DoS resilience, alert simulation |
| 7 | `disaster_recovery` | restore drill + storage reconciliation |

Flags: `--dry-run` (offline where the underlying tool supports it),
`--json` (print dossier to stdout), `--output <path>`, `--evidence-dir <dir>`,
`--verbose`, `--help`. Exit 0 only when every stage passes; any failure exits
1 with the failing stage named in the dossier (`error_message`) and on the
console. Stages 1–6 pass fully offline; stage 7 needs drill infra (§3.6).

The Unified Launch Evidence Dossier aggregates structured baselines from child evidence across all operational dimensions:
- `staticIntegrityBaseline` (stage 1): the three fixed checks, their exit codes, and total/passed/failed counts; `summary.staticIntegrityCompliance` is passed only when the complete child evidence is valid and stage 1 passed;
- `supplyChainBaseline` (stage 2): package inventory count, license compliance verification, license violations, SAST scanned files, findings count, triaged/expired/blocking findings, container security validity, and container security checks count;
- `deploymentBaseline` (stage 3): schema backward compatibility, Caddy routing verification, rollback procedure verification, network isolation, migration count, and tested routes;
- `volumeEncryptionBaseline` (stage 4): stateful mount evaluation, required mount counts, and Key Separation Invariant verification;
- `secretRotationBaseline` (stage 5): verified 7-step zero-downtime rotation (session, CSRF, database, Valkey, storage, compromise response, and credential redaction audit);
- `databaseTelemetryBaseline` (stage 6): exporter health, database ping, connection pool saturation metrics, pool acquisition p95 latency, SQL query execution p95 latency, lock waits, and transaction age;
- `disasterRecoveryBaseline` (stage 7): restore drill RTO, table parity, migration parity, PostGIS/foreign-key verification, and storage object reconciliation;
- `summary`: compliance flags across static integrity, supply chain security, supply chain compliance, SAST compliance, container security compliance, ingress/deployment, volume encryption, secret rotation, capacity alerting, disaster recovery, SLO compliance, recovery compliance, alert verification, DoS resilience, database baseline compliance, restore compliance, reconcile compliance, deployment compliance, rollback compliance, secret rotation compliance, volume encryption compliance, and no-AI posture.

Implementation notes: the orchestrator is bash (arrays, `[[ ]]`), matching the
sibling drill runners. Each stage's full child output is captured to
`launch-drill-stage-<stage_id>.log` in the evidence dir, and every dossier
`artifacts` entry lists that log plus the child evidence files the stage
emitted, closed by the dossier path itself. The dossier `timestamp` is extended
ISO-8601 (`Date.parse`-compatible); the filename stamp stays basic
(`launch-evidence-dossier-YYYYMMDDTHHMMSSZ.json`). Secret rotation always runs
`--dry-run` — live rotation stays an explicit operator action even when the
orchestrator itself runs without `--dry-run` (reconciliation reporting likewise
stays `--dry-run`; it is read-only but still requires live drill infra).

Reference a dossier from an approved readiness section by placing its
`backups/launch-evidence-dossier-<timestamp>.json` path in that section's
`evidence` array; the validator confirms the file exists, parses as JSON, and
rejects dossiers whose `overall_status`/`status` is `"FAILED"`, or whose
underlying baselines report breach or compliance failure.
Stage 1 child evidence has `drill_type: "static_integrity_verification"`,
`status`, `valid`, `totalChecks: 3`, `passedChecks`, `failedChecks`, and ordered
`checks` for `production_templates`, `docker_runtime`, and `secret_defaults`.
Each successful check requires `passed: true` and `exitCode: 0`; a failed
process may report a nonzero exit code, while spawn failure reports a generic
`failureKind: "spawn_failed"` and null exit code. The readiness validator
rejects inconsistent child evidence and dossier static-integrity breach or
compliance failure. Reference the child artifact alongside the dossier when
reviewing Category 4 secret references; neither substitutes for the remaining
operator sign-off and live drill evidence.

## 5. Incident Response Runbooks (11 Prometheus Alerts)

Alert rules live in `infra/prometheus/alerts.yml`. Severity `critical` pages
the on-call team; `warning` notifies the shared channel — with what tool
(PagerDuty, Slack, email) taken from the operator record's
`slo_and_alerting.alert_recipients`, since `alerts.yml` carries severities and
annotations but no receivers. After every incident: verify the clearing
condition for 15 minutes, then file a post-incident review (timeline, root
cause, action items) before resolving the alert thread.

### AcresApiDown (critical)

- PromQL: `up{job="acres-api"} == 0` for 1m — API process unreachable.
- Dashboard: Panel 2 ("Acres API Status") in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: `docker compose ps api`; `docker compose logs --tail=200 api`;
  `curl -f http://localhost:3001/health`; check host CPU/memory/disk.
- Contain: restart the API container; if the image is bad, roll back to the
  last pinned image per §6. Escalate to `rollback_authority` after 10 minutes
  down or a second failed restart.
- Clear: `up{job="acres-api"} == 1` for 5m and `/health` 200.

### AcresWorkerDown (critical)

- PromQL: `up{job="acres-worker"} == 0` for 1m — Worker process unreachable.
- Dashboard: Panel 11 ("Acres Worker Status") in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: `docker compose ps worker`; `docker compose logs --tail=200 worker`;
  `curl -f http://worker:3002/health` (or private interface); check host CPU/memory/disk,
  Valkey queue connectivity, and PostgreSQL database reachability.
- Contain: restart the worker container (`docker compose restart worker`); if the image
  is bad, roll back to the last pinned image per §6. Escalate to `rollback_authority`
  and on-call backend engineer after 10 minutes down or a second failed restart.
- Clear: `up{job="acres-worker"} == 1` for 5m and `/health` 200.

### PostgresDown (critical)

- PromQL: `pg_up{job="acres-postgres"} == 0` for 1m — PostgreSQL database unreachable or failing connections.
- Dashboard: Panel 15 ("PostgreSQL Database Scrape") in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: `docker compose ps postgres`; `docker compose logs --tail=200 postgres`;
  check socket/port reachability (`docker compose exec postgres pg_isready -U acres_app -d acres`);
  check host disk/filesystem space (`df -h`); inspect exporter logs
  `docker compose logs --tail=200 postgres-exporter` and metrics `/metrics` for scrape errors (`pg_exporter_last_scrape_error`).
- Contain: restart postgres container (`docker compose restart postgres`); resolve any disk space exhaustion;
  verify volume integrity. If database corruption is detected, initiate emergency disaster recovery restore drill per §6.
  Escalate to database administrator and `rollback_authority` after 5 minutes down or a failed restart.
- Clear: `pg_up{job="acres-postgres"} == 1` for 5m.

### PostgresExporterDown (warning)

- PromQL: `up{job="acres-postgres"} == 0` for 1m — postgres-exporter process unreachable.
- Dashboard: Panel 14 ("PostgreSQL Exporter HTTP Scrape") and Panel 16 ("PostgreSQL Collector Error") in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: `docker compose ps postgres-exporter`; `docker compose logs --tail=200 postgres-exporter`;
  check whether container stopped, crashed, or was OOM-killed; check host resources and port contention;
  verify secret file mount `/run/secrets/acres_monitor_password` exists and has correct permissions;
  check whether Prometheus scrape timeout (15s) is exceeded.
- Contain: restart postgres-exporter container (`docker compose restart postgres-exporter`);
  if credential or configuration failure, verify monitor credentials via `DATA_SOURCE_PASS_FILE`;
  if recurring crash, check container memory and network connectivity. Note: production database
  traffic and API/worker services are unaffected unless `PostgresDown` also fires.
  Escalate to on-call SRE if exporter remains down > 15m.
- Clear: `up{job="acres-postgres"} == 1` for 5m.

### HighHttp5xxRate (critical)

- PromQL: `(sum(rate(acres_http_requests_total{job="acres-api",status_class="5xx"}[5m])) / clamp_min(sum(rate(acres_http_requests_total{job="acres-api"}[5m])), 0.001)) * 100 > 5` for 5m — server error burst.
- Dashboard: Panel 6 ("HTTP 5xx Error Rate") in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: `docker compose logs --tail=500 api | grep -E ' 5[0-9]{2} '`;
  correlate deploy time with error onset; check Postgres/Valkey/Garage reachability.
- Contain: if onset matches a deploy, roll back per §6; otherwise shed load
  (Caddy rate limits) and restart unhealthy dependencies. Escalate to
  `rollback_authority` if the rate does not fall within 15 minutes.
- Clear: 5xx share back under 1% for 15m (operator-defined clearing bar, stricter than the 5% fire threshold).

### P95LatencyThresholdExceeded (warning)

- PromQL: `histogram_quantile(0.95, sum(rate(acres_http_request_duration_seconds_bucket{job="acres-api"}[5m])) by (le)) > 0.5` for 5m.
- Dashboard: Panel 7 ("HTTP Request Latency Percentiles") alongside Panels 23/24 (API/Worker pool acquisition latency) and Panels 25/26 (API/Worker query execution latency) in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: `node scripts/ops/verify-capacity-load.js --synthetic` for the SLO
  baseline; inspect route patterns, slow-query evidence, dependency health,
  and in-flight HTTP requests. Inspect API pool
  `acres_postgres_pool_connections_total`,
  `acres_postgres_pool_connections_idle`,
  `acres_postgres_pool_connections_max`, and
  `acres_postgres_pool_requests_waiting` alongside PostgreSQL evidence before
  attributing latency to connection pressure. Check API pool acquisition
  latency percentiles (`acres_postgres_pool_acquisition_duration_seconds{job="acres-api"}`):
  elevated p95/p99 latency (e.g. > 50ms) confirms connection checkout queueing
  in `pg.Pool`, whereas low acquisition latency (< 1ms) isolates delay to
  query execution or downstream processing. Inspect API and Worker SQL query
  execution latency percentiles (`acres_database_query_duration_seconds`):
  elevated query latency (e.g. p95 > 100ms) confirms slow database execution or
  unindexed scans, while low query latency points to application compute or
  external service delays. Waiting above zero shows local
  acquisition backlog; total equaling max alone does not prove saturation.
  Compare worker pool backlog and acquisition latency, sampled lock waits, and oldest transaction age;
  use the database procedure below to confirm blockers before assigning cause.
- Contain: address the observed bottleneck within the approved host profile;
  use existing rollback authority if onset matches a deployment. Escalate to on-call SRE
  if p95 exceeds 2s or availability SLO is threatened.
- Clear: p95 back under 500ms for 15m (operator-defined; matches the fire threshold).

### High429Rate (warning)

- PromQL: `(sum(rate(acres_http_429_responses_total{job="acres-api"}[5m])) / clamp_min(sum(rate(acres_http_requests_total{job="acres-api"}[5m])), 0.001)) * 100 > 10` for 5m.
  The numerator counts HTTP 429 responses only. Treat it as a rate-limit
  spike / possible credential-stuffing or DoS signal; confirm the route and
  client context in access logs before acting.
- Dashboard: Panel 28 ("API HTTP 429 Rate Percentage") in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: inspect Panel 28 in Grafana (`API HTTP 429 Rate Percentage`) for the rate trend; inspect top offending IPs/routes in Caddy access logs; check whether the
  spike is one client (abuse) or broad (misconfigured client release).
- Contain: block abusive IPs at Caddy, tighten Throttler windows, rotate
  exposed credentials if stuffing is suspected. Escalate to security lead on
  confirmed credential-stuffing patterns. See also the DoS drill:
  `bash scripts/ops/run-dos-resilience-drill.sh --dry-run`.
- Clear: 429 share back under 2% for 15m with no single-IP dominance (operator-defined clearing bar).

### QueueDeadLettersDetected (warning)

- PromQL: `sum(acres_queue_jobs_total{job="acres-worker",status="failed"}) > 0` for 1m.
- Dashboard: Panel 4 ("Queue Dead Letters") in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: list dead-letter jobs in Valkey/BullMQ; inspect worker logs for the
  failing handler and payload class.
- Contain: pause the failing queue, fix or quarantine the poison payload,
  replay dead letters after the fix. Escalate to owning backend engineer if
  dead letters grow while paused.
- Clear: dead-letter count back to 0 and worker lag nominal for 15m (operator-defined).

### OutboxDeliveryLag (warning)

- PromQL: `acres_outbox_pending_events{job="acres-api"} > 50` for 10m.
- Dashboard: Panel 3 ("Pending Outbox Events") in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: check worker liveness and queue depth; look for stuck outbox
  dispatcher transactions or down downstream sinks.
- Contain: restart the worker, clear the blocking event (quarantine, never
  delete without a record), replay. Escalate to on-call SRE past 60 minutes
  of lag.
- Clear: pending events back under 10 for 15m (operator-defined clearing bar, stricter than the 50-event fire threshold).

### HighHttpConcurrency (warning)

- PromQL: `acres_http_active_requests{job="acres-api"} > 40` for 2m — more than 40 API HTTP
  requests in flight; this gauge does not measure database pool occupancy.
- Dashboard: Panel 27 ("API In-Flight Active HTTP Requests") in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: inspect Panel 27 in Grafana (`API In-Flight Active HTTP Requests`) for in-flight request load; inspect route patterns, p95 latency, 5xx,
  and dependency health. Check the API pool connection and waiting gauges
  named in the latency runbook alongside PostgreSQL evidence before
  attributing cause. Compare the separate `acres-worker` pool total, idle, max,
  and waiting panels and `up{job="acres-worker"}` before assigning a pool
  incident to the API. These gauges omit the migrator and other clients,
  server-wide limits, lock waits, and query performance.
  Compare the lock-wait and transaction-age panels with API/worker pool backlog
  and HTTP latency. Confirm current blockers with the database procedure below;
  a zero sampled count can miss a brief lock incident.
- Contain: address the observed cause and follow existing rollback authority
  if a deployment caused it. Escalate to on-call SRE if concurrency persists
  with degraded latency or availability.
- Clear: active requests back under 30 for 15m (operator-defined clearing bar,
  under the 40-request fire threshold).

### DatabaseConnectionPoolSaturation (warning)

- PromQL: `acres_postgres_pool_requests_waiting{job="acres-api"} > 0` for 1m — requests queued waiting for an available PostgreSQL client from the API `pg.Pool`.
- Dashboard: Panels 9/10 (API pool connections & backlog), Panel 23 (API pool acquisition latency), and Panel 25 (API query execution latency) in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: Check API pool connection gauges in Panels 9 and 10 (`acres_postgres_pool_connections_total`, `acres_postgres_pool_connections_idle`, `acres_postgres_pool_connections_max`, and `acres_postgres_pool_requests_waiting`). Inspect API pool acquisition latency in Panel 23 (`acres_postgres_pool_acquisition_duration_seconds{job="acres-api"}`) and API query execution latency in Panel 25 (`acres_database_query_duration_seconds{job="acres-api"}`).
  - If acquisition latency is elevated (p95 > 50ms) with low query latency (p95 < 25ms), concurrent API request volume has exceeded pool connection capacity (`max`); incoming queries are starved for connection checkout.
  - If query execution latency is elevated (p95 > 100ms), slow database queries or table scans are holding connections open for extended durations.
  - Inspect PostgreSQL server connections and lock panels (Panels 19–22). If lock waits in Panel 21 (`pg_stat_activity_count{wait_event_type="Lock"}`) or transaction age in Panel 22 (`pg_stat_activity_max_tx_duration`) are elevated, run the read-only PostgreSQL diagnosis procedure below to identify blocking PIDs.
  - Check worker pool state (Panels 12, 13, 24, 26) to determine whether worker background tasks are causing cross-process PostgreSQL connection contention.
- Contain:
  - If lock contention or long-running transactions are identified, terminate blocking backend PIDs per the diagnostic procedure below.
  - If caused by a sudden traffic burst, apply Caddy edge rate limits to shed non-critical traffic and allow the pool queue to drain.
  - If pool saturation is sustained under normal legitimate traffic, evaluate increasing `ACRES_DB_MAX_CONNECTIONS` within PostgreSQL server `max_connections` limits.
  - Escalate to `rollback_authority` if saturation onset correlates with a recent application release.
- Clear: `acres_postgres_pool_requests_waiting{job="acres-api"} == 0` for 5m.

### PostgreSQL lock and transaction diagnosis

Use an approved operator SQL console connected to `acres`. Confirm
`up{job="acres-postgres"} == 1`, `pg_up{job="acres-postgres"} == 1`, and
`pg_exporter_last_scrape_error{job="acres-postgres"} == 0` before interpreting
the panels. Run this read-only PostgreSQL 18 query. Its two result sets are
bounded to 50 rows each and its transaction has a two-second statement timeout.

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '2s';
SELECT pid, state, wait_event_type, wait_event,
       round(EXTRACT(EPOCH FROM clock_timestamp() - xact_start)::numeric, 1) AS transaction_age_seconds,
       pg_blocking_pids(pid) AS blocking_pids
FROM pg_stat_activity
WHERE datname = 'acres' AND pid <> pg_backend_pid() AND wait_event_type = 'Lock'
ORDER BY xact_start NULLS LAST, pid
LIMIT 50;
SELECT pid, state, wait_event_type, wait_event,
       round(EXTRACT(EPOCH FROM clock_timestamp() - xact_start)::numeric, 1) AS transaction_age_seconds,
       pg_blocking_pids(pid) AS blocking_pids
FROM pg_stat_activity
WHERE datname = 'acres' AND pid <> pg_backend_pid() AND xact_start IS NOT NULL
ORDER BY xact_start, pid
LIMIT 50;
COMMIT;
```

The first result shows current lock waiters; `pg_blocking_pids` identifies
blocking backends and can include PIDs outside the filtered result. The second
shows old transactions, including idle transactions. The dashboard counts
current waiters at 30-second scrapes and can miss short waits. Transaction age
is `now() - xact_start`, not query runtime or wait duration. Correlate these
results with API and worker pool waiting gauges and HTTP latency before
attributing cause. A production cancellation or termination requires a separate
operator decision. `pg_monitor` can read SQL text from `pg_stat_activity`;
restrict console and output access even though this query selects no SQL text,
parameters, credentials, or product user/tenant identifiers.

## 6. Emergency Rollback & Disaster Recovery

1. `rollback_authority` declares the rollback; `deployment_approver` concurs.
2. Rehearse first when time permits: `bash scripts/ops/run-deployment-drill.sh --dry-run`.
3. Repoint Caddy to the last pinned, provenance-attested image (additive
   migrations only — never roll back across a destructive migration).
4. Verify `/health`, the Caddy routes (`node scripts/ops/verify-caddy-routing.js`),
   and the clearing condition of the firing alert (§5).
5. Full data loss: restore via `scripts/ops/restore-postgres.sh <backup.dump>`
   into an isolated target, verify parity with
   `bash scripts/ops/run-restore-drill.sh`, reconcile objects with
   `node scripts/ops/reconcile-storage-objects.js`, then promote.

## 7. Formal Pre-Launch Sign-off Matrix

| # | category | verifier command | approved by | signature / date |
| --- | --- | --- | --- | --- |
| 1 | production_domain_tls | `node scripts/ops/verify-caddy-routing.js` | ops-lead | |
| 2 | smtp_delivery | provider delivery receipt + DNS check | ops-lead | |
| 3 | secrets_management | `bash scripts/ops/run-secret-rotation-drill.sh --dry-run` | security-lead | |
| 4 | secret_references | `scripts/ops/scan-secrets.sh` | security-lead | |
| 5 | slo_and_alerting | `bash scripts/ops/run-capacity-alerting-drill.sh` | sre-lead | |
| 6 | backup_and_disaster_recovery | `bash scripts/ops/run-restore-drill.sh` | sre-lead | |
| 7 | data_retention_policy | policy review sign-off | legal-lead | |
| 8 | volume_encryption | `node scripts/ops/verify-volume-encryption.js` | security-lead | |
| 9 | graphql_introspection | production probe transcript | security-lead | |
| 10 | deployment_and_rollback | `bash scripts/ops/run-deployment-drill.sh --dry-run` | release-manager | |
| 11 | optional_ai_posture | `node scripts/ops/check-launch-readiness.js <record>` | product-and-security-lead | |

Launch is approved only when all 11 rows are signed, the unified dossier
(`backups/launch-evidence-dossier-<timestamp>.json`) reports `PASSED`, and
`node scripts/ops/check-launch-readiness.js <operator-readiness.json>` exits 0.
Category 5 (`slo_and_alerting`) approval requires operator confirmation of all
11 operational alert rules, availability target ≥ 99.9%, HTTP p95 latency ≤ 500ms,
throughput ≥ 100 RPS, database connection pool acquisition p95 latency ceiling ≤ 50ms,
database query execution p95 latency ceiling ≤ 100ms, and verified database baseline
telemetry evidence (`summary.databaseBaselineCompliance: "passed"`).
