import { Module } from '@nestjs/common';
import { AcresConfigModule } from '../config/config.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SecurityModule } from '../security/security.module';
import { SessionsModule } from '../sessions/sessions.module';
import { GeminiDraftAdapter } from './adapters/gemini-draft.adapter';
import { AI_DRAFT_PROVIDER } from './ai.port';
import { AiService } from './ai.service';
import { AiDraftController } from './ai-draft.controller';

@Module({
  imports: [
    AcresConfigModule,
    PrismaModule,
    SecurityModule,
    SessionsModule,
    OrganizationsModule,
    IdempotencyModule,
  ],
  controllers: [AiDraftController],
  providers: [
    AiService,
    {
      provide: AI_DRAFT_PROVIDER,
      useClass: GeminiDraftAdapter,
    },
  ],
  exports: [AiService, AI_DRAFT_PROVIDER],
})
export class AiModule {}
