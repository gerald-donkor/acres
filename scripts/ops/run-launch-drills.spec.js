const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(__dirname, 'run-launch-drills.sh');
const BACKUPS_DIR = path.join(ROOT, 'backups');

const EXPECTED_STAGE_IDS = [
  'static_templates',
  'supply_chain_sast',
  'ingress_deployment',
  'volume_encryption',
  'secret_rotation',
  'capacity_alerting',
  'disaster_recovery',
];

function run(args, options = {}) {
  return execFileSync('bash', [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 300000,
    ...options,
  });
}

/** Run ignoring non-zero exit (stage 7 fails closed without drill infra). */
function runTolerant(args, options = {}) {
  try {
    return { output: run(args, options), exitCode: 0 };
  } catch (err) {
    return { output: (err.stdout || '') + (err.stderr || ''), exitCode: err.status };
  }
}

function assertDossierSchema(dossier) {
  assert.strictEqual(typeof dossier.version, 'string');
  assert.match(dossier.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.ok(['production', 'drill'].includes(dossier.environment));
  assert.ok(['PASSED', 'FAILED'].includes(dossier.overall_status));
  assert.strictEqual(dossier.total_stages, 7);
  assert.strictEqual(dossier.passed_stages + dossier.failed_stages, 7);
  assert.strictEqual(typeof dossier.duration_seconds, 'number');

  assert.strictEqual(dossier.stages.length, 7);
  assert.deepStrictEqual(
    dossier.stages.map((s) => s.stage_id),
    EXPECTED_STAGE_IDS
  );
  for (const stage of dossier.stages) {
    assert.strictEqual(typeof stage.description, 'string');
    assert.ok(['PASSED', 'FAILED'].includes(stage.status));
    assert.strictEqual(typeof stage.duration_ms, 'number');
    assert.ok(Array.isArray(stage.artifacts));
    assert.ok(stage.artifacts.length >= 1, `stage ${stage.stage_id} must list artifacts`);
    for (const a of stage.artifacts) assert.strictEqual(typeof a, 'string');
    assert.ok(stage.error_message === null || typeof stage.error_message === 'string');
  }

  assert.strictEqual(typeof dossier.summary, 'object');
}

/**
 * The nested capacity evaluator (invoked inside run-capacity-alerting-drill.sh)
 * always writes its report to the repo backups/ dir. Everything else honors
 * the orchestrator's --evidence-dir. Remove only those residuals created after
 * `sinceMs` so parallel runs cannot lose files.
 */
function cleanNestedResiduals(sinceMs) {
  for (const f of fs.readdirSync(BACKUPS_DIR)) {
    if (!f.startsWith('capacity-load-report-') || !f.endsWith('.json')) continue;
    const full = path.join(BACKUPS_DIR, f);
    try {
      if (fs.statSync(full).mtimeMs >= sinceMs) fs.unlinkSync(full);
    } catch {
      // Already gone — nothing to clean.
    }
  }
}

test('orchestrator script exists and is executable', () => {
  assert.ok(fs.existsSync(SCRIPT), 'run-launch-drills.sh must exist');
  fs.accessSync(SCRIPT, fs.constants.X_OK);
});

test('--help displays usage and options', () => {
  const out = run(['--help']);
  assert.match(out, /Unified Launch Drill Orchestrator/);
  assert.match(out, /--dry-run/);
  assert.match(out, /--json/);
  assert.match(out, /--output <path>/);
  assert.match(out, /--verbose/);
});

test('options requiring a value fail with usage instead of crashing', () => {
  assert.throws(() => run(['--output']), /--output requires a value/);
  assert.throws(() => run(['--evidence-dir']), /--evidence-dir requires a value/);
});

test('unknown option exits non-zero', () => {
  assert.throws(() => run(['--bogus-flag']), /Unknown option|Command failed/);
});

test('--dry-run executes all 7 stages and emits a schema-compliant dossier', () => {
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'launch-drill-'));
  const sinceMs = Date.now();
  try {
    const dossierPath = path.join(tmpDir, 'dossier.json');
    // NOTE: exit code depends on stage 7 drill infra (Postgres/Garage);
    // the dossier schema must hold either way (fail-closed still emits it).
    // --evidence-dir keeps child evidence out of the repo backups/ dir.
    runTolerant(['--dry-run', '--output', dossierPath, '--evidence-dir', tmpDir, '--json']);

    assert.ok(fs.existsSync(dossierPath), 'dossier JSON file must be created');
    const dossier = JSON.parse(fs.readFileSync(dossierPath, 'utf8'));
    assertDossierSchema(dossier);
    assert.strictEqual(dossier.environment, 'drill');

    // Stages 1–6 are fully offline and must pass without live infra.
    for (const stage of dossier.stages.slice(0, 6)) {
      assert.strictEqual(stage.status, 'PASSED', `offline stage ${stage.stage_id} must pass`);
      assert.strictEqual(stage.error_message, null);
    }

    // Stage artifacts must reference real child evidence, not just the dossier.
    const capacityStage = dossier.stages.find((s) => s.stage_id === 'capacity_alerting');
    assert.ok(
      capacityStage.artifacts.some((a) => a.includes('capacity-alerting-drill-evidence-')),
      `expected child evidence in artifacts, got: ${JSON.stringify(capacityStage.artifacts)}`
    );
    for (const stage of dossier.stages) {
      assert.ok(
        stage.artifacts.some((a) => a.includes(`launch-drill-stage-${stage.stage_id}.log`)),
        `expected stage log in artifacts for ${stage.stage_id}`
      );
    }
  } finally {
    cleanNestedResiduals(sinceMs);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--json prints the identical dossier to stdout', () => {
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'launch-drill-'));
  const sinceMs = Date.now();
  try {
    const dossierPath = path.join(tmpDir, 'dossier.json');
    const { output } = runTolerant(['--dry-run', '--output', dossierPath, '--evidence-dir', tmpDir, '--json']);
    // stdout carries the tabular summary around the dossier; the dossier is
    // the only JSON blob, spanning the first '{' to the last '}'.
    const printed = JSON.parse(output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1));
    const dossier = JSON.parse(fs.readFileSync(dossierPath, 'utf8'));
    assert.deepStrictEqual(printed, dossier);
  } finally {
    cleanNestedResiduals(sinceMs);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('--evidence-dir redirects the default dossier path out of backups/', () => {
  const sinceMs = Date.now();
  const before = new Set(fs.readdirSync(BACKUPS_DIR));
  // --evidence-dir intentionally omitted: the dossier must land in backups/.
  // Child evidence is still redirected to tmp to avoid litter.
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'launch-drill-'));
  try {
    runTolerant(['--dry-run', '--evidence-dir', tmpDir]);
  } finally {
    cleanNestedResiduals(sinceMs);
  }
  try {
    const after = fs.readdirSync(BACKUPS_DIR);
    const created = after.filter((f) => !before.has(f) && f.startsWith('launch-evidence-dossier-') && f.endsWith('.json'));
    // No dossier expected in backups/ here because --evidence-dir redirects the
    // default dossier path too; assert the invariant explicitly instead.
    assert.strictEqual(created.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('default evidence dir receives the dossier when no flags are given', () => {
  const sinceMs = Date.now();
  const before = new Set(fs.readdirSync(BACKUPS_DIR));
  runTolerant(['--dry-run']);
  try {
    const after = fs.readdirSync(BACKUPS_DIR);
    const created = after.filter((f) => !before.has(f) && f.startsWith('launch-evidence-dossier-') && f.endsWith('.json'));
    assert.strictEqual(created.length, 1, `expected one new dossier, got: ${JSON.stringify(created)}`);
    const dossier = JSON.parse(fs.readFileSync(path.join(BACKUPS_DIR, created[0]), 'utf8'));
    assertDossierSchema(dossier);
  } finally {
    // Remove everything this run created (dossier, stage logs, child evidence).
    for (const f of fs.readdirSync(BACKUPS_DIR)) {
      if (before.has(f)) continue;
      try {
        if (fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs >= sinceMs) {
          fs.unlinkSync(path.join(BACKUPS_DIR, f));
        }
      } catch {
        // Already gone — nothing to clean.
      }
    }
    cleanNestedResiduals(sinceMs);
  }
});

test('orchestrator fails closed when a child drill fails', () => {
  // run-restore-drill.sh deterministically rejects SOURCE_DB == DRILL_DB
  // before touching any infrastructure, so this exercises the genuine
  // fail-closed path without mutating tracked files or needing live infra.
  const tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'launch-drill-'));
  const sinceMs = Date.now();
  try {
    const dossierPath = path.join(tmpDir, 'dossier.json');
    const { exitCode } = runTolerant(['--dry-run', '--output', dossierPath, '--evidence-dir', tmpDir], {
      env: { ...process.env, SOURCE_DB: 'same_db_name', DRILL_DB: 'same_db_name' },
    });
    assert.notStrictEqual(exitCode, 0, 'orchestrator must exit non-zero when a stage fails');
    const dossier = JSON.parse(fs.readFileSync(dossierPath, 'utf8'));
    assert.strictEqual(dossier.overall_status, 'FAILED');
    assert.ok(dossier.failed_stages >= 1);
    const dr = dossier.stages.find((s) => s.stage_id === 'disaster_recovery');
    assert.strictEqual(dr.status, 'FAILED');
    assert.strictEqual(typeof dr.error_message, 'string');
  } finally {
    cleanNestedResiduals(sinceMs);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
