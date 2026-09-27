# 215 — production no-AI posture evidence

## Scope and why this is next

The committed baseline is `6f29a638b735b80d68a153b54b54b503a8073d17`
on `main`. Phase 12K remains at its operator-owned exit gate (`docs/build-plan.md`
§§13, 14, 22). Prompts 205–214 assessed checklist Categories 1–10 without
production proof; Category 11, `optional_ai_posture`, is the earliest remaining
independent evidence unit. Assess the actual production no-AI configuration,
provider policy, and deterministic product journeys against the existing
contract. If operator evidence is unavailable, record a dated, specific
Category 11 blocker in `docs/launch-checklist.md` and leave it unresolved.
Prompt 201 continues to own the eleven-category launch decision.

## References and acceptance contract

- Re-read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §§13, 14, 22;
  `docs/launch-checklist.md` §§2, 3.11, 4, 6A, 7; `docs/operations.md` Phase
  12K and the no-AI launch policy; `docs/ai.md` §7; `docs/security.md` TM-14;
  `docs/system-architecture.md` production no-AI boundary; `docs/skills.md`;
  prompts 200–204, 201's sign-off procedure, and 205–214. Reconcile all
  records with Git, current code, and any supplied operator evidence.
- Inspect `infra/launch/readiness.example.json` and its schema,
  `scripts/ops/check-launch-readiness.js` (especially
  `validateNoAiPostureReport` and `optional_ai_posture`) and its tests,
  `scripts/ops/launch-readiness.sh`, `scripts/ops/run-launch-drills.sh`,
  `server/src/config/env.validation.ts`, AI provider/route gating, production
  Compose/env templates, and `client/e2e/product-journeys.spec.ts`. Resolve
  commands and fields from current code at execution time. The checked-in
  example and local mocked Playwright journeys are not production evidence.
- No visual surface, static comp, crop, pixel measurement, breakpoint, or UI
  route changes. The measurable contract is separate production API and worker
  runtime assertions, three passing production no-AI journeys, one approved
  provider policy, one valid child JSON report, and a dated product/security
  decision. Validator booleans are acceptance checks, not observations.

## Preconditions and operator handoff

1. Confirm branch, HEAD, worktree, and the unresolved example. Preserve
   unrelated changes. Search approved repository paths for a materialized
   readiness record and redacted Category 11 references. Absence in Git does
   not prove absence from the restricted operator store.
2. Obtain through the approved operator channel the selected production
   deployment and release identity, restricted evidence-store location,
   product and security leads, redacted API and worker runtime inventories,
   production unpaid-provider exclusion policy and sign-off, plus run records
   for `analytics_dashboard`, `governed_report`, and `export_download`.
   Request opaque references and read-only inspection access. Do not request
   or print raw environment dumps, keys, tokens, tenant data, connection
   strings, or unredacted inventory. A variable-name/presence assertion is
   enough to check key absence; never retrieve a value.
3. Confirm the test target, tenant/data permissions, and whether the three
   journeys are safe to run on production. Dashboard reads may be read-only;
   governed report and export flows can create durable tenant records or
   artifacts. Reuse operator-authorized existing run evidence if available;
   fresh production writes/downloads require the named operator's exact
   target, account, permitted actions, and cleanup authorization. This prompt
   does not itself authorize mutations in a live tenant.
4. If any selected target, redacted inventory, provider policy, production
   journey evidence, child report, or dated human decision is missing, keep
   Category 11 `unresolved`. Name each missing input and its owner in the
   checklist. Do not generate synthetic passing production artifacts or set
   approval booleans based on repository defaults.

## Evidence and decision procedure

1. Independently inspect redacted runtime inventories for the exact deployed
   API and worker instances/images. Confirm `AI_DRAFT_ENABLED=false` for both,
   `GEMINI_API_KEY` absent from both runtime environments and secret mounts,
   and no unpaid Gemini provider provisioned to either. Compare the selected
   release identity with Category 10 if one exists; record a mismatch as a
   blocker. A default in `env.validation.ts`, a template omitting the key, or
   a readiness-record declaration cannot establish the live state. Verify
   production policy explicitly excludes the unpaid Gemini Developer API.
2. Inspect actual production no-AI run records for the three exact journeys:
   analytics/dashboard read, governed report/revision flow, and export request
   through authorized artifact download. Confirm each ran against the selected
   deployed environment and tenant, passed with the AI feature disabled, used
   deterministic service paths, and has a timestamp, runner/approver, result,
   and redacted trace or request/artifact reference. Treat local Playwright
   mocks, unit tests, staging, and a seven-stage drill dossier as supporting
   regression evidence only. Do not infer a production result from them.
3. Validate every referenced Category 11 child report, including wildcard
   matches, against the current `validateNoAiPostureReport` contract. It must
   have exactly `drill_type`, `timestamp`, `status`, `errors`, `environment`,
   `runtime`, `journeys`, `unpaid_provider_excluded`, and
   `provider_policy_reference`; use
   `drill_type: "no_ai_production_posture_verification"`, real nonfuture ISO UTC
   timestamp, `status: "success"`, `errors: []`, and
   `environment: "production"`. `runtime` must have exactly `api` and
   `worker`, each with `ai_draft_enabled: false`,
   `gemini_api_key_present: false`, and a nonempty redacted
   `inventory_reference`. `journeys` must have exactly
   `analytics_dashboard`, `governed_report`, and `export_download`, each with
   `passed: true` and nonempty `test_reference`. Require
   `unpaid_provider_excluded: true` and a nonempty
   `provider_policy_reference`. Reject placeholders, secret contents, extra or
   missing fields, failed reports mixed into wildcards, prose, or a generic
   dossier alone. A structurally valid report points to evidence; inspect
   that evidence independently before approval.
4. If all underlying facts and product/security approval exist, update only
   the operator-owned materialized readiness record's Category 11: set
   `status: "approved"`, `ai_enabled: false`,
   `no_ai_path_verified: true`, `server_ai_draft_enabled_false: true`,
   `no_gemini_api_key_provisioned: true`, `unpaid_provider_excluded: true`,
   the accurate nonempty `phase11_status`, named `approver`, and safe evidence
   references including the child JSON. Run the schema and executable
   readiness validator in the selected operator environment. Assess Category
   11 blockers separately from the expected aggregate launch failure while
   other categories remain unresolved. Do not edit the checked-in example
   into a purported production record.
5. Record the dated Category 11 decision in `docs/launch-checklist.md` §3.11:
   reviewed source commit, selected release identity in redacted form, what
   was independently inspected, missing facts or approved evidence pointers,
   responsible product/security lead, and next safe action. Update
   `docs/operations.md` or `docs/build-plan.md` only if their implemented-state
   record needs a verified correction. Keep restricted raw reports and the
   signed readiness record outside Git unless a reviewed redacted artifact is
   expressly approved for inclusion. Prompt 201 and all other categories
   retain their separate exit gates.

## Scope boundaries and rollback

- Do not change AI provider code, feature flags, runtime configuration,
  production secrets, deployment, API/client journeys, validator, schema, or
  tests merely to obtain approval. A real implementation defect gets a
  separate scoped prompt. Do not enable Gemini or treat a disabled-by-default
  code path as proof of a production deployment.
- Do not run a mutating report/export journey on a live tenant without the
  named operator's target and action authorization. Do not create a hand-authored
  passing report to replace missing runtime or journey observations.
- A mistaken checklist assessment can be reverted as a scoped documentation
  commit. Preserve the fail-closed validator and restricted operator evidence.

## Verification, review, and completion

1. Quote actual outputs and exit codes for `npm run
   ops:readiness-schema-test`, `node --test
   scripts/ops/check-launch-readiness.spec.js`, `node
   scripts/ops/check-launch-readiness.js
   infra/launch/readiness.example.json` (expected fail-closed), `npm run
   ops:templates`, `npm run ops:check`, `npm run lint`, `npm run typecheck`,
   `npm run build`, and `git diff --check`. Use the repository formatting
   check if one exists; otherwise inspect Markdown directly. Run
   operator-record checks only if a real record is supplied. State any
   environmental failure precisely rather than calling it a pass.
2. Inspect the scoped diff, including secret/identifier leakage. Dispatch an
   independent read-only reviewer subagent with `requesting-code-review`,
   BASE_SHA/HEAD_SHA, contract, files, checks, and the distinction between
   report consistency and production proof. Evaluate findings with
   `receiving-code-review`; fix verified issues, re-run affected checks, and
   re-review material changes.
3. Stage only prompt-scoped documentation and any expressly approved redacted
   record, inspect the staged diff, and commit locally to `main` with
   `caveman-commit`; do not push. Report Category 11 state, other remaining
   gates, and the exact operator readiness command.

## SKILLS USED

- `deployment-pipeline-design` — keep production evidence and human sign-off
  distinct from static and drill gates.
- `security-best-practices` — inspect redacted runtime/key-absence evidence
  without exposing secrets or claiming unseen protections.
- `e2e-testing-patterns` — distinguish real production journey evidence from
  local mocked browser regressions.
- `javascript-testing-patterns` — interpret the existing Node readiness
  validator and its focused suite.
- `requesting-code-review` — dispatch independent review after self-checks.
- `receiving-code-review` — verify reviewer feedback against the contract.
- `caveman-commit` — write the required local commit message.
