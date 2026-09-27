# 214 — production deployment and rollback evidence

## Scope and why this is next

The committed baseline is `353748a3559e78c1cac89a8887b89d5c8c58a62f` on
`main`. Phase 12K's operator sign-off remains open under `docs/build-plan.md`
§§13 and 22 and prompt 201. Prompts 205–213 assessed checklist Categories 1–9
and recorded their missing production evidence. The earliest remaining
independent checklist unit is Category 10, `deployment_and_rollback`. Assess
the actual production release and rollback evidence against the existing
contract. If the operator inputs are unavailable, add a dated, exact Category
10 blocker record to `docs/launch-checklist.md`; do not approve the category.
Category 11 and the eleven-category sign-off remain separate.

## References and acceptance contract

- Re-read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §§13–14 and 22;
  `docs/launch-checklist.md` §§2–4, 6, 6A, Category 10 (§3.10), and §7;
  `docs/operations.md` Phase 12K and Prompt 193; `docs/security.md` TM-18;
  `docs/system-architecture.md` §11; `docs/skills.md`; and prompts 163–165,
  193, 201–204, and 205–213. Reconcile those records with current Git and code.
- Inspect `infra/launch/readiness.example.json`, its schema,
  `scripts/ops/check-launch-readiness.js` and its tests,
  `scripts/ops/check-release-images.js` and its tests,
  `scripts/ops/run-deployment-drill.sh`, `scripts/ops/run-launch-drills.sh`
  Stage 3, `infra/compose/docker-compose.production.example.yml`, the Caddy
  routing verifier, and any supplied operator release/provenance/drill records.
  Derive command flags and JSON fields from the current implementation.
- No visual surface, static comp, crop, pixel measurement, breakpoint, or UI
  route changes. The measurable contract is an immutable, distinct current
  client/server digest pair; a distinct previous known-good pair; one reviewed
  40-hex source commit; matching release-shell image exports; separate client
  and server provenance artifacts; a concrete successful deployment drill
  child report; and a dated release-manager decision. Thresholds in the
  validator are acceptance rules, not observations of production.
- The checked-in example is unresolved and contains `__REQUIRED_*__`
  sentinels. It is never the production record.

## Preconditions and operator handoff

1. Confirm branch, HEAD, and worktree. Preserve unrelated changes. Search
   approved repository paths for a materialized production readiness record
   and redacted Category 10 references; absence here does not prove absence
   from the restricted operator store.
2. Request through the approved operator channel: selected target host/profile
   and OCI registry prefix; reviewed release source commit; exact current and
   previous client/server `registry/path@sha256:<64 lowercase hex>` image
   references; distinct client/server signature or provenance verification
   receipts; provenance policy; deployment approver; rollback authority;
   materialized Caddy and Compose file references; live API target and release
   identity; live promotion and rollback observations; child JSON report;
   release-manager's dated sign-off; and the restricted evidence location.
   Accept opaque/redacted references. Do not request or store registry
   credentials, signing keys, environment secrets, or unredacted host inventory.
3. A production promotion, rollback, migration, or traffic switch requires the
   named operator's approved maintenance window and action authorization.
   This evidence-intake prompt authorizes repository inspection and validation,
   not such a live change. Do not run `run-deployment-drill.sh` against an
   assumed host or describe a dry run as a production promotion or rollback.
   Its `--dry-run` path still writes an artifact and may probe a supplied API
   or database, so inspect its effective target and side effects first.
4. If the release pair, provenance, target, live observations, child report, or
   human decision is unavailable, keep Category 10 `unresolved`. Name each
   missing input and responsible operator in the checklist. Do not generate
   synthetic passing production artifacts.

## Evidence and decision procedure

1. Independently compare the release record with the reviewed source commit,
   registry manifests/digests, client and server provenance verification
   receipts, previous known-good manifests, protected promotion record, and
   deployed Compose file. Confirm the verified signatures/attestations bind
   the exact digests and source revision. A plausible digest string or a
   successful syntax check is not provenance proof. Check current images are
   under `image_registry_path`, client and server are distinct within each
   pair, and the current pair differs from the previous pair.
2. In the selected release shell, compare `ACRES_CLIENT_IMAGE` and
   `ACRES_SERVER_IMAGE` to `release.current`, then run
   `node scripts/ops/check-release-images.js` and production Compose
   `config --quiet` against the materialized configuration, recording command
   outcomes and source identity. Use the existing operator procedure for
   `npm run ops:launch-readiness -- <record>` in that same shell; the aggregate
   can still fail while other categories remain unresolved. Do not export
   placeholder values to force a passing preflight. Confirm the prior pair
   remains retrievable and the schema stays compatible with it.
3. Assess the live promotion and rollback records separately from script
   output. Confirm selected host/release, authorized window, Caddy ingress
   routing and security headers, S3 SigV4 Host preservation, deep readiness,
   migration compatibility and observed migration state, network isolation,
   drain behavior, and successful service health after rollback. The current
   drill script performs multiple static checks and can fall back to static
   health assertions; its JSON `rollback_procedure_verified: true` and
   `readiness_probes_verified: true` alone do not prove an actual rollback or
   live API probe. Compare `dry_run`, `probe_live_tested`, materialized paths,
   `api_target_id`, and operator transcript before calling any result live.
4. Check each referenced deployment child report, including wildcard matches,
   against `validateDeploymentDrillReport`: a real nonfuture UTC `timestamp`
   or `drill_timestamp` (basic `YYYYMMDDTHHMMSSZ` or ISO 8601),
   `status: "success"`, `schema_backward_compatible: true`,
   `rollback_procedure_verified: true`, `caddy_routing_verified: true`, integer
   `caddy_routes_tested >= 12`, `security_headers_verified: true`,
   `s3_sigv4_host_preserved: true`, `migrations_verified: true`, integer
   `migration_count >= 0`, `operational_templates_verified: true`,
   `secrets_scan_verified: true`, `readiness_probes_verified: true`,
   `network_isolation_verified: true`, and exact drain periods `caddy: 30s`,
   `next: 30s`, `api: 45s`, `worker: 60s`. If present, `duration_ms` must be
   finite and nonnegative. A failed or malformed child blocks even beside a
   successful one; prose or the unified dossier alone is insufficient.
5. Verify `target_host_profile`, `image_registry_path`, `deployment_approver`,
   `rollback_authority`, `image_provenance_policy`,
   `live_readiness_drill_completed: true`, `approver`, `evidence`, and
   `release.{reviewed_source_commit,current,previous,
   client_provenance_evidence,server_provenance_evidence,live_drill_evidence}`
   against the actual schema and validator. The three release evidence
   references must be distinct. External identifiers are accepted by the
   validator as references, but independently verify their content and
   provenance; a URI-shaped string is not evidence by itself.
6. If every fact, live observation, machine-readable artifact, and dated
   release-manager sign-off is present, update only the operator-owned
   materialized readiness record and document the approved Category 10 decision
   in `docs/launch-checklist.md` §3.10. Validate its schema and run the
   executable readiness check, assessing Category 10 blockers separately from
   the expected overall launch failure while other categories are unresolved.
   Keep restricted artifacts outside Git unless a separately approved redacted
   artifact belongs here. Otherwise document the precise unresolved state,
   source commit, evidence inspected, missing facts, owner, and next safe action.

## Scope boundaries and rollback

- This is an evidence assessment and checklist update. Do not change the
  release validator, image checker, drill script, Compose/Caddy templates,
  migration, deployment workflow, API, or client merely to obtain approval.
  A discovered implementation defect needs a separate scoped prompt.
- Do not equate a successful `--dry-run`, a locally generated JSON file, a
  7-stage dossier, or a release declaration with a live promotion/rollback.
  Do not mark other categories or the Phase 12 exit gate approved.
- If this documentation assessment is wrong, revert its scoped commit;
  maintain the fail-closed readiness contract and preserve operator evidence.

## Verification, review, and completion

1. Quote real output and exit codes for `npm run ops:readiness-schema-test`,
   `node --test scripts/ops/check-launch-readiness.spec.js`,
   `node --test scripts/ops/check-release-images.spec.js`,
   `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`
   (expected fail-closed), `npm run ops:templates`, `npm run ops:check`,
   `npm run lint`, `npm run typecheck`, `npm run build`, and
   `git diff --check`. Follow a repository formatting check if one exists;
   otherwise inspect Markdown directly. Run operator-record checks only when
   an actual record is supplied. State any environmental failure precisely.
2. Self-review the scoped diff. Dispatch an independent read-only reviewer
   subagent with `requesting-code-review`, including BASE_SHA/HEAD_SHA,
   contract, files, checks, and the distinction between report consistency
   and production proof. Evaluate findings with `receiving-code-review`, fix
   verified issues, re-run affected checks, and re-review material changes.
3. Stage only the prompt-scoped checklist and any expressly approved redacted
   record. Inspect staged diff and commit locally to `main` with
   `caveman-commit`; do not push. Report Category 10's state, remaining gates,
   and the exact readiness validation command.

## SKILLS USED

- `deployment-pipeline-design` — structure release, approval, promotion, and
  rollback evidence as separate gates.
- `security-best-practices` — assess secure image provenance and restricted
  evidence handling in the Node/JavaScript release scripts.
- `javascript-testing-patterns` — interpret the existing Node readiness and
  image-check suites and run focused verification.
- `requesting-code-review` — dispatch independent review after self-checks.
- `receiving-code-review` — evaluate reviewer findings against actual code and
  operator evidence.
- `caveman-commit` — write the required local commit message.
