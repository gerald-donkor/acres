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
| on-call alert team | receives the 7 Prometheus alerts and works the runbooks in §5 |

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
  policy, 90-day rotation cadence, compromise response runbook reference

### 4. Secret References (`secret_references`)

- Drill/verify: `scripts/ops/scan-secrets.sh`
- Evidence: Vault policy showing all 11 indirect references
- Accept: all of `session`, `csrf`, `db_migrator`, `db_app`, `valkey`,
  `garage_rpc`, `garage_admin`, `garage_metrics`, `garage_s3`, `smtp`,
  `grafana_admin` present as store references; zero plaintext credentials;
  no AI/Gemini secret source (contradicts the no-AI posture)

### 5. SLOs, Alerting & Capacity (`slo_and_alerting`)

- Drill/verify: `bash scripts/ops/run-capacity-alerting-drill.sh`,
  `node scripts/ops/verify-alert-rules.js`, `node scripts/ops/verify-capacity-load.js --synthetic`
- Evidence: `backups/capacity-alerting-drill-evidence-<timestamp>.json`
- Accept: availability target 99.0–100.0%, p95 latency ceiling, capacity RPS
  target, ≥1 alert recipient, `alert_thresholds_defined: true`, escalation
  runbook reference; all 7 alert rules validated

### 6. Disaster Recovery & Backups (`backup_and_disaster_recovery`)

- Drill/verify: `bash scripts/ops/run-restore-drill.sh --dry-run`,
  `node scripts/ops/reconcile-storage-objects.js --dry-run`
- Evidence: `backups/restore-drill-evidence-<timestamp>.json`, reconciliation report
- Accept: RPO ≤ 1h, RTO ≤ 4h (drill default 300s), encrypted off-host
  destination, cron schedule, `restore_drill_completed: true` with drill date,
  `db_object_reconciliation_tested: true`
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

- Drill/verify: `node scripts/ops/verify-volume-encryption.js`
- Evidence: validator output showing encrypted mounts and key separation
- Accept: LUKS2/CMEK-class mechanism, ≥3 encrypted stateful mounts
  (PostgreSQL, Valkey, Garage), `key_separation_confirmed: true` (zero keys in
  mounts/backups/git), designated `key_recovery_owner`

### 9. GraphQL Introspection (`graphql_introspection`)

- Drill/verify: production route probe (introspection query must fail closed)
- Evidence: probe transcript
- Accept: `production_introspection_enabled` boolean; enabling it in
  production requires a written security justification

### 10. Deployment & Rollback (`deployment_and_rollback`)

- Drill/verify: `bash scripts/ops/run-deployment-drill.sh --dry-run`
- Evidence: `backups/deployment-drill-evidence-<timestamp>.json`
- Accept: target host profile, pinned OCI registry path, named
  `deployment_approver` and `rollback_authority`, image provenance policy
  (signed, additive migrations only), `live_readiness_drill_completed: true`

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
| 1 | `static_templates` | production templates, docker runtime, secret scan |
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
rejects dossiers whose `overall_status`/`status` is `"FAILED"`.

## 5. Incident Response Runbooks (7 Prometheus Alerts)

Alert rules live in `infra/prometheus/alerts.yml`. Severity `critical` pages
the on-call team; `warning` notifies the shared channel — with what tool
(PagerDuty, Slack, email) taken from the operator record's
`slo_and_alerting.alert_recipients`, since `alerts.yml` carries severities and
annotations but no receivers. After every incident: verify the clearing
condition for 15 minutes, then file a post-incident review (timeline, root
cause, action items) before resolving the alert thread.

### AcresApiDown (critical)

- PromQL: `up{job="acres-api"} == 0` for 1m — API process unreachable.
- Triage: `docker compose ps api`; `docker compose logs --tail=200 api`;
  `curl -f http://localhost:3001/health`; check host CPU/memory/disk.
- Contain: restart the API container; if the image is bad, roll back to the
  last pinned image per §6. Escalate to `rollback_authority` after 10 minutes
  down or a second failed restart.
- Clear: `up{job="acres-api"} == 1` for 5m and `/health` 200.

### HighHttp5xxRate (critical)

- PromQL: `(sum(rate(acres_http_requests_total{status_class="5xx"}[5m])) / clamp_min(sum(rate(acres_http_requests_total[5m])), 0.001)) * 100 > 5` for 5m — server error burst.
- Triage: `docker compose logs --tail=500 api | grep -E ' 5[0-9]{2} '`;
  correlate deploy time with error onset; check Postgres/Valkey/Garage reachability.
- Contain: if onset matches a deploy, roll back per §6; otherwise shed load
  (Caddy rate limits) and restart unhealthy dependencies. Escalate to
  `rollback_authority` if the rate does not fall within 15 minutes.
- Clear: 5xx share back under 1% for 15m (operator-defined clearing bar, stricter than the 5% fire threshold).

### P95LatencyThresholdExceeded (warning)

- PromQL: `histogram_quantile(0.95, sum(rate(acres_http_request_duration_seconds_bucket[5m])) by (le)) > 0.5` for 5m.
- Triage: `node scripts/ops/verify-capacity-load.js --synthetic` for the SLO
  baseline; inspect slow-query log and pool saturation
  (`DatabaseConnectionPoolSaturation` firing jointly points at the pool).
- Contain: raise pool limits within the approved host profile, add capacity,
  or enable stricter Caddy throttling on hot routes. Escalate to on-call SRE
  if p95 exceeds 2s or availability SLO is threatened.
- Clear: p95 back under 500ms for 15m (operator-defined; matches the fire threshold).

### High429Rate (warning)

- PromQL: `(sum(rate(acres_http_requests_total{status_class="4xx"}[5m])) / clamp_min(sum(rate(acres_http_requests_total[5m])), 0.001)) * 100 > 10` for 5m.
  Note the rule counts all 4xx, not just 429s — treat it as a rate-limit
  spike / possible credential-stuffing or DoS signal, and confirm the 429
  share in the access logs before acting.
- Triage: top offending IPs/routes in Caddy access logs; check whether the
  spike is one client (abuse) or broad (misconfigured client release).
- Contain: block abusive IPs at Caddy, tighten Throttler windows, rotate
  exposed credentials if stuffing is suspected. Escalate to security lead on
  confirmed credential-stuffing patterns. See also the DoS drill:
  `bash scripts/ops/run-dos-resilience-drill.sh --dry-run`.
- Clear: 429 share back under 2% for 15m with no single-IP dominance (operator-defined clearing bar).

### QueueDeadLettersDetected (warning)

- PromQL: `sum(acres_queue_jobs_total{status="failed"}) > 0` for 1m.
- Triage: list dead-letter jobs in Valkey/BullMQ; inspect worker logs for the
  failing handler and payload class.
- Contain: pause the failing queue, fix or quarantine the poison payload,
  replay dead letters after the fix. Escalate to owning backend engineer if
  dead letters grow while paused.
- Clear: dead-letter count back to 0 and worker lag nominal for 15m (operator-defined).

### OutboxDeliveryLag (warning)

- PromQL: `acres_outbox_pending_events > 50` for 10m.
- Triage: check worker liveness and queue depth; look for stuck outbox
  dispatcher transactions or down downstream sinks.
- Contain: restart the worker, clear the blocking event (quarantine, never
  delete without a record), replay. Escalate to on-call SRE past 60 minutes
  of lag.
- Clear: pending events back under 10 for 15m (operator-defined clearing bar, stricter than the 50-event fire threshold).

### DatabaseConnectionPoolSaturation (warning)

- PromQL: `acres_http_active_requests > 40` for 2m — concurrency nearing pool capacity.
- Triage: active connections vs pool max; identify long-held connections
  (slow endpoints, missing `await`/release, report/export jobs on the API pool).
- Contain: move heavy jobs to the worker pool, add API replicas within the
  host profile, or raise the pool ceiling after confirming Postgres headroom.
  Escalate to on-call SRE if connections plateau at max (outage precursor).
- Clear: active requests back under 30 for 15m (operator-defined clearing bar, under the 40-request fire threshold).

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
