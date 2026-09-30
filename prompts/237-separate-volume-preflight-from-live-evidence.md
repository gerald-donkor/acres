# Phase 12K follow-up — separate volume preflight from live inspection evidence

## Scope and why this is next

Close Category 8 (`volume_encryption`)'s configuration-versus-production
evidence gap. Classify the existing verifier as preflight, preserve its useful
configuration checks, and require a separately inspected live operator child
receipt bound to the approved mechanism, mount inventory and recovery owner.
This is a repository-owned, dependency-safe step within the unfinished Phase 12
exit gate, after prompts 234–236's capacity, rotation and deployment evidence
qualification. Prompt 201 still governs real production evidence and sign-off.

Planning baseline: clean worktree at `fd03f65a2e1da0bd3307552ae0309ac6c752ffbc`
(`fix(ops): require live deployment receipts`). Re-establish committed state on
execution; prompt files alone do not prove implementation.

Verified gaps in current code:

- `verify-volume-encryption.js` accepts the unresolved reference templates and
  emits `status: "success"`, nine passing declaration checks and
  `keySeparation.verified: true`. It does not inspect mounted block-device
  encryption, cloud encryption policy, unlock-material custody or recovery.
- `scanDirectoryForKeys` skips nonexistent paths, stops at a depth limit and
  suppresses filesystem errors. Git failures are also suppressed. Its filename
  heuristic is not proof that no unlock material exists. It also matches TLS
  certificates/private keys; these are not necessarily volume-unlock material.
- `validateVolumeEncryptionReport` accepts three arbitrary passing objects
  without proving PostgreSQL/Valkey/Garage identities, and does not compare
  the receipt with Category 8's mechanism, paths or recovery owner.
- `isVolumeEncryptionCandidate` accepts filenames before excluding dossiers.
  Category 8 evidence-file diagnostics can echo private paths and child errors.
- Stage 4 summarizes these declaration/local-scan checks as a verified baseline;
  the current runbook and sign-off row overstate what that establishes.

Do not solve these gaps by claiming the CLI has new host inspection powers.
Separate preflight from live acceptance and document the existing scan limits.

## References read and execution prerequisites

Planning read: `AGENTS.md` phase-control, workflow, prompt, product, standing
rules and verification contracts; `docs/build-plan.md` Phase 12 and Phase 12K;
`docs/skills.md`; `docs/system-architecture.md` §11.1 and §12;
`docs/security.md` §19 and Phase 12K evidence integrity;
`docs/operations.md` volume inspection runbook, Phase 12H, and prompt 236;
`docs/launch-checklist.md` Category 8, gap register and formal sign-off matrix;
`prompts/201-production-launch-evidence-and-signoff.md` for outstanding operator
authority.

Inspected: complete `scripts/ops/verify-volume-encryption.js`; relevant producer
test setup; volume candidate/helper, Category 8 and safe evidence-file boundary
in `scripts/ops/check-launch-readiness.js`; volume fixture and approved parent
in its spec; Stage 4 in `scripts/ops/run-launch-drills.sh`; volume baseline in
`scripts/ops/assemble-launch-dossier.js`; root `package.json`; volume references
in `scripts/ops/check-production-templates.sh` and readiness schema.

At execution reread the approved prompt, those references, complete affected
test files and `infra/launch/readiness.example.json` /
`infra/launch/readiness.schema.json`. Read existing timestamp, exact-key,
reference and placeholder/secret helpers before reusing them. Inspect complete
launch/dossier tests before changing fixtures. Verify any newly used Node API
through installed references or a small local executable probe. No Next,
React, Tailwind or Nest API changes are needed.

No UI, routes, comps, crops, measurements or breakpoint changes apply. Nine
mount identities below are the installed producer's
`REQUIRED_STATEFUL_MOUNTS`, not a newly chosen production topology or objective.
No standalone Node CLI security reference is supplied by the security skill;
use the verified repository contracts and behavioral tests. Consult the existing
threat model; no new full threat-model report or provider choice is requested.

## Implementation plan

### 1. Identify all current producer receipts as preflight

Add `execution_mode: "simulation"` to every structured receipt currently emitted
by `verify-volume-encryption.js`, successful or failed. Keep `drill_type`,
existing fields, flags, output paths and exit behavior. No CLI invocation may
emit live mode. Concrete env values, existing directories and successful local
scans do not elevate evidence classification.

Correct CLI introduction/help, success/failure text, comments and runbook claims:
it validates declarations and performs limited local filename scans, not actual
host encryption, absence of all keys, dual custody or successful recovery.
Preserve existing configuration validation and local scan behavior in this
prompt. Do not redesign scanner traversal, TLS-key patterns, error suppression,
CLI parsing or failure-publication machinery. Name those limits explicitly.
The `verified` booleans remain qualified preflight fields for compatibility.

### 2. Define strict structural and separately supplied live contracts

Extend `validateVolumeEncryptionReport(report, now)` with optional context,
e.g. `{ requireLive: true, expectedSection }`, retaining exported helper use.
Return false for malformed JSON shapes; do not throw or expose child content.
Require exact recognized `execution_mode: "simulation" | "live"` and the
existing `drill_type: "production_volume_encryption_and_key_separation"`.
Missing, legacy or unknown mode fails; no auto-relabeling.

Retain `status: "success"`, `valid: true`, empty `errors`,
`keySeparation.verified: true` and empty `detectedViolations`. Require exactly
nine `evaluatedMounts`, with each required `(service, containerPath)` once,
all `passed: true`, no duplicate, missing or unknown identities. Require
`totalRequiredMounts` and `validMountsCount` to be safe integers equal to nine
and consistent with the actual collection. Reuse the installed producer's
required identities rather than duplicating an independently drifting list.
Producer-specific extra mount fields remain allowed for simulation.

Accept real nonfuture canonical ISO UTC timestamps with or without `.000`
milliseconds, consistently with neighboring helpers. Reject impossible dates,
invalid explicit clocks, null/array shapes, string booleans and unsafe counts.
Structural simulation passes only these checks and always fails `requireLive`.
Live mode must meet its entire additional contract even without `requireLive`.

The following is a **new operator-supplied receipt**, not existing producer
capability. Live adds:

- `environment: "production"` and trimmed nonempty opaque
  `environment_reference`, `authorization_reference`, `operator_reference`;
- `encryption_mechanism` accepted by the installed `isApprovedMechanism`;
  `key_recovery_owner`; `encrypted_mount_paths`, a unique array of at least
  three concrete absolute POSIX directory paths;
- each of the nine required mount entries contains `host_path` and
  `evidence_reference`, in addition to service/container identity and
  `passed: true`. A mount source must equal or be a directory descendant of
  at least one declared approved root. Every declared root must cover at least
  one actual mount. Shared roots are permitted; the parent contract can name
  a Garage root covering both metadata and data. Do not require nine distinct
  physical disks or nine top-level roots;
- `live_verification`, with exactly `host_encryption`, `key_separation`,
  `dual_custody`, `recovery_procedure`. Each value contains exactly
  `status: "passed"`, `verified: true`, `evidence_reference`.

Observation semantics: inspect each deployed service mount and underlying
encryption mechanism/policy; independently inspect separated unlock-material
custody outside data/backup/git locations; verify dual-custody governance; inspect
the approved owner and documented, tested recovery procedure. Nine mount source
pointers identify inspected service coverage. Never include key bytes,
passphrases or plaintext credentials in any receipt.

All opaque references and owner/mechanism strings must be trimmed, nonempty,
control-free and pass existing placeholder/development/literal-secret rejection
without echoing its diagnostics. Paths must be concrete, normalized absolute
POSIX paths: reject `/`, trailing slashes, empty/dot/dot-dot segments,
backslashes and controls (do not silently normalize attacker input). Match
descendants on directory boundaries, never raw prefix (`/data/db2` is not
inside `/data/db`). Do not stat, resolve symlinks or dereference source pointers;
physical identity and symlink resolution remain independently inspected by
operators. Paths/references are sensitive metadata.

When `expectedSection` is supplied, validate its mechanism/owner/path shape and
compare mechanism and owner exactly with the approved parent, and compare path
sets irrespective of ordering. Reject invalid expected context instead of
disabling comparison. Exact mechanism spelling is deliberate: approved aliases
must be written consistently in parent and receipt. Category 8 must always
supply its approved section for live children. A standalone helper may validate
a live receipt without a parent but cannot by itself authorize launch.

Source references, mode flags and confirmations are unauthenticated assertions.
This change validates content consistency; it does not authenticate provenance,
prove production scope or replace independent inspection. No new top-level
readiness fields, cloud integration or live receipt generator is needed.

### 3. Require bound live evidence for Category 8

Keep existing approver, evidence, key-separation and generic readiness gates.
Strengthen approved Category 8 mechanism/owner/path validation to the same
concrete shape used for live comparison. Preserve the checked-in unresolved
example unchanged, including its three placeholder paths.

Exclude unified dossiers from volume candidates before filename/content checks.
Keep custom filenames, cwd-first/readiness-directory resolution and glob
expansion. Every referenced volume child must pass structural validation, and
at least one complete live child must match the approved Category 8.
A valid classified simulation may accompany live evidence; simulation-only,
legacy-only, dossier-only, prose-only and external-pointer-only evidence cannot
approve. Every live child must match: an unrelated receipt must block beside a
matching one. A failed/malformed child or dossier blocks even beside a valid
live child, including glob matches. Do not automatically fetch external sources.

Extend the narrow safe evidence-file boundary used by Categories 3 and 10 to
Category 8. Use the fixed message
`A referenced volume encryption report is invalid or failed` for missing files,
parse errors, child/dossier failures and malformed nested-value exceptions.
Suppress private paths, child error/status text, scan diagnostics and exception
messages. Retain useful fixed Category 8 field-name and binding failure
messages. Do not refactor unrelated categories' diagnostic contracts.

### 4. Preserve Stage 4 and add hermetic regressions

Stage 4 remains declaration/local-scan preflight. Keep dossier baseline/compliance
field names and meanings compatible, but qualify current human descriptions.
If assembler validation needs adjustment for the required classification,
change only the volume branch and necessary fixtures. A successful simulation
still passes the drill; a 7/7 dossier cannot supply Category 8 live acceptance.
No new orchestration path, target flag, schema redesign or mount operation.

Create distinct producer-shaped simulation and test-only live fixtures. Update
the approved parent fixture to match the new live receipt. Keep production
evidence and actual approvals out of tracked files.

Test actual producer receipt generation in an isolated temporary fixture with
a scrubbed environment, stubbed Git and only test-owned scan directories.
The current CLI defaults its repo/backups roots to its script location: isolate
that location with its required module resolution, or use a narrowly factored
receipt builder plus an isolated CLI harness. Do not add public operator flags
solely for test convenience. Exercise successful sentinel-template preflight,
concrete test paths and a failed configuration receipt; all emitted receipts
must declare simulation. Successful producer output must pass structural
validation and fail live acceptance. Do not scan production/private paths,
follow inherited targets, invoke encryption tools or access KMS. Clean only
temporary directories owned by the tests.

Cover helper and full readiness behavior for:

- missing/unknown/legacy modes; simulation relabeled live without observations;
  incomplete live receipts with `requireLive` omitted;
- exact nine identities, duplicate/missing/unknown identities, swapped service
  paths, unsafe/fractional/string counts, array/null mount entries;
- valid dates with/without milliseconds, impossible/future dates, invalid clocks;
- malformed maps, missing/extra verification keys, wrong/string assertions,
  empty/whitespace/control/placeholder/secret references;
- unsupported/mismatched mechanism, owner mismatch, invalid expected parent,
  differing path sets, order-independent equality, duplicate/nonabsolute paths,
  traversal, prefix confusion, uncovered roots, mounts outside roots;
- valid standalone live helper and matching live child clearing fixture Category
  8; valid simulation alongside it; custom filenames; bad/unrelated child beside
  good child and wildcard expansion; disguised dossier; missing/malformed JSON;
- canaries in paths, errors/status, nested scan diagnostics and formatting
  exceptions, proving Category 8 blockers stay fixed and private-safe;
- Stage 4/dossier still accepting producer-classified preflight and preserving
  verdict consistency. Preserve other readiness regression expectations.

## File scope, non-goals, impact and rollback

Expected changes: `scripts/ops/verify-volume-encryption.js` and its spec;
`scripts/ops/check-launch-readiness.js` and its spec; narrowly required volume
fixtures/validation in existing launch/dossier tests and assembler;
`docs/operations.md`, `docs/launch-checklist.md`, `docs/security.md`, and a concise
Phase 12K record in `docs/build-plan.md`. Other named files are read-only context
unless a directly necessary compatibility assertion requires a narrow update.

No UI/route, product data, application runtime, persistence, provider, dependency,
Compose/Caddy config, workflow, key store or approval-state changes. No host
encryption, key retrieval, recovery/rotation exercise, live mount scan, production
drill, deployment, benchmark, SMTP send or launch approval is authorized.
Other evidence categories and broader scanner hardening remain separate work.
Legacy receipts need regeneration as preflight or separately inspected live
evidence, never automatic relabeling. Rollback is reverting the implementation
commit; no migration or data rollback applies. Operator sign-off remains open.

## Verification, review and completion

1. Inspect installed formatting tools; check changed JS/Markdown without
   installing dependencies, preserve unrelated formatting and quote real output.
2. Run `npm run ops:volume-test`, `npm run ops:readiness-test`,
   `npm run ops:readiness-schema-test`, `npm run ops:launch-drill-test`.
   Do not invoke operational drills against inherited live targets.
3. Run `npm run ops:templates`, `npm run ops:check`, `npm run lint`,
   `npm run typecheck`, `npm run build` sequentially for build/typecheck generated
   file safety, then `git diff --check`. Follow current permission policy for
   necessary audit-network or execution retries; report blocked checks honestly.
4. Run `node scripts/ops/check-launch-readiness.js
   infra/launch/readiness.example.json`; require fail-closed behavior and quote
   actual category/blocker counts. Do not fabricate passing approvals.
5. Self-review the complete diff, then dispatch the independent read-only reviewer
   required by `requesting-code-review` with this prompt, baseline/HEAD SHAs,
   changed files, working-tree diff and actual check results. Evaluate feedback
   using `receiving-code-review`; fix verified findings, rerun affected checks
   and re-review significant changes. No planning subagent is needed.
6. Update current volume runbook, Category 8, Stage 4 descriptions, gap register
   and sign-off row. Qualify historical claims without deleting historical test
   records. Document nine-mount coverage, parent binding, receipt compatibility,
   private metadata, scanner limitations, independent host/custody/recovery
   inspection and unauthenticated provenance. No new AGENTS index row is needed.
   Prompt 201 and Phase 12 remain open.
7. Stage only approved files and this prompt, inspect staged diff and commit
   locally to `main` using `caveman-commit`. Do not push. Give safe inspection
   commands: `npm run ops:volume-test` and `npm run ops:readiness-test`.

## SKILLS USED

- `security-best-practices` — secure-by-default JavaScript receipt parsing; no standalone CLI reference is supplied.
- `security-threat-model` — consult/update existing TM-21 and launch-evidence integrity coverage and residual limits.
- `secrets-management` — separated unlock-material custody and private-safe operator evidence references.
- `error-handling-patterns` — strict structural/live validation and fixed Category 8 evidence failures.
- `javascript-testing-patterns` — hermetic producer regressions and independent simulation/live acceptance fixtures.
- `requesting-code-review` — dispatch independent implementation review after self-verification.
- `receiving-code-review` — verify feedback against actual code and approved requirements before fixes.
- `caveman-commit` — write the required local implementation commit message.
