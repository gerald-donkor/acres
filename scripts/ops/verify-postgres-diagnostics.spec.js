'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const yaml = require('js-yaml');
const {
  verifyPostgresDiagnostics,
  parseCliArguments,
  main,
} = require('./verify-postgres-diagnostics');

const prometheus = yaml.load(
  fs.readFileSync('infra/prometheus/prometheus.yml', 'utf8'),
);
const scrape = prometheus.scrape_configs.find(
  (job) => job.job_name === 'acres-postgres',
);
const dashboard = JSON.parse(
  fs.readFileSync('infra/grafana/dashboards/acres-operations.json', 'utf8'),
);
const copy = (value) => structuredClone(value);

test('checked-in PostgreSQL diagnostics retain their metric and panel contracts', () => {
  assert.deepEqual(verifyPostgresDiagnostics(scrape, dashboard), []);
});

test('missing transaction-age retention fails', () => {
  const changed = copy(scrape);
  changed.metric_relabel_configs[0].regex =
    changed.metric_relabel_configs[0].regex.replace(
      '|pg_stat_activity_max_tx_duration',
      '',
    );
  assert.match(
    verifyPostgresDiagnostics(changed, dashboard).join(' '),
    /exactly the six/,
  );
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
          id === 22
            ? 'pg_stat_activity_max_tx_duration'
            : replacement.startsWith('job=')
              ? 'job="acres-postgres"'
              : replacement.startsWith('datname=')
                ? 'datname="acres"'
                : replacement.startsWith('wait_event_type=')
                  ? 'wait_event_type="Lock"'
                  : 'pg_stat_activity_count',
          replacement,
        );
    assert.match(
      verifyPostgresDiagnostics(scrape, changed).join(' '),
      /query or scope drifted/,
    );
  }
});

test('reused IDs, query-text metrics, and hidden absence fail', () => {
  const duplicate = copy(dashboard);
  duplicate.panels.find((panel) => panel.id === 22).id = 21;
  assert.match(
    verifyPostgresDiagnostics(scrape, duplicate).join(' '),
    /IDs are reused/,
  );

  const sensitive = copy(scrape);
  sensitive.metric_relabel_configs[0].regex += '|pg_stat_activity_query';
  assert.match(
    verifyPostgresDiagnostics(sensitive, dashboard).join(' '),
    /exactly the six/,
  );

  const wildcard = copy(scrape);
  wildcard.metric_relabel_configs[0].regex += '|pg_.*';
  assert.match(
    verifyPostgresDiagnostics(wildcard, dashboard).join(' '),
    /exactly the six/,
  );

  const hidden = copy(dashboard);
  delete hidden.panels.find((panel) => panel.id === 21).fieldConfig.defaults
    .noValue;
  assert.match(
    verifyPostgresDiagnostics(scrape, hidden).join(' '),
    /absent-data/,
  );
});

test('pool acquisition latency panels have unique IDs and correct scope', () => {
  const duplicate = copy(dashboard);
  duplicate.panels.find((panel) => panel.id === 24).id = 23;
  assert.match(
    verifyPostgresDiagnostics(scrape, duplicate).join(' '),
    /IDs are reused/,
  );
});

test('database query execution latency panels have unique IDs and correct scope', () => {
  const duplicate = copy(dashboard);
  duplicate.panels.find((panel) => panel.id === 26).id = 25;
  assert.match(
    verifyPostgresDiagnostics(scrape, duplicate).join(' '),
    /IDs are reused/,
  );
});

test('active concurrency and 429 rate panels have unique IDs and correct scope', () => {
  const duplicate = copy(dashboard);
  duplicate.panels.find((panel) => panel.id === 28).id = 27;
  assert.match(
    verifyPostgresDiagnostics(scrape, duplicate).join(' '),
    /IDs are reused/,
  );
});

test('rejects non-object scrape argument', () => {
  for (const invalid of [null, undefined, 'string', 123, true, []]) {
    assert.deepEqual(verifyPostgresDiagnostics(invalid, dashboard), [
      'scrape must be an object',
    ]);
  }
});

test('rejects non-object dashboard argument', () => {
  for (const invalid of [null, undefined, 'string', 123, true, []]) {
    assert.deepEqual(verifyPostgresDiagnostics(scrape, invalid), [
      'dashboard must be an object',
    ]);
  }
});

test('rejects non-list metric_relabel_configs and panels', () => {
  const badScrape = copy(scrape);
  badScrape.metric_relabel_configs = 'not-a-list';
  assert.deepEqual(verifyPostgresDiagnostics(badScrape, dashboard), [
    'metric_relabel_configs must be a list',
  ]);

  const badDashboard = copy(dashboard);
  badDashboard.panels = 'not-a-list';
  assert.deepEqual(verifyPostgresDiagnostics(scrape, badDashboard), [
    'panels must be a list',
  ]);
});

test('reports missing panel 21 and 22 explicitly', () => {
  const missing21 = copy(dashboard);
  missing21.panels = missing21.panels.filter((p) => p.id !== 21);
  assert.deepEqual(verifyPostgresDiagnostics(scrape, missing21), [
    'dashboard missing panel 21',
  ]);

  const missing22 = copy(dashboard);
  missing22.panels = missing22.panels.filter((p) => p.id !== 22);
  assert.deepEqual(verifyPostgresDiagnostics(scrape, missing22), [
    'dashboard missing panel 22',
  ]);

  const missingBoth = copy(dashboard);
  missingBoth.panels = missingBoth.panels.filter((p) => p.id !== 21 && p.id !== 22);
  assert.deepEqual(verifyPostgresDiagnostics(scrape, missingBoth), [
    'dashboard missing panel 21',
    'dashboard missing panel 22',
  ]);
});

test('reports non-list panel targets explicitly', () => {
  const badTargets = copy(dashboard);
  const p21 = badTargets.panels.find((p) => p.id === 21);
  p21.targets = 'not-a-list';
  assert.deepEqual(verifyPostgresDiagnostics(scrape, badTargets), [
    'panel 21 targets must be a list',
  ]);
});

test('tolerates non-mapping entries in panels array safely', () => {
  const messyDashboard = copy(dashboard);
  messyDashboard.panels.push(null, 'not-a-panel', 123);
  assert.deepEqual(verifyPostgresDiagnostics(scrape, messyDashboard), []);
});

test('parseCliArguments parses help and directory options', () => {
  assert.deepEqual(parseCliArguments(['--help'], '/custom/path'), {
    showHelp: true,
    cwd: '/custom/path',
  });
  assert.deepEqual(parseCliArguments(['-h'], '/custom/path'), {
    showHelp: true,
    cwd: '/custom/path',
  });
  assert.deepEqual(parseCliArguments(['--cwd', 'subdir'], '/custom/path'), {
    showHelp: false,
    cwd: path.resolve('/custom/path', 'subdir'),
  });
  assert.deepEqual(parseCliArguments(['--cwd=subdir'], '/custom/path'), {
    showHelp: false,
    cwd: path.resolve('/custom/path', 'subdir'),
  });
});

test('parseCliArguments rejects invalid options and inputs', () => {
  assert.throws(
    () => parseCliArguments(['--cwd', 'a', '--cwd', 'b']),
    /cwd may be specified only once/,
  );
  assert.throws(
    () => parseCliArguments(['--cwd'], '/path'),
    /cwd requires a non-empty directory path/,
  );
  assert.throws(
    () => parseCliArguments(['--cwd', '-bad'], '/path'),
    /cwd requires a non-empty directory path/,
  );
  assert.throws(
    () => parseCliArguments(['--cwd='], '/path'),
    /cwd requires a non-empty directory path/,
  );
  assert.throws(
    () => parseCliArguments(['--unknown']),
    /unsupported option or positional argument/,
  );
  assert.throws(
    () => parseCliArguments('not-array'),
    /arguments must be an array of strings/,
  );
  assert.throws(
    () => parseCliArguments([], ''),
    /cwd requires a non-empty path/,
  );
});

test('main execution handles help, clean pass, and errors', () => {
  const logs = [];
  const errors = [];
  const io = {
    log: (msg) => logs.push(msg),
    error: (msg) => errors.push(msg),
  };

  // Help option
  const helpCode = main(['node', 'script.js', '--help'], io, {
    exitOnError: false,
  });
  assert.equal(helpCode, 0);
  assert.ok(logs.some((msg) => msg.includes('Usage:')));

  // Usage error
  const errorCode = main(['node', 'script.js', '--unknown'], io, {
    exitOnError: false,
  });
  assert.equal(errorCode, 1);
  assert.ok(errors.some((msg) => msg.includes('usage error')));

  // Clean pass against repository
  logs.length = 0;
  errors.length = 0;
  const passCode = main(['node', 'script.js'], io, { exitOnError: false });
  assert.equal(passCode, 0);
  assert.ok(logs.some((msg) => msg.includes('postgres diagnostics check passed')));
  assert.equal(errors.length, 0);

  // Missing files in empty directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acres-pg-test-'));
  try {
    errors.length = 0;
    const failCode = main(['node', 'script.js', `--cwd=${tempDir}`], io, {
      exitOnError: false,
    });
    assert.equal(failCode, 1);
    // Prometheus with non-array scrape_configs
    errors.length = 0;
    fs.mkdirSync(path.join(tempDir, 'infra', 'prometheus'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'infra', 'grafana', 'dashboards'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tempDir, 'infra', 'prometheus', 'prometheus.yml'),
      'scrape_configs: { not_a_list: true }\n',
    );
    fs.writeFileSync(
      path.join(
        tempDir,
        'infra',
        'grafana',
        'dashboards',
        'acres-operations.json',
      ),
      JSON.stringify({ panels: [] }),
    );
    const nonArrayCode = main(['node', 'script.js', `--cwd=${tempDir}`], io, {
      exitOnError: false,
    });
    assert.equal(nonArrayCode, 1);
    assert.ok(
      errors.some((msg) => msg.includes('missing acres-postgres scrape job')),
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
