# Phase 12K — Validate storage listing continuation tokens

## Scope and why this is next

Continue the open Phase 12K recovery-evidence gate in `docs/build-plan.md`
§§13–14 after committed Prompt 318 (`2541445`). The worktree starts clean on
`main`. Code and git history confirm earlier reconciliation safeguards are
built. The reconciliation utility issues flat `ListObjectsV2Command` requests
starting from the beginning of the bucket key space (with `ContinuationToken: undefined`
on the first page), advancing across pages using `ContinuationToken: continuationToken`
(where `continuationToken` is set to the previous page's `NextContinuationToken`),
to match against all active `StoredObject` records.

S3 `ListObjectsV2Output` declares optional `ContinuationToken?: string | undefined`.
According to the Amazon S3 specification, `ContinuationToken` is only included in
the response if `ContinuationToken` was sent in the request, in which case it echoes
the token provided in the request. When `ContinuationToken` is absent from the request
(the initial page), Amazon S3 does not return `ContinuationToken` in the response.
While Prompts 314–318 hardened validation of `KeyCount`, `CommonPrefixes`, `Delimiter`,
`EncodingType`, and `StartAfter`, a local synthetic probe confirms that `listBucketObjects`
currently accepts an initial response declaring `ContinuationToken`:
`{ IsTruncated: false, ContinuationToken: 'page-2-token', Contents: [{ Key: 'data/file2.csv', Size: 10 }] }`
and extracts only the keys on that page (`data/file2.csv`). Reconciling that partial
storage listing against active database records containing `data/file1.csv` causes
`data/file1.csv` to be flagged as missing from storage (false positive critical data
loss / exit code 1).
Conversely, any unreferenced orphan objects in storage residing prior to that continuation
token are omitted from the storage map, masking real storage leaks (undetected orphans).
Furthermore, on subsequent pages when a continuation token is sent in the request,
if a provider or proxy returns a defined `ContinuationToken` that does not match the
requested token (e.g. out-of-order responses, cross-request token contamination, or
corrupted pagination metadata), accepting that mismatched response compromises pagination
synchronization and inventory completeness.

Therefore, `listBucketObjects` must validate `response.ContinuationToken`:
1. On the initial page (where `continuationToken` was not sent / is `undefined`), reject
   any defined `ContinuationToken` (`response.ContinuationToken !== undefined`).
2. On subsequent pages (where `continuationToken !== undefined`), if the provider includes
   `ContinuationToken` in the response, it must strictly match the requested token:
   reject any defined `ContinuationToken` where `response.ContinuationToken !== continuationToken`.
Omitted and `undefined` `ContinuationToken` on later pages remain accepted to preserve
compatibility with test mocks and providers that do not echo the request token.

## References and verified API authority

- `AGENTS.md`: phase-control commands, prompt discipline, checks, review,
  documentation updates and local commit workflow.
- `docs/build-plan.md` §§13–14 and committed Prompt 318 record.
- `docs/skills.md`: exact skill paths and phase manifests.
- `docs/operations.md`: Stage 7 recovery evidence and Prompts 305–318.
- `docs/launch-checklist.md` Category 6: independent live recovery still open.
- `docs/security.md`: existing inventory/diagnostic boundary and TM-19.
- `docs/system-architecture.md`: ports/adapters and DB/object authority.
- `docs/product.md`: product and role journeys; no scope changes.
- `scripts/ops/reconcile-storage-objects.js`, `.spec.js`, `.ts`: adapter,
  pagination, runner, test conventions and public contracts.
- `node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts`,
  `ListObjectsV2Output`: `ContinuationToken?: string | undefined;`
  describes the continuation token specified in the request. If `ContinuationToken`
  was not sent with the request, Amazon S3 does not return `ContinuationToken`
  in the response.
- Root `package.json`: verification scripts and offline operations stages.

No UI, comp measurement, browser, Next, React, Tailwind, SQL or Nest code changes
are involved. No skill specifically documents this framework-free Node CLI;
repository code, installed SDK types and local runtime probes provide API
authority. Security skill references have no standalone Node CLI guide.

## Behavior and compatibility contract

For each listing response, directly alongside page structure, `KeyCount`,
`CommonPrefixes`, `Delimiter`, `EncodingType`, and `StartAfter` checks, validate
`ContinuationToken`:

1. When `response.ContinuationToken` is `undefined` (omitted or explicitly undefined),
   accept it without error. This preserves initial page responses where no continuation
   token was sent, as well as multi-page listings where providers or test mocks omit
   the echo property.
2. When `response.ContinuationToken` is defined (i.e. `response.ContinuationToken !== undefined`):
   - If `continuationToken === undefined` (initial page): reject any defined value,
     including valid token strings (`'token-1'`, `'page-token'`), arbitrary strings,
     empty string `''`, whitespace `'   '`, `null`, numbers, booleans, bigints,
     symbols, and plain/boxed/coercible objects without conversion.
   - If `continuationToken !== undefined` (subsequent page): require exact strict equality
     `response.ContinuationToken === continuationToken`. Reject any mismatched token string,
     empty string, whitespace, `null`, numbers, booleans, bigints, symbols, or objects.
   - Any defined token that does not match the requested `continuationToken` indicates
     that keys were skipped, the response is out-of-order, or the provider returned
     desynchronized pagination metadata.
3. Reject invalid or mismatched `ContinuationToken` with the existing fixed error:
   `Object storage listing is invalid or incomplete`. Never reflect token strings,
   keys, or provider values in error messages.
4. An invalid first or later page rejects the whole listing immediately without
   further pagination or partial return. Through `main`, failure produces
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
deployment, push or launch approval. Continuation token validation checks pagination
synchronization and origin alignment, not authenticity or atomic snapshot consistency.

## Implementation steps and target files

1. Add behavior regressions in `scripts/ops/reconcile-storage-objects.spec.js`
   before source changes:
   - Initial page defined `ContinuationToken` values: `'token-1'`, `'page-2-token'`,
     empty string `''`, whitespace `'   '`.
   - Initial page invalid `ContinuationToken` types without coercion: `null`, `42`, `0`,
     `true`, `false`, `1n`, `Symbol('token')`, `{}`, boxed string `new String('token')`,
     and coercible object `{ valueOf() { throw new Error(...) } }`.
   - Later page mismatched `ContinuationToken` values: `'token-mismatch'`, empty string `''`,
     `null`, `42`, `true`, `{}` when request sent `'token-A'`.
   - Later page halting: verify a mismatched `ContinuationToken` on page 2 rejects the
     whole listing immediately and halts pagination without making a third request.
   - Valid matching `ContinuationToken` on later pages: verify page 2 returning
     `ContinuationToken: 'token-A'` when request sent `'token-A'` is accepted.
   - Valid omitted/undefined `ContinuationToken`: page 1 and page 2 with undefined/omitted
     `ContinuationToken` across empty and populated contents.
   - Programmatic `main` runner: verify initial defined token and later mismatched token
     exit 1 with sanitized error, empty evidence directory, and no published receipt;
     multi-page listing with matching `ContinuationToken` publishes a clean simulation receipt.
2. In `scripts/ops/reconcile-storage-objects.js`:
   - In `listBucketObjects`, directly alongside `StartAfter` validation, add the guard:
     ```javascript
     if (
       response.ContinuationToken !== undefined &&
       response.ContinuationToken !== continuationToken
     )
       throw invalidListing();
     ```
3. Verify that all 721 existing tests pass alongside the new regressions.
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
read-only reviewer under `requesting-code-review`. Provide base `2541445`,
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
