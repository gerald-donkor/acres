import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import { AcresConfigService } from '../config/acres-config.service';
import { SessionsService } from './sessions.service';
import type { RequestWithSession } from './authenticated-request';

async function attachSession(
  context: ExecutionContext,
  sessions: SessionsService,
  cookieName: string,
): Promise<boolean> {
  const request = context.switchToHttp().getRequest<RequestWithSession>();
  const token = (request.cookies as Record<string, string> | undefined)?.[
    cookieName
  ];

  if (typeof token !== 'string' || token.length === 0) {
    return false;
  }

  const session = await sessions.resolve(token);
  if (session === null) {
    return false;
  }

  request.sessionContext = session;
  return true;
}

/** Rejects the request when there is no usable session. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionsService,
    private readonly config: AcresConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = await attachSession(
      context,
      this.sessions,
      this.config.sessionCookieName,
    );
    if (!authenticated) {
      throw ApiException.unauthenticated();
    }
    return true;
  }
}

/** Attaches a session when one exists, and always allows the request. */
@Injectable()
export class OptionalSessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionsService,
    private readonly config: AcresConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await attachSession(context, this.sessions, this.config.sessionCookieName);
    return true;
  }
}
