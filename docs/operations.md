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
2. `acres_http_429_responses_total`: Unlabeled counter of HTTP 429 responses; the `High429Rate` alert uses its 5-minute rate over the rate of all HTTP requests.
3. `acres_http_request_duration_seconds`: Histogram with Web latency buckets `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`.
4. `acres_http_active_requests`: Gauge of current in-flight requests.
5. `acres_outbox_pending_events`: Gauge tracking pending outbox events.
6. `acres_queue_jobs_total`: Counter by `queue_name`, `status`.
7. `acres_queue_active_jobs` and `acres_queue_waiting_jobs`: Gauges for queue depth.
8. `acres_scheduled_job_runs_total`: Counter by `job_name`, `status`.
9. `acres_postgres_pool_connections_total`, `acres_postgres_pool_connections_idle`, `acres_postgres_pool_connections_max`, and `acres_postgres_pool_requests_waiting`: unlabeled gauges sampled from the API process's `pg.Pool` during a scrape, without a query. The Grafana dashboard plots connections and acquisition backlog separately.

The API pool is created lazily with the existing 5000 ms connection timeout and
closed once during Prisma shutdown. A fresh API process reports zero total,
idle, and waiting connections and the driver's effective maximum. A failed
snapshot fails the scrape instead of preserving an old value. `waiting > 0`
demonstrates local pool acquisition backlog; `total == max` alone does not
prove saturation. This API sample does not cover the separately scraped worker, migrator, other
clients, server-wide connection limits, lock waits, query duration, or wait
duration.
No pool saturation alert or threshold is configured; production capacity
evidence is still needed before setting one. Rolling back this change removes
the gauges and dashboard panels, returning to an unobserved API pool.

The 429 counter records responses observed by the NestJS metrics middleware.
Responses generated solely at the Caddy edge are outside this API metric and
require edge access logs for investigation. An unlabeled `prom-client` counter
exports `0` before its first increment, so the 429 rate has a zero baseline.

**Cardinality and Redaction Invariant**: `route_group` collapses all paths to
fixed parameterized route templates (e.g. `/api/v1/auth`, `/api/v1/organizations`,
`/api/v1/reports`, `/api/v1/uploads`, `/graphql`, `/health`, `/metrics`, `other`).
Raw UUIDs, user IDs, organization IDs, tokens, query parameters, and error
messages are strictly excluded from metric labels.

`MetricsService.recordParserExecution()` (prompt 125) admits only
`SourceKind` (`csv | xlsx | geojson`) via one new type-only
`import type { SourceKind } from '../ingestion/parsers/parser.types'`,
erased at compile time with no runtime module edge to the ingestion parser
tree. The `safeKind` → `'unknown'` guard stays byte-for-byte unchanged as
defense-in-depth for untyped callers and preserves the bounded `source_kind`
label cardinality invariant. No label value, exposition line, or
counter/histogram behavior changed (`acres_parser_executions_total`,
`acres_parser_execution_duration_seconds`).

### Worker telemetry (prompt 169, 2026-09-23)

The worker remains a Nest application context. After its initial outbox dispatch and queue startup return, a separate Node HTTP listener serves exact `GET /health` (plain `ok`, process-start readiness only) and `GET /metrics` (the worker's own `prom-client` registry). Other paths return 404, other methods 405, and collection failure returns an empty 503. The listener binds `127.0.0.1:3002` by default; production Compose sets `WORKER_METRICS_HOST=0.0.0.0` on the isolated `private` network, exposes port 3002 only to peers, and does not publish it or route it through Caddy. `WORKER_METRICS_PORT` accepts only 1–65535. The worker Compose healthcheck overrides the shared image's API probe and calls `127.0.0.1:3002/health`. The listener stops accepting and closes active scrape connections before job drain and Nest shutdown, so a stalled collector cannot delay worker drain; startup failure cleans up the worker and application context.

Prometheus scrapes `acres-worker` every 30 seconds. This registry exports worker queue, parser and scheduled-job counters plus process-local `pg.Pool` total, idle, waiting, and configured maximum gauges. The pool snapshot itself issues no query; the existing outbox-pending collector **does** query PostgreSQL on each scrape and currently catches its own failures, so that gauge can be stale if the database is unavailable. A failed pool collector fails the scrape and makes `up{job="acres-worker"}` zero. The dashboard shows worker status and worker pool panels apart from API panels. HTTP, 429, latency, concurrency, and outbox alerts select `acres-api`; the queue-dead-letter alert selects `acres-worker`. This avoids duplicate outbox alert instances. All seven alert names, thresholds, and severities remain unchanged.

Verification on 2026-09-23: the focused listener/config suite passed 137/137 tests; the complete server unit suite passed 120/120 suites and 1851/1851 tests before the stalled-scrape follow-up; its focused listener suite then passed 4/4 tests; the server E2E suite passed 6/6 suites and 143/143 tests. `npm run ops:templates` passed; `npm run ops:alert-test` passed; `npm run ops:alert-drill` passed 16/16 checks; `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed. The sandboxed listener test could not bind localhost (`EPERM`) and the sandboxed Next build could not parse the TypeScript `--showConfig` subprocess output; both completed when rerun with local execution permission. No Docker/Prometheus live scrape, production traffic, or PostgreSQL-wide load was measured.

These are two process-local pool snapshots, not PostgreSQL-wide connection counts. Lock/query diagnostics, acquisition wait duration, all other clients, and an evidence-based pool saturation threshold remain open. Rollback removes the worker listener, scrape, and dashboard panels and restores the old worker image healthcheck limitation; alert selectors should be reconsidered only with the target topology.

## Artifacts

| file | purpose |
| --- | --- |
| `infra/caddy/Caddyfile.example` | Same-origin Caddy routing, baseline security headers, request-size and timeout placeholders, and an explicit HSTS approval gate |
| `infra/compose/docker-compose.production.example.yml` | Inert single-host Compose reference for Caddy, Next, API, worker, Postgres/PostGIS, Valkey, Garage, ClamAV, and optional observability |
| `infra/docker/client.Dockerfile.example` and `infra/docker/client.Dockerfile.example.dockerignore` | Example Node 24 production image for the Next client, with a Dockerfile-specific context ignore because the root `.dockerignore` intentionally excludes client source for the server image |
| `infra/env/production.env.example` and `infra/env/garage.production.env.example` | Production environment inventory with `__REQUIRED_*__` sentinels for operator-provided values and every Compose interpolation variable; Garage admin/metrics secrets stay service-scoped |
| `infra/prometheus/prometheus.yml` and `infra/prometheus/alerts.yml` | Prometheus scrape configuration for `prometheus` and `acres-api`, plus alert rules (`AcresApiDown`, `AcresWorkerDown`, `HighHttp5xxRate`, `P95LatencyThresholdExceeded`, `High429Rate`, `QueueDeadLettersDetected`, `OutboxDeliveryLag`, `HighHttpConcurrency`, `DatabaseConnectionPoolSaturation`) |
| `infra/grafana/provisioning/**` and `infra/grafana/dashboards/acres-operations.json` | Operational Grafana dashboard with RED service metrics, queue depth, outbox lag, scheduled job health, and API process pool state |
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
| `scripts/ops/verify-alert-rules.js` & `.spec.js` | Prometheus alert rule validator and time-series simulation engine verifying 9 golden signal and threat alerts (`AcresApiDown`, `AcresWorkerDown`, `HighHttp5xxRate`, `P95LatencyThresholdExceeded`, `High429Rate`, `QueueDeadLettersDetected`, `OutboxDeliveryLag`, `HighHttpConcurrency`, `DatabaseConnectionPoolSaturation`) |
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
10. `deployment_and_rollback`: Target host architecture, OCI registry host or repository prefix, deployment approver, rollback authority, image provenance policy (Cosign/OIDC), live readiness drill status, and a structured `release` record. `release.reviewed_source_commit` is exactly 40 hex characters. `release.current.client_image`, `release.current.server_image`, `release.previous.client_image`, and `release.previous.server_image` are complete pinned image references. `release.client_provenance_evidence`, `release.server_provenance_evidence`, and `release.live_drill_evidence` are distinct local JSON paths or stable external artifact identifiers (for example, `artifact:release-123-client-verification`). The current images must have `image_registry_path` as a complete registry host or repository prefix, followed by `/`; prior images may come from a former registry.
11. `optional_ai_posture`: Verification that `ai_enabled` is `false`, `no_ai_path_verified` is `true`, `server_ai_draft_enabled_false` is `true`, `no_gemini_api_key_provisioned` is `true`, `unpaid_provider_excluded` is `true`, and `phase11_status` documents the exclusion. Any record with `ai_enabled: true` fails immediately because the unpaid Gemini Developer API preview is excluded from production launch.

### Running the Validator

```bash
# Evaluate the default checked-in example (expected: fails closed with blockers)
npm run ops:launch-readiness

# In the release shell, export the exact current client/server digest pair,
# then evaluate the operator-provided readiness record:
npm run ops:launch-readiness -- infra/launch/production-readiness.json
# or directly:
node scripts/ops/check-launch-readiness.js infra/launch/production-readiness.json
```

### Distinction: `ops:check` vs `ops:launch-readiness`

- `npm run ops:check`: **CI-safe**. Validates that all production templates exist, parse cleanly as YAML/JSON, have correct service scopes, do not leak secrets into git, and that dependencies have no critical vulnerabilities. It passes in CI on every push.
- `npm run ops:launch-readiness`: **Launch-gated fail-closed validator**. Runs all baseline checks and then validates the readiness record. The checked-in template `infra/launch/readiness.example.json` intentionally fails with unresolved blockers across all 11 categories because operator decisions and live host drills have not been performed.

### Expected Failing Output on Checked-in Example

When run against `infra/launch/readiness.example.json`, `npm run ops:launch-readiness` outputs:

```
================================================================================
ACRES LAUNCH READINESS EVALUATION
Target: infra/launch/readiness.example.json
================================================================================

Unresolved Launch Blockers by Category:
... (lists unresolved placeholders and unapproved categories) ...

--------------------------------------------------------------------------------
SUMMARY:
  Total Required Categories: 11
  Approved Categories:       0
  Unresolved / Blocked:      11
  Total Blockers Detected:   69
================================================================================

Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
This repository intentionally fails closed until real operator decisions and live drills are recorded.
```

### Release evidence binding (prompts 164–165)

The deployment category now requires a reviewed source commit, distinct current
and previous pinned client/server pairs, and three distinct evidence references.
The validator reuses the release-image preflight grammar, checks the current
registry host/repository prefix on a path boundary, checks local JSON evidence
for missing files and failure markers, and compares the current pair with
`ACRES_CLIENT_IMAGE`/`ACRES_SERVER_IMAGE` for every approved deployment check.
Scheme-prefixed artifact URIs remain external references for operator inspection,
including those ending in `.json`. These structural checks cannot establish
cryptographic provenance or prove publication, promotion, or drill execution.

Verification on 2026-09-23: `ops:readiness-test`, `ops:release-images-test`,
`ops:templates`, `ops:check`, `lint`, `typecheck`, `contracts:check`, and the
production `build` passed. `ops:launch-readiness` exited 1 as expected for the
checked-in example, with 0 approved categories and 69 blockers. The audit and
build needed unrestricted network/process access in this environment; the
initial restricted attempts failed at registry DNS and Next's TypeScript
`--showConfig` subprocess respectively. No release image was published or
deployed.

Prompt 165 closes the optional-binding bypass: an approved
`deployment_and_rollback` section now requires the exported current client and
server digest pair on both the direct Node CLI and `ops:launch-readiness`.
Missing or mismatched exports produce field-only blockers without echoing the
supplied values. The unapproved template still needs no exports and fails for
its 69 operator-owned blockers. Verification on 2026-09-23: the focused
readiness suite passed 24/24 tests; `ops:release-images-test`, `ops:templates`,
`ops:check`, `lint`, `typecheck`, `build`, `contracts:check`, and
`git diff --check` exited 0. The template command exited 1 as expected with
0 approved categories. Restricted runs of the subprocess test and Next build
hit process `EPERM`; the restricted dependency audit hit registry DNS
`EAI_AGAIN`. The same checks passed with the required process and network
access. No release image was published or deployed.

## Runbooks

### Preflight

The reference production Compose uses required digest inputs for `next`,
`api`, and `worker`; API and worker use the same server digest and have no
production-host source build fallback. `npm run ops:templates` checks this
static contract, and `npm run ops:release-images-test` covers invalid inputs.
CI still builds and smoke-tests local images only; it does not publish, attest,
verify provenance, or promote release images.
On 2026-09-23, the new release-image test, template check, container security
check, and deployment dry-run exited 0. A synthetic pinned pair passed the
preflight and Compose 5.5.1 `config --quiet` with both example env files;
a tag-only client reference failed with exit 1. The full `ops:check`, lint,
typecheck, contract check, and production build exited 0 when run with the
network/process access their tools require. No image was published or deployed.

1. Resolve every `__REQUIRED_*__` value from `infra/env/production.env.example` through the approved secret store or host mechanism.
2. Run `npm run ops:check` from the repository root.
3. Run the normal repository verification suite.
4. Retain the reviewed 40-hex source commit and previous known-good client/server digest pair. Build and publish the new pair through the operator-approved external release process. Separately verify each digest's provenance against the reviewed commit under `image_provenance_policy`; save distinct, stable verification artifact references. Complete the live promotion and rollback drill and save its evidence reference. Inspect the external artifacts before approval: the local validator only checks reference structure and local JSON failure markers, not signatures, registry contents, source-to-build origin, or whether a drill truly ran.
5. Fill `deployment_and_rollback.release` with the source commit, current and previous pairs, and the three evidence references described above. The `image_registry_path` is a registry host or repository prefix, never a substring match. Do not store attestation tokens, signing keys, credentials, or registry auth in the record. Export `ACRES_CLIENT_IMAGE` and `ACRES_SERVER_IMAGE` once in the release shell through the approved environment injector as the exact **current** pair. In that **same shell**, run `npm run ops:launch-readiness -- <operator-readiness.json> && node scripts/ops/check-release-images.js && docker compose --env-file <production-env-file> --env-file <garage-env-file> -f infra/compose/docker-compose.production.example.yml config --quiet`. The direct `node scripts/ops/check-launch-readiness.js <operator-readiness.json>` command enforces the same binding. Keep both exports unchanged for migration and production Compose commands. Compose gives exported shell variables precedence over values in `--env-file` ([Docker interpolation precedence](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)), so all three checks inspect the same pair. Approved deployment readiness fails when either export is absent or mismatched. Avoid printing the resolved production environment.
6. Confirm only Caddy publishes host ports, stateful services use encrypted mounts, and Grafana/Prometheus are not public unless an authenticated operator path has been approved.

### Deploy

1. Confirm the preflight and Compose validation passed for the exact reviewed client/server digests being promoted.
2. Apply database migrations with the migrator identity before starting the new API/worker pair.
3. Start/replace Caddy, Next, API, worker, and private dependencies with the production environment injected at runtime.
4. Verify `GET /health` for liveness and `GET /health/ready` for dependency readiness through the Caddy path and from the private network.
5. Verify `GET /metrics` answers on the private API network (`http://api:3001/metrics`).
6. Run the authenticated smoke journeys: marketing page, login/register, `/app`, dashboards, reports, report export request/status, and download metadata.

### Rollback

Keep the previous Caddy/app configuration and known-good client/server digests available. Application rollback restores both previous digest references as one pair. Schema rollback is not assumed: migrations must be backward-compatible for at least one release cycle, and irreversible data changes use forward fixes unless a reviewed undo migration exists.

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

Approved Category 6 readiness records require a UTC five-field backup cron
schedule with `*` in the hour, day-of-month, month, and day-of-week fields.
The minute field supports `*`, a single minute `0..59`, `*/n` (`1..60`), or
distinct comma-separated minutes. The validator expands the minutes and checks
the largest gap between starts, including across an hour boundary, against
`rpo_hours × 60` without rounding. The checked-in example uses `0 * * * *`
for its one-hour RPO. Unsupported or slower schedules block approval.
This static frequency check does not establish achieved RPO: the operator must
provide evidence of successful completion, encrypted off-host transfer,
PostgreSQL and Garage coverage, freshness, and restore under actual load.
`backup-postgres.sh` alone does not schedule or transfer a backup off-host.

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
   Approved Category 6 records must reference at least one concrete child JSON
   report in `evidence`; prose, a dossier alone, and `restore_drill_completed: true`
   do not establish this gate. The validator accepts a report at the runner's
   default name or a custom path when its content has a valid basic UTC
   `drill_timestamp` (`YYYYMMDDTHHMMSSZ`), exact `status: "success"`, and true
   `rto_compliant`, `record_parity_verified`, `postgis_verified`, and
   `foreign_keys_verified` flags. Source/restored table and migration counts
   must be equal nonnegative integers, `backup_bytes` a positive integer, and
   `duration_ms` a finite nonnegative number. Missing, malformed, failed, or
   future-dated reports block approval, including when another report passes.
   `restore_drill_date` must be a real UTC `YYYY-MM-DD` date or an ISO UTC
   timestamp (`YYYY-MM-DDTHH:mm:ssZ`) whose date matches the latest valid
   referenced report; future dates and timezone offsets are rejected. No
   maximum report age is inferred. This validates the operator record against
   a self-reported artifact; archive origin, scheduled completion, off-host
   encryption and transfer, Garage coverage, freshness, and representative
   load remain operator obligations.
3. **PostgreSQL & Object Storage Reconciliation**:
   Execute `npm run ops:reconcile-storage` (or `scripts/ops/reconcile-storage-objects.js [options]`). Compares active database records (`StoredObject`, `Upload`, `ExportArtifact`) against bucket storage (Garage / S3):
   - Detects orphaned objects present in storage but absent from database metadata (storage leaks);
   - Detects missing objects referenced by active database records (data loss);
   - Asserts byte count and SHA-256 checksum alignment;
   - Excludes pending uploads, soft-deleted objects, and quarantined objects within the retention window;
   - Fails closed with exit code 1 if missing objects or corruption/checksum mismatches are found.
   Approved Category 6 records must also reference a concrete reconciliation
   child JSON report in `evidence`. A custom path qualifies by report content;
   a declaration, prose, filename alone, or unified dossier does not. The
   validator requires the producer's real, nonfuture ISO UTC `timestamp`, all
   eight nonnegative safe-integer summary counts, all four result arrays, and
   count/array agreement. Missing and mismatched counts and arrays must be
   empty, `summary.exitCode` must be 0, and `summary.status` must be `clean`
   with no orphans or `warning` with orphans. Every referenced child report,
   including wildcard matches, must pass. A warning's orphan list remains for
   operator review. This checks the supplied report's consistency; the
   operator must verify live PostgreSQL/Garage scope, backup coverage,
   freshness, zero-object results, and representative restore load.

### Data Retention & Cleanup

Data retention jobs run automatically on the worker process (`SCHEDULER_ENABLED=true`):
Each purge reclaims at most `RETENTION_PURGE_BATCH_LIMIT` (500) rows per purge
path per hourly tick — 500 tokens plus 500 invitations on the tokens tick —
oldest `expiresAt` first via bounded id-scoped writes, so backlogs drain
across ticks (prompt 79 generalizes the prompt-70 exports bound to all purges).
- `sessions.purge-expired`: cleans expired session tokens.
- `uploads.purge-expired`: cleans uncompleted uploads and pending quarantine objects older than configured TTL.
- `idempotency.purge-expired`: cleans idempotency records past retention window.
- `tokens.purge-expired`: cleans expired password recovery and invitation tokens.
- `exports.purge-expired` (prompt 70): reclaims `ExportArtifact` rows and marks
  their `StoredObject` rows `deleted` for `succeeded` export requests past
  `expiresAt`, oldest expiry first, 500 requests per hourly tick. The tick runs
  globally across organizations under the worker bypass, like its siblings —
  never scoped to a calling tenant. Already-purged requests keep their audit
  rows but carry no artifact, so the artifact-bearing scan skips them on later
  ticks. `ExportRequest` audit rows are retained, published report revisions
  are untouched, and a purged download fails closed on the pre-existing
  `NOT_FOUND` read path (prompt 71: the download read path also enforces
  `expiresAt <= now` with the same `NOT_FOUND` before any presigned URL is
  minted, so the tick remains byte reclamation only). Unexpectedly shared stored objects are skipped with a
  warning rather than orphaned.
All runs are logged to the `JobRun` audit table. `JobRunsService.finish()`
accepts only the five `` `purged ${number} …` `` count templates plus the five
fixed failure literals (compile-time guard; runtime values unchanged; raw
error text stays server-log-only).

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
contract drift, database role/migration, fail-closed server E2E,
`npm run geography:plans`, and then the six-query `npm run analytics:plans`
gate, plus `npm run ops:check`. After the database and plan gates, it installs
Chromium and its Ubuntu dependencies with the installed Playwright CLI, then
runs the full `npm run test:client:e2e` suite with one CI worker. Both plan
steps use the migrated `acres_test` database through its non-owner test role;
the browser suite uses the migrated `acres` database through `acres_app` and
starts local Nest and production-built Next servers on 3101 and 3100. Its Next
web server alone gets `ENABLE_TEST_HARNESS=true`; the route guard remains off
by default outside that test process. Any plan or browser failure fails
`checks` and prevents the dependent Docker job. The Docker job builds the
server image and smoke-tests `/health`, then builds the production Next client
image from its Dockerfile-specific context and checks `/` for HTTP 200 and the
Acres hero marker plus an HTML-referenced `/_next/static/` asset for HTTP 200.
Both builds use `push: false`; the client probe removes its container even after
a failed build, startup, or request.

The local sequence on 2026-09-22 passed server E2E (6 suites, 143 tests),
geography plans (2/2), and analytics plans (6/6). YAML parsing and step-order
verification passed. A GitHub-hosted run of the added step is pending; local
timings do not establish hosted-run performance.

The client browser gate was verified locally on 2026-09-22 against a production
build and disposable PostGIS: direct Playwright discovery listed 74 tests in
11 files, and `CI=true npm run test:client:e2e` passed 74/74 with one worker
in 1.6 minutes. The workflow YAML parsed, the required step order and Docker
dependency were checked, and lint, typecheck, build, and contract drift checks
passed. This is local evidence; the new browser gate has not yet run on GitHub.

The client image gate was verified locally on 2026-09-23 with
`docker build --file infra/docker/client.Dockerfile.example --tag acres-client:ci .`:
the Dockerfile-specific ignore admitted the client source, `npm ci` and the
Next 16.3.4 production build completed, and the image imported successfully.
The exact workflow smoke script returned `client landing page: HTTP 200`,
`Acres hero marker found`, and `client static asset: HTTP 200`. Docker reported
`Configured user=node`, UID `1000`, and a healthy running container; removal
left no `acres-client-ci` container. YAML parsing confirmed the ordered build,
smoke, and unconditional cleanup steps. This is local image evidence; a
GitHub-hosted run of the new client image gate has not been observed, and the
operator launch approval remains open.

During this verification, `npm run ops:check` stopped at its SAST test:
`npm run ops:sast` reported seven `SAST-01` blockers in the pre-existing
analytics and geography query-plan seed scripts, where constant `ANALYZE`
statements call `$executeRawUnsafe`. All seven lines are present in baseline
commit `a383fb2`; they are separate from this client image gate. The operations
suite therefore has no passing end-to-end result for this change.

On 2026-09-23, prompt 162 repaired those seven stale SAST triage locations.
The existing `SUP-001` and `SUP-002` approvals retain their owner, rationale,
date, LOW severity, and 2027-09-09 expiration. Five added entries (`SUP-006`
through `SUP-010`) carry the same approved exception for the remaining calls.
Each entry now matches exactly one fixed `ANALYZE` call by file, line, and full
statement snippet. The source SQL and scanner rules are unchanged; triage now
requires an exact trimmed-line snippet match, so an extra unsafe call on the
same line cannot inherit the exception. A regression test scans each real
approved call, a replacement with dynamic SQL, and an appended dynamic SQL
call; only the fixed call is triaged.

Local `npm run ops:sast-test` exited 0. `npm run ops:sast` scanned 360 files,
reported 10 rule matches, 10 triaged suppressions, zero expired suppressions,
zero active findings, and exited 0. The first sandboxed `npm run ops:check`
stopped at `npm run ops:audit` because DNS resolution for `registry.npmjs.org`
returned `EAI_AGAIN`; its retry with network access exited 0 through the final
launch-drill test. That audit reported 16 moderate/high dependency advisories
and zero critical vulnerabilities under the gate's existing threshold. Lint,
typecheck, contract drift check, and the production build exited 0; the build
needed an unsandboxed retry after Next failed to parse its TypeScript
`--showConfig` child-process output inside the sandbox. No GitHub-hosted run of
this repair has been observed, and operator launch approval remains open.

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
     7. `DatabaseConnectionPoolSaturation` (then named for a pool, but based on active requests > 40, for 2m, warning).
   - Statically validates PromQL expressions, durations, severities, and annotations.
   - The `High429Rate` static check requires the dedicated 429 numerator, the total-request denominator, and the configured 5m/10% expression; its synthetic check confirms heavy non-429 4xx traffic does not fire the alert. These checks do not exercise a running Prometheus server or production traffic.
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

**Prompt 166 verification (2026-09-23):** `High429Rate` now reads only
`acres_http_429_responses_total`, over the unchanged total-request rate and
5m/10% threshold. The service test proved that two 429s among 401, 403, and
500 responses expose a 429 count of 2 while total route/status-class counts
remain 4 for 4xx and 1 for 5xx. The static verifier rejects the former 4xx
numerator, and its synthetic case does not fire on 90 non-429 4xx responses.
Focused metrics suites: 20/20 tests passed; alert verifier: 11/11 tests passed
(`ops:alert-test` passed);
`ops:alert-drill`: 16/16 checks and 7/7 simulations passed;
`ops:templates`: passed; `ops:capacity-alerting-drill -- --dry-run`: passed,
with ignored evidence at
`backups/capacity-alerting-drill-evidence-20260923T193003Z.json`.
`npm run lint`, `npm run typecheck`, and `npm run build` passed. The sandboxed
client build could not parse TypeScript `--showConfig` because subprocess stdout
was empty; the same production build completed outside that restriction.
No local `promtool` was available, and no running Prometheus or production
alert behavior was verified.

**Prompt 167 correction (2026-09-23):** The seventh alert is now
`HighHttpConcurrency`, measuring `acres_http_active_requests > 40` for 2m at
warning severity. This keeps the existing threshold but correctly identifies
an API HTTP load signal. The prompt 66 inventory above records its original
name; it did not measure database pool saturation. No direct Prisma/PostgreSQL
pool utilization, wait-time, or exhaustion metric has been verified in this
repository. True pool saturation remains an open launch telemetry gap, and a
worker-only pool problem may not trigger this HTTP alert. On promotion, the old
alert series disappears and the new series starts a fresh 2-minute pending
timer. Operators must update any external receiver routing, silences, and
saved links keyed to the old name. No Alertmanager receiver is configured in
this repository. The 40-request threshold is carried forward, not newly
justified as an SLO; production Prometheus and receiver behavior remain to be
verified.

Prompt 167 verification: `node --test scripts/ops/verify-alert-rules.spec.js`
and `npm run ops:alert-test` each reported `pass 1`, `fail 0` (the installed
Node runner reports the file as one test). `npm run ops:alert-drill` reported
16/16 checks and 7/7 simulations passed. `npm run ops:templates` passed;
`npm run ops:capacity-alerting-drill -- --dry-run` passed and wrote ignored
evidence at `backups/capacity-alerting-drill-evidence-20260923T195847Z.json`.
`npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`
passed. The sandboxed build again failed while parsing TypeScript
`--showConfig` output; an elevated run completed the shared, client, and
server builds. Local `promtool` was unavailable. The review found no issues;
no live Prometheus evaluation, Alertmanager receiver transition, or production
traffic behavior was tested.

**Prompt 168 update (2026-09-23):** The API now exports direct `pg.Pool`
total, idle, waiting, and configured maximum gauges. This closes the narrow
API-process pool-count visibility gap described in the prompt 167 record above.
It does not measure wait time, exhaustion across multiple processes, the worker
pool, or PostgreSQL server-wide saturation. No eighth alert or launch sign-off
was added. Focused pool/metrics suites passed 14/14 tests; the full server unit
suite passed 119/119 suites and 1836/1836 tests. `npm run ops:templates` and
`npm run ops:alert-test` passed (`pass 1`, `fail 0`); `npm run lint`,
`npm run typecheck`, `npm run build` (outside the sandbox's documented Next
`--showConfig` subprocess restriction), and `git diff --check` passed. The
sandboxed server E2E run failed because `acres_test` was unreachable and HTTP
test servers could not bind. After fixing the shared Prisma test double, an
elevated E2E run passed 6/6 suites and 143/143 tests, including the private
`/metrics` HTTP exposition. No live API/worker pool or production Prometheus
scrape was measured.

**Prompt 170 update (2026-09-23): PostgreSQL server telemetry.** The optional
`postgres-exporter` service is a private-only `observability` peer, scraped as
`acres-postgres` every 30s. The exporter collection limit is 10s and the
Prometheus scrape timeout is 15s. Its HTTP root healthcheck tests the process;
`up{job="acres-postgres"}` tests Prometheus reachability, `pg_up` tests database
access, and `pg_exporter_last_scrape_error` reports collector errors. A healthy
HTTP endpoint alone is not database evidence. The seven alert rules are unchanged.

The Compose image is pinned to the v0.20.1 multi-platform manifest digest
`sha256:ac5ec343104fae0e2d84a27bb8d69b38430a11910c5382cad85d478d2bab713e`.
`docker buildx imagetools inspect` verified the digest and its amd64, arm64,
arm/v7, and ppc64le child manifests against the
[official GHCR package](https://github.com/prometheus-community/postgres_exporter/pkgs/container/postgres-exporter). The release check rejects image
substitution or a floating tag.
The [v0.20.1 exporter source](https://github.com/prometheus-community/postgres_exporter/tree/v0.20.1/collector)
defines `pg_stat_activity_count` (labels include `datname` and `state`),
`pg_stat_database_numbackends` (per database), and
`pg_settings_max_connections` (server setting). The exporter also emits
`pg_up` and `pg_exporter_last_scrape_error`. Dashboard panels 14–20 keep
process-local API/worker pools separate from server values. The all-database
backend panel sums per-database current backends; it does not count background
processes or establish usable headroom after reserved slots. The activity
collector excludes its own backend. Empty series remain **No data**, never
healthy zero.
Prometheus keeps only these five PostgreSQL exporter metrics. Activity count
series retain the upstream database role, application name, and wait-event
labels because dropping them can collapse distinct series into duplicate
samples. The application must not put product user or tenant IDs into the
PostgreSQL application name. The private exporter endpoint itself exposes
additional upstream default series and must remain restricted to trusted
Compose peers.

`acres_monitor` is a separate LOGIN with `pg_monitor` and CONNECT on `acres`.
It has no superuser, role/database creation, replication, BYPASSRLS, schema
CREATE, or application table grants. The role setup script checks those
properties and fails if another role membership exists. `pg_monitor` includes
`pg_read_all_stats`, so this credential can inspect other sessions' SQL text
through `pg_stat_activity`, even though the configured exporter does not emit
query strings or tenant/user IDs. Treat the credential and the private metrics
endpoint as sensitive. No custom SQL, database autodiscovery, multi-target
`/probe`, or `pg_stat_statements` collector is enabled.

Operator procedure, from the repository root with the approved
environment and secret manager active:

1. Provision a unique single-line monitor password without a trailing newline. Write it through the
   secret manager to an operator-owned host file, outside Git. Set
   `ACRES_MONITOR_PASSWORD_FILE` to its absolute path. The bind mount is
   read-only and reaches only the exporter at
   `/run/secrets/acres_monitor_password`. The official image runs as UID/GID
   65534; grant that identity file read access (for example, owner 65534,
   mode 0400) and keep parent directories traversable only for the deployment
   operator. Verify the resulting mount inside the container before promotion.
2. **Fresh volume:** inject the same password as
   `ACRES_MONITOR_BOOTSTRAP_PASSWORD` only in the Compose invocation that
   initializes PostgreSQL. The entrypoint runs the production role bootstrap
   and then the monitor reconciliation script. Do not place this value in the
   shared `production.env` file; remove it from the operator shell afterward.
3. **Existing volume:** entrypoint initialization does not rerun. First recreate
   the PostgreSQL container with the updated Compose file so the new read-only
   script mount exists (`docker compose -f infra/compose/docker-compose.production.example.yml up -d --no-deps --force-recreate postgres`).
   Schedule this database restart because it briefly interrupts application
   traffic. After PostgreSQL is healthy, inject the same password through the
   controlled admin shell, then run
   `docker compose -f infra/compose/docker-compose.production.example.yml exec -T -e ACRES_MONITOR_BOOTSTRAP_PASSWORD postgres bash /docker-entrypoint-initdb.d/002-reconcile-production-monitor.sh`.
   This is idempotent. It disables statement/error-statement logging for the
   password-bearing SQL session and prints only a success line or a SQL error;
   a failed privilege check stops promotion. Compare the injected value with
   the exporter file through the secret manager, never by printing either.
4. Start the optional exporter, then promote Prometheus/Grafana. From a
   private peer, inspect `/metrics` for `pg_up 1`,
   `pg_exporter_last_scrape_error 0`, `pg_settings_max_connections`,
   `pg_stat_database_numbackends{datname="acres"}`, and
   `pg_stat_activity_count{datname="acres"}`. In Prometheus, confirm
   `up{job="acres-postgres"} == 1` and the same database signals. Exporter
   down must yield `up == 0`; database authentication/reachability failure
   may leave `up == 1` while `pg_up == 0` or the scrape error is 1. Capture
   both cases in operator evidence before sign-off. A disposable local
   PostgreSQL 18/PostGIS and the pinned exporter produced `pg_up 1`,
   `pg_exporter_last_scrape_error 0`, `pg_settings_max_connections 100`,
   and `pg_stat_activity_count{datname="acres",state="active",...} 0`;
   the role attributes were `LOGIN=true`, all five elevated flags false,
   and `pg_monitor` membership true. Reconciliation passed twice. An
   exporter scrape before the database TCP listener was ready produced
   `pg_up 0` and scrape error 1 while the exporter HTTP endpoint answered.
   A disposable Prometheus v3.8.0 target pointed at an absent exporter
   returned `up{instance="127.0.0.1:19187",job="acres-postgres"} => 0`.
   The pinned exporter root returned HTML with an unreachable database,
   confirming its healthcheck is process liveness. Production Prometheus
   reachability and operator host permissions remain promotion checks.

For rotation, provision a new secret-manager version and host file; inject
the new value in the admin shell, rerun reconciliation, atomically replace
the file, restart only `postgres-exporter`, and confirm `up == 1`, `pg_up == 1`,
and scrape error 0 for two scrapes. Revoke the old secret version after the
new exporter succeeds. If monitoring fails, keep application traffic serving;
roll back exporter, scrape, and panels while retaining the harmless role until
an operator separately revokes it. The blind spot during rollback is
server-wide activity and connection-cap evidence. Lock/query diagnosis,
wait-duration collection, saturation thresholds, and production sign-off
remain open.

Prompt 170 verification: `npm run ops:templates` passed;
`npm run ops:check` passed all stages, including 22/22 release-image tests,
24/24 readiness tests, 10/10 container-security tests, and 9/9 launch-drill
tests. `npm run ops:alert-test` passed (one test file, zero failures).
`docker compose --env-file infra/env/production.env.example --env-file
infra/env/garage.production.env.example -f
infra/compose/docker-compose.production.example.yml --profile observability
config --quiet` exited 0. Prometheus v3.8.0 `promtool check config` reported
one valid rule file and seven rules. `npm run lint`, `npm run typecheck`, and
`npm run build` passed (the build required an elevated run because sandboxed
Next failed while parsing TypeScript `--showConfig`). `git diff --check`
passed. The initial sandboxed operations gate could not reach npm audit; the
elevated gate passed with zero critical advisories. Review found and fixed an
activity-label collision and an existing-volume rollout instruction gap;
follow-up review reported no remaining findings. No production deployment
or launch sign-off occurred.

**Prompt 171 update (2026-09-23): lock waits and transaction age.** Prometheus
now retains `pg_stat_activity_max_tx_duration` alongside the five existing
PostgreSQL exporter metrics. The existing 30-second scrape, private exporter,
monitor role, labels, and seven alerts are unchanged. Grafana panel 21 uses
`sum by (wait_event) (pg_stat_activity_count{job="acres-postgres",datname="acres",wait_event_type="Lock"})`
to count currently waiting `acres` backends by PostgreSQL lock event. Panel 22
uses `max(pg_stat_activity_max_tx_duration{job="acres-postgres",datname="acres"})`
in seconds to show the oldest current transaction across the collector's
activity groups. Both panels preserve **No data** rather than filling absent
series with zero. The collector's SQL calculates transaction age as
`MAX(EXTRACT(EPOCH FROM now() - xact_start))`, excludes its own backend, and
emits synthetic zero rows for database/state combinations without sessions.
Neither panel measures query latency, lock-wait duration, pool-acquisition
time, or server headroom. A 30-second sample may miss transient waits.

On a disposable PostgreSQL 18.6 server with the pinned exporter v0.20.1, a
two-session row-update conflict yielded
`pg_stat_activity_count{application_name="psql",backend_type="client backend",datname="acres",state="active",usename="postgres",wait_event="transactionid",wait_event_type="Lock"} 1`.
The same scrape reported transaction-age values of `4.132126` seconds for
the holder (`wait_event_type="Timeout",wait_event="PgSleep"`) and `2.139469`
seconds for the waiter (`wait_event_type="Lock",wait_event="transactionid"`),
with `pg_up 1` and `pg_exporter_last_scrape_error 0`. Both sessions ended and
the disposable containers and network were removed. This proves the pinned
collector's series under a controlled wait; it does not prove production
Prometheus ingestion or incident detection.
The exact runbook SQL also succeeded during a second conflict on PostgreSQL
18.6: it returned the waiting PID with `wait_event_type=Lock`,
`wait_event=transactionid`, transaction age `2.2` seconds, and the holder PID
from `pg_blocking_pids`; its second result included both transactions. No
query text or tenant data was selected.

The bounded, read-only PostgreSQL 18 query in `docs/launch-checklist.md` §5
inspects current waits, blocker PIDs, and old transactions without selecting
SQL text or tenant/user identifiers. `pg_monitor` can still read SQL text in
its own console, so operator SQL access and output remain restricted. During
promotion, apply the Prometheus allowlist first and verify
`up{job="acres-postgres"} == 1`, `pg_up == 1`, collector error `0`, and the
transaction-age series over two scrapes. Verify the lock series during a
controlled wait when feasible; its absence without a wait is expected. Then
publish the dashboard. Rollback removes
panels 21–22 and the new allowlist entry; existing connection/activity panels
continue to work. Query and wait-duration instrumentation, production checks,
and launch sign-off remain open.

Prompt 171 verification: the focused diagnostics suite passed 4/4 mutation
groups, including missing age metric, wrong panel selectors, reused IDs,
synthetic zero, extra query-text metrics, and wildcard retention. The static
template gate, full `ops:check` gate, alert test, lint, typecheck, build,
`git diff --check`, and pinned Prometheus v3.8.0 `promtool check config` and
`check rules` passed. The sandboxed `ops:check` stopped at npm audit because
the registry was unreachable; an elevated run passed all stages. The
sandboxed Next build failed at TypeScript `--showConfig`; an elevated build
completed the shared, client, and server builds. Static validation proves
configuration shape; the disposable scrape above supplies the live lock
evidence. Production Prometheus ingestion remains untested.

**Prompt 172 update (2026-09-23): PostgreSQL pool acquisition wait duration.**
`PrismaService` now wraps `this.pool.connect` using `process.hrtime.bigint()`
across both callback and Promise checkout flows, observing the elapsed wall-clock
duration until connection acquisition (or failure/timeout). The decoupled
`onAcquisition` subscription pattern keeps `PrismaService` free of a circular
dependency on `MetricsService`. `MetricsService` registers
`acres_postgres_pool_acquisition_duration_seconds` with 13 duration buckets
ranging from 0.5ms (`0.0005s`) to 5s (`5s`), capturing both sub-millisecond idle
checkouts and multi-second pool queueing/starvation. Because both the API and
the background worker instantiate `PrismaService` and `MetricsService`, this
histogram is exposed by both processes and distinguished in Prometheus by
`job="acres-api"` and `job="acres-worker"`.

Grafana panel 23 ("API PostgreSQL Pool Acquisition Latency") and panel 24
("Worker PostgreSQL Pool Acquisition Latency") show p50, p95, and p99 percentiles
at row `y: 60` with units in seconds and `No data` preserved on absence.
In incident triage, operators correlate acquisition latency with HTTP latency:
an elevated acquisition p95/p99 (e.g. > 50ms) confirms `pg.Pool` queueing and
connection checkout backlog, whereas low acquisition latency (< 1ms) isolates
high HTTP latency to SQL execution, application compute, or downstream services.
SQL query execution duration instrumentation, operator capacity baseline,
and launch sign-off remain open.

Prompt 172 verification: focused Prisma and metrics unit test suites passed
19/19 tests; template verification (`scripts/ops/check-production-templates.sh`)
and PostgreSQL diagnostics spec (`verify-postgres-diagnostics.spec.js`) passed
5/5 tests including reused ID, scope, and template invariants. `npm run ops:templates`,
`npm run ops:alert-test`, `npm run lint`, `npm run typecheck`, `npm run build`,
and `git diff --check` passed cleanly.

**Prompt 173 update (2026-09-23): PostgreSQL query execution duration.**
`PrismaService` now wraps `client.query` on every checked-out `PoolClient` instance
using an idempotent `WeakSet<PoolClient>` guard, measuring elapsed wall-clock
duration via `process.hrtime.bigint()` across both callback and Promise execution
paths (including query failures and rejections). SQL query operations are normalized
via `extractQueryOperation` into 9 bounded low-cardinality values (`select`, `insert`,
`update`, `delete`, `begin`, `commit`, `rollback`, `set`, and fallback `other`),
eliminating query parameters, user/org identifiers, and raw SQL text from Prometheus
label cardinality.

`MetricsService` subscribes via `onQuery` to record each duration in the existing
`acres_database_query_duration_seconds` histogram across both API (`job="acres-api"`)
and background worker (`job="acres-worker"`) processes, and cleanly unsubscribes on
`onModuleDestroy()`.

Grafana panel 25 ("API PostgreSQL Query Execution Latency") and panel 26
("Worker PostgreSQL Query Execution Latency") show p50, p95, and p99 percentiles
at row `y: 68` with units in seconds and `No data` preserved on absence.
In incident triage, operators correlate query execution duration with pool
acquisition latency: high query duration with low acquisition latency isolates
performance degradation to slow SQL statements, database table scans, or lock contention,
distinguishing database-side execution time from pool queueing or application CPU bottlenecks.
Operator capacity baseline and launch sign-off remain open.

Prompt 173 verification: focused Prisma and metrics unit test suites passed
28/28 tests; full server suite passed 120/120 suites (1864 tests); template verification
(`scripts/ops/check-production-templates.sh`) and PostgreSQL diagnostics spec
(`verify-postgres-diagnostics.spec.js`) passed 6/6 tests including unique IDs and
scoping invariants. Full `npm run ops:check` passed all stages. `npm run ops:templates`,
`npm run ops:alert-test`, `npm run lint`, `npm run typecheck`, `npm run build`,
and `git diff --check` passed cleanly.

**Prompt 174 update (2026-09-24): evidence-based database connection pool saturation alert.**
`infra/prometheus/alerts.yml` now configures the eighth required operational alert:
`DatabaseConnectionPoolSaturation` with expression `acres_postgres_pool_requests_waiting{job="acres-api"} > 0`,
`for: 1m`, and `severity: warning`. This alert directly measures connection starvation in the API process's
`pg.Pool`: when incoming HTTP queries cannot acquire a connection from the pool and remain queued in
`acres_postgres_pool_requests_waiting` for more than 1 minute (exceeding twelve 5000ms connection timeout cycles),
the alert fires to notify operators of pool exhaustion.

The rule verifier (`scripts/ops/verify-alert-rules.js`), test suite (`scripts/ops/verify-alert-rules.spec.js`),
production template validator (`scripts/ops/check-production-templates.sh`), and drill orchestrator
(`scripts/ops/run-capacity-alerting-drill.sh`) now require and simulate all 8 operational rules.
`docs/launch-checklist.md` §5 details the triage runbook correlating Panels 9 and 10 pool gauges, Panel 23 acquisition latency,
Panel 25 query execution latency, Panels 19–22 server activity and lock counts, and read-only PostgreSQL contention queries.
This formally closes the open evidence-based saturation alerting requirement from prompts 167–169 and `docs/build-plan.md`.
Operator capacity baseline and launch sign-off remain open.

Prompt 174 verification: alert rule test suite passed 16/16 tests including schema, PromQL, duration, severity, and breach/clear simulation; template verification (`scripts/ops/check-production-templates.sh`) and alert drill (`scripts/ops/verify-alert-rules.js`) verified all 8/8 operational alert rules and 18/18 checks. Full `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.

**Prompt 175 update (2026-09-24): background worker process availability alert.**
`infra/prometheus/alerts.yml` now configures the ninth required operational alert:
`AcresWorkerDown` with expression `up{job="acres-worker"} == 0`, `for: 1m`, and `severity: critical`.
This alert provides operational parity with `AcresApiDown`, monitoring the background worker process at
`worker:3002`: when the worker container crashes, exits, or fails its scrape/pool collector for more than
1 minute, the alert fires to page the on-call team and prevent background processing starvation across outbox
dispatching, dataset ingestion/parsing, file retention purging, and report export rendering.

The rule verifier (`scripts/ops/verify-alert-rules.js`), test suite (`scripts/ops/verify-alert-rules.spec.js`),
production template validator (`scripts/ops/check-production-templates.sh`), and drill orchestrator
(`scripts/ops/run-capacity-alerting-drill.sh`) now require and simulate all 9 operational rules.
`docs/launch-checklist.md` §5 details the triage runbook correlating worker process liveness, logs,
`worker:3002/health`, queue backlog, and PostgreSQL connectivity.
This formally closes the worker process availability alerting gap.
Operator capacity baseline and launch sign-off remain open.

Prompt 175 verification: alert rule test suite passed 18/18 tests including schema, PromQL, duration, severity, and breach/clear simulation; template verification (`scripts/ops/check-production-templates.sh`) and alert drill (`scripts/ops/verify-alert-rules.js`) verified all 9/9 operational alert rules and 20/20 checks. Full `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.

**Prompt 176 update (2026-09-24): PostgreSQL server availability alert.**
`infra/prometheus/alerts.yml` now configures the tenth required operational alert:
`PostgresDown` with expression `pg_up{job="acres-postgres"} == 0`, `for: 1m`, and `severity: critical`.
This alert establishes operational availability alerting across the core database service: when the PostgreSQL database
server is unreachable, halts, or fails connections from `postgres-exporter` for more than 1 minute, the alert fires
to page the on-call team and prevent undetected downtime across the entire platform.

The rule verifier (`scripts/ops/verify-alert-rules.js`), test suite (`scripts/ops/verify-alert-rules.spec.js`),
production template validator (`scripts/ops/check-production-templates.sh`), and drill orchestrator
(`scripts/ops/run-capacity-alerting-drill.sh`) now require and simulate all 10 operational rules.
`docs/launch-checklist.md` §5 details the triage runbook correlating database container liveness, logs,
`pg_isready` socket connectivity, host disk space, and exporter scrape errors.
This formally closes the PostgreSQL server availability alerting gap.
Operator capacity baseline and launch sign-off remain open.

Prompt 176 verification: alert rule test suite passed 20/20 tests including schema, PromQL, duration, severity, and breach/clear simulation; template verification (`scripts/ops/check-production-templates.sh`) and alert drill (`scripts/ops/verify-alert-rules.js`) verified all 10/10 operational alert rules and 23/23 checks. Full `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.

**Prompt 177 update (2026-09-24): PostgreSQL metrics exporter availability alert.**
`infra/prometheus/alerts.yml` now configures the eleventh required operational alert:
`PostgresExporterDown` with expression `up{job="acres-postgres"} == 0`, `for: 1m`, and `severity: warning`.
This alert establishes telemetry-self-health monitoring for the database observability pipeline:
when `postgres-exporter` crashes, runs out of memory, or fails to answer Prometheus scrapes,
`PostgresExporterDown` fires at warning severity to notify operators that database metrics
(connections, lock waits, transaction ages, scrape health) are dark, closing the gap where a dead
exporter prevented `pg_up == 0` from ever being evaluated.

The rule verifier (`scripts/ops/verify-alert-rules.js`), test suite (`scripts/ops/verify-alert-rules.spec.js`),
production template validator (`scripts/ops/check-production-templates.sh`), and drill orchestrator
(`scripts/ops/run-capacity-alerting-drill.sh`) now require and simulate all 11 operational rules.
`docs/launch-checklist.md` §5 details the triage runbook correlating exporter container liveness, logs,
secret file mount permissions, and scrape timeouts.
This formally closes the exporter availability and telemetry-self-health alerting gap.
Operator capacity baseline and launch sign-off remain open.

Prompt 177 verification: alert rule test suite passed 22/22 tests including schema, PromQL, duration, severity, and breach/clear simulation; template verification (`scripts/ops/check-production-templates.sh`) and alert drill (`scripts/ops/verify-alert-rules.js`) verified all 11/11 operational alert rules and 25/25 checks. Full `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.

**Prompt 178 update (2026-09-24): operator capacity baseline telemetry and evidence.**
`scripts/ops/verify-capacity-load.js` now evaluates database connection pool acquisition latency (p95 ceiling ≤ 50ms) and SQL query execution latency (p95 ceiling ≤ 100ms) alongside HTTP availability (≥ 99.9%) and throughput (≥ 100 RPS) under default Category 5 SLO targets. In synthetic mode, realistic right-skewed log-normal distributions are generated for database metrics with monotonicity guaranteed across percentiles. Elevated acquisition latency (> 50ms) or query latency (> 100ms) triggers deterministic SLO compliance violations.

`scripts/ops/run-capacity-alerting-drill.sh` now captures structured `databaseTelemetryBaseline` in `unifiedEvidence` emitted to `backups/capacity-alerting-drill-evidence-<timestamp>.json`, recording metrics exporter scrape health (`up == 1`, `pg_exporter_last_scrape_error == 0`), database reachability (`pg_up == 1`), connection pool state (API and Worker total, idle, max, waiting 0), pool acquisition percentiles (p50, p95, p99), query execution percentiles (p50, p95, p99), lock wait count (0), and transaction duration diagnostics. Step 1's header comment was updated to verify all 11 operational rules.

`scripts/ops/verify-capacity-load.spec.js` expanded from 9 to 15 unit tests covering database latency calculations, custom SLO thresholds, elevated acquisition/query latency violations, monotonicity breaches, PRNG fallbacks, and report schema validation.
This formally closes the operator capacity baseline telemetry and evidence requirement. Operator launch sign-off remains open.

Prompt 178 verification: capacity load test suite passed 15/15 tests; capacity drill (`npm run ops:capacity-drill`) evaluated synthetic HTTP and database latency baselines with 100% availability, 125 RPS, 1.25ms database acquisition p95, and 23.36ms database query p95; capacity alerting drill (`npm run ops:capacity-alerting-drill`) verified all 11 operational alert rules, capacity SLO compliance, DoS resilience, and emitted structured `databaseTelemetryBaseline`. Full `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.

**Prompt 179 update (2026-09-24): launch readiness database SLO and baseline validation.**
`scripts/ops/check-launch-readiness.js` now validates that approved readiness records in `sections.slo_and_alerting` declare positive database connection pool acquisition p95 latency ceilings (`max_database_acquisition_p95_latency_ms <= 50`) and SQL query execution p95 latency ceilings (`max_database_query_p95_latency_ms <= 100`) per Category 5 SLO requirements. In `checkEvidenceFile`, cross-validation now inspects evidence files for database baseline failure markers (`summary.databaseBaselineCompliance === 'failed'`) and baseline breach states (`databaseTelemetryBaseline.status === 'breached'`), failing closed to prevent compromised or degraded database performance baselines from passing launch approval.

`infra/launch/readiness.example.json` was updated to document the required 50ms acquisition and 100ms query latency ceilings. `scripts/ops/check-production-templates.sh` now enforces that `readiness.example.json` defines both database latency SLO fields. `scripts/ops/check-launch-readiness.spec.js` expanded from 24 to 27 unit tests verifying ceiling boundary enforcement, non-number rejection, missing field fail-closed behavior, and database baseline failure/breach evidence blocking. Operator launch sign-off remains open.

Prompt 179 verification: readiness test suite passed 27/27 tests; template verification (`scripts/ops/check-production-templates.sh`) verified template integrity; capacity tests and drill (`npm run ops:capacity-test`, `npm run ops:capacity-drill`) confirmed baseline metrics. Full `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.

**Prompt 180 update (2026-09-24): Grafana operational dashboard active concurrency and 429 rate panels.**
`infra/grafana/dashboards/acres-operations.json` now configures Panel 27 ("API In-Flight Active HTTP Requests") with expression `acres_http_active_requests{job="acres-api"}` (thresholds: 30 yellow clearing bar, 40 red fire threshold; unit `short`) and Panel 28 ("API HTTP 429 Rate Percentage") with expression `(sum(rate(acres_http_429_responses_total{job="acres-api"}[5m])) / clamp_min(sum(rate(acres_http_requests_total{job="acres-api"}[5m])), 0.001)) * 100` (thresholds: 2 yellow clearing bar, 10 red fire threshold; unit `percent`) at row `y: 76`.

This achieves 100% visual coverage across all 11 Prometheus alert rules in the Grafana operational dashboard, enabling operators triaging `HighHttpConcurrency` or `High429Rate` to observe in-flight concurrency and rate-limiting spike trends directly. `scripts/ops/check-production-templates.sh` now enforces that Panels 27 and 28 exist, reference their respective API metric expressions, and configure expected units. `scripts/ops/verify-postgres-diagnostics.spec.js` expanded to 7 unit tests verifying panel ID uniqueness across the dashboard. Operator launch sign-off remains open.

Prompt 180 verification: diagnostics test suite passed 7/7 tests; template verification (`scripts/ops/check-production-templates.sh`) passed all checks. Full `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.

**Prompt 181 update (2026-09-24): incident runbook and alert PromQL reconciliation.**
`docs/launch-checklist.md` §5 now reconciles all 11 incident response runbooks with exact scoped PromQL expressions matching `infra/prometheus/alerts.yml` (`HighHttp5xxRate`, `High429Rate`, `QueueDeadLettersDetected`, and `OutboxDeliveryLag` explicitly scoped to their target jobs) and adds dedicated `- Dashboard:` cross-references to their operational Grafana panels (Panels 2, 11, 15, 14/16, 6, 7, 28, 4, 3, 27, and 9/10/23/25). `scripts/ops/verify-alert-rules.js` now includes `acres_postgres_pool_acquisition_duration_seconds` in `KNOWN_METRIC_IDENTIFIERS`, verified by `verify-alert-rules.spec.js` (23/23 tests passed). `scripts/ops/check-production-templates.sh` now statically verifies that `docs/launch-checklist.md` documents all 11 alert runbooks, matches each exact scoped PromQL expression, and includes Grafana panel references. Operator launch sign-off remains open.

**Prompt 182 update (2026-09-24): unified launch dossier database baseline and readiness cross-validation.**
`scripts/ops/run-launch-drills.sh` now discovers stage 6 child capacity evidence (`capacity-alerting-drill-evidence-<timestamp>.json`) and extracts `databaseTelemetryBaseline`, `summary.databaseBaselineCompliance`, `summary.alertVerification`, and `summary.dosResilience` into the top-level Unified Launch Evidence Dossier (`backups/launch-evidence-dossier-<timestamp>.json`). When stage 6 fails or evidence is unavailable, the dossier marks `databaseBaselineCompliance: "failed"` and `databaseTelemetryBaseline: { status: "breached" }`. `scripts/ops/check-launch-readiness.js` extends `checkEvidenceFile` to fail closed when evidence dossiers report `failed_stages > 0`, individual stage failures (`status === 'FAILED'`), SLO compliance failure (`summary.sloCompliance === 'capacity_alerts_failed'`), recovery compliance failure (`summary.recoveryCompliance === 'restore_reconcile_failed'`), or stage summary failures. `scripts/ops/check-production-templates.sh` now requires `scripts/ops/run-launch-drills.sh`, `scripts/ops/run-launch-drills.spec.js`, and `scripts/ops/launch-readiness.sh`, and statically verifies that `run-launch-drills.sh` emits `databaseBaselineCompliance` and `databaseTelemetryBaseline`. `run-launch-drills.spec.js` (9/9 passed) and `check-launch-readiness.spec.js` (30/30 passed) expanded to verify dossier database baseline emission, fail-closed stage/compliance blocking, and valid passed dossier acceptance. Operator launch sign-off remains open.

**Prompt 183 update (2026-09-24): disaster recovery baseline, child evidence cross-validation, and SLO threshold validation.**
`scripts/ops/run-launch-drills.sh` now discovers stage 7 child disaster recovery evidence (`restore-drill-evidence-<timestamp>.json`) and storage reconciliation evidence (`reconcile-report-<timestamp>.json` / `reconciliation-report.json`) and extracts structured `disasterRecoveryBaseline` into the top-level Unified Launch Evidence Dossier (`backups/launch-evidence-dossier-<timestamp>.json`). When stage 7 passes with verified restore parity (RTO compliant, record parity verified, matching source/restored tables and migrations, PostGIS and foreign keys verified) and clean storage reconciliation (zero missing or mismatched objects, non-error status, exit code 0), the dossier marks `disasterRecoveryBaseline.status: "verified"` with granular sub-metrics and records `summary.restoreCompliance: "passed"` and `summary.reconcileCompliance: "passed"`. When stage 7 fails or child evidence is unavailable, the dossier marks `disasterRecoveryBaseline.status: "breached"`, `summary.restoreCompliance: "failed"`, and `summary.reconcileCompliance: "failed"`.

`scripts/ops/check-launch-readiness.js` hardens Category 5 (`slo_and_alerting`) to fail closed if `availability_target_percent < 99.9`, `max_p95_latency_ms > 500`, or `capacity_target_rps < 100`, matching mandated SLO thresholds. Category 6 (`backup_and_disaster_recovery`) now fails closed if `rpo_hours > 1` or `rto_hours > 4`. In `checkEvidenceFile`, cross-validation now inspects child restore drill evidence (blocking on RTO breach, parity failure, PostGIS/foreign-key verification failure, or table/migration count discrepancies), storage reconciliation reports (blocking on error status, missing objects, or checksum/size mismatches), and dossier recovery baseline breaches or restore/reconcile compliance failures. `scripts/ops/check-production-templates.sh` now verifies that `readiness.example.json` sets `availability_target_percent === 99.9`, `max_p95_latency_ms === 500`, `capacity_target_rps === 100`, `rpo_hours === 1`, and `rto_hours === 4`, and that `run-launch-drills.sh` emits `disasterRecoveryBaseline`, `restoreCompliance`, and `reconcileCompliance`. `run-launch-drills.spec.js` (9/9 passed) and `check-launch-readiness.spec.js` (36/36 passed) expanded to verify all recovery baseline schemas, SLO boundary gates, and fail-closed child evidence rules. Operator launch sign-off remains open.

**Prompt 184 update (2026-09-24): deployment and secret rotation baselines, child evidence cross-validation, and dossier integration.**
`scripts/ops/run-launch-drills.sh` now discovers stage 3 child deployment evidence (`deployment-drill-evidence-<timestamp>.json`) and stage 5 child secret rotation evidence (`secret-rotation-evidence-<timestamp>.json`) and extracts structured `deploymentBaseline` and `secretRotationBaseline` into the top-level Unified Launch Evidence Dossier (`backups/launch-evidence-dossier-<timestamp>.json`). When stage 3 passes with verified schema backward compatibility, Caddy edge routing, rollback procedure verification, and network isolation, the dossier marks `deploymentBaseline.status: "verified"` with granular sub-metrics and records `summary.deploymentCompliance: "passed"` and `summary.rollbackCompliance: "passed"`. When stage 5 passes with zero errors, all 7 rotation steps verified, and confirmed secret masking and absence of dev passwords, the dossier marks `secretRotationBaseline.status: "verified"` and records `summary.secretRotationCompliance: "passed"`. If either stage fails or child evidence is missing/invalid, the respective baseline reports status `"breached"` and compliance `"failed"`.

In `scripts/ops/check-launch-readiness.js`, `checkEvidenceFile` now cross-validates deployment drill evidence (blocking on drill failure, non-backward-compatible schema changes, rollback procedure failure, Caddy routing failure, or network isolation failure), secret rotation evidence (blocking on drill failure, non-empty error list, failed rotation steps, or secret redaction / leak audit failure), and evidence dossiers reporting deployment or secret rotation baseline breaches or compliance failures. `scripts/ops/check-production-templates.sh` now verifies that `run-launch-drills.sh` emits `deploymentBaseline`, `secretRotationBaseline`, `deploymentCompliance`, `rollbackCompliance`, and `secretRotationCompliance`. `run-launch-drills.spec.js` (9/9 passed) and `check-launch-readiness.spec.js` (40/40 passed) expanded to verify all baseline schemas, fail-closed child evidence rules, and valid passed evidence acceptance. Operator launch sign-off remains open.

**Prompt 185 update (2026-09-24): volume encryption baseline, child evidence cross-validation, and dossier integration.**
`scripts/ops/verify-volume-encryption.js` now supports `--output <file>` / `-o <file>` to emit structured JSON drill evidence (`volume-encryption-evidence-<timestamp>.json`) containing `drill_type`, `status: "success" | "failed"`, `valid`, `errors`, `warnings`, `totalRequiredMounts` (9), `validMountsCount`, `evaluatedMounts` (all 9 stateful services), `keySeparation` (`verified: true`, `detectedViolations: []`), and `readinessEvaluated`. In `scripts/ops/run-launch-drills.sh`, stage 4 (`volume_encryption`) now passes `--output "${EVIDENCE_DIR}/volume-encryption-evidence-${STAMP}.json"` to emit child evidence, and the dossier aggregator extracts structured `volumeEncryptionBaseline` and records `summary.volumeEncryptionCompliance: "passed"`. When stage 4 passes with all 9 stateful service mounts valid and Key Separation Invariant verified with zero detected key material, the dossier marks `volumeEncryptionBaseline.status: "verified"`. If stage 4 fails or child evidence is missing/invalid, the baseline reports status `"breached"` and compliance `"failed"`.

In `scripts/ops/check-launch-readiness.js`, `checkEvidenceFile` now cross-validates volume encryption child evidence (blocking on verification failure, invalid configuration, non-empty error list, Key Separation Invariant violation, detected keyfile violations, or failed stateful storage mounts), and evidence dossiers reporting volume encryption baseline breach (`volumeEncryptionBaseline.status === 'breached'`) or compliance failure (`summary.volumeEncryptionCompliance === 'failed'`). `scripts/ops/check-production-templates.sh` now verifies that `run-launch-drills.sh` emits `volumeEncryptionBaseline` and `volumeEncryptionCompliance`. `verify-volume-encryption.spec.js` (16/16 passed), `run-launch-drills.spec.js` (9/9 passed), and `check-launch-readiness.spec.js` (43/43 passed) expanded to verify all baseline schemas, fail-closed child evidence rules, and valid passed evidence acceptance. Operator launch sign-off remains open.

**Prompt 186 update (2026-09-25): supply chain, SAST, and container security baseline, child evidence cross-validation, and dossier integration.**
`scripts/ops/generate-sbom.js` now attaches `licenseCompliance` directly to the CycloneDX `bom` object when `--verify-licenses` and `--output` are combined, persisting license verification results in the output artifact (`sbom-inventory-<timestamp>.json`). `scripts/ops/run-sast-scan.js` and `scripts/ops/verify-container-security.js` now support `--output <file>` / `-o <file>` to emit structured JSON drill evidence (`sast-scan-evidence-<timestamp>.json` and `container-security-evidence-<timestamp>.json`). In `scripts/ops/run-launch-drills.sh`, stage 2 (`supply_chain_sast`) now emits all three child evidence files into `$EVIDENCE_DIR`, and the dossier aggregator extracts structured `supplyChainBaseline` (tracking package counts, license compliance verification, license violations, files scanned, findings, triaged/expired/blocking findings, and container security checks) and records `summary.supplyChainCompliance`, `summary.sastCompliance`, and `summary.containerSecurityCompliance`. When stage 2 passes with verified CycloneDX components, zero license violations, zero unreviewed SAST blockers or expired suppressions, and zero container security errors or failed checks, the dossier marks `supplyChainBaseline.status: "verified"` and records compliance `"passed"`. If stage 2 fails or child evidence is missing/invalid, the baseline reports status `"breached"` and compliance `"failed"`.

In `scripts/ops/check-launch-readiness.js`, `checkEvidenceFile` now cross-validates SAST child evidence (blocking on verification failure, passed: false, active unreviewed blockers, or expired suppressions), SBOM child evidence (blocking on license compliance failure, license compliance violations, or license violations), container security child evidence (blocking on verification failure, invalid configuration, errors, or failed checks), and evidence dossiers reporting supply chain baseline breach (`supplyChainBaseline.status === 'breached'`) or compliance failures (`summary.supplyChainCompliance === 'failed'`, `summary.sastCompliance === 'failed'`, `summary.containerSecurityCompliance === 'failed'`). `scripts/ops/check-production-templates.sh` now verifies that `run-launch-drills.sh` emits `supplyChainBaseline`, `supplyChainCompliance`, `sastCompliance`, and `containerSecurityCompliance`. `generate-sbom.spec.js` (8/8 passed), `run-sast-scan.spec.js` (14/14 passed), `verify-container-security.spec.js` (11/11 passed), `run-launch-drills.spec.js` (9/9 passed), and `check-launch-readiness.spec.js` (49/49 passed) expanded to verify all baseline schemas, CLI `--output` options, fail-closed child evidence rules, and valid passed evidence acceptance. Operator launch sign-off remains open.

**Prompt 187 update (2026-09-25): static integrity evidence for stage 1.**
`scripts/ops/run-static-integrity-checks.js --output <file>` executes the fixed production-template, Docker-runtime, and secret/default scans in order, even when one fails. It writes an atomic `static-integrity-evidence-<timestamp>.json` with a timestamp, `drill_type: "static_integrity_verification"`, success/valid verdict, three check IDs (`production_templates`, `docker_runtime`, `secret_defaults`), exit codes, and consistent total/passed/failed counts. It discards child stdout/stderr and records a generic `spawn_failed` result instead of command errors, so matched scanner text cannot enter evidence or stage logs through this runner. Invalid arguments or artifact writes exit nonzero.

The launch orchestrator links that child artifact in stage 1 and derives `staticIntegrityBaseline.status: "verified"` and `summary.staticIntegrityCompliance: "passed"` only from a passed stage and a complete, consistent child artifact. Missing, malformed, or contradictory child evidence yields a breached baseline and failed compliance. Existing `summary.staticIntegrity` remains. Approved readiness evidence validates the child by its drill type or filename and checks the dossier baseline/compliance fields when present; older unrelated evidence remains accepted under its existing rules. Template verification requires the runner/spec and wiring without executing the runner. The new runner suite passed 8/8 tests, the launch drill suite 9/9, and readiness suite 51/51; `ops:templates`, `ops:scan-secrets`, `ops:docker-runtime`, `ops:check`, lint, typecheck, build, and `git diff --check` passed. Stage 7 still needs operator drill infrastructure, and formal launch sign-off remains open.

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
   per category), 11 Prometheus alert runbooks with PromQL, triage,
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
