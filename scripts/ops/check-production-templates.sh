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
require_file scripts/db/bootstrap-production-roles.sh

node <<'NODE'
const fs = require('fs');
const yaml = require('js-yaml');

function readYaml(path) {
  try {
    return yaml.load(fs.readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`ops template check failed: ${path} is not valid YAML: ${error.message}`);
    process.exit(1);
  }
}

function readJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`ops template check failed: ${path} is not valid JSON: ${error.message}`);
    process.exit(1);
  }
}

const compose = readYaml('infra/compose/docker-compose.production.example.yml');
const services = compose && compose.services ? compose.services : {};
const requiredServices = [
  'caddy',
  'next',
  'api',
  'worker',
  'postgres',
  'valkey',
  'garage',
  'clamav',
  'prometheus',
  'grafana',
];

for (const service of requiredServices) {
  if (!services[service]) {
    console.error(`ops template check failed: compose missing ${service} service`);
    process.exit(1);
  }
}

for (const [name, service] of Object.entries(services)) {
  if (name !== 'caddy' && Array.isArray(service.ports) && service.ports.length > 0) {
    console.error(`ops template check failed: ${name} must not publish host ports`);
    process.exit(1);
  }
}

const apiScheduler = services.api.environment && services.api.environment.SCHEDULER_ENABLED;
const workerScheduler = services.worker.environment && services.worker.environment.SCHEDULER_ENABLED;
if (apiScheduler !== 'false' || workerScheduler !== 'true') {
  console.error('ops template check failed: compose must enable scheduler only on worker');
  process.exit(1);
}

for (const service of ['postgres', 'valkey', 'garage']) {
  const volumes = services[service].volumes || [];
  if (!volumes.some((entry) => String(entry).includes('ENCRYPTED_MOUNT'))) {
    console.error(`ops template check failed: ${service} must declare an encrypted production mount placeholder`);
    process.exit(1);
  }
}

const envExample =
  fs.readFileSync('infra/env/production.env.example', 'utf8') +
  '\n' +
  fs.readFileSync('infra/env/garage.production.env.example', 'utf8');
const envKeys = new Set();
for (const line of envExample.split('\n')) {
  const match = line.match(/^([A-Z0-9_]+)=/);
  if (match) envKeys.add(match[1]);
}
const composeText = fs.readFileSync('infra/compose/docker-compose.production.example.yml', 'utf8');
const interpolationKeys = new Set();
for (const match of composeText.matchAll(/\$\{([A-Z0-9_]+)(?::[?+-][^}]*)?\}/g)) {
  interpolationKeys.add(match[1]);
}
for (const key of interpolationKeys) {
  if (!envKeys.has(key)) {
    console.error(`ops template check failed: ${key} is used by compose but missing from production.env.example`);
    process.exit(1);
  }
}

if (composeText.includes('ACRES_TEST_PASSWORD') || composeText.includes('bootstrap-roles.sh')) {
  console.error('ops template check failed: production compose must not create local test database roles');
  process.exit(1);
}

const garageEnv = services.garage.environment || {};
for (const key of ['GARAGE_RPC_SECRET', 'GARAGE_ADMIN_TOKEN', 'GARAGE_METRICS_TOKEN']) {
  if (!String(garageEnv[key] || '').includes(key)) {
    console.error(`ops template check failed: production Garage must override ${key}`);
    process.exit(1);
  }
}

for (const [name, service] of Object.entries(services)) {
  if (name === 'garage') continue;
  const env = service.environment || {};
  for (const key of ['GARAGE_ADMIN_TOKEN', 'GARAGE_METRICS_TOKEN']) {
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      console.error(`ops template check failed: ${key} must be scoped to Garage only, not ${name}`);
      process.exit(1);
    }
  }
}

readYaml('infra/prometheus/prometheus.yml');
readYaml('infra/prometheus/alerts.yml');
readYaml('infra/grafana/provisioning/datasources/prometheus.yml');
readYaml('infra/grafana/provisioning/dashboards/acres.yml');

const dashboard = readJson('infra/grafana/dashboards/acres-operations.json');
if (dashboard.uid !== 'acres-operations-foundation') {
  console.error('ops template check failed: Grafana dashboard uid drifted');
  process.exit(1);
}
NODE

if grep -Eq '^NEXT_PUBLIC_.*(SECRET|PASSWORD|TOKEN|KEY)=' infra/env/production.env.example; then
  fail 'production env example exposes a secret-looking NEXT_PUBLIC variable'
fi

if ! grep -q '__REQUIRED_' infra/env/production.env.example; then
  fail 'production env example lost required placeholder sentinels'
fi

if ! grep -q 'Strict-Transport-Security' infra/caddy/Caddyfile.example; then
  fail 'Caddy template must document the HSTS approval gate'
fi

printf 'ops template check passed\n'
