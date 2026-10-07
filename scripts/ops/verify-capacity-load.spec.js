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
  assert.ok(
    res.violations.some((v) =>
      v.includes('Availability 99% breached target 99.9%'),
    ),
  );
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
  assert.ok(
    res.violations.some((v) =>
      v.includes('p95 Latency 580ms breached ceiling 500ms'),
    ),
  );
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
  assert.ok(
    res.violations.some((v) =>
      v.includes('Throughput 60 RPS fell below target 100 RPS'),
    ),
  );
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
  assert.ok(
    res.violations.some((v) =>
      v.includes(
        'Database pool acquisition p95 latency 65ms breached ceiling 50ms',
      ),
    ),
  );
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
  assert.ok(
    res.violations.some((v) =>
      v.includes(
        'Database SQL query execution p95 latency 125ms breached ceiling 100ms',
      ),
    ),
  );
});

test('evaluateSloCompliance: catches non-monotonic database acquisition and query latencies', () => {
  const nonMonotonicAcq = {
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
        min: 10.0,
        p50: 25.0,
        p90: 5.0,
        p95: 30.0,
        p99: 40.0,
        max: 50.0,
        mean: 20.0,
        stddev: 10.0,
      }, // p90 < p50
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
  const resAcq = evaluateSloCompliance(nonMonotonicAcq, DEFAULT_SLO_TARGETS);
  assert.equal(resAcq.overallPassed, false);
  assert.equal(resAcq.monotonicDbAcquisition, false);
  assert.ok(
    resAcq.violations.some((v) =>
      v.includes(
        'Database pool acquisition latency violated monotonicity invariant',
      ),
    ),
  );

  const nonMonotonicQuery = {
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
        min: 20.0,
        p50: 15.0,
        p90: 40.0,
        p95: 50.0,
        p99: 80.0,
        max: 100.0,
        mean: 30.0,
        stddev: 15.0,
      }, // min > p50
    },
  };
  const resQuery = evaluateSloCompliance(
    nonMonotonicQuery,
    DEFAULT_SLO_TARGETS,
  );
  assert.equal(resQuery.overallPassed, false);
  assert.equal(resQuery.monotonicDbQuery, false);
  assert.ok(
    resQuery.violations.some((v) =>
      v.includes(
        'Database SQL query execution latency violated monotonicity invariant',
      ),
    ),
  );
});

test('generateSyntheticDatabaseLatencies: produces deterministic, monotonic database latency distributions meeting SLOs', () => {
  const rng1 = () => 0.5;
  const db1 = generateSyntheticDatabaseLatencies(
    { databaseQueryCount: 50 },
    rng1,
  );
  assert.ok(
    db1.acquisitionLatencyMs.p95 <= 50,
    `Acquisition p95 ${db1.acquisitionLatencyMs.p95} <= 50ms`,
  );
  assert.ok(
    db1.queryLatencyMs.p95 <= 100,
    `Query p95 ${db1.queryLatencyMs.p95} <= 100ms`,
  );
  assert.ok(db1.acquisitionLatencyMs.min <= db1.acquisitionLatencyMs.p50);
  assert.ok(db1.acquisitionLatencyMs.p50 <= db1.acquisitionLatencyMs.p95);
  assert.ok(db1.queryLatencyMs.min <= db1.queryLatencyMs.p50);
  assert.ok(db1.queryLatencyMs.p50 <= db1.queryLatencyMs.p95);

  // Works without explicit rng parameter (PRNG fallback)
  const dbFallback = generateSyntheticDatabaseLatencies({
    databaseQueryCount: 50,
    seed: 99,
  });
  assert.ok(dbFallback.acquisitionLatencyMs.p95 <= 50);
  assert.ok(dbFallback.queryLatencyMs.p95 <= 100);
});

test('generateSyntheticWorkload: produces deterministic, reproducible distribution meeting SLOs including database latency', () => {
  const run1 = generateSyntheticWorkload({
    requestCount: 1000,
    durationSeconds: 5,
    seed: 12345,
  });
  const run2 = generateSyntheticWorkload({
    requestCount: 1000,
    durationSeconds: 5,
    seed: 12345,
  });

  // Determinism check
  assert.deepEqual(run1, run2);

  // SLO check
  const compliance = evaluateSloCompliance(run1, DEFAULT_SLO_TARGETS);
  assert.equal(compliance.overallPassed, true);
  assert.equal(run1.totalRequests, 1000);
  assert.equal(run1.availabilityPercent, 100);
  assert.equal(run1.throughputRps, 200);
  assert.ok(
    run1.latencyMs.p95 < 250,
    `Expected p95 < 250ms, got ${run1.latencyMs.p95}ms`,
  );

  // Database latency baseline checks
  assert.ok(run1.databaseLatency, 'databaseLatency should be populated');
  assert.ok(
    run1.databaseLatency.acquisitionLatencyMs.p95 <= 50,
    `Expected DB acquisition p95 <= 50ms, got ${run1.databaseLatency.acquisitionLatencyMs.p95}`,
  );
  assert.ok(
    run1.databaseLatency.queryLatencyMs.p95 <= 100,
    `Expected DB query p95 <= 100ms, got ${run1.databaseLatency.queryLatencyMs.p95}`,
  );
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
    assert.ok(
      savedContent.distribution.databaseLatency,
      'saved report should include databaseLatency',
    );
    assert.ok(savedContent.distribution.databaseLatency.acquisitionLatencyMs);
    assert.ok(savedContent.distribution.databaseLatency.queryLatencyMs);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const { EventEmitter } = require('node:events');
const {
  parseArgs,
  runCli,
  runLiveBenchmark,
} = require('./verify-capacity-load');
const { targetId } = require('./launch-target-evidence');
const canary = 'private-capacity-canary';

function installation(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capacity-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ops = path.join(dir, 'scripts/ops');
  fs.mkdirSync(ops, { recursive: true });
  for (const file of ['verify-capacity-load.js', 'launch-target-evidence.js'])
    fs.copyFileSync(path.join(__dirname, file), path.join(ops, file));
  const guard = path.join(ops, 'guard.js');
  fs.writeFileSync(
    guard,
    `for (const n of ['node:http','node:https']) {const m=require(n);m.request=m.get=()=>{throw Error('${canary}');};}\n`,
  );
  const env = { PATH: path.dirname(process.execPath), LANG: 'C', TZ: 'UTC' };
  const script = path.join(ops, 'verify-capacity-load.js');
  const run = (args, extra = {}) => {
    const result = spawnSync(
      process.execPath,
      ['--require', guard, script, ...args],
      {
        cwd: dir,
        env,
        encoding: 'utf8',
        timeout: 5000,
        ...extra,
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(canary));
    return result;
  };
  return { dir, ops, env, script, guard, run };
}

function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capacity-publication-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function faultFs(overrides) {
  return { ...fs, ...overrides };
}

const invalidArguments = [
  ['--unknown'],
  ['positional'],
  ['--rps', '100'],
  ['--help', '--json'],
  ['--help', '--help'],
  ['--json=true'],
  ['--json', '--json'],
  ['--no-save', '--no-save'],
  ['--allow-failure', '--allow-failure'],
  ['--synthetic', '--synthetic'],
  ['--target-url'],
  ['--output='],
  ['--output', '   '],
  ['--output', '-file'],
  ['--output=bad\u0085file'],
  ['--output=file', '--no-save'],
  ['--concurrency', '--json'],
  ['--concurrency=10', '--concurrency', '20'],
  ['--output=a', '--output=b'],
  [
    '--target-url=https://example.invalid',
    '--target-url=https://example.invalid',
  ],
  ['--synthetic', '--target-url=https://example.invalid'],
  ['--target-url=https://example.invalid', '--synthetic'],
  ['--target-url= https://example.invalid'],
  ['--target-url=https://example.invalid '],
  ...[
    '0',
    '301',
    '5ms',
    '1.5',
    '1e2',
    '+1',
    '-1',
    'NaN',
    '9007199254740993',
    ' 5',
    '5 ',
  ].map((v) => ['--duration-sec=' + v]),
  ...['0', '101', '10workers', '1.5', '1e1', '+1', '-1', 'Infinity'].map(
    (v) => ['--concurrency=' + v],
  ),
  ...[
    'file:///tmp/' + canary,
    'https://user:' + canary + '@example.invalid',
    'https://example.invalid/?token=' + canary,
    'https://example.invalid/#' + canary,
    'https://example.invalid/\n' + canary,
    'https://example.invalid/?',
    'https://example.invalid/#',
  ].map((v) => ['--target-url=' + v]),
];

test('strict parser rejects malformed, duplicate, conflicting and secret-bearing inputs', () => {
  for (const args of invalidArguments)
    assert.throws(() => parseArgs(args), undefined, JSON.stringify(args));
  assert.equal(parseArgs([]).saveReport, true);
  for (const [seconds, workers] of [
    [1, 1],
    [300, 100],
  ]) {
    const options = parseArgs([
      '--duration-sec=' + seconds,
      '--concurrency',
      String(workers),
      '--no-save',
    ]);
    assert.equal(options.durationSeconds, seconds);
    assert.equal(options.concurrency, workers);
  }
  assert.equal(parseArgs(['--output=-quoted file']).outputFile, '-quoted file');
  assert.equal(
    parseArgs(['--target-url', 'HTTPS://EXAMPLE.invalid:443']).targetUrl,
    'https://example.invalid/',
  );
});

test('actual rejected CLI inputs allocate nothing and disclose no private input', (t) => {
  const f = installation(t);
  for (const args of invalidArguments) {
    const r = f.run([...args, '--allow-failure']);
    assert.equal(r.status, 1, JSON.stringify(args));
    assert.equal(r.stdout, '');
    assert.equal(
      r.stderr,
      'Capacity invocation, evaluation or publication failed\n',
    );
  }
  assert.equal(fs.existsSync(path.join(f.dir, 'backups')), false);
});

test('import and standalone help do no evaluation, filesystem or network work', (t) => {
  const f = installation(t);
  const preload = path.join(f.ops, 'zero-work.js');
  fs.writeFileSync(
    preload,
    `const fs=require('node:fs');for(const key of ['lstatSync','mkdirSync','openSync','accessSync','writeFileSync','linkSync']) fs[key]=()=>{throw Error('${canary}');};for(const n of ['node:http','node:https']) require(n).request=()=>{throw Error('${canary}');};require('./verify-capacity-load');`,
  );
  const imported = spawnSync(process.execPath, [preload], {
    env: f.env,
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(imported.status, 0, imported.stderr);
  for (const flag of ['--help', '-h']) {
    const r = f.run([flag], {});
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^Usage:/);
    assert.equal(r.stderr, '');
  }
  // Also run help with the throwing filesystem preload, beyond the network guard.
  const help = spawnSync(
    process.execPath,
    ['--require', preload, f.script, '--help'],
    { env: f.env, encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(help.status, 0, help.stderr);
  assert.equal(fs.existsSync(path.join(f.dir, 'backups')), false);
});

test('actual synthetic JSON no-save preserves defaults and cannot touch backup roots', (t) => {
  const f = installation(t);
  fs.writeFileSync(path.join(f.dir, 'backups'), 'retained');
  const r = f.run(['--synthetic', '--json', '--no-save']);
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.mode, 'synthetic');
  assert.equal(report.targetUrl, 'synthetic://in-process-evaluation');
  assert.equal(report.distribution.totalRequests, 1000);
  assert.equal(report.distribution.throughputRps, 200);
  assert.deepEqual(report.targets, DEFAULT_SLO_TARGETS);
  assert.equal(report.compliance.overallPassed, true);
  assert.ok(report.distribution.databaseLatency);
  assert.equal(report.reportPath, undefined);
  assert.equal(
    fs.readFileSync(path.join(f.dir, 'backups'), 'utf8'),
    'retained',
  );
});

test('actual SLO failure publishes truthful JSON and allow-failure only overrides the verdict', (t) => {
  const f = installation(t);
  for (const override of [false, true]) {
    const file = path.join(f.dir, 'failed-' + override + '.json');
    const r = f.run([
      '--json',
      '--duration-sec=300',
      '--concurrency=100',
      '--output',
      file,
      ...(override ? ['--allow-failure'] : []),
    ]);
    assert.equal(r.status, override ? 0 : 1);
    const report = JSON.parse(r.stdout);
    assert.equal(report.compliance.overallPassed, false);
    assert.equal(report.compliance.throughputPassed, false);
    assert.equal(report.distribution.throughputRps, 3.33);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), report);
    assert.doesNotMatch(r.stdout + r.stderr, new RegExp(file));
  }
  const human = f.run([
    '--no-save',
    '--duration-sec',
    '300',
    '--allow-failure',
  ]);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /Result: FAILED/);
});

test('caller cwd affects explicit output only; private default UUID destinations stay installation anchored', (t) => {
  const f = installation(t),
    caller = temporary(t);
  const preload = path.join(f.ops, 'permissive-umask.js');
  fs.writeFileSync(preload, 'process.umask(0);');
  const run = (args) => f.run(args, { cwd: caller });
  for (let i = 0; i < 2; i++) {
    const r = spawnSync(
      process.execPath,
      ['--require', preload, f.script, '--json'],
      { cwd: caller, env: f.env, encoding: 'utf8', timeout: 5000 },
    );
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).reportPath, undefined);
  }
  const backup = path.join(f.dir, 'backups'),
    files = fs.readdirSync(backup);
  assert.equal(files.length, 2);
  assert.equal(fs.statSync(backup).mode & 0o777, 0o700);
  for (const file of files) {
    assert.match(file, /^capacity-load-report-[a-f0-9-]{36}\.json$/);
    assert.equal(fs.statSync(path.join(backup, file)).mode & 0o777, 0o600);
  }
  assert.equal(fs.existsSync(path.join(caller, 'backups')), false);
  fs.mkdirSync(path.join(caller, 'existing'), { mode: 0o755 });
  const r = run(["--output=existing/new dir/file 'quoted'.json"]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.statSync(path.join(caller, 'existing')).mode & 0o777, 0o755);
  assert.equal(
    fs.statSync(path.join(caller, 'existing/new dir')).mode & 0o777,
    0o700,
  );
  assert.equal(
    fs.statSync(path.join(caller, "existing/new dir/file 'quoted'.json")).mode &
      0o777,
    0o600,
  );
  assert.doesNotMatch(r.stdout, /Audit Evidence|quoted/);
  assert.equal(run(['--output=-literal.json']).status, 0);
  assert.ok(fs.existsSync(path.join(caller, '-literal.json')));
});

test('retained destinations and invalid ancestors fail before evaluation/allocation', async (t) => {
  const dir = temporary(t);
  fs.writeFileSync(path.join(dir, 'retained'), 'retained');
  fs.mkdirSync(path.join(dir, 'directory'));
  fs.symlinkSync('retained', path.join(dir, 'link'));
  fs.symlinkSync('absent', path.join(dir, 'dangling'));
  fs.symlinkSync('directory', path.join(dir, 'parent-link'));
  for (const name of [
    'retained',
    'directory',
    'link',
    'dangling',
    'retained/new/file',
    'dangling/new/file',
    'parent-link/new/file',
    'directory/',
  ]) {
    let evaluated = false;
    await assert.rejects(
      evaluateCapacity(
        {
          saveReport: true,
          outputFile: path.join(dir, name) + (name.endsWith('/') ? '/' : ''),
        },
        {
          generateSyntheticWorkload: () => {
            evaluated = true;
            throw Error(canary);
          },
        },
      ),
    );
    assert.equal(evaluated, false, name);
  }
  assert.equal(fs.readFileSync(path.join(dir, 'retained'), 'utf8'), 'retained');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'directory')), []);
  const f = installation(t);
  for (const name of [
    'retained',
    'directory',
    'link',
    'dangling',
    'parent-link/new/file',
  ]) {
    const r = f.run(['--output', path.join(dir, name), '--allow-failure']);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
  }
});

test('direct invocation bounds and contradictory settings reject before generator, transport or UUID allocation', async (t) => {
  const dir = temporary(t);
  let calls = 0;
  const forbidden = () => {
    calls++;
    throw Error(canary);
  };
  const deps = {
    generateSyntheticWorkload: forbidden,
    runLiveBenchmark: forbidden,
    randomUUID: forbidden,
  };
  for (const options of [
    { durationSeconds: 0 },
    { durationSeconds: '5' },
    { durationSeconds: 301 },
    { durationSeconds: null },
    { concurrency: 0 },
    { concurrency: 101 },
    { concurrency: 1.2 },
    { targetUrl: '' },
    { targetUrl: ' https://example.invalid' },
    { targetUrl: 'https://user:' + canary + '@example.invalid' },
    { targetUrl: 'https://example.invalid', synthetic: true },
    { outputFile: path.join(dir, 'never'), saveReport: false },
  ]) {
    await assert.rejects(
      evaluateCapacity({ saveReport: true, ...options }, deps),
    );
    await assert.rejects(runLiveBenchmark(options));
  }
  assert.equal(calls, 0);
  for (const durationSeconds of [1, 300]) {
    const report = await evaluateCapacity({
      durationSeconds,
      concurrency: 100,
    });
    assert.equal(
      report.distribution.throughputRps,
      Number((1000 / durationSeconds).toFixed(2)),
    );
  }
  await evaluateCapacity({}, { fs: new Proxy({}, { get: forbidden }) });
  assert.equal(calls, 0);
});

for (const operation of [
  'openSync',
  'fstatSync',
  'writeFileSync',
  'closeSync',
  'readFileSync',
  'linkSync',
  'unlinkSync',
]) {
  test(`injected ${operation} failure exits safely, cleans owned staging and preserves published evidence`, async (t) => {
    const dir = temporary(t),
      file = path.join(dir, 'result.json');
    let failed = false;
    const io = faultFs({
      [operation]: (...args) => {
        if (!failed) {
          failed = true;
          throw Error(canary);
        }
        return fs[operation](...args);
      },
    });
    await assert.rejects(
      runCli(['--output', file, '--allow-failure', '--json'], { fs: io }),
      (error) => !error.message.includes(canary),
    );
    assert.equal(failed, true);
    assert.equal(fs.existsSync(file), operation === 'unlinkSync');
    if (operation === 'unlinkSync')
      assert.equal(
        JSON.parse(fs.readFileSync(file, 'utf8')).compliance.overallPassed,
        true,
      );
    assert.deepEqual(
      fs.readdirSync(dir),
      operation === 'unlinkSync' ? ['result.json'] : [],
    );
  });
}

test('persistent cleanup failure keeps complete final and rejects override/output', async (t) => {
  const dir = temporary(t),
    file = path.join(dir, 'result.json');
  let output = false;
  await assert.rejects(
    runCli(['--json', '--allow-failure', '--output', file], {
      fs: faultFs({
        unlinkSync: () => {
          throw Error(canary);
        },
      }),
      output: () => {
        output = true;
      },
    }),
  );
  assert.equal(output, false);
  assert.equal(
    JSON.parse(fs.readFileSync(file, 'utf8')).compliance.overallPassed,
    true,
  );
  assert.equal(fs.readdirSync(dir).length, 2); // Owned staging retained for operator inspection.
});

for (const serialize of [
  () => {
    throw Error(canary);
  },
  () => '',
  () => '{',
  () => '{}',
  () => undefined,
]) {
  test('invalid/partial serialization cannot publish', async (t) => {
    const dir = temporary(t),
      file = path.join(dir, 'result.json');
    await assert.rejects(
      evaluateCapacity({ saveReport: true, outputFile: file }, { serialize }),
    );
    assert.deepEqual(fs.readdirSync(dir), []);
  });
}

test('independent readback mismatch and evaluation exceptions cannot publish or be overridden', async (t) => {
  const dir = temporary(t),
    file = path.join(dir, 'result.json');
  let index = 0;
  for (const deps of [
    { fs: faultFs({ readFileSync: () => '{}' }) },
    {
      generateSyntheticWorkload: () => {
        throw Error(canary);
      },
    },
    {
      fs: faultFs({
        accessSync: () => {
          throw Error(canary);
        },
      }),
    },
    {
      fs: faultFs({
        mkdirSync: () => {
          throw Error(canary);
        },
      }),
    },
  ]) {
    const destination = path.join(dir, 'new-' + index++, 'result.json');
    await assert.rejects(
      runCli(['--output', destination, '--allow-failure'], deps),
    );
    assert.equal(fs.existsSync(file), false);
    assert.equal(fs.existsSync(destination), false);
  }
});

for (const kind of ['file', 'directory', 'symlink', 'dangling']) {
  test(`exclusive link preserves racing ${kind} after destination preflight`, async (t) => {
    const dir = temporary(t),
      file = path.join(dir, 'result.json');
    const io = faultFs({
      linkSync: (stage, destination) => {
        if (kind === 'file') fs.writeFileSync(destination, 'winner');
        else if (kind === 'directory') fs.mkdirSync(destination);
        else
          fs.symlinkSync(
            kind === 'dangling' ? 'absent' : 'retained',
            destination,
          );
        fs.linkSync(stage, destination);
      },
    });
    if (kind === 'symlink')
      fs.writeFileSync(path.join(dir, 'retained'), 'winner');
    await assert.rejects(
      evaluateCapacity({ saveReport: true, outputFile: file }, { fs: io }),
    );
    if (kind === 'file') assert.equal(fs.readFileSync(file, 'utf8'), 'winner');
    if (kind === 'directory') assert.deepEqual(fs.readdirSync(file), []);
    if (kind === 'symlink' || kind === 'dangling')
      assert.equal(
        fs.readlinkSync(file),
        kind === 'dangling' ? 'absent' : 'retained',
      );
    assert.equal(
      fs.readdirSync(dir).some((n) => n.startsWith('.capacity-report-')),
      false,
    );
  });
}

test('foreign staging collision remains untouched and default names are UUID based even under fixed clock', async (t) => {
  const dir = temporary(t),
    uuid = crypto.randomUUID(),
    stage = path.join(dir, `.capacity-report-${uuid}.tmp`);
  fs.writeFileSync(stage, 'foreign');
  await assert.rejects(
    evaluateCapacity(
      { saveReport: true, outputFile: path.join(dir, 'never.json') },
      { randomUUID: () => uuid },
    ),
  );
  assert.equal(fs.readFileSync(stage, 'utf8'), 'foreign');
  t.mock.method(Date, 'now', () => 1234);
  const reports = await Promise.all(
    [0, 1].map(() => evaluateCapacity({ saveReport: true, backupsDir: dir })),
  );
  assert.notEqual(reports[0].reportPath, reports[1].reportPath);
});

test('concurrent evaluations at one exact destination publish at most one complete report', async (t) => {
  const dir = temporary(t),
    file = path.join(dir, 'result.json');
  let ready = 0,
    release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const deps = {
    runLiveBenchmark: async () => {
      ready++;
      if (ready === 2) release();
      await barrier;
      return generateSyntheticWorkload();
    },
  };
  const results = await Promise.allSettled(
    [0, 1].map(() =>
      evaluateCapacity(
        {
          targetUrl: 'https://example.invalid',
          saveReport: true,
          outputFile: file,
        },
        deps,
      ),
    ),
  );
  assert.equal(ready, 2);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const winner = results.find((r) => r.status === 'fulfilled').value;
  const { reportPath, ...saved } = winner;
  assert.equal(reportPath, file);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), saved);
  assert.deepEqual(fs.readdirSync(dir), ['result.json']);
});

test('output failure retains final report and cannot be overridden', async (t) => {
  const dir = temporary(t),
    file = path.join(dir, 'result.json');
  await assert.rejects(
    runCli(['--json', '--allow-failure', '--output', file], {
      output: () => {
        throw Error(canary);
      },
    }),
  );
  assert.equal(
    JSON.parse(fs.readFileSync(file, 'utf8')).compliance.overallPassed,
    true,
  );
});

test('actual CLI broken stdout exits nonzero with safe diagnostics and retains publication', async (t) => {
  const f = installation(t),
    file = path.join(f.dir, 'result.json');
  const preload = path.join(f.ops, 'broken-output.js');
  fs.writeFileSync(
    preload,
    `process.stdout.write=(_value,callback)=>{process.nextTick(()=>{callback(Error('${canary}'));process.stdout.emit('error',Error('${canary}'));});return false;};`,
  );
  const r = spawnSync(
    process.execPath,
    [
      '--require',
      preload,
      f.script,
      '--json',
      '--allow-failure',
      '--output',
      file,
    ],
    { env: f.env, encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.equal(
    r.stderr,
    'Capacity invocation, evaluation or publication failed\n',
  );
  assert.ok(fs.existsSync(file));
});

test('stubbed HTTP/HTTPS worker keeps health rewrite, canonical href hash and omitted live database latency', async (t) => {
  for (const [transport, target] of [
    [http, 'HTTP://EXAMPLE.invalid:80'],
    [https, 'HTTPS://EXAMPLE.invalid:443/custom'],
  ]) {
    let clock = 0,
      requested;
    t.mock.method(Date, 'now', () => clock);
    t.mock.method(transport, 'Agent', function () {
      return { destroy() {} };
    });
    t.mock.method(transport, 'request', (url, options, callback) => {
      requested = { href: url.href, options };
      const request = new EventEmitter();
      request.end = () => {
        clock = 1001;
        const response = new EventEmitter();
        response.statusCode = 200;
        callback(response);
        response.emit('end');
      };
      return request;
    });
    const report = await evaluateCapacity({
      targetUrl: target,
      concurrency: 1,
      durationSeconds: 1,
    });
    assert.equal(report.targetUrl, targetId(new URL(target).href));
    assert.equal(
      requested.href,
      new URL(target).origin + (transport === http ? '/health' : '/custom'),
    );
    assert.equal(requested.options.timeout, 10000);
    assert.equal(report.mode, 'live');
    assert.equal(report.distribution.totalRequests, 1);
    assert.equal(report.distribution.successfulRequests, 1);
    assert.equal(report.distribution.databaseLatency, undefined);
    t.mock.restoreAll();
  }
});

for (const operation of [
  'openSync',
  'writeFileSync',
  'closeSync',
  'readFileSync',
  'linkSync',
  'unlinkSync',
]) {
  test(`actual CLI ${operation} fault is nonzero, redacted and not overridable`, (t) => {
    const f = installation(t),
      file = path.join(f.dir, 'result.json');
    const preload = path.join(f.ops, 'io-fault.js');
    fs.writeFileSync(
      preload,
      `const fs=require('node:fs'),original=fs.${operation};let ownedFd;const open=fs.openSync;fs.openSync=function(p,...a){const fd=open.call(fs,p,...a);if(String(p).includes('.capacity-report-'))ownedFd=fd;return fd;};fs.${operation}=function(p,...a){if(p===ownedFd||String(p).includes('.capacity-report-'))throw Error('${canary}');return original.call(fs,p,...a);};`,
    );
    const r = spawnSync(
      process.execPath,
      [
        '--require',
        preload,
        f.script,
        '--json',
        '--allow-failure',
        '--output',
        file,
      ],
      { env: f.env, encoding: 'utf8', timeout: 5000 },
    );
    assert.equal(r.error, undefined);
    assert.equal(r.status, 1, operation);
    assert.equal(r.stdout, '');
    assert.equal(
      r.stderr,
      'Capacity invocation, evaluation or publication failed\n',
    );
    assert.equal(fs.existsSync(file), operation === 'unlinkSync');
    if (operation === 'unlinkSync')
      assert.equal(
        JSON.parse(fs.readFileSync(file, 'utf8')).compliance.overallPassed,
        true,
      );
  });
}

test('actual concurrent CLI writers retain one complete winner without shared cleanup', async (t) => {
  const f = installation(t),
    file = path.join(f.dir, 'result.json');
  const results = await Promise.all(
    [0, 1].map(
      () =>
        new Promise((resolve, reject) => {
          const child = require('node:child_process').spawn(
            process.execPath,
            ['--require', f.guard, f.script, '--json', '--output', file],
            { cwd: f.dir, env: f.env, stdio: ['ignore', 'pipe', 'pipe'] },
          );
          const watchdog = setTimeout(() => child.kill('SIGKILL'), 5000);
          let stdout = '',
            stderr = '';
          child.stdout.on('data', (bytes) => {
            stdout += bytes;
          });
          child.stderr.on('data', (bytes) => {
            stderr += bytes;
          });
          child.once('error', reject);
          child.once('close', (status, signal) => {
            clearTimeout(watchdog);
            resolve({ status, signal, stdout, stderr });
          });
          t.after(() => {
            clearTimeout(watchdog);
            if (child.exitCode === null) child.kill('SIGKILL');
          });
        }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [0, 1]);
  assert.ok(results.every((r) => r.signal === null));
  const success = results.find((r) => r.status === 0),
    failed = results.find((r) => r.status === 1);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(file, 'utf8')),
    JSON.parse(success.stdout),
  );
  assert.equal(failed.stdout, '');
  assert.equal(
    failed.stderr,
    'Capacity invocation, evaluation or publication failed\n',
  );
  assert.equal(
    fs.readdirSync(f.dir).some((n) => n.startsWith('.capacity-report-')),
    false,
  );
});

test('stream error after a successful write callback cannot restore a success exit', (t) => {
  const f = installation(t),
    preload = path.join(f.ops, 'late-output-error.js');
  fs.writeFileSync(
    preload,
    `process.stdout.write=(_value,callback)=>{process.nextTick(()=>{callback(null);process.stdout.emit('error',Error('${canary}'));});return false;};`,
  );
  const r = spawnSync(
    process.execPath,
    ['--require', preload, f.script, '--json', '--no-save', '--allow-failure'],
    { env: f.env, encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(r.error, undefined);
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stdout + r.stderr, new RegExp(canary));
});
