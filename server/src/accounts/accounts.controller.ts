import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AccountProfile } from '@acres/shared';
import {
  accountSchema,
  ApiEnvelope,
  ApiSessionAuth,
} from '../contracts/openapi';
import { CurrentAccount } from '../sessions/current-account.decorator';
import { SessionGuard } from '../sessions/session.guard';

@Controller({ path: 'account', version: '1' })
@UseGuards(SessionGuard)
@ApiTags('account')
@ApiSessionAuth()
export class AccountsController {
  @Get()
  @ApiEnvelope({
    summary: 'Get current account',
    description: 'Returns the authenticated account profile.',
    data: accountSchema,
  })
  profile(@CurrentAccount() account: AccountProfile): AccountProfile {
    return account;
  }
}
