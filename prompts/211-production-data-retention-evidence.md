# 211 — production data retention evidence

## Scope and why this is next

The committed baseline is `dc6670e` on `main`. Phase 12K remains open under
`docs/build-plan.md` §13/§22 and the umbrella launch sign-off in prompt 201.
Prompts 205–210 assessed checklist Categories 1–6 (`production_domain_tls`,
`smtp_delivery`, `secrets_management`, `secret_references`, `slo_and_alerting`,
and `backup_and_disaster_recovery`) and recorded unresolved operator evidence
without approving them. The earliest remaining independent checklist unit is
Category 7, `data_retention_policy`.

This prompt assesses the declared retention windows across the eight required
policies (`account_retention_policy`, `audit_retention_policy`,
`upload_quarantine_retention_policy`, `rejected_object_retention_policy`,
`export_retention_policy`, `report_retention_policy`,
`telemetry_retention_policy`, `backup_retention_policy`), scheduled cleanup
execution on the background worker process (`SCHEDULER_ENABLED=true`),
structured child policy evidence (`retention-policy-review-<timestamp>.json`),
and the designated legal / compliance / operations lead's decision. It records an
exact unresolved blocker if operator material is unavailable. Category 7 is
approved only after independent live-source inspection, verified
machine-readable child artifacts, and dated human sign-off. This does not approve
other categories or complete Phase 12.

## References and verified contract

- Re-read `AGENTS.md` §§2–7 and 10, `docs/build-plan.md` §§13–14 and 22,
  `docs/launch-checklist.md` §§2–5, 6A, and 7, `docs/operations.md` Phase 12K
  and Prompt 198, `docs/security.md` TM-12 and Phase 12F,
  `docs/system-architecture.md` (data lifecycle, storage, and cleanup),
  `docs/skills.md`, and prompts 198, 201–204, and 205–210. Reconcile prose with
  current code and Git history before executing.
- Inspect `infra/launch/readiness.example.json`,
  `infra/launch/readiness.schema.json`,
  `scripts/ops/check-launch-readiness.js` and its test suite
  (`scripts/ops/check-launch-readiness.spec.js`),
  `server/src/jobs/retention-maintenance.job.ts` and its test suite,
  `server/src/sessions/sessions.service.ts`,
  `server/src/uploads/uploads.service.ts`,
  `server/src/reports/reports.service.ts`,
  `infra/compose/docker-compose.production.example.yml`,
  `infra/env/production.env.example`, and
  `scripts/ops/check-production-templates.sh`. Inspect operator-provided legal
  and compliance retention policies, worker scheduler configuration, and child
  retention review reports separately.
- No visual route, design comp, crop, pixel measurement, or breakpoint applies.
  The measured contract is:
  - `account_retention_policy`: string matching `^[1-9]\d*d$` (e.g. `'365d'`) or
    `'indefinite_until_tenant_deletion'`;
  - `audit_retention_policy`: string matching `^[1-9]\d*d$` (e.g. `'730d'`);
  - `upload_quarantine_retention_policy`: exactly `'7d'`;
  - `rejected_object_retention_policy`: exactly `'1d'`;
  - `export_retention_policy`: exactly `'30d'`;
  - `report_retention_policy`: string matching `^[1-9]\d*d$` (e.g. `'365d'`) or
    `'indefinite_until_tenant_deletion'`;
  - `telemetry_retention_policy`: exactly `'15d'`;
  - `backup_retention_policy`: exactly `'30d'`;
  - `approver`: valid approver object or name without placeholders;
  - `evidence`: non-empty array referencing valid child JSON reports.
- Machine-readable child evidence artifact (`validateDataRetentionPolicyReport`):
  - `drill_type: "data_retention_policy_verification"`;
  - strict nonfuture ISO UTC `timestamp`;
  - `status: "success"`;
  - `errors: []`;
  - `policy_reference`: non-empty opaque string identifier;
  - `scheduled_cleanup_verified: true`;
  - `retention_windows`: object keyed by all eight exact `REQUIRED_RETENTION_KEYS`.
    Each entry must be an object with `window` strictly matching the approved
    section value and `policy_verified: true`, with exactly two properties;
  - Exactly the seven top-level properties: `['drill_type', 'errors', 'policy_reference', 'retention_windows', 'scheduled_cleanup_verified', 'status', 'timestamp']`;
  - Zero placeholders (`__REQUIRED_`) and zero client secrets;
  - Every referenced JSON child report, including wildcard matches, must pass.
    Prose alone or a dossier alone cannot qualify.
- Four verified facts and architecture constraints the operator and leads must resolve:
  1. **Automated purge execution relies strictly on a single active scheduler instance (`SCHEDULER_ENABLED=true`).**
     `server/src/jobs/retention-maintenance.job.ts:46,102,146,225` and
     `server/src/sessions/sessions.service.ts` gate all 5 purge paths on
     `config.schedulerEnabled`. If `SCHEDULER_ENABLED=false` or if the worker
     process crashes, expired sessions, uncompleted uploads, idempotency
     records, auth tokens/invitations, and export artifacts accumulate
     indefinitely without automatic pruning.
  2. **Batch bounds (`RETENTION_PURGE_BATCH_LIMIT = 500`) protect against query timeouts and database locking during backlog drainage, but require multiple ticks.**
     Purges execute hourly ticks claiming up to 500 records per category
     (`orderBy: { expiresAt: 'asc' }, take: 500`). For a massive volume of
     expired items, a single run does not purge everything; drainage requires
     sustained hourly ticks.
  3. **Export artifact purge reclaims S3 storage objects and soft-deletes `StoredObject` records while preserving `ExportRequest` audit history.**
     `server/src/jobs/retention-maintenance.job.ts:327-340` deletes
     `ExportArtifact` rows and transitions `StoredObject` to `deleted` (with
     `deletedAt: now`), but deliberately preserves `ExportRequest` records for
     governance auditability. Future download attempts for purged exports return
     404 NOT FOUND.
  4. **Telemetry and backup retention are governed out-of-band by Prometheus tsdb flags and off-host backup lifecycle policies.**
     `infra/compose/docker-compose.production.example.yml:206` configures
     Prometheus with `--storage.tsdb.retention.time=${PROMETHEUS_RETENTION}`,
     which must match `telemetry_retention_policy: "15d"`. Backup retention
     (30d) is enforced by off-host backup destination lifecycle rules, not
     NestJS cron jobs.

## Preconditions and operator handoff

1. Verify branch, HEAD, and clean worktree; preserve unrelated changes. Confirm
   the checked-in readiness example is unresolved. Search approved repository
   paths for a materialized production readiness record or redacted Category 7
   evidence reference. Absence from Git does not prove absence from the
   operator's restricted store.
2. Obtain through the approved operator channel:
   - The formal legal/regulatory retention schedule defining tenant account,
     audit log, and report lifecycles;
   - Verification of worker process configuration with `SCHEDULER_ENABLED=true`;
   - Prometheus runtime configuration verifying `--storage.tsdb.retention.time=15d`;
   - Off-host backup storage lifecycle policy verifying 30-day retention;
   - Restricted evidence-store location containing the child policy review
     report (`retention-policy-review-<timestamp>.json`);
   - Designated legal / compliance / operations lead approver identity and dated
     approval decision.
3. Use opaque identifiers and redacted extracts only. Never request, read, or
   place credentials, customer PII, tenant data, or confidential legal memos
   into Git, logs, or chat.
4. Distinguish test fixtures from production retention policy governance.
   Validator test fixtures in `scripts/ops/check-launch-readiness.spec.js` do not
   prove operational compliance, regulatory sign-off, or active worker cron
   purging in production.
5. Live data purges, schema changes, or retention policy mutations require
   separate operator authorization. A generic approval of this prompt
   authorizes only read-only repository checks and intake assessment. If
   authority or live evidence is missing, record the exact Category 7 blocker
   and owner; do not fabricate evidence or mark the example approved.

## Evidence and decision procedure

1. Review operator-provided retention policies and compare values to readiness fields:
   - Verify fixed windows: upload quarantine 7d, rejected objects 1d, export
     artifacts 30d, Prometheus metrics/telemetry 15d, off-host backups 30d;
   - Verify dynamic tenant windows: account retention (positive days or
     indefinite until deletion), audit logs (positive days), report
     metadata/revisions (positive days or indefinite until deletion);
2. Inspect scheduled cleanup execution in worker runtime and configuration:
   - Verify `RetentionMaintenanceJob` runs hourly ticks for uploads
     (`uploads.purge-expired`), idempotency (`idempotency.purge-expired`),
     tokens (`tokens.purge-expired`), and exports (`exports.purge-expired`) with
     `RETENTION_PURGE_BATCH_LIMIT = 500`;
   - Verify session purging runs hourly via `SessionsService.purgeExpiredSessions`;
   - Verify worker process runs with `SCHEDULER_ENABLED=true` in production;
   - Verify Prometheus storage retention flag (`--storage.tsdb.retention.time=15d`
     in Compose / systemd);
   - Verify backup retention lifecycle policy on backup destination (30 days);
3. Inspect child report structure and consistency:
   - Validate against `validateDataRetentionPolicyReport`: drill type, nonfuture
     UTC ISO timestamp, status success, empty errors, valid policy reference,
     `scheduled_cleanup_verified: true`, and all 8 windows matching readiness
     fields with `policy_verified: true`;
4. Check readiness validator:
   - Run `npm run ops:readiness-schema-test` and `node scripts/ops/check-launch-readiness.js <operator-readiness.json>`;
5. Document the dated intake findings, reviewed commit baseline, verified
   evidence references, missing facts, and responsible owners in
   `docs/launch-checklist.md` §3.7. Prompt 201 continues to govern final
   eleven-category sign-off.

## Scope boundaries, failure handling, and rollback

- No product code, database schema, migration, API endpoint, client UI, purge
  job code, or production configuration is changed.
- If policy review child report, legal/compliance approval, or scheduled
  cleanup evidence is missing, Category 7 remains `unresolved`. Document the
  exact blockers, required inputs, and owning lead.
- Revert any erroneous documentation edit with git; do not weaken validator or
  schema contracts.

## Verification, review, and completion

1. Execute and quote real command output and exit codes for:
   - `npm run ops:readiness-schema-test`
   - `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json` (expected fail-closed with Category 7 blockers reported)
   - `npm run ops:templates`
   - `npm run ops:check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
   - `git diff --check`
2. Dispatch a read-only reviewer subagent via `requesting-code-review` providing
   requirements, base/head SHAs, modified documentation paths, check results,
   and the distinction between local drill capabilities and production recovery
   proof.
3. Evaluate review feedback via `receiving-code-review`, verify claims against
   codebase reality, fix valid issues, and re-test.
4. Stage only prompt-scoped documentation updates and any approved redacted
   readiness records.
5. Commit locally to `main` using `caveman-commit`. Do not push.
6. Present the exact state of Category 7, remaining Phase 12K gates, and
   instructions for verifying readiness.

## SKILLS USED

- `deployment-pipeline-design` — enforce release gates separating policy definition from production retention verification.
- `security-best-practices` — enforce data minimization, audit trail retention, and quarantine lifecycle constraints.
- `postgres-best-practices` — verify bounded batch purges, transaction boundaries, and foreign key integrity during automated cleanup.
- `error-handling-patterns` — classify retention report validation failures and scheduler degradation risks.
- `requesting-code-review` — dispatch independent reviewer subagent for evidence and documentation review.
- `receiving-code-review` — evaluate reviewer findings with technical rigor before making adjustments.
- `caveman-commit` — write the final local commit message on completion.
