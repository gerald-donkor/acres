const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const yaml = require("js-yaml");

const {
  REQUIRED_ALERTS,
  KNOWN_METRIC_IDENTIFIERS,
  SIMULATION_DEFINITIONS,
  isValidDuration,
  verifyAlertRules,
} = require("./verify-alert-rules");

const ROOT_DIR = path.resolve(__dirname, "../..");
const ALERTS_FILE = path.join(ROOT_DIR, "infra/prometheus/alerts.yml");
const PROM_FILE = path.join(ROOT_DIR, "infra/prometheus/prometheus.yml");

test("verifyAlertRules: production alert definitions pass static heuristics and synthetic predicate checks", () => {
  const result = verifyAlertRules({
    alertsPath: ALERTS_FILE,
    promConfigPath: PROM_FILE,
  });

  assert.equal(
    result.valid,
    true,
    `Expected valid alert rules, errors: ${result.errors.join(", ")}`,
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.alerts.length, 11);
  assert.equal(result.simulations.length, 11);
  assert.ok(result.checks.length === 25);
  assert.ok(result.checks.every((c) => c.passed === true));
});

test("verifyAlertRules: verifies all 11 required alerts are present", () => {
  const result = verifyAlertRules({
    alertsPath: ALERTS_FILE,
    promConfigPath: PROM_FILE,
  });

  const alertNames = result.alerts.map((a) => a.alert);
  for (const required of REQUIRED_ALERTS) {
    assert.ok(
      alertNames.includes(required),
      `Missing required alert in output: ${required}`,
    );
  }
});

test("verifyAlertRules: flags missing required alert rule", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-alert-test-"));
  try {
    const incompleteAlerts = {
      groups: [
        {
          name: "partial",
          rules: [
            {
              alert: "AcresApiDown",
              expr: "up == 0",
              for: "1m",
              labels: { severity: "critical" },
              annotations: { summary: "down", description: "down" },
            },
          ],
        },
      ],
    };
    const tmpAlertsPath = path.join(tmpDir, "alerts.yml");
    fs.writeFileSync(tmpAlertsPath, yaml.dump(incompleteAlerts), "utf8");

    const result = verifyAlertRules({
      alertsPath: tmpAlertsPath,
      promConfigPath: PROM_FILE,
    });

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) =>
        e.includes("Missing required alert rule: HighHttp5xxRate"),
      ),
    );
    assert.ok(
      result.errors.some((e) =>
        e.includes("Missing required alert rule: P95LatencyThresholdExceeded"),
      ),
    );
    assert.ok(
      result.errors.some((e) =>
        e.includes("Missing required alert rule: High429Rate"),
      ),
    );
    assert.ok(
      result.errors.some((e) =>
        e.includes("Missing required alert rule: HighHttpConcurrency"),
      ),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("verifyAlertRules: flags invalid duration format", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-alert-test-"));
  try {
    const rawAlerts = fs.readFileSync(ALERTS_FILE, "utf8");
    const alertsObj = yaml.load(rawAlerts);
    // Corrupt one duration
    alertsObj.groups[0].rules[0].for = "5minutes";
    const tmpAlertsPath = path.join(tmpDir, "alerts.yml");
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj), "utf8");

    const result = verifyAlertRules({
      alertsPath: tmpAlertsPath,
      promConfigPath: PROM_FILE,
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Invalid 'for' duration")));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("verifyAlertRules: flags invalid severity level", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-alert-test-"));
  try {
    const rawAlerts = fs.readFileSync(ALERTS_FILE, "utf8");
    const alertsObj = yaml.load(rawAlerts);
    // Change severity to invalid value
    alertsObj.groups[0].rules[0].labels.severity = "info";
    const tmpAlertsPath = path.join(tmpDir, "alerts.yml");
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj), "utf8");

    const result = verifyAlertRules({
      alertsPath: tmpAlertsPath,
      promConfigPath: PROM_FILE,
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Invalid severity")));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("verifyAlertRules: flags missing summary or description annotations", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-alert-test-"));
  try {
    const rawAlerts = fs.readFileSync(ALERTS_FILE, "utf8");
    const alertsObj = yaml.load(rawAlerts);
    delete alertsObj.groups[0].rules[0].annotations.summary;
    const tmpAlertsPath = path.join(tmpDir, "alerts.yml");
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj), "utf8");

    const result = verifyAlertRules({
      alertsPath: tmpAlertsPath,
      promConfigPath: PROM_FILE,
    });

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes("Missing annotations.summary")),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("verifyAlertRules: flags expression not referencing recognized Acres metrics", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-alert-test-"));
  try {
    const rawAlerts = fs.readFileSync(ALERTS_FILE, "utf8");
    const alertsObj = yaml.load(rawAlerts);
    alertsObj.groups[0].rules[0].expr = "unrelated_foreign_metric > 100";
    const tmpAlertsPath = path.join(tmpDir, "alerts.yml");
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj), "utf8");

    const result = verifyAlertRules({
      alertsPath: tmpAlertsPath,
      promConfigPath: PROM_FILE,
    });

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) =>
        e.includes("does not reference any known Acres metrics"),
      ),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("verifyAlertRules: rejects a 4xx numerator for High429Rate", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-alert-test-"));
  try {
    const alertsObj = yaml.load(fs.readFileSync(ALERTS_FILE, "utf8"));
    const rule = alertsObj.groups[0].rules.find(
      (item) => item.alert === "High429Rate",
    );
    rule.expr = rule.expr.replace(
      'acres_http_429_responses_total{job="acres-api"}[5m]',
      'acres_http_requests_total{job="acres-api",status_class="4xx"}[5m]',
    );
    const tmpAlertsPath = path.join(tmpDir, "alerts.yml");
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj), "utf8");

    const result = verifyAlertRules({
      alertsPath: tmpAlertsPath,
      promConfigPath: PROM_FILE,
    });
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((error) => error.includes("dedicated 429 counter")),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("High429Rate: heavy non-429 4xx traffic does not fire", () => {
  const simulation = SIMULATION_DEFINITIONS.High429Rate;
  assert.equal(
    simulation.evaluate({
      totalRequests: 100,
      requests4xx: 90,
      requests429: 0,
    }),
    false,
  );
  assert.equal(
    simulation.evaluate({
      totalRequests: 100,
      requests4xx: 90,
      requests429: 11,
    }),
    true,
  );
});

test("HighHttpConcurrency: rejects a changed signal, duration, or severity", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-alert-test-"));
  try {
    const alertsObj = yaml.load(fs.readFileSync(ALERTS_FILE, "utf8"));
    const rule = alertsObj.groups[0].rules.find(
      (item) => item.alert === "HighHttpConcurrency",
    );
    rule.expr = "acres_outbox_pending_events > 40";
    rule.for = "5m";
    rule.labels.severity = "critical";
    const tmpAlertsPath = path.join(tmpDir, "alerts.yml");
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj), "utf8");

    const result = verifyAlertRules({
      alertsPath: tmpAlertsPath,
      promConfigPath: PROM_FILE,
    });
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((error) =>
        error.includes(
          'expr must be acres_http_active_requests{job="acres-api"} > 40',
        ),
      ),
    );
    assert.ok(result.errors.some((error) => error.includes("for must be 2m")));
    assert.ok(
      result.errors.some((error) => error.includes("severity must be warning")),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("HighHttpConcurrency: fires above 40 and clears at 40", () => {
  const simulation = SIMULATION_DEFINITIONS.HighHttpConcurrency;
  assert.equal(simulation.evaluate({ activeRequests: 41 }), true);
  assert.equal(simulation.evaluate({ activeRequests: 40 }), false);
});

test("DatabaseConnectionPoolSaturation: rejects a changed signal, duration, or severity", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-alert-test-"));
  try {
    const alertsObj = yaml.load(fs.readFileSync(ALERTS_FILE, "utf8"));
    const rule = alertsObj.groups[0].rules.find(
      (item) => item.alert === "DatabaseConnectionPoolSaturation",
    );
    rule.expr = 'acres_postgres_pool_requests_waiting{job="acres-worker"} > 0';
    rule.for = "5m";
    rule.labels.severity = "critical";
    const tmpAlertsPath = path.join(tmpDir, "alerts.yml");
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj), "utf8");

    const result = verifyAlertRules({
      alertsPath: tmpAlertsPath,
      promConfigPath: PROM_FILE,
    });
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((error) =>
        error.includes(
          'expr must be acres_postgres_pool_requests_waiting{job="acres-api"} > 0',
        ),
      ),
    );
    assert.ok(result.errors.some((error) => error.includes("for must be 1m")));
    assert.ok(
      result.errors.some((error) => error.includes("severity must be warning")),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("DatabaseConnectionPoolSaturation: fires when waiting requests > 0 and clears at 0", () => {
  const simulation = SIMULATION_DEFINITIONS.DatabaseConnectionPoolSaturation;
  assert.equal(simulation.evaluate({ postgresPoolRequestsWaiting: 1 }), true);
  assert.equal(simulation.evaluate({ postgresPoolRequestsWaiting: 5 }), true);
  assert.equal(simulation.evaluate({ postgresPoolRequestsWaiting: 0 }), false);
});

test("AcresWorkerDown: rejects a changed signal, duration, or severity", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-alert-test-"));
  try {
    const alertsObj = yaml.load(fs.readFileSync(ALERTS_FILE, "utf8"));
    const rule = alertsObj.groups[0].rules.find(
      (item) => item.alert === "AcresWorkerDown",
    );
    rule.expr = 'up{job="acres-api"} == 0';
    rule.for = "5m";
    rule.labels.severity = "warning";
    const tmpAlertsPath = path.join(tmpDir, "alerts.yml");
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj), "utf8");

    const result = verifyAlertRules({
      alertsPath: tmpAlertsPath,
      promConfigPath: PROM_FILE,
    });
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((error) =>
        error.includes('expr must be up{job="acres-worker"} == 0'),
      ),
    );
    assert.ok(result.errors.some((error) => error.includes("for must be 1m")));
    assert.ok(
      result.errors.some((error) =>
        error.includes("severity must be critical"),
      ),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("AcresWorkerDown: fires when workerUp === 0 and clears at 1", () => {
  const simulation = SIMULATION_DEFINITIONS.AcresWorkerDown;
  assert.equal(simulation.evaluate({ workerUp: 0 }), true);
  assert.equal(simulation.evaluate({ workerUp: 1 }), false);
});

test("PostgresDown: rejects a changed signal, duration, or severity", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-alert-test-"));
  try {
    const alertsObj = yaml.load(fs.readFileSync(ALERTS_FILE, "utf8"));
    const rule = alertsObj.groups[0].rules.find(
      (item) => item.alert === "PostgresDown",
    );
    rule.expr = 'pg_up{job="acres-api"} == 0';
    rule.for = "5m";
    rule.labels.severity = "warning";
    const tmpAlertsPath = path.join(tmpDir, "alerts.yml");
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj), "utf8");

    const result = verifyAlertRules({
      alertsPath: tmpAlertsPath,
      promConfigPath: PROM_FILE,
    });
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((error) =>
        error.includes('expr must be pg_up{job="acres-postgres"} == 0'),
      ),
    );
    assert.ok(result.errors.some((error) => error.includes("for must be 1m")));
    assert.ok(
      result.errors.some((error) =>
        error.includes("severity must be critical"),
      ),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("PostgresDown: fires when pgUp === 0 and clears at 1", () => {
  const simulation = SIMULATION_DEFINITIONS.PostgresDown;
  assert.equal(simulation.evaluate({ pgUp: 0 }), true);
  assert.equal(simulation.evaluate({ pgUp: 1 }), false);
});

test("PostgresExporterDown: rejects a changed signal, duration, or severity", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-alert-test-"));
  try {
    const alertsObj = yaml.load(fs.readFileSync(ALERTS_FILE, "utf8"));
    const rule = alertsObj.groups[0].rules.find(
      (item) => item.alert === "PostgresExporterDown",
    );
    rule.expr = 'up{job="acres-api"} == 0';
    rule.for = "5m";
    rule.labels.severity = "critical";
    const tmpAlertsPath = path.join(tmpDir, "alerts.yml");
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj), "utf8");

    const result = verifyAlertRules({
      alertsPath: tmpAlertsPath,
      promConfigPath: PROM_FILE,
    });
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((error) =>
        error.includes('expr must be up{job="acres-postgres"} == 0'),
      ),
    );
    assert.ok(result.errors.some((error) => error.includes("for must be 1m")));
    assert.ok(
      result.errors.some((error) => error.includes("severity must be warning")),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("PostgresExporterDown: fires when exporterUp === 0 and clears at 1", () => {
  const simulation = SIMULATION_DEFINITIONS.PostgresExporterDown;
  assert.equal(simulation.evaluate({ exporterUp: 0 }), true);
  assert.equal(simulation.evaluate({ exporterUp: 1 }), false);
});

test("SIMULATION_DEFINITIONS: evaluates each alert condition faithfully on breach and normal samples", () => {
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

test("isValidDuration: accurately accepts valid Prometheus durations and rejects invalid ones", () => {
  assert.equal(isValidDuration("30s"), true);
  assert.equal(isValidDuration("1m"), true);
  assert.equal(isValidDuration("5m"), true);
  assert.equal(isValidDuration("2h"), true);
  assert.equal(isValidDuration("1d"), true);
  assert.equal(isValidDuration("500ms"), true);

  assert.equal(isValidDuration("5"), false);
  assert.equal(isValidDuration("5minutes"), false);
  assert.equal(isValidDuration(""), false);
  assert.equal(isValidDuration(null), false);
  assert.equal(isValidDuration(undefined), false);
  assert.equal(isValidDuration(100), false);
});

test("verifyAlertRules: rejects an unscoped outbox selector that would duplicate alert instances", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-alert-test-"));
  try {
    const alertsObj = yaml.load(fs.readFileSync(ALERTS_FILE, "utf8"));
    alertsObj.groups[0].rules.find(
      (item) => item.alert === "OutboxDeliveryLag",
    ).expr = "acres_outbox_pending_events > 50";
    const tmpAlertsPath = path.join(tmpDir, "alerts.yml");
    fs.writeFileSync(tmpAlertsPath, yaml.dump(alertsObj));
    const result = verifyAlertRules({
      alertsPath: tmpAlertsPath,
      promConfigPath: PROM_FILE,
    });
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((error) =>
        error.includes('every metric selector must use job="acres-api"'),
      ),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("KNOWN_METRIC_IDENTIFIERS: includes database pool acquisition and query execution latency histograms", () => {
  assert.ok(
    KNOWN_METRIC_IDENTIFIERS.includes(
      "acres_postgres_pool_acquisition_duration_seconds",
    ),
  );
  assert.ok(
    KNOWN_METRIC_IDENTIFIERS.includes("acres_database_query_duration_seconds"),
  );
});

const { spawnSync, spawn } = require("node:child_process");
const SCRIPT = path.join(__dirname, "verify-alert-rules.js");
const CHILD_ENV = { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" };
const CANARY = "private-alert-secret-canary";
function sources(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acres-alert-contract-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const alertsPath = path.join(dir, "alerts spaced.yml");
  const promConfigPath = path.join(dir, "prom spaced.yml");
  const alerts = yaml.load(fs.readFileSync(ALERTS_FILE, "utf8"));
  const prom = yaml.load(fs.readFileSync(PROM_FILE, "utf8"));
  const save = () => {
    fs.writeFileSync(alertsPath, yaml.dump(alerts));
    fs.writeFileSync(promConfigPath, yaml.dump(prom));
  };
  save();
  return {
    dir,
    alertsPath,
    promConfigPath,
    alerts,
    prom,
    save,
    options: { alertsPath, promConfigPath },
  };
}
function cli(args, cwd = ROOT_DIR, code) {
  const r = spawnSync(
    process.execPath,
    code ? ["-e", code, ...args] : [SCRIPT, ...args],
    {
      cwd,
      env: CHILD_ENV,
      encoding: "utf8",
      timeout: 10000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  assert.equal(r.error, undefined);
  assert.doesNotMatch(
    r.stdout + r.stderr,
    /private-alert-secret-canary|YAMLException|Error:|at Object\./,
  );
  return r;
}
function assertFailure(r) {
  assert.equal(r.valid, false);
  assert.ok(r.errors.length > 0);
  assert.equal(r.requiredRulesCount, 11);
  assert.ok(Number.isSafeInteger(r.totalRulesCount));
  assert.doesNotMatch(JSON.stringify(r), /private-alert-secret-canary/);
}

test("actual default JSON drains completely and preserves 25 consumer checks from foreign cwd", (t) => {
  const f = sources(t),
    r = cli(["--json"], f.dir);
  assert.equal(r.status, 0);
  assert.equal(r.stderr, "");
  const report = JSON.parse(r.stdout);
  assert.equal(report.valid, true);
  assert.equal(report.checks.length, 25);
  assert.equal(report.totalRulesCount, 11);
  assert.equal(report.requiredRulesCount, 11);
  assert.deepEqual(
    report.alerts.map((a) => a.alert),
    REQUIRED_ALERTS,
  );
  assert.deepEqual(
    report.simulations.map((a) => a.alert),
    REQUIRED_ALERTS,
  );
});

test("help and import perform no source, write, network, or subprocess work", () => {
  for (const mode of ["import", "--help", "-h"]) {
    const code = `const fs=require('node:fs'),yaml=require('js-yaml');
      const Module=require('node:module');
      // Preload dependencies before refusing operational reads; module loading is allowed.
      fs.statSync=fs.openSync=fs.writeFileSync=yaml.load=()=>{throw Error('${CANARY}');};
      for(const name of ['node:http','node:https','node:net','node:dns','node:child_process']) {
        const m=require(name); for(const k of ['request','get','connect','lookup','spawn','spawnSync','exec']) if(k in m) m[k]=()=>{throw Error('${CANARY}');};
      }
      ${mode === "import" ? `require(${JSON.stringify(SCRIPT)});` : `process.argv=['node',${JSON.stringify(SCRIPT)},${JSON.stringify(mode)}];require(${JSON.stringify(SCRIPT)});`}`;
    const r = cli(
      [],
      ROOT_DIR,
      mode === "import"
        ? code
        : code.replace(
            `require(${JSON.stringify(SCRIPT)});`,
            `Module._load(${JSON.stringify(SCRIPT)},null,true);`,
          ),
    );
    assert.equal(r.status, 0);
    assert.equal(
      mode === "import" ? r.stdout : r.stdout.startsWith("Usage:"),
      mode === "import" ? "" : true,
    );
  }
});

for (const args of [
  ["--unknown"],
  ["position"],
  ["--json=x"],
  ["--json", "--json"],
  ["--help", "--json"],
  ["-h", "--prom-file=x"],
  ["--alerts-file"],
  ["--alerts-file="],
  ["--prom-file", "  "],
  ["--alerts-file", "--json"],
  ["--prom-file=x", "--prom-file=y"],
  ["--output=x"],
  ["--prom-file", CANARY + "\n"],
  ["--alerts-file=\t"],
]) {
  test(`strict CLI rejects argument category ${JSON.stringify(args)}`, () => {
    const r = cli(args);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "Alert verification invocation or output failed\n");
  });
}

test("separate, attached, relative, spaced and attached dash-leading paths remain literal", (t) => {
  const f = sources(t);
  fs.copyFileSync(f.alertsPath, path.join(f.dir, "-alerts.yml"));
  for (const args of [
    ["--alerts-file", "alerts spaced.yml", "--prom-file", "prom spaced.yml"],
    ["--alerts-file=alerts spaced.yml", "--prom-file=prom spaced.yml"],
    ["--alerts-file=-alerts.yml", "--prom-file=prom spaced.yml"],
  ])
    assert.equal(cli(["--json", ...args], f.dir).status, 0);
});

test("invalid direct options reject before source work", (t) => {
  t.mock.method(fs, "statSync", () => {
    throw Error(CANARY);
  });
  for (const options of [
    null,
    false,
    0,
    "",
    [],
    new Date(),
    { alertsPath: null },
    { alertsPath: false },
    { alertsPath: "" },
    { alertsPath: " " },
    { promConfigPath: 3 },
    { promConfigPath: "x\0" },
    { unknown: "x" },
  ])
    assert.deepEqual(verifyAlertRules(options), {
      valid: false,
      errors: ["Invalid verifier options"],
      checks: [],
      alerts: [],
      simulations: [],
      totalRulesCount: 0,
      requiredRulesCount: 11,
    });
  assert.equal(fs.statSync.mock.callCount(), 0);
});

const badShapes = [
  ["alerts root null", (f) => fs.writeFileSync(f.alertsPath, "null")],
  ["alerts root scalar", (f) => fs.writeFileSync(f.alertsPath, "42")],
  ["alerts root date", (f) => fs.writeFileSync(f.alertsPath, "2026-10-07")],
  [
    "groups scalar",
    (f) => {
      f.alerts.groups = "bad";
      f.save();
    },
  ],
  [
    "group null",
    (f) => {
      f.alerts.groups = [null];
      f.save();
    },
  ],
  [
    "rules scalar",
    (f) => {
      f.alerts.groups[0].rules = 3;
      f.save();
    },
  ],
  [
    "rule null",
    (f) => {
      f.alerts.groups[0].rules = [null];
      f.save();
    },
  ],
  [
    "alert name object",
    (f) => {
      f.alerts.groups[0].rules[0].alert = { private: CANARY };
      f.save();
    },
  ],
  ["prom root null", (f) => fs.writeFileSync(f.promConfigPath, "null")],
  ["prom root scalar", (f) => fs.writeFileSync(f.promConfigPath, "42")],
  [
    "scrapes scalar",
    (f) => {
      f.prom.scrape_configs = CANARY;
      f.save();
    },
  ],
  [
    "scrape null",
    (f) => {
      f.prom.scrape_configs = [null];
      f.save();
    },
  ],
  [
    "scrape job object",
    (f) => {
      f.prom.scrape_configs[0].job_name = { private: CANARY };
      f.save();
    },
  ],
  [
    "scrape metrics array",
    (f) => {
      f.prom.scrape_configs[0].metrics_path = [];
      f.save();
    },
  ],
  [
    "multi-document",
    (f) => fs.writeFileSync(f.alertsPath, "---\na: 1\n---\nb: 2"),
  ],
  [
    "duplicate keys",
    (f) => fs.writeFileSync(f.alertsPath, "groups: []\ngroups: []"),
  ],
  [
    "malformed private snippet",
    (f) => fs.writeFileSync(f.alertsPath, `${CANARY}: [`),
  ],
  [
    "depth limit",
    (f) => fs.writeFileSync(f.alertsPath, "[".repeat(101) + "]".repeat(101)),
  ],
  [
    "merge limit",
    (f) =>
      fs.writeFileSync(
        f.alertsPath,
        "base: &base {a: 1}\nmerges: [" +
          Array(10001).fill("{<<: *base}").join(",") +
          "]",
      ),
  ],
];
for (const [name, mutate] of badShapes)
  test(`controlled source failure: ${name}`, (t) => {
    const f = sources(t);
    mutate(f);
    const report = verifyAlertRules(f.options);
    assertFailure(report);
    if (name === "depth limit" || name === "merge limit")
      assert.deepEqual(report.errors, ["Alerts source could not be loaded"]);
    const r = cli([
      "--json",
      "--alerts-file",
      f.alertsPath,
      "--prom-file",
      f.promConfigPath,
    ]);
    assert.equal(r.status, 1);
    assertFailure(JSON.parse(r.stdout));
    assert.equal(r.stderr, "");
  });

for (const field of ["expr", "for", "labels", "annotations"])
  for (const value of [null, 42, [], { private: CANARY }, CANARY])
    test(`invalid required ${field} with ${JSON.stringify(value)}`, (t) => {
      const f = sources(t);
      f.alerts.groups[0].rules[0][field] = value;
      f.save();
      const r = verifyAlertRules(f.options);
      assertFailure(r);
      assert.equal(r.alerts[0].valid, false);
      assert.equal(r.alerts[0].expr, undefined);
      assert.equal(r.alerts[0].summary, undefined);
      assert.equal(
        cli(["--alerts-file", f.alertsPath, "--prom-file", f.promConfigPath])
          .status,
        1,
      );
    });

for (const field of ["summary", "description"])
  test(`non-string annotation ${field} is controlled`, (t) => {
    const f = sources(t);
    f.alerts.groups[0].rules[0].annotations[field] = { private: CANARY };
    f.save();
    assertFailure(verifyAlertRules(f.options));
  });
for (const job of ["acres-api", "acres-worker"])
  test(`missing ${job} fails both check and report`, (t) => {
    const f = sources(t);
    f.prom.scrape_configs = f.prom.scrape_configs.filter(
      (sc) => sc.job_name !== job,
    );
    f.save();
    const r = verifyAlertRules(f.options);
    assertFailure(r);
    assert.ok(r.checks.some((c) => !c.passed));
  });
for (const value of [undefined, null, [], 42, [null], [CANARY + "\n"]])
  test(`invalid rule_files ${JSON.stringify(value)}`, (t) => {
    const f = sources(t);
    f.prom.rule_files = value;
    f.save();
    assertFailure(verifyAlertRules(f.options));
  });
for (const across of [false, true])
  test(`duplicate required identity across groups: ${across}`, (t) => {
    const f = sources(t),
      rule = f.alerts.groups[0].rules[0];
    if (across) f.alerts.groups.push({ name: "extra", rules: [rule] });
    else f.alerts.groups[0].rules.push(rule);
    f.save();
    const r = verifyAlertRules(f.options);
    assertFailure(r);
    assert.equal(r.totalRulesCount, 12);
    assert.ok(
      r.errors.some((e) => e.includes("Duplicate required alert identity")),
    );
  });
test("extra alerts, recording rules and cyclic unknown aliases are finite and excluded", (t) => {
  const f = sources(t);
  f.alerts.groups[0].rules.push(
    { record: "ordinary", expr: "up" },
    { alert: "OrdinaryAlert", expr: "up" },
  );
  f.alerts.unknown = { private: CANARY };
  f.save();
  fs.appendFileSync(f.alertsPath, "cycle: &cycle [*cycle]\n");
  const r = verifyAlertRules(f.options);
  assert.equal(r.valid, true);
  assert.equal(r.totalRulesCount, 13);
  assert.equal(r.checks.length, 25);
  assert.doesNotMatch(
    JSON.stringify(r),
    /private-alert-secret-canary|OrdinaryAlert|cycle/,
  );
});

test("missing private paths, directories, devices and oversized files fail without reflection", (t) => {
  const f = sources(t),
    privatePath = path.join(f.dir, CANARY);
  fs.writeFileSync(privatePath, "x".repeat(1024 * 1024 + 1));
  for (const alertsPath of [
    privatePath,
    f.dir,
    "/dev/null",
    path.join(f.dir, CANARY + "-missing"),
  ])
    assertFailure(verifyAlertRules({ ...f.options, alertsPath }));
});
test("FIFO rejected without opening or blocking", (t) => {
  const f = sources(t),
    fifo = path.join(f.dir, "fifo");
  const r = spawnSync("/usr/bin/mkfifo", [fifo], {
    env: CHILD_ENV,
    timeout: 1000,
  });
  assert.equal(r.status, 0);
  assert.equal(cli(["--json", "--alerts-file", fifo]).status, 1);
});
test("regular symlinks remain supported", (t) => {
  const f = sources(t),
    link = path.join(f.dir, "link");
  fs.symlinkSync(f.alertsPath, link);
  assert.equal(
    verifyAlertRules({ ...f.options, alertsPath: link }).valid,
    true,
  );
});
for (const method of [
  "statSync",
  "openSync",
  "fstatSync",
  "readSync",
  "closeSync",
])
  test(`injected ${method} failure closes owned descriptors safely`, (t) => {
    const f = sources(t),
      original = fs.closeSync;
    let closed = 0;
    if (method !== "closeSync")
      t.mock.method(fs, "closeSync", (fd) => {
        closed++;
        return original(fd);
      });
    let first = true;
    t.mock.method(fs, method, (...args) => {
      if (method === "closeSync" && !first) return original(...args);
      first = false;
      throw Error(CANARY);
    });
    assertFailure(verifyAlertRules(f.options));
    if (["fstatSync", "readSync"].includes(method)) assert.equal(closed, 1);
  });
test("injected parser exception closes source before returning safe failure", (t) => {
  const f = sources(t);
  t.mock.method(yaml, "load", () => {
    throw Error(CANARY);
  });
  const close = t.mock.method(fs, "closeSync");
  assertFailure(verifyAlertRules(f.options));
  assert.equal(close.mock.callCount(), 1);
});
test("source growth after fstat remains byte bounded and closes owned fd", (t) => {
  const f = sources(t),
    original = fs.fstatSync;
  let grown = false;
  t.mock.method(fs, "fstatSync", (fd) => {
    const stat = original(fd);
    if (!grown) {
      grown = true;
      fs.appendFileSync(f.alertsPath, "x".repeat(1024 * 1024));
    }
    return stat;
  });
  const close = t.mock.method(fs, "closeSync");
  assertFailure(verifyAlertRules(f.options));
  assert.equal(close.mock.callCount(), 1);
});

test("unexpected serialization and synchronous/async output faults exit safely without success fallback", () => {
  for (const hook of [
    `JSON.stringify=()=>{throw Error('${CANARY}');};`,
    `process.stdout.write=()=>{throw Error('${CANARY}');};`,
    `process.stdout.write=(text,cb)=>{process.nextTick(()=>{cb(Error('${CANARY}'));process.stdout.emit('error',Error('${CANARY}'));});return false;};`,
  ]) {
    const r = cli(
      [],
      ROOT_DIR,
      `${hook}process.argv=['node',${JSON.stringify(SCRIPT)},'--json'];require('node:module')._load(${JSON.stringify(SCRIPT)},null,true);`,
    );
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "");
    assert.equal(r.stderr, "Alert verification invocation or output failed\n");
  }
});

test("actual broken stdout pipe exits nonzero without raw stack", async (t) => {
  const f = sources(t);
  f.alerts.groups[0].rules[0].annotations.summary = "s".repeat(100000);
  f.save();
  const child = spawn(
    process.execPath,
    [
      SCRIPT,
      "--json",
      "--alerts-file",
      f.alertsPath,
      "--prom-file",
      f.promConfigPath,
    ],
    { env: CHILD_ENV, stdio: ["ignore", "pipe", "pipe"] },
  );
  t.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });
  child.stdout.destroy();
  let stderr = "";
  child.stderr.on("data", (b) => (stderr += b));
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  const [status, signal] = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (...r) => resolve(r));
  }).finally(() => clearTimeout(timer));
  assert.equal(signal, null);
  assert.equal(status, 1);
  assert.equal(stderr, "Alert verification invocation or output failed\n");
});

test("copied installation resolves explicit YAML dependency and defaults without caller sources", (t) => {
  const f = sources(t),
    ops = path.join(f.dir, "scripts/ops"),
    infra = path.join(f.dir, "infra/prometheus");
  fs.mkdirSync(ops, { recursive: true });
  fs.mkdirSync(infra, { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(ops, "verify-alert-rules.js"));
  fs.copyFileSync(ALERTS_FILE, path.join(infra, "alerts.yml"));
  fs.copyFileSync(PROM_FILE, path.join(infra, "prometheus.yml"));
  fs.mkdirSync(path.join(f.dir, "node_modules"));
  fs.symlinkSync(
    path.dirname(require.resolve("js-yaml/package.json")),
    path.join(f.dir, "node_modules/js-yaml"),
  );
  const r = spawnSync(
    process.execPath,
    [path.join(ops, "verify-alert-rules.js"), "--json"],
    { cwd: os.tmpdir(), env: CHILD_ENV, encoding: "utf8", timeout: 10000 },
  );
  assert.equal(r.error, undefined);
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).valid, true);
});
test("source changed to non-regular after preflight is rejected and descriptor closed", (t) => {
  const f = sources(t);
  t.mock.method(fs, "fstatSync", () => ({ isFile: () => false, size: 0 }));
  const close = t.mock.method(fs, "closeSync");
  assertFailure(verifyAlertRules(f.options));
  assert.equal(close.mock.callCount(), 1);
});
test("complete large valid JSON is never truncated", (t) => {
  const f = sources(t);
  f.alerts.groups[0].rules[0].annotations.summary = "s".repeat(100000);
  f.save();
  const r = cli([
    "--json",
    "--alerts-file",
    f.alertsPath,
    "--prom-file",
    f.promConfigPath,
  ]);
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).alerts[0].summary.length, 100000);
});
test("unexpected human formatting fault is controlled without a fallback", () => {
  const r = cli(
    [],
    ROOT_DIR,
    `Array.prototype.filter=()=>{throw Error('${CANARY}');};
    process.argv=['node',${JSON.stringify(SCRIPT)}];require('node:module')._load(${JSON.stringify(SCRIPT)},null,true);`,
  );
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.equal(r.stderr, "Alert verification invocation or output failed\n");
});
test("aliased collection expansion is bounded before rule traversal", (t) => {
  const f = sources(t);
  const rule = f.alerts.groups[0].rules[0];
  f.alerts.groups = Array(101).fill({ rules: Array(100).fill(rule) });
  f.save();
  assertFailure(verifyAlertRules(f.options));
});

test("large unclosed selectors fail with bounded actual CLI evaluation", (t) => {
  const f = sources(t);
  f.alerts.groups[0].rules[0].expr = "up{".repeat(240000) + CANARY;
  f.save();
  assert.ok(fs.statSync(f.alertsPath).size < 1024 * 1024);
  const r = cli([
    "--json",
    "--alerts-file",
    f.alertsPath,
    "--prom-file",
    f.promConfigPath,
  ]);
  assert.equal(r.status, 1);
  const report = JSON.parse(r.stdout);
  assertFailure(report);
  assert.ok(
    report.errors.some((e) =>
      e.includes('every metric selector must use job="acres-api"'),
    ),
  );
});
test("selector scanning preserves legacy nested, absent, and multi-selector policy", (t) => {
  const f = sources(t);
  const expressions = [
    'up{job="acres-api"}',
    "up",
    "up{",
    "up{}",
    'up{up{job="acres-api"}}',
    'up{job="acres-api"} + up{job="acres-worker"}',
    'up{job="acres-api"} + pg_up{job="acres-api"}',
    'startup{job="acres-api"}',
    'upstream{job="acres-api"}',
    'up} + up{job="acres-api"}',
    'up{job="acres-api"} + acres_http_requests_total{job="acres-api"}',
  ];
  for (const expr of expressions) {
    const legacy = [
      ...expr.matchAll(/\b(?:up|pg_up|acres_[a-z0-9_]+)(?:\{([^}]*)\})?/g),
    ].some((match) => !match[1]?.includes('job="acres-api"'));
    f.alerts.groups[0].rules[0].expr = expr;
    f.save();
    const report = verifyAlertRules(f.options);
    assert.equal(
      report.errors.some((e) =>
        e.includes("AcresApiDown: every metric selector"),
      ),
      legacy,
      expr,
    );
  }
});
