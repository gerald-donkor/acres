# Phase 12K follow-up — separate disaster recovery drill from live evidence

## Scope and why this is next

Close Category 6 (`backup_and_disaster_recovery`)'s drill-versus-live-evidence
gap. Classify the existing PostgreSQL restore drill runner
(`scripts/ops/run-restore-drill.sh`) and storage reconciliation utility
(`scripts/ops/reconcile-storage-objects.js`) as rehearsal/simulation preflights,
preserve their useful database restore and object reconciliation checks, and
require separately inspected live operator child receipts (a live restore
execution receipt bound to an authorized maintenance window, target database,
and RTO/RPO proof; and an authenticated live bucket reconciliation report) when
Category 6 is approved. This is a repository-owned, dependency-safe step within
the unfinished Phase 12 exit gate, continuing the hardening of drill evidence
categories (after prompts 234–237 for capacity, rotation, deployment, and
volume encryption). Prompt 201 still governs real production evidence and sign-off.

Planning baseline: clean worktree at `f4f46d0c68e75edf082e509f45222a1acbf6ef21`
(`fix(ops): require bound live volume evidence`). Re-establish committed state on
execution; prompt files alone do not prove implementation.

Verified gaps in current code:

- `run-restore-drill.sh` executes against a local/drill database
  (`acres_restore_drill`) and emits `status: "success"`, record parity, PostGIS
  verification and foreign key checks without `execution_mode: "simulation"`. It
  does not attest production disaster recovery, off-host backup encryption,
  live off-host restore, or real production RPO/RTO.
- `reconcile-storage-objects.js` executes against local/dev PostgreSQL and
  Garage/S3 or under `--dry-run`, emitting summary counts and status without
  `execution_mode: "simulation"`. It does not attest live production storage
  reconciliation across all production buckets.
- `validateRestoreReport` and `validateReconciliationReport` in
  `scripts/ops/check-launch-readiness.js` accept any structurally compliant
  report without checking `execution_mode` and without requiring live operator
  evidence when Category 6 is approved.
- `isReconciliationCandidate` and restore report candidate filters do not exclude
  dossiers or enforce safe diagnostic boundaries; private file paths or child
  error diagnostics can leak on malformed or failed files.
- Stage 7 in `run-launch-drills.sh` runs both tools in drill/rehearsal mode; the
  unified dossier should summarize them as drill rehearsal, not production
  recovery sign-off.

Do not solve these gaps by claiming the drill scripts have new production
restoration powers. Separate drill rehearsal from live acceptance and document
the boundaries explicitly.

## References read and execution prerequisites

Planning read: `AGENTS.md` phase-control, workflow, prompt, product, standing
rules and verification contracts; `docs/build-plan.md` Phase 12 and Phase 12K;
`docs/skills.md`; `docs/system-architecture.md` §11–12;
`docs/security.md` §19 and Phase 12K evidence integrity;
`docs/operations.md` Disaster Recovery Runbook, Phase 12K, and prompt 237;
`docs/launch-checklist.md` Category 6, Stage 7, gap register and formal sign-off
matrix; `prompts/201-production-launch-evidence-and-signoff.md` for outstanding
operator authority.

Inspected: complete `scripts/ops/run-restore-drill.sh` and its spec
`scripts/ops/run-restore-drill.spec.js`; complete
`scripts/ops/reconcile-storage-objects.js` and its spec
`scripts/ops/reconcile-storage-objects.spec.js`; `validateRestoreReport`,
`validateReconciliationReport`, `isReconciliationCandidate`, Category 6
evaluation, and safe evidence-file boundaries in
`scripts/ops/check-launch-readiness.js`; Category 6 fixtures and approved parent
in `scripts/ops/check-launch-readiness.spec.js`; Stage 7 in
`scripts/ops/run-launch-drills.sh` and `scripts/ops/run-launch-drills.spec.js`;
Stage 7 assembly in `scripts/ops/assemble-launch-dossier.js`; root
`package.json`; and `infra/launch/readiness.example.json` /
`infra/launch/readiness.schema.json`.

At execution reread the approved prompt, those references, complete affected
test files and `infra/launch/readiness.example.json` /
`infra/launch/readiness.schema.json`. Read existing timestamp, exact-key,
reference and placeholder/secret helpers before reusing them. Inspect complete
launch/dossier tests before changing fixtures. Verify any newly used Node API
through installed references or a small local executable probe. No Next,
React, Tailwind or Nest API changes are needed.

No UI, routes, comps, crops, measurements or breakpoint changes apply. Database
and storage reconciliation checks below reflect the installed producer's
verified fields (`tables_source`, `tables_restored`, `migrations_source`,
`migrations_restored`, `record_parity_verified`, `postgis_verified`,
`foreign_keys_verified`, `matchedObjects`, `missingObjects`, `orphanObjects`,
`mismatchedObjects`), not a newly chosen production topology or objective.
Consult the existing threat model; no new full threat-model report or provider
choice is requested.

## Implementation plan

### 1. Identify all current drill producer receipts as simulation

Add `execution_mode: "simulation"` to every structured receipt emitted by
`scripts/ops/run-restore-drill.sh` and `scripts/ops/reconcile-storage-objects.js`.
Keep existing fields, flags, output paths and exit behavior. No CLI invocation
of either tool may emit live mode. Concrete local env values, reachable local
Postgres or Garage instances, and successful dry-run or drill execution do not
elevate evidence classification.

Correct CLI introduction/help, success/failure text, comments and runbook
claims: `run-restore-drill.sh` validates local credentials and restores a fresh
source dump into an owned, isolated drill database (`acres_restore_drill`),
measuring local RTO; it does not perform an actual off-host production restore or
validate off-host encryption. `reconcile-storage-objects.js` reconciles local or
reachable database records against object storage keys; it does not attest live
multi-region bucket integrity. Name those limits explicitly.

### 2. Define strict structural and separately supplied live contracts

Extend `validateRestoreReport(report, now, context = {})` and
`validateReconciliationReport(report, now, context = {})` with optional
context, e.g. `{ requireLive: true, expectedSection }`, retaining exported
helper use. Return null or false for malformed JSON shapes; do not throw or
expose child content. Require exact recognized
`execution_mode: "simulation" | "live"`. Missing, legacy or unknown mode fails;
no auto-relabeling.

For restore reports:
- Retain `status: "success"`, `rto_compliant: true`, `record_parity_verified: true`,
  `postgis_verified: true`, `foreign_keys_verified: true`, non-negative safe
  integers for table and migration counts (`tables_source === tables_restored`,
  `migrations_source === migrations_restored`), positive `backup_bytes`, and
  non-negative finite `duration_ms`.
- Accept real nonfuture basic UTC timestamps (`YYYYMMDDTHHMMSSZ`) or ISO UTC
  timestamps consistent with neighboring helpers.
- When `requireLive: true` is set: require `execution_mode: "live"`,
  `environment: "production"`, trimmed nonempty opaque `operator_reference`,
  `authorization_reference`, and `maintenance_window_reference`.
  When `expectedSection` is supplied, verify that the restore drill date
  matches the report date, and that the measured `duration_seconds` does not
  exceed `expectedSection.rto_hours * 3600`.

For storage reconciliation reports:
- Retain strict ISO UTC timestamp, 8 summary integer counts matching child array
  lengths, `missingObjects === 0`, `mismatchedObjects === 0`, `exitCode === 0`,
  and status `clean` (or `warning` when orphan objects are present without
  `--fail-on-orphans`).
- When `requireLive: true` is set: require `execution_mode: "live"`,
  `environment: "production"`, trimmed nonempty opaque `operator_reference`,
  `authorization_reference`, and `storage_target_reference`.

All opaque references must be trimmed, nonempty, control-free, and pass
existing placeholder/development/literal-secret rejection without echoing
diagnostics.

### 3. Require bound live evidence for Category 6

Keep existing approver, evidence, RPO/RTO limits, cron schedule, and generic
readiness gates. Preserve the checked-in unresolved example unchanged, including
its placeholders.

Exclude unified dossiers from restore and reconciliation candidates before
filename/content checks. Every referenced Category 6 child must pass structural
validation, and when `bdrSec.status === 'approved'`, both a valid live restore
child report and a valid live storage reconciliation child report are required.
A valid classified simulation may accompany live evidence; simulation-only,
legacy-only, dossier-only, prose-only and external-pointer-only evidence cannot
approve Category 6. Every live child must match: an invalid or malformed child
blocks beside a valid one.

Extend the narrow safe evidence-file boundary used by Categories 3, 8, and 10
to Category 6:
- Use fixed messages such as
  `A referenced restore drill report is invalid or failed` and
  `A referenced storage reconciliation report is invalid or failed` for missing
  files, parse errors, child/dossier failures, and malformed nested-value
  exceptions.
- Suppress private paths, child error/status text, and exception messages.
- Retain useful fixed Category 6 field-name and binding failure messages.

### 4. Preserve Stage 7 and update dossier assembly

Stage 7 remains disaster recovery restore drill and reconciliation rehearsal.
In `scripts/ops/assemble-launch-dossier.js`:
- Check that Stage 7 child receipts have `execution_mode === "simulation"`.
- Summarize Stage 7 in the dossier as drill rehearsal, not live disaster
  recovery sign-off.
- In `scripts/ops/run-launch-drills.sh`: document Stage 7 explicitly as restore
  drill and storage reconciliation rehearsal.

### 5. Automated test suite updates

- In `scripts/ops/run-restore-drill.spec.js`:
  Assert that emitted receipts contain `execution_mode: "simulation"`.
- In `scripts/ops/reconcile-storage-objects.spec.js`:
  Assert that emitted receipts contain `execution_mode: "simulation"`.
- In `scripts/ops/check-launch-readiness.spec.js`:
  Add comprehensive test coverage for Category 6:
  - Missing/unknown/legacy execution modes; simulation relabeled live without
    required observation fields;
  - Structural validation failure cases: malformed JSON, missing counts,
    mismatched tables/migrations, parity failures, negative duration, future
    dates;
  - Live mode validation: rejection of simulation when `status === 'approved'`,
    valid live child clearing fixture Category 6, simulation accompanying live
    child, invalid live references, date mismatch, RTO overrun;
  - Safe diagnostic boundary: suppression of private paths and child error
    details on missing or malformed Category 6 files;
  - Disguised dossier rejection.
- In `scripts/ops/run-launch-drills.spec.js`:
  Verify Stage 7 evidence expectations and dossier baseline consistency.

### 6. Documentation updates

Update `docs/operations.md`, `docs/launch-checklist.md`, `docs/security.md`,
and `docs/build-plan.md` with prompt 238 verification records, Category 6
contract, and residual live operator requirements.

## File scope, non-goals, impact and rollback

Expected changes:
- `scripts/ops/run-restore-drill.sh` and `scripts/ops/run-restore-drill.spec.js`
- `scripts/ops/reconcile-storage-objects.js` and `scripts/ops/reconcile-storage-objects.spec.js`
- `scripts/ops/check-launch-readiness.js` and `scripts/ops/check-launch-readiness.spec.js`
- `scripts/ops/assemble-launch-dossier.js`
- `scripts/ops/run-launch-drills.sh` and `scripts/ops/run-launch-drills.spec.js`
- `docs/operations.md`, `docs/launch-checklist.md`, `docs/security.md`, and `docs/build-plan.md`

Non-goals:
- Does not run a live restore against production databases or alter production storage buckets.
- Does not create synthetic approval of Category 6.
- Does not modify database schemas, application routes, or UI components.
- Rollback is reverting the implementation commit. Operator sign-off remains open.

## Verification, review and completion

1. Run `npm run ops:restore-drill-test` and `npm run ops:reconcile-test`.
2. Run `npm run ops:readiness-test`, `npm run ops:readiness-schema-test`, and
   `npm run ops:launch-drill-test`.
3. Run `npm run ops:templates`, `npm run ops:check`, `npm run lint`,
   `npm run typecheck`, `npm run build`, and `git diff --check`.
4. Run `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`;
   require fail-closed behavior (0 approved, 11 blocked, 70 blockers).
5. Self-review the complete diff, then dispatch an independent read-only reviewer
   via `requesting-code-review`. Evaluate feedback with `receiving-code-review`.
6. Update documentation with actual test outputs and residual requirements.
7. Stage approved files and commit locally to `main` using `caveman-commit`.
   Do not push.

## SKILLS USED

- `postgres-best-practices` — database dump/restore consistency, foreign keys, and PostGIS verification.
- `security-threat-model` — consult and maintain disaster recovery and evidence integrity threat coverage.
- `security-best-practices` — secure-by-default JSON child report parsing and private diagnostic protection.
- `error-handling-patterns` — strict fail-closed validation and safe diagnostic boundaries.
- `javascript-testing-patterns` — isolated unit and hermetic CLI test suites.
- `requesting-code-review` — dispatch independent implementation review.
- `receiving-code-review` — rigorously evaluate and verify review feedback.
- `caveman-commit` — write concise, standards-compliant local commit message.
