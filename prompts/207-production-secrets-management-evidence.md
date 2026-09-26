# 207 — production secrets management evidence

## Scope and why this is next

The committed baseline is `f2f0e1b` on `main`. Phase 12K is still open under
`docs/build-plan.md` §13/§22 and the umbrella sign-off procedure in prompt 201.
Prompts 205 and 206 recorded unresolved production evidence for checklist
Categories 1 and 2. The next checklist category is `secrets_management`. This
prompt performs its independent, dependency-safe evidence intake, with an
honest unresolved result when operator material is unavailable. It may close
Category 3 only after its source evidence and security-lead sign-off are
verified. It cannot close Phase 12 or infer approval of any other category.

## References and verified contract

- Re-read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §§13, 14, 22;
  `docs/launch-checklist.md` §§2–4, 6A, 7; `docs/operations.md` Phase 12K and
  its Prompt 192 secret-rotation evidence record; `docs/security.md` TM-15 and
  Phase 12H; `docs/system-architecture.md` production topology;
  `docs/skills.md`; and prompts 201, 203, 205, 206. Reconcile prose with
  current repository code and Git history.
- Inspect `infra/launch/readiness.example.json`,
  `infra/launch/readiness.schema.json`,
  `infra/env/production.env.example`,
  `scripts/ops/check-launch-readiness.js` and its focused tests,
  `scripts/ops/run-secret-rotation-drill.sh`,
  `scripts/ops/scan-secrets.sh`,
  `scripts/ops/run-launch-drills.sh`, and the actual production injection and
  rotation policy supplied by the operator before evaluating a live record.
  Resolve exact current commands and JSON fields from those files at execution.
- No visual surface, product route, static design reference, crop, pixel
  measurement, or breakpoint applies. The measurable contract is a positive
  `rotation_cadence_days` of at most 90; a real, nonfuture UTC child-report
  timestamp; all seven required secret classes and seven required steps
  passing; `errors: []`; and confirmed redaction flags. These are acceptance
  criteria, not observations about production.
- The readiness validator accepts a candidate report by the rotation filename,
  `drill_type: "zero_downtime_secret_rotation_and_compromise_response"`, or
  report structure. It validates a successful child but does **not** prove
  that any live credential was rotated. The current runner's help states that
  it verifies protocol simulations without mutating live credentials; even a
  run without `--dry-run` can proceed when PostgreSQL, Valkey, and API are
  unreachable. Stage 5 of the unified launch drill explicitly forces
  `--dry-run`. Therefore a passing child or 7/7 dossier is supporting drill
  evidence only; independent, authorized live rotation and injector evidence
  plus human review are required for Category 3 approval.

## Preconditions and operator handoff

1. Verify branch, HEAD, and worktree; preserve unrelated changes. Confirm the
   checked-in readiness example is unresolved. Search only relevant,
   approved repository paths for a materialized production readiness record
   or redacted Category 3 evidence reference. A repository search cannot
   establish what exists in an operator's restricted store.
2. Obtain through an approved operator channel the designated production
   target and restricted evidence-store location; runtime injection mechanism
   and owner; masking/logging policy; actual rotation cadence (at most 90
   days); compromise-response runbook; seven-class rotation procedure;
   redacted injector/audit and previous rotation references; and the named
   security-lead approver. Request only opaque references and controlled
   read-only access. Do not request or print passwords, tokens, signing keys,
   unredacted environment dumps, recovery keys, or live secret values.
3. Identify how the actual API, worker, PostgreSQL roles, Valkey, Garage,
   SMTP, and Grafana receive their production secrets. Inspect redacted
   policy/inventory evidence for access boundaries, service identity,
   masking, audit, expiration and revocation. Cross-check the mechanism with
   the separate `secret_references` section without approving Category 4 or
   inventing its twelve references. If the operator cannot provide enough
   safe evidence to verify these facts, leave Category 3 unresolved.
4. Before a live rotation, obtain separate authorization naming the exact
   production target, secret class, operator, action, maintenance window,
   fallback/rollback procedure and observer. Generic approval of this prompt
   authorizes read-only evidence inspection, not mutation of production
   credentials or sessions. An existing, dated operator rotation record may
   be inspected read-only if its scope and authenticity can be verified.
5. If a prerequisite is missing, document a dated Category 3 blocker with
   the security-lead owner and next safe action in
   `docs/launch-checklist.md`. Do not generate a success-shaped report or
   approve the section to make the validator pass.

## Evidence procedure when preconditions hold

1. Verify the approved injection and masking policies against the materialized
   production deployment and redacted runtime/store inventory. Confirm no
   credential value appears in image layers, client-visible variables, Git,
   ordinary logs or evidence. Check that the declared cadence is both approved
   and actually scheduled/operated, and that the compromise runbook has a
   named owner and covers revocation, containment, replacement and validation.
   Record UTC observation time and opaque source identifiers.
2. Inspect independent, operator-controlled live rotation evidence for each
   required class: session secret, CSRF secret, PostgreSQL role passwords,
   Valkey password, Garage/S3 access keys, SMTP credentials and Grafana admin
   password. Check the date, target, authorized actor, before/after health,
   old-credential revocation and any approved overlap or grace period. Do not
   perform a rotation to fill a gap without the separate authorization above.
   A simulation of these transitions does not count as a live rotation.
3. Run the repository `scan-secrets.sh` only against its documented safe
   repository scope; never point it at unredacted operator material. Inspect
   a current `secret-rotation-evidence-<timestamp>.json` child in the
   restricted store, or run the deterministic drill to produce one there if
   the target and output path are approved. Treat the runner's optional
   reachability probes as nonblocking diagnostics, not proof of live rotation.
   Require a valid nonfuture UTC timestamp, `status: "success"`, empty
   `errors`, all seven `tested_secret_classes`, and `status: "passed"` for
   `session_rollover`, `csrf_rollover`, `database_rotation`, `valkey_rotation`,
   `storage_rotation`, `compromise_response`, and `redaction_audit`. Require
   `raw_secrets_masked: true` and `zero_dev_passwords_detected: true` under
   `steps.redaction_audit`. Inspect **every** referenced child, including
   wildcard matches; a malformed or failing report blocks approval even
   beside a valid one. A dossier or prose note alone is insufficient.
4. Compare the independent live evidence with the drill's claims. Reject a
   different environment, stale or future-dated report, partial class
   coverage, unverified revocation, leaked value, or discrepancy between
   operator policy and actual runtime injection. Do not treat a hand-authored
   passing JSON as authentication of the underlying event.
5. Prepare or inspect an operator-owned readiness record based on the schema,
   preserving all eleven sections and release fields. Set only
   `secrets_management.status` to `approved` after the security lead reviews
   the live sources and signs a dated Category 3 decision. Populate
   `injection_mechanism`, `masking_policy`, `rotation_cadence_days`,
   `compromise_response_plan`, `approver`, and `evidence` from verified facts.
   Keep Categories 1, 2, 4 and all other unresolved categories as they were
   unless separately approved under their own procedure. Never rewrite the
   checked-in example as a production attestation.
6. Run `npm run ops:readiness-schema-test` and
   `node scripts/ops/check-launch-readiness.js <operator-readiness.json>`.
   The full validator can correctly exit nonzero while other categories
   remain unresolved; inspect Category 3's blockers separately. Compare any
   green Category 3 result to the independent injector, audit and live
   rotation sources, then the dated human sign-off. Keep raw evidence and
   signed records in the restricted operator store; put only approved,
   redacted identifiers in Git.
7. Record the dated decision, reviewed source commit, safe evidence IDs,
   exact check outcomes, and remaining gates in `docs/launch-checklist.md`.
   Update `docs/operations.md` or `docs/build-plan.md` only for a verified
   correction or new implementation fact. Prompt 201 still governs final
   eleven-category sign-off.

## Scope boundaries, failure handling, and rollback

- No product code, API, UI, migration, dependency, CI pipeline, provider
  configuration, new secret store, credential rotation, production deployment
  or promotion is planned. If a code defect or changed trust boundary is
  discovered, prepare a separate prompt and load the corresponding Phase 12
  skills before changing it.
- If live source records, read-only access, or security-lead sign-off are
  missing, leave Category 3 `unresolved`; report exactly what is absent and
  who can supply it. Do not turn Stage 5 dry-run or the checked-in fixture
  into production evidence.
- On a failed live operation, preserve its evidence in the approved store and
  use the operator's incident and compromise procedure with the named
  authority. This prompt does not authorize an agent-led retry or rollback of
  production secrets. If a scoped documentation record is wrong, correct or
  revert that record without erasing the operator audit trail.

## Verification, review, and completion

1. Quote actual command output and exit codes for the schema test,
   `node scripts/ops/check-launch-readiness.js
   infra/launch/readiness.example.json` (expected fail-closed), any
   authorized operator-record validation, `npm run ops:templates`,
   `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`,
   and `git diff --check`. Run a focused rotation-drill check only when it
   adds evidence to a concrete remaining risk and its output directory is
   safe. Report network/sandbox failures as failures, never as passes.
2. Review the full and staged diff for secret values, private identifiers,
   unredacted inventories, and out-of-scope changes. Dispatch a read-only
   reviewer subagent using `requesting-code-review`, with requirements,
   base/head SHAs, scoped paths, real check results and the simulation/live
   evidence distinction. Evaluate feedback with `receiving-code-review`,
   verify claims against code and evidence, fix valid issues, rerun affected
   checks and re-review material changes.
3. Stage only the approved prompt/documentation changes and any explicitly
   authorized redacted record. Commit to local `main` with a
   `caveman-commit` message; do not push. Report the actual Category 3 state,
   remaining Phase 12 gates, and exact public command for checking readiness.
   Do not disclose the restricted evidence location or its contents in a
   public response. If no operator evidence is supplied, state that Category
   3 remains unresolved.

## SKILLS USED

- `secrets-management` — assess runtime injection, masking, rotation and safe evidence handling.
- `deployment-pipeline-design` — preserve production action approval and rollback gates.
- `requesting-code-review` — independent review of the evidence record and scoped diff.
- `receiving-code-review` — verify reviewer findings before changing the record.
- `caveman-commit` — write the final local commit message.
