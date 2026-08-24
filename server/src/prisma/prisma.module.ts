import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantTransactionService } from './tenant-transaction.service';

@Global()
@Module({
  providers: [PrismaService, TenantTransactionService],
  exports: [PrismaService, TenantTransactionService],
})
export class PrismaModule {}
