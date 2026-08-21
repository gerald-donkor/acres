import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AccountProfile } from '@acres/shared';
import { CurrentAccount } from '../sessions/current-account.decorator';
import { SessionGuard } from '../sessions/session.guard';

@Controller('account')
@UseGuards(SessionGuard)
export class AccountsController {
  @Get()
  profile(@CurrentAccount() account: AccountProfile): AccountProfile {
    return account;
  }
}
