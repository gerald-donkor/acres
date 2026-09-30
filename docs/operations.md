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
| `infra/launch/readiness.schema.json` | Draft 7 structural/editor contract for the readiness record; does not attest production readiness |
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
9. `graphql_introspection`: Production introspection state, security justification if enabled, and a structured route probe child JSON report (`graphql_introspection_probe`) confirming introspection queries fail closed.
10. `deployment_and_rollback`: Target host architecture, OCI registry host or repository prefix, deployment approver, rollback authority, image provenance policy (Cosign/OIDC), live readiness drill status, and a structured `release` record. `release.reviewed_source_commit` is exactly 40 hex characters. `release.current.client_image`, `release.current.server_image`, `release.previous.client_image`, and `release.previous.server_image` are complete pinned image references. `release.client_provenance_evidence`, `release.server_provenance_evidence`, and `release.live_drill_evidence` are distinct local JSON paths or stable external artifact identifiers (for example, `artifact:release-123-client-verification`). The current images must have `image_registry_path` as a complete registry host or repository prefix, followed by `/`; prior images may come from a former registry.
11. `optional_ai_posture`: Verification that `ai_enabled` is `false`, `no_ai_path_verified` is `true`, `server_ai_draft_enabled_false` is `true`, `no_gemini_api_key_provisioned` is `true`, `unpaid_provider_excluded` is `true`, and `phase11_status` documents the exclusion. Approved records require a structured `no_ai_production_posture_verification` child JSON report covering production API and worker runtime inventory references, three deterministic journeys, and provider policy; every referenced child must pass. Any record with `ai_enabled: true` fails immediately because the unpaid Gemini Developer API preview is excluded from production launch. The report is an operator attestation with references; runtime inspection and journey execution remain operator-owned.

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
   - Authenticates to the source and `postgres` maintenance database and rejects an existing drill target before taking a dump;
   - Takes a fresh PostgreSQL custom archive at a unique, private path under `--backup-dir`;
   - Validates archive integrity with `pg_restore --list`;
   - Creates a previously absent isolated drill database (`acres_restore_drill` by default), never drops or terminates a pre-existing target;
   - Restores the archive using `restore-postgres.sh`;
   - Asserts table and applied migration parity (`_prisma_migrations`), PostGIS presence, zero unvalidated foreign keys, and record count parity (`Account`, `Organization`, `StoredObject`, `Dataset`, `Region`);
   - Measures elapsed milliseconds against the Recovery Time Objective (default 300s). A miss exits nonzero;
   - Removes the database and archive created by this invocation, unless `--keep-drill-db` or `--keep-backup` explicitly retains them. Before deletion, it confirms the target's database OID and owner OID still match those recorded after creation. It publishes JSON success evidence atomically only after required cleanup succeeds (`backups/restore-drill-evidence-<timestamp>-<pid>.json` by default).
   A cleanup failure returns nonzero, leaves the archive for investigation when database removal is uncertain, and names the target. An interruption also attempts owned-resource cleanup. A blocked database drop does not terminate sessions or retry against an arbitrary target; the operator must investigate it manually. The identity check and `DROP DATABASE` are separate PostgreSQL commands, so the operator must isolate the drill from privileged processes that could replace the target between those commands. An existing evidence destination is rejected rather than overwritten. `--dry-run` checks authentication and target absence without dumping or creating a database.
   The isolated command suite is `npm run ops:restore-drill-test`; its PostgreSQL commands are stubbed, and `ops:check` includes it. This test does not establish a successful live restore.
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

4. **Launch Approval Child Evidence Requirement**:
   Approved Category 8 (`volume_encryption`) records must reference a concrete volume encryption child JSON report in `evidence`. A custom path qualifies by report content; declaration, prose, filename alone, or unified dossier does not. The validator requires a valid, nonfuture ISO UTC `timestamp`, `status: "success"`, `valid: true`, empty `errors` array, `keySeparation.verified: true`, empty `keySeparation.detectedViolations` array, and `evaluatedMounts` array containing all items with `passed: true` covering at least the 3 required stateful mounts (PostgreSQL, Valkey, Garage). If total/valid mount counts are present, they must be equal positive integers. Every referenced child report, including wildcard matches, must pass. This verifies report consistency with the launch record; the operator remains obligated to inspect physical host encryption, confirm detached key separation, and audit volume mounts.

### Secret Rotation & Emergency Compromise Response Runbook

1. **Automated Secret Rotation Drill**:
   Execute `npm run ops:rotation-drill` (or `scripts/ops/run-secret-rotation-drill.sh [options]`) only as rehearsal. Prompt 235 classifies every receipt as simulation; the seven-class list is intended coverage, and SMTP/Grafana are not independently exercised. The following historical algorithm descriptions are mock/local exercises, not production rotation or zero-downtime evidence:
   - **Session Secret Rollover (`SESSION_SECRET`)**: Evaluates dual-key rollover window. Primary Key A signs session tokens; Key B rotated to Primary with Key A retained as Secondary during grace window. Verifies 0 dropped active sessions, and asserts that expired/retired Key A tokens are rejected after grace window.
   - **CSRF Secret Rollover (`CSRF_SECRET`)**: Offline HMAC simulation of token re-issuance and stale-token rejection. This does not rotate a running API; live clients must obtain a new `GET /auth/csrf` token after rotation.
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

**Current rotation qualification (prompt 235, 2026-09-30):** The dated rotation
results below describe local algorithms and mock services. No live service
rotation, SMTP/Grafana verification or zero-downtime guarantee is established.
Opaque Acres sessions are not proven signed by the generalized HMAC example.

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
   - Offline repository pattern assertions for five protection boundaries (TM-05, TM-20); these do not measure deployed behavior:
     - **Layer 1: Edge Ingress Bounds (Caddy)**: Request body limit (`$ACRES_MAX_REQUEST_BODY`) and transport timeouts (`read_timeout`, `write_timeout`, `dial_timeout`);
     - **Layer 2: In-Process Rate Limiting & Throttling (NestJS)**: RateLimitGuard enforcing `RATE_LIMIT_DEFAULT_LIMIT` (120 req/min) and `RATE_LIMIT_STRICT_LIMIT` (10 req/min). `@StrictThrottle` decorator verified on sensitive endpoints (`POST /api/v1/auth/login`, `POST /api/v1/auth/register`, `POST /api/v1/auth/forgot-password`, `POST /api/v1/forms/contact`) asserting fail-closed HTTP 429 `RATE_LIMITED`. `@SkipThrottle` verified on `/health` and `/metrics` preventing DoS starvation of liveness/readiness probes;
     - **Layer 3: GraphQL Resource Bounds**: Pre-parse 12KB ceiling (`GRAPHQL_MAX_BYTES`), max depth 8 (`GRAPHQL_MAX_DEPTH`), max aliases (`GRAPHQL_MAX_ALIASES`), complexity ceiling 250 (`GRAPHQL_MAX_COST`), and node ceiling 250 (`GRAPHQL_MAX_NODES`), with strict single-operation enforcement;
     - **Layer 4: Storage & Upload Bounds**: 50MB streaming ceiling (`UPLOAD_MAX_BYTES`) and ClamAV quarantine scanning isolation prior to S3 bucket publication;
     - **Layer 5: Anti-Enumeration Timing Defense**: Constant-time bcrypt execution via dummy password verification on missing accounts (`accounts.verifyPassword(null, 'dummy-password-check')`).
   - Emits structured JSON audit evidence reports (`backups/dos-resilience-evidence-<uuid>.json`).
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
   - Offline command: `npm run ops:capacity-alerting-drill -- --dry-run` (or `npm run ops:dos-drill -- --dry-run`). Non-dry DoS invocations require separate operator authorization.
   - Offline criteria: alert rules valid and simulated, synthetic capacity SLOs satisfied, and five repository protection assertions passing. Live acceptance still requires operator evidence; the bounded DoS exercise observes login throttling and liveness only.
   - Evidence: Inspect generated report in `backups/capacity-alerting-drill-evidence-<timestamp>.json`.
6. **Operations & CI Integration**:
   - Added root package scripts: `npm run ops:capacity-test`, `npm run ops:capacity-drill`, `npm run ops:alert-test`, `npm run ops:alert-drill`, `npm run ops:dos-drill`, `npm run ops:capacity-alerting-drill`.
   - Integrated `npm run ops:capacity-test` and `npm run ops:alert-test` into `npm run ops:check`.
   - Updated `scripts/ops/check-production-templates.sh` requiring all 7 alerts, alert rule verification, and capacity evaluation.
   - Supplies repository checks for TM-05, TM-16, and TM-20. Category 5 and production threat acceptance remain open pending operator evidence and sign-off.

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

**Prompt 191 update (2026-09-25): bind volume encryption approval to child evidence.**
Approved Category 8 (`volume_encryption`) records now require a concrete volume encryption child JSON report in `evidence`. A custom path qualifies by report structure and content; declaration, prose, a plausible filename alone, or the unified dossier does not. The validator requires a valid, nonfuture ISO UTC `timestamp`, `status: "success"`, `valid: true`, empty `errors` array, `keySeparation.verified: true`, empty `keySeparation.detectedViolations` array, and an `evaluatedMounts` array containing all items with `passed: true` covering at least 3 stateful mounts (PostgreSQL, Valkey, Garage). If total/valid mount counts are declared, they must be equal positive integers. Every referenced child report, including wildcard matches, must pass; a malformed or failing report blocks approval even beside a valid one. The readiness test suite passed 64/64 tests, `npm run ops:volume-test` passed 17/17, `npm run ops:templates` passed, `npm run ops:check` passed, and lint, typecheck, build, and `git diff --check` passed cleanly. The unapproved example failed closed with 11 blocked categories and 70 blockers. Report consistency does not prove physical host encryption or out-of-band KMS custody: the operator remains responsible for verifying detached key management, dual custody, and production volume mounts before approving launch.

**Prompt 192 update (2026-09-25): bind secret rotation approval to child evidence.**
**Superseded for production acceptance by prompt 235:** Structural success alone
no longer approves Category 3; the explicit live operator receipt is required.

Approved Category 3 (`secrets_management`) records now require a concrete secret rotation child JSON report in `evidence` alongside runtime injection, masking policy, compromise runbook references, and a rotation cadence not exceeding 90 days. A custom path qualifies by report structure and content; declaration, prose, a plausible filename alone, or the unified dossier does not. The validator requires a valid, nonfuture UTC `timestamp` (basic `YYYYMMDDTHHMMSSZ` or ISO 8601), `status: "success"`, empty `errors` array, all 7 tested secret classes (`session_secret`, `csrf_secret`, `postgres_passwords`, `valkey_password`, `storage_s3_keys`, `smtp_credentials`, `grafana_admin_password`), and all 7 verified steps (`session_rollover`, `csrf_rollover`, `database_rotation`, `valkey_rotation`, `storage_rotation`, `compromise_response`, `redaction_audit`) reporting `status: "passed"` with secret redaction audit confirmation (`raw_secrets_masked: true`, `zero_dev_passwords_detected: true`). In addition, `rotation_cadence_days` is validated as a positive number ≤ 90 days. Every referenced child report, including wildcard matches, must pass; a malformed or failing report blocks approval even beside a valid one. The readiness test suite passed 70/70 tests, `npm run ops:templates` passed, `npm run ops:check` passed, and lint, typecheck, build, and `git diff --check` passed cleanly. The unapproved example failed closed with 11 blocked categories and 70 blockers. Report consistency does not prove production secret injection or actual KMS credentials: the operator remains responsible for managing production Vault/AWS SM instances, executing live rotations, and verifying out-of-band credential hygiene before approving launch.

**Prompt 193 update (2026-09-25): bind deployment drill approval to child evidence.**
Approved Category 10 (`deployment_and_rollback`) records now require a concrete deployment drill child JSON report in `evidence` or `release.live_drill_evidence` alongside target host profile, image registry path, deployment approver, rollback authority, image provenance policy, live drill completion declaration, and an immutable release record. A custom path qualifies by report structure and content; declaration, prose, a plausible filename alone, or the unified dossier does not. The validator requires a valid, nonfuture UTC `timestamp` (basic `YYYYMMDDTHHMMSSZ` or ISO 8601), `status: "success"`, `schema_backward_compatible: true`, `rollback_procedure_verified: true`, `caddy_routing_verified: true`, integer `caddy_routes_tested >= 12`, `security_headers_verified: true`, `s3_sigv4_host_preserved: true`, `migrations_verified: true`, integer `migration_count >= 0`, `operational_templates_verified: true`, `secrets_scan_verified: true`, `readiness_probes_verified: true`, `network_isolation_verified: true`, and matching `graceful_drain_periods_verified` (`caddy: '30s'`, `next: '30s'`, `api: '45s'`, `worker: '60s'`). Every referenced child report, including wildcard matches, must pass; a malformed or failing report blocks approval even beside a valid one. The readiness test suite passed 74/74 tests, `npm run ops:templates` passed, `npm run ops:check` passed, and lint, typecheck, build, and `git diff --check` passed cleanly. The unapproved example failed closed with 11 blocked categories and 70 blockers. Report consistency does not prove production container registry integrity or live deployment executions: the operator remains responsible for managing production hosts, OCI registry credentials, and live rollbacks before approving launch.

**Prompt 194 update (2026-09-25): bind capacity alerting approval to child evidence.**
Historical record: the producer-field and success-only requirements below were
superseded by prompt 234 on 2026-09-30; see its current contract record.

Approved Category 5 (`slo_and_alerting`) records now require a concrete capacity and alerting drill child JSON report in `evidence` alongside declared SLO targets, alert recipients, defined thresholds, and escalation runbook reference. A custom path qualifies by report structure and content; declaration, prose, a plausible filename alone, or the unified dossier does not. The validator requires a valid, nonfuture UTC `timestamp` (basic `YYYYMMDDTHHMMSSZ` or ISO 8601), `status: "success"`, empty `failures` array, all 4 summary compliance flags (`alertVerification`, `capacitySloCompliance`, `dosResilience`, `databaseBaselineCompliance`) reporting `"passed"`, `alerts.valid: true`, `alerts.ruleCount >= 11`, all simulations reporting `passed: true`, empty `alerts.errors` array, `capacity.compliance.overallPassed: true` with all individual compliance flags (`availabilityPassed`, `latencyPassed`, `throughputPassed`, `databaseAcquisitionLatencyPassed`, `databaseQueryLatencyPassed`, `monotonicDbAcquisition`, `monotonicDbQuery`) reporting `true`, `databaseTelemetryBaseline.status: "verified"` with exporter/server reporting up, zero connection pool waiting requests, acquisition p95 ≤ 50ms, query execution p95 ≤ 100ms, zero lock waits, and `dosResilience.status: "success"`. Every referenced child report, including wildcard matches, must pass; a malformed or failing report blocks approval even beside a valid one. The readiness test suite passed 78/78 tests, `npm run ops:templates` passed, `npm run ops:check` passed, and lint, typecheck, build, and `git diff --check` passed cleanly. The unapproved example failed closed with 11 blocked categories and 70 blockers. Report consistency does not prove production monitoring connectivity or live alert dispatch: the operator remains responsible for configuring live Prometheus/Alertmanager endpoints, PagerDuty/on-call routing, and maintaining active runbooks before approving launch.

**Prompt 195 update (2026-09-25): bind production domain and TLS approval to child evidence.**
Approved Category 1 (`production_domain_tls`) records require a concrete Caddy routing child JSON report in `evidence`, a valid production FQDN and TLS contact email, `hsts_approved: true`, and a boolean `custom_certificates`. The Caddy verifier emits structured JSON with `--output` or `--json`; Stage 3 of the unified drill writes a Caddy child artifact. For an approved production Caddyfile with active HSTS and a concrete positive `max-age`, the operator invokes the verifier with `--allow-hsts`. The readiness validator requires a real, nonfuture UTC timestamp, the expected drill type, success and validity, no errors, `hstsApproved: true`, verified security and proxy headers, S3 SigV4 Host preservation, and at least 12 passing routes with matching counts. The report domain must match the approved domain and its target cannot be `Caddyfile.example`; the default template drill report alone cannot approve a production domain. Every referenced child report, including wildcard matches, must pass. The targeted suites passed 112/112, `ops:check` exited 0, lint, typecheck, build, and `git diff --check` passed. The unresolved example remained blocked (0 approved categories, 11 blocked, 70 blockers). The operator must still verify production DNS, live TLS issuance/handshake, HSTS approval, and certificate recovery; static Caddyfile evidence does not prove those live conditions.

**Prompt 196 verification (2026-09-25):** Approved Category 2 (`smtp_delivery`)
now requires a concrete SMTP delivery child JSON report. The report binds the
provider, host, integer port, TLS mode, and sender to the approved record and
requires a delivered receipt identifier, real nonfuture UTC timestamps, and
passing SPF, DKIM, and DMARC printout references. Every referenced child,
including wildcard matches, must pass; prose and the unified dossier do not
qualify. The SMTP credential reference must match the indirect SMTP secret
reference. The readiness suite passed 89/89; `ops:templates`, `ops:check`, lint,
typecheck, build, and `git diff --check` passed. The unresolved example still
failed closed with 0 approved categories, 11 blocked, and 70 blockers. The
operator must obtain the actual provider receipt and public DNS printouts;
the validator checks consistency, not provenance or live mail delivery.

**Prompt 197 verification (2026-09-25):** Approved Category 4
(`secret_references`) now requires a redacted secret-store policy child JSON
report whose twelve entries exactly match the approved indirect references,
confirm access checks, and explicitly record no plaintext exposure. Every
referenced JSON child must pass; prose and a unified dossier alone do not
qualify. The readiness suite passed 92/92; `ops:templates`, `ops:check`, lint,
typecheck, build, and `git diff --check` passed. The unresolved example remains
blocked (0 approved categories, 11 blocked, 70 blockers). The operator must
obtain the live least-privilege policy printout and verify actual store access;
the validator checks report consistency, not provenance or live permissions.

**Prompt 198 verification (2026-09-25):** Approved Category 7
(`data_retention_policy`) now requires standard retention window validation
(upload quarantine 7d, rejected objects 1d, exports 30d, telemetry 15d, backups
30d, positive day windows for accounts and audit logs, and
indefinite-or-positive-day duration for reports) and a concrete retention
policy review child JSON report in `evidence` with `drill_type:
"data_retention_policy_verification"`, nonfuture UTC timestamp, `status:
"success"`, empty errors, `scheduled_cleanup_verified: true`, and all eight
matching policy windows with `policy_verified: true`. Every referenced JSON
child must pass; prose and a unified dossier alone do not qualify. The
readiness suite passed 96/96; `ops:templates`, `ops:check`, lint, typecheck,
build, and `git diff --check` passed. The unresolved example remains blocked (0
approved categories, 11 blocked, 70 blockers). The operator must conduct the
formal legal and operational retention review; the validator checks consistency,
window compliance, and child report validity.

## Phase 12K Unified Launch Drill, Checklist & Runbooks

**Prompt 230 update (2026-09-28): secret rotation drill hardening and automated test suite.**
**Current qualification (prompt 235):** These runner receipts are simulation
rehearsal, not production approval evidence. The current child contract follows
in the prompt-235 record.

The dedicated zero-downtime secret rotation and compromise response drill runner (`scripts/ops/run-secret-rotation-drill.sh`)
CLI option parsing is now hardened with fail-closed non-empty value validation for `--evidence-dir`, `--evidence-file`,
`--api-url`, `--pghost`, `--pgport`, `--valkey-host`, and `--valkey-port`. Step 1 ("Pre-rotation Validation & Operational Baseline Check")
now runs `scripts/ops/check-production-templates.sh` alongside `scripts/ops/scan-secrets.sh` and `verify-volume-encryption.js`,
ensuring operational templates and environment definitions are clean before secret rotation simulations begin.
A dedicated automated unit test suite (`scripts/ops/run-secret-rotation-drill.spec.js`) validates `--help`/`-h` usage,
unknown option rejection, missing/flag-like argument guards, clean `--dry-run` execution with full Category 3 evidence emission,
custom target parameters, custom `--evidence-dir` and `--evidence-file` routing, and strict compliance with `check-launch-readiness.js`'s
`validateSecretRotationReport` contract (all 7 secret classes, 7 verified steps, and redaction audit invariants).
`ops:rotation-test` is integrated into root `package.json` and the `npm run ops:check` gate, and `check-production-templates.sh`
statically verifies runner option validation and pre-rotation template checks.
Verification: `ops:rotation-test` passed 7/7; `ops:templates`, `ops:rotation-drill -- --dry-run`, `ops:check`, lint, typecheck, build, and `git diff --check` passed cleanly.

**Prompt 229 update (2026-09-28): deployment promotion drill hardening and automated test suite.**
The dedicated deployment promotion and rollback drill runner (`scripts/ops/run-deployment-drill.sh`) step 5
evaluation now validates full operational container lifecycle requirements fail-closed during deployment preflights:
all eleven production services must declare `restart: unless-stopped` and a positive bounded `stop_grace_period` matching
`/^[1-9]\d*s$/`, with application services verified against verified drain contracts (`caddy: 30s`, `next: 30s`, `api: 45s`, `worker: 60s`).
Dependency health gating asserts that `api` requires healthy `postgres`, `valkey`, and `garage`; `worker` requires healthy `postgres`,
`valkey`, `garage`, and `clamav`; `caddy` requires healthy `next`, `api`, and `garage`; `grafana` requires healthy `prometheus`; and
`postgres-exporter` requires healthy `postgres`. Process signal supervision verifies `init: true` and `stop_signal: SIGTERM` across `api`,
`worker`, and `next`. CLI option parsing is hardened with non-empty argument value guards.
A dedicated unit test suite (`scripts/ops/run-deployment-drill.spec.js`) tests CLI usage, argument validation, fail-closed handling on missing/corrupted
Compose files, drifted grace periods, unready dependencies, missing init/signal supervision, network isolation leaks, and Category 10 structured evidence emission.
`ops:deployment-test` is integrated into root `package.json` and the `npm run ops:check` gate, and `check-production-templates.sh` asserts its presence and checks.
Verification: `ops:deployment-test` passed 12/12; `ops:templates`, `ops:deployment-drill -- --dry-run`, `ops:check`, lint, typecheck, build, and `git diff --check` passed cleanly.

**Prompt 228 update (2026-09-28): harden application container dependencies and shutdown lifecycle.**
Static verification in `scripts/ops/verify-container-security.js` and `scripts/ops/check-production-templates.sh`
now strictly validates application service dependencies, complete signal supervision, and graceful shutdown drain periods.
`api` is verified to gate startup on healthy datastores (`postgres`, `valkey`, `garage`), and `worker` is verified to gate
startup on healthy `postgres`, `valkey`, `garage`, and `clamav`, eliminating race conditions during cold boots.
`process-init-supervision` now strictly enforces both `init: true` and `stop_signal: SIGTERM` across `api`, `worker`, and `next`.
A new `graceful-shutdown-lifecycle` check enforces that all eleven production services declare `restart: unless-stopped`
and explicit bounded `stop_grace_period` durations, specifically verifying application drain contracts (`caddy: 30s`, `next: 30s`,
`api: 45s`, `worker: 60s`).
Verification: `ops:container-test` passed 22/22; `ops:container-security` passed 22/22 checks; `ops:templates`,
`ops:deployment-drill -- --dry-run`, `ops:check`, lint, typecheck, build, and `git diff --check` passed cleanly.

**Prompt 227 update (2026-09-28): harden observability container healthchecks and dependencies.**
The production Compose template now explicitly declares `depends_on: postgres: condition: service_healthy`
for `postgres-exporter`, ensuring the database metrics exporter does not attempt connections before
PostgreSQL role initialization and healthchecks complete. `prometheus` now defines an explicit bounded
healthcheck (`wget -qO- http://127.0.0.1:9090/-/healthy || exit 1`, interval: 30s, timeout: 5s,
start_period: 15s, retries: 3). `grafana` explicitly defines `depends_on: prometheus: condition: service_healthy`,
ensuring the Grafana UI does not attempt dashboard queries against an unready Prometheus server.
In `scripts/ops/run-deployment-drill.sh`, the step 5 network isolation check expands to inspect all ten
internal services (`next`, `api`, `worker`, `postgres`, `valkey`, `garage`, `clamav`, `prometheus`,
`postgres-exporter`, `grafana`), ensuring none joins the public network. In `scripts/ops/verify-container-security.js`,
a new `observability-dependencies-healthy` check enforces that `prometheus` defines its bounded healthcheck,
`postgres-exporter` requires `postgres: condition: service_healthy`, and `grafana` requires `prometheus: condition: service_healthy`.
Production template validation in `scripts/ops/check-production-templates.sh` asserts all three invariants.
Verification: `ops:container-test` passed 19/19; `ops:container-security` passed 20/20 checks;
`ops:templates`, `ops:deployment-drill -- --dry-run`, `ops:check`, lint, typecheck, build, and `git diff --check` passed cleanly.

**Prompt 226 update (2026-09-28): strengthen container healthchecks and internal network isolation.**
The production Compose template now explicitly defines a bounded healthcheck for the
`next` service (`wget -qO- http://127.0.0.1:3000/ || exit 1`, interval: 30s, timeout: 5s,
start_period: 15s, retries: 3) matching `infra/docker/client.Dockerfile.example`.
Caddy's `depends_on.next` condition is tightened from `service_started` to
`service_healthy`, ensuring Caddy does not route edge traffic before Next.js is
ready. The `clamav` healthcheck adds `start_period: 30s` to prevent premature retry
exhaustion during signature initialization. In `scripts/ops/verify-container-security.js`,
`service-healthchecks-defined` enforces bounded healthchecks across all seven core
application and datastore services (`api`, `worker`, `next`, `postgres`, `valkey`,
`garage`, `clamav`). `datastore-network-isolation` is expanded to verify that all ten
internal services (`next`, `api`, `worker`, `postgres`, `valkey`, `garage`, `clamav`,
`prometheus`, `postgres-exporter`, `grafana`) attach exclusively to the private network.
A new `caddy-dependencies-healthy` check enforces that all Caddy backend dependencies
require `condition: service_healthy`.
Verification: `ops:container-test` passed 16/16 with focused regression mutations;
`ops:container-security` passed 19/19 checks; `ops:templates`, `ops:deployment-drill -- --dry-run`,
`ops:check`, lint, typecheck, build, and `git diff --check` passed cleanly.

**Prompt 225 update (2026-09-28): authenticate the production Valkey probe.**
The production Compose example now injects the mandatory `VALKEY_PASSWORD` into
the Valkey container as well as its `--requirepass` command. Its healthcheck
reads that in-container variable through `VALKEYCLI_AUTH` and requires an exact
`PONG` line. The container-security validator checks that the unrendered server,
environment and probe sources match; mutation tests reject a missing binding,
an unbound probe variable and a different server source. The credential was
already present in the server command and is now also visible in the Valkey
container environment, so operators must restrict container-inspection access
to the same authorized identities. This template change does not prove a live
container is healthy, that an operator injected a production credential, or
that Category 4 is approved.
Verification: Docker Compose 5.5.1 rendered a synthetic input; the Valkey
environment had only `VALKEY_PASSWORD`, its server command used the same value,
the probe retained its escaped container variable, and no port was published.
`ops:container-test` passed 13/13, `ops:container-security`, `ops:templates`,
`ops:check`, lint, typecheck, the production build and `git diff --check` passed.
The checked-in readiness example still failed closed with 0 approved categories,
11 blocked and 70 blockers. A local Docker daemon was reachable, but the pinned
`valkey/valkey:9` image was not installed, so live container probe behavior was
not verified. The first sandboxed container test was denied subprocess execution
(`EPERM`), and the first sandboxed Next build failed while parsing TypeScript
`--showConfig`; both checks passed on the permitted rerun.

**Prompt 220 update (2026-09-27): production API/worker environment scope.**
The API and worker production Compose services now use explicit environment
maps. The API gets its runtime database URL, session and browser origin, SMTP,
rate/GraphQL limits, queue, storage and processing settings. The worker
gets its runtime database URL, queue, storage, scanner, parser, outbox, metrics
and cleanup settings; no SMTP, database migration, superuser, Grafana or
operator-control credentials are injected. Both set `AI_DRAFT_ENABLED=false`
and exclude `GEMINI_API_KEY`. Prompt 223 decouples `SESSION_SECRET` and
`CLIENT_ORIGIN` from worker boot validation and removes both from the worker
Compose environment map, eliminating that residual coupling. API SMTP security
mode and sender identity now have operator placeholders so the production
reference cannot silently take local development defaults. The parsed
`check-application-environment` preflight verifies exact service key maps,
required interpolation, and one active operator-template assignment per input,
reporting key names only. Existing operators must replace older materialized
Compose maps, materialize the two new SMTP settings, render without printing
resolved values, and inspect redacted effective API/worker key inventories on
the actual host. The checked-in reference does not prove live injection or
Category 4 approval. CSRF source and Garage metrics consumer remain open.
Verification on 2026-09-27: `npm run ops:templates-test` passed 25/25 cases,
`npm run ops:templates` and `npm run ops:check` exited 0, and lint, typecheck,
build and `git diff --check` passed. Docker Compose 5.5.1 rendered a fully
synthetic input without printing values: API had 57 keys, worker 36, neither
had `env_file`; the worker had no SMTP, migration, superuser, Grafana or Gemini
key. The checked-in readiness example still failed closed with 70 blockers
(exit 1). The first sandboxed `ops:check` could not reach the npm audit registry;
the network-enabled rerun passed. The first sandboxed Next build failed at
TypeScript `--showConfig`; the normal-process rerun passed.

**Prompt 219 update (2026-09-27): production Caddy/Next environment scope.**
The production Compose example no longer injects its shared env file into
`caddy` or `next`. Caddy receives exactly the 13 current Caddyfile inputs,
including the reserved HSTS value; each uses required Compose interpolation.
Next retains only `NODE_ENV=production` and its private API origin. The parsed
template preflight and focused offline regression tests enforce those maps and
reject shared injection, extra secrets, missing/miswired inputs and drift.
At prompt 219, `api` and `worker` still used the shared env file; prompt 220
completed that separate audit and scoped their maps above.
Operators must migrate any older materialized Compose file, render and inspect
the revised config, and confirm redacted effective container key inventories
before Category 4 approval. Reverting this change restores Caddy/Next secret
exposure. This is a repository template fix, not proof of production deployment;
the CSRF-source and Garage-metrics gaps and Phase 12 sign-off remain open.
Verification: `ops:templates-test` passed 15/15 focused cases;
`ops:templates`, `ops:check`, lint, typecheck and the production build exited 0.
Docker Compose 5.5.1 rendered a synthetic input file with Caddy's 13 expected
keys and Next's two expected keys, neither with `env_file`; no resolved values
were printed. The first sandboxed `ops:check` could not resolve the npm audit
registry; the network-enabled rerun passed. The first sandboxed Next build
stopped at TypeScript `--showConfig`; the normal-process rerun passed. No live
container or operator secret store was inspected.

**Prompt 218 update (2026-09-27): production SMTP credential names.**
`infra/env/production.env.example` now uses `SMTP_USER` and `SMTP_PASS`, the
names parsed by the server and consumed by the SMTP adapter. The production
template preflight requires each assignment exactly once and rejects active
`SMTP_USERNAME`/`SMTP_PASSWORD` assignments; the focused offline regression
test is `npm run ops:templates-test` and runs in `ops:check`. No credential
value or provider decision is stored here. Operators who already materialized
the former names must map them to `SMTP_USER`/`SMTP_PASS` before deployment and
verify the actual runtime injection and a delivered receipt. The shared
`env_file`, CSRF-source and Garage-metrics findings in the launch checklist
remain open; Categories 2 and 4 and Phase 12 sign-off remain unresolved.
Verification: `ops:templates-test` passed 5/5, `ops:templates` passed,
`ops:readiness-schema-test` passed 8/8, `ops:readiness-test` passed 103/103,
`ops:check` exited 0, and lint, typecheck, build and `git diff --check`
passed. The unresolved readiness example still exited 1 with 0/11 approved
categories and 70 blockers. The sandboxed readiness test and build could not
spawn their child processes; both passed when rerun with execution permission.
The sandboxed `ops:check` stopped at npm audit DNS resolution, then the full
gate passed with registry access. This check establishes repository behavior,
not production injection or delivered mail.

Prompt 204 (2026-09-26) adds `infra/launch/readiness.schema.json` and
`npm run ops:readiness-schema-test` to the operational gate. Ajv compiles the
Draft 7 schema and checks the unresolved example plus representative malformed
records. It is a structural/editor aid; `check-launch-readiness.js` retains
the fail-closed evidence, secret, target, time, release-image, and approval
decisions. The schema rejects unknown fields, so future record extensions must
update it alongside the validator and template. The example remains unresolved
and formal operator sign-off remains open.

**Prompt 202 update (2026-09-26): target-bound launch drill evidence.**
`run-launch-drills.sh` accepts `--caddyfile`, `--compose-file`, `--allow-hsts`,
`--target-url`, `--api-url`, and `--database-telemetry-file`; the exact operator
command and telemetry contract are in `docs/launch-checklist.md` §4. Stage
commands execute as argument vectors, so operator paths are never parsed by
`bash -c`. Stage 3 passes the selected Caddyfile through both verifiers and the
Compose file to the deployment child. A targeted Stage 3 passes only with
matching child files, at least 12 passing routes, approved HSTS and a domain
matching the benchmark host, and the expected Acres liveness/readiness JSON
from the selected API origin. Stage 6 passes its
URLs through to the child and requires live capacity mode, matching hashed
target identifiers, and fresh, independently supplied database telemetry with
healthy exporter/server, bounded pool/query latency, no pool waiters, and no
lock waits. The previous hard-coded passing database telemetry appears only in
explicit synthetic offline evidence. A no-target run remains a default drill;
the dossier always says `environment: "drill"` and records hashed `targets`
identifiers. Missing or contradictory child content breaches the relevant
stage and baseline even if a child process exited zero. Secret rotation remains
dry-run and reconciliation read-only. The operator still owns live TLS, alert
delivery, promotion/rollback, restore infrastructure, and approval.
Verification: `npm run ops:check` exited 0 (launch suite 12/12), then the final
launch suite passed 13/13 after the default-drill regression was added. The
target/telemetry helper suite passed 5/5; lint, typecheck, build, Bash syntax,
and `git diff --check` passed. A controlled loopback live-target run without a
telemetry file exited 1 and emitted `databaseTelemetryBaseline.status:
"breached"`. No operator environment or production load was exercised.

Implemented from `prompts/67-unified-launch-drill-runner-and-operator-launch-checklist.md`.
This is the Phase 12 exit gate: one orchestrator, one dossier, one checklist.

1. **Unified Launch Drill Orchestrator (`scripts/ops/run-launch-drills.sh`)**:
   - Bash (matching the sibling drills). Executes 7 stages (`static_templates`,
     `supply_chain_sast`, `ingress_deployment`, `volume_encryption`,
     `secret_rotation`, `capacity_alerting`, `disaster_recovery`) and emits the
     Unified Launch Evidence Dossier
     (`backups/launch-evidence-dossier-<timestamp>-<run-id>.json`) with `version`,
     extended-ISO `timestamp`, `environment`, `overall_status`,
     `total/passed/failed_stages`, `duration_seconds`, per-stage
     `stage_id`/`status`/`duration_ms`/`artifacts`/`error_message`, and a
     `summary` across integrity, security, SLO, recovery, and no-AI posture.
   - Each invocation owns `launch-drill-run-<unique-id>/<stage_id>/` under
     the selected evidence parent. Stage logs and exact registered child receipts
     live there; dossier `artifacts` list absolute registered paths and the
     final dossier. Directory discovery is removed (prompt 233).
   - Flags: `--dry-run`, `--json`, `--output <path>`, `--evidence-dir <dir>`,
     `--verbose`, `--help`. Without `--dry-run`, children run live against
     drill infra — except secret rotation, which stays `--dry-run` by design.
     Exit 0 only when every stage passes.
   - `ops:launch-drill-test` runs the real Bash runner in disposable repository
     fixtures with all service/audit children stubbed, plus pure assembly tests.
     It does not read live services or sweep repository `backups/`.
   - The real runner's static-integrity child can contact npm. Restore dry-run
     preflight and read-only reconciliation require live drill infrastructure;
     a successful dry restore preflight emits no recovery receipt, so Stage 7
     remains failed without complete restore/reconciliation evidence. Synthetic
     capacity is accepted only in explicit `--dry-run` rehearsal. Default mode
     fails synthetic Stage 6. These are drill gates, not production approval.
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

## Prompt 221 — separate CSRF signing source

The production API template now requires a distinct `CSRF_SECRET` input. The
worker's separate validation path neither requires nor receives that key. The
API rejects missing values at boot in every environment and rejects placeholders,
short values and equality with `SESSION_SECRET` in production. The template
preflight checks the API-only Compose mapping, matching required interpolation,
single operator assignment and unresolved example placeholder. Before deploying
this version, operators must update already materialized production env/Compose
files and grant the API a separate CSRF store value. Cutover and subsequent key
rotation invalidate prior CSRF tokens; clients obtain a fresh token from
`GET /auth/csrf`. The offline rotation drill models independent CSRF rollover
but does not rotate a live API. Garage metrics consumption, live secret grants
and Category 4/Phase 12 approval remain open.

The CI Docker smoke container and Playwright API web server also inject distinct
synthetic CSRF keys so their API boot paths satisfy the new requirement. The
CI smoke environment additionally supplies its already-required synthetic
Valkey URL and token lifetimes; its parsed environment passes `validateEnv`.
The workflow YAML parsed, the secret scan passed, and Playwright listed its 74
configured tests. The browser suite was not run here because local PostgreSQL
on port 5432 did not respond.

Verification on 2026-09-28: focused config/CSRF Jest suites passed 151/151;
environment-validation e2e passed 16/16; `npm run ops:templates`,
`npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and
`git diff --check` passed. The dependency audit gate reported zero critical
advisories (16 lower-severity advisories remain). The checked-in readiness
example still failed closed with 11 blocked categories and 70 blockers. The
full build and operations gate required execution outside the sandbox because
the sandbox suppressed Node child stdout and registry DNS respectively.

## Prompt 222 — Garage metrics credential and private scrape

The production template replaces the unused `GARAGE_METRICS_TOKEN` environment
value with an operator-owned absolute `ACRES_GARAGE_METRICS_TOKEN_FILE` path.
The same host file is mounted read-only in Garage and Prometheus at
`/run/secrets/garage_metrics_token`. Garage reads `GARAGE_METRICS_TOKEN_FILE`;
its shared TOML requires token authentication for `/metrics` on private admin
port 3903. Prometheus's `acres-garage` job reads that file through
`authorization.credentials_file` and scrapes `garage:3903/metrics` at the
existing 30-second global cadence. The Garage `/health` probe remains
unauthenticated. Local Compose shares the TOML but supplies no token, so local
`/metrics` is deliberately inaccessible while local `/health` still works.

The operator must provision one restricted file matching the approved indirect
`garage_metrics_secret_source`. Use ownership and mode 0400 or 0440 only after
confirming both running container UIDs/GIDs can read it; the pinned Garage
image's UID was not verified here because Docker daemon access was denied.
Deploy the materialized Garage and Prometheus Compose/config changes together,
remove the old plaintext Garage metrics environment input, and restart or reload
both consumers in the deployment window. Verify `/metrics` rejects missing and
wrong bearers, succeeds with the file's bearer, and that the private Prometheus
target reports `up{job="acres-garage"} == 1`. Avoid printing the token in shell
history, logs or evidence. Rotation updates the same source and restarts or
reloads both readers before repeating those checks. Rollback restores the old
Garage and Prometheus configs and removes both mounts and scrape together;
protect and revoke the old file through the operator procedure.

Static template checks and synthetic configuration evidence do not prove the
production secret-store grant, live file readability, authorization responses,
scrape health, or Category 4/5 approval. No Garage-specific metric series or
capacity threshold is asserted until observed from the pinned runtime. Garage
metrics cardinality and retention impact require operator measurement.

Verification on 2026-09-28: the 55 production-template tests, `npm run
ops:templates`, `npm run ops:check`, lint, typecheck, build, and `git diff
--check` passed. Docker Compose 5.5.1 rendered one read-only token mount in
each intended service without interpolation. The operations audit found zero
critical advisories (16 moderate/high remain under the existing gate). The
checked-in launch-readiness example still failed closed with 11 blocked
categories and 70 blockers. The sandboxed Next build could not parse
TypeScript `--showConfig`, and sandboxed npm audit could not reach the registry;
both gates passed on rerun with the approved execution mode. `promtool` was not
installed; Docker daemon access was denied, so pinned-image UID and live Garage
authorization/Prometheus scrape behavior remain unverified.

## Prompt 223 — worker process environment narrowing

The worker process environment is now fully decoupled from web session, CSRF,
and browser-origin secrets. `validateEnv` requires only `DATABASE_URL` for the
worker, defaulting `sessionSecret`, `clientOrigin`, and `csrfSecret` to empty
strings when absent. Production `SESSION_SECRET` placeholder and length guards
apply only to the API, allowing the worker to boot without session secrets.
`infra/compose/docker-compose.production.example.yml` removes `CLIENT_ORIGIN`
and `SESSION_SECRET` from the `worker` service environment map.

The parsed `check-application-environment` validator and its specs classify
both `CLIENT_ORIGIN` and `SESSION_SECRET` as API-only, rejecting them if
injected into the worker service. Operators deploying this version can safely
remove `CLIENT_ORIGIN` and `SESSION_SECRET` from their production worker
definitions. Live container inventories and operator secret grants remain
unverified.

Verification on 2026-09-28: focused config/env validation unit tests passed
57/57; template preflight tests passed 56/56; `npm run ops:templates`,
`sh scripts/ops/scan-secrets.sh`, `npm run ops:check`, `npm run lint`,
`npm run typecheck`, `npm run build`, and `git diff --check` passed.
The checked-in launch readiness example remains unresolved and fails closed.

## Prompt 224 — scope production Garage environment and eliminate residual env_file

The production Garage service definition in
`infra/compose/docker-compose.production.example.yml` no longer declares
`env_file: - ../env/garage.production.env.example`. Garage explicitly specifies
its three required runtime variables (`GARAGE_RPC_SECRET`, `GARAGE_ADMIN_TOKEN`,
and `GARAGE_METRICS_TOKEN_FILE`) via required Compose interpolation in its
`environment:` map. Removing the redundant `env_file` eliminates unnecessary
file injection and ensures that no unresolved sentinel placeholders
(`__REQUIRED_SECRET_*__`) enter the container environment.

With this change, zero services across the entire production Compose manifest
declare `env_file`. Every container uses strictly explicit `environment:` maps
or command flags with required interpolation. The parsed template verifier in
`scripts/ops/check-garage-metrics.js` and `scripts/ops/check-production-templates.sh`
enforces that `garage` and all other services in production Compose must not
declare `env_file`.

Verification on 2026-09-28: focused template preflight tests passed 57/57;
`npm run ops:templates`, `npm run ops:check`, `npm run lint`, `npm run typecheck`,
`npm run build`, and `git diff --check` passed. The checked-in launch readiness
example remains unresolved and fails closed.


## Prompt 232 — DoS evidence boundary hardening (2026-09-29)

The DoS runner now validates CLI/environment origins before side effects and
normalizes them to `URL.origin`. Help is side-effect-free; `--dry-run` performs
zero curl calls, including health probes. Its five layers are repository pattern
assertions, not observations of live Caddy, GraphQL, upload scanning, or timing.
Static failures block traffic. Non-dry execution requires separate operator
authorization and never falls back to simulated success when a target is down.

The live path uses a private temporary cookie jar, bounded Acres `/health`
probes, and `GET /api/v1/auth/csrf` before the synthetic invalid login burst.
The returned token and paired cookie are required; only validated
`401 INVALID_CREDENTIALS` and `429 RATE_LIMITED` error envelopes count. It rejects
contradictory envelopes, redirects, unexpected statuses, and transport failures
immediately. At most 15 sequential login requests are attempted. At least one
validated throttle and a successful final liveness probe are required. No
registration or real account/session is used. Curl ignores ambient `.curlrc`,
keeps TLS verification enabled, and uses a 2-second connect timeout, 5-second
total timeout, and 64 KiB response ceiling. These bounds are operational choices,
not production measurements. Tokens, cookies, and raw bodies stay in private
files and are removed on exit or catchable interruption.

Reports preserve the six layer names and use `drill_type: "dos_resilience_drill"`.
Offline reports have `mode: "simulated"`, null target, a skipped burst with null
verdict, zero counters, and false probe flags. Live reports bind
`apiTargetId` to SHA-256 of the normalized origin (no trailing slash) and record
attempted/throttled/auth-rejected/unexpected/transport counts plus pre-health,
CSRF, and post-health booleans. Failed live runs cannot report a passing burst.
Evidence publication serializes JSON to an owned temporary file in the destination
directory and renames it atomically; UUID default names retain the discoverable
`dos-resilience-evidence-` prefix. Existing destination receipts are invalidated
before work so an interruption cannot reuse stale success.

The capacity-alerting consumer allocates a unique owned child directory, reads
at most 64 KiB of regular JSON, and validates report type, empty failures, all
five static layer verdicts, duration, exact UTC timestamp within the invocation,
mode/target, and the complete burst contract. A nonzero child exit remains
failure even beside success JSON. Invalid child content is not copied into the
aggregate. Missing, stale, oversized, contradictory, and mismatched receipts
set `summary.dosResilience: "failed"` and fail the parent. The existing aggregate
API target hash still uses normalized URL `href` (with trailing slash) for
compatibility with the launch orchestrator; the child origin hash is distinct.
Database telemetry, capacity, and alert acceptance gates are unchanged.

Verification output: `ops:dos-test` reported `tests 39`, `pass 39`, `fail 0`;
`ops:capacity-alerting-test` reported `tests 16`, `pass 16`, `fail 0`. The isolated
fixtures never delegate to real curl; they cover success and failure responses,
CSRF propagation, privacy, cleanup, stale receipts, and concurrent ownership.
Both scripts are included in `ops:check` and required by the production template
check. Bash syntax and `git diff --check` exited 0. Prettier reported
`All matched files use Prettier code style!` for the new process specs. Lint and
typecheck exited 0 across all workspaces. The production build exited 0 and
reported `Generated Prisma Client (7.9.1)` followed by a successful Nest build.
The sandbox initially blocked Node subprocesses with `spawnSync node EPERM`
(and empty output); local-process permission allowed the build and offline
regressions to run correctly. Independent review found no code blockers and the
planned documentation corrections were applied.

The first sandbox aggregate attempt stopped with
`getaddrinfo EAI_AGAIN registry.npmjs.org`. Automatic approval review initially
rejected registry egress. The user then explicitly authorized dependency metadata
to be sent to npm. The authorized audit reported `Production dependency security
audit passed (0 critical vulnerabilities)` and `20 vulnerabilities (12 moderate,
8 high)`; no dependency changes were made in this prompt. The authorized
`ops:launch-drill-test` reported `tests 13`, `pass 13`, `fail 0`. The final
authorized `npm run ops:check` exited 0, including both new suites and the
13/13 launch suite. `ops:templates` printed `ops template check passed`;
capacity and alert suites passed. The audit gate accepts zero critical findings,
not zero findings at every severity.
The example readiness check still reported `Approved Categories: 0`,
`Unresolved / Blocked: 11`, `Total Blockers Detected: 70`, and `FAIL-CLOSED`.
No live drill, production acceptance, or launch approval occurred.

Safe inspection from the repository root:

```bash
npm run ops:dos-test
npm run ops:capacity-alerting-test
bash scripts/ops/run-dos-resilience-drill.sh --dry-run --evidence-file /tmp/acres-dos-offline.json
```


## Prompt 233 — invocation-owned launch evidence (2026-09-29)

The public Bash runner retains its seven ordered stages, flags, and mode/target
forwarding. It rejects missing, empty, single/double-dash values, controls, and
live/dry conflicts before child execution. Invalid target errors do not echo
arguments. Help creates no artifacts. No child runner was redesigned, and no
live unified drill or production acceptance occurred in this implementation.

Each run uses exclusive `mktemp -d` allocation under the evidence parent:
`launch-drill-run-<unique-id>/<stage-id>/`. New directories are 0700 and files
0600 through umask 077; existing parent permissions are preserved. Symlink or
non-directory ancestors are rejected. Stage functions pass each exact receipt
through the child's verified `--output` or `--evidence-file`; no `ls`/`comm`,
substring selection, timestamp sweep, or shared-directory cleanup remains.
Intermediate files stay private and are not selected. Stage logs remain named
`launch-drill-stage-<stage-id>.log` inside their unique stage directories.
Artifacts include absolute log/registered receipt paths even when a required
receipt is unavailable, so failure diagnosis retains the expected location.

`scripts/ops/assemble-launch-dossier.js` owns all receipt interpretation and
publication. Reads require a regular file in its exact stage directory and
reject symlinks, FIFOs, escaping paths, malformed JSON, growth/replacement, and
oversize evidence. The byte loop itself is bounded, with descriptor and named
file checks before/after reading. Limits are 16 MiB for CycloneDX SBOMs, 64 KiB
for capacity aggregates, and 1 MiB for other reports. These are engineering
choices, not production measurements. A local serialized SBOM measured 707481
bytes for 708 components; existing capacity aggregates measured at most 16719
bytes, volume 3117, SAST 10983, and container security 3964. These examples fit
the ceilings; larger reconciliation reports fail closed and require an explicit
future bound decision rather than silent relaxation.

Receipt time must fall within the parent start/end interval. Producer ISO UTC
with/without milliseconds and basic UTC forms are canonicalized and round-trip
checked for real calendar dates. Only second-precision producers get 999 ms
of truncation allowance at the beginning. Defined discriminators are required.
Child nonzero exit, missing/invalid mandatory receipt, failed/contradictory
verdict, or breached baseline fails its stage. License compliance is mandatory
for the SBOM child. Counts and stage summaries are computed after validation.
Raw invalid fields are excluded, and valid database summaries select only
validated fields. A dossier cannot report passed overall beside a required
baseline breach or compliance failure.

The existing seven rotation steps, recovery parity/RTO, config/target binding,
Caddy route/HSTS production-candidate rule, and database telemetry thresholds
remain. Stage 6 also validates nested named alert rules/simulations, re-evaluates
HTTP capacity distributions and target limits through the producer's exported
`evaluateSloCompliance`, and validates nested DoS evidence through
`validDosEvidence`. Live HTTP benchmarks omit DB latency distributions; the
separately bound live telemetry supplies the database gate. Synthetic capacity
requires its DB distributions. Aggregate API hashes still use URL `href`,
whereas DoS child hashes use URL `origin`. Secret rotation always stays dry-run
and reconciliation stays read-only.

Every selected dossier destination has an exclusively created `.lock` containing
its invocation token. A second writer fails before child execution and cannot
remove the active owner's lock. Regular existing output is invalidated only
after destination validation and exclusive ownership, before children start.
An exclusively owned 0600 temporary file in the final directory is allocated
before work; complete JSON is written there and renamed atomically. Normal
stage failures publish complete failed dossiers. Serialization/write/rename
failure exits nonzero with a generic error. Catchable interruption terminates
only the invocation's stage process group, bounds termination cleanup, and
removes only its temporary publication file/lock. Run directories and logs are
retained. No stale previous success or partially written public dossier remains.
Default dossiers add the unique run suffix; `--output` remains exact and works
with arbitrary extensions. `--json` prints the published JSON, and success text
explicitly separates drill completion from operator production sign-off.

Evidence directories must be controlled by the operator. Private ownership and
fresh timestamps are attribution checks, not cryptographic provenance or proof
of production scope; another process with the same OS identity can tamper with
files. Uncatchable SIGKILL/host loss can leave a lock/temp; the runner never
steals it. Confirm the owning process has stopped before operator cleanup.
Retain every run tree referenced by active evidence; dispose only an explicitly
selected inactive tree and its dossier after retention/review requirements are
met. Never sweep the shared evidence parent by name, age, or directory difference.

**Resolved by prompt 234 (2026-09-30):** This implementation originally left
Category 5's producer/consumer shape mismatch open. The readiness consumer now
validates actual producer measurements, named alerts, bound live telemetry and
the complete DoS receipt. See the prompt-234 record below for the contract and
approved API origin-hash correction. No seven-stage rehearsal alone approves
production.

Verification output:

- `npm run ops:launch-drill-test`: `tests 57`, `pass 57`, `fail 0`.
  The follow-up live-shape/custom-output suite: `tests 3`, `pass 3`, `fail 0`.
  Fixtures scrub service credentials and never delegate to real probes,
  databases, storage, Docker, scanners, or npm. They clean only their own
  disposable root. Concurrency proves disjoint registered paths/default
  outputs and preservation of unrelated files; exclusive-output interruption
  proves removal of old success, owned lock, and temporary publication file.
- Existing suites reported `fail 0`: DoS 39/39, capacity-alerting 16/16,
  restore 28/28, deployment 12/12, rotation 7/7, readiness 103/103,
  readiness-schema 8/8, reconciliation 10/10, Caddy 18/18, volume 17/17,
  SBOM 8/8, SAST 14/14, container 22/22, capacity 15/15, alerts 23/23.
- Templates printed `ops template check passed`. SBOM printed
  `License Compliance: PASSED (100% compliant with approved permissive licenses)`;
  SAST printed `SAST Gate: PASSED (Zero unreviewed blockers and zero expired suppressions)`;
  container checks printed `Container Security Gate: PASSED (All Dockerfiles and Compose templates verified)`.
- Prettier printed `All matched files use Prettier code style!` for all three
  new/changed JavaScript files. Bash syntax and `git diff --check` exited 0.
  Root lint, typecheck, and production build exited 0; build reported
  `Generated Prisma Client (7.9.1)` and completed Next/Nest builds.
- The checked-in readiness example exited 1 and reported
  `Approved Categories: 0`, `Unresolved / Blocked: 11`,
  `Total Blockers Detected: 70`, and `FAIL-CLOSED`.
- `npm run ops:check` passed its local pre-audit gates but stopped with
  `getaddrinfo EAI_AGAIN registry.npmjs.org`. Automatic approval review rejected
  the unsandboxed retry because npm audit sends potentially private dependency
  metadata to the public registry without explicit user payload/destination
  authorization. No alternate audit route or bypass was attempted. All
  remaining local gate commands were initially run separately and passed.
  The user then explicitly authorized the disclosed npm metadata/destination
  retry with “Try again”. The authorized `npm run ops:check` completed with
  exit code 0, including `tests 57`, `pass 57`, `fail 0` in the launch suite.
  npm reported `20 vulnerabilities (11 moderate, 9 high)` and
  `Production dependency security audit passed (0 critical vulnerabilities)`.
  The gate accepts zero critical findings, not zero findings at every severity.
  No dependency changes, live unified drill, or production approval occurred.
  Sandbox process tests initially reported `spawnSync bash EPERM`; approved
  local-process permission enabled the hermetic checks.

Independent read-only review found two issues: Stage 6 nested contradictions
were not yet checked, and `require()` misread custom non-JSON output extensions.
Both claims were verified, fixed, and regression-tested. Follow-up review
reported no remaining findings and cleared documentation/commit. Rollback is
reverting this implementation commit; retained child paths must stay available
while referenced by active evidence.

Safe inspection from the repository root:

```bash
npm run ops:launch-drill-test
node --test scripts/ops/assemble-launch-dossier.spec.js
```

These tests are hermetic. The real `ops:launch-drill` command is not network-free
and is not an inspection shortcut.

## Prompt 234 — producer-aligned capacity readiness (2026-09-30)

Category 5 now consumes the actual alert and capacity contracts rather than
requiring nonexistent `alerts.ruleCount`, `alerts.rules`, `capacity.status` or
`capacity.sloTargets`. Each required alert has one valid evaluation with empty
errors and one passing breach/clear simulation; `High429Rate` must ignore other
4xx responses. All checks pass, `requiredRulesCount` is eleven, and a safe
integer `totalRulesCount` covers the required set. The producer evaluates only
the required set; extra YAML rules may increase its total count.

The consumer requires success, empty failures, four passing summary flags,
a real nonfuture UTC start timestamp, and safe nonnegative integer duration.
Nested capacity/DoS dates fit that run; the second-precision parent timestamp
allows 999 ms at the end. Telemetry retains its existing 60-second scrape
tolerance. Evidence is retained for later review, so there is no new review-time
TTL or filesystem ownership test in the readiness consumer.

Request totals, three-decimal derived availability, positive throughput, all
latency statistics and percentile order are validated before SLO evaluation.
All eight individual compliance flags plus `overallPassed` must match passing
recomputed measurements, with empty violations. Child targets meet baseline
policy and measurements must also satisfy the approved section's stricter
policy. Synthetic reports require complete DB distributions; live HTTP reports
may omit them because the bound live telemetry supplies database acceptance.
Included DB distributions must be complete and passing. The telemetry checker
validates exporter/server health, pool consistency, nonnegative monotonic
latencies, zero waiting requests and lock waits. Its acquisition/query p95
values meet both child and approved-section ceilings.

`validateCapacityAlertingReport(report, now)` remains a structural rehearsal
helper. The readiness call supplies `{ section, requireLive: true }`: only
aggregate/child live mode, SHA-256 benchmark identities matching capacity and
telemetry, and a complete bound live DoS receipt can support Category 5.
Synthetic rehearsal uses explicit synthetic mode/source, null target hashes
and the producer marker, with simulated zero-counter DoS evidence. Its numeric
baseline is checked through a local metadata copy; no report is altered and
this path cannot approve production. Default/missing modes fail. Every child,
including wildcard matches, must pass; dossiers cannot replace the child.
All Category 5 evidence-file diagnostics use a fixed reason, including malformed
JSON and failed non-child dossiers, so private child text is not echoed.

Execution review disproved the prompt's original API hash assumption: URL
`href` includes a root trailing slash while `origin` does not. The user approved
the narrow producer correction. The capacity parent and its capacity-specific
dossier comparison now use the DoS child's `origin` hash; benchmark and other
dossier/deployment identity contracts retain their existing `href` hashes.
Parent and dossier regressions prove normalized API acceptance and reject the
old trailing-slash identity. This is a compatibility change: regenerate old
live aggregates and their dossiers, and regenerate success-only/fictional
reports lacking required measurements. Retained operator evidence is preserved;
no migration, live benchmark, traffic burst, alert delivery or deployment ran.

Verification output:

- Readiness: `tests 161`, `pass 161`, `fail 0`; actual isolated parent output
  validates as rehearsal and blocks production, while stubbed live-shaped
  actual parent output clears the fixture's Category 5 gate. Test environments
  omit inherited service credentials; only owned temporary roots are removed.
- Readiness schema 8/8, capacity 15/15, alerts 23/23, DoS 39/39, capacity-parent
  16/16, launch-drill 57/57, all `fail 0`. After the dependent dossier alignment,
  launch-drill again reported 57/57; the additional legacy-hash live regression
  reported `tests 1`, `pass 1`, `fail 0`.
- `ops:templates`: `ops template check passed`. Root lint, typecheck and build
  exited 0; build printed `Generated Prisma Client (7.9.1)` and completed the
  Next and Nest production builds. Initial sandbox build failed with
  `Could not parse output from TypeScript's --showConfig`; local-process
  permission enabled the successful retry.
- Changed JS regions and the parent/dossier specs passed Prettier checks:
  `All matched files use Prettier code style!`. Existing formatting elsewhere
  was preserved. Bash syntax and `git diff --check` exited 0.
- `ops:check` initially stopped at npm audit with
  `getaddrinfo EAI_AGAIN registry.npmjs.org`. Automatic approval review rejected
  an unsandboxed attempt because dependency metadata transfer lacked accepted
  payload/destination authorization. The user explicitly authorized the disclosed
  retry. The retry and the full follow-up gate exited 0, reporting
  `21 vulnerabilities (10 moderate, 11 high)` and
  `Production dependency security audit passed (0 critical vulnerabilities)`.
  Dependencies were not changed. The later capacity-only dossier correction
  was verified by the related launch tests rather than another registry audit.
- The unchanged readiness example exited 1: `Approved Categories: 0`,
  `Unresolved / Blocked: 11`, `Total Blockers Detected: 70`, `FAIL-CLOSED`.

Independent review found the API hash mismatch and the noncandidate diagnostic
leak. The approved hash correction then required alignment of the existing
capacity-specific dossier consumer. Verified fixes and follow-up review cleared
all findings. Rollback is reverting this commit; there is no product data or
persistent infrastructure change.

Hash/date consistency is not cryptographic provenance or proof of production
scope. Static alert simulation does not prove live Prometheus firing, receiver
routing or human receipt. Target/monitoring inspection, delivery evidence,
operator policy, all eleven decisions and prompt 201 remain separate launch gates.

Safe inspection from the repository root:

```bash
npm run ops:readiness-test
npm run ops:capacity-alerting-test
```

## Prompt 235 — rotation rehearsal and live approval evidence (2026-09-30)

`run-secret-rotation-drill.sh` always emits `execution_mode: "simulation"`,
including algorithm failure receipts. `dry_run` remains boolean invocation
metadata; reachability never changes the evidence kind. Help and summaries
identify rehearsal. Local HMAC/SigV4 examples and mock PostgreSQL/Valkey/session
state machines remain unchanged. The seven-class list is intended coverage,
not actual SMTP/Grafana credential verification. The session example models
HMAC rollover, not opaque Acres session signing or live application behavior.

`validateSecretRotationReport(report, now, { requireLive: true })` selects live
approval evidence; the two-argument helper validates structural rehearsal.
Both reject invalid evaluation clocks, malformed/future timestamps, missing or
unknown modes, wrong drill types, nonboolean `dry_run`, duplicate/extra/missing
classes, incorrect step status/shape, errors and failed redaction assertions.
A simulation can structurally pass with either boolean invocation flag but
never satisfy live approval. A live label always requires its full contract,
even when the helper is called without `requireLive`.

The new operator-supplied live receipt requires `execution_mode: "live"`,
`dry_run: false`, `environment: "production"`, `environment_reference`,
`authorization_reference`, and `operator_reference`. `class_verification` must
have exactly the seven existing secret-class keys, each with canonical
`status: "passed"`, `rotation_verified: true`, `stale_credential_rejected: true`,
`fresh_credential_accepted: true` and `evidence_reference`. Each of the seven
existing steps also requires `evidence_reference`. References must be opaque,
trimmed nonempty strings without control characters. Existing placeholder,
literal-secret and development-password rejection applies to the whole live
receipt. The complete class and step names are listed in Category 3 of
`docs/launch-checklist.md`.

Approved Category 3 requires every referenced child to pass structural checks
and at least one complete live receipt. A valid simulation may accompany live
evidence; failed simulations or live children block even beside a valid receipt
or in wildcard matches. Custom filenames qualify by content; prose and dossiers
cannot replace a live child. All Category 3 evidence-file failures emit a fixed
reason, including missing files, parse errors, failed dossiers and exceptions
while formatting malformed nested diagnostics. Other category diagnostics,
injection/masking/cadence/runbook gates and the parent readiness schema remain
unchanged. The dossier's Stage 5 baseline still summarizes rehearsal only.

Compatibility: regenerate legacy unclassified simulation receipts or provide
separately inspected live evidence; never relabel retained private files.
No live receipt generator, provider operation, credential rotation, deployment
or launch approval was added or executed. References are not dereferenced here.
Mode labels and source assertions do not authenticate a production target,
prove zero downtime or replace independent operator inspection of application
behavior, credential retirement, compromise response and recovery policy.
Prompt 201, Category 3 and Phase 12 sign-off remain open. Rollback is reverting
this implementation commit; there are no persistence or product-data changes.

Verification and review:

- `npm run ops:rotation-test`: `ℹ tests 10`, `ℹ pass 10`, `ℹ fail 0`.
  Real runner output with both CLI flags and injected algorithm failure remained
  simulation; inherited credentials and all reachability commands were removed.
- `npm run ops:readiness-test`: `ℹ tests 410`, `ℹ pass 410`, `ℹ fail 0`.
  Includes helper and full approval rejection cases, mixed simulation/live
  evidence, wildcards, private canaries and malformed nested dossier diagnostics.
- `npm run ops:readiness-schema-test`: `ℹ pass 8`, `ℹ fail 0`;
  `npm run ops:launch-drill-test`: `ℹ pass 57`, `ℹ fail 0`.
  Stage 5 simulation still produces a verified rehearsal baseline.
- `npm run ops:templates`: `ops template check passed`. The local operational
  suites and scanners following the audit in `ops:check` also exited 0 when
  invoked separately (reconciliation, restore, Caddy, deployment, volume,
  rotation, SBOM, SAST, container, capacity, alerts, DoS and capacity parent).
  This is not a successful full `ops:check` result.
- Root `npm run lint` and `npm run typecheck` exited 0 across the three
  workspaces. `npm run build` exited 0 on the unsandboxed retry, including
  `✓ Compiled successfully` and `✓ Generating static pages using 7 workers (22/22)`.
  The initial sandboxed build failed with
  `Could not parse output from TypeScript's --showConfig`; initial sandboxed
  subprocess test invocations also failed before the successful local retries.
- Changed JS and Markdown regions were formatted and checked locally with
  Prettier, preserving existing formatting elsewhere. Bash/JS syntax checks
  and `git diff --check` exited 0.
- The unchanged readiness example exited 1 as intended:
  `Approved Categories: 0`, `Unresolved / Blocked: 11`,
  `Total Blockers Detected: 70`, `FAIL-CLOSED`.
- `npm run ops:check` stopped at the external dependency audit:
  `getaddrinfo EAI_AGAIN registry.npmjs.org`. Automatic approval review rejected
  the unsandboxed retry because sending production dependency names and
  versions to npm's advisory endpoint lacked explicit authorization for that
  payload and destination. Authorization was requested; no workaround or
  indirect audit request was executed. The external audit and full gate remain
  unverified pending that authorization.
- Independent review found that generic diagnostic interpolation could throw
  before message suppression on malformed nested JSON. A narrow Category 3
  exception boundary and regressions fixed the verified issue. Follow-up review
  cleared all Critical/Important findings; its minor coercion-fixture comment
  was also addressed with a recognized child type.

Safe inspection from the repository root:

```bash
npm run ops:rotation-test
npm run ops:readiness-test
```
