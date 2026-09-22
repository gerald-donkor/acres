import { ACCOUNT_TOKEN_PURPOSES, isAccountTokenPurpose } from '@acres/shared';
import { AccountTokensService } from './account-tokens.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AcresConfigService } from '../config/acres-config.service';

describe('AccountTokensService', () => {
  function serviceWith(prisma: Partial<PrismaService>) {
    return new AccountTokensService(
      prisma as PrismaService,
      {
        accountTokenTtlMinutes: 30,
      } as AcresConfigService,
    );
  }

  it('stores only token hashes when issuing', async () => {
    const tx = {
      accountToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'token-1' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (arg: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = serviceWith(prisma as unknown as Partial<PrismaService>);

    const issued = await service.issue('account-1', 'password_recovery');

    expect(issued.token).toBeTruthy();
    const expectedCreateData: unknown = expect.objectContaining({
      accountId: 'account-1',
      purpose: 'password_recovery',
      tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
    });
    expect(tx.accountToken.create).toHaveBeenCalledWith({
      data: expectedCreateData,
    });
    const createCalls = tx.accountToken.create.mock.calls as [
      [
        {
          data: {
            accountId: string;
            purpose: string;
            tokenHash: string;
          };
        },
      ],
    ];
    const call = createCalls[0][0];
    expect(call.data).toMatchObject({
      accountId: 'account-1',
      purpose: 'password_recovery',
      tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
    });
    expect(call.data.tokenHash).not.toBe(issued.token);
  });

  it('consumes a live token once and rejects replay', async () => {
    const row = {
      id: 'token-1',
      accountId: 'account-1',
      purpose: 'email_verification',
      consumedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const tx = {
      accountToken: {
        findUnique: jest.fn().mockResolvedValue(row),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (arg: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = serviceWith(prisma as unknown as Partial<PrismaService>);

    await expect(
      service.consume('raw-token', 'email_verification'),
    ).resolves.toEqual({
      accountId: 'account-1',
    });
    await expect(
      service.consume('raw-token', 'email_verification'),
    ).resolves.toBeNull();
    expect(tx.accountToken.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.accountToken.findUnique).toHaveBeenCalledTimes(1);
  });

  it('returns null when token row is not found despite update count claim', async () => {
    const tx = {
      accountToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (arg: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = serviceWith(prisma as unknown as Partial<PrismaService>);

    await expect(
      service.consume('ghost-token', 'password_recovery'),
    ).resolves.toBeNull();
    expect(tx.accountToken.findUnique).toHaveBeenCalled();
  });

  describe('revoke', () => {
    it('revokes matching tokens and returns the updated count', async () => {
      const prisma = {
        accountToken: {
          updateMany: jest.fn().mockResolvedValue({ count: 3 }),
        },
      };
      const service = serviceWith(prisma as unknown as Partial<PrismaService>);

      const revokedCount = await service.revoke('acc-1', 'password_recovery');
      expect(revokedCount).toBe(3);
      const calls = prisma.accountToken.updateMany.mock.calls as unknown as [
        [{ data: { revokedAt: Date } }],
      ];
      const call = calls[0][0];
      expect(call.data.revokedAt).toBeInstanceOf(Date);
      expect(prisma.accountToken.updateMany).toHaveBeenCalledWith({
        where: {
          accountId: 'acc-1',
          purpose: 'password_recovery',
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: call.data.revokedAt },
      });
    });

    it('returns 0 when updateMany result count is undefined', async () => {
      const prisma = {
        accountToken: {
          updateMany: jest.fn().mockResolvedValue(null),
        },
      };
      const service = serviceWith(prisma as unknown as Partial<PrismaService>);

      const revokedCount = await service.revoke('acc-1', 'password_recovery');
      expect(revokedCount).toBe(0);
    });
  });

  describe('isAccountTokenPurpose', () => {
    it('returns true for all ACCOUNT_TOKEN_PURPOSES', () => {
      for (const purpose of ACCOUNT_TOKEN_PURPOSES) {
        expect(isAccountTokenPurpose(purpose)).toBe(true);
      }
    });

    it('returns false for unknown or invalid purposes', () => {
      expect(isAccountTokenPurpose('session_refresh')).toBe(false);
      expect(isAccountTokenPurpose('PASSWORD_RECOVERY')).toBe(false);
      expect(isAccountTokenPurpose('')).toBe(false);
      expect(isAccountTokenPurpose(null)).toBe(false);
    });
  });
});
