import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from './prisma.service';
import {
  TenantTransactionService,
  TENANT_SESSION_CONFIGS,
  STATEMENT_TIMEOUT_SETTING,
} from './tenant-transaction.service';

describe('TenantTransactionService', () => {
  let service: TenantTransactionService;
  let mockTx: {
    $executeRaw: jest.Mock<
      Promise<number>,
      [TemplateStringsArray, ...unknown[]]
    >;
  };
  let mockPrisma: {
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    mockTx = {
      $executeRaw: jest
        .fn<Promise<number>, [TemplateStringsArray, ...unknown[]]>()
        .mockResolvedValue(0),
    };

    mockPrisma = {
      $transaction: jest.fn(
        async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantTransactionService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<TenantTransactionService>(TenantTransactionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canonical constants', () => {
    it('exports TENANT_SESSION_CONFIGS with all 4 session config keys', () => {
      expect(TENANT_SESSION_CONFIGS).toEqual([
        'acres.account_id',
        'acres.organization_id',
        'acres.invitation_token_hash',
        'acres.worker_access',
      ]);
    });

    it('exports STATEMENT_TIMEOUT_SETTING as statement_timeout', () => {
      expect(STATEMENT_TIMEOUT_SETTING).toBe('statement_timeout');
    });
  });

  describe('accountScoped', () => {
    it('verifies $transaction is called, setContext executes raw query with accountId, empty org, empty invitation, empty worker_access, and returns callback result', async () => {
      const callback = jest.fn().mockResolvedValue('account-result');

      const result = await service.accountScoped('acc-123', callback);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(mockTx);
      expect(result).toBe('account-result');

      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
      const firstCall = mockTx.$executeRaw.mock.calls[0];
      const strings = firstCall[0];
      const accountId = firstCall[1];
      const orgId = firstCall[2];
      const invitationHash = firstCall[3];
      const queryText = strings.join('');
      expect(queryText).toContain("set_config('acres.account_id',");
      expect(queryText).toContain("set_config('acres.organization_id',");
      expect(queryText).toContain("set_config('acres.invitation_token_hash',");
      expect(queryText).toContain(
        "set_config('acres.worker_access', '', true)",
      );
      expect(accountId).toBe('acc-123');
      expect(orgId).toBe('');
      expect(invitationHash).toBe('');
    });

    it('handles options.statementTimeoutMs by executing set_config(statement_timeout, ...)', async () => {
      const callback = jest.fn().mockResolvedValue('with-timeout');

      const result = await service.accountScoped('acc-123', callback, {
        statementTimeoutMs: 3500,
      });

      expect(result).toBe('with-timeout');
      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(2);

      const secondCall = mockTx.$executeRaw.mock.calls[1];
      const strings = secondCall[0];
      const timeoutValue = secondCall[1];
      const timeoutQuery = strings.join('');
      expect(timeoutQuery).toContain('statement_timeout');
      expect(timeoutQuery).toContain('set_config');
      expect(timeoutValue).toBe('3500');
    });
  });

  describe('organizationScoped', () => {
    it('verifies setContext with accountId, organizationId, empty invitation, empty worker_access, and returns callback result', async () => {
      const callback = jest.fn().mockResolvedValue('org-result');

      const result = await service.organizationScoped(
        'acc-123',
        'org-456',
        callback,
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(mockTx);
      expect(result).toBe('org-result');

      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
      const firstCall = mockTx.$executeRaw.mock.calls[0];
      const strings = firstCall[0];
      const accountId = firstCall[1];
      const orgId = firstCall[2];
      const invitationHash = firstCall[3];
      const queryText = strings.join('');
      expect(queryText).toContain("set_config('acres.account_id',");
      expect(queryText).toContain("set_config('acres.organization_id',");
      expect(queryText).toContain("set_config('acres.invitation_token_hash',");
      expect(queryText).toContain(
        "set_config('acres.worker_access', '', true)",
      );
      expect(accountId).toBe('acc-123');
      expect(orgId).toBe('org-456');
      expect(invitationHash).toBe('');
    });

    it('handles options.statementTimeoutMs by executing set_config(statement_timeout, ...)', async () => {
      const callback = jest.fn().mockResolvedValue('org-timeout-result');

      const result = await service.organizationScoped(
        'acc-123',
        'org-456',
        callback,
        { statementTimeoutMs: 1500 },
      );

      expect(result).toBe('org-timeout-result');
      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(2);

      const secondCall = mockTx.$executeRaw.mock.calls[1];
      const strings = secondCall[0];
      const timeoutValue = secondCall[1];
      const timeoutQuery = strings.join('');
      expect(timeoutQuery).toContain('statement_timeout');
      expect(timeoutQuery).toContain('set_config');
      expect(timeoutValue).toBe('1500');
    });
  });

  describe('invitationScoped', () => {
    it('verifies setContext with accountId, empty org, invitationTokenHash, empty worker_access, and returns callback result', async () => {
      const callback = jest.fn().mockResolvedValue('invitation-result');

      const result = await service.invitationScoped(
        'acc-123',
        'token-hash-xyz',
        callback,
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(mockTx);
      expect(result).toBe('invitation-result');

      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
      const firstCall = mockTx.$executeRaw.mock.calls[0];
      const strings = firstCall[0];
      const accountId = firstCall[1];
      const orgId = firstCall[2];
      const invitationHash = firstCall[3];
      const queryText = strings.join('');
      expect(queryText).toContain("set_config('acres.account_id',");
      expect(queryText).toContain("set_config('acres.organization_id',");
      expect(queryText).toContain("set_config('acres.invitation_token_hash',");
      expect(queryText).toContain(
        "set_config('acres.worker_access', '', true)",
      );
      expect(accountId).toBe('acc-123');
      expect(orgId).toBe('');
      expect(invitationHash).toBe('token-hash-xyz');
    });

    it('handles options.statementTimeoutMs by executing set_config(statement_timeout, ...)', async () => {
      const callback = jest.fn().mockResolvedValue('invite-timeout-result');

      const result = await service.invitationScoped(
        'acc-123',
        'token-hash-xyz',
        callback,
        { statementTimeoutMs: 2000 },
      );

      expect(result).toBe('invite-timeout-result');
      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(2);

      const secondCall = mockTx.$executeRaw.mock.calls[1];
      const strings = secondCall[0];
      const timeoutValue = secondCall[1];
      const timeoutQuery = strings.join('');
      expect(timeoutQuery).toContain('statement_timeout');
      expect(timeoutQuery).toContain('set_config');
      expect(timeoutValue).toBe('2000');
    });
  });

  describe('workerScoped', () => {
    it('verifies raw query executes setting acres.worker_access to true, empty account/org/invitation, and returns callback result', async () => {
      const callback = jest.fn().mockResolvedValue('worker-result');

      const result = await service.workerScoped(callback);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(mockTx);
      expect(result).toBe('worker-result');

      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
      const firstCall = mockTx.$executeRaw.mock.calls[0];
      const strings = firstCall[0];
      const queryText = strings.join('');
      expect(queryText).toContain("set_config('acres.account_id', '', true)");
      expect(queryText).toContain(
        "set_config('acres.organization_id', '', true)",
      );
      expect(queryText).toContain(
        "set_config('acres.invitation_token_hash', '', true)",
      );
      expect(queryText).toContain(
        "set_config('acres.worker_access', 'true', true)",
      );
    });

    it('handles options.statementTimeoutMs by executing set_config(statement_timeout, ...)', async () => {
      const callback = jest.fn().mockResolvedValue('worker-timeout-result');

      const result = await service.workerScoped(callback, {
        statementTimeoutMs: 4000,
      });

      expect(result).toBe('worker-timeout-result');
      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(2);

      const secondCall = mockTx.$executeRaw.mock.calls[1];
      const strings = secondCall[0];
      const timeoutValue = secondCall[1];
      const timeoutQuery = strings.join('');
      expect(timeoutQuery).toContain('statement_timeout');
      expect(timeoutQuery).toContain('set_config');
      expect(timeoutValue).toBe('4000');
    });
  });

  describe('error handling', () => {
    it('propagates error out when accountScoped callback throws an error', async () => {
      const error = new Error('account scoped failure');
      await expect(
        service.accountScoped('acc-123', () => Promise.reject(error)),
      ).rejects.toThrow(error);
    });

    it('propagates error out when organizationScoped callback throws an error', async () => {
      const error = new Error('organization scoped failure');
      await expect(
        service.organizationScoped('acc-123', 'org-456', () =>
          Promise.reject(error),
        ),
      ).rejects.toThrow(error);
    });

    it('propagates error out when invitationScoped callback throws an error', async () => {
      const error = new Error('invitation scoped failure');
      await expect(
        service.invitationScoped('acc-123', 'hash-xyz', () =>
          Promise.reject(error),
        ),
      ).rejects.toThrow(error);
    });

    it('propagates error out when workerScoped callback throws an error', async () => {
      const error = new Error('worker scoped failure');
      await expect(
        service.workerScoped(() => Promise.reject(error)),
      ).rejects.toThrow(error);
    });

    it('propagates error out when setContext raw query fails', async () => {
      const dbError = new Error('database connection failed');
      mockTx.$executeRaw.mockRejectedValueOnce(dbError);

      await expect(
        service.accountScoped('acc-123', () => Promise.resolve('not-reached')),
      ).rejects.toThrow(dbError);
    });
  });
});
