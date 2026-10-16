'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const SCRIPT_PATH = path.resolve(__dirname, 'verify-managed-volume-encryption.js');
const { evaluateManagedEncryption, parseArgs } = require('./verify-managed-volume-encryption');

test('verify-managed-volume-encryption CLI: --help and -h display usage and exit 0', () => {
  for (const flag of ['--help', '-h']) {
    const res = spawnSync(process.execPath, [SCRIPT_PATH, flag], {
      encoding: 'utf8',
    });
    assert.equal(res.status, 0);
    assert.match(res.stdout, /Usage: node scripts\/ops\/verify-managed-volume-encryption\.js --output <file>/);
    assert.equal(res.stderr, '');
  }
});

test('verify-managed-volume-encryption CLI: missing --output exits 1 with error message', () => {
  const res = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: 'utf8',
  });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Error: --output <file> is required/);
});

test('verify-managed-volume-encryption parseArgs: parses --output, -o, --output=, and -o= options', () => {
  const p1 = parseArgs(['--output', 'vol-1.json']);
  assert.equal(p1.output, path.resolve('vol-1.json'));

  const p2 = parseArgs(['-o', 'vol-2.json']);
  assert.equal(p2.output, path.resolve('vol-2.json'));

  const p3 = parseArgs(['--output=vol-3.json']);
  assert.equal(p3.output, path.resolve('vol-3.json'));

  const p4 = parseArgs(['-o=vol-4.json']);
  assert.equal(p4.output, path.resolve('vol-4.json'));
});

test('verify-managed-volume-encryption evaluateManagedEncryption: verifies architectural assertions', () => {
  const result = evaluateManagedEncryption();

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.storageEncryptionVerified, true);
  assert.equal(result.neonKmsAes256, true);
  assert.equal(result.ephemeralComputeIsolated, true);
  assert.equal(result.keySeparationVerified, true);
  assert.equal(result.cloudStorageEncrypted, true);
});

test('verify-managed-volume-encryption CLI execution: writes compliant receipt in nested directory', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-volume-cli-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const receiptPath = path.join(tmpDir, 'stage_vol/managed-volume-encryption-receipt.json');

  const res = spawnSync(
    process.execPath,
    [SCRIPT_PATH, '--output', receiptPath],
    { encoding: 'utf8' },
  );

  assert.equal(res.status, 0, `Expected 0 exit, stderr: ${res.stderr}`);
  assert.match(res.stdout, /Managed volume encryption and compute isolation verified\./);
  assert.ok(fs.existsSync(receiptPath), 'Receipt file must exist');

  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));

  assert.equal(receipt.drill_type, 'managed_volume_encryption_verification');
  assert.equal(receipt.status, 'success');
  assert.equal(receipt.valid, true);
  assert.equal(receipt.target_architecture, 'vercel-managed-production');
  assert.equal(receipt.execution_mode, 'simulation');
  assert.equal(receipt.storage_encryption_verified, true);
  assert.equal(receipt.neon_aws_kms_aes256, true);
  assert.equal(receipt.ephemeral_compute_isolated, true);
  assert.equal(receipt.key_separation_verified, true);
  assert.equal(receipt.cloud_storage_encrypted, true);
  assert.deepEqual(receipt.errors, []);
  assert.ok(receipt.timestamp);
});
