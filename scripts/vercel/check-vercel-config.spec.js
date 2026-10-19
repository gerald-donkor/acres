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

test('root optimizer accepts the real Next loader widths, qualities and source query', async () => {
  const { default: nextConfig } = await import('../../client/next.config.ts');
  const { imageConfigDefault } = require('next/dist/shared/lib/image-config');
  const { getImgProps } = require('next/dist/shared/lib/get-img-props');
  const { default: defaultLoader } = require('next/dist/shared/lib/image-loader');
  const cfg = readVercelJson();
  const imageConfig = { ...imageConfigDefault, ...nextConfig.images };
  assert.deepEqual(
    new Set(cfg.images.sizes),
    new Set([...imageConfig.deviceSizes, ...imageConfig.imageSizes]),
  );
  assert.deepEqual(cfg.images.qualities, imageConfig.qualities);
  for (const quality of imageConfig.qualities) {
    const source = '/assets/ui/landing/report-device-desktop.webp';
    const { props } = getImgProps(
      {
        src: source,
        width: 1810,
        height: 1288,
        sizes: '100vw',
        quality,
        alt: '',
      },
      { imgConf: imageConfig, defaultLoader },
    );
    for (const candidate of props.srcSet.split(', ')) {
      const request = new URL(candidate.split(' ')[0], 'https://preview.invalid');
      const route = cfg.rewrites.find((r) => r.source === request.pathname || r.source === '/(.*)');
      // A service catch-all sends this URL to the Next 404. It must reach
      // the deployment-level native optimizer, with its query untouched.
      assert.equal(route.destination, '/_vercel/image');
      const optimized = new URL(route.destination + request.search, request.origin);
      assert.equal(optimized.searchParams.get('url'), source);
      assert.ok(cfg.images.sizes.includes(Number(optimized.searchParams.get('w'))));
      assert.ok(cfg.images.qualities.includes(Number(optimized.searchParams.get('q'))));
      assert.match(source, new RegExp(cfg.images.localPatterns[0].pathname));
    }
  }
});

test('rejects missing root metadata, widened remote sources and shadowed optimizer routing', () => {
  for (const mutate of [
    (c) => {
      delete c.images;
    },
    (c) => {
      c.images.sizes = [];
    },
    (c) => {
      c.images.qualities = [75];
    },
    (c) => {
      c.images.remotePatterns = [{ hostname: 'example.com' }];
    },
    (c) => {
      c.images.localPatterns = [];
    },
    (c) => {
      c.rewrites = c.rewrites.filter((r) => r.source !== '/_next/image');
    },
    (c) => {
      c.rewrites.push(c.rewrites.splice(1, 1)[0]);
    },
    (c) => {
      c.rewrites[1].destination = { service: 'client' };
    },
  ]) {
    const cfg = readVercelJson();
    mutate(cfg);
    assert.ok(checkVercelConfig(cfg).length > 0);
  }
});
