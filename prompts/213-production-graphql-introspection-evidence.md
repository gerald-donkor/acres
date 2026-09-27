# 213 — production GraphQL introspection evidence

## Scope and why this is next

The committed baseline is `c97abba` on `main`. Phase 12K remains open under
`docs/build-plan.md` §13/§22 and the umbrella sign-off procedure in prompt 201.
Prompts 205–212 assessed checklist Categories 1–8 and recorded missing
operator-controlled production evidence without approving them. The earliest
remaining independent checklist unit is Category 9, `graphql_introspection`.
This prompt checks the selected production introspection policy, an actual
read-only probe of the production `/graphql` ingress, its structured child
evidence, and the security lead's dated decision. If those inputs are absent,
record an exact unresolved blocker. Category 9 approval cannot close Phase 12
or imply approval of any other category.

## References and verified contract

- Re-read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §§13–14 and 22;
  `docs/launch-checklist.md` §§2–5, 6A, Category 9 (§3.9), and §7;
  `docs/operations.md` Phase 12K and Prompt 199; `docs/security.md` production
  API boundary; `docs/system-architecture.md` §8.2; `docs/skills.md`; and
  prompts 199, 201–204, and 205–212. Reconcile prose with current code and
  Git history before executing.
- Inspect `infra/launch/readiness.example.json`,
  `infra/launch/readiness.schema.json`,
  `scripts/ops/check-launch-readiness.js` and its focused spec,
  `server/src/graphql/graphql.module.ts`, the production environment contract,
  Caddy routing configuration, and the operator-provided production policy,
  ingress, probe transcript, and child report. Derive the actual route, flags,
  JSON fields, and error behavior from current files. There is no dedicated
  GraphQL production-probe command in the inspected `scripts/ops` launch
  scripts; do not present the unified drill as having run this probe.
- No visual surface, static comp, crop, breakpoint, UI route change, or pixel
  measurement applies. The measurable acceptance contract is one explicit
  `production_introspection_enabled` boolean matching the selected policy and
  the live route result, one successful nonfuture child report, and a dated
  security-lead approval. The checked-in example is `unresolved` with
  `production_introspection_enabled: false`; this is a template value, not
  observed production behavior.
- Current server configuration uses `introspection: !config.isProduction` in
  `server/src/graphql/graphql.module.ts`. The present production implementation
  therefore supports the **disabled** policy. Although the readiness validator
  can represent `true` with a written justification, an enabled decision would
  require a separately approved server/configuration change and verification;
  do not mark it approved by changing only the readiness record.

## Preconditions and operator handoff

1. Confirm branch, HEAD, and worktree; preserve unrelated changes. Inspect
   approved repository paths for a materialized readiness record or redacted
   Category 9 evidence reference. An absence in Git does not prove absence in
   the operator's restricted evidence store.
2. Obtain from the security/operations lead through the approved channel: the
   selected production policy; the public HTTPS `/graphql` ingress for the
   deployment under review; target and deployment identity; the allowed
   read-only probe window and credential method if the GraphQL route requires
   authentication; the redacted response transcript or receipt; the child JSON
   artifact location; and the security lead's dated approval decision. Never
   request or store a session cookie, bearer token, schema dump, or raw
   credentials in the repository, chat, command line, or report.
3. If access or authorization to the selected production endpoint is absent,
   perform repository-only inspection and record Category 9 as `unresolved`.
   Do not probe an assumed host, a local/dev service, or a synthetic fixture
   and label the result production evidence. A read-only introspection query
   must not be bundled with mutation, load, deployment, or configuration work.

## Evidence and decision procedure

1. Compare the operator's written policy and materialized runtime settings to
   `server/src/graphql/graphql.module.ts` and the deployed release identity.
   Confirm the production process actually runs with production configuration;
   the source-code default alone is not proof of deployed runtime behavior.
   For a disabled policy, no justification is needed for validator acceptance,
   though the operator should record the policy rationale. If the policy is
   enabled, require a non-placeholder written security justification and stop
   for a separately approved implementation/deployment change before claiming
   successful production verification.
2. In the authorized window, have the operator issue a minimal GraphQL
   introspection query such as `query { __schema { queryType { name } } }`
   against the selected HTTPS ingress using the documented authentication
   context. Record timestamp, target/release identity, HTTP status, a redacted
   response summary, whether the introspection request was permitted, and
   whether schema data was exposed. For the current disabled policy, verify
   rejection of introspection without treating an unrelated 401, proxy error,
   timeout, or broken route as a successful policy check. Confirm the endpoint
   and ordinary authorized GraphQL behavior separately so a generic outage
   cannot masquerade as a fail-closed introspection result. Do not persist a
   complete schema or credentials in the evidence artifact.
3. Check the redacted child JSON report against the exact current
   `validateGraphqlIntrospectionReport` contract:
   - Exactly seven top-level fields: `drill_type`, `endpoint`, `errors`,
     `probe_result`, `production_introspection_enabled`, `status`, `timestamp`;
   - `drill_type: "graphql_introspection_probe"`, `status: "success"`,
     `errors: []`, and a real nonfuture ISO UTC `timestamp`;
   - `endpoint` ending in `/graphql`; for production sign-off, use the selected
     HTTPS origin even though `isValidGraphqlEndpoint` also accepts `http:` and
     the relative `/graphql` path;
   - `production_introspection_enabled` strictly equals the approved readiness
     value and observed runtime policy;
   - `probe_result` has exactly `status_code` (positive integer),
     `introspection_permitted` (boolean matching the approved policy),
     `schema_exposed` (`false` for disabled, `true` for enabled), and non-empty
     `response_summary`;
   - No `__REQUIRED_` placeholder or client secret. Every referenced JSON
     report, including a wildcard match, must pass. Prose or a unified dossier
     alone does not qualify.
4. Independently compare report fields with the operator transcript, ingress
   host, deployed release, and policy decision. The validator checks report
   structure and internal consistency; it does not perform the network probe or
   authenticate report provenance. A plausible JSON file cannot replace live
   inspection and human sign-off.
5. If the actual materialized record and report are available, run
   `npm run ops:readiness-schema-test` and
   `node scripts/ops/check-launch-readiness.js <operator-readiness.json>`.
   Keep any approved record and child evidence in the restricted operator
   store unless a separately approved redacted artifact belongs in Git.
   Record the dated result, source commit, opaque evidence references, missing
   facts, responsible owner, and Category 9 state in
   `docs/launch-checklist.md` §3.9. Prompt 201 still owns final 11/11 sign-off.

## Scope boundaries, failure handling, and rollback

- This step changes documentation only unless authentic, approved, redacted
  operator evidence is supplied. It does not change the GraphQL resolver,
  Nest/Apollo settings, readiness validator/schema, production deployment,
  authentication, database, or client UI.
- Missing policy, selected HTTPS target, live probe transcript, matching child
  report, or dated security approval leaves Category 9 `unresolved`. Name each
  absent item and owner. A template, local probe, or synthetic report cannot
  satisfy production evidence.
- If the documentation assessment is wrong, revert its scoped commit. Do not
  loosen the validator or fabricate a passing child file to make the example
  green. A request to enable production introspection is a separate security
  and server implementation task with its own prompt and review.

## Verification, review, and completion

1. Quote real output and exit codes for `npm run ops:readiness-schema-test`,
   `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`
   (expected fail-closed), `node --test scripts/ops/check-launch-readiness.spec.js`,
   `npm run ops:templates`, `npm run ops:check`, `npm run lint`,
   `npm run typecheck`, `npm run build`, and `git diff --check`. Follow the
   repository's formatting check if one exists; otherwise inspect Markdown
   formatting directly. Do not report unavailable live production checks as
   passed. Resolve check failures or document environmental blockers exactly.
2. Dispatch an independent read-only reviewer subagent through
   `requesting-code-review` with the category contract, source and diff SHAs,
   changed paths, actual check output, and the distinction between a source
   default, JSON consistency, and live production behavior. Evaluate each
   finding via `receiving-code-review`; verify before fixing, re-run affected
   checks, and request follow-up review for material changes.
3. Stage only prompt-scoped documentation and any explicitly approved
   redacted evidence record. Inspect the staged diff and commit locally to
   `main` using `caveman-commit`. Do not push. Report Category 9's exact state,
   remaining Phase 12K gates, and how to run the readiness validator.

## SKILLS USED

- `deployment-pipeline-design` — keep the production release gate and human
  approval separate from repository checks.
- `security-best-practices` — assess the GraphQL introspection policy and
  redacted live probe without exposing schema or credentials.
- `javascript-testing-patterns` — verify the existing Node readiness suite and
  interpret fixture coverage without treating it as production evidence.
- `requesting-code-review` — dispatch an independent review before recording
  and committing the assessment.
- `receiving-code-review` — evaluate review findings against the actual
  validator, server settings, and operator evidence.
- `caveman-commit` — write the required local Conventional Commit message.
