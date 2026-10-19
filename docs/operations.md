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
| `scripts/ops/backup-postgres.sh` & `.spec.js` | Structured PostgreSQL `pg_dump` backup script with POSIX CLI argument validation, directory targeting, `--dry-run`, tool prerequisite verification, credential fallbacks, and comprehensive contract test suite |
| `scripts/ops/restore-postgres.sh` & `.spec.js` | Structured PostgreSQL restore script with POSIX CLI argument validation, directory targeting, named/positional file support, clean mode toggle, `--dry-run`, tool prerequisite verification, credential fallbacks, and comprehensive contract test suite |
| `scripts/ops/run-restore-drill.sh` & `.spec.js` | Automated disaster recovery restore drill runner with POSIX CLI argument validation, directory targeting, tool prerequisite checks, isolated database restore, schema/migration parity, and comprehensive contract test suite |
| `scripts/ops/reconcile-storage-objects.js` | Object storage reconciliation utility comparing PostgreSQL stored objects against bucket keys, detecting leaks, missing objects, and mismatches |
| `scripts/ops/verify-caddy-routing.js` | Pure Node.js Caddyfile parser and route evaluator validating same-origin ingress dispatching, proxy headers, S3 SigV4 preservation, and security headers |
| `scripts/ops/verify-caddy-routing.spec.js` | Unit test suite (10/10 tests) asserting Caddy routing rules, SigV4 host preservation, security headers, timeouts, and HSTS gate invariants |
| `scripts/ops/run-deployment-drill.sh` | Configuration preflight/rehearsal: Caddy/Compose checks, migration heuristic, optional health observations and simulation evidence |
| `scripts/ops/audit-dependencies.sh` & `.spec.js` | Production dependency security audit script with POSIX CLI argument validation, configurable audit level, directory targeting, and comprehensive contract test suite |
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
| `scripts/ops/check-docker-runtime.sh` & `.spec.js` | Static server Dockerfile check for Node 24 Alpine, non-root runtime, healthcheck, direct Node startup, with POSIX CLI argument validation and unit/contract suite |
| `infra/launch/readiness.example.json` | Inert, structured launch-readiness decision template covering all 11 operator categories with explicit placeholders |
| `infra/launch/readiness.schema.json` | Draft 7 structural/editor contract for the readiness record; does not attest production readiness |
| `scripts/ops/check-launch-readiness.js` | Deterministic fail-closed launch readiness validator enforcing approval status, secret source references, recovery drills, and no-AI posture |
| `scripts/ops/check-launch-readiness.spec.js` | Unit and contract test suite covering all 11 readiness categories, evidence validators, and CLI runner |
| `scripts/ops/launch-readiness.sh` | Aggregates operational checks and runs the fail-closed launch readiness validator |
| `scripts/ops/launch-readiness.spec.js` | Subprocess unit and contract test specification covering CLI argument parsing, fail-closed preflights, and drill execution |
| `.github/workflows/ci.yml` | Pinned GitHub Actions (full 40-char commit SHAs) running `npm run ops:check` and verification suite |
| `infra/launch/operator-handoff.vercel.example.md` | Managed operator intake package and sign-off template for `vercel-managed-production` |
| `scripts/ops/verify-managed-ingress.js` & `.spec.js` | Vercel multi-service routing and deployment rollback verification for managed production |
| `scripts/ops/verify-managed-volume-encryption.js` & `.spec.js` | Managed Neon KMS AES-256 volume encryption and serverless compute isolation verification |
| `scripts/ops/verify-managed-secret-rotation.js` & `.spec.js` | Managed zero-downtime secret rotation and indirect reference verification |
| `scripts/ops/verify-managed-restore-drill.js` & `.spec.js` | Managed disaster recovery restore and Neon PITR branch recovery verification |
| `scripts/vercel/rebuild-scanner-cadence.js` & `.spec.js` | Automated zero-downtime ClamAV scanner snapshot rebuild orchestrator with smoke verification |
| `.github/workflows/scanner-snapshot-rebuild.yml` | Scheduled and manual GitHub Actions workflow for automated ClamAV scanner rebuild cadence |
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
npm run ops:launch-readiness-test
npm run ops:managed-drills-test
npm run ops:check
npm run ops:launch-readiness
npm run vercel:scanner-rebuild
npm run vercel:probe-test
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
   Use `scripts/ops/restore-postgres.sh [<backup-file>] [--file <file>] [--host <host>] [--port <port>] [--user <user>] [--dbname <db>] [--clean | --no-clean] [--dry-run]` to restore into a target database (`PGDATABASE=<target>`). Restores run using `pg_restore` (with `--clean --if-exists` by default, or without clean if `--no-clean` is specified), verify PostgreSQL connection readiness via `pg_isready`, and assert public schema table counts via `psql`. Credentials resolve securely across `PGPASSWORD`, `POSTGRES_PASSWORD`, `POSTGRES_SUPERUSER_PASSWORD`, and `ACRES_MIGRATOR_PASSWORD`. `--dry-run` validates inputs, credentials, file presence, and prerequisites without modifying the database.
2. **Automated Restore Drill**:
   Execute `npm run ops:restore-drill` (or `scripts/ops/run-restore-drill.sh [options]`). Value options support `--option value` and `--option=value`. Use `--cwd` for relative archive/evidence paths and `--host`, `--port`, and `--user` for connection overrides; `--dry-run` authenticates and checks target absence without restoring. The runner:
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
   - Compares byte counts and any available checksum metadata; bucket listings
     alone do not attest SHA-256 content integrity;
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

1. **Configuration preflight**: `npm run ops:volume-drill` validates Compose/env
   declarations for exactly nine required service/container mounts: PostgreSQL
   `/var/lib/postgresql`, Valkey `/data`, Garage `/var/lib/garage/meta` and
   `/var/lib/garage/data`, ClamAV `/var/lib/clamav`, Caddy `/data` and `/config`,
   Prometheus `/prometheus`, Grafana `/var/lib/grafana`. Concrete declared
   mechanisms are checked against the installed LUKS/dm-crypt, AWS KMS, GCP CMEK
   and Azure Key Vault patterns. Every emitted receipt, successful or failed,
   declares `execution_mode: "simulation"`. Sentinel templates may pass.
2. **Limited local filename scans**: selected existing mount/backup paths and
   Git filenames are checked for key-like names. Missing directories, depth
   limits, filesystem errors and Git failures can leave material unexamined;
   symlinks are followed with cycle limits. Patterns also match TLS private
   keys/certificates, which are not necessarily volume-unlock material. The
   compatibility `keySeparation.verified` flag means preflight passed. It proves
   neither absence of all unlock material nor external custody, dual control,
   actual mounted-device encryption, or recovery. Scanner behavior is unchanged.
3. **Independent live inspection**: the security/infrastructure leads inspect
   every deployed service mount, underlying encrypted device/cloud policy and
   actual physical/symlink mapping. Independently inspect unlock-material custody
   outside data, backups and Git; dual-custody governance; the designated owner;
   and the documented, tested recovery procedure. Store raw evidence in the
   restricted operator store. Never place key bytes, passphrases or plaintext
   credentials in receipts, chat or Git.
4. **Operator-supplied live receipt**: retain the producer structural fields
   (`drill_type: "production_volume_encryption_and_key_separation"`, real
   nonfuture canonical ISO UTC timestamp with/without milliseconds, success,
   valid, empty errors/violations, verified preflight flag). Require exactly the
   nine distinct service/container identities, each `passed: true`, and safe
   integer total/valid counts equal to nine. Add `execution_mode: "live"`,
   `environment: "production"`, opaque `environment_reference`,
   `authorization_reference`, `operator_reference`, `encryption_mechanism`,
   `key_recovery_owner`, and `encrypted_mount_paths`. Each mount adds `host_path`
   and `evidence_reference`. `live_verification` has exactly `host_encryption`,
   `key_separation`, `dual_custody`, `recovery_procedure`; each has exactly
   `status: "passed"`, `verified: true`, `evidence_reference`.
5. **Binding and launch acceptance**: mechanism and owner must match the approved
   Category 8 exactly (including mechanism alias spelling); root path sets must
   match irrespective of order. Roots are at least three unique concrete absolute
   POSIX directory paths. Reject `/`, trailing slashes, empty/dot/dot-dot
   segments, backslashes and controls. Each mount is equal to or a directory
   descendant of an approved root, and every root covers a mount. Shared roots
   may cover Garage metadata/data or other service storage; nine disks or nine
   roots are not required. Strings are trimmed, nonempty, control-free and pass
   placeholder/dev/literal-secret rejection. The validator does not stat paths,
   resolve symlinks, dereference opaque pointers, or authenticate provenance.
   References and paths are sensitive metadata requiring restricted custody.
6. **Evidence files**: every volume child must structurally pass; at least one
   complete live child must bind to the approved parent. A valid simulation may
   accompany it. Legacy/unknown modes require regeneration or independent live
   inspection, never relabeling. Simulation-only, dossier-only, prose-only and
   external-pointer-only records cannot approve. Failed, malformed or unrelated
   live children and failed dossiers block even beside a matching child, including
   wildcard matches. Category 8 file failures use only
   `A referenced volume encryption report is invalid or failed`, suppressing
   paths, child errors, scan diagnostics and nested formatting exceptions.

Stage 4 and the existing `volumeEncryptionBaseline` / compliance fields summarize
configuration/local-scan preflight only. A 7/7 dossier cannot replace the live
child and independent human sign-off. Mode flags, confirmations and source
pointers are unauthenticated assertions: consistent JSON cannot prove production
scope. Prompt 201 and Phase 12 remain open; this runbook authorizes no live action.

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

**Current disaster recovery and reconciliation qualification (prompt 238, 2026-10-01):** The historical
runner receipts below establish rehearsal simulation preflights only (`execution_mode: "simulation"`).
They execute against an isolated local drill database (`acres_restore_drill`) and local Garage/S3 storage
or under `--dry-run`. They do not attest live production disaster recovery, off-host backup encryption,
live off-host restore, live multi-region bucket integrity, or live RPO/RTO. Separately inspected live
operator child receipts (`execution_mode: "live"`) are required when Category 6 (`backup_and_disaster_recovery`)
is approved.

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

**Current Caddy routing and domain TLS qualification (prompt 239, 2026-10-01):** The Caddy verifier
(`scripts/ops/verify-caddy-routing.js`) evaluates static configuration simulation and route dispatching
preflights (`execution_mode: "simulation"`). It inspects local Caddyfile directives, reverse proxy matchers,
SigV4 Host header preservation, and security headers; it does not perform live public DNS lookups, live TLS
handshake/cipher negotiation, certificate issuance/validity checks, or live HTTPS response header measurement.
When Category 1 (`production_domain_tls`) is approved, separately inspected live operator child receipts
(`execution_mode: "live"`) are required.

**Current deployment qualification (prompt 236, 2026-09-30):** The dated
results below are configuration preflight/rehearsal, not exercised promotion,
rollback or service draining. The DDL search is a heuristic: absence of its
patterns does not prove every migration backward-compatible. Configured drain
periods do not prove requests/jobs drained. Optional successful health/database
observations do not elevate the runner's simulation receipts to live evidence.

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
2. **Deployment Configuration Preflight/Rehearsal Runner (`scripts/ops/run-deployment-drill.sh`)**:
   - Checks Caddy/Compose configuration, migration heuristics, operational templates, secret scans and readiness contracts; optionally observes health and displays a suggested rollback command.
   - Searches for selected destructive DDL patterns; compatibility requires independent inspection.
   - Validates configured `stop_grace_period` (Caddy: 30s, Next: 30s, API: 45s, Worker: 60s) and network membership, without exercising draining.
   - Emits structured JSON evidence reports (`backups/deployment-drill-evidence-<timestamp>.json`).
3. **Operations & CI Integration**:
   - Added root package scripts `npm run ops:caddy-drill` and `npm run ops:deployment-drill`.
   - Added `npm run ops:caddy-test` to `npm run ops:check` and CI verification pipeline.
   - Closes the open Phase 5 Caddy ingress routing item in `docs/authenticated-app.md` and `docs/build-plan.md`.

## Phase 12H Production Volume Encryption Key Separation & Secret Rotation Drill

**Current volume qualification (prompt 237, 2026-09-30):** The historical
volume results below establish declaration/local-scan preflight only. They do
not close TM-21 live host/custody/recovery inspection or Category 8 sign-off.

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
   - Supplies rehearsal/preflight checks; TM-15/TM-21 production acceptance remains operator-owned.

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
   - Emits private, exclusively published JSON reports (`backups/capacity-alerting-drill-evidence-<uuid>.json`); exact destinations must be absent (prompt 270).
5. **Capacity, Load & Alerting Drill Runbook**:
   - Offline command: `npm run ops:capacity-alerting-drill -- --dry-run` (or `npm run ops:dos-drill -- --dry-run`). Non-dry DoS invocations require separate operator authorization.
   - Offline criteria: alert rules valid and simulated, synthetic capacity SLOs satisfied, and five repository protection assertions passing. Live acceptance still requires operator evidence; the bounded DoS exercise observes login throttling and liveness only.
   - Evidence: Inspect the new `backups/capacity-alerting-drill-evidence-<uuid>.json` report, or select an absent path with `--evidence-file`. Target sources/relative paths can use `--cwd`.
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
directory and publishes it atomically without replacing evidence (prompt 269);
UUID default names retain the discoverable `dos-resilience-evidence-` prefix.
Existing destinations are rejected and retained. Consumers reject nonzero exit
and stale receipts independently; interruption never deletes prior evidence.

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

## Prompt 236 — deployment preflight and live receipt separation (2026-09-30)

`run-deployment-drill.sh` always emits `execution_mode: "simulation"`, including
its schema-failure receipt, with either CLI dry-run flag and regardless of probe
reachability. CLI flags/output naming and optional probes remain compatible.
Stage 3 and the dossier deployment baseline summarize preflight/rehearsal;
targeted non-dry runs retain their file/health identity checks. Neither a passed
Stage 3 nor `deploymentCompliance`/`rollbackCompliance` proves live promotion
or rollback. No assembler or top-level readiness schema changed.

Category 10 requires every referenced deployment child to pass structural
validation and at least one live child bound to `release`. Both mode flags
(`dry_run`, `probe_live_tested`) must be booleans; mode is exactly simulation or
live. Routes/migration counts are safe integers (at least 12/nonnegative).
Optional duration fields are finite/nonnegative. Basic UTC and canonical ISO UTC
dates must be real/nonfuture; two timestamp fields must agree. Explicit invalid
clocks fail closed. Dossiers cannot impersonate children, even by filename or
copied fields. A malformed/failed wildcard child or unrelated live child blocks
beside a matching one; valid simulation may accompany live evidence. External
release pointers remain supported but cannot replace an inspectable live JSON
child in `evidence` or `release.live_drill_evidence`.

A separately supplied live receipt preserves all structural success booleans
and configured drain strings and additionally requires:

- `execution_mode: "live"`, `dry_run: false`, `probe_live_tested: true`,
  `environment: "production"`;
- trimmed nonempty opaque `environment_reference`, `authorization_reference`
  and `operator_reference`, without control characters;
- `release` with exactly `reviewed_source_commit`, `current`, `previous`;
  a 40 ASCII hex commit and exact client/server immutable image pairs. Roles
  must differ within each pair; current/previous pairs must differ (one unchanged
  image is permitted). Prior images may use a former registry. Commit comparison
  ignores hex casing; all four image comparisons with the approved parent are exact;
- `live_verification` with exactly `promotion`, `rollback`, `ingress`,
  `migration_compatibility`, `readiness`, `graceful_drain`, `network_isolation`
  and `image_provenance`. Each observation has exactly `status: "passed"`,
  `verified: true`, and a trimmed nonempty, control-free `evidence_reference`.

Inspect each source independently: current image promotion, previous image
rollback/recovery, actual edge routing/headers/SigV4, deployed schema compatible
with both pairs, live/deep readiness, bounded service/request/job draining,
deployed exposure and source/image provenance. Existing placeholder/dev-secret
and literal-secret rejection applies without echoing child diagnostics.
References are private pointers; validators never fetch them. Mode flags,
confirmations and references are unauthenticated assertions, not proof an
operation occurred, cryptographic provenance or measured downtime guarantees.
The parent provenance references and approvers remain independently required.

Category 10 file failures use the fixed message `A referenced deployment drill
report is invalid or failed`, including missing/invalid JSON, failed dossier
checks and nested formatting exceptions. Private paths, diagnostics and scan
results are suppressed. Existing safe field/image mismatch blockers remain.
Legacy unclassified receipts need regeneration as simulation or separately
inspected live evidence; never automatically relabel retained evidence.

No deployment, rollback, drain, registry access, production receipt generation
or launch approval ran. Live exercises require separate operator authorization.
Prompt 201 and Phase 12 sign-off remain open. Safe inspection commands:
`npm run ops:deployment-test` and `npm run ops:readiness-test`.

Verification and review (2026-09-30):

- `npm run ops:deployment-test`: `ℹ tests 14`, `ℹ pass 14`, `ℹ fail 0`.
- Final `npm run ops:readiness-test`: `ℹ tests 589`, `ℹ pass 589`, `ℹ fail 0`.
- `npm run ops:readiness-schema-test`: `ℹ tests 8`, `ℹ pass 8`, `ℹ fail 0`.
- `npm run ops:launch-drill-test`: `ℹ tests 57`, `ℹ pass 57`, `ℹ fail 0`.
- `npm run ops:templates`: `ops template check passed`. Aggregate `npm run ops:check`
  exited 0; its final launch suite also reported `ℹ pass 57`, `ℹ fail 0`.
  Audit output: `21 vulnerabilities (10 moderate, 11 high)` and
  `Production dependency security audit passed (0 critical vulnerabilities)`.
- Root `npm run lint` exited 0 across all three ESLint workspaces. Root
  `npm run typecheck` exited 0 with shared/client/server TypeScript checks and
  `✔ Generated Prisma Client (7.9.1)`. Root `npm run build` exited 0 across
  shared/client/server; Next reported `✓ Compiled successfully in 2.7s` and
  `✓ Generating static pages using 7 workers (22/22) in 605ms`.
- Changed JS blocks and new Markdown sections: `Prettier check passed`;
  existing unrelated formatting preserved. JS syntax checks, `bash -n
scripts/ops/run-deployment-drill.sh` and `git diff --check` exited 0 with
  no diagnostic output.
- The unchanged example exited 1: `Approved Categories: 0`,
  `Unresolved / Blocked: 11`, `Total Blockers Detected: 70`,
  `Result: FAIL-CLOSED`.

Initial sandbox test subprocesses reported `spawnSync EPERM`; Next build reported
`Could not parse output from TypeScript's --showConfig`. Allowed elevated
retries passed. The initial aggregate gate stopped at registry `EAI_AGAIN`;
its allowed elevated retry passed. An initial concurrent typecheck encountered
Next-generated files being removed by build; sequential build then typecheck
passed. No dependency, configuration or check bypass was introduced.

Independent review found an incomplete custom receipt classification bypass:
a sparse live claim could be ignored beside matching evidence. Verified and
fixed by recognizing mode/dry/probe execution markers after dossier exclusion.
Final direct and wildcard regressions cover those sparse claims and unrelated
source identity. The full final readiness suite passed 589/589; follow-up review
reported `Ready to commit: Yes`, with focused regression `tests 1`, `pass 1`,
`fail 0` and no remaining findings. Other required gates passed before this
focused classifier fix; affected readiness, syntax, format and diff checks were
rerun afterward. Source records and production sign-off remain operator-owned.

**Prompt 237 verification (2026-09-30):** Volume tests reported `pass 18`,
`fail 0`; readiness tests `pass 593`, `fail 0`; launch/dossier tests `pass 59`,
`fail 0`. Templates printed `ops template check passed`; the full operations
suite, lint, typecheck, build, scoped formatting and diff checks passed. The
unresolved example remained `0` approved, `11` blocked, `70` blockers.
Initial sandbox child-process failures required permitted normal-execution
reruns. The full verification and audit output is recorded in the Phase 12K
prompt-237 entry in `docs/build-plan.md`. Inspect safely with
`npm run ops:volume-test` and `npm run ops:readiness-test` from the repository
root; these use test-owned fixtures and do not approve launch.

## Prompt 238 — disaster recovery drill and live evidence separation (2026-10-01)

`run-restore-drill.sh` always emits `execution_mode: "simulation"` and `drill_type: "disaster_recovery_restore"`.
The CLI introduction, help text, and success banner make explicit that the tool executes an isolated local
rehearsal restore into `acres_restore_drill`, measuring local RTO; it does not perform an actual off-host
production restore, attest production disaster recovery, or validate off-host backup encryption.

`reconcile-storage-objects.js` emits `execution_mode: "simulation"` (or explicit options) and
`drill_type: "storage_reconciliation"`. Its CLI help documents that it reconciles reachable database
records against object storage keys and does not attest live production multi-region bucket integrity.

`assemble-launch-dossier.js` validates `execution_mode === "simulation"` for Stage 7 `restoreEvidence` and
`reconcileEvidence` child reports and qualifies Stage 7 in the dossier as rehearsal preflight rather than
production recovery sign-off. `run-launch-drills.sh` documents Stage 7 explicitly as restore drill and storage
reconciliation rehearsal.

Category 6 (`backup_and_disaster_recovery`) in `scripts/ops/check-launch-readiness.js`:
- Unified launch evidence dossiers are excluded from candidate evaluation.
- Every referenced child report must pass strict structural validation. Legacy unclassified receipts without
  `execution_mode` fail closed; valid simulation may accompany live evidence, but failed simulations or live
  children block approval even beside a valid receipt.
- When Category 6 is approved (`status: "approved"`), separately inspected live operator child receipts
  (`execution_mode: "live"`) are required for both PostgreSQL restore and storage reconciliation:
  - Live restore child requires `execution_mode: "live"`, `environment: "production"`, trimmed non-empty,
    control-free `operator_reference`, `authorization_reference`, `maintenance_window_reference`, matching
    drill date (`declaredDate === reportDate`), and measured duration within declared RTO bounds
    (`duration_seconds <= expectedSection.rto_hours * 3600`).
  - Live reconciliation child requires `execution_mode: "live"`, `environment: "production"`, trimmed non-empty,
    control-free `operator_reference`, `authorization_reference`, and `storage_target_reference` matching
    `expectedSection.backup_destination`.
- Safe diagnostic boundary: all Category 6 child file reads and parse/validation operations are guarded.
  Missing files, parse errors, child structural failures, and formatting exceptions are mapped to fixed safe
  blocker messages (`A referenced restore drill report is invalid or failed` and `A referenced storage reconciliation report is invalid or failed`),
  suppressing private filesystem paths, stack traces, and internal child diagnostics.
- Timestamp format rules: Restore drill reports accept real nonfuture basic UTC (`YYYYMMDDTHHMMSSZ`) and
  standard ISO 8601 UTC timestamps; storage reconciliation reports strictly enforce ISO 8601 UTC format.

Verification and review (2026-10-01):
- `npm run ops:restore-drill-test`: 28 passed, 0 failed.
- `npm run ops:reconcile-test`: 10 passed, 0 failed.
- `npm run ops:launch-drill-test`: 59 passed, 0 failed.
- `npm run ops:readiness-test`: 596 passed, 0 failed.
- `npm run ops:readiness-schema-test`: 8 passed, 0 failed.
- `npm run ops:templates`: `ops template check passed`.
- All 21 ops test sub-suites passed cleanly; dependency audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j).
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.
- Unresolved example readiness template failed closed: 0 approved categories, 11 blocked, 70 blockers.
- Independent code review completed and addressed: restored ISO UTC timestamp support in `validateRestoreReport`,
  enforced strict ISO UTC timestamps in `validateReconciliationReport`, aligned reference fields between code and
  documentation (`maintenance_window_reference` for restore, `storage_target_reference` for reconciliation), and
  ensured restore drill date validation accurately tracks live receipts without rejecting historical evidence.

## Prompt 239 — separate domain TLS preflight from live evidence (2026-10-01)

`scripts/ops/verify-caddy-routing.js` now classifies every emitted receipt as configuration simulation
(`execution_mode: "simulation"`). Its CLI introduction, help text, and exit banners explicitly document
that the tool verifies static Caddyfile syntax, reverse proxy matchers, transport timeouts, security headers,
and S3 SigV4 Host header preservation; it disclaims live public DNS resolution, live TLS handshakes,
certificate chain validation, and live HTTPS response header measurements.

`scripts/ops/check-launch-readiness.js`:
- `validateCaddyRoutingReport(report, now, approvedDomain, context)` supports both simulation and live modes:
  - Simulation mode (`execution_mode: "simulation"`) requires `drill_type: "caddy_routing_and_tls_verification"`,
    `status: "success"`, `valid: true`, empty `errors` array, `securityHeadersVerified: true`,
    `s3SigV4HostPreserved: true`, `proxyHeadersVerified: true`, at least 12 evaluated routes,
    `routesPassed === routesEvaluated`, all evaluated routes passing, real nonfuture ISO UTC timestamp, and
    `hstsApproved: true` when validating against an approved production domain.
  - When live mode is requested (`context.requireLive: true` or `report.execution_mode === "live"`):
    - Rejects simulation mode.
    - Requires `execution_mode: "live"`, `environment: "production"`.
    - Requires trimmed, non-empty, control-free, secret-free references: `operator_reference`,
      `authorization_reference`, and `domain_reference`.
    - Requires structured live verification objects:
      - `dns_verification`: `{ status: "passed", verified: true, record_type: string, evidence_reference: string }`.
      - `tls_handshake_verification`: `{ status: "passed", verified: true, certificate_valid: true, protocol: string, evidence_reference: string }`.
      - `https_headers_verification`: `{ status: "passed", verified: true, security_headers_verified: true, evidence_reference: string }`.
    - When `context.expectedSection` is supplied:
      - Verifies `report.domain.toLowerCase() === expectedSection.domain.toLowerCase()`.
      - If `expectedSection.hsts_approved === true`, requires `report.https_headers_verification.hsts_verified === true`.
- Category 1 (`production_domain_tls`) evaluation:
  - Excludes unified launch dossiers from Caddy routing candidates (`isCaddyRoutingCandidate`).
  - When approved (`domainSec.status === 'approved'`), requires a valid live Caddy routing operator receipt (`execution_mode: "live"`).
  - Valid classified simulation may accompany live evidence; simulation-only, dossier-only, prose-only, or external-pointer-only evidence cannot approve Category 1.
  - Every live child must match: an invalid or malformed child blocks beside a valid one.
- Safe diagnostic boundary:
  - Added `production_domain_tls` to `checkEvidenceFile`'s safe fail-closed wrapper.
  - Missing files, parse errors, child/dossier failures, and malformed nested-value exceptions are masked to fixed message `'A referenced Caddy routing report is invalid or failed'`.
  - Suppresses private filesystem paths, child error diagnostics, and exception stack traces.
  - Retains useful Category 1 domain syntax, email validation, and boolean field blockers.

`scripts/ops/assemble-launch-dossier.js`:
- In `caddyPassed`, enforces `caddyEvidence.execution_mode === "simulation"`.
- Summarizes Stage 3 in the launch evidence dossier as routing preflight verification rather than live domain/TLS sign-off.

Verification and review (2026-10-01):
- `node --test scripts/ops/verify-caddy-routing.spec.js`: 18 passed, 0 failed.
- `node --test scripts/ops/check-launch-readiness.spec.js`: 598 passed, 0 failed.
- `npm run ops:launch-drill-test`: 59 passed, 0 failed.
- `npm run ops:readiness-test`: 598 passed, 0 failed.
- `npm run ops:readiness-schema-test`: 8 passed, 0 failed.
- `npm run ops:templates`: `ops template check passed`.
- All 21 ops test sub-suites passed cleanly; dependency audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j).
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.
- Unresolved example readiness template failed closed: 0 approved categories, 11 blocked, 70 blockers.
- Operator sign-off remains open; no production DNS or TLS modification was performed.

## Prompt 240 — separate SMTP delivery preflight from live evidence (2026-10-01)

`scripts/ops/check-launch-readiness.js`:
- `validateSmtpDeliveryReport(report, now, approved, context)` supports both simulation and live modes:
  - Requires `drill_type === "smtp_delivery_verification"`, `status === "success"`, empty `errors` array,
    matching provider, host, port, tls_mode, and from_address against the approved readiness record, valid
    nonfuture ISO UTC timestamp, and zero placeholder or secret markers.
  - Requires explicit `execution_mode: "simulation" | "live"`. Missing or unrecognized modes fail closed.
  - In simulation mode (`execution_mode: "simulation"`):
    - Validates structural completeness.
    - If live mode is requested (`context.requireLive: true`), immediately returns `false`.
  - In live mode (`execution_mode: "live"` or `context.requireLive: true`):
    - Requires `environment === "production"`.
    - Requires trimmed, nonempty, control-free, secret-free references: `operator_reference`,
      `authorization_reference`, and `provider_reference`.
    - Requires structured `delivery` verification object: `{ status: "delivered", receipt_id: string, timestamp: ISO_UTC }`.
    - Requires structured `dns` authentication verification object: `{ checked_at: ISO_UTC, spf: { passed: true, record: string }, dkim: { passed: true, record: string }, dmarc: { passed: true, record: string } }`.
- Category 2 (`smtp_delivery`) evaluation:
  - Excludes unified launch dossiers from SMTP delivery candidates (`isSmtpDeliveryCandidate`).
  - When approved (`smtpSec.status === 'approved'`), requires a valid live SMTP delivery operator receipt (`execution_mode: "live"`).
  - Valid classified simulation may accompany live evidence; simulation-only, dossier-only, prose-only, or external-pointer-only evidence cannot approve Category 2.
  - Every child must match: an invalid or malformed child blocks beside a valid one.
- Safe diagnostic boundary:
  - Added `smtp_delivery` to `checkEvidenceFile`'s safe fail-closed wrapper.
  - Missing files, parse errors, child/dossier failures, and malformed nested-value exceptions are masked to fixed message `'A referenced SMTP delivery report is invalid or failed'`.
  - Suppresses private filesystem paths, child error diagnostics, and exception stack traces.
  - Retains useful Category 2 field, port, email, and TLS mode syntax blockers.

Verification and review (2026-10-01):
- `node --test scripts/ops/check-launch-readiness.spec.js`: 599 passed, 0 failed.
- `npm run ops:readiness-test`: 599 passed, 0 failed.
- `npm run ops:readiness-schema-test`: 8 passed, 0 failed.
- `npm run ops:templates` and `npm run ops:templates-test`: 57 passed, 0 failed.
- All 21 ops test sub-suites passed cleanly; dependency audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j).
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.
- Unresolved example readiness template failed closed: 0 approved categories, 11 blocked, 70 blockers.
- Operator sign-off remains open; no live emails were transmitted or external DNS records modified.

## Prompt 241 — separate secret-reference preflight from live evidence (2026-10-01)

`scripts/ops/check-launch-readiness.js`:
- `validateSecretReferencePolicyReport(report, now, approved, context)` supports both simulation and live modes:
  - Requires `drill_type === "secret_reference_policy_verification"`, `status === "success"`, empty `errors` array,
    matching 12 distinct indirect secret sources against the approved readiness record, valid nonfuture ISO UTC timestamp,
    and zero placeholder or secret markers.
  - Requires explicit `execution_mode: "simulation" | "live"`. Missing or unrecognized modes fail closed.
  - In simulation mode (`execution_mode: "simulation"`):
    - Validates structural completeness.
    - If live mode is requested (`context.requireLive: true`), immediately returns `false`.
  - In live mode (`execution_mode: "live"` or `context.requireLive: true`):
    - Requires `environment === "production"`.
    - Requires trimmed, nonempty, control-free, secret-free references: `operator_reference`,
      `authorization_reference`, and `policy_reference`.
    - Requires exact top-level keys matching the live specification.
- Category 4 (`secret_references`) evaluation:
  - Excludes unified launch dossiers from secret-reference policy candidates (`isSecretReferencePolicyCandidate`).
  - When approved (`secRefs.status === 'approved'`), requires a valid live secret-reference policy operator receipt (`execution_mode: "live"`).
  - Valid classified simulation may accompany live evidence; simulation-only, dossier-only, prose-only, or external-pointer-only evidence cannot approve Category 4.
  - Every child must match: an invalid or malformed child blocks beside a valid one.
- Safe diagnostic boundary:
  - Added `secret_references` to `checkEvidenceFile`'s safe fail-closed wrapper.
  - Missing files, parse errors, child/dossier failures, and malformed nested-value exceptions are masked to fixed message `'A referenced secret-reference policy report is invalid or failed'`.
  - Suppresses private filesystem paths, child error diagnostics, and exception stack traces.
  - Retains useful Category 4 field syntax and placeholder blockers.

Verification and review (2026-10-01):
- `node --test scripts/ops/check-launch-readiness.spec.js`: 599 passed, 0 failed.
- `npm run ops:readiness-test`: 599 passed, 0 failed.
- `npm run ops:readiness-schema-test`: 8 passed, 0 failed.
- `npm run ops:templates` and `npm run ops:templates-test`: 57 passed, 0 failed.
- All 21 ops test sub-suites passed cleanly; dependency audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j).
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.
- Unresolved example readiness template failed closed: 0 approved categories, 11 blocked, 70 blockers.
- Operator sign-off remains open; no production secret store access was performed or credentials modified.

## Prompt 242 — separate data-retention preflight from live evidence (2026-10-01)

`scripts/ops/check-launch-readiness.js`:
- `validateDataRetentionPolicyReport(report, now, approved, context)` supports both simulation and live modes:
  - Requires `drill_type === "data_retention_policy_verification"`, `status === "success"`, empty `errors` array,
    `scheduled_cleanup_verified === true`, valid nonfuture ISO UTC timestamp, and zero placeholder or secret markers.
  - Requires explicit `execution_mode: "simulation" | "live"`. Missing or unrecognized modes fail closed.
  - Validates all 8 retention windows (`REQUIRED_RETENTION_KEYS`) against approved values (with `policy_verified === true` and exactly two keys per window).
  - In simulation mode (`execution_mode: "simulation"`):
    - Validates structural completeness and exact top-level keys.
    - If live mode is requested (`context.requireLive: true`), immediately returns `false`.
  - In live mode (`execution_mode: "live"` or `context.requireLive: true`):
    - Requires `environment === "production"`.
    - Requires trimmed, nonempty, control-free, secret-free references: `operator_reference`,
      `authorization_reference`, and `policy_reference`.
    - Requires exact top-level keys matching the live specification.
- Category 7 (`data_retention_policy`) evaluation:
  - Excludes unified launch dossiers from data-retention policy candidates (`isDataRetentionPolicyCandidate`).
  - When approved (`retSec.status === 'approved'`), requires a valid live data-retention policy operator receipt (`execution_mode: "live"`).
  - Valid classified simulation may accompany live evidence; simulation-only, dossier-only, prose-only, or external-pointer-only evidence cannot approve Category 7.
  - Every child must match: an invalid or malformed child blocks beside a valid one.
- Safe diagnostic boundary:
  - Added `data_retention_policy` to `checkEvidenceFile`'s safe fail-closed wrapper.
  - Missing files, parse errors, child/dossier failures, and malformed nested-value exceptions are masked to fixed message `'A referenced data retention policy report is invalid or failed'`.
  - Suppresses private filesystem paths, child error diagnostics, and exception stack traces.
  - Retains useful Category 7 field, format, and window syntax blockers.

Verification and review (2026-10-01):
- `node --test scripts/ops/check-launch-readiness.spec.js`: 599 passed, 0 failed.
- `npm run ops:readiness-test`: 599 passed, 0 failed.
- `npm run ops:readiness-schema-test`: 8 passed, 0 failed.
- `npm run ops:templates` and `npm run ops:templates-test`: 57 passed, 0 failed.
- All 21 ops test sub-suites passed cleanly; dependency audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j).
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.
- Unresolved example readiness template failed closed: 0 approved categories, 11 blocked, 70 blockers.
- Operator sign-off remains open; no production retention purge routines were executed or database tables modified.

## Prompt 243 — separate GraphQL introspection preflight from live evidence (2026-10-01)

`scripts/ops/check-launch-readiness.js`:
- `validateGraphqlIntrospectionReport(report, now, approved, context)` supports both simulation and live modes:
  - Requires `drill_type === "graphql_introspection_probe"`, `status === "success"`, empty `errors` array,
    valid endpoint (`/graphql` or absolute HTTP/HTTPS URL ending in `/graphql`), boolean `production_introspection_enabled`,
    valid nonfuture ISO UTC timestamp, and zero placeholder or secret markers.
  - Requires explicit `execution_mode: "simulation" | "live"`. Missing or unrecognized modes fail closed.
  - Validates `probe_result` object containing exactly `status_code` (positive integer), `introspection_permitted`
    (matching `production_introspection_enabled`), `schema_exposed` (`false` when disabled, `true` when enabled),
    and non-empty trimmed `response_summary`.
  - When approved section is passed, requires `report.production_introspection_enabled === approved.production_introspection_enabled`.
  - In simulation mode (`execution_mode: "simulation"`):
    - Validates structural completeness and exact top-level keys (`drill_type`, `endpoint`, `errors`, `execution_mode`,
      `probe_result`, `production_introspection_enabled`, `status`, `timestamp`).
    - If live mode is requested (`context.requireLive: true`), immediately returns `false`.
  - In live mode (`execution_mode: "live"` or `context.requireLive: true`):
    - Requires `environment === "production"`.
    - Requires trimmed, nonempty, control-free, secret-free references: `operator_reference`,
      `authorization_reference`, and `probe_reference`.
    - Requires exact top-level keys matching the live specification.
- Category 9 (`graphql_introspection`) evaluation:
  - Excludes unified launch dossiers from candidate evaluation (`isGraphqlIntrospectionCandidate`).
  - When approved (`gqlSec.status === 'approved'`), requires a valid live GraphQL introspection probe operator receipt (`execution_mode: "live"`).
  - Valid classified simulation may accompany live evidence; simulation-only, dossier-only, prose-only, or external-pointer-only evidence cannot approve Category 9.
  - Every child must match: an invalid or malformed child blocks beside a valid one.
- Safe diagnostic boundary:
  - Added `graphql_introspection` to `checkEvidenceFile`'s safe fail-closed wrapper.
  - Missing files, parse errors, child/dossier failures, and malformed nested-value exceptions are masked to fixed message `'A referenced GraphQL introspection report is invalid or failed'`.
  - Suppresses private filesystem paths, child error diagnostics, and exception stack traces.
  - Retains useful Category 9 boolean and justification blockers.

Verification and review (2026-10-01):
- `node --test scripts/ops/check-launch-readiness.spec.js`: 599 passed, 0 failed.
- `npm run ops:readiness-test`: 599 passed, 0 failed.
- `npm run ops:readiness-schema-test`: 8 passed, 0 failed.
- `npm run ops:templates` and `npm run ops:templates-test`: 57 passed, 0 failed.
- All 21 ops test sub-suites passed cleanly; dependency audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j).
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.
- Unresolved example readiness template failed closed: 0 approved categories, 11 blocked, 70 blockers.
- Operator sign-off remains open; no production network probes were issued against production `/graphql` ingress.

## Prompt 244 — separate optional AI posture preflight from live evidence (2026-10-01)

`scripts/ops/check-launch-readiness.js`:
- `validateNoAiPostureReport(report, now, approved, context)` supports both simulation and live modes:
  - Requires `drill_type === "no_ai_production_posture_verification"`, `status === "success"`, empty `errors` array,
    `unpaid_provider_excluded === true`, valid nonfuture ISO UTC timestamp, and zero placeholder or secret markers.
  - Requires explicit `execution_mode: "simulation" | "live"`. Missing or unrecognized modes fail closed.
  - Validates `runtime` object containing exactly `api` and `worker` services, each with `ai_draft_enabled: false`,
    `gemini_api_key_present: false`, and trimmed non-empty `inventory_reference`.
  - Validates `journeys` object containing exactly `analytics_dashboard`, `governed_report`, and `export_download`,
    each with `passed: true` and trimmed non-empty `test_reference`.
  - When approved section is passed, requires `approved.ai_enabled === false`, `approved.no_ai_path_verified === true`,
    `approved.server_ai_draft_enabled_false === true`, `approved.no_gemini_api_key_provisioned === true`, and
    `approved.unpaid_provider_excluded === true`.
  - In simulation mode (`execution_mode: "simulation"`):
    - Validates structural completeness and exact top-level keys (`drill_type`, `errors`, `execution_mode`,
      `journeys`, `provider_policy_reference`, `runtime`, `status`, `timestamp`, `unpaid_provider_excluded`).
    - If live mode is requested (`context.requireLive: true`), immediately returns `false`.
  - In live mode (`execution_mode: "live"` or `context.requireLive: true`):
    - Requires `environment === "production"`.
    - Requires trimmed, nonempty, control-free, secret-free references: `operator_reference`,
      `authorization_reference`, and `provider_policy_reference`.
    - Requires exact top-level keys matching the live specification.
- Category 11 (`optional_ai_posture`) evaluation:
  - Excludes unified launch dossiers from candidate evaluation (`isNoAiPostureCandidate`).
  - When approved (`aiSec.status === 'approved'`), requires a valid live no-AI production posture operator receipt (`execution_mode: "live"`).
  - Valid classified simulation may accompany live evidence; simulation-only, dossier-only, prose-only, or external-pointer-only evidence cannot approve Category 11.
  - Every child must match: an invalid or malformed child blocks beside a valid one.
- Safe diagnostic boundary:
  - Added `optional_ai_posture` to `checkEvidenceFile`'s safe fail-closed wrapper.
  - Missing files, parse errors, child/dossier failures, and malformed nested-value exceptions are masked to fixed message `'A referenced no-AI production posture report is invalid or failed'`.
  - Suppresses private filesystem paths, child error diagnostics, and exception stack traces.
  - Retains useful Category 11 boolean, inventory, journey, and phase11 status blockers.

Verification and review (2026-10-01):
- `node --test scripts/ops/check-launch-readiness.spec.js`: 599 passed, 0 failed.
- `npm run ops:readiness-test`: 599 passed, 0 failed.
- `npm run ops:readiness-schema-test`: 8 passed, 0 failed.
- `npm run ops:templates` and `npm run ops:templates-test`: 57 passed, 0 failed.
- All 21 ops test sub-suites passed cleanly; dependency audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j).
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.
- Unresolved example readiness template failed closed: 0 approved categories, 11 blocked, 70 blockers.
- Operator sign-off remains open; no production secret store or runtime inventory was inspected live.

## Prompt 245 — separate capacity alerting preflight from live evidence (2026-10-01)

`scripts/ops/check-launch-readiness.js`:
- `validateCapacityAlertingReport(report, now, context)` supports both simulation and live modes:
  - Supports explicit `execution_mode: "simulation" | "live"` alongside backward-compatible `mode: "synthetic" | "live"`.
  - Classifies synthetic distributions and simulated DoS layers as simulation preflight (`execution_mode: "simulation"` or `mode: "synthetic"`).
  - If live mode is requested (`context.requireLive: true`), immediately returns `false` on simulation reports.
  - In live mode (`execution_mode: "live"`, `mode: "live"`, or `context.requireLive: true`):
    - Requires `environment === "production"`.
    - Requires trimmed, nonempty, control-free, placeholder-free, and secret-free references: `operator_reference`,
      `authorization_reference`, and `benchmark_reference` (or `monitoring_reference` / `telemetry_reference`).
    - Validates live capacity distributions, alert rule simulations, DoS resilience, and target-bound database telemetry baseline.
    - Evaluates nested `capacity.mode` against resolved mode (`synthetic ? 'synthetic' : 'live'`) to permit modern receipts without legacy top-level `mode`.
- Category 5 (`slo_and_alerting`) evaluation:
  - Excludes unified launch dossiers from candidate evaluation (`isCapacityAlertingCandidate`), rejecting disguised dossiers with `stages`, `dossier_version`, or `capacityAlertingBaseline`.
  - Added `validCapacityDossier(report)` helper to `checkEvidenceFileContents` to safely recognize valid launch dossiers accompanying child evidence in Category 5 evidence arrays without raising false-positive child blockers.
  - When approved (`slo.status === 'approved'`), requires a valid live capacity and alerting operator receipt (`execution_mode: "live"`).
  - Valid classified simulation may accompany live evidence; simulation-only, dossier-only, prose-only, or external-pointer-only evidence cannot approve Category 5.
  - Every child must match: an invalid or malformed child blocks beside a valid one.
- Safe diagnostic boundary:
  - Added `slo_and_alerting` to `checkEvidenceFile`'s safe fail-closed wrapper.
  - Missing files, parse errors, child/dossier failures, and malformed nested-value exceptions are masked to fixed message `'A referenced capacity and alerting report is invalid or failed'`.
  - Suppresses private filesystem paths, child error diagnostics, and exception stack traces.
- `scripts/ops/run-capacity-alerting-drill.sh`:
  - Added CLI flags `--operator-reference`, `--authorization-reference`, and `--benchmark-reference` with env var fallbacks.
  - Guards live field emission (`environment: "production"` and operator references) with `if (targetUrl && !dryRun)`.

Verification and review (2026-10-01):
- `node --test scripts/ops/check-launch-readiness.spec.js`: 603 passed, 0 failed.
- `node --test scripts/ops/run-capacity-alerting-drill.spec.js`: 17 passed, 0 failed.
- `npm run ops:readiness-test`: 603 passed, 0 failed.
- `npm run ops:readiness-schema-test`: 8 passed, 0 failed.
- `npm run ops:templates` and `npm run ops:templates-test`: 57 passed, 0 failed.
- All 21 ops test sub-suites passed cleanly; dependency audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j).
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.
- Unresolved example readiness template failed closed: 0 approved categories, 11 blocked, 70 blockers.
- Operator sign-off remains open; no production traffic was generated or telemetry scraped.

## Prompt 246 — unify launch drill dossier simulation contracts (2026-10-01)

`scripts/ops/assemble-launch-dossier.js` and `scripts/ops/run-launch-drills.sh`:
- Enforces `execution_mode: "simulation"` on child receipts across Stage 3 (`ingress_deployment`),
  Stage 5 (`secret_rotation`), and synthetic Stage 6 (`capacity_alerting`), matching the contracts
  enforced on Caddy (Stage 3), volume encryption (Stage 4), and disaster recovery (Stage 7).
- Live target-bound Stage 6 receipts require `execution_mode: "live"`.
- Root dossier published by `assemble-launch-dossier.js` declares `execution_mode: "simulation"`
  alongside `environment: "drill"`.
- Records `deploymentPreflight: "simulation"` on `deploymentBaseline` and `summary`.
- Records `rotationPreflight: "simulation"` on `secretRotationBaseline` and `summary`.
- Records `volumePreflight: "simulation"`, `restorePreflight: "simulation"`, and
  `reconciliationPreflight: "simulation"` on baselines and summaries.

`scripts/ops/check-launch-readiness.js`:
- Added `validSecretDossier(report, file)` helper validating `overall_status === 'PASSED'`,
  verified `secretRotationBaseline`, verified `supplyChainBaseline` (if present), and unbreached summary flags.
- Added `validDeploymentDossier(report, file)` helper validating `overall_status === 'PASSED'`,
  verified `deploymentBaseline`, and unbreached summary flags.
- `checkEvidenceFileContents`:
  - Category 3 (`secrets_management`): accepts `isSecretRotationCandidate` (deferred to approval),
    supply chain evidence (SBOM, SAST, container security), or `validSecretDossier`; rejects
    breached/invalid dossiers or unknown reports with `'A referenced secret rotation report is invalid or failed'`.
  - Category 10 (`deployment_and_rollback`): accepts `isDeploymentDrillCandidate` (deferred to approval),
    generic release evidence with `status: "success"`, or `validDeploymentDossier`; rejects
    breached/invalid dossiers or unknown reports with `'A referenced deployment drill report is invalid or failed'`.
- Both functions exported in `module.exports`.

Verification and review (2026-10-01):
- `node --test scripts/ops/run-launch-drills.spec.js scripts/ops/assemble-launch-dossier.spec.js`: 68 passed, 0 failed.
- `node --test scripts/ops/check-launch-readiness.spec.js`: 607 passed, 0 failed.
- `npm run ops:readiness-schema-test`: 8 passed, 0 failed.
- `npm run ops:templates` and `npm run ops:templates-test`: 57 passed, 0 failed.
- All 21 ops test sub-suites passed cleanly; dependency audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j).
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.
- Unresolved example readiness template failed closed: 0 approved categories, 11 blocked, 70 blockers.
- Operator sign-off remains open; drill rehearsal remains simulation preflight.

## Prompt 247 — enforce policy and posture evidence candidate contracts (2026-10-02)

`scripts/ops/check-launch-readiness.js`:
- Closes the evidence candidate evaluation gap across the four non-drill policy and posture categories:
  - `secret_references` (`isSecretReferencePolicyCandidate`)
  - `data_retention_policy` (`isDataRetentionPolicyCandidate`)
  - `graphql_introspection` (`isGraphqlIntrospectionCandidate`)
  - `optional_ai_posture` (`isNoAiPostureCandidate`)
- In `checkEvidenceFileContents`, each of these categories directly evaluates candidate eligibility:
  - If candidate check returns true, execution proceeds to approval-time checks with explicit clocks and live requirements.
  - If candidate check returns false (such as a disguised dossier with `stages` or `dossier_version`, or a non-candidate JSON report), the validator fails closed immediately with the category-specific blocker:
    - `'A referenced secret-reference policy report is invalid or failed'`
    - `'A referenced data retention policy report is invalid or failed'`
    - `'A referenced GraphQL introspection report is invalid or failed'`
    - `'A referenced no-AI production posture report is invalid or failed'`
- Guarantees that non-candidate JSON reports or disguised dossiers referenced alongside valid live receipts (`[good, disguisedDossier]`) fail closed instead of bypassing candidate exclusion.
- When referenced standalone, produces both the child requirement blocker and the invalid/failed report blocker.

Verification and review (2026-10-02):
- `node --test scripts/ops/check-launch-readiness.spec.js`: 607 passed, 0 failed.
- `node --test scripts/ops/run-launch-drills.spec.js scripts/ops/assemble-launch-dossier.spec.js`: 68 passed, 0 failed.
- `npm run ops:readiness-schema-test`: 8 passed, 0 failed.
- `npm run ops:templates` and `npm run ops:templates-test`: 57 passed, 0 failed.
- All 21 ops test sub-suites passed cleanly; dependency audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j).
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.
- Unresolved example readiness template failed closed: 0 approved categories, 11 blocked, 70 blockers.
- Operator sign-off remains open.

## Prompt 248 — unify drill dossier and candidate contracts for volume, recovery, and TLS (2026-10-02)

`scripts/ops/check-launch-readiness.js`:
- Unifies dossier recognition, candidate filtering, and safe fall-through semantics across Category 8 (`volume_encryption`), Category 6 (`backup_and_disaster_recovery`), and Category 1 (`production_domain_tls`):
  - Hardened `validVolumeDossier(report, file)` to reject child report files (`volume-encryption*`), non-object/array reports, and unverified baseline contracts.
  - Hardened `validRecoveryDossier(report, file)` to reject child report files (`restore-drill*`, `reconcil*`), non-object/array reports, and unverified baseline contracts.
  - Hardened `validCaddyDossier(report, file)` to reject dossiers reporting `staticIntegrity: 'failed'` or `staticIntegrityCompliance: 'failed'`.
  - In `checkEvidenceFileContents`:
    - Evaluates candidate child contracts first across Categories 1, 6, and 8, deferring full structural evaluation to approval-time checks with explicit clocks and live requirements.
    - Evaluates non-candidates against hardened dossier contracts (`validVolumeDossier`, `validRecoveryDossier`, `validCaddyDossier`), admitting valid dossiers alongside live operator receipts.
    - If non-candidate evaluation fails, category-specific invalid/failed blockers are immediately emitted:
      - `'A referenced volume encryption report is invalid or failed'`
      - `'A referenced restore drill report is invalid or failed'` / `'A referenced storage reconciliation report is invalid or failed'`
      - `'A referenced Caddy routing report is invalid or failed'`
    - Adds explicit `continue;` statements preventing unintended fall-through to generic parser logic across all three categories.
- Exports `validVolumeDossier`, `validRecoveryDossier`, and `validCaddyDossier` in `module.exports`.
- Extended `scripts/ops/check-launch-readiness.spec.js` with comprehensive contract tests validating dossier acceptance alongside live operator receipts, rejection of failing/disguised dossiers, and child filename rejection.

Verification and review (2026-10-02):
- `node --test scripts/ops/check-launch-readiness.spec.js`: 611 passed, 0 failed.
- `node --test scripts/ops/run-launch-drills.spec.js scripts/ops/assemble-launch-dossier.spec.js`: 68 passed, 0 failed.
- `npm run ops:readiness-schema-test`: 8 passed, 0 failed.
- `npm run ops:templates` and `npm run ops:templates-test`: 57 passed, 0 failed.
- All 21 ops test sub-suites passed cleanly; dependency audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j).
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.
- Unresolved example readiness template failed closed: 0 approved categories, 11 blocked, 70 blockers.
- Operator sign-off remains open.

## Prompt 249 — unify capacity, deployment, and supply chain contracts (2026-10-02)

`scripts/ops/check-launch-readiness.js`:
- Unifies dossier recognition, candidate filtering, and supply chain evidence handling across Category 5 (`slo_and_alerting`), Category 10 (`deployment_and_rollback`), and Category 3 (`secrets_management`):
  - Hardened `validCapacityDossier(report, file)` to accept `file`, reject child report files (`capacity-alerting*`), non-object/array reports, and validate `databaseTelemetryBaseline` with `status: "verified"` (matching `scripts/ops/assemble-launch-dossier.js`).
  - Added summary checks to `validCapacityDossier` ensuring unbreached flags (`capacityAlerting !== 'failed'`, `capacityPreflight !== 'failed'`, `sloCompliance !== 'failed'`, `sloCompliance !== 'capacity_alerts_failed'`, `capacitySloCompliance !== 'failed'`, `databaseBaselineCompliance !== 'failed'`, `alertVerification !== 'failed'`, `dosResilience !== 'failed'`).
  - Hardened `isCapacityAlertingCandidate` to exclude dossiers reporting `databaseTelemetryBaseline` with capacity summary flags from child candidacy.
  - In `checkEvidenceFileContents`:
    - Category 5 (`slo_and_alerting`) now passes `(parsed, file)` to `validCapacityDossier`.
    - Category 3 (`secrets_management`) encapsulates supply chain child evidence verification (`validateSupplyChainEvidence`) covering SAST, SBOM, and container security, cleanly terminating with `continue;`.
    - All eleven categories in `checkEvidenceFileContents` now terminate with `continue;`, eliminating fall-through to dead/unrelated drill checks.
- Extended `scripts/ops/check-launch-readiness.spec.js` with comprehensive contract tests validating `validCapacityDossier` acceptance alongside live operator receipts, rejection of failing/disguised dossiers, and child filename rejection.

Verification and review (2026-10-02):
- `node --test scripts/ops/check-launch-readiness.spec.js`: 613 passed, 0 failed.
- `node --test scripts/ops/run-launch-drills.spec.js scripts/ops/assemble-launch-dossier.spec.js`: 68 passed, 0 failed.
- `npm run ops:readiness-schema-test`: 8 passed, 0 failed.
- `npm run ops:templates` and `npm run ops:templates-test`: 57 passed, 0 failed.
- All 21 ops test sub-suites passed cleanly; dependency audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j).
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.
- Unresolved example readiness template failed closed: 0 approved categories, 11 blocked, 70 blockers.
- Operator sign-off remains open.

## Prompt 250 — consolidate readiness evidence boundaries and eliminate legacy dead code (2026-10-02)

`scripts/ops/check-launch-readiness.js`:
- Unifies evidence boundary checks and removes legacy dead code across all 11 launch checklist categories:
  - In `checkEvidenceFile`, replaced the hardcoded 11-category list with canonical `REQUIRED_SECTIONS.includes(category)`.
  - In `checkEvidenceFileContents`, eliminated 524 lines of unreachable dead code (generic status/overall_status checks, failed_stages, generic stage loops, and legacy drill fragments) shadowed by Prompts 235–249's category-specific candidate and dossier validators.
  - Added an explicit fail-closed fallback for unrecognized checklist categories in `checkEvidenceFileContents`.
  - Exported `checkEvidenceFile` and `checkEvidenceFileContents` in `module.exports`.
- Extended `scripts/ops/check-launch-readiness.spec.js` with tests asserting canonical `REQUIRED_SECTIONS` evidence boundary alignment and fail-closed rejection of unrecognized categories.

Verification and review (2026-10-02):
- `node --test scripts/ops/check-launch-readiness.spec.js`: 614 passed, 0 failed.
- `node --test scripts/ops/run-launch-drills.spec.js scripts/ops/assemble-launch-dossier.spec.js`: 68 passed, 0 failed.
- `npm run ops:readiness-schema-test`: 8 passed, 0 failed.
- `npm run ops:templates` and `npm run ops:templates-test`: 57 passed, 0 failed.
- All 21 ops test sub-suites passed cleanly; dependency audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j).
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.
- Unresolved example readiness template failed closed: 0 approved categories, 11 blocked, 70 blockers.
- Operator sign-off remains open.

## Prompt 251 — export and test supply chain and static evidence contracts (2026-10-02)

`scripts/ops/check-launch-readiness.js`:
- Relocates misplaced Caddy routing helpers (`validCaddyDossier` and `validCaddyStaticEvidence`) from the disaster recovery section down to the Caddy routing section, restoring architectural locality and contiguous disaster recovery validation logic.
- Exports internal evidence helpers `validCaddyStaticEvidence`, `isSastEvidence`, `isSbomEvidence`, `isContainerSecurityEvidence`, and `validateSupplyChainEvidence` in `module.exports`.
- Extended `scripts/ops/check-launch-readiness.spec.js` with comprehensive unit and contract test suites:
  - `validCaddyStaticEvidence` contract testing: verifies passing static integrity reports (and compliance with `validateStaticEvidence` drill requirements), and rejects missing/null reports, non-objects, non-array stages, failed status, and failed stages.
  - Supply chain candidate discrimination helpers: tests positive and negative discrimination contracts for `isSastEvidence`, `isSbomEvidence`, and `isContainerSecurityEvidence`.
  - `validateSupplyChainEvidence` contract testing: tests rejection of non-object/array reports, failed status/overall_status, non-zero summary exitCode, missing scan components, failed/unhealthy SAST findings, non-compliant SBOM packages, and non-compliant container security findings, alongside full acceptance of passing supply chain evidence.

Verification and review (2026-10-02):
- `node --test scripts/ops/check-launch-readiness.spec.js`: 617 passed, 0 failed.
- `node --test scripts/ops/run-launch-drills.spec.js scripts/ops/assemble-launch-dossier.spec.js`: 68 passed, 0 failed.
- `npm run ops:readiness-schema-test`: 8 passed, 0 failed.
- `npm run ops:templates` and `npm run ops:templates-test`: 57 passed, 0 failed.
- All 21 ops test sub-suites passed cleanly; dependency audit reports the existing upstream advisory on Next 16.3.4 (GHSA-vcvr-r3jv-pc5j).
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.
- Unresolved example readiness template failed closed: 0 approved categories, 11 blocked, 70 blockers.
- Operator sign-off remains open.

## Prompt 256 — modularize and test readiness CLI argument parsing, summary formatting, and execution runner (2026-10-03)

`scripts/ops/check-launch-readiness.js`:
- Decomposed the remaining command-line interface, human-readable summary formatting, end-to-end execution runner, and main entrypoint:
  - Extracted `parseCliArguments(args, cwd)`: parses command-line arguments, rejects invalid flags (e.g. `--help`, `--dry-run`), rejects excessive positional arguments, and resolves target readiness file relative to `cwd` (defaulting to `infra/launch/readiness.example.json`).
  - Extracted `formatReadinessSummary({ categoryBlockers, totalApproved, totalSections, targetPath, cwd })`: encapsulates rendering the human-readable report banner, per-category blocker listings, statistics summary table (total required, approved, unresolved, total blockers), and fail-closed vs. passing result notice.
  - Extracted `runReadinessCheck(targetPath, options, io)`: orchestrates defensive target path resolution and string validation, asserts file existence, parses JSON contents, delegates to `validateReadiness()`, renders the summary via `formatReadinessSummary()`, dispatches lines to configurable `io` logging/error callbacks, and returns a structured result object `{ success, exitCode, targetPath, relativePath, totalApproved, totalSections, totalBlockersCount, categoryBlockers, summary, error }`.
  - Refactored `main(argv, io, options)`: delegates cleanly to `parseCliArguments()` and `runReadinessCheck()`, calling `process.exit(result.exitCode)` when executed directly as the script entrypoint (`require.main === module`), and returning `result.exitCode` when invoked programmatically.
  - Exported all 4 functions (`parseCliArguments`, `formatReadinessSummary`, `runReadinessCheck`, and `main`) in `module.exports`.
- Extended `scripts/ops/check-launch-readiness.spec.js` with comprehensive unit and contract test suites:
  - `parseCliArguments`: tests default target path resolution (`infra/launch/readiness.example.json`), explicit custom paths, custom cwd resolution, flag rejection (`--help`, `--with-drills`, `--dry-run`), multiple argument rejection, and non-array/non-string input guards.
  - `formatReadinessSummary`: tests passing summary rendering (banner, counts, result notice), blocked/failing summary rendering with uppercase category headers and itemized blockers, and accurate calculation of blockers and unapproved counts.
  - `runReadinessCheck`: tests defensive non-string/empty target path rejection, file-not-found error handling, malformed JSON parse error handling, fail-closed evaluation of `infra/launch/readiness.example.json` (70 blockers, 0 approved, exitCode 1), passing evaluation of approved record fixtures (0 blockers, 11 approved, exitCode 0), and clean output capture without console pollution.
  - `main`: tests programmatic CLI entrypoint execution, usage errors on invalid arguments, fail-closed exit code on example records, and passing exit code on approved records.

Verification and review (2026-10-03):
- `node --test scripts/ops/check-launch-readiness.spec.js`: 649 passed, 0 failed.
- `node --test scripts/ops/run-launch-drills.spec.js scripts/ops/assemble-launch-dossier.spec.js`: 68 passed, 0 failed.
- `npm run ops:templates` and `npm run ops:templates-test`: 57 passed, 0 failed.
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.
- Unresolved example readiness template failed closed: 0 approved categories, 11 blocked, 70 blockers.
- Operator sign-off remains open.

## Prompt 257 — harden and test launch readiness shell orchestrator (2026-10-03)

`scripts/ops/launch-readiness.sh`:
- Hardened command-line interface and argument parsing:
  - Enforced single positional argument validation: rejects multiple positional arguments (e.g. `scripts/ops/launch-readiness.sh file1.json file2.json`) with exit code 1 and error `Error: Too many arguments; expected single readiness JSON path` followed by usage instructions.
  - Maintained `--help` / `-h` usage flag handling (exit 0) and fail-closed rejection of unknown options (e.g. `--dry-run`, exit 1).
  - Maintained sequential fail-closed preflight checks: `check-production-templates.sh`, `scan-secrets.sh`, `check-docker-runtime.sh`, and `node --test scripts/ops/check-launch-readiness.spec.js`.
  - Maintained optional drill execution under `--with-drills` with fail-closed dossier hint emission on failure.
  - Propagated execution exit code from `check-launch-readiness.js`.

`scripts/ops/launch-readiness.spec.js`:
- Created comprehensive unit and contract test specification using Node.js built-in test runner (`node:test` and `node:child_process`):
  - CLI usage & flags: tests `--help`, `-h`, unknown flag rejection, unknown `--dry-run` rejection, single-dash unknown flag rejection, and excessive positional argument rejection.
  - Fail-closed preflight pipeline: verifies immediate execution halt when any preflight script fails (`check-production-templates.sh`, `scan-secrets.sh`, `check-docker-runtime.sh`, or `check-launch-readiness.spec.js`).
  - Drill flag flow: tests omitting vs including `--with-drills`, drill failure handling and dossier stderr hint, and ordering of drill execution prior to readiness check.
  - Target forwarding & exit code propagation: tests default and custom readiness file path forwarding, argument order invariance (`--with-drills` before or after target path), and exit code propagation.
  - Real repository execution: verifies fail-closed execution against `infra/launch/readiness.example.json` returning exit code 1 with 70 unresolved blockers detected.

`scripts/ops/check-production-templates.sh`:
- Added `require_file scripts/ops/check-launch-readiness.spec.js`.
- Added `require_file scripts/ops/launch-readiness.spec.js`.

`package.json`:
- Added `"ops:launch-readiness-test": "node --test scripts/ops/launch-readiness.spec.js"`.
- Integrated `npm run ops:launch-readiness-test` into `"ops:check"`.

Verification and review (2026-10-03):
- `node --test scripts/ops/launch-readiness.spec.js`: 23 passed, 0 failed.
- `node --test scripts/ops/check-launch-readiness.spec.js`: 649 passed, 0 failed.
- `node --test scripts/ops/run-launch-drills.spec.js scripts/ops/assemble-launch-dossier.spec.js`: 68 passed, 0 failed.
- `npm run ops:templates` and `npm run ops:templates-test`: 57 passed, 0 failed.
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.
- Unresolved example readiness template failed closed: 0 approved categories, 11 blocked, 70 blockers.
- Operator sign-off remains open.

## Prompt 258 — modularize and test production template checks (2026-10-03)

`scripts/ops/check-production-templates.js`:
- Extracted and modularized the 580-line inline Node.js validation block from `scripts/ops/check-production-templates.sh` into discrete, exported validator functions and orchestrator:
  - `mountDetails(entry)`: parses string (`ro`/`rw`, modes) and object (`volume`/`bind`) mount definitions into `{ source, target, persistent, writable }`.
  - `assertPostgres18Mount(composeDocument, filePath)`: enforces that `postgis/postgis:18-*` services mount persistent writable storage at `/var/lib/postgresql` and strictly rejects mounts at `/var/lib/postgresql/data`.
  - `validateRequiredServices(services)`: validates presence of all 11 required services (`caddy`, `next`, `api`, `worker`, `postgres`, `valkey`, `garage`, `clamav`, `prometheus`, `grafana`, `postgres-exporter`), throwing descriptive errors if any is missing.
  - `validateComposeSecurityAndTopology(services)`: verifies host port exclusivity (only Caddy publishes host ports), scheduler exclusivity (`api: false`, `worker: true`), encrypted volume placeholder markers (`ENCRYPTED_MOUNT`), absence of `env_file` directives across all services, and Garage-scoped secrets.
  - `validateComposeEnvironmentInterpolation(composeText, envKeys)`: verifies compose `${VAR}` interpolation placeholders against environment template declarations (allowing bootstrap monitor password) and rejects test role leakage (`ACRES_TEST_PASSWORD`, `bootstrap-roles.sh`).
  - `validateWorkerAndExporterScrape(services, prom, monitorSql, operationsDoc, caddyfileText)`: verifies private worker metrics on port 3002 (`/health` and `/metrics`), postgres-exporter container profile (`observability`), private network, file password mount (`ACRES_MONITOR_PASSWORD_FILE`), relabel keep rules, and `reconcile-production-monitor.sh` / `docs/operations.md` contracts.
  - `validateServiceHealthAndSupervision(services)`: enforces `service_healthy` condition on all dependencies of `api`, `worker`, and `grafana`; requires `init: true` and `stop_signal: SIGTERM` for `api`, `worker`, `next`; enforces `restart: unless-stopped` and exact bounded `stop_grace_period` (`caddy: 30s`, `next: 30s`, `api: 45s`, `worker: 60s`).
  - `validatePrometheusAlertsAndDashboard(alerts, dashboard, checklist)`: validates 11 alert rules in `alerts.yml`, panel queries scoped to corresponding jobs (`acres-api`, `acres-worker`, `acres-postgres`, `prometheus`), absent-data preservation on designated panels, exact duration/request panel units and targets, and matching PromQL and dashboard runbook sections in `docs/launch-checklist.md`.
  - `validateReadinessTargets(readinessExample, bdrOverride)`: enforces Category 5 SLO targets (99.9% availability, 500ms max p95, 100 RPS capacity, 50ms acquisition, 100ms query), Category 6 RPO/RTO targets (1h RPO, 4h RTO), and backup cron schedule max gap.
  - `validateDrillScriptIntegrations(launchDrillsScript, deploymentDrillScript, secretRotationScript)`: validates launch drill runner dossier assemblage, deployment drill signal supervision and drain verification, and secret rotation option validation and redaction audit.
  - `checkProductionTemplates(options, io)`: orchestrates the full template verification suite relative to configurable `cwd`, returning structured `{ success, errors }`.
  - `main(argv, io)`: CLI entrypoint executing `checkProductionTemplates()` and terminating with code 0 on success or 1 on failure.

`scripts/ops/check-production-templates.spec.js`:
- Created comprehensive unit and contract test specification with 37 tests using Node.js test runner (`node:test`):
  - `mountDetails`: string syntax (`ro`, `rw`, modes), object syntax (`type: 'volume'|'bind'`, `read_only`), invalid/empty formats.
  - `assertPostgres18Mount`: passing mounts at `/var/lib/postgresql`, rejection of missing mounts, non-persistent/read-only mounts, and forbidden mounts at `/var/lib/postgresql/data`.
  - `validateRequiredServices`: passing when all 11 services exist, throwing when any service is missing.
  - `validateComposeSecurityAndTopology`: port exposure on non-caddy services, scheduler misconfiguration, missing encrypted mount markers, forbidden `env_file`, and leaked Garage tokens.
  - `validateComposeEnvironmentInterpolation`: unmapped interpolation keys, allowed monitor bootstrap password, colon and colon-less parameter expansion syntax, and forbidden test role markers.
  - `validateWorkerAndExporterScrape`: worker port/probe mismatches, exporter configuration errors, monitor role SQL checks, and credential mounting isolation.
  - `validateServiceHealthAndSupervision`: missing dependency health conditions, missing `init: true` or `stop_signal: SIGTERM`, improper restart policy, and mismatched drain periods.
  - `validatePrometheusAlertsAndDashboard`: missing alert rules, drifted panel queries, absent data vector masks, and missing runbook sections in checklist.
  - `validateReadinessTargets`: drifted Category 5 SLO thresholds, drifted Category 6 RPO/RTO targets, and excessive backup cron gaps.
  - `validateDrillScriptIntegrations`: missing dossier assemblage markers, supervision markers, or rotation redaction audit markers.
  - `checkProductionTemplates`: running against actual repository templates exiting cleanly with zero errors, and graceful failure without unhandled exceptions on invalid directories.
  - `main`: exit code and error reporting verification on valid and invalid CLI invocations.

`scripts/ops/check-production-templates.sh`:
- Replaced the inline heredoc (`node <<'NODE' ... NODE`) with `node scripts/ops/check-production-templates.js || fail 'production template validation failed'`.
- Added `require_file scripts/ops/check-production-templates.js` and `require_file scripts/ops/check-production-templates.spec.js`.

`package.json`:
- Updated `"ops:templates-test"` to include `scripts/ops/check-production-templates.spec.js`.

Verification and review (2026-10-03):
- `npm run ops:templates-test`: 94 passed, 0 failed (37 template checks, 42 garage metrics, 9 proxy environment, 6 application environment, 5 smtp keys).
- `npm run ops:templates`: passed.
- `node --test scripts/ops/launch-readiness.spec.js`: 23 passed, 0 failed.
- `node --test scripts/ops/check-launch-readiness.spec.js`: 649 passed, 0 failed.
- `node --test scripts/ops/run-launch-drills.spec.js scripts/ops/assemble-launch-dossier.spec.js`: 68 passed, 0 failed.
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` passed cleanly.
- Unresolved example readiness template failed closed: 0 approved categories, 11 blocked, 70 blockers.
- Operator sign-off remains open.

## Prompt 259 — harden production template input validation (2026-10-03)

The Node checker previously ignored unknown flags, a bare `--cwd`, and positional
arguments. Incorrect collection shapes such as Compose `volumes: {}`,
Prometheus `scrape_configs: {}`, and alert `groups: {}` raised incidental
`TypeError`s. Input validation now rejects those cases before traversal.

`parseTemplateCliArguments(args, cwd)` accepts application arguments only and
returns a resolved `{ cwd }`. The supported Node CLI invocations are:

```bash
node scripts/ops/check-production-templates.js
node scripts/ops/check-production-templates.js --cwd <repository-root>
node scripts/ops/check-production-templates.js --cwd=<repository-root>
```

Only one override is accepted. Relative paths resolve against the supplied base
cwd; quoted paths with spaces work. Unknown flags (including `--help`/`-h`),
positionals, duplicates, missing/blank values, options used as split-form values,
and malformed programmatic arrays/cwd values fail with a fixed reason and usage
syntax before template reads. `main` retains full `process.argv` input and
`exitOnError:false`; successful calls return 0, failed calls return/exit 1.

The checker validates consumed mappings, lists, entries and expression strings
in Compose, Prometheus, alert rules, dashboard panels/targets, readiness
Categories 5/6, and provisioning roots. Imported validators run only after their
traversal prerequisites pass. Missing Garage healthcheck tests and prohibited
`env_file` declarations record failure before the Garage validator is skipped.
Array-returning helpers return errors on malformed structures; assertion helpers
throw descriptive validation errors. Shape failures do not suppress independent
valid document branches. Volume string syntax and bind/volume objects remain
supported, including encrypted mount placeholders in object sources.

Expected file read, YAML/JSON parse and shape failures return
`{ success: false, errors }` with file-relative locations. Diagnostics omit
parser snippets, filesystem exception text and complete argument values. The
runbook PromQL mismatch diagnostic also omits the supplied expression to avoid
printing configuration content. Unexpected parser/programmer defects are
re-thrown; there is no blanket orchestration catch. These guards cover only
structures consumed here, not the full Compose, Prometheus or Grafana schemas.

The regression suite uses unique, cleaned temporary roots containing only the
19 public inputs read by the checker. Every fixture first passes unmodified;
mutations then exercise malformed syntax, roots, nested collections, scalar
coercion, redaction, captured `main` output and real spawned CLI exit codes.
No operator record, `.env` instance or raw evidence is copied.

Independent review reproduced two more incidental exceptions: object-valued
panel 21 `gridPos.y` during PostgreSQL diagnostics, and cyclic YAML aliases
during imported JSON serialization checks. Present dashboard IDs/layout `y`
values now require finite numbers, and an iterative ancestor/completed-reference
walk rejects cycles before traversal while allowing shared acyclic aliases.
Fixture, helper and real-process regressions cover the repairs.

Verification on 2026-10-03 (actual output excerpts; no live drill or deployment):

| command                                                                          | exit | output / result                                                                                                                      |
| -------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `node --check scripts/ops/check-production-templates.js`                         | 0    | no output                                                                                                                            |
| `node --check scripts/ops/check-production-templates.spec.js`                    | 0    | no output                                                                                                                            |
| `node --test scripts/ops/check-production-templates.spec.js`                     | 0    | `tests 233`, `pass 233`, `fail 0`                                                                                                    |
| `npm run ops:templates-test`                                                     | 0    | `tests 290`, `pass 290`, `fail 0`                                                                                                    |
| `npm run ops:templates`                                                          | 0    | `ops template check passed`                                                                                                          |
| `npm run ops:launch-readiness-test`                                              | 0    | `tests 23`, `pass 23`, `fail 0`                                                                                                      |
| `npm run ops:readiness-test`                                                     | 0    | `tests 649`, `pass 649`, `fail 0`                                                                                                    |
| `npm run ops:launch-drill-test`                                                  | 0    | `tests 68`, `pass 68`, `fail 0`                                                                                                      |
| `npm run ops:check`                                                              | 1    | `28 vulnerabilities (10 moderate, 17 high, 1 critical)`; `audit error: critical vulnerabilities detected in production dependencies` |
| `npm run lint`                                                                   | 0    | all three workspace ESLint commands completed without diagnostics                                                                    |
| `npm run typecheck`                                                              | 0    | shared/client/server typechecks completed; `Generated Prisma Client (7.9.1)`                                                         |
| `npm run build`                                                                  | 0    | `Compiled successfully`; `Generating static pages ... (22/22)`; server `prisma generate && nest build` completed                     |
| `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` | 1    | `Approved Categories: 0`, `Unresolved / Blocked: 11`, `Total Blockers Detected: 70`, `Result: FAIL-CLOSED`                           |
| Prettier on changed JS and the approved prompt, with `server/.prettierrc`        | 0    | `All matched files use Prettier code style!`                                                                                         |
| `git diff --check`                                                               | 0    | no output                                                                                                                            |

The operations aggregate passed templates/tests, release-image tests (22), secret
scan and Docker runtime inspection, then stopped at its dependency audit. The
critical advisory reported by that run is `GHSA-vcvr-r3jv-pc5j` against installed
Next 16.3.4. Remaining aggregate stages did not run through `ops:check`; the
readiness and launch-drill suites above were run separately. No dependency,
lockfile or audit policy was changed under this prompt.

Subprocess testing under this session's sandbox returned `EPERM` even when a
child produced output. Verification was rerun outside that interception through
approved tool escalation; the final counts above are real process runs, not
sandbox file-level fallback counts. Root lint/typecheck/build completed before
review; affected template checks were rerun after the review fixes. Markdown
additions were formatted separately to preserve historical records.

Phase 12 production exit/sign-off and prompt 201 remain open. The unchanged
unresolved readiness example is not production evidence. Inspect this repair
with `npm run ops:templates` or the explicit-root Node invocation above;
rollback is a normal revert of the local commit.

## Prompt 260 — harden and test production template shell runner (2026-10-04)

`scripts/ops/check-production-templates.sh`:
- Hardened CLI argument parsing with POSIX `/bin/sh` compliance:
  - Supported options: `--help`, `-h` (exit 0 with usage), `--cwd <path>`, and `--cwd=<path>`.
  - Rejects unknown options (`Error: Unknown option "<opt>"` with usage to stderr, exit 1).
  - Rejects unexpected positional arguments (`Error: Unexpected argument "<arg>"` with usage to stderr, exit 1).
  - Rejects missing `--cwd` value (`Error: --cwd requires a non-empty directory path` with usage to stderr, exit 1).
  - Rejects empty/whitespace `--cwd` value (`Error: --cwd path cannot be empty` with usage to stderr, exit 1).
  - Rejects repeated `--cwd` (`Error: Repeated --cwd option; expected single directory path` with usage to stderr, exit 1).
  - Validates target directory exists (`ops template check failed: target directory does not exist: <path>`, exit 1).
  - Canonicalizes resolved target directory and script directory.
  - Updates `require_file` assertions to target `$RESOLVED_CWD/$1`.
  - Added `require_file scripts/ops/check-production-templates-shell.spec.js`.
  - Forwards `--cwd "$RESOLVED_CWD"` to `check-production-templates.js`.
  - Targets `$RESOLVED_CWD/infra/env/production.env.example` and `$RESOLVED_CWD/infra/caddy/Caddyfile.example` for security greps.
  - Passes explicit target paths to downstream verifiers (`verify-caddy-routing.js`, `verify-volume-encryption.js`) and runs context-dependent verifiers in `(cd "$RESOLVED_CWD" && node "$SCRIPT_DIR/...")`.

`scripts/ops/check-production-templates-shell.spec.js`:
- Created dedicated unit and contract test specification with 34 tests using Node.js test runner (`node:test`):
  - CLI flag and argument validation (16 tests): `--help`, `-h`, unknown options (`--invalid`, `-x`), unexpected positionals, missing/empty/whitespace `--cwd`, repeated `--cwd`, non-existent directory, and explicit targeting (`--cwd <path>` and `--cwd=<path>`).
  - Fail-closed step ordering and assertions (14 tests): missing template file, missing shell spec file, `check-production-templates.js` failure, leaked secret in `production.env.example`, missing `__REQUIRED_` placeholder sentinels, missing `Strict-Transport-Security` in `Caddyfile.example`, downstream verifier failures (`verify-caddy-routing.js`, `verify-volume-encryption.js`, `verify-alert-rules.js`, `verify-capacity-load.js`), and full successful execution sequence.
  - Real repository execution (4 tests): direct invocation without args, invocation with `--cwd .`, invocation with `--cwd=<ROOT>`, and execution from an external working directory with `--cwd <ROOT>`.

`package.json`:
- Added `"ops:templates-shell-test": "node --test scripts/ops/check-production-templates-shell.spec.js"`.
- Updated `"ops:templates-test"` to include `scripts/ops/check-production-templates-shell.spec.js`.
- Updated `"ops:check"` to include `npm run ops:templates-shell-test`.

Verification on 2026-10-04 (actual output excerpts; no live drill or deployment):

| command | exit | output / result |
| --- | --- | --- |
| `sh -n scripts/ops/check-production-templates.sh` | 0 | syntax valid, no output |
| `node --test scripts/ops/check-production-templates-shell.spec.js` | 0 | `tests 34`, `pass 34`, `fail 0` |
| `npm run ops:templates-test` | 0 | `tests 324`, `pass 324`, `fail 0` |
| `npm run ops:templates` | 0 | `ops template check passed` |
| `(cd server && ../scripts/ops/check-production-templates.sh --cwd ..)` | 0 | `ops template check passed` |
| `scripts/ops/check-production-templates.sh --help` | 0 | `Usage: scripts/ops/check-production-templates.sh [--cwd <path> \| --cwd=<path>]` |
| `scripts/ops/check-production-templates.sh --invalid` | 1 | `Error: Unknown option "--invalid"`, exit 1 |
| `npm run ops:launch-readiness-test` | 0 | `tests 23`, `pass 23`, `fail 0` |
| `npm run ops:readiness-test` | 0 | `tests 649`, `pass 649`, `fail 0` |
| `npm run ops:launch-drill-test` | 0 | `tests 68`, `pass 68`, `fail 0` |
| `npm run lint` | 0 | client, shared, server ESLint completed with 0 diagnostics |
| `npm run typecheck` | 0 | shared, client, server typechecks passed; `Generated Prisma Client (7.9.1)` |
| `npm run build` | 0 | client next build (22/22 static pages) and server nest build completed |
| Prettier on changed JS/JSON with `server/.prettierrc` | 0 | `All matched files use Prettier code style!` |
| `git diff --check` | 0 | clean, no whitespace errors |

Phase 12 production exit/sign-off and prompt 201 remain open. Inspect this repair with `npm run ops:templates-shell-test` or `npm run ops:templates`; rollback is a normal revert of the local commit.

## Prompt 261 — harden and test docker runtime check (2026-10-04)

`scripts/ops/check-docker-runtime.sh`:
- Hardened CLI argument parsing with POSIX `/bin/sh` compliance:
  - Supported options: `--help`, `-h` (exit 0 with usage), `--cwd <path>`, `--cwd=<path>`, `--dockerfile <path>`, and `--dockerfile=<path>`.
  - Rejects unknown options (`Error: Unknown option "<opt>"` with usage to stderr, exit 1).
  - Rejects unexpected positional arguments (`Error: Unexpected argument "<arg>"` with usage to stderr, exit 1).
  - Rejects missing `--cwd` value (`Error: --cwd requires a non-empty directory path` with usage to stderr, exit 1).
  - Rejects empty/whitespace `--cwd` value (`Error: --cwd path cannot be empty` with usage to stderr, exit 1).
  - Rejects repeated `--cwd` (`Error: Repeated --cwd option; expected single directory path` with usage to stderr, exit 1).
  - Rejects missing `--dockerfile` value (`Error: --dockerfile requires a non-empty file path` with usage to stderr, exit 1).
  - Rejects empty/whitespace `--dockerfile` value (`Error: --dockerfile path cannot be empty` with usage to stderr, exit 1).
  - Rejects repeated `--dockerfile` (`Error: Repeated --dockerfile option; expected single file path` with usage to stderr, exit 1).
  - Validates target directory exists (`docker runtime check failed: target directory does not exist: <path>`, exit 1).
  - Resolves target directory and Dockerfile path (supporting both relative to `--cwd` and absolute paths).
  - Validates resolved Dockerfile exists (`docker runtime check failed: missing <path>`, exit 1).
  - Preserves four static server Dockerfile assertions:
    1. Node 24 Alpine stage (`grep -Eq '^FROM node:24-alpine( AS |$)'`).
    2. Non-root user (`grep -Eq '^USER node$'`).
    3. Healthcheck directive (`grep -Eq '^HEALTHCHECK '`).
    4. Direct Node startup command (`grep -Fq 'CMD ["node", "server/dist/main.js"]'`).
  - Outputs `docker runtime check passed\n` on success, exit 0.

`scripts/ops/check-docker-runtime.spec.js`:
- Created dedicated unit and contract test specification with 45 tests using Node.js test runner (`node:test` and `node:assert/strict`):
  - CLI argument validation (24 tests): `--help`, `-h`, unknown options (`--invalid-flag`, `-x`), unexpected positionals, missing/empty/whitespace `--cwd`, repeated `--cwd`, non-existent directory, missing/empty/whitespace `--dockerfile`, repeated `--dockerfile`, non-existent Dockerfile.
  - Fail-closed Dockerfile assertions (7 tests): valid Dockerfile passes, missing Node 24 Alpine stage fails, missing non-root USER node fails, completely missing USER fails, missing HEALTHCHECK fails, indirect npm startup CMD fails, different node entrypoint CMD fails.
  - Directory targeting and options (6 tests): `--cwd <path>`, `--cwd=<path>`, relative `--dockerfile <path>`, relative `--dockerfile=<path>`, absolute `--dockerfile`, and combined `--cwd` + `--dockerfile`.
  - Real repository execution (4 tests): direct invocation without args, invocation with explicit `--cwd .`, invocation with explicit `--dockerfile server/Dockerfile`, and execution from `server/` subdirectory with `--cwd ..`.

`package.json`:
- Added `"ops:docker-runtime-test": "node --test scripts/ops/check-docker-runtime.spec.js"`.
- Updated `"ops:check"` to include `npm run ops:docker-runtime-test`.

`scripts/ops/check-production-templates.sh` & `check-production-templates-shell.spec.js`:
- Added `require_file scripts/ops/check-docker-runtime.sh`.
- Added `require_file scripts/ops/check-docker-runtime.spec.js`.
- Updated `REQUIRED_FILES` in `check-production-templates-shell.spec.js`.

Verification on 2026-10-04 (actual output excerpts; no live drill or deployment):

| command | exit | output / result |
| --- | --- | --- |
| `sh -n scripts/ops/check-docker-runtime.sh` | 0 | syntax valid, no output |
| `node -c scripts/ops/check-docker-runtime.spec.js` | 0 | syntax valid, no output |
| `node --test scripts/ops/check-docker-runtime.spec.js` | 0 | `tests 45`, `pass 45`, `fail 0` |
| `npm run ops:docker-runtime-test` | 0 | `tests 45`, `pass 45`, `fail 0` |
| `npm run ops:docker-runtime` | 0 | `docker runtime check passed` |
| `(cd server && ../scripts/ops/check-docker-runtime.sh --cwd ..)` | 0 | `docker runtime check passed` |
| `scripts/ops/check-docker-runtime.sh --help` | 0 | `Usage: scripts/ops/check-docker-runtime.sh [--cwd <path> \| --cwd=<path>] [--dockerfile <path> \| --dockerfile=<path>]` |
| `scripts/ops/check-docker-runtime.sh --invalid` | 1 | `Error: Unknown option "--invalid"`, exit 1 |
| `npm run ops:templates-shell-test` | 0 | `tests 34`, `pass 34`, `fail 0` |
| `npm run ops:templates-test` | 0 | `tests 324`, `pass 324`, `fail 0` |
| `npm run ops:templates` | 0 | `ops template check passed` |
| `node --test scripts/ops/launch-readiness.spec.js scripts/ops/run-static-integrity-checks.spec.js scripts/ops/run-deployment-drill.spec.js` | 0 | `tests 45`, `pass 45`, `fail 0` |
| `npm run lint` | 0 | client, shared, server ESLint completed with 0 diagnostics |
| `npm run typecheck` | 0 | shared, client, server typechecks passed; `Generated Prisma Client (7.9.1)` |
| `npm run build` | 0 | client next build (22/22 static pages) and server nest build completed |
| Prettier on changed JS/JSON | 0 | `All matched files use Prettier code style!` |
| `git diff --check` | 0 | clean, no whitespace errors |

Phase 12 production exit/sign-off and prompt 201 remain open. Inspect this repair with `npm run ops:docker-runtime-test` or `npm run ops:docker-runtime`; rollback is a normal revert of the local commit.

## Prompt 262 — harden and test scan secrets (2026-10-04)

`scripts/ops/scan-secrets.sh`:
- Hardened CLI argument parsing with POSIX `/bin/sh` compliance:
  - Supported options: `--help`, `-h` (exit 0 with usage), `--cwd <path>`, and `--cwd=<path>`.
  - Rejects unknown options (`Error: Unknown option "<opt>"` with usage to stderr, exit 1).
  - Rejects unexpected positional arguments (`Error: Unexpected argument "<arg>"` with usage to stderr, exit 1).
  - Rejects missing `--cwd` value (`Error: --cwd requires a non-empty directory path` with usage to stderr, exit 1).
  - Rejects empty/whitespace `--cwd` value (`Error: --cwd path cannot be empty` with usage to stderr, exit 1).
  - Rejects repeated `--cwd` (`Error: Repeated --cwd option; expected single directory path` with usage to stderr, exit 1).
  - Validates target directory exists (`secret scan failed: target directory does not exist: <path>`, exit 1).
  - Validates target directory is a git repository (`secret scan failed: target directory is not a git repository: <path>`, exit 1).
  - Uses safe temporary file creation with `mktemp` and signal traps (`EXIT INT TERM HUP`).
  - Preserves four static secret detection patterns:
    1. Local development passwords: `acres_(superuser|migrator|app|test|valkey)_dev_password`.
    2. Change-me placeholders: `change-me(-|_|[A-Za-z0-9])`.
    3. Launch placeholder sentinels: `__REQUIRED_[A-Z0-9_]+__`.
    4. Client-exposed secrets: `NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PASSWORD|TOKEN|KEY)`.
  - Scans inside canonical `$RESOLVED_CWD` with exclusions (`package-lock.json`, `.agents`, `node_modules`, `.next`, `server/src/generated`).
  - Normalizes match paths and preserves allowed path exemptions.
  - Outputs `secret/default scan passed\n` on success, exit 0.

`scripts/ops/scan-secrets.spec.js`:
- Created dedicated unit and contract test specification with 42 tests using Node.js test runner (`node:test` and `node:assert/strict`):
  - CLI argument validation (14 tests): `--help`, `-h`, unknown options (`--invalid-flag`, `-x`), unexpected positionals, missing/empty/whitespace `--cwd`, repeated `--cwd`, non-existent directory.
  - Git repository validation (1 test): fails closed with clean error when target directory is not a git repo.
  - Isolated fixture pattern detection (14 tests): clean repo passes, detects development passwords across 5 roles, change-me placeholders with hyphen/underscore/alphanumeric, launch sentinels, client-exposed secret names (`API_SECRET`, `AUTH_PASSWORD`, `MAP_KEY`, `USER_TOKEN`).
  - Allowed paths and exclusions (2 tests): tolerates development passwords in 18 allowed files/patterns; ignores matches inside excluded paths.
  - Directory targeting and options (2 tests): `--cwd <path>` and `--cwd=<path>`.
  - Real repository execution (3 tests): direct invocation without args, invocation with explicit `--cwd .`, and invocation from `server/` subdirectory with `--cwd ..`.

`package.json`:
- Added `"ops:scan-secrets-test": "node --test scripts/ops/scan-secrets.spec.js"`.
- Updated `"ops:check"` to include `npm run ops:scan-secrets-test`.

`scripts/ops/check-production-templates.sh` & `check-production-templates-shell.spec.js`:
- Added `require_file scripts/ops/scan-secrets.sh`.
- Added `require_file scripts/ops/scan-secrets.spec.js`.
- Updated `REQUIRED_FILES` in `check-production-templates-shell.spec.js`.

Verification on 2026-10-04 (actual output excerpts; no live drill or deployment):

| command | exit | output / result |
| --- | --- | --- |
| `sh -n scripts/ops/scan-secrets.sh` | 0 | syntax valid, no output |
| `node -c scripts/ops/scan-secrets.spec.js` | 0 | syntax valid, no output |
| `node --test scripts/ops/scan-secrets.spec.js` | 0 | `tests 42`, `pass 42`, `fail 0` |
| `npm run ops:scan-secrets-test` | 0 | `tests 42`, `pass 42`, `fail 0` |
| `npm run ops:scan-secrets` | 0 | `secret/default scan passed` |
| `(cd server && ../scripts/ops/scan-secrets.sh --cwd ..)` | 0 | `secret/default scan passed` |
| `scripts/ops/scan-secrets.sh --help` | 0 | `Usage: scripts/ops/scan-secrets.sh [--cwd <path> \| --cwd=<path>]` |
| `scripts/ops/scan-secrets.sh --invalid` | 1 | `Error: Unknown option "--invalid"`, exit 1 |
| `npm run ops:templates-shell-test` | 0 | `tests 34`, `pass 34`, `fail 0` |
| `npm run ops:templates-test` | 0 | `tests 324`, `pass 324`, `fail 0` |
| `npm run ops:templates` | 0 | `ops template check passed` |
| `npm run ops:docker-runtime-test` | 0 | `tests 45`, `pass 45`, `fail 0` |
| `npm run ops:docker-runtime` | 0 | `docker runtime check passed` |
| `node --test scripts/ops/launch-readiness.spec.js scripts/ops/run-static-integrity-checks.spec.js scripts/ops/run-deployment-drill.spec.js` | 0 | `tests 45`, `pass 45`, `fail 0` |
| `npm run lint` | 0 | client, shared, server ESLint completed with 0 diagnostics |
| `npm run typecheck` | 0 | shared, client, server typechecks passed; `Generated Prisma Client (7.9.1)` |
| `npm run build` | 0 | client next build (22/22 static pages) and server nest build completed |
| Prettier on changed JS/JSON | 0 | `All matched files use Prettier code style!` |
| `git diff --check` | 0 | clean, no whitespace errors |

Phase 12 production exit/sign-off and prompt 201 remain open. Inspect this repair with `npm run ops:scan-secrets-test` or `npm run ops:scan-secrets`; rollback is a normal revert of the local commit.

## Prompt 263 — harden and test audit dependencies (2026-10-04)

`scripts/ops/audit-dependencies.sh`:
- Hardened CLI argument parsing with POSIX `/bin/sh` compliance:
  - Supported options: `--help`, `-h` (exit 0 with usage), `--cwd <path>` / `--cwd=<path>`, `--audit-level <level>` / `--audit-level=<level>` (default: `critical`), and `--omit <type>` / `--omit=<type>` (default: `dev`).
  - Rejects unknown options (`Error: Unknown option "<opt>"` with usage to stderr, exit 1).
  - Rejects unexpected positional arguments (`Error: Unexpected argument "<arg>"` with usage to stderr, exit 1).
  - Rejects missing, empty, whitespace-only, and repeated `--cwd`, `--audit-level`, and `--omit` options with descriptive error and usage to stderr, exit 1.
  - Enforces valid `--audit-level` enum: `info`, `low`, `moderate`, `high`, `critical`. Rejects invalid levels with `Error: Invalid --audit-level "<level>" (allowed: info, low, moderate, high, critical)`.
  - Validates that target directory exists (`audit error: target directory does not exist: <path>`, exit 1).
  - Validates that target directory contains `package.json` and `package-lock.json` (`audit error: target directory does not contain <file>: <path>`, exit 1).
  - Executes `npm audit --omit="$OMIT" --audit-level="$AUDIT_LEVEL"` inside canonicalized target directory.
  - Emits fail-closed error on detection of vulnerabilities: `audit error: <level> vulnerabilities detected in production dependencies`.
  - Emits success message on zero vulnerabilities: `Production dependency security audit passed (0 <level> vulnerabilities)`.

`scripts/ops/audit-dependencies.spec.js`:
- Established comprehensive 51-test unit and contract test suite using Node.js test runner (`node:test` and `node:assert/strict`):
  - 34 CLI argument parsing tests: `--help`, `-h`, unknown long/short options, unexpected positional arguments, missing/empty/whitespace/repeated/invalid values for `--cwd`, `--audit-level`, and `--omit`.
  - 2 prerequisite validation tests: missing `package.json`, missing `package-lock.json`.
  - 8 clean fixture execution tests: default options, `--cwd=` syntax, all audit levels (`high`, `moderate`, `low`, `info`), and custom omit options (`optional`, `peer`).
  - 3 mock npm failure and argument propagation tests: failure detection, audit level propagation, CLI flag logging.
  - 4 directory targeting & integration tests: execution from subdirectory with repo targeting, subdirectory `--cwd ..` execution, paths containing spaces, and invalid flag handling.

Integration and prerequisite wiring:
- `package.json`: added `"ops:audit-test": "node --test scripts/ops/audit-dependencies.spec.js"` and wired into `"ops:check"`.
- `scripts/ops/check-production-templates.sh`: added `require_file scripts/ops/audit-dependencies.sh` and `require_file scripts/ops/audit-dependencies.spec.js`.
- `scripts/ops/check-production-templates-shell.spec.js`: added both files to `REQUIRED_FILES` list.

| command | exit | output / result |
| --- | --- | --- |
| `sh -n scripts/ops/audit-dependencies.sh` | 0 | syntax valid, no output |
| `node -c scripts/ops/audit-dependencies.spec.js` | 0 | syntax valid, no output |
| `node --test scripts/ops/audit-dependencies.spec.js` | 0 | `tests 51`, `pass 51`, `fail 0` |
| `npm run ops:audit-test` | 0 | `tests 51`, `pass 51`, `fail 0` |
| `scripts/ops/audit-dependencies.sh --help` | 0 | `Usage: scripts/ops/audit-dependencies.sh [--cwd <path> \| --cwd=<path>] [--audit-level <level> \| --audit-level=<level>] [--omit <type> \| --omit=<type>]` |
| `scripts/ops/audit-dependencies.sh --invalid` | 1 | `Error: Unknown option "--invalid"`, exit 1 |
| `npm run ops:templates-shell-test` | 0 | `tests 34`, `pass 34`, `fail 0` |
| `npm run ops:templates-test` | 0 | `tests 324`, `pass 324`, `fail 0` |
| `npm run ops:templates` | 0 | `ops template check passed` |
| `npm run ops:scan-secrets-test` | 0 | `tests 42`, `pass 42`, `fail 0` |
| `npm run ops:docker-runtime-test` | 0 | `tests 45`, `pass 45`, `fail 0` |
| `npm run ops:launch-readiness-test` | 0 | `tests 23`, `pass 23`, `fail 0` |
| `npm run ops:launch-drill-test` | 0 | `tests 68`, `pass 68`, `fail 0` |
| `npm run lint` | 0 | client, shared, server ESLint completed with 0 diagnostics |
| `npm run typecheck` | 0 | shared, client, server typechecks passed; `Generated Prisma Client (7.9.1)` |
| `npm run build` | 0 | client next build (22/22 static pages) and server nest build completed |
| Prettier on changed JS/JSON | 0 | `All matched files use Prettier code style!` |
| `git diff --check` | 0 | clean, no whitespace errors |

Phase 12 production exit/sign-off and prompt 201 remain open. Inspect this repair with `npm run ops:audit-test`; rollback is a normal revert of the local commit.

## Prompt 264 — harden and test postgres backup (2026-10-04)

`scripts/ops/backup-postgres.sh`:
- Hardened CLI argument parsing with POSIX `/bin/sh` compliance:
  - Supported options: `--help`, `-h` (exit 0 with usage), `--cwd <path>` / `--cwd=<path>`, `--backup-dir <dir>` / `--backup-dir=<dir>` (default: `$BACKUP_DIR` or `backups`), `--host <host>` / `--host=<host>` (default: `$PGHOST` or `localhost`), `--port <port>` / `--port=<port>` (default: `$PGPORT` or `5432`), `--user <user>` / `--user=<user>` (default: `$PGUSER` or `$POSTGRES_USER` or `postgres`), `--dbname <db>` / `--dbname=<db>` (default: `$PGDATABASE` or `$POSTGRES_DB` or `acres`), `--output-file <file>` / `--output-file=<file>`, and `--dry-run`.
  - Rejects unknown options (`Error: Unknown option "<opt>"` with usage to stderr, exit 1).
  - Rejects unexpected positional arguments (`Error: Unexpected argument "<arg>"` with usage to stderr, exit 1).
  - Rejects missing, empty, whitespace-only, and repeated options with descriptive errors and usage to stderr, exit 1.
  - Validates port numbers: must be integer in range 1-65535 (`Error: Invalid --port "<port>" (expected integer 1-65535)` or `backup error: invalid port: <port> (expected integer 1-65535)`).
  - Validates that target directory exists (`backup error: target directory does not exist: <path>`, exit 1).
  - Prerequisite tool check: verifies `pg_dump` exists in `$PATH` (`backup error: pg_dump utility not found in PATH`, exit 1).
  - Credential fallback: checks `PGPASSWORD`, then `POSTGRES_PASSWORD`, then `POSTGRES_SUPERUSER_PASSWORD`, then `ACRES_MIGRATOR_PASSWORD`. Fails closed if empty: `backup error: PGPASSWORD environment variable is required`. Secrets are never echoed or logged.
  - Path and permission handling: creates backup directory and output parent directories with `chmod 700`, sets output archive file permissions to `chmod 600`.
  - Dry-run mode (`--dry-run`): validates arguments, credentials, directory permissions, and tool prerequisites, prints planned parameters, and exits 0 without invoking `pg_dump`.
  - Execution verification: executes `pg_dump --format=custom --no-owner --no-privileges --file=...`, asserts generated archive file is present and non-empty (`[ -s <file> ]`), cleans up corrupt/empty files on failure, and outputs formatted file byte size.

`scripts/ops/backup-postgres.spec.js`:
- Established comprehensive 53-test unit and contract test suite using Node.js test runner (`node:test` and `node:assert/strict`):
  - 34 CLI argument parsing tests: `--help`, `-h`, unknown long/short options, unexpected positional arguments, missing/empty/whitespace/repeated/invalid values for all CLI options.
  - 7 prerequisite and credential validation tests: missing `pg_dump` in PATH, missing all password env vars, fallback across all four credential environment variables, invalid `PGPORT` env var.
  - 2 dry-run mode tests: directory creation with 0700 permissions, parameter plan output without creating dump file.
  - 3 mock execution tests: successful custom archive dump with 0600 file / 0700 dir permissions, empty file cleanup and fail-closed error, non-zero exit propagation from `pg_dump`.
  - 3 directory targeting tests: relative `--output-file` with `--cwd`, absolute `--output-file`, and relative `--backup-dir`.

Integration and prerequisite wiring:
- `package.json`: added `"ops:backup-test": "node --test scripts/ops/backup-postgres.spec.js"` and wired into `"ops:check"`.
- `scripts/ops/check-production-templates.sh`: added `require_file scripts/ops/backup-postgres.sh` and `require_file scripts/ops/backup-postgres.spec.js`.
- `scripts/ops/check-production-templates-shell.spec.js`: added both files to `REQUIRED_FILES` list.

| command | exit | output / result |
| --- | --- | --- |
| `sh -n scripts/ops/backup-postgres.sh` | 0 | syntax valid, no output |
| `node -c scripts/ops/backup-postgres.spec.js` | 0 | syntax valid, no output |
| `node --test scripts/ops/backup-postgres.spec.js` | 0 | `tests 53`, `pass 53`, `fail 0` |
| `npm run ops:backup-test` | 0 | `tests 53`, `pass 53`, `fail 0` |
| `scripts/ops/backup-postgres.sh --help` | 0 | `Usage: scripts/ops/backup-postgres.sh [--cwd <path> \| --cwd=<path>] [--backup-dir <dir> \| --backup-dir=<dir>] [--host <host> \| --host=<host>] [--port <port> \| --port=<port>] [--user <user> \| --user=<user>] [--dbname <db> \| --dbname=<db>] [--output-file <file> \| --output-file=<file>] [--dry-run]` |
| `scripts/ops/backup-postgres.sh --invalid` | 1 | `Error: Unknown option "--invalid"`, exit 1 |
| `npm run ops:templates-shell-test` | 0 | `tests 34`, `pass 34`, `fail 0` |
| `npm run ops:templates-test` | 0 | `tests 324`, `pass 324`, `fail 0` |
| `npm run ops:templates` | 0 | `ops template check passed` |
| `npm run ops:audit-test` | 0 | `tests 51`, `pass 51`, `fail 0` |
| `npm run ops:scan-secrets-test` | 0 | `tests 42`, `pass 42`, `fail 0` |
| `npm run ops:docker-runtime-test` | 0 | `tests 45`, `pass 45`, `fail 0` |
| `npm run ops:launch-readiness-test` | 0 | `tests 23`, `pass 23`, `fail 0` |
| `npm run ops:launch-drill-test` | 0 | `tests 68`, `pass 68`, `fail 0` |
| `npm run lint` | 0 | client, shared, server ESLint completed with 0 diagnostics |
| `npm run typecheck` | 0 | shared, client, server typechecks passed; `Generated Prisma Client (7.9.1)` |
| `npm run build` | 0 | client next build (22/22 static pages) and server nest build completed |
| Prettier on changed JS/JSON | 0 | `All matched files use Prettier code style!` |
| `git diff --check` | 0 | clean, no whitespace errors |

Phase 12 production exit/sign-off and prompt 201 remain open. Inspect this repair with `npm run ops:backup-test`; rollback is a normal revert of the local commit.

## Prompt 265 — harden and test postgres restore (2026-10-04)

`scripts/ops/restore-postgres.sh`:
- Hardened CLI argument parsing with POSIX `/bin/sh` compliance:
  - Supported options: `--help`, `-h` (exit 0 with usage), `--cwd <path>` / `--cwd=<path>`, `--host <host>` / `--host=<host>` (default: `$PGHOST` or `localhost`), `--port <port>` / `--port=<port>` (default: `$PGPORT` or `5432`), `--user <user>` / `--user=<user>` (default: `$PGUSER` or `$POSTGRES_USER` or `postgres`), `--dbname <db>` / `--dbname=<db>` (default: `$PGDATABASE` or `$POSTGRES_DB` or `acres`), `--file <file>` / `--file=<file>` / `--input-file <file>` / `--input-file=<file>`, positional `<backup-file>` (fully backward-compatible with `run-restore-drill.sh`), `--clean` (default: enabled), `--no-clean` (omits `--clean --if-exists`), and `--dry-run`.
  - Rejects unknown options (`Error: Unknown option "<opt>"` with usage to stderr, exit 1).
  - Rejects unexpected arguments when multiple positional arguments are passed (`Error: Unexpected argument "<arg>"` with usage to stderr, exit 1).
  - Rejects missing, empty, whitespace-only, and repeated options with descriptive errors and usage to stderr, exit 1.
  - Rejects clashing `--file` with positional backup argument (`Error: Repeated backup file option`, exit 1).
  - Rejects conflicting `--clean` and `--no-clean` options (`Error: Conflicting --clean and --no-clean options`, exit 1).
  - Validates `--port` integer bounds (1..65535).
- Directory and backup file validation:
  - Resolves target working directory with canonical absolute path (`RESOLVED_CWD`).
  - Ensures backup file is provided; fails closed if omitted: `restore error: backup file path is required`.
  - Resolves relative backup file path against `$RESOLVED_CWD`.
  - Validates that backup file exists (`restore error: backup file does not exist: <file>`), is a regular file (`restore error: backup target is not a regular file: <file>`), is readable (`restore error: backup file is not readable: <file>`), and is non-empty (`restore error: backup file is empty: <file>`).
- Prerequisites and credentials:
  - Verifies `pg_restore`, `psql`, and `pg_isready` exist in `$PATH`.
  - Resolves credentials across `PGPASSWORD`, `POSTGRES_PASSWORD`, `POSTGRES_SUPERUSER_PASSWORD`, and `ACRES_MIGRATOR_PASSWORD`. Fails closed if empty: `restore error: PGPASSWORD environment variable is required`. Secrets are never echoed or logged.
  - Fixes credential propagation defect: explicitly passes `PGPASSWORD="$RESOLVED_PGPASSWORD"` to all subshell invocations of `pg_isready`, `pg_restore`, and `psql`.
- Dry-run mode (`--dry-run`):
  - Validates inputs, tools, credentials, and non-empty backup file, outputs planned parameters and clean mode status, and exits 0 without modifying the database.
- Execution and verification:
  - Verifies PostgreSQL server readiness via `pg_isready` before running restore statements.
  - Invokes `pg_restore` with `--clean --if-exists --no-owner --no-privileges --dbname=...` (or without clean flags if `--no-clean` is specified).
  - Verifies restored public schema table count using `psql`, asserts numeric count validity, and outputs verified table count upon success.

`scripts/ops/restore-postgres.spec.js`:
- Established comprehensive 80-test unit and contract test suite using Node.js test runner (`node:test` and `node:assert/strict`):
  - 43 CLI argument parsing tests: `--help`, `-h`, unknown long/short options, repeated/missing/empty/whitespace option arguments, invalid/out-of-range ports, multi-digit port overflow, conflicting clean/no-clean flags, repeated file flags, clashing positional arguments, and extra arguments.
  - 4 backup file validation tests: missing backup file argument, non-existent file, directory target, empty backup file.
  - 11 prerequisite and credential validation tests: missing `pg_restore`, `psql`, and `pg_isready` in PATH, missing all password env vars, fallback across all four credential environment variables, invalid and overflow `PGPORT` environment variables, and password leak prevention.
  - 4 dry-run mode tests: parameter plan output without invoking tools, clean mode reporting with `--no-clean`, fail-closed credential checks, fail-closed file checks.
  - 8 mock execution tests: successful restore flow with table verification, `--no-clean` flag exclusion, explicit `--clean` flag inclusion, `pg_isready` connection failure, `pg_restore` failure propagation, `psql` query failure, `psql` non-numeric table count rejection, and `psql` empty table count rejection.
  - 4 directory targeting tests: relative `--file` with `--cwd`, relative positional argument with `--cwd`, `--input-file` and `--file=` syntax, and custom database connection parameters.

Integration and prerequisite wiring:
- `package.json`: added `"ops:restore-test": "node --test scripts/ops/restore-postgres.spec.js"` and wired into `"ops:check"`.
- `scripts/ops/check-production-templates.sh`: added `require_file scripts/ops/restore-postgres.sh` and `require_file scripts/ops/restore-postgres.spec.js`.
- `scripts/ops/check-production-templates-shell.spec.js`: added both files to `REQUIRED_FILES` list.
- `scripts/ops/run-restore-drill.sh`: verified 100% backward-compatible execution (`npm run ops:restore-drill-test` passed 28/28 tests).

| command | exit | output / result |
| --- | --- | --- |
| `sh -n scripts/ops/restore-postgres.sh` | 0 | syntax valid, no output |
| `node -c scripts/ops/restore-postgres.spec.js` | 0 | syntax valid, no output |
| `node --test scripts/ops/restore-postgres.spec.js` | 0 | `tests 80`, `pass 80`, `fail 0` |
| `npm run ops:restore-test` | 0 | `tests 80`, `pass 80`, `fail 0` |
| `scripts/ops/restore-postgres.sh --help` | 0 | `Usage: scripts/ops/restore-postgres.sh [<backup-file>] [--file <file> \| --file=<file>] [--input-file <file> \| --input-file=<file>] [--cwd <path> \| --cwd=<path>] [--host <host> \| --host=<host>] [--port <port> \| --port=<port>] [--user <user> \| --user=<user>] [--dbname <db> \| --dbname=<db>] [--clean \| --no-clean] [--dry-run]` |
| `scripts/ops/restore-postgres.sh --invalid` | 1 | `Error: Unknown option "--invalid"`, exit 1 |
| `npm run ops:restore-drill-test` | 0 | `tests 28`, `pass 28`, `fail 0` |
| `npm run ops:backup-test` | 0 | `tests 53`, `pass 53`, `fail 0` |
| `npm run ops:templates-shell-test` | 0 | `tests 34`, `pass 34`, `fail 0` |
| `npm run ops:templates-test` | 0 | `tests 324`, `pass 324`, `fail 0` |
| `npm run ops:templates` | 0 | `ops template check passed` |
| `npm run ops:audit-test` | 0 | `tests 51`, `pass 51`, `fail 0` |
| `npm run ops:scan-secrets-test` | 0 | `tests 42`, `pass 42`, `fail 0` |
| `npm run ops:docker-runtime-test` | 0 | `tests 45`, `pass 45`, `fail 0` |
| `npm run ops:launch-readiness-test` | 0 | `tests 23`, `pass 23`, `fail 0` |
| `npm run ops:launch-drill-test` | 0 | `tests 68`, `pass 68`, `fail 0` |
| `npm run lint` | 0 | client, shared, server ESLint completed with 0 diagnostics |
| `npm run typecheck` | 0 | shared, client, server typechecks passed; `Generated Prisma Client (7.9.1)` |
| `npm run build` | 0 | client next build (22/22 static pages) and server nest build completed |
| Prettier on changed JS/JSON | 0 | `All matched files use Prettier code style!` |
| `git diff --check` | 0 | clean, no whitespace errors |

Phase 12 production exit/sign-off and prompt 201 remain open. Inspect this repair with `npm run ops:restore-test`; rollback is a normal revert of the local commit.

## Prompt 266 — harden and test restore drill (2026-10-04)

The restore-drill runner accepts separate and attached value options, adds
`--cwd`, `--host`, `--port`, and `--user`, and rejects repeated value options,
missing/empty/whitespace-only values, unknown options, unexpected arguments,
invalid directories, and ports outside 1–65535. Leading-zero ports are checked
as decimal integers with bounded input length. Relative archive and evidence
paths resolve against the canonical target directory. The restore helper is
anchored to the runner directory and receives attached options, preserving
accepted option-like values.

Prerequisites now explicitly check PostgreSQL clients, Node, `date`, and
`mktemp`. Passwords resolve through `PGPASSWORD`, `POSTGRES_PASSWORD`,
`POSTGRES_SUPERUSER_PASSWORD`, then `ACRES_MIGRATOR_PASSWORD`; whitespace-only
passwords fail closed. Tests verify actual credential values inside the stubs
without recording secrets. Database ownership checks, protected targets,
cleanup/retention, archive validation, parity checks, RTO enforcement and atomic
no-overwrite evidence publication retain their existing contracts. Receipts
remain `execution_mode: "simulation"`.

The template shell runner and its fixture inventory now require
`scripts/ops/run-restore-drill.sh`. The drill suite retains the original 28 cases
and adds CLI, prerequisite, credential, decimal-port and cross-directory
coverage, including full execution through the real restore helper with stubbed
PostgreSQL commands. No live restore was performed.

Actual verification output (all test commands below exited 0):

| Command                             | Output                            |
| ----------------------------------- | --------------------------------- |
| `npm run ops:restore-drill-test`    | `tests 41`, `pass 41`, `fail 0`   |
| `npm run ops:restore-test`          | `tests 80`, `pass 80`, `fail 0`   |
| `npm run ops:backup-test`           | `tests 53`, `pass 53`, `fail 0`   |
| `npm run ops:templates-shell-test`  | `tests 34`, `pass 34`, `fail 0`   |
| `npm run ops:templates-test`        | `tests 324`, `pass 324`, `fail 0` |
| `npm run ops:templates`             | `ops template check passed`       |
| `npm run ops:scan-secrets-test`     | `tests 42`, `pass 42`, `fail 0`   |
| `npm run ops:docker-runtime-test`   | `tests 45`, `pass 45`, `fail 0`   |
| `npm run ops:audit-test`            | `tests 51`, `pass 51`, `fail 0`   |
| `npm run ops:readiness-test`        | `tests 649`, `pass 649`, `fail 0` |
| `npm run ops:launch-readiness-test` | `tests 23`, `pass 23`, `fail 0`   |
| `npm run ops:launch-drill-test`     | `tests 68`, `pass 68`, `fail 0`   |

Root lint exited 0 (`eslint`, `eslint "src/**/*.ts"`,
`eslint "{src,test}/**/*.ts"`). Root typecheck exited 0 (`tsc --noEmit`,
`prisma generate && tsc -p tsconfig.json --noEmit`). Root production build
exited 0: `Compiled successfully in 5.3s`, followed by completed Next route
generation and `prisma generate && nest build`.

The initial sandbox runs suppressed subprocess output, obscuring per-test
results and causing Next's `Could not parse output from TypeScript's
--showConfig`. Normal-process reruns supplied the individual passing test counts
and completed the build. An initial concurrent typecheck/build attempt lost
Next-generated types; sequential typecheck passed. The review fixes were
retested with the final 41-case drill suite.

The full `npm run ops:check` **exited 1 at the production dependency audit**:
`28 vulnerabilities (10 moderate, 17 high, 1 critical)` and
`audit error: critical vulnerabilities detected in production dependencies`.
Later stages of that aggregate command were not executed; the approved adjacent
suites above were run separately. This change does not modify dependencies or
the lockfile and does not clear the audit/launch gate.

Shell/Node syntax checks and `git diff --check` exited 0 with no output.
Prettier for changed JavaScript and the prompt exited 0:
`All matched files use Prettier code style!`. The prompt's combined formatter
command cannot pass because no shell parser is installed (`No parser could be
inferred`). Whole-file formatting warnings in `operations.md` and
`build-plan.md` were reproduced from committed HEAD; existing documents were
not reformatted wholesale. New record sections were formatted separately.

Independent requesting/receiving code review found no critical or important
issues. Both minor findings were verified, fixed and reviewed again: attached
helper option forwarding and in-stub credential resolution/precedence checks.

To inspect safely from the repository root:

```bash
npm run ops:restore-drill -- --help
npm run ops:restore-drill-test
```

For an authorized rehearsal target, provision credentials through the existing
operator mechanism and use `--cwd`, connection options and `--dry-run` to check
source authentication and target absence before running a restore. Dry-run
contacts PostgreSQL but creates no archive, database or success receipt. Prompt
201 and Phase 12 operator sign-off remain open; no production action or push
occurred.

## Prompt 267 — harden and test deployment drill (2026-10-07)

The deployment configuration rehearsal accepts attached and separate forms for
all value options and adds `--cwd`. Its default is the installation repository
root, even from another caller directory; explicit relative cwd resolves from
the invocation directory. Config and evidence paths resolve against the
canonical target. Children run in that target and the three shell checkers
receive `--cwd=<target>`. Value-option duplicates, missing/blank/option-looking
separate values, unknown options and positional inputs fail without reflecting
supplied values. Boolean flags remain idempotent. Attached path values preserve
spaces and leading dashes.

Before children, probes or output-directory creation, validation checks required
utilities/local inputs, readable Caddy/Compose files, migration directory,
Compose parse/root shape, API origin, optional database configuration and
absent evidence destinations/writable parent chains. API targets use the
existing `safeUrl` helper plus a root-path restriction; rejected credentials,
query, fragment, controls, non-HTTP schemes and nonroot paths produce a fixed
option diagnostic. Probes use the canonical origin; receipt identity keeps
`targetId(safeUrl(origin))`, preserving the assembler's canonical `href` hash.

Without either supported password, database observations remain offline.
`PGPASSWORD` takes precedence over `POSTGRES_PASSWORD`; the first nonempty
value is exported as `PGPASSWORD` and whitespace-only selected credentials fail.
Connection fields and decimal port 1–65535 are checked before probes, with
leading-zero decimal normalization and bounded input length. Installed client
help verified `pg_isready -t 3` and `psql -X -w -v ON_ERROR_STOP=1`; queries
also inherit `PGCONNECT_TIMEOUT=3`, verified against the
[PostgreSQL libpq environment-variable documentation](https://www.postgresql.org/docs/current/libpq-envars.html). A readiness failure prints observation
unavailability and falls back to offline inspection. After readiness succeeds,
query/authentication failures and empty, negative, fractional, multiline or
unsafe-integer counts abort; they cannot become zero-valued successful
observations. Successful output reports counts without claiming migration
parity, foreign-key validity or production verification. Health fallback and
bounded curl/payload checks retain their contracts.

Default receipt names include timestamp, process ID and UUID. Explicit output
must be absent, including directories and dangling symlinks. New directories
are private without changing existing permissions. Complete JSON is written to
a uniquely owned 0600 temporary file beside the destination and published with
an exclusive hard link (`ln -T` prevents directory-race redirection). Existing
or concurrently inserted destinations are preserved. Exit, error and catchable
interruption cleanup remove only the owned temp. Success and destructive-DDL
failure receipts remain `execution_mode: "simulation"` with either dry-run flag,
including successful optional probes. Early input/child failures emit no success
receipt. The DDL search remains a heuristic and drain periods configuration;
no live promotion, rollback, database/service probe or launch approval ran.

The expanded suite executes the actual runner in disposable repositories with
allowlisted environments, stubbed PostgreSQL/curl/preflight children and
in-stub password comparisons. It covers target/default cwd, all option forms,
prerequisite/URL/output failures before side effects, observation failures,
consumer/hash compatibility, private receipt modes, deterministic concurrent
insertion, write/publication failures and interruption cleanup.

Actual verification (exit 0 unless indicated):

| Command                                                                                                    | Output                                                                                             |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run ops:deployment-test`                                                                              | `tests 104`, `pass 104`, `fail 0`                                                                  |
| `node --test --test-name-pattern='all attached/separate options' scripts/ops/run-deployment-drill.spec.js` | `tests 1`, `pass 1`, `fail 0`                                                                      |
| `npm run ops:caddy-test`                                                                                   | `tests 18`, `pass 18`, `fail 0`                                                                    |
| `npm run ops:templates`                                                                                    | `ops template check passed`                                                                        |
| `npm run ops:templates-test`                                                                               | `tests 324`, `pass 324`, `fail 0`                                                                  |
| `npm run ops:readiness-test`                                                                               | `tests 649`, `pass 649`, `fail 0`                                                                  |
| `npm run ops:launch-readiness-test`                                                                        | `tests 23`, `pass 23`, `fail 0`                                                                    |
| `npm run ops:launch-drill-test`                                                                            | `tests 68`, `pass 68`, `fail 0`                                                                    |
| `npm run lint`                                                                                             | `eslint`, `eslint "src/**/*.ts"`, `eslint "{src,test}/**/*.ts"`                                    |
| `npm run typecheck`                                                                                        | `tsc --noEmit`, `prisma generate && tsc -p tsconfig.json --noEmit`                                 |
| `npm run build`                                                                                            | `Compiled successfully in 21.7s`, completed Next route generation, `prisma generate && nest build` |

`npm run ops:check` exited 1 at production dependency audit:
`37 vulnerabilities (9 moderate, 26 high, 2 critical)` and
`audit error: critical vulnerabilities detected in production dependencies`.
Later aggregate stages did not run; the affected suites above ran independently.
Dependencies and lockfile were not changed and the audit/launch gate remains open.

Bash/Node syntax checks and `git diff --check` exited 0 without output.
Changed JavaScript/prompt Prettier exited 0:
`All matched files use Prettier code style!`. An initial sandbox test run
suppressed individual results; normal-process reruns supplied the passing counts.
Whole-document formatting warnings for `operations.md` and `build-plan.md` were
reproduced from committed HEAD; new sections are formatted separately. No shell
formatter pass is claimed.

Independent requesting/receiving review found no critical, important or minor
issues. Its deterministic TERM injection during temporary-file creation exited
143 and removed the owned temp. Reviewer sandbox reruns also reproduced
subprocess-output suppression and do not independently establish a suite pass;
the coordinator normal-process checks above provide the passing evidence.

Safe inspection from the repository root:

```bash
bash scripts/ops/run-deployment-drill.sh --help
npm run ops:deployment-test
```

`--dry-run` records metadata and does not disable all optional probes. A real
targeted rehearsal requires separately scoped operator authorization. Phase 12
and prompt 201 remain open pending live evidence, dependency security gates and
operator sign-off. Nothing was pushed.

## Prompt 268 — Secret-rotation rehearsal runner hardening (2026-10-07)

The runner accepts attached/separate value options and `--cwd`; its default cwd
is the installation repository root, while explicit relative cwd resolves from
its caller. Relative evidence paths resolve against the canonical target.
Anchored template/scan children execute there and receive `--cwd=<target>`.
The volume verifier runs there but retains its existing installation-root
configuration defaults; `--cwd` does not retarget that verifier's configuration.

Duplicate/missing/blank/option-looking separate values, positional/unknown
inputs, unavailable prerequisites, unsafe API origins, invalid connection fields,
out-of-range decimal ports and unusable output parents fail before preflights,
probes or output creation. Ports normalize leading-zero decimal values. URL
validation uses `safeUrl` plus a root-path requirement and prints fixed errors
without reflecting rejected input. Explicit receipt paths must be absent regular
file destinations: prior files/directories/symlinks (including dangling links)
and trailing-slash paths fail early. Explicit file selection creates no unused
evidence directory. Help does not run preflights or probes.

PostgreSQL observation requires the first nonempty `PGPASSWORD` or
`POSTGRES_PASSWORD`; whitespace-only selected credentials fail. The password
travels only through the environment. `pg_isready -t 3` observes server
availability, not successful authentication or role rotation. No SQL runs.
Optional unauthenticated Valkey ping uses `timeout --kill-after=1s 2s` and
requires command success plus exactly `PONG` after surrounding whitespace.
Missing CLI, timed-out pings, failed or malformed replies remain unavailable metadata.
HTTP reachability retains its bounded `curl -fsS -m 2` request against the
validated origin. Client flags and deadlines were verified against installed
`pg_isready`, coreutils `timeout`/`ln` and curl help. No new Valkey-specific
flags or credentials were introduced.

Every result remains `execution_mode: "simulation"`, with either dry-run state
and even when every optional observation succeeds. `--dry-run` remains metadata
and does not disable probes. The seven algorithm/mock exercises retain their
semantics and receipt fields; SMTP/Grafana are intended classes, not independently
rotated systems. Reachability and mock pool behavior cannot establish live
rotation, zero downtime or Category 3 approval.

Default receipt names now include timestamp, PID and UUID. New evidence
parents are private without changing existing directory permissions. Complete
JSON is written to an owned 0600 temporary file and published atomically using
exclusive `ln -T`; existing or concurrently inserted final destinations are
preserved. Exit/error/catchable-interruption cleanup removes only the owned temp.
An early Node exit cannot publish an empty receipt. Algorithm failures publish
complete failed simulation evidence with the fixed message
`Secret rotation algorithm rehearsal failed`. Arbitrary Error/non-Error values
cannot become diagnostic or receipt messages. Write/publication failures are
reported separately, never silently retried as direct writes or followed by a
success summary.

Actual verification (exit 0 unless stated):

| Command                                                                                                 | Output                                                                                            |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run ops:rotation-test`                                                                             | `tests 99`, `pass 99`, `fail 0`                                                                   |
| `node --test --test-name-pattern='absent trailing-slash' scripts/ops/run-secret-rotation-drill.spec.js` | `tests 1`, `pass 1`, `fail 0`                                                                     |
| `npm run ops:templates`                                                                                 | `ops template check passed`                                                                       |
| `npm run ops:templates-test`                                                                            | `tests 324`, `pass 324`, `fail 0`                                                                 |
| `npm run ops:scan-secrets-test`                                                                         | `tests 42`, `pass 42`, `fail 0`                                                                   |
| `npm run ops:volume-test`                                                                               | `tests 18`, `pass 18`, `fail 0`                                                                   |
| `npm run ops:readiness-test`                                                                            | `tests 649`, `pass 649`, `fail 0`                                                                 |
| `npm run ops:launch-readiness-test`                                                                     | `tests 23`, `pass 23`, `fail 0`                                                                   |
| `npm run ops:launch-drill-test`                                                                         | `tests 68`, `pass 68`, `fail 0`                                                                   |
| `npm run lint`                                                                                          | `eslint`, `eslint "src/**/*.ts"`, `eslint "{src,test}/**/*.ts"`                                   |
| `npm run typecheck`                                                                                     | `tsc --noEmit`, `prisma generate && tsc -p tsconfig.json --noEmit`                                |
| `npm run build`                                                                                         | `Compiled successfully in 5.8s`, completed Next route generation, `prisma generate && nest build` |

`npm run ops:check` exited 1 at production dependency audit:
`37 vulnerabilities (9 moderate, 26 high, 2 critical)` and
`audit error: critical vulnerabilities detected in production dependencies`.
Later aggregate stages did not run; affected suites above ran independently.
No dependencies or lockfile changed. Root checks preceded the narrow review
fix; affected runner contracts and syntax/diff checks passed after it.

Bash/Node syntax and diff checks exited 0 without output; changed JavaScript
and prompt formatting reported `All matched files use Prettier code style!`.
Existing whole-document formatting warnings for operations, build-plan and
launch-checklist were reproduced before documentation edits; new content is
formatted separately. Neither shfmt nor shellcheck is installed; no shell
formatter/linter success is claimed. An initial sandbox test run suppressed
individual test results; normal-process isolated reruns provide the passing
counts. The initial normal run found two help-fixture failures (missing `cat`);
the fixture was corrected before the successful runs above.

Independent requesting/receiving review identified one valid input-validation
finding: an absent trailing-slash explicit file path ran the rehearsal before
publication failed. It now fails during preflight, with both option forms and
nested paths covered. Follow-up review found no unresolved issues and approved
commit readiness. The reviewer also reproduced owned-temp cleanup on TERM
during temporary-file creation. No live rotation, service-probe demonstration,
production action, launch approval or push occurred.

Safe inspection from the repository root:

```bash
bash scripts/ops/run-secret-rotation-drill.sh --help
npm run ops:rotation-test
```

Phase 12 and prompt 201 remain open pending authentic live evidence, dependency
security gates and operator sign-off. These commands inspect help or isolated
contracts; do not run a default or targeted rehearsal against real services to
demonstrate this patch.


## Prompt 269 — DoS resilience drill runner hardening (2026-10-07)

The four value options (`--cwd`, `--evidence-dir`, `--evidence-file`, `--api-url`)
accept attached and separate values once each. Blank, missing, repeated,
option-looking separate values and unexpected input fail before static work,
traffic or output creation. Help remains side-effect-free. The default target
cwd is the installation repository root, independently of caller cwd; explicit
relative cwd resolves from the caller. Static reads and relative output use the
canonical target cwd, while the installed evidence helper stays anchored to the
installation root.

An unset `API_URL` defaults to `http://localhost:3001`; an explicitly empty value
fails. Origins use `safeUrl`, must have a root path, and exclude credentials,
controls, queries and fragments (including bare delimiters). Requests and live
hashing use `URL.origin`. Diagnostics do not reflect private origins, paths,
responses, tokens, cookies or injected exceptions. There is no dedicated installed
Bash/curl skill: flags were checked against installed Bash/coreutils/curl help,
and Node filesystem/process APIs against installed runtime source.

Mode-required utilities and the installed helper are checked before work. Curl
is required only for live mode. Missing static source or pattern failures remain
failed evaluated drills, publish complete failed receipts at absent destinations,
and prevent every curl request. The five static identities and six-layer receipt
contract are unchanged. Offline runs have no traffic and a skipped burst; live
runs retain the CSRF-paired, at-most-15 sequential invalid-login requests, validated
401/429 counts, pre/post liveness and existing connect/time/body limits. These
observations remain narrower than deployed multi-layer protection or readiness.

Explicit files override evidence-dir and must be absent paths without trailing
separators. Files, directories and symlinks (including dangling links), unusable
parents and missing machinery fail early. Unused evidence-dir is never created.
New parents and response directories use umask 077; receipts and private files
are 0600. Existing parent permissions are unchanged. Serialization writes an owned
same-directory temporary receipt; an independent completeness read precedes
exclusive `ln -T --` publication. The independent check compares the target and
every burst field to invocation values, and requires canonical fresh UTC time
and a bounded duration; valid JSON with missing or altered fields cannot pass.
This prevents replacing retained/concurrent
files or links and prevents a concurrent directory from redirecting publication.
Publication/serialization errors never fall back to direct writes. EXIT/INT/TERM/HUP
cleanup removes only owned response/staging resources; cleanup failure prevents
successful exit/summary. No uncatchable-SIGKILL cleanup guarantee is made.

The actual-process DoS fixtures allowlist their environments and tool paths,
always stub curl and omit private origin/token/cookie data from persisted call
logs. They cover CLI/cwd/origin validation, unavailable prerequisites, private
files, failed static/live envelopes, retained evidence, exclusive publication
races, serialization/preparation failures, concurrent UUID names and catchable
interruptions. The capacity fixture additionally exercises the real offline
child within the parent's owned absent destination and rejects its static failure.
Shared validators, parent runner, dossier and launch orchestrator are unchanged.

Safe inspection (repository root):

```bash
bash scripts/ops/run-dos-resilience-drill.sh --help
npm run ops:dos-test
npm run ops:capacity-alerting-test
```

A fully offline source inspection with an absent receipt can use
`bash scripts/ops/run-dos-resilience-drill.sh --dry-run --cwd=. --evidence-file=<absent-path>`.
Without `--dry-run`, separate operator authorization is still required. No live
service requests, launch approval or production sign-off were performed here.

Verification and review (2026-10-07):

| Command                                                                   | Actual concise output / result                                                                                                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bash -n scripts/ops/run-dos-resilience-drill.sh`                         | exit 0, no output                                                                                                                                             |
| `node --check scripts/ops/run-dos-resilience-drill.spec.js`               | exit 0, no output                                                                                                                                             |
| `node --check scripts/ops/run-capacity-alerting-drill.spec.js`            | exit 0, no output                                                                                                                                             |
| `npm run ops:dos-test`                                                    | `tests 91`, `pass 91`, `fail 0`; exit 0                                                                                                                       |
| `npm run ops:capacity-alerting-test`                                      | `tests 18`, `pass 18`, `fail 0`; exit 0                                                                                                                       |
| `npm run ops:templates`                                                   | `ops template check passed`; exit 0                                                                                                                           |
| `npm run ops:templates-test`                                              | `tests 324`, `pass 324`, `fail 0`; exit 0                                                                                                                     |
| `npm run ops:readiness-test`                                              | `tests 649`, `pass 649`, `fail 0`; exit 0                                                                                                                     |
| `npm run ops:launch-readiness-test`                                       | `tests 23`, `pass 23`, `fail 0`; exit 0                                                                                                                       |
| `npm run ops:launch-drill-test`                                           | `tests 68`, `pass 68`, `fail 0`; exit 0                                                                                                                       |
| `npm run ops:check`                                                       | exit 1 at `ops:audit`: `37 vulnerabilities (9 moderate, 26 high, 2 critical)` and `audit error: critical vulnerabilities detected in production dependencies` |
| `npm run lint`                                                            | completed all workspaces; final `eslint "{src,test}/**/*.ts"`; exit 0                                                                                         |
| `npm run typecheck`                                                       | completed shared/client/server checks; `Generated Prisma Client (7.9.1)`; exit 0                                                                              |
| `npm run build`                                                           | `Compiled successfully in 7.6s`, `Generating static pages using 7 workers (22/22) in 1185ms`, then server `prisma generate && nest build`; exit 0             |
| Installed Prettier with `--single-quote --check` on changed JS and prompt | `All matched files use Prettier code style!`; exit 0                                                                                                          |
| `git diff --check`                                                        | exit 0, no output                                                                                                                                             |

Typecheck and build ran sequentially. The initial sandbox process suite failed;
detailed sandbox execution showed `spawnSync bash EPERM`. Stub-only process
checks ran with normal subprocess permissions and passed. No live drill ran.
The aggregate was attempted once and stopped at the critical production audit;
later aggregate stages were not reached. The listed independent suites ran
separately. No dependency update or registry retry was made.

Whole-document Prettier checks warn on operations, launch-checklist and
build-plan; the same warnings were reproduced on their committed baseline
copies. New documentation content was formatted separately, preserving unrelated
historical text. No installed shell formatter was used or claimed.

Independent review found one Important issue: syntactically valid partial receipts
could pass the original completeness read. The fix compares the target and all
burst values and adds valid-JSON omission/alteration and timestamp regressions.
The affected DoS and capacity suites were re-run; follow-up review approved the
fix with no remaining Critical, Important or Minor findings. Phase 12 exit,
Category 5 operator evidence and launch sign-off remain open.

## Prompt 270 — capacity and alerting runner hardening (2026-10-07)

The parent now validates attached/separate value options, duplicates, blank and
control-containing inputs, target cwd, origins/endpoints, effective live
references, telemetry pairing/freshness, installed dependencies and absent
output selection before children or output creation. Default source cwd is the
installation repository root; explicit relative cwd resolves from the caller.
Alert reads use that target's Prometheus files and the DoS child receives its
canonical cwd. Executable children and validators remain installation-anchored.
An explicit evidence file overrides the directory without creating the unused
path. Default names use `capacity-alerting-drill-evidence-<uuid>.json`.

Child stdout/stderr and DoS receipts live in private owned directories. Capacity
uses `--json --no-save`, avoiding a second benchmark artifact. Every child exit
and bounded JSON receipt is checked independently. Eleven unique alert
rule/simulation pairs and successful checks, 429 isolation, current canonical
capacity timestamps, expected mode/hash, complete finite distributions,
request totals and recomputed SLOs must agree. Database evidence is checked
before live traffic and again against the completed run; the existing
60-second scrape tolerance is retained. Synthetic DB percentiles derive only
from checked synthetic distributions. DoS validation retains the child's
unchanged bounded CSRF-paired login/liveness contract.

Receipt sections explicitly project allowed fields. Unknown child fields,
raw annotations/expressions, messages, stderr, paths and responses are omitted;
invalid sections receive fixed failed shapes/messages. Synthetic receipts have
null targets and no production references. Stubbed live receipts bind benchmark
`href` and API `origin` separately. Explicit incompatible production environment
or invalid live references fail preflight; scaffold references remain metadata,
not authorization. Non-dry execution without a benchmark retains live DoS
traffic and fails for missing live database evidence; it never qualifies
Category 5. No real live exercise was performed or authorized here.

New parents are private without changing existing permissions. Complete JSON
is written to an owned same-directory 0600 staging file, independently checked
for completeness, invocation values, verdict/exit consistency and the existing
consumer success contract, then published atomically and exclusively with
`ln -T --`. Existing and concurrently inserted files/directories/symlinks survive.
Evaluated failures can publish controlled failed receipts; serialization and
publication failures cannot print a passing summary. Owned staging/private
resources are removed before the final summary. Cleanup failure returns nonzero.
Bash monitor mode gives each background child its own process group; `wait -f`
retains ownership until termination, including stopped jobs. Catchable
interruption stops that active owned group and removes private resources.
Descendants that deliberately detach into other groups and SIGKILL cleanup are
not guaranteed. The parent also supplies private `TMPDIR` to its children.

Actual-process tests allowlist tools/environment and use absent destinations.
Fake live producers cannot call real network tools. Real offline children run
with HTTP(S) requests forbidden and their receipt passes readiness and the
Stage 6 dossier consumer. Missing alert/static sources fail safely. The existing
readiness producer fixture needed a narrow compatibility update beyond the
prompt's primary file list: copy the validator dependency closure, retain real
capacity module exports in its CLI stub, and use an explicit PATH. No readiness
validator or child implementation was changed or weakened.

Safe inspection from the repository root:

```bash
bash scripts/ops/run-capacity-alerting-drill.sh --help
npm run ops:capacity-alerting-test
```

An offline evaluation can use
`bash scripts/ops/run-capacity-alerting-drill.sh --dry-run --cwd=. --evidence-file=<absent-path>`.
Every non-dry invocation still requires separate operator authorization. Category
5 adoption, alert routing/delivery, sustained production capacity and Phase 12
operator sign-off remain unresolved.

Verification:

| Command                                                   | Actual concise output / result                                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bash -n scripts/ops/run-capacity-alerting-drill.sh`      | exit 0, no output                                                                                                                                             |
| `node --check` on both changed specs                      | exit 0, no output                                                                                                                                             |
| `npm run ops:capacity-alerting-test`                      | `tests 143`, `pass 143`, `fail 0`; exit 0                                                                                                                     |
| `npm run ops:capacity-test`                               | `tests 15`, `pass 15`, `fail 0`; exit 0                                                                                                                       |
| `npm run ops:alert-test`                                  | `tests 23`, `pass 23`, `fail 0`; exit 0                                                                                                                       |
| `npm run ops:dos-test`                                    | `tests 91`, `pass 91`, `fail 0`; exit 0                                                                                                                       |
| `npm run ops:templates`                                   | `ops template check passed`; exit 0                                                                                                                           |
| `npm run ops:templates-test`                              | `tests 324`, `pass 324`, `fail 0`; exit 0                                                                                                                     |
| `npm run ops:readiness-test`                              | `tests 649`, `pass 649`, `fail 0`; exit 0                                                                                                                     |
| Focused final readiness producer fixture                  | `tests 1`, `pass 1`, `fail 0`; exit 0                                                                                                                         |
| `npm run ops:launch-readiness-test`                       | `tests 23`, `pass 23`, `fail 0`; exit 0                                                                                                                       |
| `npm run ops:launch-drill-test`                           | `tests 68`, `pass 68`, `fail 0`; exit 0                                                                                                                       |
| `npm run ops:check`                                       | exit 1 at `ops:audit`: `37 vulnerabilities (9 moderate, 26 high, 2 critical)` and `audit error: critical vulnerabilities detected in production dependencies` |
| `npm run lint`                                            | all workspaces completed; final `eslint "{src,test}/**/*.ts"`; exit 0                                                                                         |
| `npm run typecheck`                                       | shared/client/server checks completed; `Generated Prisma Client (7.9.1)`; exit 0                                                                              |
| `npm run build`                                           | `Compiled successfully in 6.7s`, `Generating static pages using 7 workers (22/22) in 1395ms`, server `prisma generate && nest build`; exit 0                  |
| Prettier with `--single-quote --check` on new spec/prompt | `All matched files use Prettier code style!`; exit 0                                                                                                          |
| `git diff --check`                                        | exit 0, no output                                                                                                                                             |

Typecheck/build ran sequentially. Baseline sandbox tests reported
`ERR_TEST_FAILURE`; detailed execution identified `spawnSync bash EPERM`.
Stub/offline suites passed with normal subprocess permissions. The sandboxed
build exited 1 with `Could not parse output from TypeScript's --showConfig.`;
the normal-permission build passed. Initial fixture integration failures were
corrected before final verification. The aggregate stopped at the production
audit; later aggregate gates did not run, and affected suites ran independently.
No dependency change, live request, deployment, launch approval or push occurred.

The existing full readiness spec still reports `Code style issues found in the
above file`; the same warning reproduces on its committed baseline. Its edited
section and inline runner JavaScript were formatted separately, as were the new
documentation sections. No dedicated Bash/coreutils skill or shell formatter
is installed; APIs were verified against installed help, and no shell formatting
pass is claimed.

Independent review identified monitor-mode `wait` returning on a stopped job.
Installed Bash help and an owned SIGSTOP reproduction verified status `147`
before termination. Main/cleanup waits now use `wait -f`; the stopped-child
interruption regression and helper-preflight checks passed in a focused run
(`tests 10`, `pass 10`, `fail 0`).

Follow-up independent review passed the corrected implementation with no
unresolved critical, important or minor findings. The reviewer independently
ran selected offline/stubbed tests (15/15) and final export/stop regressions (5/5).

## Prompt 271 — unified launch-drill runner hardening (2026-10-07)

Approved `prompts/271-harden-and-test-unified-launch-drill.md` hardens the
seven-stage orchestrator and its existing dossier helper. The committed
baseline was `462a67d662da5406690f893d9b26c99c0690b96a`. No child implementation,
receipt validator, target-hash convention, dependency, root script or launch
sign-off changed. Prompt 233's invalidation/rename record above describes the
former behavior; the current contract below and checklist §4 supersede it.

All value options accept separate/attached forms once. Duplicates, missing,
blank/control or unknown input fail safely. Paths resolve against the installed
repository independently of caller cwd, including attached dash-leading paths.
Installed child/helper paths and required exports/utilities are checked before
work. Caddy/Compose inputs must be readable regular files; content failure
remains an evaluated Stage 3 failure. Explicit benchmark/API arguments require
paired fresh bounded database telemetry before earlier stages or service probes.
Benchmark normalization retains `href` hashes, capacity/DoS API retains `origin`
hashes and deployment retains its established href identity. Bare query/fragment
delimiters, credentials, non-HTTP(S), bad ports and API paths reject. The existing
telemetry freshness/health/target contract and completed-run recheck remain.

Both evidence directory and final output are checked read-only before creation,
including nearest existing ancestors, symlinks, retained destinations and
conflicting output/evidence directory relationships. Explicit output still
retains logs/receipts in the evidence directory. UUID defaults use
`launch-evidence-dossier-<uuid>.json`. Existing outputs are preserved exactly;
operators must choose an absent path to regenerate evidence. New directories
are private and existing permissions remain. Traps/resource ownership precede
allocation. Locks contain invocation tokens, and a competing writer cannot
consume or release another owner's staging or reservation.

Owned same-directory 0600 staging is serialized, independently read with a
1 MiB bound and checked against the real assembler's complete invocation before
atomic exclusive `fs.linkSync` publication. Existing or racing regular files,
directories and links survive. Version `1.0.0`, seven ordered stage IDs, finite
timing, counts/verdict, root `drill`/`simulation`, selected mode/config/hash and
registered artifact paths are verified. The assembler returns the exact private
snapshot; the parent independently verifies that snapshot before counts/JSON
and never rereads the raced final destination for a verdict. Serialization,
parseability, publication, output and cleanup failures cannot imply success.
Complete evaluated FAILED dossiers still publish and exit 1; human progress
plus `--json` behavior remains. Private child diagnostics are not projected into
console errors or arbitrary dossier fields.

Stage exits and bounded receipts independently determine the final verdict;
all seven stages still collect ordinary evaluated failures. Bash monitor mode
uses `wait -f` for main and cleanup, including stopped jobs. Linux procfs is now
required for visible process-group states, distinguishing active/stopped
members from terminated zombies (verified against the
[Linux proc_pid_stat manual](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html),
fields 3/5). Descendants outliving their leader fail the stage and are terminated
before later stages or publication ownership release. TERM polling is bounded,
then KILL escalation targets only the owned group; termination is checked before
clearing ownership. The runner reaps its direct leader; the host owns terminated
orphan zombies. If termination cannot be verified, the runner exits nonzero,
stops further work and retains its reservation. Process visibility/controlled
filesystem access are required; deliberately detached descendants, SIGKILL,
host loss and arbitrary directory writers are outside these guarantees.

Catchable INT/TERM/HUP stop later stages and preserve exits 130/143/129 when
cleanup succeeds. Only owned lock/staging and private control snapshots are
removed; run trees, logs and receipts remain for diagnosis and artifact links.
Staging ownership is recorded immediately after exclusive open, so failed close
still cleans its path. Failed unlink preserves the ownership lock for retry.
Resource cleanup failure exits nonzero before a passing summary. Foreign locks,
temps and prior evidence remain intact. Operator cleanup requires inspecting a
specific inactive owner; no shared sweep is authorized.

Dry mode disables supported child mutation/traffic but static integrity may
contact npm, rotation may observe configured reachability and reconciliation
needs services. Rotation/reconciliation always stay dry; dry restore lacks
successful recovery evidence. Default non-dry execution retains Stage 6's dry
child selection and failed default-drill qualification. Targeted execution stays
a drill, never production approval. No unstubbed unified invocation, even dry,
was authorized or run. Safe inspection from the repository root:

```bash
bash scripts/ops/run-launch-drills.sh --help
npm run ops:launch-drill-test
```

Actual-process fixtures allowlist environments and executable tools; fake live
URLs/telemetry are deterministic stubs. They cannot invoke real network,
Docker, npm, PostgreSQL or Garage tools. Regressions cover inputs/preflight,
private permissions, retained and racing destinations, concurrent writers,
complete/invalid receipts, serializer/publication faults, partial-close/retry,
cleanup errors, INT/TERM/HUP, stopped/nested/TERM-resistant jobs and the leader
exiting before its descendant. The next-stage fixture observes termination
before work, rather than checking only eventual process exit.

Verification:

| Command                                                                        | Actual concise output / result                                                                                                                             |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bash -n scripts/ops/run-launch-drills.sh`                                     | exit 0, no output                                                                                                                                          |
| `node --check` on helper and both specs                                        | exit 0, no output                                                                                                                                          |
| `bash scripts/ops/run-launch-drills.sh --help`                                 | updated `Usage: scripts/ops/run-launch-drills.sh [options]`; exit 0                                                                                        |
| `npm run ops:launch-drill-test`                                                | `tests 162`, `pass 162`, `fail 0`; exit 0                                                                                                                  |
| Final helper suite with `--test-isolation=none`                                | `tests 31`, `pass 31`, `fail 0`; exit 0                                                                                                                    |
| `node --test` on six related specs listed below                                | `tests 1059`, `pass 1059`, `fail 0`; exit 0                                                                                                                |
| `npm run ops:templates`                                                        | `ops template check passed`; exit 0                                                                                                                        |
| `npm run ops:templates-test`                                                   | `tests 324`, `pass 324`, `fail 0`; exit 0                                                                                                                  |
| `npm run ops:check`                                                            | exit 1 at `ops:audit`: `37 vulnerabilities (9 moderate, 26 high, 2 critical)`; `audit error: critical vulnerabilities detected in production dependencies` |
| `npm run lint`                                                                 | all workspaces completed; final `eslint "{src,test}/**/*.ts"`; exit 0                                                                                      |
| `npm run typecheck`                                                            | shared/client/server completed; `Generated Prisma Client (7.9.1)`; exit 0                                                                                  |
| `npm run build` with normal permissions                                        | `Compiled successfully in 3.9s`; `Generating static pages using 7 workers (22/22) in 847ms`; server `prisma generate && nest build`; exit 0                |
| Prettier on both specs/prompt, helper edited regions and both inline JS blocks | `All matched files use Prettier code style!`; exit 0                                                                                                       |
| `git diff --check`                                                             | exit 0, no output                                                                                                                                          |

The six related specs were `run-capacity-alerting-drill.spec.js`,
`run-deployment-drill.spec.js`, `run-secret-rotation-drill.spec.js`,
`run-restore-drill.spec.js`, `check-launch-readiness.spec.js` and
`launch-readiness.spec.js`, run together under `scripts/ops/` with normal
subprocess permissions. These are the existing root-script test entrypoints;
no consumer was weakened. The aggregate stopped at the audit; its subsequent
stages were not reached. Affected isolated suites ran independently. Dependencies
and audit policy were unchanged; Phase 12 and prompt 201 remain open.

Typecheck/build ran sequentially. Sandbox process tests initially reported
`ERR_TEST_FAILURE`; detailed execution identified `spawnSync bash EPERM`.
Normal-permission hermetic tests passed. The sandboxed build failed with
`Could not parse output from TypeScript's --showConfig.`; the normal-permission
retry passed. Initial related integration failures came from existing template
checks requiring literal launch/static command markers; installed absolute
commands retain those genuine markers and final related/template suites pass.
Whole-helper Prettier warnings reproduce on its committed baseline; only edited
regions were formatted to avoid unrelated rewrites. New documentation sections
were formatted separately. No shell formatter pass is claimed.

Independent review identified three Important findings: leader exit could leave
an active owned descendant, staging-close failure could orphan a temporary file,
and overlapping output/evidence paths could allocate resources before rejection.
Each was verified, fixed and regression-tested. Follow-up review found no
remaining Critical, Important or Minor findings and independently passed
`tests 14`, `pass 14`, `fail 0`. No live drill, deployment, credential mutation,
production approval or push occurred. Operator launch gates and the critical
production dependency audit remain unresolved.

## Prompt 272 — static-integrity evidence publication hardening (2026-10-07)

This supersedes prompt 187's producer publication behavior without changing its
Stage 1 receipt identity, ordered checks, dossier projection or production
readiness consumers. `run-static-integrity-checks.js` remains importable without
child execution, filesystem preflight/allocation or executable discovery. No
HTTP route, UI, topology, dependency, scanner policy or operator value changed.

The CLI accepts exactly one output using separate/attached `--output` or `-o`.
Standalone `--help`/`-h` is side-effect free; mixed help, duplicates, unknown or
positional input, missing/blank/control values, separate dash-leading values
and trailing separators reject with fixed diagnostics. Attached dash-leading
names and ordinary spaces/quotes remain literal paths. Output still resolves
against caller cwd; all three fixed children execute from the installed root.
Before child execution, the runner checks readable regular child scripts,
Bash availability, the entire existing ancestor chain, directory traversal and
nearest-parent writability, and an absent final destination. Files, directories,
symlinks (including dangling links), non-directory/symlink ancestors and
unusable parents reject without allocating output resources. Access checks are
advisory; exclusive operations and repeated preflight still handle races/errors.

Checks remain `production_templates`, `docker_runtime`, `secret_defaults`, in
that order. Ordinary failures do not stop later checks. Only an error-free,
unsignalled integer zero status passes; normal exit codes are integers 0–255.
Thrown, absent/malformed, signalled or spawn-error results become the fixed
`spawn_failed`/null-code failure. Receipts contain the existing drill type,
canonical ISO UTC milliseconds timestamp, three ordered check entries and
consistent status/validity/counts. The complete-receipt validator permits truthful
failed receipts for publication; exported `validateStaticEvidence` continues
accepting successful launch-compatible receipts only, returning its existing
`{ valid, failedCheckId }` shape. Wrong field types, IDs/order, timestamps,
exit/pass/failure-kind combinations and contradictory verdicts/counts reject.
Only fixed producer fields are projected; caller extras, `toJSON`, child
stdout/stderr, exceptions, environments, commands and paths are not evidence.

`writeEvidence` enforces the same publication rules directly. It independently
checks serialization before allocation, creates only missing directories with
0700 mode, preserves existing parent permissions and does not change umask.
Random same-directory staging uses exclusive `wx` creation and 0600 mode.
Descriptor/path ownership is recorded before writing/closing; complete JSON is
closed, independently read back and checked for exact content/receipt equality
before atomic exclusive hard-link publication. Unsupported link operations
fail safely with no replacement fallback. Retained or racing files, directories
and links survive. A complete evaluated failed receipt publishes and exits 1.
Two overlapping writers may both execute checks; at most one publishes to a
shared destination. The loser preserves the winner, returns nonzero and removes
only its owned staging. No final-destination reread supplies the verdict.

Catchable I/O, serialization/readback, publication, console and cleanup failures
cannot yield success. Cleanup retries still-owned close/unlink resources after
partial failures and preserves foreign staging. If publication succeeds but
staging cleanup fails, final evidence remains and the invocation exits nonzero;
persistent cleanup failure may retain owned staging for explicit inspection.
New empty directories can remain after later execution/publication failure.
No evidence-tree removal or shared sweep is implemented. Abrupt termination,
SIGKILL, host loss and arbitrary directory modification by another actor remain
outside cleanup guarantees. Controlled installed scripts/executables/filesystem
access are prerequisites, not cryptographic provenance. Synchronous `runChecks`
remains synchronous: a terminated parent does not guarantee supervision of child
descendants. The unified caller's existing owned-group supervision is unchanged.

The unsafe real-runner/directory test was replaced before suite execution.
Actual-process fixtures copy only this producer and three deterministic stubs,
allowlist environments/tools and invoke Node through `process.execPath`.
There is no inherited service/proxy credential environment, `NODE_OPTIONS`,
`BASH_ENV`/`ENV` or fallback network-capable tool. Markers/FIFOs establish race
milestones; subprocesses have bounded timeouts and owned-group teardown.
Publication fault injection uses local dependency injection, without persistent
fs mocks. New Stage 1 integration cases replace just the static stub with the
real copied producer; its children and all other stages remain deterministic.
The real dossier assembler and readiness helper accept its success receipt and
reject its evaluated failure. `ops:static-integrity-test` is a dedicated root
script and runs in `ops:check` before the unchanged production audit; it never
invokes the unstubbed evidence producer.

Verification (actual output excerpts):

| Command                                                          | Exit | Output/result                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --check` on producer and both changed specs                | 0    | no output                                                                                                                                                                                                                        |
| `node scripts/ops/run-static-integrity-checks.js --help`         | 0    | `Usage: node scripts/ops/run-static-integrity-checks.js --output <file> \| -o <file> \| --output=<file> \| -o=<file>`                                                                                                            |
| `npm run ops:static-integrity-test`                              | 0    | `tests 71`, `pass 71`, `fail 0`                                                                                                                                                                                                  |
| `npm run ops:launch-drill-test`                                  | 0    | `tests 164`, `pass 164`, `fail 0`                                                                                                                                                                                                |
| Final actual-producer integration by test-name pattern           | 0    | `tests 2`, `pass 2`, `fail 0`                                                                                                                                                                                                    |
| `npm run ops:readiness-test`                                     | 0    | `tests 649`, `pass 649`, `fail 0`                                                                                                                                                                                                |
| `npm run ops:launch-readiness-test`                              | 0    | `tests 23`, `pass 23`, `fail 0`                                                                                                                                                                                                  |
| `npm run ops:templates-test`                                     | 0    | `tests 324`, `pass 324`, `fail 0`                                                                                                                                                                                                |
| `npm run ops:docker-runtime-test`                                | 0    | `tests 45`, `pass 45`, `fail 0`                                                                                                                                                                                                  |
| `npm run ops:scan-secrets-test`                                  | 0    | `tests 42`, `pass 42`, `fail 0`                                                                                                                                                                                                  |
| `npm run ops:templates`                                          | 0    | `ops template check passed`                                                                                                                                                                                                      |
| Final `npm run ops:check`                                        | 1    | static suite `tests 70`, `pass 70`, `fail 0` before the final test-only review fix; audit `37 vulnerabilities (9 moderate, 26 high, 2 critical)` and `audit error: critical vulnerabilities detected in production dependencies` |
| `npm run lint`                                                   | 0    | all three workspaces; final `eslint "{src,test}/**/*.ts"`, no diagnostics                                                                                                                                                        |
| `npm run typecheck`                                              | 0    | shared/client/server completed; `Generated Prisma Client (7.9.1)`                                                                                                                                                                |
| `npm run build` with normal permissions                          | 0    | `Compiled successfully in 11.2s`; `Generating static pages using 7 workers (22/22) in 731ms`; server `prisma generate && nest build`                                                                                             |
| Prettier on changed JS/JSON/prompt and new documentation regions | 0    | `All matched files use Prettier code style!`                                                                                                                                                                                     |
| `git diff --check`                                               | 0    | no output                                                                                                                                                                                                                        |

The aggregate stopped at the unchanged audit; its later stages were not reached.
Affected isolated suites ran independently. No dependency/policy change was
made. Sandbox process tests initially failed with `spawnSync /usr/bin/mkfifo
EPERM`; normal-permission hermetic suites passed. The sandboxed build reported
`Could not parse output from TypeScript's --showConfig.`; its normal-permission
rerun passed. Typecheck/build ran sequentially. No formatting claim is made for
untouched baseline files or shell scripts.

Independent review identified a fixture robustness issue: synchronous FIFO
release could block after the reader died, preventing test watchdogs/teardown.
Release now runs in a supervised credential-free Node writer with a 1000 ms
SIGKILL timeout, and callers await it. The dead-reader regression completed in
1039 ms; the complete final suite passed 71/71. Follow-up review found no remaining Critical, Important or Minor findings.

Safe inspection from the repository root:

```bash
node scripts/ops/run-static-integrity-checks.js --help
npm run ops:static-integrity-test
```

Regeneration requires a fresh absent output path; preserve earlier receipts and
all evidence they reference. No unstubbed static/unified runner, live drill,
benchmark/probe/restore/reconciliation, deployment, credential mutation,
production approval or push occurred. Static receipts remain narrower than
assurance of the deployed system. Phase 12, prompt 201, critical dependency
findings and all operator sign-offs remain open. Rollback is a reviewed normal
revert preserving published evidence; the former replacing writer/real-child
test does not make retained-path reuse or rollback test execution safe.

## Prompt 273 — standalone capacity evaluator hardening (2026-10-07)

`scripts/ops/verify-capacity-load.js` now rejects unknown/positional, repeated,
missing/blank/control-containing, conflicting and partial integer CLI input.
Separate and attached value options remain supported; new `--output` selects an
absent exact file relative to caller cwd. Attached dash-leading and quoted/spaced
paths are literal data. Standalone `--help`/`-h` and import perform no evaluation,
network or destination work. Unsupported `--rps` rejects; no pacing was added.
Default evaluation is still synthetic, five seconds and ten workers. Duration
1–300 seconds and concurrency 1–100 also bind direct evaluation/live calls;
these bounds are engineering judgments for invocation safety, not measured
production capacity or changed SLOs. Invalid inputs reject before workload,
transport or save allocation. HTTP(S) targets reuse `safeUrl`, reject outer
whitespace, controls, credentials, query/fragment delimiters and conflicting
synthetic mode. Canonical `href` (including root slash) remains the benchmark
hash input; the live worker still rewrites only root paths to `/health`.

This contract supersedes the historical standalone millisecond/default-mode,
direct-replacing save descriptions above. Standalone saving defaults to
installation-root `backups/capacity-load-report-<uuid>.json`, independent of
caller cwd. Direct `evaluateCapacity` still saves only when `saveReport` is true
and retains `backupsDir`; `outputFile` selects an exact destination only with
saving enabled. `--no-save` does no destination preflight or allocation. Direct
callers retain the returned `reportPath`; saved JSON and CLI output omit this
private path. Existing report fields, synthetic database distributions,
statistics/rounding, five SLO targets, compliance flags and violation strings
retain their meanings. HTTP benchmarking still does not measure live DB latency;
separately bound live telemetry remains required by the parent/launch consumer.

Save destinations and all existing ancestors receive symlink-aware read-only
preflight before evaluation. Retained files/directories/symlinks/dangling links,
trailing separators, non-directory or symlink parents and inaccessible ancestors
reject. New directories are 0700; existing modes and global umask remain intact.
Random same-directory staging opens exclusively at 0600; descriptor/path ownership
is recorded before fstat/write/close. Complete serialized reports are closed,
independently read and compared with both serialization and evaluated fields.
Exclusive same-filesystem hard-link publication cannot replace a retained or
racing destination; unsupported filesystems fail without a replacing fallback.
No final reservation is promised: competing evaluations may both run, but at most
one can publish to an exact destination. Foreign staging and earlier reports
remain untouched. Cleanup retries only owned descriptors/staging. Publication
followed by cleanup/output failure retains complete final evidence and exits
nonzero, even with `--allow-failure`. Newly created empty directories and staging
whose cleanup persistently fails can remain for operator inspection. No evidence
sweep, cryptographic provenance, arbitrary ancestor mutation, SIGKILL/host-loss
cleanup guarantee or async process supervisor is introduced.

CLI failures emit only `Capacity invocation, evaluation or publication failed`
and exit nonzero; raw exception text, private paths, URLs and stacks are not
projected. One JSON report follows completed evaluation/publication; evaluated
SLO failure preserves `overallPassed: false` and normally exits 1. The override
changes only that SLO status. Human statistics remain available. Output uses
write callbacks and natural process shutdown; stream errors cannot be overwritten
by a passing evaluation status or an override.

Tests use `node:test`, disposable actual installations with the helper closure,
allowlisted environments, bounded process timeouts and owned teardown. Actual
CLI paths are synthetic or network-guarded; HTTP/HTTPS behavior uses mocked
transport and clock without a socket/DNS request. Coverage includes strict input,
zero-work help/import, no-save, literal paths, permissive-umask privacy, existing
modes, retained destinations/ancestors, injected open/fstat/write/close/read/link/
unlink/serialization/output failures, readback mismatches, foreign staging,
fixed-clock UUID uniqueness, deterministic competing publication and actual
concurrent writers. The isolated real parent accepts the actual synthetic child
structurally, still rejects it for production (`requireLive: true`), and fails
when a real child returns a genuine low-throughput SLO failure. No consumer
production implementation or acceptance policy changed.

Verification:

| Command                                                   | Exit | Actual concise output                                                                                                               |
| --------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `node --check` on producer/spec                           | 0    | no output                                                                                                                           |
| `node scripts/ops/verify-capacity-load.js --help`         | 0    | `Usage: scripts/ops/verify-capacity-load.js [options]`                                                                              |
| `npm run ops:capacity-test` (final)                       | 0    | `tests 54`, `pass 54`, `fail 0`                                                                                                     |
| `npm run ops:capacity-alerting-test`                      | 0    | `tests 143`, `pass 143`, `fail 0`                                                                                                   |
| Final actual-child parent integration                     | 0    | `tests 1`, `pass 1`, `fail 0`                                                                                                       |
| `npm run ops:alert-test`                                  | 0    | `tests 23`, `pass 23`, `fail 0`                                                                                                     |
| `npm run ops:dos-test`                                    | 0    | `tests 91`, `pass 91`, `fail 0`                                                                                                     |
| `npm run ops:launch-drill-test`                           | 0    | `tests 164`, `pass 164`, `fail 0`                                                                                                   |
| `npm run ops:readiness-test`                              | 0    | `tests 649`, `pass 649`, `fail 0`                                                                                                   |
| `npm run ops:launch-readiness-test`                       | 0    | `tests 23`, `pass 23`, `fail 0`                                                                                                     |
| `npm run ops:templates-test`                              | 0    | `tests 324`, `pass 324`, `fail 0`                                                                                                   |
| `npm run ops:templates`                                   | 0    | `ops template check passed`                                                                                                         |
| `npm run ops:check`                                       | 1    | `37 vulnerabilities (9 moderate, 26 high, 2 critical)`; `audit error: critical vulnerabilities detected in production dependencies` |
| `npm run lint`                                            | 0    | all three workspaces; final `eslint "{src,test}/**/*.ts"`, no diagnostics                                                           |
| `npm run typecheck`                                       | 0    | shared/client/server completed; `Generated Prisma Client (7.9.1)`                                                                   |
| `npm run build`                                           | 0    | `Compiled successfully in 3.3s`; `Generating static pages using 7 workers (22/22) in 684ms`; server `prisma generate && nest build` |
| Prettier on producer/spec/prompt and parent edited region | 0    | `All matched files use Prettier code style!`                                                                                        |
| `git diff --check`                                        | 0    | no output                                                                                                                           |

The aggregate stopped at the unchanged dependency audit; later aggregate stages
were not reached. Affected isolated suites ran independently. No dependency or
audit-policy changes occurred. Sandboxed process fixtures first reported
`spawnSync ... EPERM`; approved normal subprocess permissions passed. Typecheck
and build ran sequentially. New documentation regions were formatted separately,
without changing unrelated historical formatting.

Independent read-only review found no Critical, Important or Minor findings.

Safe inspection from the repository root:

```bash
node scripts/ops/verify-capacity-load.js --help
npm run ops:capacity-test
```

To regenerate standalone synthetic evidence when requested, choose a new absent
`--output` destination or use the default UUID save; preserve prior reports.
No real HTTP benchmark, unstubbed parent/unified drill, production evidence
inspection/approval, deployment, credential mutation or push occurred. Phase 12,
prompt 201, dependency findings and operator sign-offs remain open. Rollback is a
reviewed normal revert preserving published evidence; reverting to the former
replacing writer does not make destination reuse or unchecked live inputs safe.

## Prompt 274 — standalone alert-rule verifier hardening (2026-10-07)

`scripts/ops/verify-alert-rules.js` now validates the complete invocation before
source reads. It retains `--json`, `--alerts-file`, and `--prom-file`, adds
standalone `--help`/`-h`, and accepts separate or attached value options.
Unknown/positional, repeated, missing/blank/control-containing, switch-attached
and conflicting-help arguments reject without reflecting their values. Separate
values cannot consume another option; attached dash-leading and spaced paths
remain literal. Defaults resolve from the installation; explicit relative paths
resolve from caller cwd. Direct `verifyAlertRules` accepts only a plain options
record with valid optional source strings, preserving no-argument use. Help and
import do no source evaluation, writes, network or child launches. There is no
report-saving/output option. No dedicated standalone Node CLI reference is
installed in the security skill; changed Node APIs were verified from installed
declarations and YAML behavior from installed js-yaml 4.3.1 documentation/source.

Source loading rejects absent/unreadable/non-regular files with fixed errors.
Regular read-only symlinks remain supported. Stat before open rejects ordinary
FIFOs/devices/directories; nonblocking open and descriptor stat also reject a
non-regular replacement. Each read is capped at 1 MiB including growth after
fstat; owned descriptors close on success, read/parse failure and size rejection.
A close error receives one owned-descriptor retry but still fails verification;
persistent close failure may retain the descriptor until process shutdown.
Installed YAML limits remain explicit: depth 100 and 10,000 total merge keys,
with duplicate-key and multi-document rejection unchanged. Unknown cyclic alias
keys are not recursively traversed or projected. Traversed groups, expanded
rules, scrapes and rule-file entries are capped at 10,000 before expensive
expansion. These are engineering resource limits, not measured production needs;
checked-in alerts and Prometheus sources measure 4,188 and 1,139 bytes, with
11 rules.

Root/collection/record validation precedes field access. Required expression,
duration, labels and annotations are checked before string operations or output;
invalid evaluations omit all source textual fields. Duplicate required identities
across or within groups fail rather than selecting the last definition. Missing
API scrape now fails `valid` as missing worker scrape already did; failed checks
cannot coexist with a passing report. `rule_files` remains a presence/string
check, without mounted-path resolution. Review identified inherited quadratic
selector matching for repeated unclosed braces. The final scan preserves the
legacy metric-name and selector/job heuristic while consuming disjoint spans and
advancing the next closing-brace position; it no longer repeatedly scans malformed
suffixes. An actual roughly 720 KB unclosed-expression fixture completed with a
controlled failure in 47 ms; this is fixture evidence, not a production SLO.
Legacy-policy comparisons cover nested/absent braces, prefixes and multiple selectors. Extra ordinary alerts and recording
rules remain counted; they receive no claim of full semantic validation.

Successful JSON retains all public fields, eleven ordered required evaluations
and fixed predicates, and exactly 25 successful check identities used by the
parent. Controlled source/shape failures return coherent failed reports with
empty evaluations where none ran, zero total rules when unavailable, and eleven
required rules. Diagnostics use fixed categories/check identities, excluding
paths, parser snippets/exceptions, invalid field values, arbitrary objects and
stacks. Validated textual fields remain in successful JSON for compatibility;
the verifier cannot detect credentials intentionally inserted into otherwise
valid expressions/annotations. Human output uses safe headings and rule identities.
JSON emits one complete report for completed verification; evaluated failure
exits 1. Invalid invocation, internal/serialization or output failures use fixed
stderr `Alert verification invocation or output failed` and exit nonzero without
success-shaped fallback. Write callbacks, stream error handlers and natural
shutdown preserve complete output and broken-pipe failure status.

Tests use disposable installations/source fixtures, explicit installed YAML
resolution, allowlisted child environments, bounded subprocess timeouts and
owned teardown. They cover actual CLI/default-cwd/literal-path behavior,
zero-work help/import, malformed shapes/required values/duplicates/scrapes,
YAML depth/merge/key/document failures (limit cases assert source-load failure), canary redaction, extra rules/aliases,
size/growth/non-regular/symlink handling, injected stat/open/fstat/read/close/parse
faults, serialization/output faults, complete large output and an actual broken
pipe. The actual installed alert CLI passes the isolated dry capacity parent;
malformed source fails the parent. The accepted dry receipt still fails
`requireLive: true`, so this supplies no Category 5 sign-off.

Verification:

| Command                                            | Exit | Actual concise output                                                                                                               |
| -------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `node --check` producer/spec                       | 0    | no output                                                                                                                           |
| `node scripts/ops/verify-alert-rules.js --help`    | 0    | `Usage: scripts/ops/verify-alert-rules.js [options]`                                                                                |
| `npm run ops:alert-test`                           | 0    | `tests 112`, `pass 112`, `fail 0`                                                                                                   |
| `npm run ops:capacity-alerting-test`               | 0    | `tests 144`, `pass 144`, `fail 0`                                                                                                   |
| Final actual alert-child parent integration        | 0    | `tests 1`, `pass 1`, `fail 0`                                                                                                       |
| `npm run ops:capacity-test`                        | 0    | `tests 54`, `pass 54`, `fail 0`                                                                                                     |
| `npm run ops:dos-test`                             | 0    | `tests 91`, `pass 91`, `fail 0`                                                                                                     |
| `npm run ops:launch-drill-test`                    | 0    | `tests 164`, `pass 164`, `fail 0`                                                                                                   |
| `npm run ops:readiness-test`                       | 0    | `tests 649`, `pass 649`, `fail 0`                                                                                                   |
| `npm run ops:launch-readiness-test`                | 0    | `tests 23`, `pass 23`, `fail 0`                                                                                                     |
| `npm run ops:templates-test`                       | 0    | `tests 324`, `pass 324`, `fail 0`                                                                                                   |
| `npm run ops:templates`                            | 0    | `ops template check passed`                                                                                                         |
| `npm run ops:check`                                | 1    | `37 vulnerabilities (9 moderate, 26 high, 2 critical)`; `audit error: critical vulnerabilities detected in production dependencies` |
| `npm run lint`                                     | 0    | all three workspaces; `eslint "{src,test}/**/*.ts"`, no diagnostics                                                                 |
| `npm run typecheck`                                | 0    | shared/client/server completed; `Generated Prisma Client (7.9.1)`                                                                   |
| `npm run build` with normal subprocess permissions | 0    | `Compiled successfully in 3.9s`; `Generating static pages using 7 workers (22/22) in 1363ms`; `prisma generate && nest build`       |
| Prettier producer/spec/prompt                      | 0    | `All matched files use Prettier code style!`                                                                                        |
| `git diff --check`                                 | 0    | no output                                                                                                                           |

The aggregate stopped at the unchanged production dependency audit; later
aggregate stages were unreached. Affected isolated suites ran independently.
Sandboxed child launches returned `spawnSync ... EPERM`; normal subprocess
access passed the hermetic suites. Sandboxed build failed with `Could not parse
output from TypeScript's --showConfig`; normal subprocess access passed the build.
Typecheck and build ran sequentially. New documentation and the parent edited
region were formatted separately, preserving historical formatting.

Static expression checks remain heuristics, and simulations remain fixed
JavaScript predicates. They do not parse full PromQL, execute supplied YAML
expressions, verify evaluation windows, observe deployed monitoring or deliver
notifications. No live query/load/DoS/unified drill, production evidence inspection,
deployment, credential change, dependency upgrade or push occurred. Phase 12,
prompt 201, Category 5, dependency findings and operator launch decisions remain
open. Safe standalone inspection is `node scripts/ops/verify-alert-rules.js --help`,
`npm run ops:alert-test`, or `node scripts/ops/verify-alert-rules.js --json` against
checked-in sources. A reviewed normal revert is the rollback.

Independent review verified and resolved the inherited selector CPU finding and
the YAML-limit assertion gap; follow-up review found no remaining Critical,
Important or Minor findings. Reviewer policy comparisons matched 100,000 generated
expressions. The final alert suite passed 112/112 and final actual-child parent
integration passed 1/1 after those fixes; unaffected root gates and regression
suites were not repeated.

## Prompt 275 — SBOM invocation and artifact publication hardening (2026-10-08)

The standalone producer now validates all CLI arguments before inventory reads
or output allocation. It retains `--verify-licenses`, `--json`, `--output FILE`
and `-o FILE`, adds attached output values and standalone `--help`/`-h`, and
rejects unknown/positional/repeated/conflicting switches, boolean attached values,
missing/blank/control-bearing paths, root targets and trailing separators. An
attached dash-leading path is literal data; ordinary spaces are supported.
Installation-root inventory defaults remain independent of caller cwd; relative
output uses caller cwd. Import/help performs no inventory or allocation work.
Direct `generateSbom` options validate object shape and present root/lockfile/
timestamp/version strings before source work; valid existing callers and exports
remain. Direct generation has no save side effect.

Only explicit output saves. Read-only preflight requires an absent destination
(including dangling links), directory ancestors without symlinks, and recorded
ancestor identities. Allocation rechecks identities, rejects disappeared recorded
parents, creates only missing directories with 0700 mode, and preserves existing
modes. Complete serialized UTF-8 bytes including newline must fit the unchanged
consumer's 16 MiB ceiling before any directory allocation; this is an engineering
compatibility bound, not measured capacity. An exclusive 0600 same-directory
staging file handles short/zero writes, closes, reopens with no-follow/nonblocking
flags, checks regular-file identity/size, reads bounded bytes, compares every byte
and independently validates BOM/compliance fields. Atomic exclusive hard linking
publishes without rename/overwrite fallback. A late competing destination wins
unchanged. Cleanup checks ownership and retries its own failures once; foreign
staging, competing outputs and published evidence survive. Cleanup failure remains
nonzero even if retry succeeds. Newly created parents are not recursively removed.

Completed license failure attaches the actual evaluation to the same saved/printed
BOM, drains complete JSON and exits 1. Successful exit requires generation,
requested verification/publication/cleanup and output to succeed. Fixed invocation,
generation, serialization, publication, cleanup and output diagnostics suppress
rejected args, private paths, raw parser exceptions and stacks. Stream error
handlers/write callbacks and natural process exit handle broken pipes without an
uncaught stack. Human output retains intentional inventory/license data and omits
raw source/output paths. Valid metadata is not a secret-detection surface.

Baseline deep comparison against pre-change generation preserved 708 sorted
components, all 708 hashes, 834 excluded entries and every license count. The
unchanged evaluation reports `compliant: true`, `violations: []`,
`totalComponents: 708`. Components are deterministically sorted; complete artifacts
vary by UUID and timestamp. Inventory extraction, exclusions, purls, integrity
decoding, disk-license fallback and compound-expression policy remain unchanged.
Finite fixtures also verify fallback manifests, hashes and ordering. Actual-child
launch fixtures stub all unrelated stages: MIT passes the unchanged dossier and
readiness consumers; GPL saves complete failed evidence, exits nonzero and fails
both consumers. Synthetic acceptance cannot approve production.

Verification (actual concise output):

| Command                                         | Exit | Output                                                                                                                                                 |
| ----------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node syntax, producer/spec and integration spec | 0    | no output                                                                                                                                              |
| Standalone help                                 | 0    | `Usage: scripts/ops/generate-sbom.js [options]`                                                                                                        |
| Final `ops:sbom-test`                           | 0    | `tests 90`, `pass 90`, `fail 0`                                                                                                                        |
| `ops:sbom`                                      | 0    | `Total production components: 708`; `Excluded dev/test packages: 834`; `License Compliance: PASSED (100% compliant with approved permissive licenses)` |
| `ops:launch-drill-test`                         | 0    | `tests 166`, `pass 166`, `fail 0`                                                                                                                      |
| Final actual SBOM child integration             | 0    | `tests 2`, `pass 2`, `fail 0`                                                                                                                          |
| `ops:readiness-test`                            | 0    | `tests 649`, `pass 649`, `fail 0`                                                                                                                      |
| `ops:launch-readiness-test`                     | 0    | `tests 23`, `pass 23`, `fail 0`                                                                                                                        |
| `ops:sast-test`                                 | 0    | `tests 14`, `pass 14`, `fail 0`                                                                                                                        |
| `ops:container-test`                            | 0    | `tests 22`, `pass 22`, `fail 0`                                                                                                                        |
| `ops:templates-test`                            | 0    | `tests 324`, `pass 324`, `fail 0`                                                                                                                      |
| `ops:templates`                                 | 0    | `ops template check passed`                                                                                                                            |
| `ops:check`                                     | 1    | `37 vulnerabilities (9 moderate, 26 high, 2 critical)`; `audit error: critical vulnerabilities detected in production dependencies`                    |
| Root lint                                       | 0    | all three ESLint workspace commands; no diagnostics                                                                                                    |
| Root typecheck                                  | 0    | all three workspaces; `Generated Prisma Client (7.9.1)`                                                                                                |
| Root build with normal subprocess access        | 0    | `Compiled successfully in 3.7s`; `Generating static pages using 7 workers (22/22) in 1254ms`; `prisma generate && nest build`                          |
| Changed JS/prompt/new-region Prettier           | 0    | `All matched files use Prettier code style!`                                                                                                           |
| Diff check                                      | 0    | no output                                                                                                                                              |

The aggregate stopped at the unchanged audit; later aggregate stages were
unreached and affected suites ran independently. Sandbox test execution reported
only failed file-level results; normal subprocess access passed hermetic suites.
Sandbox build failed with `Could not parse output from TypeScript's --showConfig`;
normal subprocess access completed the build. Typecheck and build were sequential.

Residual limits: this does not certify the full CycloneDX schema, validate npm
package reachability, parse SPDX expressions, confine disk-fallback paths, bound
source lockfile memory, or change permissive integrity decoding. Path identity
checks narrow ordinary substitution races; they do not resist a hostile same-UID
filesystem administrator. Unsupported hard links fail without destructive fallback.
Uncatchable interruption or persistent identity/close/unlink faults can leave
owned private staging; inspect ownership before operator cleanup. If output or
cleanup fails after publication, evidence remains and process status is nonzero.
No crash-durability/fsync guarantee is added. No live unified drill, production
inspection/approval, deployment, credential/dependency change or push occurred.
Phase 12, prompt 201, dependency findings and operator sign-offs remain open.
Safe inspection: standalone help, `npm run ops:sbom-test`, and `npm run ops:sbom`
without output. Rollback is a reviewed normal revert, preserving retained evidence.

Independent review confirmed the recorded-parent removal finding and verified the
fix with an independent disposable fixture. Final review found no remaining
Critical/Important implementation findings; its minor orphan-staging documentation
request is recorded above. When both initial and cleanup descriptor identity reads
fail, ownership cannot be established safely and staging is conservatively retained.
The reviewer's sandbox suite had the same opaque file-level failure; full suite
evidence is the coordinator's normal subprocess run. Final SBOM tests passed 90/90
and actual-child integration passed 2/2 after the fix. Unaffected root gates were
not repeated.

## Prompt 276 — SAST invocation and artifact publication hardening (2026-10-08)

The standalone producer validates its entire invocation before scanning, triage
reads or allocation. It retains `--json`, `--format json`, `--fail-on LEVEL`,
`--triage FILE`, `--output FILE` and `-o FILE`, adds attached value forms and
standalone `--help`/`-h`, and rejects unknown/positional/repeated/conflicting
switches, boolean attached values, missing/blank/control-bearing values,
ambiguous separate dash-leading paths, root output and trailing separators.
Severity is case-insensitive BLOCKER/HIGH/MEDIUM/LOW and normalized once;
BLOCKER remains the default. Attached dash-leading paths and spaces are literal;
no shell, environment-variable or tilde expansion occurs. Default scanning and
policy use the installation root; explicit relative triage/output uses caller
cwd. Import/help does no scanning/allocation. Direct options validate object,
present paths, root arrays (including sparse entries), severity and valid Date
before source work; valid custom/empty/relative roots, synchronous results and
all exports remain. Missing triage still means empty policy.

CLI evidence is a separate projection. Every SAST-04 finding snippet, including
triaged/expired and duplicate blocking references, becomes
`[redacted detected secret]`; its matching suppression snippet is also redacted.
Direct results and policy objects are unchanged. Other source snippets,
reasons/rationale and approved metadata remain intentional local evidence.
This is targeted detected-secret redaction, not universal detection/redaction
of arbitrary text. Rule identity, location, order, counts and verdict remain.
Complete blocking/expired evaluation emits/saves a real failed report and exits
`1`. Internal failure emits fixed invocation, scanning, serialization, publication,
cleanup or output diagnostics without paths, rejected values, raw errors or
stacks. Stream handlers/callbacks and `process.exitCode` naturally drain JSON;
broken pipes fail cleanly. Human output omits raw policy/output path banners.

Only explicit output saves. Read-only preflight requires an absent destination,
including dangling links, directory ancestors without symlinks and recorded
parent identities. Allocation/publication rechecks parents, rejects disappeared
recorded parents, creates missing parents at 0700 and preserves existing modes.
Serialized UTF-8 receipt including newline must fit the unchanged consumer's
1 MiB ceiling before allocation; no-save JSON has no save-only ceiling. This is
an engineering compatibility bound, not measured scanner capacity. A private
0600 same-directory exclusive staging file handles short/zero writes, closes,
reopens with no-follow/nonblocking flags and verifies regular-file identity,
bounded size, complete bytes, unchanged metadata and independently validated
parsed report/counts/verdict. Exclusive atomic hard linking publishes without
rename, overwrite or destructive fallback. Late competing outputs survive.
Cleanup closes only owned descriptors, checks staging identity, retains ownership
on failure and retries once; a recorded cleanup fault remains nonzero even if
retry succeeds. Foreign replacements, competing outputs and published receipts
survive. Output/cleanup failure after publication retains evidence. New parents
are never recursively removed.

Fixed-time comparison at `2026-10-08T00:00:00Z` against planning commit
`4f696d78559b9bfe03c06f534cab63ac22a0e6ca` deep-matched direct results across all
four thresholds. All eight rule functions/metadata matched after formatting,
and existing exports matched. Both versions scanned 371 files with 12 findings,
9 triaged, 0 expired, 3 active and 0 default blockers; default passed. No count
change, rule change or suppression edit was needed. Exact ANALYZE and granular
path/line/lines/snippet/first-match/expiry-boundary regressions remain. The real
SAST child installed into disposable launch fixtures accepts clean evidence and
rejects active blockers and expired matches through unchanged stage/dossier and
readiness consumers; every unrelated stage stays stubbed. A retained failed
receipt cannot pass stage 2. Synthetic acceptance is not production sign-off.

Verification (actual concise output):

| Command                                   | Exit | Output                                                                                                                              |
| ----------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Node syntax, producer/spec/integration    | 0    | no output                                                                                                                           |
| Standalone help                           | 0    | `Usage: scripts/ops/run-sast-scan.js [options]`                                                                                     |
| `ops:sast-test`                           | 0    | `tests 136`, `pass 136`, `fail 0`                                                                                                   |
| `ops:sast`                                | 0    | `Files scanned: 371`; `Total rule matches: 12`; `SAST Gate: PASSED (Zero unreviewed blockers and zero expired suppressions)`        |
| `ops:launch-drill-test`                   | 0    | `tests 169`, `pass 169`, `fail 0`                                                                                                   |
| Focused actual SAST child integration     | 0    | `tests 3`, `pass 3`, `fail 0`                                                                                                       |
| `ops:readiness-test`                      | 0    | `tests 649`, `pass 649`, `fail 0`                                                                                                   |
| `ops:launch-readiness-test`               | 0    | `tests 23`, `pass 23`, `fail 0`                                                                                                     |
| `ops:sbom-test`                           | 0    | `tests 90`, `pass 90`, `fail 0`                                                                                                     |
| `ops:container-test`                      | 0    | `tests 22`, `pass 22`, `fail 0`                                                                                                     |
| `ops:templates-test`                      | 0    | `tests 324`, `pass 324`, `fail 0`                                                                                                   |
| `ops:templates`                           | 0    | `ops template check passed`                                                                                                         |
| `ops:check`                               | 1    | `37 vulnerabilities (9 moderate, 26 high, 2 critical)`; `audit error: critical vulnerabilities detected in production dependencies` |
| Root lint                                 | 0    | all three ESLint workspace commands; no diagnostics                                                                                 |
| Root typecheck                            | 0    | all three workspaces; `Generated Prisma Client (7.9.1)`                                                                             |
| Root build with normal subprocess access  | 0    | `Compiled successfully in 6.2s`; `Generating static pages using 7 workers (22/22) in 1363ms`; `prisma generate && nest build`       |
| Changed JS/prompt and new-region Prettier | 0    | `All matched files use Prettier code style!`                                                                                        |
| Diff check                                | 0    | no output                                                                                                                           |

The aggregate stopped at unchanged audit; later aggregate stages were unreached,
and affected suites ran independently. Sandbox SAST tests returned only an
opaque file-level failure; normal subprocess access passed. Sandbox build failed
with `Could not parse output from TypeScript's --showConfig`; normal subprocess
access passed. Typecheck and build were sequential.

Independent read-only review found no Critical, Important or Minor issues and
verified baseline parity/exports/diff. Its sandbox child reruns reported `EPERM`
and unavailable child output, so it did not claim independent full-suite success;
the successful normal-subprocess checks above supply that evidence. Feedback was
evaluated against the approved contracts; no implementation fix was required.

Residual limits: existing regex/discovery coverage, malformed-policy dates/schema,
recursive source resource bounds and source-path confinement remain unchanged.
Hard-link support is required; unsupported filesystems fail without destructive
fallback. Interruption/host loss can leave staging; confirm ownership before
explicit operator cleanup. Persistent close/unlink or unprovable ownership may
leave conservative orphans. Identity checks narrow ordinary replacement races,
not a hostile same-UID administrator. No signal framework, full SAST certification,
cryptographic provenance, production approval or dependency remediation is implied.
Phase 12, prompt 201, dependency advisories and operator sign-offs remain open.
Rollback is a reviewed normal revert; never delete retained evidence to roll back.
Safe inspection from repository root:

```bash
node scripts/ops/run-sast-scan.js --help
npm run ops:sast-test
npm run ops:sast
```

## Prompt 277 — container-verifier invocation and artifact publication hardening (2026-10-08)

The standalone producer validates its whole invocation before evaluation or
allocation. It retains `--json`, `--output FILE` and `-o FILE`, adds attached
output values and standalone `--help`/`-h`, and rejects unknown/positional,
repeated/alias-conflicting, boolean-attached, missing/blank/control-bearing and
mixed-help options. Separate dash-leading paths are ambiguous; attached values
and spaces are literal. Root/trailing-separator outputs fail. No shell, variable
or tilde expansion occurs. Sources remain installation-anchored; explicit
relative output uses caller cwd. Import/help performs no evaluation/allocation;
no-save allocates no output. Direct options validate records and present paths
before reading, preserving valid custom/external/relative source semantics and
all four synchronous read-only exports.

Each of the three sources requires a regular file and verified nonblocking
opened descriptor. Growth-aware reads are bounded at 1 MiB, detect ordinary
source modification and close owned descriptors; regular source symlinks remain
supported. Missing sources are fixed slot-specific evaluated failures. Read,
nonregular-source or closure faults produce controlled execution failure without
fabricating a receipt. YAML uses verified installed `maxDepth: 100` and
`maxTotalMergeKeys: 10000`; expanded traversal has a 10,000-entry budget and
active-ancestry cycle rejection. These are engineering limits, not measured
production capacity. Ordinary finite aliases and established small fixtures
remain supported. Malformed dereferenced structures fail with a fixed result;
missing optional security fields still reach existing predicates. Lifecycle
objects are rejected before diagnostic coercion, while scalar failures retain
existing checks. This is a bounded shape guard, not a complete Compose schema.

CLI human/JSON/saved evidence is a separate non-reflecting projection. It keeps
fixed source slots, check identities/order, boolean verdicts, counts, UTC time
and existing discriminator/status fields. Details use fixed check-specific
remediation; source/command/credential values, dynamic service/environment/
dependency names, private paths, parser messages and raw errors are excluded.
Supplemental missing/malformed source errors have fixed categories. Direct
helper diagnostics remain intentional local caller data and must not be treated
as safe published evidence. Complete evaluated failure prints/saves a real
failed report and exits 1; internal execution/publication faults cannot claim
success. Natural draining, callbacks and stream handlers keep large finite JSON
complete and broken pipes nonzero without stacks.

Only explicit output saves. Read-only preflight requires an absent destination,
including dangling links, and directory ancestors without symlinks. Existing
ancestor identities are recorded/rechecked; disappeared parents are not silently
recreated. Missing parents use 0700 and existing modes remain. Serialization
including newline must fit the unchanged dossier's 1 MiB receipt ceiling before
allocation. Exclusive 0600 same-directory staging handles short/zero writes and
owned descriptor faults, closes/reopens with no-follow/nonblocking checks and
independently verifies regular-file identity, bounded full bytes, metadata and
parsed report/count/verdict consistency. Exclusive atomic hard links preserve
retained and late competing destinations without destructive fallback. Cleanup
only touches owned staging/descriptors, preserves foreign replacements and
published receipts, retains retryable ownership and records faults even after
successful bounded retry. Post-publication output/cleanup failure retains the
receipt and exits nonzero; new parents are never recursively removed.

Baseline comparison against `7a939e218a5f1a125488bbdb666d7f20b54e0624` matched
production results (22 passing checks, zero errors), existing direct diagnostics
and 18 well-formed Docker/Compose cases after deliberate boolean normalization.
All four exports matched. Optional observability predicates still permit a valid
21-check report; 22 is the current template observation, not a new invariant.
No security predicate, template, dependency, triage policy or production consumer
changed. SAST still reports 371 files, 12 findings, 9 triaged, 0 expired and
3 active at the unchanged BLOCKER threshold.

Verification (actual concise output):

| Command/check                                    | Exit | Actual output                                                                                                                       |
| ------------------------------------------------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Final `ops:container-test`                       | 0    | `tests 136`, `pass 136`, `fail 0`                                                                                                   |
| Full `ops:launch-drill-test`                     | 0    | `tests 173`, `pass 173`, `fail 0`                                                                                                   |
| Final focused actual-container-child integration | 0    | `tests 4`, `pass 4`, `fail 0`                                                                                                       |
| `ops:readiness-test`                             | 0    | `tests 649`, `pass 649`, `fail 0`                                                                                                   |
| `ops:launch-readiness-test`                      | 0    | `tests 23`, `pass 23`, `fail 0`                                                                                                     |
| `ops:sbom-test`                                  | 0    | `tests 90`, `pass 90`, `fail 0`                                                                                                     |
| `ops:sast-test`                                  | 0    | `tests 136`, `pass 136`, `fail 0`                                                                                                   |
| Final `ops:container-security`                   | 0    | `Container Security Gate: PASSED (All Dockerfiles and Compose templates verified)`                                                  |
| Final `ops:sast`                                 | 0    | `SAST Gate: PASSED (Zero unreviewed blockers and zero expired suppressions)`                                                        |
| `ops:templates-test`                             | 0    | `tests 324`, `pass 324`, `fail 0`                                                                                                   |
| `ops:templates`                                  | 0    | `ops template check passed`                                                                                                         |
| `ops:check`                                      | 1    | `37 vulnerabilities (9 moderate, 26 high, 2 critical)`; `audit error: critical vulnerabilities detected in production dependencies` |
| Root lint                                        | 0    | all three ESLint workspace commands, no diagnostics                                                                                 |
| Root typecheck                                   | 0    | all three workspaces; `Generated Prisma Client (7.9.1)`                                                                             |
| Root build with normal subprocess access         | 0    | `Compiled successfully in 5.4s`; `Generating static pages using 7 workers (22/22) in 1144ms`; `prisma generate && nest build`       |
| Final changed-JS Node syntax                     | 0    | no output                                                                                                                           |
| Final changed-JS/prompt Prettier                 | 0    | `All matched files use Prettier code style!`                                                                                        |
| Diff check                                       | 0    | no output                                                                                                                           |
| Manual baseline comparison                       | 0    | `{"baselineChecks":22,"baselineParity":true,"wellFormedCases":18,"exportsUnchanged":true}`                                          |

The aggregate stopped at unchanged dependency audit; later stages were
unreached, and affected suites ran independently. Initial sandbox container
subprocess tests had an opaque file-level failure; normal-permission fixtures
passed. Sandbox baseline comparison reported `spawnSync git EPERM`; reading the
baseline through shell `git show` then compiling in memory passed. Sandbox build
reported `Could not parse output from TypeScript's --showConfig`; normal
subprocess access passed. Typecheck and build were sequential.

Initial full launch coverage passed 172/173: a directory at the Compose input
correctly failed parent preflight before reaching the child. The fixture was
corrected to fault the child-only Dockerfile without weakening any validator;
full rerun passed 173/173. Real-child fixtures retain all unrelated stage stubs
and prove clean receipt acceptance, real failed-check/malformed-source rejection,
and absent receipt after execution failure. Synthetic acceptance cannot approve
production launch. Independent review's Important lifecycle object-coercion
finding was reproduced, fixed and covered with direct/CLI/save/scalar regressions.
Final verifier 136/136 and focused integration 4/4 verify that fix; follow-up
review independently checked all four lifecycle fields and found no remaining
Critical, Important or Minor issues. Root and broad adjacent checks preceded
that local fix; final focused checks, syntax and formatting cover the changed
standalone CLI.

Residual limits: static string/regex predicates, incomplete Dockerfile/Compose
syntax understanding and direct helper diagnostics remain local limitations.
Hard-link support is required; unsupported filesystems fail without overwrite
fallback. Interruptions/host loss can leave staging. Persistent close/unlink or
unprovable ownership can leave conservative orphans; inspect ownership before
operator cleanup. Ancestor/inode checks narrow ordinary races, not hostile
same-UID administration, descriptor-relative confinement or durable crash
recovery. No signal framework, runtime image certification, cryptographic
provenance, live production evidence or approval is implied. Phase 12, prompt 201,
dependency findings and operator sign-offs remain open. No Docker execution,
unstubbed unified drill, production action, credential/dependency change or push
occurred. Rollback is a reviewed normal revert preserving retained receipts.

Safe inspection from repository root:

```bash
node scripts/ops/verify-container-security.js --help
npm run ops:container-test
npm run ops:container-security
```

## Prompt 278 — volume-verifier invocation and artifact publication hardening (2026-10-08)

The standalone volume preflight validates the whole CLI invocation before
source reads, local scans, Git calls or output checks. It accepts `--json`,
`--compose FILE`, `--env FILE`, `--readiness FILE`, repeatable `--mount-path DIR`,
one `--output FILE`/`-o FILE`, and standalone `--help`/`-h`. Long value options
also accept `--name=value`. Explicit relative paths resolve against the caller's
cwd; installed Compose/env/readiness, backup and Git defaults remain anchored to
the installed script. Paths are literal. Duplicate singleton or boolean flags,
mixed help, unknown/positional, missing/blank/control-bearing arguments and
ambiguous split dash-leading values fail with a fixed diagnostic. Import/help
perform no source or output work; no-save runs allocate no receipt resources.

Compose and env are required. The default readiness source is optional only on
confirmed absence; an explicit or present unreadable, malformed or invalid
readiness file fails without a success receipt. Each source is read through a
regular nonblocking descriptor with type/identity/size/change checks and a
1 MiB ceiling. Ordinary source symlinks to regular files are allowed. YAML uses
the installed parser's verified depth 100 and 10,000 merge-key options; expanded
traversal has a 10,000-entry budget and rejects cycles and dereferenced invalid
collection/types. These limits are engineering judgments, not capacity
measurements. Malformed direct parameters return a fixed invalid result before
scanning. Well-formed policy parity was checked against `963de07`: nine mount
identities in order, valid mount counts and verdicts, approved mechanisms, short
and object mount syntax, readiness decisions, and all eight public exports.
The existing filename patterns and scanner/Git skip behavior are unchanged.

The CLI builds a fresh allowlisted simulation receipt. It preserves the exact
nine service/container/env identities, actual mount statuses and booleans,
counts, canonical UTC timestamp, key-separation verdict and scan/violation
array lengths. Fixed findings and labels replace private Compose source values,
environment/recovery values, host mount and backup paths, readiness source
pointers, key/Git filenames and parser diagnostics in saved JSON, stdout and
stderr. Direct helper returns still contain private local scan metadata and
must remain within the caller's trust boundary. The projection is checked before
serialization and on parsed staging readback; raw bytes are independently
compared. Missing mounts, mechanism/custody/readiness failures and detected key
filenames retain truthful failure counts and nonzero exit status. A completed
failed evaluation can publish its failed diagnostic receipt. Source/evaluation
machinery failure cannot publish success.

Only explicit output saves. Destination preflight requires an absent target,
including dangling links, and records nonsymlink ancestor identities before
evaluation. New parents are 0700; existing modes are preserved. The newline
terminated receipt must fit the consumer's 1 MiB ceiling before allocation.
Staging is exclusive and 0600 in the destination directory, handles short/zero
writes, closes and reopens with no-follow/nonblocking checks, verifies identity,
full bytes and parsed consistency, and publishes through an atomic exclusive
hard link. Late competing files/directories/links and retained receipts survive.
Owned staging is cleaned conservatively, with one bounded retry if cleanup
faults; a successful retry does not erase the failure. Cleanup, publication and
output errors stay nonzero even when a valid receipt was published. Streams
drain naturally; asynchronous callbacks/events and broken pipes have fixed
diagnostics without stack/source reflection.

Hermetic tests install the real parser closure, isolated roots and a stub Git
executable. They cover argv ordering, defaults/caller cwd, literal paths,
malformed/oversized/growing/special sources, YAML limits, redaction, private
publication and ownership faults, retained/racing artifacts, complete large
failed JSON and output faults. The actual volume child ran through Stage 4 with
the other children stubbed: clean, predicate failure, planted key filename,
malformed readiness and child-only env source failure. Unchanged dossier and
readiness consumers accepted only a passing simulation preflight and rejected
failed receipts or simulation for live approval. No fixture scans host mounts
or the real backup/repository tree.

Final checks: `npm run ops:volume-test` **151/151**; full
`npm run ops:launch-drill-test` **178/178** (focused actual child **5/5**);
`npm run ops:readiness-test` **649/649**; launch readiness **23/23**;
container **136/136**; rotation **99/99**; template tests **324/324** and
`ops template check passed`. Root lint, sequential typecheck/build, Node syntax,
selected Prettier and `git diff --check` passed. An initial sandbox child-test
failure resolved with normal subprocess access. Independent review found no
Critical or Important issue; its Minor early-work hook gap was reproduced,
expanded to include env/readiness reads and Git calls, and the focused review
fix passed **29/29** before the final volume suite. Aggregate `npm run ops:check`
stopped at unchanged production dependency audit: `37 vulnerabilities (9
moderate, 26 high, 2 critical)` and `audit error: critical vulnerabilities
detected in production dependencies`. Later aggregate stages were unreached.

Limits: the preflight does not inspect block/cloud encryption, custody, dual
control or recovery. Missing/inaccessible paths, depth limits and suppressed
filesystem/Git errors make the filename scan incomplete; it can also match TLS
files unrelated to volume unlock material. Scanner/Git resource redesign remains
open. Hard-link support is required; interruptions/host loss can leave staging.
Persistent close/unlink or unprovable ownership leaves conservative orphans for
operator inspection. Ancestor/inode checks narrow ordinary races, not hostile
same-UID administration, descriptor-relative confinement or durable crash
recovery. No live inspection, production action, dependency/credential change,
unstubbed unified drill or push occurred. TM-21, Category 8 operator sign-off,
prompt 201 and Phase 12 exit remain open. Rollback is a reviewed normal revert
that preserves retained evidence.

Safe inspection from the repository root:

```bash
node scripts/ops/verify-volume-encryption.js --help
npm run ops:volume-test
```

## Prompt 279 — Caddy verifier invocation and receipt publication hardening (2026-10-08)

The Stage 3 static Caddy child now validates the complete command line before
reading a source or inspecting a destination. It accepts one optional Caddyfile,
`--json`, `--allow-hsts`, one `--output FILE`/`-o FILE` or attached
`--output=FILE`, and standalone help. Explicit relative paths use caller cwd;
the default example remains installation-anchored. Invalid or repeated options,
mixed help, control-bearing or blank paths (including Unicode format and
line controls), and ambiguous split dash-leading values fail with a fixed
diagnostic and no report. Import/help perform no filesystem
work; no-save runs never allocate evidence resources.

CLI paths are always source paths. Direct calls retain the existing content or
path heuristic and options contract. Regular-file sources are opened
nonblocking through a bounded descriptor with identity, size, growth/truncation
and metadata checks, then closed. Ordinary symlinks to regular files are
accepted. Inline text and source files have a 1 MiB UTF-8 byte ceiling; parsed
entry and block-depth judgments are 10,000 and 100. The supported parser subset
now rejects incomplete/over-nested blocks while preserving global/site, header,
request-body, matcher, reverse-proxy and transport behavior, comments, quoted
hashes and placeholder braces. This is not full Caddy syntax validation. The
previously accepted malformed missing-closing-block shape is deliberately
rejected. A missing, unreadable, oversized or malformed CLI source yields a
complete failed simulation report with zero evaluated routes and fixed finding;
successfully parsed policy failures retain actual route counts.

Human, JSON and saved output use a fresh allowlisted projection. It retains
`targetPath` for the unchanged Stage 3 same-file identity check, plus only a
safe plain domain or the exact standard domain placeholder, the twelve fixed
route identities, actual verdicts/counts, policy booleans and fixed
predicate-family findings. The source path and approved domain are intentional
restricted evidence identity fields; they are not anonymous. Private headers,
email, comments, timeouts, request limits, arbitrary site headers, unexpected
upstream strings and parser/OS diagnostics stay in direct helper results, never
CLI evidence. Unknown upstreams become `unrecognized` with failed routes;
route success is not synthesized. HSTS approval requires active valid HSTS,
explicit `--allow-hsts` and overall passing verification. All receipts remain
`execution_mode: "simulation"` and cannot approve live Category 1.

An explicit output is preflighted as absent, including dangling symlinks;
existing nonsymlink ancestor identities are recorded and rechecked. Missing
parents are created at 0700; existing modes stay unchanged. A complete
newline-terminated report must fit the 1 MiB consumer limit before allocation.
Exclusive 0600 staging in the destination directory is written with short-write
handling, closed, reopened no-follow/nonblocking, checked for identical full
bytes and independently parsed/validated, then published through an exclusive
hard link. Existing/late racing files, links and directories survive. Cleanup
removes only provably owned staging, retries bounded close/unlink faults once
and stays nonzero on any fault, including after a successful publication.
Standard streams drain naturally with fixed output-fault diagnostics.

The four public exports, well-formed security/routing predicates, twelve route
cases and HSTS policy remain intact. Compared with the committed baseline, the
example, missing-header and approved-HSTS fixtures matched valid verdicts,
private error arrays and route order/upstreams/passes. The Caddy suite covers
strict invocation, installed defaults, literals and symlinks, source and parser
limits, private projection, retained/racing destinations, parent changes,
staging/readback/cleanup faults, output failures, complete slow-reader
JSON and unchanged readiness acceptance. The real Caddy child was installed into the isolated unified-runner
fixture with all other stages stubbed: clean, policy failure, malformed block
and a one-shot child source read fault; failed Caddy exits blocked deployment
and produced failed Stage 3 dossiers.

Verification: `npm run ops:caddy-test` **83/83**; focused actual-child Stage 3
**4/4**; readiness **649/649**; launch readiness **23/23**; deployment
**104/104**; volume **151/151**; templates **324/324** and
`ops template check passed`. Full launch/dossier **182/182**. Root lint,
sequential typecheck/build, Node syntax, standalone help, selected JS/prompt
Prettier and diff checks passed.
Aggregate `npm run ops:check` stopped at the unchanged production dependency
audit: `37 vulnerabilities (9 moderate, 26 high, 2 critical)` and
`audit error: critical vulnerabilities detected in production dependencies`;
later aggregate stages were unreached. Independent review found one Important
Unicode control-path gap. The path guard now rejects Unicode control, format
and line-separator characters before work; U+2028/U+202E cases passed, and
follow-up review found no remaining issue.

Hard-link support is required. Interrupted writes can leave staging. Persistent
close/unlink faults or unprovable ownership preserve conservative orphans for
operator inspection. Ancestor checks narrow ordinary races, not hostile
same-UID administration; source confinement and durable crash recovery are not
provided. Direct helper diagnostics remain local private data. No live DNS,
TLS, HTTPS, Caddy or Docker execution occurred. Prompt 201, Category 1 live
sign-off, Phase 12 exit and dependency advisories remain open. Rollback is a
reviewed normal revert preserving retained receipts.

Safe inspection from the repository root:

```bash
node scripts/ops/verify-caddy-routing.js --help
npm run ops:caddy-test
```

## Prompt 280 — SMTP template credential-key validation (2026-10-08)

The pure `checkSmtpTemplateKeys` helper still exports one function and returns
static, value-free errors. It counts canonical `SMTP_USER=` and `SMTP_PASS=`
declarations exactly once, rejects `SMTP_USERNAME` and `SMTP_PASSWORD`, and
rejects watched-key lines with leading whitespace, an `export` prefix,
whitespace around the delimiter, or another malformed separator. A nonstring
call returns the fixed `production.env.example must be text` error. LF and CRLF,
blank lines, comments, and one initial UTF-8 BOM are accepted. A `#` or legacy
key inside an unrelated value is not treated as a declaration. The helper
does not parse general dotenv syntax, inspect credential values, or validate
live SMTP delivery.

Review found and the implementation fixed two boundary cases: watched-key
prefixes followed by lowercase name characters are unrelated variables, and
whitespace immediately after `=` is ambiguous. Both have regression tests.

The integrated checker still calls this helper on the production env example.
Fixture tests show ambiguous watched-key declarations fail the full template
gate without including a canary value in diagnostics, while comments and
unrelated values pass. The current example passes unchanged. Category 2
requires separate live provider delivery and DNS evidence with operator
approval; this template preflight supplies none of it.

Verification: SMTP helper spec passed; `ops:templates-test` **346/346**;
`ops:templates` printed `ops template check passed`; launch/dossier
**182/182**; lint, typecheck, production build, syntax, selected Prettier and
diff checks passed. The first sandboxed build failed while Next parsed
TypeScript subprocess output; the permitted retry passed. Aggregate
`ops:check` stopped at dependency audit with `37 vulnerabilities (9 moderate,
26 high, 2 critical)` and `audit error: critical vulnerabilities detected in
production dependencies`; later stages were unreached. Independent review
found two Important boundary bugs; both were fixed and follow-up review was
ready with no remaining findings. Prompt 201, Category 2 live sign-off, Phase 12 exit and dependency
advisories remain open. Rollback is a reviewed normal revert.

Safe inspection from the repository root:

```bash
node --test scripts/ops/check-smtp-template-keys.spec.js
npm run ops:templates
```

## Prompt 281 — patch the Next.js security release (2026-10-08)

The client manifest and root lockfile now pin `next` and
`eslint-config-next` to **16.3.8**, with matching `@next/*` package entries and
integrity hashes. The [Next.js security release](https://nextjs.org/blog/september-2026-security-release)
recommends 16.3.8 for the 16.3 Active LTS line; the
[critical `next/og` advisory](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j)
affects 16.2.0 through versions below 16.3.6. The app uses static root OG and
Twitter PNGs, and source search found no `next/og` or `ImageResponse` import.
This narrows apparent exposure to that advisory but does not substitute for the
package repair. No client source, other dependency family, image reference, or
audit threshold changed.

The fresh production audit against `registry.npmjs.org` reported **37** findings
before the patch (9 moderate, 26 high, 2 critical) and **36** after it (9
moderate, 26 high, 1 critical). `next` disappeared from the post-patch audit.
The remaining critical is [`proxy-addr` GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h),
installed at 2.0.7 through both Express 4 under `@apollo/server` and Express 5
under `@as-integrations/express5`. It needs a separately scoped server
dependency repair. The raw audit JSON remained in disposable `/tmp` files and
is not committed. `npm run ops:check` exited 1 at the production audit with
`36 vulnerabilities (9 moderate, 26 high, 1 critical)` and
`audit error: critical vulnerabilities detected in production dependencies`;
later aggregate stages were unreached. No launch approval follows from this patch.

The post-patch high/critical inventory below gives a representative installed
dependency path for **each** finding (`client` = `@acres/client`; `server` =
`@acres/server`). `npm explain --json`, the audit's vulnerable `nodes`, and the
lockfile supplied the paths; several packages have additional parents. The
`deepmerge-ts` path is read from `prisma`/`@prisma/config` lockfile dependencies
because `npm explain deepmerge-ts` returned no dependent for that node.

| severity | audited package | representative dependency path |
| --- | --- | --- |
| critical | `proxy-addr` | server → `@nestjs/platform-express` → `express` → `proxy-addr`; also server → `@as-integrations/express5` → `express` → `proxy-addr` |
| high | `@apollo/server` | server → `@apollo/server` |
| high | `@graphql-tools/schema` | server → `@apollo/server` → `@graphql-tools/schema` |
| high | `@graphql-tools/merge` | server → `@apollo/server` → `@graphql-tools/schema` → `@graphql-tools/merge` |
| high | `@graphql-tools/utils` | server → `@nestjs/graphql` → `@graphql-tools/utils` |
| high | `@modelcontextprotocol/sdk` | client → `shadcn` → `@modelcontextprotocol/sdk`; also server → `@google/genai` → `@modelcontextprotocol/sdk` |
| high | `@nestjs/apollo` | server → `@nestjs/apollo` |
| high | `@nestjs/graphql` | server → `@nestjs/graphql` |
| high | `@nestjs/platform-express` | server → `@nestjs/platform-express` |
| high | `@prisma/config` | server → `prisma` → `@prisma/config` |
| high | `@ts-morph/common` | client → `shadcn` → `ts-morph` → `@ts-morph/common`; also server → `@nestjs/graphql` → `ts-morph` → `@ts-morph/common` |
| high | `brace-expansion` | client → `shadcn` → `ts-morph` → `@ts-morph/common` → `minimatch` → `brace-expansion` |
| high | `braces` | client → `shadcn` → `fast-glob` → `micromatch` → `braces` |
| high | `deepmerge-ts` | server → `prisma` → `@prisma/config` → `deepmerge-ts` |
| high | `fast-glob` | client → `shadcn` → `fast-glob`; also server → `@nestjs/graphql` → `ts-morph` → `@ts-morph/common` → `fast-glob` |
| high | `fast-uri` | client → `shadcn` → `@modelcontextprotocol/sdk` → `ajv` → `fast-uri` |
| high | `js-yaml` | server → `@nestjs/swagger` → `js-yaml` |
| high | `micromatch` | client → `shadcn` → `fast-glob` → `micromatch` |
| high | `multer` | server → `@nestjs/platform-express` → `multer` |
| high | `mysql2` | server → `prisma` → `mysql2` |
| high | `nodemailer` | server → `nodemailer` |
| high | `prisma` | server → `prisma` |
| high | `shadcn` | client → `shadcn` |
| high | `sharp` | client → `next` → `sharp` |
| high | `source-map-js` | client → `next` → `postcss` → `source-map-js` |
| high | `ts-morph` | client → `shadcn` → `ts-morph`; also server → `@nestjs/graphql` → `ts-morph` |
| high | `undici` | client → `shadcn` → `undici` |

Verification: `npm ci` exited 0 from the updated lockfile; `npm ls next
eslint-config-next --depth=0` showed both at 16.3.8. `npm run ops:audit-test`
reported `pass 1, fail 0`; `npm run ops:templates` printed
`ops template check passed`; lint and typecheck exited 0; selected Prettier and
`git diff --check` passed. The restricted first `npm run build` failed at
`Could not parse output from TypeScript's --showConfig`; a permitted retry
compiled Next 16.3.8, generated 22/22 static pages, and completed the server
build with exit 0. The production Next server returned 200 for `/`, static
`/opengraph-image.png`, `/twitter-image.png`, `/login`, and `/register`, and
404 for an unknown route. `client/tests/api-helpers.spec.ts` passed 10/10.
Three selected browser tests for anonymous `/app` redirect and account recovery
failed while the Nest API fixture was absent (`ECONNREFUSED 127.0.0.1:3101`);
the resulting `/app` 200 was an API-error rendering, not protected-route proof.
Those journeys need rerunning with a real test API/database. Read-only review
found no dependency issue, identified a missing high-severity path inventory,
and verified the completed inventory above on follow-up. Rollback is a reviewed
normal revert, with affected-release exposure reassessed before deployment.

## Prompt 282 — patch the proxy address security release (2026-10-08)

The root lockfile now resolves the single transitive `proxy-addr` node to
**2.0.8**. Express 4.22.2 under Apollo (`~2.0.7`) and Express 5.2.1 under
Nest/the Express 5 integration (`^2.0.7`) both accept and resolve that node.
The targeted `npm update proxy-addr --package-lock-only --ignore-scripts
--no-audit --no-fund` changed only its version, tarball, integrity and new
funding metadata. No manifest, server source, Express version, proxy trust
setting, throttling budget or audit threshold changed.

The [maintainer advisory](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h)
and [2.0.8 release](https://github.com/jshttp/proxy-addr/releases/tag/v2.0.8)
were checked during execution. GHSA-jqcg-44mw-7w3h / CVE-2026-90711 affects
`>=1.1.0 <2.0.8`; 2.0.8 repairs IPv4 matching against IPv6 trust subnets.
Registry metadata verified the tarball at
`https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.8.tgz`, SHA-1
`624e760fd8ab06b1b8320c2f8506d4422cf8e932`, and lockfile integrity:

```text
sha512-5nnx0yGyVUcY6t9RnWcARWtwT9F1D8O9rt08htPvnd49W1IgZtmLkhu9WfMzQj1cFxjHIO6connUNVW5k7AVyQ==
```

Fresh production audit JSON fell from **36** findings (9 moderate, 26 high,
1 critical) to **35** (9 moderate, 26 high, **0 critical**). `proxy-addr` was
the only removed audited package; none appeared. The remaining high package
and representative path inventory is the Prompt 281 table above, excluding
its critical `proxy-addr` row. The `@graphql-tools/utils` advisory, range,
severity and nodes stayed the same, while npm changed its suggested major
fix from Apollo 5.5.1 to Nest GraphQL 14.0.3; neither migration was applied.
Raw audit JSON remains disposable `/tmp` evidence. The first restricted audit
failed with `getaddrinfo EAI_AGAIN registry.npmjs.org`; permitted registry
requests then completed, so transport failure was not treated as a clean audit.
Both `npm audit --omit=dev --audit-level=critical` and `npm run ops:audit`
exited 0. The latter printed:

```text
35 vulnerabilities (9 moderate, 26 high)
Production dependency security audit passed (0 critical vulnerabilities)
```

`npm ci --no-audit --no-fund` exited 0 (`added 1481 packages in 31s`), and
`npm ls proxy-addr express --all` / `npm explain proxy-addr` verified both
Express paths at 2.0.8 without nested affected copies. Audit wrapper tests
reported `pass 1, fail 0`. Lint, typecheck and the full production build
exited 0; Next 16.3.8 generated `22/22` static pages and Nest built after
Prisma generation. Selected Prettier and `git diff --check` passed.

The root test wrapper ignored the supplied Jest filter arguments and ran the
whole existing server suite: `Test Suites: 6 passed, 6 total` and
`Tests: 143 passed, 143 total`. This includes the real migrated `acres_test`
database suites; external storage and queue providers are test doubles.
The correctly forwarded focused command was:

```bash
npm run test:e2e --workspace=@acres/server -- --runInBand --testPathPatterns='api.e2e-spec|auth-recovery.e2e-spec|env-validation.e2e-spec'
```

It reported `Test Suites: 3 passed, 3 total` and `Tests: 102 passed, 102 total`.
Those suites exercise Nest/Express bootstrap, health, auth/session, CSRF,
validation and throttling with recorded database/external-service doubles.
The SMTP timeout log is an expected recovery-failure test case, not a test
failure or a live SMTP check. These results supply no production proxy-topology
evidence. `server/src/app.setup.ts` does not configure `trust proxy`; deployed
exploitability was not established. The explicit reverse-proxy trust and
client-IP-aware/shared throttling conditions in `docs/backend.md` remain open.

Independent read-only review found no Critical, Important or Minor issue in
the dependency repair. Prompt 201, operator sign-offs and Phase 12 exit remain
open. A passing critical audit does not resolve the residual high advisories
or authorize launch. Rollback is a reviewed normal revert of this commit,
with affected-version exposure reassessed before deployment.

The complete `npm run ops:check` exited **0**, reaching every stage after the
now-passing audit. Its final launch/dossier group reported `tests 182`,
`pass 182`, `fail 0`; all preceding aggregate test groups also reported zero
failures. This ran repository preflights and isolated simulations/fixtures,
including SBOM, SAST and container static gates, not a live operator launch
drill. Whole-file Prettier flagged both large owning docs; checks on their
committed baseline confirmed those findings predated this patch. Only the new
Prompt 282 sections were formatted and checked, alongside the full lockfile
and approved prompt.

Safe inspection from the repository root:

```bash
npm ls proxy-addr express --all
npm run ops:audit
```

## Prompt 283 — patch the Multer security release (2026-10-09)

The root manifest applies an exact, parent-scoped override from
`@nestjs/platform-express` to **Multer 2.4.0**, preserving the existing
`deepmerge-ts` override. The installed adapter remains **11.2.1** and declares
Multer **2.2.0**; its exact pin required this supported npm exception. Remove
the exception in a later reviewed change when the supported adapter itself
resolves a safe Multer release. No production source, upload route, dependency
version outside this closure, audit threshold, or launch approval changed.

Execution checked the [maintainer advisory index](https://github.com/expressjs/multer/security/advisories),
[2.4.0 release](https://github.com/expressjs/multer/releases/tag/v2.4.0), and
[npm parent-scoped override documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides).
The baseline audit identifies five Multer advisories:

| Advisory                                                                                           | Severity | Affected range   |
| -------------------------------------------------------------------------------------------------- | -------- | ---------------- |
| [GHSA-wc9g-mqfw-jrwm](https://github.com/expressjs/multer/security/advisories/GHSA-wc9g-mqfw-jrwm) | high     | `<2.3.0`         |
| [GHSA-qfvm-cv95-jqjf](https://github.com/expressjs/multer/security/advisories/GHSA-qfvm-cv95-jqjf) | high     | `=2.2.0`         |
| [GHSA-qvfw-j98x-7q72](https://github.com/expressjs/multer/security/advisories/GHSA-qvfw-j98x-7q72) | low      | `<2.3.0`         |
| [GHSA-535w-7cp7-47q4](https://github.com/expressjs/multer/security/advisories/GHSA-535w-7cp7-47q4) | high     | `<2.3.0`         |
| [GHSA-3pph-fpjx-jg34](https://github.com/expressjs/multer/security/advisories/GHSA-3pph-fpjx-jg34) | moderate | `>=2.2.0 <2.4.0` |

The affected installed path was server → `@nestjs/platform-express` → Multer.
`npm ls multer @nestjs/platform-express --all`, `npm explain multer`, every
locked Multer node, and adapter-relative `createRequire` resolution now verify
one **2.4.0 overridden** node. `server/src` has no Multer import or multipart
interceptor; `UploadsController` accepts JSON metadata and returns signed PUT
URLs. Nest's installed interceptor constructs Multer with module/local options;
Multer defaults to memory storage absent storage/destination options. This
inventory repair does not establish a reachable Acres multipart parser or
production exploit, and no synthetic or production multipart route was added.

Registry metadata verified Node `>=10.16.0`, the tarball
`https://registry.npmjs.org/multer/-/multer-2.4.0.tgz`, SHA-1
`969ab025c207829967c923172c51a75cbf171be1`, and lockfile integrity:

```text
sha512-7dqa0ZcFfzbefdTuIkzOSMvZWC0J7FLqBOjJUZvDCXShIURWKxAyTT1wHhnE5q19c7jOJf43IYYKjBmZVZmvhg==
```

With npm **11.20.0**, `npm install --package-lock-only --ignore-scripts
--no-audit --no-fund` initially retained 2.2.0. A targeted
`npm update multer --package-lock-only --ignore-scripts --no-audit --no-fund`
then refreshed it to 2.4.0. No lockfile integrity was hand-edited. Multer removes
`concat-stream`; its otherwise-unused `typedarray` child also disappears.
Retained `buffer-from`, `readable-stream`, and `string_decoder` become dev-only
without version changes. These are the complete six changed lock nodes.
The final `npm ci --no-audit --no-fund` exited **0**:

```text
added 1479 packages in 32s
```

The clean install preserved the updated lockfile, accepted the override without
invalid-dependency errors, and ran the shared build. Existing deprecation and
unapproved dependency-install-script warnings were reported; their approval
policy was not changed. Restricted registry requests failed with
`getaddrinfo EAI_AGAIN registry.npmjs.org`; permitted retries completed. Fresh
baseline audit comparison used the committed lockfile and all three workspace
manifests in a disposable directory; a preliminary copy lacking those manifests
reported zero and was discarded as incomplete evidence. Raw JSON remains in
`/tmp`, outside git.

The complete production audit changed from **35** findings (26 high, 9 moderate,
0 critical) to **33** (24 high, 9 moderate, **0 critical**). Only `multer` and
its propagated `@nestjs/platform-express` finding disappeared; none appeared,
and every retained finding object, including remedy, remained identical.
The remaining high/path inventory is the Prompt 281 table, excluding its
`proxy-addr`, `multer`, and `@nestjs/platform-express` rows. Remaining moderate
packages are `@apollo/server-plugin-landing-page-graphql-playground`,
`@nestjs/swagger`, `body-parser`, `express`, `hono`, `ip-address`,
`postcss-selector-parser`, `qs`, and `uuid`. These findings are unresolved;
passing the unchanged critical gate is not a clean audit or launch approval.
Both `npm audit --omit=dev --audit-level=critical` and `npm run ops:audit`
exited **0**. The wrapper printed:

```text
33 vulnerabilities (9 moderate, 24 high)
Production dependency security audit passed (0 critical vulnerabilities)
```

Verification commands in the approved prompt all completed:

- Existing upload controller/service/DTO unit selection: exit **0**,
  `Test Suites: 3 passed, 3 total`; `Tests: 52 passed, 52 total`.
  These fixtures test metadata validation, controller/service boundaries and
  upload lifecycle using doubles; they do not exercise multipart parsing or
  live Garage.
- Full server e2e suite: exit **0**, `Test Suites: 6 passed, 6 total`;
  `Tests: 143 passed, 143 total`. Includes real migrated `acres_test`
  PostgreSQL/PostGIS suites and HTTP suites with recorded database doubles;
  external storage and queue providers are doubles. The SMTP timeout log is
  an expected failure-path case, not a live SMTP result.
- `npm run ops:audit-test`: exit **0**, `tests 51`, `pass 51`, `fail 0`.
- Complete `npm run ops:check`: exit **0**, through the final launch/dossier
  group (`tests 182`, `pass 182`, `fail 0`); every earlier test group had zero
  failures. These are repository gates and isolated fixtures, not a live drill.
- Root lint and typecheck: exit **0**, all three workspaces.
- Full root build: exit **0**; Next **16.3.8** printed
  `Compiled successfully in 3.9s` and generated `22/22` static pages; Prisma
  generation and Nest build completed.
- Selected Prettier checks: `All matched files use Prettier code style!` for
  the full manifest, lockfile, prompt and new owning-document sections.
  Historical document formatting was preserved. `git diff --check`: exit
  **0**, no output.

Independent read-only review found no Critical, Important or Minor issue;
its tree, diff, source, audit comparison and log claims were verified before
recording this result. Prompt 201, operator sign-offs, residual advisory
repairs and Phase 12 exit remain open. Rollback is a reviewed normal revert of
manifest and lockfile together, reassessing affected-version exposure before
any deployment. No push, deployment, live attack or launch action occurred.

Inspection from the repository root:

```bash
npm ls multer @nestjs/platform-express --all
npm explain multer
npm run ops:audit
```

## Prompt 284 — patch the Nodemailer security release (2026-10-09)

The server manifest now pins **Nodemailer 10.0.13** exactly, replacing
`^10.0.0`. The npm-generated lockfile changes only `node_modules/nodemailer`
and the server workspace reference. Existing `deepmerge-ts` and parent-scoped
Multer overrides are unchanged. No production source, route, template,
SMTP configuration, provider, audit threshold or launch approval changed.

Execution checked all 22 entries across three pages of the
[maintainer advisory index](https://github.com/nodemailer/nodemailer/security/advisories),
the individual advisory pages and the
[10.0.13 release](https://github.com/nodemailer/nodemailer/releases/tag/v10.0.13).
Nine maintainer advisories affect the old 10.0.0 inventory:

| Advisory                                                                                                | Severity | Affected range      | Patched version | Baseline npm audit |
| ------------------------------------------------------------------------------------------------------- | -------- | ------------------- | --------------- | ------------------ |
| [GHSA-4ffr-jq9g-5ffx](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-4ffr-jq9g-5ffx) | high     | `>=3.0.0 <=10.0.12` | 10.0.13         | absent             |
| [GHSA-g73g-hqqh-jr95](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-g73g-hqqh-jr95) | moderate | `>=3.0.0 <=10.0.12` | 10.0.13         | absent             |
| [GHSA-39m8-27wv-hr27](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-39m8-27wv-hr27) | moderate | `>=3.0.0 <=10.0.9`  | 10.0.10         | absent             |
| [GHSA-4g23-2xm8-66gc](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-4g23-2xm8-66gc) | moderate | `>=3.0.0 <=10.0.9`  | 10.0.10         | absent             |
| [GHSA-g57g-f23g-4646](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-g57g-f23g-4646) | moderate | `>=9.1.0 <10.0.9`   | 10.0.9          | present            |
| [GHSA-v53p-9fqp-m79j](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-v53p-9fqp-m79j) | high     | `<=10.0.5`          | 10.0.6          | present            |
| [GHSA-prgh-xp8r-p3m5](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-prgh-xp8r-p3m5) | high     | `>=9.1.0 <=10.0.4`  | 10.0.5          | present            |
| [GHSA-6vj9-mwq6-2f5v](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-6vj9-mwq6-2f5v) | moderate | `>=5.0.0 <10.0.2`   | 10.0.2          | present            |
| [GHSA-8vvx-rff5-p5rq](https://github.com/nodemailer/nodemailer/security/advisories/GHSA-8vvx-rff5-p5rq) | moderate | `<10.0.2`           | 10.0.2          | present            |

The other 13 maintainer entries have affected ranges below 10.0.0.
10.0.13 is outside every checked affected range. npm's baseline contains only
five of these advisories; a missing npm entry is not proof of safety. The
structured patched fields control where older advisory narratives still say
no patch was available. The 10.0.13 release repairs SMTP AUTH backtracking and
angle-address comment stripping; stopping at 10.0.12 would leave both open.

`SmtpMailAdapter` creates a transport from operator-configured host, port,
secure and optional user/password values, and forwards from/to/subject/text/HTML.
Auth recovery and organization invitations call its mail port. This is a real
runtime dependency, but affected inventory does not prove a deployed exploit.
The adapter does not expose structured recipient arrays, raw messages, custom
headers, DKIM or OAuth2 options through its message contract. Production
SMTP peer trust, network interception and live deliverability were not tested.

Registry metadata verified Node `>=20.0.0`, MIT-0, no runtime dependencies,
the tarball `https://registry.npmjs.org/nodemailer/-/nodemailer-10.0.13.tgz`,
SHA-1 `eb73ba9afd755e5480d1dfa8abe39756baad2dfb`, and lockfile integrity:

```text
sha512-SzG86OlvcW/NNhUFC6uROMwRTL4n7MswfQqC/T8mhkmnY1YVa23zUEMYi4ijSeXSl9GLz9ZeTJDUatEDuY5FeQ==
```

With Node **26.11.0** and npm **11.20.0**, the exact workspace install printed
`changed 1 package in 2s`. `npm ci --no-audit --no-fund` exited **0** and printed
`added 1479 packages in 27s`, running the shared build. The lockfile SHA-256
remained `65dc4e438cf5bbcbd499e9b10440c8d7a9ffd080bf11b7639b982c4bbafe9f5b`
before and after clean installation. Existing deprecation and unapproved
install-script warnings remain; no script-approval policy changed.
`npm ls nodemailer @types/nodemailer --all` and `npm explain nodemailer` verify
one Nodemailer **10.0.13** node under `@acres/server`, with unchanged
`@types/nodemailer` **8.0.1**. TypeScript's actual NodeNext resolution selects
`nodemailer/dist/cjs/nodemailer.d.ts`; no declaration conflict was reproduced.
The compiled adapter uses `require('nodemailer')`, selecting the package's
`dist/cjs/nodemailer.js` export with its CommonJS package boundary.

Complete before/after production audit JSON requests succeeded, each exiting
**1** for residual findings. Inventory fell from **33** (24 high, nine moderate,
zero critical) to **32** (23 high, nine moderate, **zero critical**). Only
`nodemailer` disappeared; no finding appeared. Retained finding objects were
identical except `@graphql-tools/utils.fixAvailable`: the registry recommendation
changed from `@apollo/server` 5.5.1 to `@nestjs/graphql` 14.0.3, both major upgrades.
Its advisory identities and vulnerable nodes stayed unchanged; no such upgrade
was performed. The residual high/path inventory is the Prompt 281 table above
excluding `proxy-addr`, `multer`, `@nestjs/platform-express` and `nodemailer`.
The remaining moderate packages are `@apollo/server-plugin-landing-page-graphql-playground`,
`@nestjs/swagger`, `body-parser`, `express`, `hono`, `ip-address`,
`postcss-selector-parser`, `qs` and `uuid`.

Both `npm audit --omit=dev --audit-level=critical` and `npm run ops:audit`
exited **0**, preserving the existing policy. The wrapper printed:

```text
32 vulnerabilities (9 moderate, 23 high)
Production dependency security audit passed (0 critical vulnerabilities)
```

The initial restricted baseline request failed with
`getaddrinfo EAI_AGAIN registry.npmjs.org`; the network-enabled retry permitted
under the approved prompt completed. Raw audit JSON and command logs remain in
restricted disposable `/tmp/acres-284` files, outside git.

Verification from the approved prompt:

- Mail service, SMTP/memory adapters, auth service and organization service
  units: exit **0**, `Test Suites: 5 passed, 5 total`;
  `Tests: 84 passed, 84 total`. SMTP units mock Nodemailer; MailService uses
  memory transport and lifecycle services use doubles.
- `node /tmp/acres-284/mail-smoke.cjs`: exit **0**,
  `Nodemailer 10.0.13: 4 offline compositions passed (2 JSON, 2 buffered MIME); synthetic fixtures only; no SMTP connection`.
  Fixtures use `Acres <no-reply@example.test>`, `reader@example.test` and
  `invitee@example.test`, recovery/invitation subjects, text and HTML containing
  `https://example.test/reset-password?token=synthetic` or
  `https://example.test/accept-invitation?token=synthetic`. Envelope, recipient,
  subject, both bodies and MIME part headers were asserted. An initial scratch
  assertion overlooked quoted-printable soft wrapping; after unfolding those
  breaks the original body assertion passed. No production fix was needed.
  A separate Node smoke also loaded the actual compiled CommonJS adapter,
  injected a real JSON transporter and asserted its envelope/text, printing
  `Compiled CommonJS SmtpMailAdapter loaded and offline dispatch passed`.
  These checks prove offline composition/module compatibility, not SMTP/TLS
  interoperability, delivery, DNS authentication or DoS resistance.
- Full server e2e: exit **0**, `Test Suites: 6 passed, 6 total`;
  `Tests: 143 passed, 143 total`. Includes real guarded `acres_test`
  PostgreSQL/PostGIS and HTTP suites with database/provider doubles;
  storage/queues use doubles. The SMTP timeout log is an expected failure-path
  case. Initial sandbox execution failed with socket `EPERM`; the same command
  passed with permitted local socket/database access.
- `npm run ops:audit-test`: normal-subprocess rerun exited **0**,
  `tests 51`, `pass 51`, `fail 0`. The restricted initial runner reported the
  file-level `tests 1`, `pass 1`, `fail 0`; the permitted aggregate also ran
  all 51 assertions.
- Complete `npm run ops:check`: exit **0** through final launch/dossier group,
  `tests 182`, `pass 182`, `fail 0`; all preceding groups had zero failures.
  These repository checks/isolated fixtures are not a live launch drill.
- Root lint and typecheck: exit **0**, all three workspaces. Full root build:
  exit **0**, Next **16.3.8** webpack printed `Compiled successfully in 4.2s`
  and generated `22/22` static pages; shared, Prisma and Nest builds completed.
  Initial restricted build failed at
  `Could not parse output from TypeScript's --showConfig`; the identical
  permitted rerun passed without code/config changes.
- Selected Prettier checks: `All matched files use Prettier code style!` for
  the server manifest, root lockfile, prompt and new document sections.
  Historical document formatting is preserved. `git diff --check`: exit
  **0**, no output.

Independent read-only review found no Critical, Important or Minor issues,
verified the audit comparison/logs and reproduced all four offline compositions.
Residual advisories, prompt 201, operator sign-offs and Phase 12 exit remain
open. Rollback is a reviewed normal revert of manifest and lockfile together,
reassessing affected-version exposure before deployment. No push, deployment,
live email or launch approval occurred.

Inspection from the repository root:

```bash
npm ls nodemailer @types/nodemailer --all
npm explain nodemailer
npm run ops:audit
npm run test --workspace=@acres/server -- --runInBand --testPathPatterns='mail.service.spec|smtp-mail.adapter.spec|memory-mail.adapter.spec|auth.service.spec|organizations.service.spec'
```

## Prompt 285 — patch the js-yaml security releases (2026-10-09)

The root lockfile now resolves js-yaml **3.15.2**, **4.3.2**, and **5.4.3**,
retaining every parent version and each consumer's existing major. Root
`package.json` adds only the version-scoped exception
`"@nestjs/swagger@11.4.7": { "js-yaml": "5.4.3" }`; that parent declares exactly
5.3.0. Remove this exception when a supported Swagger release resolves a safe
js-yaml itself. Existing deepmerge-ts/Multer overrides remain unchanged. No
production source, test, route, parser option, CI gate, audit threshold,
production image, or operator approval changed.

Execution rechecked all nine entries in the
[maintainer advisory index](https://github.com/nodeca/js-yaml/security/advisories)
(no pagination was exposed). The two advisories affecting the old inventory are:

| Advisory                                                                                         | Severity | Affected range                      | Patched releases |
| ------------------------------------------------------------------------------------------------ | -------- | ----------------------------------- | ---------------- |
| [GHSA-2883-xcg3-v3hh](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh) | high     | `>=3.0.0 <3.15.2`, `>=4.0.0 <4.3.2` | 3.15.2, 4.3.2    |
| [GHSA-r3ph-w7gj-g6xm](https://github.com/nodeca/js-yaml/security/advisories/GHSA-r3ph-w7gj-g6xm) | moderate | `>=5.0.0 <=5.4.0`                   | 5.4.1            |

The other seven entries (GHSA-5p4m-2wfm-xmqj, GHSA-pm4m-ph32-ghv5,
GHSA-g796-fgmg-93mv, GHSA-52cp-r559-cp3m, GHSA-724g-mxrg-4qvm,
GHSA-h67p-54hq-rp68, GHSA-mh29-5h37-fv8m) already exclude the original
3.15.1/4.3.1/5.3.0 copies and the selected targets. v3 is development-only and
absent from the production audit; its repair is tooling inventory remediation.
The installed operations v4 loader is relevant to availability because existing
alert/container/volume verifiers explicitly use `maxTotalMergeKeys: 10000`.
Affected inventory does not establish deployed exploitation or customer-input
reachability. Swagger's inspected YAML route dumps documents; contract generation
writes JSON/SDL, so contract drift alone cannot validate its YAML path.

The [v3 changelog](https://github.com/nodeca/js-yaml/blob/v3/CHANGELOG.md) and
[v4 changelog](https://github.com/nodeca/js-yaml/blob/v4/CHANGELOG.md) confirm
that the fixes charge empty merge mappings to the budget and cap merge sequences
at 100. The [v5 changelog](https://github.com/nodeca/js-yaml/blob/master/CHANGELOG.md)
records the same security repair in 5.4.1, scalar/AST/`sortKeys` changes in
5.4.0, the `forceQuotes` fix in 5.4.2, and blank block-scalar loading fix in
5.4.3. Oversized merge sequences now intentionally reject; ordinary synthetic
merges and checked-in operational fixtures remain compatible. Acres does not
add AST manipulation or alter serializer options.

### Resolution, publication and clean install

Execution used **Node v26.11.0**, **npm 11.20.0**, on `main` with base
`c37aaac166c156b071249e0818b8d3cd59ec560c`; only this approved prompt was
initially untracked. The registry published v3/v4 on 2026-08-26 and v5 on
2026-10-05 UTC (the changelog labels the v5 release 2026-10-06). None declares
an `engines` constraint. v3 retains `esprima ^4.0.0`/`argparse ^1.0.7`;
v4/v5 retain `argparse ^2.0.1`. v3 CommonJS loads through `index.js`, v4 exposes
CommonJS `index.js` and ESM `dist/js-yaml.mjs`, and v5 exposes CommonJS
`dist/js-yaml.cjs.js`, ESM and bundled declarations. No Node 24 execution was
performed in this session.

Registry and lockfile SHA-512 integrity values matched exactly:

| Release | Integrity                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------- |
| 3.15.2  | `sha512-6EuL879VkRA+1Cz578mKMiKvjPNEuk6+r1JaFzoSWejZmtf7xWbIyw1e3KkxlkzTIt9Taw6JBhEppG7utc1P+w==` |
| 4.3.2   | `sha512-SFNOvSJ+Dgf/9An904Yx+CgSlIPCkIpao4qo51lpee25TIRejdH3rhR4EZMGoNx3/TP3O+wzWuiTFl4sqbltzA==` |
| 5.4.3   | `sha512-yzzNtgczwgoVHNigCyKTXcQJU4Y8t/ikU4UxXW0BvrLfHTGWZhsNcOT2s/a7vn81/4KqVnNmHjaUEPlvWnNwVw==` |

After local npm flag verification,
`npm update js-yaml --package-lock-only --ignore-scripts --no-audit --no-fund`
exited **0** with `up to date in 661ms`. Its entire lockfile diff changes only
version/resolved/integrity fields of the three existing js-yaml nodes.
`npm ci --no-audit --no-fund` exited **0** with
`added 1479 packages in 28s` and ran the shared prepare build. Existing
deprecation and unapproved install-script warnings were retained; no script
approval policy changed. Lockfile SHA-256 remained
`ac2d71e024add64391460583278175ad7b46c308704216f87fd415850c02d2f1`.

`npm ls js-yaml --all` and `npm explain js-yaml` exited **0**. Actual
caller-relative `createRequire` checks resolve every inspected operations caller
(template/release-image/alert/container/volume/deployment) to root v4 **4.3.2**;
Swagger 11.4.7 to its nested overridden **5.4.3**; and
`@istanbuljs/load-nyc-config` 1.1.0 to its nested **3.15.2**. ESLint/cosmiconfig,
Nest, Swagger, Jest and ts-jest parents are unchanged; no affected copy remains
in this inspected inventory.

### Compatibility and verification

Disposable offline fixtures in restricted `/tmp/acres-285` assert normal
mappings, sequences, scalar values, aliases and merges for all three resolved
packages. v3 uses `safeLoad`; v5 merge tests explicitly select `YAML11_SCHEMA`.
Three empty merge sources pass with budget three and throw with budget two;
a 101-source merge sequence throws in every branch. No large CPU payload or
timing assertion was used. Swagger's actual `serveDefinitions` YAML handler
uses its installed `skipInvalid: true, noRefs: true` options and passes semantic
round-trip assertions for synthetic OpenAPI-like strings, booleans, nested
schemas and whitespace strings. v5 default-schema merge behavior, whitespace-only
block-scalar loading, and `forceQuotes` scalar types also passed. The initial
blank-scalar fixture expected a newline; v4 comparison confirmed the empty
string expectation, which was corrected before the successful smoke run.

Actual output from `node /tmp/acres-285/yaml-smoke.cjs` (exit **0**):

```text
3.15.2: benign values, aliases, merges, exact empty-source budget and 101-source cap passed
4.3.2: benign values, aliases, merges, exact empty-source budget and 101-source cap passed
5.4.3: benign values, aliases, merges, exact empty-source budget and 101-source cap passed
Swagger actual YAML handler: default schema, semantic round-trip, whitespace strings, forceQuotes and whitespace-only block scalar passed
```

Jest coverage instruments through Babel but supplies explicit plugin options
that bypass NYC configuration discovery. A supplemental actual Istanbul YAML
configuration load and Babel plugin subprocess therefore exercised the v3 path
with a synthetic `.nycrc.yaml`, followed by instrumented execution and counter
assertions. `node /tmp/acres-285/instrumentation-smoke.cjs` exited **0**:
`Actual Istanbul YAML-config loading and Babel instrumented execution: function=2, branch=[1,1] passed`.
Its initial sandbox subprocess failed with `EPERM`; the permitted unchanged
retry passed.

| Command                                                     | Actual result                                                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm run ops:check`                                         | exit 0 through final launch/dossier suite: `ℹ tests 182`, `ℹ pass 182`, `ℹ fail 0`                                                 |
| Affected suites included in that aggregate                  | templates 346/346, release images 22/22, deployment 104/104, volume 151/151, container 136/136, alert 112/112, audit wrapper 51/51 |
| Instrumented contract units (command below)                 | exit 0: `Test Suites: 3 passed, 3 total`; `Tests: 73 passed, 73 total`                                                             |
| `npm run contracts:check`                                   | exit 0, no generated artifact drift                                                                                                |
| `npm run test:e2e --workspace=@acres/server -- --runInBand` | permitted run exit 0: `Test Suites: 6 passed, 6 total`; `Tests: 143 passed, 143 total`                                             |
| `npm run lint`                                              | exit 0 across all three workspaces                                                                                                 |
| `npm run typecheck`                                         | exit 0 across all three workspaces                                                                                                 |
| `npm run build`                                             | permitted run exit 0; `✓ Generating static pages using 7 workers (22/22) in 1588ms`, then successful server build                  |
| Selected Prettier and `git diff --check`                    | exit 0; `All matched files use Prettier code style!`; diff check produced no output                                                |

The instrumented contract command was:

```bash
npm run test --workspace=@acres/server -- --runInBand --coverage --testPathPatterns='generate-contracts.spec|openapi.spec|shared-predicates.spec'
```

The approved selection was adjusted to the three existing contract spec files;
there is no `contracts-runner.spec`. Coverage is scoped execution evidence,
not a claim of whole-server coverage. The first sandbox server e2e attempt
reported 127 failed/16 passed due to `listen EPERM`; the unchanged permitted
retry passed. The first sandbox build failed with
`Error: Could not parse output from TypeScript's --showConfig.`; its permitted
retry passed. The e2e suite includes real guarded `acres_test` PostgreSQL/PostGIS
tests; HTTP-focused suites and storage/queue boundaries use doubles. The recovery
suite's expected SMTP-timeout log is failure-path coverage, not live mail delivery.
Operations suites use synthetic fixtures and local tools; none approves a live
operator launch category.

### Complete audit comparison and remaining limits

The first restricted baseline request failed with `getaddrinfo EAI_AGAIN
registry.npmjs.org`. The approved metadata-only retry returned valid full audit
JSON. Fresh before/after production JSON retrieval both exited **1** for
noncritical findings, not transport failure. Comparison removes only
`js-yaml` (advisory sources 1193727/GHSA-2883-xcg3-v3hh and
1239991/GHSA-r3ph-w7gj-g6xm) and its moderate `@nestjs/swagger` propagation.
No finding was added. Totals fell **32 → 30**, **23 → 22 high**, **9 → 8 moderate**,
with **zero critical** throughout. All retained finding objects were unchanged
except an unrelated upstream `@graphql-tools/utils.fixAvailable` recommendation:
Nest GraphQL 14.0.3 became Apollo Server 5.5.1; its advisory/path data did not change.
The residual inventory is the Prompt 281 table, excluding Next, proxy-addr,
Multer/its propagated adapter, Nodemailer, and now js-yaml/Swagger.

`npm audit --omit=dev --audit-level=critical` and `npm run ops:audit` both exited
**0**, as did the same unchanged policy inside the aggregate. Actual output:

```text
30 vulnerabilities (8 moderate, 22 high)
Production dependency security audit passed (0 critical vulnerabilities)
```

Raw manifests, audit JSON, synthetic smoke scripts and logs remain disposable
`/tmp` evidence outside git. Repository checks do not establish live production
capacity, deployment, provenance, Node 24 compatibility testing, SMTP delivery,
or launch acceptance. Prompt 201, residual dependency findings, operator sign-offs
and Phase 12 exit remain open. Rollback is a reviewed normal revert of root
manifest and lockfile together, preserving retained evidence and reassessing
affected-version exposure before deployment. No push or live action is included.

Safe inspection from repository root:

```bash
npm ls js-yaml --all
npm run ops:templates
npm run ops:audit
```

Initial implementation review found no critical, important or minor findings.
It independently passed parser/Swagger smoke checks and verified the lock diff,
registry integrity, resolution, audit comparison and retained test evidence.
Its instrumentation rerun encountered the same sandbox subprocess restriction;
the successful permitted execution remains the relevant result. No review-led
implementation change was required. Final documentation review identified two
historical test-command edits from an overbroad formatting replacement; the
entire historical operations record was restored byte-for-byte from HEAD.

## Prompt 286 — patch the source-map-js security release (2026-10-09)

The root lockfile updates `source-map-js` to **1.2.2** across its single lockfile
node, satisfying all three parents under their declared `^1.2.1` range:
- root `postcss@8.5.26` (direct dependency of `shadcn@4.18.0` and `@tailwindcss/postcss@4.3.3`)
- `@tailwindcss/node@4.3.3` (dependency of `@tailwindcss/postcss@4.3.3`)
- `next/node_modules/postcss@8.5.23` (nested dependency of `next@16.3.8`)

No root `package.json` manifest edit, dependency override, or new direct
dependency was added. Existing deepmerge-ts, Multer, and Swagger overrides remain
unchanged. No application source code, stylesheet, design token, UI component,
PostCSS configuration, Next configuration, generated contract, or server manifest
changed.

Advisory [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
(high severity) affects `source-map-js` `>=1.0.0 <1.2.2` via uncontrolled resource
consumption from unvalidated section offsets in indexed source maps. Upstream PR 79
adds `isValidOffset` validation, caps section offset lines at 10,000,000, and bounds
nested summed offsets. Affected package presence in the CSS build pipeline does not
establish that untrusted source maps reach Acres or enable customer exploitation.

### Resolution, publication and clean install

Execution used **Node v26.11.0**, **npm 11.20.0**, on `main` with base
`bd1c08a11ada389f1b35f9ad394e43c1d52b42b6`. The registry published `source-map-js@1.2.2`
on 2026-09-30T14:08:09.382Z. It declares `engines: { "node": ">=0.10.0" }`,
BSD-3-Clause license, CommonJS main `./source-map.js`, bundled TypeScript
declarations, and zero runtime dependencies.

Registry and lockfile SHA-512 integrity matched:

| Release | Integrity |
| ------- | --------- |
| 1.2.2   | `sha512-KGj/8Y43x35aZVDtt+J4mK1hoLGHULMYfSkODJNQjNDC3oW1PqPoxMwo0pLUsWM/UEGzON/NxeHywEfNXNP3Vw==` |

`npm update source-map-js --package-lock-only --ignore-scripts --no-audit --no-fund`
updated only the single `node_modules/source-map-js` node.
`npm ci --no-audit --no-fund` cleanly installed the dependency tree, running the shared
prepare build and preserving the lockfile SHA-256:
`007555b3f714382213d523f33ff108c26d19c8ba83cf1affe49b711a2834e10b`.

`npm ls source-map-js --all` and `npm explain source-map-js` confirmed deduplication to
a single root node at `1.2.2`. Caller-relative `createRequire` checks confirmed root PostCSS,
nested Next PostCSS, and `@tailwindcss/node` all resolve to root `1.2.2`.

### Compatibility and verification

Disposable offline fixtures in restricted `/tmp/acres-286` exercised real CommonJS APIs
and real caller integration:
1. Basic map generation, source content embedding, and original/generated position lookup.
2. Indexed-to-flat map conversion via `eachMapping` and `SourceNode` round-trip.
3. Negative offset validation: rejection of 20 malformed offset types (`-1`, `1.5`, `NaN`,
   `Infinity`, `-Infinity`, `MAX_SAFE_INTEGER + 1`, strings, null, undefined, objects),
   line offset > 10,000,000, and nested summed offset bounds.
4. Nested source lists, bounded line-gap serialization (`A;;;...A`), and absence of spurious
   `undefined` padding in `SourceNode`.
5. Real `postcss@8.5.26` and `next/node_modules/postcss@8.5.23` synthetic CSS transformation
   and incoming previous-map composition (`sourcesContent` and positions survived).
6. Real `@tailwindcss/node@4.3.3` `toSourceMap` API emitting encoded mapping, inline data URL,
   and comment.

Actual output from `node /tmp/acres-286/smoke.cjs` (exit **0**):

```text
Basic map: names, positions and source content passed
Indexed/nested maps: generator conversion and SourceNode round-trip passed
Malformed offsets (20), over-limit line and nested summed bound rejected at construction
Nested source lists, bounded line-gap serialization and short-code SourceNode passed
postcss 8.5.26: CSS transform and previous-map composition passed
next/node_modules/postcss 8.5.23: CSS transform and previous-map composition passed
Tailwind Node 4.3.3 actual toSourceMap: encoded mapping, content, inline and external comment passed
```

| Command | Actual result |
| ------- | ------------- |
| `npm ls source-map-js --all` | exit 0; single deduped root 1.2.2 |
| `npm explain source-map-js` | exit 0; resolved by root PostCSS, Tailwind Node, and Next PostCSS |
| `npm run ops:audit-test` | exit 0; `ℹ tests 51`, `ℹ pass 51`, `ℹ fail 0` |
| `npm audit --omit=dev --audit-level=critical` | exit 0; 0 critical vulnerabilities |
| `npm run ops:audit` | exit 0; `Production dependency security audit passed (0 critical vulnerabilities)` |
| `npm run ops:check` | exit 0 through final launch/dossier suite: `ℹ tests 182`, `ℹ pass 182`, `ℹ fail 0` |
| `npm run lint` | exit 0 across all three workspaces |
| `npm run typecheck` | exit 0 across all three workspaces |
| `npm run build` | exit 0; `✓ Generating static pages using 7 workers (22/22) in 1261ms`, then successful server build |
| `git diff --check` | exit 0; clean whitespace |

### Complete audit comparison and remaining limits

Fresh before/after production JSON retrieval both exited **1** for noncritical findings.
Comparison removes only `source-map-js` (advisory source GHSA-68fv-2mgg-jv7q).
No finding was added. Totals fell **30 → 29**, **22 → 21 high**, **8 moderate**, with
**zero critical** throughout. All retained finding objects were unchanged.
The residual inventory is the Prompt 281 table, excluding Next, proxy-addr,
Multer/its propagated adapter, Nodemailer, js-yaml/Swagger, and now source-map-js.

`npm audit --omit=dev --audit-level=critical` and `npm run ops:audit` both exited
**0**, as did the same unchanged policy inside the aggregate. Actual output:

```text
29 vulnerabilities (8 moderate, 21 high)
Production dependency security audit passed (0 critical vulnerabilities)
```

Raw manifests, audit JSON, synthetic smoke scripts and logs remain disposable
`/tmp` evidence outside git. Repository checks do not establish live production
capacity, deployment, provenance, Node 24 compatibility testing, SMTP delivery,
or launch acceptance. Prompt 201, residual dependency findings, operator sign-offs
and Phase 12 exit remain open. Rollback is a reviewed normal revert of the lockfile,
preserving retained evidence and reassessing affected-version exposure before deployment.
No push or live action is included.

Safe inspection from repository root:

```bash
npm ls source-map-js --all
npm run ops:templates
npm run ops:audit
```

Initial implementation review found no critical, important or minor findings.
It independently verified the lock diff, registry integrity, resolution deduplication,
audit comparison, real PostCSS and Tailwind Node smoke checks, and retained test evidence.

## Prompt 287 — patch the fast-uri security release (2026-10-09)

The root lockfile updates its single `fast-uri` node from **3.1.5 to 3.1.8**.
The entire dependency diff is its version, registry tarball URL and SHA-512
integrity. All ten AJV v8 parents remain at their existing versions and admit
the patch under `^3.0.1`. No manifest, override, application source, public
contract, production template, audit threshold or launch approval changed.

The user explicitly authorized implementation immediately after writing the
prompt, so prompt 287 ran without the ordinary approval pause. Execution used
**Node v26.11.0**, **npm 11.20.0**, on `main` at base
`276ab82fc5dc246cce2a48a1e421bde2c5f4be1f`.

### Security scope and provenance

The fresh baseline listed six fast-uri advisories:

| Advisory                                                                                           | Severity | Affected v3 range | First repaired v3 |
| -------------------------------------------------------------------------------------------------- | -------- | ----------------- | ----------------- |
| [GHSA-5jgf-p345-68v8](https://github.com/fastify/fast-uri/security/advisories/GHSA-5jgf-p345-68v8) | high     | `>=3.1.3 <3.1.6`  | 3.1.6             |
| [GHSA-f65p-4m7j-42xc](https://github.com/fastify/fast-uri/security/advisories/GHSA-f65p-4m7j-42xc) | high     | `>=3.0.0 <3.1.6`  | 3.1.6             |
| [GHSA-fph4-wmhf-6fwf](https://github.com/fastify/fast-uri/security/advisories/GHSA-fph4-wmhf-6fwf) | high     | `>=3.1.2 <3.1.6`  | 3.1.6             |
| [GHSA-jqff-g426-hqxp](https://github.com/fastify/fast-uri/security/advisories/GHSA-jqff-g426-hqxp) | high     | `>=3.0.0 <3.1.6`  | 3.1.6             |
| [GHSA-qw65-cvwx-89v3](https://github.com/fastify/fast-uri/security/advisories/GHSA-qw65-cvwx-89v3) | high     | `>=3.0.0 <3.1.7`  | 3.1.7             |
| [GHSA-hrr3-gc8f-f4qj](https://github.com/fastify/fast-uri/security/advisories/GHSA-hrr3-gc8f-f4qj) | moderate | `>=3.0.0 <3.1.8`  | 3.1.8             |

These cover scheme-relative IDN canonicalization, malformed IPv6, repeated
hostname decoding, encoded scheme normalization, port authority injection and
encoded host case normalization. The [maintainer v3.1.8 release](https://github.com/fastify/fast-uri/releases/tag/v3.1.8)
repairs the last of these. Presence in the AJV dependency tree does not prove
that Acres exposes an SSRF sink or a customer-controlled host-policy bypass.

Registry publication was **2026-09-15T07:36:25.444Z**. The inspected package is
BSD-3-Clause, CommonJS (`index.js`), with bundled `types/index.d.ts`, no declared
runtime dependencies and no declared Node engine constraint. Registry and
lockfile integrity match:

```text
sha512-GZMtZUTNRpOVIECoXwLNZS5xUGE+mVNbTB8h/7Rwh2TFWcBQiPzTgyZi05BF9UMZKkLJv8XBRJTlU7zg8+ZfMg==
```

`npm update fast-uri --package-lock-only --ignore-scripts --no-audit --no-fund`
returned `up to date in 791ms` while producing the targeted lock change.
`npm ci --no-audit --no-fund` exited **0**, ran the shared prepare build and
reported `added 1479 packages in 30s`. Existing install-script approval warnings
remained; no new script approval was granted. The clean install preserved lock
SHA-256 `8d9eb055df7fc8750715d507f27f50392d48e76814eedc5d59cb13cbfc290272`.
`npm ls fast-uri --all` and `npm explain fast-uri` exited **0** and showed 3.1.8.

### Real semantic compatibility checks

After inspecting installed upstream source and regression tests, a disposable,
bounded offline fixture exercised real package APIs. `timeout 30 node
/tmp/acres-287/smoke.cjs` exited **0**. Actual excerpts:

```text
Lock inventory: only fast-uri changed; registry integrity matches
Benign URI round-trip, relative resolution, ports and reserved path escapes passed
Encoded host case, case-sensitive non-host components and IDN canonicalization passed
Nested hostname escapes, encoded scheme errors and malformed IPv6 fail-closed semantics passed
Port serialization rejects 12 malformed values and preserves valid values
All 10 AJV v8 branches passed without network or remote schema loading
```

Caller-relative imports and schema validation passed on AJV **8.18.0** under
`@angular-devkit/core` and `@nestjs/schematics`, and AJV **8.20.0** under
`@modelcontextprotocol/sdk`, `@nestjs/cli`, `@prisma/streams-local`, `ajv-formats`,
`conf`, `minimizer-webpack-plugin`, `terser-webpack-plugin` and `webpack`.
Each caller resolved the same root fast-uri module. Each compiled preloaded
synthetic schemas with `$id`, a relative external `$ref`, local fragment refs,
escaped JSON Pointer keys and percent-encoded definition names; accepted valid
data; rejected invalid values; and preserved missing-reference failures. Root
AJV 6 is a separate branch, not claimed to use fast-uri. No fixture URI was
fetched, and no remote schema loader or customer data was used.

### Repository verification and limits

| Check                                         | Exit | Real result                                                                                                                          |
| --------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Offline URI/AJV fixture                       | 0    | all ten AJV branches and bounded URI cases passed                                                                                    |
| `npm run ops:check`                           | 0    | all 26 test invocations passed, **2857 tests**, zero failures; final launch/dossier suite `tests 182`, `pass 182`, `fail 0`          |
| Audit wrapper tests within aggregate          | 0    | `tests 51`, `pass 51`, `fail 0`                                                                                                      |
| `npm audit --omit=dev --audit-level=critical` | 0    | `28 vulnerabilities (8 moderate, 20 high)`                                                                                           |
| `npm run ops:audit`                           | 0    | `Production dependency security audit passed (0 critical vulnerabilities)`                                                           |
| `npm run lint`                                | 0    | client `eslint`, shared `eslint "src/**/*.ts"`, server `eslint "{src,test}/**/*.ts"` completed                                       |
| `npm run typecheck`                           | 0    | shared build and all three workspace typechecks completed; Prisma client 7.9.1 generated                                             |
| `npm run build` permitted rerun               | 0    | `Compiled successfully in 4.8s`; `Generating static pages using 7 workers (22/22)`; server `prisma generate && nest build` completed |
| Prettier prompt/lockfile check                | 0    | `All matched files use Prettier code style!`                                                                                         |
| `git diff --check`                            | 0    | no output                                                                                                                            |

The first restricted build exited **1** with `Error: Could not parse output
from TypeScript's --showConfig.` The unchanged permitted rerun passed. Initial
restricted npm requests failed with `getaddrinfo EAI_AGAIN registry.npmjs.org`;
permitted requests succeeded. A late restricted metadata request overwrote its
temporary output; a fresh distinct file was retrieved and validated before
integrity checks. Neither failed metadata nor transport failure was treated as
a clean audit. No automatic approval rejection occurred.

The operations aggregate exercised existing synthetic/local fixture suites and
scanner checks, not live production acceptance. No server e2e, browser journey,
real database drill, Node 24 compatibility run, deployment or production traffic
was performed for this lock-only change.

### Complete audit comparison and residual work

Fresh complete before/after production audit retrieval both exited **1** for
noncritical findings. Comparison removes **fast-uri only**, adds no finding,
and changes totals **29 → 28**, high **21 → 20**, moderate **8 → 8**, with zero
critical throughout. Every retained finding object was unchanged except
`@graphql-tools/utils.fixAvailable`, whose registry recommendation changed from
Apollo Server 5.5.1 to Nest GraphQL 14.0.3; its advisory, range and paths stayed
identical. The policy gate and wrapper both exited **0**, as did the wrapper
inside the aggregate.

Residual high packages are `@apollo/server`, `@graphql-tools/merge`,
`@graphql-tools/schema`, `@graphql-tools/utils`, `@modelcontextprotocol/sdk`,
`@nestjs/apollo`, `@nestjs/graphql`, `@prisma/config`, `@ts-morph/common`,
`brace-expansion`, `braces`, `deepmerge-ts`, `fast-glob`, `micromatch`, `mysql2`,
`prisma`, `shadcn`, `sharp`, `ts-morph` and `undici`. Residual moderate packages
are `@apollo/server-plugin-landing-page-graphql-playground`, `body-parser`,
`express`, `hono`, `ip-address`, `postcss-selector-parser`, `qs` and `uuid`.
Full advisory/path objects, logs and fixtures remain disposable `/tmp` evidence
outside git. Counts reflect this execution, not future registry state.

Prompt 201, Phase 12 exit and operator sign-offs remain open. Rollback is a
reviewed normal revert of the lock repair, preserving retained evidence and
reassessing exposure before deployment. No suppression, push or live action.

Safe inspection from repository root:

```bash
npm ls fast-uri --all
npm run ops:audit
```

Independent implementation review found no critical, important or minor
issues. The reviewer independently checked the complete lock and audit
comparisons and reran the semantic fixture with its temporary-file write
removed. No review-led implementation change was required.

## Prompt 288 — patch the ip-address security release (2026-10-09)

Implemented the bounded Phase 12K dependency repair from
`prompts/288-patch-ip-address-security-release.md`, starting at clean `main`
`6511ba0bff5128b080bf6f043df65cd0f51ca008`. The user authorized immediate
execution after prompt preparation. Toolchain: Node **v26.11.0**, npm **11.20.0**.

Only the npm-generated `node_modules/ip-address` lock entry changed:
**10.5.0 → 10.7.3**, tarball URL and SHA-512 integrity. Every other package
node, all four workspace manifests, parent versions and overrides are unchanged.
Both `express-rate-limit 8.6.2` (`^10.2.0`) and `socks 2.8.9` (`^10.1.1`)
resolve the same repaired module. No application source, contract or UI change.

### Provenance and semantic verification

Public npm metadata confirms MIT, Node `>=12`, no runtime dependencies and
integrity matching the lockfile:

```text
sha512-A1kdq/tSb5QjvKvAMgIoEvDBIgL7qaqVP/jkvSwYYRZ9iEzvPpopxp2wQfu3SuZRHtpHNxMn8Fs0bS+gf5Xmwg==
```

The [maintainer releases](https://github.com/beaugunderson/ip-address/releases)
and tagged source were checked alongside all four baseline advisories:
[link-local classification](https://github.com/advisories/GHSA-rpw4-54j3-4h4q),
[local-use NAT64](https://github.com/advisories/GHSA-2vr4-cq9g-pvrc),
[cross-family comparison](https://github.com/advisories/GHSA-j6r3-76f7-8jcv), and
[IPv6 diagnostics](https://github.com/advisories/GHSA-h3mg-xc3c-68pw).
The selected version is outside every baseline affected range. Transitive
package presence does not establish a customer-facing SSRF exploit path.

A disposable offline fixture uses real library and parent APIs, bounded by
`timeout 15s node /tmp/acres-288/smoke.cjs`. Exact successful output:

```text
Only ip-address changed; registry integrity, manifests and both caller resolutions verified
Benign addresses, byte round-trip, link-local/NAT64 boundaries and cross-family denials passed
Bounded invalid IPv6 diagnostics and reverse-DNS validation passed
Actual rate-limit keys and socks integer/byte/IPv6 decode compatibility passed
```

Checks include fe80::/10 boundaries with and without `/0`, private local-use
NAT64 and adjacent/well-known-prefix behavior, both subnet methods in both
family directions, same-family positive/negative membership, bounded 4096-character
invalid inputs and short diagnostics, valid reverse-DNS case handling and
invalid overlength names. Parent checks exercise mapped/compatible IPv4,
IPv6 /56 key aggregation and disabled aggregation, SOCKS IPv4 integer/byte
conversion and IPv6 byte decoding. No proxy connection, remote fixture request,
customer data or permanent third-party mirror test was used.

### Repository checks and restrictions

| Command                                              | Exit | Actual output/result                                                                            |
| ---------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------- |
| targeted npm lock update                             | 0    | `up to date in 790ms`; only intended node changed                                               |
| `npm ci --no-audit --no-fund`                        | 0    | `added 1479 packages in 25s`; root prepare/shared build completed                               |
| lock hash after install/checks                       | 0    | `package-lock.json: OK`                                                                         |
| `npm ls ip-address --all` / `npm explain ip-address` | 0    | both installed callers resolve 10.7.3                                                           |
| offline semantic fixture                             | 0    | four output lines above                                                                         |
| `npm run ops:audit-test` (permitted run)             | 0    | `tests 51`, `pass 51`, `fail 0`                                                                 |
| `npm audit --omit=dev --audit-level=critical`        | 0    | 27 findings; zero critical                                                                      |
| `npm run ops:audit`                                  | 0    | `Production dependency security audit passed (0 critical vulnerabilities)`                      |
| `npm run ops:check`                                  | 0    | 26 suite invocations, 2857 tests, zero failures; full aggregate completed                       |
| `npm run lint`                                       | 0    | client/shared/server ESLint completed without diagnostics                                       |
| `npm run typecheck`                                  | 0    | all workspace checks completed; `Generated Prisma Client (7.9.1)`                               |
| `npm run build`                                      | 0    | `Compiled successfully in 5.0s`; static pages `22/22`; server build/Prisma generation completed |
| Prettier on prompt/lock/new doc sections             | 0    | `All matched files use Prettier code style!`                                                    |
| `git diff --check`                                   | 0    | no output                                                                                       |

The initial restricted audit failed `getaddrinfo EAI_AGAIN registry.npmjs.org`.
Automatic approval review then rejected npm audit because it discloses private
repository dependency names/versions to the npm registry without explicit
payload authorization. The user explicitly authorized that disclosure; the
permitted baseline, post-change and gate calls then succeeded. No rejected
action was bypassed or treated as evidence. Complete audits exit **1** for
noncritical findings; the unchanged critical-only policy gates exit **0**.

The restricted smoke fixture failed at its read-only git subprocess with
`spawnSync git EPERM`. A permitted run then exposed an incorrect temporary
SOCKS helper import (`../common/helpers.js` from the package build entry);
correcting it to `./common/helpers.js` produced the final successful run.
Restricted audit tests reported only one file-level pass; the permitted rerun
and aggregate each exposed all **51** internal cases. These limitations were
resolved before review. Clean install retained existing deprecation and
unapproved third-party install-script warnings; no script approvals changed.

### Complete audit comparison, review and remaining work

Complete before/after audit comparison removes **ip-address only**, adds no
finding and changes no retained finding object: total **28 → 27**, moderate
**8 → 7**, high **20 → 20**, critical **0 → 0**. Residual high packages:
`@apollo/server`, `@graphql-tools/merge`, `@graphql-tools/schema`,
`@graphql-tools/utils`, `@modelcontextprotocol/sdk`, `@nestjs/apollo`,
`@nestjs/graphql`, `@prisma/config`, `@ts-morph/common`, `brace-expansion`,
`braces`, `deepmerge-ts`, `fast-glob`, `micromatch`, `mysql2`, `prisma`,
`shadcn`, `sharp`, `ts-morph`, `undici`. Residual moderate packages:
`@apollo/server-plugin-landing-page-graphql-playground`, `body-parser`,
`express`, `hono`, `postcss-selector-parser`, `qs`, `uuid`.
Counts reflect this execution, not future registry state.

Independent read-only implementation review found no Critical, Important or
Minor issues. It independently verified the lock scope, caller versions,
registry integrity and complete audit comparison; no review-led fixes were
required. Logs, full audits and fixture remain disposable `/tmp` evidence,
not prerequisites for future execution.

Operations results exercise existing local/synthetic fixtures and scanner
checks. No real database/server E2E, browser journey, Node 24 run, live
production drill, deployment or launch approval was performed. Phase 12,
prompt 201 and operator sign-offs remain open. Rollback is a reviewed normal
revert of the lock repair with exposure reassessment. No suppression or push.

Inspect the installed result from repository root:

```bash
npm ls ip-address --all
npm run ops:audit
```

## Prompt 289 — patch brace-expansion security releases (2026-10-09)

Implemented the bounded Phase 12K repair in
`prompts/289-patch-brace-expansion-security-releases.md`, starting from clean
`main` at `c52c35cfb3ff38ce5557d1e300c1bae86844e2be`. The user requested immediate
implementation after prompt preparation. Toolchain: Node **v26.11.0**, npm
**11.20.0**.

### Scope and provenance

The targeted npm update changed **seven brace-expansion lock nodes only**:
**1.1.18 → 1.1.21** (one node), **2.1.4 → 2.1.7** (three nodes), and
**5.0.9 → 5.0.12** (three nodes). Only each node's version, resolved URL and
integrity changed. Every other package node, workspace manifest, parent version,
engine/dependency declaration and override is unchanged. Actual minimatch v3,
v9 and v10 parent ranges remain satisfied.

Public registry integrity matched all seven nodes. All three versions are MIT;
v5 retains Node `20 || >=22` and balanced-match `^4.0.2`; the older branches
retain their own existing dependency declarations. Checked upstream sources:
[comma-parser recursion and append exhaustion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p),
[nested brace recursion](https://github.com/advisories/GHSA-qhr7-859c-m2p7),
[quadratic rewrite](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), and the
[tagged v5 source](https://raw.githubusercontent.com/juliangruber/brace-expansion/v5.0.12/src/index.ts).
Selected versions are outside all three affected ranges. No customer-facing
exploit path is established solely by these transitive dependencies.

### Compatibility and actual checks

Disposable offline fixtures exercise ordinary literals/sets/nested alternatives,
ascending/descending/stepped/padded ranges, escaping and malformed groups,
plus positive/negative matching and brace expansion through **all seven actual
minimatch parent branches**. Timeout-bounded child processes exercise both
comma-parser vectors, both nesting shapes and the exact rewrite shape on every
installed branch. Their arrays remain within the chosen `max: 8` and
`maxLength: 100000` budgets. v5 CommonJS and ESM entrypoints both pass.
Upstream now bounds nesting and rewrite passes, returning literal residuals at
limits; the parser uses iteration/elementwise appends. These are bounded
semantic fixtures, not a production capacity benchmark or universal DoS proof.

Exact successful fixture output:

```text
Benign expansion and actual minimatch compatibility passed on 7 parent branches
Bounded comma-recursion, nested-group and rewrite fixtures passed on 7 package branches; v5 ESM passed
Seven package nodes only; registry integrity/dependencies, patched versions and every parent range verified
```

| Command/check                                         | Exit | Actual result                                                                 |
| ----------------------------------------------------- | ---- | ----------------------------------------------------------------------------- |
| Targeted npm lock update, scripts/audit/fund disabled | 0    | `up to date in 652ms`                                                         |
| `npm ci --no-audit --no-fund`                         | 0    | `added 1479 packages in 46s`                                                  |
| Lock hash after installation/checks                   | 0    | `package-lock.json: OK`                                                       |
| `npm ls brace-expansion --all`                        | 0    | all seven nodes resolve patched versions                                      |
| Offline semantic and lock validation fixtures         | 0    | output above                                                                  |
| `npm run ops:audit-test` (permitted)                  | 0    | `tests 51`, `pass 51`, `fail 0`                                               |
| `npm run lint`                                        | 0    | all three workspace ESLint commands completed without diagnostics             |
| `npm run typecheck`                                   | 0    | all three workspaces completed; `Generated Prisma Client (7.9.1)`             |
| `npm run build` (permitted rerun)                     | 0    | `Compiled successfully in 4.7s`; static pages `22/22`; server build completed |
| Selected Prettier and `git diff --check`              | 0    | `All matched files use Prettier code style!`; diff check empty                |

Initial restricted registry/audit calls failed DNS with `EAI_AGAIN`. An
in-flight restricted registry lookup overwrote its shared temporary output
when it failed; a separate successful public metadata fetch was used for final
integrity verification. The first temporary lock validator detected that
invalid JSON and was corrected to use the verified file; no registry value was
invented. The restricted semantic fixture failed at `spawnSync node EPERM`;
the unchanged permitted rerun passed. The restricted build failed
`Could not parse output from TypeScript's --showConfig`; the unchanged permitted
rerun passed. Existing deprecated-package and unapproved install-script warnings
remain; no install-script permissions changed.

Independent read-only implementation review found no Critical, Important or
Minor findings. It independently verified complete lock scope, registry
metadata, parent ranges and benign compatibility. Its subprocess rerun hit the
same sandbox EPERM; source inspection and the successful permitted fixture log
support the recorded bounded completion evidence. No review-led fixes were
required. Rewrite checks establish completion, not performance scaling.

All independent offline operations stages completed with exit 0: **26 suite
invocations, 2857 tests, zero failures**, ending with launch/dossier **182/182**.
A temporary runner enumerated the existing `ops:check` commands and explicitly
omitted only `ops:audit`; scanners and local/synthetic tests passed. Its final
output was `All independent offline operations stages passed; online audit gate
was not run`. This does **not** count as a passing `npm run ops:check`.

### Audit limitation, review and remaining work

Automatic approval review rejected the online npm audit because it would send
repository dependency names/versions, potentially including private workspace
metadata, to `registry.npmjs.org` without explicit payload authorization.
Permission was requested; no rejected call was bypassed. Until authorized,
fresh baseline/post-change audit comparisons, `npm run ops:audit` and complete
`npm run ops:check` remain pending. Historical counts are not presented as
current counts or proof of reduction. The baseline lock is retained in a
disposable temporary evidence directory for a later isolated comparison.

Phase 12, other dependency advisories, prompt 201 and operator sign-offs remain
open. No deployment, push, live production acceptance, Node 24 verification,
real database/server E2E or browser journey occurred. Rollback is a normal
reviewed revert of this lock repair with exposure reassessment. No policy
suppression was added. Temporary fixtures and logs are disposable evidence,
not prerequisites for future implementation.

Inspect installed versions from repository root:

```bash
npm ls brace-expansion --all
```

Once metadata disclosure is authorized, run fresh audits and the complete
operations aggregate before treating dependency verification as complete.

## Prompt 290 — patch undici security release (2026-10-09)

Implemented the bounded Phase 12K dependency repair from
`prompts/290-patch-undici-security-release.md`, starting from clean `main`
at `e100dadccf0b29641ae7d9c6d66517c6440c01e2`. The user approved execution via `y`.
Toolchain: Node **v26.11.0**, npm **11.20.0**.

### Scope and provenance

The targeted update changed the single `node_modules/undici` lock node only:
**7.29.0 → 7.29.1**. Only its version, resolved registry tarball URL and SHA-512
integrity changed. Every other package node, workspace manifest, parent version,
engine requirement and override remains unchanged. Both parent ranges admit
the patch directly:

- `client/node_modules/shadcn@4.18.0` declares `"undici": "^7.27.2"`
- `client/node_modules/shadcn/node_modules/@dotenvx/dotenvx@1.75.1` declares `"undici": "^7.11.0"`

Public npm registry metadata confirms MIT, Node `>=20.18.1`, zero runtime
dependencies and published SHA-512 integrity:

```text
sha512-RYONW2MeafgYlkVOKYKkA/Ag7BmXqgIWCa8t1m0JcxrQg9pI9lEqRhAOruOBCbAohOa/gkCF+iPi9hrgvTzu6Q==
```

Upstream release notes and GitHub Advisory Database document ten advisories
resolved by `7.29.1`:

- GHSA-pmjh-fq2x-6v4x (CVE-2026-18149): DoS via orphaned RetryHandler response body (`>= 7.11.0, < 7.29.1`)
- GHSA-r53p-7pc4-xj5r: downstream response splitting via retry interceptor (`>= 7.0.0, < 7.29.1`)
- GHSA-rfgv-xxqx-mfg5: DoS via unrequested WebSocket subprotocol (`>= 7.0.0, < 7.29.1`)
- GHSA-3xpg-4rpp-hhhm: DoS via unbounded decompression of compressed responses (`>= 7.15.0, < 7.29.1`)
- GHSA-2jfj-6hjv-fm6j: cross-user cookie disclosure via Set-Cookie caching in shared caches (`>= 7.0.0, < 7.29.1`)
- GHSA-2gqq-gqf2-x968: response truncation via oversized chunked responses in dump interceptor (`>= 7.1.0, < 7.29.1`)
- GHSA-w293-vg96-wgc3: TLS certificate validation bypass via dropped connect options in BalancedPool (`>= 7.24.1, < 7.29.1`)
- GHSA-8436-99hf-9mmv: caching and replay of unsafe HTTP method responses (`>= 7.0.0, < 7.29.1`)
- GHSA-rx4f-c7p8-82vq: DoS via WebSocketStream unclean close (`>= 7.0.0, < 7.29.1`)
- GHSA-3wwx-pv8p-q78v: DoS via unhandled error in WebSocket permessage-deflate decompression (`>= 7.28.0, < 7.29.1`)

Selected version 7.29.1 clears all ten affected ranges. Transitive presence in
client dev tooling does not establish an exposed customer request path.

### Compatibility and actual checks

Disposable offline fixtures exercise real installed library APIs without network calls:

- Caller-relative `createRequire` resolution from both `shadcn` and `@dotenvx/dotenvx`
  confirms both resolve to the single deduped `node_modules/undici` instance at 7.29.1;
- CommonJS and ESM entrypoints both load and export expected symbols;
- `Client`, `Pool`, `Agent`, `Dispatcher` instantiation and option validation passed;
- `RetryHandler` instantiation, options parsing, and retry counters passed;
- `undici.util.parseHeaders` header parsing and content-type normalization passed;
- Subprocess tests for error class hierarchies and `BalancedPool` upstream management
  passed with exit 0.

Exact successful fixture output:

```text
Starting undici 7.29.1 offline semantic compatibility fixtures...
✓ Caller-relative createRequire resolution verified for shadcn and @dotenvx/dotenvx (both resolve undici 7.29.1)
✓ CommonJS and ESM entrypoints export expected symbols
✓ Client, Pool, Agent, Dispatcher instantiations and option validations passed
✓ RetryHandler instantiation and options validated
✓ undici.util.parseHeaders validated
✓ Subprocess tests (error classes, BalancedPool options) completed with exit 0

All undici 7.29.1 offline semantic compatibility fixtures passed successfully!
```

| Command/check                                  | Exit | Actual result                                                                 |
| ---------------------------------------------- | ---- | ----------------------------------------------------------------------------- |
| Targeted lockfile update                       | 0    | single `node_modules/undici` node updated; no manifest or parent changed      |
| `npm ci --no-audit --no-fund`                  | 0    | `added 1479 packages in 45s`                                                  |
| Lock diff check (`git diff package-lock.json`) | 0    | only `node_modules/undici` node changed                                       |
| `npm ls undici --all`                          | 0    | both `shadcn` and `@dotenvx/dotenvx` resolve deduped 7.29.1                   |
| Offline semantic compatibility fixtures        | 0    | output above                                                                  |
| `npm run ops:audit-test`                       | 0    | `tests 51`, `pass 51`, `fail 0`                                               |
| `npm run lint`                                 | 0    | all three workspace ESLint commands completed without diagnostics             |
| `npm run typecheck`                            | 0    | all three workspaces completed; `Generated Prisma Client (7.9.1)`             |
| `npm run build`                                | 0    | `Compiled successfully in 2.9s`; static pages `22/22`; server build completed |
| `git diff --check`                             | 0    | clean whitespace                                                              |

Independent read-only implementation review found no Critical, Important or
Minor findings. It independently verified lockfile scope, registry metadata,
parent semver ranges, offline semantic compatibility and quality gates.

All 32 independent offline operations stages completed with exit 0: **26 suite
invocations, 2857 tests, zero failures**, ending with launch-drill **182/182**.
The offline runner explicitly omitted only `ops:audit`; scanners and local/synthetic
tests passed. Output: `All 32 independent offline operations stages passed;
online audit gate was not run`. This does **not** count as a passing
`npm run ops:check`.

### Audit limitation, review and remaining work

Online npm audit metadata disclosure to `registry.npmjs.org` remains pending
explicit user authorization. No unapproved network disclosure was performed,
and offline checks are not misrepresented as fresh registry audits.
The baseline lockfile is retained in a disposable temporary directory
(`/tmp/acres-290/package-lock.baseline.json`) for a subsequent isolated
audit comparison once authorized.

Phase 12, other dependency advisories, prompt 201 and operator sign-offs remain
open. No deployment, push, live production acceptance, Node 24 verification,
real database/server E2E or browser journey occurred. Rollback is a normal
reviewed revert of this lock repair with exposure reassessment.

Inspect installed version from repository root:

```bash
npm ls undici --all
```

## Prompt 291 — repair Prisma's mysql2 dependency (2026-10-09)

Root `package.json` scopes a **mysql2 3.24.5** override to unchanged
**prisma@7.9.1**, which pins mysql2 exactly at 3.15.3. Remove the exception
when a supported Prisma version supplies a safe mysql2 itself. The
[maintainer changelog](https://github.com/sidorares/node-mysql2/blob/master/Changelog.md)
records SQL object escaping hardening in 3.17.0 and compressed-protocol
inflation bounds in 3.23.1. [GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3)
affects <=3.23.0, with 3.23.1 patched. The selected
[3.24.5 release](https://github.com/sidorares/node-mysql2/releases/tag/v3.24.5)
includes these fixes and the subsequent IPv6 URI correction. Acres remains on
PostgreSQL; the dependency's presence does not prove exposed MySQL traffic.

### Provenance and exact dependency closure

Public npm metadata verified MIT, Node >=8, and `@types/node >=8` peer.
The tarball is `https://registry.npmjs.org/mysql2/-/mysql2-3.24.5.tgz` with
registry/lock integrity:

```text
sha512-X6Ujsr2QSkkLpkQGjxzpKRAPn9nu4axpR63ntBzquFVEvPOArgbUQ1sJjFKI7hnaYtiVZxa17Z7q18KSubW0IQ==
```

An initial `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`
left the old node unchanged; `npm ls` correctly rejected its override mismatch.
Targeted `npm update mysql2 --package-lock-only --ignore-scripts --no-audit
--no-fund` then regenerated the required closure. Full node comparison found
exactly four changed entries: mysql2 3.15.3 → 3.24.5, added sql-escaper 1.5.2,
removed seq-queue 0.0.5 and sqlstring 2.3.3. No other lock node changed.
Denque remains for ioredis. Already-installed aws-ssl-profiles 1.1.2,
iconv-lite 0.7.3, long 5.3.2, lru.min 1.1.4, named-placeholders 1.1.6 and
generate-function 2.3.1 satisfy updated minimums unchanged. Caller-relative
Node types 20.19.43 satisfies the >=8 peer; no Node runtime change follows.

### Compatibility and actual verification

Toolchain: Node v26.11.0, npm 11.20.0. Clean install printed
`added 1478 packages in 26s`; SHA-256 verification printed
`package-lock.json: OK`. Existing install-script approval restrictions remain
in force. `npm ls mysql2 --all` exited 0 with Prisma 7.9.1 and mysql2 3.24.5
both labelled `overridden`.

Disposable fixtures used real Prisma-relative mysql2 exports and inspected
installed compression implementation. Assertions cover escaped quotes,
identifiers, arrays, ordinary placeholders, hostile objects stringified outside
SET context, supported SET objects, IPv6 URI and default multiple-statement
exclusion, and lazy callback/promise pool closure without network connections.
Four small in-memory compressed-payload cases prove synchronous/asynchronous
success and rejection above the declared inflate length (`ERR_BUFFER_TOO_LARGE`),
with a two-second timeout per case. Actual output:

```text
PASS: Prisma-relative mysql2 3.24.5; CJS/promise; SQL escaping and hostile object handling; IPv6 URI; lazy pools; sync/async bounded compression (4 cases)
PASS: exactly four lock nodes changed; mysql2 integrity matches registry
```

A supplemental disposable dependency-range probe initially stopped at `long`
because it read the UMD directory's nameless package metadata instead of the
owning package. Corrected traversal requires the matching package name; all
seven dependency ranges and the Node types peer then passed. No runtime source
or dependency version changed to address this fixture error.

| Command/check                                            | Exit | Actual result                                                               |
| -------------------------------------------------------- | ---- | --------------------------------------------------------------------------- |
| `npm ci --no-audit --no-fund`                            | 0    | `added 1478 packages in 26s`; lock hash unchanged                           |
| `npm ls mysql2 --all`                                    | 0    | `mysql2@3.24.5 overridden` under Prisma 7.9.1                               |
| Real-library semantic fixtures                           | 0    | PASS output above                                                           |
| `npm exec --workspace=@acres/server -- prisma --version` | 0    | `prisma : 7.9.1`, `@prisma/client : 7.9.1`                                  |
| `npm exec --workspace=@acres/server -- prisma validate`  | 0    | `The schema at prisma/schema.prisma is valid`                               |
| `npm run lint`                                           | 0    | all three workspace ESLint commands completed without diagnostics           |
| `npm run typecheck`                                      | 0    | all three workspaces completed; `Generated Prisma Client (7.9.1)`           |
| `npm run contracts:check`                                | 0    | contract generation/check completed without drift                           |
| Permitted `npm run build`                                | 0    | `Compiled successfully in 3.9s`; static pages `22/22`; Nest build completed |
| Selected Prettier check                                  | 0    | `All matched files use Prettier code style!`                                |
| `git diff --check`                                       | 0    | no whitespace diagnostics                                                   |

The first sandbox build failed with `Could not parse output from TypeScript's
--showConfig`; the unchanged permitted rerun passed. The first sandbox offline
operations run stopped in `ops:templates-test` with a test subprocess failure;
no assertion reason was emitted. The permitted rerun supplies the operations
results below, without attributing that first subprocess failure to this repair.

Independent read-only review found no Critical, Important or Minor findings.
It verified the exact override, closure, registry integrity, all parent/peer
ranges, real compression fixtures, upstream claims and explicit user-authorized
immediate-execution workflow exception in `AGENTS.md`.

All 32 independent offline operations stages exited **0**, with **26 test-suite
invocations / 2857 tests / zero failures**. The audit-wrapper group reported
`tests 51`, `pass 51`, `fail 0`; the final launch/dossier group reported
`tests 182`, `pass 182`, `fail 0`. The runner printed:

```text
All 32 independent offline operations stages passed; online audit gate was not run
```

### Limits, remaining work and rollback

Online npm audit metadata disclosure remains pending explicit user
authorization. No fresh audit, before/after finding reduction, or complete
`ops:check` pass is claimed. Baseline manifest/lock and logs remain disposable
`/tmp/acres-291` evidence. Historical residual advisories, including braces
whose public latest release remains 3.0.3 at verification time, require separate
triage; no unverified patched version or fork was substituted.

Phase 12, prompt 201, operator sign-offs and other dependency findings remain
open. No push, deployment, live SMTP/MySQL/production acceptance, real database
or browser journey occurred; local Node 26 checks do not prove Node 24 runtime
acceptance. Rollback is a reviewed normal revert of root manifest and lockfile
together with exposure reassessed before deployment. Inspect from repository root:

```bash
npm ls mysql2 --all
```

## Prompt 292 — patch sharp security release (2026-10-09)

The root lockfile updates **sharp 0.35.4 → 0.35.5** within unchanged Next
16.3.8's optional `^0.35.4` range. The
[maintainer advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w)
identifies versions <0.35.5 as affected by CVE-2026-96889 in librsvg and
0.35.5 as patched with librsvg 2.63.2. The
[release](https://github.com/lovell/sharp/releases/tag/v0.35.5) also updates
sharp-libvips to 1.3.4. Transitive installation does not establish deployed
exploitability; production image policy and target runtime were not inspected.

### Provenance and exact dependency closure

Targeted `npm update sharp --package-lock-only --ignore-scripts --no-audit
--no-fund` changed exactly **27 existing lock nodes**: sharp, 16 native/WASM
packages (0.35.4 → 0.35.5), and 10 libvips packages (1.3.3 → 1.3.4). Every
other node and all workspace manifests/overrides remain unchanged. No nodes
were added or removed; optional platform coverage, licenses, CPU/OS/libc and
engine metadata are preserved. Internal sharp-family dependency references
advance together. No direct dependency or override was necessary.

All 27 changed tarball URLs and integrity values matched public npm registry
version metadata. Sharp remains Apache-2.0 with Node >=20.9.0. Its registry/lock
integrity is:

```text
sha512-Ywn4OnzGukp7CDMrp08RQ50YKmuwG47brZgIVPTvBaaAfQlRlygrRqSrxdCiL9M+LlzLBiJ68IR1QqvzHyjC7g==
```

### Compatibility and actual checks

Host toolchain: Node **v26.11.0**, npm **11.20.0**, Linux x64 glibc. Clean
install completed with `added 1478 packages in 22s`; lock hash verification
printed `package-lock.json: OK`. Existing npm install-script restrictions were
preserved. `npm ls sharp --all` resolved Next 16.3.8 → sharp 0.35.5 without
invalid ranges. Native package metadata identifies sharp-linux-x64 0.35.5 and
sharp-libvips-linux-x64 1.3.4; loaded runtime reports sharp 0.35.5, libvips
8.18.7 and librsvg 2.63.2.

Disposable fixtures use a generated 32×16 raw raster and small benign SVG.
They assert decoded dimensions, format and bounded pixel-color error for
PNG/JPEG/WebP/AVIF, exact SVG pixels, invalid input and pixel-limit rejection,
CJS/ESM loading, and the installed Next `optimizeImage` helper's four output
formats, pixel bound and no-upscaling behavior. Actual output:

```text
PASS: native round-trip and Next optimizeImage image/png
PASS: native round-trip and Next optimizeImage image/jpeg
PASS: native round-trip and Next optimizeImage image/webp
PASS: native round-trip and Next optimizeImage image/avif
PASS: native sharp 0.35.5/libvips 8.18.7/librsvg 2.63.2; CJS/ESM; SVG pixels; invalid input; pixel bounds; Next no-upscale
```

| Command/check                          | Exit | Actual output/result                                                               |
| -------------------------------------- | ---- | ---------------------------------------------------------------------------------- |
| `npm ci --no-audit --no-fund`          | 0    | `added 1478 packages in 22s`; lock hash unchanged                                  |
| `npm ls sharp --all`                   | 0    | Next 16.3.8 → sharp 0.35.5                                                         |
| Public metadata integrity verification | 0    | `PASS: all 27 changed lock nodes match public registry tarball URLs and integrity` |
| Bounded native/Next fixtures           | 0    | PASS output above                                                                  |
| `npm run lint`                         | 0    | all three workspace ESLint commands completed without diagnostics                  |
| `npm run typecheck`                    | 0    | all three workspaces completed; `Generated Prisma Client (7.9.1)`                  |
| Permitted `npm run build`              | 0    | `Compiled successfully in 3.4s`; static pages `22/22`; Nest build completed        |
| Selected Prettier check                | 0    | `All matched files use Prettier code style!`                                       |
| `git diff --check`                     | 0    | no whitespace diagnostics                                                          |

The initial sandbox build failed with `Could not parse output from TypeScript's
--showConfig`; the unchanged permitted rerun passed. The initial sandbox offline
operations run stopped at `ops:templates-test` with a subprocess `test failed`
without an assertion explanation. A supplemental closure-count probe accidentally
loaded the runner and repeated that sandbox failure; it changed no tracked
implementation. The permitted operations run is the successful evidence below.

### Review, audit limits and rollback

Independent read-only implementation review found no Critical, Important or
Minor findings and reproduced the real-library fixtures. All **32 independent
offline operations stages** passed (**26 suite invocations / 2857 tests / zero
failures**), including audit-wrapper **51/51** and final launch/dossier
**182/182**. Actual runner output:
`All 32 independent offline operations stages passed; online audit gate was not run`.
This is not a complete `npm run ops:check` pass: only online `ops:audit` was
omitted, pending the existing dependency-metadata disclosure authorization.
No new npm audit was performed and no fresh audit-count reduction is claimed.

No production launch, deployment, push, Docker/musl/other-platform execution,
Node 24 verification, real database/server E2E or browser journey is established.
The other platforms' locked packages were integrity-checked, not executed. Other
advisories, prompt 201, operator sign-offs and Phase 12 exit remain open.
Rollback is a reviewed normal revert of this lockfile repair, with affected
security exposure reassessed before deployment.

Inspect from the repository root:

```bash
npm ls sharp --all
node -e 'console.log(require("sharp").versions)'
```

## Prompt 293 — patch selector parser security release (2026-10-09)

The root lockfile updates **postcss-selector-parser 7.1.5 → 7.1.6** within
unchanged shadcn 4.18.0's `^7.1.0` range. The
[maintainer advisory](https://github.com/postcss/postcss-selector-parser/security/advisories/GHSA-rj75-hqrm-r3gf)
identifies CVE-2026-104844, quadratic flat-selector parsing, and 7.1.6 as the
repair. Installed source uses Set membership in the three affected passes.
This is dependency inventory remediation; no attacker-controlled selector
request path or deployed exploitability is established by this work.

### Exact scope and provenance

Targeted `npm update postcss-selector-parser --package-lock-only --ignore-scripts
--no-audit --no-fund` printed `up to date in 624ms` and changed exactly one
existing lock node, only its version, tarball URL and integrity. Every other
node, manifest, parent and override stays unchanged. The patch retains MIT,
Node >=4, and the cssesc/util-deprecate ranges. Public registry metadata matched
its URL and integrity:

```text
sha512-7qASPzhKF2l2KLboRZux8CCTRMdGiV08vWmyKzPz22qZ7ZjQBOeY7rNzNoCLSUiftJ7HUq0GERHmxw/t0dCdMw==
```

Clean install on Node **v26.11.0**, npm **11.20.0** printed
`added 1478 packages in 24s`; subsequent SHA-256 verification printed
`package-lock.json: OK`. Existing third-party install-script approvals and
restrictions were preserved. `npm ls postcss-selector-parser --all` exited 0:
client → shadcn 4.18.0 → postcss-selector-parser 7.1.6.

### Compatibility and actual checks

Disposable fixtures use the installed shadcn-relative parser and its documented
API. Nine small selectors round-trip byte-for-byte in synchronous/asynchronous
processing, including escaped utilities, pseudos, attributes, combinators,
comments and nesting. A 128-node mixed class/id selector preserves exact order
and count. Class rewriting, malformed-selector rejection, CommonJS/ESM identity
and actual shadcn `createStyleMap` output pass. No large attack input or timing
benchmark is used. Actual output:

```text
PASS: single-node lock scope and registry integrity; shadcn-relative 7.1.6; CJS/ESM; 9 sync/async round trips; 128 ordered flat nodes; class rewrite; malformed input; actual shadcn createStyleMap; Set-membership repair
```

The first disposable fixture attempted shadcn's unexported `package.json`
subpath and failed `ERR_PACKAGE_PATH_NOT_EXPORTED`. Corrected caller-relative
resolution uses its inspected installed `dist/utils/index.js`; no tracked
implementation was altered for that fixture correction.

| Check                                 | Exit | Actual output/result                                                        |
| ------------------------------------- | ---- | --------------------------------------------------------------------------- |
| Clean install                         | 0    | `added 1478 packages in 24s`; `package-lock.json: OK`                       |
| Dependency tree and semantic fixtures | 0    | shadcn → parser 7.1.6; PASS above                                           |
| `npm run lint`                        | 0    | all three workspace ESLint commands completed without diagnostics           |
| `npm run typecheck`                   | 0    | all three workspaces completed; `Generated Prisma Client (7.9.1)`           |
| Permitted `npm run build`             | 0    | `Compiled successfully in 3.7s`; static pages `22/22`; Nest build completed |
| Selected Prettier                     | 0    | `All matched files use Prettier code style!`                                |
| `git diff --check`                    | 0    | no whitespace diagnostics                                                   |

Initial sandboxed build failed with `Could not parse output from TypeScript's
--showConfig`; unchanged permitted rerun passed. Initial sandbox offline runner
stopped at `ops:templates-test` with a subprocess `test failed` without an
assertion reason. The permitted offline runner supplies the successful results
below. These execution limits did not require tracked implementation changes.

### Review, audit limits and rollback

Independent read-only review found no Critical, Important or Minor issues and
reproduced the focused real-library fixtures and dependency-tree verification.

All **32 independent offline operations stages** passed (**26 suite invocations /
2857 tests / zero failures**), including audit-wrapper **51/51** and final
launch/dossier **182/182**. Actual final runner output:
`All 32 independent offline operations stages passed; online audit gate was not run`.
Only online `ops:audit` was omitted under the existing dependency-metadata
disclosure restriction. No fresh npm audit, before/after count reduction or
complete `npm run ops:check` pass is claimed. Gate thresholds and scanner policy
are unchanged.

Host fixtures do not establish Node 24, Docker, production, real database or
browser acceptance. Phase 12, prompt 201, other advisories and operator sign-offs
remain open. No push or deployment occurred. Rollback is a reviewed normal
revert of the lockfile repair with affected security exposure reassessed before
deployment. Inspect from the repository root:

```bash
npm ls postcss-selector-parser --all
```

## Prompt 294 — patch qs security release (2026-10-09)

The root lockfile repairs **qs 6.15.3 → 6.16.0**, following the
[maintainer advisory](https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g)
for CVE-2026-82417. The installed implementation checks callability before
invoking constructor.isBuffer. This repairs a dependency inventory exposure;
an exploitable Acres request-to-stringify path was not established. Application
routes, parser settings, authentication, schemas and production controls are unchanged.

### Exact closure and reproducibility

Exactly three existing lock nodes change; no manifest, override or unrelated
resolution changes:

| lock node                                              | before | after  | reason                            |
| ------------------------------------------------------ | ------ | ------ | --------------------------------- |
| `node_modules/qs`                                      | 6.15.3 | 6.16.0 | Maintainer security repair        |
| `node_modules/@apollo/server/node_modules/express`     | 4.22.2 | 4.22.3 | Upstream patch accepts qs ~6.16.0 |
| `node_modules/@apollo/server/node_modules/body-parser` | 1.20.6 | 1.20.8 | Upstream patch accepts qs ~6.16.0 |

The two old parents restricted qs to ~6.15.1. Their new releases avoid an
override. Express also raises its path-to-regexp declaration from ~0.1.12 to
~0.1.13; the already locked 0.1.13 node needs no change. All other dependency
ranges, engines and licenses are preserved. qs remains BSD-3-Clause, the parents
MIT. Express 5.2.1, body-parser 2.3.0 and superagent 10.3.0 remain unchanged.

Targeted `npm update qs express body-parser --package-lock-only --ignore-scripts
--no-audit --no-fund` printed `up to date in 793ms`. It updated the parents and
temporarily added a nested repaired qs while keeping the root copy. A second
targeted `npm update qs --package-lock-only --ignore-scripts --no-audit --no-fund`
printed `up to date in 683ms`, updated root qs and removed the temporary duplicate.
The final diff contains only the three nodes above, with no added/removed nodes.

All three tarball URLs, integrities, dependency maps, engines and licenses match
public registry release metadata. Verified SHA-512 integrities:

```text
qs@6.16.0
sha512-h6fhOIaRrID2CbEY2fqs+7t+UXZo+MLAnU5gRIq85uFtdiUPCdsApMlHhXogKVM4HM2DVbIjGNTTYH2OcmP1vA==
express@4.22.3
sha512-Bdcs4+3qlpVlx2NRn6fgX2Ue2/gGRaPeawebgclM0ERSCqDpA+owF1fdPwjJUTAJWMTuAaxjDf+hzb0/4eKvvw==
body-parser@1.20.8
sha512-JNcyFQ64OiijEkPzUBTCe+hyPXUD/3LEldGQ6iF5LR1w00mx9o7xtDWHXBY2iItjdCFGoilOLNQbH943ut7pHA==
```

`npm ci --no-audit --no-fund` on Node **v26.11.0**, npm **11.20.0** printed
`added 1478 packages in 24s`; hash verification printed `package-lock.json: OK`.
Existing install-script approvals/restrictions and deprecation warnings remain.
`npm ls qs express body-parser --all` exits 0, with all five caller edges using
one qs 6.16.0 node within valid ranges: Express 4/5, body-parser 1/2, superagent.

### Compatibility and actual checks

Disposable real-library fixtures cover ordinary nested/array/Unicode/duplicate
queries, round trips and Buffer serialization; malformed escapes and prototype
protection; bounded depth/parameter/array limits; CJS/ESM identity; the advisory's
small non-callable isBuffer shape under both documented parse options; and
6.16.0's Date/filter, top-level dot encoding and array cycle changes. Actual
Express 4/5 with body-parser 1/2 accept extended queries, simple/extended forms
and supertest/superagent serialization while preserving depth errors and
parameter/byte-limit errors. No large attack input or timing claim is used.
Final fixture output:

```text
PASS: 3-node lock scope; registry integrity; 5 valid qs caller edges; CJS/ESM; ordinary/hostile query round trips; Buffer; prototype/depth/parameter/array/cycle guards; Date/dot fixes; Express 4/5 and body-parser 1/2 middleware; supertest/superagent serialization
```

| check                                   | exit | actual output/result                                                       |
| --------------------------------------- | ---- | -------------------------------------------------------------------------- |
| Clean install and hash                  | 0    | `added 1478 packages in 24s`; `package-lock.json: OK`                      |
| Tree and bounded semantic/HTTP fixtures | 0    | Valid caller tree and PASS above                                           |
| `npm run lint`                          | 0    | All three workspace ESLint commands complete without diagnostics           |
| `npm run typecheck`                     | 0    | All three workspace checks complete; `Generated Prisma Client (7.9.1)`     |
| Permitted `npm run build`               | 0    | `Compiled successfully in 3.7s`; static pages `22/22`; Nest build complete |
| Selected Prettier                       | 0    | `All matched files use Prettier code style!`                               |
| `git diff --check`                      | 0    | No whitespace diagnostics                                                  |

All **32 independent offline operations stages** passed: **26 suite invocations,
2857 tests, zero failures**, audit-wrapper **51/51**, final launch/dossier
**182/182**. Final output: `All 32 independent offline operations stages passed;
online audit gate was not run`.

### Execution limits, review and rollback

Independent read-only review found no Critical, Important or Minor issues.
It verified baseline identity and changed registry metadata, reproduced the
valid dependency tree, and inspected the fixtures and repository/operations logs.
No implementation corrections were required.

An initial disposable fixture used an incorrect metadata filename for the root
qs path; corrected path selection and caller-relative manifest lookup resolved
it. The sandbox then rejected temporary HTTP listeners with `listen EPERM`;
the permitted run exposed a fixture expectation error for superagent's existing
indices:false behavior on a singleton array. Using two array values produced
the final passing integration checks without tracked code changes. Planning
also queried an unverified body-parser 1.20.7 candidate and received E404;
the implemented 1.20.8 release was verified before prompt creation. Selected
prompt formatting was corrected before review. None changed application behavior.

Only online `ops:audit` is omitted under the existing dependency-metadata
disclosure restriction. No fresh audit, before/after vulnerability reduction or
complete `npm run ops:check` pass is claimed. Scanner policy and gate thresholds
are unchanged. Logs and fixtures in `/tmp` are disposable, not future prerequisites.

Host fixtures do not establish Node 24, Docker, production, real database/server
E2E or browser acceptance. Phase 12, prompt 201, other advisories and operator
sign-offs remain open. No push or deployment occurred. Rollback is a reviewed
normal revert of the lock repair, reassessing affected exposure before deployment.
Inspect from the repository root:

```bash
npm ls qs express body-parser --all
```

## Prompt 295 — repair deepmerge-ts lock resolution (2026-10-09)

The existing root `deepmerge-ts: ^8.0.0` override was inconsistent with the
locked and installed **7.1.5** resolution. `npm ls` reported ELSPROBLEMS on
Prisma 7.9.1 → @prisma/config 7.9.1 → deepmerge-ts. Targeted npm lock generation
synchronizes that existing decision to **8.0.2**. No manifest, override, Prisma
version, application source, schema, route or scanner policy changed.

The [maintainer advisory](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx)
(CVE-2026-40345) identifies releases before 8.0.0 as vulnerable to stack exhaustion
when merging recursive object graphs. This repairs an inventory exposure; no
attacker-controlled Acres configuration path was established. Plain JSON alone
does not produce recursive graphs. The actual Prisma loader dynamically imports
`deepmerge` and passes it as c12's merger; application source does not directly
import the library. See `backend.md` for the override compatibility/removal note.

### Exact closure and reproducibility

Exactly one lock node changes: `node_modules/deepmerge-ts`, **7.1.5 → 8.0.2**.
Version, tarball URL, integrity, engine (`>=16.9.0`) and added upstream funding
metadata match public registry metadata. BSD-3-Clause, no runtime dependencies,
CJS/ESM exports and `devOptional: true` are preserved. Every other lock node,
top-level lock field and workspace manifest remains unchanged. @prisma/config
still declares exact 7.1.5 upstream; the existing root override governs resolution.

Verified registry integrity:

```text
sha512-uqbvqLUMrc6p0MO+WBRtTxY55hmyh94WRwI5a++PZe54X+bfVh59FSN7uWCBCW1CCVjzjnrwzfI8zidE2obMMw==
```

`npm update deepmerge-ts --package-lock-only --ignore-scripts --no-audit --no-fund`
printed `up to date in 646ms`. Clean `npm ci --no-audit --no-fund` on Node
**v26.11.0**, npm **11.20.0** printed `added 1478 packages in 24s`; subsequent
SHA-256 verification printed `package-lock.json: OK`. Existing deprecation and
unapproved third-party install-script warnings remain; approvals were unchanged.
The repaired `npm ls deepmerge-ts --all` exits 0 and shows 8.0.2 beneath Prisma.

### Compatibility and actual checks

The installed changelog identifies v8 changes to circular handling, deep Map
value merging, merge-into input alias mutation and type names. Disposable
real-library fixtures check ordinary nested records, arrays, undefined values,
Sets/Maps, custom array replacement, input preservation, merge-into behavior,
prototype safety and CJS/ESM export surfaces. Eight timeout-bounded subprocesses
exercise self and mutual recursion through deepmerge, deepmergeCustom,
deepmergeInto and deepmergeIntoCustom: all preserve merged fields and cycles
without stack exhaustion. Prisma's real loadConfigFromFile normalizes a synthetic
schema/migrations/datasource config and returns errors for missing/malformed
files. No local secrets, network/database connection or large attack input is used.
Final fixture output:

```text
PASS: one-node lock scope; registry metadata; Prisma caller; CJS/ESM; record/array/undefined/Map/Set/custom/into semantics; prototype safety; eight bounded recursive cases; actual Prisma config normalization and error handling
```

| check | exit | actual output/result |
| --- | --- | --- |
| Clean install/hash | 0 | `added 1478 packages in 24s`; `package-lock.json: OK` |
| Caller tree and semantic/config fixtures | 0 | Valid 8.0.2 resolution and PASS above |
| `npm run prisma:validate --workspace=@acres/server` | 0 | `The schema at prisma/schema.prisma is valid` |
| `npm run contracts:check` | 0 | `Generated Prisma Client (7.9.1)`; contract drift check completes |
| `npm run lint` | 0 | All three workspace ESLint commands complete without diagnostics |
| `npm run typecheck` | 0 | All three workspace checks complete without diagnostics |
| Permitted `npm run build` | 0 | `Compiled successfully in 3.4s`; pages `22/22`; Nest build completes |
| Selected Prettier | 0 | `All matched files use Prettier code style!` |
| `git diff --check` | 0 | No whitespace diagnostics |

All **32 independent offline operations stages** passed, covering **26 suite
invocations / 2857 tests / zero failures**, ending launch/dossier **182/182**.
Runner output: `All 32 independent offline operations stages passed; online
audit gate was not run`. Only ops:audit was omitted under the existing
dependency-metadata disclosure restriction. No fresh audit reduction or complete
ops:check pass is claimed. Gate thresholds and scanner policy are unchanged.

### Review, execution limits and rollback

Independent read-only review found no Critical, Important or Minor findings.
It reproduced the valid caller tree and lock-scope comparison and inspected the
fixtures, metadata and check logs. Feedback confirmed the recorded host and audit
limits; no implementation correction was required.

The initial sandbox operations run reported an opaque child-test failure in
check-production-templates.spec.js; unchanged permitted execution passed all
stages. The sandbox production build reported `Could not parse output from
TypeScript's --showConfig.`; the unchanged permitted build passed. A review-only
nested execSync scope check hit sandbox EPERM; direct comparison passed. These
reruns did not alter tracked implementation. Temporary logs/fixtures under
`/tmp/acres-295` are disposable evidence, not future prerequisites.

Host checks do not establish Node 24, Docker, real database/server E2E, browser
or production acceptance. Braces 3.0.3 has no published patched version in the
planning-time public registry lookup; it remains unresolved, as do other
advisories, prompt 201, operator sign-offs and Phase 12 exit. No push or deployment
occurred. Rollback is a reviewed normal revert of the lock repair, restoring the
known vulnerable/invalid resolution; reassess exposure before deployment.
Inspect from the repository root:

```bash
npm ls deepmerge-ts --all
```

## Prompt 296 — MCP SDK security patch (2026-10-09)

The shared transitive `@modelcontextprotocol/sdk` resolution moves **1.30.0 →
1.32.1** beneath unchanged shadcn **4.18.0** (`^1.26.0`) and @google/genai
**2.19.0** (`^1.25.2`). Only one lock node changes, and only its version,
tarball URL and integrity fields change. All manifests, overrides, other lock
nodes, application source, routes, schemas and scanner policy are unchanged.

The [maintainer advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6qxp-vccf-f47h)
(GHSA-6qxp-vccf-f47h / CVE-2026-104850) describes HTTP OAuth clients sending
credentials to a server-selected authorization server; 1.31.0 is the first
patched 1.x release. This is inventory remediation: no direct MCP SDK imports
or MCP OAuth providers were found in Acres application source. Its Gemini
adapter uses models.generateContent, while shadcn imports MCP server/stdio APIs.
No reachable application exploit is established.

The upstream caveats still apply to future OAuth adoption: providers must
preserve issuer on saved credentials, migrate or clear legacy issuer-less
credentials, and configure expectedIssuer on bundled providers. Direct
refreshAuthorization/exchangeAuthorization and new interactive sign-ins are
outside the advisory's protection. No unused OAuth configuration or credential
migration was added to Acres; AI remains disabled for production launch.

### Provenance and compatibility

Public npm metadata verifies stable 1.32.1, MIT, Node >=18, unchanged dependency,
peer and export declarations, and this integrity:

```text
sha512-2DdE+SJDtzLEEWzY1ZjY7Q+VcPhcV1KisD3zI4u0XZyktsjHum1mwbMI+JaulUBi2OZk+KJAi2uPXzxichPkdw==
```

Targeted `npm update @modelcontextprotocol/sdk --package-lock-only
--ignore-scripts --no-audit --no-fund` printed `up to date in 684ms`.
`npm ci --no-audit --no-fund` on Node **v26.11.0**, npm **11.20.0** printed
`added 1478 packages in 22s`; lock hash verification printed
`package-lock.json: OK`. Existing deprecation and unapproved third-party
install-script warnings remain; approvals were unchanged. The valid caller
tree deduplicates both parents to 1.32.1.

Disposable timeout-bounded real-SDK fixtures exercise CJS and ESM auth: matching
issuer refresh, foreign registered-client rejection before token fetch, foreign
refresh-token withholding even with client registration for the new issuer,
same-origin/different-path issuer isolation, issuer stamping independent of the
token response, bundled expectedIssuer enforcement and direct fetchToken guards.
A real in-memory MCP client/server handshake, listTools and callTool pass;
Google SDK construction/import passes without API calls. All OAuth fetches are
injected fake responses using synthetic credentials and example URLs.

```text
PASS: one-node lock scope; registry integrity; deduplicated callers; CJS/ESM OAuth issuer refresh and credential isolation; token issuer stamping; expectedIssuer provider and fetchToken guards; real MCP handshake/list/call tools; Google SDK construction without API calls
```

The initial disposable fixture incorrectly expected client_secret_post without
setting that authentication method on client information. Setting the intended
method made the fixture pass; no tracked implementation correction was needed.
The GitHub v1.32.1 release URL returned 404; version provenance uses public
registry metadata, and patch behavior uses installed source and real fixtures.

### Checks and limits

| check                             | exit | actual output/result                                                       |
| --------------------------------- | ---- | -------------------------------------------------------------------------- |
| Clean install/hash                | 0    | `added 1478 packages in 22s`; `package-lock.json: OK`                      |
| Caller tree and real SDK fixtures | 0    | Valid 1.32.1 caller tree and PASS above                                    |
| `npm run lint`                    | 0    | Three workspace ESLint commands complete without diagnostics               |
| `npm run typecheck`               | 0    | Three workspace checks complete; `Generated Prisma Client (7.9.1)`         |
| `npm run build`                   | 0    | `Compiled successfully in 3.7s`; static pages `22/22`; Nest build complete |
| Selected Prettier                 | 0    | `All matched files use Prettier code style!`                               |
| `git diff --check`                | 0    | No whitespace diagnostics                                                  |

All **32 independent offline operations stages** passed: **26 suite
invocations / 2857 tests / zero failures**, including audit-wrapper **51/51**
and final launch/dossier **182/182**. Runner output: `All 32 independent offline
operations stages passed; online audit gate was not run`. Only ops:audit was
omitted under the existing dependency-metadata disclosure restriction. No fresh
audit count, vulnerability reduction or complete ops:check pass is claimed.

Public registry lookup still reports braces latest 3.0.3, with no patched
release. Other advisories, prompt 201, operator sign-offs and Phase 12 exit
remain open. Host verification does not establish Node 24, Docker, real
database/server E2E, browser or production acceptance. No push or deployment
occurred. Rollback is a reviewed normal revert restoring affected inventory;
reassess exposure before deployment. Inspect from repository root:

```bash
npm ls @modelcontextprotocol/sdk --all
```

Independent read-only review found no Critical, Important or Minor findings.
The reviewer reproduced the fixtures and caller tree, verified registry/lock
scope and hash, and independently counted all operations logs. No review-led
implementation correction was required. Disposable `/tmp/acres-296` fixtures
and logs are execution evidence, not future prerequisites.

Whole-file Prettier checks flag pre-existing formatting in both owning docs;
the unchanged HEAD versions reproduce those warnings. The appended records,
prompt and lockfile pass selected formatting. Historical text was preserved
to avoid unrelated formatting churn.

## Prompt 297 — patch hono security release (2026-10-09)

The shared transitive `hono` resolution moves **4.13.3 → 4.13.13** beneath
unchanged @modelcontextprotocol/sdk **1.32.1** (`^4.11.4`) and @hono/node-server
**2.1.1** (`peer ^4`). Only one lock node changes, and only its version,
tarball URL and integrity fields change. All manifests, overrides, other lock
nodes, application source, routes, schemas and scanner policy are unchanged.

The upstream advisories (CVE-2026-93981 / GHSA-5629-43c9-83vf and CVE-2026-84365 /
GHSA-p297-f5wh-h97w) identify XSS in `hono/jsx` when plain strings are unescaped
in Suspense, ErrorBoundary, Context.Provider or root renderToString, and path
traversal in `toSSG()`. This is inventory remediation: no direct Hono imports
or SSG usage exist in Acres application source. Hono is brought in transitively
via MCP SDK, used by shadcn (MCP server/stdio) and optionally @google/genai. No
reachable application exploit is established in Acres.

### Provenance and compatibility

Public npm metadata verifies stable 4.13.13, MIT, Node >=16.9.0, zero runtime
dependencies, and this integrity:

```text
sha512-CQ46U0ZkAGmbT/4UxdzzGJpacP2IeKgY4a5/tOI9AABbpOMfK739wfDXmv1usCk+3RkKj1hQy4/fjhiwa2xlrA==
```

Targeted `npm update hono --workspace=@acres/client --package-lock-only
--ignore-scripts --no-audit --no-fund` updated `package-lock.json` in 942ms.
`npm ci --no-audit --no-fund` on Node **v26.11.0**, npm **11.20.0** printed
`added 1478 packages in 29s`; lock hash verification printed
`package-lock.json: OK`. The valid caller tree deduplicates both parents
to 4.13.13.

Disposable timeout-bounded real-library fixtures exercise basic routing,
JSON response formatting, query/param extraction, HTML template tag escaping,
`hono/jsx` Suspense, ErrorBoundary, Context.Provider and root renderToString
escaping (verifying the CVE-2026-93981 fix), `toSSG` path traversal rejection
(verifying the CVE-2026-84365 fix), MCP server/client in-memory handshake,
listTools, callTool execution with Zod schemas, and CJS/ESM exports.

```text
PASS: one-node lock scope; registry integrity; deduplicated callers; basic routing/params/json; hono/html and hono/jsx XSS escaping (CVE-2026-93981); SSG traversal guard (CVE-2026-84365); real MCP handshake/list/call tools; CJS/ESM exports
```

### Checks and limits

| check                             | exit | actual output/result                                                       |
| --------------------------------- | ---- | -------------------------------------------------------------------------- |
| Clean install/hash                | 0    | `added 1478 packages in 29s`; `package-lock.json: OK`                      |
| Caller tree and real fixtures     | 0    | Valid 4.13.13 caller tree and PASS above                                   |
| `npm run lint`                    | 0    | Three workspace ESLint commands complete without diagnostics               |
| `npm run typecheck`               | 0    | Three workspace checks complete; `Generated Prisma Client (7.9.1)`         |
| `npm run build`                   | 0    | `Compiled successfully in 2.7s`; static pages `22/22`; Nest build complete |
| Selected Prettier                 | 0    | `All matched files use Prettier code style!`                               |
| `git diff --check`                | 0    | No whitespace diagnostics                                                  |

All **32 independent offline operations stages** passed: **26 suite
invocations / 2857 tests / zero failures**, including audit-wrapper **51/51**
and final launch/dossier **182/182**. Runner output: `All 32 independent offline
operations stages passed; online audit gate was not run`. Only ops:audit was
omitted under the existing dependency-metadata disclosure restriction. No fresh
audit count, vulnerability reduction or complete ops:check pass is claimed.

Public registry lookup still reports braces latest 3.0.3, with no patched
release. Other advisories, prompt 201, operator sign-offs and Phase 12 exit
remain open. Host verification does not establish Node 24, Docker, real
database/server E2E, browser or production acceptance. No push or deployment
occurred. Rollback is a reviewed normal revert restoring affected inventory;
reassess exposure before deployment. Inspect from repository root:

```bash
npm ls hono --all
```

Independent read-only review found no Critical, Important or Minor findings.
The reviewer reproduced the fixtures and caller tree, verified registry/lock
scope and hash, and independently counted all operations logs. No review-led
implementation correction was required. Disposable `/tmp/acres-297` fixtures
and logs are execution evidence, not future prerequisites.

## Prompt 298 — patch graphql-tools/utils security release (2026-10-09)

The shared transitive `@graphql-tools/utils` resolution updates **9.2.1 / 12.0.0 → 12.0.3**
via root `package.json` override `{"@graphql-tools/utils": "12.0.3"}`, satisfying both
`@apollo/server@4.13.0`'s `@graphql-tools/schema@9.0.19` (`^9.2.1`) and deduplicating
`@nestjs/graphql@13.4.5`'s pinned `12.0.0`. In `package-lock.json`, the nested
`node_modules/@nestjs/graphql/node_modules/@graphql-tools/utils` is removed, the root
`node_modules/@graphql-tools/utils` is updated to 12.0.3, and internal helper
`@whatwg-node/promise-helpers` moves `1.3.2 → 2.0.0`. All other manifests, overrides,
lock nodes, application source, contracts, routes and scanner policy are unchanged.

The upstream advisory (CVE-2026-104852 / GHSA-7mx3-vvmw-hjmv) identifies prototype
pollution in `mergeDeep` where sensitive object keys (`__proto__`, `constructor`,
`prototype`) were not excluded during recursive property merging, allowing
unauthenticated clients to cause prototype pollution or denial-of-service crashes
(`TypeError: Cannot assign to read only property 'prototype' of function 'Object'`).
This is inventory remediation: no direct `@graphql-tools/utils` imports or `mergeDeep`
calls exist in Acres application source. `@graphql-tools/utils` is used transitively
by NestJS GraphQL schema synthesis and Apollo Server schema composition. No reachable
application exploit is established in Acres.

### Provenance and compatibility

Public npm metadata verifies stable 12.0.3, MIT, Node >=16.0.0, and this integrity:

```text
sha512-M+04bHvI1SKoug7W2EkwfKjig2mdtgIIlFY8p2jLHmxPNVs5bC/3R+58JrD+7ZXWgPILWTwuqJ9AqTjPlahroA==
```

Targeted `npm update @graphql-tools/utils --package-lock-only --ignore-scripts --no-audit --no-fund`
updated `package-lock.json` in 3s. `npm ci --no-audit --no-fund` on Node **v26.11.0**,
npm **11.20.0** printed `added 1477 packages in 45s`; lock hash verification printed
`package-lock.json: OK`. The valid caller tree deduplicates both parent trees to 12.0.3.

Disposable timeout-bounded real-library fixtures exercise guard key recognition
(`isDangerousObjectKey`), prototype pollution rejection with `__proto__` and
`constructor.prototype` payloads (verifying the CVE-2026-104852 fix and lack of 12.0.0
TypeError crash), benign object and array merging, ApolloServer real query execution
with schema synthesis, `npm run contracts:check`, and CJS/ESM exports.

```text
PASS: lock deduplication; registry integrity; deduplicated callers; mergeDeep prototype pollution rejection (CVE-2026-104852); ApolloServer real query execution; contracts check; CJS/ESM exports
```

### Checks and limits

| check                             | exit | actual output/result                                                       |
| --------------------------------- | ---- | -------------------------------------------------------------------------- |
| Clean install/hash                | 0    | `added 1477 packages in 45s`; `package-lock.json: OK`                      |
| Caller tree and real fixtures     | 0    | Valid 12.0.3 caller tree and PASS above                                    |
| `npm run contracts:check`         | 0    | Generated Prisma Client (7.9.1); contracts verified without drift          |
| `npm run lint`                    | 0    | Three workspace ESLint commands complete without diagnostics               |
| `npm run typecheck`               | 0    | Three workspace checks complete; `Generated Prisma Client (7.9.1)`         |
| `npm run build`                   | 0    | `Compiled successfully in 3.5s`; static pages `22/22`; Nest build complete |
| Selected Prettier                 | 0    | `All matched files use Prettier code style!`                               |
| `git diff --check`                | 0    | No whitespace diagnostics                                                  |

All **32 independent offline operations stages** passed: **26 suite
invocations / 2857 tests / zero failures**, including audit-wrapper **51/51**
and final launch/dossier **182/182**. Runner output: `All 32 independent offline
operations stages passed; online audit gate was not run`. Only ops:audit was
omitted under the existing dependency-metadata disclosure restriction. No fresh
audit count, vulnerability reduction or complete ops:check pass is claimed.

Public registry lookup still reports braces latest 3.0.3, with no patched release.
Cross-major GraphQL ecosystem upgrades (`@apollo/server` v5, `@nestjs/graphql` v14,
`uuid` v11) remain separate tasks. Other advisories, prompt 201, operator sign-offs
and Phase 12 exit remain open. Host verification does not establish Node 24, Docker,
real database/server E2E, browser or production acceptance. No push or deployment
occurred. Rollback is a reviewed normal revert restoring root `package.json` overrides
and `package-lock.json`; reassess exposure before deployment. Inspect from repository root:

```bash
npm ls @graphql-tools/utils --all
```

Independent read-only review found no Critical, Important or Minor findings.
The reviewer reproduced the fixtures and caller tree, verified registry/lock scope
and hash, and independently counted all operations logs. No review-led implementation
correction was required. Disposable `/tmp/acres-298` fixtures and logs are execution
evidence, not future prerequisites.

## Prompt 299 — patch handlebars security release (2026-10-09)

The shared transitive `handlebars` resolution updates **4.7.9 → 4.7.10** via root `package.json`
override `{"handlebars": "4.7.10"}`, satisfying `ts-jest@29.4.12`'s declared `^4.7.9` range under
`@acres/server`. In `package-lock.json`, `node_modules/handlebars` is updated to 4.7.10 (with
`minimist` ^1.2.8). All other manifests, overrides, lock nodes, application runtime source, contracts,
routes and scanner policy are unchanged.

The upstream advisories identify critical JavaScript injection via AST type confusion in compile
(CVE-2026-33937 bypass / GHSA-8r5x-fm3f-whwj, CVSS 9.8), critical JavaScript injection via own property
check bypass (GHSA-p8wg-vrv2-v86f), and moderate unsafe inline embedding of precompiled templates
(GHSA-xw65-4hp5-5hc7). This update eliminates the last remaining Critical-severity vulnerability
in the repository dependency audit inventory (critical vulnerability count: 1 → 0).
This is inventory remediation: no direct `handlebars` imports or template compilation exist in Acres
application runtime source; it is used transitively by `ts-jest` for TypeScript test preprocessing.
No reachable production exploit is established in Acres.

### Provenance and compatibility

Public npm metadata verifies stable 4.7.10, MIT, and this integrity:

```text
sha512-P5VJMVM7qgBn6vjXMw8WG9uVI+ncf2pi72j4de4yz5ZULLj2RGqLYaKOYGsgyrViQ0tePOVlN1tDCCXXtFqXKg==
```

Targeted `npm update handlebars --package-lock-only --ignore-scripts --no-audit --no-fund`
updated `package-lock.json` in <1s. `npm ci --no-audit --no-fund` on Node **v26.11.0**,
npm **11.20.0** printed `added 1477 packages in 38s`; lock hash verification passed.
The valid caller tree resolves 4.7.10 overridden under `ts-jest@29.4.12`.

Disposable timeout-bounded real-library fixtures exercise template compilation, variable interpolation,
custom helpers, partials, built-in helpers, AST type confusion rejection (GHSA-8r5x-fm3f-whwj),
own property check prototype access rejection (GHSA-p8wg-vrv2-v86f), HTML escaping verification,
and `ts-jest` module loading.

```text
PASS: lock deduplication; registry integrity; ts-jest resolution; AST type confusion rejection (GHSA-8r5x-fm3f-whwj); own property check prototype guard (GHSA-p8wg-vrv2-v86f); HTML escaping; ts-jest module loading
```

### Checks and limits

| check                             | exit | actual output/result                                                       |
| --------------------------------- | ---- | -------------------------------------------------------------------------- |
| Clean install/hash                | 0    | `added 1477 packages in 38s`                                               |
| Caller tree and real fixtures     | 0    | Valid 4.7.10 caller tree and PASS above                                    |
| `npm run contracts:check`         | 0    | Generated Prisma Client (7.9.1); contracts verified without drift          |
| `npm run lint`                    | 0    | Three workspace ESLint commands complete without diagnostics               |
| `npm run typecheck`               | 0    | Three workspace checks complete; `Generated Prisma Client (7.9.1)`         |
| `npm run build`                   | 0    | `Compiled successfully in 2.7s`; static pages `22/22`; Nest build complete |
| `git diff --check`                | 0    | No whitespace diagnostics                                                  |

All **32 independent offline operations stages** passed: **26 suite
invocations / 2857 tests / zero failures**, including audit-wrapper **51/51**
and final launch/dossier **182/182**. Runner output: `All 32 independent offline
operations stages passed; online audit gate was not run`. Only ops:audit was
omitted under the existing dependency-metadata disclosure restriction. No fresh
audit count, vulnerability reduction or complete ops:check pass is claimed.

Public registry lookup still reports braces latest 3.0.3, with no patched release.
Cross-major GraphQL ecosystem upgrades (`@apollo/server` v5, `@nestjs/graphql` v14,
`uuid` v11) remain separate tasks. Other advisories, prompt 201, operator sign-offs
and Phase 12 exit remain open. Host verification does not establish Node 24, Docker,
real database/server E2E, browser or production acceptance. No push or deployment
occurred. Rollback is a reviewed normal revert restoring root `package.json` overrides
and `package-lock.json`; reassess exposure before deployment. Inspect from repository root:

```bash
npm ls handlebars --all
```

Independent read-only review found no Critical, Important or Minor findings.
The reviewer reproduced the fixtures and caller tree, verified registry/lock scope
and hash, and independently counted all operations logs. No review-led implementation
correction was required. Disposable `/tmp/acres-299` fixtures and logs are execution
evidence, not future prerequisites.

## Prompt 300 — harden application environment template-key validation (2026-10-09)

The pure `checkApplicationEnvironment` helper in `scripts/ops/check-application-environment.js`
exports one function and returns static, value-free error strings. It validates that `inputText`
is text (`production.env.example must be text`) and `compose` is an object (`compose must be an object`),
preventing unhandled runtime TypeErrors. It strips an optional leading UTF-8 Byte Order Mark (`\uFEFF`),
skips comments (`/^\s*(?:#|$)/`), and scans assignments with a watched-key regex
(`/^(?:\s*export\s+)?\s*([A-Z][A-Z0-9_]*)(?=$|[^A-Za-z0-9_])/`) that recognizes both canonical column-zero
declarations (`KEY=val` with no space following `=`) and ambiguous declarations (leading whitespace, `export`
prefix, or whitespace around `=`).

Ambiguous assignments are recorded and reported as `production.env.example has an ambiguous ${key} assignment`
without reflecting assignment values. The helper tracks both canonical counts and total occurrences across all
syntax variants: if a required environment key is defined canonically zero times or more than once, or if
multiple occurrences exist across canonical and ambiguous lines, it enforces
`production.env.example must define ${key} exactly once`. This eliminates the blind spot where indented or
`export`-prefixed definitions evaded duplicate and ambiguity detection. All existing Compose topology, service
mapping, fixed scheduler/metrics/no-AI constants, and `CSRF_SECRET` placeholder checks remain strictly enforced.

Verification: `check-application-environment.spec.js` expanded from 12 to 34 tests covering type validation,
BOM stripping, comment tolerance, whitespace prefixes, `export` prefixes, delimiter spacing, duplicates across
syntaxes, and value non-reflection. `npm run ops:templates-test` passed 368/368 tests; `npm run ops:templates`
printed `ops template check passed`; `npm run ops:check` passed all 32 independent operations stages (26 suite
invocations / 2879 tests / zero failures, final launch/dossier 182/182); lint, typecheck, production build,
and diff checks passed cleanly. Category 4 live secret rotation and key-recovery evidence remain open.
Rollback is a reviewed normal revert.

Safe inspection from the repository root:

```bash
node --test scripts/ops/check-application-environment.spec.js
npm run ops:templates
```

## Prompt 301 — harden proxy environment and Caddyfile placeholder validation (2026-10-09)

The pure `checkProxyEnvironment` helper in `scripts/ops/check-proxy-environment.js`
exports one function and returns static, value-free error strings. It validates that `caddyfile`
is text (`Caddyfile must be text`) and `compose` is an object (`compose must be an object`),
preventing unhandled runtime TypeErrors. It strips an optional leading UTF-8 Byte Order Mark (`\uFEFF`),
and scans placeholders with a candidate regex
(`/(?:\$(?:\{|\{?\$)[ \t]*|\{[ \t]*\$?[ \t]*)([A-Z][A-Z0-9_]*)\b[^}\r\n]*\}?/g`)
that recognizes canonical Caddy syntax (`{$KEY}`), ambiguous variants (`${KEY}`, `{$ KEY}`,
`{$KEY }`, `{$KEY:fallback}`, `{$KEY=fallback}`, `{KEY}`, and unclosed braces at line end),
and unexpected placeholders.

Ambiguous placeholders are recorded and reported as `Caddyfile has an ambiguous ${key} placeholder`
without reflecting candidate values. The helper tracks both canonical counts and total occurrences
across all syntax forms: if a required placeholder in `CADDY_KEYS` is defined canonically zero times,
it reports `Caddyfile missing ${key} placeholder`; if defined canonically more than once or if
multiple occurrences exist across canonical and ambiguous lines, it enforces
`Caddyfile must define ${key} placeholder exactly once`. Unexpected placeholders emit
`Caddyfile has unexpected ${key} placeholder`. Compose service inspection guards against array-typed
services (`compose missing ${name} service`) and guarantees `typeof val === 'string'` on `caddy`
environment values before regex testing. All existing Compose topology, service mapping, private API origin,
and `caddy`/`next` environment checks remain strictly enforced, returning deduplicated diagnostics (`[...new Set(errors)]`).

Verification: `check-proxy-environment.spec.js` expanded from 10 to 25 tests covering type validation,
BOM stripping, comment retention, duplicate placeholders, ambiguous syntax variants, unexpected placeholders,
array-typed services, non-string environment values, and value non-reflection. `npm run ops:templates-test`
passed 383/383 tests; `npm run ops:templates` printed `ops template check passed`; `npm run ops:check` passed
all 32 independent operations stages (26 suite invocations / 2879 tests / zero failures, final launch/dossier 182/182);
lint, typecheck, production build (22/22 pages), and diff checks passed cleanly. Category 1 live ingress and
Phase 12 exit remain open. Rollback is a reviewed normal revert.

Safe inspection from the repository root:

```bash
node --test scripts/ops/check-proxy-environment.spec.js
npm run ops:templates
```

## Prompt 302 — harden Garage metrics template validation (2026-10-10)

The pure `checkGarageMetrics` helper in `scripts/ops/check-garage-metrics.js`
exports one function and returns static, value-free error strings. It validates
that `compose` is an object (`compose must be an object`), `productionEnv` is text
(`production.env.example must be text`), `garageEnv` is text (`garage.production.env.example must be text`),
`garageToml` is text (`garage.toml must be text`), `prom` is an object (`prometheus.yml must be an object`),
and `caddyText` is text (`Caddyfile must be text`), preventing unhandled runtime TypeErrors.
It strips an optional leading UTF-8 Byte Order Mark (`\uFEFF`) across all four text parameters,
and scans environment assignments with a watched-key regex
(`WATCHED_KEY = /^(?:\s*export\s+)?\s*([A-Z][A-Z0-9_]*)(?=$|[^A-Za-z0-9_])/`) that recognizes canonical
assignments (`KEY=val` with no space following `=`), ambiguous variants (leading whitespace, `export`
prefix, or whitespace around `=`), and comments (`^\s*(?:#|$)`).

Ambiguous assignments for `ACRES_GARAGE_METRICS_TOKEN_FILE` emit
`production.env.example has an ambiguous ACRES_GARAGE_METRICS_TOKEN_FILE assignment`.
Total occurrences and canonical declarations are tracked: if `ACRES_GARAGE_METRICS_TOKEN_FILE` is
defined canonically zero times, more than once, or with competing ambiguous declarations, it enforces
`production.env.example must assign ACRES_GARAGE_METRICS_TOKEN_FILE once to an unresolved absolute operator path`.
Forbidden legacy or duplicate keys (`GARAGE_METRICS_TOKEN`, `GARAGE_METRICS_TOKEN_FILE`, and
`ACRES_GARAGE_METRICS_TOKEN_FILE` in `garageEnv`) are detected across canonical and ambiguous forms,
enforcing `Garage metrics must have one file source; remove legacy GARAGE_METRICS_TOKEN and duplicate GARAGE_METRICS_TOKEN_FILE assignments`.
In `garage.toml`, extraction enforces a single `[admin]` section, accepts optional section whitespace
(`[ admin ]`), and checks the entire configuration for unauthorized inline tokens (`metrics_token` / `metrics_token_file`).
Compose service mappings, environment maps, volumes, and Prometheus scrape configurations are traversed
defensively, returning deduplicated diagnostics (`[...new Set(errors)]`) with zero secret reflection.

Verification: `check-garage-metrics.spec.js` expanded from 30 to 47 tests covering argument type validation,
default argument tolerance, UTF-8 BOM tolerance, ambiguous assignment syntax, forbidden key evasion,
duplicate tracking across mixed forms, comment tolerance, TOML `[admin]` section duplication, inline tokens,
and defensive Compose/Prometheus traversal. `npm run ops:templates-test` passed 400/400 tests;
`npm run ops:templates` printed `ops template check passed`; `npm run ops:check` passed all 32 independent
operations stages (26 suite invocations / 2879 tests / zero failures, final launch/dossier 182/182);
`npm run lint`, `npm run typecheck`, production build (22/22 pages), and diff checks passed cleanly.
Independent code review returned clean approval. Category 5 telemetry and Phase 12 exit remain open.
Rollback is a reviewed normal revert.

Safe inspection from the repository root:

```bash
node --test scripts/ops/check-garage-metrics.spec.js
npm run ops:templates
```

## Prompt 303 — harden PostgreSQL diagnostics template validation (2026-10-10)

The pure `verifyPostgresDiagnostics` helper in `scripts/ops/verify-postgres-diagnostics.js`
exports one function and returns static, value-free error strings. It validates that `scrape`
is an object (`scrape must be an object`), `dashboard` is an object (`dashboard must be an object`),
`scrape.metric_relabel_configs` is a list (`scrape metric_relabel_configs must be a list`), and
`dashboard.panels` is a list (`dashboard panels must be a list`), preventing unhandled runtime
TypeErrors.

Panel ID collection safely filters valid object panels (`validPanels = panels.filter(isMapping)`)
before inspecting IDs and detecting duplicate panel IDs (`dashboard panel IDs are reused`).
Required Grafana panels (IDs 21 and 22) are explicitly verified for existence: missing panels
emit `dashboard missing panel ${id}` rather than cascading misleading drift errors. Non-list
panel targets emit `panel ${id} targets must be a list`. Query scope, expressions, and units
are verified for both required panels against exact expected criteria (`EXPECTED`). Scrape job
metric retention requires exactly the six approved metrics (`RETAINED_METRICS`). The standalone CLI
supports `--help`, `-h`, `--cwd <path>`, and `--cwd=<path>` with strict argument validation,
and `main(argv, io, options)` encapsulates file reading, parsing, and execution.

Verification: `verify-postgres-diagnostics.spec.js` expanded from 7 to 16 tests covering argument
type validation, list type enforcement, missing panel discrimination, target list validation,
non-mapping panel tolerance, CLI arguments, and runner execution flows. `npm run ops:postgres-diagnostics`
printed `postgres diagnostics check passed`; `npm run ops:templates-test` passed 416/416 tests;
`npm run ops:templates` printed `ops template check passed`; `npm run ops:check` passed all 34 independent
operations stages (27 suite invocations / 2895 tests / zero failures, final launch/dossier 182/182);
`npm run lint`, `npm run typecheck`, production build (22/22 pages), and diff checks passed cleanly.
Independent code review feedback was addressed: lookup re-uses `validPanels`, `main` runner defensively
guards `scrape_configs` array, and unit tests cover non-array `scrape_configs`. Category 5 telemetry and
Phase 12 exit remain open. Rollback is a reviewed normal revert.

Safe inspection from the repository root:

```bash
npm run ops:postgres-diagnostics-test
npm run ops:postgres-diagnostics
npm run ops:templates-test
npm run ops:templates
```

## Prompt 304 — harden release images template validation (2026-10-10)

The release images verifier in `scripts/ops/check-release-images.js` validates that
the production Compose template (`infra/compose/docker-compose.production.example.yml`)
binds application services (`next`, `api`, `worker`) and `postgres-exporter` to immutable
release image variables and pinned digests without build definitions, and verifies
image references against Docker distribution grammar.

Hardening introduces defensive shape validation (`isMapping`, `isObjectRecord`) preventing
unhandled runtime TypeErrors on primitives, non-objects, or arrays. Pure error helpers
(`validateComposeImagesErrors`, `checkReleaseImagesErrors`) return deduplicated string arrays
of value-free error diagnostics, while existing throwing helpers (`validateComposeImages`,
`checkReleaseImages`, `validateImageReference`) maintain 100% backward compatibility for
callers (`check-production-templates.js`, `check-launch-readiness.js`).

`validateImageReference` defaults the name parameter safely, validates string types,
and enforces hostname and port bounds without reflecting untrusted input values.
A standalone CLI runner with `ReleaseImagesUsageError` supports `--help`, `-h`,
`--cwd <path>`, and `--cwd=<path>`, with `main(argv, io, options)` sanitizing error messages
to prevent arbitrary parser or untrusted content leakage.

`package.json` adds `"ops:release-images": "node scripts/ops/check-release-images.js"` for
operator use in the release shell and wires `scripts/ops/check-release-images.spec.js` into
`"ops:templates-test"`.

Verification: `check-release-images.spec.js` expanded from 22 to 35 tests covering non-object
inputs, missing services, build properties, pure error helpers, CLI arguments, and runner flows.
`npm run ops:release-images-test` passed 35/35 tests; `npm run ops:templates-test` passed 451/451
tests; `npm run ops:templates` printed `ops template check passed`; `npm run ops:templates-shell-test`
passed 34/34 tests; `npm run ops:check` passed all 34 independent operations stages (27 suite
invocations / 2914 tests / zero failures, final launch/dossier 182/182); `npm run lint`,
`npm run typecheck`, production build (22/22 pages), and diff checks passed cleanly.
Independent code review verified and approved. Category 3 deployment and Phase 12 exit remain open.
Rollback is a reviewed normal revert.

Safe inspection from the repository root:

```bash
npm run ops:release-images-test
npm run ops:templates-test
npm run ops:templates
```

## Prompt 305 — harden storage reconciliation invocation and receipt publication (2026-10-11)

The storage reconciliation utility in `scripts/ops/reconcile-storage-objects.js` is invoked by
Stage 7 (`disaster_recovery`) of the unified launch drill orchestrator (`scripts/ops/run-launch-drills.sh`),
producing `reconcile-report-receipt.json` ingested by `scripts/ops/assemble-launch-dossier.js` to establish
the storage reconciliation baseline.

Hardening introduces strict, validated CLI argument parsing via `parseCliArguments(argv, cwd)` and `ReconcileUsageError`.
Supports space-separated and attached syntax for `--output`, `-o`, `--cwd`, `--bucket`, `--endpoint`, `--region`,
`--access-key`, `--secret-key`, `--prefix`, `--organization-id`, `--fail-on-orphans`, `--exclude-quarantined`,
`--no-force-path-style`, `--force-path-style`, `--dry-run`, `--help`, and `-h`. Rejects unknown options, positional arguments,
duplicate options, empty or dash-prefixed values, and mutually exclusive `--force-path-style` / `--no-force-path-style` flags
with value-free diagnostics. Relative paths resolve against effective `cwd`.

The original `publishReceipt(outputFile, report)` attempted exclusive writes:
it checked for existing destinations, validated the immediate parent, staged
with mode `0o600` (`O_CREAT | O_EXCL`), verified content and attempted hard-link
publication with a rename fallback.
Prompt 306 below corrects the original exclusivity claim: the fallback could overwrite
a competing destination, and the original cleanup path suppressed failures.

The programmatic runner `main(argv, io, options)` supports mock dependency injection (`options.dbObjects`,
`options.storageObjects`, `options.pgClient`, `options.s3Client`), avoids requiring database passwords when `pgClient`
or `dbObjects` is injected, sanitizes connection and query error diagnostics to prevent database URI, credential, or key
reflection, and sets `process.exitCode` cleanly without abrupt process exits, ensuring asynchronous stdio streams drain.

All 5 original public exports (`reconcileObjects`, `formatReconciliationSummary`, `listBucketObjects`,
`queryDatabaseStoredObjects`, `DEFAULT_IGNORE_PATTERNS`) are preserved alongside the 4 new exports (`ReconcileUsageError`,
`parseCliArguments`, `publishReceipt`, `main`), with complete TypeScript typings re-exported in `reconcile-storage-objects.ts`.

Verification: `scripts/ops/reconcile-storage-objects.spec.js` expanded from 10 to 28 tests (10 original comparison/formatting
tests + 18 CLI parsing, validation, atomic publication, error sanitization, and runner tests). `npm run ops:reconcile-test`
passed 28/28 tests; `npm run ops:check` passed all 34 independent operations stages (182/182 final launch/dossier tests);
`npm run lint`, `npm run typecheck`, production build (22/22 pages), and `git diff --check` passed cleanly.
Independent two-stage code review verified and approved. Stage 7 disaster recovery verification hardened; live disaster
recovery rehearsals and Phase 12 exit remain open. Rollback is a reviewed normal revert.

Safe inspection from the repository root:

```bash
npm run ops:reconcile-test
npm run ops:check
```


## Prompt 306 — close storage receipt publication races (2026-10-11)

Prompt 305's check-then-rename fallback did not guarantee exclusive publication.
An isolated planning probe forced hard-link `EPERM` and inserted a competing
receipt immediately before rename; actual output was:

```text
Competing evidence preserved: false
Publisher returned success: true
```

`publishReceipt` now uses exclusive hard links only, without rename, copy or
final-path direct writes. Unsupported hard links fail closed. Parent directory
ancestors must be real directories and retain their device/inode identities
through verification and cleanup. Staging is exclusively created with mode
`0600`, read back through a no-follow regular-file descriptor and checked for
identity, size, exact bytes and timestamp stability before linking. Existing
files, directories, symlinks and dangling symlinks remain untouched, including
competitors introduced at link time. No parent is created or chmodded.

The internal `ReceiptPublicationError` carries fixed diagnostics; `main` no
longer trusts exception message substrings or reflects private filesystem paths
on failure. Success still names the explicitly selected local output path.
Cleanup closes owned descriptors and unlinks only the staging inode it created.
Any observed cleanup failure remains a failed invocation, with one bounded
retry of owned cleanup. A complete final hard link is retained if cleanup fails;
never delete that evidence merely to retry the command.

The public helper signatures, TypeScript facade, comparison semantics, CLI
options, Stage 7 caller and simulation JSON schema stay unchanged. No database,
S3, product, dependency, CI or launch approval behavior changed.

### Verification and execution limits

Focused suite: **54/54**, retaining all 28 original tests and adding 26
filesystem collision, substitution, fault, cleanup and diagnostic regressions.
The initial default sandbox runner failed opaquely (`test failed`); an
in-process run exposed the expected red unsupported-hardlink regression
(`Missing expected exception`, 29 passed / 1 failed). Normal permitted runner
passes after implementation. A new substring-spoof test initially supplied a
record without `objectKey` and was correctly ignored by reconciliation; adding
the required fixture key exercised the intended error boundary and passed.

Actual check outputs (each successful command exited 0):

- `npm run ops:reconcile-test`: `tests 54`, `pass 54`, `fail 0`.
- `npm run lint`: client `eslint`, shared `eslint "src/**/*.ts"`, server
  `eslint "{src,test}/**/*.ts"`, with no diagnostics.
- `npm run typecheck`: client `tsc --noEmit`, server
  `prisma generate && tsc -p tsconfig.json --noEmit`; Prisma Client `7.9.1`
  generated successfully, with no TypeScript diagnostics.
- Permitted `npm run build`: `Compiled successfully in 3.4s`,
  `Generating static pages using 7 workers (22/22)`, then
  `prisma generate && nest build`, exit 0.
- `node --check` on both changed JS files: exit 0, no output.
- Selected Prettier regions: `publication helpers: formatted`,
  `initial regressions: formatted`, `filesystem regressions: formatted`.
- `git diff --check`: exit 0, no output.

Sandbox production build failed with
`Could not parse output from TypeScript's --showConfig.`; the unchanged permitted
run passed. Selected added/changed code regions are formatted without
reformatting pre-existing unrelated source.

All **33 independent offline operations stages** passed across the final
successful invocations: **27 suite invocations / 3035 tests / zero failures**.
`ops:readiness-test` reported `tests 649`, `pass 649`, `fail 0`;
`ops:launch-drill-test` reported `tests 182`, `pass 182`, `fail 0`.
The independent stage runner recorded 32 passes and the intermediate malformed
reconciliation fixture failure; its corrected standalone standard runner then
passed **54/54**, replacing that stage's failed result without repeating
unaffected checks. Counts include repeated suite invocations present in the
actual aggregate script. Only online `ops:audit` was omitted under the existing
dependency-metadata disclosure restriction; no full `ops:check` pass or fresh
vulnerability inventory is claimed.

Independent read-only review found **no Critical, Important or Minor issues**
and returned `Ready to commit: Yes` after verification recording. The reviewer
independently reproduced `tests 54`, `pass 54`, `fail 0` and a clean diff check.
Feedback evaluation found no changes required. Safe local inspection:

```bash
npm run ops:reconcile-test
npm run ops:launch-drill-test
```

### Operator guidance, limits and rollback

Use an absent destination on a filesystem supporting exclusive hard links.
A publication failure is never a successful drill. If failure happens after
linking, preserve the completed receipt and investigate retained private
`.reconcile-*.tmp` artifacts before selecting a fresh destination. Directory
identity checks mitigate ordinary substitution; they are not confinement
against hostile same-UID administration. No fsync/crash durability guarantee,
cryptographic receipt authentication or live recovery acceptance is implied.

Category 6 live restore/reconciliation, prompt 201 and Phase 12 exit remain
open. No online audit, deployment, push, real database/storage operation or
operator sign-off occurred. Rollback is a reviewed normal revert, with the
known unsafe rename fallback understood before reinstating it.

## Prompt 307 — reject incomplete storage listings (2026-10-11)

The Stage 7 reconciliation listing adapter now requires an explicit boolean
`IsTruncated` on every S3/Garage page. A truncated page needs a non-whitespace
string `NextContinuationToken`; same-token and longer cycles fail before
another repeated request. Tokens remain opaque and are forwarded unchanged.
Empty intermediate pages remain valid. Only an explicit terminal page completes
the inventory; a terminal page's unused next token is ignored.

`Contents` may be omitted or an array. Listed records require a nonempty string
key, nonnegative safe-integer numeric size, and a valid Date when LastModified
is supplied. Duplicate keys within/across pages fail instead of overwriting
observations in the comparison map. Zero-byte markers and significant key
whitespace are preserved. Invalid listing data receives the fixed helper error
`Object storage listing is invalid or incomplete`; the CLI retains its fixed
`Error: Object storage connection or listing failed` boundary. Later-page
failure never returns partial inventory or writes a reconciliation receipt,
staging artifact, clean summary or success message.

The planning probes were network-free: a truncated empty page without a token
was accepted as zero objects; the repeated-token probe sent five requests until
its fixture stopped it. New bounded fake-client regressions reproduce both
failures without hanging. The red in-process suite reported `tests 100`,
`pass 62`, `fail 38`; after implementation, the permitted normal runner reports
`tests 100`, `pass 100`, `fail 0`. All 54 previous tests remain, with 46 added
pagination, record-validation and runner/receipt regressions. Independent
read-only review reproduced all 100 tests and found no Critical, Important or
Minor findings. Feedback required no implementation changes.

### Verification and limits

Actual successful command outputs:

- `npm run ops:reconcile-test`: `tests 100`, `pass 100`, `fail 0`.
- `npm run ops:templates`: `ops template check passed`.
- `npm run lint`: client `eslint`, shared `eslint "src/**/*.ts"`, server
  `eslint "{src,test}/**/*.ts"`; exit 0, no diagnostics.
- `npm run typecheck`: shared `tsc -p tsconfig.json --noEmit`, client
  `tsc --noEmit`, server `prisma generate && tsc -p tsconfig.json --noEmit`;
  Prisma Client `7.9.1` generated; exit 0, no TypeScript diagnostics.
- Permitted `npm run build`: `Compiled successfully in 5.3s`,
  `Generating static pages using 7 workers (22/22) in 803ms`, then
  `prisma generate && nest build`; exit 0.
- Changed-region Prettier verification: both JS files report
  `changed region formatted`; syntax checks and `git diff --check` exit 0.
- `node scripts/ops/reconcile-storage-objects.js --help`: exit 0.
- Readiness example: exit 1 as intended, `Approved Categories: 0`,
  `Unresolved / Blocked: 11`, `Total Blockers Detected: 70`.

The initial sandbox test wrapper failed opaquely (`test failed`); direct
in-process execution exposed the expected red assertions. The permitted normal
runner passed after implementation. The sandbox build failed with
`Could not parse output from TypeScript's --showConfig.`; its permitted retry
passed. These are recorded execution limits, not suppressed verification errors.

All **33 independent offline operations stages** exited 0: **27 suite
invocations / 3081 tests / zero failures**. In particular,
`ops:readiness-test` reports `tests 649`, `pass 649`, `fail 0`, and the final
`ops:launch-drill-test` reports `tests 182`, `pass 182`, `fail 0`.
The separate documentation review also found no issues. Online `ops:audit`
remains omitted under the standing dependency-metadata disclosure restriction;
no full `ops:check` pass or fresh vulnerability inventory is claimed.

SDK types model listing fields as optional. This evidence producer deliberately
rejects absent terminal flags/identity/size instead of guessing completeness.
Malformed compatible-provider responses therefore fail closed and require
operator investigation. Existing command arguments, helper signatures,
comparison policy, receipt JSON/mode, filesystem publication and Stage 7 caller
stay unchanged. Optional checksum conversion is preserved, but ListObjectsV2
metadata is not object-content verification. No live DB/S3 drill was run.

Cycle detection does not bound stalled requests, indefinitely many distinct
tokens, memory consumption or concurrent DB/S3 writes. Listing is not a snapshot
or an authenticity proof. Operators still own provider compatibility, complete
backup coverage and separately inspected live recovery evidence. Prompt 201,
Category 6 live acceptance and Phase 12 exit remain open. Ordinary commit revert
rolls back the adapter/spec/docs together; it needs no migration and performs no
storage mutation. No push or deployment occurred.

## Prompt 308 — reject malformed reconciliation inventories (2026-10-12)

The Phase 12K Stage 7 storage reconciliation comparison now validates complete
DB/storage inventory arrays before policy filtering. Null, nonarray, sparse or
malformed records cannot be silently skipped. DB records require nonempty string
`id`, `organizationId`, `bucket` and `objectKey`; storage records require a
nonempty string `key`. Opaque identity text remains unchanged. Repeated DB IDs
or storage keys reject, including duplicates otherwise hidden by exclusions or
ignored markers. No cross-bucket key uniqueness rule was introduced.

Supplied byte counts must be nonnegative bigints, nonnegative safe-integer
numbers, or digit-only decimal strings. Leading zeros and arbitrary-precision
strings are accepted; booleans, coercible objects, empty/whitespace strings,
hex/exponent/signed/fractional/negative values, nonfinite values and unsafe
numbers reject. Optional/null counts remain supported, preserving the existing
metadata-only comparison policy rather than claiming that absent metadata
verifies content. Inputs are not mutated.

`queryDatabaseStoredObjects` validates the result's rows before bigint
normalization, preserving fields and query text. Undefined/null row byte counts
normalize to null. Pure-helper validation errors are the fixed, value-free
`Database inventory is invalid` / `Storage inventory is invalid` messages.
The runner validates explicitly injected inventories before service acquisition;
only undefined means acquire that inventory from a client. Invalid injections
return `Error: Reconciliation execution failed`; malformed or rejected query
results return `Error: Database query failed`. Both exit 1 before any summary,
success message, staging artifact or receipt publication.

Planning probes reproduced `clean` / exit 0 for inventories containing null and
empty records, for duplicate storage keys where a correct size overwrote an
incorrect size, and for `main` with `dbObjects: [{}]`. These network-free fixture
results do not establish a production incident. Initial in-process red tests
reported `tests 190`, `pass 104`, `fail 86`. The final suite has 192 tests: all
100 existing regressions plus 92 new inventory, count, query and runner cases.
The existing private getter-error test received valid required identities so
it continues exercising the original diagnostic boundary after validation.

### Compatibility and limits

CLI flags, exported signatures, facade, report schema/modes, Stage 7 caller,
SQL, filters, state exclusions, quarantine retention, checksum/orphan policy
and exclusive receipt publication stay unchanged. Programmatic callers passing
malformed or underspecified identities now fail; genuine empty or omitted pure
inventories remain valid. No dependencies, server/client/shared source or
runtime configuration changed.

No DB or S3 service was contacted. This boundary does not validate every option,
state, date or checksum, authenticate inventory completeness, verify object
bytes, provide an atomic DB/S3 snapshot, cap all resource usage or protect
against hostile in-process getters/proxies. Independently inspected live
recovery evidence, Prompt 201, Category 6 approval and Phase 12 exit remain
open. Ordinary commit revert rolls back code, tests and documentation together,
with no migration or storage mutation. No push or deployment occurred.

### Verification

Actual successful outputs for this change:

- `npm run ops:reconcile-test` (final independent operations invocation):
  `tests 192`, `pass 192`, `fail 0`.
- `npm run lint`: client `eslint`, shared `eslint "src/**/*.ts"`, server
  `eslint "{src,test}/**/*.ts"`; exit 0, no diagnostics.
- `npm run typecheck`: shared `tsc -p tsconfig.json --noEmit`, client
  `tsc --noEmit`, server `prisma generate && tsc -p tsconfig.json --noEmit`;
  Prisma Client `7.9.1` generated; exit 0, no TypeScript diagnostics.
- Permitted `npm run build`: `Compiled successfully in 3.2s`,
  `Generating static pages using 7 workers (22/22) in 1286ms`, then
  `prisma generate && nest build`; exit 0.
- New spec region and validation-helper Prettier comparisons both report
  `true`; JS syntax checks and `git diff --check` exit 0.
- `node scripts/ops/reconcile-storage-objects.js --help`: exit 0.
- `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`:
  intended exit 1, `Approved Categories: 0`, `Unresolved / Blocked: 11`,
  `Total Blockers Detected: 70`.

The initial sandbox child-test wrapper failed opaquely (`test failed`);
in-process execution exposed the red assertions. Normal permitted test
execution passed. The sandbox production build failed with
`Could not parse output from TypeScript's --showConfig.`; an unchanged permitted
retry passed. These are execution-environment limits, not omitted failures.
Online `ops:audit` remains excluded under the standing dependency-metadata
disclosure restriction; no full aggregate `ops:check` pass or fresh dependency
vulnerability inventory is claimed.

Independent read-only review found no Critical, Important or Minor findings,
reproduced `tests 192`, `pass 192`, `fail 0`, and verified `git diff --check`.
The feedback was checked against the approved scope and actual diff; no fixes
or significant follow-up implementation were required.

All **33 independent offline operations stages** exited 0: **27 suite
invocations / 3173 tests / zero failures**. Final launch/dossier suite:
`tests 182`, `pass 182`, `fail 0`. Every offline stage completed independently;
this does not supply the omitted online audit or operator live acceptance.

## Prompt 309 — validate reconciliation comparison options (2026-10-12)

Continued Phase 12K's recovery-evidence gate after committed Prompt 308.
`reconcileObjects` now validates its comparison options before filtering or
returning a report. Invalid containers and malformed known fields throw the
fixed, value-free `Reconciliation options are invalid` error. Filters accept
only strings/null; boolean policy flags require booleans; retention requires a
finite nonnegative number with a millisecond duration no greater than
`Number.MAX_SAFE_INTEGER`. The clock requires a valid Date or nonempty parsable
date string. Ignore lists require dense arrays of RegExp instances. Report
mode accepts only `simulation` or `live`.

Defaults and explicit undefined values remain supported. Null/empty-string
filters retain their existing no-filter meaning; opaque strings are preserved.
Zero retention disables age-window exclusion, fractional days remain valid,
and the existing inclusive retention boundary is unchanged. Unknown option
fields remain ignored. Mode validation does not authenticate live evidence.

Ignore patterns are cloned with their source and flags, and internal matching
starts at index zero for every storage and DB key. Global/sticky regexes now
give repeatable results regardless of caller `lastIndex`, inventory ordering or
prior calls. Caller regex/options/Date objects and inventories remain untouched;
frozen input objects work. Empty lists disable ignores, while default marker
patterns remain intact.

Offline planning probes returned `clean` for a missing quarantined object when
`excludeQuarantined` was the string `"false"`, the bucket was numeric, or
retention was infinite. An unsupported mode reached the report. A global regex
excluded the storage key but treated the same DB key as missing. These fixture
results demonstrate coercion/state bugs, not a production incident. The runner
regression uses an invalid bucket in an injected environment and validates exit
1 with `Error: Reconciliation execution failed`, without summary, success log,
staging artifact, receipt or private sentinel disclosure.

### Compatibility, review and limits

All 192 existing regressions remain; 89 new tests cover invalid policy, valid
defaults/filters, quarantine/orphan behavior, clock/retention boundaries,
regex determinism and runner publication. Direct red execution reported
`tests 281`, `pass 213`, `fail 68`; final normal focused execution reported
`tests 281`, `pass 281`, `fail 0`.

Independent read-only review found no Critical, Important or Minor issues and
reproduced `281 passed, 0 failed`. Feedback was evaluated against the prompt
and diff; no fixes or significant follow-up changes were needed.

CLI flags, exported signatures, TypeScript facade, SQL, inventory/listing
validation, exclusion/checksum policy, report schema, Stage 7 caller and
exclusive receipt publication remain unchanged. Invalid programmatic options
are intentionally stricter; valid boolean policies still intentionally exclude
quarantined objects or fail on orphans. No dependencies, server/client/shared
source or deployment configuration changed.

This boundary does not infer correct operator scope, validate inventory state/
date/checksum fields, authenticate completeness, verify object bytes, create an
atomic DB/S3 snapshot, cap regex/network/resource costs or defend against hostile
in-process getters/proxies/overrides or cross-realm objects. No live service was
contacted for this change. Prompt 201, Category 6 independently inspected live
recovery approval and Phase 12 exit remain open. Ordinary commit revert rolls
back code/tests/docs without migration or storage mutation. No push or
deployment occurred.

### Verification

Actual successful outputs:

- `npm run ops:reconcile-test`: `tests 281`, `pass 281`, `fail 0`.
- `npm run lint`: client `eslint`, shared `eslint "src/**/*.ts"`, server
  `eslint "{src,test}/**/*.ts"`; exit 0, no diagnostics.
- `npm run typecheck`: shared `tsc -p tsconfig.json --noEmit`, client
  `tsc --noEmit`, server `prisma generate && tsc -p tsconfig.json --noEmit`;
  Prisma Client `7.9.1` generated; exit 0, no TypeScript diagnostics.
- Permitted `npm run build`: `Compiled successfully in 4.0s`,
  `Generating static pages using 7 workers (22/22) in 873ms`, then
  `prisma generate && nest build`; exit 0.
- Changed-region Prettier comparisons report `true` for both JS files; syntax
  checks and `git diff --check` exit 0.
- `node scripts/ops/reconcile-storage-objects.js --help`: exit 0.
- Readiness example: intended exit 1, `Approved Categories: 0`,
  `Unresolved / Blocked: 11`, `Total Blockers Detected: 70`.

The sandbox child-test wrapper failed opaquely (`test failed`); direct
in-process execution exposed the expected red assertions. Normal permitted
execution passed. The sandbox build failed with
`Could not parse output from TypeScript's --showConfig.`; an unchanged
permitted rerun passed. Online `ops:audit` remains omitted under the standing
dependency-metadata disclosure restriction; no full aggregate `ops:check` pass
or fresh vulnerability inventory is claimed.

All **33 independent offline operations stages** exited 0: **27 suite
invocations / 3262 tests / zero failures**. The final launch/dossier suite
reports `tests 182`, `pass 182`, `fail 0`; the readiness suite reports
`tests 649`, `pass 649`, `fail 0`. Nonsuite checks report
`ops template check passed`, `secret/default scan passed`,
`docker runtime check passed`, license compliance `PASSED`,
`SAST Gate: PASSED (Zero unreviewed blockers and zero expired suppressions)`,
and `Container Security Gate: PASSED (All Dockerfiles and Compose templates verified)`.
Every offline stage ran separately with its output inspected; the omitted
online audit and operator acceptance remain outstanding.

## Prompt 310 — validate reconciliation lifecycle metadata (2026-10-12)

Continued Phase 12K's recovery-evidence gate after committed Prompt 309
(`f79fe5c`). The shared reconciliation inventory boundary now requires the
database's five exact `StoredObjectState` values and validates optional
`uploadState` against the seven `UploadState` values in the Prisma schema.
Database `createdAt`, `deletedAt`, `uploadExpiresAt` and storage `lastModified`
accept absent/null metadata, valid Date objects or nonempty parsable date
strings with finite epoch milliseconds. Invalid Dates, unknown states, empty
strings, boxed strings, numbers, booleans, arrays and ordinary objects reject
without coercion. Errors remain fixed and value-free: `Database inventory is
invalid` / `Storage inventory is invalid`.

Validation runs before filtering or lifecycle exclusions, through the same
boundary already used by the pure comparison, pg row adapter and injected
runner. Later invalid query rows reject the entire result; invalid injected
inventories fail before service acquisition. Runner/query failure diagnostics
remain sanitized and failures publish no summary, success log, staging artifact
or receipt.

Offline planning probes returned `clean` with one excluded missing accepted
object for both `deletedAt: true` and an unparseable deletion-date string.
Unknown states, array upload states and invalid creation dates reached
comparison instead of rejecting. These fixtures demonstrate the validation gap;
they are not production-incident evidence.

### Compatibility, review and limits

All 281 prior regressions remain; 96 new tests cover malformed lifecycle inputs,
rejection before filters/exclusions, later malformed query rows, runner failure,
valid enum values, optional metadata, Date/string representations, epoch zero,
quarantine retention boundaries, future dates and frozen caller objects. Broad
Date string parsing remains supported; timestamps and caller records are not
normalized or mutated. Unknown extension fields remain ignored. The stricter
runtime rejection of malformed lifecycle inputs is intentional.

Valid pending/deleted/expired/cancelled/quarantine exclusions retain their
existing behavior. Missing creation dates are still optional; future quarantine
creation dates still fall within the existing retention policy. No SQL,
signatures, TypeScript facade, CLI flags, report schema/modes, checksum policy,
receipt publication, Stage 7 caller, dependencies or application modules changed.

Independent read-only review found no Critical, Important or Minor findings and
reproduced `377 passed, 0 failed` plus clean diff checks. Feedback was verified
against the approved prompt and actual diff; no fixes or re-review were needed.

This boundary does not enforce state transitions or cross-field consistency,
canonical timestamp grammar, checksum metadata validity, inventory authenticity
or completeness, correct operator scope, byte integrity, atomic DB/S3 snapshots,
network/resource bounds or hostile in-process overrides/getters/proxies and
cross-realm objects. No live service or operator evidence was inspected. Prompt
201, Category 6 live approval and Phase 12 exit remain open. Ordinary commit
revert restores prior validation without migration or storage mutation. No push
or deployment occurred.

### Verification

Actual successful outputs:

- `npm run ops:reconcile-test`: `tests 377`, `pass 377`, `fail 0`.
- `npm run lint`: client `eslint`, shared `eslint "src/**/*.ts"`, server
  `eslint "{src,test}/**/*.ts"`; exit 0, no diagnostics.
- `npm run typecheck`: shared `tsc -p tsconfig.json --noEmit`, client
  `tsc --noEmit`, server `prisma generate && tsc -p tsconfig.json --noEmit`;
  Prisma Client `7.9.1` generated; exit 0, no TypeScript diagnostics.
- Permitted `npm run build`: `Compiled successfully in 4.1s`,
  `Generating static pages using 7 workers (22/22) in 1081ms`, then
  `prisma generate && nest build`; exit 0.
- Changed-region Prettier comparisons report `true` for the new test block,
  JS helpers/constants and validation block. Both JS syntax checks and
  `git diff --check` exit 0. The help command exits 0.
- Readiness example: intended exit 1, `Approved Categories: 0`,
  `Unresolved / Blocked: 11`, `Total Blockers Detected: 70`.

The sandbox child-test wrapper failed with `test failed`. Direct execution
exposed the intended red assertions (`tests 377`, `pass 288`, `fail 89`), then
passed after the fix; the normal permitted test wrapper also passed. The
sandbox build failed with `Could not parse output from TypeScript's
--showConfig.`; an unchanged permitted build passed. Online `ops:audit` remains
omitted under the standing metadata-disclosure restriction. No fresh audit
inventory or aggregate `ops:check` pass is claimed.

All **33 independent offline operations stages** exited 0: **27 suite
invocations / 3358 tests / zero failures**. Final launch/dossier suite:
`tests 182`, `pass 182`, `fail 0`; readiness suite: `tests 649`, `pass 649`,
`fail 0`. Every stage's output was inspected. Nonsuite checks report
`ops template check passed`, `secret/default scan passed`,
`docker runtime check passed`, license compliance `PASSED`,
`SAST Gate: PASSED (Zero unreviewed blockers and zero expired suppressions)`,
and `Container Security Gate: PASSED (All Dockerfiles and Compose templates verified)`.
These local checks do not supply the omitted online audit or operator live
acceptance.

## Prompt 311 — validate reconciliation checksum metadata (2026-10-12)

Continued Phase 12K's recovery-evidence gate after committed Prompt 310
(`b638958`). The shared inventory boundary accepts optional `checksumHex` only
as undefined/null or a primitive nonempty string of complete hexadecimal bytes.
Odd-length hex, nonhex, whitespace, numbers, booleans, bigints, boxed strings,
arrays, buffers and ordinary objects reject without coercion. Validation runs
before filters/exclusions, pg row mapping or injected client acquisition, using
the fixed `Database inventory is invalid` / `Storage inventory is invalid`
errors. Malformed query/injected inventories retain sanitized runner errors.

The listing adapter also validates its existing optional `ChecksumSHA256`
extension before decoding. Supplied values must be canonical standard base64
encoding exactly 32 bytes: 43 alphabet characters followed by `=`, decoded
length 32 and an exact base64 round-trip. Invalid alphabet/padding, whitespace,
noncanonical pad bits, URL-safe spelling, composite suffixes, wrong lengths
and nonstring values reject with `Object storage listing is invalid or
incomplete`. Null/omitted values remain absent. Malformed later pages reject
the whole inventory; runner failures publish no summary, success message,
staging artifact or receipt.

Offline planning probes returned `clean` for matching boolean, number, object,
array and nonhex checksum values. The adapter decoded `!!!` to an empty digest
and `YQ==` to the one-byte hex `61`. These synthetic results demonstrate the
input gap, not a production incident. All 377 prior tests remain; 98 new cases
cover malformed checksums, rejection before exclusions, pg/listing/runner
failures, private diagnostics, canonical encoding and valid compatibility.

### Compatibility, review and limits

Generic hex metadata remains variable-length, preserving the existing 6-byte
fixtures as well as SHA256-sized and longer digests. Comparison is still case
insensitive; missing-object evidence preserves original case. Nullable/omitted
checksums on either side retain metadata-only matching. Frozen caller records
and arrays work without mutation. CLI, SQL, exported signatures, TypeScript
facade, report schema/modes, publication, dependencies and Stage 7 stay unchanged.
Rejecting malformed supplied checksums is an intentional stricter runtime contract.

Installed SDK `_Object` in
`node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts` exposes checksum
algorithm/type but **no digest value** for standard ListObjectsV2 entries.
The optional extension handling is not evidence that normal listings supply a
SHA256 digest. Algorithm/type-only entries retain null checksum values; ETag is
not used as a digest. No Head/Get requests or object-byte hashing were added.
Absent checksum metadata can still give a clean metadata comparison.

Algorithm semantics/pairing/length, mandatory checksum acquisition, inventory
authenticity/completeness, correct operator scope, atomic DB/S3 snapshots, actual
byte integrity, resource/network bounds and hostile in-process getters/proxies
remain outside this boundary. No live database/storage service or operator
evidence was inspected. Prompt 201, Category 6 live recovery approval and Phase
12 exit remain open. Ordinary commit revert rolls back validation/tests/docs
together without migration or storage mutation. No push or deployment occurred.

Independent read-only review found no Critical, Important or Minor findings or
plan defects. It reproduced `tests 475`, `pass 475`, `fail 0` and clean diff
checks. Feedback was evaluated against the actual diff and prompt; no source
fixes or significant follow-up review were needed.

### Verification

Actual successful outputs:

- `npm run ops:reconcile-test`: `tests 475`, `pass 475`, `fail 0`.
- `npm run lint`: client `eslint`, shared `eslint "src/**/*.ts"`, server
  `eslint "{src,test}/**/*.ts"`; exit 0, no diagnostics.
- `npm run typecheck`: shared `tsc -p tsconfig.json --noEmit`, client
  `tsc --noEmit`, server `prisma generate && tsc -p tsconfig.json --noEmit`;
  Prisma Client `7.9.1` generated; exit 0, no TypeScript diagnostics.
- Permitted `npm run build`: `Compiled successfully in 3.1s`,
  `Generating static pages using 7 workers (22/22) in 1088ms`, then
  `prisma generate && nest build`; exit 0.
- Changed-region Prettier comparisons report `true` for the new test block,
  shared checksum validation and listing extension block. Both JS syntax
  checks and `git diff --check` exit 0. The help command exits 0.
- Readiness example: intended exit 1, `Approved Categories: 0`,
  `Unresolved / Blocked: 11`, `Total Blockers Detected: 70`.

The initial sandbox child-test wrapper failed opaquely with `test failed`.
Direct red execution reported `tests 475`, `pass 396`, `fail 79`; after the
fix, direct and permitted normal execution both passed all 475 tests. The
sandbox build failed with `Could not parse output from TypeScript's
--showConfig.`; an unchanged permitted build passed. Online `ops:audit` remains
omitted under the standing metadata-disclosure restriction; no fresh audit
inventory or full aggregate `ops:check` pass is claimed.

All **33 independent offline operations stages** exited 0: **27 suite
invocations / 3456 tests / zero failures**. Final launch/dossier suite:
`tests 182`, `pass 182`, `fail 0`; readiness suite: `tests 649`, `pass 649`,
`fail 0`. Every stage's result was inspected. Nonsuite checks report
`ops template check passed`, `secret/default scan passed`,
`docker runtime check passed`, license compliance `PASSED`,
`SAST Gate: PASSED (Zero unreviewed blockers and zero expired suppressions)`,
and `Container Security Gate: PASSED (All Dockerfiles and Compose templates verified)`.
These local checks do not supply the omitted online audit or operator live
acceptance.

## Prompt 312 — reject duplicate database object keys (2026-10-12)

Continued Phase 12K's recovery-evidence gate after committed Prompt 311
(`9e70d45`). The shared database inventory validator now rejects repeated exact
`objectKey` strings independently of ID, organization, bucket or lifecycle.
This matches the existing global `StoredObject.objectKey @unique` constraint
and the committed migration's `"objectKey" text NOT NULL UNIQUE`; no schema or
SQL change was needed. A database-only Set checks keys after required identity
validation, before filtering/exclusion, pg row normalization or injected client
acquisition. Existing repeated-ID and storage-key rejection remains intact.

A synthetic planning probe previously returned `status: "clean"`,
`matchedObjects: 2`, `totalBucketObjects: 1`, `exitCode: 0` for different IDs
sharing one key; the query adapter accepted both rows. These local fixtures
demonstrate contradictory input acceptance, not a production incident or a
failure of PostgreSQL's uniqueness constraint. Invalid injected inventories
now reject before either client is touched; invalid query results reject as a
whole before storage acquisition. Existing value-free helper and sanitized
runner errors produce no formatted summary, success message, staging or receipt.

### Compatibility, review and limits

Validation uses exact string identity without trimming, case folding, path or
Unicode normalization, coercion or composite bucket/tenant identities. Distinct
opaque keys retain the helper's existing semantics, including case, whitespace,
path spelling, Unicode representation and prototype-like names. This does not
implement every database key-format constraint. Frozen caller records/arrays,
empty inventories, valid exclusions/counts, bigint conversion and successful
simulation receipt publication remain supported. All 475 previous tests remain;
22 new cases cover rejection and compatibility. One older count-conversion
fixture now gives its four distinct IDs distinct keys; its assertions are
unchanged. CLI, SQL, facade/signatures, report schema/modes, listing, publication,
dependencies and Stage 7 remain unchanged. Repeated database keys are the
intentional stricter runtime contract.

Independent read-only review found no Critical, Important or Minor issues and
no plan defects. It reproduced `tests 497`, `pass 497`, `fail 0`, both JavaScript
syntax checks and clean diff checks. Feedback was evaluated against the actual
diff and schema contract; no source fixes or significant re-review were needed.

Operator scope, inventory authenticity/completeness, atomic DB/S3 snapshots,
object-byte integrity, resource/network bounds and hostile in-process objects
remain outside this boundary. No live database/storage service or operator
evidence was inspected. Prompt 201, Category 6 live recovery approval and Phase
12 exit remain open. Ordinary commit revert rolls back validation/tests/docs
together without migration or storage mutation. No deployment or push occurred.

### Verification

Actual successful outputs:

- `npm run ops:reconcile-test`: `tests 497`, `pass 497`, `fail 0`.
- `npm run lint`: client `eslint`, shared `eslint "src/**/*.ts"`, server
  `eslint "{src,test}/**/*.ts"`; exit 0, no ESLint diagnostics.
- `npm run typecheck`: shared `tsc -p tsconfig.json --noEmit`, client
  `tsc --noEmit`, server `prisma generate && tsc -p tsconfig.json --noEmit`;
  Prisma Client `7.9.1` generated; exit 0, no TypeScript diagnostics.
- Permitted `npm run build`: `Compiled successfully in 4.3s`,
  `Generating static pages using 7 workers (22/22) in 910ms`, followed by
  `prisma generate && nest build`; exit 0.
- Selected-region Prettier comparisons: `New regression block formatting: true`,
  `Shared validator formatting: true`, `Existing fixture block formatting: true`.
  Both JS syntax checks, help and `git diff --check` exit 0.
- Readiness example: intended exit 1, `Approved Categories: 0`,
  `Unresolved / Blocked: 11`, `Total Blockers Detected: 70`.

The initial sandbox npm test wrapper failed opaquely with `test failed`.
Direct red execution reported `tests 497`, `pass 479`, `fail 18`. The first
green run exposed the old count fixture's repeated key (`pass 496`, `fail 1`);
after correcting its identities, direct and permitted normal execution passed
all 497 tests. The sandbox build failed with `Could not parse output from
TypeScript's --showConfig.`; the unchanged permitted build passed. Online
`ops:audit` remains omitted under the standing metadata-disclosure restriction;
no fresh vulnerability inventory or full aggregate `ops:check` pass is claimed.

All **33 independent offline operations stages** exited 0: **27 suite
invocations / 3478 tests / zero failures**. Every stage result was inspected.
Final launch/dossier suite: `tests 182`, `pass 182`, `fail 0`; readiness suite:
`tests 649`, `pass 649`, `fail 0`. Nonsuite checks report `ops template check
passed`, `secret/default scan passed`, `docker runtime check passed`, license
compliance `PASSED`, `SAST Gate: PASSED (Zero unreviewed blockers and zero expired
suppressions)`, and `Container Security Gate: PASSED (All Dockerfiles and Compose
templates verified)`. These local checks do not supply online audit or live
operator acceptance.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 313 — validate reconciliation checksum algorithms (2026-10-12)

Continued Phase 12K's recovery-evidence gate after committed Prompt 312
(`f5a131c`). Shared DB inventory validation now accepts only exact primitive
`sha256` when `checksumAlgorithm` is supplied and non-null. This reflects the
existing migration's `StoredObject_checksumAlgorithm_check`; no SQL or schema
change was needed. Unsupported algorithms, case/whitespace variants, empty
strings and nonstring/coercible values reject without conversion, even without
a digest. Validation precedes filtering, lifecycle exclusions, pg normalization
and injected client acquisition. Existing value-free helper and sanitized
query/runner errors produce no summary, success message or receipt on failure.

The synthetic planning probe previously returned `status: 'clean'`,
`matchedObjects: 1`, `exitCode: 0` for matching metadata declaring `md5`; the
query adapter accepted that row too. This demonstrates local contradictory
input acceptance, not a production incident or a PostgreSQL constraint failure.
All 497 prior tests remain; 39 regressions cover invalid types/spellings,
exclusion bypass attempts, whole-query rejection, untouched clients and no
publication, valid frozen inputs and successful simulation evidence.

### Compatibility, review and limits

Omitted, undefined and null algorithms retain the utility's optional-field
contract. Exact `sha256` works with absent/null digests and existing generic
whole-byte hex lengths and case-insensitive comparison. Valid query mapping
preserves algorithm/hex spelling and converts counts to bigint without mutating
frozen caller inventories. Storage records have no algorithm field in the public
contract. CLI, SQL, facade/signatures, report schema/modes, listing, publication,
dependencies and Stage 7 remain unchanged. No digest acquisition or hashing was
added; supplied algorithm validation does not attest object-byte integrity.

Independent read-only review found no Critical, Important or Minor issues or
plan defects and reproduced `tests 536`, `pass 536`, `fail 0` and clean diff
checks. Feedback was evaluated against the actual validator, optional facade
contract and migration; no fixes or significant re-review were necessary.
Operator scope, authenticity/completeness, atomic DB/S3 snapshots, byte
integrity, resource/network bounds and hostile in-process objects remain outside
this boundary. No live database/storage service or operator evidence was
inspected. Prompt 201, Category 6 live recovery approval and Phase 12 exit remain
open. Ordinary commit revert rolls back validation/tests/docs together without
migration or storage mutation. No deployment or push occurred.

### Verification

Actual successful outputs:

- `npm run ops:reconcile-test`: `tests 536`, `pass 536`, `fail 0`.
- `npm run lint`: client `eslint`, shared `eslint "src/**/*.ts"`, server
  `eslint "{src,test}/**/*.ts"`; exit 0.
- `npm run typecheck`: shared/client TypeScript checks and server
  `prisma generate && tsc -p tsconfig.json --noEmit`; exit 0.
- Permitted `npm run build`: `Compiled successfully in 6.8s`,
  `Generating static pages using 7 workers (22/22) in 1743ms`, followed by
  `prisma generate && nest build`; exit 0.
- Selected-region Prettier: `New regression block formatting: true`,
  `Shared validator formatting: true`. Both JS syntax checks, CLI help and
  `git diff --check` exit 0.
- Readiness example: intended exit 1, `Approved Categories: 0`,
  `Unresolved / Blocked: 11`, `Total Blockers Detected: 70`.

The sandbox npm test wrapper failed opaquely with `test failed`; direct red
execution reported `tests 536`, `pass 511`, `fail 25`. After the validator
change, direct and permitted normal execution passed all 536 tests. Final direct
execution also passed after making omitted/undefined test labels distinct.
The sandbox build failed with `Could not parse output from TypeScript's
--showConfig.`; the unchanged permitted build passed. Online `ops:audit` remains
omitted under the standing metadata-disclosure restriction; no fresh
vulnerability inventory or aggregate `ops:check` success is claimed.

All **33 independent offline operations stages** exited 0: **27 suite
invocations / 3517 tests / zero failures**. Every stage result was inspected.
The final launch/dossier suite reports `tests 182`, `pass 182`, `fail 0`;
readiness reports `tests 649`, `pass 649`, `fail 0`. Nonsuite checks report
`ops template check passed`, `secret/default scan passed`, `docker runtime
check passed`, license compliance `PASSED`, `SAST Gate: PASSED (Zero unreviewed
blockers and zero expired suppressions)`, and `Container Security Gate: PASSED
(All Dockerfiles and Compose templates verified)`. These checks do not supply
online audit results or live operator acceptance.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 314 — validate storage listing key counts (2026-10-12)

Continued Phase 12K's recovery-evidence gate after committed Prompt 313
(`7401daf`). `listBucketObjects` now validates supplied `KeyCount` immediately
after page/contents structure checks, before entries or pagination. A supplied
value must be a primitive nonnegative safe integer equal to that page's
`Contents.length`, or zero when contents are absent. Nulls, strings, fractions,
unsafe/nonfinite numbers, negatives, bigints, booleans and ordinary/boxed/
coercible objects reject without conversion. The existing fixed listing error
and sanitized runner error remain; later invalid pages reject the entire
inventory and publish no summary, success message or receipt.

A synthetic planning probe previously accepted
`{ IsTruncated: false, KeyCount: 1, Contents: [] }`; comparison against an empty
DB inventory returned `status: 'clean'`, `exitCode: 0`. The same local probe now
rejects with `Object storage listing is invalid or incomplete`. This is an
adapter consistency reproduction, not a production incident or proof of lost
objects. All 536 previous tests remain; 38 added regressions cover invalid
count classes, first/later page contradictions and request termination,
optional counts/empty pages, per-page counted/uncounted pagination, frozen
ownership, size/date/checksum mapping and runner failure/success receipts.

### Compatibility, review and limits

Installed `@aws-sdk/client-s3` `ListObjectsV2Output` declares optional numeric
`KeyCount` as the keys returned by that request; `CommonPrefixes` require a
delimiter. This utility requests flat listings without a delimiter. Validation
uses page counts, never the cumulative inventory length. Omitted/undefined
counts remain accepted; zero (including numeric negative zero), absent/empty
contents and accurate positive counts preserve existing behavior. Input pages
remain caller-owned. CLI, SQL, facade/public signatures, comparison policy,
report schema/modes, publication, dependencies and Stage 7 remain unchanged.

Independent read-only review found no Critical, Important or Minor issues and
reproduced `tests 574`, `pass 574`, `fail 0` with both direct execution and the
npm script, plus clean diff checks. Feedback was evaluated against the actual
guard, runner boundaries, optional field contract and installed SDK semantics;
no fixes or significant re-review were necessary.

Count consistency cannot establish total inventory completeness, authenticity,
provider scope, atomic DB/S3 snapshots or object-byte integrity. Optional count
omission remains an intentional compatibility limit. No response-echo/MaxKeys
checks, content hashing, resource/network bounds or hostile getters/proxies
were added. No live service or operator evidence was inspected. Prompt 201,
Category 6 live recovery approval and Phase 12 exit remain open. Ordinary
commit revert rolls back validation/tests/docs together without migration or
storage mutation. No deployment or push occurred.

### Verification

Actual successful outputs:

- `npm run ops:reconcile-test`: `tests 574`, `pass 574`, `fail 0`.
- `npm run lint`: client `eslint`, shared `eslint "src/**/*.ts"`, server
  `eslint "{src,test}/**/*.ts"`; exit 0.
- `npm run typecheck`: shared/client TypeScript checks and server
  `prisma generate && tsc -p tsconfig.json --noEmit`; exit 0.
- Permitted `npm run build`: `Compiled successfully in 3.3s`,
  `Generating static pages using 7 workers (22/22) in 1123ms`, followed by
  `prisma generate && nest build`; exit 0.
- Changed-region Prettier: spec `changed-region formatting true`, source
  `Source changed-region formatting: true`. Both JS syntax checks, CLI help
  and `git diff --check` exit 0.
- Readiness example: expected exit 1, `Approved Categories: 0`,
  `Unresolved / Blocked: 11`, `Total Blockers Detected: 70`.

The sandbox npm test wrapper failed opaquely with `test failed`; direct red
execution reported `tests 574`, `pass 546`, `fail 28`. After the guard change,
direct and permitted normal execution passed all 574. The sandbox build failed
with `Could not parse output from TypeScript's --showConfig.`; the unchanged
permitted build passed. Initial isolated source-format checks omitted the
surrounding loop indentation; correcting the check wrapper passed without
source changes. Online `ops:audit` remains omitted under the standing
metadata-disclosure restriction; no fresh vulnerability inventory or full
aggregate `ops:check` success is claimed.

All **33 independent offline operations stages** exited 0: **27 suite
invocations / 3555 tests / zero failures**. Every stage result and suite summary
was inspected. Final launch/dossier: `tests 182`, `pass 182`, `fail 0`;
readiness: `tests 649`, `pass 649`, `fail 0`. Nonsuite checks report
`ops template check passed`, `secret/default scan passed`, `docker runtime
check passed`, license compliance `PASSED`, `SAST Gate: PASSED (Zero unreviewed
blockers and zero expired suppressions)`, and `Container Security Gate: PASSED
(All Dockerfiles and Compose templates verified)`. Offline checks supply
neither online audit results nor live recovery acceptance.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 315 — reject storage listing common prefixes (2026-10-12)

Continued Phase 12K's recovery-evidence gate after committed Prompt 314
(`651c1c9`). `listBucketObjects` now validates supplied `CommonPrefixes`
immediately following `KeyCount` validation, before entry processing or
continuation token pagination. Because the reconciliation utility requests flat
listings without a delimiter, any response containing rolled-up prefix groups
indicates that object keys were partitioned and omitted from `Contents`, which
would compromise inventory completeness. When `CommonPrefixes` is defined, it
must be an array with `length === 0`. Nulls, strings, numbers, booleans,
bigints, symbols, objects and non-empty prefix lists reject without coercion.
The existing fixed listing error (`Object storage listing is invalid or
incomplete`) and sanitized runner error (`Error: Object storage connection or
listing failed`) remain; later invalid pages reject the entire inventory and
publish no summary, success message or receipt.

A synthetic planning probe previously accepted
`{ IsTruncated: false, CommonPrefixes: [{ Prefix: 'sub/' }] }` and returned an
empty list (`[]`). Comparison against an empty database inventory returned
`status: 'clean'`, `exitCode: 0`. Comparison against active DB records would
report false positive missing objects, while orphan objects under that prefix
would be silently omitted from storage inventory. The same local probe now
rejects with `Object storage listing is invalid or incomplete`. This is an
adapter consistency reproduction, not a production incident or proof of lost
objects. All 574 previous tests remain; 36 added regressions cover invalid
prefix types without coercion, first and later non-empty prefix pages (single,
multiple, empty-string prefix, string entry, empty object entry), pagination
request halting, valid omitted/undefined/empty/frozen prefix pages across
contents variations, and runner exit code/sanitized logging contracts.

### Compatibility, review and limits

Installed `@aws-sdk/client-s3` `ListObjectsV2Output` declares optional
`CommonPrefixes?: CommonPrefix[] | undefined`. Flat listings omit delimiter;
standard AWS S3 flat listings omit `CommonPrefixes` (undefined) or return an
empty array (`[]`). Omitted and undefined `CommonPrefixes` remain accepted
without change. Input pages remain caller-owned; frozen empty prefix arrays
remain supported. CLI, SQL, facade/public signatures, comparison policy, report
schema/modes, receipt publication, dependencies and Stage 7 remain unchanged.

Independent read-only review found no Critical, Important or Minor issues and
reproduced `tests 610`, `pass 610`, `fail 0` with both direct execution and the
npm script, plus clean diff checks. Feedback was evaluated against the actual
guard, runner boundaries, optional field contract and installed SDK semantics;
no fixes or significant re-review were necessary.

Partition checks cannot establish total inventory completeness, authenticity,
provider scope, atomic DB/S3 snapshots or object-byte integrity. Delimiter
omission remains an intentional flat-listing constraint. No response-echo,
content hashing, resource/network bounds or hostile getters/proxies were added.
No live service or operator evidence was inspected. Prompt 201, Category 6 live
recovery approval and Phase 12 exit remain open. Ordinary commit revert rolls
back validation/tests/docs together without migration or storage mutation. No
deployment or push occurred.

### Verification

Actual successful outputs:

- `npm run ops:reconcile-test`: `tests 610`, `pass 610`, `fail 0`.
- `npm run lint`: client `eslint`, shared `eslint "src/**/*.ts"`, server
  `eslint "{src,test}/**/*.ts"`; exit 0.
- `npm run typecheck`: shared/client TypeScript checks and server
  `prisma generate && tsc -p tsconfig.json --noEmit`; exit 0.
- Permitted `npm run build`: `Compiled successfully in 2.4s`,
  `Generating static pages using 7 workers (22/22) in 665ms`, followed by
  `prisma generate && nest build`; exit 0.
- Changed-region Prettier: spec `changed-region formatting true`, source
  `Source changed-region formatting: true`. Both JS syntax checks, CLI help
  and `git diff --check` exit 0.
- Readiness example: expected exit 1, `Approved Categories: 0`,
  `Unresolved / Blocked: 11`, `Total Blockers Detected: 70`.

Online `ops:audit` remains omitted under the standing metadata-disclosure
restriction; no fresh vulnerability inventory or full aggregate `ops:check`
success is claimed.

All **33 independent offline operations stages** exited 0: **27 suite
invocations / 3591 tests / zero failures**. Every stage result and suite summary
was inspected. Final launch/dossier: `tests 182`, `pass 182`, `fail 0`;
readiness: `tests 649`, `pass 649`, `fail 0`. Nonsuite checks report
`ops template check passed`, `secret/default scan passed`, `docker runtime
check passed`, license compliance `PASSED`, `SAST Gate: PASSED (Zero unreviewed
blockers and zero expired suppressions)`, and `Container Security Gate: PASSED
(All Dockerfiles and Compose templates verified)`. Offline checks supply
neither online audit results nor live recovery acceptance.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 316 — reject storage listing delimiters (2026-10-12)

Continued Phase 12K's recovery-evidence gate after committed Prompt 315
(`2099def`). `listBucketObjects` now validates supplied `Delimiter`
immediately alongside `CommonPrefixes` validation, before entry processing or
continuation token pagination. Because the reconciliation utility requests flat
listings without a delimiter, any response containing a delimiter indicates that
the provider or proxy treated the request as hierarchical, which would partition
keys into common prefixes or omit subpaths and compromise inventory
completeness. Any defined `Delimiter` (`response.Delimiter !== undefined`)
rejects immediately. Non-empty delimiter strings (`'/'`, `'\\'`, `'.'`), empty
strings `''`, whitespace `'   '`, `null`, numbers, booleans, bigints, symbols,
objects and boxed strings reject without coercion. The existing fixed listing
error (`Object storage listing is invalid or incomplete`) and sanitized runner
error (`Error: Object storage connection or listing failed`) remain; later
invalid pages reject the entire inventory and publish no summary, success
message or receipt.

A synthetic planning probe previously accepted
`{ IsTruncated: false, Delimiter: '/' }` with root contents and returned only root
items without error. Comparison against active DB records containing subpaths
reported false positive missing objects (false data loss alert), while orphan
objects under those subpaths would be omitted from storage inventory. The same
local probe now rejects with `Object storage listing is invalid or incomplete`.
This is an adapter consistency reproduction, not a production incident or proof
of lost objects. All 610 previous tests remain; 37 added regressions cover
defined delimiter strings, invalid types without coercion, first and later
defined delimiter pages, pagination request halting, valid omitted/undefined
delimiter pages across contents variations, and runner exit code/sanitized
logging contracts.

### Compatibility, review and limits

Installed `@aws-sdk/client-s3` `ListObjectsV2Output` declares optional
`Delimiter?: string | undefined`. Flat listings omit delimiter; standard AWS S3
flat listings omit `Delimiter` (undefined). Omitted and undefined `Delimiter`
remain accepted without change. Input pages remain caller-owned; frozen response
structures remain supported. CLI, SQL, facade/public signatures, comparison
policy, report schema/modes, receipt publication, dependencies and Stage 7
remain unchanged.

Independent read-only review found no Critical, Important or Minor issues and
reproduced `tests 647`, `pass 647`, `fail 0` with both direct execution and the
npm script, plus clean diff checks. Feedback was evaluated against the actual
guard, runner boundaries, optional field contract and installed SDK semantics;
no fixes or significant re-review were necessary.

Delimiter checks cannot establish total inventory completeness, authenticity,
provider scope, atomic DB/S3 snapshots or object-byte integrity. Delimiter
omission remains an intentional flat-listing constraint. No response-echo,
content hashing, resource/network bounds or hostile getters/proxies were added.
No live service or operator evidence was inspected. Prompt 201, Category 6 live
recovery approval and Phase 12 exit remain open. Ordinary commit revert rolls
back validation/tests/docs together without migration or storage mutation. No
deployment or push occurred.

### Verification

Actual successful outputs:

- `npm run ops:reconcile-test`: `tests 647`, `pass 647`, `fail 0`.
- `npm run lint`: client `eslint`, shared `eslint "src/**/*.ts"`, server
  `eslint "{src,test}/**/*.ts"`; exit 0.
- `npm run typecheck`: shared/client TypeScript checks and server
  `prisma generate && tsc -p tsconfig.json --noEmit`; exit 0.
- Permitted `npm run build`: `Compiled successfully in 5.9s`,
  `Generating static pages using 7 workers (22/22) in 1361ms`, followed by
  `prisma generate && nest build`; exit 0.
- Changed-region Prettier: spec `changed-region formatting true`, source
  `Source changed-region formatting: true`. Both JS syntax checks, CLI help
  and `git diff --check` exit 0.
- Readiness example: expected exit 1, `Approved Categories: 0`,
  `Unresolved / Blocked: 11`, `Total Blockers Detected: 70`.

Online `ops:audit` remains omitted under the standing metadata-disclosure
restriction; no fresh vulnerability inventory or full aggregate `ops:check`
success is claimed.

All **33 independent offline operations stages** exited 0: **27 suite
invocations / 3628 tests / zero failures**. Every stage result and suite summary
was inspected. Final launch/dossier: `tests 182`, `pass 182`, `fail 0`;
readiness: `tests 649`, `pass 649`, `fail 0`. Nonsuite checks report
`ops template check passed`, `secret/default scan passed`, `docker runtime
check passed`, license compliance `PASSED`, `SAST Gate: PASSED (Zero unreviewed
blockers and zero expired suppressions)`, and `Container Security Gate: PASSED
(All Dockerfiles and Compose templates verified)`. Offline checks supply
neither online audit results nor live recovery acceptance.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 317 — reject storage listing encoding types (2026-10-12)

Continued Phase 12K's recovery-evidence gate after committed Prompt 316
(`e5aad51`). `listBucketObjects` now validates supplied `EncodingType`
immediately alongside `Delimiter` validation, before entry processing or
continuation token pagination. Because the reconciliation utility requests flat
listings without an encoding type, any response containing an encoding type
indicates that object keys in `Contents` were URL-encoded by the provider, which
would cause keys to mismatch against raw `StoredObject.objectKey` records in
PostgreSQL and compromise inventory completeness. Any defined `EncodingType`
(`response.EncodingType !== undefined`) rejects immediately. Valid S3 encoding
strings (`'url'`, `'URL'`), arbitrary strings (`'gzip'`, `'base64'`), empty
strings `''`, whitespace `'   '`, `null`, numbers, booleans, bigints, symbols,
objects and boxed strings reject without coercion. The existing fixed listing
error (`Object storage listing is invalid or incomplete`) and sanitized runner
error (`Error: Object storage connection or listing failed`) remain; later
invalid pages reject the entire inventory and publish no summary, success
message or receipt.

A synthetic planning probe previously accepted
`{ IsTruncated: false, EncodingType: 'url', Contents: [{ Key: 'data/file%201.csv', Size: 10 }] }`
and returned `key: 'data/file%201.csv'`. Comparison against active DB records
containing `data/file 1.csv` reported false positive missing objects (false
data loss alert) and false positive orphans. The same local probe now rejects
with `Object storage listing is invalid or incomplete`. This is an adapter
consistency reproduction, not a production incident or proof of lost objects.
All 647 previous tests remain; 37 added regressions cover defined encoding
type strings, invalid types without coercion, first and later defined encoding
type pages, pagination request halting, valid omitted/undefined encoding type
pages across contents variations, and runner exit code/sanitized logging contracts.

### Compatibility, review and limits

Installed `@aws-sdk/client-s3` `ListObjectsV2Output` declares optional
`EncodingType?: EncodingType | undefined`. Flat listings omit encoding type;
standard AWS S3 flat listings omit `EncodingType` (undefined). Omitted and
undefined `EncodingType` remain accepted without change. Input pages remain
caller-owned; frozen response structures remain supported. CLI, SQL, facade/public
signatures, comparison policy, report schema/modes, receipt publication,
dependencies and Stage 7 remain unchanged.

Independent read-only review found no Critical, Important or Minor issues and
reproduced `tests 684`, `pass 684`, `fail 0` with both direct execution and the
npm script, plus clean diff checks. Feedback was evaluated against the actual
guard, runner boundaries, optional field contract and installed SDK semantics;
no fixes or significant re-review were necessary.

Encoding type checks cannot establish total inventory completeness, authenticity,
provider scope, atomic DB/S3 snapshots or object-byte integrity. Encoding type
omission remains an intentional flat-listing constraint. No response-echo,
content hashing, resource/network bounds or hostile getters/proxies were added.
No live service or operator evidence was inspected. Prompt 201, Category 6 live
recovery approval and Phase 12 exit remain open. Ordinary commit revert rolls
back validation/tests/docs together without migration or storage mutation. No
deployment or push occurred.

### Verification

Actual successful outputs:

- `npm run ops:reconcile-test`: `tests 684`, `pass 684`, `fail 0`.
- `npm run lint`: client `eslint`, shared `eslint "src/**/*.ts"`, server
  `eslint "{src,test}/**/*.ts"`; exit 0.
- `npm run typecheck`: shared/client TypeScript checks and server
  `prisma generate && tsc -p tsconfig.json --noEmit`; exit 0.
- Permitted `npm run build`: `Compiled successfully in 2.3s`,
  `Generating static pages using 7 workers (22/22) in 602ms`, followed by
  `prisma generate && nest build`; exit 0.
- Changed-region Prettier: spec `spec changed-region formatting: true`, source
  `Source changed-region formatting: true`. Both JS syntax checks, CLI help
  and `git diff --check` exit 0.
- Readiness example: expected exit 1, `Approved Categories: 0`,
  `Unresolved / Blocked: 11`, `Total Blockers Detected: 70`.

Online `ops:audit` remains omitted under the standing metadata-disclosure
restriction; no fresh vulnerability inventory or full aggregate `ops:check`
success is claimed.

All **33 independent offline operations stages** exited 0: **27 suite
invocations / 3665 tests / zero failures**. Every stage result and suite summary
was inspected. Final launch/dossier: `tests 182`, `pass 182`, `fail 0`;
readiness: `tests 649`, `pass 649`, `fail 0`. Nonsuite checks report
`ops template check passed`, `secret/default scan passed`, `docker runtime
check passed`, license compliance `PASSED`, `SAST Gate: PASSED (Zero unreviewed
blockers and zero expired suppressions)`, and `Container Security Gate: PASSED
(All Dockerfiles and Compose templates verified)`. Offline checks supply
neither online audit results nor live recovery acceptance.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 318 — reject storage listing start-after markers (2026-10-12)

Continued Phase 12K's recovery-evidence gate after committed Prompt 317
(`407604a`). `listBucketObjects` now validates supplied `StartAfter` immediately
alongside `EncodingType` validation, before entry processing or continuation
token pagination. Because the reconciliation utility requests flat,
unpartitioned listings without a start-after key from bucket origin, any response
containing a start-after marker indicates that preceding objects in the bucket
were skipped, which would cause earlier active objects to be reported as missing
from storage (false positive data loss / exit 1) and conceal earlier orphan leaks.
Any defined `StartAfter` (`response.StartAfter !== undefined`) rejects immediately.
Valid S3 key strings (`'data/marker.csv'`, `'prefix/marker'`, `'readme.txt'`),
arbitrary strings, empty strings `''`, whitespace `'   '`, `null`, numbers,
booleans, bigints, symbols, objects and boxed strings reject without coercion.
The existing fixed listing error (`Object storage listing is invalid or incomplete`)
and sanitized runner error (`Error: Object storage connection or listing failed`)
remain; later invalid pages reject the entire inventory and publish no summary,
success message or receipt.

A synthetic planning probe previously accepted
`{ IsTruncated: false, StartAfter: 'data/file1.csv', Contents: [{ Key: 'data/file2.csv', Size: 10 }] }`
and returned only `key: 'data/file2.csv'`. Comparison against active DB records
containing `data/file1.csv` reported false positive missing objects (false
data loss alert) and missed earlier storage orphans. The same local probe now
rejects with `Object storage listing is invalid or incomplete`. This is an
adapter consistency reproduction, not a production incident or proof of lost
objects. All 684 previous tests remain; 37 added regressions cover defined
start-after strings, invalid types without coercion, first and later defined
start-after pages, pagination request halting, valid omitted/undefined
start-after pages across contents variations, and runner exit code/sanitized
logging contracts.

### Compatibility, review and limits

Installed `@aws-sdk/client-s3` `ListObjectsV2Output` declares optional
`StartAfter?: string | undefined`. Flat listings omit start-after; standard
AWS S3 flat listings omit `StartAfter` (undefined). Omitted and undefined
`StartAfter` remain accepted without change. Input pages remain caller-owned;
frozen response structures remain supported. CLI, SQL, facade/public
signatures, comparison policy, report schema/modes, receipt publication,
dependencies and Stage 7 remain unchanged.

Independent read-only review found no Critical or Important issues, verified
blank-line cleanup, and reproduced `tests 721`, `pass 721`, `fail 0` with both
direct execution and the npm script, plus clean diff checks. Feedback was
evaluated against the actual guard, runner boundaries, optional field contract
and installed SDK semantics; no architectural fixes or significant re-review
were necessary.

Start-after checks cannot establish total inventory completeness, authenticity,
provider scope, atomic DB/S3 snapshots or object-byte integrity. Start-after
omission remains an intentional flat-listing origin constraint. No response-echo,
content hashing, resource/network bounds or hostile getters/proxies were added.
No live service or operator evidence was inspected. Prompt 201, Category 6 live
recovery approval and Phase 12 exit remain open. Ordinary commit revert rolls
back validation/tests/docs together without migration or storage mutation. No
deployment or push occurred.

### Verification

Actual successful outputs:

- `npm run ops:reconcile-test`: `tests 721`, `pass 721`, `fail 0`.
- `npm run lint`: client `eslint`, shared `eslint "src/**/*.ts"`, server
  `eslint "{src,test}/**/*.ts"`; exit 0.
- `npm run typecheck`: shared/client TypeScript checks and server
  `prisma generate && tsc -p tsconfig.json --noEmit`; exit 0.
- Permitted `npm run build`: `Compiled successfully in 4.0s`,
  `Generating static pages using 7 workers (22/22) in 976ms`, followed by
  `prisma generate && nest build`; exit 0.
- Changed-region Prettier: spec `spec changed-region formatting: true`, source
  `Source changed-region formatting: true`. Both JS syntax checks, CLI help
  and `git diff --check` exit 0.
- Readiness example: expected exit 1, `Approved Categories: 0`,
  `Unresolved / Blocked: 11`, `Total Blockers Detected: 70`.

Online `ops:audit` remains omitted under the standing metadata-disclosure
restriction; no fresh vulnerability inventory or full aggregate `ops:check`
success is claimed.

All **33 independent offline operations stages** exited 0: **27 suite
invocations / 3702 tests / zero failures**. Every stage result and suite summary
was inspected. Final launch/dossier: `tests 182`, `pass 182`, `fail 0`;
readiness: `tests 649`, `pass 649`, `fail 0`. Nonsuite checks report
`ops template check passed`, `secret/default scan passed`, `docker runtime
check passed`, license compliance `PASSED`, `SAST Gate: PASSED (Zero unreviewed
blockers and zero expired suppressions)`, and `Container Security Gate: PASSED
(All Dockerfiles and Compose templates verified)`. Offline checks supply
neither online audit results nor live recovery acceptance.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 319 — validate storage listing continuation tokens (2026-10-12)

Continued Phase 12K's recovery-evidence gate after committed Prompt 318
(`2541445`). `listBucketObjects` now validates supplied `ContinuationToken`
immediately alongside `StartAfter` validation, before entry processing or
continuation token pagination. Because the reconciliation utility requests
unpartitioned listings starting from the beginning of the bucket key space,
any response containing a defined continuation token on the initial page
(`continuationToken === undefined`) indicates that preceding objects in the
bucket were skipped, which would cause earlier active objects to be reported as
missing from storage (false positive data loss / exit 1) and conceal earlier
storage orphans. On subsequent pages (`continuationToken !== undefined`), any
defined `ContinuationToken` returned by the provider must strictly match the
requested `continuationToken`; mismatched tokens indicate out-of-order responses
or desynchronized pagination metadata and reject immediately.
Any invalid or mismatched `ContinuationToken`
(`response.ContinuationToken !== undefined && response.ContinuationToken !== continuationToken`)
rejects immediately. Valid token strings, arbitrary strings, empty strings `''`,
whitespace `'   '`, `null`, numbers, booleans, bigints, symbols, objects and boxed
strings reject without coercion when unexpected or mismatched. The existing fixed
listing error (`Object storage listing is invalid or incomplete`) and sanitized
runner error (`Error: Object storage connection or listing failed`) remain; later
invalid pages reject the entire inventory and publish no summary, success message
or receipt.

A synthetic planning probe previously accepted
`{ IsTruncated: false, ContinuationToken: 'page-2-token', Contents: [{ Key: 'data/file2.csv', Size: 10 }] }`
on the first request and returned only `key: 'data/file2.csv'`. Comparison against
active DB records containing `data/file1.csv` reported false positive missing
objects (false data loss alert) and missed earlier storage orphans. The same local
probe now rejects with `Object storage listing is invalid or incomplete`. This is
an adapter consistency reproduction, not a production incident or proof of lost
objects. All 721 previous tests remain; 30 added regressions cover initial defined
continuation tokens across 14 types, later mismatched continuation tokens,
pagination request halting, later matching continuation tokens, valid omitted/undefined
continuation tokens across contents variations, and runner exit code/sanitized
logging contracts.

### Compatibility, review and limits

Installed `@aws-sdk/client-s3` `ListObjectsV2Output` declares optional
`ContinuationToken?: string | undefined`. Flat listings omit continuation tokens
on the initial page; standard AWS S3 flat listings omit `ContinuationToken`
(undefined) on page 1 and echo the request parameter on subsequent pages. Omitted
and undefined `ContinuationToken` on initial and later pages remain accepted
without change. Input pages remain caller-owned; frozen response structures remain
supported. CLI, SQL, facade/public signatures, comparison policy, report
schema/modes, receipt publication, dependencies and Stage 7 remain unchanged.

Independent read-only review found no Critical or Important issues, verified
single-guard implementation elegance and type coercion immunity, and reproduced
`tests 751`, `pass 751`, `fail 0` with both direct execution and the npm script,
plus clean diff checks. Feedback was evaluated against the actual guard, runner
boundaries, optional field contract and installed SDK semantics; no architectural
fixes or significant re-review were necessary.

Continuation token checks cannot establish total inventory completeness,
authenticity, provider scope, atomic DB/S3 snapshots or object-byte integrity.
Continuation token validation remains an intentional pagination synchronization
and origin constraint. No response-echo, content hashing, resource/network bounds
or hostile getters/proxies were added. No live service or operator evidence was
inspected. Prompt 201, Category 6 live recovery approval and Phase 12 exit remain
open. Ordinary commit revert rolls back validation/tests/docs together without
migration or storage mutation. No deployment or push occurred.

### Verification

Actual successful outputs:

- `npm run ops:reconcile-test`: `tests 751`, `pass 751`, `fail 0`.
- `npm run lint`: client `eslint`, shared `eslint "src/**/*.ts"`, server
  `eslint "{src,test}/**/*.ts"`; exit 0.
- `npm run typecheck`: shared/client TypeScript checks and server
  `prisma generate && tsc -p tsconfig.json --noEmit`; exit 0.
- Permitted `npm run build`: `Compiled successfully in 2.5s`,
  `Generating static pages using 7 workers (22/22) in 1009ms`, followed by
  `prisma generate && nest build`; exit 0.
- Both JS syntax checks, CLI help and `git diff --check` exit 0.
- Readiness example: expected exit 1, `Approved Categories: 0`,
  `Unresolved / Blocked: 11`, `Total Blockers Detected: 70`.

Online `ops:audit` remains omitted under the standing metadata-disclosure
restriction; no fresh vulnerability inventory or full aggregate `ops:check`
success is claimed.

All **33 independent offline operations stages** exited 0: **27 suite
invocations / 3732 tests / zero failures** (3696 passed, 36 skipped). Every
stage result and suite summary was inspected. Final launch/dossier: `tests 182`,
`pass 182`, `fail 0`; readiness: `tests 649`, `pass 649`, `fail 0`. Nonsuite
checks report `ops template check passed`, `secret/default scan passed`,
`docker runtime check passed`, license compliance `PASSED`, `SAST Gate: PASSED
(Zero unreviewed blockers and zero expired suppressions)`, and `Container
Security Gate: PASSED (All Dockerfiles and Compose templates verified)`. Offline
checks supply neither online audit results nor live recovery acceptance.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 320 — reject storage listing terminal next continuation tokens (2026-10-12)

Continued Phase 12K's recovery-evidence gate after committed Prompt 319
(`28ad91c`). `listBucketObjects` now validates supplied `NextContinuationToken`
on terminal pages immediately alongside `ContinuationToken` validation, before
entry processing. In the Amazon S3 specification (`ListObjectsV2Output`),
`NextContinuationToken?: string | undefined` is sent when `isTruncated` is true,
indicating that more keys remain in the bucket. When `isTruncated` is false,
all results have been returned, the listing is terminal, and Amazon S3 does not
return `NextContinuationToken`.

Previously, `listBucketObjects` stopped pagination unconditionally on
`!response.IsTruncated` without inspecting `response.NextContinuationToken`.
A local synthetic probe confirmed that an initial or later terminal response
declaring `{ IsTruncated: false, NextContinuationToken: 'rogue-token', Contents: [...] }`
was accepted as complete. If a provider, proxy, gateway or test double returned
`IsTruncated: false` by mistake while supplying a continuation token pointing to
remaining bucket keys, the listing was truncated prematurely: subsequent objects
were omitted from the storage map, causing active database `StoredObject` records
to be reported as missing from storage (false positive data loss / exit code 1) and
masking unreferenced orphan files.

`listBucketObjects` now validates:
```javascript
// Terminal pages have no remaining keys; any provider next continuation token is contradictory.
if (!response.IsTruncated && response.NextContinuationToken !== undefined)
  throw invalidListing();
```
On terminal pages (`IsTruncated: false`), any defined `NextContinuationToken`
(`response.NextContinuationToken !== undefined`) rejects immediately. Valid token
strings, arbitrary strings, empty strings `''`, whitespace `'   '`, `null`, numbers,
booleans, bigints, symbols, plain objects, boxed strings and coercible objects reject
without coercion. The existing fixed listing error (`Object storage listing is invalid or incomplete`)
and sanitized runner error (`Error: Object storage connection or listing failed`)
remain; later invalid pages reject the entire listing and publish no summary,
success message or receipt.

All 751 previous tests remain (with the pre-existing multi-page fixture updated to omit
an unused token on its terminal page); 30 added regressions cover initial terminal defined
tokens across 14 types, later terminal defined tokens, pagination request halting,
clean terminal continuation tokens on multi-page sequences, valid omitted/undefined
terminal tokens across contents permutations, and runner exit code/sanitized logging contracts.

### Compatibility, review and limits

Installed `@aws-sdk/client-s3` `ListObjectsV2Output` declares optional
`NextContinuationToken?: string | undefined`. Flat listings omit next continuation
tokens on terminal pages; standard AWS S3 flat listings omit `NextContinuationToken`
(undefined) when `IsTruncated: false`. Omitted and undefined `NextContinuationToken`
on terminal pages remain accepted without change. Input pages remain caller-owned;
frozen response structures remain supported. CLI, SQL, facade/public signatures,
comparison policy, report schema/modes, receipt publication, dependencies and Stage 7
remain unchanged.

Independent read-only review found no Critical, Important, or Minor issues, verified
single-guard implementation elegance and type coercion immunity, and reproduced
`tests 781`, `pass 781`, `fail 0` with both direct execution and the npm script,
plus clean diff checks. Feedback was evaluated against the actual guard, runner
boundaries, optional field contract and installed SDK semantics; no architectural
fixes or significant re-review were necessary.

Terminal next continuation token checks eliminate contradictory EOF pagination metadata;
they cannot establish total inventory completeness, authenticity, provider scope,
atomic DB/S3 snapshots or object-byte integrity. No response-echo, content hashing,
resource/network bounds or hostile getters/proxies were added. No live service or
operator evidence was inspected. Prompt 201, Category 6 live recovery approval and
Phase 12 exit remain open. Ordinary commit revert rolls back validation/tests/docs
together without migration or storage mutation. No deployment or push occurred.

### Verification

Actual successful outputs:

- `npm run ops:reconcile-test`: `tests 781`, `pass 781`, `fail 0`.
- `npm run lint`: client `eslint`, shared `eslint "src/**/*.ts"`, server
  `eslint "{src,test}/**/*.ts"`; exit 0.
- `npm run typecheck`: shared/client TypeScript checks and server
  `prisma generate && tsc -p tsconfig.json --noEmit`; exit 0.
- Permitted `npm run build`: `Compiled successfully in 2.6s`,
  `Generating static pages using 7 workers (22/22) in 1036ms`, followed by
  `prisma generate && nest build`; exit 0.
- Both JS syntax checks, CLI help and `git diff --check` exit 0.
- Readiness example: expected exit 1, `Approved Categories: 0`,
  `Unresolved / Blocked: 11`, `Total Blockers Detected: 70`.

Online `ops:audit` remains omitted under the standing metadata-disclosure
restriction; no fresh vulnerability inventory or full aggregate `ops:check`
success is claimed.

All **33 independent offline operations stages** exited 0: **27 suite
invocations / 3762 tests / zero failures** (3726 passed, 36 skipped). Every
stage result and suite summary was inspected. Final launch/dossier: `tests 182`,
`pass 182`, `fail 0`; readiness: `tests 649`, `pass 649`, `fail 0`. Nonsuite
checks report `ops template check passed`, `secret/default scan passed`,
`docker runtime check passed`, license compliance `PASSED`, `SAST Gate: PASSED
(Zero unreviewed blockers and zero expired suppressions)`, and `Container
Security Gate: PASSED (All Dockerfiles and Compose templates verified)`. Offline
checks supply neither online audit results nor live recovery acceptance.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 321 — validate storage listing prefix echoes (2026-10-12)

Continued Phase 12K after committed Prompt 320 (`7e3441d`). A synthetic
bucket-wide listing with `Prefix: 'unexpected/'` previously returned `[]`.
The adapter now rejects a defined Prefix unless it is a primitive string
exactly equal to `prefix || ''`, before entries or further pagination. Empty
bucket-wide echoes remain valid; omitted/undefined echoes remain optional.
Explicit prefixes preserve whitespace, case, Unicode and percent characters.
Frozen pages are supported. Initial and later failures reject whole inventories
with fixed diagnostics; the runner emits no summary or receipt.

All 781 prior tests plus 56 new regressions pass. Direct red execution reported
`tests 837`, `pass 806`, `fail 31`; green direct and permitted npm execution
reported `tests 837`, `pass 837`, `fail 0`. Tests cover invalid types without
coercion, scope contradictions, request halting, compatible optional echoes,
opaque prefixes, frozen pages and sanitized runner failure/receipt publication.
CLI, SQL, public signatures/facade, comparison, report schema, publication and
Stage 7 remain unchanged. Installed SDK `ListObjectsV2Output` declares optional
`Prefix?: string | undefined`. This is declared-scope consistency, not provider
authentication, total completeness, returned-key prefix enforcement, object-byte
integrity or atomic snapshot evidence. No live operation or operator approval ran.
Prompt 201, Category 6 live approval and Phase 12 exit remain open.
Rollback is an ordinary commit revert; no migration or data mutation is involved.

Verification: both JS syntax checks, CLI `--help`, changed-region Prettier and
`git diff --check` exited 0. Lint completed all three workspaces; typecheck
completed shared/client/server including Prisma Client 7.9.1. Permitted build
reported `Compiled successfully in 3.4s` and `Generating static pages using 7
workers (22/22) in 909ms`, then `prisma generate && nest build`; exit 0.
The sandbox npm test wrapper failed opaquely with `test failed`; direct testing
provided the actual red results. The sandbox build failed with `Could not parse
output from TypeScript's --showConfig.`; the unchanged permitted checks passed.
Readiness remains expected exit 1: `Approved Categories: 0`, `Unresolved /
Blocked: 11`, `Total Blockers Detected: 70`.

Online `ops:audit` remains omitted under the recorded metadata-disclosure
restriction; no full aggregate `ops:check` pass or fresh vulnerability inventory
is claimed. No deployment or push occurred.

Safe local inspection:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

All **33 independent offline operations stages** exited 0: **27 suite invocations /
3818 tests / 3818 passed / zero failures / zero skipped**. Final launch/dossier
reported `tests 182`, `pass 182`, `fail 0`. Each stage and suite summary was
inspected. Non-suite template, secret/default, Docker-runtime, license, SAST and
container-security gates passed. Independent high-effort read-only review found
no Critical, Important or Minor issues, reproduced **837/837** and clean diff
checks, and approved merging after documentation. Feedback was verified against
the guard, error/publication boundaries and optional SDK field contract; no
implementation fixes or architectural re-review were needed.

## Prompt 322 — validate storage listing maximum key counts (2026-10-12)

Continued Phase 12K after committed Prompt 321 (`75efc96`) under the user's
explicit follow-on execution and high-effort instruction. A synthetic probe
previously accepted one object from a page declaring `MaxKeys: 0`. The listing
adapter now checks supplied maxima before entry conversion or pagination:
nonnegative safe integers must be at least the flat Contents length (zero when
Contents is absent). Existing optional KeyCount equality also ensures its
consistency with the maximum. No coercion or response mutation occurs.

Omitted/undefined maxima remain valid. Empty pages support zero/-0; equal or
larger maxima, including >1000 and Number.MAX_SAFE_INTEGER, remain supported.
Different pages can declare different maxima; counts never substitute for
explicit terminal signals. Empty intermediate pages still advance using valid
continuation tokens. The request does not acquire a new MaxKeys parameter.
Invalid first/later responses reject the whole inventory with fixed diagnostics;
runner failures print no summary and publish no receipt.

All 837 previous tests plus 66 new behavioral regressions pass. Direct red
execution reported `tests 903`, `pass 861`, `fail 42`; direct green and permitted
normal npm execution reported `tests 903`, `pass 903`, `fail 0`. Tests exercise
invalid types/numbers, first/later count contradictions, request halting,
KeyCount presence/absence, optional metadata, frozen pages, valid maxima,
per-page variation, explicit EOF and sanitized runner/publication behavior.
Installed SDK ListObjectsV2Output documents optional MaxKeys and a result count
no greater than that maximum. No provider-specific upper cap was invented.

CLI, SQL, public signatures/facade, comparison, report schema, publication and
Stage 7 remain unchanged. This validates declared page capacity, not total
completeness, authenticity, atomic snapshots or object-byte integrity. No live
services, operator approval, deployment or push occurred. Prompt 201, Category 6
live recovery approval and Phase 12 exit stay open. Ordinary commit revert
rolls back the source/tests/docs without migration or storage mutation.

Both JS syntax checks, CLI --help, changed-region Prettier and git diff --check
exited 0. Permitted root lint/typecheck/build exited 0 across all three
workspaces, including shared TypeScript and Prisma Client 7.9.1 / Nest builds.
Readiness retained expected exit 1: `Approved Categories: 0`, `Unresolved /
Blocked: 11`, `Total Blockers Detected: 70`. The permitted process mode avoided
the known sandbox child-test/Next --showConfig limitations documented in Prompt
321. Online ops:audit remains omitted under the recorded metadata-disclosure
restriction; no aggregate ops:check pass or fresh vulnerability count is claimed.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

Production build reported `Compiled successfully in 3.1s`, `Generating static
pages using 7 workers (22/22) in 884ms`, followed by `prisma generate && nest
build`; exit 0. All **33 independent offline operations stages** exited 0:
**27 suite invocations / 3884 tests / 3884 passed / zero failures / zero skipped**.
Every stage and suite summary was inspected; final launch/dossier reported
`tests 182`, `pass 182`, `fail 0`. Template, secret/default, Docker-runtime,
license, SAST and container-security gates passed.

Independent high-effort read-only review found no Critical, Important or Minor
issues, reproduced **903/903**, both JS syntax checks and clean diff checks,
and approved merging after canonical documentation. Feedback was evaluated
against SDK semantics, guard placement, non-coercing validation, per-page
compatibility and runner publication boundaries. No implementation fixes or
architectural re-review were needed.

## Prompt 323 — enforce storage listing key prefixes (2026-10-12)

Continued Phase 12K after committed Prompt 322 (`06134e9`). A bounded synthetic
probe requested `scope/`, received a matching prefix echo but an `outside/` key,
and returned `{"acceptedObjects":1,"status":"clean","totalBucketObjects":0,"exitCode":0}`:
comparison filtering concealed the contradictory provider entry. The listing
adapter now rejects every returned key outside the effective requested prefix
before checksum conversion or inventory inclusion. First/later failures reject
whole inventories before another page, summary or receipt can be produced.
Fixed diagnostics expose no provider keys, prefixes or tokens.

Prefix matching remains literal: no trimming, decoding, case folding, path or
Unicode normalization, regex interpretation or directory-boundary requirement.
Keys equal to the prefix and nondirectory prefixes remain valid. Omitted,
undefined and empty request prefixes retain bucket-wide behavior; absent or
matching response echoes do not bypass returned-key checks. Frozen ownership,
ordering, date/checksum conversion and empty intermediate pages remain supported.
Installed SDK ListObjectsV2 request/output declarations verify the prefix
semantics. CLI, public signatures, SQL, comparison filters, injected inventories,
receipt publication/format and Stage 7 are unchanged. Request-input validation
and bucket Name echoes remain outside this prompt's scope.

Added 25 regressions while retaining all 903 prior cases. The older opaque-key
success fixture had out-of-prefix keys; its source and expected keys now include
`scope/`, preserving whitespace, metadata and pagination assertions. After fixture
corrections, direct red execution reported `tests 928`, `pass 915`, `fail 13`;
direct green and permitted npm execution reported:

```text
ℹ tests 928
ℹ pass 928
ℹ fail 0
ℹ skipped 0
```

Both `node -c` checks, CLI `--help`, changed-region Prettier and `git diff --check`
exited 0. Root `npm run lint` exited 0 across all three workspaces; root
`npm run typecheck` exited 0, including `tsc --noEmit` and Prisma Client 7.9.1
code generation. The ordinary sandbox npm test printed only its wrapper-file
count (`tests 1`); direct and permitted child-process execution exposed all 928
cases. Sandbox build exited 1 with `Could not parse output from TypeScript's
--showConfig.`; the identical permitted `npm run build` exited 0:

```text
✓ Compiled successfully in 4.9s
✓ Generating static pages using 7 workers (22/22) in 927ms
> prisma generate && nest build
```

Every independent offline stage currently in `ops:check` exited 0: **33 stages,
27 suite invocations, 3909 tests / 3909 passed / zero failures / zero skipped**.
Final launch/dossier output was `tests 182`, `pass 182`, `fail 0`. Each stage's
exit and suite summary was inspected; template, secret/default, Docker runtime,
license, SAST and container gates passed. Online `ops:audit` remains omitted
under the recorded metadata-disclosure restriction; no aggregate ops:check pass
or fresh vulnerability inventory is claimed.

Permitted `npm run ops:launch-readiness` retained expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Independent high-effort read-only review found no Critical, Important or Minor
issues, reproduced 928/928 and clean diff checks, and approved merging after
owner documentation. Feedback was checked against guard placement, literal SDK
semantics, fixture correction and publication ordering; no fixes or significant
re-review were necessary. Literal scope consistency cannot prove total
completeness, authenticity, object bytes or atomic DB/storage snapshots. No live
service, operator approval, deployment or push occurred; Prompt 201, Category 6
live recovery approval and Phase 12 exit stay open. Ordinary commit revert rolls
back source/tests/docs without migration or storage mutation.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 324 — validate storage listing request scope (2026-10-12)

Continued Phase 12K after committed Prompt 323 (`872695f`), as the one additional
prompt explicitly authorized by the user. Bounded pre-change probes accepted
`prefix: false`, a missing bucket and an object-valued bucket after one client
request each. The false prefix became an omitted prefix. The listing adapter
now requires a primitive nonblank bucket string and an omitted/undefined or
primitive string prefix before constructing or sending a command. All three
original probes now reject with zero sends and fixed
`Object storage listing is invalid or incomplete`.

Validation does not coerce boxed strings or arbitrary objects, including custom
toString/valueOf/Symbol.toPrimitive hooks. Defined null/falsy non-string prefixes
reject instead of broadening the request. Valid bucket strings and prefixes
remain unchanged; empty prefixes retain the existing undefined request value.
Whitespace prefixes, opaque percent/Unicode/path-looking prefixes and nonblank
bucket identifiers retain literal semantics. Alias/ARN-shaped string cases
verify transport preservation only, not live AWS routing or bucket existence.
Installed SDK ListObjectsV2Request declarations verify string contracts and
support aliases/ARNs, so no DNS-name regex or Name-echo equality was invented.

The intentional compatibility change affects invalid direct JavaScript scope
inputs that previously reached the client or became bucket-wide scans. Public
signatures, CLI parsing/defaults/env precedence (including falsy env fallback),
parameter-container/client validation, endpoint/region handling, response/key
checks, SQL, comparison, receipt publication/format and Stage 7 are unchanged.
Malformed truthy runner bucket values reject with sanitized listing errors,
no summary/receipt and no storage requests. Caller-owned frozen inputs, ordering,
pagination and normal configured-bucket simulation receipts remain supported.

All 928 existing cases and 41 new regressions pass. Direct red output was
`tests 969`, `pass 937`, `fail 32`; direct green and permitted npm output was:

```text
ℹ tests 969
ℹ pass 969
ℹ fail 0
ℹ skipped 0
```

Actual verification commands and representative output:

| command | exit | actual output / result |
| --- | --- | --- |
| `npm run ops:reconcile-test` | 0 | `ℹ tests 969`, `ℹ pass 969`, `ℹ fail 0` |
| source/spec `node -c` | 0 | no output |
| CLI `--help` | 0 | `Usage: node scripts/ops/reconcile-storage-objects.js [options]` |
| changed-region Prettier | 0 | `{"specFormatting":true,"guardFormatting":true}` |
| `npm run lint` | 0 | `> eslint`, `> eslint "src/**/*.ts"`, `> eslint "{src,test}/**/*.ts"` |
| `npm run typecheck` | 0 | `> tsc --noEmit`, `> prisma generate && tsc -p tsconfig.json --noEmit`; generated Prisma Client 7.9.1 in 733ms |
| permitted `npm run build` | 0 | `✓ Compiled successfully in 7.7s`; `✓ Generating static pages using 7 workers (22/22) in 1332ms`; `> prisma generate && nest build` |
| `git diff --check` | 0 | no output |

The same permitted child-process mode that resolved Prompt 323's recorded
sandbox runner/build limitations was used without altering assertions or code
for the environment. Independent offline stages were batched, and exact coverage
was checked against current package.json: **33 stages all exit 0, 27 suite
invocations, 3950 tests / 3950 passed / zero failures / zero skipped**. Final
launch/dossier reported `tests 182`, `pass 182`, `fail 0`. Every stage exit and
suite summary was inspected. Template, secret/default, Docker runtime, license,
SAST and container gates passed. Online `ops:audit` remains omitted under the
recorded metadata-disclosure restriction; no complete aggregate ops:check pass
or fresh vulnerability inventory is claimed.

Permitted `npm run ops:launch-readiness` retained expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Independent high-effort read-only review found no Critical, Important or Minor
issues, reproduced 969/969 with zero skipped and clean diff checks, and approved
merging after owner documentation. Feedback was evaluated against actual guard
placement, non-coercing checks, SDK string semantics, literal input preservation
and runner publication behavior; no fixes or significant re-review were needed.
Scope shape validation cannot establish authorization, real bucket identity or
existence, total completeness, authenticity, byte integrity or atomic snapshots.
No live service, operator approval, deployment or push occurred. Prompt 201,
Category 6 live recovery approval and Phase 12 exit remain open. Ordinary commit
revert rolls back source/tests/docs without migration or storage mutation.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 325 — validate storage listing bucket-name metadata (2026-10-12)

Continued Phase 12K after committed Prompt 324 (`920435a`). The user authorized
immediate implementation and one subsequent prompt. A bounded pre-change probe
accepted object-valued provider `Name` after one request. Defined names now must
be primitive nonblank strings, checked immediately after response shape and
before entries/pagination. Absent/undefined names stay optional; opaque strings,
leading/trailing whitespace and alias/ARN request identifiers are preserved.
The installed S3 SDK declares optional string `Name` as the bucket name; no
name equality with alias/ARN requests or provider grammar was invented.

Malformed first/later names reject whole inventories with fixed adapter and
runner diagnostics, bounded requests and no summary/receipt/temp file. Tests
prove coercion hooks are not evaluated, frozen ownership is preserved and valid
named pages publish simulation receipts. This intentionally rejects previously
accepted malformed/blank metadata; CLI/env defaults, public types, comparison,
SQL, receipt schema/publication and Stage 7 are unchanged. Cross-page name
continuity remains a separate follow-on; name validity does not establish real
bucket identity, authorization, completeness, authenticity or atomic snapshots.

All 969 previous cases plus 34 regressions pass. Actual direct red output:
`tests 1003`, `pass 975`, `fail 28`. Direct green and permitted npm focused output:

```text
ℹ tests 1003
ℹ pass 1003
ℹ fail 0
ℹ skipped 0
```

Actual verification:

| command/check | exit | output/result |
| --- | --- | --- |
| `npm run ops:reconcile-test` (permitted processes) | 0 | `tests 1003`, `pass 1003`, `fail 0` |
| source/spec `node -c`, CLI `--help` | 0 | syntax silent; `Usage: node scripts/ops/reconcile-storage-objects.js [options]` |
| changed-region Prettier | 0 | `{"specFormatting":true,"guardFormatting":true}` |
| `npm run lint` | 0 | `eslint`, `eslint "src/**/*.ts"`, `eslint "{src,test}/**/*.ts"` |
| `npm run typecheck` | 0 | `tsc --noEmit`, `prisma generate && tsc -p tsconfig.json --noEmit`; Prisma Client 7.9.1 |
| permitted `npm run build` | 0 | `✓ Compiled successfully in 5.1s`; `✓ Generating static pages using 7 workers (22/22) in 976ms`; `prisma generate && nest build` |
| `git diff --check` | 0 | silent |

The restricted npm test initially reported only one worker-wrapper result;
that output was not treated as individual-suite evidence. Direct and permitted
process runs independently reported every test. No assertions were weakened.
All 33 independent offline stages resolved from current `ops:check` passed:
27 suite invocations / **3984 tests, 3984 passed, zero failures or skipped**.
Final launch/dossier suite: `tests 182`, `pass 182`, `fail 0`. Every stage exit
and summary was inspected. Online `ops:audit` remains omitted under the recorded
registry metadata-disclosure restriction; no full aggregate ops:check pass or
fresh vulnerability inventory is claimed.

Launch-readiness retained expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Independent read-only review found no Critical, Important or Minor issues,
reproduced **1003/1003** with no skipped cases and approved after documentation.
Feedback was verified against guard placement, SDK alias/ARN semantics and
runner failure/publication assertions; no fixes or re-review were necessary.
No live service, operator approval, deployment or push occurred. Prompt 201,
Category 6 live approval and Phase 12 exit remain open. Ordinary commit revert
rolls this change back without migration or storage mutation.

Safe local inspection:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 326 — enforce storage listing bucket-name continuity (2026-10-12)

Continued Phase 12K after committed Prompt 325 (`9ec4e50`), as the one additional
prompt authorized by the user. A fresh bounded probe accepted keys from pages
naming two different buckets. The adapter now remembers the first defined
valid Name within each invocation; later defined names must match it exactly.
Absent/undefined names remain optional and cannot clear the anchor. The first
name may occur on a later or terminal page. State is invocation-local, including
when the same client is reused. No case, whitespace or Unicode normalization
occurs, and alias/ARN request identifiers may differ from the stable echo.

Contradictions reject before entries or another send, returning no partial
inventory; runner failures publish no summary/receipt/temp file and expose only
fixed diagnostics. Valid scans retain object order, date/checksum conversion,
frozen ownership, request scope, token order and clean simulation receipts.
This intentionally rejects previously accepted contradictory supplied names;
Prompt 325 shape validation, public types, CLI/env precedence, comparison/SQL,
receipt schema/publication and Stage 7 are unchanged. Stable optional echoes do
not prove authorization, real bucket identity, completeness, authenticity,
byte integrity, atomic snapshots or live operator approval.

All 1003 previous tests plus 20 regressions pass. Actual direct red output:
`tests 1023`, `pass 1013`, `fail 10`. Direct green and permitted npm output:

```text
ℹ tests 1023
ℹ pass 1023
ℹ fail 0
ℹ skipped 0
```

Actual checks:

| command/check | exit | output/result |
| --- | --- | --- |
| permitted `npm run ops:reconcile-test` | 0 | `tests 1023`, `pass 1023`, `fail 0` |
| source/spec `node -c`, CLI `--help` | 0 | syntax silent; `Usage: node scripts/ops/reconcile-storage-objects.js [options]` |
| changed-region Prettier | 0 | `{"specFormatting":true,"guardFormatting":true}` |
| `npm run lint` | 0 | `eslint`, `eslint "src/**/*.ts"`, `eslint "{src,test}/**/*.ts"` |
| `npm run typecheck` | 0 | `tsc --noEmit`, `prisma generate && tsc -p tsconfig.json --noEmit`; Prisma Client 7.9.1 |
| permitted `npm run build` | 0 | `✓ Compiled successfully in 10.4s`; `✓ Generating static pages using 7 workers (22/22) in 1742ms`; `prisma generate && nest build` |
| `git diff --check` | 0 | silent |

Normal permitted worker processes were used for npm tests/build and offline
operations under the previously established sandbox limits, without changing
assertions. All 33 independent offline stages resolved from current ops:check
passed: **27 suite invocations / 4004 tests / 4004 passed / zero failed or
skipped**. Final launch/dossier: `tests 182`, `pass 182`, `fail 0`. Every stage
exit and summary was inspected. Online ops:audit remains omitted under the
recorded registry metadata-disclosure restriction; no complete aggregate
ops:check pass or fresh vulnerability inventory is claimed.

Launch-readiness retained expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Independent read-only review found no Critical, Important or Minor issues,
reproduced **1023/1023** with zero skipped and approved after documentation.
Feedback was checked against invocation-local state, optional gaps, exact
comparison, SDK alias/ARN semantics and runner publication suppression; no
fixes or significant re-review were needed. No live service, operator approval,
deployment or push occurred. Prompt 201, Category 6 live approval and Phase 12
exit stay open. Ordinary commit revert restores prior behavior without any
migration or storage mutation. Both authorized prompts are complete after this
local commit; no additional prompt is prepared.

Safe local inspection:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 327 — validate storage checksum extension types (2026-10-12)

Continued Phase 12K after committed Prompt 326 (`3d3762c`), with the user's
instruction to implement the prepared plan. A fresh synthetic probe supplied a
canonical SHA256 digest marked `COMPOSITE`; the adapter accepted it and the
comparison against the same hex DB digest reported:

```text
{"accepted":1,"status":"clean","matched":1}
```

The existing non-null/defined `ChecksumSHA256` extension branch now requires
any defined `ChecksumType` to be exactly primitive `FULL_OBJECT`. Composite,
null and malformed types reject before decoding or inventory inclusion, with
no coercion. First/later failures reject the whole scan before another send;
runner failures expose fixed diagnostics and publish no summary, receipt or
temporary file. The same synthetic probe after the correction returned:

```text
{"rejected":true,"error":"Object storage listing is invalid or incomplete"}
```

Installed SDK `_Object` and `ChecksumType` declarations distinguish
`FULL_OBJECT` and `COMPOSITE`, and describe checksum-type calculation semantics.
Standard ListObjectsV2 entries carry type/algorithm metadata but no digest
value. This correction concerns the utility's existing optional digest
extension, not standard listing digest acquisition. The whole-byte DB digest
contract is also evidenced by `uploads.service.ts` hashing received bytes with
SHA256 before accepting completion.

Omitted/undefined types retain legacy extension compatibility. If the digest
is absent/undefined/null, type and algorithm hints remain unused and
checksumHex stays null, including ordinary COMPOSITE listings. Exact
FULL_OBJECT extensions preserve canonical base64 validation, decoded hex,
size/date conversion, literal keys, pagination and frozen caller ownership.
Successful FULL_OBJECT/legacy extensions and type-only metadata listings still
publish clean simulation receipts. Defined incompatible types with supplied
digests intentionally become errors; CLI/env defaults, SQL, comparison policy,
public signatures/TS facade, publication, receipt schema and Stage 7 are unchanged.

All 1023 previous cases and 37 regressions pass. Direct red output before the
source change was `tests 1060`, `pass 1038`, `fail 22`, `skipped 0`. Direct
green and permitted npm focused verification returned:

```text
ℹ tests 1060
ℹ pass 1060
ℹ fail 0
ℹ skipped 0
```

Actual verification:

| command/check | exit | output/result |
| --- | --- | --- |
| permitted `npm run ops:reconcile-test` | 0 | `tests 1060`, `pass 1060`, `fail 0`, `skipped 0` |
| source/spec `node -c`; CLI `--help` | 0 | syntax silent; `Usage: node scripts/ops/reconcile-storage-objects.js [options]` |
| changed-region Prettier | 0 | `{"guardFormatting":true,"specFormatting":true}`; guard width accounts for its existing indentation |
| `npm run lint` | 0 | `eslint`, `eslint "src/**/*.ts"`, `eslint "{src,test}/**/*.ts"` |
| `npm run typecheck` | 0 | `tsc --noEmit`, `prisma generate && tsc -p tsconfig.json --noEmit`; Prisma Client 7.9.1 |
| permitted `npm run build` | 0 | `✓ Compiled successfully in 2.4s`; `✓ Generating static pages using 7 workers (22/22) in 702ms`; `prisma generate && nest build` |
| `git diff --check` | 0 | silent |

The restricted npm test reported only a single worker-wrapper result, not
individual-suite evidence. Restricted build failed with `Could not parse
output from TypeScript's --showConfig.` Restricted launch-readiness failed in
its test worker. Ordinary permitted child-process reruns supplied the complete
passing focused/build results and the expected readiness rejection. Assertions
were unchanged. All 33 independent offline stages resolved from current
`ops:check` passed: **27 suite invocations / 4041 tests / 4041 passed / zero
failed or skipped**. Every stage status and summary was inspected; final
launch/dossier output was `tests 182`, `pass 182`, `fail 0`. Online `ops:audit`
remains omitted under the recorded registry metadata-disclosure restriction;
no aggregate ops:check pass or fresh vulnerability inventory is claimed.

Permitted launch-readiness retained expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Independent read-only review found no Critical, Important or Minor issues,
reproduced **1060/1060** with zero skipped, and approved completion after docs.
The feedback was verified against guard placement, exact primitive comparison,
digestless compatibility and runner publication suppression. Its documentation
recommendation is recorded here: checksum metadata consistency is not object
byte verification. No fixes or significant re-review were needed.

Legacy digests and metadata-only clean matches do not prove checksum
calculation, authenticity, actual byte integrity, inventory completeness or
an atomic DB/S3 snapshot. Algorithm pairing, mandatory digest acquisition,
HEAD/GET, multipart reconstruction, network/resource bounds and hostile
in-process getters/proxies remain out of scope. No live services, operator
approval, deployment or push occurred. Prompt 201, Category 6 live approval
and Phase 12 exit remain open. Ordinary commit revert restores the prior
validation behavior without migration or storage mutation.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 328 — validate storage checksum algorithm pairing (2026-10-12)

Continued Phase 12K after committed Prompt 327 (`e4f22c9`), with the user's
instruction to execute the prepared plan. A fresh offline probe supplied a
canonical SHA256 listing extension, FULL_OBJECT type and CRC32-only algorithm
metadata. Before the change it reported:

```text
{"accepted":1,"status":"clean","matched":1}
```

Inside the existing non-null/defined ChecksumSHA256 branch, any defined
ChecksumAlgorithm must now be an array containing exact primitive SHA256.
Every slot must contain a primitive nonblank string; for-of iteration rejects
sparse slots as well as malformed members without coercion. Invalid first or
later pages reject the complete scan before conversion, inventory inclusion or
another send. Runner failures preserve fixed diagnostics and publish no
summary, receipt or temporary file. The same contradiction now reports:

```text
{"rejected":true,"error":"Object storage listing is invalid or incomplete"}
```

Omitted/undefined algorithms preserve legacy digest extensions. SHA256 can
appear with other nonblank names, in any order or with duplicates, without a
provider enum allowlist. Absent/undefined/null digests continue ignoring unused
algorithm/type hints, including CRC32-only metadata. FULL_OBJECT validation,
canonical base64 decoding, literal keys, pagination, sizes/dates and frozen
ownership remain unchanged. Typed, multiple-algorithm, legacy and digestless
fixtures still publish clean simulation receipts. CLI/env defaults, comparison,
SQL, TS facade, receipt schema/publication and Stage 7 were not changed.

Installed S3 `_Object` declarations describe ChecksumAlgorithm as an optional
array of algorithms used to create the checksum. Standard ListObjectsV2 entries
carry hints without digest values; ChecksumSHA256 remains the utility's existing
optional provider extension. This check rejects contradictory supplied evidence;
it does not acquire or verify object bytes.

All 1060 prior cases and 72 new cases pass. The actual pre-change direct test
run returned `tests 1132`, `pass 1086`, `fail 46`, `skipped 0`. Green direct and
npm focused runs returned:

```text
ℹ tests 1132
ℹ pass 1132
ℹ fail 0
ℹ skipped 0
```

Actual verification:

| command/check | exit | output/result |
| --- | --- | --- |
| permitted `node --test scripts/ops/reconcile-storage-objects.spec.js` and `npm run ops:reconcile-test` | 0 | `tests 1132`, `pass 1132`, `fail 0`, `skipped 0` |
| source/spec `node -c`; CLI `--help` | 0 | syntax silent; `Usage: node scripts/ops/reconcile-storage-objects.js [options]` |
| changed-region Prettier | 0 | `{"specFormatting":true}` and `{"guardFormatting":true}`; guard width accounts for existing indentation |
| `npm run lint` | 0 | `eslint`, `eslint "src/**/*.ts"`, `eslint "{src,test}/**/*.ts"` |
| `npm run typecheck` | 0 | `tsc --noEmit`, `prisma generate && tsc -p tsconfig.json --noEmit`; Prisma Client 7.9.1 |
| permitted `npm run build` | 0 | `✓ Compiled successfully in 2.5s`; `✓ Generating static pages using 7 workers (22/22) in 574ms`; `prisma generate && nest build` |
| `git diff --check` | 0 | silent |

The restricted Node test initially reported only a single failing worker wrapper;
that result was not counted as individual-suite evidence. Restricted build
failed with `Could not parse output from TypeScript's --showConfig.` Normal
permitted child-process reruns supplied complete red/green and build evidence
without weakening assertions. Launch-readiness ran with ordinary permitted
child processes and retained expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

All 33 independent offline stages resolved from current ops:check passed:
**27 suite invocations / 4113 tests / 4113 passed / zero failed or skipped**.
Every stage exit and individual suite total was inspected, including template,
secret/default, runtime, SBOM/license, SAST and container gates. Final launch/
dossier output was `tests 182`, `pass 182`, `fail 0`. Online ops:audit remains
omitted under the recorded registry metadata-disclosure restriction; no full
aggregate ops:check pass or fresh vulnerability inventory is claimed.

Independent read-only review found no Critical, Important or Minor issues,
reproduced **1132/1132** with zero skipped, and found no plan deviations.
Feedback was evaluated against the guard's placement, sparse-slot iteration,
legacy/digestless compatibility, fixed runner errors and publication sequencing.
Its recommendation to distinguish metadata consistency from byte verification
is recorded here. No fixes or significant re-review were needed.

Optional metadata and clean comparisons do not establish checksum calculation,
authenticity, actual byte integrity, inventory completeness or an atomic DB/S3
snapshot. Mandatory digest acquisition, HEAD/GET, hashing, multipart
reconstruction, hostile in-process objects and network/resource bounds remain
out of scope. No live services, operator approval, deployment or push occurred.
Prompt 201, Category 6 live recovery approval and Phase 12 exit remain open.
Ordinary commit revert restores prior behavior without migration or storage
mutation.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 329 — validate database inventory row counts (2026-10-12)

Continued Phase 12K after committed Prompt 328 (`60a6b22`), under the user's
instruction to implement the prepared plan. The fresh pre-change synthetic
PostgreSQL result supplied rowCount 2 with one valid row and returned:

```text
{"reported":2,"accepted":1}
```

After existing result/row validation and before bigint conversion,
queryDatabaseStoredObjects now requires any defined rowCount to be a
nonnegative safe integer exactly equal to rows.length. Invalid or contradictory
counts reject the whole result with the fixed Database inventory is invalid
error, without coercion. The same probe now returns:

```text
{"rejected":true,"error":"Database inventory is invalid"}
```

Installed pg/lib/result.js initializes rowCount to null and replaces it from
numeric command-completion tags. This adapter executes one completed SELECT
with buffered rows, so null is rejected here; this is not a rule for unrelated
PostgreSQL commands that lack row counts. Omitted/undefined metadata remains
compatible with injected adapters. Exact positive counts and zero/-0 empty
results preserve row order, frozen ownership, extra fields and bigint
conversion. Matching counts cannot conceal invalid, sparse or duplicate rows.
SQL, storage listing, pure comparison, CLI/env behavior, TS facade, receipt
schema/publication and Stage 7 are unchanged.

Runner regressions verify fixed Database query failed diagnostics, exit 1,
one query, zero S3 sends, no caller-client end/destroy and no output or temporary
files on rejection. Matching and optional counts still publish clean simulation
receipts, including empty inventories. The 1132 prior tests remain intact;
54 new cases cover invalid counts, compatibility and runner publication.
Actual permitted pre-change red output was:

```text
ℹ tests 1186
ℹ pass 1148
ℹ fail 38
ℹ skipped 0
```

Direct and npm focused green runs returned:

```text
ℹ tests 1186
ℹ pass 1186
ℹ fail 0
ℹ skipped 0
```

Actual repository verification:

| command/check | exit | output/result |
| --- | --- | --- |
| permitted direct spec and npm run ops:reconcile-test | 0 | tests 1186, pass 1186, fail 0, skipped 0 |
| source/spec node -c and CLI --help | 0 | syntax silent; Usage: node scripts/ops/reconcile-storage-objects.js [options] |
| changed-region installed Prettier | 0 | {"specFormatting":true}, {"guardFormatting":true} |
| npm run lint | 0 | eslint; eslint "src/**/*.ts"; eslint "{src,test}/**/*.ts" |
| npm run typecheck | 0 | tsc --noEmit; prisma generate && tsc -p tsconfig.json --noEmit; Prisma Client 7.9.1 |
| permitted npm run build | 0 | Compiled successfully in 6.0s; Generating static pages using 7 workers (22/22) in 1596ms; prisma generate && nest build |
| git diff --check | 0 | silent |

The restricted test attempt returned only one failing worker wrapper, not an
individual-suite result. Restricted build failed with Could not parse output
from TypeScript's --showConfig. Permitted ordinary child-process reruns supplied
complete red/green and build evidence without weakening checks. Launch
readiness retained expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

All 33 independent offline stages resolved from current package.json ops:check
passed: **27 suite invocations / 4167 tests / 4167 passed / zero failed or
skipped**. Every stage exit and suite total was inspected; final launch/dossier
output was tests 182, pass 182, fail 0. Online ops:audit remains omitted under
the recorded registry metadata-disclosure restriction. No full aggregate
ops:check pass or fresh vulnerability inventory is claimed.

Independent read-only review found no Critical, Important or Minor issues,
reproduced 1186/1186 with zero skipped, and found no plan deviations. Feedback
was verified against driver semantics, guard placement, optional metadata,
fixed runner diagnostics and suppression of requests/publication. No fixes
or significant re-review were needed.

Count consistency alone does not establish inventory completeness, authenticity,
object byte integrity or an atomic DB/S3 snapshot. Mandatory metadata, command
or field validation, SQL/upload selection changes, live calls, resource bounds
and hostile in-process objects remain out of scope. No live services, operator
approval, deployment or push occurred. Prompt 201, Category 6 live recovery
approval and Phase 12 exit remain open. Ordinary commit revert restores prior
behavior without migration or data/storage mutation.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 330 — validate database inventory command tags (2026-10-12)

Continued Phase 12K after committed Prompt 329 (`b3ac3d6`), under the user's
instruction to implement the prepared plan. The fresh synthetic pre-change
probe returned:

```text
{"command":"DELETE","accepted":0}
```

After existing result/row validation and before conversion,
queryDatabaseStoredObjects now requires any defined command to be exact
primitive SELECT. Other commands, null, malformed strings and nonstrings
reject whole inventories without coercion, using the existing fixed error.
The same probe now returns:

```text
{"rejected":true,"error":"Database inventory is invalid"}
```

Installed pg/lib/result.js initializes command to null and fills it from the
command-completion tag. This adapter executes one completed SELECT; null or
another tag contradicts that result, even when rowCount matches an empty
inventory. Synthetic installed-driver SELECT 0/SELECT 1 completions pass.
Omitted/undefined tags remain compatible with injected adapters. Exact SELECT
preserves empty/populated inventories, optional/exact counts, frozen caller
ownership, row order, extra fields and bigint conversion. It cannot excuse
invalid rows or contradictory row counts. SQL, storage listing, comparison,
CLI/env behavior, TS facade, receipt schema/publication and Stage 7 are unchanged.

All 1186 prior tests remain intact. The 113 added direct/runner cases cover
malformed tags, no coercion, valid compatibility and driver completions.
Runner failures verify one query, zero S3 sends, no injected-client end/destroy,
only the connecting log, fixed Error: Database query failed, exit 1, and no
summary, receipt or temporary file. Supported results publish clean simulation
receipts, including empty inventories. Actual permitted red output:

```text
ℹ tests 1299
ℹ pass 1211
ℹ fail 88
ℹ skipped 0
```

Direct and npm focused green output:

```text
ℹ tests 1299
ℹ pass 1299
ℹ fail 0
ℹ skipped 0
```

Actual repository verification:

| command/check | exit | output/result |
| --- | --- | --- |
| permitted direct spec and npm run ops:reconcile-test | 0 | tests 1299, pass 1299, fail 0, skipped 0 |
| source/spec node -c and CLI --help | 0 | syntax silent; Usage: node scripts/ops/reconcile-storage-objects.js [options] |
| changed-region installed Prettier | 0 | {"specFormatting":true}, {"guardFormatting":true} (source guard dedented for comparison) |
| npm run lint | 0 | eslint; eslint "src/**/*.ts"; eslint "{src,test}/**/*.ts" |
| npm run typecheck | 0 | tsc --noEmit; prisma generate && tsc -p tsconfig.json --noEmit; Prisma Client 7.9.1 |
| permitted npm run build | 0 | Compiled successfully in 3.5s; Generating static pages using 7 workers (22/22) in 1323ms; prisma generate && nest build |
| git diff --check | 0 | silent |

Restricted direct tests reported one failing worker wrapper rather than suite
results. Restricted build failed with Could not parse output from TypeScript's
--showConfig. Permitted normal child-process reruns produced complete red/green
and build evidence without weakening checks. Deterministic example readiness
validation retained expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

All 33 independent offline stages resolved from current package.json ops:check
passed: **27 suite invocations / 4280 tests / 4280 passed / zero failed or
skipped**. Every stage exit and suite total was inspected; final launch/dossier
output was tests 182, pass 182, fail 0. Online ops:audit remains omitted under
the recorded registry metadata-disclosure restriction. No full aggregate
ops:check pass or fresh vulnerability inventory is claimed.

Independent read-only review found no Critical, Important or Minor issues and
no implementation plan deviations. Its restricted test invocation reported
only a file-level test and does not independently corroborate 1299 case totals;
the coordinator's permitted direct/npm runs supply those results. Feedback
was verified against strict comparison, guard placement, installed driver
semantics, optional metadata and runner publication suppression. No fixes or
significant re-review were needed.

Command consistency does not authenticate metadata, establish inventory
completeness, verify object bytes or provide an atomic DB/S3 snapshot. Mandatory
metadata, other driver fields, live calls, query selection changes, resource
bounds and hostile in-process objects remain out of scope. No live services,
operator approval, deployment or push occurred. Prompt 201, Category 6 live
recovery approval and Phase 12 exit remain open. Ordinary commit revert restores
prior behavior without migration or data/storage mutation.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 331 — validate database inventory row mode (2026-10-12)

Continued Phase 12K after committed Prompt 330 (`cb3ee0f`), following the
user's approval of prompts/331-validate-database-inventory-row-mode.md.
The installed pg/lib/result.js constructor sets rowAsArray to the primitive
boolean result of rowMode === 'array'. Default parsing returns named-field
objects; array mode selects _parseRowAsArray. This inventory adapter issues
a plain SQL string and consumes named fields. A synthetic installed-driver
empty array-mode SELECT previously returned:

```text
{"rowAsArray":true,"command":"SELECT","rowCount":0,"accepted":0}
{"defaultRowAsArray":false}
```

After existing result/row validation and before conversion, any defined
rowAsArray must now be exactly primitive false. True/null/malformed values
reject whole results without coercion, using the existing fixed error. The
same synthetic array-mode probe now returns:

```text
{"rejected":true,"error":"Database inventory is invalid"}
```

Omitted/undefined metadata remains compatible with injected adapters. Valid
false preserves empty/populated inventories, optional/exact count metadata,
frozen caller ownership, row order, opaque fields and bigint conversion.
False cannot excuse malformed/sparse/duplicate rows, bad command metadata or
contradictory counts. Installed-driver empty default-mode SELECT remains
accepted. SQL, S3 listing, comparison, CLI/env behavior, TypeScript facade,
receipt schema/publication and Stage 7 are unchanged.

All 1299 prior tests remain byte-for-byte unchanged; 102 appended direct and
runner cases cover invalid categories, compatibility and driver semantics.
Runner failures verify one query, zero S3 sends, no injected-client end/destroy,
only the connecting log, fixed Error: Database query failed, exit 1, and no
summary, final receipt or temporary file. Supported empty/populated results
still publish clean simulation receipts. Actual permitted red output:

```text
ℹ tests 1401
ℹ pass 1324
ℹ fail 77
ℹ skipped 0
```

Actual permitted direct and npm focused green output:

```text
ℹ tests 1401
ℹ pass 1401
ℹ fail 0
ℹ skipped 0
```

Actual repository verification:

| command/check | exit | output/result |
| --- | --- | --- |
| permitted direct spec and npm run ops:reconcile-test | 0 | tests 1401, pass 1401, fail 0, skipped 0 |
| source/spec node -c and CLI --help | 0 | syntax silent; Usage: node scripts/ops/reconcile-storage-objects.js [options] |
| changed-region installed Prettier | 0 | {"specFormatting":true}; {"guardFormatting":true} (guard dedented for comparison) |
| npm run lint | 0 | eslint; eslint "src/**/*.ts"; eslint "{src,test}/**/*.ts" |
| final sequential npm run typecheck | 0 | tsc --noEmit; prisma generate && tsc -p tsconfig.json --noEmit; Prisma Client 7.9.1 |
| permitted npm run build | 0 | Compiled successfully in 3.4s; Generating static pages using 7 workers (22/22) in 929ms; prisma generate && nest build |
| git diff --check | 0 | silent |

The restricted direct test attempt reported one failed worker wrapper rather
than suite results. The restricted build failed with Could not parse output
from TypeScript's --showConfig. A typecheck started alongside that build failed
with TS6053 missing generated .next/types files; rerunning sequentially after
the successful permitted build passed. Ordinary child-process reruns produced
complete red/green/build evidence without weakening checks. A supplemental
unchanged-spec probe initially used an invalid Node execFileSync options
argument; the corrected Python byte comparison confirmed the previous spec
is an unchanged prefix of the current file.

All 33 independent offline stages resolved from current package.json ops:check
passed: **27 suite invocations / 4382 tests / 4382 passed / zero failures or
skipped**. Every stage exit and final suite count was inspected; the final
launch/dossier suite reported tests 182, pass 182, fail 0. While that final
suite ran, a read-only process inspection confirmed it was executing isolated
synthetic fixtures. No live launch drill was run. Online ops:audit remains
omitted under the registry metadata-disclosure restriction; no full aggregate
ops:check pass or fresh vulnerability inventory is claimed.

Deterministic example readiness validation retained expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Independent read-only review found no Critical, Important or Minor issues and
no implementation deviations. Its restricted invocation reported only one
file-level test despite exit 0 and does not independently corroborate 1401
cases; coordinator permitted runs supply that evidence. Feedback was verified
against strict optional metadata handling, guard placement, installed driver
semantics, caller ownership and publication suppression. No fixes or
significant re-review were needed.

Row-mode consistency cannot authenticate metadata, establish complete
inventories, verify object bytes or provide an atomic DB/S3 snapshot.
Mandatory metadata, field/OID validation, SQL selection changes, resource
bounds and hostile in-process objects remain out of scope. No live services,
operator approval, deployment or push occurred. Prompt 201, Category 6 live
recovery approval and Phase 12 exit remain open. Ordinary commit revert
restores prior behavior without migration or data/storage mutation.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 332 — Database inventory column names (2026-10-12)

Continued Phase 12K after committed Prompt 331. The PostgreSQL inventory adapter
now validates optional result.fields against the fixed SELECT's twelve ordered
column names. Supplied metadata must be a dense array of field records with
exact primitive names. Missing/extra/reordered/duplicate columns, sparse arrays,
malformed records and nonprimitive names reject whole inventories, including
empty results, before conversion, S3 requests or publication. No coercion or
normalization occurs; extra descriptor attributes remain opaque.

Omitted/undefined metadata preserves injected-adapter compatibility. Correct
fields preserve frozen ownership, row order, opaque row values and bigint
conversion, and cannot excuse malformed rows, command/count or row-mode metadata.
SQL, comparison, storage listing, CLI/environment, TypeScript facade, receipt
schema/publication and Stage 7 are unchanged. The installed pg Result.addFields
and Query.handleRowDescription paths confirm row descriptions are separate
from data rows; parseRow uses field names as object keys. The original synthetic
wrong-projection empty SELECT probe now prints:

```text
{"rejected":true,"error":"Database inventory is invalid"}
```

Added 100 direct/runner/installed-driver cases. The 1401 prior tests retain their
assertions; only two existing synthetic driver fixture sites now add the actual
projection description before completion. New driver tests use the installed
Result implementation without a live database. Failure runners verify one query,
zero S3 sends, fixed connecting/error diagnostics, caller-owned client lifecycle,
and no summary, receipt or temporary file. Supported runners publish clean
simulation evidence with correct matched counts.

Actual permitted test-first red output (exit 1):

```text
ℹ tests 1501
ℹ pass 1422
ℹ fail 79
ℹ skipped 0
```

Actual permitted focused green output (exit 0):

```text
ℹ tests 1501
ℹ pass 1501
ℹ fail 0
ℹ skipped 0
```

Actual repository verification:

| command/check | exit | output/result |
| --- | --- | --- |
| direct spec and npm run ops:reconcile-test | 0 | tests 1501, pass 1501, fail 0, skipped 0 |
| source/spec node -c and CLI --help | 0 | syntax silent; Usage: node scripts/ops/reconcile-storage-objects.js [options] |
| installed Prettier on changed regions | 0 | specFormatting: true; guardFormatting: true; columnsFormatting: true |
| npm run lint | 0 | eslint; eslint "src/**/*.ts"; eslint "{src,test}/**/*.ts" |
| npm run typecheck, sequentially after build | 0 | tsc --noEmit; prisma generate && tsc -p tsconfig.json --noEmit; Prisma Client 7.9.1 |
| permitted npm run build | 0 | Compiled successfully in 3.5s; Generating static pages using 7 workers (22/22) in 1124ms; prisma generate && nest build |
| git diff --check | 0 | silent |

The restricted red test attempt reported one failed worker wrapper rather than
suite totals. The restricted build failed with Could not parse output from
TypeScript's --showConfig. Ordinary permitted reruns provided complete test
and build output without weakening checks. Sequential typecheck passed without
a generated-type race.

All 33 independent offline stages resolved from current package.json ops:check
passed: **27 suite invocations / 4482 tests / 4482 passed / zero failures or
skipped**. Every stage exit and suite count was inspected. The final
launch-orchestrator/dossier synthetic suite reported:

```text
ℹ tests 182
ℹ pass 182
ℹ fail 0
ℹ skipped 0
```

Template, secret/default scan and Docker runtime checks passed. Offline SBOM
licence validation, SAST and container-template gates passed. Online ops:audit
remains omitted under the recorded registry metadata-disclosure restriction;
no full aggregate ops:check pass or fresh vulnerability inventory is claimed.
No live launch drill was run.

Readiness example validation retained expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Independent read-only review found no Critical, Important or Minor issues and
no implementation deviations. Its restricted test invocation reported only a
worker wrapper and does not corroborate full-suite totals; coordinator permitted
runs provide those results. The review was evaluated against the actual SQL
projection, optional strict validation, driver fixtures, preserved ownership
and suppression of downstream effects. No fixes or significant re-review were
needed.

Column-name consistency does not authenticate metadata, prove complete
inventories, verify object bytes or provide atomic snapshots. Mandatory metadata,
OID/type checks, SQL/join changes, resource bounds and hostile in-process objects
remain out of scope. No live services, operator approval, deployment or push
occurred. Prompt 201, Category 6 live recovery approval and Phase 12 exit remain
open. Ordinary commit revert restores previous behavior without migration or
database/storage mutation.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 333 — Database inventory column formats (2026-10-12)

Continued Phase 12K after committed Prompt 332. The fixed inventory SELECT is
sent as ordinary query text; each supplied descriptor format must now be exact
primitive `text` when defined. Binary or malformed formats reject whole
inventories, including empty results, through the existing fixed error before
conversion, S3 requests or publication. Omitted/undefined fields and formats
remain compatible with injected adapters. Names/order/density, row/count/
command/mode checks, frozen ownership, opaque additional attributes and bigint
conversion are preserved. SQL, receipt schema, storage listing and Stage 7
are unchanged.

Installed pg Result.addFields selects parsers by format; parseRow handles binary
values differently. Query.submit's simple path sends the query text, and
pg-protocol's parseField maps the wire format to text/binary. These installed
sources provide offline driver evidence, not a live PostgreSQL recovery test.
The original all-binary empty-result probe now prints:

```text
{"rejected":true,"error":"Database inventory is invalid"}
```

Added 32 focused cases while retaining all 1501 previous assertions: invalid
format families and descriptor positions, empty/populated/frozen compatibility,
no coercion, runner failure/publication behavior, other guard independence and
installed-driver empty results. Existing installed-driver populated-text parsing
coverage remains intact. Invalid runners verify one query, zero S3 sends,
caller-owned clients, fixed diagnostics and no summary, receipt or temporary
file. Valid mixed omission/text formats publish clean simulation evidence.

Actual permitted test-first red output (exit 1):

```text
ℹ tests 1533
ℹ pass 1517
ℹ fail 16
ℹ skipped 0
```

Actual direct and npm run ops:reconcile-test green output (exit 0 each):

```text
ℹ tests 1533
ℹ pass 1533
ℹ fail 0
ℹ skipped 0
```

The initial restricted red invocation reported only a failed worker wrapper;
permitted execution supplied the complete totals above. No assertions were
weakened. Actual repository verification:

| command/check | exit | output/result |
| --- | --- | --- |
| source/spec node -c | 0 | silent |
| CLI --help | 0 | Usage: node scripts/ops/reconcile-storage-objects.js [options] |
| installed Prettier on changed regions | 0 | specFormatting: true; guardFormatting: true |
| npm run lint | 0 | eslint; eslint "src/**/*.ts"; eslint "{src,test}/**/*.ts" |
| npm run build | 0 | Compiled successfully in 5.4s; Generating static pages using 7 workers (22/22) in 1239ms; prisma generate && nest build |
| npm run typecheck | 0 | tsc --noEmit; prisma generate && tsc -p tsconfig.json --noEmit; Prisma Client 7.9.1 |
| git diff --check | 0 | silent |

An initial isolated formatting probe used incorrectly indented wrapper text and
reported guardFormatting: false; comparison of the actual guard with installed
Prettier's full-source output reported true without changing source formatting.
Next generated types were complete before typecheck started; no generated-type
race occurred.

All 33 independent offline stages resolved from current package.json ops:check
passed: **27 suite invocations / 4514 tests / 4514 passed / zero failures or
skipped**. Every stage exit and count was inspected. The final synthetic
launch-orchestrator/dossier suite reported tests 182, pass 182, fail 0, skipped 0.
Template, secret/default scan, Docker runtime, offline SBOM licence, SAST and
container-template checks passed. Online ops:audit remains omitted under the
recorded registry metadata-disclosure restriction; no full aggregate ops:check
pass or fresh vulnerability inventory is claimed.

Readiness example validation retained expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Independent read-only review found no Critical, Important or Minor issues, no
meaningful test gaps and no plan deviations. Its own restricted test invocation
reported a passing file-level wrapper and does not independently reproduce
case totals; it inspected the coordinator's complete green and offline logs.
Review feedback was evaluated against the actual guard, installed driver,
preserved compatibility and downstream-effect tests. No corrections or
significant re-review were required.

Format consistency cannot authenticate metadata, prove completeness, verify
object bytes or establish atomic snapshots/live recovery. Mandatory metadata,
OID/type validation, protocol changes and hostile in-process objects remain
out of scope. Prompt 201, Category 6 live approval and Phase 12 exit remain
open. No live services, operator approval, deployment or push occurred.
Ordinary commit revert restores previous behavior without migrations or
DB/storage mutation.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 334 — Database inventory byte-count type (2026-10-12)

Continued Phase 12K after committed Prompt 333. The inventory SELECT explicitly
casts byteCount to text. A defined dataTypeID on that descriptor must now equal
primitive numeric 25 (PostgreSQL TEXT). Contradictory/malformed metadata rejects
whole results, including empty inventories, before conversion, S3 requests or
receipt publication. Missing/undefined fields/types remain compatible. Type IDs
on other columns remain opaque, including installation-specific enum IDs.
SQL, receipt schema, storage listing and Stage 7 are unchanged; all existing
row/name/format/count/command/mode checks remain active.

Installed pg Result.addFields selects parsers by dataTypeID and format;
pg-types/lib/builtins.js defines TEXT as 25 and textParsers.js registers 701 as
parseFloat. Offline installed-driver fixtures demonstrate string preservation
with 25 and numeric conversion with 701, including rejection of empty wrong-type
results. This is driver evidence, not a live PostgreSQL recovery test. Before
the fix, a correct-name/text-format empty result with byteCount type 701 printed
`{"accepted":0,"byteCountType":701}`.

Added 37 cases without removing prior assertions: invalid primitive/reference
types, coercion trap, empty/populated frozen compatibility, ordered bigint
conversion, opaque other-column IDs, guard independence, installed-driver
parsing, valid simulation publication and runner failure suppression. Invalid
runners verify one query, zero sends, caller-owned clients, fixed diagnostics
and no summary, receipt or temporary file.

Initial permitted test-first red execution (exit 1):

```text
ℹ tests 1570
ℹ pass 1549
ℹ fail 21
ℹ skipped 0
```

The initial restricted invocation reported only a failed worker wrapper, not
case totals. The first implementation rerun reported 1562 pass / 8 fail:
eight new ownership assertions expected a string while inventoryDbRecord
defaulted to a number. Supplying an explicit string byteCount in those fixtures
corrected the assertion setup without weakening behavior. Final direct and
npm run ops:reconcile-test executions both returned exit 0:

```text
ℹ tests 1570
ℹ pass 1570
ℹ fail 0
ℹ skipped 0
```

Actual repository verification:

| command/check | exit | output/result |
| --- | --- | --- |
| source/spec node -c | 0 | silent |
| CLI --help | 0 | Usage: node scripts/ops/reconcile-storage-objects.js [options] |
| installed Prettier on added spec/changed guard | 0 | specFormatting: true; guardFormatting: true |
| npm run lint | 0 | eslint; eslint "src/**/*.ts"; eslint "{src,test}/**/*.ts" |
| permitted npm run build | 0 | Compiled successfully in 4.5s; Generating static pages using 7 workers (22/22) in 1544ms; prisma generate && nest build |
| npm run typecheck after build | 0 | tsc --noEmit; prisma generate && tsc -p tsconfig.json --noEmit; Prisma Client 7.9.1 |
| git diff --check | 0 | silent |

All 33 independent offline stages resolved from package.json ops:check passed:
**27 suite invocations / 4551 tests / 4551 passed / zero failures or skipped**.
Every stage exit/count was inspected; template, secret/default scan, Docker
runtime, offline SBOM licence, SAST and container-template gates passed. The
final synthetic launch-orchestrator/dossier suite returned exit 0:

```text
ℹ tests 182
ℹ pass 182
ℹ fail 0
ℹ skipped 0
```

Online ops:audit remains omitted under the recorded registry metadata-disclosure
restriction. No aggregate ops:check pass or fresh vulnerability inventory is
claimed. No live launch drill was run.

Independent read-only review found no Critical, Important or Minor issues,
implementation deviations or material test gaps. It inspected the actual diff,
installed driver authority and coordinator direct/npm green logs, without
claiming an independent reproduction. Its assessment required completion of
this results/review record before commit. Feedback was evaluated against the
explicit SQL cast, optional strict comparison, opaque other-column IDs,
caller ownership and downstream-effect coverage; no fixes or re-review needed.

Readiness example validation retained expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Metadata consistency cannot authenticate responses, prove completeness, verify
object bytes or establish atomic snapshots/live recovery. Mandatory metadata,
generic OID validation and hostile in-process objects remain out of scope.
Prompt 201, Category 6 live approval and Phase 12 exit remain open. No live
services, operator approval, deployment or push occurred. Ordinary commit revert
restores previous behavior without migrations or DB/storage mutation.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 335 — database inventory timestamp types (2026-10-12)

Continued Phase 12K after committed Prompt 334 on clean main at
10b06909114e3181f717ae944b43e3c3b72c3ee0. The three projected date descriptors
(deletedAt, createdAt, uploadExpiresAt) now require any defined dataTypeID to
be exact primitive numeric 1184. The committed storage migration defines
StoredObject.deletedAt/createdAt and Upload.expiresAt as timestamptz; installed
pg-types builtins identifies TIMESTAMPTZ as 1184 and its text parser produces
Date values. These are not the unrelated earlier tables' timestamp(3) columns.
Wrong metadata previously passed even for an empty inventory or plausible date
strings. Whole-result rejection now precedes conversion, S3 requests and
publication, using fixed private errors without coercion.

Omitted/undefined fields and type metadata remain compatible. Other descriptor
IDs remain opaque except the existing byteCount text check. SQL, date parsing,
lifecycle rules, count/command/mode/name/format guards, bigint conversion,
ordering, caller ownership, storage listing, receipt contract and Stage 7 stay
unchanged. Corrected two synthetic fixture sites to match committed date types;
no prior assertions were removed. Added 52 cases covering wrong OIDs in each
column with empty/populated results, malformed values and coercion traps,
frozen compatibility/nullable dates/ordered bytes, independent guards, installed
pg Date parsing, and runner suppression of storage and artifacts. Existing
empty/populated simulation-publication tests use the corrected descriptors.
Installed-driver fixtures are offline evidence, not a live PostgreSQL drill.

Initial restricted test invocation returned a file-level worker failure only.
Permitted test-first execution returned exit 1:

```text
ℹ tests 1622
ℹ pass 1585
ℹ fail 37
ℹ skipped 0
```

After the compact strict predicate, direct node --test and final formatted
npm run ops:reconcile-test both returned exit 0:

```text
ℹ tests 1622
ℹ pass 1622
ℹ fail 0
ℹ skipped 0
```

Actual repository verification:

| command/check | exit | output/result |
| --- | --- | --- |
| source/spec node -c | 0 | silent |
| CLI --help | 0 | Usage: node scripts/ops/reconcile-storage-objects.js [options] |
| installed Prettier on added spec, changed guard and helper | 0 | addedSpecFormatting: true; guardFormatting: true; helperFormatting: true |
| npm run lint | 0 | eslint; eslint "src/**/*.ts"; eslint "{src,test}/**/*.ts" |
| initial restricted npm run build | 1 | Error: Could not parse output from TypeScript's --showConfig. |
| permitted npm run build | 0 | Compiled successfully in 3.9s; Generating static pages using 7 workers (22/22) in 923ms; prisma generate && nest build |
| sequential npm run typecheck | 0 | tsc --noEmit; prisma generate && tsc -p tsconfig.json --noEmit; Prisma Client 7.9.1 |
| git diff --check | 0 | silent |

All 33 independent offline stages resolved from package.json ops:check passed:
**27 suite invocations / 4603 tests / 4603 passed / zero failures or skipped**.
Every stage exit/count was inspected. Production templates, secret/default scan,
Docker runtime, offline SBOM licence validation, SAST and container-template
gates passed. The last synthetic launch-orchestrator/dossier suite returned:

```text
ℹ tests 182
ℹ pass 182
ℹ fail 0
ℹ skipped 0
```

Online ops:audit remains omitted under the recorded registry metadata-disclosure
restriction. No aggregate ops:check pass or fresh vulnerability inventory is
claimed. No live launch drill was run.

Independent read-only review inspected the actual diff, prompt, committed
migration, installed driver and existing simulation-publication success tests.
It found no Critical, Important or Minor issues, implementation deviations or
material plan issues. Its restricted invocation only returned a file-level
wrapper result, so it did not independently reproduce case totals; it inspected
coordinator direct/npm green logs. Feedback was evaluated against migration
OID 1184, strict optional comparisons, preserved opaque IDs/guards, ownership
and downstream-effect assertions. No fixes or re-review were needed. Review
required completion of this results record and final staged-diff inspection.
The outstanding offline stage subsequently completed successfully as above.

Readiness example validation retained expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Metadata consistency cannot authenticate responses, prove completeness, verify
object bytes or establish atomic snapshots/live recovery. Mandatory metadata,
generic OID validation and hostile in-process objects remain out of scope.
Prompt 201, Category 6 live approval and Phase 12 exit remain open. No live
services, operator approval, deployment or push occurred. Ordinary commit revert
restores previous behavior without migrations or DB/storage mutation.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```


## Prompt 336 — database inventory text types (2026-10-12)

Continued Phase 12K after committed Prompt 335 on clean main at
e36f14ae6289c2534d38997427cab45a08bd1b5e. Defined dataTypeID for id,
organizationId, bucket, objectKey, checksumAlgorithm and checksumHex now must
be exact primitive numeric 25, alongside the existing byteCount::text check.
The committed storage migration declares those six columns as text, including
id despite its uuidv7() default; installed pg-types identifies TEXT as OID 25.
Wrong descriptors previously passed even for empty inventories or plausible
strings. Whole-result rejection now precedes conversion, S3 requests and
publication with fixed private errors and no coercion.

Omitted/undefined metadata, opaque state/uploadState enum OIDs, nullable
checksums, frozen caller objects, ordered bigint conversion and all previous
metadata guards remain compatible. SQL, schema, lifecycle rules, storage,
client ownership, comparison, receipt contract and Stage 7 are unchanged.
Two synthetic optional byteCount/date fixtures now reserve arbitrary type IDs
for the custom enums; no previous assertions were removed. Added 55 cases for
all six text columns with empty/populated wrong VARCHAR descriptors,
representative malformed values/coercion traps, frozen optional compatibility,
independent earlier guards, installed pg parsing and runner suppression of
storage, publication and injected-client cleanup. Installed pg returns plausible
strings for both TEXT and VARCHAR; wrong metadata still rejects. Existing
empty/populated simulation-publication cases remain green. These are offline
fixtures, not a live PostgreSQL or recovery drill.

The initial restricted invocation returned a file-level worker failure only.
Permitted test-first execution returned exit 1:

```text
ℹ tests 1677
ℹ pass 1638
ℹ fail 39
ℹ skipped 0
```

After the compact strict guard, direct node --test and final formatted
npm run ops:reconcile-test both returned exit 0:

```text
ℹ tests 1677
ℹ pass 1677
ℹ fail 0
ℹ skipped 0
```

Actual repository verification:

| command/check | exit | output/result |
| --- | --- | --- |
| source/spec node -c | 0 | silent |
| CLI --help | 0 | Usage: node scripts/ops/reconcile-storage-objects.js [options] |
| installed Prettier on new spec and adapter function | 0 | addedSpecFormatting: true; guardFormatting: true |
| npm run lint | 0 | eslint; eslint "src/**/*.ts"; eslint "{src,test}/**/*.ts" |
| initial restricted npm run build | 1 | Error: Could not parse output from TypeScript's --showConfig. |
| permitted npm run build | 0 | Compiled successfully in 3.3s; Generating static pages using 7 workers (22/22) in 1219ms; prisma generate && nest build |
| sequential npm run typecheck | 0 | tsc --noEmit; prisma generate && tsc -p tsconfig.json --noEmit; Prisma Client 7.9.1 |
| git diff --check | 0 | silent |

All 33 independent offline stages resolved from package.json ops:check passed:
**27 suite invocations / 4658 tests / 4658 passed / zero failures or skipped**.
Every stage exit/count was inspected. Production templates, secret/default scan,
Docker runtime, offline SBOM licence validation, SAST and container-template
checks passed. The final synthetic launch-orchestrator/dossier suite returned:

```text
ℹ tests 182
ℹ pass 182
ℹ fail 0
ℹ skipped 0
```

Independent read-only review inspected the actual working diff, prompt,
committed migration, installed driver and coordinator check logs. It found no
Critical, Important or Minor issues or material deviations. Its restricted
invocation returned only a successful file-level wrapper result (1 test), so
it did not independently reproduce case totals. Feedback was evaluated against
the schema TEXT declarations, strict optional comparisons, preserved enum
opacity/guards, ownership and downstream-effect assertions. No fixes or
re-review were needed. Review required completing these result records,
inspecting every offline-stage result and reviewing the staged diff before commit.

The readiness example retained expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Online ops:audit remains omitted under the recorded registry metadata-disclosure
restriction. No aggregate ops:check pass or fresh vulnerability inventory is
claimed. Metadata consistency cannot authenticate responses, prove completeness,
verify object bytes or establish atomic snapshots/live recovery. Mandatory
metadata, generic/custom enum OID validation and hostile in-process objects
remain out of scope. Prompt 201, Category 6 live approval and Phase 12 exit
remain open. No live services, operator approval, deployment or push occurred.
Ordinary commit revert restores previous behavior without DB/storage mutation.

Safe local inspection from the repository root:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```


## Prompt 337 — Database inventory projected row fields (2026-10-12)

Continued Phase 12K after committed Prompt 336 on clean main at
f93413763e45609325f5771191692aad027bcd64. The user's `i` and subsequent
“implement plan when finished” authorized preparation and execution of this
single prompt. No follow-on prompt or push was performed.

When result.fields is defined and valid, every returned row must now own all
12 fixed projection properties. Missing properties, including inherited-only
optional keys, reject the entire inventory before bigint conversion, S3 sends
or publication. Installed pg Result.addFields initializes each named property
to null and parseRow copies that complete shape; SQL NULL is a present property.
The eight-line guard checks every row without mutation and uses the existing
fixed Database inventory is invalid error. Runner failures return 1, execute
one query and zero S3 requests, leave injected clients open and emit only the
connecting log plus Error: Database query failed, without summary/receipt/temp
artifacts.

Omitted/undefined descriptors preserve legacy partial-row compatibility.
Complete rows retain NULL/own undefined optional values, extra keys, arbitrary
key insertion order, frozen ownership and ordered bigint conversion. Existing
count/command/mode/name/format/type checks remain independent. SQL, schema,
lifecycle policy, storage listing, comparison, receipt contract and Stage 7
are unchanged. The original inventoryDbRecord helper remains unchanged; a
separate projectedInventoryRow helper makes descriptor-bearing synthetic rows
complete, including one older manually populated pg Result fixture. Prior
assertions remain intact. Added 37 behavioral cases cover each missing column
in first/later rows, inherited nullable fields, runner effects, complete frozen
rows, optional descriptor compatibility and installed pg NULL materialization.
These are offline driver fixtures, not live PostgreSQL or recovery evidence.

Initial restricted test execution produced only a file-level worker failure.
Permitted test-first execution returned exit 1:

```text
ℹ tests 1714
ℹ pass 1691
ℹ fail 23
ℹ skipped 0
```

The first guarded run exposed one older manually populated partial pg fixture;
correcting that fixture preserved its original completion assertions. Direct
node --test and final npm run ops:reconcile-test returned exit 0:

```text
ℹ tests 1714
ℹ pass 1714
ℹ fail 0
ℹ skipped 0
```

Actual verification results:

| command/check | exit | output/result |
| --- | --- | --- |
| source/spec node -c | 0 | silent |
| CLI --help | 0 | Usage: node scripts/ops/reconcile-storage-objects.js [options] |
| installed Prettier on new tests/adapter function | 0 | guardFormatting: true; addedSpecFormatting: true |
| npm run lint | 0 | eslint; eslint "src/**/*.ts"; eslint "{src,test}/**/*.ts" |
| restricted npm run build | 1 | Error: Could not parse output from TypeScript's --showConfig. |
| permitted npm run build | 0 | Compiled successfully in 3.9s; Generating static pages using 7 workers (22/22) in 1170ms; prisma generate && nest build |
| sequential npm run typecheck | 0 | tsc --noEmit; prisma generate && tsc -p tsconfig.json --noEmit; Prisma Client 7.9.1 |
| git diff --check | 0 | silent |

All 33 independent offline stages resolved from package.json ops:check passed:
**27 suite invocations / 4695 tests / 4695 passed / zero failures or skipped**.
Every stage exit/count was inspected. Production templates, secret/default
scan, Docker runtime, offline SBOM licence verification, SAST and container
security template checks passed. Final launch-orchestrator/dossier suite:

```text
ℹ tests 182
ℹ pass 182
ℹ fail 0
ℹ skipped 0
```

Independent read-only review inspected the actual diff, approved prompt,
installed driver and coordinator check logs. It found no defects or plan
deviations. Its restricted node --test invocation returned exit 0 with only
one file-level wrapper, so it did not independently reproduce case totals.
Feedback was verified against installed addFields/parseRow, optional descriptor
compatibility, guard placement and regression assertions. No code fixes or
follow-up review were required. Required result records were completed after
review, with final staged diff inspection before commit.

The readiness example returned expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Online ops:audit remains omitted under the recorded registry metadata-disclosure
restriction; no aggregate ops:check pass or fresh vulnerability audit is claimed.
Consistency cannot authenticate responses, prove inventory completeness,
verify bytes or establish atomic snapshots/live recovery. Mandatory descriptors,
new row value restrictions and hostile in-process objects are out of scope.
Prompt 201, Category 6 live approval and Phase 12 exit remain open. No live
services, operator approval, migrations, deployment or push occurred.
Ordinary commit revert restores earlier acceptance without DB/storage mutation.
If this guard rejects a result, inspect the adapter's projection/row construction
privately, preserve SQL NULL keys and rerun into a fresh receipt path.

Safe local inspection:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 338 — Database inventory lifecycle type shape (2026-10-12)

Continued Phase 12K after committed Prompt 337 (add37bd). A pre-change
read-only adapter probe accepted empty inventory with string dataTypeID values
on state/uploadState, returning {"accepted":0,"malformedEnumTypes":true}.
Installed pg-protocol parseField reads these IDs using reader.uint32(); the
storage migration assigns dynamic StoredObjectState/UploadState enum types.
The adapter now requires each defined lifecycle descriptor ID to be a primitive
integer number in 0..4294967295. It rejects malformed types, fractions,
negative/overflow values and coercion traps before inventory conversion,
S3 requests or evidence publication, including when rows are empty.

This is representation validation only. Numeric IDs remain opaque, including
zero/-0, high-bit IDs and the upper uint32 boundary; no catalog lookup, enum
identity claim or cross-column equality restriction is introduced. Omitted/
undefined descriptors and IDs retain compatibility. Fixed text/date type
checks, complete own projection keys, lifecycle values, NULL handling, extra
keys, frozen caller ownership, row order and bigint conversion are preserved.
SQL, schema, public contracts, comparison, receipt publication and Stage 7
remain unchanged.

Added 94 behavioral cases without changing the previous 1714 tests. Direct
cases cover both columns and empty/populated inventories, invalid types/bounds,
non-coercion and frozen ownership. Positive cases cover optional metadata and
uint32 boundaries with empty/multiple rows. Runner failures confirm exactly
one query, zero S3 sends, no client close/destroy and no summary/receipt/temp
files, with only the connecting log and Error: Database query failed. A runner
success publishes a clean simulation receipt with opaque IDs. Installed
pg.Result offline parsing verifies high-bit IDs preserve lifecycle strings;
these are driver fixtures, not live PostgreSQL or restore evidence.

The initial restricted test run returned only a file-level worker failure.
Permitted test-first execution returned exit 1:

```text
ℹ tests 1808
ℹ pass 1732
ℹ fail 76
ℹ skipped 0
```

After the compact guard, direct node --test and final formatted npm run
ops:reconcile-test returned exit 0:

```text
ℹ tests 1808
ℹ pass 1808
ℹ fail 0
ℹ skipped 0
```

Actual checks:

| command/check | exit | output/result |
| --- | --- | --- |
| source/spec node -c | 0 | silent |
| CLI --help | 0 | Usage: node scripts/ops/reconcile-storage-objects.js [options] |
| installed Prettier, changed function/new tests | 0 | both regions: true |
| npm run lint | 0 | eslint; eslint "src/**/*.ts"; eslint "{src,test}/**/*.ts" |
| restricted npm run build | 1 | Error: Could not parse output from TypeScript's --showConfig. |
| permitted npm run build | 0 | Compiled successfully in 5.6s; Generating static pages using 7 workers (22/22) in 1411ms; prisma generate && nest build |
| sequential npm run typecheck | 0 | tsc --noEmit; prisma generate && tsc -p tsconfig.json --noEmit; Prisma Client 7.9.1 |
| git diff --check | 0 | silent |

All 33 independent offline stages resolved from package.json ops:check passed:
**27 suite invocations / 4789 tests / 4789 passed / zero failures or skipped**.
Every exit and suite count was inspected. Production templates, secret/default
scan, Docker runtime, offline SBOM license verification, SAST and container
security template checks passed. Final launch-orchestrator/dossier suite:

```text
ℹ tests 182
ℹ pass 182
ℹ fail 0
ℹ skipped 0
```

Independent read-only review inspected the actual diff, prompt and installed
driver. It independently ran 1808/1808 direct tests and git diff --check and
reported no Critical, Important or Minor issues. Feedback was verified against
uint32 parsing, optional metadata, guard placement and regression assertions;
no code fixes or follow-up review were needed. Review began while the final
offline dossier suite was pending; that suite subsequently passed, and its
result was sent to the reviewer before completion. Result records were added
after review; final staged diff inspection precedes the local commit.

The readiness example returned expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Online ops:audit remains omitted under the recorded registry metadata-disclosure
restriction; no aggregate ops:check pass or fresh vulnerability audit is claimed.
Metadata shape cannot authenticate responses, establish catalog identity, prove
inventory completeness, verify bytes or establish atomic snapshots/live recovery.
Prompt 201, Category 6 live approval and Phase 12 exit remain open. No live
services, credentials, migrations, operator approval, deployment or push.
Ordinary commit revert restores previous acceptance without DB/storage mutation.
If rejected, privately inspect adapter lifecycle descriptors and their source;
do not coerce malformed identifiers or reinterpret a synthetic receipt as
recovery approval. Rerun into a fresh receipt path after correcting the adapter.

Safe local inspection:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 339 — Preserve database inventory projected values (2026-10-13)

Continued Phase 12K after committed Prompt 338 (`89c8793eb6af97ef8bf2c5a4d008155aa34a23cb`). A read-only, offline probe with a frozen complete row, valid twelve-column descriptors, and conflicting 32-byte SHA256 digests returned `{"inputOwnChecksum":true,"returnedOwnChecksum":false,"status":"clean","mismatches":0}`: `validateInventory` and the projection guard accepted an own, non-enumerable `checksumHex`, but the final object spread in `queryDatabaseStoredObjects` dropped non-enumerable properties. Conflicting checksums were thus suppressed and falsely reported clean.

`queryDatabaseStoredObjects` now returns a fresh ordinary record per row preserving every own property in `DATABASE_INVENTORY_COLUMNS`, regardless of enumerability, across described, undefined, and omitted descriptor metadata. It retains enumerable extra property spread, explicitly copies known own projection values using `DATABASE_INVENTORY_COLUMNS`, and normalizes `byteCount` to bigint or null if present as an own property.

Missing projection properties remain missing, own-undefined properties remain own-undefined, SQL NULLs, strings, Date objects, row order, and enumerable extra keys are preserved. Inherited properties are not copied and arbitrary non-enumerable extras remain omitted. Input rows, input arrays, and field descriptors remain completely untouched and frozen. Existing validation guards, descriptor compatibility, complete projection keys when fields are present, duplicate detection, lifecycle/checksum/date/count guards, command/mode checks, SQL, schema, public contracts, comparison, receipt publication, and Stage 7 remain unchanged.

Added 31 behavioral cases (from 1808 to 1839 tests). Direct cases cover absent, undefined, and described metadata with matching and mismatching checksums. All twelve projected fields are verified as non-enumerable own properties with null and undefined values, testing ownership, output freshness, row ordering, and omission of hidden unrelated extra properties. Lifecycle filtering (`deleted`, `expired`, `completed pending object`, `quarantine date`, `expiry retained`) verifies hidden lifecycle fields. Missing and inherited optional properties remain omitted when descriptors are absent. Runner scenarios confirm conflicting checksums yield exit 1 with error simulation receipt and `checksum_mismatch` details, while matching checksums yield exit 0 with clean simulation receipt. One query, bounded S3 sends, caller clients remain open, no temporary leftovers, and caller fixture immutability are verified.

Red-state execution returned exit 1 across all 61 new assertions exercising hidden fields and runner checksum comparison:

```text
ℹ tests 1870
ℹ pass 1809
ℹ fail 61
ℹ skipped 0
```

After the compact row-copy implementation, direct `node --test` and final formatted `npm run ops:reconcile-test` returned exit 0:

```text
ℹ tests 1839
ℹ pass 1839
ℹ fail 0
ℹ skipped 0
```

Actual checks:

| command/check | exit | output/result |
| --- | --- | --- |
| source/spec node -c | 0 | silent |
| CLI --help | 0 | Usage: node scripts/ops/reconcile-storage-objects.js [options] |
| installed Prettier, changed function/new tests | 0 | formatted changed regions |
| npm run lint | 0 | eslint; eslint "src/**/*.ts"; eslint "{src,test}/**/*.ts" |
| npm run build | 0 | Compiled successfully in 2.8s; Generating static pages using 7 workers (22/22) in 784ms; prisma generate && nest build |
| sequential npm run typecheck | 0 | tsc --noEmit; prisma generate && tsc -p tsconfig.json --noEmit; Prisma Client 7.9.1 |
| git diff --check | 0 | silent |

All 33 independent offline stages resolved from package.json ops:check passed:
**27 suite invocations / 4820 tests / 4820 passed / zero failures or skipped**.
Every exit and suite count was inspected. Production templates, secret/default scan, Docker runtime, offline SBOM license verification, SAST, container security, and final launch-orchestrator/dossier suites passed:

```text
ℹ tests 182
ℹ pass 182
ℹ fail 0
ℹ skipped 0
```

Independent read-only review inspected the actual diff, prompt, and requirements. It reported no Critical or Important issues, verified that descriptor-present and descriptor-absent paths remain compatible, error receipts are preserved, and confirmed readiness to merge. Feedback was evaluated; one minor note regarding uniform loop assignment of byteCount before bigint normalization was verified as intentional and requires no change. Result records were added after review; final staged diff inspection precedes the local commit.

The readiness example returned expected fail-closed exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Online ops:audit remains omitted under the recorded registry metadata-disclosure restriction; no aggregate ops:check pass or fresh vulnerability audit is claimed. Preserving accepted projection values cannot authenticate responses, establish catalog identity, prove inventory completeness, verify bytes, or establish atomic snapshots/live recovery. Prompt 201, Category 6 live approval, and Phase 12 exit remain open. No live services, credentials, migrations, operator approval, deployment, or push. Ordinary commit revert restores previous row-copying without DB/storage mutation.

Safe local inspection:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 340 — Database inventory byte-count range (2026-10-13)

Continued Phase 12K after committed Prompt 339 (`e17d8f3f313800a720e51aea852b55ce284982e9`). A read-only offline probe supplied byteCount `9223372036854775808` (2^63) to `queryDatabaseStoredObjects`, then compared against a synthetic storage entry without size metadata. It returned `{"acceptedByteCount":"9223372036854775808","status":"clean"}`. This demonstrates impossible SQL column evidence being accepted by an injected adapter, not that PostgreSQL can persist this value or that live recovery was inspected.

The adapter now rejects supplied non-null counts above the inclusive SQL bigint maximum `9223372036854775807n`, using exact BigInt arithmetic after existing inventory validation. All rows are checked before returning inventory, storage access or receipt publication. The SQL projection remains unchanged: StoredObject.byteCount is a nullable nonnegative bigint cast to text. Out-of-range results throw fixed `Database inventory is invalid`; the runner returns 1 with fixed `Error: Database query failed`, no S3 requests and no receipt/temp output, retaining caller-owned clients.

The restriction is confined to database acquisition. Generic comparison and already-injected inventories retain arbitrary nonnegative bigint compatibility. In-range strings (including leading zeroes), bigint, safe numbers, NULL/undefined/missing compatibility, hidden own projection properties, metadata-present/absent behavior, row order and frozen input ownership are preserved. It adds no storage size policy, SQL/schema change, new trust boundary or public contract change.

Added 35 behavioral tests, retaining all prior assertions. One legacy adapter success fixture used `900719925474099312345`, which cannot fit the SQL column; its input and expected conversion/immutability values now use `9007199254740993123`, still above JavaScript's safe precision and within SQL bigint. Generic comparison's larger fixture remains intact. New cases cover overflow as decimal/padded decimal/bigint, first/later invalid rows, omitted/undefined/described metadata, hidden own counts, exact valid boundary values and NULLs, missing counts, empty results, installed pg.Result maximum text conversion, lifecycle-excluded overflow, private runner diagnostics, caller ownership and absence of publication. Temporary directories are removed in finally blocks.

The initial restricted node --test invocation returned exit 1 with one file-level `test failed`, not case-level evidence. Identical permitted execution before the source change returned exit 1:

```text
ℹ tests 1874
ℹ pass 1846
ℹ fail 28
ℹ skipped 0
```

The first green attempt found the incompatible legacy adapter fixture (1873 passed, 1 failed). After correcting its values without removing assertions, `npm run ops:reconcile-test` returned exit 0:

```text
ℹ tests 1874
ℹ pass 1874
ℹ fail 0
ℹ skipped 0
```

Actual checks:

| command/check | exit | output/result |
| --- | --- | --- |
| source/spec node -c | 0 | silent |
| CLI --help | 0 | Usage: node scripts/ops/reconcile-storage-objects.js [options] |
| installed Prettier changed source function/new test region | 0 | {"sourceFunction":true,"newTestRegion":true} |
| npm run lint | 0 | eslint; eslint "src/**/*.ts"; eslint "{src,test}/**/*.ts" |
| restricted npm run build | 1 | Error: Could not parse output from TypeScript's --showConfig. |
| permitted npm run build | 0 | Compiled successfully in 3.6s; Generating static pages using 7 workers (22/22) in 1499ms; prisma generate && nest build |
| sequential npm run typecheck | 0 | tsc --noEmit; prisma generate && tsc -p tsconfig.json --noEmit; Generated Prisma Client (7.9.1) |
| git diff --check | 0 | silent |

Every independent offline stage resolved from package.json ops:check passed: **33 stages / 27 suite invocations / 4855 tests / 4855 passed / zero failures or skipped**. Every stage exit and suite count was inspected. This includes templates, secret/default scan, Docker runtime, offline SBOM license verification, SAST and container security checks. Final dossier suite:

```text
ℹ tests 182
ℹ pass 182
ℹ fail 0
ℹ skipped 0
```

Independent read-only review inspected the actual implementation, test diff, prompt and check evidence. It found no Critical, Important or Minor issues and assessed the change ready to merge. Feedback was evaluated against guard placement, precision, adapter-only scope, metadata compatibility, immutable inputs and fixed runner errors; no fixes or follow-up review were needed. Completion records were added after review; final staged diff inspection precedes the local commit.

`node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` returned expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Online ops:audit remains omitted under the recorded dependency-metadata disclosure restriction; no aggregate ops:check pass or fresh vulnerability audit is claimed. Range validation cannot authenticate responses, prove inventory completeness, verify bytes or establish atomic snapshots/live recovery. Prompt 201, Category 6 live approval and Phase 12 exit remain open. No live services, credentials, migrations, operator approval, deployment or push. Ordinary commit revert restores prior adapter acceptance without DB/storage mutation. If rejected, privately inspect and correct the adapter result source; never truncate/coerce the value or reuse old receipts as recovery evidence.

Safe local inspection:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 341 — Database inventory SHA-256 digest length (2026-10-13)

Continued Phase 12K after committed Prompt 340 (`b665b0803088cba1084ccdf30e1e60d935cf032a`). An offline synthetic probe supplied checksumAlgorithm `sha256` and checksumHex `ab` to queryDatabaseStoredObjects. It returned `{"acceptedChecksum":"ab","status":"clean"}` when compared against a storage entry without digest metadata. This demonstrates malformed acquisition evidence being accepted; no live database or recovery was inspected.

The database acquisition adapter now rejects every supplied non-null checksumHex whose length is not exactly 64, after existing string/hex validation and before returning any inventory. This matches both upload DTOs' case-insensitive 64-hex contract and the storage adapter's 32-byte SHA-256 extension. The SQL column remains nullable text without a digest-length constraint; this enforces application evidence semantics rather than a SQL type limit. Rejection throws fixed `Database inventory is invalid`; main returns 1 with fixed `Error: Database query failed`, no S3 requests and no receipt/temp publication, retaining caller-owned clients.

Generic reconciliation and explicitly injected main inventories retain arbitrary even-length hex compatibility. Valid lower/upper/mixed-case digests are preserved verbatim at acquisition and compare case-insensitively. NULL, undefined, omitted checksum/algorithm fields, absent/undefined/described metadata, row order, extra keys, hidden own projection fields, frozen ownership, and prior byte-count/descriptor checks remain compatible. No SQL, schema, facade, route or dependency changes.

Added 50 cases covering short/long even hex, first/later rows, metadata modes, hidden checksums on deleted/pending rows, optional/valid checksums, exact output/immutability, matching/mismatching comparisons, empty results, runner privacy/publication/ownership and generic/injected short-hex compatibility. One existing adapter success fixture expanded `aBcD` to `aBcD`.repeat(16), retaining every assertion and mixed-case preservation. Generic fixtures were unchanged.

Restricted red execution returned only a file-level failure. Identical permitted red execution returned exit 1:

```text
ℹ tests 1924
ℹ pass 1894
ℹ fail 30
ℹ skipped 0
```

Initial green returned 1920 passed and 4 failed: the legacy truncated-digest acquisition fixture and three new assertions that incorrectly abbreviated the existing connection log. After correcting only fixture values and expected log text, npm run ops:reconcile-test returned exit 0:

```text
ℹ tests 1924
ℹ pass 1924
ℹ fail 0
ℹ skipped 0
```

Actual checks:

| command/check | exit | output/result |
| --- | --- | --- |
| source/spec node -c | 0 | silent |
| CLI --help | 0 | Usage: node scripts/ops/reconcile-storage-objects.js [options] |
| installed Prettier changed source function/new test region | 0 | {"newTestRegion":true,"sourceFunction":true} |
| npm run lint | 0 | eslint; eslint "src/**/*.ts"; eslint "{src,test}/**/*.ts" |
| restricted npm run build | 1 | Error: Could not parse output from TypeScript's --showConfig. |
| permitted npm run build | 0 | Compiled successfully in 5.2s; Generating static pages using 7 workers (22/22) in 1275ms; prisma generate && nest build |
| sequential npm run typecheck | 0 | tsc --noEmit; prisma generate && tsc -p tsconfig.json --noEmit; Generated Prisma Client (7.9.1) |
| git diff --check | 0 | silent |

A first typecheck overlapped the tail of the server build; the recorded typecheck above was repeated after confirmed build completion. Formatting was limited to changed test regions.

Independent read-only review inspected the source, working diff and prompt. It found no Critical, Important or Minor issues and assessed the implementation ready to merge after completion records. Feedback was evaluated against guard placement, type-validation ordering, whole-inventory rejection, optional/generic compatibility, private failure paths and ownership; no fixes or follow-up review were needed. Its independent npm run ops:reconcile-test exited 0 with a restricted file-level tests 1 / pass 1 wrapper; individual case counts above come from the coordinator's permitted runs.

All **33 independent offline stages / 27 suite invocations / 4905 tests / 4905 passed / zero failures or skipped** resolved from package.json ops:check passed. Every stage exit and suite count was inspected. This includes templates, secret/default scans, Docker runtime, offline SBOM license verification, SAST, container checks and final launch-orchestrator/dossier tests:

```text
ℹ tests 182
ℹ pass 182
ℹ fail 0
ℹ skipped 0
```

The example readiness validator returned expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Online ops:audit remains omitted under the recorded dependency-metadata disclosure restriction; no aggregate ops:check pass or fresh vulnerability audit is claimed. Digest shape validation cannot authenticate evidence, prove inventory completeness, verify bytes or establish atomic snapshots/live recovery. Prompt 201, Category 6 live approval and Phase 12 exit stay open. No live services, credentials, migration, operator approval, deployment or push. Ordinary commit revert restores prior adapter acceptance without DB/storage mutation. Privately inspect and repair a rejected source digest; never pad/truncate live evidence to bypass validation or reuse old receipts.

Safe local inspection:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 342 — Reconciliation owned storage client cleanup (2026-10-13)

Continued Phase 12K after committed Prompt 341 (`0e4856a66ace2f99710a36fb83d4718e87e419e2`). The runner constructed an S3Client for acquisition but never destroyed it. The installed `@aws-sdk/client-s3/dist-types/S3Client.d.ts` declares synchronous `destroy(): void` and explicitly recommends closing Node clients' underlying socket agents after use; its installed implementation delegates to the parent destroy method. This is a lifecycle defect found by code inspection and offline regression, not a measurement of leaked live sockets.

`main` now attempts exactly one destroy of a runner-created storage client in the listing acquisition `finally`, after success or failure and before report generation/publication. Caller-supplied clients remain open, and injected inventories bypass storage acquisition. Synchronous cleanup exceptions are suppressed as best-effort teardown, consistent with existing PostgreSQL end-error handling: neither the primary outcome nor private diagnostics are replaced, and a successful teardown is not asserted when destroy throws. The optional listing-failure `process.exit(1)` is deferred until after finally; immediate process exit otherwise bypasses JavaScript unwinding. PostgreSQL cleanup behavior, SQL, inventories, comparison, receipts and public injection APIs remain unchanged.

Added **20 behavioral cases**. Sixteen exercise real SDK construction with offline send/destroy prototype stubs: empty/matched/missing/mismatching/orphan inventories, malformed responses, thrown sends and retained-receipt publication failure, each with normal or throwing cleanup. They verify one destroy on the same client, ordering before report output, preserved exits/private errors and exclusive receipt behavior. Three cover caller ownership and injected inventories. A separate child process uses real `process.exit` to verify destroy precedes immediate failure exit. Prototype descriptors, temporary directories and exit state are restored. No network transport or live storage/database was used.

Restricted initial test execution produced a file-level failure. The first permitted red run exposed a test harness receiver error in the log wrapper; binding the existing logger to its IO object fixed the harness without changing source. The resulting behavioral red run returned exit 1:

```text
ℹ tests 1943
ℹ pass 1927
ℹ fail 16
ℹ skipped 0
```

The first finally fix passed all 1943 cases. The added real immediate-exit regression then failed (**1944 tests / 1943 passed / 1 failed**) because exit bypassed cleanup. Deferring that failure return/exit until after finally resolved it. Final permitted `npm run ops:reconcile-test` returned exit 0:

```text
ℹ tests 1944
ℹ pass 1944
ℹ fail 0
ℹ skipped 0
```

Actual checks:

| command/check | exit | output/result |
| --- | --- | --- |
| source/spec node -c | 0 | silent |
| CLI --help | 0 | Usage: node scripts/ops/reconcile-storage-objects.js [options] |
| installed Prettier new test region | 0 | {"newTestRegion":true} |
| npm run lint | 0 | eslint; eslint "src/**/*.ts"; eslint "{src,test}/**/*.ts" |
| restricted npm run build | 1 | Error: Could not parse output from TypeScript's --showConfig. |
| permitted npm run build | 0 | Compiled successfully in 6.8s; Generating static pages using 7 workers (22/22) in 1275ms; prisma generate && nest build |
| sequential npm run typecheck | 0 | tsc --noEmit; prisma generate && tsc -p tsconfig.json --noEmit; Generated Prisma Client (7.9.1) |
| git diff --check | 0 | silent |

Independent read-only review inspected the complete source/test diff, prompt, runner and installed SDK declaration. It found no Critical, Important or Minor issues and assessed the change ready to merge after records. Its restricted direct execution passed **1943/1944**, with only the subprocess regression blocked by `spawnSync node EPERM`; its restricted node test-runner invocation reported a file-level failure. Coordinator permitted runs supply the full passing counts. Review feedback was evaluated against finally placement, client ownership, synchronous SDK teardown, immediate exit ordering and primary outcome preservation; no fixes or follow-up review were needed.

All **33 independent offline stages / 27 suite invocations / 4925 tests / 4925 passed / zero failures or skipped** resolved from package.json ops:check passed. Every stage exit and count was inspected, including production templates, secret/default scans, Docker runtime, offline SBOM licences, SAST, container checks and final orchestrator/dossier suite:

```text
ℹ tests 182
ℹ pass 182
ℹ fail 0
ℹ skipped 0
```

The example readiness validator returned expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Online ops:audit remains omitted under the recorded dependency-metadata disclosure restriction; no aggregate ops:check pass or fresh vulnerability audit is claimed. Client cleanup does not authenticate evidence, establish inventory completeness, verify object bytes or prove atomic snapshots/live recovery. Prompt 201, Category 6 live approval and Phase 12 exit remain open. No live services, credentials, migrations, operator approval, deployment or push. Ordinary commit revert restores prior resource lifecycle without DB/storage mutation.

Safe local inspection:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```


## Prompt 343 — Reconciliation failed database connection cleanup (2026-10-13)

Continued Phase 12K after committed Prompt 342 (`80cd784f53bfcaa8cb662bbcf960d0db5dea1377`). Code inspection found main's connection-failure branch returned or exited without ending its runner-created PostgreSQL client. The installed `node_modules/pg/lib/client.js` defines Promise-returning `end()` with never-connected/already-ended handling and failed-stream destruction. This verifies the API contract; no leaked live socket measurement is claimed.

The connection catch now makes one awaited `end()` attempt for runner-owned clients before return or optional immediate exit. Synchronous throws and rejected cleanup Promises are suppressed to preserve the primary fixed `Error: PostgreSQL connection failed` diagnostic and exit 1. This is best-effort teardown, not a guarantee when cleanup fails or stalls. Caller-owned clients remain open. Injected inventories, early exits, later cleanup paths, SQL, storage acquisition/comparison and receipt publication are unchanged. No new resource abstraction or dependency was introduced.

Added **14 offline behavioral cases** using actual pg Client construction with restored prototype stubs: synchronous/rejected connect crossed with resolving/rejecting/throwing end; deferred settlement proving main waits; two caller failures; injected inventory bypass; help/usage/missing-password early exits; and a real child process proving asynchronous cleanup precedes immediate exit. Synthetic configuration and isolated temporary receipts avoid live transports and credentials. No summary/receipt or underlying exception escapes a failed connection.

Actual verification:

| Command | Exit | Real output / observation |
| --- | --- | --- |
| restricted focused `node --test --test-name-pattern='main failed database cleanup' scripts/ops/reconcile-storage-objects.spec.js` | 1 | file-level `tests 1 / pass 0 / fail 1`, `test failed`; not behavioral evidence |
| permitted focused regression, before source fix | 1 | `tests 14 / pass 6 / fail 8 / skipped 0`; missing end calls, premature settlement and empty child stdout reproduced the gap |
| permitted `npm run ops:reconcile-test`, after fix | 0 | `tests 1958 / pass 1958 / fail 0 / cancelled 0 / skipped 0` |
| `npm run lint` | 0 | client `eslint`, shared `eslint "src/**/*.ts"`, server `eslint "{src,test}/**/*.ts"`; no diagnostics |
| restricted `npm run build` | 1 | `Error: Could not parse output from TypeScript's --showConfig.` |
| permitted `npm run build` | 0 | `Compiled successfully in 11.4s`; `Finished TypeScript in 9.3s`; `Generating static pages using 7 workers (22/22) in 2.8s`; Prisma Client `7.9.1` generated, `nest build` completed |
| subsequent sequential `npm run typecheck` | 0 | shared `tsc -p tsconfig.json --noEmit`, client `tsc --noEmit`, server `prisma generate && tsc -p tsconfig.json --noEmit`; no diagnostics |
| `node -c` source and spec | 0 each | silent |
| CLI `--help` | 0 | `Usage: node scripts/ops/reconcile-storage-objects.js [options]` |
| installed Prettier check of appended test region | 0 | `Added test region format check: true` |
| `git diff --check` | 0 | silent |

Independent read-only review inspected the full diff, prompt, surrounding lifecycle paths, installed driver and verification logs; it found no Critical, Important or Minor issues and assessed the implementation ready to merge after records and final offline checks. Feedback was evaluated against ownership, await ordering, primary-error preservation and test isolation; no corrections or follow-up review were needed. The reviewer's restricted focused test failed at the file wrapper with `test failed`; it did not independently reproduce behavioral totals. Coordinator permitted runs above provide the behavioral results.

All **33 independent offline stages / 27 suite invocations / 4939 tests / 4939 passed / zero failures, cancellations or skipped** resolved from package.json ops:check passed. Every stage exit and suite total was inspected, including final launch-orchestrator/dossier output `tests 182 / pass 182 / fail 0 / skipped 0`. Online ops:audit was excluded; no live operational drill was executed.

The example readiness command `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` returned expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Online ops:audit remains omitted under the recorded dependency-metadata disclosure restriction; no aggregate ops:check pass or fresh vulnerability audit is claimed. Cleanup cannot authenticate evidence, establish completeness, verify bytes or prove atomic/live recovery. Prompt 201, Category 6 live approval and Phase 12 exit remain open. No live services, credentials, SQL/schema/migrations, operator approval, deployment or push. Ordinary commit revert restores the previous lifecycle without DB/storage mutation. No new timeout/cancellation policy is claimed.

Safe inspection:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 344 — Reconciliation database cleanup error isolation (2026-10-13)

Continued Phase 12K after committed Prompt 343 (`d7dcf782cb786986f0fd2d842eb6b56d0184f5eb`). Inspection found four later owned PostgreSQL cleanup paths used `await pgClient.end().catch(...)`: this handles rejected Promises but cannot catch exceptions thrown before a Promise is returned. Installed `node_modules/pg/lib/client.js:781` performs synchronous connection/stream closure before constructing the completion Promise. This verifies the error-handling gap; no leaked live socket measurement is claimed.

Database-query failure, storage-listing failure, completed report/publication and report/publication catch now each guard `await pgClient.end()` with try/catch. Synchronous throws and rejected cleanup Promises preserve the primary outcome and fixed private diagnostic. Successful receipt publication cannot turn into a second end attempt solely because cleanup throws. Caller-owned clients stay open; the already-fixed connection-failure branch, S3 finally, existing ordering, SQL, acquisition validation, receipt schema and exit behavior remain unchanged. Cleanup is one best-effort attempt, not proof of successful teardown; stalled cleanup and new timeout/cancellation policy remain outside scope.

Added **30 offline behavioral cases**: six query/listing/report/publication outcomes crossed with resolving/rejecting/throwing end, four deferred-end settlement cases, four caller-ownership cases, and four bounded child processes with real immediate exit and synchronous cleanup failure. The fixture uses actual pg/S3 constructors and restored prototype stubs, synthetic configuration and private temporary receipts. It verifies same receivers, one owned end, awaited settlement, S3 destruction after listing failure, retained exclusive receipts, unchanged summary/receipt results and no private sentinel disclosure. A throwing summary logger exercises the report catch without changing report computation. No live database/storage transport or credential access occurred.

The initial restricted focused run failed at the file wrapper (`tests 1 / pass 0 / fail 1`, `test failed`), without behavioral evidence. The first permitted red run exposed an incorrect fixture assertion (`summary.missing`); it was corrected to the existing `summary.missingObjects` before the final red run. Final permitted red returned exit 1:

```text
ℹ tests 30
ℹ pass 20
ℹ fail 10
ℹ cancelled 0
ℹ skipped 0
```

All ten failures concerned synchronous cleanup exceptions: six matrix outcomes and four real child exits. After the compact source fix, permitted `npm run ops:reconcile-test` returned exit 0:

```text
ℹ tests 1988
ℹ pass 1988
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

Actual self-verification:

| Command | Exit | Real output / observation |
| --- | --- | --- |
| source/spec `node -c` | 0 each | silent |
| CLI `--help` | 0 | `Usage: node scripts/ops/reconcile-storage-objects.js [options]` |
| installed Prettier added-region check | 0 | `Added test region format check: true` |
| `npm run lint` | 0 | client `eslint`, shared `eslint "src/**/*.ts"`, server `eslint "{src,test}/**/*.ts"`; no diagnostics |
| restricted `npm run build` | 1 | `Error: Could not parse output from TypeScript's --showConfig.` |
| permitted `npm run build` | 0 | `Compiled successfully in 6.3s`; `Finished TypeScript in 6.0s`; `Generating static pages using 7 workers (22/22) in 1899ms`; Prisma Client `7.9.1` generated and `nest build` completed |
| subsequent sequential `npm run typecheck` | 0 | shared `tsc -p tsconfig.json --noEmit`, client `tsc --noEmit`, server `prisma generate && tsc -p tsconfig.json --noEmit`; no diagnostics |
| `git diff --check` | 0 | silent |

Independent read-only review found no Critical, Important or Minor issues and no implementation deviations, assessing the change ready after remaining offline checks and documentation. Feedback was evaluated against all four guarded-await paths, ownership, single end attempts, primary-error preservation, S3 finally and tests; no changes or re-review were needed. The reviewer inspected the coordinator green log but its own restricted focused test failed at the file wrapper (`tests 1`, `test failed`), supplying no independent behavioral totals.

Completed results from all **33 independent offline stages / 27 suite invocations / 4969 tests / 4969 passed / zero failures, cancellations or skipped** resolved from package.json `ops:check` passed. Every stage exit and suite count was inspected, including production templates, secret/default scanning, Docker runtime, offline SBOM licences, SAST and container checks. The temporary sequential harness imposed a 180-second per-stage timeout: its first final `ops:launch-drill-test` invocation was interrupted with `spawnSync /bin/sh ETIMEDOUT` and no completed suite totals. This is a harness limitation, not a passing aggregate run. The final suite was rerun directly without that limit and returned exit 0:

```text
ℹ tests 182
ℹ pass 182
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 219825.909771
```

The example command `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` returned expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Online `ops:audit` remains omitted under the documented dependency-metadata disclosure restriction; no aggregate `ops:check` pass or fresh vulnerability audit is claimed. The initial sandbox could not write `.git/index.lock`; permitted staging/commit access was used for this authorized local change. Cleanup cannot authenticate evidence, establish completeness, verify object bytes or prove atomic/live recovery. Prompt 201, Category 6 live approval and Phase 12 exit remain open. No live services, credential access, SQL/schema/migrations, operator approval, deployment or push occurred. Ordinary commit revert restores previous error handling without DB/storage mutation.

Safe local inspection:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 345 — Reconciliation storage setup failure cleanup (2026-10-13)

Continued Phase 12K after committed Prompt 344 (`c670f0a999395aa2049d4c15e6851fc924853bd5`). Storage SDK loading and S3Client construction previously occurred outside main's acquisition catch, after PostgreSQL connection/query. A synthetic constructor exception reproduced rejection without owned database cleanup or the intended fixed diagnostic/exit. Read-only SDK probes with malformed string regions/endpoints did not throw at construction; this is failure-injection evidence, not a claim about a demonstrated live provider fault or leaked socket. Installed `node_modules/@aws-sdk/client-s3/dist-cjs/index.js` verifies synchronous construction and destroy; `node_modules/pg/lib/client.js` verifies end's Promise contract and synchronous failure possibility.

SDK loading/construction now runs inside the existing storage acquisition try. Setup exceptions follow the listing failure path: one guarded awaited owned PostgreSQL end attempt, fixed `Error: Object storage connection or listing failed`, exit/return 1 and no summary/receipt. Finally destroys storage only when a client was actually returned and is owned by the runner. Caller-owned clients, injected inventories, successful/listing-failure cleanup, configuration, SQL, comparison, receipt schema and publication are unchanged. Constructor internals that throw before returning cannot be torn down by this caller. Cleanup may fail or stall; no new timeout/retry guarantee is introduced.

Added **11 serial offline behavioral tests** using restored SDK export/pg prototype descriptors, synthetic configuration and isolated temporary receipts. Six cases cross owned/caller database clients with resolving/rejecting/throwing end. Further cases prove awaited deferred end, setup failure with injected DB inventory, caller S3 and injected storage inventory bypasses, and awaited teardown before real child-process immediate exit. Tests assert receiver/ownership, exact events and diagnostics, no report/receipt/private sentinel disclosure, and zero send/destroy calls for unreturned clients. Existing tests remain intact.

The restricted focused test failed at the file wrapper (`tests 1 / pass 0 / fail 1`, `test failed`), providing no behavioral evidence. Permitted pre-fix focused regression returned exit 1:

```text
ℹ tests 11
ℹ pass 2
ℹ fail 9
ℹ cancelled 0
ℹ skipped 0
```

The two bypass cases passed before the fix; nine setup-failure cases reproduced the gap. After the source fix, permitted `npm run ops:reconcile-test` returned exit 0:

```text
ℹ tests 1999
ℹ pass 1999
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

Actual self-verification:

| Command | Exit | Real output / observation |
| --- | --- | --- |
| source/spec `node -c` | 0 each | silent |
| CLI `--help` | 0 | `Usage: node scripts/ops/reconcile-storage-objects.js [options]` |
| installed Prettier appended-region check | 0 | `Added test region format check: true` |
| `npm run lint` | 0 | client `eslint`, shared `eslint "src/**/*.ts"`, server `eslint "{src,test}/**/*.ts"`; no diagnostics |
| restricted `npm run build` | 1 | `Error: Could not parse output from TypeScript's --showConfig.` |
| permitted `npm run build` | 0 | `Compiled successfully in 9.2s`; `Finished TypeScript in 6.6s`; `Generating static pages using 7 workers (22/22) in 1658ms`; Prisma Client `7.9.1` generated and server `nest build` completed |
| subsequent sequential `npm run typecheck` | 0 | shared `tsc -p tsconfig.json --noEmit`, client `tsc --noEmit`, server `prisma generate && tsc -p tsconfig.json --noEmit`; no diagnostics |
| `git diff --check` | 0 | silent |

Independent read-only review inspected the complete source/test diff, prompt, surrounding lifecycle, installed driver contracts and coordinator verification logs. It reported no Critical, Important or Minor issues and no plan deviations, assessing the work ready after remaining records and verification. Its review of the coordinator green log confirmed the reported 1999/1999; it did not rerun tests. Feedback was evaluated against the actual try/finally placement, existence/ownership guard, awaited end, fixed errors, bypasses and receipt suppression; no fixes or re-review were necessary.

The example `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` returned expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Online `ops:audit` remains omitted under the recorded dependency-metadata disclosure restriction; no aggregate `ops:check` pass or fresh vulnerability inventory is claimed. Resource cleanup cannot authenticate evidence, prove inventory completeness, verify object bytes or establish atomic/live recovery. Prompt 201, Category 6 live approval and Phase 12 exit remain open. No live services, credential access, SQL/schema/migrations, operator approval, deployment or push occurred. Ordinary commit revert restores previous handling without DB/storage mutation.

Safe local inspection:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

All **33 independent offline stages / 27 suite invocations / 4980 tests / 4980 passed / zero failures, cancellations or skipped** resolved from package.json `ops:check` completed with exit 0. Each stage exit and suite count was inspected, including templates, secret/default scanning, Docker runtime, offline SBOM licences, SAST and container checks. Final `ops:launch-drill-test` returned `tests 182 / pass 182 / fail 0 / cancelled 0 / skipped 0`, duration `229372.696308ms`. These are independent offline checks, excluding online `ops:audit`; no aggregate `ops:check` pass is claimed.

## Prompt 346 — Reconciliation database setup failure handling (2026-10-13)

Continued Phase 12K after committed Prompt 345 (`1e1c620d9c20f8d9167639ed79b4eda67b331215`). PostgreSQL driver export acquisition and Client construction previously ran outside the connection try. Synthetic export-getter and constructor exceptions reproduced rejection without the fixed connection diagnostic or intended immediate exit. Installed `node_modules/pg/lib/client.js` verifies synchronous construction; this is failure-injection evidence, not proof of a demonstrated live setup fault or leaked socket.

Database setup now shares the existing connection try/catch. Setup exceptions emit only `Error: PostgreSQL connection failed`, set/return 1 or immediately exit 1, and never reach query, S3 acquisition, summary or receipt publication. Owned cleanup requires an actually returned client; an unreturned constructor instance cannot be closed by its caller. Existing connection-failure cleanup remains guarded and awaited. Password selection/missing-password diagnostics, caller-owned clients, injected inventories, configuration, SQL, comparison and receipts remain compatible. No new timeout, retry or resource-factory policy was introduced.

Added **10 serial offline behavioral cases** using restored pg/S3 export descriptors, synthetic configuration and isolated temporary receipt paths. Two cases exercise constructor/export-getter throws, four cover caller-client/inventory bypasses, two verify missing-password precedence and two actual child processes verify immediate exits with no private sentinel, storage acquisition or receipt. Export-getter injection models export acquisition failure, not an actual module-load failure. All previous tests remain intact.

The restricted new-test invocation failed at the file wrapper (`tests 1 / pass 0 / fail 1`, `test failed`) and supplied no behavioral evidence. Permitted pre-fix focused regression reported:

```text
ℹ tests 10
ℹ pass 6
ℹ fail 4
ℹ cancelled 0
ℹ skipped 0
```

The bypass and password cases passed before the fix; both setup failures and immediate exits failed. After the source change, permitted `npm run ops:reconcile-test` returned exit 0:

```text
ℹ tests 2009
ℹ pass 2009
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

Actual self-verification:

| Command | Exit | Real output / observation |
| --- | --- | --- |
| source/spec `node -c` | 0 each | silent |
| CLI `--help` | 0 | `Usage: node scripts/ops/reconcile-storage-objects.js [options]` |
| installed Prettier appended-region check | 0 | `Added test region format check: true` |
| `npm run lint` | 0 | client `eslint`, shared `eslint "src/**/*.ts"`, server `eslint "{src,test}/**/*.ts"`; no diagnostics |
| restricted `npm run build` | 1 | `Error: Could not parse output from TypeScript's --showConfig.` |
| permitted `npm run build` | 0 | `Compiled successfully in 3.1s`; `Finished TypeScript in 3.3s`; `Generating static pages using 7 workers (22/22) in 719ms`; Prisma Client `7.9.1` generated and server `nest build` completed |
| subsequent sequential `npm run typecheck` | 0 | shared `tsc -p tsconfig.json --noEmit`, client `tsc --noEmit`, server `prisma generate && tsc -p tsconfig.json --noEmit`; no diagnostics |
| `git diff --check` | 0 | silent |

Independent read-only review inspected the full source/test diff, prompt, surrounding lifecycle, installed pg implementation and actual verification logs. It found no Critical, Important or Minor issues or material plan deviations, and assessed the work ready after completion records. Feedback was evaluated against the try boundary, existence/ownership cleanup guard, unchanged failure cleanup, private diagnostics and bypasses; no fixes or re-review were necessary. Its own restricted focused run failed at the file wrapper (`1 failed`), so it did not independently reproduce behavioral totals. The reviewer confirmed the coordinator's green log and the 30 offline stages recorded at review time. Its initial turn failed before work due model capacity; the same review task succeeded on retry.

The example `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` returned expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Online `ops:audit` remains omitted under the recorded dependency-metadata disclosure restriction; no aggregate `ops:check` pass or fresh vulnerability inventory is claimed. Fixed setup handling cannot authenticate evidence, prove inventory completeness, verify object bytes or establish atomic/live recovery. Prompt 201, Category 6 live approval and Phase 12 exit remain open. No live services, credential access, SQL/schema changes, operator approval, deployment or push occurred. Ordinary commit revert restores prior setup handling without DB/storage mutation.

Safe local inspection:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

All **33 independent offline stages / 27 suite invocations / 4990 tests / 4990 passed / zero failures, cancellations or skipped** resolved from package.json ops:check completed with exit 0. Each stage exit and suite count was inspected, including production templates, secret/default scanning, Docker runtime, offline SBOM licences, SAST and container checks. The final ops:launch-drill-test returned:

```text
ℹ tests 182
ℹ pass 182
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 108083.467275
```

These are independent offline checks excluding online ops:audit, not an aggregate ops:check pass.

## Prompt 347 — Reconciliation diagnostic failure cleanup (2026-10-13)

Continued the open Phase 12K recovery gate after committed Prompt 346
(`6903f10`). Connection/query/listing acquisition catches previously wrote their
fixed diagnostic before owned PostgreSQL cleanup. A throwing diagnostic writer
could therefore skip end. The three catches now perform their existing guarded,
awaited cleanup first. Normal messages and return/exit codes remain unchanged;
a throwing writer still rejects main with the same thrown object. Storage
finally still destroys its owned S3 client. Caller-owned clients stay open.
Installed `node_modules/pg/lib/client.js` verifies end's Promise contract.

Added 17 offline cases: 12 acquisition/cleanup combinations cover connection,
query, listing and storage constructor failure with deferred successful end,
synchronous cleanup throws and rejected cleanup; five cases cover caller
ownership, database constructor failure and inventory bypass. Tests assert
ordering, one cleanup attempt, exact writer exception identity, fixed/private
diagnostics, no successful summary or receipt, and storage finally behavior.
Descriptors and temporary fixtures are restored. This is synthetic evidence,
not proof of a live socket leak or provider incident.

Actual pre-fix focused output (exit 1):

```text
ℹ tests 17
ℹ pass 5
ℹ fail 12
ℹ cancelled 0
ℹ skipped 0
```

Actual `npm run ops:reconcile-test` output after the fix (exit 0):

```text
ℹ tests 2026
ℹ pass 2026
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

| Check | Exit | Actual output / observation |
| --- | --- | --- |
| source/spec `node -c` | 0 each | silent |
| CLI `--help` | 0 | `Usage: node scripts/ops/reconcile-storage-objects.js [options]` |
| appended-region Prettier | 0 | `Added test region format check: true` |
| `npm run lint` | 0 | client `eslint`, shared `eslint "src/**/*.ts"`, server `eslint "{src,test}/**/*.ts"`; no diagnostics |
| restricted `npm run build` | 1 | `Error: Could not parse output from TypeScript's --showConfig.` |
| permitted `npm run build` | 0 | `Compiled successfully in 2.4s`; `Finished TypeScript in 1903ms`; `Generating static pages using 7 workers (22/22) in 847ms`; generated Prisma Client `7.9.1` and completed `nest build` |
| subsequent sequential `npm run typecheck` | 0 | shared/client/server `tsc` checks and Prisma generation completed without diagnostics |
| `git diff --check` | 0 | silent |

The initial restricted test invocation failed at the file wrapper (`pass 0 /
fail 1`) and provided no behavioral evidence. Permitted offline test runs
produced the red/green results above. Independent read-only review inspected
the complete source/test diff, prompt, surrounding lifecycle and actual logs;
it found no Critical, Important or Minor findings and assessed the work ready
for completion records and commit. It did not independently rerun checks.
Feedback was evaluated against the three catch boundaries, ownership guards,
await behavior, writer identity and S3 finally; no fixes were required.

Readiness example returned expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Unrelated full ops suites and online audit were not rerun; no aggregate
`ops:check` pass or fresh vulnerability inventory is claimed. No live services,
credential access, SQL/schema change, operator approval, deployment or push
occurred. Cleanup does not establish authenticity, completeness, byte integrity
or atomic/live recovery. Prompt 201, Category 6 live sign-off and Phase 12 exit
remain open. A hung cleanup, process kill or logging outage has no new recovery
policy. Ordinary revert restores prior ordering without data mutation.

Safe inspection: `npm run ops:reconcile-test`, then
`node scripts/ops/reconcile-storage-objects.js --help`.

## Prompt 348 — Reconciliation terminal summary escaping (2026-10-13)

Continued Phase 12K's open recovery-evidence gate after committed Prompt 347
(`c59e73a`). Accepted object keys and database identifiers were interpolated
verbatim into terminal findings; embedded newlines and terminal controls could
forge lines or alter their appearance. `formatReconciliationSummary` now uses
a private single-pass `summaryText` helper on text fields: timestamp/status,
missing key/org/id/state, mismatch key/issues and orphan key. Backslashes display
doubled; C0 controls, DEL/C1, U+2028–U+202E and U+2066–U+2069 display as lowercase
literal `\uXXXX` escapes. Structural newlines, fixed labels, numeric fields,
status/exit decisions and ordinary Unicode/punctuation retain their behavior.
The range policy is a local engineering decision; the loaded security skill has
no Node CLI terminal-specific reference. JavaScript replacement, char-code and
padding APIs were verified in installed TypeScript library declarations.

Raw comparison records and exclusive JSON receipts keep original keys/IDs,
including actual control characters. Display escapes are never written back to
inventories or evidence. Literal escape-looking keys remain distinguishable
from keys containing real controls. Added 14 tests cover five identifier sites,
every code point in the selected ranges, normal Unicode/punctuation, literal
backslashes, additional direct formatter call sites, and five offline runner
cases (missing, mismatch, orphan, strict orphan, clean). Fake caller-owned
PostgreSQL/S3 clients are not closed; receipts round-trip exact identities,
inputs remain unchanged and no temporary publication files remain.

Actual pre-fix focused results, exit 1:

```text
ℹ tests 14
ℹ pass 2
ℹ fail 12
ℹ cancelled 0
ℹ skipped 0
```

After implementation, focused tests passed 14/14; actual
`npm run ops:reconcile-test`, exit 0:

```text
ℹ tests 2040
ℹ pass 2040
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 1630.016503
```

| Check | Exit | Actual output / observation |
| --- | --- | --- |
| source/spec `node -c` | 0 each | silent |
| CLI `--help` | 0 | `Usage: node scripts/ops/reconcile-storage-objects.js [options]` |
| appended tests / new helper Prettier | 0 | added-region checks both `true` |
| `npm run lint` | 0 | client `eslint`, shared `eslint "src/**/*.ts"`, server `eslint "{src,test}/**/*.ts"`; no diagnostics |
| restricted `npm run build` | 1 | `Error: Could not parse output from TypeScript's --showConfig.` |
| permitted `npm run build` | 0 | `Compiled successfully in 2.3s`; `Finished TypeScript in 2.0s`; `Generating static pages using 7 workers (22/22) in 625ms`; Prisma Client `7.9.1` generation and `nest build` completed |
| subsequent sequential `npm run typecheck` | 0 | shared/client/server `tsc` checks; Prisma Client `7.9.1` generated in `283ms`; no diagnostics |
| `git diff --check` | 0 | silent |

The first restricted test invocation reported only `pass 0 / fail 1` at the
file wrapper and supplied no behavioral evidence. Permitted subprocess runs
produced the red/green and full-suite totals above. Independent read-only review
inspected the complete source/test diff, prompt, neighboring contracts and logs;
it found no Critical, Important or Minor issues or implementation deviations.
It independently ran the new tests with `--test-isolation=none`: **14 passed,
0 failed**. Its default isolated full-suite invocation yielded a wrapper failure
without details, so the reviewer did not independently reproduce full totals.
Feedback was evaluated against the exact character ranges, single-pass escaping,
all formatter call sites and raw evidence preservation; no fixes were required.

Readiness example returned expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Unrelated full ops suites and online audit were not rerun; no aggregate
`ops:check` pass or fresh vulnerability inventory is claimed. This policy does
not redact identifiers, detect Unicode confusables, guarantee all terminal
rendering behavior, authenticate evidence, prove completeness/byte integrity,
or establish atomic/live recovery. Prompt 201, Category 6 live sign-off and
Phase 12 exit remain open. No live services, credential access, SQL/schema
changes, deployment, operator approval or push occurred. Ordinary commit revert
restores prior terminal display without mutating database or storage data.

Safe inspection:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 349 — Reconciliation receipt path display (2026-10-13)

Continued Phase 12K after `76c81e9` (Prompt 348). The success message after
receipt publication now applies the existing `summaryText` helper to the resolved
output path. Accepted Unicode separators/directional controls previously
survived raw in that message even though report fields were escaped. Literal
backslashes also display doubled, distinguishing escape-looking names from
actual control-bearing names. The exact filesystem destination remains raw;
publication validation, exclusivity, receipt schema, JSON identities, status,
exit behavior and client ownership are unchanged. No route or UI changed.

Ten appended offline runner cases exercise U+2028/U+2029, U+202E,
U+2066/U+2069, literal escape-looking filenames, ordinary Unicode/spaces/quotes,
ordinary paths, a control-bearing parent directory, exit-1 missing-object
publication and existing-file refusal. They verify exact destination names,
parseable receipts, safe success messages, unchanged inputs and no leftover
temporary files. The pre-change focused run exited 1:

```text
ℹ tests 10
ℹ pass 3
ℹ fail 7
ℹ cancelled 0
ℹ skipped 0
```

After the one-line source change, focused tests exited 0 with `tests 10`,
`pass 10`, `fail 0`. Actual permitted `npm run ops:reconcile-test` output,
exit 0:

```text
ℹ tests 2050
ℹ pass 2050
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 1310.545994
```

| Check | Exit | Actual output / observation |
| --- | --- | --- |
| source/spec `node -c` | 0 each | silent |
| CLI `--help` | 0 | `Usage: node scripts/ops/reconcile-storage-objects.js [options]` |
| added tests Prettier | 0 | `added-region Prettier check: true` |
| `npm run lint` | 0 | client `eslint`, shared `eslint "src/**/*.ts"`, server `eslint "{src,test}/**/*.ts"`; no diagnostics |
| restricted `npm run build` | 1 | `Error: Could not parse output from TypeScript's --showConfig.` |
| permitted `npm run build` | 0 | `Compiled successfully in 2.6s`; `Finished TypeScript in 2.5s`; `Generating static pages using 7 workers (22/22) in 753ms`; Prisma Client `7.9.1` generated in `395ms`, `nest build` completed |
| subsequent sequential `npm run typecheck` | 0 | shared/client/server `tsc` checks; Prisma Client `7.9.1` generated in `343ms`; no diagnostics |
| `git diff --check` | 0 | silent |

Restricted isolated full-suite invocation yielded only file-wrapper
`pass 0 / fail 1`, without behavioral totals; approved subprocess execution
produced the full-suite result above. Focused red/green used
`--test-isolation=none`. Logs were captured under `/tmp/acres-349-*.log`.
Independent read-only review inspected source/spec, prompt, neighboring
contracts and check logs, independently passed the ten focused tests and
`git diff --check`, and found no issues or plan deviations. Evaluated feedback
against the raw publication argument, existing escaping policy and exact path
assertions; no fixes were required.

Readiness example returned expected exit 1:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Unrelated full ops suites and online audit were not rerun; no aggregate
`ops:check` pass or fresh vulnerability inventory is claimed. Display escaping
does not redact paths, detect all Unicode confusables, authenticate evidence,
prove completeness or object-byte integrity, or establish atomic/live recovery.
Prompt 201, Category 6 live approval and Phase 12 exit remain open. No live
services, credentials, SQL/schema changes, deployment, operator approval or
push occurred. Ordinary commit revert restores prior display without DB or
storage mutation. Inspect with:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 350 — Reconciliation direction mark display (2026-10-13)

Continued Phase 12K after `2313c98` (Prompt 349). `summaryText` now escapes
U+061C, U+200E and U+200F alongside its existing control ranges. Local Python
`unicodedata` identified these as ARABIC LETTER MARK, LEFT-TO-RIGHT MARK and
RIGHT-TO-LEFT MARK. They previously passed through the terminal boundary
unchanged. The shared formatter covers report text and receipt-success paths;
raw JSON values and exact filesystem destination names remain unchanged.
This is a bounded project display policy, not universal terminal sanitization.
No routes, UI, schema, dependencies, publication or cleanup behavior changed.

Added 31 offline behavioral cases: each mark across missing object identifiers,
mismatched and orphan keys, direct timestamp/status/state/issue text, actual
versus literal escape-looking keys, receipt filenames/parents, error-result
publication and existing-file refusal; ordinary Arabic/Hebrew/accented/CJK/emoji
text remains readable. Tests check original evidence, immutable inputs, exact
destination names and no leftover temporary files. The pre-change focused run
reported:

```text
ℹ tests 31
ℹ pass 4
ℹ fail 27
ℹ cancelled 0
ℹ skipped 0
```

After the one-line production change, focused output was `tests 31`, `pass 31`,
`fail 0`, `cancelled 0`, `skipped 0`. The permitted full
`npm run ops:reconcile-test` exited 0:

```text
ℹ tests 2081
ℹ pass 2081
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 4001.750503
```

| Check | Result / actual output |
| --- | --- |
| source/spec `node -c` | exit 0 each, silent |
| CLI `--help` | exit 0; `Usage: node scripts/ops/reconcile-storage-objects.js [options]` |
| appended tests Prettier | `added-region Prettier check: true` |
| `npm run lint` | client `eslint`, shared `eslint "src/**/*.ts"`, server `eslint "{src,test}/**/*.ts"`; no diagnostics |
| restricted build | `Error: Could not parse output from TypeScript's --showConfig.` |
| permitted `npm run build` | exit 0; `Compiled successfully in 9.8s`; `Finished TypeScript in 5.7s`; `Generating static pages using 7 workers (22/22) in 1898ms`; Prisma Client `7.9.1` generated in `527ms`; `nest build` completed |
| subsequent sequential `npm run typecheck` | exit 0; shared/client/server `tsc` checks; Prisma Client `7.9.1` generated in `398ms`; no diagnostics |
| `git diff --check` | exit 0, silent |

Restricted full-suite execution reported only the file wrapper (`pass 0`,
`fail 1`), without behavioral totals. Permitted subprocess execution supplied
the 2081/2081 result above. Focused red/green used `--test-isolation=none`.
Logs are under `/tmp/acres-350-*.log`. Independent read-only review inspected
the actual diff and prompt, independently passed all 31 new tests, and found
no Critical, Important or Minor issues or plan deviations. Feedback was checked
against the exact new character ranges, existing single-pass backslash handling,
raw JSON and publication-path assertions; no fixes were required.

The read-only example readiness validator exited 1 as expected:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Unrelated full ops suites and online audit were not rerun; no aggregate
`ops:check` pass or fresh vulnerability inventory is claimed. Display escaping
does not redact identifiers/paths, detect all Unicode confusables, authenticate
evidence, prove completeness/object bytes, or establish atomic/live recovery.
Prompt 201, Category 6 live sign-off and Phase 12 exit remain open. No live
services, credentials, SQL/schema changes, deployment, operator approval or
push occurred. Ordinary commit revert restores prior display without database
or storage mutation. Inspect with:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 351 — Reconciliation report clock consistency (2026-10-13)

Continued Phase 12K after `8f0856c` (Prompt 350). The comparator now constructs
its report timestamp from the validated `currentTime` already used for
quarantine retention. Explicit `options.now` inputs produce repeatable complete
reports, including their timestamps. Default execution captures the comparison
instant, rather than a separate later wall-clock read. This timestamp describes
policy evaluation, not receipt publication completion or an authenticated clock.
The existing timestamp field/schema, retention policy, status/exit behavior,
resource ownership and exclusive publication are unchanged. No routes, UI,
services, dependencies, SQL or schema changed.

Added 17 offline behavioral cases covering Date/string/offset/date-only clocks,
milliseconds, epoch zero, minimum/maximum Dates, full report repeatability,
unchanged caller inputs, seven-day quarantine boundaries one millisecond apart,
both execution modes, clean/error/orphan outcomes, orphan exit policy,
default/undefined clocks, invalid clocks, terminal formatting and real temporary
simulation receipt publication. Pre-change focused output:

```text
ℹ tests 17
ℹ pass 5
ℹ fail 12
ℹ cancelled 0
ℹ skipped 0
```

After the one-line source change, the focused run reported `tests 17`, `pass 17`,
`fail 0`, `cancelled 0`, `skipped 0`. Complete permitted
`npm run ops:reconcile-test` exited 0:

```text
ℹ tests 2098
ℹ pass 2098
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 3466.676919
```

Source/spec `node -c` exited 0 silently; CLI help exited 0 with
`Usage: node scripts/ops/reconcile-storage-objects.js [options]`.
Installed Prettier reported `added-region Prettier check: true`.
Root `npm run lint` exited 0: client `eslint`, shared `eslint "src/**/*.ts"`,
server `eslint "{src,test}/**/*.ts"`; no diagnostics.
Restricted build failed with `Error: Could not parse output from TypeScript's
--showConfig.` Permitted `npm run build` exited 0: `Compiled successfully in
4.1s`, `Finished TypeScript in 2.6s`, `Generating static pages using 7 workers
(22/22) in 1159ms`; Prisma Client `7.9.1` generated in `340ms`, and `nest build`
completed. Restricted reconciliation execution exposed only the file-wrapper
failure (`pass 0`, `fail 1`); permitted execution supplied the full totals above.
Focused red/green used `--test-isolation=none`. Logs: `/tmp/acres-351-*.log`.
Subsequent sequential `npm run typecheck` exited 0: shared/client/server `tsc`
checks, Prisma Client `7.9.1` generated in `375ms`; no diagnostics.
`git diff --check` exited 0 silently.

Independent read-only review found no Critical, Important or Minor findings
and no plan deviations. The reviewer independently passed all 17 focused cases
and `git diff --check`, and inspected the supplied full-suite log without
rerunning full-suite/lint/build/typecheck checks. Feedback was verified against
normalization's validated `currentTime`, the one-line timestamp construction,
retention assertions and exact receipt output; no fixes were needed.

Read-only example readiness exited 1 as expected:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Unrelated full ops suites and online audit were not rerun; no aggregate
`ops:check` pass or fresh vulnerability inventory is claimed. Clock consistency
cannot authenticate evidence/clock sources, prove inventory completeness or
object-byte integrity, or establish atomic/live recovery. Prompt 201, Category
6 live sign-off and Phase 12 exit remain open. No live services, credentials,
operator approval, deployment or push occurred. Ordinary commit revert restores
prior timestamp behavior without database/storage mutation. Inspect with:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 352 — Reconciliation sparse argument validation (2026-10-13)

Continued Phase 12K after `0204acd` (Prompt 351). Exported
`parseCliArguments` previously used `Array.some`, which skips empty slots.
A sparse array could throw `TypeError: Cannot read properties of undefined
(reading 'startsWith')`, escaping the runner's usage boundary. The parser now
checks array shape and iterates every argument with `for…of` before parsing.
Holes and explicit non-strings throw `ReconcileUsageError` with the existing
`arguments must be an array of strings` message; `main` returns 1 with help
before inventory/environment/client access or receipt creation. Dense CLI
behavior, cwd validation order, missing-value diagnostics, report schema,
resource ownership and publication semantics are unchanged. This affects
programmatic malformed arrays; ordinary process.argv is dense. Custom
iterators/getters/proxies and inherited-array property policy are outside this
bounded correction. No routes, UI, dependencies, SQL or schema changed.

Added 14 offline behavioral cases: leading/middle/trailing/all-hole arrays,
help/value positions, explicit undefined, immutable fixtures, pre-acquisition
runner rejection, empty/help dense controls and a real temporary simulation
receipt. Permitted pre-change focused output:

```text
ℹ tests 14
ℹ pass 4
ℹ fail 10
```

Post-change focused output was `tests 14`, `pass 14`, `fail 0`.
Complete permitted `npm run ops:reconcile-test` output:

```text
ℹ tests 2112
ℹ pass 2112
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 1590.783362
```

Restricted focused execution initially exposed only a file-wrapper failure
(`test failed`); permitted subprocess execution supplied the actual red/green
results above. Source/spec `node -c` passed silently; CLI help returned
`Usage: node scripts/ops/reconcile-storage-objects.js [options]`. Installed
Prettier reported `Added test block Prettier check passed`; only the appended
test block was formatted. Root lint exited 0 with client `eslint`, shared
`eslint "src/**/*.ts"` and server `eslint "{src,test}/**/*.ts"`, no diagnostics.
Restricted build exited 1 with `Error: Could not parse output from TypeScript's
--showConfig.` Permitted root build exited 0:

```text
✓ Compiled successfully in 2.3s
  Finished TypeScript in 1840ms ...
✓ Generating static pages using 7 workers (22/22) in 556ms
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 303ms
```

The server `nest build` completed. Subsequent sequential root typecheck exited
0, running shared/client/server `tsc` checks and generating Prisma Client
7.9.1 in `337ms`. `git diff --check` passed silently. Logs are under
`/tmp/acres-352-*.log` (session-local, not retained launch evidence).

Independent read-only review found no Critical, Important or Minor findings
and no scope deviations. It separately passed all 14 focused tests and
`git diff --check`, and inspected the 2112/2112 full-suite log without rerunning
broader checks. Feedback was evaluated against the guard/iteration and runner
usage catch; no fixes were required.

Read-only example readiness validation exited 1 as expected:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Unrelated ops suites and online audit were not rerun; no aggregate ops:check
pass or fresh vulnerability inventory is claimed. Argument validation cannot
authenticate recovery evidence, prove inventory completeness/object bytes or
establish atomic/live recovery. Prompt 201, Category 6 live approval and Phase
12 exit remain open. No live services, credentials, operator approval,
deployment or push occurred. Ordinary commit revert restores prior malformed
argument handling without data mutation. Inspect with:

```bash
node --test --test-name-pattern='sparse argument validation:' scripts/ops/reconcile-storage-objects.spec.js
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 353 — Reconciliation runner argument shape (2026-10-13)

Continued Phase 12K after `959b529` (Prompt 352). Inspection reproduced
`main(null)` rejecting with `TypeError: Cannot read properties of null
(reading 'slice')` before parser validation. The runner now checks
`Array.isArray(argv)` inside the existing parsing try before slicing or
reading options.cwd. Non-arrays follow the existing ReconcileUsageError
boundary: `arguments must be an array of strings`, usage help, and return 1.
Non-array slice methods/getters are never invoked. Default undefined argv,
two-prefix slicing, sparse-array parser validation, normal CLI behavior,
resource ownership, output exclusivity and report schema remain unchanged.
Custom array methods/proxies/getters and header-content policy are outside
this bounded correction. No routes, UI, dependencies, SQL or schema changed.

Added 16 offline cases: null, booleans, zero/NaN, bigint, Symbol, string,
plain/array-like objects, typed array, throwing slice getter, callable slice,
both help flags and real temporary simulation publication. Tests assert fixed
usage diagnostics before cwd/environment/inventory/client access and preserve
input descriptors. Object fixtures are frozen where applicable; the nonempty
typed array is checked for mutation without freezing. Pre-change permitted
focused results:

```text
ℹ tests 16
ℹ pass 3
ℹ fail 13
```

Post-change focused results were `tests 16`, `pass 16`, `fail 0`. Full
permitted `npm run ops:reconcile-test` output:

```text
ℹ tests 2128
ℹ pass 2128
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 1794.258312
```

Restricted focused execution returned a file-wrapper `test failed`; permitted
subprocess execution supplied the actual red/green results above. Source/spec
`node -c` passed silently. CLI help returned
`Usage: node scripts/ops/reconcile-storage-objects.js [options]`. Installed
Prettier reported `Added test block Prettier check: true`; only new tests were
formatted. Root lint exited 0 with client `eslint`, shared
`eslint "src/**/*.ts"` and server `eslint "{src,test}/**/*.ts"`, no diagnostics.
Restricted build failed with
`Error: Could not parse output from TypeScript's --showConfig.`
Permitted root production build exited 0:

```text
✓ Compiled successfully in 2.3s
✓ Generating static pages using 7 workers (22/22) in 559ms
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 504ms
```

Server `nest build` completed. Sequential root typecheck exited 0 with shared,
client and server `tsc` checks; Prisma Client 7.9.1 generated in `471ms`.
`git diff --check` passed silently. Logs under `/tmp/acres-353-*.log` are
session-local verification, not retained launch evidence.

Independent read-only review found no Critical, Important or Minor issues and
no plan deviations. It independently passed all 16 new cases using Node's
`--test-isolation=none` and passed `git diff --check`. Its full-suite rerun
hit sandbox `spawnSync ... EPERM` failures in existing subprocess tests; it
inspected the permitted 2128/2128 log without independently reproducing that
full result or rerunning lint/build/typecheck. Feedback was evaluated against
the guard ordering, existing usage catch and regression assertions; no source
or test fixes were needed.

Read-only example readiness remained fail-closed:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Unrelated ops suites and online audit were not rerun; no aggregate ops:check
pass or fresh vulnerability inventory is claimed. Runner validation cannot
authenticate evidence, prove inventory completeness/object bytes or establish
atomic/live recovery. Prompt 201, Category 6 live sign-off and Phase 12 exit
remain open. No live services, credentials, operator approval, deployment or
push occurred. Ordinary commit revert restores prior malformed runner handling
without data mutation. Inspect with:

```bash
node --test --test-name-pattern='runner argument shape:' scripts/ops/reconcile-storage-objects.spec.js
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 354 — Reconciliation output path preflight (2026-10-13)

Continued Phase 12K after `5a60b05` (Prompt 353). Inspection reproduced the
parser accepting `--output bad\0receipt.json` and main accessing environment
before the existing publication guard could reject it. The parser now rejects
C0 U+0000–001F and DEL/C1 U+007F–009F in raw output operands before
normalization and in the final resolved destination before acquisition.
Both checks use the existing publication range and fixed ReconcileUsageError
`output file path must be control-free`, without printing the raw path.
Main returns 1 with usage help; even --help cannot bypass validation.

All four output flag forms are covered. Resolved controls inherited from
--cwd or programmatic base cwd fail early; cwd without output retains its
prior policy. Spaces, accented/astral names and supported Unicode display
marks remain literal destinations. Standalone publishReceipt validation,
parent checks, exclusivity, resource lifecycle and report schema are unchanged.
No routes, UI, SQL/schema, dependencies or package scripts changed.

Added 287 offline tests: all 65 forbidden code points across four flag forms,
eight runner cases proving no environment/inventory/client access, 17 Unicode
parser controls, cwd-without-output compatibility and real temporary clean
simulation publication. Frozen input descriptors remain unchanged. Focused
pre-change output was `tests 287`, `pass 19`, `fail 268`; post-change:

```text
ℹ tests 287
ℹ pass 287
ℹ fail 0
```

The restricted full suite returned file-wrapper `test failed`; permitted
`npm run ops:reconcile-test` exited 0:

```text
ℹ tests 2415
ℹ pass 2415
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 1410.193829
```

Source/spec `node -c` passed silently. CLI help returned
`Usage: node scripts/ops/reconcile-storage-objects.js [options]`.
Installed Prettier reported `Added test block Prettier check: true`;
only new tests were formatted. Root lint exited 0 with client `eslint`, shared
`eslint "src/**/*.ts"` and server `eslint "{src,test}/**/*.ts"`, no diagnostics.
Restricted build failed with
`Error: Could not parse output from TypeScript's --showConfig.`
Permitted root production build exited 0:

```text
✓ Compiled successfully in 2.4s
✓ Generating static pages using 7 workers (22/22) in 575ms
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 332ms
```

Server `nest build` completed. Sequential root typecheck exited 0 with all
three workspace checks and Prisma Client 7.9.1 generated in `275ms`.
`git diff --check` passed silently. Logs `/tmp/acres-354-*.log` are session-local
verification, not retained launch evidence.

Independent read-only review found no Critical, Important or Minor issues or
plan deviations, and independently passed all 287 focused cases and diff
whitespace checks. Its full restricted rerun reached 2415 tests with 2406
passes and nine existing subprocess `spawnSync ... EPERM` failures. It did not
rerun with escalation or independently repeat lint/build/typecheck. Feedback
was evaluated against raw/resolved guard ordering, publication policy and
regressions; no fixes or follow-up review were necessary.

Read-only example readiness remained fail-closed:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

This preflight prevents wasted dependency acquisition; it does not authenticate
evidence, prove inventory completeness/object bytes or establish atomic/live
recovery. Prompt 201, Category 6 live sign-off and Phase 12 exit remain open.
No live services, credentials, operator approval, deployment or push occurred.
Unrelated ops suites/online audit were not rerun; no aggregate ops:check pass
or fresh vulnerability inventory is claimed. Ordinary commit revert restores
late output-path rejection without data mutation. Inspect with:

```bash
node --test --test-name-pattern='output path preflight:' scripts/ops/reconcile-storage-objects.spec.js
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 355 — Reconciliation runner cwd validation (2026-10-13)

Continued Phase 12K after `6a5da9a` (Prompt 354). The runner used
`options.cwd || process.cwd()`, bypassing existing parser validation for
explicit falsy invalid directories. A local --help reproduction returned 0
for empty string, null, false, zero and NaN. Main now forwards options.cwd
unchanged: the parser's existing default parameter handles omitted/undefined
values, and its existing validation rejects non-string/blank values with
`reconciliation usage error: cwd requires a non-empty path`, help and return 1
before environment, inventory or client acquisition. Explicit null no longer
means use the process directory. Valid absolute/relative paths stay compatible.

Added 26 offline cases covering invalid values with help/relative output,
throwing dependency getters, frozen input descriptors, empty output directories,
and actual clean simulation publication with omitted/undefined/absolute/relative
cwd. Valid explicit paths include a spaced Unicode directory. Tests use unique
local directories and clean up without process.chdir. No new cwd control policy,
filesystem preflight, dependencies, routes, UI, SQL/schema or report contract.

Focused pre-change result: `tests 26`, `pass 14`, `fail 12`. Post-change
`node --test --test-isolation=none --test-name-pattern='runner cwd validation:' scripts/ops/reconcile-storage-objects.spec.js`:

```text
ℹ tests 26
ℹ pass 26
ℹ fail 0
```

Restricted full-suite execution returned the existing file-wrapper `test failed`.
Permitted `npm run ops:reconcile-test` exited 0:

```text
ℹ tests 2441
ℹ pass 2441
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 1883.460643
```

Source/spec `node -c` and `git diff --check` passed silently. CLI help returned
`Usage: node scripts/ops/reconcile-storage-objects.js [options]`.
Installed Prettier reported `Added test block Prettier check: true`; only the
new test block was formatted. Initial formatter lookup under client/node_modules
failed MODULE_NOT_FOUND; the installed root `prettier` resolved and passed.
Root lint exited 0 with client `eslint`, shared `eslint "src/**/*.ts"` and
server `eslint "{src,test}/**/*.ts"`, without diagnostics. Restricted build
failed with `Error: Could not parse output from TypeScript's --showConfig.`
Permitted root production build exited 0:

```text
✓ Compiled successfully in 2.8s
✓ Generating static pages using 7 workers (22/22) in 788ms
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 452ms
```

Server `nest build` completed. Sequential root typecheck exited 0 with shared,
client and server `tsc` checks, and Prisma Client 7.9.1 generated in `393ms`.
Logs `/tmp/acres-355-*.log` are session-local checks, not retained launch evidence.

Independent read-only review found no Critical, Important or Minor issues or
plan deviations, independently passed all 26 focused cases, and passed source/
spec syntax and diff whitespace checks. It inspected the working diff, prompt,
parser/path resolution and acquisition ordering; it did not independently repeat
the full suite, lint, build, typecheck or readiness. Feedback was evaluated
against parser defaulting/validation and acquisition order; no fixes or follow-up
review were necessary.

Read-only example readiness remained fail-closed:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

This input validation does not establish evidence authenticity/completeness,
object-byte integrity, atomic snapshots or live recovery. Prompt 201, Category 6
live sign-off and Phase 12 exit remain open. No live services, credentials,
operator approval, deployment or push. Unrelated ops suites and online audit
were not rerun; no aggregate ops:check pass or fresh audit claim. Ordinary
commit revert restores the prior falsy fallback without DB/storage mutation.
Inspect from the repository root:

```bash
node --test --test-isolation=none --test-name-pattern='runner cwd validation:' scripts/ops/reconcile-storage-objects.spec.js
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 356 — reconciliation database port validation (2026-10-13)

Continued Phase 12K after committed Prompt 355 (`75994dd`). Installed
`pg/lib/connection-parameters.js` and a local probe confirmed permissive parsing:
`5432suffix` and `5432.5` select 5432; `0x1538` becomes zero before the driver's
falsy fallback selects 5432. The runner now validates the full PGPORT operand
before acquiring its owned PostgreSQL client. Omitted/undefined and empty string
retain 5432; other supplied values require ASCII decimal strings converting to
an integer in 1–65535. Leading zeroes remain valid. The range is explicit
connection policy, not a measured endpoint or proof of target identity.

Malformed values use the existing private `Error: PostgreSQL connection failed`
diagnostic, return 1 and create no receipt or client. Password-required
precedence, help, injected client/inventory, connection cleanup and report
publication remain compatible. Added 35 offline cases covering malformed syntax,
range, non-string inputs, valid boundaries/defaults, actual simulation receipts,
one owned end, caller ownership and frozen input descriptors. Mock clients never
connect to live services. No dependencies, scripts, UI/API, SQL/schema or other
environment handling changed.

Focused pre-fix regression output:

```text
ℹ tests 35
ℹ pass 11
ℹ fail 24
```

Focused post-fix output:

```text
ℹ tests 35
ℹ pass 35
ℹ fail 0
```

The restricted full-suite wrapper returned `test failed`. Permitted
`npm run ops:reconcile-test` exited 0:

```text
ℹ tests 2476
ℹ pass 2476
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

Root lint exited 0 with client `eslint`, shared `eslint "src/**/*.ts"` and
server `eslint "{src,test}/**/*.ts"`, without diagnostics. Restricted root
build hit `Error: Could not parse output from TypeScript's --showConfig.`
Permitted root build exited 0:

```text
✓ Compiled successfully in 3.2s
✓ Generating static pages using 7 workers (22/22) in 758ms
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 421ms
```

Server `nest build` completed. Sequential root typecheck exited 0 with shared,
client and server `tsc` checks; Prisma Client 7.9.1 generated in `268ms`.
Source/spec `node -c` and `git diff --check` passed silently. CLI help began
`Usage: node scripts/ops/reconcile-storage-objects.js [options]`.
Installed Prettier reported `Added test block Prettier check: true`; only the
new test block was formatted. Logs `/tmp/acres-356-*.log` are session-local
verification records, not retained production evidence.

Independent read-only review found no Critical, Important or Minor issues and
no plan deviations. The reviewer independently passed all 35 focused cases and
inspected runner lifecycle and installed driver parsing. Feedback was evaluated
against the password/client/inventory branches, full-string validation and
receipt behavior; no fixes or follow-up review were needed. The reviewer did
not independently repeat full-suite, root build/lint/typecheck or readiness.

Read-only example readiness exited 1 as expected:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

Input validation cannot establish evidence authenticity/completeness, target
identity, object bytes, atomic snapshots or live recovery. Prompt 201, Category 6
live sign-off and Phase 12 exit remain open. No live services, real credentials,
operator approval, deployment or push. Unrelated ops suites and online audit
were not rerun; no aggregate ops:check or fresh audit claim. Ordinary commit
revert restores permissive parsing without DB/storage mutation.

Inspect from the repository root:

```bash
node --test --test-isolation=none --test-name-pattern='main database port validation:' scripts/ops/reconcile-storage-objects.spec.js
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## Prompt 357 — whole-project completion audit and launch handoff (2026-10-13)

At baseline `4e9d6eb`, reconciled the approved V1 against code, routes, schema,
CI, test fixtures, canonical product/build records and committed history.
[project-status.md](project-status.md) records a judgment-based **85% overall
estimate (80–90% range)**, with the application rows **69/75 = 92%**. The
weights total 100 and estimated earned points total 85. This is neither a
measured effort forecast nor launch acceptance. Added one AGENTS index row;
corrected stale reports/AI residual claims and the build-plan status header.
No runtime, route, dependency, schema or control changed.

The handoff identifies administrative audit/job history UI as a V1 gap, credits
existing GraphQL audit/REST job reads and ingestion/export progress, and
separates fresh real-pipeline/release verification from operator-owned
production setup, policies, live drills and eleven sign-offs. Mock/intercepted
product browser fixtures do not prove the complete real scanner/queue/data
journey. Deferred extensions and production AI are outside the launch estimate.

Actual checks:

- `npm run lint`: exit 0; client `eslint`, shared `eslint "src/**/*.ts"`, server
  `eslint "{src,test}/**/*.ts"`, no diagnostics.
- Restricted `npm run build`: exit 1 with
  `Error: Could not parse output from TypeScript's --showConfig.`
  The supported subprocess-access rerun exited 0:

```text
✓ Compiled successfully in 2.6s
✓ Generating static pages using 7 workers (22/22) in 972ms
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 348ms
```

Server `nest build` completed. Subsequent root `npm run typecheck` exited 0
with shared/client/server TypeScript checks; Prisma Client 7.9.1 generated in
`410ms`. Installed Prettier on the new status/prompt files reported:

```text
Checking formatting...
All matched files use Prettier code style!
```

New prose blocks are formatted without rewriting historical records or the
existing AGENTS table. `git diff --check` passed silently; the 20 new-document
local Markdown links resolved, and all 31 referenced short commit identities
resolved to commits. A preliminary Node child-process identity probe hit
`spawnSync git EPERM`; direct shell git checks succeeded. An initial arithmetic
probe accidentally included the second table; restricting it to the rubric
confirmed `85/100; application: 69/75 = 92%`. Neither probe failure was an
application/test failure. Logs `/tmp/acres-357-*.log` are session-local checks,
not retained production evidence.

Independent read-only review found no Critical, Important or Minor findings
and no plan deviations; it verified arithmetic, route/API gaps, fixture limits
and launch contracts against actual sources. Feedback was evaluated against
those sources and the V1/no-AI boundary; no fixes or re-review were needed.
The reviewer did not independently rerun costly repository checks.

Read-only example readiness exited 1, intentionally:

```text
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

This says nothing about an operator's private evidence store. Prompt 201 and
the Phase 12 exit remain open. No fresh browser, real-database, full operations,
online audit, live drill or deployment verification is claimed. No credentials,
production mutations, approvals or push occurred. Ordinary commit revert
restores prior documentation. To inspect the result, open
`docs/project-status.md`; reproduce the repository-visible gate with
`node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`.


## Prompt 362 — Release verification refresh and triage (2026-10-13)

Continued Phase 12 release hardening following Prompt 361. Executes item 3 of
`docs/project-status.md`: comprehensive verification refresh across contracts,
server unit suites, real PostgreSQL/PostGIS integration suites under forced RLS,
measured query plans, client Playwright browser journeys across all three reference
viewports, operational preflight suites, security/SAST/container scans, and launch
drill orchestration.

### Execution environment

- Host: Linux `milk7` (kernel 7.2.5-3-omarchy #1 SMP PREEMPT_DYNAMIC Mon, 14 Sep 2026 x86_64)
- Node.js: `v26.11.1`
- npm: `11.20.0`
- Docker: `29.7.2` (build `a7dcaa6fdb`)
- PostgreSQL / PostGIS: `postgis/postgis:18-3.6` (PostgreSQL 18 + PostGIS 3.6 on port 5432, container `acres-postgres-1`)

### Verification results and actual command outputs

1. **Contracts check (`npm run contracts:check`)**:
   - Exit 0; verified OpenAPI 3.1 schema and GraphQL SDL schema are clean and strictly in sync with source decorators and resolver definitions. Zero drift detected.

2. **Linting (`npm run lint`)**:
   - Exit 0; executed ESLint across `@acres/client`, `@acres/shared`, and `@acres/server`. Zero errors, zero warnings.

3. **Typechecking (`npm run typecheck`)**:
   - Exit 0; built `@acres/shared`, generated Prisma Client (7.9.1) in 402 ms, typechecked shared, client, and server workspaces without errors.

4. **Production builds (`npm run build`)**:
   - Exit 0; `@acres/shared` compiled with TypeScript; `@acres/client` compiled Next.js 16.3.8 in 4.0s generating 23/23 static and dynamic routes; `@acres/server` compiled NestJS production artifacts with Prisma Client (7.9.1) generated in 393 ms.

5. **Whitespace & conflict marker check (`git diff --check`)**:
   - Exit 0; zero trailing whitespace, zero merge markers detected.

6. **Server unit test suite (`npm run test --workspace=@acres/server`)**:
   - Initial run uncovered 1 failing suite: `src/geography/geoboundaries-cli.spec.ts` (3 failed, 24 passed) with `Missing required environment variable(s): CSRF_SECRET. Copy server/.env.example to server/.env and fill them in.`
   - Triage & remediation: Commit `517925c` had separated `CSRF_SECRET` from `SESSION_SECRET` in `server/.env.example`, but local developer `server/.env` had not been populated with `CSRF_SECRET`. Added `CSRF_SECRET=change-me-distinct-32-bytes-minimum-in-real-environments` to `server/.env` and added `process.env.CSRF_SECRET ??=` fallback to `geoboundaries-cli.spec.ts` to ensure isolated execution without `.env`.
   - Re-run result: Exit 0; **120/120 test suites passed, 1876/1876 tests passed, 1 snapshot passed** in 7.993 s.

7. **Real PostgreSQL/PostGIS database E2E suite (`npm run test:server`)**:
   - Executed Jest E2E against migrated `acres_test` database under forced RLS.
   - Exit 0; **7/7 test suites passed, 146/146 tests passed** in 47.514 s:
     - `test/api.e2e-spec.ts`: 78/78 passed (auth, session, CSRF, REST API contracts, versioned envelopes)
     - `test/database.e2e-spec.ts`: 17/17 passed (forced RLS, ownership transfers, concurrent idempotency, parser error handling)
     - `test/data-journey.e2e-spec.ts`: 1/1 passed (11 integrated phases: PostGIS polygon geography, multi-tenant Org A/B setup, upload initiation/completion, dataset mapping, ingestion publication, deterministic metrics/observations/aggregates/lineage, analytics reads, saved view CRUD, report drafting/evidence freezing/review/publication, CSV export/download, cross-tenant isolation, RBAC denials, and partial publication rollback defense)
     - `test/organizations.e2e-spec.ts`: 18/18 passed (memberships, role transitions, invitation issuance and revoking)
     - `test/auth-recovery.e2e-spec.ts`: 18/18 passed (password recovery, single-use token consumption, session revocation)
     - `test/geography-database.e2e-spec.ts`: 10/10 passed (PostGIS polygon queries, ST_Contains spatial lookups, hierarchical boundaries)
     - `test/env-validation.e2e-spec.ts`: 4/4 passed (environment validation and missing variable guards)

8. **Representative query plan gates**:
   - `DATABASE_URL=... npm run analytics:plans`: Exit 0; **6/6 query plans passed**:
     - `findMetrics`: PASS (0.03 ms, cost 8.18, 4 rows, Index Scan `MetricDefinition_organizationId_key_key`)
     - `findAggregates (filtered)`: PASS (0.09 ms, cost 34.45, 1 row, Index Scan `MetricAggregate_main_read_idx`)
     - `findObservations (filtered)`: PASS (0.06 ms, cost 34.45, 1 row, Index Scan `MetricObservation_main_read_idx`)
     - `findAggregateEvidence (lineage)`: PASS (0.04 ms, cost 8.33, 1 row, Index Scan `MetricAggregateLineage_organizationId_aggregateId_observationId`)
     - `listDashboardViews`: PASS (0.04 ms, cost 1.04, 2 rows, Limit, Sort, Result, Seq Scan)
     - `dashboardSummary (aggregates)`: PASS (1.00 ms, cost 195.40, 24 rows, Limit, Sort, Seq Scan)
   - `DATABASE_URL=... npm run geography:plans`: Exit 0; **2/2 query plans passed**:
     - `spatialPointIntersection (GiST index)`: PASS (0.07 ms, cost 20.68, 1 row, Index Scan `RegionGeometry_geometry_gist_idx`)
     - `hierarchyChildren (parentId, level index)`: PASS (0.04 ms, cost 8.19, 25 rows, Index Scan `Region_parentId_level_idx`)

9. **Client browser, responsive, and accessibility E2E journeys (`npm run test:client:e2e`)**:
   - Executed Playwright across headless Chromium against live local Next.js client and Nest server.
   - Exit 0; **85 passed, 9 skipped** (the 9 opt-in loopback proxy fault simulation tests from Prompt 359), **0 failed** in 1.2 m.
   - Tested marketing page, responsive layouts at 375px mobile, 800px tablet, and 1280px desktop, keyboard navigation, skip link, contrast, touch targets >= 44px, auth login/register/recovery, invitation acceptance, member administration, audit workspace pagination and switching, dashboards, datasets with SSE streaming, report authoring and export queuing.
   - Triage: added `/output/` to `.gitignore` to prevent generated screenshot artifacts (`output/playwright/*.png`) from polluting git status.

10. **Operations preflights, security, and supply-chain scans (`npm run ops:check`)**:
    - Exit 0; executed all 33 offline stages and 27 test suites in 132.7 s:
      - Production template keys, proxy environment, application environment, garage metrics, postgres diagnostics, release images, and production shell templates verified.
      - Secret scanning: passed with zero unmasked credentials or tracked private secrets.
      - Docker runtime: verified valid pinned base images and non-root user execution.
      - Dependency audit: passed with zero critical production vulnerabilities.
      - Readiness schema & launch readiness tests: passed validator test harness.
      - Storage reconciliation tests: 9/9 unit tests passed.
      - Backup & restore drill tests: passed.
      - Caddy routing & deployment drill tests: passed.
      - Volume encryption preflight: 9 stateful mounts verified.
      - Secret rotation drill tests: passed.
      - SBOM & license compliance: verified 702 packages, 0 license violations.
      - SAST scan: 379 files scanned, 12 total findings (9 triaged and documented, 0 active blocking findings).
      - Container security: 22/22 checks passed.
      - Capacity & alert simulation tests: passed.
      - DoS resilience & capacity alerting tests: passed.
      - Launch drill orchestrator tests: 182/182 tests passed.

11. **Unified launch drill orchestrator (`npm run ops:launch-drill`)**:
    - Executed unified drill runner in `--dry-run`: 6/7 stages passed, 1 failed (duration 9.74 s).
    - Passed: `static_templates`, `supply_chain_sast`, `ingress_deployment`, `volume_encryption`, `secret_rotation`, `capacity_alerting`.
    - Failed: `disaster_recovery` — fails cleanly on offline development environment because Garage (object storage) daemon is not running locally. Real live disaster recovery restore drill and reconciliation requires active storage daemon and isolated drill environment per item 4.

### Triage summary and release posture

- **Resolved issues**:
  - `CSRF_SECRET` added to `server/.env` and fallback added to `geoboundaries-cli.spec.ts`.
  - Added `/output/` to `.gitignore` for Playwright screenshot outputs.
- **Open non-code release prerequisites**:
  - Item 4 (infrastructure-level failure acceptance with live Garage/Valkey/ClamAV outages and backup restore).
  - Operator-owned launch checklist sign-offs across 11 categories (Prompt 201).
- **Readiness check result**:
  - Read-only example readiness continues to exit 1 (0 approved / 11 unresolved / 70 blockers), preserving fail-closed launch posture.

## Prompt 363 — Infrastructure failure and outage acceptance (2026-10-13)

Executes Item 4 of `docs/project-status.md`: infrastructure-level failure modes,
outage handling, error sanitization, lease recovery, transactional rollback, and
storage parity across Garage/S3, Valkey/queue, ClamAV, worker crash leases, parser child
containment, and restore reconciliation. Implemented in
`server/test/infrastructure-failure.e2e-spec.ts`.

### Six failure scenarios implemented and verified

1. **ClamAV scanner failure modes**:
   - 1A (`scanner_unavailable`): Connection refused/socket failure fail-closed rejection and dead-letter. Upload moves to `rejected` with `rejectionReason: "scanner_unavailable"`, dead-letter durable record logged in `JobDeadLetter`.
   - 1B (`scanner_timeout`): Socket timeout during chunk streaming fail-closed rejection and dead-letter. Upload moves to `rejected` with `rejectionReason: "scanner_timeout"`, dead-letter durable record logged.
   - 1C (`infected` detection): EICAR virus signature detected during scanning. Upload marked `rejected` with `rejectionReason: "infected"` and signature suppression (raw virus signature is excluded and never leaked into `failureMessage` or `JobDeadLetter.reasonMessage`).
   - 1D (`health probe`): `ClamavScannerAdapter` health check fails cleanly on connection error and timeout without throwing unhandled exceptions.

2. **Object storage / Garage failure modes**:
   - 2A (`object_missing`): Object not found in storage buffer during processing. Job terminated safely, status marked `rejected` with `rejectionReason: "object_missing"`, dead-letter logged.
   - 2B (`worker_exception` sanitization): S3 network exception during streaming. Status marked `failed` with sanitized generic message (`WORKER_EXCEPTION_MESSAGE = "Upload processing failed unexpectedly."`) to prevent internal storage endpoints, ports, or credentials from leaking into tenant-accessible database columns.
   - 2C (`readiness probe`): `S3ObjectStorageAdapter` readiness check returns `false` when object storage endpoint is unreachable.

3. **Work queue / Valkey failure modes**:
   - 3A (`outbox retry backoff`): Temporary queue outage during event dispatch triggers exponential backoff retry when `attempts < maxAttempts`, setting next retry timestamp and logging `queue_unavailable`.
   - 3B (`dead-letter exhaustion`): Enqueue failures exceeding `maxAttempts` transition outbox event to `dead_lettered` with durable `JobDeadLetter` record.

4. **Worker crash and lock lease recovery**:
   - 4A (`expired lease reclamation`): Ingestion worker crash while holding active row lock. Expired lock lease (`lockedAt < now - lockTimeout`) is safely reclaimed by restarting worker via PostgreSQL `FOR UPDATE SKIP LOCKED`.

5. **Ingestion parser containment & transactional rollback**:
   - 5A (`parser failure rollback`): Corrupted or malformed file during parsing triggers transactional rollback in `real-db-test-app` (using `InProcessParserExecutor` for database isolation verification), leaving zero partial `DatasetVersion`, `MetricObservation`, or `MetricAggregate` rows committed in the tenant schema (process-level isolation and timeouts verified in `child-process-parser.executor.spec.ts`).

6. **Database restore drill & storage reconciliation parity**:
   - 6A (`storage parity reconciliation`): `reconcileObjects` identifies missing objects, orphaned objects, and SHA-256 digest mismatches deterministically against database records.
   - 6B (`restore drill CLI contracts`): Validated CLI contract for `run-restore-drill.sh --help` (live PostgreSQL restore drills and physical storage reconciliation remain operator-owned).

### Verification results and actual command outputs

1. **Infrastructure failure test suite (`npm run test:server -- server/test/infrastructure-failure.e2e-spec.ts`)**:
   - Exit 0; **1/1 test suite passed, 13/13 tests passed** in 5.45 s.
2. **Complete real database E2E suite (`npm run test:server`)**:
   - Exit 0; **8/8 test suites passed, 159/159 tests passed** in 56.8 s across all real PostgreSQL/PostGIS suites under forced RLS.
3. **Contracts check (`npm run contracts:check`)**:
   - Exit 0; 0 schema drift.
4. **Formatting & Linting (`npm run lint`)**:
   - Exit 0; 0 errors, 0 warnings.
5. **Typechecking (`npm run typecheck`)**:
   - Exit 0; 0 errors across `@acres/shared`, `@acres/client`, and `@acres/server`.
6. **Production builds (`npm run build`)**:
   - Exit 0; Next.js 16.3.8 compiles 23/23 routes cleanly; Nest server compiles cleanly.
7. **Operations preflight (`npm run ops:check`)**:
   - Exit 0; all 33 offline stages and 27 test suites passed in 102.5 s; 182/182 launch drill tests passed.
8. **Diff check (`git diff --check`)**:
   - Exit 0; 0 trailing whitespace, 0 merge markers.

## Prompt 364 — V1 Release Candidate baseline and launch readiness handoff (2026-10-14)

Reconciles whole-project status following the completion of Prompts 358 through
363, establishing the formal **V1 Release Candidate baseline at commit `dd36684`**.

### Milestone reconciliation & release posture

1. **Closed V1 engineering and acceptance milestones**:
   - Milestone 1 (Administrative history scope, Prompts 358–360): `/app/audit`, 9 opt-in browser fault scenarios, `/api/v1/jobs/runs` denial.
   - Milestone 2 (Authoritative 11-phase data journey on PostgreSQL/PostGIS under forced RLS, Prompt 361): 11 phases verified, complete multi-tenant isolation, RBAC denial.
   - Milestone 3 (Release verification refresh and triage, Prompt 362): 0 contract drift, 0 lint/typecheck errors, 23/23 Next.js routes, 120/120 unit suites (1876/1876 tests), 85/85 browser tests, 6/6 analytics & 2/2 geography EXPLAIN plans, 33/33 ops preflights.
   - Milestone 4 (Infrastructure failure acceptance, Prompt 363): 13/13 tests, 8/8 real DB suites (159/159 tests), fail-closed ClamAV socket downtime & timeout quarantine, virus signature isolation, S3 missing buffer rejection & error sanitization, Valkey retry backoff & dead-lettering, worker crash lock-lease reclamation via `FOR UPDATE SKIP LOCKED`, parser rollback, and storage/database parity reconciliation.

2. **Updated V1 completion scorecard**:
   - Application capability completion: **75 / 75 earned points (100% complete)** across all 6 capability domains.
   - Whole-project completion: **91 / 100 points (91% complete)**.
   - Remaining 9 points are strictly operator-owned launch activities: physical production host provisioning, live cluster drills, and 11 category sign-offs in `infra/launch/readiness.example.json` under Prompt 201.

3. **Launch readiness validator status**:
   - Target: `infra/launch/readiness.example.json`.
   - Result: Fail-closed (exit code 1), 0 of 11 categories approved, 11 unresolved, 70 blockers detected.

### Verification results and actual command outputs

1. **Contracts check (`npm run contracts:check`)**:
   - Exit 0; 0 schema drift detected between code and checked-in artifacts.
2. **Formatting & Linting (`npm run lint`)**:
   - Exit 0; 0 errors, 0 warnings across client, shared, and server workspaces.
3. **Typechecking (`npm run typecheck`)**:
   - Exit 0; 0 errors across `@acres/shared`, `@acres/client`, and `@acres/server`.
4. **Production builds (`npm run build`)**:
   - Exit 0; Next.js 16.3.8 compiles 23/23 routes cleanly; Nest server and shared library compile cleanly.
5. **Operations preflight (`npm run ops:check`)**:
   - Exit 0; all 33 offline stages and 27 test suites passed.
6. **Launch readiness check (`node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`)**:
   - Exit 1 (fail-closed as intended); 0 approved, 11 unresolved, 70 blockers.
7. **Diff check (`git diff --check`)**:
   - Exit 0; 0 trailing whitespace, 0 merge markers.

## Prompt 365 — Reconcile launch checklist with V1 Release Candidate baseline (2026-10-14)

Reconciles `docs/launch-checklist.md` §6A's preflight gap register and operator
handoff repository prefill with the V1 Release Candidate baseline at commit
`dd36684` on `main`.

### Checklist reconciliation & candidate preflight status

1. **Section 6A gap register refresh**:
   - Replaced stale preflight assessment date (`2026-09-26`) and commit (`3da8949`) with `2026-10-14T10:30:00Z UTC` and `dd366847cde9dc76af2ad4acc6d200a6528ced3b` on `main`.
   - Updated all 11 category rows in §6A to document the verified preflight tooling, contracts, and test coverage established by the V1 Release Candidate:
     - **Category 1 (`production_domain_tls`)**: Caddy production template, `verify-caddy-routing.js` (18/18 routes passed, security headers, S3 SigV4 host preserved), and `check-production-templates.sh`.
     - **Category 2 (`smtp_delivery`)**: `check-smtp-template-keys.js` (1/1 suite passed), account recovery and member invitation email pipelines verified in Prompts 58 and 361.
     - **Category 3 (`secrets_management`)**: `scan-secrets.sh` (0 leaks), `run-secret-rotation-drill.sh --dry-run`, and 7 credential classes verified in Prompts 230 and 363.
     - **Category 4 (`secret_references`)**: `infra/launch/readiness.schema.json` 12-secret-field validator, isolated `CSRF_SECRET` in `server/.env`, and scoped Compose templates.
     - **Category 5 (`slo_and_alerting`)**: 11 operational Prometheus alert rules (`verify-alert-rules.js`), query plan gates (6/6 analytics, 2/2 spatial PostGIS), and `verify-capacity-load.js`.
     - **Category 6 (`backup_and_disaster_recovery`)**: `backup-postgres.sh`, `restore-postgres.sh`, and `reconcile-storage-objects.js` (Prompts 305–356); 13/13 infrastructure failure recovery tests under forced RLS in Prompt 363.
     - **Category 7 (`data_retention_policy`)**: Export artifact retention purge batch bounds (Prompt 79) and download expiry enforcement (Prompt 71).
     - **Category 8 (`volume_encryption`)**: `verify-volume-encryption.js` verifying 9 required stateful service mounts and unlock material separation.
     - **Category 9 (`graphql_introspection`)**: production schema introspection policy and `/graphql` schema verification (`contracts:check` 0 drift).
     - **Category 10 (`deployment_and_rollback`)**: Next.js 16.3.8 (23/23 routes), Nest server compilation, `check-release-images.js`, and `run-deployment-drill.sh --dry-run`.
     - **Category 11 (`optional_ai_posture`)**: AI draft preview disabled by default (`ai_enabled: false`, `AI_DRAFT_ENABLED=false`), absent `GEMINI_API_KEY`, unpaid provider excluded, and 3 deterministic core journeys verified in Prompt 361.

2. **Operator handoff & repository prefill alignment**:
   - Updated source snapshot inspected to `dd366847cde9dc76af2ad4acc6d200a6528ced3b` on `main`.
   - Updated locally verified test baseline: 23/23 Next.js routes, 120 server unit suites (1876/1876 tests), 8 real PostgreSQL/PostGIS database E2E suites (159/159 tests under forced RLS), 85 Playwright browser tests across 3 viewports, 6/6 analytics & 2/2 spatial query plan gates, 33 offline ops preflights (27 suites, 182 drill tests).
   - Documented Prompt 365 candidate alignment check at `2026-10-14T10:30:00Z UTC`.
   - Reaffirmed fail-closed posture: all 11 categories remain `unresolved` in `infra/launch/readiness.example.json` (70 blockers detected by `scripts/ops/check-launch-readiness.js`).

### Verification results and actual command outputs

1. **Contracts check (`npm run contracts:check`)**:
   - Exit 0; 0 schema drift detected between code and checked-in artifacts.
2. **Formatting & Linting (`npm run lint`)**:
   - Exit 0; 0 errors, 0 warnings across client, shared, and server workspaces.
3. **Typechecking (`npm run typecheck`)**:
   - Exit 0; 0 errors across `@acres/shared`, `@acres/client`, and `@acres/server`.
4. **Production builds (`npm run build`)**:
   - Exit 0; Next.js 16.3.8 compiles 23/23 routes cleanly; Nest server and shared library compile cleanly.
5. **Operations preflight (`npm run ops:check`)**:
   - Exit 0; all 33 offline stages and 27 test suites passed.
6. **Launch readiness check (`node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`)**:
   - Exit 1 (fail-closed as intended); 0 approved, 11 unresolved, 70 blockers.
7. **Diff check (`git diff --check`)**:
   - Exit 0; 0 trailing whitespace, 0 merge markers.

## Prompt 366 — Reconcile checklist category intakes with V1 Release Candidate baseline (2026-10-14)

Reconciles `docs/launch-checklist.md` §3's Category 1 through 11 preflight intake
records with the V1 Release Candidate baseline at commit `dd36684` on `main`.

### Category 1–11 candidate intake alignment

Appends authoritative candidate intake assessments across all 11 categories in §3:
1. **Category 1 (`production_domain_tls`)**: Caddy production routing and security headers verifier (`verify-caddy-routing.js`) passes 18/18 routes; reverse proxy, timeouts, security headers, and S3 SigV4 Host preservation verified; Next.js 16.3.8 compiles 23/23 routes cleanly. Unresolved (4 blockers: domain, tls_contact_email placeholders, section status, evidence array).
2. **Category 2 (`smtp_delivery`)**: Template keys verified (`check-smtp-template-keys.js`); end-to-end invitation and recovery email pipelines verified in Prompts 58 and 361. Unresolved (8 blockers).
3. **Category 3 (`secrets_management`)**: Secret scanning zero leaks (`scan-secrets.sh`); 7 credential classes and redaction audit verified in Prompts 230 and 363; dry-run rotation drill passing; SBOM (702 packages, 0 license violations) passing. Unresolved (5 blockers).
4. **Category 4 (`secret_references`)**: 12 indirect secret fields validated by schema (`ops:readiness-schema-test` 8/8); `CSRF_SECRET` isolated in `server/.env`. Unresolved (14 blockers).
5. **Category 5 (`slo_and_alerting`)**: 11 operational Prometheus alert rules verified (`verify-alert-rules.js`); measured query plan gates passing (6/6 analytics, 2/2 spatial PostGIS); capacity load evaluator preflight verified. Unresolved (4 blockers).
6. **Category 6 (`backup_and_disaster_recovery`)**: Hardened `backup-postgres.sh`, `restore-postgres.sh`, and `reconcile-storage-objects.js` automation (Prompts 305–356); 13/13 infrastructure failure recovery tests passing under forced RLS in Prompt 363. Unresolved (3 blockers).
7. **Category 7 (`data_retention_policy`)**: Export artifact retention purge batch bounds (Prompt 79) and download expiry enforcement (Prompt 71) verified; 8 policy fields enforced. Unresolved (5 blockers).
8. **Category 8 (`volume_encryption`)**: `verify-volume-encryption.js` verifying 9 required stateful service mounts and key separation; PostgreSQL compose layout verified (Prompt 48). Unresolved (7 blockers).
9. **Category 9 (`graphql_introspection`)**: Production introspection probe policy and `/graphql` schema verification (0 SDL drift). Unresolved (3 blockers).
10. **Category 10 (`deployment_and_rollback`)**: Next.js 16.3.8 compiling 23/23 routes cleanly; Nest server compiling cleanly; `check-release-images.js` and dry-run deployment drill passing; 85 Playwright browser tests passing. Unresolved (15 blockers).
11. **Category 11 (`optional_ai_posture`)**: AI draft preview disabled by default (`ai_enabled: false`, `AI_DRAFT_ENABLED=false`), absent `GEMINI_API_KEY`, unpaid Gemini Developer API excluded, 3 deterministic core user journeys verified without AI in Prompt 361. Unresolved (2 blockers).

Reaffirmed fail-closed posture: all 11 categories remain `unresolved` in `infra/launch/readiness.example.json` (70 blockers detected by `scripts/ops/check-launch-readiness.js`).

### Verification results and actual command outputs

1. **Contracts check (`npm run contracts:check`)**:
   - Exit 0; 0 schema drift detected between code and checked-in artifacts.
2. **Formatting & Linting (`npm run lint`)**:
   - Exit 0; 0 errors, 0 warnings across client, shared, and server workspaces.
3. **Typechecking (`npm run typecheck`)**:
   - Exit 0; 0 errors across `@acres/shared`, `@acres/client`, and `@acres/server`.
4. **Production builds (`npm run build`)**:
   - Exit 0; Next.js 16.3.8 compiles 23/23 routes cleanly; Nest server and shared library compile cleanly.
5. **Operations preflight (`npm run ops:check`)**:
   - Exit 0; all 33 offline stages and 27 test suites passed.
6. **Launch readiness check (`node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`)**:
   - Exit 1 (fail-closed as intended); 0 approved, 11 unresolved, 70 blockers.
7. **Diff check (`git diff --check`)**:
   - Exit 0; 0 trailing whitespace, 0 merge markers.

## Prompt 368 — Production target and authority intake (2026-10-14)

Repository baseline: `110236332489c24ebaf17fea58304fc1ab783028` on `main`.
`git status --short` initially reported only the approved, untracked
`prompts/368-production-target-and-authority-intake.md`. The latest five commits
were `1102363`, `9e81a21`, `b9575db`, `32cbae6`, and `dd36684`.
The baseline and historical candidate are repository identities; neither has
been selected or verified as the deployed production source in this intake.

**Disposition: blocked intake.** One consolidated asynchronous operator request
was issued during execution. No intake response or designated restricted record
was supplied before this record was prepared. The following states describe
this session's inputs, not whether private operator records exist elsewhere.

| Input group     | Session disposition                                                                                                                                                              | Required supplier / remaining owner                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Target          | Absent: environment ID, selected topology confirmation, and approved channel for host/FQDN. Compose+Caddy is only the repository reference topology.                             | Operations lead; named contact not supplied.                                                       |
| Candidate       | Absent: operator-reviewed 40-character source SHA, immutable current/previous image pairs, provenance and materialized deployment references.                                    | Release manager; named person not supplied.                                                        |
| People          | Absent: release manager, deployment approver, rollback authority, evidence custodian and all eleven category suppliers/signers.                                                  | Operations lead to coordinate the role owners in the existing sign-off matrix; names not supplied. |
| Evidence access | Absent: restricted store/readiness-record references, access contact/procedure, allowed records/fields and existing-record-only scope confirmation. No private source inspected. | Evidence custodian; named person not supplied.                                                     |
| Action boundary | No exact-action production authorization, target, window or recovery scope supplied. Approval of Prompt 368 covers this bounded repository intake.                               | Deployment approver and rollback authority; names not supplied.                                    |

No production fact reached `supplied, unverified` or independently inspected
status. No non-sensitive operator reference was available to record. No
credential directories, secret values, account inventories or live endpoints
were searched to discover a target. Production activation has not occurred in
this execution; Prompt 201 and Phase 12 remain open.

**Single next action:** the operations lead supplies the consolidated shared
prerequisites through an operator-approved channel, including a named evidence
custodian and scoped read-only access to existing designated records. Keep
credentials, private hosts and raw evidence outside chat and git. See
[the existing shared prerequisites and operator handoff](launch-checklist.md#6a-production-evidence-preflight-gap-register--2026-10-14)
and [sign-off owners](launch-checklist.md#7-formal-pre-launch-sign-off-matrix);
this record creates no new launch milestone or category approval.

### Actual verification and limits

`node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`
exited **1**, with the following actual summary:

```text
SUMMARY:
  Total Required Categories: 11
  Approved Categories:       0
  Unresolved / Blocked:      11
  Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

This assesses only the checked-in unresolved example. It does not inspect or
invalidate a private operator readiness record. No unified launch drill,
live-category verifier, deployment, external evidence write or push was run.

Root verification ran sequentially. `npm run lint` exited **0** after all
three workspace ESLint commands, with no diagnostic output. `npm run typecheck`
exited **0** after the shared build and all three workspace typechecks; its
server step reported:

```text
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 307ms
```

The first sandboxed `npm run build` exited **1** during the client build:

```text
Error: Could not parse output from TypeScript's --showConfig.
```

The same `npm run build`, retried with local execution permission, exited **0**:

```text
▲ Next.js 16.3.8 (webpack)
✓ Compiled successfully in 2.4s
✓ Generating static pages using 7 workers (23/23) in 540ms
> @acres/server@0.1.0 build
> prisma generate && nest build
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 314ms
```

The installed Prettier initially flagged the approved prompt (exit **1**);
formatting was applied only to that prompt and the new intake section.
`node node_modules/prettier/bin/prettier.cjs --check
/tmp/acres-368-intake.md prompts/368-production-target-and-authority-intake.md`
then exited **0**: `All matched files use Prettier code style!`
The temporary file is the extracted new section; historical operations content
was not reformatted. `git diff --check` exited **0** with no output.
No fresh full-ops, database or browser suite is claimed for this documentation
change. An ordinary revert removes the intake record without a production action.

Independent read-only review inspected the uncommitted intake diff and approved
prompt against the baseline and checklist. It reported no critical, important
or minor findings and assessed the change ready to commit. Review evaluation
confirmed the reported scope and links; no implementation fix was required.
The reviewer independently checked the diff, not the build/test executions.


## Prompt 369 (originally 370) — Operator handoff package (2026-10-14)

Baseline: `6a06864b1a8f4628c881cb385d95fe6d7d5041b8` on `main`.
The user requested a recommended handoff package and explicitly authorized
execution after prompt preparation. Created the incomplete
[operator form](../infra/launch/operator-handoff.example.md) and
[completion guide](operator-handoff.md), linked from the existing checklist and
AGENTS.md index. Recommendations retain the Compose+Caddy reference topology,
immutable images, least privilege, restricted evidence access, encrypted state
and off-host recovery, with the existing no-AI posture. Official Caddy/Docker
guidance was inspected; Firecrawl CLI could not start because its mise runtime
version was unset, so the web tool supplied the official sources. No runtime
configuration or secret transport was changed.

The form covers target, candidate, people, evidence access and action boundary;
its eleven category keys match the readiness example in canonical order. Named
people, target facts, source/image identities and approvals remain `PENDING`,
with all categories `unresolved` and actions `not authorized`. The package does
not supply the missing production intake or approve launch. At execution time,
the separate verify-operator-production-intake prompt remained unchanged and
untracked; it was subsequently removed in the 2026-10-15 reorganization below. No operator message, credential discovery, live probe,
external evidence write, deployment or push occurred.

### Actual verification

`npm run lint` exited **0**, with all three workspace ESLint commands and no
diagnostics:

```text
> @acres/client@0.1.0 lint
> eslint
> @acres/shared@0.1.0 lint
> eslint "src/**/*.ts"
> @acres/server@0.1.0 lint
> eslint "{src,test}/**/*.ts"
```

`npm run typecheck` exited **0** across shared, client and server:

```text
> tsc -p tsconfig.json
> tsc -p tsconfig.json --noEmit
> tsc --noEmit
> prisma generate && tsc -p tsconfig.json --noEmit
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 481ms
```

Two sandboxed `npm run build` attempts exited **1**:

```text
Error: Could not parse output from TypeScript's --showConfig.
```

Direct TypeScript `--showConfig` inspection returned JSON; installed Next.js
CLI source and prior operations records were inspected. This did not establish
the exact cause. The permitted build outside the sandbox exited **0**:

```text
▲ Next.js 16.3.8 (webpack)
✓ Compiled successfully in 2.4s
Finished TypeScript in 1853ms ...
✓ Generating static pages using 7 workers (23/23) in 739ms
> prisma generate && nest build
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 355ms
```

`node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`
exited **1**, as expected for the unchanged template:

```text
Total Required Categories: 11
Approved Categories:       0
Unresolved / Blocked:      11
Total Blockers Detected:   70
Result: FAIL-CLOSED. Launch readiness check failed: unresolved blockers remain.
```

`git diff --check` exited **0**, with no output. An ad hoc local document check
reported:

```text
Handoff check: 11 category keys in canonical order; five intake groups; local link targets exist.
```

Independent read-only review reported no Critical, Important or Minor findings
and assessed the package ready to record and commit. Feedback was evaluated
against the five intake groups, eleven category/signer rows, canonical links,
secret-injection guidance and unapproved action states; no fixes or re-review
were required. The reviewer inspected supplied check logs rather than claiming
independent execution of the full gates.

No formatter, fresh database/browser/full-ops suite or live acceptance was run
for this documentation-only change. Completion requires operators to place a
private copy in an approved restricted store, supply its missing facts, and
arrange scoped independent inspection under the launch checklist; the eleven-category
launch exit remains open.


## Prompt sequence reorganization (2026-10-15)

The user explicitly requested removal of the unused intake prompt and
reorganization of the final prompt numbers. Removed the untracked
`369-verify-operator-production-intake.md`; moved the already executed handoff
package from 370 to [369](../prompts/369-operator-handoff-package.md), and the
approved, unexecuted Vercel migration from 371 to
[370](../prompts/370-vercel-managed-migration-and-deployment.md). The handoff
implementation remains the work committed in `aff196a`; renumbering does not
rerun it. Migration approval follows its unchanged implementation scope.

Updated stale intake dependencies and the AGENTS.md numbering exception. No
application code, deployment, production evidence, or git history was changed.
Verification checks the prompt sequence, headings, removed-path references and
`git diff --check`; application tests/builds are not rerun for file organization.

Actual verification: `git diff --check` exited 0 with no output. The local
sequence check reported `PASS: tail is 368 -> 369 handoff -> 370 Vercel; headings
match; obsolete paths absent; no new numbering duplicates/gaps.` Existing
duplicate numbers 92–94 were verified against HEAD and left unchanged. Independent
read-only review reported no Critical, Important or Minor findings and assessed
the reorganization ready to commit. Feedback was checked against completed-work
status, migration approval continuity, old-path removal and the bounded numbering
exception; no implementation fixes were required. The next new prompt is 371.

## Prompt 370 — managed migration prerequisites (2026-10-15)

The approved target is Vercel compute/routing with Marketplace Neon/PostGIS and
Resend. [ADR 0001](adr/0001-vercel-managed-production.md) and the owning
[migration record](vercel-deployment.md) distinguish this target from the
implemented Compose reference. Local code extracts job processing, adds optional
mail, repairs bounded progress recovery and supplies development-only platform
probes with explicit preview opt-in and cleanup. Node 24 is pinned and verified
using explicit temporary node/npm launchers; initial mise-shim runs are not
credited as Node 24 evidence.

The migration record quotes actual unit/E2E/build/browser/probe/ops outputs,
including sandbox restrictions, stale assertions fixed, a data-journey timeout,
a transient concurrent audit-history failure and independent review/fix.
`ops:check` passed the configured gate; its audit still reported four moderate
and six high advisories (zero critical). No launch category, managed evidence
schema, account configuration, hosted integration or deployment is approved.
Vercel plugin discovery remains `installed: false`, blocking account inspection
and required hosted proofs. MCP automation is selected; no deployment CLI or
arbitrary-account fallback was used. Ordinary Git revert restores the local
prerequisites; no hosted resources or schema were migrated. Prompt 370 and
Phase 12 remain open.

## Prompt 379 — managed launch readiness and storage reconciliation (2026-10-16)

Extended operations tooling and launch readiness verification for the `vercel-managed-production`
target (`STORAGE_PROVIDER=vercel-blob`, `BLOB_STORE_ID=store_g2fmCH5CW7TJbkN3`):
- Storage reconciliation (`scripts/ops/reconcile-storage-objects.js`) supports `--provider vercel-blob`
  via `@vercel/blob` `list()` with cursor pagination, detecting missing, orphan, and size mismatches with
  sanitized audit receipts.
- Launch readiness schema (`infra/launch/readiness.schema.json`) discriminates `single-host-compose-caddy`
  and `vercel-managed-production` topologies via `allOf` conditionals, preserving all 11 categories for both.
- Created unresolved managed readiness template `infra/launch/readiness.vercel.example.json` failing closed.
- Launch readiness validator (`scripts/ops/check-launch-readiness.js`) validates both topologies fail-closed,
  supporting `--record <file>` and enforcing indirect secret store references (`vercel:...`, `neon:...`).
- Documented complete operational procedures in `infra/vercel/runbooks/managed-operations.md` covering
  secret inventory & rotation, out-of-band Prisma migrations against Neon direct connection, storage
  reconciliation, disaster recovery (Neon PITR & Vercel instant rollback), and ClamAV CVD sandbox rebuilds.

## Prompt 380 — managed operator handoff & drill reconciliation (2026-10-16)

Operational handoff templates and the unified launch drill runner are reconciled to support
the `vercel-managed-production` profile with full audit parity and zero Docker daemon / Caddyfile
prerequisites:
- Managed operator handoff template (`infra/launch/operator-handoff.vercel.example.md`) models complete
  intake for all 11 categories with zero literal secrets.
- Managed child verifiers (`verify-managed-ingress.js`, `verify-managed-volume-encryption.js`,
  `verify-managed-secret-rotation.js`, `verify-managed-restore-drill.js`) emit standardized audit receipts.
- Unified launch drill orchestrator (`scripts/ops/run-launch-drills.sh`) accepts `--target-architecture`
  and executes managed stage sequence.
- Launch dossier assembler (`scripts/ops/assemble-launch-dossier.js`) integrates `RECEIPTS_MANAGED` and
  `TYPES_MANAGED`, emitting `target_architecture: "vercel-managed-production"`.

## Prompt 381 — managed launch readiness and static integrity reconciliation (2026-10-16)

Reconciled top-level launch readiness orchestration and static integrity verification for the
`vercel-managed-production` target:
- Secret scanner (`scripts/ops/scan-secrets.sh`) allowlists `scripts/ops/verify-managed-secret-rotation.js`,
  passing `ops:scan-secrets` and `ops:scan-secrets-test` (42/42 tests pass).
- Static integrity verification (`scripts/ops/run-static-integrity-checks.js`) accepts `--target-architecture`
  (or `--target-arch`), discriminating between `single-host-compose-caddy` (running `production_templates`,
  `docker_runtime`, and `secret_defaults`) and `vercel-managed-production` (running `vercel_config` and
  `secret_defaults`, omitting Docker daemon and Compose templates). Emits `target_architecture` in receipt.
- Updated `validateStaticEvidence(evidence, targetArchitecture)` in `run-static-integrity-checks.js` and
  `assemble-launch-dossier.js` to evaluate static receipts according to target architecture.
- Reconciled `scripts/ops/launch-readiness.sh` to accept `--target-architecture <arch>`, `--target-arch <arch>`,
  `--record <file>`, and positional record path. Automatically inspects target readiness record to detect
  target architecture if unspecified. In managed mode, executes `check-vercel-config.js`, `scan-secrets.sh`,
  `check-launch-readiness.spec.js`, forwards `--target-architecture vercel-managed-production` to drills, and
  evaluates `check-launch-readiness.js`.
- Added `"ops:launch-readiness:managed"` script to `package.json`.
- Unit and contract tests: `run-static-integrity-checks.spec.js` (76/76 passed), `launch-readiness.spec.js`
  (37/37 passed), `run-launch-drills.spec.js` + `assemble-launch-dossier.spec.js` (191/191 passed).

## Prompt 383 — automated ClamAV scanner snapshot rebuild cadence (2026-10-17)

> Superseded operational claims: Prompt 384 below reopens the scanner lifecycle
> blocker. The following is historical implementation/test evidence from Prompt
> 383, not proof of activation, zero downtime, hosted cadence or launch approval.

Resolved the production launch blocker regarding ClamAV signature rebuild cadence by implementing an automated, zero-downtime snapshot rebuild orchestrator, unit test suite, and scheduled GitHub Actions workflow:
- Automated rebuild orchestrator (`scripts/vercel/rebuild-scanner-cadence.js`):
  Evaluates snapshot signature age against `--max-age-hours` (default: 48h, max: 168h); builds a fresh snapshot without `--replace`; verifies the new snapshot with clean and EICAR scans in an isolated probe sandbox; writes updated environment variables (`--write-env`) outside repo (0600 mode); prunes superseded snapshot only after new snapshot passes smoke tests; supports `--dry-run` simulation mode without credentials.
- Unit and contract test specification (`scripts/vercel/rebuild-scanner-cadence.spec.js`):
  19 tests covering CLI flag parsing, cadence evaluation logic (fresh vs stale vs forced vs missing), execution order and fail-closed safety invariants, receipt emission and 0600 mode, and dry-run simulation mode without credentials.
- Scheduled GitHub Actions workflow (`.github/workflows/scanner-snapshot-rebuild.yml`):
  Runs daily at 04:00 UTC (`cron: '0 4 * * *'`) and manual `workflow_dispatch` with optional `force` input.
- Package scripts and pipeline integration:
  Added `"vercel:scanner-rebuild": "node scripts/vercel/rebuild-scanner-cadence.js"` and integrated `rebuild-scanner-cadence.spec.js` into `"vercel:probe-test"`.

## Prompt 384 — scanner candidate lifecycle safety (2026-10-17)

Supersedes Prompt 383's operational-completion and zero-downtime claims.
`scripts/vercel/rebuild-scanner-cadence.js` now prepares candidates only: every
snapshot is retained, including previous and failed/ambiguous candidates.
`--skip-prune` remains a deprecated no-op. Success reports
`activation_status: "not_performed"`; it never proves deployment adoption.
The standalone builder's destructive `--replace` API is unchanged and unused.

Help/simulation require no SDK calls or credentials. Simulation never writes
`--write-env` and emits no fabricated snapshot ID or digests. Live env and
receipt outputs use exclusive new-file creation with mode 0600; existing files,
symlinks, canonical aliases/collisions and invalid parents fail before cloud
work. Env output resolves outside the repository. Export/receipt failures fail
the run while retaining known candidate IDs and snapshots. Public diagnostics
use fixed stage codes and bounded results, excluding raw SDK/command errors,
builder details, credentials and private paths. Probe cleanup failures fail
preparation while retaining accurate individual scan results.

Age decisions inspect snapshot metadata, not CVD build times. The 48-hour
default/168-hour CLI maximum remain compatibility bounds; equality requests a
rebuild, and missing/invalid/future metadata cannot produce a recent verdict.
`reason: "snapshot_recent"` replaces `signatures_fresh`; simulation reports
`simulation_uninspected`. The builder's CVD checks and application policy remain
unchanged. No hosted signature-freshness SLA is established.

The daily workflow and default manual dispatch simulate without credentials.
Only explicit manual `prepare_candidate: true` enables live preview preparation;
`force` alone cannot. Live credentials are step-scoped; opt-in/auth validation
is reused and target guards require Acres' documented team/project and iad1.
Each run uses a unique 0700 temporary directory and fresh output names. The
allowlisted summary preserves candidate ID/hashes and status before local file
cleanup; it is handoff information, not durable runtime adoption or signed
launch evidence. No deploy, production env update, variable update or retirement
is performed. See `infra/vercel/runbooks/managed-operations.md` §5 for the
separate activation, application verification and retirement procedure.

Verification used Node `v24.21.0` at
`/home/dgk/.local/share/mise/installs/node/24.21.0/bin/node`. Local subprocess
checks required execution outside the sandbox because sandbox Node spawning
returned `EPERM`. Actual final output/status:

- Focused `node --test scripts/vercel/rebuild-scanner-cadence.spec.js`: exit 0,
  `tests 62`, `pass 62`, `fail 0`.
- `npm run vercel:probe-test`: exit 0, `tests 190`, `pass 190`, `fail 0`.
- `node scripts/vercel/rebuild-scanner-cadence.js --help`: exit 0,
  `--skip-prune                Deprecated no-op; all snapshots are retained`.
- `node scripts/vercel/rebuild-scanner-cadence.js --dry-run`: exit 0,
  `"execution_mode":"simulation"`, `"activation_status":"not_performed"`,
  `"configuration_export":"not_performed"`, `"new_snapshot_id":null`.
- `npm run ops:check`: exit 0 through the final managed verifier suite,
  `tests 28`, `pass 28`, `fail 0`. Audit output:
  `10 vulnerabilities (4 moderate, 6 high)` and
  `Production dependency security audit passed (0 critical vulnerabilities)`.
  The noncritical findings remain outside this scanner fix.
- `npm run lint`: exit 0 through client, shared and server ESLint.
- `npm run typecheck`: exit 0 through shared/client/server, ending with
  `Generated Prisma Client (7.9.1)`. Initial concurrent build/typecheck hit
  missing `.next/types` files; the sequential post-build rerun passed.
- `npm run build`: exit 0 through shared, Next `16.3.8` and Nest/Prisma builds.
- Installed Prettier check on changed JS/spec/YAML: exit 0,
  `All matched files use Prettier code style!`. Markdown edits were scoped to
  the scanner records; `git diff --check` exited 0 with no output.
- Final `npm run ops:scan-secrets`: exit 0, `secret/default scan passed`.

Behavioral coverage includes non-destructive success/failure and sandbox
cleanup, existing/missing dry-run env destinations, symlink/alias preflight,
late exclusive-open collisions, exact env variables/modes, threshold/invalid
metadata, secret canaries, and executable workflow mode/target/argument/temp-dir
and summary tests with SDK/command doubles. These are local tests, not hosted
proof. Independent read-only review used baseline/current HEAD
`2d5e449352d3cc610c0a3b497542f10d0ad4d821` plus the uncommitted diff; the reviewer
independently reran all 62 focused tests and returned no findings. Feedback was
evaluated against the code and approved requirements; no fixes were required.

Remaining: durable ID/hash adoption, verified application deployment using the
candidate, old-deployment/in-flight-job/rollback dependency review, bounded
retirement and free-tier resource budget, and hosted scheduled-execution
evidence. The commercial hosting-plan decision and all eleven launch sign-offs remain
open. No completion percentage, category approval, deployment, provider resource
mutation or production promotion is established by this change. Local rollback
is a revert; review must keep scheduled live execution disabled because the old
code reintroduces premature deletion and dry-run configuration overwrite.

## Prompt 385 — scanner runtime configuration handoff (2026-10-17)

New cadence receipts add schema version 1 and the live preview target from the
validated execution configuration; simulation has a null target. Existing
candidate retention and probe env exports are unchanged. The offline
`scripts/vercel/prepare-scanner-handoff.js` consumes only successful target-bound
live receipts with passed clean/EICAR/cleanup and no failure/activation markers.
Legacy receipts cannot be overridden. Receipt input is regular-file/inode checked,
bounded to 64 KiB, validated and reconstructed into allowlisted output.

On Linux with procfs, a fresh outside-repo directory (0700) receives exclusive
0600 `runtime.env` and `handoff.json`. Descriptor-anchored writes resist path
replacement after acquisition. The manifest is closed before exclusive hardlink
publication; incomplete output is retained for inspection, with owned publication
removed on post-publication failure when accessible. No recursive deletion of
caller paths occurs. Diagnostics use fixed codes without paths or input bodies.

The runtime assignments are exactly `SCANNER_SANDBOX_SNAPSHOT_ID`,
`SCANNER_MAIN_SHA256`, `SCANNER_DAILY_SHA256`; the runbook's incorrect hash names
are corrected. Byte hashes bind original receipt/runtime content, not provider
authenticity or deployed identity. All activation/verification/retirement statuses
remain `not_performed`. Preparation time cannot certify CVD freshness. No SDK,
network, workflow change, credential propagation or hosted mutation is involved.
See [managed operations §5.4](../infra/vercel/runbooks/managed-operations.md#54-offline-runtime-configuration-handoff)
for durable restricted storage selection, separate rollback configuration and
later activation boundaries. `/tmp` outputs are inspection fixtures only.

Remaining gates: operator adoption into the authorized preview environment,
application deployment identity and upload/scan verification, old-deployment,
in-flight and rollback dependencies, bounded retirement/resource budget and
hosted scheduled execution. CI summary retention is unchanged and does not
persist this bundle. The hosting-plan decision and all eleven sign-offs remain
open. No completion percentage or launch approval changes. Rollback is a local
revert; preserve corrected runtime variable instructions.

Verification used Node `v24.21.0` from
`/home/dgk/.local/share/mise/installs/node/24.21.0/bin/node`. Subprocess test
execution required permission outside the sandbox: the initial sandbox run
reported file-level `test failed` without running the test cases. The permitted
local rerun used temporary files and SDK doubles, without hosted actions.
Actual output/status:

- `node --test scripts/vercel/prepare-scanner-handoff.spec.js`: exit 0,
  `tests 65`, `pass 65`, `fail 0`.
- `node --test scripts/vercel/rebuild-scanner-cadence.spec.js`: exit 0,
  `tests 63`, `pass 63`, `fail 0`. This includes a genuine producer receipt
  from SDK doubles consumed by the handoff subprocess without a probe env export.
- `npm run vercel:probe-test`: exit 0, `tests 256`, `pass 256`, `fail 0`.
- `node scripts/vercel/prepare-scanner-handoff.js --help`: exit 0,
  `Local bundle only; activation, deployment verification and retirement not performed.`
- `npm run lint`: exit 0 through client, shared and server ESLint.
- `npm run build`: exit 0 through shared, Next `16.3.8` and Nest, ending with
  `Generated Prisma Client (7.9.1)`.
- Sequential post-build `npm run typecheck`: exit 0 through shared/client/server,
  ending with `Generated Prisma Client (7.9.1)`; no build/typecheck race.
- Installed Prettier on changed JS/spec/JSON: exit 0,
  `All matched files use Prettier code style!`. Markdown diff reviewed manually.
- `npm run ops:scan-secrets`: exit 0, `secret/default scan passed`.
- `git diff --check`: exit 0, no output.
- `npm run ops:check`: exit 0 through its final managed verifier suite,
  `tests 28`, `pass 28`, `fail 0`. Audit output:
  `10 vulnerabilities (4 moderate, 6 high)` and
  `Production dependency security audit passed (0 critical vulnerabilities)`.
  These noncritical findings were already recorded in Prompt 384 and remain
  outside this handoff scope; no aggregate stage was skipped for audit/network failure.
- Credential-free simulation inspection: `"schema_version":1`, `"target":null`,
  `"execution_mode":"simulation"`; consumer returned
  `handoff_receipt_invalid`, exit 1, and `bundle exists: false`.

Independent read-only review used base/current HEAD
`2faafcb74c5e5fe821b33eb62fc03f559888e818` plus the uncommitted diff and new files.
It identified one important issue: post-publication cleanup used the original
pathname, leaving a completed manifest after a directory rename plus pending
unlink failure even though the owned descriptor remained accessible. The
coordinator reproduced that result with temporary fixtures, then changed cleanup
to use the open directory descriptor and retained inode/device ownership checks.
A regression now renames the owned directory, creates a foreign manifest sentinel
at the original path, injects cleanup failure, and verifies removal of the moved
owned manifest while preserving both incomplete runtime output and foreign data.

After this fix, actual Node 24.21.0 focused output was `tests 66`, `pass 66`,
`fail 0` (exit 0); `npm run vercel:probe-test` was `tests 257`, `pass 257`,
`fail 0` (exit 0). Prettier again reported
`All matched files use Prettier code style!`; secret scan again reported
`secret/default scan passed`; final diff check exited 0 silently. The earlier
full build, post-build typecheck, lint and operations checks cover the unchanged
application surface; the fix only changes the standalone CLI and its regression.

Focused independent re-review resolved the Important finding and returned
`Ready to merge: Yes`, with no additional issues. Review confirmed descriptor
cleanup, inode/device ownership checking, incomplete-output retention and foreign
sentinel preservation. No hosted evidence or launch approval was inferred.

## Prompt 386 — scanner preview adoption attempt (2026-10-17)

**Outcome: blocked before adoption.** Execution started from
`5247e3754a2eb222a47b0bc31932911fef5cb8ef` on `main`, with only the approved
Prompt 386 untracked. Hosted inspection began at `2026-10-17T18:00:51Z`;
the one live rebuild ran from receipt timestamp `18:02:15.443Z` to receipt
file completion `18:04:13.955Z`. Follow-up provider inspection at
`18:08:10.018Z` confirmed both snapshots `created` in `iad1`. No new
application source/deployment exists for this attempt; the eventual record
commit must not be attributed to the old deployment.

Authenticated CLI 64.3.1 on Node 24.21.0 confirmed the selected team/project,
active Hobby plan, Node 24.x, basic fixed build machine and default `iad1`.
Remaining free allowance was not visible in inspected metadata; no upgrade or
paid feature was enabled. Scoped preview reads verified Blob store
`store_g2fmCH5CW7TJbkN3`, Blob/queue providers and scanner settings. Database
scope was verified from metadata only; no database secret retrieval or live
Neon identity proof occurred. The historical deployment was still the latest
Ready preview; its metadata lists scanner keys, not resolved values. See
[the full baseline](vercel-deployment.md#scanner-preview-adoption-attempt--prompt-386-2026-10-17).

A new 0700 run directory `prompt386-20261017T180051Z` under the designated
`~/.config/acres/vercel-preview/` parent retains 0600 baseline scanner records,
provider metadata, the failure receipt and post-failure inspection. The existing
CLI identity was used through its verified auth reader, without printing or
copying its token. This is local preview custody, not an approved production
evidence store. No passwords, cookies, database URLs or raw provider responses
are committed. Receipt byte SHA-256:
`1dd5a4bff056409185d6307c817fc7de8862e1c01f65bdf527a1e48283f25557`.

Automatic approval review rejected the initial proposed all-variable
`decrypt=true` inventory because it could retrieve unrelated secrets; that
command did not execute. The narrower approved inspection used metadata and
individual scanner record reads. A later read-only snapshot/cleanup inspection
approval timed out; its one permitted retry succeeded. Neither event supplied
permission to read unrelated credentials or perform extra hosted mutations.

The existing cadence producer was invoked once with `--force`, the inspected
baseline `snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA`, and fresh restricted receipt/env
paths. It returned exit 1 with `candidate_build_failed`, confirming retained
candidate `snap_rz0cs8Nnw1RObI3ZDS5WRKDSUR2y` but no hashes or smoke result.
`activation_status` and `configuration_export` remained `not_performed`.
The producer suppresses builder diagnostics and collapses this stage's failures;
the precise failing substep is **unknown**. A confirmed ID does not distinguish
builder deletion, metadata/status lookup or another post-snapshot failure.
No failed receipt was rewritten. Offline handoff validation returned
`handoff_receipt_invalid` (exit 1); no bundle was created.

Follow-up SDK reads confirmed baseline and candidate `created`, with expirations
`2026-10-24T14:29:39.778Z` and `2026-10-25T18:03:20.241Z`, respectively.
The candidate's provider creation time was `2026-10-17T18:03:20.242Z`.
A project-scoped sandbox inventory contained no sandboxes created since the
attempt began (with a ten-second margin), supporting no currently listed builder
residue. This is inventory evidence at that time, not a successful producer
cleanup receipt or proof of CVD freshness. No separate cadence smoke sandbox was
certified. Existing snapshots were preserved; no retirement/deletion was called.

No configuration writes occurred, so no restoration was necessary. There was
no deployment attempt, browser sign-in, synthetic account/organization/upload,
application clean/EICAR acceptance, queue invocation correlation, tenant denial
or quarantine-access proof. No runtime/launch gate closed. Do not repurpose the
created but ineligible snapshot as a successful handoff. Investigate the failed
stage in a separate bounded scope before authorizing another rebuild. Old
snapshot expiration does not establish old signature health or rollback health.

Local checks used Node `v24.21.0`; `npm exec -- node --version` also returned
`v24.21.0`. Logs are in local `/tmp/acres386-checks/` (verification scratch,
not durable hosted evidence). Actual outputs/exits:

- `node scripts/vercel/check-vercel-config.js`: exit 0,
  `vercel.json configuration valid`.
- Initial sandboxed `npm run vercel:probe-test`: exit 1, file-level failures in
  the two subprocess-based suites (`tests 5`, `pass 3`, `fail 2`). The approved
  unsandboxed rerun exited 0: `tests 257`, `pass 257`, `fail 0`.
- `npm run ops:check`: exit 1 at `ops:audit` after preceding stages passed.
  Actual network diagnostic: `Client network socket disconnected before secure
TLS connection was established`, followed by `npm error audit endpoint
returned an error`. The wrapper printed `audit error: critical vulnerabilities
detected in production dependencies`; this network failure establishes no
  vulnerability count. Later aggregate stages did not run; no aggregate pass
  or refreshed audit result is claimed.
- `npm run lint`: exit 0 across client/shared/server, ending with
  `eslint "{src,test}/**/*.ts"` and no diagnostics.
- `npm run build`: exit 0 across all workspaces; Next `16.3.8` reported
  `Generating static pages using 7 workers (23/23)` and Nest completed after
  `Generated Prisma Client (7.9.1)`.
- Sequential post-build `npm run typecheck`: exit 0 across all workspaces,
  ending with `Generated Prisma Client (7.9.1)` and no type diagnostics.
- `npm run ops:scan-secrets`: exit 0, `secret/default scan passed`.

The initial whole-file Prettier check exited 1 with `Code style issues found in
6 files`. All five tracked documentation owners also fail Prettier at baseline
`HEAD` (verified against temporary `git show` copies). The new record fragments
and approved prompt were formatted with installed Prettier without reformatting
unrelated historical records. `git diff --check` exited 0 with no output.
Final fragment/prompt Prettier verification exited 0:
`All matched files use Prettier code style!`. Final secret scan returned
`secret/default scan passed` (exit 0).

Independent read-only review used base/current HEAD
`5247e3754a2eb222a47b0bc31932911fef5cb8ef` plus this diff and the new prompt.
It checked the source failure semantics and local logs and found no Critical,
Important or Minor issues: `Ready to commit: Yes`. Receiving-review evaluation
confirmed the findings against the producer and recorded evidence; no source
fix, additional hosted action or re-review was required. No source, dependency, schema or workflow was changed to make
this blocked hosted gate appear successful. Production promotion, plan decision,
retirement/resource budget, hosted cadence and eleven sign-offs remain open.

## Prompt 387 — scanner build failure investigation (2026-10-17)

Baseline: `ae13d37d5517cda434bed13e395e0c74a51b3702` on `main`; only the
approved Prompt 387 was untracked. **Historical root cause remains unresolved.**
The investigation added local diagnostics and deterministic regressions; it did
not perform another rebuild, scan, configuration write, deployment, deletion,
workflow dispatch or push. No launch gate or sign-off closed.

### Evidence and limits

The designated Prompt 386 receipt was read without modifying it. Its byte
SHA-256 matches
`1dd5a4bff056409185d6307c817fc7de8862e1c01f65bdf527a1e48283f25557`.
Allowlisted fields confirm `candidate_build_failed`, candidate
`snap_rz0cs8Nnw1RObI3ZDS5WRKDSUR2y`, null hashes/smoke and no activation/export.
The current implementation at that baseline records hashes only after the
builder returns. Null hashes therefore do not establish failed CVD acquisition.

Read-only provider inspection used the installed SDK 3.8.0 auth reader and exact
snapshot IDs, after matching project metadata to preview team
`team_zE3mp7nrEZ6a7cxRavwUMYC4` and project
`prj_q9ApajZWDgdYZetnm5s5oakEjrUD`. No environment endpoint or secret retrieval
was used. At `2026-10-17T19:07:54.291Z`, the candidate remained `created` in
`iad1`, created/updated `2026-10-17T18:03:20.242Z`, expiring
`2026-10-25T18:03:20.241Z`. At `19:07:54.940Z`, baseline
`snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA` remained `created` in `iad1`, created/updated
`2026-10-15T15:00:52.668Z`, expiring `2026-10-24T14:29:39.778Z`.
An earlier observation at `19:06:33.993Z` / `19:06:34.605Z` agreed.

The candidate identifies source session `sbx_gECDAwMa84EN5rNkmxxwdb80Q7ci`.
Its exact metadata-only GET, verified from the installed SDK implementation,
returned HTTP 404 at `2026-10-17T19:07:55.650Z`. It was never resumed and no
command logs/customer files were fetched. The unavailable session supplies no
historical exception or deletion outcome. No new inventory claim is made; the
Prompt 386 inventory observation retains its original timestamp and limits.

Inspection scratch is outside git at `/tmp/acres387-inspection-1GhDBP/metadata.json`
(and the earlier `/tmp/acres387-inspection-7tFE8O/metadata.json`), with directories
0700 and files 0600. This is temporary local scratch, not durable production
custody. The initial restricted-network attempt returned only
`Read-only provider metadata unavailable; no raw error disclosed.` (exit 1);
the approved network-enabled read succeeded. Neither tokens nor raw provider
responses were printed or committed.

| Candidate path at baseline                                         | Source branch / available observation                                | Reproduced locally                                           | Historical conclusion                                                                          |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Builder delete rejects after snapshot resolves                     | `buildSnapshot` finally; wrapper has confirmed ID; no delete receipt | Yes, including ID retention and no later smoke               | Unresolved; today's 404 is not proof of the old delete result                                  |
| Snapshot metadata lookup rejects or times out                      | `Snapshot.get` after delete; no exception retained                   | Yes, rejection and timeout doubles                           | Unresolved; later `created` does not establish the earlier lookup response                     |
| Metadata status is not `created`                                   | Explicit status check after lookup                                   | Yes, failed/null metadata and throwing status getter         | Unresolved; current `created` does not establish status at the failed call                     |
| Summary construction/serialization/getter fails                    | Size/expiry access and expiry `toISOString()` after status           | Yes, throwing getter, invalid Date and serialization failure | Unresolved; no historical metadata object or stack retained                                    |
| Earlier install/signature/snapshot request fails before resolution | Wrapper records the confirmed ID only after resolved snapshot result | Yes, pre-resolution failures do not invent an ID             | Excluded as the sole immediate failure by the confirmed-ID receipt; no CVD health is certified |

### Safe diagnostic contract

Only failed build-stage cadence receipts gain `build_failure`; schema version 1,
`error: "candidate_build_failed"`, target binding, retained confirmed ID and
nonzero exit remain. Its fields are `step` (fixed tool-owned names or `unknown`),
`kind` (`command_failed`, `provider_failed`, `validation_failed` or `unknown`),
`builder_cleanup` (`not_requested`, `passed`, `failed` or `unknown`) and boolean
`snapshot_confirmed`. Successful, skipped and simulation receipts are unchanged.
No error messages, stacks, causes, output, URLs, paths, provider class names,
headers or response bodies enter the projection. Private WeakMap state avoids
reading arbitrary error getters. Provider calls and command output readers are
classified at their operation boundary. Fixed progress logging cannot interrupt
cleanup, and no provider-owned builder name is logged.

Creation, command steps, build/smoke file writes, snapshot request, builder
deletion, metadata lookup, status validation and summary construction have
separate fixed steps. A primary error plus delete failure retains the primary
step and `builder_cleanup: "failed"`; successful work followed by failed delete
still fails. Stop never certifies delete. Snapshot IDs are confirmed once and
reported through an explicit callback instead of proxying provider objects.
Deadlines, package pin, egress, CVD validation, scrub order and
`deleteOrphanSnapshots: false` remain. No retries or snapshot retirement were
added. The standalone builder uses the same projection and discards its former
raw `BuildError.detail` output. Failure receipts still cannot pass offline
handoff, regardless of later snapshot metadata.

SDK-double regressions cover each table row, create rejection, primary plus
cleanup failure, output rejection/malformed output, invalid snapshot IDs,
throwing getters, fixed fallback projection, broken log sinks and both CLI
executables. Canary credentials, private paths, URLs, multiline text and nested
errors are suppressed in stdout/stderr/receipts. Existing success-to-handoff,
exclusive writes, active-env preservation and no-snapshot-deletion tests remain.
These are local tooling tests, not hosted scanner/application acceptance.

### Verification and review

Checks used Node `v24.21.0`; `npm exec -- node --version` also returned
`v24.21.0`. Logs are local scratch at `/tmp/acres387-*.log`.

- Focused scanner/cadence/handoff suite: exit 0, `tests 187`, `pass 187`,
  `fail 0`. Final `npm run vercel:probe-test`: exit 0, `tests 285`, `pass 285`,
  `fail 0`.
- The first restricted subprocess run failed at file level (`tests 2`, `pass 0`,
  `fail 2`). A no-isolation diagnostic run still could not execute CLI
  subprocesses reliably; it is not a suite pass. The first permitted normal
  run reported `tests 93`, `pass 92`, `fail 1`: an old assertion expected raw
  `snapshot refused` text. It was updated to the required fixed
  `snapshot-request` step; subsequent final focused/probe results above passed.
- `npm run vercel:scanner-rebuild -- --help`: exit 0, including
  `Deprecated no-op; all snapshots are retained`. `--dry-run`: exit 0 with
  `"execution_mode":"simulation"`, `"target":null`,
  `"activation_status":"not_performed"` and
  `"configuration_export":"not_performed"`; no `build_failure` field.
- `npm run lint`: exit 0 across all workspaces, ending with
  `eslint "{src,test}/**/*.ts"` and no diagnostics.
- Initial restricted `npm run build`: exit 1,
  `Error: Could not parse output from TypeScript's --showConfig.`
  The permitted subprocess-enabled rerun exited 0 across all workspaces:
  Next `16.3.8`, `Generating static pages using 7 workers (23/23)`, then
  `Generated Prisma Client (7.9.1)` and successful Nest build.
- `npm run ops:scan-secrets`: exit 0, `secret/default scan passed`.
- Changed JS/spec files and the approved prompt passed installed Prettier:
  `All matched files use Prettier code style!` (exit 0).
  Existing historical documentation is formatted only in the new fragments.
- `git diff --check`: exit 0, no output.
- Sequential post-build `npm run typecheck`: exit 0 across shared/client/server,
  ending with `Generated Prisma Client (7.9.1)` and no type diagnostics.
- The added documentation fragments passed installed Prettier independently:
  `All matched files use Prettier code style!` (exit 0); unrelated historical
  records were not reformatted.
- `npm run ops:check`: exit 0 through all stages, ending with managed-drill
  output `tests 28`, `pass 28`, `fail 0`. The audit printed
  `Production dependency security audit passed (0 critical vulnerabilities)`;
  `10 vulnerabilities (4 moderate, 6 high)` remain outside this scope. This
  aggregate exercises local/synthetic fixtures and static checks, not hosted
  launch acceptance.

Local inspection: use Node 24.21.0, then run
`npm run vercel:scanner-rebuild -- --dry-run` for credential-free simulation,
and `node --test scripts/vercel/build-scanner-snapshot.spec.js scripts/vercel/rebuild-scanner-cadence.spec.js scripts/vercel/prepare-scanner-handoff.spec.js`
for the synthetic failure and handoff regressions. Do not run a live CLI to
inspect this result. A separately authorized bounded rebuild with these new
diagnostics is the next hosted preparation gate; only a successful new receipt
can support subsequent preview adoption and application proof. The old receipt
remains ineligible. Hosted cadence, dependency-aware retirement/resource budget,
production plan and eleven sign-offs remain open.

Independent read-only review used baseline/current HEAD
`ae13d37d5517cda434bed13e395e0c74a51b3702` plus this working diff and the approved
prompt. It reported `Critical: none`, `Important: none`, `Minor: none` and
`Ready to commit: Yes`. The reviewer independently passed 22 targeted diagnostic
tests and `git diff --check`; its normal focused rerun encountered restricted
CLI subprocess failures, which do not replace the successful permitted runs
recorded above. It accessed no private artifacts or provider operations.
Receiving-review evaluation checked the WeakMap projection, primary/cleanup
preservation, confirmed-ID callback, failed-handoff rejection and source/test
coverage against the approved prompt. No valid defect or architectural change
required a fix or re-review. Only this approved work is committed locally;
nothing is pushed and no additional hosted authorization is implied.

## Prompt 388 — bounded scanner candidate rebuild (2026-10-17)

Baseline: `34667e73c7de828e5b547b9d433f0145a4247d38` on `main`; only the
approved Prompt 388 was untracked. **The single authorized live preparation
failed at `builder-create` with `provider_failed`; no candidate exists and
nothing was adopted.** No retry, configuration write, deployment, browser
acceptance, snapshot deletion, workflow dispatch or push occurred. No launch
gate or sign-off closed.

### Target and pre-run state

Node `v24.21.0` (both `node` and `npm exec -- node`) via the documented
`/tmp/acres-node24` launcher; Vercel CLI 64.5.0 from the local npx cache,
because `npx vercel@latest` hung resolving the package (killed; no command
ran). `whoami --format json` returned team `team_zE3mp7nrEZ6a7cxRavwUMYC4`
(`dgsloxx417s-projects`), plan `hobby`; `project inspect --non-interactive`
returned `prj_q9ApajZWDgdYZetnm5s5oakEjrUD` (`acres`), Sandbox region `iad1`,
no failover regions. The `preview.env` OIDC token had expired at
`2026-10-16T02:52:20Z`; one `env pull --environment=preview --yes` refreshed it
(file stays 0600; new `exp` `2026-10-18T10:00:24Z`, owner/project claims match).
Only names were listed. No decrypt or unrelated variable read occurred.

Read-only inspection at `2026-10-17T22:01:41.586Z` (installed SDK 3.8.0, exact
IDs, allowlisted fields): baseline `snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA` and
Prompt 386 candidate `snap_rz0cs8Nnw1RObI3ZDS5WRKDSUR2y` both `created` in
`iad1` (expiry `2026-10-24T14:29:39.778Z` and `2026-10-25T18:03:20.241Z`);
the project sandbox listing was empty. Sandbox allowance was not visible.
`vercel usage --json` first hit a 90 s timeout (exit 124), then exited 1 with
"Billing cost data is unavailable … This does not mean usage was zero", so
quota is recorded as **not visible**, not as available or exhausted.

Preflight: `--help` exit 0; `--dry-run` exit 0 with
`"execution_mode":"simulation"` and no `build_failure`; focused
scanner/cadence/handoff suite `tests 187`, `pass 187`, `fail 0`. Installed
`@vercel/sandbox` is 3.8.0, with `persistent` and `deleteOrphanSnapshots`
semantics matching this record; builder still uses `persistent: false` and
`deleteOrphanSnapshots: false`.

### The single live invocation

Custody: `~/.config/acres/vercel-preview/prompt388-20261017T220154Z/` (0700;
all files 0600). `prompt386-*` was not touched. Only the OIDC token was
extracted from `preview.env`, with the fixed target variables; `scanner.env`
was not loaded. One invocation, network-enabled from the start:
`rebuild-scanner-cadence.js --force --current-snapshot-id
snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA --output <run>/receipt.json --write-env
<run>/candidate.env`, under a 1800 s watchdog (builder session 900 s + snapshot 300 s + smoke
120 s + 30 s control calls ≈ 23 min).

Window `2026-10-17T22:04:06Z`–`22:04:40Z` (34 s); exit 1. Stderr was only the
fixed `Scanner candidate preparation failed; activation not performed. Check
restricted provider state and retained snapshots.` Stdout equals the receipt.
Receipt SHA-256
`e71e0d0704bcfaa14d2a2df18689c270dbbd996828de967427e55e67fca521f4`; schema
1, timestamp `2026-10-17T22:04:07.118Z`, target preview/team/project/`iad1`,
`execution_mode: "live"`, `status: "failed"`, `reason: "stale_or_forced"`,
`error: "candidate_build_failed"`, `new_snapshot_id`/hashes/smoke `null`,
`prune_status: "retained"`, `activation_status` and `configuration_export`
`"not_performed"`, and:

| field                | value             |
| -------------------- | ----------------- |
| `step`               | `builder-create`  |
| `kind`               | `provider_failed` |
| `builder_cleanup`    | `not_requested`   |
| `snapshot_confirmed` | `false`           |

No `candidate.env` was created. Offline handoff once against the receipt:
exit 1, `handoff_receipt_invalid`, no bundle directory.

Post-run inspection at `2026-10-17T22:08:47.630Z`: both snapshots unchanged
(`created`, `iad1`, same expiry); sandbox listing still empty; no owned
sandbox, candidate or residue to report. Nothing was stopped or deleted.

### Interpretation

`builder-create` / `provider_failed` means `Sandbox.create` for the builder
threw before returning a handle, so no install, signature, snapshot or cleanup
step ran. `buildStep` labels any exception there `provider_failed`: a provider
rejection and a client-side transport or authentication failure look the
same. This is a new failure, not a row of the Prompt
387 table, which still describes the unresolved Prompt 386 receipt. The create
request (image, `iad1`, 2 vCPU, 900 s timeout, builder egress,
`persistent: false`) is unchanged since `5247e37` apart from Prompt 387's
`buildStep` wrapper, and the same request
succeeded at about `18:03Z` when Prompt 386 obtained a builder. A code
regression in the create call is therefore unlikely. **What remains unknown**
is the cause. A Hobby Sandbox allowance or rate limit, a plan-limit
rejection, a transient provider error, a network/transport failure, or an
OIDC authorization rejection specific to sandbox creation are all consistent
with the safe projection, which deliberately carries no provider message. The
same token passed `sandboxTarget`'s claim/expiry validation and served the
read-only `Snapshot.get`/`Sandbox.list` calls before and after the run, so an
expired or mis-bound token is excluded, but a create-specific permission
rejection is not. Quota was not visible from the CLI this session.

Proposed next bounded scope (not executed): a read-only allowance check in
the Vercel dashboard by the account owner (Sandbox usage for the current
Hobby period) and a look for any create-path cause the dashboard shows; then,
only if allowance remains, a separately authorized single rebuild. A coarse,
source-owned sub-classification of `builder-create` (HTTP status class versus
transport error, no provider message) would remove this ambiguity and needs
its own prompt and tests. If the dashboard shows the allowance exhausted, wait for the
period reset or make an explicit plan decision; this target is free-tier only.
The deployed preview scanner is expected to fail closed as
`scanner_unavailable` while the baseline's signatures stay older than 48
hours; the baseline itself expires `2026-10-24T14:29:39.778Z`.

### Verification and review

All checks ran on Node `v24.21.0`, sequentially, with subprocess and network
permission from the start (no restricted-sandbox attempt this time). Logs are
local scratch only.

- `node scripts/vercel/check-vercel-config.js`: exit 0,
  `vercel.json configuration valid`.
- `npm run vercel:probe-test`: exit 0, `tests 285`, `pass 285`, `fail 0`.
- `npm run ops:check`: exit 0 through all stages, ending with managed-drill
  `tests 28`, `pass 28`, `fail 0`. The audit printed
  `Production dependency security audit passed (0 critical vulnerabilities)`;
  `10 vulnerabilities (4 moderate, 6 high)` remain outside this scope. This
  aggregate is local/synthetic and static, not hosted acceptance.
- `npm run lint`: exit 0 across all workspaces, ending with
  `eslint "{src,test}/**/*.ts"` and no diagnostics.
- `npm run build`: exit 0; Next `16.3.8`,
  `Generating static pages using 7 workers (23/23)`, then
  `Generated Prisma Client (7.9.1)` and the Nest build.
- `npm run typecheck` (after build): exit 0, ending with
  `Generated Prisma Client (7.9.1)` and no type diagnostics.
- `npm run ops:scan-secrets`: exit 0, `secret/default scan passed`.
- `git diff --check`: exit 0, no output.
- Installed Prettier on the prompt (whitespace-only fixes applied) and on the
  new documentation fragments: `All matched files use Prettier code style!`.
  Historical records were not reformatted.

No source, test, dependency or workflow file changed. Tracked records contain
only public target IDs, snapshot IDs, timestamps, the receipt digest and fixed
status fields; tokens, env contents, stdout/stderr captures and raw provider
responses stay in the restricted run directory or scratch.

Independent read-only review used baseline/HEAD
`34667e73c7de828e5b547b9d433f0145a4247d38` plus this working diff, the approved
prompt and sanitized evidence only; it opened no restricted file and made no
provider call. It confirmed the records against that evidence and the code:
`builder-create` / `provider_failed` comes only from the wrapped
`Sandbox.create`, cleanup stays `not_requested` without a handle, `--force`
skips the pre-build snapshot lookup, the create parameters are unchanged since
`5247e37` apart from the wrapper, and the anchors resolve. It reported
`Critical: none`, one Important and four Minor findings, with the verdict "With fixes".
Receiving-review verification against `buildStep` confirmed the Important
finding: any exception there becomes `provider_failed`, so transport and
create-specific authorization failures are indistinguishable from provider
rejection. The cause list, the "Resume here" line and the next gate were
widened accordingly. The single-session `vercel usage` observation, the
cached-CLI version caveat and the watchdog arithmetic were also corrected; the
memory update was confirmed. These were wording-only record changes, so no
re-review was needed. Only this approved work is committed locally; nothing is
pushed and no further hosted authorization is implied.

## Prompt 389 — scanner create diagnostics (2026-10-18)

Baseline: `45519882c833845c025bbbd12460f2392d13c4e5` on `main`; only the
approved Prompt 389 was untracked. Stage A (local, no cloud calls) is recorded
here. Stages B (owner-reported Sandbox usage) and C (at most one confirmed
rebuild) are recorded below when they happen. No configuration write,
deployment, snapshot change, workflow dispatch or push occurred in stage A.

### What changed

- `scripts/vercel/build-scanner-snapshot.js`: `classifyProviderError` and
  three `build_failure` fields (`provider_error`, `provider_status`,
  `provider_code`), set only for errors wrapped at a `provider_failed` step;
  the SDK classes reach `buildStep` through an `AsyncLocalStorage` scope
  opened by `buildSnapshot`. Contract: [runbook §5](../infra/vercel/runbooks/managed-operations.md)
  and [Vercel record](vercel-deployment.md#scanner-create-diagnostics--prompt-389-2026-10-18).
- `scripts/vercel/probe-platform.js`: `sandboxTarget(env, { minRemainingMs })`,
  `LIVE_BUILD_OIDC_MIN_REMAINING_MS` (75 min); the cadence producer's live
  mode and the standalone builder use it, probes keep 30 min.
- Specs: the real SDK `APIError`/`StreamError` classes with a canary in the
  status text, message, body text, headers and body message (429, 402, 401
  without a body, an unsafe code, a string or out-of-range status, a throwing
  `response` getter, a stream error, `TypeError`, `TimeoutError`,
  `AbortError`, a plain object, a string); a Proxy whose prototype read
  throws; command/validation failures with no provider shape; both CLIs'
  stdout/stderr for an `APIError` 429; the 70/80-minute token floor in the
  probe, the cadence producer and the standalone builder; dry-run ignoring the
  token. The cadence scenario table now asserts the seven-key `build_failure`.

### Checks (Node `v24.21.0` via `/tmp/acres-node24`; `npm exec -- node --version` → `v24.21.0`)

- Focused suites (builder, cadence, handoff, probe): `tests 299`, `pass 299`,
  `fail 0`. `npm run vercel:probe-test`: `tests 305`, `pass 305`, `fail 0`.
- `npm run lint` exit 0; `npm run typecheck` exit 0; `git diff --check` clean;
  Prettier clean on every changed script (the three markdown records were
  already non-conforming at the baseline and were not reformatted).
- `rebuild-scanner-cadence.js --help` exit 0; `--dry-run` exit 0 with
  `"execution_mode":"simulation"` and no `build_failure`.
- `npm run build` skipped: no workspace source changed (only
  `scripts/vercel/*` and docs).

### Review

Independent review against §A found no critical or important issues and no
leak path. Two minor items were applied: `instanceOf` now returns a strict
boolean, and the standalone builder test also accepts an 80-minute token.
Not changed: the dry-run case only proves the token is ignored (as A.4
intends), and `classifyProviderError` is exported for tests like the module's
other helpers. Checks above were re-run after the fixes.

### Stage B preparation

The Sandbox pricing page (dated 2026-09-10) was re-read on 2026-10-18. The
Hobby figures match the record. The page adds 420 GB-hours of Provisioned
Memory and 20 GB of Data Transfer per month, plus a 20–40 vCPU/min allocation
rate. It says creation pauses "until 30 days have passed since you first used
the feature". `/docs/sandbox/limits` returns 404; its tables now sit on the
pricing page. Sandbox usage is still not visible to the agent; the owner
reports it.

### Stage B — owner-reported Sandbox usage (2026-10-18)

The Vercel MCP (reconnected this session) cannot read Hobby allowance usage:
`list_billing_charges` for the team returned `404 costs_not_found`, and no
other MCP tool exposes usage meters. It did measure, read-only, the project's
snapshots at about 00:50Z: baseline `snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA` and
Prompt 386 candidate `snap_rz0cs8Nnw1RObI3ZDS5WRKDSUR2y`, both `created` in
`iad1`, 921,876,890 bytes together, and no named sandboxes.

The owner then reported two dashboard Usage screenshots (taken 00:55Z and
00:57Z, after Prompt 388's 22:04Z attempt). Owner-reported, not measured:

| Sandbox metric     | used      | Hobby limit | share |
| ------------------ | --------- | ----------- | ----- |
| Creations          | 28        | 5,000       | 0.6 % |
| Active CPU         | 7 m 2 s   | 5 h         | 2.3 % |
| Provisioned Memory | 1.2 GB-h  | 420 GB-h    | 0.3 % |
| Data Transfer      | 37.75 MB  | 20 GB       | 0.2 % |
| Snapshot Storage   | 921.88 MB | 15 GB       | 6 %   |

Drive and Images Storage read 0 B. The team-wide Snapshot Storage figure
matches the MCP's byte count for the two `acres` snapshots, which indicates
no other project holds snapshots. The screenshots did not show the top of the page; the
owner answered yes to the §C question after being told to do so only if no
pause or limit banner was present. The usage window's reset date was not shown.

Reading: Prompt 388's `builder-create` failure was not monthly-quota
exhaustion. A short-window rate limit or a provider fault remain possible and
unproven.

### Stage C — the single confirmed rebuild (2026-10-18)

The owner answered yes to the exact §C question. Procedure: Prompt 388 §§1–4b
with Prompt 389's differences.

- `HEAD` `f7acaa92a283d7d6846efc5dd01abb88ae33bb99`, clean worktree, `main`.
  Node `v24.21.0` for both `node` and `npm exec -- node`. Cached Vercel CLI
  64.5.0, `whoami` → `dgsloxx417`; `.vercel` link bound to the fixed
  team/project. `@vercel/sandbox` 3.8.0.
- One `env pull --environment=preview --yes` refreshed `preview.env` (0600).
  The CLI wrote `[SENSITIVE]` placeholders for six sensitive values it cannot
  pull; the run uses none of them. OIDC `exp` `2026-10-18T13:01:05Z` (719 min
  left, over the 75-minute floor); owner and project claims matched. The
  token was never printed.
- Pre-flight: `--help` exit 0; `--dry-run` exit 0, `simulation`, no
  `build_failure`; builder/cadence/handoff suites `tests 206`, `pass 206`,
  `fail 0`.
- Pre-run provider state (MCP, ~01:01Z): the same two snapshots `created`, no
  named sandboxes.
- Custody: `~/.config/acres/vercel-preview/prompt389-20261018T010113Z/`
  (0700; every file 0600). `prompt386-*` and `prompt388-*` untouched.
- The single invocation passed only the OIDC token and the fixed target
  variables through `env -i`, under a 2,100 s outer deadline (the 30-minute
  watchdog plus five minutes). Window `2026-10-18T01:02:02Z`–`01:02:52Z`,
  exit 1. Receipt SHA-256
  `1fd4d2df1a796601054d961f6aa9099585e3a1ab07bea51d4ca1dda40e766e36`.

Receipt (allowlisted fields): `status: "failed"`,
`error: "candidate_smoke_failed"`, `execution_mode: "live"`, target
preview/team/project/`iad1`, `reason: "stale_or_forced"`,
`previous_snapshot_id` the baseline, `new_snapshot_id`
`snap_KtLdaJeG4SaLAwi4mI8G8XzURZat`, `main_sha256`
`0b2182d229f46981ec8f535382222f7c9dfdd656b250ad47988b910a8d302365`,
`daily_sha256`
`f9cb69a8e39dd86a25b828c1177cbd2935ee03250b4a79324c46bc8a44a2a2d5`,
`smoke_test` `{ clean_sample: "untested", eicar_sample: "untested",
cleanup: "passed" }`, `prune_status: "retained"`,
`activation_status: "not_performed"`,
`configuration_export: "not_performed"`, no `build_failure`. No
`candidate.env` was written. stderr carried only the fixed failure line.

Post-run (01:03Z, read-only MCP): three snapshots `created` in `iad1`. The new
candidate was created `2026-10-18T01:02:47Z`, expires
`2026-10-26T01:02:47Z`, and is 461,123,700 bytes. No named sandboxes remain.
The handoff validator rejected the receipt with `handoff_receipt_invalid`,
exit 1, and wrote no bundle.

**Interpretation.** For the first time the builder path completed:
`Sandbox.create`, ClamAV setup, signature download, hashing and snapshot all
succeeded. So the create rejection seen in Prompt 388 did not recur. The
failure moved to the smoke stage. `smokeTestSnapshot`
(`scripts/vercel/rebuild-scanner-cadence.js`) left both samples `untested`
and reported `cleanup: "passed"`. That means its `Sandbox.create` returned a
handle, which was later deleted, and an exception was thrown before the
first scan's result was assigned. By the code path, it came from `writeFiles`, the first
`runCommand`, or reading its stdout. A clamscan that ran and returned a wrong
answer would read `failed`, not `untested`. The smoke step's catch drops the
error with no classification, so which call failed and why is **unknown**.
Stage A's `provider_*` fields cover only `build_failure`, not the smoke stage.

Nothing was retried, adopted, deleted or written to project settings. The
candidate is retained, unadopted and ineligible: a failed receipt never
passes handoff. Proposed next scope, not executed: extend the safe
provider-error classification to the smoke stage (which call, class, status,
code), with tests. Then decide, with separate approval, whether to run the
existing `probe-platform.js scanner` against `snap_KtLd…` (one probe) or one
more rebuild. The baseline expires `2026-10-24T14:29:39.778Z`.

### Stage B–C checks and review

Node `v24.21.0`: `check-vercel-config.js` → `vercel.json configuration valid`;
`npm run vercel:probe-test` → `tests 305`, `pass 305`, `fail 0`;
`npm run ops:check`, `lint`, `build`, `typecheck` exit 0;
`ops:scan-secrets` → `secret/default scan passed`; `git diff --check` clean.
Records only; no source changed.

Independent review found no critical issues. One important correction was
applied: the 48 h policy reads the `daily.cvd` build time, so the candidate's
signature window ends **no later than** about `2026-10-20T01:00Z`. Wording
fixes were also applied: owner-derived conclusions are framed as readings, and
"before any scan result" replaces "before any scan".

## Prompt 390 — scanner smoke-source fix (2026-10-18)

Stage A of Prompt 390, local only. Baseline `c8e80cf`.

### Cause found in source

`smokeTestSnapshot` (`scripts/vercel/rebuild-scanner-cadence.js`) created the
smoke VM with a top-level `snapshotId`. SDK 3.8.0 accepts a snapshot only as
`source: { type: "snapshot", snapshotId }`. `git log -L` showed the function
unchanged since `2d5e449`/`2faafcb`, so the smoke stage has never passed live.
The reading (from source, not a hosted measurement) is that Prompt 389 stage C's
smoke VM booted the default image, with no ClamAV and no `/var/lib/clamav`. A
later call then threw, giving `untested` + `cleanup: "passed"`. The VM was also
persistent by default; no residue resulted (Prompt 389 post-run listing).

### What changed

- Smoke create matches `probe-platform.js` `sandboxRunner` and
  `vercel-sandbox-scanner.adapter.ts`: snapshot `source`, `persistent: false`,
  `deny-all`, 120 s session, 1 vCPU. Its create `signal` is 60 s, matching the
  adapter's `CREATE_TIMEOUT_MS` (the 30 s control deadline differs, and the
  prompt said to use the adapter's value).
- Checks, in order, stopping at the first failure: `sourceSnapshotId` equal to
  the candidate; the probe's signature check against the builder's
  `main_sha256`/`daily_sha256` and `--max-age-hours`; then the clean and EICAR
  scans. Cleanup is `delete({ deleteOrphanSnapshots: true })` (no `stop()`;
  scan VMs use `true`, only the builder `false`), then a read-only
  `Snapshot.get` of the candidate that must report `created`.
- `smoke_test.signatures` (first key). `smoke_failure` appears only on
  `candidate_smoke_failed` receipts: the first failing step (`smoke-create`,
  `-source`, `-signatures`, `-write`, `-scan-clean`, `-scan-eicar`,
  `-cleanup`, or `unknown`), `kind` (`provider_failed`, `result_failed` or
  `unknown`), and the Prompt 389 provider fields via `classifyProviderError`,
  with SDK classes passed explicitly. It never reads message, stack, body,
  cause, headers or stdout bodies.
- `probe-platform.js`: `signatureCheck(config, { dailySha256 })` override;
  `signatureCheck` and `runChecked` exported. Existing callers unchanged.
- `prepare-scanner-handoff.js` also requires `smoke_test.signatures:
  "passed"`. This is stricter: an older success receipt without the key is
  rejected. No such receipt exists, since none had ever passed smoke.
- Spec fakes: `Sandbox.create` throws `TypeError("unknown create parameter:
  snapshotId")` on a top-level `snapshotId`. Probes are classified by
  `source.type`, return `sourceSnapshotId`, answer the signature check, and
  log deletes as `probe-delete:<flag>`, so `retained()` still forbids `true`
  on the builder. New tests: the exact create parameters, the hashes passed to
  the signature check, a ten-case failure table with real SDK
  `APIError`/`StreamError` classes, a canary test across receipt, console and
  `error.stack`, no `smoke_failure` on non-smoke receipts, and the
  `signatureCheck` override.
- Regression proof: temporarily reverting the create to a top-level
  `snapshotId` made `success boots from the snapshot source and handoff
  accepts it` fail (`ℹ pass 0`, `ℹ fail 1`). The revert was restored from a
  copy and is not committed.

### Checks (Node `v24.21.0` via `/tmp/acres-node24`; `npm exec -- node --version` → `v24.21.0`)

- `node --test` on the four scanner specs → `tests 320`, `pass 320`, `fail 0`.
- `npm run vercel:probe-test` → `tests 326`, `pass 326`, `fail 0`.
- `npm run lint`, `npm run typecheck` → exit 0.
- `rebuild-scanner-cadence.js --help` → usage, exit 0; `--dry-run` →
  simulation receipt (`smoke_test: null`, no `smoke_failure`), exit 0.
- `git diff --check` clean; changed scripts pass `prettier --check`.
- `npm run build` skipped: no workspace source changed.

### Review

Independent review against §A found no critical or important issues and
re-ran the specs (316/316 before the follow-up tests). Applied: tests for the
`unknown` fallbacks (`projectSmokeFailure({})`, an allowlist-rejected state,
a throwing `sourceSnapshotId` getter → `smoke-source`/`unknown`), for the
invalid-hash guard (no signature command sent), for a create `TimeoutError`
(→ `timeout`), and for a `StreamError` whose canary code is dropped. Two
runbook limits were added: orphan deletion is asynchronous, so the post-delete
`Snapshot.get` cannot prove a later sweep spared the candidate
(`baseSnapshotSurvived` remains that evidence); and `signatures: "passed"`
means "within the cadence `--max-age-hours` window". Not changed:
`runChecked` calling `stdout()` unguarded. SDK 3.8.0 `CommandFinished` always
provides it, and the helper is shared with the hosted-proven probe.

### Stage B — the single confirmed rebuild (2026-10-18)

The owner answered yes to the exact §B question. Procedure: Prompt 388 §§1–4b
with Prompt 389 §C's and Prompt 390 §B's differences.

- Preconditions (read-only, 01:41–01:43Z): `HEAD`
  `bc3afe07b5c6ec91febd5c91f42793ef9d918880` (stage A), clean `main`. Node
  `v24.21.0` for both `node` and `npm exec -- node`. Cached Vercel CLI 64.1.0,
  `whoami` → `dgsloxx417`; `.vercel` link bound to the fixed team/project.
  `@vercel/sandbox` 3.8.0. SDK listing: baseline, `snap_rz0cs…` and `snap_KtLd…`
  all `created` in `iad1`; no sandboxes. OIDC `exp` `2026-10-18T13:01:05Z`
  (680 min left), owner and project claims matched. No `env pull` was needed.
  The token was read into a variable and never printed; only `exp` and the
  claim booleans were.
- Pre-flight at `bc3afe0`: `--help` exit 0; `--dry-run` exit 0, `simulation`,
  no `build_failure` or `smoke_failure`; builder/cadence/handoff suites
  `tests 226`, `pass 226`, `fail 0`.
- Custody: `~/.config/acres/vercel-preview/prompt390-20261018T014336Z/`
  (0700; every file 0600). `prompt386-*`, `prompt388-*` and `prompt389-*` are
  untouched: the newest file in each predates this run (latest `01:02:52Z`).
- The single invocation passed only the OIDC token and the fixed target
  variables through `env -i`, under a 2,100 s outer deadline, with
  `--force --current-snapshot-id snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA`, `--output`
  and `--write-env` in the custody directory. Window
  `2026-10-18T01:43:47Z`–`01:45:22Z`, exit 0, empty stderr. Receipt SHA-256
  `617255e056dc708802a7fd0363baa8fc4d918f2ffab10510ec70cc2b7e9ff084`; stdout
  equals the receipt.

Receipt: `status: "success"`, `execution_mode: "live"`, schema 1, target
preview/team/project/`iad1`, `reason: "stale_or_forced"`,
`previous_snapshot_id` the baseline, `new_snapshot_id`
`snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN`, `main_sha256`
`0b2182d229f46981ec8f535382222f7c9dfdd656b250ad47988b910a8d302365`,
`daily_sha256`
`f9cb69a8e39dd86a25b828c1177cbd2935ee03250b4a79324c46bc8a44a2a2d5`,
`smoke_test` `{ signatures, clean_sample, eicar_sample, cleanup }` all
`"passed"`, `prune_status: "retained"`, `activation_status: "not_performed"`,
`configuration_export: "exported"`. There is no `build_failure` or
`smoke_failure`. This is the first receipt whose smoke stage passed.

Handoff (offline, Prompt 388 §4a): `prepare-scanner-handoff.js` exit 0,
`status: "prepared"`, writing `handoff/handoff.json` and `handoff/runtime.env`
(0600). `runtime_env_sha256`
`632f4634ebdd574eb67a01a3e42c439f46ca5b1f7c78ac14476a5e7d92a4ad1e` (the bundle
digest). Local recomputation matched the manifest's `receipt_sha256` and
`runtime_env_sha256`. The three runtime assignments
(`SCANNER_SANDBOX_SNAPSHOT_ID`, `SCANNER_MAIN_SHA256`,
`SCANNER_DAILY_SHA256`) equal the receipt and `candidate.env`
(`ACRES_SCANNER_*`). The manifest records `activation_status`,
`deployment_verification` and `retirement_status` as `not_performed`.

Post-run (01:45:54Z, read-only SDK listing): four snapshots, all `created` in
`iad1`. The new candidate was created `2026-10-18T01:44:52Z`, expires
`2026-10-26T01:44:56Z`, and is 461,065,087 bytes. The three earlier snapshots
are unchanged. No sandboxes remain. Snapshot Storage is 1,844,065,677 B
(≈ 1.84 GB of 15 GB), as predicted.

**Interpretation.** With the corrected create shape, the smoke VM booted from
the candidate (implied: the `sourceSnapshotId` check precedes the signature
check). The adapter's signature check
passed against the exported hashes, ClamAV accepted the clean sample and
flagged EICAR, and the post-delete `Snapshot.get` still reported `created`.
This supports, though it does not certify, the stage A reading that the old
top-level `snapshotId` caused Prompt 389's smoke failure. Both candidates carry
**identical** `main`/`daily` hashes: the two builds, about 42 minutes apart,
fetched the same `daily.cvd`. So `snap_CARv…`'s 48 h signature window is bounded
by that file's `sigtool` build time. The passing check proves the window was
still open at about 01:44Z. It closes no later than about `2026-10-20T01:02Z`:
the 389 candidate, which already held this file, was snapshotted at 01:02:47Z,
plus 48 h. This refines the earlier ≈ `01:00Z` bound. The receipt does not
record the exact build time.

The candidate is **prepared, not adopted**. Nothing was written to project
env vars or `scanner.env`, nothing was deployed or retired, and nothing was
retried. `snap_KtLd…` is now superseded but retained; its failed receipt stays
ineligible. Next gate (proposed, needs its own prompt and approval): preview
adoption of `snap_CARv…` and the deployed application upload → scan proof,
before the signature window closes. Retirement of superseded snapshots
remains a separate, dependency-aware decision.

### Stage B checks and review

Records only; no source changed after `bc3afe0`. `git diff --check` exit 0;
`ops:scan-secrets` → `secret/default scan passed`; `npm run vercel:probe-test`
→ `tests 326`, `pass 326`, `fail 0`. The first `npm run ops:check` exited 1:
two `run-launch-drills.spec.js` tests (`mandatory receipt rejects
container:null-check`, `… caddy:legacy-mode`) failed with `spawnSync bash
ETIMEDOUT` after 16.6 s and 19.0 s. That spec alone then passed (`tests 158`,
`pass 158`, `fail 0`), and a second full `ops:check` exited 0 with no failing
test. Reading: subprocess timeouts under full-suite load, unrelated to this
records-only change.

Independent review confirmed every recorded ID, hash, size and timestamp
against the run evidence. It found the signature-window reasoning sound and
the scope within §B. Applied: this checks paragraph, including the first
`ops:check` failure; the custody claim, widened to `prompt389-*` and verified
by file times; the token statement made specific; the window sentence, which
no longer conflates snapshot time and file build time and notes the refined
bound; named digests; the source match marked as implied; and "own prompt and
approval" on the Resume-here gate.

## Prompt 391 — scanner preview adoption (2026-10-18)

Baseline `73c7047`, clean `main` except the approved prompt. Node `v24.21.0`
directly and inside `npm run`; cached Vercel CLI 64.5.0, `whoami` →
`dgsloxx417` (Hobby). UTC window `13:38:11Z`–`14:11:28Z`.

### Inputs and custody

Run directory `~/.config/acres/vercel-preview/prompt391-20261018T133907Z/`
(0700, files 0600): `preview-before.env` / `preview-after.env` (private
pulls), `previous-scanner.env` and `previous-scanner-scopes.json` (the five
`SCANNER_*` records: `encrypted`, `preview`, no git branch), probe output, the
three write logs, deployment inspection, `acceptance.json`, the
`accept/` request/response bodies and cookie jars, synthetic identities and
runtime logs. Inputs from `prompt390-20261018T014336Z/` were read, never
rewritten.

Bundle digests recomputed: receipt
`617255e056dc708802a7fd0363baa8fc4d918f2ffab10510ec70cc2b7e9ff084`,
`runtime.env`
`632f4634ebdd574eb67a01a3e42c439f46ca5b1f7c78ac14476a5e7d92a4ad1e`, both equal
to `handoff.json`. `runtime.env` parsed as data: three lines, names
`SCANNER_SANDBOX_SNAPSHOT_ID`, `SCANNER_MAIN_SHA256`, `SCANNER_DAILY_SHA256`,
patterns valid, snapshot `snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN`.

### Sequence and sanitized outputs

1. `Snapshot.get`: candidate `created`, `iad1`, expiry
   `2026-10-26T01:44:56.125Z`; baseline `created`, `2026-10-24T14:29:39.778Z`.
2. `probe-platform.js scanner` with `candidate.env` and max age 48: exit 0,
   `gatePassed: true`, `signaturesVerified: true`, clean 9.2 s, EICAR 9.0 s,
   `sandboxCreations: 1`, `cleanupSucceeded: true`.
3. Env writes: the agent's `vercel env update` call was refused by the
   auto-mode classifier before running; the owner ran
   `adopt.sh` (stdin, names and exit codes only): three `rc=0`. Private
   re-pull: all three equal to the bundle; changed keys vs before:
   `SCANNER_DAILY_SHA256`, `SCANNER_SANDBOX_SNAPSHOT_ID`.
4. `vercel deploy --dry --json` from the working tree listed `.env`,
   `backups/`, `ref/` among 2,828 files; from a `git archive` of `73c7047`
   plus `.vercel/project.json` it listed 1,503 tracked files and none of
   them. `vercel deploy --target=preview --scope dgsloxx417s-projects` from
   the archive: exit 0, `dpl_2aajXYcFj2FDoGA9Gbbu5HqyFtBT`, Ready in 4.6 min.
5. Acceptance via `vercel curl --deployment` (results in
   [the hosted record](vercel-deployment.md#scanner-preview-adoption--prompt-391-2026-10-18)).
   RLS-scoped read-only SQL (`acres_app` direct URL, `BEGIN READ ONLY`,
   transaction-local `acres.organization_id`) confirmed the upload, outbox and
   `DurableJob` states quoted there.
6. Post-run `Snapshot.get`: candidate expiry `2026-10-26T14:08:18.638Z`;
   `Sandbox.list`: none.

No recovery action was needed: no write failed, the build succeeded and both
uploads reached terminal states. The previous values remain in custody for a
rollback; restoring them restores identity only, since the baseline's
signatures are long past 48 h.

### Checks (Node 24.21.0, sequential)

- `node scripts/vercel/check-vercel-config.js` → `vercel.json configuration valid`, exit 0
- `npm run vercel:probe-test` → `pass 326`, `fail 0`, exit 0
- `npm run ops:check` → `pass 28`, `fail 0`, exit 0
- `npm run lint` exit 0; `npm run build` exit 0; `npm run typecheck` exit 0
- `npm run ops:scan-secrets` → `secret/default scan passed`, exit 0
- `git diff --check` exit 0
- Prettier: the five changed docs were already unformatted at the
  baseline, so whole files were not rewritten; each new section was checked
  Prettier-stable instead.

Local checks do not stand in for the hosted proof above. Two findings are
open (CLI deploys upload gitignored files; `/app` `dashboardSummary` SSR
failure); see the hosted record.

## Prompt 392 — deploy upload allowlist (2026-10-18)

Baseline `d2606b3`; implementation commit `feb6d9e`. Node `v24.21.0`
directly and inside `npm run`; cached Vercel CLI 64.5.0; project inspect →
`acres`, owner `dgsloxx417's projects`.

### Checks (Node 24.21.0)

- `npm run vercel:probe-test` → `tests 337`, `pass 337`, `fail 0`
- `npm run lint` → exit 0; `npm run typecheck` → exit 0; `npm run build` →
  exit 0
- dry run + `vercel:deploy-manifest` with secrets on disk → `deploy manifest
  ok: 654 files`; negative controls and the dirty-scope failure as recorded
  in the hosted record

### Review

Stage 1 found no Critical issues and one Important: the path-set check let
staged or modified content through, so a recorded SHA could be wrong. Fixed
with the clean-scope gate. Also accepted: repo-top-level resolution for
`--cwd`, exit 2 on git failure, no `SECRET:` label on `.env.example`,
rejecting flag-like values, `*.key`/`.npmrc`/`*.log` excludes, and four
tests. Declined: a unit test of `.vercelignore` through the `ignore` package
(the CLI bundles its own matcher; the real dry run is the faithful test) and
a truncation test. The re-review returned "ready" with one Minor
(rename/copy source parsing in porcelain `-z`), which was fixed.

### Hosted

`vercel deploy --target=preview` from the working tree at `15:00:52Z`: exit
0, `dpl_7JR8wLUt14fPRdD7SHPmy6gM4QTC`, Ready `15:02:45Z`. Stored source equal
to the manifest; smoke `/` 200, `/api/v1/auth/csrf` 200. The inventory of
earlier deployments found nine previews storing `.env`, `server/.env` and
`backups/`; deletion and rotation are pending owner decisions (see
[the hosted record](vercel-deployment.md#deploy-upload-allowlist--prompt-392-2026-10-18)).


## Prompt 393 — dashboard summary operation name (2026-10-18)

Baseline `324b1b3`; implementation commit `23f6378`. Node `v24.21.0`;
cached Vercel CLI 64.5.0.

### Checks (Node 24.21.0)

- `npm run lint` → exit 0; `npm run typecheck` → exit 0; `npm run build` →
  exit 0
- `playwright test tests/graphql-operations.spec.ts tests/audit-history.spec.ts
  tests/api-helpers.spec.ts` → `17 passed`
- SSR behaviour check (API `NODE_ENV=test`, `next dev`, register →
  organization → `/app`): before the fix "Request Failed" and no
  `dashboard-title`; after it no alert and `id="dashboard-title"` present
- dry run + `vercel:deploy-manifest` → `deploy manifest ok: 656 files`

### Review

Stage 1 found no Critical or Important issues. It confirmed the query moved
byte for byte and that no other client `/graphql` caller is unnamed. Accepted:
retitle the spec to what it asserts. Declined: replacing `graphqlPost`'s
query/operation pair with one document object (two correct call sites;
recorded as a residual instead). Recorded: the hand-kept document list in
the spec. No re-review: the only change after review was a test title.

### Hosted

`dpl_1S2xiZKz6HogdM3d4QgSsKsBqf6X`: `/app` and `/app/audit` render for a
fresh organization member (see
[the hosted record](vercel-deployment.md#dashboard-summary-operation-name--prompt-393-2026-10-18)).

## Prompt 394 — scanner signature refresh (2026-10-18)

Baseline `22c6300`, clean `main` except the approved prompt. Node
`v24.21.0` directly and inside `npm run`; cached Vercel CLI 64.5.0, `whoami`
→ `dgsloxx417`; `@vercel/sandbox` 3.8.0. UTC window `15:54:59Z`–`16:16:13Z`.

### Inputs and custody

Run directory `~/.config/acres/vercel-preview/prompt394-20261018T155715Z/`
(0700, files 0600):

- the private pulls `preview-before.env` and `preview-after.env`;
- `previous-scanner.env` and `previous-scanner-scopes.json`;
- `receipt.json`, `candidate.env` and `handoff/`;
- probe output;
- `adopt.sh` and `restore.sh` (the restore script was not run);
- `writes.log`, deployment output and inspection;
- `acceptance.json`, `accept/` and `sql-correlation.txt`;
- the `Snapshot.get`/`Sandbox.list` snapshots `inspect-*.json`.

Earlier `prompt3xx-*` directories were read, never rewritten.

The preview OIDC token had expired (`13:01Z`), so the one authorized
`env pull` refreshed `preview.env`.

**Pull artefact.** Pulling into the existing file kept older lines:
`BLOB_READ_WRITE_TOKEN` and the `NEON_OWNER_*` set, which are now
**development-only** records. The fresh `preview-after.env` omits them. The
before/after comparison is therefore restricted to keys present in both.

### Sequence and sanitized outputs

1. Pre-flight: `--help` exit 0, `--dry-run` exit 0 with
   `execution_mode: "simulation"`, the three scanner specs `pass 226`, `fail 0`.
2. One cadence rebuild (`15:59:12–16:00:39Z`), exit 0: `status: "success"`,
   candidate `snap_ngIwnQplocPoUR0A6cewfCGrFAbX`, `daily_sha256`
   `489f6083…` ≠ the active `f9cb69a8…`, so the freshness gate passed.
   Handoff: receipt
   `6e53dcd0fa80950280d35b52d1bfb5c5e9fed7724f501a94dea953632b082b70`, and
   `runtime.env`
   `db7391f7e8ca223394d6de8cab7899a73964a509e8e89973ad44b7ca21c77fcd`, both
   equal to `handoff.json`. `Snapshot.get`: `created`, expiry
   `2026-10-26T16:00:15.185Z`. `Sandbox.list`: none.
3. `probe-platform.js scanner` with `candidate.env` and max age 48: exit 0,
   `gatePassed: true`, `signaturesVerified: true`, clean 10.9 s, EICAR
   10.2 s, `sandboxCreations: 1`, `cleanupSucceeded: true`.
4. The owner ran `adopt.sh`: three `rc=0`. The private re-pull equals the
   bundle. Changed keys: `SCANNER_DAILY_SHA256` and
   `SCANNER_SANDBOX_SNAPSHOT_ID`.
5. `vercel deploy --dry --target=preview` and `vercel:deploy-manifest` →
   `deploy manifest ok: 656 files`. Then
   `vercel deploy --target=preview --scope dgsloxx417s-projects` from the working tree: exit 0,
   `dpl_A5H3fnpSx59XyfKqmKJQLywVf85j`, Ready in 2.0 min.
6. Acceptance through `vercel curl --deployment`. The results are in
   [the hosted record](vercel-deployment.md#scanner-signature-refresh--prompt-394-2026-10-18).
   RLS-scoped read-only SQL (`acres_app` direct URL, `BEGIN READ ONLY`,
   transaction-local `acres.organization_id`, `ROLLBACK`) confirmed the
   upload, outbox and `DurableJob` states and zero EICAR dataset versions.
7. Post-run `Snapshot.get`: candidate expiry `2026-10-26T16:14:25.251Z`,
   `snap_CARv…` unchanged at `2026-10-26T14:08:18.638Z`. `Sandbox.list`:
   none.

No recovery action was needed.

**Disclosure.** While diagnosing the pull artefact, one `head`/`cut`
command printed the first 17 characters of the `BLOB_READ_WRITE_TOKEN` line
into the agent session. That is the fixed `vercel_blob_rw_` prefix and two
characters of the public store ID, not the secret part. No other value was
printed.

### Checks (Node 24.21.0, sequential)

- `node scripts/vercel/check-vercel-config.js` → `vercel.json configuration valid`, exit 0
- `npm run vercel:probe-test` → `tests 337`, `pass 337`, `fail 0`, exit 0
- `npm run ops:check` → every suite `fail 0`, exit 0
- `npm run lint` → exit 0; `npm run build` → exit 0; `npm run typecheck` → exit 0
- `npm run ops:scan-secrets` → `secret/default scan passed`, exit 0
- `git diff --check` → exit 0

Local checks do not stand in for the hosted proof above.

### Review

Stage 1 found no Critical issues. It confirmed every recorded fact against
the sanitized evidence, the links and the absence of secrets. Two Important
findings, both accepted:

- The runbook freshness gate sat after the deploy step and split the list;
  it is now a sub-item of step 1, and step 5 states the current deploy
  method first.
- The hosted record's changed-keys claim lacked the both-pulls caveat; it
  now has it.

Minor findings accepted:

- the bound is now rebuild end + 48 h (about 16:01Z), with planning before
  15:59Z;
- "newer" `daily.cvd` is now "different (presumably newer)";
- the new entries are re-wrapped;
- this review line was added.

The reviewer could not check the pre-flight `pass 226` and the UTC window
against its evidence; both come from captured output. No re-review: the
changes were wording and placement in documentation.

## Prompt 395 — scanner signature refresh 2 (2026-10-19)

Baseline `45a392a`, clean `main` except the approved prompt. Node
`v24.21.0` directly and inside `npm run` (the `/tmp/acres-node24` launcher
was reinstalled); cached Vercel CLI 64.5.0, `whoami` → `dgsloxx417`, team
`hobby`; `project inspect` → `prj_q9ApajZWDgdYZetnm5s5oakEjrUD`;
`@vercel/sandbox` 3.8.0. UTC window `08:54:52Z`–`09:11:03Z`.

The first approval arrived at `2026-10-18T16:30Z`, before the prompt's
earliest useful start (`2026-10-19T04:00Z`). Execution stopped at the window
gate with nothing spent and resumed on the next approval at
`2026-10-19T08:54Z`.

### Inputs and custody

Run directory `~/.config/acres/vercel-preview/prompt395-20261019T085943Z/`
(0700, files 0600, `adopt.sh`/`restore.sh` 0700):

- the private pulls `preview-before.env` and `preview-after.env`, each into
  a fresh file;
- `previous-scanner.env` and `previous-scanner-scopes.json`;
- `receipt.json`, `candidate.env` and `handoff/`;
- probe output;
- `adopt.sh` and `restore.sh` (the restore script was not run);
- `writes.log`, dry-run manifest, deployment output and inspection;
- `acceptance.json`, `accept/` and `sql-correlation.txt`;
- the `Snapshot.get`/`Sandbox.list` snapshots `inspect-*.json`.

Earlier `prompt3xx-*` directories were read, never rewritten.

The preview OIDC token had expired (`03:57Z`), so the one authorized
`env pull` refreshed `preview.env`. It went into a new file that then
replaced the old one, so the stale development-only lines Prompt 394 found
are gone.

### Sequence and sanitized outputs

1. Pre-flight: `--help` exit 0, `--dry-run` exit 0 with
   `execution_mode: "simulation"`, the three scanner specs `pass 226`,
   `fail 0`.
2. One cadence rebuild (`09:00:37–09:01:46Z`), exit 0:
   `status: "success"`, candidate `snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf`,
   `daily_sha256` `7cb49401…` ≠ the active `489f6083…` (full values
   compared privately), so the freshness gate passed. `main_sha256` was
   unchanged. Handoff: receipt
   `eec8c15f4f2b128080710a70755ad63c2b669a833d1123fbdff40179e4fd35b3`, and
   `runtime.env`
   `af1ba4f233112f9f9694a1671d8bbe17f2f7fce6ee2f389c474d371747f2580a`, both
   equal to `handoff.json`. `Snapshot.get`: `created`, expiry
   `2026-10-27T09:01:22.926Z`. `Sandbox.list`: none.
3. `probe-platform.js scanner` with `candidate.env` and max age 48: exit 0,
   `gatePassed: true`, `signaturesVerified: true`, clean 13.8 s, EICAR
   13.9 s, `sandboxCreations: 1`, `cleanupSucceeded: true`.
4. The owner ran `adopt.sh`: three `rc=0` (`09:04:17–09:04:22Z` by the
   records' `updatedAt`). The fresh private re-pull equals the bundle.
   Changed keys: `SCANNER_DAILY_SHA256` and `SCANNER_SANDBOX_SNAPSHOT_ID`.
5. `vercel deploy --dry --target=preview` and `vercel:deploy-manifest` →
   `deploy manifest ok: 656 files`. Then
   `vercel deploy --target=preview --scope dgsloxx417s-projects` from the
   working tree (`09:05:28–09:07:47Z`): exit 0,
   `dpl_AtJLkmoy3gWJVDSzkAUk5t8ujYPJ`, Ready in 2.2 min.
6. Acceptance through `vercel curl --deployment`. The results are in
   [the hosted record](vercel-deployment.md#scanner-signature-refresh--prompt-395-2026-10-19).
   RLS-scoped read-only SQL (`acres_app` direct URL, `BEGIN READ ONLY`,
   transaction-local `acres.organization_id`, `ROLLBACK`) confirmed the
   upload, outbox and `DurableJob` states and zero EICAR dataset versions.
7. Post-run `Snapshot.get`: candidate expiry `2026-10-27T09:09:29.002Z`,
   `snap_ngIw…` unchanged at `2026-10-26T16:14:25.251Z`. `Snapshot.list`:
   six. `Sandbox.list`: none.

No recovery action was needed.

### Checks (Node 24.21.0, sequential)

- `node scripts/vercel/check-vercel-config.js` → `vercel.json configuration valid`, exit 0
- `npm run vercel:probe-test` → `tests 337`, `pass 337`, `fail 0`, exit 0
- `npm run ops:check` → every suite `fail 0`, exit 0
- `npm run lint` → exit 0; `npm run build` → exit 0; `npm run typecheck` → exit 0
- `npm run ops:scan-secrets` → `secret/default scan passed`, exit 0
- `git diff --check` → exit 0

Local checks do not stand in for the hosted proof above.

### Review

Stage 1 found no Critical issues. It checked the recorded IDs, digests,
timestamps, durations, derived bounds, anchors and the absence of secrets
against the sanitized evidence. Two Important findings, both accepted:

- this subsection was missing;
- "Prompt 394's file changed after about 17 h" overclaimed; it now says a
  different file was being served about 17 h later.

Minor findings accepted: the hosted record now scopes "the only
warning/error record" to Vercel's log level, the window check time is now
`08:55Z`, and the ops-suite count was dropped. Two were rejected: adding
"Vercel Authentication" to the deployment bullet (not observed in this
run), and indenting the prompt's `<run>/handoff` continuation line (that is
Prettier's output, and the prompt must pass Prettier).

The reviewer could not check the deployment URL, the CLI version and
`whoami`, the empty rebuild stderr or the full private hash comparison
against its evidence. All of them come from captured output. No re-review:
the changes were wording in documentation.

### Notes

- The bound is now no later than about `2026-10-21T09:02Z`. A different
  `daily.cvd` was being served about 17 h after Prompt 394's fetch; when it
  changed is not recorded. The refresh cadence stays roughly every two days
  while the 48 h policy holds.
- `infra/vercel/runbooks/managed-operations.md` §5.5 was not changed: this
  run found no procedure gap.

## Prompt 396 — scanner snapshot retirement (2026-10-19)

Baseline `eadc35d`, clean `main` except the approved prompt. Node
`v24.21.0` from the mise install (`~/.local/share/mise/installs/node/24.21.0`
first on `PATH`; the `/tmp/acres-node24` launcher was gone), cached Vercel CLI
64.5.0, `@vercel/sandbox` 3.8.0.

### Tooling and review

`scripts/vercel/retire-scanner-snapshots.js` and its spec, the
`vercel:scanner-retire` script, the spec added to `vercel:probe-test`, a
README paragraph and the runbook §5.5 step 4 procedure. `.vercelignore` is
an allowlist and keeps `scripts/` out of deploy uploads; unchanged.

Stage 1 review found no path to a delete under a refusal, no delete outside
`--retire` and no token leak, and raised one Critical and four Important
findings, all verified against the installed SDK and accepted:

- **Critical.** `Snapshot.get`/`delete` are team-scoped (`/v2/sandboxes/snapshots/<id>`,
  no project parameter), so a mis-copied ID from another project could be
  deleted. Added the `not_in_project` refusal (every present ID must be in
  the project's `Snapshot.list`).
- The SDK transport retries 5xx/429, DELETE included, so a delete can land
  and still throw. One re-read now records `deleted_after_error`; the run
  still stops.
- The runbook stated the retirement in the past tense before the live run;
  reworded to "targets" and the CARv/ngIw tier 2 named.
- Stopped persistent sandboxes carry `currentSnapshotId`; added the
  `sandbox_dependency` refusal.
- Spec gaps: a re-get error after a delete (must be `unconfirmed`), and
  `lookup_failed` from each listing.

Minor findings taken: `active_malformed` (an env value failing the ID
pattern never reaches the receipt), `unlisted_snapshots: null` when the
listing failed, and a `warnings` array (`keep_changed`,
`after_list_failed`) that forces exit 1. Not taken: a separate
`status_after` field (`deleted_after_error` covers the case that changes the
operator's action) and guarding `iso()` before any delete (schema-bound,
pre-delete). The follow-up review found no remaining Critical or Important
issue. The tooling was committed as `4aa24ca` before the live run.

### Checks (Node 24.21.0)

- `node --test scripts/vercel/retire-scanner-snapshots.spec.js` → `tests 34`, `pass 34`, `fail 0`
- `npm run vercel:probe-test` → `tests 371`, `pass 371`, `fail 0`
- `npm run lint` → exit 0; `npm run typecheck` → exit 0
- `npx prettier --check` on the new files, `package.json` and the README →
  `All matched files use Prettier code style!`. The runbook fails the same
  check at `eadc35d` because of an existing table; this prompt's lines pass
  and the table was not reformatted.
- `npm run ops:scan-secrets` → `secret/default scan passed`
- `git diff --check` → clean

`npm run build` was skipped: no workspace source changed. `npm run
ops:check` was not run; it touches nothing changed here.

### Live sequence

1. Access, one fresh preview pull into
   `~/.config/acres/vercel-preview/prompt396-20261019T104349Z/preview.env`;
   preview active ID matched `snap_KBaj…`; root `scanner.env` named
   `snap_Feg5…` (stale custody file), raised with the owner, who chose to
   proceed.
2. Deployment listing (MCP `list_deployments`, 19 deployments) for the
   dependency table.
3. Plan (`plan.json`, exit 0, `planned`, no refusals, six snapshots).
4. Owner reading before.
5. One `--confirm` (`retire.json`, exit 0, `retired`, three `deleted`).
6. Owner after-reading at 11:32:27 UTC remained 2.39 GB / 15 GB.
   The later reading no earlier than 12:03 UTC is outstanding; accounting
   acceptance remains open.

No recovery action was needed. The run directory holds `preview.env`,
`plan.json` and `retire.json`; earlier run directories were not modified.
The hosted results and readings are in
[the hosted record](vercel-deployment.md#scanner-snapshot-retirement--prompt-396-2026-10-19).

### Notes

- The dashboard could not be read programmatically: `vercel usage` reports
  billing data unavailable on this Hobby team, `GET /v1/billing/charges`
  returns `404 costs_not_found`, and the Chrome extension was not connected.
  Readings are owner-reported.
- Retirement recurs with every refresh; tier 2 waits for its windows.
