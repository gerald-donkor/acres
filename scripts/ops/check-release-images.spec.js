'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const yaml = require('js-yaml');
const {
  APP_IMAGES,
  EXPORTER_IMAGE,
  COMPOSE_PATH,
  isMapping,
  validateImageReference,
  validateComposeImages,
  validateComposeImagesErrors,
  checkReleaseImages,
  checkReleaseImagesErrors,
  parseCliArguments,
  main,
  ReleaseImagesUsageError,
} = require('./check-release-images');

const digest = 'a'.repeat(64);
const env = {
  ACRES_CLIENT_IMAGE: `registry.example.com/acres/client@sha256:${digest}`,
  ACRES_SERVER_IMAGE: `registry.example.com:5000/acres/server@sha256:${digest}`,
};
const compose = yaml.load(
  fs.readFileSync('infra/compose/docker-compose.production.example.yml', 'utf8'),
);

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
    assert.throws(
      () => checkReleaseImages(compose, { ...env, ACRES_CLIENT_IMAGE: value }),
      (error) => {
        assert.doesNotMatch(
          error.message,
          /registry\.example\.com|__REQUIRED_|\$\(id\)/,
        );
        return true;
      },
    );
  });
}

for (const [name, change] of [
  [
    'wrong client variable',
    (copy) => {
      copy.services.next.image = copy.services.api.image;
    },
  ],
  [
    'divergent worker variable',
    (copy) => {
      copy.services.worker.image = '${ACRES_WORKER_IMAGE:?inject image}';
    },
  ],
  [
    'reintroduced build',
    (copy) => {
      copy.services.api.build = { context: '../..' };
    },
  ],
  [
    'floating exporter image',
    (copy) => {
      copy.services['postgres-exporter'].image =
        'ghcr.io/prometheus-community/postgres-exporter:latest';
    },
  ],
]) {
  test(`rejects ${name}`, () => {
    const copy = structuredClone(compose);
    change(copy);
    assert.throws(() => checkReleaseImages(copy, env));
  });
}

test('rejects substituted exporter registry and digest', () => {
  const copy = structuredClone(compose);
  copy.services['postgres-exporter'].image = `registry.example.com/postgres-exporter@sha256:${digest}`;
  assert.throws(() => checkReleaseImages(copy, env));
  copy.services['postgres-exporter'].image = `ghcr.io/prometheus-community/postgres-exporter@sha256:${digest}`;
  assert.throws(() => checkReleaseImages(copy, env));
});

test('isMapping identifies plain objects and rejects primitives, null, and arrays', () => {
  assert.equal(isMapping({}), true);
  assert.equal(isMapping(Object.create(null)), true);
  assert.equal(isMapping(null), false);
  assert.equal(isMapping(undefined), false);
  assert.equal(isMapping('string'), false);
  assert.equal(isMapping(123), false);
  assert.equal(isMapping(true), false);
  assert.equal(isMapping([]), false);
  assert.equal(isMapping(() => {}), false);
});

test('validateComposeImages and validateComposeImagesErrors reject non-object compose', () => {
  for (const badCompose of [null, undefined, 'string', 123, true, []]) {
    assert.deepEqual(validateComposeImagesErrors(badCompose), [
      'compose must be an object',
    ]);
    assert.throws(
      () => validateComposeImages(badCompose),
      /compose must be an object/,
    );
  }
});

test('validateComposeImages and validateComposeImagesErrors reject missing or non-object services', () => {
  for (const badServices of [null, undefined, 'invalid', 42, []]) {
    const candidate = { services: badServices };
    assert.deepEqual(validateComposeImagesErrors(candidate), [
      'compose services must be an object',
    ]);
    assert.throws(
      () => validateComposeImages(candidate),
      /compose services must be an object/,
    );
  }
});

test('validateComposeImages rejects non-mapping individual service entries', () => {
  for (const serviceName of ['next', 'api', 'worker']) {
    const copy = structuredClone(compose);
    copy.services[serviceName] = 'invalid';
    assert.throws(
      () => validateComposeImages(copy),
      new RegExp(`${serviceName} must use its required release image input without a build`),
    );
  }

  const copyExporter = structuredClone(compose);
  copyExporter.services['postgres-exporter'] = null;
  assert.throws(
    () => validateComposeImages(copyExporter),
    /postgres-exporter must use its required pinned image input without a build/,
  );
});

test('validateComposeImages rejects missing required services', () => {
  for (const serviceName of ['next', 'api', 'worker']) {
    const copy = structuredClone(compose);
    delete copy.services[serviceName];
    assert.throws(
      () => validateComposeImages(copy),
      new RegExp(`${serviceName} must use its required release image input without a build`),
    );
  }

  const copyExporter = structuredClone(compose);
  delete copyExporter.services['postgres-exporter'];
  assert.throws(
    () => validateComposeImages(copyExporter),
    /postgres-exporter must use its required pinned image input without a build/,
  );
});

test('validateComposeImages rejects services with build property regardless of value', () => {
  for (const buildValue of [null, undefined, false, '', {}]) {
    const copy = structuredClone(compose);
    copy.services.next.build = buildValue;
    assert.throws(
      () => validateComposeImages(copy),
      /next must use its required release image input without a build/,
    );
  }
});

test('validateComposeImagesErrors returns deduplicated list of errors', () => {
  const broken = {
    services: {
      next: { image: 'wrong' },
      api: { image: 'wrong', build: '.' },
      worker: 'not-an-object',
      'postgres-exporter': { image: 'wrong' },
    },
  };
  const errors = validateComposeImagesErrors(broken);
  assert.equal(Array.isArray(errors), true);
  assert.equal(errors.length, 4);
  assert.equal(new Set(errors).size, 4);
});

test('validateImageReference rejects non-string values and defaults name', () => {
  for (const nonString of [null, undefined, 123, {}, []]) {
    assert.throws(
      () => validateImageReference(nonString),
      /image must be a registry\/path@sha256 reference with 64 lowercase hex digits and no tag/,
    );
  }
  assert.throws(
    () => validateImageReference(null, 'CUSTOM_NAME'),
    /CUSTOM_NAME must be a registry\/path@sha256 reference with 64 lowercase hex digits and no tag/,
  );
  assert.throws(
    () => validateImageReference(null, '   '),
    /image must be a registry\/path@sha256 reference with 64 lowercase hex digits and no tag/,
  );
});

test('checkReleaseImages and checkReleaseImagesErrors reject non-object env', () => {
  for (const badEnv of [null, undefined, 'string', 123, []]) {
    assert.throws(
      () => checkReleaseImages(compose, badEnv),
      /env must be an object/,
    );
    const errors = checkReleaseImagesErrors(compose, badEnv);
    assert.deepEqual(errors, ['env must be an object']);
  }
});

test('checkReleaseImagesErrors returns all collected errors from compose and env', () => {
  const badCompose = { services: {} };
  const badEnv = { ACRES_CLIENT_IMAGE: 'invalid', ACRES_SERVER_IMAGE: 'invalid' };
  const errors = checkReleaseImagesErrors(badCompose, badEnv);
  assert.equal(Array.isArray(errors), true);
  assert.equal(errors.length, 6);
  assert.ok(errors.some((err) => err.includes('ACRES_CLIENT_IMAGE')));
  assert.ok(errors.some((err) => err.includes('ACRES_SERVER_IMAGE')));
});

test('parseCliArguments parses help and directory options', () => {
  assert.deepEqual(parseCliArguments(['--help'], '/base'), {
    showHelp: true,
    cwd: '/base',
  });
  assert.deepEqual(parseCliArguments(['-h'], '/base'), {
    showHelp: true,
    cwd: '/base',
  });
  assert.deepEqual(parseCliArguments(['--cwd', 'custom'], '/base'), {
    showHelp: false,
    cwd: path.resolve('/base', 'custom'),
  });
  assert.deepEqual(parseCliArguments(['--cwd=custom'], '/base'), {
    showHelp: false,
    cwd: path.resolve('/base', 'custom'),
  });
});

test('parseCliArguments rejects invalid options and inputs', () => {
  assert.throws(
    () => parseCliArguments(['--cwd'], '/base'),
    /cwd requires a non-empty directory path/,
  );
  assert.throws(
    () => parseCliArguments(['--cwd', ''], '/base'),
    /cwd requires a non-empty directory path/,
  );
  assert.throws(
    () => parseCliArguments(['--cwd', '-bad'], '/base'),
    /cwd requires a non-empty directory path/,
  );
  assert.throws(
    () => parseCliArguments(['--cwd= '], '/base'),
    /cwd requires a non-empty directory path/,
  );
  assert.throws(
    () => parseCliArguments(['--cwd', 'a', '--cwd', 'b'], '/base'),
    /cwd may be specified only once/,
  );
  assert.throws(
    () => parseCliArguments(['--unknown'], '/base'),
    /unsupported option or positional argument: --unknown/,
  );
  assert.throws(
    () => parseCliArguments(['positional'], '/base'),
    /unsupported option or positional argument: positional/,
  );
  assert.throws(
    () => parseCliArguments('not-an-array', '/base'),
    /arguments must be an array of strings/,
  );
  assert.throws(
    () => parseCliArguments([], ''),
    /cwd requires a non-empty path/,
  );
});

test('main execution handles help, clean pass, and errors', () => {
  const io = {
    logs: [],
    errors: [],
    log(msg) {
      this.logs.push(msg);
    },
    error(msg) {
      this.errors.push(msg);
    },
    reset() {
      this.logs = [];
      this.errors = [];
    },
  };

  // 1. --help prints usage and returns 0
  io.reset();
  const helpCode = main(['node', 'script.js', '--help'], io, {
    exitOnError: false,
  });
  assert.equal(helpCode, 0);
  assert.ok(io.logs.some((l) => l.includes('Usage:')));

  // 2. usage error returns 1
  io.reset();
  const usageCode = main(['node', 'script.js', '--unknown'], io, {
    exitOnError: false,
  });
  assert.equal(usageCode, 1);
  assert.ok(io.errors.some((e) => e.includes('release image usage error')));

  // 3. missing compose file returns 1
  io.reset();
  const missingCode = main(
    ['node', 'script.js', '--cwd', 'nonexistent-dir'],
    io,
    { exitOnError: false },
  );
  assert.equal(missingCode, 1);
  assert.ok(
    io.errors.some((e) =>
      e.includes('unable to read or parse infra/compose/docker-compose.production.example.yml'),
    ),
  );

  // 4. missing required env variables returns 1 without crashing
  io.reset();
  const noEnvCode = main(['node', 'script.js'], io, {
    exitOnError: false,
    env: {},
  });
  assert.equal(noEnvCode, 1);
  assert.ok(
    io.errors.some((e) =>
      e.includes('ACRES_CLIENT_IMAGE must be a registry/path@sha256 reference'),
    ),
  );

  // 5. valid compose and env returns 0
  io.reset();
  const passCode = main(['node', 'script.js'], io, {
    exitOnError: false,
    env,
  });
  assert.equal(passCode, 0);
  assert.ok(io.logs.some((l) => l.includes('release image check passed')));
});
