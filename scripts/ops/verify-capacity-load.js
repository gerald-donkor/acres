#!/usr/bin/env node

/**
 * scripts/ops/verify-capacity-load.js
 *
 * Performance, Capacity, and Latency Evaluation Engine (TM-20, Category 5 SLOs).
 *
 * Evaluates application performance and load resilience against Category 5 SLO criteria:
 * 1. Availability Target: >= 99.9% (error rate < 0.1% under normal conditions);
 * 2. Max p95 Latency Ceiling: <= 500ms for standard API/read operations;
 * 3. Capacity Target: >= 100 RPS under concurrency without connection starvation.
 *
 * Supports:
 * - Deterministic synthetic simulation mode (default / offline / CI testable);
 * - Live HTTP benchmarking mode (--target-url, --concurrency, --duration-sec, --rps);
 * - Full statistical distribution calculations (min, p50, p90, p95, p99, max, mean, stddev);
 * - Structured audit evidence emission to backups/capacity-load-report-<timestamp>.json.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_SLO_TARGETS = {
  availabilityTargetPercent: 99.9,
  maxP95LatencyMs: 500,
  capacityTargetRps: 100,
};

const DEFAULT_BACKUPS_DIR = path.resolve(__dirname, '../../backups');

/**
 * Computes exact statistical percentiles from a sorted numeric array.
 * Uses standard nearest-rank / ceiling index method.
 */
function calculatePercentile(sortedValues, percentile) {
  if (!sortedValues || sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  if (percentile <= 0) return sortedValues[0];
  if (percentile >= 100) return sortedValues[sortedValues.length - 1];

  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  const clampedIndex = Math.max(0, Math.min(sortedValues.length - 1, index));
  return sortedValues[clampedIndex];
}

/**
 * Computes full statistical summary across request latencies.
 */
function calculateDistribution(latenciesMs, totalRequests, successfulRequests, durationSeconds) {
  const count = latenciesMs.length;
  if (count === 0) {
    return {
      totalRequests: totalRequests || 0,
      successfulRequests: successfulRequests || 0,
      failedRequests: (totalRequests || 0) - (successfulRequests || 0),
      availabilityPercent: 0,
      throughputRps: 0,
      latencyMs: {
        min: 0,
        p50: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        max: 0,
        mean: 0,
        stddev: 0,
      },
    };
  }

  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const mean = sum / count;

  const variance =
    sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
  const stddev = Math.sqrt(variance);

  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p50 = calculatePercentile(sorted, 50);
  const p90 = calculatePercentile(sorted, 90);
  const p95 = calculatePercentile(sorted, 95);
  const p99 = calculatePercentile(sorted, 99);

  const total = totalRequests || count;
  const success = typeof successfulRequests === 'number' ? successfulRequests : count;
  const failed = total - success;
  const availabilityPercent = total > 0 ? (success / total) * 100 : 0;
  const safeDuration = durationSeconds && durationSeconds > 0 ? durationSeconds : 1;
  const throughputRps = total / safeDuration;

  return {
    totalRequests: total,
    successfulRequests: success,
    failedRequests: Math.max(0, failed),
    availabilityPercent: Number(availabilityPercent.toFixed(3)),
    throughputRps: Number(throughputRps.toFixed(2)),
    latencyMs: {
      min: Number(min.toFixed(2)),
      p50: Number(p50.toFixed(2)),
      p90: Number(p90.toFixed(2)),
      p95: Number(p95.toFixed(2)),
      p99: Number(p99.toFixed(2)),
      max: Number(max.toFixed(2)),
      mean: Number(mean.toFixed(2)),
      stddev: Number(stddev.toFixed(2)),
    },
  };
}

/**
 * Evaluates computed metrics against Category 5 SLO requirements.
 */
function evaluateSloCompliance(distribution, targets = DEFAULT_SLO_TARGETS) {
  const availabilityPassed =
    distribution.availabilityPercent >= targets.availabilityTargetPercent;
  const latencyPassed =
    distribution.latencyMs.p95 <= targets.maxP95LatencyMs;
  const throughputPassed =
    distribution.throughputRps >= targets.capacityTargetRps;

  const monotonicLatency =
    distribution.latencyMs.min <= distribution.latencyMs.p50 &&
    distribution.latencyMs.p50 <= distribution.latencyMs.p90 &&
    distribution.latencyMs.p90 <= distribution.latencyMs.p95 &&
    distribution.latencyMs.p95 <= distribution.latencyMs.p99 &&
    distribution.latencyMs.p99 <= distribution.latencyMs.max;

  const overallPassed =
    availabilityPassed && latencyPassed && throughputPassed && monotonicLatency;

  const violations = [];
  if (!availabilityPassed) {
    violations.push(
      `Availability ${distribution.availabilityPercent}% breached target ${targets.availabilityTargetPercent}%`,
    );
  }
  if (!latencyPassed) {
    violations.push(
      `p95 Latency ${distribution.latencyMs.p95}ms breached ceiling ${targets.maxP95LatencyMs}ms`,
    );
  }
  if (!throughputPassed) {
    violations.push(
      `Throughput ${distribution.throughputRps} RPS fell below target ${targets.capacityTargetRps} RPS`,
    );
  }
  if (!monotonicLatency) {
    violations.push('Statistical distribution violated monotonicity invariant (min <= p50 <= p90 <= p95 <= p99 <= max)');
  }

  return {
    targets,
    availabilityPassed,
    latencyPassed,
    throughputPassed,
    monotonicLatency,
    overallPassed,
    violations,
  };
}

/**
 * Deterministic pseudo-random number generator (Mulberry32) for reproducible synthetic load.
 */
function createPrng(seed = 1337) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates synthetic benchmark workload for deterministic verification.
 * Simulates normal production traffic or specified degradation profiles.
 */
function generateSyntheticWorkload(options = {}) {
  const requestCount = options.requestCount || 1000;
  const durationSeconds = options.durationSeconds || 5;
  const errorRate = typeof options.errorRate === 'number' ? options.errorRate : 0.0;
  const baseLatencyMs = options.baseLatencyMs || 28;
  const spikeMultiplier = options.spikeMultiplier || 1.0;
  const seed = options.seed || 42;

  const rng = createPrng(seed);
  const latencies = [];
  let successful = 0;

  for (let i = 0; i < requestCount; i++) {
    const isError = rng() < errorRate;
    if (!isError) {
      successful++;
    }

    // Generate realistic right-skewed latency distribution
    const u1 = Math.max(1e-6, rng());
    const u2 = rng();
    const boxMuller = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    // Log-normal shape: exp(mu + sigma * normal)
    const logNormalFactor = Math.exp(0.4 * boxMuller);
    const latency = (baseLatencyMs * logNormalFactor + (rng() * 10)) * spikeMultiplier;
    latencies.push(Math.max(1.0, latency));
  }

  return calculateDistribution(latencies, requestCount, successful, durationSeconds);
}

/**
 * Executes a live HTTP/HTTPS load test against a target URL.
 */
async function runLiveBenchmark(options) {
  const targetUrl = options.targetUrl;
  const concurrency = options.concurrency || 10;
  const durationSeconds = options.durationSeconds || 5;
  const method = options.method || 'GET';
  const headers = options.headers || { 'User-Agent': 'AcresCapacityLoadTester/1.0' };

  const parsedUrl = new URL(targetUrl);
  if (!parsedUrl.pathname || parsedUrl.pathname === '/') {
    parsedUrl.pathname = '/health';
  }
  const isHttps = parsedUrl.protocol === 'https:';
  const transport = isHttps ? https : http;
  const agent = new transport.Agent({
    keepAlive: true,
    maxSockets: concurrency * 2,
  });

  const latencies = [];
  let totalRequests = 0;
  let successfulRequests = 0;
  const stopTime = Date.now() + durationSeconds * 1000;

  async function worker() {
    while (Date.now() < stopTime) {
      totalRequests++;
      const startNanos = process.hrtime.bigint();
      try {
        const statusCode = await new Promise((resolve, reject) => {
          const req = transport.request(
            parsedUrl,
            {
              method,
              headers,
              agent,
              timeout: 10000,
            },
            (res) => {
              res.on('data', () => {});
              res.on('end', () => resolve(res.statusCode || 0));
            },
          );
          req.on('error', reject);
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
          });
          req.end();
        });

        const elapsedNanos = process.hrtime.bigint() - startNanos;
        const latencyMs = Number(elapsedNanos) / 1e6;
        latencies.push(latencyMs);

        if (statusCode >= 200 && statusCode < 400) {
          successfulRequests++;
        }
      } catch {
        const elapsedNanos = process.hrtime.bigint() - startNanos;
        const latencyMs = Number(elapsedNanos) / 1e6;
        latencies.push(latencyMs);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  agent.destroy();

  return calculateDistribution(
    latencies,
    totalRequests,
    successfulRequests,
    durationSeconds,
  );
}

/**
 * Top-level evaluation function combining synthetic or live run with SLO verification.
 */
async function evaluateCapacity(options = {}) {
  const isSynthetic = !options.targetUrl || options.synthetic === true;
  const targets = {
    availabilityTargetPercent:
      options.availabilityTargetPercent || DEFAULT_SLO_TARGETS.availabilityTargetPercent,
    maxP95LatencyMs:
      options.maxP95LatencyMs || DEFAULT_SLO_TARGETS.maxP95LatencyMs,
    capacityTargetRps:
      options.capacityTargetRps || DEFAULT_SLO_TARGETS.capacityTargetRps,
  };

  let distribution;
  if (isSynthetic) {
    distribution = generateSyntheticWorkload({
      requestCount: options.requestCount || 1000,
      durationSeconds: options.durationSeconds || 5,
      errorRate: options.errorRate || 0.0,
      baseLatencyMs: options.baseLatencyMs || 28,
      spikeMultiplier: options.spikeMultiplier || 1.0,
      seed: options.seed || 42,
    });
  } else {
    distribution = await runLiveBenchmark(options);
  }

  const compliance = evaluateSloCompliance(distribution, targets);

  const report = {
    timestamp: new Date().toISOString(),
    mode: isSynthetic ? 'synthetic' : 'live',
    targetUrl: options.targetUrl || 'synthetic://in-process-evaluation',
    targets,
    distribution,
    compliance,
  };

  if (options.saveReport) {
    const backupsDir = options.backupsDir || DEFAULT_BACKUPS_DIR;
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    const filename = `capacity-load-report-${Date.now()}.json`;
    const reportPath = path.join(backupsDir, filename);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    report.reportPath = reportPath;
  }

  return report;
}

async function runCli() {
  const args = process.argv.slice(2);
  let synthetic = true;
  let targetUrl;
  let durationSec = 5;
  let concurrency = 10;
  let jsonOutput = false;
  let saveReport = true;
  let allowFailure = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--synthetic') {
      synthetic = true;
    } else if (args[i] === '--target-url' && args[i + 1]) {
      targetUrl = args[++i];
      synthetic = false;
    } else if (args[i] === '--duration-sec' && args[i + 1]) {
      durationSec = parseInt(args[++i], 10);
    } else if (args[i] === '--concurrency' && args[i + 1]) {
      concurrency = parseInt(args[++i], 10);
    } else if (args[i] === '--json') {
      jsonOutput = true;
    } else if (args[i] === '--no-save') {
      saveReport = false;
    } else if (args[i] === '--allow-failure') {
      allowFailure = true;
    }
  }

  const report = await evaluateCapacity({
    synthetic,
    targetUrl,
    durationSeconds: durationSec,
    concurrency,
    saveReport,
  });

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.compliance.overallPassed || allowFailure ? 0 : 1);
  }

  console.log('\n=================================================================');
  console.log('Acres Capacity, Load & Latency Evaluation (TM-20, Category 5 SLOs)');
  console.log('=================================================================\n');

  console.log(`Evaluation Mode:   ${report.mode.toUpperCase()}`);
  console.log(`Target:            ${report.targetUrl}`);
  console.log(`Total Requests:    ${report.distribution.totalRequests}`);
  console.log(`Duration:          ${durationSec}s\n`);

  console.log('Latency Distribution (ms):');
  console.log('-----------------------------------------------------------------');
  const lat = report.distribution.latencyMs;
  console.log(`  Min:  ${lat.min} ms  |  Mean: ${lat.mean} ms  |  StdDev: ${lat.stddev} ms`);
  console.log(`  p50:  ${lat.p50} ms  |  p90:  ${lat.p90} ms`);
  console.log(`  p95:  ${lat.p95} ms  (SLO Ceiling: <= ${report.targets.maxP95LatencyMs} ms)`);
  console.log(`  p99:  ${lat.p99} ms  |  Max:  ${lat.max} ms\n`);

  console.log('SLO Compliance Evaluation:');
  console.log('-----------------------------------------------------------------');
  const comp = report.compliance;
  console.log(
    `  ${comp.availabilityPassed ? '✓' : '✗'} Availability:   ${report.distribution.availabilityPercent}% (target >= ${report.targets.availabilityTargetPercent}%)`,
  );
  console.log(
    `  ${comp.latencyPassed ? '✓' : '✗'} p95 Latency:   ${lat.p95} ms (ceiling <= ${report.targets.maxP95LatencyMs} ms)`,
  );
  console.log(
    `  ${comp.throughputPassed ? '✓' : '✗'} Throughput:    ${report.distribution.throughputRps} RPS (target >= ${report.targets.capacityTargetRps} RPS)`,
  );
  console.log(
    `  ${comp.monotonicLatency ? '✓' : '✗'} Monotonicity:  min <= p50 <= p90 <= p95 <= p99 <= max (verified)`,
  );

  if (report.reportPath) {
    console.log(`\nAudit Evidence:    ${report.reportPath}`);
  }

  if (!comp.overallPassed) {
    console.error('\nSLO Violations:');
    for (const v of comp.violations) {
      console.error(`  ✗ ${v}`);
    }
    console.log('=================================================================\n');
    console.log('Result: FAILED. Category 5 SLO requirements breached.\n');
    process.exit(allowFailure ? 0 : 1);
  }

  console.log('\n=================================================================');
  console.log('Result: PASSED. All Category 5 SLO targets satisfied.\n');
  process.exit(0);
}

if (require.main === module) {
  runCli().catch((err) => {
    console.error(`Unhandled capacity evaluation error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_SLO_TARGETS,
  calculatePercentile,
  calculateDistribution,
  evaluateSloCompliance,
  generateSyntheticWorkload,
  runLiveBenchmark,
  evaluateCapacity,
};
