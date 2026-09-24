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
require_file scripts/db/reconcile-production-monitor.sh
require_file scripts/ops/verify-caddy-routing.js
require_file scripts/ops/verify-caddy-routing.spec.js
require_file scripts/ops/run-deployment-drill.sh
require_file scripts/ops/verify-volume-encryption.js
require_file scripts/ops/verify-volume-encryption.spec.js
require_file scripts/ops/run-secret-rotation-drill.sh
require_file scripts/ops/verify-alert-rules.js
require_file scripts/ops/verify-alert-rules.spec.js
require_file scripts/ops/verify-capacity-load.js
require_file scripts/ops/verify-capacity-load.spec.js
require_file scripts/ops/run-dos-resilience-drill.sh
require_file scripts/ops/run-capacity-alerting-drill.sh
require_file scripts/ops/check-release-images.js
require_file scripts/ops/check-release-images.spec.js
require_file scripts/ops/verify-postgres-diagnostics.js
require_file scripts/ops/run-launch-drills.sh
require_file scripts/ops/run-launch-drills.spec.js
require_file scripts/ops/launch-readiness.sh
require_file docs/launch-checklist.md

node <<'NODE'
const fs = require('fs');
const yaml = require('js-yaml');
const { verifyPostgresDiagnostics } = require('./scripts/ops/verify-postgres-diagnostics');
const { validateComposeImages } = require('./scripts/ops/check-release-images');

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
try {
  validateComposeImages(compose);
} catch (error) {
  console.error(`ops template check failed: ${error.message}`);
  process.exit(1);
}
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
  'postgres-exporter',
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
  if (!envKeys.has(key) && key !== 'ACRES_MONITOR_BOOTSTRAP_PASSWORD') {
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

const worker = services.worker;
const workerScrape = (prom.scrape_configs || []).find((job) => job.job_name === 'acres-worker');
if (!workerScrape || workerScrape.metrics_path !== '/metrics' ||
    !workerScrape.static_configs?.some((entry) => entry.targets?.includes('worker:3002')) ||
    !worker.expose?.includes('3002') || worker.environment?.WORKER_METRICS_HOST !== '0.0.0.0' ||
    worker.environment?.WORKER_METRICS_PORT !== '3002' ||
    !JSON.stringify(worker.healthcheck?.test).includes('127.0.0.1:3002/health') ||
    JSON.stringify(services.caddy).includes('worker:3002')) {
  console.error('ops template check failed: worker metrics must stay on private port 3002 with matching probe and scrape');
  process.exit(1);
}

const exporter = services['postgres-exporter'];
const exporterScrape = (prom.scrape_configs || []).find((job) => job.job_name === 'acres-postgres');
const exporterRelabel = exporterScrape?.metric_relabel_configs || [];
const exporterMounts = (exporter.volumes || []).map(mountDetails);
const monitorMount = exporterMounts.find((mount) => mount.target === '/run/secrets/acres_monitor_password');
if (JSON.stringify(exporter.profiles) !== JSON.stringify(['observability']) ||
    JSON.stringify(exporter.networks) !== JSON.stringify(['private']) ||
    !exporter.expose?.includes('9187') || exporter.ports?.length ||
    !JSON.stringify(exporter.healthcheck?.test).includes('127.0.0.1:9187/') ||
    exporter.environment?.DATA_SOURCE_URI !== 'postgres:5432/acres?sslmode=disable' ||
    exporter.environment?.DATA_SOURCE_USER !== 'acres_monitor' ||
    exporter.environment?.DATA_SOURCE_PASS_FILE !== '/run/secrets/acres_monitor_password' ||
    exporter.environment?.PG_EXPORTER_COLLECTION_TIMEOUT !== '10s' ||
    exporter.env_file || exporter.command ||
    Object.keys(exporter.environment || {}).some((key) => /DATA_SOURCE_(?:PASS|NAME)$/.test(key)) ||
    Object.keys(exporter.environment || {}).some((key) => /POSTGRES|DATABASE_URL|ACRES_APP|ACRES_MIGRATOR/.test(key)) ||
    exporterMounts.length !== 1 ||
    !monitorMount || monitorMount.source !== '${ACRES_MONITOR_PASSWORD_FILE:?inject monitor password file path}' ||
    monitorMount.writable ||
    !exporterScrape || exporterScrape.metrics_path !== '/metrics' ||
    exporterScrape.scrape_interval !== '30s' || exporterScrape.scrape_timeout !== '15s' ||
    !exporterScrape.static_configs?.some((entry) => entry.targets?.includes('postgres-exporter:9187')) ||
    !exporterRelabel.some((rule) => rule.action === 'keep' &&
      ['pg_up', 'pg_exporter_last_scrape_error', 'pg_settings_max_connections',
       'pg_stat_database_numbackends', 'pg_stat_activity_count',
       'pg_stat_activity_max_tx_duration'].every((metric) =>
        String(rule.regex).split('|').includes(metric))) ||
    exporterRelabel.some((rule) => rule.action === 'labeldrop') ||
    JSON.stringify(services.caddy).includes('postgres-exporter') ||
    fs.readFileSync('infra/caddy/Caddyfile.example', 'utf8').includes('postgres-exporter') ||
    !String(services.postgres?.environment?.ACRES_MONITOR_BOOTSTRAP_PASSWORD || '').includes('ACRES_MONITOR_BOOTSTRAP_PASSWORD') ||
    !JSON.stringify(services.postgres.volumes).includes('reconcile-production-monitor.sh')) {
  console.error('ops template check failed: postgres exporter must use private file credentials and bounded scrape');
  process.exit(1);
}
const monitorSql = fs.readFileSync('scripts/db/reconcile-production-monitor.sh', 'utf8');
if (!monitorSql.includes('GRANT pg_monitor TO acres_monitor') ||
    !monitorSql.includes('NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS') ||
    !monitorSql.includes('acres_monitor privilege verification failed') ||
    !fs.readFileSync('docs/operations.md', 'utf8').includes('002-reconcile-production-monitor.sh')) {
  console.error('ops template check failed: monitor role reconciliation or existing-volume procedure missing');
  process.exit(1);
}
for (const [name, service] of Object.entries(services)) {
  if (name !== 'postgres-exporter' && JSON.stringify(service.volumes || []).includes('ACRES_MONITOR_PASSWORD_FILE')) {
    console.error(`ops template check failed: monitor password file must not be mounted into ${name}`);
    process.exit(1);
  }
  if (name !== 'postgres' && JSON.stringify(service.environment || {}).includes('ACRES_MONITOR_BOOTSTRAP_PASSWORD')) {
    console.error(`ops template check failed: monitor bootstrap password must not reach ${name}`);
    process.exit(1);
  }
}

const alerts = readYaml('infra/prometheus/alerts.yml');
const alertNames = (alerts.groups || []).flatMap((g) => (g.rules || []).map((r) => r.alert));
const requiredAlerts = [
  'AcresApiDown',
  'AcresWorkerDown',
  'PostgresDown',
  'PostgresExporterDown',
  'HighHttp5xxRate',
  'P95LatencyThresholdExceeded',
  'High429Rate',
  'QueueDeadLettersDetected',
  'OutboxDeliveryLag',
  'HighHttpConcurrency',
  'DatabaseConnectionPoolSaturation',
];
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

for (const panel of dashboard.panels) {
  for (const target of panel.targets || []) {
    const expr = target.expr || '';
    const expectedJob = panel.id === 1 ? 'prometheus' :
      [4, 8, 11, 12, 13, 24, 26].includes(panel.id) ? 'acres-worker' :
      panel.id >= 14 && panel.id <= 22 ? 'acres-postgres' : 'acres-api';
    if (!expr.includes(`job="${expectedJob}"`)) {
      console.error(`ops template check failed: dashboard panel ${panel.id} lacks ${expectedJob} scope`);
      process.exit(1);
    }
  }
}
const postgresMetrics = new Map([
  [14, 'up'], [15, 'pg_up'], [16, 'pg_exporter_last_scrape_error'],
  [17, 'pg_settings_max_connections'], [18, 'pg_stat_database_numbackends'],
  [19, 'pg_stat_database_numbackends'], [20, 'pg_stat_activity_count'],
]);
const ids = dashboard.panels.map((panel) => panel.id);
if (new Set(ids).size !== ids.length || [...postgresMetrics].some(([id, metric]) =>
  !dashboard.panels.find((panel) => panel.id === id)?.targets?.some((target) =>
    target.expr?.includes(`${metric}{job="acres-postgres"`) ||
    target.expr?.includes(`${metric}{job="acres-postgres",`)))) {
  console.error('ops template check failed: postgres dashboard panels or metrics drifted');
  process.exit(1);
}
for (const id of [14, 15, 16, 23, 24, 25, 26, 27, 28]) {
  const panel = dashboard.panels.find((p) => p.id === id);
  const exprs = (panel?.targets || []).map((t) => t.expr || '').join(' ');
  if (exprs.includes('or vector(0)') || exprs.includes('or on() vector(0)')) {
    console.error(`ops template check failed: panel ${id} must preserve absent data`);
    process.exit(1);
  }
}
const p23 = dashboard.panels.find((p) => p.id === 23);
const p24 = dashboard.panels.find((p) => p.id === 24);
if (!p23 || !p24 || p23.fieldConfig?.defaults?.unit !== 's' || p24.fieldConfig?.defaults?.unit !== 's' ||
    !p23.targets?.some((t) => t.expr?.includes('acres_postgres_pool_acquisition_duration_seconds_bucket{job="acres-api"}')) ||
    !p24.targets?.some((t) => t.expr?.includes('acres_postgres_pool_acquisition_duration_seconds_bucket{job="acres-worker"}'))) {
  console.error('ops template check failed: pool acquisition duration panels drifted');
  process.exit(1);
}
const p25 = dashboard.panels.find((p) => p.id === 25);
const p26 = dashboard.panels.find((p) => p.id === 26);
if (!p25 || !p26 || p25.fieldConfig?.defaults?.unit !== 's' || p26.fieldConfig?.defaults?.unit !== 's' ||
    !p25.targets?.some((t) => t.expr?.includes('acres_database_query_duration_seconds_bucket{job="acres-api"}')) ||
    !p26.targets?.some((t) => t.expr?.includes('acres_database_query_duration_seconds_bucket{job="acres-worker"}'))) {
  console.error('ops template check failed: database query duration panels drifted');
  process.exit(1);
}
const p27 = dashboard.panels.find((p) => p.id === 27);
const p28 = dashboard.panels.find((p) => p.id === 28);
if (!p27 || !p28 || p27.fieldConfig?.defaults?.unit !== 'short' || p28.fieldConfig?.defaults?.unit !== 'percent' ||
    !p27.targets?.some((t) => t.expr?.includes('acres_http_active_requests{job="acres-api"}')) ||
    !p28.targets?.some((t) => t.expr?.includes('acres_http_429_responses_total{job="acres-api"}'))) {
  console.error('ops template check failed: active requests or 429 rate panels drifted');
  process.exit(1);
}
const diagnosticsErrors = verifyPostgresDiagnostics(exporterScrape, dashboard);
if (diagnosticsErrors.length > 0) {
  console.error(`ops template check failed: ${diagnosticsErrors.join('; ')}`);
  process.exit(1);
}

const readinessExample = readJson('infra/launch/readiness.example.json');
if (!readinessExample || typeof readinessExample !== 'object' || !readinessExample.sections) {
  console.error('ops template check failed: infra/launch/readiness.example.json missing sections object');
  process.exit(1);
}
const sloAlerting = readinessExample.sections.slo_and_alerting;
if (!sloAlerting ||
    sloAlerting.max_database_acquisition_p95_latency_ms !== 50 ||
    sloAlerting.max_database_query_p95_latency_ms !== 100) {
  console.error('ops template check failed: infra/launch/readiness.example.json missing database latency SLO ceilings (50ms acquisition, 100ms query)');
  process.exit(1);
}

const checklist = fs.readFileSync('docs/launch-checklist.md', 'utf8');
const alertRules = alerts && alerts.groups && alerts.groups[0] && Array.isArray(alerts.groups[0].rules)
  ? alerts.groups[0].rules
  : [];

if (alertRules.length !== 11) {
  console.error(`ops template check failed: expected 11 alert rules in alerts.yml, found ${alertRules.length}`);
  process.exit(1);
}

for (const rule of alertRules) {
  if (!checklist.includes(`### ${rule.alert}`)) {
    console.error(`ops template check failed: docs/launch-checklist.md missing runbook section for ${rule.alert}`);
    process.exit(1);
  }
  const sectionIdx = checklist.indexOf(`### ${rule.alert}`);
  const nextSectionIdx = checklist.indexOf('### ', sectionIdx + 4);
  const sectionContent = checklist.slice(sectionIdx, nextSectionIdx !== -1 ? nextSectionIdx : undefined);
  if (!sectionContent.includes(rule.expr)) {
    console.error(`ops template check failed: docs/launch-checklist.md missing exact scoped PromQL for ${rule.alert} in its runbook section: ${rule.expr}`);
    process.exit(1);
  }
  if (!sectionContent.includes('- Dashboard:')) {
    console.error(`ops template check failed: docs/launch-checklist.md missing Dashboard panel reference for ${rule.alert}`);
    process.exit(1);
  }
}

const launchDrillsScript = fs.readFileSync('scripts/ops/run-launch-drills.sh', 'utf8');
if (!launchDrillsScript.includes('databaseBaselineCompliance') ||
    !launchDrillsScript.includes('databaseTelemetryBaseline')) {
  console.error('ops template check failed: scripts/ops/run-launch-drills.sh missing database baseline dossier integration');
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

node scripts/ops/verify-caddy-routing.js infra/caddy/Caddyfile.example >/dev/null || fail 'Caddy routing verification failed'
node scripts/ops/verify-volume-encryption.js >/dev/null || fail 'Volume encryption verification failed'
node scripts/ops/verify-alert-rules.js >/dev/null || fail 'Alert rules verification failed'
node scripts/ops/verify-capacity-load.js --no-save >/dev/null || fail 'Capacity load verification failed'

printf 'ops template check passed\n'
