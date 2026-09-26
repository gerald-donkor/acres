# 204 — launch readiness record schema

## Scope and why this is next

The committed Phase 12K preflight at `826ed20` identified a repository-owned
gap that precedes operator evidence intake: `infra/launch/readiness.example.json`
declares `"$schema": "./readiness.schema.json"`, but that file does not exist.
`docs/launch-checklist.md` §6A records the dangling reference. The next safe
implementation unit is to supply a structural schema for the existing record,
then verify it against the executable validator. Prompt 201 remains the separate
production evidence and human sign-off step. This prompt does not approve any
category or change the eleven launch gates.

## References and authority

- Re-read `AGENTS.md` §§2–7, 10; `docs/build-plan.md` §13, §14, §22;
  `docs/operations.md` Phase 12K; `docs/launch-checklist.md` §§2–4, 6A, 7;
  `docs/skills.md`; and prompts 201–203. Confirm current code and Git state
  rather than treating a prompt as implementation evidence.
- Inspect the complete `infra/launch/readiness.example.json`, the existing
  `infra/security/sast-triage.schema.json` convention,
  `scripts/ops/check-launch-readiness.js` and its tests, and
  `scripts/ops/check-production-templates.sh`. Resolve every required field
  and null-while-unresolved case from these files before writing the schema.
- There is no static design reference, crop, pixel measurement, responsive
  behavior, or UI route in this step. The measured coverage target is all
  eleven existing section IDs and twelve secret-reference keys; derive those
  lists from the current validator at execution time. The approved gate remains
  11/11 categories with authentic operator evidence and signatures.

## Implementation plan

1. Add `infra/launch/readiness.schema.json` as a standards-compliant JSON
   Schema with an explicit dialect and local, resolvable identity. Prefer the
   repository's established Draft 7 dialect unless inspection reveals a
   concrete compatibility reason otherwise. The schema is an editor and
   structural validation aid. Keep it independent of live filesystem reads,
   clocks, environment variables, secrets, and network access.
2. Describe the top-level `version`, `environment`, `target_architecture`,
   `created_at`, `notes`, and `sections`; require the eleven section objects.
   Define reusable section metadata (`status`, `approver`, `evidence`, `notes`)
   and the category-specific fields using the actual example and validator.
   Permit `null` for fields that are deliberately null in an unresolved record
   (for example an approver or restore date). `status` must distinguish
   `unresolved` and `approved`; do not default it to approval. Express strings,
   booleans, numeric bounds, arrays, object shapes, and exact field names.
   Preserve the existing example's validity as a structural template.
3. Model `deployment_and_rollback.release` with its reviewed source commit,
   current/previous client and server images, and three distinct evidence
   references. Model all twelve `secret_references` keys and the eight data
   retention policy keys. Use shared definitions only where they reduce drift
   without making the category contracts opaque. Reject misspelled category
   and known field names; make an explicit, documented choice on future
   extension fields based on the current validator's behavior.
4. Do **not** encode a local editor schema as production attestation. The
   executable validator continues to own placeholder/secret detection,
   evidence file resolution and content, nonfuture timestamps, target binding,
   cron maximum-gap calculations, live thresholds, cross-category matching,
   human approval, and release image environment checks. If JSON Schema can
   express a simple bound without contradicting the validator, it may do so;
   document the division of responsibility. Never weaken the validator to make
   a record schema-valid.
5. Add a focused repository check that parses and compiles the schema with a
   verified installed validator library, validates the checked-in unresolved
   example, and rejects representative structural defects: absent section,
   wrong section type, misspelled secret key, malformed release object, and
   wrong field type. First inspect direct dependencies and the actual installed
   API; if no suitable direct validator exists, add a pinned direct development
   dependency and update the lockfile. Avoid writing an ad hoc JSON Schema
   interpreter. Wire the check into the existing `ops:check`/template gate only
   after verifying how that gate is structured. The unresolved example must
   still fail `check-launch-readiness.js` as designed.
6. Update `docs/launch-checklist.md` §6A to say the reference resolves and to
   explain the schema/validator distinction. Preserve prompt 201 as historical
   context; its schema-file claim is superseded by the canonical checklist and
   this prompt. Add a dated Phase 12K note in `docs/build-plan.md` and the
   owning operational record in `docs/operations.md` if its current text
   discusses the record structure. No `AGENTS.md` index row is needed.

## Expected impact and non-goals

- The readiness example's local schema pointer resolves, editors can inspect
  all eleven categories, and CI catches structural drift between the example
  and schema. `ops:launch-readiness` remains fail-closed on that example.
- No production target, operator value, host, secret, evidence artifact,
  approver, release image, live drill, deployment, API route, UI, database
  migration, or policy decision is introduced. Do not turn the example into an
  approved sample or change the launch validator's approval criteria.
- Schema rollback is a revert of this repository change; no runtime state or
  production data migration is involved.

## Verification and review

1. Run the focused schema tests and the existing readiness suite. Show that
   the example passes only structural schema validation and that
   `node scripts/ops/check-launch-readiness.js
   infra/launch/readiness.example.json` exits nonzero with all eleven sections
   unresolved. Quote its real category/blocker counts, not a remembered count.
2. Run `npm run ops:templates`, `npm run ops:check`, `npm run lint`,
   `npm run typecheck`, `npm run build`, and `git diff --check`. Quote actual
   outputs and inspect the full diff. Use the root scripts confirmed in
   `package.json`; add and document any new script before invoking it.
3. Dispatch a reviewer subagent under `requesting-code-review` with the
   approved prompt, baseline SHA, changed paths, check outputs, and explicit
   request to compare schema fields with the validator and detect any false
   readiness implication. Evaluate findings under `receiving-code-review`,
   fix valid issues, rerun affected checks, and re-review material changes.
4. Stage only scoped files, inspect the staged diff, and commit locally to
   `main` with `caveman-commit`. Do not push. Report the schema path, the
   structural check command, and the separate command for the full readiness
   decision. Phase 12 and prompt 201 remain open until operator evidence and
   human approvals exist.

## SKILLS USED

- `architecture-patterns` — keep the structural schema separate from the launch decision boundary.
- `nestjs-best-practices` — Phase 12 required skill; verify no Nest runtime change is needed.
- `security-best-practices` — prevent the structural check from being represented as security approval.
- `security-threat-model` — compare the record boundary with the documented production threat model.
- `deployment-pipeline-design` — preserve the operator promotion and sign-off gates.
- `github-actions-templates` — verify existing CI integration if `ops:check` wiring changes.
- `prometheus-configuration` — preserve live telemetry evidence requirements in the record shape.
- `grafana-dashboards` — preserve operator alerting evidence boundaries without dashboard changes.
- `secrets-management` — retain indirect references and prevent secret values in records.
- `sast-configuration` — preserve existing security-scan gate when wiring checks.
- `e2e-testing-patterns` — distinguish schema tests from real launch journeys.
- `playwright` — Phase 12 required skill; confirm no browser work is needed here.
- `javascript-testing-patterns` — write focused schema contract tests.
- `requesting-code-review` — independent diff review after self-verification.
- `receiving-code-review` — verify feedback before applying changes.
- `caveman-commit` — final reviewed local commit.
