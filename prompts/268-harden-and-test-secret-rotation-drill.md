# Phase 12K — Harden and test the secret-rotation rehearsal runner

## Scope and why this is next

Implement the next dependency-safe operations unit in `docs/build-plan.md`
Phase 12. The repository is clean at planning time; HEAD is `00f5659`
(`fix(ops): harden deployment drill`). Commits `8985e2b`, `9ea3ff7`,
`831d7ff`, and `00f5659` implement restore-drill, restore, backup, and
deployment-runner hardening. Resolve those facts from code/git again at execution,
not from the presence of their prompt files.

The adjacent `scripts/ops/run-secret-rotation-drill.sh` still has concrete gaps:
it accepts only separate value options and silently replaces duplicate values;
it creates output directories before validation/preflights; it prints an
unvalidated API URL; its Valkey ping is not explicitly bounded and accepts any
output containing `PONG`; default filenames collide within a second; and its
inline Node success/failure paths write directly over the destination. The
failure path copies arbitrary `err.message` into evidence and suppresses a
secondary write failure. Its existing isolated suite covers rehearsal shape
but does not close these CLI, observation, publication, or privacy gaps.

Harden this runner and expand its actual-process contracts, preserving the
seven existing mock/algorithm exercises and the simulation-only evidence
boundary. This is a repository patch, not a live rotation exercise. Phase 12
and prompt 201 remain open for authentic production evidence, security gates,
and operator approval.

## References read and required execution reads

- `AGENTS.md`: phase-control, prompt, verification, review and local-commit rules.
- `docs/build-plan.md`: Phase 12, sequence gates, committed prompts 264–267.
- `docs/operations.md`: secret-rotation runbook, simulation qualifications and
  prompt 267 runner/publication/check record.
- `docs/launch-checklist.md`: Category 3, rehearsal versus independent live
  operator evidence and seven-class/seven-step receipt contract.
- `docs/skills.md`: local skill convention and bounded phase skill selection.
- `scripts/ops/run-secret-rotation-drill.sh` and
  `scripts/ops/run-secret-rotation-drill.spec.js`: current implementation/tests.
- `scripts/ops/launch-target-evidence.js`: verified `safeUrl` helper.
- `scripts/ops/run-launch-drills.sh`: Stage 5 always forwards `--dry-run`,
  `--evidence-dir`, and explicit `secret-rotation-evidence-receipt.json`.
- `scripts/ops/assemble-launch-dossier.js`: Stage 5 consumer and simulation
  baseline. Its existing receipt fields must remain compatible.
- `scripts/ops/check-launch-readiness.js`: existing validator/export names;
  re-read the complete `validateSecretRotationReport` implementation before
  writing consumer assertions.
- `package.json`: existing `ops:rotation-test`, `ops:check`, root check scripts.

Before implementation, read the adjacent hardened deployment runner and its
tests for repository-established CLI, origin and exclusive publication patterns.
Verify any new Bash/Node/coreutils/curl/PostgreSQL/Valkey flags against installed
source/help/manpages or official documentation. No dedicated Bash/Valkey skill
is installed; those APIs require direct verification. Do not infer flags from
the generic skills. No Next/React/Tailwind API or visual surface changes here;
static comps and pixel measurements do not apply. Operational limits below are
contract choices, not measurements from reference images.

## Expected impact and allowed files

Primary edits:

- `scripts/ops/run-secret-rotation-drill.sh`
- `scripts/ops/run-secret-rotation-drill.spec.js`
- This approved prompt, if an execution clarification must be recorded.
- `docs/operations.md`: implemented CLI/probe/publication/privacy behavior,
  actual checks and limitations.
- `docs/build-plan.md`: append the implemented prompt 268 record after execution.
- `docs/launch-checklist.md`: narrow Category 3 usage clarification if needed.

Only add focused Stage 5 compatibility assertions to
`scripts/ops/run-launch-drills.spec.js` or
`scripts/ops/assemble-launch-dossier.spec.js` if necessary. The existing npm
scripts already include the runner; no new script or dependency is needed.
No HTTP routes, tenant data, application authentication, schema, production
templates, CI workflow, monitoring policy or runtime topology changes.

## Implementation requirements

### 1. Validate invocation before rehearsal side effects

Keep `--help`/`-h` usable without running preflights, probes or creating output.
Support attached and separate forms for `--evidence-dir`, `--evidence-file`,
`--api-url`, `--pghost`, `--pgport`, `--valkey-host`, `--valkey-port`; add
`--cwd <directory>` / `--cwd=<directory>` following the adjacent runner.

- Default cwd is the installation repository root, independent of caller cwd.
  Resolve an explicit relative cwd against the invocation directory; canonicalize
  and validate the target, then resolve relative evidence paths against it.
- Anchor child executables/helpers to the installation repository. Run children
  in the target directory and pass `--cwd=<target>` to the two shell preflights.
  Verify the volume verifier's existing invocation/cwd behavior before changing
  forwarding; do not invent an option it does not accept.
- Reject duplicate value options across attached/separate forms, missing/empty/
  whitespace-only values, option-looking separate arguments, positional input,
  and unknown flags with controlled diagnostics that never echo supplied input.
  Boolean `--dry-run` remains idempotent. Attached path values support spaces
  and leading dashes. Explicit file continues to override evidence-dir for the
  final destination; avoid creating an unused evidence directory.
- Validate required utilities and anchored local child files before execution.
  Check optional tool prerequisites only for selected probe branches. Missing
  optional Valkey CLI retains the existing unavailable observation fallback.
- Validate API origin through existing `safeUrl` plus a root-path restriction.
  Reject embedded credentials, query, fragment, control characters, non-HTTP(S)
  protocols and nonroot paths before printing or probing. Canonicalize the
  accepted origin for `/health` construction, avoiding double slashes.
- Validate both ports as bounded decimal integers 1–65535; accept leading zeros
  as decimal, reject overflow before arithmetic, and normalize for probes.
  Validate nonblank hosts and PostgreSQL user/database fields, reject controls
  and option-like host fields without printing rejected values. Preserve current
  documented defaults and do not add broader credential fallbacks.
- Validate evidence destination absence and writable parent chain before child
  calls/probes or directory creation. Existing files, directories and symlinks,
  including dangling links, must fail without modification.
- Any baseline child failure stops the runner, preserves its failure status
  where practical, and emits no successful receipt or success summary.

### 2. Keep reachability observations bounded and honest

Preserve nonblocking observation failure: offline/unavailable observations
do not fail otherwise valid local algorithm rehearsal and never upgrade it
to live evidence. `--dry-run` remains metadata; it does not promise no probes.

- PostgreSQL observation remains conditional on `PGPASSWORD` or
  `POSTGRES_PASSWORD`. Validate the first nonempty supported password without
  logging it; reject whitespace-only selected credentials. If propagation is
  needed, use environment only. `pg_isready` reports server availability,
  not password authentication or actual role rotation; say so in output/docs.
  Use its verified bounded timeout and connection fields. Do not add SQL or
  live password-changing commands.
- Bound the Valkey ping externally if the installed CLI cannot supply a
  verified suitable deadline. Require command success and exactly `PONG` after
  ordinary surrounding whitespace, not a substring match. Error output, extra
  lines, malformed replies and timeout leave `live_valkey: false`. Do not add
  Valkey password sources, auth mutation, CONFIG SET or queue writes; preserve
  this observation's current unauthenticated limitation.
- Keep the HTTP probe bounded, suppress raw response/error content, and use
  the validated origin. Preserve its current successful-request reachability
  meaning; do not turn it into a stronger readiness or rotation claim.
- Print unavailable/skipped versus reachable accurately. Existing topology
  booleans remain observation metadata. Every receipt remains
  `execution_mode: "simulation"` with either dry-run state and with all
  observations successful. Never imply SMTP/Grafana were independently rotated.

### 3. Publish private complete receipts exclusively

Preserve receipt drill type, timestamps accepted by existing validators,
dry-run state, topology, tested class names, seven step fields and statuses.
Preserve explicit Stage 5 destination compatibility. Keep the local algorithm
semantics; a small reorganization to separate evaluation from publication is
allowed, a cryptographic/state-machine redesign is not.

- Generate collision-resistant default names retaining
  `secret-rotation-evidence-`, timestamp and `.json`, e.g. PID plus UUID.
- Create new output directories privately without changing existing directory
  permissions. Write complete JSON into a uniquely owned temporary file beside
  the destination, mode 0600, then atomically publish with exclusive/no-replace
  semantics. Follow the verified temp plus exclusive-link pattern or a verified
  Node equivalent; directory races must not redirect publication into a directory.
- A pre-existing or concurrently inserted destination is preserved; publication
  returns nonzero. Never publish partial JSON, overwrite a receipt, or print the
  final success summary if publication failed.
- Clean up only this run's temporary resources on normal exit, expected failure
  and catchable interruption. Do not remove unrelated temp files or destinations.
- Separate algorithm failures from I/O failures. Preserve a failed simulation
  receipt when algorithm evaluation fails, using the same publication guarantees;
  if publication also fails, report a controlled failure rather than silently
  ignoring it or retrying with a direct write to the final path.
- Replace arbitrary exception-message copying/logging with a fixed generic
  algorithm-failure message or an explicitly closed set of safe local messages.
  Unknown/non-Error exceptions and injected messages containing credential
  canaries must not escape into stdout, stderr or failed receipts. Keep failure
  status nonzero and successful validation unchanged. Update the existing
  injected-algorithm-failure assertion to the new safe public contract.

### 4. Expand actual-runner contract coverage

Keep `node:test`, disposable repositories and execution of the real shell/inline
Node code. Use explicit allowlisted environments, stub every service/preflight
child, and inherit no real credentials. Fixture stubs may compare fake passwords
internally; child-call logs must not serialize them. Tests contact no service and
perform no credential rotation. Cover:

- Help aliases, every option form, all duplicate combinations, missing/blank/
  flag-like values, unknown/positional input and fixed private diagnostics.
- Installation-root defaults from another caller cwd; absolute/relative target,
  invalid target, spaced/dash-leading paths, exact child cwd/forwarding.
- Missing prerequisite/child, invalid URLs/hosts/ports/output parent/destination
  fail before children, probes and output creation. Test decimal leading zeros
  and oversized numeric input, and canary absence from all diagnostic streams.
- Baseline child failure: later children/probes do not run, no success receipt.
- No-credential PostgreSQL skip, both supported password sources, blank
  credential rejection, missing selected client, successful/failed/time-limited
  readiness and truthful availability metadata. No SQL/rotation command allowed.
- Valkey CLI missing, exact PONG, nonzero exit with PONG, substring/multiline/error
  replies and deterministic timeout; HTTP success/failure and bounded arguments.
- Both dry-run states and successful observation metadata remain simulation;
  success receipts pass `validateSecretRotationReport`, and `requireLive: true`
  rejects them. Existing algorithm failure stays simulation and is nonzero.
- Prior file/directory/symlink preservation including dangling links; concurrent
  destination insertion; unique default names; receipt mode 0600; write/link
  failures and interruption cleanup. Use bounded explicit coordination for races
  and signals, not timing-only sleeps.
- Arbitrary injected Error/non-Error failure messages cannot leak; failed
  receipts are complete and retained evidence is untouched even on failure.
- Existing Stage 5 argument forwarding and dossier classification remain valid.

### 5. Verify, review, record and commit

Run affected checks independently and inspect the full diff before review.
Dispatch the mandatory independent reviewer with this approved prompt, baseline
and current SHAs, uncommitted diff, constraints, changed paths and actual command
output. Apply `receiving-code-review`: verify findings against actual code, fix
valid defects, re-test, and re-review significant data-flow changes.

Record verified behavior and limitations in owning docs; do not mark Category 3
or launch approved. Append the build-plan record only after implementation.
Stage only approved files, review staged diff and commit locally to `main` with
`caveman-commit`; no push.

## SKILLS USED

- `deployment-pipeline-design`: Preserve operational rehearsal and independent
  operator rotation/launch gates.
- `secrets-management`: Credential-safe observation, diagnostics and receipts.
- `error-handling-patterns`: Early validation, optional observation fallback,
  failure/publication separation and owned-resource cleanup.
- `javascript-testing-patterns`: Isolated actual-process contracts, mocks and
  deterministic failure/race injection with the existing Node test runner.
- `requesting-code-review`: Independent implementation/diff review after checks.
- `receiving-code-review`: Verify feedback and fix/re-review valid findings.
- `caveman-commit`: Required local commit message and no push.

This bounded Phase 12K unit uses the skills that own its surfaces. The parent
phase's other skills apply if those broader surfaces are actually touched;
this prompt does not change Nest modules, application auth, SQL, CI, telemetry,
threat-model boundaries, browser journeys or UI.

## Non-goals

No live rotation, production probe demonstration, deployment, restore, new
secret provider/injector, SMTP/Grafana exercise, schema/API change, algorithm
redesign, universal shell helper extraction, dependency repair, launch approval
or push. Do not expand Stage 5 into live evidence or weaken readiness validators.
The current default probe behavior is retained and documented; a redesign that
makes `--dry-run` fully offline would need a separate approved contract change.

## Verification and acceptance

Run from the repository root and quote actual concise output and exit statuses:

```bash
bash -n scripts/ops/run-secret-rotation-drill.sh
node --check scripts/ops/run-secret-rotation-drill.spec.js
npm run ops:rotation-test
npm run ops:templates
npm run ops:templates-test
npm run ops:scan-secrets-test
npm run ops:volume-test
npm run ops:readiness-test
npm run ops:launch-readiness-test
npm run ops:launch-drill-test
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Run root typecheck/build sequentially because both use generated Next types.
Run syntax checks for any other modified script. Verify and use installed
Prettier on changed JavaScript and this prompt; format new documentation
sections. Distinguish pre-existing whole-document formatting warnings and do
not claim shell formatter success without an installed applicable formatter.

Prompt 267 records `ops:check` stopping at a critical dependency audit; that is
historical output, not a current test result. Re-run the aggregate, report its
actual stopping point, and run affected local suites independently if it blocks.
Do not claim later aggregate stages ran after failure. No dependency update or
registry retry belongs to this prompt.

Acceptance: malformed input has no rehearsal side effects; reachability is
bounded and truthful; credentials/exception canaries are absent from diagnostic
streams and receipts; retained evidence survives failures/races; published JSON
is complete/private and consumer-compatible; all receipts stay simulation;
affected checks pass or external blockers are explicitly recorded; independent
review is resolved; work is committed locally. No live category approval follows.

Safe inspection after execution:

```bash
bash scripts/ops/run-secret-rotation-drill.sh --help
npm run ops:rotation-test
```

Do not run the default or a targeted rehearsal against real services to
demonstrate this patch. Preparing this prompt authorizes no implementation;
execution begins only after its approval under `AGENTS.md` §2.
