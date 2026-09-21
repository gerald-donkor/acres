import { NODE_ENVS } from '@acres/shared';
import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const BASE_VALID_ENV = {
    DATABASE_URL: 'postgresql://acres:acres@localhost:5432/acres?schema=public',
    CLIENT_ORIGIN: 'http://localhost:3000',
    SESSION_SECRET: 'test-secret-that-is-at-least-32-characters',
    INVITATION_TTL_HOURS: '24',
    ACCOUNT_TOKEN_TTL_MINUTES: '30',
  };

  const PROD_VALID_ENV = {
    ...BASE_VALID_ENV,
    NODE_ENV: 'production',
    STORAGE_ACCESS_KEY_ID: 'production-storage-key',
    STORAGE_SECRET_ACCESS_KEY: 'production-storage-secret',
    VALKEY_URL: 'redis://:production_password@prod-valkey:6379/0',
  };

  describe('required variables', () => {
    it('throws error listing all missing required variables when absent', () => {
      expect(() => validateEnv({})).toThrow(
        'Missing required environment variable(s): DATABASE_URL, CLIENT_ORIGIN, SESSION_SECRET. ' +
          'Copy server/.env.example to server/.env and fill them in.',
      );
    });

    it('throws error when only DATABASE_URL is missing', () => {
      const env = { ...BASE_VALID_ENV };
      delete (env as Record<string, unknown>).DATABASE_URL;
      expect(() => validateEnv(env)).toThrow(
        'Missing required environment variable(s): DATABASE_URL.',
      );
    });

    it('throws error when only CLIENT_ORIGIN is missing', () => {
      const env = { ...BASE_VALID_ENV };
      delete (env as Record<string, unknown>).CLIENT_ORIGIN;
      expect(() => validateEnv(env)).toThrow(
        'Missing required environment variable(s): CLIENT_ORIGIN.',
      );
    });

    it('throws error when only SESSION_SECRET is missing', () => {
      const env = { ...BASE_VALID_ENV };
      delete (env as Record<string, unknown>).SESSION_SECRET;
      expect(() => validateEnv(env)).toThrow(
        'Missing required environment variable(s): SESSION_SECRET.',
      );
    });
  });

  describe('minimal environment and default population', () => {
    it('parses valid minimal environment and populates all expected defaults', () => {
      const config = validateEnv(BASE_VALID_ENV);

      expect(config.nodeEnv).toBe('development');
      expect(config.isProduction).toBe(false);
      expect(config.port).toBe(3001);
      expect(config.clientOrigin).toBe('http://localhost:3000');
      expect(config.databaseUrl).toBe(BASE_VALID_ENV.DATABASE_URL);
      expect(config.sessionCookieName).toBe('acres_session');
      expect(config.sessionTtlDays).toBe(30);
      expect(config.sessionSecret).toBe(BASE_VALID_ENV.SESSION_SECRET);
      expect(config.csrfCookieName).toBe('acres_csrf');
      expect(config.schedulerEnabled).toBe(true);
      expect(config.rateLimitTtlMs).toBe(60000);
      expect(config.rateLimitDefaultLimit).toBe(120);
      expect(config.rateLimitStrictLimit).toBe(10);
      expect(config.tenancyEnabled).toBe(false);
      expect(config.invitationTtlHours).toBe(24);
      expect(config.accountTokenTtlMinutes).toBe(30);
      expect(config.graphqlMaxBytes).toBe(12000);
      expect(config.graphqlMaxDepth).toBe(8);
      expect(config.graphqlMaxAliases).toBe(12);
      expect(config.graphqlMaxCost).toBe(250);
      expect(config.graphqlMaxFirst).toBe(50);
      expect(config.graphqlMaxNodes).toBe(250);
      expect(config.graphqlTimeoutMs).toBe(5000);
      expect(config.idempotencyTtlHours).toBe(24);
      expect(config.valkeyUrl).toBe(
        'redis://:acres_valkey_dev_password@localhost:6379/0',
      );
      expect(config.queueName).toBe('acres-ingestion');
      expect(config.queuePrefix).toBe('acres');
      expect(config.queueDefaultAttempts).toBe(5);
      expect(config.queueBackoffMs).toBe(30000);
      expect(config.queueShutdownMs).toBe(15000);
      expect(config.storageEndpoint).toBe('http://localhost:3900');
      expect(config.storageRegion).toBe('garage');
      expect(config.storageBucket).toBe('acres-quarantine');
      expect(config.storageAccessKeyId).toBe(
        'change-me-local-garage-access-key',
      );
      expect(config.storageSecretAccessKey).toBe(
        'change-me-local-garage-secret-key',
      );
      expect(config.storageForcePathStyle).toBe(true);
      expect(config.presignedUploadTtlSeconds).toBe(900);
      expect(config.acceptedDownloadTtlSeconds).toBe(300);
      expect(config.clamavHost).toBe('localhost');
      expect(config.clamavPort).toBe(3310);
      expect(config.clamavScanTimeoutMs).toBe(10000);
      expect(config.uploadMaxBytes).toBe(52428800);
      expect(config.uploadAcceptedMediaTypes).toEqual([
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/geo+json',
        'application/json',
      ]);
      expect(config.uploadStaleMinutes).toBe(60);
      expect(config.uploadCleanupIntervalMs).toBe(300000);
      expect(config.parserMaxRows).toBe(10000);
      expect(config.parserMaxColumns).toBe(200);
      expect(config.parserMaxCellChars).toBe(2000);
      expect(config.parserMaxSampleRows).toBe(5);
      expect(config.parserMaxGeojsonFeatures).toBe(2500);
      expect(config.parserMaxGeojsonCoordinates).toBe(100000);
      expect(config.parserChildTimeoutMs).toBe(15000);
      expect(config.parserChildMaxOldSpaceMb).toBe(192);
      expect(config.outboxClaimBatchSize).toBe(25);
      expect(config.outboxClaimLeaseMs).toBe(30000);
      expect(config.outboxMaxAttempts).toBe(5);
      expect(config.aiDraftEnabled).toBe(false);
      expect(config.aiDraftProviderTierUnpaidAcknowledged).toBe(false);
      expect(config.geminiApiKey).toBeUndefined();
      expect(config.aiDraftModel).toBe('gemini-2.5-flash');
      expect(config.aiDraftTimeoutMs).toBe(15000);
      expect(config.aiDraftMaxProposals).toBe(3);
      expect(config.aiDraftMaxContextBytes).toBe(16384);
      expect(config.aiDraftMaxOutputTokens).toBe(2048);
      expect(config.mailTransport).toBe('smtp');
      expect(config.smtpHost).toBe('localhost');
      expect(config.smtpPort).toBe(1025);
      expect(config.smtpSecure).toBe(false);
      expect(config.smtpUser).toBeUndefined();
      expect(config.smtpPass).toBeUndefined();
      expect(config.mailFrom).toBe('Acres <no-reply@acres.local>');
    });

    it('defaults mailTransport to memory when NODE_ENV is test and MAIL_TRANSPORT is not specified', () => {
      const config = validateEnv({
        ...BASE_VALID_ENV,
        NODE_ENV: 'test',
      });
      expect(config.mailTransport).toBe('memory');
    });
  });

  describe('NODE_ENV validation', () => {
    it.each(NODE_ENVS)('accepts canonical environment "%s"', (env) => {
      const overrides =
        env === 'production'
          ? PROD_VALID_ENV
          : { ...BASE_VALID_ENV, NODE_ENV: env };
      const config = validateEnv(overrides);
      expect(config.nodeEnv).toBe(env);
      expect(config.isProduction).toBe(env === 'production');
    });

    it('rejects invalid NODE_ENV value', () => {
      expect(() =>
        validateEnv({
          ...BASE_VALID_ENV,
          NODE_ENV: 'staging',
        }),
      ).toThrow(
        'NODE_ENV must be development, test or production, received "staging"',
      );
    });
  });

  describe('production session secret and credentials validation', () => {
    it('enforces production session secret minimum length of 32 characters', () => {
      expect(() =>
        validateEnv({
          ...PROD_VALID_ENV,
          SESSION_SECRET: 'secret-under-32-chars',
        }),
      ).toThrow('SESSION_SECRET must be at least 32 characters in production.');
    });

    it('rejects placeholder session secret in production', () => {
      expect(() =>
        validateEnv({
          ...PROD_VALID_ENV,
          SESSION_SECRET: 'change-me-production-secret-longer-than-32-chars',
        }),
      ).toThrow(
        'SESSION_SECRET is still the placeholder from server/.env.example.',
      );
    });

    it('allows shorter session secret in development or test', () => {
      const devConfig = validateEnv({
        ...BASE_VALID_ENV,
        NODE_ENV: 'development',
        SESSION_SECRET: 'short-dev-secret',
      });
      expect(devConfig.sessionSecret).toBe('short-dev-secret');

      const testConfig = validateEnv({
        ...BASE_VALID_ENV,
        NODE_ENV: 'test',
        SESSION_SECRET: 'short-test-secret',
      });
      expect(testConfig.sessionSecret).toBe('short-test-secret');
    });

    it('rejects placeholder storage or valkey credentials in production', () => {
      expect(() =>
        validateEnv({
          ...PROD_VALID_ENV,
          STORAGE_ACCESS_KEY_ID: 'change-me-prod-key',
        }),
      ).toThrow(
        'Storage/queue credentials still use development placeholders.',
      );

      expect(() =>
        validateEnv({
          ...PROD_VALID_ENV,
          STORAGE_SECRET_ACCESS_KEY: 'change-me-prod-secret',
        }),
      ).toThrow(
        'Storage/queue credentials still use development placeholders.',
      );

      expect(() =>
        validateEnv({
          ...PROD_VALID_ENV,
          VALKEY_URL: 'redis://:acres_valkey_dev_password@prod:6379/0',
        }),
      ).toThrow(
        'Storage/queue credentials still use development placeholders.',
      );
    });
  });

  describe('positiveInt validation', () => {
    it('accepts positive integers', () => {
      const config = validateEnv({
        ...BASE_VALID_ENV,
        PORT: '8080',
        RATE_LIMIT_TTL_MS: '30000',
      });
      expect(config.port).toBe(8080);
      expect(config.rateLimitTtlMs).toBe(30000);
    });

    it.each([
      ['non-integer decimal string', '3.14'],
      ['zero', '0'],
      ['negative integer', '-10'],
      ['non-numeric string', 'not-a-number'],
    ])('rejects %s', (_label, val) => {
      expect(() =>
        validateEnv({
          ...BASE_VALID_ENV,
          PORT: val,
        }),
      ).toThrow(`PORT must be a positive integer, received "${val}"`);
    });
  });

  describe('boolean validation', () => {
    it('accepts "true" and "false" strings and parses to boolean', () => {
      const configTrue = validateEnv({
        ...BASE_VALID_ENV,
        SCHEDULER_ENABLED: 'true',
        TENANCY_ENABLED: 'true',
      });
      expect(configTrue.schedulerEnabled).toBe(true);
      expect(configTrue.tenancyEnabled).toBe(true);

      const configFalse = validateEnv({
        ...BASE_VALID_ENV,
        SCHEDULER_ENABLED: 'false',
        TENANCY_ENABLED: 'false',
      });
      expect(configFalse.schedulerEnabled).toBe(false);
      expect(configFalse.tenancyEnabled).toBe(false);
    });

    it.each(['yes', 'no', '1', '0', 'TRUE', 'FALSE', ''])(
      'rejects invalid boolean value "%s"',
      (val) => {
        expect(() =>
          validateEnv({
            ...BASE_VALID_ENV,
            TENANCY_ENABLED: val,
          }),
        ).toThrow(
          `TENANCY_ENABLED must be "true" or "false", received "${val}"`,
        );
      },
    );
  });

  describe('csv validation', () => {
    it('parses comma-separated strings into trimmed arrays', () => {
      const config = validateEnv({
        ...BASE_VALID_ENV,
        UPLOAD_ACCEPTED_MEDIA_TYPES:
          ' text/csv , application/json , application/geo+json ',
      });
      expect(config.uploadAcceptedMediaTypes).toEqual([
        'text/csv',
        'application/json',
        'application/geo+json',
      ]);
    });

    it.each(['', '   ', ',,,', ' , , '])(
      'throws when CSV list has no valid entries (%j)',
      (val) => {
        expect(() =>
          validateEnv({
            ...BASE_VALID_ENV,
            UPLOAD_ACCEPTED_MEDIA_TYPES: val,
          }),
        ).toThrow(
          'UPLOAD_ACCEPTED_MEDIA_TYPES must include at least one value',
        );
      },
    );
  });

  describe('AI draft settings validation', () => {
    it('requires acknowledgement of unpaid terms when AI_DRAFT_ENABLED="true"', () => {
      expect(() =>
        validateEnv({
          ...BASE_VALID_ENV,
          AI_DRAFT_ENABLED: 'true',
          AI_DRAFT_PROVIDER_TIER_UNPAID_ACKNOWLEDGED: 'false',
        }),
      ).toThrow(
        'AI_DRAFT_ENABLED requires AI_DRAFT_PROVIDER_TIER_UNPAID_ACKNOWLEDGED="true" to acknowledge the unpaid Gemini Developer API terms.',
      );
    });

    it('requires GEMINI_API_KEY when AI_DRAFT_ENABLED="true" and terms are acknowledged', () => {
      expect(() =>
        validateEnv({
          ...BASE_VALID_ENV,
          AI_DRAFT_ENABLED: 'true',
          AI_DRAFT_PROVIDER_TIER_UNPAID_ACKNOWLEDGED: 'true',
        }),
      ).toThrow('GEMINI_API_KEY is required when AI_DRAFT_ENABLED="true".');
    });

    it('rejects placeholder GEMINI_API_KEY in production', () => {
      expect(() =>
        validateEnv({
          ...PROD_VALID_ENV,
          AI_DRAFT_ENABLED: 'true',
          AI_DRAFT_PROVIDER_TIER_UNPAID_ACKNOWLEDGED: 'true',
          GEMINI_API_KEY: 'change-me-api-key',
        }),
      ).toThrow('GEMINI_API_KEY cannot use a placeholder in production.');
    });

    it('allows placeholder GEMINI_API_KEY in test or development', () => {
      const devConfig = validateEnv({
        ...BASE_VALID_ENV,
        NODE_ENV: 'development',
        AI_DRAFT_ENABLED: 'true',
        AI_DRAFT_PROVIDER_TIER_UNPAID_ACKNOWLEDGED: 'true',
        GEMINI_API_KEY: 'change-me-api-key',
      });
      expect(devConfig.aiDraftEnabled).toBe(true);
      expect(devConfig.geminiApiKey).toBe('change-me-api-key');

      const testConfig = validateEnv({
        ...BASE_VALID_ENV,
        NODE_ENV: 'test',
        AI_DRAFT_ENABLED: 'true',
        AI_DRAFT_PROVIDER_TIER_UNPAID_ACKNOWLEDGED: 'true',
        GEMINI_API_KEY: 'change-me-api-key',
      });
      expect(testConfig.aiDraftEnabled).toBe(true);
      expect(testConfig.geminiApiKey).toBe('change-me-api-key');
    });

    it('enforces AI_DRAFT_MAX_PROPOSALS <= 5', () => {
      expect(() =>
        validateEnv({
          ...BASE_VALID_ENV,
          AI_DRAFT_ENABLED: 'true',
          AI_DRAFT_PROVIDER_TIER_UNPAID_ACKNOWLEDGED: 'true',
          GEMINI_API_KEY: 'test-api-key',
          AI_DRAFT_MAX_PROPOSALS: '6',
        }),
      ).toThrow('AI_DRAFT_MAX_PROPOSALS must be <= 5.');
    });

    it('enforces AI_DRAFT_TIMEOUT_MS between 1000 and 60000 ms', () => {
      expect(() =>
        validateEnv({
          ...BASE_VALID_ENV,
          AI_DRAFT_ENABLED: 'true',
          AI_DRAFT_PROVIDER_TIER_UNPAID_ACKNOWLEDGED: 'true',
          GEMINI_API_KEY: 'test-api-key',
          AI_DRAFT_TIMEOUT_MS: '500',
        }),
      ).toThrow('AI_DRAFT_TIMEOUT_MS must be between 1000 and 60000 ms.');

      expect(() =>
        validateEnv({
          ...BASE_VALID_ENV,
          AI_DRAFT_ENABLED: 'true',
          AI_DRAFT_PROVIDER_TIER_UNPAID_ACKNOWLEDGED: 'true',
          GEMINI_API_KEY: 'test-api-key',
          AI_DRAFT_TIMEOUT_MS: '60001',
        }),
      ).toThrow('AI_DRAFT_TIMEOUT_MS must be between 1000 and 60000 ms.');
    });

    it('accepts fully valid AI draft configuration', () => {
      const config = validateEnv({
        ...BASE_VALID_ENV,
        AI_DRAFT_ENABLED: 'true',
        AI_DRAFT_PROVIDER_TIER_UNPAID_ACKNOWLEDGED: 'true',
        GEMINI_API_KEY: 'valid-gemini-key',
        AI_DRAFT_MODEL: 'gemini-1.5-pro',
        AI_DRAFT_TIMEOUT_MS: '12000',
        AI_DRAFT_MAX_PROPOSALS: '4',
        AI_DRAFT_MAX_CONTEXT_BYTES: '8192',
        AI_DRAFT_MAX_OUTPUT_TOKENS: '1024',
      });
      expect(config.aiDraftEnabled).toBe(true);
      expect(config.geminiApiKey).toBe('valid-gemini-key');
      expect(config.aiDraftModel).toBe('gemini-1.5-pro');
      expect(config.aiDraftTimeoutMs).toBe(12000);
      expect(config.aiDraftMaxProposals).toBe(4);
      expect(config.aiDraftMaxContextBytes).toBe(8192);
      expect(config.aiDraftMaxOutputTokens).toBe(1024);
    });
  });

  describe('mail transport validation', () => {
    it('accepts supported mail transports ("smtp", "memory")', () => {
      const smtpConfig = validateEnv({
        ...BASE_VALID_ENV,
        MAIL_TRANSPORT: 'smtp',
      });
      expect(smtpConfig.mailTransport).toBe('smtp');

      const memoryConfig = validateEnv({
        ...BASE_VALID_ENV,
        MAIL_TRANSPORT: 'memory',
      });
      expect(memoryConfig.mailTransport).toBe('memory');
    });

    it('rejects unsupported mail transport', () => {
      expect(() =>
        validateEnv({
          ...BASE_VALID_ENV,
          MAIL_TRANSPORT: 'sendgrid',
        }),
      ).toThrow(
        'MAIL_TRANSPORT must be "smtp" or "memory", received "sendgrid"',
      );
    });
  });

  describe('parser isolation settings bounds', () => {
    it('enforces PARSER_CHILD_TIMEOUT_MS between 1000 and 60000 ms', () => {
      expect(() =>
        validateEnv({
          ...BASE_VALID_ENV,
          PARSER_CHILD_TIMEOUT_MS: '999',
        }),
      ).toThrow('PARSER_CHILD_TIMEOUT_MS must be between 1000 and 60000 ms.');

      expect(() =>
        validateEnv({
          ...BASE_VALID_ENV,
          PARSER_CHILD_TIMEOUT_MS: '60001',
        }),
      ).toThrow('PARSER_CHILD_TIMEOUT_MS must be between 1000 and 60000 ms.');
    });

    it('enforces PARSER_CHILD_MAX_OLD_SPACE_MB between 32 and 1024 MB', () => {
      expect(() =>
        validateEnv({
          ...BASE_VALID_ENV,
          PARSER_CHILD_MAX_OLD_SPACE_MB: '31',
        }),
      ).toThrow(
        'PARSER_CHILD_MAX_OLD_SPACE_MB must be between 32 and 1024 MB.',
      );

      expect(() =>
        validateEnv({
          ...BASE_VALID_ENV,
          PARSER_CHILD_MAX_OLD_SPACE_MB: '1025',
        }),
      ).toThrow(
        'PARSER_CHILD_MAX_OLD_SPACE_MB must be between 32 and 1024 MB.',
      );
    });
  });
});
