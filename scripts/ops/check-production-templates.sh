#!/bin/sh
set -eu

usage() {
  printf 'Usage: scripts/ops/check-production-templates.sh [--cwd <path> | --cwd=<path>]\n'
}

fail() {
  printf 'ops template check failed: %s\n' "$1" >&2
  exit 1
}

TARGET_CWD="."
CWD_SPECIFIED=0

while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --cwd=*)
      if [ "$CWD_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --cwd option; expected single directory path\n' >&2
        usage >&2
        exit 1
      fi
      RAW_CWD="${1#--cwd=}"
      TRIMMED_CWD="$(printf '%s' "$RAW_CWD" | tr -d '[:space:]')"
      if [ -z "$RAW_CWD" ] || [ -z "$TRIMMED_CWD" ]; then
        printf 'Error: --cwd path cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      TARGET_CWD="$RAW_CWD"
      CWD_SPECIFIED=1
      shift
      ;;
    --cwd)
      if [ "$CWD_SPECIFIED" -eq 1 ]; then
        printf 'Error: Repeated --cwd option; expected single directory path\n' >&2
        usage >&2
        exit 1
      fi
      if [ $# -lt 2 ]; then
        printf 'Error: --cwd requires a non-empty directory path\n' >&2
        usage >&2
        exit 1
      fi
      RAW_CWD="$2"
      case "$RAW_CWD" in
        -*)
          printf 'Error: --cwd requires a non-empty directory path\n' >&2
          usage >&2
          exit 1
          ;;
      esac
      TRIMMED_CWD="$(printf '%s' "$RAW_CWD" | tr -d '[:space:]')"
      if [ -z "$RAW_CWD" ] || [ -z "$TRIMMED_CWD" ]; then
        printf 'Error: --cwd path cannot be empty\n' >&2
        usage >&2
        exit 1
      fi
      TARGET_CWD="$RAW_CWD"
      CWD_SPECIFIED=1
      shift 2
      ;;
    -*)
      printf 'Error: Unknown option "%s"\n' "$1" >&2
      usage >&2
      exit 1
      ;;
    *)
      printf 'Error: Unexpected argument "%s"\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ ! -d "$TARGET_CWD" ]; then
  fail "target directory does not exist: $TARGET_CWD"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESOLVED_CWD="$(cd "$TARGET_CWD" && pwd)"

require_file() {
  [ -f "$RESOLVED_CWD/$1" ] || fail "missing required file: $1"
}

require_file infra/caddy/Caddyfile.example
require_file infra/compose/docker-compose.production.example.yml
require_file infra/docker/client.Dockerfile.example
require_file infra/docker/client.Dockerfile.example.dockerignore
require_file infra/env/production.env.example
require_file infra/env/garage.production.env.example
require_file infra/prometheus/prometheus.yml
require_file infra/prometheus/alerts.yml
require_file infra/grafana/provisioning/datasources/prometheus.yml
require_file infra/grafana/provisioning/dashboards/acres.yml
require_file infra/grafana/dashboards/acres-operations.json
require_file infra/launch/readiness.example.json
require_file infra/launch/readiness.schema.json
require_file scripts/ops/check-launch-readiness.js
require_file scripts/ops/check-launch-readiness.spec.js
require_file scripts/ops/check-smtp-template-keys.js
require_file scripts/ops/check-smtp-template-keys.spec.js
require_file scripts/ops/check-garage-metrics.js
require_file scripts/ops/check-garage-metrics.spec.js
require_file scripts/ops/check-proxy-environment.js
require_file scripts/ops/check-proxy-environment.spec.js
require_file scripts/ops/check-application-environment.js
require_file scripts/ops/check-application-environment.spec.js
require_file scripts/ops/check-readiness-schema.spec.js
require_file scripts/db/bootstrap-production-roles.sh
require_file scripts/db/reconcile-production-monitor.sh
require_file scripts/ops/verify-caddy-routing.js
require_file scripts/ops/verify-caddy-routing.spec.js
require_file scripts/ops/run-deployment-drill.sh
require_file scripts/ops/run-deployment-drill.spec.js
require_file scripts/ops/verify-volume-encryption.js
require_file scripts/ops/verify-volume-encryption.spec.js
require_file scripts/ops/run-secret-rotation-drill.sh
require_file scripts/ops/run-secret-rotation-drill.spec.js
require_file scripts/ops/run-restore-drill.spec.js
require_file scripts/ops/verify-alert-rules.js
require_file scripts/ops/verify-alert-rules.spec.js
require_file scripts/ops/verify-capacity-load.js
require_file scripts/ops/verify-capacity-load.spec.js
require_file scripts/ops/run-dos-resilience-drill.spec.js
require_file scripts/ops/run-capacity-alerting-drill.spec.js
require_file scripts/ops/launch-target-evidence.spec.js
require_file scripts/ops/run-dos-resilience-drill.sh
require_file scripts/ops/run-capacity-alerting-drill.sh
require_file scripts/ops/check-release-images.js
require_file scripts/ops/check-release-images.spec.js
require_file scripts/ops/verify-postgres-diagnostics.js
require_file scripts/ops/run-launch-drills.sh
require_file scripts/ops/run-launch-drills.spec.js
require_file scripts/ops/assemble-launch-dossier.js
require_file scripts/ops/assemble-launch-dossier.spec.js
require_file scripts/ops/run-static-integrity-checks.js
require_file scripts/ops/run-static-integrity-checks.spec.js
require_file scripts/ops/check-docker-runtime.sh
require_file scripts/ops/check-docker-runtime.spec.js
require_file scripts/ops/scan-secrets.sh
require_file scripts/ops/scan-secrets.spec.js
require_file scripts/ops/audit-dependencies.sh
require_file scripts/ops/audit-dependencies.spec.js
require_file scripts/ops/backup-postgres.sh
require_file scripts/ops/backup-postgres.spec.js
require_file scripts/ops/launch-readiness.sh
require_file scripts/ops/launch-readiness.spec.js
require_file scripts/ops/check-production-templates.js
require_file scripts/ops/check-production-templates.spec.js
require_file scripts/ops/check-production-templates-shell.spec.js
require_file docs/launch-checklist.md

node "$SCRIPT_DIR/check-production-templates.js" --cwd "$RESOLVED_CWD" || fail 'production template validation failed'

if grep -Eq '^NEXT_PUBLIC_.*(SECRET|PASSWORD|TOKEN|KEY)=' "$RESOLVED_CWD/infra/env/production.env.example"; then
  fail 'production env example exposes a secret-looking NEXT_PUBLIC variable'
fi

if ! grep -q '__REQUIRED_' "$RESOLVED_CWD/infra/env/production.env.example"; then
  fail 'production env example lost required placeholder sentinels'
fi

if ! grep -q 'Strict-Transport-Security' "$RESOLVED_CWD/infra/caddy/Caddyfile.example"; then
  fail 'Caddy template must document the HSTS approval gate'
fi

node "$SCRIPT_DIR/verify-caddy-routing.js" "$RESOLVED_CWD/infra/caddy/Caddyfile.example" >/dev/null || fail 'Caddy routing verification failed'
node "$SCRIPT_DIR/verify-volume-encryption.js" --compose "$RESOLVED_CWD/infra/compose/docker-compose.production.example.yml" --env "$RESOLVED_CWD/infra/env/production.env.example" --readiness "$RESOLVED_CWD/infra/launch/readiness.example.json" >/dev/null || fail 'Volume encryption verification failed'
(cd "$RESOLVED_CWD" && node "$SCRIPT_DIR/verify-alert-rules.js" >/dev/null) || fail 'Alert rules verification failed'
(cd "$RESOLVED_CWD" && node "$SCRIPT_DIR/verify-capacity-load.js" --no-save >/dev/null) || fail 'Capacity load verification failed'

printf 'ops template check passed\n'
