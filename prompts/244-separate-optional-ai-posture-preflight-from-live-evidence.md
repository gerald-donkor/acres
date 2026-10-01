# Phase 12K follow-up — separate optional AI posture preflight from live evidence

## Scope and why this is next

Close Category 11 (`optional_ai_posture`)'s preflight-versus-live-evidence gap.
Classify no-AI production posture reports as simulation preflights (`execution_mode: "simulation"`),
preserve structural runtime inventory and deterministic journey verification, and require a separately
inspected live operator child receipt (`execution_mode: "live"`) bound to production
environment, operator reference, authorization reference, and provider policy reference
when Category 11 is approved. This is a repository-owned, dependency-safe step within the
unfinished Phase 12 exit gate, completing the hardening of drill evidence categories
across all 11 launch checklist rows (after prompts 234–243 for capacity, rotation, deployment,
volume encryption, disaster recovery, domain TLS, SMTP delivery, secret references, data retention,
and GraphQL introspection). Prompt 201 still governs real production evidence and sign-off.

Planning baseline: clean worktree at commit `8ffb2c04a80b0d1e5a18adb7887c43477cc822b4`
(`fix(ops): separate GraphQL preflight from live evidence`). Re-establish
committed state on execution; prompt files alone do not prove implementation.

Verified gaps in current code:

- `validateNoAiPostureReport` in `scripts/ops/check-launch-readiness.js` accepts any
  structurally compliant report without checking `execution_mode: "simulation" | "live"`,
  and accepts unclassified reports without requiring live operator verification when
  Category 11 is approved.
- `validateNoAiPostureReport` does not require explicit live operator authorization or
  operator identity references (`operator_reference`, `authorization_reference`) on live receipts.
- `isNoAiPostureCandidate` does not reject unified dossiers that contain stages or
  dossier versions, allowing disguised dossiers to be processed by candidate logic.
- `checkEvidenceFile` does not include `optional_ai_posture` in its safe fail-closed
  boundary; private file paths, stack traces, or child error diagnostics can leak into blockers
  on malformed, missing, or throwing child files.
- Category 11 evaluation in `check-launch-readiness.js` does not enforce `{ requireLive: true }`
  when `sections.optional_ai_posture.status === 'approved'`.
- `scripts/ops/check-launch-readiness.spec.js` lacks tests for `execution_mode` validation,
  simulation rejection on approval, live receipt field verification, and safe diagnostic
  boundary enforcement for Category 11.

Do not solve these gaps by claiming static server configuration (`AI_DRAFT_ENABLED=false`)
or local mock templates perform live no-AI posture verification. Separate simulation preflight
from live acceptance and document the boundaries explicitly.

## References read and execution prerequisites

Planning read: `AGENTS.md` phase-control, workflow, prompt, product, standing rules, and
verification contracts; `docs/build-plan.md` Phase 12 and Phase 12K; `docs/skills.md`;
`docs/system-architecture.md` §11–12; `docs/security.md` TM-01, TM-04, TM-05, TM-15, and
Phase 12K evidence integrity; `docs/operations.md` Phase 12K and prompts 234–243;
`docs/launch-checklist.md` Category 11, gap register, and formal sign-off matrix;
`prompts/201-production-launch-evidence-and-signoff.md` for outstanding operator
authority.

Inspected: `validateNoAiPostureReport`, `isNoAiPostureCandidate`,
Category 11 evaluation, and safe evidence-file boundaries in
`scripts/ops/check-launch-readiness.js`; Category 11 fixtures and tests in
`scripts/ops/check-launch-readiness.spec.js`; root `package.json`; and
`infra/launch/readiness.example.json` / `infra/launch/readiness.schema.json`.

At execution reread the approved prompt, those references, complete affected test files,
and `infra/launch/readiness.example.json` / `infra/launch/readiness.schema.json`. Read
existing timestamp, exact-key, reference, and placeholder/secret helpers before reusing
them. Inspect complete launch/readiness tests before changing fixtures. Verify any newly
used Node API through installed references or a small local executable probe. No Next,
React, Tailwind, or Nest API changes are needed.

No UI, routes, comps, crops, measurements or breakpoint changes apply. Consult the existing
threat model; no new full threat-model report or provider choice is requested.

## Implementation plan

### 1. Define strict structural and separately supplied live contracts for optional AI posture

Extend `validateNoAiPostureReport(report, now, approvedOrContext, maybeContext)`
with optional context, e.g. `{ requireLive: true }`, retaining exported helper use.
Return false for malformed JSON shapes; do not throw or expose child content. Require exact
recognized `execution_mode: "simulation" | "live"`. Missing, legacy, or unknown mode fails;
no auto-relabeling.

For no-AI production posture reports:
- Retain `drill_type === "no_ai_production_posture_verification"`, `status === "success"`,
  empty `errors` array, `unpaid_provider_excluded === true`, and valid `provider_policy_reference`.
- Retain exact `runtime` validation for `api` and `worker`:
  - `ai_draft_enabled === false`, `gemini_api_key_present === false`, and valid `inventory_reference`.
  - Exactly 3 keys per service (`ai_draft_enabled`, `gemini_api_key_present`, `inventory_reference`).
- Retain exact `journeys` validation for `NO_AI_JOURNEYS` (`analytics_dashboard`, `governed_report`, `export_download`):
  - `passed === true`, valid `test_reference`.
  - Exactly 2 keys per journey (`passed`, `test_reference`).
- Require matching against `approved` section when `approved` is passed (fail closed on `ai_enabled !== false`,
  `no_ai_path_verified !== true`, `server_ai_draft_enabled_false !== true`, `no_gemini_api_key_provisioned !== true`,
  `unpaid_provider_excluded !== true`).
- Accept real nonfuture ISO UTC timestamps consistent with neighboring helpers.
- In simulation mode: validate structural completeness. Exact top-level keys:
  `['drill_type', 'errors', 'execution_mode', 'journeys', 'provider_policy_reference', 'runtime', 'status', 'timestamp', 'unpaid_provider_excluded']`.
  If `requireLive: true` is set, simulation mode returns false.
- When `requireLive: true` is set (or `report.execution_mode === "live"`):
  - Require `execution_mode: "live"`, `environment: "production"`.
  - Require trimmed nonempty opaque references: `operator_reference`,
    `authorization_reference`, and `provider_policy_reference`.
  - Exact top-level keys:
    `['authorization_reference', 'drill_type', 'environment', 'errors', 'execution_mode', 'journeys', 'operator_reference', 'provider_policy_reference', 'runtime', 'status', 'timestamp', 'unpaid_provider_excluded']`.
  - Require zero placeholder markers or secret exposures across the report.

All opaque references must be trimmed, nonempty, control-free, and pass existing
placeholder/development/literal-secret rejection without echoing diagnostics.

### 2. Require bound live evidence for Category 11

Exclude unified dossiers from no-AI posture candidates in `isNoAiPostureCandidate`
before content checks (`Array.isArray(parsed.stages) || parsed.dossier_version !== undefined`).
Every referenced Category 11 child must pass structural validation, and when
`aiSec.status === 'approved'`, a valid live no-AI production posture child report is required:
- If any candidate fails `validateNoAiPostureReport(parsed, now, aiSec)`:
  add blocker `'A referenced no-AI production posture report is invalid or failed'`.
- If no candidate satisfies `validateNoAiPostureReport(parsed, now, aiSec, { requireLive: true })`:
  add blocker `'A live no-AI production posture operator receipt is required'`.

A valid classified simulation may accompany live evidence; simulation-only, legacy-only,
dossier-only, prose-only, and external-pointer-only evidence cannot approve Category 11.
Every live child must match: an invalid or malformed child blocks beside a valid one.

Extend the narrow safe evidence-file boundary used by Categories 1 through 10 to
Category 11:
- Include `'optional_ai_posture'` in `checkEvidenceFile`.
- Map failure to fixed message: `'A referenced no-AI production posture report is invalid or failed'`.
- Suppress private paths, child error/status text, and exception messages.

### 3. Automated test suite updates

In `scripts/ops/check-launch-readiness.spec.js`:
- Update `validNoAiReport` fixture to include `execution_mode: 'live'`, `environment: 'production'`,
  `operator_reference`, and `authorization_reference`.
- Add `validSimulationNoAiReport` fixture (`execution_mode: 'simulation'`).
- Test simulation report only on approved record produces:
  `'A live no-AI production posture operator receipt is required'`.
- Test valid simulation + valid live report passes cleanly.
- Test `isNoAiPostureCandidate` rejects dossiers with `stages` or `dossier_version`.
- Test `validateNoAiPostureReport` rejects missing/unrecognized `execution_mode`, simulation mode
  under `{ requireLive: true }`, non-production environment in live mode, missing/empty/whitespace-padded
  `operator_reference` or `authorization_reference`, and malformed top-level keys.
- Test safe evidence file boundary for `optional_ai_posture` suppresses paths and stack traces on malformed JSON,
  disguised dossiers, and corrupt files.

### 4. Verification and documentation

Run full test suite:
- `node --test scripts/ops/check-launch-readiness.spec.js`
- `npm run ops:readiness-test`
- `npm run ops:readiness-schema-test`
- `npm run ops:templates` and `npm run ops:templates-test`
- Full 21 ops test suites
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

Update documentation:
- Record Prompt 244 in `docs/build-plan.md` under Phase 12K.
- Update `docs/launch-checklist.md` Category 11 narrative and Section 7 formal sign-off matrix row 11.
- Record Prompt 244 in `docs/operations.md` under Phase 12K.
- Record Prompt 244 evidence integrity in `docs/security.md`.
- Request and evaluate code review before committing.
- Commit to `main` using `caveman-commit`.

## Verification plan

- `node --test scripts/ops/check-launch-readiness.spec.js`
- `npm run ops:readiness-test`
- `npm run ops:readiness-schema-test`
- `npm run ops:templates`
- `npm run ops:templates-test`
- All 21 ops test suites
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `git diff --check`
- Verification of fail-closed behavior on unresolved example template (`infra/launch/readiness.example.json`).
