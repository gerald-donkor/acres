# Phase 12K follow-up — separate GraphQL introspection preflight from live evidence

## Scope and why this is next

Close Category 9 (`graphql_introspection`)'s preflight-versus-live-evidence gap.
Classify GraphQL introspection probe reports as simulation preflights (`execution_mode: "simulation"`),
preserve structural endpoint, probe result, and policy justification verification, and require a separately
inspected live operator child receipt (`execution_mode: "live"`) bound to production
environment, operator reference, authorization reference, and probe reference
when Category 9 is approved. This is a repository-owned, dependency-safe step within the
unfinished Phase 12 exit gate, continuing the hardening of drill evidence categories
(after prompts 234–242 for capacity, rotation, deployment, volume encryption, disaster
recovery, domain TLS, SMTP delivery, secret references, and data retention). Prompt 201 still governs
real production evidence and sign-off.

Planning baseline: clean worktree at commit `0933ad82ac522b96fd50c8dcdefd3a415af05639`
(`fix(ops): separate retention preflight from live evidence`). Re-establish
committed state on execution; prompt files alone do not prove implementation.

Verified gaps in current code:

- `validateGraphqlIntrospectionReport` in `scripts/ops/check-launch-readiness.js` accepts any
  structurally compliant report without checking `execution_mode: "simulation" | "live"`,
  and accepts unclassified reports without requiring live operator verification when
  Category 9 is approved.
- `validateGraphqlIntrospectionReport` does not require explicit live operator authorization,
  operator identity, or live probe references (`operator_reference`,
  `authorization_reference`, `probe_reference`) on live receipts.
- `isGraphqlIntrospectionCandidate` does not reject unified dossiers that contain stages or
  dossier versions, allowing disguised dossiers to be processed by candidate logic.
- `checkEvidenceFile` does not include `graphql_introspection` in its safe fail-closed
  boundary; private file paths, stack traces, or child error diagnostics can leak into blockers
  on malformed, missing, or throwing child files.
- Category 9 evaluation in `check-launch-readiness.js` does not enforce `{ requireLive: true }`
  when `sections.graphql_introspection.status === 'approved'`.
- `scripts/ops/check-launch-readiness.spec.js` lacks tests for `execution_mode` validation,
  simulation rejection on approval, live receipt field verification, and safe diagnostic
  boundary enforcement for Category 9.

Do not solve these gaps by claiming static server configuration (`introspection: !config.isProduction`)
or local probe templates perform live introspection verification. Separate probe preflight
from live acceptance and document the boundaries explicitly.

## References read and execution prerequisites

Planning read: `AGENTS.md` phase-control, workflow, prompt, product, standing rules, and
verification contracts; `docs/build-plan.md` Phase 12 and Phase 12K; `docs/skills.md`;
`docs/system-architecture.md` §11–12; `docs/security.md` TM-01, TM-04, TM-05, TM-15, and
Phase 12K evidence integrity; `docs/operations.md` Phase 12K and prompts 234–242;
`docs/launch-checklist.md` Category 9, gap register, and formal sign-off matrix;
`prompts/201-production-launch-evidence-and-signoff.md` for outstanding operator
authority.

Inspected: `validateGraphqlIntrospectionReport`, `isGraphqlIntrospectionCandidate`,
Category 9 evaluation, and safe evidence-file boundaries in
`scripts/ops/check-launch-readiness.js`; Category 9 fixtures and tests in
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

### 1. Define strict structural and separately supplied live contracts for GraphQL introspection

Extend `validateGraphqlIntrospectionReport(report, now, approvedOrContext, maybeContext)`
with optional context, e.g. `{ requireLive: true }`, retaining exported helper use.
Return false for malformed JSON shapes; do not throw or expose child content. Require exact
recognized `execution_mode: "simulation" | "live"`. Missing, legacy, or unknown mode fails;
no auto-relabeling.

For GraphQL introspection probe reports:
- Retain `drill_type === "graphql_introspection_probe"`, `status === "success"`,
  empty `errors` array, valid endpoint (`/graphql` or absolute HTTP/HTTPS URL ending in `/graphql`),
  and boolean `production_introspection_enabled`.
- Retain `probe_result` object containing exactly:
  `['introspection_permitted', 'response_summary', 'schema_exposed', 'status_code']`:
  - `status_code`: positive integer.
  - `introspection_permitted`: boolean matching `production_introspection_enabled`.
  - `schema_exposed`: boolean (`false` when `production_introspection_enabled === false`, `true` when `true`).
  - `response_summary`: non-empty trimmed string without unresolved placeholders or secrets.
- Require matching against `approved` section when `approved` is passed:
  `report.production_introspection_enabled === approved.production_introspection_enabled`.
- Accept real nonfuture ISO UTC timestamps consistent with neighboring helpers.
- In simulation mode: validate structural completeness. Exact top-level keys:
  `['drill_type', 'endpoint', 'errors', 'execution_mode', 'probe_result', 'production_introspection_enabled', 'status', 'timestamp']`.
  If `requireLive: true` is set, simulation mode returns false.
- When `requireLive: true` is set (or `report.execution_mode === "live"`):
  - Require `execution_mode: "live"`, `environment: "production"`.
  - Require trimmed nonempty opaque references: `operator_reference`,
    `authorization_reference`, and `probe_reference`.
  - Exact top-level keys:
    `['authorization_reference', 'drill_type', 'endpoint', 'environment', 'errors', 'execution_mode', 'operator_reference', 'probe_reference', 'probe_result', 'production_introspection_enabled', 'status', 'timestamp']`.
  - Require zero placeholder markers or secret exposures across the report.

All opaque references must be trimmed, nonempty, control-free, and pass existing
placeholder/development/literal-secret rejection without echoing diagnostics.

### 2. Require bound live evidence for Category 9

Exclude unified dossiers from GraphQL introspection candidates in `isGraphqlIntrospectionCandidate`
before content checks (`Array.isArray(parsed.stages) || parsed.dossier_version !== undefined`).
Every referenced Category 9 child must pass structural validation, and when
`gqlSec.status === 'approved'`, a valid live GraphQL introspection probe child report is required:
- If any candidate fails `validateGraphqlIntrospectionReport(parsed, now, gqlSec)`:
  add blocker `'A referenced GraphQL introspection report is invalid or failed'`.
- If no candidate satisfies `validateGraphqlIntrospectionReport(parsed, now, gqlSec, { requireLive: true })`:
  add blocker `'A live GraphQL introspection probe operator receipt is required'`.

A valid classified simulation may accompany live evidence; simulation-only, legacy-only,
dossier-only, prose-only, and external-pointer-only evidence cannot approve Category 9.
Every live child must match: an invalid or malformed child blocks beside a valid one.

Extend the narrow safe evidence-file boundary used by Categories 1, 2, 3, 4, 6, 7, 8, and 10 to
Category 9:
- Include `'graphql_introspection'` in `checkEvidenceFile`.
- Map failure to fixed message: `'A referenced GraphQL introspection report is invalid or failed'`.
- Suppress private paths, child error/status text, and exception messages.

### 3. Automated test suite updates

In `scripts/ops/check-launch-readiness.spec.js`:
- Update `validGraphqlIntrospectionReport` fixture to include `execution_mode: 'live'`, `environment: 'production'`,
  `operator_reference`, `authorization_reference`, and `probe_reference`.
- Add `validSimulationGraphqlIntrospectionReport` fixture (`execution_mode: 'simulation'`).
- Add comprehensive test coverage for Category 9:
  - Missing/unknown/legacy execution modes; simulation relabeled live without required
    live observation fields;
  - Structural validation failure cases: malformed JSON, invalid endpoint, contradictory
    probe result fields;
  - Live mode validation: rejection of simulation when `status === 'approved'`, valid live
    child clearing fixture Category 9, simulation accompanying live child, invalid live
    references;
  - Safe diagnostic boundary: suppression of private paths and child error details on
    missing or malformed Category 9 files;
  - Disguised dossier rejection.

### 4. Documentation updates

Update `docs/operations.md`, `docs/launch-checklist.md`, `docs/security.md`, and
`docs/build-plan.md` with prompt 243 verification records, Category 9 contract, and
residual live operator requirements.

## File scope, non-goals, impact and rollback

Expected changes:
- `scripts/ops/check-launch-readiness.js` and `scripts/ops/check-launch-readiness.spec.js`
- `docs/operations.md`, `docs/launch-checklist.md`, `docs/security.md`, and `docs/build-plan.md`

Non-goals:
- Does not execute live network probes against production `/graphql` ingress.
- Does not create synthetic approval of Category 9.
- Does not modify NestJS server Apollo configuration or schema definitions.
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
- `security-threat-model` — consult and maintain GraphQL introspection and evidence integrity threat coverage (TM-01, TM-04, TM-05, TM-15).
- `security-best-practices` — secure-by-default JSON child report parsing and private diagnostic protection.
- `error-handling-patterns` — strict fail-closed validation and safe diagnostic boundaries.
- `javascript-testing-patterns` — isolated unit and hermetic validation test suites.
- `architecture-patterns` — boundary separation between simulation preflight and live verification.
- `api-design-principles` — strict schema and route contract enforcement.
