const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

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
