# Phase 12K — Reconciliation failed database connection cleanup

## Scope and sequence

Continue the earliest open phase, Phase 12K recovery hardening, after committed
Prompt 342 (`80cd784`) on clean main. main constructs a pg Client but its connect
failure branch returns (or exits) without attempting end. The installed
node_modules/pg/lib/client.js end method supports a Promise, handles never
connected/already-ended clients, and closes a failed connection stream. Close
runner-owned clients on this earlier failure path as later query/listing/report
paths already do. This is a bounded offline-verifiable lifecycle correction;
operator-owned launch acceptance remains open.

The user entered i and explicitly requested implementation when planning ends.
Write, re-read and execute this single prompt without another approval question.

## References and verified authority

Read AGENTS.md workflow/product/phase/commit contracts; docs/skills.md;
docs/build-plan.md Phase 12 and sequence gates/latest records; docs/operations.md
recovery/latest records; docs/launch-checklist.md Category 6;
docs/security.md Phase 12K; docs/system-architecture.md §§11.2–11.4;
docs/backend.md and docs/product.md. Inspect scripts/ops/reconcile-storage-objects.js
and its spec, package.json and installed node_modules/pg/lib/client.js end().
Node CLI cleanup has no changed UI, CSS, routes, measurements, motion, Next or
browser surface. No installed skill provides pg-specific connection cleanup;
the installed driver implementation supplies that authority.

## Behavior and implementation

1. Only in main's PostgreSQL connection catch, attempt await pgClient.end() if
   main created that client (existing !options.pgClient ownership convention).
   Do so before optional immediate process.exit and before returning 1.
2. Guard the await with try/catch so synchronous throws and rejected Promises
   from end cannot replace the connection failure. Attempt once, no retry.
   Keep the fixed Error: PostgreSQL connection failed diagnostic; never print
   either underlying exception. Best-effort attempt does not prove teardown.
3. Caller-supplied clients remain open on connection failure. Help, invalid
   arguments, missing password and injected database inventory must not acquire
   or close a database connection. Existing successful acquisition, query failure,
   storage cleanup, comparison and publication behavior stays unchanged.
4. No refactor of later cleanup branches, factory option, dependency, schema,
   SQL, public contract, logging surface or new resource abstraction.

Allowed files: this prompt; scripts/ops/reconcile-storage-objects.js and .spec.js;
records in docs/operations.md, docs/build-plan.md, docs/security.md and
Category 6 of docs/launch-checklist.md.

## Behavioral regressions

Before source edits, add serial offline tests using the real installed pg Client
constructor with connect/query/end prototype stubs, restoring property descriptors
in finally. Use explicit synthetic env PGPASSWORD and isolated /tmp outputs.
Never call a real transport or inspect secrets.

Cover rejected and synchronously thrown connect, each with successful, rejecting
and synchronously throwing end. Assert the same Client receives one end after
connect, zero queries and storage sends, fixed diagnostics, return 1, no summary
or receipt, and no leaked sentinel text. A deferred Promise cleanup case must
prove main waits for end settlement. Caller-client failures must never end.
Injected inventories must not use the supplied database client. A real isolated
child process with exitOnError true must prove cleanup completes before exit 1,
including asynchronous end; protect child execution with a timeout.
Run red before the compact source change, then green. Format only added test
regions with installed Prettier; avoid unrelated legacy formatting.

## Checks and review

Run npm run ops:reconcile-test; node -c for both changed JS files; CLI --help;
npm run lint; npm run build; npm run typecheck (build and typecheck sequential);
git diff --check; installed Prettier check of added test regions. Record actual
outputs/exits. Resolve independent offline package.json ops:check stages, run
and inspect every result. Omit online ops:audit under the recorded metadata
disclosure restriction: do not claim full ops:check or a fresh audit. Run the
example check-launch-readiness validator and expect unresolved exit 1.
Do not run live services or drills. Report sandbox limitations separately and
use permitted equivalent execution if needed.

After passing self-checks, dispatch one read-only reviewer per
requesting-code-review/code-reviewer.md. Provide base/head 80cd784 plus working
diff, this prompt, actual logs, scope and limitations. No subdelegation. Evaluate
feedback using receiving-code-review; verify claims, fix valid findings and
repeat affected checks/review for substantial changes.

## Records, completion and rollback

Record real red/green/check evidence, driver contract, ownership, failure policy,
review evaluation and limitations in docs/operations.md; add concise matching
build-plan/security/Category 6 records. Ordinary commit revert restores prior
lifecycle without DB/storage mutation. Cleanup cannot prove evidence authenticity,
inventory completeness, object bytes or atomic/live recovery. Prompt 201,
Category 6 live approval and Phase 12 exit remain open. Commit authorized files
locally on main using caveman-commit, inspect staged diff, do not push.

Safe inspection: npm run ops:reconcile-test and
node scripts/ops/reconcile-storage-objects.js --help.

Non-goals: live connections, credentials, approval/sign-off, deployment, push,
UI/routes, SQL/schema, other cleanup branches, timeouts/cancellation, architectural
or CI changes. Phase-wide monitoring/Nest/browser skills have no touched surface.

## SKILLS USED

- `deployment-pipeline-design`: preserve recovery and launch acceptance gates.
- `error-handling-patterns`: best-effort awaited cleanup preserving primary error.
- `javascript-testing-patterns`: isolated lifecycle and failure regressions.
- `requesting-code-review`: independent review after self-verification.
- `receiving-code-review`: verify reviewer findings against code and requirements.
- `caveman-commit`: required concise local commit.
