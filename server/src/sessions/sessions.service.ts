import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AcresConfigService } from '../config/acres-config.service';
import { RETENTION_PURGE_BATCH_LIMIT } from '../jobs/retention-maintenance.job';
import { toAccountProfile } from '../accounts/account-profile';
import type { SessionContext } from './authenticated-request';
import { hashToken, issueRawToken } from '../common/tokens';

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AcresConfigService,
  ) {}

  /**
   * Issues a session and returns the raw token. The raw token exists here, in
   * the cookie, and nowhere else — only its SHA-256 digest is stored.
   */
  async issue(accountId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = issueRawToken();
    const expiresAt = new Date(
      Date.now() + this.config.sessionTtlDays * 24 * 60 * 60 * 1000,
    );

    await this.prisma.session.create({
      data: { accountId, tokenHash: hashToken(token), expiresAt },
    });

    return { token, expiresAt };
  }

  /** Resolves a raw token to its session, or null when it is not usable. */
  async resolve(
    token: string,
    options: { statementTimeoutMs?: number } = {},
  ): Promise<SessionContext | null> {
    const session = await this.withOptionalStatementTimeout(
      options.statementTimeoutMs,
      (client) =>
        client.session.findUnique({
          where: { tokenHash: hashToken(token) },
          include: { account: true },
        }),
    );

    if (
      session === null ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      return null;
    }

    return {
      sessionId: session.id,
      account: toAccountProfile(session.account),
      expiresAt: session.expiresAt,
    };
  }

  /** Revocation is server-side, which is the whole point of opaque tokens. */
  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForAccount(accountId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { accountId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result?.count ?? 0;
  }

  /**
   * Deletes rows that can no longer authenticate anything: expired **or**
   * revoked. Leaving revoked-but-unexpired rows behind would keep dead
   * sessions for the full TTL and make the job's name untrue.
   *
   * `before` applies to the expiry arm only — a revoked row is dead the moment
   * it is revoked, whatever cutoff is passed. Postgres cannot index across the
   * `OR`, so this is a sequential scan; at the scale this table will reach
   * before the next backend prompt, that is cheaper than the alternatives.
   *
   * Each tick reclaims at most `RETENTION_PURGE_BATCH_LIMIT` rows,
   * oldest `expiresAt` first, so a backlog drains across ticks instead of in
   * one statement. Revoked-but-unexpired rows sort after expired rows under
   * that key — still bounded, still drains, same predicate, no row left
   * behind forever.
   */
  async purgeExpired(before: Date = new Date()): Promise<number> {
    const expired = await this.prisma.session.findMany({
      where: {
        OR: [{ expiresAt: { lt: before } }, { revokedAt: { not: null } }],
      },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: RETENTION_PURGE_BATCH_LIMIT,
    });
    if (expired.length === 0) return 0;
    const { count } = await this.prisma.session.deleteMany({
      where: { id: { in: expired.map((row) => row.id) } },
    });
    return count;
  }

  /** The cookie the session token rides in. */
  get cookieName(): string {
    return this.config.sessionCookieName;
  }

  writeCookie(response: Response, token: string, expiresAt: Date): void {
    response.cookie(this.config.sessionCookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.isProduction,
      path: '/',
      expires: expiresAt,
    });
  }

  clearCookie(response: Response): void {
    response.clearCookie(this.config.sessionCookieName, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.isProduction,
      path: '/',
    });
  }

  private withOptionalStatementTimeout<T>(
    statementTimeoutMs: number | undefined,
    callback: (client: Prisma.TransactionClient | PrismaService) => Promise<T>,
  ): Promise<T> {
    if (statementTimeoutMs === undefined) return callback(this.prisma);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config(
          'statement_timeout',
          ${String(statementTimeoutMs)},
          true
        )
      `;
      return callback(tx);
    });
  }
}
