#!/bin/sh
set -eu

scripts/ops/check-production-templates.sh
scripts/ops/scan-secrets.sh
scripts/ops/check-docker-runtime.sh

cat <<'TEXT'
launch readiness blocked: Phase 12A foundations are present, but launch still
requires operator-owned values and live drills:
- production domain and TLS contact email
- SMTP host, credentials, delivery and abuse handling
- secret injection, rotation, masking and compromise-response procedure
- session, CSRF, database, storage, queue, SMTP and Grafana secrets
- SLO/availability target, capacity target, alert owners and thresholds
- RPO/RTO, backup destination, restore drill and DB/object reconciliation
- retention periods for account, audit, upload, export, report and backup data
- encrypted production mounts plus key-separation and key-recovery owner
- production GraphQL introspection policy
- Docker/Compose deployment, rollback and readiness evidence on the chosen host
- optional AI remains absent; no-AI launch evidence must pass
TEXT

exit 1
