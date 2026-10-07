const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const {
  CHECKS,
  runChecks,
  validateStaticEvidence,
  parseArgs,
  writeEvidence,
  main,
} = require('./run-static-integrity-checks');

const good = () => runChecks(() => ({ status: 0 }));
const CANARY = 'private-fixture-canary';
const BASH = '/usr/bin/bash';
assert.ok(fs.statSync(BASH).isFile());
fs.accessSync(BASH, fs.constants.X_OK);

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-static ' paths-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ops = path.join(dir, 'scripts/ops');
  fs.mkdirSync(ops, { recursive: true });
  const script = path.join(ops, 'run-static-integrity-checks.js');
  fs.copyFileSync(
    path.join(__dirname, 'run-static-integrity-checks.js'),
    script,
  );
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.symlinkSync(BASH, path.join(bin, 'bash'));
  const log = path.join(dir, 'calls');
  const marker = path.join(dir, 'marker');
  const release = path.join(dir, 'release');
  const output = path.join(dir, 'out/evidence.json');
  const env = { PATH: bin, CHILD_LOG: log, MARKER: marker, RELEASE: release };
  for (const { id, script: child } of CHECKS) {
    fs.writeFileSync(
      path.join(dir, child),
      `printf '%s|%s\\n' '${id}' "$PWD" >> "$CHILD_LOG"
printf '${CANARY}\\n'; printf '${CANARY}\\n' >&2
if [[ "$PAUSE" == '${id}' ]]; then
  printf ready > "$MARKER"
  read -r token < "$RELEASE"
fi
[[ "$FAIL" == '${id}' ]] && exit 7
exit 0
`,
    );
  }
  return {
    dir,
    ops,
    script,
    bin,
    log,
    marker,
    release,
    output,
    env,
    run: (args = [], options = {}) =>
      spawnSync(process.execPath, [script, ...args], {
        cwd: options.cwd || dir,
        env: { ...env, ...options.env },
        encoding: 'utf8',
        timeout: 5000,
      }),
    calls: () =>
      fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [],
  };
}

function privateResult(f, result, success = true) {
  assert.ifError(result.error);
  assert.equal(result.status, success ? 0 : 1, result.stderr);
  assert.ok(!(result.stdout + result.stderr).includes(CANARY));
  const receipt = JSON.parse(fs.readFileSync(f.output, 'utf8'));
  assert.equal(validateStaticEvidence(receipt).valid, success);
  assert.equal(fs.statSync(f.output).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(path.dirname(f.output)), ['evidence.json']);
  assert.ok(!JSON.stringify(receipt).includes(CANARY));
  assert.deepEqual(
    f.calls(),
    CHECKS.map(({ id }) => `${id}|${f.dir}`),
  );
  return receipt;
}

test('fixed ordered commands, root and complete counts', () => {
  const calls = [];
  const receipt = runChecks((binary, args, options) => {
    calls.push({ binary, args, options });
    return { status: 0 };
  });
  assert.deepEqual(
    calls.map((c) => c.args),
    CHECKS.map((c) => [c.script]),
  );
  assert.ok(
    calls.every(
      (c) =>
        c.binary === 'bash' &&
        c.options.stdio === 'ignore' &&
        c.options.cwd === path.resolve(__dirname, '../..'),
    ),
  );
  assert.equal(validateStaticEvidence(receipt).valid, true);
  assert.equal(receipt.totalChecks, 3);
  assert.equal(receipt.passedChecks, 3);
  assert.equal(receipt.failedChecks, 0);
});

for (const [index, check] of CHECKS.entries()) {
  test(`${check.id} evaluated failure runs later checks and publishes`, (t) => {
    const f = fixture(t);
    const r = f.run(['-o', f.output], { env: { FAIL: check.id } });
    const receipt = privateResult(f, r, false);
    assert.equal(receipt.checks[index].exitCode, 7);
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.passedChecks, 2);
    assert.equal(receipt.failedChecks, 1);
    assert.equal(validateStaticEvidence(receipt).failedCheckId, check.id);
  });
}

for (const result of [
  null,
  undefined,
  {},
  { status: null },
  { status: '0' },
  { status: -1 },
  { status: 256 },
  { status: 0.5 },
  { status: NaN },
  { status: Infinity },
  { status: 0, signal: 'SIGTERM' },
  { status: 0, error: Error(CANARY) },
]) {
  test(`malformed or signalled child result fails safely: ${String(result?.status)}/${result?.signal || ''}`, () => {
    let calls = 0;
    const receipt = runChecks(() => {
      calls++;
      return calls === 2 ? result : { status: 0 };
    });
    assert.equal(calls, 3);
    assert.deepEqual(receipt.checks[1], {
      id: 'docker_runtime',
      passed: false,
      exitCode: null,
      failureKind: 'spawn_failed',
    });
    assert.ok(!JSON.stringify(receipt).includes(CANARY));
  });
}
test('thrown execution fails safely and status 255 is a normal failure', () => {
  let calls = 0;
  const r = runChecks(() => {
    if (++calls === 1) throw Error(CANARY);
    return { status: 255 };
  });
  assert.equal(calls, 3);
  assert.equal(r.failedChecks, 3);
  assert.equal(r.checks[1].exitCode, 255);
});

const invalidArgs = [
  [],
  ['--output'],
  ['-o', '-name'],
  ['--output='],
  ['--output', ' '],
  ['-o', '\t'],
  ['--output=x\n'],
  ['-o', 'x\x7f'],
  ['--unknown', CANARY],
  ['positional'],
  ['--help', '-o', 'x'],
  ['-o=x', '--help'],
  ['-o', 'x', '--output=y'],
  ['--output=x', '-o=y'],
  ['-o', 'x/'],
];
test('all rejected invocations have no children, allocations or raw diagnostics', (t) => {
  const f = fixture(t);
  for (const args of invalidArgs) {
    assert.throws(() => parseArgs(args));
    const r = f.run(args);
    assert.ifError(r.error);
    assert.equal(r.status, 1);
    assert.ok(!r.stderr.includes(CANARY));
    assert.match(r.stderr, /publication failed; use --help/);
  }
  assert.deepEqual(f.calls(), []);
  assert.equal(fs.existsSync(path.dirname(f.output)), false);
});

test('help and import need neither children nor Bash and have no side effects', (t) => {
  const f = fixture(t);
  for (const c of CHECKS) fs.unlinkSync(path.join(f.dir, c.script));
  for (const flag of ['--help', '-h']) {
    const r = f.run([flag], { env: { PATH: f.dir } });
    assert.equal(r.status, 0);
    assert.match(
      r.stdout,
      /production_templates, docker_runtime, secret_defaults/,
    );
  }
  const r = spawnSync(
    process.execPath,
    ['-e', 'require(process.argv[1])', f.script],
    { cwd: f.dir, env: { PATH: f.dir }, encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(r.status, 0);
  assert.equal(r.stdout + r.stderr, '');
  assert.deepEqual(f.calls(), []);
  assert.equal(fs.existsSync(path.dirname(f.output)), false);
});
for (const args of [
  ['--output', 'out/evidence.json'],
  ['-o', 'out/evidence.json'],
  ['--output=out/evidence.json'],
  ['-o=out/evidence.json'],
]) {
  test(`CLI accepts ${args[0]}`, (t) => {
    const f = fixture(t);
    privateResult(f, f.run(args));
  });
}
test('attached dash paths and spaces/quotes are literal, relative to caller cwd', (t) => {
  const f = fixture(t);
  const caller = path.join(f.dir, "caller ' $ literal");
  fs.mkdirSync(caller);
  const name = "-receipt ' $(touch canary).json";
  const r = f.run([`-o=${name}`], { cwd: caller });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    validateStaticEvidence(JSON.parse(fs.readFileSync(path.join(caller, name))))
      .valid,
    true,
  );
  assert.deepEqual(fs.readdirSync(caller), [name]);
  assert.deepEqual(
    f.calls(),
    CHECKS.map((c) => `${c.id}|${f.dir}`),
  );
});

for (const kind of [
  'file',
  'directory',
  'link',
  'dangling',
  'parent-file',
  'parent-link',
  'parent-dangling',
  'no-bash',
  'no-child',
  'child-link',
  'trailing',
]) {
  test(`preflight rejects ${kind} before children/allocation`, (t) => {
    const f = fixture(t);
    let output = f.output;
    if (['file', 'directory', 'link', 'dangling'].includes(kind)) {
      fs.mkdirSync(path.dirname(output));
      if (kind === 'file') fs.writeFileSync(output, CANARY);
      if (kind === 'directory') fs.mkdirSync(output);
      if (kind === 'link' || kind === 'dangling')
        fs.symlinkSync(
          kind === 'link' ? f.script : path.join(f.dir, 'absent'),
          output,
        );
    }
    if (kind === 'parent-file') fs.writeFileSync(path.dirname(output), CANARY);
    if (kind.startsWith('parent-') && kind !== 'parent-file')
      fs.symlinkSync(
        kind === 'parent-link' ? f.ops : path.join(f.dir, 'absent'),
        path.dirname(output),
      );
    if (kind === 'no-child') fs.unlinkSync(path.join(f.dir, CHECKS[1].script));
    if (kind === 'child-link') {
      fs.unlinkSync(path.join(f.dir, CHECKS[1].script));
      fs.symlinkSync(f.script, path.join(f.dir, CHECKS[1].script));
    }
    if (kind === 'trailing') output += '/';
    const r = f.run(['--output', output], {
      env: kind === 'no-bash' ? { PATH: f.ops } : {},
    });
    assert.equal(r.status, 1, r.stderr);
    assert.deepEqual(f.calls(), []);
    assert.ok(!(r.stdout + r.stderr).includes(CANARY));
    if (kind === 'file') assert.equal(fs.readFileSync(output, 'utf8'), CANARY);
    if (kind === 'parent-file')
      assert.equal(fs.readFileSync(path.dirname(output), 'utf8'), CANARY);
    if (['no-bash', 'no-child', 'child-link', 'trailing'].includes(kind))
      assert.equal(fs.existsSync(path.dirname(f.output)), false);
  });
}

const mutations = [
  (r) => {
    r.status = 'failed';
  },
  (r) => {
    r.valid = 1;
  },
  (r) => {
    r.failedChecks = '0';
  },
  (r) => {
    r.totalChecks = 4;
  },
  (r) => {
    r.passedChecks = 2;
  },
  (r) => {
    r.drill_type = 'other';
  },
  (r) => {
    r.timestamp = '2026-02-30T00:00:00.000Z';
  },
  (r) => {
    r.timestamp = 'yesterday';
  },
  (r) => {
    r.checks.pop();
  },
  (r) => {
    r.checks.reverse();
  },
  (r) => {
    r.checks[1].id = r.checks[0].id;
  },
  (r) => {
    r.checks[0].passed = 'true';
  },
  (r) => {
    r.checks[0].exitCode = 1;
  },
  (r) => {
    r.checks[0].exitCode = null;
  },
  (r) => {
    r.checks[0].exitCode = 256;
  },
  (r) => {
    r.checks[0].failureKind = 'spawn_failed';
  },
  (r) => {
    r.checks[0] = null;
  },
];
test('inconsistent receipt types, counts, IDs, timestamps and results cannot publish', (t) => {
  const f = fixture(t);
  for (const mutate of mutations) {
    const r = good();
    mutate(r);
    assert.equal(validateStaticEvidence(r).valid, false);
    assert.throws(() => writeEvidence(f.output, r), /could not write evidence/);
  }
  assert.equal(fs.existsSync(path.dirname(f.output)), false);
  const failed = runChecks(() => null);
  failed.checks[1].failureKind = 'private';
  assert.throws(() => writeEvidence(f.output, failed));
});
test('direct publication suppresses arbitrary diagnostic payloads and toJSON', (t) => {
  const f = fixture(t);
  const r = good();
  r.extra = CANARY;
  r.toJSON = () => CANARY;
  r.checks[0].stdout = CANARY;
  writeEvidence(f.output, r);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(f.output)),
    goodWithTime(r.timestamp),
  );
  assert.ok(!fs.readFileSync(f.output, 'utf8').includes(CANARY));
  assert.throws(() => writeEvidence(f.output, good()));
});
function goodWithTime(timestamp) {
  return { ...good(), timestamp };
}

test('private modes under permissive umask preserve existing parent modes', (t) => {
  const f = fixture(t);
  fs.chmodSync(f.dir, 0o755);
  const old = process.umask(0);
  try {
    writeEvidence(f.output, good());
  } finally {
    process.umask(old);
  }
  assert.equal(fs.statSync(f.dir).mode & 0o777, 0o755);
  assert.equal(fs.statSync(path.dirname(f.output)).mode & 0o777, 0o700);
  assert.equal(fs.statSync(f.output).mode & 0o777, 0o600);
});

for (const method of [
  'accessSync',
  'mkdirSync',
  'openSync',
  'writeFileSync',
  'closeSync',
  'readFileSync',
  'linkSync',
  'unlinkSync',
]) {
  test(`${method} failure cleans owned resources and cannot report success`, (t) => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.dir, 'foreign.tmp'), CANARY);
    let calls = 0,
      fd;
    const io = {
      ...fs,
      [method]: (...args) => {
        if (++calls === 1)
          throw Object.assign(Error(CANARY), { code: 'EACCES' });
        return fs[method](...args);
      },
    };
    if (method !== 'openSync')
      io.openSync = (...args) => {
        fd = fs.openSync(...args);
        assert.equal(fs.fstatSync(fd).mode & 0o777, 0o600);
        return fd;
      };
    assert.throws(
      () => writeEvidence(f.output, good(), { fs: io }),
      /^Error: could not write evidence$/,
    );
    if (fd !== undefined)
      assert.throws(() => fs.fstatSync(fd), { code: 'EBADF' });
    assert.equal(
      fs.readFileSync(path.join(f.dir, 'foreign.tmp'), 'utf8'),
      CANARY,
    );
    if (fs.existsSync(path.dirname(f.output)))
      assert.deepEqual(
        fs.readdirSync(path.dirname(f.output)),
        method === 'unlinkSync' ? ['evidence.json'] : [],
      );
    if (method === 'unlinkSync')
      assert.equal(
        validateStaticEvidence(JSON.parse(fs.readFileSync(f.output))).valid,
        true,
      );
  });
}
test('close that closes then throws still removes its owned staging', (t) => {
  const f = fixture(t);
  const io = {
    ...fs,
    closeSync: (fd) => {
      fs.closeSync(fd);
      throw Error(CANARY);
    },
  };
  assert.throws(() => writeEvidence(f.output, good(), { fs: io }));
  assert.deepEqual(fs.readdirSync(path.dirname(f.output)), []);
});
test('persistent cleanup failure retains final receipt and foreign files, returns nonzero', (t) => {
  const f = fixture(t);
  const io = {
    ...fs,
    unlinkSync: () => {
      throw Error(CANARY);
    },
  };
  assert.throws(() => writeEvidence(f.output, good(), { fs: io }));
  assert.equal(
    validateStaticEvidence(JSON.parse(fs.readFileSync(f.output))).valid,
    true,
  );
  assert.equal(fs.readdirSync(path.dirname(f.output)).length, 2);
});
for (const serialize of [
  () => {
    throw Error(CANARY);
  },
  () => '{}',
  () => '{',
  () => undefined,
]) {
  test('serialization failure cannot allocate or publish', (t) => {
    const f = fixture(t);
    assert.throws(() => writeEvidence(f.output, good(), { serialize }));
    assert.equal(fs.existsSync(path.dirname(f.output)), false);
  });
}
for (const readBack of [
  '{',
  '{}',
  JSON.stringify({ ...good(), timestamp: '2026-01-01T00:00:00.000Z' }),
]) {
  test('independent readback rejects partial or different complete receipts', (t) => {
    const f = fixture(t);
    assert.throws(() =>
      writeEvidence(f.output, good(), {
        fs: { ...fs, readFileSync: () => readBack },
      }),
    );
    assert.deepEqual(fs.readdirSync(path.dirname(f.output)), []);
  });
}
test('deterministic permission denial rejects before execution', (t) => {
  const f = fixture(t);
  let calls = 0;
  const logger = { log() {}, error() {} };
  const io = {
    ...fs,
    accessSync: () => {
      throw Object.assign(Error(CANARY), { code: 'EACCES' });
    },
  };
  assert.equal(
    main(['-o', f.output], {
      fs: io,
      execute: () => {
        calls++;
        return { status: 0 };
      },
      console: logger,
    }),
    1,
  );
  assert.equal(calls, 0);
  assert.equal(fs.existsSync(path.dirname(f.output)), false);
});
test('console and cleanup failures give controlled main results', (t) => {
  const f = fixture(t);
  const logger = {
    log() {
      throw Error(CANARY);
    },
    error() {
      throw Error(CANARY);
    },
  };
  assert.equal(main(['--help'], { console: logger }), 1);
  assert.equal(
    main(['-o', f.output], {
      env: f.env,
      execute: () => ({ status: 0 }),
      console: logger,
    }),
    1,
  );
  assert.equal(fs.existsSync(f.output), false);
  assert.equal(
    main(['-o', f.output], {
      env: f.env,
      execute: () => ({ status: 0 }),
      console: { log() {}, error() {} },
      fs: {
        ...fs,
        unlinkSync() {
          throw Error(CANARY);
        },
      },
    }),
    1,
  );
  assert.equal(
    validateStaticEvidence(JSON.parse(fs.readFileSync(f.output))).valid,
    true,
  );
});

for (const kind of ['file', 'directory', 'link']) {
  test(`exclusive publication preserves a racing ${kind} at link`, (t) => {
    const f = fixture(t);
    const io = {
      ...fs,
      linkSync: (staging, output) => {
        if (kind === 'file') fs.writeFileSync(output, CANARY);
        if (kind === 'directory') fs.mkdirSync(output);
        if (kind === 'link') fs.symlinkSync(f.script, output);
        fs.linkSync(staging, output);
      },
    };
    assert.throws(() => writeEvidence(f.output, good(), { fs: io }));
    assert.deepEqual(fs.readdirSync(path.dirname(f.output)), ['evidence.json']);
    if (kind === 'file')
      assert.equal(fs.readFileSync(f.output, 'utf8'), CANARY);
    if (kind === 'directory')
      assert.equal(fs.statSync(f.output).isDirectory(), true);
    if (kind === 'link') assert.equal(fs.readlinkSync(f.output), f.script);
  });
}

test('changed symlink ancestor is rejected on publication recheck', (t) => {
  const f = fixture(t);
  const original = path.dirname(f.output);
  const moved = path.join(f.dir, 'moved');
  const io = {
    ...fs,
    readFileSync: (...args) => {
      const result = fs.readFileSync(...args);
      fs.renameSync(original, moved);
      fs.symlinkSync(moved, original);
      return result;
    },
  };
  assert.throws(() => writeEvidence(f.output, good(), { fs: io }));
  assert.equal(fs.existsSync(f.output), false);
  assert.deepEqual(fs.readdirSync(moved), []);
});

function paused(t, f, suffix) {
  const marker = f.marker + suffix,
    release = f.release + suffix;
  const fifo = spawnSync('/usr/bin/mkfifo', [release], {
    env: { PATH: f.bin },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.ifError(fifo.error);
  assert.equal(fifo.status, 0);
  const child = spawn(process.execPath, [f.script, '-o', f.output], {
    cwd: f.dir,
    env: {
      ...f.env,
      PAUSE: 'production_templates',
      MARKER: marker,
      RELEASE: release,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (data) => {
    stdout += data;
  });
  child.stderr.on('data', (data) => {
    stderr += data;
  });
  const completion = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  const killGroup = () => {
    if (child.exitCode === null) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  };
  t.after(killGroup);
  const timer = setTimeout(killGroup, 5000);
  t.after(() => clearTimeout(timer));
  return {
    marker,
    stop: killGroup,
    release: () =>
      new Promise((resolve, reject) => {
        // A dead FIFO reader must not block the test runner's event loop.
        const writer = spawn(
          process.execPath,
          [
            '-e',
            "require('node:fs').writeFileSync(process.argv[1], 'go\\n')",
            release,
          ],
          {
            cwd: f.dir,
            env: f.env,
            stdio: 'ignore',
            timeout: 1000,
            killSignal: 'SIGKILL',
          },
        );
        t.after(() => {
          if (writer.exitCode === null) writer.kill('SIGKILL');
        });
        writer.once('error', () => reject(Error('fixture release failed')));
        writer.once('close', (status) =>
          status === 0 ? resolve() : reject(Error('fixture release failed')),
        );
      }),
    completion,
  };
}
async function marker(file) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw Error('fixture marker timeout');
}
for (const kind of ['file', 'directory', 'link']) {
  test(
    `actual CLI preserves ${kind} created after preflight`,
    { timeout: 8000 },
    async (t) => {
      const f = fixture(t);
      const child = paused(t, f, 'race');
      await marker(child.marker);
      fs.mkdirSync(path.dirname(f.output));
      if (kind === 'file') fs.writeFileSync(f.output, CANARY);
      if (kind === 'directory') fs.mkdirSync(f.output);
      if (kind === 'link') fs.symlinkSync(f.script, f.output);
      await child.release();
      const result = await child.completion;
      assert.equal(result.status, 1, result.stderr);
      assert.equal(f.calls().length, 3);
      assert.deepEqual(fs.readdirSync(path.dirname(f.output)), [
        'evidence.json',
      ]);
      assert.ok(!(result.stdout + result.stderr).includes(CANARY));
      if (kind === 'file')
        assert.equal(fs.readFileSync(f.output, 'utf8'), CANARY);
      if (kind === 'link') assert.equal(fs.readlinkSync(f.output), f.script);
    },
  );
}
test(
  'competing actual CLI writers publish exactly one complete receipt',
  { timeout: 8000 },
  async (t) => {
    const f = fixture(t);
    const a = paused(t, f, 'a'),
      b = paused(t, f, 'b');
    await Promise.all([marker(a.marker), marker(b.marker)]);
    await Promise.all([a.release(), b.release()]);
    const results = await Promise.all([a.completion, b.completion]);
    assert.deepEqual(results.map((r) => r.status).sort(), [0, 1]);
    assert.equal(f.calls().length, 6);
    assert.equal(
      validateStaticEvidence(JSON.parse(fs.readFileSync(f.output))).valid,
      true,
    );
    assert.deepEqual(fs.readdirSync(path.dirname(f.output)), ['evidence.json']);
  },
);
test('root scripts add isolated suite before audit without actual producer execution', () => {
  const scripts = require('../../package.json').scripts;
  assert.equal(
    scripts['ops:static-integrity-test'],
    'node --test scripts/ops/run-static-integrity-checks.spec.js',
  );
  assert.ok(
    scripts['ops:check'].indexOf('npm run ops:static-integrity-test') <
      scripts['ops:check'].indexOf('npm run ops:audit &&'),
  );
  assert.ok(
    !scripts['ops:check'].includes(
      'node scripts/ops/run-static-integrity-checks.js',
    ),
  );
});

test('all-spawn-failed receipt publishes truthfully and remains unacceptable for launch', (t) => {
  const f = fixture(t);
  const receipt = runChecks(() => null);
  writeEvidence(f.output, receipt);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.output)), receipt);
  assert.deepEqual(validateStaticEvidence(receipt), {
    valid: false,
    failedCheckId: CHECKS[0].id,
  });
});
test('sparse or wrong object types reject without publication', (t) => {
  const f = fixture(t);
  for (const mutate of [
    (r) => {
      delete r.checks[1];
    },
    (r) => {
      r.checks[0] = Object.assign([], r.checks[0]);
    },
  ]) {
    const r = good();
    mutate(r);
    assert.equal(validateStaticEvidence(r).valid, false);
    assert.throws(() => writeEvidence(f.output, r));
  }
  const arrayReceipt = Object.assign([], good());
  assert.equal(validateStaticEvidence(arrayReceipt).valid, false);
  assert.throws(() => writeEvidence(f.output, arrayReceipt));
  assert.equal(fs.existsSync(path.dirname(f.output)), false);
});
test('exclusive-open collision preserves foreign staging without claiming ownership', (t) => {
  const f = fixture(t);
  const io = {
    ...fs,
    openSync: (file, ...args) => {
      fs.writeFileSync(file, CANARY);
      return fs.openSync(file, ...args);
    },
  };
  assert.throws(() => writeEvidence(f.output, good(), { fs: io }));
  const entries = fs.readdirSync(path.dirname(f.output));
  assert.equal(entries.length, 1);
  assert.equal(
    fs.readFileSync(path.join(path.dirname(f.output), entries[0]), 'utf8'),
    CANARY,
  );
  assert.equal(fs.existsSync(f.output), false);
});
test('nested new directories are private and umask is unchanged', (t) => {
  const f = fixture(t);
  const output = path.join(f.dir, 'one/two/three/receipt.json');
  const before = process.umask();
  writeEvidence(output, good());
  assert.equal(process.umask(), before);
  for (const dir of ['one', 'one/two', 'one/two/three'])
    assert.equal(fs.statSync(path.join(f.dir, dir)).mode & 0o777, 0o700);
});

test(
  'FIFO release remains bounded after its reader terminates',
  { timeout: 5000 },
  async (t) => {
    const f = fixture(t);
    const child = paused(t, f, 'terminated');
    await marker(child.marker);
    child.stop();
    await child.completion;
    await assert.rejects(child.release(), /fixture release failed/);
    assert.equal(fs.existsSync(f.output), false);
  },
);
