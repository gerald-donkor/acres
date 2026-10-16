'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const SCRIPT_PATH = path.resolve(__dirname, 'verify-managed-restore-drill.js');
const { evaluateManagedRestore, parseArgs } = require('./verify-managed-restore-drill');

test('verify-managed-restore-drill CLI: --help and -h display usage and exit 0', () => {
  for (const flag of ['--help', '-h']) {
    const res = spawnSync(process.execPath, [SCRIPT_PATH, flag], {
      encoding: 'utf8',
    });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Usage: node scripts\/ops\/verify-managed-restore-drill\.js --output <file>/);
    assert.equal(res.stderr, '');
  }
});

test('verify-managed-restore-drill CLI: missing --output exits 1 with error message', () => {
  const res = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: 'utf8',
  });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --output <file> is required/);
});

test('verify-managed-restore-drill parseArgs: parses --output, -o, --output=, and -o= options', () => {
  const p1 = parseArgs(['--output', 'restore-1.json']);
  assert.equal(p1.output, path.resolve('restore-1.json'));

  const p2 = parseArgs(['-o', 'restore-2.json']);
  assert.equal(p2.output, path.resolve('restore-2.json'));

  const p3 = parseArgs(['--output=restore-3.json']);
  assert.equal(p3.output, path.resolve('restore-3.json'));

  const p4 = parseArgs(['-o=restore-4.json']);
  assert.equal(p4.output, path.resolve('restore-4.json'));
});

test('verify-managed-restore-drill evaluateManagedRestore: verifies architectural assertions', () => {
  const result = evaluateManagedRestore();

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.pitrRecoveryWindowDays, 7);
  assert.equal(result.pitrPreflightVerified, true);
  assert.equal(result.rtoHours, 4);
  assert.equal(result.rtoCompliant, true);
  assert.equal(result.rpoHours, 1);
  assert.equal(result.rpoCompliant, true);
  assert.equal(result.blobDurabilityVerified, true);
  assert.equal(result.durationSeconds, 120);
  assert.equal(result.rtoTargetSeconds, 14400);
});

test('verify-managed-restore-drill CLI execution: writes compliant receipt in nested directory', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-restore-cli-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const receiptPath = path.join(tmpDir, 'stage_dr/managed-restore-drill-receipt.json');

  const res = spawnSync(
    process.execPath,
    [SCRIPT_PATH, '--output', receiptPath],
    { encoding: 'utf8' },
  );

  assert.equal(res.status, 0, `Expected 0 exit, stderr: ${res.stderr}`);
  assert.match(res.stdout, /Managed disaster recovery and PITR preflight verified\./);
  assert.ok(fs.existsSync(receiptPath), 'Receipt file must exist');

  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));

  assert.equal(receipt.drill_type, 'managed_restore_drill_verification');
  assert.equal(receipt.status, 'success');
  assert.equal(receipt.valid, true);
  assert.equal(receipt.target_architecture, 'vercel-managed-production');
  assert.equal(receipt.execution_mode, 'simulation');
  assert.equal(receipt.pitr_recovery_window_days, 7);
  assert.equal(receipt.pitr_preflight_verified, true);
  assert.equal(receipt.rto_hours, 4);
  assert.equal(receipt.rto_compliant, true);
  assert.equal(receipt.rpo_hours, 1);
  assert.equal(receipt.rpo_compliant, true);
  assert.equal(receipt.blob_durability_verified, true);
  assert.equal(receipt.duration_seconds, 120);
  assert.equal(receipt.rto_target_seconds, 14400);
  assert.deepEqual(receipt.errors, []);
  assert.ok(receipt.timestamp);
  assert.ok(receipt.drill_timestamp);
});
