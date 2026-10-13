# Phase 12K — Database inventory byte-count range

## Scope, sequence and authorization

Continue the earliest open parent, Phase 12K recovery evidence, after committed
Prompt 339 (`e17d8f3`) on clean main. The user entered `i`, then explicitly
instructed implementation when planning finishes. Write and re-read this prompt,
then execute it through verification, independent review, records and local
commit without another approval request. No push is authorized.

The next bounded step rejects database byte counts impossible for the fixed
StoredObject.byteCount bigint projection. A read-only offline probe supplied
`9223372036854775808` (2^63) to the database adapter and returned:

```json
{"acceptedByteCount":"9223372036854775808","status":"clean"}
```

The comparison was against a synthetic storage record without size metadata.
This demonstrates malformed adapter evidence being accepted; it is not a claim
that PostgreSQL can store this value or that live recovery has been verified.

## References read and authority

- `AGENTS.md`: prompt, phase-control, verification, review and commit rules.
- `docs/build-plan.md` §§13–14 and latest records: Phase 12 remains open.
- `docs/skills.md`: locked skill paths and scoped triggers.
- `docs/operations.md`: recovery adapter and Prompt 339, offline audit restriction.
- `docs/security.md`: existing recovery evidence boundary and latest records.
- `docs/launch-checklist.md`: Category 6 and human sign-off gates.
- `docs/system-architecture.md` §§11.3–11.4: recovery and redaction contracts.
- `docs/backend.md`, `docs/product.md`: current backend and recoverable operations.
- `scripts/ops/reconcile-storage-objects.js`, `.spec.js`, `.ts`, `package.json`:
  actual adapter, shared validation, comparison, runner, facade and commands.
- `server/prisma/schema.prisma` StoredObject and storage migration
  `server/prisma/migrations/20260824170000_storage_queues_uploads/migration.sql`:
  nullable bigint with nonnegative constraint and byteCount::text adapter cast.
- `node_modules/pg/lib/result.js`: named row materialization and descriptor path.
- `node_modules/pg-types/test/types.js`: bigint/int8 fixture at
  `9223372036854775807`. The SQL bigint upper bound is 2^63 - 1.
- `.agents/skills/postgres-best-practices/references/schema-design.md`:
  type choices. No new SQL or framework API is introduced.

No visual change, comp, crop, pixel measurement or breakpoint applies. No route
changes. Only operator database inventory acquisition changes. There is no
standalone Node CLI reference in the security skill; repository contracts,
installed code and bounded runtime probes provide the relevant authority.

## Required behavior and compatibility

1. At queryDatabaseStoredObjects, after existing inventory validation and before
   returning converted rows, reject any supplied non-null byteCount above
   `9223372036854775807n`. Validate all rows before returning any inventory.
   Use exact BigInt comparison, never Number conversion or decimal length alone.
2. Keep this restriction at the database acquisition adapter. Generic
   reconcileObjects and already-injected main dbObjects/storageObjects retain
   their current arbitrary nonnegative bigint contract. This is the SQL column
   range, not a storage size limit or new comparison policy.
3. Preserve strings with leading zeroes, bigint inputs, existing safe numeric
   inputs, null, absent/own undefined compatibility and all current descriptors.
   The inclusive maximum, zero, maximum minus one and values above JavaScript's
   safe numeric range but within SQL bigint must convert without precision loss.
4. Reject over-range strings, leading-zero strings and bigint values, including
   bad rows later in a mixed inventory, hidden own byteCount, descriptor-present
   and descriptor-absent results, and lifecycle-excluded rows. Existing lower
   bound/type checks already reject negatives and unsafe numbers; preserve them.
5. Throw exactly `Database inventory is invalid`. The runner must return 1,
   emit its connection log and fixed `Error: Database query failed`, make no S3
   requests, publish no receipt/temp output, and retain injected-client ownership.
   Do not expose values, identities or raw query errors in diagnostics.
6. Do not mutate frozen rows/results/descriptors. Preserve row order, extra
   properties, non-enumerable own projection handling, missing-property semantics,
   existing checksum/lifecycle validation, result metadata and SQL.

## Files and implementation sequence

Allowed changes: this prompt, scripts/ops/reconcile-storage-objects.js and its
.spec.js, and result records in docs/operations.md, docs/build-plan.md,
docs/security.md and Category 6 of docs/launch-checklist.md.

1. Re-read this prompt and reload its skill manifest before source changes.
2. Add focused behavioral regressions using existing projectedInventoryRow,
   databaseInventoryFields, listingClient and createIo helpers. Keep all existing
   1839 cases and their assertions. Use bounded loops with distinct cases.
   Execution inspection identified one legacy adapter success fixture using
   `900719925474099312345`, above SQL bigint. Change its input and expected
   conversion/immutability values to `9007199254740993123`, which is within SQL
   range and still above JavaScript safe precision; retain every assertion.
   The generic comparison fixture using the old larger value remains intact.
3. Cover maximum+1, substantially larger values, zero-padded overflow, bigint
   overflow; absent/undefined/described fields metadata; first/later bad rows;
   hidden own byteCount; lifecycle-excluded overflow; frozen ownership. Assert
   exact adapter rejection and one query, with no partial returned inventory.
4. Cover valid zero, maximum-1, maximum, zero-padded maximum, safe numeric input,
   bigint maximum, above-JS-safe exact strings, NULL/undefined/absent values and
   empty result. Assert normalized output values and input immutability. Verify
   installed pg.Result text rows at the inclusive maximum offline.
5. Add runner invalid cases with temporary absent output paths, fake pg/S3
   clients, exact private logs, no S3 calls, caller ownership and cleanup in
   finally. Add a valid ordinary small-size runner receipt case only if existing
   coverage is insufficient. Assert generic comparison still supports over-range
   matching values; do not weaken that contract accidentally.
6. Run focused red before source edits and record the actual failures. Implement
   one compact adapter guard after existing validation, using bigint arithmetic
   and the verified SQL upper bound. No general numeric framework or refactor.
7. Run focused green. Format only changed source/test regions with installed
   Prettier. Inspect full changed diff for accidental edits.

## Verification and review

Run actual commands and record exits and relevant real output:

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

Build/typecheck must run sequentially. Run each independent offline stage from
package.json ops:check, inspect every result and sum actual suite counts. Omit
only online ops:audit under the recorded dependency-metadata disclosure
restriction; do not claim aggregate ops:check or a fresh vulnerability audit.
Do not run live infrastructure, integration or browser drills for an offline
adapter-only change. Distinguish sandbox failures from code failures and use
permitted identical execution if child-process restrictions interfere.

After checks, dispatch one read-only reviewer using requesting-code-review and
its code-reviewer.md template with base/head e17d8f3 plus working diff, this
prompt, exact checks and limits. Do not let reviewer subdelegate. Review
adapter-only scope, precision, metadata compatibility, private failure receipts,
immutability and tests. Evaluate feedback with receiving-code-review, verify
valid findings, fix and recheck, and request follow-up review for material fixes.

## Records, exit, rollback and non-goals

Record the observed probe, actual red/green/check output, review evaluation,
compatibility and limitations in docs/operations.md; add concise matching
records to build-plan, security and Category 6 checklist. Phase 12, Prompt 201
and live recovery approval remain open. Range checking cannot authenticate
responses, prove inventory completeness, verify object bytes or establish an
atomic DB/storage snapshot. Revert the eventual commit to restore prior adapter
acceptance without DB/storage mutation. Operator remediation: privately inspect
an out-of-range adapter result and correct the source; never truncate/coerce it
or reuse an old receipt as evidence of recovery.

Exit: impossible SQL byte counts are rejected before storage/publication;
valid boundary values remain exact; generic comparison is compatible; checks
and review are resolved, documentation agrees, and approved changes are
committed locally to main using caveman-commit. Safe inspection:
`npm run ops:reconcile-test` and CLI `--help`.

No dependency, schema, migration, SQL, public API/facade, UI, CI, infrastructure,
credentials, live services, deployment, operator approval or push changes.
No new trust boundary is added. Phase-wide Nest, UI, browser, telemetry,
Grafana, workflow and SAST implementation skills have no changed surface here.

## SKILLS USED

- `architecture-patterns`: preserve adapter and generic comparison boundaries.
- `deployment-pipeline-design`: maintain recovery evidence and launch gates.
- `error-handling-patterns`: whole-inventory rejection and private diagnostics.
- `secrets-management`: offline inputs, no credential/private-value disclosure.
- `security-best-practices`: reject impossible acquisition evidence before use.
- `postgres-best-practices`: fixed bigint projection and exact SQL range.
- `javascript-testing-patterns`: bounded behavioral adapter/runner regressions.
- `requesting-code-review`: independent review after self-verification.
- `receiving-code-review`: verify reviewer findings before fixes.
- `caveman-commit`: required local Conventional Commit with integrity rationale.
