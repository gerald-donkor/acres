const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const RUNNER = path.join(ROOT, 'scripts/ops/launch-readiness.sh');

function makeTempFixture(t, overrides = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-launch-readiness-test-'));
  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  const opsDir = path.join(tmpDir, 'scripts/ops');
  const infraDir = path.join(tmpDir, 'infra/launch');
  fs.mkdirSync(opsDir, { recursive: true });
  fs.mkdirSync(infraDir, { recursive: true });

  const callLog = path.join(tmpDir, 'calls.jsonl');

  // Copy launch-readiness.sh into fixture
  fs.copyFileSync(RUNNER, path.join(opsDir, 'launch-readiness.sh'));
  fs.chmodSync(path.join(opsDir, 'launch-readiness.sh'), 0o755);

  // Helper to create stub executable shell scripts
  function makeStub(name, handlerContent) {
    const stubPath = path.join(opsDir, name);
    const script = `#!/bin/sh
set -eu
LOG_FILE="${callLog}"
${handlerContent}
`;
    fs.writeFileSync(stubPath, script, { mode: 0o755 });
  }

  // Preflight stubs
  const templatesExit = overrides.templatesExit ?? 0;
  makeStub(
    'check-production-templates.sh',
    `printf '{"name":"check-production-templates.sh","args":["%s"]}\\n' "$*" >> "$LOG_FILE"
exit ${templatesExit}`
  );

  const secretsExit = overrides.secretsExit ?? 0;
  makeStub(
    'scan-secrets.sh',
    `printf '{"name":"scan-secrets.sh","args":["%s"]}\\n' "$*" >> "$LOG_FILE"
exit ${secretsExit}`
  );

  const dockerExit = overrides.dockerExit ?? 0;
  makeStub(
    'check-docker-runtime.sh',
    `printf '{"name":"check-docker-runtime.sh","args":["%s"]}\\n' "$*" >> "$LOG_FILE"
exit ${dockerExit}`
  );

  // Stub for node --test scripts/ops/check-launch-readiness.spec.js
  const readinessSpecExit = overrides.readinessSpecExit ?? 0;
  const specStubPath = path.join(opsDir, 'check-launch-readiness.spec.js');
  fs.writeFileSync(
    specStubPath,
    `const fs = require('node:fs');
const test = require('node:test');
const log = ${JSON.stringify(callLog)};
fs.appendFileSync(log, JSON.stringify({ name: "check-launch-readiness.spec.js", argv: process.argv.slice(2) }) + "\\n");
if (${readinessSpecExit} !== 0) {
  test('simulated readiness test failure', () => {
    throw new Error('simulated test failure');
  });
} else {
  test('passing stub test', () => {});
}
`,
    { mode: 0o644 }
  );

  // Drills stub
  const drillsExit = overrides.drillsExit ?? 0;
  makeStub(
    'run-launch-drills.sh',
    `printf '{"name":"run-launch-drills.sh","args":["%s"]}\\n' "$*" >> "$LOG_FILE"
exit ${drillsExit}`
  );

  // check-launch-readiness.js stub
  const checkReadinessExit = overrides.checkReadinessExit ?? 0;
  const checkReadinessStubPath = path.join(opsDir, 'check-launch-readiness.js');
  fs.writeFileSync(
    checkReadinessStubPath,
    `#!/usr/bin/env node
const fs = require('node:fs');
const log = ${JSON.stringify(callLog)};
fs.appendFileSync(log, JSON.stringify({ name: "check-launch-readiness.js", argv: process.argv.slice(2) }) + "\\n");
if (${checkReadinessExit} !== 0) {
  process.exit(${checkReadinessExit});
}
`,
    { mode: 0o755 }
  );

  // Default readiness example file in fixture
  fs.writeFileSync(
    path.join(infraDir, 'readiness.example.json'),
    JSON.stringify({ status: 'unresolved' })
  );

  function runScript(args = [], runEnv = {}) {
    const cleanEnv = { ...process.env, ...runEnv };
    // Clear node:test runner environment variables so child node --test invocations don't skip execution
    delete cleanEnv.NODE_TEST_CONTEXT;
    delete cleanEnv.NODE_TEST_WORKER_ID;

    const res = spawnSync(
      'sh',
      [path.join(opsDir, 'launch-readiness.sh'), ...args],
      {
        cwd: tmpDir,
        env: cleanEnv,
        encoding: 'utf8',
      }
    );

    let recordedCalls = [];
    if (fs.existsSync(callLog)) {
      const lines = fs.readFileSync(callLog, 'utf8').trim().split('\n').filter(Boolean);
      recordedCalls = lines.map((l) => JSON.parse(l));
    }

    return {
      status: res.status,
      stdout: res.stdout || '',
      stderr: res.stderr || '',
      calls: recordedCalls,
    };
  }

  return { tmpDir, runScript, callLog };
}

test('launch-readiness.sh CLI flags and argument validation', async (t) => {
  await t.test('--help prints usage and exits with 0', () => {
    const { runScript } = makeTempFixture(t);
    const result = runScript(['--help']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: scripts\/ops\/launch-readiness\.sh/);
    assert.equal(result.calls.length, 0);
  });

  await t.test('-h prints usage and exits with 0', () => {
    const { runScript } = makeTempFixture(t);
    const result = runScript(['-h']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: scripts\/ops\/launch-readiness\.sh/);
    assert.equal(result.calls.length, 0);
  });

  await t.test('unknown flag prints error and usage to stderr and exits with 1', () => {
    const { runScript } = makeTempFixture(t);
    const result = runScript(['--invalid-flag']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Error: Unknown option "--invalid-flag"/);
    assert.match(result.stderr, /Usage: scripts\/ops\/launch-readiness\.sh/);
    assert.equal(result.calls.length, 0);
  });

  await t.test('unknown option --dry-run prints error to stderr and exits with 1', () => {
    const { runScript } = makeTempFixture(t);
    const result = runScript(['--dry-run']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Error: Unknown option "--dry-run"/);
    assert.match(result.stderr, /Usage: scripts\/ops\/launch-readiness\.sh/);
    assert.equal(result.calls.length, 0);
  });

  await t.test('unknown single-dash flag -x prints error to stderr and exits with 1', () => {
    const { runScript } = makeTempFixture(t);
    const result = runScript(['-x']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Error: Unknown option "-x"/);
    assert.match(result.stderr, /Usage: scripts\/ops\/launch-readiness\.sh/);
    assert.equal(result.calls.length, 0);
  });

  await t.test('excessive positional arguments prints error to stderr and exits with 1', () => {
    const { runScript } = makeTempFixture(t);
    const result = runScript(['first.json', 'second.json']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Error: Too many arguments; expected single readiness JSON path/);
    assert.match(result.stderr, /Usage: scripts\/ops\/launch-readiness\.sh/);
    assert.equal(result.calls.length, 0);
  });
});

test('launch-readiness.sh fail-closed preflight order', async (t) => {
  await t.test('halts immediately when check-production-templates.sh fails', () => {
    const { runScript } = makeTempFixture(t, { templatesExit: 2 });
    const result = runScript([]);
    assert.equal(result.status, 2);
    assert.equal(result.calls.length, 1);
    assert.equal(result.calls[0].name, 'check-production-templates.sh');
  });

  await t.test('halts immediately when scan-secrets.sh fails', () => {
    const { runScript } = makeTempFixture(t, { secretsExit: 3 });
    const result = runScript([]);
    assert.equal(result.status, 3);
    assert.equal(result.calls.length, 2);
    assert.equal(result.calls[0].name, 'check-production-templates.sh');
    assert.equal(result.calls[1].name, 'scan-secrets.sh');
  });

  await t.test('halts immediately when check-docker-runtime.sh fails', () => {
    const { runScript } = makeTempFixture(t, { dockerExit: 4 });
    const result = runScript([]);
    assert.equal(result.status, 4);
    assert.equal(result.calls.length, 3);
    assert.equal(result.calls[0].name, 'check-production-templates.sh');
    assert.equal(result.calls[1].name, 'scan-secrets.sh');
    assert.equal(result.calls[2].name, 'check-docker-runtime.sh');
  });

  await t.test('halts immediately when check-launch-readiness.spec.js fails', () => {
    const { runScript } = makeTempFixture(t, { readinessSpecExit: 1 });
    const result = runScript([]);
    assert.notEqual(result.status, 0);
    assert.equal(result.calls.length, 4);
    assert.equal(result.calls[0].name, 'check-production-templates.sh');
    assert.equal(result.calls[1].name, 'scan-secrets.sh');
    assert.equal(result.calls[2].name, 'check-docker-runtime.sh');
    assert.equal(result.calls[3].name, 'check-launch-readiness.spec.js');
  });
});

test('launch-readiness.sh drill flag and execution flow', async (t) => {
  await t.test('omitting --with-drills skips run-launch-drills.sh and calls check-launch-readiness.js', () => {
    const { runScript } = makeTempFixture(t);
    const result = runScript([]);
    assert.equal(result.status, 0);
    const callNames = result.calls.map((c) => c.name);
    assert.deepEqual(callNames, [
      'check-production-templates.sh',
      'scan-secrets.sh',
      'check-docker-runtime.sh',
      'check-launch-readiness.spec.js',
      'check-launch-readiness.js',
    ]);
    const readinessCall = result.calls.find((c) => c.name === 'check-launch-readiness.js');
    assert.deepEqual(readinessCall.argv, ['infra/launch/readiness.example.json']);
  });

  await t.test('--with-drills invokes run-launch-drills.sh --dry-run then check-launch-readiness.js', () => {
    const { runScript } = makeTempFixture(t);
    const result = runScript(['--with-drills']);
    assert.equal(result.status, 0);
    const callNames = result.calls.map((c) => c.name);
    assert.deepEqual(callNames, [
      'check-production-templates.sh',
      'scan-secrets.sh',
      'check-docker-runtime.sh',
      'check-launch-readiness.spec.js',
      'run-launch-drills.sh',
      'check-launch-readiness.js',
    ]);
    const drillCall = result.calls.find((c) => c.name === 'run-launch-drills.sh');
    assert.equal(drillCall.args[0].trim(), '--dry-run');
  });

  await t.test('--with-drills failure halts execution and prints dossier hint to stderr', () => {
    const { runScript } = makeTempFixture(t, { drillsExit: 1 });
    const result = runScript(['--with-drills']);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /launch-readiness: unified drills failed; see the dossier at backups\/launch-evidence-dossier-\*\.json/
    );
    const callNames = result.calls.map((c) => c.name);
    assert.deepEqual(callNames, [
      'check-production-templates.sh',
      'scan-secrets.sh',
      'check-docker-runtime.sh',
      'check-launch-readiness.spec.js',
      'run-launch-drills.sh',
    ]);
  });
});

test('launch-readiness.sh target file forwarding and exit code propagation', async (t) => {
  await t.test('forwards custom file path to check-launch-readiness.js', () => {
    const { runScript } = makeTempFixture(t);
    const result = runScript(['infra/launch/custom-readiness.json']);
    assert.equal(result.status, 0);
    const readinessCall = result.calls.find((c) => c.name === 'check-launch-readiness.js');
    assert.deepEqual(readinessCall.argv, ['infra/launch/custom-readiness.json']);
  });

  await t.test('handles custom path preceding --with-drills', () => {
    const { runScript } = makeTempFixture(t);
    const result = runScript(['infra/launch/custom-readiness.json', '--with-drills']);
    assert.equal(result.status, 0);
    const drillCall = result.calls.find((c) => c.name === 'run-launch-drills.sh');
    assert.ok(drillCall);
    const readinessCall = result.calls.find((c) => c.name === 'check-launch-readiness.js');
    assert.deepEqual(readinessCall.argv, ['infra/launch/custom-readiness.json']);
  });

  await t.test('handles --with-drills preceding custom path', () => {
    const { runScript } = makeTempFixture(t);
    const result = runScript(['--with-drills', 'infra/launch/custom-readiness.json']);
    assert.equal(result.status, 0);
    const drillCall = result.calls.find((c) => c.name === 'run-launch-drills.sh');
    assert.ok(drillCall);
    const readinessCall = result.calls.find((c) => c.name === 'check-launch-readiness.js');
    assert.deepEqual(readinessCall.argv, ['infra/launch/custom-readiness.json']);
  });

  await t.test('propagates non-zero exit code from check-launch-readiness.js', () => {
    const { runScript } = makeTempFixture(t, { checkReadinessExit: 1 });
    const result = runScript(['infra/launch/custom-readiness.json']);
    assert.equal(result.status, 1);
  });
});

test('launch-readiness.sh real repository execution', async (t) => {
  await t.test('fails closed against default infra/launch/readiness.example.json with exit 1', () => {
    const cleanEnv = { ...process.env };
    delete cleanEnv.NODE_TEST_CONTEXT;
    delete cleanEnv.NODE_TEST_WORKER_ID;

    const result = spawnSync('sh', [RUNNER], {
      cwd: ROOT,
      encoding: 'utf8',
      env: cleanEnv,
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /ACRES LAUNCH READINESS EVALUATION/);
    assert.match(result.stdout, /Result: FAIL-CLOSED/);
    assert.match(result.stdout, /Total Blockers Detected:\s+70/);
  });
});
