#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const { verifyPostgresDiagnostics } = require('./verify-postgres-diagnostics');
const { validateComposeImages } = require('./check-release-images');
const { parseBackupScheduleCron } = require('./check-launch-readiness');
const { checkSmtpTemplateKeys } = require('./check-smtp-template-keys');
const { checkProxyEnvironment } = require('./check-proxy-environment');
const { checkApplicationEnvironment } = require('./check-application-environment');
const { checkGarageMetrics } = require('./check-garage-metrics');

const REQUIRED_SERVICES = [
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

const REQUIRED_ALERTS = [
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

const EXPECTED_DRAIN_PERIODS = {
  caddy: '30s',
  next: '30s',
  api: '45s',
  worker: '60s',
};

function readYaml(filePath, errors) {
  try {
    return yaml.load(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (errors) {
      errors.push(`${filePath} is not valid YAML: ${error.message}`);
    } else {
      throw error;
    }
    return null;
  }
}

function readJson(filePath, errors) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (errors) {
      errors.push(`${filePath} is not valid JSON: ${error.message}`);
    } else {
      throw error;
    }
    return null;
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

function assertPostgres18Mount(composeDocument, filePath) {
  const postgresServices = Object.entries(composeDocument?.services || {}).filter(
    ([, service]) => /^postgis\/postgis:18-/.test(String(service?.image || '')),
  );

  if (postgresServices.length === 0) {
    throw new Error(`${filePath} missing postgis/postgis:18-* service`);
  }

  for (const [name, service] of postgresServices) {
    const mounts = (service.volumes || []).map(mountDetails);
    const postgresMount = mounts.find(({ target }) => target === '/var/lib/postgresql');
    if (!postgresMount) {
      throw new Error(`${filePath} ${name} must mount persistent storage at /var/lib/postgresql`);
    }
    if (!postgresMount.source || !postgresMount.persistent || !postgresMount.writable) {
      throw new Error(
        `${filePath} ${name} must use a writable bind or volume mount at /var/lib/postgresql`,
      );
    }
    if (mounts.some(({ target }) => target === '/var/lib/postgresql/data')) {
      throw new Error(`${filePath} ${name} must not mount /var/lib/postgresql/data`);
    }
  }
}

function validateRequiredServices(services) {
  for (const service of REQUIRED_SERVICES) {
    if (!services || !services[service]) {
      throw new Error(`compose missing ${service} service`);
    }
  }
  return true;
}

function validateComposeSecurityAndTopology(services) {
  const errors = [];
  const svcEntries = Object.entries(services || {});

  for (const [name, service] of svcEntries) {
    if (name !== 'caddy' && Array.isArray(service?.ports) && service.ports.length > 0) {
      errors.push(`${name} must not publish host ports`);
    }
  }

  const apiScheduler = services?.api?.environment && services.api.environment.SCHEDULER_ENABLED;
  const workerScheduler = services?.worker?.environment && services.worker.environment.SCHEDULER_ENABLED;
  if (apiScheduler !== 'false' || workerScheduler !== 'true') {
    errors.push('compose must enable scheduler only on worker');
  }

  for (const service of ['postgres', 'valkey', 'garage']) {
    const volumes = services?.[service]?.volumes || [];
    if (!volumes.some((entry) => String(entry).includes('ENCRYPTED_MOUNT'))) {
      errors.push(`${service} must declare an encrypted production mount placeholder`);
    }
  }

  for (const [name, service] of svcEntries) {
    if (service && Object.hasOwn(service, 'env_file')) {
      errors.push(`${name} must not declare env_file`);
    }
  }

  const garageEnv = services?.garage?.environment || {};
  for (const key of ['GARAGE_RPC_SECRET', 'GARAGE_ADMIN_TOKEN']) {
    if (!String(garageEnv[key] || '').includes(key)) {
      errors.push(`production Garage must explicitly define ${key}`);
    }
  }

  for (const [name, service] of svcEntries) {
    if (name === 'garage') continue;
    const env = service?.environment || {};
    for (const key of ['GARAGE_ADMIN_TOKEN', 'GARAGE_METRICS_TOKEN', 'GARAGE_METRICS_TOKEN_FILE']) {
      if (Object.prototype.hasOwnProperty.call(env, key)) {
        errors.push(`${key} must be scoped to Garage only, not ${name}`);
      }
    }
  }

  return errors;
}

function validateComposeEnvironmentInterpolation(composeText, envKeys) {
  const errors = [];
  const validKeys = envKeys instanceof Set ? envKeys : new Set(envKeys);
  const interpolationKeys = new Set();
  for (const match of (composeText || '').matchAll(/\$\{([A-Z0-9_]+)(?::?[?+-][^}]*)?\}/g)) {
    interpolationKeys.add(match[1]);
  }
  for (const key of interpolationKeys) {
    if (!validKeys.has(key) && key !== 'ACRES_MONITOR_BOOTSTRAP_PASSWORD') {
      errors.push(`${key} is used by compose but missing from production.env.example`);
    }
  }

  if (
    (composeText || '').includes('ACRES_TEST_PASSWORD') ||
    (composeText || '').includes('bootstrap-roles.sh')
  ) {
    errors.push('production compose must not create local test database roles');
  }

  return errors;
}

function validateWorkerAndExporterScrape(services, prom, monitorSql, operationsDoc, caddyfileText = '') {
  const errors = [];
  const scrapeJobs = (prom?.scrape_configs || []).map((c) => c.job_name);
  if (!scrapeJobs.includes('acres-api')) {
    errors.push('Prometheus config missing acres-api scrape target');
  }

  const worker = services?.worker;
  const workerScrape = (prom?.scrape_configs || []).find((job) => job.job_name === 'acres-worker');
  if (
    !workerScrape ||
    workerScrape.metrics_path !== '/metrics' ||
    !workerScrape.static_configs?.some((entry) => entry.targets?.includes('worker:3002')) ||
    !worker?.expose?.includes('3002') ||
    worker.environment?.WORKER_METRICS_HOST !== '0.0.0.0' ||
    worker.environment?.WORKER_METRICS_PORT !== '3002' ||
    !(JSON.stringify(worker.healthcheck?.test) || '').includes('127.0.0.1:3002/health') ||
    (JSON.stringify(services?.caddy) || '').includes('worker:3002')
  ) {
    errors.push('worker metrics must stay on private port 3002 with matching probe and scrape');
  }

  const exporter = services?.['postgres-exporter'];
  const exporterScrape = (prom?.scrape_configs || []).find((job) => job.job_name === 'acres-postgres');
  const exporterRelabel = exporterScrape?.metric_relabel_configs || [];
  const exporterMounts = (exporter?.volumes || []).map(mountDetails);
  const monitorMount = exporterMounts.find(
    (mount) => mount.target === '/run/secrets/acres_monitor_password',
  );

  if (
    !exporter ||
    JSON.stringify(exporter.profiles) !== JSON.stringify(['observability']) ||
    JSON.stringify(exporter.networks) !== JSON.stringify(['private']) ||
    !exporter.expose?.includes('9187') ||
    exporter.ports?.length ||
    !(JSON.stringify(exporter.healthcheck?.test) || '').includes('127.0.0.1:9187/') ||
    exporter.depends_on?.postgres?.condition !== 'service_healthy' ||
    exporter.environment?.DATA_SOURCE_URI !== 'postgres:5432/acres?sslmode=disable' ||
    exporter.environment?.DATA_SOURCE_USER !== 'acres_monitor' ||
    exporter.environment?.DATA_SOURCE_PASS_FILE !== '/run/secrets/acres_monitor_password' ||
    exporter.environment?.PG_EXPORTER_COLLECTION_TIMEOUT !== '10s' ||
    exporter.env_file ||
    exporter.command ||
    Object.keys(exporter.environment || {}).some((key) => /DATA_SOURCE_(?:PASS|NAME)$/.test(key)) ||
    Object.keys(exporter.environment || {}).some((key) =>
      /POSTGRES|DATABASE_URL|ACRES_APP|ACRES_MIGRATOR/.test(key),
    ) ||
    exporterMounts.length !== 1 ||
    !monitorMount ||
    monitorMount.source !== '${ACRES_MONITOR_PASSWORD_FILE:?inject monitor password file path}' ||
    monitorMount.writable ||
    !exporterScrape ||
    exporterScrape.metrics_path !== '/metrics' ||
    exporterScrape.scrape_interval !== '30s' ||
    exporterScrape.scrape_timeout !== '15s' ||
    !exporterScrape.static_configs?.some((entry) => entry.targets?.includes('postgres-exporter:9187')) ||
    !exporterRelabel.some(
      (rule) =>
        rule.action === 'keep' &&
        [
          'pg_up',
          'pg_exporter_last_scrape_error',
          'pg_settings_max_connections',
          'pg_stat_database_numbackends',
          'pg_stat_activity_count',
          'pg_stat_activity_max_tx_duration',
        ].every((metric) => String(rule.regex).split('|').includes(metric)),
    ) ||
    exporterRelabel.some((rule) => rule.action === 'labeldrop') ||
    (JSON.stringify(services?.caddy) || '').includes('postgres-exporter') ||
    (caddyfileText && caddyfileText.includes('postgres-exporter')) ||
    !String(services?.postgres?.environment?.ACRES_MONITOR_BOOTSTRAP_PASSWORD || '').includes(
      'ACRES_MONITOR_BOOTSTRAP_PASSWORD',
    ) ||
    !(JSON.stringify(services?.postgres?.volumes) || '').includes('reconcile-production-monitor.sh')
  ) {
    errors.push('postgres exporter must use private file credentials and bounded scrape');
  }

  if (
    !monitorSql ||
    !monitorSql.includes('GRANT pg_monitor TO acres_monitor') ||
    !monitorSql.includes('NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS') ||
    !monitorSql.includes('acres_monitor privilege verification failed') ||
    !operationsDoc ||
    !operationsDoc.includes('002-reconcile-production-monitor.sh')
  ) {
    errors.push('monitor role reconciliation or existing-volume procedure missing');
  }

  for (const [name, service] of Object.entries(services || {})) {
    if (
      name !== 'postgres-exporter' &&
      JSON.stringify(service?.volumes || []).includes('ACRES_MONITOR_PASSWORD_FILE')
    ) {
      errors.push(`monitor password file must not be mounted into ${name}`);
    }
    if (
      name !== 'postgres' &&
      JSON.stringify(service?.environment || {}).includes('ACRES_MONITOR_BOOTSTRAP_PASSWORD')
    ) {
      errors.push(`monitor bootstrap password must not reach ${name}`);
    }
  }

  return errors;
}

function validateServiceHealthAndSupervision(services) {
  const errors = [];
  const prometheusSvc = services?.prometheus;
  if (
    !prometheusSvc ||
    !(JSON.stringify(prometheusSvc.healthcheck?.test) || '').includes('127.0.0.1:9090/-/healthy') ||
    prometheusSvc.healthcheck?.interval !== '30s' ||
    prometheusSvc.healthcheck?.timeout !== '5s'
  ) {
    errors.push('Prometheus service must define bounded healthcheck on /-/healthy');
  }

  const grafanaSvc = services?.grafana;
  if (!grafanaSvc || grafanaSvc.depends_on?.prometheus?.condition !== 'service_healthy') {
    errors.push('Grafana service must depend on healthy Prometheus');
  }

  for (const dep of ['postgres', 'valkey', 'garage']) {
    if (services?.api?.depends_on?.[dep]?.condition !== 'service_healthy') {
      errors.push(`api service must depend on ${dep} with condition: service_healthy`);
    }
  }
  for (const [dep, config] of Object.entries(services?.api?.depends_on || {})) {
    if (config?.condition !== 'service_healthy') {
      errors.push(`api service dependency ${dep} must require condition: service_healthy`);
    }
  }
  for (const dep of ['postgres', 'valkey', 'garage', 'clamav']) {
    if (services?.worker?.depends_on?.[dep]?.condition !== 'service_healthy') {
      errors.push(`worker service must depend on ${dep} with condition: service_healthy`);
    }
  }
  for (const [dep, config] of Object.entries(services?.worker?.depends_on || {})) {
    if (config?.condition !== 'service_healthy') {
      errors.push(`worker service dependency ${dep} must require condition: service_healthy`);
    }
  }

  for (const appSvc of ['api', 'worker', 'next']) {
    const svc = services?.[appSvc];
    if (!svc || svc.init !== true || svc.stop_signal !== 'SIGTERM') {
      errors.push(`${appSvc} service must configure init: true and stop_signal: SIGTERM`);
    }
  }

  for (const [name, service] of Object.entries(services || {})) {
    if (!service || typeof service !== 'object') continue;
    if (service.restart !== 'unless-stopped') {
      errors.push(`${name} must configure restart: unless-stopped`);
    }
    if (!service.stop_grace_period || !/^[1-9]\d*s$/.test(service.stop_grace_period)) {
      errors.push(`${name} must configure a positive bounded stop_grace_period`);
    }
    if (EXPECTED_DRAIN_PERIODS[name] && service.stop_grace_period !== EXPECTED_DRAIN_PERIODS[name]) {
      errors.push(`${name} stop_grace_period must be ${EXPECTED_DRAIN_PERIODS[name]}`);
    }
  }

  return errors;
}

function validatePrometheusAlertsAndDashboard(alerts, dashboard, checklist) {
  const errors = [];
  const alertNames = (alerts?.groups || []).flatMap((g) => (g.rules || []).map((r) => r.alert));
  for (const reqAlert of REQUIRED_ALERTS) {
    if (!alertNames.includes(reqAlert)) {
      errors.push(`Prometheus alerts missing required rule ${reqAlert}`);
    }
  }

  if (dashboard?.uid !== 'acres-operations-foundation') {
    errors.push('Grafana dashboard uid drifted');
  }
  if (!dashboard || !Array.isArray(dashboard.panels) || dashboard.panels.length < 5) {
    errors.push('Grafana dashboard missing operational panels');
  }

  for (const panel of dashboard?.panels || []) {
    for (const target of panel.targets || []) {
      const expr = target.expr || '';
      const expectedJob =
        panel.id === 1
          ? 'prometheus'
          : [4, 8, 11, 12, 13, 24, 26].includes(panel.id)
            ? 'acres-worker'
            : panel.id >= 14 && panel.id <= 22
              ? 'acres-postgres'
              : 'acres-api';
      if (!expr.includes(`job="${expectedJob}"`)) {
        errors.push(`dashboard panel ${panel.id} lacks ${expectedJob} scope`);
      }
    }
  }

  const postgresMetrics = new Map([
    [14, 'up'],
    [15, 'pg_up'],
    [16, 'pg_exporter_last_scrape_error'],
    [17, 'pg_settings_max_connections'],
    [18, 'pg_stat_database_numbackends'],
    [19, 'pg_stat_database_numbackends'],
    [20, 'pg_stat_activity_count'],
  ]);
  const ids = (dashboard?.panels || []).map((panel) => panel.id);
  if (
    new Set(ids).size !== ids.length ||
    [...postgresMetrics].some(
      ([id, metric]) =>
        !dashboard?.panels
          ?.find((panel) => panel.id === id)
          ?.targets?.some(
            (target) =>
              target.expr?.includes(`${metric}{job="acres-postgres"`) ||
              target.expr?.includes(`${metric}{job="acres-postgres",`),
          ),
    )
  ) {
    errors.push('postgres dashboard panels or metrics drifted');
  }

  for (const id of [14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    const panel = dashboard?.panels?.find((p) => p.id === id);
    const exprs = (panel?.targets || []).map((t) => t.expr || '').join(' ');
    if (exprs.includes('or vector(0)') || exprs.includes('or on() vector(0)')) {
      errors.push(`panel ${id} must preserve absent data`);
    }
  }

  const p23 = dashboard?.panels?.find((p) => p.id === 23);
  const p24 = dashboard?.panels?.find((p) => p.id === 24);
  if (
    !p23 ||
    !p24 ||
    p23.fieldConfig?.defaults?.unit !== 's' ||
    p24.fieldConfig?.defaults?.unit !== 's' ||
    !p23.targets?.some((t) =>
      t.expr?.includes(
        'acres_postgres_pool_acquisition_duration_seconds_bucket{job="acres-api"}',
      ),
    ) ||
    !p24.targets?.some((t) =>
      t.expr?.includes(
        'acres_postgres_pool_acquisition_duration_seconds_bucket{job="acres-worker"}',
      ),
    )
  ) {
    errors.push('pool acquisition duration panels drifted');
  }

  const p25 = dashboard?.panels?.find((p) => p.id === 25);
  const p26 = dashboard?.panels?.find((p) => p.id === 26);
  if (
    !p25 ||
    !p26 ||
    p25.fieldConfig?.defaults?.unit !== 's' ||
    p26.fieldConfig?.defaults?.unit !== 's' ||
    !p25.targets?.some((t) =>
      t.expr?.includes('acres_database_query_duration_seconds_bucket{job="acres-api"}'),
    ) ||
    !p26.targets?.some((t) =>
      t.expr?.includes('acres_database_query_duration_seconds_bucket{job="acres-worker"}'),
    )
  ) {
    errors.push('database query duration panels drifted');
  }

  const p27 = dashboard?.panels?.find((p) => p.id === 27);
  const p28 = dashboard?.panels?.find((p) => p.id === 28);
  if (
    !p27 ||
    !p28 ||
    p27.fieldConfig?.defaults?.unit !== 'short' ||
    p28.fieldConfig?.defaults?.unit !== 'percent' ||
    !p27.targets?.some((t) => t.expr?.includes('acres_http_active_requests{job="acres-api"}')) ||
    !p28.targets?.some((t) =>
      t.expr?.includes('acres_http_429_responses_total{job="acres-api"}'),
    )
  ) {
    errors.push('active requests or 429 rate panels drifted');
  }

  const alertRules =
    alerts && alerts.groups && alerts.groups[0] && Array.isArray(alerts.groups[0].rules)
      ? alerts.groups[0].rules
      : [];

  if (alertRules.length !== 11) {
    errors.push(`expected 11 alert rules in alerts.yml, found ${alertRules.length}`);
  }

  for (const rule of alertRules) {
    if (!checklist || !checklist.includes(`### ${rule.alert}`)) {
      errors.push(`docs/launch-checklist.md missing runbook section for ${rule.alert}`);
      continue;
    }
    const sectionIdx = checklist.indexOf(`### ${rule.alert}`);
    const nextSectionIdx = checklist.indexOf('### ', sectionIdx + 4);
    const sectionContent = checklist.slice(
      sectionIdx,
      nextSectionIdx !== -1 ? nextSectionIdx : undefined,
    );
    if (!sectionContent.includes(rule.expr)) {
      errors.push(
        `docs/launch-checklist.md missing exact scoped PromQL for ${rule.alert} in its runbook section: ${rule.expr}`,
      );
    }
    if (!sectionContent.includes('- Dashboard:')) {
      errors.push(`docs/launch-checklist.md missing Dashboard panel reference for ${rule.alert}`);
    }
  }

  return errors;
}

function validateReadinessTargets(readinessExample, bdrOverride) {
  const errors = [];
  if (!readinessExample || typeof readinessExample !== 'object' || !readinessExample.sections) {
    errors.push('infra/launch/readiness.example.json missing sections object');
    return errors;
  }

  const sloAlerting = readinessExample.sections.slo_and_alerting;
  if (
    !sloAlerting ||
    sloAlerting.availability_target_percent !== 99.9 ||
    sloAlerting.max_p95_latency_ms !== 500 ||
    sloAlerting.capacity_target_rps !== 100 ||
    sloAlerting.max_database_acquisition_p95_latency_ms !== 50 ||
    sloAlerting.max_database_query_p95_latency_ms !== 100
  ) {
    errors.push(
      'infra/launch/readiness.example.json missing required Category 5 SLO targets (99.9% availability, 500ms max p95, 100 RPS capacity, 50ms acquisition, 100ms query)',
    );
  }

  const bdrSec = bdrOverride || readinessExample.sections.backup_and_disaster_recovery;
  if (!bdrSec || bdrSec.rpo_hours !== 1 || bdrSec.rto_hours !== 4) {
    errors.push(
      'infra/launch/readiness.example.json missing required Category 6 RPO/RTO targets (1h RPO, 4h RTO)',
    );
  }

  const backupSchedule = parseBackupScheduleCron(bdrSec?.backup_schedule_cron);
  if (!backupSchedule || !backupSchedule.valid || backupSchedule.maxGapMinutes > (bdrSec?.rpo_hours || 0) * 60) {
    errors.push('Category 6 backup UTC start gap exceeds RPO or uses unsupported cron syntax');
  }

  return errors;
}

function validateDrillScriptIntegrations(
  launchDrillsScript,
  deploymentDrillScript,
  secretRotationScript,
) {
  const errors = [];
  if (!launchDrillsScript || !launchDrillsScript.includes('assemble-launch-dossier.js assemble')) {
    errors.push('launch runner missing dossier assembler');
  }

  const requiredMarkers = [
    'run-static-integrity-checks.js --output',
    'static-integrity-evidence-',
    'staticIntegrityBaseline',
    'staticIntegrityCompliance',
    'databaseBaselineCompliance',
    'databaseTelemetryBaseline',
    'disasterRecoveryBaseline',
    'restoreCompliance',
    'reconcileCompliance',
    'deploymentBaseline',
    'secretRotationBaseline',
    'deploymentCompliance',
    'rollbackCompliance',
    'secretRotationCompliance',
    'volumeEncryptionBaseline',
    'volumeEncryptionCompliance',
    'supplyChainBaseline',
    'supplyChainCompliance',
    'sastCompliance',
    'containerSecurityCompliance',
  ];

  if (!launchDrillsScript || requiredMarkers.some((marker) => !launchDrillsScript.includes(marker))) {
    errors.push(
      'scripts/ops/run-launch-drills.sh missing static integrity or other baseline dossier integration',
    );
  }

  if (
    !deploymentDrillScript ||
    !deploymentDrillScript.includes('restart: unless-stopped') ||
    !deploymentDrillScript.includes('init: true for signal supervision') ||
    !deploymentDrillScript.includes('stop_signal: SIGTERM') ||
    !deploymentDrillScript.includes('condition: service_healthy') ||
    !deploymentDrillScript.includes('graceful_drain_periods_verified')
  ) {
    errors.push(
      'scripts/ops/run-deployment-drill.sh missing restart, signal supervision, or dependency health verification',
    );
  }

  if (
    !secretRotationScript ||
    !secretRotationScript.includes('requires a non-empty value') ||
    !secretRotationScript.includes('scripts/ops/check-production-templates.sh') ||
    !secretRotationScript.includes('tested_secret_classes') ||
    !secretRotationScript.includes('redaction_audit')
  ) {
    errors.push(
      'scripts/ops/run-secret-rotation-drill.sh missing option validation, template check, or redaction audit',
    );
  }

  return errors;
}

function checkProductionTemplates(options = {}, _io = {}) {
  const cwd = options.cwd || process.cwd();
  const errors = [];

  const resolvePath = (relPath) => path.resolve(cwd, relPath);
  const readFileSafe = (relPath) => {
    try {
      return fs.readFileSync(resolvePath(relPath), 'utf8');
    } catch (error) {
      errors.push(`missing or unreadable file: ${relPath} (${error.message})`);
      return '';
    }
  };

  const compose = readYaml(resolvePath('infra/compose/docker-compose.production.example.yml'), errors);
  const localCompose = readYaml(resolvePath('docker-compose.yml'), errors);
  const services = compose && compose.services ? compose.services : {};

  const productionEnv = readFileSafe('infra/env/production.env.example');
  const garageEnvExample = readFileSafe('infra/env/garage.production.env.example');
  const caddyfileText = readFileSafe('infra/caddy/Caddyfile.example');
  const composeText = readFileSafe('infra/compose/docker-compose.production.example.yml');
  const monitorSql = readFileSafe('scripts/db/reconcile-production-monitor.sh');
  const operationsDoc = readFileSafe('docs/operations.md');
  const checklist = readFileSafe('docs/launch-checklist.md');
  const launchRunner = readFileSafe('scripts/ops/run-launch-drills.sh');
  const assembleDossier = readFileSafe('scripts/ops/assemble-launch-dossier.js');
  const deploymentDrillScript = readFileSafe('scripts/ops/run-deployment-drill.sh');
  const secretRotationScript = readFileSafe('scripts/ops/run-secret-rotation-drill.sh');

  if (compose && productionEnv) {
    const applicationEnvironmentErrors = checkApplicationEnvironment(compose, productionEnv);
    errors.push(...applicationEnvironmentErrors);
  }

  if (compose && caddyfileText) {
    const proxyEnvironmentErrors = checkProxyEnvironment(compose, caddyfileText);
    errors.push(...proxyEnvironmentErrors);
  }

  if (compose) {
    try {
      validateComposeImages(compose);
    } catch (error) {
      errors.push(error.message);
    }
  }

  try {
    validateRequiredServices(services);
  } catch (error) {
    errors.push(error.message);
  }

  if (localCompose) {
    try {
      assertPostgres18Mount(localCompose, 'docker-compose.yml');
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (compose) {
    try {
      assertPostgres18Mount(compose, 'infra/compose/docker-compose.production.example.yml');
    } catch (error) {
      errors.push(error.message);
    }
  }

  errors.push(...validateComposeSecurityAndTopology(services));

  const envExample = productionEnv + '\n' + garageEnvExample;
  const envKeys = new Set();
  for (const line of envExample.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (match) envKeys.add(match[1]);
  }

  if (productionEnv) {
    errors.push(...checkSmtpTemplateKeys(productionEnv));
  }

  if (composeText) {
    errors.push(...validateComposeEnvironmentInterpolation(composeText, envKeys));
  }

  const prom = readYaml(resolvePath('infra/prometheus/prometheus.yml'), errors);
  const garageToml = readFileSafe('infra/garage/garage.toml');

  if (compose && productionEnv && garageEnvExample && garageToml && prom && caddyfileText) {
    const garageMetricsErrors = checkGarageMetrics(
      compose,
      productionEnv,
      garageEnvExample,
      garageToml,
      prom,
      caddyfileText,
    );
    errors.push(...garageMetricsErrors);
  }

  errors.push(
    ...validateWorkerAndExporterScrape(services, prom, monitorSql, operationsDoc, caddyfileText),
  );

  errors.push(...validateServiceHealthAndSupervision(services));

  readYaml(resolvePath('infra/grafana/provisioning/datasources/prometheus.yml'), errors);
  readYaml(resolvePath('infra/grafana/provisioning/dashboards/acres.yml'), errors);

  const alerts = readYaml(resolvePath('infra/prometheus/alerts.yml'), errors);
  const dashboard = readJson(resolvePath('infra/grafana/dashboards/acres-operations.json'), errors);

  if (alerts && dashboard) {
    errors.push(...validatePrometheusAlertsAndDashboard(alerts, dashboard, checklist));
  }

  const exporterScrape = (prom?.scrape_configs || []).find((job) => job.job_name === 'acres-postgres');
  if (exporterScrape && dashboard) {
    const diagnosticsErrors = verifyPostgresDiagnostics(exporterScrape, dashboard);
    if (diagnosticsErrors.length > 0) {
      errors.push(diagnosticsErrors.join('; '));
    }
  }

  const readinessExample = readJson(resolvePath('infra/launch/readiness.example.json'), errors);
  if (readinessExample) {
    errors.push(...validateReadinessTargets(readinessExample));
  }

  const launchDrillsScript = launchRunner + assembleDossier;
  errors.push(
    ...validateDrillScriptIntegrations(
      launchDrillsScript,
      deploymentDrillScript,
      secretRotationScript,
    ),
  );

  return {
    success: errors.length === 0,
    errors,
  };
}

function main(argv = process.argv, io = { log: console.log, error: console.error }, options = {}) {
  let cwd = options.cwd || process.cwd();
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && i + 1 < args.length) {
      cwd = args[i + 1];
      i++;
    } else if (args[i].startsWith('--cwd=')) {
      cwd = args[i].slice(6);
    }
  }

  const result = checkProductionTemplates({ cwd }, io);
  if (!result.success) {
    for (const error of result.errors) {
      io.error(`ops template check failed: ${error}`);
    }
    if (options.exitOnError !== false) {
      process.exit(1);
    }
    return 1;
  }
  return 0;
}

if (require.main === module) {
  main();
}

module.exports = {
  REQUIRED_SERVICES,
  REQUIRED_ALERTS,
  EXPECTED_DRAIN_PERIODS,
  mountDetails,
  assertPostgres18Mount,
  validateRequiredServices,
  validateComposeSecurityAndTopology,
  validateComposeEnvironmentInterpolation,
  validateWorkerAndExporterScrape,
  validateServiceHealthAndSupervision,
  validatePrometheusAlertsAndDashboard,
  validateReadinessTargets,
  validateDrillScriptIntegrations,
  checkProductionTemplates,
  main,
};
