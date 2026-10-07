# Phase 12K — Harden and test the capacity and alerting drill runner

## Scope and why this is next

This is the next dependency-safe unit of `docs/build-plan.md` Phase 12.
Planning HEAD is `9cec4aa16c5b612137aff1003b5da24a3cf4d34e`
(`fix(ops): harden dos resilience drill`), on clean `main`. The committed
DoS child now validates invocation/output, uses private resources and publishes
complete evidence exclusively. Re-resolve this state from code and git on
execution. Prompt files alone do not establish implementation.

Harden its parent, `scripts/ops/run-capacity-alerting-drill.sh`. Actual gaps:

- Value options silently accept duplicates, support only separate values and
  inconsistently guard missing values. There is no target-cwd option.
- Output directories are created before evaluated work; an explicit file still
  creates the unused evidence directory. Second-resolution default names collide.
- Final JSON is written directly to the destination, replacing existing evidence.
- Alert/capacity JSON is copied without complete validation; their stderr can
  expose arbitrary errors. Success-shaped JSON can disagree with exit status.
- Capacity evaluation saves an extra benchmark report at its installation-root
  default, outside the selected parent destination.
- Only the DoS temporary directory has explicit cleanup. Fixtures inherit most
  of the ambient environment and reuse receipt destinations between runs.

Implement strict input validation, installation-anchored children against an
explicit target cwd, bounded/private child evidence handling, truthful verdicts,
exclusive complete receipt publication and isolated process tests. Preserve
Category 5/readiness and launch-dossier contracts. Phase 12/operator evidence
and sign-off remain open. Approval authorizes repository changes and stubbed
tests; it does not authorize a live benchmark, service probe or launch approval.

## References read and execution prerequisites

- `AGENTS.md`: phase-control, prompt contract, verification, review and commits.
- `docs/build-plan.md`: Phase 12, sequence gates and committed prompts 267–269.
- `docs/operations.md`: Phase 12J; prompts 232, 245, 249 and 269, including
  current child freshness, origin hashing and simulation/live qualifications.
- `docs/launch-checklist.md`: Category 5, prompt 245 and operator gap register.
- `docs/system-architecture.md`: binding principles and §11 operations,
  redaction, health and launch signals.
- `docs/security.md`: TM-05/TM-16/TM-20 and Phase 12J limitations.
- `docs/skills.md`: local paths, surface-based triggers and phase manifests.
- `scripts/ops/run-capacity-alerting-drill.sh` and its `.spec.js`: full current
  shell/inline Node implementation, child fixtures and real offline child test.
- `scripts/ops/run-dos-resilience-drill.sh`: attached/separate options,
  target cwd, owned resources and independent receipt check/publication pattern.
- `scripts/ops/run-secret-rotation-drill.sh`: adjacent exclusive-publication
  pattern and target-cwd forwarding.
- `scripts/ops/launch-target-evidence.js`: `safeUrl`, `targetId`,
  `readBoundedJson`, `validDatabaseTelemetry`, `validDosEvidence`.
- `scripts/ops/verify-alert-rules.js`: eleven names, source-path options,
  producer JSON and error/check/simulation fields.
- `scripts/ops/verify-capacity-load.js`: current targets, distributions,
  `evaluateSloCompliance`, canonical timestamp, target hash and `--no-save`.
- `scripts/ops/check-launch-readiness.js`: exported
  `validateCapacityAlertingReport`, `validSmtpReference`, placeholder/secret
  checks and success receipt expectations.
- `scripts/ops/run-launch-drills.sh` and
  `scripts/ops/assemble-launch-dossier.js`: Stage 6, invocation-owned exact
  receipts and independent child/target/database validation.
- `package.json`: existing suites, aggregate gate and root build scripts.

Re-read the relevant complete runners/tests and consumer sections before code.
Open additional directly relevant files when implementation requires them. Verify
new Bash/Node/coreutils APIs in installed help/source/manpages or official docs
before using them. There is no dedicated installed Bash/coreutils skill; general
skills do not verify their flags. No Next/React/Tailwind API, visual reference,
component geometry or screenshot measurement applies to this tooling change.
Numeric SLOs and request limits below are existing contracts, not new production
measurements.

## Expected impact and allowed files

Primary edits:

- `scripts/ops/run-capacity-alerting-drill.sh`
- `scripts/ops/run-capacity-alerting-drill.spec.js`
- `docs/operations.md`: accurate runner usage, evidence ownership and real checks.
- `docs/build-plan.md`: implemented prompt 270 record after verification/review.
- `docs/launch-checklist.md`: narrow Category 5 usage/publication clarification.

Focused compatibility tests may be added to
`scripts/ops/run-launch-drills.spec.js` or
`scripts/ops/assemble-launch-dossier.spec.js` when existing coverage cannot prove
the updated real parent works within an owned absent destination. Keep parent
validation/projection in inline Node within the existing runner. Do not add new
helper modules or introduce a general shell framework in this bounded unit.

Do not modify the DoS/alert/capacity child implementations, shared evidence or
readiness validators, launch orchestrator implementation, package dependencies
or npm scripts. Existing script entries already execute these suites. No
application route, data model, tenancy, auth, CI, production template, alert
policy, benchmark algorithm or topology changes are required.

## Implementation requirements

### 1. Validate the invocation before work or output creation

Help aliases remain side-effect-free and list every supported option, default,
mode and reference source. Both separate and attached `=` values are supported
once each for `--cwd`, `--target-url`, `--api-url`,
`--database-telemetry-file`, `--operator-reference`,
`--authorization-reference`, `--benchmark-reference`, `--evidence-dir` and
`--evidence-file`. Reject same/mixed-form duplicates; missing, empty or
whitespace-only or control-containing values; option-looking separate values; unknown flags and
positional input. Repeated `--dry-run` may remain idempotent. Attached paths
beginning with `-` are legitimate paths and must not become command options.

Default target cwd is the installation repository root, regardless of caller
cwd. Resolve an explicit relative cwd from the caller, canonicalize it, require
an accessible directory and use it for source reads and relative paths.
Installation helpers and executable children always remain anchored to the
installation root. An alternate target repository must not substitute its code.
Use the alert child's verified `--alerts-file`/`--prom-file` options to inspect
the target's `infra/prometheus/` files; forward canonical `--cwd` to the DoS
child. Synthetic capacity is code-driven rather than a repository source read.

Preserve unset `API_URL` defaulting to `http://localhost:3001`; explicitly empty
environment origin remains invalid. Use `safeUrl` plus explicit blank/control
and bare-query/fragment checks. API URL must have a root path and becomes
`URL.origin`; benchmark target may have its existing endpoint path and becomes
`URL.href`. Reject credentials, unsupported schemes, queries/fragments including
bare delimiters and invalid ports. Preserve supported hostname/IPv4/IPv6 forms.
Hashes remain distinct: benchmark identity hashes canonical href; API/DoS
identity hashes canonical origin. Do not change consumer hash conventions.

`--dry-run` conflicts with a target or telemetry input; it must produce zero
network calls. For an explicit live benchmark, require its telemetry input;
telemetry without a benchmark target fails before children. Resolve the file
against target cwd, check bounded regular readable JSON with installed
`readBoundedJson`, and validate available structure/target/freshness before
traffic. Revalidate against the completed invocation before accepting it.
Do not impose freshness so strict that the existing allowed observation window
is silently changed. Unreadable/malformed/oversized/incorrect telemetry must not
trigger an avoidable live benchmark or DoS exercise.

Preserve CLI-over-environment reference precedence and existing fallbacks for
compatibility. Validate effective live reference strings with the established
nonempty/trimmed/control-free/placeholder-free/secret-free contract. Reject
invalid explicit values instead of silently falling back. Preserve production
environment qualification: an explicit incompatible `ACRES_ENVIRONMENT` must
not yield a passing production receipt. Built-in reference strings are scaffold
metadata, never proof of operator authorization; do not claim otherwise. Dry
receipts omit production/reference fields as before.

Preserve the existing non-dry/no-benchmark invocation behavior: synthetic
capacity plus bounded live DoS, with missing live database evidence causing
failure. It must never become passing synthetic or production evidence. Help
must explain that it can generate traffic and cannot qualify Category 5.
Do not broaden live traffic or silently turn this invocation into offline mode.

Check mode-required utilities, readable installed child files and helper imports
before child execution/output. Missing machinery is a controlled preflight
failure. Missing/invalid target alert/source content is an evaluated failed
drill, with safe failed evidence at a fresh absent destination; do not mislabel
it as an unavailable installed helper or successful skipped coverage.

Validate only the effective output selection: file overrides directory and
must not create the unused directory. Reject an existing regular file,
directory, symlink or dangling link, trailing separator, unusable parent or
non-directory/dangling ancestor. Validate the nearest existing ancestor before
creating any parent. No diagnostic may reflect rejected paths, origins,
references, child stderr, raw JSON, private responses or arbitrary exceptions.

### 2. Own resources and preserve child observations

Set umask 077; install ownership-aware EXIT/INT/TERM/HUP cleanup before creating
temporary/output resources. Own private child stdout/stderr files, DoS receipt
directory and publication staging file. Cleanup removes only this invocation's
temporary resources, preserving retained evidence and existing directories.
Cleanup failure prevents successful exit/summary. No SIGKILL guarantee is made.

Execute anchored alert/capacity/DoS children as argument arrays. Capacity receives
`--json --no-save` with `--synthetic` or the validated live target; it must not
write an additional `capacity-load-report-*` at its default directory. DoS
receives the validated origin, target cwd and an absent exact path in a private
owned directory, with `--dry-run` only in offline mode. Keep the real child's
current CSRF pairing, at-most-15 login burst and liveness/timeout/body limits.

Capture child exit and output independently. Redirect stdout/stderr privately,
read stdout/receipts with the existing 64 KiB bound and never emit raw stderr.
Malformed/oversized/truncated JSON, primitive/array shapes, missing output and
nonzero child exits must fail even beside success-shaped content. Treat alert
and capacity verdicts as pending until validation; do not print passing messages
based only on process exit. A child failure cannot be erased by recomputing the
parent solely from selected JSON flags. Keep evaluated failures represented by
fixed safe messages in a complete failed parent receipt.

### 3. Validate and project evidence before publication

Passing dry/live receipts must satisfy the existing exported
`validateCapacityAlertingReport` contract, plus actual invocation exit statuses,
time window, expected benchmark/API hashes and expected mode. Reuse installed
validators instead of copying or weakening them. Exercise the real exported
validator in tests; existing minimal `{valid:true}` and partial capacity fixtures
are insufficient success fixtures under this contract.

Verify all eleven unique required alert evaluations and breach/clear simulations,
429 isolation, successful checks, empty errors and consistent counts. Capacity
needs complete finite/monotonic distributions, consistent success/failure totals,
canonical current timestamp, expected target/mode and recomputed SLO compliance.
Preserve availability ≥99.9%, HTTP p95 ≤500ms, throughput ≥100 RPS, DB
acquisition p95 ≤50ms and DB query p95 ≤100ms. These checks are repository
thresholds, not proof of adopted operator policy or sustained capacity.

Keep live database telemetry source, health, target, role pools/percentiles,
scrape state and freshness checks. Synthetic database baseline derives from
validated synthetic distributions; do not fabricate successful database data
from fallback constants when the capacity output is absent or incomplete.
Keep DoS success validation with `validDosEvidence`, actual child exit,
invocation freshness and the existing complete burst counters/flags.

Build receipts from explicit checked fields. Do not blindly copy arbitrary
child keys, error arrays, diagnostics, URLs, filesystem paths or references.
For invalid evidence, emit fixed minimal failed sections and controlled failure
messages; never serialize the rejected payload. Preserve producer fields needed
by readiness/dossier consumers, including safe alert rule metadata and numeric
distribution/baseline fields. Test unknown-field canaries even in otherwise
valid children. Pattern scans alone are not a general data minimization method.

Preserve top-level timestamp/duration, status, summary, alerts, capacity,
databaseTelemetryBaseline, dosResilience, failures, modes and target identities.
Dry success remains `execution_mode: "simulation"`, `mode: "synthetic"`, null
targets, source `synthetic` and skipped DoS burst. Explicit live success remains
`execution_mode: "live"`, `mode: "live"` with target-bound live data and
production/reference fields. Default mixed execution remains failed evidence,
never an accepted classified simulation. No schema version or new launch gate.

Replace collision-prone default names with UUID names retaining prefix
`capacity-alerting-drill-evidence-` and `.json` suffix. Update present-tense
usage docs; retain historical timestamp-name check records as history.
Create new output parents privately without changing existing permissions.
Serialize complete JSON to an owned same-directory 0600 temporary file;
independently read/check receipt completeness, invocation values and expected
verdict before atomic exclusive publication. Check write/serialization status
separately from syntactic validity: early exit with empty or incomplete valid
JSON cannot publish or print success. Success additionally passes the complete
consumer validator; failed receipts need complete controlled failure structure.

Use verified temp-plus-`ln -T --` publication or a verified equivalent that
cannot replace a concurrent file/link or redirect into a concurrent directory.
Do not use direct final writes, `mv -f`, destination invalidation, overwrite
retries or success inferred from a retained receipt. Failure/races/interruption
preserve existing destinations. I/O/publication failure is controlled nonzero
output without a success summary; evaluated failures can publish fresh failed
JSON with nonzero exit. Remove owned staging files before the final summary.

### 4. Expand actual-process isolated tests

Use `node:test` and the actual Bash/inline Node runner in disposable installations
and target repositories. Use explicit tool/environment allowlists, not inherited
process environments. Omit credentials, proxies, injection settings and service
targets. All fake live children/curl calls stay stubbed and cannot delegate to
real network programs. Use unique absent parent destinations for each run.

Cover:

- Help, all option forms, duplicate combinations, blank/missing/control values,
  unknown/positional input, dry/live conflicts and telemetry pairing.
- Different caller/default cwd; relative/absolute explicit cwd; anchored code
  versus target source reads; spaces/quotes/dash-leading paths; invalid cwd.
- Origin/endpoint normalization and distinct hashes, bad URL forms, environment
  precedence and effective live references with no diagnostic canary leaks.
- Missing utilities/helpers and unusable/existing output paths fail before
  children, network, output creation or modification of retained evidence.
- Explicit file leaves unused directory absent; `--no-save` prevents child
  benchmark output; private file/directory modes and unchanged existing modes.
- Complete real producer-shaped success fixtures pass readiness validation in
  dry/live contracts. Default mixed invocation fails honestly. Synthetic receipt
  cannot satisfy `requireLive: true`; fake live tests never prove authorization.
- Alert and capacity nonzero-exit/success-JSON contradictions; missing, malformed,
  oversized, stale, future, wrong target/mode/counts/distributions/verdicts;
  incomplete/duplicate alert sets; bad simulations/429 isolation; private unknown
  fields; safe failed receipt and no premature success message.
- Existing DoS negative scenarios, including missing/stale/contradictory receipts
  and nonzero exit; live database input and completed-window revalidation.
- Preparation/serialization/empty-output/incomplete-JSON/publication failures;
  exclusive destination races against files/directories/symlinks; concurrent
  default names; owned cleanup on failures and catchable interruptions.
- Real offline alert/capacity/DoS children through the parent against copied
  target sources, with network forbidden. Its success receipt must pass the
  existing readiness validator and launch-dossier consumer. A removed source
  must fail safely. Existing orchestrator receipt names remain compatible.

Synchronize race/signal fixtures on observable milestones rather than arbitrary
long sleeps. Test children terminate and owned resources disappear on catchable
interruption; if the parent needs active-child supervision, implement the
smallest verified mechanism and document its limits. Never claim cleanup of
arbitrary/unowned process groups or uncatchable signals.

### 5. Review, document and commit

Self-verify and inspect the diff first. Dispatch the mandatory reviewer subagent
with approved requirements, BASE_SHA/HEAD_SHA, uncommitted diff, constraints,
checks and no-live authorization limit. Verify feedback using
`receiving-code-review`; fix valid issues, re-test and re-review significant
behavior changes before recording completion.

Update the owning operations record and narrow Category 5 current usage. Do not
erase historical outputs or claim operator evidence exists. Append a prompt 270
implementation/check record to the build plan only after the work is verified
and reviewed. Commit approved files locally to `main` with `caveman-commit`;
preserve unrelated changes and do not push.

## SKILLS USED

- `deployment-pipeline-design`: Preserve Stage 6 evidence ownership and operator
  launch gates while hardening the parent runner.
- `prometheus-configuration`: Preserve alert/scrape/baseline meanings and the
  distinction between simulation, exporter health and database health.
- `secrets-management`: Private child data and controlled, redacted diagnostics.
- `error-handling-patterns`: Early validation, truthful child failures, exclusive
  publication and owned cleanup.
- `javascript-testing-patterns`: Isolated actual-process contracts and meaningful
  failure/race/signal tests with the existing Node harness.
- `requesting-code-review`: Independent reviewer after self-verification.
- `receiving-code-review`: Verify findings before fixes and follow-up review.
- `caveman-commit`: Required local commit message, without a push.

This bounded shell/Node unit does not touch the parent phase's Nest modules,
SQL, UI/browser journeys, CI, Grafana dashboards, SAST policy or system
trust-boundary architecture. Their skills apply only if those surfaces change;
such changes are outside this approved scope.

## Non-goals and rollback

No live load/probe/DoS demonstration, production telemetry collection, on-call
notification, deployment, credential rotation, dependency repair, schema/API
change, threshold tuning, new alert policy, launch approval or push. No child
benchmark/parser redesign, consumer validation relaxation or general operations
framework. Live behavior remains narrower than sustained/distributed capacity,
deployed multi-layer protection or independently inspected operator evidence.

Rollback is a focused revert of this runner/tests/documentation commit. Evidence
already published is retained. Never remove existing evidence to restore the old
overwrite behavior.

## Verification and acceptance

Run from repository root; report actual concise output and exit statuses:

```bash
bash -n scripts/ops/run-capacity-alerting-drill.sh
node --check scripts/ops/run-capacity-alerting-drill.spec.js
npm run ops:capacity-alerting-test
npm run ops:capacity-test
npm run ops:alert-test
npm run ops:dos-test
npm run ops:templates
npm run ops:templates-test
npm run ops:readiness-test
npm run ops:launch-readiness-test
npm run ops:launch-drill-test
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Run typecheck/build sequentially because they share generated Next types. Run
syntax and installed Prettier on any changed JavaScript and this prompt. Format
new documentation sections separately when existing whole-document warnings
remain. Do not claim shell formatting without an applicable installed formatter.

Planning `npm run ops:capacity-alerting-test` exited 1 with `tests 1`, `pass 0`,
`fail 1`, reporting the spec file as `test failed`. A TAP diagnostic run also
exited 1 with `ERR_TEST_FAILURE`, without an underlying test cause. This does
not establish a runner defect or a present passing baseline. Diagnose detailed
output/process execution at implementation; distinguish environment limitations
from actual failures and do not cite historical 18/18 as current results.

Prompt 269's aggregate stopped at a critical production audit, historically
`37 vulnerabilities (9 moderate, 26 high, 2 critical)`. Re-run the aggregate
once and report its actual stop; run affected suites independently if blocked.
Do not claim later aggregate stages ran after an earlier failure. Dependency
updates or registry retry/credential changes are outside scope.

Acceptance: malformed/preflight failures have no drill side effects; offline
execution has no traffic; selected source/destination semantics are accurate;
passing evidence matches complete existing consumers and actual child exits;
untrusted child data does not escape; existing/concurrent evidence survives;
new receipts are private, complete and exclusively published; cleanup/failure
behavior is tested; independent review is resolved; real checks or external
blockers are recorded; approved changes are committed locally.

Safe inspection after implementation:

```bash
bash scripts/ops/run-capacity-alerting-drill.sh --help
npm run ops:capacity-alerting-test
```

An offline evaluation can use `--dry-run --cwd=. --evidence-file=<absent-path>`.
Any non-dry invocation requires separate operator authorization. Preparing this
prompt authorizes no implementation; execution begins only after approval under
`AGENTS.md` §2.
