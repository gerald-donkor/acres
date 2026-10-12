# Phase 12K — Validate database inventory byte-count type

## Scope and why next

Continue Phase 12K recovery-evidence consistency after committed Prompt 333,
07ed288511cf08b6da4b9a2cd54dedaf71933052, on clean main. The user requested
`i` and implementation when planning finishes: execute exactly this prompt
under AGENTS.md §2 step 8, then stop without a follow-on or push.

The fixed SELECT explicitly casts byteCount to text, but supplied dataTypeID
metadata is ignored. An offline planning probe with twelve correct names/text
formats and byteCount type 701 returned {"accepted":0,"byteCountType":701}.
Installed pg Result.addFields chooses parsers by dataTypeID; installed pg-types
builtins defines TEXT as 25, whereas 701 uses parseFloat. Contradictory metadata
must reject even empty results before a clean reconciliation can be published.

## References and authority

Read AGENTS.md §§2–10, docs/build-plan.md Phase 12 and latest records,
docs/skills.md, docs/operations.md recovery/topology/latest records,
docs/security.md latest adapter records, docs/launch-checklist.md Category 6,
docs/system-architecture.md §§11.3–11.4, docs/product.md recoverable-operations
acceptance, docs/backend.md, package.json, scripts/ops/reconcile-storage-objects
.js/.spec.js/.ts and installed pg/lib/result.js, pg-types/lib/builtins.js and
pg-types/lib/textParsers.js. Read installed Next CLI guide at
node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md for build.
No visual or route changes, measurements, comps or breakpoint requirements.
No Node CLI-specific security reference exists in the installed security skill;
use repository error/privacy contracts and installed driver source.

## Exact behavior and limits

In the existing descriptor loop, for the named byteCount position only, each
defined dataTypeID must equal primitive numeric 25. Omitted/undefined type or
fields stays compatible. Reject other OIDs, null, strings, boxed numbers,
booleans, nonfinite numbers, objects, arrays, bigint and symbols without coercion.
All other descriptor type IDs remain opaque, including enum OIDs which are
installation-specific. Keep SQL, row conversion, optional format/name/count/
command/mode checks, frozen ownership and ordered results unchanged.
Use existing fixed Database inventory is invalid diagnostics. Invalid runner
results produce exit 1, one query, zero S3 sends, no client cleanup, existing
connecting log and Error: Database query failed, and no summary/receipt/temp file.
Valid empty/populated inventories still publish simulation evidence.

Only source, spec, this prompt, docs/operations.md, docs/build-plan.md,
docs/security.md and docs/launch-checklist.md change. No dependencies, schema,
SQL, protocol, TS facade, receipt contract, storage listing, CLI/env, Stage 7,
services or credentials changes. Do not add generic OID validation, mandatory
metadata, parser hardening or hostile in-process object defenses. This is an
explicitly narrow follow-on to Prompt 333's deferred type checks.
Metadata consistency cannot authenticate responses, prove completeness, verify
object bytes or establish atomic snapshots or live recovery. Prompt 201,
Category 6 live approval and Phase 12 exit remain open.

## Execution steps and regression plan

1. Re-read this prompt and all named skills before editing source. Preserve
   unrelated work; confirm main/HEAD and highest prompt number.
2. Add focused tests using existing databaseInventoryFields, inventoryDbRecord,
   listingClient and createIo. Cover representative invalid primitive/reference
   types with alternating empty/populated results and throwing coercion hooks.
   Verify fixed errors and frozen input ownership without Cartesian expansion.
3. Add runner failures for a wrong OID and malformed type: isolated temporary
   directories cleaned in finally, exact logs, one query, zero sends, no injected
   cleanup and no output. Test valid omitted/undefined/25 types with zero/two
   rows, bigint conversion and opaque other-column types. Test valid publication
   for empty/populated results and other guards remaining independent.
4. Exercise installed pg Result with wrong-type empty/populated results and
   text-type acceptance offline, preserving all previous assertions. Do not
   claim real PostgreSQL coverage.
5. Run regression suite red and record actual totals; add one compact strict
   predicate and explanatory cast comment to the descriptor guard; run green.
6. Self-verify, review, record and commit as below. No next prompt execution.

## Verification and review

Run direct node --test scripts/ops/reconcile-storage-objects.spec.js and
npm run ops:reconcile-test. Run source/spec node -c, CLI --help, installed
Prettier on newly added spec region and changed guard, git diff --check,
npm run lint, npm run build and then npm run typecheck sequentially.
Capture real exits/output. Use ordinary local escalation if restricted workers
fail; wrapper results cannot establish suite totals.
Resolve independent offline stages from current package.json ops:check and run
all except online ops:audit under the recorded metadata-disclosure restriction.
Inspect every stage result; do not claim aggregate ops:check or a fresh audit.
Run readiness.example.json validator and report its expected fail-closed state.
After self-verification dispatch one independent read-only reviewer per
requesting-code-review with base/head, working diff, prompt and actual checks.
No reviewer edits/subdelegation. Evaluate feedback with receiving-code-review,
fix verified issues, retest and re-review significant changes.

## Recording, rollback and completion

Record actual implementation/red-green/check results, review, compatibility,
limits and safe inspection in docs/operations.md, with concise matching records
in build-plan/security and Category 6 launch-checklist. Ordinary commit revert
restores prior behavior without migration or DB/storage mutation. Inspect final
staged diff and commit locally to main using caveman-commit. No push/deployment.
Return commit/result and exact safe commands npm run ops:reconcile-test and
node scripts/ops/reconcile-storage-objects.js --help.

## SKILLS USED

- `architecture-patterns`: existing adapter boundary.
- `deployment-pipeline-design`: recovery evidence gates.
- `error-handling-patterns`: whole-result fixed errors.
- `secrets-management`: private diagnostics and offline checks.
- `security-best-practices`: no coercion or metadata disclosure.
- `postgres-best-practices`: installed driver and explicit text cast.
- `javascript-testing-patterns`: focused regression tests.
- `requesting-code-review`: independent read-only review.
- `receiving-code-review`: verify review feedback.
- `caveman-commit`: required local Conventional Commit.
