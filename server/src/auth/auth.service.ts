import { Injectable, Logger } from '@nestjs/common';
import {
  ANONYMOUS_SESSION,
  type LoginInput,
  type RegisterAccountInput,
  type SessionProfile,
} from '@acres/shared';
import { AccountsService } from '../accounts/accounts.service';
import { ApiException } from '../common/api-exception';
import { SessionsService } from '../sessions/sessions.service';
import type { SessionContext } from '../sessions/authenticated-request';

export interface StartedSession {
  profile: SessionProfile;
  token: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly accounts: AccountsService,
    private readonly sessions: SessionsService,
  ) {}

  /**
   * Registration and login fail identically. An account that already exists
   * must not be distinguishable from a wrong password — the alternative leaks
   * the customer list to anyone who can post to `/auth/register`.
   */
  async register(input: RegisterAccountInput): Promise<StartedSession> {
    const existing = await this.accounts.findByEmail(input.email);
    if (existing !== null) {
      this.logger.warn('Registration attempted on an existing email');
      throw ApiException.invalidCredentials();
    }

    const account = await this.accounts.create(input);
    return this.startSession(account.id, this.accounts.toProfile(account));
  }

  async login(input: LoginInput): Promise<StartedSession> {
    const account = await this.accounts.findByEmail(input.email);
    const valid = await this.accounts.verifyPassword(account, input.password);
    if (!valid || account === null) {
      throw ApiException.invalidCredentials();
    }

    return this.startSession(account.id, this.accounts.toProfile(account));
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId);
  }

  describe(session: SessionContext | undefined): SessionProfile {
    if (session === undefined) {
      return ANONYMOUS_SESSION;
    }
    return {
      authenticated: true,
      account: session.account,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  private async startSession(
    accountId: string,
    account: StartedSession['profile']['account'],
  ): Promise<StartedSession> {
    const { token, expiresAt } = await this.sessions.issue(accountId);
    return {
      profile: {
        authenticated: true,
        account,
        expiresAt: expiresAt.toISOString(),
      },
      token,
      expiresAt,
    };
  }
}
