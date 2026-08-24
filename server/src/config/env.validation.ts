import { Logger } from '@nestjs/common';

/**
 * The environment the API needs. Every value is resolved once, at boot, and a
 * missing required one stops the process — a server that starts and then 500s
 * on the first request is harder to diagnose than one that never starts.
 */
export interface AcresEnv {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  clientOrigin: string;
  databaseUrl: string;
  sessionCookieName: string;
  sessionTtlDays: number;
  sessionSecret: string;
  csrfCookieName: string;
  schedulerEnabled: boolean;
  rateLimitTtlMs: number;
  rateLimitDefaultLimit: number;
  rateLimitStrictLimit: number;
  tenancyEnabled: boolean;
  invitationTtlHours: number;
  accountTokenTtlMinutes: number;
  graphqlMaxBytes: number;
  graphqlMaxDepth: number;
  graphqlMaxAliases: number;
  graphqlMaxCost: number;
  graphqlMaxFirst: number;
  graphqlMaxNodes: number;
  graphqlTimeoutMs: number;
  idempotencyTtlHours: number;
  valkeyUrl: string;
  queueName: string;
  queuePrefix: string;
  queueDefaultAttempts: number;
  queueBackoffMs: number;
  queueShutdownMs: number;
  storageEndpoint: string;
  storageRegion: string;
  storageBucket: string;
  storageAccessKeyId: string;
  storageSecretAccessKey: string;
  storageForcePathStyle: boolean;
  presignedUploadTtlSeconds: number;
  acceptedDownloadTtlSeconds: number;
  clamavHost: string;
  clamavPort: number;
  clamavScanTimeoutMs: number;
  uploadMaxBytes: number;
  uploadAcceptedMediaTypes: string[];
  uploadStaleMinutes: number;
  uploadCleanupIntervalMs: number;
  parserMaxRows: number;
  parserMaxColumns: number;
  parserMaxCellChars: number;
  parserMaxSampleRows: number;
  parserMaxGeojsonFeatures: number;
  parserMaxGeojsonCoordinates: number;
  outboxClaimBatchSize: number;
  outboxClaimLeaseMs: number;
  outboxMaxAttempts: number;
}

const REQUIRED = ['DATABASE_URL', 'CLIENT_ORIGIN', 'SESSION_SECRET'] as const;

const DEFAULTS = {
  PORT: '3001',
  SESSION_COOKIE_NAME: 'acres_session',
  SESSION_TTL_DAYS: '30',
  CSRF_COOKIE_NAME: 'acres_csrf',
  SCHEDULER_ENABLED: 'true',
  RATE_LIMIT_TTL_MS: '60000',
  RATE_LIMIT_DEFAULT_LIMIT: '120',
  RATE_LIMIT_STRICT_LIMIT: '10',
  TENANCY_ENABLED: 'false',
  GRAPHQL_MAX_BYTES: '12000',
  GRAPHQL_MAX_DEPTH: '8',
  GRAPHQL_MAX_ALIASES: '12',
  GRAPHQL_MAX_COST: '250',
  GRAPHQL_MAX_FIRST: '50',
  GRAPHQL_MAX_NODES: '250',
  GRAPHQL_TIMEOUT_MS: '5000',
  IDEMPOTENCY_TTL_HOURS: '24',
  VALKEY_URL: 'redis://:acres_valkey_dev_password@localhost:6379/0',
  QUEUE_NAME: 'acres-ingestion',
  QUEUE_PREFIX: 'acres',
  QUEUE_DEFAULT_ATTEMPTS: '5',
  QUEUE_BACKOFF_MS: '30000',
  QUEUE_SHUTDOWN_MS: '15000',
  STORAGE_ENDPOINT: 'http://localhost:3900',
  STORAGE_REGION: 'garage',
  STORAGE_BUCKET: 'acres-quarantine',
  STORAGE_ACCESS_KEY_ID: 'change-me-local-garage-access-key',
  STORAGE_SECRET_ACCESS_KEY: 'change-me-local-garage-secret-key',
  STORAGE_FORCE_PATH_STYLE: 'true',
  PRESIGNED_UPLOAD_TTL_SECONDS: '900',
  ACCEPTED_DOWNLOAD_TTL_SECONDS: '300',
  CLAMAV_HOST: 'localhost',
  CLAMAV_PORT: '3310',
  CLAMAV_SCAN_TIMEOUT_MS: '10000',
  UPLOAD_MAX_BYTES: '52428800',
  UPLOAD_ACCEPTED_MEDIA_TYPES:
    'text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/geo+json,application/json',
  UPLOAD_STALE_MINUTES: '60',
  UPLOAD_CLEANUP_INTERVAL_MS: '300000',
  PARSER_MAX_ROWS: '10000',
  PARSER_MAX_COLUMNS: '200',
  PARSER_MAX_CELL_CHARS: '2000',
  PARSER_MAX_SAMPLE_ROWS: '5',
  PARSER_MAX_GEOJSON_FEATURES: '2500',
  PARSER_MAX_GEOJSON_COORDINATES: '100000',
  OUTBOX_CLAIM_BATCH_SIZE: '25',
  OUTBOX_CLAIM_LEASE_MS: '30000',
  OUTBOX_MAX_ATTEMPTS: '5',
} as const;

function positiveInt(name: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, received "${raw}"`);
  }
  return value;
}

function boolean(name: string, raw: string): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be "true" or "false", received "${raw}"`);
}

function csv(name: string, raw: string): string[] {
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) {
    throw new Error(`${name} must include at least one value`);
  }
  return values;
}

export function validateEnv(raw: Record<string, unknown>): AcresEnv {
  const env = raw as Record<string, string | undefined>;

  const missing = REQUIRED.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy server/.env.example to server/.env and fill them in.',
    );
  }

  const nodeEnv = env.NODE_ENV ?? 'development';
  if (
    nodeEnv !== 'development' &&
    nodeEnv !== 'test' &&
    nodeEnv !== 'production'
  ) {
    throw new Error(
      `NODE_ENV must be development, test or production, received "${nodeEnv}"`,
    );
  }

  const sessionSecret = env.SESSION_SECRET as string;
  if (nodeEnv === 'production' && sessionSecret.startsWith('change-me')) {
    throw new Error(
      'SESSION_SECRET is still the placeholder from server/.env.example. ' +
        'Generate one per environment before running in production.',
    );
  }
  if (sessionSecret.length < 32) {
    new Logger('Config').warn(
      'SESSION_SECRET is shorter than 32 characters; the CSRF HMAC is weaker than intended.',
    );
  }
  if (
    nodeEnv === 'production' &&
    ((env.STORAGE_ACCESS_KEY_ID ?? '').startsWith('change-me') ||
      (env.STORAGE_SECRET_ACCESS_KEY ?? '').startsWith('change-me') ||
      (env.VALKEY_URL ?? DEFAULTS.VALKEY_URL).includes('dev_password'))
  ) {
    throw new Error(
      'Storage/queue credentials still use development placeholders.',
    );
  }

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: positiveInt('PORT', env.PORT ?? DEFAULTS.PORT),
    clientOrigin: env.CLIENT_ORIGIN as string,
    databaseUrl: env.DATABASE_URL as string,
    sessionCookieName: env.SESSION_COOKIE_NAME ?? DEFAULTS.SESSION_COOKIE_NAME,
    sessionTtlDays: positiveInt(
      'SESSION_TTL_DAYS',
      env.SESSION_TTL_DAYS ?? DEFAULTS.SESSION_TTL_DAYS,
    ),
    sessionSecret,
    csrfCookieName: env.CSRF_COOKIE_NAME ?? DEFAULTS.CSRF_COOKIE_NAME,
    schedulerEnabled: boolean(
      'SCHEDULER_ENABLED',
      env.SCHEDULER_ENABLED ?? DEFAULTS.SCHEDULER_ENABLED,
    ),
    rateLimitTtlMs: positiveInt(
      'RATE_LIMIT_TTL_MS',
      env.RATE_LIMIT_TTL_MS ?? DEFAULTS.RATE_LIMIT_TTL_MS,
    ),
    rateLimitDefaultLimit: positiveInt(
      'RATE_LIMIT_DEFAULT_LIMIT',
      env.RATE_LIMIT_DEFAULT_LIMIT ?? DEFAULTS.RATE_LIMIT_DEFAULT_LIMIT,
    ),
    rateLimitStrictLimit: positiveInt(
      'RATE_LIMIT_STRICT_LIMIT',
      env.RATE_LIMIT_STRICT_LIMIT ?? DEFAULTS.RATE_LIMIT_STRICT_LIMIT,
    ),
    tenancyEnabled: boolean(
      'TENANCY_ENABLED',
      env.TENANCY_ENABLED ?? DEFAULTS.TENANCY_ENABLED,
    ),
    invitationTtlHours: positiveInt(
      'INVITATION_TTL_HOURS',
      env.INVITATION_TTL_HOURS ?? '',
    ),
    accountTokenTtlMinutes: positiveInt(
      'ACCOUNT_TOKEN_TTL_MINUTES',
      env.ACCOUNT_TOKEN_TTL_MINUTES ?? '',
    ),
    graphqlMaxBytes: positiveInt(
      'GRAPHQL_MAX_BYTES',
      env.GRAPHQL_MAX_BYTES ?? DEFAULTS.GRAPHQL_MAX_BYTES,
    ),
    graphqlMaxDepth: positiveInt(
      'GRAPHQL_MAX_DEPTH',
      env.GRAPHQL_MAX_DEPTH ?? DEFAULTS.GRAPHQL_MAX_DEPTH,
    ),
    graphqlMaxAliases: positiveInt(
      'GRAPHQL_MAX_ALIASES',
      env.GRAPHQL_MAX_ALIASES ?? DEFAULTS.GRAPHQL_MAX_ALIASES,
    ),
    graphqlMaxCost: positiveInt(
      'GRAPHQL_MAX_COST',
      env.GRAPHQL_MAX_COST ?? DEFAULTS.GRAPHQL_MAX_COST,
    ),
    graphqlMaxFirst: positiveInt(
      'GRAPHQL_MAX_FIRST',
      env.GRAPHQL_MAX_FIRST ?? DEFAULTS.GRAPHQL_MAX_FIRST,
    ),
    graphqlMaxNodes: positiveInt(
      'GRAPHQL_MAX_NODES',
      env.GRAPHQL_MAX_NODES ?? DEFAULTS.GRAPHQL_MAX_NODES,
    ),
    graphqlTimeoutMs: positiveInt(
      'GRAPHQL_TIMEOUT_MS',
      env.GRAPHQL_TIMEOUT_MS ?? DEFAULTS.GRAPHQL_TIMEOUT_MS,
    ),
    idempotencyTtlHours: positiveInt(
      'IDEMPOTENCY_TTL_HOURS',
      env.IDEMPOTENCY_TTL_HOURS ?? DEFAULTS.IDEMPOTENCY_TTL_HOURS,
    ),
    valkeyUrl: env.VALKEY_URL ?? DEFAULTS.VALKEY_URL,
    queueName: env.QUEUE_NAME ?? DEFAULTS.QUEUE_NAME,
    queuePrefix: env.QUEUE_PREFIX ?? DEFAULTS.QUEUE_PREFIX,
    queueDefaultAttempts: positiveInt(
      'QUEUE_DEFAULT_ATTEMPTS',
      env.QUEUE_DEFAULT_ATTEMPTS ?? DEFAULTS.QUEUE_DEFAULT_ATTEMPTS,
    ),
    queueBackoffMs: positiveInt(
      'QUEUE_BACKOFF_MS',
      env.QUEUE_BACKOFF_MS ?? DEFAULTS.QUEUE_BACKOFF_MS,
    ),
    queueShutdownMs: positiveInt(
      'QUEUE_SHUTDOWN_MS',
      env.QUEUE_SHUTDOWN_MS ?? DEFAULTS.QUEUE_SHUTDOWN_MS,
    ),
    storageEndpoint: env.STORAGE_ENDPOINT ?? DEFAULTS.STORAGE_ENDPOINT,
    storageRegion: env.STORAGE_REGION ?? DEFAULTS.STORAGE_REGION,
    storageBucket: env.STORAGE_BUCKET ?? DEFAULTS.STORAGE_BUCKET,
    storageAccessKeyId:
      env.STORAGE_ACCESS_KEY_ID ?? DEFAULTS.STORAGE_ACCESS_KEY_ID,
    storageSecretAccessKey:
      env.STORAGE_SECRET_ACCESS_KEY ?? DEFAULTS.STORAGE_SECRET_ACCESS_KEY,
    storageForcePathStyle: boolean(
      'STORAGE_FORCE_PATH_STYLE',
      env.STORAGE_FORCE_PATH_STYLE ?? DEFAULTS.STORAGE_FORCE_PATH_STYLE,
    ),
    presignedUploadTtlSeconds: positiveInt(
      'PRESIGNED_UPLOAD_TTL_SECONDS',
      env.PRESIGNED_UPLOAD_TTL_SECONDS ?? DEFAULTS.PRESIGNED_UPLOAD_TTL_SECONDS,
    ),
    acceptedDownloadTtlSeconds: positiveInt(
      'ACCEPTED_DOWNLOAD_TTL_SECONDS',
      env.ACCEPTED_DOWNLOAD_TTL_SECONDS ??
        DEFAULTS.ACCEPTED_DOWNLOAD_TTL_SECONDS,
    ),
    clamavHost: env.CLAMAV_HOST ?? DEFAULTS.CLAMAV_HOST,
    clamavPort: positiveInt(
      'CLAMAV_PORT',
      env.CLAMAV_PORT ?? DEFAULTS.CLAMAV_PORT,
    ),
    clamavScanTimeoutMs: positiveInt(
      'CLAMAV_SCAN_TIMEOUT_MS',
      env.CLAMAV_SCAN_TIMEOUT_MS ?? DEFAULTS.CLAMAV_SCAN_TIMEOUT_MS,
    ),
    uploadMaxBytes: positiveInt(
      'UPLOAD_MAX_BYTES',
      env.UPLOAD_MAX_BYTES ?? DEFAULTS.UPLOAD_MAX_BYTES,
    ),
    uploadAcceptedMediaTypes: csv(
      'UPLOAD_ACCEPTED_MEDIA_TYPES',
      env.UPLOAD_ACCEPTED_MEDIA_TYPES ?? DEFAULTS.UPLOAD_ACCEPTED_MEDIA_TYPES,
    ),
    uploadStaleMinutes: positiveInt(
      'UPLOAD_STALE_MINUTES',
      env.UPLOAD_STALE_MINUTES ?? DEFAULTS.UPLOAD_STALE_MINUTES,
    ),
    uploadCleanupIntervalMs: positiveInt(
      'UPLOAD_CLEANUP_INTERVAL_MS',
      env.UPLOAD_CLEANUP_INTERVAL_MS ?? DEFAULTS.UPLOAD_CLEANUP_INTERVAL_MS,
    ),
    parserMaxRows: positiveInt(
      'PARSER_MAX_ROWS',
      env.PARSER_MAX_ROWS ?? DEFAULTS.PARSER_MAX_ROWS,
    ),
    parserMaxColumns: positiveInt(
      'PARSER_MAX_COLUMNS',
      env.PARSER_MAX_COLUMNS ?? DEFAULTS.PARSER_MAX_COLUMNS,
    ),
    parserMaxCellChars: positiveInt(
      'PARSER_MAX_CELL_CHARS',
      env.PARSER_MAX_CELL_CHARS ?? DEFAULTS.PARSER_MAX_CELL_CHARS,
    ),
    parserMaxSampleRows: positiveInt(
      'PARSER_MAX_SAMPLE_ROWS',
      env.PARSER_MAX_SAMPLE_ROWS ?? DEFAULTS.PARSER_MAX_SAMPLE_ROWS,
    ),
    parserMaxGeojsonFeatures: positiveInt(
      'PARSER_MAX_GEOJSON_FEATURES',
      env.PARSER_MAX_GEOJSON_FEATURES ?? DEFAULTS.PARSER_MAX_GEOJSON_FEATURES,
    ),
    parserMaxGeojsonCoordinates: positiveInt(
      'PARSER_MAX_GEOJSON_COORDINATES',
      env.PARSER_MAX_GEOJSON_COORDINATES ??
        DEFAULTS.PARSER_MAX_GEOJSON_COORDINATES,
    ),
    outboxClaimBatchSize: positiveInt(
      'OUTBOX_CLAIM_BATCH_SIZE',
      env.OUTBOX_CLAIM_BATCH_SIZE ?? DEFAULTS.OUTBOX_CLAIM_BATCH_SIZE,
    ),
    outboxClaimLeaseMs: positiveInt(
      'OUTBOX_CLAIM_LEASE_MS',
      env.OUTBOX_CLAIM_LEASE_MS ?? DEFAULTS.OUTBOX_CLAIM_LEASE_MS,
    ),
    outboxMaxAttempts: positiveInt(
      'OUTBOX_MAX_ATTEMPTS',
      env.OUTBOX_MAX_ATTEMPTS ?? DEFAULTS.OUTBOX_MAX_ATTEMPTS,
    ),
  };
}
