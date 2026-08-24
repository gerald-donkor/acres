import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { OrganizationContext } from '../organizations/organization-context';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';

export type ReportsTx = Prisma.TransactionClient;

@Injectable()
export class ReportsRepository {
  constructor(private readonly tenants: TenantTransactionService) {}

  organizationScoped<T>(
    organization: OrganizationContext,
    callback: (tx: ReportsTx) => Promise<T>,
  ): Promise<T> {
    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      callback,
      { statementTimeoutMs: 5000 },
    );
  }

  workerScoped<T>(callback: (tx: ReportsTx) => Promise<T>): Promise<T> {
    return this.tenants.workerScoped(callback, { statementTimeoutMs: 10000 });
  }

  listReports(
    tx: ReportsTx,
    organizationId: string,
    visibility: 'all' | 'published' = 'all',
  ) {
    return tx.report.findMany({
      where: {
        organizationId,
        status: visibility === 'published' ? 'published' : { not: 'archived' },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 50,
      include: latestRevisionInclude(visibility),
    });
  }

  findReport(
    tx: ReportsTx,
    organizationId: string,
    reportId: string,
    visibility: 'all' | 'published' = 'all',
  ) {
    return tx.report.findFirst({
      where: {
        id: reportId,
        organizationId,
        status: visibility === 'published' ? 'published' : { not: 'archived' },
      },
      include: latestRevisionInclude(visibility),
    });
  }

  findRevision(tx: ReportsTx, organizationId: string, revisionId: string) {
    return tx.reportRevision.findFirst({
      where: { id: revisionId, organizationId },
      include: revisionInclude(),
    });
  }

  listExports(tx: ReportsTx, organizationId: string) {
    return tx.exportRequest.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
      include: { artifact: true },
    });
  }

  findExport(tx: ReportsTx, organizationId: string, exportId: string) {
    return tx.exportRequest.findFirst({
      where: { id: exportId, organizationId },
      include: { artifact: true },
    });
  }
}

export function revisionInclude() {
  return {
    insights: { orderBy: { position: 'asc' as const } },
    evidence: { orderBy: { position: 'asc' as const } },
  };
}

function latestRevisionInclude(visibility: 'all' | 'published' = 'all') {
  return {
    revisions: {
      where:
        visibility === 'published'
          ? { status: 'published' as const }
          : undefined,
      orderBy: { revisionNumber: 'desc' as const },
      take: 1,
      include: revisionInclude(),
    },
  };
}
