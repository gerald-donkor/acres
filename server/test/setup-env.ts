/**
 * `ConfigModule.forRoot()` validates the environment while `app.module.ts` is
 * being imported, which happens before any `beforeEach` runs. The values have
 * to be in place first, so they are set from `setupFiles`.
 */
process.env.NODE_ENV = 'test';
process.env.PORT = '3999';
process.env.CLIENT_ORIGIN = 'http://localhost:3000';
process.env.DATABASE_URL =
  'postgresql://acres_test:acres_test_dev_password@localhost:5432/acres_test?schema=public';
process.env.SESSION_COOKIE_NAME = 'acres_session';
process.env.SESSION_TTL_DAYS = '30';
process.env.SESSION_SECRET = 'test-secret-that-is-at-least-32-characters';
process.env.CSRF_COOKIE_NAME = 'acres_csrf';
process.env.SCHEDULER_ENABLED = 'false';
process.env.RATE_LIMIT_TTL_MS = '60000';
process.env.RATE_LIMIT_DEFAULT_LIMIT = '1000';
process.env.RATE_LIMIT_STRICT_LIMIT = '1000';
process.env.TENANCY_ENABLED = 'true';
process.env.INVITATION_TTL_HOURS = '24';
process.env.ACCOUNT_TOKEN_TTL_MINUTES = '30';
process.env.GRAPHQL_MAX_BYTES = '12000';
process.env.GRAPHQL_MAX_DEPTH = '8';
process.env.GRAPHQL_MAX_ALIASES = '12';
process.env.GRAPHQL_MAX_COST = '250';
process.env.GRAPHQL_MAX_FIRST = '50';
process.env.GRAPHQL_MAX_NODES = '250';
process.env.GRAPHQL_TIMEOUT_MS = '5000';
process.env.IDEMPOTENCY_TTL_HOURS = '24';
process.env.VALKEY_URL = 'redis://:acres_valkey_dev_password@localhost:6379/0';
process.env.QUEUE_NAME = 'acres-ingestion';
process.env.QUEUE_PREFIX = 'acres-test';
process.env.QUEUE_DEFAULT_ATTEMPTS = '5';
process.env.QUEUE_BACKOFF_MS = '30000';
process.env.QUEUE_SHUTDOWN_MS = '15000';
process.env.STORAGE_ENDPOINT = 'http://localhost:3900';
process.env.STORAGE_REGION = 'garage';
process.env.STORAGE_BUCKET = 'acres-quarantine-test';
process.env.STORAGE_ACCESS_KEY_ID = 'test-storage-access-key';
process.env.STORAGE_SECRET_ACCESS_KEY = 'test-storage-secret-key';
process.env.STORAGE_FORCE_PATH_STYLE = 'true';
process.env.PRESIGNED_UPLOAD_TTL_SECONDS = '900';
process.env.ACCEPTED_DOWNLOAD_TTL_SECONDS = '300';
process.env.CLAMAV_HOST = 'localhost';
process.env.CLAMAV_PORT = '3310';
process.env.CLAMAV_SCAN_TIMEOUT_MS = '10000';
process.env.UPLOAD_MAX_BYTES = '52428800';
process.env.UPLOAD_ACCEPTED_MEDIA_TYPES =
  'text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/geo+json,application/json';
process.env.UPLOAD_STALE_MINUTES = '60';
process.env.UPLOAD_CLEANUP_INTERVAL_MS = '300000';
process.env.OUTBOX_CLAIM_BATCH_SIZE = '25';
process.env.OUTBOX_CLAIM_LEASE_MS = '30000';
process.env.OUTBOX_MAX_ATTEMPTS = '5';
