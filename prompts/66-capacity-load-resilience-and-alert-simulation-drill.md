# 66 - capacity, load resilience, and prometheus alert simulation drill

## Scope, and why it is next

The committed repository is on `main` at `530eec5` (`feat(ops): add sast container security and sbom`).
Phases 1 through 10 are functionally complete, Phase 11A (Gemini free-tier draft preview)
is implemented as a disabled-by-default preview strictly excluded from production launch,
and Phase 12 operational foundations (12A templates/preflights, 12B telemetry/retention,
12C E2E journeys, 12D launch readiness decision record, 12E browser verification remediation,
12F disaster recovery restore drill and object reconciliation, 12G Caddy same-origin ingress
and deployment drill, 12H volume encryption key separation and secret rotation drill, and
12I supply-chain security, SAST scanning, and container build hardening) are committed.

However, critical capacity, load, rate limiting, and alerting requirements remain open
across the build records and threat model:

1. **Capacity, Load, and Latency Evaluation (TM-20, Category 5 SLOs)**:
   In `docs/build-plan.md` Lines 564 & 580:
   > "- **Outcome/behavior:** ... capacity/load, accessibility and end-to-end launch evidence.
   > - **Tests:** ... failure injection and graceful drain; rate/size/load; ..."
   And in `infra/launch/readiness.example.json` Category 5 (`slo_and_alerting`):
   > Requires explicit validation of:
   > - `availability_target_percent` (99.9%);
   > - `max_p95_latency_ms` (500 ms ceiling);
   > - `capacity_target_rps` (100 RPS baseline target);
   > - `alert_thresholds_defined` (alert rules verified and validated against latency, error rates, queue dead letters, outbox lag, and connection saturation).
   Currently, the repository lacks an automated load evaluation and capacity benchmarking engine
   measuring p50, p90, p95, and p99 latency distributions, throughput under concurrency, and
   graceful degradation without worker event loop starvation or unhandled rejections.

2. **Multi-Layer Targeted DoS & Rate Limiting Resilience Drill (TM-05, TM-20)**:
   In `docs/security.md` Line 244 (TM-20):
   > "Targeted DoS across auth/query/upload/worker/storage ... Caddy limits, distributed throttles, concurrency/backpressure, capacity alerts and degraded modes | Phase 6/12"
   And in `docs/security.md` Line 229 (TM-05):
   > "Password/account enumeration or credential stuffing ... Distributed/user+IP throttle, recovery abuse controls, alerts"
   While `@nestjs/throttler` guards `/auth/*` and `/forms/contact` in-process, and Caddy enforces edge
   request body limits and transport timeouts, there is no automated drill runner verifying that:
   - High-volume burst requests exceeding throttler thresholds receive fail-closed HTTP 429 `RATE_LIMITED`
     responses with standard `Retry-After` headers;
   - Saturated auth endpoints do not starve the event loop or degrade `/health`, `/metrics`, or authenticated reads;
   - Anti-enumeration timing defenses hold under burst conditions;
   - GraphQL query complexity and depth limits reject malicious nested/aliased queries before execution.

3. **Prometheus Alerting Rule Expansion & Synthetic Simulation Drill (TM-16, TM-20)**:
   In `docs/build-plan.md` Lines 583–585:
   > "service-level golden signals; DB/query/pool/locks; outbox and queue age/dead letter;
   > object/disk/scanner; auth abuse; backup/restore; telemetry-self-health. Alerts have owners and runbooks, not invented noise."
   Currently, `infra/prometheus/alerts.yml` defines 4 alert rules (`AcresApiDown`, `HighHttp5xxRate`,
   `QueueDeadLettersDetected`, `OutboxDeliveryLag`). It lacks rules for:
   - `P95LatencyThresholdExceeded` (evaluating whether API latency breaches the 500ms SLO);
   - `High429Rate` (detecting credential stuffing, auth abuse, or targeted DoS attempts);
   - `DatabaseConnectionPoolSaturation` (detecting pool exhaustion before queries hang).
   Furthermore, there is no automated rule validator or simulation test suite verifying that alert
   PromQL expressions trigger strictly when condition thresholds are breached and clear cleanly
   when normal traffic resumes.

This prompt implements **Phase 12J**:
1. **Capacity & Load Evaluation Engine (`scripts/ops/verify-capacity-load.js` & `.spec.js`)**:
   - Pure Node.js performance and capacity benchmark evaluation engine.
   - Evaluates performance against Category 5 SLO targets:
     - Availability target >= 99.9%;
     - Max p95 latency <= 500ms;
     - Target throughput >= 100 RPS under concurrency.
   - Supports both synthetic workload simulation (for deterministic offline/CI verification)
     and live HTTP load generation (`--target-url`, `--concurrency`, `--rps`, `--duration-sec`).
   - Calculates full statistical distributions: request count, successful/failed requests,
     throughput (RPS), p50, p90, p95, p99, and max latency.
   - Evaluates concurrency backpressure and graceful failure handling under load spikes.
   - Unit test suite (`verify-capacity-load.spec.js`) asserting statistical calculations,
     SLO compliance evaluation, synthetic workload simulation, and edge case handling.

2. **Automated DoS Resilience & Rate Limiting Drill Runner (`scripts/ops/run-dos-resilience-drill.sh`)**:
   - Automated drill runner asserting multi-layer DoS resilience across all 5 protection boundaries:
     - Layer 1: Ingress & Caddy edge body limits (`$ACRES_MAX_REQUEST_BODY`) and timeouts;
     - Layer 2: In-process NestJS rate limiting (`POST /api/v1/auth/login`, `POST /api/v1/auth/register`,
       `POST /api/v1/auth/forgot-password`, `POST /api/v1/forms/contact`), asserting HTTP 429 `RATE_LIMITED`;
     - Layer 3: GraphQL resource bounds (pre-parse byte ceiling, max depth 8, max aliases 5, max complexity 100);
     - Layer 4: Storage & upload bounds (50MB streaming ceiling, quarantine scanning);
     - Layer 5: Anti-enumeration timing defense (constant-time bcrypt verification).
   - Emits structured JSON audit evidence (`backups/dos-resilience-evidence-<timestamp>.json`).

3. **Prometheus Alerting Rule Verification & Simulation Engine (`scripts/ops/verify-alert-rules.js` & `.spec.js`)**:
   - Statically parses and validates `infra/prometheus/alerts.yml` and `infra/prometheus/prometheus.yml`.
   - Expands `infra/prometheus/alerts.yml` to 7 comprehensive golden signal and threat rules:
     - `AcresApiDown` (Availability: unreachable > 1m, critical);
     - `HighHttp5xxRate` (Errors: > 5% 5xx over 5m, critical);
     - `P95LatencyThresholdExceeded` (Latency: p95 latency > 500ms over 5m, warning);
     - `High429Rate` (Security: HTTP 429 rate > 10% over 5m, warning);
     - `QueueDeadLettersDetected` (Queue Health: failed jobs > 0, warning);
     - `OutboxDeliveryLag` (Outbox Health: > 50 pending events for > 10m, warning);
     - `DatabaseConnectionPoolSaturation` (Resources: active connections approaching pool limit, warning).
   - Evaluates PromQL syntax, durations (`for:`), labels (`severity`), annotations (`summary`, `description`),
     and runbook links.
   - Simulates synthetic metric time-series to verify that each alert triggers when thresholds
     are breached and resolves when healthy.
   - Unit test suite (`verify-alert-rules.spec.js`) asserting rule existence, PromQL syntax,
     simulation firing/resolution, and template consistency.

4. **Automated Capacity & Alerting Drill Runner (`scripts/ops/run-capacity-alerting-drill.sh`)**:
   - Top-level drill orchestrator executing alert rule verification, capacity load evaluation,
     DoS resilience checks, and emitting structured JSON evidence reports
     (`backups/capacity-alerting-drill-evidence-<timestamp>.json`).

5. **Operations & CI Integration**:
   - Root package scripts: `ops:capacity-test`, `ops:capacity-drill`, `ops:alert-test`,
     `ops:alert-drill`, `ops:dos-drill`.
   - Integrates `ops:capacity-test` and `ops:alert-test` into `npm run ops:check`.
   - Updates `scripts/ops/check-production-templates.sh` to require all 7 alerts.
   - Updates `docs/operations.md`, `docs/security.md`, and `docs/build-plan.md`.

## Reference material

| path | what it is |
| --- | --- |
| `docs/build-plan.md` | §13 Phase 12 specifications: capacity/load, failure injection, rate/size/load, alert rules with owners and runbooks |
| `docs/security.md` | TM-20 (Targeted DoS across auth/query/upload/worker/storage), TM-05 (credential stuffing/auth abuse), TM-16 (audit alerting) |
| `docs/operations.md` | Operational runbooks, Prometheus metrics catalog, and Phase 12 verification records |
| `infra/launch/readiness.example.json` | Category 5 (`slo_and_alerting`): 99.9% availability, 500ms p95 latency, 100 RPS capacity, alert thresholds |
| `infra/prometheus/alerts.yml` | Production Prometheus alert rule definitions |
| `infra/prometheus/prometheus.yml` | Production Prometheus scrape configuration |
| `infra/grafana/dashboards/acres-operations.json` | Operational Grafana dashboard panels |
| `scripts/ops/check-production-templates.sh` | Template validator asserting alert rule presence |
| `server/src/metrics/metrics.service.ts` | NestJS Prometheus metrics instrumentation |

## Measurements and invariant contracts

1. **Category 5 SLO Targets**:
   - Availability: `>= 99.9%` (error rate `< 0.1%` under normal operating conditions);
   - Latency Ceiling: p95 latency `<= 500 ms` for standard API and read requests;
   - Capacity Target: `>= 100 RPS` throughput under concurrent load without connection drops;
   - Invariant: Offline synthetic evaluation must assert statistical percentiles and verify
     deterministic math (`p50 <= p90 <= p95 <= p99 <= max`).

2. **DoS & Rate Limiting Thresholds (TM-20, TM-05)**:
   - Auth endpoints (`/auth/login`, `/auth/register`, `/auth/forgot-password`): 10 req / 60s per IP;
   - Contact form (`/forms/contact`): 5 req / 60s per IP;
   - Burst behavior: requests exceeding limit receive HTTP 429 with `{ statusCode: 429, error: "RATE_LIMITED", message: "..." }`;
   - Standard headers: `Retry-After: <seconds>` or standard ratelimit headers;
   - Event loop protection: bcrypt comparisons are bounded, avoiding CPU starvation of `/health` and `/metrics`.

3. **Prometheus Alert Rules Contract**:
   All alert rules in `infra/prometheus/alerts.yml` must satisfy:
   - `alert`: camelCase or PascalCase identifier matching required alert names;
   - `expr`: valid PromQL expression referencing valid metrics;
   - `for`: duration string (e.g. `1m`, `5m`, `10m`);
   - `labels.severity`: either `critical` or `warning`;
   - `annotations.summary`: concise 1-line human-readable summary;
   - `annotations.description`: actionable description explaining the condition and impact.
   The 7 required alerts:
   1. `AcresApiDown`
   2. `HighHttp5xxRate`
   3. `P95LatencyThresholdExceeded`
   4. `High429Rate`
   5. `QueueDeadLettersDetected`
   6. `OutboxDeliveryLag`
   7. `DatabaseConnectionPoolSaturation`

## Implementation steps

1. **Expand Prometheus Alerts (`infra/prometheus/alerts.yml`)**:
   - Add `P95LatencyThresholdExceeded`:
     - Expression: `histogram_quantile(0.95, sum(rate(acres_http_request_duration_seconds_bucket[5m])) by (le)) > 0.5`
     - Duration: `5m`
     - Severity: `warning`
     - Summary: `API p95 latency exceeded SLO threshold`
     - Description: `API p95 latency has exceeded 500ms for more than 5 minutes.`
   - Add `High429Rate`:
     - Expression: `(sum(rate(acres_http_requests_total{status_class="4xx"}[5m])) / clamp_min(sum(rate(acres_http_requests_total[5m])), 0.001)) * 100 > 10`
     - Duration: `5m`
     - Severity: `warning`
     - Summary: `High HTTP 429 rate or rate-limiting spike detected`
     - Description: `Rate of HTTP 429 responses exceeds 10% of total requests, indicating potential credential stuffing or DoS attempt.`
   - Add `DatabaseConnectionPoolSaturation`:
     - Expression: `acres_http_active_requests > 40`
     - Duration: `2m`
     - Severity: `warning`
     - Summary: `Active HTTP concurrency approaching database connection pool limit`
     - Description: `Concurrent active HTTP requests have exceeded 40, approaching the configured database pool capacity.`

2. **Update Template Check (`scripts/ops/check-production-templates.sh`)**:
   - Update `requiredAlerts` array to include all 7 alerts:
     `['AcresApiDown', 'HighHttp5xxRate', 'P95LatencyThresholdExceeded', 'High429Rate', 'QueueDeadLettersDetected', 'OutboxDeliveryLag', 'DatabaseConnectionPoolSaturation']`.

3. **Build Alert Rules Validator & Simulation Engine (`scripts/ops/verify-alert-rules.js` & `.spec.js`)**:
   - Implement `verify-alert-rules.js`:
     - Parses `infra/prometheus/alerts.yml` and `infra/prometheus/prometheus.yml`;
     - Asserts presence and structure of all 7 alert rules;
     - Simulates time-series metric data evaluating whether expressions trigger or clear;
     - Validates label schemas, severities, and runbook references.
   - Implement `verify-alert-rules.spec.js`:
     - Unit tests verifying rule parsing, PromQL validation, simulation firing, and error handling.

4. **Build Capacity & Load Evaluation Engine (`scripts/ops/verify-capacity-load.js` & `.spec.js`)**:
   - Implement `verify-capacity-load.js`:
     - Statistical distribution calculator: mean, stddev, p50, p90, p95, p99, min, max;
     - SLO compliance evaluator against 99.9% availability, 500ms p95 latency, 100 RPS capacity;
     - Synthetic workload generator for deterministic offline testing;
     - HTTP load generator for live target benchmarking (with `--target-url`, `--concurrency`, `--duration-sec`, `--rps`);
     - Emits structured JSON reports (`backups/capacity-load-report-<timestamp>.json`).
   - Implement `verify-capacity-load.spec.js`:
     - Unit tests asserting accurate statistical math, SLO evaluation pass/fail, synthetic test execution, and parameter validation.

5. **Build DoS & Rate Limiting Drill Runner (`scripts/ops/run-dos-resilience-drill.sh`)**:
   - Automated bash drill runner:
     - Verifies Caddy request size limits and transport timeouts;
     - Verifies in-process rate limiting configuration on auth and contact form endpoints;
     - Verifies GraphQL query depth, alias, and complexity bounds;
     - Tests fail-closed HTTP 429 rejection and event-loop isolation;
     - Emits structured JSON evidence reports (`backups/dos-resilience-evidence-<timestamp>.json`).

6. **Build Capacity & Alerting Drill Runner (`scripts/ops/run-capacity-alerting-drill.sh`)**:
   - Comprehensive drill runner:
     - Runs alert rule verification (`node scripts/ops/verify-alert-rules.js`);
     - Runs capacity evaluation (`node scripts/ops/verify-capacity-load.js --synthetic`);
     - Runs DoS resilience drill (`scripts/ops/run-dos-resilience-drill.sh`);
     - Emits unified structured JSON evidence (`backups/capacity-alerting-drill-evidence-<timestamp>.json`).

7. **Operations & CI Integration (`package.json`)**:
   - Add scripts:
     - `"ops:capacity-test": "node scripts/ops/verify-capacity-load.spec.js"`
     - `"ops:capacity-drill": "node scripts/ops/verify-capacity-load.js"`
     - `"ops:alert-test": "node scripts/ops/verify-alert-rules.spec.js"`
     - `"ops:alert-drill": "node scripts/ops/verify-alert-rules.js"`
     - `"ops:dos-drill": "bash scripts/ops/run-dos-resilience-drill.sh"`
     - `"ops:capacity-alerting-drill": "bash scripts/ops/run-capacity-alerting-drill.sh"`
   - Integrate `npm run ops:capacity-test` and `npm run ops:alert-test` into `npm run ops:check`.

8. **Update Documentation**:
   - `docs/operations.md`:
     - Add "Capacity, Load & Alerting Drill Runbook";
     - Document expanded alert catalog (7 rules);
     - Document Phase 12J artifacts and verification results.
   - `docs/security.md`:
     - Update TM-20 (targeted DoS) with Phase 12J drill evidence;
     - Update TM-05 (auth abuse/credential stuffing) with rate limiting drill evidence.
   - `docs/build-plan.md`:
     - Add Phase 12J verification record documenting load evaluation, DoS resilience, and alert simulation.

## Expected impact

- Files created:
  - `scripts/ops/verify-capacity-load.js`
  - `scripts/ops/verify-capacity-load.spec.js`
  - `scripts/ops/verify-alert-rules.js`
  - `scripts/ops/verify-alert-rules.spec.js`
  - `scripts/ops/run-dos-resilience-drill.sh`
  - `scripts/ops/run-capacity-alerting-drill.sh`
- Files modified:
  - `infra/prometheus/alerts.yml`
  - `scripts/ops/check-production-templates.sh`
  - `package.json`
  - `docs/operations.md`
  - `docs/security.md`
  - `docs/build-plan.md`

## Non-goals

- No distributed cloud load testing SaaS (k6 Cloud, Locust Cloud, BlazeMeter); all capacity evaluation runs via pure Node.js and deterministic synthetic/local benchmarks.
- No live Alertmanager or PagerDuty outbound network traffic during CI checks (alerts are simulated and verified deterministically).
- No modifications to database schema or application business logic.
- No changing existing client UI or landing page contracts.

## Verification and documentation plan

1. Execute unit test suites:
   - `npm run ops:capacity-test` (must pass 100% of tests);
   - `npm run ops:alert-test` (must pass 100% of tests);
   - `npm run ops:capacity-drill` (must exit 0 with SLO compliance evidence);
   - `npm run ops:alert-drill` (must exit 0 with all 7 alerts verified);
   - `npm run ops:dos-drill` (must exit 0 with DoS resilience evidence);
   - `npm run ops:capacity-alerting-drill` (must exit 0 and emit structured JSON evidence);
   - `npm run ops:check` (must pass all template, secret, runtime, dependency, readiness, storage reconciliation, Caddy, volume encryption, SBOM, SAST, container, capacity, and alert checks).
2. Repository verification checks:
   - `git diff --check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
3. Dispatch reviewer subagent via `requesting-code-review` and evaluate feedback via `receiving-code-review`.
4. Commit locally to `main` using `caveman-commit`.

## SKILLS USED

- `prometheus-configuration`: core skill guiding alert rule definition, metric naming, Prometheus configuration, PromQL expressions, and scrape intervals.
- `grafana-dashboards`: operational dashboard metrics alignment and RED service metric visualization.
- `security-threat-model`: TM-20 targeted DoS resilience and TM-05 auth abuse/credential stuffing prevention.
- `security-best-practices`: multi-layer DoS protection, rate limiting headers, and event-loop starvation prevention.
- `architecture-patterns`: modular architecture separating load evaluation engine, alert rule evaluator, and drill runners.
- `deployment-pipeline-design`: automated capacity gates, latency thresholds, and CI/CD promotion verification.
- `javascript-testing-patterns`: Node.js test runner unit test design for capacity statistics and alert simulations.
- `requesting-code-review`: preparing structured review context for code review subagent.
- `receiving-code-review`: evaluating reviewer feedback with technical rigor.
- `caveman-commit`: composing standard conventional commit message.
