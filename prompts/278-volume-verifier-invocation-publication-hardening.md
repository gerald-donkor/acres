# Phase 12K — Harden volume-verifier invocation and artifact publication

## Scope and why this is next

Prepare the next bounded producer step within the still-open Phase 12 launch
hardening gate in `docs/build-plan.md`. Planning starts from clean `main` at
`963de07d0143195de4d5f969c4d98809ef74818a`
(`fix(ops): harden container evidence publication`). Verify current code and git
history again at execution; a written prompt is not proof of implementation.

The committed unified runner invokes the volume producer in Stage 4 with
`--output <stage-directory>/volume-encryption-evidence-receipt.json`. Its current
CLI ignores unknown arguments, permits duplicate/incomplete options, performs
unbounded source reads, ignores malformed readiness JSON, overwrites receipts,
reflects private source/scan metadata and uses immediate process exits.

Implement strict invocation, bounded configuration reads, a safe CLI projection,
private exclusive verified publication, controlled errors and complete output.
Preserve the nine mount identities, approved-mechanism and forbidden-filename
patterns, well-formed evaluation policy, eight existing public exports, and
unchanged dossier/readiness consumers. The producer always remains simulation
configuration/local-filename-scan preflight. Category 8 production sign-off,
TM-21, prompt 201 and Phase 12 exit remain open.

Read-only declaration baseline, with Git/backup/environment-mount scans disabled:
`{"valid":true,"totalRequiredMounts":9,"validMountsCount":9,"errors":0}`.
Exports observed: `REQUIRED_STATEFUL_MOUNTS`, `APPROVED_MECHANISM_PATTERNS`,
`FORBIDDEN_KEY_PATTERNS`, `parseEnv`, `isApprovedMechanism`, `parseVolumeEntry`,
`scanDirectoryForKeys`, `validateVolumeEncryption`. No implementation tests,
build, host-volume scan, live operation or production inspection ran in planning.

## References read and execution prerequisites

- `AGENTS.md`: phase control, prompt/skill contract, verification/review/commit.
- `docs/build-plan.md` §§13–14 and records 275–277: Phase 12 gate and predecessors.
- `docs/operations.md`: volume preflight qualification, prompt 237 verification,
  prompt 277 publication precedent and recorded operations limitations.
- `docs/launch-checklist.md` Category 8 and §4: simulation/live separation,
  registered Stage 4 receipt and operator evidence requirements.
- `docs/security.md` prompt 237: scan limitations and sensitive path metadata.
- `docs/system-architecture.md` §11.1: configuration/secret constraints.
- `docs/skills.md`: locked skills and surface triggers.
- `scripts/ops/verify-volume-encryption.js` and its complete spec: eight exports,
  helpers, defaults, scanner behavior, CLI receipts and isolated installation.
- `scripts/ops/run-launch-drills.sh` Stage 4 and its spec: actual-child fixture,
  isolated parser dependency closure and passing/failing child precedents.
- `scripts/ops/assemble-launch-dossier.js`: registered receipt, 1 MiB child bound,
  Stage 4 count/scan summary and simulation baseline. Read its volume spec cases
  before adding integration coverage.
- `scripts/ops/check-launch-readiness.js`: `validateVolumeEncryptionReport`,
  exact nine identities and simulation/live branch. Read its volume spec cases.
- `scripts/ops/verify-container-security.js`: bounded regular-source reads,
  fixed projection, parent identity checks, owned staging, exclusive link and
  naturally drained output. Inspect its tests before reusing patterns.
- `infra/env/production.env.example` and `infra/launch/readiness.example.json`:
  unresolved sentinel examples; inspect the production Compose fixture at execution.
- `package.json`: existing operations tests, aggregate gate and workspace checks.
- `node_modules/@types/node/fs.d.ts`: verified synchronous links and
  `O_NOFOLLOW`/`O_NONBLOCK`. Check process/stream declarations before implementation.
- `node_modules/js-yaml/lib/loader.js`: installed depth limit; verify actual
  merge limit name and support before use, never invent parser options.

This is a Node CLI task. No UI, comp geometry, route, Next/React, CSS, schema or
runtime topology changes are planned; visual references and measurements do not
apply. No standalone Node CLI security reference is supplied by the installed
security skill; use verified local APIs and the recorded producer precedents.

## Expected files and impact

Modify `scripts/ops/verify-volume-encryption.js` and its spec. Add actual-volume
child coverage in `scripts/ops/run-launch-drills.spec.js`, and focused volume
contract tests in existing assembler/readiness specs only where necessary.
Record behavior/results in `docs/operations.md`, a concise Phase 12K record in
`docs/build-plan.md`, and safe regeneration guidance in Category 8/§4 of
`docs/launch-checklist.md`. Update `docs/security.md` only to record the CLI
metadata boundary and retained scanner limits; do not claim TM-21 acceptance.
Include this approved prompt in the final local commit.

No parent command, receipt filename, consumer predicate, template, dependency,
package script or public export change is required. Avoid extracting a shared
publisher. No application routes or customer behavior change.

## Implementation contract

### 1. Validate invocation before side effects

Accept `--json`, `--compose FILE`, `--env FILE`, `--readiness FILE`,
`--mount-path DIR` (repeatable), `--output FILE`/`-o FILE`, standalone
`--help`/`-h`. Support attached `--name=value` for long value options, including
repeatable mount paths. Resolve explicit relative paths against caller cwd;
installed source/repository/backups defaults remain anchored to `__dirname`.
An attached value may represent a literal dash-prefixed filename. Do not expand
shell metacharacters or reinterpret path bytes as commands.

Reject unknown/positional tokens, incomplete/empty/whitespace-only/control-bearing
values, boolean values, repeated singleton options (including output aliases),
duplicate booleans, and help combined with any other argument. Validate the full
argv before source reads, scans, Git calls, output checks or allocation. Keep
mount-path repetition intentional; exact repeated paths may retain current
evaluation semantics. Import and standalone help must not read sources, scan,
spawn Git or create directories. No-save runs must not allocate output resources.

Preserve the exported validator's valid direct-call signature/options. Validate
malformed parameter and option shapes before filesystem/Git work; do not let
truthy objects or arrays invoke string methods or formatting exceptions.
Retain the eight public exports; new CLI internals need not become public APIs.

### 2. Bound configuration reads and malformed evaluation

Use regular-file bounded reads for Compose/env/readiness: 1 MiB each, explicitly
a local safety judgment rather than a production measurement. Allow ordinary
source symlinks to regular files; detect opened identity/type/size changes,
growth/truncation and read/close faults. Avoid blocking on special files with
verified nonblocking opens and type checks. Close owned descriptors on all paths.

Compose/env are required. Preserve optional absent default readiness; explicit
`--readiness` must exist. A present readiness source that is unreadable, malformed,
oversized or structurally invalid must fail safely, rather than be silently ignored.
An absent default is optional only on confirmed ENOENT, not generic read failure.

Use verified YAML depth 100 and supported merge-key ceiling 10,000; bound
expanded document traversal to 10,000 entries, reject cycles and invalid collection
shapes without reflecting content. These are safety judgments aligned with the
committed container producer. Preserve finite ordinary aliases and legitimate
short/long mount syntax. Check service/volume source/target values and relevant
env/readiness types before applying predicates. Do not require unrelated
readiness categories or globally validate unrelated env values.

Preserve existing well-formed declaration predicates and scanner behavior:
filename patterns, depth/cycle handling, skipped missing/inaccessible paths,
symlink treatment and suppressed Git failures. Do not relabel these skipped
scans as complete inspection. Scanner/Git resource redesign is excluded from
this step; document remaining limits explicitly. Fixtures must never scan real
host mounts or backups. Source/evaluation machinery failure exits nonzero with
fixed diagnostics and no success receipt. Completed predicate failure may publish
a verified failed receipt for diagnosis.

### 3. Project CLI evidence without private values

Build a fresh allowlisted projection; do not mutate direct helper results.
Keep `execution_mode: "simulation"`, existing `drill_type`, canonical UTC
timestamp, status/valid/error agreement, total/valid counts and all nine
evaluated service/container identities with their actual status/passed booleans.
Do not include raw Compose sources, env values, mount host paths, recovery owner,
readiness source pointers, filename violations, Git filenames, parser errors,
source/output paths or stacks in human output, JSON or saved CLI receipts.

Use fixed diagnostics for predicate families and safe fixed scan/violation
labels. Preserve `keySeparation.verified` and actual array lengths for
`scannedPaths`/`detectedViolations` (consumers derive counts); never turn a
nonempty violation array into an empty one through redaction. Preserve safe
required mount/env identities and readiness decision booleans/counts where
useful; omit sensitive `readinessEvaluated` string fields rather than replacing
them with plausible owner/mechanism data. Human output uses this same projection.
Document that direct helper results still contain private scan metadata.

Independently validate projected report structure before serialization and again
after closed readback: exact identities/counts, booleans/status vocabulary,
simulation classification, timestamp, fixed error strings, violation counts,
and consistent success/failure. Failed evaluations may retain nine passing
mounts when failure is solely mechanism/custody/readiness policy. Do not equate
mount-count success with overall success or force counts to nine on malformed input.

### 4. Publish privately and exclusively

Only explicit output saves. Read-only destination preflight follows argv
validation and precedes evaluation/scans. Destination must be absent, including
dangling links; reject root/trailing separators/directories and symlink or
non-directory ancestors. Record existing ancestor identities and recheck before
allocation/publication; vanished recorded parents must not be recreated.
Create only missing directories at 0700, preserving existing modes.

Serialize one newline-terminated receipt, enforce the unchanged consumer 1 MiB
saved-byte ceiling before any parent creation, and stage exclusively in the
destination directory at 0600. Handle short/zero writes and filesystem faults;
retain descriptor ownership until closure is known. Close and reopen staging
with no-follow/nonblocking checks; verify regular-file identity, bounded size,
full bytes and independently parsed receipt consistency before publication.
Reject ordinary replacement, tampering, growth or truncation.

Publish via exclusive atomic hard link. No overwriting rename, truncation,
removal of retained evidence or destructive fallback. Preserve late competing
files/directories/links. Cleanup may close/unlink only resources whose ownership
is established; foreign staging replacements and published receipts survive.
Retain ownership for bounded retry after cleanup faults; a successful retry
does not erase the recorded failure. Do not recursively delete parents.

Publication/cleanup/output failures stay nonzero even after a valid receipt was
published. Document hard-link support requirements, orphan staging after
interruptions, conservative cleanup, no durable crash-recovery guarantee and
same-UID hostile administrator limitations. No new signal framework.

### 5. Complete output and truthful process status

Use controlled fixed errors for invocation, source/evaluation, serialization,
publication, cleanup and output faults, without rejected tokens or raw errors.
Use natural drain via `process.exitCode` and verified stream error/callback
handling; no immediate exit after writing JSON. Success requires valid
invocation, passing completed evaluation, requested publication, cleanup and
output. Completed failed JSON must parse fully and exit nonzero. Broken pipes
and synchronous/asynchronous output faults must fail without uncaught stacks.

### 6. Hermetic behavior and unchanged-consumer tests

Keep existing policy regressions and valid direct helper semantics. Update the
current `-o` fixture, which repeats `--output`, to exercise alias success with
exactly one output option; add a separate rejection test for the old duplicate.
Update private-path CLI assertions to test preserved counts and redaction.

Use existing `node:test`, disposable installation roots, `process.execPath`,
finite fixtures, bounded child timeouts and finally teardown. Install actual
`js-yaml`/required closure only within disposable roots. Allowlist environments;
exclude credentials, proxies, NODE_OPTIONS, BASH_ENV and ENV. Stub Git so
tests cannot inspect the real repository or credentials. Scoped deterministic
fault hooks must restore before cleanup; avoid privilege-dependent permissions
or timing races. No network, Docker, actual disk encryption or unstubbed drill.

Cover full argv validation before work, standalone help/import, changed caller
cwd/default roots, relative/spaced/attached/literal paths, repeated mounts,
direct malformed inputs, optional absent default versus explicit/present invalid
readiness, special/growing/oversized sources, YAML cycles/limits and valid aliases.
Compare declaration predicates/identity ordering with the planning commit on
well-formed fixtures; count and verdict parity must hold.

Cover human/JSON/save parity for passing and evaluated-failed policies and
detected keys, canaries in every private field/error/path, no-save allocation
absence, retained and late racing outputs, stable ancestors, private modes,
short/zero writes, staging replacement, byte/parsed readback tampering, each
filesystem fault family, cleanup retry/foreign preservation and output failure
after publication. Large finite failed JSON must drain completely.

Install the real volume child into the existing unified-runner fixture; all
other stage children remain deterministic stubs. Supply fixture-only installed
Compose/env/readiness/backups/Git roots. Exercise clean declarations, real
predicate failure, planted key filename, malformed readiness and source failure.
Choose child-only faults where parent preflight shares the Compose input.
Assert exact receipt registration, child exit, complete projected receipt or
its absence on machinery failure, Stage 4 status, baseline/compliance and scan
counts. Unchanged readiness accepts structurally valid passing simulation only
without `requireLive`; rejects failed receipts and always rejects simulation
for live approval. Do not weaken consumers to force tests to pass.

## Non-goals and residual work

No encryption/custody/recovery attestation, live receipts, key-content reading,
scanner/Git policy or traversal redesign, stronger mount detection, changes to
mechanism/filename patterns, source confinement, authenticated provenance,
runtime certification, shared publisher, dependency remediation, CI redesign,
service operation, production inspection or launch approval. Depth-limited and
error-suppressing filename scans remain explicitly incomplete. No new UI.

## SKILLS USED

- `deployment-pipeline-design`: Stage 4 child/exit/receipt compatibility.
- `secrets-management`: Private scan/config metadata and credential-free fixtures.
- `security-best-practices`: Safe invocation/artifact handling; no dedicated
  standalone Node CLI reference is installed.
- `error-handling-patterns`: Early rejection, ownership, fixed errors and truthful drain.
- `javascript-testing-patterns`: Behavior-based Node tests and deterministic faults.
- `e2e-testing-patterns`: Focused actual-child integration and isolated teardown.
- `requesting-code-review`: Mandatory independent reviewer after self-verification.
- `receiving-code-review`: Verify findings, fix valid issues, re-review material changes.
- `caveman-commit`: Required compact local Conventional Commit without push.

Phase-wide Nest/topology, CI, telemetry/Grafana, SQL, SAST, Playwright and UI
skills do not trigger in this bounded step. Reassess if execution expands to
those surfaces. Re-read every named skill before editing on approval.

## Verification, documentation, review and completion

Record BASE_SHA and current branch/status; preserve unrelated work. Run:

```bash
node --check scripts/ops/verify-volume-encryption.js
node --check scripts/ops/verify-volume-encryption.spec.js
node scripts/ops/verify-volume-encryption.js --help
npm run ops:volume-test
npm run ops:launch-drill-test
npm run ops:readiness-test
npm run ops:launch-readiness-test
npm run ops:container-test
npm run ops:rotation-test
npm run ops:templates-test
npm run ops:templates
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Typecheck/build run sequentially. Use installed Prettier for changed JS and
this prompt; format new doc regions without rewriting historical records.
Quote actual outputs/exits, including aggregate audit failures and unreached
stages; run affected suites independently when needed. Do not upgrade packages
or bypass audit. `ops:volume-drill` is excluded from routine verification because
its default local scans may touch host paths; use isolated fixture integration.

Inspect full diff/changed files, then dispatch one read-only reviewer with the
loaded review template, prompt, owning contracts, BASE_SHA/HEAD_SHA, uncommitted
diff, checks and limits. Reviewer must not mutate or delegate. Evaluate feedback
with `receiving-code-review`, reproduce claims, fix valid issues and reverify;
obtain follow-up review for material publication/data-boundary changes.
Resolve Critical/Important findings before completion.

Record exact contracts, parity, outputs, review and residual limits in owning
docs, keeping all production gates open. Rollback is a reviewed normal revert
preserving retained evidence. Give safe inspection steps from repository root:
standalone help and `npm run ops:volume-test`. For saves, instruct operators to
choose a fresh restricted path, never delete/overwrite retained receipts.
Stage approved files only, inspect staged diff and commit locally to `main`
using `caveman-commit`. No push. Preparing this prompt authorizes no code,
dependency installation, migration, staging or commit.
