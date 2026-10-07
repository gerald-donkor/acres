const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, spawn } = require('node:child_process');
const { targetId } = require('./launch-target-evidence');
const { validateCapacityAlertingReport } = require('./check-launch-readiness');
const { assemble, RECEIPTS } = require('./assemble-launch-dossier');
const root = path.resolve(__dirname, '../..');
const origin = 'https://private.example';
const endpoint = origin + '/health';
const canary = 'private-child-canary';

function telemetry(target = endpoint) {
  return {
    source: 'prometheus-live-scrape',
    targetId: targetId(target),
    probeHealthy: true,
    timestamp: new Date().toISOString(),
    postgresExporter: { up: 1, lastScrapeError: 0 },
    postgresServer: { pgUp: 1, maxConnections: 100, activeConnections: 6 },
    connectionPool: Object.fromEntries(
      ['api', 'worker'].map((r) => [
        r,
        {
          totalConnections: 10,
          idleConnections: 8,
          maxConnections: 20,
          requestsWaiting: 0,
        },
      ]),
    ),
    poolAcquisitionLatency: Object.fromEntries(
      ['api', 'worker'].map((r) => [r, { p50Ms: 1, p95Ms: 2, p99Ms: 3 }]),
    ),
    queryExecutionDuration: Object.fromEntries(
      ['api', 'worker'].map((r) => [r, { p50Ms: 5, p95Ms: 10, p99Ms: 20 }]),
    ),
    serverActivity: { lockWaits: 0, maxTransactionDurationSec: 0.1 },
    private: canary,
  };
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-capacity-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ops = path.join(dir, 'scripts/ops'),
    bin = path.join(dir, 'bin'),
    tmp = path.join(dir, 'tmp');
  fs.mkdirSync(ops, { recursive: true });
  fs.mkdirSync(bin);
  fs.mkdirSync(tmp);
  // Copy installed validator dependency closure, without altering consumers.
  for (const file of [
    'launch-target-evidence.js',
    'check-launch-readiness.js',
    'verify-alert-rules.js',
    'verify-capacity-load.js',
    'verify-volume-encryption.js',
    'check-release-images.js',
    'run-static-integrity-checks.js',
  ])
    fs.copyFileSync(path.join(__dirname, file), path.join(ops, file));
  for (const file of [
    'run-capacity-alerting-drill.sh',
    'run-dos-resilience-drill.sh',
  ])
    fs.copyFileSync(path.join(__dirname, file), path.join(ops, file));
  fs.symlinkSync(
    path.join(root, 'node_modules'),
    path.join(dir, 'node_modules'),
  );
  for (const file of ['verify-alert-rules.js', 'verify-capacity-load.js'])
    fs.copyFileSync(path.join(ops, file), path.join(ops, 'producer-' + file));
  for (const tool of ['bash', 'dirname', 'mkdir', 'mktemp', 'ln', 'rm', 'cat'])
    fs.symlinkSync(`/usr/bin/${tool}`, path.join(bin, tool));
  fs.symlinkSync(process.execPath, path.join(bin, 'node'));
  fs.writeFileSync(path.join(bin, 'curl'), '#!/usr/bin/bash\nexit 99\n', {
    mode: 0o700,
  });
  for (const file of [
    'infra/prometheus/alerts.yml',
    'infra/prometheus/prometheus.yml',
    'infra/caddy/Caddyfile.example',
    'server/src/config/env.validation.ts',
    'server/src/security/security.module.ts',
    'server/src/common/api-exception.filter.ts',
    'server/src/auth/auth.controller.ts',
    'server/src/forms/forms.controller.ts',
    'server/src/health/health.controller.ts',
    'server/src/metrics/metrics.controller.ts',
    'server/src/graphql/graphql-limits.ts',
    'server/src/app.setup.ts',
    'server/src/auth/auth.service.ts',
  ]) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(dir, file));
  }
  fs.writeFileSync(
    path.join(ops, 'fixture-child.js'),
    `
const fs=require('node:fs'),path=require('node:path');
const {targetId}=require('./launch-target-evidence');
module.exports=kind=>{
 const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1],scenario=process.env[kind.toUpperCase()+'_SCENARIO'];
 fs.appendFileSync(process.env.CHILD_LOG,JSON.stringify({kind,args,cwd:process.cwd(),pid:process.pid,
 tmp:process.env.TMPDIR,tmpMode:fs.statSync(process.env.TMPDIR).mode&0o777,
 stdoutMode:fs.statSync(path.join(path.dirname(process.env.TMPDIR),kind+'.json')).mode&0o777,
 stderrMode:fs.statSync(path.join(path.dirname(process.env.TMPDIR),kind+'.stderr')).mode&0o777})+'\\n');
 let e;
 if(kind==='alerts') e=require('./producer-verify-alert-rules').verifyAlertRules();
 if(kind==='capacity') {
  const p=require('./producer-verify-capacity-load'),target=args.includes('--target-url')?get('--target-url'):'';
  const distribution=p.generateSyntheticWorkload();
  if(target) delete distribution.databaseLatency;
  e={timestamp:new Date().toISOString(),mode:target?'live':'synthetic',targetUrl:target?targetId(target):'synthetic://in-process-evaluation',
    targets:p.DEFAULT_SLO_TARGETS,distribution,compliance:p.evaluateSloCompliance(distribution)};
  if(!args.includes('--no-save')) fs.writeFileSync(path.join(__dirname,'../../capacity-load-report-leak.json'),'bad');
 }
 if(kind==='dos') {
  const dry=args.includes('--dry-run');
  e={timestamp:new Date().toISOString(),durationMs:0,drill_type:'dos_resilience_drill',status:'success',failures:[],mode:dry?'simulated':'live',
   apiTargetId:dry?null:targetId(get('--api-url')),layers:Object.fromEntries(['layer1_edge_ingress','layer2_in_process_throttling','layer3_graphql_bounds','layer4_storage_bounds','layer5_anti_enumeration'].map(k=>[k,{passed:true}]))};
  e.layers.layer6_rate_limiter_burst={passed:dry?null:true,burstTestMode:dry?'skipped':'live',attemptedRequests:dry?0:15,throttledRequests:dry?0:5,authRejectedRequests:dry?0:10,
   unexpectedResponses:0,transportFailures:0,preHealthPassed:!dry,csrfHandshakePassed:!dry,postHealthPassed:!dry};
 }
 e.private='${canary}';
 if(kind==='alerts') {e.alerts[0].private='${canary}';e.checks[0].message='${canary}';e.alerts[0].expr='${canary}';e.alerts[0].summary='${canary}';e.simulations[0].thresholdDescription='${canary}';}
 if(kind==='capacity') {e.distribution.latencyMs.private='${canary}';e.targets.private='${canary}';e.compliance.private='${canary}';}
 if(kind==='dos') e.layers.layer6_rate_limiter_burst.private='${canary}';
 if(scenario==='stale') e.timestamp=new Date(Date.now()-120000).toISOString();
 if(scenario==='future') e.timestamp=new Date(Date.now()+120000).toISOString();
 if(scenario==='noncanonical') e.timestamp=new Date().toISOString().replace(/\\.\\d{3}Z$/,'Z');
 if(scenario==='wrong-target') {e.targetUrl=targetId('https://other.example/');e.apiTargetId=targetId('https://other.example');}
 if(scenario==='wrong-mode') e.mode='wrong';
 if(kind==='alerts') {
  if(scenario==='minimal') e={valid:true};
  if(scenario==='missing-rule') e.alerts.pop();
  if(scenario==='duplicate') e.alerts[1]=e.alerts[0];
  if(scenario==='bad-simulation') e.simulations[0].clearsOnNormal=false;
  if(scenario==='bad-429') e.simulations.find(s=>s.alert==='High429Rate').ignoresOther4xx=false;
  if(scenario==='bad-check') e.checks[0].passed=false;
  if(scenario==='bad-count') e.totalRulesCount=10;
  if(scenario==='errors') e.errors=['${canary}'];
 }
 if(kind==='capacity') {
  if(scenario==='minimal') e={compliance:{overallPassed:true}};
  if(scenario==='counts') e.distribution.failedRequests++;
  if(scenario==='availability') e.distribution.availabilityPercent=99.9;
  if(scenario==='latency') e.distribution.latencyMs.p95=600;
  if(scenario==='monotonic') e.distribution.latencyMs.p50=999;
  if(scenario==='mean') e.distribution.latencyMs.mean=999;
  if(scenario==='incomplete') delete e.distribution.latencyMs.stddev;
  if(scenario==='negative') e.distribution.latencyMs.min=-1;
  if(scenario==='db-missing') delete e.distribution.databaseLatency;
  if(scenario==='db-breach') e.distribution.databaseLatency.acquisitionLatencyMs.p95=60;
  if(scenario==='verdict') e.compliance.latencyPassed=false;
  if(scenario==='targets') e.targets.maxP95LatencyMs=900;
  if(scenario==='violations') e.compliance.violations=['${canary}'];
 }
 if(kind==='dos') {
  if(scenario==='skipped-live') {e.mode='simulated';e.apiTargetId=null;}
  if(scenario==='failed-json') e.status='failed';
  if(scenario==='counts') e.layers.layer6_rate_limiter_burst.authRejectedRequests=11;
  if(scenario==='static') e.layers.layer4_storage_bounds.passed=false;
  if(scenario==='failures') e.failures=['${canary}'];
  if(scenario==='type') e.drill_type='wrong';
 }
 if(scenario==='rewrite-telemetry') fs.writeFileSync(process.env.TELEMETRY_FILE,'{}');
 if(scenario==='signal') {setInterval(()=>{},1000);return;}
 if(scenario==='missing') process.exit(0);
 let raw=JSON.stringify(e);
 if(scenario==='malformed') raw='{';
 if(scenario==='oversized') raw='x'.repeat(65537);
 if(scenario==='primitive') raw='true';
 if(scenario==='array') raw='[]';
 if(scenario==='empty') raw='';
 if(kind==='dos') fs.writeFileSync(get('--evidence-file'),raw); else process.stdout.write(raw);
 process.stderr.write('${canary}');
 process.exit(scenario==='failed-exit'?1:0);
};
`,
  );
  for (const [file, kind] of [
    ['verify-alert-rules.js', 'alerts'],
    ['verify-capacity-load.js', 'capacity'],
  ])
    fs.writeFileSync(
      path.join(ops, file),
      `module.exports=require('./producer-${file}');\nif(require.main===module) require('./fixture-child')('${kind}');\n`,
    );
  fs.writeFileSync(
    path.join(ops, 'run-dos-resilience-drill.sh'),
    `#!/usr/bin/env bash\nexec node "$(dirname -- "$0")/fake-dos.js" "$@"\n`,
  );
  fs.writeFileSync(
    path.join(ops, 'fake-dos.js'),
    `require('./fixture-child')('dos');\n`,
  );
  const log = path.join(dir, 'children.jsonl'),
    telemetryFile = path.join(dir, 'telemetry.json');
  fs.writeFileSync(telemetryFile, JSON.stringify(telemetry()));
  const environment = (extra) => ({
    PATH: bin,
    LANG: 'C',
    LC_ALL: 'C',
    TMPDIR: tmp,
    CHILD_LOG: log,
    TELEMETRY_FILE: telemetryFile,
    ...extra,
  });
  const script = path.join(ops, 'run-capacity-alerting-drill.sh');
  const destination = () =>
    path.join(dir, 'evidence-' + crypto.randomUUID() + '.json');
  const calls = () =>
    fs.existsSync(log)
      ? fs
          .readFileSync(log, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(JSON.parse)
      : [];
  const run = (args = [], extra = {}, options = {}) => {
    const file = options.file || destination();
    const result = spawnSync(
      '/usr/bin/bash',
      [
        script,
        ...(!options.defaults ? ['--evidence-file', file] : []),
        ...args,
      ],
      {
        cwd: options.cwd || dir,
        env: environment(extra),
        encoding: 'utf8',
        timeout: 15000,
      },
    );
    assert.equal(result.error, undefined);
    const evidence =
      fs.existsSync(file) && fs.statSync(file).isFile()
        ? JSON.parse(fs.readFileSync(file, 'utf8'))
        : null;
    const output = result.stdout + result.stderr;
    assert.doesNotMatch(
      output + JSON.stringify(evidence),
      /private\.example|private-child-canary/,
    );
    assert.deepEqual(
      fs.readdirSync(tmp),
      [],
      'owned private resources cleaned',
    );
    assert.equal(
      fs.readdirSync(dir).some((n) => n.startsWith('.capacity-evidence.')),
      false,
    );
    return { ...result, evidence, file, output };
  };
  const live = [
    '--api-url',
    origin + '/',
    '--target-url',
    endpoint,
    '--database-telemetry-file',
    telemetryFile,
  ];
  const tool = (name, code) => {
    fs.rmSync(path.join(bin, name));
    fs.writeFileSync(path.join(bin, name), code, { mode: 0o700 });
  };
  return {
    dir,
    ops,
    bin,
    tmp,
    script,
    environment,
    destination,
    log,
    calls,
    run,
    live,
    telemetryFile,
    tool,
  };
}

test('complete dry and stubbed live receipts pass the actual readiness validator', (t) => {
  const f = fixture(t);
  for (const dry of [true, false]) {
    const r = f.run(dry ? ['--dry-run'] : f.live);
    assert.equal(r.status, 0, r.output);
    assert.equal(validateCapacityAlertingReport(r.evidence, new Date()), true);
    assert.equal(
      validateCapacityAlertingReport(r.evidence, new Date(), {
        requireLive: true,
      }),
      !dry,
    );
    assert.equal(r.evidence.targetId, dry ? null : targetId(endpoint));
    assert.equal(r.evidence.apiTargetId, dry ? null : targetId(origin));
    assert.equal(r.evidence.environment, dry ? undefined : 'production');
    assert.equal(
      r.evidence.operator_reference,
      dry ? undefined : 'sre-lead-01',
    );
    assert.equal(fs.statSync(r.file).mode & 0o777, 0o600);
  }
  for (const c of f.calls()) {
    assert.equal(c.tmpMode, 0o700);
    assert.equal(c.stdoutMode, 0o600);
    assert.equal(c.stderrMode, 0o600);
    assert.equal(fs.existsSync(c.tmp), false);
  }
  assert.equal(
    fs.existsSync(path.join(f.dir, 'capacity-load-report-leak.json')),
    false,
  );
});

test('all attached values and canonical origins/endpoints preserve distinct hashes and CLI precedence', (t) => {
  const f = fixture(t);
  const r = f.run(
    [
      '--cwd=' + f.dir,
      '--api-url=HTTPS://PRIVATE.EXAMPLE:443/',
      '--target-url=HTTPS://PRIVATE.EXAMPLE:443/health',
      '--database-telemetry-file=telemetry.json',
      '--operator-reference=operator-ticket',
      '--authorization-reference=auth-ticket',
      '--benchmark-reference=bench-ticket',
      '--evidence-dir=unused',
    ],
    {
      ACRES_OPERATOR_REF: 'change-me',
      ACRES_AUTH_REF: 'change-me',
      ACRES_BENCHMARK_REF: 'change-me',
    },
  );
  assert.equal(r.status, 0, r.output);
  assert.equal(r.evidence.targetId, targetId(endpoint));
  assert.equal(r.evidence.apiTargetId, targetId(origin));
  assert.equal(r.evidence.operator_reference, 'operator-ticket');
  assert.equal(r.evidence.authorization_reference, 'auth-ticket');
  assert.equal(r.evidence.benchmark_reference, 'bench-ticket');
  assert.equal(fs.existsSync(path.join(f.dir, 'unused')), false);
});

for (const option of [
  'cwd',
  'target-url',
  'api-url',
  'database-telemetry-file',
  'operator-reference',
  'authorization-reference',
  'benchmark-reference',
  'evidence-dir',
  'evidence-file',
]) {
  test(`reject malformed and duplicate --${option} options without work`, (t) => {
    const f = fixture(t);
    for (const args of [
      [`--${option}`],
      [`--${option}=`],
      [`--${option}`, '--dry-run'],
      [`--${option}=   `],
      [`--${option}=bad\nvalue`],
      [`--${option}=bad\u0085value`],
      [`--${option}=one`, `--${option}=two`],
      [`--${option}`, 'one', `--${option}`, 'two'],
      [`--${option}=one`, `--${option}`, 'two'],
    ]) {
      const r = f.run(args, {}, { defaults: true });
      assert.notEqual(r.status, 0);
      assert.equal(r.evidence, null);
    }
    assert.deepEqual(f.calls(), []);
    assert.equal(fs.existsSync(path.join(f.dir, 'backups')), false);
  });
}

test('help aliases are side effect free and document options, modes and scaffold references', (t) => {
  const f = fixture(t);
  for (const flag of ['--help', '-h']) {
    const r = f.run([flag], {}, { defaults: true });
    assert.equal(r.status, 0);
    assert.match(r.output, /--cwd/);
    assert.match(r.output, /Scaffold references/);
  }
  assert.deepEqual(f.calls(), []);
  assert.equal(fs.existsSync(path.join(f.dir, 'backups')), false);
});

for (const value of [
  '',
  '   ',
  'https://user:password@host',
  'ftp://host',
  'https://host/path',
  'https://host/?',
  'https://host/#',
  'https://host/?token=value',
  'https://host:65536',
  'https://host/\n',
]) {
  test(`reject unsafe API origin ${JSON.stringify(value)}`, (t) => {
    const f = fixture(t),
      r = f.run(['--dry-run', '--api-url=' + value]);
    assert.notEqual(r.status, 0);
    assert.equal(r.evidence, null);
    assert.deepEqual(f.calls(), []);
  });
}

for (const value of [
  'https://user:password@host/x',
  'file:///tmp/file',
  'https://host/x?',
  'https://host/x#',
  'https://host:99999/x',
]) {
  test(`reject unsafe benchmark endpoint ${JSON.stringify(value)}`, (t) => {
    const f = fixture(t),
      r = f.run([
        '--target-url=' + value,
        '--database-telemetry-file=' + f.telemetryFile,
      ]);
    assert.notEqual(r.status, 0);
    assert.equal(r.evidence, null);
    assert.deepEqual(f.calls(), []);
  });
}

for (const url of [
  'http://127.0.0.1:3001/',
  'http://[::1]:3001/',
  'https://host.example/',
]) {
  test(`normalize supported offline origin ${url}`, (t) => {
    const f = fixture(t),
      r = f.run(['--dry-run', '--api-url', url]);
    assert.equal(r.status, 0, r.output);
    assert.equal(
      f.calls().at(-1).args[f.calls().at(-1).args.indexOf('--api-url') + 1],
      new URL(url).origin,
    );
  });
}

test('cwd defaults to installation root and explicit relative/absolute target uses anchored children', (t) => {
  const f = fixture(t),
    caller = path.join(f.dir, 'caller'),
    target = path.join(f.dir, "target 'quoted'");
  fs.mkdirSync(caller);
  fs.mkdirSync(target);
  for (const cwd of [undefined, "../target 'quoted'", target]) {
    const r = f.run(
      ['--dry-run', ...(cwd ? ['--cwd', cwd] : [])],
      {},
      { cwd: caller },
    );
    assert.equal(r.status, 0, r.output);
    const last = f.calls().slice(-3),
      expected = cwd ? target : f.dir;
    assert.equal(last[0].cwd, expected);
    assert.equal(
      last[0].args[2],
      path.join(expected, 'infra/prometheus/alerts.yml'),
    );
    assert.equal(last[2].args[1], expected);
  }
  fs.mkdirSync(path.join(target, 'scripts/ops'), { recursive: true });
  fs.writeFileSync(
    path.join(target, 'scripts/ops/verify-alert-rules.js'),
    'throw Error("substituted")',
  );
  const r = f.run(['--dry-run', '--cwd', target]);
  assert.equal(r.status, 0);
  const bad = f.run(['--dry-run', '--cwd', path.join(f.dir, 'absent')]);
  assert.notEqual(bad.status, 0);
});

test('dash-leading attached paths, quoted output and private new parents preserve existing directory modes', (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.dir, '-target'));
  fs.mkdirSync(path.join(f.dir, 'existing'), { mode: 0o755 });
  const r = f.run(
    [
      '--dry-run',
      '--cwd=-target',
      "--evidence-file=../existing/new dir/file 'quoted'.json",
    ],
    {},
    {
      defaults: true,
      file: path.join(f.dir, "existing/new dir/file 'quoted'.json"),
    },
  );
  assert.equal(r.status, 0, r.output);
  assert.equal(fs.statSync(path.join(f.dir, 'existing')).mode & 0o777, 0o755);
  assert.equal(
    fs.statSync(path.join(f.dir, 'existing/new dir')).mode & 0o777,
    0o700,
  );
});

test('invalid invocation, conflicts, reference/environment and utility preflights precede children', (t) => {
  const f = fixture(t);
  for (const args of [
    ['--unknown'],
    ['positional'],
    ['--dry-run', '--target-url', endpoint],
    ['--database-telemetry-file', f.telemetryFile],
    ['--target-url', endpoint],
    ['--dry-run', ...f.live],
  ]) {
    assert.notEqual(f.run(args).status, 0);
  }
  for (const extra of [
    { ACRES_OPERATOR_REF: '' },
    { ACRES_AUTH_REF: 'change-me' },
    { ACRES_BENCHMARK_REF: 'sk-' + 'a'.repeat(30) },
    { ACRES_ENVIRONMENT: 'staging' },
  ])
    assert.notEqual(f.run(f.live, extra).status, 0);
  for (const option of [
    'operator-reference',
    'authorization-reference',
    'benchmark-reference',
  ])
    assert.notEqual(f.run([...f.live, '--' + option + '=change-me']).status, 0);
  assert.notEqual(f.run(f.live.slice(2), { API_URL: '' }).status, 0);
  fs.rmSync(path.join(f.bin, 'ln'));
  assert.notEqual(f.run(['--dry-run']).status, 0);
  assert.deepEqual(f.calls(), []);
});

for (const source of [
  'missing',
  'malformed',
  'oversized',
  'array',
  'stale',
  'future',
  'target',
  'health',
  'pool',
  'scrape',
]) {
  test(`reject ${source} live telemetry before avoidable traffic`, (t) => {
    const f = fixture(t),
      e = telemetry();
    if (source === 'stale')
      e.timestamp = new Date(Date.now() - 120000).toISOString();
    if (source === 'future')
      e.timestamp = new Date(Date.now() + 30000).toISOString();
    if (source === 'target') e.targetId = targetId('https://other.example/');
    if (source === 'health') e.postgresServer.pgUp = 0;
    if (source === 'pool') e.connectionPool.api.requestsWaiting = 1;
    if (source === 'scrape') e.postgresExporter.lastScrapeError = 1;
    fs.writeFileSync(
      f.telemetryFile,
      source === 'malformed'
        ? '{'
        : source === 'oversized'
          ? 'x'.repeat(65537)
          : source === 'array'
            ? '[]'
            : JSON.stringify(e),
    );
    if (source === 'missing') fs.rmSync(f.telemetryFile);
    const r = f.run(f.live);
    assert.notEqual(r.status, 0);
    assert.equal(r.evidence, null);
    assert.deepEqual(f.calls(), []);
  });
}

test('reference environment precedence and 60-second telemetry observation window remain supported', (t) => {
  const f = fixture(t),
    e = telemetry();
  e.timestamp = new Date(Date.now() - 30000).toISOString();
  fs.writeFileSync(f.telemetryFile, JSON.stringify(e));
  const r = f.run(f.live, {
    ACRES_OPERATOR_REF: 'operator-env',
    ACRES_AUTH_REF: 'auth-env',
    ACRES_BENCHMARK_REF: 'bench-env',
  });
  assert.equal(r.status, 0, r.output);
  assert.equal(r.evidence.operator_reference, 'operator-env');
});

test('default mixed mode fails honestly and completed-window telemetry is revalidated', (t) => {
  const f = fixture(t),
    r = f.run([]);
  assert.notEqual(r.status, 0);
  assert.equal(r.evidence.mode, 'default');
  assert.equal(r.evidence.databaseTelemetryBaseline.status, 'breached');
  assert.equal(f.calls().at(-1).args.includes('--dry-run'), false);
  const changed = f.run(f.live, { DOS_SCENARIO: 'rewrite-telemetry' });
  assert.notEqual(changed.status, 0);
  assert.equal(changed.evidence.summary.databaseBaselineCompliance, 'failed');
});

for (const kind of ['alerts', 'capacity', 'dos']) {
  const shared = [
    'missing',
    'malformed',
    'oversized',
    'primitive',
    'array',
    'empty',
    'failed-exit',
  ];
  const cases =
    kind === 'alerts'
      ? [
          'minimal',
          'missing-rule',
          'duplicate',
          'bad-simulation',
          'bad-429',
          'bad-check',
          'bad-count',
          'errors',
        ]
      : kind === 'capacity'
        ? [
            'minimal',
            'stale',
            'future',
            'noncanonical',
            'wrong-target',
            'wrong-mode',
            'counts',
            'availability',
            'latency',
            'monotonic',
            'mean',
            'incomplete',
            'negative',
            'db-missing',
            'db-breach',
            'verdict',
            'targets',
            'violations',
          ]
        : [
            'stale',
            'future',
            'noncanonical',
            'wrong-target',
            'wrong-mode',
            'skipped-live',
            'failed-json',
            'counts',
            'static',
            'failures',
            'type',
          ];
  for (const scenario of [...shared, ...cases]) {
    test(`reject ${kind} ${scenario} evidence even beside successful exit/JSON`, (t) => {
      const f = fixture(t),
        live = kind === 'dos';
      const r = f.run(live ? f.live : ['--dry-run'], {
        [kind.toUpperCase() + '_SCENARIO']: scenario,
      });
      assert.notEqual(r.status, 0, r.output);
      assert.equal(r.evidence.status, 'failed');
      assert.equal(
        r.evidence.summary[
          {
            alerts: 'alertVerification',
            capacity: 'capacitySloCompliance',
            dos: 'dosResilience',
          }[kind]
        ],
        'failed',
      );
      assert.equal(
        validateCapacityAlertingReport(r.evidence, new Date()),
        false,
      );
      assert.doesNotMatch(r.output, /PASSED/);
    });
  }
}

test('existing files, directories, symlinks, dangling links and unusable ancestors are retained before work', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.dir, 'retained'), 'retained');
  fs.mkdirSync(path.join(f.dir, 'directory'));
  fs.symlinkSync('retained', path.join(f.dir, 'link'));
  fs.symlinkSync('absent', path.join(f.dir, 'dangling'));
  for (const value of [
    'retained',
    'directory',
    'link',
    'dangling',
    'retained/child/file',
    'dangling/child/file',
    'directory/',
  ]) {
    const r = f.run(
      ['--dry-run', '--evidence-file=' + value],
      {},
      { defaults: true },
    );
    assert.notEqual(r.status, 0);
    assert.doesNotMatch(r.output, /PASSED/);
  }
  assert.equal(
    fs.readFileSync(path.join(f.dir, 'retained'), 'utf8'),
    'retained',
  );
  assert.deepEqual(f.calls(), []);
});

for (const name of [
  'check-launch-readiness.js',
  'verify-alert-rules.js',
  'verify-capacity-load.js',
  'launch-target-evidence.js',
  'run-dos-resilience-drill.sh',
]) {
  test(`missing installed ${name} fails before work`, (t) => {
    const f = fixture(t);
    fs.rmSync(path.join(f.ops, name));
    const r = f.run(['--dry-run']);
    assert.notEqual(r.status, 0);
    assert.equal(r.evidence, null);
    assert.deepEqual(f.calls(), []);
  });
}

for (const kind of ['file', 'directory', 'symlink']) {
  test(`exclusive publication preserves concurrent ${kind}`, (t) => {
    const f = fixture(t),
      file = f.destination();
    f.tool(
      'ln',
      `#!/usr/bin/env node\nconst fs=require('node:fs'),{spawnSync}=require('node:child_process');const a=process.argv.slice(2),p=a.at(-1);\n` +
        (kind === 'file'
          ? `fs.writeFileSync(p,'retained');`
          : kind === 'directory'
            ? `fs.mkdirSync(p);`
            : `fs.symlinkSync('unowned',p);`) +
        `process.exit(spawnSync('/usr/bin/ln',a,{stdio:'ignore'}).status);\n`,
    );
    const r = spawnSync(
      '/usr/bin/bash',
      [f.script, '--dry-run', '--evidence-file', file],
      { env: f.environment(), encoding: 'utf8' },
    );
    assert.equal(r.error, undefined);
    assert.notEqual(r.status, 0);
    assert.doesNotMatch(r.stdout + r.stderr, /PASSED|${canary}/);
    if (kind === 'file')
      assert.equal(fs.readFileSync(file, 'utf8'), 'retained');
    if (kind === 'directory') assert.deepEqual(fs.readdirSync(file), []);
    if (kind === 'symlink') assert.equal(fs.readlinkSync(file), 'unowned');
    assert.deepEqual(fs.readdirSync(f.tmp), []);
    assert.equal(
      fs.readdirSync(f.dir).some((n) => n.startsWith('.capacity-evidence.')),
      false,
    );
  });
}

for (const tool of ['mkdir', 'mktemp', 'ln', 'rm']) {
  test(`controlled ${tool} I/O failure cannot print a passing summary`, (t) => {
    const f = fixture(t);
    f.tool(tool, '#!/usr/bin/bash\nexit 1\n');
    const r = spawnSync(
      '/usr/bin/bash',
      [f.script, '--dry-run', '--evidence-file', f.destination()],
      { env: f.environment(), encoding: 'utf8' },
    );
    assert.equal(r.error, undefined);
    assert.notEqual(r.status, 0);
    assert.doesNotMatch(r.stdout, /PASSED/);
  });
}

for (const failure of [
  'exit',
  'empty',
  'partial',
  'contradictory',
  'write-failure',
]) {
  test(`independent checker rejects ${failure} serialization`, (t) => {
    const f = fixture(t);
    f.tool(
      'node',
      `#!/usr/bin/bash
if [[ "$1" == - && "$3" == */.capacity-evidence.* ]]; then
  ${
    failure === 'exit'
      ? 'exit 1'
      : failure === 'write-failure'
        ? 'printf success; exit 1'
        : failure === 'empty'
          ? 'printf success; exit 0'
          : `printf '%s' '${failure === 'partial' ? '{"status":"success"}' : '{"status":"failed"}'}' > "$3"; printf success; exit 0`
  }
fi
exec '${process.execPath}' "$@"
`,
    );
    const r = f.run(['--dry-run']);
    assert.notEqual(r.status, 0);
    assert.equal(r.evidence, null);
    assert.doesNotMatch(r.output, /PASSED/);
  });
}

test('concurrent default UUID names have distinct owned child resources', async (t) => {
  const f = fixture(t);
  const statuses = await Promise.all(
    [0, 1].map(
      () =>
        new Promise((resolve, reject) => {
          const child = spawn('/usr/bin/bash', [f.script, '--dry-run'], {
            env: f.environment(),
            cwd: f.dir,
            stdio: 'ignore',
          });
          child.once('error', reject);
          child.once('exit', resolve);
        }),
    ),
  );
  assert.deepEqual(statuses, [0, 0]);
  const files = fs.readdirSync(path.join(f.dir, 'backups'));
  assert.equal(files.length, 2);
  for (const file of files)
    assert.match(
      file,
      /^capacity-alerting-drill-evidence-[a-f0-9-]{36}\.json$/,
    );
  assert.equal(new Set(f.calls().map((c) => c.tmp)).size, 2);
  assert.deepEqual(fs.readdirSync(f.tmp), []);
});

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  test(`catchable ${signal} stops the active child and removes owned resources`, async (t) => {
    const f = fixture(t),
      file = f.destination();
    const child = spawn(
      '/usr/bin/bash',
      [f.script, '--dry-run', '--evidence-file', file],
      { env: f.environment({ ALERTS_SCENARIO: 'signal' }), stdio: 'ignore' },
    );
    const closed = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    const until = Date.now() + 5000;
    while (f.calls().length === 0 && Date.now() < until)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(f.calls().length);
    const active = f.calls()[0];
    child.kill(signal);
    await closed;
    assert.equal(fs.existsSync(file), false);
    assert.deepEqual(fs.readdirSync(f.tmp), []);
    assert.throws(() => process.kill(active.pid, 0), /ESRCH/);
  });
}

test('real offline children against copied sources pass readiness and the launch dossier consumer; missing sources fail safely', (t) => {
  const f = fixture(t);
  for (const file of [
    'verify-alert-rules.js',
    'verify-capacity-load.js',
    'run-dos-resilience-drill.sh',
  ])
    fs.copyFileSync(path.join(__dirname, file), path.join(f.ops, file));
  fs.writeFileSync(
    path.join(f.ops, 'network-guard.js'),
    `for(const name of ['node:http','node:https']) {const m=require(name);m.request=m.get=()=>{require('node:fs').writeFileSync(process.env.NETWORK_LOG,'forbidden');throw Error('Network forbidden');};}\n`,
  );
  f.tool(
    'node',
    `#!/usr/bin/bash\nexec '${process.execPath}' --require '${f.ops}/network-guard.js' "$@"\n`,
  );
  const networkLog = path.join(f.dir, 'network');
  const startedAt = Date.now(),
    r = f.run(['--dry-run'], { NETWORK_LOG: networkLog });
  assert.equal(r.status, 0, r.output);
  assert.equal(validateCapacityAlertingReport(r.evidence, new Date()), true);
  assert.equal(
    validateCapacityAlertingReport(r.evidence, new Date(), {
      requireLive: true,
    }),
    false,
  );
  assert.equal(fs.existsSync(networkLog), false);
  assert.equal(
    fs.existsSync(path.join(f.dir, 'backups')),
    false,
    '--no-save creates no benchmark artifact',
  );
  // Exercise the exported assembler with Stage 6's exact owned receipt name.
  const runDir = path.join(f.dir, 'owned'),
    owned = path.join(runDir, 'capacity_alerting');
  fs.mkdirSync(owned, { recursive: true });
  fs.copyFileSync(
    r.file,
    path.join(owned, RECEIPTS.capacity_alerting.capacity),
  );
  const dossier = assemble({
    outputPath: path.join(f.dir, 'dossier.json'),
    timestamp: new Date(startedAt).toISOString(),
    durationS: 1,
    runDir,
    cwd: f.dir,
    caddyfile: path.join(f.dir, 'infra/caddy/Caddyfile.example'),
    composeFile: path.join(f.dir, 'docker-compose.production.example.yml'),
    dryRun: '1',
    startedAt,
    endedAt: Date.now(),
    stages: Object.keys(RECEIPTS).map((stage_id) => ({
      stage_id,
      status: stage_id === 'capacity_alerting' ? 'PASSED' : 'FAILED',
      duration_ms: 0,
      artifacts: [],
    })),
  });
  assert.equal(dossier.summary.sloCompliance, 'capacity_alerts_verified');
  assert.equal(
    dossier.stages.find((stage) => stage.stage_id === 'capacity_alerting')
      .status,
    'PASSED',
  );
  fs.writeFileSync(
    path.join(f.ops, 'verify-capacity-load.js'),
    `const p=require('./producer-verify-capacity-load');module.exports=p;if(require.main===module){p.runCli(['--synthetic','--json','--no-save','--duration-sec=300']).then(status=>{process.exitCode=status;});}\n`,
  );
  const failedChild = f.run(['--dry-run'], { NETWORK_LOG: networkLog });
  assert.notEqual(failedChild.status, 0);
  assert.equal(failedChild.evidence.summary.capacitySloCompliance, 'failed');
  assert.equal(
    validateCapacityAlertingReport(failedChild.evidence, new Date()),
    false,
  );
  fs.copyFileSync(
    path.join(__dirname, 'verify-capacity-load.js'),
    path.join(f.ops, 'verify-capacity-load.js'),
  );
  fs.rmSync(path.join(f.dir, 'infra/prometheus/alerts.yml'));
  const missing = f.run(['--dry-run'], { NETWORK_LOG: networkLog });
  assert.notEqual(missing.status, 0);
  assert.equal(missing.evidence.summary.alertVerification, 'failed');
  assert.equal(fs.existsSync(networkLog), false);
  fs.rmSync(path.join(f.dir, 'server/src/auth/auth.service.ts'));
  const badStatic = f.run(['--dry-run'], { NETWORK_LOG: networkLog });
  assert.equal(badStatic.evidence.summary.dosResilience, 'failed');
});

for (const tool of [
  'node',
  'bash',
  'dirname',
  'cat',
  'mkdir',
  'mktemp',
  'rm',
  'curl',
]) {
  test(`missing mode-required utility ${tool} fails before children or output`, (t) => {
    const f = fixture(t);
    fs.rmSync(path.join(f.bin, tool));
    const r = f.run(tool === 'curl' ? f.live : ['--dry-run']);
    assert.notEqual(r.status, 0);
    assert.equal(r.evidence, null);
    assert.deepEqual(f.calls(), []);
  });
}
test('broken installed imports fail preflight with controlled diagnostics', (t) => {
  const f = fixture(t);
  fs.writeFileSync(
    path.join(f.ops, 'verify-volume-encryption.js'),
    'throw Error("private-child-canary");',
  );
  const r = f.run(['--dry-run']);
  assert.notEqual(r.status, 0);
  assert.equal(r.evidence, null);
  assert.deepEqual(f.calls(), []);
});
test('explicit attached file overrides an unusable directory and empty environment is overridden by CLI origin', (t) => {
  const f = fixture(t),
    file = f.destination();
  fs.writeFileSync(path.join(f.dir, 'not-a-directory'), 'retained');
  const r = f.run(
    [
      '--dry-run',
      '--evidence-file=' + file,
      '--evidence-dir=not-a-directory/unused',
      '--api-url=' + origin,
    ],
    { API_URL: '' },
    { defaults: true, file },
  );
  assert.equal(r.status, 0, r.output);
  assert.equal(
    fs.readFileSync(path.join(f.dir, 'not-a-directory'), 'utf8'),
    'retained',
  );
});
test('C1 controls in overridden directory and dry references remain invalid option values', (t) => {
  const f = fixture(t);
  for (const option of ['evidence-dir', 'operator-reference']) {
    const r = f.run(['--dry-run', '--' + option + '=private\u0085value']);
    assert.notEqual(r.status, 0);
    assert.equal(r.evidence, null);
  }
  assert.deepEqual(f.calls(), []);
});
test('staging allocation failure cleans resources after evaluated children', (t) => {
  const f = fixture(t);
  f.tool(
    'mktemp',
    '#!/usr/bin/bash\nif [[ "$1" != -d ]]; then exit 1; fi\nexec /usr/bin/mktemp "$@"\n',
  );
  const r = f.run(['--dry-run']);
  assert.notEqual(r.status, 0);
  assert.equal(r.evidence, null);
  assert.equal(f.calls().length, 3);
});

for (const name of [
  'readBoundedJson',
  'validDosEvidence',
  'validDatabaseTelemetry',
  'targetId',
]) {
  test(`partial helper export ${name} fails dry preflight before children`, (t) => {
    const f = fixture(t);
    fs.appendFileSync(
      path.join(f.ops, 'launch-target-evidence.js'),
      '\ndelete module.exports.' + name + ';\n',
    );
    const r = f.run(['--dry-run']);
    assert.notEqual(r.status, 0);
    assert.equal(r.evidence, null);
    assert.deepEqual(f.calls(), []);
  });
}

test('stopped active child remains owned until termination and is killed on interruption', async (t) => {
  const f = fixture(t),
    file = f.destination();
  const child = spawn(
    '/usr/bin/bash',
    [f.script, '--dry-run', '--evidence-file', file],
    { env: f.environment({ ALERTS_SCENARIO: 'signal' }), stdio: 'ignore' },
  );
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  t.after(() => {
    try {
      child.kill('SIGTERM');
    } catch {}
  });
  const until = Date.now() + 5000;
  while (f.calls().length === 0 && Date.now() < until)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(f.calls().length);
  const active = f.calls()[0];
  t.after(() => {
    try {
      process.kill(active.pid, 'SIGKILL');
    } catch {}
  });
  process.kill(active.pid, 'SIGSTOP');
  while (
    !/^State:\s+T/m.test(
      fs.readFileSync('/proc/' + active.pid + '/status', 'utf8'),
    ) &&
    Date.now() < until
  )
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(
    fs.readFileSync('/proc/' + active.pid + '/status', 'utf8'),
    /^State:\s+T/m,
  );
  child.kill('SIGTERM');
  assert.equal(await closed, 143);
  assert.throws(() => process.kill(active.pid, 0), /ESRCH/);
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(fs.readdirSync(f.tmp), []);
});
