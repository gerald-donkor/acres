'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { checkVercelConfig } = require('./check-vercel-config');

const rootVercelJsonPath = path.resolve(__dirname, '../../vercel.json');
const readVercelJson = () => JSON.parse(fs.readFileSync(rootVercelJsonPath, 'utf8'));

test('root vercel.json exists and passes checkVercelConfig', () => {
  assert.equal(fs.existsSync(rootVercelJsonPath), true, 'vercel.json must exist');
  const config = readVercelJson();
  const errors = checkVercelConfig(config);
  assert.deepEqual(errors, []);
});

test('rejects non-object or missing $schema', () => {
  assert.deepEqual(checkVercelConfig(null), ['vercel.json must be a non-null object']);
  assert.deepEqual(checkVercelConfig([]), ['vercel.json must be a non-null object']);

  const cfg = readVercelJson();
  delete cfg.$schema;
  assert.ok(checkVercelConfig(cfg).some((e) => e.includes('$schema')));
});

test('validates client service configuration and bindings', () => {
  const cfg = readVercelJson();
  cfg.services.client.root = 'other';
  assert.ok(checkVercelConfig(cfg).some((e) => e.includes('services.client.root')));

  const cfg2 = readVercelJson();
  cfg2.services.client.framework = 'express';
  assert.ok(checkVercelConfig(cfg2).some((e) => e.includes('services.client.framework')));

  const cfg3 = readVercelJson();
  cfg3.services.client.bindings = [];
  assert.ok(checkVercelConfig(cfg3).some((e) => e.includes('ACRES_API_ORIGIN')));
});

test('validates api service, region pinning, and function durations', () => {
  const cfg = readVercelJson();
  cfg.services.api.framework = 'express';
  assert.ok(checkVercelConfig(cfg).some((e) => e.includes('services.api.framework')));

  const cfg1 = readVercelJson();
  cfg1.services.api.functions['src/main.ts'].regions = ['sfo1'];
  assert.ok(checkVercelConfig(cfg1).some((e) => e.includes('must pin region "iad1"')));

  const cfg2 = readVercelJson();
  cfg2.services.api.functions['src/main.ts'].maxDuration = 10;
  assert.ok(checkVercelConfig(cfg2).some((e) => e.includes('maxDuration must be 30 or 60')));

  const cfg3 = readVercelJson();
  cfg3.services.api.functions['src/vercel/dispatch.function.ts'].maxDuration = 30;
  assert.ok(checkVercelConfig(cfg3).some((e) => e.includes('maxDuration must be 60')));
});

test('jobs function rejects maxDeliveries to let durable ledger govern retries', () => {
  const cfg = readVercelJson();
  cfg.services.api.functions['src/vercel/jobs.function.ts'].experimentalTriggers[0].maxDeliveries = 4;
  const errors = checkVercelConfig(cfg);
  assert.ok(
    errors.some((e) => e.includes('must omit maxDeliveries')),
    'expected error about maxDeliveries',
  );
});

test('rewrites route /cron/dispatch to api before /(.*) to client', () => {
  const cfg = readVercelJson();
  // Reverse rewrite order
  cfg.rewrites.reverse();
  const errors = checkVercelConfig(cfg);
  assert.ok(errors.some((e) => e.includes('must precede')));
});
