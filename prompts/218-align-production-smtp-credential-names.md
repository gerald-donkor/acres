# 218 — align production SMTP credential names

## Scope and why this is next

Phase 12K is the earliest unfinished phase (`docs/build-plan.md` §13). Prompt
217 covers provenance intake after an operator supplies the shared production
handoff; the current repository has no such handoff, so intake cannot yet
advance. `docs/launch-checklist.md` §3.4 records a separate, reproducible
repository defect: `infra/env/production.env.example` supplies
`SMTP_USERNAME`/`SMTP_PASSWORD`, whereas
`server/src/config/env.validation.ts` reads `SMTP_USER`/`SMTP_PASS` and the
`SmtpMailAdapter` uses those parsed fields. The Compose API service imports the
template through `env_file` without a rename. Align this local contract now so
the eventually materialized deployment can inject credentials under names the
server consumes. This is a Phase 12K repository remediation, not prompt 217's
operator intake or prompt 201's final launch decision.

## Verified references and contract

- Re-read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §§13–14 and 22;
  `docs/operations.md` Phase 12K; `docs/launch-checklist.md` §§2, 3.4 and 6A;
  `docs/backend.md` mail/config sections; and `docs/security.md` §15.
- Re-open `infra/env/production.env.example`,
  `infra/compose/docker-compose.production.example.yml`,
  `server/src/config/env.validation.ts`,
  `server/src/mail/adapters/smtp-mail.adapter.ts`, `server/.env.example`,
  `scripts/ops/check-production-templates.sh`, `package.json`, and the
  relevant existing template/readiness tests immediately before editing.
  Current evidence: template lines 54–55 name the old keys; config lines
  318–319 consume the new keys; adapter uses `config.smtpUser` and
  `config.smtpPass`; Compose's `api` and `worker` services import the same
  `production.env.example` without an SMTP override. Reconcile line numbers
  against the current tree when executing.
- No static design reference, comp crop, pixel measurement, breakpoint, UI
  route, REST endpoint or GraphQL contract applies. The measurable contract is
  exact env-key identity: one `SMTP_USER` placeholder and one `SMTP_PASS`
  placeholder in the production template, zero active
  `SMTP_USERNAME`/`SMTP_PASSWORD` assignments there, and a template check that
  fails if either consumed key is absent or either stale key reappears.
- The readiness record's `smtp_secret_source` and
  `smtp_delivery.credentials_source_reference` remain indirect references to
  the SMTP credential source, not environment-variable values. The unresolved
  example stays unresolved. No operator credential, provider choice, host,
  port, sender, TLS mode or receipt may be invented.

## Implementation sequence

1. Confirm `main`, `HEAD`, worktree state and the current definitions. Preserve
   unrelated changes. Load the skills in `SKILLS USED` and verify any package
   API consulted from installed code or a loaded skill. No Next/React change is
   planned.
2. In `infra/env/production.env.example`, rename the two assignment keys to
   `SMTP_USER` and `SMTP_PASS`. Keep required sentinels for the username and
   password, with no literal credential. Keep `SMTP_HOST` and `SMTP_PORT` as
   operator placeholders. Do not choose `SMTP_SECURE`, sender, provider or
   transport policy in this narrow fix; Category 2 still requires the operator
   to select and verify them.
3. Extend the existing `scripts/ops/check-production-templates.sh` Node
   preflight at its parsed `envKeys` section: require `SMTP_USER` and
   `SMTP_PASS` in the production env template, reject either legacy key, and
   report only key names in failures. Check the actual parsed assignment keys,
   not comments or arbitrary substring matches. Keep the existing
   `ops:templates` command and its other checks intact. Avoid reading or
   printing any materialized operator env file.
4. Add focused regression coverage for the contract. If the existing shell
   preflight has no isolated test harness, create a small Node test beside the
   operations specs that runs the check against a temporary copy or
   parameterized fixture without modifying the tracked production example.
   Prove the current template passes; replacing `SMTP_USER` or `SMTP_PASS`
   with the legacy spelling fails for the expected reason; a comment that
   mentions a legacy name does not fail; and no secret value appears in test
   output. Prefer a small testable helper if running the entire template
   check against fixtures would make the test brittle. Wire the focused test
   into `ops:check` only if it can remain deterministic and offline. Document
   the actual test command. Do not add tests that merely assert the new literal
   text without exercising the rejection path.
5. Update `docs/launch-checklist.md` §3.4 to distinguish the repaired
   repository template from still-unverified production injection. Preserve
   the Category 2 and 4 unresolved states, and explicitly retain the shared
   `env_file`, CSRF-source and Garage-metrics findings. Add a short implemented
   state and verification record in `docs/operations.md` Phase 12K. Update
   `docs/build-plan.md` only if a verified phase-state fact actually changes;
   do not mark Phase 12 complete.

## Boundaries, compatibility and rollback

- No production service, secret store, mail provider, DNS, SMTP message,
  deployment or readiness record is changed by this repository fix. No live
  delivery is authorized. Do not log credentials or copy private values into
  fixtures, chat, docs or git.
- The rename is a template contract change. An operator who already
  materialized the old key names must map them to `SMTP_USER`/`SMTP_PASS`
  before deploying the revised template. Record that migration note in
  `docs/operations.md`; do not add silent runtime aliases that keep the
  mismatch hidden. The operator still has to verify actual runtime injection
  and a real delivered receipt before approving Category 2 or 4.
- Reverting this scoped commit restores the old example and check, but would
  restore the documented credential-name defect. If the installed server has
  since changed its consumed names, stop and re-scope rather than imposing this
  stale plan.

## Verification and review

1. Run the focused regression test, `npm run ops:templates`,
   `npm run ops:readiness-schema-test`, `npm run ops:readiness-test`,
   `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`,
   and `git diff --check`. Quote real output. The checked-in readiness example
   must still fail closed; a passing operations preflight is not launch
   approval. Run broader checks only for a concrete remaining risk.
2. Inspect the full diff and staged diff for unscoped changes, key-name drift,
   secret exposure, and accurate claims in docs. After self-verification,
   dispatch an independent reviewer with `requesting-code-review`, including
   requirements, BASE_SHA/HEAD_SHA, changed paths and actual checks. Evaluate
   feedback with `receiving-code-review`, fix valid findings, rerun affected
   checks and re-review material changes.
3. Stage only scoped files and commit locally to `main` using
   `caveman-commit`. Do not push. Report exact inspection steps and the
   remaining operator handoff/launch gates.

## SKILLS USED

- `deployment-pipeline-design` — preserve the release gate and operator
  migration boundary for the production template.
- `secrets-management` — keep SMTP credentials indirect and out of repository
  output and fixtures.
- `javascript-testing-patterns` — make the template-contract regression
  exercise the failure path without live services.
- `requesting-code-review` — dispatch the required independent diff review.
- `receiving-code-review` — verify and resolve reviewer findings.
- `caveman-commit` — write the required local commit message after execution.
