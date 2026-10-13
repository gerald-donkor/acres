# Phase 12K — Reconciliation owned storage client cleanup

## Scope and sequence

Continue the earliest open phase, Phase 12K operations/recovery hardening, after
committed Prompt 341 (`0e4856a`) on clean main. The CLI creates an S3Client in
main when storage inventory and a caller client are absent, but never calls
its destroy method. Socket agents can outlive a completed or failed listing.
This bounded lifecycle fix is dependency-safe and independently verifiable
offline. It does not complete the operator-owned launch gates.

The user entered `i`, then explicitly instructed implementation when planning
finishes. Write and re-read this prompt, then execute without another approval
question. Complete verification, independent review, records and local main
commit. No push.

## References and contract verification

Read AGENTS.md §§2–10; docs/build-plan.md Phase 12 and sequence gates/latest
records; docs/skills.md; docs/operations.md recovery and latest records;
docs/security.md; docs/launch-checklist.md Category 6;
docs/system-architecture.md §§11.2–11.4; docs/backend.md and docs/product.md.
Inspect scripts/ops/reconcile-storage-objects.js and .spec.js, package.json,
and the installed node_modules/@aws-sdk/client-s3/dist-types/S3Client.d.ts.
That declaration defines destroy(): void and explicitly recommends destroying
Node clients to close their socket agents when no longer needed. The installed
dist-cjs implementation delegates destroy to its parent. No new API is needed.

This standalone Node CLI has no UI, routes, geometry, CSS, motion or breakpoint
changes; comps and Next implementation guides do not apply. No security-skill
reference covers standalone Node CLI resource ownership; use verified installed
SDK declarations, existing runner ownership and behavioral tests.

## Required behavior

1. If main creates the storage client for acquisition, call destroy exactly
   once after listBucketObjects settles, both on success and on listing failure.
   Put cleanup in the existing acquisition try/catch/finally so validation,
   pagination and send errors cannot bypass it. Defer the optional immediate
   process.exit until after finally, since it bypasses JavaScript unwinding.
   No later runner work uses S3.
2. Never destroy caller-supplied options.s3Client, including failed listings.
   If storageObjects are injected, no storage client is constructed or used.
   Help, invalid usage and database acquisition failure remain earlier exits.
3. Treat synchronous destroy failures as best-effort cleanup, consistent with
   existing suppressed PostgreSQL end errors. Preserve the original exit code,
   fixed private diagnostics, report and publication semantics. Do not expose
   cleanup errors or retry destroy; do not claim cleanup succeeded when it throws.
4. Preserve every acquisition validation, SQL, comparison, receipt schema,
   exclusive publication, client injection API and caller PostgreSQL ownership.
   Destroy must happen before formatting/publication after successful listing.
5. No new dependency, factory option, resource abstraction or public API.

## Files and implementation steps

Allowed changes: this prompt; scripts/ops/reconcile-storage-objects.js and
.spec.js; records in docs/operations.md, build-plan.md, security.md and Category 6
of launch-checklist.md.

1. Re-read this prompt and load every skill below before code.
2. Add bounded behavioral tests that exercise actual main-owned S3Client
   construction offline. Temporarily stub the installed S3Client prototype
   send/destroy methods and restore their property descriptors in finally.
   Keep tests serial and do not call the real transport or read credentials.
   Use explicit synthetic env/config and injected database inventories/clients.
3. Cover successful empty and populated listings, missing/mismatching objects,
   strict orphan failure, malformed and thrown listing errors, and receipt
   publication failure. Assert client identity, send counts, one destroy call,
   ordering before report/publication, preserved result/diagnostics and files.
   Exercise both normal and throwing destroy for each path. Use absent output
   paths under fresh /tmp directories, clean them in finally, and preserve exit
   state. Never print synthetic exception sentinels as operational errors.
4. Add direct caller-owned success/failure and injected-inventory cases proving
   no destroy. Preserve all existing ownership assertions and fixtures.
5. Run the suite red before source changes, recording actual behavioral failures.
6. Add one compact finally block to the existing storage acquisition try/catch:
   if the client is runner-owned, invoke destroy in a guarded best-effort try.
   Preserve report and pg cleanup behavior. Defer listing-failure return/exit
   until after finally, using one local failure flag. Add a real child-process
   regression proving immediate exit follows destroy. Run green and inspect diff.
7. Format only changed source/test regions using installed Prettier. Avoid
   reformatting unrelated legacy code.

## Verification and review

Run and record actual outputs/exits:

```bash
npm run ops:reconcile-test
node -c scripts/ops/reconcile-storage-objects.js
node -c scripts/ops/reconcile-storage-objects.spec.js
node scripts/ops/reconcile-storage-objects.js --help
npm run lint
npm run build
npm run typecheck
git diff --check
node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json
```

Build/typecheck sequentially. Resolve package.json ops:check into its independent
offline stages, execute and inspect all results. Omit online ops:audit under the
recorded dependency-metadata disclosure restriction; do not claim aggregate
ops:check or fresh vulnerability results. Do not run live services, deployment
or recovery drills. Distinguish sandbox limitations from code failures and use
permitted equivalent execution when necessary.

After self-verification dispatch one independent read-only reviewer using
requesting-code-review/code-reviewer.md, BASE/HEAD `0e4856a` plus working diff,
this prompt, actual check logs and scope/limitations. No reviewer subdelegation.
Evaluate with receiving-code-review, fix verified findings, rerun affected
checks and re-review material changes before documenting and committing.

## Records, exit and rollback

Record red/green, SDK authority, lifecycle/ownership and cleanup-failure policy,
actual checks and independent review in docs/operations.md. Add matching concise
records to build-plan/security/Category 6. The fix releases owned client agents;
it cannot prove live recovery, remote completeness, checksums or atomic snapshots.
Prompt 201, Category 6 live approval and Phase 12 exit stay open. Ordinary commit
revert restores prior lifecycle without database or storage mutation.

Exit: owned clients receive exactly one cleanup attempt after listing; caller
clients are untouched; prior results and private diagnostics remain compatible;
checks/review complete; authorized files committed locally to main.
Inspect safely with npm run ops:reconcile-test and CLI --help.

Non-goals: database/SQL/schema changes, new boundaries/architecture, API/facade,
UI, CI, credentials, dependency updates, live services, deployment, approvals,
and push. Phase-wide Nest/browser/monitoring/workflow skills have no changed
surface here.

## SKILLS USED

- `architecture-patterns`: preserve acquisition/comparison and resource ownership.
- `deployment-pipeline-design`: maintain recovery and launch evidence gates.
- `error-handling-patterns`: finally cleanup without replacing primary failures.
- `secrets-management`: synthetic config and fixed private diagnostics only.
- `security-best-practices`: preserve trust/ownership boundaries and safe failures.
- `javascript-testing-patterns`: behavioral lifecycle and failure regressions.
- `requesting-code-review`: independent read-only review after self-verification.
- `receiving-code-review`: verify feedback against requirements and actual code.
- `caveman-commit`: required concise local commit with rationale.
