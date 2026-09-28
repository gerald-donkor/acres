const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const yaml = require('js-yaml');

const {
  parseDockerfile,
  validateDockerfile,
  validateComposeConfig,
  verifyContainerSecurity,
} = require('./verify-container-security');

const ROOT_DIR = path.resolve(__dirname, '../..');
const SERVER_DOCKERFILE = path.join(ROOT_DIR, 'server/Dockerfile');
const CLIENT_DOCKERFILE = path.join(ROOT_DIR, 'infra/docker/client.Dockerfile.example');
const COMPOSE_FILE = path.join(ROOT_DIR, 'infra/compose/docker-compose.production.example.yml');

test('validateComposeConfig: Valkey probe requires the same injected password as the server', () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, 'utf8'));
  const check = 'valkey-authenticated-healthcheck';
  assert.equal(validateComposeConfig(original).checks.find((item) => item.check === check)?.passed, true);

  const mutations = [
    (doc) => { delete doc.services.valkey.environment.VALKEY_PASSWORD; },
    (doc) => { doc.services.valkey.healthcheck.test[1] = 'VALKEYCLI_AUTH="$${UNBOUND_PASSWORD}" valkey-cli ping | grep -qx PONG'; },
    (doc) => { doc.services.valkey.command[2] = '${OTHER_PASSWORD:?inject other password}'; },
  ];
  for (const mutate of mutations) {
    const doc = structuredClone(original);
    mutate(doc);
    const result = validateComposeConfig(doc);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes(check) && error.includes('VALKEY_PASSWORD')));
  }
});

test('verifyContainerSecurity: production reference files pass 100% of container security checks', () => {
  const result = verifyContainerSecurity();

  assert.equal(result.valid, true, `Expected valid container security, errors: ${result.errors.join(', ')}`);
  assert.equal(result.errors.length, 0);
  assert.ok(result.checks.length >= 17, `Expected at least 17 checks, got ${result.checks.length}`);
  assert.ok(result.checks.every((c) => c.passed === true));
});

test('validateDockerfile: detects insecure root runtime user regression', () => {
  const insecureRootDockerfile = `
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=build /app/dist ./dist
USER root
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "dist/main.js"]
`;

  const res = validateDockerfile(insecureRootDockerfile, 'insecure.Dockerfile');
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('non-root-runtime-user')));
});

test('validateDockerfile: detects missing multi-stage isolation regression', () => {
  const singleStageDockerfile = `
FROM node:24-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "dist/main.js"]
`;

  const res = validateDockerfile(singleStageDockerfile, 'single-stage.Dockerfile');
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('multi-stage-isolation')));
});

test('validateDockerfile: detects missing or unbounded healthcheck regression', () => {
  const noHealthcheckDockerfile = `
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json ./

FROM deps AS build
COPY . .

FROM node:24-alpine AS runtime
WORKDIR /app
USER node
CMD ["node", "dist/main.js"]
`;

  const res = validateDockerfile(noHealthcheckDockerfile, 'no-healthcheck.Dockerfile');
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('bounded-healthcheck')));
});

test('validateDockerfile: detects secret leakage (.env copy) regression', () => {
  const secretLeakDockerfile = `
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json ./

FROM deps AS build
COPY . .

FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=build /app/.env.production ./.env
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "dist/main.js"]
`;

  const res = validateDockerfile(secretLeakDockerfile, 'leak.Dockerfile');
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('layer-hygiene-zero-secrets')));
});

test('validateComposeConfig: detects hardcoded plaintext password regression', () => {
  const insecureCompose = {
    services: {
      postgres: {
        environment: {
          POSTGRES_PASSWORD: 'plainTextUnsafePassword123',
        },
        networks: ['private'],
        healthcheck: { test: ['CMD', 'pg_isready'] },
      },
    },
    networks: {
      private: { internal: true },
    },
  };

  const res = validateComposeConfig(insecureCompose);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('mandatory-secret-injection-syntax')));
  assert.equal(res.errors.join(' ').includes('plainTextUnsafePassword123'), false);
});

test('validateComposeConfig: accepts Garage metrics file path only with read-only source mount', () => {
  const fileMount = '${ACRES_GARAGE_METRICS_TOKEN_FILE:?inject Garage metrics token file path}:/run/secrets/garage_metrics_token:ro';
  const compose = {
    services: { garage: {
      environment: { GARAGE_METRICS_TOKEN_FILE: '/run/secrets/garage_metrics_token' },
      volumes: [fileMount], networks: ['private'],
      healthcheck: { test: ['CMD', 'true'] },
    } },
    networks: { private: { internal: true } },
  };
  assert.equal(validateComposeConfig(compose).valid, true);
  compose.services.garage.volumes = [fileMount.replace(':ro', ':rw')];
  assert.ok(validateComposeConfig(compose).errors.some((e) => e.includes('mandatory-secret-injection-syntax')));
});

test('validateComposeConfig: detects datastore leaked onto public network regression', () => {
  const publicDatastoreCompose = {
    services: {
      postgres: {
        environment: {
          POSTGRES_PASSWORD: '${POSTGRES_PASSWORD:?inject}',
        },
        networks: ['public', 'private'],
        healthcheck: { test: ['CMD', 'pg_isready'] },
      },
    },
    networks: {
      private: { internal: true },
    },
  };

  const res = validateComposeConfig(publicDatastoreCompose);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('datastore-network-isolation')));
});

test('validateDockerfile: detects healthcheck present in deps stage but missing in runtime stage', () => {
  const earlyHealthcheckDockerfile = `
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json ./
HEALTHCHECK --interval=30s --timeout=5s CMD true

FROM deps AS build
COPY . .

FROM node:24-alpine AS runtime
WORKDIR /app
USER node
CMD ["node", "dist/main.js"]
`;

  const res = validateDockerfile(earlyHealthcheckDockerfile, 'early-healthcheck.Dockerfile');
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('bounded-healthcheck')));
});

test('validateComposeConfig: detects hardcoded secrets in array-format environment and command flags', () => {
  const arrayEnvCompose = {
    services: {
      valkey: {
        environment: [
          'REDIS_PASSWORD=hardcodedPlaintextPassword',
        ],
        command: ['valkey-server', '--requirepass', 'plaintextBadPass'],
        networks: ['private'],
        healthcheck: { test: ['CMD', 'valkey-cli', 'ping'] },
      },
    },
    networks: {
      private: { internal: true },
    },
  };

  const res = validateComposeConfig(arrayEnvCompose);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('mandatory-secret-injection-syntax')));
});

test('validateComposeConfig: detects missing internal: true on private network regression', () => {
  const openNetworkCompose = {
    services: {
      postgres: {
        environment: {
          POSTGRES_PASSWORD: '${POSTGRES_PASSWORD:?inject}',
        },
        networks: ['private'],
        healthcheck: { test: ['CMD', 'pg_isready'] },
      },
    },
    networks: {
      private: { internal: false },
    },
  };

  const res = validateComposeConfig(openNetworkCompose);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('private-network-internal-isolation')));
});

test('validateComposeConfig: detects missing healthcheck on worker or next service regression', () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, 'utf8'));
  const check = 'service-healthchecks-defined';
  assert.equal(validateComposeConfig(original).checks.find((item) => item.check === check)?.passed, true);

  for (const svc of ['worker', 'next']) {
    const doc = structuredClone(original);
    delete doc.services[svc].healthcheck;
    const result = validateComposeConfig(doc);
    assert.equal(result.valid, false);
    assert.equal(result.checks.find((item) => item.check === check)?.passed, false);
    assert.ok(result.errors.some((error) => error.includes(svc)));
  }
});

test('validateComposeConfig: detects internal observability and worker services leaked onto public network', () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, 'utf8'));
  const check = 'datastore-network-isolation';
  assert.equal(validateComposeConfig(original).checks.find((item) => item.check === check)?.passed, true);

  for (const svc of ['postgres-exporter', 'grafana', 'worker', 'next']) {
    const doc = structuredClone(original);
    doc.services[svc].networks = ['public', 'private'];
    const result = validateComposeConfig(doc);
    assert.equal(result.valid, false);
    assert.equal(result.checks.find((item) => item.check === check)?.passed, false);
    assert.ok(result.errors.some((error) => error.includes(svc)));
  }
});

test('validateComposeConfig: detects Caddy backend dependencies permitting unready condition', () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, 'utf8'));
  const check = 'caddy-dependencies-healthy';
  assert.equal(validateComposeConfig(original).checks.find((item) => item.check === check)?.passed, true);

  for (const dep of ['next', 'api', 'garage']) {
    const doc = structuredClone(original);
    doc.services.caddy.depends_on[dep] = { condition: 'service_started' };
    const result = validateComposeConfig(doc);
    assert.equal(result.valid, false);
    assert.equal(result.checks.find((item) => item.check === check)?.passed, false);
    assert.ok(result.errors.some((error) => error.includes(dep)));
  }
});

test('validateComposeConfig: detects omitted critical service definition (worker, next) from full compose stack', () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, 'utf8'));
  const check = 'service-healthchecks-defined';

  for (const svc of ['worker', 'next']) {
    const doc = structuredClone(original);
    delete doc.services[svc];
    const result = validateComposeConfig(doc);
    assert.equal(result.valid, false);
    assert.equal(result.checks.find((item) => item.check === check)?.passed, false);
    assert.ok(result.errors.some((error) => error.includes(`Required service '${svc}' is not defined`)));
  }
});

test('validateComposeConfig: detects missing Caddy depends_on or omitted upstream backend', () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, 'utf8'));
  const check = 'caddy-dependencies-healthy';

  const docNoDependsOn = structuredClone(original);
  delete docNoDependsOn.services.caddy.depends_on;
  const resNoDependsOn = validateComposeConfig(docNoDependsOn);
  assert.equal(resNoDependsOn.valid, false);
  assert.equal(resNoDependsOn.checks.find((item) => item.check === check)?.passed, false);

  for (const backend of ['next', 'api', 'garage']) {
    const doc = structuredClone(original);
    delete doc.services.caddy.depends_on[backend];
    const result = validateComposeConfig(doc);
    assert.equal(result.valid, false);
    assert.equal(result.checks.find((item) => item.check === check)?.passed, false);
    assert.ok(result.errors.some((error) => error.includes(`missing expected backend '${backend}'`)));
  }
});

test('validateComposeConfig: detects missing observability dependencies or unhealthchecked Prometheus', () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, 'utf8'));
  const check = 'observability-dependencies-healthy';
  assert.equal(validateComposeConfig(original).checks.find((item) => item.check === check)?.passed, true);

  // 1. Prometheus missing healthcheck
  const docNoPromHc = structuredClone(original);
  delete docNoPromHc.services.prometheus.healthcheck;
  const resNoPromHc = validateComposeConfig(docNoPromHc);
  assert.equal(resNoPromHc.valid, false);
  assert.equal(resNoPromHc.checks.find((item) => item.check === check)?.passed, false);
  assert.ok(resNoPromHc.errors.some((err) => err.includes("Service 'prometheus' must define bounded healthcheck on /-/healthy")));

  // 2. postgres-exporter missing depends_on postgres or permitting unready condition
  const docNoExporterDep = structuredClone(original);
  delete docNoExporterDep.services['postgres-exporter'].depends_on;
  const resNoExporterDep = validateComposeConfig(docNoExporterDep);
  assert.equal(resNoExporterDep.valid, false);
  assert.equal(resNoExporterDep.checks.find((item) => item.check === check)?.passed, false);
  assert.ok(resNoExporterDep.errors.some((err) => err.includes("Service 'postgres-exporter' must depend on postgres with condition: service_healthy")));

  const docExporterStarted = structuredClone(original);
  docExporterStarted.services['postgres-exporter'].depends_on.postgres.condition = 'service_started';
  const resExporterStarted = validateComposeConfig(docExporterStarted);
  assert.equal(resExporterStarted.valid, false);
  assert.equal(resExporterStarted.checks.find((item) => item.check === check)?.passed, false);

  // 3. grafana missing depends_on prometheus or permitting unready condition
  const docNoGrafanaDep = structuredClone(original);
  delete docNoGrafanaDep.services.grafana.depends_on;
  const resNoGrafanaDep = validateComposeConfig(docNoGrafanaDep);
  assert.equal(resNoGrafanaDep.valid, false);
  assert.equal(resNoGrafanaDep.checks.find((item) => item.check === check)?.passed, false);
  assert.ok(resNoGrafanaDep.errors.some((err) => err.includes("Service 'grafana' must depend on prometheus with condition: service_healthy")));

  const docGrafanaStarted = structuredClone(original);
  docGrafanaStarted.services.grafana.depends_on.prometheus.condition = 'service_started';
  const resGrafanaStarted = validateComposeConfig(docGrafanaStarted);
  assert.equal(resGrafanaStarted.valid, false);
  assert.equal(resGrafanaStarted.checks.find((item) => item.check === check)?.passed, false);
});

test('validateComposeConfig: detects missing or unready application datastore dependencies', () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, 'utf8'));
  const check = 'application-dependencies-healthy';
  assert.equal(validateComposeConfig(original).checks.find((item) => item.check === check)?.passed, true);

  // 1. API missing required dependencies
  for (const dep of ['postgres', 'valkey', 'garage']) {
    const doc = structuredClone(original);
    delete doc.services.api.depends_on[dep];
    const result = validateComposeConfig(doc);
    assert.equal(result.valid, false);
    assert.equal(result.checks.find((item) => item.check === check)?.passed, false);
    assert.ok(result.errors.some((err) => err.includes(`Service 'api' depends_on is missing expected backend '${dep}'`)));
  }

  // 2. API dependency permits unready condition
  const docApiStarted = structuredClone(original);
  docApiStarted.services.api.depends_on.postgres.condition = 'service_started';
  const resApiStarted = validateComposeConfig(docApiStarted);
  assert.equal(resApiStarted.valid, false);
  assert.equal(resApiStarted.checks.find((item) => item.check === check)?.passed, false);
  assert.ok(resApiStarted.errors.some((err) => err.includes("Service 'api' dependency 'postgres' must require condition: service_healthy")));

  // 3. Worker missing required dependencies
  for (const dep of ['postgres', 'valkey', 'garage', 'clamav']) {
    const doc = structuredClone(original);
    delete doc.services.worker.depends_on[dep];
    const result = validateComposeConfig(doc);
    assert.equal(result.valid, false);
    assert.equal(result.checks.find((item) => item.check === check)?.passed, false);
    assert.ok(result.errors.some((err) => err.includes(`Service 'worker' depends_on is missing expected backend '${dep}'`)));
  }

  // 4. Worker dependency permits unready condition
  const docWorkerStarted = structuredClone(original);
  docWorkerStarted.services.worker.depends_on.clamav.condition = 'service_started';
  const resWorkerStarted = validateComposeConfig(docWorkerStarted);
  assert.equal(resWorkerStarted.valid, false);
  // 5. API extra dependency permits unready condition
  const docApiExtraUnready = structuredClone(original);
  docApiExtraUnready.services.api.depends_on.unready_backend = { condition: 'service_started' };
  const resApiExtra = validateComposeConfig(docApiExtraUnready);
  assert.equal(resApiExtra.valid, false);
  assert.equal(resApiExtra.checks.find((item) => item.check === check)?.passed, false);
  assert.ok(resApiExtra.errors.some((err) => err.includes("Service 'api' dependency 'unready_backend' must require condition: service_healthy")));
});

test('validateComposeConfig: detects missing init: true or stop_signal: SIGTERM on application services', () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, 'utf8'));
  const check = 'process-init-supervision';
  assert.equal(validateComposeConfig(original).checks.find((item) => item.check === check)?.passed, true);

  for (const svc of ['api', 'worker', 'next']) {
    // Missing init: true
    const docNoInit = structuredClone(original);
    delete docNoInit.services[svc].init;
    const resNoInit = validateComposeConfig(docNoInit);
    assert.equal(resNoInit.valid, false);
    assert.equal(resNoInit.checks.find((item) => item.check === check)?.passed, false);
    assert.ok(resNoInit.errors.some((err) => err.includes(`Service '${svc}' should configure init: true`)));

    // Missing or invalid stop_signal
    const docBadSignal = structuredClone(original);
    docBadSignal.services[svc].stop_signal = 'SIGKILL';
    const resBadSignal = validateComposeConfig(docBadSignal);
    assert.equal(resBadSignal.valid, false);
    assert.equal(resBadSignal.checks.find((item) => item.check === check)?.passed, false);
    assert.ok(resBadSignal.errors.some((err) => err.includes(`Service '${svc}' should configure stop_signal: SIGTERM`)));
  }
});

test('validateComposeConfig: detects missing restart policy or drifted stop_grace_period', () => {
  const original = yaml.load(fs.readFileSync(COMPOSE_FILE, 'utf8'));
  const check = 'graceful-shutdown-lifecycle';
  assert.equal(validateComposeConfig(original).checks.find((item) => item.check === check)?.passed, true);

  // 1. Missing restart: unless-stopped on a service
  const docNoRestart = structuredClone(original);
  delete docNoRestart.services.postgres.restart;
  const resNoRestart = validateComposeConfig(docNoRestart);
  assert.equal(resNoRestart.valid, false);
  assert.equal(resNoRestart.checks.find((item) => item.check === check)?.passed, false);
  assert.ok(resNoRestart.errors.some((err) => err.includes("Service 'postgres' must configure restart: unless-stopped")));

  // 2. Drifted stop_grace_period on application service
  const docDriftGrace = structuredClone(original);
  docDriftGrace.services.worker.stop_grace_period = '10s';
  const resDriftGrace = validateComposeConfig(docDriftGrace);
  assert.equal(resDriftGrace.valid, false);
  assert.equal(resDriftGrace.checks.find((item) => item.check === check)?.passed, false);
  assert.ok(resDriftGrace.errors.some((err) => err.includes("Service 'worker' stop_grace_period is '10s', expected '60s'")));

  // 3. Missing stop_grace_period on a stateful service
  const docNoGrace = structuredClone(original);
  delete docNoGrace.services.garage.stop_grace_period;
  const resNoGrace = validateComposeConfig(docNoGrace);
  assert.equal(resNoGrace.valid, false);
  assert.equal(resNoGrace.checks.find((item) => item.check === check)?.passed, false);
  assert.ok(resNoGrace.errors.some((err) => err.includes("Service 'garage' must define a positive bounded stop_grace_period")));

  // 4. Zero stop_grace_period ('0s') rejected
  const docZeroGrace = structuredClone(original);
  docZeroGrace.services.postgres.stop_grace_period = '0s';
  const resZeroGrace = validateComposeConfig(docZeroGrace);
  assert.equal(resZeroGrace.valid, false);
  assert.equal(resZeroGrace.checks.find((item) => item.check === check)?.passed, false);
  assert.ok(resZeroGrace.errors.some((err) => err.includes("Service 'postgres' must define a positive bounded stop_grace_period")));
});

test('verifyContainerSecurity CLI: --output and -o create structured JSON evidence file matching schema', () => {
  const os = require('node:os');
  const { execFileSync } = require('node:child_process');
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'container-cli-test-'));
  try {
    const scriptPath = path.join(__dirname, 'verify-container-security.js');
    const outPath1 = path.join(tmpDir, 'container-security-evidence-1.json');
    execFileSync(process.execPath, [scriptPath, '--output', outPath1], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
    });

    assert.ok(fs.existsSync(outPath1), 'evidence file 1 must be created');
    const evidence1 = JSON.parse(fs.readFileSync(outPath1, 'utf8'));
    assert.equal(evidence1.drill_type, 'container_security_verification');
    assert.match(evidence1.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.equal(evidence1.status, 'success');
    assert.equal(evidence1.valid, true);
    assert.deepEqual(evidence1.errors, []);
    assert.ok(Array.isArray(evidence1.checks));
    assert.ok(evidence1.checks.length >= 17);
    assert.ok(evidence1.checks.every((c) => c.passed === true));
    assert.equal(evidence1.failedChecks, 0);

    const outPath2 = path.join(tmpDir, 'container-security-evidence-2.json');
    execFileSync(process.execPath, [scriptPath, '-o', outPath2], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
    });
    assert.ok(fs.existsSync(outPath2), 'evidence file 2 must be created via -o');
    const evidence2 = JSON.parse(fs.readFileSync(outPath2, 'utf8'));
    assert.equal(evidence2.drill_type, 'container_security_verification');
    assert.equal(evidence2.status, 'success');
    assert.equal(evidence2.valid, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
