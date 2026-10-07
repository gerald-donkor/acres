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
 * - Live HTTP benchmarking mode (--target-url, --concurrency, --duration-sec);
 * - Full statistical distribution calculations (min, p50, p90, p95, p99, max, mean, stddev);
 * - Structured audit evidence emission to backups/capacity-load-report-<uuid>.json.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { safeUrl, targetId } = require('./launch-target-evidence');

const DEFAULT_SLO_TARGETS = {
  availabilityTargetPercent: 99.9,
  maxP95LatencyMs: 500,
  capacityTargetRps: 100,
  maxDatabaseAcquisitionP95LatencyMs: 50,
  maxDatabaseQueryP95LatencyMs: 100,
};

const DEFAULT_BACKUPS_DIR = path.resolve(__dirname, '../../backups');

const HELP = `Usage: scripts/ops/verify-capacity-load.js [options]
  --synthetic                Offline deterministic evaluation (default)
  --target-url <url>          HTTP(S), no credentials, query, fragment or controls
  --duration-sec <integer>    1–300 seconds (default 5)
  --concurrency <integer>     1–100 workers (default 10)
  --output <file>             Absent exact destination, relative to caller cwd
  --json                     One report on stdout, without private paths
  --no-save                  Evaluate without filesystem work
  --allow-failure            Override only an evaluated SLO failure
  --help, -h                 Standalone help, without side effects
Value options accept separate or attached = values once. Attached dash-leading paths work.
Unknown/duplicate/missing/blank/control values and partial integers reject.
Synthetic/target and output/no-save conflict. No --rps pacing is implemented.
Standalone saving defaults to private UUID reports under installed backups/.
Bounds are engineering limits, not production capacity measurements.
Live benchmarking requires separate operator authorization. Synthetic results cannot approve launch.
`;

function valueString(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !/[\x00-\x1f\x7f-\x9f]/.test(value)
  );
}

function boundedInteger(value, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new Error('Invalid capacity invocation');
  return value;
}

function validateOptions(options) {
  const result = {
    ...options,
    durationSeconds: boundedInteger(
      options.durationSeconds === undefined ? 5 : options.durationSeconds,
      300,
    ),
    concurrency: boundedInteger(
      options.concurrency === undefined ? 10 : options.concurrency,
      100,
    ),
  };
  if (options.targetUrl !== undefined) {
    if (
      !valueString(options.targetUrl) ||
      options.targetUrl !== options.targetUrl.trim() ||
      /[?#]/.test(options.targetUrl) ||
      options.synthetic === true
    )
      throw new Error('Invalid capacity invocation');
    result.targetUrl = safeUrl(options.targetUrl);
  }
  if (options.outputFile !== undefined) {
    if (
      !options.saveReport ||
      !valueString(options.outputFile) ||
      options.outputFile.endsWith(path.sep)
    )
      throw new Error('Invalid capacity invocation');
  }
  return result;
}

function parseArgs(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0]))
    return { help: true };
  const booleans = new Map([
    ['--synthetic', 'synthetic'],
    ['--json', 'jsonOutput'],
    ['--no-save', 'noSave'],
    ['--allow-failure', 'allowFailure'],
  ]);
  const values = new Map([
    ['--target-url', 'targetUrl'],
    ['--duration-sec', 'durationSeconds'],
    ['--concurrency', 'concurrency'],
    ['--output', 'outputFile'],
  ]);
  const seen = new Set(),
    result = { saveReport: true };
  for (let i = 0; i < args.length; i++) {
    const at = args[i].indexOf('='),
      key = at < 0 ? args[i] : args[i].slice(0, at);
    if (seen.has(key)) throw new Error('Invalid capacity invocation');
    seen.add(key);
    if (booleans.has(key) && at < 0) {
      result[booleans.get(key)] = true;
    } else if (values.has(key)) {
      const value = at < 0 ? args[++i] : args[i].slice(at + 1);
      if (!valueString(value) || (at < 0 && value.startsWith('-')))
        throw new Error('Invalid capacity invocation');
      const name = values.get(key);
      if (name === 'durationSeconds' || name === 'concurrency') {
        if (!/^[0-9]+$/.test(value))
          throw new Error('Invalid capacity invocation');
        result[name] = Number(value);
      } else result[name] = value;
    } else throw new Error('Invalid capacity invocation');
  }
  result.saveReport = !result.noSave;
  return validateOptions(result);
}

function absent(file, io) {
  try {
    io.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw new Error('Report destination unavailable');
}

// Inspect every existing ancestor without following symlinks. This is advisory;
// exclusive open/link and boundary checks still enforce operation failures.
function parents(file, io, create = false) {
  const parent = path.dirname(file),
    chain = [];
  for (let current = parent; ; current = path.dirname(current)) {
    chain.unshift(current);
    if (current === path.dirname(current)) break;
  }
  let nearest;
  for (const current of chain) {
    let stat;
    try {
      stat = io.lstatSync(current);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (!stat && create) {
      io.mkdirSync(current, { mode: 0o700 });
      stat = io.lstatSync(current);
    }
    if (stat) {
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error('Report parent unavailable');
      io.accessSync(current, io.constants.X_OK);
      nearest = current;
    }
  }
  io.accessSync(nearest, io.constants.W_OK | io.constants.X_OK);
}

function preflightDestination(file, io) {
  if (!valueString(file) || file.endsWith(path.sep))
    throw new Error('Report destination unavailable');
  file = path.resolve(file);
  parents(file, io);
  absent(file, io);
  return file;
}

function publishReport(report, file, io, uuid, serialize) {
  let fd,
    owned = false,
    stage,
    identity;
  const cleanup = () => {
    let failed = false;
    if (fd !== undefined) {
      try {
        io.closeSync(fd);
        fd = undefined;
      } catch {
        failed = true;
      }
    }
    if (owned) {
      try {
        const stat = io.lstatSync(stage);
        if (
          identity &&
          (stat.dev !== identity.dev ||
            stat.ino !== identity.ino ||
            !stat.isFile())
        )
          throw new Error('Staging ownership changed');
        io.unlinkSync(stage);
        owned = false;
      } catch {
        failed = true;
      }
    }
    return !failed;
  };
  try {
    parents(file, io, true);
    absent(file, io);
    stage = path.join(path.dirname(file), `.capacity-report-${uuid()}.tmp`);
    fd = io.openSync(stage, 'wx', 0o600);
    owned = true; // Ownership precedes write, fstat and close failures.
    identity = io.fstatSync(fd);
    const serialized = serialize(report, null, 2);
    if (
      typeof serialized !== 'string' ||
      !isDeepStrictEqual(JSON.parse(serialized), report)
    )
      throw new Error('Report serialization failed');
    io.writeFileSync(fd, serialized, 'utf8');
    io.closeSync(fd);
    fd = undefined;
    parents(file, io);
    const stat = io.lstatSync(stage);
    if (
      !stat.isFile() ||
      stat.dev !== identity.dev ||
      stat.ino !== identity.ino
    )
      throw new Error('Staging ownership changed');
    const readback = io.readFileSync(stage, 'utf8');
    if (
      readback !== serialized ||
      !isDeepStrictEqual(JSON.parse(readback), report)
    )
      throw new Error('Report verification failed');
    parents(file, io);
    absent(file, io);
    io.linkSync(stage, file); // Atomic, exclusive, same-filesystem publication.
    if (!cleanup()) throw new Error('Report cleanup failed');
  } catch {
    cleanup();
    throw new Error('Report publication failed');
  }
}

function writeOutput(stream, value) {
  return new Promise((resolve, reject) => {
    stream.write(value, (error) =>
      error ? reject(new Error('Capacity output failed')) : resolve(),
    );
  });
}

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
 * Computes full statistical summary across a set of numeric latencies.
 */
function calculateLatencySummary(latenciesMs) {
  const count = (latenciesMs || []).length;
  if (count === 0) {
    return {
      min: 0,
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      max: 0,
      mean: 0,
      stddev: 0,
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

  return {
    min: Number(min.toFixed(2)),
    p50: Number(p50.toFixed(2)),
    p90: Number(p90.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    p99: Number(p99.toFixed(2)),
    max: Number(max.toFixed(2)),
    mean: Number(mean.toFixed(2)),
    stddev: Number(stddev.toFixed(2)),
  };
}

/**
 * Computes full statistical summary across request latencies.
 */
function calculateDistribution(
  latenciesMs,
  totalRequests,
  successfulRequests,
  durationSeconds,
  databaseLatency = null,
) {
  const count = latenciesMs.length;
  const total = totalRequests || count;
  const success =
    typeof successfulRequests === 'number' ? successfulRequests : count;
  const failed = total - success;
  const availabilityPercent = total > 0 ? (success / total) * 100 : 0;
  const safeDuration =
    durationSeconds && durationSeconds > 0 ? durationSeconds : 1;
  const throughputRps = total / safeDuration;

  const result = {
    totalRequests: total,
    successfulRequests: success,
    failedRequests: Math.max(0, failed),
    availabilityPercent: Number(availabilityPercent.toFixed(3)),
    throughputRps: Number(throughputRps.toFixed(2)),
    latencyMs: calculateLatencySummary(latenciesMs),
  };

  if (databaseLatency) {
    result.databaseLatency = databaseLatency;
  }

  return result;
}

/**
 * Evaluates computed metrics against Category 5 SLO requirements.
 */
function evaluateSloCompliance(distribution, targets = DEFAULT_SLO_TARGETS) {
  const availabilityPassed =
    distribution.availabilityPercent >= targets.availabilityTargetPercent;
  const latencyPassed = distribution.latencyMs.p95 <= targets.maxP95LatencyMs;
  const throughputPassed =
    distribution.throughputRps >= targets.capacityTargetRps;

  const monotonicLatency =
    distribution.latencyMs.min <= distribution.latencyMs.p50 &&
    distribution.latencyMs.p50 <= distribution.latencyMs.p90 &&
    distribution.latencyMs.p90 <= distribution.latencyMs.p95 &&
    distribution.latencyMs.p95 <= distribution.latencyMs.p99 &&
    distribution.latencyMs.p99 <= distribution.latencyMs.max;

  let databaseAcquisitionLatencyPassed = true;
  let databaseQueryLatencyPassed = true;
  let monotonicDbAcquisition = true;
  let monotonicDbQuery = true;

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
    violations.push(
      'Statistical distribution violated monotonicity invariant (min <= p50 <= p90 <= p95 <= p99 <= max)',
    );
  }

  if (distribution.databaseLatency) {
    const acq = distribution.databaseLatency.acquisitionLatencyMs;
    const qry = distribution.databaseLatency.queryLatencyMs;

    if (
      acq &&
      typeof acq.p95 === 'number' &&
      typeof targets.maxDatabaseAcquisitionP95LatencyMs === 'number'
    ) {
      databaseAcquisitionLatencyPassed =
        acq.p95 <= targets.maxDatabaseAcquisitionP95LatencyMs;
      if (!databaseAcquisitionLatencyPassed) {
        violations.push(
          `Database pool acquisition p95 latency ${acq.p95}ms breached ceiling ${targets.maxDatabaseAcquisitionP95LatencyMs}ms`,
        );
      }
      monotonicDbAcquisition =
        acq.min <= acq.p50 &&
        acq.p50 <= acq.p90 &&
        acq.p90 <= acq.p95 &&
        acq.p95 <= acq.p99 &&
        acq.p99 <= acq.max;
      if (!monotonicDbAcquisition) {
        violations.push(
          'Database pool acquisition latency violated monotonicity invariant',
        );
      }
    }

    if (
      qry &&
      typeof qry.p95 === 'number' &&
      typeof targets.maxDatabaseQueryP95LatencyMs === 'number'
    ) {
      databaseQueryLatencyPassed =
        qry.p95 <= targets.maxDatabaseQueryP95LatencyMs;
      if (!databaseQueryLatencyPassed) {
        violations.push(
          `Database SQL query execution p95 latency ${qry.p95}ms breached ceiling ${targets.maxDatabaseQueryP95LatencyMs}ms`,
        );
      }
      monotonicDbQuery =
        qry.min <= qry.p50 &&
        qry.p50 <= qry.p90 &&
        qry.p90 <= qry.p95 &&
        qry.p95 <= qry.p99 &&
        qry.p99 <= qry.max;
      if (!monotonicDbQuery) {
        violations.push(
          'Database SQL query execution latency violated monotonicity invariant',
        );
      }
    }
  }

  const overallPassed =
    availabilityPassed &&
    latencyPassed &&
    throughputPassed &&
    monotonicLatency &&
    databaseAcquisitionLatencyPassed &&
    databaseQueryLatencyPassed &&
    monotonicDbAcquisition &&
    monotonicDbQuery;

  return {
    targets,
    availabilityPassed,
    latencyPassed,
    throughputPassed,
    monotonicLatency,
    databaseAcquisitionLatencyPassed,
    databaseQueryLatencyPassed,
    monotonicDbAcquisition,
    monotonicDbQuery,
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
 * Generates synthetic database latency distributions for acquisition wait and query execution.
 * Simulates normal production baseline (~0.45ms base acquisition, p95 < 2ms; ~7.5ms base query, p95 < 25ms).
 */
function generateSyntheticDatabaseLatencies(options = {}, rng) {
  const prng = typeof rng === 'function' ? rng : createPrng(options.seed || 42);
  const queryCount = options.databaseQueryCount || options.requestCount || 1000;
  const acqBaseMs = options.baseDatabaseAcquisitionLatencyMs || 0.45;
  const queryBaseMs = options.baseDatabaseQueryLatencyMs || 7.5;
  const spikeMultiplier = options.spikeMultiplier || 1.0;
  const acqSpikeMultiplier =
    options.acquisitionSpikeMultiplier || spikeMultiplier;
  const querySpikeMultiplier = options.querySpikeMultiplier || spikeMultiplier;

  const acqLatencies = [];
  const queryLatencies = [];

  for (let i = 0; i < queryCount; i++) {
    const u1 = Math.max(1e-6, prng());
    const u2 = prng();
    const boxMuller =
      Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

    const acqLogFactor = Math.exp(0.3 * boxMuller);
    const acqLatency = Math.max(
      0.05,
      (acqBaseMs * acqLogFactor + prng() * 0.15) * acqSpikeMultiplier,
    );
    acqLatencies.push(acqLatency);

    const queryLogFactor = Math.exp(0.4 * boxMuller);
    const queryLatency = Math.max(
      0.5,
      (queryBaseMs * queryLogFactor + prng() * 2.0) * querySpikeMultiplier,
    );
    queryLatencies.push(queryLatency);
  }

  return {
    acquisitionLatencyMs: calculateLatencySummary(acqLatencies),
    queryLatencyMs: calculateLatencySummary(queryLatencies),
  };
}

/**
 * Generates synthetic benchmark workload for deterministic verification.
 * Simulates normal production traffic or specified degradation profiles.
 */
function generateSyntheticWorkload(options = {}) {
  const requestCount = options.requestCount || 1000;
  const durationSeconds = options.durationSeconds || 5;
  const errorRate =
    typeof options.errorRate === 'number' ? options.errorRate : 0.0;
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
    const boxMuller =
      Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    // Log-normal shape: exp(mu + sigma * normal)
    const logNormalFactor = Math.exp(0.4 * boxMuller);
    const latency =
      (baseLatencyMs * logNormalFactor + rng() * 10) * spikeMultiplier;
    latencies.push(Math.max(1.0, latency));
  }

  const databaseLatency = generateSyntheticDatabaseLatencies(options, rng);
  return calculateDistribution(
    latencies,
    requestCount,
    successful,
    durationSeconds,
    databaseLatency,
  );
}

/**
 * Executes a live HTTP/HTTPS load test against a target URL.
 */
async function runLiveBenchmark(options = {}) {
  options = validateOptions(options);
  if (!options.targetUrl) throw new Error('Invalid capacity invocation');
  return runValidatedLiveBenchmark(options);
}

async function runValidatedLiveBenchmark(options) {
  const targetUrl = options.targetUrl;
  const concurrency = options.concurrency;
  const durationSeconds = options.durationSeconds;
  const method = options.method || 'GET';
  const headers = options.headers || {
    'User-Agent': 'AcresCapacityLoadTester/1.0',
  };

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
async function evaluateCapacity(options = {}, dependencies = {}) {
  try {
    options = validateOptions(options);
    const io = dependencies.fs || fs;
    const uuid = dependencies.randomUUID || crypto.randomUUID;
    const destination = options.saveReport
      ? preflightDestination(
          options.outputFile ||
            path.join(
              options.backupsDir || DEFAULT_BACKUPS_DIR,
              `capacity-load-report-${uuid()}.json`,
            ),
          io,
        )
      : null;
    const isSynthetic = !options.targetUrl || options.synthetic === true;
    const targets = {
      availabilityTargetPercent:
        options.availabilityTargetPercent ||
        DEFAULT_SLO_TARGETS.availabilityTargetPercent,
      maxP95LatencyMs:
        options.maxP95LatencyMs || DEFAULT_SLO_TARGETS.maxP95LatencyMs,
      capacityTargetRps:
        options.capacityTargetRps || DEFAULT_SLO_TARGETS.capacityTargetRps,
      maxDatabaseAcquisitionP95LatencyMs:
        options.maxDatabaseAcquisitionP95LatencyMs ||
        DEFAULT_SLO_TARGETS.maxDatabaseAcquisitionP95LatencyMs,
      maxDatabaseQueryP95LatencyMs:
        options.maxDatabaseQueryP95LatencyMs ||
        DEFAULT_SLO_TARGETS.maxDatabaseQueryP95LatencyMs,
    };

    let distribution;
    if (isSynthetic) {
      distribution = (
        dependencies.generateSyntheticWorkload || generateSyntheticWorkload
      )({
        ...options,
        requestCount: options.requestCount || 1000,
        durationSeconds: options.durationSeconds || 5,
        errorRate: options.errorRate || 0.0,
        baseLatencyMs: options.baseLatencyMs || 28,
        spikeMultiplier: options.spikeMultiplier || 1.0,
        seed: options.seed || 42,
      });
    } else {
      distribution = await (
        dependencies.runLiveBenchmark || runValidatedLiveBenchmark
      )(options);
    }

    const compliance = evaluateSloCompliance(distribution, targets);

    const report = {
      timestamp: new Date().toISOString(),
      mode: isSynthetic ? 'synthetic' : 'live',
      targetUrl: options.targetUrl
        ? targetId(options.targetUrl)
        : 'synthetic://in-process-evaluation',
      targets,
      distribution,
      compliance,
    };

    if (destination) {
      publishReport(
        report,
        destination,
        io,
        uuid,
        dependencies.serialize || JSON.stringify,
      );
      report.reportPath = destination;
    }
    return report;
  } catch {
    throw new Error('Capacity evaluation or report publication failed');
  }
}

async function runCli(args = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(args);
  const output =
    dependencies.output || ((value) => writeOutput(process.stdout, value));
  if (options.help) {
    await output(HELP);
    return 0;
  }
  const report = await evaluateCapacity(options, dependencies);
  const { reportPath: _privatePath, ...publicReport } = report;
  if (options.jsonOutput) {
    await output(JSON.stringify(publicReport, null, 2) + '\n');
    return report.compliance.overallPassed || options.allowFailure ? 0 : 1;
  }
  const durationSec = options.durationSeconds;
  const lines = [];
  const console = {
    log: (line) => lines.push(line),
    error: (line) => lines.push(line),
  };
  console.log(
    '\n=================================================================',
  );
  console.log(
    'Acres Capacity, Load & Latency Evaluation (TM-20, Category 5 SLOs)',
  );
  console.log(
    '=================================================================\n',
  );

  console.log(`Evaluation Mode:   ${report.mode.toUpperCase()}`);
  console.log(`Target:            ${report.targetUrl}`);
  console.log(`Total Requests:    ${report.distribution.totalRequests}`);
  console.log(`Duration:          ${durationSec}s\n`);

  console.log('Latency Distribution (ms):');
  console.log(
    '-----------------------------------------------------------------',
  );
  const lat = report.distribution.latencyMs;
  console.log(
    `  Min:  ${lat.min} ms  |  Mean: ${lat.mean} ms  |  StdDev: ${lat.stddev} ms`,
  );
  console.log(`  p50:  ${lat.p50} ms  |  p90:  ${lat.p90} ms`);
  console.log(
    `  p95:  ${lat.p95} ms  (SLO Ceiling: <= ${report.targets.maxP95LatencyMs} ms)`,
  );
  console.log(`  p99:  ${lat.p99} ms  |  Max:  ${lat.max} ms\n`);

  if (report.distribution.databaseLatency) {
    console.log('Database Latency Baseline (ms):');
    console.log(
      '-----------------------------------------------------------------',
    );
    const acq = report.distribution.databaseLatency.acquisitionLatencyMs;
    const qry = report.distribution.databaseLatency.queryLatencyMs;
    console.log('  Pool Acquisition Latency (Panels 23 & 24):');
    console.log(
      `    Min:  ${acq.min} ms  |  Mean: ${acq.mean} ms  |  StdDev: ${acq.stddev} ms`,
    );
    console.log(`    p50:  ${acq.p50} ms  |  p90:  ${acq.p90} ms`);
    console.log(
      `    p95:  ${acq.p95} ms  (SLO Ceiling: <= ${report.targets.maxDatabaseAcquisitionP95LatencyMs} ms)`,
    );
    console.log(`    p99:  ${acq.p99} ms  |  Max:  ${acq.max} ms\n`);
    console.log('  SQL Query Execution Latency (Panels 25 & 26):');
    console.log(
      `    Min:  ${qry.min} ms  |  Mean: ${qry.mean} ms  |  StdDev: ${qry.stddev} ms`,
    );
    console.log(`    p50:  ${qry.p50} ms  |  p90:  ${qry.p90} ms`);
    console.log(
      `    p95:  ${qry.p95} ms  (SLO Ceiling: <= ${report.targets.maxDatabaseQueryP95LatencyMs} ms)`,
    );
    console.log(`    p99:  ${qry.p99} ms  |  Max:  ${qry.max} ms\n`);
  }

  console.log('SLO Compliance Evaluation:');
  console.log(
    '-----------------------------------------------------------------',
  );
  const comp = report.compliance;
  console.log(
    `  ${comp.availabilityPassed ? '✓' : '✗'} Availability:     ${report.distribution.availabilityPercent}% (target >= ${report.targets.availabilityTargetPercent}%)`,
  );
  console.log(
    `  ${comp.latencyPassed ? '✓' : '✗'} p95 Latency:     ${lat.p95} ms (ceiling <= ${report.targets.maxP95LatencyMs} ms)`,
  );
  console.log(
    `  ${comp.throughputPassed ? '✓' : '✗'} Throughput:      ${report.distribution.throughputRps} RPS (target >= ${report.targets.capacityTargetRps} RPS)`,
  );
  console.log(
    `  ${comp.monotonicLatency ? '✓' : '✗'} Monotonicity:    min <= p50 <= p90 <= p95 <= p99 <= max (verified)`,
  );

  if (report.distribution.databaseLatency) {
    const acq = report.distribution.databaseLatency.acquisitionLatencyMs;
    const qry = report.distribution.databaseLatency.queryLatencyMs;
    console.log(
      `  ${comp.databaseAcquisitionLatencyPassed ? '✓' : '✗'} DB Acquisition:   p95 ${acq.p95} ms (ceiling <= ${report.targets.maxDatabaseAcquisitionP95LatencyMs} ms)`,
    );
    console.log(
      `  ${comp.databaseQueryLatencyPassed ? '✓' : '✗'} DB Query Latency:  p95 ${qry.p95} ms (ceiling <= ${report.targets.maxDatabaseQueryP95LatencyMs} ms)`,
    );
  }

  if (!comp.overallPassed) {
    console.error('\nSLO Violations:');
    for (const v of comp.violations) {
      console.error(`  ✗ ${v}`);
    }
    console.log(
      '=================================================================\n',
    );
    console.log('Result: FAILED. Category 5 SLO requirements breached.\n');
    await output(lines.join('\n') + '\n');
    return options.allowFailure ? 0 : 1;
  }

  console.log(
    '\n=================================================================',
  );
  console.log('Result: PASSED. All Category 5 SLO targets satisfied.\n');
  await output(lines.join('\n') + '\n');
  return 0;
}

if (require.main === module) {
  // Keep stream error listeners through natural process shutdown: write callbacks
  // precede error events, and immediate process.exit can truncate piped output.
  let outputFailed = false;
  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', () => {
      outputFailed = true;
      process.exitCode = 1;
    });
  }
  runCli()
    .then((status) => {
      process.exitCode = outputFailed ? 1 : status;
    })
    .catch(async () => {
      process.exitCode = 1;
      try {
        await writeOutput(
          process.stderr,
          'Capacity invocation, evaluation or publication failed\n',
        );
      } catch {
        process.exitCode = 1;
      }
    });
}

module.exports = {
  DEFAULT_SLO_TARGETS,
  parseArgs,
  runCli,
  calculatePercentile,
  calculateLatencySummary,
  calculateDistribution,
  evaluateSloCompliance,
  generateSyntheticDatabaseLatencies,
  generateSyntheticWorkload,
  runLiveBenchmark,
  evaluateCapacity,
};
