import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type {
  OrganizationContext,
  RequestWithOrganization,
} from './organization-context';

export function getOrganizationFromContext(
  _data: unknown,
  ctx: ExecutionContext,
): OrganizationContext {
  const request = ctx.switchToHttp().getRequest<RequestWithOrganization>();
  if (request.organizationContext === undefined) {
    throw new Error('Organization context was not resolved');
  }
  return request.organizationContext;
}

export const CurrentOrganization = createParamDecorator(
  getOrganizationFromContext,
);
