import type { Request, Response } from 'express';
import {
  ANONYMOUS_SESSION,
  CSRF_HEADER_NAME,
  type AccountProfile,
  type ForgotPasswordResult,
  type ResetPasswordResult,
  type SessionProfile,
} from '@acres/shared';
import { AuthController } from './auth.controller';
import type { AuthService, StartedSession } from './auth.service';
import type { SessionsService } from '../sessions/sessions.service';
import type { CsrfService } from '../security/csrf.service';
import type {
  AuthenticatedRequest,
  RequestWithSession,
  SessionContext,
} from '../sessions/authenticated-request';
import type { RegisterAccountDto } from './dto/register-account.dto';
import type { LoginDto } from './dto/login.dto';
import type { ForgotPasswordDto } from './dto/forgot-password.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: {
    register: jest.Mock;
    login: jest.Mock;
    logout: jest.Mock;
    forgotPassword: jest.Mock;
    resetPassword: jest.Mock;
    describe: jest.Mock;
  };
  let mockSessionsService: {
    cookieName: string;
    writeCookie: jest.Mock;
    clearCookie: jest.Mock;
  };
  let mockCsrfService: {
    issueToken: jest.Mock;
  };

  const sampleAccount: AccountProfile = {
    id: 'acc-test-123',
    email: 'ada@example.com',
    displayName: 'Ada Lovelace',
    createdAt: '2026-09-20T10:00:00.000Z',
  };

  const sessionExpiry = new Date('2026-10-20T10:00:00.000Z');

  beforeEach(() => {
    mockAuthService = {
      register: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
      describe: jest.fn(),
    };

    mockSessionsService = {
      cookieName: 'acres_session',
      writeCookie: jest.fn(),
      clearCookie: jest.fn(),
    };

    mockCsrfService = {
      issueToken: jest.fn(),
    };

    controller = new AuthController(
      mockAuthService as unknown as AuthService,
      mockSessionsService as unknown as SessionsService,
      mockCsrfService as unknown as CsrfService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('csrfToken', () => {
    it('verifies csrf.issueToken(req, res) is called and { csrfToken, headerName: CSRF_HEADER_NAME } is returned', () => {
      const req = {} as Request;
      const res = {} as Response;
      const token = 'issued-csrf-token-xyz';

      mockCsrfService.issueToken.mockReturnValue(token);

      const result = controller.csrfToken(req, res);

      expect(mockCsrfService.issueToken).toHaveBeenCalledTimes(1);
      expect(mockCsrfService.issueToken).toHaveBeenCalledWith(req, res);
      expect(result).toEqual({
        csrfToken: token,
        headerName: CSRF_HEADER_NAME,
      });
    });
  });

  describe('register', () => {
    it('verifies auth.register(body) is called, sessions.writeCookie(res, token, expiresAt) is called, and returns profile', async () => {
      const body: RegisterAccountDto = {
        email: 'ada@example.com',
        password: 'secure-password-123',
        displayName: 'Ada Lovelace',
      };
      const res = {} as Response;
      const startedSession: StartedSession = {
        profile: {
          authenticated: true,
          account: sampleAccount,
          expiresAt: sessionExpiry.toISOString(),
        },
        token: 'raw-session-token-reg',
        expiresAt: sessionExpiry,
      };

      mockAuthService.register.mockResolvedValue(startedSession);

      const result = await controller.register(body, res);

      expect(mockAuthService.register).toHaveBeenCalledTimes(1);
      expect(mockAuthService.register).toHaveBeenCalledWith(body);
      expect(mockSessionsService.writeCookie).toHaveBeenCalledTimes(1);
      expect(mockSessionsService.writeCookie).toHaveBeenCalledWith(
        res,
        startedSession.token,
        startedSession.expiresAt,
      );
      expect(result).toEqual(startedSession.profile);
    });

    it('does not write session cookie when auth.register rejects', async () => {
      const body: RegisterAccountDto = {
        email: 'duplicate@example.com',
        password: 'Password123!',
        displayName: 'Duplicate User',
      };
      const res = {} as Response;
      mockAuthService.register.mockRejectedValue(new Error('Duplicate email'));

      await expect(controller.register(body, res)).rejects.toThrow(
        'Duplicate email',
      );
      expect(mockSessionsService.writeCookie).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('verifies auth.login(body) is called, sessions.writeCookie(res, token, expiresAt) is called, and returns profile', async () => {
      const body: LoginDto = {
        email: 'ada@example.com',
        password: 'correct-password',
      };
      const res = {} as Response;
      const startedSession: StartedSession = {
        profile: {
          authenticated: true,
          account: sampleAccount,
          expiresAt: sessionExpiry.toISOString(),
        },
        token: 'raw-session-token-login',
        expiresAt: sessionExpiry,
      };

      mockAuthService.login.mockResolvedValue(startedSession);

      const result = await controller.login(body, res);

      expect(mockAuthService.login).toHaveBeenCalledTimes(1);
      expect(mockAuthService.login).toHaveBeenCalledWith(body);
      expect(mockSessionsService.writeCookie).toHaveBeenCalledTimes(1);
      expect(mockSessionsService.writeCookie).toHaveBeenCalledWith(
        res,
        startedSession.token,
        startedSession.expiresAt,
      );
      expect(result).toEqual(startedSession.profile);
    });

    it('does not write session cookie when auth.login rejects', async () => {
      const body: LoginDto = {
        email: 'ada@example.com',
        password: 'wrong-password',
      };
      const res = {} as Response;
      mockAuthService.login.mockRejectedValue(new Error('Invalid credentials'));

      await expect(controller.login(body, res)).rejects.toThrow(
        'Invalid credentials',
      );
      expect(mockSessionsService.writeCookie).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('verifies auth.forgotPassword(body) is called and returns { accepted: true }', async () => {
      const body: ForgotPasswordDto = {
        email: 'ada@example.com',
      };
      const expectedResult: ForgotPasswordResult = { accepted: true };

      mockAuthService.forgotPassword.mockResolvedValue(expectedResult);

      const result = await controller.forgotPassword(body);

      expect(mockAuthService.forgotPassword).toHaveBeenCalledTimes(1);
      expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(body);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('resetPassword', () => {
    it('verifies auth.resetPassword(body) is called and returns { reset: true }', async () => {
      const body: ResetPasswordDto = {
        token: 'valid-reset-token-456',
        password: 'new-strong-password',
      };
      const expectedResult: ResetPasswordResult = { reset: true };

      mockAuthService.resetPassword.mockResolvedValue(expectedResult);

      const result = await controller.resetPassword(body);

      expect(mockAuthService.resetPassword).toHaveBeenCalledTimes(1);
      expect(mockAuthService.resetPassword).toHaveBeenCalledWith(body);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('logout', () => {
    it('verifies auth.logout(sessionId) is called with session context session ID, sessions.clearCookie(res) is called, and returns { signedOut: true }', async () => {
      const sessionId = 'session-to-revoke-789';
      const req = {
        sessionContext: {
          sessionId,
          account: sampleAccount,
          expiresAt: sessionExpiry,
        },
      } as AuthenticatedRequest;
      const res = {} as Response;

      mockAuthService.logout.mockResolvedValue(undefined);

      const result = await controller.logout(req, res);

      expect(mockAuthService.logout).toHaveBeenCalledTimes(1);
      expect(mockAuthService.logout).toHaveBeenCalledWith(sessionId);
      expect(mockSessionsService.clearCookie).toHaveBeenCalledTimes(1);
      expect(mockSessionsService.clearCookie).toHaveBeenCalledWith(res);
      expect(result).toEqual({ signedOut: true });
    });
  });

  describe('session', () => {
    it('when sessionContext is undefined and request has session cookie, calls sessions.clearCookie(res) and returns anonymous profile', () => {
      const req = {
        sessionContext: undefined,
        cookies: {
          [mockSessionsService.cookieName]: 'stale-expired-token',
        },
      } as unknown as RequestWithSession;
      const res = {} as Response;

      mockAuthService.describe.mockReturnValue(ANONYMOUS_SESSION);

      const result = controller.session(req, res);

      expect(mockSessionsService.clearCookie).toHaveBeenCalledTimes(1);
      expect(mockSessionsService.clearCookie).toHaveBeenCalledWith(res);
      expect(mockAuthService.describe).toHaveBeenCalledTimes(1);
      expect(mockAuthService.describe).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(ANONYMOUS_SESSION);
    });

    it('when sessionContext is undefined and request lacks session cookie, does NOT call sessions.clearCookie(res) and returns anonymous profile', () => {
      const reqWithoutCookie = {
        sessionContext: undefined,
        cookies: {},
      } as unknown as RequestWithSession;
      const res = {} as Response;

      mockAuthService.describe.mockReturnValue(ANONYMOUS_SESSION);

      const result = controller.session(reqWithoutCookie, res);

      expect(mockSessionsService.clearCookie).not.toHaveBeenCalled();
      expect(mockAuthService.describe).toHaveBeenCalledTimes(1);
      expect(mockAuthService.describe).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(ANONYMOUS_SESSION);
    });

    it('when sessionContext is undefined and request cookies property is undefined, does NOT call sessions.clearCookie(res) and returns anonymous profile', () => {
      const reqWithoutCookiesProp = {
        sessionContext: undefined,
      } as RequestWithSession;
      const res = {} as Response;

      mockAuthService.describe.mockReturnValue(ANONYMOUS_SESSION);

      const result = controller.session(reqWithoutCookiesProp, res);

      expect(mockSessionsService.clearCookie).not.toHaveBeenCalled();
      expect(mockAuthService.describe).toHaveBeenCalledTimes(1);
      expect(mockAuthService.describe).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(ANONYMOUS_SESSION);
    });

    it('when sessionContext is defined, does NOT call sessions.clearCookie(res) and returns authenticated profile from auth.describe(context)', () => {
      const sessionContext: SessionContext = {
        sessionId: 'active-session-id',
        account: sampleAccount,
        expiresAt: sessionExpiry,
      };
      const req = {
        sessionContext,
        cookies: {
          [mockSessionsService.cookieName]: 'valid-token',
        },
      } as unknown as RequestWithSession;
      const res = {} as Response;
      const authenticatedProfile: SessionProfile = {
        authenticated: true,
        account: sampleAccount,
        expiresAt: sessionExpiry.toISOString(),
      };

      mockAuthService.describe.mockReturnValue(authenticatedProfile);

      const result = controller.session(req, res);

      expect(mockSessionsService.clearCookie).not.toHaveBeenCalled();
      expect(mockAuthService.describe).toHaveBeenCalledTimes(1);
      expect(mockAuthService.describe).toHaveBeenCalledWith(sessionContext);
      expect(result).toEqual(authenticatedProfile);
    });
  });
});
