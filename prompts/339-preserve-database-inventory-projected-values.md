# Phase 12K — Preserve database inventory projected values

## Scope, sequence and authorization

Continue the earliest open parent, Phase 12K recovery evidence, after committed
Prompt 338 at `89c8793eb6af97ef8bf2c5a4d008155aa34a23cb` on clean `main`.
The user entered `i`: prepare this one prompt and request approval. Preparation
does not authorize implementation, staging, commit, live operations or push.

The next bounded step fixes a demonstrated loss of accepted evidence at the
database adapter's row-copy boundary. `validateInventory` reads an own,
non-enumerable checksumHex and the projection guard accepts it, but the final
object spread drops that property. A read-only, offline probe with a frozen
complete row, valid twelve-column descriptors, and conflicting 32-byte SHA256
digests returned:

```json
{"inputOwnChecksum":true,"returnedOwnChecksum":false,"status":"clean","mismatches":0}
```

Preserve accepted own projection values during conversion so conflicting
checksums remain visible to reconciliation. This is an adapter correctness fix,
not evidence that ordinary pg rows are non-enumerable or that live recovery works.

## References read and implementation authority

- `AGENTS.md`: phase-control, prompt, verification, review and commit contracts.
- `docs/build-plan.md`: Phase 12, sequence gates and Prompt 338 record.
- `docs/skills.md`: locked skills and scoped triggers.
- `docs/operations.md`: recovery adapter, audit-disclosure restriction and Prompt
  338 implementation/verification/limitations.
- `docs/security.md`: existing recovery-evidence boundary and latest record.
- `docs/launch-checklist.md`: Category 6 recovery approval and sign-off matrix.
- `docs/system-architecture.md` §§11.3–11.4: recovery and redaction contracts.
- `docs/product.md` §6: observable and recoverable operations.
- `docs/backend.md`: implemented backend context; no server code change planned.
- `scripts/ops/reconcile-storage-objects.js`, `.spec.js` and `.ts`: validation,
  fixed projection, copy/conversion, comparison, runner and receipt contracts.
- `package.json` and `scripts/ops/audit-dependencies.sh`: real checks and network
  audit boundary.
- `node_modules/pg/lib/result.js`: addFields/parseRow create complete ordinary
  named rows; installed driver fixtures can verify that path offline.
- `node_modules/pg-protocol/dist/parser.js`: existing descriptor parsing.
- `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`: unchanged
  production-build check; no new Next API is introduced.

No visual surface changes; no comp, screenshot, geometry or measurement applies.
The evidence above is a synthetic runtime observation, not a production finding.
No public route changes. The affected behavior is the operator reconciliation
utility and any caller of its exported database adapter.

## Required behavior and compatibility

1. Once current inventory/result/descriptor guards pass, return a fresh ordinary
   record per row preserving every **own** property in
   `DATABASE_INVENTORY_COLUMNS`, regardless of enumerability. Apply this both
   with descriptors and with absent/undefined descriptors. Preserve values
   exactly, except the existing byteCount normalization to bigint or null.
2. Preserve missing versus own-undefined projection properties, NULL values,
   strings, Date object values, row order and enumerable extra properties.
   Preserve current handling of inherited properties: do not start copying
   inherited projection fields or arbitrary non-enumerable extras.
3. Preserve the input row, input array, descriptors and frozen ownership. Output
   property flags need not match input flags; downstream reconciliation needs
   ordinary accessible own values. Do not mutate caller descriptors to make
   values enumerable and do not introduce JSON serialization to copy rows.
4. Existing validation remains unchanged, including optional descriptor
   compatibility, complete own projection keys when fields are supplied,
   duplicate detection, lifecycle/checksum/date/count guards, command/mode and
   type checks. No relaxation or new acceptance restriction is required.
5. A valid non-enumerable checksumHex must survive conversion: mismatching
   storage digest yields existing error status/exit 1 and checksum mismatch
   evidence; matching storage digest yields ordinary clean status/exit 0.
   Non-enumerable deletedAt/uploadState/uploadExpiresAt must likewise remain
   available to the existing lifecycle rules. Do not change those rules.
6. Runner mismatches are valid comparison reports, not query failures. Publish
   the usual simulation receipt with error status and mismatch details when
   output is requested. Preserve existing summaries, private transport errors,
   injected-client ownership, atomic publication and exit handling. No receipt
   schema revision or change to Stage 7 is allowed.

No promise is made about adversarial Proxy/getter behavior or arbitrary
mid-conversion mutation. Use stable data properties for this fix and fixtures.

## Allowed files and implementation sequence

Only this prompt, `scripts/ops/reconcile-storage-objects.js`, its `.spec.js`,
and result records in `docs/operations.md`, `docs/build-plan.md`,
`docs/security.md`, and `docs/launch-checklist.md` should change.

1. Re-read this prompt, owning docs and every listed skill after approval.
   Record starting SHA/status and preserve unrelated work.
2. Add behavioral regressions before source edits. Build complete rows using
   existing `projectedInventoryRow`/`databaseInventoryFields` helpers, then use
   Object.defineProperty to hide selected own data properties before freezing.
   Leave all existing 1808 tests/assertions intact; add tests rather than weaken
   legacy fixtures. Exercise absent, undefined and valid descriptor metadata.
3. Cover non-enumerable checksumHex through queryDatabaseStoredObjects into
   reconcileObjects, with matching and mismatching digests. Assert the returned
   value, own-property presence and final comparison rather than merely testing
   the copying implementation.
4. Cover all twelve projected fields as non-enumerable own properties in one
   frozen complete fixture, plus focused lifecycle/date cases whose outcomes
   would change if a value disappeared. Cover byteCount normalization, own
   undefined and NULL projection values, multirow order, output freshness and
   preserved enumerable extra keys. A non-enumerable unrelated extra should
   retain previous omission. Test missing optional properties without supplied
   descriptors remain missing and inherited optional properties are not copied.
5. Add runner scenarios using injected pg/S3 clients and isolated temporary
   receipt directories: conflicting checksums return 1 with error receipt and
   checksum mismatch; equal checksums return 0 with clean simulation receipt.
   Assert one query, expected bounded S3 sends, caller clients remain open,
   no temporary publication leftovers and caller fixture immutability. Clean
   temporary directories in finally blocks and restore any process exit state.
6. Run focused red and record actual failing assertions. Implement a compact
   row-copy change at the existing final map: retain enumerable extra spread,
   copy known own projection values explicitly using the existing column list,
   then apply existing byteCount conversion. Avoid a second projection list,
   generic clone framework, prototype manipulation or broad refactor.
7. Verify ordinary installed pg.Result named rows still convert and reconcile
   unchanged using offline driver fixtures. Reuse existing coverage where it
   already demonstrates this; do not add a redundant driver test for its own sake.
8. Run focused green, review all changed files and format only changed regions
   with installed Prettier. Existing SQL and comparison code stay unchanged.

## Verification and review

Run and quote actual output/exit codes:

```bash
node --test scripts/ops/reconcile-storage-objects.spec.js
npm run ops:reconcile-test
node -c scripts/ops/reconcile-storage-objects.js
node -c scripts/ops/reconcile-storage-objects.spec.js
node scripts/ops/reconcile-storage-objects.js --help
git diff --check
npm run lint
npm run build
npm run typecheck
```

Keep build and typecheck sequential because generated client files are shared.
Check formatting for changed regions using installed Prettier and record its
real result. If restricted workers fail, distinguish sandbox failures from test
failures, and file-level wrapper counts from actual cases; use permitted ordinary
child-process execution where available without concealing the initial result.

Run independent offline stages resolved from current package.json `ops:check`,
inspect every exit/suite count and record totals. Omit online `ops:audit` under
the existing registry dependency-metadata disclosure restriction; do not claim
the aggregate ops:check passed or that a fresh vulnerability audit occurred.
Run `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`
and record actual expected fail-closed counts; prior 0 approved / 11 blocked /
70 blockers are historical reference only until reproduced.

After self-verification dispatch one read-only reviewer with
`requesting-code-review/code-reviewer.md`, base/head starting SHA plus working
diff, this prompt, the reproduced loss-of-checksum probe and actual check logs.
Review must check compatibility of descriptors-present/absent paths and error
receipt behavior. Reviewer must not subdelegate. Evaluate findings using
receiving-code-review, fix valid defects and rerun affected checks; re-review
significant changes before recording completion.

## Documentation, exit, rollback and non-goals

Record pre-change probe, red/green results, real outputs, review findings,
compatibility and limitations in docs/operations.md. Add concise matching
records to build-plan, security and Category 6 checklist. No AGENTS.md index
change is necessary because all documentation owners exist. Inspect the final
staged diff; commit approved work locally to main using caveman-commit with a
body explaining the checksum-evidence loss. Do not push.

Exit: accepted own projection values survive conversion, mismatches cannot
become clean by losing those values, checks pass, independent review is resolved,
records agree and all approved-task changes are committed. Ordinary commit
revert rolls back this adapter-only correction without database/storage mutation.
Safe inspection commands are `npm run ops:reconcile-test` and the CLI `--help`.

No dependencies, migrations, SQL, enum IDs, public contracts, UI, infrastructure,
CI, secrets, live services or new trust boundaries change. No byte download,
catalog authentication, completeness or atomic snapshot guarantee is added.
No deployment, operator approval, live restore or production launch is authorized.
Prompt 201, Category 6 live recovery approval and Phase 12 exit remain open.

## SKILLS USED

- `architecture-patterns`: preserve the existing adapter/comparison boundary.
- `deployment-pipeline-design`: preserve recovery evidence, exit and rollback gates.
- `error-handling-patterns`: distinguish valid mismatch reports from query failures.
- `secrets-management`: offline synthetic inputs and credential-safe diagnostics.
- `security-best-practices`: prevent accepted checksum evidence disappearing during copying.
- `postgres-best-practices`: verify the named-row driver contract without changing SQL.
- `javascript-testing-patterns`: behavioral adapter/comparison/runner regressions.
- `requesting-code-review`: independent read-only review after self-verification.
- `receiving-code-review`: verify feedback against code and approved requirements.
- `caveman-commit`: required local Conventional Commit and integrity rationale.

All were read while preparing this prompt; reload for implementation. There is
no standalone Node CLI security reference in the loaded security skill; existing
private diagnostics, repository contracts and installed driver code supply the
applicable authority. Phase-wide UI, Nest, browser, CI, telemetry, SAST, SQL
optimization and new threat-model workflows have no changed surface here.
