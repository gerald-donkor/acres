const TOKEN_PATH = '/run/secrets/garage_metrics_token';
const SOURCE = '${ACRES_GARAGE_METRICS_TOKEN_FILE:?inject Garage metrics token file path}';

function assignments(text, key) {
  return text.split(/\r?\n/).filter((line) => line.startsWith(`${key}=`));
}

function mount(entry) {
  if (typeof entry === 'string') {
    const parts = entry.match(/^(.*):(\/[^:]+):(ro|rw)$/);
    return { source: parts?.[1], target: parts?.[2], readOnly: parts?.[3] === 'ro' };
  }
  return {
    source: entry?.source,
    target: entry?.target,
    readOnly: entry?.read_only === true || entry?.readOnly === true,
  };
}

function environmentEntries(environment) {
  if (Array.isArray(environment)) {
    return environment.map((entry) => {
      const separator = String(entry).indexOf('=');
      return separator < 0 ? [String(entry), ''] :
        [String(entry).slice(0, separator), String(entry).slice(separator + 1)];
    });
  }
  return Object.entries(environment || {});
}

function checkGarageMetrics(compose, productionEnv, garageEnv, garageToml, prom, caddyText = '') {
  const errors = [];
  const services = compose?.services || {};
  for (const resource of ['secrets', 'configs']) {
    if (JSON.stringify(compose?.[resource] || {}).includes('ACRES_GARAGE_METRICS_TOKEN_FILE') ||
        JSON.stringify(compose?.[resource] || {}).includes(TOKEN_PATH)) {
      errors.push(`Compose ${resource} must not redistribute ACRES_GARAGE_METRICS_TOKEN_FILE`);
    }
  }
  const fileAssignments = assignments(productionEnv, 'ACRES_GARAGE_METRICS_TOKEN_FILE');
  const tokenSentinel = ['__', 'REQUIRED_OPERATOR_GARAGE_METRICS_TOKEN_FILE', '__'].join('');
  if (fileAssignments.length !== 1 ||
      fileAssignments[0] !== `ACRES_GARAGE_METRICS_TOKEN_FILE=/${tokenSentinel}`) {
    errors.push('production.env.example must assign ACRES_GARAGE_METRICS_TOKEN_FILE once to an unresolved absolute operator path');
  }
  if (assignments(productionEnv, 'GARAGE_METRICS_TOKEN').length ||
      assignments(productionEnv, 'GARAGE_METRICS_TOKEN_FILE').length ||
      assignments(garageEnv, 'GARAGE_METRICS_TOKEN').length ||
      assignments(garageEnv, 'GARAGE_METRICS_TOKEN_FILE').length ||
      assignments(garageEnv, 'ACRES_GARAGE_METRICS_TOKEN_FILE').length) {
    errors.push('Garage metrics must have one file source; remove legacy GARAGE_METRICS_TOKEN and duplicate GARAGE_METRICS_TOKEN_FILE assignments');
  }

  const admin = garageToml.split(/^\[admin\]\s*$/m)[1]?.split(/^\[/m)[0] || '';
  if ((admin.match(/^metrics_require_token\s*=/gm) || []).length !== 1 ||
      !/^metrics_require_token\s*=\s*true\s*$/m.test(admin) ||
      /^(?:metrics_token|metrics_token_file)\s*=/m.test(admin)) {
    errors.push('garage.toml [admin] must require metrics token without an inline or second token source');
  }
  if (!/^api_bind_addr\s*=\s*"0\.0\.0\.0:3903"\s*$/m.test(admin)) {
    errors.push('garage.toml [admin] must listen on private Compose port 3903');
  }

  for (const [name, service] of Object.entries(services)) {
    const mounts = (service.volumes || []).map(mount);
    const tokenMounts = mounts.filter(({ source, target }) =>
      String(source || '').includes('ACRES_GARAGE_METRICS_TOKEN_FILE') || target === TOKEN_PATH);
    if (JSON.stringify(service.secrets || []).includes('garage_metrics_token') ||
        JSON.stringify(service.configs || []).includes('garage_metrics_token')) {
      errors.push(`${name} must not receive Garage metrics through Compose secrets or configs`);
    }
    if (name === 'garage' || name === 'prometheus') {
      if (tokenMounts.length !== 1 || tokenMounts[0].source !== SOURCE ||
          tokenMounts[0].target !== TOKEN_PATH || !tokenMounts[0].readOnly) {
        errors.push(`${name} must mount ACRES_GARAGE_METRICS_TOKEN_FILE read-only at ${TOKEN_PATH}`);
      }
      if (JSON.stringify(service.networks) !== JSON.stringify(['private']) || service.ports?.length) {
        errors.push(`${name} metrics listener must stay on the private network without published ports`);
      }
    } else if (tokenMounts.length) {
      errors.push(`${name} must not mount ACRES_GARAGE_METRICS_TOKEN_FILE`);
    }
    if (name !== 'garage' &&
        (environmentEntries(service.environment).some(([key, value]) =>
          ['GARAGE_METRICS_TOKEN', 'GARAGE_METRICS_TOKEN_FILE', 'ACRES_GARAGE_METRICS_TOKEN_FILE'].includes(key) ||
          String(value).includes('ACRES_GARAGE_METRICS_TOKEN_FILE') ||
          String(value).includes(TOKEN_PATH)) ||
         (service.env_file || []).some((file) => String(file).includes('garage.production.env')))) {
      errors.push(`${name} must not receive a Garage metrics token environment input`);
    }
  }
  const garage = services.garage || {};
  if (Object.hasOwn(garage, 'env_file')) {
    errors.push('garage must not declare env_file');
  }
  const garageEnvironment = Object.fromEntries(environmentEntries(garage.environment));
  if (garageEnvironment.GARAGE_METRICS_TOKEN_FILE !== TOKEN_PATH ||
      Object.hasOwn(garageEnvironment, 'GARAGE_METRICS_TOKEN') ||
      !garage.expose?.includes('3903') ||
      !JSON.stringify(garage.healthcheck?.test).includes('localhost:3903/health')) {
    errors.push(`garage must use GARAGE_METRICS_TOKEN_FILE=${TOKEN_PATH} and retain private 3903 /health`);
  }
  const jobs = (prom?.scrape_configs || []).filter((job) => job.job_name === 'acres-garage');
  if ((prom?.scrape_configs || []).some((candidate) => candidate.job_name !== 'acres-garage' &&
      JSON.stringify(candidate).includes(TOKEN_PATH))) {
    errors.push(`Prometheus ${TOKEN_PATH} must be scoped to acres-garage only`);
  }
  const job = jobs[0];
  if (jobs.length !== 1 ||
      Object.keys(job || {}).some((key) => !['job_name', 'metrics_path', 'scheme', 'authorization', 'static_configs'].includes(key)) ||
      job?.scheme !== 'http' || job?.metrics_path !== '/metrics' ||
      job?.authorization?.type !== 'Bearer' ||
      job?.authorization?.credentials_file !== TOKEN_PATH ||
      Object.keys(job?.authorization || {}).some((key) => !['type', 'credentials_file'].includes(key)) ||
      JSON.stringify(job?.static_configs) !== JSON.stringify([{ targets: ['garage:3903'] }])) {
    errors.push(`Prometheus acres-garage must scrape private garage:3903/metrics with Bearer credentials_file ${TOKEN_PATH}`);
  }
  if (JSON.stringify(services.caddy || {}).includes('garage:3903') ||
      caddyText.includes('garage:3903') ||
      JSON.stringify(services.grafana || {}).includes(TOKEN_PATH)) {
    errors.push('Garage metrics must not be exposed through Caddy or Grafana');
  }
  return errors;
}

module.exports = { checkGarageMetrics };
