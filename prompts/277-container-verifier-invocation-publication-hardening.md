# Phase 12K — Harden container-verifier invocation and artifact publication

## Scope and why this is next

This is the next bounded, dependency-safe producer step within Phase 12 of
`docs/build-plan.md`, following committed SBOM and SAST producer hardening.
Planning baseline is clean `main` at
`7a939e218a5f1a125488bbdb666d7f20b54e0624`
(`fix(ops): harden SAST evidence publication`). Re-establish current state from
code and git history at execution; written prompts are not implementation proof.

Stage 2 of `scripts/ops/run-launch-drills.sh` invokes
`verify-container-security.js --output <stage-directory>/container-security-evidence-receipt.json`.
The current producer silently ignores unknown/positional arguments, accepts
repeated/incomplete options, has no standalone help, reads sources without
resource/type bounds, recursively creates output parents and overwrites the
destination. Immediate `process.exit()` can truncate output. Raw exception
messages, Docker instructions, command values and interpolated invalid Compose
fields can expose private source material in evidence and downstream blockers.

Harden invocation, bounded source handling, CLI evidence projection, exclusive
publication, controlled errors and output completion. Preserve existing valid
input semantics, check predicates/ordering, four public exports and consumer
contracts. Do not redesign Dockerfile/Compose security policy. Phase 12,
prompt 201, dependency advisories, provenance and operator sign-offs remain open.

Planning ran only a read-only `verifyContainerSecurity()` projection. Actual
output: `valid: true`, `totalChecks: 22`, `passedChecks: 22`, `errors: 0`.
Source sizes were `server/Dockerfile: 2813` bytes,
`infra/docker/client.Dockerfile.example: 1678` bytes and production Compose:
`15859` bytes. These are baseline observations, not acceptance thresholds or
production measurements. No implementation tests or build ran during planning.

Approval authorizes repository changes and hermetic checks. It does not authorize
Docker execution, an unstubbed unified drill, production inspection/deployment,
credential access/mutation, dependency upgrades, scanner installation or push.

## References read and execution prerequisites

- `AGENTS.md`: phase control, prompt contract, skills, checks, review and commit.
- `docs/build-plan.md`: Phase 12, sequence gates and prompts 271–276 records.
- `docs/operations.md`: topology, container/lifecycle records, prompt 233 receipt
  bounds and prompts 275–276 publication/output precedents.
- `docs/launch-checklist.md` §4: exact child receipts and operator sign-off limits.
- `docs/system-architecture.md` §11.1: configuration and secret/log constraints.
- `docs/security.md`: TM-15/TM-18 and Phase 12I static-scanner limitations.
- `docs/skills.md`: locked skill paths and surface-specific loading.
- `scripts/ops/verify-container-security.js` and its complete spec: predicates,
  defaults, public exports, existing fixture policy and CLI behavior.
- `scripts/ops/run-launch-drills.sh` and its spec: stage 2 command, fixture
  installation and actual SAST child integration precedent.
- `scripts/ops/assemble-launch-dossier.js` and its spec: receipt identity,
  bounded reads, timestamp validation, `validSummaryFields` and baseline verdict.
- `scripts/ops/check-launch-readiness.js` and its spec: container identification
  and failed status/valid/errors/checks rejection.
- `scripts/ops/run-sast-scan.js`: verified owned staging/parent identity,
  publication, safe projection and output patterns; inspect rather than copy blindly.
- `scripts/ops/verify-alert-rules.js`: bounded regular-source reads and verified
  `js-yaml` limits. Read-only precedent; no shared framework extraction.
- `package.json`: existing container, adjacent producer, consumer and root checks.
- `node_modules/@types/node/fs.d.ts` and `process.d.ts`: synchronous file/link
  operations, no-follow/nonblocking constants and natural output completion.
- `node_modules/js-yaml/lib/loader.js`: verify installed supported YAML resource
  options before using them; do not invent a parser option from memory.
- `.agents/skills/requesting-code-review/code-reviewer.md`: review template.

Before writing code, re-read the complete relevant functions and fixture helpers.
Verify new APIs against installed source/types, a loaded skill or official docs.
This is a standalone Node CLI. The installed security skill has no dedicated
Node CLI reference; its general guidance and verified local APIs apply. No
visual surface, Next/React/Tailwind API, SQL, browser, topology or telemetry
configuration changes. Comps, crops, pixel targets and breakpoint deltas are
inapplicable. Source/read/publication bounds below are engineering decisions.

## Expected impact and allowed files

Primary changes:

- `scripts/ops/verify-container-security.js`.
- `scripts/ops/verify-container-security.spec.js`.

Narrow actual-child/consumer test additions where necessary:

- `scripts/ops/run-launch-drills.spec.js` and/or
  `scripts/ops/assemble-launch-dossier.spec.js`.
- `scripts/ops/check-launch-readiness.spec.js` only if the integration above
  does not establish real receipt acceptance and failure rejection.

After verification/review:

- `docs/operations.md`: final contracts, outputs, baseline parity and limits.
- `docs/build-plan.md`: concise committed-state record.
- `docs/launch-checklist.md` §4: safe inspection/regeneration instructions.
- `docs/security.md`: concise static evidence projection/limitations update.

No application route, schema, dependency, package script, Dockerfile, Compose
template, registry approval, production consumer, CI file or other producer
changes. Keep helper decomposition local and small; do not introduce a general
operations publication framework. Source templates remain read-only inputs.

## Implementation contract

### 1. Strict invocation and direct options before work

Retain `--json`, `--output FILE` and `-o FILE`. Add attached output values
(`--output=FILE`, `-o=FILE`) and standalone `--help`/`-h`. Human output remains
the default. Reject unknown/positional tokens, duplicate options including
aliases, boolean attached values, missing/empty/blank/control-bearing paths,
and help combined with work. Separate dash-leading values fail as ambiguous;
attached dash-leading paths are literal data. Ordinary spaces are supported.
Never expand shell syntax, environment variables or tilde.

Validate the entire invocation before source reads or destination allocation.
Import/help evaluates nothing and writes nothing. Help explains installed-root
defaults, explicit caller-relative output, absent destinations, static scope
and truthful failure exits. Default input root stays installation-anchored,
independent of caller cwd. Do not add CLI source/root overrides, implicit save,
default evidence output, `--allow-failure` or a new report format.

Validate direct `verifyContainerSecurity(options)` before any read: a non-null
non-array record, and any explicitly supplied `rootDir`, `serverDockerPath`,
`clientDockerPath`, `composePath` must be nonblank/control-free strings.
Missing fields retain defaults; malformed present values cannot disappear in
truthy fallbacks. Preserve valid existing relative-path behavior and external
custom source paths. Do not impose repository confinement. Keep it synchronous
and read-only, with the four existing exports. Do not add unused injection APIs.

### 2. Bounded sources and safe malformed-input handling

Load only the existing three fixed sources. Require regular source files,
verify opened descriptors, use nonblocking open against FIFO replacement, bound
growth-aware reads at 1 MiB per source and close owned descriptors on every path.
Retain existing regular symlink-source compatibility; no-follow restrictions
apply to output publication, not a newly invented source confinement policy.
Missing sources remain failed evaluation with fixed slot-specific messages,
without reflecting an absolute path. Read/parser/closure faults fail safely;
never treat an unreadable source as absent and then imply success.

Use installed YAML depth/merge bounds (100 nesting levels, 10,000 total merge
keys, after verifying support), plus a bounded traversal budget of 10,000
entries before evaluation. Reject cyclic or excessive collection structures
without recursion overflow or unbounded alias expansion. These are engineering
bounds, not measured operational capacity. Preserve ordinary finite aliases
and well-formed map/list environment and command forms used by existing tests.

Guard shapes the evaluator dereferences: Compose root/services/networks and
service/network definitions; environment, volumes, command, healthcheck and
dependency structures where present. Reject malformed null/scalar/array records
and invalid element types with a controlled failed result rather than crashing,
stringifying arbitrary objects or allowing an empty successful evaluation.
Missing optional fields should still reach their existing check predicates;
do not replace failed security checks with a broad blanket rejection.
Pure helpers validate their required input types and stay filesystem-free.

Do not add mandatory services to the established small-fixture policy, change
the full-stack detection rule, rewrite Dockerfile syntax/stage resolution,
tighten image pinning, parse CMD into a new policy, or change credential regexes.
Retain current check identities and existing well-formed-input verdicts.
The production baseline is 6 server checks, 6 client checks and 10 Compose
checks, ordered as before, with all 22 passing.

### 3. Faithful, non-reflecting CLI report

Preserve payload fields: `drill_type: "container_security_verification"`, UTC
`timestamp`, `status: "success" | "failed"`, `valid`, `errors`, `checks`,
`totalChecks`, `passedChecks`, `failedChecks`. Each projected check has its
fixed target identity, check identity, boolean `passed` and safe `details`.
Normalize accidental truthy/undefined predicate results to boolean without
changing their well-formed-input pass/fail meaning.

Build a separate CLI/evidence projection without mutating direct helper
results. Use fixed source-slot targets for CLI evidence and fixed check-specific
messages. Never copy raw Docker instructions, CMD/ENV values, Compose service,
dependency or environment names, invalid field values, arbitrary paths, source
contents or parser/exception strings into CLI human/JSON/saved evidence.
Preserve useful check identity, slot, verdict, counts and fixed remediation.
For supplemental errors that are not represented by one failed check, emit
fixed safe error categories; do not silently discard an error and flip validity.
Direct helper diagnostics remain local caller data, documented as such.

Build counts and verdict from actual evaluation; validate projected report
shape/counts/verdict consistency before saving. A complete evaluated failure
may be saved and prints complete JSON when selected, but exits 1 and fails
unchanged consumers. Unexpected internal execution failures must not fabricate
a passing report. Explicitly distinguish evaluated failure from execution and
publication failure in diagnostics.

### 4. Private, exclusive and independently verified publication

Only explicit output saves. Read-only preflight after argument validation and
before evaluation requires an absent destination, including dangling symlinks.
Reject root/trailing-separator/directory targets and symlink/non-directory
ancestors. Record existing ancestor identities and recheck during allocation
and publication; a disappeared recorded parent must not be silently recreated.
Create only missing parents at 0700 and preserve existing parent modes.

Serialize once with a newline. Saved receipt bytes must fit the unchanged
dossier's 1 MiB ceiling before directory creation. This is a save compatibility
bound; do not silently truncate or inherit it as a no-save output limit.
Use exclusive same-directory 0600 owned staging. Handle short/zero writes and
open/write/close faults, retaining descriptor ownership until closure is known.
Close and reopen with no-follow/nonblocking checks, verify regular-file identity,
bounded size, full bytes and independently validated parsed report. Detect
truncation/growth/ordinary replacement or tampering before publication.

Publish with an exclusive atomic hard link. Never overwrite-rename, truncate,
unlink retained evidence or fall back destructively. A competing late file,
directory or link survives unchanged and this invocation fails. Cleanup touches
only owned staging/descriptors; preserve foreign replacements, racing outputs
and published receipts. Retain retryable ownership after cleanup failures;
bounded retry cannot erase a recorded failure. Do not recursively remove parents.
Output/cleanup failure after publication preserves evidence and exits nonzero.

Document hard-link filesystem requirements, interruption/orphan-staging limits,
conservative cleanup when ownership cannot be established, and same-UID hostile
administrator limits. Do not add an unrelated signal framework or claim that
path checks provide descriptor-relative confinement/durable crash recovery.

### 5. Controlled errors, full output and truthful exit

Use fixed diagnostics for invocation, source/evaluation, serialization,
publication, cleanup and output failure. Do not reflect rejected tokens,
source/output paths, raw errors, stacks or source values. Human output uses
the same projection and omits the raw output-path banner.

Exit 0 requires valid invocation, passing completed evaluation, any requested
verified publication, successful cleanup and output. Replace immediate exits
with natural output draining through `process.exitCode` and stream error/callback
handling. Large finite JSON for evaluated failures must parse completely.
Broken pipes and synchronous/asynchronous stream failures fail cleanly without
uncaught stacks or a passing completion. Output failure may leave a verified
published receipt, but never a successful process status.

### 6. Hermetic behavior and actual-child compatibility tests

Keep the existing 22 tests and all security mutation regressions. Use existing
`node:test`, disposable finite installation roots, `process.execPath`, bounded
child timeouts and finally teardown. Environments are allowlisted and exclude
credentials, proxies, NODE_OPTIONS, BASH_ENV and ENV. Never invoke Docker,
services, network probes or the real unified runner without stage stubs.
Use scoped deterministic fault hooks, not UID-dependent permissions or races
that rely on delays. Restore hooks before cleanup.

Cover import/help with no source/output work; installed defaults from changed
caller cwd; spaced/attached/literal output paths; every invalid/duplicate/help
combination and direct option before reads; no-save allocation absence;
human/JSON/save verdict parity; failed Docker/Compose evaluations; missing,
malformed, special, growing and excessive sources; descriptor cleanup; YAML
depth/merge/cycle limits; ordinary finite aliases and small valid fixtures.

Cover retained files/directories/links/dangling links, ancestor disappearance
and replacement, competing late outputs, private modes, staging replacement,
short/zero writes, size bound before allocation, readback tampering, injected
filesystem faults, cleanup retry, foreign preservation and post-publication
failure. Use canaries in rejected tokens, raw errors and adversarial source
values/names. None may appear in projected stdout/stderr/saved evidence or
consumer blockers; direct helper results must remain unmutated. Exercise all
error-producing predicate families, not just detected ENV secrets.

Install the actual verifier into the existing disposable unified-runner
fixture with only its required `js-yaml` dependency closure and three fixture
sources; keep all other stages stubbed. Exercise passing, a real failed
security mutation and malformed/unreadable source cases. Assert registered
receipt name, complete JSON, child exit, stage/dossier baseline/compliance and
unchanged readiness acceptance/rejection. A retained failed receipt cannot
approve stage 2. Synthetic acceptance proves structural compatibility only.

Compare baseline and new well-formed-input check identities/order/booleans,
validity and exports against the planning commit. Deliberate CLI message
projection and malformed-input safety are the documented differences. Do not
change templates, predicates, suppression policy or consumers to force passes.

## Non-goals and residual work

No Docker/Compose parser replacement, changed security predicate, stronger
image/digest policy, new check, source confinement, universal secret detector,
cryptographic provenance, external scanner, service mutation, AST analysis,
runtime security certification, CI redesign, shared publisher, dependency
remediation or production approval. Existing string/regex heuristics and
Dockerfile syntax limits remain explicit. Obtain scope direction before
crossing unrelated product/runtime/security boundaries.

## SKILLS USED

- `sast-configuration`: Preserve static check policy and evidence scope.
- `deployment-pipeline-design`: Preserve stage 2 child/receipt/exit contracts.
- `secrets-management`: Non-reflecting evidence and credential-free fixtures.
- `security-best-practices`: Safe-default invocation and local artifact handling;
  no dedicated standalone Node CLI reference is installed.
- `error-handling-patterns`: Early rejection, ownership, fault propagation and
  truthful naturally drained process completion.
- `javascript-testing-patterns`: Existing Node behavior tests and scoped faults.
- `e2e-testing-patterns`: Focused actual-child integration and independent teardown;
  no browser journey is introduced.
- `requesting-code-review`: Mandatory independent review after self-verification.
- `receiving-code-review`: Verify findings, fix valid issues and re-review material
  publication/compatibility changes.
- `caveman-commit`: Required compact local Conventional Commit without push.

Broader Phase 12 topology/threat-model, Nest, CI, telemetry/Grafana, SQL,
Playwright and UI skills do not trigger for this bounded producer step.
Reassess if execution needs those surfaces.

## Verification, review, documentation and completion

Re-read the approved prompt and every named skill before editing. Record
BASE_SHA, inspect current state and preserve unrelated work. Run from root:

```bash
node --check scripts/ops/verify-container-security.js
node --check scripts/ops/verify-container-security.spec.js
node scripts/ops/verify-container-security.js --help
npm run ops:container-test
npm run ops:container-security
npm run ops:launch-drill-test
npm run ops:readiness-test
npm run ops:launch-readiness-test
npm run ops:sbom-test
npm run ops:sast-test
npm run ops:sast
npm run ops:templates-test
npm run ops:templates
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Run typecheck and build sequentially. Use installed Prettier for changed JS and
the prompt; format new documentation regions without rewriting historical
records. Quote real outputs/exits. If aggregate checks stop at existing audit
findings, report exact failure/unreached stages and run affected suites
independently. Never claim aggregate success or upgrade dependencies here.
`ops:container-security` and `ops:sast` without output are authorized local
inspection; actual unified execution remains hermetically stubbed only.

Inspect every changed file and the full diff before dispatching one read-only
reviewer using the loaded template, prompt, owning contracts, BASE_SHA/HEAD_SHA,
uncommitted diff and actual checks/limitations. Reviewer must not mutate or
delegate. Evaluate feedback with `receiving-code-review`; verify claims, fix
valid issues, retest and obtain follow-up review for significant changes.
Resolve Critical and Important findings before completion.

Record final invocation/source/projection/publication contracts, baseline
parity, actual outputs, review, rollback and limits in owning docs. Keep Phase
12/operator gates open. Rollback is a reviewed normal revert preserving retained
receipts. Give exact safe inspection commands: standalone help,
`npm run ops:container-test`, `npm run ops:container-security` without output.
Stage only approved files, inspect the staged diff and commit locally to `main`
with `caveman-commit`. No push. Preparing this prompt authorizes no implementation,
staging or commit.
