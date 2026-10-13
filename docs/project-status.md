# Acres whole-project status

Assessment date: 2026-10-13. Source baseline: `4e9d6eb` on `main`, preceding
Prompt 357. This assesses the approved V1 in [product.md](product.md), including
operational recovery and release acceptance, rather than all conceivable future
Acres features. It is a repository assessment, not an inspection of a deployed
production environment or a restricted operator evidence store.

## Completion estimate

**Approximately 85% complete overall, with an estimated range of 80–90%.** The
core application implementation is approximately 90–95% complete; production
launch is **not approved**. These are engineering judgments, not measured task
hours, delivery forecasts, test coverage percentages or completed phase counts.
The remaining work can expose substantial defects during integrated testing.

The following planning weights make the estimate explicit. They reflect the
relative scope of V1 capabilities and give release operations substantial
weight. They are not historical effort measurements. Earned points credit
inspected implementation and recorded verification while reserving points for
known gaps and missing acceptance evidence.

| Area                                                    | V1 weight | Estimated earned points | Basis for outstanding points                                                                  |
| ------------------------------------------------------- | --------: | ----------------------: | --------------------------------------------------------------------------------------------- |
| Marketing, design system and site chrome                |        10 |                      10 | Implemented reference site; final release regressions belong to release acceptance below      |
| Database, tenancy, permissions and API contracts        |        15 |                      14 | Implemented; current release isolation/integration regression still needed                    |
| Accounts, organizations and team workflows              |        10 |                       9 | Implemented; administrative history experience and release journeys incomplete                |
| Uploads, worker, geography and ingestion                |        20 |                      18 | Implemented; live provider publication and dependency-failure/recovery acceptance outstanding |
| Deterministic analytics and saved dashboards            |        10 |                       9 | Implemented; representative real-data acceptance still needed                                 |
| Governed reports and CSV/PDF exports                    |        10 |                       9 | Implemented; full live lineage/download acceptance still needed                               |
| Operations, security verification and production launch |        25 |                      16 | Substantial tooling exists; real deployment, drills and eleven sign-offs remain unverified    |
| **Total**                                               |   **100** |                  **85** | **Planning estimate, not release approval**                                                   |

The application rows total 69/75 points (92%), explaining the separate 90–95%
application estimate. Optional AI adds no points to the denominator: a complete
no-AI path is required, and the unpaid Gemini preview is excluded from launch.
The unresolved example's 0/11 approvals measures neither 0% project completion
nor the state of an operator's private production records.

## What is built

The following are implemented in the checked-out code and backed by committed
history. “Built” does not mean deployed or that every phase exit criterion is
currently verified. Historical test results remain historical.

| Capability                                                                                                                 | Inspected implementation and committed basis                                                                                                                                     | Build record                                                                   |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Marketing site, primitives, responsive chrome, motion and accessibility foundation                                         | `client/app/(marketing)/page.tsx`; commits `0723829`, `efb784a`, `41fdc14`, `8e9f644`, `f29f674`, `61f08fc`                                                                      | [landing.md](landing.md), [polish.md](polish.md)                               |
| PostgreSQL/PostGIS, organizations, forced RLS, role policy, versioned REST and read GraphQL                                | `server/prisma/schema.prisma`, `server/src/organizations/permissions.ts`, `server/src/graphql/acres.resolver.ts`; commits `4f34481`, `aaf75fd`, `739b782`                        | [backend.md](backend.md), [build-plan.md](build-plan.md)                       |
| Login, registration, recovery, organization selection, invitations and member management                                   | `client/app/(auth)/`, `client/components/acres/app/members-workspace.tsx`; commits `ea479bf`, `b8f5c6a`, `eaa4dfe`, `32704ab`                                                    | [authenticated-app.md](authenticated-app.md)                                   |
| Secure uploads, quarantine/scanning, durable outbox, worker and progress                                                   | `server/src/worker/upload-worker.service.ts`, `server/src/outbox/outbox.service.ts`, `client/components/acres/app/dataset-actions.tsx`; commits `ca3bf20`, `f8b573a`, `7457f3a`  | [backend.md](backend.md), [ingestion.md](ingestion.md)                         |
| CSV/XLSX/GeoJSON ingestion, mappings, immutable versions and reviewed gbOpen geography adapter                             | `server/src/ingestion/ingestion.service.ts`, `server/src/geography/geoboundaries-provider.ts`; ingestion foundation `f9746a0`, subsequent provider evidence in the owning record | [ingestion.md](ingestion.md), [system-architecture.md](system-architecture.md) |
| Metric definitions, normalized observations, quality, deterministic aggregates and lineage                                 | `server/src/analytics/analytics.service.ts`, analytics schema; commits `deb53f8`, `4d132d1`                                                                                      | [analytics.md](analytics.md)                                                   |
| Regional filters, chart/table/evidence display and saved views                                                             | `client/components/acres/app/dashboard-workspace.tsx`, `server/src/graphql/acres.resolver.ts`; commits `a3de483`, `3912ed3`                                                      | [dashboards.md](dashboards.md)                                                 |
| Draft/review/publish reports, immutable evidence, async CSV/PDF exports and expiry handling                                | `server/src/reports/reports.service.ts`, `client/components/acres/app/report-actions.tsx`; commits `61b847f`, `d4d5cf5`, `cc49667`, `b44842e`                                    | [reports.md](reports.md)                                                       |
| Optional grounded AI draft preview                                                                                         | `server/src/ai/ai.service.ts`, report actions; commit `2646f3f`; disabled by default and excluded from production launch                                                         | [ai.md](ai.md)                                                                 |
| CI, production templates, metrics, dashboards, alerts, backup/restore/reconciliation, security and launch validation tools | `.github/workflows/ci.yml`, `infra/`, `scripts/ops/`; commits `9a2b9e6`, `229e42b`, `5f5e7e3`, `ce7f634`, through `4e9d6eb`                                                      | [operations.md](operations.md), [launch-checklist.md](launch-checklist.md)     |

## Remaining engineering and acceptance work

1. **Finish the remaining administrative history scope.** Prompt 358 adds
   owner/admin `/app/audit` with real tenant-scoped GraphQL metadata, pagination,
   safe states and browser acceptance; see [authenticated-app.md](authenticated-app.md).
   The audit persistence/query and new client surface are implemented. Prompt 359
   adds direct post-context session/access/outage/retry simulations with real local setup
   and recovery (20/20 combined cases; 18/18 concurrent repeated fault cases).
   These simulations do not prove live revocation or infrastructure recovery.
   Prompt 360 closes the global scheduled-run disclosure:
   `/api/v1/jobs/runs` denies every tenant role before reading global telemetry.
   Ingestion/export progress and audit history now provide the implemented
   surfaces for journey 3.9; this does not prove whole-release acceptance.
   Global maintenance telemetry belongs to operators, not organization admins;
   no tenant replacement or unified job console is promised. A future operator
   interface requires separate scope and authentication decisions. This
   follow-up does not recalculate the dated estimate or approve launch.

2. **Prove the real end-to-end data journey on the release candidate.** Prompt 361
   implements `server/test/data-journey.e2e-spec.ts` proving the complete live
   pipeline across PostgreSQL/PostGIS under forced RLS: reviewed PostGIS geography
   baseline seeding with spatial lookup; Org A/B multi-tenant setup with
   Owner/Analyst/Viewer roles; upload initiation, buffer storage, byte/checksum
   verification and worker acceptance; dataset and column mapping creation;
   ingestion processing, immutable dataset version publication, and deterministic
   metrics/observations/aggregates/lineage; direct analytics reads and evidence
   resolution; saved dashboard view creation and querying; governed report drafting,
   evidence freezing, review submission and publication; asynchronous export
   generation, worker rendering, and artifact download; cross-tenant isolation
   under RLS (Org B denied all Org A data); and RBAC denials (Viewer denied write
   operations, Analyst denied member revocation, and partial publication rollback
   defense on invalid geography references). Full server real database suite passes
   146/146 tests across 7 test suites. Live infrastructure-level failure acceptance
   (Garage/Valkey/ClamAV outages and host restarts) remains in item 4 below.
3. **Refresh release verification and triage real findings.** Prompt 362
   refreshes the complete repository verification baseline and triages real
   findings: contracts drift check passes (0 drift); lint and typecheck pass
   across all 3 workspaces; production build passes for all workspaces (Next.js
   23/23 routes); server unit suite passes 120/120 suites and 1876/1876 tests
   (triaging missing `CSRF_SECRET` in `server/.env` and adding test fallback in
   `geoboundaries-cli.spec.ts`); real PostgreSQL/PostGIS database E2E suite passes
   7/7 suites and 146/146 tests under forced RLS; representative analytics
   (6/6) and geography (2/2) EXPLAIN query plans pass against the test database;
   client Playwright browser suite passes 85/85 tests (9 skipped opt-in fault
   cases) across 375px/800px/1280px viewports (triaging `/output/` in `.gitignore`);
   and operations preflight (`ops:check`) passes all 33 offline stages and 27
   suites (702 packages verified, 0 license violations, 0 blocking SAST findings).
   Dry-run launch drill passes 6/7 stages, with disaster recovery failing
   cleanly due to absent local object storage daemon as expected in item 4.
4. **Finish infrastructure-level failure acceptance.** Prompt 363 implements
   and accepts the live infrastructure failure suite in
   `server/test/infrastructure-failure.e2e-spec.ts` (13/13 tests, 8/8 real DB
   suites, 159/159 tests under forced RLS). Proves fail-closed rejection and
   dead-lettering on ClamAV connection outage and socket timeout; virus
   signature isolation without leaking signature strings into `failureMessage` or
   `JobDeadLetter.reasonMessage`; storage buffer outage rejection and dead-lettering;
   generic exception sanitization ("Upload processing failed unexpectedly.")
   preventing internal S3 endpoint or stack leak on network failure; storage and
   scanner readiness probe failure resolution; Valkey queue dispatch retry backoff
   and dead-letter exhaustion in the durable outbox; ingestion worker crash
   lock-lease expiration reclamation via PostgreSQL `FOR UPDATE SKIP LOCKED`;
   parser error transactional rollback (zero partial dataset versions, observations,
   or aggregates committed); and deterministic object/database parity reconciliation
   detecting missing objects, orphans, and checksum mismatches. Live physical
   cluster cutover, hardware power loss drills, and operator sign-offs across
   the 11 launch categories remain operator-owned in the launch checklist below.


## Operator-owned launch work

The reference stack is single-host Compose+Caddy with separate API/worker
processes. Select the actual host, materialized configuration, immutable
client/server release images, restricted evidence store and named approvers
before live drills. The repository contains examples and executable tooling;
it does not establish the state of an external deployment.

All eleven categories in the checked-in example remain unresolved. The
[launch checklist](launch-checklist.md) owns the exact child-report schemas,
independent live-source inspection and sign-offs; this table is a handoff index.

| Required category             | Remaining real decision/evidence                                                      | Owner                             |
| ----------------------------- | ------------------------------------------------------------------------------------- | --------------------------------- |
| Production domain and TLS     | Domain, DNS, issued TLS, live headers and HSTS decision                               | Ops lead                          |
| SMTP delivery                 | Provider/sender, SPF/DKIM/DMARC and actual delivery evidence                          | Ops lead                          |
| Secrets management            | Runtime injection, masking, rotation and compromise-response evidence                 | Security lead                     |
| Secret references             | Twelve distinct indirect references with verified access/injection policy             | Security lead                     |
| SLOs, alerting and capacity   | Adopt objectives; target-bound load/database telemetry and alert delivery             | SRE/on-call                       |
| Backups and disaster recovery | Off-host encrypted backups, isolated restore, object reconciliation, RPO/RTO evidence | SRE                               |
| Data retention                | Signed policy, legal decisions and actual cleanup schedules/results                   | Legal and ops                     |
| Volume encryption             | Nine stateful mounts, separated keys, custody and tested recovery                     | Security/infrastructure/key owner |
| GraphQL introspection         | Approved production policy and actual ingress probe                                   | Security lead                     |
| Deployment and rollback       | Source/image provenance, current/previous images and live controlled drill            | Release manager/approver          |
| No-AI production posture      | API/worker configuration, absent Gemini key and deterministic production journeys     | Product/security                  |

The safe order is: close known V1 engineering gaps and choose the candidate;
identify the target, owners and policies; materialize infrastructure and
release configuration; run fresh repository and integrated acceptance; conduct
authorized live drills and inspect their sources; obtain all eleven category
sign-offs and a passing readiness record. Some policy and access preparation can
proceed while engineering finishes. Production promotion, rotation, live load,
SMTP tests and restore operations retain their exact-action approval boundaries.
Prompt 201 owns final production evidence and the go/no-go decision.

## Deferred or separately decided work

Sharing/public dashboards, collaboration, scheduled exports, richer report
presentation, cross-version rollups, advanced quality heuristics, additional
geography providers/automatic refresh, billing, SSO/custom roles, mobile apps
and production AI are not silently added to this completion denominator.
Where [product.md](product.md) leaves deletion, retention, supported limits,
geography governance or launch-market obligations open, obtain the affected
operator/product/legal decision before release; existing code defaults do not
substitute for approved policies.

## Verification boundary for this assessment

Prompt 357 changes documentation only. Code, route inventory, schema, CI and
git history were inspected; no live services or private operator evidence were
accessed. The read-only example readiness assessment reports **0 approved,
11 unresolved categories and 70 blockers**, intentionally failing closed.
Root format/lint/build/typecheck and independent review results are recorded
with actual output in [operations.md](operations.md), Prompt 357. No fresh
browser, database, full operations, online audit or production pass is claimed.

To reproduce the repository-visible release decision:

```bash
node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json
```

A failing example is expected. Completion requires the operator-owned record
and authentic evidence, not editing the example to make its checker green.
