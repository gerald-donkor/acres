# 227 — harden observability container healthchecks and dependencies

## Scope and why this is next

Phase 12K is the earliest unfinished phase. At `9411522e8ca25659bd18bbe67caeaed154cbeab2` on `main`, Prompt 226 tightened container healthchecks and internal network isolation for the seven core application and datastore services (`api`, `worker`, `next`, `postgres`, `valkey`, `garage`, `clamav`). However, four operational readiness and dependency gating gaps remain in the observability profile of `infra/compose/docker-compose.production.example.yml`, `scripts/ops/run-deployment-drill.sh`, and `scripts/ops/check-production-templates.sh`:

1. In `infra/compose/docker-compose.production.example.yml`, `postgres-exporter` connects to `postgres:5432/acres` to collect database metrics, but lacks an explicit `depends_on: postgres: condition: service_healthy` block. If the observability profile is launched alongside or shortly after database initialization, `postgres-exporter` attempts connections before database role reconciliation (`001-bootstrap-production-roles.sh` and `002-reconcile-production-monitor.sh`) and database health checks complete, producing connection failures and log noise. Explicitly declaring `depends_on: postgres: condition: service_healthy` ensures the metrics exporter only connects to a proven healthy database.
2. In `infra/compose/docker-compose.production.example.yml`, `prometheus` lacks an explicit bounded `healthcheck:` block. The `prom/prometheus:v3.8.0` image includes BusyBox `wget` and exposes the `/-/healthy` endpoint on port 9090. Defining `healthcheck: test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:9090/-/healthy || exit 1"]` with bounded timing (`interval: 30s`, `timeout: 5s`, `start_period: 15s`, `retries: 3`) establishes bounded liveness verification for the telemetry ingestion engine.
3. In `infra/compose/docker-compose.production.example.yml`, `grafana` is provisioned with Prometheus as its default datasource (`http://prometheus:9090`), but lacks `depends_on: prometheus: condition: service_healthy`. Explicitly declaring `depends_on: prometheus: condition: service_healthy` ensures Grafana does not attempt dashboard provisioning or query execution against an unready Prometheus server.
4. In `scripts/ops/run-deployment-drill.sh`, the step 5 network isolation check inspects only `['next', 'api', 'worker', 'postgres', 'valkey', 'garage']`, omitting `clamav`, `prometheus`, `postgres-exporter`, and `grafana`. All 10 internal services must be evaluated to ensure none joins the public network, matching the invariant enforced by `scripts/ops/verify-container-security.js`.
5. In `scripts/ops/check-production-templates.sh` and `scripts/ops/verify-container-security.js`:
   - Validate that `postgres-exporter` defines `depends_on.postgres` with `condition: service_healthy`.
   - Validate that `prometheus` defines a bounded healthcheck (`127.0.0.1:9090/-/healthy`).
   - Validate that `grafana` defines `depends_on.prometheus` with `condition: service_healthy`.
   - Add unit tests in `scripts/ops/verify-container-security.spec.js` asserting these invariants.

This is a dependency-safe Phase 12K hardening remediation, preserving all existing security boundaries and contracts without modifying database schema, public APIs, or client runtime code.

## Authorities and verified references

- Re-read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §§13–14 and 22; `docs/operations.md` Phase 12K and deployment hardening; `docs/launch-checklist.md` §§2, 4, 5 and 6A; `docs/security.md` container isolation boundaries; and `docs/skills.md`.
- Inspect `infra/compose/docker-compose.production.example.yml`, `infra/prometheus/prometheus.yml`, `infra/grafana/provisioning/datasources/prometheus.yml`, `scripts/ops/verify-container-security.js`, `scripts/ops/verify-container-security.spec.js`, `scripts/ops/check-production-templates.sh`, and `scripts/ops/run-deployment-drill.sh`.
- No visual reference, crop, pixel measurement, or UI token applies. The operational contract is:
  - `postgres-exporter` gates startup on `postgres: condition: service_healthy`.
  - `prometheus` defines an explicit bounded healthcheck on `/-/healthy`.
  - `grafana` gates startup on `prometheus: condition: service_healthy`.
  - `run-deployment-drill.sh` validates private network isolation across all 10 internal services (`next`, `api`, `worker`, `postgres`, `valkey`, `garage`, `clamav`, `prometheus`, `postgres-exporter`, `grafana`).
  - Production template checkers and container security audits enforce these requirements fail-closed.

## Implementation plan

1. In `infra/compose/docker-compose.production.example.yml`:
   - Add `depends_on: postgres: condition: service_healthy` to `postgres-exporter`.
   - Add explicit `healthcheck:` to `prometheus`: `test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:9090/-/healthy || exit 1"]`, `interval: 30s`, `timeout: 5s`, `start_period: 15s`, `retries: 3`.
   - Add `depends_on: prometheus: condition: service_healthy` to `grafana`.
2. In `scripts/ops/run-deployment-drill.sh`:
   - Update step 5 network isolation check from `['next', 'api', 'worker', 'postgres', 'valkey', 'garage']` to all 10 internal non-Caddy services (`next`, `api`, `worker`, `postgres`, `valkey`, `garage`, `clamav`, `prometheus`, `postgres-exporter`, `grafana`), ensuring none joins the public network.
3. In `scripts/ops/check-production-templates.sh`:
   - Assert `postgres-exporter.depends_on.postgres.condition === 'service_healthy'`.
   - Assert `prometheus.healthcheck` defines `wget -qO- http://127.0.0.1:9090/-/healthy || exit 1`.
   - Assert `grafana.depends_on.prometheus.condition === 'service_healthy'`.
4. In `scripts/ops/verify-container-security.js`:
   - Add observability dependency and healthcheck validation:
     - If `postgres-exporter` is defined, require `depends_on.postgres.condition === 'service_healthy'`.
     - If `prometheus` is defined, require a bounded healthcheck.
     - If `grafana` is defined, require `depends_on.prometheus.condition === 'service_healthy'`.
5. In `scripts/ops/verify-container-security.spec.js`:
   - Add unit tests asserting that missing `prometheus` healthcheck, omitting `postgres-exporter.depends_on.postgres`, or omitting `grafana.depends_on.prometheus` triggers fail-closed validation.
6. Update `docs/operations.md` and `docs/launch-checklist.md` with the observability profile healthcheck and dependency gating invariants.

## Verification and acceptance

1. Run `npm run ops:container-test` and `npm run ops:container-security`.
2. Run `npm run ops:templates`, `npm run ops:deployment-drill -- --dry-run`, and `npm run ops:check`.
3. Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
4. Dispatch an independent code review via `requesting-code-review`, evaluate findings with `receiving-code-review`, update documentation, and commit with `caveman-commit`.

## Expected impact, limits and rollback

- Expected behavior: Observability services initialize in strictly verified topological order (`postgres` healthy -> `postgres-exporter` starts; `prometheus` healthy -> `grafana` starts). Prometheus liveness is tracked via bounded healthcheck. All 10 internal services are validated against public network leakage in both container security audit and deployment drill.
- Limits: Does not replace live operator metrics collection or Grafana credential management.
- Rollback: Revert this commit to return to previous template declarations.

## SKILLS USED

- `deployment-pipeline-design` — specify service dependency healthcheck gating and deployment drill verification.
- `prometheus-configuration` — define bounded healthcheck on Prometheus engine endpoint.
- `grafana-dashboards` — configure upstream datasource readiness dependency for Grafana service.
- `secrets-management` — preserve credential isolation and file-mount scoping across observability services.
- `javascript-testing-patterns` — create parsed-Compose regression tests for observability healthchecks and dependencies.
- `requesting-code-review` — dispatch independent code review subagent.
- `receiving-code-review` — evaluate review feedback with technical rigor.
- `caveman-commit` — craft concise conventional commit message.
