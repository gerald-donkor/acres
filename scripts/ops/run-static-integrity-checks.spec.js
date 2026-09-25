const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { CHECKS, runChecks, validateStaticEvidence, parseArgs, writeEvidence } = require('./run-static-integrity-checks');

const SCRIPT = path.join(__dirname, 'run-static-integrity-checks.js');

test('all fixed commands run in order and success evidence has exact counts', () => {
  const calls = [];
  const evidence = runChecks((binary, args, options) => {
    calls.push({ binary, args, options });
    return { status: 0 };
  });
  assert.deepEqual(calls.map((call) => call.args[0]), CHECKS.map((check) => check.script));
  assert.ok(calls.every((call) => call.binary === 'bash' && call.options.stdio === 'ignore'));
  assert.equal(evidence.drill_type, 'static_integrity_verification');
  assert.equal(evidence.status, 'success');
  assert.equal(evidence.valid, true);
  assert.equal(evidence.totalChecks, 3);
  assert.equal(evidence.passedChecks, 3);
  assert.equal(evidence.failedChecks, 0);
  assert.deepEqual(evidence.checks.map((check) => check.id), CHECKS.map((check) => check.id));
  assert.equal(validateStaticEvidence(evidence).valid, true);
});

for (let failedIndex = 0; failedIndex < CHECKS.length; failedIndex++) {
  test(`${CHECKS[failedIndex].id} failure still runs subsequent checks`, () => {
    const calls = [];
    const evidence = runChecks((_binary, args) => {
      calls.push(args[0]);
      return { status: calls.length - 1 === failedIndex ? 7 : 0, stdout: 'sensitive fixture' };
    });
    assert.equal(calls.length, 3);
    assert.equal(evidence.status, 'failed');
    assert.equal(evidence.valid, false);
    assert.equal(evidence.passedChecks, 2);
    assert.equal(evidence.failedChecks, 1);
    assert.equal(evidence.checks[failedIndex].exitCode, 7);
    assert.equal(validateStaticEvidence(evidence).failedCheckId, CHECKS[failedIndex].id);
    assert.ok(!JSON.stringify(evidence).includes('sensitive fixture'));
  });
}

test('spawn error is generic and later checks run', () => {
  let calls = 0;
  const evidence = runChecks(() => {
    calls++;
    if (calls === 2) throw new Error('sensitive fixture');
    return { status: 0 };
  });
  assert.equal(calls, 3);
  assert.deepEqual(evidence.checks[1], {
    id: 'docker_runtime', passed: false, exitCode: null, failureKind: 'spawn_failed',
  });
  assert.ok(!JSON.stringify(evidence).includes('sensitive fixture'));
});

test('validator rejects false success, count drift, duplicate and missing IDs', () => {
  const good = runChecks(() => ({ status: 0 }));
  for (const mutate of [
    (value) => { value.passedChecks = 2; },
    (value) => { value.checks[1].id = value.checks[0].id; },
    (value) => { value.checks.pop(); },
    (value) => { value.checks[2].exitCode = 1; },
    (value) => { value.valid = false; },
    (value) => { value.timestamp = 'September 25, 2026'; },
  ]) {
    const changed = structuredClone(good);
    mutate(changed);
    assert.equal(validateStaticEvidence(changed).valid, false);
  }
});

test('CLI rejects missing output and unknown options without running checks', () => {
  for (const args of [[], ['--output'], ['-o', '--bad'], ['--bad'], ['--output', 'one', '-o', 'two']]) {
    assert.throws(() => parseArgs(args));
    const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /expected --output/);
  }
});

test('evidence write is atomic and failed destination returns nonzero', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'static-integrity-'));
  try {
    const output = path.join(dir, 'nested', 'evidence.json');
    const evidence = runChecks(() => ({ status: 0 }));
    writeEvidence(output, evidence);
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), evidence);
    assert.deepEqual(fs.readdirSync(path.dirname(output)), ['evidence.json']);
    const result = spawnSync(process.execPath, [SCRIPT, '--output', dir], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /could not write evidence/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
