# Phase 12K — Validate storage listing key counts

## Scope and why this is next

Continue the open Phase 12K recovery-evidence gate in `docs/build-plan.md`
§§13–14 after committed Prompt 313 (`7401daf`). The worktree starts clean on
`main`. Code/history confirm the earlier reconciliation safeguards are built.
A local synthetic probe of `listBucketObjects` accepts
`{ IsTruncated: false, KeyCount: 1, Contents: [] }`; reconciling that result
against an empty DB inventory returns `status: 'clean'`, `exitCode: 0`.
Reject contradictory or malformed supplied per-page key counts before the
adapter can return partial or misleading inventory evidence.

The user said “implement plan when finished.” That approves immediate execution
after writing and re-reading this prompt; no further approval question is needed.

## References and verified API authority

- `AGENTS.md`: phase selection, prompt, checks, review, docs and local commit.
- `docs/build-plan.md` §§13–14 and committed Prompt 313 record.
- `docs/skills.md`: exact skill paths and conditional phase manifests.
- `docs/operations.md`: Stage 7 recovery evidence and Prompts 305–313.
- `docs/launch-checklist.md` Category 6: independent live recovery still open.
- `docs/security.md`: existing inventory/diagnostic boundary and TM-19.
- `docs/system-architecture.md`: ports/adapters and DB/object authority.
- `docs/product.md`: existing product/role journeys; no scope change.
- `scripts/ops/reconcile-storage-objects.js`, `.spec.js`, `.ts`: adapter,
  pagination, runner, test conventions and public contracts.
- `node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts`,
  `ListObjectsV2Output`: `KeyCount?: number` describes keys returned by this
  request. Grouped `CommonPrefixes` require a delimiter; this utility sends
  no delimiter and consumes flat `Contents` pages.
- Root `package.json`: actual verification commands and offline ops stages.

No UI, comp measurement, browser, Next, React, Tailwind, SQL or Nest code changes
are involved. No skill specifically documents this framework-free Node CLI;
repository code, installed SDK types and local runtime probes provide API
authority. Security skill references have no standalone Node CLI guide.

## Behavior and compatibility contract

For each listing response, after existing response/Contents structure checks
and before processing entries or continuation tokens, validate `KeyCount` when
it is not `undefined`. Require a primitive nonnegative safe integer equal to
that page's `Contents.length`, or zero when `Contents` is absent. Explicit
`null`, numeric strings, fractions, unsafe numbers, infinities/NaN, negatives,
bigints, booleans, arrays, symbols and ordinary/boxed/coercible objects reject
without conversion. Zero (including numeric negative zero) is a valid empty
count. Count is per page, not cumulative across pages.

Reuse `Object storage listing is invalid or incomplete`; never reflect count,
key, prefix, token or provider error values. A malformed later page rejects
the whole listing without further pagination or partial return. Through `main`,
failure stays exit 1 with `Error: Object storage connection or listing failed`,
no formatted report, success message or receipt. Do not mutate caller responses.

Preserve omitted/undefined count compatibility because the installed SDK field
is optional and current adapters/stubs can omit it. Preserve existing valid
metadata/checksum conversion, empty pages, opaque token handling, pagination
cycles and duplicate-key rejection. Valid counted multi-page listings and
successful simulation receipt publication must remain supported.

No public signature/export/facade, CLI, SQL/schema, comparison/exclusion,
report/mode, receipt publication, dependency, Stage 7 caller or route changes.
No `MaxKeys`, Name/Prefix/Delimiter/response-echo validation, new checksum
retrieval/hashing, resource/network caps, hostile getters/proxies, live
services, online audit, deployment, push or launch approval. Counts validate
internal consistency, not authenticity, total completeness or snapshot integrity.

## Implementation steps and target files

1. Add behavior regressions in `scripts/ops/reconcile-storage-objects.spec.js`
   before source changes. Reproduce the contradictory empty terminal page and
   malformed supplied count classes. Include short and excess contents, positive
   count with omitted contents, zero with nonempty contents and frozen inputs.
2. In `scripts/ops/reconcile-storage-objects.js`, add a small guard directly
   after page structure validation, using `Number.isSafeInteger`, nonnegative
   comparison and strict equality with page entry count. Reuse the existing
   fixed listing error. No new helper/export is necessary.
3. Cover invalid first/truncated and later/terminal pages, no follow-up request
   after invalidity, whole-list rejection, and no coercion or input mutation.
4. Verify absent/undefined counts, zero with absent/empty contents, accurate
   positive counts, mixed counted/uncounted pages, per-page counts across several
   pages, frozen response ownership and existing size/date/checksum mapping.
5. Exercise `main` with stub S3 and injected DB inventories: first/later invalid
   page means fixed diagnostics, exit 1 and empty temporary evidence directory;
   accurate counted pages publish a valid simulation receipt. Stub all service
   interactions; never use real DB/storage credentials.
6. Retain every prior test. Keep source/test edits scoped and formatted with
   existing Prettier conventions; do not reformat the legacy full files.

## Verification, review, documentation and completion

Re-read this prompt and load every named skill again for execution. Run focused
red/green `npm run ops:reconcile-test`, JS syntax checks, CLI `--help`, selected
changed-region Prettier checks, `git diff --check`, root lint, typecheck and
build. Keep actual logs under `/tmp`; record any sandbox errors separately from
unchanged permitted retries. Run each independent offline `ops:check` stage,
inspect every result and count suite tests. Omit online `ops:audit` under the
documented metadata-disclosure restriction; do not claim aggregate `ops:check`
success or a fresh vulnerability inventory. Verify unresolved readiness stays
fail-closed without changing operator values.

Self-review the full diff and check results before dispatching one independent
read-only reviewer under `requesting-code-review`. Provide base/head `7401daf`
plus the working diff, this prompt, installed SDK count/delimiter semantics,
optional compatibility rules and actual results. Evaluate feedback using
`receiving-code-review`, fix valid findings and re-test; re-review significant
changes. Applicable AGENTS.md explicitly authorizes this reviewer subagent.

After review record implementation/probe, checks, compatibility limits and
ordinary commit-revert rollback in `docs/operations.md`. Add concise evidence
records to `docs/build-plan.md`, Category 6 of `docs/launch-checklist.md` and
`docs/security.md`. Prompt 201, live Category 6 and Phase 12 exit stay open.
Stage only this prompt, source/spec and those four docs; inspect staged diff and
commit locally to `main` using `caveman-commit`. Return the commit and safe local
inspection commands: `npm run ops:reconcile-test` and the utility's `--help`.

## SKILLS USED

- `architecture-patterns`: preserve the adapter/pure comparison boundary.
- `deployment-pipeline-design`: keep recovery evidence gates fail-closed.
- `error-handling-patterns`: whole-list rejection and sanitized runner failures.
- `secrets-management`: private provider values never cross diagnostics.
- `security-best-practices`: secure-by-default input validation discipline.
- `javascript-testing-patterns`: adapter/runner behavior and compatibility tests.
- `requesting-code-review`: independent review after self-verification.
- `receiving-code-review`: verify feedback against actual contracts before fixes.
- `caveman-commit`: required local Conventional Commit with security rationale.

Other full-phase skills remain conditional: no Nest/SQL/CI/telemetry/SAST/UI/
browser/architecture decision surface changes. Load its owner if scope grows.
