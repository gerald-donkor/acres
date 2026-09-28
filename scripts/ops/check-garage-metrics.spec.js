const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { checkGarageMetrics } = require('./check-garage-metrics');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const baseline = () => ({
  compose: yaml.load(read('infra/compose/docker-compose.production.example.yml')),
  productionEnv: read('infra/env/production.env.example'),
  garageEnv: read('infra/env/garage.production.env.example'),
  garageToml: read('infra/garage/garage.toml'),
  prom: yaml.load(read('infra/prometheus/prometheus.yml')),
  caddyText: read('infra/caddy/Caddyfile.example'),
});
const check = (fixture) => checkGarageMetrics(...[
  fixture.compose, fixture.productionEnv, fixture.garageEnv,
  fixture.garageToml, fixture.prom, fixture.caddyText,
]);

test('valid Garage metrics wiring', () => {
  assert.deepEqual(check(baseline()), []);
});

const mutations = [
  ['missing operator input', (f) => { f.productionEnv = f.productionEnv.replace(/^ACRES_GARAGE_METRICS_TOKEN_FILE=.*\n/m, ''); }, 'ACRES_GARAGE_METRICS_TOKEN_FILE'],
  ['duplicate operator input', (f) => { f.productionEnv += '\nACRES_GARAGE_METRICS_TOKEN_FILE=/another\n'; }, 'ACRES_GARAGE_METRICS_TOKEN_FILE'],
  ['relative operator input', (f) => { f.productionEnv = f.productionEnv.replace('/__REQUIRED_OPERATOR_GARAGE_METRICS_TOKEN_FILE__', '__REQUIRED_OPERATOR_GARAGE_METRICS_TOKEN_FILE__'); }, 'absolute operator path'],
  ['legacy inline token', (f) => { f.garageEnv += '\nGARAGE_METRICS_TOKEN=synthetic-private-value\n'; }, 'GARAGE_METRICS_TOKEN'],
  ['duplicate file environment', (f) => { f.garageEnv += '\nGARAGE_METRICS_TOKEN_FILE=/tmp/other\n'; }, 'GARAGE_METRICS_TOKEN_FILE'],
  ['wrong interpolation', (f) => { f.compose.services.garage.volumes.splice(-1, 1, '${OTHER_FILE:?required}:/run/secrets/garage_metrics_token:ro'); }, 'ACRES_GARAGE_METRICS_TOKEN_FILE'],
  ['optional interpolation', (f) => { f.compose.services.garage.volumes.splice(-1, 1, '${ACRES_GARAGE_METRICS_TOKEN_FILE-}:/run/secrets/garage_metrics_token:ro'); }, 'ACRES_GARAGE_METRICS_TOKEN_FILE'],
  ['writable mount', (f) => { f.compose.services.prometheus.volumes.splice(-1, 1, '${ACRES_GARAGE_METRICS_TOKEN_FILE:?inject Garage metrics token file path}:/run/secrets/garage_metrics_token:rw'); }, 'read-only'],
  ['missing mount', (f) => { f.compose.services.prometheus.volumes.pop(); }, 'prometheus must mount'],
  ['wrong mount target', (f) => { f.compose.services.garage.volumes.splice(-1, 1, '${ACRES_GARAGE_METRICS_TOKEN_FILE:?inject Garage metrics token file path}:/tmp/token:ro'); }, '/run/secrets/garage_metrics_token'],
  ['disabled auth', (f) => { f.garageToml = f.garageToml.replace('metrics_require_token = true', 'metrics_require_token = false'); }, 'require metrics token'],
  ['duplicate auth setting', (f) => { f.garageToml += '\nmetrics_require_token = false\n'; }, 'require metrics token'],
  ['second TOML token', (f) => { f.garageToml += '\nmetrics_token = "synthetic-private-value"\n'; }, 'second token source'],
  ['missing scrape', (f) => { f.prom.scrape_configs = f.prom.scrape_configs.filter((j) => j.job_name !== 'acres-garage'); }, 'acres-garage'],
  ['wrong scrape target', (f) => { f.prom.scrape_configs.find((j) => j.job_name === 'acres-garage').static_configs[0].targets = ['example.com:3903']; }, 'garage:3903'],
  ['relabelled scrape target', (f) => { f.prom.scrape_configs.find((j) => j.job_name === 'acres-garage').relabel_configs = [{ target_label: '__address__', replacement: 'untrusted.example:3903' }]; }, 'garage:3903'],
  ['extra discovery target', (f) => { f.prom.scrape_configs.find((j) => j.job_name === 'acres-garage').dns_sd_configs = [{ names: ['untrusted.example'] }]; }, 'garage:3903'],
  ['second job reads bearer', (f) => { f.prom.scrape_configs.push({ job_name: 'untrusted', authorization: { credentials_file: '/run/secrets/garage_metrics_token' }, static_configs: [{ targets: ['untrusted.example:3903'] }] }); }, 'acres-garage only'],
  ['inline bearer', (f) => { f.prom.scrape_configs.find((j) => j.job_name === 'acres-garage').authorization.credentials = 'synthetic-private-value'; }, 'credentials_file'],
  ['published admin port', (f) => { f.compose.services.garage.ports = ['3903:3903']; }, 'published ports'],
  ['leaked API mount', (f) => { f.compose.services.api.volumes = ['${ACRES_GARAGE_METRICS_TOKEN_FILE:?inject Garage metrics token file path}:/run/secrets/garage_metrics_token:ro']; }, 'api must not mount'],
  ['leaked worker env', (f) => { f.compose.services.worker.environment.GARAGE_METRICS_TOKEN_FILE = '/run/secrets/garage_metrics_token'; }, 'worker must not receive'],
  ['leaked source under unrelated key', (f) => { f.compose.services.api.environment.OTHER_FILE = '${ACRES_GARAGE_METRICS_TOKEN_FILE:?inject Garage metrics token file path}'; }, 'api must not receive'],
  ['array environment legacy token', (f) => { f.compose.services.grafana.environment = ['GARAGE_METRICS_TOKEN=${GARAGE_METRICS_TOKEN:?required}']; }, 'grafana must not receive'],
  ['Compose secret redistributes file', (f) => { f.compose.secrets = { leaked: { file: '${ACRES_GARAGE_METRICS_TOKEN_FILE:?inject Garage metrics token file path}' } }; f.compose.services.api.secrets = ['leaked']; }, 'Compose secrets'],
  ['leaked Next env file', (f) => { f.compose.services.next.env_file = ['../env/garage.production.env.example']; }, 'next must not receive'],
  ['garage env_file declared', (f) => { f.compose.services.garage.env_file = ['../env/garage.production.env.example']; }, 'garage must not declare env_file'],
  ['leaked Caddy route', (f) => { f.compose.services.caddy.environment.METRICS_ROUTE = 'garage:3903'; }, 'Caddy'],
  ['leaked Caddyfile route', (f) => { f.caddyText += '\nreverse_proxy garage:3903\n'; }, 'Caddy'],
];

for (const [name, mutate, expected] of mutations) {
  test(`rejects ${name} without printing token values`, () => {
    const fixture = baseline();
    mutate(fixture);
    const errors = check(fixture);
    assert.ok(errors.some((error) => error.includes(expected)), errors.join('\n'));
    assert.equal(errors.join('\n').includes('synthetic-private-value'), false);
  });
}
