# Acres Operator Launch Checklist & Incident Runbooks

Status: Phase 12K implemented from `prompts/67-unified-launch-drill-runner-and-operator-launch-checklist.md`.
This is the Phase 12 exit-gate document mandated by `docs/build-plan.md`:
operator-approved launch checklist, reproducible promotion and rollback,
restore drill within objectives, actionable alerts/runbooks, and no unresolved
critical security/accessibility findings.

## 1. Introduction & Launch Philosophy

Acres launches fail-closed. `scripts/ops/check-launch-readiness.js` rejects the
checked-in `infra/launch/readiness.example.json` template until every one of the
11 categories below is operator-approved with auditable evidence. The stack is
FOSS and self-hostable (PostgreSQL/PostGIS, Valkey, Garage, Caddy, Prometheus,
Grafana); "free" refers to the software, not to infrastructure or operations.
Phase 11A (Gemini free-tier draft preview) is implemented but strictly excluded
from the production launch profile: `ai_enabled: false`,
`AI_DRAFT_ENABLED=false`, no `GEMINI_API_KEY` provisioned, unpaid provider
excluded. Deterministic no-AI journeys are the launch path.

## 2. Launch Governance & Pre-Flight Prerequisites

| role | responsibility |
| --- | --- |
| `deployment_approver` | approves promotion of a pinned, provenance-attested image |
| `rollback_authority` | owns the rollback decision and executes it |
| `key_recovery_owner` | holds volume-encryption recovery material under dual custody |
| on-call alert team | receives the 11 Prometheus alerts and works the runbooks in §5 |

Pre-flight (all must pass before the checklist below):

```bash
npm run ops:check
scripts/ops/launch-readiness.sh [--with-drills] [readiness.json]
bash scripts/ops/run-launch-drills.sh --dry-run
node scripts/ops/check-launch-readiness.js <operator-readiness.json>
```

Copy `infra/launch/readiness.example.json` to an operator-owned record, fill
every `__REQUIRED_*__` placeholder, and never commit literal secrets into it —
the validator fails closed on placeholders, client-exposed secret patterns,
key literals, dev passwords, and raw connection strings with credentials.

## 3. Eleven-Category Launch Readiness Checklist

Each row maps a readiness category to its drill command, evidence artifact,
and acceptance criteria. Mark approved only in the operator readiness record
(`status: "approved"` + non-empty `evidence`); the validator additionally
cross-checks that `.json` evidence paths under `backups/` exist on disk and
do not report failure.

### 1. Production Domain & TLS (`production_domain_tls`)

- Drill/verify: `node scripts/ops/verify-caddy-routing.js <materialized-production-Caddyfile> --allow-hsts --output backups/caddy-routing-evidence-<timestamp>.json`, `scripts/ops/check-production-templates.sh`
- Evidence: `backups/caddy-routing-evidence-<timestamp>.json`, DNS A/AAAA record printout, Caddyfile HSTS approval
- Accept: real (non-localhost) domain, valid TLS contact email, `hsts_approved: true`, boolean `custom_certificates` flag
- An approved record must reference a concrete, successful Caddy routing
  child JSON report in `evidence`. A custom path is accepted by report content,
  not name alone. Its ISO UTC timestamp must be real and no later than validation
  time. Every referenced report must have
  `drill_type: "caddy_routing_and_tls_verification"`, `status: "success"`,
  `valid: true`, an empty `errors` array, `hstsApproved: true`,
  `securityHeadersVerified: true`,
  `s3SigV4HostPreserved: true`, `proxyHeadersVerified: true`, at least 12
  evaluated routes, `routesPassed === routesEvaluated`, and an `evaluatedRoutes`
  array of the same length with every route's `passed` field true. A failed or
  malformed report blocks even alongside a valid one. The unified dossier
  alone, prose, and declarations without child evidence are insufficient.
  The report domain must match the approved domain, and the report must name a
  Caddyfile other than `Caddyfile.example`. The default Stage 3 dry-run report
  verifies the template and cannot support production domain approval. Its
  `hstsApproved` requires active HSTS with a concrete positive `max-age` in
  the parsed file and the explicit `--allow-hsts` flag. Operator approval
  remains the separate `hsts_approved`
  declaration and Caddyfile evidence.
- Fail-closed validator enforcement (`scripts/ops/check-launch-readiness.js`):
  - Requires at least one concrete, successful Caddy routing child report in `evidence` for approved status;
  - Requires `domain` to be a valid FQDN (rejects localhost, 127.0.0.1, IPv4/IPv6, protocols, URIs, ports, paths, or placeholders);
  - Requires `tls_contact_email` to be a valid non-placeholder email address;
  - Requires `hsts_approved === true`;
  - Requires `custom_certificates` to be an explicit boolean (`true` or `false`);
  - Rejects any malformed, future, or failed child report.

**Prompt 205 Category 1 intake — 2026-09-26T20:23:52Z UTC.** Reviewed
`dd1c933` on `main`. The repository contains only
`infra/caddy/Caddyfile.example` and the unresolved
`infra/launch/readiness.example.json`; no materialized production Caddyfile or
Category 1 child report was available for this assessment. The schema test
passed (1/1). The example readiness validator exited 1 as designed: 0 of 11
categories approved, 11 blocked, 70 blockers. This is a repository assessment,
not a claim about an operator's restricted evidence store. Category 1 remains
**unresolved**; no Caddy verifier, public DNS, certificate, live HTTPS, or
production readiness-record check was run against a real target.

The ops lead must provide the selected FQDN, TLS contact, certificate mode,
materialized Caddyfile path, public DNS and certificate evidence, observed live
HTTPS headers, a dated HSTS decision with `max-age`, restricted evidence-store
reference, and named Category 1 signer through the approved operator channel.
Use opaque evidence references; do not place private keys, credentials, or raw
host inventories in the repository. Read-only target access must be identified
before live checks. HSTS activation requires a separate approved change window.
Repository checks: `ops:templates`, lint, typecheck, and `git diff --check`
passed. `ops:check` stopped at `ops:audit` because DNS resolution of
`registry.npmjs.org` returned `EAI_AGAIN`; this is not an audit pass.
`npm run build` failed in Next's TypeScript `--showConfig` parser, while the
direct `tsc --showConfig` output parsed as JSON. Neither failure supplies
production evidence or changes the unresolved Category 1 decision.

**Prompt 239 Category 1 evidence separation (2026-10-01).** Category 1
(`production_domain_tls`) now classifies static Caddy routing verifier output as
simulation preflight (`execution_mode: "simulation"`) and requires a separately
inspected live operator child receipt (`execution_mode: "live"`) when approved:
- `scripts/ops/verify-caddy-routing.js` emits `execution_mode: "simulation"` on both
  success and error payloads. It validates static Caddyfile syntax, reverse proxy
  matchers, transport timeouts, security headers, and S3 SigV4 Host preservation;
  it explicitly disclaims live public DNS resolution, live TLS handshakes, certificate
  chain verification, and live HTTPS response header measurement.
- Stage 3 in `scripts/ops/run-launch-drills.sh` and `scripts/ops/assemble-launch-dossier.js`
  is designated as configuration and routing preflight, validating
  `caddyEvidence.execution_mode === "simulation"`.
- When `status: "approved"`, Category 1 requires:
  1. A live Caddy routing and TLS verification operator receipt (`execution_mode: "live"`)
     with `environment: "production"`.
  2. Trimmed, non-empty, control-free, secret-free references: `operator_reference`,
     `authorization_reference`, and `domain_reference`.
  3. Structured live verification objects:
     - `dns_verification`: `{ status: "passed", verified: true, record_type: string, evidence_reference: string }`.
     - `tls_handshake_verification`: `{ status: "passed", verified: true, certificate_valid: true, protocol: string, evidence_reference: string }`.
     - `https_headers_verification`: `{ status: "passed", verified: true, security_headers_verified: true, evidence_reference: string }`.
  4. Exact domain matching (`report.domain.toLowerCase() === expectedSection.domain.toLowerCase()`).
  5. If `expectedSection.hsts_approved === true`, requires `report.https_headers_verification.hsts_verified === true`.
- Unified launch dossiers are excluded from candidate evaluation (`isCaddyRoutingCandidate`);
  a disguised dossier named as a Caddy child fails validation.
- All referenced Category 1 children must pass structural validation; valid simulations
  may accompany live receipts, but an invalid or malformed child blocks approval even
  beside a valid one.
- Safe diagnostic boundary: Category 1 child file operations suppress private filesystem
  paths, stack traces, and internal child diagnostics, mapping failures to fixed safe
  blocker message `'A referenced Caddy routing report is invalid or failed'`.
- Repository checks for Prompt 239: `ops:caddy-test` (18/18), `ops:launch-drill-test`
  (59/59), `ops:readiness-test` (598/598), `ops:readiness-schema-test` (8/8),
  `ops:templates`, all ops suites, lint, typecheck, build, and `git diff --check`
  passed cleanly. Unresolved example failed closed with 0 approved, 11 blocked, 70 blockers.
- Prompt 248: In `checkEvidenceFileContents`, `validCaddyDossier` now strictly verifies that
  neither `summary.staticIntegrity` nor `summary.staticIntegrityCompliance` is `'failed'`.
  Candidate evaluation (`isCaddyRoutingCandidate`) is evaluated first, followed by dossier and
  static evidence checks, emitting `'A referenced Caddy routing report is invalid or failed'`
  and explicitly terminating inspection with `continue;` to prevent fall-through.

### 2. SMTP Delivery (`smtp_delivery`)

- Drill/verify: test delivery via the configured provider, DKIM/SPF/DMARC DNS checks
- Evidence: a redacted `smtp-delivery-evidence-<timestamp>.json` child report referencing the provider delivery receipt and DNS record printouts
- Accept: provider, host, valid port, `from_address`, credentials secret
  reference, delivery policy, bounce/abuse handling procedure, explicit STARTTLS
  or TLS mode. The credential reference must match `secret_references.smtp_secret_source`.
- An approved record must reference a concrete SMTP child JSON report in
  `evidence`. The report requires `drill_type: "smtp_delivery_verification"`,
  a real nonfuture ISO UTC `timestamp`, `status: "success"`, provider/host/port/
  TLS mode/sender matching the readiness record, and `errors: []`. Its
  `delivery` object requires `status: "delivered"`, an opaque nonempty
  `receipt_id`, and a real nonfuture UTC timestamp. Its `dns` object requires
  a real nonfuture UTC `checked_at` and `spf`, `dkim`, and `dmarc` entries,
  each with `passed: true` and a nonempty printout reference in `record`.
  Every referenced child, including wildcard matches, must pass; prose or a
  dossier alone cannot support approval. Validate the operator record with
  `node scripts/ops/check-launch-readiness.js <operator-readiness.json>`.
  Operators must obtain the delivery receipt and DNS printouts from the live
  provider and public DNS. This validator checks the report's consistency;
  it cannot authenticate a hand-authored report or conduct a live mail test.

**Prompt 206 Category 2 intake — 2026-09-26T20:35:04Z UTC.** Reviewed
`8c3bb6c` on `main`. The repository-visible SMTP material is the unresolved
`infra/launch/readiness.example.json` and validator fixtures; no materialized
production readiness record or SMTP delivery child report was available for
this assessment. This does not establish whether an operator's restricted
evidence store contains either. Category 2 remains **unresolved**. No provider
receipt, controlled-recipient delivery event, public SPF/DKIM/DMARC printout,
message authentication result, runtime configuration, delivery/bounce policy,
or dated ops-lead sign-off was supplied for independent inspection. No live
mail was sent and no DNS or provider configuration was changed.

The **ops lead** must identify the production provider and relay host, port,
transport mode, sender/domain, controlled test recipient, delivery policy,
bounce/abuse procedure, restricted evidence-store location, and named signer
through the approved operator channel. Supply opaque references to a real
delivered receipt, its authentication result, dated SPF/DKIM/DMARC printouts,
the indirect credential source matching `secret_references.smtp_secret_source`,
and dated Category 2 approval. Read-only inspection of those sources is the
next safe action. A new test delivery requires separate authorization naming
the provider, sender, recipient, operator, purpose, and time window. Category
4 can remain unresolved during Category 2 inspection, but the SMTP reference
must match across the two sections. Category 1 and all other launch gates
retain their prior unresolved state.

Repository checks for this intake: `ops:readiness-schema-test` passed (1/1),
`ops:templates` passed, lint and typecheck exited 0, and `git diff --check`
exited 0. The example readiness validator exited 1 as designed: 0 of 11
categories approved, 11 blocked, 70 blockers, including eight Category 2
blockers. `ops:check` stopped at `ops:audit` because DNS lookup of
`registry.npmjs.org` returned `EAI_AGAIN`; the earlier template, image,
secret/default and Docker checks passed. `npm run build` failed during the
client Next 16.3.4 build with `Could not parse output from TypeScript's
--showConfig`. Neither failed check supplies or invalidates live SMTP proof.

**Prompt 240 Category 2 evidence separation (2026-10-01).** Category 2
(`smtp_delivery`) now classifies local/configuration verification as simulation
preflight (`execution_mode: "simulation"`) and requires a separately inspected live
operator child receipt (`execution_mode: "live"`) when approved:
- Structural SMTP delivery child reports require `execution_mode: "simulation" | "live"`.
  Unrecognized, legacy, or missing execution modes fail closed.
- Simulation reports validate structural completeness (drill_type, status, errors,
  matching provider, host, port, tls_mode, and from_address), but cannot approve
  Category 2 on their own (`requireLive: true` fails closed on simulation).
- Live reports require `execution_mode: "live"`, `environment: "production"`, and
  trimmed nonempty opaque audit references (`operator_reference`,
  `authorization_reference`, `provider_reference`).
- The `delivery` verification requires `status: "delivered"`, an opaque nonempty
  `receipt_id`, and a real nonfuture ISO UTC `timestamp`.
- The `dns` authentication verification requires a real nonfuture ISO UTC `checked_at`,
  and `passed: true` with a nonempty `record` evidence reference for all three of
  `spf`, `dkim`, and `dmarc`.
- All referenced child reports must pass strict validation; a malformed, failed,
  or unclassified child blocks approval even beside a valid live receipt. Valid
  simulation reports may accompany a live receipt.
- Unified dossiers (`stages`, `dossier_version`) are explicitly rejected as candidates
  in `isSmtpDeliveryCandidate`.
- Category 2 is enclosed in the narrow safe evidence boundary (`checkEvidenceFile`),
  mapping any missing, malformed, non-object, non-candidate, or throwing file to the
  fixed blocker `'A referenced SMTP delivery report is invalid or failed'` and suppressing
  private file paths, canary tokens, stack traces, and internal errors.
- Unresolved example readiness record failed closed with 0 approved categories,
  11 blocked, and 70 blockers.

### 3. Secrets Management (`secrets_management`)

- Rehearsal only: `scripts/ops/scan-secrets.sh` and
  `bash scripts/ops/run-secret-rotation-drill.sh --dry-run`. The runner always
  emits `execution_mode: "simulation"`, even without `--dry-run` or with
  successful service reachability. Stage 5 remains a drill, never live approval.
- Prompt 268: explicit rotation receipt destinations must be absent file paths
  without a trailing slash. Attached/separate options and `--cwd` are supported;
  the volume verifier retains installation-root configuration defaults.
  Optional observations remain bounded reachability metadata, and `--dry-run`
  does not disable probes. Receipts publish privately without replacing retained
  evidence. See `docs/operations.md` prompt 268 for checked behavior and results.
- Approval evidence: separately authorized, operator-supplied live child JSON
  plus independently inspected production sources. No repository command
  produces the live receipt or performs the production rotation.
- Retain runtime injection mechanism, masking policy, positive cadence ≤90 days,
  compromise response runbook and named approver.
- Every referenced rotation child must be structurally valid: exact
  `drill_type: "zero_downtime_secret_rotation_and_compromise_response"`,
  `status: "success"`, empty `errors`, valid nonfuture basic or canonical ISO UTC
  timestamp, boolean `dry_run`, and exact `execution_mode` (`simulation` or `live`).
  `tested_secret_classes` contains exactly seven unique names: `session_secret`,
  `csrf_secret`, `postgres_passwords`, `valkey_password`, `storage_s3_keys`,
  `smtp_credentials`, `grafana_admin_password`. Seven steps must each have
  canonical `status: "passed"`: `session_rollover`, `csrf_rollover`,
  `database_rotation`, `valkey_rotation`, `storage_rotation`,
  `compromise_response`, `redaction_audit`. The redaction step requires
  `raw_secrets_masked: true` and `zero_dev_passwords_detected: true`.
- At least one child must satisfy the complete live contract:
  `execution_mode: "live"`, `dry_run: false`, `environment: "production"`,
  and `environment_reference`, `authorization_reference`, `operator_reference`.
  `class_verification` has exactly the seven class keys above; every entry has
  `status: "passed"`, `rotation_verified: true`,
  `stale_credential_rejected: true`, `fresh_credential_accepted: true`, and
  `evidence_reference`. Every existing step also has `evidence_reference`.
  References are opaque, trimmed nonempty strings without control characters;
  existing placeholder/development-secret checks apply to all live receipt text.
  Private paths need not exist here and references are never dereferenced.
- Simulation alone, legacy unclassified receipts, dossier alone, prose and
  declarations cannot approve Category 3. A valid simulation may accompany a
  valid live receipt; any invalid child blocks, including wildcard matches.
  Custom filenames qualify by content. Failed dossiers and unreadable/malformed
  files still block with fixed messages that exclude child text, paths and
  exceptions, including unexpected nested diagnostic values.
- These mode flags, assertions and source pointers do not authenticate the
  target, prove zero downtime or replace independent operator inspection.
  Inspect actual credential retirement, SMTP/Grafana confirmations, compromise
  response, application behavior and recovery policy. The session example is
  generalized HMAC rollover; it does not prove opaque Acres sessions are signed
  with `SESSION_SECRET`. Existing local mocks do not rotate production services.

**Prompt 235 compatibility update (2026-09-30):** Legacy reports need
regeneration for rehearsal or a separately inspected live receipt. Retained
private evidence is not relabeled. The receipt is a child JSON contract;
`readiness.schema.json` and assembler baselines are unchanged. Category 3,
prompt 201 and Phase 12 operator sign-off remain unresolved.

**Prompt 246 update (2026-10-01):** Unified launch evidence dossiers are safely
recognized in Category 3 evidence arrays via `validSecretDossier` without
false-positive blockers when accompanying live operator receipts. Dossiers must
report `overall_status === 'PASSED'`, verified `secretRotationBaseline`, verified
`supplyChainBaseline` (if present), and unbreached summary compliance flags. A
dossier alone cannot approve Category 3.

**Prompt 207 Category 3 intake — 2026-09-26T20:41:49Z UTC.** Reviewed
`f2f0e1b` on `main`. The repository-visible secrets management material is the
unresolved `infra/launch/readiness.example.json`, rotation drill scripts, and
validator test fixtures; no materialized production readiness record or
secret-rotation child report was available for this assessment. This does not
establish whether an operator's restricted evidence store contains either.
Category 3 remains **unresolved**. No runtime injection inventory, log masking
policy, rotation cadence decision (≤90 days), compromise response runbook, or
dated security-lead sign-off was supplied for independent inspection. No live
credential rotation was executed and no production configuration was mutated.
Stage 5 of the unified launch drill explicitly forces `--dry-run`; simulation
or drill artifacts alone do not prove live credential rotation.

The **security lead** must identify through the approved operator channel the
designated production target, restricted evidence-store location, runtime
injection mechanism (Vault, AWS Secrets Manager, Infisical, or protected host
env), masking/logging policy, approved rotation cadence (positive integer ≤ 90
days), compromise-response runbook with named owner, seven-class rotation
procedure (`session_secret`, `csrf_secret`, `postgres_passwords`,
`valkey_password`, `storage_s3_keys`, `smtp_credentials`,
`grafana_admin_password`), and named security-lead approver. Supply opaque
references to the injector/audit records, previous live rotation evidence
verifying the seven steps (`session_rollover`, `csrf_rollover`,
`database_rotation`, `valkey_rotation`, `storage_rotation`,
`compromise_response`, `redaction_audit`) and redaction flags
(`raw_secrets_masked: true`, `zero_dev_passwords_detected: true`), and dated
Category 3 approval. Read-only inspection of those safe sources is the next
safe action. Any live credential rotation requires separate authorization naming
the production target, secret class, operator, maintenance window,
fallback/rollback procedure, and observer. Category 4 (`secret_references`) can
remain unresolved during Category 3 inspection, but injection mechanisms and
sources must align across both sections. Categories 1, 2, and all other launch
gates retain their prior unresolved state.

Repository checks for this intake: `ops:readiness-schema-test` passed (8/8),
`ops:templates` passed, `ops:check` passed all 14 sub-suites (22 template/env
tests, `ops:scan-secrets`, `ops:docker-runtime`, `ops:audit` with 0 critical
vulnerabilities, schema test, 44 readiness validator tests, SAST gate with 0
blockers/expired suppressions, 14 container security tests, 10 SAST tests, 14
supply chain tests, 12 volume encryption tests, 14 secret rotation tests, 13
capacity alerting tests, 14 DR tests, 13 launch drill tests), `npm run lint`
passed across all workspaces, `npm run typecheck` passed, `npm run build`
passed (including client Next 16.3.4 and server Nest), and `git diff --check`
exited 0. The example readiness validator exited 1 as designed: 0 of 11
categories approved, 11 blocked, 70 blockers, including five Category 3
blockers (`injection_mechanism`, `masking_policy`, `compromise_response_plan`,
unresolved section status, empty evidence array).

### 4. Secret References (`secret_references`)

- Drill/verify: `scripts/ops/scan-secrets.sh`
- Evidence: a redacted `secret-reference-policy-<timestamp>.json` child report
- Accept: all of `session`, `csrf`, `db_migrator`, `db_app`, `valkey`,
  `garage_rpc`, `garage_admin`, `garage_metrics`, `garage_s3`, `smtp`,
  `grafana_admin`, `db_monitor` present as store references; zero plaintext credentials;
  no AI/Gemini secret source (contradicts the no-AI posture)
- An approved record must reference a concrete JSON report with
  `drill_type: "secret_reference_policy_verification"`, a real nonfuture ISO UTC
  `timestamp`, `status: "success"`, `errors: []`, and a nonempty opaque
  `policy_reference`. Its `references` object must have exactly the twelve
  source-field names in `REQUIRED_SECRET_KEYS`; each entry must contain only
  `source` (exactly matching the approved indirect reference),
  `access_verified: true`, and `plaintext_exposed: false`. Approved sources
  use `vault:path#key`, `aws-sm:name`, `env:NAME`, or `file:/absolute/path` and
  are distinct for each required field.
  Prose, a dossier, or a filename alone cannot qualify. Every referenced JSON
  file, including wildcard matches, must be a valid child report. Validate
  with `node scripts/ops/check-launch-readiness.js <operator-readiness.json>`.
  The operator obtains and redacts the live secret-store policy printout; the
  validator checks internal consistency and cannot authenticate a hand-authored
  report or prove live least-privilege access.

**Prompt 208 Category 4 intake — 2026-09-26T22:24:17Z UTC.** Reviewed
`d09b51f` on `main`; the only worktree change was this untracked prompt. The
repository-visible Category 4 material is the unresolved
`infra/launch/readiness.example.json`, `infra/launch/readiness.schema.json`, the
twelve-field validator in `scripts/ops/check-launch-readiness.js`, its test
fixtures, `scripts/ops/scan-secrets.sh`, `infra/env/production.env.example`,
`infra/env/garage.production.env.example`, and
`infra/compose/docker-compose.production.example.yml`. No materialized
production readiness record and no `secret-reference-policy-*.json` child report
exists in the repository: tracked matches are limited to the template, the
schema, the validator and its specs, and the prompt that requested this
assessment. The local `backups/` directory is gitignored (`.gitignore:74`) and
contains only locally generated drill and dry-run artifacts — secret-rotation,
capacity, deployment, SAST, SBOM, volume-encryption, dossiers and stage logs —
with no secret-reference policy report among them. That is a repository
observation, not a statement about an operator's restricted evidence store.
Category 4 remains **unresolved**. No store access policy printout, runtime
injection inventory, or dated security-lead decision was supplied for
independent inspection. No secret value was requested, read, or printed, and no
grant, injection mechanism, or credential was changed.

Repository-verified consumer mapping, read from the checked-in templates and
the server configuration, not from a running system. All twelve fields map to a
distinct template name, and eleven of those twelve have a verified repository
consumer: `db_migrator_secret_source` → `ACRES_MIGRATOR_PASSWORD` /
`DATABASE_MIGRATION_URL` (`server/prisma.config.ts:10`);
`db_app_secret_source` →
`ACRES_APP_PASSWORD` / `DATABASE_URL`
(`server/src/config/env.validation.ts:89`);
`db_monitor_secret_source` →
`ACRES_MONITOR_PASSWORD_FILE`, mounted read-only at
`/run/secrets/acres_monitor_password` and read by the `postgres-exporter`
service through `DATA_SOURCE_PASS_FILE` rather than an environment value;
`session_secret_source` → `SESSION_SECRET` (`env.validation.ts:89,217`);
`csrf_secret_source` → API `CSRF_SECRET` (`CsrfService`);
`valkey_secret_source` → `VALKEY_PASSWORD` / `VALKEY_URL`
(`env.validation.ts:401`; the development default at `:111` is rejected in
production by `:238`); `garage_rpc_secret_source` and
`garage_admin_secret_source` → `rpc_secret` and `admin_token` in
`infra/garage/garage.toml:8,22`, re-mapped to the `garage` service alone;
`garage_s3_secret_source` → `STORAGE_ACCESS_KEY_ID` /
`STORAGE_SECRET_ACCESS_KEY` (`env.validation.ts:420`);
`grafana_admin_secret_source` → `GRAFANA_ADMIN_PASSWORD`
(`docker-compose.production.example.yml:245`); `garage_metrics_secret_source`
maps to the shared file-backed Garage and Prometheus configuration below. The
remaining runtime uncertainty and the metrics live-proof requirement are recorded
below. No `GEMINI_API_KEY` or other AI source name appears in any production
template; the only Gemini strings under `infra/` are Category 11's no-AI posture
fields. A clean `scripts/ops/scan-secrets.sh` run is one supporting repository
check and is not evidence of production store policy or runtime injection.

Repository facts the operator's inventory and the security lead must track:

- **`valkey_secret_source` must reach Valkey's own healthcheck.** The
  production Compose template binds mandatory `VALKEY_PASSWORD` to both the
  server's `--requirepass` argument and the Valkey container environment. The
  probe uses that in-container value and accepts only `PONG`; API and worker
  startup depend on Valkey becoming healthy. Inspect the redacted live Valkey
  environment key inventory and an authenticated probe result before Category 4
  approval. The repository template alone proves neither live injection nor
  health.
- **`csrf_secret_source` now has a distinct API consumer.**
  `CsrfService` reads the validated `CSRF_SECRET`; the production API Compose
  map requires that input and the worker map excludes it. The application
  rejects equal CSRF and session values in production. Operators must provision
  a separate store value and inject it into any already materialized API env
  and Compose files before rollout. Old CSRF tokens become invalid at cutover
  and after CSRF key rotation; clients fetch a new token via `GET /auth/csrf`.
  Repository wiring does not prove a live store grant or policy. The twelve
  distinct indirect references and Category 4 operator evidence remain required.
- **`smtp_secret_source` runtime injection is unverified.** The repository
  production env template now defines `SMTP_USER` and `SMTP_PASS`, matching
  `server/src/config/env.validation.ts` and the mail adapter. The template
  preflight requires each key exactly once and rejects active assignments to
  `SMTP_USERNAME` or `SMTP_PASSWORD`. This repairs the checked-in naming
  mismatch only. The operator's redacted inventory must show the names actually
  injected into the production API and worker; any materialized env file using
  the former names must be migrated before deployment. Category 2 and 4 still
  require a verified credential source, runtime injection, and delivery evidence.
- **`garage_metrics_secret_source` has a repository consumer, pending live proof.**
  The production template requires one operator-owned absolute
  `ACRES_GARAGE_METRICS_TOKEN_FILE` path, mounted read-only in Garage and
  Prometheus at `/run/secrets/garage_metrics_token`. Garage reads it through
  `GARAGE_METRICS_TOKEN_FILE`, and `[admin].metrics_require_token = true` protects
  private `:3903/metrics`. Prometheus `acres-garage` uses Bearer
  `authorization.credentials_file` for that endpoint; `up{job="acres-garage"}`
  distinguishes scrape reachability. `/health` remains an unauthenticated
  readiness probe. The former plaintext `GARAGE_METRICS_TOKEN` injection is
  removed. Static configuration does not prove the live store grant, file
  readability, HTTP authorization behavior, or a healthy target. The operator
  must map the approved indirect source to the file, verify denial with no or
  a wrong token and success with the correct token, then inspect the private
  Prometheus target before Category 4 or 5 approval.
- **The reference template now scopes Caddy, Next, API and worker environment.** Prompt 219
  removes their shared `env_file`: Caddy receives the 13 names referenced by
  `Caddyfile.example` (including the commented HSTS setting), and Next receives
  only `NODE_ENV` and its private `ACRES_API_ORIGIN`. Prompt 220 removes the
  shared `env_file` from API and worker too. The API receives its mail, auth,
  GraphQL, rate-limit, queue, storage, parser and processing inputs. Prompt 223
  decouples `SESSION_SECRET` and `CLIENT_ORIGIN` from worker boot validation and
  removes both from the worker Compose service environment map. The worker receives
  only its database, queue, storage, scanner, outbox and metrics inputs; it does
  not receive browser-facing CSRF, session or mail secrets or client origin. Both
  API and worker explicitly disable AI and receive no Gemini key. The parsed
  Compose preflight rejects extra service keys, `env_file`, missing or miswired
  required inputs, duplicate or missing active operator assignments, changed
  scheduler/worker metrics settings, and changed Next mode or API origin. This
  repository change does not establish the production container environment.
  Operators using an older materialized Compose file must adopt all revised
  service maps, render and inspect the resulting Compose config, then inspect
  effective container **key names only** through a redacted inventory before
  Category 4 approval. A scoped revert would restore unnecessary service
  secret exposure; treat that as a security regression. Prompt 224 removes the
  redundant `env_file` from `garage`, ensuring all three Garage environment
  variables (`GARAGE_RPC_SECRET`, `GARAGE_ADMIN_TOKEN`, and `GARAGE_METRICS_TOKEN_FILE`)
  are strictly mapped via explicit `environment:` entries. Across all 11 production
  services in `docker-compose.production.example.yml`, zero services now declare
  `env_file`. The parsed Compose preflight and template tests enforce that no
  service in the production manifest may declare `env_file`.

Verified about the executable contract, for precision:
`validSmtpSecretReference` is a regular expression only
(`check-launch-readiness.js:635`), so a syntactically valid `env:NAME` or
`file:/absolute/path` reference passes without proving protection,
availability, separation or least privilege; the twelve-value distinctness rule
runs only when the section status is `approved` and a child report is present
(`:1647`); and the SMTP equality check against `credentials_source_reference`
sits inside the `status === 'approved'` guard for Category 2 (`:1559`, `:1575`),
so it does not run while Category 2 is unresolved. There is no executable
cross-check between `secrets_management.injection_mechanism` and the twelve
Category 4 sources; that alignment is operator-owned.

The **security lead** must identify through the approved operator channel the
designated production target, restricted evidence-store location, named
security-lead approver, and the source and consumer of each of the twelve
fields. Supply opaque identifiers for all twelve sources, a redacted
secret-store access policy keyed to service identities, roles, least privilege
and audit records, and a redacted runtime injection inventory for API, worker,
migration job, PostgreSQL monitor, Valkey, Garage, SMTP and Grafana, plus a
dated Category 4 decision. Read-only inspection of those sources is the next
safe action, and every reference must be verified without fetching the
underlying value. Never supply secret values, raw environment dumps, access
tokens, signing keys, unredacted policies, recovery keys, or full connection
strings. The migration,
application and monitoring database identities must remain separate and the
Garage RPC, admin, metrics and S3 sources must be scoped to their actual
consumers, and the remaining SMTP runtime source uncertainty must be answered,
including which variable name production actually injects. For Garage metrics,
the single host token file must be readable by both container identities;
verify the pinned Garage image's runtime UID/GID on the target host rather than
assuming one. Restrict ownership and mode to those readers and record the
source grant without revealing contents. Any plaintext
exposure or invalid grant is routed through the operator's security and
compromise procedure; grants and secrets are not changed under this assessment.
Categories 1–3 and every other launch gate retain their prior unresolved state,
and prompt 201 still governs the final eleven-category decision.

Repository checks for this intake: `npm run ops:readiness-schema-test` passed
(8/8); `node scripts/ops/check-launch-readiness.js
infra/launch/readiness.example.json` exited 1 as designed with 11 required
categories, 0 approved, 11 blocked and 70 blockers, including fourteen
Category 4 blockers (twelve `__REQUIRED_SECRET_REF_*__` placeholders, the
unresolved section status, and the empty evidence array);
`sh scripts/ops/scan-secrets.sh` printed `secret/default scan passed`;
`npm run ops:templates` printed `ops template check passed`;
`npm run ops:check` exited 0 across all 19 script steps — `ops:templates` plus
22 release-image tests, secret scan, Docker runtime, dependency audit with 0
critical vulnerabilities and 16 reported (8 moderate, 8 high) in that run, 8
schema tests, 103 readiness-validator tests, 10 reconciliation tests, 18 Caddy
tests, 17 volume-encryption tests, 8 SBOM tests, SBOM license verification, 14
SAST tests, a SAST gate reporting zero blockers and zero expired suppressions,
11 container-security tests, container-security scan, 15 capacity tests, 23
alert-rule tests and 13 launch-drill tests. `npm run lint`, `npm run typecheck`
and `npm run build` (client Next and server Nest) exited 0,
and `git diff --check` exited 0. No operator production source, secret store,
granted access, or approval was inspected, and none of these repository results
supplies Category 4 evidence.

**Prompt 241 Category 4 evidence separation (2026-10-01).** Category 4
(`secret_references`) now classifies local/configuration verification as simulation
preflight (`execution_mode: "simulation"`) and requires a separately inspected live
operator child receipt (`execution_mode: "live"`) when approved:
- Structural secret-reference policy child reports require `execution_mode: "simulation" | "live"`.
  Unrecognized, legacy, or missing execution modes fail closed.
- Simulation reports validate structural completeness (drill_type, status, errors,
  policy_reference, and matching 12 distinct indirect secret references), but cannot approve
  Category 4 on their own (`requireLive: true` fails closed on simulation).
- Live reports require `execution_mode: "live"`, `environment: "production"`, and
  trimmed nonempty opaque audit references (`operator_reference`,
  `authorization_reference`, `policy_reference`).
- The references object must contain exactly the twelve approved indirect secret keys with
  `access_verified: true`, `plaintext_exposed: false`, and `source` matching the approved section.
- All referenced child reports must pass strict validation; a malformed, failed,
  or unclassified child blocks approval even beside a valid live receipt. Valid
  simulation reports may accompany a live receipt.
- Unified dossiers (`stages`, `dossier_version`) are explicitly rejected as candidates
  in `isSecretReferencePolicyCandidate`.
- Prompt 247: In `checkEvidenceFileContents`, `isSecretReferencePolicyCandidate` is now
  strictly enforced. Any non-candidate JSON file or disguised dossier fails closed with
  `'A referenced secret-reference policy report is invalid or failed'`, even when referenced
  beside a valid live receipt. Referencing only a non-candidate produces both the child report
  requirement and invalid/failed report blockers.
- Category 4 is enclosed in the narrow safe evidence boundary (`checkEvidenceFile`),
  mapping any missing, malformed, non-object, non-candidate, or throwing file to the
  fixed blocker `'A referenced secret-reference policy report is invalid or failed'` and suppressing
  private file paths, canary tokens, stack traces, and internal errors.
- Unresolved example readiness record failed closed with 0 approved categories,
  11 blocked, and 70 blockers.

### 5. SLOs, Alerting & Capacity (`slo_and_alerting`)

**Prompt 270 capacity parent usage/publication (2026-10-07):** Offline preflight
uses `--dry-run`; `--cwd` selects source reads and relative paths while children
remain installation-anchored. An explicit evidence file must be absent and
overrides the directory; new UUID receipts are private, complete and published
atomically without replacing existing/concurrent files, directories or links.
The launch orchestrator's owned `capacity-alerting-drill-evidence-receipt.json`
name remains supported. Child exits and complete alert/capacity/database/DoS
contracts are checked before success. Non-dry default execution retains live DoS
traffic and fails for missing live database evidence. Every non-dry exercise
still requires separate operator authorization. Synthetic receipts and scaffold
references do not supply Category 5 acceptance or sign-off. Actual-process parent
coverage passed 143/143; full command evidence and the unresolved production
dependency audit are recorded in `docs/operations.md` Prompt 270.

**Prompt 273 standalone capacity inspection/publication (2026-10-07):** Inspect
safely with `node scripts/ops/verify-capacity-load.js --help` and
`npm run ops:capacity-test`. Requested synthetic standalone regeneration uses
`--synthetic --output <new-absent-file>` or the default
`backups/capacity-load-report-<uuid>.json`; exact relative outputs use caller cwd,
while default backups remain installation-anchored. Preserve earlier receipts.
New directories are 0700 and complete verified 0600 reports publish exclusively,
without replacing existing or competing destinations. No-save does no destination
work. Direct callers keep `reportPath`, but CLI/saved JSON do not disclose it.
Setup, publication, cleanup and output failures exit nonzero even with
`--allow-failure`; that flag changes only evaluated SLO exit status and preserves
failed evidence. Duration/concurrency bounds are engineering limits, not live
capacity evidence. Standalone synthetic statistics and the real isolated dry
parent cannot approve Category 5; bound live DB telemetry and separate operator
acceptance remain necessary. Final capacity coverage passed 54/54, parent 143/143
and actual-child integration 1/1. Complete checks, audit failure and residual
publication limits are recorded in `docs/operations.md` Prompt 273. No live
benchmark or operator production evidence inspection/approval occurred.

**Prompt 274 standalone alert inspection (2026-10-07):** Safe repository-source
inspection uses `node scripts/ops/verify-alert-rules.js --help`,
`npm run ops:alert-test`, and `node scripts/ops/verify-alert-rules.js --json`.
No reports are saved. Defaults remain installation-anchored; explicit relative
`--alerts-file`/`--prom-file` values resolve from caller cwd and also accept
attached forms. Strict invocation/source validation and fixed diagnostics reject
malformed inputs without exposing paths, snippets or invalid field values.
Byte/YAML/traversal limits are engineering safety bounds, not production capacity.
Success retains eleven required rules/predicates and 25 passing checks. Invalid
verification/output exits nonzero; complete JSON drains before shutdown. Final
alerts passed 112/112, parent 144/144 and final actual alert-child integration
1/1; full gate output and audit blocker are in `docs/operations.md` Prompt 274.
Static selector heuristics and fixed JavaScript predicates do not execute YAML
PromQL, validate full grammar/evaluation windows, observe deployed monitoring or
prove notification delivery. Simulation acceptance cannot approve Category 5;
bound live evidence and named operator acceptance remain required.

- Offline drill/verify: `bash scripts/ops/run-capacity-alerting-drill.sh --dry-run`,
  `node scripts/ops/verify-alert-rules.js`, `node scripts/ops/verify-capacity-load.js --synthetic`
- Evidence: `backups/capacity-alerting-drill-evidence-<uuid>.json` or an absent exact `--evidence-file` destination
- Accept: availability target ≥ 99.9% (error rate < 0.1%), HTTP p95 latency ceiling ≤ 500ms,
  capacity target ≥ 100 RPS, database connection pool acquisition p95 latency ceiling ≤ 50ms,
  database query execution p95 latency ceiling ≤ 100ms, ≥ 1 alert recipient,
  `alert_thresholds_defined: true`, escalation runbook reference; all 11 alert rules validated.
  Record both `up{job="acres-postgres"}` and `pg_up{job="acres-postgres"}` with
  `pg_exporter_last_scrape_error{job="acres-postgres"}`. Exercise exporter-down
  and database/authentication-failure cases separately. Confirm the private
  monitor file mount and existing-volume role reconciliation. Record the
  lock-wait count and oldest transaction-age panels with their scrape health;
  follow the read-only diagnosis in §5 when either suggests contention.
  Record API and Worker PostgreSQL pool acquisition latency percentiles (panels
  23 and 24, `acres_postgres_pool_acquisition_duration_seconds`) and SQL query
  execution latency percentiles (panels 25 and 26, `acres_database_query_duration_seconds`);
  elevated acquisition p95/p99 indicates pool checkout queueing or exhaustion,
  while elevated query latency with low acquisition latency isolates database-side
  query or index bottlenecks.
- Capacity baseline telemetry structure in evidence (`databaseTelemetryBaseline`):
  - `postgresExporter`: `up == 1` (`up{job="acres-postgres"}`), `lastScrapeError == 0` (`pg_exporter_last_scrape_error{job="acres-postgres"}`)
  - `postgresServer`: `pgUp == 1` (`pg_up{job="acres-postgres"}`)
  - `connectionPool`: API and Worker `totalConnections`, `idleConnections`, `maxConnections`, `requestsWaiting` (0 required)
  - `poolAcquisitionLatency`: API and Worker p50, p95 (ceiling ≤ 50ms), p99 (`acres_postgres_pool_acquisition_duration_seconds`)
  - `queryExecutionDuration`: API and Worker p50, p95 (ceiling ≤ 100ms), p99 (`acres_database_query_duration_seconds`)
  - `serverActivity`: `lockWaits` (0 required) and `maxTransactionDurationSec`
- Fail-closed validator enforcement (`scripts/ops/check-launch-readiness.js`):
  - Requires `availability_target_percent` to be a number between 99.9 and 100.0%;
  - Requires `max_p95_latency_ms` to be a positive number ≤ 500ms;
  - Requires `capacity_target_rps` to be a positive number ≥ 100 RPS;
  - Requires `max_database_acquisition_p95_latency_ms` to be a positive number ≤ 50ms;
  - Requires `max_database_query_p95_latency_ms` to be a positive number ≤ 100ms;
  - Requires a referenced, valid, successful capacity alerting child JSON report in `evidence`;
  - Validates actual producer fields: success, nonfuture UTC run dates, safe
    duration, empty failures and four passing summary flags; eleven uniquely named
    valid alert evaluations and breach/clear simulations, including 429 isolation;
    passing checks and consistent producer counts; valid measured distributions
    with recomputed SLO verdicts against child and approved-section policy;
    target-bound healthy live database telemetry and the complete live DoS receipt.
    Synthetic/default/missing modes cannot approve this category. See prompt 234
    in `docs/operations.md` for timestamp precision and compatibility details;
  - Fails closed if approved evidence reports `summary.databaseBaselineCompliance: "failed"` or `databaseTelemetryBaseline.status: "breached"`.

**Prompt 209 Category 5 intake — 2026-09-26T23:05:00Z UTC.** Reviewed
`ff72920` on `main`; the only worktree change was this prompt. The
repository-visible Category 5 material is the unresolved
`infra/launch/readiness.example.json`, `infra/launch/readiness.schema.json`, the
validator in `scripts/ops/check-launch-readiness.js:1657-1720` and `:457-545`,
the 11 alert rules in `infra/prometheus/alerts.yml`, scrape configuration in
`infra/prometheus/prometheus.yml`, the 28-panel operations dashboard in
`infra/grafana/dashboards/acres-operations.json`,
`scripts/ops/verify-alert-rules.js` and `scripts/ops/verify-capacity-load.js`
with their test suites, `scripts/ops/run-capacity-alerting-drill.sh`, and
`scripts/ops/launch-target-evidence.js`. No materialized production readiness
record and no production `capacity-alerting-drill-evidence-*.json` child report
exists in the repository: tracked files are limited to the template, schema,
scripts, and tests. The local `backups/` directory is gitignored
(`.gitignore:74`) and contains only locally generated dry-run and synthetic
artifacts — including synthetic capacity reports running in `mode: "synthetic"`
against `synthetic://in-process-evaluation`, simulated DoS exercises, and
synthetic baseline database telemetry. That is a repository observation, not a
statement about an operator's restricted evidence store. Category 5 remains
**unresolved**. No live production benchmark, fresh production database
telemetry extract, live Alertmanager routing evidence, or dated SRE-lead
decision was supplied for independent inspection. No live traffic was sent, no
alert was dispatched to on-call receivers, and no production monitoring
configuration was modified.

Four verified facts and architecture constraints the operator and the SRE lead
must resolve:

- **Alert rule simulation is not proof of live firing or on-call delivery.**
  `infra/prometheus/alerts.yml` defines the 11 required alerts (`AcresApiDown`,
  `AcresWorkerDown`, `PostgresDown`, `PostgresExporterDown`, `HighHttp5xxRate`,
  `P95LatencyThresholdExceeded`, `High429Rate`, `QueueDeadLettersDetected`,
  `OutboxDeliveryLag`, `HighHttpConcurrency`,
  `DatabaseConnectionPoolSaturation`). All 11 rules pass static PromQL parsing,
  duration format, label schema, metric identifier mapping, and breach/clear
  simulations in `scripts/ops/verify-alert-rules.js`. However, simulation tests
  expressions in-process against generated sample points; it does not prove
  live Prometheus evaluation, scrape reachability, network connectivity to
  Alertmanager, or delivery to an on-call human.
- **No Alertmanager receiver or on-call route is configured in this repository.**
  As noted in `docs/operations.md` §Phase 12E and prompt 167, the Compose profile
  (`infra/compose/docker-compose.production.example.yml`) deploys Prometheus
  and Grafana, but contains no Alertmanager service or receiver configuration.
  Alert routing (PagerDuty, Opsgenie, webhook, or email) is an external,
  operator-managed responsibility. Approval requires verified receipt evidence
  from the actual on-call channel, not repository configuration alone.
- **Database telemetry baseline isolates pool exhaustion from query execution bottlenecks.**
  The required `databaseTelemetryBaseline` contract enforces PostgreSQL exporter
  `up == 1`, `lastScrapeError == 0`, and database server `pgUp == 1`, zero
  connection pool requests waiting (`requestsWaiting == 0`), acquisition p95
  latency ≤ 50ms, query execution p95 latency ≤ 100ms, and zero lock waits
  (`lockWaits == 0`). Elevated acquisition latency (Grafana panels 23 and 24,
  `acres_postgres_pool_acquisition_duration_seconds`) indicates pool checkout
  queueing or exhaustion, while elevated query execution latency (panels 25 and
  26, `acres_database_query_duration_seconds`) with normal acquisition isolates
  unoptimized queries, missing indexes, or table locks. Both signals must be
  drawn from a live Prometheus scrape bound to the production target.
- **Offline drills require explicit `--dry-run` and cannot be labeled production proof.**
  Run `npm run ops:capacity-alerting-drill -- --dry-run` for synthetic capacity
  and database telemetry plus zero-network DoS repository assertions. Without
  `--dry-run`, the DoS child performs a live exercise even when no benchmark
  target was supplied. An invocation without a benchmark target emits aggregate
  `mode: "default"` and fails database acceptance rather than inventing telemetry.
  Live target evidence must have `source: "prometheus-live-scrape"`, match the
  benchmark target, and pass the existing freshness/health checks. Synthetic or
  dry-run success cannot support production launch approval.

**Prompt 232 DoS child contract (2026-09-29):** Stage 6 now validates an owned,
bounded child report rather than accepting its success status alone. The child
must identify `dos_resilience_drill`, have empty failures, all five repository
assertions passing, a safe duration and UTC timestamp within this invocation,
and a mode-consistent burst. Offline mode is `simulated` with null target,
`skipped` burst, null verdict, zero observed counters, and false probe flags.
Live mode hashes the normalized API origin, requires positive attempts and
validated throttles within the 15-request bound, consistent response totals,
zero unexpected/transport failures, and passing pre-health/CSRF/post-health
checks. Nonzero exit, invalid JSON, stale or mismatched evidence fails Stage 6.
The parent cleans its unique child temporary directory on all exits.

A separately authorized live invocation performs the existing CSRF cookie/header
handshake and observes invalid-login throttling and liveness only. It cannot
prove deployed protection across all five layers, constant-time behavior, or
sustained DoS capacity. Operator inspection and Category 5 sign-off remain
mandatory. Default child files use `dos-resilience-evidence-<uuid>.json` and
atomic publication. Prompt 269 requires absent exact destinations, supports
attached/separate value options and `--cwd`, and retains prior receipts on
failure/interruption. Relative output resolves against the canonical static-source
cwd; helpers remain installation-anchored. `--dry-run` is completely offline,
while default live execution still requires separate operator authorization.
Runner hardening does not supply Category 5 approval. Prompt 269 verification
passed 91 DoS tests and 18 capacity tests; its reviewed runner/check record is in
`docs/operations.md`.

Historical prompt 232 checks: `npm run ops:dos-test` (39 passed) and
`npm run ops:capacity-alerting-test` (16 passed), with no real traffic. Local
lint/typecheck/build and offline regressions passed after subprocess permission;
after explicit user authorization of registry egress, the audit passed its
zero-critical gate (12 moderate and 8 high findings) and the launch suite passed
13/13. The full `ops:check` exited 0. The unapproved example remains fail-closed with 0/11
approved categories and 70 blockers. See `docs/operations.md` Prompt 232 for
exact observed outputs and limits.

Verified about the executable contract, for precision:
`scripts/ops/check-launch-readiness.js` validates that an approved
`slo_and_alerting` section defines `availability_target_percent` between 99.9
and 100.0%, `max_p95_latency_ms` > 0 and ≤ 500ms, `capacity_target_rps` ≥ 100
RPS, `max_database_acquisition_p95_latency_ms` > 0 and ≤ 50ms, and
`max_database_query_p95_latency_ms` > 0 and ≤ 100ms. It requires
`alert_recipients` to be a non-empty array with no placeholders,
`alert_thresholds_defined: true`, and a valid `escalation_runbook_ref`. For
evidence, the validator requires at least one concrete child JSON report
matching `isCapacityAlertingCandidate`. As corrected by prompt 234 on 2026-09-30,
that child must use actual producer fields (`alerts.totalRulesCount`,
`requiredRulesCount`, `alerts`, `checks`, `simulations`; `capacity.targets`,
`distribution`, `compliance`) and live mode with internally consistent run dates
and bound benchmark/API identities. The capacity/API hash is the DoS `origin`
hash; benchmark identity remains URL `href`. Measurements, percentile order,
request counts, health/pool invariants and the complete DoS receipt are checked;
all eight individual SLO flags and overall acceptance are recomputed, including
stricter declared targets. Live HTTP capacity need not include DB distributions
because the live telemetry baseline supplies that gate. Synthetic evidence may
validate structurally as rehearsal but cannot approve the production section.
Every referenced child must pass; failures use safe fixed diagnostics. Old live
aggregates using the API trailing-slash hash must be regenerated. The validator
checks internal consistency; it cannot authenticate live Prometheus scrapes or
confirm that an on-call engineer received a test page.

The **SRE lead** and **operations lead** must provide through the approved
operator channel the designated production target URL, API origin, change
window, and observer; the formally signed SLO policy (availability ≥ 99.9%,
HTTP p95 ≤ 500ms, capacity ≥ 100 RPS, db acquisition p95 ≤ 50ms, db query
p95 ≤ 100ms); the verified on-call recipient(s) and active escalation runbook
reference (`docs/launch-checklist.md` §5); dated delivery and receipt evidence
from the live alert routing channel; fresh, target-bound Prometheus database
telemetry (`source: "prometheus-live-scrape"`); live capacity benchmark
results; and a dated Category 5 approval signature on an operator readiness
record. Read-only inspection of those safe sources in the restricted store is
the next safe action. Any live load drill, DoS resilience test, or alert
injection requires separate authorization specifying target, profile, ceilings,
operator, window, abort criteria, and observer. Categories 1–4 and all other
launch gates retain their prior unresolved state, and prompt 201 governs the
final eleven-category sign-off.

Repository checks for this intake: `npm run ops:readiness-schema-test` passed
(8/8); `node scripts/ops/check-launch-readiness.js
infra/launch/readiness.example.json` exited 1 as designed with 11 required
categories, 0 approved, 11 blocked, and 70 blockers, including four Category 5
blockers (unresolved `alert_recipients[0]` placeholder, unresolved
`escalation_runbook_ref` placeholder, unresolved section status, and empty
evidence array); `npm run ops:templates` printed `ops template check passed`;
`npm run ops:alert-test` passed (23/23 tests); `npm run ops:capacity-test`
passed (15/15 tests); `npm run ops:check` exited 0 across all 19 sub-suites —
template check, 22 release-image tests, secret scan, Docker runtime, dependency
audit with 0 critical vulnerabilities and 16 reported (8 moderate, 8 high), 8
schema tests, 103 readiness-validator tests, 10 reconciliation tests, 18 Caddy
tests, 17 volume-encryption tests, 8 SBOM tests, SBOM license verification, 14
SAST tests, a SAST gate reporting zero blockers and zero expired suppressions,
11 container-security tests, container-security scan, 15 capacity tests, 23
alert-rule tests, and 13 launch-drill tests. `npm run lint`, `npm run typecheck`,
and `npm run build` (client Next 16.3.4 webpack, NestJS, and shared) exited 0
across all workspaces, and `git diff --check` exited 0. No operator production
source, live scrape, benchmark, alert delivery, or approval was inspected, and
none of these repository results supplies Category 5 evidence.

**Prompt 245 Category 5 evidence separation (2026-10-01).** Category 5
(`slo_and_alerting`) now classifies synthetic drills and simulated runs as simulation
preflight (`execution_mode: "simulation"`, `mode: "synthetic"`) and requires a separately
inspected live operator child receipt (`execution_mode: "live"`) when approved:
- Structural capacity and alerting child reports support explicit `execution_mode: "simulation" | "live"`.
  Synthetic mode (`mode: "synthetic"`) maps to simulation preflight.
- Simulation reports validate structural completeness (drill_type, duration, timestamps,
  alert evaluations, synthetic distributions, simulated DoS layer, and database baseline), but
  cannot approve Category 5 on their own (`requireLive: true` fails closed on simulation).
- Live receipts require `execution_mode: "live"`, `environment: "production"`, and trimmed
  nonempty control-free references (`operator_reference`, `authorization_reference`, and
  `benchmark_reference` or `monitoring_reference` / `telemetry_reference`).
- All referenced child reports must pass strict validation; a malformed, failed,
  or unclassified child blocks approval even beside a valid live receipt. Valid
  simulation reports may accompany a live receipt.
- Unified launch dossiers (`stages`, `dossier_version`, `databaseTelemetryBaseline`) are
  explicitly rejected as candidates in `isCapacityAlertingCandidate`, while legitimate
  dossiers accompanying child evidence in Category 5 evidence arrays are safely recognized
  by `validCapacityDossier(report, file)` (verifying `databaseTelemetryBaseline.status === 'verified'`,
  unbreached capacity summary flags, and excluding child-named `capacity-alerting*` files)
  without causing false-positive child blockers.
- Category 5 is enclosed in the narrow safe evidence boundary (`checkEvidenceFile`),
  mapping any missing, malformed, non-candidate, or throwing file to the fixed blocker
  `'A referenced capacity and alerting report is invalid or failed'` and suppressing
  private file paths, canary tokens, stack traces, and internal errors.
- Unresolved example readiness record failed closed with 0 approved categories,
  11 blocked, and 70 blockers.

### 6. Disaster Recovery & Backups (`backup_and_disaster_recovery`)

- Drill/verify: `bash scripts/ops/run-restore-drill.sh --dry-run`,
  `node scripts/ops/reconcile-storage-objects.js --dry-run`
- Evidence: `backups/restore-drill-evidence-<timestamp>.json`, reconciliation report
- Accept: RPO ≤ 1h, RTO ≤ 4h (drill default 300s), encrypted off-host
  destination, cron schedule, `restore_drill_completed: true` with drill date,
  `db_object_reconciliation_tested: true`
- An approved record must reference a concrete, successful restore child JSON
  report in `evidence`. A custom path is accepted by report content, not name.
  Its basic UTC `drill_timestamp` (`YYYYMMDDTHHMMSSZ`) must be real and no later
  than validation time; `restore_drill_date` must be a real, nonfuture UTC
  `YYYY-MM-DD` date or `YYYY-MM-DDTHH:mm:ssZ` and match the latest valid
  referenced report's UTC date. Every referenced restore report must pass:
  `status: "success"`, true RTO/parity/PostGIS/foreign-key flags, equal
  nonnegative integer source/restored table and migration counts, positive
  integer `backup_bytes`, and finite nonnegative `duration_ms`. A failed or
  malformed report blocks even alongside a valid one. The dossier alone,
  prose, and `restore_drill_completed: true` are insufficient.
- It must also reference a concrete reconciliation child JSON report. A custom
  path is accepted by content; `db_object_reconciliation_tested: true`, prose,
  a plausible filename, and the unified dossier alone are insufficient. Each
  referenced report needs a real, nonfuture ISO UTC `timestamp`, the producer's
  eight finite nonnegative safe-integer summary counts, four result arrays with
  matching counts, zero missing/mismatched objects, and `exitCode: 0`. Status
  must be `clean` with no orphans or `warning` with an accurate orphan array.
  Every referenced report, including wildcard matches, must pass; the
  operator reviews warning orphans and verifies the live drill's scope.
- The schedule must run in UTC. Supported five-field cron syntax has `*` for
  hour, day of month, month, and day of week; the minute field is `*`, one
  minute `0..59`, `*/n` for `1..60`, or distinct comma-separated minutes.
  The longest interval between scheduled starts, including the hour boundary,
  must be no greater than `rpo_hours × 60` minutes. The example uses
  `0 * * * *` for a one-hour RPO.
- Start frequency alone does not establish the RPO. The operator must show
  successful backup completion, encrypted off-host transfer, PostgreSQL and
  Garage coverage, backup freshness, and a restore drill under actual load.
  Report/date consistency does not authenticate an archive or prove recovery.
- Fail-closed validator enforcement (`scripts/ops/check-launch-readiness.js`):
  - Requires `rpo_hours` to be a positive number ≤ 1 hour;
  - Rejects unsupported cron syntax and schedules whose maximum UTC start gap exceeds the declared RPO;
  - Requires `rto_hours` to be a positive number ≤ 4 hours;
  - Rejects restore drill evidence reporting `rto_compliant: false`, record parity failure, PostGIS/foreign key verification failure, or table/migration count discrepancies;
  - Rejects storage reconciliation reports reporting status `error`, missing objects, or checksum/size mismatches;
  - Rejects Unified Launch Evidence Dossiers reporting `disasterRecoveryBaseline.status: "breached"` or restore/reconcile compliance failures (`summary.restoreCompliance: "failed"`, `summary.reconcileCompliance: "failed"`).
- Known constraint (judgement, verified): both sub-drills require live drill
  infra even in `--dry-run` — PGPASSWORD plus reachable Postgres (`pg_isready`)
  for the restore drill, plus authenticated Postgres and reachable Garage/S3
  for reconciliation. Without them the unified orchestrator records stage 7
  `disaster_recovery` as FAILED (fail-closed); see §6.

**Restore runner safety (prompt 231).** The Stage 7 restore child now rejects
an existing drill database before creating an archive, validates input and
authenticated access, and creates only a previously absent target. It never
terminates sessions or drops a target whose recorded OID and owner have changed. A failed restore,
parity check, millisecond RTO check, or required cleanup exits nonzero without
success evidence. The archive is retained when target cleanup cannot be
confirmed, and the operator investigates the named target manually. Success
JSON is published atomically after cleanup; explicit keep flags retain the
created database or archive for an authorized drill. The stubbed
`ops:restore-drill-test` suite exercises this command behavior without a live
database. Category 6 still requires the separately authorized live restore,
Garage reconciliation, and operator sign-off described below.

**Prompt 210 Category 6 intake — 2026-09-26T23:55:37Z UTC.** Reviewed
`a3c4d9b` on `main`; the only worktree change was this prompt. The
repository-visible Category 6 material is the unresolved
`infra/launch/readiness.example.json`, `infra/launch/readiness.schema.json`, the
validator in `scripts/ops/check-launch-readiness.js:1722-1789` (including
`validateRestoreReport:194-210` and `validateReconciliationReport:227-246`),
the validator test suite in `tests/ops/launch-readiness-validator.spec.js`,
`scripts/ops/run-restore-drill.sh`, `scripts/ops/restore-postgres.sh`,
`scripts/ops/backup-postgres.sh`, `scripts/ops/reconcile-storage-objects.js`
with `tests/ops/reconcile-storage-objects.spec.js`, and stage 7 of
`scripts/ops/run-launch-drills.sh:228-231,264-275,387-463`. No materialized production readiness
record and no production `restore-drill-evidence-*.json` or
`reconciliation-report.json` child report exists in the repository: tracked
files are limited to the template, schema, scripts, and tests. The local
`backups/` directory is gitignored (`.gitignore:74`) and contains only locally
generated drill and dry-run artifacts — including synthetic and local test
runs. That is a repository observation, not a statement about an operator's
restricted evidence store. Category 6 remains **unresolved**. No live
production restore drill log, storage reconciliation report against production
buckets, off-host encrypted backup archive verification, or dated
operations/database lead decision was supplied for independent inspection. No
database backup was restored, no storage bucket was scanned, and no backup
cron schedule was modified.

Four verified facts and architecture constraints the operator and the database/operations leads must resolve:

- **Both sub-drills require live drill infrastructure even under `--dry-run`.**
  `scripts/ops/run-restore-drill.sh:106-109,148-153` requires `pg_isready` and database
  connectivity (`PGPASSWORD`), failing immediately if the database server is
  unreachable. Similarly, `scripts/ops/reconcile-storage-objects.js:375-395`
  connects to PostgreSQL via the `pg` client to query `StoredObject`, `Upload`, and
  `ExportArtifact` (`queryDatabaseStoredObjects:243-268`), and connects to Garage/S3 via `@aws-sdk/client-s3`. In an offline
  environment without database access and bucket credentials, `--dry-run` fails
  closed (`scripts/ops/run-launch-drills.sh:264-275` records stage 7
  `disaster_recovery` as `FAILED`).
- **UTC hourly cron schedule (`0 * * * *`) aligns with RPO ≤ 1h, but schedule syntax alone does not prove recovery.**
  `scripts/ops/check-launch-readiness.js:66-99` (`parseBackupScheduleCron`) parses 5-field UTC cron
  expressions and validates that `maxGapMinutes <= rpo_hours * 60`. While
  `0 * * * *` provides a theoretical 60-minute window matching `rpo_hours: 1.0`,
  a valid cron string does not prove active cron execution, off-host encrypted
  transfer, archive integrity, or backup consistency under production write load.
- **Dual machine-readable child evidence artifacts are mandatory for Category 6 approval.**
  `scripts/ops/check-launch-readiness.js:1722-1789` requires both a valid
  PostgreSQL restore drill report (`validateRestoreReport`) and a valid storage
  reconciliation report (`validateReconciliationReport`). The restore drill
  report requires `status: "success"`, strict basic UTC timestamp
  (`YYYYMMDDTHHMMSSZ`), `rto_compliant: true`, parity of public tables
  (`tables_source === tables_restored`), parity of migrations
  (`migrations_source === migrations_restored`), `postgis_verified: true`,
  `foreign_keys_verified: true`, `backup_bytes > 0`, and non-negative
  `duration_ms`. The reconciliation report requires strict ISO UTC timestamp, 8
  summary integer counts matching child array lengths, `missingObjects === 0`
  (zero data loss), `mismatchedObjects === 0` (zero checksum/size drift),
  `exitCode === 0`, and status `clean` (or `warning` when orphans are
  cataloged). Unified dossier summaries, prose declarations, or placeholder
  files cannot substitute for verified child artifacts.
- **Storage reconciliation distinguishes benign orphans from fatal missing or corrupted objects.**
  In `scripts/ops/reconcile-storage-objects.js:141-177`, orphan objects (files in
  storage without active database records) yield status `warning` unless
  `--fail-on-orphans` is specified, accommodating aborted multipart uploads or
  pending deletions. In contrast, missing objects (`missingObjects > 0`) or
  checksum/size discrepancies (`mismatchedObjects > 0`) indicate permanent data
  loss or corruption, triggering exit code 1 and failing closed to block launch
  approval unconditionally.

Verified about the executable contract, for precision:
`scripts/ops/check-launch-readiness.js` validates that an approved
`backup_and_disaster_recovery` section defines `rpo_hours` > 0 and ≤ 1.0 hour,
`rto_hours` > 0 and ≤ 4.0 hours, a non-empty `backup_destination` without
placeholders, a valid UTC every-hour `backup_schedule_cron`,
`restore_drill_completed: true` with `restore_drill_date` strictly matching the
UTC date of the referenced restore drill report,
`db_object_reconciliation_tested: true`, a valid approver, and dual child
evidence reports passing all schema and consistency checks. The validator checks
internal structural consistency; it cannot verify that an off-host encrypted
archive actually exists or that a production restore will succeed.

The **operations lead** and **database lead** must provide through the approved
operator channel the designated production backup destination and encryption
mechanism (off-host, encrypted target distinct from primary hosts); active cron
runner verification and schedule; restricted evidence-store location containing
raw backup archives and drill execution logs; controlled read-only access to
target database metadata and Garage/S3 bucket object listings; dual verified
child reports (PostgreSQL restore drill report and storage reconciliation
report); and a dated Category 6 approval signature on an operator readiness
record. Read-only inspection of those safe sources in the restricted store is
the next safe action. Any live restore drill requires separate authorization
specifying target database, isolated drill database, operator, maintenance
window, abort criteria, and observer. Categories 1–5 and all other launch gates
retain their prior unresolved state, and prompt 201 governs the final
eleven-category sign-off.

Repository checks for this intake: `npm run ops:readiness-schema-test` passed
(8/8); `node scripts/ops/check-launch-readiness.js
infra/launch/readiness.example.json` exited 1 as designed with 11 required
categories, 0 approved, 11 blocked, and 70 blockers, including three Category 6
blockers (unresolved `backup_destination` placeholder, unresolved section
status, and empty evidence array); `npm run ops:templates` printed `ops
template check passed`; `bash scripts/ops/run-restore-drill.sh --help` and
`node scripts/ops/reconcile-storage-objects.js --help` exited 0; `npm run
ops:check` exited 0 across all 19 sub-suites — template check, 22 release-image
tests, secret scan, Docker runtime, dependency audit with 0 critical
vulnerabilities and 16 reported (8 moderate, 8 high), 8 schema tests, 103
readiness-validator tests, 10 reconciliation tests, 18 Caddy tests, 17
volume-encryption tests, 8 SBOM tests, SBOM license verification, 14 SAST
tests, a SAST gate reporting zero blockers and zero expired suppressions, 11
container-security tests, container-security scan, 15 capacity tests, 23
alert-rule tests, and 13 launch-drill tests. `npm run lint`, `npm run
typecheck`, and `npm run build` (client Next 16.3.4 webpack, NestJS, and
shared) exited 0 across all workspaces, and `git diff --check` exited 0. No
operator production source, backup archive, restore drill, or approval was
inspected, and none of these repository results supplies Category 6 evidence.

**Prompt 238 Category 6 evidence separation (2026-10-01).** Category 6
(`backup_and_disaster_recovery`) now requires separately inspected live operator
child receipts (`execution_mode: "live"`) for both PostgreSQL restore and storage
reconciliation when the category is approved:
- The local runner `scripts/ops/run-restore-drill.sh` and storage reconciliation
  utility `scripts/ops/reconcile-storage-objects.js` now classify all emitted
  receipts as `execution_mode: "simulation"` and record their respective drill types.
  They execute against local drill databases (`acres_restore_drill`) and local
  storage instances; they do not attest production recovery or multi-region bucket
  integrity.
- Stage 7 in `scripts/ops/run-launch-drills.sh` and `scripts/ops/assemble-launch-dossier.js`
  is explicitly designated as drill rehearsal, validating `execution_mode === "simulation"`
  on child evidence.
- When `status: "approved"`, Category 6 requires:
  1. A live restore report (`execution_mode: "live"`) with `environment: "production"`,
     trimmed non-empty, control-free `operator_reference`, `authorization_reference`,
     `maintenance_window_reference`, matching `restore_drill_date`, and measured
     `duration_seconds <= expectedSection.rto_hours * 3600`.
  2. A live storage reconciliation report (`execution_mode: "live"`) with
     `environment: "production"`, trimmed non-empty, control-free `operator_reference`,
     `authorization_reference`, and `storage_target_reference` matching
     `expectedSection.backup_destination`.
- All referenced children must pass structural validation; valid simulations may
  accompany live receipts, but any failed child blocks approval even beside valid
  evidence.
- Safe diagnostic boundary: all Category 6 child file operations suppress private
  filesystem paths, stack traces, and internal child diagnostics, mapping failures
  to fixed safe blocker messages (`A referenced restore drill report is invalid or failed`
  and `A referenced storage reconciliation report is invalid or failed`).
- Repository checks for Prompt 238: `ops:restore-drill-test` (28/28), `ops:reconcile-test`
  (10/10), `ops:launch-drill-test` (59/59), `ops:readiness-test` (596/596),
  `ops:readiness-schema-test` (8/8), `ops:templates`, all ops suites, lint,
  typecheck, build, and `git diff --check` passed cleanly. Unresolved example
  failed closed with 0 approved, 11 blocked, 70 blockers.
- Prompt 248: In `checkEvidenceFileContents`, `validRecoveryDossier` rejects child report files
  (`restore-drill*`, `reconcil*`), non-object/array payloads, and unverified baseline contracts.
  Category 6 evaluates candidate child contracts (`isRestoreCandidate`, `isReconciliationCandidate`)
  first, followed by `validRecoveryDossier`, emitting category-specific invalid/failed blockers and
  explicitly terminating inspection with `continue;` to prevent fall-through.

### 7. Data Retention (`data_retention_policy`)

- Drill/verify: scheduled-cleanup review against the retention table
- Evidence: a redacted `retention-policy-review-<timestamp>.json` child report
- Accept: explicit windows for accounts, audit events, upload quarantine (7d),
  rejected objects (1d), exports (30d), reports, telemetry (15d), backups (30d)
- An approved record must reference a concrete JSON report with
  `drill_type: "data_retention_policy_verification"`, a real nonfuture ISO UTC
  `timestamp`, `status: "success"`, `errors: []`, a nonempty opaque
  `policy_reference`, `scheduled_cleanup_verified: true`, and `retention_windows`
  as an object keyed by all eight exact policy fields in `REQUIRED_RETENTION_KEYS`.
  Each entry must contain `window` (matching the approved readiness value) and
  `policy_verified: true`.
  Approved readiness values enforce fixed policy windows:
  `upload_quarantine_retention_policy: "7d"`,
  `rejected_object_retention_policy: "1d"`,
  `export_retention_policy: "30d"`,
  `telemetry_retention_policy: "15d"`,
  `backup_retention_policy: "30d"`,
  positive day windows (`^[1-9]\d*d$`) for `audit_retention_policy`,
  and `indefinite_until_tenant_deletion` or positive day duration for `account_retention_policy` and `report_retention_policy`.
  Prose alone, a dossier alone, or a malformed/failed report cannot qualify, even beside
  a valid one or in a wildcard expansion. Validate with
  `node scripts/ops/check-launch-readiness.js <operator-readiness.json>`.
  The operator conducts the formal legal and operational policy review; the validator
  checks internal consistency, window compliance, and child report validity.

**Prompt 211 Category 7 intake — 2026-09-27T14:33:00Z UTC.** Reviewed
`dc6670e` on `main`; the only worktree change was this prompt. The
repository-visible Category 7 material is the unresolved
`infra/launch/readiness.example.json`, `infra/launch/readiness.schema.json`, the
validator in `scripts/ops/check-launch-readiness.js:1791-1841` (including
`validateDataRetentionPolicyReport:716-744`, `REQUIRED_RETENTION_KEYS:46-55`,
and `isDataRetentionPolicyCandidate:712-714`), the validator test suite in
`scripts/ops/check-launch-readiness.spec.js:3446-3555` (with test fixtures at
lines 310-332), the scheduled cleanup jobs in
`server/src/jobs/retention-maintenance.job.ts:44-98,100-142,144-221,223-350`
and `server/src/jobs/session-maintenance.job.ts:37-69` with their test suites,
session service row reclamation in `server/src/sessions/sessions.service.ts:96-110`
(`purgeExpired`), upload quarantine state lifecycle in
`server/src/uploads/uploads.service.ts:212-219,347-349`, report export artifact
lifecycle in `server/src/reports/reports.service.ts`, Prometheus TSDB retention
flag `--storage.tsdb.retention.time=${PROMETHEUS_RETENTION}` in
`infra/compose/docker-compose.production.example.yml:206`, environment template
definitions in `infra/env/production.env.example:56,77`
(`PROMETHEUS_RETENTION=__REQUIRED_OPERATOR_PROMETHEUS_RETENTION__` and
`SCHEDULER_ENABLED=false`), and `scripts/ops/check-production-templates.sh`.
No materialized production readiness record and no production
`retention-policy-review-*.json` child report exists in the repository: tracked
files are limited to the template, schema, scripts, backend jobs, and tests.
That is a repository observation, not a statement about an operator's
restricted evidence store. Category 7 remains **unresolved**. No approved
legal/regulatory retention schedule, operator verification of
`SCHEDULER_ENABLED=true` on the production worker instance, Prometheus
`--storage.tsdb.retention.time=15d` runtime verification, off-host 30-day backup
lifecycle verification, or dated legal/compliance/operations lead decision was
supplied for independent inspection. No database records were purged, no
storage objects were deleted, and no cron schedule was modified.

Four verified facts and architecture constraints the operator and leads must
resolve:

- **Automated purge execution relies strictly on a single active scheduler instance (`SCHEDULER_ENABLED=true`).**
  `server/src/jobs/retention-maintenance.job.ts:46,102,146,225` and
  `server/src/jobs/session-maintenance.job.ts:39-41` gate all five purge paths
  on `config.schedulerEnabled`. In `infra/env/production.env.example:77`,
  `SCHEDULER_ENABLED=false` is default to prevent multi-instance race conditions
  because `@nestjs/schedule` runs in-process without distributed locks
  (`docs/backend.md` §scheduler). In production, exactly one worker instance
  must run with `SCHEDULER_ENABLED=true`. If the scheduler is disabled or the
  worker process crashes, expired sessions, uncompleted uploads, idempotency
  records, auth tokens/invitations, and export artifacts accumulate indefinitely
  without automatic pruning.
- **Batch bounds (`RETENTION_PURGE_BATCH_LIMIT = 500`) protect against query timeouts and database locking during backlog drainage, but require multiple ticks.**
  Purges execute hourly ticks claiming up to 500 records per category
  (`orderBy: { expiresAt: 'asc' }, take: 500`). For a massive volume of
  expired items, a single run does not purge everything; drainage requires
  sustained hourly ticks across multiple hours.
- **Export artifact purge reclaims S3 storage objects and soft-deletes `StoredObject` records while preserving `ExportRequest` audit history.**
  `server/src/jobs/retention-maintenance.job.ts:327-341` deletes
  `ExportArtifact` rows and transitions `StoredObject` to `deleted` (with
  `deletedAt: now`), but deliberately preserves `ExportRequest` records for
  governance auditability. Future download attempts for purged exports return
  404 NOT FOUND.
- **Telemetry and backup retention are governed out-of-band by Prometheus tsdb flags and off-host backup lifecycle policies.**
  `infra/compose/docker-compose.production.example.yml:206` configures
  Prometheus with `--storage.tsdb.retention.time=${PROMETHEUS_RETENTION}`,
  which must match `telemetry_retention_policy: "15d"`. Backup retention
  (30d) is enforced by off-host backup destination lifecycle rules, not
  NestJS cron jobs.

Verified about the executable contract, for precision:
`scripts/ops/check-launch-readiness.js` validates that an approved
`data_retention_policy` section defines all eight `REQUIRED_RETENTION_KEYS`:
`upload_quarantine_retention_policy: "7d"`,
`rejected_object_retention_policy: "1d"`,
`export_retention_policy: "30d"`,
`telemetry_retention_policy: "15d"`,
`backup_retention_policy: "30d"`,
`audit_retention_policy` matching `^[1-9]\d*d$`,
and `account_retention_policy` and `report_retention_policy` matching
`^[1-9]\d*d$` or `'indefinite_until_tenant_deletion'`. It requires a valid approver without placeholders and at least one concrete child JSON report
matching `isDataRetentionPolicyCandidate`. The child report must have
`drill_type: "data_retention_policy_verification"`, nonfuture ISO UTC
`timestamp`, `status: "success"`, `errors: []`, non-empty `policy_reference`,
`scheduled_cleanup_verified: true`, and all eight windows matching approved
section values with `policy_verified: true` and exactly two properties.
When Category 7 is approved, `execution_mode: "live"` is strictly enforced,
requiring `environment: "production"` and trimmed, nonempty, control-free,
secret-free `operator_reference`, `authorization_reference`, and `policy_reference`
with exact 11 top-level keys (`authorization_reference`, `drill_type`, `environment`,
`errors`, `execution_mode`, `operator_reference`, `policy_reference`,
`retention_windows`, `scheduled_cleanup_verified`, `status`, `timestamp`) with zero
placeholders and zero secrets. Simulation preflights (`execution_mode: "simulation"`)
require exact 8 keys (`drill_type`, `errors`, `execution_mode`, `policy_reference`,
`retention_windows`, `scheduled_cleanup_verified`, `status`, `timestamp`) and may accompany
live evidence, but cannot approve Category 7 alone. The validator checks internal
structural consistency; it cannot verify legal compliance or active worker cron
purging in production. Prompt 247: in `checkEvidenceFileContents`, `isDataRetentionPolicyCandidate`
is now strictly enforced. Any non-candidate JSON file or disguised dossier fails closed with
`'A referenced data retention policy report is invalid or failed'`, even when referenced beside
a valid live receipt. Referencing only a non-candidate produces both the child report requirement
and invalid/failed report blockers.

The **legal lead**, **compliance lead**, and **operations lead** must provide
through the approved operator channel the formal legal/regulatory retention
schedule defining tenant account, audit log, and report lifecycles; verified
production worker configuration with `SCHEDULER_ENABLED=true`; Prometheus
runtime configuration verifying `--storage.tsdb.retention.time=15d`; off-host
backup destination lifecycle policy verifying 30-day retention; restricted
evidence-store location containing the child policy review report
(`retention-policy-review-<timestamp>.json`); and dated Category 7 approval
signatures on an operator readiness record. Read-only inspection of those safe
sources in the restricted store is the next safe action. Categories 1–6 and
all other launch gates retain their prior unresolved state, and prompt 201
governs the final eleven-category sign-off.

Repository checks for this intake: `npm run ops:readiness-schema-test` passed
(8/8); `node scripts/ops/check-launch-readiness.js
infra/launch/readiness.example.json` exited 1 as designed with 11 required
categories, 0 approved, 11 blocked, and 70 blockers, including five Category 7
blockers (unresolved `account_retention_policy`, `audit_retention_policy`, and
`report_retention_policy` placeholders, unresolved section status, and empty
evidence array); `npm run ops:templates` printed `ops template check passed`;
`node --test scripts/ops/check-launch-readiness.spec.js` passed (103/103 tests);
`npm run ops:check` exited 0 across all 19 sub-suites — template check, 22
release-image tests, secret scan, Docker runtime, dependency audit with 0
critical vulnerabilities and 16 reported (8 moderate, 8 high), 8 schema tests,
103 readiness-validator tests, 10 reconciliation tests, 18 Caddy tests, 17
volume-encryption tests, 8 SBOM tests, SBOM license verification, 14 SAST
tests, a SAST gate reporting zero blockers and zero expired suppressions, 11
container-security tests, container-security scan, 15 capacity tests, 23
alert-rule tests, and 13 launch-drill tests. `npm run lint`, `npm run
typecheck`, and `npm run build` (client Next 16.3.4 webpack, NestJS, and
shared) exited 0 across all workspaces, and `git diff --check` exited 0. No
operator production source, retention review, or approval was inspected, and
none of these repository results supplies Category 7 evidence.

### 8. Volume Encryption (`volume_encryption`)

- Preflight: `node scripts/ops/verify-volume-encryption.js --output <restricted-preflight.json>`.
  Every CLI receipt is `execution_mode: "simulation"`, including concrete paths.
  It checks declarations and limited local filenames; no host/custody/recovery
  inspection is performed. Legacy receipts need regeneration, never relabeling.
- Accept: approved mechanism, at least three unique concrete absolute POSIX
  root paths, `key_separation_confirmed: true`, designated recovery owner,
  approver and at least one separately supplied live production child matching
  the approved mechanism, owner and root path set. All nine exact required
  service/container identities must appear once with `passed: true`, safe
  total/valid counts equal to nine, and valid nonfuture canonical ISO UTC date.
  Success, valid, empty errors, `keySeparation.verified: true` and empty detected
  violations remain required for both classified simulation and live children.
- Live adds `environment: "production"`, trimmed opaque environment,
  authorization and operator references; mechanism, recovery owner and root
  inventory; `host_path` / `evidence_reference` for every mount; and exactly four
  `live_verification` entries: `host_encryption`, `key_separation`, `dual_custody`,
  `recovery_procedure`. Each entry has exactly `status: "passed"`,
  `verified: true`, `evidence_reference`. References/strings reject controls,
  placeholders, dev passwords and literal secrets. Never include secret bytes.
- Roots match the parent as an unordered set; mechanism/owner spelling matches
  exactly. Mount paths equal or descend from a root on directory boundaries;
  every root covers an inspected mount. Shared roots are allowed, including
  Garage metadata/data. Paths reject `/`, trailing slashes, empty/dot/dot-dot
  segments, backslashes and controls. No path normalization, stat/symlink
  resolution or pointer dereference is performed by the validator.
- Every referenced child must pass, and every live child must bind to the
  approved section, even beside a matching one or in a glob. Valid simulation
  may accompany live evidence. Dossiers are excluded before filename checks;
  failed dossiers block. Simulation-only, dossier-only, legacy-only, prose-only
  and external-pointer-only evidence cannot approve. Category 8 evidence-file
  failures use the fixed message `A referenced volume encryption report is
  invalid or failed`, without private paths, child errors or formatting exceptions.
- Independently inspect all nine deployed mounts and underlying device/cloud
  encryption policy, separated unlock-material custody, dual control and the
  approved owner's documented tested recovery. Paths and opaque pointers are
  private metadata. Assertions and mode flags do not authenticate provenance
  or production scope. See the current volume runbook in `docs/operations.md`.
  Stage 4/7-stage dossier baselines remain preflight, not Category 8 approval.

**Historical intake qualification (prompt 237):** The prompt-212 record below
accurately records the then-current weaker contract (three arbitrary passing
mounts and optional counts). The contract above supersedes it; local filename
scans do not prove key absence or actual custody. Historical test results remain
as recorded. No live inspection or launch approval occurred in prompt 237.

**Prompt 212 Category 8 intake — 2026-09-27T15:45:00Z UTC.** Reviewed
`5e176e4` on `main`; the only worktree change was this prompt. The
repository-visible Category 8 material is the unresolved
`infra/launch/readiness.example.json`, `infra/launch/readiness.schema.json`, the
validator in `scripts/ops/check-launch-readiness.js:1843-1864` (including
`isVolumeEncryptionCandidate:248-254` and `validateVolumeEncryptionReport:256-279`),
the validator test suite in `scripts/ops/check-launch-readiness.spec.js:74-102,2045-2200,2680-2775`,
`scripts/ops/verify-volume-encryption.js` (including mount array definition at lines 43-98) and
`scripts/ops/verify-volume-encryption.spec.js` (17 unit tests), the 9 stateful
container mount declarations in `infra/compose/docker-compose.production.example.yml:14-15,121,147,172-173,190,210,251`,
the environment template variable definitions in
`infra/env/production.env.example:18-26,71` (`ACRES_POSTGRES_ENCRYPTED_MOUNT`,
`ACRES_VALKEY_ENCRYPTED_MOUNT`, `ACRES_GARAGE_META_ENCRYPTED_MOUNT`,
`ACRES_GARAGE_DATA_ENCRYPTED_MOUNT`, `ACRES_CLAMAV_ENCRYPTED_MOUNT`,
`ACRES_CADDY_DATA_MOUNT`, `ACRES_CADDY_CONFIG_MOUNT`,
`ACRES_PROMETHEUS_ENCRYPTED_MOUNT`, `ACRES_GRAFANA_ENCRYPTED_MOUNT`,
`PRODUCTION_KEY_RECOVERY_OWNER=__REQUIRED_OPERATOR_KEY_RECOVERY_OWNER__`),
stage 4 of `scripts/ops/run-launch-drills.sh:245-247,599-642`, and
`scripts/ops/check-production-templates.sh`.
No materialized production readiness record and no production
`volume-encryption-evidence-*.json` child report exists in the repository: tracked
files are limited to the template, schema, scripts, and tests. The local
`backups/` directory is gitignored (`.gitignore:74`) and contains only locally
generated drill artifacts. That is a repository observation, not a statement
about an operator's restricted evidence store. Category 8 remains **unresolved**.
No selected host volume encryption mechanism (LUKS2/dm-crypt, AWS KMS, GCP CMEK,
or Azure Key Vault), physical block device encryption verification on the production
host, detached keyfile/KMS key separation audit, designated key recovery owner
identity, or dated infrastructure/security lead decision was supplied for
independent inspection. No storage volume was re-encrypted, no disk partition
was formatted, and no host mount configuration was modified.

Four verified facts and architecture constraints the operator and leads must
resolve:

- **All 9 stateful container mounts require encrypted host storage bindings.**
  `infra/compose/docker-compose.production.example.yml` and
  `scripts/ops/verify-volume-encryption.js:43-98` specify 9 distinct stateful
  storage paths: PostgreSQL (`/var/lib/postgresql` -> `${ACRES_POSTGRES_ENCRYPTED_MOUNT}`),
  Valkey (`/data` -> `${ACRES_VALKEY_ENCRYPTED_MOUNT}`), Garage metadata
  (`/var/lib/garage/meta` -> `${ACRES_GARAGE_META_ENCRYPTED_MOUNT}`), Garage data
  (`/var/lib/garage/data` -> `${ACRES_GARAGE_DATA_ENCRYPTED_MOUNT}`), ClamAV
  (`/var/lib/clamav` -> `${ACRES_CLAMAV_ENCRYPTED_MOUNT}`), Caddy data
  (`/data` -> `${ACRES_CADDY_DATA_MOUNT}`), Caddy config
  (`/config` -> `${ACRES_CADDY_CONFIG_MOUNT}`), Prometheus
  (`/prometheus` -> `${ACRES_PROMETHEUS_ENCRYPTED_MOUNT}`), and Grafana
  (`/var/lib/grafana` -> `${ACRES_GRAFANA_ENCRYPTED_MOUNT}`). While Category 8
  minimum validator requirement enforces at least 3 mounts (PostgreSQL, Valkey,
  Garage), full production security compliance evaluates all 9 mounts.
- **The Key Separation Invariant (TM-21) strictly forbids key material in mount paths, backup archives, or Git.**
  Volume unlock passphrases, detached LUKS2 keyfiles, and KMS credentials must
  NEVER be stored within the persistent storage volumes they unlock, in backup
  archives (`backups/`), or tracked in Git. The engine strictly scans for
  forbidden keyfile extensions (`*.key`, `*.keyfile`, `*.passphrase`, `id_rsa`,
  `*luks*key*`, `*kms*creds*`) across mount paths and fails closed upon detection.
- **Key recovery governance requires designated dual-custody parameters and recovery runbook references.**
  Host encryption must establish split knowledge / dual control for recovery key
  material (`PRODUCTION_KEY_RECOVERY_OWNER`, emergency escrow), avoiding single-person
  dependency or automated plaintext escrow on the target host.
- **Synthetic and template checks verify Compose syntax and key separation on local disk, not physical disk encryption in production.**
  `scripts/ops/verify-volume-encryption.js` inspects Docker Compose volume
  configurations, environment templates, and local repository paths; it cannot
  verify that the production host hardware/hypervisor block devices actually have
  active LUKS2 dm-crypt dm-table mappings or hardware-level encryption active
  without operator audit.

Verified about the executable contract, for precision:
`scripts/ops/check-launch-readiness.js` validates that an approved
`volume_encryption` section defines `encryption_mechanism` (string),
`encrypted_mount_paths` (array with length >= 3, covering at least PostgreSQL,
Valkey, Garage), `key_separation_confirmed: true`, a valid `key_recovery_owner`
without placeholders, a valid approver, and at least one concrete child JSON
report matching `isVolumeEncryptionCandidate`. The child report must have
`drill_type: "production_volume_encryption_and_key_separation"`, nonfuture ISO UTC
`timestamp`, `status: "success"`, `valid: true`, `errors: []`,
`keySeparation.verified: true`, `keySeparation.detectedViolations: []`, and
`evaluatedMounts` array containing at least 3 mounts with all items having
`passed: true`. If total/valid counts are present, they must be equal positive
safe integers >= 3. The validator checks internal structural consistency; it
cannot verify physical disk encryption or detached KMS custody in production.

The **security lead** and **infrastructure lead** (with the designated **key
recovery owner**) must provide through the approved operator channel the
production host volume encryption mechanism and implementation details; list of
mounted encrypted host block devices and mount paths for all 9 stateful
services; key separation confirmation verifying that detached keyfiles/KMS
credentials reside in an external KMS / HSM / vault and are not present on
volume filesystems or backup archives; designated key recovery owner and
dual-custody parameters; restricted evidence-store location containing the child
volume encryption report (`volume-encryption-evidence-<timestamp>.json`); and
dated Category 8 approval signatures on an operator readiness record. Read-only
inspection of those safe sources in the restricted store is the next safe action.
Categories 1–7 and all other launch gates retain their prior unresolved state,
and prompt 201 governs the final eleven-category sign-off.

Repository checks for this intake: `npm run ops:readiness-schema-test` passed
(8/8); `node scripts/ops/check-launch-readiness.js
infra/launch/readiness.example.json` exited 1 as designed with 11 required
categories, 0 approved, 11 blocked, and 70 blockers, including seven Category 8
blockers (unresolved `encryption_mechanism`, three `encrypted_mount_paths`
placeholders, unresolved `key_recovery_owner` placeholder, unresolved section
status, and empty evidence array); `npm run ops:templates` printed `ops template
check passed`; `npm run ops:volume-test` passed (17/17 tests); `node --test
scripts/ops/check-launch-readiness.spec.js` passed (103/103 tests); `npm run
ops:check` exited 0 across all 19 sub-suites — template check, 22 release-image
tests, secret scan, Docker runtime, dependency audit with 0 critical
vulnerabilities and 16 reported (8 moderate, 8 high), 8 schema tests, 103
readiness-validator tests, 10 reconciliation tests, 18 Caddy tests, 17
volume-encryption tests, 8 SBOM tests, SBOM license verification, 14 SAST
tests, a SAST gate reporting zero blockers and zero expired suppressions, 11
container-security tests, container-security scan, 15 capacity tests, 23
alert-rule tests, and 13 launch-drill tests. `npm run lint`, `npm run
typecheck`, and `npm run build` (client Next 16.3.4 webpack, NestJS, and
shared) exited 0 across all workspaces, and `git diff --check` exited 0. No
operator production source, disk encryption inspect, or approval was
inspected, and none of these repository results supplies Category 8 evidence.

- Prompt 248: In `checkEvidenceFileContents`, `validVolumeDossier` rejects child report files
  (`volume-encryption*`), non-object/array payloads, and unverified baseline contracts.
  Category 8 evaluates `isVolumeEncryptionCandidate` first, followed by `validVolumeDossier`,
  emitting `'A referenced volume encryption report is invalid or failed'` and explicitly terminating
  inspection with `continue;` to prevent fall-through.

### 9. GraphQL Introspection (`graphql_introspection`)

- Drill/verify: production route probe (introspection query must fail closed)
- Evidence: a redacted `graphql-introspection-probe-<timestamp>.json` child report
- Accept: `production_introspection_enabled` boolean; enabling it in
  production requires a written security justification
- An approved record must reference a concrete JSON report with
  `drill_type: "graphql_introspection_probe"`, a real nonfuture ISO UTC
  `timestamp`, `status: "success"`, `errors: []`, a valid `endpoint`
  (`/graphql` or absolute HTTPS URL to `/graphql`),
  `production_introspection_enabled` strictly matching the approved readiness value,
  and a `probe_result` object containing exactly `status_code` (positive integer),
  `introspection_permitted` (matching `production_introspection_enabled`),
  `schema_exposed` (`false` when disabled, `true` when enabled), and non-empty
  `response_summary`.
  If `production_introspection_enabled: true`, the approved record requires a non-empty
  `justification` string without unresolved placeholders.
  Prose alone, a dossier alone, or a malformed/failed report cannot qualify, even beside
  a valid child or in a wildcard expansion. Validate with
  `node scripts/ops/check-launch-readiness.js <operator-readiness.json>`.
  The operator conducts the live route probe against the production ingress; the validator
  checks internal consistency, policy adherence, and child report validity.

**Prompt 213 Category 9 intake — 2026-09-27T19:21:47Z UTC.** Reviewed
`c97abba` on `main`. Repository inspection found only the unresolved
`infra/launch/readiness.example.json` and test fixtures; no materialized
production readiness record or redacted production GraphQL probe report was
available in the approved repository paths. This does not establish what may
exist in an operator's restricted evidence store. Category 9 remains
**unresolved**. No selected production policy, public HTTPS ingress and release
identity, authorized probe window/authentication context, live response
transcript, matching child report, independent ordinary GraphQL route check, or
dated security-lead approval was supplied. No production route was probed.

The checked-in example sets `production_introspection_enabled: false`, but it is
a template decision. The server source configures `/graphql` with
`introspection: !config.isProduction`, and the production Compose example sets
`NODE_ENV: production`; neither proves the deployed process or ingress behaves
that way. Caddy's example proxies `/graphql` to `api:3001`. The readiness
validator accepts a structurally consistent child report, including an enabled
policy with written justification, but neither authenticates the report's
provenance nor issues a live probe. The current server implementation supports
the disabled production policy; enabling it would need a separate approved
server/configuration change and deployment verification.

The **security lead**, with the operations lead, must identify the selected
policy, deployment/release, HTTPS `/graphql` ingress, permitted read-only probe
window and authentication method, and restricted evidence-store reference.
Supply a redacted response receipt that distinguishes introspection rejection
from an unrelated 401, proxy failure, timeout, or outage; an ordinary authorized
GraphQL response confirming route health; a matching
`graphql_introspection_probe` child JSON report; and a dated security-lead
decision. Use opaque references only, without cookies, tokens, raw credentials,
or schema contents. Once available, independently compare the transcript,
deployment, policy, and child fields, then validate the materialized readiness
record. Categories 1–8 and 10–11 remain unresolved, and prompt 201 governs the
final eleven-category sign-off.

Repository checks for this intake: `npm run ops:readiness-schema-test`
passed (1/1); `node --test scripts/ops/check-launch-readiness.spec.js`
passed (103/103) outside the sandbox after its in-sandbox child-process test
failed with `spawnSync ... EPERM`; `npm run ops:templates` printed `ops template
check passed`; and `npm run ops:check`, lint, typecheck, and `git diff --check`
exited 0. The example readiness validator exited 1 as designed: 11 required,
0 approved, 11 blocked, 70 blockers, including the unresolved Category 9
placeholder, section status, and empty evidence. `npm run build` first failed
inside the sandbox with Next's `Could not parse output from TypeScript's
--showConfig`; the same command passed outside the sandbox with client Next
16.3.4 and server Nest builds. None of these repository checks supplies a live
production GraphQL response or security approval.

**Prompt 243 Category 9 evidence separation (2026-10-01).** Category 9
(`graphql_introspection`) now classifies probe verification reports as simulation
preflight (`execution_mode: "simulation"`) and requires a separately inspected live
operator child receipt (`execution_mode: "live"`) when approved:
- Structural GraphQL probe child reports require `execution_mode: "simulation" | "live"`.
  Unrecognized, legacy, or missing execution modes fail closed.
- Simulation reports validate structural completeness (drill_type, endpoint, errors,
  matching production_introspection_enabled, and probe_result), but cannot approve
  Category 9 on their own (`requireLive: true` fails closed on simulation).
- Live reports require `execution_mode: "live"`, `environment: "production"`, and
  trimmed nonempty opaque references (`operator_reference`, `authorization_reference`,
  `probe_reference`).
- All probe reports require `probe_result` matching `status_code` (positive integer),
  `introspection_permitted` (matching `production_introspection_enabled`),
  `schema_exposed` (`false` when disabled, `true` when enabled), and non-empty
  trimmed `response_summary` with zero placeholders or secrets.
- All referenced child reports must pass strict validation; a malformed, failed,
  or unclassified child blocks approval even beside a valid live receipt. Valid
  simulation reports may accompany a live receipt.
- Unified dossiers (`stages`, `dossier_version`) are explicitly rejected as candidates
  in `isGraphqlIntrospectionCandidate`.
- Prompt 247: In `checkEvidenceFileContents`, `isGraphqlIntrospectionCandidate` is now
  strictly enforced. Any non-candidate JSON file or disguised dossier fails closed with
  `'A referenced GraphQL introspection report is invalid or failed'`, even when referenced
  beside a valid live receipt. Referencing only a non-candidate produces both the child report
  requirement and invalid/failed report blockers.
- Category 9 is enclosed in the narrow safe evidence boundary (`checkEvidenceFile`),
  mapping any missing, malformed, non-object, non-candidate, or throwing file to the
  fixed blocker `'A referenced GraphQL introspection report is invalid or failed'` and suppressing
  private file paths, canary tokens, stack traces, and internal errors.
- Unresolved example readiness record failed closed with 0 approved categories,
  11 blocked, and 70 blockers.

### 10. Deployment & Rollback (`deployment_and_rollback`)

- Preflight/rehearsal: `bash scripts/ops/run-deployment-drill.sh --dry-run`;
  separately supplied live, release-bound operator child receipt is required.
- Preflight evidence: `backups/deployment-drill-evidence-<timestamp>-<pid>-<uuid>.json`
  always declares `execution_mode: "simulation"`, regardless of dry-run/probe flags.
  Explicit `--evidence-file` destinations must be absent, including symlinks and
  directories; receipts are published privately without replacing retained files.
  `--cwd` selects the target repository for relative config/evidence paths.
  `--dry-run` records metadata and does not disable all optional probes; use the
  isolated `npm run ops:deployment-test` suite for safe repository verification.
- Release evidence: reviewed source commit, client and server manifest digests,
  approved provenance verification for each, and both previous known-good
  digests. Include the release-image preflight and Compose `config --quiet`
  result; static checks alone do not establish live readiness.
- Record `release.reviewed_source_commit`, `release.current.client_image`,
  `release.current.server_image`, `release.previous.client_image`,
  `release.previous.server_image`, `release.client_provenance_evidence`,
  `release.server_provenance_evidence`, and `release.live_drill_evidence`.
  The approver inspects both external verification artifacts and the live drill
  evidence. In the release shell, export the exact current pair and run
  `npm run ops:launch-readiness -- <record>` (or
  `node scripts/ops/check-launch-readiness.js <record>`), followed by
  `node scripts/ops/check-release-images.js` and production Compose
  `config --quiet` in that same shell. Approved deployment checks require
  the exported pair. The checked-in unapproved template still fails with
  operator blockers when no pair is exported.
- Accept: target host profile, pinned OCI registry path, named
  `deployment_approver` and `rollback_authority`, image provenance policy
  (signed, additive migrations only), `live_readiness_drill_completed: true`
- An approved record must reference a concrete, successful **live**, release-bound deployment drill
  child JSON report in `evidence` or `release.live_drill_evidence`. A custom
  path is accepted by report content, not name. Its UTC timestamp (basic
  `YYYYMMDDTHHMMSSZ` or ISO 8601) must be real and no later than validation
  time. Every referenced deployment drill report must pass: `status: "success"`,
  `schema_backward_compatible: true`, `rollback_procedure_verified: true`,
  `caddy_routing_verified: true`, safe integer `caddy_routes_tested >= 12`,
  `security_headers_verified: true`, `s3_sigv4_host_preserved: true`,
  `migrations_verified: true`, safe integer `migration_count >= 0`,
  `operational_templates_verified: true`, `secrets_scan_verified: true`,
  `readiness_probes_verified: true`, `network_isolation_verified: true`,
  and matching `graceful_drain_periods_verified` (`caddy: '30s'`, `next: '30s'`,
  `api: '45s'`, `worker: '60s'`). A failed or malformed report blocks even
  alongside a valid one. The unified dossier alone, prose, and
  `live_readiness_drill_completed: true` without child evidence are insufficient.
- **Live child contract (prompt 236):** See the complete operator receipt fields
  and independent inspection requirements in `docs/operations.md` prompt 236.
  Requires explicit live mode, false dry-run, true probe flag, production scope,
  environment/authorization/operator references, an exact release identity and
  eight exact passed/verified/source-pointer observations: promotion, rollback,
  ingress, migration compatibility, readiness, graceful drain, network isolation
  and image provenance. Every live child must match the parent's source commit
  and all four image references. Invalid explicit clocks, contradictory timestamps,
  unsafe counts, malformed maps/references and placeholder/secret text fail closed.
  Valid simulation can accompany a live child but cannot clear approval alone.
  Dossiers are excluded regardless of filename; failed/malformed children still block.
  Fixed evidence-file blockers suppress private paths, diagnostics and nested
  formatting exceptions. Source pointers are never fetched: assertions do not
  prove execution, authenticated provenance or downtime; operator inspection remains mandatory.
  The DDL heuristic and configured drain strings establish only preflight shape.
  Regenerate legacy receipts as simulation or supply separate inspected live evidence.
- Fail-closed validator enforcement (`scripts/ops/check-launch-readiness.js`):
  - Requires at least one concrete, successful live release-bound deployment drill child report in `evidence` or `release.live_drill_evidence` for approved status;
  - Rejects deployment drill evidence reporting failure (`status !== 'success'`), schema backward compatibility failure (`schema_backward_compatible: false`), rollback procedure verification failure, Caddy routing verification failure, network isolation verification failure, missing security headers or S3 sigv4 verification, untested routes (< 12), invalid migration counts, or invalid graceful drain periods;
  - Rejects Unified Launch Evidence Dossiers reporting `deploymentBaseline.status: "breached"`, `summary.deploymentCompliance: "failed"`, or `summary.rollbackCompliance: "failed"`.
- **Prompt 246 update (2026-10-01):** Unified launch evidence dossiers are safely
  recognized in Category 10 evidence arrays via `validDeploymentDossier` without
  false-positive blockers when accompanying live operator receipts. Dossiers must
  report `overall_status === 'PASSED'`, verified `deploymentBaseline`, and
  unbreached summary compliance flags. A dossier alone cannot approve Category 10.
- **Prompt 252 update (2026-10-02):** Hardened release provenance evidence validation
  in Category 10 (`checkEvidenceFileContents` in `scripts/ops/check-launch-readiness.js`):
  local JSON files referenced in `client_provenance_evidence`, `server_provenance_evidence`,
  or `live_drill_evidence` must report string `status: 'success'`, non-failing `overall_status`,
  `success !== false`, and zero errors (array or singular `error`), failing closed with
  `'A referenced deployment drill report is invalid or failed'` if any failure condition is present.
  Exported validation helpers `validDeploymentRelease`, `parseDeploymentDrillTimestamp`,
  `validRecoveryReference`, `validVolumeReference`, and `validDomainTlsReference` in `module.exports`.
- **Prompt 253 update (2026-10-02):** Exported all remaining readiness validation helpers
  and constants (`isEvidenceFileReference`, `expandEvidenceGlob`, `parseUtcDate`,
  `parseRestoreTimestamp`, `parseSecretRotationTimestamp`, `parseSmtpTimestamp`,
  `validVolumePath`, `validVolumePaths`, `validVolumeSection`, `isRotationReference`,
  `validSmtpText`, `validSmtpEmail`, `validSmtpSecretReference`, `isValidGraphqlEndpoint`,
  `hasExactKeys`, `DEPLOYMENT_OBSERVATIONS`, `NO_AI_JOURNEYS`) in `scripts/ops/check-launch-readiness.js`.
  Added defensive type guards in `expandEvidenceGlob` and `parseUtcDate`, and comprehensive
  unit and contract test coverage across all helpers in `scripts/ops/check-launch-readiness.spec.js`.
- **Container health & edge ingress gating (Prompt 226, 2026-09-28):**
  The production Compose template defines an explicit bounded healthcheck for
  `next` (`wget -qO- http://127.0.0.1:3000/ || exit 1`, interval: 30s, timeout: 5s,
  start_period: 15s, retries: 3) matching `infra/docker/client.Dockerfile.example`.
  `caddy.depends_on.next` enforces `condition: service_healthy`, eliminating edge
  routing to unready frontend instances. `clamav` healthcheck adds `start_period: 30s`.
  The container security auditor (`scripts/ops/verify-container-security.js`) enforces
  bounded healthchecks across all seven core services (`api`, `worker`, `next`, `postgres`,
  `valkey`, `garage`, `clamav`), verifies that all ten internal services attach exclusively
  to the private internal network, and enforces that all Caddy backend dependencies require
  `condition: service_healthy`.
- **Observability health & dependency gating (Prompt 227, 2026-09-28):**
  The production Compose template defines an explicit bounded healthcheck for
  `prometheus` (`wget -qO- http://127.0.0.1:9090/-/healthy || exit 1`, interval: 30s,
  timeout: 5s, start_period: 15s, retries: 3). `postgres-exporter` defines
  `depends_on.postgres: condition: service_healthy`, preventing unready database
  scrape connection failures. `grafana` defines `depends_on.prometheus: condition: service_healthy`,
  preventing dashboard queries against an unready Prometheus server. `run-deployment-drill.sh`
  and `verify-container-security.js` enforce private network isolation across all ten internal
  services (`next`, `api`, `worker`, `postgres`, `valkey`, `garage`, `clamav`, `prometheus`,
  `postgres-exporter`, `grafana`), and container security audits verify observability health
  and dependency gating fail-closed.
- **Application container dependencies & shutdown lifecycle (Prompt 228, 2026-09-28):**
  Static preflight and container security audits (`verify-container-security.js` and `check-production-templates.sh`)
  strictly validate that `api` gates on healthy `postgres`, `valkey`, and `garage`, and `worker` gates on healthy
  `postgres`, `valkey`, `garage`, and `clamav`. `process-init-supervision` enforces both `init: true` and `stop_signal: SIGTERM`
  on `api`, `worker`, and `next`. `graceful-shutdown-lifecycle` verifies `restart: unless-stopped` and bounded `stop_grace_period`
  across all eleven production services, asserting expected application drain timeouts (`caddy: 30s`, `next: 30s`, `api: 45s`, `worker: 60s`).
- **Deployment promotion drill runner hardening & test suite (Prompt 229, 2026-09-28):**
  `scripts/ops/run-deployment-drill.sh` step 5 validates full operational container lifecycle requirements
  fail-closed during deployment preflights: `restart: unless-stopped` and bounded `stop_grace_period` across all 11
  services, application drain timeouts (`caddy: 30s`, `next: 30s`, `api: 45s`, `worker: 60s`), application dependency
  health gating (`api`, `worker`, `caddy`, `grafana`, `postgres-exporter`), and process signal supervision (`init: true`,
  `stop_signal: SIGTERM`). CLI arguments are protected with non-empty value guards. Automated regression suite
  `scripts/ops/run-deployment-drill.spec.js` covers CLI flags, argument parsing, fail-closed Compose validation, and
  structured evidence emission under `npm run ops:deployment-test` and `npm run ops:check`.
- **Secret rotation drill runner hardening & test suite (Prompt 230, 2026-09-28):**
  **Current qualification (prompt 235):** Those results are rehearsal only;
  production approval requires the explicit live operator receipt in Category 3.
  `scripts/ops/run-secret-rotation-drill.sh` validates CLI options fail-closed with non-empty argument guards for
  `--evidence-dir`, `--evidence-file`, `--api-url`, `--pghost`, `--pgport`, `--valkey-host`, and `--valkey-port`.
  Step 1 executes `scripts/ops/check-production-templates.sh`, `scripts/ops/scan-secrets.sh`, and `verify-volume-encryption.js`
  to guarantee template and secret integrity before drill execution. Automated regression suite
  (`scripts/ops/run-secret-rotation-drill.spec.js`, 7/7 passed) tests CLI usage, argument guards, `--dry-run` execution,
  custom file/dir destinations, and strict compliance with Category 3 (`secrets_management`) validation rules.
  `ops:rotation-test` is integrated into `npm run ops:check`.


**Prompt 214 Category 10 intake — 2026-09-27T19:53:01Z UTC.** Reviewed
`353748a` on `main`. The repository-visible readiness file is only the
unresolved `infra/launch/readiness.example.json`: Category 10 has
`__REQUIRED_*__` release fields, `live_readiness_drill_completed: false`, no
approver and no evidence. No materialized production readiness record, pinned
current or previous image pair, registry manifest, signature or provenance
receipt, protected promotion record, materialized production Caddy/Compose
configuration, live promotion or rollback transcript, or dated release-manager
decision was available for inspection in the repository. This does not establish
what may exist in the operator's restricted evidence store. Category 10 remains
**unresolved**; the §7 release-manager signature stays blank.

The repository has eight local `backups/deployment-drill-evidence-*.json`
reports dated 2026-09-09 through 2026-09-25. Each inspected report says
`status: "success"`, `dry_run: true`, and `probe_live_tested: false`, and names
`infra/compose/docker-compose.production.example.yml`; the latest names
`infra/caddy/Caddyfile.example`. Their `rollback_procedure_verified: true` and
`readiness_probes_verified: true` describe static procedure/readiness checks,
not an observed production rollback or live API probe. No production target or
release identity is bound to these reports. The validator's child-report checks
can establish report consistency, but cannot authenticate an image digest,
attestation, approval, promotion, or rollback. A locally successful drill or
seven-stage dossier therefore supplies no Category 10 production approval.

The **release manager**, **deployment approver**, and **rollback authority**
must supply, through the approved operator channel, the selected target host
profile and registry prefix; reviewed 40-hex source commit; distinct pinned
current and previous client/server image references with matching registry
manifests; separate verification receipts binding each current digest to that
source; approved provenance policy; materialized Caddy/Compose references;
release-shell image export, release-image checker and Compose `config --quiet`
results; successful target-bound deployment child JSON report and operator
transcript showing live ingress, readiness, migration compatibility, promotion,
drain, rollback and post-rollback health; restricted evidence location; and a
dated Category 10 sign-off. Read-only inspection of redacted or opaque
references is the next safe action. Any production promotion, rollback,
migration or traffic switch requires a separately authorized maintenance
window and named operator. Do not place credentials, keys, or unredacted host
inventory in Git. Categories 1–9 and 11, and prompt 201's final launch sign-off,
remain separate unresolved gates.

Repository verification for this intake: `npm run ops:readiness-schema-test`
passed (1/1); `node --test scripts/ops/check-release-images.spec.js` passed
(1/1); `npm run ops:templates` printed `ops template check passed`; `npm run
lint` and `npm run typecheck` exited 0; and `git diff --check` exited 0.
`node scripts/ops/check-launch-readiness.js
infra/launch/readiness.example.json` exited 1 as designed with 11 required,
0 approved, 11 blocked and 70 blockers. The readiness suite did not pass:
its direct run reported 102/103 tests passing and one `spawnSync ... EPERM`
failure in the CLI/aggregate wrapper test; the `node --test` parent reported
the file failed without a test-level diagnostic. `npm run ops:check` stopped
at `ops:audit` because DNS resolution of `registry.npmjs.org` returned
`EAI_AGAIN`, so later sub-suites did not run in that command. `npm run build`
stopped in the Next 16.3.4 client build with `Could not parse output from
TypeScript's --showConfig`. These environment failures are not passes and none
of the repository checks proves a production promotion or rollback.

### 11. No-AI Production Posture (`optional_ai_posture`)

- Drill/verify: `node scripts/ops/check-launch-readiness.js <record>` (fail-closed AI gates)
- Evidence: reference a concrete no-AI production posture child JSON report in
  `evidence`, with redacted API and worker runtime inventories, no-AI journey
  test run references, and a production provider policy reference. The child has
  exactly these top-level fields:
  - `drill_type: "no_ai_production_posture_verification"`, real nonfuture ISO UTC
    `timestamp`, `status: "success"`, `errors: []`, `environment: "production"`;
  - `runtime.api` and `runtime.worker`, each containing exactly
    `ai_draft_enabled: false`, `gemini_api_key_present: false`, and a nonempty
    `inventory_reference` to a redacted live runtime inventory;
  - `journeys.analytics_dashboard`, `journeys.governed_report`, and
    `journeys.export_download`, each containing exactly `passed: true` and a
    nonempty `test_reference` to the corresponding production no-AI run;
  - `unpaid_provider_excluded: true` and a nonempty
    `provider_policy_reference`.
- Accept: `ai_enabled: false`, `no_ai_path_verified: true`,
  `server_ai_draft_enabled_false: true`, `no_gemini_api_key_provisioned: true`,
  `unpaid_provider_excluded: true`, non-empty `phase11_status`, and all referenced
  Category 11 JSON reports passing the child contract. A custom path is valid;
  prose, a unified dossier alone, missing reports, and failed wildcard matches
  do not qualify. The validator checks report consistency only. The operator
  must inspect the referenced production API and worker inventories, verify
  absence of `GEMINI_API_KEY` without exposing values, run the deterministic
  journeys, and review the provider policy before approval.

**Prompt 215 Category 11 intake — 2026-09-27T20:46:50Z UTC.** Reviewed
`6f29a63` on `main`. The repository-visible readiness record is only the
unresolved `infra/launch/readiness.example.json`: Category 11 has
`no_ai_path_verified: false`, `server_ai_draft_enabled_false: false`,
`no_gemini_api_key_provisioned: false`, `unpaid_provider_excluded: false`, no
approver, and no evidence. No selected production deployment/release identity,
operator-owned readiness record, restricted evidence-store location, redacted
API or worker inventory, production provider-policy sign-off, production
journey run, Category 11 child JSON report, or dated product/security decision
was available in the approved repository paths for inspection. This does not
establish what may exist in the operator's restricted store. Category 11 stays
**unresolved**; the §7 product/security signature stays blank.

The repository's `AI_DRAFT_ENABLED=false` default, Phase 11A policy text,
and locally mocked Playwright journeys support the intended no-AI design,
but do not prove the selected production API and worker runtime states or
deployed tenant journeys. No production `AI_DRAFT_ENABLED=false` runtime
assertion, `GEMINI_API_KEY` absence assertion for environments and secret
mounts, unpaid-provider exclusion policy, or
analytics/dashboard, governed-report, and export-download result was inspected.
The Category 11 validator checks child-report structure and consistency; even
a passing child would require independent inspection of its live sources. Prompt 247:
in `checkEvidenceFileContents`, `isNoAiPostureCandidate` is now strictly enforced.
Any non-candidate JSON file or disguised dossier fails closed with
`'A referenced no-AI production posture report is invalid or failed'`, even when referenced
beside a valid live receipt. Referencing only a non-candidate produces both the child report
requirement and invalid/failed report blockers.

The **product and security leads** must provide opaque references and read-only
access to the selected deployment/release and restricted evidence store; separate
redacted API and worker runtime inventories showing the flag disabled and the
key absent without exposing values; the approved provider policy; and three
timestamped, target-bound deterministic journey records with runner, result,
and redacted trace or request/artifact references. They must supply a successful
`no_ai_production_posture_verification` child JSON report and a dated joint
decision. Compare the release with Category 10, validate every referenced
child report, inspect its sources, then update only the operator-owned record
and run its schema/readiness checks. Any fresh report/export production writes
or downloads need the named operator's target, account, permitted actions, and
cleanup authorization. No raw environment dump, key, token, or tenant data
belongs in Git. Categories 1–10 and prompt 201's final launch sign-off remain
separate unresolved gates.

Repository verification for this intake: `npm run ops:readiness-schema-test`
passed (1/1); `npm run ops:templates` printed `ops template check passed`;
`npm run lint`, `npm run typecheck`, and `git diff --check` exited 0.
`node scripts/ops/check-launch-readiness.js
infra/launch/readiness.example.json` exited 1 as designed: 11 required,
0 approved, 11 blocked, 70 blockers. The readiness suite did not pass:
`node --test scripts/ops/check-launch-readiness.spec.js` exited 1; its direct
run reported 102/103 tests passing with `spawnSync ... EPERM` in the
CLI/aggregate wrapper test. `npm run ops:check` stopped at `ops:audit` because
DNS resolution of `registry.npmjs.org` returned `EAI_AGAIN`; subsequent checks
in that command did not run. `npm run build` stopped in the Next 16.3.4 client
build with `Could not parse output from TypeScript's --showConfig`. None of
these repository checks establishes a production runtime or journey result.

## 4. Unified Drill Execution & Evidence Dossier

**Standalone container-verifier inspection/regeneration (prompt 277):** Run
`node scripts/ops/verify-container-security.js --help`,
`npm run ops:container-test`, or `npm run ops:container-security` without output
for local inspection. Explicit saving requires a fresh absent destination and
stable directory ancestors without symlinks; choose a new path instead of
deleting/overwriting retained evidence. Private verified staging publishes
exclusively, with a 1 MiB receipt ceiling. Completed failed evaluations can be
saved, but exit 1 and fail stage/dossier/readiness consumers. Source read and
publication faults cannot fabricate success. Output/cleanup failure after
publication preserves the receipt and stays nonzero. CLI evidence uses fixed
check/source identities and safe messages; direct helper diagnostics remain
local caller data. Hard-link support is required, and interruption or uncertain
ownership can leave staging requiring inspection before operator cleanup.
Bounded static template checks do not certify images, running containers,
cryptographic provenance or production launch.

**Standalone SAST inspection/regeneration (prompt 276):** Run
`node scripts/ops/run-sast-scan.js --help`, `npm run ops:sast-test`, or
`npm run ops:sast` without output for local inspection. Explicit saving requires
a fresh absent destination and stable directory ancestors without symlinks;
choose a new path instead of deleting/overwriting retained evidence. The producer
creates private missing parents/staging and exclusively publishes a verified
receipt at most 1 MiB. Completed blocker/expired-suppression reports may be saved
for diagnosis, but exit 1 and fail stage/dossier/readiness consumers. Output or
cleanup failure after publication retains the receipt and remains nonzero.
Detected-secret finding/matching suppression snippets are redacted; other local
source/triage metadata remains intentional evidence, so this is not universal
redaction. Unsupported hard links fail without destructive fallback; interruptions
can leave staging and require ownership inspection before operator cleanup.
These commands supply local regex evidence, not production sign-off.

**Standalone SBOM inspection/regeneration (prompt 275):** Run
`node scripts/ops/generate-sbom.js --help`, `npm run ops:sbom-test`, or
`npm run ops:sbom` without output for local inspection. Explicit saving requires
an absent destination with directory ancestors without symlinks; choose a new
path rather than deleting or overwriting retained evidence. The producer creates
private missing parents/staging and exclusively publishes a verified receipt no
larger than 16 MiB. A completed license-failed BOM may be saved for diagnosis,
but the command exits 1 and consumers reject it. Output/cleanup failure after
publication retains the receipt and exits nonzero. These commands supply local
inventory evidence, not production sign-off.

`scripts/ops/run-launch-drills.sh` runs all 7 stages and writes
`backups/launch-evidence-dossier-<uuid>.json`:

| #   | `stage_id`           | covers                                                                                          |
| --- | -------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | `static_templates`   | production templates, docker runtime, secret scan; `static-integrity-evidence-<timestamp>.json` |
| 2   | `supply_chain_sast`  | SBOM + licenses, SAST scan, container security                                                  |
| 3   | `ingress_deployment` | Caddy routing verify, deployment configuration preflight/rehearsal                              |
| 4   | `volume_encryption`  | volume declarations + limited local filename scan preflight                                     |
| 5   | `secret_rotation`    | secret rotation drill                                                                           |
| 6   | `capacity_alerting`  | capacity benchmark, DoS resilience, alert simulation                                            |
| 7   | `disaster_recovery`  | restore drill + storage reconciliation                                                          |

Flags: `--dry-run`, `--json`, `--verbose`, `--allow-hsts`, `--help`/`-h`,
and value options `--output`, `--evidence-dir`, `--caddyfile`, `--compose-file`,
`--target-url`, `--api-url`, `--database-telemetry-file`. Value options accept
separate or attached `=` values once each. Duplicates, blanks, controls, unknown
flags and positional input fail before resources or children. Relative paths
resolve against the installed repository regardless of caller cwd. Explicit
`--output` still retains logs/receipts under `--evidence-dir`; it does not
suppress that directory. The final dossier must be absent, including files,
directories and links. Output equal to or above the evidence directory is
rejected before creation. Parent directories must be usable directories without
symlink ancestors. Existing parent permissions are preserved.

Exit 0 requires seven passing stages and successful verification/publication/
cleanup. Evaluated stage failures continue through all seven stages, publish a
complete FAILED dossier and exit 1. Invocation, machinery, publication or
unverified termination failures can stop without a dossier. Child exits and
receipt validity are independently required. Completion output remains pending
receipt checks until the final validated verdict. Console errors are fixed;
private child diagnostics stay in retained logs.

`--dry-run` disables supported child mutation/traffic. Static integrity can
contact npm, rotation preflight can observe configured reachability, and
reconciliation needs drill services. Rotation and reconciliation always receive
`--dry-run`; dry restore lacks successful recovery evidence. Only fixture tests
are isolated from services. No live unified execution is authorized by the
repository implementation workflow.

**Targeted drill invocation (prompt 202):** In a separately approved drill window,
use `bash scripts/ops/run-launch-drills.sh --caddyfile <materialized-Caddyfile>
--compose-file <materialized-compose> --allow-hsts --target-url
<approved-benchmark-URL> --api-url <approved-API-origin>
--database-telemetry-file <fresh-Prometheus-evidence.json> --evidence-dir
<restricted-directory>`. The API URL must be an origin; both URLs must be HTTP(S)
without userinfo, query, or fragment. `--dry-run` conflicts with live URL and
telemetry arguments. A no-target run remains a default drill and cannot produce
production-candidate Stage 6 evidence. `environment` remains `"drill"` in every
dossier; `targets.mode` is `offline`, `default-drill`, or `live-target-drill`.
`targets` stores SHA-256 identifiers for the selected files and URLs, without
raw URL credentials or query strings. Stage 3 summarizes deployment preflight;
its targeted health observations do not exercise promotion, drain or rollback
and cannot satisfy Category 10 live approval. Stage 3 requires both child reports to
bind to the same Caddyfile and selected Compose file, at least 12 passing routes,
and, for targeted evidence, approved active HSTS, a non-example domain matching
the benchmark URL host, and live API probes returning the Acres liveness and
database/storage readiness envelopes for the selected API origin. Stage 6 requires live capacity
mode and matching target identifiers. The supplied telemetry JSON must state
`source: "prometheus-live-scrape"`, `probeHealthy: true`, a fresh ISO
`timestamp`, and a matching `targetId` (SHA-256 of the normalized benchmark
URL). Calculate that identifier with `node -e 'const {safeUrl,targetId}=
require("./scripts/ops/launch-target-evidence"); console.log(targetId(safeUrl(
process.argv[1])))' '<approved-benchmark-URL>'`. It must include
`postgresExporter.up/lastScrapeError`,
`postgresServer.pgUp/maxConnections/activeConnections`, API and worker
`connectionPool` totals/idle/max/requestsWaiting,
`poolAcquisitionLatency` and `queryExecutionDuration` p50Ms/p95Ms/p99Ms for
both roles, and `serverActivity.lockWaits/maxTransactionDurationSec`.
The file is capped at 64 KiB. Missing, stale, mismatched, nonfinite, or breached
telemetry rejects the invocation before resources, stages or service probes;
Stage 6 also revalidates it against the completed run using the existing
60-second scrape tolerance. Alert rule simulation remains simulation; operator
verification of alert delivery, live TLS, promotion/rollback, and sign-off is
separate. A 7/7 drill dossier alone cannot approve production.

The Unified Launch Evidence Dossier publishes root `execution_mode: "simulation"` alongside `environment: "drill"` and aggregates structured baselines from child evidence across all operational dimensions:

- `staticIntegrityBaseline` (stage 1): the three fixed checks, their exit codes, and total/passed/failed counts; `summary.staticIntegrityCompliance` is passed only when the complete child evidence is valid and stage 1 passed;
- `supplyChainBaseline` (stage 2): package inventory count, license compliance verification, license violations, SAST scanned files, findings count, triaged/expired/blocking findings, container security validity, and container security checks count;
- `deploymentBaseline` (stage 3, preflight/rehearsal only): `deploymentPreflight: "simulation"`, schema compatibility heuristic, Caddy routing verification, rollback procedure verification, network isolation, migration count, and tested routes;
- `volumeEncryptionBaseline` (stage 4): `volumePreflight: "simulation"`, stateful declaration evaluation, required mount counts, and limited local filename-scan preflight;
- `secretRotationBaseline` (stage 5): `rotationPreflight: "simulation"`, verified 7-step simulation rehearsal (session, CSRF, database, Valkey, storage, compromise response, and credential redaction audit);
- `databaseTelemetryBaseline` (stage 6): `capacityPreflight: "simulation"` (synthetic) or `"live"` (target-bound), exporter health, database ping, connection pool saturation metrics, pool acquisition p95 latency, SQL query execution p95 latency, lock waits, and transaction age;
- `disasterRecoveryBaseline` (stage 7): `restorePreflight: "simulation"`, `reconciliationPreflight: "simulation"`, restore drill RTO, table parity, migration parity, PostGIS/foreign-key verification, and storage object reconciliation;
- `summary`: compliance flags across static integrity, supply chain security, supply chain compliance, SAST compliance, container security compliance, ingress/deployment, volume encryption, secret rotation, capacity alerting, disaster recovery, preflight status markers (`deploymentPreflight`, `volumePreflight`, `rotationPreflight`, `capacityPreflight`, `restorePreflight`, `reconciliationPreflight`/`reconcilePreflight`), SLO compliance, recovery compliance, alert verification, DoS resilience, database baseline compliance, restore compliance, reconcile compliance, deployment compliance, rollback compliance, secret rotation compliance, volume encryption compliance, and no-AI posture.

Implementation notes (prompt 233): Bash allocates a private
`launch-drill-run-<unique-id>/<stage_id>/` tree under `--evidence-dir`. Stage
logs are `launch-drill-stage-<stage_id>.log` inside those directories; each
child receives its exact registered receipt path. Dossiers list absolute
registered paths, including expected missing receipts for diagnosis; no
unexpected/intermediate file is selected. New directories are 0700 and files
0600, with existing parent permissions preserved. Symlink/nonregular paths,
missing, malformed, stale/future, oversized or changing receipts fail closed.
Limits are 16 MiB SBOM, 64 KiB capacity aggregate, and 1 MiB other reports.
Every required baseline/compliance failure updates its stage and the final
counts/summary before `overall_status` is computed.

Current publication/cleanup contract (prompt 271): invocation-token locks
reserve absent outputs. Existing dossiers survive byte-for-byte; operators must
select a fresh absent destination to regenerate evidence. Complete JSON is
written to owned same-directory staging, read back with a 1 MiB bound and checked
against the real assembler and exact invocation before exclusive atomic hard-link
publication. A non-cooperating concurrent destination wins without replacement.
Schema `1.0.0`, seven ordered IDs, counts, verdict, simulation/drill root markers,
target hashes and registered artifact paths remain checked. The parent's private
snapshot is independently verified before counts/`--json`; the final destination
is never reread for its verdict. Human progress still precedes JSON, including
on evaluated failure. Cleanup failure cannot print a passing summary.

Linux procfs with visible process-group states is required. Main/cleanup use
Bash `wait -f`, so stopping a job does not complete it. Ownership remains until
active same-group members terminate. Descendants outliving a successful leader
fail that stage and are terminated before later work; bounded TERM polling
escalates to KILL only for that owned group. INT/TERM/HUP stop later stages and
preserve signal exits 130/143/129 when cleanup succeeds. Failure to verify
termination exits nonzero and retains the reservation for operator inspection.
The runner reaps its direct leader; terminated orphan zombies are host-owned.

Catchable cleanup removes only owned publication staging/lock and private
control snapshots. Run trees/logs/receipts remain, including failed and
interrupted runs. Partial staging-close failures remain owned for cleanup;
failed unlink retains the token lock for retry. SIGKILL, host loss or deliberate
detachment into another group can leave resources/processes. Confirm ownership
and termination before explicit operator cleanup; the runner never steals a
reservation or sweeps shared directories. Preserve trees referenced by evidence.
Controlled filesystem/process visibility is required; arbitrary write access to
owned directories is outside these guarantees. Freshness/private paths do not
prove cryptographic provenance or production acceptance.

Secret rotation always runs `--dry-run`; reconciliation remains read-only and
requires live services. Dry restore preflight supplies no successful receipt,
so missing recovery evidence still fails Stage 7. Stage 6 validates actual
nested capacity, alert, DoS, and database gates. Prompt 234 (2026-09-30) resolves
the readiness Category 5 producer-field mismatch and aligns the capacity-specific
API identity with the DoS origin hash; see `docs/operations.md`. Its separate
production gate stays fail-closed.
Safe inspection from the repository root:

```bash
bash scripts/ops/run-launch-drills.sh --help
npm run ops:launch-drill-test
```

Prompt 271 verification: `tests 162`, `pass 162`, `fail 0`. Independent follow-up
review passed all three reviewed fixes with focused `tests 14`, `pass 14`,
`fail 0`. No unstubbed unified dry or live run was performed. Production audit
still blocks (`37 vulnerabilities (9 moderate, 26 high, 2 critical)`), and
operator sign-off remains required.

Reference a dossier from an approved readiness section by placing its
`backups/launch-evidence-dossier-<uuid>.json` path in that section's
`evidence` array; the validator confirms the file exists, parses as JSON, and
rejects dossiers whose `overall_status`/`status` is `"FAILED"`, or whose
underlying baselines report breach or compliance failure.
Stage 1 child evidence has `drill_type: "static_integrity_verification"`,
`status`, `valid`, `totalChecks: 3`, `passedChecks`, `failedChecks`, and ordered
`checks` for `production_templates`, `docker_runtime`, and `secret_defaults`.
Each successful check requires `passed: true` and `exitCode: 0`; a failed
process may report a nonzero exit code, while spawn failure reports a generic
`failureKind: "spawn_failed"` and null exit code. The readiness validator
rejects inconsistent child evidence and dossier static-integrity breach or
compliance failure. Reference the child artifact alongside the dossier when
reviewing Category 4 secret references; neither substitutes for the remaining
operator sign-off and live drill evidence.

Current Stage 1 publication contract (prompt 272): the static producer accepts
exactly one separate/attached `--output`/`-o` path, resolved against caller cwd.
The effective destination must be absent. Existing regular files, directories,
symlinks/dangling links and unusable/symlink ancestors reject before checks or
output allocation. Installed children/Bash are preflighted; children still run
from the installation root. Standalone help/import have no execution or
filesystem side effects. Regeneration requires a fresh absent path; preserve
all retained receipts and their referenced evidence.

Fixed success and evaluated failure receipts are consistency-checked and
projected without diagnostic extras. Missing/signalled/malformed/spawn-error
results use generic `spawn_failed` and null exit; ordinary integer exits are
0–255. Only error-free unsignalled zero passes. New directories/staging are
0700/0600; existing parent permissions remain. Closed staging is independently
read/checked before exclusive atomic hard-link publication. Competing writers
may both execute checks, but only one publishes at a shared destination; the
loser preserves the winner and removes only its staging. Cleanup failure after
publication preserves final evidence and exits nonzero. Empty new directories
or persistently unremovable owned staging may remain after later failure;
there is no shared sweep. Abrupt termination/host loss/arbitrary directory
writers remain outside these cleanup guarantees. Synchronous child execution
adds no descendant supervision guarantee; unified caller group ownership
remains unchanged. Static evidence still supplies no production category
approval or cryptographic provenance.

Safe inspection from the repository root (without running real children):

```bash
node scripts/ops/run-static-integrity-checks.js --help
npm run ops:static-integrity-test
```

Prompt 272 verification: final static `tests 71`, `pass 71`, `fail 0`;
launch/dossier 164/164, including actual producer success/failure consumed by
Stage 1 and the readiness helper. Independent review's FIFO dead-reader test
hang was fixed using a bounded supervised writer. Follow-up review found no remaining Critical, Important or Minor findings.
The production audit still blocks: `37 vulnerabilities (9 moderate, 26 high,
2 critical)`; no unstubbed static/unified invocation or production approval
occurred. Phase 12, prompt 201 and operator sign-off remain open.

## 5. Incident Response Runbooks (11 Prometheus Alerts)

Alert rules live in `infra/prometheus/alerts.yml`. Severity `critical` pages
the on-call team; `warning` notifies the shared channel — with what tool
(PagerDuty, Slack, email) taken from the operator record's
`slo_and_alerting.alert_recipients`, since `alerts.yml` carries severities and
annotations but no receivers. After every incident: verify the clearing
condition for 15 minutes, then file a post-incident review (timeline, root
cause, action items) before resolving the alert thread.

### AcresApiDown (critical)

- PromQL: `up{job="acres-api"} == 0` for 1m — API process unreachable.
- Dashboard: Panel 2 ("Acres API Status") in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: `docker compose ps api`; `docker compose logs --tail=200 api`;
  `curl -f http://localhost:3001/health`; check host CPU/memory/disk.
- Contain: restart the API container; if the image is bad, roll back to the
  last pinned image per §6. Escalate to `rollback_authority` after 10 minutes
  down or a second failed restart.
- Clear: `up{job="acres-api"} == 1` for 5m and `/health` 200.

### AcresWorkerDown (critical)

- PromQL: `up{job="acres-worker"} == 0` for 1m — Worker process unreachable.
- Dashboard: Panel 11 ("Acres Worker Status") in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: `docker compose ps worker`; `docker compose logs --tail=200 worker`;
  `curl -f http://worker:3002/health` (or private interface); check host CPU/memory/disk,
  Valkey queue connectivity, and PostgreSQL database reachability.
- Contain: restart the worker container (`docker compose restart worker`); if the image
  is bad, roll back to the last pinned image per §6. Escalate to `rollback_authority`
  and on-call backend engineer after 10 minutes down or a second failed restart.
- Clear: `up{job="acres-worker"} == 1` for 5m and `/health` 200.

### PostgresDown (critical)

- PromQL: `pg_up{job="acres-postgres"} == 0` for 1m — PostgreSQL database unreachable or failing connections.
- Dashboard: Panel 15 ("PostgreSQL Database Scrape") in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: `docker compose ps postgres`; `docker compose logs --tail=200 postgres`;
  check socket/port reachability (`docker compose exec postgres pg_isready -U acres_app -d acres`);
  check host disk/filesystem space (`df -h`); inspect exporter logs
  `docker compose logs --tail=200 postgres-exporter` and metrics `/metrics` for scrape errors (`pg_exporter_last_scrape_error`).
- Contain: restart postgres container (`docker compose restart postgres`); resolve any disk space exhaustion;
  verify volume integrity. If database corruption is detected, initiate emergency disaster recovery restore drill per §6.
  Escalate to database administrator and `rollback_authority` after 5 minutes down or a failed restart.
- Clear: `pg_up{job="acres-postgres"} == 1` for 5m.

### PostgresExporterDown (warning)

- PromQL: `up{job="acres-postgres"} == 0` for 1m — postgres-exporter process unreachable.
- Dashboard: Panel 14 ("PostgreSQL Exporter HTTP Scrape") and Panel 16 ("PostgreSQL Collector Error") in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: `docker compose ps postgres-exporter`; `docker compose logs --tail=200 postgres-exporter`;
  check whether container stopped, crashed, or was OOM-killed; check host resources and port contention;
  verify secret file mount `/run/secrets/acres_monitor_password` exists and has correct permissions;
  check whether Prometheus scrape timeout (15s) is exceeded.
- Contain: restart postgres-exporter container (`docker compose restart postgres-exporter`);
  if credential or configuration failure, verify monitor credentials via `DATA_SOURCE_PASS_FILE`;
  if recurring crash, check container memory and network connectivity. Note: production database
  traffic and API/worker services are unaffected unless `PostgresDown` also fires.
  Escalate to on-call SRE if exporter remains down > 15m.
- Clear: `up{job="acres-postgres"} == 1` for 5m.

### HighHttp5xxRate (critical)

- PromQL: `(sum(rate(acres_http_requests_total{job="acres-api",status_class="5xx"}[5m])) / clamp_min(sum(rate(acres_http_requests_total{job="acres-api"}[5m])), 0.001)) * 100 > 5` for 5m — server error burst.
- Dashboard: Panel 6 ("HTTP 5xx Error Rate") in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: `docker compose logs --tail=500 api | grep -E ' 5[0-9]{2} '`;
  correlate deploy time with error onset; check Postgres/Valkey/Garage reachability.
- Contain: if onset matches a deploy, roll back per §6; otherwise shed load
  (Caddy rate limits) and restart unhealthy dependencies. Escalate to
  `rollback_authority` if the rate does not fall within 15 minutes.
- Clear: 5xx share back under 1% for 15m (operator-defined clearing bar, stricter than the 5% fire threshold).

### P95LatencyThresholdExceeded (warning)

- PromQL: `histogram_quantile(0.95, sum(rate(acres_http_request_duration_seconds_bucket{job="acres-api"}[5m])) by (le)) > 0.5` for 5m.
- Dashboard: Panel 7 ("HTTP Request Latency Percentiles") alongside Panels 23/24 (API/Worker pool acquisition latency) and Panels 25/26 (API/Worker query execution latency) in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: `node scripts/ops/verify-capacity-load.js --synthetic` for the SLO
  baseline; inspect route patterns, slow-query evidence, dependency health,
  and in-flight HTTP requests. Inspect API pool
  `acres_postgres_pool_connections_total`,
  `acres_postgres_pool_connections_idle`,
  `acres_postgres_pool_connections_max`, and
  `acres_postgres_pool_requests_waiting` alongside PostgreSQL evidence before
  attributing latency to connection pressure. Check API pool acquisition
  latency percentiles (`acres_postgres_pool_acquisition_duration_seconds{job="acres-api"}`):
  elevated p95/p99 latency (e.g. > 50ms) confirms connection checkout queueing
  in `pg.Pool`, whereas low acquisition latency (< 1ms) isolates delay to
  query execution or downstream processing. Inspect API and Worker SQL query
  execution latency percentiles (`acres_database_query_duration_seconds`):
  elevated query latency (e.g. p95 > 100ms) confirms slow database execution or
  unindexed scans, while low query latency points to application compute or
  external service delays. Waiting above zero shows local
  acquisition backlog; total equaling max alone does not prove saturation.
  Compare worker pool backlog and acquisition latency, sampled lock waits, and oldest transaction age;
  use the database procedure below to confirm blockers before assigning cause.
- Contain: address the observed bottleneck within the approved host profile;
  use existing rollback authority if onset matches a deployment. Escalate to on-call SRE
  if p95 exceeds 2s or availability SLO is threatened.
- Clear: p95 back under 500ms for 15m (operator-defined; matches the fire threshold).

### High429Rate (warning)

- PromQL: `(sum(rate(acres_http_429_responses_total{job="acres-api"}[5m])) / clamp_min(sum(rate(acres_http_requests_total{job="acres-api"}[5m])), 0.001)) * 100 > 10` for 5m.
  The numerator counts HTTP 429 responses only. Treat it as a rate-limit
  spike / possible credential-stuffing or DoS signal; confirm the route and
  client context in access logs before acting.
- Dashboard: Panel 28 ("API HTTP 429 Rate Percentage") in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: inspect Panel 28 in Grafana (`API HTTP 429 Rate Percentage`) for the rate trend; inspect top offending IPs/routes in Caddy access logs; check whether the
  spike is one client (abuse) or broad (misconfigured client release).
- Contain: block abusive IPs at Caddy, tighten Throttler windows, rotate
  exposed credentials if stuffing is suspected. Escalate to security lead on
  confirmed credential-stuffing patterns. See also the DoS drill:
  `bash scripts/ops/run-dos-resilience-drill.sh --dry-run`.
- Clear: 429 share back under 2% for 15m with no single-IP dominance (operator-defined clearing bar).

### QueueDeadLettersDetected (warning)

- PromQL: `sum(acres_queue_jobs_total{job="acres-worker",status="failed"}) > 0` for 1m.
- Dashboard: Panel 4 ("Queue Dead Letters") in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: list dead-letter jobs in Valkey/BullMQ; inspect worker logs for the
  failing handler and payload class.
- Contain: pause the failing queue, fix or quarantine the poison payload,
  replay dead letters after the fix. Escalate to owning backend engineer if
  dead letters grow while paused.
- Clear: dead-letter count back to 0 and worker lag nominal for 15m (operator-defined).

### OutboxDeliveryLag (warning)

- PromQL: `acres_outbox_pending_events{job="acres-api"} > 50` for 10m.
- Dashboard: Panel 3 ("Pending Outbox Events") in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: check worker liveness and queue depth; look for stuck outbox
  dispatcher transactions or down downstream sinks.
- Contain: restart the worker, clear the blocking event (quarantine, never
  delete without a record), replay. Escalate to on-call SRE past 60 minutes
  of lag.
- Clear: pending events back under 10 for 15m (operator-defined clearing bar, stricter than the 50-event fire threshold).

### HighHttpConcurrency (warning)

- PromQL: `acres_http_active_requests{job="acres-api"} > 40` for 2m — more than 40 API HTTP
  requests in flight; this gauge does not measure database pool occupancy.
- Dashboard: Panel 27 ("API In-Flight Active HTTP Requests") in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: inspect Panel 27 in Grafana (`API In-Flight Active HTTP Requests`) for in-flight request load; inspect route patterns, p95 latency, 5xx,
  and dependency health. Check the API pool connection and waiting gauges
  named in the latency runbook alongside PostgreSQL evidence before
  attributing cause. Compare the separate `acres-worker` pool total, idle, max,
  and waiting panels and `up{job="acres-worker"}` before assigning a pool
  incident to the API. These gauges omit the migrator and other clients,
  server-wide limits, lock waits, and query performance.
  Compare the lock-wait and transaction-age panels with API/worker pool backlog
  and HTTP latency. Confirm current blockers with the database procedure below;
  a zero sampled count can miss a brief lock incident.
- Contain: address the observed cause and follow existing rollback authority
  if a deployment caused it. Escalate to on-call SRE if concurrency persists
  with degraded latency or availability.
- Clear: active requests back under 30 for 15m (operator-defined clearing bar,
  under the 40-request fire threshold).

### DatabaseConnectionPoolSaturation (warning)

- PromQL: `acres_postgres_pool_requests_waiting{job="acres-api"} > 0` for 1m — requests queued waiting for an available PostgreSQL client from the API `pg.Pool`.
- Dashboard: Panels 9/10 (API pool connections & backlog), Panel 23 (API pool acquisition latency), and Panel 25 (API query execution latency) in Grafana (`infra/grafana/dashboards/acres-operations.json`).
- Triage: Check API pool connection gauges in Panels 9 and 10 (`acres_postgres_pool_connections_total`, `acres_postgres_pool_connections_idle`, `acres_postgres_pool_connections_max`, and `acres_postgres_pool_requests_waiting`). Inspect API pool acquisition latency in Panel 23 (`acres_postgres_pool_acquisition_duration_seconds{job="acres-api"}`) and API query execution latency in Panel 25 (`acres_database_query_duration_seconds{job="acres-api"}`).
  - If acquisition latency is elevated (p95 > 50ms) with low query latency (p95 < 25ms), concurrent API request volume has exceeded pool connection capacity (`max`); incoming queries are starved for connection checkout.
  - If query execution latency is elevated (p95 > 100ms), slow database queries or table scans are holding connections open for extended durations.
  - Inspect PostgreSQL server connections and lock panels (Panels 19–22). If lock waits in Panel 21 (`pg_stat_activity_count{wait_event_type="Lock"}`) or transaction age in Panel 22 (`pg_stat_activity_max_tx_duration`) are elevated, run the read-only PostgreSQL diagnosis procedure below to identify blocking PIDs.
  - Check worker pool state (Panels 12, 13, 24, 26) to determine whether worker background tasks are causing cross-process PostgreSQL connection contention.
- Contain:
  - If lock contention or long-running transactions are identified, terminate blocking backend PIDs per the diagnostic procedure below.
  - If caused by a sudden traffic burst, apply Caddy edge rate limits to shed non-critical traffic and allow the pool queue to drain.
  - If pool saturation is sustained under normal legitimate traffic, evaluate increasing `ACRES_DB_MAX_CONNECTIONS` within PostgreSQL server `max_connections` limits.
  - Escalate to `rollback_authority` if saturation onset correlates with a recent application release.
- Clear: `acres_postgres_pool_requests_waiting{job="acres-api"} == 0` for 5m.

### PostgreSQL lock and transaction diagnosis

Use an approved operator SQL console connected to `acres`. Confirm
`up{job="acres-postgres"} == 1`, `pg_up{job="acres-postgres"} == 1`, and
`pg_exporter_last_scrape_error{job="acres-postgres"} == 0` before interpreting
the panels. Run this read-only PostgreSQL 18 query. Its two result sets are
bounded to 50 rows each and its transaction has a two-second statement timeout.

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '2s';
SELECT pid, state, wait_event_type, wait_event,
       round(EXTRACT(EPOCH FROM clock_timestamp() - xact_start)::numeric, 1) AS transaction_age_seconds,
       pg_blocking_pids(pid) AS blocking_pids
FROM pg_stat_activity
WHERE datname = 'acres' AND pid <> pg_backend_pid() AND wait_event_type = 'Lock'
ORDER BY xact_start NULLS LAST, pid
LIMIT 50;
SELECT pid, state, wait_event_type, wait_event,
       round(EXTRACT(EPOCH FROM clock_timestamp() - xact_start)::numeric, 1) AS transaction_age_seconds,
       pg_blocking_pids(pid) AS blocking_pids
FROM pg_stat_activity
WHERE datname = 'acres' AND pid <> pg_backend_pid() AND xact_start IS NOT NULL
ORDER BY xact_start, pid
LIMIT 50;
COMMIT;
```

The first result shows current lock waiters; `pg_blocking_pids` identifies
blocking backends and can include PIDs outside the filtered result. The second
shows old transactions, including idle transactions. The dashboard counts
current waiters at 30-second scrapes and can miss short waits. Transaction age
is `now() - xact_start`, not query runtime or wait duration. Correlate these
results with API and worker pool waiting gauges and HTTP latency before
attributing cause. A production cancellation or termination requires a separate
operator decision. `pg_monitor` can read SQL text from `pg_stat_activity`;
restrict console and output access even though this query selects no SQL text,
parameters, credentials, or product user/tenant identifiers.

## 6. Emergency Rollback & Disaster Recovery

1. `rollback_authority` declares the rollback; `deployment_approver` concurs.
2. Rehearse first when time permits: `bash scripts/ops/run-deployment-drill.sh --dry-run`.
3. Repoint Caddy to the last pinned, provenance-attested image (additive
   migrations only — never roll back across a destructive migration).
4. Verify `/health`, the Caddy routes (`node scripts/ops/verify-caddy-routing.js`),
   and the clearing condition of the firing alert (§5).
5. Full data loss: restore via `scripts/ops/restore-postgres.sh <backup.dump>`
   into an isolated target, verify parity with
   `bash scripts/ops/run-restore-drill.sh`, reconcile objects with
   `node scripts/ops/reconcile-storage-objects.js`, then promote.

## 6A. Production evidence preflight gap register — 2026-09-26

Assessment: 2026-09-26T19:39:25Z UTC; reviewed source commit `3da8949` on
`main`. This is a repository-visible assessment only. No operator-controlled
production record, live source, restricted evidence store, or approver decision
was inspected. The checked-in example is a template, not an operator record.
`node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`
exited 1 as designed: **11 required, 0 approved, 11 unresolved, 70 blockers**.
Every category below retains launch status **unresolved**. "Available but
unverified" refers only to repository scripts, templates, or policy text; it
does not describe a live production condition. The missing production evidence
is classified **missing** from the repository assessment, not asserted absent
from an operator's private store.

| category | repository-visible state and missing operator decision/value | required child artifact and independently checked live source | supplier / approver; next safe action |
| --- | --- | --- | --- |
| `production_domain_tls` | Available but unverified: Caddy example and verifier. Missing: selected FQDN, TLS contact, certificate mode, HSTS decision, approval. Unresolved. | Successful Caddy routing child JSON; inspect materialized Caddyfile, public DNS, issued certificate and live HTTPS headers. A template Stage 3 report is insufficient. | Ops lead; identify the approved target and provide redacted DNS/TLS and HSTS decision references for read-only inspection. |
| `smtp_delivery` | Available but unverified: readiness contract. Missing: provider, host/port/TLS mode, sender, indirect SMTP secret reference, delivery and bounce policies, approval. Unresolved. | SMTP delivery child JSON; independently inspect provider delivery receipt and public SPF/DKIM/DMARC printouts. | Ops lead; provide opaque provider and policy references and authorize a later test delivery separately. |
| `secrets_management` | Available but unverified: scan and rotation drill code. Missing: runtime injection mechanism, masking policy, cadence decision (≤90 days), compromise runbook, approval. Unresolved. | Explicit live operator child receipt with seven class confirmations and seven step sources; independently inspect injector policy, redacted audit, credential retirement and compromise response. Stage 5 is simulation only and cannot approve Category 3. | Security lead; provide policy and redacted injector/audit references for read-only inspection; arrange separate rotation authority. |
| `secret_references` | Available but unverified: twelve-field validator. Missing: twelve distinct indirect references for session, CSRF, DB migrator/app/monitor, Valkey, Garage RPC/admin/metrics/S3, SMTP, Grafana; approval. Unresolved. | Secret-reference-policy child JSON; inspect redacted live store access policies and runtime injection inventory, never secret values. | Security lead; supply opaque store-reference identifiers and policy evidence. |
| `slo_and_alerting` | Available but unverified: eleven alert rules, dashboards and threshold contract. Missing: operator adoption of ≥99.9% availability, ≤500 ms HTTP p95, ≥100 RPS, ≤50 ms DB acquisition p95, ≤100 ms DB query p95, recipients, escalation, alert delivery and approval. Unresolved. | Successful capacity-alerting child JSON with fresh target-bound Prometheus database telemetry; inspect live scrape/benchmark results, alert routes, delivery receipts and all eleven rules. Synthetic checks do not prove capacity. | SRE lead and on-call team; provide target/telemetry and routing references, then authorize any live load or DoS exercise separately. |
| `backup_and_disaster_recovery` | Available but unverified: restore/reconciliation scripts and example one-hour/four-hour objectives. Missing: approved RPO ≤1h, RTO ≤4h, UTC schedule, encrypted off-host destination, isolated target, completed restore/reconciliation and approval. Unresolved. | Successful restore and object-reconciliation child JSON reports; independently inspect actual backup completion/freshness, encrypted transfer, PostgreSQL/Garage coverage, isolated restore parity and object inventory. | SRE lead; provide redacted backup and isolated-target references; authorize restore operation separately. |
| `data_retention_policy` | Available but unverified: fixed example windows (7d quarantine, 1d rejected objects, 30d exports/backups, 15d telemetry). Missing: approved account, audit and report windows, scheduled cleanup verification, legal approval. Unresolved. | Retention-policy-review child JSON; inspect signed policy and live cleanup schedule/results for all eight fields. Separate live operator receipt required on approval. | Legal lead with operations; provide opaque policy and cleanup evidence references. |
| `volume_encryption` | Available: simulation declaration/local-scan preflight. Missing: independently inspected live child, approved mechanism/root inventory/owner and sign-off. Unresolved. | Bound live production child covering all nine required service mounts; inspect encryption, separated custody, dual control and tested recovery. | Security/infrastructure leads and key-recovery owner; restricted mount/custody source pointers and dated approval. |
| `graphql_introspection` | Available: simulation preflight. Missing: operator production policy decision, live route result, bound operator receipt and approval. Unresolved. | GraphQL-introspection-probe child JSON; independently probe the designated production `/graphql` ingress and inspect response without exposing schema data. Separate live operator receipt required on approval. | Security lead; provide policy reference and authorize a read-only route probe. |
| `deployment_and_rollback` | Available but unverified: deployment drill and image checks. Missing: host profile, registry, deployment approver, rollback authority, provenance policy, reviewed 40-hex source commit, immutable current/previous client/server image pairs, provenance artifacts, live drill and approval. Unresolved. | Successful deployment child JSON and distinct client/server provenance evidence; inspect registry manifests, signatures, materialized Compose, release preflight, live promotion and rollback observations. | Release manager, deployment approver and rollback authority; provide opaque release/provenance references and approve any live change in a later window. |
| `optional_ai_posture` | Available but unverified: example declares AI disabled and Phase 11A excluded. Missing: verified API/worker `AI_DRAFT_ENABLED=false`, absent `GEMINI_API_KEY`, unpaid-provider exclusion, three deterministic journeys and product/security approval. Unresolved. | No-AI production posture child JSON; inspect redacted live API/worker inventories, provider policy and analytics dashboard, governed report and export download run results. Separate live operator receipt required on approval. | Product and security leads; provide opaque inventory, policy and journey-run references. |

### Shared prerequisites and stage binding

- **Materialized Caddyfile and Compose file, approved domain/HSTS and host** block
  Categories 1 and 10 and Stage 3 (`ingress_deployment`). Stage 3's routing
  and deployment children must bind to the selected files and live API origin.
- **Approved benchmark URL and API origin, fresh target-bound Prometheus
  telemetry, on-call routing** block Category 5 and Stage 6
  (`capacity_alerting`). The API URL is an origin. Stage 6 requires live
  target IDs, scrape health and database baseline; its alert simulations do
  not prove delivery. Live load and DoS need separate authorization.
- **Isolated restore target, current encrypted off-host backups, and object
  inventory** block Category 6 and Stage 7 (`disaster_recovery`). The restore
  and reconciliation tools require reachable drill infrastructure even when
  invoked with `--dry-run`.
- **Immutable current/previous client and server image pairs, source commit,
  signatures, provenance policy, and restricted evidence store** block
  Category 10 and Stage 3. Runtime secret-store references block Categories 2,
  3 and 4. Key-recovery custody blocks Category 8. Named deployment approver,
  rollback authority, maintenance window and live-action approval block a
  production promotion/rollback. Legal, SRE, security, ops and product/security
  sign-off authorities remain required for their matrix rows below.
- **Stage 5 (`secret_rotation`) runs with `--dry-run` even in a targeted
  seven-stage drill.** Its report cannot establish a live rotation. The
  operator must verify separate authorized rotation and compromise evidence
  before Category 3 approval. A 7/7 dossier is drill evidence, not human
  sign-off or proof of production promotion.

### Operator handoff

**Repository prefill — 2026-09-27T21:37:51Z UTC.** These values were checked
locally before the operator handoff. They identify the implementation snapshot
and reference material only; none identifies a deployed production release or
an approved source commit.

| handoff field | locally verified value and source | production verification still needed |
| --- | --- | --- |
| Source snapshot inspected | `efb36d5d028a0f2850e7f4199a715c7822336996` on `main` | Operator must identify the reviewed source commit actually built and deployed. |
| Reference topology | `single-host-compose-caddy` in `infra/launch/readiness.example.json` | Confirm the selected production topology and materialized deployment. |
| Reference deployment files | `infra/compose/docker-compose.production.example.yml` and `infra/caddy/Caddyfile.example` | Supply identifiers for the materialized Compose and Caddy files. |
| Application image inputs | Compose requires `ACRES_CLIENT_IMAGE` and `ACRES_SERVER_IMAGE`; no application image digest values are checked in. | Supply immutable current and previous client/server image identities and registry provenance. |
| Local unified dossiers | On this machine, the gitignored `backups/launch-evidence-dossier-20260924T171638Z.json` and `backups/launch-evidence-dossier-20260925T203206Z.json` both declare `environment: "drill"`; these files are absent from a fresh checkout. | Supply target-bound production child reports and independently inspectable live sources. These local dossiers do not satisfy that requirement. |
| Readiness record | `infra/launch/readiness.example.json` has eleven `unresolved` sections and placeholder operator fields. | Supply the restricted operator-owned record, its location, and authorized read-only access. |

**Prompt 216 shared handoff check — 2026-09-27T21:18:58Z UTC.** Reviewed
`5a1cc5ea64ad1cccdaaf3d1eb366b90b71af2816` on `main`. The only
worktree change at intake was the uncommitted prompt 216. The tracked
`infra/launch/` files are the unresolved example and schema; no tracked
operator readiness record or production evidence pointer was found in the
repository. Local `backups/` contains generated artifacts, but its contents
were not accepted as production evidence. No restricted operator store, live
source, or operator channel was available for inspection, so this finding says
nothing about whether private evidence exists. The eleven rows above remain
unresolved; no category has been reassessed or approved by this handoff check.

One consolidated request for the operations lead, to be fulfilled through the
approved operator channel: provide the designated production environment ID;
the reviewed 40-character source SHA; immutable current and previous client
and server image identifiers; identifiers for the materialized Caddyfile and
Compose deployment; the restricted evidence-store and operator readiness-record
locations; and the named deployment approver and rollback authority. For each
of the eleven category rows above, name the evidence supplier and signer and
provide an opaque child-report reference plus the independently inspectable
live source reference. Name the person who can arrange scoped read-only access
to those sources, the access procedure, and the approved target and fields for
inspection. Date the handoff in UTC and bind every reference to the same
production environment and release. Do not include credentials, secret values,
private host inventories, tenant data, key material, or unredacted reports in
chat or git; keep the signed record and raw evidence in the restricted store.
References received later remain **supplied, unverified** until their sources
are inspected. Prompt 201 owns the eventual eleven-row decision. Live drills
and production changes require separate target, authority, action, window and
recovery approval.

For prompt 201, request only the named role or team for each row, opaque
references to the operator-controlled records and restricted evidence store,
and read-only access to inspect those records and live sources. Request the
selected target identifiers through an approved operator channel, without
placing private hosts or credentials in chat or git. Do not send passwords,
tokens, connection strings, raw inventories, key material, or unredacted
reports. Separate authorizations must name the exact target, action, authority
and window for any live benchmark/DoS, SMTP test, restore, HSTS activation,
deployment, rollback, or secret rotation. No such authorization or target has
been supplied by this preflight.

**Parameterized targeted drill example — NOT EXECUTED:** flags checked against
`scripts/ops/run-launch-drills.sh`; use only after the above target and
live-action approvals.

```bash
bash scripts/ops/run-launch-drills.sh \
  --caddyfile <materialized-production-Caddyfile> \
  --compose-file <materialized-production-Compose-file> \
  --allow-hsts \
  --target-url <approved-benchmark-URL> \
  --api-url <approved-API-origin> \
  --database-telemetry-file <fresh-target-bound-Prometheus-evidence.json> \
  --evidence-dir <restricted-evidence-directory>
```

The template's `$schema` now resolves to `infra/launch/readiness.schema.json`.
The Draft 7 schema describes all eleven sections, twelve secret-source fields,
eight retention-policy fields, and the nested release record. It accepts the
unresolved template and rejects missing, misspelled, extra, or wrongly typed
fields. New record fields require a schema revision. Run
`npm run ops:readiness-schema-test` for this structural check. It does not
approve a launch: `node scripts/ops/check-launch-readiness.js
infra/launch/readiness.example.json` still fails closed. That validator owns
placeholder and secret scans, evidence content and target binding, clocks,
cross-category consistency, image environment checks, and approval gates;
operators own authentic live evidence and human sign-off.

## 7. Formal Pre-Launch Sign-off Matrix

| # | category | verifier command | approved by | signature / date |
| --- | --- | --- | --- | --- |
| 1 | production_domain_tls | `node scripts/ops/verify-caddy-routing.js` | ops-lead | |
| 2 | smtp_delivery | provider delivery receipt + DNS check | ops-lead | |
| 3 | secrets_management | Rehearsal: `bash scripts/ops/run-secret-rotation-drill.sh --dry-run`; separately supplied live operator receipt required | security-lead | |
| 4 | secret_references | `scripts/ops/scan-secrets.sh` | security-lead | |
| 5 | slo_and_alerting | Preflight: `bash scripts/ops/run-capacity-alerting-drill.sh --dry-run`; separately inspected live operator receipt required | sre-lead | |
| 6 | backup_and_disaster_recovery | `bash scripts/ops/run-restore-drill.sh` | sre-lead | |
| 7 | data_retention_policy | Policy review sign-off; separately inspected live operator receipt required on approval | legal-lead | |
| 8 | volume_encryption | Bound live operator receipt + independent nine-mount/custody/dual-control/recovery inspection; CLI is preflight only | security-lead + key-recovery owner | |
| 9 | graphql_introspection | Preflight probe check; separately inspected live operator receipt required on approval | security-lead | |
| 10 | deployment_and_rollback | Preflight: `bash scripts/ops/run-deployment-drill.sh --dry-run`; separately inspected live release-bound operator receipt | release-manager | |
| 11 | optional_ai_posture | Preflight posture check; separately inspected live operator receipt required on approval | product-and-security-lead | |

Launch is approved only when all 11 rows are signed, the unified dossier
(`backups/launch-evidence-dossier-<uuid>.json`) reports `PASSED`, and
`node scripts/ops/check-launch-readiness.js <operator-readiness.json>` exits 0.
Category 5 (`slo_and_alerting`) approval requires operator confirmation of all
11 operational alert rules, availability target ≥ 99.9%, HTTP p95 latency ≤ 500ms,
throughput ≥ 100 RPS, database connection pool acquisition p95 latency ceiling ≤ 50ms,
database query execution p95 latency ceiling ≤ 100ms, and verified database baseline
telemetry evidence (`summary.databaseBaselineCompliance: "passed"`).
