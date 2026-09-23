# 166 — measure HTTP 429 alert directly

## Scope and why this is next

The committed baseline is `3bf5668` on `main`, and the worktree was clean when this prompt was prepared. The ordered phases in `docs/build-plan.md` have committed implementations through Phase 12K; actual launch remains gated on operator-owned evidence and sign-off. This is a bounded, dependency-safe Phase 12J telemetry correction. `infra/prometheus/alerts.yml` names an alert `High429Rate` and describes HTTP 429 responses, but its numerator is `acres_http_requests_total{status_class="4xx"}`. The existing counter only records `status_class`, so 400, 401, 403, and 404 responses can trigger the 429 alert. `scripts/ops/verify-alert-rules.js` repeats the same error in its synthetic simulation. `docs/launch-checklist.md` acknowledges the mismatch while giving a 429-specific clear condition.

Make the alert measure actual HTTP 429 responses, preserving its existing >10% over 5m expression threshold, `for: 5m`, severity, alert name, and total-request denominator. This corrects the evidence an on-call operator sees without changing API responses, throttling, route handling, or the operator-owned threshold. It is a local repository follow-up, not launch approval.

## References read for planning

- `AGENTS.md` §§2–7 and 8.2; `docs/build-plan.md` Phase 12 (§13), sequence gates (§14), Phase 12J (§21), and Phase 12K (§22).
- `docs/operations.md` “Topology & Telemetry” metric list, cardinality/redaction invariant, Phase 12J alert description, and launch evidence limits; `docs/launch-checklist.md` §5 `High429Rate` runbook. These are the owning records to update. `docs/security.md` TM-05/TM-20 and Phase 12J evidence describe why the alert is used for abuse triage; update only if implementation wording becomes inaccurate.
- `server/src/metrics/metrics.service.ts`: `recordHttpRequest(method, rawPath, statusCode, durationSeconds)` receives the actual numeric status and records the three-label total counter plus duration histogram. `server/src/metrics/metrics.middleware.ts` passes `res.statusCode` through this method once on `finish` or `close` and excludes `/metrics`. Preserve that flow.
- `server/src/metrics/metrics.service.spec.ts`, `server/src/metrics/metrics.middleware.spec.ts`, `server/src/metrics/metrics.controller.spec.ts`, and `server/test/api.e2e-spec.ts`: existing metric exposition and middleware evidence. Add focused coverage where it demonstrates the new 429 behavior; retain current total/histogram tests.
- `infra/prometheus/alerts.yml`: `High429Rate` currently filters `status_class="4xx"` and annotates it as 429. `scripts/ops/verify-alert-rules.js` has `KNOWN_METRIC_IDENTIFIERS` and a `High429Rate` simulation using `requests4xx`; `scripts/ops/verify-alert-rules.spec.js` tests required alerts and simulations but does not reject a 4xx numerator. `scripts/ops/check-production-templates.sh` requires the alert name; `scripts/ops/run-capacity-alerting-drill.sh` runs the verifier.
- Installed `prom-client` is pinned at 15.1.3 in `package-lock.json`; the existing `Counter` construction and `.inc()` in `MetricsService` are the verified local API precedent. Read the implementation and generated exposition before editing. The `prometheus-configuration` skill guides low-cardinality counter and alert choices; `nestjs-best-practices` and `javascript-testing-patterns` guide the service and behavioral tests.
- No static visual reference applies. There is no component, route, comp measurement, or breakpoint change.

## Implementation contract

1. Add a separate unlabeled Prometheus counter in `MetricsService` named `acres_http_429_responses_total`. Its help text must say it counts HTTP 429 responses. Increment it exactly once when `recordHttpRequest()` receives `statusCode === 429`; other statuses, including 400/401/403/404 and 5xx, must not increment it. The existing `acres_http_requests_total` and duration histogram remain unchanged and still count all requests. A separate counter avoids a new high-cardinality status-code label and preserves the existing metric series contract. Keep `/metrics` bypass and finish/close one-shot behavior.
2. Change only the `High429Rate` numerator to `sum(rate(acres_http_429_responses_total[5m]))`; keep the denominator `clamp_min(sum(rate(acres_http_requests_total[5m])), 0.001)` and existing numeric threshold, window, `for`, severity, and alert name. Ensure the expression cannot fall back to the 4xx class. Keep alert annotations accurately about 429 responses. Do not silently change alert thresholds or invent an operator SLO.
3. In `verify-alert-rules.js`, add the new metric identifier and change `High429Rate` synthetic data to `requests429`. More importantly, make validation assert that the `High429Rate` expression uses the dedicated 429 numerator, the total-request denominator, and no `status_class="4xx"` substitute. A mere recognized-metric substring test is insufficient. Add a negative fixture in `verify-alert-rules.spec.js` that swaps the old 4xx numerator back in and must fail, plus a simulation case in which many 4xx responses but zero 429 responses do not fire. Keep the seven-alert count and other simulations intact. If a PromQL parser or `promtool` is available locally, use it; do not add a dependency solely for this step.
4. In `metrics.service.spec.ts`, assert exposition of the new counter after a mix of 429 and non-429 calls, with exact count equal to the number of 429 calls. Assert the old total counter still reflects both kinds and route labels remain normalized. Add a middleware regression only if service coverage does not demonstrate the single increment through `finish`/`close`; avoid a test that merely mirrors the implementation.
5. Update `docs/operations.md` to list the new metric and document the 429-specific alert numerator and what the static/synthetic verifier proves. Update `docs/launch-checklist.md` §5 `High429Rate` PromQL and triage/clear wording so it no longer says all 4xx count. The alert still cannot by itself prove an attack; operators inspect route and access-log context. Update `docs/security.md` in place only if its TM-05/TM-20 or Phase 12J wording requires correction. Record actual verification results in `docs/operations.md` during execution, not while preparing this prompt.

## Impact and edge cases

- The API, GraphQL, authentication, rate limiter, dashboard, and UI routes do not change. The private `/metrics` payload gains one unlabeled counter, and only the operational `High429Rate` numerator changes. Existing Prometheus/Grafana queries over `acres_http_requests_total` remain valid.
- At zero 429s, the counter may be absent from exposition until first increment depending on `prom-client` behavior; verify the actual behavior and make the alert/test robust to it. Do not pre-populate a fabricated 429 occurrence. At zero traffic, the rate alert must not fire. 401/403-heavy traffic alone must not trigger `High429Rate`.
- No schema/migration, package installation, new label dimension, client change, provider choice, registry access, or live alert firing is in scope. A running Prometheus server and production traffic are not presumed. Rollback is a single revert of service, rule, verifier, tests, and docs; no data migration is involved.

## Verification and execution sequence

1. On approval, re-read this prompt, `AGENTS.md`, the owning docs and scoped files, and every skill below. Capture `BASE_SHA`, `HEAD_SHA`, and initial status. Verify the installed `prom-client` behavior and the current `High429Rate` expression. If the baseline materially differs, stop and reconcile the brief before editing.
2. Run the focused service tests (use the existing server Jest command verified from `server/package.json`), `npm run ops:alert-test`, and `npm run ops:alert-drill`. Exercise the old-4xx-expression negative fixture and high-4xx/zero-429 simulation. Run `npm run ops:templates` and `npm run ops:capacity-alerting-drill -- --dry-run` if the latter is supported by the checked-in script; capture the actual evidence path and avoid staging generated evidence. Verify the production alert expression against available local PromQL tooling if present.
3. Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`. Inspect the full scoped diff. Quote actual outputs; report any environment-dependent check as unverified rather than claiming it passed. Broaden tests only for a concrete remaining risk.
4. Dispatch the Stage 1 reviewer subagent under `requesting-code-review` with requirements, paths, `BASE_SHA`/`HEAD_SHA`, diff, and real checks. Evaluate and address feedback under `receiving-code-review`; re-review if any material telemetry or alert contract changes follow. Update owning docs with implementation and evidence. Stage only approved paths, inspect staged diff, and commit locally on `main` using `caveman-commit`. Do not push.

## Non-goals

- Changing operator-set thresholds, alert routing, auth throttling, Caddy limits, Grafana panels, HTTP status responses, or adding a general per-status label.
- Claiming production alert behavior, host readiness, or launch approval from static/synthetic checks.
- Visual design, accessibility, motion, or 375/800/1280 breakpoint changes.

## SKILLS USED

- `prometheus-configuration` — low-cardinality counter and 429-specific PromQL alert design.
- `nestjs-best-practices` — preserve service/middleware ownership and private metric exposition.
- `javascript-testing-patterns` — behavioral metric and alert-verifier regression coverage.
- `requesting-code-review` — dispatch Stage 1 review after self-verification.
- `receiving-code-review` — verify and address reviewer feedback.
- `caveman-commit` — write the required local commit message at execution.
