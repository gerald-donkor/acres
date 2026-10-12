# Phase 12K — Validate reconciliation lifecycle metadata

## Scope and why this is next

Continue the open recovery-evidence gate in `docs/build-plan.md` §§13–14 after
committed Prompt 309 (`f79fe5c`). The inventories and comparison options now
validate, but lifecycle fields can still use coercion to hide missing objects.
Offline planning probes produced a `clean` result with one excluded missing
accepted object for both `deletedAt: true` and `deletedAt: "private-invalid-date"`.
Unknown states, array upload states and invalid creation dates also reached
comparison instead of rejecting the inventory. These are fixture observations,
not evidence of a production incident.

The user explicitly instructed implementation when planning is finished. Write
and re-read this prompt, then execute without another permission question.

## References and verified authority

- `AGENTS.md`: phase control, prompt, verification, review and local commit.
- `docs/build-plan.md` §§13–14 and Prompts 305–309 implementation records.
- `docs/skills.md`: scoped continuation skill selection and lock convention.
- `docs/operations.md`: Restore & Drill Execution and Prompts 308–309.
- `docs/launch-checklist.md`: Category 6 simulation versus live acceptance.
- `docs/security.md`: recovery evidence and Prompts 308–309 boundaries.
- `docs/system-architecture.md` §11: recovery and diagnostic boundaries.
- `docs/product.md`: no change to the product or organization roles/journeys.
- `scripts/ops/reconcile-storage-objects.js`, `.spec.js`, `.ts`: inventory,
  comparison, pg adapter, injection, diagnostics and publication contracts.
- `server/prisma/schema.prisma`: `StoredObjectState` and `UploadState` enum
  values, read only; do not change schema or application modules.
- `scripts/ops/run-launch-drills.sh` Stage 7 and root `package.json` gates.
- Local runtime probes of `Date`, `getTime`, `Number.isFinite`, nullable
  fields and current malformed-input behavior. No new third-party APIs.

No visual work or measurements: the comps and Next/React/Tailwind API guides
do not apply. No installed skill owns framework-free Node lifecycle validation;
use the inspected source/schema/type contracts and local runtime probes. The
security skill has no dedicated Node CLI reference; apply its general guidance.

## Impact, compatibility and non-goals

Reject malformed lifecycle metadata before filtering/exclusion, DB row mapping,
or injected-runner service acquisition. Reuse fixed `Database inventory is
invalid` / `Storage inventory is invalid` errors and existing sanitized runner
errors. No routes, CLI flags, SQL, exported signatures, TypeScript facade,
dependency, report schema/mode, publication or Stage 7 caller change.

Preserve optional null/undefined metadata, valid Date objects and parsable
nonempty date strings. Preserve exact input values and caller ownership; do not
normalize timestamps in reports or mutate inventories/Date objects. Require
the DB `state` already required by the typed record and database schema.
Intentional stricter runtime rejection of invalid lifecycle values is the only
compatibility change. Unknown extension fields remain ignored.

No changes to valid pending/deleted/expired/cancelled/quarantine exclusions,
retention boundaries, future-date policy, checksum validation/comparison,
state-transition or cross-field consistency rules. Do not require optional
creation dates, infer completion/authenticity, infer operator scope, add canonical
ISO grammar, query ordering, retries/timeouts, resource caps, live services,
online audit, deployment, push or launch approval. Hostile in-process
getters/proxies/overrides, cross-realm Date objects, DB/S3 snapshot consistency,
actual byte integrity and inventory completeness remain outside scope.

## Implementation steps

1. Add behavior regressions to the existing Node spec before source changes;
   retain all 281 previous tests. Demonstrate the malformed deletion-date clean
   report and ensure an otherwise clean matching inventory also rejects invalid
   states/dates. Test validation before filters and exclusions.
2. Extend the private `validateInventory` boundary with exact lifecycle checks:
   - Database `state` is required and exactly one of `pending_upload`,
     `quarantined`, `accepted`, `rejected`, `deleted`.
   - Database `uploadState` is optional: undefined/null or exactly one of
     `pending_upload`, `completed`, `scanning`, `accepted`, `rejected`,
     `cancelled`, `expired`. Empty/whitespace strings, unknown strings,
     primitives/objects/arrays reject without coercion.
   - Database `createdAt`, `deletedAt`, `uploadExpiresAt` and storage
     `lastModified` are optional: undefined/null, finite valid Date, or nonempty
     non-whitespace string whose existing Date parser returns finite epoch
     milliseconds. Reject numbers, booleans, boxed strings, arrays, plain
     objects, invalid Dates and unparseable strings. Date epoch zero is valid.
     Do not parse arbitrary objects or coerce them into timestamps.
   - Keep value-free errors; use small private constants/helper functions as
     appropriate, no new exports, packages or framework imports.
3. Preserve validation before every inventory filter. The existing pg adapter
   and injected runner already share this boundary: keep that reuse rather than
   duplicating checks. Later malformed pg rows must reject the entire result.
   Invalid injected DB/storage inventories fail before either client is touched.
4. Test valid enum values, omitted/null optional metadata, Date/string forms,
   valid soft-deletion, pending and terminal upload exclusions, quarantine
   within/outside/at retention, future creation dates under existing policy,
   frozen records/arrays/Date objects and unchanged orphan date representations.
5. Test invalid metadata hidden behind bucket/org/prefix/ignore filters and
   pending/deleted/quarantine exclusions. Test exact fixed helper errors and
   sanitized query/runner failures using private fixture sentinels. A failure
   must publish no summary, success log, staging artifact or receipt.

## Verification and completion

Re-read this prompt and load every named skill at implementation. Run focused
red then green `npm run ops:reconcile-test`, changed-region Prettier comparisons,
both changed JS syntax checks, `npm run lint`, `npm run typecheck`,
`npm run build`, help and `git diff --check`. Run each independent offline stage
of `ops:check` with separately inspected output; omit online `ops:audit` under
the standing metadata-disclosure restriction and do not claim aggregate success.
Record failed attempts and unchanged permitted retries when sandbox limitations
require them. Keep logs in `/tmp`; no repository-generated evidence receipts.

Self-review the full diff, then dispatch the required independent read-only
reviewer with baseline SHA, working diff, prompt, intended compatibility and
actual checks. Apply `receiving-code-review` to verify each finding; fix valid
issues and recheck, re-review significant changes. After review record scope,
fixtures, compatibility, real outputs, limitations and ordinary revert rollback
in `docs/operations.md`, with concise records in `docs/build-plan.md`, Category
6 of `docs/launch-checklist.md`, and `docs/security.md`. Keep Prompt 201,
Category 6 live operator approval and Phase 12 exit open. Stage only this prompt,
JS utility/spec and those four docs, inspect the staged diff, and commit locally
to main with `caveman-commit`. Return commit ID and safe help/test commands.

## SKILLS USED

- `architecture-patterns`: preserve pure inventory/comparison and adapter boundaries.
- `deployment-pipeline-design`: keep recovery evidence gates fail-closed.
- `error-handling-patterns`: reject malformed inventory before success or publication.
- `secrets-management`: keep errors free of private metadata and connection data.
- `security-best-practices`: validate lifecycle evidence inputs securely by default.
- `javascript-testing-patterns`: behavioral rejection, compatibility and runner regressions.
- `requesting-code-review`: dispatch independent review after self-verification.
- `receiving-code-review`: verify findings before fixes and re-verification.
- `caveman-commit`: required local Conventional Commit with security rationale.

Other full-phase skills are conditional for this bounded continuation: no server
framework, SQL/schema, workflow, telemetry/dashboard, SAST, browser/E2E, UI or
architecture-decision changes. Load the relevant owner if scope changes; do not
silently broaden this task.
