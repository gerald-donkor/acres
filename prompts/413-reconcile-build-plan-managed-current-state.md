# Prompt 413 — Reconcile the build plan's managed current state

## Scope and why this is next

Parent: Phase 12 operations and launch hardening (`docs/build-plan.md` §13,
approved Prompt 370 Vercel migration amendment, Prompt 412 project-status
reconciliation). Planning baseline: `1684763` on `main`
(`docs(ops): reconcile status with managed baseline`, Prompt 412). Re-verify
HEAD and worktree cleanliness at execution time. If HEAD has moved only by an
unrelated docs commit, record the actual SHA and continue. If product code has
changed or the worktree is dirty, stop and report the paths.

`docs/project-status.md` now says engineering implementation and preview
verification of the managed platform are complete across Prompts 370–411, and
that production promotion, DNS, secrets, live drills and eleven sign-offs
remain operator-owned. The document the next session is required to read first,
`docs/build-plan.md`, still contradicts that in its current-state instructions:

1. The file header (lines 13–17) says Prompt 370 is approved, "but runtime
   migration and deployment have not been implemented," and that Compose+Caddy
   "remains the implemented reference profile" without naming the implemented
   managed profile.
2. The Phase 12 amendment (lines 616–665) says the amendment "does not assert a
   changed runtime, completed migration or deployed application," that "the next
   implementation sequence is owned by approved Prompt 370," and that "no
   managed proof or deployment is established by local preparation." The six
   ordered steps are written as future work even though later records in the
   same file mark local implementation, preview, scanner adoption and checklist
   reconciliation as done.
3. The same amendment ends with "The next new prompt number is 371." That was
   true on 2026-10-15. The highest existing prompt at planning time is 412, and
   this file is 413. `AGENTS.md` §5 still carries the same historical sentence
   ("The next new prompt number is 371") inside the user-authorized numbering
   exception. A later session that obeys that sentence will collide with
   existing prompt files.
4. `docs/vercel-deployment.md` lines 3–24 still open with "Status:
   implementation in progress" and "Prompt 370 is approved and still
   executing," then list a partial resume checklist ending at Prompt 409. Later
   sections record Prompts 410–412. The resume block is what a new session reads
   first.

Why this is next: `AGENTS.md` phase control resolves the next unit from
`docs/build-plan.md` and git, not from `prompts/`. Leaving the plan's
current-state instructions frozen at 2026-10-15 makes the next `i` either
re-plan Prompt 370 or invent operator-credential work that cannot be executed
from the repository. Reconciling those instructions is the earliest
dependency-safe documentation unit. It does not approve launch and does not
require production credentials.

Historical verification records must stay historical. Do not edit the dated
Prompt 370–377 records that correctly said, at that date, that implementation
was pending or that a later step was open. Add a current-state pointer; do not
rewrite the past tense of those records into a claim they never made.

## References and evidence boundary

Read before execution:

- `AGENTS.md` §2, §5 numbering exception, §8 production-target exception, §10.
- `docs/build-plan.md` header, §13 Phase 12 amendment, and the Prompt 410–412
  records at the end of the file.
- `docs/project-status.md` managed-target amendment, completion estimate,
  closed milestones, and operator-owned launch work.
- `docs/vercel-deployment.md` opening status and "Resume here" through the
  Prompt 409 retention note, plus the Prompt 410–412 sections. Confirm the
  Prompt 412 anchor exists before linking it; if it does not, record the
  reconciliation in this prompt's owning docs rather than inventing the anchor.
- `docs/launch-checklist.md` §3, §6A and §7 only as the sign-off authority.
  Do not restated the 61/70 blocker inventories from memory; quote the files
  after re-reading them, or cite `docs/project-status.md` if this prompt does
  not re-run the checkers.
- `docs/adr/0001-vercel-managed-production.md` status line, so the amendment
  does not contradict an accepted ADR.

No static visual reference, crop or breakpoint measurement applies. No runtime,
schema, route, CI workflow, verifier, or secret changes.

## Decision

Keep every dated historical paragraph. Supersede only text that a new session
would read as the current instruction.

Current state to record, each claim traced to an existing doc rather than
restated as new proof:

- Selected production target remains `vercel-managed-production` (ADR 0001,
  Prompt 370). Compose+Caddy remains the implemented self-host reference and
  is not deleted.
- Managed engineering recorded through Prompt 412 includes local adapters,
  preview deployment `dpl_AGwu9k8gbtQRegTodmHUAL7uxYs4`, scanner snapshot
  `snap_8OP5G2tCUvxtRdoGFMCu5se58f3N`, Tier 2 retirement, the 7-stage
  activation plan, and dual-topology checklist/status reconciliation.
- Phase 12 exit is not met. Production promotion, custom-domain DNS, production
  secret provisioning, live drills and eleven human sign-offs remain
  operator-owned. Example readiness records fail closed (Compose 70 blockers,
  managed 61) and must not be edited to pass.
- The next repository-executable engineering unit is not known from this
  prompt. After this reconciliation, the next `i` must re-read the corrected
  plan and either stop because only operator-owned launch work remains, or
  select a newly discovered repository defect. Do not pre-commit that next
  unit here.
- Numbering: the 2026-10-15 exception authorized one renumber and then said the
  next number was 371. That sentence is a historical fact about the exception,
  not a current allocator. Current numbering is "highest existing `prompts/`
  number plus one," which is already the standing rule. The exception paragraph
  must say the 371 figure is historical as of 2026-10-15 and must not be used
  to allocate a new prompt.

## Non-goals

- Do not provision accounts, rotate secrets, dispatch GitHub Actions, deploy,
  retire snapshots, or run a live drill.
- Do not edit readiness example JSON to reduce blocker counts.
- Do not change product behavior, V1 scope, or the no-AI production posture.
- Do not rewrite Prompt 370–409 historical records to hide that they were
  incomplete on their own dates.
- Do not add a new ADR. This prompt records that an accepted decision's
  implementation record moved; it does not make a new architecture choice.
- Do not renumber any prompt file.

## Execution steps

1. Confirm `main`, a clean worktree, and HEAD. Record the actual SHA.
2. Re-read the four stale regions named above and the Prompt 412 records.
   If a region was already corrected by an uncommitted or later commit, do not
   apply that step; say so in the execution notes.
3. `docs/build-plan.md` header: replace the current-tense "have not been
   implemented" instruction with a dated supersession. Keep one sentence that
   the 2026-10-15 text meant migration was not implemented *at that date*.
   Point to `project-status.md`, the Phase 12 current-state subsection added
   in step 4, and `vercel-deployment.md`. State that launch is not approved.
4. `docs/build-plan.md` Phase 12 amendment: leave the 2026-10-15 decision
   paragraphs (selected target, retained Compose profile, provider boundaries,
   invariants that must be preserved). Immediately after the "next
   implementation sequence is owned by Prompt 370 / no managed proof" paragraph,
   add a **Current state — 2026-10-20** subsection that supersedes that
   paragraph and the six ordered future-tense steps as *instructions*. Mark
   which of the six steps later records say are locally or preview-proven, and
   which remain operator-owned (account/region/spend confirmation if still
   unverified, production promotion, live recovery evidence, eleven sign-offs).
   If a step's proof is only a preview seam and not production, say "preview
   proof, not production approval" rather than "done."
   Change "The next new prompt number is 371" so it remains inside the
   historical reorganization note and is explicitly not the current allocator.
5. `AGENTS.md` §5 numbering exception: add one clause that "the next new prompt
   number is 371" was the allocator on 2026-10-15 and is not the current
   allocator. Do not delete the exception. Do not add other rows. §8's
   production-target exception already defers activation to
   `docs/vercel-deployment.md`; leave it unless execution finds it asserting
   that managed activation is unimplemented. If it does, add the same
   historical/current split in that paragraph only.
6. `docs/vercel-deployment.md` opening: replace the two current-instruction
   paragraphs (status and "Prompt 370 is still executing") with a short current
   status that points at the Prompt 409–412 sections and states production
   activation and launch approvals remain open. Keep the snapshot-retention and
   manual-scanner paragraphs that are already dated 2026-10-20. Do not delete
   the sub-prompt index; label it as the historical split of Prompt 370, and
   append 410–412 to that index so the resume list is not truncated at 409.
   Do not rewrite later evidence sections.
7. Append a concise Prompt 413 record to `docs/build-plan.md`,
   `docs/operations.md` and `docs/vercel-deployment.md` in the same change.
   Each record states documentation-only scope, the superseded sentences, and
   that no launch category was approved.
8. Do not claim a checker passed unless it is run. Minimum verification:
   - `git diff --check`
   - `rg -n "have not been implemented|next implementation sequence is owned|next new prompt number is 371|still executing" docs/build-plan.md docs/vercel-deployment.md AGENTS.md`
     The historical mentions may remain only inside paragraphs explicitly
     labeled historical or superseded. A bare current-tense hit is a defect.
   - Re-read the edited regions and confirm every new claim cites an existing
     prompt record or doc path that was opened this session.
   Lint, typecheck and build are not required for a docs-only change unless a
   code file is touched. If any code file is touched, stop; that is out of scope.
9. Request review, evaluate feedback, fix only verified defects, then commit
   locally to `main` with `caveman-commit`. Do not push.

## SKILLS USED

- `architecture-decision-records` — loaded while writing this prompt so the
  current-state note does not silently rewrite an accepted ADR or its historical
  context. Implementation reloads it before editing the amendment.
- `deployment-pipeline-design` — implementation loads it to keep promotion,
  preview proof and production approval as separate gates while rewriting the
  Phase 12 instructions.
- `requesting-code-review` — dispatch review after the diff is self-checked.
- `receiving-code-review` — verify any review finding against the files before
  editing.
- `caveman-commit` — write the local commit message. Subject must say why the
  plan's current instructions were wrong, not merely that docs changed.

No other skill is required. This prompt does not change secrets, alerts, UI,
schema or tests. If execution discovers a code change is necessary, stop and
report it instead of widening the prompt.

## Acceptance

- A new session reading only `docs/build-plan.md`'s header and Phase 12
  amendment cannot conclude that Prompt 370 has not started, that it still owns
  the next implementation sequence, or that the next prompt number is 371.
- Dated records that were true on their own dates are still present and are
  not rewritten as if later work had already happened.
- `AGENTS.md` §5 no longer allocates prompt 371.
- `docs/vercel-deployment.md` resume status does not say implementation is still
  executing, and its index includes 410–412.
- No readiness example, workflow, or application file changes.
- The commit is local, on `main`, and does not approve launch.
