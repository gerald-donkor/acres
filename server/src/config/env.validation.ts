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
  };
}
