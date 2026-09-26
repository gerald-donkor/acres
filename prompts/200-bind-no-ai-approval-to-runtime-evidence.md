# 200 — bind no-AI approval to runtime evidence

## Scope and why this is next

The committed baseline is `1228f58` on `main`. Phase 12K remains open for operator-owned launch evidence. Prompts 187–199 made the first ten readiness categories require structured child reports, but Category 11 (`optional_ai_posture`) still accepts prose asserting that the production API and worker have AI disabled, no Gemini key, and that core no-AI journeys work. This prompt closes that last validator gap. It does not manufacture production proof or approve launch.

## References and contract

- Read `AGENTS.md` §§2–7 and 10, `docs/build-plan.md` §13/§22, `docs/launch-checklist.md` §3.11, `docs/operations.md` launch readiness, `docs/ai.md` §7, `docs/security.md` TM-14, `docs/skills.md`, the readiness validator and tests, and `infra/launch/readiness.example.json`.
- Static visual references, crops, breakpoints, and pixel measurements do not apply: this is an operations-only JSON gate with no UI change.
- An approved Category 11 requires a concrete JSON child report referenced in `evidence`. The report has:
  - `drill_type: "no_ai_production_posture_verification"`, a real nonfuture ISO UTC `timestamp`, `status: "success"`, and `errors: []`;
  - `environment: "production"`;
  - `runtime` objects for both `api` and `worker`, each with `ai_draft_enabled: false`, `gemini_api_key_present: false`, and a nonempty `inventory_reference` pointing to a redacted runtime environment inventory;
  - `journeys` entries for `analytics_dashboard`, `governed_report`, and `export_download`, each with `passed: true` and a nonempty `test_reference` pointing to run evidence;
  - `unpaid_provider_excluded: true`, with a nonempty `provider_policy_reference` identifying the approved production policy.
- Reject unknown/missing fields within the child schema where practical, any placeholders or literal secrets, failed or contradictory values, nonproduction evidence, missing references, future/invalid times, and a dossier/prose alone. Every referenced Category 11 JSON child must pass, including mixed wildcard matches; content determines candidacy, not filename. The report is operator-supplied attestation and pointers, not direct proof of a live environment. Preserve the existing fatal `ai_enabled: true` policy and all existing record-level checks.

## Changes

1. Add a Category 11 candidate and validator in `scripts/ops/check-launch-readiness.js`, using existing UTC parsing and evidence scanning conventions. Collect referenced Category 11 parsed files and block approval without a valid child or if any referenced child is invalid. Ensure a generic dossier does not qualify.
2. Update `scripts/ops/check-launch-readiness.spec.js` with a valid child fixture used by the fully approved record. Move generic evidence-scanning tests that currently borrow Category 11 to another suitable category so they continue to test their intended behavior. Cover valid child, prose/dossier-only, custom path, missing and extra fields, invalid/future time, failed status/errors, API/worker contradictions, incomplete or failed journeys, missing references, and mixed wildcard valid/invalid children. Preserve the existing AI policy tests.
3. Update `docs/launch-checklist.md` §3.11 with the exact child contract and the operator's live verification obligations. Record the implementation and remaining operator-owned proof in `docs/operations.md`, `docs/ai.md`, and `docs/build-plan.md` §22 as appropriate. Keep the checked-in example unresolved.

## Impact, non-goals, rollback

Approved Category 11 records must reference a passing no-AI child report. The production AI feature flag and service behavior are unchanged. No Gemini enablement, new API, runtime deployment, or launch sign-off. Reverting this prompt's validator, tests, and documentation restores the previous prose-based gate.

## Verification and review

Run `node --test scripts/ops/check-launch-readiness.spec.js`, `npm run ops:templates`, `npm run ops:check`, and the checked-in example validator (expected fail-closed). Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`. Inspect the scoped diff. Dispatch a read-only reviewer subagent with base SHA, prompt, files, and outputs; verify and fix valid findings and re-review if significant. Commit only prompt-scoped files locally on `main` using `caveman-commit`; do not push. Report exact steps for an operator to inspect the result.

## SKILLS USED

- `deployment-pipeline-design` — fail-closed launch gate structure.
- `javascript-testing-patterns` — behavior and edge-case coverage.
- `security-best-practices` — secret-safe evidence validation.
- `requesting-code-review` — independent review dispatch.
- `receiving-code-review` — verify review feedback before fixes.
- `caveman-commit` — concise conventional commit message.
