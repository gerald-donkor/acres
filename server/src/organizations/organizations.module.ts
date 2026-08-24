import { Module } from '@nestjs/common';
import { AcresConfigModule } from '../config/config.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OrganizationsController } from './organizations.controller';
import { AuditService } from './audit.service';
import { OrganizationContextGuard } from './organization-context.guard';
import { OrganizationsService } from './organizations.service';
import { PermissionGuard } from './permission.guard';

@Module({
  imports: [AcresConfigModule, IdempotencyModule, PrismaModule],
  controllers: [OrganizationsController],
  providers: [
    AuditService,
    OrganizationContextGuard,
    OrganizationsService,
    PermissionGuard,
  ],
  exports: [OrganizationContextGuard, OrganizationsService, PermissionGuard],
})
export class OrganizationsModule {}
