# 167 — correct HTTP concurrency alert semantics

## Scope and why this is next

The committed baseline is `3a51c4c` on `main`; the worktree was clean when this prompt was prepared. The ordered implementation phases in `docs/build-plan.md` have committed work through Phase 12K, while actual launch still needs operator-owned evidence and sign-off. This is a bounded Phase 12J/12K operational correctness step that can be completed without those decisions. The seventh rule in `infra/prometheus/alerts.yml` is named `DatabaseConnectionPoolSaturation`, yet its entire expression is `acres_http_active_requests > 40`. That gauge measures in-flight HTTP requests in Nest, not Prisma or PostgreSQL connections. The alert annotation, incident runbook, and latency runbook turn a traffic-concurrency observation into a claim about database pool capacity. A high HTTP count can occur with spare connections; a saturated pool can occur with fewer than 40 requests or from worker activity.

Rename and describe the existing rule as an HTTP concurrency warning while keeping its current 40-request threshold, 2-minute `for`, warning severity, metric, and other six rules. Document that real pool saturation remains unmeasured and is a separate launch telemetry gap; do not present this change as closing the pool-saturation requirement. The next implementation can instrument a verified Prisma/PostgreSQL pool signal with a separately justified alert.

## References read for planning

- `AGENTS.md` §§2–7 and 8.2; `docs/build-plan.md` Phase 12 (§13), sequence gates (§14), and Phase 12J record (§21). Phase 12 asks for DB/query/pool telemetry, actionable alerts, and measured thresholds.
- `docs/operations.md` “Topology & Telemetry,” artifact list, and Phase 12J alert inventory; `docs/launch-checklist.md` §5 runbooks for `P95LatencyThresholdExceeded` and `DatabaseConnectionPoolSaturation`; `docs/security.md` TM-20 and Phase 12J record; `docs/system-architecture.md` §11.4. These are the owning records to reconcile with the corrected signal, without rewriting historical evidence as if it never existed.
- `infra/prometheus/alerts.yml`: seventh rule has `expr: acres_http_active_requests > 40`, `for: 2m`, `severity: warning`. `server/src/metrics/metrics.service.ts` defines the gauge as current in-flight HTTP requests. No inspected source exposes a database pool occupancy metric. `infra/prometheus/prometheus.yml` scrapes the API and Prometheus only.
- `scripts/ops/verify-alert-rules.js` holds the required seven names and synthetic definitions; `scripts/ops/verify-alert-rules.spec.js` has the seven-rule fixtures; `scripts/ops/check-production-templates.sh` has an independent required-name list. `scripts/ops/run-capacity-alerting-drill.sh` calls the alert verifier. Keep these contracts aligned.
- The installed `prometheus-configuration` skill supplies alert/metric naming and self-monitoring guidance; `javascript-testing-patterns` supplies behavior-focused regression guidance. No visual comp, crop, board region, breakpoint, client component, Next API, or static-design measurement applies.

## Implementation contract

1. Rename `DatabaseConnectionPoolSaturation` to `HighHttpConcurrency` in `infra/prometheus/alerts.yml`. Preserve its exact `acres_http_active_requests > 40` expression, `for: 2m`, `severity: warning`, and rule-group placement. Rewrite its summary and description to say only that API HTTP requests in flight have exceeded 40 for two minutes. Do not claim a database pool limit or root cause. Keep the other six alert rules byte-identical unless formatting tools require a mechanical change.
2. Update `REQUIRED_ALERTS`, `SIMULATION_DEFINITIONS`, rule descriptions, and any name-specific logic in `scripts/ops/verify-alert-rules.js`, plus the independent name gate in `scripts/ops/check-production-templates.sh`. The simulation must still fire above 40 and clear at or below 40. Make the validator assert the new rule's precise signal (`acres_http_active_requests > 40`), 2-minute duration, and warning severity, so a future name-only change or substituted pool claim is rejected. A focused negative fixture in `verify-alert-rules.spec.js` should reject a changed expression (for example, an unrelated metric) or reintroduced old name; update existing expected seven-rule counts without weakening other checks.
3. Rename the §5 runbook heading in `docs/launch-checklist.md` to `HighHttpConcurrency`. Triage actual in-flight request load, route patterns, p95 latency, 5xx, and dependency health. If database saturation is suspected, instruct operators to inspect PostgreSQL/Prisma connection evidence separately before attributing cause. Containment should follow the observed cause and existing rollback authority; avoid an unsupported instruction to raise a pool ceiling or add replicas solely because this rule fired. Keep the existing operator-defined clearing condition (<30 active requests for 15m) identified as a runbook decision, not a measured pool threshold. Remove the `P95LatencyThresholdExceeded` runbook's claim that co-firing of this alert points at the pool.
4. Reconcile the current alert inventories in `docs/operations.md` and `docs/security.md` with the new name and meaning. Add a clear outstanding-gap note in `docs/operations.md`: no direct Prisma/PostgreSQL pool utilization, wait-time, or exhaustion metric has been verified in this repository; HTTP concurrency is only an application load signal. In historical Phase 12J records of `docs/build-plan.md` and `docs/security.md`, preserve the original implemented-state account and append a dated correction note rather than silently changing what prompt 66 built. Update `docs/system-architecture.md` only if a current-state sentence claims pool telemetry is already implemented. Do not revise the 11-category launch readiness schema or approve any category.
5. Search the scoped repository for the old alert name, its former pool-saturation annotation, and any remaining claim that active HTTP requests *measure* pool usage. All current operational references must be accurate; historical references may remain only with an adjacent correction. Leave the gauge and its metric exposition unchanged. No Grafana panel currently refers to this rule name, so no dashboard edit is expected.

## Impact and edge cases

- This is a Prometheus alert identity change. At deployment, the old alert series disappears and the new `HighHttpConcurrency` series starts its 2-minute pending timer. Operators must update any external receiver routing, silences, or saved links keyed by the old name before promotion; the repository has no configured Alertmanager receiver to edit. State this rollout note in `docs/operations.md`.
- High HTTP concurrency does not prove pool saturation, database pressure, or an outage. A worker-only pool problem may not fire this alert. True pool saturation remains open for a future measured metric and operator-approved threshold.
- There is no API behavior, schema, migration, package, secret, route, browser UI, palette, or breakpoint change. The 40/2m warning is carried forward, not newly justified as an SLO. Rollback is a revert of the rule, verifier, gate, tests, and docs, with alert-series identity reverting as well.

## Verification and execution sequence

1. On approval, re-read this prompt, `AGENTS.md`, the owning docs, relevant files, and every skill below. Record `BASE_SHA`, `HEAD_SHA`, branch, and initial status. Confirm the metric definition and exact baseline rule; reconcile any material drift before editing.
2. Run focused `node --test scripts/ops/verify-alert-rules.spec.js`, `npm run ops:alert-test`, `npm run ops:alert-drill`, and `npm run ops:templates`. Check the negative fixture and seven simulations. Run `npm run ops:capacity-alerting-drill -- --dry-run` only if its checked-in CLI supports that argument, recording generated evidence without staging it. Use local `promtool` for rule syntax if installed; otherwise report it unverified. Do not claim a running Prometheus or real receiver transition was tested.
3. Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`. Inspect the complete diff and quote actual check outputs. Broaden tests only for a concrete remaining risk.
4. Dispatch a Stage 1 reviewer subagent using `requesting-code-review` with the requirements, changed paths, `BASE_SHA`/`HEAD_SHA`, diff, and real checks. Evaluate feedback with `receiving-code-review`, fix verified issues, and re-review if alert contract or operational behavior changes materially. Record implementation and verification in `docs/operations.md`. Stage only approved paths, inspect the staged diff, and commit locally on `main` using `caveman-commit`. Do not push.

## Non-goals

- Adding a purported database pool metric without verifying the installed Prisma/PostgreSQL API or measuring a production baseline; choosing or changing an operator-owned pool threshold.
- Replacing Prometheus, configuring external receivers, modifying PostgreSQL or Prisma pool settings, or treating this as launch approval.
- Changing customer dashboards, API responses, static design, motion, or accessibility behavior.

## SKILLS USED

- `prometheus-configuration` — accurate operational signal, alert identity, and rule validation.
- `javascript-testing-patterns` — focused positive and negative rule-verifier coverage.
- `requesting-code-review` — Stage 1 reviewer dispatch after self-verification.
- `receiving-code-review` — verify and resolve review findings.
- `caveman-commit` — required local commit message during execution.
