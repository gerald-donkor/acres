# Prompt 410 — Managed production activation plan and operator intake

## Scope and why this is next

Parent: Phase 12 operations and launch hardening (`docs/build-plan.md` §13,
approved Prompt 370 Vercel migration amendment, and `docs/vercel-deployment.md`).
Inspected baseline: clean `main` at `1ef1aa81cad163d869161dc59966539111edc818`
(`docs(ops): record scanner snapshot retirement tier 2`, Prompt 409).
Re-verify HEAD and worktree cleanliness at execution time.

Context:
- Prompt 408 completed guarded adoption of ClamAV snapshot `snap_8OP5G2tCUvxtRdoGFMCu5se58f3N`
  and its digests into Vercel preview project configuration, matching validated
  deployment `dpl_AGwu9k8gbtQRegTodmHUAL7uxYs4`.
- Prompt 409 completed Tier 2 snapshot retirement against the preview target,
  deleting expired snapshots `snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN` and
  `snap_ngIwnQplocPoUR0A6cewfCGrFAbX`, reclaiming ~922 MB and establishing the
  steady-state 2-snapshot baseline (`snap_8OP5…` active, `snap_KBaj…` rollback).
- The full application upload scanning lifecycle and tenant RLS isolation on Vercel
  are verified through live test receipts (clean upload accepted, EICAR rejected fail-closed,
  and cross-tenant data completely segregated).

Why this is next:
In `docs/build-plan.md` and `docs/vercel-deployment.md`, the documented post-retirement
gates are:
1. **Hosted scheduled cadence / workflow source publication**: requires a standalone
   uppercase `P` from the user to push reviewed commits (`b9f3821` through HEAD) to
   `origin/main`. Under `AGENTS.md`, prompt execution never pushes.
2. **Managed production activation plan**: the historical activation plan (Prompt 367)
   and intake (Prompt 368) were authored strictly for the Compose+Caddy topology
   (`single-host-compose-caddy`), assuming local Docker container images, Caddyfile checksums,
   host mounts, and local container backups. While Prompts 380–382 established the
   managed handoff template (`infra/launch/operator-handoff.vercel.example.md`),
   managed readiness template (`infra/launch/readiness.vercel.example.json`),
   branched drill runner (`scripts/ops/run-launch-drills.sh --target-architecture vercel-managed-production`),
   and four managed verifiers, the repository has not yet established the formal
   **Managed Production Activation Plan and Operator Intake** for `vercel-managed-production`.
3. **Phase 12 exit and the eleven sign-offs**: governed by Prompt 201, requiring verified
   operator inputs, authentic live receipts, and named sign-offs across all 11 categories.

This prompt bridges the gap between preview verification and final production activation:
it defines the exact, fail-closed operational sequence for activating a release on
`vercel-managed-production`, conducts the formal repository-level intake audit against
`infra/launch/operator-handoff.vercel.example.md` and `infra/launch/readiness.vercel.example.json`,
identifies all 61 current blockers and 11 unresolved categories, and publishes the structured
operator intake questionnaire.

Stop for phase-control approval before execution.

## References and evidence boundary

Read before execution:
- `AGENTS.md` (§§2–7, 10, phase-control commands, and prompt-file contract).
- `docs/build-plan.md` (§13 Phase 12, production target amendment, and Prompt 409 record).
- `docs/vercel-deployment.md` (managed topology, preview deployment, adoption, retirement, and next gates).
- `docs/operations.md` (production topology, managed runbooks, and verification records for Prompts 370–409).
- `docs/launch-checklist.md` (§1 top-level validation, §3 category contracts, §6A operator handoff, §7 sign-off matrix).
- `docs/operator-handoff.md` (managed intake completion guide).
- `docs/system-architecture.md` (§11 target architecture and runtime security).
- `docs/security.md` (threat model and production trust boundaries).
- `infra/launch/operator-handoff.vercel.example.md` (managed operator handoff template).
- `infra/launch/readiness.vercel.example.json` and `infra/launch/readiness.schema.json` (managed readiness record and schema).
- `infra/vercel/runbooks/managed-operations.md` (managed operations runbook).
- `prompts/201-production-launch-evidence-and-signoff.md` (canonical launch evidence procedure).
- `prompts/367-operator-production-evidence-activation.md` and `prompts/368-production-target-and-authority-intake.md` (historical Compose activation/intake references).
- `prompts/380-managed-operator-handoff-and-drill-reconciliation.md`, `prompts/381-managed-launch-readiness-and-static-integrity-reconciliation.md`, and `prompts/382-managed-verifier-unit-tests-and-preflight-suite.md`.

Planning inspected git history, checked-in managed launch templates, drill runner scripts,
and test specifications. No live external production environment or private secrets were accessed.
Static design references, crops, and breakpoint changes are inapplicable: no UI styling changes are in scope.

## SKILLS USED

- `deployment-pipeline-design` — multi-stage production promotion, rollout gates, and instant deployment rollback for Vercel.
- `secrets-management` — indirect secret references across Vercel and Neon, rotation procedures, zero raw secrets in git/logs.
- `security-best-practices` — secure-by-default production boundaries, edge TLS/HSTS, least privilege, and no-AI production attestation.
- `postgres-best-practices` — Neon database migrations, connection pooling vs direct migrator roles, WAL streaming PITR recovery.
- `requesting-code-review` — mandatory independent review dispatch following self-verification.
- `receiving-code-review` — rigorous technical evaluation of code review feedback.
- `caveman-commit` — conventional, terse commit messages.

Re-read these skills during execution. Generic skill examples do not override the
repository's pinned Node 24.21.0, Next 16.3, Prisma 7, or Vercel-managed target boundaries.

## Authority and boundaries

This prompt:
- Does **NOT** deploy to production, modify production DNS, assign production aliases, or trigger live failovers.
- Does **NOT** request or accept raw credentials, private keys, database connection strings, or secret values into git or chat.
- Does **NOT** fabricate receipts, invent operator approvals, or claim launch readiness while blockers remain.
- Formulates the exact operator intake requirements for `vercel-managed-production`, executes repository-visible readiness checks, and documents the fail-closed status.

## Execution steps

### Phase A: Baseline verification and readiness preflight

1. Verify git status and starting baseline:
   ```bash
   git status --short
   git branch --show-current
   git rev-parse HEAD
   ```
   Confirm clean working tree and resolve starting commit SHA.

2. Run the top-level managed launch readiness preflight against the checked-in example:
   ```bash
   npm run ops:launch-readiness:managed
   ```
   (Equivalent to `scripts/ops/launch-readiness.sh --target-architecture vercel-managed-production infra/launch/readiness.vercel.example.json`).
   - Record exact exit code (expected `1`).
   - Record summary: 11 total required categories, 0 approved categories, 11 unresolved categories, and 61 detected blockers.
   - Confirm fail-closed behavior: no premature approval or bypassed validation.

3. Run the four managed drill verifier test specifications:
   ```bash
   npm run ops:managed-drills-test
   ```
   Confirm all test specifications pass cleanly (100% pass across `verify-managed-ingress.spec.js`,
   `verify-managed-volume-encryption.spec.js`, `verify-managed-secret-rotation.spec.js`,
   and `verify-managed-restore-drill.spec.js`).

4. Verify Vercel configuration validity:
   ```bash
   npm run vercel:check
   ```
   Confirm `vercel.json` configuration passes validation (`exit 0`).

### Phase B: Managed Production Activation Plan Specification

Formulate and document the formal production activation procedure for `vercel-managed-production`,
comprising seven ordered stages:

1. **Stage 1 — Pinned Source, Release Provenance, and Repository Preflights**:
   - Pinned 40-character Git commit on `main`.
   - Verification of zero uncommitted drift, clean `git diff --check`, passed lint, sequential typecheck,
     production build (`23/23` pages), and secret scan (`npm run ops:scan-secrets`).
   - Vercel CLI/API deployment provenance tracking linking the deployment directly to the commit SHA.

2. **Stage 2 — Out-of-Band Neon Database Migration**:
   - Out-of-band migration execution via `prisma migrate deploy` using the direct Neon migrator URL
     (`DATABASE_MIGRATOR_URL`), isolated from runtime application compute.
   - Verification of zero destructive migrations; backward-compatible schema expansion ensuring
     rollback safety for existing deployments.
   - Verification that runtime application compute uses only restricted pooled credentials (`acres_app` role
     via Neon connection pooler) with forced RLS and zero schema alteration privileges.

3. **Stage 3 — Production Secrets & Environment Variables Materialization**:
   - Verification of twelve distinct indirect secret references configured across Vercel Project Environment
     Variables (Production scope) and Neon project settings:
     `SESSION_SECRET`, `CSRF_SECRET`, `CRON_SECRET`, `DATABASE_MIGRATOR_URL`, `DATABASE_URL`,
     `BLOB_READ_WRITE_TOKEN`, `SCANNER_SANDBOX_SNAPSHOT_ID`, `SCANNER_MAIN_SHA256`, `SCANNER_DAILY_SHA256`,
     `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `ALERT_WEBHOOK_URL`.
   - Explicit confirmation of `AI_DRAFT_ENABLED=false` and zero Gemini API keys provisioned.
   - Verification of 90-day secret rotation runbook reference and least-privilege scoping.

4. **Stage 4 — Production Build, Deployment, and Edge Routing**:
   - Triggering immutable production deployment via Vercel CLI / Git integration.
   - Capturing immutable deployment ID (`dpl_*`) and deployment URL.
   - Production custom domain assignment at Vercel Edge with automatic managed TLS and HSTS approval.

5. **Stage 5 — Managed Launch Drill Execution & Verifier Receipts**:
   - Execution of unified launch drills in live mode:
     `scripts/ops/run-launch-drills.sh --target-architecture vercel-managed-production`
   - Gathering authentic receipts across the drill stages:
     - Stage 1: Static template integrity and secret scan.
     - Stage 2: Supply chain SBOM and SAST scan.
     - Stage 3: Managed ingress, security headers, and rollback preflight (`verify-managed-ingress.js`).
     - Stage 4: Managed volume encryption, Neon AWS KMS AES-256, and Firecracker sandbox isolation (`verify-managed-volume-encryption.js`).
     - Stage 5: Managed secret rotation cadence (90 days) and indirect reference verification (`verify-managed-secret-rotation.js`).
     - Stage 6: Capacity target (100 rps), latency target (p95 < 500ms), and Prometheus/alerting webhook verification.
     - Stage 7: Managed disaster recovery, Neon 7-day WAL PITR window, and Blob durability verification (`verify-managed-restore-drill.js`).
   - Assembling unified launch dossier via `scripts/ops/assemble-launch-dossier.js`.

6. **Stage 6 — Storage Parity Reconciliation and Live Post-Deployment Journeys**:
   - Running live storage reconciliation against production Blob store:
     `node scripts/ops/reconcile-storage-objects.js --provider vercel-blob`
   - Executing live smoke journeys: authentication, organization creation, dataset creation, private Blob upload,
     fail-closed Sandbox scanning, analytics aggregation, report generation, and CSV export.

7. **Stage 7 — Operator Sign-Off Dossier & Prompt 201 Determination**:
   - Compiling authentic receipts into the operator's private readiness record outside git.
   - Validation via `node scripts/ops/check-launch-readiness.js <operator-readiness.json>`.
   - Recording explicit, dated sign-offs across all 11 categories from named human authorities.
   - Formal go/no-go release determination.

### Phase C: Operator Target and Authority Intake for `vercel-managed-production`

Formulate and document the structured intake questionnaire and current readiness evaluation
for the human operator, addressing all 11 required categories:

| Category | Managed Property / Requirement | Current Status | Operator Input Needed |
| --- | --- | --- | --- |
| 1. Production Domain & Edge TLS | Custom production domain, Vercel Edge TLS, HSTS policy approval | Unresolved (placeholder) | Production domain name, TLS contact email, HSTS policy confirmation |
| 2. SMTP Delivery | Resend integration, verified sender domain, DKIM/SPF alignment | Unresolved (placeholder) | Resend verified sender domain, from-address, delivery & bounce runbook ref |
| 3. Secrets Management | Vercel Project Production Env + Neon role secrets, 90-day rotation | Unresolved (placeholder) | Secret injection approval, masking policy confirmation, compromise runbook ref |
| 4. Secret References | 12 distinct indirect secret names in production scope | Unresolved (placeholder) | Exact opaque secret store references for all 12 variables (no values!) |
| 5. SLOs & Alerting | Availability ≥99.9%, p95 < 500ms, capacity ≥100 rps, webhook alerts | Unresolved (placeholder) | Named alert recipient, escalation runbook reference, adopted SLO targets |
| 6. Backup & Disaster Recovery | Neon WAL streaming PITR (7-day window, RPO ≤1h, RTO ≤4h), Blob durability | Unresolved (placeholder) | Backup destination identifier, Blob store durability attestation, DR plan ref |
| 7. Data Retention Policy | Account, audit, and report retention enforcement | Unresolved (placeholder) | Signed retention policies (legal/compliance approved) for accounts, audit, reports |
| 8. Volume Encryption | Neon AWS KMS AES-256 storage, Blob at-rest encryption, Firecracker RAM | Unresolved (placeholder) | Encryption mechanism approval, key custody & recovery owner identity |
| 9. GraphQL Introspection | Production introspection policy (disabled or justified) | Unresolved (placeholder) | Introspection disablement confirmation or approved security justification |
| 10. Deployment & Rollback | Immutable deployment pair (`dpl_*`), instant rollback authority | Unresolved (placeholder) | Deployment approver, rollback authority, previous deployment ID for instant rollback |
| 11. No-AI Posture | API & worker `ai_draft_enabled: false`, absent Gemini key | Unresolved (placeholder) | Product & security sign-off affirming zero AI in production and unpaid provider exclusion |

### Phase D: Canonical Documentation Updates, Quality Checks, Review & Commit

1. **Update `docs/operations.md`**:
   - Add new section: `## Prompt 410 — managed production activation plan and operator intake (<date>)`.
   - Record the complete 7-stage managed activation sequence.
   - Record the formal intake audit: starting baseline, command outputs (`npm run ops:launch-readiness:managed`),
     the 61 identified blockers, and the intake requirements table.
   - Reaffirm that no production mutations, credentials, or bypasses occurred.

2. **Update `docs/vercel-deployment.md`**:
   - Update header next gates and Phase 12 transition notes: mark the managed production activation plan
     and operator intake framework as established.
   - Update the status of remaining launch requirements: hosted cadence source publication (awaiting standalone `P`),
     operator-supplied intake values/credentials, live drill execution, and the eleven sign-offs.

3. **Update `docs/build-plan.md`**:
   - Add concise entry under Phase 12 summarizing Prompt 410 execution.

4. **Run Repository Verification**:
   - `npm run ops:scan-secrets`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
   - `git diff --check`
   - Quote actual command outputs in the documentation.

5. **Code Review and Commit**:
   - Dispatch independent reviewer subagent via `requesting-code-review`.
   - Evaluate feedback via `receiving-code-review`.
   - Stage reviewed documentation files.
   - Commit locally to `main` with `caveman-commit`.
   - Do NOT push (`P` command remains separate).

## Files and expected impact

- `prompts/410-managed-production-activation-plan.md`: implementation prompt.
- `docs/operations.md`: records the managed production activation plan and intake audit.
- `docs/vercel-deployment.md`: records activation plan completion and remaining launch gates.
- `docs/build-plan.md`: updates Phase 12 build record.
- No changes to runtime application code, database schema, API contracts, or dependencies.

## Non-goals and rollback

- No live production deployment, domain creation, or alias change.
- No editing of `infra/launch/readiness.vercel.example.json` to manufacture a passing state (example must remain fail-closed).
- No git push (`P` protocol is outside prompt execution).
- Rollback: ordinary local git revert; no external state or database migration is created.
