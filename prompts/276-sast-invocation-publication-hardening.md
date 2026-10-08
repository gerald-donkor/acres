# Phase 12K — Harden SAST invocation and artifact publication

## Scope and why this is next

This is the next bounded, dependency-safe producer step within Phase 12 of
`docs/build-plan.md`, following committed SBOM hardening. Planning baseline is
clean `main` at `4f696d78559b9bfe03c06f534cab63ac22a0e6ca`
(`fix(ops): harden SBOM publication`). Re-establish execution state from code
and git history; prompt files do not prove implementation.

Stage 2 of `scripts/ops/run-launch-drills.sh` invokes
`run-sast-scan.js --output <stage-directory>/sast-scan-evidence-receipt.json`.
The current producer silently ignores unknown/positional arguments, accepts
repeated or incomplete switches, falls back from unknown thresholds, and has
no standalone help. It recursively creates output parents and writes directly
to the destination, overwriting retained files and following links. Immediate
`process.exit` calls can truncate JSON, and raw exceptions expose private paths.
Detected-secret source snippets can also appear in human/JSON evidence.

Harden invocation, report projection, exclusive publication, controlled errors
and output completion. Preserve the eight rules, discovery/exclusion behavior,
finding ordering, valid triage matching, expiration comparison, default BLOCKER
threshold, exports and successful consumer fields. Do not redesign analysis or
triage policy. Phase 12 acceptance, prompt 201, dependency advisories, provenance
and operator launch decisions remain unresolved.

Planning ran a read-only `runSastScan()` count projection with actual output:
`{"scannedFilesCount":371,"totalFindingsCount":12,"triaged":9,"expired":0,"active":3,"blocking":0,"passed":true,"failOnSeverity":"BLOCKER"}`.
These are baseline observations, not new thresholds or a promise that future
repository counts never change. No implementation tests or build ran during
prompt preparation.

Approval authorizes these repository changes and hermetic verification. It
does not authorize an unstubbed unified launch drill, production inspection,
deployment, credential access/mutation, new scanner installation, dependency
upgrade or push.

## References read and execution prerequisites

- `AGENTS.md`: phase control, prompt contract, skills, checks, review and commit.
- `docs/build-plan.md`: Phase 12, sequence gates and current producer records.
- `docs/operations.md`: topology, Phase 12I SAST/triage record, prompt 162 exact
  ANALYZE suppressions and prompt 275 publication/cleanup precedent.
- `docs/launch-checklist.md` §4: exact child receipts, bounded reads, exclusive
  publication and separation between repository evidence and human sign-off.
- `docs/system-architecture.md` §11: configuration and secret/log constraints.
- `docs/security.md`: TM-15/TM-18 and Phase 12I scanner limitations.
- `docs/skills.md`: locked paths and surface-specific loading.
- `scripts/ops/run-sast-scan.js` and its spec: discovery, eight rules, valid
  triage semantics, default options, public exports and CLI behavior.
- `infra/security/sast-triage.json` and `.schema.json`: actual registry shape
  and narrow line/snippet matching. Read-only inputs for this change.
- `scripts/ops/run-launch-drills.sh` and its spec: stage 2 command, installed
  child fixture location and actual SBOM child integration precedent.
- `scripts/ops/assemble-launch-dossier.js` and its spec: `RECEIPTS`, bounded
  child loading, timestamps, `validSummaryFields` and supply-chain projection.
- `scripts/ops/check-launch-readiness.js` and its spec: SAST identification and
  failed-status, blocker and expired-suppression rejection.
- `scripts/ops/generate-sbom.js`: verified exclusive publication and controlled
  output precedent; inspect implementation rather than copying blindly.
- `package.json`: existing SAST, launch/readiness, adjacent and root commands.
- `node_modules/@types/node/fs.d.ts` and `process.d.ts`: file/link constants,
  synchronous filesystem operations and natural output draining.
- `.agents/skills/requesting-code-review/code-reviewer.md`: review template.

Before editing, re-read complete relevant functions/spec fixtures and verify
new Node APIs against installed types/source or official documentation. This
is a standalone Node CLI; the security skill has no dedicated CLI reference.
Its general guidance and the verified local API contracts apply. No visual,
Next, React, Tailwind, SQL, browser, runtime topology or telemetry change is
involved. Static comps, pixel measurements and breakpoint deltas are inapplicable.

## Expected impact and allowed files

Primary changes:

- `scripts/ops/run-sast-scan.js`.
- `scripts/ops/run-sast-scan.spec.js`.

Narrow actual-child/consumer test additions, only where necessary:

- `scripts/ops/run-launch-drills.spec.js` and/or
  `scripts/ops/assemble-launch-dossier.spec.js`.
- `scripts/ops/check-launch-readiness.spec.js` if the other integration does
  not establish real SAST receipt acceptance and failure rejection.

After verification and review:

- `docs/operations.md`: implementation, compatibility, checks and limitations.
- `docs/build-plan.md`: concise committed-state record.
- `docs/launch-checklist.md` §4: safe SAST inspection/regeneration instructions.
- `docs/security.md`: concise detected-secret projection clarification only.

No routes, schemas, dependencies, package scripts, registry approvals, scanner
rules, consumer production code, CI files or other producer implementations
change. Keep the producer fixture closure small; do not create a general ops
publication framework or import SBOM-specific validators.

## Implementation contract

### 1. Strict CLI and direct options before work

Retain `--json`, `--format json`, `--fail-on LEVEL`, `--triage FILE`,
`--output FILE` and `-o FILE`. Add attached value forms for value switches and
standalone `--help`/`-h`. Human output remains the default; do not invent other
formats. `--json` and `--format json` are alternative declarations: duplicate
or combined declarations fail. Severity accepts case-insensitive BLOCKER,
HIGH, MEDIUM and LOW, normalizes once, and rejects any other value.

Reject unknown/positional tokens, repeats including aliases, boolean attached
values, missing/empty/blank/control-bearing values and mixed help/work options.
Separate path values beginning with `-` fail as ambiguous; attached dash-leading
paths are literal data. Ordinary spaces are supported. Never expand shell
syntax, environment variables or tilde. Validate the whole invocation before
scan/triage reads or destination allocation. Import/help scans nothing and
creates nothing. Help describes defaults, literal paths, failure thresholds,
fresh destinations and local-evidence limits.

Default scanning remains rooted at the installed repository, independent of
caller cwd. Explicit relative triage/output paths use caller cwd. No implicit
save/default artifact is introduced. Read-only output preflight may follow
argument validation but must precede scanning when saving was requested.

Validate direct `runSastScan` options before source work: non-null object,
present root/triage path strings, roots array of nonblank/control-free strings,
known threshold and a valid Date for `now`. Missing options retain defaults;
explicit malformed values cannot disappear through truthy fallbacks. Preserve
valid custom roots, empty roots, existing relative-root semantics and all
existing exports. Direct scanning remains synchronous and never saves.
Do not introduce CLI root overrides or globally constrain established helper
APIs. Missing triage policy retains the existing empty-policy behavior.

### 2. Faithful report with detected-secret projection

Preserve payload fields: `drill_type: "sast_security_scan"`, UTC `timestamp`,
`status: "success" | "failed"`, `passed`, `scannedFilesCount`,
`totalFindingsCount`, `triagedFindings`, `expiredFindings`, `activeFindings`,
`blockingActiveFindings` and normalized `failOnSeverity`.

Build a separate CLI/evidence projection; do not mutate the direct scanner
result or policy objects. For every SAST-04 finding occurrence, including
nested triaged/expired findings and duplicate blocking references, replace
`snippet` with a fixed redacted marker. If a SAST-04 suppression carries a
matching `snippet`, redact that projected field too. Preserve rule IDs, file,
line, severity, ordering, counts and verdict. Human output uses the same safe
projection. Other findings and approved policy metadata remain intentional
local evidence; document that this is targeted detected-secret redaction,
not a universal secret detector for arbitrary source/reason/rationale text.

Completed blocking/expired evaluation remains a complete failed report: save
when requested, print complete JSON when selected and exit nonzero. Do not
turn evaluation failure into an execution exception or omit its evidence.
Internal scan/parser/serialization failure produces no fabricated successful
report. Validate report structure/counts/verdict consistency before saving.

### 3. Exclusive, bounded, verified saving

Only explicit output saves. Require an absent destination, including dangling
links; reject root/trailing-separator/directory targets and symlink or
non-directory ancestors. Preflight records existing parent identities without
writes. Recheck them during allocation/publication. A recorded parent that
disappears must not be silently recreated. Create only missing parents with
0700 mode and preserve existing parent permissions.

Serialize once, including newline. Saved UTF-8 receipt bytes must fit the
unchanged dossier consumer's 1 MiB ceiling before directory allocation. This
is an engineering compatibility bound, not measured scanner capacity. No-save
JSON need not inherit a save-only byte limit.

Use an owned exclusive 0600 same-directory staging file; handle short/zero
writes, open/write/close faults and owned descriptor closure. Close and reopen
with no-follow/nonblocking checks; verify a regular file's identity, bounded
size, complete bytes and independently validated parsed report. Detect
tampering, truncation, growth and ordinary replacement before publication.
Do not rely only on write success or a mocked validator verdict.

Publish with an exclusive atomic hard link. Never overwrite-rename, truncate,
unlink retained evidence or use a destructive fallback. A competing late
destination survives unchanged and this invocation fails. Cleanup affects
only owned staging/descriptors; foreign replacements, racing outputs and
published evidence survive. Preserve retryable ownership on cleanup failure;
bounded retries cannot turn a recorded cleanup fault into success. Do not
recursively remove new parents. Output/cleanup failure after publication
retains the receipt and exits nonzero.

Document unsupported hard links, interruption/orphan-staging limits and the
fact that path identity checks do not defeat a hostile same-UID administrator.
Do not add an unrelated signal framework.

### 4. Controlled diagnostics, completion and truthful exit

Use fixed categories for invocation, scanning, serialization, publication,
cleanup and output failure. Diagnostics must not contain rejected values,
private source/triage/output paths, raw parser errors, arbitrary exceptions
or stacks. Human findings retain useful projected identity/severity/location
and counts; omit raw triage/output destination banners.

`--json` emits exactly one complete report after completed evaluation,
including failed evaluation. Invalid/internal/publication failures may omit
JSON but cannot claim success. Exit 0 requires valid invocation, completed
passing evaluation, requested verified publication, successful cleanup and
successful output. Natural draining with `process.exitCode` and stream error
handling replaces immediate exits. Broken pipes and synchronous/output
callback failures yield controlled nonzero status without uncaught stacks.
Human failure output never prints a passing completion.

### 5. Hermetic behavior and consumer regressions

Retain eight-rule and exact ANALYZE suppression regressions. Use existing
`node:test`, finite disposable installations, `process.execPath`, bounded
child timeouts, allowlisted environments and finally cleanup. Exclude
credentials, proxies, NODE_OPTIONS, BASH_ENV and ENV. Use deterministic scoped
fault hooks rather than UID-dependent permission assumptions or timed races.

Cover import/help side effects; changed caller cwd; literal spaced/attached
paths; all invalid/repeated/conflicting arguments and direct options before
reads; no-save allocation absence; human/JSON/save parity; each threshold;
passing, active-blocker and matching-expired-suppression cases. Preserve valid
exact path, line/lines, snippet and first-matching suppression behavior.

Cover retained files/directories/links/dangling links, ancestor faults and
deterministic late competing outputs; modes; private staging; short/zero
writes; size ceiling before allocation; tampered readback; injected filesystem
faults; cleanup retry/foreign replacement; published receipt preservation.
Canaries in rejected values and thrown errors must not appear in diagnostics.
Canary detected secrets must disappear from all projected finding locations
without altering counts/identity or mutating direct results. Large finite
JSON on failing evaluation must parse completely; broken pipes fail cleanly.

Install the real SAST child into existing unified-runner fixtures, copying
only its actual dependency closure. Stub every unrelated stage. Exercise
clean, active-blocker and expired-match fixtures. Assert registered receipt
name, JSON/verdict, stage/dossier summary, and unchanged readiness acceptance
or rejection. A failed child cannot approve stage 2 even when a receipt exists.
Synthetic consumer acceptance is not operator or production sign-off.

Establish baseline rule/discovery/triage parity against the planning commit
with a fixed `now`, excluding timestamp and deliberate secret projection.
Document count changes caused by new scanned implementation code rather than
updating rules/suppressions to make the gate pass.

## Non-goals and residual work

No AST/scanner replacement, added rule, severity-policy change, suppression
renewal, missing-policy redesign, full policy schema validation, invalid-policy
date redesign, recursive-source resource bounds, source-path confinement,
universal redaction, external scanning service, SARIF, provenance attestation,
deployment or launch approval. Current regex/discovery and malformed-policy
limitations remain explicitly documented; do not describe this as complete
SAST coverage. Load additional skills and obtain scope direction before
crossing unrelated surfaces.

## SKILLS USED

- `sast-configuration`: Preserve rules, triage gates and actual scanner scope.
- `deployment-pipeline-design`: Preserve stage 2 child/receipt/exit contracts.
- `secrets-management`: Detected-secret projection, controlled diagnostics and
  credential-free fixtures.
- `security-best-practices`: Safe-default invocation and local artifact saving;
  no dedicated standalone Node CLI reference is installed.
- `error-handling-patterns`: Early rejection, ownership, fault propagation and
  truthful naturally drained process completion.
- `javascript-testing-patterns`: Existing Node behavioral tests and scoped faults.
- `e2e-testing-patterns`: Focused actual-child integration and independent teardown;
  no browser journey is introduced.
- `requesting-code-review`: Mandatory independent review after self-verification.
- `receiving-code-review`: Verify findings, fix valid issues and re-review material
  publication/compatibility changes.
- `caveman-commit`: Required compact local Conventional Commit, without push.

Broader Phase 12 Nest, topology/threat-model, CI, telemetry/Grafana, SQL,
Playwright and UI manifests do not trigger for this bounded CLI producer step.
Reassess if execution needs those surfaces.

## Verification, review, documentation and completion

Re-read this approved prompt and every named skill before editing. Record
BASE_SHA and preserve unrelated work. Run from repository root:

```bash
node --check scripts/ops/run-sast-scan.js
node --check scripts/ops/run-sast-scan.spec.js
node scripts/ops/run-sast-scan.js --help
npm run ops:sast-test
npm run ops:sast
npm run ops:launch-drill-test
npm run ops:readiness-test
npm run ops:launch-readiness-test
npm run ops:sbom-test
npm run ops:container-test
npm run ops:templates-test
npm run ops:templates
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Run typecheck and build sequentially. Check changed JS/prompt with installed
Prettier; format new documentation regions without rewriting history. Quote
actual outputs/exits. If aggregate ops checks stop at the existing dependency
audit, report the exact result and unreached stages, and independently run
affected suites. Do not claim aggregate success or upgrade dependencies in
this scope. `ops:sast` without output is authorized local inspection.

Inspect the full diff and changed files before dispatching one read-only
reviewer with the loaded template, prompt, owning contracts, BASE_SHA/HEAD_SHA,
uncommitted diff and real checks/limitations. Reviewer must not mutate or
delegate. Evaluate feedback with `receiving-code-review`, fix verified issues,
retest and obtain follow-up review for significant changes. Resolve Critical
and Important findings before completion.

Record final invocation/projection/publication contracts, baseline parity,
real outputs, review, rollback and residual limits in owning docs. Update safe
regeneration instructions; keep Phase 12 and operator sign-offs open. Rollback
is a reviewed normal revert, never deletion of retained evidence.

Give safe inspection commands: standalone help, `npm run ops:sast-test`, and
`npm run ops:sast` without output. Stage only approved files, inspect staged
diff, and commit locally to `main` with `caveman-commit`. No push. Preparing
this prompt authorizes no implementation, staging or commit.
