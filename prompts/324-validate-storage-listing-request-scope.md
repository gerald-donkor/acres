# Phase 12K — Validate storage listing request scope

## Scope, sequence and authorization

Continue Phase 12K recovery-evidence hardening after committed Prompt 323
(`872695f`). Fresh git/code inspection confirms returned-key prefix enforcement
is built and the worktree is clean on `main`. Read-only bounded probes show
`prefix: false` is silently widened to an omitted prefix, while missing or
object-valued buckets reach `s3Client.send`; all three probes accepted an empty
terminal response after one request. Validate the listing adapter's request
scope before acquisition so invalid caller input cannot become recovery evidence
or cause unintended broad reads.

The user explicitly authorized writing and implementing one additional prompt
after Prompt 323. This is that follow-on prompt. Write/re-read and execute it
without asking approval again. Stop after its reviewed local commit; do not
write another prompt or push.

## References read and verified authority

Read `AGENTS.md`, `docs/build-plan.md` Phase 12/sequence gates and Prompt 323
record, `docs/skills.md`, `docs/operations.md` recovery runbook/Prompt 323,
Category 6 and the prerequisite register in `docs/launch-checklist.md`, the
compromised-service and reconciliation sections in `docs/security.md`, adapter
and recovery principles in `docs/system-architecture.md`, and product ownership
in `docs/product.md`. Reinspect `scripts/ops/reconcile-storage-objects.js`, its
spec and `.ts` facade, plus root `package.json`.

Installed `node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts`
declares ListObjectsV2Request Bucket as a string field and optional Prefix as
`string | undefined`. Bucket documentation explicitly supports access-point
aliases/ARNs; do not impose a DNS-name regex or assume a bucket Name echo equals
every supported request identifier. Prefix selects keys beginning with the
literal supplied string. Node non-coercing typeof checks and existing adapter
code supply the implementation authority. No skill supplies standalone Node
CLI guidance; the security skill has no standalone Node CLI reference.

No UI/static design measurement, Next/React/Tailwind/Nest API, SQL/schema,
infrastructure topology or new trust boundary is changed. Phase 12 skills for
Nest, GitHub Actions, telemetry/Grafana, scanner implementation, browser/E2E and
database work are not triggered by this narrow adapter precondition. Preserve
existing ports and verification tools rather than introducing new dependencies.

## Behavior and compatibility contract

1. Before constructing/sending any listing command, require bucket to be a
   primitive string with at least one non-whitespace character. Missing,
   undefined, null, empty/whitespace-only and non-string buckets reject.
2. Prefix may be omitted, explicitly undefined or a primitive string, including
   empty or whitespace-only strings. All defined non-string prefixes reject,
   including null and falsy false/0/NaN. Do not coerce boxed strings, arrays,
   objects, symbols or arbitrary primitives. Reject before client acquisition,
   even if the fake/provider would return an empty terminal page.
3. Keep nonblank bucket identifiers and every valid prefix unchanged in request
   input; validation must not trim/rewrite them. Preserve existing empty-prefix
   normalization to undefined. Accept access-point aliases and ARN-shaped
   strings at this validation boundary without claiming live SDK routing support.
4. Invalid scope rejects with the existing fixed
   `Object storage listing is invalid or incomplete`, with zero send calls.
   Never evaluate an invalid input's custom toString/valueOf/Symbol.toPrimitive.
   Reuse the existing error factory and one compact precondition before the loop.
5. Runner failures from invalid truthy configured bucket values return 1, log
   the existing connection line and fixed
   `Error: Object storage connection or listing failed`, and produce no summary,
   receipt or temporary output. Use injected database evidence and isolated
   output directories to exercise this without any live PostgreSQL/storage.
6. Preserve valid request shapes, pagination, response metadata/key validation,
   ordering, frozen caller ownership, normal receipts and CLI defaults.

Intentional compatibility change: invalid direct JavaScript adapter scope values
that previously reached the SDK/client or broadened to bucket-wide scans now
reject. Valid requests are unchanged. This is shape validation, not authorization
or verification of a real bucket's identity, existence, namespace or contents.

Non-goals: validating the parameter container or s3Client implementation,
changing CLI parsing/default/env precedence (including falsy environment fallback),
new CLI flags, Name-echo policy, DNS/length/provider restrictions, endpoint/region
validation, public signatures/types, comparison filters/injected inventories,
SQL/schema, byte hashing, receipt format/publication, Stage 7, timeouts/caps,
hostile getters/proxies, dependencies, live services, deployment or launch approval.

## Target files and implementation steps

1. Re-read this prompt and reload every listed skill before code changes.
2. Add focused tests to `scripts/ops/reconcile-storage-objects.spec.js` using the
   existing bounded `listingClient`, `createIo` and inventory helpers. A valid
   empty provider response must not make malformed scope acceptable.
3. Cover missing/undefined/empty/blank buckets separately. Use a concise shared
   invalid-type matrix for bucket and prefix: null, booleans, zero, NaN, bigint,
   symbol, array, object, boxed string and a coercion-trap object. Assert the
   fixed adapter error and zero requests for each; make every coercion hook
   throw a private sentinel so accidental conversion fails the assertion.
4. Positive cases verify omitted/undefined/empty prefix normalization, literal
   whitespace prefixes, opaque percent/Unicode/path-looking prefixes and
   unchanged nonblank bucket strings including aliases and ARN-shaped inputs.
   Freeze the request container/response where practical. Preserve existing
   pagination tests rather than duplicate all metadata coverage.
5. Runner cases use object/boxed/blank truthy env bucket values and a scoped CLI
   request with otherwise clean injected DB data. Assert exact failure output,
   zero storage sends and an empty temporary output directory. Add a valid
   configured-bucket multi-page simulation receipt case with scoped keys and
   exact request scope/counts; preserve normal default behavior already covered.
6. Run direct red tests before source edits and record actual failures. Add the
   compact precondition to `scripts/ops/reconcile-storage-objects.js`; run green
   direct and normal permitted npm tests. Preserve all 928 existing cases.
7. Format only new/changed regions with installed Prettier and existing
   single-quote/arrow-parens conventions; do not reformat whole files.

## Verification and completion

Run direct red/green tests, `npm run ops:reconcile-test`, source/spec `node -c`,
CLI `--help`, changed-region Prettier, `git diff --check`, root `npm run lint`,
`npm run typecheck` and `npm run build`. Inspect complete source/spec/prompt diff.
Use the permitted identical process mode for known sandbox child-worker limits;
record actual restricted failures if encountered, without weakening checks.

Resolve every independent offline stage from current `ops:check` in package.json
and run each, optionally batching independent stage processes. Omit only online
`ops:audit` under the recorded metadata-disclosure restriction; inspect every
result and aggregate suite counts, without claiming a full ops:check pass or
fresh vulnerability inventory. Run `npm run ops:launch-readiness` and preserve
expected example exit 1 / 0 approved / 11 blocked / 70 blockers.

After self-verification, dispatch one independent high-effort read-only reviewer
with requesting-code-review/template, base/head `872695f` plus working diff,
this prompt, installed SDK authority and real check results. Use
receiving-code-review to verify feedback, fix valid issues and rerun affected
checks; re-review significant changes.

Record actual implementation/output, compatibility change, limitations, review,
safe inspection commands and ordinary revert rollback in `docs/operations.md`.
Add concise evidence to `docs/build-plan.md`, Category 6 of
`docs/launch-checklist.md` and the reconciliation boundary in `docs/security.md`.
No migration/storage mutation is needed for rollback. Prompt 201, Category 6
live recovery approval and Phase 12 exit remain open.

Stage only prompt/source/spec/four docs, inspect staged diff and commit locally
to `main` using caveman-commit with a security rationale. Return both Prompt
323/324 commit IDs and safe local inspection instructions:
`npm run ops:reconcile-test` and
`node scripts/ops/reconcile-storage-objects.js --help`. Stop; no push or additional prompt.

## SKILLS USED

- `architecture-patterns`: preserve listing adapter and comparison boundaries.
- `deployment-pipeline-design`: keep recovery evidence and launch gates intact.
- `error-handling-patterns`: reject before acquisition with fixed failure output.
- `secrets-management`: prevent invalid configuration values leaking into logs.
- `security-best-practices`: non-coercing request-scope validation.
- `javascript-testing-patterns`: bounded precondition/runner regressions.
- `requesting-code-review`: independent high-effort review after self-verification.
- `receiving-code-review`: verify feedback before corrections or re-review.
- `caveman-commit`: required local Conventional Commit with security rationale.
