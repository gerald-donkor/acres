# Phase 12K — Validate database inventory row mode

## Scope and sequence

Continue Phase 12K recovery evidence after committed Prompt 330, commit
`cb3ee0f` (`fix(ops): validate inventory command tags`). The worktree was clean
when planning. Phase 12 remains the earliest unfinished parent; its live
operator evidence and approval gates remain unresolved. This is one bounded,
dependency-safe adapter correction, not completion of Phase 12 or Prompt 201.
The user entered `i`: prepare this prompt only and await execution approval.

The next scope is database inventory row-mode validation. This adapter reads
named fields from object rows and issues a plain SQL string without requesting
array mode. Populated array rows already fail inventory validation, but empty
array-mode results currently pass. A fresh offline probe using the installed
`pg/lib/result` constructor with `new Result('array')`, followed by
`addCommandComplete({ text: 'SELECT 0' })`, returned:

```text
{"rowAsArray":true,"command":"SELECT","rowCount":0,"accepted":0}
{"defaultRowAsArray":false}
```

Reject supplied row-mode metadata that contradicts object-row inventory
semantics, including empty inventories. Preserve metadata omission for injected
adapters. This validates an existing boundary without changing the SQL or
requiring live infrastructure.

## References and verified authority

Planning read AGENTS.md, especially §§2–7 and 8.2–10; docs/build-plan.md Phase 12
and Prompt 330; docs/skills.md; docs/operations.md topology/current inventory
records and Prompt 330; docs/launch-checklist.md Category 6 and shared
prerequisites; docs/security.md latest recovery adapter records;
docs/system-architecture.md §§11.3–11.4; docs/product.md recoverable-operations
acceptance. Reread these relevant sections before implementation.

Inspect scripts/ops/reconcile-storage-objects.js, its .spec.js and .ts facade,
package.json and scripts/ops/audit-dependencies.sh. Installed
node_modules/pg/lib/result.js is the driver authority: rowAsArray is initialized
to the boolean result of rowMode === 'array'; array mode selects
_parseRowAsArray, while default parseRow produces objects indexed by field
name. Verify these semantics locally, without a server. No current skill
provides Node CLI-specific security guidance; use verified driver source,
fixed-error conventions and repository privacy requirements rather than
claiming web-framework guidance covers the CLI.

No UI, route, styling, animation, comp measurement or breakpoint change applies.
No new Next/React/Tailwind API is introduced. Before the required build, inspect
the installed Next CLI guide in node_modules/next/dist/docs/ for the existing
build command. No SQL/schema/API/CI/telemetry/credential surface changes.
Phase-wide NestJS, threat-model authoring, GitHub Actions, scanner, Prometheus,
Grafana, browser and accessibility skills have no triggered implementation
surface in this bounded step. No dependency installation is needed.

## Required behavior and compatibility

1. In queryDatabaseStoredObjects, after the result-record check and before
   conversion, require any defined result.rowAsArray to be exactly primitive
   false. Omitted/undefined metadata remains accepted. Add a compact guard
   alongside the existing metadata checks; use strict equality, no truthiness,
   coercion, normalization or mutation. Keep existing row validation intact.
2. Reject true, null, numbers including 0/-0/1/NaN/infinities, bigint, symbols,
   strings including empty/blank/'false'/'true', boxed booleans, arrays, objects
   and an object whose coercion hooks throw. Emit only the existing fixed
   `Database inventory is invalid` error. Exercise both empty and valid
   populated inventories with otherwise matching SELECT/count metadata.
3. Preserve absent/undefined/false metadata with empty and populated results,
   optional/exact command/count fields, frozen ownership, row order, opaque
   row fields and existing bigint conversion. False must not excuse malformed,
   sparse or duplicate rows, bad command tags or contradictory row counts.
4. Runner rejection returns 1, logs the existing connecting message and fixed
   `Error: Database query failed`, issues one query and zero S3 sends, and
   publishes no summary, final receipt or temporary file. Do not end/destroy
   caller-owned injected clients. Supported results still publish clean
   simulation evidence with correct matched counts.

Only malformed/contradictory supplied row-mode metadata changes behavior.
Keep query text, listBucketObjects, pure comparison, CLI/env precedence,
TypeScript facade, receipt schema/publication and Stage 7 unchanged.
Non-goals: mandatory driver metadata, field/OID validation, SQL selection
changes, atomic DB/S3 snapshots, resource bounds, hostile in-process
getters/proxies, live DB/S3 access, dependency updates, deployment, operator
approvals, push or a second follow-on task. Row-mode consistency cannot prove
completeness, authenticity, byte integrity or successful recovery.

## File changes and test-first execution

1. Reread this approved prompt and load every skill below before code. Resolve
   HEAD and branch afresh; preserve unrelated user work. Do not treat an old
   prompt or prior approval as permission for additional work.
2. Append focused cases to scripts/ops/reconcile-storage-objects.spec.js using
   inventoryDbRecord, createIo, listingClient and isolated temporary directories.
   Retain the 1299 prior cases and their assertions. Use representative invalid
   values covering every category above; avoid gratuitous Cartesian expansion.
3. Direct tests cover empty/populated rejection, exact fixed error, one query,
   frozen ownership and lack of coercion. Compatibility covers absent,
   undefined and false, ordered multiple rows, byte strings converted to
   bigint, and invalid rows/count/command combined with false.
4. Use installed pg Result synthetically to prove completed empty array-mode
   SELECT rejects and completed empty default-mode SELECT accepts. No network
   or fake claim of live driver/database integration.
5. Runner tests cover contradictory/malformed metadata, bounded requests,
   client ownership, diagnostics and an empty output directory. Success tests
   cover valid empty/populated metadata variants, simulation status, matched
   count and exclusive receipt publication. Clean directories in finally.
6. Run the focused spec red before modifying source, capture actual failures,
   then add only the compact guard and explanatory comment in
   scripts/ops/reconcile-storage-objects.js. Rerun green and inspect the diff.

## Verification and acceptance

Run `node --test scripts/ops/reconcile-storage-objects.spec.js` and
`npm run ops:reconcile-test`; `node -c` on source/spec;
`node scripts/ops/reconcile-storage-objects.js --help`; installed Prettier on
changed source/spec regions; `git diff --check`; `npm run lint`;
`npm run typecheck`; and `npm run build`. Quote real output and exit status,
including any sandbox failures. If ordinary child-process execution needs an
escalation, use the available approval mechanism; never weaken checks or claim
restricted file-level wrapper output proves all cases passed.

Resolve independent offline operations stages from current package.json
ops:check and inspect every stage's exit/status and suite totals. Omit online
ops:audit under the recorded registry-metadata disclosure restriction. Claim
neither full aggregate ops:check success nor a fresh vulnerability inventory.
Run `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`
and report its actual expected fail-closed result; the preceding committed
record is 0 approved / 11 blocked / 70 blockers, not a new measurement.
Do not run ops:launch-drill or provide operator evidence.

After self-verification, use requesting-code-review to dispatch one independent
read-only reviewer with this prompt, actual BASE_SHA/HEAD_SHA, working diff,
driver evidence, requirements, compatibility and check output. AGENTS.md
explicitly requires this delegation at implementation time. No subdelegation.
Use receiving-code-review to verify each finding against code and requirements;
fix valid issues, retest, and re-review significant changes before recording
completion. Do not dispatch review during prompt preparation.

Record actual implementation, red/green results, verification output, review,
limitations, inspection steps and ordinary-revert rollback in docs/operations.md.
Add concise corresponding records to docs/build-plan.md, docs/security.md and
Category 6 of docs/launch-checklist.md. Keep Prompt 201, Category 6 live recovery
approval and Phase 12 exit open. Do not claim simulation is live recovery.

Stage only this prompt, source, spec and four documentation files; inspect the
staged diff and commit locally to main with caveman-commit. No push. Return the
commit and safe inspection commands `npm run ops:reconcile-test` and
`node scripts/ops/reconcile-storage-objects.js --help`. Ordinary commit revert
restores previous behavior without a migration or data/storage mutation.

## SKILLS USED

- `architecture-patterns`: keep driver-specific validation in the adapter.
- `deployment-pipeline-design`: preserve recovery evidence and approval gates.
- `error-handling-patterns`: reject whole results before downstream publication.
- `secrets-management`: preserve privacy, fixed diagnostics and offline posture.
- `security-best-practices`: validate contradictory evidence without coercion.
- `postgres-best-practices`: verify installed driver row-mode semantics.
- `javascript-testing-patterns`: meaningful direct/runner regression coverage.
- `requesting-code-review`: independent read-only implementation review.
- `receiving-code-review`: verify feedback before making corrections.
- `caveman-commit`: required local Conventional Commit after execution.
