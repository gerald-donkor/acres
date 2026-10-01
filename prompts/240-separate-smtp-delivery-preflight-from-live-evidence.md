# Phase 12K follow-up — separate SMTP delivery preflight from live evidence

## Scope and why this is next

Close Category 2 (`smtp_delivery`)'s preflight-versus-live-evidence gap.
Classify SMTP configuration and template checks as simulation preflights
(`execution_mode: "simulation"`), preserve structural delivery and DNS verification,
and require a separately inspected live operator child receipt (`execution_mode: "live"`)
bound to live provider message transmission, delivery receipt, and public DNS records
(SPF, DKIM, DMARC) when Category 2 is approved. This is a repository-owned,
dependency-safe step within the unfinished Phase 12 exit gate, continuing the hardening
of drill evidence categories (after prompts 234–239 for capacity, rotation, deployment,
volume encryption, disaster recovery, and domain TLS). Prompt 201 still governs real
production evidence and sign-off.

Planning baseline: clean worktree at commit `ac0c32c9c6c827c9f5159838a36229c1233ae904`
(`fix(ops): separate domain TLS preflight from live evidence`). Re-establish committed
state on execution; prompt files alone do not prove implementation.

Verified gaps in current code:

- `validateSmtpDeliveryReport` in `scripts/ops/check-launch-readiness.js` accepts any
  structurally compliant report without checking `execution_mode: "simulation" | "live"`,
  and accepts unclassified reports without requiring live operator verification when
  Category 2 is approved.
- `validateSmtpDeliveryReport` does not require explicit live operator authorization,
  operator identity, or provider tracking references (`operator_reference`,
  `authorization_reference`, `provider_reference`) on live receipts.
- `isSmtpDeliveryCandidate` does not reject unified dossiers that contain stages or
  dossier versions, allowing disguised dossiers to be processed by candidate logic.
- `checkEvidenceFile` does not include `smtp_delivery` in its safe fail-closed boundary;
  private file paths, stack traces, or child error diagnostics can leak into blockers
  on malformed, missing, or throwing child files.
- `scripts/ops/check-launch-readiness.spec.js` lacks tests for `execution_mode` validation,
  simulation rejection on approval, live receipt field verification, and safe diagnostic
  boundary enforcement for Category 2.

Do not solve these gaps by claiming static configuration or local template tests perform
live SMTP transmission. Separate configuration preflight from live acceptance and
document the boundaries explicitly.

## References read and execution prerequisites

Planning read: `AGENTS.md` phase-control, workflow, prompt, product, standing rules, and
verification contracts; `docs/build-plan.md` Phase 12 and Phase 12K; `docs/skills.md`;
`docs/system-architecture.md` §11–12; `docs/security.md` TM-01, TM-04, TM-05, and Phase 12K
evidence integrity; `docs/operations.md` Phase 12K and prompts 234–239;
`docs/launch-checklist.md` Category 2, gap register, and formal sign-off matrix;
`prompts/201-production-launch-evidence-and-signoff.md` for outstanding operator
authority.

Inspected: `validateSmtpDeliveryReport`, `isSmtpDeliveryCandidate`, Category 2 evaluation,
and safe evidence-file boundaries in `scripts/ops/check-launch-readiness.js`; Category 2
fixtures and tests in `scripts/ops/check-launch-readiness.spec.js`;
`scripts/ops/check-smtp-template-keys.js` and `scripts/ops/check-smtp-template-keys.spec.js`;
root `package.json`; and `infra/launch/readiness.example.json` /
`infra/launch/readiness.schema.json`.

At execution reread the approved prompt, those references, complete affected test files,
and `infra/launch/readiness.example.json` / `infra/launch/readiness.schema.json`. Read
existing timestamp, exact-key, reference, and placeholder/secret helpers before reusing
them. Inspect complete launch/readiness tests before changing fixtures. Verify any newly
used Node API through installed references or a small local executable probe. No Next,
React, Tailwind, or Nest API changes are needed.

No UI, routes, comps, crops, measurements or breakpoint changes apply. Consult the existing
threat model; no new full threat-model report or provider choice is requested.

## Implementation plan

### 1. Define strict structural and separately supplied live contracts for SMTP

Extend `validateSmtpDeliveryReport(report, now, approved, context = {})` with optional
context, e.g. `{ requireLive: true }`, retaining exported helper use.
Return false for malformed JSON shapes; do not throw or expose child content. Require exact
recognized `execution_mode: "simulation" | "live"`. Missing, legacy, or unknown mode fails;
no auto-relabeling.

For SMTP delivery reports:
- Retain `drill_type === "smtp_delivery_verification"`, `status: "success"`,
  empty `errors` array, valid text `provider` and `host`, valid port integer (1–65535),
  `tls_mode: "STARTTLS" | "TLS"`, and valid `from_address`.
- Require matching against `approved` section when `approved` is passed (provider, host,
  port, tls_mode, from_address case-insensitively for host and from_address).
- Accept real nonfuture ISO UTC timestamps consistent with neighboring helpers.
- In simulation mode: validate structural completeness. If `requireLive: true` is set,
  simulation mode returns false.
- When `requireLive: true` is set (or `report.execution_mode === "live"`):
  - Require `execution_mode: "live"`, `environment: "production"`.
  - Require trimmed nonempty opaque references: `operator_reference`,
    `authorization_reference`, and `provider_reference`.
  - Require structured delivery verification:
    - `delivery`: plain object with `status: "delivered"`, opaque nonempty `receipt_id`,
      and real nonfuture ISO UTC `timestamp`.
  - Require structured DNS verification:
    - `dns`: plain object with real nonfuture ISO UTC `checked_at`.
    - Entries for `spf`, `dkim`, and `dmarc`, each a plain object with `passed: true`
      and a trimmed nonempty `record` reference.
  - Require zero placeholder markers or secret exposures across the report.

All opaque references must be trimmed, nonempty, control-free, and pass existing
placeholder/development/literal-secret rejection without echoing diagnostics.

### 2. Require bound live evidence for Category 2

Exclude unified dossiers from SMTP delivery candidates in `isSmtpDeliveryCandidate`
before content checks (`Array.isArray(parsed.stages) || parsed.dossier_version !== undefined`).
Every referenced Category 2 child must pass structural validation, and when
`smtpSec.status === 'approved'`, a valid live SMTP delivery child report is required:
- If any candidate fails `validateSmtpDeliveryReport(parsed, now, smtpSec)`:
  add blocker `'A referenced SMTP delivery report is invalid or failed'`.
- If no candidate satisfies `validateSmtpDeliveryReport(parsed, now, smtpSec, { requireLive: true })`:
  add blocker `'A live SMTP delivery verification operator receipt is required'`.

A valid classified simulation may accompany live evidence; simulation-only, legacy-only,
dossier-only, prose-only, and external-pointer-only evidence cannot approve Category 2.
Every live child must match: an invalid or malformed child blocks beside a valid one.

Extend the narrow safe evidence-file boundary used by Categories 1, 3, 6, 8, and 10 to
Category 2:
- Include `'smtp_delivery'` in `checkEvidenceFile`.
- Map failure to fixed message: `'A referenced SMTP delivery report is invalid or failed'`.
- Suppress private paths, child error/status text, and exception messages.

### 3. Automated test suite updates

In `scripts/ops/check-launch-readiness.spec.js`:
- Update `validSmtpReport` fixture to include `execution_mode: 'live'`, `environment: 'production'`,
  `operator_reference`, `authorization_reference`, and `provider_reference`.
- Add comprehensive test coverage for Category 2:
  - Missing/unknown/legacy execution modes; simulation relabeled live without required
    live observation fields;
  - Structural validation failure cases: malformed JSON, missing delivery, failed DNS checks;
  - Live mode validation: rejection of simulation when `status === 'approved'`, valid live
    child clearing fixture Category 2, simulation accompanying live child, invalid live
    references, host/port/tls_mode/from_address mismatch;
  - Safe diagnostic boundary: suppression of private paths and child error details on
    missing or malformed Category 2 files;
  - Disguised dossier rejection.

### 4. Documentation updates

Update `docs/operations.md`, `docs/launch-checklist.md`, `docs/security.md`, and
`docs/build-plan.md` with prompt 240 verification records, Category 2 contract, and
residual live operator requirements.

## File scope, non-goals, impact and rollback

Expected changes:
- `scripts/ops/check-launch-readiness.js` and `scripts/ops/check-launch-readiness.spec.js`
- `docs/operations.md`, `docs/launch-checklist.md`, `docs/security.md`, and `docs/build-plan.md`

Non-goals:
- Does not send live emails to third-party relays or public recipients during CI.
- Does not create synthetic approval of Category 2.
- Does not modify mailer services, authentication templates, or server endpoints.
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

- `security-threat-model` — consult and maintain SMTP delivery and evidence integrity threat coverage (TM-01, TM-04, TM-05, TM-18).
- `security-best-practices` — secure-by-default JSON child report parsing and private diagnostic protection.
- `error-handling-patterns` — strict fail-closed validation and safe diagnostic boundaries.
- `javascript-testing-patterns` — isolated unit and hermetic validation test suites.
- `architecture-patterns` — boundary separation between simulation preflight and live verification.
- `requesting-code-review` — dispatch independent implementation review.
- `receiving-code-review` — rigorously evaluate and verify review feedback.
- `caveman-commit` — write concise, standards-compliant local commit message.
