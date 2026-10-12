# Phase 12K — Validate database inventory command tags

## Scope and sequence

Continue Phase 12K recovery evidence after committed Prompt 329
(b3ac3d6a00378059aadb4ae79607b23362ce6eab), on clean main. Phase 12
remains the earliest unfinished parent. Operator-owned live recovery evidence
is unavailable; this dependency-safe step closes a reproduced contradiction
at the existing PostgreSQL inventory adapter. The user entered `i` then
“implement plan when finished”, authorizing this prompt's execution after
writing and rereading it. Execute only this prompt through review and commit.

Fresh pre-change probe: queryDatabaseStoredObjects with an injected result
`{ command: 'DELETE', rowCount: 0, rows: [] }` returned
`{"command":"DELETE","accepted":0}`. Non-SELECT completion metadata must
not support evidence from this adapter's one completed SELECT.

## References and verified authority

Read AGENTS.md; docs/build-plan.md Phase 12 and Prompt 329; docs/skills.md;
docs/operations.md current operations inventory and Prompt 329;
docs/launch-checklist.md Category 6 and shared prerequisites;
docs/security.md current recovery boundary and Prompt 329;
docs/system-architecture.md §§11.3–11.4; docs/product.md V1 recoverable
operations. Inspect scripts/ops/reconcile-storage-objects.js, its spec and TS
facade, package.json, scripts/ops/audit-dependencies.sh and installed
node_modules/pg/lib/result.js. The driver initializes command to null and sets
it to match[1] from a command-completion tag; SELECT completion is uppercase
SELECT. Verify using the installed Result class and synthetic completion
messages, without live database access. The SQL is one SELECT, not arbitrary
commands; null is invalid for its completed result. This does not constrain
unrelated pg commands. Omitted/undefined metadata stays supported for injected
adapters, consistent with the row-count contract.

Read node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md for the
existing build command. No new framework API is introduced. No visual surface,
comp measurement or breakpoint change applies. No SQL, schema, runtime,
API, CI, telemetry or credentials change is needed. Phase-wide Nest/browser,
CI/scanner, telemetry and threat-model-authoring skills have no triggered
implementation surface here. No Node CLI-specific security reference is
installed; verified driver source and existing repository contracts apply.

## Required behavior

1. Within queryDatabaseStoredObjects, after result record/row validation and
   before mapping/conversion, any defined result.command must be exact
   primitive string SELECT. Use strict equality without coercion, trimming,
   case folding or substring acceptance. Throw existing fixed
   `Database inventory is invalid` on rejection.
2. Reject other commands (DELETE/UPDATE/INSERT/SHOW), empty/blank/lowercase,
   padded, suffixed or control-containing strings, null, boxed strings,
   booleans, numbers, NaN/infinity, bigint, symbols, arrays and objects,
   including an object with throwing coercion hooks. Do not expose values.
   Reject for both empty and nonempty valid inventories with matching counts.
3. Preserve omitted/undefined command and exact SELECT with empty/nonempty
   rows and omitted/valid rowCount. Preserve frozen caller ownership, row
   order, opaque fields and bigint conversion. SELECT must not excuse invalid
   rows or contradictory rowCount. Check installed pg Result completion tags
   synthetically for empty and populated SELECTs.
4. Runner failures return 1 with fixed `Error: Database query failed`, only
   the connecting log, one query, zero S3 requests, no summary, receipt or
   temporary file. Caller-owned injected clients must not end/destroy.
   Supported results continue publishing clean simulation receipts.

Compatibility changes only for malformed or contradictory supplied command
metadata. Keep SQL, pure comparison, storage listing, CLI/env defaults, TS
facade, receipt schema/publication and Stage 7 unchanged. Non-goals: mandatory
command metadata, field/oid/row-mode validation, live calls, atomic snapshots,
query selection changes, resource limits, hostile in-process getters/proxies,
dependency updates, deployment, operator approvals or push. A command tag
cannot prove inventory completeness/authenticity, object bytes or recovery.

## File changes and test-first execution

1. Reread this prompt and invoke every listed skill before code. Preserve all
   1186 prior tests. Append cases to reconcile-storage-objects.spec.js using
   inventoryDbRecord/createIo/listingClient and isolated temporary directories.
2. Parameterize direct rejection across empty and populated frozen inventories
   with matching rowCounts. Assert fixed error, one query, unchanged ownership
   and no coercion. Cover all invalid categories above.
3. Direct compatibility covers absent/undefined/SELECT, empty/multiple rows,
   omitted/exact counts, frozen rows/results, extra fields, original byte-count
   strings and ordered bigint output. SELECT alongside malformed/sparse/
   duplicate rows or mismatching count still rejects. Driver completion-tag
   cases exercise installed Result.addCommandComplete for SELECT 0/SELECT 1.
4. Runner failure cases cover every invalid command category, using empty and
   nonempty results across the matrix. Assert fixed diagnostics, bounded
   requests, client ownership and no filesystem output. Success covers exact,
   omitted and undefined tags for empty/nonempty inventory, receipt status,
   simulation mode, matched count and exclusive final file. Clean in finally.
5. Run focused tests red before changing source. Add one compact guard in
   reconcile-storage-objects.js before conversion; rerun green. No refactor.

## Verification, review and completion

Run direct node --test and npm run ops:reconcile-test; source/spec node -c;
CLI --help; installed Prettier on changed source/spec regions; git diff --check;
npm run lint, npm run typecheck, npm run build. Inspect actual outputs. If
sandbox child-process restrictions obstruct checks, rerun with permitted
ordinary child-process access and report both attempts.

Resolve independent offline stages from package.json ops:check, run each and
inspect every exit status/suite total. Omit online ops:audit under the recorded
registry-metadata disclosure restriction; claim neither aggregate ops:check
success nor fresh vulnerability inventory. Run the deterministic validator
`node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`
and record expected fail-closed counts (previously 0 approved / 11 blocked /
70 blockers). Do not supply operator evidence or launch approval.

After self-verification use requesting-code-review and its template to dispatch
one independent read-only reviewer. BASE_SHA and HEAD_SHA are both
b3ac3d6a00378059aadb4ae79607b23362ce6eab plus the working diff. Provide this
prompt, requirements, driver semantics and actual checks. No subdelegation.
Use receiving-code-review to verify feedback; fix valid findings, retest and
request follow-up review if changes are significant.

Record implementation, red/green evidence, actual outputs, review,
compatibility, limits, inspection commands and ordinary-revert rollback in
docs/operations.md. Add concise records to docs/build-plan.md, docs/security.md
and Category 6 in docs/launch-checklist.md. Prompt 201, Category 6 live recovery
approval and Phase 12 exit stay open. Stage only this prompt, source, spec and
four docs; inspect staged diff and commit locally to main with caveman-commit.
Return the commit and safe inspection commands `npm run ops:reconcile-test`
and `node scripts/ops/reconcile-storage-objects.js --help`. Never push.

## SKILLS USED

- `architecture-patterns`: keep driver-evidence validation in its adapter.
- `deployment-pipeline-design`: preserve recovery and launch approval gates.
- `error-handling-patterns`: fail whole results before publication.
- `secrets-management`: preserve metadata privacy and fixed diagnostics.
- `security-best-practices`: reject contradictory evidence without coercion.
- `postgres-best-practices`: verify completed SELECT command semantics.
- `javascript-testing-patterns`: direct and runner regression cases.
- `requesting-code-review`: dispatch independent read-only review.
- `receiving-code-review`: verify feedback before fixes.
- `caveman-commit`: required local Conventional Commit.
