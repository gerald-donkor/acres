# Phase 12K — Database inventory SHA-256 digest length

## Scope and sequence

Continue Phase 12K recovery-evidence hardening after committed Prompt 340
(`b665b08`) on clean main. This is one bounded implementation unit, not a
claim that operator recovery or launch gates are complete. The user entered
`i` and instructed implementation when planning finishes: write, re-read and
execute this prompt without another approval question. Commit locally; no push.

An offline synthetic probe of queryDatabaseStoredObjects accepted checksumHex
`ab` with checksumAlgorithm `sha256`; comparison against storage without a
checksum returned `{"acceptedChecksum":"ab","status":"clean"}`. Such a
value cannot represent a full SHA-256 digest. The upload DTOs already require
64 hex characters and the S3 acquisition extension already requires 32 bytes.
The migration stores checksumHex as nullable text without a length constraint;
this change enforces application evidence semantics, not a SQL type limit.

## References and verified contracts

Read AGENTS.md; docs/build-plan.md Phase 12 and sequence gates/latest records;
docs/skills.md; docs/operations.md recovery and Prompt 340; docs/security.md;
docs/launch-checklist.md Category 6; docs/system-architecture.md §§11.3–11.4;
and docs/backend.md/product.md for context.

Implementation authority: scripts/ops/reconcile-storage-objects.js and .spec.js,
package.json commands, server/src/uploads/dto/complete-upload.dto.ts and
initiate-upload.dto.ts (64 hexadecimal characters, case-insensitive), and
server/prisma/migrations/20260824170000_storage_queues_uploads/migration.sql
(sha256 algorithm, nullable text checksum). No third-party API is introduced.
No UI, route, styling, animation, measurement or breakpoint changes; visual
references and Next guides are inapplicable to this standalone Node adapter.
The security skill has no standalone Node CLI reference; use verified local
contracts and behavioral tests rather than importing unrelated web guidance.

## Required behavior

1. In queryDatabaseStoredObjects, after validateInventory and before returning
   any rows, reject supplied non-null checksumHex whose length is not exactly
   64. Existing validation already rejects nonstrings/nonhex/empty/odd-length
   strings. Keep fixed error `Database inventory is invalid`.
2. Check all rows, including later rows and lifecycle-excluded rows. Validate
   non-enumerable own checksums as well as normal properties. Metadata absent,
   explicitly undefined and described paths must behave alike.
3. Preserve null, undefined and omitted checksums, including omitted algorithm
   compatibility. Preserve lowercase, uppercase and mixed-case valid digests
   verbatim at acquisition; comparison retains case-insensitive matching.
4. Restrict this change to database acquisition. Generic reconcileObjects and
   explicitly injected main inventories retain their existing even-length hex
   compatibility. No new policy on storage/generic digest length.
5. Runner acquisition failure returns 1 with fixed connection log and
   `Error: Database query failed`, no S3 request, no receipt or temporary file,
   and no teardown of caller-owned clients. Never log the bad checksum/row.
6. Preserve SQL, descriptors, existing byte-count checks, schema/facade, row
   order, extra keys, immutable inputs and checksum mismatch reporting.

## Files and steps

Allowed changes: this prompt; scripts/ops/reconcile-storage-objects.js and
.spec.js; result records in docs/operations.md, build-plan.md, security.md and
Category 6 of launch-checklist.md.

1. Re-read this prompt and apply all listed skills before code.
2. Append a bounded suite of behavioral cases using projectedInventoryRow,
   databaseInventoryFields, listingClient and createIo. Reject short and long
   even-length hex (2, 62, 66, 128), first and later rows, described and omitted
   metadata, hidden own fields and deleted/pending rows. Freeze fixtures and
   assert one query, exact private error and immutability.
3. Cover valid 64-character digests in lower/upper/mixed case, nullable/optional
   checksums, empty rows, row order and extras. Assert case-insensitive compare
   still detects matching/mismatching digests. Retain generic short-hex support.
4. Add runner invalid acquisition cases across metadata modes with absent
   output paths in temporary directories. Assert no S3 requests, no published
   files, private errors and caller ownership; clean up in finally.
5. Run red before changing source. Add one compact adapter guard. Run green.
   If existing success fixtures use truncated digests in acquisition paths,
   expand only those fixtures and their expected values to valid 64-character
   counterparts, retaining all assertions. Generic fixtures stay unchanged.
6. Format changed regions only with installed Prettier. Inspect the entire diff.

## Verification

Run and record real exits/output:

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

Build/typecheck sequentially. Execute each independent offline stage of
package.json ops:check and inspect every result. Omit online ops:audit under
the recorded metadata-disclosure restriction; never claim aggregate ops:check
or a fresh vulnerability audit. No live databases/storage, browser or service
integration drills are needed for this offline adapter change. Distinguish
sandbox execution errors from actual code failures; use permitted identical
execution if necessary.

After self-verification dispatch one read-only reviewer via
requesting-code-review/code-reviewer.md, base/head b665b08 plus working diff,
this prompt, checks and limitations. No reviewer subdelegation. Evaluate
feedback using receiving-code-review; verify/fix valid findings, recheck and
re-review material changes before recording completion.

## Records, exit and rollback

Record probe, red/green results, fixture corrections, exact check evidence,
review outcome and compatibility in docs/operations.md. Add concise matching
records to build-plan, security and Category 6 checklist. Shape validation
cannot authenticate evidence, establish completeness, verify object bytes or
prove atomic recovery. Prompt 201, live Category 6 approval and Phase 12 exit
stay open. Ordinary commit revert restores prior adapter acceptance without
DB/storage mutation. Privately inspect and repair a rejected source digest;
never pad/truncate live evidence to bypass validation or reuse an old receipt.

Exit: malformed SHA-256 acquisition fails before S3/publication, valid/optional
values and generic comparison remain compatible, checks/review are resolved,
records agree and authorized changes are committed locally to main.
Safe inspection: npm run ops:reconcile-test and CLI --help.

Non-goals: dependencies, SQL/schema/migrations, APIs/facade, UI, CI, topology,
credentials, live services, operator approval, deployment and push. Phase-wide
Nest, browser, monitoring, workflow and threat-model implementation skills have
no changed surface here; no new trust boundary or durable architecture choice.

## SKILLS USED

- `architecture-patterns`: keep acquisition and comparison boundaries separate.
- `deployment-pipeline-design`: preserve recovery and launch evidence gates.
- `error-handling-patterns`: whole-inventory rejection and private errors.
- `secrets-management`: offline fixtures and no sensitive-value disclosure.
- `security-best-practices`: validate evidence before use without coercion.
- `javascript-testing-patterns`: behavioral regression and compatibility tests.
- `requesting-code-review`: independent read-only review after checks.
- `receiving-code-review`: verify review findings before changes.
- `caveman-commit`: required local Conventional Commit with security rationale.
