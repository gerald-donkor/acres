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
  assert.equal(compose().services.api.environment.AI_DRAFT_ENABLED, 'false');
  assert.equal(compose().services.worker.environment.AI_DRAFT_ENABLED, 'false');
  assert.ok(compose().services.api.environment.SESSION_SECRET);
  assert.ok(compose().services.api.environment.CLIENT_ORIGIN);
  assert.equal(Object.hasOwn(compose().services.worker.environment, 'SESSION_SECRET'), false);
  assert.equal(Object.hasOwn(compose().services.worker.environment, 'CLIENT_ORIGIN'), false);
  assert.match(compose().services.api.environment.CSRF_SECRET, /^\$\{CSRF_SECRET:\?/);
  assert.equal(Object.hasOwn(compose().services.worker.environment, 'CSRF_SECRET'), false);
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
    value.services[name].environment.VALKEY_URL = '${DATABASE_URL:?wrong source}';
    const errors = check(value);
    assert.ok(errors.includes(`${name} missing environment key DATABASE_URL`));
    assert.ok(errors.includes(`${name} has unexpected environment key GEMINI_API_KEY`));
    assert.ok(errors.includes(`${name} must require VALKEY_URL from the matching Compose input`));
    assert.equal(errors.join(' ').includes('synthetic-secret-value'), false);
  });

  test(`${name} rejects optional interpolation and duplicate or missing input assignments`, () => {
    const value = compose();
    value.services[name].environment.VALKEY_URL = '${VALKEY_URL-}';
    const changed = input.replace(/^VALKEY_URL=.*$/m, '# VALKEY_URL removed') +
      '\nDATABASE_URL=synthetic-duplicate\n';
    const errors = check(value, changed);
    assert.ok(errors.includes(`${name} must require VALKEY_URL from the matching Compose input`));
    assert.ok(errors.includes('production.env.example must define VALKEY_URL exactly once'));
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

test('worker rejects API mail credentials, auth/session secrets and operator credentials', () => {
  const value = compose();
  for (const key of ['SESSION_SECRET', 'CLIENT_ORIGIN', 'CSRF_SECRET', 'SMTP_PASS', 'POSTGRES_SUPERUSER_PASSWORD', 'ACRES_MIGRATOR_PASSWORD']) {
    value.services.worker.environment[key] = 'synthetic-private';
  }
  assert.deepEqual(check(value), ['SESSION_SECRET', 'CLIENT_ORIGIN', 'CSRF_SECRET', 'SMTP_PASS', 'POSTGRES_SUPERUSER_PASSWORD',
    'ACRES_MIGRATOR_PASSWORD'].map((key) => `worker has unexpected environment key ${key}`));
});

test('API requires matching, mandatory SESSION_SECRET and CLIENT_ORIGIN sources', () => {
  const value = compose();
  delete value.services.api.environment.SESSION_SECRET;
  delete value.services.api.environment.CLIENT_ORIGIN;
  const errors = check(value);
  assert.ok(errors.includes('api missing environment key SESSION_SECRET'));
  assert.ok(errors.includes('api missing environment key CLIENT_ORIGIN'));
});

test('API requires a matching, mandatory CSRF source and one operator assignment', () => {
  const value = compose();
  delete value.services.api.environment.CSRF_SECRET;
  assert.ok(check(value).includes('api missing environment key CSRF_SECRET'));
  value.services.api.environment.CSRF_SECRET = '${SESSION_SECRET:?wrong source}';
  assert.ok(check(value).includes('api must require CSRF_SECRET from the matching Compose input'));
  value.services.api.environment.CSRF_SECRET = '${CSRF_SECRET-}';
  assert.ok(check(value).includes('api must require CSRF_SECRET from the matching Compose input'));
  value.services.api.environment.CSRF_SECRET = '${CSRF_SECRET:?inject CSRF_SECRET}';
  for (const text of [input.replace(/^CSRF_SECRET=.*$/m, ''), input + '\nCSRF_SECRET=synthetic-duplicate\n']) {
    const errors = check(value, text);
    assert.ok(errors.includes('production.env.example must define CSRF_SECRET exactly once'));
    assert.equal(errors.join(' ').includes('synthetic-duplicate'), false);
  }
  const rendered = input.replace(/^CSRF_SECRET=.*$/m, 'CSRF_SECRET=synthetic-runtime-secret');
  assert.ok(check(value, rendered).includes('production.env.example must retain the unresolved CSRF_SECRET placeholder'));
  assert.equal(check(value, rendered).join(' ').includes('synthetic-runtime-secret'), false);
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

test('non-string input text returns error', () => {
  for (const invalid of [null, undefined, 123, {}, []]) {
    assert.deepEqual(checkApplicationEnvironment(compose(), invalid), [
      'production.env.example must be text',
    ]);
  }
});

test('non-object compose returns error', () => {
  for (const invalid of [null, undefined, 123, 'not-an-object', []]) {
    assert.deepEqual(checkApplicationEnvironment(invalid, input), [
      'compose must be an object',
    ]);
  }
});

test('initial UTF-8 BOM is accepted without error', () => {
  assert.deepEqual(check(compose(), `\uFEFF${input}`), []);
});

test('comment mentioning variable name is ignored', () => {
  const modified = `${input}\n# DATABASE_URL=postgresql://ignored:password@host:5432/db\n`;
  assert.deepEqual(check(compose(), modified), []);
});

test('whitespace after delimiter is ambiguous and value-free', () => {
  const canary = 'private-canary-secret-value-do-not-leak';
  const modified = input.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL= ${canary}`);
  const errors = check(compose(), modified);
  assert.ok(errors.includes('production.env.example must define DATABASE_URL exactly once'));
  assert.ok(errors.includes('production.env.example has an ambiguous DATABASE_URL assignment'));
  assert.doesNotMatch(errors.join(' '), /private-canary/);
});

for (const key of ['DATABASE_URL', 'SESSION_SECRET', 'VALKEY_URL', 'STORAGE_ACCESS_KEY_ID']) {
  for (const prefix of [' ', '\t', 'export ', 'export\t']) {
    test(`${JSON.stringify(prefix)}${key} is ambiguous and value-free`, () => {
      const canary = 'super-private-canary-payload';
      const text = `${input}\n${prefix}${key}=${canary}\n`;
      const errors = check(compose(), text);
      assert.ok(errors.includes(`production.env.example has an ambiguous ${key} assignment`));
      assert.ok(errors.includes(`production.env.example must define ${key} exactly once`));
      assert.doesNotMatch(errors.join(' '), /super-private-canary/);
    });
  }
}

test('space before delimiter is ambiguous', () => {
  const canary = 'private-space-before-equals';
  const modified = input.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET =${canary}`);
  const errors = check(compose(), modified);
  assert.ok(errors.includes('production.env.example must define SESSION_SECRET exactly once'));
  assert.ok(errors.includes('production.env.example has an ambiguous SESSION_SECRET assignment'));
  assert.doesNotMatch(errors.join(' '), /private-space/);
});
