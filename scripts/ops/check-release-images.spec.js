'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const yaml = require('js-yaml');
const { checkReleaseImages } = require('./check-release-images');

const digest = 'a'.repeat(64);
const env = {
  ACRES_CLIENT_IMAGE: `registry.example.com/acres/client@sha256:${digest}`,
  ACRES_SERVER_IMAGE: `registry.example.com:5000/acres/server@sha256:${digest}`,
};
const compose = yaml.load(fs.readFileSync('infra/compose/docker-compose.production.example.yml', 'utf8'));

test('accepts explicit registries and identical API/worker server input', () => {
  assert.doesNotThrow(() => checkReleaseImages(compose, env));
});

for (const [name, value] of [
  ['missing', undefined],
  ['sentinel', '__REQUIRED_CLIENT_IMAGE__'],
  ['bare repository', `acres/client@sha256:${digest}`],
  ['tag only', 'registry.example.com/acres/client:latest'],
  ['tag plus digest', `registry.example.com/acres/client:v1@sha256:${digest}`],
  ['short digest', 'registry.example.com/acres/client@sha256:abc'],
  ['nonhex digest', `registry.example.com/acres/client@sha256:${'g'.repeat(64)}`],
  ['uppercase digest', `registry.example.com/acres/client@sha256:${'A'.repeat(64)}`],
  ['other algorithm', `registry.example.com/acres/client@sha512:${digest}`],
  ['malformed host', `-registry.example.com/acres/client@sha256:${digest}`],
  ['oversized DNS label', `${'a'.repeat(64)}.example.com/acres/client@sha256:${digest}`],
  ['invalid port', `registry.example.com:70000/acres/client@sha256:${digest}`],
  ['leading space', ` ${env.ACRES_CLIENT_IMAGE}`],
  ['trailing space', `${env.ACRES_CLIENT_IMAGE} `],
  ['control character', `${env.ACRES_CLIENT_IMAGE}\n`],
  ['shell metacharacter', `registry.example.com/acres/$(id)@sha256:${digest}`],
]) {
  test(`rejects ${name} without echoing input`, () => {
    assert.throws(() => checkReleaseImages(compose, { ...env, ACRES_CLIENT_IMAGE: value }), (error) => {
      assert.doesNotMatch(error.message, /registry\.example\.com|__REQUIRED_|\$\(id\)/);
      return true;
    });
  });
}

for (const [name, change] of [
  ['wrong client variable', (copy) => { copy.services.next.image = copy.services.api.image; }],
  ['divergent worker variable', (copy) => { copy.services.worker.image = '${ACRES_WORKER_IMAGE:?inject image}'; }],
  ['reintroduced build', (copy) => { copy.services.api.build = { context: '../..' }; }],
]) {
  test(`rejects ${name}`, () => {
    const copy = structuredClone(compose);
    change(copy);
    assert.throws(() => checkReleaseImages(copy, env));
  });
}
