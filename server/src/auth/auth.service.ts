import { Injectable, Logger } from '@nestjs/common';
import {
  ANONYMOUS_SESSION,
  type ForgotPasswordInput,
  type ForgotPasswordResult,
  type LoginInput,
  type RegisterAccountInput,
  type ResetPasswordInput,
  type ResetPasswordResult,
  type SessionProfile,
} from '@acres/shared';
import { AccountTokenPurpose } from '../generated/prisma/enums';
import { AccountsService } from '../accounts/accounts.service';
import { ApiException } from '../common/api-exception';
import { SessionsService } from '../sessions/sessions.service';
import { AccountTokensService } from '../identity/account-tokens.service';
import { MailService } from '../mail/mail.service';
import { AcresConfigService } from '../config/acres-config.service';
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
    private readonly accountTokens: AccountTokensService,
    private readonly mail: MailService,
    private readonly config: AcresConfigService,
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

  /**
   * Dispatches a single-use password recovery email when an account exists.
   * Runs dummy comparison on missing account to preserve bounded constant-time
   * response and prevent account enumeration.
   */
  async forgotPassword(
    input: ForgotPasswordInput,
  ): Promise<ForgotPasswordResult> {
    const account = await this.accounts.findByEmail(input.email);
    if (account === null) {
      await this.accounts.verifyPassword(null, 'dummy-password-check');
      return { accepted: true };
    }

    const { token } = await this.accountTokens.issue(
      account.id,
      AccountTokenPurpose.password_recovery,
    );

    const resetUrl = `${this.config.clientOrigin}/reset-password?token=${encodeURIComponent(token)}`;
    try {
      await this.mail.sendPasswordRecoveryEmail(account.email, resetUrl);
    } catch (error) {
      this.logger.error(
        `Failed to dispatch password recovery email: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { accepted: true };
  }

  /**
   * Consumes single-use token, updates password hash, and invalidates all
   * active sessions for that account (TM-03 session fixation / theft defense).
   */
  async resetPassword(input: ResetPasswordInput): Promise<ResetPasswordResult> {
    const consumed = await this.accountTokens.consume(
      input.token,
      AccountTokenPurpose.password_recovery,
    );
    if (consumed === null) {
      throw ApiException.invalidOrExpiredToken();
    }

    await this.accounts.updatePassword(consumed.accountId, input.password);
    await this.sessions.revokeAllForAccount(consumed.accountId);
    await this.accountTokens.revoke(
      consumed.accountId,
      AccountTokenPurpose.password_recovery,
    );

    return { reset: true };
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
