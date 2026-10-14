# Prompt 367 — Operator Production Evidence Activation

## Scope and why this is next

Committed repository baseline: `9e81a21854a5a1c510cac6c282066a7483ae1a1b` on `main`.
The V1 Release Candidate's engineering and automated acceptance work is complete.
Prompt 366 aligned every checklist category's repository-backed candidate intake
with that baseline. The checked-in readiness example intentionally remains
unresolved: `0` approved categories, `11` unresolved categories, and `70`
blockers. The remaining Phase 12 exit is the operator-owned production evidence
and sign-off workflow originally specified by Prompt 201.

This activation does **not** deploy, rotate secrets, send production mail, run
load against a live target, restore data, or approve launch by default. It
collects the operator decisions and exact scoped authority needed before each
such action. Do not replace missing live evidence with template output, local
simulation, a claimed receipt, or a guessed value.

## Authority and required reading

Before acting, re-read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md`;
`docs/project-status.md`; `docs/operations.md`; `docs/launch-checklist.md`;
`docs/system-architecture.md`; `docs/security.md`; `docs/ai.md`; and
`docs/skills.md`. Read Prompt 201 alongside this prompt; it remains the
authoritative end-to-end evidence and launch-decision procedure.

Inspect the current `main` commit, worktree, `infra/launch/readiness.example.json`,
`infra/launch/readiness.schema.json`, `scripts/ops/check-launch-readiness.js`,
`scripts/ops/launch-readiness.sh`, `scripts/ops/run-launch-drills.sh`, and each
checklist category's named verifier before a live action.

Load the applicable skills before implementation: `deployment-pipeline-design`,
`secrets-management`, `security-best-practices`, `postgres-best-practices`,
`prometheus-configuration`, `github-actions-templates` when CI policy changes,
`requesting-code-review`, `receiving-code-review`, and `caveman-commit`.

## Inputs required from the operator

Ask for references and scoped access, never secret values. Do not request that
credentials, private keys, connection strings, bearer tokens, or SMTP passwords
be pasted into chat, a prompt, git, or a readiness JSON file.

1. Production target, release identity, and authority: approved FQDN, hosting
   account/host identity, TLS contact, reviewed 40-character source commit,
   registry provenance artifacts/policy, materialized deployment identifiers,
   deployment window, release manager, rollback authority, and current/previous
   immutable client and server image references.
2. Security controls: approved secret-store provider and twelve distinct indirect
   references, least-privilege access policy evidence, log-masking policy,
   rotation cadence, compromise-response runbook, encrypted-mount inventory,
   key custody/recovery owner, and GraphQL introspection decision.
3. Service and resilience controls: approved SMTP provider/sender and DNS policy,
   on-call destination, adopted SLOs/capacity targets, backup destination and
   schedule, RPO/RTO, isolated DR target, legal-lead-approved retention policy,
   actual cleanup schedule/result evidence, and alert-routing ownership.
4. Product posture: product/security attestation that AI is disabled in both API
   and worker production runtime, no Gemini key is provisioned, and the approved
   deterministic no-AI journeys to execute.

If any input, access boundary, maintenance window, or named authority is absent,
record it as a blocker and stop before the related live operation. A generic
approval of this prompt is not authority to promote, roll back, rotate, send mail,
load-test, restore, or mutate production.

## Execution sequence once inputs and exact approvals exist

1. Create a private, access-controlled evidence location outside the repository.
   Establish a redacted operator readiness record from the example/schema; preserve
   opaque artifact IDs or restricted paths rather than raw sensitive evidence.
2. Re-run repository quality gates against the pinned source/image candidate:
   `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`,
   `npm run contracts:check`, and `git diff --check`. Record exact versions,
   commands, elapsed times, outputs, and failures; do not treat old results as
   fresh acceptance.
3. Materialize the approved environment using only the secret-store injection
   mechanism. Confirm the runtime is non-root, service boundaries are isolated,
   secret values are absent from logs, and image references are immutable. Obtain
   a final explicit approval naming the target and rollout action before promotion.
4. With the relevant owner present, perform and independently inspect each live
   category receipt required by `docs/launch-checklist.md`: domain/TLS and HSTS;
   SMTP delivery plus SPF/DKIM/DMARC; secrets injection/rotation; distinct secret
   references; alert delivery/capacity/database telemetry; encrypted off-host
   backup and isolated restore/reconciliation; retention scheduling; mount
   encryption/key recovery; GraphQL ingress probe; deploy/rollback; and API/worker
   no-AI posture plus journeys.
5. Run the unified launch drill only within the approved target/window as its
   defined rehearsal/preflight evidence; keep its simulation-mode receipts labeled
   honestly. Separately perform and independently inspect every authorized live
   category receipt required for approval. Preserve timestamps, executor and target
   identities, pass/fail result, and `execution_mode: "live"` only on those actual
   live receipts. Simulation receipts may validate tooling but cannot approve a
   category.
6. Populate the private readiness record with only verified facts and redacted
   references. Run `node scripts/ops/check-launch-readiness.js <private-record>`.
   A nonzero exit or any unresolved category is a no-go; do not edit values merely
   to obtain a green result.
7. Obtain all eleven named sign-offs only after the validator passes. Record a
   clear go/no-go decision, source commit, image digests, rollback plan, and the
   final evidence index in the restricted evidence store. Update public repository
   documentation only with non-sensitive, truthful status and artifact identifiers.

## Security, failure, and rollback constraints

- Use read-only observation first. Require a new exact-action approval before every
  live mutation; stop on target ambiguity, certificate error, missing receipt,
  failed health check, failed gate, or unexpected secret exposure.
- Keep migrations backward-compatible during promotion. If health or post-deploy
  gates fail, use the named rollback authority and documented previous immutable
  images; never improvise a schema rollback in production.
- Fail closed for inaccessible monitoring, missing evidence, failed alert delivery,
  stale/inauthentic receipts, or partial DR recovery. Redact logs and issue IDs
  before any repository documentation update.
- Do not claim Phase 12 completion or production launch until the private record
  validates with all 11 categories approved and the accountable operators sign it.

## Verification, review, documentation, and commit

Run every command applicable to the actual approved scope and quote real output.
Self-review the resulting diff and readiness receipt references. Then perform the
mandatory two-stage review: request an independent reviewer with requirements,
base/head SHAs, changed files, live-action boundaries, checks, and evidence
limits; evaluate feedback against the repository before fixing valid findings;
re-review after material changes. Record non-sensitive results in
`docs/operations.md`, `docs/launch-checklist.md`, `docs/project-status.md`, and
`docs/build-plan.md` only when they are true. Commit only repository-safe changes
using `caveman-commit`; never commit private evidence or secrets.

## Exit conditions

- **Blocked/no-go (expected until operator inputs exist):** retain all unresolved
  statuses and report the specific missing authority or evidence without changing
  the example readiness record.
- **Go/no-go decision:** only after all eleven authentic live receipts validate,
  `check-launch-readiness` passes, and named approvers have signed the decision.
  A passing repository test suite alone is not launch evidence.
