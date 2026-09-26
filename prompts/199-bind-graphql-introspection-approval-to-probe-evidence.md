# 199 — bind graphql-introspection approval to probe evidence

## Scope and why this is next

The committed baseline is `21350be` on `main`. Phase 12K remains open pending operator-owned evidence and hardening of the remaining checklist categories. Prompt 198 bound Category 7 (`data_retention_policy`) to structured child policy evidence. Category 9 (`graphql_introspection`) currently accepts prose alone in `evidence` and only checks that `production_introspection_enabled` is a boolean and that `justification` is present if enabled. It does not validate that an actual route probe was executed against the production GraphQL endpoint and does not require an internally consistent, structured GraphQL introspection probe child JSON report in `evidence`. Require this structured child evidence before Category 9 can be approved. This is one dependency-safe launch gate; do not claim that a JSON report substitutes for an actual live production route probe or security audit.

## References and contract

- Read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §13/§22; `docs/launch-checklist.md` §3.9; `docs/operations.md` launch readiness and GraphQL introspection policy; `docs/security.md` TM-11/TM-12; `docs/skills.md`; `scripts/ops/check-launch-readiness.js` and its test fixture factory; `infra/launch/readiness.example.json`.
- The contract specifies:
  - `production_introspection_enabled`: explicit boolean (`true` or `false`).
  - If `production_introspection_enabled === true`, non-empty string `justification` required (and no placeholders like `__REQUIRED_`).
  - If `production_introspection_enabled === false`, `justification` is optional / advisory, but if present must not contain unresolved placeholders.
- Operator-created / probe child JSON report:
  - `drill_type: "graphql_introspection_probe"`
  - real nonfuture ISO UTC `timestamp` (validated via `parseSmtpTimestamp` or standard ISO UTC parser, `<= now`)
  - `status: "success"`
  - `errors: []`
  - `endpoint`: string matching `/graphql` (or absolute URL path ending with `/graphql`)
  - `production_introspection_enabled`: boolean, strictly matching `approved.production_introspection_enabled`
  - `probe_result`: object with exactly four properties:
    - `status_code`: positive integer HTTP status code (e.g. 400 when disabled, 200 when enabled)
    - `introspection_permitted`: boolean, strictly matching `approved.production_introspection_enabled`
    - `schema_exposed`: boolean, `false` when `production_introspection_enabled: false`, `true` when `production_introspection_enabled: true`
    - `response_summary`: non-empty string describing the probe response (e.g. `"GraphQL introspection is not allowed by Apollo Server"`)
  - Exactly the seven top-level properties: `['drill_type', 'endpoint', 'errors', 'probe_result', 'production_introspection_enabled', 'status', 'timestamp']`.
  - Zero placeholders (`__REQUIRED_`) and zero client secrets (`checkPlaceholdersAndSecrets`).
- Consistency rules:
  - When `production_introspection_enabled === false`:
    - `probe_result.introspection_permitted === false`
    - `probe_result.schema_exposed === false`
  - When `production_introspection_enabled === true`:
    - `probe_result.introspection_permitted === true`
    - `probe_result.schema_exposed === true`
- Every JSON evidence file referenced in an approved Category 9 section must satisfy this child contract. Prose alone, a dossier alone, or a malformed/failed report cannot qualify, even beside a valid child or in a wildcard expansion. A custom filename is accepted by content.

## Changes

1. Add `isGraphqlIntrospectionCandidate` and `validateGraphqlIntrospectionReport` to `scripts/ops/check-launch-readiness.js`, exported for unit tests.
2. In `scripts/ops/check-launch-readiness.js`:
   - In section evidence scanning, push parsed files for `graphql_introspection` into `graphqlEvidence`.
   - In Category 9 validation:
     - Filter `graphqlEvidence` using `isGraphqlIntrospectionCandidate`.
     - If no candidates exist, add blocker: `'A successful GraphQL introspection probe child JSON report is required'`.
     - If any candidate fails `validateGraphqlIntrospectionReport(parsed, now, gqlSec)`, add blocker: `'A referenced GraphQL introspection report is invalid or failed'`.
3. Update `scripts/ops/check-launch-readiness.spec.js`:
   - Add a valid GraphQL introspection probe report fixture and helper.
   - Update `buildValidApprovedRecord()` to use the child fixture path in `graphql_introspection.evidence`.
   - Move existing static integrity tests that attached generic files to `graphql_introspection` to attach to `optional_ai_posture` instead.
   - Add comprehensive unit tests covering:
     - Fully valid approved GraphQL introspection report (disabled, default);
     - Fully valid approved GraphQL introspection report (enabled with valid justification);
     - Missing or empty justification when enabled;
     - Prose-only evidence rejection;
     - Missing child evidence rejection;
     - Custom report path acceptance;
     - Malformed timestamp (invalid date, future date);
     - Failed status or non-empty errors;
     - Missing or invalid endpoint;
     - Mismatched `production_introspection_enabled` between report and approved record;
     - Contradictory `probe_result` (e.g. `schema_exposed: true` when `production_introspection_enabled: false`);
     - Missing or extra keys in report or `probe_result`;
     - Wildcard matches with mixed valid and invalid reports;
     - Dossier alone or dossier alongside valid child report.
4. Update `docs/launch-checklist.md` §3.9 with the exact child report schema, acceptance criteria, and operator guidance.
5. Update `docs/operations.md` and `docs/build-plan.md` recording verification results and outstanding operator tasks.

## Impact, non-goals, rollback

An approved Category 9 now requires a matching structured GraphQL introspection probe child report. The unresolved example remains blocked. No Apollo server configuration changes, database schema changes, or AI enablement. Revert this prompt's validator, test, and documentation changes to roll back.

## Verification and review

Run `node --test scripts/ops/check-launch-readiness.spec.js`, `npm run ops:templates`, `npm run ops:check`, and `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` (expected fail-closed). Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`. Inspect the scoped diff. Dispatch independent review through `requesting-code-review` subagent with base SHA, requirements, files, and checks; evaluate through `receiving-code-review`, fix any valid findings, and re-verify. Commit only prompt-scoped files locally on `main` with `caveman-commit`. Do not push.

## SKILLS USED

- `deployment-pipeline-design` — maintain fail-closed release gates.
- `javascript-testing-patterns` — cover valid, invalid, and edge cases.
- `security-best-practices` — enforce GraphQL attack surface reduction and probe verification.
- `requesting-code-review` — dispatch independent reviewer subagent.
- `receiving-code-review` — evaluate reviewer findings with technical rigor.
- `caveman-commit` — construct concise conventional commit message.
