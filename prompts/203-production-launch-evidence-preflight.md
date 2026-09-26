# 203 — production launch evidence preflight

## Scope and why this is next

The committed baseline is `3da8949` on `main`. Phase 12K's repository gates and
target-bound drill runner are implemented, but the checked-in readiness example
still has eleven unresolved categories. Prompt 201 governs actual production
evidence collection and human sign-off; it remains unexecuted. Its first
precondition depends on operator-owned targets, records, access, and authorities
that this repository does not supply. This prompt is the first read-only,
dependency-safe unit of that precondition: produce a concrete, redacted gap
register so the operator can see exactly what is needed before prompt 201's
live drills or approvals. It does not supersede prompt 201 or close Phase 12.

## References and verified baseline

- Re-read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §13, §14, and §22;
  `docs/operations.md` Phase 12K; `docs/launch-checklist.md` §§2–4 and 7;
  `docs/system-architecture.md` production topology; `docs/security.md`
  production trust boundaries; `docs/skills.md`; and prompt 201. Check code
  and Git state again: a prompt file alone does not prove execution.
- Inspect `infra/launch/readiness.example.json`, its schema,
  `scripts/ops/check-launch-readiness.js`, `scripts/ops/launch-readiness.sh`,
  `scripts/ops/run-launch-drills.sh`, and each checklist-linked evidence
  command. Verify exact flags and report fields from those files before
  proposing an operator command. Do not derive a value from an example.
- No static design reference, UI measurement, breakpoint, or screenshot applies.
  The measurable gate is eleven separately approved categories, seven
  successful drill stages, and the Phase 12 thresholds already recorded in
  the checklist: availability ≥99.9%, HTTP p95 ≤500 ms, capacity ≥100 RPS,
  DB acquisition p95 ≤50 ms, DB query p95 ≤100 ms, RPO ≤1 hour, RTO ≤4 hours,
  and eleven alert rules. These are acceptance limits, not observed production
  results. Confirm their current values against code/docs during execution.

## Deliverable and exact procedure

1. Create a dated **preflight gap register** in `docs/launch-checklist.md`
   immediately before §7, or in a clearly linked new subsection there if §7
   has moved. Keep the canonical checklist and its eleven category definitions
   intact. Record the reviewed source commit and UTC assessment time. State
   that the assessment is based on repository-visible evidence unless an
   operator-approved read-only source was actually inspected.
2. For every one of the eleven readiness categories in the example JSON, record:
   the category ID; current repository-visible state; exact missing
   operator-owned value or decision; required child artifact and underlying
   live source that must be independently verified; named role that must supply
   or approve it; and the next safe action. Distinguish `missing`, `available
   but unverified`, and `verified` only when real evidence supports the label.
   Preserve an explicit `unresolved` launch status for every category without
   current production evidence. Do not call a passing local template, unit
   test, dry run, default drill, synthetic benchmark, or hand-authored JSON
   proof of production conditions.
3. Include cross-category prerequisites: materialized production Caddy/Compose
   paths; approved benchmark and API origins; fresh target-bound Prometheus
   telemetry; isolated restore target; immutable current/previous image pairs;
   release provenance; runtime secret-store references; alert routing; and
   approver, rollback, key-recovery, maintenance-window, and evidence-store
   authorities. Link each prerequisite to the category or drill stage it
   blocks. Record Stage 3 and Stage 6's target binding from prompt 202 and
   Stage 5's dry-run-only rotation limit.
4. Prepare an operator handoff section with a **minimal, nonsecret request**
   for the missing items: roles and opaque evidence references, not passwords,
   tokens, raw inventories, private connection strings, or credentials in chat.
   Separate read-only access requests from any later live benchmark, DoS,
   deployment, rollback, restore, HSTS, or rotation authorization. Show the
   exact targeted drill command only as a parameterized example copied from
   verified flags; label it **not executed**. Do not select an environment,
   domain, host, provider, contact, retention value, secret store, or maintenance
   window for the operator.
5. Run only repository-safe, read-only checks needed to establish the baseline:
   `git status --short`, `git log -1 --oneline`, and the readiness validator on
   `infra/launch/readiness.example.json`. The validator is expected to fail
   closed; capture its exit code and category/blocker totals without treating
   failure as a defect. Avoid `--with-drills` and do not run any live target,
   load, DoS, restore, deployment, rollback, or secret-rotation command.
6. Update the Phase 12K record in `docs/build-plan.md` with the dated preflight
   result and pointer to the gap register. If `docs/operations.md` needs a
   correction to reflect the verified command path, change only that sentence.
   Do not add an `AGENTS.md` index row: the existing documents own this area.

## Failure handling, scope boundaries, and rollback

- If operator records or access are absent, say so in the register and leave
  every dependent item unresolved. The preflight still succeeds as an honest
  inventory; it does not claim launch readiness.
- If repo code and documentation disagree, verify the code, identify the stale
  line, and correct it in the owning document. If a genuine implementation
  defect blocks prompt 201, record the precise defect and propose a separate
  remediation prompt; do not broaden this preflight into a code change.
- Do not create an approved readiness record or a fabricated child report.
  Do not commit raw operator evidence, identifiers that expose private hosts,
  secret values, or an operator sign-off. Redacted references may be committed
  only after checking the diff. No product route, API, schema, UI, migration,
  deployment configuration, or production state changes are in scope.
- Rollback is a revert of the documentation commit. Historical preflight
  findings must remain labelled with their assessment date and source commit
  so later operator evidence can supersede them without being silently
  retrofitted.

## Verification, review, and completion

1. Verify all eleven category IDs and requirements against the current example,
   schema, validator, and checklist. Confirm the recorded blockers have no
   invented operator values. Run the scoped documentation/format check if one
   exists, `git diff --check`, `npm run lint`, `npm run typecheck`, and
   `npm run build` as required by `AGENTS.md` §6; quote real output, including
   the validator's expected failure. Inspect the full and staged diffs.
2. Dispatch a reviewer subagent using `requesting-code-review` with baseline
   SHA, changed paths, requirements, check outputs, and an explicit request to
   detect false production attestations or missing categories. Use
   `receiving-code-review` to verify findings; fix valid issues, rerun affected
   checks, and request follow-up review if the evidence/governance structure
   changes materially.
3. Commit only the reviewed documentation and this approved prompt to local
   `main` with a `caveman-commit` message; do not push. Report the gap register
   location, verified blocker totals, and the exact operator inputs needed for
   prompt 201. Completion of this preflight leaves Phase 12 and prompt 201
   open.

## SKILLS USED

- `deployment-pipeline-design` — keep promotion, rollback, approval, and drill gates distinct.
- `secrets-management` — request indirect references and protect operator evidence.
- `prometheus-configuration` — interpret required live telemetry and alert evidence without synthetic claims.
- `requesting-code-review` — independent review of the documented gap register.
- `receiving-code-review` — verify and resolve reviewer findings.
- `caveman-commit` — concise local commit message after execution and review.
