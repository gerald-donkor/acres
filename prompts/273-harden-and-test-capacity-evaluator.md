# Phase 12K — Harden and test capacity evaluator invocation and publication

## Scope and why this is next

This is a dependency-safe prompt-sized step within `docs/build-plan.md` Phase
12, following committed static-integrity producer hardening. Planning baseline
is clean `main` at `b9dd71188b98d18cc3b68a8b47c94a07470cabcd`
(`fix(ops): harden static evidence publication`). Re-establish the execution
baseline from code and git history; prompt files do not prove implementation.

The capacity parent was hardened in prompt 270. Its installed child,
`scripts/ops/verify-capacity-load.js`, still silently ignores unknown arguments,
accepts partial integer strings through `parseInt`, lets argument order decide
synthetic/live mode, and discovers save failures after evaluation. Standalone
report saving uses a millisecond filename, default permissions and direct writes
that can replace an existing report. Its top-level exception prints raw error
text. Existing tests cover statistics and one ordinary save, with no actual CLI
input, private publication, race or diagnostic contract coverage.

Harden this child's invocation, report publication and tests. Keep the
statistical algorithms, existing synthetic defaults, five SLO targets and live
HTTP worker algorithm intact. Parent invocation is already
`--json --no-save` plus exactly one of `--synthetic` or `--target-url <url>`;
preserve that contract and all consumer exports. No production category can be
approved by an offline result. Phase 12, prompt 201, dependency findings and
operator sign-offs remain open.

Approval authorizes repository changes, hermetic synthetic/stubbed-process
fixtures and the checks below. It does not authorize real HTTP benchmarking,
live load/DoS, unified drills, production evidence inspection/approval,
deployment, credential mutation, dependency upgrades or push.

## References read and execution prerequisites

- `AGENTS.md`: phase control, prompt contract, checks, review and local commit.
- `docs/build-plan.md`: phase protocol, Phase 12, sequence gates and committed
  prompts 270–272.
- `docs/operations.md`: topology/redaction, Phase 12J capacity engine and
  prompt 234 producer-aligned readiness contract.
- `docs/launch-checklist.md`: launch governance, Category 5 and distinct
  simulation/live operator acceptance.
- `docs/system-architecture.md` §11: configuration, secret and diagnostic rules,
  observability and launch gates.
- `docs/security.md` §2 and §21: scope and capacity/DoS evidence boundaries.
- `docs/skills.md`: vendored skill paths and surface-specific loading.
- `scripts/ops/verify-capacity-load.js` and its full existing spec: defaults,
  exports, statistics, live worker, report/save and CLI behavior.
- `scripts/ops/launch-target-evidence.js`: `safeUrl` and benchmark `targetId`.
- `scripts/ops/run-capacity-alerting-drill.sh`: actual child flags, output and
  exit checking, report projection and consumer contract.
- `scripts/ops/run-capacity-alerting-drill.spec.js`: copied producer/validator
  dependency closure and credential-free stub environment.
- `scripts/ops/assemble-launch-dossier.js`: imported targets/evaluator and
  nested capacity acceptance.
- `scripts/ops/check-launch-readiness.js`: `validateCapacityAlertingReport`
  and structural/production distinction.
- `scripts/ops/check-production-templates.js` and `package.json`: existing
  targets, invocation markers and available verification scripts.
- Installed `node_modules/@types/node/fs.d.ts` and `crypto.d.ts`: path inspection,
  exclusive creation, hard linking and UUID API declarations.

Re-read the relevant complete code/specs before editing. Verify changed Node
APIs through installed types/sources or official documentation, including
exclusive-open/link behavior, descriptor ownership and stdout error handling.
No installed dedicated standalone Node CLI/publication skill or matching Node
CLI security reference exists; loaded general disciplines and verified Node
APIs supply the guidance. No Next/React/Tailwind API, visual change or measurement
is involved; comps, crops and breakpoint geometry do not apply.

## Expected impact and allowed files

Primary changes:

- `scripts/ops/verify-capacity-load.js`.
- `scripts/ops/verify-capacity-load.spec.js`.

Narrow integration tests, if needed:

- `scripts/ops/run-capacity-alerting-drill.spec.js`: exercise the actual
  synthetic child with `--json --no-save` within the existing isolated parent.
- `scripts/ops/check-launch-readiness.spec.js` or
  `scripts/ops/assemble-launch-dossier.spec.js`: only producer compatibility
  or fixture dependency-closure adjustments, without weakening acceptance.

Documentation after verification/review:

- `docs/operations.md`: implemented behavior, real checks and limitations.
- `docs/launch-checklist.md`: safe inspection and standalone capacity report
  regeneration/private-publication instructions where relevant.
- `docs/build-plan.md`: concise Phase 12 implementation/verification record.
- This approved prompt in the eventual implementation commit.

`ops:capacity-test` already exists and runs this spec, and `ops:check` already
includes it. No new package script, dependency or shared publication framework
is needed. Preserve parent/consumer production implementations, HTTP routes,
UI, schema, telemetry/alert policy, CI and operator configuration.

## Implementation requirements

### 1. Parse strictly and validate before evaluation or filesystem allocation

Keep default synthetic mode, duration 5 seconds, concurrency 10 and standalone
save enabled. Support exactly these existing switches plus side-effect-free
help and an explicit standalone destination:

- `--synthetic`, `--json`, `--no-save`, `--allow-failure`.
- `--target-url <url>` / `--target-url=<url>`.
- `--duration-sec <integer>` / `--duration-sec=<integer>`.
- `--concurrency <integer>` / `--concurrency=<integer>`.
- New `--output <file>` / `--output=<file>`.
- `--help` / `-h`, only as a standalone invocation.

Reject unknown switches, positional arguments, duplicate flags/value forms,
missing/empty/whitespace/control-containing values, ambiguous separate values
beginning with `-`, mixed help/execution, `--synthetic` with `--target-url` in
either order, and `--output` with `--no-save`. Ordinary spaces/quotes in output
paths are valid data, never shell syntax. Attached dash-leading paths work.
Reject `--rps`: the file header advertises it but the actual CLI/worker does not
implement pacing. Correct that stale description; do not add a pacing feature.

Parse whole decimal strings as safe integers, never partial prefixes,
exponents, signs, fractions or fallback values. Set explicit invocation bounds
of 1–300 seconds and concurrency 1–100. These are proposed engineering safety
limits for this tool, not measured capacity or new production SLOs; record them
as that judgment. Preserve accepted defaults and explain rejection in help.
Do not silently clamp. Apply the same duration/concurrency boundary to direct
`evaluateCapacity`/`runLiveBenchmark` calls before work, preserving omitted
defaults. Do not redesign unrelated synthetic tuning options.

Use the existing `safeUrl` semantics for a string HTTP(S) target without
credentials, query, fragment or controls; also reject empty/outer-whitespace
input. Normalize once and preserve the benchmark hash of canonical URL `href`,
including its root slash. The live worker's existing root-path-to-`/health`
behavior remains; do not silently switch hashes to that rewritten endpoint or
to `origin`. No DNS request is needed to validate an invocation. Importing the
module or asking for help must perform no filesystem/network work.

Before evaluation, resolve and preflight save destinations. A new explicit
CLI output resolves against caller cwd; default reports remain under the
installed repository's `backups/`. Direct `evaluateCapacity` keeps `backupsDir`
support and can accept `outputFile` for an exact destination when saving is
enabled. Reject contradictory direct save/output settings before evaluation.
Generate UUID-based default filenames; select one destination and do not retry
collisions to hide a competing destination.

Require an absent final path, inspect existing ancestors with symlink-aware
checks, reject trailing separators, retained files/directories/symlinks/dangling
links and non-directory/symlink parents. An unusable ancestor fails before
evaluation. Do not create directories on rejected input. Advisory permission
checks never replace operation-level error handling. `--no-save` neither
preflights nor creates the default backup directory.

### 2. Preserve reports and the evaluation meaning

Keep named existing exports, deterministic generation and percentile/rounding
algorithms unchanged. Keep canonical timestamp, `mode`, hashed `targetUrl`
(synthetic marker for synthetic runs), `targets`, `distribution`, `compliance`
and optional returned `reportPath` meanings. Saved JSON excludes `reportPath`
as before. Preserve all compliance flags and fixed violation strings.

Synthetic DB distributions stay synthetic. Live HTTP still does not measure
database latency; separately bound telemetry remains the production DB gate.
Do not make synthetic reports live-shaped, add operator confirmations or
convert missing live telemetry into acceptance. Do not modify readiness,
dossier or parent validators to make a new child pass.

Introduce narrowly scoped parse/preflight/publication helpers and test injection
if useful. The installed module must remain independently importable in copied
consumer fixtures; keep all work behind explicit calls. Reuse the installed
target helper rather than duplicating hash semantics. Ensure its dependency is
present in disposable actual-producer fixtures.

### 3. Publish complete reports privately and exclusively

Create missing directories with 0700 and preserve existing parent permissions.
Do not change global umask at import/helper scope. Allocate random staging in
the destination directory with exclusive creation and 0600. Track ownership
immediately after open, before write/close. Serialize only the established report
fields; never include raw options, target URL, headers, environment or errors.
Close, independently read back and verify the complete serialized report
against the evaluated report before publication. A malformed/partial report
must not publish. Failed SLO evaluations can publish truthful failed evidence.

Use atomic exclusive publication such as a same-filesystem hard link; never
rename over an existing path or write the final path directly. Recheck parents
and destination at operation boundaries. Existing and racing files, directories,
links and foreign staging remain untouched. Unsupported filesystems fail
without a replacement fallback. Concurrent writers at one explicit destination
may both evaluate; at most one can publish. Do not promise a pre-execution
reservation or cryptographic provenance.

Cleanup removes only owned staging/descriptors. Handle open/write/close/read/
link/unlink failures and retain ownership for safe cleanup attempts. If final
publication succeeds but cleanup/output fails, preserve final evidence and exit
nonzero; do not retract it or claim success. Document that newly created empty
directories can remain after later failure. No evidence-tree sweeps or deletion
of retained reports. No SIGKILL/host-loss or hostile arbitrary ancestor-mutation
cleanup guarantee is claimed. This step adds no async process supervisor or
changes to request timeout, worker count algorithm, elapsed-time calculation,
response status classification, agent behavior or pacing.

### 4. Keep errors and CLI status truthful

Use fixed safe error messages, never raw exception text, rejected values,
private output paths, URLs, headers or stack traces. JSON mode writes exactly
one report on completed evaluation/publication; failures produce a controlled
nonzero exit with a safe stderr message, not success-shaped JSON. Help exits 0
without evaluation/save. Preserve the human statistical summary and hashed
target; do not expose a private report path in CLI diagnostics. Direct callers
may retain the existing returned `reportPath` API.

`--allow-failure` may override only an evaluated SLO failure. It must not mask
argument, setup, evaluation exception, serialization, publication, cleanup or
console-output failures. With a failing but valid SLO report, evidence preserves
`overallPassed: false` even when the override returns 0. Avoid truncating stdout
with immediate exits; verify the installed Node behavior used to finish output.

### 5. Add hermetic actual-process and publication coverage

Use existing `node:test`; no new framework. Preserve meaningful statistics and
SLO regressions. Build disposable actual CLI installations containing this
producer and its required helper closure. Invoke through `process.execPath` with
an allowlisted environment, no inherited credentials/proxies/NODE_OPTIONS/
BASH_ENV/ENV. Synthetic CLI tests may execute the actual generator but use owned
temporary output. Any live-path exercise uses in-process injected/stubbed
HTTP/HTTPS transport and controlled clock, never a real socket or DNS call.
Do not use a live local HTTP server or public/private target. Bound process
timeouts, restore mocks and tear down owned resources on assertion failure.

Cover observable behaviors:

- Import/help have zero work; separate/attached values, defaults, valid boundary
  integers, duplicate/conflicting/malformed values and unsupported `--rps`.
- Invalid URLs (including secret canaries), numeric inputs and destinations
  fail before generator/transport/allocation. Direct-call validation matches CLI.
- Actual synthetic `--json --no-save` has complete compatible JSON and no save
  side effects; caller cwd does not alter installed default-root semantics.
- Private output/new-directory modes under permissive umask; existing parent
  mode preserved; quoted/spaced paths remain literal.
- Retained file/directory/link/dangling output and invalid ancestors; deterministic
  collisions after preflight and concurrent publishers preserve the winner.
- Injected open/write/close/read/serialization/link/unlink/output failures,
  staging ownership, no partial final report, no false-success exit or canary
  disclosure. Cleanup failure after publication retains the completed final.
- Default UUID filenames do not depend on millisecond uniqueness. `--no-save`
  requires no filesystem permission on backup roots. Direct `backupsDir` remains
  supported and direct save calls enforce publication invariants.
- Genuine SLO pass/fail and override behavior; setup/I/O exceptions cannot be
  overridden. Use the actual synthetic duration to trigger low-throughput
  failure rather than fabricating successful results.
- Actual child accepted by the real isolated dry parent/structural consumer;
  synthetic parent still cannot approve Category 5. Failing child status blocks
  parent acceptance. Preserve canonical `href` hash on stubbed live-path calls
  without network access. Existing parent/dossier/readiness regressions pass.

Permission tests must remain meaningful under this user; use injected errors
where host permissions cannot reliably deny access. Favor deterministic
milestones/dependency injection over sleeps or privileged fixture actions.

## SKILLS USED

- `deployment-pipeline-design`: Preserve gate/child semantics and distinguish
  repository evaluation from operator launch/promotion decisions.
- `secrets-management`: Private reports, credential-free fixtures and redaction.
- `security-best-practices`: General secure-default CLI/publication discipline;
  no matching standalone Node CLI reference is installed.
- `error-handling-patterns`: Early rejection, truthful exits and owned cleanup.
- `javascript-testing-patterns`: Pure contracts, failure injection and actual
  CLI fixtures using existing `node:test`.
- `e2e-testing-patterns`: Deterministic child-to-parent integration and teardown;
  no browser or production journey introduced.
- `requesting-code-review`: Independent read-only reviewer after self-checks.
- `receiving-code-review`: Verify findings, fix valid defects and re-review
  significant publication/compatibility changes.
- `caveman-commit`: Required local Conventional Commit message; no push.

This bounded step changes no runtime topology, Nest module, SQL, HTTP API,
CI/workflow, scanner, alert/Grafana definition, threat-model topology or UI.
Their broader Phase 12 skills are not triggered. Reassess if implementation
needs to cross one of those surfaces; do not expand scope silently.

## Verification, review, documentation and completion

Re-read the approved prompt and all named skills, record BASE_SHA and preserve
unrelated work. Verify the new fixtures cannot send traffic before running them.
Run from the repository root:

```bash
node --check scripts/ops/verify-capacity-load.js
node --check scripts/ops/verify-capacity-load.spec.js
node scripts/ops/verify-capacity-load.js --help
npm run ops:capacity-test
npm run ops:capacity-alerting-test
npm run ops:alert-test
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

Typecheck/build run sequentially. Use installed Prettier and repository
conventions on changed JS and this prompt; format edited/new documentation
regions without unrelated whole-file rewrites. Quote actual exits/output.
Do not run `ops:capacity-drill`, unstubbed live CLI, capacity parent or unified
drill outside the isolated fixtures as part of verification.

Prompt 272 recorded `ops:check` failing at production audit with
`37 vulnerabilities (9 moderate, 26 high, 2 critical)`. This is historical
context, not a current result. Run/report the current gate honestly; distinguish
unreached later stages from failures, run affected isolated suites independently
and do not weaken audit or incidentally upgrade dependencies. Treat sandbox
subprocess denials separately from test/build failures and follow environment
approval policy for necessary hermetic verification.

After self-verification inspect the complete diff and dispatch the mandated
read-only reviewer subagent with the loaded template, approved requirements,
BASE_SHA/HEAD_SHA, actual uncommitted diff, checks/output and no-network boundary.
The reviewer must not mutate the checkout or delegate. Evaluate findings with
`receiving-code-review`, fix verified issues, rerun affected checks and obtain
follow-up review for significant publication or compatibility changes.

Then record final implemented contracts, engineering bounds, actual output and
remaining limits in owning docs; preserve historical records and identify the
superseding standalone save contract. Document regeneration with a new absent
destination. Keep operator launch decisions unresolved.

Stage only approved files, inspect the staged diff and commit locally to `main`
using `caveman-commit`, including this prompt. Do not push. Return the commit,
checks and exact safe inspection commands:

```bash
node scripts/ops/verify-capacity-load.js --help
npm run ops:capacity-test
```

Rollback is a reviewed normal revert; preserve already published evidence. The
former saving code can replace reports and its CLI ignores mistakes, so revert
does not make destination reuse or unchecked live invocations safe. No claim
of production capacity, live DB baseline, alert delivery or launch approval.
