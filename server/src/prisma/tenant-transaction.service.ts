import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from './prisma.service';

export type TenantTransactionClient = Prisma.TransactionClient;

@Injectable()
export class TenantTransactionService {
  constructor(private readonly prisma: PrismaService) {}

  accountScoped<T>(
    accountId: string,
    callback: (tx: TenantTransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await this.setContext(tx, accountId, '', '');
      return callback(tx);
    });
  }

  organizationScoped<T>(
    accountId: string,
    organizationId: string,
    callback: (tx: TenantTransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await this.setContext(tx, accountId, organizationId, '');
      return callback(tx);
    });
  }

  invitationScoped<T>(
    accountId: string,
    invitationTokenHash: string,
    callback: (tx: TenantTransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await this.setContext(tx, accountId, '', invitationTokenHash);
      return callback(tx);
    });
  }

  private async setContext(
    tx: TenantTransactionClient,
    accountId: string,
    organizationId: string,
    invitationTokenHash: string,
  ): Promise<void> {
    await tx.$executeRaw`
      SELECT
        set_config('acres.account_id', ${accountId}, true),
        set_config('acres.organization_id', ${organizationId}, true),
        set_config('acres.invitation_token_hash', ${invitationTokenHash}, true)
    `;
  }
}
