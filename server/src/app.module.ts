import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountsModule } from './accounts/accounts.module';
import { AuthModule } from './auth/auth.module';
import { AcresConfigModule } from './config/config.module';
import { FormsModule } from './forms/forms.module';
import { AcresGraphqlModule } from './graphql/graphql.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { JobsModule } from './jobs/jobs.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { RegionsModule } from './regions/regions.module';
import { GeographyModule } from './geography/geography.module';
import { SecurityModule } from './security/security.module';
import { SessionsModule } from './sessions/sessions.module';
import { StorageModule } from './storage/storage.module';
import { OutboxModule } from './outbox/outbox.module';
import { UploadsModule } from './uploads/uploads.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { MetricsModule } from './metrics/metrics.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { ReportsModule } from './reports/reports.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    AcresConfigModule,
    PrismaModule,
    SecurityModule,
    SessionsModule,
    ScheduleModule.forRoot(),
    HealthModule,
    MetricsModule,
    AccountsModule,
    IdentityModule,
    IdempotencyModule,
    StorageModule,
    OutboxModule,
    AuthModule,
    RegionsModule,
    GeographyModule,
    FormsModule,
    JobsModule,
    OrganizationsModule,
    UploadsModule,
    IngestionModule,
    AnalyticsModule,
    DashboardsModule,
    ReportsModule,
    AiModule,
    AcresGraphqlModule,
  ],
})
export class AppModule {}
