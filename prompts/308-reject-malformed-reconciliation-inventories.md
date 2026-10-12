# Phase 12K — Reject malformed reconciliation inventories

## Scope and why this is next

Continue the unclosed Phase 12 recovery-evidence gate in `docs/build-plan.md`
§§13–14 after commit `8ba7a4118a609aa6b39813407f8f7a7dce206094`.
Prompt 307 validates S3 pagination, but the exported comparison function and
injected inventory path still skip malformed identities and overwrite duplicate
storage keys. Network-free planning probes returned `status: "clean"` and
`exitCode: 0` for DB/storage arrays containing null and empty records, and for
two storage records with the same key where a matching size overwrote a bad
size. `main` with `dbObjects: [{}]` also returned 0. These are fixture results,
not evidence of a production incident. Prevent invalid inventory from becoming
successful recovery preflight evidence.

The user instructed execution after planning. Write and re-read this prompt,
then implement without another approval request. Use medium effort.

## References read and API authority

- `AGENTS.md`: phase control, prompt, verification, review and commit contracts.
- `docs/build-plan.md` §§13–14 and committed Prompts 305–307 records.
- `docs/skills.md`: select skills for this bounded continuation, not unrelated
  Phase 12 surfaces.
- `docs/operations.md`: backup/restore/reconciliation runbook and Prompt 307.
- `docs/system-architecture.md` §11: recovery, secrets and diagnostic boundaries.
- `docs/security.md`: recovery evidence boundary and Prompts 306–307.
- `docs/launch-checklist.md` Category 6: simulation versus live acceptance.
- `scripts/ops/reconcile-storage-objects.js`, `.spec.js`, `.ts`: comparison,
  query normalization, injection, publication and existing regression contracts.
- `scripts/ops/run-launch-drills.sh` Stage 7 and `package.json` operations scripts.
- Installed `node_modules/pg/lib/result.js`: query results provide a `rows` array.

No UI, visual measurement or framework component changes; comp references and
Next/React/Tailwind APIs do not apply. No installed skill specifically owns the
Node CLI/pg-result shape: inspected local implementation and driver source own
those details. The security skill has no framework-free Node CLI reference;
use its general validation/redaction principles without importing web guidance.

## Impact, compatibility and non-goals

No routes, CLI flags, report schema/modes, Stage 7 caller, SQL, policies,
dependencies or filesystem publication change. Empty inventories remain valid.
Omitted inventory properties on the pure helper retain their empty-array default;
explicit null, nonarrays and sparse/invalid records reject. Existing valid
filters, exclusion states, quarantine rules, checksums and orphan policy remain.
Byte counts remain optional/nullable: this change does not claim missing size
or checksum metadata verifies content. Reject malformed records before filters
or exclusions can hide them. This is deliberately stricter for malformed
programmatic fixtures/callers.

Do not add schema/state/date/checksum-policy changes, scope inference, RLS/SQL
changes, retry/timeouts/capacity limits, S3 mutations, lifecycle refactoring,
a generic validation library or new public exports. Do not add live approval,
production drill, secrets access, deployment, online dependency audit or push.
Option-policy validation, snapshot consistency, byte integrity, authenticity and
hostile getters/proxies remain outside the inventory-data contract; errors must
still be sanitized by the runner.

## Implementation steps

1. Add focused Node test-runner regressions in the existing spec first. Keep
   all 100 prior tests and their purpose. Use fake pg/S3 clients and temporary
   directories; never contact a real service. Prove baseline red behavior.
2. In the JS utility, introduce small private validation helpers. Check DB and
   storage inventories are arrays before iteration, and every element is a
   non-array object. Reject nulls, holes, primitive values and array records.
   Require DB `id`, `organizationId`, `bucket`, `objectKey` to be nonempty
   strings; require storage `key` to be a nonempty string. Preserve opaque text
   including significant whitespace; do not trim or rewrite keys/IDs.
3. Reject repeated DB IDs and repeated storage keys, even if byte counts agree.
   Do not invent cross-bucket key uniqueness or new scoping policy. Validate all
   records before filtering/exclusions; no skip-on-malformed or map overwrite.
4. Validate any non-null/defined byteCount without coercing booleans, empty text,
   exponent/hex/fractional/negative values or unsafe integers. Accept nonnegative
   bigint, nonnegative safe-integer number, or decimal digit-only string (allow
   leading zeros). Keep arbitrary precision with BigInt; do not pass through
   Number for decimal strings. Preserve optional/null byte counts and existing
   report string serialization. Use fixed value-free Error messages; do not
   include inventory values, DB rows, keys, IDs or underlying errors.
5. Validate `result.rows` through the DB inventory validation boundary before
   converting byte counts in `queryDatabaseStoredObjects`. Check result is a
   non-array object and rows is an array. Preserve query text and public helper
   signature; malformed query results reject and the existing runner reports
   `Error: Database query failed` with no summary/receipt.
6. Keep `main`'s source selection honest: only undefined injected inventories
   mean acquire from a client; explicit null/false/nonarray values must reach
   validation and fail rather than trigger credential/default fallbacks. Existing
   empty injected arrays must work without credentials. Comparison failures use
   the existing `Error: Reconciliation execution failed`, exit 1, with no
   summary, success message, final receipt or staging artifact. Preserve
   cleanup/ownership and publication behavior.
7. Keep facade unchanged if signatures are unchanged. Avoid unrelated
   reformatting of legacy regions. Make no server/shared/client changes.

## Acceptance coverage

- Empty and omitted inventories retain valid reports. Null/nonarray inventories,
  sparse arrays and invalid records reject with value-free messages.
- Missing/nonstring/empty DB identities and storage keys reject; opaque keys
  with whitespace and zero-size objects work unchanged.
- DB duplicate IDs and storage duplicate keys reject before filters can hide
  them. Existing organization/bucket/prefix/ignored-marker and state exclusions
  continue to work for valid records.
- Optional/null byteCount, zero, bigints, digit strings (including beyond
  Number.MAX_SAFE_INTEGER and leading zeros) work. Negative, fractional,
  nonfinite, unsafe-number, boolean, empty/whitespace, hexadecimal, exponent,
  signed decimal and object counts reject on either side.
- Valid DB result normalization preserves all row fields and bigint counts;
  malformed result/rows/records/counts rejects the entire query inventory.
- Main tests cover injected invalid DB/storage arrays, explicit null sources,
  malformed fake pg results and mixed valid/invalid records. Private sentinels
  in invalid data/errors never appear in diagnostics or logs. Failure creates
  no receipt/staging file or reconciliation summary.
- Main valid injected/fake-client inventories still write unchanged simulation
  receipts; retain clean/error/orphan exit policies and all pagination/publication
  regressions. Tests assert input records are not mutated.

## Verification, review and completion

Re-read approved prompt, owning docs and named skills before writing code.
Run `npm run ops:reconcile-test`, syntax checks for changed JS, changed-region
formatting, `npm run lint`, `npm run typecheck`, `npm run build` and
`git diff --check`. Run every independent offline stage listed in `ops:check`
with individual outputs; skip online `ops:audit` under the standing
metadata-disclosure restriction. Do not call the aggregate and claim it passed
when a stage was omitted. Record actual output and any sandbox limitation;
use permitted unchanged reruns when appropriate. No live DB/browser required.

After self-verification dispatch an independent read-only reviewer via
`requesting-code-review` with the baseline SHA, actual working diff, prompt,
checks and narrow scope. Apply `receiving-code-review` to verify findings;
fix valid issues and recheck, re-review if changes are significant. Medium
effort applies to the reviewer too. Record behavior, planning probes, compatibility,
limits, actual checks and ordinary revert rollback in `docs/operations.md`;
add concise `docs/build-plan.md`, Category 6 `docs/launch-checklist.md` and
`docs/security.md` boundary updates. Prompt 201, live Category 6 approval and
Phase 12 exit stay open.

Stage only the prompt, JS utility/spec, and those four owning docs (facade only
if a justified signature change is necessary). Review the staged diff and
commit locally to main using `caveman-commit`, including the evidence-integrity
reason. Provide safe help/test commands and commit ID; do not push.

## SKILLS USED

- `architecture-patterns`: preserve pure comparison and pg/S3 adapter boundaries.
- `deployment-pipeline-design`: preserve Stage 7 fail-closed gate semantics.
- `error-handling-patterns`: reject invalid inventory without partial success.
- `secrets-management`: fixed diagnostics suppress private inventory/provider data.
- `security-best-practices`: validate evidence inputs; no standalone security report.
- `javascript-testing-patterns`: meaningful boundary and receipt regressions.
- `requesting-code-review`: independent reviewer after self-verification.
- `receiving-code-review`: verify findings and recheck valid fixes.
- `caveman-commit`: required local commit and concise security-fix rationale.

Other full-phase skills are conditional for this continuation: no Nest/SQL
change, CI workflow, telemetry/dashboard, SAST, browser/E2E surface or new
architecture decision is planned. Load its owner if scope changes; do not
expand this prompt silently.
