const EXPECTED = new Map([
  [21, {
    expr: 'sum by (wait_event) (pg_stat_activity_count{job="acres-postgres",datname="acres",wait_event_type="Lock"})',
    unit: 'short',
  }],
  [22, {
    expr: 'max(pg_stat_activity_max_tx_duration{job="acres-postgres",datname="acres"})',
    unit: 's',
  }],
]);
const RETAINED_METRICS = new Set([
  'pg_up',
  'pg_exporter_last_scrape_error',
  'pg_settings_max_connections',
  'pg_stat_database_numbackends',
  'pg_stat_activity_count',
  'pg_stat_activity_max_tx_duration',
]);

function verifyPostgresDiagnostics(scrape, dashboard) {
  const errors = [];
  const rules = scrape?.metric_relabel_configs || [];
  const retained = String(rules[0]?.regex || '').split('|');
  if (rules.length !== 1 || rules[0]?.action !== 'keep' ||
      JSON.stringify(rules[0]?.source_labels) !== JSON.stringify(['__name__']) ||
      retained.length !== RETAINED_METRICS.size ||
      retained.some((name) => !RETAINED_METRICS.has(name)) ||
      new Set(retained).size !== RETAINED_METRICS.size) {
    errors.push('PostgreSQL retention must contain exactly the six approved metrics');
  }

  const panels = dashboard?.panels || [];
  const ids = panels.map((panel) => panel.id);
  if (new Set(ids).size !== ids.length) errors.push('dashboard panel IDs are reused');
  for (const [id, expected] of EXPECTED) {
    const panel = panels.find((entry) => entry.id === id);
    const targets = panel?.targets || [];
    if (targets.length !== 1 || targets[0]?.expr !== expected.expr) {
      errors.push(`panel ${id} query or scope drifted`);
    }
    if (panel?.fieldConfig?.defaults?.unit !== expected.unit ||
        panel?.fieldConfig?.defaults?.noValue !== 'No data') {
      errors.push(`panel ${id} unit or absent-data state drifted`);
    }
    if (panel?.type !== 'timeseries' || (panel?.gridPos?.y ?? -1) < 52) {
      errors.push(`panel ${id} layout or type drifted`);
    }
  }
  return errors;
}

module.exports = { verifyPostgresDiagnostics };
