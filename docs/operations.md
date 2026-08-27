# Operations and launch hardening

Status: Phase 12D implemented from
`prompts/35-launch-readiness-decision-record.md`. Extends the Phase 12A–12C
foundation with a structured launch-readiness decision record schema
(`infra/launch/readiness.example.json`) and a deterministic, fail-closed
validator (`scripts/ops/check-launch-readiness.js`) that verifies all operator-owned
decisions, secret store references, disaster recovery drills, volume encryption,
and no-AI postures without committing sensitive material.

Phase 11 optional local AI remains absent. No model, runtime, license, quality
threshold, prompt store, or AI operating profile has been approved. Every Phase
12D artifact and check validates the deterministic no-AI path.

## Topology & Telemetry

The reference production topology is a single host running Docker Compose with
Caddy as the only public ingress. Caddy routes application/document traffic to
the Next production service, `/api/*`, `/graphql`, `/health`, and
`/health/ready` to the Nest API, and the path-style presigned Garage bucket
path `/acres-quarantine/*` to Garage while preserving the browser-visible Host
header used in SigV4 signing.

PostgreSQL/PostGIS, Valkey, Garage admin/data ports, ClamAV, Prometheus, and
Grafana stay on the private Compose network. The API and worker are separate
Node 24 processes from the same server image. The API has
`SCHEDULER_ENABLED=false`; the worker has `SCHEDULER_ENABLED=true`, preserving
the single scheduler path until a separate distributed scheduler decision
exists.

### Prometheus Metrics (`/metrics`)

The NestJS API exposes a private, version-neutral `GET /metrics` endpoint
outputting standard Prometheus text exposition format (`text/plain; version=0.0.4; charset=utf-8`).
It is excluded from public Caddy routing and is exempt from JSON response envelopes
and rate limiting:

1. `acres_http_requests_total`: Counter by `method`, `route_group`, `status_class`.
2. `acres_http_request_duration_seconds`: Histogram with Web latency buckets `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`.
3. `acres_http_active_requests`: Gauge of current in-flight requests.
4. `acres_outbox_pending_events`: Gauge tracking pending outbox events.
5. `acres_queue_jobs_total`: Counter by `queue_name`, `status`.
6. `acres_queue_active_jobs` and `acres_queue_waiting_jobs`: Gauges for queue depth.
7. `acres_scheduled_job_runs_total`: Counter by `job_name`, `status`.

**Cardinality and Redaction Invariant**: `route_group` collapses all paths to
fixed parameterized route templates (e.g. `/api/v1/auth`, `/api/v1/organizations`,
`/api/v1/reports`, `/api/v1/uploads`, `/graphql`, `/health`, `/metrics`, `other`).
Raw UUIDs, user IDs, organization IDs, tokens, query parameters, and error
messages are strictly excluded from metric labels.

## Artifacts

| file | purpose |
| --- | --- |
| `infra/caddy/Caddyfile.example` | Same-origin Caddy routing, baseline security headers, request-size and timeout placeholders, and an explicit HSTS approval gate |
| `infra/compose/docker-compose.production.example.yml` | Inert single-host Compose reference for Caddy, Next, API, worker, Postgres/PostGIS, Valkey, Garage, ClamAV, and optional observability |
| `infra/docker/client.Dockerfile.example` and `infra/docker/client.Dockerfile.example.dockerignore` | Example Node 24 production image for the Next client, with a Dockerfile-specific context ignore because the root `.dockerignore` intentionally excludes client source for the server image |
| `infra/env/production.env.example` and `infra/env/garage.production.env.example` | Production environment inventory with `__REQUIRED_*__` sentinels for operator-provided values and every Compose interpolation variable; Garage admin/metrics secrets stay service-scoped |
| `infra/prometheus/prometheus.yml` and `infra/prometheus/alerts.yml` | Prometheus scrape configuration for `prometheus` and `acres-api`, plus alert rules (`AcresApiDown`, `HighHttp5xxRate`, `QueueDeadLettersDetected`, `OutboxDeliveryLag`) |
| `infra/grafana/provisioning/**` and `infra/grafana/dashboards/acres-operations.json` | Operational Grafana dashboard with RED service metrics, queue depth, outbox lag, and scheduled job health |
| `server/src/metrics/*` | `MetricsModule`, `MetricsService`, `MetricsController`, `MetricsMiddleware`, and `route-normalizer` |
| `server/src/jobs/retention-maintenance.job.ts` | Cron-driven retention maintenance for expired uploads, idempotency records, and authentication/recovery tokens |
| `client/e2e/helpers.ts` | Shared Playwright test helpers and deterministic mock fixture generators |
| `client/e2e/product-journeys.spec.ts` | Full product journey E2E suite (auth, dashboards, saved views, reports, revisions, exports, downloads) |
| `client/e2e/multi-tenant-isolation.spec.ts` | Multi-tenant browser isolation suite (independent contexts, cross-tenant report blocking, org switching) |
| `client/e2e/accessibility-responsive.spec.ts` | WCAG 2.2 Level AA accessibility audit, responsive overflow at 375/800/1280px, touch targets, and telemetry check |
| `scripts/ops/backup-postgres.sh` | Structured PostgreSQL `pg_dump` backup helper with fail-closed credentials and permission hardening |
| `scripts/ops/restore-postgres.sh` | Structured PostgreSQL restore helper with connection verification and table count validation |
| `scripts/ops/audit-dependencies.sh` | Deterministic dependency security audit script for production dependencies |
| `scripts/ops/check-production-templates.sh` | Static template existence, YAML/JSON parse, private-port, encrypted-mount, scheduler, Prometheus alert rules, Grafana dashboard queries, HSTS, readiness schema, and env placeholder checks |
| `scripts/ops/scan-secrets.sh` | Tracked-file scan for known local passwords, `change-me` placeholders, launch sentinels outside approved docs/examples, and secret-looking `NEXT_PUBLIC_*` names |
| `scripts/ops/check-docker-runtime.sh` | Static server Dockerfile check for Node 24, non-root runtime, healthcheck, and direct Node startup |
| `infra/launch/readiness.example.json` | Inert, structured launch-readiness decision template covering all 11 operator categories with explicit placeholders |
| `scripts/ops/check-launch-readiness.js` | Deterministic fail-closed launch readiness validator enforcing approval status, secret source references, recovery drills, and no-AI posture |
| `scripts/ops/launch-readiness.sh` | Aggregates operational checks and runs the fail-closed launch readiness validator |
| `.github/workflows/ci.yml` | Pinned GitHub Actions (full 40-char commit SHAs) running `npm run ops:check` and verification suite |
| `scripts/db/bootstrap-production-roles.sh` | Production Postgres bootstrap for `acres_migrator`, `acres_app`, and `acres`; deliberately omits local `acres_test` database |

Root scripts:

```bash
npm run ops:templates
npm run ops:scan-secrets
npm run ops:docker-runtime
npm run ops:audit
npm run ops:backup
npm run ops:restore
npm run ops:check
npm run ops:launch-readiness
```

`ops:check` passes in CI. `ops:launch-readiness` is expected to fail until the
operator-owned production decisions below are resolved and the runbook evidence
is captured on the chosen host.

## Phase 12C Browser & E2E Verification

The complete product surface is covered by dedicated Playwright end-to-end suites:

1. **`client/e2e/product-journeys.spec.ts`**:
   - Authentication flow (registration, login, logout, returnTo preservation).
   - Organization selection and creation empty state.
   - Dashboards workspace rendering: KPI summary stats, Recharts bar chart, aggregate comparison table with accessible headers and evidence identifiers.
   - Saved view lifecycle: form submission, persistent sidebar listing, and view switching.
   - Reports workspace: draft authoring (`/app/reports/new`), revision editing, immutable publication, asynchronous CSV/PDF export generation, and secure artifact download.

2. **`client/e2e/multi-tenant-isolation.spec.ts`**:
   - Isolated browser contexts for independent tenant organizations (Org A vs Org B).
   - Strict absence of cross-tenant saved views, draft reports, or published evidence.
   - Immediate context switching between multiple organization memberships without client cache bleed.
   - Header tampering rejection: cross-tenant mutations with forged headers are rejected by backend RLS guards.

3. **`client/e2e/accessibility-responsive.spec.ts`**:
   - WCAG 2.2 AA responsive audit across exact comp breakpoints: `375px` (Mobile), `800px` (Tablet), and `1280px` (Desktop).
   - Strict horizontal overflow check (`scrollWidth <= clientWidth` = 0px overflow).
   - Mobile touch target minimum size verification (`>= 44x44px`) on all interactive buttons, links, inputs, and dropdowns.
   - Skip-link landmark verification (`a[href="#main-content"]` target attached and reachable).
   - Keyboard accessibility and screen-reader table alternatives.
   - Prometheus telemetry verification: `acres_http_requests_total` output retains low cardinality with normalized route templates and zero raw UUIDs/secrets.

## Launch Readiness Decision Record & Fail-Closed Gate

Phase 12D introduces a machine-checkable launch-readiness decision record schema
(`infra/launch/readiness.example.json`) and a local fail-closed validator
(`scripts/ops/check-launch-readiness.js`).

### Schema Structure & Required Categories

The readiness document contains 11 structured categories under `sections`:

1. `production_domain_tls`: Domain name, TLS contact email, and explicit HSTS approval.
2. `smtp_delivery`: SMTP provider, host, port, credentials reference, delivery policy, and abuse/bounce procedure.
3. `secrets_management`: Injection mechanism (e.g. Vault/AWS SM), log masking policy, rotation cadence (days), and compromise response runbook.
4. `secret_references`: Indirect secret store references (`<provider>:<path>#<key>`) for session, CSRF, database migrator/app, Valkey, Garage RPC/admin/metrics/S3, SMTP, and Grafana secrets. Plaintext passwords or connection strings are strictly rejected.
5. `slo_and_alerting`: Availability target percent (e.g. 99.9%), p95 latency ceiling, capacity target RPS, alert recipient routes, defined alert rules, and escalation runbooks.
6. `backup_and_disaster_recovery`: RPO/RTO targets, off-host backup destination, cron schedule, completed restore drill date, and PostgreSQL/Garage DB-object reconciliation verification.
7. `data_retention_policy`: Formal retention windows for accounts, audit logs, upload quarantine, rejected objects, report exports, generated reports, telemetry metrics, and backups.
8. `volume_encryption`: Host-level volume encryption mechanism (LUKS2/KMS), encrypted mount paths for all stateful services (PostgreSQL, Valkey, Garage), key separation confirmation, and key recovery owner.
9. `graphql_introspection`: Production introspection state and security justification.
10. `deployment_and_rollback`: Target host architecture, OCI image registry, deployment approver, rollback authority, image provenance policy (Cosign/OIDC), and live readiness drill status.
11. `optional_ai_posture`: Verification that `ai_enabled` is `false`, `no_ai_path_verified` is `true`, and Phase 11 remains blocked. Any record with `ai_enabled: true` fails immediately.

### Running the Validator

```bash
# Evaluate the default checked-in example (expected: fails closed with blockers)
npm run ops:launch-readiness

# Or evaluate a specific operator-provided readiness record:
npm run ops:launch-readiness -- infra/launch/production-readiness.json
# or directly:
node scripts/ops/check-launch-readiness.js infra/launch/production-readiness.json
```

### Distinction: `ops:check` vs `ops:launch-readiness`

- `npm run ops:check`: **CI-safe**. Validates that all production templates exist, parse cleanly as YAML/JSON, have correct service scopes, do not leak secrets into git, and that dependencies have no critical vulnerabilities. It passes in CI on every push.
- `npm run ops:launch-readiness`: **Launch-gated fail-closed validator**. Runs all baseline checks and then validates the readiness record. The checked-in template `infra/launch/readiness.example.json` intentionally fails with 61 unresolved blockers across all 11 categories because operator decisions and live host drills have not been performed.

### Expected Failing Output on Checked-in Example

When run against `infra/launch/readiness.example.json`, `npm run ops:launch-readiness` outputs:

```
================================================================================
ACRES LAUNCH READINESS EVALUATION
Target: infra/launch/readiness.example.json
================================================================================

Unresolved Launch Blockers by Category:
... (lists all 61 unresolved placeholders and unapproved categories) ...

--------------------------------------------------------------------------------
SUMMARY:
  Total Required Categories: 11
  Approved Categories:       0
  Unresolved / Blocked:      11
  Total Blockers Detected:   61
================================================================================

Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
This repository intentionally fails closed until real operator decisions and live drills are recorded.
```

## Runbooks

### Preflight

1. Resolve every `__REQUIRED_*__` value from `infra/env/production.env.example` through the approved secret store or host mechanism.
2. Run `npm run ops:check` from the repository root.
3. Run `docker compose -f infra/compose/docker-compose.production.example.yml config` with the real production env file loaded.
4. Confirm only Caddy publishes host ports, stateful services use encrypted mounts, and Grafana/Prometheus are not public unless an authenticated operator path has been approved.
5. Run the normal repository verification suite before building images.

### Deploy

1. Build immutable client and server images from a reviewed commit.
2. Apply database migrations with the migrator identity before starting the new API/worker pair.
3. Start/replace Caddy, Next, API, worker, and private dependencies with the production environment injected at runtime.
4. Verify `GET /health` for liveness and `GET /health/ready` for dependency readiness through the Caddy path and from the private network.
5. Verify `GET /metrics` answers on the private API network (`http://api:3001/metrics`).
6. Run the authenticated smoke journeys: marketing page, login/register, `/app`, dashboards, reports, report export request/status, and download metadata.

### Rollback

Use immutable image tags and keep the previous Caddy/app configuration available. Application rollback may point Caddy back to the previous Next/API images. Schema rollback is not assumed: migrations must be backward-compatible for at least one release cycle, and irreversible data changes use forward fixes unless a reviewed undo migration exists.

### Backup

Run `scripts/ops/backup-postgres.sh` with `PGPASSWORD` and destination configured. Back up PostgreSQL, Garage object data and metadata, deployment config, certificate state, and recoverable signing/encryption material. Backups must be encrypted, access-controlled, off-host, and separate from live volume unlock material.

### Restore

Use `scripts/ops/restore-postgres.sh <backup-file.dump>` to restore to an isolated environment. Validate table counts, apply migration chain, then reconcile PostgreSQL object metadata against Garage objects and export artifacts.

### Data Retention & Cleanup

Data retention jobs run automatically on the worker process (`SCHEDULER_ENABLED=true`):
- `sessions.purge-expired`: cleans expired session tokens.
- `uploads.purge-expired`: cleans uncompleted uploads and pending quarantine objects older than configured TTL.
- `idempotency.purge-expired`: cleans idempotency records past retention window.
- `tokens.purge-expired`: cleans expired password recovery and invitation tokens.
All runs are logged to the `JobRun` audit table.

## CI State

CI has `permissions: contents: read` and pins all actions to immutable 40-character commit SHAs. The `checks` job runs the full lint, typecheck, build, contract drift, database role/migration, and server test sequence, plus `npm run ops:check`. The Docker job builds the server image and smoke-tests `/health` with `push: false`.

## No-AI Posture

Optional AI remains unimplemented. Launch evidence must demonstrate that regional browsing, dashboards, governed reports, exports, and operational runbooks work without AI enabled. Any later AI work needs its own model, license, evaluation, security, and operating-profile decision.
