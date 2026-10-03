# Phase 12K follow-up — modularize and test production template checks

## Scope and why this is next

Modularize the 580-line inline Node.js verification script currently embedded in `scripts/ops/check-production-templates.sh` into a standalone, exported module `scripts/ops/check-production-templates.js`, establish comprehensive unit and contract test coverage in `scripts/ops/check-production-templates.spec.js`, wire the test into `npm run ops:templates-test`, and update template checks and documentation:

1. Create `scripts/ops/check-production-templates.js`:
   - Extract and export discrete template verification functions:
     - `mountDetails(entry)`: parses compose volume mount string or object into `{ source, target, persistent, writable }`.
     - `assertPostgres18Mount(composeDocument, path)`: enforces that services using `postgis/postgis:18-*` mount persistent writable storage at `/var/lib/postgresql` and forbids mounting `/var/lib/postgresql/data`.
     - `validateRequiredServices(services)`: ensures required services (`caddy`, `next`, `api`, `worker`, `postgres`, `valkey`, `garage`, `clamav`, `prometheus`, `grafana`, `postgres-exporter`) exist.
     - `validateComposeSecurityAndTopology(services)`: validates port publishing (only Caddy publishes host ports), scheduler exclusivity (`api: false`, `worker: true`), encrypted volume placeholder markers (`ENCRYPTED_MOUNT` in `postgres`, `valkey`, `garage`), lack of `env_file` directives across all services, and Garage-scoped secrets (`GARAGE_RPC_SECRET`, `GARAGE_ADMIN_TOKEN`, `GARAGE_METRICS_TOKEN`, `GARAGE_METRICS_TOKEN_FILE`).
     - `validateComposeEnvironmentInterpolation(composeText, envKeys)`: ensures all `${VAR}` interpolation placeholders in compose are declared in `production.env.example` or `garage.production.env.example` (allowing `ACRES_MONITOR_BOOTSTRAP_PASSWORD`) and rejects development/test role leakage (`ACRES_TEST_PASSWORD`, `bootstrap-roles.sh`).
     - `validateWorkerAndExporterScrape(services, prom, monitorSql, operationsDoc)`: validates private worker metrics on port 3002 (`/health` and `/metrics`), postgres-exporter container profile (`observability`), private network, file password mount (`ACRES_MONITOR_PASSWORD_FILE`), relabel keep rules, and `reconcile-production-monitor.sh` / `docs/operations.md` contracts.
     - `validateServiceHealthAndSupervision(services)`: enforces `service_healthy` condition on all dependencies of `api`, `worker`, and `grafana`; requires `init: true` and `stop_signal: SIGTERM` for `api`, `worker`, `next`; enforces `restart: unless-stopped` and exact bounded `stop_grace_period` (`caddy: 30s`, `next: 30s`, `api: 45s`, `worker: 60s`).
     - `validatePrometheusAlertsAndDashboard(alerts, dashboard, checklist)`: validates 11 alert rules in `alerts.yml`, panel queries scoped to corresponding jobs (`acres-api`, `acres-worker`, `acres-postgres`, `prometheus`), absent-data preservation on designated panels, exact duration/request panel units and targets, and matching PromQL and dashboard runbook sections in `docs/launch-checklist.md`.
     - `validateReadinessTargets(readinessExample, bdrSec)`: enforces Category 5 SLO targets (99.9% availability, 500ms max p95, 100 RPS capacity, 50ms acquisition, 100ms query), Category 6 RPO/RTO targets (1h RPO, 4h RTO), and backup cron schedule max gap.
     - `validateDrillScriptIntegrations(launchDrillsScript, deploymentDrillScript, secretRotationScript)`: validates launch drill runner dossier assemblage, deployment drill signal supervision and drain verification, and secret rotation option validation and redaction audit.
     - `checkProductionTemplates(options, io)`: orchestrates the full template verification suite, delegating to helper functions, returning structured error lists or exiting cleanly.
     - `main(argv, io)`: CLI runner executing `checkProductionTemplates()` and terminating with code 0 on success or 1 on failure.

2. Create `scripts/ops/check-production-templates.spec.js`:
   - Comprehensive unit and contract test suite using Node.js test runner (`node:test`, `node:assert/strict`):
     - Unit tests for `mountDetails`: string syntax (`ro`, `rw`, modes), object syntax (`type: 'volume'|'bind'`, `read_only`), invalid/empty formats.
     - Unit tests for `assertPostgres18Mount`: passing mounts at `/var/lib/postgresql`, rejection of missing mounts, non-persistent/read-only mounts, and forbidden mounts at `/var/lib/postgresql/data`.
     - Unit tests for `validateRequiredServices`: passing when all 11 services exist, throwing when any service is missing.
     - Unit tests for `validateComposeSecurityAndTopology`: port exposure on non-caddy services, scheduler misconfiguration, missing encrypted mount markers, forbidden `env_file`, and leaked Garage tokens.
     - Unit tests for `validateComposeEnvironmentInterpolation`: unmapped interpolation keys, allowed monitor bootstrap password, and forbidden test role markers.
     - Unit tests for `validateWorkerAndExporterScrape`: worker port/probe mismatches, exporter configuration errors, monitor role SQL checks, and credential mounting isolation.
     - Unit tests for `validateServiceHealthAndSupervision`: missing dependency health conditions, missing `init: true` or `stop_signal: SIGTERM`, improper restart policy, and mismatched drain periods.
     - Unit tests for `validatePrometheusAlertsAndDashboard`: missing alert rules, drifted panel queries, absent data vector masks, and missing runbook sections in checklist.
     - Unit tests for `validateReadinessTargets`: drifted Category 5 SLO thresholds, drifted Category 6 RPO/RTO targets, and excessive backup cron gaps.
     - Unit tests for `validateDrillScriptIntegrations`: missing dossier assemblage markers, supervision markers, or rotation redaction audit markers.
     - Integration tests for `checkProductionTemplates`: running against actual repository templates exiting cleanly with zero errors.

3. Refactor `scripts/ops/check-production-templates.sh`:
   - Replace the inline heredoc (`node <<'NODE' ... NODE`) with a clean execution of `node scripts/ops/check-production-templates.js`.
   - Add `require_file scripts/ops/check-production-templates.js` and `require_file scripts/ops/check-production-templates.spec.js`.
   - Retain all prerequisite file checks (`require_file`) and subsequent shell-level validations (secret greps, Caddyfile HSTS grep, and downstream script executions).

4. Update `package.json`:
   - Update `"ops:templates-test"` to include `scripts/ops/check-production-templates.spec.js`.

5. Update Documentation:
   - Update `docs/operations.md` and `docs/build-plan.md` recording the modular template verification contracts and test results.

Following Prompts 254–257:
- All operational drill runners and shell orchestrators (`run-launch-drills.sh`, `launch-readiness.sh`, `check-launch-readiness.js`, `run-restore-drill.sh`, `run-deployment-drill.sh`, `run-secret-rotation-drill.sh`, `run-dos-resilience-drill.sh`, `run-capacity-alerting-drill.sh`) have dedicated modular JS files and `.spec.js` test specifications.
- Modularizing `check-production-templates.sh` eliminates the final large embedded heredoc script in `scripts/ops/`, establishing full unit testability and contract isolation for all production infrastructure templates.

This is a repository-owned, dependency-safe operational hardening step within Phase 12K. Prompt 201 still governs real production evidence collection and sign-off.

Planning baseline: clean worktree at commit `fb10469` (`fix(ops): harden and test launch readiness orchestrator`).

## References read and execution prerequisites

Planning read:
- `AGENTS.md` phase-control, workflow, prompt, product, and standing rules
- `docs/build-plan.md` Phase 12 and Phase 12K (prompts 246–257)
- `docs/skills.md`
- `docs/system-architecture.md` §11–12
- `docs/security.md` TM-01, TM-04, TM-05, TM-15, and Phase 12K evidence integrity
- `docs/operations.md` Phase 12K and prompts 246–257
- `docs/launch-checklist.md` Categories 1–11
- `prompts/201-production-launch-evidence-and-signoff.md`
- `prompts/257-harden-and-test-launch-readiness-shell-orchestrator.md`

Code inspected:
- `scripts/ops/check-production-templates.sh`
- `scripts/ops/check-smtp-template-keys.js`
- `scripts/ops/check-garage-metrics.js`
- `scripts/ops/check-proxy-environment.js`
- `scripts/ops/check-application-environment.js`
- `scripts/ops/check-release-images.js`
- `scripts/ops/verify-postgres-diagnostics.js`
- `package.json`

## Non-goals

- Altering any production templates or configurations in `infra/`.
- Changing the fail-closed evaluation behavior or error messages of template checks.
- Modifying runtime client, server, or worker code.
- Fabricating production drill evidence or signing off on launch readiness.

## Measurable requirements and implementation plan

### 1. Extract `scripts/ops/check-production-templates.js`

Implement modular functions with exact behavioral parity to the current inline script:
- `mountDetails(entry)`
- `assertPostgres18Mount(composeDocument, path)`
- `validateRequiredServices(services)`
- `validateComposeSecurityAndTopology(services)`
- `validateComposeEnvironmentInterpolation(composeText, envKeys)`
- `validateWorkerAndExporterScrape(services, prom, monitorSql, operationsDoc, caddyfileText)`
- `validateServiceHealthAndSupervision(services)`
- `validatePrometheusAlertsAndDashboard(alerts, dashboard, checklist, exporterScrape)`
- `validateReadinessTargets(readinessExample)`
- `validateDrillScriptIntegrations(launchDrillsScript, deploymentDrillScript, secretRotationScript)`
- `checkProductionTemplates(options, io)`: Accepts `{ cwd }` options and `{ log, error }` io overrides. Reads template files relative to `cwd`, executes validators, and returns `{ success, errors }`.
- `main(argv, io)`: When called as CLI entrypoint, exits with 0 on success or prints errors and exits with 1.
- Export all helpers in `module.exports`.

### 2. Create `scripts/ops/check-production-templates.spec.js`

Write unit and contract tests:
- `mountDetails`: string and object volume mount variants.
- `assertPostgres18Mount`: valid mount `/var/lib/postgresql`, missing mount, read-only mount, and invalid `/var/lib/postgresql/data` mount.
- `validateRequiredServices`: presence of all 11 required services and failure on missing service.
- `validateComposeSecurityAndTopology`: host port binding, scheduler configuration, encrypted mount marker presence, `env_file` rejection, and Garage token isolation.
- `validateComposeEnvironmentInterpolation`: interpolation validation against environment examples and test password rejection.
- `validateWorkerAndExporterScrape`: private worker metrics, exporter configuration, monitor role sql assertions, and credential separation.
- `validateServiceHealthAndSupervision`: dependency health checks, supervision init/signal, restart policies, and drain periods.
- `validatePrometheusAlertsAndDashboard`: 11 alert rules, panel job scopes, absent data preservation, query duration and request units, and checklist runbook links.
- `validateReadinessTargets`: SLO and RTO/RPO thresholds, and backup schedule cron gap.
- `validateDrillScriptIntegrations`: launch drills dossier assemblage, deployment supervision, and rotation redaction.
- `checkProductionTemplates`: clean run on repository template files returning `{ success: true, errors: [] }`.

### 3. Update `scripts/ops/check-production-templates.sh`

- Replace lines 70–649 with:
  ```sh
  node scripts/ops/check-production-templates.js || fail 'production template validation failed'
  ```
- Add `require_file scripts/ops/check-production-templates.js` and `require_file scripts/ops/check-production-templates.spec.js`.

### 4. Update `package.json`

- Update `"ops:templates-test"`:
  ```json
  "ops:templates-test": "node --test scripts/ops/check-smtp-template-keys.spec.js scripts/ops/check-proxy-environment.spec.js scripts/ops/check-application-environment.spec.js scripts/ops/check-garage-metrics.spec.js scripts/ops/check-production-templates.spec.js"
  ```

### 5. Update Documentation

- `docs/operations.md`: record the modular production templates validator architecture, contract helpers, and test suite.
- `docs/build-plan.md`: record Prompt 258 verification results, test counts, and exit state.

## SKILLS USED

- `javascript-testing-patterns`: design and structure comprehensive unit and contract tests using Node.js built-in test runner for template validation helpers.
- `prometheus-configuration`: verify scrape targets, metrics paths, private ports, and alert rule specifications across production templates.
- `grafana-dashboards`: verify dashboard panel target PromQL expressions, absent-data handling, and unit configurations.
- `secrets-management`: enforce indirect secret referencing, password file mounting, and development credential rejection across compose and env templates.
- `deployment-pipeline-design`: verify container supervision, health checks, restart policies, and graceful drain period contracts.
- `requesting-code-review`: prepare structured review request and dispatch reviewer subagent upon completing implementation.
- `receiving-code-review`: evaluate reviewer feedback with technical rigor and codebase verification before fixing issues.
- `caveman-commit`: author conventional, concise commit message following project standards.

## Verification commands

```bash
npm run ops:templates-test
npm run ops:templates
npm run ops:launch-readiness-test
npm run ops:readiness-test
npm run ops:launch-drill-test
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```
