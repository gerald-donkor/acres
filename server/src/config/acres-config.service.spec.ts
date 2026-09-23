import type { ConfigService } from '@nestjs/config';
import { AcresConfigService } from './acres-config.service';
import type { AcresEnv } from './env.validation';

describe('AcresConfigService', () => {
  let service: AcresConfigService;
  let configServiceMock: { get: jest.Mock };

  const MOCK_ENV: AcresEnv = {
    nodeEnv: 'development',
    isProduction: false,
    port: 3001,
    workerMetricsHost: '127.0.0.1',
    workerMetricsPort: 3002,
    clientOrigin: 'http://localhost:3000',
    databaseUrl: 'postgresql://acres:acres@localhost:5432/acres',
    sessionCookieName: 'acres_session',
    sessionTtlDays: 30,
    sessionSecret: 'test-session-secret-32-characters-minimum',
    csrfCookieName: 'acres_csrf',
    schedulerEnabled: true,
    rateLimitTtlMs: 60000,
    rateLimitDefaultLimit: 120,
    rateLimitStrictLimit: 10,
    tenancyEnabled: true,
    invitationTtlHours: 24,
    accountTokenTtlMinutes: 30,
    graphqlMaxBytes: 12000,
    graphqlMaxDepth: 8,
    graphqlMaxAliases: 12,
    graphqlMaxCost: 250,
    graphqlMaxFirst: 50,
    graphqlMaxNodes: 250,
    graphqlTimeoutMs: 5000,
    idempotencyTtlHours: 24,
    valkeyUrl: 'redis://localhost:6379/0',
    queueName: 'acres-ingestion',
    queuePrefix: 'acres',
    queueDefaultAttempts: 5,
    queueBackoffMs: 30000,
    queueShutdownMs: 15000,
    storageEndpoint: 'http://localhost:3900',
    storageRegion: 'garage',
    storageBucket: 'acres-quarantine',
    storageAccessKeyId: 'test-access-key',
    storageSecretAccessKey: 'test-secret-key',
    storageForcePathStyle: true,
    presignedUploadTtlSeconds: 900,
    acceptedDownloadTtlSeconds: 300,
    clamavHost: 'localhost',
    clamavPort: 3310,
    clamavScanTimeoutMs: 10000,
    uploadMaxBytes: 52428800,
    uploadAcceptedMediaTypes: ['text/csv', 'application/json'],
    uploadStaleMinutes: 60,
    uploadCleanupIntervalMs: 300000,
    parserMaxRows: 10000,
    parserMaxColumns: 200,
    parserMaxCellChars: 2000,
    parserMaxSampleRows: 5,
    parserMaxGeojsonFeatures: 2500,
    parserMaxGeojsonCoordinates: 100000,
    parserChildTimeoutMs: 15000,
    parserChildMaxOldSpaceMb: 192,
    outboxClaimBatchSize: 25,
    outboxClaimLeaseMs: 30000,
    outboxMaxAttempts: 5,
    aiDraftEnabled: true,
    aiDraftProviderTierUnpaidAcknowledged: true,
    geminiApiKey: 'test-gemini-key',
    aiDraftModel: 'gemini-2.5-flash',
    aiDraftTimeoutMs: 15000,
    aiDraftMaxProposals: 3,
    aiDraftMaxContextBytes: 16384,
    aiDraftMaxOutputTokens: 2048,
    mailTransport: 'smtp',
    smtpHost: 'localhost',
    smtpPort: 1025,
    smtpSecure: false,
    smtpUser: 'user@example.com',
    smtpPass: 'password123',
    mailFrom: 'Acres <no-reply@acres.local>',
  };

  beforeEach(() => {
    configServiceMock = {
      get: jest.fn((key: keyof AcresEnv) => MOCK_ENV[key]),
    };
    service = new AcresConfigService(
      configServiceMock as unknown as ConfigService<AcresEnv, true>,
    );
  });

  describe('delegation to ConfigService', () => {
    const keys = Object.keys(MOCK_ENV) as (keyof AcresEnv)[];

    it.each(keys)(
      'getter "%s" delegates to config.get with { infer: true }',
      (key) => {
        const value = service[key];
        expect(value).toEqual(MOCK_ENV[key]);
        expect(configServiceMock.get).toHaveBeenCalledWith(key, {
          infer: true,
        });
      },
    );
  });

  describe('grouped category verification', () => {
    it('returns core environment and HTTP settings', () => {
      expect(service.nodeEnv).toBe('development');
      expect(service.isProduction).toBe(false);
      expect(service.port).toBe(3001);
      expect(service.clientOrigin).toBe('http://localhost:3000');
      expect(service.databaseUrl).toBe(
        'postgresql://acres:acres@localhost:5432/acres',
      );
    });

    it('returns session and CSRF settings', () => {
      expect(service.sessionCookieName).toBe('acres_session');
      expect(service.sessionTtlDays).toBe(30);
      expect(service.sessionSecret).toBe(
        'test-session-secret-32-characters-minimum',
      );
      expect(service.csrfCookieName).toBe('acres_csrf');
    });

    it('returns rate limit and scheduler settings', () => {
      expect(service.schedulerEnabled).toBe(true);
      expect(service.rateLimitTtlMs).toBe(60000);
      expect(service.rateLimitDefaultLimit).toBe(120);
      expect(service.rateLimitStrictLimit).toBe(10);
    });

    it('returns tenancy and token lifetime settings', () => {
      expect(service.tenancyEnabled).toBe(true);
      expect(service.invitationTtlHours).toBe(24);
      expect(service.accountTokenTtlMinutes).toBe(30);
    });

    it('returns GraphQL query depth and complexity limits', () => {
      expect(service.graphqlMaxBytes).toBe(12000);
      expect(service.graphqlMaxDepth).toBe(8);
      expect(service.graphqlMaxAliases).toBe(12);
      expect(service.graphqlMaxCost).toBe(250);
      expect(service.graphqlMaxFirst).toBe(50);
      expect(service.graphqlMaxNodes).toBe(250);
      expect(service.graphqlTimeoutMs).toBe(5000);
    });

    it('returns queue and storage settings', () => {
      expect(service.idempotencyTtlHours).toBe(24);
      expect(service.valkeyUrl).toBe('redis://localhost:6379/0');
      expect(service.queueName).toBe('acres-ingestion');
      expect(service.queuePrefix).toBe('acres');
      expect(service.queueDefaultAttempts).toBe(5);
      expect(service.queueBackoffMs).toBe(30000);
      expect(service.queueShutdownMs).toBe(15000);
      expect(service.storageEndpoint).toBe('http://localhost:3900');
      expect(service.storageRegion).toBe('garage');
      expect(service.storageBucket).toBe('acres-quarantine');
      expect(service.storageAccessKeyId).toBe('test-access-key');
      expect(service.storageSecretAccessKey).toBe('test-secret-key');
      expect(service.storageForcePathStyle).toBe(true);
      expect(service.presignedUploadTtlSeconds).toBe(900);
      expect(service.acceptedDownloadTtlSeconds).toBe(300);
    });

    it('returns scanner, upload, parser, and outbox settings', () => {
      expect(service.clamavHost).toBe('localhost');
      expect(service.clamavPort).toBe(3310);
      expect(service.clamavScanTimeoutMs).toBe(10000);
      expect(service.uploadMaxBytes).toBe(52428800);
      expect(service.uploadAcceptedMediaTypes).toEqual([
        'text/csv',
        'application/json',
      ]);
      expect(service.uploadStaleMinutes).toBe(60);
      expect(service.uploadCleanupIntervalMs).toBe(300000);
      expect(service.parserMaxRows).toBe(10000);
      expect(service.parserMaxColumns).toBe(200);
      expect(service.parserMaxCellChars).toBe(2000);
      expect(service.parserMaxSampleRows).toBe(5);
      expect(service.parserMaxGeojsonFeatures).toBe(2500);
      expect(service.parserMaxGeojsonCoordinates).toBe(100000);
      expect(service.parserChildTimeoutMs).toBe(15000);
      expect(service.parserChildMaxOldSpaceMb).toBe(192);
      expect(service.outboxClaimBatchSize).toBe(25);
      expect(service.outboxClaimLeaseMs).toBe(30000);
      expect(service.outboxMaxAttempts).toBe(5);
    });

    it('returns AI draft settings', () => {
      expect(service.aiDraftEnabled).toBe(true);
      expect(service.aiDraftProviderTierUnpaidAcknowledged).toBe(true);
      expect(service.geminiApiKey).toBe('test-gemini-key');
      expect(service.aiDraftModel).toBe('gemini-2.5-flash');
      expect(service.aiDraftTimeoutMs).toBe(15000);
      expect(service.aiDraftMaxProposals).toBe(3);
      expect(service.aiDraftMaxContextBytes).toBe(16384);
      expect(service.aiDraftMaxOutputTokens).toBe(2048);
    });

    it('returns mail delivery settings', () => {
      expect(service.mailTransport).toBe('smtp');
      expect(service.smtpHost).toBe('localhost');
      expect(service.smtpPort).toBe(1025);
      expect(service.smtpSecure).toBe(false);
      expect(service.smtpUser).toBe('user@example.com');
      expect(service.smtpPass).toBe('password123');
      expect(service.mailFrom).toBe('Acres <no-reply@acres.local>');
    });
  });
});
