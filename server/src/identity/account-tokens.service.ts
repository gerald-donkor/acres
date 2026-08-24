import { Injectable, Logger } from '@nestjs/common';
import type { AccountTokenPurpose } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AcresConfigService } from '../config/acres-config.service';
import { hashToken, issueRawToken } from '../common/tokens';

@Injectable()
export class AccountTokensService {
  private readonly logger = new Logger(AccountTokensService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AcresConfigService,
  ) {}

  async issue(
    accountId: string,
    purpose: AccountTokenPurpose,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = issueRawToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(
      Date.now() + this.config.accountTokenTtlMinutes * 60 * 1000,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.accountToken.updateMany({
        where: { accountId, purpose, consumedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.accountToken.create({
        data: { accountId, purpose, tokenHash, expiresAt },
      });
    });

    this.logger.log(`Account token issued for purpose ${purpose}`);
    return { token, expiresAt };
  }

  async consume(
    token: string,
    purpose: AccountTokenPurpose,
  ): Promise<{ accountId: string } | null> {
    const tokenHash = hashToken(token);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.accountToken.updateMany({
        where: {
          tokenHash,
          purpose,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (claimed.count !== 1) {
        this.logger.warn(`Account token rejected for purpose ${purpose}`);
        return null;
      }

      const row = await tx.accountToken.findUnique({ where: { tokenHash } });
      if (row === null) {
        this.logger.warn(`Account token rejected for purpose ${purpose}`);
        return null;
      }
      this.logger.log(`Account token consumed for purpose ${purpose}`);
      return { accountId: row.accountId };
    });
  }

  async revoke(
    accountId: string,
    purpose: AccountTokenPurpose,
  ): Promise<number> {
    const { count } = await this.prisma.accountToken.updateMany({
      where: { accountId, purpose, consumedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.logger.log(`Account tokens revoked for purpose ${purpose}`);
    return count;
  }
}
