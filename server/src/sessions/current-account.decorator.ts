import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AccountProfile } from '@acres/shared';
import { ApiException } from '../common/api-exception';
import type { RequestWithSession } from './authenticated-request';

export function getAccountFromContext(
  _data: unknown,
  context: ExecutionContext,
): AccountProfile {
  const request = context.switchToHttp().getRequest<RequestWithSession>();
  if (request.sessionContext === undefined) {
    throw ApiException.unauthenticated();
  }
  return request.sessionContext.account;
}

/** The account behind `SessionGuard`. Throws if used without the guard. */
export const CurrentAccount = createParamDecorator(getAccountFromContext);
