# Prompt 370 — Vercel-managed migration and deployment

## Scope and why this is next

Planning baseline: `aff196a` on `main`. Originally prepared and approved as
Prompt 371; renumbered to 370 on 2026-10-15 at the user’s request after removing
the unused intake prompt and moving the completed handoff package to 369.
The approval remains attached to this migration scope, not its former number.
The user requests implementation and deployment using Vercel only, following
the researched option of Vercel application compute plus
Neon/PostGIS and Resend provisioned through the Vercel Marketplace. There is no
separate VM, Railway, Render, or continuously operated container host in scope.
Marketplace providers remain external processors; do not describe them as
Vercel-operated services or replace that distinction with a marketing label.

This changes Phase 12's production topology and replacement infrastructure
adapters. It does not change the V1 product, fixed roles, tenant isolation,
deterministic analytics, report immutability, or no-AI production requirement.
Implement the migration in the dependency order below, prove it in an isolated
Vercel environment, and deploy the verified application to the selected Vercel
target when access and the launch gates permit. A frontend-only or mocked
deployment is not the requested result. Do not stop at writing an ADR or adding
environment examples when local implementation can proceed.

The platform capability checks below are real gates, especially scanning and
queue routing. If a proof fails, retain the blocker, continue independent local
work, and report precisely which full-product behavior cannot yet be deployed.
Do not remove features or accept unscanned files to manufacture completion.

## References read during planning

- `AGENTS.md`, `client/AGENTS.md`, `docs/build-plan.md` §§13–14,
  `docs/project-status.md`, `docs/skills.md`, `docs/product.md`,
  `docs/system-architecture.md`, `docs/security.md`.
- `docs/backend.md`, `docs/authenticated-app.md`, `docs/ingestion.md`,
  `docs/reports.md`, `docs/operations.md`, `docs/launch-checklist.md` §§6A–7,
  `docs/operator-handoff.md`, and Prompts 367–369 for current launch boundaries.
- Root/client/server package manifests; `server/prisma.config.ts`;
  `server/src/{main.ts,app.module.ts,app.setup.ts,worker.ts}`;
  `server/src/config/{config.module.ts,env.validation.ts,acres-config.service.ts}`;
  modules/ports/adapters under storage, queue, scanner and mail;
  `server/src/worker/{worker.module.ts,upload-worker.service.ts}`;
  `server/src/outbox/outbox.service.ts`, `server/src/prisma/prisma.service.ts`,
  `server/src/security/{security.module.ts,rate-limit.guard.ts}`,
  `server/src/jobs/jobs.module.ts`, uploads controller/service;
  `packages/shared/src/uploads.ts`;
  `client/app/api/v1/[...path]/route.ts`,
  `client/components/acres/app/dataset-actions.tsx`,
  `client/lib/api/{browser.ts,server.ts,sse.ts}`.
- Existing production Compose/Caddy/environment references, readiness
  example/schema/validator; server/test and client/e2e suite inventories.
- Installed Next guides:
  `node_modules/next/dist/docs/01-app/02-guides/deploying-to-platforms.md`,
  `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`.
  Re-read relevant route/config/environment docs before implementing those APIs.

Primary online documentation checked during planning; refresh during execution:

- https://vercel.com/docs/frameworks/backend/nestjs
- https://vercel.com/docs/monorepos
- https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- https://vercel.com/docs/queues and https://vercel.com/docs/workflows
- https://vercel.com/docs/workflows/pricing and https://vercel.com/docs/cron-jobs
- https://vercel.com/docs/vercel-blob/private-storage
- https://vercel.com/docs/vercel-blob/client-upload
- https://vercel.com/docs/sandbox
- https://vercel.com/kb/guide/docker-monolith-workers-vercel
- https://vercel.com/docs/postgres
- https://neon.com/docs/extensions/postgis
- https://neon.com/docs/connect/connection-pooling
- https://resend.com/changelog/vercel-marketplace-integration

Native Nest deployment is supported, but functions are request/invocation scoped.
Queues is Beta in the inspected docs. Workflows supplies durable steps, not an
unlimited runtime for one step. Private Blob is not S3 and cannot transparently
implement the existing signed PUT protocol. Sandbox can run Linux packages, but
ClamAV integration has not been proven. Node 24.x is supported; local Node 26
verification alone is insufficient for the deployment runtime.

## SKILLS USED

- `architecture-patterns` — preserve domain services behind replaceable adapters.
- `architecture-decision-records` — record the requested topology change and consequences.
- `nestjs-best-practices` — modules, provider selection, boot and per-job execution.
- `api-design-principles` — explicit upload transport and internal endpoint boundaries.
- `openapi-spec-generation` — regenerate real public contracts after transport changes.
- `auth-implementation-patterns` — cookies, CSRF, internal caller authorization and revocation.
- `neon` — Marketplace database setup only; preserve existing auth, ORM and hosting choice.
- `neon-postgres` — pooled runtime/direct migration connections and Prisma compatibility.
- `neon-postgres-branches` — isolated preview/test data and migration rehearsals.
- `postgres-best-practices` — RLS, transactional publication, roles and concurrency safety.
- `deployment-pipeline-design` — immutable releases, preview validation, promotion and rollback.
- `secrets-management` — scoped runtime injection, OIDC and private evidence custody.
- `security-best-practices` — changed upload, internal execution and ingress boundaries.
- `security-threat-model` — update existing boundary/acceptance documentation from actual code.
- `error-handling-patterns` — durable retries, cancellation, dead letters and safe failures.
- `javascript-testing-patterns` — meaningful adapter and failure-case tests.
- `e2e-testing-patterns` — full product journeys on real managed dependencies.
- `vercel-react-best-practices` — upload transport leaf and authenticated server reads.
- `accessibility-compliance` — preserve upload/progress/error semantics and focus behavior.
- `web-design-guidelines` — verify the changed upload/progress interaction.
- `playwright` — inspect the real deployed application and browser flows.
- `plugin-management:plugin-management` — arrange confirmed Vercel account connection.
- `firecrawl` — official platform documentation; use verified web fallback if CLI remains unavailable.
- `requesting-code-review` — independent review after self-verification.
- `receiving-code-review` — verify feedback and fix valid issues.
- `caveman-commit` — reviewed local commits on main; no push without standalone P.

Load the above before implementation. No dedicated Vercel deployment skill is
currently installed; official docs and the confirmed connector/CLI own its API.
Do not install new skills or alter global tooling merely to bypass a missing
connection. Load any additional owning skill if implementation expands into CI,
Prometheus configuration, visual styling, or shadcn primitive changes.

## Target architecture and implementation decisions

Retain Nest's modular services, Prisma 7 `adapter-pg`, database-backed sessions,
forced RLS, outbox, durable job/progress/dead-letter ledger, and report/analytics
services. Add a selectable Vercel profile alongside the existing local/self-host
profile; do not break the reference stack or delete its tests.

| Existing production role | Vercel deployment role |
| --- | --- |
| Next service + Caddy ingress | Vercel Next deployment and platform routing/TLS |
| Nest API | Native Nest Vercel Function; preserve configured guards/envelopes |
| BullMQ/Valkey worker loop | Authenticated queue callbacks and durable workflow steps |
| Scheduler/timer loops | Protected Cron invocation, database leases, bounded dispatch |
| Garage quarantine/artifacts | Private Blob adapter and explicit browser upload transport |
| PostgreSQL/PostGIS | Marketplace Neon, least-privilege runtime/migrator/worker roles |
| ClamAV daemon | Per-job Sandbox scanner with pinned, fresh signatures |
| SMTP delivery | Marketplace Resend adapter, verified sender/domain |
| Host metrics and recovery checks | Platform/provider-bound evidence with equivalent product gates |

First establish whether the selected account supports web/API/jobs as services
within one Vercel project. Verify routing, bindings, SDK/build integration and
queue topic isolation from actual current docs and a preview. If services cannot
support this safely, use separate Vercel projects with a documented authenticated
dispatch bridge, or package Nest's compiled application context into Node-only
job handlers in the web project. Select the least complex proven arrangement
before wiring production resources. Never assume identical topic names share a
queue across projects; prove producer-to-consumer delivery and preview isolation.
Do not add another non-Vercel compute service as a fallback.

## Ordered implementation

### 1. Record topology and establish deployment access

Re-read the prompt and baseline; preserve unrelated work. Add an architecture
decision under `docs/` following the repository's discovered ADR convention and
`docs/vercel-deployment.md` as the owning implementation/runbook record. Update
the current/target distinction in system architecture and Phase 12 build plan
before runtime changes. Record the user-selected managed topology in AGENTS.md
§8 with the exception to Compose-only production, and add one owning-doc index
row. Keep historical implementation records intact.

A Vercel plugin was discovered but not connected during planning; a suggestion
was issued. No Vercel CLI executable or linked project was found. Check the latest
connection state, then use the confirmed connector or an authenticated, verified
CLI. Do not search credential stores or print tokens. Establish selected team,
project(s), preview/production scope, region, permitted plan/spend, sender domain
and whether any real deployment/data already exists. Ask only for missing facts;
continue local work while connection/target input is pending. Do not create
resources in an arbitrary team, upgrade a plan, purchase a domain, or overwrite
an existing deployment based on guessed identity. Marketplace setup stays through
Vercel; the connected Neon MCP is read-only and cannot provision resources.

### 2. Prove the difficult platform seams in an isolated environment

Use synthetic data and a new isolated database branch/store/topic, never customer
data copied into an unrestricted preview. Before broad migration prove:

- Existing migrations and PostGIS install on the selected Neon version. Runtime
  roles cannot bypass forced RLS; transaction-local organization and worker
  context are cleared across pooled connection reuse. Test two organizations,
  concurrent transactions and rollback. Use direct migrator connection, pooled
  bounded runtime connections, TLS and measured pool capacity.
- Private Blob direct browser upload of a file above the Function request-body
  limit; server-issued narrowly scoped upload authorization; authenticated private
  read; checksum verification; cancellation and deletion. Store SDK tokens only
  server-side. A completed provider callback is not acceptance of a source file.
- An isolated Sandbox executes ClamAV against clean and EICAR samples, enforces
  timeout/memory/byte limits, rejects missing/stale signatures and unavailable
  scanning, cleans temporary data, and stops the sandbox on all outcomes. Verify
  scanner licensing, signature-update method, package/image pinning, network
  policy, selected plan availability and actual resource usage. Do not start a
  persistent database/scanner daemon in a renewing Sandbox loop.
- One real queue/workflow job reaches the correct consumer, survives a duplicate,
  a retry and deployment interruption, and cannot be triggered via a forged public
  request. Confirm source/environment isolation and bounded SDK payloads.

Add reproducible, opt-in integration probes and record results/limits. A scanner
or queue proof failure blocks the related production feature; mocks cannot clear
these gates. Do not pretend provider availability proves application integration.

### 3. Add profile selection and stateless Nest execution

Update `server/src/config/` and storage/queue/scanner/mail modules with explicit
validated provider selections. Defaults retain local adapters. In Vercel mode,
require only its actual configuration, reject mixed/missing credentials and
enforce disabled AI, no Gemini key, scheduler loops disabled and test harness off.
Do not populate unused Valkey/S3/ClamAV-host fields with dummy values to pass boot.

Adapt `server/src/main.ts`, `app.module.ts`, worker composition and jobs module
using the verified Vercel Nest entrypoint. All HTTP security setup in
`app.setup.ts` remains. Never import the executable API/worker bootstrap from a
job handler. Extract request-independent job processing from the BullMQ start/stop
loop into a reusable provider; preserve current process adapters for self-hosting.
Job invocations use bounded lifecycle management and reusable safe pools, without
unawaited work, setInterval, perpetual listeners or application `listen()` in a
workflow step. Add Node 24.x engine/build configuration verified against installed
packages; include shared generation and Prisma generation in clean workspace builds.

### 4. Implement private Blob and the upload contract

Add `server/src/storage/vercel-blob-storage.adapter.ts` after SDK verification.
Preserve exact metadata ownership, SHA-256 verification and object lifecycle in
PostgreSQL. Blob URLs, ETags and client claims are not trusted checksums. Avoid
arbitrary URL fetching: every read resolves a ledger-owned object in the selected
private store, with size limits and no secret-bearing URLs in logs.

Evolve the port and `packages/shared/src/uploads.ts` with an explicit discriminated
upload transport: legacy signed PUT and provider-specific direct Blob upload.
Do not cast the Blob SDK protocol into `PresignedPut`. Update uploads service,
controller/OpenAPI and `client/components/acres/app/dataset-actions.tsx` plus API
helpers accordingly. Validate filename/type/declared size/checksum, bind scoped
token issuance to authenticated tenant/upload, verify callback provenance and
idempotency, and recheck state after upload before accepting completion.
Regenerate contracts rather than editing generated JSON by hand.

Private download must recheck session/organization/permission and accepted or
completed artifact state, use no-store responses and safe attachment names, and
honor expiry and revocation. Never return a broad store token to a browser or
expose quarantined bytes. Prove both small and large attachment delivery within
platform limits; any signed download capability must be narrowly scoped and
document its revocation semantics. Add provider-safe reconciliation and retention
deletion without losing checksum/byte-count guarantees or leaving undetected orphans.

### 5. Replace perpetual processing with durable invocations

Add Vercel queue/workflow adapters under `server/src/queue/` and job entrypoints
under the proven Vercel service layout. Keep messages to opaque job/outbox IDs;
read authority and tenant linkage from PostgreSQL at execution, not caller payload.
Use database leases, deterministic job identities and idempotent effects: provider
deduplication alone is insufficient. Never hold a SQL transaction across a remote
workflow wait, Blob write or Sandbox lifetime.

Preserve outbox transaction-to-dispatch reliability, bounded retry/backoff,
exhaustion into dead letters, lease reclamation, cancellation, terminal-state
guards and safe errors for `upload.completed`, `ingestion.run`, `export.requested`.
Handle duplicate deliveries and crashes after object write but before DB commit.
Chunk/checkpoint work only where it preserves atomic publication: no partial
DatasetVersion, observations, aggregate snapshots or report artifacts visible.
Split heavy parsing/scanning into bounded Sandbox stages where necessary; validate
their output before DB publication and never give a parser broad database secrets.

Replace outbox timers and session/retention schedules with protected Cron handlers
and database coordination. Enqueue bounded work, recover expired leases and never
depend solely on queue retention for the business ledger. Verify queue ordering,
retention, deployment-version routing, and in-flight compatibility. Reuse
deterministic CSV/PDF renderers and immutable frozen report evidence.

### 6. Ingress, mail and distributed security

Configure same-origin `/api/v1/*` and `/graphql` access plus required health routes
through verified platform routes or the existing Next bridge. Server Components
must reach the correct backend without localhost fallbacks or recursive proxy
requests. Test secure cookie issue/rotation/revocation, CSRF/origin behavior,
trusted forwarded headers, deployment protection and SSR authentication. Backend
public ingress must enforce the same guards; a hidden hostname is not protection.
Keep metrics, job callbacks, readiness diagnostics and cron privileged.

Preserve throttling across multiple instances: inspect existing Nest in-memory
throttler storage and replace it for Vercel with a bounded shared implementation
(PostgreSQL-backed atomic counters if no additional Marketplace Redis is selected).
Prove concurrency/expiry/IP attribution and fail-closed behavior on auth routes.
Do not treat the platform firewall as evidence of application identity limits.

Add a Resend mail transport under `server/src/mail/adapters/` with existing mail
templates and safe errors; keep SMTP/memory adapters for local tests. Verify
actual sender/domain requirements through current Marketplace/docs; no unsolicited
emails to third parties. Test real delivery only to an operator-designated address.

Adapt progress streams to platform duration limits with bounded reconnect and/or
continued polling until terminal state, cancellation and component cleanup. The
current single fallback poll is insufficient for jobs that outlive one stream.
Retain role/access checks on every progress read. At 375, 800 and 1280 widths,
retain existing layout, accessible status/error announcements and focus behavior.
No new visual direction, tokens, primitives or marketing copy is required.

### 7. Managed operations and launch evidence

Add versioned Vercel configuration in the actual selected project roots and a
secret-free environment inventory/runbook under `infra/vercel/`. Pin verified
SDK versions and commit lockfile changes. Record immutable deployment/source IDs,
job version compatibility and scanner image/signature identity. Keep migration
credentials out of serving functions and separate preview/prod data, stores,
topics, secrets, sender configuration and evidence records.

Create an explicit topology-discriminated launch-record revision for the managed
profile, with schema/validator tests; reject unknown topology/version. Do not
make the existing nine-mount Compose validator silently accept Vercel receipts.
Keep the eleven category responsibilities but define managed equivalents for
encryption/key management, secret inventory, source/deployment rollback, API and
job telemetry, database capacity, independent backups/restoration, retention and
alert delivery. Do not require fabricated Garage/Valkey secrets or pretend host
mount inspections occurred. Provider documentation alone does not prove account
configuration, restore success or alert routing. Old reference example stays
unresolved and old checks retain their meaning.

Implement reconciliation/backup tooling against the managed adapters and prove
isolated database-and-object recovery within adopted objectives. A snapshot in
the same account is not automatically an independent recovery copy. If the
Vercel-only storage constraint cannot meet an existing recovery requirement,
report that conflict for an explicit decision; do not silently waive the gate.
Retain no-AI verification, GraphQL policy, security headers, scanner health,
dependency triage and operator sign-off. Update architecture/security/runbooks,
operator handoff, launch checklist and build plan with actual new topology and
evidence; do not increase completion scores based only on code or templates.

### 8. Verify, review, commit, deploy and inspect

Run applicable formatter checks on changed code without mass-reformatting history.
Run required gates sequentially and quote actual output:

```bash
npm run contracts:check
npm run lint
npm run typecheck
npm run build
npm run test --workspace=@acres/server -- --runInBand
npm run test:server
npm run test:client:e2e
npm run ops:check
git diff --check
```

Run relevant adapter/integration suites first while iterating. Add root scripts
for new managed-profile checks/probes in the same implementation; only then invoke
their exact names. Preserve the existing real PostgreSQL/PostGIS isolation and
data-journey tests. Test queue forgery, replay, crash/retry/dead-letter/cancel,
checksum/type mismatch, infected files, stale signatures, unsafe paths, revoked
membership, private download expiry, preview cross-talk, pool reuse and publication
rollback. Browser verification must exercise real auth, org switching, CSV/XLSX/
GeoJSON upload, mappings/publication, dashboards, saved views, governed reports,
CSV/PDF export/download and recovery—not the test-harness mock endpoint.

After self-verification dispatch the mandatory independent read-only reviewer
with this prompt, baseline/head SHAs, complete diff, gates and evidence limits.
Evaluate findings with receiving-code-review; fix valid issues, recheck, and
re-review architectural changes. Record results in `docs/vercel-deployment.md`
and owning build records. Commit reviewed work locally on main using caveman-commit;
include only task files and preserve unrelated changes. Do not push implicitly.

Use the selected connected Vercel scope to deploy the exact reviewed source to
an isolated preview, run all provider and browser acceptance there, and verify
serverless configuration/runtime and no mock/test/AI mode. Source deployment
does not require a git push if a supported CLI/connector can deploy local source.
Persist permitted opaque deployment/evidence references only. A preview URL
demonstrates a preview, not production launch or signed acceptance.

The user's request authorizes deployment of the completed migration; do not ask
again for generic deployment permission. Production promotion still needs a
resolved target/release/window/recovery scope and the project’s actual launch
acceptance, rather than guessed values. When all are established within existing
authorization, promote and inspect real production flows. Stop only affected
external steps for missing access, cost/plan decision, failed safety/acceptance
gate or unresolved operator fact; complete independent implementation and report
the exact blocker. Never claim deployed if only a local build or preview exists.

Record actual deployment evidence and review any follow-up documentation diff;
commit remaining approved records locally. Return verified URLs, source/deployment
IDs, checks, remaining operational limitations and exact access/run instructions.

## Non-goals, rollback and completion

No new auth provider, AI enablement, billing system, product redesign, reduced
V1 feature set, non-Vercel compute, arbitrary cloud provider, real customer data
copy, secret disclosure, force push, or external message. No ad hoc production
SQL changes or destructive migration. Approval does not authorize arbitrary
account spend or automatic upgrades.

Rollback uses the previous immutable Vercel deployment(s) with backward-compatible
schema and durable job versions. Pause new dispatch when necessary; do not erase
outbox state or duplicate external effects. For a first deployment, establish a
tested disable-ingress/stop-dispatch/recovery procedure and explicitly resolve
the governing previous-release requirement before production; do not invent a
previous deployment ID. Preserve the self-host profile as a verified local option,
not an unapproved external deployment fallback.

Success requires the whole V1 operating on the selected Vercel-managed target,
real database/storage/jobs/scanning/mail integration, independent verification
and truthful production evidence. Missing access may leave a committed,
locally verified migration with hosted proof pending; label that outcome
incomplete rather than declaring the deployment done.
