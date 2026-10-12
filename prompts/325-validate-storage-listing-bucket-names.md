# Phase 12K — Validate storage listing bucket-name metadata

## Scope and sequence

Continue Phase 12K's recovery-evidence gate after committed Prompt 324
(`920435a`). Git history and current source establish all prior request-scope,
prefix, pagination and page-count validation is implemented. The clean worktree
has no pending prompt. A bounded read-only probe returned an empty inventory
from `{ IsTruncated: false, Name: { private: 'sentinel' } }` after one request.
Malformed provider bucket-name metadata must not silently become recovery evidence.

The user authorized immediate execution after planning and one subsequent
prompt. Re-read this file, implement only this scope, review, document and commit
locally; only then resolve/write/implement the additional prompt. No push.

## References and verified authority

Read `AGENTS.md` §§2–10; `docs/build-plan.md` Phase 12, sequence gates and
Prompt 324 record; `docs/skills.md`; `docs/operations.md` recovery contract and
Prompt 324; `docs/launch-checklist.md` Category 6; `docs/security.md` compromised
service assumption and reconciliation boundary; `docs/system-architecture.md`
backup/recovery and adapter boundaries; `docs/product.md` recoverable operations.
Inspect `scripts/ops/reconcile-storage-objects.js`, its `.spec.js` and `.ts`
facade, and root `package.json`.

Installed `node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts`
ListObjectsV2Output declares optional `Name?: string | undefined` as the bucket
name. Request Bucket supports aliases/ARNs; response-name equality with request
Bucket is deliberately not required. A nonblank supplied name is a project
validation decision, not a measured provider limit. Preserve nonblank strings
literally: no DNS regex, trimming, normalization or routing assumptions.
No standalone Node CLI skill reference exists; installed SDK types, existing
Node primitives and the loaded error/security guidance are authority here.
No UI measurements, Next/React/Tailwind/Nest API, schema/SQL, topology or new
trust boundary changes. Phase-wide skills for those unchanged surfaces, CI,
telemetry, scanners and browser/E2E are not triggered by this bounded adapter fix.

## Required behavior and compatibility

1. Optional absent/explicitly undefined Name remains supported on every page.
2. A defined Name must be a primitive string containing a non-whitespace
   character. Reject null, booleans, numbers (including NaN), bigint, symbol,
   arrays, objects, boxed strings, empty and whitespace-only strings.
3. Validate directly after the existing response shape guard, before entries
   or pagination; invalid metadata rejects the whole inventory, including on
   later pages. No further requests may be issued after the bad page.
4. Use existing fixed `Object storage listing is invalid or incomplete` error.
   Never interpolate or coerce invalid names; coercion hooks must not run.
5. Runner failures return 1, print only existing connection/fixed storage error
   output, and produce no summary, receipt or temporary file. Earlier valid
   pages must not leak a partial inventory into successful publication.
6. Preserve valid opaque and whitespace-surrounded names, alias/ARN requests,
   omitted names, frozen caller data, metadata conversion and ordinary receipts.
   Do not compare names across pages in this prompt; that is a distinct stateful
   validation step to resolve after this commit.

Intentional compatibility change: defined malformed or blank provider names
reject. Valid requests/responses, CLI/default/env handling, public types,
comparison, SQL, receipt schema/publication and Stage 7 remain unchanged.
Non-goals: proving the real bucket identity/authenticity, equality with request
identifiers, cross-page name continuity, mandatory Name, provider name grammar,
limits/timeouts, hostile getters/proxies, content hashing, live operations,
operator approval, dependencies or deployment.

## Files and implementation

1. Re-read prompt and reload all listed skills before editing code.
2. Append focused name-metadata tests to the existing spec, using listingClient,
   createIo and inventoryDbRecord. Shared invalid matrix covers types and blank
   strings; test first and later pages with valid contents/next tokens so failure
   precedence and request bounds are observable. Include a coercion trap whose
   toString/valueOf/Symbol.toPrimitive throw private sentinels.
3. Positive cases cover omitted/undefined, plain and opaque nonblank names,
   unchanged leading/trailing whitespace, and an alias/ARN request whose echoed
   name differs. Verify frozen inputs and exact request preservation. Include
   an empty intermediate page so the optional metadata does not alter pagination.
4. Runner regressions cover first/later invalid Name with injected DB and bounded
   S3 clients, isolated temporary output directories and exact fixed diagnostics;
   assert no output files. Include a valid named-page simulation receipt.
5. Run direct red tests before adding the compact source guard; then run green
   focused tests preserving all 969 existing cases. Format only changed regions
   with installed Prettier using existing single-quote/arrow-parens conventions.

## Verification, review and completion

Run `npm run ops:reconcile-test`, source/spec `node -c`, CLI `--help`, changed
region formatting, `git diff --check`, root `npm run lint`, `npm run typecheck`
and `npm run build`. Read the relevant installed Next build guide before running
the unchanged build. Record real outputs and sandbox limits; use already
established permitted process mode if needed without changing assertions.
Run every independent offline stage resolved from current package.json ops:check,
inspect every result and aggregate counts. Omit ops:audit under the recorded
registry metadata-disclosure restriction; do not claim aggregate ops:check or
fresh vulnerability inventory. Launch-readiness example must stay exit 1,
0 approved / 11 blocked / 70 blockers.

After self-verification dispatch one independent read-only reviewer with
requesting-code-review template, base/head `920435a` plus working diff, this
prompt, SDK authority and real verification. Apply receiving-code-review,
verify claims, fix valid issues and rerun affected checks; re-review significant
changes. No reviewer subdelegation.

Record actual results, compatibility, limitations, review, inspection commands
and ordinary revert rollback in docs/operations.md. Add concise records to
docs/build-plan.md, Category 6 docs/launch-checklist.md and docs/security.md.
Prompt 201, Category 6 live approval and Phase 12 exit stay open.
Stage only prompt, source, spec and these four docs; inspect staged diff and
commit locally to main using caveman-commit with security rationale. Safe result
inspection: `npm run ops:reconcile-test` and
`node scripts/ops/reconcile-storage-objects.js --help`. Then prepare and execute
exactly one follow-on prompt under the user's authorization; no push.

## SKILLS USED

- `architecture-patterns`: preserve adapter/comparison boundaries.
- `deployment-pipeline-design`: preserve recovery and launch gates.
- `error-handling-patterns`: fixed fail-fast whole-inventory errors.
- `secrets-management`: suppress private provider data in diagnostics.
- `security-best-practices`: non-coercing provider metadata validation.
- `javascript-testing-patterns`: bounded adapter and runner regressions.
- `requesting-code-review`: independent read-only review after checks.
- `receiving-code-review`: verify feedback before fixes.
- `caveman-commit`: required local Conventional Commit and security rationale.
