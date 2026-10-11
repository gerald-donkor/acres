# Phase 12K — Close storage receipt publication races

## Scope and why this is next

Continue the unfinished operations/launch gate in `docs/build-plan.md` §§13–14
from `262b83c` (`fix(ops): harden storage reconciliation runner`). Prompt 305 is
implemented, but its `publishReceipt` still falls back from failed hard links
to check-then-rename. POSIX rename can overwrite a destination created between
the check and rename. A planning-time isolated `/tmp` fault-injection probe
forced link `EPERM`, created competing evidence immediately before rename,
and printed `Competing evidence preserved: false` and
`Publisher returned success: true`. This is an observed local race, not evidence
of a production exploit. Closing it precedes further receipt-producer work.

The same publication boundary reflects output paths through interpolated error
messages and `main`'s substring-based trust decision, and suppresses cleanup
errors. Fix these directly related publication failure paths together.

The user explicitly instructed immediate implementation after planning in this
session. Write and re-read this file, then execute without another approval
question. No push or live operations are authorized.

## References read

- `AGENTS.md`: phase controls, prompt contract, checks, review and commit rules.
- `docs/build-plan.md` §§13–14 and committed Prompt 305 record.
- `docs/skills.md`: local skill inventory and scoped triggers.
- `docs/operations.md`: operations foundation and Prompts 278–279, 305.
- `docs/launch-checklist.md` Category 6: simulation preflight versus live acceptance.
- `docs/security.md`: receipt integrity, fixed diagnostics, and Prompts 278–279 limits.
- `docs/system-architecture.md` §11: recovery and secret/diagnostic boundaries.
- `scripts/ops/reconcile-storage-objects.js`, its `.spec.js` and `.ts` facade.
- `scripts/ops/verify-caddy-routing.js` publication helpers: exclusive hard link,
  staged-file identity verification, owned cleanup and fixed failure categories.
- `scripts/ops/run-launch-drills.sh` Stage 7 and
  `scripts/ops/assemble-launch-dossier.js` disaster recovery consumption.
- `scripts/ops/check-launch-readiness.js` and `package.json`.
- `node_modules/@types/node/fs.d.ts`: installed synchronous filesystem APIs.

No visual surface changes; comps, pixel measurement, Next.js, React and
Tailwind API changes are outside scope. No skill specifically documents Node
filesystem publication: verify primitives against installed types, repository
examples and focused real-filesystem tests rather than inventing APIs.

## Expected impact and non-goals

Only storage reconciliation evidence publication and its failure diagnostics
change. Preserve CLI options, runner argv convention, public helper signatures,
reconciliation semantics, JSON schema, simulation mode and Stage 7 caller.
Existing output destinations remain immutable. Unsupported hard-link filesystems
now fail closed instead of receiving an unsafe rename fallback; operators must
select a filesystem supporting exclusive hard links and a fresh absent path.

Do not refactor database/S3 lifecycle, CLI parsing, other producers, product
routes, schema, dependencies, CI or launch approval policy. Do not provision
services, read secrets, run a live drill, perform online audit disclosure,
deploy or push. Hostile same-UID administration and durable crash recovery are
explicit limitations, not solved by pathname checks.

## Implementation

1. Add regression tests before the fix. Use isolated temporary directories and
   scoped Node test mocks restored on all exits. Reproduce competing-file
   publication and unsupported-hardlink failure without timing-based sleeps.
2. Replace `publishReceipt`'s rename fallback with exclusive `fs.linkSync` only.
   `EEXIST` is a controlled collision. All unsupported/error cases fail without
   touching a competitor; never copy or directly write the final path.
3. Keep staging on the same filesystem, exclusive creation and mode `0o600`.
   Validate output paths (nonempty, control-free), immediate parent and ancestor
   directories (reject symlinks), snapshot directory identity and recheck before
   publication/cleanup. Do not create new parent directories or alter permissions
   of existing ones. Verify staged regular-file device/inode identity and exact
   serialized bytes through a no-follow descriptor before linking. Track only
   owned descriptors/files and never unlink a substituted staging entry.
4. Separate publication commit from temporary cleanup. On cleanup failure,
   retry only owned resources once, report failure even if the final hard link
   exists, and preserve the final receipt. Never remove final evidence to repair
   a failed operation. Document retained temporary artifacts after interrupted
   or persistently failed cleanup; never claim crash durability.
5. Use fixed publication diagnostics for invalid output, parent failure,
   destination collision, staging/write/verification/link failure and cleanup
   failure. Do not include paths, raw filesystem errors, stack traces or report
   content. `main` must trust a controlled error identity/category, not message
   substrings. Preserve its existing return-code and runner conventions; do not
   broaden to unrelated lifecycle work. Successful output may continue naming
   the explicitly supplied receipt path as an intentional local identity.
6. Keep TypeScript facade consistent if introducing an exported error; prefer
   an internal error type if public consumers do not need it. Avoid shared
   abstraction extraction for this one boundary.

## Acceptance tests

Preserve all 28 existing tests and add meaningful behavioral regressions:

- Fresh output contains exact JSON plus newline and mode `0600`, with no stage
  orphan on normal success.
- Existing files, directories, symlinks and dangling symlinks are preserved.
- A competitor created at link time wins unchanged; publisher fails.
- Forced `EPERM`, `ENOSYS`, `EXDEV` and ordinary link errors fail without rename,
  copying, final-file creation or retained owned staging when cleanup succeeds.
- Missing/non-directory/symlink parents and symlink ancestors fail safely;
  changed parent/staging identities cannot be treated as verified evidence.
- Serialization/write/read/close/link/cleanup fault injection never reports
  success, leaks private diagnostics or deletes a foreign file. Retry transient
  owned cleanup failures once but still report the observed cleanup failure.
- Post-link cleanup failure preserves complete final bytes and returns failure.
- `main` with injected object arrays returns nonzero and fixed safe diagnostics
  on publication failures, including hostile path/error sentinel strings.
- Unchanged launch/dossier suites consume normal reconciliation schema.

Use real filesystem behavior for collision/permissions tests; mock only precise
fault boundaries and serialize global mocks. Bound all subprocesses if needed.

## Verification and completion

Re-read all named skills before editing implementation. Run and quote actual
outputs for `npm run ops:reconcile-test`, `npm run ops:launch-drill-test`,
`npm run ops:readiness-test`, `npm run lint`, `npm run typecheck`,
`npm run build`, selected-file formatting and `git diff --check`.
Inspect `ops:check` and run every independent offline stage with recorded
individual exit status; skip only online `ops:audit` under the existing
dependency-metadata disclosure restriction. Do not claim a full ops:check pass
or fresh audit result from offline checks. Any environment limitation must be
reported with its actual output and successful permitted retry if available.

After self-verification, dispatch an independent read-only reviewer with this
prompt, baseline SHA, working diff, exact scope and check results using
`requesting-code-review`. Evaluate feedback with `receiving-code-review`, fix
verified findings and re-review significant changes. Record final behavior,
actual checks, the planning probe, fixed historical overclaims, limitations and
normal-revert rollback in `docs/operations.md`; add a concise build-plan record
and Category 6 publication guidance in `docs/launch-checklist.md`. Update the
existing security boundary record to describe this narrow mitigation and limits.
Do not rewrite old prompts or claim Phase 12/operator acceptance is complete.

Stage only approved task files, inspect staged diff, and commit locally to
`main` using `caveman-commit`. Give safe inspection commands in the final reply.

## SKILLS USED

- `architecture-patterns`: preserve pure comparison and filesystem adapter boundaries.
- `deployment-pipeline-design`: Stage 7 evidence publication and failed gate semantics.
- `secrets-management`: fixed diagnostics without private path or credential reflection.
- `security-best-practices`: exclusive publication and safe filesystem failure handling.
- `security-threat-model`: apply existing receipt-integrity threat model; no new standalone report.
- `error-handling-patterns`: controlled publication errors and owned cleanup failures.
- `javascript-testing-patterns`: deterministic Node test fault injection and real filesystem assertions.
- `requesting-code-review`: independent implementation review after self-verification.
- `receiving-code-review`: verify findings, fix and re-review as required.
- `caveman-commit`: required local Conventional Commit with security rationale.
