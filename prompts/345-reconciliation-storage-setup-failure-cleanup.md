# Phase 12K — Reconciliation storage setup failure cleanup

## Scope and why next

Continue the earliest open phase, Phase 12K recovery hardening, after committed
Prompt 344 (`c670f0a`) on clean main. The storage SDK require and S3Client
construction run outside main's storage acquisition try/catch, after database
connection/query. Setup exceptions bypass the fixed listing diagnostic, awaited
owned database cleanup, return code and optional immediate exit. Bring setup
under the existing acquisition error policy. This is an offline failure-injection
finding; no live socket leak or real provider setup fault has been measured.
The user instructed implementation after planning; re-read and execute this
prompt without another approval question.

## References read

AGENTS.md §§2–10; docs/build-plan.md Phase 12/sequence gates/latest records;
docs/operations.md recovery runbook and Prompts 342–344; docs/launch-checklist.md
Category 6; docs/security.md; docs/system-architecture.md §§11.2–11.4;
docs/backend.md and docs/product.md current/target distinction; docs/skills.md.
Inspect scripts/ops/reconcile-storage-objects.js main/listBucketObjects and
its spec; package.json scripts; installed node_modules/@aws-sdk/client-s3/
dist-cjs/index.js S3Client constructor and node_modules/pg/lib/client.js end.
No loaded skill owns the exact SDK constructor API; installed code verifies it.
No visual reference or measurement applies: no UI, route, Next API or styling
changes. SDK probes with malformed string regions/endpoints did not throw at
construction; tests must describe synthetic setup failures honestly.

## Implementation and constraints

1. Move SDK require/owned S3Client construction inside the existing storage
   acquisition try, immediately before listBucketObjects. Keep config unchanged.
2. A setup throw follows existing listing failure handling: fixed
   `Error: Object storage connection or listing failed`, one guarded awaited
   end attempt for runner-owned PostgreSQL, exit/return 1, no report/receipt.
3. Guard owned S3 destruction with existence of an actually returned client.
   Never call destroy on undefined after failed construction. Preserve finally
   destruction once on successful construction and listing success/failure.
4. Retain injected-client/inventory ownership, existing ordering and immediate
   exit semantics. No factory/helper abstraction, retries, timeouts, SQL,
   receipt schema, broad lifecycle refactor or changed inventory validation.
   Constructor internals that throw before returning cannot be torn down by
   this caller; no stronger guarantee is claimed.

Allowed files: this prompt, reconciliation source/spec, docs/operations.md,
docs/build-plan.md, docs/security.md, and Category 6 docs/launch-checklist.md.
No dependencies, CI, server, browser, trust-boundary or operator record changes.

## Behavioral tests before source edit

Append serial tests using restored property descriptors on installed SDK
S3Client export and pg Client prototype. Synthetic constructor throws a private
sentinel; synthetic pg connect/query succeed with empty rows. Use isolated
private temporary output paths and synthetic env; never read credentials or
open transports. Cross resolving/rejecting/synchronously throwing database end
with owned and caller-owned pg clients. Assert fixed error, exit 1, no rejection,
no summary or receipt, one same-receiver owned end (zero for caller), and zero
send/destroy calls for an unreturned storage client. Add deferred end proving
await before settlement, injected DB inventory failure, caller S3 bypass and
injected storage inventory bypass of constructor, and bounded child-process
immediate-exit coverage proving awaited end before exit. Restore every stub
and clean fixtures. Preserve all previous tests. Run new cases red before fix,
then the full reconciliation suite green. Format only added regions with the
installed Prettier; avoid rewriting legacy files.

## Verification, review and records

Run source/spec node -c, CLI --help, npm run ops:reconcile-test, npm run lint,
npm run build then sequential npm run typecheck, git diff --check and added
region format check. Run every independent offline stage from package.json
ops:check, inspecting each exit and suite count. Omit online ops:audit under
the recorded metadata-disclosure restriction; no full ops:check/fresh audit
claim. Example readiness must still exit 1 with unresolved categories.
No live services/drills or launch approval.

After self-verification dispatch one read-only reviewer, no subdelegation,
using requesting-code-review/code-reviewer.md with base/head c670f0a and working
diff, this prompt, scope and actual logs. Evaluate feedback using
receiving-code-review; verify and fix valid findings, rerun affected checks,
and re-review significant changes. Record actual results, red/green evidence,
review, compatibility and limits in docs/operations.md and concise matching
build-plan/security/Category 6 records. Inspect staged diff and commit locally
on main using caveman-commit; do not push.

Ordinary revert restores previous handling without DB/storage mutation.
Prompt 201, Category 6 live approval and Phase 12 exit remain open. Resource
cleanup cannot authenticate evidence, prove completeness/bytes or atomic/live
recovery. Inspect safely with npm run ops:reconcile-test and
node scripts/ops/reconcile-storage-objects.js --help.

## Non-goals and conditional skills

No live infrastructure/credentials, operator sign-off, launch/deployment/push,
new timeout policy, SQL/migrations, UI, dependency or CI changes. Phase-wide
Nest/architecture/scanner/monitoring/browser skills have no touched surface
in this bounded continuation; no new security review is requested.

## SKILLS USED

- `deployment-pipeline-design`: retain recovery and launch acceptance gates.
- `error-handling-patterns`: protect primary acquisition outcome and cleanup.
- `javascript-testing-patterns`: isolated offline lifecycle failure injection.
- `requesting-code-review`: independent read-only review after verification.
- `receiving-code-review`: check reviewer findings against code and requirements.
- `caveman-commit`: required local Conventional Commit.
