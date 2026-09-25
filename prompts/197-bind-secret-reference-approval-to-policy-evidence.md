# 197 — bind secret-reference approval to policy evidence

## Scope and why this is next

The committed baseline is `6a9b7f2` on `main`. Phase 12K remains open pending operator-owned evidence. Prompt 196 bound Category 2 SMTP approval to a delivery report; Category 3 already requires a rotation report. Category 4 (`secret_references`) still accepts prose alone and only checks that its twelve fields are strings. Require an internally consistent, redacted secret-store policy inventory before Category 4 can be approved. This is one dependency-safe launch gate; do not claim that a JSON report proves live store permissions.

## References and contract

- Read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §13/§22; `docs/launch-checklist.md` §3.4; `docs/operations.md` launch readiness; `docs/security.md` TM-15; `docs/skills.md`; `scripts/ops/check-launch-readiness.js` and its test fixture factory; `infra/launch/readiness.example.json`.
- No visual surface, comp measurement, route, schema, or Next API is involved. The measured contract is exactly `REQUIRED_SECRET_KEYS` (12 names), and the existing permitted indirect-reference forms (`vault:path#key`, `aws-sm:name`, `env:NAME`, `file:/absolute/path`). Use a strict, documented policy report shape rather than guessing at a provider API.
- Operator-created, redacted child JSON: `drill_type: "secret_reference_policy_verification"`, real nonfuture ISO UTC `timestamp`, `status: "success"`, `errors: []`, `policy_reference` (nonempty opaque identifier), and `references` as an object keyed by the twelve exact source-field names. Each entry has `source` (exactly equal to the approved readiness value), `access_verified: true`, and `plaintext_exposed: false`. Require exactly the twelve expected keys; reject extra entries including AI/Gemini sources. Do not store secret values, tokens, policy bodies, or login credentials in evidence.
- Every JSON evidence file in the approved section must satisfy this child contract. Prose alongside a valid child is allowed as context; a dossier, malformed report, or failed report cannot qualify, even beside a valid one or in a wildcard expansion. A custom filename is accepted by content.

## Changes

1. Add `isSecretReferencePolicyCandidate` and `validateSecretReferencePolicyReport` to `scripts/ops/check-launch-readiness.js`, exported for focused tests. Reuse the established timestamp parser and indirect-reference validation where suitable. Validate every approved source as a supported indirect reference, not just a nonempty string, then require at least one child and validate every parsed JSON file for this category. Preserve generic evidence path resolution, wildcard expansion, and existing raw-secret detection. Do not silently normalize a mismatched reference.
2. Update `scripts/ops/check-launch-readiness.spec.js`: replace prose-only approved fixture with a valid temp child report. Cover the valid case, prose-only, missing child, custom path, malformed timestamp, failed status/errors, missing/extra/duplicate or mismatched key, unverified access, plaintext exposure, invalid approved source, wildcard valid-plus-invalid, and dossier beside valid child. Maintain cleanup of temp artifacts.
3. Update `docs/launch-checklist.md` §3.4 with the exact child schema, how to run readiness validation, and the distinction between internally consistent report content and operator proof of live least-privilege policy. Update `docs/operations.md` and `docs/build-plan.md` with actual verification results and remaining operator work.

## Impact, non-goals, rollback

An approved Category 4 now needs a matching secret-store policy child report. The unresolved example remains blocked. No live secret store calls, credentials, new package, runtime secret loading, mail, production change, or AI enablement. Revert this prompt's validator, tests, and documentation changes to roll back.

## Verification and review

Run `node --test scripts/ops/check-launch-readiness.spec.js`, `npm run ops:templates`, `npm run ops:check`, and `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` (expected fail-closed). Run `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check`; inspect the scoped diff. Dispatch independent review through `requesting-code-review` with base SHA, requirements, files, and checks; evaluate through `receiving-code-review`, fix valid findings, and rerun affected checks. Commit only prompt-scoped files locally on `main` with `caveman-commit`. Do not push.

## SKILLS USED

- `deployment-pipeline-design` — preserve the operator approval gate.
- `secrets-management` — require indirect sources and redacted policy evidence.
- `javascript-testing-patterns` — cover success and fail-closed paths.
- `requesting-code-review` — dispatch independent review.
- `receiving-code-review` — evaluate review findings against code.
- `caveman-commit` — write the local commit message.
