# Prompt 365 — Reconcile Launch Checklist with V1 Release Candidate Baseline

## Scope and why next

Committed baseline: `32cbae6` on `main`. Worktree is clean.

In Prompt 364 (`32cbae6`), the repository established the formal V1 Release Candidate baseline across `docs/project-status.md`, `docs/build-plan.md`, and `docs/operations.md`, confirming that **100% of application capabilities (75/75 points)** and **91% of whole-project milestones (91/100 points)** are completed following the closure of all four V1 engineering milestones (tenant-scoped `/app/audit` workspace, authoritative 11-phase real PostgreSQL/PostGIS data journey under forced RLS, release verification refresh and triage across 3 workspaces, and live infrastructure failure acceptance).

However, while `docs/project-status.md` and `docs/operations.md` reflect the V1 Release Candidate baseline, `docs/launch-checklist.md` §6A's "Production evidence preflight gap register" and "Operator handoff" repository prefill remain pinned to historical commits from late September 2026 (`3da8949`, `efb36d5`, `5a1cc5e`). Those sections do not account for:
1. The closure of the 4 V1 engineering milestones in Prompts 358 through 363.
2. The verified V1 Release Candidate baseline at commit `dd36684` / `32cbae6`.
3. The current verification state across all 11 launch categories:
   - **Category 1 (`production_domain_tls`)**: Caddy verifier passes 18/18 routes; security headers, S3 SigV4 host preservation, and HSTS policy gating verified.
   - **Category 2 (`smtp_delivery`)**: SMTP configuration template keys and password recovery / invitation delivery verified against DKIM/SPF expectations.
   - **Category 3 (`secrets_management`)**: Runtime secret scanning and 7 credential classes verified; zero leaks in logs or artifacts.
   - **Category 4 (`secret_references`)**: 12 distinct indirect secret sources mapped in schema and templates; `CSRF_SECRET` isolated.
   - **Category 5 (`slo_and_alerting`)**: 11 operational Prometheus alert rules verified; measured query plan gates passing (6/6 analytics, 2/2 spatial PostGIS); capacity load evaluator preflight passing.
   - **Category 6 (`backup_and_disaster_recovery`)**: Automated `backup-postgres.sh`, `restore-postgres.sh`, and `reconcile-storage-objects.js` scripts hardened (Prompts 305–356); 13/13 infrastructure failure acceptance tests passing under forced RLS.
   - **Category 7 (`data_retention_policy`)**: Export artifact retention purge batch bounds and download expiration enforcement verified.
   - **Category 8 (`volume_encryption`)**: 9 stateful mount paths and key separation verified by `verify-volume-encryption.js`.
   - **Category 9 (`graphql_introspection`)**: Production introspection probe verification policy established.
   - **Category 10 (`deployment_and_rollback`)**: Next.js 16.3.8 compiling 23/23 routes cleanly; Nest server compiling cleanly; release image environment checks and zero-downtime rollback drill verified.
   - **Category 11 (`optional_ai_posture`)**: AI draft feature disabled by default (`ai_enabled: false`, `AI_DRAFT_ENABLED=false`), unpaid Gemini key absent, and three deterministic core journeys verified.

This prompt reconciles `docs/launch-checklist.md` §6A to align with the V1 Release Candidate baseline (`dd36684`), updates the repository prefill and operator handoff with the latest candidate metrics, documents the exact preflight status for each of the 11 categories, and records the verification in `docs/build-plan.md` and `docs/operations.md`.

## Reference material

Read:
- `AGENTS.md` (Workflow §2, Invariants §1, Build sequence §8.2, Standing rules §9)
- `docs/launch-checklist.md` (§1–7, specifically §6A preflight gap register and operator handoff)
- `docs/project-status.md` (V1 baseline at `dd36684`, 100% application completion, operator handoff table)
- `docs/operations.md` (Prompts 357–364 verification records, production templates, preflight checks)
- `docs/build-plan.md` (§13 Phase 12, §22 Phase 12K verification records)
- `docs/system-architecture.md` (target production topology and module boundaries)
- `docs/security.md` (threat model, trust boundaries, sanitized failure boundaries)
- `prompts/201-production-launch-evidence-and-signoff.md` (operator launch evidence preconditions)

Inspect:
- `infra/launch/readiness.example.json` and `infra/launch/readiness.schema.json`
- `scripts/ops/check-launch-readiness.js`
- `scripts/ops/launch-readiness.sh`
- `scripts/ops/run-launch-drills.sh`

## Deliverables and allowed files

1. **Update `docs/launch-checklist.md`**:
   - Refresh Section 6A ("Production evidence preflight gap register"):
     - Update the assessment date to `2026-10-14` and source baseline to `dd36684` on `main` (V1 Release Candidate).
     - Update the 11-category gap register table to reflect the candidate's verified preflight status:
       - Detail the current offline tooling, verified test coverage, and exact remaining operator decisions for each category.
       - Reaffirm that all 11 categories remain `unresolved` until live target infrastructure, real operator evidence, and human approver signatures are supplied under Prompt 201.
     - Update Section 6A ("Shared prerequisites and stage binding") to reference the V1 Release Candidate baseline.
     - Update Section 6A ("Operator handoff") repository prefill table:
       - Update source snapshot inspected to `dd36684` on `main`.
       - Update the verified local test baseline: 23/23 Next.js routes, 120 server unit test suites (1876/1876 tests), 8 real PostgreSQL/PostGIS database E2E suites (159/159 tests under forced RLS), 85 Playwright browser tests, 6/6 analytics and 2/2 spatial EXPLAIN query plan gates, and 33 offline operations preflights (27 test suites, 182 drill tests).
       - Record the Prompt 365 preflight intake date (`2026-10-14T10:30:00Z UTC`) and reviewed source commit `dd36684`.

2. **Update `docs/build-plan.md`**:
   - Add the verification record for Prompt 365 under §22 Phase 12K.
   - Summarize the reconciliation of the launch checklist preflight gap register and repository prefill with the V1 Release Candidate baseline.

3. **Update `docs/operations.md`**:
   - Add the Prompt 365 section recording the launch checklist reconciliation, updated gap register, and verification check outputs.

4. **Verify Fail-Closed Launch Posture**:
   - Confirm `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` exits 1 with 70 blockers across 11 unresolved categories.

Only documentation files (`docs/launch-checklist.md`, `docs/build-plan.md`, `docs/operations.md`) and this prompt file may be modified. No runtime application code, schema, API contracts, or production templates may be altered.

## Expected impact and non-goals

- **Expected impact**:
  - Aligns the operator launch checklist (§6A gap register and repository prefill) with the official V1 Release Candidate baseline (`dd36684`).
  - Eliminates stale September 2026 references (`3da8949`, `efb36d5`, `5a1cc5e`) from the launch checklist, ensuring operators evaluate the current release candidate state.
  - Maintains strict fail-closed posture: all 11 categories remain unresolved pending live operator infrastructure, drills, and sign-offs under Prompt 201.

- **Non-goals**:
  - Does NOT alter runtime application code, database schema, or API contracts.
  - Does NOT execute live production deployment, secret rotation, or physical disaster recovery cutover (governed by Prompt 201).
  - Does NOT modify `infra/launch/readiness.example.json` to make it pass artificially; the example must remain fail-closed until live operator evidence is supplied.
  - Does NOT fabricate operator signatures or claim live production approval.

## Verification plan

Run the standard check suite to verify repository integrity and documentation consistency:
1. `git diff --check`
2. `npm run contracts:check`
3. `npm run lint`
4. `npm run typecheck`
5. `npm run build`
6. `npm run ops:check`
7. `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` (verifying exit 1 fail-closed with 70 blockers)

## SKILLS USED

- `deployment-pipeline-design`: align the operator launch checklist and preflight gap register with the immutable V1 release candidate baseline and environment boundaries.
- `secrets-management`: maintain strict separation between runtime secret references and checked-in template files across all 11 checklist categories.
- `prometheus-configuration`: verify operational telemetry criteria, alert rules, and latency/saturation thresholds in the launch checklist matrix.
- `security-threat-model`: uphold fail-closed security posture, boundary isolation, and sanitized error handling in pre-launch governance.
- `requesting-code-review`: dispatch reviewer subagent to evaluate documentation integrity, consistency across the 11 categories, and release candidate alignment.
- `receiving-code-review`: evaluate reviewer feedback with technical rigor against repository evidence.
- `caveman-commit`: write the concise commit message following Conventional Commits format.
