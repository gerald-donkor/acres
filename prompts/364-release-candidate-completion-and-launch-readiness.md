# Prompt 364 — V1 Release Candidate Baseline & Launch Readiness Handoff

## Scope and why next

Committed baseline: `dd36684` on `main`. Worktree is clean.

Between Prompt 357 (`cbea86d`) and Prompt 363 (`dd36684`), the team executed all four remaining V1 engineering and integrated acceptance milestones identified in `docs/project-status.md` §3:
1. **Administrative history scope** (Prompts 358–360): implemented tenant-scoped `/app/audit` workspace, GraphQL pagination and metadata, nine opt-in loopback proxy browser failure cases with session recovery, and closed the global scheduled-run telemetry boundary (`/api/v1/jobs/runs` denied to tenant roles).
2. **Authoritative end-to-end data journey** (Prompt 361): verified the complete multi-tenant pipeline across 11 integrated phases on PostgreSQL/PostGIS under forced RLS in `server/test/data-journey.e2e-spec.ts`.
3. **Release verification refresh and triage** (Prompt 362): resolved `CSRF_SECRET` and `/output/` test artifacts, proving 0 schema drift, 0 lint errors, 0 type errors across all three workspaces, 23/23 Next.js routes, 120/120 server unit suites (1876/1876 tests), 85/85 Playwright tests, 6/6 analytics and 2/2 PostGIS EXPLAIN query plan gates, and 33/33 operations preflight stages.
4. **Infrastructure-level failure acceptance** (Prompt 363): verified fail-closed ClamAV socket downtime and timeout quarantine, virus signature suppression, storage buffer outage rejection and S3 error message sanitization, Valkey outbox exponential backoff retries and dead-letter progression, worker crash lock-lease reclamation via `FOR UPDATE SKIP LOCKED`, ingestion parser transactional rollback, and storage/database parity reconciliation in `server/test/infrastructure-failure.e2e-spec.ts` (13/13 failure tests; full real database E2E suite passes 8/8 suites and 159/159 tests under forced RLS).

All application capabilities for the approved V1 defined in `docs/product.md` are now fully implemented, integrated, and verified against real PostgreSQL/PostGIS and headless browser test runners.

`docs/project-status.md` currently reflects the pre-milestone baseline (`4e9d6eb`), where application completion was estimated at ~92% (69/75 earned points) with several outstanding regressions and missing journeys.
This prompt reconciles `docs/project-status.md`, `docs/build-plan.md`, `docs/operations.md`, and `docs/launch-checklist.md` to establish the formal **V1 Release Candidate baseline at commit `dd36684`**, update the completion scorecard to reflect **100% application capability completion (75/75 points)** and **91% overall whole-project completion (91/100 points)**, document the closure of all engineering acceptance milestones, and formalize the handoff to the operator-owned Phase 12K launch checklist (Prompt 201).

## Reference material

Read:
- `AGENTS.md` (Workflow §2, Invariants §1, Build sequence §8.2, Standing rules §9)
- `docs/project-status.md` (V1 baseline, completion rubric, feature inventory, engineering milestones, and operator launch handoff)
- `docs/build-plan.md` (§13 Phase 12, §14 Sequence gates, §22 Phase 12K verification records)
- `docs/operations.md` (prompts 357 through 363 verification records, production templates, preflight checks, and drill runbooks)
- `docs/launch-checklist.md` (eleven required launch categories, fail-closed validation rules, and sign-off criteria)
- `docs/system-architecture.md` (target production topology and module boundaries)
- `docs/security.md` (current threat model, trust boundaries, and sanitized failure boundaries)
- `docs/product.md` (V1 boundary, user journeys, and target persona commitments)
- `prompts/201-production-launch-evidence-and-signoff.md` (operator launch evidence preconditions and execution sequence)

Inspect:
- `infra/launch/readiness.example.json` and `infra/launch/readiness.schema.json`
- `scripts/ops/check-launch-readiness.js`
- `scripts/ops/launch-readiness.sh`
- `scripts/ops/run-launch-drills.sh`

## Deliverables and allowed files

1. **Update `docs/project-status.md`**:
   - Update the assessment date to `2026-10-14` and baseline commit to `dd36684` (V1 Release Candidate).
   - Update the completion estimate table:
     - Database, tenancy, permissions, and API contracts: **15 / 15** (fully proven across PostgreSQL/PostGIS under forced RLS in Prompt 361).
     - Accounts, organizations, and team workflows: **10 / 10** (administrative audit history, loopback browser failure recovery, maintenance boundary, and full invitation/member lifecycle proven in Prompts 358–361).
     - Uploads, worker, geography, and ingestion: **20 / 20** (real polygon geoboundaries geography ingestion and live infrastructure failure acceptance proven in Prompts 361 and 363).
     - Deterministic analytics and saved dashboards: **10 / 10** (deterministic normalization, quality assessment, aggregates, lineage, and spatial query plans proven in Prompt 361).
     - Governed reports and CSV/PDF exports: **10 / 10** (drafting, evidence freezing, review, publication, async export rendering, and artifact download proven in Prompt 361).
     - Operations, security verification, and production launch: **16 / 25** (33 offline preflights, 27 test suites, SAST, SBOM, license compliance, drill scripts, and failure acceptance proven; remaining 9 points reserved for operator-owned live target deployment, live cluster drills, and 11 category sign-offs).
     - Total: **91 / 100** points overall (91% complete overall; application rows **75 / 75 = 100%** complete).
   - Update Section 3 ("Remaining engineering and acceptance work") to record the completion and evidence for all 4 milestones, marking all engineering and acceptance gaps for V1 **closed**.
   - Reaffirm Section 4 ("Operator-owned launch work") as the sole remaining gating work: establishing the operator-owned readiness record, target infrastructure, live drills, and the 11 category sign-offs under Prompt 201.

2. **Update `docs/build-plan.md`**:
   - Add the verification record for Prompt 364 under §22 Phase 12K.
   - Summarize the V1 Release Candidate milestone at `dd36684` with complete application closure.

3. **Update `docs/operations.md`**:
   - Add the Prompt 364 record documenting the updated project completion assessment, release candidate baseline, and exact operator drill preflight instructions.

4. **Verify Launch Readiness Checker Status**:
   - Confirm `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` continues to exit 1 with 70 unresolved blockers, preserving fail-closed launch posture for untracked/unverified production evidence.

Only documentation files (`docs/project-status.md`, `docs/build-plan.md`, `docs/operations.md`, `docs/launch-checklist.md` if referenced) and this prompt file may be modified. No runtime code, schema, API contracts, or production templates may be altered.

## Expected impact and non-goals

- **Expected impact**:
  - Establishes a definitive, evidence-backed V1 Release Candidate baseline (`dd36684`) across all repository documentation.
  - Updates the whole-project status rubric to reflect 100% application completion (75/75 points) and 91% overall project completion (91/100 points).
  - Clarifies that all code, tests, and automated preflight checks for V1 are fully built, leaving only operator-owned physical deployment, live drills, and 11 category sign-offs.

- **Non-goals**:
  - Does NOT alter runtime application code, database schema, or API contracts.
  - Does NOT execute live production deployment, secret rotation, or physical disaster recovery cutover (governed by Prompt 201).
  - Does NOT modify `infra/launch/readiness.example.json` to make it pass artificially; the example must remain fail-closed until live operator evidence is supplied.

## Verification plan

Run the standard check suite to verify repository integrity and documentation consistency:
1. `git diff --check`
2. `npm run contracts:check`
3. `npm run lint`
4. `npm run typecheck`
5. `npm run build`
6. `npm run ops:check`
7. `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` (verifying exit 1 fail-closed)

## SKILLS USED

- `architecture-patterns`: verify system boundaries, module contracts, and handoff layers between application code and deployment operations.
- `deployment-pipeline-design`: document promotion gates, rollback procedures, and environment separation for the release candidate.
- `secrets-management`: maintain strict separation between runtime secret references and checked-in template files.
- `requesting-code-review`: dispatch reviewer subagent to evaluate documentation integrity, completion accuracy, and release readiness.
- `receiving-code-review`: evaluate reviewer feedback with technical rigor against repository evidence.
- `caveman-commit`: write the concise commit message following Conventional Commits format.
