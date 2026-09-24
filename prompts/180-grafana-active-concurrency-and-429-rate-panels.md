# 180 — Grafana active concurrency and 429 rate panels

## Scope and why this is next

The committed baseline is `364b394` on `main`; the worktree is clean when this prompt was prepared. This is a bounded Phase 12 operational observability step under `docs/build-plan.md` §13, §21, §22, and `docs/operations.md`.

Prompts 166 and 167 introduced the dedicated `acres_http_429_responses_total` counter and the `HighHttpConcurrency` alert rule (`acres_http_active_requests{job="acres-api"} > 40`). Prompts 168–177 established deep database pool telemetry, PostgreSQL server metrics, and completed the full 11-rule Prometheus alerting suite. Prompts 178 and 179 completed capacity baseline modeling and fail-closed database latency SLO validation.

However, in `infra/grafana/dashboards/acres-operations.json`, the operational dashboard currently defines 26 panels covering 9 of the 11 alert rules, but lacks panels for the remaining two alert signals:
1. `acres_http_active_requests{job="acres-api"}` (in-flight active HTTP requests backing `HighHttpConcurrency`) is not visualized in any dashboard panel. Operators investigating high concurrency cannot observe active request trends or compare them against the 40-request fire threshold or 30-request clearing bar.
2. `acres_http_429_responses_total{job="acres-api"}` (5-minute HTTP 429 rate backing `High429Rate`) is not visualized in any dashboard panel. Operators investigating rate limiting spikes or potential credential stuffing / DoS attempts cannot observe the 429 percentage or compare it against the 10% fire threshold or 2% clearing bar.

Complete 100% Grafana dashboard coverage across all 11 Prometheus alert rules by adding Panel 27 ("API In-Flight Active HTTP Requests") and Panel 28 ("API HTTP 429 Rate Percentage") to `infra/grafana/dashboards/acres-operations.json`. Extend `scripts/ops/check-production-templates.sh` to enforce Panels 27 and 28, expand unit tests in `scripts/ops/verify-postgres-diagnostics.spec.js`, cross-reference Panels 27 and 28 in `docs/launch-checklist.md` §5, and document the resolution in `docs/operations.md` and `docs/build-plan.md`. Operator launch sign-off remains open.

## References and verified baseline

- Re-read `AGENTS.md` §§2, 4–7, 10, `docs/build-plan.md` §§13, 21, 22, `docs/operations.md` (Prometheus Metrics and Grafana Dashboard sections), `docs/launch-checklist.md` §5, and `docs/skills.md`.
- Inspect `infra/grafana/dashboards/acres-operations.json`, `scripts/ops/check-production-templates.sh`, and `scripts/ops/verify-postgres-diagnostics.spec.js`.
- Panel 27 contract:
  - ID: 27
  - Title: "API In-Flight Active HTTP Requests"
  - Type: "timeseries"
  - Target: `acres_http_active_requests{job="acres-api"}`
  - Unit: "short"
  - Thresholds: green 0, yellow 30 (clearing bar), red 40 (fire threshold)
  - Grid: `x=0, y=76, w=12, h=8`
- Panel 28 contract:
  - ID: 28
  - Title: "API HTTP 429 Rate Percentage"
  - Type: "timeseries"
  - Target: `(sum(rate(acres_http_429_responses_total{job="acres-api"}[5m])) / clamp_min(sum(rate(acres_http_requests_total{job="acres-api"}[5m])), 0.001)) * 100`
  - Unit: "percent"
  - Thresholds: green 0, yellow 2 (clearing bar), red 10 (fire threshold)
  - Grid: `x=12, y=76, w=12, h=8`
- Existing panels 1–26 and all 11 Prometheus alert rules remain intact.

## Implementation contract

1. **Grafana dashboard panels in `infra/grafana/dashboards/acres-operations.json`.**
   - Add Panel 27:
     ```json
     {
       "datasource": { "type": "prometheus", "uid": "Prometheus" },
       "fieldConfig": {
         "defaults": {
           "custom": { "drawStyle": "line", "lineInterpolation": "linear", "lineWidth": 1 },
           "mappings": [],
           "thresholds": {
             "mode": "absolute",
             "steps": [
               { "color": "green", "value": 0 },
               { "color": "yellow", "value": 30 },
               { "color": "red", "value": 40 }
             ]
           },
           "unit": "short"
         },
         "overrides": []
       },
       "gridPos": { "h": 8, "w": 12, "x": 0, "y": 76 },
       "id": 27,
       "options": {
         "legend": { "calcs": ["mean", "max", "lastNotNull"], "displayMode": "table", "placement": "bottom", "showLegend": true },
         "tooltip": { "mode": "single", "sort": "none" }
       },
       "targets": [
         {
           "expr": "acres_http_active_requests{job=\"acres-api\"}",
           "legendFormat": "Active Requests",
           "refId": "A"
         }
       ],
       "title": "API In-Flight Active HTTP Requests",
       "type": "timeseries"
     }
     ```
   - Add Panel 28:
     ```json
     {
       "datasource": { "type": "prometheus", "uid": "Prometheus" },
       "fieldConfig": {
         "defaults": {
           "custom": { "drawStyle": "line", "lineInterpolation": "linear", "lineWidth": 1 },
           "mappings": [],
           "thresholds": {
             "mode": "absolute",
             "steps": [
               { "color": "green", "value": 0 },
               { "color": "yellow", "value": 2 },
               { "color": "red", "value": 10 }
             ]
           },
           "unit": "percent"
         },
         "overrides": []
       },
       "gridPos": { "h": 8, "w": 12, "x": 12, "y": 76 },
       "id": 28,
       "options": {
         "legend": { "calcs": ["mean", "max", "lastNotNull"], "displayMode": "table", "placement": "bottom", "showLegend": true },
         "tooltip": { "mode": "single", "sort": "none" }
       },
       "targets": [
         {
           "expr": "(sum(rate(acres_http_429_responses_total{job=\"acres-api\"}[5m])) / clamp_min(sum(rate(acres_http_requests_total{job=\"acres-api\"}[5m])), 0.001)) * 100",
           "legendFormat": "429 Rate (%)",
           "refId": "A"
         }
       ],
       "title": "API HTTP 429 Rate Percentage",
       "type": "timeseries"
     }
     ```

2. **Template validation in `scripts/ops/check-production-templates.sh`.**
   - Add validation assertions for Panel 27 and Panel 28:
     - Panel 27 exists, has unit `'short'`, and target expr contains `acres_http_active_requests{job="acres-api"}`.
     - Panel 28 exists, has unit `'percent'`, and target expr contains `acres_http_429_responses_total{job="acres-api"}`.

3. **Test suite expansion in `scripts/ops/verify-postgres-diagnostics.spec.js`.**
   - Add tests verifying Panels 27 and 28 have unique IDs and correct metric scope.

4. **Documentation and runbook integration.**
   - In `docs/launch-checklist.md` §5 under `HighHttpConcurrency` and `High429Rate`, cross-reference Panel 27 and Panel 28.
   - Update `docs/operations.md` and `docs/build-plan.md` recording Prompt 180. Operator launch sign-off remains open.

## Verification and execution sequence

1. Record `BASE_SHA`, `HEAD_SHA`, branch, and clean worktree status.
2. Edit `infra/grafana/dashboards/acres-operations.json`, `scripts/ops/check-production-templates.sh`, and `scripts/ops/verify-postgres-diagnostics.spec.js`.
3. Run `npm run ops:templates` and `node --test scripts/ops/verify-postgres-diagnostics.spec.js`.
4. Update `docs/launch-checklist.md`, `docs/operations.md`, and `docs/build-plan.md`.
5. Run full operational and build verification: `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
6. Dispatch a Stage 1 reviewer subagent via `requesting-code-review`, evaluate findings with `receiving-code-review`, fix any verified issues, stage approved paths, and commit locally on `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `prometheus-configuration` — PromQL expressions, metric jobs, rate calculations, and counter normalization.
- `grafana-dashboards` — panel definitions, field configs, units, thresholds, grid layouts, and datasource configurations.
- `javascript-testing-patterns` — node:test assertions, schema validation, and regression suites.
- `deployment-pipeline-design` — production template checks and verification gates.
- `requesting-code-review` — Stage 1 code review dispatch.
- `receiving-code-review` — Stage 2 review evaluation and verification.
- `caveman-commit` — conventional commit message authoring.
