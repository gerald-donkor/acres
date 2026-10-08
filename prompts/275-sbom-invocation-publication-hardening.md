# Phase 12K — Harden SBOM invocation and artifact publication

## Scope and why this is next

This is a bounded, dependency-safe step within `docs/build-plan.md` Phase 12,
following committed standalone alert verification. Planning baseline is clean
`main` at `4987b163b33fd1fb05df4c96dc5f33db4cfb2829`
(`fix(ops): harden alert rule verification`). Re-establish execution state from
code and git history; a prompt file proves preparation, not implementation.

The unified launch runner's second stage invokes
`scripts/ops/generate-sbom.js --verify-licenses --output <exact-receipt-path>`.
This producer ignores unknown arguments, accepts malformed/repeated switches,
silently treats missing output values as no output, and lacks standalone help.
It creates output parents recursively and writes directly to the destination,
overwriting retained files and following links. It publishes before reporting
license failure, then immediately exits before JSON output. Raw caught errors
expose private paths and parser diagnostics. Eight existing tests primarily
cover inventory/license behavior and one successful artifact invocation.

Harden invocation, controlled diagnostics/exits, and exclusive publication of
the existing SBOM. Preserve inventory extraction, exclusions, sorting, purls,
hashes, license allowlist/banned patterns, compound-expression policy, public
exports and successful consumer fields. Do not turn this into an inventory or
license-policy redesign. Operator sign-off, prompt 201, Phase 12 acceptance and
the existing dependency audit remain open.

Approval authorizes the listed repository work, hermetic tests and verification
commands. No live unified drill, production evidence inspection, deployment,
credential access/mutation, dependency upgrade, publication to a registry or
push is included.

## References read and execution prerequisites

- `AGENTS.md`: phase control, prompt contract, skill loading, checks, review and
  local commit requirements.
- `docs/build-plan.md`: Phase 12, sequence gates and committed prompts 271–274.
- `docs/operations.md`: topology/redaction contract, Phase 12I supply-chain
  inventory, prompt 186 child fields, current publication limits and prompt 274.
- `docs/launch-checklist.md` §4: seven stages, exact registered receipts,
  private staging, 16 MiB SBOM consumer bound and drill/sign-off separation.
- `docs/system-architecture.md` §11: configuration, secrets and launch ownership.
- `docs/security.md`: TM-18, supply-chain evidence and operator-owned provenance.
- `docs/skills.md`: local skill paths and surface-specific loading.
- `scripts/ops/generate-sbom.js` and its complete spec: extraction, license
  validation, exports and actual CLI behavior.
- `scripts/ops/run-launch-drills.sh`: installed child location, stage 2 command
  and registered output destination; its spec's disposable child fixtures.
- `scripts/ops/assemble-launch-dossier.js`: `RECEIPTS`, bounded child loading,
  SBOM timestamp/format checks and `supplyChainBaseline` projection; its spec.
- `scripts/ops/check-launch-readiness.js`: `isSbomEvidence` and
  `validateSupplyChainEvidence`; its spec for unchanged failure consumption.
- `package.json`: existing `ops:sbom`, `ops:sbom-test`, integration and root gates.
- Installed `node_modules/@types/node/fs.d.ts` and `process.d.ts`: synchronous
  file/link APIs, exclusive/no-follow constants and natural output draining.
- `.agents/skills/requesting-code-review/code-reviewer.md`: read-only review
  template and prohibition on reviewer delegation.

Re-read complete relevant functions and test fixtures before editing. Read the
current lockfile and a representative disk-license fallback manifest before
asserting baseline parity. Verify any newly used Node API from installed types,
source or official documentation. No dedicated standalone Node CLI security
reference is installed in `security-best-practices`; apply the loaded skill's
general discipline with verified local APIs. No UI, comp measurement, Next,
React, Tailwind, SQL, HTTP API or telemetry change is involved. Visual references
and breakpoint measurements are inapplicable to this CLI-only step.

## Expected impact and allowed files

Primary changes:

- `scripts/ops/generate-sbom.js`.
- `scripts/ops/generate-sbom.spec.js`.

Narrow integration test additions only where needed:

- `scripts/ops/run-launch-drills.spec.js` and/or
  `scripts/ops/assemble-launch-dossier.spec.js`: real SBOM child under existing
  isolated fixtures, with all unrelated stages stubbed.
- `scripts/ops/check-launch-readiness.spec.js`: actual producer acceptance and
  license-failed receipt rejection if not established by dossier integration.

After verification and review:

- `docs/operations.md`: exact CLI/publication/failure contract, real outputs,
  baseline parity and limits.
- `docs/launch-checklist.md` §4: absent-destination regeneration and safe
  standalone inspection instructions, where needed.
- `docs/build-plan.md`: concise Phase 12 verification record.
- This prompt in the eventual implementation commit.

No parent/consumer implementation, schema, package script, dependency, CI,
scanner, Docker/Compose, runtime boundary or license-policy change. Keep helpers
local to the producer rather than creating a shared publication/CLI framework.

## Implementation requirements

### 1. Strict invocation before generation or allocation

Preserve `--verify-licenses`, `--json`, `--output <file>` and `-o <file>`.
Support `--output=<file>` and `-o=<file>`; add standalone `--help`/`-h`.
Reject unknown flags, positional arguments, repeated switches, aliases specifying
the same output twice, missing/empty/blank/control-containing values, attached
values on boolean switches and help combined with any other argument. Separate
values cannot consume another option; attached dash-leading paths are literal
data. Paths containing ordinary spaces remain supported without shell expansion.
Do not add root/cwd/lockfile CLI flags, force/overwrite modes, defaults that save,
or environment-based option overrides.

Default generation stays installation-root anchored regardless of caller cwd;
explicit relative output resolves against caller cwd. Import/help performs no
lockfile or fallback-manifest reads, generation, license evaluation, output
allocation, network or child execution. Ordinary no-output invocations allocate
no directories, locks or artifacts. Validate all arguments and output preflight
before generation; do not create output parents until a complete report exists.

Validate the shape and existing optional fields of `generateSbom(options)`
before source work so null/array/non-string or blank path inputs cannot silently
select defaults. Preserve no-argument behavior and valid `rootDir`,
`lockfilePath`, `timestamp` and `appVersion` callers; introduce no direct-call
save side effect. Leave compliance policy options and policy semantics unchanged.

### 2. Preserve existing inventory and evaluated verdict

Keep CycloneDX marker/version, tool/application metadata, UUID serial number,
generation timestamp, component ordering/content and current return fields.
Components are sorted deterministically; the whole artifact is not byte-stable
because UUID and timestamp vary. Record that distinction without adding a new
deterministic-serial algorithm. No schema certification, SPDX parser, purl
redesign, package graph reachability, disk-fallback confinement or changed
integrity decoding is part of this step. Name residual source/parser limitations
truthfully in the build record.

When verification is requested, attach the actual `licenseCompliance` result to
the same BOM used for JSON and saving. Its `totalComponents`, `compliant` and
`violations` must agree with the actual evaluation. Preserve the existing
ability to save a completed license-failed BOM for diagnosis; such a run exits
nonzero and cannot print a passing verdict. Without verification, omit the
compliance block as before. Generation/input/internal failure produces no
success-shaped fabricated inventory and no destination artifact.

### 3. Exclusive, verified artifact publication

Only explicit output requests save. Require the effective destination to be
absent, including regular files, directories, symlinks and dangling symlinks.
Reject trailing separators, root/directory targets and symlink/non-directory
ancestors. Preserve existing parent modes; create only needed directories with
0700 permissions. Preflight performs no writes. Recheck relevant paths during
allocation/publication and fail safely on ordinary path substitution; document
that this is not protection against a hostile same-UID filesystem administrator.

Serialize once and validate the generated projection before allocation. Use the
existing 16 MiB consumer ceiling for saved UTF-8 SBOM bytes, including newline;
it is an engineering compatibility bound, not measured capacity. Do not allocate
or publish an oversized receipt. Use a private same-directory owned staging
file opened exclusively with 0600 mode. Handle short/zero writes and descriptor
errors. Close, read back as a regular bounded file, compare complete bytes and
independently check the expected BOM/compliance fields before publication. Do
not trust only a successful write call or stubbed validator return value.

Publish with an exclusive atomic hard link; never use overwrite rename,
destination truncation or unlink-and-replace. A competing destination inserted
after preflight wins unchanged and this invocation fails. Unsupported link
operation/filesystem failure has no destructive fallback. Clean only resources
owned by this invocation; foreign staging, competing outputs and successful
published receipts survive cleanup. Do not recursively remove newly created
parents. Check close/unlink/output failures and report nonzero without erasing
published evidence or claiming success. Retain retryable ownership when cleanup
fails rather than falsely marking the resource released.

Readback/machinery errors never manufacture a passing report. If the artifact
published before a later output/cleanup error, retain it and make the failed
process status explicit. Synchronous work need not invent an asynchronous signal
framework; state any uncatchable-interruption/orphan-staging limit truthfully.

### 4. Controlled diagnostics and complete output

Use fixed failure categories for invalid invocation, generation, serialization,
publication, cleanup and output faults. Never echo rejected options, private
paths, raw parser exceptions, arbitrary error messages or stacks. Human output
may preserve the inventory/license distribution and evaluated violations from
the valid report, but omit raw output/source paths and avoid unchecked object
formatting. Valid inventory/license text is intentional output; do not claim
the tool detects secrets embedded in otherwise valid package metadata.

`--json` emits exactly one complete BOM for completed generation, including
completed license failure, then naturally drains stdout. Exit 0 requires valid
invocation, completed generation, successful requested verification, successful
requested publication/cleanup and successful output. Evaluated license failure
exits 1 with parseable failing JSON when requested. Invalid invocation/internal
or publication failure may omit JSON; never substitute a success-shaped report.
Human failure output never states compliance passed. Handle synchronous writes
and stream errors/broken pipes with controlled nonzero status and no uncaught
stack. Do not call immediate `process.exit` after emitting a report.

### 5. Hermetic behavior and real-consumer regressions

Retain existing inventory/hash/exclusion/license-policy tests. Add finite
disposable installations with small lockfile/manifest fixtures for actual CLI
tests. Use `node:test`, `process.execPath`, bounded child timeouts and allowlisted
environments excluding credentials, proxies, NODE_OPTIONS, BASH_ENV and ENV.
Clean owned fixtures and restore hooks in finally blocks. Avoid live services,
network, Docker, dependency installation and timing-only races.

Cover:

- Import/help read/write-free behavior; installation-root generation with a
  changed caller cwd; literal relative/spaced/attached output values.
- Invalid, unknown, repeated, conflicting, empty and control-bearing arguments;
  invalid direct options fail before reading; no-output paths never allocate.
- Valid complete human/JSON output, verified and unverified save parity, and
  evaluated license failure saved/printed with nonzero exit and rejected by
  existing supply-chain consumers.
- Retained files/directories/links/dangling links, invalid ancestors and trailing
  separators preserved byte-for-byte; deterministic competing destination
  creation immediately before link, without weakening atomic publication.
- 0700/0600 new resources, unchanged existing parent permissions, same-directory
  staging, short/zero writes, incomplete/tampered readback, byte ceiling and
  injected open/write/read/close/link/unlink failures. Foreign resources and
  already published evidence survive. Faults cannot print passing completion.
- Secret canaries in rejected args/private paths and thrown errors never occur
  in diagnostics; intentional valid BOM metadata remains compatible.
- Large finite stdout completion and controlled broken pipe; failed license
  JSON must parse fully rather than being truncated by immediate exit.
- Real producer receipt accepted by unchanged assembler/readiness contracts in
  disposable fixtures; a valid failed-compliance receipt is rejected. If using
  the unified parent, stub all other stages and keep the installed SBOM child
  fixture closure complete. Synthetic acceptance cannot approve production.

Use deterministic scoped injection for permission/fault cases; do not depend on
the current UID being unable to access a file. Demonstrate baseline component,
hash, exclusion and license-count parity excluding variable metadata. Do not
update expected policy values merely to make tests pass.

## SKILLS USED

- `deployment-pipeline-design`: Preserve stage 2 child/exit/receipt contracts and
  separate repository evidence from operator launch decisions.
- `secrets-management`: Controlled diagnostics and credential-free fixtures.
- `security-best-practices`: Secure-default invocation and local publication;
  no dedicated standalone Node CLI security reference is installed.
- `error-handling-patterns`: Early rejection, truthful verdicts, descriptor
  ownership, failed publication/cleanup and natural output completion.
- `javascript-testing-patterns`: Existing Node behavioral suites and scoped
  fault injection without adding a framework.
- `e2e-testing-patterns`: Deterministic actual-child/consumer integration and
  fixture teardown; no browser journey is introduced.
- `requesting-code-review`: Mandatory independent review after self-verification.
- `receiving-code-review`: Verify claims against code/requirements, fix valid
  findings and re-review material failure/compatibility changes.
- `caveman-commit`: Required compact local Conventional Commit, no push.

Broader Phase 12 skills for Nest, architecture topology, threat-model topology,
CI, SAST scanning, SQL, telemetry, Grafana and UI are not triggered by this
bounded producer change. Reassess if execution needs to cross those surfaces.

## Verification, review, documentation and completion

Re-read the approved prompt and every named skill before implementation. Record
BASE_SHA and preserve unrelated work. Run from repository root:

```bash
node --check scripts/ops/generate-sbom.js
node --check scripts/ops/generate-sbom.spec.js
node scripts/ops/generate-sbom.js --help
npm run ops:sbom-test
npm run ops:sbom
npm run ops:launch-drill-test
npm run ops:readiness-test
npm run ops:launch-readiness-test
npm run ops:sast-test
npm run ops:container-test
npm run ops:templates-test
npm run ops:templates
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Run typecheck/build sequentially. Use installed Prettier for changed JS/prompt;
format new documentation regions without rewriting historical records. Quote
actual outputs/exits. If aggregate `ops:check` stops at the existing dependency
audit, report the exact current result and unreached stages, then run the listed
affected suites independently. Do not claim aggregate success or upgrade
dependencies to unblock this bounded change. Ordinary `ops:sbom` reads local
inventory without saving; no unstubbed unified drill is authorized.

Review the full diff and all changed files, then dispatch one read-only reviewer
using the loaded template, this prompt, owning contracts, baseline/current SHAs,
uncommitted diff and exact checks/limitations. The reviewer must not mutate the
checkout or delegate. Apply `receiving-code-review`; verify findings, fix valid
issues, retest affected behavior and seek follow-up review for significant
publication/compatibility changes. Resolve Critical/Important findings before
completion.

Record final contracts, parity evidence, real command output, residual inventory
limitations, review and rollback in `docs/operations.md`; append a concise build
record and update relevant operator regeneration instructions. Do not mark
Phase 12, prompt 201, provenance/security findings or production approval done.
Rollback is a reviewed normal revert, not removal of retained evidence.

Give exact safe inspection commands: standalone help, `npm run ops:sbom-test`,
and `npm run ops:sbom` without output. Stage only approved files, inspect staged
diff and commit locally to `main` using `caveman-commit`. No push. Preparing this
prompt does not authorize execution, staging or committing.
