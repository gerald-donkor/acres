# Phase 12K — Validate database inventory column names

## Scope and sequence

Continue Phase 12K's recovery-evidence gate after committed Prompt 331,
`315face912954e0079efc1222a77b09b3a81a5ef` (`fix(ops): validate inventory row mode`).
Planning found a clean worktree. Phase 12 remains the earliest unfinished parent;
live operator evidence and launch approvals are still unresolved. This is one
dependency-safe adapter correction, not completion of Phase 12 or Prompt 201.
The user's `i` authorizes preparing this prompt only.

The next scope is validation of supplied PostgreSQL inventory column names.
The adapter issues a fixed twelve-column SELECT but currently ignores result.fields.
Empty rows cannot expose a wrong projection through row validation. An offline
probe with installed pg/lib/result, addFields for one unrelated text column,
and addCommandComplete({ text: 'SELECT 0' }) returned:

```text
{"fieldNames":["unrelated"],"command":"SELECT","rowCount":0,"rowAsArray":false,"accepted":0}
```

Reject supplied projection metadata that contradicts the fixed query, including
empty results. Keep omission compatible with injected adapters. This is metadata
consistency checking; it cannot authenticate a database response or prove recovery.

## References and verified authority

Planning read AGENTS.md, especially the phase-control protocol and §§5–10;
docs/build-plan.md Phase 12, sequence gates and Prompt 331; docs/skills.md;
docs/operations.md topology, recovery and Prompt 331; docs/launch-checklist.md
Category 6 and operator prerequisites; docs/security.md latest recovery-adapter
records; docs/system-architecture.md §§11.3–11.4; and docs/product.md recoverable
operations acceptance. Reread these relevant sections before implementation.

Inspect scripts/ops/reconcile-storage-objects.js, its .spec.js and .ts facade,
package.json, scripts/ops/audit-dependencies.sh and node_modules/pg/lib/result.js.
The installed Result constructor initializes fields to []; addFields preserves
the field descriptions, and parseRow indexes output objects by each field.name.
Verify locally that row descriptions are handled for zero-row SELECTs by also
reading the installed driver's query row-description handler before coding.
No live database or network request is necessary for these driver probes.

No UI, route, styling, motion, screenshot, geometry or breakpoint change applies.
No static reference needs measurement. No new Next/React/Tailwind API is used;
before the required build inspect the installed Next CLI guide under
node_modules/next/dist/docs/ for the existing build command. No current skill
provides Node CLI-specific security guidance: use installed driver source and
the repository's fixed-error/privacy contract without claiming that web security
references cover this CLI. No dependency installation is needed.

Phase-wide NestJS, threat-model authoring, GitHub Actions, scanners, telemetry,
browser and accessibility skills have no triggered implementation surface here.
No schema, SQL selection, API, CI, deployment or credential change is authorized.

## Required behavior and compatibility

1. Within queryDatabaseStoredObjects, before converting rows or returning the
   inventory, validate result.fields whenever it is defined. Absent/undefined
   metadata remains accepted. Supplied metadata must be a dense array of exactly
   twelve non-null, non-array field records whose primitive string names match
   the fixed SELECT in order:

   ```text
   id
   organizationId
   bucket
   objectKey
   byteCount
   checksumAlgorithm
   checksumHex
   state
   deletedAt
   createdAt
   uploadState
   uploadExpiresAt
   ```

2. Derive this list from the actual SQL, not from the optional row validator.
   The query has a fixed projection even though injected row fixtures can omit
   optional values. Keep one private expected-name list close to the adapter;
   avoid a new public export, generic schema framework or SQL parser. A future
   query projection change must deliberately update its adapter contract.
3. Reject null/non-array fields, empty/truncated/extra arrays, sparse arrays,
   duplicate/missing/unknown/reordered names, invalid descriptor records,
   missing names and nonprimitive names. Reject case/whitespace changes and
   boxed strings. Do not coerce, trim, normalize, sort, filter or mutate any
   supplied metadata. Use only `Database inventory is invalid` on failure;
   never interpolate column names or serialize a bad descriptor.
4. Additional descriptor attributes remain opaque and supported: do not
   validate OIDs, table IDs, format or parser internals. Preserve frozen
   descriptors/arrays/results, row order, opaque row fields and bigint conversion.
   Correct names cannot excuse invalid rows, counts, commands or row mode.
5. Runner failures return 1, issue one query and zero S3 sends, retain the
   existing connecting log and fixed `Error: Database query failed`, and publish
   no summary, receipt or temporary file. Injected clients remain caller-owned.
   Supported empty/populated results still publish clean simulation evidence.

Expected impact is limited to malformed/contradictory supplied projection
metadata. SQL text, S3 listing, comparison engine, CLI/environment behavior,
TypeScript facade, receipt schema, publication and Stage 7 remain unchanged.
Non-goals: mandatory metadata, type/OID validation, hostile in-process getters
or proxies, SQL/join changes, DB/S3 snapshots, resource bounds, checksum
acquisition, live services, deployment, operator approval, push or a follow-on
task. Projection consistency proves neither completeness nor object byte integrity.

## File changes and test-first execution

1. Reread this approved prompt and load every skill below before code. Resolve
   HEAD/branch afresh and preserve unrelated work. Only this scope is authorized.
2. Add focused direct and runner regression cases to
   scripts/ops/reconcile-storage-objects.spec.js using inventoryDbRecord,
   createIo, listingClient and isolated temporary directories. Cover the failure
   families above with representative values, including both empty and populated
   results and a name value with throwing coercion hooks. Avoid a large Cartesian
   expansion. Assert exact errors, request counts and lack of mutation/coercion.
3. Compatibility cases cover absent/undefined fields, the exact projection with
   empty and ordered multiple rows, extra opaque descriptor metadata, frozen
   ownership, byte strings converted to bigint, and bad rows/count/command/mode
   alongside otherwise valid fields. Keep unrelated prior coverage intact.
4. Existing synthetic installed-pg tests construct Result without addFields.
   These are incomplete driver fixtures once supplied fields are validated:
   update only these fixtures to add the actual twelve-column description before
   command completion, retaining every previous assertion. Document this narrow
   fixture correction instead of weakening validation to accept fields: [].
5. New installed-driver tests exercise an unrelated zero-row SELECT description
   rejecting, the correct empty projection accepting, and correct populated
   object parsing accepting. Use installed addFields/parseRow semantics with
   verified type parsers; do not claim these are live PostgreSQL integration.
6. Runner tests verify fixed diagnostics, no client end/destroy, no downstream
   requests and an empty output directory on invalid projection. Success tests
   verify correct matched counts, simulation classification and exclusive receipt
   publication. Clean all temporary directories in finally blocks.
7. Run focused tests red before modifying source, capture actual failures, then
   add the compact guard and expected-name list only in
   scripts/ops/reconcile-storage-objects.js. Iterate green and inspect the diff.

## Verification and acceptance

Run `node --test scripts/ops/reconcile-storage-objects.spec.js` and
`npm run ops:reconcile-test`; source/spec `node -c`;
`node scripts/ops/reconcile-storage-objects.js --help`; installed Prettier on
changed regions; `git diff --check`; `npm run lint`; `npm run typecheck`; and
`npm run build`. Run build/typecheck sequentially to avoid generated Next type
races. Quote actual output and exit status, including sandbox failures. Use
the available approval mechanism if ordinary child-process execution needs
escalation; a file-level worker wrapper is not evidence of all tests passing.

Resolve independent offline operations stages from current package.json
ops:check, run them and inspect every exit/status and suite total. Omit online
ops:audit under the recorded registry-metadata disclosure restriction; claim
neither full aggregate ops:check success nor a fresh vulnerability inventory.
Run `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`
and report its actual expected fail-closed result. The previous committed record
is 0 approved / 11 blocked / 70 blockers, not a fresh measurement. Do not run
ops:launch-drill or manufacture operator evidence.

After self-verification use requesting-code-review to dispatch one independent
read-only reviewer with this prompt, actual BASE_SHA/HEAD_SHA, working diff,
installed driver evidence, compatibility decisions and check output. AGENTS.md
requires this delegation at implementation time; no subdelegation or review
dispatch during prompt preparation. Use receiving-code-review to verify claims,
fix valid findings, retest and re-review significant changes before completion.

Record actual implementation, fixture corrections, red/green evidence, checks,
review, limitations, inspection steps and ordinary-revert rollback in
docs/operations.md. Add concise corresponding records to docs/build-plan.md,
docs/security.md and Category 6 of docs/launch-checklist.md. Keep Prompt 201,
Category 6 live recovery approval and Phase 12 exit open. Simulation is not live
recovery. No new AGENTS.md invariant or index row is needed.

Stage only this prompt, source, spec and the four documentation files. Inspect
the staged diff and commit locally to main using caveman-commit; do not push.
Return the commit and safe inspection commands `npm run ops:reconcile-test` and
`node scripts/ops/reconcile-storage-objects.js --help`. Ordinary commit revert
restores prior behavior without migration or database/storage mutation.

## SKILLS USED

- `architecture-patterns`: keep driver projection checks in the existing adapter.
- `deployment-pipeline-design`: preserve recovery evidence and launch gates.
- `error-handling-patterns`: reject whole inventories before downstream effects.
- `secrets-management`: preserve private diagnostics and offline verification.
- `security-best-practices`: validate contradictory metadata without coercion.
- `postgres-best-practices`: verify installed driver column-description semantics.
- `javascript-testing-patterns`: meaningful direct and runner regression tests.
- `requesting-code-review`: independent implementation review after verification.
- `receiving-code-review`: verify feedback before corrections.
- `caveman-commit`: required local Conventional Commit after execution.
