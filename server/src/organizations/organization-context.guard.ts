import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiException } from '../common/api-exception';
import type { AuthenticatedRequest } from '../sessions/authenticated-request';
import { AcresConfigService } from '../config/acres-config.service';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';
import type { RequestWithOrganization } from './organization-context';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class OrganizationContextGuard implements CanActivate {
  private readonly logger = new Logger(OrganizationContextGuard.name);

  constructor(
    private readonly tenants: TenantTransactionService,
    private readonly config: AcresConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.tenancyEnabled) {
      throw ApiException.notReady();
    }

    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & RequestWithOrganization>();
    const organizationId = this.organizationIdFrom(request);
    if (organizationId === null) {
      this.logger.warn('Tenant context rejected: missing or invalid id');
      throw ApiException.notFound('Organization not found.');
    }

    const accountId = request.sessionContext.account.id;
    const membership = await this.tenants.accountScoped(accountId, (tx) =>
      tx.membership.findFirst({
        where: { organizationId, accountId, revokedAt: null },
      }),
    );

    if (membership === null) {
      this.logger.warn('Tenant context rejected: no active membership');
      throw ApiException.notFound('Organization not found.');
    }

    request.organizationContext = {
      organizationId,
      accountId,
      membershipId: membership.id,
      role: membership.role,
    };
    return true;
  }

  private organizationIdFrom(request: Request): string | null {
    const paramValue = request.params.organizationId;
    const param = Array.isArray(paramValue) ? undefined : paramValue;
    const header = request.header('x-acres-organization-id');
    const fromHeader = header?.trim();

    if (
      param !== undefined &&
      fromHeader !== undefined &&
      param !== fromHeader
    ) {
      return null;
    }

    const value = param ?? fromHeader;
    if (value === undefined || !UUID_RE.test(value)) {
      return null;
    }
    return value;
  }
}
