#!/bin/sh
set -eu

fail() {
  printf 'ops template check failed: %s\n' "$1" >&2
  exit 1
}

require_file() {
  [ -f "$1" ] || fail "missing required file: $1"
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
require_file scripts/ops/launch-readiness.sh
require_file scripts/ops/launch-readiness.spec.js
require_file scripts/ops/check-production-templates.js
require_file scripts/ops/check-production-templates.spec.js
require_file docs/launch-checklist.md

node scripts/ops/check-production-templates.js || fail 'production template validation failed'


if grep -Eq '^NEXT_PUBLIC_.*(SECRET|PASSWORD|TOKEN|KEY)=' infra/env/production.env.example; then
  fail 'production env example exposes a secret-looking NEXT_PUBLIC variable'
fi

if ! grep -q '__REQUIRED_' infra/env/production.env.example; then
  fail 'production env example lost required placeholder sentinels'
fi

if ! grep -q 'Strict-Transport-Security' infra/caddy/Caddyfile.example; then
  fail 'Caddy template must document the HSTS approval gate'
fi

node scripts/ops/verify-caddy-routing.js infra/caddy/Caddyfile.example >/dev/null || fail 'Caddy routing verification failed'
node scripts/ops/verify-volume-encryption.js >/dev/null || fail 'Volume encryption verification failed'
node scripts/ops/verify-alert-rules.js >/dev/null || fail 'Alert rules verification failed'
node scripts/ops/verify-capacity-load.js --no-save >/dev/null || fail 'Capacity load verification failed'

printf 'ops template check passed\n'
