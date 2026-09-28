const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(__dirname, 'run-secret-rotation-drill.sh');

const REQUIRED_SECRET_CLASSES = [
  'session_secret',
  'csrf_secret',
  'postgres_passwords',
  'valkey_password',
  'storage_s3_keys',
  'smtp_credentials',
  'grafana_admin_password',
];

const REQUIRED_STEPS = [
  'session_rollover',
  'csrf_rollover',
  'database_rotation',
  'valkey_rotation',
  'storage_rotation',
  'compromise_response',
  'redaction_audit',
];

function run(args, options = {}) {
  const env = { ...process.env, ...options.env };
  delete env.NODE_TEST_CONTEXT;
  return execFileSync('bash', [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60000,
    ...options,
    env,
  });
}

function runTolerant(args, options = {}) {
  try {
    return { output: run(args, options), exitCode: 0 };
  } catch (err) {
    return { output: (err.stdout || '') + (err.stderr || ''), exitCode: err.status || 1 };
  }
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'acres-secret-drill-test-'));
}

test('run-secret-rotation-drill: displays usage and exits 0 on --help and -h', () => {
  for (const flag of ['--help', '-h']) {
    const result = run([flag]);
    assert.ok(result.includes('Usage: scripts/ops/run-secret-rotation-drill.sh'));
    assert.ok(result.includes('--dry-run'));
    assert.ok(result.includes('--evidence-dir'));
    assert.ok(result.includes('--evidence-file'));
    assert.ok(result.includes('--api-url'));
    assert.ok(result.includes('--pghost'));
    assert.ok(result.includes('--pgport'));
    assert.ok(result.includes('--valkey-host'));
    assert.ok(result.includes('--valkey-port'));
  }
});

test('run-secret-rotation-drill: fails closed on unknown options', () => {
  const { output, exitCode } = runTolerant(['--unknown-flag']);
  assert.strictEqual(exitCode, 1);
  assert.ok(output.includes('Error: Unknown option "--unknown-flag"'));
});

test('run-secret-rotation-drill: rejects missing or flag-like option argument values', () => {
  const optionsWithArgs = [
    '--evidence-dir',
    '--evidence-file',
    '--api-url',
    '--pghost',
    '--pgport',
    '--valkey-host',
    '--valkey-port',
  ];

  for (const opt of optionsWithArgs) {
    const res1 = runTolerant([opt]);
    assert.strictEqual(res1.exitCode, 1, `Expected exit 1 for missing arg on ${opt}`);
    assert.ok(
      res1.output.includes(`Error: ${opt} requires a non-empty value`),
      `Expected non-empty value error for ${opt}, got: ${res1.output}`
    );

    const res2 = runTolerant([opt, '--dry-run']);
    assert.strictEqual(res2.exitCode, 1, `Expected exit 1 for flag following ${opt}`);
    assert.ok(
      res2.output.includes(`Error: ${opt} requires a non-empty value`),
      `Expected non-empty value error for ${opt} followed by flag, got: ${res2.output}`
    );

    const res3 = runTolerant([opt, '']);
    assert.strictEqual(res3.exitCode, 1, `Expected exit 1 for empty string value on ${opt}`);
    assert.ok(
      res3.output.includes(`Error: ${opt} requires a non-empty value`),
      `Expected non-empty value error for ${opt} with empty string, got: ${res3.output}`
    );
  }
});

test('run-secret-rotation-drill: executes cleanly in --dry-run and emits valid Category 3 evidence', () => {
  const tmpDir = makeTempDir();
  try {
    const evidenceFile = path.join(tmpDir, 'custom-secret-evidence.json');
    const { output, exitCode } = runTolerant([
      '--dry-run',
      '--evidence-file',
      evidenceFile,
    ]);

    assert.strictEqual(exitCode, 0, `Drill failed unexpectedly: ${output}`);
    assert.ok(output.includes('Result: PASSED. Automated secret rotation and compromise drill verified.'));
    assert.ok(fs.existsSync(evidenceFile), 'Evidence file was not created');

    const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
    assert.strictEqual(evidence.drill_type, 'zero_downtime_secret_rotation_and_compromise_response');
    assert.strictEqual(evidence.status, 'success');
    assert.strictEqual(evidence.dry_run, true);
    assert.ok(Array.isArray(evidence.errors));
    assert.strictEqual(evidence.errors.length, 0);

    // Verify all 7 tested secret classes
    assert.ok(Array.isArray(evidence.tested_secret_classes));
    for (const cls of REQUIRED_SECRET_CLASSES) {
      assert.ok(evidence.tested_secret_classes.includes(cls), `Missing secret class: ${cls}`);
    }

    // Verify all 7 steps report passed status
    assert.ok(evidence.steps && typeof evidence.steps === 'object');
    for (const step of REQUIRED_STEPS) {
      assert.ok(evidence.steps[step], `Missing step in results: ${step}`);
      assert.strictEqual(
        evidence.steps[step].status,
        'passed',
        `Step ${step} did not report passed status`
      );
    }

    // Verify redaction audit confirmation
    const redaction = evidence.steps.redaction_audit;
    assert.strictEqual(redaction.raw_secrets_masked, true);
    assert.strictEqual(redaction.zero_dev_passwords_detected, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('run-secret-rotation-drill: respects --evidence-dir and generates timestamped file', () => {
  const tmpDir = makeTempDir();
  try {
    const { output, exitCode } = runTolerant([
      '--dry-run',
      '--evidence-dir',
      tmpDir,
    ]);

    assert.strictEqual(exitCode, 0, `Drill failed: ${output}`);
    const files = fs.readdirSync(tmpDir).filter(
      (f) => f.startsWith('secret-rotation-evidence-') && f.endsWith('.json')
    );
    assert.strictEqual(files.length, 1, `Expected 1 evidence file in directory, found: ${files.length}`);

    const filePath = path.join(tmpDir, files[0]);
    const evidence = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.strictEqual(evidence.status, 'success');
    assert.strictEqual(evidence.steps.session_rollover.status, 'passed');
    assert.strictEqual(evidence.steps.csrf_rollover.status, 'passed');
    assert.strictEqual(evidence.steps.database_rotation.status, 'passed');
    assert.strictEqual(evidence.steps.valkey_rotation.status, 'passed');
    assert.strictEqual(evidence.steps.storage_rotation.status, 'passed');
    assert.strictEqual(evidence.steps.compromise_response.status, 'passed');
    assert.strictEqual(evidence.steps.redaction_audit.status, 'passed');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('run-secret-rotation-drill: accepts custom target parameters without error', () => {
  const tmpDir = makeTempDir();
  try {
    const evidenceFile = path.join(tmpDir, 'targeted-secret-evidence.json');
    const { output, exitCode } = runTolerant([
      '--dry-run',
      '--api-url',
      'http://127.0.0.1:3999',
      '--pghost',
      '127.0.0.1',
      '--pgport',
      '5999',
      '--valkey-host',
      '127.0.0.1',
      '--valkey-port',
      '6999',
      '--evidence-file',
      evidenceFile,
    ]);

    assert.strictEqual(exitCode, 0, `Targeted drill failed: ${output}`);
    assert.ok(output.includes('Target API:          http://127.0.0.1:3999'));
    assert.ok(output.includes('PostgreSQL Target:   127.0.0.1:5999'));
    assert.ok(output.includes('Valkey Target:       127.0.0.1:6999'));
    assert.ok(fs.existsSync(evidenceFile));

    const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
    assert.strictEqual(evidence.status, 'success');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('run-secret-rotation-drill: emitted evidence strictly satisfies check-launch-readiness validation', () => {
  const { validateSecretRotationReport } = require('./check-launch-readiness.js');
  const tmpDir = makeTempDir();
  try {
    const evidenceFile = path.join(tmpDir, 'compliance-secret-evidence.json');
    const { exitCode } = runTolerant([
      '--dry-run',
      '--evidence-file',
      evidenceFile,
    ]);

    assert.strictEqual(exitCode, 0);
    const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
    assert.strictEqual(validateSecretRotationReport(evidence, new Date()), true);

    // Corrupted evidence (missing step) fails validation
    const missingStepEvidence = {
      ...evidence,
      steps: { ...evidence.steps },
    };
    delete missingStepEvidence.steps.session_rollover;
    assert.strictEqual(validateSecretRotationReport(missingStepEvidence, new Date()), false);

    // Failed step fails validation
    const failedStepEvidence = {
      ...evidence,
      steps: {
        ...evidence.steps,
        database_rotation: { status: 'failed' },
      },
    };
    assert.strictEqual(validateSecretRotationReport(failedStepEvidence, new Date()), false);

    // Unmasked secrets fail validation
    const unmaskedEvidence = {
      ...evidence,
      steps: {
        ...evidence.steps,
        redaction_audit: { raw_secrets_masked: false, zero_dev_passwords_detected: true },
      },
    };
    assert.strictEqual(validateSecretRotationReport(unmaskedEvidence, new Date()), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

