# Phase 12K follow-up — separate data-retention preflight from live evidence

## Scope and why this is next

Close Category 7 (`data_retention_policy`)'s preflight-versus-live-evidence gap.
Classify retention policy reports as simulation preflights (`execution_mode: "simulation"`),
preserve structural policy and retention window verification, and require a separately
inspected live operator child receipt (`execution_mode: "live"`) bound to production
environment, operator reference, authorization reference, and signed policy reference
when Category 7 is approved. This is a repository-owned, dependency-safe step within the
unfinished Phase 12 exit gate, continuing the hardening of drill evidence categories
(after prompts 234–241 for capacity, rotation, deployment, volume encryption, disaster
recovery, domain TLS, SMTP delivery, and secret references). Prompt 201 still governs
real production evidence and sign-off.

Planning baseline: clean worktree at commit `eb25f36866e4b9129e9dbafdebee5fd7e0379ca9`
(`fix(ops): separate secret reference preflight from live evidence`). Re-establish
committed state on execution; prompt files alone do not prove implementation.

Verified gaps in current code:

- `validateDataRetentionPolicyReport` in `scripts/ops/check-launch-readiness.js` accepts any
  structurally compliant report without checking `execution_mode: "simulation" | "live"`,
  and accepts unclassified reports without requiring live operator verification when
  Category 7 is approved.
- `validateDataRetentionPolicyReport` does not require explicit live operator authorization,
  operator identity, or live policy references (`operator_reference`,
  `authorization_reference`, `policy_reference`) on live receipts.
- `isDataRetentionPolicyCandidate` does not reject unified dossiers that contain stages or
  dossier versions, allowing disguised dossiers to be processed by candidate logic.
- `checkEvidenceFile` does not include `data_retention_policy` in its safe fail-closed
  boundary; private file paths, stack traces, or child error diagnostics can leak into blockers
  on malformed, missing, or throwing child files.
- Category 7 evaluation in `check-launch-readiness.js` does not enforce `{ requireLive: true }`
  when `sections.data_retention_policy.status === 'approved'`.
- `scripts/ops/check-launch-readiness.spec.js` lacks tests for `execution_mode` validation,
  simulation rejection on approval, live receipt field verification, and safe diagnostic
  boundary enforcement for Category 7.

Do not solve these gaps by claiming static configuration or local policy templates perform
live retention verification. Separate policy preflight from live acceptance and document
the boundaries explicitly.

## References read and execution prerequisites

Planning read: `AGENTS.md` phase-control, workflow, prompt, product, standing rules, and
verification contracts; `docs/build-plan.md` Phase 12 and Phase 12K; `docs/skills.md`;
`docs/system-architecture.md` §11–12; `docs/security.md` TM-01, TM-04, TM-05, TM-15, and
Phase 12K evidence integrity; `docs/operations.md` Phase 12K and prompts 234–241;
`docs/launch-checklist.md` Category 7, gap register, and formal sign-off matrix;
`prompts/201-production-launch-evidence-and-signoff.md` for outstanding operator
authority.

Inspected: `validateDataRetentionPolicyReport`, `isDataRetentionPolicyCandidate`,
Category 7 evaluation, and safe evidence-file boundaries in
`scripts/ops/check-launch-readiness.js`; Category 7 fixtures and tests in
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

### 1. Define strict structural and separately supplied live contracts for data retention

Extend `validateDataRetentionPolicyReport(report, now, approvedOrContext, maybeContext)`
with optional context, e.g. `{ requireLive: true }`, retaining exported helper use.
Return false for malformed JSON shapes; do not throw or expose child content. Require exact
recognized `execution_mode: "simulation" | "live"`. Missing, legacy, or unknown mode fails;
no auto-relabeling.

For data retention policy reports:
- Retain `drill_type === "data_retention_policy_verification"`, `status: "success"`,
  empty `errors` array, valid text/reference `policy_reference`,
  `scheduled_cleanup_verified === true`.
- Retain exact 8-key `retention_windows` object matching `REQUIRED_RETENTION_KEYS`:
  - Each entry must be a plain object with `window` matching approved window (or valid string
    when standalone), `policy_verified === true`.
  - Exactly 2 keys per entry (`policy_verified`, `window`).
- Require matching against `approved` section when `approved` is passed (all 8 windows).
- Accept real nonfuture ISO UTC timestamps consistent with neighboring helpers.
- In simulation mode: validate structural completeness. Exact top-level keys:
  `['drill_type', 'errors', 'execution_mode', 'policy_reference', 'retention_windows', 'scheduled_cleanup_verified', 'status', 'timestamp']`.
  If `requireLive: true` is set, simulation mode returns false.
- When `requireLive: true` is set (or `report.execution_mode === "live"`):
  - Require `execution_mode: "live"`, `environment: "production"`.
  - Require trimmed nonempty opaque references: `operator_reference`,
    `authorization_reference`, and `policy_reference`.
  - Exact top-level keys:
    `['authorization_reference', 'drill_type', 'environment', 'errors', 'execution_mode', 'operator_reference', 'policy_reference', 'retention_windows', 'scheduled_cleanup_verified', 'status', 'timestamp']`.
  - Require zero placeholder markers or secret exposures across the report.

All opaque references must be trimmed, nonempty, control-free, and pass existing
placeholder/development/literal-secret rejection without echoing diagnostics.

### 2. Require bound live evidence for Category 7

Exclude unified dossiers from retention policy candidates in `isDataRetentionPolicyCandidate`
before content checks (`Array.isArray(parsed.stages) || parsed.dossier_version !== undefined`).
Every referenced Category 7 child must pass structural validation, and when
`retSec.status === 'approved'`, a valid live data retention policy child report is required:
- If any candidate fails `validateDataRetentionPolicyReport(parsed, now, retSec)`:
  add blocker `'A referenced data retention policy report is invalid or failed'`.
- If no candidate satisfies `validateDataRetentionPolicyReport(parsed, now, retSec, { requireLive: true })`:
  add blocker `'A live data retention policy operator receipt is required'`.

A valid classified simulation may accompany live evidence; simulation-only, legacy-only,
dossier-only, prose-only, and external-pointer-only evidence cannot approve Category 7.
Every live child must match: an invalid or malformed child blocks beside a valid one.

Extend the narrow safe evidence-file boundary used by Categories 1, 2, 3, 4, 6, 8, and 10 to
Category 7:
- Include `'data_retention_policy'` in `checkEvidenceFile`.
- Map failure to fixed message: `'A referenced data retention policy report is invalid or failed'`.
- Suppress private paths, child error/status text, and exception messages.

### 3. Automated test suite updates

In `scripts/ops/check-launch-readiness.spec.js`:
- Update `validRetentionPolicyReport` fixture to include `execution_mode: 'live'`, `environment: 'production'`,
  `operator_reference`, and `authorization_reference`.
- Add `validSimulationRetentionPolicyReport` fixture (`execution_mode: 'simulation'`).
- Add comprehensive test coverage for Category 7:
  - Missing/unknown/legacy execution modes; simulation relabeled live without required
    live observation fields;
  - Structural validation failure cases: malformed JSON, missing windows, unverified cleanup;
  - Live mode validation: rejection of simulation when `status === 'approved'`, valid live
    child clearing fixture Category 7, simulation accompanying live child, invalid live
    references;
  - Safe diagnostic boundary: suppression of private paths and child error details on
    missing or malformed Category 7 files;
  - Disguised dossier rejection.

### 4. Documentation updates

Update `docs/operations.md`, `docs/launch-checklist.md`, `docs/security.md`, and
`docs/build-plan.md` with prompt 242 verification records, Category 7 contract, and
residual live operator requirements.

## File scope, non-goals, impact and rollback

Expected changes:
- `scripts/ops/check-launch-readiness.js` and `scripts/ops/check-launch-readiness.spec.js`
- `docs/operations.md`, `docs/launch-checklist.md`, `docs/security.md`, and `docs/build-plan.md`

Non-goals:
- Does not run live retention purge routines against production databases or object stores.
- Does not create synthetic approval of Category 7.
- Does not modify retention cron configurations or database schemas.
- Rollback is reverting the implementation commit. Operator sign-off remains open.

## Verification, review and completion

1. Run `npm run ops:readiness-test` and `npm run ops:readiness-schema-test`.
2. Run `npm run ops:templates`, `npm run ops:templates-test`, and `npm run ops:check`.
3. Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
4. Run `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`;
   require fail-closed behavior (0 approved, 11 blocked, 70 blockers).
5. Self-review the complete diff, then dispatch an independent read-only reviewer
   via `requesting-code-review`. Evaluate feedback with `receiving-code-review`.
6. Update documentation with actual test outputs and residual requirements.
7. Stage approved files and commit locally to `main` using `caveman-commit`.
   Do not push.

## SKILLS USED

- `deployment-pipeline-design` — preserve the operator approval gate.
- `security-threat-model` — consult and maintain data retention and evidence integrity threat coverage (TM-01, TM-04, TM-05, TM-15).
- `security-best-practices` — secure-by-default JSON child report parsing and private diagnostic protection.
- `error-handling-patterns` — strict fail-closed validation and safe diagnostic boundaries.
- `javascript-testing-patterns` — isolated unit and hermetic validation test suites.
- `architecture-patterns` — boundary separation between simulation preflight and live verification.
- `requesting-code-review` — dispatch independent implementation review.
- `receiving-code-review` — rigorously evaluate and verify review feedback.
- `caveman-commit` — write concise, standards-compliant local commit message.
