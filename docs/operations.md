# Operations and launch hardening

Status: Phase 12A implemented from
`prompts/32-operations-launch-hardening-foundation.md`. This is a foundation
for production operations, not a completed launch checklist or deployment.

Phase 11 optional local AI is still absent. No model, runtime, license,
quality threshold, prompt store, or AI operating profile has been approved.
Every Phase 12A artifact and check validates the deterministic no-AI path.

## Topology

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

Prometheus and Grafana are optional operator-only scaffolding. Phase 12A
includes Prometheus self-scrape, provisioning shape, and placeholder
application alert expressions only; no application metrics endpoint, probe
exporter, SLO threshold, or alert route is claimed by this phase.

## Artifacts

| file | purpose |
| --- | --- |
| `infra/caddy/Caddyfile.example` | Same-origin Caddy routing, baseline security headers, request-size and timeout placeholders, and an explicit HSTS approval gate |
| `infra/compose/docker-compose.production.example.yml` | Inert single-host Compose reference for Caddy, Next, API, worker, Postgres/PostGIS, Valkey, Garage, ClamAV, and optional observability |
| `infra/docker/client.Dockerfile.example` and `infra/docker/client.Dockerfile.example.dockerignore` | Example Node 24 production image for the Next client, with a Dockerfile-specific context ignore because the root `.dockerignore` intentionally excludes client source for the server image |
| `infra/env/production.env.example` and `infra/env/garage.production.env.example` | Production environment inventory with `__REQUIRED_*__` sentinels for operator-provided values and every Compose interpolation variable; Garage admin/metrics secrets stay service-scoped |
| `infra/prometheus/prometheus.yml` and `infra/prometheus/alerts.yml` | Optional Prometheus self-scrape plus an intentionally empty, valid alert-rule file; metrics endpoints, thresholds, and owners remain launch blockers |
| `infra/grafana/provisioning/**` and `infra/grafana/dashboards/acres-operations.json` | Optional Grafana provisioning with a metrics-gate panel, not customer analytics |
| `scripts/ops/check-production-templates.sh` | Static template existence, YAML/JSON parse, private-port, encrypted-mount, scheduler, HSTS, and env placeholder checks |
| `scripts/ops/scan-secrets.sh` | Tracked-file scan for known local passwords, `change-me` placeholders, launch sentinels outside approved docs/examples, and secret-looking `NEXT_PUBLIC_*` names |
| `scripts/ops/check-docker-runtime.sh` | Static server Dockerfile check for Node 24, non-root runtime, healthcheck, and direct Node startup |
| `scripts/ops/launch-readiness.sh` | Aggregates operational checks and then fails closed with the unresolved launch blockers |
| `.github/workflows/ci.yml` | Runs `npm run ops:check` alongside the existing deterministic repository checks |
| `scripts/db/bootstrap-production-roles.sh` | Production Postgres bootstrap for `acres_migrator`, `acres_app`, and `acres`; it deliberately omits the local `acres_test` role/database |

The production Compose example mounts the existing local Garage TOML only for
non-secret shape. It overrides `rpc_secret`, `admin.admin_token`, and the
metrics token through Garage-service-scoped `GARAGE_RPC_SECRET`,
`GARAGE_ADMIN_TOKEN`, and `GARAGE_METRICS_TOKEN`, matching Garage's documented
environment-secret override behavior. The shared production env file must not
carry Garage admin or metrics tokens.

Root scripts:

```bash
npm run ops:templates
npm run ops:scan-secrets
npm run ops:docker-runtime
npm run ops:check
npm run ops:launch-readiness
```

`ops:check` is expected to pass in CI. `ops:launch-readiness` is expected to
fail until the operator-owned production decisions below are resolved and the
runbook evidence is captured on the chosen host.

## Launch Blockers

These values are deliberately unset and must block launch when absent:

- production domain and TLS contact email;
- SMTP host, port, credentials, delivery policy, and abuse/complaint handling;
- secret-injection mechanism and rotation/masking procedure;
- session, CSRF/signing, database, storage, queue, SMTP, and Grafana secrets;
- SLO/availability target, capacity target, alert owners, and alert thresholds;
- RPO/RTO, backup destination, restore schedule, and DB/object reconciliation
  procedure;
- retention periods for account, audit, upload, rejected-object, export,
  report, and backup data;
- production volume-encryption mechanism, encrypted mount paths,
  key-separation rule, and key-recovery owner;
- production GraphQL introspection policy;
- production host, registry/image promotion path, rollback authority, and
  container/image provenance expectations.

## Runbooks

### Preflight

1. Resolve every `__REQUIRED_*__` value from
   `infra/env/production.env.example` through the approved secret store or host
   mechanism.
2. Run `npm run ops:check` from the repository root.
3. Run `docker compose -f infra/compose/docker-compose.production.example.yml
   config` with the real production env file loaded.
4. Confirm only Caddy publishes host ports, stateful services use encrypted
   mounts, and Grafana/Prometheus are not public unless an authenticated
   operator path has been approved.
5. Run the normal repository verification suite before building images.

### Deploy

1. Build immutable client and server images from a reviewed commit.
2. Apply database migrations with the migrator identity before starting the new
   API/worker pair.
3. Start/replace Caddy, Next, API, worker, and private dependencies with the
   production environment injected at runtime.
4. Verify `GET /health` for liveness and `GET /health/ready` for dependency
   readiness through the Caddy path and from the private network.
5. Run the authenticated smoke journeys: marketing page, login/register, `/app`,
   dashboards, reports, report export request/status, and download metadata.

### Rollback

Use immutable image tags and keep the previous Caddy/app configuration
available. Application rollback may point Caddy back to the previous Next/API
images. Schema rollback is not assumed: migrations must be backward-compatible
for at least one release cycle, and irreversible data changes use forward
fixes unless a reviewed undo migration exists.

### Migration Ordering

Run migration status before deploy, apply migrations with
`DATABASE_MIGRATION_URL`, then start runtime processes with non-owner
credentials. Do not start a production API or worker against pending or
destructive migrations. Expand/contract migrations must keep the previous
runtime compatible until rollback is no longer needed.

### Health And Readiness

`/health` proves only that the HTTP process can answer. `/health/ready` checks
PostgreSQL and object storage for the API. Queue and scanner readiness remain
worker dependencies and need fuller instrumentation before final launch.

### Backup

Back up PostgreSQL, Garage object data and metadata, deployment config,
certificate state, and recoverable signing/encryption material. Backups must
be encrypted, access-controlled, off-host, and separate from live volume unlock
material. Valkey persistence supports queue recovery but is not the product
ledger.

### Restore

Restore to an isolated environment from the selected backup set, apply the
migration chain, then reconcile PostgreSQL object metadata against Garage
objects and export artifacts. Record the elapsed restore time and data-loss
window against the operator-approved RPO/RTO; Phase 12A chooses neither number.

### Secret Rotation

Rotate one class at a time: introduce the new secret, restart affected
processes, verify health/readiness and an authenticated smoke path, then revoke
the old secret. Session and signing-secret rotation must include a user-impact
plan. Never print raw values in command output, CI logs, telemetry, or incident
notes.

### Compromise Response

Preserve logs and affected image/config identifiers, revoke exposed credentials,
rotate dependent credentials, inspect audit/export/object access, and rebuild
from a reviewed commit. If tenant data exposure is plausible, freeze deletion
workflows until evidence is captured and notification obligations are decided.

### Incident Evidence

Capture commit SHA, image digests, Compose config hash, Caddy config hash,
migration status, health/readiness results, affected request/job IDs, and
redacted logs. Do not capture cookies, authorization headers, raw uploads,
raw report/export contents, SMTP credentials, storage keys, or AI prompts.

## CI State

CI still has `permissions: contents: read`. The `checks` job runs the existing
lint, typecheck, build, contract drift, database role/migration, and server
test sequence, plus `npm run ops:check`. The Docker job still builds the server
image and smoke-tests `/health` with `push: false`; it does not publish an
image, configure a registry, deploy, or consume production secrets.

Client E2E remains a local verification command in this phase because the
existing CI job does not provision the full authenticated browser topology and
this prompt does not change browser-facing behavior.

## No-AI Posture

Optional AI remains unimplemented. Launch evidence must demonstrate that
regional browsing, dashboards, governed reports, exports, and operational
runbooks work without AI enabled. Any later AI work needs its own model,
license, evaluation, security, and operating-profile decision.

## Verification

Phase 12A verification on 2026-08-26:

```text
git diff --check
<no output>

npm run lint
@acres/client@0.1.0 lint
@acres/shared@0.1.0 lint
@acres/server@0.1.0 lint

npm run typecheck
✔ Generated Prisma Client (7.9.1)

npm run build
✓ Compiled successfully
✓ Generated Prisma Client (7.9.1)

npm run contracts:check
✔ Generated Prisma Client (7.9.1)

npm run ops:check
ops template check passed
secret/default scan passed
docker runtime check passed

npm run ops:launch-readiness
ops template check passed
secret/default scan passed
docker runtime check passed
launch readiness blocked: Phase 12A foundations are present
```

`docker compose --env-file infra/env/production.env.example --env-file
infra/env/garage.production.env.example -f
infra/compose/docker-compose.production.example.yml config` parses and renders
the production example with unresolved sentinels visible. A normalized Compose
inspection confirmed only the `garage` service receives
`GARAGE_ADMIN_TOKEN`/`GARAGE_METRICS_TOKEN`.

`npm run test:server` and `npm run test:client:e2e` could not fully pass in
this environment because the required `acres_test` PostgreSQL database was not
reachable. Docker image build also could not run because this user cannot
connect to `/var/run/docker.sock`. These are environment gaps, not launch
evidence.
