const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const {
  DEFAULT_SLO_TARGETS,
  calculatePercentile,
  calculateDistribution,
  evaluateSloCompliance,
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

test('generateSyntheticWorkload: produces deterministic, reproducible distribution meeting SLOs', () => {
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
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
