# Phase 12K — Validate database inventory column formats

## Scope and why it is next

Continue the earliest unfinished parent, Phase 12K recovery evidence, after
committed Prompt 332, df377e97b0af50c8a08abbc84fa765ce3f2caae2.
The worktree was clean at planning. The user requested `i`, then explicitly
instructed implementation when planning finishes; this supplies execution
approval under AGENTS.md §2 step 8. Execute exactly this prompt, then stop.

The fixed inventory SELECT is sent as plain query text without binary options.
Column names are checked, but descriptor format is ignored. A planning probe
with all twelve correct names, all formats `binary`, and a completed empty
SELECT printed {"accepted":0,"format":"binary"}. Reject contradictory supplied
formats, including empty inventories, before S3 requests or receipt publication.
This is a bounded consistency correction, not live recovery or launch approval.

## Authority and references

Read AGENTS.md, docs/build-plan.md Phase 12 and its latest records,
docs/skills.md, docs/operations.md topology/recovery/latest records,
docs/launch-checklist.md prerequisites and Category 6, docs/security.md latest
adapter records, docs/system-architecture.md §§11.3–11.4, and docs/product.md
recoverable-operations acceptance. Inspect package.json and
scripts/ops/reconcile-storage-objects.js, its .spec.js and .ts facade.

Verified installed authority: node_modules/pg/lib/result.js selects parsers
using desc.format and handles binary row values differently; pg/lib/query.js
passes ordinary query text through the simple query path, and
pg-protocol/dist/parser.js maps wire format zero to `text`, otherwise `binary`.
Recheck these paths before coding. Read the installed Next CLI guide at
node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md for the required
build. No Next, React, Tailwind or UI API changes. No visual measurements,
comps, screenshots or breakpoint requirements apply. No Node CLI-specific
security skill exists; installed driver source and repository privacy/error
contracts provide the direct authority rather than unrelated web guidance.

## Contract and non-goals

Within the existing optional fields validation in queryDatabaseStoredObjects,
require each defined field.format to be exactly primitive `text`.
Omitted/undefined formats remain compatible with injected descriptors, as do
omitted/undefined result.fields. All twelve positions must be checked.
Reject binary, wrong casing, whitespace, empty strings, null, booleans, numbers,
arrays, objects, symbols, bigint and boxed strings without coercion or mutation.
Use exactly `Database inventory is invalid`; never interpolate metadata.
Preserve correct names/order/density, count/command/row-mode guards, row order,
opaque extra attributes, frozen ownership and bigint conversion.

Invalid runner results return 1 after one query, zero S3 sends, the existing
connecting log and `Error: Database query failed`, and no summary, receipt or
temporary output. Injected clients remain caller-owned. Valid empty/populated
inventories still publish clean simulation evidence with correct counts.

Only source, spec, this prompt and docs/operations.md, docs/build-plan.md,
docs/security.md, docs/launch-checklist.md may change. SQL, schema, joins,
receipt schema, TS facade, storage listing, CLI/env, Stage 7, public routes,
services, credentials and dependencies are unchanged. Do not require metadata,
validate OIDs/table IDs/parser internals, add resource limits, change query
protocol, run live drills, install packages, deploy, push or start a follow-on.
Metadata consistency cannot prove completeness, bytes, atomic snapshots or
response authenticity. Prompt 201, Category 6 live approval and Phase 12 exit
remain open.

## Detailed implementation and tests

1. Reread this prompt and load the exact skill manifest before code. Resolve
   branch/HEAD afresh and preserve unrelated work.
2. Append focused regression cases in the existing spec using
   databaseInventoryFields, inventoryDbRecord, createIo and listingClient.
   Avoid another large Cartesian expansion. Cover representative invalid types,
   first/middle/last descriptor positions, empty/populated results, and a value
   with throwing coercion hooks. Assert fixed errors and unchanged ownership.
3. Add runner failure cases for binary and malformed format with isolated temp
   directories, one query, zero sends, no client cleanup, fixed logs/errors and
   no output. Clean temporary directories in finally.
4. Cover omitted/undefined/text and mixed omission across descriptors, frozen
   descriptors/results, opaque attributes, ordered multiple rows and byte string
   conversion. Add valid runner publication cases for empty and populated data.
   Correct formats must not excuse malformed rows/names/count/command/mode.
5. Exercise installed pg Result/addFields/addCommandComplete offline for binary
   zero-row rejection and text empty/populated acceptance. Do not claim live DB
   coverage. Existing helper uses text formats and must retain prior assertions.
6. Run tests red before source edits and record actual totals. Add one compact
   format predicate to the existing descriptor guard; no new export/framework.
   Run green and inspect all changes.

## Verification, review and recording

Run direct node --test scripts/ops/reconcile-storage-objects.spec.js and
npm run ops:reconcile-test; node -c on source/spec; CLI --help; installed
Prettier checking changed regions; git diff --check; npm run lint;
npm run build and npm run typecheck sequentially to avoid generated-type races.
Capture exact outputs and exits, including restricted execution failures. If
needed use the available escalation mechanism for ordinary local checks;
worker-wrapper errors do not prove suite totals.

Resolve independent offline stages from package.json ops:check, run each and
inspect every result. Omit online ops:audit under the recorded registry metadata
disclosure restriction; do not claim aggregate ops:check or a fresh audit.
Run node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json
and report the actual expected fail-closed result. Do not manufacture approvals.

After self-verification dispatch one independent read-only reviewer using
requesting-code-review, with actual base/head, working diff, this prompt,
verified driver behavior and check evidence; AGENTS.md explicitly requires
review delegation. Reviewer must not edit or subdelegate. Evaluate feedback
with receiving-code-review; verify/fix valid issues, retest and re-review any
significant changes. Record implementation, red/green results, actual checks,
review, compatibility/limitations, inspection commands and ordinary-revert
rollback in docs/operations.md; add concise records to build-plan/security and
Category 6 of launch-checklist. Do not mark live recovery or Phase 12 complete.

Inspect staged diff and commit all authorized changes locally to main using
caveman-commit. No push. Return commit, concise result and safe inspection:
`npm run ops:reconcile-test` and
`node scripts/ops/reconcile-storage-objects.js --help`.

## SKILLS USED

- `architecture-patterns`: keep consistency checks inside the existing adapter.
- `deployment-pipeline-design`: preserve launch and recovery evidence gates.
- `error-handling-patterns`: fail the whole inventory before downstream effects.
- `secrets-management`: retain fixed private diagnostics and offline checks.
- `security-best-practices`: no coercion or metadata disclosure at this boundary.
- `postgres-best-practices`: verify installed driver format semantics.
- `javascript-testing-patterns`: focused behavior and runner regressions.
- `requesting-code-review`: required independent implementation review.
- `receiving-code-review`: verify review claims before corrections.
- `caveman-commit`: required local Conventional Commit.
