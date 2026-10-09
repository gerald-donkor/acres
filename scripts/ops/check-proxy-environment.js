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

const CANDIDATE_PLACEHOLDER =
  /(?:\$(?:\{|\{?\$)[ \t]*|\{[ \t]*\$?[ \t]*)([A-Z][A-Z0-9_]*)\b[^}\r\n]*\}?/g;

function checkProxyEnvironment(compose, caddyfile) {
  if (typeof caddyfile !== 'string') {
    return ['Caddyfile must be text'];
  }
  if (!compose || typeof compose !== 'object' || Array.isArray(compose)) {
    return ['compose must be an object'];
  }

  const errors = [];
  const cleanCaddyfile = caddyfile.replace(/^\uFEFF/, '');
  const canonicalCounts = new Map();
  const totalCounts = new Map();
  const ambiguous = new Set();
  const unexpected = new Set();

  for (const match of cleanCaddyfile.matchAll(CANDIDATE_PLACEHOLDER)) {
    const token = match[0];
    const key = match[1];
    totalCounts.set(key, (totalCounts.get(key) || 0) + 1);
    if (token === `{$${key}}`) {
      canonicalCounts.set(key, (canonicalCounts.get(key) || 0) + 1);
    } else {
      ambiguous.add(key);
    }
    if (!CADDY_KEYS.includes(key)) {
      unexpected.add(key);
    }
  }

  for (const key of CADDY_KEYS) {
    const total = totalCounts.get(key) || 0;
    const canonical = canonicalCounts.get(key) || 0;
    if (canonical === 0) {
      errors.push(`Caddyfile missing ${key} placeholder`);
    } else if (canonical > 1 || total > 1) {
      errors.push(`Caddyfile must define ${key} placeholder exactly once`);
    }
  }

  for (const key of ambiguous) {
    errors.push(`Caddyfile has an ambiguous ${key} placeholder`);
  }

  for (const key of unexpected) {
    errors.push(`Caddyfile has unexpected ${key} placeholder`);
  }

  for (const name of ['caddy', 'next']) {
    const service = compose?.services?.[name];
    if (!service || typeof service !== 'object' || Array.isArray(service)) {
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
      } else if (name === 'caddy') {
        const val = environment[key];
        if (typeof val !== 'string' || !new RegExp(`^\\$\\{${key}:\\?[^}]+\\}$`).test(val)) {
          errors.push(`${name} must require ${key} from the matching Compose input`);
        }
      }
    }
    if (name === 'next') {
      if (environment.NODE_ENV !== 'production') errors.push('next must set NODE_ENV to production');
      if (environment.ACRES_API_ORIGIN !== 'http://api:3001') {
        errors.push('next must use the private API origin');
      }
    }
  }
  return [...new Set(errors)];
}

module.exports = { checkProxyEnvironment };
