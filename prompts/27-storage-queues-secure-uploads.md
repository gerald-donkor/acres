# 27 - storage, queues, worker, and secure uploads

## Scope, and why it is next

The committed repository is on `main` at `c5486bf` (`fix(auth): remove entry status ledger`).
`docs/build-plan.md` records Phases 3 and 4 as implemented, and
`docs/authenticated-app.md` records the first Phase 5 authenticated shell as
implemented. The earliest ordered target whose backend prerequisites are
committed is Phase 6, "storage, queues, worker, and secure uploads."

Implement Phase 6 as the storage and background-processing foundation that
later geography ingestion, exports, and reports need:

- add local Compose services for private Valkey, Garage, and ClamAV alongside
  the existing PostgreSQL/PostGIS service;
- add boot-time validated API and worker configuration for queue, object
  storage, scanner, upload limits, retry limits, cleanup windows, and dependency
  readiness;
- add Prisma schema and reviewed SQL migrations for organization-scoped
  `StoredObject`, `Upload`, `OutboxEvent`, durable job/progress/dead-letter
  state, and any required join/support tables;
- add RLS policies and negative tests for every tenant-owned storage, upload,
  outbox, and job row;
- add an object-storage port with a Garage/S3-compatible adapter and a test
  adapter; browser code must never receive storage administrator credentials;
- add a queue port with a Valkey/BullMQ adapter and a deterministic job identity
  strategy, while preserving PostgreSQL as the authoritative ledger;
- add a separately runnable Nest worker entry point and scripts that can claim
  outbox rows, enqueue/retry jobs, scan completed uploads, record stage
  progress, write visible dead-letter records, reconcile orphans, and drain
  gracefully;
- add REST `/api/v1` upload/status/cancel routes, an authorized progress SSE
  route, and attachment download/status behavior for accepted objects;
- add real integration coverage for signed upload completion, tamper/cross-org
  negatives, scanner failure, duplicate delivery, retry/dead-letter, restart,
  cancellation, SSE reconnect, and reconciliation;
- update the generated OpenAPI/contract docs and the backend/security/system
  build records.

This phase must not parse CSV, XLSX, or GeoJSON into product datasets. The
worker may inspect object metadata and scan bytes, then mark an upload
`accepted` for the future ingestion phase. Mapping, validation, normalization,
analytics, dashboards, reports, exports, optional AI, Caddy production routing,
and launch operations remain later phases.

## Reference material read while preparing this prompt

Repository and product authority:

- `AGENTS.md` §§2, 2.1, 5, 6, 8.2, 9, and 10: phase-control workflow, prompt
  contract, checks, build sequence, server/client standing rules, and no
  fabrication.
- `docs/build-plan.md` §§1, 7, and 14: Phase 6 dependency, outcome, non-goals,
  security cases, tests, observability, rollback, documentation owners, skill
  manifest, and sequence gates.
- `docs/backend.md` §§1-4, 12-14: current Nest/Prisma/package state, scripts,
  route/envelope/session behavior, deferred storage/worker state, current-to-
  target bridge, and organization route/permission facts.
- `docs/authenticated-app.md`: current Phase 5 client/backend bridge and the
  explicit absence of uploads, workers, storage, metrics, reports, and exports.
- `docs/api/contracts.md`: current canonical REST and GraphQL matrix. Phase 6
  must update it only through `npm run contracts:generate` after route changes.
- `docs/product.md` §§1-7: B2B regional analytics product, role ladder, upload
  journey, V1 boundary, data classes, success criteria, and open retention/
  upload-limit decisions.
- `docs/system-architecture.md` §§2-5, 6.1-6.2, 7, 8, 9, 11, and 12: modular
  monolith, API/worker split, same-origin storage boundary, target data model,
  RLS/worker identity, REST/SSE split, upload/queue state machine, secrets,
  shutdown, backup, observability, and deferred decisions.
- `docs/security.md` §§1-10: current controls, target upload/storage/queue/
  worker boundaries, TM-06/TM-08/TM-11/TM-12/TM-15/TM-20/TM-21, acceptance
  suite, and critical review paths.

Current implementation inspected:

- `docker-compose.yml`: only `postgres` exists; Valkey, Garage, and ClamAV are
  absent.
- `package.json` and `server/package.json`: root/server scripts, absence of a
  worker script, and current dependency graph.
- `server/prisma/schema.prisma` and `server/prisma/migrations/*`: current schema
  has identity, organizations, audit, idempotency, public regions, and a simple
  `JobRun`; upload/object/outbox tables are absent.
- `server/src/app.module.ts`, `server/src/jobs/*`,
  `server/src/config/env.validation.ts`,
  `server/src/config/acres-config.service.ts`,
  `server/src/organizations/permissions.ts`, and
  `server/src/organizations/permission.guard.ts`: module wiring, job read side,
  config validation style, and centralized organization permission pattern.
- `server/test/api.e2e-spec.ts` and existing test helpers: current server e2e
  style and Prisma-double tests. Phase 6 boundary tests must also use real
  PostgreSQL and real dependency services where they prove storage/queue/scanner
  behavior.
- `packages/shared/src/*`: current shared envelope, route DTO, and job contract
  exports.

Skills loaded while preparing this prompt:

- `architecture-patterns`: use cases and ports/adapters; controllers stay thin.
- `nestjs-best-practices`: feature modules, DI tokens, repository/transaction
  boundaries, validation, guards, tests, health, queues, and graceful shutdown.
- `api-design-principles`: resource-oriented REST, status codes, versioning,
  stable errors, idempotency, and documentation.
- `security-best-practices`: Express/Next/frontend secure defaults; no secrets
  in logs/client bundles, validate all untrusted input, preserve CSRF/authz,
  safe file handling, and redacted errors.
- `security-threat-model`: repository-grounded trust boundaries, assets, abuse
  paths, and mitigations.
- `error-handling-patterns`: classify dependency, validation/security,
  retryable, terminal, cancellation, and dead-letter failures explicitly.
- `postgres-best-practices`: UUID public IDs, `timestamptz`, meaningful type
  constraints, and reviewed schema design.
- `sql-optimization-patterns`: indexes for outbox claiming, cleanup, status
  lists, and cross-tenant negatives; verify representative query plans where
  polling/cleanup paths are added.
- `javascript-testing-patterns` and `e2e-testing-patterns`: focused unit,
  integration, and end-to-end coverage.
- `secrets-management`: environment-only secrets, per-service credentials,
  masking, least privilege, and rotation documentation.
- `requesting-code-review`, `receiving-code-review`, and `caveman-commit`:
  mandatory review and final local commit workflow.

## SKILLS USED

- `architecture-patterns` - design upload, outbox, storage, queue, scanner, and
  worker code as module-owned use cases behind ports/adapters.
- `nestjs-best-practices` - implement Nest modules, DI tokens, controller
  guards, worker bootstrap, health/readiness, tests, and graceful shutdown.
- `api-design-principles` - design versioned upload/status/cancel/SSE/download
  REST routes with stable envelopes, errors, and idempotency semantics.
- `security-best-practices` - keep upload, storage, queue, and logging secure by
  default for the JavaScript/TypeScript/Express/Next stack.
- `security-threat-model` - update and validate the new storage/queue/worker
  trust boundaries, assets, abuse paths, and mitigations.
- `error-handling-patterns` - classify retryable dependency failures,
  validation/security terminal failures, cancellation, and dead-letter states.
- `javascript-testing-patterns` - add focused unit and integration tests for
  DTOs, ports, state transitions, idempotency, and failure classification.
- `e2e-testing-patterns` - add real end-to-end tests for upload, worker,
  restart/retry, SSE, cancellation, and reconciliation paths.
- `secrets-management` - add environment contracts for Garage, Valkey, scanner,
  signing, and worker credentials without committing secrets or leaking them.
- `postgres-best-practices` - design upload/object/outbox/job schema, indexes,
  timestamps, constraints, RLS policies, and migrations.
- `sql-optimization-patterns` - verify outbox polling, status, cleanup, and
  reconciliation query shapes and indexes.
- `openapi-spec-generation` - regenerate and check OpenAPI/contract artifacts
  for the new REST/SSE routes if Swagger route decorators change.
- `requesting-code-review` - dispatch the mandatory reviewer subagent after
  self-verification.
- `receiving-code-review` - verify and act on reviewer feedback with technical
  rigor.
- `caveman-commit` - write the final Conventional Commit message for the local
  commit.

Conditional skills deliberately not used unless scope changes:

- `frontend-design`, `tailwind-design-system`, `tailwind-4-docs`, `shadcn`,
  `vercel-react-best-practices`, `web-design-guidelines`,
  `accessibility-compliance`, `playwright`, and frontend GSAP/View Transition
  skills are not required unless implementation adds a browser upload UI. This
  prompt should avoid that; Phase 6 can be proven through API/worker tests.
- `prometheus-configuration` is not required unless this prompt adds an actual
  Prometheus metrics endpoint or scrape config. Redacted logs, readiness
  details, and queryable job/dead-letter state are sufficient for this phase.
- `deployment-pipeline-design`, `github-actions-templates`, and
  `sast-configuration` are not required unless CI/deployment/scanner workflows
  are materially changed beyond existing build/test coverage.

## Required external/API verification before implementation

Before writing code, re-read `AGENTS.md`, this prompt, the docs listed above,
and every skill named in `SKILLS USED`.

Then verify current APIs from primary/local sources:

- package versions and peer constraints for BullMQ, `ioredis` or the selected
  BullMQ Redis client path, AWS SDK S3-compatible signing packages, and any
  ClamAV client package. Do not install a package from memory.
- NestJS queue/SSE/lifecycle guidance from the installed package docs or
  official Nest docs. If official docs are fetched, use the current source and
  cite it in `docs/backend.md`.
- Prisma 7 migration and generated-client behavior from local `node_modules`
  before editing `schema.prisma` or generated-contract scripts.
- Garage S3 compatibility, required env, and local Compose setup from Garage
  primary docs; record the exact image/version chosen and its license/source in
  `docs/backend.md`.
- Valkey image/version, authentication, persistence, and `noeviction` config
  from Valkey primary docs; record the exact image/version.
- ClamAV image/version, scanner protocol/client, timeout behavior, and signature
  volume/update expectations from primary docs; record the exact image/version.

If any dependency cannot be verified from local files or live primary docs,
stop and state the gap instead of guessing.

## Target architecture and implementation details

### Dependency and environment setup

Add only packages required for Phase 6. Expected candidates include a BullMQ
queue package, a Redis/Valkey client if BullMQ requires one explicitly, an
S3-compatible client/presigner, and a ClamAV scanner client only if it is
maintained and compatible. Prefer small, maintained packages with no install
scripts where possible; document any audit/deprecation findings as `docs/backend.md`
does for Prisma/Apollo.

Update:

- root scripts for dependency startup if needed, keeping `db:up`, `db:down`,
  and `db:reset` behavior clear;
- server scripts for `start:worker`, `start:worker:dev`, worker build/start
  behavior, and any focused test script that actually exists;
- `server/.env.example` with placeholder-free non-secret examples and obvious
  `change-me` placeholders for secrets;
- `server/src/config/env.validation.ts` and
  `server/src/config/acres-config.service.ts` with typed validated values.

Required config groups:

- `VALKEY_URL` or explicit host/port/password/db/TLS fields;
- BullMQ queue name/prefix, default attempts, backoff, stall/graceful-shutdown
  settings, and dead-letter retention;
- Garage/S3 endpoint, region, bucket names/prefixes, access key, secret key,
  force path style, presigned upload TTL, and accepted-download TTL;
- ClamAV host/port or socket, scan timeout, and fail-closed behavior;
- upload byte limit, accepted media types/extensions for CSV/XLSX/GeoJSON, and
  checksum algorithm;
- stale upload expiry, cleanup/reconciliation interval, outbox claim batch size,
  claim lease, and max attempts.

Business/open values from `docs/product.md` and `docs/system-architecture.md`
remain launch decisions. For implementation and tests, use conservative
development defaults that are explicitly documented as temporary safety limits,
not product policy. Do not claim they are customer limits.

### Compose services

Extend `docker-compose.yml` with:

- Valkey private service, password/auth enabled, persistence configured,
  `maxmemory-policy noeviction`, healthcheck, and no public admin exposure
  beyond local developer ports required to run tests;
- Garage private service with local data/meta volumes, a setup/init path for
  buckets/keys if Garage requires it, healthcheck/readiness, and a comment that
  the local volume is disposable while production Garage volume encryption is a
  target contract;
- ClamAV private service with signature/cache volume and healthcheck.

Do not introduce Caddy, Prometheus, Grafana, SMTP, AI, Kubernetes, Terraform, or
cloud-managed dependencies in this prompt.

### Data model and migrations

Add Prisma models and reviewed SQL migration(s) for at least:

- `StoredObject`: organization ID, opaque object key, bucket/prefix, original
  filename metadata, media type, detected type if known, byte count, checksum,
  lifecycle state, timestamps, and relation to the upload or later artifact
  owner. Raw filenames must never become keys.
- `Upload`: organization ID, actor account ID, stored object ID, state, declared
  filename/type/size, completion metadata, scan outcome, cancellation/expiry
  timestamps, last error class/code, version or state revision, and indexes for
  organization status lists and stale cleanup.
- `OutboxEvent`: organization ID when tenant-owned, event type, aggregate
  identity/version, payload containing IDs only, state, lock/lease, attempts,
  next attempt, last error code, created/updated timestamps, and unique
  constraints that make dispatch idempotent.
- durable job/dead-letter/progress state. Either extend `JobRun` compatibly or
  introduce a new model; preserve existing `/api/v1/jobs/runs` behavior or
  intentionally migrate it and update docs/contracts/tests.

Rules:

- use UUIDv7 public IDs, `timestamptz`, typed enum states, and meaningful
  constraints;
- index every claim/status/cleanup/cross-tenant path used by application code;
- enable and force RLS on new tenant tables, with default-deny when
  `acres.organization_id` is absent;
- grant runtime/API/worker roles the least privileges needed and keep owner/
  migrator privileges out of runtime;
- use transaction-local tenant context for tenant operations, including worker
  jobs; any system reconciliation path must be allowlisted and audited;
- add catalog tests proving RLS is enabled/forced and runtime roles cannot
  update/delete audit-like history or bypass tenant policy.

### Server modules and ports

Use feature modules and explicit ports:

- `storage` module: object storage port, S3/Garage adapter, test adapter,
  presign/upload HEAD/stat/delete/reconcile operations, and safe attachment
  response metadata.
- `uploads` or `ingestion/uploads` module: upload initiate, complete, cancel,
  status, authorization, state machine, checksum/type/size checks, and API DTOs.
- `outbox` module: transactional event append, claim, mark dispatched/retry/
  dead-letter, and reconciliation service.
- `queue` module: BullMQ/Valkey adapter, deterministic job IDs, identifier-only
  payloads, retry/backoff/dead-letter strategy, and drain.
- `scanner` module: ClamAV adapter and test adapter; scan-before-accept,
  timeout/unavailable fail closed, and bounded error codes.
- `worker` entry/module: imports only the application modules required to
  dispatch and process jobs; no HTTP controller bootstrap.

Controllers parse HTTP/SSE and call application services. Domain state
transitions and Prisma queries do not live in controllers, resolvers, queue
processors, or adapters.

### REST and SSE contracts

Design the canonical route names before coding, then implement and regenerate
contracts. Expected shape:

- `POST /api/v1/uploads` - session + CSRF + organization permission +
  `Idempotency-Key`; creates an upload and returns upload ID, object metadata,
  presigned upload URL, required method/headers, expiry, and completion
  contract.
- `POST /api/v1/uploads/:uploadId/complete` - session + CSRF + organization
  permission + `Idempotency-Key`; verifies DB ownership/state, object existence,
  checksum/size/type, records completion, and writes an outbox event in the same
  transaction.
- `GET /api/v1/uploads/:uploadId` - session + organization permission; returns
  durable state/progress and safe failure details.
- `DELETE /api/v1/uploads/:uploadId` or
  `POST /api/v1/uploads/:uploadId/cancel` - session + CSRF + organization
  permission; records cancellation and makes worker processing stop at a safe
  checkpoint.
- `GET /api/v1/uploads/:uploadId/events` - session + organization permission;
  SSE stream for bounded progress. Durable state lives in PostgreSQL; losing an
  SSE client must not lose progress.
- accepted object download/status route if required to prove attachment
  download. Serve as an attachment with safe content type/disposition; do not
  inline untrusted user-uploaded content.

Choose or add central permissions through `server/src/organizations/permissions.ts`.
At minimum, analysts/admins/owners should be able to create and manage uploads;
viewers should not be able to create/cancel uploads unless the product docs are
updated with that decision. Do not scatter role-string comparisons.

CSRF stays required for state-changing routes. Idempotency keys are required
for duplicate-producing commands. Errors use existing envelope codes where they
fit; add shared stable codes only when necessary and update every consumer/test.

### Worker behavior

The worker must:

- start as a separate process with its own bootstrap and shutdown hooks;
- fail readiness when required dependencies for worker work are unavailable;
- claim outbox rows with leases/attempt limits and enqueue deterministic BullMQ
  jobs;
- process identifier-only payloads and re-read authoritative DB state before
  each state transition;
- scan completed quarantined uploads before marking them accepted;
- classify scanner unavailable/timeout as fail-closed and retryable or terminal
  according to the recorded policy;
- detect cancellation before starting and between stages;
- mark exhausted or poison work as visible dead-letter state;
- reconcile DB/object/outbox mismatches and stale uploads on an auditable
  schedule;
- drain gracefully without starting new work after shutdown begins.

Do not implement CSV/XLSX/GeoJSON parsing, mapping, validation, normalization,
aggregation, or dataset publication in this phase.

## Expected impact

Routes:

- add upload/status/cancel/SSE/download REST routes under `/api/v1`;
- update `docs/api/contracts.md`, `docs/api/openapi.json`, and any route matrix
  generated by the contract script;
- keep `/graphql` read-only and avoid GraphQL upload mutations/subscriptions;
- preserve existing auth, organizations, regions, forms, jobs, and client shell
  behavior.

Infrastructure:

- local Compose gains Valkey, Garage, and ClamAV;
- API readiness distinguishes unavailable DB, storage, queue, and scanner only
  according to what the process needs;
- worker readiness is separate from API liveness/readiness;
- root and server scripts document how to start API, worker, and dependencies.

Database:

- new tenant-owned tables inherit the organization/RLS contract;
- migrations are additive and forward-fix oriented;
- existing routes and tests continue to pass.

Docs:

- update `docs/backend.md` with exact package versions, services, env contract,
  route map, schema/migration/RLS state, worker behavior, tests, and verification
  output;
- update `docs/system-architecture.md` current-state rows for Phase 6 pieces
  that are actually implemented;
- update `docs/security.md` for the newly introduced storage/queue/scanner/
  worker boundaries and acceptance coverage;
- add a storage/queue/worker runbook document if the implementation detail no
  longer fits cleanly in `docs/backend.md`, and add its row to `AGENTS.md` in
  the same change.

## Non-goals

- no browser upload UI, marketing-page change, app dashboard, chart, report, or
  design-system work;
- no geography/provider data, CSV/XLSX/GeoJSON parser, mapping UI, validation
  issue model, normalized observations, analytics, aggregates, saved views, or
  dataset publication;
- no GraphQL mutations/subscriptions or read-model expansion;
- no public connector, webhook, SSRF-capable URL import, SMTP, billing, SSO,
  SCIM, custom roles, public sharing, AI, Caddy production topology, backup
  system, Prometheus/Grafana stack, SAST rollout, Kubernetes, Terraform, or cloud
  provider selection;
- no production upload limits, retention periods, SLOs, RPO/RTO, or alert
  thresholds beyond temporary documented development/test safety defaults.

## Verification plan

Run and quote real output for each applicable command. If local Docker/Compose
is unavailable, state that exactly and still run all checks that do not require
containers.

Required self-verification:

- `git status --short` before editing and before finishing; do not stage or
  modify unrelated pre-existing work such as any untracked prompt file from a
  prior turn;
- dependency/version/audit review after install, including `npm audit` result
  and any accepted advisory rationale;
- `npm run build:shared`;
- `npm run lint`;
- `npm run typecheck`;
- `npm run build`;
- `npm run test:server`;
- `npm run contracts:check`;
- real PostgreSQL migration checks: validate, apply from empty DB, status, and
  drift/rebuild procedure already used in Phase 2 docs;
- real dependency integration tests for Garage, Valkey/BullMQ, and ClamAV when
  Compose is available;
- API/worker restart, duplicate delivery, dead-letter, cancellation, SSE
  disconnect/reconnect, orphan cleanup, and cross-tenant negative tests;
- `git diff --check`;
- final `git diff --stat` and targeted diff review.

Review and commit:

- after all self-checks pass, use `requesting-code-review` to dispatch a
  reviewer subagent with the prompt requirements, `BASE_SHA`, `HEAD_SHA`, files
  changed, and checks run;
- use `receiving-code-review` to verify every finding before fixing it;
- request follow-up review if feedback changes architecture, public API,
  schema/RLS, worker behavior, storage/queue semantics, or security boundaries;
- update docs with the exact verification log before the final commit;
- use `caveman-commit` for the commit message and commit locally to `main`;
- do not push.
