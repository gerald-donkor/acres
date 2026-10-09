// These are the production inputs read by the API and worker module graphs.
// Keep this inventory independent of Compose so an added key cannot self-approve.
const SHARED = `DATABASE_URL VALKEY_URL
QUEUE_NAME QUEUE_PREFIX QUEUE_DEFAULT_ATTEMPTS QUEUE_BACKOFF_MS
STORAGE_ENDPOINT STORAGE_REGION STORAGE_BUCKET STORAGE_ACCESS_KEY_ID STORAGE_SECRET_ACCESS_KEY
STORAGE_FORCE_PATH_STYLE PRESIGNED_UPLOAD_TTL_SECONDS ACCEPTED_DOWNLOAD_TTL_SECONDS
PARSER_MAX_ROWS PARSER_MAX_COLUMNS
PARSER_MAX_CELL_CHARS PARSER_MAX_SAMPLE_ROWS PARSER_MAX_GEOJSON_FEATURES
PARSER_MAX_GEOJSON_COORDINATES PARSER_CHILD_TIMEOUT_MS PARSER_CHILD_MAX_OLD_SPACE_MB
OUTBOX_CLAIM_BATCH_SIZE OUTBOX_CLAIM_LEASE_MS OUTBOX_MAX_ATTEMPTS`.trim().split(/\s+/);
const API_ONLY = `CLIENT_ORIGIN SESSION_SECRET TENANCY_ENABLED
SESSION_COOKIE_NAME SESSION_TTL_DAYS CSRF_SECRET CSRF_COOKIE_NAME
RATE_LIMIT_TTL_MS RATE_LIMIT_DEFAULT_LIMIT RATE_LIMIT_STRICT_LIMIT
INVITATION_TTL_HOURS ACCOUNT_TOKEN_TTL_MINUTES GRAPHQL_MAX_BYTES
GRAPHQL_MAX_DEPTH GRAPHQL_MAX_ALIASES GRAPHQL_MAX_COST GRAPHQL_MAX_FIRST
GRAPHQL_MAX_NODES GRAPHQL_TIMEOUT_MS IDEMPOTENCY_TTL_HOURS UPLOAD_MAX_BYTES
UPLOAD_ACCEPTED_MEDIA_TYPES UPLOAD_STALE_MINUTES
SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_SECURE MAIL_FROM`.trim().split(/\s+/);
const FIXED = {
  api: { NODE_ENV: 'production', PORT: '3001', SCHEDULER_ENABLED: 'false', AI_DRAFT_ENABLED: 'false' },
  worker: {
    NODE_ENV: 'production', SCHEDULER_ENABLED: 'true',
    WORKER_METRICS_HOST: '0.0.0.0', WORKER_METRICS_PORT: '3002', AI_DRAFT_ENABLED: 'false',
  },
};

const WATCHED_KEY =
  /^(?:\s*export\s+)?\s*([A-Z][A-Z0-9_]*)(?=$|[^A-Za-z0-9_])/;

function checkApplicationEnvironment(compose, inputText) {
  if (typeof inputText !== 'string') {
    return ['production.env.example must be text'];
  }
  if (!compose || typeof compose !== 'object' || Array.isArray(compose)) {
    return ['compose must be an object'];
  }

  const errors = [];
  const canonicalCounts = new Map();
  const totalCounts = new Map();
  const ambiguous = new Set();

  const cleanText = inputText.replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/);

  for (const line of lines) {
    if (/^\s*(?:#|$)/.test(line)) continue;
    const match = line.match(WATCHED_KEY);
    if (!match) continue;
    const key = match[1];
    totalCounts.set(key, (totalCounts.get(key) || 0) + 1);
    if (line.startsWith(`${key}=`) && !/^\s/.test(line[key.length + 1] || '')) {
      canonicalCounts.set(key, (canonicalCounts.get(key) || 0) + 1);
    } else {
      ambiguous.add(key);
    }
  }

  const csrfPlaceholder = ['__', 'REQUIRED_SECRET_CSRF_SECRET_32_BYTES_MINIMUM', '__'].join('');
  if (!lines.includes(`CSRF_SECRET=${csrfPlaceholder}`)) {
    errors.push('production.env.example must retain the unresolved CSRF_SECRET placeholder');
  }

  for (const name of ['api', 'worker']) {
    const service = compose?.services?.[name];
    if (!service || typeof service !== 'object' || Array.isArray(service)) {
      errors.push(`compose missing ${name} service`);
      continue;
    }
    if (Object.hasOwn(service, 'env_file')) errors.push(`${name} must not declare env_file`);
    if (Object.hasOwn(service, 'extends')) errors.push(`${name} must not extend another service`);
    const env = service.environment;
    if (!env || typeof env !== 'object' || Array.isArray(env)) {
      errors.push(`${name} must declare an environment map`);
      continue;
    }
    const expected = new Set([...Object.keys(FIXED[name]), ...SHARED,
      ...(name === 'api' ? API_ONLY : [
        'CLAMAV_HOST', 'CLAMAV_PORT', 'CLAMAV_SCAN_TIMEOUT_MS', 'UPLOAD_CLEANUP_INTERVAL_MS',
      ])]);
    for (const key of Object.keys(env)) {
      if (!expected.has(key)) errors.push(`${name} has unexpected environment key ${key}`);
    }
    for (const key of expected) {
      if (!Object.hasOwn(env, key)) {
        errors.push(`${name} missing environment key ${key}`);
      } else if (Object.hasOwn(FIXED[name], key)) {
        if (env[key] !== FIXED[name][key]) errors.push(`${name} must set ${key} to its fixed value`);
      } else {
        if (typeof env[key] !== 'string' || !new RegExp(`^\\$\\{${key}:\\?[^}]+\\}$`).test(env[key])) {
          errors.push(`${name} must require ${key} from the matching Compose input`);
        }
        if (canonicalCounts.get(key) !== 1 || (totalCounts.get(key) || 0) > 1) {
          errors.push(`production.env.example must define ${key} exactly once`);
        }
      }
    }
  }

  for (const key of ambiguous) {
    errors.push(`production.env.example has an ambiguous ${key} assignment`);
  }

  return [...new Set(errors)];
}

module.exports = { checkApplicationEnvironment };
