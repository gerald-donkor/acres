# Phase 12K — Reconciliation direction mark display

## Scope and why next

Continue Phase 12K after committed Prompt 349 (2313c98). Git history,
docs/build-plan.md and the runner establish the recovery gate is still open.
The existing terminal policy escapes embedding/override/isolate controls but
omits U+061C, U+200E and U+200F. These accepted characters reach summaries and
receipt-success paths unchanged. Extend the same display boundary to these
three direction marks. The user's instruction to implement after planning
supplies approval: re-read this prompt and execute without another question.

## References and verified authority

Read AGENTS.md §§2–10; docs/build-plan.md Phase 12, sequence gates and recent
records; docs/operations.md backup/recovery and Prompts 348–349;
docs/launch-checklist.md Category 6 and formal sign-off matrix;
docs/security.md recent terminal display records; docs/system-architecture.md
§§11.3–11.4; docs/product.md §§1, 5; docs/backend.md current-state bridge;
docs/skills.md. Inspect scripts/ops/reconcile-storage-objects.js summaryText,
formatter and main and the neighboring summary/publication tests in its spec.
Local Python unicodedata identifies U+061C as ARABIC LETTER MARK (AL),
U+200E as LEFT-TO-RIGHT MARK (L), U+200F as RIGHT-TO-LEFT MARK (R).
The escaping policy is a bounded project decision, not a claim of universal
terminal sanitization. No visual references/measurements apply. No Next,
React, Tailwind, SQL or SDK API is introduced. Existing String.replace,
node:test, assert, fs/path and IO helpers are verified in local source.
Security skill references have no general Node CLI guide; state that gap.

## Implementation contract

Allowed paths: this prompt; scripts/ops/reconcile-storage-objects.js and its
.spec.js; docs/operations.md, docs/build-plan.md, docs/security.md,
docs/launch-checklist.md. No dependency, scripts, schema or service changes.

1. Append focused offline behavioral tests named `direction mark display:`.
   Cover each of the three marks in missing-object identifiers (objectKey,
   organizationId and id), mismatched keys and orphan keys. Assert literal
   lower-case `\\uXXXX` display, absence of raw marks, unchanged serialized
   reports and expected error/warning statuses. Use frozen synthetic inputs.
2. Cover direct formatter timestamp, status, state and mismatch-issue text
   using these marks, retaining raw JSON values. Add actual-mark versus
   literal backslash escape-looking key distinction. Verify ordinary Arabic,
   Hebrew, accented text and emoji stay readable.
3. Cover each mark in a receipt filename and an existing parent directory
   using main with injected inventories and --dry-run. Assert exit 0, exact
   original destination, parseable simulation receipt, escaped success log,
   no diagnostics, unchanged inventories and no leftover temporary files.
   Include one error-result receipt (exit 1) and one existing-file refusal
   with unchanged bytes and fixed error. No live DB/S3 access.
4. Run new tests red. Extend only summaryText's existing character class with
   U+061C and U+200E–U+200F. Retain single-pass backslash handling and all
   existing ranges. Do not reject/normalize raw inputs, mutate identities,
   export helpers or alter publication/cleanup/status/exit behavior.
5. Run focused green, then the complete reconciliation suite.

## Checks, review and documentation

Capture real results in /tmp/acres-350-*.log. Run source/spec node -c, CLI
--help, installed Prettier for the appended tests, npm run lint, npm run build,
then sequential npm run typecheck, and git diff --check. If sandbox subprocess
limits prevent a check, retry with supported permission escalation; record
both results. Run the readiness example read-only; expected exit 1 does not
approve launch. No unrelated full ops suites or online audit; do not claim an
aggregate ops:check pass or fresh vulnerability inventory.

Self-review all changes and dispatch one independent read-only reviewer with
requesting-code-review. Supply base/head 2313c98 plus working diff, this prompt,
requirements, implementation and real check logs. Reviewer must not edit or
subdelegate. Evaluate with receiving-code-review; verify/fix valid findings,
retest and re-review significant changes. Record scope, exact outputs, review,
compatibility, limits and ordinary-revert rollback in operations; add brief
matching build-plan/security/Category 6 records. Stage only approved paths,
inspect staged diff and commit locally to main using caveman-commit. No push.

## Impact, exclusions and inspection

Terminal rendering of the three marks becomes visible escaped text. Raw JSON,
filesystem paths, identifiers, schema, status, exit codes and resource ownership
remain unchanged. No routes/UI, production services/credentials, deployment,
operator sign-off or live recovery actions. This does not detect all Unicode
confusables, authenticate evidence, prove completeness/byte integrity or atomic
recovery. Prompt 201, Category 6 live approval and Phase 12 exit remain open.
Ordinary revert restores prior display without database/storage mutation.
Inspect using npm run ops:reconcile-test and
node scripts/ops/reconcile-storage-objects.js --help.

## SKILLS USED

- `deployment-pipeline-design`: planning check that launch/recovery gates stay unchanged.
- `error-handling-patterns`: planning check that publication diagnostics and cleanup stay unchanged.
- `security-best-practices`: preserve safe output boundary; Node CLI reference gap above.
- `javascript-testing-patterns`: behavioral offline regressions and fixtures.
- `requesting-code-review`: independent review after self-verification.
- `receiving-code-review`: verify feedback before changes.
- `caveman-commit`: required compact local commit with security rationale.

Architecture, CI, secrets, telemetry, SQL, UI and browser APIs do not change; their skills have no implementation surface here.
