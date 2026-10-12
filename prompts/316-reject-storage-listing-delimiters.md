# Phase 12K — Reject storage listing delimiters

## Scope and why this is next

Continue the open Phase 12K recovery-evidence gate in `docs/build-plan.md`
§§13–14 after committed Prompt 315 (`2099def`). The worktree starts clean on
`main`. Code and git history confirm earlier reconciliation safeguards are
built. The reconciliation utility issues flat `ListObjectsV2Command` requests
without a delimiter, expecting complete object keys in `Contents` across the
entire bucket to match against all active `StoredObject` records.

S3 `ListObjectsV2Output` declares optional `Delimiter?: string | undefined`.
According to the Amazon S3 specification, a delimiter is only returned in the
response when a delimiter was specified in the request, and its presence causes
keys containing that delimiter to be rolled up into `CommonPrefixes` rather than
returned in `Contents`. While Prompt 315 hardened validation of `CommonPrefixes`,
a local synthetic probe confirms that `listBucketObjects` accepts a response
declaring a delimiter (e.g., `{ IsTruncated: false, Delimiter: '/' }`) when
`CommonPrefixes` is empty or omitted on that page (for example, on a page that
contains only root keys, or from an unexpected provider/proxy response). In such
a scenario, reconciling that partial storage listing against a database with
subpath objects flags those objects as missing from storage (false positive data
loss / critical error exit 1), while orphan objects in subpaths would be omitted
from the storage map (silent storage leaks).

Moreover, because `listBucketObjects` never issues delimited queries, receiving
any defined `Delimiter` in a response indicates that either keys were partitioned
or the provider returned unexpected hierarchical metadata. Reject any defined
`Delimiter` before the adapter can return partial or misleading inventory evidence.

## References and verified API authority

- `AGENTS.md`: phase-control commands, prompt discipline, checks, review,
  documentation updates and local commit workflow.
- `docs/build-plan.md` §§13–14 and committed Prompt 315 record.
- `docs/skills.md`: exact skill paths and phase manifests.
- `docs/operations.md`: Stage 7 recovery evidence and Prompts 305–315.
- `docs/launch-checklist.md` Category 6: independent live recovery still open.
- `docs/security.md`: existing inventory/diagnostic boundary and TM-19.
- `docs/system-architecture.md`: ports/adapters and DB/object authority.
- `docs/product.md`: product and role journeys; no scope changes.
- `scripts/ops/reconcile-storage-objects.js`, `.spec.js`, `.ts`: adapter,
  pagination, runner, test conventions and public contracts.
- `node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts`,
  `ListObjectsV2Output`: `Delimiter?: string | undefined;`
  describes the character used to group keys into `CommonPrefixes`.
  If a delimiter is not specified in the request, Amazon S3 does not return the
  `Delimiter` element in the response.
- Root `package.json`: verification scripts and offline operations stages.

No UI, comp measurement, browser, Next, React, Tailwind, SQL or Nest code changes
are involved. No skill specifically documents this framework-free Node CLI;
repository code, installed SDK types and local runtime probes provide API
authority. Security skill references have no standalone Node CLI guide.

## Behavior and compatibility contract

For each listing response, directly alongside page structure, `KeyCount`, and
`CommonPrefixes` checks, validate `Delimiter`:

1. When `Delimiter` is `undefined` (omitted or explicitly undefined), accept it
   without error. This preserves standard AWS S3 flat listing responses where no
   delimiter is specified and the provider returns no `<Delimiter>` element.
2. When `Delimiter` is defined (i.e. `response.Delimiter !== undefined`):
   - Reject any value, including non-empty strings (e.g. `'/'`, `'\\'`, `'.'`),
     empty string `''`, `null`, numbers, booleans, bigints, symbols, and
     plain/boxed/coercible objects without conversion.
   - Any defined `Delimiter` indicates that keys were partitioned or that the
     response is hierarchical rather than flat, violating flat listing completeness.
3. Reject any defined `Delimiter` with the existing fixed error:
   `Object storage listing is invalid or incomplete`. Never reflect delimiter
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
No recursive prefix traversal or delimiter querying (Acres reconciliation requires
a flat key inventory across the entire bucket). No public signature/export/facade,
CLI flag, SQL/schema, comparison policy, report schema/mode, receipt publication,
dependency, or Stage 7 caller changes. No `MaxKeys`, `Name`, `Prefix` response-echo
checks, content hashing, resource/network caps, hostile getters/proxies, live services,
deployment, push or launch approval. Delimiter validation checks flat listing
completeness, not authenticity or atomic snapshot consistency.

## Implementation steps and target files

1. Add behavior regressions in `scripts/ops/reconcile-storage-objects.spec.js`
   before source changes:
   - Defined `Delimiter` string values: `'/'`, `'\\'`, `'.'`, `'|'`, empty string
     `''`, whitespace `'   '`.
   - Invalid `Delimiter` types without coercion: `null`, `42`, `0`, `true`,
     `false`, `1n`, `Symbol('delimiter')`, `{}`, boxed string `new String('/')`,
     and coercible object `{ valueOf() { throw new Error(...) } }`.
   - First and later page failures: ensure a second page with a defined `Delimiter`
     rejects the whole listing immediately and halts pagination without additional
     requests.
   - Valid flat listing pages: omitted/undefined `Delimiter` (both frozen and mutable),
     with and without `Contents`, `KeyCount`, and `CommonPrefixes`.
   - Programmatic `main` runner: verify invalid first and later delimiters exit 1
     with sanitized error, empty evidence directory, and no published receipt;
     valid flat pages publish a clean simulation receipt.
2. In `scripts/ops/reconcile-storage-objects.js`:
   - In `listBucketObjects`, directly alongside `CommonPrefixes` validation, add a guard:
     ```javascript
     if (response.Delimiter !== undefined)
       throw invalidListing();
     ```
3. Verify that all 610 existing tests pass alongside the new regressions.
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
read-only reviewer under `requesting-code-review`. Provide base `2099def`,
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
