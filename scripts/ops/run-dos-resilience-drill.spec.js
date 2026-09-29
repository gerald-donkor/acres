const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const { targetId, validDosEvidence } = require('./launch-target-evidence');
const childEnv = { ...process.env };
delete childEnv.NODE_TEST_CONTEXT;
const root = path.resolve(__dirname, '../..');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-dos-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const file of [
    'scripts/ops/run-dos-resilience-drill.sh',
    'scripts/ops/launch-target-evidence.js',
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
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.writeFileSync(
    path.join(dir, 'bin/curl'),
    `#!/usr/bin/env node
const fs=require('node:fs');
const path=require('node:path');
const a=process.argv.slice(2), mode=process.env.SCENARIO;
const value=k=>a[a.indexOf(k)+1];
const url=a[a.length-1];
const log=process.env.CURL_LOG;
if(mode==='signal') {
 fs.appendFileSync(log,JSON.stringify({args:a,headersPaired:false,privateMode:0o700})+'\\n');
 setTimeout(()=>process.exit(1),1000);
 return;
}
const calls=fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\\n').filter(Boolean).map(JSON.parse):[];
const login=url.endsWith('/login'), csrf=url.endsWith('/csrf');
if(a[0]!=='-q' || value('--connect-timeout')!=='2' || value('--max-time')!=='5' || value('--max-filesize')!=='65536') process.exit(90);
if(a.some(x=>['-L','--location','-k','--insecure','--retry'].includes(x))) process.exit(91);
const header=login?fs.readFileSync(value('--header').slice(1),'utf8'):'';
if(login && (!header.includes('x-csrf-token: private-csrf-token') ||
    !fs.readFileSync(value('--cookie'),'utf8').includes('private-cookie') ||
    value('--cookie')!==value('--cookie-jar') || value('--request')!=='POST')) process.exit(92);
if(csrf && mode!=='csrf-cookie') fs.writeFileSync(value('--cookie-jar'),'#HttpOnly_private.example\\tFALSE\\t/\\tTRUE\\t0\\tacres_csrf\\tprivate-cookie\\n');
const entry={args:a,headersPaired:login,privateMode:fs.statSync(path.dirname(value('--output'))).mode&0o777};
fs.appendFileSync(log,JSON.stringify(entry)+'\\n');
let status=200,body={ok:true,data:{status:'ok',service:'acres-api',uptimeSeconds:3}};
if(mode==='unreachable' || (login && ['transport','timeout'].includes(mode))) {process.stdout.write('000');process.exit(mode==='timeout'?28:7);}
if(mode==='malformed-status') {process.stdout.write('wat');process.exit(0);}
if(!login && !csrf && mode==='wrong-health') body={ok:true,data:{status:'ok'}};
if(!login && !csrf && calls.some(x=>x.headersPaired) && mode==='post-fail') status=503;
if(csrf) {
 body={ok:true,data:{csrfToken:'private-csrf-token',headerName:'x-csrf-token'}};
 if(mode==='csrf-status') status=403;
 if(mode==='csrf-empty') body.data.csrfToken='';
 if(mode==='csrf-header') body.data.headerName='wrong';
 if(mode==='csrf-control') body.data.csrfToken='bad\\r\\nheader';
 if(mode==='csrf-ok') body.ok=false;
 if(mode==='csrf-contradictory') body.error={code:'CSRF_INVALID'};
}
if(login) {
 const count=calls.filter(x=>x.headersPaired).length;
 status= count>=10 && mode!=='no-throttle'?429:401;
 body={ok:false,error:{code:status===429?'RATE_LIMITED':'INVALID_CREDENTIALS',message:'generic'}};
 if(mode==='wrong-429' && status===429) body={ok:false,error:{code:'OTHER',message:'generic'}};
 if(mode==='wrong-401') body.error.code='UNAUTHENTICATED';
 if(mode==='bad-envelope') body={ok:true,error:body.error};
 if(mode==='login-contradictory') body.data={session:'must-not-leak'};
 if(mode==='login-html') body='not json';
 if(['200','400','403','404','500','302'].includes(mode)) status=Number(mode);
}
fs.writeFileSync(value('--output'),typeof body==='string'?body:JSON.stringify(body));
process.stdout.write(String(status));
`,
    { mode: 0o700 },
  );
  const file = path.join(dir, `evidence 'quoted'.json`);
  const log = path.join(dir, 'calls.jsonl');
  const run = (args = [], scenario = '', env = {}) => {
    fs.rmSync(log, { force: true });
    const started = Date.now();
    const result = spawnSync(
      'bash',
      [
        path.join(dir, 'scripts/ops/run-dos-resilience-drill.sh'),
        '--evidence-file',
        file,
        '--api-url',
        'https://private.example/',
        ...args,
      ],
      {
        encoding: 'utf8',
        timeout: 30000,
        env: {
          ...childEnv,
          PATH: `${dir}/bin:${process.env.PATH}`,
          CURL_LOG: log,
          SCENARIO: scenario,
          ...env,
        },
      },
    );
    assert.equal(result.error, undefined, 'Bash process must execute');
    const output = result.stdout + result.stderr;
    assert.doesNotMatch(
      output,
      /private\.example|private-csrf-token|private-cookie/,
    );
    const evidence = fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, 'utf8'))
      : null;
    if (evidence)
      assert.doesNotMatch(
        JSON.stringify(evidence),
        /private\.example|private-csrf-token|private-cookie/,
      );
    const calls = fs.existsSync(log)
      ? fs
          .readFileSync(log, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(JSON.parse)
      : [];
    for (const call of calls) {
      assert.equal(call.privateMode, 0o700);
      assert.equal(
        fs.existsSync(
          path.dirname(call.args[call.args.indexOf('--output') + 1]),
        ),
        false,
        'temporary responses cleaned',
      );
    }
    return { ...result, evidence, calls, started, ended: Date.now(), output };
  };
  return { dir, file, run };
}

test('help, unknown flags, malformed values and unsafe origins have no network side effects', (t) => {
  const { run } = fixture(t);
  assert.equal(run(['--help']).status, 0);
  for (const args of [
    ['--unknown'],
    ...['--evidence-dir', '--evidence-file', '--api-url'].flatMap((k) => [
      [k],
      [k, ''],
      [k, '--dry-run'],
    ]),
    ...[
      'file:///tmp/x',
      'https://u:p@example.org/',
      'https://example.org/?token=x',
      'https://example.org/#x',
      'https://example.org/?',
      'https://example.org/#',
      'https://example.org/path',
      'https://example.org/\nx',
    ].map((url) => ['--api-url', url]),
  ]) {
    const r = run(args);
    assert.notEqual(r.status, 0, JSON.stringify(args));
    assert.equal(r.calls.length, 0);
  }
});

test('environment origins also fail closed', (t) => {
  const { dir } = fixture(t);
  for (const value of [
    '',
    'file:///tmp/x',
    'https://x/path',
    'https://u:p@x/',
  ]) {
    const r = spawnSync(
      'bash',
      [path.join(dir, 'scripts/ops/run-dos-resilience-drill.sh'), '--dry-run'],
      {
        encoding: 'utf8',
        env: {
          ...childEnv,
          API_URL: value,
          PATH: `${dir}/bin:${process.env.PATH}`,
        },
      },
    );
    assert.notEqual(r.status, 0);
    assert.equal(fs.existsSync(path.join(dir, 'backups')), false);
  }
});

test('offline checks skip every request and emit truthful evidence at custom quoted paths', (t) => {
  const { run } = fixture(t);
  const r = run(['--dry-run']);
  assert.equal(r.status, 0, r.output);
  assert.equal(r.calls.length, 0);
  assert.equal(
    validDosEvidence(r.evidence, true, null, r.started, r.ended),
    true,
  );
  assert.match(r.output, /Live rate limiting was not exercised/);
});

test('live bounded throttle propagates cookie/token, normalizes origin and cleans private files', (t) => {
  const { run } = fixture(t);
  const r = run();
  assert.equal(r.status, 0, r.output);
  assert.equal(
    validDosEvidence(
      r.evidence,
      false,
      targetId('https://private.example'),
      r.started,
      r.ended,
    ),
    true,
  );
  assert.equal(r.calls.length, 18);
  assert.equal(
    r.evidence.layers.layer6_rate_limiter_burst.attemptedRequests,
    15,
  );
  assert.equal(
    r.evidence.layers.layer6_rate_limiter_burst.throttledRequests,
    5,
  );
  assert.ok(r.calls.every((c) => !c.args.at(-1).includes('example//')));
});

for (const scenario of [
  'unreachable',
  'wrong-health',
  'csrf-status',
  'csrf-empty',
  'csrf-header',
  'csrf-control',
  'csrf-ok',
  'csrf-cookie',
  'csrf-contradictory',
  'no-throttle',
  'wrong-429',
  'wrong-401',
  'bad-envelope',
  'login-html',
  'login-contradictory',
  '200',
  '400',
  '403',
  '404',
  '500',
  '302',
  'transport',
  'timeout',
  'malformed-status',
  'post-fail',
]) {
  test(`live ${scenario} fails without successful evidence or unbounded traffic`, (t) => {
    const { run } = fixture(t);
    const r = run([], scenario);
    assert.notEqual(r.status, 0, r.output);
    assert.equal(r.evidence.status, 'failed');
    assert.equal(r.evidence.layers.layer6_rate_limiter_burst.passed, false);
    assert.ok(r.evidence.failures.length > 0);
    assert.ok(r.calls.filter((c) => c.headersPaired).length <= 15);
    if (
      [
        '200',
        '400',
        '403',
        '404',
        '500',
        '302',
        'transport',
        'timeout',
        'bad-envelope',
        'wrong-401',
        'login-html',
        'login-contradictory',
      ].includes(scenario)
    ) {
      assert.equal(r.calls.length, 3, 'unexpected traffic stops immediately');
    }
  });
}

test('missing/pattern-failing repository protections fail static checks and skip traffic', (t) => {
  const { run, dir } = fixture(t);
  const source = path.join(dir, 'server/src/auth/auth.service.ts');
  fs.writeFileSync(source, 'missing the protection');
  assert.notEqual(run(['--dry-run']).status, 0);
  fs.rmSync(source);
  const r = run();
  assert.notEqual(r.status, 0);
  assert.equal(r.calls.length, 0);
});

test('write failure fails and invalidates a previous success artifact', (t) => {
  const { run, dir, file } = fixture(t);
  assert.equal(run(['--dry-run']).status, 0);
  assert.notEqual(run([], 'unreachable').status, 0);
  assert.equal(JSON.parse(fs.readFileSync(file)).status, 'failed');
  const blocker = path.join(dir, 'blocker');
  fs.writeFileSync(blocker, 'file');
  assert.notEqual(
    run(['--dry-run', '--evidence-file', `${blocker}/evidence.json`]).status,
    0,
  );
});

test('default evidence names do not collide in the same second', (t) => {
  const { dir } = fixture(t);
  const script = path.join(dir, 'scripts/ops/run-dos-resilience-drill.sh');
  for (let i = 0; i < 2; i++)
    assert.equal(
      spawnSync('bash', [script, '--dry-run'], {
        env: { ...childEnv, PATH: `${dir}/bin:${process.env.PATH}` },
      }).status,
      0,
    );
  assert.equal(
    fs
      .readdirSync(path.join(dir, 'backups'))
      .filter((n) => n.startsWith('dos-resilience-evidence-')).length,
    2,
  );
});

test('catchable interruption cleans responses and invalidates stale success', async (t) => {
  const { dir, file } = fixture(t);
  fs.writeFileSync(file, JSON.stringify({ status: 'success' }));
  const log = path.join(dir, 'signal-log');
  const r = await new Promise((resolve) => {
    const child = spawn(
      'bash',
      [
        path.join(dir, 'scripts/ops/run-dos-resilience-drill.sh'),
        '--evidence-file',
        file,
      ],
      {
        env: {
          ...childEnv,
          PATH: `${dir}/bin:${process.env.PATH}`,
          SCENARIO: 'signal',
          CURL_LOG: log,
        },
        stdio: 'ignore',
      },
    );
    const timer = setInterval(() => {
      if (fs.existsSync(log)) {
        clearInterval(timer);
        child.kill('SIGTERM');
      }
    }, 10);
    child.on('exit', (code, signal) => {
      clearInterval(timer);
      resolve({ code, signal });
    });
  });
  assert.notEqual(r.code, 0);
  assert.equal(fs.existsSync(file), false);
  const call = JSON.parse(fs.readFileSync(log, 'utf8').trim());
  assert.equal(
    fs.existsSync(path.dirname(call.args[call.args.indexOf('--output') + 1])),
    false,
  );
});
