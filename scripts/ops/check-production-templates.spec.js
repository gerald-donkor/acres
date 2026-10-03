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
    mountDetails({ type: 'volume', source: 'data_vol', target: '/var/lib/postgresql' }),
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
    { message: /must use a writable bind or volume mount at \/var\/lib\/postgresql/ },
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
    { message: /must use a writable bind or volume mount at \/var\/lib\/postgresql/ },
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
    postgres: { volumes: ['postgres_data:/var/lib/postgresql # ENCRYPTED_MOUNT'] },
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
  assert.ok(errors.includes('postgres must declare an encrypted production mount placeholder'));
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
  assert.ok(errors.includes('production Garage must explicitly define GARAGE_RPC_SECRET'));

  services.garage.environment.GARAGE_RPC_SECRET = 'test-rpc-secret';
  services.api.environment.GARAGE_ADMIN_TOKEN = 'leaked-token';
  errors = validateComposeSecurityAndTopology(services);
  assert.ok(errors.includes('GARAGE_ADMIN_TOKEN must be scoped to Garage only, not api'));
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
    errors.includes('production compose must not create local test database roles'),
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
      volumes: ['reconcile-production-monitor.sh:/entrypoint-initdb.d/reconcile-production-monitor.sh'],
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
  prom.scrape_configs = prom.scrape_configs.filter((job) => job.job_name !== 'acres-api');
  const errors = validateWorkerAndExporterScrape(
    services,
    prom,
    monitorSql,
    operationsDoc,
    caddyfileText,
  );
  assert.ok(errors.includes('Prometheus config missing acres-api scrape target'));
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
    next: { restart: 'unless-stopped', stop_grace_period: '30s', init: true, stop_signal: 'SIGTERM' },
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
        test: ['CMD', 'wget', '-q', '--spider', 'http://127.0.0.1:9090/-/healthy'],
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
    'postgres-exporter': { restart: 'unless-stopped', stop_grace_period: '30s' },
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
    errors.includes('Prometheus service must define bounded healthcheck on /-/healthy'),
  );
  assert.ok(
    errors.includes('Grafana service must depend on healthy Prometheus'),
  );
  assert.ok(
    errors.includes('api service must depend on postgres with condition: service_healthy'),
  );
  assert.ok(
    errors.includes('worker service dependency clamav must require condition: service_healthy'),
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
    errors.includes('api service must configure init: true and stop_signal: SIGTERM'),
  );
  assert.ok(
    errors.includes('worker service must configure init: true and stop_signal: SIGTERM'),
  );
  assert.ok(errors.includes('caddy must configure restart: unless-stopped'));
  assert.ok(errors.includes('api stop_grace_period must be 45s'));
});

test('validatePrometheusAlertsAndDashboard passes on real repository alerts and dashboard', () => {
  const alertsPath = path.resolve(REPO_ROOT, 'infra/prometheus/alerts.yml');
  const dashboardPath = path.resolve(REPO_ROOT, 'infra/grafana/dashboards/acres-operations.json');
  const checklistPath = path.resolve(REPO_ROOT, 'docs/launch-checklist.md');

  const alerts = yaml.load(fs.readFileSync(alertsPath, 'utf8'));
  const dashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));
  const checklist = fs.readFileSync(checklistPath, 'utf8');

  const errors = validatePrometheusAlertsAndDashboard(alerts, dashboard, checklist);
  assert.deepEqual(errors, []);
});

test('validatePrometheusAlertsAndDashboard catches missing alert rules and drifted uid', () => {
  const alerts = { groups: [{ rules: [{ alert: 'AcresApiDown' }] }] };
  const dashboard = { uid: 'drifted-uid', panels: [] };
  const checklist = '';

  const errors = validatePrometheusAlertsAndDashboard(alerts, dashboard, checklist);
  assert.ok(
    errors.includes('Prometheus alerts missing required rule AcresWorkerDown'),
  );
  assert.ok(errors.includes('Grafana dashboard uid drifted'));
  assert.ok(errors.includes('Grafana dashboard missing operational panels'));
});

test('validateReadinessTargets passes on real readiness example', () => {
  const readinessPath = path.resolve(REPO_ROOT, 'infra/launch/readiness.example.json');
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
  const launchRunner = fs.readFileSync(path.resolve(REPO_ROOT, 'scripts/ops/run-launch-drills.sh'), 'utf8');
  const assembleDossier = fs.readFileSync(path.resolve(REPO_ROOT, 'scripts/ops/assemble-launch-dossier.js'), 'utf8');
  const deploymentDrill = fs.readFileSync(path.resolve(REPO_ROOT, 'scripts/ops/run-deployment-drill.sh'), 'utf8');
  const secretRotation = fs.readFileSync(path.resolve(REPO_ROOT, 'scripts/ops/run-secret-rotation-drill.sh'), 'utf8');

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
  const result = checkProductionTemplates({ cwd: '/tmp/nonexistent-template-check-dir' });
  assert.equal(result.success, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.some((err) => err.includes('missing or unreadable file')));
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
    ['node', 'check-production-templates.js', '--cwd=/tmp/nonexistent-template-check-dir'],
    mockIo,
    { exitOnError: false },
  );

  assert.equal(exitCode, 1);
  assert.ok(errors.length > 0);
  assert.ok(errors[0].startsWith('ops template check failed: '));
});
