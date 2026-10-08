const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { checkSmtpTemplateKeys } = require('./check-smtp-template-keys');

const example = fs.readFileSync(
  path.resolve(__dirname, '../../infra/env/production.env.example'),
  'utf8',
);

test('production template provides the two consumed SMTP credential keys', () => {
  assert.deepEqual(checkSmtpTemplateKeys(example), []);
});

for (const [current, legacy] of [
  ['SMTP_USER', 'SMTP_USERNAME'],
  ['SMTP_PASS', 'SMTP_PASSWORD'],
]) {
  test(`${legacy} assignment is rejected without exposing its value`, () => {
    const sentinel = 'synthetic-test-value-keep-private';
    const changed = example.replace(
      new RegExp(`^${current}=.*$`, 'm'),
      `${legacy}=${sentinel}`,
    );
    assert.notEqual(changed, example);
    const errors = checkSmtpTemplateKeys(changed);
    assert.deepEqual(errors, [
      `production.env.example must define ${current} exactly once`,
      `production.env.example must not define ${legacy}`,
    ]);
    assert.equal(errors.join(' ').includes(sentinel), false);
  });
}

test('a comment mentioning a legacy key is allowed', () => {
  assert.deepEqual(
    checkSmtpTemplateKeys(
      `${example}\n# SMTP_USERNAME and SMTP_PASSWORD are obsolete\n`,
    ),
    [],
  );
});

test('duplicate consumed key is rejected', () => {
  assert.deepEqual(
    checkSmtpTemplateKeys(`${example}\nSMTP_USER=synthetic-duplicate\n`),
    ['production.env.example must define SMTP_USER exactly once'],
  );
});

test('CRLF, initial BOM, blank lines and unrelated values are accepted', () => {
  const text = `\uFEFFSMTP_USER=synthetic#SMTP_PASSWORD\r\n\r\n  # SMTP_USERNAME=ignored\r\nOTHER=SMTP_USERNAME=ignored\r\nSMTP_PASS=synthetic\r\n`;
  assert.deepEqual(checkSmtpTemplateKeys(text), []);
});

test('unrelated keys with watched-key prefixes are ignored', () => {
  assert.deepEqual(
    checkSmtpTemplateKeys(
      `${example}\nSMTP_USERbackup=synthetic\nSMTP_PASSWORDold=synthetic\n`,
    ),
    [],
  );
});

test('whitespace after the delimiter is ambiguous', () => {
  const changed = example.replace(/^SMTP_USER=.*$/m, 'SMTP_USER= synthetic');
  assert.deepEqual(checkSmtpTemplateKeys(changed), [
    'production.env.example must define SMTP_USER exactly once',
    'production.env.example has an ambiguous SMTP_USER assignment',
  ]);
});

for (const key of [
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_USERNAME',
  'SMTP_PASSWORD',
]) {
  for (const prefix of [' ', 'export ', '\t', 'export\t']) {
    test(`${JSON.stringify(prefix)}${key} is ambiguous and value-free`, () => {
      const canary = 'private-smtp-canary';
      const text = `${example}\n${prefix}${key} =${canary}\n`;
      const errors = checkSmtpTemplateKeys(text);
      assert.ok(
        errors.includes(
          `production.env.example has an ambiguous ${key} assignment`,
        ),
      );
      if (key === 'SMTP_USERNAME' || key === 'SMTP_PASSWORD') {
        assert.ok(
          errors.includes(`production.env.example must not define ${key}`),
        );
      }
      assert.doesNotMatch(errors.join(' '), /private-smtp-canary/);
    });
  }
}

test('malformed watched keys cannot satisfy required declarations', () => {
  const text = 'SMTP_USER:value\nSMTP_PASS value\n';
  assert.deepEqual(checkSmtpTemplateKeys(text), [
    'production.env.example must define SMTP_USER exactly once',
    'production.env.example must define SMTP_PASS exactly once',
    'production.env.example has an ambiguous SMTP_USER assignment',
    'production.env.example has an ambiguous SMTP_PASS assignment',
  ]);
});

test('nonstring input returns a fixed diagnostic', () => {
  for (const value of [undefined, null, {}, [], 1]) {
    assert.deepEqual(checkSmtpTemplateKeys(value), [
      'production.env.example must be text',
    ]);
  }
});
