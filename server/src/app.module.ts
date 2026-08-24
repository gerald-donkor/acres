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
import { SecurityModule } from './security/security.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [
    AcresConfigModule,
    PrismaModule,
    SecurityModule,
    SessionsModule,
    ScheduleModule.forRoot(),
    HealthModule,
    AccountsModule,
    IdentityModule,
    IdempotencyModule,
    AuthModule,
    RegionsModule,
    FormsModule,
    JobsModule,
    OrganizationsModule,
    AcresGraphqlModule,
  ],
})
export class AppModule {}
