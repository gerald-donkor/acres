import type { Request, Response } from 'express';
import {
  CSRF_ERROR_CODE,
  CSRF_ERROR_MESSAGE,
  CSRF_HEADER_NAME,
} from '@acres/shared';
import { CsrfService, csrfCookieName } from './csrf.service';
import type { AcresConfigService } from '../config/acres-config.service';

describe('CsrfService', () => {
  const secret = '12345678901234567890123456789012'; // 32 chars

  function createMockConfig(isProduction = false): AcresConfigService {
    return {
      sessionSecret: secret,
      sessionCookieName: 'acres_session',
      csrfCookieName: 'acres_csrf',
      isProduction,
    } as unknown as AcresConfigService;
  }

  function createMockResponse(): {
    res: Response;
    status: jest.Mock;
    json: jest.Mock;
    cookie: jest.Mock;
    setHeader: jest.Mock;
  } {
    const status = jest.fn();
    const json = jest.fn();
    const cookie = jest.fn();
    const setHeader = jest.fn();

    const res = {
      status,
      json,
      cookie,
      setHeader,
    } as unknown as Response;

    status.mockReturnValue(res);
    json.mockReturnValue(res);
    cookie.mockReturnValue(res);
    setHeader.mockReturnValue(res);

    return { res, status, json, cookie, setHeader };
  }

  describe('csrfCookieName', () => {
    it('returns the plain name in non-secure (development) environment', () => {
      expect(csrfCookieName('acres_csrf', false)).toBe('acres_csrf');
    });

    it('prefixes __Host- in secure (production) environment', () => {
      expect(csrfCookieName('acres_csrf', true)).toBe('__Host-acres_csrf');
    });
  });

  describe('initialization and token issuance', () => {
    it('initializes in development and issues a signed token', () => {
      const config = createMockConfig(false);
      const service = new CsrfService(config);

      const req = {
        cookies: { acres_session: 'session-xyz' },
        headers: {},
      } as unknown as Request;
      const { res, cookie } = createMockResponse();

      const token = service.issueToken(req, res);

      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      expect(cookie).toHaveBeenCalledWith(
        'acres_csrf',
        expect.any(String),
        expect.objectContaining({
          sameSite: 'lax',
          path: '/',
          secure: false,
          httpOnly: true,
        }),
      );
    });

    it('initializes in production and sets __Host- prefixed secure cookie', () => {
      const config = createMockConfig(true);
      const service = new CsrfService(config);

      const req = {
        cookies: { acres_session: 'session-prod' },
        headers: {},
      } as unknown as Request;
      const { res, cookie } = createMockResponse();

      const token = service.issueToken(req, res);

      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      expect(cookie).toHaveBeenCalledWith(
        '__Host-acres_csrf',
        expect.any(String),
        expect.objectContaining({
          sameSite: 'lax',
          path: '/',
          secure: true,
          httpOnly: true,
        }),
      );
    });

    it('handles requests with undefined cookies when generating token', () => {
      const config = createMockConfig(false);
      const service = new CsrfService(config);

      const req = {
        headers: {},
      } as unknown as Request;
      const { res, cookie } = createMockResponse();

      const token = service.issueToken(req, res);
      expect(typeof token).toBe('string');
      expect(cookie).toHaveBeenCalled();
    });
  });

  describe('protection middleware', () => {
    it('allows safe HTTP GET requests through without CSRF validation', () => {
      const config = createMockConfig(false);
      const service = new CsrfService(config);

      const req = {
        method: 'GET',
        headers: {},
        cookies: {},
      } as unknown as Request;
      const { res, status } = createMockResponse();
      const next = jest.fn();

      service.protection(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(status).not.toHaveBeenCalled();
    });

    it('allows safe HTTP HEAD requests through without CSRF validation', () => {
      const config = createMockConfig(false);
      const service = new CsrfService(config);

      const req = {
        method: 'HEAD',
        headers: {},
        cookies: {},
      } as unknown as Request;
      const { res, status } = createMockResponse();
      const next = jest.fn();

      service.protection(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(status).not.toHaveBeenCalled();
    });

    it('rejects POST request with missing CSRF token with HTTP 403 and CSRF_INVALID envelope', () => {
      const config = createMockConfig(false);
      const service = new CsrfService(config);

      const req = {
        method: 'POST',
        headers: {},
        cookies: {},
      } as unknown as Request;
      const { res, status, json } = createMockResponse();
      const next = jest.fn();

      service.protection(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({
        ok: false,
        error: {
          code: CSRF_ERROR_CODE,
          message: CSRF_ERROR_MESSAGE,
        },
      });
    });

    it('accepts POST request with matching token and cookie paired to session', () => {
      const config = createMockConfig(false);
      const service = new CsrfService(config);

      // 1. Issue token for session
      const issueReq = {
        cookies: { acres_session: 'session-abc' },
        headers: {},
      } as unknown as Request;
      const issueRes = createMockResponse();

      const token = service.issueToken(issueReq, issueRes.res);
      const cookieCalls = issueRes.cookie.mock.calls as [
        string,
        string,
        unknown,
      ][];
      const issuedCookieValue = cookieCalls[0]?.[1] ?? '';

      // 2. Perform POST with matching token in header and cookie in request
      const postReq = {
        method: 'POST',
        headers: {
          [CSRF_HEADER_NAME]: token,
        },
        cookies: {
          acres_session: 'session-abc',
          acres_csrf: issuedCookieValue,
        },
      } as unknown as Request;
      const { res, status } = createMockResponse();
      const next = jest.fn();

      service.protection(postReq, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(status).not.toHaveBeenCalled();
    });

    it('rejects POST request when session cookie has changed since token issuance', () => {
      const config = createMockConfig(false);
      const service = new CsrfService(config);

      // 1. Issue token for session-abc
      const issueReq = {
        cookies: { acres_session: 'session-abc' },
        headers: {},
      } as unknown as Request;
      const issueRes = createMockResponse();
      const token = service.issueToken(issueReq, issueRes.res);
      const cookieCalls = issueRes.cookie.mock.calls as [
        string,
        string,
        unknown,
      ][];
      const issuedCookieValue = cookieCalls[0]?.[1] ?? '';

      // 2. Perform POST with session-def (e.g. post-login session change without refreshing CSRF)
      const postReq = {
        method: 'POST',
        headers: {
          [CSRF_HEADER_NAME]: token,
        },
        cookies: {
          acres_session: 'session-def',
          acres_csrf: issuedCookieValue,
        },
      } as unknown as Request;
      const { res, status, json } = createMockResponse();
      const next = jest.fn();

      service.protection(postReq, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({
        ok: false,
        error: {
          code: CSRF_ERROR_CODE,
          message: CSRF_ERROR_MESSAGE,
        },
      });
    });

    it('forwards non-CSRF unexpected error to next(error) without masking as CSRF failure', () => {
      const config = createMockConfig(false);
      const service = new CsrfService(config);

      // Access private utilities to spy on doubleCsrfProtection
      const internalUtilities = (
        service as unknown as {
          utilities: {
            doubleCsrfProtection: (
              req: unknown,
              res: unknown,
              callback: (err?: unknown) => void,
            ) => void;
          };
        }
      ).utilities;
      const unexpectedError = new Error('Database pool connection timeout');

      jest
        .spyOn(internalUtilities, 'doubleCsrfProtection')
        .mockImplementation(
          (_req: unknown, _res: unknown, callback: (err?: unknown) => void) => {
            callback(unexpectedError);
          },
        );

      const req = {
        method: 'POST',
        headers: {},
        cookies: {},
      } as unknown as Request;
      const { res, status, json } = createMockResponse();
      const next = jest.fn();

      service.protection(req, res, next);

      expect(next).toHaveBeenCalledWith(unexpectedError);
      expect(status).not.toHaveBeenCalled();
      expect(json).not.toHaveBeenCalled();
    });
  });
});
