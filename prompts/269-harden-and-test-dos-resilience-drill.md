# Phase 12K — Harden and test the DoS resilience drill runner

## Scope and why this is next

Prepare the next dependency-safe unit of `docs/build-plan.md` Phase 12. Planning
HEAD is `ffd4a8f` (`fix(ops): harden secret rotation drill`), on clean `main`.
Recent commits establish backup, restore, restore-drill, deployment-drill and
rotation-runner hardening. Re-resolve implementation from code/git on execution;
the existence of prompts alone is not proof. Phase 12's operator evidence and
launch exit gate remain open.

Harden `scripts/ops/run-dos-resilience-drill.sh` before hardening its capacity
parent. This child still silently accepts repeated value options, supports only
separate values, does not reject whitespace-only paths, deletes a prior receipt
with `rm -f`, and publishes with overwriting `mv -f`. Its existing tests explicitly
expect receipt invalidation and inherit almost all ambient environment values.
These are concrete gaps adjacent to the committed operations work. The parent
already allocates an absent child receipt in an invocation-owned directory and
checks child exit status and freshness, so preserving existing destinations need
not weaken consumer rejection of stale success.

Implement strict invocation validation, private exclusive receipt publication,
and isolated actual-process tests. Preserve the five static protection checks,
zero-network dry run, bounded CSRF-paired live observation and exact consumer
receipt contract. Approval authorizes repository changes and stubbed tests;
it does not authorize a live drill or production sign-off.

## References read and required execution reads

- `AGENTS.md`: phase commands, prompt contract, checks, review and local commit.
- `docs/build-plan.md`: Phase 12, sequence gates and prompt 268 implementation.
- `docs/operations.md`: topology, prompt 232 child/consumer contract, prompt 245
  simulation/live separation and prompt 268 publication pattern.
- `docs/launch-checklist.md`: Category 5 and its prompt 232 qualifications.
- `docs/system-architecture.md`: binding principles and operations/health rules.
- `docs/security.md`: TM-05/TM-20 and Phase 12J observation limitations.
- `docs/backend.md`: CSRF handshake and cookie/token pairing, for context only.
- `docs/skills.md`: skill paths and surface-based manifests.
- `scripts/ops/run-dos-resilience-drill.sh` and its `.spec.js`: live implementation
  and tests, including stale-receipt overwrite/interruption expectations.
- `scripts/ops/launch-target-evidence.js` and its `.spec.js`: `safeUrl`,
  `targetId`, `readBoundedJson`, `validDosEvidence` and existing contracts.
- `scripts/ops/run-capacity-alerting-drill.sh` and its `.spec.js`: absent owned
  child destination, argument forwarding, child exit/freshness/target validation.
- `scripts/ops/run-launch-drills.sh` and
  `scripts/ops/assemble-launch-dossier.js`: Stage 6 and nested DoS validation.
- `scripts/ops/run-secret-rotation-drill.sh`: established attached/separate
  options, target cwd, early destination checks and exclusive publication.
- `package.json`: existing `ops:dos-test`, consumer suites and aggregate checks.

At execution, re-read those sections and relevant complete scripts. Verify all
new Bash, Node, coreutils and curl APIs from installed help/source/manpages or
official documentation before writing them. No dedicated Bash/curl skill is
installed; the general skills do not verify tool flags. No Next/React/Tailwind
API changes, components or visual measurements apply. Network and response limits
below are existing operational choices, not measured production guarantees.

## Expected impact and allowed changes

Primary edits:

- `scripts/ops/run-dos-resilience-drill.sh`
- `scripts/ops/run-dos-resilience-drill.spec.js`
- `docs/operations.md`: CLI, cwd, prerequisites, publication and check record.
- `docs/build-plan.md`: append implemented prompt 269 record after execution.
- `docs/launch-checklist.md`: narrow Category 5 runner-usage clarification.
- This approved prompt only if execution clarification must be recorded.

Add focused compatibility tests in
`scripts/ops/run-capacity-alerting-drill.spec.js` only when needed to exercise
the real updated child inside its owned destination. Do not modify the parent
runner, shared validators, launch orchestrator or dossier implementation here.
Existing npm scripts already include the suites; no package/dependency change
is required. No application route, auth, schema, tenancy, CI, production template,
alert policy or runtime topology changes.

## Implementation requirements

### 1. Validate before checks, traffic or output creation

Preserve `--help`/`-h` as side-effect-free paths. Document both invocation modes
accurately: `--dry-run` is fully offline; without it the existing bounded live
observation requires separately authorized operator execution.

- Support separate and attached `=` forms for `--evidence-dir`,
  `--evidence-file`, `--api-url` and new `--cwd`. Reject repeated value options
  in every same/mixed-form combination. Repeated `--dry-run` may remain
  idempotent; do not add a new operational mode.
- Reject missing, empty, whitespace-only, option-looking separate values,
  unknown flags and positional input. Attached paths may start with `-`;
  canonicalize/use option terminators so they cannot become command options.
- Default target cwd is the installation repository root, regardless of caller
  cwd. Resolve an explicit relative cwd against the caller; canonicalize it,
  require an accessible directory and run static file reads there. Relative
  output paths resolve against that target. Installation helper imports remain
  anchored to the script's installation root, never to target repository code.
- Keep unset `API_URL` defaulting to `http://localhost:3001`; an explicitly empty
  environment origin must remain invalid. Use verified `safeUrl` plus the
  current root-path/no-query/no-fragment contract, including bare `?`/`#`.
  Reject whitespace-only/control-containing origins and URL credentials;
  normalize to `URL.origin` before requests and hashing. Preserve IPv4,
  hostname, HTTPS, valid ports and URL-supported IPv6 behavior. Do not broaden
  this to an arbitrary endpoint or echo the target in diagnostics.
- Check mode-required utilities and the readable installed helper before work.
  Curl is required for live mode; its absence must not defeat a fully offline
  dry run. Verify publication primitives too. Distinguish unavailable machinery
  from a static source file missing/pattern failure: the latter remains an
  evaluated failed drill with a complete failed receipt, zero traffic, nonzero
  exit. Do not reclassify missing static source as successful skipped coverage.
- Validate only the effective output selection. Explicit file overrides
  evidence-dir and must not create the unused directory. Reject any existing
  file, directory, symlink or dangling link at the destination, plus trailing
  separators. Check usable nearest existing parent without creating output
  first; fail on non-directory/dangling/unusable ancestors with fixed errors.
- Never print rejected arguments, private paths, arbitrary runtime exception
  text, URLs, response bodies, cookie contents or CSRF values. Expected
  validation/preparation/publication errors use fixed controlled messages.
  Avoid raw shell/coreutils diagnostics reflecting paths on failure.

### 2. Preserve bounded observation and private resource ownership

Keep the exact five static layer identities/pattern meanings and six-layer JSON
shape. A static failure prevents every curl request. Dry run executes no health,
CSRF or login traffic, even if a valid API origin was supplied.

Preserve the live sequence and existing limits:

1. Validated `GET /health` liveness envelope for `acres-api`.
2. Validated `GET /api/v1/auth/csrf` token and paired cookie; private header file.
3. At most 15 sequential synthetic invalid-login POSTs using the existing
   probe email/password. Count only validated `401 INVALID_CREDENTIALS` and
   `429 RATE_LIMITED` envelopes; stop immediately on unexpected status/envelope
   or transport failure.
4. Require at least one validated throttle and successful post-burst liveness
   before live success. No successful login, registration or real account use.

All requests retain `curl -q`, 2-second connect deadline, 5-second total deadline
and 65536-byte response ceiling; never follow redirects, disable TLS verification
or retry traffic. Preserve cookie/header pairing and existing contradiction
checks. Do not strengthen liveness into dependency readiness or claim these
observations measure deployed protection across all static layers.

Create private temporary directories/files with umask 077, including cookies,
headers and bodies. Install ownership-aware EXIT/INT/TERM/HUP cleanup before
resource-producing work can leave them behind; cleanup failure cannot produce
success. Remove only this invocation's resources. Keep origin, token, cookie,
body and injected-error canaries absent from stdout/stderr/receipts. Fixtures
may inspect fake private data internally but must not serialize it into emitted
test diagnostics or persisted call logs.

### 3. Publish complete private JSON without overwriting evidence

Remove prior-destination invalidation and the overwriting move. Existing evidence
is retained for both valid and invalid invocations, interruptions and publication
races. Parent consumers must continue rejecting a failed invocation regardless
of any stale success file; their exit/freshness/owned-path checks remain intact.

- Preserve UUID default names beginning `dos-resilience-evidence-` and ending
  `.json`; multiple concurrent/default runs cannot collide.
- Create new output parents privately without changing existing permissions.
  Serialize the entire receipt into an owned same-directory 0600 temp file and
  atomically publish with exclusive/no-replace semantics. Use the verified
  temp-plus-exclusive-link pattern from adjacent runners, or a verified Node
  equivalent. Concurrent destination directories must never redirect publication
  inside a directory; concurrent files/symlinks must be preserved unchanged.
- Check serialization and publication independently. Empty/partial output from
  an early Node exit cannot become a receipt. Do not retry a failed publication
  with a direct final-path write or alternate overwrite path.
- An evaluated static/live failure still publishes complete failed evidence
  at a fresh absent destination, with fixed safe failures and nonzero exit.
  An I/O failure returns controlled nonzero output and no success message.
  Clean only the owned staging file/resources on normal exit, failure and
  catchable interruption. No claim is required for uncatchable SIGKILL.
- Preserve timestamp/duration, `drill_type: "dos_resilience_drill"`, statuses,
  `mode: "simulated" | "live"`, target hashing and burst fields exactly.
  Offline success has null `apiTargetId`, skipped/null burst, zero counters and
  false health/CSRF booleans. Live hashes the normalized origin without trailing
  slash; do not substitute the parent's distinct benchmark/href target hash.

### 4. Expand isolated actual-runner tests

Keep `node:test` and execute the actual Bash/inline Node runner in disposable
repositories. Replace inherited process environments with explicit allowlists
for required tool paths and fake scenario variables; never inherit credentials,
proxy settings, Node injection settings, API targets or real-service config.
Stub every curl invocation and forbid delegation to the real binary. Tests of
live mode are fake-response contracts and never contact a service.

Cover these behaviors with meaningful process-level assertions:

- Help aliases, every separate/attached form and duplicate combination, absent/
  blank/whitespace/flag-looking values, unexpected positional/unknown input.
- Defaults from a different caller cwd; absolute/relative explicit cwd; static
  source targeting versus installation-helper anchoring; invalid cwd; paths
  with spaces/quotes and attached dash-leading paths.
- CLI/environment origin validation; normalized origin/hash; invalid query,
  fragment, credentials, schemes, paths and controls without canary leaks.
- Missing prerequisites/helper and invalid output selection fail before static
  work, network, output directory or receipt creation. Missing curl in offline
  mode remains usable. Explicit file creates no unused evidence-dir.
- Existing static failures and every health/CSRF/login/transport failure remain
  nonzero, safe, bounded and publish complete failed receipts at fresh paths.
  Existing successful offline/live stubs pass `validDosEvidence` against actual
  invocation times/expected mode and normalized origin; offline cannot pass
  live validation. Never relax validators for a test fixture.
- Files/directories/symlinks/dangling links and trailing-separator output paths
  are rejected early and preserved. Update the old overwrite/invalidate tests
  to use distinct absent paths for separate runs and assert retained bytes.
- Concurrent destination insertion, file-to-directory races, concurrent default
  names, parent creation failure, temp write/link failure and early serializer
  exit: no partial/overwritten receipt, no success summary, only owned cleanup.
- Receipt mode 0600 and private response/header/cookie temp ownership. Test
  catchable signal cleanup during stubbed live work and publication; no stale
  receipt deletion. Use bounded explicit synchronization and test deadlines,
  not timing-only sleeps or infinite polling; terminate spawned children on
  test failure as well as normal completion.
- Consumer compatibility: the capacity parent still supplies an absent path
  inside its owned directory; child failure/stale/mismatched receipt fails it;
  successful offline receipt remains accepted. Add a focused real-child fixture
  test only if current stub-only coverage cannot verify this integration.

### 5. Review, document and commit

Self-verify first, inspect all changed files and the diff, then dispatch the
mandatory reviewer subagent with the approved requirements, BASE_SHA/HEAD_SHA,
uncommitted diff, constraints and real checks. Use `receiving-code-review` to
verify feedback before fixes; re-test and re-review significant behavior changes.

Update the prompt 232 publication description in `docs/operations.md` so it no
longer directs deletion of existing receipts; retain its historical verification
record as history. Add prompt 269 behavior/check evidence and exact safe usage.
Keep all live-observation qualifications and Category 5/operator gates unresolved.
Record the implemented build-plan entry only after code, checks and review.
Stage only approved changes, inspect staged diff and commit locally to `main`
using `caveman-commit`. Do not push.

## SKILLS USED

- `deployment-pipeline-design`: Preserve invocation-owned evidence and operator
  launch gates while hardening this operational child runner.
- `secrets-management`: Protect private cookies/tokens/bodies and diagnostics.
- `error-handling-patterns`: Early validation, truthful failure propagation,
  exclusive publication and owned-resource cleanup.
- `javascript-testing-patterns`: Actual-process contract fixtures, isolation,
  failure injection and deterministic race/signal coverage with Node tests.
- `requesting-code-review`: Independent review after self-verification.
- `receiving-code-review`: Verify feedback, repair valid issues and re-review.
- `caveman-commit`: Required local commit message without a push.

This bounded unit touches shell/Node operational tooling. The parent phase's
other skills apply only if their surfaces are touched; this prompt changes no
Nest modules, SQL, UI, CI, monitoring policy or trust-boundary architecture.

## Non-goals

No live request demonstration, load benchmark, production probe, on-call alert,
credential rotation, deployment, new authorization mechanism, new receipt schema,
new protection layer, sustained/distributed DoS test, provider integration,
dependency update, shared shell abstraction, parent-runner refactor, readiness
relaxation, launch approval or push. Preserve default live invocation semantics
and explicitly document its separate operator authorization requirement.

## Verification and acceptance

Run from the repository root and report actual concise output/exit status:

```bash
bash -n scripts/ops/run-dos-resilience-drill.sh
node --check scripts/ops/run-dos-resilience-drill.spec.js
npm run ops:dos-test
npm run ops:capacity-alerting-test
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

Run root typecheck/build sequentially because they share generated Next types.
Run syntax checks on any additional changed script and installed Prettier on
changed JavaScript/this prompt. Format new documentation content; distinguish
existing whole-document warnings. Do not claim shell formatting without an
installed applicable formatter.

Planning baseline `npm run ops:dos-test` exited 1: `tests 2`, `pass 1`, `fail 1`,
with `scripts/ops/run-dos-resilience-drill.spec.js` reported as a failed test file.
The terse output does not establish its underlying cause. Diagnose detailed
output at execution and distinguish a runner/test defect from environment
limitations; never cite historical 39/39 as the current result.

Prompt 268's aggregate stopped at a critical production dependency audit; that
is historical evidence, not a present check. Re-run the aggregate once, report
the actual stop and independently run affected suites if blocked. No registry
retry/dependency repair is in this scope, and later aggregate stages cannot be
claimed after an earlier failure.

Acceptance: malformed invocations have no drill side effects; dry runs produce
zero traffic; stubbed live behavior remains bounded and consumer-compatible;
private data does not escape; retained/concurrent evidence survives; newly
published JSON is complete/private/exclusive; failure and interruption cleanup
is owned and tested; checks pass or external blockers are recorded precisely;
independent review is resolved and the approved work is locally committed.

Safe inspection after execution:

```bash
bash scripts/ops/run-dos-resilience-drill.sh --help
npm run ops:dos-test
npm run ops:capacity-alerting-test
```

Preparing this prompt authorizes no implementation. Execution begins only after
approval under `AGENTS.md` §2.
