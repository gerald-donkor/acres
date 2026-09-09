const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const yaml = require('js-yaml');

const {
  REQUIRED_ALERTS,
  KNOWN_METRIC_IDENTIFIERS,
  SIMULATION_DEFINITIONS,
  isValidDuration,
  verifyAlertRules,
} = require('./verify-alert-rules');

const ROOT_DIR = path.resolve(__dirname, '../..');
const ALERTS_FILE = path.join(ROOT_DIR, 'infra/prometheus/alerts.yml');
const PROM_FILE = path.join(ROOT_DIR, 'infra/prometheus/prometheus.yml');

test('verifyAlertRules: production alert definitions pass 100% of schema, PromQL, and simulation checks', () => {
  const result = verifyAlertRules({
    alertsPath: ALERTS_FILE,
    promConfigPath: PROM_FILE,
  });

  assert.equal(result.valid, true, `Expected valid alert rules, errors: ${result.errors.join(', ')}`);
  assert.equal(result.errors.length, 0);
  assert.equal(result.alerts.length, 7);
  assert.equal(result.simulations.length, 7);
  assert.ok(result.checks.length >= 16);
  assert.ok(result.checks.every((c) => c.passed === true));
});

test('verifyAlertRules: verifies all 7 required alerts are present', () => {
  const result = verifyAlertRules({
    alertsPath: ALERTS_FILE,
    promConfigPath: PROM_FILE,
  });

  const alertNames = result.alerts.map((a) => a.alert);
  for (const required of REQUIRED_ALERTS) {
    assert.ok(alertNames.includes(required), `Missing required alert in output: ${required}`);
  }
});

test('verifyAlertRules: flags missing required alert rule', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-alert-test-'));
  try {
    const incompleteAlerts = {
      groups: [
        {
          name: 'partial',
          rules: [
            {
              alert: 'AcresApiDown',
              expr: 'up == 0',
              for: '1m',
              labels: { severity: 'critical' },
              annotations: { summary: 'down', description: 'down' },
            },
          ],
        },
      ],
    };
    const tmpAlertsPath = path.join(tmpDir, 'alerts.yml');
    fs.writeFileSync(tmpAlertsPath, yaml.dump(incompleteAlerts), 'utf8');

    const result = verifyAlertRules({
      alertsPath: tmpAlertsPath,
      promConfigPath: PROM_FILE,
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Missing required alert rule: HighHttp5xxRate')));
    assert.ok(result.errors.some((e) => e.includes('Missing required alert rule: P95LatencyThresholdExceeded')));
    assert.ok(result.errors.some((e) => e.includes('Missing required alert rule: High429Rate')));
    assert.ok(result.errors.some((e) => e.includes('Missing required alert rule: DatabaseConnectionPoolSaturation')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('verifyAlertRules: flags invalid duration format', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-alert-test-'));
  try {
    const rawAlerts = fs.readFileSync(ALERTS_FILE, 'utf8');
    const alertsObj = yaml.load(rawAlerts);
    // Corrupt one duration
    alertsObj.groups[0].rules[0].for = '5minutes';
    const tmpAlertsPath = path.join(tmpDir, 'alerts.yml');
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj), 'utf8');

    const result = verifyAlertRules({
      alertsPath: tmpAlertsPath,
      promConfigPath: PROM_FILE,
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Invalid 'for' duration: 5minutes")));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('verifyAlertRules: flags invalid severity level', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-alert-test-'));
  try {
    const rawAlerts = fs.readFileSync(ALERTS_FILE, 'utf8');
    const alertsObj = yaml.load(rawAlerts);
    // Change severity to invalid value
    alertsObj.groups[0].rules[0].labels.severity = 'info';
    const tmpAlertsPath = path.join(tmpDir, 'alerts.yml');
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj), 'utf8');

    const result = verifyAlertRules({
      alertsPath: tmpAlertsPath,
      promConfigPath: PROM_FILE,
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Invalid severity: info')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('verifyAlertRules: flags missing summary or description annotations', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-alert-test-'));
  try {
    const rawAlerts = fs.readFileSync(ALERTS_FILE, 'utf8');
    const alertsObj = yaml.load(rawAlerts);
    delete alertsObj.groups[0].rules[0].annotations.summary;
    const tmpAlertsPath = path.join(tmpDir, 'alerts.yml');
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj), 'utf8');

    const result = verifyAlertRules({
      alertsPath: tmpAlertsPath,
      promConfigPath: PROM_FILE,
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Missing annotations.summary')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('verifyAlertRules: flags expression not referencing recognized Acres metrics', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-alert-test-'));
  try {
    const rawAlerts = fs.readFileSync(ALERTS_FILE, 'utf8');
    const alertsObj = yaml.load(rawAlerts);
    alertsObj.groups[0].rules[0].expr = 'unrelated_foreign_metric > 100';
    const tmpAlertsPath = path.join(tmpDir, 'alerts.yml');
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj), 'utf8');

    const result = verifyAlertRules({
      alertsPath: tmpAlertsPath,
      promConfigPath: PROM_FILE,
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('does not reference any known Acres metrics')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('SIMULATION_DEFINITIONS: evaluates each alert condition faithfully on breach and normal samples', () => {
  for (const alertName of REQUIRED_ALERTS) {
    const sim = SIMULATION_DEFINITIONS[alertName];
    assert.ok(sim, `Expected simulation definition for ${alertName}`);

    // Firing sample must trigger condition
    assert.equal(
      sim.evaluate(sim.firingSample),
      true,
      `Alert ${alertName} failed to fire on breach condition`,
    );

    // Cleared sample must NOT trigger condition
    assert.equal(
      sim.evaluate(sim.clearedSample),
      false,
      `Alert ${alertName} failed to clear on normal traffic condition`,
    );
  }
});

test('isValidDuration: accurately accepts valid Prometheus durations and rejects invalid ones', () => {
  assert.equal(isValidDuration('30s'), true);
  assert.equal(isValidDuration('1m'), true);
  assert.equal(isValidDuration('5m'), true);
  assert.equal(isValidDuration('2h'), true);
  assert.equal(isValidDuration('1d'), true);
  assert.equal(isValidDuration('500ms'), true);

  assert.equal(isValidDuration('5'), false);
  assert.equal(isValidDuration('5minutes'), false);
  assert.equal(isValidDuration(''), false);
  assert.equal(isValidDuration(null), false);
  assert.equal(isValidDuration(undefined), false);
  assert.equal(isValidDuration(100), false);
});
