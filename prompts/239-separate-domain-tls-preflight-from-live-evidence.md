# Phase 12K follow-up — separate domain TLS preflight from live evidence

## Scope and why this is next

Close Category 1 (`production_domain_tls`)'s preflight-versus-live-evidence gap.
Classify the existing Caddy routing and TLS verifier (`scripts/ops/verify-caddy-routing.js`)
as a configuration simulation and route dispatching preflight (`execution_mode: "simulation"`),
preserve its syntax, security header, S3 SigV4 Host preservation, and API proxy header
checks, and require a separately inspected live operator child receipt
(`execution_mode: "live"`) bound to public DNS resolution, live TLS handshake, and
live HTTPS headers when Category 1 is approved. This is a repository-owned,
dependency-safe step within the unfinished Phase 12 exit gate, continuing the hardening
of drill evidence categories (after prompts 234–238 for capacity, rotation, deployment,
volume encryption, and disaster recovery). Prompt 201 still governs real production
evidence and sign-off.

Planning baseline: clean worktree at commit `71f5e4c2a18ee01d4a504d666de4f399d291fa50`
(`fix(ops): separate DR drill from live evidence`). Re-establish committed state on
execution; prompt files alone do not prove implementation.

Verified gaps in current code:

- `verify-caddy-routing.js` statically inspects a local Caddyfile text file
  (`infra/caddy/Caddyfile.example` or a specified target path) and emits structured JSON
  without `execution_mode: "simulation"`. It validates parsing, directives, and simulated
  path matching; it does not attest live public DNS resolution (A/AAAA records), live
  TLS handshake/cipher negotiation, ACME or custom certificate issuance and validity, or
  live HTTPS response headers.
- `validateCaddyRoutingReport` in `scripts/ops/check-launch-readiness.js` accepts any
  structurally compliant report without checking `execution_mode` and without requiring
  live operator verification when Category 1 is approved.
- `checkEvidenceFile` does not include `production_domain_tls` in its safe fail-closed
  boundary; private file paths or child error diagnostics can leak into blockers on
  malformed or failed files.
- `isCaddyRoutingCandidate` does not reject unified dossiers that contain Caddy routing
  markers or match loose candidate heuristics.
- Stage 3 in `scripts/ops/assemble-launch-dossier.js` does not enforce `execution_mode === "simulation"`
  on Caddy child receipts.

Do not solve these gaps by claiming the static Caddyfile verifier performs network operations.
Separate static configuration preflight from live acceptance and document the boundaries explicitly.

## References read and execution prerequisites

Planning read: `AGENTS.md` phase-control, workflow, prompt, product, standing rules, and
verification contracts; `docs/build-plan.md` Phase 12 and Phase 12K; `docs/skills.md`;
`docs/system-architecture.md` §11–12; `docs/security.md` TM-01, TM-05, and Phase 12K
evidence integrity; `docs/operations.md` Caddy Routing and TLS section, Phase 12K, and
prompt 238; `docs/launch-checklist.md` Category 1, Stage 3, gap register and formal sign-off
matrix; `prompts/201-production-launch-evidence-and-signoff.md` for outstanding operator
authority.

Inspected: complete `scripts/ops/verify-caddy-routing.js` and its spec
`scripts/ops/verify-caddy-routing.spec.js`; `validateCaddyRoutingReport`,
`isCaddyRoutingCandidate`, Category 1 evaluation, and safe evidence-file boundaries in
`scripts/ops/check-launch-readiness.js`; Category 1 fixtures in
`scripts/ops/check-launch-readiness.spec.js`; Stage 3 in `scripts/ops/run-launch-drills.sh`
and `scripts/ops/run-launch-drills.spec.js`; Stage 3 assembly in
`scripts/ops/assemble-launch-dossier.js` and `scripts/ops/assemble-launch-dossier.spec.js`;
root `package.json`; and `infra/launch/readiness.example.json` /
`infra/launch/readiness.schema.json`.

At execution reread the approved prompt, those references, complete affected test files,
and `infra/launch/readiness.example.json` / `infra/launch/readiness.schema.json`. Read
existing timestamp, exact-key, reference, and placeholder/secret helpers before reusing
them. Inspect complete launch/dossier tests before changing fixtures. Verify any newly used
Node API through installed references or a small local executable probe. No Next, React,
Tailwind or Nest API changes are needed.

No UI, routes, comps, crops, measurements or breakpoint changes apply. Ingress and
routing checks below reflect the installed Caddyfile's verified directives (`admin off`,
`encode zstd gzip`, `@objects` proxy to Garage with SigV4 Host preservation, `@api` proxy
to NestJS API with forwarded headers, static Next.js fallback, security headers
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Server` header removal,
and active HSTS gate). Consult the existing threat model; no new full threat-model report
or provider choice is requested.

## Implementation plan

### 1. Identify all current Caddy routing verifier receipts as simulation

Add `execution_mode: "simulation"` to every structured receipt emitted by
`scripts/ops/verify-caddy-routing.js` (both valid outcome and target-missing error payloads).
Keep existing fields, flags, output paths, and exit behavior. No CLI invocation of
`verify-caddy-routing.js` may emit live mode. Concrete local Caddyfile paths, valid
directives, and `--allow-hsts` do not elevate evidence classification.

Correct CLI introduction/help, success/failure text, comments, and runbook claims:
`verify-caddy-routing.js` validates static Caddyfile syntax, security headers, reverse proxy
matchers, and transport timeouts; it does not perform live DNS lookups, live TLS handshake
testing, certificate chain validation, or live HTTPS header measurement. Name those limits
explicitly.

### 2. Define strict structural and separately supplied live contracts

Extend `validateCaddyRoutingReport(report, now, approvedDomain, context = {})` with optional
context, e.g. `{ requireLive: true, expectedSection }`, retaining exported helper use.
Return false for malformed JSON shapes; do not throw or expose child content. Require exact
recognized `execution_mode: "simulation" | "live"`. Missing, legacy, or unknown mode fails;
no auto-relabeling.

For Caddy routing reports:
- Retain `drill_type === "caddy_routing_and_tls_verification"`, `status: "success"`,
  `valid: true`, empty `errors` array, `securityHeadersVerified: true`,
  `s3SigV4HostPreserved: true`, `proxyHeadersVerified: true`, integer `routesEvaluated >= 12`,
  integer `routesPassed === routesEvaluated`, and `evaluatedRoutes` array of matching length
  with every route's `passed === true`.
- Accept real nonfuture ISO UTC timestamps consistent with neighboring helpers.
- In simulation mode: require `hstsApproved: true` when validating against an approved
  production domain. If `requireLive: true` is set, simulation mode returns false.
- When `requireLive: true` is set (or `report.execution_mode === "live"`):
  - Require `execution_mode: "live"`, `environment: "production"`.
  - Require trimmed nonempty opaque references: `operator_reference`,
    `authorization_reference`, and `domain_reference`.
  - Require structured live verification objects:
    - `dns_verification`: plain object with `status: "passed"`, `verified: true`,
      nonempty `record_type` (e.g. `'A'` or `'AAAA'`), and trimmed nonempty
      `evidence_reference`.
    - `tls_handshake_verification`: plain object with `status: "passed"`, `verified: true`,
      `certificate_valid: true`, nonempty `protocol` (e.g. `'TLSv1.3'`), and trimmed
      nonempty `evidence_reference`.
    - `https_headers_verification`: plain object with `status: "passed"`, `verified: true`,
      `security_headers_verified: true`, and trimmed nonempty `evidence_reference`.
  - When `expectedSection` is supplied:
    - Verify that `report.domain.toLowerCase() === expectedSection.domain.toLowerCase()`.
    - If `expectedSection.hsts_approved === true`, require
      `report.https_headers_verification.hsts_verified === true`.

All opaque references must be trimmed, nonempty, control-free, and pass existing
placeholder/development/literal-secret rejection without echoing diagnostics.

### 3. Require bound live evidence for Category 1

Exclude unified dossiers from Caddy routing candidates in `isCaddyRoutingCandidate`
before filename/content checks (`Array.isArray(parsed.stages) || parsed.dossier_version !== undefined`).
Every referenced Category 1 child must pass structural validation, and when
`domainSec.status === 'approved'`, a valid live Caddy routing child report is required.
A valid classified simulation may accompany live evidence; simulation-only, legacy-only,
dossier-only, prose-only, and external-pointer-only evidence cannot approve Category 1.
Every live child must match: an invalid or malformed child blocks beside a valid one.

Extend the narrow safe evidence-file boundary used by Categories 3, 6, 8, and 10 to
Category 1:
- Use fixed message `A referenced Caddy routing report is invalid or failed` for missing
  files, parse errors, child/dossier failures, and malformed nested-value exceptions.
- Suppress private paths, child error/status text, and exception messages.
- Retain useful fixed Category 1 field-name and domain syntax failure messages.

### 4. Preserve Stage 3 and update dossier assembly

In `scripts/ops/assemble-launch-dossier.js`:
- In `caddyPassed`, verify that `caddyEvidence.execution_mode === "simulation"`.
- Summarize Stage 3 in the dossier as preflight verification, not live domain/TLS
  sign-off.

### 5. Automated test suite updates

- In `scripts/ops/verify-caddy-routing.spec.js`:
  - Assert that emitted receipts contain `execution_mode: "simulation"`.
- In `scripts/ops/check-launch-readiness.spec.js`:
  - Add comprehensive test coverage for Category 1:
    - Missing/unknown/legacy execution modes; simulation relabeled live without required
      live observation fields;
    - Structural validation failure cases: malformed JSON, missing fields, route failure,
      unverified headers;
    - Live mode validation: rejection of simulation when `status === 'approved'`, valid live
      child clearing fixture Category 1, simulation accompanying live child, invalid live
      references, domain mismatch, HSTS mismatch;
    - Safe diagnostic boundary: suppression of private paths and child error details on
      missing or malformed Category 1 files;
    - Disguised dossier rejection.
- In `scripts/ops/assemble-launch-dossier.spec.js` and `scripts/ops/run-launch-drills.spec.js`:
  - Verify Stage 3 evidence expectations and dossier baseline consistency with
    `execution_mode: "simulation"`.

### 6. Documentation updates

Update `docs/operations.md`, `docs/launch-checklist.md`, `docs/security.md`, and
`docs/build-plan.md` with prompt 239 verification records, Category 1 contract, and
residual live operator requirements.

## File scope, non-goals, impact and rollback

Expected changes:
- `scripts/ops/verify-caddy-routing.js` and `scripts/ops/verify-caddy-routing.spec.js`
- `scripts/ops/check-launch-readiness.js` and `scripts/ops/check-launch-readiness.spec.js`
- `scripts/ops/assemble-launch-dossier.js` and `scripts/ops/assemble-launch-dossier.spec.js`
- `scripts/ops/run-launch-drills.spec.js`
- `docs/operations.md`, `docs/launch-checklist.md`, `docs/security.md`, and `docs/build-plan.md`

Non-goals:
- Does not run live DNS resolution or TLS handshakes against external domains during CI.
- Does not create synthetic approval of Category 1.
- Does not modify Caddyfile directives, server routing, or UI components.
- Rollback is reverting the implementation commit. Operator sign-off remains open.

## Verification, review and completion

1. Run `npm run test:server` and node test specs for affected ops scripts:
   `node --test scripts/ops/verify-caddy-routing.spec.js`
2. Run `npm run ops:readiness-test`, `npm run ops:readiness-schema-test`, and
   `npm run ops:launch-drill-test`.
3. Run `npm run ops:templates`, `npm run ops:check`, `npm run lint`,
   `npm run typecheck`, `npm run build`, and `git diff --check`.
4. Run `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`;
   require fail-closed behavior (0 approved, 11 blocked, 70 blockers).
5. Self-review the complete diff, then dispatch an independent read-only reviewer
   via `requesting-code-review`. Evaluate feedback with `receiving-code-review`.
6. Update documentation with actual test outputs and residual requirements.
7. Stage approved files and commit locally to `main` using `caveman-commit`.
   Do not push.

## SKILLS USED

- `security-threat-model` — consult and maintain domain TLS and evidence integrity threat coverage (TM-01, TM-05, TM-18).
- `security-best-practices` — secure-by-default JSON child report parsing and private diagnostic protection.
- `error-handling-patterns` — strict fail-closed validation and safe diagnostic boundaries.
- `javascript-testing-patterns` — isolated unit and hermetic CLI test suites.
- `architecture-patterns` — boundary separation between simulation preflight and live verification.
- `requesting-code-review` — dispatch independent implementation review.
- `receiving-code-review` — rigorously evaluate and verify review feedback.
- `caveman-commit` — write concise, standards-compliant local commit message.
