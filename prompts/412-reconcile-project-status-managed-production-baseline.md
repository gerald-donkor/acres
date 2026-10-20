# Prompt 412 — Reconcile Project Status with Managed Production Baseline

## Scope and why this is next

Parent: Phase 12 operations and launch hardening (`docs/build-plan.md` §13,
approved Prompt 370 Vercel migration amendment, and `docs/project-status.md`).
Planning baseline: `5b7eab023123e475a4fd60dea75b0472cff9db29` on `main`
(`docs(ops): reconcile checklist with managed baseline`, Prompt 411).
Re-verify HEAD and worktree cleanliness at execution time.

Context:
- Prompt 410 established the formal Managed Production Activation Plan and Operator Intake
  for `vercel-managed-production`, codifying the 7-stage live activation sequence and auditing
  the repository baseline against `infra/launch/readiness.vercel.example.json` (confirming
  0 approved categories, 11 unresolved categories, and 61 blockers in `docs/operations.md`).
- Prompt 411 reconciled `docs/launch-checklist.md` with the `vercel-managed-production` baseline,
  synchronizing all 11 category contracts in §3 with dual-topology verifiers, recording the
  authoritative 61-blocker managed preflight gap register in §6A, establishing the dual-profile
  pre-launch sign-off matrix in §7, and appending operational entries for Prompts 403–411.
- Prompts 370 through 411 have implemented, tested, and preview-verified the complete
  Vercel-managed platform architecture: Neon pooled PostGIS database adapter under forced RLS,
  private Blob uploads with quarantine isolation, invocation-scoped Nest serverless adapter,
  Vercel Cron dispatch, Resend email transport, transactional outbox with durable job recovery,
  preview deployment (`dpl_AGwu9k8gbtQRegTodmHUAL7uxYs4`), Sandboxed ClamAV scanning with live
  EICAR rejection and clean upload acceptance, candidate adoption (`snap_8OP5G2tCUvxtRdoGFMCu5se58f3N`),
  and Tier 2 snapshot retirement establishing a steady-state 2-snapshot baseline (~922 MB reclaimed).

Why this is next:
`docs/project-status.md` is the authoritative whole-project status assessment document
mandated by `AGENTS.md` §0 ("the dated whole-project V1 completion estimate, evidence-backed
feature inventory, engineering gaps and operator-owned launch handoff; estimates never approve launch")
and `docs/build-plan.md` §0 ("See project-status.md for the dated whole-project assessment;
code, git history and the phase evidence below remain the implementation proof").
However, `docs/project-status.md` is currently frozen at the historical 2026-10-14 baseline
(`dd36684`, Prompt 363) and suffers from five major synchronization discrepancies:
1. **Assessment Date & Baseline**: Dated 2026-10-14 at source baseline `dd36684` (Prompt 363),
   pre-dating all 48 subsequent commits (`364` through `411`).
2. **Managed Target Status**: States that Prompt 370 is merely "in progress", with completion
   percentages reflecting only the historical reference profile, before any Vercel implementation,
   preview verification, snapshot retirement, or checklist reconciliation took place.
3. **Capabilities Inventory ("What is built")**: Omits the Vercel-managed serverless runtime
   adapters, Neon pooled database integration, private Blob uploads, and Sandbox ClamAV scanner
   integration from the built feature inventory.
4. **Closed V1 Milestones**: Section 3 ("Closed V1 engineering and acceptance milestones") ends
   at milestone 4 (Prompt 363, Oct 14). It completely omits the four completed engineering and
   acceptance milestones covering the Vercel-managed target (Prompts 370–411).
5. **Operator-Owned Launch Work**: Section 4 describes only `single-host-compose-caddy`
   requirements (referencing Compose images, 9 stateful host mounts, and Caddy routing), completely
   lacking the dual-topology presentation, the 61-blocker managed baseline, and the managed operator
   handoff requirements established in Prompts 410 and 411.
6. **Operator Handoff Guide Alignment**: `docs/operator-handoff.md` contains historical anchor
   links to `launch-checklist.md#6a-production-evidence-preflight-gap-register--2026-10-14` and
   a Compose-only consolidated request that should be updated to support both topologies.

This prompt reconciles `docs/project-status.md` and `docs/operator-handoff.md` with the current
operational baseline (commit `5b7eab0`, 2026-10-20), accurately documenting the completed
managed engineering milestones, updating the completion assessment, and presenting the dual-topology
operator launch requirements while maintaining strict fail-closed release governance.

Stop for phase-control approval before execution.

## References and evidence boundary

Read before execution:
- `AGENTS.md` (Workflow §2, Invariants §1, Build sequence §8.2, Standing rules §9, §10).
- `docs/project-status.md` (the whole-project status assessment document being reconciled).
- `docs/operator-handoff.md` (the operator handoff completion guide).
- `docs/launch-checklist.md` (reconciled dual-topology category contracts §3, gap registers §6A/§6B, sign-off matrix §7).
- `docs/operations.md` (Prompt 410 activation plan, operator intake audit, Prompt 411 checklist reconciliation).
- `docs/vercel-deployment.md` (Prompt 370 through 411 deployment, preview verification, snapshot retirement).
- `docs/build-plan.md` (§13 Phase 12, Phase 12K, Prompt 370 amendment, Prompts 370–411 build records).
- `infra/launch/readiness.vercel.example.json` (61 blockers, fail-closed preflight).
- `infra/launch/readiness.example.json` (70 blockers, fail-closed preflight).
- `infra/launch/operator-handoff.vercel.example.md` & `infra/launch/operator-handoff.example.md`.
- `scripts/ops/check-launch-readiness.js` and `scripts/ops/launch-readiness.sh`.

Static visual references, crops, pixel measurements, and breakpoint deltas do not apply:
this is an operational governance and documentation reconciliation task with no UI changes.
No runtime Next.js, NestJS, database schema, or API contracts change.

## SKILLS USED

- `deployment-pipeline-design` — loaded during planning; multi-stage pipeline, promotion gates,
  dual-topology release orchestration, and rollback prerequisites.
- `secrets-management` — loaded during planning; 12 indirect managed secret references,
  preventing credential leakage in status reports, and rotation governance.
- `requesting-code-review` — mandatory code review dispatch after self-verification.
- `receiving-code-review` — evaluate feedback with technical rigor before making changes.
- `caveman-commit` — write required concise conventional commit message.

Re-read these skills during execution.

## Execution steps

1. **Verify Baseline State**:
   - Confirm git branch is `main`, worktree is clean, and HEAD matches `5b7eab0` (or explain difference).
   - Re-verify repository preflights:
     - `node scripts/vercel/check-vercel-config.js` (must pass with exit 0).
     - `npm run ops:managed-drills-test` (all 28 tests must pass).
     - `npm run ops:launch-readiness:managed` (must exit 1 fail-closed, reporting 61 blockers, 0 approved, 11 unresolved).

2. **Reconcile `docs/project-status.md` Assessment Baseline & Completion Estimate**:
   - Update Assessment Date to `2026-10-20` and Source Baseline to `5b7eab0` on `main` (Prompt 411).
   - Update Section 1 ("Managed target amendment — 2026-10-15"):
     - Record that the engineering implementation and preview verification of Prompt 370 is
       **100% complete** across Prompts 370–411 (including pooled Neon RLS, private Blob uploads,
       invocation-scoped Nest serverless execution, Cron, Resend, preview deployment `dpl_AGwu9k8gbtQRegTodmHUAL7uxYs4`,
       live Sandbox ClamAV scanning, 2-snapshot retirement baseline, 7-stage activation plan, and
       dual-topology launch checklist reconciliation).
     - Emphasize that account-bound production provisioning, DNS, live drills, and the 11 human sign-offs
       remain open and operator-owned.
   - Update Section 2 ("Completion estimate"):
     - Maintain the 75/75 (100%) score across all six core application capability areas.
     - Re-evaluate "Operations, security verification and production launch" (weight 25):
       - Automated tooling, drill runners, verifiers, and test suites are 100% built and verified
         for BOTH `single-host-compose-caddy` and `vercel-managed-production` (28/28 managed drill tests,
         33 offline preflight stages, dual-topology readiness checker).
       - Earned points updated from 16 to 19 / 25 points, bringing total estimated project completion
         to **94%** (range: 92–96%).
       - Strictly reiterate the immutable project principle: **Engineering completeness does NOT
         approve launch.** The remaining 6 points are strictly reserved for external operator-supplied
         production credentials, DNS, live launch drills, and the 11 signed human approvals under Prompt 201.

3. **Reconcile `docs/project-status.md` Feature Inventory ("What is built")**:
   - Expand the capabilities table to include:
     - Vercel-managed serverless runtime, Neon pooled PostGIS RLS adapter, private Blob storage,
       and invocation-scoped Nest execution (`packages/shared/`, `server/src/`, `vercel.json`; Prompts 370–379).
     - Sandbox ClamAV quarantine scanning, candidate lifecycle safety, preview adoption, and
       2-snapshot steady-state retirement (`scripts/vercel/`, `snap_8OP5G2tCUvxtRdoGFMCu5se58f3N`; Prompts 383–409).
     - Dual-topology operations, managed launch drill verifiers, 7-stage activation plan, and
       reconciled launch checklist (`scripts/ops/`, `infra/launch/`, `docs/launch-checklist.md`; Prompts 380–382, 410–411).

4. **Add Milestones 5–8 to `docs/project-status.md` ("Closed V1 engineering and acceptance milestones")**:
   - Document the four major managed engineering milestones completed since 2026-10-14:
     - **Milestone 5: Managed Platform Architecture & Serverless Adapters (Prompts 370–379)**:
       Neon pooled connection adapter under forced RLS, private Vercel Blob upload/download tokens,
       invocation-scoped Nest serverless execution, Vercel Cron dispatch with timing-safe header validation,
       Resend email provider transport, and transactional outbox job reconciliation.
     - **Milestone 6: Dual-Architecture Operations & Managed Verifier Suite (Prompts 380–382)**:
       Managed operator handoff template, managed readiness template (`readiness.vercel.example.json`),
       branched drill runner (`run-launch-drills.sh --target-architecture vercel-managed-production`),
       and 4 dedicated managed verifiers with 28/28 tests passing (`ops:managed-drills-test`).
     - **Milestone 7: Preview Deployment, Sandboxed Scanning & Candidate Adoption (Prompts 383–398, 403–408)**:
       Live Vercel preview deployment `dpl_AGwu9k8gbtQRegTodmHUAL7uxYs4`, Firecracker Sandbox ClamAV
       quarantine scanning proven with real EICAR malware rejection and clean upload acceptance,
       and candidate adoption of `snap_8OP5G2tCUvxtRdoGFMCu5se58f3N`.
     - **Milestone 8: Steady-State Snapshot Retirement, Activation Plan & Checklist Reconciliation (Prompts 409–411)**:
       Tier 2 snapshot retirement reclaiming ~922 MB establishing steady-state 2-snapshot baseline,
       formal 7-stage Managed Production Activation Plan auditing 61 blockers, and Launch Checklist
       dual-topology category contracts and sign-off matrix reconciliation.

5. **Reconcile `docs/project-status.md` Section 4 ("Operator-owned launch work")**:
   - Structure Section 4 to clearly present both supported production profiles:
     - **Profile A (`single-host-compose-caddy`)**: 70 blockers in `infra/launch/readiness.example.json`.
     - **Profile B (`vercel-managed-production`)**: 61 blockers in `infra/launch/readiness.vercel.example.json`.
   - Update the operator-owned launch requirements table to detail required operator inputs and
     verifier commands for both topologies across all 11 categories:
     - Domain & TLS: Compose Caddy vs Vercel Edge TLS.
     - SMTP: Local SMTP vs Resend provider.
     - Secrets: Compose host env vs Vercel Project Production Env + Neon role secrets (7 indirect keys).
     - SLOs: Prometheus scrape targets vs Vercel analytics & alert webhooks.
     - DR: Local pg_dump/restore + Garage S3 vs Neon WAL streaming PITR (7-day window) + Blob durability.
     - Retention: Signed retention policies (accounts, audit, reports).
     - Encryption: 9 host mounts vs Neon AWS KMS AES-256 + Blob encryption + Firecracker RAM.
     - GraphQL: Introspection policy disablement/probe.
     - Deployment: Compose image digests vs immutable Vercel deployment pair (`dpl_*`).
     - AI Posture: `ai_draft_enabled: false` attestation + absent Gemini key verification.

6. **Reconcile `docs/operator-handoff.md`**:
   - In §2 ("Completion order"), update line 85 to reference both gap registers:
     `[Compose gap register](launch-checklist.md#6a-historical-compose-production-evidence-preflight-gap-register--2026-10-14)`
     and `[Managed gap register](launch-checklist.md#managed-production-evidence-preflight-gap-register--2026-10-20-prompt-410--411)`.
   - In §3 ("Consolidated request to use through the approved channel"), expand the prompt text
     to explicitly support both topologies:
     - For Compose: opaque environment ID, host/FQDN, materialized Compose/Caddy IDs and revisions, image pair digests.
     - For Managed: Vercel Project Production ID, custom production FQDN, immutable Vercel deployment ID pair (`dpl_*`),
       Neon project ID, Blob store ID, and Resend sender domain.

7. **Update Owning Documentation**:
   - `docs/operations.md`: Record completion of Prompt 412 and project status reconciliation.
   - `docs/vercel-deployment.md`: Update Phase 12 status to record project status reconciliation.
   - `docs/build-plan.md`: Add concise Phase 12 build entry for Prompt 412.

8. **Verification and Checks**:
   - Run offline checks: `node scripts/vercel/check-vercel-config.js`
   - Run managed drill tests: `npm run ops:managed-drills-test`
   - Run launch readiness preflights:
     - `npm run ops:launch-readiness:managed` (must exit 1, 61 blockers)
     - `npm run ops:launch-readiness` (must exit 1, 70 blockers)
   - Run secret scan: `npm run ops:scan-secrets`
   - Run lint: `npm run lint`
   - Run typecheck: `npm run typecheck`
   - Run build: `npm run build`
   - Check git diff: `git diff --check`

9. **Code Review and Local Commit**:
   - Dispatch reviewer subagent via `requesting-code-review`.
   - Evaluate feedback via `receiving-code-review`.
   - Stage reviewed files.
   - Commit locally to `main` with `caveman-commit`.
   - Do NOT push (`P` command remains separate).

## Files and expected impact

- `prompts/412-reconcile-project-status-managed-production-baseline.md`: implementation prompt.
- `docs/project-status.md`: reconciled whole-project status assessment, completion estimate, milestones 5–8, dual-topology operator launch requirements.
- `docs/operator-handoff.md`: reconciled anchor links and dual-topology consolidated operator request.
- `docs/operations.md`: records Prompt 412 completion.
- `docs/vercel-deployment.md`: records Prompt 412 completion.
- `docs/build-plan.md`: updates Phase 12 build record.
- No changes to runtime application code, database schema, API contracts, or dependencies.

## Non-goals and rollback

- No declaring production launch approved (remains blocked and operator-owned).
- No modifying example readiness JSON files to manufacture a passing state (must remain fail-closed).
- No git push (`P` protocol is outside prompt execution).
- Rollback: ordinary local git revert; no external state or database migration is created.
