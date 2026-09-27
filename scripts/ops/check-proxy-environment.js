const CADDY_KEYS = [
  'ACRES_TLS_CONTACT_EMAIL',
  'ACRES_PRODUCTION_DOMAIN',
  'ACRES_HSTS_MAX_AGE',
  'ACRES_MAX_REQUEST_BODY',
  'ACRES_API_READ_TIMEOUT',
  'ACRES_API_WRITE_TIMEOUT',
  'ACRES_API_DIAL_TIMEOUT',
  'ACRES_NEXT_READ_TIMEOUT',
  'ACRES_NEXT_WRITE_TIMEOUT',
  'ACRES_NEXT_DIAL_TIMEOUT',
  'ACRES_OBJECT_READ_TIMEOUT',
  'ACRES_OBJECT_WRITE_TIMEOUT',
  'ACRES_OBJECT_DIAL_TIMEOUT',
];

function checkProxyEnvironment(compose, caddyfile) {
  const errors = [];
  const placeholders = new Set([...caddyfile.matchAll(/\{\$([A-Z][A-Z0-9_]*)\}/g)].map((match) => match[1]));
  for (const key of CADDY_KEYS) {
    if (!placeholders.has(key)) errors.push(`Caddyfile missing ${key} placeholder`);
  }
  for (const key of placeholders) {
    if (!CADDY_KEYS.includes(key)) errors.push(`Caddyfile has unexpected ${key} placeholder`);
  }

  for (const name of ['caddy', 'next']) {
    const service = compose?.services?.[name];
    if (!service || typeof service !== 'object') {
      errors.push(`compose missing ${name} service`);
      continue;
    }
    if (Object.hasOwn(service, 'env_file')) errors.push(`${name} must not declare env_file`);
    if (Object.hasOwn(service, 'extends')) errors.push(`${name} must not extend another service`);
    const environment = service.environment;
    if (!environment || Array.isArray(environment) || typeof environment !== 'object') {
      errors.push(`${name} must declare an environment map`);
      continue;
    }
    const expected = name === 'caddy' ? CADDY_KEYS : ['NODE_ENV', 'ACRES_API_ORIGIN'];
    for (const key of Object.keys(environment)) {
      if (!expected.includes(key)) errors.push(`${name} has unexpected environment key ${key}`);
    }
    for (const key of expected) {
      if (!Object.hasOwn(environment, key)) {
        errors.push(`${name} missing environment key ${key}`);
      } else if (name === 'caddy' && !new RegExp(`^\\$\\{${key}:\\?[^}]+\\}$`).test(environment[key])) {
        errors.push(`${name} must require ${key} from the matching Compose input`);
      }
    }
    if (name === 'next') {
      if (environment.NODE_ENV !== 'production') errors.push('next must set NODE_ENV to production');
      if (environment.ACRES_API_ORIGIN !== 'http://api:3001') {
        errors.push('next must use the private API origin');
      }
    }
  }
  return errors;
}

module.exports = { checkProxyEnvironment };
