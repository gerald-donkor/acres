import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService, BCRYPT_COST } from './accounts.service';
import { normaliseEmail, toAccountProfile } from './account-profile';
import { ApiException } from '../common/api-exception';
import * as bcrypt from 'bcryptjs';

describe('AccountsService', () => {
  let service: AccountsService;
  let mockPrisma: {
    account: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  const sampleAccount = {
    id: 'acc-uuid-1',
    email: 'user@example.com',
    passwordHash:
      '$2a$12$e8p4lEwS775j54vKq02a9.x4g1234567890123456789012345678',
    displayName: 'Test User',
    createdAt: new Date('2026-09-20T10:00:00.000Z'),
    updatedAt: new Date('2026-09-20T10:00:00.000Z'),
  };

  beforeEach(async () => {
    mockPrisma = {
      account: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByEmail', () => {
    it('normalises email by lowercasing and trimming before querying', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(sampleAccount);

      const result = await service.findByEmail('   USER@EXAMPLE.com  ');

      expect(mockPrisma.account.findUnique).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });
      expect(result).toEqual(sampleAccount);
    });

    it('returns null when account is not found', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);

      const result = await service.findByEmail('missing@example.com');

      expect(mockPrisma.account.findUnique).toHaveBeenCalledWith({
        where: { email: 'missing@example.com' },
      });
      expect(result).toBeNull();
    });

    it('propagates unexpected database errors', async () => {
      mockPrisma.account.findUnique.mockRejectedValue(
        new Error('DB connection failure'),
      );

      await expect(service.findByEmail('user@example.com')).rejects.toThrow(
        'DB connection failure',
      );
    });
  });

  describe('findById', () => {
    it('queries account by id', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(sampleAccount);

      const result = await service.findById('acc-uuid-1');

      expect(mockPrisma.account.findUnique).toHaveBeenCalledWith({
        where: { id: 'acc-uuid-1' },
      });
      expect(result).toEqual(sampleAccount);
    });

    it('returns null when id does not exist', async () => {
      mockPrisma.account.findUnique.mockResolvedValue(null);

      const result = await service.findById('unknown-id');

      expect(mockPrisma.account.findUnique).toHaveBeenCalledWith({
        where: { id: 'unknown-id' },
      });
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates an account with hashed password (cost 12), normalised email, and trimmed display name', async () => {
      const createdAccount = {
        ...sampleAccount,
        displayName: 'Jane Doe',
      };
      mockPrisma.account.create.mockResolvedValue(createdAccount);

      const result = await service.create({
        email: '  Jane.Doe@Example.com ',
        password: 'securePassword123!',
        displayName: '  Jane Doe  ',
      });

      expect(mockPrisma.account.create).toHaveBeenCalledTimes(1);
      const createCalls = mockPrisma.account.create.mock.calls as unknown as [
        [
          {
            data: {
              email: string;
              displayName: string | null;
              passwordHash: string;
            };
          },
        ],
      ];
      const callData = createCalls[0][0].data;
      expect(callData.email).toBe('jane.doe@example.com');
      expect(callData.displayName).toBe('Jane Doe');
      expect(callData.passwordHash).toMatch(/^\$2[aby]\$12\$/);
      expect(
        bcrypt.compareSync('securePassword123!', callData.passwordHash),
      ).toBe(true);
      expect(result).toEqual(createdAccount);
    });

    it('normalises empty or whitespace-only displayName to null', async () => {
      mockPrisma.account.create.mockResolvedValue(sampleAccount);

      await service.create({
        email: 'user@example.com',
        password: 'password123',
        displayName: '   ',
      });

      expect(mockPrisma.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          displayName: null,
        }) as unknown,
      });
    });

    it('defaults displayName to null when omitted', async () => {
      mockPrisma.account.create.mockResolvedValue(sampleAccount);

      await service.create({
        email: 'user@example.com',
        password: 'password123',
      });

      expect(mockPrisma.account.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          displayName: null,
        }) as unknown,
      });
    });

    it('catches P2002 unique constraint error and throws ApiException.invalidCredentials', async () => {
      expect.assertions(3);
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '7.9.1',
        },
      );
      mockPrisma.account.create.mockRejectedValue(p2002);

      try {
        await service.create({
          email: 'duplicate@example.com',
          password: 'password123',
        });
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ApiException);
        const apiEx = err as ApiException;
        expect(apiEx.code).toBe('INVALID_CREDENTIALS');
        expect(apiEx.getStatus()).toBe(401);
      }
    });

    it('rethrows non-P2002 Prisma errors', async () => {
      const p2003 = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        {
          code: 'P2003',
          clientVersion: '7.9.1',
        },
      );
      mockPrisma.account.create.mockRejectedValue(p2003);

      await expect(
        service.create({
          email: 'user@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(p2003);
    });

    it('rethrows generic unexpected errors', async () => {
      mockPrisma.account.create.mockRejectedValue(
        new Error('Unexpected disk failure'),
      );

      await expect(
        service.create({
          email: 'user@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow('Unexpected disk failure');
    });
  });

  describe('verifyPassword', () => {
    it('returns true when account exists and password matches hash', async () => {
      const password = 'mySecretPassword!';
      const passwordHash = bcrypt.hashSync(password, 4); // quick hash for test
      const account = { ...sampleAccount, passwordHash };

      const result = await service.verifyPassword(account, password);
      expect(result).toBe(true);
    });

    it('returns false when account exists but password does not match', async () => {
      const password = 'mySecretPassword!';
      const passwordHash = bcrypt.hashSync(password, 4);
      const account = { ...sampleAccount, passwordHash };

      const result = await service.verifyPassword(account, 'wrongPassword');
      expect(result).toBe(false);
    });

    it('returns false and performs comparison when account is null', async () => {
      const result = await service.verifyPassword(null, 'somePassword');
      expect(result).toBe(false);
    });
  });

  describe('toProfile', () => {
    it('transforms an Account entity into AccountProfile without leaking passwordHash', () => {
      const profile = service.toProfile(sampleAccount);

      expect(profile).toEqual({
        id: sampleAccount.id,
        email: sampleAccount.email,
        displayName: sampleAccount.displayName,
        createdAt: '2026-09-20T10:00:00.000Z',
      });
      expect(
        (profile as unknown as Record<string, unknown>).passwordHash,
      ).toBeUndefined();
    });
  });

  describe('updatePassword', () => {
    it('hashes the new password with BCRYPT_COST and updates the account', async () => {
      const updatedAccount = { ...sampleAccount, passwordHash: 'newHash' };
      mockPrisma.account.update.mockResolvedValue(updatedAccount);

      const result = await service.updatePassword(
        'acc-uuid-1',
        'newSecret123!',
      );

      expect(mockPrisma.account.update).toHaveBeenCalledTimes(1);
      const updateCalls = mockPrisma.account.update.mock.calls as unknown as [
        [{ where: { id: string }; data: { passwordHash: string } }],
      ];
      const callArgs = updateCalls[0][0];
      expect(callArgs.where).toEqual({ id: 'acc-uuid-1' });
      expect(callArgs.data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
      expect(
        bcrypt.compareSync('newSecret123!', callArgs.data.passwordHash),
      ).toBe(true);
      expect(result).toEqual(updatedAccount);
    });
  });

  describe('account-profile helpers', () => {
    it('toAccountProfile converts dates to ISO string and drops passwordHash', () => {
      const profile = toAccountProfile(sampleAccount);
      expect(profile).toEqual({
        id: 'acc-uuid-1',
        email: 'user@example.com',
        displayName: 'Test User',
        createdAt: '2026-09-20T10:00:00.000Z',
      });
    });

    it('normaliseEmail trims whitespace and lowercases input', () => {
      expect(normaliseEmail('  Alice@EXAMPLE.COM ')).toBe('alice@example.com');
      expect(normaliseEmail('bob@example.com')).toBe('bob@example.com');
    });
  });

  describe('BCRYPT_COST', () => {
    it('is set to 12 as per OWASP recommendation', () => {
      expect(BCRYPT_COST).toBe(12);
    });
  });
});
