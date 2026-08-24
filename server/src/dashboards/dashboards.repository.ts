import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { OrganizationContext } from '../organizations/organization-context';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';

export type DashboardTx = Prisma.TransactionClient;

@Injectable()
export class DashboardsRepository {
  constructor(private readonly tenants: TenantTransactionService) {}

  organizationScoped<T>(
    organization: OrganizationContext,
    callback: (tx: DashboardTx) => Promise<T>,
  ): Promise<T> {
    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      callback,
      { statementTimeoutMs: 5000 },
    );
  }

  listViews(tx: DashboardTx, organizationId: string) {
    return tx.dashboardView.findMany({
      where: { organizationId, status: 'active' },
      orderBy: [{ updatedAt: 'desc' }],
      take: 50,
    });
  }

  findView(tx: DashboardTx, organizationId: string, viewId: string) {
    return tx.dashboardView.findFirst({
      where: { id: viewId, organizationId, status: 'active' },
    });
  }
}
