# 35 - launch readiness decision record and fail-closed gate

## Scope, and why it is next

The committed repository is on `main` at `3f7489a` (`fix(e2e): harden touch
target and viewport helpers`). `docs/operations.md` records Phase 12C as
implemented from `prompts/34-launch-e2e-accessibility-verification.md`, including
full product E2E coverage, multi-tenant browser isolation, accessibility and
responsive checks across 375/800/1280, and low-cardinality telemetry assertions.

The next ordered target in `docs/build-plan.md` after Phase 10 was Phase 11,
optional local AI, but Phase 11 is explicitly blocked on a separate
user-approved model, license, quality threshold, and operating profile. No such
decision exists. Do not start Phase 11 and do not add AI packages, schemas,
runtime adapters, prompts, or UI.

Phase 12A-12C left launch intentionally blocked on operator-owned decisions:
domain/TLS contact, SMTP delivery, secret injection and rotation, real secrets,
SLO/capacity/alert thresholds, RPO/RTO/backup/restore evidence, retention
periods, encrypted mount/key recovery evidence, production GraphQL introspection
policy, host/registry/promotion/rollback evidence, and no-AI launch evidence.
Those are currently listed in prose in `docs/operations.md` and hard-coded in
`scripts/ops/launch-readiness.sh`.

This prompt implements the next dependency-safe Phase 12 slice: a structured
launch-readiness decision record and a fail-closed validator that makes those
blockers explicit, machine-checkable, and auditable without inventing any
operator values.

## Reference material read while preparing this prompt

Repository and workflow authority:

- `AGENTS.md` §§2, 2.1, phase-control commands, §§5-10: prompt-first workflow,
  phase resolution, skill loading, verification, review, documentation, commit
  rules, product constraints, and no-fabrication rules.
- `docs/build-plan.md` §§1, 12-14: Phase 11 optional-AI gate, Phase 12
  operations/launch-hardening target, launch evidence, sequence gates, required
  skills, rollback, observability, and documentation ownership.
- `docs/operations.md`: Phase 12C implemented state, current production
  templates, Prometheus/Grafana telemetry, E2E launch verification, launch
  blockers, runbooks, and no-AI posture.
- `docs/system-architecture.md` §§3, 4, 10, 11: single-host Compose+Caddy
  production reference, same-origin routing, runtime inventory, secrets,
  backups, observability, launch inputs, and deferred scale/provider decisions.
- `docs/product.md` §§4, 6-7: V1 no-AI path, observable/recoverable operations,
  and open decisions that must not be agent-selected.
- `docs/security.md` §§8-10: threat register, launch acceptance suite, CI/secrets
  risks, backup/restore/encryption checks, and optional AI acceptance only if
  separately enabled.
- `docs/skills.md`: locked skill catalog and Phase 12 skill manifest.

Current implementation inspected:

- `scripts/ops/launch-readiness.sh`: currently runs baseline ops checks, prints
  the unresolved blocker list, and exits 1 unconditionally.
- `scripts/ops/check-production-templates.sh`: validates inert production
  templates, private ports, encrypted mount placeholders, Prometheus alerts, and
  Grafana dashboard shape.
- `scripts/ops/scan-secrets.sh`: rejects tracked launch sentinels outside
  approved docs/examples and scans for secret-looking public env names.
- `infra/env/production.env.example` and
  `infra/env/garage.production.env.example`: current `__REQUIRED_*__`
  operator-owned config and secret inventory.
- `infra/compose/docker-compose.production.example.yml`: current Caddy, Next,
  API, worker, Postgres, Valkey, Garage, ClamAV, Prometheus, and Grafana
  production reference.
- `package.json`: root ops scripts, including `ops:check` and
  `ops:launch-readiness`.
- `.github/workflows/ci.yml`: current CI gates and ops check integration.

Skills loaded while preparing this prompt:

- `.agents/skills/deployment-pipeline-design/SKILL.md`
- `.agents/skills/secrets-management/SKILL.md`
- `.agents/skills/security-threat-model/SKILL.md`
- `.agents/skills/security-best-practices/SKILL.md`
- `.agents/skills/github-actions-templates/SKILL.md`
- `.agents/skills/sast-configuration/SKILL.md`
- `.agents/skills/prometheus-configuration/SKILL.md`
- `.agents/skills/grafana-dashboards/SKILL.md`
- `.agents/skills/requesting-code-review/SKILL.md`
- `.agents/skills/receiving-code-review/SKILL.md`
- `.agents/skills/caveman-commit/SKILL.md`

## SKILLS USED

- `deployment-pipeline-design` - model launch readiness as explicit gates with
  evidence, rollback, and manual approval boundaries rather than as deployment
  automation.
- `secrets-management` - define secret-injection, rotation, masking, and
  compromise-response evidence without committing secret material.
- `security-best-practices` - keep launch decisions secure by default: no
  secrets in git, no accidental `NEXT_PUBLIC_*` secret exposure, no HSTS or TLS
  claim without operator approval.
- `security-threat-model` - keep TM-15, TM-18, TM-19, TM-20, and TM-21 mapped to
  concrete launch evidence.
- `github-actions-templates` - preserve CI as a non-secret deterministic gate;
  do not add production deploy or registry push without approval.
- `sast-configuration` - keep dependency/security scan evidence tracked and
  triaged without introducing non-deterministic CI requirements.
- `prometheus-configuration` - ensure SLO, alert, retention, and telemetry
  decisions reference real Prometheus/alert inputs without inventing thresholds.
- `grafana-dashboards` - ensure operator dashboard ownership and exposure
  decisions stay separate from customer dashboard UX.
- `requesting-code-review` - dispatch mandatory reviewer subagent after
  self-verification.
- `receiving-code-review` - evaluate reviewer feedback against codebase reality
  before applying fixes.
- `caveman-commit` - write the final Conventional Commit message for the
  executed prompt.

Conditional skills:

- `postgres-best-practices` and `sql-optimization-patterns` are required if the
  implementation adds database schema, backup metadata tables, migration logic,
  retention SQL, load tests, or query-plan checks. If the work remains a
  file-based readiness record and shell/Node validation, state that they were
  considered and not loaded for execution.
- `playwright`, `e2e-testing-patterns`, `accessibility-compliance`, and
  `web-design-guidelines` are required only if the implementation changes
  browser UI, runtime headers, or final launch browser evidence. A pure
  readiness-record validator should not expand browser scope.
- `api-design-principles` and `openapi-spec-generation` are required if REST or
  GraphQL contracts change. They should not be needed for this slice.
- `architecture-decision-records` is required if the implementation changes the
  approved production topology, deployment provider, or optional AI posture.

## Required verification before implementation

Before writing code, re-read `AGENTS.md`, this prompt, `docs/operations.md`,
`docs/system-architecture.md`, `docs/security.md`, `docs/product.md`, and every
skill named in `SKILLS USED`. Load conditional skills if their triggers appear.

Inspect current files before editing:

- `scripts/ops/launch-readiness.sh`
- `scripts/ops/check-production-templates.sh`
- `scripts/ops/scan-secrets.sh`
- `infra/env/production.env.example`
- `infra/env/garage.production.env.example`
- `infra/compose/docker-compose.production.example.yml`
- `infra/caddy/Caddyfile.example`
- `infra/prometheus/alerts.yml`
- `infra/grafana/dashboards/acres-operations.json`
- `package.json`
- `.github/workflows/ci.yml`
- owning docs: `docs/operations.md`, `docs/system-architecture.md`,
  `docs/security.md`, and `docs/product.md`

If adding a parser or validator dependency, verify package version, license,
Node 24 compatibility, and local availability before use. Prefer the existing
Node standard library plus already-installed packages where adequate. Do not
fetch network dependencies unless the user approves.

If an API, package, action version, production behavior, or host assumption
cannot be verified from local files, loaded skills, or live primary docs fetched
in this session, stop and state the gap rather than guessing.

## Target implementation details

### 1. Add a structured launch decision template

Add a tracked operator template under `infra/launch/`, for example:

- `infra/launch/readiness.example.json`

The file must be safe to commit and contain no real secrets. It should use
explicit placeholder values, empty evidence arrays, and status fields such as
`unresolved`, `approved`, `rejected`, or `not_applicable`. Keep the schema simple
enough to validate with a local script.

Include decision/evidence sections for at least:

- production domain and TLS contact email;
- SMTP provider, delivery policy, bounce/abuse handling, and credentials source
  reference;
- secret injection mechanism, masking policy, rotation cadence, and compromise
  response;
- session, CSRF/signing, database, storage, queue, SMTP, and Grafana secret
  source references, with no secret values;
- SLO/availability target, capacity target, alert owners, alert thresholds, and
  escalation path;
- RPO/RTO, backup destination, backup schedule, restore drill evidence, and
  DB/object reconciliation evidence;
- retention policy references for account, audit, upload, rejected object,
  export, report, telemetry, and backup data;
- production volume-encryption mechanism, encrypted mount paths, key-separation
  rule, and key-recovery owner/evidence;
- production GraphQL introspection policy;
- production host, registry/image promotion path, deployment approver, rollback
  authority, image provenance expectations, and live readiness evidence;
- no-AI posture evidence proving the deterministic product path remains complete.

Do not put real mount paths, real domains, real email addresses, real usernames,
or real credential references in the example unless they are clearly inert.

### 2. Add a local fail-closed readiness validator

Add a deterministic script, for example:

- `scripts/ops/check-launch-readiness.js`

It should read a readiness file path from an argument or default to
`infra/launch/readiness.example.json`. It must:

- validate required top-level sections and required evidence fields;
- fail if any required decision is `unresolved`, empty, or still a placeholder;
- fail if secret-like fields contain literal secret values instead of source
  references;
- fail if any source reference or evidence path looks client-public
  (`NEXT_PUBLIC_*`) or is a tracked raw secret;
- fail if HSTS/TLS is marked approved without domain and TLS contact evidence;
- fail if SLO/alert thresholds are absent or non-measurable;
- fail if backup/restore is marked approved without restore drill and
  DB/object-reconciliation evidence;
- fail if encryption is marked approved without key-separation and key-recovery
  evidence;
- fail if optional AI is marked enabled, because Phase 11 has not been approved
  or implemented;
- print a concise blocker report grouped by category;
- exit 0 only when every launch category is approved with evidence.

The example file should intentionally fail. That is the correct repository
state until real operator values and drills exist outside this prompt.

### 3. Wire the validator into launch readiness

Update `scripts/ops/launch-readiness.sh` so it:

1. runs the existing deterministic checks:
   - `scripts/ops/check-production-templates.sh`
   - `scripts/ops/scan-secrets.sh`
   - `scripts/ops/check-docker-runtime.sh`
2. runs the new launch readiness validator;
3. preserves the fail-closed behavior when the example file is unresolved;
4. prints the exact readiness file path being evaluated;
5. allows an operator-supplied file path via an argument, for example:
   `npm run ops:launch-readiness -- infra/launch/production-readiness.json`.

Do not make `npm run ops:check` fail on the unresolved example. `ops:check`
should remain a CI-safe repository-template check. `ops:launch-readiness` should
remain the explicit launch gate and should fail until a real approved readiness
file exists.

### 4. Keep secret scanning and template checks aligned

Update `scripts/ops/scan-secrets.sh` only if needed so the new example file can
contain approved placeholder markers without weakening the scan elsewhere.

Update `scripts/ops/check-production-templates.sh` only if needed to require the
new launch-readiness template and validator file exist. Do not make it require
real production values.

### 5. Documentation updates

Update `docs/operations.md` with:

- Phase 12D status and exact files added;
- the readiness record format and how to run the validator;
- the expected failing output shape for the checked-in example;
- the distinction between CI-safe `npm run ops:check` and launch-only
  `npm run ops:launch-readiness`;
- the continued no-AI posture and why Phase 11 remains blocked.

Update `docs/system-architecture.md` only where the operations/deployment section
needs to mention the structured readiness file as the current launch gate.

Update `docs/security.md` only where the security acceptance suite or threat
register needs to map launch evidence to TM-15/TM-18/TM-19/TM-20/TM-21.

Update `docs/product.md` only if the readiness record clarifies open product
decisions such as retention, deletion, or optional AI. Do not mark decisions
closed unless the user actually provided values.

Do not add a new AGENTS docs-index row unless a new canonical `docs/*.md` file
is created. This prompt should reuse `docs/operations.md` as the owner.

## Non-goals

- No production deployment, push, image publication, domain registration, TLS
  issuance, SMTP setup, or provider provisioning.
- No real secrets, real credential references, real production mount paths, or
  real customer/operator contact data in git.
- No Phase 11 optional AI implementation or enablement.
- No Kubernetes, Terraform, cloud-provider, service-mesh, or multi-region work.
- No REST, GraphQL, Prisma schema, RLS, client UI, dashboard, report, or export
  behavior changes unless a validation issue proves a narrow fix is required.
- No weakening of the existing launch-blocker posture.

## Checks to run

Run and record the real output:

```bash
npm run lint
npm run typecheck
npm run build
npm run ops:check
npm run ops:launch-readiness
```

Expected: `npm run ops:launch-readiness` exits non-zero against the checked-in
example because unresolved operator decisions remain. This is a passing
behavioral result for this prompt if the blocker report is precise and all other
checks pass.

If code changes touch server behavior, contracts, or tests beyond ops scripts,
also run the relevant narrower checks:

```bash
npm run test:server
npm run test:client:e2e
```

Before review, run:

```bash
git diff --check
git status --short
git diff --stat
```

## Review and commit requirements

After implementation and self-verification:

1. Use `requesting-code-review` to dispatch a reviewer subagent with the prompt
   requirements, base/head SHAs, files changed, and check outputs.
2. Use `receiving-code-review` to evaluate findings. Verify every claim against
   the codebase before applying fixes. Push back with technical evidence where
   feedback is wrong.
3. Re-run affected checks after fixes.
4. Update documentation with final implemented-state evidence.
5. Use `caveman-commit` for the local commit message and commit the completed
   implementation to `main`.

Do not push. A later standalone uppercase `P` is the only push authorization.
