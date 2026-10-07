# Phase 12K — Harden and test static-integrity evidence publication

## Scope and why this is next

This is the next dependency-safe prompt-sized unit of `docs/build-plan.md`
Phase 12, after committed unified-runner hardening. Planning HEAD is
`87ebe72f6e8ec76092cef256de9f920df9aff46b` (`fix(ops): harden unified launch drill`)
on clean `main`. Resolve the execution baseline again from code and git history;
a written prompt is not execution evidence.

Prompts 260–262 hardened the three static-check children, and prompt 271 hardened
their unified caller. The intermediate producer,
`scripts/ops/run-static-integrity-checks.js`, still has concrete gaps:

- `parseArgs` accepts whitespace/control-containing output strings, lacks help
  and attached options, and does not preflight destination/parent suitability.
- `main` runs every child before discovering an occupied or unusable output.
- `writeEvidence` recursively creates parents with default permissions, writes
  staging without exclusive creation, then renames over an existing destination.
- Failed staging cleanup is suppressed; arbitrary supplied evidence is serialized
  without a complete success/failed receipt consistency check or read-back.
- `runChecks` admits any numeric status and does not explicitly reject a signal
  accompanying a success-shaped injected result.
- The last existing spec invokes the actual runner against a directory output,
  which runs the real operational children before its expected write failure.
  CLI tests inherit the caller environment. The suite has no dedicated root
  script and is absent from `ops:check`.

Implement strict early invocation validation, private exclusive publication,
consistent complete receipts, safe errors, and isolated actual-process tests.
Preserve the three ordered checks and the Stage 1 consumer contract. Phase 12,
prompt 201, critical dependency findings and operator sign-offs remain open.

Approval authorizes repository changes, isolated fixtures and the listed normal
repository checks. It does not authorize an unstubbed static-evidence runner,
unified drill, live benchmark/probe/restore/reconciliation, deployment,
credential mutation, production evidence approval or push.

## References read and implementation prerequisites

- `AGENTS.md`: phase control, §§2–7, product/stack contract and §10.
- `docs/build-plan.md`: phase protocol, Phase 12 requirements, sequence gates,
  and committed prompts 260–271.
- `docs/operations.md`: topology/redaction, prompt 187 Stage 1 contract,
  prompts 260–262 children, and prompt 271 publication/consumer boundaries.
- `docs/launch-checklist.md`: §4 Stage 1 receipts, unified invocation ownership,
  safe inspection and the separate operator acceptance requirements.
- `docs/system-architecture.md`: §11 configuration, diagnostics and launch gates.
- `docs/security.md`: §2 scope/assumptions and operational evidence boundaries.
- `docs/skills.md`: exact vendored paths, triggers and bounded skill selection.
- `scripts/ops/run-static-integrity-checks.js` and its complete existing spec.
- `scripts/ops/check-production-templates.sh`, `check-docker-runtime.sh` and
  `scan-secrets.sh`: actual fixed invocation, roots and side effects.
- `scripts/ops/run-launch-drills.sh`: prerequisite list and `stage_static`.
- `scripts/ops/run-launch-drills.spec.js`: disposable installation, copied
  static validator, allowlisted executable environment and child receipt stubs.
- `scripts/ops/assemble-launch-dossier.js`: `validateStaticEvidence` import and
  Stage 1 baseline projection.
- `scripts/ops/check-launch-readiness.js`: `validCaddyStaticEvidence` and import;
  its spec's `runChecks` fixtures and copied-module producer test.
- `scripts/ops/check-production-templates.js`: launch/static integration markers.
- `package.json`: available verification commands and aggregate ordering.

Re-read relevant complete implementations/specs before editing. Importing the
producer as a validator must remain side-effect free: no child, path preflight,
filesystem mutation or executable discovery at module import time. Existing
fixtures copy this module without its real children.

Verify any changed Node fs/path/child-process/CLI API against installed sources,
types or official documentation before using it, especially exclusive opens,
hard-link collision behavior, fd ownership/close failure and symlink inspection.
No dedicated installed standalone Node CLI publication skill or matching
security-reference file exists; use the loaded general disciplines with verified
Node APIs. No Next/React/Tailwind API or visual surface changes, so no comp,
screenshot or pixel measurement applies. Existing receipt counts and timestamp
format are contracts, not new measurements or chosen production policy.

## Expected impact and allowed files

Primary implementation:

- `scripts/ops/run-static-integrity-checks.js`
- `scripts/ops/run-static-integrity-checks.spec.js`
- `package.json`: add `ops:static-integrity-test` as
  `node --test scripts/ops/run-static-integrity-checks.spec.js`; insert that
  isolated suite into `ops:check` before the production audit, without adding
  execution of the real evidence runner.

Integration tests, only as needed:

- `scripts/ops/run-launch-drills.spec.js`: actual static producer with three
  stubbed children consumed by the real dossier assembler.
- `scripts/ops/check-launch-readiness.spec.js`: narrow producer/validator
  compatibility assertions or fixture dependency closure, without weakening
  any readiness rule or rewriting unrelated tests.

Documentation after verification and review:

- `docs/operations.md`: prompt 272 behavior, real checks and limitations.
- `docs/launch-checklist.md`: current Stage 1 output preservation, safe help/test
  inspection and distinction between static evidence and operator acceptance.
- `docs/build-plan.md`: concise implementation/verification record within Phase 12.
- This approved prompt, included in the eventual implementation commit.

Keep production consumers and the unified shell invocation unchanged. Prefer a
self-contained producer so disposable copied-module fixtures keep working. Do
not introduce a shared publication framework or modify the dossier helper to
reuse it. No HTTP route, UI, database, dependency, CI workflow, alert, SAST policy,
operator value or secret changes.

## Implementation requirements

### 1. Validate the invocation before running any child

Support exactly one output through `--output <file>`, `-o <file>`,
`--output=<file>` or `-o=<file>`. Add side-effect-free `--help`/`-h` with usage,
the three check IDs, absent-output requirement and diagnostic limitations.
Reject duplicate aliases/forms, missing/empty/whitespace-only/control values,
unknown options and positional input. A standalone help flag exits 0; reject
mixed help/execution options rather than silently discarding an invocation.
Separate values beginning with `-` remain ambiguous and reject; attached forms
allow legitimate dash-leading names. Permit ordinary spaces/quotes in paths
without interpreting them as shell syntax. Never echo rejected arguments.

Preserve current relative-output semantics: resolve against the caller's cwd.
Children still run from the installed repository root regardless of caller cwd.
Keep `parseArgs` returning the resolved path for valid execution inputs unless
a narrowly justified adjustment is necessary; preserve existing named exports
and `runChecks(execute)` injection. Handle help without import-time work.

Before child calls or mkdir/staging, inspect the entire existing parent chain
and nearest existing ancestor with symlink-aware checks. Require an absent
final destination. Reject regular files, directories, symlinks and dangling
links at the output, trailing separators, non-directory/symlink ancestors and
an unusable parent. Existing evidence is preserved byte-for-byte. Permission
preflight is advisory; filesystem operations must still handle permission/race
failures. Do not leave newly created output resources on invocation rejection.

Preflight the installed three child script files and Bash availability before
work; use fixed arguments and no shell string interpolation. Do not execute a
child merely to discover whether it exists. Child validation algorithms and
their transitive prerequisites remain each child's responsibility: an ordinary
evaluated child failure is recorded and later checks still run.

### 2. Produce complete, consistent success and failure receipts

Keep the exact order and IDs:

1. `production_templates` → `scripts/ops/check-production-templates.sh`
2. `docker_runtime` → `scripts/ops/check-docker-runtime.sh`
3. `secret_defaults` → `scripts/ops/scan-secrets.sh`

Preserve `drill_type: "static_integrity_verification"`, ISO UTC milliseconds
timestamp, `status: "success" | "failed"`, boolean `valid`, three total checks,
consistent passed/failed counts and ordered `checks`. Each normal check has
`id`, boolean `passed` and an integer exit code in the installed Node process
status range. Only an error-free, unsignalled zero exit may pass. A thrown,
missing/malformed, signalled or spawn-error result fails safely with the existing
generic `failureKind: "spawn_failed"` and null exit code. No child stdout,
stderr, error message, command string, environment or raw path enters a receipt.
Do not execute extra checks or retry a failing child to obtain success.

Keep the exported `validateStaticEvidence` acceptance meaning and return shape:
`{ valid, failedCheckId }` recognizes successful launch-compatible evidence;
consistent failed evidence must still return `valid: false`. Preserve failing
check ID reporting used by existing fixtures. Add an internal/general complete
receipt validator if needed so publication can validate a truthful failed
receipt without converting it to accepted launch evidence. Reject missing,
duplicate/reordered IDs, invalid exit/pass/failure-kind combinations, malformed
timestamps, contradictory counts/verdicts and wrong field types. Project only
the fixed producer fields when writing; caller-supplied extra payloads must not
be serialized as diagnostic evidence. Reconcile optional fields with genuine
existing fixtures before deciding which fields are mandatory.

Keep synchronous `runChecks(execute)` behavior for existing consumers. This
step does not introduce an async orchestration API, process-group supervisor,
new timeout policy or cancellation guarantee. A parent terminated during a
synchronous child may not supervise that child's descendants; document this
limit and keep the unified caller's existing owned-group supervision intact.

### 3. Publish once, privately, without replacing any destination

Recheck destination/ancestors before creation/publication. Create only missing
directories with private 0700 permissions; preserve existing parent permissions.
Do not change the process umask globally as an unscoped import/helper side effect.
Allocate random same-directory staging with exclusive creation and 0600 mode.
Record ownership immediately after successful open, including before close;
close/write/serialization/read/cleanup failures must not orphan avoidable owned
resources or disappear behind success.

Write the complete fixed-field receipt, close it, independently read it back
and verify equality/consistency before publishing. Invalid or partial
success-shaped output must never publish. Use verified atomic exclusive
publication, such as same-filesystem hard linking, that fails if any destination
appears. No rename-over-existing, direct final write, retained-file removal,
retry-overwrite or shared cleanup sweep. Filesystems lacking the operation fail
safely rather than falling back to replacement. Handle both success and
evaluated failure receipts: a valid failed receipt publishes and CLI exits 1.

No pre-execution reservation is required in this bounded step. Two overlapping
writers may both execute read-only checks; publication guarantees at most one
wins at a destination. The loser must preserve the winner, exit nonzero and
remove only its owned staging. State this explicitly rather than promising
that every concurrent invocation is rejected before child execution.

Cleanup removes only resources allocated by this invocation. Preserve foreign
temps and every published receipt, including after an output/cleanup failure.
If publication succeeds but staging cleanup fails, keep the completed final
receipt, return nonzero and print a fixed failure message; never retract it or
announce overall success. New empty directories may remain after a later
evaluated execution/publication failure; document that behavior. No recursive
removal of evidence trees is allowed. Catchable JavaScript operation failures
must be handled; do not promise cleanup after abrupt process termination,
SIGKILL, host loss or arbitrary directory modification by another actor.

`writeEvidence` must enforce these invariants when called directly, not merely
rely on CLI checks. `main` reports a controlled nonzero result for preflight,
execution, receipt, I/O, publication or console-output failure. Keep per-check
progress fixed to IDs/verdicts; avoid printing a passing run verdict before
publication and cleanup finish. Diagnostics contain no rejected values or raw
exceptions. Do not reread a raced final destination to determine this
invocation's result. Controlled installed scripts, executables and filesystem
access remain prerequisites, not a cryptographic provenance guarantee.

### 4. Replace unsafe tests with isolated producer/process integration

Use existing `node:test` without installing a test framework. Separate pure
contract/helper tests from a copied actual CLI in a disposable installation
containing only the producer and three deterministic child stubs. Allowlist
environment and executable PATH: never inherit service credentials, proxy
configuration, NODE_OPTIONS, BASH_ENV/ENV or fallback network-capable tools.
Invoke Node through `process.execPath`; provide verified Bash and only the
minimal utilities actually required by stubs. Stubs never call real npm,
Docker, curl, PostgreSQL, Garage or repository check children. Use marker logs
to prove order, roots, no child execution and race milestones.

Remove the legacy real-runner/directory failure test before running the full
suite. Existing CLI negative tests must also use explicit safe environments.
Do not run a pre-change test that executes the unstubbed runner to establish a
baseline. Unit dependency injection alone is insufficient for CLI isolation.

Cover these observable behaviors:

- Side-effect-free import and help; separate/attached aliases; duplicates,
  unknown/positional/mixed-help input; absent, blank, control and dash-leading
  values; paths with spaces/quotes and caller-cwd independence.
- Missing Bash/children; retained regular/directory/link/dangling destinations;
  symlink/non-directory/inaccessible ancestors; trailing separators. Assert
  no child markers, preserved bytes and no avoidable allocation on rejection.
- Fixed ordered execution; zero and each nonzero child; throw, spawn failure,
  signal and malformed injected status; all later checks run after ordinary
  evaluated failure. Canaries never appear in console or serialized output.
- Complete passed and failed receipts; inconsistent status/count/type/ID/exit
  combinations; malformed timestamps; arbitrary extra diagnostic payloads.
  Preserve existing success-validator/failing-ID compatibility.
- 0600 staging/final and 0700 new directories, including permissive caller
  umask; unchanged existing-parent permissions; no executable interpretation
  of paths; read-back and direct `writeEvidence` validation.
- Injected exclusive-open, write, close, read, serialization, link and unlink
  failures. Own staging/descriptor ownership survives partial operations so
  cleanup can retry; cleanup failure cannot yield exit 0. Restore mocks even
  when assertions fail; use dependency injection where practical.
- A retained/racing file, directory or link appears after preflight and before
  publication; competing actual CLI writers at one destination. Exactly one
  complete receipt wins; no overwrites, foreign cleanup or success borrowed
  from the other writer. Observe deterministic markers instead of long sleeps.
- Actual producer receipts accepted/rejected by the real Stage 1 assembler
  and `validateStaticEvidence`/readiness consumer. Prefer one actual unified
  fixture with just the static producer substituted for its stub and all
  children still deterministic; assert failed child evidence cannot produce
  a passing Stage 1 baseline. Retain all existing consumer gates.
- The dedicated root test script and `ops:check` integration are correct and
  do not introduce execution of the real evidence producer.

Process fixtures must have bounded test timeouts and teardown even on assertion
failure. Permission-denial tests must remain meaningful under the current user;
use deterministic injected errors if host privilege would bypass chmod.

## SKILLS USED

- `deployment-pipeline-design`: Ordered static gate/receipt semantics and
  separation of verification from operator promotion and launch approval.
- `secrets-management`: Private evidence resources, suppressed child diagnostics
  and credential-free fixture environments.
- `security-best-practices`: General secure-default discipline for CLI inputs
  and publication; no standalone Node CLI reference exists in this skill.
- `error-handling-patterns`: Early preflight, truthful failed receipts,
  ownership/cleanup, independent serialization checks and fixed errors.
- `javascript-testing-patterns`: Contract/unit/helper tests and isolated Node
  process fixtures using the existing test framework.
- `e2e-testing-patterns`: Deterministic producer-to-dossier integration and
  fixture teardown; no browser or production journey is introduced.
- `requesting-code-review`: Independent reviewer after self-verification.
- `receiving-code-review`: Verify feedback and fix/re-test valid findings;
  follow-up review for significant publication or compatibility changes.
- `caveman-commit`: Required local Conventional Commit message; no push.

This bounded step changes no architecture/topology, Nest module, database SQL,
HTTP contract, CI configuration, scanner rule, alert/Grafana panel, threat-model
topology or UI. Their broader Phase 12 skills are not triggered. Re-evaluate
if a necessary implementation change crosses one of those surfaces; do not
expand silently.

## Verification, review and completion

Re-read the approved prompt and every named skill before code. Record BASE_SHA,
preserve unrelated work and inspect the final complete diff. After replacing
the unsafe fixture, run:

```bash
node --check scripts/ops/run-static-integrity-checks.js
node --check scripts/ops/run-static-integrity-checks.spec.js
node scripts/ops/run-static-integrity-checks.js --help
npm run ops:static-integrity-test
npm run ops:launch-drill-test
npm run ops:readiness-test
npm run ops:launch-readiness-test
npm run ops:templates-test
npm run ops:docker-runtime-test
npm run ops:scan-secrets-test
npm run ops:templates
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

`ops:static-integrity-test` is new and must be added before it is invoked.
Typecheck and build run sequentially because Next generates shared type files.
Use installed Prettier with repository conventions on changed JavaScript,
package JSON and this prompt; format new documentation regions without unrelated
whole-file rewrites. Do not claim formatting of untouched baseline files or a
shell formatter pass. Quote actual exits and concise real output.

Prompt 271 recorded `ops:check` exiting at the unchanged production audit:
`37 vulnerabilities (9 moderate, 26 high, 2 critical)`. That is historical context,
not a current measurement. Run/report the real gate; do not remove/weaken it,
incidentally upgrade dependencies or declare Phase 12 complete with critical
findings. If it stops early, distinguish later stages not reached from failures
and use the listed isolated suites for this change. Treat sandbox subprocess
denials separately from real failures; follow environment approval policy for
necessary hermetic verification.

After self-verification, dispatch the mandated read-only reviewer subagent using
the loaded template, with approved requirements, BASE_SHA/HEAD_SHA, actual
uncommitted diff, verified commands, output compatibility change and no-live
authorization boundary. The reviewer must not mutate the checkout or delegate.
Evaluate feedback against code with `receiving-code-review`, fix valid findings
and re-test; significant publication/contract fixes require follow-up review.

Only after review, update owning docs with implemented behavior, actual output,
limitations and absent-destination regeneration instructions. Preserve prompt
187's historical record and identify the current superseding publication
contract. Static checks remain narrower than deployed system assurance; neither
a static receipt nor the unified dossier approves production categories.

Stage only approved files, inspect the staged diff and commit locally on `main`
using `caveman-commit`, including this approved prompt. Do not push. Give the
commit, actual checks and exact safe inspection commands from the repo root:

```bash
node scripts/ops/run-static-integrity-checks.js --help
npm run ops:static-integrity-test
```

Rollback is a normal reviewed revert of this commit; preserve already published
evidence. The former producer replaces destinations and its old test can run
real children, so rollback does not make receipt reuse or that test safe. Phase
12/prompt 201 and all operator evidence/sign-off gates remain unresolved.
