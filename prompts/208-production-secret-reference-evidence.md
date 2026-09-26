# 208 — production secret reference evidence

## Scope and why this is next

The committed baseline is `d09b51f` on `main`. Phase 12K remains open under
`docs/build-plan.md` §13/§22 and the umbrella launch sign-off in prompt 201.
Prompts 205–207 inspected checklist Categories 1–3 and recorded the missing
operator-controlled evidence without approving them. The next independent,
dependency-safe checklist unit is Category 4, `secret_references`. This prompt
inspects twelve production secret-source references and the access policy that
backs them. It records an unresolved blocker when operator evidence is absent;
it approves Category 4 only after independent source checks and a dated
security-lead decision. It cannot close Phase 12 or approve Categories 2–3.

## References and verified contract

- Re-read `AGENTS.md` §§2–7 and 10, `docs/build-plan.md` §13/§22,
  `docs/launch-checklist.md` §§3–4, 6A, 7, `docs/operations.md` Phase 12D/K
  and Prompt 197, `docs/security.md` production/CI trust boundaries,
  `docs/system-architecture.md` production topology, `docs/skills.md`, and
  prompts 197, 201, 203, 205–207. Reconcile all prose with current Git history
  and executable code before acting.
- Inspect `infra/launch/readiness.example.json`,
  `infra/launch/readiness.schema.json`,
  `scripts/ops/check-launch-readiness.js` and its focused tests,
  `scripts/ops/scan-secrets.sh`, `scripts/ops/check-production-templates.sh`,
  `infra/env/production.env.example`, and the materialized production injection
  inventory and store access policy supplied by the operator. Resolve exact
  command behavior and fields from those files at execution.
- No visual route, design reference, crop, pixel measurement, or breakpoint
  applies. The measurable contract is exactly twelve distinct approved
  indirect sources; a real, nonfuture ISO UTC child timestamp; successful
  report status; zero errors; twelve exact matching entries with verified
  access and zero plaintext exposure; and the security-lead sign-off. These
  are acceptance criteria, not claims about the current production system.
- The exact fields are `session_secret_source`, `csrf_secret_source`,
  `db_migrator_secret_source`, `db_app_secret_source`,
  `db_monitor_secret_source`, `valkey_secret_source`,
  `garage_rpc_secret_source`, `garage_admin_secret_source`,
  `garage_metrics_secret_source`, `garage_s3_secret_source`,
  `smtp_secret_source`, and `grafana_admin_secret_source`. The validator accepts
  only `vault:path#key`, `aws-sm:name`, `env:NAME`, or
  `file:/absolute/path` syntax as defined by `validSmtpSecretReference`.
  A syntactically valid `env:` or `file:` reference alone does not prove
  protection, availability, separation, or least privilege.
- An approved section needs a concrete JSON child with
  `drill_type: "secret_reference_policy_verification"`, `status: "success"`,
  `errors: []`, a nonempty opaque `policy_reference`, and a `references`
  object containing **exactly** the twelve source fields. Each entry has only
  `source` (identical to the approved record), `access_verified: true`, and
  `plaintext_exposed: false`. The report has no extra top-level or per-entry
  fields. A custom file name qualifies by content, not name; every referenced
  JSON child, including wildcard matches, must pass. The validator checks
  internal consistency, not source provenance or actual permissions.

## Preconditions and operator handoff

1. Verify branch, HEAD, and worktree. Preserve unrelated changes. Confirm the
   checked-in readiness example is unresolved. Search only relevant approved
   repository paths for a materialized production record or redacted Category 4
   evidence reference. A repository search does not establish what is in an
   operator's restricted store.
2. Obtain through the approved operator channel the designated production
   target, restricted evidence-store location, named security lead, opaque
   identifiers for all twelve sources, the redacted secret-store policy
   printout, and a redacted runtime injection inventory for API, worker,
   migration job, PostgreSQL monitor, Valkey, Garage, SMTP and Grafana.
   Request controlled read-only access only. Never ask for or print secret
   values, raw environment dumps, access tokens, signing keys, unredacted
   policies, recovery keys, or full connection strings.
3. Identify the source and consumer of each reference. Check that the twelve
   sources are distinct, environment-bound, and actually provisioned through
   the approved injector; no secret is baked into an image, committed to Git,
   exposed in client variables, or emitted to ordinary logs. Verify store
   access policy against service identities, roles, least privilege, and audit
   records. In particular, migration, application, and monitoring database
   identities must remain separate, and Garage RPC/admin/metrics/S3 sources
   must be scoped to their actual consumers. Check that no AI/Gemini source is
   provisioned in the launch record or production inventory.
4. Cross-check the SMTP source with Category 2's
   `credentials_source_reference` and the injector mechanism with Category 3.
   A mismatch is a blocker for the affected category; matching references do
   not approve those categories. If the operator cannot supply safe source
   evidence or dated sign-off, leave Category 4 unresolved and document a
   precise blocker and next safe action under the security lead.

## Evidence and decision procedure

1. Inspect each operator-provided source reference through the approved
   read-only policy/inventory view. Confirm its target environment, existence,
   consuming service identity, grant scope, and audit trace without fetching
   the underlying value. Record the UTC observation time and opaque policy or
   inventory identifier for each assertion in the restricted evidence store.
   Reject placeholders, local-development credentials, duplicates, mismatched
   target/environment, broad grants, missing consumers, plaintext exposure, or
   an unsupported reference syntax.
2. Run `scripts/ops/scan-secrets.sh` against its documented safe repository
   scope only. Do not scan or copy operator material into the repository or a
   public log. Treat a clean repository scan as one supporting check, never as
   proof of production secret-store policy or runtime injection.
3. Inspect or produce, in the restricted operator store, the redacted
   `secret-reference-policy-<timestamp>.json` child described above. Its
   `policy_reference` must resolve to the independently reviewed policy source.
   Check its timestamp, exact keys, distinct approved sources, each source's
   equality with the readiness record, access flags, plaintext flags, and
   absence of AI/Gemini references. Inspect every referenced child; a failed
   or malformed JSON report blocks approval even beside a valid one. Prose,
   success-shaped filenames, fixtures, and a unified dossier are insufficient.
4. Prepare or inspect an operator-owned readiness record from the schema,
   preserving all eleven sections and release fields. Set only
   `secret_references.status` to `approved` when the security lead has reviewed
   the source printout, inventory, and child report and signed a dated Category
   4 decision. Populate its twelve source fields, `approver`, and `evidence`
   from verified facts. Preserve all other category states; never turn the
   checked-in example into a production attestation.
5. Run `npm run ops:readiness-schema-test` and
   `node scripts/ops/check-launch-readiness.js <operator-readiness.json>`.
   The whole-record validator may correctly exit nonzero while other
   categories remain unresolved; inspect Category 4's blockers separately.
   Independently compare any green Category 4 result to the actual policy,
   inventory, audit source and human signature. Store the signed record and
   raw evidence in the operator-approved restricted location. Commit only
   explicitly approved, redacted identifiers.
6. Record the dated decision, source commit, safe evidence IDs, exact checks,
   missing facts and owner in `docs/launch-checklist.md`. Correct
   `docs/operations.md` or `docs/build-plan.md` only for verified new facts.
   Prompt 201 still governs the final eleven-category launch decision.

## Scope boundaries, failure handling, and rollback

- No product code, API, UI, migration, dependency, CI configuration, secret
  value, store policy, IAM grant, runtime injection, credential rotation,
  deployment, or production promotion is planned. Generic approval of this
  prompt authorizes read-only evidence intake for a concrete identified target;
  any production mutation needs a separate target-and-action-specific approval.
- If access, materialized sources, policy, inventory, or security-lead sign-off
  is missing, keep Category 4 `unresolved` and report the exact gap. Do not
  create a passing child or borrow a test fixture to satisfy the validator.
- If a plaintext exposure or invalid grant is found, preserve redacted audit
  evidence and route remediation through the operator's security/compromise
  procedure. Do not change grants or rotate secrets under this prompt. Correct
  or revert only an inaccurate scoped documentation record; keep the operator
  audit trail intact.

## Verification, review, and completion

1. Quote real output and exit codes for `npm run ops:readiness-schema-test`,
   `node scripts/ops/check-launch-readiness.js
   infra/launch/readiness.example.json` (expected fail-closed), any authorized
   operator-record validation, `npm run ops:templates`, `npm run ops:check`,
   `npm run lint`, `npm run typecheck`, `npm run build`, and
   `git diff --check`. Run the repository secret scan only in its documented
   scope. Do not label an unavailable check as passing. Review full and staged
   diffs for secret values, private identifiers and out-of-scope changes.
2. Dispatch a read-only reviewer subagent using `requesting-code-review` with
   requirements, base/head SHAs, paths, check results, and the distinction
   between JSON consistency and independently verified live policy. Evaluate
   feedback using `receiving-code-review`, verify claims against code and
   evidence, fix valid issues, rerun affected checks, and re-review material
   changes.
3. Stage only the approved prompt/documentation changes and any explicitly
   authorized redacted record. Commit to local `main` with a `caveman-commit`
   message; do not push. Report Category 4's actual state, remaining Phase 12
   gates, and the public command for checking readiness. Do not disclose the
   restricted evidence location or contents in a public response.

## SKILLS USED

- `secrets-management` — evaluate indirect sources, least-privilege grants,
  redaction and safe evidence handling.
- `deployment-pipeline-design` — preserve the operator approval gate and
  prevent evidence intake from becoming an unapproved production change.
- `requesting-code-review` — independent review of the scoped evidence record.
- `receiving-code-review` — verify review findings before any correction.
- `caveman-commit` — write the concise final local commit message.
