# 209 — production SLO, alerting, and capacity evidence

## Scope and why this is next

The committed baseline is `ff72920` on `main`. Phase 12K remains open under
`docs/build-plan.md` §13/§22 and the umbrella sign-off in prompt 201.
Prompts 205–208 assessed checklist Categories 1–4 and recorded unresolved
operator evidence without approving them. The earliest remaining independent
checklist unit is Category 5, `slo_and_alerting`. Inspect the selected
production target, real capacity and database telemetry, eleven alert rules,
delivery routing, and the SRE lead's decision. Record an exact unresolved
blocker if operator material is unavailable. Approve Category 5 only after
independent live-source inspection and dated sign-off. This does not approve
other categories or complete Phase 12.

## References and verified contract

- Re-read `AGENTS.md` §§2–7 and 10, `docs/build-plan.md` §13/§22,
  `docs/launch-checklist.md` §§2–5, 6A and 7, `docs/operations.md` Phase 12J/K
  and Prompts 178–194, `docs/security.md` TM-20 and Phase 12J,
  `docs/system-architecture.md` production topology, `docs/skills.md`, and
  prompts 194, 201–203 and 205–208. Reconcile prose with current code and
  Git history before executing.
- Inspect `infra/launch/readiness.example.json`,
  `infra/launch/readiness.schema.json`,
  `scripts/ops/check-launch-readiness.js` and focused tests,
  `scripts/ops/run-capacity-alerting-drill.sh`,
  `scripts/ops/verify-capacity-load.js`,
  `scripts/ops/verify-alert-rules.js`,
  `scripts/ops/run-dos-resilience-drill.sh`,
  `scripts/ops/launch-target-evidence.js`,
  `scripts/ops/run-launch-drills.sh`, `infra/prometheus/alerts.yml`,
  the Prometheus scrape and Alertmanager configuration, and
  `infra/grafana/dashboards/acres-operations.json`. Inspect the actual
  operator-provided target and telemetry sources separately. Resolve CLI
  behavior and report fields from the files at execution.
- No visual route, static design reference, crop, pixel measurement, or
  breakpoint applies. The measured contract is an operator-adopted availability
  target from 99.9% through 100%, HTTP p95 ceiling >0 and ≤500 ms, capacity
  target ≥100 RPS, PostgreSQL pool acquisition p95 ceiling >0 and ≤50 ms,
  SQL query execution p95 ceiling >0 and ≤100 ms, at least one real alert
  recipient, confirmed thresholds, an escalation runbook, eleven validated
  alert rules, and a signed SRE decision. These are gates, not claims that
  production currently meets them.
- An approved readiness section needs a referenced capacity-alerting child
  JSON report with real nonfuture UTC `timestamp`, `status: "success"`, empty
  `failures`, all four `summary` flags `"passed"`, `alerts.valid: true`,
  integer `ruleCount >= 11`, at least eleven rules and simulations with every
  simulation passing, `capacity.status: "passed"`, and all eight capacity
  compliance booleans true. It also needs
  `databaseTelemetryBaseline.status: "verified"`, exporter `up: 1`, last
  scrape error 0, server `pgUp: 1`, zero API/worker requests waiting, API and
  worker acquisition p95 ≤50 ms, API and worker query p95 ≤100 ms, zero lock
  waits, and `dosResilience.status: "success"`. Every referenced child,
  including wildcard matches, must pass. The validator checks report
  consistency; it does not authenticate the live source or alert delivery.

## Preconditions and operator handoff

1. Verify branch, HEAD, and worktree; preserve unrelated changes. Confirm the
   checked-in readiness example is unresolved. Search only relevant approved
   repository paths for a materialized production readiness record or redacted
   Category 5 evidence reference. Absence from Git does not prove absence from
   the operator's restricted store.
2. Obtain through the approved operator channel the designated production
   benchmark URL and API origin, environment and change window, SRE lead,
   on-call recipient and escalation owner, approved SLO values, restricted
   evidence-store location, and controlled read-only access to live Prometheus,
   Grafana, Alertmanager and benchmark records. Request opaque identifiers and
   redacted extracts. Do not place private hosts, recipient addresses, tokens,
   raw inventories or sensitive metric labels in Git or chat.
3. Inspect the operational target definitions and selected time window.
   Establish whether the Prometheus exporter, PostgreSQL server, API and worker
   scrapes are healthy and belong to the same target. Confirm the on-call route
   and runbook are active. A dashboard screenshot, generated fixture or
   simulation alone cannot establish scrape health, delivery or capacity.
4. Any live load, DoS exercise, alert injection or test page needs separate
   authorization specifying target, traffic/alert profile, ceilings, operator,
   maintenance window, abort criteria and observer. Approval of this prompt
   authorizes only read-only intake and repository checks. If authority or
   target evidence is missing, record the exact Category 5 blocker and owner;
   do not run a default or synthetic drill and label it production proof.

## Evidence and decision procedure

1. Read the signed SLO policy and compare its values to the readiness fields.
   Confirm the denominator, request class, percentile window, concurrency,
   duration and workload for the HTTP benchmark. Verify ≥99.9% availability,
   ≤500 ms p95, and ≥100 RPS using independently observed request counts and
   timings. Treat a benchmark against a test URL or a low-volume synthetic
   series as test evidence, not a production SLO decision.
2. Inspect live Prometheus target status and timestamped samples for
   `up{job="acres-postgres"}`, `pg_up{job="acres-postgres"}` and
   `pg_exporter_last_scrape_error{job="acres-postgres"}`. Inspect API and worker
   pool occupancy/waiting, acquisition p50/p95/p99, query p50/p95/p99, lock
   waits and oldest transaction age. Confirm source, units, scrape freshness,
   target ID and monotonic percentile order. Distinguish exporter-down from
   database/authentication failure. Use the read-only contention diagnosis in
   `docs/launch-checklist.md` §5 for abnormal lock or transaction signals.
3. Verify all eleven rule expressions, thresholds, durations and runbook
   mappings against the materialized Prometheus rules, and inspect actual
   Alertmanager routing to the on-call team. Obtain dated delivery/receipt
   evidence for the chosen alert route and separately observe exporter-down
   and database-down/authentication-failure exercises if authorized. The
   repository rule verifier's breach/clear simulations do not prove live
   firing, notification delivery, or human acknowledgment.
4. When separately authorized, run the targeted live drill with the approved
   `--target-url`, `--api-url`, `--database-telemetry-file` and a restricted
   `--evidence-dir` or `--evidence-file`; first verify exact flags and freshness
   semantics in the scripts. The telemetry file must be a fresh, target-bound
   Prometheus extract, not the runner's synthetic baseline. Inspect the
   benchmark, DoS, alerts and database child data and their raw source links.
   If a previously performed operator drill is supplied, inspect it read-only
   instead of rerunning traffic. Do not equate a `mode: "default"` or
   `mode: "synthetic"` success with a live target result.
5. Prepare or inspect an operator-owned readiness record from the schema,
   preserving all eleven sections and release fields. Set only
   `slo_and_alerting.status` to `approved` after independent source review and
   a dated SRE-lead Category 5 signature. Populate the five numeric targets,
   real alert recipient reference(s), `alert_thresholds_defined`, escalation
   runbook, approver and child evidence from verified facts. Preserve all other
   category states; never turn the checked-in example into an attestation.
6. Run `npm run ops:readiness-schema-test` and
   `node scripts/ops/check-launch-readiness.js <operator-readiness.json>`.
   The whole-record validator can correctly exit nonzero while other
   categories remain unresolved; inspect Category 5 blockers separately.
   Compare any green Category 5 result with the actual Prometheus samples,
   benchmark, alert delivery and human signature. Keep raw evidence and the
   signed record in the restricted operator store. Commit only approved,
   redacted references.
7. Record the dated decision, reviewed source commit, safe evidence IDs,
   checks actually run, missing facts and owner in `docs/launch-checklist.md`.
   Correct `docs/operations.md` or `docs/build-plan.md` only for verified
   implementation facts. Prompt 201 governs final eleven-category sign-off.

## Scope boundaries, failure handling, and rollback

- No product code, API, schema, UI, migration, dependency, alert threshold,
  scrape configuration, dashboard, on-call route, CI, deployment or production
  change is planned. A discovered defect gets its own prompt and applicable
  skill pass. No automatic traffic or page is sent under generic approval.
- If target access, fresh telemetry, workload definition, alert delivery,
  approved SLO policy or SRE signature is absent, keep Category 5
  `unresolved` and state the precise gap. Reject malformed, future-dated,
  mixed failed, stale, synthetic or target-mismatched evidence even if a
  consistency validator reports green.
- On a live drill breach or operational degradation, stop according to the
  authorized abort criteria, preserve the evidence, and use the named incident
  authority and runbook. This prompt does not authorize changing thresholds,
  alert routing, service capacity or production traffic controls. Revert only
  an inaccurate scoped documentation edit; preserve the operator audit trail.

## Verification, review, and completion

1. Quote real output and exit codes for `npm run ops:readiness-schema-test`,
   `node scripts/ops/check-launch-readiness.js
   infra/launch/readiness.example.json` (expected fail-closed), any authorized
   operator-record validation, `npm run ops:templates`, `npm run ops:check`,
   `npm run lint`, `npm run typecheck`, `npm run build`, and
   `git diff --check`. Use `npm run ops:alert-test` and
   `npm run ops:capacity-test` when a focused repository risk remains. Do not
   label an unavailable or failed check as passing. Review full and staged
   diffs for private target IDs, recipient data and out-of-scope changes.
2. Dispatch a read-only reviewer subagent using `requesting-code-review` with
   requirements, base/head SHAs, changed paths, check results, and the
   distinction between rule simulation, live observation and operator
   sign-off. Evaluate findings with `receiving-code-review`, verify claims
   against code/evidence, fix valid issues, rerun affected checks and re-review
   material changes.
3. Stage only approved prompt/documentation changes and any explicitly
   authorized redacted record. Commit to local `main` with a
   `caveman-commit` message; do not push. Report the actual Category 5 state,
   remaining Phase 12 gates and public readiness command without disclosing
   restricted evidence locations or contents.

## SKILLS USED

- `prometheus-configuration` — inspect scrape health, rules and live metric evidence.
- `grafana-dashboards` — correlate operational panels with the underlying series.
- `deployment-pipeline-design` — preserve approval and abort gates for live drills.
- `requesting-code-review` — independent review of the scoped evidence record.
- `receiving-code-review` — validate feedback before corrections.
- `caveman-commit` — write the final local commit message.
