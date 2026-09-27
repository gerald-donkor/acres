# 216 — operator launch evidence handoff

## Scope and why this is next

Phase 12K is the earliest unfinished build phase. The committed baseline is
`5a1cc5e` on `main`: prompts 205–215 have assessed all eleven launch
categories, and each remains unresolved because production evidence and named
operator decisions were not available in the repository. Prompt 201 already
owns the final go/no-go decision. The next dependency-safe unit is to obtain
one coherent operator handoff for the **shared** target, release, evidence
store, owners, and read-only access before repeating category inspections or
attempting prompt 201's live drills. This prompt does not re-assess Categories
1–11 from the same template state.

## Authorities and material to read

- Re-read `AGENTS.md` §§2–7 and 10, `docs/build-plan.md` §§13–14 and 22,
  `docs/launch-checklist.md` §§2–4, 6A and 7, `docs/operations.md` Phase 12K,
  `docs/system-architecture.md` production topology, `docs/security.md`
  production trust boundaries, and `docs/skills.md`.
- Re-read `prompts/201-production-launch-evidence-and-signoff.md` and the
  committed outcome for prompts 203–215. Inspect the current launch schema,
  unresolved example, validator, drill runner and sign-off matrix. Git and
  current files, rather than a prompt's prose, establish implemented state.
- No visual comp, crop, pixel measurement, breakpoint, product route, or UI
  change applies. The measured outcome is an operator-provided, internally
  consistent handoff with an identifiable production target and release,
  evidence location, category owners, and explicit read-only access scope.
  The readiness gate remains 11/11 approved categories, seven successful
  targeted drill stages, and all Phase 12 exit checks; no number is inferred
  from the checked-in example.

## Handoff procedure

1. Record the current branch, source SHA and worktree state; preserve unrelated
   changes. Check the approved repository paths for a materialized operator
   readiness record or redacted evidence pointers. Distinguish repository
   absence from absence in the restricted operator store.
2. Present the operations lead with **one consolidated request**, following
   `docs/launch-checklist.md` §6A. Request the designated production
   environment identifier, reviewed source SHA, current and previous immutable
   client/server image identifiers, materialized Caddy/Compose identifiers,
   restricted evidence-store location, operator readiness-record location,
   and named deployment approver and rollback authority. Request category
   supplier and signer names for all eleven rows, plus the identity and access
   path of the person permitted to arrange read-only inspection. Obtain opaque
   references to existing child reports and underlying live sources, not copies
   of credentials or raw inventories. Record the operator's date/time and the
   release identity so later evidence cannot silently cross targets.
3. Compare the handoff with the eleven row-specific requirements in §6A.
   Create a concise matrix in `docs/launch-checklist.md` linking each category
   to its owner, supplied reference, independently inspectable source, and
   remaining gap. Mark a reference `supplied, unverified` until the actual
   source is inspected. Do not mark a category approved from a pointer, a
   hand-authored JSON child, or a green validator alone. If no handoff is
   provided, record only a dated shared prerequisite update with the source
   SHA and exact missing handoff inputs; do not copy eleven existing gap
   paragraphs into a new assessment.
4. Before any live inspection, confirm the approved read-only target and
   access scope through the operator channel. Inspect only redacted, safe
   fields. Keep host inventories, tenant data, secret values, key material,
   credentials, private evidence and signed readiness records in the approved
   restricted store. Repository notes may contain only opaque identifiers and
   non-sensitive decisions. Do not send an email, Slack message or other
   outbound communication without explicit authorization; if no operator
   channel is available, prepare the handoff request for the user and leave
   the production state unresolved.
5. Distinguish read-only inspection from live actions. A launch drill, load or
   DoS test, SMTP delivery, restore, HSTS activation, promotion, rollback,
   secret rotation, report/export write, or other production mutation requires
   a separate concrete target, named authority, action, window and recovery
   plan. Approval to execute this prompt does not supply those facts. Do not
   invoke the targeted seven-stage drill or edit a production record until
   those prerequisites are established.
6. When the shared handoff is coherent, identify the category work that can
   resume and the remaining access/approval gaps. Route the final eleven-row
   decision through prompt 201; do not create a second sign-off procedure or
   declare Phase 12 complete here. If inspection exposes a genuine code or
   runbook defect, document it precisely and scope a separate implementation
   prompt rather than adjusting the validator to make evidence pass.

## Expected changes, failure cases and rollback

- The intended repository change is a short dated update to
  `docs/launch-checklist.md` §6A, and to `docs/operations.md` only if its
  implemented-state description needs a verified correction. No production
  configuration, secret, readiness example, schema, validator, runtime route,
  migration, or UI file changes are planned. An operator-controlled readiness
  record can be updated only after its own verification and authority checks
  under prompt 201; it is outside this prompt's repository diff.
- Reject mismatched release identifiers, unnamed signers, missing evidence
  provenance, inaccessible pointers, stale/future timestamps, synthetic
  production claims, unredacted secrets, and a report whose target differs
  from the selected production environment. Keep the affected item unresolved
  and name its owner and next safe action.
- Documentation-only corrections can be reverted in one scoped commit. Preserve
  the fail-closed readiness example and the existing 11-category gate.

## Verification and completion

1. For any repository edit, run and quote the actual result of
   `git diff --check`, `npm run ops:readiness-schema-test`,
   `node --test scripts/ops/check-launch-readiness.spec.js`,
   `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`
   (expected nonzero), `npm run ops:templates`, `npm run ops:check`,
   `npm run lint`, `npm run typecheck`, and `npm run build`. Follow §6's root
   scripts. Report environmental failures as failures with the exact message;
   do not relabel them as passes. Run the validator against a real operator
   record only if one is available through the approved channel.
2. Inspect the complete scoped diff for accurate claims, valid Markdown links,
   raw identifiers and secret leakage. Request an independent reviewer
   subagent with `requesting-code-review`, including BASE_SHA/HEAD_SHA,
   requirements, changed files and real check output. Evaluate every finding
   with `receiving-code-review`, fix valid issues, repeat affected checks, and
   request follow-up review after a material change.
3. Stage only scoped files, inspect the staged diff and commit locally to
   `main` using `caveman-commit`. Do not push. Report the handoff state and
   the exact next operator input or prompt 201 action. A missing handoff
   cannot be represented as launch approval.

## SKILLS USED

- `deployment-pipeline-design` — preserve the distinction between evidence
  intake, drill gates, and human production approval.
- `secrets-management` — define safe opaque references and restricted access
  for the operator handoff.
- `requesting-code-review` — dispatch independent review of the resulting
  record and diff.
- `receiving-code-review` — verify review findings before changes.
- `caveman-commit` — write the required local commit message.
