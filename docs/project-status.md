# Acres whole-project status

Assessment date: 2026-10-20. Source baseline: `5b7eab0` on `main` (Prompt 411).
This assesses the approved V1 in [product.md](product.md), including
operational recovery and release acceptance, rather than all conceivable future
Acres features. It is a repository assessment, not an inspection of a deployed
production environment or a restricted operator evidence store.

## Managed target amendment — 2026-10-15 (Updated 2026-10-20)

Following the user's selection of the Vercel-managed target in Prompt 370, the
entire engineering implementation and preview verification of the managed platform
architecture has been **completed** across Prompts 370–411. This includes:
- Pooled Neon PostGIS database connection adapter under forced tenant RLS (`DATABASE_URL`, `DATABASE_MIGRATOR_URL`).
- Private Vercel Blob object storage with quarantine isolation, pre-signed upload tokens, and authenticated downloads.
- Invocation-scoped Nest serverless execution adapter with connection pooling and memory caching.
- Protected Vercel Cron dispatch with timing-safe authorization headers.
- Transactional outbox with durable job recovery and distributed worker state reconciliation.
- Resend email provider transport with verified sender headers.
- Live Vercel preview deployment (`dpl_AGwu9k8gbtQRegTodmHUAL7uxYs4`) with verified routing order.
- Firecracker Sandbox ClamAV malware scanning with live EICAR rejection and clean upload acceptance receipts.
- Scanner candidate adoption (`snap_8OP5G2tCUvxtRdoGFMCu5se58f3N`) and Tier 2 snapshot retirement establishing a steady-state 2-snapshot baseline (~922 MB reclaimed).
- Dual-topology operational tooling: 4 dedicated managed verifiers (28/28 tests passing), branched drill runner (`run-launch-drills.sh --target-architecture vercel-managed-production`), and fail-closed readiness validator (`launch-readiness.sh`).
- Formal 7-stage Managed Production Activation Plan (Prompt 410) and full dual-topology Launch Checklist reconciliation (Prompt 411).

Core product scope is unchanged. The repository maintains full dual-topology readiness
for both the self-hosted `single-host-compose-caddy` profile and the selected
`vercel-managed-production` profile. Production promotion, custom domain DNS,
production secret provisioning, live launch drills, and all eleven human sign-offs
remain open and operator-owned.

## Completion estimate

**Approximately 94% complete overall, with an estimated range of 92–96%.** The
core application implementation is **100% complete** (75/75 earned points across
all six product capability areas); production launch is **not approved**. These
are engineering judgments, not measured task hours, delivery forecasts, test
coverage percentages or completed phase counts.

The following planning weights make the estimate explicit. They reflect the
relative scope of V1 capabilities and give release operations substantial
weight. They are not historical effort measurements. Earned points credit
inspected implementation and recorded verification while reserving points for
known gaps and missing acceptance evidence.

| Area                                                    | V1 weight | Estimated earned points | Basis for outstanding points                                                                           |
| ------------------------------------------------------- | --------: | ----------------------: | ------------------------------------------------------------------------------------------------------ |
| Marketing, design system and site chrome                |        10 |                      10 | Implemented reference site; final release regressions verified across viewports in Prompt 362          |
| Database, tenancy, permissions and API contracts        |        15 |                      15 | Implemented and verified; full multi-tenant RLS isolation and RBAC policy proven in Prompt 361         |
| Accounts, organizations and team workflows              |        10 |                      10 | Implemented and verified; administrative history `/app/audit` and fault recovery proven in Prompts 358–361 |
| Uploads, worker, geography and ingestion                |        20 |                      20 | Implemented and verified; geoboundaries ingestion and live infrastructure failure proven in 361 & 363   |
| Deterministic analytics and saved dashboards            |        10 |                      10 | Implemented and verified; representative real-data acceptance and spatial query plans proven in 361     |
| Governed reports and CSV/PDF exports                    |        10 |                      10 | Implemented and verified; report drafting, frozen evidence, async worker rendering proven in 361       |
| Operations, security verification and production launch |        25 |                      19 | Tooling, verifiers and drills 100% built for both topologies; live production credentials, drills and 11 sign-offs remain operator-owned |
| **Total**                                               |   **100** |                  **94** | **Planning estimate, not release approval**                                                            |

The application rows total 75/75 points (100%), confirming that all application
capabilities defined in [product.md](product.md) for V1 are built and verified.
Optional AI adds no points to the denominator: a complete no-AI path is
required, and the unpaid Gemini preview is excluded from launch.

The Operations row earns 19/25 points, reflecting complete implementation of all
operational tooling, dual-topology preflights, automated drill runners, managed
verifiers, preview deployment verification, snapshot lifecycle management, and
governance checklists across both Compose and Vercel architectures. The remaining
6 points are strictly reserved for external operator actions: target domain DNS,
live production secret injection, Neon production database credentials, live
operational drill execution, and the eleven human sign-offs under Prompt 201.
**Engineering completeness does NOT approve launch.** The unresolved example's
0/11 approvals and 61/70 blockers reflect the state of an unpopulated template,
not 0% engineering progress.

## What is built

The following are implemented in the checked-out code and backed by committed
history. “Built” does not mean deployed or that every phase exit criterion is
currently verified. Historical test results remain historical.

| Capability                                                                                                                 | Inspected implementation and committed basis                                                                                                                                     | Build record                                                                   |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Marketing site, primitives, responsive chrome, motion and accessibility foundation                                         | `client/app/(marketing)/page.tsx`; commits `0723829`, `efb784a`, `41fdc14`, `8e9f644`, `f29f674`, `61f08fc`                                                                      | [landing.md](landing.md), [polish.md](polish.md)                               |
| PostgreSQL/PostGIS, organizations, forced RLS, role policy, versioned REST and read GraphQL                                | `server/prisma/schema.prisma`, `server/src/organizations/permissions.ts`, `server/src/graphql/acres.resolver.ts`; commits `4f34481`, `aaf75fd`, `739b782`, `26d6354`              | [backend.md](backend.md), [build-plan.md](build-plan.md)                       |
| Login, registration, recovery, organization selection, invitations, member management and audit history                    | `client/app/(auth)/`, `client/app/(authenticated)/app/audit/page.tsx`; commits `ea479bf`, `b8f5c6a`, `eaa4dfe`, `32704ab`, `6a63377`, `ea97525`, `0e1be08`                         | [authenticated-app.md](authenticated-app.md)                                   |
| Secure uploads, quarantine/scanning, durable outbox, worker, progress and infrastructure failure resilience               | `server/src/worker/upload-worker.service.ts`, `server/src/outbox/outbox.service.ts`, `server/test/infrastructure-failure.e2e-spec.ts`; commits `ca3bf20`, `f8b573a`, `dd36684`     | [backend.md](backend.md), [ingestion.md](ingestion.md)                         |
| CSV/XLSX/GeoJSON ingestion, mappings, immutable versions and reviewed gbOpen geography adapter                             | `server/src/ingestion/ingestion.service.ts`, `server/src/geography/geoboundaries-provider.ts`; ingestion foundation `f9746a0`, journey acceptance `26d6354`                       | [ingestion.md](ingestion.md), [system-architecture.md](system-architecture.md) |
| Metric definitions, normalized observations, quality, deterministic aggregates and lineage                                 | `server/src/analytics/analytics.service.ts`, analytics schema; commits `deb53f8`, `4d132d1`, `26d6354`                                                                           | [analytics.md](analytics.md)                                                   |
| Regional filters, chart/table/evidence display and saved views                                                             | `client/components/acres/app/dashboard-workspace.tsx`, `server/src/graphql/acres.resolver.ts`; commits `a3de483`, `3912ed3`, `26d6354`                                            | [dashboards.md](dashboards.md)                                                 |
| Draft/review/publish reports, immutable evidence, async CSV/PDF exports and expiry handling                                | `server/src/reports/reports.service.ts`, `client/components/acres/app/report-actions.tsx`; commits `61b847f`, `d4d5cf5`, `cc49667`, `b44842e`, `26d6354`                          | [reports.md](reports.md)                                                       |
| Optional grounded AI draft preview                                                                                         | `server/src/ai/ai.service.ts`, report actions; commit `2646f3f`; disabled by default and excluded from production launch                                                         | [ai.md](ai.md)                                                                 |
| CI, production templates, metrics, dashboards, alerts, backup/restore/reconciliation, security and launch validation tools | `.github/workflows/ci.yml`, `infra/`, `scripts/ops/`; commits `9a2b9e6`, `229e42b`, `5f5e7e3`, `ce7f634`, through `dd36684`                                                      | [operations.md](operations.md), [launch-checklist.md](launch-checklist.md)     |
| Vercel-managed serverless runtime, Neon pooled PostGIS RLS adapter, private Blob storage, and invocation-scoped Nest       | `packages/shared/`, `server/src/`, `vercel.json`; commits `69a1d42` through `f67675d` (Prompts 370–379)                                                                          | [vercel-deployment.md](vercel-deployment.md)                                   |
| Sandbox ClamAV quarantine scanning, candidate lifecycle safety, preview adoption, and 2-snapshot retirement                | `scripts/vercel/`, snapshot `snap_8OP5G2tCUvxtRdoGFMCu5se58f3N`; commits `2d5e449` through `1ef1aa8` (Prompts 383–409)                                                            | [vercel-deployment.md](vercel-deployment.md), [operations.md](operations.md)   |
| Dual-topology operations, managed launch drill verifiers, 7-stage activation plan, and reconciled launch checklist         | `scripts/ops/`, `infra/launch/`, `docs/launch-checklist.md`; commits `83f841c` through `9257025`, `2ad8168`, `5b7eab0` (Prompts 380–382, 410–411)                                  | [launch-checklist.md](launch-checklist.md), [operations.md](operations.md)     |

## Closed V1 engineering and acceptance milestones

All eight engineering and acceptance milestones identified for V1 release
readiness have been implemented, verified, reviewed, and committed to `main`:

1. **Administrative history scope (Prompts 358–360)**:
   - Implemented tenant-scoped `/app/audit` workspace with GraphQL pagination,
     metadata, safe empty/error states, and active organization switching.
   - Verified 9 opt-in loopback proxy browser failure recovery scenarios
     (20/20 combined browser tests, 18/18 concurrent fault cases).
   - Closed global maintenance telemetry disclosure: `/api/v1/jobs/runs`
     denies all tenant roles before reading global scheduler telemetry.

2. **Authoritative end-to-end data journey (Prompt 361)**:
   - Proved the complete live pipeline across PostgreSQL/PostGIS under forced
     RLS in `server/test/data-journey.e2e-spec.ts` (11/11 phases verified).
   - Seeding PostGIS polygon geography with spatial GiST lookup; multi-tenant
     Org A/B setup; upload buffer storage, checksum validation, and worker
     acceptance; ingestion publication and deterministic metrics/observations/
     aggregates/lineage; saved dashboard views; governed report drafting, evidence
     freezing, and publication; asynchronous export rendering and artifact
     download; and complete cross-tenant RLS isolation and RBAC denials.

3. **Release verification refresh and triage (Prompt 362)**:
   - OpenAPI and GraphQL SDL drift check passes with 0 drift.
   - Lint and typecheck pass with 0 errors or warnings across all 3 workspaces.
   - Production build passes for all workspaces (Next.js 23/23 routes).
   - Server unit test suite passes 120/120 suites and 1876/1876 tests.
   - Real PostgreSQL/PostGIS database E2E suite passes 7/7 suites, 146/146 tests.
   - Query plan gates pass for analytics (6/6 plans) and geography (2/2 plans).
   - Client Playwright browser suite passes 85/85 tests across 3 viewports.
   - Operations preflight (`ops:check`) passes all 33 offline stages and 27 suites.

4. **Infrastructure-level failure acceptance (Prompt 363)**:
   - Accepted live infrastructure failure suite in
     `server/test/infrastructure-failure.e2e-spec.ts` (13/13 tests, 8/8 real DB
     suites, 159/159 tests under forced RLS).
   - ClamAV fail-closed rejection on socket connection refusal and timeout;
     virus signature isolation without leaking raw virus names into public
     columns or dead-letter messages.
   - Storage buffer missing rejection and S3 network error sanitization
     ("Upload processing failed unexpectedly.") preventing endpoint or stack leaks.
   - Valkey queue dispatch retry backoff and dead-letter exhaustion logging.
   - Worker crash lock-lease expiration reclamation via `FOR UPDATE SKIP LOCKED`.
   - Parser failure transactional rollback ensuring zero partial records committed.
   - Deterministic object/database parity reconciliation detecting missing
     objects, orphans, and checksum mismatches.

5. **Managed platform architecture and serverless adapters (Prompts 370–379)**:
   - Implemented Neon pooled connection adapter under forced RLS (`DATABASE_URL`,
     `DATABASE_MIGRATOR_URL`), supporting serverless connection scale.
   - Implemented private Vercel Blob adapter with quarantine container isolation,
     pre-signed client upload tokens, and authenticated streaming downloads.
   - Implemented invocation-scoped Nest serverless execution adapter with fast
     lifecycle bootstrap, request isolation, and graceful database pool drainage.
   - Implemented protected Vercel Cron dispatch with timing-safe header verification.
   - Implemented transactional outbox with durable background job reconciliation.
   - Implemented Resend email provider transport with verified sender headers.

6. **Dual-architecture operations and managed verifier suite (Prompts 380–382)**:
   - Implemented managed operator handoff template (`infra/launch/operator-handoff.vercel.example.md`)
     and managed readiness template (`infra/launch/readiness.vercel.example.json`).
   - Branched unified launch drill orchestrator (`scripts/ops/run-launch-drills.sh`)
     to support `--target-architecture vercel-managed-production`.
   - Implemented four dedicated managed verifiers with 100% passing test coverage (28/28 tests in `npm run ops:managed-drills-test`):
     - `verify-managed-ingress.js`: validates `vercel.json` routing hierarchy, cron precedence, and security headers.
     - `verify-managed-volume-encryption.js`: validates Neon KMS storage encryption, Blob encryption, and Firecracker RAM isolation.
     - `verify-managed-secret-rotation.js`: validates 90-day rotation bounds and zero development credentials.
     - `verify-managed-restore-drill.js`: validates Neon WAL streaming PITR (7-day window, RTO/RPO limits) and Blob durability.

7. **Preview deployment, sandboxed scanning and candidate adoption (Prompts 383–398, 403–408)**:
   - Deployed and verified live isolated preview environment (`dpl_AGwu9k8gbtQRegTodmHUAL7uxYs4`).
   - Implemented and verified Firecracker Sandbox ClamAV quarantine scanning: proven with
     authentic live receipts for EICAR malware rejection (fail-closed) and clean upload acceptance.
   - Verified complete multi-tenant RLS isolation in the live cloud environment.
   - Completed guarded candidate adoption of active ClamAV snapshot `snap_8OP5G2tCUvxtRdoGFMCu5se58f3N`.

8. **Snapshot retirement, managed activation plan and checklist reconciliation (Prompts 409–411)**:
   - Executed Tier 2 snapshot retirement (`scripts/vercel/retire-scanner-snapshots.js`),
     deleting expired snapshots and reclaiming ~922 MB while securing a steady-state 2-snapshot baseline.
   - Formulated formal 7-stage Managed Production Activation Plan (Prompt 410) and audited
     all 61 blockers in `infra/launch/readiness.vercel.example.json`.
   - Reconciled `docs/launch-checklist.md` (Prompt 411) with dual-topology category contracts (§3),
     authoritative 61-blocker managed preflight gap register (§6A), and dual-profile sign-off matrix (§7).

All engineering capabilities and automated acceptance criteria for V1 are
closed for both architectures. The remaining work for production launch is operator-owned.

## Operator-owned launch work

Acres supports two distinct production profiles. Both profiles share identical
application logic, forced tenant RLS, database-backed auth, and deterministic
data processing, but require distinct infrastructure inputs, verifier commands,
and operational evidence:

- **Profile A (`single-host-compose-caddy`)**: Single-host Docker Compose with Caddy reverse proxy,
  separate API/worker processes, Valkey queue, MinIO/Garage object storage, and ClamAV daemon.
  Readiness is tracked in `infra/launch/readiness.example.json` (70 unresolved blockers).
- **Profile B (`vercel-managed-production`)**: Vercel serverless compute/routing, Neon PostgreSQL/PostGIS,
  private Vercel Blob storage, Resend SMTP, and Firecracker Sandbox ClamAV scanning.
  Readiness is tracked in `infra/launch/readiness.vercel.example.json` (61 unresolved blockers).

All eleven categories in both checked-in example templates remain unresolved. The
[launch checklist](launch-checklist.md) owns the exact child-report schemas,
independent live-source inspection and sign-offs; this table is a handoff index.

| Required category             | Profile A: Compose+Caddy Requirement                                  | Profile B: Vercel-Managed Requirement                                   | Owner                             |
| ----------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------- |
| Production domain and TLS     | Custom domain, DNS, Caddy automated TLS, headers & HSTS decision       | Custom FQDN, Vercel Edge TLS, `verify-managed-ingress.js`, HSTS decision | Ops lead                          |
| SMTP delivery                 | Host SMTP / relay credentials, SPF/DKIM/DMARC, delivery receipt       | Resend sender domain verification, DKIM/SPF alignment, delivery receipt | Ops lead                          |
| Secrets management            | Host runtime secret injection, masking, rotation & compromise plan    | Vercel Project Production Env + Neon role secrets, 90-day rotation plan | Security lead                     |
| Secret references             | 12 distinct Compose indirect names verified via `scan-secrets.sh`     | 7 managed indirect keys verified via `scan-secrets.sh` (zero raw secrets)| Security lead                     |
| SLOs, alerting and capacity   | Adopt objectives; Prometheus scrape targets, alert rules & delivery   | Adopt objectives; Vercel analytics, 11 Prometheus alert rules & webhook | SRE/on-call                       |
| Backups and disaster recovery | Off-host encrypted pg_dump, isolated restore drill, Garage reconcile  | Neon WAL streaming PITR (7-day window, RPO ≤1h, RTO ≤4h) + Blob reconcile| SRE                               |
| Data retention                | Signed retention policies (accounts, audit, reports), cleanup jobs    | Signed retention policies (accounts, audit, reports), cleanup jobs     | Legal and ops                     |
| Volume encryption             | 9 stateful host mounts, separated keys, custody and tested recovery   | Neon AWS KMS AES-256 storage, Blob at-rest encryption, Firecracker RAM | Security/infrastructure/key owner |
| GraphQL introspection         | Approved production policy and actual ingress route probe             | Approved production policy and actual ingress route probe               | Security lead                     |
| Deployment and rollback       | Immutable client/server Docker image digests and live deployment drill| Immutable Vercel deployment ID pair (`dpl_*`) and instant rollback      | Release manager/approver          |
| No-AI production posture      | API/worker configuration, absent Gemini key and deterministic journeys| `AI_DRAFT_ENABLED=false`, absent Gemini key and deterministic journeys | Product/security                  |

The safe order is: close known V1 engineering gaps and choose the candidate;
identify the target topology, owners and policies; materialize infrastructure and
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

Prompt 412 changes documentation and release governance records only. Code,
route inventory, schema, CI, verifiers, test suites, and git history were inspected;
no live production services or private operator evidence were accessed.

The read-only example readiness assessments report:
- **`single-host-compose-caddy`**: 0 approved, 11 unresolved categories, and 70 blockers (`infra/launch/readiness.example.json`).
- **`vercel-managed-production`**: 0 approved, 11 unresolved categories, and 61 blockers (`infra/launch/readiness.vercel.example.json`).

Both assessments intentionally fail closed. Root format/lint/build/typecheck,
managed verifier tests (28/28 passed), and operations preflights are verified
with actual output recorded in [operations.md](operations.md) and [vercel-deployment.md](vercel-deployment.md).
While full automated test suites (Next.js 23/23 routes, 120 server unit suites,
real PostgreSQL/PostGIS database journeys under forced RLS, and operations drill suites)
have been verified on the candidate, no production environment deployment,
live cluster drill, or operator sign-off is claimed.

To reproduce the repository-visible release decisions:

```bash
# Check Compose reference readiness (fails closed: 70 blockers)
node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json

# Check Vercel managed readiness (fails closed: 61 blockers)
scripts/ops/launch-readiness.sh --target-architecture vercel-managed-production infra/launch/readiness.vercel.example.json
```

A failing example is expected in both cases. Completion requires the operator-owned record
and authentic evidence, not editing the examples to make their checkers green.
