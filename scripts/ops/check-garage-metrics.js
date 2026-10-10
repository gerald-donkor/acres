'use strict';

const TOKEN_PATH = '/run/secrets/garage_metrics_token';
const SOURCE =
  '${ACRES_GARAGE_METRICS_TOKEN_FILE:?inject Garage metrics token file path}';

const WATCHED_KEY =
  /^(?:\s*export\s+)?\s*([A-Z][A-Z0-9_]*)(?=$|[^A-Za-z0-9_])/;

function parseEnvAssignments(envText) {
  const lines = envText.split(/\r?\n/);
  const canonicalCounts = new Map();
  const totalCounts = new Map();
  const canonicalValues = new Map();
  const ambiguous = new Set();

  for (const line of lines) {
    if (/^\s*(?:#|$)/.test(line)) continue;
    const match = line.match(WATCHED_KEY);
    if (!match) continue;
    const key = match[1];
    totalCounts.set(key, (totalCounts.get(key) || 0) + 1);
    if (line.startsWith(`${key}=`) && !/^\s/.test(line[key.length + 1] || '')) {
      canonicalCounts.set(key, (canonicalCounts.get(key) || 0) + 1);
      canonicalValues.set(key, line.slice(key.length + 1));
    } else {
      ambiguous.add(key);
    }
  }

  return { canonicalCounts, totalCounts, canonicalValues, ambiguous };
}

function mount(entry) {
  if (typeof entry === 'string') {
    const parts = entry.match(/^(.*):(\/[^:]+):(ro|rw)$/);
    return {
      source: parts?.[1],
      target: parts?.[2],
      readOnly: parts?.[3] === 'ro',
    };
  }
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    return {
      source: typeof entry.source === 'string' ? entry.source : undefined,
      target: typeof entry.target === 'string' ? entry.target : undefined,
      readOnly: entry.read_only === true || entry.readOnly === true,
    };
  }
  return { source: undefined, target: undefined, readOnly: false };
}

function environmentEntries(environment) {
  if (Array.isArray(environment)) {
    return environment.map((entry) => {
      const separator = String(entry).indexOf('=');
      return separator < 0
        ? [String(entry), '']
        : [String(entry).slice(0, separator), String(entry).slice(separator + 1)];
    });
  }
  if (environment && typeof environment === 'object') {
    return Object.entries(environment);
  }
  return [];
}

function checkGarageMetrics(
  compose,
  productionEnv,
  garageEnv,
  garageToml,
  prom,
  caddyText = '',
) {
  if (!compose || typeof compose !== 'object' || Array.isArray(compose)) {
    return ['compose must be an object'];
  }
  if (typeof productionEnv !== 'string') {
    return ['production.env.example must be text'];
  }
  if (typeof garageEnv !== 'string') {
    return ['garage.production.env.example must be text'];
  }
  if (typeof garageToml !== 'string') {
    return ['garage.toml must be text'];
  }
  if (!prom || typeof prom !== 'object' || Array.isArray(prom)) {
    return ['prometheus.yml must be an object'];
  }
  if (typeof caddyText !== 'string') {
    return ['Caddyfile must be text'];
  }

  const cleanProductionEnv = productionEnv.replace(/^\uFEFF/, '');
  const cleanGarageEnv = garageEnv.replace(/^\uFEFF/, '');
  const cleanGarageToml = garageToml.replace(/^\uFEFF/, '');
  const cleanCaddyText = caddyText.replace(/^\uFEFF/, '');

  const errors = [];
  const services =
    compose.services &&
    typeof compose.services === 'object' &&
    !Array.isArray(compose.services)
      ? compose.services
      : {};

  for (const resource of ['secrets', 'configs']) {
    const res = compose[resource];
    const resStr = res && typeof res === 'object' ? JSON.stringify(res) : '';
    if (
      resStr.includes('ACRES_GARAGE_METRICS_TOKEN_FILE') ||
      resStr.includes(TOKEN_PATH)
    ) {
      errors.push(
        `Compose ${resource} must not redistribute ACRES_GARAGE_METRICS_TOKEN_FILE`,
      );
    }
  }

  const prodParsed = parseEnvAssignments(cleanProductionEnv);
  const garageParsed = parseEnvAssignments(cleanGarageEnv);

  const tokenSentinel = [
    '__',
    'REQUIRED_OPERATOR_GARAGE_METRICS_TOKEN_FILE',
    '__',
  ].join('');

  const prodFileCanonical =
    prodParsed.canonicalCounts.get('ACRES_GARAGE_METRICS_TOKEN_FILE') || 0;
  const prodFileTotal =
    prodParsed.totalCounts.get('ACRES_GARAGE_METRICS_TOKEN_FILE') || 0;
  const prodFileVal =
    prodParsed.canonicalValues.get('ACRES_GARAGE_METRICS_TOKEN_FILE');

  if (prodParsed.ambiguous.has('ACRES_GARAGE_METRICS_TOKEN_FILE')) {
    errors.push(
      'production.env.example has an ambiguous ACRES_GARAGE_METRICS_TOKEN_FILE assignment',
    );
  }

  if (
    prodFileCanonical !== 1 ||
    prodFileTotal > 1 ||
    prodFileVal !== `/${tokenSentinel}`
  ) {
    errors.push(
      'production.env.example must assign ACRES_GARAGE_METRICS_TOKEN_FILE once to an unresolved absolute operator path',
    );
  }

  const hasLegacyOrDuplicate =
    (prodParsed.totalCounts.get('GARAGE_METRICS_TOKEN') || 0) > 0 ||
    (prodParsed.totalCounts.get('GARAGE_METRICS_TOKEN_FILE') || 0) > 0 ||
    (garageParsed.totalCounts.get('GARAGE_METRICS_TOKEN') || 0) > 0 ||
    (garageParsed.totalCounts.get('GARAGE_METRICS_TOKEN_FILE') || 0) > 0 ||
    (garageParsed.totalCounts.get('ACRES_GARAGE_METRICS_TOKEN_FILE') || 0) > 0;

  if (hasLegacyOrDuplicate) {
    errors.push(
      'Garage metrics must have one file source; remove legacy GARAGE_METRICS_TOKEN and duplicate GARAGE_METRICS_TOKEN_FILE assignments',
    );
  }

  const adminSections = cleanGarageToml.match(/^\[\s*admin\s*\]\s*$/gm) || [];
  const admin =
    cleanGarageToml.split(/^\[\s*admin\s*\]\s*$/m)[1]?.split(/^\[/m)[0] || '';

  if (
    adminSections.length !== 1 ||
    (admin.match(/^\s*metrics_require_token\s*=/gm) || []).length !== 1 ||
    !/^\s*metrics_require_token\s*=\s*true\s*$/m.test(admin) ||
    /^\s*(?:metrics_token|metrics_token_file)\s*=/m.test(cleanGarageToml)
  ) {
    errors.push(
      'garage.toml [admin] must require metrics token without an inline or second token source',
    );
  }

  if (!/^\s*api_bind_addr\s*=\s*"0\.0\.0\.0:3903"\s*$/m.test(admin)) {
    errors.push('garage.toml [admin] must listen on private Compose port 3903');
  }

  for (const [name, service] of Object.entries(services)) {
    if (!service || typeof service !== 'object' || Array.isArray(service)) {
      continue;
    }
    const mounts = (
      Array.isArray(service.volumes) ? service.volumes : []
    ).map(mount);
    const tokenMounts = mounts.filter(
      ({ source, target }) =>
        String(source || '').includes('ACRES_GARAGE_METRICS_TOKEN_FILE') ||
        target === TOKEN_PATH,
    );

    if (
      JSON.stringify(service.secrets || []).includes('garage_metrics_token') ||
      JSON.stringify(service.configs || []).includes('garage_metrics_token')
    ) {
      errors.push(
        `${name} must not receive Garage metrics through Compose secrets or configs`,
      );
    }

    if (name === 'garage' || name === 'prometheus') {
      if (
        tokenMounts.length !== 1 ||
        tokenMounts[0].source !== SOURCE ||
        tokenMounts[0].target !== TOKEN_PATH ||
        !tokenMounts[0].readOnly
      ) {
        errors.push(
          `${name} must mount ACRES_GARAGE_METRICS_TOKEN_FILE read-only at ${TOKEN_PATH}`,
        );
      }
      if (
        JSON.stringify(service.networks) !== JSON.stringify(['private']) ||
        (Array.isArray(service.ports) && service.ports.length > 0)
      ) {
        errors.push(
          `${name} metrics listener must stay on the private network without published ports`,
        );
      }
    } else if (tokenMounts.length) {
      errors.push(`${name} must not mount ACRES_GARAGE_METRICS_TOKEN_FILE`);
    }

    if (
      name !== 'garage' &&
      (environmentEntries(service.environment).some(
        ([key, value]) =>
          [
            'GARAGE_METRICS_TOKEN',
            'GARAGE_METRICS_TOKEN_FILE',
            'ACRES_GARAGE_METRICS_TOKEN_FILE',
          ].includes(key) ||
          String(value).includes('ACRES_GARAGE_METRICS_TOKEN_FILE') ||
          String(value).includes(TOKEN_PATH),
      ) ||
        (Array.isArray(service.env_file) &&
          service.env_file.some((file) =>
            String(file).includes('garage.production.env'),
          )))
    ) {
      errors.push(
        `${name} must not receive a Garage metrics token environment input`,
      );
    }
  }

  const garage =
    services.garage &&
    typeof services.garage === 'object' &&
    !Array.isArray(services.garage)
      ? services.garage
      : {};

  if (Object.hasOwn(garage, 'env_file')) {
    errors.push('garage must not declare env_file');
  }

  const garageEnvironment = Object.fromEntries(
    environmentEntries(garage.environment),
  );
  if (
    garageEnvironment.GARAGE_METRICS_TOKEN_FILE !== TOKEN_PATH ||
    Object.hasOwn(garageEnvironment, 'GARAGE_METRICS_TOKEN') ||
    !(
      Array.isArray(garage.expose) &&
      garage.expose.some((p) => String(p).includes('3903'))
    ) ||
    !JSON.stringify(garage.healthcheck?.test).includes('localhost:3903/health')
  ) {
    errors.push(
      `garage must use GARAGE_METRICS_TOKEN_FILE=${TOKEN_PATH} and retain private 3903 /health`,
    );
  }

  const scrapeConfigs = Array.isArray(prom.scrape_configs)
    ? prom.scrape_configs
    : [];
  const jobs = scrapeConfigs.filter(
    (job) =>
      job && typeof job === 'object' && job.job_name === 'acres-garage',
  );

  if (
    scrapeConfigs.some(
      (candidate) =>
        candidate &&
        typeof candidate === 'object' &&
        candidate.job_name !== 'acres-garage' &&
        JSON.stringify(candidate).includes(TOKEN_PATH),
    )
  ) {
    errors.push(`Prometheus ${TOKEN_PATH} must be scoped to acres-garage only`);
  }

  const job = jobs[0];
  if (
    jobs.length !== 1 ||
    Object.keys(job || {}).some(
      (key) =>
        ![
          'job_name',
          'metrics_path',
          'scheme',
          'authorization',
          'static_configs',
        ].includes(key),
    ) ||
    job?.scheme !== 'http' ||
    job?.metrics_path !== '/metrics' ||
    job?.authorization?.type !== 'Bearer' ||
    job?.authorization?.credentials_file !== TOKEN_PATH ||
    Object.keys(job?.authorization || {}).some(
      (key) => !['type', 'credentials_file'].includes(key),
    ) ||
    JSON.stringify(job?.static_configs) !==
      JSON.stringify([{ targets: ['garage:3903'] }])
  ) {
    errors.push(
      `Prometheus acres-garage must scrape private garage:3903/metrics with Bearer credentials_file ${TOKEN_PATH}`,
    );
  }

  if (
    JSON.stringify(services.caddy || {}).includes('garage:3903') ||
    cleanCaddyText.includes('garage:3903') ||
    JSON.stringify(services.grafana || {}).includes(TOKEN_PATH)
  ) {
    errors.push('Garage metrics must not be exposed through Caddy or Grafana');
  }

  return [...new Set(errors)];
}

module.exports = { checkGarageMetrics };
