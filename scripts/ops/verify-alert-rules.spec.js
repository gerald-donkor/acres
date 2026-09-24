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
  assert.equal(result.alerts.length, 9);
  assert.equal(result.simulations.length, 9);
  assert.ok(result.checks.length >= 19);
  assert.ok(result.checks.every((c) => c.passed === true));
});

test('verifyAlertRules: verifies all 9 required alerts are present', () => {
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
    assert.ok(result.errors.some((e) => e.includes('Missing required alert rule: HighHttpConcurrency')));
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

test('verifyAlertRules: rejects a 4xx numerator for High429Rate', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-alert-test-'));
  try {
    const alertsObj = yaml.load(fs.readFileSync(ALERTS_FILE, 'utf8'));
    const rule = alertsObj.groups[0].rules.find((item) => item.alert === 'High429Rate');
    rule.expr = rule.expr.replace(
      'acres_http_429_responses_total{job="acres-api"}[5m]',
      'acres_http_requests_total{job="acres-api",status_class="4xx"}[5m]',
    );
    const tmpAlertsPath = path.join(tmpDir, 'alerts.yml');
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj), 'utf8');

    const result = verifyAlertRules({ alertsPath: tmpAlertsPath, promConfigPath: PROM_FILE });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('dedicated 429 counter')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('High429Rate: heavy non-429 4xx traffic does not fire', () => {
  const simulation = SIMULATION_DEFINITIONS.High429Rate;
  assert.equal(simulation.evaluate({ totalRequests: 100, requests4xx: 90, requests429: 0 }), false);
  assert.equal(simulation.evaluate({ totalRequests: 100, requests4xx: 90, requests429: 11 }), true);
});

test('HighHttpConcurrency: rejects a changed signal, duration, or severity', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-alert-test-'));
  try {
    const alertsObj = yaml.load(fs.readFileSync(ALERTS_FILE, 'utf8'));
    const rule = alertsObj.groups[0].rules.find((item) => item.alert === 'HighHttpConcurrency');
    rule.expr = 'acres_outbox_pending_events > 40';
    rule.for = '5m';
    rule.labels.severity = 'critical';
    const tmpAlertsPath = path.join(tmpDir, 'alerts.yml');
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj), 'utf8');

    const result = verifyAlertRules({ alertsPath: tmpAlertsPath, promConfigPath: PROM_FILE });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('expr must be acres_http_active_requests{job="acres-api"} > 40')));
    assert.ok(result.errors.some((error) => error.includes('for must be 2m')));
    assert.ok(result.errors.some((error) => error.includes('severity must be warning')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('HighHttpConcurrency: fires above 40 and clears at 40', () => {
  const simulation = SIMULATION_DEFINITIONS.HighHttpConcurrency;
  assert.equal(simulation.evaluate({ activeRequests: 41 }), true);
  assert.equal(simulation.evaluate({ activeRequests: 40 }), false);
});

test('DatabaseConnectionPoolSaturation: rejects a changed signal, duration, or severity', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-alert-test-'));
  try {
    const alertsObj = yaml.load(fs.readFileSync(ALERTS_FILE, 'utf8'));
    const rule = alertsObj.groups[0].rules.find((item) => item.alert === 'DatabaseConnectionPoolSaturation');
    rule.expr = 'acres_postgres_pool_requests_waiting{job="acres-worker"} > 0';
    rule.for = '5m';
    rule.labels.severity = 'critical';
    const tmpAlertsPath = path.join(tmpDir, 'alerts.yml');
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj), 'utf8');

    const result = verifyAlertRules({ alertsPath: tmpAlertsPath, promConfigPath: PROM_FILE });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('expr must be acres_postgres_pool_requests_waiting{job="acres-api"} > 0')));
    assert.ok(result.errors.some((error) => error.includes('for must be 1m')));
    assert.ok(result.errors.some((error) => error.includes('severity must be warning')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('DatabaseConnectionPoolSaturation: fires when waiting requests > 0 and clears at 0', () => {
  const simulation = SIMULATION_DEFINITIONS.DatabaseConnectionPoolSaturation;
  assert.equal(simulation.evaluate({ postgresPoolRequestsWaiting: 1 }), true);
  assert.equal(simulation.evaluate({ postgresPoolRequestsWaiting: 5 }), true);
  assert.equal(simulation.evaluate({ postgresPoolRequestsWaiting: 0 }), false);
});

test('AcresWorkerDown: rejects a changed signal, duration, or severity', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-alert-test-'));
  try {
    const alertsObj = yaml.load(fs.readFileSync(ALERTS_FILE, 'utf8'));
    const rule = alertsObj.groups[0].rules.find((item) => item.alert === 'AcresWorkerDown');
    rule.expr = 'up{job="acres-api"} == 0';
    rule.for = '5m';
    rule.labels.severity = 'warning';
    const tmpAlertsPath = path.join(tmpDir, 'alerts.yml');
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj), 'utf8');

    const result = verifyAlertRules({ alertsPath: tmpAlertsPath, promConfigPath: PROM_FILE });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('expr must be up{job="acres-worker"} == 0')));
    assert.ok(result.errors.some((error) => error.includes('for must be 1m')));
    assert.ok(result.errors.some((error) => error.includes('severity must be critical')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('AcresWorkerDown: fires when workerUp === 0 and clears at 1', () => {
  const simulation = SIMULATION_DEFINITIONS.AcresWorkerDown;
  assert.equal(simulation.evaluate({ workerUp: 0 }), true);
  assert.equal(simulation.evaluate({ workerUp: 1 }), false);
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

test('verifyAlertRules: rejects an unscoped outbox selector that would duplicate alert instances', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-alert-test-'));
  try {
    const alertsObj = yaml.load(fs.readFileSync(ALERTS_FILE, 'utf8'));
    alertsObj.groups[0].rules.find((item) => item.alert === 'OutboxDeliveryLag').expr = 'acres_outbox_pending_events > 50';
    const tmpAlertsPath = path.join(tmpDir, 'alerts.yml');
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj));
    const result = verifyAlertRules({ alertsPath: tmpAlertsPath, promConfigPath: PROM_FILE });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('every metric selector must use job="acres-api"')));
  } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
});
