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
require_file scripts/ops/check-launch-readiness.js
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
const localCompose = readYaml('docker-compose.yml');
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

function mountDetails(entry) {
  if (typeof entry === 'string') {
    const parts = entry.split(':');
    const mode = /^(?:ro|rw|z|Z|delegated|cached|consistent)(?:,[A-Za-z]+)*$/.test(
      parts.at(-1) || '',
    )
      ? parts.pop()
      : undefined;
    const target = parts.pop();
    return {
      source: parts.join(':'),
      target,
      persistent: true,
      writable: !mode?.split(',').includes('ro'),
    };
  }

  if (entry && typeof entry === 'object') {
    return {
      source: entry.source,
      target: entry.target,
      persistent: entry.type === 'volume' || entry.type === 'bind',
      writable: entry.read_only !== true && entry.readOnly !== true,
    };
  }

  return {};
}

function assertPostgres18Mount(composeDocument, path) {
  const postgresServices = Object.entries(composeDocument?.services || {}).filter(
    ([, service]) => /^postgis\/postgis:18-/.test(String(service?.image || '')),
  );

  if (postgresServices.length === 0) {
    console.error(`ops template check failed: ${path} missing postgis/postgis:18-* service`);
    process.exit(1);
  }

  for (const [name, service] of postgresServices) {
    const mounts = (service.volumes || []).map(mountDetails);
    const postgresMount = mounts.find(({ target }) => target === '/var/lib/postgresql');
    if (!postgresMount) {
      console.error(
        `ops template check failed: ${path} ${name} must mount persistent storage at /var/lib/postgresql`,
      );
      process.exit(1);
    }
    if (!postgresMount.source || !postgresMount.persistent || !postgresMount.writable) {
      console.error(
        `ops template check failed: ${path} ${name} must use a writable bind or volume mount at /var/lib/postgresql`,
      );
      process.exit(1);
    }
    if (mounts.some(({ target }) => target === '/var/lib/postgresql/data')) {
      console.error(
        `ops template check failed: ${path} ${name} must not mount /var/lib/postgresql/data`,
      );
      process.exit(1);
    }
  }
}

assertPostgres18Mount(localCompose, 'docker-compose.yml');
assertPostgres18Mount(compose, 'infra/compose/docker-compose.production.example.yml');

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

const prom = readYaml('infra/prometheus/prometheus.yml');
const scrapeJobs = (prom.scrape_configs || []).map((c) => c.job_name);
if (!scrapeJobs.includes('acres-api')) {
  console.error('ops template check failed: Prometheus config missing acres-api scrape target');
  process.exit(1);
}

const alerts = readYaml('infra/prometheus/alerts.yml');
const alertNames = (alerts.groups || []).flatMap((g) => (g.rules || []).map((r) => r.alert));
const requiredAlerts = ['AcresApiDown', 'HighHttp5xxRate', 'QueueDeadLettersDetected', 'OutboxDeliveryLag'];
for (const reqAlert of requiredAlerts) {
  if (!alertNames.includes(reqAlert)) {
    console.error(`ops template check failed: Prometheus alerts missing required rule ${reqAlert}`);
    process.exit(1);
  }
}

readYaml('infra/grafana/provisioning/datasources/prometheus.yml');
readYaml('infra/grafana/provisioning/dashboards/acres.yml');

const dashboard = readJson('infra/grafana/dashboards/acres-operations.json');
if (dashboard.uid !== 'acres-operations-foundation') {
  console.error('ops template check failed: Grafana dashboard uid drifted');
  process.exit(1);
}
if (!Array.isArray(dashboard.panels) || dashboard.panels.length < 5) {
  console.error('ops template check failed: Grafana dashboard missing operational panels');
  process.exit(1);
}

const readinessExample = readJson('infra/launch/readiness.example.json');
if (!readinessExample || typeof readinessExample !== 'object' || !readinessExample.sections) {
  console.error('ops template check failed: infra/launch/readiness.example.json missing sections object');
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
