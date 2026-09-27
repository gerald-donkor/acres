const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { checkApplicationEnvironment } = require('./check-application-environment');

const composeText = fs.readFileSync(path.resolve(__dirname,
  '../../infra/compose/docker-compose.production.example.yml'), 'utf8');
const input = fs.readFileSync(path.resolve(__dirname,
  '../../infra/env/production.env.example'), 'utf8');
const compose = () => yaml.load(composeText);
const check = (value = compose(), text = input) => checkApplicationEnvironment(value, text);

test('production API and worker use the audited key maps', () => {
  assert.deepEqual(check(), []);
  for (const name of ['api', 'worker']) {
    assert.equal(compose().services[name].environment.AI_DRAFT_ENABLED, 'false');
    assert.ok(compose().services[name].environment.SESSION_SECRET);
    assert.ok(compose().services[name].environment.CLIENT_ORIGIN);
  }
  for (const key of ['CLAMAV_HOST', 'CLAMAV_PORT', 'CLAMAV_SCAN_TIMEOUT_MS',
    'UPLOAD_CLEANUP_INTERVAL_MS', 'QUEUE_SHUTDOWN_MS']) {
    assert.equal(Object.hasOwn(compose().services.api.environment, key), false);
  }
  for (const key of ['TENANCY_ENABLED', 'QUEUE_SHUTDOWN_MS']) {
    assert.equal(Object.hasOwn(compose().services.worker.environment, key), false);
  }
});

for (const name of ['api', 'worker']) {
  test(`${name} rejects inherited environment`, () => {
    const value = compose();
    value.services[name].env_file = ['../env/production.env.example'];
    value.services[name].extends = { service: 'postgres' };
    assert.deepEqual(check(value), [
      `${name} must not declare env_file`, `${name} must not extend another service`,
    ]);
  });

  test(`${name} rejects missing, extra and miswired keys without secret values`, () => {
    const value = compose();
    delete value.services[name].environment.DATABASE_URL;
    value.services[name].environment.GEMINI_API_KEY = 'synthetic-secret-value';
    value.services[name].environment.SESSION_SECRET = '${DATABASE_URL:?wrong source}';
    const errors = check(value);
    assert.ok(errors.includes(`${name} missing environment key DATABASE_URL`));
    assert.ok(errors.includes(`${name} has unexpected environment key GEMINI_API_KEY`));
    assert.ok(errors.includes(`${name} must require SESSION_SECRET from the matching Compose input`));
    assert.equal(errors.join(' ').includes('synthetic-secret-value'), false);
  });

  test(`${name} rejects optional interpolation and duplicate or missing input assignments`, () => {
    const value = compose();
    value.services[name].environment.SESSION_SECRET = '${SESSION_SECRET-}';
    const changed = input.replace(/^SESSION_SECRET=.*$/m, '# SESSION_SECRET removed') +
      '\nDATABASE_URL=synthetic-duplicate\n';
    const errors = check(value, changed);
    assert.ok(errors.includes(`${name} must require SESSION_SECRET from the matching Compose input`));
    assert.ok(errors.includes('production.env.example must define SESSION_SECRET exactly once'));
    assert.ok(errors.includes('production.env.example must define DATABASE_URL exactly once'));
    assert.equal(errors.join(' ').includes('synthetic-duplicate'), false);
  });
}

test('API rejects worker-only, migration and operator credentials', () => {
  const value = compose();
  for (const key of ['WORKER_METRICS_HOST', 'DATABASE_MIGRATION_URL', 'GRAFANA_ADMIN_PASSWORD']) {
    value.services.api.environment[key] = 'synthetic-private';
  }
  assert.deepEqual(check(value), ['WORKER_METRICS_HOST', 'DATABASE_MIGRATION_URL',
    'GRAFANA_ADMIN_PASSWORD'].map((key) => `api has unexpected environment key ${key}`));
});

test('worker rejects API mail credentials and operator credentials', () => {
  const value = compose();
  for (const key of ['SMTP_PASS', 'POSTGRES_SUPERUSER_PASSWORD', 'ACRES_MIGRATOR_PASSWORD']) {
    value.services.worker.environment[key] = 'synthetic-private';
  }
  assert.deepEqual(check(value), ['SMTP_PASS', 'POSTGRES_SUPERUSER_PASSWORD',
    'ACRES_MIGRATOR_PASSWORD'].map((key) => `worker has unexpected environment key ${key}`));
});

test('scheduler, worker metrics and no-AI constants are fixed', () => {
  const value = compose();
  value.services.api.environment.SCHEDULER_ENABLED = 'true';
  value.services.worker.environment.SCHEDULER_ENABLED = 'false';
  value.services.worker.environment.WORKER_METRICS_HOST = '127.0.0.1';
  value.services.worker.environment.WORKER_METRICS_PORT = '3003';
  value.services.worker.environment.AI_DRAFT_ENABLED = 'true';
  assert.deepEqual(check(value), [
    'api must set SCHEDULER_ENABLED to its fixed value',
    'worker must set SCHEDULER_ENABLED to its fixed value',
    'worker must set WORKER_METRICS_HOST to its fixed value',
    'worker must set WORKER_METRICS_PORT to its fixed value',
    'worker must set AI_DRAFT_ENABLED to its fixed value',
  ]);
});
