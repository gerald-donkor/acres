# Prompt 411 — Reconcile Launch Checklist with Managed Production Baseline

## Scope and why this is next

Parent: Phase 12 operations and launch hardening (`docs/build-plan.md` §13,
approved Prompt 370 Vercel migration amendment, and `docs/launch-checklist.md`).
Planning baseline: `2ad8168f3cdfea85e0636da6c3d7aaadfb6a82af` on `main`
(`docs(ops): record managed activation plan`, Prompt 410).
Re-verify HEAD and worktree cleanliness at execution time.

Context:
- Prompt 410 established the formal Managed Production Activation Plan and Operator Intake
  for `vercel-managed-production`, codifying the 7-stage live activation sequence and auditing
  the repository baseline against `infra/launch/readiness.vercel.example.json` (confirming
  0 approved categories, 11 unresolved categories, and 61 blockers in `docs/operations.md`).
- Prompts 380–382 previously implemented the managed operator handoff template
  (`infra/launch/operator-handoff.vercel.example.md`), the managed readiness template
  (`infra/launch/readiness.vercel.example.json`), the topology-discriminating schema
  (`infra/launch/readiness.schema.json`), the branched drill runner
  (`scripts/ops/run-launch-drills.sh --target-architecture vercel-managed-production`),
  and four dedicated managed verifiers with comprehensive test suites (28/28 passed in
  `npm run ops:managed-drills-test`).
- Prompts 403–409 established recoverable ClamAV scanner workflow handoff, preview verification,
  candidate adoption (`snap_8OP5G2tCUvxtRdoGFMCu5se58f3N`), and Tier 2 snapshot retirement
  reclaiming ~922 MB and securing the steady-state 2-snapshot baseline.

Why this is next:
`docs/launch-checklist.md` is the authoritative Phase 12 exit-gate document mandated by
`docs/build-plan.md` §13 ("operator-approved launch checklist; reproducible promotion and
rollback; successful restore drill within selected objectives; actionable alerts/runbooks").
However, `docs/launch-checklist.md` currently suffers from four substantial synchronization gaps:
1. **Section 3 Category Contracts**: The detailed verifier commands, evidence contracts, and
   acceptance criteria across all 11 categories in §3 describe only `single-host-compose-caddy`
   (referencing Caddyfiles, Docker compose mount scans, local container backups, and container image pairs).
   The managed equivalents for `vercel-managed-production` (Vercel Edge TLS, Resend sender verification,
   12 managed indirect secret keys, Neon 7-day WAL PITR window, Blob durability, Neon AWS KMS volume encryption,
   and immutable `dpl_*` deployment IDs) are implemented in `scripts/ops/check-launch-readiness.js` and
   tested in `npm run ops:managed-drills-test`, but have not been formally incorporated into the
   category contracts in §3.
2. **Section 6A Production Evidence Preflight Gap Register**: Section 6A currently records only
   the historical 2026-10-14 assessment for `single-host-compose-caddy` (70 blockers at commit `dd36684`).
   It does not record the authoritative managed preflight gap register established in Prompt 410
   (evaluated at `2026-10-20T18:41:47Z`, 61 blockers, 0 approved, 11 unresolved).
3. **Section 7 Formal Pre-Launch Sign-Off Matrix**: The sign-off table in §7 lists only Compose verifier
   scripts (`verify-caddy-routing.js`, `run-secret-rotation-drill.sh`, `run-restore-drill.sh`,
   `run-deployment-drill.sh`). It lacks the dual-topology matrix specifying the corresponding managed
   verifier scripts (`verify-managed-ingress.js`, `verify-managed-volume-encryption.js`,
   `verify-managed-secret-rotation.js`, `verify-managed-restore-drill.js`, `reconcile-storage-objects.js --provider vercel-blob`,
   `check-vercel-config.js`).
4. **Historical Operations Log**: The operational entry log at the end of `docs/launch-checklist.md`
   abruptly ends at Prompt 398 (2026-10-19). Prompts 403 through 410 have not been recorded there.

This prompt reconciles `docs/launch-checklist.md` with the Vercel-managed production activation
baseline, codifying the dual-topology Category contracts in §3, recording the 61-blocker managed
preflight gap register in §6A, establishing the dual-profile sign-off matrix in §7, and bringing
the operational log up to date through Prompt 410.

Stop for phase-control approval before execution.

## References and evidence boundary

Read before execution:
- `AGENTS.md` (Workflow §2, Invariants §1, Build sequence §8.2, Standing rules §9, §10).
- `docs/launch-checklist.md` (§1–7: Category contracts, Gap register §6A, Sign-off matrix §7).
- `docs/operations.md` (Prompt 410 activation plan, operator intake audit, managed preflight results).
- `docs/vercel-deployment.md` (Prompt 410 activation plan record, 2-snapshot baseline).
- `docs/build-plan.md` (§13 Phase 12, Phase 12K, Prompt 370 amendment, Prompts 380–410 build entries).
- `docs/project-status.md` (Section 4 operator-owned launch work and handoff table).
- `infra/launch/readiness.schema.json` and `infra/launch/readiness.vercel.example.json`.
- `infra/launch/operator-handoff.vercel.example.md`.
- `scripts/ops/check-launch-readiness.js` (managed category validation rules and blocker definitions).
- `scripts/ops/launch-readiness.sh` (top-level preflight orchestrator).
- `scripts/ops/run-launch-drills.sh` (unified drill runner supporting `--target-architecture vercel-managed-production`).
- The four managed verifiers: `scripts/ops/verify-managed-ingress.js`,
  `scripts/ops/verify-managed-volume-encryption.js`, `scripts/ops/verify-managed-secret-rotation.js`,
  `scripts/ops/verify-managed-restore-drill.js`, plus `scripts/ops/reconcile-storage-objects.js`.

Static visual references, crops, pixel measurements, and breakpoint deltas do not apply:
this is an operational governance and documentation reconciliation task with no UI changes.
No runtime Next.js, NestJS, database schema, or API contracts change.

## SKILLS USED

- `deployment-pipeline-design` — loaded during planning; multi-stage pipeline, promotion gates,
  managed drill verifier orchestration, and rollback prerequisites.
- `secrets-management` — loaded during planning; 12 indirect managed secret references,
  90-day rotation, and keeping secret values and credentials out of repositories and logs.
- `requesting-code-review` — mandatory code review dispatch after self-verification.
- `receiving-code-review` — evaluate feedback with technical rigor before making changes.
- `caveman-commit` — write required concise conventional commit message.

Re-read these skills during execution.

## Execution steps

1. **Verify Baseline State**:
   - Confirm git branch is `main`, worktree is clean, and HEAD matches `2ad8168` (or explain difference).
   - Re-verify repository preflights:
     - `node scripts/vercel/check-vercel-config.js` (must pass with exit 0).
     - `npm run ops:managed-drills-test` (all 28 tests must pass).
     - `npm run ops:launch-readiness:managed` (must exit 1 fail-closed, reporting 61 blockers, 0 approved, 11 unresolved).

2. **Reconcile `docs/launch-checklist.md` §3 (Eleven-Category Launch Readiness Checklist)**:
   - For each of the 11 categories in §3, add clear dual-topology contract documentation:
     - **Category 1 (`production_domain_tls`)**: Retain Compose Caddy contracts; add Vercel-managed
       contract: custom FQDN, TLS contact email, `hsts_approved: true`, `edge_tls_enabled: true`,
       `verify-managed-ingress.js` preflight, and Vercel Edge TLS certificate evidence.
     - **Category 2 (`smtp_delivery`)**: Retain Compose SMTP contracts; add Vercel-managed
       contract: Resend provider, verified sender domain, valid `from_address`, DKIM/SPF alignment,
       and delivery receipt.
     - **Category 3 (`secrets_management`)**: Retain Compose contracts; add Vercel-managed
       contract: Vercel Project Production Env + Neon role secrets, rotation cadence ≤ 90 days,
       `secret_store_reference`, compromise response runbook, and `verify-managed-secret-rotation.js`.
     - **Category 4 (`secret_references`)**: Retain Compose 12-secret contracts; add Vercel-managed
       12-secret inventory: `session_secret_source`, `csrf_secret_source`, `cron_secret_source`,
       `db_migrator_secret_source`, `db_app_secret_source`, `blob_token_source`,
       `scanner_snapshot_id_source`, `scanner_main_sha_source`, `scanner_daily_sha_source`,
       `resend_api_key_source`, `resend_from_source`, `alert_webhook_source`, confirming zero raw secrets.
     - **Category 5 (`slo_and_alerting`)**: Document shared availability (≥99.9%), HTTP latency
       (p95 ≤ 500ms), throughput (≥100 rps), and 11 alert rules, plus managed alerting webhook target.
     - **Category 6 (`backup_and_disaster_recovery`)**: Retain Compose contracts; add Vercel-managed
       contract: Neon WAL streaming PITR (window ≥ 7 days, RPO ≤ 1h, RTO ≤ 4h), Vercel Blob durability
       attestation, `verify-managed-restore-drill.js`, and `reconcile-storage-objects.js --provider vercel-blob`.
     - **Category 7 (`data_retention_policy`)**: Document retention enforcement across accounts, audit logs,
       and report exports, retaining legal/compliance approval requirement.
     - **Category 8 (`volume_encryption`)**: Retain Compose 9-mount contracts; add Vercel-managed
       contract: Neon AWS KMS AES-256 storage, Blob at-rest encryption, Firecracker RAM sandbox isolation,
       and `verify-managed-volume-encryption.js`.
     - **Category 9 (`graphql_introspection`)**: Document production introspection disablement or approved justification.
     - **Category 10 (`deployment_and_rollback`)**: Retain Compose image pair contracts; add Vercel-managed
       contract: immutable Vercel deployment pair (`current_deployment_id`, `previous_deployment_id` as `dpl_*`),
       deployment URL, source git commit SHA, and instant rollback authority.
     - **Category 11 (`optional_ai_posture`)**: Document strict no-AI production posture: `ai_enabled: false`,
       `AI_DRAFT_ENABLED=false`, zero Gemini API key provisioned, and deterministic no-AI journeys.

3. **Reconcile `docs/launch-checklist.md` §6A (Production Evidence Preflight Gap Register)**:
   - Retain the historical 2026-10-14 Compose assessment (`dd36684`, 70 blockers) for traceability.
   - Add the authoritative **Managed Production Evidence Preflight Gap Register — 2026-10-20**:
     - Assessment baseline: `2026-10-20T18:41:47Z UTC`, reviewed commit `2ad8168` on `main`.
     - Target architecture: `vercel-managed-production`.
     - Output of `scripts/ops/launch-readiness.sh --target-architecture vercel-managed-production infra/launch/readiness.vercel.example.json`:
       exit 1 (fail-closed, 0 approved, 11 unresolved, 61 blockers).
     - Full 11-category gap inventory table detailing repository-visible state, missing operator values,
       and required authentic live receipts for the managed profile.

4. **Reconcile `docs/launch-checklist.md` §7 (Formal Pre-Launch Sign-Off Matrix)**:
   - Expand the sign-off matrix into a dual-profile structure showing the required verifier command
     and approval owner for both `single-host-compose-caddy` and `vercel-managed-production`.
   - Explicitly list the managed verifiers for each category:
     - Cat 1: `verify-managed-ingress.js` / Vercel Edge TLS
     - Cat 2: Resend delivery receipt + DNS DKIM/SPF check
     - Cat 3: `verify-managed-secret-rotation.js` + live operator receipt
     - Cat 4: `scripts/ops/scan-secrets.sh` + 12 managed indirect secret references
     - Cat 5: Managed capacity/latency benchmarks + Prometheus alert webhook routing
     - Cat 6: `verify-managed-restore-drill.js` + `reconcile-storage-objects.js --provider vercel-blob`
     - Cat 7: Signed data retention policies (accounts, audit, reports)
     - Cat 8: `verify-managed-volume-encryption.js` + Neon/Blob/Firecracker encryption attestations
     - Cat 9: Production GraphQL introspection probe
     - Cat 10: `scripts/vercel/check-vercel-config.js` + immutable deployment ID pair (`dpl_*`)
     - Cat 11: `ai_draft_enabled: false` attestation + absent Gemini key verification

5. **Append Historical Operational Entries (Prompts 403–410) to `docs/launch-checklist.md`**:
   - Add concise, factual operational summaries for:
     - Prompt 403: Recoverable scanner workflow handoff
     - Prompt 404: Scanner workflow hosted readiness and simulation
     - Prompt 405: Scanner refresh 3 prerequisite stop
     - Prompt 406: Retained scanner preview acceptance
     - Prompt 407: Retained preview isolation and scanner adoption stop
     - Prompt 408: Guarded scanner preview adoption (`snap_8OP5G2tCUvxtRdoGFMCu5se58f3N`)
     - Prompt 409: Tier 2 scanner snapshot retirement (reclaimed ~922 MB, 2-snapshot baseline)
     - Prompt 410: Managed production activation plan and operator intake (61 blockers audited)

6. **Update Owning Documentation**:
   - `docs/operations.md`: Record execution of Prompt 411 and checklist reconciliation.
   - `docs/vercel-deployment.md`: Update Phase 12 checklist status to reconciled.
   - `docs/build-plan.md`: Add concise Phase 12 build entry for Prompt 411.

7. **Verification and Checks**:
   - Run offline checks: `node scripts/vercel/check-vercel-config.js`
   - Run managed drill tests: `npm run ops:managed-drills-test`
   - Run launch readiness preflight: `npm run ops:launch-readiness:managed`
   - Run secret scan: `npm run ops:scan-secrets`
   - Run lint: `npm run lint`
   - Run typecheck: `npm run typecheck`
   - Run build: `npm run build`
   - Check git diff: `git diff --check`

8. **Code Review and Local Commit**:
   - Dispatch reviewer subagent via `requesting-code-review`.
   - Evaluate feedback via `receiving-code-review`.
   - Stage reviewed files.
   - Commit locally to `main` with `caveman-commit`.
   - Do NOT push (`P` command remains separate).

## Files and expected impact

- `prompts/411-reconcile-launch-checklist-managed-production-baseline.md`: implementation prompt.
- `docs/launch-checklist.md`: reconciles §3 contracts, §6A gap register, §7 sign-off matrix, and operational entries.
- `docs/operations.md`: records checklist reconciliation under Prompt 411.
- `docs/vercel-deployment.md`: records completion of checklist reconciliation.
- `docs/build-plan.md`: updates Phase 12 build record.
- No changes to runtime application code, database schema, API contracts, or dependencies.

## Non-goals and rollback

- No editing of `infra/launch/readiness.vercel.example.json` to manufacture a passing state (example must remain fail-closed).
- No live production deployment, domain creation, or alias change.
- No git push (`P` protocol is outside prompt execution).
- Rollback: ordinary local git revert; no external state or database migration is created.
