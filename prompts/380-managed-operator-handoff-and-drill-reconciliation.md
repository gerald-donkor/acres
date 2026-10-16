# Prompt 380 — Managed operator handoff and drill reconciliation

## Scope and why this is next

Planning baseline: `f67675d` on `main`, 2026-10-16; working tree clean before
this prompt. Parent: Phase 12 managed-target amendment, approved Prompt 370,
ordered step 5 and step 7 ("Managed operations and launch evidence").

Prompts 370–379 implemented and verified all runtime, storage, scanning, outbox,
throttling, preview deployment, and the core launch readiness schema discrimination:
- Private Blob browser upload adapter and presigned protocol (Prompt 371)
- Sandbox scanner container evaluation and snapshot verification (Prompts 372–373)
- Invocation-safe transactional outbox (Prompt 374)
- Queue-retention job reconciliation (Prompt 375)
- Protected managed outbox dispatch runner, after-commit kicks, and Cron function entrypoint (Prompt 376)
- Shared managed API throttling and sweep cleanup via PostgreSQL (Prompt 377)
- Services routing and first preview deployment on Vercel (`dpl_Hr9VwjL5jrA5vmsZfx7Qvi2R966b`) with all five hosted gates A–E passing (Prompt 378)
- Managed storage reconciliation (`reconcile-storage-objects.js --provider vercel-blob`), readiness schema discrimination (`infra/launch/readiness.schema.json`), fail-closed managed template (`infra/launch/readiness.vercel.example.json`), launch readiness validator (`scripts/ops/check-launch-readiness.js`), and managed operations runbook (Prompt 379)

With the readiness schema and validator discriminating topologies, two critical
operational governance and launch drill gaps remain for the `vercel-managed-production`
profile before human operators can execute pre-launch drills and record verified sign-offs:

1. **Managed Operator Handoff Template & Intake Guidance**:
   `infra/launch/operator-handoff.example.md` is currently hardcoded exclusively for
   `single-host-compose-caddy` (specifying Compose file revisions, Caddyfile checksums,
   and container image pairs). There is no equivalent intake form for `vercel-managed-production`.
   Create `infra/launch/operator-handoff.vercel.example.md` capturing all managed operational properties:
   Vercel Team ID, Project ID, Region (`iad1`), Neon Project ID, Branch ID, pooled and direct
   connection references, Vercel Blob Store ID (`store_*`), Sandbox Scanner Snapshot ID (`snap_*`),
   Resend sender domain reference, immutable Vercel Deployment ID (`dpl_*`), deployment URL, source Git commit SHA,
   and previous Deployment ID (`dpl_*`) for instant rollback. Update `docs/operator-handoff.md` with the
   full completion guide for the managed target.

2. **Unified Launch Drill Support for Managed Topology**:
   `scripts/ops/run-launch-drills.sh` and `scripts/ops/assemble-launch-dossier.js` currently only support
   Compose/Caddy drills and expect Compose receipts. When an operator runs launch drills for
   `vercel-managed-production`, the drill orchestrator must accept `--target-architecture <arch>`
   (defaulting to `single-host-compose-caddy` for complete backward compatibility), and in
   `vercel-managed-production` mode:
   - Stage 1 (`static_templates`): runs static integrity checks and secret scan, safely omitting Docker daemon check.
   - Stage 2 (`supply_chain_sast`): runs SBOM generation, license verification, and SAST scanning.
   - Stage 3 (`ingress_deployment`): runs `scripts/vercel/check-vercel-config.js` and deployment verification rather than Caddyfile parsing and Compose container simulation.
   - Stage 4 (`volume_encryption`): executes managed storage encryption verification (confirming Neon AWS KMS AES-256 and ephemeral compute isolation) rather than Docker mount scan.
   - Stage 5 (`secret_rotation`): executes managed secret reference and rotation cadence verification (verifying indirect store references and rotation runbook) rather than Docker compose file rotation.
   - Stage 6 (`capacity_alerting`): runs capacity benchmarking, DoS resilience, and alert rule verification.
   - Stage 7 (`disaster_recovery`): runs storage reconciliation with `--provider vercel-blob` and Neon PITR drill preflight instead of local Docker PostgreSQL container restore.
   `scripts/ops/assemble-launch-dossier.js` must be updated to accept managed receipts and assemble a
   valid Unified Launch Evidence Dossier for `vercel-managed-production` with `target_architecture: "vercel-managed-production"`.

3. **Comprehensive Tests and Runbook Integration**:
   - Update `scripts/ops/run-launch-drills.spec.js` and `scripts/ops/assemble-launch-dossier.spec.js`
     to verify managed drill execution and dossier assembly end-to-end.
   - Update `docs/launch-checklist.md` to document the unified drill invocation and dossier schema for `vercel-managed-production`.

This prompt builds the operator handoff intake template and unified launch drill reconciliation
for the Vercel-managed target. It authorizes no production deployment or launch sign-off.
Stop for phase-control approval before execution.

## References and verified interfaces

Read at execution:

- `AGENTS.md`, especially §§2, 2.1, 3, 5–10 and phase-control commands.
- `docs/build-plan.md` managed-target amendment, Prompt 370 §7, and Prompt 379 exit.
- `docs/vercel-deployment.md` "Target and gates", "Resume here", and Prompt 379 record.
- `docs/launch-checklist.md` "Selected managed profile — Prompt 370", 11 launch categories, and unified drill orchestrator specification.
- `docs/operator-handoff.md` and `infra/launch/operator-handoff.example.md`.
- `infra/launch/readiness.schema.json` and `infra/launch/readiness.vercel.example.json`.
- `scripts/ops/run-launch-drills.sh` and `scripts/ops/run-launch-drills.spec.js`.
- `scripts/ops/assemble-launch-dossier.js` and `scripts/ops/assemble-launch-dossier.spec.js`.
- `scripts/ops/check-launch-readiness.js` and `scripts/ops/check-launch-readiness.spec.js`.
- `scripts/vercel/check-vercel-config.js` and `scripts/ops/reconcile-storage-objects.js`.

## SKILLS USED

- `architecture-patterns` — clean discrimination between `single-host-compose-caddy` and `vercel-managed-production` operational profiles.
- `deployment-pipeline-design` — immutable release tracking, atomic rollback, and canary/preview promotion definitions.
- `secrets-management` — secret-store reference syntax, rotation lifecycles, and zero raw secrets in readiness and handoff records.
- `security-threat-model` — updating operational trust boundaries, evidence verification, and fail-closed readiness policies.
- `security-best-practices` — constant-time verification, sanitized reconciliation/drill output, and strict input validation.
- `postgres-best-practices` — read-only reconciliation queries and tenant context preservation.
- `javascript-testing-patterns` — comprehensive test coverage using Node test runner (`node:test`, `node:assert/strict`).
- `requesting-code-review` — stage 1 independent reviewer dispatch.
- `receiving-code-review` — stage 2 technical review evaluation and verification.
- `caveman-commit` — conventional commit formatting without AI trailers.

## Implementation sequence

### 1. Create managed operator handoff template (`infra/launch/operator-handoff.vercel.example.md`)

1. Model the complete operator intake package for `vercel-managed-production`:
   - **Target**:
     * Target Architecture: `vercel-managed-production`
     * Vercel Team ID (`team_*`), Project ID (`prj_*`), Region (`iad1` / `aws-us-east-1`)
     * Neon Project ID, Branch ID, Pooled Connection URL reference, Direct Migrator Connection URL reference
     * Vercel Blob Store ID (`store_*`)
     * Sandbox Scanner Snapshot ID (`snap_*`)
     * Resend Domain and sender policy reference
   - **Candidate**:
     * Reviewed full source Git SHA (40-char hex)
     * Vercel Current Deployment ID (`dpl_*`) and Deployment URL
     * Vercel Previous Deployment ID (`dpl_*`) and Deployment URL for instant rollback
     * Build provenance and deployment protection policy reference
   - **People / Roles**:
     * Operations lead, Release manager, Deployment approver, Rollback authority, Evidence custodian
     * Named suppliers and signers for all 11 managed categories
   - **Eleven Managed Categories Sign-off Table**:
     * Mapping 1:1 with `readiness.vercel.example.json`
     * `production_domain_tls`, `smtp_delivery`, `secrets_management`, `secret_references`,
       `slo_and_alerting`, `backup_and_disaster_recovery`, `data_retention_policy`,
       `volume_encryption`, `graphql_introspection`, `deployment_and_rollback`, `optional_ai_posture`
   - **Evidence Access & Action Boundary**:
     * Restricted store reference, custodian, allowed fields, access expiry
     * Fail-closed action boundaries requiring separate target/action/window/rollback authorization
2. Update `docs/operator-handoff.md`:
   - Document the managed handoff form alongside the Compose reference.
   - Specify the exact intake verification commands for both profiles.

### 2. Update unified launch drill orchestrator (`scripts/ops/run-launch-drills.sh`)

1. Add `--target-architecture <arch>` (or `--target-arch`) option:
   - Default to `single-host-compose-caddy` when omitted for 100% backward compatibility.
   - Reject unknown architectures fail-closed.
2. In `vercel-managed-production` mode:
   - **Stage 1 (static_templates)**: Run `run-static-integrity-checks.js` and `scan-secrets.sh`; omit `check-docker-runtime.sh` (which checks for Docker daemon).
   - **Stage 2 (supply_chain_sast)**: Run `generate-sbom.js`, `run-sast-scan.js`, and container check (or scanner snapshot audit).
   - **Stage 3 (ingress_deployment)**: Instead of `verify-caddy-routing.js` and `run-deployment-drill.sh` (which require Caddyfile and Docker Compose), run `node scripts/vercel/check-vercel-config.js` and emit managed ingress/deployment verification receipt (`managed-ingress-deployment-receipt.json`).
   - **Stage 4 (volume_encryption)**: Emit managed volume encryption receipt (`managed-volume-encryption-receipt.json`) verifying Neon AWS KMS AES-256 encryption at rest and ephemeral serverless compute isolation.
   - **Stage 5 (secret_rotation)**: Emit managed secret rotation receipt (`managed-secret-rotation-receipt.json`) verifying indirect store URIs (`vercel:...`, `neon:...`) and 90-day rotation runbook compliance.
   - **Stage 6 (capacity_alerting)**: Run `run-capacity-alerting-drill.sh` with live/dry-run options.
   - **Stage 7 (disaster_recovery)**: Execute storage reconciliation with `--provider vercel-blob` and emit managed disaster recovery receipt verifying Neon PITR point-in-time branch recovery preflight.

### 3. Update launch dossier assembler (`scripts/ops/assemble-launch-dossier.js`)

1. Teach `assemble-launch-dossier.js` to accept `--target-architecture <arch>`:
   - In `single-host-compose-caddy` mode: Preserve exact existing receipt names, validation checks, and dossier schema output.
   - In `vercel-managed-production` mode:
     * Accept managed stage receipts (`managed-ingress-deployment-receipt.json`, `managed-volume-encryption-receipt.json`, `managed-secret-rotation-receipt.json`, `managed-restore-drill-receipt.json`, `reconcile-report-receipt.json` with `provider: "vercel-blob"`).
     * Validate that emitted dossier sets `target_architecture: "vercel-managed-production"`.
     * Enforce fail-closed validation on all 7 stages.
2. Update unit test suites (`scripts/ops/assemble-launch-dossier.spec.js` and `scripts/ops/run-launch-drills.spec.js`):
   - Assert `run-launch-drills.sh --dry-run --target-architecture vercel-managed-production` succeeds and generates valid dossier.
   - Assert `assemble-launch-dossier.js` validates managed receipts and outputs valid dossier.
   - Assert existing Compose test cases continue to pass 100%.

### 4. Update launch checklist documentation (`docs/launch-checklist.md`)

1. Document the managed launch drill command:
   ```bash
   bash scripts/ops/run-launch-drills.sh --dry-run --target-architecture vercel-managed-production
   ```
2. Document the structure and validation of the Unified Launch Evidence Dossier for `vercel-managed-production`.
3. Update `docs/operations.md` and `docs/vercel-deployment.md` with the new drill capabilities.

### 5. Review, documentation, and local commit

1. Self-verify all changes, run `npm run ops:launch-drill-test` and `npm run ops:templates-test`, and review git diff.
2. Dispatch independent read-only reviewer via `requesting-code-review` subagent.
3. Evaluate reviewer feedback with `receiving-code-review`.
4. Update `docs/vercel-deployment.md`, `docs/launch-checklist.md`, `docs/operations.md`, `docs/operator-handoff.md`, and `docs/build-plan.md`.
5. Commit locally to `main` using `caveman-commit`. Do not push.

## Acceptance criteria

- `infra/launch/operator-handoff.vercel.example.md` exists, provides an exact intake form for `vercel-managed-production`, and models all 11 managed categories and deployment metadata without raw secrets.
- `docs/operator-handoff.md` documents intake completion for the managed profile.
- `scripts/ops/run-launch-drills.sh` supports `--target-architecture vercel-managed-production` without requiring local Docker daemon or Caddyfile.
- `scripts/ops/assemble-launch-dossier.js` supports assembling dossiers for both `single-host-compose-caddy` and `vercel-managed-production`.
- `npm run ops:launch-drill-test` passes all unit tests for both Compose and managed topologies.
- All template, ops, lint, typecheck, and server test suites pass.

## Verification

Execute with Node 24:

```bash
npm run ops:launch-drill-test
bash scripts/ops/run-launch-drills.sh --dry-run --target-architecture vercel-managed-production
npm run ops:templates-test
npm run lint
npm run typecheck
npm run test:server
git diff --check
```

## Non-goals, impact and rollback

- Non-goals: No production promotion; no paid tier upgrades; no custom domain assignment; no mock passes; no alteration of existing Compose+Caddy tests or fixtures.
- Impact: Extends launch drill orchestration and operator handoff tooling to support the Vercel-managed target while preserving the existing Compose self-hosted profile.
- Rollback: Revert changes to `scripts/ops/` and `infra/launch/`.

## Review and completion

Dispatch an independent reviewer subagent with baseline/HEAD identities, prompt, all changes, schema, and verification evidence. Evaluate feedback with technical rigor using `receiving-code-review`. Record results in `docs/vercel-deployment.md`, update `docs/build-plan.md`, and commit to `main` using `caveman-commit`.
