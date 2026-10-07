const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const { targetId, validDosEvidence } = require('./launch-target-evidence');
const childEnv = { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' };
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
  fs.mkdirSync(path.join(dir, 'tmp'));
  for (const tool of ['bash', 'dirname', 'mkdir', 'mktemp', 'ln', 'rm', 'cat'])
    fs.symlinkSync(`/usr/bin/${tool}`, path.join(dir, 'bin', tool));
  fs.symlinkSync(process.execPath, path.join(dir, 'bin/node'));
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
 fs.appendFileSync(log,JSON.stringify({args:a.slice(0,-1),headersPaired:false,privateMode:0o700})+'\\n');
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
if(csrf && mode!=='csrf-cookie') fs.writeFileSync(value('--cookie-jar'),'#HttpOnly_'+new URL(url).hostname+'\\tFALSE\\t/\\tTRUE\\t0\\tacres_csrf\\tprivate-cookie\\n');
if(login && [value('--header').slice(1),value('--cookie')].some(f=>(fs.statSync(f).mode&0o777)!==0o600)) process.exit(93);
const entry={args:a.slice(0,-1),normalized:!url.includes('example//'),headersPaired:login,privateMode:fs.statSync(path.dirname(value('--output'))).mode&0o777};
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
  const run = (args = [], scenario = '', env = {}, options = {}) => {
    fs.rmSync(log, { force: true });
    const started = Date.now();
    const result = spawnSync(
      '/usr/bin/bash',
      [
        path.join(dir, 'scripts/ops/run-dos-resilience-drill.sh'),
        ...(!args.some(
          (a) => a === '--evidence-file' || a.startsWith('--evidence-file='),
        ) && !options.defaults
          ? ['--evidence-file', file]
          : []),
        ...(!args.some(
          (a) => a === '--api-url' || a.startsWith('--api-url='),
        ) && !options.defaults
          ? ['--api-url', 'https://private.example/']
          : []),
        ...args,
      ],
      {
        cwd: options.cwd || dir,
        encoding: 'utf8',
        timeout: 30000,
        env: {
          ...childEnv,
          PATH: `${dir}/bin`,
          TMPDIR: path.join(dir, 'tmp'),
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
      /private\.example|private-csrf-token|private-cookie|injected-private-error/,
    );
    const selected = options.file || file;
    const evidence =
      fs.existsSync(selected) && fs.statSync(selected).isFile()
        ? JSON.parse(fs.readFileSync(selected, 'utf8'))
        : null;
    if (evidence)
      assert.doesNotMatch(
        JSON.stringify(evidence),
        /private\.example|private-csrf-token|private-cookie|injected-private-error/,
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
  return {
    dir,
    file,
    log,
    run,
    script: path.join(dir, 'scripts/ops/run-dos-resilience-drill.sh'),
    env: {
      ...childEnv,
      PATH: path.join(dir, 'bin'),
      TMPDIR: path.join(dir, 'tmp'),
      CURL_LOG: log,
    },
  };
}

test('help, unknown flags, malformed values and unsafe origins have no network side effects', (t) => {
  const { run } = fixture(t);
  assert.equal(run(['--help']).status, 0);
  assert.equal(run(['-h']).status, 0);
  for (const args of [
    ['--unknown'],
    ['unexpected'],
    ...['--cwd', '--evidence-dir', '--evidence-file', '--api-url'].flatMap(
      (k) => [
        [k],
        [k, ''],
        [k, '--dry-run'],
        [k, '  \t '],
        [k + '='],
        [k + '=  '],
      ],
    ),
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
    '  ',
    '\n',
    'file:///tmp/x',
    'https://x/path',
    'https://u:p@x/',
  ]) {
    const r = spawnSync(
      '/usr/bin/bash',
      [path.join(dir, 'scripts/ops/run-dos-resilience-drill.sh'), '--dry-run'],
      {
        encoding: 'utf8',
        env: {
          ...childEnv,
          API_URL: value,
          PATH: `${dir}/bin`,
          TMPDIR: path.join(dir, 'tmp'),
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
  assert.ok(r.calls.every((c) => c.normalized));
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
  const first = run(['--dry-run']);
  assert.notEqual(first.status, 0);
  assert.equal(first.evidence.status, 'failed');
  fs.rmSync(path.join(dir, `evidence 'quoted'.json`));
  fs.rmSync(source);
  const r = run();
  assert.notEqual(r.status, 0);
  assert.equal(r.calls.length, 0);
});

test('existing receipts and unusable ancestors fail before traffic and retain bytes', (t) => {
  const { run, dir, file } = fixture(t);
  assert.equal(run(['--dry-run']).status, 0);
  const retained = fs.readFileSync(file);
  assert.notEqual(run([], 'unreachable').status, 0);
  assert.deepEqual(fs.readFileSync(file), retained);
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
        env: { ...childEnv, PATH: `${dir}/bin`, TMPDIR: path.join(dir, 'tmp') },
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

test(
  'catchable interruption cleans responses and retains unrelated stale success',
  { timeout: 10000 },
  async (t) => {
    const { dir, file } = fixture(t);
    fs.writeFileSync(file, JSON.stringify({ status: 'success' }));
    const log = path.join(dir, 'signal-log');
    const active = path.join(dir, 'active.json');
    const r = await new Promise((resolve, reject) => {
      const child = spawn(
        '/usr/bin/bash',
        [
          path.join(dir, 'scripts/ops/run-dos-resilience-drill.sh'),
          '--evidence-file',
          active,
        ],
        {
          env: {
            ...childEnv,
            PATH: `${dir}/bin`,
            TMPDIR: path.join(dir, 'tmp'),
            SCENARIO: 'signal',
            CURL_LOG: log,
          },
          stdio: 'ignore',
        },
      );
      const deadline = setTimeout(() => {
        child.kill('SIGKILL');
        reject(Error('signal synchronization deadline'));
      }, 5000);
      t.after(() => {
        clearTimeout(deadline);
        child.kill('SIGKILL');
      });
      const timer = setInterval(() => {
        if (fs.existsSync(log)) {
          clearInterval(timer);
          child.kill('SIGTERM');
        }
      }, 10);
      child.on('exit', (code, signal) => {
        clearInterval(timer);
        clearTimeout(deadline);
        resolve({ code, signal });
      });
    });
    assert.notEqual(r.code, 0);
    assert.equal(fs.existsSync(active), false);
    assert.equal(JSON.parse(fs.readFileSync(file)).status, 'success');
    const call = JSON.parse(fs.readFileSync(log, 'utf8').trim());
    assert.equal(
      fs.existsSync(path.dirname(call.args[call.args.indexOf('--output') + 1])),
      false,
    );
  },
);

const valueOptions = [
  '--cwd',
  '--evidence-dir',
  '--evidence-file',
  '--api-url',
];
for (const opt of valueOptions) {
  test(`${opt} rejects every duplicate form before output or traffic`, (t) => {
    const f = fixture(t),
      v =
        opt === '--cwd'
          ? f.dir
          : opt === '--api-url'
            ? 'https://private.example'
            : path.join(f.dir, 'fresh');
    for (const first of [[opt, v], [`${opt}=${v}`]])
      for (const second of [[opt, v], [`${opt}=${v}`]]) {
        const r = f.run([...first, ...second, '--dry-run']);
        assert.notEqual(r.status, 0);
        assert.equal(r.calls.length, 0);
        assert.equal(fs.existsSync(path.join(f.dir, 'fresh')), false);
      }
  });
}

test('attached forms, target cwd, installation helper and effective output selection', (t) => {
  const f = fixture(t);
  const caller = path.join(f.dir, 'caller');
  fs.mkdirSync(caller);
  const target = path.join(f.dir, "target 'quoted'");
  fs.mkdirSync(target);
  fs.cpSync(path.join(f.dir, 'server'), path.join(target, 'server'), {
    recursive: true,
  });
  fs.cpSync(path.join(f.dir, 'infra'), path.join(target, 'infra'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(target, 'scripts/ops'), { recursive: true });
  fs.writeFileSync(
    path.join(target, 'scripts/ops/launch-target-evidence.js'),
    "throw Error('injected-private-error');",
  );
  const selected = path.join(target, '-receipt.json');
  const r = f.run(
    [
      "--cwd=../target 'quoted'",
      '--evidence-file=-receipt.json',
      '--evidence-dir=unused',
      '--api-url=https://PRIVATE.example:443/',
      '--dry-run',
    ],
    '',
    {},
    { cwd: caller, file: selected },
  );
  assert.equal(r.status, 0, r.output);
  assert.equal(r.calls.length, 0);
  assert.equal(
    validDosEvidence(r.evidence, true, null, r.started, r.ended),
    true,
  );
  assert.equal(
    validDosEvidence(r.evidence, false, null, r.started, r.ended),
    false,
  );
  assert.equal(fs.statSync(selected).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(path.join(target, 'unused')), false);
  const r2 = f.run(
    ['--cwd', target, '--evidence-file', 'second.json', '--dry-run'],
    '',
    {},
    { cwd: caller, file: path.join(target, 'second.json') },
  );
  assert.equal(r2.status, 0, r2.output);
  const r3 = f.run(
    ['--dry-run', '--evidence-dir=defaults'],
    '',
    {},
    { defaults: true, cwd: caller },
  );
  assert.equal(r3.status, 0, r3.output);
  assert.equal(fs.readdirSync(path.join(f.dir, 'defaults')).length, 1);
  assert.equal(fs.existsSync(path.join(caller, 'defaults')), false);
  const r4 = f.run(
    ['--cwd', target, '--evidence-file=failed.json'],
    '',
    {},
    { file: path.join(target, 'failed.json') },
  );
  assert.equal(r4.status, 0, r4.output);
  fs.rmSync(path.join(target, 'server/src/auth/auth.service.ts'));
  const failed = f.run(
    ['--cwd', target, '--evidence-file=static-failed.json'],
    '',
    {},
    { file: path.join(target, 'static-failed.json') },
  );
  assert.notEqual(failed.status, 0);
  assert.equal(failed.calls.length, 0);
  assert.equal(failed.evidence.status, 'failed');
});

for (const kind of ['file', 'directory', 'symlink', 'dangling', 'trailing']) {
  test(`existing ${kind} destination is retained without private path diagnostics`, (t) => {
    const f = fixture(t),
      dest = path.join(f.dir, 'private-destination');
    if (kind === 'file') fs.writeFileSync(dest, 'retained bytes');
    if (kind === 'directory') fs.mkdirSync(dest);
    if (kind === 'symlink') fs.symlinkSync(f.dir, dest);
    if (kind === 'dangling') fs.symlinkSync(path.join(f.dir, 'absent'), dest);
    const r = f.run([
      '--evidence-file',
      dest + (kind === 'trailing' ? '/' : ''),
      '--dry-run',
    ]);
    assert.notEqual(r.status, 0);
    assert.equal(r.calls.length, 0);
    assert.equal(r.evidence, null);
    assert.ok(!r.output.includes(dest));
    assert.equal(fs.readdirSync(path.join(f.dir, 'tmp')).length, 0);
    if (kind === 'file')
      assert.equal(fs.readFileSync(dest, 'utf8'), 'retained bytes');
    if (kind === 'directory') assert.deepEqual(fs.readdirSync(dest), []);
    if (['symlink', 'dangling'].includes(kind))
      assert.equal(fs.lstatSync(dest).isSymbolicLink(), true);
  });
}

for (const tool of ['node', 'mkdir', 'mktemp', 'ln', 'rm', 'curl']) {
  test(`missing ${tool} fails before output (curl optional offline)`, (t) => {
    const f = fixture(t);
    fs.unlinkSync(path.join(f.dir, 'bin', tool));
    const r = f.run([
      '--evidence-file=fresh/receipt.json',
      ...(tool === 'curl' ? [] : ['--dry-run']),
    ]);
    assert.notEqual(r.status, 0);
    assert.equal(r.calls.length, 0);
    assert.equal(fs.existsSync(path.join(f.dir, 'fresh')), false);
    if (tool === 'curl') assert.equal(f.run(['--dry-run']).status, 0);
  });
}

test('missing helper, invalid cwd and dangling/non-directory parents create nothing', (t) => {
  const f = fixture(t);
  for (const cwd of [
    path.join(f.dir, 'absent'),
    path.join(f.dir, 'scripts/ops/launch-target-evidence.js'),
  ]) {
    const r = f.run(['--cwd', cwd, '--dry-run']);
    assert.notEqual(r.status, 0);
    assert.equal(r.calls.length, 0);
  }
  fs.symlinkSync(path.join(f.dir, 'absent'), path.join(f.dir, 'dangling'));
  const r = f.run(['--evidence-file=dangling/receipt.json', '--dry-run']);
  assert.notEqual(r.status, 0);
  assert.equal(r.calls.length, 0);
  fs.unlinkSync(path.join(f.dir, 'scripts/ops/launch-target-evidence.js'));
  const missing = f.run(['--evidence-file=fresh/receipt.json', '--dry-run']);
  assert.notEqual(missing.status, 0);
  assert.equal(fs.existsSync(path.join(f.dir, 'fresh')), false);
});

for (const origin of [
  'https://private.example/?',
  'https://private.example/#',
  'https://u:p@private.example',
  'ftp://private.example',
  'https://private.example/a',
  'https://private.example/\r',
  '   ',
  'https://private.example/\u007f',
]) {
  test('unsafe CLI origin fails with controlled diagnostics', (t) => {
    const f = fixture(t),
      r = f.run([
        '--api-url=' + origin,
        '--evidence-file=fresh/receipt.json',
        '--dry-run',
      ]);
    assert.notEqual(r.status, 0);
    assert.equal(r.calls.length, 0);
    assert.equal(fs.existsSync(path.join(f.dir, 'fresh')), false);
  });
}
for (const origin of [
  'http://127.0.0.1:3001',
  'https://host.example:8443/',
  'http://[::1]:3001/',
]) {
  test('URL-supported origins remain valid offline', (t) => {
    const f = fixture(t),
      r = f.run(['--api-url=' + origin, '--dry-run']);
    assert.equal(r.status, 0, r.output);
  });
}

function replaceTool(f, tool, source) {
  fs.unlinkSync(path.join(f.dir, 'bin', tool));
  fs.writeFileSync(
    path.join(f.dir, 'bin', tool),
    `#!${process.execPath}\n${source}`,
    { mode: 0o700 },
  );
}
for (const kind of ['file', 'directory', 'symlink', 'link-fail']) {
  test(`publication ${kind} race never overwrites or redirects evidence`, (t) => {
    const f = fixture(t);
    replaceTool(
      f,
      'ln',
      `
const fs=require('node:fs'),{spawnSync}=require('node:child_process');
const args=process.argv.slice(2),dest=args.at(-1);
${kind === 'file' ? "fs.writeFileSync(dest,'retained bytes');" : kind === 'directory' ? 'fs.mkdirSync(dest);' : kind === 'symlink' ? "fs.symlinkSync('absent',dest);" : "console.error('injected-private-error'); process.exit(1);"}
const r=spawnSync('/usr/bin/ln',args,{stdio:'inherit'}); process.exit(r.status??1);`,
    );
    const r = f.run(
      ['--dry-run'],
      '',
      {},
      { file: path.join(f.dir, 'not-selected') },
    );
    assert.notEqual(r.status, 0);
    assert.doesNotMatch(r.output, /Passed:|Offline repository checks/);
    assert.equal(fs.readdirSync(path.join(f.dir, 'tmp')).length, 0);
    assert.equal(
      fs.readdirSync(f.dir).some((n) => n.startsWith('.dos-evidence.')),
      false,
    );
    if (kind === 'file')
      assert.equal(fs.readFileSync(f.file, 'utf8'), 'retained bytes');
    if (kind === 'directory') assert.deepEqual(fs.readdirSync(f.file), []);
    if (kind === 'symlink') assert.equal(fs.readlinkSync(f.file), 'absent');
    if (kind === 'link-fail') assert.equal(fs.existsSync(f.file), false);
  });
}
for (const tool of ['mkdir', 'mktemp']) {
  test(`${tool} preparation failure has controlled errors and owned cleanup`, (t) => {
    const f = fixture(t);
    replaceTool(
      f,
      tool,
      `console.error('injected-private-error');process.exit(1);`,
    );
    const r = f.run(['--dry-run', '--evidence-file=fresh/receipt.json']);
    assert.notEqual(r.status, 0);
    assert.equal(r.evidence, null);
    assert.equal(r.calls.length, 0);
    assert.equal(fs.readdirSync(path.join(f.dir, 'tmp')).length, 0);
    assert.doesNotMatch(r.output, /Passed:|Offline repository checks/);
  });
}
for (const scenario of [
  'early',
  'partial',
  'write-fail',
  'missing-target',
  'wrong-target',
  'partial-burst',
  'missing-counter',
  'wrong-counter',
  'wrong-burst-mode',
  'wrong-probe',
  'stale-time',
  'noncanonical-time',
]) {
  test(`serializer ${scenario} cannot publish a receipt`, (t) => {
    const f = fixture(t);
    replaceTool(
      f,
      'node',
      `
const fs=require('node:fs'),{spawnSync}=require('node:child_process');
const args=process.argv.slice(2); let input=args[0]==='-'?fs.readFileSync(0,'utf8'):undefined;
const serializer=input?.includes("const evidence={timestamp");
if(serializer && ['early','partial','write-fail'].includes(${JSON.stringify(scenario)})) {
 ${scenario === 'partial' ? "fs.writeFileSync(args[1],'{');" : ''}
 ${scenario === 'write-fail' ? "input = \"require('node:fs').writeFileSync=()=>{throw Error('injected-private-error');};\\n\" + input;" : 'process.exit(0);'}
}
const r=spawnSync(${JSON.stringify(process.execPath)},args,{input,stdio:['pipe','inherit','inherit']});
if(serializer && r.status===0) {
 const e=JSON.parse(fs.readFileSync(args[1],'utf8')),burst=e.layers.layer6_rate_limiter_burst;
 const scenario=${JSON.stringify(scenario)};
 if(scenario==='missing-target') delete e.apiTargetId;
 if(scenario==='wrong-target') e.apiTargetId='wrong';
 if(scenario==='partial-burst') e.layers.layer6_rate_limiter_burst={};
 if(scenario==='missing-counter') delete burst.attemptedRequests;
 if(scenario==='wrong-counter') burst.throttledRequests=1;
 if(scenario==='wrong-burst-mode') burst.burstTestMode='live';
 if(scenario==='wrong-probe') burst.csrfHandshakePassed=true;
 if(scenario==='stale-time') e.timestamp=new Date(Date.now()-120000).toISOString();
 if(scenario==='noncanonical-time') e.timestamp=e.timestamp.replace('Z','+00:00');
 fs.writeFileSync(args[1],JSON.stringify(e));
}
process.exit(r.status??1);`,
    );
    const r = f.run(['--dry-run']);
    assert.notEqual(r.status, 0);
    assert.equal(r.evidence, null);
    assert.doesNotMatch(r.output, /Passed:|Offline repository checks/);
    assert.equal(
      fs.readdirSync(f.dir).some((n) => n.startsWith('.dos-evidence.')),
      false,
    );
    assert.equal(fs.readdirSync(path.join(f.dir, 'tmp')).length, 0);
  });
}

test(
  'concurrent defaults publish distinct complete private receipts',
  { timeout: 10000 },
  async (t) => {
    const f = fixture(t);
    const execute = () =>
      new Promise((resolve, reject) => {
        const c = spawn('/usr/bin/bash', [f.script, '--dry-run'], {
          env: f.env,
          cwd: f.dir,
          stdio: 'ignore',
        });
        const timer = setTimeout(() => {
          c.kill('SIGKILL');
          reject(Error('process deadline'));
        }, 5000);
        t.after(() => {
          clearTimeout(timer);
          c.kill('SIGKILL');
        });
        c.on('error', reject);
        c.on('exit', (code) => {
          clearTimeout(timer);
          resolve(code);
        });
      });
    assert.deepEqual(await Promise.all([execute(), execute()]), [0, 0]);
    const files = fs.readdirSync(path.join(f.dir, 'backups'));
    assert.equal(files.length, 2);
    for (const name of files) {
      assert.match(name, /^dos-resilience-evidence-[0-9a-f-]+\.json$/);
      const file = path.join(f.dir, 'backups', name);
      assert.equal(JSON.parse(fs.readFileSync(file)).status, 'success');
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    }
    assert.equal(fs.statSync(path.join(f.dir, 'backups')).mode & 0o777, 0o700);
  },
);

for (const signal of ['SIGTERM', 'SIGHUP']) {
  test(
    `publication ${signal} cleans owned staging and retains prior evidence`,
    { timeout: 10000 },
    async (t) => {
      const f = fixture(t),
        entered = path.join(f.dir, 'entered'),
        gate = path.join(f.dir, 'release'),
        stale = path.join(f.dir, 'stale.json');
      fs.writeFileSync(stale, 'retained bytes');
      replaceTool(
        f,
        'ln',
        `
const fs=require('node:fs');
fs.writeFileSync(${JSON.stringify(entered)},process.argv.at(-2));
const deadline=setTimeout(()=>process.exit(1),4000);
const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(gate)})){clearInterval(timer);clearTimeout(deadline);process.exit(1);}},10);`,
      );
      const child = spawn(
        '/usr/bin/bash',
        [f.script, '--evidence-file', f.file, '--dry-run'],
        { cwd: f.dir, env: f.env, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let output = '';
      child.stdout.on('data', (d) => (output += d));
      child.stderr.on('data', (d) => (output += d));
      const finished = new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', (code, sig) => resolve({ code, sig }));
      });
      let timer, deadline;
      t.after(() => {
        clearInterval(timer);
        clearTimeout(deadline);
        child.kill('SIGKILL');
        if (fs.existsSync(f.dir)) fs.writeFileSync(gate, 'release');
      });
      await new Promise((resolve, reject) => {
        deadline = setTimeout(
          () => reject(Error('publication synchronization deadline')),
          4000,
        );
        timer = setInterval(() => {
          if (fs.existsSync(entered)) {
            clearInterval(timer);
            clearTimeout(deadline);
            resolve();
          }
        }, 10);
      });
      child.kill(signal);
      fs.writeFileSync(gate, 'release');
      const r = await finished;
      assert.notEqual(r.code, 0);
      assert.equal(fs.existsSync(f.file), false);
      assert.equal(fs.readFileSync(stale, 'utf8'), 'retained bytes');
      assert.equal(fs.existsSync(fs.readFileSync(entered, 'utf8')), false);
      assert.equal(fs.readdirSync(path.join(f.dir, 'tmp')).length, 0);
      assert.doesNotMatch(
        output,
        /Passed:|Offline repository checks|injected-private-error/,
      );
    },
  );
}

test('cleanup failure cannot emit success and preserves non-owned evidence', (t) => {
  const f = fixture(t),
    retained = path.join(f.dir, 'retained.json');
  fs.writeFileSync(retained, 'retained bytes');
  replaceTool(
    f,
    'rm',
    `console.error('injected-private-error');process.exit(1);`,
  );
  const r = f.run(['--dry-run']);
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.output, /Passed:|Offline repository checks/);
  assert.equal(fs.readFileSync(retained, 'utf8'), 'retained bytes');
});

test('separate directory option resolves privately at target cwd', (t) => {
  const f = fixture(t),
    dir = "output 'quoted'";
  const r = f.run(
    ['--evidence-dir', dir, '--dry-run'],
    '',
    {},
    { defaults: true },
  );
  assert.equal(r.status, 0, r.output);
  assert.equal(r.calls.length, 0);
  const out = path.join(f.dir, dir),
    files = fs.readdirSync(out);
  assert.equal(files.length, 1);
  assert.equal(fs.statSync(out).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(out, files[0])).mode & 0o777, 0o600);
});

test('staging allocation failure cleans already-created private resources', (t) => {
  const f = fixture(t);
  replaceTool(
    f,
    'mktemp',
    `
const {spawnSync}=require('node:child_process');const args=process.argv.slice(2);
if(args[0]!=='-d'){console.error('injected-private-error');process.exit(1);}
const r=spawnSync('/usr/bin/mktemp',args,{stdio:'inherit'});process.exit(r.status??1);`,
  );
  const r = f.run(['--dry-run']);
  assert.notEqual(r.status, 0);
  assert.equal(r.evidence, null);
  assert.equal(fs.readdirSync(path.join(f.dir, 'tmp')).length, 0);
  assert.doesNotMatch(r.output, /Passed:|Offline repository checks/);
});
