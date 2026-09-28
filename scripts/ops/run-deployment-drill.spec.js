const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(__dirname, 'run-deployment-drill.sh');
const DEFAULT_COMPOSE = path.join(ROOT, 'infra/compose/docker-compose.production.example.yml');
const DEFAULT_CADDY = path.join(ROOT, 'infra/caddy/Caddyfile.example');

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'acres-deploy-drill-test-'));
}

test('run-deployment-drill: displays usage and exits 0 on --help', () => {
  const result = run(['--help']);
  assert.ok(result.includes('Usage: scripts/ops/run-deployment-drill.sh'));
  assert.ok(result.includes('--dry-run'));
  assert.ok(result.includes('--compose-file'));
});

test('run-deployment-drill: fails closed on unknown options', () => {
  const { output, exitCode } = runTolerant(['--unknown-option']);
  assert.strictEqual(exitCode, 1);
  assert.ok(output.includes('Unknown option "--unknown-option"'));
});

test('run-deployment-drill: rejects missing option argument values', () => {
  for (const opt of ['--caddyfile', '--compose-file', '--evidence-dir', '--evidence-file', '--api-url']) {
    const res1 = runTolerant([opt]);
    assert.strictEqual(res1.exitCode, 1);
    assert.ok(res1.output.includes(`Error: ${opt} requires a non-empty value`));

    const res2 = runTolerant([opt, '--dry-run']);
    assert.strictEqual(res2.exitCode, 1);
    assert.ok(res2.output.includes(`Error: ${opt} requires a non-empty value`));
  }
});

test('run-deployment-drill: executes cleanly in --dry-run and emits valid evidence', () => {
  const tmpDir = makeTempDir();
  try {
    const evidenceFile = path.join(tmpDir, 'custom-deployment-evidence.json');
    const { output, exitCode } = runTolerant([
      '--dry-run',
      '--evidence-file',
      evidenceFile,
    ]);
    assert.strictEqual(exitCode, 0, `Drill failed: ${output}`);
    assert.ok(output.includes('DEPLOYMENT PROMOTION & ROLLBACK DRILL COMPLETED'));
    assert.ok(fs.existsSync(evidenceFile));

    const evidence = JSON.parse(fs.readFileSync(evidenceFile, 'utf8'));
    assert.strictEqual(evidence.status, 'success');
    assert.strictEqual(evidence.dry_run, true);
    assert.strictEqual(evidence.schema_backward_compatible, true);
    assert.strictEqual(evidence.rollback_procedure_verified, true);
    assert.strictEqual(evidence.caddy_routing_verified, true);
    assert.ok(evidence.caddy_routes_tested >= 12);
    assert.strictEqual(evidence.security_headers_verified, true);
    assert.strictEqual(evidence.s3_sigv4_host_preserved, true);
    assert.strictEqual(evidence.migrations_verified, true);
    assert.ok(typeof evidence.migration_count === 'number' && evidence.migration_count >= 0);
    assert.strictEqual(evidence.operational_templates_verified, true);
    assert.strictEqual(evidence.secrets_scan_verified, true);
    assert.strictEqual(evidence.readiness_probes_verified, true);
    assert.strictEqual(evidence.network_isolation_verified, true);
    assert.deepStrictEqual(evidence.graceful_drain_periods_verified, {
      caddy: '30s',
      next: '30s',
      api: '45s',
      worker: '60s',
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('run-deployment-drill: fails closed when compose file does not exist', () => {
  const tmpDir = makeTempDir();
  try {
    const nonexistentCompose = path.join(tmpDir, 'does-not-exist.yml');
    const { output, exitCode } = runTolerant([
      '--dry-run',
      '--compose-file',
      nonexistentCompose,
      '--evidence-dir',
      tmpDir,
    ]);
    assert.strictEqual(exitCode, 1);
    assert.ok(output.includes(`Error: Compose file does not exist at "${nonexistentCompose}"`));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('run-deployment-drill: fails closed when a service omits restart: unless-stopped', () => {
  const tmpDir = makeTempDir();
  try {
    const composeDoc = yaml.load(fs.readFileSync(DEFAULT_COMPOSE, 'utf8'));
    delete composeDoc.services.postgres.restart;
    const modifiedCompose = path.join(tmpDir, 'no-restart.yml');
    fs.writeFileSync(modifiedCompose, yaml.dump(composeDoc));

    const { output, exitCode } = runTolerant([
      '--dry-run',
      '--compose-file',
      modifiedCompose,
      '--evidence-dir',
      tmpDir,
    ]);
    assert.strictEqual(exitCode, 1);
    assert.ok(output.includes('Error: Service "postgres" must configure restart: unless-stopped'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('run-deployment-drill: fails closed when a service omits bounded stop_grace_period', () => {
  const tmpDir = makeTempDir();
  try {
    const composeDoc = yaml.load(fs.readFileSync(DEFAULT_COMPOSE, 'utf8'));
    delete composeDoc.services.valkey.stop_grace_period;
    const modifiedCompose = path.join(tmpDir, 'no-grace.yml');
    fs.writeFileSync(modifiedCompose, yaml.dump(composeDoc));

    const { output, exitCode } = runTolerant([
      '--dry-run',
      '--compose-file',
      modifiedCompose,
      '--evidence-dir',
      tmpDir,
    ]);
    assert.strictEqual(exitCode, 1);
    assert.ok(output.includes('Error: Service "valkey" must configure a positive bounded stop_grace_period'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('run-deployment-drill: fails closed when an application service drifts on stop_grace_period', () => {
  const tmpDir = makeTempDir();
  try {
    const composeDoc = yaml.load(fs.readFileSync(DEFAULT_COMPOSE, 'utf8'));
    composeDoc.services.api.stop_grace_period = '30s'; // Expected: 45s
    const modifiedCompose = path.join(tmpDir, 'drifted-grace.yml');
    fs.writeFileSync(modifiedCompose, yaml.dump(composeDoc));

    const { output, exitCode } = runTolerant([
      '--dry-run',
      '--compose-file',
      modifiedCompose,
      '--evidence-dir',
      tmpDir,
    ]);
    assert.strictEqual(exitCode, 1);
    assert.ok(output.includes('Error: Service "api" stop_grace_period is "30s", expected "45s"'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('run-deployment-drill: fails closed when api omits or misconfigures datastore dependency', () => {
  const tmpDir = makeTempDir();
  try {
    const composeDoc = yaml.load(fs.readFileSync(DEFAULT_COMPOSE, 'utf8'));
    composeDoc.services.api.depends_on.postgres.condition = 'service_started';
    const modifiedCompose = path.join(tmpDir, 'unready-dep.yml');
    fs.writeFileSync(modifiedCompose, yaml.dump(composeDoc));

    const { output, exitCode } = runTolerant([
      '--dry-run',
      '--compose-file',
      modifiedCompose,
      '--evidence-dir',
      tmpDir,
    ]);
    assert.strictEqual(exitCode, 1);
    assert.ok(output.includes('Error: Service "api" must depend on healthy "postgres" (condition: service_healthy)'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('run-deployment-drill: fails closed when worker omits clamav dependency', () => {
  const tmpDir = makeTempDir();
  try {
    const composeDoc = yaml.load(fs.readFileSync(DEFAULT_COMPOSE, 'utf8'));
    delete composeDoc.services.worker.depends_on.clamav;
    const modifiedCompose = path.join(tmpDir, 'missing-clamav.yml');
    fs.writeFileSync(modifiedCompose, yaml.dump(composeDoc));

    const { output, exitCode } = runTolerant([
      '--dry-run',
      '--compose-file',
      modifiedCompose,
      '--evidence-dir',
      tmpDir,
    ]);
    assert.strictEqual(exitCode, 1);
    assert.ok(output.includes('Error: Service "worker" must depend on healthy "clamav" (condition: service_healthy)'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('run-deployment-drill: fails closed when an application service omits init: true or stop_signal', () => {
  const tmpDir = makeTempDir();
  try {
    const composeDoc = yaml.load(fs.readFileSync(DEFAULT_COMPOSE, 'utf8'));
    delete composeDoc.services.next.init;
    const modifiedCompose = path.join(tmpDir, 'no-init.yml');
    fs.writeFileSync(modifiedCompose, yaml.dump(composeDoc));

    const { output, exitCode } = runTolerant([
      '--dry-run',
      '--compose-file',
      modifiedCompose,
      '--evidence-dir',
      tmpDir,
    ]);
    assert.strictEqual(exitCode, 1);
    assert.ok(output.includes('Error: Service "next" must configure init: true for signal supervision'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('run-deployment-drill: fails closed when an internal service joins public network', () => {
  const tmpDir = makeTempDir();
  try {
    const composeDoc = yaml.load(fs.readFileSync(DEFAULT_COMPOSE, 'utf8'));
    composeDoc.services.api.networks = ['private', 'public'];
    const modifiedCompose = path.join(tmpDir, 'public-leak.yml');
    fs.writeFileSync(modifiedCompose, yaml.dump(composeDoc));

    const { output, exitCode } = runTolerant([
      '--dry-run',
      '--compose-file',
      modifiedCompose,
      '--evidence-dir',
      tmpDir,
    ]);
    assert.strictEqual(exitCode, 1);
    assert.ok(output.includes('Error: Service "api" must not join the public network!'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
