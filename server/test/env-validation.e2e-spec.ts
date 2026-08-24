import { validateEnv } from '../src/config/env.validation';

const BASE_ENV = {
  NODE_ENV: 'test',
  PORT: '3999',
  CLIENT_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://acres:acres@localhost:5432/acres?schema=public',
  SESSION_COOKIE_NAME: 'acres_session',
  SESSION_TTL_DAYS: '30',
  SESSION_SECRET: 'test-secret-that-is-at-least-32-characters',
  CSRF_COOKIE_NAME: 'acres_csrf',
  SCHEDULER_ENABLED: 'false',
  TENANCY_ENABLED: 'true',
  INVITATION_TTL_HOURS: '24',
  ACCOUNT_TOKEN_TTL_MINUTES: '30',
};

describe('validateEnv rate limiting', () => {
  it('defaults the rate-limit settings when omitted', () => {
    expect(validateEnv(BASE_ENV)).toMatchObject({
      rateLimitTtlMs: 60000,
      rateLimitDefaultLimit: 120,
      rateLimitStrictLimit: 10,
    });
  });

  it('parses positive integer rate-limit overrides', () => {
    expect(
      validateEnv({
        ...BASE_ENV,
        RATE_LIMIT_TTL_MS: '30000',
        RATE_LIMIT_DEFAULT_LIMIT: '60',
        RATE_LIMIT_STRICT_LIMIT: '4',
      }),
    ).toMatchObject({
      rateLimitTtlMs: 30000,
      rateLimitDefaultLimit: 60,
      rateLimitStrictLimit: 4,
    });
  });

  it.each([
    ['RATE_LIMIT_TTL_MS'],
    ['RATE_LIMIT_DEFAULT_LIMIT'],
    ['RATE_LIMIT_STRICT_LIMIT'],
  ])('rejects a non-positive %s override', (name) => {
    expect(() =>
      validateEnv({
        ...BASE_ENV,
        [name]: '0',
      }),
    ).toThrow(`${name} must be a positive integer`);
  });
});

describe('validateEnv tenancy', () => {
  it('parses the feature gate and token lifetimes', () => {
    expect(validateEnv(BASE_ENV)).toMatchObject({
      tenancyEnabled: true,
      invitationTtlHours: 24,
      accountTokenTtlMinutes: 30,
    });
  });

  it('defaults TENANCY_ENABLED to false but still requires lifetimes', () => {
    const withoutGate: Partial<typeof BASE_ENV> = { ...BASE_ENV };
    delete withoutGate.TENANCY_ENABLED;

    expect(validateEnv(withoutGate)).toMatchObject({
      tenancyEnabled: false,
      invitationTtlHours: 24,
      accountTokenTtlMinutes: 30,
    });
  });

  it.each([
    ['TENANCY_ENABLED', 'yes', 'TENANCY_ENABLED must be "true" or "false"'],
    [
      'INVITATION_TTL_HOURS',
      '0',
      'INVITATION_TTL_HOURS must be a positive integer',
    ],
    [
      'ACCOUNT_TOKEN_TTL_MINUTES',
      '0',
      'ACCOUNT_TOKEN_TTL_MINUTES must be a positive integer',
    ],
  ])('rejects invalid %s', (name, value, message) => {
    expect(() =>
      validateEnv({
        ...BASE_ENV,
        [name]: value,
      }),
    ).toThrow(message);
  });
});
