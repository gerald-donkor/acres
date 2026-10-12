# Phase 12K — Enforce storage listing key prefixes

## Scope, sequence and authorization

Continue Phase 12K's recovery-evidence gate in `docs/build-plan.md` §§13–14
after committed Prompt 322 (`06134e951c687691bf8b7528d97c1f5b0d444601`).
The worktree began clean on `main`. Existing prefix-echo validation does not
validate the returned keys themselves. A read-only synthetic probe requested
`scope/`, received a matching `Prefix: 'scope/'` with one `outside/` key, and
reported `{"acceptedObjects":1,"status":"clean","totalBucketObjects":0,"exitCode":0}`.
The downstream comparison discarded the contradictory entry through its valid
scope filter. Reject contradictory provider inventories at acquisition instead.

The user requested high effort and explicitly instructed execution after the
plan is finished. Write and re-read this prompt, then execute without another
approval question. The user also authorized exactly one additional prompt
after this prompt's implementation and local commit; select that scope from
fresh committed-state inspection at that point.

## References read and verified authority

- `AGENTS.md`: phase control, prompt/review/commit contract and standing rules.
- `docs/build-plan.md`: Phase 12, sequence gates and Prompt 322 evidence.
- `docs/skills.md`: local skill convention and conditional surface triggers.
- `docs/operations.md`: recovery/reconciliation runbook and Prompts 321–322.
- `docs/launch-checklist.md`: Category 6 and continuing live approval gates.
- `docs/security.md`: compromised-service threat, TM-19 and listing boundary.
- `docs/system-architecture.md`: ports/adapters, PostgreSQL authority and §11.3.
- `docs/product.md`: product job, organization ownership and source evidence.
- `scripts/ops/reconcile-storage-objects.js`, `.spec.js`, `.ts` and root
  `package.json`: actual adapter, comparison filter, runner and existing scripts.
- Installed `node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts`:
  ListObjectsV2Request Prefix limits responses to keys beginning with the
  specified prefix; ListObjectsV2Output documents the same semantics.

No UI, visual reference, geometry, Next/React/Tailwind/Nest API, SQL or schema
changes are involved. No skill covers standalone Node CLI APIs specifically;
local source, installed SDK declarations and bounded Node probes supply that
authority. The security skill has no standalone Node CLI reference. Phase 12's
Nest, GitHub Actions, telemetry, Grafana, scanner, browser and full E2E skills
do not apply to this narrow adapter correction; load them only if scope changes,
which itself requires a new explicit decision. No new trust boundary is added.

## Required behavior and compatibility

1. On every listed entry, after proving `Key` is a nonempty primitive string,
   require that it begins with the effective requested prefix when a nonempty
   prefix was requested. Validate before checksum conversion or inclusion in
   the accumulated inventory. Use literal string-prefix semantics.
2. Omitted/undefined/empty request prefixes retain existing bucket-wide
   behavior. Existing valid string prefixes remain opaque: no trimming, case
   folding, URI decoding, slash insertion, path resolution, regex matching,
   Unicode normalization or directory-boundary requirement. A key equal to
   the prefix is valid; `scope` also matches `scoped` under S3 semantics.
3. A matching, absent or undefined response `Prefix` does not excuse an
   out-of-scope key. Existing echo validation remains intact.
4. An invalid key anywhere on a first or later page rejects the whole
   inventory with fixed `Object storage listing is invalid or incomplete`.
   No partial array is returned and no subsequent request is sent, even when
   the bad page advertises another token. Earlier valid keys do not soften
   rejection; exclude/ignore filters cannot bypass acquisition validation.
5. The runner returns 1, prints only its connection log and fixed
   `Error: Object storage connection or listing failed`, and publishes no
   summary, receipt or temporary output for such failures. Diagnostics must
   not include keys, prefixes, tokens or private provider values.
6. Preserve frozen/caller-owned responses, order, numeric sizes, optional dates,
   checksum conversion, pagination input shape, empty intermediate pages and
   explicit EOF. Do not infer total completeness or provider honesty.

Non-goals: request argument redesign/validation, bucket Name echoes, comparison
filters or injected already-acquired inventories, CLI/public signatures/facade,
SQL/schema, checksums/byte hashing, receipt format/publication, Stage 7, fixed
resource limits, hostile getters/proxies, dependency changes, live services,
deployment, push or launch approval. Routes and customer behavior do not change.

## Target files and implementation steps

1. Re-read the prompt and reload every listed skill before edits. Inspect the
   existing `listingClient`, `createIo` and `inventoryDbRecord` helpers again.
2. Add focused behavioral tests to `scripts/ops/reconcile-storage-objects.spec.js`.
   Cover out-of-prefix keys on first/later pages, mixed valid/invalid contents,
   omitted/undefined/matching response echoes and pagination stopping. Include
   case differences, missing slash, embedded-but-not-leading scope and encoded
   lookalikes as explicit literal-prefix mismatches. Keep request fakes bounded.
3. Add positive tests for omitted/undefined/empty request prefixes; prefix equal
   to key; non-directory prefixes; whitespace, percent characters, dot segments,
   regex metacharacters and distinct Unicode forms treated literally. Verify
   frozen entries/pages, preserved conversion and three-page pagination with
   an empty middle page. Do not multiply equivalent test cases unnecessarily.
4. Add runner first/later failure tests using a scoped CLI request, otherwise
   clean DB evidence, isolated temporary output directory and private sentinels.
   Assert exact logs/errors, request counts and no file publication. Include
   a normally ignored key outside scope so comparison exclusions cannot hide it.
5. Add a valid scoped multi-page runner test that publishes the existing clean
   simulation receipt, with exact key/count/match evidence and cleanup in finally.
6. Run focused tests before source changes and capture real red results.
7. Add a compact short-circuited prefix check to the entry guard in
   `scripts/ops/reconcile-storage-objects.js`. Avoid unrelated refactoring.
   Run green focused tests and preserve all 903 existing cases and assertions.
   Inspection found the older opaque-pagination success fixture returns
   ` folder/ ` and `file` for `scope/`; prepend `scope/` in its source and
   expected keys so it tests a valid provider response while retaining its
   whitespace, metadata and pagination assertions.

## Verification, review, documentation and commit

Run and inspect actual results for:

- Direct focused red/green execution and `npm run ops:reconcile-test`.
- `node -c scripts/ops/reconcile-storage-objects.js` and the corresponding spec.
- `node scripts/ops/reconcile-storage-objects.js --help`.
- Changed-region Prettier using the installed formatter, single quotes and the
  adjacent file's arrow-parens conventions; avoid whole-file reformatting.
- `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check` and
  complete changed-file/diff inspection. Quote real output in the owner record.
- Every independent offline command currently in `ops:check`, resolving the
  script list from package.json. Omit only online `ops:audit` under the recorded
  metadata-disclosure restriction. Inspect every stage result; do not claim an
  aggregate ops:check pass or a fresh vulnerability inventory.
- `npm run ops:launch-readiness`: the checked-in example must retain expected
  exit 1 and 0 approved / 11 blocked / 70 blockers. Do not approve categories.

If sandbox behavior prevents normal child tests or build workers, record the
actual failure and use only a permitted execution mode for the identical check;
do not weaken assertions or alter application code to bypass the environment.

After self-verification, use `requesting-code-review` and its template to
dispatch one independent read-only reviewer with structured scope, this prompt,
SDK semantics, actual check results and base/head both `06134e951c687691bf8b7528d97c1f5b0d444601`
plus working diff. Evaluate feedback with `receiving-code-review`, verify and
fix valid issues, rerun affected checks and re-review significant changes.

Then record the result and actual output in `docs/operations.md`, plus concise
evidence in `docs/build-plan.md`, Category 6 of `docs/launch-checklist.md` and
the existing reconciliation boundary in `docs/security.md`. Include ordinary
commit-revert rollback and the limitation that literal scope consistency is
not completeness, authenticity, byte integrity or an atomic DB/storage snapshot.
Prompt 201, Category 6 live approval and Phase 12 exit stay open.

Stage only this prompt, source/spec and the four owner docs; inspect staged diff,
commit locally to `main` using `caveman-commit` with a security rationale body.
Safe result inspection: `npm run ops:reconcile-test` and
`node scripts/ops/reconcile-storage-objects.js --help`. After this local commit,
prepare and execute the one additional prompt the user authorized; do not push.

## SKILLS USED

- `architecture-patterns`: preserve acquisition adapter and pure comparison seams.
- `deployment-pipeline-design`: preserve recovery evidence and launch gates.
- `error-handling-patterns`: whole-inventory rejection and fixed diagnostics.
- `secrets-management`: prevent provider values from entering errors or artifacts.
- `security-best-practices`: validate contradictory untrusted listing contents.
- `javascript-testing-patterns`: bounded adapter/runner behavioral regressions.
- `requesting-code-review`: independent review after complete self-verification.
- `receiving-code-review`: verify reviewer claims before making corrections.
- `caveman-commit`: required local Conventional Commit and security rationale.
