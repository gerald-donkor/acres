import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { SessionProfile } from '@acres/shared';
import { CsrfService } from '../security/csrf.service';
import { StrictThrottle } from '../security/strict-throttle.decorator';
import { OptionalSessionGuard, SessionGuard } from '../sessions/session.guard';
import { SessionsService } from '../sessions/sessions.service';
import type {
  AuthenticatedRequest,
  RequestWithSession,
} from '../sessions/authenticated-request';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterAccountDto } from './dto/register-account.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly csrf: CsrfService,
  ) {}

  /**
   * Hands out the CSRF token the mutation routes require in `x-csrf-token`.
   * Not in the original route table — a double-submit defence is unusable
   * without a way for the client to read the token.
   */
  @Get('csrf')
  csrfToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): { csrfToken: string; headerName: 'x-csrf-token' } {
    return {
      csrfToken: this.csrf.issueToken(request, response),
      headerName: 'x-csrf-token',
    };
  }

  @Post('register')
  @StrictThrottle()
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() body: RegisterAccountDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionProfile> {
    const started = await this.auth.register(body);
    this.sessions.writeCookie(response, started.token, started.expiresAt);
    return started.profile;
  }

  @Post('login')
  @StrictThrottle()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionProfile> {
    const started = await this.auth.login(body);
    this.sessions.writeCookie(response, started.token, started.expiresAt);
    return started.profile;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ signedOut: true }> {
    await this.auth.logout(request.sessionContext.sessionId);
    this.sessions.clearCookie(response);
    return { signedOut: true };
  }

  /**
   * Also clears a cookie that no longer resolves to a session. Leaving an
   * expired or revoked token in the browser means it is re-sent on every
   * request for the rest of its 30-day lifetime.
   */
  @Get('session')
  @UseGuards(OptionalSessionGuard)
  session(
    @Req() request: RequestWithSession,
    @Res({ passthrough: true }) response: Response,
  ): SessionProfile {
    if (
      request.sessionContext === undefined &&
      this.hasSessionCookie(request)
    ) {
      this.sessions.clearCookie(response);
    }
    return this.auth.describe(request.sessionContext);
  }

  private hasSessionCookie(request: Request): boolean {
    const cookies = request.cookies as Record<string, string> | undefined;
    return typeof cookies?.[this.sessions.cookieName] === 'string';
  }
}
