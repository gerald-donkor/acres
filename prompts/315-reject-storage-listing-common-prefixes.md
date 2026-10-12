# Phase 12K — Reject storage listing common prefixes

## Scope and why this is next

Continue the open Phase 12K recovery-evidence gate in `docs/build-plan.md`
§§13–14 after committed Prompt 314 (`651c1c9`). The worktree starts clean on
`main`. Code and git history confirm earlier reconciliation safeguards are
built. The reconciliation utility issues flat `ListObjectsV2Command` requests
without a delimiter, expecting complete object keys in `Contents`.

A local synthetic probe confirms that `listBucketObjects` accepts
`{ IsTruncated: false, CommonPrefixes: [{ Prefix: 'sub/' }] }` and returns an
empty list (`[]`). Reconciling that result against an empty database returns
`status: 'clean'`, `exitCode: 0`. Reconciling against active database records
flags objects under that prefix as missing from storage (false positive data
loss), while orphan objects under that prefix are omitted from the storage map
(silent storage leaks). Reject grouped or malformed `CommonPrefixes` before the
adapter can return partial or misleading inventory evidence.

The user said “after you are done writing the prompt, just implement.” That approves
immediate execution after writing and re-reading this prompt; no further approval
question is needed.

## References and verified API authority

- `AGENTS.md`: phase-control commands, prompt discipline, checks, review,
  documentation updates and local commit workflow.
- `docs/build-plan.md` §§13–14 and committed Prompt 314 record.
- `docs/skills.md`: exact skill paths and phase manifests.
- `docs/operations.md`: Stage 7 recovery evidence and Prompts 305–314.
- `docs/launch-checklist.md` Category 6: independent live recovery still open.
- `docs/security.md`: existing inventory/diagnostic boundary and TM-19.
- `docs/system-architecture.md`: ports/adapters and DB/object authority.
- `docs/product.md`: product and role journeys; no scope changes.
- `scripts/ops/reconcile-storage-objects.js`, `.spec.js`, `.ts`: adapter,
  pagination, runner, test conventions and public contracts.
- `node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts`,
  `ListObjectsV2Output`: `CommonPrefixes?: CommonPrefix[] | undefined;`
  describes rolled-up key groups when a delimiter is specified.
  `CommonPrefix` is `{ Prefix?: string | undefined }`. Keys grouped under
  common prefixes are not returned elsewhere in the response.
- Root `package.json`: verification scripts and offline operations stages.

No UI, comp measurement, browser, Next, React, Tailwind, SQL or Nest code changes
are involved. No skill specifically documents this framework-free Node CLI;
repository code, installed SDK types and local runtime probes provide API
authority. Security skill references have no standalone Node CLI guide.

## Behavior and compatibility contract

For each listing response, directly alongside page structure and `KeyCount`
checks, validate `CommonPrefixes` when it is not `undefined`:

1. When `CommonPrefixes` is `undefined` (omitted), accept it without error.
   This preserves standard AWS S3 flat listing responses where no delimiter is
   specified and the provider returns no `<CommonPrefixes>` element.
2. When `CommonPrefixes` is defined:
   - Require a strict array. Explicit `null`, strings, numbers, booleans,
     bigints, symbols, and plain/boxed/coercible objects reject without conversion.
   - Require `length === 0` (empty array `[]`). Any non-empty `CommonPrefixes`
     array indicates that keys were partitioned and rolled up into prefixes,
     violating flat listing completeness and omitting objects from `Contents`.
3. Reject any non-array or non-empty `CommonPrefixes` with the existing fixed error:
   `Object storage listing is invalid or incomplete`. Never reflect prefix strings,
   keys, tokens or provider values in error messages.
4. An invalid first or later page rejects the whole listing immediately without
   further pagination or partial return. Through `main`, failure produces
   `exitCode: 1` with sanitized diagnostic `Error: Object storage connection or listing failed`,
   no stdout summary, and no published evidence receipt.
5. Preserve caller response ownership; do not mutate frozen or plain responses.
6. Preserve omitted/undefined counts, per-page counts, opaque continuation tokens,
   cycle rejection, unique key rejection, size/checksum/date conversion, receipt
   publication, CLI flags, and Stage 7 caller behavior.

Non-goals:
No recursive prefix traversal or delimiter querying (Acres reconciliation requires
a flat key inventory). No public signature/export/facade, CLI flag, SQL/schema,
comparison policy, report schema/mode, receipt publication, dependency, or
Stage 7 caller changes. No `MaxKeys`, `Name`, `Prefix` response-echo checks,
content hashing, resource/network caps, hostile getters/proxies, live services,
deployment, push or launch approval. Common prefixes validation checks flat
listing completeness, not authenticity or atomic snapshot consistency.

## Implementation steps and target files

1. Add behavior regressions in `scripts/ops/reconcile-storage-objects.spec.js`
   before source changes:
   - Invalid `CommonPrefixes` types: `null`, `'prefix/'`, `42`, `true`, `1n`,
     `{}`, `Symbol()`, and coercible objects.
   - Non-empty `CommonPrefixes` arrays: single prefix `[{ Prefix: 'sub/' }]`,
     multiple prefixes, empty prefix string `[{ Prefix: '' }]`, objects with
     empty contents, and frozen response structures.
   - First and later page failures: ensure a second page with non-empty or
     malformed `CommonPrefixes` rejects the whole listing immediately and halts
     pagination without additional requests.
   - Valid flat listing pages: omitted/undefined `CommonPrefixes`, empty array
     `[]` (both frozen and mutable), with and without `Contents` and `KeyCount`.
   - Programmatic `main` runner: verify invalid first/later common prefixes exit
     1 with sanitized error, empty evidence directory, and no published receipt;
     valid flat pages publish a clean simulation receipt.
2. In `scripts/ops/reconcile-storage-objects.js`:
   - In `listBucketObjects`, directly after `KeyCount` validation, add a guard:
     ```javascript
     if (
       response.CommonPrefixes !== undefined &&
       (!Array.isArray(response.CommonPrefixes) ||
         response.CommonPrefixes.length > 0)
     )
       throw invalidListing();
     ```
3. Verify that all 574 existing tests pass alongside the new regressions.
4. Keep edits scoped and formatted to existing Prettier conventions without
   reformatting unrelated legacy regions.

## Verification, review, documentation and completion

Re-read this prompt and load all named skills again for execution. Run:
- Focused red/green `npm run ops:reconcile-test`
- JS syntax checks on both modified files
- CLI `--help`
- Changed-region Prettier formatting checks
- `git diff --check`
- Root `npm run lint`
- Root `npm run typecheck`
- Permitted `npm run build`
- All 33 independent offline operations stages, inspecting every result.
  Omit online `ops:audit` under the documented metadata-disclosure restriction;
  do not claim aggregate `ops:check` success or a fresh vulnerability inventory.
- Verify unresolved readiness stays fail-closed without changing operator values.

Self-review the full diff and check results before dispatching one independent
read-only reviewer under `requesting-code-review`. Provide base `651c1c9`,
the working diff, this prompt, installed SDK types, compatibility rules, and
actual check results. Evaluate feedback using `receiving-code-review`, fix valid
findings and re-test.

After review, record implementation, probes, checks, compatibility limits and
ordinary commit-revert rollback in `docs/operations.md`. Add concise evidence
records to `docs/build-plan.md`, Category 6 of `docs/launch-checklist.md`, and
`docs/security.md`. Prompt 201, live Category 6 and Phase 12 exit stay open.
Stage only this prompt, source/spec, and those four docs; inspect staged diff and
commit locally to `main` using `caveman-commit`. Return the commit and safe local
inspection commands.

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
