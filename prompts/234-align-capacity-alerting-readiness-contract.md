# Phase 12K follow-up — align Category 5 with capacity and alert producers

## Scope and why this is next

Correct the Category 5 capacity/alerting evidence consumer in
`scripts/ops/check-launch-readiness.js` to validate the contracts actually emitted
by the committed producers. Strengthen the evidence checks so success flags alone
cannot override failed measurements, missing required alerts, synthetic production
evidence, or inconsistent target identities. Replace readiness test fixtures that
model nonexistent producer fields.

This is the next dependency-safe repository unit within Phase 12 operations and
launch hardening (`docs/build-plan.md` §13 and §22). Planning baseline: clean
`main` at `65d47e9`. Commit `5be399c` implements invocation-owned dossier assembly;
`d8bca12` implements the bounded DoS contract. The current operations record
explicitly leaves the Category 5 producer/consumer mismatch as future work.
Re-establish the baseline and worktree at execution; prompts do not prove execution.

Verified mismatch:

- `validateCapacityAlertingReport` requires `alerts.ruleCount`, `alerts.rules`,
  `capacity.status: "passed"`, and optionally inspects `capacity.sloTargets`.
- `verify-alert-rules.js` emits `totalRulesCount`, `requiredRulesCount`, `alerts`,
  `checks`, `simulations`, `valid`, and `errors`.
- `verify-capacity-load.js` emits `timestamp`, `mode`, a hashed `targetUrl`,
  `targets`, `distribution`, and `compliance`; it emits no `status` or `sloTargets`.
- The readiness fixture fabricates eleven alerts named `Rule1` through `Rule11`,
  a capacity status, and minimal success-only DoS evidence.
- The dossier assembler already checks actual alert identities, recomputed SLO
  compliance, database telemetry, modes, and nested DoS evidence. Its stronger
  checks do not repair the separate readiness consumer.

Phase 12 remains open. Prompt 201's operator sign-off and all eleven category
decisions remain separate. This task supplies no production approval.

## References read and required execution inspection

Planning read: `AGENTS.md` §§2–10; `docs/build-plan.md` Phase 12, sequence gates,
and Phase 12K records; `docs/skills.md`; the readiness and latest prompt-233
records in `docs/operations.md`; Category 5 and the dossier/operator gates in
`docs/launch-checklist.md`; the readiness/Phase 12J/12K boundary records in
`docs/security.md`; and observability/launch signals in
`docs/system-architecture.md` §11.4.

Code inspected: root `package.json`; Category 5 candidate recognition,
timestamp/report validation and approved-section integration in
`scripts/ops/check-launch-readiness.js`; the Category 5 fixture and tests in
`scripts/ops/check-launch-readiness.spec.js`; `run-capacity-alerting-drill.sh`,
`verify-capacity-load.js`, `verify-alert-rules.js`, `launch-target-evidence.js`,
and `assemble-launch-dossier.js`, all under `scripts/ops/`.

At execution, reread these files and inspect their existing specs before edits.
Open `infra/launch/readiness.example.json` and `readiness.schema.json` to verify
the approved-section keys and schema; open `infra/prometheus/alerts.yml` when
confirming required alert identities. Verify any new Node API from installed
types/documentation or a local executable probe. No web API, Next API, component,
or styling change is authorized. Visual references, pixel measurements and
375/800/1280 breakpoint changes are not applicable.

## Implementation plan

### 1. Accept the real report shape, with explicit validation context

Preserve the existing candidate/path discovery and every-reference-must-pass
behavior, including wildcard matches and rejection of a dossier as the child
report. Keep malformed candidate reports invalid. Custom filenames may qualify
by structure; filenames and success prose are never sufficient.

Replace invented-field requirements with the producer contract. Do not change
producers to emit fictitious compatibility aliases. Do not silently preserve a
legacy acceptance path for old success-only fixtures. These reports must be
regenerated or independently reviewed if they lack the required measurements.

Retain the public `validateCapacityAlertingReport(report, now)` helper call shape
for structural rehearsal validation. An optional, explicit context argument may
carry the approved Category 5 section and require live evidence at the readiness
call site. Without approval context, a fully consistent synthetic report may be
structurally valid; with an approved production section, synthetic/default/missing
mode is a blocker. Document and test the distinction. Do not infer authorization
or production scope merely from `status: "approved"` in a test fixture.

Require an object, `status: "success"`, empty `failures`, all four summary flags
`passed`, a real nonfuture canonical UTC aggregate timestamp, and finite safe
nonnegative integer `durationMs`. The aggregate producer timestamp marks the
start with second precision. Derive its validation interval from that start and
duration, allowing only the existing 999 ms precision loss at the end. Nested
capacity and DoS timestamps must describe that run. Preserve the telemetry
helper's existing 60-second scrape tolerance; do not invent a new retention TTL
or claim elapsed evidence age is equivalent to provenance. Reject impossible
dates, arithmetic overflow, and an interval inconsistent with evaluation time,
accounting only for documented timestamp precision.

Never echo raw report contents or exception messages into blockers. Report safe
category-specific reasons using the existing blocker conventions.

### 2. Validate required alert identities and simulations

Import the real `REQUIRED_ALERTS` from `verify-alert-rules.js`; confirm requiring
the module does not execute the CLI or write files. Require `valid: true`, empty
`errors`, the exact required count, integer total count covering the required
set, and the actual `alerts`, `checks`, and `simulations` arrays.

Every required alert must have exactly one evaluated entry with `valid: true`
and empty errors, and exactly one matching simulation with `passed: true`,
`firesOnBreach: true`, and `clearsOnNormal: true`. `High429Rate` also requires
`ignoresOther4xx: true`. Require nonempty passing checks. Reject duplicates,
missing names, fabricated replacement names, contradictory counts, and any
failed evaluated rule/check/simulation. Permit additional rules only when the
real producer can emit them and all reported evaluations remain valid; count
consistency must follow the actual producer's handling of missing rules.

Simulation evidence proves static expression behavior. It does not prove live
Prometheus firing, receiver routing or human receipt. Preserve the existing
operator recipient/runbook/threshold declarations and delivery requirements.

### 3. Recompute SLO acceptance from measured distributions

Use exported `DEFAULT_SLO_TARGETS` and `evaluateSloCompliance` from
`verify-capacity-load.js`. Validate input numbers before invoking the evaluator,
which is not a complete hostile-input schema validator.

Require `capacity.targets`, `capacity.distribution`, and `capacity.compliance`.
Targets must be finite positive numbers meeting the existing floor/ceilings:
availability 99.9–100%, HTTP p95 ceiling at most 500 ms, throughput target at
least 100 RPS, acquisition p95 ceiling at most 50 ms and query p95 ceiling at
most 100 ms. For approved-section context also evaluate against that section's
specific, possibly stricter targets. A default 500 ms child cannot prove a
declared 100 ms policy merely because its own compliance flags say passed.

Require positive integer request totals, consistent successful/failed totals,
finite availability in 0–100, positive throughput, finite nonnegative latency
statistics and monotonic percentiles. Honor the producer's documented rounding
when checking derived availability; do not apply exact unrounded equality to a
three-decimal producer value. Check all eight individual boolean compliance fields plus `overallPassed`,
including `monotonicLatency`, against recomputed acceptance; require empty
violations. Contradictory declared/computed verdicts fail.

Synthetic capacity must include complete acquisition/query latency distributions.
Live HTTP benchmarks legitimately omit them: the separate bound live database
baseline supplies database acceptance. If database distributions are included,
validate them completely and reject breaches or malformed values. Never create
synthetic database distributions to fill a live report's gap.

### 4. Preserve live target, telemetry and DoS integrity

Recognize only aggregate `synthetic` and `live` for successful reports. Synthetic
capacity uses `mode: "synthetic"`, the producer's synthetic target marker, null
aggregate target hashes, synthetic baseline source, and a fully valid simulated
DoS receipt. It may validate as rehearsal, but cannot clear approved Category 5.

Live evidence requires `mode: "live"` throughout the relevant children, properly
formed SHA-256 aggregate benchmark/API target hashes, equality between benchmark
hash and `capacity.targetUrl`, and `prometheus-live-scrape` telemetry bound to the
benchmark hash. Use `validDatabaseTelemetry` for health, pool consistency,
nonnegative/monotonic statistics and baseline thresholds. Also check acquisition
and query p95 values against approved-section ceilings when supplied.

Use `validDosEvidence` to validate the entire DoS child receipt and bounded live
burst, not just `dosResilience.status`. Preserve the existing five repository
layer assertions and all burst/counter/health/CSRF checks. Execution review proved
that URL `href` adds a trailing slash while `origin` does not, so their hashes
are unequal even for root API URLs. On 2026-09-30 the user explicitly approved
the narrow producer correction: change only the aggregate `apiTargetId` input
in `run-capacity-alerting-drill.sh` from `new URL(apiUrl).href` to `.origin`,
matching the existing DoS child contract. Benchmark hashing stays `href`.
The existing capacity-specific comparison in `assemble-launch-dossier.js` must
use the same API `origin` hash; update that dependent comparison and the capacity
fixture in `run-launch-drills.spec.js` as part of the approved correction. Other
dossier/deployment URL identity contracts stay unchanged.
Add an actual-parent hermetic live-shaped regression with stubbed benchmark/DoS
children and fresh fixture telemetry, proving helper acceptance and equal API
hashes for normalized root URLs. Retained live reports using the old aggregate
API hash require regeneration; do not accept an unbound legacy identity.

Rehearsal validation may adapt synthetic baseline metadata locally to the existing
numeric telemetry checker as the assembler does, provided source/mode remain
explicitly synthetic and this never alters the report or passes production
approval. Reject malformed numbers, negative latencies, unhealthy exporter,
database down, impossible pool counts, waiting requests and lock waits.

Keep filesystem receipt ownership/freshness checks in the dossier assembler.
The readiness validator consumes retained evidence later and must not require
the current review time to be the original child execution interval. Internal
matching hashes and dates provide consistency, not independent authentication
of production scope. Operator inspection of target, monitoring and delivery
sources remains required; do not add a new target/schema/provider decision here.

Keep this change confined to the readiness consumer, its tests, and the explicitly
approved aggregate API hash correction plus parent regression. Reuse exported
producer/helper APIs rather than importing the assembler as a validation library.
No general shared-validator extraction or runner redesign is needed in this unit.

### 5. Replace invented fixtures and add behavioral regression coverage

Update the baseline approved-record fixture to contain a complete live-shaped
report with stable test-only hashes, interval-consistent timestamps, genuine
required alert names, measured distributions and full telemetry/DoS receipts.
Clearly label these as fixtures; create no production-looking tracked evidence.
Use real pure producer functions to build distributions/compliance and alert
evaluations where practical. Do not invoke a live benchmark or unstubbed child.

Add a regression using actual offline aggregate output from the real capacity
parent in a disposable repository/process fixture with the DoS child stubbed and
inherited service credentials scrubbed. Reuse the isolation pattern in
`run-capacity-alerting-drill.spec.js`; copy real pure producer/helper code and
static alert inputs as needed. Verify helper structural acceptance, then verify
the same synthetic report blocks an approved readiness section. Also accept a
producer-shaped live fixture without adding `ruleCount`, `rules`, `capacity.status`
or `sloTargets`. Tests must clean only their own temporary roots.

Cover null/array/missing fields; failed summary/status; malformed and future dates;
negative/nonfinite/overflow duration; nested dates outside the run; incorrect
counts and duplicate/missing named alerts; failed checks/simulations; wrong 429
semantics; numeric strings/null/negative numbers; availability above 100;
inconsistent request totals; latency percentile inversions; measurements breaching
targets beside forged true compliance flags; missing synthetic DB distributions;
valid live HTTP distribution without DB statistics; stricter section ceilings
and availability/throughput policies; target/hash mismatches; telemetry source and
health failures; complete live/simulated DoS mode/counter contradictions; custom
filenames; and a bad wildcard child beside a good one.

Preserve the other ten category tests and placeholder/signature/release gates.
Do not weaken broad approved-record fixtures simply to make the suite pass.

## File scope, impact, non-goals and rollback

Expected edits: `scripts/ops/check-launch-readiness.js`, its existing spec,
`docs/operations.md`, `docs/launch-checklist.md`, and a short Phase 12K evidence
record in `docs/build-plan.md`, plus the approved one-line producer correction
and `scripts/ops/run-capacity-alerting-drill.spec.js` regression, plus the dependent
capacity-specific comparison in `scripts/ops/assemble-launch-dossier.js` and its
fixture in `scripts/ops/run-launch-drills.spec.js`. Correct narrow evidence-integrity claims in
`docs/security.md` if necessary. No new documentation index row is needed.

No route/UI change, schema or migration, telemetry collector, alert expression,
Compose configuration, CI workflow, dependency update, secret rotation, live
benchmark, alert injection, traffic burst, deployment, database or storage
operation is authorized. Producer fields and publication behavior stay unchanged
except for the explicitly approved aggregate API hash input correction.
Existing success-only/fictional reports fail validation and require regeneration;
document this compatibility impact. Other readiness categories retain their gates.
Rollback is reverting this commit; no product data or persistent infrastructure
state changes. Preserve retained reports referenced by operator records.

This focused Phase 12 subset does not trigger Nest/React/browser, PostgreSQL SQL,
Grafana, GitHub Actions, secrets-provider or SAST-rule implementation skills.
There is no Bash CLI or standalone Node CLI-specific security reference in the
loaded security skill; repository contracts and behavioral tests settle that
surface. No new full threat-model report or architecture decision is requested.

## Verification and completion

1. Inspect locally available formatting tooling and format the changed JS/Markdown
   consistently. Check it without installing packages; quote actual output.
2. Run `npm run ops:readiness-test`, `npm run ops:readiness-schema-test`,
   `npm run ops:capacity-test`, `npm run ops:alert-test`,
   `npm run ops:dos-test`, `npm run ops:capacity-alerting-test`, and
   `npm run ops:launch-drill-test`. Run any newly isolated regression through the
   existing readiness command. These are hermetic tests, not live acceptance.
3. Run `npm run ops:templates`, `npm run ops:check`, `npm run lint`,
   `npm run typecheck`, `npm run build`, and `git diff --check`. Quote real
   exit/results; fix discovered issues. The aggregate operations gate contacts
   npm through its audit; follow current permissions and disclose any blocked
   check without bypassing it or claiming older results as current evidence.
4. Run `node scripts/ops/check-launch-readiness.js
infra/launch/readiness.example.json`. It must still reject launch; report its
   actual approved/blocked category and blocker counts. Do not edit the example
   to manufacture acceptance. Readiness fixture acceptance is not operator approval.
5. Inspect the complete diff. Dispatch an independent read-only reviewer subagent
   under `requesting-code-review`, supplying this prompt, baseline/HEAD SHAs,
   working-tree diff, changed paths and real check outputs. Evaluate claims with
   `receiving-code-review`, fix verified issues, rerun affected checks, and obtain
   follow-up review for significant changes. This review delegation is required
   at execution; no implementation/reviewer is dispatched during prompt preparation.
6. Record the actual contract, checks, compatibility impact, offline/live
   distinction and unresolved operator gates in the owning docs. Replace the
   prompt-233 future-work note with a dated resolution linking this scope; retain
   historical records as history. Update Category 5's current contract prose to
   remove fictitious producer fields. Commit approved work and this prompt locally
   to `main` using `caveman-commit`, with no push. Give safe inspection commands:
   `npm run ops:readiness-test` and `npm run ops:capacity-alerting-test`.

## SKILLS USED

- `deployment-pipeline-design` — preserve fail-closed launch evidence gates and separate operator decisions.
- `error-handling-patterns` — reject malformed, contradictory and failed child evidence with safe blockers.
- `javascript-testing-patterns` — producer-shaped fixtures, pure validation and hermetic process regressions.
- `prometheus-configuration` — preserve named alert and simulation semantics and the distinction from live routing.
- `security-best-practices` — secure JavaScript evidence validation; no matching standalone CLI-specific reference is provided.
- `security-threat-model` — consult existing evidence-integrity threats and document narrow boundary limitations.
- `requesting-code-review` — dispatch the required independent read-only implementation reviewer.
- `receiving-code-review` — verify feedback before fixes and revalidation.
- `caveman-commit` — write the mandatory local implementation commit message.
