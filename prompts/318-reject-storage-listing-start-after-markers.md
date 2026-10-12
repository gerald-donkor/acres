# Phase 12K — Reject storage listing start-after markers

## Scope and why this is next

Continue the open Phase 12K recovery-evidence gate in `docs/build-plan.md`
§§13–14 after committed Prompt 317 (`407604a`). The worktree starts clean on
`main`. Code and git history confirm earlier reconciliation safeguards are
built. The reconciliation utility issues flat `ListObjectsV2Command` requests
without `StartAfter`, expecting complete object keys across the entire bucket
(or prefix) starting from the beginning of the bucket key space, to match
against all active `StoredObject` records.

S3 `ListObjectsV2Output` declares optional `StartAfter?: string | undefined`.
According to the Amazon S3 specification, `StartAfter` is only returned in the
response when `start-after` was specified in the request. When present, Amazon S3
starts listing keys strictly after `StartAfter`, omitting all objects that
appear lexicographically before or equal to `StartAfter`. While Prompts 314–317
hardened validation of `KeyCount`, `CommonPrefixes`, `Delimiter`, and
`EncodingType`, a local synthetic probe confirms that `listBucketObjects`
accepts a response declaring `StartAfter`:
`{ IsTruncated: false, StartAfter: 'data/file1.csv', Contents: [{ Key: 'data/file2.csv', Size: 10 }] }`
and extracts only the keys following `StartAfter` (`data/file2.csv`). Reconciling
that partial storage listing against active database records containing
`data/file1.csv` causes `data/file1.csv` to be flagged as missing from storage
(false positive critical data loss / exit code 1).
Conversely, any unreferenced orphan objects in storage residing lexicographically
before or at `StartAfter` are omitted from the storage map, masking real storage
leaks (undetected orphans). Even when `Contents` is empty or omitted, accepting
a response with a defined `StartAfter` accepts offset/partitioned provider
metadata without validation.

Moreover, because `listBucketObjects` never requests offset listings using
`StartAfter`, receiving any defined `StartAfter` in a response indicates that
either keys were skipped or the provider/proxy returned unexpected
pagination/filter metadata. Reject any defined `StartAfter` before the adapter
can return partial, offset, or misleading inventory evidence.

## References and verified API authority

- `AGENTS.md`: phase-control commands, prompt discipline, checks, review,
  documentation updates and local commit workflow.
- `docs/build-plan.md` §§13–14 and committed Prompt 317 record.
- `docs/skills.md`: exact skill paths and phase manifests.
- `docs/operations.md`: Stage 7 recovery evidence and Prompts 305–317.
- `docs/launch-checklist.md` Category 6: independent live recovery still open.
- `docs/security.md`: existing inventory/diagnostic boundary and TM-19.
- `docs/system-architecture.md`: ports/adapters and DB/object authority.
- `docs/product.md`: product and role journeys; no scope changes.
- `scripts/ops/reconcile-storage-objects.js`, `.spec.js`, `.ts`: adapter,
  pagination, runner, test conventions and public contracts.
- `node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts`,
  `ListObjectsV2Output`: `StartAfter?: string | undefined;`
  describes the key to start after. If `StartAfter` is not specified in the
  request, Amazon S3 does not return `StartAfter` in the response.
- Root `package.json`: verification scripts and offline operations stages.

No UI, comp measurement, browser, Next, React, Tailwind, SQL or Nest code changes
are involved. No skill specifically documents this framework-free Node CLI;
repository code, installed SDK types and local runtime probes provide API
authority. Security skill references have no standalone Node CLI guide.

## Behavior and compatibility contract

For each listing response, directly alongside page structure, `KeyCount`,
`CommonPrefixes`, `Delimiter`, and `EncodingType` checks, validate `StartAfter`:

1. When `StartAfter` is `undefined` (omitted or explicitly undefined), accept it
   without error. This preserves standard AWS S3 flat listing responses where no
   start-after key is requested and the provider returns no `<StartAfter>` element.
2. When `StartAfter` is defined (i.e. `response.StartAfter !== undefined`):
   - Reject any value, including valid S3 key strings (`'data/file1.csv'`,
     `'prefix/marker'`, `'a'`), arbitrary strings (`'start'`, `'key'`), empty
     string `''`, whitespace `'   '`, `null`, numbers, booleans, bigints,
     symbols, and plain/boxed/coercible objects without conversion.
   - Any defined `StartAfter` indicates that keys were skipped or that the
     response contains unexpected offset metadata, violating flat listing
     completeness and unpartitioned whole-bucket coverage.
3. Reject any defined `StartAfter` with the existing fixed error:
   `Object storage listing is invalid or incomplete`. Never reflect start-after
   strings, keys, tokens, or provider values in error messages.
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
deployment, push or launch approval. Start-after validation checks flat listing
completeness and origin alignment, not authenticity or atomic snapshot consistency.

## Implementation steps and target files

1. Add behavior regressions in `scripts/ops/reconcile-storage-objects.spec.js`
   before source changes:
   - Defined `StartAfter` string values: `'data/marker.csv'`, `'start-key'`,
     empty string `''`, whitespace `'   '`.
   - Invalid `StartAfter` types without coercion: `null`, `42`, `0`, `true`,
     `false`, `1n`, `Symbol('startAfter')`, `{}`, boxed string `new String('marker')`,
     and coercible object `{ valueOf() { throw new Error(...) } }`.
   - First and later page failures: ensure a second page with a defined `StartAfter`
     rejects the whole listing immediately and halts pagination without additional
     requests.
   - Valid flat listing pages: omitted/undefined `StartAfter` (both frozen and mutable),
     with and without `Contents`, `KeyCount`, `CommonPrefixes`, `Delimiter`, and
     `EncodingType`.
   - Programmatic `main` runner: verify invalid first and later start-after markers exit 1
     with sanitized error, empty evidence directory, and no published receipt;
     valid flat pages publish a clean simulation receipt.
2. In `scripts/ops/reconcile-storage-objects.js`:
   - In `listBucketObjects`, directly alongside `EncodingType` validation, add a guard:
     ```javascript
     if (response.StartAfter !== undefined) throw invalidListing();
     ```
3. Verify that all 684 existing tests pass alongside the new regressions.
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
read-only reviewer under `requesting-code-review`. Provide base `407604a`,
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
