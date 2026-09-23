const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const yaml = require('js-yaml');
const { verifyPostgresDiagnostics } = require('./verify-postgres-diagnostics');

const prometheus = yaml.load(fs.readFileSync('infra/prometheus/prometheus.yml', 'utf8'));
const scrape = prometheus.scrape_configs.find((job) => job.job_name === 'acres-postgres');
const dashboard = JSON.parse(fs.readFileSync('infra/grafana/dashboards/acres-operations.json', 'utf8'));
const copy = (value) => structuredClone(value);

test('checked-in PostgreSQL diagnostics retain their metric and panel contracts', () => {
  assert.deepEqual(verifyPostgresDiagnostics(scrape, dashboard), []);
});

test('missing transaction-age retention fails', () => {
  const changed = copy(scrape);
  changed.metric_relabel_configs[0].regex = changed.metric_relabel_configs[0].regex
    .replace('|pg_stat_activity_max_tx_duration', '');
  assert.match(verifyPostgresDiagnostics(changed, dashboard).join(' '), /exactly the six/);
});

test('wrong metric, job, database, lock filter, and synthetic zero fail', () => {
  for (const [id, replacement] of [
    [21, 'pg_stat_activity_max_tx_duration'],
    [21, 'job="acres-api"'],
    [21, 'datname="postgres"'],
    [21, 'wait_event_type="LWLock"'],
    [21, ' or vector(0)'],
    [22, 'pg_stat_activity_count'],
  ]) {
    const changed = copy(dashboard);
    const target = changed.panels.find((panel) => panel.id === id).targets[0];
    target.expr = replacement.startsWith(' or ')
      ? `${target.expr}${replacement}`
      : target.expr.replace(
        id === 22 ? 'pg_stat_activity_max_tx_duration' :
          replacement.startsWith('job=') ? 'job="acres-postgres"' :
            replacement.startsWith('datname=') ? 'datname="acres"' :
              replacement.startsWith('wait_event_type=') ? 'wait_event_type="Lock"' :
                'pg_stat_activity_count', replacement);
    assert.match(verifyPostgresDiagnostics(scrape, changed).join(' '), /query or scope drifted/);
  }
});

test('reused IDs, query-text metrics, and hidden absence fail', () => {
  const duplicate = copy(dashboard);
  duplicate.panels.find((panel) => panel.id === 22).id = 21;
  assert.match(verifyPostgresDiagnostics(scrape, duplicate).join(' '), /IDs are reused/);

  const sensitive = copy(scrape);
  sensitive.metric_relabel_configs[0].regex += '|pg_stat_activity_query';
  assert.match(verifyPostgresDiagnostics(sensitive, dashboard).join(' '), /exactly the six/);

  const wildcard = copy(scrape);
  wildcard.metric_relabel_configs[0].regex += '|pg_.*';
  assert.match(verifyPostgresDiagnostics(wildcard, dashboard).join(' '), /exactly the six/);

  const hidden = copy(dashboard);
  delete hidden.panels.find((panel) => panel.id === 21).fieldConfig.defaults.noValue;
  assert.match(verifyPostgresDiagnostics(scrape, hidden).join(' '), /absent-data/);
});
