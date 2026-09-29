const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const { targetId } = require('./launch-target-evidence');
const childEnv = { ...process.env };
delete childEnv.NODE_TEST_CONTEXT;
const root = path.resolve(__dirname, '../..');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-capacity-child-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ops = path.join(dir, 'scripts/ops');
  fs.mkdirSync(ops, { recursive: true });
  for (const file of [
    'run-capacity-alerting-drill.sh',
    'launch-target-evidence.js',
  ]) {
    fs.copyFileSync(path.join(__dirname, file), path.join(ops, file));
  }
  const capacity = {
    mode: 'synthetic',
    compliance: Object.fromEntries(
      [
        'databaseAcquisitionLatencyPassed',
        'databaseQueryLatencyPassed',
        'monotonicDbAcquisition',
        'monotonicDbQuery',
        'overallPassed',
      ].map((k) => [k, true]),
    ),
    distribution: {
      databaseLatency: {
        acquisitionLatencyMs: { p50: 1, p95: 2, p99: 3 },
        queryLatencyMs: { p50: 1, p95: 2, p99: 3 },
      },
    },
  };
  fs.writeFileSync(
    path.join(ops, 'verify-capacity-load.js'),
    `process.stdout.write(${JSON.stringify(JSON.stringify(capacity))});`,
  );
  fs.writeFileSync(
    path.join(ops, 'verify-alert-rules.js'),
    'process.stdout.write(JSON.stringify({valid:true}));',
  );
  fs.writeFileSync(
    path.join(ops, 'run-dos-resilience-drill.sh'),
    `#!/usr/bin/env bash
exec node "$(dirname "$0")/child.js" "$@"
`,
  );
  fs.writeFileSync(
    path.join(ops, 'child.js'),
    `
const fs=require('node:fs');
const {targetId}=require('./launch-target-evidence');
const a=process.argv.slice(2),file=a[a.indexOf('--evidence-file')+1],dry=a.includes('--dry-run');
const scenario=process.env.SCENARIO;
fs.appendFileSync(process.env.CHILD_LOG,JSON.stringify({file,args:a})+'\\n');
const layers=Object.fromEntries(['layer1_edge_ingress','layer2_in_process_throttling','layer3_graphql_bounds',
'layer4_storage_bounds','layer5_anti_enumeration'].map(k=>[k,{passed:true}]));
layers.layer6_rate_limiter_burst={passed:dry?null:true,burstTestMode:dry?'skipped':'live',
 attemptedRequests:dry?0:15,throttledRequests:dry?0:5,authRejectedRequests:dry?0:10,
 unexpectedResponses:0,transportFailures:0,preHealthPassed:!dry,csrfHandshakePassed:!dry,postHealthPassed:!dry};
const e={timestamp:new Date().toISOString(),durationMs:0,drill_type:'dos_resilience_drill',status:'success',failures:[],
 mode:dry?'simulated':'live',apiTargetId:dry?null:targetId(new URL(a[a.indexOf('--api-url')+1]).origin),layers};
if(scenario==='missing') process.exit(0);
if(scenario==='malformed') {fs.writeFileSync(file,'{');process.exit(0);}
if(scenario==='oversized') {fs.writeFileSync(file,'x'.repeat(65537));process.exit(0);}
if(scenario==='mismatch') e.apiTargetId=targetId('https://other.example');
if(scenario==='skipped-live') {e.mode='simulated';e.apiTargetId=null;e.layers.layer6_rate_limiter_burst.burstTestMode='skipped';}
if(scenario==='failed-json') e.status='failed';
if(scenario==='stale') e.timestamp=new Date(Date.now()-120000).toISOString();
if(scenario==='future') e.timestamp=new Date(Date.now()+120000).toISOString();
if(scenario==='counts') e.layers.layer6_rate_limiter_burst.authRejectedRequests=11;
if(scenario==='type') e.drill_type='other';
if(scenario==='static') e.layers.layer4_storage_bounds.passed=false;
if(scenario==='failures') e.failures=['private-secret'];
fs.writeFileSync(file,JSON.stringify(e));
process.exit(scenario==='failed-exit'?1:0);
`,
  );
  const log = path.join(dir, 'children.jsonl');
  const env = (scenario) => ({
    ...childEnv,
    SCENARIO: scenario,
    CHILD_LOG: log,
  });
  const script = path.join(ops, 'run-capacity-alerting-drill.sh');
  const args = (file, dry = true) => [
    script,
    '--evidence-file',
    file,
    '--api-url',
    'https://private.example/',
    ...(dry
      ? ['--dry-run']
      : [
          '--target-url',
          'https://private.example/health',
          '--database-telemetry-file',
          telemetry,
        ]),
  ];
  const telemetry = path.join(dir, 'telemetry.json');
  const prepareTelemetry = () =>
    fs.writeFileSync(
      telemetry,
      JSON.stringify({
        source: 'prometheus-live-scrape',
        targetId: targetId('https://private.example/health'),
        probeHealthy: true,
        timestamp: new Date().toISOString(),
        postgresExporter: { up: 1, lastScrapeError: 0 },
        postgresServer: { pgUp: 1, maxConnections: 100, activeConnections: 6 },
        connectionPool: Object.fromEntries(
          ['api', 'worker'].map((k) => [
            k,
            {
              totalConnections: 10,
              idleConnections: 8,
              maxConnections: 20,
              requestsWaiting: 0,
            },
          ]),
        ),
        poolAcquisitionLatency: Object.fromEntries(
          ['api', 'worker'].map((k) => [k, { p50Ms: 1, p95Ms: 2, p99Ms: 3 }]),
        ),
        queryExecutionDuration: Object.fromEntries(
          ['api', 'worker'].map((k) => [k, { p50Ms: 5, p95Ms: 10, p99Ms: 20 }]),
        ),
        serverActivity: { lockWaits: 0, maxTransactionDurationSec: 0.1 },
      }),
    );
  const run = (scenario = '', dry = true) => {
    prepareTelemetry();
    const file = path.join(dir, 'parent.json');
    const r = spawnSync('bash', args(file, dry), {
      encoding: 'utf8',
      env: env(scenario),
      timeout: 10000,
    });
    assert.equal(r.error, undefined, 'Bash process must execute');
    const evidence = JSON.parse(fs.readFileSync(file, 'utf8'));
    const output = r.stdout + r.stderr;
    assert.doesNotMatch(
      output + JSON.stringify(evidence),
      /private\.example|private-secret/,
    );
    const children = fs
      .readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse);
    for (const child of children)
      assert.equal(
        fs.existsSync(path.dirname(child.file)),
        false,
        'owned child temp dir cleaned',
      );
    return { ...r, evidence, output, children };
  };
  return { dir, script, args, env, log, run };
}

test('parent accepts complete offline child and fresh target-bound live child', (t) => {
  const { run } = fixture(t);
  for (const dry of [true, false]) {
    const r = run('', dry);
    assert.equal(r.status, 0, r.output);
    assert.equal(r.evidence.summary.dosResilience, 'passed');
    assert.equal(r.evidence.failures.length, 0);
    assert.equal(r.children.at(-1).args.includes('--dry-run'), dry);
  }
});

for (const scenario of [
  'mismatch',
  'skipped-live',
  'failed-exit',
  'failed-json',
  'missing',
  'malformed',
  'oversized',
  'stale',
  'future',
  'counts',
  'type',
  'static',
  'failures',
]) {
  test(`parent rejects ${scenario} child and records failure`, (t) => {
    const { run } = fixture(t);
    const r = run(scenario, false);
    assert.notEqual(r.status, 0);
    assert.equal(r.evidence.status, 'failed');
    assert.equal(r.evidence.summary.dosResilience, 'failed');
    assert.ok(
      r.evidence.failures.includes('DoS child evidence missing or invalid'),
    );
    assert.deepEqual(r.evidence.dosResilience, { status: 'failed' });
  });
}

test('offline parent rejects observed counters', (t) => {
  const { run } = fixture(t);
  assert.equal(run('counts').evidence.summary.dosResilience, 'failed');
});

test('concurrent invocations own distinct temporary child receipts and clean them', async (t) => {
  const { dir, args, env, log } = fixture(t);
  const results = await Promise.all(
    [0, 1].map(
      (i) =>
        new Promise((resolve) => {
          const child = spawn(
            'bash',
            args(path.join(dir, `parent-${i}.json`)),
            { env: env(''), stdio: 'ignore' },
          );
          child.on('exit', resolve);
        }),
    ),
  );
  assert.deepEqual(results, [0, 0]);
  const entries = fs
    .readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(new Set(entries.map((e) => e.file)).size, 2);
  for (const e of entries)
    assert.equal(fs.existsSync(path.dirname(e.file)), false);
});
