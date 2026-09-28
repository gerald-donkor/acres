# 226 — strengthen production container healthchecks and internal network isolation

## Scope and why this is next

Phase 12K is the earliest unfinished phase. At `8e9aa532cfc2b270536639af452c54c3f07a60a1` on `main`, Prompt 225 authenticated Valkey's healthcheck. However, two operational resilience and isolation gaps remain in `infra/compose/docker-compose.production.example.yml` and `scripts/ops/verify-container-security.js`:

1. In `infra/compose/docker-compose.production.example.yml`, `next` lacks an explicit bounded `healthcheck:` block, and `caddy` depends on `next` with `condition: service_started` instead of `service_healthy`. In contrast, `api` and `garage` are gated on `service_healthy`. If Next.js takes time to compile routes or initialize during deployment or restarts, Caddy can begin routing ingress traffic before the Next HTTP server is ready, triggering 502 Bad Gateway responses at the edge. Explicitly defining `next`'s healthcheck (`wget -qO- http://127.0.0.1:3000/ || exit 1`) with bounded timing matching `infra/docker/client.Dockerfile.example` and updating Caddy's dependency to `next: condition: service_healthy` ensures all ingress backends are proven healthy before edge routing begins.
2. In `scripts/ops/verify-container-security.js`, `requiredHealthcheckServices` checks `['api', 'postgres', 'valkey', 'garage', 'clamav']`, omitting `worker` (which exposes `http://127.0.0.1:3002/health`) and `next`. Both `worker` and `next` are core application services whose health checks must be enforced by container security audits.
3. In `scripts/ops/verify-container-security.js`, `datastore-network-isolation` restricts only `['postgres', 'valkey', 'garage', 'clamav', 'prometheus']`. Internal services like `postgres-exporter` and `grafana` (as well as `next`, `api`, `worker`) must never attach to the `public` Docker network. Only `caddy` publishes ports and bridges `public` and `private`.
4. In `infra/compose/docker-compose.production.example.yml`, `clamav` healthcheck lacks a `start_period`, risking premature retry consumption while ClamAV initializes its daemon. Adding `start_period: 30s` aligns with other services (`api`, `worker`, `next`).

This is a dependency-safe Phase 12K hardening remediation, preserving all existing security boundaries and contracts without modifying database schema, public APIs, or client runtime code.

## Authorities and verified references

- Re-read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §§13–14 and 22; `docs/operations.md` Phase 12K and deployment hardening; `docs/launch-checklist.md` §§2, 4 and 6A; `docs/security.md` container isolation boundaries; and `docs/skills.md`.
- Inspect `infra/compose/docker-compose.production.example.yml`, `infra/docker/client.Dockerfile.example`, `server/Dockerfile`, `scripts/ops/verify-container-security.js`, `scripts/ops/verify-container-security.spec.js`, `scripts/ops/check-production-templates.sh`, and `scripts/ops/run-deployment-drill.sh`.
- No visual reference, crop, pixel measurement, or UI token applies. The operational contract is:
  - All application and stateful services (`api`, `worker`, `next`, `postgres`, `valkey`, `garage`, `clamav`) define bounded healthchecks in Compose.
  - Caddy's backend dependencies (`next`, `api`, `garage`) all require `condition: service_healthy`.
  - All internal services (`next`, `api`, `worker`, `postgres`, `valkey`, `garage`, `clamav`, `prometheus`, `postgres-exporter`, `grafana`) attach exclusively to the private internal network. Only `caddy` attaches to `public`.
  - Failures in healthcheck definitions or network isolation fail `verify-container-security` and `check-production-templates.sh` with clear, actionable diagnostics.

## Implementation plan

1. In `infra/compose/docker-compose.production.example.yml`:
   - Add explicit `healthcheck:` to `next` service: `test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/ || exit 1"]`, `interval: 30s`, `timeout: 5s`, `start_period: 15s`, `retries: 3`.
   - Update `caddy.depends_on.next` from `condition: service_started` to `condition: service_healthy`.
   - Add `start_period: 30s` to `clamav.healthcheck`.
2. In `scripts/ops/verify-container-security.js`:
   - Expand `requiredHealthcheckServices` to `['api', 'worker', 'next', 'postgres', 'valkey', 'garage', 'clamav']`, and ensure the check description and error messages reflect all critical application and datastore services.
   - Enforce that all non-Caddy services (`next`, `api`, `worker`, `postgres`, `valkey`, `garage`, `clamav`, `prometheus`, `postgres-exporter`, `grafana`) never attach to the `public` network.
   - Add a check validating that all Caddy backend dependencies in `caddy.depends_on` require `condition: service_healthy`.
3. In `scripts/ops/verify-container-security.spec.js`:
   - Add tests asserting that removing `next` or `worker` healthcheck fails `service-healthchecks-defined`.
   - Add tests asserting that attaching `postgres-exporter` or `grafana` or `worker` to `public` fails network isolation.
   - Add tests asserting that setting `caddy.depends_on.next.condition` to `service_started` fails dependency healthcheck validation.
4. Update `docs/operations.md` and `docs/launch-checklist.md` Category 10 with the updated healthcheck and network isolation invariants.

## Verification and acceptance

1. Run `npm run ops:container-test` and `npm run ops:container-security`.
2. Run `npm run ops:templates`, `npm run ops:deployment-drill -- --dry-run`, and `npm run ops:check`.
3. Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
4. Dispatch an independent code review via `requesting-code-review`, evaluate findings with `receiving-code-review`, update documentation, and commit with `caveman-commit`.

## Expected impact, limits and rollback

- Expected behavior: Caddy only routes to Next once Next is verified healthy, eliminating potential cold-start 502s. Container security audits enforce healthchecks on all 7 critical services and forbid public network attachment on all 10 internal services.
- Limits: Does not replace live operator deployment testing.
- Rollback: Revert this commit to return to previous template declarations.

## SKILLS USED

- `deployment-pipeline-design` — specify service dependency healthcheck gating and edge readiness.
- `secrets-management` — preserve container environment scoping and prevent secret leakage.
- `javascript-testing-patterns` — create parsed-Compose regression tests for healthchecks and network isolation.
- `requesting-code-review` — dispatch independent code review subagent.
- `receiving-code-review` — evaluate review feedback with technical rigor.
- `caveman-commit` — craft concise conventional commit message.
