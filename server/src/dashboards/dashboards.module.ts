import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { DashboardsController } from './dashboards.controller';
import { DashboardsRepository } from './dashboards.repository';
import { DashboardsService } from './dashboards.service';

@Module({
  imports: [AnalyticsModule, IdempotencyModule],
  controllers: [DashboardsController],
  providers: [DashboardsRepository, DashboardsService],
  exports: [DashboardsService],
})
export class DashboardsModule {}
