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

function dosReceipt(dryRun = false) {
  return {
    timestamp: new Date(now).toISOString(), durationMs: 0, drill_type: 'dos_resilience_drill',
    status: 'success', failures: [], mode: dryRun ? 'simulated' : 'live',
    apiTargetId: dryRun ? null : target,
    layers: Object.fromEntries([
      ...['layer1_edge_ingress', 'layer2_in_process_throttling', 'layer3_graphql_bounds',
        'layer4_storage_bounds', 'layer5_anti_enumeration'].map(k => [k, { passed: true }]),
      ['layer6_rate_limiter_burst', { passed: dryRun ? null : true,
        burstTestMode: dryRun ? 'skipped' : 'live', attemptedRequests: dryRun ? 0 : 15,
        throttledRequests: dryRun ? 0 : 5, authRejectedRequests: dryRun ? 0 : 10,
        unexpectedResponses: 0, transportFailures: 0, preHealthPassed: !dryRun,
        csrfHandshakePassed: !dryRun, postHealthPassed: !dryRun }],
    ]),
  };
}

test('DoS receipts require complete invocation-bound live or skipped offline observations', () => {
  const { validDosEvidence } = require('./launch-target-evidence');
  assert.equal(validDosEvidence(dosReceipt(), false, target, now, now), true);
  assert.equal(validDosEvidence(dosReceipt(true), true, null, now, now), true);
  for (const mutation of [e => e.status = 'failed', e => e.drill_type = 'other',
    e => e.failures = ['failed'], e => e.failures = null, e => e.durationMs = -1,
    e => e.durationMs = 0.5, e => e.durationMs = 1, e => e.timestamp = '2026-02-30T00:00:00.000Z',
    e => e.timestamp = new Date(now - 1).toISOString(), e => e.timestamp = new Date(now + 1).toISOString(),
    e => e.apiTargetId = 'wrong', e => e.layers.layer1_edge_ingress.passed = false,
    e => e.layers.layer6_rate_limiter_burst.burstTestMode = 'skipped',
    e => e.layers.layer6_rate_limiter_burst.throttledRequests = 0,
    e => e.layers.layer6_rate_limiter_burst.authRejectedRequests = 11,
    e => e.layers.layer6_rate_limiter_burst.unexpectedResponses = 1,
    e => e.layers.layer6_rate_limiter_burst.transportFailures = 1,
    e => e.layers.layer6_rate_limiter_burst.preHealthPassed = false,
    e => e.layers.layer6_rate_limiter_burst.csrfHandshakePassed = false,
    e => e.layers.layer6_rate_limiter_burst.postHealthPassed = false,
    e => e.layers.layer6_rate_limiter_burst.attemptedRequests = 16,
    e => e.layers.layer6_rate_limiter_burst.attemptedRequests = '15']) {
    const e = dosReceipt(); mutation(e);
    assert.equal(validDosEvidence(e, false, target, now, now), false);
  }
  for (const mutation of [e => e.apiTargetId = target, e => e.mode = 'live',
    e => e.layers.layer6_rate_limiter_burst.passed = true,
    e => e.layers.layer6_rate_limiter_burst.attemptedRequests = 1,
    e => e.layers.layer6_rate_limiter_burst.csrfHandshakePassed = true]) {
    const e = dosReceipt(true); mutation(e);
    assert.equal(validDosEvidence(e, true, null, now, now), false);
  }
});
