# 201 — production launch evidence and sign-off

## Scope and why this is next

The committed baseline is `0929017` on `main`. Phase 12K's validator, unified
drill runner, eleven category contracts, and no-AI gate are implemented. The
checked-in `infra/launch/readiness.example.json` remains deliberately
unresolved; `docs/build-plan.md` §13/§22 makes operator-approved launch evidence
the remaining Phase 12 exit gate. This prompt collects and verifies that real
evidence, records an honest go/no-go decision, and closes Phase 12 only if all
gates pass. It must not turn local template or synthetic output into production
attestation.

## References and authority

- Re-read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §13/§22;
  `docs/operations.md` (production deployment and launch hardening);
  `docs/launch-checklist.md` §§2–7; `docs/system-architecture.md` (production
  topology); `docs/security.md` (production trust boundaries); `docs/ai.md`
  (no-AI production posture); and `docs/skills.md`.
- Inspect `infra/launch/readiness.example.json` and
  `infra/launch/readiness.schema.json`, `scripts/ops/launch-readiness.sh`,
  `scripts/ops/run-launch-drills.sh`, `scripts/ops/check-launch-readiness.js`,
  and the scripts named in the eleven checklist categories before execution.
- Static visual references, crops, pixel measurements, and breakpoint deltas
  do not apply: this is an operational evidence and approval task with no UI.
  The measurable thresholds are the existing checklist contracts: 11/11
  approved categories; seven successful drill stages; availability ≥99.9%,
  HTTP p95 ≤500 ms, throughput ≥100 RPS, DB pool acquisition p95 ≤50 ms,
  DB query p95 ≤100 ms, RPO ≤1 hour, RTO ≤4 hours, and 11 alert rules.

## Preconditions to establish before any live action

1. Obtain the operator-owned production target, domain/TLS contact, approved
   HSTS policy, SMTP sender/provider, runtime secret-store references,
   on-call recipients, backup destination, encrypted mount inventory and key
   recovery owner, image registry and immutable current/previous digests,
   deployment approver, rollback authority, and signed-off retention policy.
   Verify these against live operator records. Missing information is a
   blocker, not a value to infer from templates.
2. Establish access to the designated production and isolated disaster
   recovery drill environments. Check that Postgres/PostGIS, Valkey, Garage,
   Caddy, API, worker, telemetry and alert routing are reachable through
   approved operator channels. Never print or store secret values in logs,
   prompts, git, or evidence. Do not ask the operator to paste secrets in chat.
3. Confirm deployment/rollback and secret-rotation maintenance windows and
   the named human authorities before making any live mutation. A previous
   generic approval of this prompt does not authorize an unreviewed production
   promotion, rollback, or rotation; present the exact target and planned
   action for final approval when those facts are known.
4. Check the existing worktree and current branch. Preserve unrelated changes.
   Keep raw operator evidence in the designated restricted evidence store,
   not in `backups/` if that local directory is accessible to unintended users
   or tracked. Use redacted references in the readiness record.

## Execution sequence

1. Run read-only repository and template checks: `npm run ops:check`,
   `npm run lint`, `npm run typecheck`, `npm run build`, and
   `git diff --check`. Run the real client E2E, server integration and
   accessibility journeys only against their designated test environments;
   record exact commands, counts and failures. Do not call mocked/synthetic
   tests production journey evidence.
2. Produce an operator-owned readiness record from
   `infra/launch/readiness.example.json`. Replace each placeholder using
   verified operator values, keep `status: "unresolved"` until that category's
   live evidence and human approver are present, and preserve the no-AI launch
   posture. Follow `docs/launch-checklist.md` §3 for all eleven category child
   report schemas; use actual, nonfuture UTC timestamps and evidence paths.
3. Verify production domain/TLS and actual HSTS decision, SMTP receipt and
   SPF/DKIM/DMARC, secret injection and rotation, twelve distinct secret
   references, SLO/alert routing and live capacity, backup cadence and
   restore/object reconciliation, retention policy, encrypted stateful mounts
   and separated unlock material, production GraphQL introspection result,
   immutable image provenance and live deployment/rollback drill, and the
   production API/worker no-AI inventories plus deterministic dashboard,
   report and export journeys. For each category attach its required child JSON
   report and independently inspect the underlying live source of truth.
4. Run `bash scripts/ops/run-launch-drills.sh` with the operator-approved
   live drill configuration (without `--dry-run`) in the designated drill
   environment. Note that secret rotation remains dry-run in the unified
   orchestrator and needs separate authorized live evidence. Require 7/7
   successful stages, review every child artifact and the dossier, and reject
   a dossier with a failed or missing stage. The restore drill must use an
   isolated database, not the production database as both source and target.
   A 7/7 dossier alone is insufficient: the runner's Stage 3 uses the example
   Caddyfile and default deployment configuration, while Stage 6 runs a
   synthetic capacity check unless given a target that this runner does not
   pass through. Verify the materialized production Caddyfile separately with
   `node scripts/ops/verify-caddy-routing.js <production-Caddyfile>
   --allow-hsts --output <restricted-child-report.json>` after HSTS approval.
   Obtain separately targeted, operator-authorized live promotion/rollback,
   capacity, DoS, telemetry and alert-routing evidence. Do not use the default
   Stage 3 or Stage 6 child artifacts as production proof. If the deployment
   drill cannot verify the approved production configuration, stop and plan a
   reviewed runner fix before approving that category.
5. Run `node scripts/ops/check-launch-readiness.js
   <operator-readiness.json>` and `npm run ops:launch-readiness --
   <operator-readiness.json>` with the approved release image pair exported in
   the same shell as the deployment check. Inspect every blocker, then compare
   validator output with the operator's evidence and signatures. A green
   validator is a consistency check, not authentication of a hand-authored
   JSON report or proof of live production conditions.
6. Record the final go/no-go decision in the operator-controlled launch record.
   Approve only when all eleven categories and all Phase 12 exit criteria
   pass and the role-specific approvers in `docs/launch-checklist.md` §7 have
   reviewed the raw evidence and signed and dated every matrix row, including
   the product-and-security approval for the no-AI posture. If any prerequisite
   or gate fails, leave it unresolved, list exact blockers and owners, and stop
   before claiming launch readiness.

## Expected repository impact and record

- No product route, API, schema, UI, token, or production configuration change
  is planned. Keep secrets, unredacted inventory, private hostnames, live
  credentials, and raw evidence out of git.
- If the operator approves launch, update `docs/operations.md`,
  `docs/launch-checklist.md`, and `docs/build-plan.md` with the decision date,
  reviewed source commit, redacted evidence identifiers, command results,
  remaining risks and rollback authority. Store the signed readiness record
  only in the operator-approved location; commit a redacted repository copy
  only if its contents pass secret review and the operator authorizes that
  location. Never alter the checked-in unresolved example into a fabricated
  approved example.
- If blocked, record only verified findings in owning documentation where
  useful. Do not mark Phase 12 complete or commit an empty claim of success.
  A future prompt may remediate a specific discovered code defect after review.

## Non-goals, failure handling, rollback

- No automatic production promotion, secret rotation, key recovery, HSTS
  enablement, AI enablement, or approval by this agent. These require the
  concrete target and authorized operators from the preconditions.
- Do not accept dry-run, synthetic, template, future-dated, wildcard-mixed,
  prose-only, or incomplete child reports as live evidence.
- On a failed live drill, follow `docs/launch-checklist.md` rollback and
  incident procedures with the named authority; preserve evidence, report the
  failed gate, and leave readiness unresolved. Schema changes receive a
  reviewed forward fix when rollback is unsafe.

## Verification, review, and commit

Quote actual output for every command run. Review the scoped diff and run
`git diff --check`. For any repository change, dispatch a read-only reviewer
subagent with the requirement, base/head SHA, changed paths, and check outputs;
evaluate feedback with `receiving-code-review`, fix valid findings, and
re-review material changes. Stage only approved, redacted files. If a complete
operator-backed record is committed, use `caveman-commit` for a concise local
`main` commit and do not push. Report the exact operator record location and
commands to inspect the result without disclosing restricted evidence.

## SKILLS USED

- `deployment-pipeline-design` — production promotion, approval and rollback gates.
- `secrets-management` — runtime secret references, redaction and rotation evidence.
- `prometheus-configuration` — alert and SLO evidence interpretation.
- `grafana-dashboards` — operational signal inspection.
- `e2e-testing-patterns` — real launch journey evidence and isolation.
- `playwright` — browser journey execution where the environment permits it.
- `security-best-practices` — production evidence and trust-boundary review.
- `security-threat-model` — verify launch posture against recorded threats.
- `requesting-code-review` — independent review of any repository change.
- `receiving-code-review` — verify review findings before changes.
- `caveman-commit` — final local commit message when a reviewed change exists.
