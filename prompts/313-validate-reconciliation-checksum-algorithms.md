# Phase 12K — Validate reconciliation checksum algorithms

## Scope and why this is next

Continue the open recovery-evidence gate in `docs/build-plan.md` §§13–14
after committed Prompt 312 (`f5a131c`). Code and git history confirm the
previous inventory checks are implemented. A synthetic probe still obtains
`status: 'clean'`, `matchedObjects: 1`, `exitCode: 0` with a database record
declaring `checksumAlgorithm: 'md5'`; the query adapter accepts it too.
The implemented migration permits only exact `sha256` on StoredObject.
Reject unsupported supplied algorithm metadata at the shared DB boundary.

The user explicitly instructed implementation when planning finishes. Re-read
this prompt and load its skills for execution; no further approval is needed.

## References read and verified authority

- `AGENTS.md`: workflow, phase selection, review and local commit contract.
- `docs/build-plan.md` §§13–14 and Prompt 312's committed-state record.
- `docs/skills.md`: skill paths and bounded phase continuation selection.
- `docs/operations.md`: recovery evidence and Prompts 305–312.
- `docs/launch-checklist.md` Category 6: live recovery acceptance stays open.
- `docs/security.md`: value-free recovery inventory validation boundaries.
- `docs/system-architecture.md`: Compose recovery and diagnostic boundaries.
- `docs/product.md`: product journeys and roles remain unchanged.
- `server/prisma/schema.prisma`, StoredObject; and
  `server/prisma/migrations/20260824170000_storage_queues_uploads/migration.sql`,
  `StoredObject_checksumAlgorithm_check`: persisted algorithm is `sha256`.
  These are read-only references; no SQL change.
- `scripts/ops/reconcile-storage-objects.js`, `.spec.js`, `.ts`: shared
  validation, query/runner boundaries and optional facade metadata.
- Root `package.json`: actual verification scripts.

No styling, browser, measurement, Next, React or Tailwind changes are involved.
No skill specifically documents this framework-free Node CLI; inspected
repository code and runtime probes supply the API authority. The security skill
has no standalone Node CLI reference; use its general input-safety principles.

## Behavior and compatibility contract

When a DB inventory record supplies a non-null/non-undefined
`checksumAlgorithm`, require the primitive string `sha256` exactly. Reject
unknown algorithms, case/whitespace variants, empty strings, booleans, numbers,
bigints, arrays, ordinary/coercible objects and symbols without coercion.
Validate whether or not a digest is present, and before any filter, lifecycle
exclusion, pg mapping or injected client acquisition can hide invalid metadata.
Reuse `Database inventory is invalid`; query/runner failures retain their
existing sanitized diagnostics and publish neither a summary nor a receipt.

Preserve the utility's existing optional-field contract: omitted, undefined and
null algorithm values remain accepted. Explicit `sha256` works with absent or
nullable checksum metadata and existing whole-byte hex lengths/case handling.
Do not normalize algorithm spelling or infer algorithms from digests. Storage
records have no algorithm field in the public contract; leave their handling
unchanged. Inputs, including frozen records and arrays, remain caller-owned.

No route, SQL/schema/migration, signature/export, facade, report shape/mode,
CLI flag, checksum-length policy, listing behavior, publication policy,
dependency, CI or Stage 7 caller changes. No content retrieval, cryptographic
integrity claims, snapshot/authenticity claims, resource limits, hostile
getters/proxies, live services, online dependency audit, deployment, push or
launch approval. This is validation of supplied metadata, not a new hash check.

## Implementation

1. Add focused behavior tests before source changes. Reproduce unsupported
   supplied algorithms otherwise producing a matching clean report. Cover the
   invalid classes above with safe synthetic sentinels and fixed errors.
2. Extend private `validateInventory` beside checksum validation with a
   database-only optional algorithm check. Use exact equality and no conversion;
   retain O(n) validation and all existing ID/key/state/date/hex checks.
3. Prove invalid algorithms reject before bucket, organization, prefix, ignore,
   pending, deleted, expired and quarantine exclusions, including an invalid
   later record following valid inventory and records with no digest.
4. Test whole-query rejection on an invalid later row before normalization;
   one query, no partial result. Preserve successful unique-row bigint mapping
   and the original valid algorithm/hex spelling without mutating frozen inputs.
5. Test injected invalid DB inventories in `main` with and without injected
   storage: no pg/S3 activity, exit 1, fixed error, empty output directory, no
   summary or receipt success message. Test queried invalid rows before S3
   acquisition with the fixed query error. Use only stub clients.
6. Verify nullable/omitted algorithms and exact `sha256` across absent/null/hex
   digests, frozen caller ownership, existing comparisons/exclusions, and a
   successful explicit-sha256 simulation receipt. Retain all prior tests.

## Verification, review and completion

Re-read this file and invoke all named skills before code. Run focused red/green
`npm run ops:reconcile-test`; selected-region Prettier checks; both JS syntax
checks; CLI help; `git diff --check`; root lint, typecheck and build. Save actual
logs in `/tmp` and accurately report sandbox failures/unchanged permitted retries.
Run and inspect independent offline `ops:check` stages; omit online `ops:audit`
under the documented metadata-disclosure restriction, and do not claim aggregate
`ops:check` success or a fresh vulnerability inventory. Verify the unresolved
readiness example remains fail-closed without editing operator values.

Inspect the full diff and self-verify before dispatching one independent
read-only reviewer. Supply base/head SHA (`f5a131c` plus working diff), this
prompt, migration constraint, optional compatibility contract and actual check
results. Evaluate findings using `receiving-code-review`, fix valid issues and
re-test; re-review significant changes.

After review record implementation, reproduction, actual checks, limits and
ordinary commit-revert rollback in `docs/operations.md`; add concise records to
`docs/build-plan.md`, Category 6 of `docs/launch-checklist.md`, and
`docs/security.md`. Prompt 201 and Phase 12 live exit remain open. Stage only
this prompt, the JS utility/spec and those four docs; inspect the staged diff
and commit locally to `main` using `caveman-commit`. Return the commit and safe
local help/test commands.

## SKILLS USED

- `architecture-patterns`: preserve pure validation and adapter boundaries.
- `deployment-pipeline-design`: maintain fail-closed recovery evidence gates.
- `error-handling-patterns`: reject unsupported metadata before success output.
- `secrets-management`: preserve fixed diagnostics without private values.
- `security-best-practices`: secure-by-default metadata input validation.
- `javascript-testing-patterns`: behavior, adapter and runner regressions.
- `requesting-code-review`: independent review following self-verification.
- `receiving-code-review`: verify feedback before changing implementation.
- `caveman-commit`: required local Conventional Commit and rationale.

Other full-phase skills remain conditional: no Nest/SQL/CI/telemetry/SAST/UI/
browser/architecture decision surface is changed. Load its owner if scope grows.
