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
  assert.deepEqual(checkSmtpTemplateKeys(`${example}\n# SMTP_USERNAME and SMTP_PASSWORD are obsolete\n`), []);
});

test('duplicate consumed key is rejected', () => {
  assert.deepEqual(checkSmtpTemplateKeys(`${example}\nSMTP_USER=synthetic-duplicate\n`), [
    'production.env.example must define SMTP_USER exactly once',
  ]);
});
