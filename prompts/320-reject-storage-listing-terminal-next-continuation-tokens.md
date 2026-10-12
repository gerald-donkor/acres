# Phase 12K — Reject storage listing terminal next continuation tokens

## Scope and why this is next

Continue the open Phase 12K recovery-evidence gate in `docs/build-plan.md`
§§13–14 after committed Prompt 319 (`28ad91c`). The worktree starts clean on
`main`. Code and git history confirm earlier reconciliation safeguards are
built. The reconciliation utility issues flat `ListObjectsV2Command` requests
starting from the beginning of the bucket key space (with `ContinuationToken: undefined`
on the first page), advancing across pages using `ContinuationToken: continuationToken`
(where `continuationToken` is set to the previous page's `NextContinuationToken`),
to match against all active `StoredObject` records.

In the Amazon S3 specification (`node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts`),
`NextContinuationToken?: string | undefined` is sent when `IsTruncated` is `true`,
which means there are more keys in the bucket that can be listed. If `IsTruncated`
is `false`, all results have been returned, the listing is terminal, and Amazon S3
does not return `NextContinuationToken`.

In `scripts/ops/reconcile-storage-objects.js`, `listBucketObjects` currently breaks
the pagination loop immediately whenever `!response.IsTruncated`:
```javascript
if (!response.IsTruncated) break;
const next = response.NextContinuationToken;
if (typeof next !== 'string' || !next.trim() || seenTokens.has(next))
  throw invalidListing();
```
and only validates `response.NextContinuationToken` when `response.IsTruncated` is
`true`. When `response.IsTruncated` is `false`, `listBucketObjects` breaks immediately
without inspecting `response.NextContinuationToken`.

A local synthetic probe confirms that `listBucketObjects` currently accepts a
terminal response declaring a defined `NextContinuationToken`:
`{ IsTruncated: false, NextContinuationToken: 'rogue-token', Contents: [{ Key: 'data/file1.csv', Size: 10 }] }`
as well as a multi-page sequence where the final terminal page returns `IsTruncated: false`
alongside a defined `NextContinuationToken`.

Accepting defined `NextContinuationToken` values on terminal pages is hazardous:
1. Contradictory pagination metadata: claiming that a listing is complete (`IsTruncated: false`)
   while simultaneously providing a token to continue pagination (`NextContinuationToken`)
   is contradictory and indicates provider, gateway, or mock corruption.
2. Premature truncation and false-positive data loss: if a buggy S3 proxy, gateway,
   or mock returns `IsTruncated: false` by mistake while supplying a continuation token
   for remaining bucket contents, `listBucketObjects` assumes the listing has finished
   and halts iteration. All subsequent objects in the bucket are silently omitted from
   the inventory. Active database `StoredObject` records matching those omitted objects
   will be reported as missing from storage (false positive critical data loss / exit code 1).
3. Concealed storage leaks: any unreferenced orphan objects on subsequent pages are omitted
   from the storage map, masking real storage leaks (undetected orphans).
4. Evidence corruption: any reconciliation receipt emitted from contradictory pagination
   metadata is compromised and cannot serve as reliable recovery evidence.

Therefore, `listBucketObjects` must validate `response.NextContinuationToken` on terminal
pages: whenever `response.IsTruncated === false`, reject any defined `NextContinuationToken`
(`response.NextContinuationToken !== undefined`).

## References and verified API authority

- `AGENTS.md`: phase-control commands, prompt discipline, checks, review,
  documentation updates and local commit workflow.
- `docs/build-plan.md` §§13–14 and committed Prompt 319 record.
- `docs/skills.md`: exact skill paths and phase manifests.
- `docs/operations.md`: Stage 7 recovery evidence and Prompts 305–319.
- `docs/launch-checklist.md` Category 6: independent live recovery still open.
- `docs/security.md`: existing inventory/diagnostic boundary and TM-19.
- `docs/system-architecture.md`: ports/adapters and DB/object authority.
- `docs/product.md`: product and role journeys; no scope changes.
- `scripts/ops/reconcile-storage-objects.js`, `.spec.js`, `.ts`: adapter,
  pagination, runner, test conventions and public contracts.
- `node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts`,
  `ListObjectsV2Output`: `NextContinuationToken?: string | undefined;`
  sent when `isTruncated` is true, indicating more keys can be listed. If
  `isTruncated` is false, Amazon S3 does not return `NextContinuationToken`.
- Root `package.json`: verification scripts and offline operations stages.

No UI, comp measurement, browser, Next, React, Tailwind, SQL or Nest code changes
are involved. No skill specifically documents this framework-free Node CLI;
repository code, installed SDK types and local runtime probes provide API
authority. Security skill references have no standalone Node CLI guide.

## Behavior and compatibility contract

For each listing response, directly alongside page structure, `KeyCount`,
`CommonPrefixes`, `Delimiter`, `EncodingType`, `StartAfter`, and `ContinuationToken`
checks, validate `NextContinuationToken`:

1. When `response.IsTruncated === false` (terminal page):
   - When `response.NextContinuationToken` is `undefined` (omitted or explicitly undefined),
     accept it without error. This preserves valid terminal pages where all keys have been returned.
   - When `response.NextContinuationToken` is defined (`response.NextContinuationToken !== undefined`):
     reject any defined value, including valid token strings (`'token-1'`, `'page-2-token'`),
     arbitrary strings, empty string `''`, whitespace `'   '`, `null`, numbers (`42`, `0`),
     booleans (`true`, `false`), bigints (`1n`), symbols (`Symbol('token')`), plain objects (`{}`),
     boxed strings (`new String('token')`), and coercible objects (`{ valueOf() { throw ... } }`)
     without conversion or coercion.
2. When `response.IsTruncated === true` (truncated intermediate page):
   - Preserve existing strict validation: `NextContinuationToken` must be a non-empty string,
     non-whitespace, and not previously seen in `seenTokens`.
3. Reject invalid terminal `NextContinuationToken` with the existing fixed error:
   `Object storage listing is invalid or incomplete`. Never reflect token strings,
   keys, or provider values in error messages.
4. An invalid initial terminal page or later terminal page rejects the whole listing
   immediately without further pagination or partial return. Through `main`, failure produces
   `exitCode: 1` with sanitized diagnostic `Error: Object storage connection or listing failed`,
   no stdout summary, and no published evidence receipt.
5. Preserve caller response ownership; do not mutate frozen or plain responses.
6. Preserve omitted/undefined counts, per-page counts, opaque continuation tokens,
   cycle rejection, unique key rejection, size/checksum/date conversion, receipt
   publication, CLI flags, and Stage 7 caller behavior.

Non-goals:
No client-side key filtering or offset manipulation. No public signature/export/facade,
CLI flag, SQL/schema, comparison policy, report schema/mode, receipt publication,
dependency, or Stage 7 caller changes. No `MaxKeys`, `Name`, `Prefix` response-echo
checks, content hashing, resource/network caps, hostile getters/proxies, live services,
deployment, push or launch approval. Terminal next continuation token validation checks
terminal pagination integrity and eliminates contradictory EOF metadata, not authenticity
or atomic snapshot consistency.

## Implementation steps and target files

1. Add behavior regressions in `scripts/ops/reconcile-storage-objects.spec.js`
   before source changes:
   - Initial terminal page (`IsTruncated: false`) defined `NextContinuationToken` values:
     `'token-1'`, `'page-2-token'`, empty string `''`, whitespace `'   '`.
   - Initial terminal page invalid `NextContinuationToken` types without coercion: `null`,
     `42`, `0`, `true`, `false`, `1n`, `Symbol('token')`, `{}`, boxed string `new String('token')`,
     and coercible object `{ valueOf() { throw new Error(...) } }`.
   - Later terminal page (`IsTruncated: false`) defined `NextContinuationToken` values:
     verify page 2 returning `IsTruncated: false` with defined `NextContinuationToken: 'token-B'`
     (or empty string, null, boolean, numeric, plain object) rejects the whole listing immediately.
   - Later terminal page halting: verify defined `NextContinuationToken` on terminal page 2
     halts immediately without partial return.
   - Valid omitted/undefined `NextContinuationToken` on terminal pages: page 1 and page 2
     with undefined/omitted `NextContinuationToken` across absent, empty, and populated contents.
   - Programmatic `main` runner: verify initial terminal defined `NextContinuationToken` and
     later terminal defined `NextContinuationToken` exit 1 with sanitized error, empty evidence
     directory, and no published receipt; valid multi-page listing with truncated page 1 and
     clean terminal page 2 publishes a clean simulation receipt.
2. In `scripts/ops/reconcile-storage-objects.js`:
   - In `listBucketObjects`, directly validate terminal `NextContinuationToken`:
     ```javascript
     // Terminal pages have no remaining keys; any provider next continuation token is contradictory.
     if (!response.IsTruncated && response.NextContinuationToken !== undefined)
       throw invalidListing();
     ```
3. Verify that all 751 existing tests pass alongside the new regressions.
4. Keep edits scoped and formatted to existing Prettier conventions without
   reformatting unrelated legacy regions.

## Verification, review, documentation and completion

Re-read this prompt and load all named skills again for execution. Run:
- Focused red/green `npm run ops:reconcile-test`
- JS syntax checks on both modified files (`node -c`)
- CLI `--help`
- Changed-region Prettier formatting checks
- `git diff --check`
- Root `npm run lint`
- Root `npm run typecheck`
- Permitted `npm run build`
- All 33 independent offline operations stages, inspecting every result.
  Omit online `ops:audit` under the documented metadata-disclosure restriction;
  do not claim aggregate `ops:check` success or a fresh vulnerability inventory.
- Verify unresolved readiness stays fail-closed without changing operator values:
  `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`

Self-review the full diff and check results before dispatching one independent
read-only reviewer under `requesting-code-review`. Provide base `28ad91c`,
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
