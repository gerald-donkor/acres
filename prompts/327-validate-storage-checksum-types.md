# Phase 12K — Validate storage checksum extension types

## Scope and authorization

Continue Phase 12K's recovery-evidence gate after committed Prompt 326
(`3d3762c`) on clean main. Phase 12 remains the earliest unfinished parent:
operator-owned launch evidence is unavailable, while this dependency-safe
adapter correction can be verified offline. The user's `i` requests one new
prompt; “implement plan when finished” authorizes immediate execution after
writing and rereading it. Complete this prompt through review and local commit,
then stop without preparing another prompt or pushing.

A fresh synthetic pre-change probe supplied a canonical 32-byte SHA256 digest
with `ChecksumType: 'COMPOSITE'`. The adapter accepted it as checksumHex and
reconciliation reported `{"accepted":1,"status":"clean","matched":1}` against
a whole-object database checksum. A composite calculation is not evidence of
the existing whole-object digest contract. Reject supplied contradictory type
metadata rather than silently interpreting it as a whole-object checksum.

## References and authority

Read AGENTS.md §§2–10, docs/build-plan.md Phase 12 and latest implementation
record, docs/skills.md, docs/operations.md Prompt 311 checksum extension
contract and Prompt 326, docs/launch-checklist.md Category 6, docs/security.md
existing listing boundary, docs/system-architecture.md adapter principles and
backup/recovery contract, and docs/product.md recoverable operations.
Inspect scripts/ops/reconcile-storage-objects.js, its spec, its TypeScript
facade, root package.json and installed S3 declarations:
node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts `_Object`,
ListObjectsV2Output and checksum-type comments; models/enums.d.ts ChecksumType.
The SDK distinguishes exact FULL_OBJECT and COMPOSITE values. Standard
ListObjectsV2 entries carry algorithm/type metadata but no SHA256 digest value;
ChecksumSHA256 remains an existing optional provider extension. Read installed
node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md for build checks.

No visual change or measurement occurs; static comps are not relevant. No
framework API, SQL, schema, topology, CI, telemetry or new trust boundary is
introduced. Phase-wide Nest, browser/E2E, threat-model authoring, scanner,
GitHub Actions, Prometheus and Grafana skills have no triggered surface here.
No standalone Node CLI security reference/skill covers this adapter; use the
installed SDK declarations, existing Node primitives and repository contract.

## Behavioral contract

1. Within the existing non-null/defined ChecksumSHA256 extension branch,
   supplied ChecksumType must be exactly the primitive string FULL_OBJECT, or
   be omitted/undefined. Reject COMPOSITE, null, other strings (including case
   and whitespace variants), objects/boxed strings, numbers, booleans and
   arrays without coercion, using the existing fixed invalid-listing error.
2. Check type before digest decoding and inventory inclusion. Any invalid entry
   on first/later pages rejects the entire scan before another send. Earlier
   collected entries never become partial evidence.
3. Absent/undefined/null ChecksumSHA256 retains checksumHex null. In this case
   algorithm/type hints remain ignored, including ordinary COMPOSITE metadata;
   do not add mandatory checksum acquisition or validate unused hint fields.
4. Omitted/undefined type with a valid digest preserves the established legacy
   provider-extension contract. Exact FULL_OBJECT digests retain canonical
   base64 validation, decoded hex, size/date conversion, literal keys, request
   scope/token order and frozen caller ownership. This compatibility choice
   does not prove digest authenticity, calculation method or actual bytes.
5. Runner failure returns 1 with only the existing connection line and fixed
   storage error; no summary, receipt or temporary file. Valid FULL_OBJECT or
   legacy extension runs still publish clean simulation receipts. Normal
   type-only listings retain metadata-only matching.

Intentional compatibility change: non-null digest extensions carrying defined
types other than FULL_OBJECT reject. No routes or public contracts change.
CLI/env defaults, comparison policy, SQL, TS facade, receipt schema/publication
and Stage 7 remain unchanged. Non-goals: ChecksumAlgorithm pairing, digest
length changes in generic inventories, mandatory metadata, HEAD/GET, multipart
reconstruction, object hashing, endpoint identity/authentication, atomic
snapshots, network/resource bounds, hostile getters/proxies, live services,
operator approvals, dependencies or deployment.

## Implementation and regressions

1. Re-read this prompt and review every listed skill at implementation start.
2. Append focused Node tests to scripts/ops/reconcile-storage-objects.spec.js.
   Reject canonical digest entries with COMPOSITE and representative malformed
   types; assert fixed errors and exact request bounds. Cover first-page and
   later-page contradictions with an otherwise valid next token/page so an
   erroneous further send is observable. Include throwing coercion hooks.
3. Positive frozen fixtures cover omitted/undefined/FULL_OBJECT type with
   canonical digests; preserve literal key order, sizes, dates, checksum hex
   and exact commands across pages. Type-only COMPOSITE and malformed hints
   with absent/undefined/null digest still return null checksumHex.
4. Runner tests in isolated temp directories cover first/later composite
   contradictions, ensuring fixed logs, no summary/receipt/temp files and
   bounded requests. Positive FULL_OBJECT and legacy digest receipts match
   whole-object DB SHA256. Include ordinary COMPOSITE hints without digest as
   a clean metadata-only receipt.
5. Run new tests red before editing source. Extend the existing digest guard
   compactly; do not refactor other validation. Preserve all 1023 previous
   cases. Use installed Prettier on changed regions to avoid unrelated churn.

## Verification, documentation and completion

Run direct red/green and npm run ops:reconcile-test; source/spec node -c and
CLI --help; changed-region formatting and git diff --check. Run root npm run
lint, npm run typecheck and npm run build, inspect actual output and full diff.
Use permitted ordinary processes if sandbox worker limits prevent a real run;
never treat a worker-wrapper-only result as individual-test evidence.
Run all independent offline stages resolved from current ops:check, retaining
each status and suite totals. Omit online ops:audit under the existing registry
metadata-disclosure restriction; make no aggregate ops:check pass or fresh
vulnerability inventory claim. Run ops:launch-readiness; expected unresolved
example result remains exit 1 / 0 approved / 11 blocked / 70 blockers.

After self-verification dispatch one read-only reviewer with requesting-code-review
and its template: requirements, base/head 3d3762c plus working diff, SDK
semantics, files, compatibility choices and actual checks. No reviewer
subdelegation. Evaluate claims with receiving-code-review; verify/fix valid
findings and rerun affected checks, rereview significant changes. Then record
the actual red/green outputs, checks, review, compatibility, synthetic evidence,
limits, inspection commands and ordinary revert rollback in docs/operations.md.
Add concise implementation records to docs/build-plan.md, Category 6 of
docs/launch-checklist.md and docs/security.md. Prompt 201, Category 6 live
approval and Phase 12 exit remain open.

Stage only this prompt, source, spec and four owning docs; inspect staged diff
and commit locally to main with caveman-commit and the security rationale.
Return commit and safe inspection commands `npm run ops:reconcile-test` and
`node scripts/ops/reconcile-storage-objects.js --help`. No push or next prompt.

## SKILLS USED

- `architecture-patterns`: keep provider checksum semantics at the adapter edge.
- `deployment-pipeline-design`: preserve recovery evidence and launch gates.
- `error-handling-patterns`: reject whole scans before evidence publication.
- `secrets-management`: retain fixed errors without private digest/key metadata.
- `security-best-practices`: avoid treating incompatible digest types as proof.
- `javascript-testing-patterns`: test meaningful adapter/runner failure and compatibility paths.
- `requesting-code-review`: independent read-only review after self-verification.
- `receiving-code-review`: verify findings against actual contracts before fixes.
- `caveman-commit`: write the required local commit and security rationale.
