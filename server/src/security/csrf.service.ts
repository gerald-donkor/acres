import { Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { doubleCsrf, type DoubleCsrfUtilities } from 'csrf-csrf';
import type { ApiError } from '@acres/shared';
import { AcresConfigService } from '../config/acres-config.service';

/**
 * Double-submit CSRF for the cookie-authenticated mutation routes.
 *
 * Session auth rides on a cookie, so the browser attaches it to a cross-site
 * form post automatically; `SameSite=Lax` blocks most of that, and this is the
 * defence that does not depend on the browser honouring it. Safe methods are
 * exempt, so `GET /auth/csrf` can hand the token out.
 *
 * `getSessionIdentifier` binds the token to the session cookie's value. That
 * value changes on login, so a client must re-read `GET /auth/csrf` after
 * `POST /auth/login` before its next mutation.
 */
@Injectable()
export class CsrfService {
  private readonly utilities: DoubleCsrfUtilities;

  constructor(private readonly config: AcresConfigService) {
    this.utilities = doubleCsrf({
      getSecret: () => this.config.sessionSecret,
      getSessionIdentifier: (request: Request) =>
        (request.cookies as Record<string, string> | undefined)?.[
          this.config.sessionCookieName
        ] ?? '',
      cookieName: csrfCookieName(
        this.config.csrfCookieName,
        this.config.isProduction,
      ),
      cookieOptions: {
        sameSite: 'lax',
        path: '/',
        secure: this.config.isProduction,
        httpOnly: true,
      },
      getCsrfTokenFromRequest: (request: Request) =>
        request.headers['x-csrf-token'],
      errorConfig: {
        statusCode: 403,
        message: 'CSRF token missing or invalid.',
        code: 'CSRF_INVALID',
      },
    });
  }

  /**
   * Express middleware, registered globally in `main.ts`.
   *
   * It is wrapped because the library rejects by calling `next(error)`, which
   * lands in Express's default handler and returns an HTML 403 — outside
   * Nest's exception filter, and so outside the `ApiError` envelope every
   * other failure uses. The wrapper answers in the envelope instead.
   */
  get protection(): (
    request: Request,
    response: Response,
    next: NextFunction,
  ) => void {
    const protect = this.utilities.doubleCsrfProtection;
    return (request, response, next) => {
      const invalid = this.utilities.invalidCsrfTokenError;
      protect(request, response, (error?: unknown) => {
        if (error === undefined || error === null) {
          next();
          return;
        }
        // Only the library's own rejection becomes CSRF_INVALID. Reporting an
        // unrelated forwarded error as a CSRF failure would misdirect whoever
        // debugs it after a library upgrade.
        if (error !== invalid) {
          next(error);
          return;
        }
        response.status(403).json({
          ok: false,
          error: {
            code: 'CSRF_INVALID',
            message: 'CSRF token missing or invalid.',
          },
        } satisfies ApiError);
      });
    };
  }

  /**
   * Issues a token and sets its paired cookie on the response.
   *
   * The library's defaults are correct here and are left alone. Re-issuing
   * re-validates any existing cookie against the *current* session identifier
   * (`validateCsrfTokenCookie` → `constructMessage` → `getSessionIdentifier`),
   * and mints a fresh token when that fails — which is exactly what has to
   * happen after login changes the session cookie. `validateOnReuse` defaults
   * to `false`, so that failure never throws. Forcing `overwrite` would only
   * invalidate a second tab's in-flight token for no gain.
   */
  issueToken(request: Request, response: Response): string {
    return this.utilities.generateCsrfToken(request, response);
  }
}

/**
 * `__Host-` locks the cookie to this exact origin, so a sibling subdomain
 * cannot toss a replacement in. The browser only accepts the prefix on a
 * `Secure` cookie, so it can only be applied where the cookie is secure —
 * local http development keeps the plain name.
 */
function csrfCookieName(configured: string, secure: boolean): string {
  return secure ? `__Host-${configured}` : configured;
}
