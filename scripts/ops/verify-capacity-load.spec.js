const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const {
  DEFAULT_SLO_TARGETS,
  calculatePercentile,
  calculateLatencySummary,
  calculateDistribution,
  evaluateSloCompliance,
  generateSyntheticDatabaseLatencies,
  generateSyntheticWorkload,
  evaluateCapacity,
} = require('./verify-capacity-load');

test('calculatePercentile: calculates correct percentiles across odd, even, and single-item sets', () => {
  assert.equal(calculatePercentile([], 50), 0);
  assert.equal(calculatePercentile([42], 50), 42);
  assert.equal(calculatePercentile([42], 99), 42);

  // 10 elements: 10, 20, 30, ..., 100
  const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(calculatePercentile(values, 50), 50);
  assert.equal(calculatePercentile(values, 90), 90);
  assert.equal(calculatePercentile(values, 95), 100);
  assert.equal(calculatePercentile(values, 99), 100);
  assert.equal(calculatePercentile(values, 0), 10);
  assert.equal(calculatePercentile(values, 100), 100);
});

test('calculateDistribution: computes accurate statistical metrics and preserves monotonicity', () => {
  const latencies = [20, 30, 40, 50, 60, 70, 80, 90, 100, 110];
  const dist = calculateDistribution(latencies, 10, 10, 1);

  assert.equal(dist.totalRequests, 10);
  assert.equal(dist.successfulRequests, 10);
  assert.equal(dist.failedRequests, 0);
  assert.equal(dist.availabilityPercent, 100);
  assert.equal(dist.throughputRps, 10);

  assert.equal(dist.latencyMs.min, 20);
  assert.equal(dist.latencyMs.p50, 60);
  assert.equal(dist.latencyMs.max, 110);
  assert.equal(dist.latencyMs.mean, 65);
  assert.ok(dist.latencyMs.stddev > 0);

  // Monotonicity invariant
  assert.ok(dist.latencyMs.min <= dist.latencyMs.p50);
  assert.ok(dist.latencyMs.p50 <= dist.latencyMs.p90);
  assert.ok(dist.latencyMs.p90 <= dist.latencyMs.p95);
  assert.ok(dist.latencyMs.p95 <= dist.latencyMs.p99);
  assert.ok(dist.latencyMs.p99 <= dist.latencyMs.max);
});

test('calculateDistribution: safely handles empty input without NaN', () => {
  const dist = calculateDistribution([], 0, 0, 1);
  assert.equal(dist.totalRequests, 0);
  assert.equal(dist.successfulRequests, 0);
  assert.equal(dist.failedRequests, 0);
  assert.equal(dist.availabilityPercent, 0);
  assert.equal(dist.throughputRps, 0);
  assert.equal(dist.latencyMs.min, 0);
  assert.equal(dist.latencyMs.mean, 0);
  assert.equal(dist.latencyMs.stddev, 0);
});

test('evaluateSloCompliance: passes when all Category 5 SLO targets are met', () => {
  const mockDistribution = {
    totalRequests: 1000,
    successfulRequests: 1000,
    failedRequests: 0,
    availabilityPercent: 100.0,
    throughputRps: 200.0,
    latencyMs: {
      min: 15.0,
      p50: 35.0,
      p90: 80.0,
      p95: 95.0,
      p99: 140.0,
      max: 180.0,
      mean: 40.0,
      stddev: 18.0,
    },
  };

  const res = evaluateSloCompliance(mockDistribution, DEFAULT_SLO_TARGETS);
  assert.equal(res.overallPassed, true);
  assert.equal(res.availabilityPassed, true);
  assert.equal(res.latencyPassed, true);
  assert.equal(res.throughputPassed, true);
  assert.equal(res.monotonicLatency, true);
  assert.equal(res.violations.length, 0);
});

test('evaluateSloCompliance: catches availability breach below 99.9%', () => {
  const mockDistribution = {
    totalRequests: 1000,
    successfulRequests: 990, // 99.0% < 99.9%
    failedRequests: 10,
    availabilityPercent: 99.0,
    throughputRps: 200.0,
    latencyMs: {
      min: 15,
      p50: 35,
      p90: 80,
      p95: 95,
      p99: 140,
      max: 180,
      mean: 40,
      stddev: 18,
    },
  };

  const res = evaluateSloCompliance(mockDistribution, DEFAULT_SLO_TARGETS);
  assert.equal(res.overallPassed, false);
  assert.equal(res.availabilityPassed, false);
  assert.ok(res.violations.some((v) => v.includes('Availability 99% breached target 99.9%')));
});

test('evaluateSloCompliance: catches p95 latency ceiling breach (> 500ms)', () => {
  const mockDistribution = {
    totalRequests: 1000,
    successfulRequests: 1000,
    failedRequests: 0,
    availabilityPercent: 100.0,
    throughputRps: 200.0,
    latencyMs: {
      min: 50,
      p50: 200,
      p90: 450,
      p95: 580, // > 500ms
      p99: 800,
      max: 1200,
      mean: 250,
      stddev: 120,
    },
  };

  const res = evaluateSloCompliance(mockDistribution, DEFAULT_SLO_TARGETS);
  assert.equal(res.overallPassed, false);
  assert.equal(res.latencyPassed, false);
  assert.ok(res.violations.some((v) => v.includes('p95 Latency 580ms breached ceiling 500ms')));
});

test('evaluateSloCompliance: catches capacity throughput drop (< 100 RPS)', () => {
  const mockDistribution = {
    totalRequests: 300,
    successfulRequests: 300,
    failedRequests: 0,
    availabilityPercent: 100.0,
    throughputRps: 60.0, // < 100 RPS
    latencyMs: {
      min: 10,
      p50: 30,
      p90: 70,
      p95: 85,
      p99: 110,
      max: 130,
      mean: 35,
      stddev: 15,
    },
  };

  const res = evaluateSloCompliance(mockDistribution, DEFAULT_SLO_TARGETS);
  assert.equal(res.overallPassed, false);
  assert.equal(res.throughputPassed, false);
  assert.ok(res.violations.some((v) => v.includes('Throughput 60 RPS fell below target 100 RPS')));
});

test('calculateLatencySummary: computes exact statistical percentiles and handles empty sets safely', () => {
  const empty = calculateLatencySummary([]);
  assert.equal(empty.min, 0);
  assert.equal(empty.mean, 0);
  assert.equal(empty.stddev, 0);

  const values = [5, 10, 15, 20, 25];
  const summary = calculateLatencySummary(values);
  assert.equal(summary.min, 5);
  assert.equal(summary.p50, 15);
  assert.equal(summary.max, 25);
  assert.equal(summary.mean, 15);
  assert.ok(summary.stddev > 0);
  assert.ok(summary.min <= summary.p50);
  assert.ok(summary.p50 <= summary.p90);
  assert.ok(summary.p90 <= summary.p95);
  assert.ok(summary.p95 <= summary.p99);
  assert.ok(summary.p99 <= summary.max);
});

test('evaluateSloCompliance: passes with valid database latency meeting Category 5 ceilings', () => {
  const mockDistribution = {
    totalRequests: 1000,
    successfulRequests: 1000,
    failedRequests: 0,
    availabilityPercent: 100.0,
    throughputRps: 200.0,
    latencyMs: {
      min: 10,
      p50: 30,
      p90: 70,
      p95: 85,
      p99: 110,
      max: 130,
      mean: 35,
      stddev: 15,
    },
    databaseLatency: {
      acquisitionLatencyMs: {
        min: 0.1,
        p50: 0.5,
        p90: 1.2,
        p95: 1.8,
        p99: 3.5,
        max: 5.0,
        mean: 0.6,
        stddev: 0.4,
      },
      queryLatencyMs: {
        min: 1.0,
        p50: 8.0,
        p90: 18.0,
        p95: 22.5,
        p99: 45.0,
        max: 60.0,
        mean: 9.5,
        stddev: 5.0,
      },
    },
  };

  const res = evaluateSloCompliance(mockDistribution, DEFAULT_SLO_TARGETS);
  assert.equal(res.overallPassed, true);
  assert.equal(res.databaseAcquisitionLatencyPassed, true);
  assert.equal(res.databaseQueryLatencyPassed, true);
  assert.equal(res.violations.length, 0);
});

test('evaluateSloCompliance: catches database pool acquisition latency ceiling breach (> 50ms)', () => {
  const mockDistribution = {
    totalRequests: 1000,
    successfulRequests: 1000,
    failedRequests: 0,
    availabilityPercent: 100.0,
    throughputRps: 200.0,
    latencyMs: {
      min: 10,
      p50: 30,
      p90: 70,
      p95: 85,
      p99: 110,
      max: 130,
      mean: 35,
      stddev: 15,
    },
    databaseLatency: {
      acquisitionLatencyMs: {
        min: 5.0,
        p50: 25.0,
        p90: 48.0,
        p95: 65.0, // > 50ms breach
        p99: 80.0,
        max: 95.0,
        mean: 28.0,
        stddev: 15.0,
      },
      queryLatencyMs: {
        min: 1.0,
        p50: 8.0,
        p90: 18.0,
        p95: 22.5,
        p99: 45.0,
        max: 60.0,
        mean: 9.5,
        stddev: 5.0,
      },
    },
  };

  const res = evaluateSloCompliance(mockDistribution, DEFAULT_SLO_TARGETS);
  assert.equal(res.overallPassed, false);
  assert.equal(res.databaseAcquisitionLatencyPassed, false);
  assert.ok(res.violations.some((v) => v.includes('Database pool acquisition p95 latency 65ms breached ceiling 50ms')));
});

test('evaluateSloCompliance: catches database SQL query execution latency ceiling breach (> 100ms)', () => {
  const mockDistribution = {
    totalRequests: 1000,
    successfulRequests: 1000,
    failedRequests: 0,
    availabilityPercent: 100.0,
    throughputRps: 200.0,
    latencyMs: {
      min: 10,
      p50: 30,
      p90: 70,
      p95: 85,
      p99: 110,
      max: 130,
      mean: 35,
      stddev: 15,
    },
    databaseLatency: {
      acquisitionLatencyMs: {
        min: 0.1,
        p50: 0.5,
        p90: 1.2,
        p95: 1.8,
        p99: 3.5,
        max: 5.0,
        mean: 0.6,
        stddev: 0.4,
      },
      queryLatencyMs: {
        min: 10.0,
        p50: 45.0,
        p90: 95.0,
        p95: 125.0, // > 100ms breach
        p99: 180.0,
        max: 220.0,
        mean: 55.0,
        stddev: 30.0,
      },
    },
  };

  const res = evaluateSloCompliance(mockDistribution, DEFAULT_SLO_TARGETS);
  assert.equal(res.overallPassed, false);
  assert.equal(res.databaseQueryLatencyPassed, false);
  assert.ok(res.violations.some((v) => v.includes('Database SQL query execution p95 latency 125ms breached ceiling 100ms')));
});

test('evaluateSloCompliance: catches non-monotonic database acquisition and query latencies', () => {
  const nonMonotonicAcq = {
    totalRequests: 1000,
    successfulRequests: 1000,
    failedRequests: 0,
    availabilityPercent: 100.0,
    throughputRps: 200.0,
    latencyMs: { min: 10, p50: 30, p90: 70, p95: 85, p99: 110, max: 130, mean: 35, stddev: 15 },
    databaseLatency: {
      acquisitionLatencyMs: { min: 10.0, p50: 25.0, p90: 5.0, p95: 30.0, p99: 40.0, max: 50.0, mean: 20.0, stddev: 10.0 }, // p90 < p50
      queryLatencyMs: { min: 1.0, p50: 8.0, p90: 18.0, p95: 22.5, p99: 45.0, max: 60.0, mean: 9.5, stddev: 5.0 },
    },
  };
  const resAcq = evaluateSloCompliance(nonMonotonicAcq, DEFAULT_SLO_TARGETS);
  assert.equal(resAcq.overallPassed, false);
  assert.equal(resAcq.monotonicDbAcquisition, false);
  assert.ok(resAcq.violations.some((v) => v.includes('Database pool acquisition latency violated monotonicity invariant')));

  const nonMonotonicQuery = {
    totalRequests: 1000,
    successfulRequests: 1000,
    failedRequests: 0,
    availabilityPercent: 100.0,
    throughputRps: 200.0,
    latencyMs: { min: 10, p50: 30, p90: 70, p95: 85, p99: 110, max: 130, mean: 35, stddev: 15 },
    databaseLatency: {
      acquisitionLatencyMs: { min: 0.1, p50: 0.5, p90: 1.2, p95: 1.8, p99: 3.5, max: 5.0, mean: 0.6, stddev: 0.4 },
      queryLatencyMs: { min: 20.0, p50: 15.0, p90: 40.0, p95: 50.0, p99: 80.0, max: 100.0, mean: 30.0, stddev: 15.0 }, // min > p50
    },
  };
  const resQuery = evaluateSloCompliance(nonMonotonicQuery, DEFAULT_SLO_TARGETS);
  assert.equal(resQuery.overallPassed, false);
  assert.equal(resQuery.monotonicDbQuery, false);
  assert.ok(resQuery.violations.some((v) => v.includes('Database SQL query execution latency violated monotonicity invariant')));
});

test('generateSyntheticDatabaseLatencies: produces deterministic, monotonic database latency distributions meeting SLOs', () => {
  const rng1 = () => 0.5;
  const db1 = generateSyntheticDatabaseLatencies({ databaseQueryCount: 50 }, rng1);
  assert.ok(db1.acquisitionLatencyMs.p95 <= 50, `Acquisition p95 ${db1.acquisitionLatencyMs.p95} <= 50ms`);
  assert.ok(db1.queryLatencyMs.p95 <= 100, `Query p95 ${db1.queryLatencyMs.p95} <= 100ms`);
  assert.ok(db1.acquisitionLatencyMs.min <= db1.acquisitionLatencyMs.p50);
  assert.ok(db1.acquisitionLatencyMs.p50 <= db1.acquisitionLatencyMs.p95);
  assert.ok(db1.queryLatencyMs.min <= db1.queryLatencyMs.p50);
  assert.ok(db1.queryLatencyMs.p50 <= db1.queryLatencyMs.p95);

  // Works without explicit rng parameter (PRNG fallback)
  const dbFallback = generateSyntheticDatabaseLatencies({ databaseQueryCount: 50, seed: 99 });
  assert.ok(dbFallback.acquisitionLatencyMs.p95 <= 50);
  assert.ok(dbFallback.queryLatencyMs.p95 <= 100);
});

test('generateSyntheticWorkload: produces deterministic, reproducible distribution meeting SLOs including database latency', () => {
  const run1 = generateSyntheticWorkload({ requestCount: 1000, durationSeconds: 5, seed: 12345 });
  const run2 = generateSyntheticWorkload({ requestCount: 1000, durationSeconds: 5, seed: 12345 });

  // Determinism check
  assert.deepEqual(run1, run2);

  // SLO check
  const compliance = evaluateSloCompliance(run1, DEFAULT_SLO_TARGETS);
  assert.equal(compliance.overallPassed, true);
  assert.equal(run1.totalRequests, 1000);
  assert.equal(run1.availabilityPercent, 100);
  assert.equal(run1.throughputRps, 200);
  assert.ok(run1.latencyMs.p95 < 250, `Expected p95 < 250ms, got ${run1.latencyMs.p95}ms`);

  // Database latency baseline checks
  assert.ok(run1.databaseLatency, 'databaseLatency should be populated');
  assert.ok(run1.databaseLatency.acquisitionLatencyMs.p95 <= 50, `Expected DB acquisition p95 <= 50ms, got ${run1.databaseLatency.acquisitionLatencyMs.p95}`);
  assert.ok(run1.databaseLatency.queryLatencyMs.p95 <= 100, `Expected DB query p95 <= 100ms, got ${run1.databaseLatency.queryLatencyMs.p95}`);
  assert.equal(compliance.databaseAcquisitionLatencyPassed, true);
  assert.equal(compliance.databaseQueryLatencyPassed, true);
});

test('evaluateCapacity: generates complete audit report and writes to disk when requested', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-capacity-test-'));
  try {
    const report = await evaluateCapacity({
      synthetic: true,
      requestCount: 500,
      durationSeconds: 2,
      saveReport: true,
      backupsDir: tmpDir,
    });

    assert.equal(report.mode, 'synthetic');
    assert.equal(report.compliance.overallPassed, true);
    assert.ok(report.reportPath);
    assert.ok(fs.existsSync(report.reportPath));

    const savedContent = JSON.parse(fs.readFileSync(report.reportPath, 'utf8'));
    assert.equal(savedContent.mode, 'synthetic');
    assert.equal(savedContent.compliance.overallPassed, true);
    assert.equal(savedContent.distribution.totalRequests, 500);
    assert.ok(savedContent.distribution.databaseLatency, 'saved report should include databaseLatency');
    assert.ok(savedContent.distribution.databaseLatency.acquisitionLatencyMs);
    assert.ok(savedContent.distribution.databaseLatency.queryLatencyMs);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
