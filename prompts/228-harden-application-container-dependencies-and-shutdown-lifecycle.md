# 228 — harden application container dependencies and shutdown lifecycle

## Scope and why this is next

Phase 12K is the earliest unfinished phase. At `b078ea80f4886fc5b89fab8d88cc5209dab38242` on `main`, Prompt 227 hardened observability healthchecks, gated Prometheus and Postgres Exporter dependencies, and expanded private network isolation across all 10 internal services. However, several operational container readiness, process lifecycle, and dependency gating gaps remain unverified in `scripts/ops/verify-container-security.js`, `scripts/ops/check-production-templates.sh`, and `infra/compose/docker-compose.production.example.yml`:

1. In `infra/compose/docker-compose.production.example.yml`, `api` declares `depends_on` requiring healthy `postgres`, `valkey`, and `garage`; `worker` declares `depends_on` requiring healthy `postgres`, `valkey`, `garage`, and `clamav`. Neither `scripts/ops/verify-container-security.js` nor `scripts/ops/check-production-templates.sh` verifies these application service dependencies. If any datastore dependency is omitted, misspelled, or configured with an unready condition (such as `service_started`), neither static validator detects it. The API or worker could boot before database schemas or caches are ready, triggering connection crashes or startup loops.
2. In `scripts/ops/verify-container-security.js`, check `process-init-supervision` asserts that `'Application services (api, worker, next) configure init: true and stop_signal: SIGTERM'`, but in code it only inspects `svc.init !== true` and never verifies `svc.stop_signal === 'SIGTERM'`. If `stop_signal` is omitted or altered, the check silently succeeds. Furthermore, `scripts/ops/check-production-templates.sh` contains zero checks for `init: true` or `stop_signal: SIGTERM` on `api`, `worker`, and `next`. Both validators must enforce `init: true` and `stop_signal: SIGTERM` fail-closed.
3. In `scripts/ops/run-deployment-drill.sh`, step 5 asserts expected stop grace periods for `caddy` (30s), `next` (30s), `api` (45s), and `worker` (60s). However, neither `scripts/ops/check-production-templates.sh` nor `scripts/ops/verify-container-security.js` verifies these application grace periods or checks that all eleven production services in `infra/compose/docker-compose.production.example.yml` declare an explicit bounded `stop_grace_period` (preventing Docker's default 10s timeout from aborting PostgreSQL buffer flushes, Valkey snapshots, Garage synchronization, or in-flight HTTP and queue drains). In addition, all eleven services must declare `restart: unless-stopped` for daemon restart resilience.
4. In `scripts/ops/verify-container-security.spec.js`, unit tests must be added to verify fail-closed detection when:
   - `api` omits `depends_on` for `postgres`, `valkey`, or `garage`, or permits conditions other than `service_healthy`.
   - `worker` omits `depends_on` for `postgres`, `valkey`, `garage`, or `clamav`, or permits conditions other than `service_healthy`.
   - `api`, `worker`, or `next` omits `init: true` or `stop_signal: SIGTERM`.
   - Any service omits `restart: unless-stopped` or application services drift from required `stop_grace_period` durations.

This is a dependency-safe Phase 12K operational hardening remediation, preserving all existing security boundaries and contracts without modifying database schema, public APIs, or client runtime code.

## Authorities and verified references

- Re-read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §§13–14 and 22; `docs/operations.md` Phase 12K and deployment hardening; `docs/launch-checklist.md` §§2, 4, 5, 6, and 6A; `docs/security.md` container isolation boundaries; and `docs/skills.md`.
- Inspect `infra/compose/docker-compose.production.example.yml`, `scripts/ops/verify-container-security.js`, `scripts/ops/verify-container-security.spec.js`, `scripts/ops/check-production-templates.sh`, and `scripts/ops/run-deployment-drill.sh`.
- No visual reference, crop, pixel measurement, or UI token applies. The operational contract is:
  - `api` gates startup on `postgres: condition: service_healthy`, `valkey: condition: service_healthy`, and `garage: condition: service_healthy`.
  - `worker` gates startup on `postgres: condition: service_healthy`, `valkey: condition: service_healthy`, `garage: condition: service_healthy`, and `clamav: condition: service_healthy`.
  - `api`, `worker`, and `next` configure `init: true` and `stop_signal: SIGTERM`.
  - `caddy` (30s), `next` (30s), `api` (45s), and `worker` (60s) enforce their verified `stop_grace_period` contracts, and all eleven services declare bounded `stop_grace_period` and `restart: unless-stopped`.
  - Production template checkers and container security audits enforce these requirements fail-closed.

## Implementation plan

1. In `scripts/ops/verify-container-security.js`:
   - Add `application-dependencies-healthy` check:
     - `api` must define `depends_on` with `postgres`, `valkey`, and `garage` all requiring `condition: service_healthy`.
     - `worker` must define `depends_on` with `postgres`, `valkey`, `garage`, and `clamav` all requiring `condition: service_healthy`.
   - Update `process-init-supervision` check:
     - Verify both `svc.init === true` and `svc.stop_signal === 'SIGTERM'` for each of `api`, `worker`, and `next`.
   - Add `graceful-shutdown-lifecycle` check:
     - Verify expected `stop_grace_period` for application services (`caddy: '30s'`, `next: '30s'`, `api: '45s'`, `worker: '60s'`).
     - Verify all defined services in Compose declare a non-empty `stop_grace_period` and `restart: unless-stopped`.
2. In `scripts/ops/check-production-templates.sh`:
   - Validate that `api.depends_on` requires healthy `postgres`, `valkey`, and `garage`.
   - Validate that `worker.depends_on` requires healthy `postgres`, `valkey`, `garage`, and `clamav`.
   - Validate that `api`, `worker`, and `next` declare `init: true` and `stop_signal: SIGTERM`.
   - Validate that `caddy`, `next`, `api`, and `worker` match required `stop_grace_period` (`30s`, `30s`, `45s`, `60s`), and all eleven services define bounded `stop_grace_period` and `restart: unless-stopped`.
3. In `scripts/ops/verify-container-security.spec.js`:
   - Add unit tests asserting fail-closed behavior when:
     - `api` omits `depends_on` or any required backend (`postgres`, `valkey`, `garage`), or uses non-healthy condition.
     - `worker` omits `depends_on` or any required backend (`postgres`, `valkey`, `garage`, `clamav`), or uses non-healthy condition.
     - `api`, `worker`, or `next` omits `init: true` or `stop_signal: SIGTERM`.
     - `caddy`, `next`, `api`, or `worker` drifts on `stop_grace_period`.
     - Any service omits `restart: unless-stopped`.
4. Update `docs/operations.md` and `docs/launch-checklist.md` with the application dependency gating, signal supervision, and shutdown drain invariants.

## Verification and acceptance

1. Run `npm run ops:container-test` and `npm run ops:container-security`.
2. Run `npm run ops:templates`, `npm run ops:deployment-drill -- --dry-run`, and `npm run ops:check`.
3. Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
4. Dispatch an independent code review via `requesting-code-review`, evaluate findings with `receiving-code-review`, update documentation, and commit with `caveman-commit`.

## Expected impact, limits and rollback

- Expected behavior: Application services (`api`, `worker`, `next`, `caddy`) enforce complete topological readiness gating (`api` waits for healthy postgres, valkey, garage; `worker` waits for healthy postgres, valkey, garage, clamav; `caddy` waits for healthy next, api, garage). Process signal supervision (`init: true` + `stop_signal: SIGTERM`) and bounded graceful drain periods are strictly verified fail-closed across both static template preflight and container security audits.
- Limits: Does not execute live container shutdown on production hosts; verifies the static Compose configuration and deployment contract.
- Rollback: Revert this commit to return to previous validator rules.

## SKILLS USED

- `deployment-pipeline-design` — specify application dependency healthcheck gating and graceful shutdown drain contracts.
- `secrets-management` — preserve credential isolation and file-mount scoping across application services.
- `javascript-testing-patterns` — create parsed-Compose regression tests for application dependencies, signal supervision, and shutdown periods.
- `requesting-code-review` — dispatch independent code review subagent.
- `receiving-code-review` — evaluate review feedback with technical rigor.
- `caveman-commit` — craft concise conventional commit message.
