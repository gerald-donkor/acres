# 63 - production caddy same-origin routing and deployment drill

## Scope, and why it is next

The committed repository is on `main` at `5f5e7e3` (`feat(ops): add restore drill
and reconciliation`). Phases 1 through 10 are functionally complete, Phase 11A
(Gemini free-tier draft preview) is implemented as a disabled-by-default preview
strictly excluded from production launch, and Phase 12 foundations (12A
templates/preflights, 12B telemetry/retention, 12C E2E journeys, 12D launch
readiness decision record, 12E browser verification remediation, and 12F
disaster recovery restore drill and object reconciliation) are committed.

However, two critical operational and architectural requirements remain open
across the build records:

1. **Phase 5 Same-Origin Caddy Ingress**:
   In `docs/build-plan.md` Line 316 and `docs/authenticated-app.md` Line 458:
   > "Open Phase 5 Work: Production Caddy same-origin routing; current local/dev
   > browser traffic routes via the Next Route Handler bridge (reserved for live
   > host/operator deployment)."
   While the development client routes through Next.js route handler proxy
   (`client/app/api/v1/[...path]/route.ts`), the production architecture requires
   Caddy to act as the single edge ingress, terminating TLS, enforcing request
   body caps, injecting security headers, and proxying `/api/*`, `/graphql`,
   and `/health*` directly to NestJS while preserving SigV4 headers for Garage
   object uploads.

2. **Phase 12 Deployment Promotion & Rollback Exit Gate**:
   In `docs/build-plan.md` §13:
   > "- **Exit:** operator-approved launch checklist; reproducible promotion and
   > rollback; successful restore drill within selected objectives; actionable
   > alerts/runbooks; no unresolved critical security/accessibility findings;
   > all repository, integration, E2E, isolation, and failure tests passing."
   And in `infra/launch/readiness.example.json` Category 10 (`deployment_and_rollback`):
   > "Live deployment & Caddy routing drill must be completed (live_readiness_drill_completed: true)"
   > "Requires designated deployer/rollback authority, immutable tagged image
   > build pipeline, and smoke-tested Caddy routing."
   And in `docs/security.md` (TM-18 supply chain / controlled promotion, TM-20
   edge DoS mitigations, and §15 residual risks):
   > "Docker/Compose production config, image builds, readiness through Caddy,
   > rollback, backup restore, DB/object reconciliation, and encrypted-mount/key
   > recovery drills still require a Docker-capable production-like host."

This prompt implements **Phase 12G**:
1. **Production Caddy Configuration & Same-Origin Routing Verification Suite (`scripts/ops/verify-caddy-routing.js` & `scripts/ops/verify-caddy-routing.spec.js`)**:
   - Validates `infra/caddy/Caddyfile.example` syntax, block structure, and upstream
     routing definitions;
   - Verifies route-matching semantics against production requirements:
     - `@api path /api/* /graphql /health /health/ready` proxies to upstream API (`api:3001`) with `X-Forwarded-Host` and `X-Forwarded-Proto`;
     - `@objects path /acres-quarantine/*` proxies to Garage (`garage:3900`) strictly preserving client `Host` header (`header_up Host {host}`) for S3 SigV4 signature integrity;
     - Fallback path (all other requests: `/`, `/login`, `/app/*`, `/_next/*`) proxies to Next.js (`next:3000`);
     - Enforces security header injections on all proxied responses: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and removal of `Server` banner (`-Server`);
     - Validates request body size limit enforcement (`request_body { max_size {$ACRES_MAX_REQUEST_BODY} }`);
     - Validates timeout directives (`read_timeout`, `write_timeout`, `dial_timeout`) across API, Garage, and Next transports;
     - Enforces the HSTS gate invariant (Strict-Transport-Security remains commented out pending domain & TLS certificate approval).
2. **Automated Deployment Promotion & Rollback Drill Runner (`scripts/ops/run-deployment-drill.sh`)**:
   - Executes an automated promotion preflight, live ingress readiness test, and
     backward-compatible rollback drill:
     - **Pre-deployment Gate**: verifies Compose configuration, validates environment sentinels (`production.env.example`), checks non-root image execution, and validates applied database migrations against `_prisma_migrations`;
     - **Ingress Health & Readiness Verification**: exercises shallow `/health` and deep `/health/ready` dependency probes through Caddy route rules, verifying response codes, payloads, and sub-500ms latency;
     - **Rollback Verification**: verifies schema backward compatibility (confirms migrations are additive with zero destructive schema mutations), tests rollback of application container to prior simulated tag, and verifies graceful shutdown drain (`stop_grace_period`);
     - **Structured Evidence Emission**: writes structured JSON evidence to `backups/deployment-drill-evidence-<timestamp>.json` recording duration, checked routes, security headers, and compliance status.
3. **Operations & CI Integration**:
   - Add root package scripts:
     - `npm run ops:caddy-drill`: executes Caddy routing verification and test suite;
     - `npm run ops:deployment-drill`: executes automated deployment promotion preflight and rollback drill;
   - Integrate Caddy routing unit tests into `npm run ops:check`;
   - Update `docs/operations.md`, `docs/authenticated-app.md`, `docs/build-plan.md`, and `docs/security.md` documenting Phase 12G completion, Caddy routing evidence, and closing the open Phase 5 Caddy item.

## Reference material read while preparing this prompt

Repository and workflow authority:
- `AGENTS.md` §§2, 2.1, phase-control commands, §§5–10: prompt-first workflow,
  phase resolution, skill loading, verification, review, documentation, commit
  rules, product constraints, and no-fabrication rules.
- `docs/build-plan.md` §§6, 13–14: Phase 5 open Caddy routing item, Phase 12
  launch hardening exit requirements, and sequence gates.
- `docs/authenticated-app.md` §9: client/backend connection record and open Phase 5 work.
- `docs/operations.md`: current production templates, Caddy topology, launch
  readiness checklist, and fail-closed readiness validator.
- `docs/security.md` §§8–10: threat register, TM-18 supply-chain / controlled
  promotion, TM-20 edge DoS mitigations, and residual risks.
- `docs/system-architecture.md` §§3.1, 8.1, 10, 11: Caddy edge ingress, same-origin
  routing, and operational runbooks.
- `docs/backend.md` §§2, 10: deployment requirements and single-host Compose topology.

Code references:
- `infra/caddy/Caddyfile.example`: reference Caddy configuration.
- `infra/compose/docker-compose.production.example.yml`: reference production Compose layout.
- `scripts/ops/check-production-templates.sh`: operational template validator.
- `scripts/ops/check-launch-readiness.js`: Category 10 (`deployment_and_rollback`) requirements.
- `client/app/api/v1/[...path]/route.ts`: local development Next Route Handler bridge.

## Measurements and procedure

1. **Implement `scripts/ops/verify-caddy-routing.js`**:
   - Provide a pure Node.js verification and route evaluation engine:
     - Reads and parses `infra/caddy/Caddyfile.example`;
     - Verifies site block structure, admin directive, TLS contact placeholder, and compression (`encode zstd gzip`);
     - Evaluates route matchers:
       - Matcher `@api path /api/* /graphql /health /health/ready` -> target `api:3001` with `header_up X-Forwarded-Host {host}` and `header_up X-Forwarded-Proto {scheme}`;
       - Matcher `@objects path /acres-quarantine/*` -> target `garage:3900` with `header_up Host {host}`;
       - Fallback matcher `reverse_proxy next:3000`;
     - Evaluates edge security headers:
       - `X-Content-Type-Options: nosniff`
       - `X-Frame-Options: DENY`
       - `Referrer-Policy: strict-origin-when-cross-origin`
       - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
       - Header removal: `-Server`
     - Evaluates request body limits: `request_body { max_size {$ACRES_MAX_REQUEST_BODY} }`;
     - Evaluates transport timeouts across all 3 upstreams:
       - `read_timeout`, `write_timeout`, `dial_timeout`;
     - Verifies that `Strict-Transport-Security` is guarded / commented out in the template;
     - Exposes both programmatic CLI (`node scripts/ops/verify-caddy-routing.js`) and module export functions.

2. **Implement `scripts/ops/verify-caddy-routing.spec.js`**:
   - Unit test suite testing all Caddy routing rules and invariants:
     - Correct routing for API paths (`/api/v1/auth/session`, `/graphql`, `/health`, `/health/ready`);
     - Correct routing for Garage objects (`/acres-quarantine/temp-123/file.csv`);
     - Correct routing for Next.js application paths (`/`, `/app`, `/app/dashboards`, `/_next/static/chunk.js`);
     - Host header preservation assertion for Garage uploads;
     - Proxy headers assertion (`X-Forwarded-Host`, `X-Forwarded-Proto`) for API;
     - Required security headers assertion;
     - Timeout and request size assertions;
     - Fail-closed error reporting on drifted Caddyfile configurations.

3. **Implement `scripts/ops/run-deployment-drill.sh`**:
   - Shell script with strict error handling (`set -eu`):
     - Configurable parameters with safe defaults:
       - `DRY_RUN`: default `false` (supports `--dry-run`);
       - `CONFIG_FILE`: `infra/caddy/Caddyfile.example`;
       - `COMPOSE_FILE`: `infra/compose/docker-compose.production.example.yml`;
       - `EVIDENCE_DIR`: `backups`;
     - Step 1: Run Caddy configuration & route verification (`verify-caddy-routing.js`);
     - Step 2: Validate database migration chain:
       - Checks applied migrations in database vs local migration files;
       - Ensures all migrations are forward-compatible and no unvalidated constraints exist;
     - Step 3: Run operational template and secret checks (`check-production-templates.sh`, `scan-secrets.sh`);
     - Step 4: Validate deep readiness endpoint (`/health/ready`) and service response envelopes;
     - Step 5: Simulate rollback procedure:
       - Verifies that previous image version is recorded and rollback command is verified;
       - Checks that schema changes are non-destructive and backward compatible;
       - Verifies graceful drain period (`stop_grace_period: 30s` for Next, `45s` for API, `60s` for Worker);
     - Step 6: Generate structured JSON evidence (`backups/deployment-drill-evidence-<timestamp>.json`).

4. **Update `scripts/ops/check-production-templates.sh` & `package.json`**:
   - Add `scripts/ops/verify-caddy-routing.js` and `scripts/ops/run-deployment-drill.sh` to required file checks;
   - Add `npm run ops:caddy-drill` and `npm run ops:deployment-drill` to root `package.json`;
   - Add `node scripts/ops/verify-caddy-routing.spec.js` to `npm run ops:check`.

5. **Update Owning Documentation**:
   - `docs/operations.md`: document Phase 12G Caddy same-origin routing and deployment promotion/rollback drill;
   - `docs/authenticated-app.md`: mark Phase 5 Caddy same-origin routing verified via drill;
   - `docs/build-plan.md`: record Phase 12G verification record and update Phase 5 status;
   - `docs/security.md`: update TM-18 and TM-20 status with Caddy routing verification evidence.

## Expected impact

- `scripts/ops/verify-caddy-routing.js`: new Caddy routing and security header validator.
- `scripts/ops/verify-caddy-routing.spec.js`: unit test suite for Caddy routing.
- `scripts/ops/run-deployment-drill.sh`: executable deployment promotion and rollback drill runner.
- `package.json`: new root scripts `ops:caddy-drill` and `ops:deployment-drill`.
- `scripts/ops/check-production-templates.sh`: updated to check new drill scripts and run Caddy routing tests.
- `docs/operations.md`, `docs/authenticated-app.md`, `docs/build-plan.md`, `docs/security.md`: updated with Phase 12G evidence and closure of Phase 5 Caddy item.

## Non-goals

- Deploying to a remote public cloud provider or buying a production domain.
- Automating Kubernetes or multi-cluster Terraform pipelines.
- Modifying local development workflow (`npm run dev` continues using the Next.js Route Handler bridge).
- Enabling HSTS in production before operator domain selection.
- Enabling production AI draft preview (remains excluded from production launch).

## Verification checks

1. `npm run ops:caddy-drill`: executes Caddy routing validation and tests (must pass).
2. `npm run ops:deployment-drill`: executes automated deployment drill and outputs structured evidence (must pass).
3. `npm run ops:check`: executes complete operational check suite including template checks, secret scan, runtime checks, dependency audit, readiness tests, storage reconciliation tests, and Caddy routing tests (must pass).
4. `npm run lint`: 0 errors across all workspaces.
5. `npm run typecheck`: clean across all workspaces.
6. `npm run build`: builds client, shared, and server cleanly.
7. `git diff --check`: zero whitespace errors.

## SKILLS USED

- `deployment-pipeline-design`: design reproducible deployment promotion preflights, readiness probes, and rollback gates.
- `github-actions-templates`: ensure CI alignment with operational check scripts.
- `security-threat-model`: address TM-18 supply chain and TM-20 edge DoS mitigations.
- `security-best-practices`: enforce edge security headers and proxy header preservation invariants.
- `architecture-patterns`: preserve modular monolith boundary and same-origin edge routing topology.
- `nestjs-best-practices`: verify API ingress endpoints (`/api/*`, `/graphql`, `/health`, `/health/ready`).
- `javascript-testing-patterns`: build robust unit test coverage for Caddy routing validator.
- `secrets-management`: ensure zero plain-text secret exposure during deployment drills.
- `requesting-code-review`: prepare structured review request and dispatch reviewer subagent.
- `receiving-code-review`: evaluate reviewer feedback with technical rigor.
- `caveman-commit`: format concise conventional commit for main branch.
