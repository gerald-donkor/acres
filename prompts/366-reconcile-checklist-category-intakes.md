# Prompt 366 — Reconcile Checklist Category Intakes with V1 Release Candidate Baseline

## Scope and why next

Committed baseline: `b9575db` on `main`. Worktree is clean.

In Prompt 364 (`32cbae6`), the repository established the formal V1 Release Candidate baseline across `docs/project-status.md`, `docs/build-plan.md`, and `docs/operations.md`, confirming that **100% of application capabilities (75/75 points)** and **91% of whole-project milestones (91/100 points)** are completed following the closure of all four V1 engineering milestones (tenant-scoped `/app/audit` workspace, authoritative 11-phase real PostgreSQL/PostGIS data journey under forced RLS, release verification refresh and triage across 3 workspaces, and live infrastructure failure acceptance).

In Prompt 365 (`b9575db`), `docs/launch-checklist.md` §6A's "Production evidence preflight gap register" and "Operator handoff" repository prefill table were reconciled to align with this V1 Release Candidate baseline at commit `dd36684`.

However, within `docs/launch-checklist.md` §3 ("Eleven-Category Launch Readiness Checklist"), each of the 11 category subsections still contains a historical intake paragraph from late September 2026 (`Prompt 205` through `Prompt 215`, commits `dd1c933` through `6f29a63`). These historical intake paragraphs:
1. Cite stale September 2026 commit hashes and dates (`dd1c933`, `8c3bb6c`, `f2f0e1b`, `d09b51f`, `ff72920`, `a3c4d9b`, `dc6670e`, `5e176e4`, `c97abba`, `353748a`, `6f29a63`).
2. Cite obsolete, pre-milestone test and build issues that have since been fully triaged and resolved (e.g. Category 1's note that `npm run build failed in Next's TypeScript --showConfig parser` and `EAI_AGAIN` audit failure, Category 10's reference to outdated route inventories, Category 6's pre-Prompt-305–356 backup/restore/reconciliation scripts).
3. Do not record the verified V1 Release Candidate baseline preflight state established across Prompts 358 through 363.

This prompt reconciles each of the 11 category subsections in `docs/launch-checklist.md` §3 by appending the authoritative V1 Release Candidate intake record (`2026-10-14T10:30:00Z UTC`, reviewed source commit `dd366847cde9dc76af2ad4acc6d200a6528ced3b` on `main`), documenting the candidate's exact verified offline preflight status, contracts, and remaining operator gates, while maintaining the fail-closed launch posture (0 approved, 11 unresolved, 70 blockers).

## Reference material

Read:
- `AGENTS.md` (Workflow §2, Invariants §1, Build sequence §8.2, Standing rules §9)
- `docs/launch-checklist.md` (§1–7, specifically §3 Eleven-Category Launch Readiness Checklist and §6A Gap Register)
- `docs/project-status.md` (V1 Release Candidate baseline at `dd36684`, 100% application completion, operator handoff table)
- `docs/operations.md` (Prompts 357–365 verification records, production templates, preflight checks)
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

1. **Update `docs/launch-checklist.md` §3**:
   - For each of the 11 categories in §3, add the authoritative V1 Release Candidate intake record:
     - **Category 1 (`production_domain_tls`)**: Candidate assessment at `2026-10-14T10:30:00Z UTC` (`dd36684` on `main`). Document `verify-caddy-routing.js` passing 18/18 routes, Next.js 16.3.8 compiling 23/23 routes cleanly, security headers, and S3 SigV4 Host preservation. Reaffirm status unresolved pending operator domain, TLS contact, and HSTS decision.
     - **Category 2 (`smtp_delivery`)**: Candidate assessment. Document `check-smtp-template-keys.js` passing, and verified invitation and account recovery email pipelines from Prompts 58 and 361. Reaffirm status unresolved pending provider, sender, and delivery receipt.
     - **Category 3 (`secrets_management`)**: Candidate assessment. Document zero secret leaks (`scan-secrets.sh`), 7 credential classes verified, and dry-run rotation drill passing. Reaffirm status unresolved pending runtime injector, masking policy, and rotation authority.
     - **Category 4 (`secret_references`)**: Candidate assessment. Document 12 indirect secret fields validated by schema, `CSRF_SECRET` isolated in `server/.env`, and Compose secret scoping. Reaffirm status unresolved pending live secret store references.
     - **Category 5 (`slo_and_alerting`)**: Candidate assessment. Document 11 operational Prometheus alert rules verified, EXPLAIN query plan gates (6/6 analytics, 2/2 spatial PostGIS), and capacity load evaluator preflight passing. Reaffirm status unresolved pending operator adoption of SLOs and live alert routing.
     - **Category 6 (`backup_and_disaster_recovery`)**: Candidate assessment. Document hardened `backup-postgres.sh`, `restore-postgres.sh`, and `reconcile-storage-objects.js` automation (Prompts 305–356) and 13/13 infrastructure failure recovery tests passing under forced RLS in Prompt 363. Reaffirm status unresolved pending operator RPO/RTO adoption, off-host destination, and isolated restore drill.
     - **Category 7 (`data_retention_policy`)**: Candidate assessment. Document export artifact retention purge batch bounds (Prompt 79) and download expiry enforcement (Prompt 71). Reaffirm status unresolved pending legal and operational retention policy decisions.
     - **Category 8 (`volume_encryption`)**: Candidate assessment. Document `verify-volume-encryption.js` verifying 9 required stateful service mounts and key separation. Reaffirm status unresolved pending live mount inspection and key recovery owner sign-off.
     - **Category 9 (`graphql_introspection`)**: Candidate assessment. Document production introspection probe policy and `/graphql` schema verification (0 drift). Reaffirm status unresolved pending operator production policy decision and route probe.
     - **Category 10 (`deployment_and_rollback`)**: Candidate assessment. Document Next.js 16.3.8 compiling 23/23 routes cleanly, Nest server compilation, `check-release-images.js`, and dry-run deployment drill verified. Reaffirm status unresolved pending immutable release image pair, deployment approver, and live drill.
     - **Category 11 (`optional_ai_posture`)**: Candidate assessment. Document AI draft preview disabled by default (`ai_enabled: false`, `AI_DRAFT_ENABLED=false`), absent `GEMINI_API_KEY`, unpaid provider excluded, and 3 deterministic core journeys verified in Prompt 361. Reaffirm status unresolved pending verified live deployment configuration and product/security sign-off.

2. **Update `docs/build-plan.md`**:
   - Add the verification record for Prompt 366 under §22 Phase 12K.
   - Summarize the reconciliation of §3 Category 1–11 candidate intakes with the V1 Release Candidate baseline.

3. **Update `docs/operations.md`**:
   - Add the Prompt 366 section recording the Category 1–11 checklist reconciliation and verification check outputs.

4. **Verify Fail-Closed Launch Posture**:
   - Confirm `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` continues to exit 1 with 70 blockers across 11 unresolved categories.

Only documentation files (`docs/launch-checklist.md`, `docs/build-plan.md`, `docs/operations.md`) and this prompt file may be modified. No runtime application code, schema, API contracts, or production templates may be altered.

## Expected impact and non-goals

- **Expected impact**:
  - Completes the launch checklist reconciliation by bringing all 11 category subsections in §3 into direct alignment with the V1 Release Candidate baseline (`dd36684`).
  - Clears historical pre-milestone confusion (e.g. historical Next `--showConfig` build errors, `EAI_AGAIN` audit timeouts) from §3, giving operators an accurate, verified preflight record for each category.
  - Maintains strict fail-closed posture: all 11 categories remain unresolved pending live operator infrastructure, drills, and sign-offs under Prompt 201.

- **Non-goals**:
  - Does NOT alter runtime application code, database schema, or API contracts.
  - Does NOT execute live production deployment, secret rotation, or physical disaster recovery cutover (governed by Prompt 201).
  - Does NOT modify `infra/launch/readiness.example.json` to make it pass artificially.
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

- `deployment-pipeline-design`: align each checklist category's intake record with the immutable V1 release candidate baseline and environment boundaries.
- `secrets-management`: maintain strict separation between runtime secret references and checked-in template files across all 11 checklist categories.
- `prometheus-configuration`: verify operational telemetry criteria, alert rules, and latency/saturation thresholds in the launch checklist matrix.
- `security-threat-model`: uphold fail-closed security posture, boundary isolation, and sanitized error handling in pre-launch governance.
- `requesting-code-review`: dispatch reviewer subagent to evaluate documentation integrity, consistency across the 11 categories, and release candidate alignment.
- `receiving-code-review`: evaluate reviewer feedback with technical rigor against repository evidence.
- `caveman-commit`: write the concise commit message following Conventional Commits format.
