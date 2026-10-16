'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const SCRIPT_PATH = path.resolve(__dirname, 'verify-managed-ingress.js');
const ROOT_VERCEL_CONFIG = path.resolve(__dirname, '../../vercel.json');
const { evaluateManagedIngress, parseArgs } = require('./verify-managed-ingress');

test('verify-managed-ingress CLI: --help and -h display usage and exit 0', () => {
  for (const flag of ['--help', '-h']) {
    const res = spawnSync(process.execPath, [SCRIPT_PATH, flag], {
      encoding: 'utf8',
    });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Usage: node scripts\/ops\/verify-managed-ingress\.js --output <file>/);
    assert.equal(res.stderr, '');
  }
});

test('verify-managed-ingress CLI: missing --output exits 1 with error message', () => {
  const res = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: 'utf8',
  });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --output <file> is required/);
});

test('verify-managed-ingress parseArgs: parses --output, -o, and --vercel-config variations', () => {
  const p1 = parseArgs(['--output', 'foo.json']);
  assert.equal(p1.output, path.resolve('foo.json'));
  assert.equal(p1.vercelConfigPath, ROOT_VERCEL_CONFIG);

  const p2 = parseArgs(['-o', 'bar.json']);
  assert.equal(p2.output, path.resolve('bar.json'));

  const p3 = parseArgs(['--output=baz.json']);
  assert.equal(p3.output, path.resolve('baz.json'));

  const p4 = parseArgs(['-o=qux.json']);
  assert.equal(p4.output, path.resolve('qux.json'));

  const p5 = parseArgs(['--output', 'out.json', '--vercel-config', 'custom.json']);
  assert.equal(p5.output, path.resolve('out.json'));
  assert.equal(p5.vercelConfigPath, path.resolve('custom.json'));

  const p6 = parseArgs(['-o', 'out.json', '--vercel-config=custom.json']);
  assert.equal(p6.output, path.resolve('out.json'));
  assert.equal(p6.vercelConfigPath, path.resolve('custom.json'));
});

test('verify-managed-ingress evaluateManagedIngress: returns error when config file does not exist', () => {
  const missingPath = path.join(os.tmpdir(), `nonexistent-vercel-${Date.now()}.json`);
  const result = evaluateManagedIngress(missingPath);

  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Configuration file not found/);
});

test('verify-managed-ingress evaluateManagedIngress: returns error when config file is invalid JSON', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-ingress-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const invalidJsonPath = path.join(tmpDir, 'invalid.json');
  fs.writeFileSync(invalidJsonPath, 'NOT_VALID_JSON{', 'utf8');

  const result = evaluateManagedIngress(invalidJsonPath);
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Failed to parse configuration/);
});

test('verify-managed-ingress evaluateManagedIngress: validates against repository root vercel.json', () => {
  assert.ok(fs.existsSync(ROOT_VERCEL_CONFIG), 'vercel.json must exist in repo root');

  const result = evaluateManagedIngress(ROOT_VERCEL_CONFIG);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.hasClient, true);
  assert.equal(result.hasApi, true);
  assert.equal(result.routesEvaluated, 12);
  assert.equal(result.routesPassed, 12);
});

test('verify-managed-ingress evaluateManagedIngress: fails closed when client or api service is missing', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-ingress-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const baseConfig = JSON.parse(fs.readFileSync(ROOT_VERCEL_CONFIG, 'utf8'));

  // Missing client
  const missingClientConfig = JSON.parse(JSON.stringify(baseConfig));
  delete missingClientConfig.services.client;
  const clientPath = path.join(tmpDir, 'no-client.json');
  fs.writeFileSync(clientPath, JSON.stringify(missingClientConfig), 'utf8');

  const clientRes = evaluateManagedIngress(clientPath);
  assert.equal(clientRes.valid, false);
  assert.equal(clientRes.hasClient, false);
  assert.ok(
    clientRes.errors.some((e) =>
      e.includes('Multi-service configuration must define both client and api services') ||
      e.includes('services.client must be defined'),
    ),
  );

  // Missing api
  const missingApiConfig = JSON.parse(JSON.stringify(baseConfig));
  delete missingApiConfig.services.api;
  const apiPath = path.join(tmpDir, 'no-api.json');
  fs.writeFileSync(apiPath, JSON.stringify(missingApiConfig), 'utf8');

  const apiRes = evaluateManagedIngress(apiPath);
  assert.equal(apiRes.valid, false);
  assert.equal(apiRes.hasApi, false);
  assert.ok(
    apiRes.errors.some((e) =>
      e.includes('Multi-service configuration must define both client and api services') ||
      e.includes('services.api must be defined'),
    ),
  );
});

test('verify-managed-ingress evaluateManagedIngress: fails closed when rewrites lack cron dispatch or catch-all client', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-ingress-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const baseConfig = JSON.parse(fs.readFileSync(ROOT_VERCEL_CONFIG, 'utf8'));

  // Without cron rewrite
  const noCronConfig = JSON.parse(JSON.stringify(baseConfig));
  noCronConfig.rewrites = noCronConfig.rewrites.filter((r) => r.source !== '/cron/dispatch');
  const noCronPath = path.join(tmpDir, 'no-cron.json');
  fs.writeFileSync(noCronPath, JSON.stringify(noCronConfig), 'utf8');

  const noCronRes = evaluateManagedIngress(noCronPath);
  assert.equal(noCronRes.valid, false);
  assert.ok(
    noCronRes.errors.some((e) =>
      e.includes('Cron dispatch rewrite must exist and precede catch-all client rewrite'),
    ),
  );

  // Without catch-all client rewrite
  const noClientRewriteConfig = JSON.parse(JSON.stringify(baseConfig));
  noClientRewriteConfig.rewrites = noClientRewriteConfig.rewrites.filter((r) => r.source !== '/(.*)');
  const noClientPath = path.join(tmpDir, 'no-client-rewrite.json');
  fs.writeFileSync(noClientPath, JSON.stringify(noClientRewriteConfig), 'utf8');

  const noClientRes = evaluateManagedIngress(noClientPath);
  assert.equal(noClientRes.valid, false);
  assert.ok(
    noClientRes.errors.some((e) =>
      e.includes('Cron dispatch rewrite must exist and precede catch-all client rewrite'),
    ),
  );
});

test('verify-managed-ingress evaluateManagedIngress: fails closed when cron rewrite does not precede client catch-all', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-ingress-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const baseConfig = JSON.parse(fs.readFileSync(ROOT_VERCEL_CONFIG, 'utf8'));
  const invertedConfig = JSON.parse(JSON.stringify(baseConfig));
  // Invert order: client catch-all first, cron dispatch second
  invertedConfig.rewrites = [
    {
      source: '/(.*)',
      destination: { service: 'client' },
    },
    {
      source: '/cron/dispatch',
      destination: {
        service: 'api',
        path: '/src/vercel/dispatch.function.ts',
      },
    },
  ];

  const invertedPath = path.join(tmpDir, 'inverted.json');
  fs.writeFileSync(invertedPath, JSON.stringify(invertedConfig), 'utf8');

  const result = evaluateManagedIngress(invertedPath);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) =>
      e.includes('Cron dispatch rewrite must exist and precede catch-all client rewrite') ||
      e.includes('rewrites "/cron/dispatch" must precede "/(.*)"'),
    ),
  );
});

test('verify-managed-ingress CLI execution: generates valid receipt in nested directory and satisfies dossier expectations', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-ingress-cli-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const receiptPath = path.join(tmpDir, 'nested/sub/managed-ingress-deployment-receipt.json');

  const res = spawnSync(
    process.execPath,
    [SCRIPT_PATH, '--output', receiptPath, '--vercel-config', ROOT_VERCEL_CONFIG],
    { encoding: 'utf8' },
  );

  assert.equal(res.status, 0, `Expected 0 exit, stderr: ${res.stderr}`);
  assert.match(res.stdout, /Managed ingress and deployment preflight verified\./);
  assert.ok(fs.existsSync(receiptPath), 'Receipt file must exist');

  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));

  assert.equal(receipt.drill_type, 'managed_ingress_deployment_verification');
  assert.equal(receipt.status, 'success');
  assert.equal(receipt.valid, true);
  assert.equal(receipt.target_architecture, 'vercel-managed-production');
  assert.equal(receipt.execution_mode, 'simulation');
  assert.equal(receipt.routing_verified, true);
  assert.equal(receipt.services_verified, true);
  assert.equal(receipt.rollback_procedure_verified, true);
  assert.equal(receipt.preview_deployment_verified, true);
  assert.equal(receipt.routes_evaluated, 12);
  assert.equal(receipt.routes_passed, 12);
  assert.deepEqual(receipt.errors, []);
  assert.ok(receipt.timestamp);
  assert.ok(receipt.drill_timestamp);
});

test('verify-managed-ingress CLI execution: fails closed with exit code 1 when given invalid config', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-ingress-cli-err-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const invalidConfig = path.join(tmpDir, 'bad-config.json');
  fs.writeFileSync(invalidConfig, JSON.stringify({ services: {} }), 'utf8');

  const receiptPath = path.join(tmpDir, 'receipt.json');

  const res = spawnSync(
    process.execPath,
    [SCRIPT_PATH, '--output', receiptPath, '--vercel-config', invalidConfig],
    { encoding: 'utf8' },
  );

  assert.equal(res.status, 1);
  assert.match(res.stderr, /Managed ingress verification failed:/);
  assert.equal(fs.existsSync(receiptPath), false);
});
