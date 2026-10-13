# Phase 12K — Reconciliation runner cwd validation

## Scope and why next

Continue Phase 12K recovery hardening after committed Prompt 354 (`6a5da9a`).
The parser rejects non-string/blank base directories, but main passes
`options.cwd || process.cwd()`, silently replacing explicit falsy invalid
values. Local reproduction with --help returned 0 for empty string, null,
false, zero and NaN. Align the runner with its existing parser contract so
invalid configuration cannot redirect relative receipt output or acquire live
dependencies. Only omitted/undefined cwd should default.

The user requested implementation when planning finishes. Re-read this prompt
and load its skills, then execute without another approval question.

## References and APIs

Read AGENTS.md workflow and §§5–10; docs/build-plan.md Phase 12 and latest
records; docs/operations.md Prompt 354; docs/launch-checklist.md introduction,
governance and Category 6; docs/security.md recovery notes;
docs/system-architecture.md operational design; docs/backend.md introduction;
docs/product.md product job; docs/skills.md catalog. Inspect main,
parseCliArguments, usage catch and existing runner/spec fixtures in
scripts/ops/reconcile-storage-objects.js and .spec.js. Reuse verified parser
default parameter semantics, ReconcileUsageError, node:test, assertions and
temporary filesystem APIs. No Next/React/Tailwind/SQL APIs change. No visual
reference, geometry measurement or browser acceptance applies.

## Implementation contract

Allowed files: this prompt; scripts/ops/reconcile-storage-objects.js and
.spec.js; docs/operations.md, docs/build-plan.md, docs/security.md and
docs/launch-checklist.md. No dependencies, schema, routes or package scripts.

1. Add behavioral tests prefixed `runner cwd validation:`. Cover explicit
   empty/whitespace strings, null, false, true, zero, NaN, numbers, bigint,
   arrays and ordinary objects. For each use frozen full argv and options,
   with both --help and a relative --output. Expect return 1, exactly the
   fixed diagnostic `reconciliation usage error: cwd requires a non-empty path`
   and one usage message. Throwing dependency getters prove no env, inventory,
   or client access. Preserve argument/option descriptors; no receipt writes.
2. Run focused tests red before changing production source. Pass options.cwd
   directly to parseCliArguments so its existing undefined default is the
   single source for defaulting and validation. Avoid duplicate validation,
   process.chdir, new filesystem probing or new cwd control policy.
3. Positive tests: omitted/undefined cwd still permits help and relative
   clean simulation publication under the actual process cwd. Use a unique
   temporary directory within that cwd and remove it after the test; do not
   change process cwd. Explicit valid absolute and relative cwd values,
   including a spaced Unicode directory, resolve --output correctly and
   publish clean simulation receipts. Existing --cwd and Unicode output
   compatibility tests must continue passing. Preserve frozen inputs.
4. Keep source change bounded to runner-to-parser cwd forwarding. Hostile
   proxies/getters, invalid options containers, argv overrides, output races,
   resource lifecycle, report schema and all other CLI policies are out of scope.

## Verification and review

Save real outputs in /tmp/acres-355-*.log. Run focused red/green then full
`npm run ops:reconcile-test`, node -c for source/spec, CLI --help, installed
Prettier on only the new test block, root npm run lint, npm run build and then
npm run typecheck sequentially, plus git diff --check. If sandbox subprocess
restrictions interfere use supported escalation and record both results.
Run read-only example readiness, expecting fail-closed rather than approval.
No unrelated full ops:check or fresh online dependency-audit claim.

After self-verification use requesting-code-review to dispatch one read-only
reviewer with base/head 6a5da9a, working diff, this prompt and check logs.
No reviewer edits or subdelegation. Evaluate feedback with
receiving-code-review, fix verified issues, recheck and re-review significant
changes. Record actual evidence in operations and brief build-plan/security/
Category 6 notes. Stage only allowed files, inspect staged diff and commit
locally to main using caveman-commit. Do not push.

## Impact, non-goals, rollback and inspection

Explicit malformed programmatic base cwd fails as usage before acquisition;
omitted/undefined cwd, ordinary CLI behavior and valid paths stay compatible.
No UI, API, SQL, secrets, live services, operator sign-off or deployment.
This is input validation, not authenticity, completeness, byte integrity,
atomic snapshot or live recovery evidence. Prompt 201, Category 6 and Phase 12
exit remain open. Ordinary commit revert restores the old falsy fallback
without mutating DB/storage data.

```bash
node --test --test-name-pattern='runner cwd validation:' scripts/ops/reconcile-storage-objects.spec.js
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## SKILLS USED

- `deployment-pipeline-design`: preserve recovery and launch approval gates.
- `error-handling-patterns`: fail invalid cwd before dependency acquisition.
- `javascript-testing-patterns`: offline runner and real receipt regressions.
- `requesting-code-review`: independent post-verification review.
- `receiving-code-review`: verify feedback against actual code and requirements.
- `caveman-commit`: required local Conventional Commit.

No skill covers Node CLI cwd forwarding specifically; local code verifies its
APIs. UI, SQL, CI, secrets, telemetry and system architecture do not change.
