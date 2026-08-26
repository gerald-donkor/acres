# 33 - operational telemetry metrics and maintenance hardening

## Scope, and why it is next

The committed repository is on `main` at `9a2b9e6` (`feat(ops): add launch hardening
foundation`). `docs/operations.md` records Phase 12A as implemented from
`prompts/32-operations-launch-hardening-foundation.md`. Phase 11 (optional local
AI) remains deliberately skipped as an unmet optional decision gate.

Phase 12A delivered the inert single-host reference topology, Caddy/Compose
examples, production environment inventory, and baseline preflights. However,
several critical operational foundations remain incomplete before launch
readiness can be evaluated:

1. **Prometheus application metrics & health telemetry**: `docs/operations.md`
   and `docs/security.md` record that `infra/prometheus/prometheus.yml`,
   `infra/prometheus/alerts.yml`, and `infra/grafana/dashboards/acres-operations.json`
   currently contain placeholder scaffolding and an explicit gate panel because
   Acres does not yet expose an application metrics endpoint. We must implement a
   low-cardinality, strictly redacted Prometheus `/metrics` endpoint in the NestJS
   API and worker to export RED (Rate, Errors, Duration) metrics, database pool
   utilization, outbox lag, queue depth/dead letters, and scheduled job
   execution stats.
2. **Alert rules and operator dashboard**: Replace the empty alert rule group in
   `infra/prometheus/alerts.yml` and the text gate panel in
   `infra/grafana/dashboards/acres-operations.json` with real metric queries,
   critical alerts (`AcresApiDown`, `HighHttp5xxRate`, `QueueDeadLettersDetected`,
   `OutboxDeliveryLag`), and live operational visualization.
3. **Data retention & operational maintenance jobs**: Extend the single-instance
   worker scheduler (`@nestjs/schedule`) with automated retention tasks for expired
   upload sessions, expired idempotency keys, and expired recovery tokens,
   recording all runs to the `JobRun` table.
4. **Backup/restore tooling & supply-chain hardening**: Add deterministic
   PostgreSQL and Garage storage backup/restore verification helper scripts under
   `scripts/ops/` with fail-closed credential protection. Pin GitHub Actions in
   `.github/workflows/ci.yml` to immutable 40-character commit SHAs. Add an
   audit scan script to `scripts/ops/` and integrate it into `npm run ops:check`.
5. **Documentation**: Update `docs/operations.md`, `docs/backend.md`, and
   `docs/security.md` with the Phase 12B state.

This is Phase 12B. It does not deploy live infrastructure, invent operator-owned
business values (domain, SMTP credentials, external alert webhook targets), or
enable optional AI.

## Reference material read while preparing this prompt

Repository and workflow authority:

- `AGENTS.md` §§2, 2.1, phase-control commands, §§5-10: prompt-first workflow,
  phase resolution, skill loading, verification, review, documentation, commit
  rules, product constraints, and no-fabrication rules.
- `docs/build-plan.md` §§1, 13, 14: Phase 12 operations and launch-hardening
  target, required skills, telemetry/alert requirements, retention requirements,
  and exit evidence.
- `docs/operations.md`: Phase 12A implemented state, topology, artifacts,
  launch blockers, and runbooks.
- `docs/backend.md` §§10, 10.1, 13: health/readiness contracts, scheduler
  single-instance constraint, outbox/queue worker architecture, and operations
  bridge.
- `docs/security.md` §§8, 9, 10, 15: threat model (TM-15, TM-16, TM-18),
  launch acceptance evidence, and residual Phase 12A risks.
- `docs/system-architecture.md` §§3, 4, 10, 11: runtime containers, outbox/queue
  subsystems, and monitoring topology.

Current implementation inspected:

- `server/src/health/health.controller.ts` & `server/src/health/health.service.ts`:
  liveness (`/health`) and dependency readiness (`/health/ready`).
- `server/src/worker.ts` & `server/src/worker/upload-worker.service.ts`: worker
  lifecycle, BullMQ queue handling, and job processing.
- `server/src/outbox/outbox.service.ts`: PG outbox event queue and publishing.
- `server/src/jobs/session-maintenance.job.ts` & `server/src/jobs/job-runs.service.ts`:
  cron-driven maintenance and `JobRun` audit trail.
- `infra/prometheus/prometheus.yml` & `infra/prometheus/alerts.yml`: Prometheus
  configuration and alert rule templates.
- `infra/grafana/dashboards/acres-operations.json`: Grafana dashboard JSON.
- `infra/caddy/Caddyfile.example`: Caddy ingress routing for `/health`, `/api/*`,
  and `/graphql`.
- `scripts/ops/check-production-templates.sh`, `scripts/ops/scan-secrets.sh`,
  `scripts/ops/launch-readiness.sh`: deterministic ops preflights.
- `.github/workflows/ci.yml`: CI check workflows and Docker build validation.

Skills loaded while preparing this prompt:

- `.agents/skills/prometheus-configuration/SKILL.md`
- `.agents/skills/grafana-dashboards/SKILL.md`
- `.agents/skills/architecture-patterns/SKILL.md`
- `.agents/skills/nestjs-best-practices/SKILL.md`
- `.agents/skills/security-best-practices/SKILL.md`
- `.agents/skills/security-threat-model/SKILL.md`
- `.agents/skills/secrets-management/SKILL.md`
- `.agents/skills/sast-configuration/SKILL.md`
- `.agents/skills/deployment-pipeline-design/SKILL.md`
- `.agents/skills/github-actions-templates/SKILL.md`
- `.agents/skills/javascript-testing-patterns/SKILL.md`
- `.agents/skills/e2e-testing-patterns/SKILL.md`
- `.agents/skills/requesting-code-review/SKILL.md`
- `.agents/skills/receiving-code-review/SKILL.md`
- `.agents/skills/caveman-commit/SKILL.md`

## SKILLS USED

- `prometheus-configuration` - design metric names, Prometheus text format,
  scrape targets, and alert rules following Prometheus best practices.
- `grafana-dashboards` - construct operational dashboard panels adhering to RED
  and USE methodology without client-side vanity metrics.
- `nestjs-best-practices` - structure the NestJS metrics module, interceptors,
  service providers, and lifecycle hooks cleanly.
- `security-best-practices` - enforce strict metric label cardinality, complete
  PII/token/query redaction, and safe exposure boundaries.
- `security-threat-model` - address TM-15 (secret leakage), TM-16 (audit integrity),
  and TM-18 (supply chain) in the threat register.
- `secrets-management` - protect credentials in backup/restore helper scripts and
  prevent sensitive leaks in telemetry labels.
- `sast-configuration` - implement deterministic dependency/vulnerability scanning
  in the ops verification harness.
- `github-actions-templates` - pin GitHub Actions to full immutable commit SHAs with
  version annotations in CI.
- `architecture-patterns` - maintain clear separation between core product modules
  and operations/telemetry infrastructure adapters.
- `javascript-testing-patterns` - create unit and integration tests for metrics
  collection, label sanitization, and retention jobs.
- `requesting-code-review` - dispatch reviewer subagent after self-verification.
- `receiving-code-review` - evaluate reviewer feedback with technical rigor
  before applying fixes.
- `caveman-commit` - write conventional commit message for the final work.

Conditional skills considered:

- `postgres-best-practices` and `sql-optimization-patterns` - consulted if
  retention queries or backup scripts touch database indexes or vacuum behavior.

## Required verification before implementation

Before writing code, re-read `AGENTS.md`, this prompt, owning docs, and all
named skills. Verify dependencies and APIs from local files:

- Inspect `server/src/app.setup.ts`, `server/src/app.module.ts`,
  `server/src/health/*`, `server/src/jobs/*`, and `server/src/outbox/*`.
- Verify `prom-client` (or standard lightweight Prometheus serialization)
  requirements. If installing `prom-client`, verify license (Apache-2.0),
  version compatibility with Node 24, and zero native build dependencies.
- Inspect `infra/prometheus/prometheus.yml`, `infra/prometheus/alerts.yml`,
  `infra/grafana/dashboards/acres-operations.json`, and
  `infra/caddy/Caddyfile.example`.
- Inspect `.github/workflows/ci.yml` and resolve full 40-char commit SHAs for
  each action (`actions/checkout`, `actions/setup-node`, `docker/setup-buildx-action`,
  `docker/build-push-action`).

## Target implementation details

### 1. Prometheus Metrics Module & Interceptor (`server/src/metrics/`)

Create a dedicated `MetricsModule` and `MetricsService` in `@acres/server`:

- **Metrics Collection**:
  - `acres_http_requests_total`: Counter by `method`, `route_group`, `status_class`
    (e.g., `status_class="2xx|4xx|5xx"`).
  - `acres_http_request_duration_seconds`: Histogram by `method`, `route_group`,
    `status_class` with standard Web latency buckets (0.01, 0.05, 0.1, 0.25, 0.5,
    1, 2.5, 5, 10).
  - `acres_http_active_requests`: Gauge of current in-flight requests.
  - `acres_outbox_pending_events`: Gauge tracking pending outbox events.
  - `acres_queue_jobs_total`: Counter by `queue_name`, `status` (completed,
    failed).
  - `acres_queue_active_jobs` and `acres_queue_waiting_jobs`: Gauges for queue
    depth.
  - `acres_scheduled_job_runs_total`: Counter by `job_name`, `status`.
  - `acres_database_query_duration_seconds` (optional/lightweight): histogram or
    connectivity status.
- **Strict Cardinality & Sanitization Rules**:
  - `route_group` MUST map URL paths to parameterized template names
    (e.g. `/api/v1/uploads`, `/api/v1/datasets`, `/api/v1/reports`, `/graphql`,
    `/health`, `/metrics`, `other`).
  - NEVER record raw UUIDs, user IDs, organization IDs, tokens, query parameters,
    or arbitrary error messages in metric labels.
  - Reject high-cardinality label generation.
- **Endpoint**:
  - Expose `GET /metrics` via a `MetricsController` (version-neutral, `@SkipThrottle()`).
  - Output standard Prometheus text exposition format (`text/plain; version=0.0.4`).
  - Keep `/metrics` on the private API network; Caddy does NOT proxy `/metrics`
    to the public internet unless an operator-authenticated path is explicitly
    configured.

### 2. Prometheus & Grafana Configuration Update

- Update `infra/prometheus/prometheus.yml`:
  - Uncomment and configure `acres-api` target on `api:3001` with path `/metrics`.
  - Add `acres-worker` scrape target if separate metrics port is exposed, or
    consolidate via shared metrics infrastructure.
- Update `infra/prometheus/alerts.yml`:
  - Group `acres_service_alerts`:
    - `AcresApiDown`: `up{job="acres-api"} == 0` for 1m (Severity: Critical).
    - `HighHttp5xxRate`: `(sum(rate(acres_http_requests_total{status_class="5xx"}[5m])) / sum(rate(acres_http_requests_total[5m]))) * 100 > 5` for 5m (Severity: Critical).
    - `QueueDeadLettersDetected`: `sum(acres_queue_jobs_total{status="failed"}) > 0` (Severity: Warning).
    - `OutboxDeliveryLag`: `acres_outbox_pending_events > 50` for 10m (Severity: Warning).
- Update `infra/grafana/dashboards/acres-operations.json`:
  - Replace the placeholder gate text with live panels:
    - Stat panel: API Liveness / Status (`up{job="acres-api"}`).
    - Graph panel: Request Rate by Route Group (`sum(rate(acres_http_requests_total[5m])) by (route_group)`).
    - Graph panel: Error Rate % (`(sum(rate(acres_http_requests_total{status_class="5xx"}[5m])) / sum(rate(acres_http_requests_total[5m]))) * 100`).
    - Graph panel: P95 HTTP Request Duration (`histogram_quantile(0.95, sum(rate(acres_http_request_duration_seconds_bucket[5m])) by (le))`).
    - Graph panel: Outbox Pending Lag & Queue Depth.
    - Stat/Graph panel: Scheduled Job Success / Failure rates.

### 3. Automated Data Retention & Maintenance Jobs

Extend `server/src/jobs/`:

- Create `RetentionMaintenanceJob` (or extend maintenance schedule):
  - Purge expired upload sessions older than configured TTL (`uploads.purge-expired`).
  - Purge expired idempotency records older than retention window (`idempotency.purge-expired`).
  - Purge expired password recovery tokens / invitation tokens past expiry (`tokens.purge-expired`).
  - Ensure all purge jobs execute within transaction bounds, record their run to
    `JobRun`, and respect `SCHEDULER_ENABLED=true` guard so only the worker process
    executes them.

### 4. Operational Scripts & Supply-Chain Hardening

Add helper scripts under `scripts/ops/`:

- `scripts/ops/backup-postgres.sh`: runs `pg_dump` with structured parameters,
  verifies output size > 0, outputs to a specified directory with timestamped
  filename, and avoids printing credentials.
- `scripts/ops/restore-postgres.sh`: validates backup file existence, verifies
  target database connection, applies `pg_restore`/`psql`, and reports table
  counts upon completion.
- `scripts/ops/audit-dependencies.sh`: runs `npm audit --omit=dev --audit-level=high`
  or a deterministic offline package security verification.
- Update `scripts/ops/check-production-templates.sh` to validate the updated
  Prometheus alert rules and Grafana dashboard queries.
- Update `package.json` with scripts: `ops:audit`, `ops:backup`, `ops:restore`.
- Update `.github/workflows/ci.yml`:
  - Pin all GitHub Actions to full 40-character commit SHAs with inline tag
    comments (e.g. `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2`).
  - Add `npm run ops:audit` to the CI `checks` job.

### 5. Canonical Documentation Update

Update `docs/operations.md`:
- Record Phase 12B implementation: live Prometheus `/metrics` endpoint, alert
  rules, Grafana panels, retention jobs, backup/restore helpers, and pinned CI
  actions.
- Note remaining launch blockers (operator-provided domain, SMTP credentials,
  production host).

Update `docs/backend.md` & `docs/security.md`:
- Document the new `/metrics` endpoint, label sanitization invariants, and
  supply-chain action pinning.

## Non-goals

- No live cloud deployment or external alerting provider integration (e.g.
  PagerDuty/Slack webhook secrets).
- No invention of fake SLO numbers or fictitious capacity targets.
- No public exposure of `/metrics` through Caddy.
- No modification of client-side marketing or UI styling.
- No enablement of Phase 11 optional AI.

## Security and failure cases

- Metric label cardinality explosion: strictly clamp and normalize route
  strings into a finite enum/whitelist of route groups.
- Sensitive data leak in telemetry: zero query parameters, session tokens,
  passwords, or PII in metrics output.
- Backup credential leakage: scripts must use standard environment variables
  (`PGPASSWORD`) without echoing commands or credentials to logs.
- Scheduler concurrency: ensure retention jobs execute exclusively on the single
  scheduler instance (`SCHEDULER_ENABLED=true`).
- CI Action tampering: immutable SHA pinning prevents upstream tag mutation.

## Verification plan

Run and quote real output from:

```bash
git diff --check
npm run lint
npm run typecheck
npm run build
npm run contracts:check
npm run ops:check
npm run ops:audit
npm run test:server
```

Inspect the Prometheus configuration and metric output:
- Verify `GET /metrics` returns valid Prometheus exposition text format with
  proper TYPE, HELP, and label formatting.
- Verify `check-production-templates.sh` passes with the updated alert rules and
  dashboard JSON.

Self-review the diff:

```bash
git status --short
git diff --stat
```

Dispatch reviewer subagent via `requesting-code-review`, evaluate findings with
`receiving-code-review`, and commit with `caveman-commit`.

## Documentation and commit requirements

Record what was built in `docs/operations.md` and concise references in
`docs/backend.md` and `docs/security.md`.
Stage approved files and commit locally on `main` with `caveman-commit`.
Do not push.
