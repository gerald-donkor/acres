import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountTokensService } from './account-tokens.service';

@Module({
  imports: [PrismaModule],
  providers: [AccountTokensService],
  exports: [AccountTokensService],
})
export class IdentityModule {}
