import { ExecutionContext, HttpStatus } from '@nestjs/common';
import type { AcresConfigService } from '../config/acres-config.service';
import type {
  RequestWithSession,
  SessionContext,
} from './authenticated-request';
import { getAccountFromContext } from './current-account.decorator';
import { OptionalSessionGuard, SessionGuard } from './session.guard';
import type { SessionsService } from './sessions.service';

function createMockExecutionContext(
  request: Partial<RequestWithSession> = {},
): { context: ExecutionContext; req: RequestWithSession } {
  const req = {
    cookies: {},
    ...request,
  } as unknown as RequestWithSession;

  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getType: () => 'http',
    getClass: () => class {},
    getHandler: () => () => {},
    getArgs: () => [req],
    getArgByIndex: () => req,
    switchToRpc: () => ({}) as never,
    switchToWs: () => ({}) as never,
  } as unknown as ExecutionContext;

  return { context, req };
}

describe('Session guards and decorators', () => {
  const sessionCookieName = 'acres_session';
  let mockSessions: {
    resolve: jest.Mock;
  };
  let mockConfig: { sessionCookieName: string };

  const mockSessionContext: SessionContext = {
    sessionId: 'sess-uuid-1',
    account: {
      id: 'acc-uuid-1',
      email: 'user@example.com',
      displayName: 'Test User',
      createdAt: '2026-08-20T00:00:00.000Z',
    },
    expiresAt: new Date(Date.now() + 86400000),
  };

  beforeEach(() => {
    mockSessions = {
      resolve: jest.fn(),
    };
    mockConfig = {
      sessionCookieName,
    };
  });

  describe('SessionGuard', () => {
    let guard: SessionGuard;

    beforeEach(() => {
      guard = new SessionGuard(
        mockSessions as unknown as SessionsService,
        mockConfig as unknown as AcresConfigService,
      );
    });

    it('throws unauthenticated when cookies object is undefined', async () => {
      const { context } = createMockExecutionContext({
        cookies: undefined as unknown as Record<string, string>,
      });

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
        status: HttpStatus.UNAUTHORIZED,
      });
      expect(mockSessions.resolve).not.toHaveBeenCalled();
    });

    it('throws unauthenticated when session cookie is missing', async () => {
      const { context } = createMockExecutionContext({
        cookies: { other_cookie: 'xyz' },
      });

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
        status: HttpStatus.UNAUTHORIZED,
      });
      expect(mockSessions.resolve).not.toHaveBeenCalled();
    });

    it('throws unauthenticated when session cookie is empty string', async () => {
      const { context } = createMockExecutionContext({
        cookies: { [sessionCookieName]: '' },
      });

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
        status: HttpStatus.UNAUTHORIZED,
      });
      expect(mockSessions.resolve).not.toHaveBeenCalled();
    });

    it('throws unauthenticated when session cookie is non-string', async () => {
      const { context } = createMockExecutionContext({
        cookies: { [sessionCookieName]: 12345 } as unknown as Record<
          string,
          string
        >,
      });

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
        status: HttpStatus.UNAUTHORIZED,
      });
      expect(mockSessions.resolve).not.toHaveBeenCalled();
    });

    it('throws unauthenticated when session token fails to resolve', async () => {
      mockSessions.resolve.mockResolvedValueOnce(null);
      const { context, req } = createMockExecutionContext({
        cookies: { [sessionCookieName]: 'expired-or-invalid-token' },
      });

      await expect(guard.canActivate(context)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
        status: HttpStatus.UNAUTHORIZED,
      });
      expect(mockSessions.resolve).toHaveBeenCalledWith(
        'expired-or-invalid-token',
      );
      expect(req.sessionContext).toBeUndefined();
    });

    it('attaches sessionContext and returns true when session token resolves', async () => {
      mockSessions.resolve.mockResolvedValueOnce(mockSessionContext);
      const { context, req } = createMockExecutionContext({
        cookies: { [sessionCookieName]: 'valid-session-token' },
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockSessions.resolve).toHaveBeenCalledWith('valid-session-token');
      expect(req.sessionContext).toEqual(mockSessionContext);
    });

    it('respects dynamic custom cookie name from config', async () => {
      mockConfig.sessionCookieName = '__Host-custom_sess';
      mockSessions.resolve.mockResolvedValueOnce(mockSessionContext);
      const { context, req } = createMockExecutionContext({
        cookies: {
          '__Host-custom_sess': 'token-under-custom-name',
          [sessionCookieName]: 'ignored-old-cookie',
        },
      });

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockSessions.resolve).toHaveBeenCalledWith(
        'token-under-custom-name',
      );
      expect(req.sessionContext).toEqual(mockSessionContext);
    });
  });

  describe('OptionalSessionGuard', () => {
    let optionalGuard: OptionalSessionGuard;

    beforeEach(() => {
      optionalGuard = new OptionalSessionGuard(
        mockSessions as unknown as SessionsService,
        mockConfig as unknown as AcresConfigService,
      );
    });

    it('allows request when cookie is missing, leaving sessionContext undefined', async () => {
      const { context, req } = createMockExecutionContext({
        cookies: {},
      });

      const result = await optionalGuard.canActivate(context);

      expect(result).toBe(true);
      expect(req.sessionContext).toBeUndefined();
      expect(mockSessions.resolve).not.toHaveBeenCalled();
    });

    it('allows request when token resolution returns null, leaving sessionContext undefined', async () => {
      mockSessions.resolve.mockResolvedValueOnce(null);
      const { context, req } = createMockExecutionContext({
        cookies: { [sessionCookieName]: 'invalid-token' },
      });

      const result = await optionalGuard.canActivate(context);

      expect(result).toBe(true);
      expect(req.sessionContext).toBeUndefined();
      expect(mockSessions.resolve).toHaveBeenCalledWith('invalid-token');
    });

    it('attaches sessionContext and returns true when session token is valid', async () => {
      mockSessions.resolve.mockResolvedValueOnce(mockSessionContext);
      const { context, req } = createMockExecutionContext({
        cookies: { [sessionCookieName]: 'valid-token' },
      });

      const result = await optionalGuard.canActivate(context);

      expect(result).toBe(true);
      expect(req.sessionContext).toEqual(mockSessionContext);
      expect(mockSessions.resolve).toHaveBeenCalledWith('valid-token');
    });
  });

  describe('getAccountFromContext', () => {
    it('returns the account profile when sessionContext is present', () => {
      const { context } = createMockExecutionContext({
        sessionContext: mockSessionContext,
      });

      const result = getAccountFromContext(null, context);

      expect(result).toEqual(mockSessionContext.account);
    });

    it('throws unauthenticated when sessionContext is undefined', () => {
      const { context } = createMockExecutionContext({});
      let error: unknown;
      try {
        getAccountFromContext(null, context);
      } catch (err) {
        error = err;
      }
      expect(error).toMatchObject({
        code: 'UNAUTHENTICATED',
        status: HttpStatus.UNAUTHORIZED,
      });
    });
  });
});
