'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const SCRIPT_PATH = path.resolve(__dirname, 'verify-managed-secret-rotation.js');
const {
  evaluateManagedSecretRotation,
  parseArgs,
  DEV_PASSWORDS,
} = require('./verify-managed-secret-rotation');

test('verify-managed-secret-rotation CLI: --help and -h display usage and exit 0', () => {
  for (const flag of ['--help', '-h']) {
    const res = spawnSync(process.execPath, [SCRIPT_PATH, flag], {
      encoding: 'utf8',
    });
    assert.equal(res.status, 0);
    assert.match(
      res.stdout,
      /Usage: node scripts\/ops\/verify-managed-secret-rotation\.js --output <file> \[--dry-run\]/,
    );
    assert.equal(res.stderr, '');
  }
});

test('verify-managed-secret-rotation CLI: missing --output exits 1 with error message', () => {
  const res = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: 'utf8',
  });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --output <file> is required/);
});

test('verify-managed-secret-rotation parseArgs: parses --output, -o, --dry-run variations', () => {
  const p1 = parseArgs(['--output', 'rot-1.json']);
  assert.equal(p1.output, path.resolve('rot-1.json'));
  assert.equal(p1.dryRun, false);

  const p2 = parseArgs(['-o', 'rot-2.json', '--dry-run']);
  assert.equal(p2.output, path.resolve('rot-2.json'));
  assert.equal(p2.dryRun, true);

  const p3 = parseArgs(['--output=rot-3.json']);
  assert.equal(p3.output, path.resolve('rot-3.json'));
  assert.equal(p3.dryRun, false);

  const p4 = parseArgs(['-o=rot-4.json', '--dry-run']);
  assert.equal(p4.output, path.resolve('rot-4.json'));
  assert.equal(p4.dryRun, true);
});

test('verify-managed-secret-rotation evaluateManagedSecretRotation: succeeds in clean environment', () => {
  // Ensure no test pollution in process.env
  const result = evaluateManagedSecretRotation();

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rotationCadenceDays, 90);
  assert.equal(result.cadenceCompliant, true);
  assert.equal(result.indirectReferencesVerified, true);

  const expectedSteps = [
    'session_rollover',
    'csrf_rollover',
    'cron_rollover',
    'neon_role_rotation',
    'blob_token_rotation',
    'resend_key_rotation',
    'compromise_response',
  ];
  for (const step of expectedSteps) {
    assert.equal(result.steps[step]?.status, 'passed', `Step ${step} should be passed`);
  }

  assert.equal(result.steps.redaction_audit.status, 'passed');
  assert.equal(result.steps.redaction_audit.raw_secrets_masked, true);
  assert.equal(result.steps.redaction_audit.zero_dev_passwords_detected, true);
});

test('verify-managed-secret-rotation evaluateManagedSecretRotation: fails closed when dev passwords detected', () => {
  assert.ok(Array.isArray(DEV_PASSWORDS) && DEV_PASSWORDS.length >= 5);

  for (const devPassword of DEV_PASSWORDS) {
    const testVarName = `ACRES_TEST_SECRET_${Date.now()}`;
    process.env[testVarName] = `prefix_${devPassword}_suffix`;

    try {
      const result = evaluateManagedSecretRotation();
      assert.equal(result.valid, false, `Expected failure for leaked ${devPassword}`);
      assert.ok(
        result.errors.some((e) =>
          e.includes(`Dev password pattern detected in environment variable: ${testVarName}`),
        ),
      );
      assert.equal(result.steps.redaction_audit.status, 'failed');
      assert.equal(result.steps.redaction_audit.zero_dev_passwords_detected, false);
    } finally {
      delete process.env[testVarName];
    }
  }
});

test('verify-managed-secret-rotation CLI execution: writes compliant receipt in clean subprocess', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-rot-cli-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const receiptPath = path.join(tmpDir, 'stage_rot/managed-secret-rotation-receipt.json');

  const res = spawnSync(
    process.execPath,
    [SCRIPT_PATH, '--output', receiptPath, '--dry-run'],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: process.env.PATH },
    },
  );

  assert.equal(res.status, 0, `Expected 0 exit, stderr: ${res.stderr}`);
  assert.match(res.stdout, /Managed secret rotation and compromise response verified\./);
  assert.ok(fs.existsSync(receiptPath), 'Receipt file must exist');

  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));

  assert.equal(receipt.drill_type, 'managed_secret_rotation_verification');
  assert.equal(receipt.status, 'success');
  assert.equal(receipt.valid, true);
  assert.equal(receipt.target_architecture, 'vercel-managed-production');
  assert.equal(receipt.execution_mode, 'simulation');
  assert.equal(receipt.rotation_cadence_days, 90);
  assert.equal(receipt.cadence_compliant, true);
  assert.equal(receipt.indirect_references_verified, true);
  assert.equal(receipt.steps.redaction_audit.zero_dev_passwords_detected, true);
  assert.deepEqual(receipt.errors, []);
  assert.ok(receipt.timestamp);
});

test('verify-managed-secret-rotation CLI execution: fails closed and writes no receipt when dev password is in env', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-rot-leak-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const receiptPath = path.join(tmpDir, 'receipt.json');

  const res = spawnSync(
    process.execPath,
    [SCRIPT_PATH, '--output', receiptPath],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        LEAKED_DEV_SECRET: 'acres_superuser_dev_password',
      },
    },
  );

  assert.equal(res.status, 1);
  assert.match(res.stderr, /Managed secret rotation verification failed:/);
  assert.match(res.stderr, /Dev password pattern detected in environment variable: LEAKED_DEV_SECRET/);
  assert.equal(fs.existsSync(receiptPath), false);
});
