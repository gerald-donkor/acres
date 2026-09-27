const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { checkProxyEnvironment } = require('./check-proxy-environment');

const composeText = fs.readFileSync(
  path.resolve(__dirname, '../../infra/compose/docker-compose.production.example.yml'),
  'utf8',
);
const caddyfile = fs.readFileSync(
  path.resolve(__dirname, '../../infra/caddy/Caddyfile.example'),
  'utf8',
);
const compose = () => yaml.load(composeText);

test('production reference scopes Caddy and Next environment', () => {
  assert.deepEqual(checkProxyEnvironment(compose(), caddyfile), []);
});

for (const name of ['caddy', 'next']) {
  test(`${name} rejects shared env_file injection`, () => {
    const changed = compose();
    changed.services[name].env_file = ['../env/production.env.example'];
    assert.deepEqual(checkProxyEnvironment(changed, caddyfile), [
      `${name} must not declare env_file`,
    ]);
  });

  test(`${name} rejects inherited service configuration`, () => {
    const changed = compose();
    changed.services[name].extends = { service: 'api' };
    assert.deepEqual(checkProxyEnvironment(changed, caddyfile), [
      `${name} must not extend another service`,
    ]);
  });

  test(`${name} rejects an extra secret key without printing its value`, () => {
    const changed = compose();
    const sentinel = 'synthetic-private-value';
    changed.services[name].environment.SESSION_SECRET = sentinel;
    const errors = checkProxyEnvironment(changed, caddyfile);
    assert.deepEqual(errors, [`${name} has unexpected environment key SESSION_SECRET`]);
    assert.equal(errors.join(' ').includes(sentinel), false);
  });
}

test('a missing or miswired Caddy variable fails', () => {
  const missing = compose();
  delete missing.services.caddy.environment.ACRES_API_READ_TIMEOUT;
  assert.deepEqual(checkProxyEnvironment(missing, caddyfile), [
    'caddy missing environment key ACRES_API_READ_TIMEOUT',
  ]);

  const miswired = compose();
  miswired.services.caddy.environment.ACRES_API_READ_TIMEOUT =
    '${ACRES_API_WRITE_TIMEOUT:?wrong source}';
  assert.deepEqual(checkProxyEnvironment(miswired, caddyfile), [
    'caddy must require ACRES_API_READ_TIMEOUT from the matching Compose input',
  ]);
});

test('Caddyfile placeholder drift fails, including the reserved HSTS variable', () => {
  assert.deepEqual(checkProxyEnvironment(compose(), caddyfile.replace(
    '{$ACRES_HSTS_MAX_AGE}', 'approved-value',
  )), ['Caddyfile missing ACRES_HSTS_MAX_AGE placeholder']);
});

test('comments about old injection do not affect parsed assignments', () => {
  const changed = yaml.load(`${composeText}\n# caddy and next once used env_file\n`);
  assert.deepEqual(checkProxyEnvironment(changed, caddyfile), []);
});
