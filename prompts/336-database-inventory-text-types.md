# Phase 12K — Validate database inventory text types

## Scope and why next

Continue Phase 12K recovery-evidence consistency after committed Prompt 335,
e36f14ae6289c2534d38997427cab45a08bd1b5e, on clean main. User `i` followed
by “implement plan when finished” authorizes preparing, re-reading and executing
this one prompt without another approval question.

The fixed inventory SELECT projects six native text columns: id,
organizationId, bucket, objectKey, checksumAlgorithm, checksumHex. Unlike its
byteCount cast and three timestamptz columns, defined type metadata for these
columns is currently ignored. Contradictory descriptors can therefore produce
apparently valid inventories, including empty results. Validate this entire
bounded text-column group together. Custom state/uploadState enum OIDs are
deployment-dependent and remain opaque.

## References and authority

Read AGENTS.md; docs/build-plan.md Phase 12 and latest verification records;
docs/skills.md; docs/operations.md topology, recovery tooling and Prompt 335;
docs/launch-checklist.md Category 6; docs/security.md latest adapter record;
docs/backend.md; docs/system-architecture.md §§11.3–11.4;
docs/product.md recoverable-operations acceptance; package.json;
scripts/ops/reconcile-storage-objects.js and .spec.js;
server/prisma/migrations/20260824170000_storage_queues_uploads/migration.sql;
node_modules/pg/lib/result.js; node_modules/pg-types/lib/builtins.js;
node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md.

The committed migration declares all six columns as text; installed pg-types
identifies TEXT as OID 25. UUID defaults do not make the id column UUID-typed.
No visual change, reference crop, pixel measurement, route or public API change.
The security skill has no CLI-specific reference; local driver/schema contracts
provide authority. No new trust boundary, Nest implementation, CI, telemetry,
browser journey or UI is touched, so skills for those surfaces do not apply.

## Required behavior and compatibility

In queryDatabaseStoredObjects's existing descriptor loop, a defined dataTypeID
for any of the six native text columns must equal primitive numeric 25, using
strict comparison and no coercion. Combine with the existing byteCount TEXT
check if that keeps the guard clearer. Reject wrong built-in/custom OIDs,
strings, null, boxed values, objects, nonfinite/fractional numbers and coercion
traps. Rejection is whole-result, including empty inventories, with the fixed
Database inventory is invalid error before conversion or storage requests.

Keep omitted/undefined fields and type metadata compatible, correct TEXT/date
descriptors accepted, enum OIDs opaque, frozen caller objects unmodified,
nullable checksums and ordered bigint conversion intact. Preserve independent
row/count/command/mode/name/format/date guards. No SQL, schema, parser, lifecycle,
comparison, client ownership, CLI/env, receipt, publication or Stage 7 changes.

Runner failures must return 1, execute one query and zero S3 requests, leave
injected clients open, emit only the connecting log and fixed Error: Database
query failed diagnostic, and publish no summary, receipt or temporary artifact.
Existing valid empty/populated simulation publication remains passing.

## Files and implementation steps

Only this prompt, scripts/ops/reconcile-storage-objects.js/.spec.js,
docs/operations.md, docs/build-plan.md, docs/security.md and
docs/launch-checklist.md may change.

1. Re-read this prompt and invoke all listed skills before editing code.
2. Update the two existing optional byteCount/date descriptor acceptance
   fixtures so only state/uploadState use arbitrary 99999 OIDs. Keep prior
   assertions; default databaseInventoryFields already supplies correct TEXT.
3. Add test-first coverage for every text column with empty/populated results
   and a wrong string-producing OID (VARCHAR 1043). Add representative malformed
   values distributed over the columns; avoid a redundant Cartesian explosion.
4. Cover omitted/undefined/25 descriptor compatibility on frozen empty and
   populated inputs, opaque enum OIDs, nullable checksum fields, row order and
   bigint conversion; ensure previous metadata guards remain independent.
5. Exercise installed pg Result offline with correct TEXT and wrong VARCHAR
   descriptors, demonstrating that plausible string rows cannot excuse wrong
   metadata. This is not live PostgreSQL evidence.
6. Cover runner failure for all six columns with mixed empty/populated results
   and fixed private diagnostics, no storage calls, no publication or cleanup.
7. Capture the red focused suite, add the compact strict guard with schema
   comment, then capture green. Fix actual failures without weakening coverage.

## Verification and completion

Run node --test scripts/ops/reconcile-storage-objects.spec.js and
npm run ops:reconcile-test; node -c source/spec; CLI --help; installed Prettier
on changed guard/new tests; git diff --check; npm run lint; npm run build;
then npm run typecheck sequentially. Quote real outputs and exits. Restricted
worker/build failures may need ordinary local escalation; wrapper failures are
not full test counts. Run independent offline stages resolved from package.json
ops:check, excluding online ops:audit under the documented registry metadata
disclosure restriction. Inspect every result; claim neither a full ops:check
pass nor a fresh vulnerability audit. Run the checked-in readiness example
validator and report its expected fail-closed state.

After self-verification dispatch one read-only reviewer using the review skill
template, base/head SHA, working diff, prompt and check logs. No edits or
subdelegation. Evaluate feedback against actual migration/driver semantics;
fix valid findings and reverify, re-review significant changes. Record actual
red/green/check/review results, compatibility, limits, ordinary-revert rollback
and safe inspection in operations, with concise matching build-plan/security/
Category 6 records. Inspect staged diff and commit locally to main using
caveman-commit. No push or follow-on prompt.

Metadata consistency cannot authenticate responses, prove completeness, verify
object bytes, establish atomic snapshots or approve live recovery. Prompt 201,
Category 6 live approval and Phase 12 exit remain open. Live services, credentials,
migrations, deployment, mandatory metadata, generic/custom enum OID validation
and hostile in-process object defense are non-goals. Revert restores previous
behavior without DB/storage mutation. Inspect locally with
npm run ops:reconcile-test and
node scripts/ops/reconcile-storage-objects.js --help.

## SKILLS USED

- `architecture-patterns`: existing adapter boundary.
- `deployment-pipeline-design`: recovery evidence gates.
- `error-handling-patterns`: whole-result rejection and fixed diagnostics.
- `secrets-management`: private errors and offline verification.
- `security-best-practices`: strict validation without coercion or disclosure.
- `postgres-best-practices`: committed native text schema and driver semantics.
- `javascript-testing-patterns`: focused adapter and runner regressions.
- `requesting-code-review`: independent read-only review.
- `receiving-code-review`: verify reviewer findings before fixes.
- `caveman-commit`: required local Conventional Commit.
