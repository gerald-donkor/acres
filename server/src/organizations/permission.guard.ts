import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException } from '../common/api-exception';
import {
  ORGANIZATION_PERMISSION_KEY,
  OrganizationPolicy,
  type OrganizationPermission,
} from './permissions';
import type { RequestWithOrganization } from './organization-context';

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<
      OrganizationPermission | undefined
    >(ORGANIZATION_PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (permission === undefined) return true;

    const request = context
      .switchToHttp()
      .getRequest<RequestWithOrganization>();
    const organization = request.organizationContext;
    if (organization === undefined) {
      throw ApiException.notFound('Organization not found.');
    }

    if (!OrganizationPolicy.has(organization.role, permission)) {
      this.logger.warn(`Permission denied: ${permission}`);
      throw ApiException.forbidden();
    }
    return true;
  }
}
