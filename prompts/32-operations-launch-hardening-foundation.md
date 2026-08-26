# 32 - operations and launch hardening foundation

## Scope, and why it is next

The committed repository is on `main` at `61b847f` (`feat(reports): add
governed exports`). `docs/reports.md` records Phase 10 as implemented from
`prompts/31-reports-exports.md`. The next ordered target in
`docs/build-plan.md` is Phase 11, optional local AI, but that phase depends on
Phase 10 plus a separate user-approved model, license, quality threshold, and
operating profile. No such enablement decision exists in the committed docs or
this approval request.

Therefore skip Phase 11 for now as an unmet optional decision gate and prepare
the earliest dependency-safe slice of Phase 12: production operations and
launch hardening foundations. This is Phase 12A, not the whole Phase 12.

Implement the foundations that can be built without inventing operator-owned
launch values:

- add a canonical operations build/runbook record, `docs/operations.md`, and
  add its row to the `AGENTS.md` docs index;
- add production-oriented example templates for the single-host reference
  topology: Caddy ingress, Next client, Nest API, Nest worker, Postgres/PostGIS,
  Valkey, Garage, ClamAV, and optional Prometheus/Grafana operator observability;
- add fail-closed operational preflight scripts that detect placeholder secrets,
  unsafe development defaults, missing required environment variables, missing
  production encryption declarations, missing backup/restore declarations, and
  accidental production use of development commands;
- harden CI with local, deterministic checks that do not require real production
  secrets or a chosen host: config syntax checks, secret-pattern scanning over
  tracked files, launch-template preflight tests, Dockerfile/user checks, and
  existing build/test/contract/browser evidence;
- document the values that remain blocked on operator/business input instead
  of selecting them: SLOs, availability target, RPO/RTO, retention periods,
  backup destination, production domain, SMTP delivery, alert owners,
  production volume-encryption mechanism, capacity targets, and production
  introspection policy;
- update `docs/backend.md`, `docs/system-architecture.md`, and
  `docs/security.md` only where this slice changes the current-state record or
  the launch evidence checklist.

This prompt must not deploy anything, push images, provision a server, register
a domain, create real secrets, choose a cloud/provider, add Kubernetes or
Terraform, enable optional AI, or claim that launch is complete.

## Reference material read while preparing this prompt

Repository and workflow authority:

- `AGENTS.md` §§2, 2.1, phase-control commands, §§5-10: prompt-first workflow,
  phase resolution, skill loading, verification, review, documentation, commit
  rules, product constraints, and no-fabrication rules.
- `docs/build-plan.md` §§1, 12-14: Phase 11 optional-AI gate, Phase 12
  operations/launch-hardening target, sequence gates, required skills, tests,
  observability, rollback, and documentation owners.
- `docs/product.md` §§4, 6-7: V1 no-AI path, optional AI as its own phase,
  observable/recoverable operations success criterion, and launch decisions
  that must not be invented.
- `docs/system-architecture.md` §§3, 4, 10-12: runtime containers,
  same-origin routing, deployment profiles, FOSS inventory, optional AI
  boundary, operations/deployment target, and deferred launch inputs.
- `docs/security.md` §§8-10: launch acceptance evidence, operations/security
  controls, remaining threat-model checks, and optional AI acceptance only if
  enabled.
- `docs/backend.md` §§10, 10.1, and 13: current Dockerfile/CI state, health
  and readiness contracts, single-process scheduler and rate-limit caveats,
  deployment host requirements, and current-to-target operations bridge.
- `docs/reports.md`: Phase 10 implemented state, exports/artifacts, worker and
  storage status, verification, and residual gaps.

Current implementation inspected:

- `.github/workflows/ci.yml`: current `checks` job with PostGIS service,
  Node 24 setup, lint/typecheck/build/contracts/migrations/server tests, and
  `docker` job that builds `server/Dockerfile` and smoke-tests `/health`.
- `package.json`: root workspaces and scripts, including `build`, `lint`,
  `typecheck`, `test:server`, `test:client:e2e`, `contracts:check`,
  `deps:up`, `start`, `start:server`, and `start:worker`.
- `docker-compose.yml`: local development Postgres, Valkey, Garage, and ClamAV
  services with disposable local volumes and health checks.
- `.env.example` and `server/.env.example`: current local development
  placeholders and operational variables for database, sessions, CSRF,
  tenancy, GraphQL limits, idempotency, queue, storage, ClamAV, upload/parser,
  outbox, and Node environment.
- `server/Dockerfile`: Node 24 multi-stage API image, production-only runtime
  deps, `USER node`, `/health` healthcheck, and direct Node `CMD`.
- `infra/garage/garage.toml`: current local Garage configuration.
- `scripts/db/bootstrap-roles.sh`, `scripts/db/harden-runtime-privileges.sh`,
  and `scripts/garage/setup-local.sh`: current operational scripts.
- `server/src/app.setup.ts`: Helmet, CORS, request IDs, parser limits, CSRF,
  validation pipe, envelope/filter registration, and shutdown hooks.
- `server/src/health/health.controller.ts` and
  `server/src/health/health.service.ts`: public liveness and dependency-aware
  readiness behavior.

Skills loaded while preparing this prompt:

- `.agents/skills/deployment-pipeline-design/SKILL.md`
- `.agents/skills/github-actions-templates/SKILL.md`
- `.agents/skills/prometheus-configuration/SKILL.md`
- `.agents/skills/grafana-dashboards/SKILL.md`
- `.agents/skills/secrets-management/SKILL.md`
- `.agents/skills/sast-configuration/SKILL.md`
- `.agents/skills/architecture-patterns/SKILL.md`
- `.agents/skills/nestjs-best-practices/SKILL.md`
- `.agents/skills/security-best-practices/SKILL.md`
- `.agents/skills/security-best-practices/references/javascript-express-web-server-security.md`
- `.agents/skills/security-best-practices/references/javascript-typescript-nextjs-web-server-security.md`
- `.agents/skills/security-best-practices/references/javascript-typescript-react-web-frontend-security.md`
- `.agents/skills/security-threat-model/SKILL.md`
- `.agents/skills/error-handling-patterns/SKILL.md`
- `.agents/skills/javascript-testing-patterns/SKILL.md`
- `.agents/skills/e2e-testing-patterns/SKILL.md`
- `.agents/skills/playwright/SKILL.md`
- `.agents/skills/requesting-code-review/SKILL.md`
- `.agents/skills/receiving-code-review/SKILL.md`
- `.agents/skills/caveman-commit/SKILL.md`

## SKILLS USED

- `architecture-patterns` - keep operations code at adapter boundaries and do
  not entangle deployment templates with product modules.
- `nestjs-best-practices` - verify health, readiness, shutdown, module, config,
  and production bootstrap patterns before changing server behavior.
- `security-best-practices` - apply secure defaults for Express, Next, and
  React surfaces: no committed secrets, safe headers, production mode,
  server/client separation, CSRF preservation, and no unsafe env exposure.
- `security-threat-model` - update the repository-grounded launch threat model
  and acceptance checklist for new operations boundaries.
- `deployment-pipeline-design` - design CI and promotion gates with explicit
  preflight, rollback, migration-order, and manual production approval points.
- `github-actions-templates` - update GitHub Actions jobs with scoped
  permissions, deterministic local checks, cache use, and non-secret CI
  execution.
- `prometheus-configuration` - add optional Prometheus config and alert-rule
  scaffolding only for operational metrics with documented placeholder
  thresholds.
- `grafana-dashboards` - add optional operator dashboard provisioning only if
  Prometheus metrics are exposed or stubbed by this slice; do not confuse it
  with customer analytics dashboards.
- `secrets-management` - document and validate runtime/CI secret injection,
  rotation, separation, masking, and production placeholder rejection.
- `sast-configuration` - add or document SAST/secret/dependency/container scan
  hooks that are deterministic locally and appropriately gated in CI.
- `e2e-testing-patterns` - keep launch browser evidence focused on critical
  authenticated journeys and avoid over-broad E2E coverage.
- `playwright` - run real-browser launch smoke/a11y evidence where the prompt
  changes browser-facing runtime or deployment headers.
- `javascript-testing-patterns` - add tests for scripts, validators, config
  readers, and any TypeScript operational helpers.
- `requesting-code-review` - dispatch the mandatory reviewer subagent after
  self-verification.
- `receiving-code-review` - evaluate reviewer feedback against codebase reality
  before applying any fixes.
- `caveman-commit` - write the final Conventional Commit message for the
  executed prompt.

Conditional skills deliberately not used unless implementation expands:

- `postgres-best-practices` and `sql-optimization-patterns` are required if this
  slice adds database retention jobs, backup metadata tables, migration
  changes, query plans, or load/retention findings. If no schema/query change
  lands, state that they were considered and not loaded for execution.
- `accessibility-compliance` and `web-design-guidelines` are required if this
  slice changes user-facing UI or performs a final UI launch audit. If browser
  work is limited to header/runtime verification, do not add UI audit scope.
- `openapi-spec-generation` and `api-design-principles` are required if this
  slice changes REST/GraphQL contracts. They are not needed for pure
  deployment templates and runbooks.

## Required verification before implementation

Before writing code, re-read `AGENTS.md`, this prompt, the docs listed above,
and every skill named in `SKILLS USED`. Load the conditional skills if their
trigger appears during implementation.

Verify current APIs from local primary sources before using them:

- Read any relevant Next 16.3 docs under `node_modules/next/dist/docs/` before
  changing client deployment behavior, route handlers, headers, cookies,
  cache behavior, metadata, or proxy/middleware.
- Inspect local shadcn base-nova components under `client/components/ui/` only
  if UI is touched.
- Read current package manifests and installed package metadata before adding
  or configuring a tool. Do not add network-installed dependencies unless the
  package, version, license, and execution model are verified from local files
  or live primary docs fetched with explicit approval.
- Inspect `server/src/app.setup.ts`, `server/src/config/env.validation.ts`,
  `server/src/health/**`, `server/src/worker.ts`, and `server/Dockerfile`
  before changing process health, shutdown, env, or runtime behavior.
- Inspect `.github/workflows/ci.yml` before changing CI. Keep permissions
  minimal and do not configure registry pushes or deployments.

If an API, package, action version, or production behavior cannot be verified
from local files, loaded skills, or live primary docs fetched in this session,
stop and state the gap rather than guessing.

## Target implementation details

### Documentation and decision register

Create `docs/operations.md` as the implemented-state record for Phase 12A.
Include:

- current status: Phase 12A implemented foundations, not launch complete;
- topology: single-host reference with Caddy in front of Next and API, private
  Postgres/Valkey/Garage/ClamAV, API and worker as separate Node 24 services,
  optional Prometheus/Grafana operator-only path;
- current artifacts added by this phase, with exact file paths and what each
  one proves;
- operator-owned values that remain unset and must block launch when absent:
  production domain, contact email, SMTP host and credentials, secret-injection
  mechanism, session/CSRF/signing secrets, database/storage/queue credentials,
  SLO/availability target, RPO/RTO, backup destination, retention periods,
  alert owners, capacity targets, production introspection policy, and
  production encryption/key-recovery owner;
- runbooks for preflight, deploy, rollback, migration ordering, health/readiness
  checks, backup, restore, secret rotation, compromise response, and incident
  evidence capture;
- explicit no-AI posture: optional AI remains absent and all Phase 12A launch
  evidence must validate the no-AI path.

Update `AGENTS.md` with one docs-index row for `docs/operations.md`. Do not add
new invariants there unless the implementation would otherwise be easy to
break without opening the owning docs file.

Update `docs/backend.md`, `docs/system-architecture.md`, and `docs/security.md`
only with concise current-state changes from this implementation. Do not
duplicate the full runbook outside `docs/operations.md`.

### Production templates

Add production example templates under `infra/` and keep them inert by default:

- `infra/caddy/Caddyfile.example` for the single-host reference. It should:
  route app/document traffic to Next, `/api/*` and `/graphql` to the API, and
  approved presigned object paths to Garage;
  set security headers appropriate to the current app without breaking Next;
  set request-size/timeouts in named placeholders; and document that TLS/HSTS
  behavior depends on a real production domain and operator approval.
- `infra/compose/docker-compose.production.example.yml` or an equivalent
  clearly named production example Compose file. It should:
  define Next, API, worker, Caddy, Postgres/PostGIS, Valkey, Garage, ClamAV,
  optional Prometheus, and optional Grafana services;
  keep stateful services private except the intentional Caddy ingress;
  use `env_file` or `${REQUIRED:?message}` interpolation for all required
  values;
  never include real secrets or development passwords;
  mark stateful volumes as production encrypted mounts or bind paths that the
  preflight can check;
  ensure exactly one scheduler path is enabled; and
  model graceful shutdown with stop signals/grace periods.
- `infra/env/production.env.example` or equivalent. It should enumerate all
  required production env vars with placeholder markers that the preflight
  rejects. It must distinguish secret values from non-secret config and must
  not use `NEXT_PUBLIC_*` for secrets.
- Optional `infra/prometheus/prometheus.yml`,
  `infra/prometheus/alerts.yml`, and
  `infra/grafana/provisioning/**` only if the implementation exposes or can
  scrape meaningful existing health/runtime signals. Placeholder alert
  thresholds must be named as placeholders and must not be presented as SLOs.

Template names may differ if the implementation discovers an existing repo
convention, but they must remain under `infra/` and be documented in
`docs/operations.md`.

### Preflight and validation scripts

Add scripts under `scripts/ops/` with deterministic behavior:

- a production-template validation script that checks required files exist,
  parses YAML/TOML/JSON where repo tooling can do so locally, and fails on
  unresolved placeholders in files that would be consumed directly;
- a secret/default scanner for tracked source files that fails on the known
  local-development passwords and sentinel values when they appear outside
  approved `.env.example`, docs, prompts, tests, or explicitly labelled local
  development fixtures;
- a Docker/runtime inspection script that checks `server/Dockerfile` still uses
  Node 24, runs as non-root, has a healthcheck, and starts Node directly rather
  than through npm;
- a launch-readiness script that runs the above checks and prints the remaining
  operator-owned blockers rather than passing launch.

Keep scripts POSIX-shell compatible where practical because the repo already
uses shell scripts for DB/Garage operations. Make failures explicit and do not
print environment values.

Expose these scripts through root `package.json` with clear names, for example
`ops:check`, `ops:scan-secrets`, and `ops:launch-readiness`. If different names
fit the repo better, document them and update `AGENTS.md` §6 only if the
scripts are meant to become standing commands.

### CI hardening

Extend `.github/workflows/ci.yml` without adding production deployment:

- keep `permissions: contents: read` unless a specific job demonstrably needs
  more;
- keep existing lint/typecheck/build/contracts/migration/server-test checks;
- add the new operational preflight scripts;
- add the client E2E script only if it is stable in the current CI topology or
  document why it remains local-only for this phase;
- keep Docker image build and `/health` smoke test; expand only to readiness if
  the job provisions the required dependencies cleanly and within reasonable
  CI cost;
- do not push images, configure registries, deploy to a host, or add GitHub
  environment secrets.

If adding CodeQL, Semgrep, npm audit, or container scanning requires network
access, unavailable services, or unverified action versions, do not silently add
it. Either implement a local deterministic scan with existing tooling or record
the scanner as a launch blocker in `docs/operations.md`.

### Server/runtime hardening

Only change server code when an actual gap is found during inspection. Likely
safe candidates are:

- expose redacted, low-cardinality runtime diagnostics only if they already fit
  the health/readiness boundary and do not leak configuration;
- improve graceful shutdown or worker drain only if tests reveal a real defect;
- add config validation for production-only placeholder rejection, but do not
  break local development examples;
- preserve the current CSRF, CORS, Helmet, validation, request ID, rate-limit,
  liveness, readiness, and worker behavior unless a verified issue requires a
  scoped change.

Do not add a metrics endpoint unless the metric names, labels, cardinality, and
redaction rules can be implemented and tested. Prometheus/Grafana templates can
remain optional scaffolding if application metrics are not ready.

## Non-goals

- No optional local AI implementation or model/runtime selection.
- No cloud/provider choice, Terraform, Kubernetes, registry push, release, or
  live deployment.
- No real production secrets, keys, tokens, certificates, domains, email
  credentials, backup targets, or alert recipients.
- No launch-complete claim and no invented SLO/RPO/RTO/retention/capacity
  numbers.
- No schema migration unless a concrete operations feature requires it and
  `postgres-best-practices` is loaded.
- No customer-facing UI changes unless needed for a launch-critical defect.
- No broad refactor of product modules, dashboard/report UX, ingestion,
  analytics, or exports.

## Security and failure cases

Cover at minimum:

- accidental production use of local development passwords or `change-me`
  placeholders;
- secrets printed to logs or committed to tracked files;
- `NEXT_PUBLIC_*` carrying secret-looking values;
- public exposure of Postgres, Valkey, Garage admin, ClamAV, Prometheus, or
  Grafana without an explicit operator-authenticated path;
- Caddy forwarding headers without a documented trusted-proxy boundary;
- API scaled to multiple instances while in-process scheduler/rate-limit
  assumptions remain single-instance;
- pending/destructive migrations and rollback after additive schema changes;
- missing backup/restore ownership, missing encrypted-volume declaration, and
  missing key-recovery drill;
- CI job permissions broader than needed;
- scanner/preflight false positives, with documented allowlist rationale rather
  than blanket suppression;
- Docker image accidentally running as root, starting via npm PID 1, or losing
  the `/health` smoke path.

## Verification plan

Run and quote real output from:

```bash
git diff --check
npm run lint
npm run typecheck
npm run build
npm run contracts:check
npm run test:server
npm run test:client:e2e
npm run ops:check
```

If Docker is available, also run and quote:

```bash
docker compose -f infra/compose/docker-compose.production.example.yml config
docker build -f server/Dockerfile -t acres-server:phase-12a .
```

If Docker is not available, quote the actual failure or absence (`command -v
docker`) and rely on CI plus static Dockerfile/template checks. Do not claim
Docker verification passed without running it.

For browser-impacting header or runtime changes, start the relevant local
servers and use Playwright at 375, 800, and 1280 to verify the marketing page,
login/register, `/app`, dashboards, and reports still load without visible
regressions. If this phase does not change browser-facing behavior, explain why
the existing `npm run test:client:e2e` coverage is sufficient.

Self-review the final diff before requesting code review:

```bash
git status --short
git diff --stat
git diff -- . ':(exclude)package-lock.json'
```

Then use `requesting-code-review` with a reviewer subagent. Include:

- base SHA and head SHA;
- this prompt path;
- files changed;
- why Phase 11 is skipped until optional-AI enablement;
- which operator values remain blockers;
- all verification output;
- any commands not run and why.

Use `receiving-code-review` to evaluate findings. Fix valid Critical and
Important issues, re-run affected checks, and request re-review if changes
affect deployment topology, CI gates, secrets, runtime health, or security
boundaries.

## Documentation and commit requirements

Document the implemented result in `docs/operations.md` and concise related
updates in the existing owner docs. Keep prompt-only rationale out of runtime
docs unless future maintainers need it.

At the end of execution, stage only the approved files, inspect the staged
diff, and commit locally on `main` using the `caveman-commit` skill. Do not
push.
