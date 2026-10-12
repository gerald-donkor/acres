# Phase 12K — Validate database inventory row counts

## Scope and sequence

Continue Phase 12K recovery evidence after committed Prompt 328
(60a6b22e1c05ec69345e958e006dcd2c29336561), on clean main. Phase 12 remains
the earliest unfinished parent. Operator-owned live recovery evidence is still
unavailable. This one dependency-safe step closes a reproduced contradiction
in the existing PostgreSQL inventory adapter. The user requested `i` followed
by “implement plan when finished”, authorizing execution after writing and
rereading this prompt. Finish this prompt only, through review and local commit.

The pre-change synthetic query result `{ rowCount: 2, rows: [validRow] }`
returned exactly `{"reported":2,"accepted":1}`. A supplied command row count
must agree with the rows that become recovery evidence.

## References and verified authority

Read AGENTS.md; docs/build-plan.md Phase 12 and Prompt 328; docs/skills.md;
docs/operations.md Prompt 328; docs/launch-checklist.md Category 6 and shared
prerequisites; docs/security.md current recovery boundary and Prompt 328;
docs/system-architecture.md §§11.3–11.4; docs/product.md V1 recoverable operations.
Inspect scripts/ops/reconcile-storage-objects.js, its spec and TS facade,
package.json and scripts/ops/audit-dependencies.sh before changes.

Installed node_modules/pg/lib/result.js initializes rowCount to null and
sets it from the numeric count in command-completion tags; this adapter runs
one SELECT returning a complete buffered rows array, so a supplied count must
be an exact nonnegative safe integer equal to rows.length. Null is invalid for
this completed SELECT, though it can describe other pg result types. Omitted
or undefined counts remain compatible with existing injected query adapters.
Installed node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md
owns the production build command. No new framework APIs are introduced.

No visual surface, comp measurement or breakpoint change applies. No SQL,
schema, runtime topology, API, CI, telemetry or credentials change is needed.
Phase-wide Nest, browser/E2E, threat-model authoring, CI/scanner and telemetry
skills have no triggered implementation surface here. The security skill has
no Node CLI-specific reference; use the verified driver source and existing
repository contracts. Its optional GitHub secrets reference is absent locally;
there is no GitHub secret change dependent on it.

## Required behavior

1. In queryDatabaseStoredObjects, validate the result record and rows array as
   today. Before mapping/conversion, any defined result.rowCount must satisfy
   Number.isSafeInteger, be >= 0 and strictly equal result.rows.length. Use
   the existing fixed `Database inventory is invalid` error. No coercion.
2. Reject null, strings (including numeric), boxed numbers, booleans, arrays,
   objects, symbols, bigints, NaN, infinities, negative/fractional/unsafe
   values, and both larger/smaller contradictory counts. Reject zero with
   nonempty rows and nonzero with empty rows. No partial result is returned.
3. Preserve absent/undefined count, exact positive counts and zero/-0 for
   empty results. Preserve frozen caller ownership, opaque fields, row order,
   current row validation and bigint conversion. Matching counts cannot excuse
   malformed, sparse, duplicate or invalid rows.
4. main catches query failures with `Error: Database query failed`, returns 1,
   emits no summary and publishes no receipt or temporary file. It must not
   start S3 listing after rejected DB evidence. Injected clients remain owned
   by callers. Valid matching and optional-count results still publish clean
   simulation receipts, including empty inventory.

Compatibility change is limited to contradictory or malformed supplied
rowCount. Keep SQL, storage adapter, pure comparison, CLI/env defaults, TS
facade, receipt schema/publication and Stage 7 unchanged. Non-goals: mandatory
count metadata, command/field metadata validation, live DB/storage calls,
atomic snapshots, query/upload selection semantics, digest rules, hashing,
resource limits, hostile in-process getters/proxies, dependency changes,
deployment, operator approvals or push. Count agreement alone does not prove
completeness, authenticity, object bytes or actual recovery.

## File changes and test-first implementation

1. Reread this prompt and load every listed skill before code.
2. Append parameterized tests to scripts/ops/reconcile-storage-objects.spec.js.
   Keep all 1132 existing tests intact. Use inventoryDbRecord, createIo and
   listingClient helpers. Direct invalid-count cases use frozen valid rows;
   assert the fixed error and exactly one query. Add throwing coercion hooks
   whose sentinel cannot appear in the result error.
3. Positive direct cases cover absent/undefined counts with empty/nonempty
   rows, zero and -0 empty rows, exact one/multiple rows, frozen rows/results,
   original string byte counts and preserved extra fields. Matching counts
   alongside malformed rows must reject through existing validation.
4. Runner failure cases exercise malformed and mismatching counts with
   injected pg/S3 clients and isolated temporary directories. Assert 1,
   fixed logs/errors, one query, zero S3 sends, no caller client end/destroy,
   no output or temporary files. Clean test directories in finally.
   Runner success covers matching positive/empty and optional count results,
   existing receipt schema, clean simulation status and output exclusivity.
5. Run focused suite red before editing source. Add one compact guard in
   scripts/ops/reconcile-storage-objects.js after existing row validation and
   before map. Run focused green and inspect diff. Do not refactor unrelated code.

## Verification, review and completion

Run node --test scripts/ops/reconcile-storage-objects.spec.js and npm run
ops:reconcile-test; node -c on source/spec; CLI --help; installed Prettier on
changed regions; git diff --check; npm run lint, npm run typecheck and npm run
build. Record actual outputs. If sandbox workers block normal checks, use
permitted ordinary child-process reruns and report both, without treating a
single worker wrapper as suite evidence.

Resolve independent offline stages from package.json ops:check and run each,
inspecting all exit statuses and suite totals. Omit online ops:audit under the
recorded registry-metadata disclosure restriction, claiming neither aggregate
ops:check success nor fresh vulnerability inventory. Run ops:launch-readiness;
record actual expected fail-closed counts (previously 0 approved / 11 blocked /
70 blockers). This task never supplies operator evidence or launch approval.

After successful self-verification dispatch one read-only reviewer with
requesting-code-review and its template: BASE_SHA and HEAD_SHA both
60a6b22e1c05ec69345e958e006dcd2c29336561 plus working diff, this prompt,
requirements, driver semantics and actual checks. No reviewer subdelegation.
Evaluate feedback with receiving-code-review, verify/fix valid findings,
retest affected surfaces and rereview significant changes.

Record implementation, red/green results, actual checks, review, compatibility,
limits and inspection commands in docs/operations.md. Add concise records in
docs/build-plan.md, docs/security.md and Category 6 of docs/launch-checklist.md.
Prompt 201, Category 6 live recovery approval and Phase 12 exit remain open.
Rollback is ordinary commit revert without migration or data/storage mutation.

Stage only this prompt, source, spec and four owning docs. Inspect staged diff
and commit locally to main using caveman-commit with the integrity rationale.
Return the commit and safe inspection commands:
`npm run ops:reconcile-test` and
`node scripts/ops/reconcile-storage-objects.js --help`. Do not push.

## SKILLS USED

- `architecture-patterns`: keep driver evidence checks in the existing adapter.
- `deployment-pipeline-design`: preserve recovery and operator launch gates.
- `error-handling-patterns`: fixed whole-result failure before publication.
- `secrets-management`: preserve private metadata boundaries and fixed errors.
- `security-best-practices`: reject contradictory evidence without coercion.
- `postgres-best-practices`: verify complete SELECT result semantics.
- `javascript-testing-patterns`: direct and runner regression coverage.
- `requesting-code-review`: dispatch independent read-only review.
- `receiving-code-review`: verify findings before fixes.
- `caveman-commit`: required local Conventional Commit.
