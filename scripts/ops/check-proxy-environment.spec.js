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

test('non-string caddyfile input returns a fixed diagnostic', () => {
  for (const invalid of [null, undefined, 42, {}, true]) {
    assert.deepEqual(checkProxyEnvironment(compose(), invalid), [
      'Caddyfile must be text',
    ]);
  }
});

test('non-object compose input returns a fixed diagnostic', () => {
  for (const invalid of [null, undefined, 'compose', [], 123]) {
    assert.deepEqual(checkProxyEnvironment(invalid, caddyfile), [
      'compose must be an object',
    ]);
  }
});

test('Caddyfile with leading UTF-8 BOM passes cleanly', () => {
  assert.deepEqual(checkProxyEnvironment(compose(), '\uFEFF' + caddyfile), []);
});

test('duplicate canonical placeholder is rejected with exact requirement', () => {
  const duplicated = `${caddyfile}\n{$ACRES_TLS_CONTACT_EMAIL}\n`;
  assert.deepEqual(checkProxyEnvironment(compose(), duplicated), [
    'Caddyfile must define ACRES_TLS_CONTACT_EMAIL placeholder exactly once',
  ]);
});

test('ambiguous Bash-style ${KEY} placeholder is rejected with missing and ambiguous errors', () => {
  const replaced = caddyfile.replace(
    '{$ACRES_TLS_CONTACT_EMAIL}',
    '${ACRES_TLS_CONTACT_EMAIL}',
  );
  assert.deepEqual(checkProxyEnvironment(compose(), replaced), [
    'Caddyfile missing ACRES_TLS_CONTACT_EMAIL placeholder',
    'Caddyfile has an ambiguous ACRES_TLS_CONTACT_EMAIL placeholder',
  ]);
});

test('ambiguous placeholder with leading whitespace is rejected', () => {
  const replaced = caddyfile.replace(
    '{$ACRES_TLS_CONTACT_EMAIL}',
    '{$ ACRES_TLS_CONTACT_EMAIL}',
  );
  assert.deepEqual(checkProxyEnvironment(compose(), replaced), [
    'Caddyfile missing ACRES_TLS_CONTACT_EMAIL placeholder',
    'Caddyfile has an ambiguous ACRES_TLS_CONTACT_EMAIL placeholder',
  ]);
});

test('ambiguous placeholder with trailing whitespace is rejected', () => {
  const replaced = caddyfile.replace(
    '{$ACRES_TLS_CONTACT_EMAIL}',
    '{$ACRES_TLS_CONTACT_EMAIL }',
  );
  assert.deepEqual(checkProxyEnvironment(compose(), replaced), [
    'Caddyfile missing ACRES_TLS_CONTACT_EMAIL placeholder',
    'Caddyfile has an ambiguous ACRES_TLS_CONTACT_EMAIL placeholder',
  ]);
});

test('ambiguous placeholder with default colon is rejected without reflecting default value', () => {
  const sentinel = 'operator-secret-fallback@example.com';
  const replaced = caddyfile.replace(
    '{$ACRES_TLS_CONTACT_EMAIL}',
    `{$ACRES_TLS_CONTACT_EMAIL:${sentinel}}`,
  );
  const errors = checkProxyEnvironment(compose(), replaced);
  assert.deepEqual(errors, [
    'Caddyfile missing ACRES_TLS_CONTACT_EMAIL placeholder',
    'Caddyfile has an ambiguous ACRES_TLS_CONTACT_EMAIL placeholder',
  ]);
  assert.equal(errors.join(' ').includes(sentinel), false);
});

test('ambiguous placeholder with default equals is rejected without reflecting default value', () => {
  const sentinel = 'secret-domain-value.net';
  const replaced = caddyfile.replace(
    '{$ACRES_PRODUCTION_DOMAIN}',
    `{$ACRES_PRODUCTION_DOMAIN=${sentinel}}`,
  );
  const errors = checkProxyEnvironment(compose(), replaced);
  assert.deepEqual(errors, [
    'Caddyfile missing ACRES_PRODUCTION_DOMAIN placeholder',
    'Caddyfile has an ambiguous ACRES_PRODUCTION_DOMAIN placeholder',
  ]);
  assert.equal(errors.join(' ').includes(sentinel), false);
});

test('ambiguous placeholder missing dollar sign is rejected', () => {
  const replaced = caddyfile.replace(
    '{$ACRES_TLS_CONTACT_EMAIL}',
    '{ACRES_TLS_CONTACT_EMAIL}',
  );
  assert.deepEqual(checkProxyEnvironment(compose(), replaced), [
    'Caddyfile missing ACRES_TLS_CONTACT_EMAIL placeholder',
    'Caddyfile has an ambiguous ACRES_TLS_CONTACT_EMAIL placeholder',
  ]);
});

test('unclosed placeholder at line end is rejected', () => {
  const replaced = caddyfile.replace(
    '{$ACRES_TLS_CONTACT_EMAIL}',
    '{$ACRES_TLS_CONTACT_EMAIL',
  );
  assert.deepEqual(checkProxyEnvironment(compose(), replaced), [
    'Caddyfile missing ACRES_TLS_CONTACT_EMAIL placeholder',
    'Caddyfile has an ambiguous ACRES_TLS_CONTACT_EMAIL placeholder',
  ]);
});

test('coexisting canonical and ambiguous placeholder triggers duplicate error and ambiguity diagnostic', () => {
  const duplicated = `${caddyfile}\nemail \${ACRES_TLS_CONTACT_EMAIL}\n`;
  assert.deepEqual(checkProxyEnvironment(compose(), duplicated), [
    'Caddyfile must define ACRES_TLS_CONTACT_EMAIL placeholder exactly once',
    'Caddyfile has an ambiguous ACRES_TLS_CONTACT_EMAIL placeholder',
  ]);
});

test('unexpected placeholder is rejected without reflecting private values', () => {
  const modified = `${caddyfile}\n{$ACRES_CUSTOM_INSPECTION_TOKEN}\n`;
  assert.deepEqual(checkProxyEnvironment(compose(), modified), [
    'Caddyfile has unexpected ACRES_CUSTOM_INSPECTION_TOKEN placeholder',
  ]);
});

test('array-typed service in Compose is rejected as missing service', () => {
  const changed = compose();
  changed.services.caddy = [];
  assert.deepEqual(checkProxyEnvironment(changed, caddyfile), [
    'compose missing caddy service',
  ]);
});

test('non-string caddy environment values are rejected gracefully', () => {
  const changedNull = compose();
  changedNull.services.caddy.environment.ACRES_API_READ_TIMEOUT = null;
  assert.deepEqual(checkProxyEnvironment(changedNull, caddyfile), [
    'caddy must require ACRES_API_READ_TIMEOUT from the matching Compose input',
  ]);

  const changedNum = compose();
  changedNum.services.caddy.environment.ACRES_API_READ_TIMEOUT = 12345;
  assert.deepEqual(checkProxyEnvironment(changedNum, caddyfile), [
    'caddy must require ACRES_API_READ_TIMEOUT from the matching Compose input',
  ]);
});
