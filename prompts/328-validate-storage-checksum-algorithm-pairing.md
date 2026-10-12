# Phase 12K — Validate storage checksum algorithm pairing

## Scope, sequence and authorization

Continue the Phase 12K recovery-evidence gate after committed Prompt 327
(`e4f22c98eb9652827033866ab1010f33614b0d3c`) on clean main. Phase 12 is the
earliest unfinished parent; operator-owned live evidence remains unavailable.
This dependency-safe step corrects a verified contradiction at the existing
listing adapter. The user's `i` requests one new prompt and “implement plan
when finished” authorizes execution after writing and rereading it. Finish
this prompt through checks, independent review, documentation and local commit.
Do not prepare another prompt or push.

A fresh offline probe returned a canonical SHA256 extension marked
ChecksumType FULL_OBJECT and ChecksumAlgorithm ['CRC32']. The adapter accepted
it and comparison with the matching DB SHA256 produced exactly
`{"accepted":1,"status":"clean","matched":1}`. Supplied contradictory
algorithm metadata must not be silently interpreted as SHA256 evidence.

## References read and API authority

- AGENTS.md, especially phase commands, prompt contract, checks and review.
- docs/build-plan.md Phase 12 and committed Prompt 327 record; docs/skills.md.
- docs/operations.md Prompt 327; docs/launch-checklist.md Category 6;
  docs/security.md Prompt 327; docs/system-architecture.md §§2 and 11.3–11.4;
  docs/product.md recoverable-operations behavior.
- scripts/ops/reconcile-storage-objects.js, its .spec.js and .ts facade;
  package.json scripts and scripts/ops/audit-dependencies.sh.
- Installed node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts
  `_Object`: ChecksumAlgorithm is an optional array describing the algorithm
  used to create the object checksum. Standard listings expose algorithm/type
  hints without SHA256 digest values. ChecksumSHA256 is this utility's existing
  optional provider extension, not a newly claimed SDK listing property.
- Installed node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md
  for production build verification.

No UI, static design or measurement is involved, so no comp crop applies.
There are no new framework APIs, SQL, migrations, topology, CI, telemetry,
credentials or trust boundaries. Phase-wide Nest, browser/E2E, threat-model
authoring, GitHub Actions, scanner, Prometheus and Grafana skills have no
triggered surface in this bounded adapter change. No dedicated Node CLI
security reference exists in the loaded security skill; use verified SDK
declarations, repository contracts and existing Node primitives.

## Required behavior and compatibility

1. Only inside the existing non-null/defined ChecksumSHA256 branch, validate a
   defined ChecksumAlgorithm before digest decoding or inventory inclusion.
   It must be an array containing the exact primitive string SHA256. Every
   array entry must be a primitive nonblank string. Reject null, scalar strings,
   boxed strings, objects, numbers, booleans, empty/sparse arrays, arrays missing
   SHA256, case/space substitutes, and arrays with malformed members. Check
   sparse slots explicitly: Array.every alone skips holes. No coercion.
2. Preserve omitted/undefined algorithm metadata for legacy digest extensions.
   Accept SHA256 alongside other nonblank primitive strings; do not introduce
   an enum allowlist, ordering rule or uniqueness requirement. The extra hints
   are not used in comparison. This accommodates future provider algorithms
   without accepting a missing or malformed SHA256 assertion.
3. Absent/undefined/null ChecksumSHA256 retains checksumHex null and ignores
   unused algorithm/type hints, including CRC32-only or malformed hints. Normal
   metadata-only SDK listings remain supported; no mandatory digest acquisition.
4. Preserve Prompt 327's exact FULL_OBJECT validation and untyped compatibility,
   canonical 32-byte base64 decoding, literal key order, dates/sizes, prefix
   and pagination commands, frozen caller ownership and whole-scan rejection.
   Any contradiction on first/later pages rejects with the existing fixed
   invalid-listing error before another send. Earlier entries never publish.
5. Runner failures return 1, retain only the existing connection log and fixed
   storage error, and publish no summary, receipt or temporary file. Successful
   SHA256/multi-algorithm/legacy and digestless runs still publish simulation
   receipts with existing comparison semantics.

Intentional change: contradictory defined algorithm metadata accompanying an
actual SHA256 extension becomes an error. Routes and public contracts do not
change. Keep CLI/env precedence, comparison, SQL, TS facade, receipt publication
and schema, and Stage 7 untouched. Non-goals: generic digest-length changes,
mandatory algorithms or digests, new SDK requests, HEAD/GET, byte hashing,
multipart reconstruction, endpoint authenticity, atomic snapshots, request or
resource bounds, hostile getters/proxies, live services, deployment, dependencies
and operator approval. Metadata consistency alone does not prove actual bytes.

## File changes and test-first implementation

1. Reread this prompt and every named skill before implementation. Append tests
   to scripts/ops/reconcile-storage-objects.spec.js using existing listingClient,
   bucketContinuityPages, canonicalSha256, inventoryDbRecord and createIo helpers.
   Keep all 1060 prior cases intact.
2. Exercise first/later invalid pages with a valid further page/token to detect
   extra sends. Cover CRC32-only, empty, scalar, null and non-array forms,
   wrong case/whitespace, mixed malformed members, sparse arrays (including a
   hole alongside SHA256), boxed/coercible members and throwing coercion hooks.
   Assert fixed errors, exact send counts and unchanged frozen fixtures.
3. Positive frozen multi-page cases cover omitted/undefined, SHA256 alone,
   SHA256 with other algorithms in either order, repeated SHA256 and future
   nonblank names. Assert full converted inventories and exact command inputs.
   Digestless absent/undefined/null cases ignore malformed/contradictory hints.
4. Runner tests use isolated temporary directories and injected DB/S3 clients.
   First/later CRC32-only failures produce fixed logs and zero output files.
   Valid typed, multi-algorithm and legacy digests match a DB SHA256 and publish
   clean simulation receipts; CRC32-only hints without a digest remain valid
   metadata-only receipts. Always clean fixture directories.
5. Run the complete focused suite red before editing source. Add a compact
   guard inside scripts/ops/reconcile-storage-objects.js beside the existing
   checksum-type guard. Validate all array slots without mutation/coercion;
   avoid unrelated refactors. Then run green and inspect the diff.

## Verification and completion

Run node --test scripts/ops/reconcile-storage-objects.spec.js and npm run
ops:reconcile-test; source/spec node -c; CLI --help; changed-region formatting
with installed Prettier; git diff --check; root npm run lint, npm run typecheck
and npm run build. Inspect actual outputs and full diff. If sandbox worker
limits prevent a real run, use permitted ordinary child processes and record
both results; never call a wrapper-only test result full-suite evidence.

Run independent offline stages resolved from package.json ops:check, retaining
every stage status and suite total. Omit online ops:audit under the recorded
registry metadata-disclosure restriction; claim neither aggregate ops:check
success nor a fresh vulnerability inventory. Run ops:launch-readiness and
record actual unresolved blockers; the latest committed result is exit 1,
0 approved, 11 blocked and 70 blockers. This is no launch approval.

After self-verification, use requesting-code-review and its template to dispatch
one read-only reviewer. Base/head is e4f22c9 plus the working diff; provide this
prompt, SDK semantics, compatibility decisions, files and actual checks. No
reviewer subdelegation. Evaluate feedback with receiving-code-review, verify
and fix valid findings, rerun affected checks and rereview significant changes.

Record the real red/green results, checks, review, limits, compatibility and
safe inspection instructions in docs/operations.md. Add concise records in
docs/build-plan.md, docs/launch-checklist.md Category 6 and docs/security.md.
Prompt 201, Category 6 live recovery acceptance and Phase 12 exit remain open.
Rollback is ordinary commit revert without schema or storage mutations.

Stage only this prompt, source, spec and the four owning docs. Inspect staged
diff and commit locally to main using caveman-commit with the security rationale.
Return the commit and `npm run ops:reconcile-test` / `node
scripts/ops/reconcile-storage-objects.js --help` inspection commands. No push.

## SKILLS USED

- `architecture-patterns`: keep provider metadata validation in the existing adapter.
- `deployment-pipeline-design`: preserve recovery-evidence and launch gates.
- `error-handling-patterns`: reject whole scans before evidence publication.
- `secrets-management`: preserve fixed diagnostics without private metadata.
- `security-best-practices`: reject contradictory checksum evidence without coercion.
- `javascript-testing-patterns`: meaningful adapter and runner regression coverage.
- `requesting-code-review`: independent read-only review after self-verification.
- `receiving-code-review`: verify findings against actual code and contracts.
- `caveman-commit`: required local commit with the security rationale.
