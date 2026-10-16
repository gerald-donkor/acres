import { Logger } from '@nestjs/common';
import { NODE_ENVS, type NodeEnv } from '@acres/shared';
import {
  MAIL_TRANSPORTS,
  type MailTransportKind,
} from '../mail/mail.interface';

/**
 * The environment the API needs. Every value is resolved once, at boot, and a
 * missing required one stops the process — a server that starts and then 500s
 * on the first request is harder to diagnose than one that never starts.
 */
export interface AcresEnv {
  nodeEnv: NodeEnv;
  isProduction: boolean;
  port: number;
  workerMetricsHost: string;
  workerMetricsPort: number;
  clientOrigin: string;
  databaseUrl: string;
  sessionCookieName: string;
  sessionTtlDays: number;
  sessionSecret: string;
  csrfSecret: string;
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
  queueProvider: QueueProvider;
  valkeyUrl: string;
  queueName: string;
  queuePrefix: string;
  queueDefaultAttempts: number;
  queueBackoffMs: number;
  queueShutdownMs: number;
  vercelQueueTopic: string;
  vercelQueueRegion: string;
  vercelQueueRetentionSeconds: number;
  vercelDeploymentId?: string;
  /** Optional Vercel Cron secret (Authorization: Bearer); ≥32 chars. Never logged. */
  cronSecret?: string;
  jobLeaseMs: number;
  storageProvider: StorageProvider;
  /** Vercel Blob store id; required when `storageProvider` is `vercel-blob`. */
  blobStoreId?: string;
  /** Optional off-Vercel fallback; on Vercel the SDK uses OIDC. Never logged. */
  blobReadWriteToken?: string;
  storageEndpoint: string;
  storageRegion: string;
  storageBucket: string;
  storageAccessKeyId: string;
  storageSecretAccessKey: string;
  storageForcePathStyle: boolean;
  presignedUploadTtlSeconds: number;
  acceptedDownloadTtlSeconds: number;
  scannerProvider: ScannerProvider;
  /** Sandbox snapshot id (`snap_…`); required when `scannerProvider` is `vercel-sandbox`. */
  scannerSandboxSnapshotId?: string;
  scannerMainSha256?: string;
  scannerDailySha256?: string;
  scannerMaxSignatureAgeHours?: number;
  scannerSandboxTimeoutMs?: number;
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
  parserChildTimeoutMs: number;
  parserChildMaxOldSpaceMb: number;
  outboxClaimBatchSize: number;
  outboxClaimLeaseMs: number;
  outboxMaxAttempts: number;
  aiDraftEnabled: boolean;
  aiDraftProviderTierUnpaidAcknowledged: boolean;
  geminiApiKey?: string;
  aiDraftModel: string;
  aiDraftTimeoutMs: number;
  aiDraftMaxProposals: number;
  aiDraftMaxContextBytes: number;
  aiDraftMaxOutputTokens: number;
  mailTransport: MailTransportKind;
  resendApiKey?: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPass?: string;
  mailFrom: string;
}

export const QUEUE_PROVIDERS = ['bullmq', 'vercel'] as const;
export type QueueProvider = (typeof QUEUE_PROVIDERS)[number];
export const STORAGE_PROVIDERS = ['s3', 'vercel-blob'] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];
export const SCANNER_PROVIDERS = ['clamav', 'vercel-sandbox'] as const;
export type ScannerProvider = (typeof SCANNER_PROVIDERS)[number];
/** The Sandbox scan flags cover 50 MiB; a larger upload limit is refused. */
export const SCANNER_SANDBOX_MAX_BYTES = 50 * 1024 * 1024;
/** Same form the probe accepts. Not a content hash: the CVD hashes are the pin. */
const SCANNER_SANDBOX_SNAPSHOT_ID = /^snap_[A-Za-z0-9]+$/;
/** S3-only variables; a set value alongside `vercel-blob` is a mixed profile. */
const S3_STORAGE_KEYS = [
  'STORAGE_ENDPOINT',
  'STORAGE_REGION',
  'STORAGE_BUCKET',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
  'STORAGE_FORCE_PATH_STYLE',
] as const;

const SHARED_REQUIRED = ['DATABASE_URL'] as const;
const API_REQUIRED = [
  'CLIENT_ORIGIN',
  'SESSION_SECRET',
  'CSRF_SECRET',
] as const;

const DEFAULTS = {
  PORT: '3001',
  WORKER_METRICS_HOST: '127.0.0.1',
  WORKER_METRICS_PORT: '3002',
  SESSION_COOKIE_NAME: 'acres_session',
  SESSION_TTL_DAYS: '30',
  CSRF_COOKIE_NAME: 'acres_csrf',
  SCHEDULER_ENABLED: 'true',
  RATE_LIMIT_TTL_MS: '60000',
  RATE_LIMIT_DEFAULT_LIMIT: '120',
  RATE_LIMIT_STRICT_LIMIT: '10',
  TENANCY_ENABLED: 'false',
  INVITATION_TTL_HOURS: '24',
  ACCOUNT_TOKEN_TTL_MINUTES: '30',
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
  QUEUE_PROVIDER: 'bullmq',
  VERCEL_QUEUE_TOPIC: 'acres-jobs',
  VERCEL_QUEUE_REGION: 'iad1',
  VERCEL_QUEUE_RETENTION_SECONDS: '86400',
  JOB_LEASE_MS: '330000',
  STORAGE_PROVIDER: 's3',
  SCANNER_PROVIDER: 'clamav',
  SCANNER_SANDBOX_TIMEOUT_MS: '120000',
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
  PARSER_CHILD_TIMEOUT_MS: '15000',
  PARSER_CHILD_MAX_OLD_SPACE_MB: '192',
  OUTBOX_CLAIM_BATCH_SIZE: '25',
  OUTBOX_CLAIM_LEASE_MS: '30000',
  OUTBOX_MAX_ATTEMPTS: '5',
  AI_DRAFT_ENABLED: 'false',
  AI_DRAFT_PROVIDER_TIER_UNPAID_ACKNOWLEDGED: 'false',
  AI_DRAFT_MODEL: 'gemini-2.5-flash',
  AI_DRAFT_TIMEOUT_MS: '15000',
  AI_DRAFT_MAX_PROPOSALS: '3',
  AI_DRAFT_MAX_CONTEXT_BYTES: '16384',
  AI_DRAFT_MAX_OUTPUT_TOKENS: '2048',
  MAIL_TRANSPORT: 'smtp',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_SECURE: 'false',
  MAIL_FROM: 'Acres <no-reply@acres.local>',
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

function workerMetricsHost(raw: string): string {
  if (raw !== '127.0.0.1' && raw !== '0.0.0.0') {
    throw new Error('WORKER_METRICS_HOST must be 127.0.0.1 or 0.0.0.0');
  }
  return raw;
}

function workerMetricsPort(raw: string): number {
  if (!/^[0-9]+$/.test(raw))
    throw new Error('WORKER_METRICS_PORT must be an integer from 1 to 65535');
  const port = Number(raw);
  if (port < 1 || port > 65535)
    throw new Error('WORKER_METRICS_PORT must be an integer from 1 to 65535');
  return port;
}

export function isUsableCronSecret(value: string | undefined): value is string {
  if (typeof value !== 'string') return false;
  if (value.trim() !== value) return false;
  if (value.length < 32) return false;
  if (value.startsWith('change-me') || value.startsWith('__REQUIRED_')) {
    return false;
  }
  return true;
}

export function validateEnv(
  raw: Record<string, unknown>,
  worker = false,
): AcresEnv {
  const env = raw as Record<string, string | undefined>;

  const missing = [...SHARED_REQUIRED, ...(worker ? [] : API_REQUIRED)].filter(
    (key) => !env[key],
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy server/.env.example to server/.env and fill them in.',
    );
  }

  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!NODE_ENVS.includes(nodeEnv as NodeEnv)) {
    throw new Error(
      `NODE_ENV must be development, test or production, received "${nodeEnv}"`,
    );
  }

  const sessionSecret = worker
    ? ((env.SESSION_SECRET as string) ?? '')
    : (env.SESSION_SECRET as string);
  const clientOrigin = worker
    ? ((env.CLIENT_ORIGIN as string) ?? '')
    : (env.CLIENT_ORIGIN as string);
  const csrfSecret = worker ? '' : (env.CSRF_SECRET as string);

  if (!worker) {
    if (nodeEnv === 'production' && sessionSecret.startsWith('change-me')) {
      throw new Error(
        'SESSION_SECRET is still the placeholder from server/.env.example. ' +
          'Generate one per environment before running in production.',
      );
    }
    if (nodeEnv === 'production' && sessionSecret.length < 32) {
      throw new Error(
        'SESSION_SECRET must be at least 32 characters in production.',
      );
    }
    if (sessionSecret.length < 32) {
      new Logger('Config').warn(
        'SESSION_SECRET is shorter than 32 characters; the cursor HMAC is weaker than intended.',
      );
    }
    if (
      nodeEnv === 'production' &&
      (csrfSecret.startsWith('change-me') ||
        csrfSecret.startsWith('__REQUIRED_'))
    ) {
      throw new Error('CSRF_SECRET cannot use a placeholder in production.');
    }
    if (nodeEnv === 'production' && csrfSecret.length < 32) {
      throw new Error(
        'CSRF_SECRET must be at least 32 characters in production.',
      );
    }
    if (nodeEnv === 'production' && csrfSecret === sessionSecret) {
      throw new Error(
        'CSRF_SECRET must differ from SESSION_SECRET in production.',
      );
    }
    if (csrfSecret.length < 32) {
      new Logger('Config').warn(
        'CSRF_SECRET is shorter than 32 characters; the CSRF HMAC is weaker than intended.',
      );
    }
  }
  const rawQueueProvider = env.QUEUE_PROVIDER ?? DEFAULTS.QUEUE_PROVIDER;
  if (!(QUEUE_PROVIDERS as readonly string[]).includes(rawQueueProvider)) {
    throw new Error(
      `QUEUE_PROVIDER must be "bullmq" or "vercel", received "${rawQueueProvider}"`,
    );
  }
  const queueProvider = rawQueueProvider as QueueProvider;
  const vercelQueueTopic =
    env.VERCEL_QUEUE_TOPIC ?? DEFAULTS.VERCEL_QUEUE_TOPIC;
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(vercelQueueTopic)) {
    throw new Error(
      'VERCEL_QUEUE_TOPIC must be 1-63 lowercase letters, digits or hyphens.',
    );
  }
  const vercelQueueRegion =
    env.VERCEL_QUEUE_REGION ?? DEFAULTS.VERCEL_QUEUE_REGION;
  if (!/^[a-z]{2,5}[0-9]{1,2}$/.test(vercelQueueRegion)) {
    throw new Error(
      'VERCEL_QUEUE_REGION must be a Vercel region such as iad1.',
    );
  }
  const vercelQueueRetentionSeconds = positiveInt(
    'VERCEL_QUEUE_RETENTION_SECONDS',
    env.VERCEL_QUEUE_RETENTION_SECONDS ??
      DEFAULTS.VERCEL_QUEUE_RETENTION_SECONDS,
  );
  if (
    vercelQueueRetentionSeconds < 60 ||
    vercelQueueRetentionSeconds > 604800
  ) {
    throw new Error(
      'VERCEL_QUEUE_RETENTION_SECONDS must be between 60 and 604800.',
    );
  }
  const jobLeaseMs = positiveInt(
    'JOB_LEASE_MS',
    env.JOB_LEASE_MS ?? DEFAULTS.JOB_LEASE_MS,
  );
  // Leases are not renewed, so one must outlive a whole invocation (300 s
  // Hobby maximum) plus the observed ~300 s crash redelivery.
  if (jobLeaseMs < 305000 || jobLeaseMs > 3600000) {
    throw new Error('JOB_LEASE_MS must be between 305000 and 3600000.');
  }
  const vercelDeploymentId = env.VERCEL_DEPLOYMENT_ID?.trim() || undefined;
  let cronSecret: string | undefined;
  if (env.CRON_SECRET !== undefined) {
    if (!isUsableCronSecret(env.CRON_SECRET)) {
      throw new Error(
        'CRON_SECRET must be at least 32 characters and not a placeholder.',
      );
    }
    if (
      (env.SESSION_SECRET !== undefined &&
        env.CRON_SECRET === env.SESSION_SECRET) ||
      (env.CSRF_SECRET !== undefined && env.CRON_SECRET === env.CSRF_SECRET)
    ) {
      throw new Error(
        'CRON_SECRET must differ from SESSION_SECRET and CSRF_SECRET.',
      );
    }
    cronSecret = env.CRON_SECRET;
  }
  if (queueProvider === 'vercel' && env.VALKEY_URL !== undefined) {
    // A Vercel profile never talks to Valkey; a set URL means a mixed profile.
    throw new Error('VALKEY_URL must be unset when QUEUE_PROVIDER="vercel".');
  }

  const rawStorageProvider = env.STORAGE_PROVIDER ?? DEFAULTS.STORAGE_PROVIDER;
  if (!(STORAGE_PROVIDERS as readonly string[]).includes(rawStorageProvider)) {
    throw new Error(
      `STORAGE_PROVIDER must be "s3" or "vercel-blob", received "${rawStorageProvider}"`,
    );
  }
  const storageProvider = rawStorageProvider as StorageProvider;
  let blobStoreId: string | undefined;
  let blobReadWriteToken: string | undefined;
  if (storageProvider === 'vercel-blob') {
    blobStoreId = env.BLOB_STORE_ID?.trim();
    if (!blobStoreId || !/^store_[A-Za-z0-9]+$/.test(blobStoreId)) {
      throw new Error(
        'BLOB_STORE_ID must be a Vercel Blob store id (store_…) when STORAGE_PROVIDER="vercel-blob".',
      );
    }
    for (const key of S3_STORAGE_KEYS) {
      if (env[key] !== undefined) {
        // A Blob profile never talks to S3; a set value means a mixed profile.
        throw new Error(
          `${key} must be unset when STORAGE_PROVIDER="vercel-blob".`,
        );
      }
    }
    blobReadWriteToken = env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;
    if (
      blobReadWriteToken !== undefined &&
      !blobReadWriteToken.startsWith('vercel_blob_rw_')
    ) {
      // Never echo the value: it is a credential.
      throw new Error(
        'BLOB_READ_WRITE_TOKEN must be a Vercel Blob read-write token.',
      );
    }
    // The SDK takes the store from the token (vercel_blob_rw_<store>_<secret>)
    // and lets an explicit token win over OIDC, so a token for another store
    // would write there while StoredObject.bucket records BLOB_STORE_ID.
    if (
      blobReadWriteToken !== undefined &&
      blobReadWriteToken.split('_')[3] !== blobStoreId.slice('store_'.length)
    ) {
      throw new Error(
        'BLOB_READ_WRITE_TOKEN belongs to a different store than BLOB_STORE_ID.',
      );
    }
  }

  const rawScannerProvider = env.SCANNER_PROVIDER ?? DEFAULTS.SCANNER_PROVIDER;
  if (!(SCANNER_PROVIDERS as readonly string[]).includes(rawScannerProvider)) {
    throw new Error(
      `SCANNER_PROVIDER must be "clamav" or "vercel-sandbox", received "${rawScannerProvider}"`,
    );
  }
  const scannerProvider = rawScannerProvider as ScannerProvider;
  let scannerSandbox:
    | Pick<
        AcresEnv,
        | 'scannerSandboxSnapshotId'
        | 'scannerMainSha256'
        | 'scannerDailySha256'
        | 'scannerMaxSignatureAgeHours'
        | 'scannerSandboxTimeoutMs'
      >
    | undefined;
  if (scannerProvider === 'vercel-sandbox') {
    for (const key of ['CLAMAV_HOST', 'CLAMAV_PORT'] as const) {
      if (env[key] !== undefined) {
        // A Sandbox profile never talks to clamd; a set value means a mixed profile.
        throw new Error(
          `${key} must be unset when SCANNER_PROVIDER="vercel-sandbox".`,
        );
      }
    }
    const snapshotId = env.SCANNER_SANDBOX_SNAPSHOT_ID?.trim() ?? '';
    if (!SCANNER_SANDBOX_SNAPSHOT_ID.test(snapshotId)) {
      throw new Error(
        'SCANNER_SANDBOX_SNAPSHOT_ID must be a Vercel Sandbox snapshot id (snap_…) when SCANNER_PROVIDER="vercel-sandbox".',
      );
    }
    const hashes = {} as Record<
      'SCANNER_MAIN_SHA256' | 'SCANNER_DAILY_SHA256',
      string
    >;
    for (const key of [
      'SCANNER_MAIN_SHA256',
      'SCANNER_DAILY_SHA256',
    ] as const) {
      const value = env[key]?.trim() ?? '';
      if (!/^[a-f0-9]{64}$/.test(value)) {
        throw new Error(`${key} must be a lowercase SHA-256 hex digest.`);
      }
      hashes[key] = value;
    }
    const rawAge = env.SCANNER_MAX_SIGNATURE_AGE_HOURS;
    if (
      rawAge === undefined ||
      !/^[1-9][0-9]*$/.test(rawAge) ||
      Number(rawAge) > 168
    ) {
      throw new Error(
        'SCANNER_MAX_SIGNATURE_AGE_HOURS must be an integer from 1 to 168.',
      );
    }
    const timeoutMs = positiveInt(
      'SCANNER_SANDBOX_TIMEOUT_MS',
      env.SCANNER_SANDBOX_TIMEOUT_MS ?? DEFAULTS.SCANNER_SANDBOX_TIMEOUT_MS,
    );
    if (timeoutMs < 30000 || timeoutMs > 600000) {
      throw new Error(
        'SCANNER_SANDBOX_TIMEOUT_MS must be between 30000 and 600000.',
      );
    }
    const uploadMaxBytes = positiveInt(
      'UPLOAD_MAX_BYTES',
      env.UPLOAD_MAX_BYTES ?? DEFAULTS.UPLOAD_MAX_BYTES,
    );
    if (uploadMaxBytes > SCANNER_SANDBOX_MAX_BYTES) {
      throw new Error(
        `UPLOAD_MAX_BYTES must not exceed ${SCANNER_SANDBOX_MAX_BYTES} when SCANNER_PROVIDER="vercel-sandbox".`,
      );
    }
    scannerSandbox = {
      scannerSandboxSnapshotId: snapshotId,
      scannerMainSha256: hashes.SCANNER_MAIN_SHA256,
      scannerDailySha256: hashes.SCANNER_DAILY_SHA256,
      scannerMaxSignatureAgeHours: Number(rawAge),
      scannerSandboxTimeoutMs: timeoutMs,
    };
  }

  if (
    nodeEnv === 'production' &&
    ((storageProvider === 's3' &&
      ((env.STORAGE_ACCESS_KEY_ID ?? '').startsWith('change-me') ||
        (env.STORAGE_SECRET_ACCESS_KEY ?? '').startsWith('change-me'))) ||
      (queueProvider === 'bullmq' &&
        (env.VALKEY_URL ?? DEFAULTS.VALKEY_URL).includes('dev_password')))
  ) {
    throw new Error(
      'Storage/queue credentials still use development placeholders.',
    );
  }

  const aiDraftEnabled = boolean(
    'AI_DRAFT_ENABLED',
    env.AI_DRAFT_ENABLED ?? DEFAULTS.AI_DRAFT_ENABLED,
  );
  const aiDraftProviderTierUnpaidAcknowledged = boolean(
    'AI_DRAFT_PROVIDER_TIER_UNPAID_ACKNOWLEDGED',
    env.AI_DRAFT_PROVIDER_TIER_UNPAID_ACKNOWLEDGED ??
      DEFAULTS.AI_DRAFT_PROVIDER_TIER_UNPAID_ACKNOWLEDGED,
  );
  const geminiApiKey = env.GEMINI_API_KEY?.trim() || undefined;
  const aiDraftModel = env.AI_DRAFT_MODEL?.trim() || DEFAULTS.AI_DRAFT_MODEL;
  const aiDraftTimeoutMs = positiveInt(
    'AI_DRAFT_TIMEOUT_MS',
    env.AI_DRAFT_TIMEOUT_MS ?? DEFAULTS.AI_DRAFT_TIMEOUT_MS,
  );
  const aiDraftMaxProposals = positiveInt(
    'AI_DRAFT_MAX_PROPOSALS',
    env.AI_DRAFT_MAX_PROPOSALS ?? DEFAULTS.AI_DRAFT_MAX_PROPOSALS,
  );
  const aiDraftMaxContextBytes = positiveInt(
    'AI_DRAFT_MAX_CONTEXT_BYTES',
    env.AI_DRAFT_MAX_CONTEXT_BYTES ?? DEFAULTS.AI_DRAFT_MAX_CONTEXT_BYTES,
  );
  const aiDraftMaxOutputTokens = positiveInt(
    'AI_DRAFT_MAX_OUTPUT_TOKENS',
    env.AI_DRAFT_MAX_OUTPUT_TOKENS ?? DEFAULTS.AI_DRAFT_MAX_OUTPUT_TOKENS,
  );

  if (aiDraftEnabled) {
    if (!aiDraftProviderTierUnpaidAcknowledged) {
      throw new Error(
        'AI_DRAFT_ENABLED requires AI_DRAFT_PROVIDER_TIER_UNPAID_ACKNOWLEDGED="true" to acknowledge the unpaid Gemini Developer API terms.',
      );
    }
    if (!geminiApiKey) {
      throw new Error(
        'GEMINI_API_KEY is required when AI_DRAFT_ENABLED="true".',
      );
    }
    if (nodeEnv === 'production' && geminiApiKey.startsWith('change-me')) {
      throw new Error('GEMINI_API_KEY cannot use a placeholder in production.');
    }
    if (!aiDraftModel) {
      throw new Error(
        'AI_DRAFT_MODEL is required when AI_DRAFT_ENABLED="true".',
      );
    }
    if (aiDraftMaxProposals > 5) {
      throw new Error('AI_DRAFT_MAX_PROPOSALS must be <= 5.');
    }
    if (aiDraftTimeoutMs < 1000 || aiDraftTimeoutMs > 60000) {
      throw new Error('AI_DRAFT_TIMEOUT_MS must be between 1000 and 60000 ms.');
    }
  }

  const rawTransport =
    env.MAIL_TRANSPORT ??
    (nodeEnv === 'test' ? 'memory' : DEFAULTS.MAIL_TRANSPORT);
  if (!(MAIL_TRANSPORTS as readonly string[]).includes(rawTransport)) {
    throw new Error(
      `MAIL_TRANSPORT must be "smtp", "memory" or "resend", received "${rawTransport}"`,
    );
  }
  const mailTransport: MailTransportKind = rawTransport as MailTransportKind;
  const smtpHost = env.SMTP_HOST ?? DEFAULTS.SMTP_HOST;
  const smtpPort = positiveInt(
    'SMTP_PORT',
    env.SMTP_PORT ?? DEFAULTS.SMTP_PORT,
  );
  const smtpSecure = boolean(
    'SMTP_SECURE',
    env.SMTP_SECURE ?? DEFAULTS.SMTP_SECURE,
  );
  const smtpUser = env.SMTP_USER?.trim() || undefined;
  const smtpPass = env.SMTP_PASS?.trim() || undefined;
  const mailFrom = env.MAIL_FROM?.trim() || DEFAULTS.MAIL_FROM;
  const resendApiKey = env.RESEND_API_KEY?.trim() || undefined;
  if (mailTransport === 'resend') {
    if (!resendApiKey || !/^re_[A-Za-z0-9_-]+$/.test(resendApiKey)) {
      throw new Error(
        'RESEND_API_KEY is required and must be a Resend API key when MAIL_TRANSPORT="resend".',
      );
    }
    if (
      !env.MAIL_FROM?.trim() ||
      /[\r\n]/.test(env.MAIL_FROM) ||
      mailFrom === DEFAULTS.MAIL_FROM
    ) {
      throw new Error(
        'MAIL_FROM must explicitly name the verified sender when MAIL_TRANSPORT="resend".',
      );
    }
  }

  return {
    nodeEnv: nodeEnv as NodeEnv,
    isProduction: nodeEnv === 'production',
    port: positiveInt('PORT', env.PORT ?? DEFAULTS.PORT),
    workerMetricsHost: workerMetricsHost(
      env.WORKER_METRICS_HOST ?? DEFAULTS.WORKER_METRICS_HOST,
    ),
    workerMetricsPort: workerMetricsPort(
      env.WORKER_METRICS_PORT ?? DEFAULTS.WORKER_METRICS_PORT,
    ),
    clientOrigin,
    databaseUrl: env.DATABASE_URL as string,
    sessionCookieName: env.SESSION_COOKIE_NAME ?? DEFAULTS.SESSION_COOKIE_NAME,
    sessionTtlDays: positiveInt(
      'SESSION_TTL_DAYS',
      env.SESSION_TTL_DAYS ?? DEFAULTS.SESSION_TTL_DAYS,
    ),
    sessionSecret,
    csrfSecret,
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
      env.INVITATION_TTL_HOURS ?? DEFAULTS.INVITATION_TTL_HOURS,
    ),
    accountTokenTtlMinutes: positiveInt(
      'ACCOUNT_TOKEN_TTL_MINUTES',
      env.ACCOUNT_TOKEN_TTL_MINUTES ?? DEFAULTS.ACCOUNT_TOKEN_TTL_MINUTES,
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
    queueProvider,
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
    vercelQueueTopic,
    vercelQueueRegion,
    vercelQueueRetentionSeconds,
    vercelDeploymentId,
    cronSecret,
    jobLeaseMs,
    storageProvider,
    blobStoreId,
    blobReadWriteToken,
    storageEndpoint: env.STORAGE_ENDPOINT ?? DEFAULTS.STORAGE_ENDPOINT,
    storageRegion: env.STORAGE_REGION ?? DEFAULTS.STORAGE_REGION,
    // In the Blob profile this records which store holds each StoredObject.
    storageBucket: blobStoreId ?? env.STORAGE_BUCKET ?? DEFAULTS.STORAGE_BUCKET,
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
    scannerProvider,
    ...scannerSandbox,
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
    parserChildTimeoutMs: (() => {
      const val = positiveInt(
        'PARSER_CHILD_TIMEOUT_MS',
        env.PARSER_CHILD_TIMEOUT_MS ?? DEFAULTS.PARSER_CHILD_TIMEOUT_MS,
      );
      if (val < 1000 || val > 60000) {
        throw new Error(
          'PARSER_CHILD_TIMEOUT_MS must be between 1000 and 60000 ms.',
        );
      }
      return val;
    })(),
    parserChildMaxOldSpaceMb: (() => {
      const val = positiveInt(
        'PARSER_CHILD_MAX_OLD_SPACE_MB',
        env.PARSER_CHILD_MAX_OLD_SPACE_MB ??
          DEFAULTS.PARSER_CHILD_MAX_OLD_SPACE_MB,
      );
      if (val < 32 || val > 1024) {
        throw new Error(
          'PARSER_CHILD_MAX_OLD_SPACE_MB must be between 32 and 1024 MB.',
        );
      }
      return val;
    })(),
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
    aiDraftEnabled,
    aiDraftProviderTierUnpaidAcknowledged,
    geminiApiKey,
    aiDraftModel,
    aiDraftTimeoutMs,
    aiDraftMaxProposals,
    aiDraftMaxContextBytes,
    aiDraftMaxOutputTokens,
    mailTransport,
    resendApiKey,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    mailFrom,
  };
}
