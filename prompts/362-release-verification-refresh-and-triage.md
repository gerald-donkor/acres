# Prompt 362 — Release Verification Refresh and Triage

## Scope and why next

Baseline `26d6354` on `main`. Prompts 358–360 implemented organization audit history, audit failure acceptance, and closed the global scheduled-run telemetry boundary. Prompt 361 proved the authoritative end-to-end data journey across PostgreSQL/PostGIS under forced RLS.
The next dependency-safe milestone identified in `docs/project-status.md` §3 is:
"Refresh release verification and triage real findings. Run contracts, server unit/integration and real PostgreSQL/PostGIS tests, representative query plans, browser/accessibility/responsive journeys, operations checks and dependency/SAST/container/license checks against the selected candidate. Record environment, actual commands and failures; resolve launch-blocking findings or obtain the explicit acceptance allowed by policy. This assessment does not supply a fresh vulnerability count or a full-suite pass."

This prompt executes the comprehensive release verification refresh across the entire Acres stack, triages all findings with recorded environment details and actual command outputs, and updates the canonical records in `docs/operations.md`, `docs/project-status.md`, and `docs/build-plan.md`.

## Reference material

Read:
- `AGENTS.md`
- `docs/project-status.md` (remaining engineering & acceptance work §3)
- `docs/build-plan.md` (§13 Phase 12, §16 Phase 12E, §17 Phase 12F, §18 Phase 12G)
- `docs/operations.md` (production preflights, operations checks, launch drills, evidence criteria)
- `docs/launch-checklist.md` (operational checklist and verification gates)
- `docs/security.md` (threat model mitigations, scanner and container postures)
- `docs/backend.md` (route inventory, envelopes, and testing records)
- `docs/authenticated-app.md` (authenticated journeys, accessibility and responsive behavior)

Inspect:
- Root `package.json` verification scripts (`contracts:check`, `lint`, `typecheck`, `build`, `test:server`, `test:client:e2e`, `analytics:plans`, `geography:plans`, `ops:check`, `ops:launch-drill`)
- `server/package.json` and `client/package.json`
- `scripts/ops/` test runners and check scripts

## Verification suites and execution plan

1. **Contracts and static integrity checks**:
   - `npm run contracts:check`: OpenAPI and GraphQL SDL schema drift detection.
   - `npm run lint`: ESLint verification across client, shared, and server workspaces.
   - `npm run typecheck`: TypeScript compilation without emit across all three workspaces.
   - `npm run build`: Production builds for `@acres/shared`, `@acres/client` (Next.js 16.3 static/dynamic routes), and `@acres/server` (NestJS).
   - `git diff --check`: Trailing whitespace and merge marker preflight.

2. **Server unit and integration testing**:
   - `npm run test --workspace=@acres/server`: All Jest unit test suites across server modules (auth, organizations, uploads, ingestion, analytics, dashboards, reports, outbox, ai, jobs).
   - `npm run test:server` (`test:e2e`): Real PostgreSQL/PostGIS integration and end-to-end suites under forced RLS (`database.e2e-spec.ts`, `geography-database.e2e-spec.ts`, `geoboundaries-database.e2e-spec.ts`, `data-journey.e2e-spec.ts`, `api.e2e-spec.ts`, etc.).

3. **Representative query plan gates**:
   - `npm run analytics:plans`: Measured EXPLAIN query plans for analytical rollups, index scans, and tenant boundaries.
   - `npm run geography:plans`: Measured PostGIS spatial query plans and hierarchy lookups.

4. **Client browser, responsive, and accessibility E2E journeys**:
   - `npm run test:client:e2e`: Playwright E2E suite covering marketing landing page, responsive layouts (375px mobile, 800px tablet, 1280px desktop), auth flows, invitation acceptance, member administration, audit workspace, dashboards, datasets, reports, error boundaries, and multi-tenant isolation.

5. **Operations preflights, security, and supply-chain scans**:
   - `npm run ops:check`: Comprehensive operations preflight aggregating:
     - Production template integrity (`ops:templates`, `ops:templates-test`, `ops:templates-shell-test`)
     - Database diagnostics (`ops:postgres-diagnostics-test`)
     - Release images (`ops:release-images-test`)
     - Secret scanning (`ops:scan-secrets`, `ops:scan-secrets-test`)
     - Docker runtime preflights (`ops:docker-runtime`, `ops:docker-runtime-test`)
     - Dependency audit and vulnerability check (`ops:audit`, `ops:audit-test`)
     - Readiness schema and launch readiness validator (`ops:readiness-schema-test`, `ops:readiness-test`, `ops:launch-readiness-test`)
     - Storage object reconciliation (`ops:reconcile-test`)
     - Backup and restore drills (`ops:backup-test`, `ops:restore-test`, `ops:restore-drill-test`)
     - Caddy routing verification (`ops:caddy-test`)
     - Deployment drill (`ops:deployment-test`)
     - Volume encryption preflight (`ops:volume-test`)
     - Secret rotation drill (`ops:rotation-test`)
     - SBOM generation and license compliance (`ops:sbom-test`, `ops:sbom`)
     - SAST static analysis (`ops:sast-test`, `ops:sast`)
     - Container security verification (`ops:container-test`, `ops:container-security`)
     - Capacity and load resilience (`ops:capacity-test`)
     - Alert rules configuration (`ops:alert-test`)
     - DoS resilience and capacity alerting (`ops:dos-test`, `ops:capacity-alerting-test`)
     - Launch drill runner and dossier assembly (`ops:launch-drill-test`)
   - `npm run ops:launch-drill`: Dry-run execution of unified launch drill runner.

6. **Triage, defect resolution, and evidence recording**:
   - Triage all suite outcomes against policy: distinguish hard failures requiring immediate code remediation from known environment restrictions (e.g. read-only operator secret stores or offline sandbox limits).
   - Resolve any uncovered launch-blocking bugs or code regressions.
   - Record exact environment (OS, kernel, Node, npm, Docker/PostgreSQL/PostGIS versions), command invocations, test counts, durations, and outputs in `docs/operations.md`.
   - Update `docs/project-status.md` and `docs/build-plan.md` with the refreshed verification results.

## Expected impact and non-goals

- **Impact**:
  - Refreshes whole-repository verification baseline for release readiness.
  - Updates `docs/operations.md`, `docs/project-status.md`, and `docs/build-plan.md` with fresh command outputs and triaged evidence.
  - Fixes any uncovered code defects or regressions if encountered.
- **Non-goals**:
  - No alteration of `infra/launch/readiness.example.json` into a fabricated passing file (example must remain 0/11 approved / 70 blockers).
  - No operator sign-off or production go/no-go approval (Prompt 201 and operator-owned launch checklist remain open).
  - No deployment to live production infrastructure or remote git push.

## Checks to run

- `npm run contracts:check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test --workspace=@acres/server`
- `npm run test:server`
- `npm run analytics:plans`
- `npm run geography:plans`
- `npm run test:client:e2e`
- `npm run ops:check`
- `git diff --check`

Owning doc: `docs/operations.md`, `docs/project-status.md`, and `docs/build-plan.md`.

## SKILLS USED

- `deployment-pipeline-design` — evaluate CI/CD verification stages, gates, and promotion criteria.
- `secrets-management` — verify secret scanning and runtime secret redaction rules.
- `prometheus-configuration` — verify alert rule definitions and Prometheus metrics.
- `grafana-dashboards` — review operational telemetry configurations.
- `sast-configuration` — execute and verify static application security scans.
- `security-best-practices` — inspect security postures and supply chain integrity.
- `security-threat-model` — review verification results against recorded threat mitigations.
- `javascript-testing-patterns` — inspect Jest and Node test runner execution.
- `e2e-testing-patterns` — evaluate end-to-end database and server tests.
- `playwright` — execute and inspect client browser E2E journeys.
- `accessibility-compliance` — verify WCAG compliance in client test runs.
- `web-design-guidelines` — verify responsive and design integrity.
- `api-design-principles` — verify REST and GraphQL contract consistency.
- `openapi-spec-generation` — check contract generation and drift detection.
- `postgres-best-practices` — inspect PostgreSQL/PostGIS database test execution.
- `sql-optimization-patterns` — analyze representative analytics and geography query plans.
- `requesting-code-review` — dispatch code reviewer subagent after verification completion.
- `receiving-code-review` — rigorously evaluate feedback and make technical fixes.
- `caveman-commit` — format concise conventional commit message.
