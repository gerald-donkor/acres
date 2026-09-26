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

- Drill/verify: `node scripts/ops/verify-caddy-routing.js <materialized-production-Caddyfile> --allow-hsts --output backups/caddy-routing-evidence-<timestamp>.json`, `scripts/ops/check-production-templates.sh`
- Evidence: `backups/caddy-routing-evidence-<timestamp>.json`, DNS A/AAAA record printout, Caddyfile HSTS approval
- Accept: real (non-localhost) domain, valid TLS contact email, `hsts_approved: true`, boolean `custom_certificates` flag
- An approved record must reference a concrete, successful Caddy routing
  child JSON report in `evidence`. A custom path is accepted by report content,
  not name alone. Its ISO UTC timestamp must be real and no later than validation
  time. Every referenced report must have
  `drill_type: "caddy_routing_and_tls_verification"`, `status: "success"`,
  `valid: true`, an empty `errors` array, `hstsApproved: true`,
  `securityHeadersVerified: true`,
  `s3SigV4HostPreserved: true`, `proxyHeadersVerified: true`, at least 12
  evaluated routes, `routesPassed === routesEvaluated`, and an `evaluatedRoutes`
  array of the same length with every route's `passed` field true. A failed or
  malformed report blocks even alongside a valid one. The unified dossier
  alone, prose, and declarations without child evidence are insufficient.
  The report domain must match the approved domain, and the report must name a
  Caddyfile other than `Caddyfile.example`. The default Stage 3 dry-run report
  verifies the template and cannot support production domain approval. Its
  `hstsApproved` requires active HSTS with a concrete positive `max-age` in
  the parsed file and the explicit `--allow-hsts` flag. Operator approval
  remains the separate `hsts_approved`
  declaration and Caddyfile evidence.
- Fail-closed validator enforcement (`scripts/ops/check-launch-readiness.js`):
  - Requires at least one concrete, successful Caddy routing child report in `evidence` for approved status;
  - Requires `domain` to be a valid FQDN (rejects localhost, 127.0.0.1, IPv4/IPv6, protocols, URIs, ports, paths, or placeholders);
  - Requires `tls_contact_email` to be a valid non-placeholder email address;
  - Requires `hsts_approved === true`;
  - Requires `custom_certificates` to be an explicit boolean (`true` or `false`);
  - Rejects any malformed, future, or failed child report.

**Prompt 205 Category 1 intake — 2026-09-26T20:23:52Z UTC.** Reviewed
`dd1c933` on `main`. The repository contains only
`infra/caddy/Caddyfile.example` and the unresolved
`infra/launch/readiness.example.json`; no materialized production Caddyfile or
Category 1 child report was available for this assessment. The schema test
passed (1/1). The example readiness validator exited 1 as designed: 0 of 11
categories approved, 11 blocked, 70 blockers. This is a repository assessment,
not a claim about an operator's restricted evidence store. Category 1 remains
**unresolved**; no Caddy verifier, public DNS, certificate, live HTTPS, or
production readiness-record check was run against a real target.

The ops lead must provide the selected FQDN, TLS contact, certificate mode,
materialized Caddyfile path, public DNS and certificate evidence, observed live
HTTPS headers, a dated HSTS decision with `max-age`, restricted evidence-store
reference, and named Category 1 signer through the approved operator channel.
Use opaque evidence references; do not place private keys, credentials, or raw
host inventories in the repository. Read-only target access must be identified
before live checks. HSTS activation requires a separate approved change window.
Repository checks: `ops:templates`, lint, typecheck, and `git diff --check`
passed. `ops:check` stopped at `ops:audit` because DNS resolution of
`registry.npmjs.org` returned `EAI_AGAIN`; this is not an audit pass.
`npm run build` failed in Next's TypeScript `--showConfig` parser, while the
direct `tsc --showConfig` output parsed as JSON. Neither failure supplies
production evidence or changes the unresolved Category 1 decision.

### 2. SMTP Delivery (`smtp_delivery`)

- Drill/verify: test delivery via the configured provider, DKIM/SPF/DMARC DNS checks
- Evidence: a redacted `smtp-delivery-evidence-<timestamp>.json` child report referencing the provider delivery receipt and DNS record printouts
- Accept: provider, host, valid port, `from_address`, credentials secret
  reference, delivery policy, bounce/abuse handling procedure, explicit STARTTLS
  or TLS mode. The credential reference must match `secret_references.smtp_secret_source`.
- An approved record must reference a concrete SMTP child JSON report in
  `evidence`. The report requires `drill_type: "smtp_delivery_verification"`,
  a real nonfuture ISO UTC `timestamp`, `status: "success"`, provider/host/port/
  TLS mode/sender matching the readiness record, and `errors: []`. Its
  `delivery` object requires `status: "delivered"`, an opaque nonempty
  `receipt_id`, and a real nonfuture UTC timestamp. Its `dns` object requires
  a real nonfuture UTC `checked_at` and `spf`, `dkim`, and `dmarc` entries,
  each with `passed: true` and a nonempty printout reference in `record`.
  Every referenced child, including wildcard matches, must pass; prose or a
  dossier alone cannot support approval. Validate the operator record with
  `node scripts/ops/check-launch-readiness.js <operator-readiness.json>`.
  Operators must obtain the delivery receipt and DNS printouts from the live
  provider and public DNS. This validator checks the report's consistency;
  it cannot authenticate a hand-authored report or conduct a live mail test.

**Prompt 206 Category 2 intake — 2026-09-26T20:35:04Z UTC.** Reviewed
`8c3bb6c` on `main`. The repository-visible SMTP material is the unresolved
`infra/launch/readiness.example.json` and validator fixtures; no materialized
production readiness record or SMTP delivery child report was available for
this assessment. This does not establish whether an operator's restricted
evidence store contains either. Category 2 remains **unresolved**. No provider
receipt, controlled-recipient delivery event, public SPF/DKIM/DMARC printout,
message authentication result, runtime configuration, delivery/bounce policy,
or dated ops-lead sign-off was supplied for independent inspection. No live
mail was sent and no DNS or provider configuration was changed.

The **ops lead** must identify the production provider and relay host, port,
transport mode, sender/domain, controlled test recipient, delivery policy,
bounce/abuse procedure, restricted evidence-store location, and named signer
through the approved operator channel. Supply opaque references to a real
delivered receipt, its authentication result, dated SPF/DKIM/DMARC printouts,
the indirect credential source matching `secret_references.smtp_secret_source`,
and dated Category 2 approval. Read-only inspection of those sources is the
next safe action. A new test delivery requires separate authorization naming
the provider, sender, recipient, operator, purpose, and time window. Category
4 can remain unresolved during Category 2 inspection, but the SMTP reference
must match across the two sections. Category 1 and all other launch gates
retain their prior unresolved state.

Repository checks for this intake: `ops:readiness-schema-test` passed (1/1),
`ops:templates` passed, lint and typecheck exited 0, and `git diff --check`
exited 0. The example readiness validator exited 1 as designed: 0 of 11
categories approved, 11 blocked, 70 blockers, including eight Category 2
blockers. `ops:check` stopped at `ops:audit` because DNS lookup of
`registry.npmjs.org` returned `EAI_AGAIN`; the earlier template, image,
secret/default and Docker checks passed. `npm run build` failed during the
client Next 16.3.4 build with `Could not parse output from TypeScript's
--showConfig`. Neither failed check supplies or invalidates live SMTP proof.

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

**Prompt 207 Category 3 intake — 2026-09-26T20:41:49Z UTC.** Reviewed
`f2f0e1b` on `main`. The repository-visible secrets management material is the
unresolved `infra/launch/readiness.example.json`, rotation drill scripts, and
validator test fixtures; no materialized production readiness record or
secret-rotation child report was available for this assessment. This does not
establish whether an operator's restricted evidence store contains either.
Category 3 remains **unresolved**. No runtime injection inventory, log masking
policy, rotation cadence decision (≤90 days), compromise response runbook, or
dated security-lead sign-off was supplied for independent inspection. No live
credential rotation was executed and no production configuration was mutated.
Stage 5 of the unified launch drill explicitly forces `--dry-run`; simulation
or drill artifacts alone do not prove live credential rotation.

The **security lead** must identify through the approved operator channel the
designated production target, restricted evidence-store location, runtime
injection mechanism (Vault, AWS Secrets Manager, Infisical, or protected host
env), masking/logging policy, approved rotation cadence (positive integer ≤ 90
days), compromise-response runbook with named owner, seven-class rotation
procedure (`session_secret`, `csrf_secret`, `postgres_passwords`,
`valkey_password`, `storage_s3_keys`, `smtp_credentials`,
`grafana_admin_password`), and named security-lead approver. Supply opaque
references to the injector/audit records, previous live rotation evidence
verifying the seven steps (`session_rollover`, `csrf_rollover`,
`database_rotation`, `valkey_rotation`, `storage_rotation`,
`compromise_response`, `redaction_audit`) and redaction flags
(`raw_secrets_masked: true`, `zero_dev_passwords_detected: true`), and dated
Category 3 approval. Read-only inspection of those safe sources is the next
safe action. Any live credential rotation requires separate authorization naming
the production target, secret class, operator, maintenance window,
fallback/rollback procedure, and observer. Category 4 (`secret_references`) can
remain unresolved during Category 3 inspection, but injection mechanisms and
sources must align across both sections. Categories 1, 2, and all other launch
gates retain their prior unresolved state.

Repository checks for this intake: `ops:readiness-schema-test` passed (8/8),
`ops:templates` passed, `ops:check` passed all 14 sub-suites (22 template/env
tests, `ops:scan-secrets`, `ops:docker-runtime`, `ops:audit` with 0 critical
vulnerabilities, schema test, 44 readiness validator tests, SAST gate with 0
blockers/expired suppressions, 14 container security tests, 10 SAST tests, 14
supply chain tests, 12 volume encryption tests, 14 secret rotation tests, 13
capacity alerting tests, 14 DR tests, 13 launch drill tests), `npm run lint`
passed across all workspaces, `npm run typecheck` passed, `npm run build`
passed (including client Next 16.3.4 and server Nest), and `git diff --check`
exited 0. The example readiness validator exited 1 as designed: 0 of 11
categories approved, 11 blocked, 70 blockers, including five Category 3
blockers (`injection_mechanism`, `masking_policy`, `compromise_response_plan`,
unresolved section status, empty evidence array).

### 4. Secret References (`secret_references`)

- Drill/verify: `scripts/ops/scan-secrets.sh`
- Evidence: a redacted `secret-reference-policy-<timestamp>.json` child report
- Accept: all of `session`, `csrf`, `db_migrator`, `db_app`, `valkey`,
  `garage_rpc`, `garage_admin`, `garage_metrics`, `garage_s3`, `smtp`,
  `grafana_admin`, `db_monitor` present as store references; zero plaintext credentials;
  no AI/Gemini secret source (contradicts the no-AI posture)
- An approved record must reference a concrete JSON report with
  `drill_type: "secret_reference_policy_verification"`, a real nonfuture ISO UTC
  `timestamp`, `status: "success"`, `errors: []`, and a nonempty opaque
  `policy_reference`. Its `references` object must have exactly the twelve
  source-field names in `REQUIRED_SECRET_KEYS`; each entry must contain only
  `source` (exactly matching the approved indirect reference),
  `access_verified: true`, and `plaintext_exposed: false`. Approved sources
  use `vault:path#key`, `aws-sm:name`, `env:NAME`, or `file:/absolute/path` and
  are distinct for each required field.
  Prose, a dossier, or a filename alone cannot qualify. Every referenced JSON
  file, including wildcard matches, must be a valid child report. Validate
  with `node scripts/ops/check-launch-readiness.js <operator-readiness.json>`.
  The operator obtains and redacts the live secret-store policy printout; the
  validator checks internal consistency and cannot authenticate a hand-authored
  report or prove live least-privilege access.

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
- Evidence: a redacted `retention-policy-review-<timestamp>.json` child report
- Accept: explicit windows for accounts, audit events, upload quarantine (7d),
  rejected objects (1d), exports (30d), reports, telemetry (15d), backups (30d)
- An approved record must reference a concrete JSON report with
  `drill_type: "data_retention_policy_verification"`, a real nonfuture ISO UTC
  `timestamp`, `status: "success"`, `errors: []`, a nonempty opaque
  `policy_reference`, `scheduled_cleanup_verified: true`, and `retention_windows`
  as an object keyed by all eight exact policy fields in `REQUIRED_RETENTION_KEYS`.
  Each entry must contain `window` (matching the approved readiness value) and
  `policy_verified: true`.
  Approved readiness values enforce fixed policy windows:
  `upload_quarantine_retention_policy: "7d"`,
  `rejected_object_retention_policy: "1d"`,
  `export_retention_policy: "30d"`,
  `telemetry_retention_policy: "15d"`,
  `backup_retention_policy: "30d"`,
  positive day windows (`^\d+d$`) for `audit_retention_policy`,
  and `indefinite_until_tenant_deletion` or positive day duration for `account_retention_policy` and `report_retention_policy`.
  Prose alone, a dossier alone, or a malformed/failed report cannot qualify, even beside
  a valid one or in a wildcard expansion. Validate with
  `node scripts/ops/check-launch-readiness.js <operator-readiness.json>`.
  The operator conducts the formal legal and operational policy review; the validator
  checks internal consistency, window compliance, and child report validity.

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
- Evidence: a redacted `graphql-introspection-probe-<timestamp>.json` child report
- Accept: `production_introspection_enabled` boolean; enabling it in
  production requires a written security justification
- An approved record must reference a concrete JSON report with
  `drill_type: "graphql_introspection_probe"`, a real nonfuture ISO UTC
  `timestamp`, `status: "success"`, `errors: []`, a valid `endpoint`
  (`/graphql` or absolute HTTPS URL to `/graphql`),
  `production_introspection_enabled` strictly matching the approved readiness value,
  and a `probe_result` object containing exactly `status_code` (positive integer),
  `introspection_permitted` (matching `production_introspection_enabled`),
  `schema_exposed` (`false` when disabled, `true` when enabled), and non-empty
  `response_summary`.
  If `production_introspection_enabled: true`, the approved record requires a non-empty
  `justification` string without unresolved placeholders.
  Prose alone, a dossier alone, or a malformed/failed report cannot qualify, even beside
  a valid child or in a wildcard expansion. Validate with
  `node scripts/ops/check-launch-readiness.js <operator-readiness.json>`.
  The operator conducts the live route probe against the production ingress; the validator
  checks internal consistency, policy adherence, and child report validity.

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
- Evidence: reference a concrete no-AI production posture child JSON report in
  `evidence`, with redacted API and worker runtime inventories, no-AI journey
  test run references, and a production provider policy reference. The child has
  exactly these top-level fields:
  - `drill_type: "no_ai_production_posture_verification"`, real nonfuture ISO UTC
    `timestamp`, `status: "success"`, `errors: []`, `environment: "production"`;
  - `runtime.api` and `runtime.worker`, each containing exactly
    `ai_draft_enabled: false`, `gemini_api_key_present: false`, and a nonempty
    `inventory_reference` to a redacted live runtime inventory;
  - `journeys.analytics_dashboard`, `journeys.governed_report`, and
    `journeys.export_download`, each containing exactly `passed: true` and a
    nonempty `test_reference` to the corresponding production no-AI run;
  - `unpaid_provider_excluded: true` and a nonempty
    `provider_policy_reference`.
- Accept: `ai_enabled: false`, `no_ai_path_verified: true`,
  `server_ai_draft_enabled_false: true`, `no_gemini_api_key_provisioned: true`,
  `unpaid_provider_excluded: true`, non-empty `phase11_status`, and all referenced
  Category 11 JSON reports passing the child contract. A custom path is valid;
  prose, a unified dossier alone, missing reports, and failed wildcard matches
  do not qualify. The validator checks report consistency only. The operator
  must inspect the referenced production API and worker inventories, verify
  absence of `GEMINI_API_KEY` without exposing values, run the deterministic
  journeys, and review the provider policy before approval.

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

**Targeted drill invocation (prompt 202):** In a separately approved drill window,
use `bash scripts/ops/run-launch-drills.sh --caddyfile <materialized-Caddyfile>
--compose-file <materialized-compose> --allow-hsts --target-url
<approved-benchmark-URL> --api-url <approved-API-origin>
--database-telemetry-file <fresh-Prometheus-evidence.json> --evidence-dir
<restricted-directory>`. The API URL must be an origin; both URLs must be HTTP(S)
without userinfo, query, or fragment. `--dry-run` conflicts with live URL and
telemetry arguments. A no-target run remains a default drill and cannot produce
production-candidate Stage 6 evidence. `environment` remains `"drill"` in every
dossier; `targets.mode` is `offline`, `default-drill`, or `live-target-drill`.
`targets` stores SHA-256 identifiers for the selected files and URLs, without
raw URL credentials or query strings. Stage 3 requires both child reports to
bind to the same Caddyfile and selected Compose file, at least 12 passing routes,
and, for targeted evidence, approved active HSTS, a non-example domain matching
the benchmark URL host, and live API probes returning the Acres liveness and
database/storage readiness envelopes for the selected API origin. Stage 6 requires live capacity
mode and matching target identifiers. The supplied telemetry JSON must state
`source: "prometheus-live-scrape"`, `probeHealthy: true`, a fresh ISO
`timestamp`, and a matching `targetId` (SHA-256 of the normalized benchmark
URL). Calculate that identifier with `node -e 'const {safeUrl,targetId}=
require("./scripts/ops/launch-target-evidence"); console.log(targetId(safeUrl(
process.argv[1])))' '<approved-benchmark-URL>'`. It must include
`postgresExporter.up/lastScrapeError`,
`postgresServer.pgUp/maxConnections/activeConnections`, API and worker
`connectionPool` totals/idle/max/requestsWaiting,
`poolAcquisitionLatency` and `queryExecutionDuration` p50Ms/p95Ms/p99Ms for
both roles, and `serverActivity.lockWaits/maxTransactionDurationSec`.
The file is capped at 64 KiB. Missing, stale, mismatched, nonfinite, or breached
telemetry fails Stage 6. Alert rule simulation remains simulation; operator
verification of alert delivery, live TLS, promotion/rollback, and sign-off is
separate. A 7/7 drill dossier alone cannot approve production.

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

## 6A. Production evidence preflight gap register — 2026-09-26

Assessment: 2026-09-26T19:39:25Z UTC; reviewed source commit `3da8949` on
`main`. This is a repository-visible assessment only. No operator-controlled
production record, live source, restricted evidence store, or approver decision
was inspected. The checked-in example is a template, not an operator record.
`node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`
exited 1 as designed: **11 required, 0 approved, 11 unresolved, 70 blockers**.
Every category below retains launch status **unresolved**. "Available but
unverified" refers only to repository scripts, templates, or policy text; it
does not describe a live production condition. The missing production evidence
is classified **missing** from the repository assessment, not asserted absent
from an operator's private store.

| category | repository-visible state and missing operator decision/value | required child artifact and independently checked live source | supplier / approver; next safe action |
| --- | --- | --- | --- |
| `production_domain_tls` | Available but unverified: Caddy example and verifier. Missing: selected FQDN, TLS contact, certificate mode, HSTS decision, approval. Unresolved. | Successful Caddy routing child JSON; inspect materialized Caddyfile, public DNS, issued certificate and live HTTPS headers. A template Stage 3 report is insufficient. | Ops lead; identify the approved target and provide redacted DNS/TLS and HSTS decision references for read-only inspection. |
| `smtp_delivery` | Available but unverified: readiness contract. Missing: provider, host/port/TLS mode, sender, indirect SMTP secret reference, delivery and bounce policies, approval. Unresolved. | SMTP delivery child JSON; independently inspect provider delivery receipt and public SPF/DKIM/DMARC printouts. | Ops lead; provide opaque provider and policy references and authorize a later test delivery separately. |
| `secrets_management` | Available but unverified: scan and rotation drill code. Missing: runtime injection mechanism, masking policy, cadence decision (≤90 days), compromise runbook, approval. Unresolved. | Successful secret rotation child JSON for seven classes and steps; inspect live injector policy, redacted audit, and separately authorized live rotation evidence. Stage 5 is dry-run only. | Security lead; provide policy and redacted injector/audit references for read-only inspection; arrange separate rotation authority. |
| `secret_references` | Available but unverified: twelve-field validator. Missing: twelve distinct indirect references for session, CSRF, DB migrator/app/monitor, Valkey, Garage RPC/admin/metrics/S3, SMTP, Grafana; approval. Unresolved. | Secret-reference-policy child JSON; inspect redacted live store access policies and runtime injection inventory, never secret values. | Security lead; supply opaque store-reference identifiers and policy evidence. |
| `slo_and_alerting` | Available but unverified: eleven alert rules, dashboards and threshold contract. Missing: operator adoption of ≥99.9% availability, ≤500 ms HTTP p95, ≥100 RPS, ≤50 ms DB acquisition p95, ≤100 ms DB query p95, recipients, escalation, alert delivery and approval. Unresolved. | Successful capacity-alerting child JSON with fresh target-bound Prometheus database telemetry; inspect live scrape/benchmark results, alert routes, delivery receipts and all eleven rules. Synthetic checks do not prove capacity. | SRE lead and on-call team; provide target/telemetry and routing references, then authorize any live load or DoS exercise separately. |
| `backup_and_disaster_recovery` | Available but unverified: restore/reconciliation scripts and example one-hour/four-hour objectives. Missing: approved RPO ≤1h, RTO ≤4h, UTC schedule, encrypted off-host destination, isolated target, completed restore/reconciliation and approval. Unresolved. | Successful restore and object-reconciliation child JSON reports; independently inspect actual backup completion/freshness, encrypted transfer, PostgreSQL/Garage coverage, isolated restore parity and object inventory. | SRE lead; provide redacted backup and isolated-target references; authorize restore operation separately. |
| `data_retention_policy` | Available but unverified: fixed example windows (7d quarantine, 1d rejected objects, 30d exports/backups, 15d telemetry). Missing: approved account, audit and report windows, scheduled cleanup verification, legal approval. Unresolved. | Retention-policy-review child JSON; inspect signed policy and live cleanup schedule/results for all eight fields. | Legal lead with operations; provide opaque policy and cleanup evidence references. |
| `volume_encryption` | Available but unverified: mount verifier. Missing: selected LUKS2/CMEK-class mechanism, three encrypted mount paths, key separation, key-recovery owner and approval. Unresolved. | Successful volume-encryption child JSON; inspect live PostgreSQL, Valkey and Garage mount encryption plus separated key custody and recovery procedure. | Security lead and key-recovery owner; provide redacted mount and custody references for read-only inspection. |
| `graphql_introspection` | Available but unverified: example says disabled. Missing: operator production policy decision, live route result and approval. Unresolved. | GraphQL-introspection-probe child JSON; independently probe the designated production `/graphql` ingress and inspect response without exposing schema data. | Security lead; provide policy reference and authorize a read-only route probe. |
| `deployment_and_rollback` | Available but unverified: deployment drill and image checks. Missing: host profile, registry, deployment approver, rollback authority, provenance policy, reviewed 40-hex source commit, immutable current/previous client/server image pairs, provenance artifacts, live drill and approval. Unresolved. | Successful deployment child JSON and distinct client/server provenance evidence; inspect registry manifests, signatures, materialized Compose, release preflight, live promotion and rollback observations. | Release manager, deployment approver and rollback authority; provide opaque release/provenance references and approve any live change in a later window. |
| `optional_ai_posture` | Available but unverified: example declares AI disabled and Phase 11A excluded. Missing: verified API/worker `AI_DRAFT_ENABLED=false`, absent `GEMINI_API_KEY`, unpaid-provider exclusion, three deterministic journeys and product/security approval. Unresolved. | No-AI production posture child JSON; inspect redacted live API/worker inventories, provider policy and analytics dashboard, governed report and export download run results. | Product and security leads; provide opaque inventory, policy and journey-run references. |

### Shared prerequisites and stage binding

- **Materialized Caddyfile and Compose file, approved domain/HSTS and host** block
  Categories 1 and 10 and Stage 3 (`ingress_deployment`). Stage 3's routing
  and deployment children must bind to the selected files and live API origin.
- **Approved benchmark URL and API origin, fresh target-bound Prometheus
  telemetry, on-call routing** block Category 5 and Stage 6
  (`capacity_alerting`). The API URL is an origin. Stage 6 requires live
  target IDs, scrape health and database baseline; its alert simulations do
  not prove delivery. Live load and DoS need separate authorization.
- **Isolated restore target, current encrypted off-host backups, and object
  inventory** block Category 6 and Stage 7 (`disaster_recovery`). The restore
  and reconciliation tools require reachable drill infrastructure even when
  invoked with `--dry-run`.
- **Immutable current/previous client and server image pairs, source commit,
  signatures, provenance policy, and restricted evidence store** block
  Category 10 and Stage 3. Runtime secret-store references block Categories 2,
  3 and 4. Key-recovery custody blocks Category 8. Named deployment approver,
  rollback authority, maintenance window and live-action approval block a
  production promotion/rollback. Legal, SRE, security, ops and product/security
  sign-off authorities remain required for their matrix rows below.
- **Stage 5 (`secret_rotation`) runs with `--dry-run` even in a targeted
  seven-stage drill.** Its report cannot establish a live rotation. The
  operator must verify separate authorized rotation and compromise evidence
  before Category 3 approval. A 7/7 dossier is drill evidence, not human
  sign-off or proof of production promotion.

### Operator handoff

For prompt 201, request only the named role or team for each row, opaque
references to the operator-controlled records and restricted evidence store,
and read-only access to inspect those records and live sources. Request the
selected target identifiers through an approved operator channel, without
placing private hosts or credentials in chat or git. Do not send passwords,
tokens, connection strings, raw inventories, key material, or unredacted
reports. Separate authorizations must name the exact target, action, authority
and window for any live benchmark/DoS, SMTP test, restore, HSTS activation,
deployment, rollback, or secret rotation. No such authorization or target has
been supplied by this preflight.

**Parameterized targeted drill example — NOT EXECUTED:** flags checked against
`scripts/ops/run-launch-drills.sh`; use only after the above target and
live-action approvals.

```bash
bash scripts/ops/run-launch-drills.sh \
  --caddyfile <materialized-production-Caddyfile> \
  --compose-file <materialized-production-Compose-file> \
  --allow-hsts \
  --target-url <approved-benchmark-URL> \
  --api-url <approved-API-origin> \
  --database-telemetry-file <fresh-target-bound-Prometheus-evidence.json> \
  --evidence-dir <restricted-evidence-directory>
```

The template's `$schema` now resolves to `infra/launch/readiness.schema.json`.
The Draft 7 schema describes all eleven sections, twelve secret-source fields,
eight retention-policy fields, and the nested release record. It accepts the
unresolved template and rejects missing, misspelled, extra, or wrongly typed
fields. New record fields require a schema revision. Run
`npm run ops:readiness-schema-test` for this structural check. It does not
approve a launch: `node scripts/ops/check-launch-readiness.js
infra/launch/readiness.example.json` still fails closed. That validator owns
placeholder and secret scans, evidence content and target binding, clocks,
cross-category consistency, image environment checks, and approval gates;
operators own authentic live evidence and human sign-off.

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
