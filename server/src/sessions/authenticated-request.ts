import type { Request } from 'express';
import type { AccountProfile } from '@acres/shared';

export interface SessionContext {
  sessionId: string;
  account: AccountProfile;
  expiresAt: Date;
}

/** What `SessionGuard` and `OptionalSessionGuard` attach to the request. */
export interface RequestWithSession extends Request {
  sessionContext?: SessionContext;
}

export interface AuthenticatedRequest extends Request {
  sessionContext: SessionContext;
}
