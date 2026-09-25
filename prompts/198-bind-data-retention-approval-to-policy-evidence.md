# 198 — bind data-retention approval to policy evidence

## Scope and why this is next

The committed baseline is `b435512` on `main`. Phase 12K remains open pending operator-owned evidence and hardening of the remaining checklist categories. Prompt 197 bound Category 4 (`secret_references`) to structured child policy evidence. Category 7 (`data_retention_policy`) currently accepts prose alone in `evidence` and only checks that its eight policy fields are non-empty strings. It does not validate specific required retention windows (quarantine 7d, rejected 1d, export 30d, telemetry 15d, backup 30d, and valid account/audit/report windows) and does not require an internally consistent, structured retention policy review child JSON report in `evidence`. Require this structured child evidence and window validation before Category 7 can be approved. This is one dependency-safe launch gate; do not claim that a JSON report substitutes for actual legal/operator policy governance and automated purge verification.

## References and contract

- Read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §13/§22; `docs/launch-checklist.md` §3.7; `docs/operations.md` launch readiness and data retention policy; `docs/security.md` TM-12; `docs/skills.md`; `scripts/ops/check-launch-readiness.js` and its test fixture factory; `infra/launch/readiness.example.json`.
- The contract specifies eight required retention policies (`REQUIRED_RETENTION_KEYS`):
  1. `account_retention_policy`: positive duration in days (e.g. `^\d+d$`, `365d`) or valid policy string;
  2. `audit_retention_policy`: positive duration in days (e.g. `^\d+d$`, `730d`);
  3. `upload_quarantine_retention_policy`: exactly `7d`;
  4. `rejected_object_retention_policy`: exactly `1d`;
  5. `export_retention_policy`: exactly `30d`;
  6. `report_retention_policy`: `indefinite_until_tenant_deletion` or positive duration in days (`^\d+d$`);
  7. `telemetry_retention_policy`: exactly `15d`;
  8. `backup_retention_policy`: exactly `30d`.
- Operator-created child JSON report:
  - `drill_type: "data_retention_policy_verification"`
  - real nonfuture ISO UTC `timestamp`
  - `status: "success"`
  - `errors: []`
  - `policy_reference`: non-empty opaque string identifier
  - `scheduled_cleanup_verified: true`
  - `retention_windows`: object keyed by all eight exact `REQUIRED_RETENTION_KEYS`. Each entry must be an object with `window` matching the approved section value and `policy_verified: true`, with exactly two properties.
  - Exactly the seven top-level properties: `['drill_type', 'errors', 'policy_reference', 'retention_windows', 'scheduled_cleanup_verified', 'status', 'timestamp']`.
  - Zero placeholders (`__REQUIRED_`) and zero client secrets.
- Every JSON evidence file referenced in an approved Category 7 section must satisfy this child contract. Prose alone, a dossier alone, or a malformed/failed report cannot qualify, even beside a valid child or in a wildcard expansion. A custom filename is accepted by content.

## Changes

1. Add `REQUIRED_RETENTION_KEYS`, `isDataRetentionPolicyCandidate`, and `validateDataRetentionPolicyReport` to `scripts/ops/check-launch-readiness.js`, exported for unit tests.
2. In `scripts/ops/check-launch-readiness.js`:
   - In section evidence scanning, push parsed files for `data_retention_policy` into `retentionEvidence`.
   - In Category 7 validation:
     - Enforce standard window rules for `upload_quarantine_retention_policy` (`7d`), `rejected_object_retention_policy` (`1d`), `export_retention_policy` (`30d`), `telemetry_retention_policy` (`15d`), `backup_retention_policy` (`30d`), `account_retention_policy` (positive days or recognized policy), `audit_retention_policy` (positive days), and `report_retention_policy` (`indefinite_until_tenant_deletion` or positive days).
     - Filter `retentionEvidence` using `isDataRetentionPolicyCandidate`.
     - If no candidates exist, add blocker: `'A successful data retention policy child JSON report is required'`.
     - If any candidate fails `validateDataRetentionPolicyReport(parsed, now, retSec)`, add blocker: `'A referenced data retention policy report is invalid or failed'`.
3. Update `scripts/ops/check-launch-readiness.spec.js`:
   - Add a valid data retention policy report fixture and helper.
   - Update `buildValidApprovedRecord()` to use the child fixture path in `data_retention_policy.evidence`.
   - Update existing static integrity tests that attached generic files to `data_retention_policy` to attach to `graphql_introspection` instead.
   - Add comprehensive unit tests covering:
     - Fully valid approved data retention policy report;
     - Prose-only evidence rejection;
     - Missing child evidence rejection;
     - Custom report path acceptance;
     - Malformed timestamp (invalid date, future date);
     - Failed status or non-empty errors;
     - Missing or empty `policy_reference`;
     - `scheduled_cleanup_verified: false`;
     - Invalid fixed retention windows (`upload_quarantine_retention_policy !== '7d'`, etc.);
     - Invalid window formats (`account_retention_policy: 'forever'`, negative numbers);
     - Missing or extra retention keys in report;
     - Mismatched window between report and approved record;
     - `policy_verified: false` in report;
     - Wildcard matches with mixed valid and invalid reports;
     - Dossier alone or dossier alongside valid child report.
4. Update `docs/launch-checklist.md` §3.7 with the exact child report schema, acceptance criteria, and operator guidance.
5. Update `docs/operations.md` and `docs/build-plan.md` recording verification results and outstanding operator tasks.

## Impact, non-goals, rollback

An approved Category 7 now requires validated retention windows and a matching structured retention policy child report. The unresolved example remains blocked. No database schema changes, runtime worker scheduler changes, production deletions, or AI enablement. Revert this prompt's validator, test, and documentation changes to roll back.

## Verification and review

Run `node --test scripts/ops/check-launch-readiness.spec.js`, `npm run ops:templates`, `npm run ops:check`, and `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` (expected fail-closed). Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`. Inspect the scoped diff. Dispatch independent review through `requesting-code-review` subagent with base SHA, requirements, files, and checks; evaluate through `receiving-code-review`, fix any valid findings, and re-verify. Commit only prompt-scoped files locally on `main` with `caveman-commit`. Do not push.

## SKILLS USED

- `deployment-pipeline-design` — maintain fail-closed release gates.
- `javascript-testing-patterns` — cover valid, invalid, and edge cases.
- `security-best-practices` — enforce data retention limits and audit trails.
- `requesting-code-review` — dispatch independent reviewer subagent.
- `receiving-code-review` — evaluate reviewer findings with technical rigor.
- `caveman-commit` — construct concise conventional commit message.
