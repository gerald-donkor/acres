# Phase 12K follow-up — separate rotation rehearsal from live approval evidence

## Scope and why this is next

Close the Category 3 (`secrets_management`) evidence gap in the Phase 12 launch
gate. Keep the existing secret-rotation runner usable as a simulation, but stop
accepting its output alone as evidence of production credential rotation and
compromise response. Require a separately supplied, explicit live operator
receipt for production approval. This prompt defines the receipt contract; it
does not perform or automate any production rotation.

Planning baseline: clean `main` at
`d9e84fe5c18bcb0f020fbd00eb0516bfbb5d7f26`. That commit completed the Category 5
capacity producer/consumer alignment. Phase 12 remains the earliest unfinished
phase in `docs/build-plan.md` §13/§22; prompt 201's operator sign-off remains
open. Re-establish committed state and preserve unrelated changes at execution.

Verified gap:

- `validateSecretRotationReport(report, now)` currently ignores `dry_run` and
  accepts seven passing step statuses plus class names and redaction booleans.
- The readiness suite's baseline `validSecretRotationReport` explicitly uses
  `dry_run: true` and three false live-reachability flags, yet clears Category 3.
- `run-secret-rotation-drill.sh` executes local cryptographic examples and mock
  PostgreSQL/Valkey/session state machines. Omitting `--dry-run` does not change
  those algorithms into actual service rotations. Live reachability probes are
  independent of the simulated rotation steps.
- SMTP and Grafana appear in `tested_secret_classes`, but there are no real
  SMTP or Grafana credential rotations in this runner.
- The launch checklist already says Stage 5 is dry-run only and separate live
  evidence is required. The executable Category 3 gate does not enforce that
  distinction.

This is a concrete repository-owned follow-up, independent of the unavailable
operator targets. Category 10 deployment evidence and the remaining operator
decisions are separate work; do not broaden this unit to other categories.

## References read and execution prerequisites

Read during planning: `AGENTS.md` workflow, phase commands, prompt/check/commit
contracts and product/standing rules; `docs/build-plan.md` Phase 12 and current
Phase 12K record; `docs/skills.md`; `docs/operations.md` prompt 230, Phase 12K
and prompt 234; `docs/launch-checklist.md` Category 3, Stage 5, gap register and
sign-off matrix; `docs/security.md` rotation and Phase 12K evidence boundaries;
`docs/system-architecture.md` §11.4 and change gates.

Inspected code: root `package.json`; secret candidate/helper and Category 3
integration plus evidence diagnostics in `scripts/ops/check-launch-readiness.js`;
secret baseline and behavioral tests in its spec; complete
`scripts/ops/run-secret-rotation-drill.sh`; runner harness in
`scripts/ops/run-secret-rotation-drill.spec.js`; Stage 5 baseline assembly in
`scripts/ops/assemble-launch-dossier.js`; `infra/launch/readiness.example.json`.

At execution reread these paths. Inspect `run-launch-drills.sh`, its spec,
`assemble-launch-dossier.spec.js`, `check-readiness-schema.spec.js`, and
`infra/launch/readiness.schema.json` before altering related fixtures. Read
`check-production-templates.sh` before changing runner text that its static
checks depend on. Verify new Node APIs using local installed references or
small local executable probes. No Next, React, Tailwind or Nest API is changed.

There is no visual surface, route change, pixel measurement or breakpoint
behavior in this task; the static design references are not applicable.

## Implementation plan

### 1. Explicitly identify the existing runner as simulation

Add the new child field `execution_mode: "simulation"` to every receipt emitted
by `run-secret-rotation-drill.sh`, including failed receipts. It is always
simulation regardless of the CLI `DRY_RUN` flag or successful reachability
probes. Preserve the existing `dry_run` boolean as invocation metadata.
Never emit `execution_mode: "live"` from this runner.

Correct the script introduction, help, final success message and narrowly
relevant comments to describe protocol/algorithm rehearsal. Explain that the
session example is a generalized HMAC rollover exercise, not proof that Acres'
opaque sessions are signed with `SESSION_SECRET`. Keep existing mock algorithms
and CLI options; no provider, service command or production mutation is added.
Do not invent an SMTP/Grafana mock rotation to make the class list look complete.
Document the class list as intended coverage, not independent live verification.

Reachability may remain as existing metadata, but it must never authorize live
mode or clear a live rotation requirement. Do not redesign network probing,
output naming/atomicity or inherited operational environments in this unit.

### 2. Define structural rehearsal and live receipt validation

Keep the two-argument `validateSecretRotationReport(report, now)` interface for
structural validation and add an optional explicit context such as
`{ requireLive: true }`. Require the exact existing drill type, successful
status, empty errors, valid nonfuture UTC timestamp, a boolean `dry_run`, all
seven class names and seven passing steps, and both redaction booleans.
Require class names to be unique and from the fixed seven-class set; require
canonical `status: "passed"` for each required step. Validate object shapes
before accessing members. Preserve recognized basic and canonical ISO UTC dates;
reject invalid evaluation clocks rather than bypassing future-date checks.

Recognize exactly `execution_mode: "simulation"` and `"live"`. Missing,
unknown or contradictory mode is invalid. Do not infer live mode from
`dry_run: false` or `environment_topology.live_*: true`. This is a deliberate
compatibility tightening: old unclassified reports require regeneration or a
separately inspected live receipt; do not relabel retained files automatically.

Simulation can pass structural rehearsal validation with either boolean
`dry_run` value. It always fails validation with `requireLive: true`.

The following additional fields are a **new operator-supplied child contract**,
not assertions that a producer currently emits them. A live receipt requires:

- `execution_mode: "live"`, `dry_run: false`, `environment: "production"`;
- nonempty opaque `environment_reference`, `authorization_reference`, and
  `operator_reference` strings identifying the independently inspectable target,
  separately authorized change window/action, and responsible operator;
- `class_verification`, an object with exactly the seven fixed class keys,
  each containing `status: "passed"`, `rotation_verified: true`,
  `stale_credential_rejected: true`, `fresh_credential_accepted: true`, and
  a nonempty opaque `evidence_reference`;
- each of the seven existing `steps` entries contains an additional nonempty
  opaque `evidence_reference` supporting that production observation.

These class observations include SMTP and Grafana, as well as session/cursor
signing, independent CSRF, PostgreSQL credentials, Valkey and storage. Do not
claim dual-key support, zero downtime or exact provider behavior solely from
the local examples. The operator source must explain actual application
behavior and recovery policy. The receipt's class and step confirmations are
assertions and source pointers, not cryptographic proof or executed verification.

Apply existing placeholder/development-secret rejection to live receipt text,
but never print the receipt or scan diagnostics in Category 3 blockers. Require
opaque references to be trimmed nonempty strings without control characters;
do not dereference them or require private paths to exist on this machine.
Reject arrays/null in verification maps and entries, extra class keys,
missing classes, false/string booleans, failed assertions and placeholder
references. Validate a live-mode report completely even without `requireLive`;
the optional context selects the required evidence kind, not schema strength.

No production receipt generator, provider selection, signature system, new
readiness-record field, database table or schema migration is needed. The
existing readiness schema stays unchanged: these fields belong to child JSON.

### 3. Enforce live evidence at the approved Category 3 call site

Preserve content-based custom-path candidates, relative path resolution and
wildcards. Require every referenced secret child to pass structural validation,
and require at least one child to pass explicit live validation before an
approved Category 3 clears. A valid simulation may accompany a valid live
receipt as supporting rehearsal evidence, but simulation-only, dossier-only,
prose-only and missing-child records fail. A malformed/failed simulation or
live receipt still blocks beside a valid live child. Do not silently filter
bad wildcard matches or count a unified dossier as the live child.

Keep injection mechanism, masking policy, positive cadence ≤90 days,
compromise runbook, approver and global launch gates intact. No other category
is weakened to accommodate the fixture changes.

Use fixed Category 3 evidence-file messages for missing files, parse failures,
failed child diagnostics and non-child dossier failures. Extend the existing
Category 5 diagnostic suppression pattern narrowly to Category 3 so private
`errors`, unexpected JSON values, file paths and exception text are not echoed.
Update tests that intentionally expected raw rotation errors accordingly.
Do not refactor diagnostics for the other nine categories.

### 4. Preserve Stage 5 rehearsal and add behavioral tests

The unified dossier remains a drill. Stage 5 can still pass on a successful
simulation and never becomes a production approval. Verify this in launch
tests; no new live mutation path or Stage 5 invocation change is authorized.
Update only rotation fixture classifications required by the new contract.
Do not redesign the assembler or change its public baseline structure.

Replace the baseline approved-readiness rotation fixture with a clearly labeled
test-only live-shaped operator receipt containing all seven class confirmations
and seven source pointers. Keep a distinct producer-shaped simulation fixture
for helper/rehearsal tests. Do not create tracked production-looking evidence.

Add hermetic regressions using actual runner output with and without
`--dry-run`, with all reachability children stubbed. Use a disposable repository
fixture and an explicit scrubbed subprocess environment so inherited service
credentials and local reachable services cannot influence results. Stub static
preflight commands inside that fixture; run the real inline rotation code.
Both outputs must identify simulation, pass structural validation and fail
live approval. Clean only the temporary roots each test creates. Update the
existing runner suite to avoid live probes in affected successful execution
tests, and correct its misleading 'valid Category 3 evidence' test wording.

Cover helper and full readiness behavior for: legacy/missing/unknown mode;
`dry_run` true/string/null/missing in live mode; simulation with all reachability
flags true; simulation manually changed to live but without live class/source
evidence; missing/extra/duplicate class data; arrays/null maps; malformed or
future timestamps and invalid evaluation time; failing/error/incorrect-type
steps; missing/blank/control-character/placeholder references; missing SMTP or
Grafana confirmations; stale/fresh booleans false or strings; redaction failure;
custom filenames; wildcard bad child beside good live child; valid simulation
plus valid live child; and a complete live receipt clearing only the fixture
Category 3 gate. Include malformed JSON and private canary diagnostics proving
Category 3 blockers do not expose them. Preserve all other readiness tests.

## File scope, impact, limits and rollback

Expected edits: `scripts/ops/run-secret-rotation-drill.sh`, its spec,
`scripts/ops/check-launch-readiness.js`, its spec; narrowly necessary rotation
fixtures in existing launch/dossier specs; `docs/operations.md`,
`docs/launch-checklist.md`, `docs/security.md`, and a concise Phase 12K record
in `docs/build-plan.md`. No new documentation index row is needed.

Routes and product data are unchanged. Do not edit application/server code,
Compose, Caddy, alert rules, CI, dependencies, secret stores, readiness approval
states or the remaining ten child contracts. No live rotation, revocation,
SMTP send, benchmark, database/storage operation, deployment or launch approval
is authorized. Production evidence, separate live-action authorization and
independent inspection remain operator-owned under prompt 201.

Rollback is reverting the implementation commit. Existing simulation/legacy
reports cannot support production approval after this change; retain private
reports and explain regeneration/inspection rather than rewriting them.

This focused subset does not require Nest/React/browser, SQL, Grafana, provider
integration, GitHub Actions or SAST implementation skills. The loaded security
skill has no matching standalone Node/Bash CLI security reference; use the
repository contracts and behavioral tests for that surface. Consult the existing
threat model; no new full threat-model report or architecture decision is requested.

## Verification and completion

1. Inspect local formatting tools and check changed JS/Markdown without package
   installation. Preserve unrelated formatting; quote actual output.
2. Run `bash -n scripts/ops/run-secret-rotation-drill.sh`,
   `npm run ops:rotation-test`, `npm run ops:readiness-test`,
   `npm run ops:readiness-schema-test`, and `npm run ops:launch-drill-test`.
   Tests are hermetic. Do not run the standalone operational runner against
   this machine's inherited environment or any live target as a verification shortcut.
3. Run `npm run ops:templates`, `npm run ops:check`, `npm run lint`,
   `npm run typecheck`, `npm run build`, and `git diff --check`. The aggregate
   gate includes npm registry audit access: follow current permissions and
   disclose a blocked check; never bypass it or report historical output as
   current. Fix actual failures and quote command results.
4. Run `node scripts/ops/check-launch-readiness.js
   infra/launch/readiness.example.json`. It must still fail closed. Report
   actual category/blocker counts; leave the unresolved example untouched.
5. Review the complete diff, then dispatch the independent read-only reviewer
   required by `requesting-code-review`, supplying this prompt, baseline/HEAD
   SHAs, working-tree diff, changed files and actual checks. Evaluate feedback
   with `receiving-code-review`, fix verified findings, rerun affected checks
   and re-review significant changes. No subagent is needed during planning.
6. Record the enforced child contract and compatibility impact in the owning
   docs. Correct current Category 3 and sign-off matrix wording so the dry-run
   command is clearly rehearsal and the live operator receipt is required.
   Preserve dated historical records while adding their current qualification.
   Explain that source pointers and mode flags do not authenticate a target,
   prove zero downtime or replace independent operator approval. Phase 12 and
   prompt 201 remain open.
7. Stage only approved work and this prompt, inspect the staged diff and commit
   locally to `main` using `caveman-commit`. Do not push. Give safe inspection
   commands: `npm run ops:rotation-test` and `npm run ops:readiness-test`.

## SKILLS USED

- `deployment-pipeline-design` — preserve launch gates and separate rehearsal from live sign-off.
- `error-handling-patterns` — fail closed on malformed evidence and emit safe Category 3 blockers.
- `javascript-testing-patterns` — distinct simulation/live fixtures and hermetic actual-runner regressions.
- `secrets-management` — production rotation, credential retirement, masking and operator-source requirements.
- `security-best-practices` — strict JavaScript evidence validation; no standalone CLI reference is available.
- `security-threat-model` — consult existing rotation and launch-evidence integrity boundaries and limitations.
- `requesting-code-review` — dispatch the independent read-only implementation reviewer after self-verification.
- `receiving-code-review` — verify feedback against the approved contract before fixes.
- `caveman-commit` — craft the required local implementation commit message.
