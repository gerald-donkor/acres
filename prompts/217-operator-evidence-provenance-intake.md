# 217 — operator evidence provenance intake

## Scope and why this is next

Phase 12K remains the earliest unfinished phase in `docs/build-plan.md` §13. The
latest committed assessment (`efb36d5` on `main`) found no operator handoff or
approved read-only evidence channel in the repository. Prompt 216 made one
consolidated handoff request in `docs/launch-checklist.md` §6A; repeating that
request or checking the same unresolved example cannot advance the launch gate.
The next dependency-safe unit, **once the operator responds**, is to verify the
shared handoff and provenance of the eleven supplied evidence references. This
is an intake and read-only inspection step. Prompt 201 remains the authority
for live drills, the complete eleven-row go/no-go decision, and Phase 12 exit.

## References and measurable result

- Re-read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §§13–14 and 22;
  `docs/launch-checklist.md` §§2–4, 6A and 7; `docs/operations.md` Phase 12K;
  `docs/system-architecture.md` production topology and secret handling;
  `docs/security.md` production trust boundaries; and `docs/skills.md`.
- Inspect prompt 201's pending brief and the committed outcomes of prompts
  203–216, the current
  `infra/launch/readiness.example.json` and schema, and
  `scripts/ops/check-launch-readiness.js`. Establish actual state from current
  files and git history, not from prompt prose.
- No visual reference, crop, pixel measurement, breakpoint, UI route or API
  change applies. The measurable intake is one target/release-bound handoff:
  the reviewed 40-hex source SHA, immutable current and previous client/server
  image identities, materialized Caddy/Compose identities, restricted readiness
  record and evidence-store locations, named deployment and rollback authorities,
  eleven category suppliers/signers, and eleven child-report plus independently
  inspectable source references. These are required fields for inspection, not
  claims that any report passes. The eventual exit gate stays 11/11 approved
  categories, seven successful targeted drill stages, and the Phase 12 checks.

## Preconditions and intake sequence

1. Record branch, `HEAD`, worktree state and UTC assessment time. Preserve
   unrelated changes. Locate an actual operator reply or operator-controlled
   handoff through an approved channel. An unanswered prompt 216 request is
   **not** a handoff. If none exists, stop the evidence intake, identify the
   consolidated request already present in §6A, and report this single shared
   blocker. Do not add another dated copy of the same gap to documentation and
   do not run production probes, drills or mutations.
2. Verify that the handoff names the production environment, source commit,
   release pair, previous pair, materialized deployment, evidence store and
   readiness-record location. Check that each of the eleven categories names a
   supplier, authorized signer, child-report reference and independent live
   source reference. Verify the handoff's UTC date and the identity/access path
   for scoped read-only inspection. Record missing or inconsistent fields once
   in a concise shared-prerequisite list. Do not infer them from examples.
3. Confirm with the operator the approved target, read-only identity, permitted
   source set and fields before opening private evidence. Use only the approved
   channel and restricted store. Inspect metadata and redacted fields needed to
   bind each artifact to its target, release, timestamp, producing system and
   corresponding live source. A pointer or filename alone is `supplied,
   unverified`; a child JSON passing local shape checks is still unverified
   until its underlying source is inspected. Reject mismatched targets/releases,
   stale or future timestamps, inaccessible sources, synthetic/template output,
   failed child artifacts, missing provenance, and unredacted secrets.
4. Update the §6A matrix only with verified intake facts: per category, owner,
   opaque artifact and source references, inspection state (`missing`, `supplied,
   unverified`, or `source inspected`), exact remaining gap and next owner action.
   Keep private hosts, tenant data, credentials, key material, raw inventories,
   signed records and reports in the restricted store. Repository notes may
   contain opaque identifiers and non-sensitive conclusions only. Do not mark
   a category `approved` during this intake.
5. Identify which categories are ready for prompt 201's final verification and
   which need fresh evidence or separate live-action approval. Any live load or
   DoS drill, SMTP send, restore, HSTS activation, deployment, rollback, secret
   rotation, or application write needs a concrete target, named authority,
   action, window and recovery plan. Approval of this prompt alone does not
   authorize those actions. Do not send email or Slack messages without explicit
   authorization.

## Expected changes, limits and rollback

- With a real handoff, change only `docs/launch-checklist.md` §6A and correct
  `docs/operations.md` or `docs/build-plan.md` only if verified implemented-state
  facts require it. No runtime route, schema, validator, readiness example,
  production configuration, migration or UI change is planned. The signed
  readiness record remains in the operator-controlled store.
- If a source cannot be inspected, preserve its `supplied, unverified` state.
  If intake exposes a concrete code/runbook defect, describe it precisely and
  prepare a separate remediation prompt. Do not weaken a gate to accept it.
- A documentation correction is reversible as one scoped commit. The fail-closed
  checked-in example and 11-category gate remain authoritative. Prompt 201 is
  resumed only after a coherent, inspectable handoff and separate live-action
  approvals for the actions it requires.

## Verification, review and completion

1. For a repository edit, run `git diff --check`,
   `npm run ops:readiness-schema-test`, `npm run ops:readiness-test`,
   `npm run ops:templates`, `npm run ops:check`, `npm run lint`,
   `npm run typecheck`, and `npm run build`; quote actual output and distinguish
   an environmental failure from a pass. Run the readiness validator against
   an actual operator record only when approved access permits, keeping the
   record and output in the restricted location. The checked-in example is
   expected to fail closed and supplies no launch evidence.
2. Review the full scoped diff for accurate provenance claims, working links,
   exposed identifiers and secrets. Dispatch independent review with
   `requesting-code-review`, giving requirements, BASE_SHA/HEAD_SHA, changed
   paths and actual checks. Evaluate feedback with `receiving-code-review`,
   fix valid findings, re-run affected checks and re-review material changes.
3. If the handoff yields a documentation change, stage only scoped files,
   inspect the staged diff and commit locally to `main` using `caveman-commit`.
   Do not push. Report the exact inspection state and next operator action.
   If no handoff exists, make no repetitive documentation commit and report
   the shared prerequisite without claiming this prompt executed successfully.

## SKILLS USED

- `deployment-pipeline-design` — keep evidence intake distinct from release
  approval, promotion and rollback gates.
- `secrets-management` — constrain private evidence access and redaction.
- `requesting-code-review` — review any resulting repository record and diff.
- `receiving-code-review` — verify findings before making corrections.
- `caveman-commit` — write the required local commit message for an executed
  prompt with a scoped repository change.
