const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function targetId(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function safeUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error('target URL is invalid'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname ||
      url.username || url.password || url.search || url.hash ||
      /[\x00-\x1f\x7f]/.test(value)) {
    throw new Error('target URL must be HTTP(S) without credentials, query, fragment, or controls');
  }
  return url.href;
}

function fileId(value) {
  try { return targetId(fs.realpathSync(value)); }
  catch { return targetId(path.resolve(value)); }
}

function readBoundedJson(file) {
  if (!file) throw new Error('evidence file missing');
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 65536) throw new Error('evidence file is not a bounded regular file');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  const bytes = Buffer.alloc(65537);
  let used = 0;
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.size > 65536) throw new Error('evidence file is not a bounded regular file');
    while (used < bytes.length) {
      const count = fs.readSync(fd, bytes, used, bytes.length - used, null);
      if (count === 0) break;
      used += count;
    }
  } finally {
    fs.closeSync(fd);
  }
  if (used > 65536) throw new Error('evidence file exceeds 64 KiB');
  return JSON.parse(bytes.subarray(0, used).toString('utf8'));
}

function validHealthProbes(liveness, readiness) {
  try {
    const live = JSON.parse(liveness);
    const ready = JSON.parse(readiness);
    return live.ok === true && live.data?.status === 'ok' &&
      live.data?.service === 'acres-api' &&
      Number.isFinite(live.data?.uptimeSeconds) && live.data.uptimeSeconds >= 0 &&
      ready.ok === true && ready.data?.status === 'ok' &&
      ready.data?.database === 'ok' && ready.data?.storage === 'ok';
  } catch { return false; }
}

function validDatabaseTelemetry(evidence, expectedTarget, startedAt, endedAt) {
  if (!evidence || evidence.source !== 'prometheus-live-scrape' ||
      evidence.targetId !== expectedTarget || evidence.probeHealthy !== true ||
      typeof evidence.timestamp !== 'string') return false;
  const sampledAt = Date.parse(evidence.timestamp);
  if (!Number.isFinite(sampledAt) || sampledAt < startedAt - 60000 || sampledAt > endedAt + 60000) return false;
  const e = evidence;
  const finite = (n, min = 0) => typeof n === 'number' && Number.isFinite(n) && n >= min;
  if (e.postgresExporter?.up !== 1 || e.postgresExporter?.lastScrapeError !== 0 ||
      e.postgresServer?.pgUp !== 1 || !finite(e.postgresServer?.maxConnections, 1) ||
      !finite(e.postgresServer?.activeConnections) ||
      e.postgresServer.activeConnections > e.postgresServer.maxConnections ||
      e.serverActivity?.lockWaits !== 0 || !finite(e.serverActivity?.maxTransactionDurationSec)) return false;
  for (const role of ['api', 'worker']) {
    const pool = e.connectionPool?.[role];
    const acquisition = e.poolAcquisitionLatency?.[role];
    const query = e.queryExecutionDuration?.[role];
    if (!pool || !finite(pool.totalConnections) || !finite(pool.idleConnections) ||
        !finite(pool.maxConnections, 1) || pool.requestsWaiting !== 0 ||
        pool.totalConnections > pool.maxConnections || pool.idleConnections > pool.totalConnections ||
        !acquisition || !query ||
        ![acquisition.p50Ms, acquisition.p95Ms, acquisition.p99Ms, query.p50Ms, query.p95Ms, query.p99Ms].every((n) => finite(n)) ||
        acquisition.p50Ms > acquisition.p95Ms || acquisition.p95Ms > acquisition.p99Ms || acquisition.p95Ms > 50 ||
        query.p50Ms > query.p95Ms || query.p95Ms > query.p99Ms || query.p95Ms > 100) return false;
  }
  return true;
}

// Validate the narrow child receipt at the invocation boundary, not just its status.
function validDosEvidence(e, dryRun, expectedTarget, startedAt, endedAt) {
  if (!e || e.drill_type !== 'dos_resilience_drill' || e.status !== 'success' ||
      !Array.isArray(e.failures) || e.failures.length ||
      !Number.isSafeInteger(e.durationMs) || e.durationMs < 0 ||
      e.durationMs > endedAt - startedAt || typeof e.timestamp !== 'string') return false;
  const timestamp = Date.parse(e.timestamp);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== e.timestamp ||
      timestamp < startedAt || timestamp > endedAt) return false;
  for (const name of ['layer1_edge_ingress', 'layer2_in_process_throttling',
    'layer3_graphql_bounds', 'layer4_storage_bounds', 'layer5_anti_enumeration']) {
    if (e.layers?.[name]?.passed !== true) return false;
  }
  const b = e.layers?.layer6_rate_limiter_burst;
  if (!b) return false;
  const counts = ['attemptedRequests', 'throttledRequests', 'authRejectedRequests',
    'unexpectedResponses', 'transportFailures'];
  if (!counts.every(k => Number.isSafeInteger(b[k]) && b[k] >= 0 && b[k] <= 15)) return false;
  if (dryRun) return e.mode === 'simulated' && e.apiTargetId === null &&
    b.burstTestMode === 'skipped' && b.passed === null && counts.every(k => b[k] === 0) &&
    b.preHealthPassed === false && b.csrfHandshakePassed === false && b.postHealthPassed === false;
  return e.mode === 'live' && e.apiTargetId === expectedTarget &&
    b.burstTestMode === 'live' && b.passed === true && b.attemptedRequests > 0 &&
    b.throttledRequests > 0 && b.authRejectedRequests + b.throttledRequests === b.attemptedRequests &&
    b.unexpectedResponses === 0 && b.transportFailures === 0 &&
    b.preHealthPassed === true && b.csrfHandshakePassed === true && b.postHealthPassed === true;
}

module.exports = { targetId, safeUrl, fileId, readBoundedJson, validHealthProbes, validDatabaseTelemetry, validDosEvidence };
