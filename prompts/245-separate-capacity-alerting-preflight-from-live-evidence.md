# Phase 12K follow-up — separate capacity alerting preflight from live evidence

## Scope and why this is next

Close Category 5 (`slo_and_alerting`)'s preflight-versus-live-evidence gap.
Classify synthetic capacity and alert simulation reports as simulation preflights (`execution_mode: "simulation"`),
preserve comprehensive structural verification (11 alert rules, breach/clear simulations, measured latency/throughput
distributions, recomputed SLO compliance, database baseline telemetry, and DoS resilience), and require a separately
inspected live operator child receipt (`execution_mode: "live"`) bound to production environment, operator reference,
authorization reference, and benchmark/telemetry reference when Category 5 is approved.

Integrate Category 5 into `checkEvidenceFile`'s outer fail-closed safe evidence boundary alongside Categories 1–4 and 6–11,
ensuring all 11 launch checklist rows enforce uniform exception suppression, path redaction, and diagnostic boundary masking.
This is a repository-owned, dependency-safe step within the unfinished Phase 12 exit gate, completing the uniform hardening
of drill evidence categories across all 11 launch checklist rows. Prompt 201 still governs real production evidence and sign-off.

Planning baseline: clean worktree at commit `41540ff9f1550364f03b03b86a5fc6cdf1c58094`
(`fix(ops): separate optional AI preflight from live evidence`). Re-establish
committed state on execution; prompt files alone do not prove implementation.

Verified gaps in current code:

- `validateCapacityAlertingReport` in `scripts/ops/check-launch-readiness.js` relies primarily on legacy `mode: "synthetic" | "live"`
  without standard `execution_mode: "simulation" | "live"`, and does not require explicit live operator authorization,
  operator reference (`operator_reference`), authorization reference (`authorization_reference`), benchmark/telemetry reference
  (`benchmark_reference`), or `environment: "production"` on live receipts when Category 5 is approved.
- Category 5 (`slo_and_alerting`) is the ONLY category omitted from `checkEvidenceFile`'s outer `try...catch` wrapper
  and `fail()` routing table, leaving potential file reading, glob expansion, JSON formatting, or traversal exceptions
  unhandled by the safe boundary.
- `isCapacityAlertingCandidate` does not reject disguised dossiers with `Object.hasOwn(parsed, 'stages')` or
  `parsed.capacityAlertingBaseline !== undefined`, creating potential ambiguity for dossiers masquerading as child receipts.
- In `checkEvidenceFileContents`, `slo_and_alerting` currently evaluates candidates without `now` or `context`,
  differing from the deferred approval-clock evaluation pattern used by all other categories.
- `scripts/ops/check-launch-readiness.spec.js` lacks tests for `execution_mode` validation, simulation rejection on approval,
  live receipt field verification (`operator_reference`, `authorization_reference`, `environment`), and safe diagnostic
  boundary exception suppression specifically for Category 5.

Do not solve these gaps by claiming local synthetic benchmarks (`synthetic://in-process-evaluation`) or mock templates
perform live production capacity verification. Separate simulation preflight from live acceptance and document the boundaries explicitly.

## References read and execution prerequisites

Planning read: `AGENTS.md` phase-control, workflow, prompt, product, standing rules, and
verification contracts; `docs/build-plan.md` Phase 12 and Phase 12K; `docs/skills.md`;
`docs/system-architecture.md` §11–12; `docs/security.md` TM-01, TM-04, TM-05, TM-15, TM-16, TM-20, and
Phase 12K evidence integrity; `docs/operations.md` Phase 12K and prompts 234–244;
`docs/launch-checklist.md` Category 5, gap register, and formal sign-off matrix;
`prompts/201-production-launch-evidence-and-signoff.md` for outstanding operator
authority.

Inspected: `validateCapacityAlertingReport`, `isCapacityAlertingCandidate`,
Category 5 evaluation, and safe evidence-file boundaries in
`scripts/ops/check-launch-readiness.js`; Category 5 fixtures and tests in
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

### 1. Define strict structural and separately supplied live contracts for capacity alerting

Extend `validateCapacityAlertingReport(report, now, context = {})`:
- Support explicit `execution_mode: "simulation" | "live"` while retaining backward compatibility for `mode: "synthetic" | "live"`.
  Map `mode: "synthetic"` to simulation and `mode: "live"` to live when `execution_mode` is absent; if both are present, they must agree.
- Retain all existing structural checks: 11 alert rules, breach/clear simulations, 429 isolation, measured distributions,
  recomputed SLO compliance, database baseline telemetry, and DoS resilience.
- In simulation mode (`execution_mode: "simulation"` or `mode: "synthetic"`):
  - Validates structural completeness and metric integrity.
  - If live mode is requested (`context.requireLive === true`), immediately returns `false`.
- When `context.requireLive === true` (or live mode):
  - Rejects simulation/synthetic mode (`report.mode !== 'live'` or `report.execution_mode === 'simulation'`).
  - Requires `environment === "production"`.
  - Requires trimmed, nonempty, control-free, secret-free references: `operator_reference`,
    `authorization_reference`, and `benchmark_reference` (or `monitoring_reference` or `telemetry_reference`).
  - Requires real target IDs (`targetId`, `apiTargetId`) and healthy live Prometheus database scrape telemetry.
  - Requires zero placeholder markers or secret exposures across the report.

All opaque references must be trimmed, nonempty, control-free, and pass existing
placeholder/development/literal-secret rejection without echoing diagnostics.

### 2. Integrate Category 5 into checkEvidenceFile safe boundary and require bound live evidence

Exclude unified dossiers from capacity alerting candidates in `isCapacityAlertingCandidate`
before content checks (`Object.hasOwn(parsed, 'stages') || Array.isArray(parsed.stages) || parsed.dossier_version !== undefined || parsed.capacityAlertingBaseline !== undefined`).

Extend the narrow safe evidence-file boundary in `checkEvidenceFile` to include Category 5:
- Include `'slo_and_alerting'` in `checkEvidenceFile`'s checked category array.
- Map failure to fixed message: `'A referenced capacity and alerting report is invalid or failed'`.
- In `checkEvidenceFileContents`, align `slo_and_alerting` with the other categories: if candidate, defer full
  validation to the approval evaluation; if not candidate and not valid dossier, add blocker `'A referenced capacity and alerting report is invalid or failed'`.
- Suppress private paths, child error/status text, and exception messages.

In Category 5 evaluation in `validateReadiness`:
- Require at least one valid candidate report.
- When `sloSec.status === 'approved'`, require that all referenced candidate reports satisfy `validateCapacityAlertingReport(parsed, now, { section: sloSec, requireLive: true })`.
- A valid classified simulation may accompany live evidence; simulation-only, legacy-synthetic-only,
  dossier-only, prose-only, and external-pointer-only evidence cannot approve Category 5.
- Every live child must match: an invalid or malformed child blocks beside a valid one.

### 3. Automated test suite updates

In `scripts/ops/check-launch-readiness.spec.js`:
- Update `validCapacityAlertingReport` fixture to include `execution_mode: 'live'`, `environment: 'production'`,
  `operator_reference`, `authorization_reference`, and `benchmark_reference`.
- Add `validSimulationCapacityAlertingReport` fixture (`execution_mode: 'simulation'`, `mode: 'synthetic'`).
- Test simulation report only on approved record produces:
  `'A referenced capacity and alerting report is invalid or failed'` or requires live receipt.
- Test valid simulation + valid live report passes cleanly.
- Test `isCapacityAlertingCandidate` rejects disguised dossiers with `stages`, `dossier_version`, or `capacityAlertingBaseline`.
- Test `validateCapacityAlertingReport` rejects simulation mode under `{ requireLive: true }`, non-production environment
  in live mode, missing/empty/whitespace-padded `operator_reference`, `authorization_reference`, or `benchmark_reference`.
- Test safe evidence file boundary for `slo_and_alerting` suppresses paths, stack traces, and formatting exceptions on malformed JSON,
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
- Record Prompt 245 in `docs/build-plan.md` under Phase 12K.
- Update `docs/launch-checklist.md` Category 5 narrative and Section 7 formal sign-off matrix row 5.
- Record Prompt 245 in `docs/operations.md` under Phase 12K.
- Record Prompt 245 evidence integrity in `docs/security.md`.
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
