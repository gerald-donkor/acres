# Operations and launch hardening

Status: Phase 12C implemented from
`prompts/34-launch-e2e-accessibility-verification.md`. Extends the Phase 12A/12B
foundation with comprehensive end-to-end browser suites, WCAG 2.2 Level AA accessibility
auditing across all 3 viewports (375px, 800px, 1280px), strict horizontal overflow checks,
multi-tenant isolation verification, and live Prometheus telemetry assertions.

Phase 11 optional local AI remains absent. No model, runtime, license, quality
threshold, prompt store, or AI operating profile has been approved. Every Phase
12C artifact and check validates the deterministic no-AI path.

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
| `scripts/ops/check-production-templates.sh` | Static template existence, YAML/JSON parse, private-port, encrypted-mount, scheduler, Prometheus alert rules, Grafana dashboard queries, HSTS, and env placeholder checks |
| `scripts/ops/scan-secrets.sh` | Tracked-file scan for known local passwords, `change-me` placeholders, launch sentinels outside approved docs/examples, and secret-looking `NEXT_PUBLIC_*` names |
| `scripts/ops/check-docker-runtime.sh` | Static server Dockerfile check for Node 24, non-root runtime, healthcheck, and direct Node startup |
| `scripts/ops/launch-readiness.sh` | Aggregates operational checks and fails closed with the unresolved launch blockers |
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

## Launch Blockers

These values are deliberately unset and must block launch when absent:

- production domain and TLS contact email;
- SMTP host, port, credentials, delivery policy, and abuse/complaint handling;
- secret-injection mechanism and rotation/masking procedure;
- session, CSRF/signing, database, storage, queue, SMTP, and Grafana secrets;
- SLO/availability target, capacity target, alert owners, and alert thresholds;
- RPO/RTO, backup destination, restore schedule, and DB/object reconciliation procedure;
- production volume-encryption mechanism, encrypted mount paths, key-separation rule, and key-recovery owner;
- production GraphQL introspection policy;
- production host, registry/image promotion path, rollback authority, and container/image provenance expectations.

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
