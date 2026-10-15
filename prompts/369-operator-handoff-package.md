# Prompt 369 — Create the operator handoff package

## Scope and why this is next

Historical execution baseline: `6a06864b1a8f4628c881cb385d95fe6d7d5041b8` on main.
Originally executed as Prompt 370 and committed in `aff196a`; renumbered to 369
on 2026-10-15 at the user’s request after removing the unused intake prompt.
This file records completed work and must not be executed again merely because
its number changed. The user requested creation of the recommended handoff and
explicitly authorized execution after prompt preparation. Create a reusable,
reviewable form and completion procedure for Phase 12. A form makes the missing
intake concrete; it
does not establish a production target or close the operator intake gate.

## References and verified guidance

Read `AGENTS.md`, `docs/build-plan.md` §§13–14, `docs/project-status.md`
operator-owned launch work, `docs/operations.md` Prompt 368,
`docs/launch-checklist.md` §§6A–7, `docs/system-architecture.md` §11,
`docs/security.md`, `docs/skills.md`, and Prompts 367–368. Inspect
`infra/compose/docker-compose.production.example.yml`,
`infra/caddy/Caddyfile.example`, `infra/env/production.env.example`,
`infra/launch/readiness.example.json`, its schema, root scripts, and
`scripts/ops/check-launch-readiness.js`.

Official guidance checked during planning:

- https://caddyserver.com/docs/automatic-https — DNS, reachable ports, persistent
  certificate state, automated certificate renewal.
- https://docs.docker.com/compose/how-tos/use-secrets/ — per-service file grants;
  `_FILE` conventions require image/application support. Do not claim Acres
  consumes file secrets everywhere or migrate secret transport in this task.

No UI, routes, visual measurements, comp changes, or runtime APIs are in scope.
Recommendations are judgments informed by the existing architecture and these
sources, never measurements or operator approvals.

## SKILLS USED

- `deployment-pipeline-design` — source/image binding, staged acceptance and rollback.
- `secrets-management` — opaque references and scoped access to restricted records.
- `requesting-code-review` — independent review after verification.
- `receiving-code-review` — verify and resolve reviewer findings.
- `caveman-commit` — required concise local commit message.
- `firecrawl` — planning web-verification route; CLI runtime failed, official docs
  were read with the web tool. No setup changes or new research required to execute.

## Files and required content

1. Add `infra/launch/operator-handoff.example.md`, a Markdown form rather than a
   second readiness JSON schema. Heading must identify it as an incomplete
   template, unsuitable as launch evidence. Include UTC date, preparer, environment
   opaque ID, source SHA, current and previous client/server digest references,
   provenance, materialized configuration IDs, and restricted readiness record ID.
   Every unknown value is explicitly `PENDING`; no invented digests, hostnames,
   contacts, approval dates, or signature. Historical source SHAs may be cited only
   as context in the guide, not preselected in the form.
2. Include all five intake groups from the operator handoff contract: target, candidate, people,
   evidence access, action boundary. Separate proposed topology recommendation
   `single-host-compose-caddy` from selected/approved topology. First deployment
   without previous images remains an unresolved rollback prerequisite.
3. Include exactly eleven rows using readiness category keys, supplier role,
   signer role, evidence reference, independent source reference, and status.
   Roles describe responsibilities; actual people remain pending. Every row starts
   `unresolved`. Capture custodian, approved channel, procedure, allowed fields,
   existing-record-only scope, access expiry/revocation, and denied secret payloads.
4. Include an exact-action approval table (target, action, approver, window,
   recovery boundary, approval reference/status) with no authorized action.
   Include report classifications: missing, supplied/unverified, inspected,
   inconsistent. An inspected reference alone does not approve a category.
5. Add `docs/operator-handoff.md`: recommended completion order, ownership,
   field instructions, private copy outside the checkout, and one ready-to-send
   consolidated request operators can use (do not actually send it). Explain
   runtime environment injection vs supported restricted secret files without
   promising a new mechanism. Recommend existing Compose+Caddy topology, isolated
   dependency networking, immutable images, least privilege, encrypted state,
   off-host encrypted backups, independent restoration, and disabled AI. Retain
   operator ownership of provider, host sizing, SLO/RPO/RTO, retention and spending.
   Link existing category contracts instead of creating alternate thresholds.
6. Add one index row for `docs/operator-handoff.md` in AGENTS.md and a short link
   under the existing launch checklist handoff. Append actual verified package
   results to `docs/operations.md`; do not change status/completion scores.

## Execution and acceptance

Re-read this prompt before editing. Preserve unrelated files. Produce only the
listed documentation artifacts and links. Check that all eleven category keys
match the existing readiness example, all required intake groups are present,
links resolve, no secret values or private target facts appear, and every
recommendation is distinguishable from an adopted decision.

Run `git diff --check`, the checked-in readiness example assessment (expected
nonzero; quote actual totals), `npm run lint`, `npm run typecheck`, and
`npm run build` sequentially. No new tests are needed for a Markdown form. Do not
claim a formatter pass unless run. Review the complete diff with an independent
reviewer subagent and provide baseline/head SHA, task requirements and actual
checks. Evaluate feedback, fix valid findings and recheck relevant gates.

Record actual results in `docs/operations.md`. Stage only this prompt, the two new
artifacts, AGENTS.md, checklist link and operations record. Inspect staged diff and commit on main using caveman-commit. No push.

## Non-goals and exit

No infrastructure provisioning, provider selection, credentials, external
messages, production discovery, live probes, deployments, DNS, HSTS, secrets
rotation, restores or category sign-offs. No new validator, schema, dependencies
or secret transport implementation. Exit: reusable handoff and completion guide
are reviewed and committed, with unresolved operator facts plainly visible.
Rollback: revert documentation commit; no production recovery action is needed.
