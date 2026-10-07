#!/usr/bin/env node

/**
 * scripts/ops/verify-alert-rules.js
 *
 * Prometheus Alert Rule Verification & Synthetic Simulation Engine (TM-16, TM-20).
 *
 * Statically parses and validates infra/prometheus/alerts.yml and infra/prometheus/prometheus.yml:
 * 1. Asserts presence of all 11 required operational golden signals and security threat alerts:
 *    - AcresApiDown (Availability: up{job="acres-api"} == 0)
 *    - AcresWorkerDown (Availability: up{job="acres-worker"} == 0)
 *    - PostgresDown (Availability: pg_up{job="acres-postgres"} == 0)
 *    - PostgresExporterDown (Telemetry: up{job="acres-postgres"} == 0)
 *    - HighHttp5xxRate (Errors: > 5% 5xx over 5m)
 *    - P95LatencyThresholdExceeded (Latency: p95 latency > 500ms over 5m)
 *    - High429Rate (Security: HTTP 429 rate > 10% over 5m)
 *    - QueueDeadLettersDetected (Queue Health: failed jobs > 0)
 *    - OutboxDeliveryLag (Outbox Health: > 50 pending events for > 10m)
 *    - HighHttpConcurrency (API load: active HTTP requests > 40)
 *    - DatabaseConnectionPoolSaturation (Database: requests waiting for pool connection > 0)
 * 2. Checks PromQL identifiers/selectors heuristically, durations, labels and annotations.
 * 3. Evaluates fixed JavaScript predicates on synthetic samples under breach conditions
 *    and clears cleanly under normal traffic.
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const DEFAULT_ALERTS_PATH = path.resolve(
  __dirname,
  "../../infra/prometheus/alerts.yml",
);
const DEFAULT_PROM_CONFIG_PATH = path.resolve(
  __dirname,
  "../../infra/prometheus/prometheus.yml",
);

const REQUIRED_ALERTS = [
  "AcresApiDown",
  "AcresWorkerDown",
  "PostgresDown",
  "PostgresExporterDown",
  "HighHttp5xxRate",
  "P95LatencyThresholdExceeded",
  "High429Rate",
  "QueueDeadLettersDetected",
  "OutboxDeliveryLag",
  "HighHttpConcurrency",
  "DatabaseConnectionPoolSaturation",
];

const KNOWN_METRIC_IDENTIFIERS = [
  "up",
  "pg_up",
  "acres_http_requests_total",
  "acres_http_429_responses_total",
  "acres_http_request_duration_seconds_bucket",
  "acres_http_active_requests",
  "acres_queue_jobs_total",
  "acres_outbox_pending_events",
  "acres_database_query_duration_seconds",
  "acres_postgres_pool_acquisition_duration_seconds",
  "acres_postgres_pool_requests_waiting",
];

/**
 * Evaluates simulation conditions for each required alert.
 */
const SIMULATION_DEFINITIONS = {
  AcresApiDown: {
    evaluate: (data) => data.up === 0,
    firingSample: { up: 0 },
    clearedSample: { up: 1 },
    thresholdDescription: 'up{job="acres-api"} == 0',
  },
  AcresWorkerDown: {
    evaluate: (data) => data.workerUp === 0,
    firingSample: { workerUp: 0 },
    clearedSample: { workerUp: 1 },
    thresholdDescription: 'up{job="acres-worker"} == 0',
  },
  PostgresDown: {
    evaluate: (data) => data.pgUp === 0,
    firingSample: { pgUp: 0 },
    clearedSample: { pgUp: 1 },
    thresholdDescription: 'pg_up{job="acres-postgres"} == 0',
  },
  PostgresExporterDown: {
    evaluate: (data) => data.exporterUp === 0,
    firingSample: { exporterUp: 0 },
    clearedSample: { exporterUp: 1 },
    thresholdDescription: 'up{job="acres-postgres"} == 0',
  },
  HighHttp5xxRate: {
    evaluate: (data) => {
      const total = Math.max(data.totalRequests || 0, 0.001);
      const rate5xx = data.requests5xx || 0;
      return (rate5xx / total) * 100 > 5;
    },
    firingSample: { totalRequests: 100, requests5xx: 12 },
    clearedSample: { totalRequests: 100, requests5xx: 1 },
    thresholdDescription: "5xx rate > 5% of total requests",
  },
  P95LatencyThresholdExceeded: {
    evaluate: (data) => (data.p95LatencySeconds || 0) > 0.5,
    firingSample: { p95LatencySeconds: 0.72 },
    clearedSample: { p95LatencySeconds: 0.12 },
    thresholdDescription: "p95 latency > 0.5s (500ms)",
  },
  High429Rate: {
    evaluate: (data) => {
      const total = Math.max(data.totalRequests || 0, 0.001);
      const rate429 = data.requests429 || 0;
      return (rate429 / total) * 100 > 10;
    },
    firingSample: { totalRequests: 100, requests429: 24 },
    clearedSample: { totalRequests: 100, requests429: 2 },
    thresholdDescription: "429 rate > 10% of total requests",
  },
  QueueDeadLettersDetected: {
    evaluate: (data) => (data.failedJobs || 0) > 0,
    firingSample: { failedJobs: 3 },
    clearedSample: { failedJobs: 0 },
    thresholdDescription: "failed worker jobs > 0",
  },
  OutboxDeliveryLag: {
    evaluate: (data) => (data.pendingEvents || 0) > 50,
    firingSample: { pendingEvents: 85 },
    clearedSample: { pendingEvents: 10 },
    thresholdDescription: "outbox pending events > 50",
  },
  HighHttpConcurrency: {
    evaluate: (data) => (data.activeRequests || 0) > 40,
    firingSample: { activeRequests: 46 },
    clearedSample: { activeRequests: 40 },
    thresholdDescription: "active API HTTP requests > 40",
  },
  DatabaseConnectionPoolSaturation: {
    evaluate: (data) => (data.postgresPoolRequestsWaiting || 0) > 0,
    firingSample: { postgresPoolRequestsWaiting: 3 },
    clearedSample: { postgresPoolRequestsWaiting: 0 },
    thresholdDescription:
      'acres_postgres_pool_requests_waiting{job="acres-api"} > 0',
  },
};

/**
 * Validates a duration string like '1m', '5m', '30s', '1h'.
 */
function isValidDuration(dur) {
  return typeof dur === "string" && /^\d+(?:ms|[smhdwy])$/.test(dur.trim());
}

// Engineering resource limits, independent of production SLO policy.
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_COLLECTION_ITEMS = 10000;
const isRecord = (value) =>
  value !== null &&
  typeof value === "object" &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);
const isSourcePath = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  !/[\x00-\x1f\x7f-\x9f]/.test(value);

function failedReport(message) {
  return {
    valid: false,
    errors: [message],
    checks: [],
    alerts: [],
    simulations: [],
    totalRulesCount: 0,
    requiredRulesCount: REQUIRED_ALERTS.length,
  };
}

function loadSource(sourcePath) {
  let fd;
  try {
    // Stat before opening rejects ordinary devices/FIFOs. Nonblocking open plus
    // descriptor stat also guards a regular path replaced between these calls.
    if (!fs.statSync(sourcePath).isFile()) throw new Error("source");
    fd = fs.openSync(
      sourcePath,
      fs.constants.O_RDONLY | fs.constants.O_NONBLOCK,
    );
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES)
      throw new Error("source");
    const buffer = Buffer.alloc(MAX_SOURCE_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = fs.readSync(fd, buffer, size, buffer.length - size, null);
      if (count === 0) break;
      size += count;
    }
    if (size > MAX_SOURCE_BYTES) throw new Error("source");
    return yaml.load(buffer.subarray(0, size).toString("utf8"), {
      maxDepth: 100,
      maxTotalMergeKeys: 10000,
    });
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // Retry only the descriptor owned here; a persistent failure still fails
        // verification and may require process shutdown to release it.
        try {
          fs.closeSync(fd);
        } catch {
          /* preserve controlled failure */
        }
        throw new Error("source");
      }
    }
  }
}

// Preserve the existing selector heuristic without repeatedly rescanning
// unclosed braces. Matched selectors consume disjoint spans of the expression.
function selectorsUseJob(expr, expectedJob) {
  const metrics = /\b(?:up|pg_up|acres_[a-z0-9_]+)/g;
  let close = expr.indexOf("}");
  let match;
  while ((match = metrics.exec(expr)) !== null) {
    const start = metrics.lastIndex;
    if (expr[start] !== "{") return false;
    if (close !== -1 && close < start) close = expr.indexOf("}", start);
    if (
      close === -1 ||
      !expr.slice(start + 1, close).includes(`job="${expectedJob}"`)
    )
      return false;
    metrics.lastIndex = close + 1;
  }
  return true;
}

/** Statically checks source shapes and required-rule heuristics. */
function verifyAlertRules(options = {}) {
  if (
    !isRecord(options) ||
    Object.keys(options).some(
      (key) => !["alertsPath", "promConfigPath"].includes(key),
    ) ||
    ["alertsPath", "promConfigPath"].some(
      (key) => options[key] !== undefined && !isSourcePath(options[key]),
    )
  ) {
    return failedReport("Invalid verifier options");
  }
  const alertsPath = options.alertsPath ?? DEFAULT_ALERTS_PATH;
  const promConfigPath = options.promConfigPath ?? DEFAULT_PROM_CONFIG_PATH;
  const errors = [];
  const checks = [];
  let alertsYaml, promYaml;
  try {
    alertsYaml = loadSource(alertsPath);
  } catch {
    return failedReport("Alerts source could not be loaded");
  }
  try {
    promYaml = loadSource(promConfigPath);
  } catch {
    return failedReport("Prometheus source could not be loaded");
  }

  if (
    !isRecord(alertsYaml) ||
    !Array.isArray(alertsYaml.groups) ||
    alertsYaml.groups.length > MAX_COLLECTION_ITEMS ||
    alertsYaml.groups.some((g) => !isRecord(g) || !Array.isArray(g.rules)) ||
    alertsYaml.groups.reduce((count, g) => count + g.rules.length, 0) >
      MAX_COLLECTION_ITEMS
  ) {
    return failedReport("Invalid alert source structure");
  }
  // Bound expansion before flattening or traversing aliased rule collections.
  const allRules = alertsYaml.groups.flatMap((g) => g.rules);
  if (
    allRules.some(
      (r) =>
        !isRecord(r) ||
        (r.alert !== undefined &&
          (typeof r.alert !== "string" || !r.alert.trim())) ||
        (r.record !== undefined &&
          (typeof r.record !== "string" || !r.record.trim())),
    )
  ) {
    return failedReport("Invalid alert source structure");
  }
  if (
    !isRecord(promYaml) ||
    !Array.isArray(promYaml.scrape_configs) ||
    promYaml.scrape_configs.length > MAX_COLLECTION_ITEMS ||
    promYaml.scrape_configs.some(
      (sc) =>
        !isRecord(sc) ||
        typeof sc.job_name !== "string" ||
        !sc.job_name.trim() ||
        (sc.metrics_path !== undefined && typeof sc.metrics_path !== "string"),
    )
  ) {
    return failedReport("Invalid Prometheus source structure");
  }
  const hasRuleFiles =
    Array.isArray(promYaml.rule_files) &&
    promYaml.rule_files.length > 0 &&
    promYaml.rule_files.length <= MAX_COLLECTION_ITEMS &&
    promYaml.rule_files.every(isSourcePath);
  checks.push({
    id: "prom-rule-files-configured",
    passed: hasRuleFiles,
    message: hasRuleFiles
      ? "Prometheus rule_files configured"
      : "Prometheus rule_files missing or invalid",
  });
  if (!hasRuleFiles)
    errors.push("Prometheus configuration missing or invalid rule_files");
  for (const [job, id] of [
    ["acres-api", "api"],
    ["acres-worker", "worker"],
  ]) {
    const passed = promYaml.scrape_configs.some(
      (sc) => sc.job_name === job && sc.metrics_path === "/metrics",
    );
    const message = passed
      ? `Prometheus ${job} /metrics scrape job configured`
      : `Prometheus missing ${job} /metrics scrape target`;
    checks.push({ id: `prom-${id}-scrape-configured`, passed, message });
    if (!passed) errors.push(message);
  }
  const ruleMap = new Map();
  const duplicates = new Set();
  for (const rule of allRules) {
    if (REQUIRED_ALERTS.includes(rule.alert)) {
      if (ruleMap.has(rule.alert)) duplicates.add(rule.alert);
      else ruleMap.set(rule.alert, rule);
    }
  }

  const alertEvaluations = [];

  for (const requiredAlert of REQUIRED_ALERTS) {
    const rule = ruleMap.get(requiredAlert);
    if (!rule) {
      checks.push({
        id: `alert-exists-${requiredAlert}`,
        passed: false,
        message: `Missing required alert rule: ${requiredAlert}`,
      });
      errors.push(`Missing required alert rule: ${requiredAlert}`);
      continue;
    }

    const ruleErrors = [];
    if (duplicates.has(requiredAlert))
      ruleErrors.push("Duplicate required alert identity");

    // PromQL expr
    if (
      !rule.expr ||
      typeof rule.expr !== "string" ||
      rule.expr.trim() === ""
    ) {
      ruleErrors.push("Missing or empty expr");
    }

    // Duration for
    if (!isValidDuration(rule.for)) {
      ruleErrors.push("Invalid 'for' duration");
    }

    // Severity
    const severity = isRecord(rule.labels) ? rule.labels.severity : undefined;
    if (severity !== "critical" && severity !== "warning") {
      ruleErrors.push("Invalid severity (must be critical or warning)");
    }

    // Annotations
    if (
      !isRecord(rule.annotations) ||
      typeof rule.annotations.summary !== "string" ||
      !rule.annotations.summary.trim()
    ) {
      ruleErrors.push("Missing annotations.summary");
    }
    if (
      !isRecord(rule.annotations) ||
      typeof rule.annotations.description !== "string" ||
      !rule.annotations.description.trim()
    ) {
      ruleErrors.push("Missing annotations.description");
    }

    // PromQL identifier check
    const referencesKnownMetric = KNOWN_METRIC_IDENTIFIERS.some(
      (ident) => typeof rule.expr === "string" && rule.expr.includes(ident),
    );
    if (!referencesKnownMetric) {
      ruleErrors.push("expr does not reference any known Acres metrics");
    }

    if (requiredAlert === "High429Rate" && typeof rule.expr === "string") {
      const normalized = rule.expr.replace(/\s+/g, "");
      const expected =
        '(sum(rate(acres_http_429_responses_total{job="acres-api"}[5m]))/clamp_min(sum(rate(acres_http_requests_total{job="acres-api"}[5m])),0.001))*100>10';
      if (normalized !== expected) {
        ruleErrors.push(
          "expr must use the dedicated 429 counter over total requests at the configured 5m and 10% threshold",
        );
      }
    }

    if (requiredAlert === "HighHttpConcurrency") {
      if (
        typeof rule.expr !== "string" ||
        rule.expr.trim() !== 'acres_http_active_requests{job="acres-api"} > 40'
      ) {
        ruleErrors.push(
          'expr must be acres_http_active_requests{job="acres-api"} > 40',
        );
      }
      if (rule.for !== "2m") {
        ruleErrors.push("for must be 2m");
      }
      if (severity !== "warning") {
        ruleErrors.push("severity must be warning");
      }
    }

    if (requiredAlert === "DatabaseConnectionPoolSaturation") {
      if (
        typeof rule.expr !== "string" ||
        rule.expr.trim() !==
          'acres_postgres_pool_requests_waiting{job="acres-api"} > 0'
      ) {
        ruleErrors.push(
          'expr must be acres_postgres_pool_requests_waiting{job="acres-api"} > 0',
        );
      }
      if (rule.for !== "1m") {
        ruleErrors.push("for must be 1m");
      }
      if (severity !== "warning") {
        ruleErrors.push("severity must be warning");
      }
    }

    if (requiredAlert === "AcresWorkerDown") {
      if (
        typeof rule.expr !== "string" ||
        rule.expr.trim() !== 'up{job="acres-worker"} == 0'
      ) {
        ruleErrors.push('expr must be up{job="acres-worker"} == 0');
      }
      if (rule.for !== "1m") {
        ruleErrors.push("for must be 1m");
      }
      if (severity !== "critical") {
        ruleErrors.push("severity must be critical");
      }
    }

    if (requiredAlert === "PostgresDown") {
      if (
        typeof rule.expr !== "string" ||
        rule.expr.trim() !== 'pg_up{job="acres-postgres"} == 0'
      ) {
        ruleErrors.push('expr must be pg_up{job="acres-postgres"} == 0');
      }
      if (rule.for !== "1m") {
        ruleErrors.push("for must be 1m");
      }
      if (severity !== "critical") {
        ruleErrors.push("severity must be critical");
      }
    }

    if (requiredAlert === "PostgresExporterDown") {
      if (
        typeof rule.expr !== "string" ||
        rule.expr.trim() !== 'up{job="acres-postgres"} == 0'
      ) {
        ruleErrors.push('expr must be up{job="acres-postgres"} == 0');
      }
      if (rule.for !== "1m") {
        ruleErrors.push("for must be 1m");
      }
      if (severity !== "warning") {
        ruleErrors.push("severity must be warning");
      }
    }

    const expectedJob =
      requiredAlert === "PostgresDown" ||
      requiredAlert === "PostgresExporterDown"
        ? "acres-postgres"
        : requiredAlert === "QueueDeadLettersDetected" ||
            requiredAlert === "AcresWorkerDown"
          ? "acres-worker"
          : "acres-api";
    if (typeof rule.expr === "string") {
      if (!selectorsUseJob(rule.expr, expectedJob)) {
        ruleErrors.push(`every metric selector must use job="${expectedJob}"`);
      }
    }

    const passed = ruleErrors.length === 0;
    checks.push({
      id: `alert-syntax-${requiredAlert}`,
      passed,
      message: passed
        ? `Alert ${requiredAlert} syntax and schema valid`
        : `Alert ${requiredAlert} schema errors: ${ruleErrors.join("; ")}`,
    });

    if (!passed) {
      errors.push(...ruleErrors.map((e) => `${requiredAlert}: ${e}`));
    }

    alertEvaluations.push({
      alert: requiredAlert,
      ...(passed
        ? {
            expr: rule.expr,
            for: rule.for,
            severity,
            summary: rule.annotations.summary,
            description: rule.annotations.description,
          }
        : {}),
      valid: passed,
      errors: ruleErrors,
    });
  }

  // 4. Run Synthetic Time-Series Simulations
  const simulations = [];
  for (const requiredAlert of REQUIRED_ALERTS) {
    const simDef = SIMULATION_DEFINITIONS[requiredAlert];
    if (!simDef) continue;

    const firesOnBreach = simDef.evaluate(simDef.firingSample);
    const clearsOnNormal = !simDef.evaluate(simDef.clearedSample);
    const ignoresOther4xx =
      requiredAlert !== "High429Rate" ||
      !simDef.evaluate({ totalRequests: 100, requests4xx: 90, requests429: 0 });

    const simPassed = firesOnBreach && clearsOnNormal && ignoresOther4xx;
    checks.push({
      id: `alert-simulation-${requiredAlert}`,
      passed: simPassed,
      message: simPassed
        ? `Alert ${requiredAlert} simulation passed (triggers on breach, clears on normal)`
        : `Alert ${requiredAlert} simulation failed: firesOnBreach=${firesOnBreach}, clearsOnNormal=${clearsOnNormal}`,
    });

    if (!simPassed) {
      errors.push(`Simulation failure for ${requiredAlert}`);
    }

    simulations.push({
      alert: requiredAlert,
      thresholdDescription: simDef.thresholdDescription,
      firesOnBreach,
      clearsOnNormal,
      ...(requiredAlert === "High429Rate" ? { ignoresOther4xx } : {}),
      passed: simPassed,
    });
  }

  return {
    valid: errors.length === 0 && checks.every((check) => check.passed),
    errors,
    checks,
    alerts: alertEvaluations,
    simulations,
    totalRulesCount: allRules.length,
    requiredRulesCount: REQUIRED_ALERTS.length,
  };
}

const HELP = `Usage: scripts/ops/verify-alert-rules.js [options]
  --json                 Emit one JSON verification report
  --alerts-file PATH     Alert YAML (relative to caller cwd)
  --prom-file PATH       Prometheus YAML (relative to caller cwd)
  --help, -h             Show help alone, without source reads
Value options also accept --name=PATH. Defaults use installation sources.
Static heuristics and synthetic predicates do not prove live alert delivery.
`;

function parseArgs(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0]))
    return { help: true };
  const options = {},
    seen = new Set();
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const equal = args[i].indexOf("=");
    const flag = equal < 0 ? args[i] : args[i].slice(0, equal);
    if (
      !["--json", "--alerts-file", "--prom-file"].includes(flag) ||
      seen.has(flag)
    )
      throw new Error("arguments");
    seen.add(flag);
    if (flag === "--json") {
      if (equal >= 0) throw new Error("arguments");
      json = true;
      continue;
    }
    const value = equal >= 0 ? args[i].slice(equal + 1) : args[++i];
    if (!isSourcePath(value) || (equal < 0 && value.startsWith("-")))
      throw new Error("arguments");
    options[flag === "--alerts-file" ? "alertsPath" : "promConfigPath"] = value;
  }
  return { options, json };
}

function runCli() {
  let failed = false;
  const fail = () => {
    process.exitCode = 1;
    if (failed) return;
    failed = true;
    try {
      process.stderr.write(
        "Alert verification invocation or output failed\n",
        () => {},
      );
    } catch {
      /* stderr itself is unavailable */
    }
  };
  // Install before any output; failures cannot be reset by a passing report.
  process.stdout.on("error", fail);
  process.stderr.on("error", () => {
    process.exitCode = 1;
  });
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.help) {
      process.stdout.write(HELP, (error) => {
        if (error) fail();
      });
      return;
    }
    const result = verifyAlertRules(parsed.options);
    const output = parsed.json
      ? JSON.stringify(result, null, 2) + "\n"
      : [
          "Acres Prometheus Alert Rule & Synthetic Predicate Verification",
          "Alert Rule Evaluations:",
          ...result.alerts.map(
            (a) => `  ${a.valid ? "PASS" : "FAIL"} ${a.alert}`,
          ),
          "Synthetic Simulations:",
          ...result.simulations.map(
            (sim) => `  ${sim.passed ? "PASS" : "FAIL"} ${sim.alert}`,
          ),
          `Passed: ${result.checks.filter((c) => c.passed).length} / ${result.checks.length} checks`,
          ...result.errors,
          `Result: ${result.valid ? "PASSED" : "FAILED"}`,
          "",
        ].join("\n");
    if (!result.valid) process.exitCode = 1;
    process.stdout.write(output, (error) => {
      if (error) fail();
    });
  } catch {
    fail();
  }
}

if (require.main === module) runCli();

module.exports = {
  REQUIRED_ALERTS,
  KNOWN_METRIC_IDENTIFIERS,
  SIMULATION_DEFINITIONS,
  isValidDuration,
  verifyAlertRules,
};
