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

1. **Complete administrative history access.** Product journey 3.9 requires
   administrators to inspect audit history. Audit persistence and the permissioned
   `organizationAuditEvents` GraphQL query exist in
   `server/src/organizations/audit.service.ts` and
   `server/src/graphql/acres.resolver.ts`. `server/src/jobs/jobs.controller.ts`
   exposes owner/admin job runs. The current app navigation and route inventory
   provide workspace, datasets, dashboards, reports and members, with no dedicated
   audit/job history interface or matching API-client helpers. Ingestion/export
   progress already exists; do not rebuild it. Plan a scoped admin history
   surface with tenant/permission checks, pagination, safe details, accessible
   states and browser acceptance. A unified job console beyond V1 needs a
   separate scope decision.
2. **Prove the real end-to-end data journey on the release candidate.** Use a
   licensed, reviewed geography selection and representative accepted source
   files; run upload → actual scanner/storage/queue → mapping → immutable
   publication → analytics → saved view → report review/publish → CSV/PDF
   attachment download. Include a second tenant and analyst/viewer denials.
   Acceptance requires reproducible lineage and no partial publication. Existing
   `client/e2e/product-journeys.spec.ts` and
   `client/e2e/multi-tenant-isolation.spec.ts` include mocked summaries and
   intercepted product responses; their historical passes cannot prove this
   whole live pipeline. Repair defects found, rather than predeclaring it done.
3. **Refresh release verification and triage real findings.** Run contracts,
   server unit/integration and real PostgreSQL/PostGIS tests, representative
   query plans, browser/accessibility/responsive journeys, operations checks and
   dependency/SAST/container/license checks against the selected candidate.
   Record environment, actual commands and failures; resolve launch-blocking
   findings or obtain the explicit acceptance allowed by policy. This assessment
   does not supply a fresh vulnerability count or a full-suite pass.
4. **Finish infrastructure-level failure acceptance.** Exercise actual
   Garage/Valkey/ClamAV outages, API/worker restart, retries/dead letters, backup
   restore and database/object parity in designated isolated environments.
   Parser child-process limits exist; OS-level sandboxing remains an
   infrastructure responsibility in [ingestion.md](ingestion.md). Verify the
   selected runtime containment rather than equating child isolation with a
   network or kernel sandbox. Existing offline reconciliation tests are not
   evidence of live restore or object-byte integrity.

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
