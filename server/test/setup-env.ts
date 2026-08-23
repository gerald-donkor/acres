/**
 * `ConfigModule.forRoot()` validates the environment while `app.module.ts` is
 * being imported, which happens before any `beforeEach` runs. The values have
 * to be in place first, so they are set from `setupFiles`.
 */
process.env.NODE_ENV = 'test';
process.env.PORT = '3999';
process.env.CLIENT_ORIGIN = 'http://localhost:3000';
process.env.DATABASE_URL =
  'postgresql://acres:acres@localhost:5432/acres?schema=public';
process.env.SESSION_COOKIE_NAME = 'acres_session';
process.env.SESSION_TTL_DAYS = '30';
process.env.SESSION_SECRET = 'test-secret-that-is-at-least-32-characters';
process.env.CSRF_COOKIE_NAME = 'acres_csrf';
process.env.SCHEDULER_ENABLED = 'false';
process.env.RATE_LIMIT_TTL_MS = '60000';
process.env.RATE_LIMIT_DEFAULT_LIMIT = '1000';
process.env.RATE_LIMIT_STRICT_LIMIT = '1000';
