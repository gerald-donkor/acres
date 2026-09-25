# 192 — bind secret rotation approval to evidence

## Scope and why this is next

The committed baseline is `7d199ec` on `main`, with a clean worktree at planning time. Phase 12's launch gate remains open pending operator evidence and approval. Prompts 188–190 hardened Category 6 (`backup_and_disaster_recovery`) by validating the scheduled backup cadence against the RPO and binding launch approval to concrete restore and reconciliation child reports. Prompt 191 hardened Category 8 (`volume_encryption`) by binding launch approval to concrete volume encryption child reports.

The next dependency-safe launch readiness gap is Category 3 (`secrets_management`). An approved `secrets_management` record requires `injection_mechanism`, `masking_policy`, `rotation_cadence_days` (≤ 90 days), and `compromise_response_plan`. However, `scripts/ops/check-launch-readiness.js` currently allows an approved `secrets_management` section to pass with narrative-only `evidence` (such as `"Vault agent runtime injection drill completed"`) without referencing an actual child report. In addition, the validator checks `rotation_cadence_days > 0` but fails to enforce the 90-day maximum cadence ceiling required by `docs/launch-checklist.md` §3.3. While `checkEvidenceFile` inspects secret rotation evidence if an operator happens to reference a JSON report, it does not require a report or verify that `secrets_management` launch approval is substantiated by verified child report data.

Bind Category 3 launch approval to a concrete, successful secret rotation child report emitted by `scripts/ops/run-secret-rotation-drill.sh`, and enforce the 90-day rotation cadence ceiling. This continues the fail-closed tightening of Phase 12K's 11-category launch readiness matrix without modifying production services or replacing the operator's responsibility to manage live secret injection, rotation keys, and credential stores.

## References and verified baseline

- Re-read `AGENTS.md` §§2–7 and 10, `docs/build-plan.md` §§13, 19, 21, 22, `docs/operations.md` (Phase 12K, Prompts 184 and 191 records), `docs/launch-checklist.md` Category 3 (§3.3) and §4, `docs/security.md` TM-15, and `docs/skills.md` before execution.
- Inspect `scripts/ops/check-launch-readiness.js` evidence resolution and Category 3 validation; `scripts/ops/check-launch-readiness.spec.js` approved fixture; `scripts/ops/run-secret-rotation-drill.sh` producer and its evidence output; `scripts/ops/run-launch-drills.sh` stage 5 and dossier derivation; `infra/launch/readiness.example.json`; `scripts/ops/check-production-templates.sh`; and root `package.json` before edits.
- The producer `run-secret-rotation-drill.sh` emits a JSON payload with:
  - `drill_type`: `'zero_downtime_secret_rotation_and_compromise_response'`
  - `timestamp`: basic UTC timestamp string (e.g. `'20260925T192220Z'`)
  - `dry_run`: boolean
  - `status`: `'success'` | `'failed'` (`'success'` required)
  - `errors`: array of strings (`errors.length === 0` required)
  - `environment_topology`: object with `live_postgres`, `live_valkey`, `live_api` booleans
  - `tested_secret_classes`: array of 7 secret classes (`session_secret`, `csrf_secret`, `postgres_passwords`, `valkey_password`, `storage_s3_keys`, `smtp_credentials`, `grafana_admin_password`)
  - `steps`: object containing:
    - `session_rollover`: `{ status: 'passed', ... }`
    - `csrf_rollover`: `{ status: 'passed', ... }`
    - `database_rotation`: `{ status: 'passed', ... }`
    - `valkey_rotation`: `{ status: 'passed', ... }`
    - `storage_rotation`: `{ status: 'passed', ... }`
    - `compromise_response`: `{ status: 'passed', ... }`
    - `redaction_audit`: `{ status: 'passed', raw_secrets_masked: true, zero_dev_passwords_detected: true }`
- Stage 5 of `run-launch-drills.sh` runs `run-secret-rotation-drill.sh` and writes `secret-rotation-evidence-<timestamp>.json` into `$EVIDENCE_DIR`. The verified script also supports custom paths via `--evidence-file <file>`. The checked-in example `infra/launch/readiness.example.json` is unresolved and must remain so.
- No static design comp applies. The measurable contract is the producer's actual status, error, tested classes, steps, and redaction audit structure compared against validation time.

## Implementation contract

1. In `scripts/ops/check-launch-readiness.js`:
   - Add `isSecretRotationCandidate({ file, parsed })` helper recognizing candidates by filename pattern (`secret-rotation-evidence-` or `secret-rotation`) or structural markers (`drill_type === 'zero_downtime_secret_rotation_and_compromise_response'`, or `Array.isArray(parsed.tested_secret_classes) && parsed.steps && typeof parsed.steps === 'object'`). Do not accept an arbitrary JSON object or filename alone.
   - Add `validateSecretRotationReport(report, now)` helper:
     - Require a plain object (not null, not array).
     - Require `report.timestamp` to be a valid UTC timestamp in basic (`YYYYMMDDTHHMMSSZ`) or ISO 8601 (`YYYY-MM-DDTHH:mm:ss(\.\d{3})?Z`) format that parses to a finite timestamp not in the future relative to `now`.
     - Require `report.status === 'success'`.
     - Require `Array.isArray(report.errors)` and `report.errors.length === 0`.
     - Require `Array.isArray(report.tested_secret_classes)` containing all 7 required classes:
       `session_secret`, `csrf_secret`, `postgres_passwords`, `valkey_password`, `storage_s3_keys`, `smtp_credentials`, `grafana_admin_password`.
     - Require `report.steps` to be a plain object containing all 7 required steps:
       `session_rollover`, `csrf_rollover`, `database_rotation`, `valkey_rotation`, `storage_rotation`, `compromise_response`, `redaction_audit`.
       Each step object must have `status === 'passed'` (case-insensitive).
     - Require `report.steps.redaction_audit.raw_secrets_masked === true` and `report.steps.redaction_audit.zero_dev_passwords_detected === true`.
2. In `validateReadiness`:
   - Accumulate parsed evidence files from `sections.secrets_management` into a `secretEvidence` array:
     `if (sectionName === 'secrets_management') secretEvidence.push(...parsedFiles);`
   - In Category 3.3 (`secrets_management`):
     - Enforce `rotation_cadence_days`: must be a positive safe number `<= 90`:
       `if (typeof secMgmt.rotation_cadence_days !== 'number' || !Number.isFinite(secMgmt.rotation_cadence_days) || secMgmt.rotation_cadence_days <= 0 || secMgmt.rotation_cadence_days > 90) { addBlocker('secrets_management', 'Rotation cadence (in days) must be a positive number <= 90 days (received: ' + secMgmt.rotation_cadence_days + ')'); }`
     - Filter `secretEvidence` with `isSecretRotationCandidate`.
     - If no candidate report exists, add blocker:
       `'A successful secret rotation child JSON report is required'`
     - Validate all candidate reports with `validateSecretRotationReport(parsed, now)`. If any candidate report fails or is malformed, add blocker:
       `'A referenced secret rotation report is invalid or failed'`
     - Ensure that every candidate in evidence is validated: a failed or malformed report blocks approval even beside a valid one or inside a wildcard match.
3. Use the validator's existing injected `options.now` for deterministic date testing and default to real current time for CLI use. Bound diagnostics to generic Category 3 messages: do not leak filesystem paths or credentials in blocker strings.
4. In `scripts/ops/check-launch-readiness.spec.js`:
   - Create a temporary valid secret rotation fixture file (`secret-rotation-evidence-valid.json`) in the existing fixture directory with valid basic timestamp `'20260828T120000Z'`, `drill_type: 'zero_downtime_secret_rotation_and_compromise_response'`, `dry_run: true`, `status: 'success'`, `errors: []`, all 7 `tested_secret_classes`, and all 7 steps passed including redaction audit flags.
   - Update `buildValidApprovedRecord().sections.secrets_management.evidence` to reference `secretRotationFixturePath`.
   - Add test cases covering:
     - Prose-only or empty evidence in approved `secrets_management` blocks approval.
     - Unified dossier alone or arbitrary JSON with a secret-rotation-like filename blocks approval.
     - Child report with `status: 'failed'` or non-empty `errors` blocks approval.
     - Child report missing any of the 7 required steps or reporting a failed step blocks approval.
     - Child report failing redaction audit (`raw_secrets_masked: false` or `zero_dev_passwords_detected: false`) blocks approval.
     - Child report missing required secret classes blocks approval.
     - Child report with invalid or future timestamp blocks approval.
     - Wildcard or multiple evidence files containing a failed report alongside a valid one blocks approval.
     - Rotation cadence > 90 days or non-positive blocks approval.
     - Valid report at an arbitrary custom path passes.
     - Unrelated approved categories remain unaffected.
     - Helper functions edge cases.
5. Update `docs/operations.md`, `docs/launch-checklist.md` Category 3, and the Phase 12 verification record in `docs/build-plan.md` with the accepted secret rotation child-report contract, verification results, and operator responsibilities. Keep `infra/launch/readiness.example.json` unresolved with empty evidence. No new `AGENTS.md` index row is needed.

## Impact, non-goals, and rollback

- No application routes, database schemas, UI components, background workers, or production Compose configs change. Only launch readiness evidence validation, test fixtures, and operations documentation change.
- An approved readiness record that previously relied only on prose evidence will now fail closed until its actual successful child report is referenced.
- This prompt validates consistency of an operator-supplied JSON report; it does not replace the operator's duty to manage actual secret stores (Vault/AWS SM/Infisical), rotate keys in production, or verify log redaction.
- Rollback: revert the Category 3 evidence validator in `scripts/ops/check-launch-readiness.js`, the test updates in `check-launch-readiness.spec.js`, and documentation changes.

## Verification and review

1. Re-read this approved prompt and load every named skill before code.
2. Run `npm run ops:readiness-test`, `npm run ops:templates`, and `npm run ops:check`; quote the real output.
3. Run `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` and confirm it fails closed as expected.
4. Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
5. Dispatch a reviewer subagent via `requesting-code-review` after self-verification. Evaluate feedback using `receiving-code-review`, verify claims, fix verified issues, and rerun affected checks.
6. Record implementation and results in owning documentation, and commit prompt-scoped files locally on `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `deployment-pipeline-design` — maintain strict separation between automated pipeline gates, child drill artifacts, and operator launch sign-off.
- `secrets-management` — ensure secret rotation diagnostics and test fixtures do not expose credentials, secret references, or keys.
- `javascript-testing-patterns` — build deterministic file-based positive and negative tests with temporary fixtures.
- `requesting-code-review` — dispatch the required implementation review after self-verification.
- `receiving-code-review` — evaluate and verify review feedback with technical rigor.
- `caveman-commit` — write the required local commit message upon completion.
