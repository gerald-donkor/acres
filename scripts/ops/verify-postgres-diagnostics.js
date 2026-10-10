#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const EXPECTED = new Map([
  [
    21,
    {
      expr: 'sum by (wait_event) (pg_stat_activity_count{job="acres-postgres",datname="acres",wait_event_type="Lock"})',
      unit: 'short',
    },
  ],
  [
    22,
    {
      expr: 'max(pg_stat_activity_max_tx_duration{job="acres-postgres",datname="acres"})',
      unit: 's',
    },
  ],
]);

const RETAINED_METRICS = new Set([
  'pg_up',
  'pg_exporter_last_scrape_error',
  'pg_settings_max_connections',
  'pg_stat_database_numbackends',
  'pg_stat_activity_count',
  'pg_stat_activity_max_tx_duration',
]);

function isMapping(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  );
}

function verifyPostgresDiagnostics(scrape, dashboard) {
  if (!isMapping(scrape)) {
    return ['scrape must be an object'];
  }
  if (!isMapping(dashboard)) {
    return ['dashboard must be an object'];
  }

  const errors = [];

  if (
    Object.hasOwn(scrape, 'metric_relabel_configs') &&
    !Array.isArray(scrape.metric_relabel_configs)
  ) {
    errors.push('metric_relabel_configs must be a list');
  }

  if (Object.hasOwn(dashboard, 'panels') && !Array.isArray(dashboard.panels)) {
    errors.push('panels must be a list');
  }

  if (errors.length) {
    return errors;
  }

  const rules = Array.isArray(scrape.metric_relabel_configs)
    ? scrape.metric_relabel_configs
    : [];
  const rule = rules[0];
  const retained = String(rule?.regex || '').split('|');
  if (
    rules.length !== 1 ||
    !isMapping(rule) ||
    rule.action !== 'keep' ||
    JSON.stringify(rule.source_labels) !== JSON.stringify(['__name__']) ||
    retained.length !== RETAINED_METRICS.size ||
    retained.some((name) => !RETAINED_METRICS.has(name)) ||
    new Set(retained).size !== RETAINED_METRICS.size
  ) {
    errors.push(
      'PostgreSQL retention must contain exactly the six approved metrics',
    );
  }

  const panels = Array.isArray(dashboard.panels) ? dashboard.panels : [];
  const validPanels = panels.filter((panel) => isMapping(panel));
  const ids = validPanels.map((panel) => panel.id);
  if (new Set(ids).size !== ids.length) {
    errors.push('dashboard panel IDs are reused');
  }

  for (const [id, expected] of EXPECTED) {
    const panel = validPanels.find((entry) => entry.id === id);
    if (!panel) {
      errors.push(`dashboard missing panel ${id}`);
      continue;
    }
    if (!Array.isArray(panel.targets)) {
      errors.push(`panel ${id} targets must be a list`);
      continue;
    }
    const targets = panel.targets;
    if (targets.length !== 1 || targets[0]?.expr !== expected.expr) {
      errors.push(`panel ${id} query or scope drifted`);
    }
    if (
      panel.fieldConfig?.defaults?.unit !== expected.unit ||
      panel.fieldConfig?.defaults?.noValue !== 'No data'
    ) {
      errors.push(`panel ${id} unit or absent-data state drifted`);
    }
    if (panel.type !== 'timeseries' || (panel.gridPos?.y ?? -1) < 52) {
      errors.push(`panel ${id} layout or type drifted`);
    }
  }

  return [...new Set(errors)];
}

class PostgresDiagnosticsUsageError extends Error {}

function parseCliArguments(argv = process.argv.slice(2), cwd = process.cwd()) {
  if (typeof cwd !== 'string' || !cwd.trim()) {
    throw new PostgresDiagnosticsUsageError('cwd requires a non-empty path');
  }
  if (!Array.isArray(argv) || argv.some((arg) => typeof arg !== 'string')) {
    throw new PostgresDiagnosticsUsageError(
      'arguments must be an array of strings',
    );
  }
  let override;
  let showHelp = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      showHelp = true;
      continue;
    }
    if (arg === '--cwd' || arg.startsWith('--cwd=')) {
      if (override !== undefined) {
        throw new PostgresDiagnosticsUsageError(
          'cwd may be specified only once',
        );
      }
      override = arg === '--cwd' ? argv[++index] : arg.slice(6);
      if (
        typeof override !== 'string' ||
        !override.trim() ||
        (arg === '--cwd' && override.startsWith('-'))
      ) {
        throw new PostgresDiagnosticsUsageError(
          'cwd requires a non-empty directory path',
        );
      }
      continue;
    }
    throw new PostgresDiagnosticsUsageError(
      `unsupported option or positional argument: ${arg}`,
    );
  }
  return {
    showHelp,
    cwd: path.resolve(cwd, override === undefined ? '.' : override),
  };
}

function main(
  argv = process.argv,
  io = { log: console.log, error: console.error },
  options = {},
) {
  let parsed;
  try {
    parsed = parseCliArguments(argv.slice(2), options.cwd || process.cwd());
  } catch (error) {
    if (!(error instanceof PostgresDiagnosticsUsageError)) throw error;
    io.error(`postgres diagnostics usage error: ${error.message}`);
    io.error(
      'Usage: node scripts/ops/verify-postgres-diagnostics.js [--help | -h] [--cwd <path> | --cwd=<path>]',
    );
    if (options.exitOnError !== false) process.exit(1);
    return 1;
  }

  if (parsed.showHelp) {
    io.log(
      'Usage: node scripts/ops/verify-postgres-diagnostics.js [--help | -h] [--cwd <path> | --cwd=<path>]',
    );
    return 0;
  }

  const promFile = path.resolve(parsed.cwd, 'infra/prometheus/prometheus.yml');
  const dashFile = path.resolve(
    parsed.cwd,
    'infra/grafana/dashboards/acres-operations.json',
  );

  let prometheus;
  let dashboard;
  try {
    prometheus = yaml.load(fs.readFileSync(promFile, 'utf8'));
  } catch (_err) {
    io.error(
      `postgres diagnostics check failed: unable to read or parse infra/prometheus/prometheus.yml`,
    );
    if (options.exitOnError !== false) process.exit(1);
    return 1;
  }

  try {
    dashboard = JSON.parse(fs.readFileSync(dashFile, 'utf8'));
  } catch (_err) {
    io.error(
      `postgres diagnostics check failed: unable to read or parse infra/grafana/dashboards/acres-operations.json`,
    );
    if (options.exitOnError !== false) process.exit(1);
    return 1;
  }

  const scrapeConfigs = Array.isArray(prometheus?.scrape_configs)
    ? prometheus.scrape_configs
    : [];
  const scrape = scrapeConfigs.find(
    (job) => job?.job_name === 'acres-postgres',
  );
  if (!scrape) {
    io.error(
      'postgres diagnostics check failed: missing acres-postgres scrape job',
    );
    if (options.exitOnError !== false) process.exit(1);
    return 1;
  }

  const errors = verifyPostgresDiagnostics(scrape, dashboard);
  if (errors.length > 0) {
    for (const error of errors) {
      io.error(`postgres diagnostics check failed: ${error}`);
    }
    if (options.exitOnError !== false) process.exit(1);
    return 1;
  }

  io.log('postgres diagnostics check passed');
  return 0;
}

if (require.main === module) {
  main();
}

module.exports = {
  EXPECTED,
  RETAINED_METRICS,
  verifyPostgresDiagnostics,
  parseCliArguments,
  main,
};
