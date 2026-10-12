# Phase 12K — Enforce storage listing bucket-name continuity

## Scope, sequence and authorization

Continue Phase 12K after committed Prompt 325 (`9ec4e50`) on clean main. Git
and current code establish optional Name shape validation is implemented.
A fresh bounded probe accepted keys `first`, `second` from pages naming
`bucket-one`, `bucket-two` under an alias request. One inventory must not mix
contradictory supplied bucket names. This is the user's explicitly authorized
one additional prompt after Prompt 325. Write/re-read, implement, verify, review,
document and commit locally, then stop. No additional prompt or push.

## References and API authority

Read AGENTS.md workflow/product contract, docs/build-plan.md Phase 12 and latest
record, docs/skills.md, docs/operations.md Prompt 325 and recovery contract,
docs/launch-checklist.md Category 6, docs/security.md compromised-service and
listing boundary, docs/system-architecture.md adapter/recovery principles and
docs/product.md recoverable operations. Inspect `scripts/ops/reconcile-storage-objects.js`, its spec and TS facade,
root package.json and the installed SDK
node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts ListObjectsV2
output/request declarations. Read the installed Next CLI build guide for checks.

Name is optional string metadata describing the bucket. Request identifiers can
be aliases/ARNs, so comparing Name with the request identifier remains out of
scope. Exact continuity between supplied response names is the project safety
contract; it does not establish authenticity or prove the real bucket identity.
No standalone Node CLI skill/reference covers this adapter; existing verified
Node primitives and installed SDK declarations supply authority. No UI/static
measurements, Next/React/Tailwind/Nest API, SQL/schema, topology, CI, telemetry,
scanner implementation or new trust boundary changes. Their phase-wide skills
are not triggered by this bounded stateful validation step.

## Behavioral contract

1. Preserve Prompt 325's optional nonblank primitive Name validation.
2. Remember the first defined valid Name in a local variable for this invocation.
   Every subsequent defined Name must strictly equal that exact string. Do not
   normalize case, whitespace, Unicode, punctuation or path-looking contents.
3. Missing/undefined Name on any page remains valid and must not clear the
   remembered name. A first name may appear on a later or terminal page. All
   unnamed pages remain supported. State must not carry across invocations,
   even when one client instance is reused.
4. Reject contradictions at page validation before entries or another request,
   with existing fixed `Object storage listing is invalid or incomplete`.
   Any earlier entries remain private; rejection returns no partial inventory.
5. Runner returns 1 with only connection/fixed storage error output, and no
   summary/receipt/temp files. Never log either name or tokens/keys.
6. Valid named/unnamed combinations retain exact request scope, token order,
   frozen ownership, object metadata conversion and clean simulation receipts.
   Alias/ARN request strings may differ from the stable response name.

Intentional compatibility change: contradictory supplied names across one
paginated scan reject. Omitted names do not become mandatory; no real routing,
provider grammar or request-name equality policy is added. Public signatures,
CLI/env precedence, SQL/comparison, receipt schema/publication and Stage 7 stay
unchanged. Non-goals: mandatory echoes, request identity matching, hostile
getters/proxies, limits/timeouts, authentication proofs, content hashing,
atomic snapshots, live services/evidence, launch approval or dependencies.

## Implementation and regression plan

1. Re-read this prompt and reload all listed skills before editing.
2. Append bounded tests to existing scripts/ops/reconcile-storage-objects.spec.js.
   Cases reject direct and delayed contradictions (both absent and undefined
   intervening pages); first known name may begin on page two. Cover case-only,
   whitespace-only and canonically equivalent Unicode differences with literal
   strings. Use valid contents and next tokens on conflicting pages so the
   request-count assertion proves validation precedes another send.
3. Positive cases: no names; late first name; first name only; stable names with
   absent/undefined gaps; exact opaque/whitespace-surrounded values; alias/ARN
   request differing from echo; empty intermediate pages. Assert exact returned
   item order and converted date/checksum fields, frozen inputs and request
   sequence. Reuse one fake client across separate calls with different valid
   names to prove no leaked invocation state.
4. Runner regressions: direct and gap-separated contradictions suppress output
   publication in isolated temporary directories, with fixed diagnostics and
   exact request bounds. A stable named scan with optional gap publishes a
   clean simulation receipt under a differing alias request.
5. Run red direct tests before source changes, then implement local remembered
   name and compact guard extending existing validation. Preserve all 1003 prior
   cases; use installed Prettier only on changed regions with existing conventions.

## Verification and completion

Run direct red/green and permitted `npm run ops:reconcile-test`, source/spec
`node -c`, CLI `--help`, changed-region formatting and `git diff --check`.
Run root npm run lint, npm run typecheck, npm run build with normal permitted
processes where established sandbox worker limits apply. Inspect full diff.
Run all 33 independent offline stages resolved from current ops:check; inspect
each result and aggregate suite counts. Omit only online ops:audit under the
existing registry metadata-disclosure restriction; no aggregate ops:check or
fresh vulnerability inventory claim. Run ops:launch-readiness and retain expected
exit 1 / 0 approved / 11 blocked / 70 blockers.

After checks dispatch one independent read-only reviewer via requesting-code-review and its
reviewer template with base/head 9ec4e50 plus working diff, this prompt, SDK
semantics and actual outputs. No reviewer subdelegation. Evaluate feedback with
receiving-code-review; verify/fix valid findings, rerun affected checks and
re-review significant changes. Then record actual outputs, contract, review,
limits, inspection and ordinary revert rollback in docs/operations.md; add
concise records to docs/build-plan.md, Category 6 docs/launch-checklist.md and
docs/security.md. Prompt 201/Category 6 live approval/Phase 12 exit remain open.
Stage only prompt, source, spec and four docs, inspect staged diff and commit
locally to main with caveman-commit and security rationale. Return both commit
IDs and safe inspection commands `npm run ops:reconcile-test` and
`node scripts/ops/reconcile-storage-objects.js --help`. Stop; no push or further prompt.

## SKILLS USED

- `architecture-patterns`: keep pagination state local to the adapter invocation.
- `deployment-pipeline-design`: preserve recovery evidence and launch gates.
- `error-handling-patterns`: fail whole inventories before consumption/publication.
- `secrets-management`: suppress private response names and pagination metadata.
- `security-best-practices`: enforce exact non-coercing metadata continuity.
- `javascript-testing-patterns`: bounded stateful adapter and runner regressions.
- `requesting-code-review`: independent read-only review after checks.
- `receiving-code-review`: verify findings before fixes or re-review.
- `caveman-commit`: required local commit with security rationale.
