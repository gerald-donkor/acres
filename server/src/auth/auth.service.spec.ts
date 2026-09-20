import { Test, type TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ANONYMOUS_SESSION, type AccountProfile } from '@acres/shared';
import { AuthService } from './auth.service';
import { AccountsService } from '../accounts/accounts.service';
import { SessionsService } from '../sessions/sessions.service';
import { AccountTokensService } from '../identity/account-tokens.service';
import { MailService } from '../mail/mail.service';
import { AcresConfigService } from '../config/acres-config.service';
import { ApiException } from '../common/api-exception';
import type { SessionContext } from '../sessions/authenticated-request';
import type { Account } from '../generated/prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let mockAccounts: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    verifyPassword: jest.Mock;
    toProfile: jest.Mock;
    updatePassword: jest.Mock;
  };
  let mockSessions: {
    issue: jest.Mock;
    resolve: jest.Mock;
    revoke: jest.Mock;
    revokeAllForAccount: jest.Mock;
  };
  let mockAccountTokens: {
    issue: jest.Mock;
    consume: jest.Mock;
    revoke: jest.Mock;
  };
  let mockMail: {
    sendPasswordRecoveryEmail: jest.Mock;
  };
  let mockConfig: {
    clientOrigin: string;
  };

  const sampleAccount: Account = {
    id: 'acc-123',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    displayName: 'Test User',
    createdAt: new Date('2026-09-20T10:00:00.000Z'),
    updatedAt: new Date('2026-09-20T10:00:00.000Z'),
  };

  const sampleProfile: AccountProfile = {
    id: 'acc-123',
    email: 'test@example.com',
    displayName: 'Test User',
    createdAt: '2026-09-20T10:00:00.000Z',
  };

  const sessionExpiry = new Date('2026-10-20T10:00:00.000Z');

  beforeEach(async () => {
    mockAccounts = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      verifyPassword: jest.fn(),
      toProfile: jest.fn(),
      updatePassword: jest.fn(),
    };

    mockSessions = {
      issue: jest.fn(),
      resolve: jest.fn(),
      revoke: jest.fn(),
      revokeAllForAccount: jest.fn(),
    };

    mockAccountTokens = {
      issue: jest.fn(),
      consume: jest.fn(),
      revoke: jest.fn(),
    };

    mockMail = {
      sendPasswordRecoveryEmail: jest.fn(),
    };

    mockConfig = {
      clientOrigin: 'https://app.acres.example',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AccountsService, useValue: mockAccounts },
        { provide: SessionsService, useValue: mockSessions },
        { provide: AccountTokensService, useValue: mockAccountTokens },
        { provide: MailService, useValue: mockMail },
        { provide: AcresConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Suppress expected logger output during tests
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('creates an account and starts a session when email is available', async () => {
      mockAccounts.findByEmail.mockResolvedValue(null);
      mockAccounts.create.mockResolvedValue(sampleAccount);
      mockAccounts.toProfile.mockReturnValue(sampleProfile);
      mockSessions.issue.mockResolvedValue({
        token: 'session-token-abc',
        expiresAt: sessionExpiry,
      });

      const input = {
        email: 'test@example.com',
        password: 'Password123!',
        displayName: 'Test User',
      };

      const result = await service.register(input);

      expect(mockAccounts.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockAccounts.create).toHaveBeenCalledWith(input);
      expect(mockAccounts.toProfile).toHaveBeenCalledWith(sampleAccount);
      expect(mockSessions.issue).toHaveBeenCalledWith('acc-123');

      expect(result).toEqual({
        profile: {
          authenticated: true,
          account: sampleProfile,
          expiresAt: sessionExpiry.toISOString(),
        },
        token: 'session-token-abc',
        expiresAt: sessionExpiry,
      });
    });

    it('rejects registration and logs warning if account already exists with same email', async () => {
      mockAccounts.findByEmail.mockResolvedValue(sampleAccount);

      await expect(
        service.register({
          email: 'test@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ApiException);

      expect(mockAccounts.create).not.toHaveBeenCalled();
      expect(mockSessions.issue).not.toHaveBeenCalled();
    });

    it('bubbles up error if accounts.create throws an ApiException (e.g. race condition unique constraint)', async () => {
      mockAccounts.findByEmail.mockResolvedValue(null);
      mockAccounts.create.mockRejectedValue(ApiException.invalidCredentials());

      await expect(
        service.register({
          email: 'test@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ApiException);

      expect(mockSessions.issue).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('authenticates valid credentials and starts a session', async () => {
      mockAccounts.findByEmail.mockResolvedValue(sampleAccount);
      mockAccounts.verifyPassword.mockResolvedValue(true);
      mockAccounts.toProfile.mockReturnValue(sampleProfile);
      mockSessions.issue.mockResolvedValue({
        token: 'login-session-token',
        expiresAt: sessionExpiry,
      });

      const result = await service.login({
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(mockAccounts.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockAccounts.verifyPassword).toHaveBeenCalledWith(
        sampleAccount,
        'Password123!',
      );
      expect(mockSessions.issue).toHaveBeenCalledWith('acc-123');
      expect(result).toEqual({
        profile: {
          authenticated: true,
          account: sampleProfile,
          expiresAt: sessionExpiry.toISOString(),
        },
        token: 'login-session-token',
        expiresAt: sessionExpiry,
      });
    });

    it('rejects login if account is not found (anti-enumeration check)', async () => {
      mockAccounts.findByEmail.mockResolvedValue(null);
      mockAccounts.verifyPassword.mockResolvedValue(false);

      await expect(
        service.login({
          email: 'nonexistent@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ApiException);

      expect(mockAccounts.verifyPassword).toHaveBeenCalledWith(
        null,
        'Password123!',
      );
      expect(mockSessions.issue).not.toHaveBeenCalled();
    });

    it('rejects login if password does not match', async () => {
      mockAccounts.findByEmail.mockResolvedValue(sampleAccount);
      mockAccounts.verifyPassword.mockResolvedValue(false);

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(ApiException);

      expect(mockAccounts.verifyPassword).toHaveBeenCalledWith(
        sampleAccount,
        'WrongPassword!',
      );
      expect(mockSessions.issue).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the session by ID', async () => {
      mockSessions.revoke.mockResolvedValue(undefined);

      await service.logout('session-id-456');

      expect(mockSessions.revoke).toHaveBeenCalledWith('session-id-456');
    });

    it('propagates errors if session revocation fails', async () => {
      mockSessions.revoke.mockRejectedValue(new Error('Session DB error'));

      await expect(service.logout('session-id-456')).rejects.toThrow(
        'Session DB error',
      );
    });
  });

  describe('forgotPassword', () => {
    it('issues recovery token and sends email when account exists', async () => {
      mockAccounts.findByEmail.mockResolvedValue(sampleAccount);
      mockAccountTokens.issue.mockResolvedValue({
        token: 'raw-recovery-token-xyz',
        expiresAt: new Date(),
      });
      mockMail.sendPasswordRecoveryEmail.mockResolvedValue(undefined);

      const result = await service.forgotPassword({
        email: 'test@example.com',
      });

      expect(mockAccounts.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockAccountTokens.issue).toHaveBeenCalledWith(
        'acc-123',
        'password_recovery',
      );
      expect(mockMail.sendPasswordRecoveryEmail).toHaveBeenCalledWith(
        'test@example.com',
        'https://app.acres.example/reset-password?token=raw-recovery-token-xyz',
      );
      expect(result).toEqual({ accepted: true });
    });

    it('encodes the token in the password reset URL', async () => {
      mockAccounts.findByEmail.mockResolvedValue(sampleAccount);
      mockAccountTokens.issue.mockResolvedValue({
        token: 'raw/token+with=special chars',
        expiresAt: new Date(),
      });
      mockMail.sendPasswordRecoveryEmail.mockResolvedValue(undefined);

      await service.forgotPassword({ email: 'test@example.com' });

      expect(mockMail.sendPasswordRecoveryEmail).toHaveBeenCalledWith(
        'test@example.com',
        'https://app.acres.example/reset-password?token=raw%2Ftoken%2Bwith%3Dspecial%20chars',
      );
    });

    it('performs timing-safe dummy check and returns accepted: true when account not found', async () => {
      mockAccounts.findByEmail.mockResolvedValue(null);
      mockAccounts.verifyPassword.mockResolvedValue(false);

      const result = await service.forgotPassword({
        email: 'unknown@example.com',
      });

      expect(mockAccounts.findByEmail).toHaveBeenCalledWith(
        'unknown@example.com',
      );
      expect(mockAccounts.verifyPassword).toHaveBeenCalledWith(
        null,
        'dummy-password-check',
      );
      expect(mockAccountTokens.issue).not.toHaveBeenCalled();
      expect(mockMail.sendPasswordRecoveryEmail).not.toHaveBeenCalled();
      expect(result).toEqual({ accepted: true });
    });

    it('handles mail delivery error gracefully without failing or throwing', async () => {
      mockAccounts.findByEmail.mockResolvedValue(sampleAccount);
      mockAccountTokens.issue.mockResolvedValue({
        token: 'recovery-token',
        expiresAt: new Date(),
      });
      mockMail.sendPasswordRecoveryEmail.mockRejectedValue(
        new Error('SMTP down'),
      );

      const result = await service.forgotPassword({
        email: 'test@example.com',
      });

      expect(result).toEqual({ accepted: true });
    });
  });

  describe('resetPassword', () => {
    it('consumes token, updates password, revokes all sessions and remaining tokens on success', async () => {
      mockAccountTokens.consume.mockResolvedValue({ accountId: 'acc-123' });
      mockAccounts.updatePassword.mockResolvedValue(sampleAccount);
      mockSessions.revokeAllForAccount.mockResolvedValue(2);
      mockAccountTokens.revoke.mockResolvedValue(1);

      const result = await service.resetPassword({
        token: 'valid-token',
        password: 'NewPassword123!',
      });

      expect(mockAccountTokens.consume).toHaveBeenCalledWith(
        'valid-token',
        'password_recovery',
      );
      expect(mockAccounts.updatePassword).toHaveBeenCalledWith(
        'acc-123',
        'NewPassword123!',
      );
      expect(mockSessions.revokeAllForAccount).toHaveBeenCalledWith('acc-123');
      expect(mockAccountTokens.revoke).toHaveBeenCalledWith(
        'acc-123',
        'password_recovery',
      );
      expect(result).toEqual({ reset: true });
    });

    it('throws ApiException.invalidOrExpiredToken when token is invalid or already consumed', async () => {
      mockAccountTokens.consume.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: 'invalid-token',
          password: 'NewPassword123!',
        }),
      ).rejects.toThrow(ApiException);

      expect(mockAccounts.updatePassword).not.toHaveBeenCalled();
      expect(mockSessions.revokeAllForAccount).not.toHaveBeenCalled();
      expect(mockAccountTokens.revoke).not.toHaveBeenCalled();
    });
  });

  describe('describe', () => {
    it('returns ANONYMOUS_SESSION when session is undefined', () => {
      const result = service.describe(undefined);
      expect(result).toEqual(ANONYMOUS_SESSION);
      expect(result.authenticated).toBe(false);
      expect(result.account).toBeNull();
      expect(result.expiresAt).toBeNull();
    });

    it('returns authenticated SessionProfile when session is valid', () => {
      const sessionContext: SessionContext = {
        sessionId: 'sess-1',
        account: sampleProfile,
        expiresAt: sessionExpiry,
      };

      const result = service.describe(sessionContext);
      expect(result).toEqual({
        authenticated: true,
        account: sampleProfile,
        expiresAt: sessionExpiry.toISOString(),
      });
    });
  });
});
