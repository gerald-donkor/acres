import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AcresConfigModule } from '../config/config.module';
import { AccountTokensService } from './account-tokens.service';

@Module({
  imports: [PrismaModule, AcresConfigModule],
  providers: [AccountTokensService],
  exports: [AccountTokensService],
})
export class IdentityModule {}
