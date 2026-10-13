# Phase 12K — Reconciliation sparse argument validation

## Scope and why next

Continue Phase 12K's open recovery-evidence gate after committed Prompt 351
(`0204acd`). Inspection reproduced a concrete failure: parseCliArguments uses
Array.some to reject non-string arguments, but that skips empty array slots.
A sparse argument reaches arg.startsWith and throws TypeError; main rethrows
it rather than returning the documented usage failure. Validate every argument
slot before parsing. This is a bounded dependency-safe correction within the
open phase, not completion of operator-owned recovery approval.

The user requested implementation when planning finishes. Write and re-read
this prompt, then execute without another approval question.

## References read and API authority

AGENTS.md workflow, phase-control protocol, §§5–10; docs/build-plan.md Phase 12,
sequence gates and latest verification records; docs/operations.md recent
reconciliation records; docs/launch-checklist.md Category 6 and sign-off matrix;
docs/security.md recovery evidence records; docs/system-architecture.md
§§11.3–11.4; docs/product.md product job and data classes; docs/backend.md
current/target bridge; docs/skills.md catalog. Inspect
scripts/ops/reconcile-storage-objects.js parseCliArguments/main and the existing
.spec.js parser, runner, temporary-directory and frozen fixture conventions.
The reproduced local JavaScript behavior and existing for-of/typeof validation
verify the language APIs. No Next, React, Tailwind, SQL or SDK APIs change;
no comp, visual measurements or browser evidence apply. The security skill has
no general Node CLI reference; preserve fixed diagnostics and existing service
boundaries without claiming broader security verification.

## Implementation contract

Allowed files: this prompt; scripts/ops/reconcile-storage-objects.js and its
.spec.js; docs/operations.md, docs/build-plan.md, docs/security.md and
docs/launch-checklist.md. No dependency, script, service, route, schema or
credential changes.

1. Append focused tests named `sparse argument validation:`. Cover leading,
   middle, trailing and all-hole arrays, including holes after help and in
   value positions. Freeze fixtures and prove they are not mutated.
2. The parser must throw ReconcileUsageError with exactly
   `arguments must be an array of strings` for holes and explicit non-strings.
   Replace the skipping .some check with iteration that visits every slot;
   preserve the array guard, cwd validation order and dense-string behavior.
   Do not broaden scope into arbitrary getters/proxies or inherited-array
   property policy. Ordinary process.argv is dense; this corrects exported
   programmatic usage.
3. Runner regressions must resolve to 1, emit exactly the existing usage error
   plus help, and avoid inventory/environment/client access and output creation.
   Use throwing dependency getters and a temporary absent output destination;
   no live clients, network or process.exit mocking. Keep exitOnError default.
4. Positive controls: frozen dense empty/help arrays and a dense dry-run invocation
   with injected empty inventories still return expected results and publish a
   simulation receipt. Preserve missing-value diagnostics for dense strings.
5. Run focused cases red before the source change, then focused green and the
   complete reconciliation suite. Retain all scope filters, output schema,
   status policy, resource ownership and publication semantics.

## Verification, review and documentation

Capture real output in /tmp/acres-352-*.log. Run node -c on source/spec, CLI
--help, installed Prettier on added tests, npm run lint, npm run build, then
npm run typecheck sequentially; git diff --check. Use supported escalation for
sandbox-limited checks if necessary, recording both outcomes. Read-only example
readiness validation is expected to fail closed. Unrelated ops suites and
online audit are out of scope; do not claim aggregate ops:check success.

After self-verification and diff review, dispatch one independent read-only
reviewer per requesting-code-review with base/head 0204acd plus working diff,
this prompt and verification logs. No reviewer mutation or subdelegation.
Evaluate feedback using receiving-code-review, fix verified issues and retest;
re-review significant changes. Record exact results, review and limitations in
operations, with brief matching build-plan/security/Category 6 notes. Inspect
the staged diff and commit only allowed paths locally to main using
caveman-commit. No push.

## Impact, non-goals, rollback and inspection

Malformed programmatic argument arrays now follow the existing usage failure
contract before acquisition/publication. Dense CLI behavior and UI/routes are
unchanged. No live recovery, inventory authenticity/completeness, object-byte
integrity, atomic snapshot or launch approval is established. Prompt 201,
Category 6 live sign-off and Phase 12 exit remain open. No live services,
credentials, deployment or operator approval. Ordinary commit revert restores
prior validation without data mutation. Inspect with:

```bash
node --test --test-name-pattern='sparse argument validation:' scripts/ops/reconcile-storage-objects.spec.js
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## SKILLS USED

- `deployment-pipeline-design`: preserve launch and recovery evidence gates.
- `error-handling-patterns`: classify invalid arguments through the usage boundary.
- `security-best-practices`: preserve fixed diagnostics and pre-acquisition validation; Node CLI reference gap noted above.
- `javascript-testing-patterns`: offline behavioral regressions and immutable fixtures.
- `requesting-code-review`: independent review after self-verification.
- `receiving-code-review`: verify findings before applying fixes.
- `caveman-commit`: required local Conventional Commit message.

Architecture, CI, secrets, telemetry, database, UI and browser surfaces do not
change; their phase skills have no implementation surface in this bounded unit.
