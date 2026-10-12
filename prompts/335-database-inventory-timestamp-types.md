# Phase 12K — Validate database inventory timestamp types

## Scope and why next

Continue Phase 12K recovery-evidence consistency after committed Prompt 334,
10b06909114e3181f717ae944b43e3c3b72c3ee0, on clean main. User `i` plus
“implement plan when finished” authorizes writing, re-reading and executing
exactly this prompt without another approval question.

The inventory query projects three dates: StoredObject.deletedAt,
StoredObject.createdAt, and Upload.expiresAt AS uploadExpiresAt. Their committed
storage migration uses timestamptz; unlike earlier unrelated tables' timestamp(3),
these require PostgreSQL TIMESTAMPTZ OID 1184. Defined wrong type metadata is
currently ignored even for empty results or plausible string dates. These dates
control lifecycle exclusions, so contradictory descriptors must fail closed.

## References read and authority

AGENTS.md; docs/build-plan.md Phase 12/latest records; docs/skills.md;
docs/operations.md topology/recovery/latest record; docs/launch-checklist.md
Category 6; docs/security.md latest adapter records; docs/backend.md;
docs/system-architecture.md §§11.3–11.4; docs/product.md recoverable-operations
acceptance; package.json; scripts/ops/reconcile-storage-objects.js/.spec.js/.ts;
server/prisma/schema.prisma StoredObject/Upload and
server/prisma/migrations/20260824170000_storage_queues_uploads/migration.sql;
installed pg/lib/result.js, pg-types/lib/builtins.js, pg-types/lib/textParsers.js;
installed Next CLI guide node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md.
No visual/API/route changes or comp measurements. No CLI-specific security
reference exists in the security skill; installed driver and repo contracts
supply authority. No new boundary, Nest code, CI, metrics or UI, so the parent
phase's conditional surface skills do not apply to this bounded step.

## Exact behavior

In queryDatabaseStoredObjects's existing descriptor loop, each defined
dataTypeID for deletedAt, createdAt and uploadExpiresAt must equal primitive
numeric 1184. Use strict comparison without coercion. Omitted/undefined fields
and type metadata remain supported. Reject wrong OIDs (including TEXT, DATE,
TIMESTAMP without timezone), null, malformed primitives, boxed/reference types,
nonfinite values and coercion traps. Keep byteCount's 25 check and all existing
projection/format/mode/command/count/row checks independent.

Do not change SQL, date parsing, lifecycle logic, row conversion/order, caller
ownership, client cleanup, CLI/environment, storage, receipt schema or Stage 7.
Nondate/non-byteCount type IDs remain opaque, particularly custom enum OIDs.
Invalid results throw fixed Database inventory is invalid. Runners return 1
with one query, zero S3 sends, no injected cleanup, only the connecting log and
Error: Database query failed, and no summary/receipt/temporary file. Valid
empty/populated results still publish simulation evidence.

## Files and execution

Only source/spec, this prompt, docs/operations.md, docs/build-plan.md,
docs/security.md and docs/launch-checklist.md may change.

1. Re-read prompt and skills. Confirm clean main and base SHA.
2. Correct databaseInventoryFields's three date descriptors to 1184, and the
   existing opaque-type acceptance fixture to preserve date descriptors while
   retaining opaque enum/other-column IDs. Preserve prior assertions.
3. Add focused test-first cases covering each date column with empty and
   populated wrong-OID results, representative malformed values without
   exhaustive Cartesian expansion, frozen ownership and coercion traps.
4. Test omitted/undefined/1184 compatibility, ordered bigint conversion, nullable
   dates and independent previous guards. Exercise installed pg Result offline
   for timestamptz Date parsing and wrong-type rejection; no live DB claim.
5. Test runner failure for each date column, including a populated plausible
   date string, exact diagnostics, zero storage effects and no artifacts. Test
   valid empty/populated simulation publication.
6. Run red suite, add one compact date-descriptor predicate with migration
   comment, run green. Resolve and fix actual failures without weakening tests.

## Verification, review, documentation and commit

Run direct node --test scripts/ops/reconcile-storage-objects.spec.js and
npm run ops:reconcile-test; node -c source/spec; CLI --help; installed Prettier
on added tests/changed guard; git diff --check; npm run lint; npm run build;
then npm run typecheck sequentially. Capture real output/exits. Restricted
worker failures may require normal local escalation, and are not suite totals.
Run independent offline stages resolved from package.json ops:check, excluding
online ops:audit under the documented registry metadata-disclosure restriction;
inspect every result, no full aggregate ops:check/fresh audit claim. Run the
checked-in readiness example validator and report expected fail-closed state.

After self-verification dispatch one read-only reviewer with base/head, actual
diff, this prompt and check logs; no edits/subdelegation. Evaluate feedback
against migration/driver reality with receiving-code-review. Fix valid findings,
retest and re-review significant changes. Record actual implementation, red/green,
checks, review, compatibility, limits and safe inspection in operations with
concise matching build-plan/security/Category 6 records. Inspect staged diff and
commit locally to main using caveman-commit. No push or follow-on prompt.

Metadata consistency cannot authenticate responses, prove complete inventories,
verify object bytes, establish atomic snapshots or approve live recovery.
Prompt 201, Category 6 live approval and Phase 12 exit remain open. No live
services, migrations, deployment, credentials, mandatory metadata, generic OID
validation or hostile in-process object defense. Ordinary commit revert restores
prior behavior without database/storage mutation.

Inspect locally with npm run ops:reconcile-test and
node scripts/ops/reconcile-storage-objects.js --help.

## SKILLS USED

- `architecture-patterns`: existing adapter boundary.
- `deployment-pipeline-design`: recovery evidence gates.
- `error-handling-patterns`: whole-result fixed diagnostics.
- `secrets-management`: private errors and offline checks.
- `security-best-practices`: strict comparison without coercion/disclosure.
- `postgres-best-practices`: committed timestamptz schema and driver semantics.
- `javascript-testing-patterns`: focused adapter and runner regression.
- `requesting-code-review`: independent read-only review.
- `receiving-code-review`: verify reviewer findings.
- `caveman-commit`: required local Conventional Commit.
