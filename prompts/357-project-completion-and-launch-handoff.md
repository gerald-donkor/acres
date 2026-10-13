# Phase 12K — Whole-project completion audit and launch handoff

## Scope and why next

Baseline: `4e9d6eb` on main, clean worktree. Core application phases have
committed implementations; the Phase 12 operator evidence exit remains open.
The user requested the next implementation and a whole-project percentage and
remaining-work assessment. Reconcile that completion record before prescribing
more isolated hardening changes. This documentation implementation is a
dependency-safe Phase 12 handoff; it does not execute or close Prompt 201.
The user explicitly authorized execution immediately after planning.

## References

Read AGENTS.md, docs/build-plan.md (all phase contracts and latest evidence),
docs/product.md (V1, success criteria and open decisions), docs/skills.md,
docs/system-architecture.md, docs/backend.md, docs/authenticated-app.md,
docs/ingestion.md, docs/analytics.md, docs/dashboards.md, docs/reports.md,
docs/ai.md, docs/operations.md and docs/launch-checklist.md (eleven categories,
gap register and sign-off matrix). Read prompts/201-production-launch-evidence-and-signoff.md.
Inspect actual app routes, feature modules, schema, tests, CI and infrastructure
and git history to distinguish implemented, historically tested, currently
verified, unbuilt and operator-blocked work. No visual changes or measurements;
static comps and Next APIs do not apply to this docs-only implementation.

## Deliverables and allowed files

1. Add docs/project-status.md with a dated baseline, an explicitly judgment-based
   completion estimate and range for approved V1, a transparent weighting rubric
   that sums to 100, and separate product implementation versus production
   readiness descriptions. Do not count prompt numbers, test counts or 0/11
   example categories as a project completion percentage. A percentage is a
   planning estimate, not measured effort remaining or an acceptance verdict.
2. Cover marketing/design; infrastructure/tenancy/contracts; auth and teams;
   uploads/worker/ingestion/geography; analytics/dashboard; reports/exports;
   optional AI; operations and launch. Cite existing code and committed evidence
   for every implemented area. Check complete V1 journeys, including job/audit
   visibility, and identify actual UI gaps without inventing new scope.
3. Separate remaining engineering/verification from operator-owned deployment,
   live drills and sign-offs; identify decisions needed, dependency order and
   completion evidence. List all eleven launch categories in a compact table.
   State that repository templates do not reveal external operator state.
   Keep optional/deferred features out of the launch denominator.
4. Correct demonstrably stale current-state lines in docs/build-plan.md header,
   docs/analytics.md and docs/dashboards.md residual sections. Reports and the
   disabled AI preview are implemented; sharing/collaboration are still deferred.
   Preserve historical dated verification records and no-AI launch policy.
5. Add exactly one AGENTS.md index row for docs/project-status.md and a short
   Phase 12K handoff record in docs/operations.md and docs/build-plan.md with
   real verification results and remaining gates. Do not spread a new duplicate
   status ledger across other documents.

Only this prompt, docs/project-status.md, docs/build-plan.md, docs/operations.md,
docs/analytics.md, docs/dashboards.md and the AGENTS.md index row may change.
No runtime code, dependencies, schema, UI, CI, secrets or live operations.

## Verification and review

Re-read this prompt before implementing. Verify every newly linked local path
and claimed feature against code; inspect relevant git commits. Run the existing
read-only example readiness validator and record its real category/blocker
counts and expected failing exit. Run installed Prettier on new Markdown files and added prose blocks,
preserving the existing formatting of historical records,
root npm run lint, npm run build, then npm run typecheck sequentially and git
diff --check. Store outputs under /tmp/acres-357-*.log. Do not claim new browser,
database, online dependency audit or production evidence. No new tests for
documentation. Use supported sandbox escalation only if a required check fails
from subprocess restrictions, preserving actual results and limitations.

After self-verification dispatch a read-only reviewer using the requesting-code-review
template: baseline/head `4e9d6eb` plus working diff, requirements, estimate rubric,
inspection basis and check logs. No edits or delegation by reviewer. Evaluate
feedback with receiving-code-review, correct verified omissions or misleading
claims, and re-review if significant. Record the review and actual checks;
stage only allowed files, inspect staged diff, commit locally to main with
caveman-commit. Do not push. Final response must answer the user's whole-project
percentage and remaining work and give the status-document link and commit.

## Impact and rollback

No route or runtime behavior changes. The result is a concrete completion and
launch handoff; estimates cannot approve release. Ordinary commit revert restores
the prior documentation. Inspect docs/project-status.md and reproduce the
read-only readiness assessment with
`node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`.

## SKILLS USED

- `deployment-pipeline-design`: separate implementation from live release gates.
- `requesting-code-review`: independent evidence and plan-alignment review.
- `receiving-code-review`: verify reviewer findings before corrections.
- `caveman-commit`: required local Conventional Commit.

No skill specifically owns project-completion arithmetic. Repository evidence
and an explicit planning rubric establish the estimate. Conditional Phase 12
runtime, secrets, CI, telemetry, browser, database and security skills are not
triggered by a documentation-only handoff with unchanged controls.
