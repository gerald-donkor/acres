# 229 — deployment promotion drill hardening and automated test suite

## Scope and why this is next

Phase 12K is the earliest unfinished phase. At `6e0341e18379f50f3a733b69caa4928a2aad21a7` on `main`, Prompt 228 hardened application container dependencies (`api` and `worker` datastore gating), signal supervision (`init: true` and `stop_signal: SIGTERM`), and shutdown drain lifetimes across `scripts/ops/verify-container-security.js` and `scripts/ops/check-production-templates.sh`.

However, the dedicated deployment drill runner `scripts/ops/run-deployment-drill.sh` (the standalone runner executed by Stage 3 of the Unified Launch Drill orchestrator and `npm run ops:deployment-drill`) and its operational test coverage exhibit several gaps:

1. In `scripts/ops/run-deployment-drill.sh`, step 5 ("Evaluating rollback readiness and graceful shutdown drain periods..."):
   - It asserts that `caddy` (30s), `next` (30s), `api` (45s), and `worker` (60s) declare expected `stop_grace_period` values, but omits validation that all eleven production services in `infra/compose/docker-compose.production.example.yml` declare an explicit bounded `stop_grace_period`.
   - It fails to verify that all eleven production services configure `restart: unless-stopped`.
   - It fails to verify `application-dependencies-healthy`:
     - `api` must configure `depends_on` requiring healthy `postgres`, `valkey`, and `garage`.
     - `worker` must configure `depends_on` requiring healthy `postgres`, `valkey`, `garage`, and `clamav`.
     - `caddy` must configure `depends_on` requiring healthy `next`, `api`, and `garage`.
     - `grafana` must configure `depends_on` requiring healthy `prometheus`.
     - `postgres-exporter` must configure `depends_on` requiring healthy `postgres`.
   - It fails to verify `process-init-supervision` (`init: true` and `stop_signal: SIGTERM` across `api`, `worker`, and `next`).
   If an operator or candidate Compose file drifts or strips dependency health conditions or process signal supervision, `scripts/ops/run-deployment-drill.sh` does not fail closed on step 5.
2. `scripts/ops/run-deployment-drill.sh` currently lacks an automated regression unit test suite (`scripts/ops/run-deployment-drill.spec.js`). Unlike sibling drill runners (`run-launch-drills.spec.js`, `verify-caddy-routing.spec.js`, `verify-volume-encryption.spec.js`, `verify-container-security.spec.js`), `run-deployment-drill.sh` has no dedicated test harness validating:
   - CLI flags (`--help`, `--dry-run`, unknown option handling, missing value arguments).
   - `--caddyfile`, `--compose-file`, `--evidence-dir`, `--evidence-file`, and `--api-url` parameter routing.
   - Fail-closed behavior on corrupted or non-compliant Compose configurations (missing dependencies, unready conditions, missing `restart: unless-stopped`, missing or drifted `stop_grace_period`, network isolation violations).
   - JSON evidence file structure and Category 10 compliance.
3. In `package.json`, `ops:deployment-test` is not defined and is not included in `npm run ops:check`.
4. In `scripts/ops/check-production-templates.sh`, `require_file scripts/ops/run-deployment-drill.spec.js` must be declared and the script must verify the deployment drill's hardened checks.

This prompt hardens `scripts/ops/run-deployment-drill.sh`, creates `scripts/ops/run-deployment-drill.spec.js`, registers `ops:deployment-test` in `package.json` and `npm run ops:check`, updates template preflights, and records the verification in `docs/operations.md` and `docs/launch-checklist.md`.

## Authorities and verified references

- Re-read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §§18 and 22; `docs/operations.md` Phase 12K and deployment hardening; `docs/launch-checklist.md` Category 10 (`deployment_and_rollback`); `docs/security.md` container boundaries; and `docs/skills.md`.
- Inspect `scripts/ops/run-deployment-drill.sh`, `infra/compose/docker-compose.production.example.yml`, `scripts/ops/check-launch-readiness.js`, and `scripts/ops/check-production-templates.sh`.
- The operational contract for deployment promotion and rollback:
  - Compose services declare `restart: unless-stopped` and bounded `stop_grace_period` across all 11 services.
  - Expected drain periods: `caddy: '30s'`, `next: '30s'`, `api: '45s'`, `worker: '60s'`.
  - Application dependencies: `api` gates on healthy `postgres`, `valkey`, `garage`; `worker` gates on healthy `postgres`, `valkey`, `garage`, `clamav`; `caddy` gates on healthy `next`, `api`, `garage`; `grafana` gates on healthy `prometheus`; `postgres-exporter` gates on healthy `postgres`.
  - Process signal supervision: `api`, `worker`, `next` declare `init: true` and `stop_signal: SIGTERM`.
  - Network isolation: `caddy` attaches to `public` and `private`; all other 10 services attach exclusively to `private`.

## Implementation plan

1. In `scripts/ops/run-deployment-drill.sh`:
   - Expand Step 5 Node evaluation to:
     - Verify all 11 services configure `restart: unless-stopped`.
     - Verify all 11 services declare a positive bounded `stop_grace_period` matching `/^[1-9]\d*s$/`.
     - Verify application drain durations (`caddy: 30s`, `next: 30s`, `api: 45s`, `worker: 60s`).
     - Verify application dependencies on healthy upstream services (`api`, `worker`, `caddy`, `grafana`, `postgres-exporter`).
     - Verify process init supervision (`init: true` and `stop_signal: SIGTERM` on `api`, `worker`, and `next`).
     - Retain network isolation check across all 10 internal services.
2. In `scripts/ops/run-deployment-drill.spec.js`:
   - Implement comprehensive Node test suite (`node:test`, `node:assert`, `node:child_process`):
     - Test `--help` flag displays usage and exits 0.
     - Test unknown option exits 1 with clear error message.
     - Test missing argument value exits 1 for `--caddyfile`, `--compose-file`, `--evidence-dir`, `--evidence-file`, `--api-url`.
     - Test `--dry-run` executes cleanly against default production templates and emits valid Category 10 JSON evidence.
     - Test fail-closed validation when:
       - Compose service omits `restart: unless-stopped`.
       - Compose service omits or provides unbounded `stop_grace_period`.
       - Application service drifts on expected `stop_grace_period`.
       - Application service omits required healthy dependency.
       - Application service omits `init: true` or `stop_signal: SIGTERM`.
       - Internal service joins the `public` network.
3. In `package.json`:
   - Add script `"ops:deployment-test": "node --test scripts/ops/run-deployment-drill.spec.js"`.
   - Add `npm run ops:deployment-test` into `"ops:check"`.
4. In `scripts/ops/check-production-templates.sh`:
   - Add `require_file scripts/ops/run-deployment-drill.spec.js`.
   - Add static assertion that `scripts/ops/run-deployment-drill.sh` contains the complete dependency, init, restart, and drain validation.
5. In `docs/operations.md` and `docs/launch-checklist.md`:
   - Document Prompt 229 hardening of deployment drill runner validation, dependency gating, process supervision, and automated regression test suite.

## Verification and acceptance

1. Run `npm run ops:deployment-test`.
2. Run `npm run ops:deployment-drill`.
3. Run `npm run ops:templates`, `npm run ops:container-test`, `npm run ops:launch-drill-test`, and `npm run ops:check`.
4. Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
5. Dispatch an independent code review via `requesting-code-review`, evaluate findings with `receiving-code-review`, update documentation, and commit with `caveman-commit`.

## Expected impact, limits and rollback

- Expected behavior: `scripts/ops/run-deployment-drill.sh` performs fail-closed validation of all container dependencies, process signal supervision, daemon restart policies, and shutdown drain timeouts during deployment preflights. Automated regression tests verify all CLI options and fail-closed branches in CI.
- Limits: Tests run against static/mock Compose and Caddy templates in `--dry-run` mode; does not perform live container rollout on production hosts.
- Rollback: Revert this commit to restore previous deployment drill script.

## SKILLS USED

- `deployment-pipeline-design` — specify promotion preflight verification, dependency gating, and graceful shutdown contracts.
- `javascript-testing-patterns` — create parsed-Compose regression tests for deployment runner options, fail-closed guards, and evidence generation.
- `requesting-code-review` — dispatch independent code review subagent.
- `receiving-code-review` — evaluate review feedback with technical rigor.
- `caveman-commit` — craft concise conventional commit message.
