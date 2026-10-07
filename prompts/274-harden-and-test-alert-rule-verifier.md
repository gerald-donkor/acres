# Phase 12K — Harden and test alert-rule verifier invocation and failure contracts

## Scope and why this is next

This is a dependency-safe step within `docs/build-plan.md` Phase 12, following
committed capacity evaluator hardening. Planning baseline is clean `main` at
`b6347b5aafab173c48a29b7a257aa4a51038c4c4`
(`fix(ops): harden capacity report publication`). Re-establish execution state
from code and git history; a prompt file is not proof of implementation.

The hardened capacity parent still invokes `scripts/ops/verify-alert-rules.js`
with `--json --alerts-file <target> --prom-file <target>`. This child silently
ignores unknown arguments, lacks help and attached-value handling, and exits
immediately after writing JSON. Malformed YAML shapes can throw at `.some`,
`.includes`, or human-output formatting. Missing API scrape configuration adds
a failed check without adding an error, so `valid` can incorrectly stay true.
Repeated alert identities are overwritten by the rule Map. Missing-file and
parser diagnostics expose paths, YAML snippets or raw exception messages.
Existing 23 tests cover ordinary rule mutations and simulations, not actual CLI
failure/diagnostic contracts.

Harden invocation, defensive YAML evaluation, report consistency and controlled
output. Preserve all eleven required alert identities, existing thresholds,
synthetic evaluators, successful report fields and parent check identities.
This verifier does not save reports: add no report publication or `--output`
feature. Its simulations remain fixed JavaScript predicates, not execution of
the YAML PromQL or observation of Prometheus/Alertmanager. Category 5, prompt
201, dependency findings and production launch sign-offs remain unresolved.

Approval authorizes repository changes, hermetic tests and the checks below.
No live load, DoS, Prometheus query, notification, unified drill, production
evidence inspection, deployment, credential change, dependency upgrade or push
is authorized by this prompt.

## References read and execution prerequisites

- `AGENTS.md`: phase control, prompt contract, checks, review and local commit.
- `docs/build-plan.md`: phase protocol, Phase 12, sequence gates, committed
  prompt 270 parent hardening and prompt 273 child hardening.
- `docs/operations.md`: Phase 12J alert simulation, parent contract and current
  prompt 273 execution limits.
- `docs/launch-checklist.md`: Category 5 simulation/live separation and operator
  launch governance. Re-read Category 5 and unified-run instructions at execution.
- `docs/system-architecture.md` §11 and `docs/security.md` §21: redaction,
  operational evidence boundaries and remaining production acceptance.
- `docs/skills.md`: skill paths and loading policy.
- `scripts/ops/verify-alert-rules.js` and its complete spec.
- `infra/prometheus/alerts.yml` and `infra/prometheus/prometheus.yml`: current
  eleven-rule and scrape definitions; these are read-only references here.
- `scripts/ops/run-capacity-alerting-drill.sh`: actual invocation and exact
  successful child check-count/field requirements; its spec and isolated fixtures.
- `scripts/ops/check-launch-readiness.js`: `validateCapacityAlertingReport`;
  `scripts/ops/assemble-launch-dossier.js`: imported required-rule identities.
- `package.json`: existing `ops:alert-test`, related regression suites and gates.
- Installed `node_modules/js-yaml/package.json` and `README.md`: resolved
  4.3.1, `load`, schema behavior, duplicate keys, `maxDepth` and merge limits.
- Installed `node_modules/@types/node/process.d.ts`: `exitCode`, natural output
  draining, and the documented truncation risk of immediate `process.exit`.

Read complete relevant functions/specs again before editing. Verify changed
Node file/stream/test APIs from installed declarations/sources or official docs.
No dedicated standalone Node CLI security reference is installed in
`security-best-practices`; use its general discipline and verified local APIs.
No Next/React/Tailwind change, comp measurement, crop, or breakpoint behavior is
involved. No visual reference is needed for this CLI-only step.

## Expected impact and allowed files

Primary changes:

- `scripts/ops/verify-alert-rules.js`.
- `scripts/ops/verify-alert-rules.spec.js`.

Narrow integration coverage, only if needed:

- `scripts/ops/run-capacity-alerting-drill.spec.js`: actual installed alert child
  acceptance and malformed-child rejection in the existing isolated dry parent.
- `scripts/ops/check-launch-readiness.spec.js` or
  `scripts/ops/assemble-launch-dossier.spec.js`: producer compatibility or fixture
  dependency-closure adjustments without weakening validation.

Documentation after verification/review:

- `docs/operations.md`: final input/report/diagnostic contracts, actual checks,
  engineering limits and synthetic verification limitations.
- `docs/launch-checklist.md`: safe standalone inspection instructions and exact
  distinction between these simulations and live alert delivery, where relevant.
- `docs/build-plan.md`: concise committed Phase 12 verification record.
- This prompt in the eventual implementation commit.

No route, persisted schema, runtime telemetry, alert policy, Compose, Grafana,
CI, production consumer implementation, package script or dependency change.
`ops:alert-test` and its inclusion in `ops:check` already exist. Keep this a
bounded child correction, without a shared CLI framework or publication engine.

## Implementation requirements

### 1. Strict invocation before any source reads

Keep `--json`, `--alerts-file` and `--prom-file`; add standalone `--help`/`-h`.
Value flags support separate and `--name=value` forms. Reject unknown options,
positionals, duplicate flags, missing/empty/blank/control-containing values,
attached values on switches and options conflicting with standalone help.
Separate values must not accidentally consume another option. Quoted/spaced
paths remain literal; attached dash-leading paths are literal data. Never echo
rejected values or shell-expand paths. No implicit support for `--output`,
`--no-save`, live URLs or arbitrary environment option overrides.

Default files remain anchored to the installed repository, independent of cwd.
Explicit relative source paths resolve against caller cwd. Help and import do
no YAML reads, evaluation, filesystem writes, network or process launches.
Parse all CLI syntax before calling the verifier. Validate direct options too:
only an options record and valid optional source strings; do not allow falsey
invalid values to silently select defaults. Preserve the existing no-argument
and valid `verifyAlertRules({ alertsPath, promConfigPath })` API.

### 2. Defensive source loading and finite shape evaluation

Use controlled source failures rather than `existsSync` followed by unchecked
operations. Reject missing, unreadable, directory and non-regular sources before
parsing. A read-only symlink resolving to a regular source may remain supported;
do not borrow output-path restrictions from the capacity publisher. Avoid
opening/blocking on FIFOs or devices. Bound each source read to 1 MiB, including
growth after size inspection, and close owned descriptors on success/failure.
This is an engineering resource limit, not a measured production requirement;
confirm the checked-in sources fit and record the limit. Use installed YAML
nesting/merge limits, without disabling duplicate-key errors or introducing
custom executable types. Do not recursively walk arbitrary alias graphs.

Validate YAML roots and the collections actually traversed before access:
groups, group records, rules arrays, rule records, `rule_files`, scrape arrays
and scrape records. Nulls, scalars, dates, nested wrong types and malformed
required fields produce bounded safe failures, never unchecked coercions or
exceptions. Keep supported recording rules and extra ordinary alert rules;
`totalRulesCount` still counts supplied rules. Extra rules are not claimed to
have undergone full semantic validation. Reject duplicate required alert
identities across/within groups instead of accepting the Map's last value.

Validate required expression/duration/severity/annotations as strings before
`.includes`, normalization, selector matching or formatting. Preserve current
specific expression/job/duration/severity checks; do not change thresholds or
silently substitute canonical expressions for supplied ones. Missing API scrape
must set `valid: false` as missing worker scrape does. Required scrape matches
must be actual records with the expected job and `/metrics` path. Keep the
existing limited `rule_files` presence check; mounted-path resolution and full
PromQL parsing are separate work. Avoid claiming these checks prove PromQL
grammar, evaluation-window timing, rule execution or notification delivery.

### 3. Consistent, safe reports and exits

Successful output preserves `valid`, `errors`, `checks`, `alerts`,
`simulations`, `totalRulesCount`, `requiredRulesCount`, all eleven simulations
and the exact 25 successful checks (three Prometheus checks and two per required
alert). Do not add success checks that break the parent's exact-count contract.
Required-alert evaluation and simulation order remains `REQUIRED_ALERTS` order.
Keep public exports, especially `REQUIRED_ALERTS`, `SIMULATION_DEFINITIONS`,
`KNOWN_METRIC_IDENTIFIERS`, `isValidDuration` and `verifyAlertRules`.

Malformed-source/evaluated failures return a coherent `valid: false` report,
safe errors and applicable checks with consistent counts; a failed check cannot
coexist with `valid: true`. Source loading failure need not fabricate evaluations
or simulations. Never fabricate success fields to satisfy a consumer.

Diagnostics use fixed messages or fixed required-alert/check identities. Never
include source paths, raw YAML parser exceptions/snippets, invalid expressions,
durations/severities, arbitrary source object formatting, credentials or stack
traces. Replace existing tests tied to echoing invalid values with assertions
about fixed failure categories. On invalid rule evaluations omit or safely
neutralize unvalidated source fields instead of reflecting them in the returned
report or human output. Valid rules may retain validated textual fields for
compatibility; do not claim the tool can detect secrets intentionally put into
otherwise valid annotations or expressions. Unknown YAML keys are never projected.

JSON mode emits exactly one complete report for completed verification, exits
0 only for a valid result, and exits nonzero for an evaluated failure. Invalid
invocation and unexpected internal/serialization/output failures produce a
controlled nonzero status and safe stderr diagnostic, with no success-shaped
fallback report. Human mode uses checked fields and fixed headings, without
printing private source paths. Help exits 0 without evaluation. Allow stdout to
drain rather than immediately exiting; handle synchronous and stream output
failure safely, including a broken pipe, without raw uncaught stack output.
Keep no artifact allocation or saving behavior.

### 4. Hermetic behavioral tests and parent compatibility

Use existing `node:test`, no new framework. Retain threshold, metric-selector,
duration, severity and non-429-4xx regressions. Use disposable source/install
fixtures, `process.execPath`, bounded process timeouts and allowlisted child
environments without inherited credentials, proxies, NODE_OPTIONS, BASH_ENV or
ENV. Resolve the installed `js-yaml` dependency explicitly in copied fixture
closures. Restore mocks and clean owned resources even when assertions fail.
No DNS/socket traffic, live local servers, promtool download or Docker startup.

Cover observable contracts:

- Import/help do zero evaluation/read/write; default sources remain installation
  anchored when caller cwd changes; custom relative and spaced paths work.
- Separate/attached values; malformed, duplicate, unknown and conflicting flags;
  direct-option invalid values cannot silently fall back or begin source work.
- Actual valid JSON is complete, exits 0 and satisfies unchanged consumer fields.
- Missing, malformed, multi-document and duplicate-key YAML; null/scalar roots;
  wrong/null groups/rules/scrapes; non-string expr/duration/annotations; duplicate
  required names; missing API and worker scrape; missing/empty `rule_files`.
- Retained valid extra/recording rules and order/count semantics.
- Oversized and growing source, regular-source/symlink behavior, injected
  open/read/close/parse exceptions and directory/FIFO/device rejection without
  blocking. Exercise installed YAML depth/merge rejection with finite fixtures.
- Secret canaries in private paths, parser error snippets and invalid fields
  never occur in result/human/JSON/stderr diagnostics; unknown keys are excluded.
- Expected failures exit nonzero with parseable failing JSON; unexpected
  serialization/output faults cannot imply success. Actual bounded child/pipe
  coverage establishes output completion and safe broken-pipe behavior.
- Actual alert producer passes through isolated dry capacity parent with stubbed
  capacity/DoS children; a malformed alert source causes child nonzero and parent
  failure. Parent success remains simulation and cannot approve Category 5.

Use injected errors when user permissions cannot reliably deny access. Prefer
deterministic hooks and controlled fixtures over sleeps or privileged actions.

## SKILLS USED

- `prometheus-configuration`: Preserve rule identities, selector meanings and
  the boundary between static heuristics/synthetic predicates and live alerts.
- `deployment-pipeline-design`: Preserve child/gate contracts and operator
  launch decisions.
- `secrets-management`: Safe diagnostics and credential-free fixture execution.
- `security-best-practices`: Secure-default local CLI/source validation; no
  matching standalone Node CLI reference is installed.
- `error-handling-patterns`: Early rejection, coherent failed reports, controlled
  exits and descriptor/output failure handling.
- `javascript-testing-patterns`: Existing Node behavioral tests and failure
  injection, without introducing another test framework.
- `e2e-testing-patterns`: Deterministic isolated actual-child/parent integration
  and resource teardown; no browser journey is introduced.
- `requesting-code-review`: Mandated independent reviewer after self-checks.
- `receiving-code-review`: Verify findings, fix valid defects and re-review
  significant compatibility or failure-contract changes.
- `caveman-commit`: Required local Conventional Commit, no push.

No runtime topology, Nest, SQL, HTTP API, CI, SAST scanner, Grafana, threat-model
topology or UI change is included. Those broader Phase 12 skills are not
triggered; reassess if execution would need to cross such a surface.

## Verification, review, documentation and completion

Re-read approved prompt and every named skill before implementation. Record
BASE_SHA and preserve unrelated work. Verify fixtures are isolated before tests.
Run from repository root:

```bash
node --check scripts/ops/verify-alert-rules.js
node --check scripts/ops/verify-alert-rules.spec.js
node scripts/ops/verify-alert-rules.js --help
npm run ops:alert-test
npm run ops:capacity-alerting-test
npm run ops:capacity-test
npm run ops:dos-test
npm run ops:launch-drill-test
npm run ops:readiness-test
npm run ops:launch-readiness-test
npm run ops:templates-test
npm run ops:templates
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Run typecheck/build sequentially. Use installed Prettier on changed JS and this
prompt; format new documentation regions without unrelated historical rewrites.
Quote actual output/exits. Do not run capacity/DoS/unified drills outside owned
isolated fixtures. The standalone alert verifier may read the checked-in source
only; no production materialized inputs or live notification checks.

Prompt 273 recorded `ops:check` failing at production audit with
`37 vulnerabilities (9 moderate, 26 high, 2 critical)`. This is historical
context, not a current result. Run and report the current gate truthfully;
distinguish unreached aggregate stages, run affected isolated suites separately,
and do not weaken audit or incidentally upgrade dependencies. Distinguish
sandbox subprocess denials from implementation failures and follow environment
approval policy for necessary hermetic checks.

Inspect complete diff after self-verification. Dispatch mandated read-only
reviewer subagent using the loaded review template, approved requirements,
BASE_SHA/HEAD_SHA, actual uncommitted diff, check output and no-network boundary.
Reviewer must not mutate or delegate. Verify feedback against code, fix valid
issues, rerun affected checks and obtain follow-up review for significant
changes. Then record final behavior, safe inspection and actual check evidence
in owning docs; preserve historical records and unresolved operator decisions.

Stage only approved files, inspect staged diff and commit locally to `main`
using `caveman-commit`, including this prompt. No push. Return commit, checks,
remaining limits and safe inspection commands:

```bash
node scripts/ops/verify-alert-rules.js --help
npm run ops:alert-test
node scripts/ops/verify-alert-rules.js --json
```

Rollback is a reviewed normal revert. It restores the old permissive parsing,
raw diagnostics and malformed-source failures; it does not establish live
Prometheus behavior or resolve production launch approval.
