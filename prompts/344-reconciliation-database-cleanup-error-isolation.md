# Phase 12K — Reconciliation database cleanup error isolation

## Scope and why next

Continue the earliest open phase, Phase 12K recovery hardening, after committed
Prompt 343 (`d7dcf78`) on clean main. Four later main() cleanup branches use
`await pgClient.end().catch(...)`. They suppress rejected Promises but a
synchronous end exception escapes query/listing failures, or enters the report
catch and attempts cleanup twice after successful publication. Apply the same
guarded await policy established for connection failure to those four sites.
This is offline-verifiable error isolation, not live recovery acceptance.

The user explicitly instructed implementation when planning finishes. Re-read
this prompt and execute without another approval question.

## References read and authority

- AGENTS.md workflow, phase-control, product, checks, review and commit rules.
- docs/build-plan.md Phase 12 and sequence gates/latest records.
- docs/operations.md recovery runbook and Prompts 342–343.
- docs/launch-checklist.md Category 6; docs/security.md Category 6/latest records.
- docs/system-architecture.md §§11.2–11.4; docs/backend.md; docs/product.md;
  docs/skills.md for skill selection.
- scripts/ops/reconcile-storage-objects.js main() and its spec; package.json.
- node_modules/pg/lib/client.js end(): synchronous stream/connection closure
  precedes its returned Promise, so rejected-Promise handling alone is narrower
  than a guarded await. No loaded skill owns the pg API; installed code does.

No UI, visual reference, measurement, breakpoint, Next API, route, schema, SQL,
trust boundary, worker, CI or dependency changes are involved.

## Exact implementation

1. At the four existing owned-client cleanup sites (database-query failure,
   storage-listing failure, completed report/publication, report/publication
   catch), replace chained Promise catch with try { await pgClient.end(); }
   catch { ... } and a short best-effort primary-outcome comment.
2. Preserve each existing ownership condition, placement, diagnostic, report,
   receipt, return code and optional immediate process exit. Attempt cleanup
   once per reached path; suppress synchronous throws and Promise rejections.
   Caller-owned clients remain open. Do not export a helper or add a factory,
   timeout, retry, cleanup receipt or new lifecycle abstraction.
3. Leave the already-fixed connection-failure path unchanged. Preserve S3
   destruction in finally, including when database end fails. A cleanup attempt
   is not proof of successful teardown; a stalled end remains outside scope.

Allowed changes: this prompt, scripts/ops/reconcile-storage-objects.js and its
spec, docs/operations.md, docs/build-plan.md, docs/security.md and Category 6 in
docs/launch-checklist.md. No unrelated formatting.

## Behavioral verification before source edit

Use actual installed pg Client construction with serial prototype stubs for
connect/query/end and restore descriptors with test cleanup. Use synthetic env,
isolated temporary receipts, and no transport. Exercise query failure, listing
failure, clean report, missing-object report, existing-receipt publication
failure and report-generation failure (throwing IO summary logger) crossed with
resolving/rejecting/synchronously throwing end. Assert same receiver, one end,
primary fixed error/exit, no private sentinel leakage, appropriate summary and
receipt state, no storage request after query failure, and S3 destroy even when
listing and end fail. Preserve exclusive existing receipt contents.

Add deferred-end tests proving main awaits cleanup across the four sites;
caller ownership coverage on those sites; and bounded child-process tests with
real process.exit for query/listing failure and nonzero report/publication
outcomes. Do not broaden acquisition validation or rewrite previous tests.
Run the new cases red, apply compact fix, then run full reconciliation green.
Format/check only added regions with installed Prettier.

## Checks, review and completion

Run node -c source/spec, CLI --help, npm run ops:reconcile-test, npm run lint,
npm run build followed sequentially by npm run typecheck, git diff --check.
Run all independent offline stages resolved from package.json ops:check and
inspect every exit/count. Omit online ops:audit under the documented metadata
disclosure restriction; do not claim aggregate ops:check or fresh audit.
Run example readiness validator; expected unresolved exit 1 is not launch
approval. No live services or live drills.

Self-review final diff, then dispatch one read-only reviewer using
requesting-code-review/code-reviewer.md with base/head d7dcf78 plus working
diff, this prompt, actual logs and scope. No subdelegation. Evaluate using
receiving-code-review; fix verified findings and repeat affected checks/review
if changes are substantial. Record real red/green outputs, installed authority,
review assessment and sandbox limits in docs/operations.md with concise matching
build-plan/security/Category 6 records. Commit locally on main with caveman-commit;
inspect staged diff and do not push.

Ordinary revert restores previous cleanup behavior without DB/storage mutation.
Prompt 201, Category 6 live approval and Phase 12 exit remain open. Cleanup cannot
establish evidence authenticity, completeness, byte integrity or atomic recovery.
Safe inspection: npm run ops:reconcile-test and
node scripts/ops/reconcile-storage-objects.js --help.

## Non-goals and conditional skills

No live services/credentials, operator sign-off, deployment, push, resource
timeouts, refactor, browser/UI, SQL/schema, dependency or CI changes. Phase-wide
Nest/architecture/security-scanner/monitoring/browser skills have no touched
surface in this bounded continuation; no new security review is requested.

## SKILLS USED

- `deployment-pipeline-design`: preserve launch/recovery acceptance gates.
- `error-handling-patterns`: preserve primary outcomes during best-effort cleanup.
- `javascript-testing-patterns`: offline lifecycle and failure isolation tests.
- `requesting-code-review`: independent read-only review after self-verification.
- `receiving-code-review`: verify feedback before acting.
- `caveman-commit`: required local Conventional Commit.
