import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AccountProfile } from '@acres/shared';
import { ApiException } from '../common/api-exception';
import type { RequestWithSession } from './authenticated-request';

/** The account behind `SessionGuard`. Throws if used without the guard. */
export const CurrentAccount = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccountProfile => {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    if (request.sessionContext === undefined) {
      throw ApiException.unauthenticated();
    }
    return request.sessionContext.account;
  },
);
