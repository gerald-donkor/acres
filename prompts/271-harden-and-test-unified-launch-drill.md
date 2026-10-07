# Phase 12K — Harden and test the unified launch-drill runner

## Scope and why this is next

This is the next dependency-safe prompt-sized unit of `docs/build-plan.md`
Phase 12. Planning HEAD is `462a67d662da5406690f893d9b26c99c0690b96a`
(`fix(ops): harden capacity alerting drill`), on clean `main`. Prompts 266–270
have committed restore, deployment, rotation, DoS and capacity-parent runner
hardening. Their unified caller is now the next integration boundary. Resolve
the execution baseline again from code and git; prompts do not prove execution.

Harden `scripts/ops/run-launch-drills.sh` and its existing dossier publication
helper. Code inspection establishes these gaps:

- Value flags accept duplicates and only separate values; whitespace-only paths
  and bare URL query/fragment delimiters are not explicitly rejected.
- Prerequisites and live telemetry are not all checked before earlier stages
  execute. A bad Stage 6 input can be discovered after Stage 3 probes.
- Evidence parents and the run directory are created before the cleanup trap
  and output reservation. Path failures can leave avoidable resources.
- `prepareOutput` deletes an existing regular dossier. `publish` uses rename
  after a destination check, allowing replacement of a concurrent regular file.
- Monitor-mode `wait` lacks `-f`; stopped children can be treated as completed.
  Cleanup suppresses all helper failures and has the same wait issue.
- Help calls dry mode offline/no-live-traffic although static checks can audit
  npm and recovery reconciliation can contact configured services.
- Tests explicitly expect old evidence invalidation, reuse exact output paths
  for successive live scenarios, and inherit the full executable PATH.

Implement early invocation validation, non-destructive exclusive publication,
truthful stage/process supervision, controlled diagnostics and isolated
regressions. Preserve the seven ordered stages, receipt validation, target
identities and dossier schema. Prompt 201 and all operator launch sign-offs
remain open. Approval authorizes repository implementation and isolated tests,
not an unstubbed unified run, live benchmark/probe/restore/reconciliation,
credential rotation, deployment or production approval.

## References read and execution prerequisites

- `AGENTS.md`: §§2–7, phase-control protocol, product contract and §10.
- `docs/build-plan.md`: phase sequence, Phase 12 exit requirements, Phase 12K
  evidence record and committed prompts 266–270.
- `docs/operations.md`: Phase 12K, prompt 233 ownership/publication, prompt 246
  simulation contracts, and prompt 270 process supervision and checks.
- `docs/launch-checklist.md`: §4 unified execution/dossier ownership and §6A
  operator prerequisites. Read the Stage 3/5/6/7 category sections on execution.
- `docs/system-architecture.md`: §11 configuration, health, recovery and signals.
- `docs/security.md`: scope/assumptions and TM-15/16/18/20 evidence boundaries.
- `docs/skills.md`: surface triggers and exact local skill paths.
- `scripts/ops/run-launch-drills.sh` and its complete `.spec.js`.
- `scripts/ops/assemble-launch-dossier.js`: directory/receipt handling,
  `prepareOutput`, `releaseOutput`, `publish`, `assemble`, CLI and exports;
  its complete `.spec.js`. Read the remaining assembler before implementing.
- `scripts/ops/launch-target-evidence.js`: canonical targets, bounded JSON and
  current database/DoS contracts.
- `package.json`: existing root and operational verification scripts.

Before implementation, also read the current child entry points used by each
stage, particularly hardened deployment/rotation/restore/capacity runners,
`run-static-integrity-checks.js`, and `reconcile-storage-objects.js`. Confirm
their actual option forms, default roots, environment inputs and side effects.
Do not invent flags to make forwarding convenient. Verify Bash `wait -f`,
process-group handling, coreutils options and Node exclusive file/link APIs
against installed help/source or official docs before using them.

There is no dedicated installed Bash/coreutils skill, or security-reference
file for standalone Node CLI tooling. Use the loaded general disciplines and
verified local APIs; do not claim framework security guidance covers shell.
No Next/React/Tailwind API, visual reference, screenshot or comp measurement
applies. Numeric receipt limits and timings are existing contracts, not new
measurements or adopted production policy.

## Expected impact and allowed files

Primary implementation and tests:

- `scripts/ops/run-launch-drills.sh`
- `scripts/ops/run-launch-drills.spec.js`
- `scripts/ops/assemble-launch-dossier.js`: output validation/reservation,
  publication and release, plus a small invocation-completeness check if needed.
- `scripts/ops/assemble-launch-dossier.spec.js`

Documentation after verification and review:

- `docs/operations.md`: prompt 271 behavior, exact checks and limitations.
- `docs/build-plan.md`: concise implemented prompt 271 record.
- `docs/launch-checklist.md`: §4 current options, output preservation, modes,
  cleanup and safe inspection instructions; keep historical evidence intact.

Keep the existing helper boundary rather than adding a generic shell framework.
Do not change child implementations, readiness validators, shared evidence
validators, npm scripts/dependencies/lockfile, CI, production templates, server,
client, tenancy, schemas, SLOs or operator approval records. No routes change.

## Implementation requirements

### 1. Validate inputs and prerequisites before stages or evidence creation

Help remains side-effect-free and accurately documents every current option.
For `--output`, `--evidence-dir`, `--caddyfile`, `--compose-file`, `--target-url`,
`--api-url`, `--database-telemetry-file`, support separate and attached `=`
values once each. Reject duplicates across forms, missing/empty/blank/control
values, option-looking separate values, unknown flags and positional input.
Attached paths starting with `-` must remain paths. Existing boolean flags may
remain idempotent. Do not echo rejected values or raw exceptions.

Preserve installation-root semantics: the default root and relative input/output
paths are resolved against the installed repository regardless of caller cwd.
Do not add alternate-target `--cwd` in this unit: several existing stage tools
have installation-bound sources, so that requires a separate contract change.
Invoke installed helpers with absolute paths and argument arrays. Source paths
must not select executable code from an operator-controlled alternate root.

Preserve dry/live conflicts, target/API pairing, HSTS conflict and telemetry-only
rejection. Explicit benchmark/API targets require their live telemetry input
before any stage or service probe begins. Missing/invalid telemetry is a
controlled preflight failure, not permission to run an avoidable benchmark.
Validate the bounded readable regular JSON and existing target/health/freshness
contract at preflight; retain child/completed-window validation as well. Do not
silently tighten or relax the existing allowed sample window.

Canonicalize benchmark with `safeUrl`/`URL.href` and API with `URL.origin` after
requiring a root path. Explicitly reject whitespace-only input, controls,
userinfo, non-HTTP(S), invalid ports and query/fragment delimiters, including
bare `?`/`#`. Retain valid hostname/IPv4/IPv6 targets and current consumer hash
conventions: benchmark hashes href, Stage 6 API/DoS hashes origin, deployment
probe receipt uses its established href identity. Do not globally change hashes.

Check utilities, time generation, readable installed children and required
helper exports before work. Missing machinery fails safely; an evaluated
configuration check still fails its stage rather than being relabeled skipped.
Selected Caddy/Compose paths must be resolvable and safe to pass; content failure
belongs to Stage 3. Do not redesign child validation algorithms.

Validate BOTH the effective dossier destination and evidence directory: unlike
the capacity child, `--evidence-dir` still stores retained stage logs and child
receipts even with explicit `--output`. Keep that behavior and document it.
Reject retained regular files, directories, symlinks/dangling links at the final
output, trailing separators and unusable/non-directory/symlink ancestors before
children or parent creation. Check the nearest existing ancestor first. Preserve
existing parent permissions. Generated default names must remain collision
resistant with the `launch-evidence-dossier-` prefix and `.json` suffix.

### 2. Preserve destinations through preparation and publication

Change the existing helper contract from invalidating/replacing outputs to
requiring an absent destination. A prior dossier always survives byte-for-byte;
failure must not read its old verdict as this invocation's result. Preserve
the exported prepare/release/publish entry points and ownership-token behavior
unless a narrow, tested signature adjustment is essential.

Exclusive locks may remain, with fixed safe errors. A second writer must not
remove the first writer's lock/temp or start children. Locks supplement atomic
publication; they do not protect against a non-cooperating concurrent writer.
Use a verified atomic exclusive link/publication operation that fails if any
destination appears, without overwriting or following it. No direct final write,
rename-over-existing, retained-file deletion, retry-overwrite or shared sweep.

Allocate private 0600 same-directory staging files and 0700 new directories with
umask 077. Register resource ownership/traps before allocation. Handle partial
prepare/mkdir/mktemp failures without leaving owned publication artifacts or
deleting unrelated files. Retain existing evidence/run trees as described below.
Preflight invalid arguments should create no output resources.

Write complete JSON and independently validate the invocation's assembled
dossier before publication/summary. Verify seven exact ordered stage IDs,
finite nonnegative timing, consistent passed/failed totals and stage summaries,
expected overall verdict, root `environment: "drill"`, root
`execution_mode: "simulation"`, selected mode/target/config identity and owned
registered artifact paths. Reuse the real assembler; do not duplicate all child
semantics or weaken receipt checks. Write/serialization exit status is distinct
from parseability. Empty or partial success-shaped output must never publish or
print a passing summary. Preserve complete evaluated FAILED dossiers with exit 1.
Publication/I/O failures produce controlled nonzero results without success.

After publication, `--json` prints exactly that invocation's validated dossier
content, never a retained or raced destination's payload. Keep current human
progress plus JSON behavior; a machine-only stdout redesign is out of scope.
Catch failures reading final counts or printing JSON; never infer success from
an unchecked external replacement. Document the controlled-filesystem assumption
and do not promise protection against an actor with arbitrary directory access.

### 3. Supervise stages and clean only owned transient resources

Keep all seven stages in order and continue collecting evaluated failures so a
normal failed run has a complete dossier. Stage process exit and receipt validity
both matter. A nonzero/signal child with passing JSON cannot pass. A zero exit
with absent/invalid JSON cannot pass. Print completion as pending receipt checks
until the validated final verdict, as the current runner does.

Use installed Bash `wait -f` in main and cleanup where monitor mode is active.
Retain ownership until a child group terminates, including SIGSTOP/continued
children. INT/TERM/HUP stop the active owned group with bounded termination,
escalate only that owned group if needed, and reap it before releasing transient
resources. No promise covers SIGKILL, host loss or descendants that deliberately
detach into a new group. Ensure no later stage begins after interruption.

Remove only owned publication temp/lock and temporary control resources. Retain
private run directories, logs and receipts for diagnosis and dossier references,
including failed/interrupted runs. Do not remove other run trees or earlier
dossiers. Resource-cleanup failure must not be hidden behind exit 0 or a passing
summary. Distinguish failure to release an owned resource from finding an
unowned/missing resource, and preserve intentional signal statuses when cleanup
succeeds. No trap recursion or loss of original failure status.

Keep diagnostics fixed and safe; verbose output identifies stage IDs rather than
printing command arguments. Private stage logs may contain child diagnostics;
do not copy them into console, JSON summaries or errors. Retain registered
artifact path references as the existing contract requires; this is distinct
from echoing rejected values or arbitrary payloads.

### 4. Preserve mode, evidence and operator boundaries

Secret rotation always receives `--dry-run`; reconciliation always receives
`--dry-run` and remains read-only but service-dependent. Restore dry preflight
still lacks successful recovery evidence. Never synthesize passing recovery or
skip missing evidence to produce a 7/7 result.

Dry mode keeps the current child selection and simulation contracts. Correct
help/docs to say dry-run disables supported child mutations/traffic but is NOT
a fully isolated whole-run mode: static integrity can call npm, reconciliation
can access configured infrastructure, and only stubbed tests are isolated.
Do not introduce a new offline mode or silently change the stages.

Default non-dry/no-explicit-target execution retains existing Stage 6 dry-child
selection and default-drill failure qualification. Explicit target execution
forwards normalized targets, telemetry and selected Caddy/Compose/HSTS values
through verified options. A targeted run is still a drill; 7/7 does not approve
any production category. Keep the exact child receipt names, existing byte caps,
timestamp windows, strict baseline/compliance validation and checked-field
projection. Root schema stays `1.0.0`; simulation must never become live approval.

### 5. Expand isolated actual-process and helper tests

Use `node:test`, actual Bash/Node runner/helper and disposable installations.
Allowlist environment and executable tools; do not inherit service credentials,
proxy settings, NODE_OPTIONS/BASH_ENV or network-capable fallback programs.
Copy the verified helper dependency closure. Children remain deterministic stubs
and may not delegate to real curl/Docker/npm/PostgreSQL/Garage. Tests with fake
live URLs/telemetry prove invocation binding, not live service behavior.

Every normal run needs a fresh absent output path. Replace legacy tests expecting
deletion or reuse; test retained outputs as rejection/preservation cases. Cover:

- Help, attached/separate options, duplicate combinations, bad blanks/controls,
  unknown/positional input, all dry/live conflicts and telemetry pairing.
- Caller cwd independence, spaces/quotes/dash-leading paths, safe canonical URL
  forms and distinct existing hash conventions.
- Missing tools/helpers, bad telemetry shapes/limits/freshness/health/target and
  invalid output/evidence parents; no child calls or avoidable creation.
- Retained regular files/directories/links/dangling links and foreign lock/temp
  preservation; unchanged permissions of existing parents and private new files.
- Complete successful/failed fixtures, all stage failure contracts already
  covered, default-drill classification, target/config forwarding and mandatory
  rotation/reconcile dry flags. Private diagnostic canaries stay out of stdout,
  stderr and dossier summaries; expected registered paths remain.
- Empty/partial assembler output, serializer/write/read/validation failures and
  atomic publication collisions with regular files, directories and links.
  Inject helper I/O failures directly where appropriate.
- Concurrent defaults and competing exact destinations; no cross-run artifact
  selection, retained evidence deletion or success inferred from another run.
- INT/TERM/HUP, stopped children, nested stage descendants and bounded TERM
  resistance; wait for observed milestones rather than long arbitrary sleeps.
  Verify termination before resource release, no later stages, owned temp/lock
  removal and retained logs. Clean fixture processes even on assertion failure.
- Real assembler consumption of the existing producer-shaped receipts. Keep
  existing readiness/launch consumer coverage; no weakened fixtures/validators.

Do not run the real unified orchestrator even with `--dry-run`. Safe user
inspection remains its `--help` and the isolated npm test suite. If a fixture
copies real children, prove network/service execution is forbidden and keep it
within these authorized isolated tests.

## SKILLS USED

- `deployment-pipeline-design`: Ordered stage gates, truthful drill qualification
  and separation from operator promotion/sign-off.
- `secrets-management`: Private logs/resources, minimal safe diagnostics and
  unchanged credential-mutation boundaries.
- `security-best-practices`: Loaded general secure-default discipline for
  untrusted CLI/evidence inputs; no matching standalone CLI reference exists.
- `error-handling-patterns`: Early validation, independent exits/receipts,
  failure classification, ownership cleanup and exclusive publication.
- `javascript-testing-patterns`: Node helper contracts, isolated process
  fixtures and failure/race/signal regressions with the existing harness.
- `e2e-testing-patterns`: Deterministic stage integration and fixture teardown;
  no browser or production journey is introduced.
- `requesting-code-review`: Independent reviewer after self-verification.
- `receiving-code-review`: Verify feedback, fix valid issues and re-review
  significant publication/process changes.
- `caveman-commit`: Required local Conventional Commit message; no push.

This bounded Phase 12 step does not change architecture, Nest modules, database
SQL, HTTP contracts, CI configuration, alerts/Grafana, SAST rules, threat-model
topology or UI. Their broader phase skills are not triggered. Re-evaluate if
implementation exposes a necessary scope change; do not expand silently.

## Verification, review, documentation and completion

Re-read the approved prompt and every listed skill before code. Record BASE_SHA,
preserve unrelated changes and inspect the complete final diff. Run:

```bash
bash -n scripts/ops/run-launch-drills.sh
node --check scripts/ops/assemble-launch-dossier.js
node --check scripts/ops/run-launch-drills.spec.js
node --check scripts/ops/assemble-launch-dossier.spec.js
npm run ops:launch-drill-test
npm run ops:capacity-alerting-test
npm run ops:deployment-test
npm run ops:rotation-test
npm run ops:restore-drill-test
npm run ops:readiness-test
npm run ops:launch-readiness-test
npm run ops:templates
npm run ops:templates-test
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Run typecheck/build sequentially because Next generates shared type files.
Use installed Prettier with repository conventions on changed JavaScript and
this prompt; format new documentation sections without unrelated whole-file
rewrites. Inspect/format inline JavaScript separately if changed. Do not claim
a shell formatter pass without an installed formatter. Quote actual exits and
concise real output, not expected results or baseline counts.

The planning record for prompt 270 reports `ops:check` stopping at production
audit (`37 vulnerabilities (9 moderate, 26 high, 2 critical)`). This is historical
context, not a current measurement. Run the gate and report its actual result.
Do not remove/weaken audit or upgrade dependencies incidentally. If the aggregate
stops early, run affected isolated suites independently and name stages that
were not reached. Do not claim Phase 12 completion with unresolved critical
findings. Treat subprocess sandbox denial separately from actual test failures;
follow the environment's approval policy for necessary isolated verification.

After self-verification, dispatch the mandated reviewer subagent with approved
requirements, BASE_SHA/HEAD_SHA, actual diff, checked commands, destination
compatibility change and no-live authorization limit. Verify findings against
code using `receiving-code-review`; fix valid issues and re-test. Publication or
process-supervision fixes require follow-up independent review.

Only after review, record the real implementation and checks in the owning docs.
Replace present-tense output-invalidation/rename promises with preservation and
exclusive publication; leave historical prompt-233 outputs as history. Explain
that operators now select an absent dossier path to regenerate evidence. Update
safe inspection instructions and retained-tree/lock cleanup limits. Append the
concise build-plan record without approving launch or inventing operator values.

Finish by staging only approved changes, inspecting the staged diff and committing
locally on `main` with `caveman-commit`. Include this approved prompt in that
implementation commit. No push. Give the local commit, real checks and exact safe
inspection commands:

```bash
bash scripts/ops/run-launch-drills.sh --help
npm run ops:launch-drill-test
```

Rollback is a normal revert of this bounded commit after review; preserve already
published evidence. Restoring the former runner also restores its replacement
behavior, so do not recommend reuse of retained destinations as a safe rollback.
Phase 12 and prompt 201 remain open until separate real evidence and operator
sign-off satisfy the existing exit gates.
