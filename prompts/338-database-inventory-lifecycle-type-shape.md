# Phase 12K — Validate database inventory lifecycle type shape

## Scope, sequence and authorization

Continue the earliest open parent, Phase 12K recovery evidence, after committed
Prompt 337 at add37bd on clean main. The user requested `i` followed by
“implement plan when finished”, authorizing this one prompt through execution,
review, documentation and local commit without another approval question.

A read-only pre-change probe supplied string dataTypeID values for state and
uploadState with otherwise valid descriptors and an empty inventory. It returned
`{"accepted":0,"malformedEnumTypes":true}` instead of rejecting. Known text/date
columns already validate their supplied type IDs; these two dynamic enum columns
still accept arbitrary JS values. Close this structural gap without inventing
catalog OIDs or asserting that a syntactically valid ID identifies an enum.

## References and verified authority

Read AGENTS.md; docs/build-plan.md Phase 12 and Prompt 337; docs/skills.md;
docs/operations.md recovery adapter and Prompt 337; docs/security.md recovery
boundary and Prompt 337; docs/launch-checklist.md Category 6;
docs/system-architecture.md §§11.3–11.4; docs/product.md operational acceptance;
docs/backend.md; root package.json; scripts/ops/reconcile-storage-objects.js,
its .spec.js and .ts facade; scripts/ops/audit-dependencies.sh.

Installed node_modules/pg-protocol/dist/parser.js parseField uses reader.uint32()
for dataTypeID. node_modules/pg/lib/result.js consumes this ID in getTypeParser.
The storage migration at
server/prisma/migrations/20260824170000_storage_queues_uploads/migration.sql
projects two catalog-assigned enum types, StoredObjectState and UploadState.
Do not hardcode their IDs or require equality/inequality between them.
Unsigned 32-bit representation allows primitive integer numbers 0 through
4294967295. Zero remains structurally accepted; this is not catalog validation.
Read node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md for the
unchanged build check. No new framework API is introduced.

No UI, route, styling, comp measurement, API, schema/SQL, topology, CI, secrets,
telemetry or new trust boundary changes. Those phase-wide skills have no touched
surface. The security skill has no standalone Node CLI reference; installed
driver code and existing private errors govern this change.

## Required behavior

When descriptors are supplied, each defined dataTypeID on state/uploadState
must satisfy Number.isInteger(value), value >= 0 and value <= 0xffffffff.
Do not coerce, trim, stringify, mutate or resolve IDs through the network.
Absent/undefined dataTypeID and absent/undefined result.fields stay compatible.
Reject null, strings, boxed numbers, booleans, bigint, symbol, arrays, objects,
NaN/infinities, negative/fractional values and integers above the uint32 range.
Check both columns even for zero rows. Use existing exact private error
`Database inventory is invalid` before conversion or returning inventory.

Preserve arbitrary uint32 IDs (including zero/-0 and high-bit values), frozen
caller data, complete NULL projection keys, ordering, byte-count bigint
conversion, extra fields and all independent existing descriptor/row guards.
Do not impose new row-value or catalog identity restrictions.

Runner rejection must return 1 after one query, before S3 requests, summary,
receipt or temporary-file publication. Injected clients stay open. Only the
existing connecting log and `Error: Database query failed` may appear. Valid
opaque IDs must retain ordinary clean simulation receipt behavior.

## Files and implementation sequence

Only this prompt, scripts/ops/reconcile-storage-objects.js/.spec.js and
four result records (docs/operations.md, docs/build-plan.md, docs/security.md,
docs/launch-checklist.md) change.

1. Re-read this prompt and load all listed skills before implementation.
2. Append parameterized direct regressions for both lifecycle columns and
   empty/populated results. Use databaseInventoryFields/projectedInventoryRow;
   freeze caller fixtures. Cover invalid types/bounds and throwing coercion hooks.
   Assert fixed errors and one query; leave all 1714 prior tests/assertions intact.
3. Add direct compatibility cases for omitted/undefined IDs and numeric lower,
   ordinary/custom, high-bit and upper boundaries with empty/multiple rows.
   Assert no mutation, row order, nullable keys and bigint conversion.
4. Add runner failures for both columns, empty/populated results and representative
   invalid shapes with isolated temporary output directories; assert exact
   logs/errors, client ownership, zero S3 sends and no artifacts. Add a runner
   success with opaque uint32 IDs and a clean simulation receipt.
5. Exercise installed pg Result offline with a high-bit ID and default string
   parsing; prove acceptance without implying live catalog or restore evidence.
6. Run focused red before source edits. Add one compact condition within the
   existing descriptor loop for these two columns. Run focused green and inspect
   diff. Format only changed source/test regions with installed Prettier.

## Verification, review and completion

Run node --test scripts/ops/reconcile-storage-objects.spec.js and
npm run ops:reconcile-test; node -c source/spec; CLI --help; changed-region
format checks; git diff --check; npm run lint; npm run build; then npm run
typecheck sequentially. Record actual output and exit codes. If sandbox workers
fail, rerun permitted ordinary child processes and distinguish real case totals
from file-level wrapper results.

Run all independent offline stages resolved from package.json ops:check,
inspecting each exit and suite count. Omit online ops:audit under the recorded
registry metadata-disclosure restriction; do not claim aggregate ops:check or
fresh audit. Run the readiness example and record its actual fail-closed counts.

After self-verification dispatch one read-only reviewer using
requesting-code-review/code-reviewer.md, base/head add37bd plus working diff,
this prompt, installed driver semantics and actual check logs. No reviewer
subdelegation. Verify findings with receiving-code-review, fix valid issues,
rerun affected checks and re-review significant changes. Record results after
review in operations, with concise matching build-plan, security and Category 6
records. Include red/green, compatibility, limits, safe commands and ordinary
commit-revert rollback. Inspect staged diff and commit to main with caveman-commit.
No push, live service access, deployment, operator approval or migration.

This closes malformed lifecycle ID shape only. Numeric OIDs remain opaque; no
catalog identity/authenticity, completeness, byte verification, atomic snapshot
or recovery is proven. Prompt 201, Category 6 live approval and Phase 12 exit
remain open. Safe inspection: npm run ops:reconcile-test and
node scripts/ops/reconcile-storage-objects.js --help.

## SKILLS USED

- `architecture-patterns`: preserve the existing driver adapter boundary.
- `deployment-pipeline-design`: preserve launch evidence and rollback gates.
- `error-handling-patterns`: whole-inventory rejection with fixed private errors.
- `secrets-management`: offline fixtures and credential-safe diagnostics.
- `security-best-practices`: reject malformed metadata without coercion.
- `postgres-best-practices`: installed driver and dynamic enum type semantics.
- `javascript-testing-patterns`: adapter/runner behavioral regressions.
- `requesting-code-review`: independent read-only review after self-verification.
- `receiving-code-review`: verify feedback before implementing fixes.
- `caveman-commit`: required local Conventional Commit and integrity rationale.
