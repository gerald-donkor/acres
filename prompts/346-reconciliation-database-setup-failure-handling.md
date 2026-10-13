# Phase 12K — Reconciliation database setup failure handling

## Scope and why next

Continue earliest open Phase 12K recovery hardening after committed Prompt 345
(`1e1c620`) on clean main. `main` constructs PostgreSQL outside its acquisition
try, so setup exceptions reject instead of returning the fixed diagnostic and
exit code. This is the next bounded failure-path correction after storage
setup handling. Synthetic failure injection demonstrates the gap; no live
provider failure or leaked resource is asserted. The user explicitly requested
execution after planning; re-read this file and execute without another approval.

## References read and verification authority

AGENTS.md §§2–10; docs/build-plan.md Phase 12, sequence gates and latest
implementation records; docs/operations.md topology, recovery and Prompts
342–345; docs/launch-checklist.md Category 6 and latest record;
docs/security.md TM-19/current recovery limits; docs/system-architecture.md
§§11.3–11.4; docs/backend.md resolved/current backend distinction;
docs/product.md product scope; docs/skills.md skill triggers.
Read scripts/ops/reconcile-storage-objects.js main and its spec, package.json
scripts, and node_modules/pg/lib/client.js constructor/cleanup. No skill owns
the exact pg constructor API; installed code verifies it. No UI, styling,
Next API, visual reference or geometry measurement applies.

## Implementation steps and allowed files

1. Keep existing password selection/missing-password behavior and configuration.
   Place driver require/client construction inside the existing connection try.
   Minimize movement; preserve caller client/inventory bypasses.
2. Setup exceptions follow `Error: PostgreSQL connection failed`, set/return 1,
   and optional process.exit(1); no query, S3 acquisition, report or receipt.
3. Guard cleanup on an actually returned client as well as runner ownership.
   Do not call end on an unreturned client. Preserve one awaited guarded end
   attempt after actual connection failure. Constructor internals that throw
   before returning cannot be torn down by this caller.
4. No factory abstraction, timeout/retry, lifecycle rewrite, config validation,
   SQL/schema, inventory, receipt or public-contract changes.

Allowed changes: this prompt; reconciliation source/spec; docs/operations.md,
docs/build-plan.md, docs/security.md, docs/launch-checklist.md. No dependencies,
server/client, CI, live-service or operator-approval changes.

## Behavioral regression tests

Append serial offline tests before source editing. Stub pg Client export using
restored descriptors, both constructor throw and export getter throw (driver
export acquisition failure, not a claim of actual module-load failure). Stub
storage export to count forbidden construction; synthetic env only. Temporary
private output paths must remain absent. Assert resolved code 1, exact fixed
error, no private sentinel, no summary/query/connect/end/send/destroy. Cover
caller-owned pg client and injected db inventory bypasses, missing password
preflight, and child-process immediate exit for both setup failures. Caller
client bypass must remain unclosed and successful receipt must be clean.
Restore stubs and remove fixtures. Preserve all existing tests.
Run new cases red before source fix, then full reconciliation suite green.
Format only added test region using installed Prettier, avoiding legacy churn.

## Verification and review

Run node -c source/spec, CLI --help, npm run ops:reconcile-test, npm run lint,
npm run build followed by sequential npm run typecheck, added-region formatting
and git diff --check. Run independent offline stages resolved from ops:check;
inspect actual exits/counts. Omit online ops:audit under the documented metadata
disclosure restriction; do not claim aggregate ops:check or a fresh audit.
Example readiness must still fail closed with unresolved categories. No live
services/drills, credentials or launch approval.

After self-verification dispatch one independent read-only reviewer, without
subdelegation, using requesting-code-review/code-reviewer.md. Provide base/head
1e1c620 plus working diff, requirements and real logs. Evaluate feedback against
actual code with receiving-code-review; fix valid findings and rerun affected
checks; re-review significant changes. Record actual red/green totals, checks,
review, compatibility and limits in operations and concise matching build-plan,
security and Category 6 records. Inspect final staged diff and commit locally
to main with caveman-commit; do not push.

Ordinary revert restores prior setup handling without DB/storage mutation.
Prompt 201, Category 6 live approval and Phase 12 exit remain open. Fixed
failure handling cannot establish evidence authenticity, inventory completeness,
byte integrity or atomic/live recovery.
Inspect safely with npm run ops:reconcile-test and
node scripts/ops/reconcile-storage-objects.js --help.

## Non-goals and conditional skills

No UI or visual changes; no live infra, credentials, launch, deployment, push,
new architecture, trust boundary, dependency, CI, SQL or scanner changes.
Phase-wide Nest/architecture/security-audit/monitoring/browser skills have no
changed surface in this bounded continuation.

## SKILLS USED

- `deployment-pipeline-design`: retain recovery and operator acceptance gates.
- `error-handling-patterns`: keep setup failures inside acquisition policy.
- `javascript-testing-patterns`: isolated offline failure and bypass tests.
- `requesting-code-review`: independent review after self-verification.
- `receiving-code-review`: verify feedback before applying changes.
- `caveman-commit`: required local Conventional Commit.
