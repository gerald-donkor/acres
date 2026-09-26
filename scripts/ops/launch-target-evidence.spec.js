const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { safeUrl, targetId, readBoundedJson, validHealthProbes, validDatabaseTelemetry } = require('./launch-target-evidence');

const now = Date.now();
const target = targetId('http://127.0.0.1:3001/health');
const baseline = {
  source: 'prometheus-live-scrape', targetId: target, probeHealthy: true,
  timestamp: new Date(now).toISOString(),
  postgresExporter: { up: 1, lastScrapeError: 0 },
  postgresServer: { pgUp: 1, maxConnections: 100, activeConnections: 6 },
  connectionPool: {
    api: { totalConnections: 10, idleConnections: 8, maxConnections: 20, requestsWaiting: 0 },
    worker: { totalConnections: 5, idleConnections: 4, maxConnections: 10, requestsWaiting: 0 },
  },
  poolAcquisitionLatency: {
    api: { p50Ms: 1, p95Ms: 2, p99Ms: 3 }, worker: { p50Ms: 1, p95Ms: 2, p99Ms: 3 },
  },
  queryExecutionDuration: {
    api: { p50Ms: 5, p95Ms: 10, p99Ms: 20 }, worker: { p50Ms: 5, p95Ms: 10, p99Ms: 20 },
  },
  serverActivity: { lockWaits: 0, maxTransactionDurationSec: 0.1 },
};

test('target URLs exclude credentials and query or fragment secrets', () => {
  assert.equal(safeUrl('https://example.org/health'), 'https://example.org/health');
  for (const url of ['file:///tmp/x', 'https://u:p@example.org/', 'https://example.org/?token=x', 'https://example.org/#token']) {
    assert.throws(() => safeUrl(url));
  }
});

test('fresh complete telemetry bound to the benchmark target passes', () => {
  assert.equal(validDatabaseTelemetry(baseline, target, now, now), true);
});

test('missing, stale, mismatched, unhealthy and malformed telemetry fail closed', () => {
  const changed = (patch) => ({ ...baseline, ...patch });
  for (const input of [null, changed({ timestamp: new Date(now - 120000).toISOString() }),
    changed({ targetId: targetId('https://other.example/') }), changed({ probeHealthy: false }),
    changed({ postgresExporter: { up: 0, lastScrapeError: 0 } }),
    changed({ connectionPool: { ...baseline.connectionPool, api: { ...baseline.connectionPool.api, requestsWaiting: 1 } } }),
    changed({ queryExecutionDuration: { ...baseline.queryExecutionDuration, api: { ...baseline.queryExecutionDuration.api, p95Ms: Infinity } } }),
    changed({ serverActivity: { lockWaits: 1, maxTransactionDurationSec: 0.1 } })]) {
    assert.equal(validDatabaseTelemetry(input, target, now, now), false);
  }
});

test('telemetry input accepts bounded regular JSON only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-telemetry-'));
  try {
    const file = path.join(dir, 'telemetry.json');
    fs.writeFileSync(file, JSON.stringify(baseline));
    assert.equal(readBoundedJson(file).targetId, target);
    fs.writeFileSync(file, 'x'.repeat(65537));
    assert.throws(() => readBoundedJson(file), /64 KiB|bounded/);
    assert.throws(() => readBoundedJson(dir), /regular file/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('live readiness requires the Acres liveness and dependency envelope', () => {
  const live = JSON.stringify({ ok: true, data: { status: 'ok', service: 'acres-api', uptimeSeconds: 3 } });
  const ready = JSON.stringify({ ok: true, data: { status: 'ok', database: 'ok', storage: 'ok' } });
  assert.equal(validHealthProbes(live, ready), true);
  assert.equal(validHealthProbes('<html>ok</html>', ready), false);
  assert.equal(validHealthProbes(live, JSON.stringify({ ok: true, data: { status: 'ok', database: 'ok' } })), false);
  assert.equal(validHealthProbes(JSON.stringify({ ok: true, data: { status: 'ok', service: 'other', uptimeSeconds: 3 } }), ready), false);
});
