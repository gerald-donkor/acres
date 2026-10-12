# Phase 12K — Validate database inventory projected row fields

## Scope and authorization

Continue the earliest open phase, Phase 12K recovery evidence, after Prompt 336
committed at f934137. The user requested `i` and then “implement plan when
finished”; prepare, re-read and execute only this prompt without another
approval question. No follow-on prompt or push.

The adapter now validates the twelve supplied column descriptors, but accepts
rows missing optional projected keys. Such rows contradict the supplied
projection and can conceal checksum or lifecycle evidence. Installed pg
Result.addFields/parseRow builds every named property, including SQL NULLs.
When result.fields is defined and valid, require every returned row to own all
twelve projected properties. Keep values governed by existing validation:
presence does not introduce new non-null constraints or reject own undefined
optional values. Omitted/undefined fields retain legacy partial-row support.

## References and authority

Read AGENTS.md §§2–10; docs/build-plan.md Phase 12 and Prompt 336;
docs/skills.md; docs/operations.md recovery tooling and Prompt 336;
docs/launch-checklist.md Category 6; docs/security.md recovery adapter records;
docs/backend.md; docs/system-architecture.md §11.3; docs/product.md operational
acceptance; package.json; scripts/ops/reconcile-storage-objects.js/.spec.js;
node_modules/pg/lib/result.js; the committed storage migration
server/prisma/migrations/20260824170000_storage_queues_uploads/migration.sql;
node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md for checks.

No route, UI, styling, animation, visual reference or measurement changes.
No new trust boundary, Nest code, CI configuration, telemetry or browser journey;
skills for those surfaces do not apply. The security skill has no CLI-specific
reference: use the installed driver and existing private-error contract.

## Required behavior

After validating supplied field descriptors, but before byte-count conversion,
require Object.hasOwn(row, name) for every fixed projection name. Missing own
keys, including inherited-only optional keys, reject the whole inventory with
exact `Database inventory is invalid`. Check all rows, including later rows;
do not filter, repair or mutate caller data. Empty valid results pass.
Extra row keys remain compatible; do not require exact row key order.
Preserve row/count/command/mode/name/format/type guards independently, nullable
fields, ordered bigint conversion, optional descriptors and opaque enum OIDs.

Runner rejection returns 1 after one query, before S3 sends, summaries or
receipt/temp-file publication. Injected clients remain open. Logs remain only
the connecting message and `Error: Database query failed`; never expose rows,
field names, values or credentials in diagnostics.

## Files and sequence

Only this prompt, scripts/ops/reconcile-storage-objects.js/.spec.js,
docs/operations.md, docs/build-plan.md, docs/security.md and
docs/launch-checklist.md may change.

1. Re-read this prompt and reload its skills before implementation.
2. Add a dedicated complete projected-row fixture for descriptor-bearing success
   cases. Correct older synthetic fixtures only where necessary, retaining all
   previous assertions and explicit omission tests. Do not globally change the
   legacy inventoryDbRecord helper and silently erase omission coverage.
3. Add test-first coverage for missing each of twelve own properties, first and
   later rows; inherited-only optional keys; frozen rows/results; and runner
   rejection for representative nullable/lifecycle omissions. Capture red.
4. Cover valid complete rows with NULL and own undefined optional fields,
   unknown extra keys, reversed key insertion order, ordered bigint conversion,
   empty results, and omitted/undefined descriptor legacy compatibility.
5. Exercise installed pg Result offline: show its NULL fields remain own keys,
   accept its complete rows and reject a copied row with a removed optional key.
   This proves installed driver behavior, not a live PostgreSQL restore.
6. Add the compact own-property guard at the existing adapter boundary. Capture
   green, preserving all existing checks and synthetic publication cases.

## Verification, review and completion

Run node --test scripts/ops/reconcile-storage-objects.spec.js and
npm run ops:reconcile-test; node -c source/spec; CLI --help; installed Prettier
on changed guard/new tests; git diff --check; npm run lint; npm run build;
then npm run typecheck sequentially. Quote real output/exit status. Restricted
workers/builds may need ordinary local escalation; file-level wrapper passes
do not prove case totals. Run all independent offline stages from package.json
ops:check except online ops:audit under the recorded metadata-disclosure
restriction; inspect every result. Do not claim aggregate ops:check or fresh
audit. Run the readiness example; report its actual fail-closed counts.

After self-verification dispatch one read-only reviewer using
requesting-code-review/code-reviewer.md with base/head SHA, working diff,
requirements and check logs. No edits or subdelegation. Evaluate claims against
actual driver, compatibility and tests using receiving-code-review. Fix valid
findings and reverify; re-review significant changes. Record actual checks,
red/green results, review, compatibility, limits, safe inspection and ordinary
commit-revert rollback in operations, with concise matching build-plan,
security and Category 6 records. Inspect staged diff and commit locally to main
with caveman-commit. Every implemented change must be committed; no push.

Metadata/row consistency cannot authenticate responses, prove completeness,
verify object bytes or establish atomic snapshots/live recovery. Prompt 201,
Category 6 live approval and Phase 12 exit remain open. No live services,
credentials, migrations, schema/SQL changes, new row value restrictions,
mandatory descriptors, hostile in-process object defense or generic enum OID
validation. Revert restores previous acceptance without DB/storage mutation.
Inspect with npm run ops:reconcile-test and
node scripts/ops/reconcile-storage-objects.js --help.

## SKILLS USED

- `architecture-patterns`: existing database adapter boundary.
- `deployment-pipeline-design`: recovery evidence gates and rollback.
- `error-handling-patterns`: whole-result rejection and private diagnostics.
- `secrets-management`: offline verification and credential-safe logging.
- `security-best-practices`: own-property validation at the existing boundary.
- `postgres-best-practices`: schema and installed object-row driver semantics.
- `javascript-testing-patterns`: adapter/runner behavioral regressions.
- `requesting-code-review`: independent read-only review after checks.
- `receiving-code-review`: verify findings against actual contracts.
- `caveman-commit`: required local Conventional Commit.
