# Phase 12K — Reconciliation diagnostic failure cleanup

## Scope and why next

Continue the open recovery gate after committed Prompt 346 (`6903f10`). The
runner supports injected diagnostic writers, but acquisition catches call
io.error before owned PostgreSQL cleanup. A throwing writer can bypass that
cleanup. Correct these three failure paths as one bounded lifecycle step.
The user instructed implementation after planning; re-read and execute this
prompt without another approval question.

## References and authority

Read AGENTS.md, docs/build-plan.md Phase 12 and latest records,
docs/operations.md topology/recovery and Prompts 342–346,
docs/launch-checklist.md Category 6, docs/security.md TM-19 and latest records,
docs/system-architecture.md §§11.3–11.4, docs/product.md, docs/backend.md
current-state distinction and docs/skills.md. Inspect main and lifecycle tests
in scripts/ops/reconcile-storage-objects.{js,spec.js}. Verify end's Promise
contract from node_modules/pg/lib/client.js. No skill specifies the exact pg
API; installed code is authority. No visual surface, comp measurement,
Next/React API, SQL or schema is changed.

## Implementation

Allowed files: this prompt, reconciliation source/spec, docs/operations.md,
docs/build-plan.md, docs/security.md and docs/launch-checklist.md.

1. Append regression tests before changing source. Inject throwing io.error
   for connection, query and listing failure with an actually runner-owned pg
   client. Verify end is attempted exactly once and awaited before the writer;
   preserve the writer's exact thrown object and keep its private content out
   of recorded output. Cover synchronous and rejected cleanup failures and
   successful deferred cleanup. Storage finally must still destroy its owned
   S3 client once when the diagnostic throws.
2. Cover caller-owned PostgreSQL clients (never ended), database constructor
   failure (no returned client), storage constructor failure (pg cleanup,
   no S3 destroy), and injected inventories as relevant bypasses. Assert no
   receipt or successful summary is produced on these failures. Use restored
   prototype/export descriptors, synthetic credentials and temporary paths.
3. Move fixed diagnostic emission after existing awaited guarded pg cleanup in
   the connection/query/listing catches. Keep storage try/finally intact.
   Do not catch or suppress the diagnostic writer exception; normal writers
   retain exact strings and return/exit codes. Do not redesign logging,
   introduce factories, retries/timeouts or alter successful publication.
4. Existing owned/caller lifecycle tests must remain intact. No dependencies,
   live services, credentials, migrations, deployment, operator approval or push.

## Verification

Run the new cases red before the source change, then npm run ops:reconcile-test.
Run source/spec node -c, CLI --help, added-region installed Prettier check,
npm run lint, npm run build and subsequent sequential npm run typecheck,
git diff --check. Check the readiness example still fails closed and record
actual output. These focused and repository checks are sufficient for this
local reorder; do not rerun unrelated complete ops suites or online ops:audit.
No aggregate ops:check or fresh vulnerability inventory claim.

Use requesting-code-review to dispatch one independent read-only reviewer
without subdelegation after self-verification: base/head 6903f10 plus working
diff, requirements, changed paths and actual check logs. Evaluate feedback
using receiving-code-review, fix verified defects and re-review significant
changes. Document outputs, review, compatibility and limits in operations,
with concise matching build-plan/security/Category 6 records. Inspect staged
diff; commit locally to main using caveman-commit, without pushing.

## Expected impact, compatibility and rollback

No route changes. Normal diagnostics, exit codes, comparison and receipt
contracts stay unchanged. A throwing diagnostic now occurs after guarded owned
database cleanup; it still rejects main. S3 finally still executes. This does
not promise recovery from a hung cleanup, process kill or logging outage.
Ordinary revert restores previous behavior without data mutation. Prompt 201,
Category 6 live sign-off and Phase 12 exit remain open. Synthetic cleanup tests
cannot prove authenticity, completeness, bytes or atomic/live recovery.
Inspect safely with npm run ops:reconcile-test and
node scripts/ops/reconcile-storage-objects.js --help.

## Non-goals and conditional skills

No UI, browser, CI, monitoring, trust boundary, architectural decision, SQL,
secret or infrastructure changes. Phase-wide skills for those unchanged
surfaces have no trigger in this bounded continuation.

## SKILLS USED

- `deployment-pipeline-design`: preserve recovery and operator acceptance gates.
- `error-handling-patterns`: preserve cleanup when failure reporting throws.
- `javascript-testing-patterns`: isolated offline lifecycle failure tests.
- `requesting-code-review`: independent review after self-verification.
- `receiving-code-review`: verify feedback before applying changes.
- `caveman-commit`: required local Conventional Commit.
