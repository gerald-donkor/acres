# Operations and launch hardening

Status: Phase 12D implemented from
`prompts/35-launch-readiness-decision-record.md`. Extends the Phase 12A–12C
foundation with a structured launch-readiness decision record schema
(`infra/launch/readiness.example.json`) and a deterministic, fail-closed
validator (`scripts/ops/check-launch-readiness.js`) that verifies all operator-owned
decisions, secret store references, disaster recovery drills, volume encryption,
and no-AI postures without committing sensitive material.

Phase 11A optional evidence-draft preview is implemented in code behind
`AI_DRAFT_ENABLED=false` and uses the unpaid Gemini Developer API with mandatory
disclosure/acknowledgment. Because the unpaid API tier is not approved for
production use, it is deliberately excluded from the production launch profile.
Launch readiness requires a verified deterministic no-AI deployment,
`AI_DRAFT_ENABLED=false`, zero `GEMINI_API_KEY` provisioned to production images or
secrets, and unpaid provider exclusion.

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

The production PostgreSQL encrypted host mount targets `/var/lib/postgresql`.
PostgreSQL 18 manages its major-version-specific data subdirectory beneath that
mount; `/var/lib/postgresql/data` is not a compatible persistent target for the
reference image. This changes neither the encryption/key-recovery requirement
nor the separate production upgrade, backup, and restore responsibilities.

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
| `infra/prometheus/prometheus.yml` and `infra/prometheus/alerts.yml` | Prometheus scrape configuration for `prometheus` and `acres-api`, plus alert rules (`AcresApiDown`, `HighHttp5xxRate`, `P95LatencyThresholdExceeded`, `High429Rate`, `QueueDeadLettersDetected`, `OutboxDeliveryLag`, `DatabaseConnectionPoolSaturation`) |
| `infra/grafana/provisioning/**` and `infra/grafana/dashboards/acres-operations.json` | Operational Grafana dashboard with RED service metrics, queue depth, outbox lag, and scheduled job health |
| `server/src/metrics/*` | `MetricsModule`, `MetricsService`, `MetricsController`, `MetricsMiddleware`, and `route-normalizer` |
| `server/src/jobs/retention-maintenance.job.ts` | Cron-driven retention maintenance for expired uploads, idempotency records, and authentication/recovery tokens |
| `client/e2e/helpers.ts` | Shared Playwright test helpers and deterministic mock fixture generators |
| `client/e2e/product-journeys.spec.ts` | Full product journey E2E suite (auth, dashboards, saved views, reports, revisions, exports, downloads) |
| `client/e2e/multi-tenant-isolation.spec.ts` | Multi-tenant browser isolation suite (independent contexts, cross-tenant report blocking, org switching) |
| `client/e2e/accessibility-responsive.spec.ts` | WCAG 2.2 Level AA accessibility audit, responsive overflow at 375/800/1280px, touch targets, and telemetry check |
| `scripts/ops/backup-postgres.sh` | Structured PostgreSQL `pg_dump` backup helper with fail-closed credentials and permission hardening |
| `scripts/ops/restore-postgres.sh` | Structured PostgreSQL restore helper with connection verification and table count validation |
| `scripts/ops/run-restore-drill.sh` | Automated disaster recovery restore drill runner validating backup integrity, isolated database restore, schema/migration parity, and RTO |
| `scripts/ops/reconcile-storage-objects.js` | Object storage reconciliation utility comparing PostgreSQL stored objects against bucket keys, detecting leaks, missing objects, and mismatches |
| `scripts/ops/verify-caddy-routing.js` | Pure Node.js Caddyfile parser and route evaluator validating same-origin ingress dispatching, proxy headers, S3 SigV4 preservation, and security headers |
| `scripts/ops/verify-caddy-routing.spec.js` | Unit test suite (10/10 tests) asserting Caddy routing rules, SigV4 host preservation, security headers, timeouts, and HSTS gate invariants |
| `scripts/ops/run-deployment-drill.sh` | Automated deployment promotion preflight and rollback drill runner validating Caddy routing, additive migrations, readiness probes, graceful drain, and evidence emission |
| `scripts/ops/audit-dependencies.sh` | Deterministic dependency security audit script for production dependencies |
| `scripts/ops/generate-sbom.js` & `.spec.js` | Deterministic CycloneDX v1.5 JSON SBOM generator and license compliance validator (purls, hashes, permissive allowlist, copyleft rejection) |
| `scripts/ops/run-sast-scan.js` & `.spec.js` | Pure Node.js static application security testing (SAST) engine evaluating SAST-01 through SAST-08 across source trees with triage policy enforcement |
| `infra/security/sast-triage.json` & `.schema.json` | Actionable SAST triage policy registry with schema, rationale, approved owners, and fail-closed expiration gating |
| `scripts/ops/verify-container-security.js` & `.spec.js` | Static multi-stage build validator verifying non-root `USER node`, pinned `node:24-alpine`, bounded healthchecks, direct exec CMD, and Compose network/credential isolation |
| `scripts/ops/verify-alert-rules.js` & `.spec.js` | Prometheus alert rule validator and time-series simulation engine verifying 7 golden signal and threat alerts (`AcresApiDown`, `HighHttp5xxRate`, `P95LatencyThresholdExceeded`, `High429Rate`, `QueueDeadLettersDetected`, `OutboxDeliveryLag`, `DatabaseConnectionPoolSaturation`) |
| `scripts/ops/verify-capacity-load.js` & `.spec.js` | Pure Node.js performance, capacity, and latency evaluation engine evaluating Category 5 SLOs (availability >= 99.9%, p95 latency <= 500ms, throughput >= 100 RPS) |
| `scripts/ops/run-dos-resilience-drill.sh` | Automated multi-layer DoS resilience and rate limiting drill runner asserting edge bounds, in-process throttles, GraphQL resource caps, upload bounds, and constant-time bcrypt |
| `scripts/ops/run-capacity-alerting-drill.sh` | Automated top-level drill orchestrator executing alert simulation, capacity evaluation, and DoS resilience checks with unified JSON evidence emission |
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
npm run ops:restore-drill
npm run ops:reconcile-storage
npm run ops:caddy-test
npm run ops:caddy-drill
npm run ops:deployment-drill
npm run ops:volume-test
npm run ops:volume-drill
npm run ops:rotation-drill
npm run ops:sbom
npm run ops:sbom-test
npm run ops:sast
npm run ops:sast-test
npm run ops:container-test
npm run ops:container-security
npm run ops:capacity-test
npm run ops:capacity-drill
npm run ops:alert-test
npm run ops:alert-drill
npm run ops:dos-drill
npm run ops:capacity-alerting-drill
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
11. `optional_ai_posture`: Verification that `ai_enabled` is `false`, `no_ai_path_verified` is `true`, `server_ai_draft_enabled_false` is `true`, `no_gemini_api_key_provisioned` is `true`, `unpaid_provider_excluded` is `true`, and `phase11_status` documents the exclusion. Any record with `ai_enabled: true` fails immediately because the unpaid Gemini Developer API preview is excluded from production launch.

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

### Deployment & Caddy Ingress Drill

1. **Caddy Ingress Routing Verification**:
   Execute `npm run ops:caddy-drill` (or `node scripts/ops/verify-caddy-routing.js`). Validates:
   - Route `@api path /api/* /graphql /health /health/ready` proxies to `api:3001` with `header_up X-Forwarded-Host {host}` and `header_up X-Forwarded-Proto {scheme}`;
   - Route `@objects path /acres-quarantine/*` proxies to `garage:3900` with `header_up Host {host}`, strictly preserving browser-visible host for S3 SigV4 signature integrity;
   - Fallback route proxies to `next:3000` for all marketing pages, authenticated `/app/*` routes, and static Next chunks;
   - Edge security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `-Server`);
   - Request body limit and transport timeouts across API, Garage, and Next;
   - HSTS gate invariant (Strict-Transport-Security remains commented out pending domain & TLS certificate approval).

2. **Automated Promotion & Rollback Drill**:
   Execute `npm run ops:deployment-drill` (or `scripts/ops/run-deployment-drill.sh [options]`). Validates:
   - Ingress & Caddy routing verification;
   - Migration backward compatibility (zero destructive DDL statements such as `DROP TABLE` or `DROP COLUMN` across migration files);
   - Operational templates, Dockerfile runtime, and secret scans;
   - Liveness (`/health`) and deep readiness (`/health/ready`) probe contracts;
   - Graceful shutdown drain periods (`stop_grace_period`: Caddy 30s, Next 30s, API 45s, Worker 60s);
   - Network isolation (only Caddy joins the public network; all backend services are private);
   - Rollback command sequence (`docker compose -f <compose> up -d --no-deps --build=never <service>`);
   - Emits structured JSON evidence reports (`backups/deployment-drill-evidence-<timestamp>.json`).

### Backup

Run `scripts/ops/backup-postgres.sh` with `PGPASSWORD` and destination configured. Back up PostgreSQL, Garage object data and metadata, deployment config, certificate state, and recoverable signing/encryption material. Backups must be encrypted, access-controlled, off-host, and separate from live volume unlock material. Role authentication falls back gracefully between `POSTGRES_PASSWORD`, `POSTGRES_SUPERUSER_PASSWORD`, and `ACRES_MIGRATOR_PASSWORD`. `acres_migrator` is provisioned with `BYPASSRLS` so that table dumps succeed completely across all tenant tables enforcing `FORCE ROW LEVEL SECURITY`.

### Restore & Drill Execution

1. **Ad-hoc Restore**:
   Use `scripts/ops/restore-postgres.sh <backup-file.dump>` to restore into a target database (`PGDATABASE=<target>`). Restores run using `pg_restore --clean --if-exists`, verify connection readiness, and assert public schema table counts.
2. **Automated Restore Drill**:
   Execute `npm run ops:restore-drill` (or `scripts/ops/run-restore-drill.sh [options]`). The runner:
   - Takes a fresh timestamped PostgreSQL backup using `backup-postgres.sh`;
   - Validates archive integrity with `pg_restore --list`;
   - Recreates an isolated drill database (`acres_restore_drill`);
   - Restores the archive using `restore-postgres.sh`;
   - Asserts table count parity, applied migration parity (`_prisma_migrations`), PostGIS spatial extension presence, foreign key integrity (`pg_constraint`), and record count invariants (`Account`, `Organization`, `Dataset`);
   - Measures elapsed time against the Recovery Time Objective (default 300s) and emits structured JSON evidence (`backups/restore-drill-evidence-<timestamp>.json`);
   - Cleans up ephemeral drill databases and archives cleanly on exit.
3. **PostgreSQL & Object Storage Reconciliation**:
   Execute `npm run ops:reconcile-storage` (or `scripts/ops/reconcile-storage-objects.js [options]`). Compares active database records (`StoredObject`, `Upload`, `ExportArtifact`) against bucket storage (Garage / S3):
   - Detects orphaned objects present in storage but absent from database metadata (storage leaks);
   - Detects missing objects referenced by active database records (data loss);
   - Asserts byte count and SHA-256 checksum alignment;
   - Excludes pending uploads, soft-deleted objects, and quarantined objects within the retention window;
   - Fails closed with exit code 1 if missing objects or corruption/checksum mismatches are found.

### Data Retention & Cleanup

Data retention jobs run automatically on the worker process (`SCHEDULER_ENABLED=true`):
- `sessions.purge-expired`: cleans expired session tokens.
- `uploads.purge-expired`: cleans uncompleted uploads and pending quarantine objects older than configured TTL.
- `idempotency.purge-expired`: cleans idempotency records past retention window.
- `tokens.purge-expired`: cleans expired password recovery and invitation tokens.
All runs are logged to the `JobRun` audit table.

### Volume Encryption, Key Separation & Recovery Inspection Runbook

1. **Volume Encryption Inspection**:
   Execute `npm run ops:volume-drill` (or `node scripts/ops/verify-volume-encryption.js`). Validates:
   - Evaluates all 9 stateful container mounts across `infra/compose/docker-compose.production.example.yml` and `infra/env/production.env.example`:
     - `postgres`: `/var/lib/postgresql` -> `${ACRES_POSTGRES_ENCRYPTED_MOUNT}`
     - `valkey`: `/data` -> `${ACRES_VALKEY_ENCRYPTED_MOUNT}`
     - `garage`: `/var/lib/garage/meta` -> `${ACRES_GARAGE_META_ENCRYPTED_MOUNT}`
     - `garage`: `/var/lib/garage/data` -> `${ACRES_GARAGE_DATA_ENCRYPTED_MOUNT}`
     - `clamav`: `/var/lib/clamav` -> `${ACRES_CLAMAV_ENCRYPTED_MOUNT}`
     - `caddy`: `/data` -> `${ACRES_CADDY_DATA_MOUNT}`
     - `caddy`: `/config` -> `${ACRES_CADDY_CONFIG_MOUNT}`
     - `prometheus`: `/prometheus` -> `${ACRES_PROMETHEUS_ENCRYPTED_MOUNT}`
     - `grafana`: `/var/lib/grafana` -> `${ACRES_GRAFANA_ENCRYPTED_MOUNT}`
   - Asserts approved host volume encryption mechanisms: `LUKS2/dm-crypt`, `aws:kms`, `gcp:cmek`, `azure:keyvault`.
   - Fails closed on any direct unencrypted host binds for stateful services or missing mount variables.

2. **Key Separation Invariant Verification**:
   - Strictly enforces that volume unlock keys, passphrases, or cloud KMS credentials are never stored within stateful volume mounts, backup archives (`backups/`), or tracked in Git.
   - Automatically scans mount paths and backup directories against forbidden key patterns (`*.key`, `*.keyfile`, `*.passphrase`, `id_rsa`, `*luks*key*`, `*kms*creds*`).
   - Asserts volume unlock material is managed strictly out-of-band by host init or approved secret store.

3. **Key Recovery Governance**:
   - Requires designated key recovery owner (`PRODUCTION_KEY_RECOVERY_OWNER`).
   - Enforces split-key / dual-custody parameters and documented recovery runbook references for disaster recovery without CI credential exposure.

### Secret Rotation & Emergency Compromise Response Runbook

1. **Automated Secret Rotation Drill**:
   Execute `npm run ops:rotation-drill` (or `scripts/ops/run-secret-rotation-drill.sh [options]`). Validates zero-downtime rotation procedures across all 7 production secret classes:
   - **Session Secret Rollover (`SESSION_SECRET`)**: Evaluates dual-key rollover window. Primary Key A signs session tokens; Key B rotated to Primary with Key A retained as Secondary during grace window. Verifies 0 dropped active sessions, and asserts that expired/retired Key A tokens are rejected after grace window.
   - **CSRF Secret Rollover (`CSRF_SECRET`)**: Evaluates token re-issuance and cookie synchronization. Stale CSRF tokens rejected fail-closed with `CSRF_INVALID`.
   - **Database Passwords (`ACRES_APP_PASSWORD`, `ACRES_MIGRATOR_PASSWORD`)**: Validates zero-downtime PostgreSQL role password rotation. Connection pool drains idle connections; in-flight queries complete safely; new connections authenticate with rotated credentials; stale passwords rejected with `28P01`.
   - **Valkey Authentication (`VALKEY_PASSWORD`)**: Evaluates dynamic runtime reload via `CONFIG SET requirepass`. Ingestion queues maintain zero message drops; stale connections rejected with `-WRONGPASS`.
   - **Storage Access Keys (`STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`)**: Evaluates S3 SigV4 signature derivation and dual-key overlap window for Garage / S3 presigned operations.
   - **SMTP Credentials & Grafana Admin Password**: Validates indirect references and secret masking.

2. **Emergency Compromise Response Drill**:
   - Simulates compromised credential scenario: triggers targeted mass session revocation (`revokeAllForAccount`) and token purge.
   - Asserts that all sessions belonging to the compromised account are instantly invalidated (`SessionsService.resolve` returns `null`), while uncompromised tenant sessions remain uninterrupted.
   - Runs `purgeExpired()` to clean revoked rows from database storage.
   - Performs secret redaction audit asserting zero raw credentials or dev passwords logged in console output, environment dumps, or drill reports.
   - Emits structured JSON audit evidence to `backups/secret-rotation-evidence-<timestamp>.json`.

## CI State

CI has `permissions: contents: read` and pins all actions to immutable
40-character commit SHAs. The `checks` job runs the full lint, typecheck, build,
contract drift, database role/migration, fail-closed server E2E, and separate
`npm run geography:plans` sequence, plus `npm run ops:check`. The Docker job
builds the server image and smoke-tests `/health` with `push: false`.

## No-AI Production Posture

Phase 11A's assistive drafting preview is implemented in the application codebase behind a feature toggle (`AI_DRAFT_ENABLED=false`) and evaluated with synthetic fixtures. However, the unpaid Gemini Developer API is strictly excluded from the production launch profile. Launch evidence must demonstrate that regional browsing, dashboards, governed reports, exports, and operational runbooks work in a verified deterministic no-AI deployment. The production launch gate enforces `AI_DRAFT_ENABLED=false`, ensures no `GEMINI_API_KEY` is present in production environments or images, and requires explicit attestation of unpaid provider exclusion. Any future production AI service requires a separate decision regarding a paid, private, or local runtime and approved operational profile.

## Phase 12E Verification & Full E2E Baseline

Implemented in Prompt 61:
1. **Server-Side Test Harness Bridge (`ENABLE_TEST_HARNESS`)**:
   - `client/lib/api/test-harness-store.ts`: Session-isolated in-memory mock store for SSR Server Components.
   - `client/app/api/test-harness/mock/route.ts`: Test harness route handler strictly guarded by `process.env.ENABLE_TEST_HARNESS === "true"`, returning 404 in production builds.
   - `client/lib/api/server.ts`: Server-side SSR intercept resolving mock dashboard summaries, reports, and datasets when test session headers/cookies are supplied by Playwright.
2. **Multi-Tenant Isolation Hardened**:
   - `client/e2e/multi-tenant-isolation.spec.ts`: 3/3 passed. Verified that Tenant A's saved views and reports do not bleed to Tenant B across distinct browser contexts, and verified 404/rejection upon tampering with organization tenant headers.
3. **Product Journeys Hardened**:
   - `client/e2e/product-journeys.spec.ts`: 8/8 passed. Verified unseeded empty guidance, populated dashboard views, report authoring/drafting, review submission and publication panel, export queuing and CSV download, dataset lifecycle with SSE stream ingestion, and Gemini preview disclosure/proposal workflows.
4. **Complete Test Suite Baseline**:
   - `npm run test:client:e2e`: 74/74 tests passed across 11 test files in 52.8s.
   - `npm run test:server`: 131/131 tests passed across 6 test suites in 41.0s.
   - `npm run ops:check`: 12/12 readiness tests passed, zero critical dependencies, template checks passed, secret scan passed.
   - Zero critical vulnerabilities in production dependencies (Next.js 16.3.4 patch applied).

## Phase 12F Disaster Recovery Restore Drill & Storage Object Reconciliation

Implemented in Prompt 62:
1. **Automated Disaster Recovery Restore Drill Runner (`scripts/ops/run-restore-drill.sh`)**:
   - Executes automated end-to-end backup, archive validation, target database recreation, restore, and parity verification against an isolated target database (`acres_restore_drill`).
   - Verifies table counts (46 tables in `public` schema), applied migration counts (17 migrations), PostGIS spatial extension presence, foreign key integrity, and record invariants (`Account`, `Organization`, `Dataset`).
   - Evaluates Recovery Time Objective (RTO): elapsed time 2098 ms (< 300s target threshold; `rto_compliant: true`).
   - Automatically cleans up ephemeral drill databases and backup dumps on exit.
   - Emits structured JSON evidence reports (`backups/restore-drill-evidence-<timestamp>.json`).
2. **PostgreSQL & Object Storage Reconciliation Utility (`scripts/ops/reconcile-storage-objects.js` & `.ts`)**:
   - Pure, deterministic reconciliation engine comparing active `StoredObject`, `Upload`, and `ExportArtifact` rows against object storage keys (Garage / S3).
   - Detects orphaned objects in storage (storage leaks), missing objects referenced by database (data loss), and byte count/checksum mismatches.
   - Excludes pending uploads, soft-deleted objects, and quarantined items within retention windows.
   - Fails closed with exit code 1 on missing objects or corruption/checksum mismatches.
3. **Automated Test Coverage**:
   - `scripts/ops/reconcile-storage-objects.spec.js`: 9/9 unit tests passed in 76ms testing clean matches, orphan detection, missing detection, size/checksum corruption, upload state exclusions, quarantine retention windows, tenant/prefix filtering, and operational marker exclusions.
4. **Operations & CI Integration**:
   - Root package scripts: `npm run ops:restore-drill`, `npm run ops:reconcile-storage`, `npm run ops:reconcile-test`.
   - Integrated into `npm run ops:check` and CI gate.

## Phase 12G Caddy Same-Origin Ingress & Deployment Promotion/Rollback Drill

Implemented in Prompt 63:
1. **Production Caddy Configuration & Same-Origin Routing Verification Engine (`scripts/ops/verify-caddy-routing.js` & `.spec.js`)**:
   - Pure Node.js Caddyfile parser and route evaluation engine.
   - Evaluates route dispatching: `@api path /api/* /graphql /health /health/ready` -> `api:3001` with `X-Forwarded-Host` and `X-Forwarded-Proto` proxy headers.
   - Preserves S3 SigV4 signature integrity: `@objects path /acres-quarantine/*` -> `garage:3900` with `header_up Host {host}` preserving the client Host header.
   - Directs all other traffic (`/`, `/login`, `/register`, `/app/*`, `/_next/*`) to Next.js fallback proxy (`next:3000`).
   - Enforces edge security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and `-Server` banner removal.
   - Enforces transport timeouts across API, Garage, and Next (`read_timeout`, `write_timeout`, `dial_timeout`) and request body limits (`{$ACRES_MAX_REQUEST_BODY}`).
   - Enforces HSTS gate invariant (Strict-Transport-Security remains commented out pending operator domain/cert approval).
   - Unit test suite (`verify-caddy-routing.spec.js`): 10/10 tests passing in 70ms.
2. **Automated Deployment Promotion & Rollback Drill Runner (`scripts/ops/run-deployment-drill.sh`)**:
   - Automated drill runner verifying Caddy ingress, database migration backward compatibility, operational templates, secret scans, readiness probes, and rollback procedures.
   - Verifies zero destructive DDL statements across migrations (additive-only schema changes).
   - Validates service `stop_grace_period` (Caddy: 30s, Next: 30s, API: 45s, Worker: 60s) and network isolation.
   - Emits structured JSON evidence reports (`backups/deployment-drill-evidence-<timestamp>.json`).
3. **Operations & CI Integration**:
   - Added root package scripts `npm run ops:caddy-drill` and `npm run ops:deployment-drill`.
   - Added `npm run ops:caddy-test` to `npm run ops:check` and CI verification pipeline.
   - Closes the open Phase 5 Caddy ingress routing item in `docs/authenticated-app.md` and `docs/build-plan.md`.

## Phase 12H Production Volume Encryption Key Separation & Secret Rotation Drill

Implemented in Prompt 64:
1. **Production Volume Encryption & Key Separation Engine (`scripts/ops/verify-volume-encryption.js` & `.spec.js`)**:
   - Deterministic Node.js validator evaluating stateful volume encryption, key separation, and recovery governance (TM-21).
   - Validates all 9 stateful container mounts across `infra/compose/docker-compose.production.example.yml` and `infra/env/production.env.example`:
     - `postgres`: `/var/lib/postgresql` -> `${ACRES_POSTGRES_ENCRYPTED_MOUNT}`
     - `valkey`: `/data` -> `${ACRES_VALKEY_ENCRYPTED_MOUNT}`
     - `garage`: `/var/lib/garage/meta` -> `${ACRES_GARAGE_META_ENCRYPTED_MOUNT}`
     - `garage`: `/var/lib/garage/data` -> `${ACRES_GARAGE_DATA_ENCRYPTED_MOUNT}`
     - `clamav`: `/var/lib/clamav` -> `${ACRES_CLAMAV_ENCRYPTED_MOUNT}`
     - `caddy`: `/data` -> `${ACRES_CADDY_DATA_MOUNT}`
     - `caddy`: `/config` -> `${ACRES_CADDY_CONFIG_MOUNT}`
     - `prometheus`: `/prometheus` -> `${ACRES_PROMETHEUS_ENCRYPTED_MOUNT}`
     - `grafana`: `/var/lib/grafana` -> `${ACRES_GRAFANA_ENCRYPTED_MOUNT}`
   - Asserts approved host volume encryption mechanisms (`LUKS2/dm-crypt`, `aws:kms`, `gcp:cmek`, `azure:keyvault`).
   - Strictly enforces Key Separation Invariant: automatically scans mount paths, backup directories (`backups/`), and Git tracking for keyfiles (`*.key`, `*.keyfile`, `*.passphrase`, `id_rsa`, `*luks*key*`, `*kms*creds*`), failing closed upon detection.
   - Unit test suite (`verify-volume-encryption.spec.js`): 12/12 unit tests passing in 90ms.
2. **Automated Secret Rotation & Compromise Drill Runner (`scripts/ops/run-secret-rotation-drill.sh`)**:
   - Automated drill runner executing zero-downtime secret rotation and emergency compromise response (TM-15).
   - Verifies dual-key session rollover (`SESSION_SECRET`) with zero dropped active sessions during the rollover window, and immediate rejection of expired/retired keys.
   - Verifies CSRF secret rollover with fail-closed rejection of stale tokens (`CSRF_INVALID`).
   - Verifies PostgreSQL database password rotation (`ACRES_APP_PASSWORD`, `ACRES_MIGRATOR_PASSWORD`) with connection pool drain verification and preservation of in-flight queries.
   - Verifies Valkey runtime credential update (`CONFIG SET requirepass`) with zero dropped queue messages.
   - Verifies S3 / Garage access key pair rotation with dual-key overlap window and SigV4 signature derivation.
   - Verifies emergency compromise response: targeted mass revocation (`revokeAllForAccount`) and dead row purge (`purgeExpired`).
   - Audits secret redaction: verifies zero raw secret strings or local dev passwords in console logs, environment dumps, or drill reports.
   - Emits structured JSON audit evidence reports (`backups/secret-rotation-evidence-<timestamp>.json`).
3. **Operations & CI Integration**:
   - Added root package scripts: `npm run ops:volume-test`, `npm run ops:volume-drill`, and `npm run ops:rotation-drill`.
   - Integrated `npm run ops:volume-test` and template verification into `npm run ops:check` and `scripts/ops/check-production-templates.sh`.
   - Closes TM-15 and TM-21 operational verification gates.

## Phase 12I Supply-Chain Security, Deterministic SAST & Container Build Hardening

Implemented in Prompt 65:
1. **Deterministic Software Bill of Materials (SBOM) Generator & License Validator (`scripts/ops/generate-sbom.js` & `.spec.js`)**:
   - Generates CycloneDX v1.5 JSON Software Bill of Materials covering all production dependencies across root, server, client, and shared workspaces (TM-18).
   - Computes package URLs (`purl`), version strings, SHA-512 integrity hashes, and license expressions.
   - Enforces license compliance: asserts all production packages comply with approved permissive licenses (`MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `0BSD`, `CC0-1.0`, `Unlicense`, `BlueOak-1.0.0`, `Python-2.0`, `CC-BY-4.0`, project-approved GSAP, and dynamically linked Sharp LGPL binary), rejecting unapproved copyleft or viral licenses (`AGPL-1.0`, `AGPL-3.0`, `GPL-1.0`, `GPL-2.0`, `GPL-3.0`, `SSPL`, `CommonsClause`).
   - Strictly excludes build/dev dependencies (`@types/*`, `typescript`, `playwright`, `jest`, `eslint`).
   - Unit test suite (`generate-sbom.spec.js`): 7/7 unit tests passing in 100ms.
2. **Deterministic Static Application Security Testing (SAST) Scanner & Triage Engine (`scripts/ops/run-sast-scan.js` & `.spec.js`)**:
   - Pure Node.js static analysis engine scanning source trees (`client/`, `server/`, `packages/shared/`, `scripts/`) across 8 core security rules:
     - `SAST-01`: SQL Injection (`$queryRawUnsafe`, `$executeRawUnsafe`, direct string concatenation in queries);
     - `SAST-02`: Command Injection (`child_process.exec/execSync` interpolation, `shell: true`);
     - `SAST-03`: Path Traversal (unvalidated `../` in filesystem calls);
     - `SAST-04`: Hardcoded Secrets (private keys, API tokens, JWT secrets, database connection passwords);
     - `SAST-05`: ReDoS (catastrophic backtracking regular expression patterns with nested quantifiers);
     - `SAST-06`: Multi-Tenant Isolation Bypass (unfiltered `findMany` queries on tenant-scoped Prisma models);
     - `SAST-07`: Stored XSS / Dangerous HTML (`dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`);
     - `SAST-08`: Insecure Cryptography (`createHash('md5')`, `createHash('sha1')`, deprecated cipher APIs).
   - Triage Policy Registry (`infra/security/sast-triage.json` & `.schema.json`):
     - Structured JSON schema recording approved suppressions, rule ID, path, line, severity, rationale, owner, and expiration date.
     - Fail-closed expiration gating: any expired suppression is treated as an active blocking finding.
   - Unit test suite (`run-sast-scan.spec.js`): 11/11 unit tests passing in 150ms.
3. **Container Security & Multi-Stage Build Hardening Validator (`scripts/ops/verify-container-security.js` & `.spec.js`)**:
- Statically evaluates `server/Dockerfile`, `infra/docker/client.Dockerfile.example`, and `infra/compose/docker-compose.production.example.yml`.
   - Validates Node 24 Alpine pinned base, multi-stage separation (`deps`, `build`, `prod-deps`, `runtime`), `USER node` non-root runtime enforcement, bounded healthchecks (`--interval=30s --timeout=5s`), direct exec JSON array CMD for POSIX signal propagation, and layer hygiene (zero inclusion of `.env`, `*.pem`, `*.key`).
   - Validates Compose network isolation (`networks.private.internal: true`), datastore network binding (`postgres`, `valkey`, `garage`, `clamav`, `prometheus` isolated to private network), mandatory `${VAR:?msg}` credential injection syntax, and service healthchecks.
   - Unit test suite (`verify-container-security.spec.js`): 8/8 unit tests passing in 80ms.
4. **Operations & CI Integration**:
   - Root package scripts: `npm run ops:sbom`, `npm run ops:sbom-test`, `npm run ops:sast`, `npm run ops:sast-test`, `npm run ops:container-test`, `npm run ops:container-security`.
   - Integrated `ops:sbom-test`, `ops:sast-test`, `ops:container-test`, `ops:sast`, and `ops:container-security` into `npm run ops:check`.
   - Closes TM-18 supply-chain and container security requirements.

## Phase 12J Capacity, Load Resilience & Alert Simulation Drill

Implemented in Prompt 66:
1. **Performance, Capacity, and Latency Evaluation Engine (`scripts/ops/verify-capacity-load.js` & `.spec.js`)**:
   - Pure Node.js statistical performance benchmark evaluation engine (TM-20, Category 5 SLOs).
   - Evaluates performance against Category 5 SLO requirements (`infra/launch/readiness.example.json`):
     - Availability Target: `>= 99.9%` (error rate `< 0.1%` under normal operating conditions);
     - Max p95 Latency Ceiling: `<= 500 ms` for standard API and read requests;
     - Capacity Target: `>= 100 RPS` throughput under concurrent load without connection starvation.
   - Computes exact statistical distributions: request count, successful/failed requests, availability percentage, throughput (RPS), min, p50, p90, p95, p99, max, mean, and standard deviation.
   - Enforces mathematical monotonicity invariant: `min <= p50 <= p90 <= p95 <= p99 <= max`.
   - Supports deterministic synthetic workload simulation for reproducible CI/offline execution, as well as live HTTP benchmarking (`--target-url`, `--concurrency`, `--duration-sec`).
   - Emits structured JSON audit evidence reports (`backups/capacity-load-report-<timestamp>.json`).
   - Unit test suite (`verify-capacity-load.spec.js`): 9/9 unit tests passing in 90ms.
2. **Automated Multi-Layer DoS & Rate Limiting Drill Runner (`scripts/ops/run-dos-resilience-drill.sh`)**:
   - Automated drill runner asserting defense-in-depth DoS resilience across all 5 protection boundaries (TM-05, TM-20):
     - **Layer 1: Edge Ingress Bounds (Caddy)**: Request body limit (`$ACRES_MAX_REQUEST_BODY`) and transport timeouts (`read_timeout`, `write_timeout`, `dial_timeout`);
     - **Layer 2: In-Process Rate Limiting & Throttling (NestJS)**: RateLimitGuard enforcing `RATE_LIMIT_DEFAULT_LIMIT` (120 req/min) and `RATE_LIMIT_STRICT_LIMIT` (10 req/min). `@StrictThrottle` decorator verified on sensitive endpoints (`POST /api/v1/auth/login`, `POST /api/v1/auth/register`, `POST /api/v1/auth/forgot-password`, `POST /api/v1/forms/contact`) asserting fail-closed HTTP 429 `RATE_LIMITED`. `@SkipThrottle` verified on `/health` and `/metrics` preventing DoS starvation of liveness/readiness probes;
     - **Layer 3: GraphQL Resource Bounds**: Pre-parse 12KB ceiling (`GRAPHQL_MAX_BYTES`), max depth 8 (`GRAPHQL_MAX_DEPTH`), max aliases (`GRAPHQL_MAX_ALIASES`), complexity ceiling 250 (`GRAPHQL_MAX_COST`), and node ceiling 250 (`GRAPHQL_MAX_NODES`), with strict single-operation enforcement;
     - **Layer 4: Storage & Upload Bounds**: 50MB streaming ceiling (`UPLOAD_MAX_BYTES`) and ClamAV quarantine scanning isolation prior to S3 bucket publication;
     - **Layer 5: Anti-Enumeration Timing Defense**: Constant-time bcrypt execution via dummy password verification on missing accounts (`accounts.verifyPassword(null, 'dummy-password-check')`).
   - Emits structured JSON audit evidence reports (`backups/dos-resilience-evidence-<timestamp>.json`).
3. **Prometheus Alerting Rule Expansion & Synthetic Simulation Engine (`scripts/ops/verify-alert-rules.js` & `.spec.js`)**:
   - Expands `infra/prometheus/alerts.yml` to 7 golden signal and threat detection rules:
     1. `AcresApiDown` (Availability: `up{job="acres-api"} == 0`, for 1m, critical);
     2. `HighHttp5xxRate` (Errors: > 5% 5xx over 5m, for 5m, critical);
     3. `P95LatencyThresholdExceeded` (Latency: p95 latency > 500ms over 5m, for 5m, warning);
     4. `High429Rate` (Security: HTTP 429 rate > 10% over 5m, for 5m, warning);
     5. `QueueDeadLettersDetected` (Queue Health: failed jobs > 0, for 1m, warning);
     6. `OutboxDeliveryLag` (Outbox Health: > 50 pending events for > 10m, for 10m, warning);
     7. `DatabaseConnectionPoolSaturation` (Resources: active requests > 40, for 2m, warning).
   - Statically validates PromQL expressions, durations, severities, and annotations.
   - Evaluates synthetic time-series metric data verifying that each alert fires when thresholds are breached and clears when healthy.
   - Unit test suite (`verify-alert-rules.spec.js`): 9/9 unit tests passing in 100ms.
4. **Top-Level Capacity & Alerting Drill Runner (`scripts/ops/run-capacity-alerting-drill.sh`)**:
   - Unified drill orchestrator executing alert verification, capacity evaluation, and DoS resilience checks.
   - Emits consolidated JSON audit evidence reports (`backups/capacity-alerting-drill-evidence-<timestamp>.json`).
5. **Capacity, Load & Alerting Drill Runbook**:
   - Command: `npm run ops:capacity-alerting-drill` (or `npm run ops:capacity-drill`, `npm run ops:alert-drill`, `npm run ops:dos-drill`).
   - Criteria: All 7 alert rules valid and simulated, Availability >= 99.9%, p95 latency <= 500ms, throughput >= 100 RPS, and all 5 DoS defense layers verified.
   - Evidence: Inspect generated report in `backups/capacity-alerting-drill-evidence-<timestamp>.json`.
6. **Operations & CI Integration**:
   - Added root package scripts: `npm run ops:capacity-test`, `npm run ops:capacity-drill`, `npm run ops:alert-test`, `npm run ops:alert-drill`, `npm run ops:dos-drill`, `npm run ops:capacity-alerting-drill`.
   - Integrated `npm run ops:capacity-test` and `npm run ops:alert-test` into `npm run ops:check`.
   - Updated `scripts/ops/check-production-templates.sh` requiring all 7 alerts, alert rule verification, and capacity evaluation.
   - Closes TM-05, TM-16, TM-20, and Category 5 launch readiness requirements.

## Phase 12K Unified Launch Drill, Checklist & Runbooks

Implemented from `prompts/67-unified-launch-drill-runner-and-operator-launch-checklist.md`.
This is the Phase 12 exit gate: one orchestrator, one dossier, one checklist.

1. **Unified Launch Drill Orchestrator (`scripts/ops/run-launch-drills.sh`)**:
   - Bash (matching the sibling drills). Executes 7 stages (`static_templates`,
     `supply_chain_sast`, `ingress_deployment`, `volume_encryption`,
     `secret_rotation`, `capacity_alerting`, `disaster_recovery`) and emits the
     Unified Launch Evidence Dossier
     (`backups/launch-evidence-dossier-<timestamp>.json`) with `version`,
     extended-ISO `timestamp`, `environment`, `overall_status`,
     `total/passed/failed_stages`, `duration_seconds`, per-stage
     `stage_id`/`status`/`duration_ms`/`artifacts`/`error_message`, and a
     `summary` across integrity, security, SLO, recovery, and no-AI posture.
   - Each stage captures child output to
     `launch-drill-stage-<stage_id>.log`; dossier `artifacts` list that log
     plus discovered child evidence, closed by the dossier path.
   - Flags: `--dry-run`, `--json`, `--output <path>`, `--evidence-dir <dir>`,
     `--verbose`, `--help`. Without `--dry-run`, children run live against
     drill infra — except secret rotation, which stays `--dry-run` by design.
     Exit 0 only when every stage passes.
   - Unit suite (`scripts/ops/run-launch-drills.spec.js`): 9/9 tests
     (executable bit, help text, missing-value guards, unknown-option
     rejection, schema-compliant dossier with offline stages 1–6 passing plus
     real child-evidence/log artifact links, `--json` stdout identity,
     `--evidence-dir` redirection, default `backups/` output, fail-closed via
     deterministic `SOURCE_DB == DRILL_DB` rejection). Full runs pass
     `--evidence-dir` to a temp dir so the repo `backups/` stays clean.
   - Known constraint (judgement, verified): stages 1–6 run fully offline;
     stage 7 `disaster_recovery` requires live drill infra even in `--dry-run`
     (PGPASSWORD + reachable Postgres for the restore drill; authenticated
     Postgres + reachable Garage/S3 for reconciliation) and fails closed
     otherwise. `npm run ops:launch-drill` therefore exits 1 until drill infra
     is present — that is the gate working, not a defect.
2. **Operator Launch Checklist (`docs/launch-checklist.md`)**: 11-category
   verification matrix (drill command, evidence artifact, acceptance criteria
   per category), 7 Prometheus alert runbooks with PromQL, triage,
   containment, escalation, and clearing conditions, rollback/DR procedures,
   and the formal sign-off matrix.
3. **Launch Readiness Evidence Cross-Validation
   (`scripts/ops/check-launch-readiness.js`)**: approved sections referencing
   `.json` evidence paths now require the file to exist, parse as JSON
   (single-`*` globs supported), and not report drill failure
   (`status`/`overall_status` failure, `success: false`, or non-zero
   `summary.exitCode`). Relative paths resolve against the working directory
   first (the documented `backups/…` form), then the readiness file's own
   directory. Spec extended to 19/19 tests (pass, missing-file,
   failure-report, invalid-JSON, non-approved-section skip, subdir-relative
   resolution, and exitCode paths).
4. **Operations & CI Integration**:
   - Root package scripts: `npm run ops:launch-drill`, `npm run ops:launch-drill-test`;
   - Integrated `npm run ops:launch-drill-test` into `npm run ops:check`;
   - `scripts/ops/launch-readiness.sh` accepts `--with-drills` (runs the
     unified orchestrator before the readiness check) and `--help`.
