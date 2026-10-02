# Phase 12K follow-up — export and test evidence glob, timestamp, and reference validation helpers

## Scope and why this is next

Finalize the launch readiness validation modularization across `scripts/ops/check-launch-readiness.js` by exporting all remaining internal helpers and constants, hardening input parameter guards, and establishing comprehensive unit and contract test coverage in `scripts/ops/check-launch-readiness.spec.js`.

Following Prompts 246–252:
- Categories 1–11 now enforce unified candidate discrimination, dedicated dossier validators, hardened supply chain inspection, fail-closed category boundaries, and deployment release provenance contracts.
- A remaining set of internal utility functions and constants in `scripts/ops/check-launch-readiness.js` remained unexported and lacked isolated unit test coverage:
  - File reference and glob expansion: `isEvidenceFileReference`, `expandEvidenceGlob`
  - Timestamp and UTC date parsers: `parseUtcDate`, `parseRestoreTimestamp`, `parseSecretRotationTimestamp`, `parseSmtpTimestamp`
  - Host volume path and section validators: `validVolumePath`, `validVolumePaths`, `validVolumeSection`
  - Reference and transport validators: `isRotationReference`, `validSmtpText`, `validSmtpEmail`, `validSmtpSecretReference`
  - Schema shape and endpoint helpers: `isValidGraphqlEndpoint`, `hasExactKeys`
  - Observation and journey constants: `DEPLOYMENT_OBSERVATIONS`, `NO_AI_JOURNEYS`
- In `expandEvidenceGlob`, non-string or empty `ref` inputs could throw a `TypeError` on `ref.includes('*')`. Adding an early guard `if (typeof ref !== 'string' || ref.length === 0) return [];` ensures robust fail-safe behavior.
- In `parseUtcDate`, non-string `value` inputs could cause unexpected regex execution. Adding an early guard `if (typeof value !== 'string') return null;` ensures type safety.
- Adding dedicated unit tests for these primitives verifies edge cases including null/undefined inputs, malformed types, non-UTC dates, control characters, placeholder strings, and path traversal or multi-glob patterns.

This is a repository-owned, dependency-safe hardening and maintenance step within Phase 12K. Prompt 201 still governs real production evidence collection and sign-off.

Planning baseline: clean worktree at commit `b7ac432` (`fix(ops): unify deployment evidence contracts`).

## References read and execution prerequisites

Planning read:
- `AGENTS.md` phase-control, workflow, prompt, product, and standing rules
- `docs/build-plan.md` Phase 12 and Phase 12K (prompts 246–252)
- `docs/skills.md`
- `docs/system-architecture.md` §11–12
- `docs/security.md` TM-01, TM-04, TM-05, TM-15, and Phase 12K evidence integrity
- `docs/operations.md` Phase 12K and prompts 246–252
- `docs/launch-checklist.md` Categories 1–11
- `prompts/201-production-launch-evidence-and-signoff.md`

Code inspected:
- `scripts/ops/check-launch-readiness.js` (`expandEvidenceGlob`, `isEvidenceFileReference`, `parseUtcDate`, `parseRestoreTimestamp`, `parseSecretRotationTimestamp`, `parseSmtpTimestamp`, `validVolumePath`, `validVolumePaths`, `validVolumeSection`, `isRotationReference`, `validSmtpText`, `validSmtpEmail`, `validSmtpSecretReference`, `isValidGraphqlEndpoint`, `hasExactKeys`, `DEPLOYMENT_OBSERVATIONS`, `NO_AI_JOURNEYS`, `module.exports`)
- `scripts/ops/check-launch-readiness.spec.js`

## Non-goals

- Modifying runtime server, client, or worker business logic.
- Altering production Docker or Caddy configurations.
- Fabricating production drill evidence or signing off on launch readiness without operator execution.

## Measurable requirements and implementation plan

### 1. Robust input guards and exports in `scripts/ops/check-launch-readiness.js`

1. In `expandEvidenceGlob`, add defensive check:
   ```javascript
   if (typeof ref !== 'string' || ref.length === 0) return [];
   ```
2. In `parseUtcDate`, add defensive check:
   ```javascript
   if (typeof value !== 'string') return null;
   ```
3. Export the following functions and constants in `module.exports`:
   - `isEvidenceFileReference`
   - `expandEvidenceGlob`
   - `parseUtcDate`
   - `parseRestoreTimestamp`
   - `parseSecretRotationTimestamp`
   - `parseSmtpTimestamp`
   - `validVolumePath`
   - `validVolumePaths`
   - `validVolumeSection`
   - `isRotationReference`
   - `validSmtpText`
   - `validSmtpEmail`
   - `validSmtpSecretReference`
   - `isValidGraphqlEndpoint`
   - `hasExactKeys`
   - `DEPLOYMENT_OBSERVATIONS`
   - `NO_AI_JOURNEYS`

### 2. Unit and contract test suite in `scripts/ops/check-launch-readiness.spec.js`

Add dedicated unit test suites covering:
1. `isEvidenceFileReference`:
   - Accepts `.json` and wildcard `*...json` references.
   - Rejects non-strings, empty/whitespace strings, and non-json extensions.
2. `expandEvidenceGlob`:
   - Handles non-string/empty `ref` cleanly returning empty array `[]`.
   - Resolves exact existing files.
   - Expands single-`*` wildcards across existing files matching prefix and suffix.
   - Rejects multiple-`*` patterns or non-existent directories.
3. Timestamp parsers (`parseUtcDate`, `parseRestoreTimestamp`, `parseSecretRotationTimestamp`, `parseSmtpTimestamp`):
   - Accepts valid basic compact UTC timestamps (`YYYYMMDDTHHMMSSZ`).
   - Accepts valid ISO 8601 UTC timestamps (with and without millis).
   - Rejects non-string values, malformed dates (e.g. invalid month/day/leap-year), non-UTC offsets, and invalid formats.
4. Volume validation helpers (`validVolumePath`, `validVolumePaths`, `validVolumeSection`):
   - `validVolumePath`: accepts clean untrimmed paths, rejects whitespace padding, empty strings, control characters, and placeholders.
   - `validVolumePaths`: accepts non-empty arrays of valid paths; rejects empty arrays, non-arrays, or arrays with any invalid path.
   - `validVolumeSection`: accepts object with `status: 'success'` and valid `verified_paths`; rejects non-objects, arrays, missing/failed status, and invalid paths.
5. Rotation and SMTP reference helpers (`isRotationReference`, `validSmtpText`, `validSmtpEmail`, `validSmtpSecretReference`):
   - `isRotationReference`: accepts clean opaque strings, rejects empty strings, leading/trailing whitespace, control characters, and placeholders (`change-me`, `__REQUIRED_*__`).
   - `validSmtpText`: validates non-empty trimmed strings free of control characters and placeholders.
   - `validSmtpEmail`: accepts standard email format (`user@domain.com`), rejects missing `@`, leading/trailing `@`, multiple `@`, and placeholder strings.
   - `validSmtpSecretReference`: delegates to `validSmtpText`.
6. Schema shape, endpoint, and constants helpers:
   - `isValidGraphqlEndpoint`: accepts `/graphql` and custom paths starting with `/` without spaces; rejects relative paths, empty strings, non-strings, and spaces.
   - `hasExactKeys`: validates objects having exactly the expected keys; rejects missing keys, extra keys, non-objects, null, arrays.
   - `DEPLOYMENT_OBSERVATIONS` and `NO_AI_JOURNEYS`: verify exported array length, immutable contents, and expected keys.

### 3. Verification and documentation

- Run `npm run ops:readiness-test` (all tests passing)
- Run `npm run ops:launch-drill-test` (all tests passing)
- Run `npm run ops:readiness-schema-test`
- Run `npm run ops:templates` and `npm run ops:templates-test`
- Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`
- Record prompt execution in `docs/build-plan.md` and `docs/launch-checklist.md`

## SKILLS USED

- `javascript-testing-patterns`: Structure Node.js unit and contract tests for validators, timestamp parsers, and glob expansion.
- `security-best-practices`: Enforce fail-closed parsing, placeholder rejection, and input type guards.
- `requesting-code-review`: Prepare review context and dispatch code-reviewer subagent.
- `receiving-code-review`: Evaluate reviewer feedback technically before fixing or committing.
- `caveman-commit`: Author concise commit message upon successful verification.
