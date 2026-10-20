# Prompt 409 — scanner snapshot retirement, dependency-aware (tier 2)

## Scope and why this is next

Parent: Phase 12 managed-target operations, continuing approved Prompt 370
(Vercel-managed migration and deployment).
Inspected baseline: clean `main` at `435d397e6f25e866e5eba808ec85e1740effe2a1`
(`docs(ops): record scanner preview adoption`, Prompt 408).
Re-verify HEAD and worktree cleanliness at execution time.

In `docs/vercel-deployment.md` and `docs/operations.md`, the documented scanner
lifecycle sequence established two tiers of snapshot retirement:

- **Tier 1 (Prompt 396)**: safely deleted three obsolete snapshots that were
  either never adopted or whose dependents had long failed closed (`snap_Feg5…`,
  `snap_rz0c…`, `snap_KtLd…`), leaving four live snapshots.
- **Tier 2 (deferred to this prompt)**: targeted `snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN`
  and `snap_ngIwnQplocPoUR0A6cewfCGrFAbX`.

Why this is next:

1. **Signature windows are closed**:
   - `snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN`: signature window closed no later than
     `2026-10-20T01:00Z`.
   - `snap_ngIwnQplocPoUR0A6cewfCGrFAbX`: signature window closed no later than
     `2026-10-20T16:01Z`.
   - Current time is past both deadlines. Any upload scan attempting to use
     either snapshot already fails closed on signature age or provider unavailability.
2. **Newer active and rollback configurations are committed and adopted**:
   - Prompt 408 completed guarded adoption of candidate snapshot
     `snap_8OP5G2tCUvxtRdoGFMCu5se58f3N` into project preview environment
     variables (`SCANNER_SANDBOX_SNAPSHOT_ID`), matching validated deployment
     `dpl_AGwu9k8gbtQRegTodmHUAL7uxYs4`.
   - Prompt 395 snapshot `snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf` (signature valid
     through `~2026-10-21T09:02Z`) is the documented predecessor rollback snapshot.
   - `snap_ngIw…` is therefore superseded as rollback, and `snap_CARv…` has no
     live deployment role.
3. **Storage quota and accounting resolution**:
   - Vercel Hobby tier includes a limited Snapshot Storage allowance (15 GB total).
   - Retaining four ~461 MB snapshots consumes ~1.84 GB. Retiring the two expired
     snapshots reclaims ~922 MB and bounds resource consumption.
   - The storage-accounting question left open in Prompt 396 (whether snapshot
     deletion recovers billing allowance or whether accounting is cumulative)
     can now be re-evaluated against owner dashboard readings.
4. **Dependency order**:
   - Workflow cadence publication on GitHub Actions is blocked on an external
     standalone uppercase `P` git push.
   - Launch readiness checklist requires operator decisions on external production targets.
   - Tier 2 retirement is self-contained, fully unblocked, and directly satisfies
     Phase 12 managed operational hygiene.

## SKILLS USED

- `deployment-pipeline-design` — pipeline gates, lifecycle retirement, active/rollback state transitions
- `secrets-management` — restricted credentials handling, private custody without repo leaks
- `javascript-testing-patterns` — offline regression testing of retirement CLI and probe suites
- `error-handling-patterns` — fail-closed deletion verification, error code classification, partial failure handling
- `architecture-patterns` — isolated operational lifecycle tooling outside runtime application boot
- `requesting-code-review` — independent reviewer dispatch before committing changes
- `receiving-code-review` — rigorous technical evaluation of code review feedback
- `caveman-commit` — required terse Conventional Commit message to main

## References and inputs

Read the following repository materials before executing:

- `infra/vercel/runbooks/managed-operations.md` §5.5 (manual activation, verification and retirement procedure)
- `docs/vercel-deployment.md` ("Resume here", Prompt 396, Prompt 408 sections)
- `docs/operations.md` (Prompt 396, Prompt 408 execution records)
- `scripts/vercel/retire-scanner-snapshots.js` (CLI implementation)
- `scripts/vercel/retire-scanner-snapshots.spec.js` (offline unit test suite)
- `scripts/vercel/probe-platform.js` (target configuration and credentials loader)

## The four snapshots and dependency analysis

| Snapshot ID                         | Origin                   | Current Role / Dependents                                                                      | Expiry / Signature Bound              | Action              |
| ----------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------- |
| `snap_8OP5G2tCUvxtRdoGFMCu5se58f3N` | Prompt 405/408 candidate | **Active preview configuration**; pinned by `dpl_AGwu9k8gbtQRegTodmHUAL7uxYs4` and project env | Open until `2026-10-22T06:35:09.451Z` | **KEEP (active)**   |
| `snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf` | Prompt 395               | **Documented rollback snapshot**; pinned by `dpl_AtJLkmoy…`                                    | Open until `~2026-10-21T09:02Z`       | **KEEP (rollback)** |
| `snap_ngIwnQplocPoUR0A6cewfCGrFAbX` | Prompt 394               | Former rollback snapshot under Prompt 395; pinned by `dpl_A5H3fnpS…`                           | Closed at `~2026-10-20T16:01Z`        | **RETIRE (tier 2)** |
| `snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN` | Prompt 391               | Pinned by `dpl_2aajXYcF…`, `dpl_7JR8…`, `dpl_1S2xiZKz…`                                        | Closed at `~2026-10-20T01:00Z`        | **RETIRE (tier 2)** |

### Why retirement is fail-closed

Deployments pinned to deleted snapshots return `{ status: 'failed', errorCode: 'scanner_unavailable' }`
upon scan invocation, because `Sandbox.create` fails and the NestJS adapter catches the
error safely. Because both snapshots' signature windows have already expired, their
dependent deployments would fail closed on signature age anyway. Retiring them cannot
cause an unsafe clean verdict on infected uploads.

## Step-by-step execution plan

### Phase A: Local offline verification

Run and quote real command output under Node 24.21.0:

1. `node --test scripts/vercel/retire-scanner-snapshots.spec.js`
2. `npm run vercel:probe-test`
3. `npm run lint`
4. `npm run typecheck`
5. `npm run ops:scan-secrets`

Verify that all unit tests pass with zero regressions before initiating any live network call.

### Phase B: Live target preflight and plan run

1. **Environment and custody setup**:
   - Establish timestamped private custody directory:
     `~/.config/acres/vercel-preview/prompt409-<timestamp>/`
   - Source preview credentials (`VERCEL_OIDC_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`).
   - Confirm active snapshot ID in environment:
     `export SCANNER_SANDBOX_SNAPSHOT_ID="snap_8OP5G2tCUvxtRdoGFMCu5se58f3N"`

2. **Preflight inventory**:
   - Inspect team billing plan, account status, and sandbox inventory.
   - Confirm zero running/pending sandboxes.
   - List project snapshots; confirm exactly four snapshots exist and match the table above.

3. **Plan run (dry-run without `--confirm`)**:
   Execute the planning run:

   ```bash
   npm run vercel:scanner-retire -- \
     --keep snap_8OP5G2tCUvxtRdoGFMCu5se58f3N \
     --keep snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf \
     --retire snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN \
     --retire snap_ngIwnQplocPoUR0A6cewfCGrFAbX \
     --output ~/.config/acres/vercel-preview/prompt409-<timestamp>/plan.json
   ```

   **Assertions on plan receipt**:
   - Exit code: `0`
   - `result`: `"planned"`
   - `refusals`: `[]` (empty)
   - `active_sandboxes`: `0`
   - `unlisted_snapshots`: `[]` (empty, complete accounting)
   - `retire`: 2 entries with `outcome: "planned"`
   - `keep`: 2 entries with `status: "created"`

4. **Owner storage reading (pre-retirement)**:
   - Record owner-reported Snapshot Storage byte figure or note dashboard unavailability.

### Phase C: Live confirmed retirement

1. **Execute confirm run**:
   Execute the deletion run with `--confirm`:

   ```bash
   npm run vercel:scanner-retire -- \
     --keep snap_8OP5G2tCUvxtRdoGFMCu5se58f3N \
     --keep snap_KBajgHVkU9SqHgDSJzNqHs4SFhvf \
     --retire snap_CARvOfNjBSdUWWMwrkuEQmnZsQxN \
     --retire snap_ngIwnQplocPoUR0A6cewfCGrFAbX \
     --confirm \
     --output ~/.config/acres/vercel-preview/prompt409-<timestamp>/retire.json
   ```

   **Assertions on retire receipt**:
   - Exit code: `0`
   - `result`: `"retired"`
   - `refusals`: `[]` (empty)
   - `retire`: both entries transition to `outcome: "deleted"`
   - `keep_after`: both kept snapshots remain `status: "created"` with unmodified `expires_at`
   - `storage.after.created_count`: `2` (decreased by exactly 2)
   - `storage.after.created_bytes`: decreased by ~922 MB

2. **Post-retirement audit**:
   - Run a subsequent listing / plan check to verify only `snap_8OP5...` and `snap_KBaj...` remain.
   - Confirm zero sandboxes active.
   - Record owner-reported Snapshot Storage reading (immediate and, if requested, after 60 min)
     to classify whether storage accounting reflects current active storage or cumulative usage.

### Phase D: Documentation and review

1. **Update `docs/operations.md`**:
   - Add new section: `## Prompt 409 — scanner snapshot retirement tier 2 (<date>)`.
   - Record execution timeline, preflight findings, plan receipt details, retire receipt details,
     postflight verification, and storage accounting classification.
   - Quote actual command outputs for all verification checks.

2. **Update `docs/vercel-deployment.md`**:
   - Update header summary and scanner lifecycle inventory to reflect exactly 2 retained snapshots
     (`snap_8OP5...` active, `snap_KBaj...` rollback).
   - Add section: `## Scanner snapshot retirement (tier 2) — Prompt 409 (<date>)`.
   - Document the retired snapshots, reclaimed bytes, and status of storage accounting.

3. **Update `docs/build-plan.md`**:
   - Add concise entry under Phase 12 summarizing Prompt 409 execution.

4. **Update `infra/vercel/runbooks/managed-operations.md`**:
   - Update §5.5 to reflect completion of both Tier 1 and Tier 2 snapshot retirements,
     establishing the 2-snapshot steady state (active + rollback).

5. **Code review and commit**:
   - Run `npm run ops:scan-secrets`, `git diff --check`, and formatting checks.
   - Dispatch independent reviewer subagent via `requesting-code-review`.
   - Address feedback via `receiving-code-review`.
   - Commit locally to `main` via `caveman-commit`. Do not push.

## Non-goals and rollback

- No application code, frontend components, or backend API changes.
- No modifications to project environment variables (active snapshot remains `snap_8OP5...`).
- No deployment creation, promotion, or alias mutation.
- No deletion of kept snapshots (`snap_8OP5...` and `snap_KBaj...`).
- No git push (`P` protocol remains separate).
- **Rollback limitation**: Deletion of snapshots via provider API cannot be undone. If an
  old deployment pinned to a deleted snapshot must be used, the remedy is redeploying with
  the active configuration or performing a normal rebuild/adopt cycle.
