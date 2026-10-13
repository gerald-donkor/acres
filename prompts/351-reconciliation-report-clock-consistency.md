# Phase 12K — Reconciliation report clock consistency

## Scope and why next

Continue the earliest open launch phase, Phase 12K, after committed Prompt 350
(8f0856c). The reconciliation comparator validates `options.now` and uses its
`currentTime` for quarantine retention, but stamps the report with a separate
`new Date()` read. Identical explicit inputs therefore produce different
evidence and the reported instant can disagree with the retention decision.
Use the validated comparison instant for the report timestamp. The user's
instruction to implement after planning authorizes execution after re-reading
this prompt, without another approval question.

## References and authority

Read AGENTS.md workflow, prompt/check/commit contracts and product invariants;
docs/build-plan.md Phase 12, sequence gates and recent records;
docs/operations.md recent reconciliation records; docs/launch-checklist.md
Category 6 and operator handoff; docs/security.md recent recovery records;
docs/system-architecture.md §§11.3–11.4; docs/product.md product job and data
classification; docs/backend.md current/target bridge; docs/skills.md.
Inspect scripts/ops/reconcile-storage-objects.js normalizeComparisonOptions,
reconcileObjects, formatter, publication and main, and its .spec.js clock and
retention tests. Existing local Date/getTime/toISOString calls and node:test
fixtures verify the APIs used. No Next, React, Tailwind, SDK or SQL API changes;
no visual comp or measurements apply. The security skill has no general Node
CLI reference; this task uses existing validation and does not introduce a
trust boundary or claim timestamp authenticity.

## Implementation contract

Allowed paths: this prompt, scripts/ops/reconcile-storage-objects.js and its
.spec.js, docs/operations.md, docs/build-plan.md, docs/security.md and
docs/launch-checklist.md. No scripts, dependencies, schema or service changes.

1. Append offline behavioral tests prefixed `report clock consistency:`.
   Cover fixed Date and string clocks, UTC-offset normalization, milliseconds,
   epoch zero and representable Date boundaries. Freeze caller records/options,
   compare complete repeated reports, and assert caller inputs remain unchanged.
2. Exercise quarantine records at exactly seven days and one millisecond older:
   the timestamp must equal the clock that determines exclusion versus missing.
   Include clean, missing, mismatched and orphan outcomes, retaining counts,
   statuses, exit codes and execution modes. Test the timestamp in the terminal
   formatter and a published simulation receipt using a temporary directory.
3. Cover the default clock and explicit undefined with before/after bounds;
   avoid sleeps or global clock mocking. Preserve invalid-clock rejection and
   existing permissive Date string parsing. No new CLI clock option or main
   injection hook. Timestamp means comparison instant, not publication finish.
4. Run new cases red. Change only report timestamp construction to
   `new Date(currentTime).toISOString()`, reusing the already-validated instant.
   Retain retention semantics, validation, raw inventories, output schema,
   status/exit policy, publication exclusivity and resource ownership.
5. Run focused green and complete reconciliation suite.

## Verification, review and records

Capture real output under /tmp/acres-351-*.log. Run source/spec node -c, CLI
--help, installed Prettier on appended tests, npm run lint, npm run build,
then sequential npm run typecheck, and git diff --check. Retry sandbox-limited
checks with supported permission escalation and report both actual outcomes.
Run the example readiness validator read-only (expected exit 1). Do not rerun
unrelated ops suites or online audit or claim aggregate ops:check success.

Self-review actual diff, then dispatch one independent read-only reviewer
using requesting-code-review with base/head 8f0856c plus working diff, this
prompt, requirements and check logs. Reviewer must not edit or subdelegate.
Evaluate feedback with receiving-code-review, verify/fix valid issues and rerun
affected checks; re-review significant changes. Record exact results, review,
compatibility, limits and ordinary-revert rollback in operations, with brief
matching build-plan/security/Category 6 records. Inspect staged diff and commit
only task paths locally to main using caveman-commit. No push.

## Impact, non-goals and inspection

Reports with explicit `options.now` become reproducible; default reports stamp
the comparison instant rather than a later wall-clock read. No routes/UI,
production services/credentials, deployment, operator sign-off, live restore
or launch approval. This cannot authenticate a caller clock, prove inventory
completeness/byte integrity or establish atomic/live recovery. Prompt 201,
Category 6 live sign-off and Phase 12 exit stay open. Ordinary revert restores
prior timestamps without database/storage mutation. Inspect with:

```bash
npm run ops:reconcile-test
node scripts/ops/reconcile-storage-objects.js --help
```

## SKILLS USED

- `deployment-pipeline-design`: preserve launch and recovery evidence gates.
- `error-handling-patterns`: retain validated clock failure behavior.
- `security-best-practices`: preserve input validation and evidence limitations; Node CLI reference gap noted above.
- `javascript-testing-patterns`: deterministic behavioral offline regressions.
- `requesting-code-review`: dispatch independent review after verification.
- `receiving-code-review`: verify findings before fixes.
- `caveman-commit`: required compact local commit message.

Architecture, CI, secrets, telemetry, database, UI and browser surfaces do not
change; their phase skills have no implementation surface in this bounded step.
