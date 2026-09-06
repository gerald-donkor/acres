import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { IdentityModule } from '../identity/identity.module';
import { MailModule } from '../mail/mail.module';
import { AcresConfigModule } from '../config/config.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [AccountsModule, IdentityModule, MailModule, AcresConfigModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
