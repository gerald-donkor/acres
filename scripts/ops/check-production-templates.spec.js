#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const {
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
} = require('./check-production-templates');

const REPO_ROOT = path.resolve(__dirname, '../..');

test('mountDetails correctly parses string volume mount formats', () => {
  assert.deepEqual(mountDetails('data:/var/lib/postgresql'), {
    source: 'data',
    target: '/var/lib/postgresql',
    persistent: true,
    writable: true,
  });

  assert.deepEqual(mountDetails('data:/var/lib/postgresql:ro'), {
    source: 'data',
    target: '/var/lib/postgresql',
    persistent: true,
    writable: false,
  });

  assert.deepEqual(mountDetails('data:/var/lib/postgresql:rw'), {
    source: 'data',
    target: '/var/lib/postgresql',
    persistent: true,
    writable: true,
  });

  assert.deepEqual(mountDetails('data:/var/lib/postgresql:ro,z'), {
    source: 'data',
    target: '/var/lib/postgresql',
    persistent: true,
    writable: false,
  });

  assert.deepEqual(mountDetails('data:/var/lib/postgresql:cached'), {
    source: 'data',
    target: '/var/lib/postgresql',
    persistent: true,
    writable: true,
  });
});

test('mountDetails correctly parses object volume mount formats', () => {
  assert.deepEqual(
    mountDetails({
      type: 'volume',
      source: 'data_vol',
      target: '/var/lib/postgresql',
    }),
    {
      source: 'data_vol',
      target: '/var/lib/postgresql',
      persistent: true,
      writable: true,
    },
  );

  assert.deepEqual(
    mountDetails({
      type: 'bind',
      source: '/host/path',
      target: '/var/lib/postgresql',
      read_only: true,
    }),
    {
      source: '/host/path',
      target: '/var/lib/postgresql',
      persistent: true,
      writable: false,
    },
  );

  assert.deepEqual(
    mountDetails({
      type: 'volume',
      source: 'data_vol',
      target: '/var/lib/postgresql',
      readOnly: true,
    }),
    {
      source: 'data_vol',
      target: '/var/lib/postgresql',
      persistent: true,
      writable: false,
    },
  );

  assert.deepEqual(mountDetails({ type: 'tmpfs', target: '/tmp' }), {
    source: undefined,
    target: '/tmp',
    persistent: false,
    writable: true,
  });
});

test('mountDetails returns empty object for invalid or non-object formats', () => {
  assert.deepEqual(mountDetails(null), {});
  assert.deepEqual(mountDetails(undefined), {});
  assert.deepEqual(mountDetails(123), {});
  assert.deepEqual(mountDetails(true), {});
});

test('assertPostgres18Mount passes on valid persistent writable mount at /var/lib/postgresql', () => {
  const composeDoc = {
    services: {
      postgres: {
        image: 'postgis/postgis:18-3.5-alpine',
        volumes: ['postgres_data:/var/lib/postgresql:rw'],
      },
    },
  };

  assert.doesNotThrow(() => {
    assertPostgres18Mount(composeDoc, 'docker-compose.yml');
  });
});

test('assertPostgres18Mount rejects compose document missing postgis:18-* service', () => {
  const composeDoc = {
    services: {
      postgres: {
        image: 'postgres:16-alpine',
      },
    },
  };

  assert.throws(
    () => {
      assertPostgres18Mount(composeDoc, 'docker-compose.yml');
    },
    { message: /docker-compose\.yml missing postgis\/postgis:18-\* service/ },
  );
});

test('assertPostgres18Mount rejects missing mount at /var/lib/postgresql', () => {
  const composeDoc = {
    services: {
      postgres: {
        image: 'postgis/postgis:18-3.5-alpine',
        volumes: ['postgres_data:/var/custom'],
      },
    },
  };

  assert.throws(
    () => {
      assertPostgres18Mount(composeDoc, 'docker-compose.yml');
    },
    { message: /must mount persistent storage at \/var\/lib\/postgresql/ },
  );
});

test('assertPostgres18Mount rejects read-only or non-persistent mount at /var/lib/postgresql', () => {
  const roDoc = {
    services: {
      postgres: {
        image: 'postgis/postgis:18-3.5-alpine',
        volumes: ['postgres_data:/var/lib/postgresql:ro'],
      },
    },
  };

  assert.throws(
    () => {
      assertPostgres18Mount(roDoc, 'docker-compose.yml');
    },
    {
      message:
        /must use a writable bind or volume mount at \/var\/lib\/postgresql/,
    },
  );

  const tmpfsDoc = {
    services: {
      postgres: {
        image: 'postgis/postgis:18-3.5-alpine',
        volumes: [{ type: 'tmpfs', target: '/var/lib/postgresql' }],
      },
    },
  };

  assert.throws(
    () => {
      assertPostgres18Mount(tmpfsDoc, 'docker-compose.yml');
    },
    {
      message:
        /must use a writable bind or volume mount at \/var\/lib\/postgresql/,
    },
  );
});

test('assertPostgres18Mount rejects forbidden mount at /var/lib/postgresql/data', () => {
  const composeDoc = {
    services: {
      postgres: {
        image: 'postgis/postgis:18-3.5-alpine',
        volumes: [
          'postgres_data:/var/lib/postgresql',
          'postgres_data_sub:/var/lib/postgresql/data',
        ],
      },
    },
  };

  assert.throws(
    () => {
      assertPostgres18Mount(composeDoc, 'docker-compose.yml');
    },
    { message: /must not mount \/var\/lib\/postgresql\/data/ },
  );
});

test('validateRequiredServices passes when all 11 services exist', () => {
  const services = {};
  for (const name of REQUIRED_SERVICES) {
    services[name] = {};
  }
  assert.equal(validateRequiredServices(services), true);
});

test('validateRequiredServices throws when any required service is missing', () => {
  const services = {};
  for (const name of REQUIRED_SERVICES) {
    services[name] = {};
  }
  delete services.caddy;

  assert.throws(
    () => {
      validateRequiredServices(services);
    },
    { message: 'compose missing caddy service' },
  );

  services.caddy = {};
  delete services['postgres-exporter'];

  assert.throws(
    () => {
      validateRequiredServices(services);
    },
    { message: 'compose missing postgres-exporter service' },
  );
});

function createValidServicesFixture() {
  return {
    caddy: { ports: ['80:80', '443:443'] },
    next: {},
    api: { environment: { SCHEDULER_ENABLED: 'false' } },
    worker: { environment: { SCHEDULER_ENABLED: 'true' } },
    postgres: {
      volumes: ['postgres_data:/var/lib/postgresql # ENCRYPTED_MOUNT'],
    },
    valkey: { volumes: ['valkey_data:/data # ENCRYPTED_MOUNT'] },
    garage: {
      volumes: ['garage_data:/var/lib/garage # ENCRYPTED_MOUNT'],
      environment: {
        GARAGE_RPC_SECRET: '${GARAGE_RPC_SECRET}',
        GARAGE_ADMIN_TOKEN: '${GARAGE_ADMIN_TOKEN}',
      },
    },
    clamav: {},
    prometheus: {},
    grafana: {},
    'postgres-exporter': {},
  };
}

test('validateComposeSecurityAndTopology passes on valid topology', () => {
  const services = createValidServicesFixture();
  const errors = validateComposeSecurityAndTopology(services);
  assert.deepEqual(errors, []);
});

test('validateComposeSecurityAndTopology rejects non-caddy host port publication', () => {
  const services = createValidServicesFixture();
  services.api.ports = ['3000:3000'];
  const errors = validateComposeSecurityAndTopology(services);
  assert.ok(errors.includes('api must not publish host ports'));
});

test('validateComposeSecurityAndTopology rejects scheduler enabled on api or disabled on worker', () => {
  const services = createValidServicesFixture();
  services.api.environment.SCHEDULER_ENABLED = 'true';
  let errors = validateComposeSecurityAndTopology(services);
  assert.ok(errors.includes('compose must enable scheduler only on worker'));

  services.api.environment.SCHEDULER_ENABLED = 'false';
  services.worker.environment.SCHEDULER_ENABLED = 'false';
  errors = validateComposeSecurityAndTopology(services);
  assert.ok(errors.includes('compose must enable scheduler only on worker'));
});

test('validateComposeSecurityAndTopology rejects missing encrypted mount placeholder', () => {
  const services = createValidServicesFixture();
  services.postgres.volumes = ['postgres_data:/var/lib/postgresql'];
  const errors = validateComposeSecurityAndTopology(services);
  assert.ok(
    errors.includes(
      'postgres must declare an encrypted production mount placeholder',
    ),
  );
});

test('validateComposeSecurityAndTopology rejects env_file declaration on any service', () => {
  const services = createValidServicesFixture();
  services.next.env_file = 'production.env';
  const errors = validateComposeSecurityAndTopology(services);
  assert.ok(errors.includes('next must not declare env_file'));
});

test('validateComposeSecurityAndTopology rejects missing or leaked Garage secrets', () => {
  const services = createValidServicesFixture();
  services.garage.environment.GARAGE_RPC_SECRET = '';
  let errors = validateComposeSecurityAndTopology(services);
  assert.ok(
    errors.includes(
      'production Garage must explicitly define GARAGE_RPC_SECRET',
    ),
  );

  services.garage.environment.GARAGE_RPC_SECRET = 'test-rpc-secret';
  services.api.environment.GARAGE_ADMIN_TOKEN = 'leaked-token';
  errors = validateComposeSecurityAndTopology(services);
  assert.ok(
    errors.includes(
      'GARAGE_ADMIN_TOKEN must be scoped to Garage only, not api',
    ),
  );
});

test('validateComposeEnvironmentInterpolation passes on valid mapped interpolation', () => {
  const composeText =
    'image: ${ACRES_SERVER_IMAGE}\nport: ${APP_PORT:-3000}\nalt: ${ALT_PORT+5000}\npass: ${ACRES_MONITOR_BOOTSTRAP_PASSWORD-}';
  const envKeys = new Set(['ACRES_SERVER_IMAGE', 'APP_PORT', 'ALT_PORT']);
  const errors = validateComposeEnvironmentInterpolation(composeText, envKeys);
  assert.deepEqual(errors, []);
});

test('validateComposeEnvironmentInterpolation catches unmapped keys and test role leakage', () => {
  const composeText =
    'image: ${UNMAPPED_IMAGE_VAR}\nfallback: ${UNMAPPED_FALLBACK-default}\ncmd: bootstrap-roles.sh\npass: ${ACRES_TEST_PASSWORD}';
  const envKeys = new Set(['SOME_OTHER_KEY']);
  const errors = validateComposeEnvironmentInterpolation(composeText, envKeys);
  assert.ok(
    errors.includes(
      'UNMAPPED_IMAGE_VAR is used by compose but missing from production.env.example',
    ),
  );
  assert.ok(
    errors.includes(
      'UNMAPPED_FALLBACK is used by compose but missing from production.env.example',
    ),
  );
  assert.ok(
    errors.includes(
      'production compose must not create local test database roles',
    ),
  );
});

function createValidWorkerAndExporterFixture() {
  const prom = {
    scrape_configs: [
      { job_name: 'acres-api' },
      {
        job_name: 'acres-worker',
        metrics_path: '/metrics',
        static_configs: [{ targets: ['worker:3002'] }],
      },
      {
        job_name: 'acres-postgres',
        metrics_path: '/metrics',
        scrape_interval: '30s',
        scrape_timeout: '15s',
        static_configs: [{ targets: ['postgres-exporter:9187'] }],
        metric_relabel_configs: [
          {
            action: 'keep',
            regex:
              'pg_up|pg_exporter_last_scrape_error|pg_settings_max_connections|pg_stat_database_numbackends|pg_stat_activity_count|pg_stat_activity_max_tx_duration',
          },
        ],
      },
    ],
  };

  const services = {
    caddy: {},
    worker: {
      expose: ['3002'],
      environment: {
        WORKER_METRICS_HOST: '0.0.0.0',
        WORKER_METRICS_PORT: '3002',
      },
      healthcheck: {
        test: ['CMD', 'curl', '-f', 'http://127.0.0.1:3002/health'],
      },
    },
    postgres: {
      environment: {
        ACRES_MONITOR_BOOTSTRAP_PASSWORD: '${ACRES_MONITOR_BOOTSTRAP_PASSWORD}',
      },
      volumes: [
        'reconcile-production-monitor.sh:/entrypoint-initdb.d/reconcile-production-monitor.sh',
      ],
    },
    'postgres-exporter': {
      profiles: ['observability'],
      networks: ['private'],
      expose: ['9187'],
      healthcheck: {
        test: ['CMD', 'curl', '-f', 'http://127.0.0.1:9187/'],
      },
      depends_on: {
        postgres: { condition: 'service_healthy' },
      },
      environment: {
        DATA_SOURCE_URI: 'postgres:5432/acres?sslmode=disable',
        DATA_SOURCE_USER: 'acres_monitor',
        DATA_SOURCE_PASS_FILE: '/run/secrets/acres_monitor_password',
        PG_EXPORTER_COLLECTION_TIMEOUT: '10s',
      },
      volumes: [
        '${ACRES_MONITOR_PASSWORD_FILE:?inject monitor password file path}:/run/secrets/acres_monitor_password:ro',
      ],
    },
  };

  const monitorSql =
    'GRANT pg_monitor TO acres_monitor\nNOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS\nacres_monitor privilege verification failed';
  const operationsDoc = '002-reconcile-production-monitor.sh';
  const caddyfileText = 'caddy configuration';

  return { services, prom, monitorSql, operationsDoc, caddyfileText };
}

test('validateWorkerAndExporterScrape passes on compliant scraper and exporter setup', () => {
  const { services, prom, monitorSql, operationsDoc, caddyfileText } =
    createValidWorkerAndExporterFixture();
  const errors = validateWorkerAndExporterScrape(
    services,
    prom,
    monitorSql,
    operationsDoc,
    caddyfileText,
  );
  assert.deepEqual(errors, []);
});

test('validateWorkerAndExporterScrape catches worker metrics exposure or probe mismatches', () => {
  const { services, prom, monitorSql, operationsDoc, caddyfileText } =
    createValidWorkerAndExporterFixture();
  services.worker.expose = ['3000'];
  const errors = validateWorkerAndExporterScrape(
    services,
    prom,
    monitorSql,
    operationsDoc,
    caddyfileText,
  );
  assert.ok(
    errors.includes(
      'worker metrics must stay on private port 3002 with matching probe and scrape',
    ),
  );
});

test('validateWorkerAndExporterScrape catches missing acres-api scrape target', () => {
  const { services, prom, monitorSql, operationsDoc, caddyfileText } =
    createValidWorkerAndExporterFixture();
  prom.scrape_configs = prom.scrape_configs.filter(
    (job) => job.job_name !== 'acres-api',
  );
  const errors = validateWorkerAndExporterScrape(
    services,
    prom,
    monitorSql,
    operationsDoc,
    caddyfileText,
  );
  assert.ok(
    errors.includes('Prometheus config missing acres-api scrape target'),
  );
});

test('validateWorkerAndExporterScrape catches exporter security violations', () => {
  const { services, prom, monitorSql, operationsDoc, caddyfileText } =
    createValidWorkerAndExporterFixture();
  services['postgres-exporter'].profiles = ['default'];
  const errors = validateWorkerAndExporterScrape(
    services,
    prom,
    monitorSql,
    operationsDoc,
    caddyfileText,
  );
  assert.ok(
    errors.includes(
      'postgres exporter must use private file credentials and bounded scrape',
    ),
  );
});

test('validateWorkerAndExporterScrape catches monitor role SQL or procedure drift', () => {
  const { services, prom, operationsDoc, caddyfileText } =
    createValidWorkerAndExporterFixture();
  const monitorSql = 'GRANT SELECT ON ALL TABLES TO acres_monitor';
  const errors = validateWorkerAndExporterScrape(
    services,
    prom,
    monitorSql,
    operationsDoc,
    caddyfileText,
  );
  assert.ok(
    errors.includes(
      'monitor role reconciliation or existing-volume procedure missing',
    ),
  );
});

test('validateWorkerAndExporterScrape catches credential leakage to unauthorized services', () => {
  const { services, prom, monitorSql, operationsDoc, caddyfileText } =
    createValidWorkerAndExporterFixture();
  services.worker.volumes = ['${ACRES_MONITOR_PASSWORD_FILE}:/secrets'];
  services.worker.environment.ACRES_MONITOR_BOOTSTRAP_PASSWORD = 'password';
  const errors = validateWorkerAndExporterScrape(
    services,
    prom,
    monitorSql,
    operationsDoc,
    caddyfileText,
  );
  assert.ok(
    errors.includes('monitor password file must not be mounted into worker'),
  );
  assert.ok(
    errors.includes('monitor bootstrap password must not reach worker'),
  );
});

function createValidServiceHealthFixture() {
  const services = {
    caddy: { restart: 'unless-stopped', stop_grace_period: '30s' },
    next: {
      restart: 'unless-stopped',
      stop_grace_period: '30s',
      init: true,
      stop_signal: 'SIGTERM',
    },
    api: {
      restart: 'unless-stopped',
      stop_grace_period: '45s',
      init: true,
      stop_signal: 'SIGTERM',
      depends_on: {
        postgres: { condition: 'service_healthy' },
        valkey: { condition: 'service_healthy' },
        garage: { condition: 'service_healthy' },
      },
    },
    worker: {
      restart: 'unless-stopped',
      stop_grace_period: '60s',
      init: true,
      stop_signal: 'SIGTERM',
      depends_on: {
        postgres: { condition: 'service_healthy' },
        valkey: { condition: 'service_healthy' },
        garage: { condition: 'service_healthy' },
        clamav: { condition: 'service_healthy' },
      },
    },
    postgres: { restart: 'unless-stopped', stop_grace_period: '30s' },
    valkey: { restart: 'unless-stopped', stop_grace_period: '30s' },
    garage: { restart: 'unless-stopped', stop_grace_period: '30s' },
    clamav: { restart: 'unless-stopped', stop_grace_period: '30s' },
    prometheus: {
      restart: 'unless-stopped',
      stop_grace_period: '30s',
      healthcheck: {
        test: [
          'CMD',
          'wget',
          '-q',
          '--spider',
          'http://127.0.0.1:9090/-/healthy',
        ],
        interval: '30s',
        timeout: '5s',
      },
    },
    grafana: {
      restart: 'unless-stopped',
      stop_grace_period: '30s',
      depends_on: {
        prometheus: { condition: 'service_healthy' },
      },
    },
    'postgres-exporter': {
      restart: 'unless-stopped',
      stop_grace_period: '30s',
    },
  };

  return services;
}

test('validateServiceHealthAndSupervision passes on valid health and supervision', () => {
  const services = createValidServiceHealthFixture();
  const errors = validateServiceHealthAndSupervision(services);
  assert.deepEqual(errors, []);
});

test('validateServiceHealthAndSupervision catches missing healthchecks or dependency conditions', () => {
  const services = createValidServiceHealthFixture();
  delete services.prometheus.healthcheck;
  services.grafana.depends_on.prometheus.condition = 'service_started';
  delete services.api.depends_on.postgres;
  services.worker.depends_on.clamav.condition = 'service_started';

  const errors = validateServiceHealthAndSupervision(services);
  assert.ok(
    errors.includes(
      'Prometheus service must define bounded healthcheck on /-/healthy',
    ),
  );
  assert.ok(
    errors.includes('Grafana service must depend on healthy Prometheus'),
  );
  assert.ok(
    errors.includes(
      'api service must depend on postgres with condition: service_healthy',
    ),
  );
  assert.ok(
    errors.includes(
      'worker service dependency clamav must require condition: service_healthy',
    ),
  );
});

test('validateServiceHealthAndSupervision catches supervision init, signal, restart, and drain drifts', () => {
  const services = createValidServiceHealthFixture();
  services.api.init = false;
  services.worker.stop_signal = 'SIGINT';
  services.caddy.restart = 'always';
  services.api.stop_grace_period = '30s'; // Expected '45s'

  const errors = validateServiceHealthAndSupervision(services);
  assert.ok(
    errors.includes(
      'api service must configure init: true and stop_signal: SIGTERM',
    ),
  );
  assert.ok(
    errors.includes(
      'worker service must configure init: true and stop_signal: SIGTERM',
    ),
  );
  assert.ok(errors.includes('caddy must configure restart: unless-stopped'));
  assert.ok(errors.includes('api stop_grace_period must be 45s'));
});

test('validatePrometheusAlertsAndDashboard passes on real repository alerts and dashboard', () => {
  const alertsPath = path.resolve(REPO_ROOT, 'infra/prometheus/alerts.yml');
  const dashboardPath = path.resolve(
    REPO_ROOT,
    'infra/grafana/dashboards/acres-operations.json',
  );
  const checklistPath = path.resolve(REPO_ROOT, 'docs/launch-checklist.md');

  const alerts = yaml.load(fs.readFileSync(alertsPath, 'utf8'));
  const dashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));
  const checklist = fs.readFileSync(checklistPath, 'utf8');

  const errors = validatePrometheusAlertsAndDashboard(
    alerts,
    dashboard,
    checklist,
  );
  assert.deepEqual(errors, []);
});

test('validatePrometheusAlertsAndDashboard catches missing alert rules and drifted uid', () => {
  const alerts = { groups: [{ rules: [{ alert: 'AcresApiDown' }] }] };
  const dashboard = { uid: 'drifted-uid', panels: [] };
  const checklist = '';

  const errors = validatePrometheusAlertsAndDashboard(
    alerts,
    dashboard,
    checklist,
  );
  assert.ok(
    errors.includes('Prometheus alerts missing required rule AcresWorkerDown'),
  );
  assert.ok(errors.includes('Grafana dashboard uid drifted'));
  assert.ok(errors.includes('Grafana dashboard missing operational panels'));
});

test('validateReadinessTargets passes on real readiness example', () => {
  const readinessPath = path.resolve(
    REPO_ROOT,
    'infra/launch/readiness.example.json',
  );
  const readinessExample = JSON.parse(fs.readFileSync(readinessPath, 'utf8'));

  const errors = validateReadinessTargets(readinessExample);
  assert.deepEqual(errors, []);
});

test('validateReadinessTargets catches drifted Category 5 and 6 targets or invalid cron', () => {
  const drifted = {
    sections: {
      slo_and_alerting: {
        availability_target_percent: 98.0,
        max_p95_latency_ms: 1000,
        capacity_target_rps: 50,
        max_database_acquisition_p95_latency_ms: 100,
        max_database_query_p95_latency_ms: 200,
      },
      backup_and_disaster_recovery: {
        rpo_hours: 24,
        rto_hours: 48,
        backup_schedule_cron: 'invalid cron syntax',
      },
    },
  };

  const errors = validateReadinessTargets(drifted);
  assert.ok(
    errors.includes(
      'infra/launch/readiness.example.json missing required Category 5 SLO targets (99.9% availability, 500ms max p95, 100 RPS capacity, 50ms acquisition, 100ms query)',
    ),
  );
  assert.ok(
    errors.includes(
      'infra/launch/readiness.example.json missing required Category 6 RPO/RTO targets (1h RPO, 4h RTO)',
    ),
  );
  assert.ok(
    errors.includes(
      'Category 6 backup UTC start gap exceeds RPO or uses unsupported cron syntax',
    ),
  );
});

test('validateDrillScriptIntegrations passes on real repository drill scripts', () => {
  const launchRunner = fs.readFileSync(
    path.resolve(REPO_ROOT, 'scripts/ops/run-launch-drills.sh'),
    'utf8',
  );
  const assembleDossier = fs.readFileSync(
    path.resolve(REPO_ROOT, 'scripts/ops/assemble-launch-dossier.js'),
    'utf8',
  );
  const deploymentDrill = fs.readFileSync(
    path.resolve(REPO_ROOT, 'scripts/ops/run-deployment-drill.sh'),
    'utf8',
  );
  const secretRotation = fs.readFileSync(
    path.resolve(REPO_ROOT, 'scripts/ops/run-secret-rotation-drill.sh'),
    'utf8',
  );

  const errors = validateDrillScriptIntegrations(
    launchRunner + assembleDossier,
    deploymentDrill,
    secretRotation,
  );
  assert.deepEqual(errors, []);
});

test('validateDrillScriptIntegrations catches missing runner integration markers', () => {
  const errors = validateDrillScriptIntegrations('', '', '');
  assert.ok(errors.includes('launch runner missing dossier assembler'));
  assert.ok(
    errors.includes(
      'scripts/ops/run-launch-drills.sh missing static integrity or other baseline dossier integration',
    ),
  );
  assert.ok(
    errors.includes(
      'scripts/ops/run-deployment-drill.sh missing restart, signal supervision, or dependency health verification',
    ),
  );
  assert.ok(
    errors.includes(
      'scripts/ops/run-secret-rotation-drill.sh missing option validation, template check, or redaction audit',
    ),
  );
});

test('checkProductionTemplates orchestrates cleanly on actual repository files', () => {
  const result = checkProductionTemplates({ cwd: REPO_ROOT });
  assert.equal(result.success, true);
  assert.deepEqual(result.errors, []);
});

test('checkProductionTemplates fails gracefully without unhandled exceptions on invalid directory', () => {
  const result = checkProductionTemplates({
    cwd: '/tmp/nonexistent-template-check-dir',
  });
  assert.equal(result.success, false);
  assert.ok(result.errors.length > 0);
  assert.ok(
    result.errors.some((err) => err.includes('missing or unreadable file')),
  );
});

test('main returns 0 on valid repository invocation', () => {
  const logs = [];
  const errors = [];
  const mockIo = {
    log: (msg) => logs.push(msg),
    error: (msg) => errors.push(msg),
  };

  const exitCode = main(['node', 'check-production-templates.js'], mockIo, {
    cwd: REPO_ROOT,
    exitOnError: false,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(errors, []);
});

test('main returns 1 and outputs errors when template checks fail', () => {
  const errors = [];
  const mockIo = {
    log: () => {},
    error: (msg) => errors.push(msg),
  };

  const exitCode = main(
    [
      'node',
      'check-production-templates.js',
      '--cwd=/tmp/nonexistent-template-check-dir',
    ],
    mockIo,
    { exitOnError: false },
  );

  assert.equal(exitCode, 1);
  assert.ok(errors.length > 0);
  assert.ok(errors[0].startsWith('ops template check failed: '));
});

const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { parseTemplateCliArguments } = require('./check-production-templates');
const CLI_PATH = path.join(__dirname, 'check-production-templates.js');
const PRIVATE_MARKER = 'fixture-private-content-do-not-print';

for (const [args, base, expected] of [
  [[], REPO_ROOT, REPO_ROOT],
  [['--cwd', '.'], REPO_ROOT, REPO_ROOT],
  [['--cwd=../acres'], REPO_ROOT, REPO_ROOT],
  [['--cwd', '/tmp/path with spaces'], REPO_ROOT, '/tmp/path with spaces'],
  [['--cwd=path with spaces'], '/tmp', '/tmp/path with spaces'],
]) {
  test(`CLI parser resolves valid arguments ${JSON.stringify(args)}`, () => {
    assert.deepEqual(parseTemplateCliArguments(args, base), { cwd: expected });
  });
}

test('CLI parser defaults to the process working directory', () => {
  assert.deepEqual(parseTemplateCliArguments([]), { cwd: process.cwd() });
});

const INVALID_ARGS = [
  ['--unknown'],
  ['--help'],
  ['-h'],
  ['unexpected.json'],
  ['--cwd'],
  ['--cwd='],
  ['--cwd', ''],
  ['--cwd=   '],
  ['--cwd', '  '],
  ['--cwd', '--unknown'],
  ['--cwd', '-h'],
  ['--cwd=.', '--cwd=.'],
  ['--cwd', '.', '--cwd', '.'],
  ['--cwd=.', '--cwd', '.'],
  ['--cwd=.', 'extra'],
  [`--${PRIVATE_MARKER}`],
  [PRIVATE_MARKER],
  null,
  {},
  'args',
  [null],
  [17],
];

for (const args of INVALID_ARGS) {
  test(`invalid CLI input fails before template reads: ${JSON.stringify(args)}`, () => {
    assert.throws(
      () => parseTemplateCliArguments(args, REPO_ROOT),
      (error) => {
        assert.equal(error instanceof TypeError, false);
        assert.equal(error.message.includes(PRIVATE_MARKER), false);
        return true;
      },
    );
    const lines = [];
    const argv = Array.isArray(args) ? ['node', CLI_PATH, ...args] : args;
    const code = main(
      argv,
      { log: (line) => lines.push(line), error: (line) => lines.push(line) },
      { cwd: '/tmp/not-a-template-root', exitOnError: false },
    );
    assert.equal(code, 1);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /^ops template usage error:/);
    assert.match(lines[1], /^Usage:/);
    assert.doesNotMatch(
      lines.join('\n'),
      /ops template check failed|TypeError|missing or unreadable|fixture-private-content/,
    );
  });
}

for (const cwd of [null, 17, '', '   ', [], {}]) {
  test(`explicit invalid cwd is rejected: ${JSON.stringify(cwd)}`, () => {
    assert.throws(() => parseTemplateCliArguments([], cwd), /cwd requires/);
    const lines = [];
    assert.equal(
      main(
        ['node', CLI_PATH],
        { error: (line) => lines.push(line) },
        { cwd, exitOnError: false },
      ),
      1,
    );
    assert.match(lines[0], /usage error/);
    assert.equal(checkProductionTemplates({ cwd }).success, false);
  });
}

test('invalid options and argv entries fail with controlled usage', () => {
  const lines = [];
  assert.equal(
    main(
      ['node', null],
      { error: (line) => lines.push(line) },
      { exitOnError: false },
    ),
    1,
  );
  assert.match(lines[0], /usage error/);
  for (const options of [null, 1, []]) {
    assert.equal(checkProductionTemplates(options).success, false);
  }
});

for (const args of [
  [],
  ['--cwd', REPO_ROOT],
  [`--cwd=${REPO_ROOT}`],
  ...INVALID_ARGS.filter(Array.isArray).filter((args) =>
    args.every((arg) => typeof arg === 'string'),
  ),
]) {
  test(`real CLI process exit contract: ${JSON.stringify(args)}`, () => {
    const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    assert.ifError(result.error);
    const valid =
      !args.length ||
      (args.length === 2 && args[1] === REPO_ROOT) ||
      args[0] === `--cwd=${REPO_ROOT}`;
    assert.equal(result.status, valid ? 0 : 1);
    assert.equal(result.stdout, '');
    if (valid) assert.equal(result.stderr, '');
    else {
      assert.match(result.stderr, /usage error:.*\nUsage:/);
      assert.doesNotMatch(
        result.stderr,
        /TypeError| at |ops template check failed|fixture-private-content/,
      );
    }
  });
}

// Only public inputs actually consumed by the checker; no environment instances,
// operator records, evidence, or directory-wide copies.
const FIXTURE_FILES = [
  'infra/compose/docker-compose.production.example.yml',
  'docker-compose.yml',
  'infra/env/production.env.example',
  'infra/env/garage.production.env.example',
  'infra/caddy/Caddyfile.example',
  'infra/garage/garage.toml',
  'infra/prometheus/prometheus.yml',
  'infra/prometheus/alerts.yml',
  'infra/grafana/provisioning/datasources/prometheus.yml',
  'infra/grafana/provisioning/dashboards/acres.yml',
  'infra/grafana/dashboards/acres-operations.json',
  'infra/launch/readiness.example.json',
  'scripts/db/reconcile-production-monitor.sh',
  'docs/operations.md',
  'docs/launch-checklist.md',
  'scripts/ops/run-launch-drills.sh',
  'scripts/ops/assemble-launch-dossier.js',
  'scripts/ops/run-deployment-drill.sh',
  'scripts/ops/run-secret-rotation-drill.sh',
];

function templateFixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-template-input-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  for (const file of FIXTURE_FILES) {
    const target = path.join(cwd, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, file), target);
  }
  assert.deepEqual(checkProductionTemplates({ cwd }), {
    success: true,
    errors: [],
  });
  return cwd;
}

const COMPOSE_INPUT = FIXTURE_FILES[0];
const PROM_INPUT = 'infra/prometheus/prometheus.yml';
const ALERT_INPUT = 'infra/prometheus/alerts.yml';
const DASHBOARD_INPUT = 'infra/grafana/dashboards/acres-operations.json';
const READINESS_INPUT = 'infra/launch/readiness.example.json';
const NESTED_MUTATIONS = [
  [
    COMPOSE_INPUT,
    'services',
    (doc) => {
      doc.services = [];
    },
  ],
  [
    COMPOSE_INPUT,
    'services.worker',
    (doc) => {
      doc.services.worker = null;
    },
  ],
  [
    COMPOSE_INPUT,
    'volumes',
    (doc) => {
      doc.services.postgres.volumes = {};
    },
  ],
  [
    COMPOSE_INPUT,
    'volumes[0]',
    (doc) => {
      doc.services.postgres.volumes = [null];
    },
  ],
  [
    COMPOSE_INPUT,
    'volumes[0].source',
    (doc) => {
      doc.services.postgres.volumes = [{ source: {} }];
    },
  ],
  [
    COMPOSE_INPUT,
    'volumes[0].target',
    (doc) => {
      doc.services.postgres.volumes = [{ target: [] }];
    },
  ],
  [
    COMPOSE_INPUT,
    'volumes[0].read_only',
    (doc) => {
      doc.services.postgres.volumes = [{ read_only: 'true' }];
    },
  ],
  [
    COMPOSE_INPUT,
    'ports',
    (doc) => {
      doc.services.caddy.ports = {};
    },
  ],
  [
    COMPOSE_INPUT,
    'expose',
    (doc) => {
      doc.services.worker.expose = '3002';
    },
  ],
  [
    COMPOSE_INPUT,
    'profiles',
    (doc) => {
      doc.services['postgres-exporter'].profiles = {};
    },
  ],
  [
    COMPOSE_INPUT,
    'profiles[0]',
    (doc) => {
      doc.services['postgres-exporter'].profiles = [null];
    },
  ],
  [
    COMPOSE_INPUT,
    'environment',
    (doc) => {
      doc.services.worker.environment = [];
    },
  ],
  [
    COMPOSE_INPUT,
    'environment.SCHEDULER_ENABLED',
    (doc) => {
      doc.services.worker.environment.SCHEDULER_ENABLED = {};
    },
  ],
  [
    COMPOSE_INPUT,
    'depends_on',
    (doc) => {
      doc.services.api.depends_on = 'postgres';
    },
  ],
  [
    COMPOSE_INPUT,
    'depends_on.postgres',
    (doc) => {
      doc.services.api.depends_on.postgres = null;
    },
  ],
  [
    COMPOSE_INPUT,
    'healthcheck',
    (doc) => {
      doc.services.garage.healthcheck = [];
    },
  ],
  [
    COMPOSE_INPUT,
    'healthcheck.test',
    (doc) => {
      doc.services.garage.healthcheck = {};
    },
  ],
  [
    COMPOSE_INPUT,
    'env_file',
    (doc) => {
      doc.services.worker.env_file = {};
    },
  ],
  [
    'docker-compose.yml',
    'volumes',
    (doc) => {
      doc.services.postgres.volumes = {};
    },
  ],
  [
    PROM_INPUT,
    'scrape_configs',
    (doc) => {
      doc.scrape_configs = {};
    },
  ],
  [
    PROM_INPUT,
    'scrape_configs[0]',
    (doc) => {
      doc.scrape_configs = [null];
    },
  ],
  [
    PROM_INPUT,
    'job_name',
    (doc) => {
      doc.scrape_configs[0].job_name = [];
    },
  ],
  [
    PROM_INPUT,
    'static_configs',
    (doc) => {
      doc.scrape_configs[0].static_configs = {};
    },
  ],
  [
    PROM_INPUT,
    'static_configs[0]',
    (doc) => {
      doc.scrape_configs[0].static_configs = [null];
    },
  ],
  [
    PROM_INPUT,
    'targets',
    (doc) => {
      doc.scrape_configs[0].static_configs = [{ targets: {} }];
    },
  ],
  [
    PROM_INPUT,
    'targets[0]',
    (doc) => {
      doc.scrape_configs[0].static_configs = [{ targets: [null] }];
    },
  ],
  [
    PROM_INPUT,
    'metric_relabel_configs',
    (doc) => {
      doc.scrape_configs[0].metric_relabel_configs = {};
    },
  ],
  [
    PROM_INPUT,
    'metric_relabel_configs[0]',
    (doc) => {
      doc.scrape_configs[0].metric_relabel_configs = [null];
    },
  ],
  [
    PROM_INPUT,
    'action',
    (doc) => {
      doc.scrape_configs[0].metric_relabel_configs = [{ action: {} }];
    },
  ],
  [
    PROM_INPUT,
    'authorization',
    (doc) => {
      doc.scrape_configs[0].authorization = [];
    },
  ],
  [
    ALERT_INPUT,
    'groups',
    (doc) => {
      doc.groups = {};
    },
  ],
  [
    ALERT_INPUT,
    'groups[0]',
    (doc) => {
      doc.groups = [null];
    },
  ],
  [
    ALERT_INPUT,
    'rules',
    (doc) => {
      doc.groups[0].rules = {};
    },
  ],
  [
    ALERT_INPUT,
    'rules[0]',
    (doc) => {
      doc.groups[0].rules = [null];
    },
  ],
  [
    ALERT_INPUT,
    'expr',
    (doc) => {
      doc.groups[0].rules[0].expr = [];
    },
  ],
  [
    DASHBOARD_INPUT,
    'panels',
    (doc) => {
      doc.panels = {};
    },
  ],
  [
    DASHBOARD_INPUT,
    'panels[0]',
    (doc) => {
      doc.panels = [null];
    },
  ],
  [
    DASHBOARD_INPUT,
    'targets',
    (doc) => {
      doc.panels[0].targets = {};
    },
  ],
  [
    DASHBOARD_INPUT,
    'targets[0]',
    (doc) => {
      doc.panels[0].targets = [null];
    },
  ],
  [
    DASHBOARD_INPUT,
    'expr',
    (doc) => {
      doc.panels[0].targets[0].expr = 123;
    },
  ],
  [
    DASHBOARD_INPUT,
    'fieldConfig',
    (doc) => {
      doc.panels[0].fieldConfig = [];
    },
  ],
  [
    READINESS_INPUT,
    'sections',
    (doc) => {
      doc.sections = [];
    },
  ],
  [
    READINESS_INPUT,
    'slo_and_alerting',
    (doc) => {
      doc.sections.slo_and_alerting = [];
    },
  ],
  [
    READINESS_INPUT,
    'backup_and_disaster_recovery',
    (doc) => {
      doc.sections.backup_and_disaster_recovery = null;
    },
  ],
];

function assertControlledFailure(cwd, file, field) {
  const result = checkProductionTemplates({ cwd });
  assert.equal(result.success, false);
  assert.ok(
    result.errors.some(
      (error) => error.includes(file) && (!field || error.includes(field)),
    ),
    result.errors.join('\n'),
  );
  assert.doesNotMatch(
    result.errors.join('\n'),
    /fixture-private-content|TypeError|SyntaxError|YAMLException/,
  );
  const lines = [];
  assert.equal(
    main(
      ['node', CLI_PATH, '--cwd', cwd],
      { error: (line) => lines.push(line) },
      { exitOnError: false },
    ),
    1,
  );
  assert.match(lines[0], /^ops template check failed:/);
  assert.doesNotMatch(
    lines.join('\n'),
    /fixture-private-content|TypeError|SyntaxError|YAMLException/,
  );
}

for (const [file, field, mutate] of NESTED_MUTATIONS) {
  test(`orchestrator rejects malformed ${file} ${field}`, (t) => {
    const cwd = templateFixture(t);
    const target = path.join(cwd, file);
    const document = file.endsWith('.json')
      ? JSON.parse(fs.readFileSync(target, 'utf8'))
      : yaml.load(fs.readFileSync(target, 'utf8'));
    mutate(document);
    document.private_fixture_marker = PRIVATE_MARKER;
    fs.writeFileSync(
      target,
      file.endsWith('.json') ? JSON.stringify(document) : yaml.dump(document),
    );
    assertControlledFailure(cwd, file, field);
  });
}

for (const file of [
  COMPOSE_INPUT,
  'docker-compose.yml',
  PROM_INPUT,
  ALERT_INPUT,
  DASHBOARD_INPUT,
  READINESS_INPUT,
  'infra/grafana/provisioning/datasources/prometheus.yml',
  'infra/grafana/provisioning/dashboards/acres.yml',
]) {
  for (const content of [
    '',
    'null',
    '[]',
    `"${PRIVATE_MARKER}"`,
    file.endsWith('.json') ? `{"${PRIVATE_MARKER}":` : `${PRIVATE_MARKER}: [\n`,
  ]) {
    test(`orchestrator rejects ${file} root/syntax ${JSON.stringify(content)}`, (t) => {
      const cwd = templateFixture(t);
      fs.writeFileSync(path.join(cwd, file), content);
      assertControlledFailure(cwd, file);
      const result = spawnSync(process.execPath, [CLI_PATH, '--cwd', cwd], {
        encoding: 'utf8',
      });
      assert.ifError(result.error);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /ops template check failed:/);
      assert.doesNotMatch(
        result.stderr,
        /fixture-private-content|TypeError|SyntaxError|YAMLException| at /,
      );
    });
  }
}

test('fixture paths with spaces work in both CLI forms', (t) => {
  const cwd = templateFixture(t);
  const spaced = `${cwd} with spaces`;
  fs.renameSync(cwd, spaced);
  t.after(() => fs.rmSync(spaced, { recursive: true, force: true }));
  for (const args of [['--cwd', spaced], [`--cwd=${spaced}`]]) {
    const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
      encoding: 'utf8',
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  }
});

test('malformed input does not suppress independent valid-branch policy checks', (t) => {
  const cwd = templateFixture(t);
  fs.writeFileSync(path.join(cwd, DASHBOARD_INPUT), '[]');
  const compose = yaml.load(
    fs.readFileSync(path.join(cwd, COMPOSE_INPUT), 'utf8'),
  );
  compose.services.api.environment.SCHEDULER_ENABLED = 'true';
  fs.writeFileSync(path.join(cwd, COMPOSE_INPUT), yaml.dump(compose));
  const result = checkProductionTemplates({ cwd });
  assert.equal(result.success, false);
  assert.ok(result.errors.some((error) => error.includes(DASHBOARD_INPUT)));
  assert.ok(
    result.errors.includes('compose must enable scheduler only on worker'),
  );
});

// Public helpers retain their result/explicit assertion conventions on bad inputs.
for (const value of [null, [], 1, 'scalar']) {
  test(`public validators reject malformed mapping ${JSON.stringify(value)}`, () => {
    for (const validator of [
      validateComposeSecurityAndTopology,
      validateServiceHealthAndSupervision,
      validateReadinessTargets,
    ]) {
      assert.ok(validator(value).length > 0);
    }
    assert.ok(validateWorkerAndExporterScrape(value, value, '', '').length > 0);
    assert.ok(
      validatePrometheusAlertsAndDashboard(value, value, '').length > 0,
    );
    for (const call of [
      () => validateRequiredServices(value),
      () => assertPostgres18Mount(value, 'fixture.yml'),
    ]) {
      assert.throws(
        call,
        (error) =>
          error instanceof Error &&
          !(error instanceof TypeError) &&
          /mapping/.test(error.message),
      );
    }
  });
}

for (const [file, field, mutate] of NESTED_MUTATIONS) {
  test(`public helper handles malformed ${file} ${field}`, () => {
    const read = (input) =>
      input.endsWith('.json')
        ? JSON.parse(fs.readFileSync(path.join(REPO_ROOT, input), 'utf8'))
        : yaml.load(fs.readFileSync(path.join(REPO_ROOT, input), 'utf8'));
    const doc = read(file);
    mutate(doc);
    if (file === COMPOSE_INPUT || file === 'docker-compose.yml') {
      assert.ok(
        validateComposeSecurityAndTopology(doc.services).length > 0 ||
          field === 'healthcheck.test',
      );
      if (field !== 'healthcheck.test') {
        assert.throws(
          () => assertPostgres18Mount(doc, file),
          (error) => error instanceof Error && !(error instanceof TypeError),
        );
      }
    } else if (file === PROM_INPUT) {
      assert.ok(validateWorkerAndExporterScrape({}, doc, '', '').length > 0);
    } else if (file === ALERT_INPUT || file === DASHBOARD_INPUT) {
      assert.ok(
        validatePrometheusAlertsAndDashboard(
          file === ALERT_INPUT ? doc : read(ALERT_INPUT),
          file === DASHBOARD_INPUT ? doc : read(DASHBOARD_INPUT),
          '',
        ).length > 0,
      );
    } else assert.ok(validateReadinessTargets(doc).length > 0);
  });
}

test('text validators reject non-text inputs without traversal exceptions', () => {
  assert.ok(validateComposeEnvironmentInterpolation({}, new Set()).length > 0);
  assert.ok(validateComposeEnvironmentInterpolation('', {}).length > 0);
  assert.ok(validateDrillScriptIntegrations({}, '', '').length > 0);
  const fixture = createValidWorkerAndExporterFixture();
  assert.ok(
    validateWorkerAndExporterScrape(fixture.services, fixture.prom, {}, '')
      .length > 0,
  );
});

test('sparse programmatic argument arrays produce usage errors', () => {
  assert.throws(
    () => parseTemplateCliArguments(new Array(1)),
    /array of strings/,
  );
  const lines = [];
  const argv = ['node', CLI_PATH];
  argv.length = 3;
  assert.equal(
    main(argv, { error: (line) => lines.push(line) }, { exitOnError: false }),
    1,
  );
  assert.match(lines[0], /usage error/);
});

test('readiness numeric coercion cannot escape as an incidental exception', (t) => {
  const cwd = templateFixture(t);
  const file = path.join(cwd, READINESS_INPUT);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  doc.sections.backup_and_disaster_recovery.rpo_hours = {
    valueOf: 1,
    toString: 1,
  };
  fs.writeFileSync(file, JSON.stringify(doc));
  const errors = validateReadinessTargets(doc);
  assert.ok(errors.some((error) => error.includes('Category 6')));
  assertControlledFailure(cwd, READINESS_INPUT);
});

test('dashboard identifiers cannot coerce private data into diagnostics', () => {
  const alerts = yaml.load(
    fs.readFileSync(path.join(REPO_ROOT, ALERT_INPUT), 'utf8'),
  );
  const dashboard = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, DASHBOARD_INPUT), 'utf8'),
  );
  dashboard.panels[0].id = { toString: PRIVATE_MARKER };
  const errors = validatePrometheusAlertsAndDashboard(alerts, dashboard, '');
  assert.ok(errors.some((error) => error.includes('panels[0].id')));
  assert.doesNotMatch(errors.join('\n'), /fixture-private-content/);
});

test('dashboard layout numeric input is guarded before imported diagnostics', (t) => {
  const cwd = templateFixture(t);
  const file = path.join(cwd, DASHBOARD_INPUT);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  doc.panels.find((panel) => panel.id === 21).gridPos.y = {
    valueOf: 1,
    toString: 1,
  };
  fs.writeFileSync(file, JSON.stringify(doc));
  assertControlledFailure(cwd, DASHBOARD_INPUT, 'gridPos.y');
  const alerts = yaml.load(
    fs.readFileSync(path.join(cwd, ALERT_INPUT), 'utf8'),
  );
  assert.ok(
    validatePrometheusAlertsAndDashboard(alerts, doc, '').some((error) =>
      error.includes('gridPos.y'),
    ),
  );
});

test('cyclic YAML aliases fail before serialization, preserving helper conventions', (t) => {
  const cwd = templateFixture(t);
  const file = path.join(cwd, COMPOSE_INPUT);
  const doc = yaml.load(fs.readFileSync(file, 'utf8'));
  const cycle = [];
  cycle.push(cycle);
  doc.services.caddy.networks = cycle;
  fs.writeFileSync(file, yaml.dump(doc));
  const parsed = yaml.load(fs.readFileSync(file, 'utf8'));
  assert.equal(
    parsed.services.caddy.networks[0],
    parsed.services.caddy.networks,
  );
  assertControlledFailure(cwd, COMPOSE_INPUT, 'networks[0]');
  for (const call of [
    () => validateRequiredServices(parsed.services),
    () => assertPostgres18Mount(parsed, COMPOSE_INPUT),
  ]) {
    assert.throws(
      call,
      (error) =>
        !(error instanceof TypeError) &&
        /circular reference/.test(error.message),
    );
  }
  assert.ok(
    validateComposeSecurityAndTopology(parsed.services).some((error) =>
      error.includes('circular reference'),
    ),
  );
  assert.ok(
    validateServiceHealthAndSupervision(parsed.services).some((error) =>
      error.includes('circular reference'),
    ),
  );
  const prom = yaml.load(fs.readFileSync(path.join(cwd, PROM_INPUT), 'utf8'));
  assert.ok(
    validateWorkerAndExporterScrape(parsed.services, prom, '', '').some(
      (error) => error.includes('circular reference'),
    ),
  );
  const result = spawnSync(process.execPath, [CLI_PATH, '--cwd', cwd], {
    encoding: 'utf8',
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /circular reference/);
  assert.doesNotMatch(result.stderr, /TypeError| at /);
});

test('shared acyclic YAML aliases retain the passing template outcome', (t) => {
  const cwd = templateFixture(t);
  const file = path.join(cwd, COMPOSE_INPUT);
  const doc = yaml.load(fs.readFileSync(file, 'utf8'));
  const sharedNetworks = ['private'];
  doc.services.api.networks = sharedNetworks;
  doc.services.worker.networks = sharedNetworks;
  fs.writeFileSync(file, yaml.dump(doc));
  const parsed = yaml.load(fs.readFileSync(file, 'utf8'));
  assert.equal(parsed.services.api.networks, parsed.services.worker.networks);
  assert.deepEqual(checkProductionTemplates({ cwd }), {
    success: true,
    errors: [],
  });
});
